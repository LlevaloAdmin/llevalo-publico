"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = require("crypto");
const promises_1 = __importDefault(require("dns/promises"));
const db_1 = require("../db");
const config_1 = require("../config");
const auth_1 = require("../middleware/auth");
const rateLimits_1 = require("../middleware/rateLimits");
const activity_1 = require("../utils/activity");
const authSessions_1 = require("../utils/authSessions");
const authToken_1 = require("../utils/authToken");
const email_1 = require("../utils/email");
const registrationIdentity_1 = require("../utils/registrationIdentity");
const secureTokens_1 = require("../utils/secureTokens");
const router = (0, express_1.Router)();
const emitirTokenAcceso = async (id, rol, rolBase, esAdmin, sessionId = (0, crypto_1.randomUUID)()) => {
    const token = jsonwebtoken_1.default.sign({ id, rol, rol_base: rolBase, es_admin: esAdmin, jti: sessionId }, config_1.JWT_SECRET, {
        algorithm: 'HS256',
        audience: authToken_1.JWT_AUDIENCE,
        expiresIn: 7 * 24 * 60 * 60,
        issuer: authToken_1.JWT_ISSUER
    });
    const payload = jsonwebtoken_1.default.decode(token);
    if (typeof payload === 'string' || !payload || typeof payload.exp !== 'number') {
        throw new Error('No se pudo determinar la expiración de la sesión.');
    }
    await (0, authSessions_1.guardarSesionAutenticada)(sessionId, id, new Date(payload.exp * 1000));
    return token;
};
let profileColumnsReady = null;
let onboardingTablesReady = null;
let onboardingCleanupDay = '';
let onboardingCleanupPromise = null;
const ensureProfileColumns = () => {
    if (!profileColumnsReady) {
        profileColumnsReady = db_1.pool.query(`
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cedula VARCHAR(30);
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS foto TEXT;
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS vehiculo VARCHAR(100);
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS placa VARCHAR(30);
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS vehiculo_foto TEXT;
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS calificacion NUMERIC(3,2) DEFAULT 5.0;
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS es_admin BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS correo_verificado BOOLEAN NOT NULL DEFAULT TRUE;
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS telefono_verificado BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS correo_verificacion_creado_en TIMESTAMPTZ;
    `).then(() => undefined).catch((error) => {
            profileColumnsReady = null;
            console.error('Error preparando los datos de perfil:', error);
            throw error;
        });
    }
    return profileColumnsReady;
};
const ensureOnboardingTables = async () => {
    await ensureProfileColumns();
    if (!onboardingTablesReady) {
        onboardingTablesReady = db_1.pool.query(`
      CREATE TABLE IF NOT EXISTS postulaciones_repartidor (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(120) NOT NULL,
        email VARCHAR(254) NOT NULL,
        telefono VARCHAR(30) NOT NULL,
        cedula VARCHAR(30) NOT NULL,
        vehiculo VARCHAR(100) NOT NULL,
        placa VARCHAR(30) NOT NULL,
        estado VARCHAR(30) NOT NULL DEFAULT 'pendiente_correo'
          CHECK (estado IN ('pendiente_correo', 'pendiente_revision', 'aprobada', 'rechazada', 'cuenta_creada')),
        correo_verificado BOOLEAN NOT NULL DEFAULT FALSE,
        telefono_verificado BOOLEAN NOT NULL DEFAULT FALSE,
        creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        revisado_por INTEGER REFERENCES usuarios(id),
        revisado_en TIMESTAMPTZ,
        motivo_rechazo VARCHAR(500)
      );
      CREATE INDEX IF NOT EXISTS postulaciones_repartidor_email_idx
        ON postulaciones_repartidor (lower(email));
      CREATE INDEX IF NOT EXISTS postulaciones_repartidor_estado_idx
        ON postulaciones_repartidor (estado, creado_en);
      CREATE TABLE IF NOT EXISTS auth_action_tokens (
        id BIGSERIAL PRIMARY KEY,
        purpose VARCHAR(30) NOT NULL
          CHECK (purpose IN ('verificar_correo', 'activar_repartidor')),
        user_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
        application_id INTEGER REFERENCES postulaciones_repartidor(id) ON DELETE CASCADE,
        token_hash CHAR(64) NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        used_at TIMESTAMPTZ,
        attempts INTEGER NOT NULL DEFAULT 0,
        CHECK (
          (purpose = 'verificar_correo' AND ((user_id IS NOT NULL) <> (application_id IS NOT NULL)))
          OR (purpose = 'activar_repartidor' AND user_id IS NULL AND application_id IS NOT NULL)
        )
      );
      ALTER TABLE postulaciones_repartidor
        ADD COLUMN IF NOT EXISTS telefono_verificado BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE auth_action_tokens
        ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;
      CREATE INDEX IF NOT EXISTS auth_action_tokens_user_idx
        ON auth_action_tokens (user_id, purpose, expires_at);
      CREATE INDEX IF NOT EXISTS auth_action_tokens_application_idx
        ON auth_action_tokens (application_id, purpose, expires_at);
    `).then(() => undefined).catch((error) => {
            onboardingTablesReady = null;
            console.error('Error preparando postulaciones y verificaciones de correo:', error);
            throw error;
        });
    }
    await onboardingTablesReady;
    const cleanupDay = new Date().toISOString().slice(0, 10);
    if (onboardingCleanupDay !== cleanupDay) {
        if (!onboardingCleanupPromise) {
            onboardingCleanupPromise = db_1.pool.query(`
        DELETE FROM postulaciones_repartidor
        WHERE (estado = 'rechazada' AND revisado_en < CURRENT_TIMESTAMP - INTERVAL '90 days')
           OR (estado = 'pendiente_correo' AND creado_en < CURRENT_TIMESTAMP - INTERVAL '30 days')
      `).then(() => {
                return db_1.pool.query(`
          DELETE FROM usuarios
          WHERE rol = 'cliente' AND correo_verificado = FALSE
            AND correo_verificacion_creado_en < CURRENT_TIMESTAMP - INTERVAL '30 days'
        `);
            }).then(() => {
                onboardingCleanupDay = cleanupDay;
            }).catch((error) => {
                console.error('Error aplicando retención de postulaciones antiguas:', error);
                throw error;
            });
        }
        try {
            await onboardingCleanupPromise;
        }
        finally {
            onboardingCleanupPromise = null;
        }
    }
};
const crearTokenAccion = async (client, purpose, token, userId, applicationId, options = {}) => {
    await client.query(`UPDATE auth_action_tokens SET used_at = CURRENT_TIMESTAMP
     WHERE purpose = $1 AND used_at IS NULL
       AND (($2::integer IS NOT NULL AND user_id = $2) OR ($3::integer IS NOT NULL AND application_id = $3))`, [purpose, userId, applicationId]);
    await client.query(`INSERT INTO auth_action_tokens (purpose, user_id, application_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP + ($5 * INTERVAL '1 minute'))`, [purpose, userId, applicationId, options.tokenHash || (0, secureTokens_1.hashTokenSeguro)(token), options.expiresInMinutes || 30]);
};
const usuarioPublico = (user) => ({
    id: user.id,
    nombre: user.nombre,
    email: user.email,
    telefono: user.telefono || '',
    rol: user.rol,
    cedula: user.cedula || '',
    foto: user.foto || '',
    vehiculo: user.vehiculo || '',
    placa: user.placa || '',
    vehiculo_foto: user.vehiculo_foto || '',
    calificacion: user.calificacion === null || user.calificacion === undefined
        ? undefined
        : Number(user.calificacion),
    es_admin: user.es_admin === true,
    correo_verificado: user.correo_verificado === true,
    telefono_verificado: user.telefono_verificado === true
});
const correoValido = (email) => typeof email === 'string' && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
const telefonoValido = (telefono) => typeof telefono === 'string' && /^[+0-9()\-\s]{7,30}$/.test(telefono.trim())
    && telefono.replace(/\D/g, '').length >= 7 && telefono.replace(/\D/g, '').length <= 15;
const cedulaValida = (cedula) => typeof cedula === 'string' && /^[VE]-\d{5,10}$/i.test(cedula.trim());
const telefonoNormalizadoSql = (column) => {
    const digits = `regexp_replace(COALESCE(${column}, ''), '[^0-9]', '', 'g')`;
    const internationalDigits = `CASE WHEN left(${digits}, 2) = '00' THEN substring(${digits} from 3) ELSE ${digits} END`;
    return `CASE
    WHEN length(${internationalDigits}) = 12 AND left(${internationalDigits}, 2) = '58' THEN ${internationalDigits}
    WHEN length(${internationalDigits}) = 11 AND left(${internationalDigits}, 1) = '0' THEN '58' || substring(${internationalDigits} from 2)
    WHEN length(${internationalDigits}) = 10 THEN '58' || ${internationalDigits}
    ELSE ${internationalDigits}
  END`;
};
const cedulaNormalizadaSql = (column) => `upper(regexp_replace(COALESCE(${column}, ''), '[^VE0-9]', '', 'g'))`;
const bloquearIdentificadores = async (client, email, telefono, cedula) => {
    const lockKeys = [
        `email:${email}`,
        `telefono:${(0, registrationIdentity_1.normalizarTelefonoRegistro)(telefono)}`,
        `cedula:${(0, registrationIdentity_1.normalizarCedulaRegistro)(cedula)}`
    ].sort();
    for (const key of lockKeys) {
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [key]);
    }
};
const buscarIdentificadoresDuplicados = async (client, email, telefono, cedula, excluirPostulacionId = null) => {
    const phoneSql = telefonoNormalizadoSql('telefono');
    const cedulaSql = cedulaNormalizadaSql('cedula');
    const result = await client.query(`SELECT
       EXISTS (
         SELECT 1 FROM usuarios
         WHERE lower(btrim(email)) = $1 OR ${phoneSql} = $2 OR ${cedulaSql} = $3
       ) AS usuario,
       EXISTS (
         SELECT 1 FROM postulaciones_repartidor
         WHERE estado <> 'rechazada'
           AND ($4::integer IS NULL OR id <> $4)
           AND (lower(btrim(email)) = $1 OR ${phoneSql} = $2 OR ${cedulaSql} = $3)
       ) AS postulacion`, [email, (0, registrationIdentity_1.normalizarTelefonoRegistro)(telefono), (0, registrationIdentity_1.normalizarCedulaRegistro)(cedula), excluirPostulacionId]);
    return result.rows[0];
};
const mensajeDuplicado = (tipo) => tipo === 'usuario'
    ? 'El correo, teléfono o cédula ya está registrado en otra cuenta.'
    : 'El correo, teléfono o cédula ya está asociado a una postulación activa.';
const contrasenaValida = (password) => typeof password === 'string' && password.length >= 8 && password.length <= 128
    && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
const validarDominioCorreo = async (email) => {
    const dominio = email.split('@')[1];
    try {
        const registros = await promises_1.default.resolveMx(dominio);
        return registros.length > 0;
    }
    catch {
        return false;
    }
};
router.post('/register', rateLimits_1.emisionCorreoRateLimit, async (req, res) => {
    const { nombre, email, telefono, cedula, password } = req.body ?? {};
    if (typeof nombre !== 'string' || !nombre.trim() || nombre.trim().length > 120
        || !correoValido(email) || !telefonoValido(telefono) || !cedulaValida(cedula) || !contrasenaValida(password)
        || (req.body?.rol !== undefined && req.body.rol !== 'cliente')) {
        return res.status(400).json({ error: 'Revisa el nombre, correo, teléfono, cédula y contraseña. El registro directo es solo para clientes.' });
    }
    const emailNormalizado = email.trim().toLowerCase();
    const cedulaNormalizada = `${cedula.trim()[0].toUpperCase()}-${cedula.trim().slice(2)}`;
    if (!await validarDominioCorreo(emailNormalizado)) {
        return res.status(400).json({ error: 'El dominio de este correo no parece poder recibir mensajes.' });
    }
    const client = await db_1.pool.connect();
    let userId = 0;
    try {
        await ensureOnboardingTables();
        const passwordHash = await bcryptjs_1.default.hash(password, 10);
        await client.query('BEGIN');
        await bloquearIdentificadores(client, emailNormalizado, telefono, cedulaNormalizada);
        const duplicados = await buscarIdentificadoresDuplicados(client, emailNormalizado, telefono, cedulaNormalizada);
        if (duplicados.usuario) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: mensajeDuplicado('usuario') });
        }
        if (duplicados.postulacion) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: mensajeDuplicado('postulacion') });
        }
        const inserted = await client.query(`INSERT INTO usuarios
       (nombre, email, telefono, password_hash, rol, cedula, correo_verificado, telefono_verificado, correo_verificacion_creado_en)
       VALUES ($1, $2, $3, $4, 'cliente', $5, FALSE, FALSE, CURRENT_TIMESTAMP)
       RETURNING id`, [nombre.trim(), emailNormalizado, telefono.trim(), passwordHash, cedulaNormalizada]);
        userId = Number(inserted.rows[0].id);
        const codigoCorreo = (0, secureTokens_1.crearCodigoVerificacion)();
        await crearTokenAccion(client, 'verificar_correo', codigoCorreo, userId, null, {
            expiresInMinutes: 10,
            tokenHash: (0, secureTokens_1.hashCodigoVerificacion)(codigoCorreo, config_1.JWT_SECRET)
        });
        await client.query('COMMIT');
        try {
            await (0, email_1.enviarVerificacionCorreo)(emailNormalizado, codigoCorreo);
        }
        catch {
            console.error('No se pudo enviar el correo de verificación del cliente.');
            return res.status(502).json({
                error: 'La cuenta quedó pendiente, pero no se pudo enviar el correo. Usa “Reenviar correo” para intentarlo de nuevo.',
                verificacion_pendiente: true,
                tipo: 'cliente',
                email: emailNormalizado
            });
        }
        return res.status(202).json({
            mensaje: 'Te enviamos un código de seis dígitos. Escríbelo para confirmar tu correo y activar la cuenta.',
            verificacion_pendiente: true,
            tipo: 'cliente',
            email: emailNormalizado
        });
    }
    catch (error) {
        console.error('Error iniciando registro de cliente:', error);
        try {
            await client.query('ROLLBACK');
        }
        catch (rollbackError) {
            console.error('Error revirtiendo el registro de cliente:', rollbackError);
        }
        return res.status(500).json({ error: 'No se pudo iniciar el registro.' });
    }
    finally {
        client.release();
    }
});
router.post('/driver-applications', rateLimits_1.emisionCorreoRateLimit, async (req, res) => {
    const { nombre, email, telefono, cedula, vehiculo, placa } = req.body ?? {};
    if (typeof nombre !== 'string' || !nombre.trim() || nombre.trim().length > 120
        || !correoValido(email) || !telefonoValido(telefono)
        || !cedulaValida(cedula)
        || typeof vehiculo !== 'string' || !vehiculo.trim() || vehiculo.trim().length > 100
        || typeof placa !== 'string' || !/^[A-Z0-9]{3}-?[A-Z0-9]{3,4}$/i.test(placa.trim())) {
        return res.status(400).json({ error: 'Revisa tus datos, cédula, vehículo y placa.' });
    }
    const emailNormalizado = email.trim().toLowerCase();
    const cedulaNormalizada = `${cedula.trim()[0].toUpperCase()}-${cedula.trim().slice(2)}`;
    if (!await validarDominioCorreo(emailNormalizado)) {
        return res.status(400).json({ error: 'El dominio de este correo no parece poder recibir mensajes.' });
    }
    const client = await db_1.pool.connect();
    let applicationId = 0;
    try {
        await ensureOnboardingTables();
        await client.query('BEGIN');
        await bloquearIdentificadores(client, emailNormalizado, telefono, cedulaNormalizada);
        const duplicados = await buscarIdentificadoresDuplicados(client, emailNormalizado, telefono, cedulaNormalizada);
        if (duplicados.usuario || duplicados.postulacion) {
            await client.query('ROLLBACK');
            return res.status(409).json({
                error: mensajeDuplicado(duplicados.usuario ? 'usuario' : 'postulacion')
            });
        }
        const inserted = await client.query(`INSERT INTO postulaciones_repartidor (nombre, email, telefono, cedula, vehiculo, placa)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`, [nombre.trim(), emailNormalizado, telefono.trim(), cedulaNormalizada, vehiculo.trim(), placa.trim().toUpperCase()]);
        applicationId = Number(inserted.rows[0].id);
        const codigoCorreo = (0, secureTokens_1.crearCodigoVerificacion)();
        await crearTokenAccion(client, 'verificar_correo', codigoCorreo, null, applicationId, {
            expiresInMinutes: 10,
            tokenHash: (0, secureTokens_1.hashCodigoVerificacion)(codigoCorreo, config_1.JWT_SECRET)
        });
        await client.query('COMMIT');
        try {
            await (0, email_1.enviarVerificacionCorreo)(emailNormalizado, codigoCorreo);
        }
        catch {
            console.error('No se pudo enviar el correo de verificación de la postulación.');
            return res.status(502).json({
                error: 'La postulación quedó pendiente, pero no se pudo enviar el correo. Usa “Reenviar correo” para intentarlo de nuevo.',
                verificacion_pendiente: true,
                tipo: 'repartidor',
                email: emailNormalizado
            });
        }
        return res.status(202).json({
            mensaje: 'Recibimos tu postulación. Escribe el código de seis dígitos que enviamos a tu correo para continuar.',
            verificacion_pendiente: true,
            tipo: 'repartidor',
            email: emailNormalizado
        });
    }
    catch (error) {
        console.error('Error registrando postulación de repartidor:', error);
        try {
            await client.query('ROLLBACK');
        }
        catch (rollbackError) {
            console.error('Error revirtiendo la postulación:', rollbackError);
        }
        return res.status(500).json({ error: 'No se pudo registrar la postulación.' });
    }
    finally {
        client.release();
    }
});
router.post('/email-verification/resend', rateLimits_1.emisionCorreoRateLimit, async (req, res) => {
    const { email, tipo } = req.body ?? {};
    if (!correoValido(email) || (tipo !== undefined && tipo !== 'cliente' && tipo !== 'repartidor')) {
        return res.status(400).json({ error: 'Correo o tipo de cuenta no válido.' });
    }
    const emailNormalizado = email.trim().toLowerCase();
    const client = await db_1.pool.connect();
    let codigoCorreo = '';
    let debeEnviar = false;
    let debeEsperar = false;
    try {
        await ensureOnboardingTables();
        await client.query('BEGIN');
        if (tipo === 'cliente' || tipo === undefined) {
            const result = await client.query(`SELECT id FROM usuarios
         WHERE lower(email) = $1 AND rol = 'cliente' AND correo_verificado = FALSE
         FOR UPDATE`, [emailNormalizado]);
            if (result.rows.length > 0) {
                const reciente = await client.query(`SELECT 1 FROM auth_action_tokens
           WHERE purpose = 'verificar_correo' AND user_id = $1 AND used_at IS NULL
             AND created_at > CURRENT_TIMESTAMP - INTERVAL '1 minute'
           LIMIT 1`, [result.rows[0].id]);
                if (reciente.rows.length > 0) {
                    debeEsperar = true;
                }
                else {
                    codigoCorreo = (0, secureTokens_1.crearCodigoVerificacion)();
                    await client.query('UPDATE usuarios SET correo_verificacion_creado_en = CURRENT_TIMESTAMP WHERE id = $1', [result.rows[0].id]);
                    await crearTokenAccion(client, 'verificar_correo', codigoCorreo, Number(result.rows[0].id), null, {
                        expiresInMinutes: 10,
                        tokenHash: (0, secureTokens_1.hashCodigoVerificacion)(codigoCorreo, config_1.JWT_SECRET)
                    });
                    debeEnviar = true;
                }
            }
        }
        if (!debeEnviar && (tipo === 'repartidor' || tipo === undefined)) {
            const result = await client.query(`SELECT id FROM postulaciones_repartidor
         WHERE lower(email) = $1 AND estado = 'pendiente_correo'
         FOR UPDATE`, [emailNormalizado]);
            if (result.rows.length > 0) {
                const reciente = await client.query(`SELECT 1 FROM auth_action_tokens
           WHERE purpose = 'verificar_correo' AND application_id = $1 AND used_at IS NULL
             AND created_at > CURRENT_TIMESTAMP - INTERVAL '1 minute'
           LIMIT 1`, [result.rows[0].id]);
                if (reciente.rows.length > 0) {
                    debeEsperar = true;
                }
                else {
                    codigoCorreo = (0, secureTokens_1.crearCodigoVerificacion)();
                    await crearTokenAccion(client, 'verificar_correo', codigoCorreo, null, Number(result.rows[0].id), {
                        expiresInMinutes: 10,
                        tokenHash: (0, secureTokens_1.hashCodigoVerificacion)(codigoCorreo, config_1.JWT_SECRET)
                    });
                    debeEnviar = true;
                }
            }
        }
        await client.query('COMMIT');
    }
    catch (error) {
        console.error('Error preparando el reenvío de verificación:', error);
        try {
            await client.query('ROLLBACK');
        }
        catch (rollbackError) {
            console.error('Error revirtiendo el reenvío de verificación:', rollbackError);
        }
        return res.status(500).json({ error: 'No se pudo preparar el reenvío del correo.' });
    }
    finally {
        client.release();
    }
    if (debeEnviar) {
        try {
            await (0, email_1.enviarVerificacionCorreo)(emailNormalizado, codigoCorreo);
        }
        catch {
            console.error('No se pudo reenviar el correo de verificación.');
            return res.status(502).json({ error: 'No se pudo enviar el correo. Inténtalo más tarde.' });
        }
    }
    return res.status(202).json({
        mensaje: debeEsperar
            ? 'Espera un minuto antes de solicitar otro código.'
            : 'Si hay una verificación pendiente para ese correo, recibirás un nuevo código.'
    });
});
router.post('/verify-email', rateLimits_1.registroRateLimit, async (req, res) => {
    const token = req.body?.token;
    const codigo = req.body?.codigo;
    const email = req.body?.email;
    const tipoCuenta = req.body?.tipo;
    const esEnlaceAnterior = typeof token === 'string' && /^[a-f0-9]{64}$/i.test(token);
    if (!esEnlaceAnterior
        && (!correoValido(email) || (tipoCuenta !== 'cliente' && tipoCuenta !== 'repartidor')
            || typeof codigo !== 'string' || !/^\d{6}$/.test(codigo))) {
        return res.status(400).json({ error: 'Escribe el correo y el código de seis dígitos que recibiste.' });
    }
    const client = await db_1.pool.connect();
    let userId = null;
    let applicationId = null;
    let tipo = null;
    try {
        await ensureOnboardingTables();
        await client.query('BEGIN');
        const action = esEnlaceAnterior
            ? await client.query(`SELECT t.id, t.user_id, t.application_id, t.attempts, t.token_hash
           FROM auth_action_tokens t
           WHERE t.purpose = 'verificar_correo' AND t.token_hash = $1
             AND t.used_at IS NULL AND t.expires_at > CURRENT_TIMESTAMP
           FOR UPDATE`, [(0, secureTokens_1.hashTokenSeguro)(token)])
            : await client.query(`SELECT t.id, t.user_id, t.application_id, t.attempts, t.token_hash
           FROM auth_action_tokens t
           LEFT JOIN usuarios u ON u.id = t.user_id
           LEFT JOIN postulaciones_repartidor a ON a.id = t.application_id
           WHERE t.purpose = 'verificar_correo' AND t.used_at IS NULL
             AND t.expires_at > CURRENT_TIMESTAMP
             AND lower(COALESCE(u.email, a.email)) = $1
             AND (($2 = 'cliente' AND t.user_id IS NOT NULL)
               OR ($2 = 'repartidor' AND t.application_id IS NOT NULL))
           FOR UPDATE OF t`, [email.trim().toLowerCase(), tipoCuenta]);
        if (action.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                error: esEnlaceAnterior
                    ? 'El enlace venció o ya fue utilizado. Solicita un código nuevo.'
                    : 'El código venció o no coincide. Revisa el correo e inténtalo de nuevo.'
            });
        }
        const actionRow = action.rows[0];
        if (!esEnlaceAnterior) {
            if (Number(actionRow.attempts) >= 5) {
                await client.query('ROLLBACK');
                return res.status(429).json({ error: 'Se agotaron los intentos para este código. Solicita uno nuevo.' });
            }
            const codigoHash = (0, secureTokens_1.hashCodigoVerificacion)(codigo, config_1.JWT_SECRET);
            const hashAlmacenado = String(actionRow.token_hash).trim();
            const codigoCoincide = (0, crypto_1.timingSafeEqual)(Buffer.from(hashAlmacenado), Buffer.from(codigoHash));
            if (!codigoCoincide) {
                await client.query('UPDATE auth_action_tokens SET attempts = attempts + 1 WHERE id = $1', [actionRow.id]);
                await client.query('COMMIT');
                return res.status(400).json({ error: 'El código no coincide. Revísalo e inténtalo de nuevo.' });
            }
        }
        userId = actionRow.user_id === null ? null : Number(actionRow.user_id);
        applicationId = actionRow.application_id === null ? null : Number(actionRow.application_id);
        if (userId) {
            const update = await client.query(`UPDATE usuarios SET correo_verificado = TRUE, correo_verificacion_creado_en = NULL
         WHERE id = $1 AND rol = 'cliente' RETURNING id`, [userId]);
            if (update.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'No se pudo confirmar este correo.' });
            }
            tipo = 'cliente';
        }
        else if (applicationId) {
            const update = await client.query(`UPDATE postulaciones_repartidor
         SET correo_verificado = TRUE, estado = 'pendiente_revision'
         WHERE id = $1 AND estado = 'pendiente_correo' RETURNING id`, [applicationId]);
            if (update.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'No se pudo confirmar este correo.' });
            }
            tipo = 'repartidor';
        }
        await client.query('UPDATE auth_action_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = $1', [actionRow.id]);
        await client.query('COMMIT');
    }
    catch (error) {
        console.error('Error confirmando correo:', error);
        try {
            await client.query('ROLLBACK');
        }
        catch (rollbackError) {
            console.error('Error revirtiendo la confirmación de correo:', rollbackError);
        }
        return res.status(500).json({ error: 'No se pudo confirmar el correo.' });
    }
    finally {
        client.release();
    }
    if (userId) {
        try {
            await (0, activity_1.registrarActividadDirecta)(userId, 'cliente', 'correo_confirmado', 'Confirmó su dirección de correo.');
        }
        catch (activityError) {
            console.error('No se pudo registrar la confirmación del correo:', activityError);
        }
    }
    return res.json({
        mensaje: tipo === 'repartidor'
            ? 'Correo confirmado. Tu postulación está lista para revisión del administrador.'
            : 'Correo confirmado. Ya puedes iniciar sesión.',
        tipo
    });
});
router.post('/driver-applications/activate', rateLimits_1.registroRateLimit, async (req, res) => {
    const { token, password } = req.body ?? {};
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token) || !contrasenaValida(password)) {
        return res.status(400).json({ error: 'El enlace o la contraseña no es válido. Usa al menos 8 caracteres con mayúscula, minúscula, número y símbolo.' });
    }
    const client = await db_1.pool.connect();
    let createdUser = null;
    try {
        await ensureOnboardingTables();
        const passwordHash = await bcryptjs_1.default.hash(password, 10);
        await client.query('BEGIN');
        const action = await client.query(`SELECT t.id AS token_id, a.*
       FROM auth_action_tokens t
       JOIN postulaciones_repartidor a ON a.id = t.application_id
       WHERE t.purpose = 'activar_repartidor' AND t.token_hash = $1
         AND t.used_at IS NULL AND t.expires_at > CURRENT_TIMESTAMP
         AND a.estado = 'aprobada'
       FOR UPDATE OF t, a`, [(0, secureTokens_1.hashTokenSeguro)(token)]);
        if (action.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'El enlace venció o ya fue utilizado. Contacta al administrador para recibir otro.' });
        }
        const application = action.rows[0];
        await bloquearIdentificadores(client, application.email, application.telefono, application.cedula);
        const duplicados = await buscarIdentificadoresDuplicados(client, application.email, application.telefono, application.cedula, Number(application.id));
        if (duplicados.usuario || duplicados.postulacion) {
            await client.query('ROLLBACK');
            return res.status(409).json({
                error: 'El correo, teléfono o cédula ya pertenece a otra cuenta. Contacta al administrador.'
            });
        }
        const inserted = await client.query(`INSERT INTO usuarios
       (nombre, email, telefono, password_hash, rol, cedula, vehiculo, placa, correo_verificado, telefono_verificado)
       VALUES ($1, $2, $3, $4, 'repartidor', $5, $6, $7, TRUE, $8)
       RETURNING id, nombre, email, telefono, rol, cedula, foto, vehiculo, placa, vehiculo_foto,
                 calificacion, es_admin, correo_verificado, telefono_verificado`, [application.nombre, application.email, application.telefono, passwordHash, application.cedula, application.vehiculo, application.placa, application.telefono_verificado === true]);
        createdUser = inserted.rows[0];
        await client.query(`UPDATE postulaciones_repartidor
       SET estado = 'cuenta_creada', revisado_en = COALESCE(revisado_en, CURRENT_TIMESTAMP)
       WHERE id = $1`, [application.id]);
        await client.query('UPDATE auth_action_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = $1', [application.token_id]);
        await client.query('COMMIT');
    }
    catch (error) {
        console.error('Error activando cuenta de repartidor:', error);
        try {
            await client.query('ROLLBACK');
        }
        catch (rollbackError) {
            console.error('Error revirtiendo activación de repartidor:', rollbackError);
        }
        return res.status(500).json({ error: 'No se pudo activar la cuenta.' });
    }
    finally {
        client.release();
    }
    if (!createdUser)
        return res.status(500).json({ error: 'No se pudo activar la cuenta.' });
    const user = usuarioPublico(createdUser);
    let accessToken;
    try {
        accessToken = await emitirTokenAcceso(user.id, 'repartidor', 'repartidor', false);
    }
    catch (error) {
        console.error('Cuenta de repartidor activada, pero no se pudo abrir la sesión:', error);
        return res.status(500).json({ error: 'La cuenta se activó, pero no se pudo iniciar sesión. Intenta ingresar con tu correo y contraseña.' });
    }
    try {
        await (0, activity_1.registrarActividadDirecta)(user.id, 'repartidor', 'cuenta_creada', 'Activó su cuenta después de la aprobación administrativa.');
    }
    catch (activityError) {
        console.error('No se pudo registrar la activación del repartidor:', activityError);
    }
    return res.status(201).json({ mensaje: 'Cuenta de repartidor activada.', token: accessToken, usuario: user });
});
router.get('/admin/driver-applications', auth_1.requireAuth, auth_1.requireAdmin, async (_req, res) => {
    try {
        await ensureOnboardingTables();
        const result = await db_1.pool.query(`SELECT id, nombre, email, telefono, cedula, vehiculo, placa, estado,
              correo_verificado, telefono_verificado, creado_en
       FROM postulaciones_repartidor
       WHERE estado IN ('pendiente_revision', 'aprobada')
       ORDER BY creado_en ASC`);
        return res.json(result.rows);
    }
    catch (error) {
        console.error('Error cargando postulaciones de repartidor:', error);
        return res.status(500).json({ error: 'No se pudieron cargar las postulaciones.' });
    }
});
router.post('/admin/driver-applications/:id/approve', auth_1.requireAuth, auth_1.requireAdmin, rateLimits_1.adminActionRateLimit, async (req, res) => {
    const authUser = req.authUser;
    const applicationId = Number(req.params.id);
    if (!authUser || !Number.isSafeInteger(applicationId) || applicationId <= 0) {
        return res.status(400).json({ error: 'Postulación no válida.' });
    }
    const client = await db_1.pool.connect();
    let email = '';
    let token = '';
    try {
        await ensureOnboardingTables();
        await (0, activity_1.asegurarTablasActividad)();
        token = (0, secureTokens_1.crearTokenSeguro)();
        await client.query('BEGIN');
        const update = await client.query(`UPDATE postulaciones_repartidor
       SET estado = 'aprobada', telefono_verificado = TRUE,
           revisado_por = $2, revisado_en = CURRENT_TIMESTAMP
       WHERE id = $1 AND estado = 'pendiente_revision' AND correo_verificado = TRUE
       RETURNING email`, [applicationId, authUser.id]);
        if (update.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'La postulación ya no está pendiente o el correo no ha sido confirmado.' });
        }
        email = update.rows[0].email;
        await crearTokenAccion(client, 'activar_repartidor', token, null, applicationId);
        await (0, activity_1.registrarActividad)(client, authUser.id, 'admin', 'postulacion_repartidor_aprobada', `Aprobó la postulación de repartidor ${applicationId}.`);
        await client.query('COMMIT');
    }
    catch (error) {
        console.error('Error aprobando postulación de repartidor:', error);
        try {
            await client.query('ROLLBACK');
        }
        catch (rollbackError) {
            console.error('Error revirtiendo aprobación de postulación:', rollbackError);
        }
        return res.status(500).json({ error: 'No se pudo aprobar la postulación.' });
    }
    finally {
        client.release();
    }
    try {
        await (0, email_1.enviarInvitacionRepartidor)(email, token);
    }
    catch {
        console.error('Postulación aprobada, pero no se pudo enviar el enlace de activación.');
        return res.status(502).json({ error: 'La postulación fue aprobada, pero no se pudo enviar la invitación. Puedes reenviarla desde el panel.' });
    }
    return res.json({ mensaje: 'Postulación aprobada. Se envió el enlace para crear la contraseña.' });
});
router.post('/admin/driver-applications/:id/resend-invitation', auth_1.requireAuth, auth_1.requireAdmin, rateLimits_1.adminActionRateLimit, async (req, res) => {
    const authUser = req.authUser;
    const applicationId = Number(req.params.id);
    if (!authUser || !Number.isSafeInteger(applicationId) || applicationId <= 0) {
        return res.status(400).json({ error: 'Postulación no válida.' });
    }
    const client = await db_1.pool.connect();
    let email = '';
    let token = '';
    try {
        await ensureOnboardingTables();
        await (0, activity_1.asegurarTablasActividad)();
        await client.query('BEGIN');
        const application = await client.query(`SELECT email FROM postulaciones_repartidor
       WHERE id = $1 AND estado = 'aprobada' FOR UPDATE`, [applicationId]);
        if (application.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'No hay una postulación aprobada pendiente de activación.' });
        }
        email = application.rows[0].email;
        token = (0, secureTokens_1.crearTokenSeguro)();
        await crearTokenAccion(client, 'activar_repartidor', token, null, applicationId);
        await (0, activity_1.registrarActividad)(client, authUser.id, 'admin', 'invitacion_repartidor_reenviada', `Reenvió la invitación de activación de la postulación ${applicationId}.`);
        await client.query('COMMIT');
    }
    catch (error) {
        console.error('Error preparando invitación de repartidor:', error);
        try {
            await client.query('ROLLBACK');
        }
        catch (rollbackError) {
            console.error('Error revirtiendo invitación de repartidor:', rollbackError);
        }
        return res.status(500).json({ error: 'No se pudo preparar la invitación.' });
    }
    finally {
        client.release();
    }
    try {
        await (0, email_1.enviarInvitacionRepartidor)(email, token);
    }
    catch {
        console.error('No se pudo reenviar la invitación de repartidor.');
        return res.status(502).json({ error: 'No se pudo enviar la invitación. Inténtalo más tarde.' });
    }
    return res.json({ mensaje: 'Se envió un nuevo enlace de activación.' });
});
router.post('/admin/driver-applications/:id/reject', auth_1.requireAuth, auth_1.requireAdmin, rateLimits_1.adminActionRateLimit, async (req, res) => {
    const authUser = req.authUser;
    const applicationId = Number(req.params.id);
    const motivo = typeof req.body?.motivo === 'string' ? req.body.motivo.trim() : '';
    if (!authUser || !Number.isSafeInteger(applicationId) || applicationId <= 0 || motivo.length > 500) {
        return res.status(400).json({ error: 'Postulación o motivo no válido.' });
    }
    const client = await db_1.pool.connect();
    let email = '';
    try {
        await ensureOnboardingTables();
        await (0, activity_1.asegurarTablasActividad)();
        await client.query('BEGIN');
        const update = await client.query(`UPDATE postulaciones_repartidor
       SET estado = 'rechazada', motivo_rechazo = $2, revisado_por = $3, revisado_en = CURRENT_TIMESTAMP
       WHERE id = $1 AND estado = 'pendiente_revision'
       RETURNING email`, [applicationId, motivo || null, authUser.id]);
        if (update.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'La postulación ya no está pendiente de revisión.' });
        }
        email = update.rows[0].email;
        await (0, activity_1.registrarActividad)(client, authUser.id, 'admin', 'postulacion_repartidor_rechazada', `Rechazó la postulación de repartidor ${applicationId}.`);
        await client.query('COMMIT');
    }
    catch (error) {
        console.error('Error rechazando postulación de repartidor:', error);
        try {
            await client.query('ROLLBACK');
        }
        catch (rollbackError) {
            console.error('Error revirtiendo rechazo de postulación:', rollbackError);
        }
        return res.status(500).json({ error: 'No se pudo rechazar la postulación.' });
    }
    finally {
        client.release();
    }
    try {
        await (0, email_1.enviarAvisoRechazoPostulacion)(email);
    }
    catch {
        console.error('Postulación rechazada, pero no se pudo enviar el aviso.');
        return res.status(502).json({ error: 'La postulación fue rechazada, pero no se pudo enviar el aviso por correo.' });
    }
    return res.json({ mensaje: 'Postulación rechazada y notificada.' });
});
// LOGIN
router.post('/login', rateLimits_1.inicioSesionRateLimit, async (req, res) => {
    const { email, password } = req.body ?? {};
    if (typeof email !== 'string' || email.length > 254 || typeof password !== 'string' || password.length > 128) {
        return res.status(400).json({ error: 'Correo o contraseña incorrectos.' });
    }
    try {
        await ensureProfileColumns();
        const result = await db_1.pool.query('SELECT * FROM usuarios WHERE lower(email) = $1', [email.trim().toLowerCase()]);
        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Correo o contraseña incorrectos.' });
        }
        const user = result.rows[0];
        const validPassword = await bcryptjs_1.default.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(400).json({ error: 'Correo o contraseña incorrectos.' });
        }
        if (user.correo_verificado !== true) {
            return res.status(403).json({ error: 'Confirma tu correo con el código que te enviamos antes de iniciar sesión.' });
        }
        const token = await emitirTokenAcceso(user.id, user.rol, user.rol, user.es_admin === true);
        try {
            await (0, activity_1.registrarActividadDirecta)(user.id, user.rol, 'inicio_sesion', 'Inició sesión.');
        }
        catch (activityError) {
            console.error('No se pudo registrar el inicio de sesión:', activityError);
        }
        res.json({
            mensaje: 'Login exitoso',
            token,
            usuario: usuarioPublico(user)
        });
    }
    catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ error: 'Error interno al iniciar sesión.' });
    }
});
router.put('/active-role', auth_1.requireAuth, auth_1.requireAdmin, rateLimits_1.adminActionRateLimit, async (req, res) => {
    const authUser = req.authUser;
    const rol = req.body?.rol;
    if (!authUser)
        return res.status(401).json({ error: 'Sesión inválida.' });
    if (rol !== 'cliente' && rol !== 'repartidor') {
        return res.status(400).json({ error: 'El rol solicitado no es válido.' });
    }
    try {
        await ensureProfileColumns();
        const result = await db_1.pool.query('SELECT id, nombre, email, telefono, rol, cedula, foto, vehiculo, placa, vehiculo_foto, calificacion, es_admin, correo_verificado, telefono_verificado FROM usuarios WHERE id = $1 AND es_admin = TRUE', [authUser.id]);
        if (result.rows.length === 0)
            return res.status(403).json({ error: 'Esta acción requiere permisos de administrador.' });
        const user = result.rows[0];
        const usuarioActivo = { ...usuarioPublico(user), rol };
        const token = await emitirTokenAcceso(user.id, rol, user.rol, true, authUser.session_id);
        res.json({ token, usuario: usuarioActivo });
    }
    catch (error) {
        console.error('Error al cambiar la perspectiva del administrador:', error);
        res.status(500).json({ error: 'No se pudo cambiar la perspectiva de la cuenta.' });
    }
});
router.post('/activity/presence', auth_1.requireAuth, async (req, res) => {
    const authUser = req.authUser;
    if (!authUser)
        return res.status(401).json({ error: 'Sesión inválida.' });
    try {
        await (0, activity_1.asegurarTablasActividad)();
        await db_1.pool.query(`INSERT INTO sesiones_activas (session_id, usuario_id, ultimo_pulso)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (session_id) DO UPDATE
         SET usuario_id = EXCLUDED.usuario_id, ultimo_pulso = CURRENT_TIMESTAMP`, [authUser.session_id, authUser.id]);
        res.status(204).end();
    }
    catch (error) {
        console.error('Error actualizando presencia:', error);
        res.status(500).json({ error: 'No se pudo actualizar la presencia.' });
    }
});
router.post('/logout', auth_1.requireAuth, async (req, res) => {
    const authUser = req.authUser;
    if (!authUser)
        return res.status(401).json({ error: 'Sesión inválida.' });
    const client = await db_1.pool.connect();
    try {
        await client.query('BEGIN');
        await (0, activity_1.registrarActividad)(client, authUser.id, authUser.rol, 'cierre_sesion', 'Cerró sesión.');
        await (0, authSessions_1.revocarSesionAutenticada)(client, authUser.session_id, authUser.id);
        await client.query('DELETE FROM sesiones_activas WHERE session_id = $1', [authUser.session_id]);
        await client.query('COMMIT');
        res.json({ mensaje: 'Sesión cerrada.' });
    }
    catch (error) {
        console.error('Error registrando el cierre de sesión:', error);
        try {
            await client.query('ROLLBACK');
        }
        catch (rollbackError) {
            console.error('Error al revertir el cierre de sesión:', rollbackError);
        }
        res.status(500).json({ error: 'No se pudo registrar el cierre de sesión.' });
    }
    finally {
        client.release();
    }
});
router.get('/admin/monitor', auth_1.requireAuth, auth_1.requireAdmin, async (_req, res) => {
    try {
        await (0, activity_1.asegurarTablasActividad)();
        const counts = await db_1.pool.query(`WITH activos AS (
         SELECT DISTINCT s.usuario_id, u.rol
         FROM sesiones_activas s
         JOIN usuarios u ON u.id = s.usuario_id
         WHERE s.ultimo_pulso >= CURRENT_TIMESTAMP - INTERVAL '60 seconds'
       )
       SELECT
         (SELECT COUNT(*)::integer FROM usuarios) AS cuentas_totales,
         (SELECT COUNT(*)::integer FROM usuarios WHERE rol = 'cliente') AS clientes_totales,
         (SELECT COUNT(*)::integer FROM usuarios WHERE rol = 'repartidor') AS repartidores_totales,
         COUNT(*)::integer AS usuarios_activos,
         COUNT(*) FILTER (WHERE rol = 'cliente')::integer AS clientes_activos,
         COUNT(*) FILTER (WHERE rol = 'repartidor')::integer AS repartidores_activos
       FROM activos`);
        const activity = await db_1.pool.query(`SELECT id, actor_nombre, actor_rol, evento, resumen, pedido_id, creado_en
       FROM actividad_admin
       ORDER BY creado_en DESC, id DESC
       LIMIT 100`);
        res.json({ metricas: counts.rows[0], actividad: activity.rows });
    }
    catch (error) {
        console.error('Error consultando el monitor administrativo:', error);
        res.status(500).json({ error: 'No se pudo consultar el monitor administrativo.' });
    }
});
router.put('/profile', auth_1.requireAuth, async (req, res) => {
    const authUser = req.authUser;
    if (!authUser)
        return res.status(401).json({ error: 'Sesión inválida.' });
    const { foto, vehiculo, placa, vehiculo_foto } = req.body ?? {};
    if (typeof foto !== 'string' || foto.length > 1_000_000
        || (authUser.rol === 'repartidor' && (typeof vehiculo !== 'string' || !vehiculo.trim() || vehiculo.length > 100
            || typeof placa !== 'string' || placa.length > 30
            || typeof vehiculo_foto !== 'string' || vehiculo_foto.length > 1_000_000))) {
        return res.status(400).json({ error: 'Los datos del perfil no son válidos.' });
    }
    try {
        await ensureProfileColumns();
        const result = authUser.rol === 'repartidor'
            ? await db_1.pool.query(`UPDATE usuarios
         SET foto = $1, vehiculo = $2, placa = $3, vehiculo_foto = $4
         WHERE id = $5 AND (rol = 'repartidor' OR es_admin = TRUE)
         RETURNING id, nombre, email, telefono, rol, cedula, foto, vehiculo, placa, vehiculo_foto, calificacion, es_admin, correo_verificado, telefono_verificado`, [foto, vehiculo.trim(), placa.trim(), vehiculo_foto, authUser.id])
            : await db_1.pool.query(`UPDATE usuarios SET foto = $1
         WHERE id = $2 AND (rol = 'cliente' OR es_admin = TRUE)
        RETURNING id, nombre, email, telefono, rol, cedula, foto, vehiculo, placa, vehiculo_foto, calificacion, es_admin, correo_verificado, telefono_verificado`, [foto, authUser.id]);
        if (result.rows.length === 0)
            return res.status(404).json({ error: 'No se encontró el perfil de la cuenta.' });
        res.json({ usuario: { ...usuarioPublico(result.rows[0]), rol: authUser.rol } });
    }
    catch (error) {
        console.error('Error al actualizar perfil:', error);
        res.status(500).json({ error: 'No se pudo actualizar el perfil.' });
    }
});
exports.default = router;
