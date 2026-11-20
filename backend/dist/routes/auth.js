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
const activity_1 = require("../utils/activity");
const router = (0, express_1.Router)();
let profileColumnsReady = null;
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
    `).then(() => undefined).catch((error) => {
            profileColumnsReady = null;
            console.error('Error preparando los datos de perfil:', error);
            throw error;
        });
    }
    return profileColumnsReady;
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
    es_admin: user.es_admin === true
});
// REGISTRO DIRECTO (Sin verificación SMS)
router.post('/register', async (req, res) => {
    const { nombre, email, telefono, password, cedula, foto, vehiculo, placa, vehiculo_foto } = req.body ?? {};
    const rol = req.body?.rol || 'cliente';
    if (typeof nombre !== 'string' || !nombre.trim() || nombre.length > 120
        || typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        || typeof password !== 'string'
        || password.length < 8 || password.length > 128 || !/[A-Z]/.test(password) || !/[a-z]/.test(password)
        || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)
        || (telefono !== undefined && (typeof telefono !== 'string' || telefono.length > 30))
        || (cedula !== undefined && (typeof cedula !== 'string' || cedula.length > 30))
        || (foto !== undefined && (typeof foto !== 'string' || foto.length > 1_000_000))
        || (vehiculo !== undefined && (typeof vehiculo !== 'string' || vehiculo.length > 100))
        || (placa !== undefined && (typeof placa !== 'string' || placa.length > 30))
        || (vehiculo_foto !== undefined && (typeof vehiculo_foto !== 'string' || vehiculo_foto.length > 1_000_000))
        || (rol !== 'cliente' && rol !== 'repartidor')) {
        return res.status(400).json({ error: 'Los datos de registro no son válidos.' });
    }
    const emailNormalizado = email.trim().toLowerCase();
    try {
        await ensureProfileColumns();
        // 1. Validar dominio de correo real (MX)
        const dominio = emailNormalizado.split('@')[1];
        try {
            const mx = await promises_1.default.resolveMx(dominio);
            if (!mx || mx.length === 0)
                throw new Error();
        }
        catch {
            return res.status(400).json({ error: `El dominio "@${dominio}" no puede recibir correos.` });
        }
        // 2. Verificar si el correo ya existe en la base de datos
        const userCheck = await db_1.pool.query('SELECT * FROM usuarios WHERE lower(email) = $1', [emailNormalizado]);
        if (userCheck.rows.length > 0) {
            const usuarioExistente = userCheck.rows[0];
            if (usuarioExistente.rol === rol) {
                return res.status(400).json({ error: `Ya existe una cuenta de ${rol} registrada con este correo electrónico.` });
            }
            else {
                return res.status(400).json({ error: `Este correo ya está registrado como ${usuarioExistente.rol}. No puedes usarlo para un rol distinto.` });
            }
        }
        // 3. Crear usuario (Hasheando la contraseña)
        const salt = await bcryptjs_1.default.genSalt(10);
        const passwordHash = await bcryptjs_1.default.hash(password, salt);
        const newUser = await db_1.pool.query(`INSERT INTO usuarios
       (nombre, email, telefono, password_hash, rol, cedula, foto, vehiculo, placa, vehiculo_foto)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, nombre, email, telefono, rol, cedula, foto, vehiculo, placa, vehiculo_foto, calificacion, es_admin`, [
            nombre.trim(), emailNormalizado, telefono?.trim() || null, passwordHash, rol,
            cedula?.trim() || null, foto || null, vehiculo?.trim() || null, placa?.trim() || null, vehiculo_foto || null
        ]);
        const user = usuarioPublico(newUser.rows[0]);
        const token = jsonwebtoken_1.default.sign({ id: user.id, rol: user.rol, rol_base: user.rol, es_admin: user.es_admin, jti: (0, crypto_1.randomUUID)() }, config_1.JWT_SECRET, { expiresIn: '7d' });
        try {
            await (0, activity_1.registrarActividadDirecta)(user.id, user.rol, 'cuenta_creada', `Se creó una cuenta de ${user.rol}.`);
        }
        catch (activityError) {
            console.error('No se pudo registrar la creación de cuenta:', activityError);
        }
        res.status(201).json({
            mensaje: '¡Cuenta creada con éxito!',
            token,
            usuario: user
        });
    }
    catch (error) {
        console.error('Error en registro:', error);
        res.status(500).json({ error: 'Error interno al registrar el usuario.' });
    }
});
// LOGIN
router.post('/login', async (req, res) => {
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
        const token = jsonwebtoken_1.default.sign({ id: user.id, rol: user.rol, rol_base: user.rol, es_admin: user.es_admin === true, jti: (0, crypto_1.randomUUID)() }, config_1.JWT_SECRET, { expiresIn: '7d' });
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
router.put('/active-role', auth_1.requireAuth, auth_1.requireAdmin, async (req, res) => {
    const authUser = req.authUser;
    const rol = req.body?.rol;
    if (!authUser)
        return res.status(401).json({ error: 'Sesión inválida.' });
    if (rol !== 'cliente' && rol !== 'repartidor') {
        return res.status(400).json({ error: 'El rol solicitado no es válido.' });
    }
    try {
        await ensureProfileColumns();
        const result = await db_1.pool.query('SELECT id, nombre, email, telefono, rol, cedula, foto, vehiculo, placa, vehiculo_foto, calificacion, es_admin FROM usuarios WHERE id = $1 AND es_admin = TRUE', [authUser.id]);
        if (result.rows.length === 0)
            return res.status(403).json({ error: 'Esta acción requiere permisos de administrador.' });
        const user = result.rows[0];
        const usuarioActivo = { ...usuarioPublico(user), rol };
        const token = jsonwebtoken_1.default.sign({ id: user.id, rol, rol_base: user.rol, es_admin: true, jti: authUser.session_id }, config_1.JWT_SECRET, { expiresIn: '7d' });
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
    const { cedula, foto, vehiculo, placa, vehiculo_foto } = req.body ?? {};
    if (typeof cedula !== 'string' || cedula.length > 30
        || typeof foto !== 'string' || foto.length > 1_000_000
        || (authUser.rol === 'repartidor' && (typeof vehiculo !== 'string' || !vehiculo.trim() || vehiculo.length > 100
            || typeof placa !== 'string' || placa.length > 30
            || typeof vehiculo_foto !== 'string' || vehiculo_foto.length > 1_000_000))) {
        return res.status(400).json({ error: 'Los datos del perfil no son válidos.' });
    }
    try {
        await ensureProfileColumns();
        const result = authUser.rol === 'repartidor'
            ? await db_1.pool.query(`UPDATE usuarios
         SET cedula = $1, foto = $2, vehiculo = $3, placa = $4, vehiculo_foto = $5
         WHERE id = $6 AND (rol = 'repartidor' OR es_admin = TRUE)
         RETURNING id, nombre, email, telefono, rol, cedula, foto, vehiculo, placa, vehiculo_foto, calificacion, es_admin`, [cedula.trim(), foto, vehiculo.trim(), placa.trim(), vehiculo_foto, authUser.id])
            : await db_1.pool.query(`UPDATE usuarios SET cedula = $1, foto = $2
         WHERE id = $3 AND (rol = 'cliente' OR es_admin = TRUE)
         RETURNING id, nombre, email, telefono, rol, cedula, foto, vehiculo, placa, vehiculo_foto, calificacion, es_admin`, [cedula.trim(), foto, authUser.id]);
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
