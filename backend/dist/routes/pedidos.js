"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.tablasPedidosListas = void 0;
const express_1 = __importStar(require("express"));
const node_zlib_1 = require("node:zlib");
const node_util_1 = require("node:util");
const db_1 = require("../db");
const auth_1 = require("../middleware/auth");
const pricing_1 = require("../utils/pricing");
const pricingSettings_1 = require("../utils/pricingSettings");
const payments_1 = require("../utils/payments");
const activity_1 = require("../utils/activity");
const orderCode_1 = require("../utils/orderCode");
const orderSearch_1 = require("../utils/orderSearch");
const orderPrivacy_1 = require("../utils/orderPrivacy");
const pushNotifications_1 = require("../utils/pushNotifications");
const router = (0, express_1.Router)();
const gzipAsync = (0, node_util_1.promisify)(node_zlib_1.gzip);
const gunzipAsync = (0, node_util_1.promisify)(node_zlib_1.gunzip);
const MAX_CHAT_MEDIA_BYTES = 10 * 1024 * 1024;
const HISTORIAL_REPARTIDOR_PAGE_SIZE = 20;
const chatMediaBodyParser = express_1.default.raw({ type: '*/*', limit: MAX_CHAT_MEDIA_BYTES });
const parseChatMediaBody = (req, res, next) => {
    chatMediaBodyParser(req, res, error => {
        if (error) {
            if (typeof error === 'object' && error !== null && 'type' in error && error.type === 'entity.too.large') {
                res.status(413).json({ error: 'El archivo supera el límite de 10 MB.' });
                return;
            }
            next(error);
            return;
        }
        next();
    });
};
const initTables = async () => {
    try {
        await db_1.pool.query(`
      CREATE TABLE IF NOT EXISTS pedidos (
        id SERIAL PRIMARY KEY,
        cliente_id INTEGER NOT NULL,
        cliente_nombre VARCHAR(120) NOT NULL,
        cliente_cedula VARCHAR(30),
        cliente_foto TEXT,
        repartidor_id INTEGER,
        repartidor_nombre VARCHAR(120),
        repartidor_vehiculo VARCHAR(100) DEFAULT 'Moto Suzuki GN',
        repartidor_placa VARCHAR(30) DEFAULT 'ABC-123',
        repartidor_foto TEXT,
        repartidor_vehiculo_foto TEXT,
        repartidor_calificacion NUMERIC(3,2) DEFAULT 5.0,
        tipo_servicio VARCHAR(50) NOT NULL,
        descripcion TEXT NOT NULL,
        origen_texto TEXT NOT NULL,
        origen_lat DOUBLE PRECISION NOT NULL,
        origen_lon DOUBLE PRECISION NOT NULL,
        destino_texto TEXT NOT NULL,
        destino_lat DOUBLE PRECISION NOT NULL,
        destino_lon DOUBLE PRECISION NOT NULL,
        distancia_km DOUBLE PRECISION NOT NULL,
        tiempo_min INTEGER NOT NULL,
        tarifa NUMERIC(10, 2) NOT NULL,
        metodo_pago VARCHAR(30) DEFAULT 'no_aplica',
        estado_pago VARCHAR(20) DEFAULT 'no_aplica',
        referencia_pago VARCHAR(100),
        pago_confirmado_por INTEGER,
        pago_confirmado_en TIMESTAMP,
        reembolso_confirmado_por INTEGER,
        reembolso_confirmado_en TIMESTAMP,
        iniciado_en TIMESTAMPTZ,
        completado_en TIMESTAMPTZ,
        estado VARCHAR(30) DEFAULT 'pendiente',
        repartidor_lat DOUBLE PRECISION,
        repartidor_lon DOUBLE PRECISION,
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        publicado_en TIMESTAMPTZ,
        motivo_cancelacion VARCHAR(40)
      );

      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cliente_cedula VARCHAR(30);
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cliente_foto TEXT;
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS repartidor_id INTEGER;
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS repartidor_nombre VARCHAR(120);
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS repartidor_vehiculo VARCHAR(100) DEFAULT 'Moto Suzuki GN';
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS repartidor_placa VARCHAR(30) DEFAULT 'ABC-123';
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS repartidor_foto TEXT;
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS repartidor_vehiculo_foto TEXT;
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS repartidor_calificacion NUMERIC(3,2) DEFAULT 5.0;
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS repartidor_lat DOUBLE PRECISION;
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS repartidor_lon DOUBLE PRECISION;
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS metodo_pago VARCHAR(30) DEFAULT 'no_aplica';
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS estado_pago VARCHAR(20) DEFAULT 'no_aplica';
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS referencia_pago VARCHAR(100);
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS pago_confirmado_por INTEGER;
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS pago_confirmado_en TIMESTAMP;
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS reembolso_confirmado_por INTEGER;
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS reembolso_confirmado_en TIMESTAMP;
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS iniciado_en TIMESTAMPTZ;
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS completado_en TIMESTAMPTZ;
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS publicado_en TIMESTAMPTZ;
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS motivo_cancelacion VARCHAR(40);

      UPDATE pedidos
      SET publicado_en = CASE
        WHEN metodo_pago = 'pago_movil' THEN COALESCE(pago_confirmado_en, creado_en)
        ELSE creado_en
      END
      WHERE publicado_en IS NULL
        AND (metodo_pago <> 'pago_movil' OR estado_pago = 'pagado');

      CREATE TABLE IF NOT EXISTS postulaciones (
        id SERIAL PRIMARY KEY,
        pedido_id INTEGER REFERENCES pedidos(id) ON DELETE CASCADE,
        repartidor_id INTEGER NOT NULL,
        repartidor_nombre VARCHAR(120) NOT NULL,
        vehiculo VARCHAR(100) NOT NULL,
        placa VARCHAR(30) NOT NULL,
        vehiculo_foto TEXT,
        calificacion NUMERIC(3,2) DEFAULT 5.0,
        estado VARCHAR(20) DEFAULT 'pendiente',
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE postulaciones ADD COLUMN IF NOT EXISTS placa VARCHAR(30);
      ALTER TABLE postulaciones ADD COLUMN IF NOT EXISTS vehiculo_foto TEXT;
      ALTER TABLE postulaciones ADD COLUMN IF NOT EXISTS calificacion NUMERIC(3,2) DEFAULT 5.0;

      CREATE TABLE IF NOT EXISTS historial_pagos (
        id SERIAL PRIMARY KEY,
        pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
        actor_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
        actor_rol VARCHAR(20) NOT NULL,
        accion VARCHAR(40) NOT NULL,
        metodo_pago VARCHAR(30) NOT NULL,
        estado_pago VARCHAR(20) NOT NULL,
        monto NUMERIC(10, 2) NOT NULL,
        referencia_pago VARCHAR(100),
        detalle VARCHAR(250) NOT NULL,
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS configuracion_pago_movil (
        id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        banco VARCHAR(100) NOT NULL DEFAULT '',
        telefono VARCHAR(30) NOT NULL DEFAULT '',
        cedula VARCHAR(30) NOT NULL DEFAULT '',
        titular VARCHAR(120) NOT NULL DEFAULT ''
      );
      INSERT INTO configuracion_pago_movil (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

      CREATE TABLE IF NOT EXISTS chat_mensajes (
        id SERIAL PRIMARY KEY,
        pedido_id INTEGER REFERENCES pedidos(id) ON DELETE CASCADE,
        remitente_id INTEGER NOT NULL,
        remitente_nombre VARCHAR(120) NOT NULL,
        mensaje TEXT NOT NULL,
        tipo VARCHAR(10) NOT NULL DEFAULT 'texto',
        media_mime VARCHAR(100),
        media_nombre VARCHAR(120),
        media_comprimida BYTEA,
        media_bytes INTEGER,
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE chat_mensajes ADD COLUMN IF NOT EXISTS tipo VARCHAR(10) NOT NULL DEFAULT 'texto';
      ALTER TABLE chat_mensajes ADD COLUMN IF NOT EXISTS media_mime VARCHAR(100);
      ALTER TABLE chat_mensajes ADD COLUMN IF NOT EXISTS media_nombre VARCHAR(120);
      ALTER TABLE chat_mensajes ADD COLUMN IF NOT EXISTS media_comprimida BYTEA;
      ALTER TABLE chat_mensajes ADD COLUMN IF NOT EXISTS media_bytes INTEGER;

      CREATE TABLE IF NOT EXISTS chat_archivos_admin (
        pedido_id INTEGER PRIMARY KEY REFERENCES pedidos(id) ON DELETE CASCADE,
        cliente_nombre VARCHAR(120) NOT NULL,
        repartidor_nombre VARCHAR(120),
        tipo_servicio VARCHAR(50) NOT NULL,
        iniciado_en TIMESTAMPTZ,
        completado_en TIMESTAMPTZ NOT NULL,
        duracion_segundos INTEGER,
        cantidad_mensajes INTEGER NOT NULL,
        vence_en TIMESTAMPTZ NOT NULL,
        contenido_comprimido BYTEA NOT NULL,
        creado_en TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);
    }
    catch (err) {
        console.error('Error inicializando tablas:', err);
    }
};
exports.tablasPedidosListas = initTables();
const crearArchivoChatAdmin = async (client, pedido) => {
    const mensajesResult = await client.query(`SELECT id, remitente_id, remitente_nombre, mensaje, tipo, media_mime, media_nombre,
            media_comprimida, media_bytes, creado_en
     FROM chat_mensajes WHERE pedido_id = $1 ORDER BY creado_en ASC, id ASC`, [pedido.id]);
    const mensajes = await Promise.all(mensajesResult.rows.map(async (mensaje) => ({
        id: mensaje.id,
        remitente_id: mensaje.remitente_id,
        remitente_nombre: mensaje.remitente_nombre,
        mensaje: mensaje.mensaje,
        tipo: mensaje.tipo,
        media_mime: mensaje.media_mime,
        media_nombre: mensaje.media_nombre,
        media_bytes: mensaje.media_bytes,
        media_base64: mensaje.media_comprimida
            ? (await gunzipAsync(mensaje.media_comprimida)).toString('base64')
            : null,
        creado_en: mensaje.creado_en
    })));
    const iniciadoMs = pedido.iniciado_en ? new Date(pedido.iniciado_en).getTime() : Number.NaN;
    const completadoMs = new Date(pedido.completado_en).getTime();
    const duracionSegundos = Number.isFinite(iniciadoMs) && Number.isFinite(completadoMs)
        ? Math.max(0, Math.round((completadoMs - iniciadoMs) / 1000))
        : null;
    const contenido = Buffer.from(JSON.stringify({
        pedido: {
            id: pedido.id,
            codigo: (0, orderCode_1.codigoPedido)(pedido.id),
            cliente_id: pedido.cliente_id,
            cliente_nombre: pedido.cliente_nombre,
            repartidor_id: pedido.repartidor_id,
            repartidor_nombre: pedido.repartidor_nombre,
            tipo_servicio: pedido.tipo_servicio,
            origen_texto: pedido.origen_texto,
            destino_texto: pedido.destino_texto,
            distancia_km: pedido.distancia_km,
            tarifa: pedido.tarifa,
            creado_en: pedido.creado_en,
            iniciado_en: pedido.iniciado_en,
            completado_en: pedido.completado_en,
            duracion_segundos: duracionSegundos
        },
        mensajes
    }), 'utf8');
    const contenidoComprimido = await gzipAsync(contenido);
    await client.query(`INSERT INTO chat_archivos_admin
     (pedido_id, cliente_nombre, repartidor_nombre, tipo_servicio, iniciado_en, completado_en,
      duracion_segundos, cantidad_mensajes, vence_en, contenido_comprimido)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $6::timestamptz + INTERVAL '15 days', $9)
     ON CONFLICT (pedido_id) DO UPDATE SET
       cliente_nombre = EXCLUDED.cliente_nombre,
       repartidor_nombre = EXCLUDED.repartidor_nombre,
       tipo_servicio = EXCLUDED.tipo_servicio,
       iniciado_en = EXCLUDED.iniciado_en,
       completado_en = EXCLUDED.completado_en,
       duracion_segundos = EXCLUDED.duracion_segundos,
       cantidad_mensajes = EXCLUDED.cantidad_mensajes,
       vence_en = EXCLUDED.vence_en,
       contenido_comprimido = EXCLUDED.contenido_comprimido`, [
        pedido.id,
        pedido.cliente_nombre,
        pedido.repartidor_nombre,
        pedido.tipo_servicio,
        pedido.iniciado_en,
        pedido.completado_en,
        duracionSegundos,
        mensajes.length,
        contenidoComprimido
    ]);
};
const limpiarChatsExpirados = async () => {
    await exports.tablasPedidosListas;
    await db_1.pool.query(`DELETE FROM chat_mensajes cm USING pedidos p
     WHERE p.id = cm.pedido_id AND p.estado = 'completado'
       AND p.completado_en <= CURRENT_TIMESTAMP - INTERVAL '7 days'`);
    await db_1.pool.query('DELETE FROM chat_archivos_admin WHERE vence_en <= CURRENT_TIMESTAMP');
};
const temporizadorChats = setInterval(() => {
    void limpiarChatsExpirados().catch(error => console.error('Error limpiando chats expirados:', error));
}, 60_000);
temporizadorChats.unref();
void limpiarChatsExpirados().catch(error => console.error('Error limpiando chats expirados:', error));
router.use(auth_1.requireAuth);
router.get('/admin/chat-archives', auth_1.requireAdmin, async (_req, res) => {
    try {
        await exports.tablasPedidosListas;
        const result = await db_1.pool.query(`SELECT pedido_id, cliente_nombre, repartidor_nombre, tipo_servicio, iniciado_en,
              completado_en, duracion_segundos, cantidad_mensajes, vence_en
       FROM chat_archivos_admin
       WHERE vence_en > CURRENT_TIMESTAMP
       ORDER BY completado_en DESC`);
        res.json({ archivos: result.rows });
    }
    catch (error) {
        console.error('Error al consultar archivos de chat:', error);
        res.status(500).json({ error: 'No se pudieron cargar los archivos de chat.' });
    }
});
router.get('/admin/chat-archives/:id', auth_1.requireAdmin, async (req, res) => {
    const id = getOrderId(req.params.id);
    if (!id)
        return res.status(400).json({ error: 'El pedido indicado no es válido.' });
    try {
        await exports.tablasPedidosListas;
        const result = await db_1.pool.query(`SELECT contenido_comprimido FROM chat_archivos_admin
       WHERE pedido_id = $1 AND vence_en > CURRENT_TIMESTAMP`, [id]);
        if (result.rows.length === 0)
            return res.status(404).json({ error: 'El archivo no existe o ya expiró.' });
        res.setHeader('Content-Type', 'application/gzip');
        res.setHeader('Content-Disposition', `attachment; filename="chat-pedido-${id}.json.gz"`);
        res.setHeader('Cache-Control', 'private, no-store');
        res.send(result.rows[0].contenido_comprimido);
    }
    catch (error) {
        console.error('Error al descargar archivo de chat:', error);
        res.status(500).json({ error: 'No se pudo descargar el archivo de chat.' });
    }
});
router.get('/admin/buscar', auth_1.requireAdmin, async (req, res) => {
    const modo = typeof req.query.modo === 'string' ? req.query.modo : 'texto';
    const consulta = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 120) : '';
    const fecha = typeof req.query.fecha === 'string' ? req.query.fecha.trim() : '';
    const hora = typeof req.query.hora === 'string' ? req.query.hora.trim() : '';
    const desfaseQuery = req.query.desfase;
    const desfase = desfaseQuery === undefined
        ? 0
        : typeof desfaseQuery === 'string' && desfaseQuery.trim()
            ? Number(desfaseQuery)
            : Number.NaN;
    if (!['codigo', 'fecha', 'texto'].includes(modo)) {
        return res.status(400).json({ error: 'El tipo de búsqueda no es válido.' });
    }
    if (modo === 'codigo' && (consulta.length < 2 || !/^\d+$/.test(consulta))) {
        return res.status(400).json({ error: 'El código del pedido debe contener solo números.' });
    }
    if (modo === 'texto' && consulta.length < 2) {
        return res.status(400).json({ error: 'Escribe al menos dos caracteres para buscar.' });
    }
    if (modo === 'fecha' && ((!fecha && !hora)
        || (fecha && !(0, orderSearch_1.fechaIsoValida)(fecha))
        || (hora && !(0, orderSearch_1.horaPedidoValida)(hora))
        || !(0, orderSearch_1.desfaseHorarioValido)(desfase))) {
        return res.status(400).json({ error: 'Selecciona una fecha válida, una hora válida o ambas.' });
    }
    try {
        const condiciones = [];
        const parametros = [];
        if (modo === 'codigo' || modo === 'texto') {
            const patron = `$${parametros.length + 1}`;
            parametros.push(`%${consulta}%`);
            const idParam = `$${parametros.length + 1}`;
            const digitos = consulta.replace(/\D/g, '');
            const id = digitos && Number.isSafeInteger(Number(digitos)) ? Number(digitos) : null;
            parametros.push(id);
            condiciones.push(`(
        concat('LLV-', lpad(p.id::text, 6, '0')) ILIKE ${patron}
        OR p.id = ${idParam}
        OR p.cliente_nombre ILIKE ${patron}
        OR COALESCE(u.email, '') ILIKE ${patron}
        OR COALESCE(u.telefono, '') ILIKE ${patron}
        OR COALESCE(p.cliente_cedula, '') ILIKE ${patron}
        OR COALESCE(p.repartidor_nombre, '') ILIKE ${patron}
        OR p.tipo_servicio ILIKE ${patron}
        OR p.descripcion ILIKE ${patron}
        OR p.origen_texto ILIKE ${patron}
        OR p.destino_texto ILIKE ${patron}
        OR p.estado ILIKE ${patron}
        OR COALESCE(p.motivo_cancelacion, '') ILIKE ${patron}
        OR p.tarifa::text ILIKE ${patron}
        OR p.distancia_km::text ILIKE ${patron}
        OR COALESCE(p.referencia_pago, '') ILIKE ${patron}
      )`);
        }
        let desfaseParam = '';
        if (modo === 'fecha') {
            parametros.push(desfase);
            desfaseParam = `$${parametros.length}`;
        }
        if (modo === 'fecha' && fecha) {
            parametros.push(fecha);
            condiciones.push(`(p.creado_en - (${desfaseParam}::integer * INTERVAL '1 minute'))::date = $${parametros.length}::date`);
        }
        if (modo === 'fecha' && hora) {
            parametros.push(hora);
            condiciones.push(`date_trunc('minute', p.creado_en - (${desfaseParam}::integer * INTERVAL '1 minute'))::time = $${parametros.length}::time`);
        }
        const result = await db_1.pool.query(`SELECT p.id, concat('LLV-', lpad(p.id::text, 6, '0')) AS codigo,
              p.cliente_nombre, u.email AS cliente_email, p.repartidor_nombre,
              p.tipo_servicio, p.descripcion, p.origen_texto, p.destino_texto,
              p.distancia_km, p.tarifa, p.metodo_pago, p.estado_pago, p.estado,
              p.creado_en, p.motivo_cancelacion
       FROM pedidos p
       LEFT JOIN usuarios u ON u.id = p.cliente_id
       WHERE ${condiciones.join(' AND ')}
       ORDER BY p.creado_en DESC, p.id DESC
       LIMIT 100`, parametros);
        res.json({ pedidos: result.rows });
    }
    catch (error) {
        console.error('Error buscando pedidos en administración:', error);
        res.status(500).json({ error: 'No se pudieron buscar los pedidos.' });
    }
});
const getOrderId = (value) => {
    if (typeof value !== 'string' && typeof value !== 'number')
        return null;
    if (typeof value === 'string' && !/^\d+$/.test(value))
        return null;
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
};
const expirarPedidoSiCorresponde = async (client, id) => {
    const pedidoResult = await client.query(`SELECT id, cliente_id, tarifa, metodo_pago, estado_pago, referencia_pago, publicado_en
     FROM pedidos
     WHERE id = $1 AND estado IN ('pendiente', 'postulado')
     FOR UPDATE`, [id]);
    if (pedidoResult.rows.length === 0)
        return false;
    const pedido = pedidoResult.rows[0];
    if (!(0, payments_1.solicitudExpirada)(pedido.publicado_en)
        || (pedido.metodo_pago === 'pago_movil' && pedido.estado_pago !== 'pagado'))
        return false;
    const postulacionPendiente = await client.query("SELECT id FROM postulaciones WHERE pedido_id = $1 AND estado = 'pendiente' LIMIT 1", [id]);
    if (postulacionPendiente.rows.length > 0)
        return false;
    const nuevoEstadoPago = (0, payments_1.estadoPagoAlCancelar)(pedido.metodo_pago, pedido.estado_pago);
    const cancelado = await client.query(`UPDATE pedidos
     SET estado = 'cancelado', estado_pago = $2, motivo_cancelacion = 'sin_repartidor'
     WHERE id = $1 AND estado IN ('pendiente', 'postulado')
     RETURNING id`, [id, nuevoEstadoPago]);
    if (cancelado.rowCount === 0)
        return false;
    if (pedido.metodo_pago === 'saldo_corporativo' && nuevoEstadoPago === 'reembolsado') {
        const saldo = await client.query(`INSERT INTO saldos_corporativos (cliente_id, saldo)
       VALUES ($1, $2)
       ON CONFLICT (cliente_id) DO UPDATE
         SET saldo = saldos_corporativos.saldo + EXCLUDED.saldo
       RETURNING saldo`, [pedido.cliente_id, Number(pedido.tarifa)]);
        await client.query(`INSERT INTO movimientos_saldo
       (cliente_id, monto, saldo_resultante, tipo, pedido_id, nota)
       VALUES ($1, $2, $3, 'reembolso', $4, $5)`, [pedido.cliente_id, Number(pedido.tarifa), saldo.rows[0].saldo, id, `Reembolso automático por expiración del pedido ${id}`]);
    }
    const detalle = pedido.metodo_pago === 'saldo_corporativo' && nuevoEstadoPago === 'reembolsado'
        ? 'No hubo postulaciones en 60 segundos; el saldo anterior quedó registrado para conciliación manual.'
        : pedido.metodo_pago === 'pago_movil' && nuevoEstadoPago === 'reembolso_pendiente'
            ? 'No hubo postulaciones en 60 segundos; el pago móvil quedó pendiente de verificación para reembolso.'
            : 'No hubo postulaciones en 60 segundos y el pedido se canceló automáticamente.';
    await client.query(`INSERT INTO historial_pagos
     (pedido_id, actor_rol, accion, metodo_pago, estado_pago, monto, referencia_pago, detalle)
     VALUES ($1, 'sistema', 'pedido_expirado', $2, $3, $4, $5, $6)`, [id, pedido.metodo_pago, nuevoEstadoPago, pedido.tarifa, pedido.referencia_pago, detalle]);
    await (0, activity_1.registrarActividad)(client, null, 'sistema', 'pedido_expirado', detalle, id);
    return true;
};
let procesandoExpiraciones = false;
const procesarPedidosExpirados = async () => {
    if (procesandoExpiraciones)
        return;
    procesandoExpiraciones = true;
    let client = null;
    try {
        await exports.tablasPedidosListas;
        client = await db_1.pool.connect();
        await client.query('BEGIN');
        const expirables = await client.query(`SELECT p.id
       FROM pedidos p
       WHERE p.estado IN ('pendiente', 'postulado')
         AND p.publicado_en IS NOT NULL
         AND p.publicado_en <= CURRENT_TIMESTAMP - INTERVAL '60 seconds'
         AND (p.metodo_pago <> 'pago_movil' OR p.estado_pago = 'pagado')
         AND NOT EXISTS (
           SELECT 1 FROM postulaciones po
           WHERE po.pedido_id = p.id AND po.estado = 'pendiente'
         )
       ORDER BY p.publicado_en
       LIMIT 50
       FOR UPDATE OF p SKIP LOCKED`);
        for (const pedido of expirables.rows) {
            await expirarPedidoSiCorresponde(client, Number(pedido.id));
        }
        await client.query('COMMIT');
    }
    catch (error) {
        console.error('Error al cancelar pedidos sin postulaciones:', error);
        try {
            if (client)
                await client.query('ROLLBACK');
        }
        catch (rollbackError) {
            console.error('Error al revertir la cancelación automática:', rollbackError);
        }
    }
    finally {
        client?.release();
        procesandoExpiraciones = false;
    }
};
const temporizadorExpiraciones = setInterval(() => {
    void procesarPedidosExpirados();
}, 5000);
temporizadorExpiraciones.unref();
router.post('/', (0, auth_1.requireRole)('cliente'), async (req, res) => {
    const authUser = req.authUser;
    if (!authUser)
        return res.status(401).json({ error: 'Sesión inválida.' });
    const { cliente_foto, tipo_servicio, descripcion, origen_texto, origen_lat, origen_lon, destino_texto, destino_lat, destino_lon, distancia_km, tiempo_min, tarifa, metodo_pago, referencia_pago } = req.body ?? {};
    const origenLat = Number(origen_lat);
    const origenLon = Number(origen_lon);
    const destinoLat = Number(destino_lat);
    const destinoLon = Number(destino_lon);
    const distancia = Number(distancia_km);
    const tiempo = Number(tiempo_min);
    const montoSolicitado = Number(tarifa);
    const serviciosPermitidos = ['envios', 'viajes', 'comida', 'mercado', 'mandados'];
    const metodosPagoPermitidos = ['pago_movil'];
    const metodoPago = metodo_pago;
    const referenciaPago = typeof referencia_pago === 'string' ? referencia_pago.trim() : '';
    let tarifas;
    try {
        tarifas = await (0, pricingSettings_1.obtenerConfiguracionTarifas)();
    }
    catch (error) {
        console.error('No se pudo cargar la configuración de tarifas al crear un pedido:', error);
        return res.status(503).json({ error: 'No se pudieron cargar las tarifas actuales.' });
    }
    const montoCalculado = (0, pricing_1.calcularTarifa)(tipo_servicio, distancia, tarifas);
    if (!serviciosPermitidos.includes(tipo_servicio)
        || typeof descripcion !== 'string' || !descripcion.trim() || descripcion.length > 500
        || typeof origen_texto !== 'string' || !origen_texto.trim() || origen_texto.length > 300
        || typeof destino_texto !== 'string' || !destino_texto.trim() || destino_texto.length > 300
        || !Number.isFinite(origenLat) || origenLat < -90 || origenLat > 90
        || !Number.isFinite(origenLon) || origenLon < -180 || origenLon > 180
        || !Number.isFinite(destinoLat) || destinoLat < -90 || destinoLat > 90
        || !Number.isFinite(destinoLon) || destinoLon < -180 || destinoLon > 180
        || !Number.isFinite(distancia) || distancia <= 0 || distancia > 1000
        || !Number.isSafeInteger(tiempo) || tiempo <= 0 || tiempo > 10000
        || !Number.isFinite(montoSolicitado) || Math.abs(montoSolicitado - montoCalculado) > 0.01
        || montoCalculado > 10000
        || !metodosPagoPermitidos.includes(metodoPago)
        || (metodoPago === 'pago_movil' && !(0, payments_1.referenciaPagoValida)(referenciaPago))) {
        return res.status(400).json({ error: 'Los datos del pedido o de la ruta no son válidos.' });
    }
    const estadoPago = 'pendiente';
    let client = null;
    try {
        await exports.tablasPedidosListas;
        client = await db_1.pool.connect();
        await client.query('BEGIN');
        const cliente = await client.query('SELECT nombre FROM usuarios WHERE id = $1 AND (rol = $2 OR es_admin = TRUE)', [authUser.id, 'cliente']);
        if (cliente.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(401).json({ error: 'La cuenta de cliente ya no está disponible.' });
        }
        if (metodoPago === 'pago_movil') {
            const datosPago = await client.query(`SELECT banco, telefono, cedula, titular FROM configuracion_pago_movil WHERE id = 1`);
            const config = datosPago.rows[0];
            if (!config || !config.banco || !config.telefono || !config.cedula || !config.titular) {
                await client.query('ROLLBACK');
                return res.status(409).json({ error: 'Pago Móvil todavía no está configurado por Llévalo.' });
            }
        }
        const result = await client.query(`INSERT INTO pedidos
      (cliente_id, cliente_nombre, cliente_cedula, cliente_foto, tipo_servicio, descripcion, origen_texto, origen_lat, origen_lon, destino_texto, destino_lat, destino_lon, distancia_km, tiempo_min, tarifa, metodo_pago, estado_pago, referencia_pago, pago_confirmado_por, pago_confirmado_en, estado, publicado_en)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
              $19::integer,
              CASE WHEN $20 THEN CURRENT_TIMESTAMP ELSE NULL END, 'pendiente',
              CASE WHEN $16::varchar = 'pago_movil' THEN NULL ELSE CURRENT_TIMESTAMP END)
      RETURNING *`, [
            authUser.id, cliente.rows[0].nombre,
            null,
            typeof cliente_foto === 'string' ? cliente_foto : '',
            tipo_servicio, descripcion.trim(), origen_texto.trim(), origenLat, origenLon,
            destino_texto.trim(), destinoLat, destinoLon, distancia, tiempo, montoCalculado,
            metodoPago, estadoPago, referenciaPago || null,
            null, false
        ]);
        if (metodoPago === 'pago_movil') {
            await client.query(`INSERT INTO historial_pagos
         (pedido_id, actor_id, actor_rol, accion, metodo_pago, estado_pago, monto, referencia_pago, detalle)
         VALUES ($1, $2, 'cliente', $3, $4, $5, $6, $7, $8)`, [
                result.rows[0].id, authUser.id,
                'referencia_enviada',
                metodoPago, estadoPago, montoCalculado, referenciaPago || null,
                'El cliente envió una referencia para revisión.'
            ]);
        }
        await (0, activity_1.registrarActividad)(client, authUser.id, authUser.rol, 'pedido_creado', `Creó ${tipo_servicio === 'viajes' ? 'un viaje' : 'un envío'} por $${montoCalculado.toFixed(2)} con ${metodoPago}. ${origen_texto.trim()} → ${destino_texto.trim()}.`, Number(result.rows[0].id));
        await client.query('COMMIT');
        const pedidoCreado = result.rows[0];
        if (pedidoCreado.publicado_en) {
            void (0, pushNotifications_1.notifyDriversOfNewOrder)(pedidoCreado).catch(error => {
                console.error('No se pudo notificar a los repartidores sobre el nuevo pedido:', error);
            });
        }
        res.status(201).json({ mensaje: 'Pedido publicado', pedido: (0, orderPrivacy_1.sanitizarPedidoParaUsuario)(pedidoCreado) });
    }
    catch (error) {
        console.error('Error al crear pedido:', error);
        try {
            if (client)
                await client.query('ROLLBACK');
        }
        catch (rollbackError) {
            console.error('Error al revertir la creación del pedido:', rollbackError);
        }
        res.status(500).json({ error: 'Error al crear el pedido.' });
    }
    finally {
        client?.release();
    }
});
router.get('/historial/repartidor', (0, auth_1.requireRole)('repartidor'), async (req, res) => {
    const authUser = req.authUser;
    if (!authUser)
        return res.status(401).json({ error: 'Sesión inválida.' });
    let cursorTimestamp = null;
    let cursorId = null;
    if (req.query.cursor !== undefined) {
        const cursor = req.query.cursor;
        if (typeof cursor !== 'string') {
            return res.status(400).json({ error: 'El cursor del historial no es válido.' });
        }
        const separator = cursor.lastIndexOf('|');
        const timestamp = cursor.slice(0, separator);
        const id = Number(cursor.slice(separator + 1));
        if (separator <= 0 || !Number.isFinite(Date.parse(timestamp)) || !Number.isSafeInteger(id) || id <= 0 || id > 2_147_483_647) {
            return res.status(400).json({ error: 'El cursor del historial no es válido.' });
        }
        cursorTimestamp = new Date(timestamp).toISOString();
        cursorId = id;
    }
    try {
        await exports.tablasPedidosListas;
        const resultado = await db_1.pool.query(`SELECT id, tipo_servicio, origen_texto, destino_texto, tarifa::text AS tarifa,
              creado_en, completado_en
       FROM pedidos
       WHERE repartidor_id = $1
         AND estado = 'completado'
         AND completado_en IS NOT NULL
         AND ($2::timestamptz IS NULL OR (completado_en, id) < ($2::timestamptz, $3::integer))
       ORDER BY completado_en DESC, id DESC
       LIMIT $4`, [authUser.id, cursorTimestamp, cursorId, HISTORIAL_REPARTIDOR_PAGE_SIZE + 1]);
        const hayMas = resultado.rows.length > HISTORIAL_REPARTIDOR_PAGE_SIZE;
        const pedidos = resultado.rows.slice(0, HISTORIAL_REPARTIDOR_PAGE_SIZE);
        const ultimoPedido = pedidos[pedidos.length - 1];
        const nextCursor = hayMas && ultimoPedido
            ? `${new Date(ultimoPedido.completado_en).toISOString()}|${ultimoPedido.id}`
            : null;
        return res.json({ pedidos, nextCursor });
    }
    catch (error) {
        console.error('Error al consultar el historial del repartidor:', error);
        return res.status(500).json({ error: 'No se pudo cargar el historial de trabajos.' });
    }
});
router.get('/', async (req, res) => {
    const authUser = req.authUser;
    if (!authUser)
        return res.status(401).json({ error: 'Sesión inválida.' });
    try {
        const pedidosRes = authUser.rol === 'cliente'
            ? await db_1.pool.query(`SELECT * FROM pedidos
         WHERE cliente_id = $1
           AND (estado != 'cancelado'
                OR (motivo_cancelacion IN ('sin_repartidor', 'repartidor_cancelado')
                    AND creado_en >= CURRENT_TIMESTAMP - INTERVAL '10 minutes'))
         ORDER BY creado_en DESC`, [authUser.id])
            : await db_1.pool.query(`SELECT id, cliente_id, cliente_nombre, tipo_servicio, descripcion,
                origen_texto, origen_lat, origen_lon, destino_texto, destino_lat, destino_lon,
                distancia_km, tiempo_min, tarifa, metodo_pago, estado_pago, estado, repartidor_id, repartidor_nombre,
                repartidor_vehiculo, repartidor_placa, repartidor_foto, repartidor_vehiculo_foto,
                repartidor_calificacion, repartidor_lat, repartidor_lon, creado_en, publicado_en,
                iniciado_en, completado_en
         FROM pedidos
         WHERE (estado IN ('pendiente', 'postulado')
                AND (metodo_pago IN ('efectivo', 'no_aplica') OR estado_pago = 'pagado'))
            OR (repartidor_id = $1 AND (
                  estado IN ('aceptado', 'entregado_repartidor')
                  OR (estado = 'completado' AND completado_en > CURRENT_TIMESTAMP - INTERVAL '7 days')
                ))
         ORDER BY creado_en DESC`, [authUser.id]);
        const postulacionesRes = authUser.rol === 'cliente'
            ? await db_1.pool.query(`SELECT po.id, po.pedido_id, po.repartidor_id, po.repartidor_nombre,
                po.vehiculo, po.calificacion, po.estado
         FROM postulaciones po
         JOIN pedidos pe ON pe.id = po.pedido_id
         WHERE pe.cliente_id = $1`, [authUser.id])
            : await db_1.pool.query('SELECT * FROM postulaciones WHERE repartidor_id = $1', [authUser.id]);
        const chatRes = authUser.rol === 'cliente'
            ? await db_1.pool.query(`SELECT cm.id, cm.pedido_id, cm.remitente_id, cm.remitente_nombre, cm.mensaje,
                cm.tipo, cm.media_mime, cm.media_nombre, cm.media_bytes, cm.creado_en
         FROM chat_mensajes cm
         JOIN pedidos pe ON pe.id = cm.pedido_id
         WHERE pe.cliente_id = $1
           AND (pe.estado <> 'completado' OR pe.completado_en > CURRENT_TIMESTAMP - INTERVAL '7 days')
         ORDER BY cm.creado_en ASC`, [authUser.id])
            : await db_1.pool.query(`SELECT cm.id, cm.pedido_id, cm.remitente_id, cm.remitente_nombre, cm.mensaje,
                cm.tipo, cm.media_mime, cm.media_nombre, cm.media_bytes, cm.creado_en
         FROM chat_mensajes cm
         JOIN pedidos pe ON pe.id = cm.pedido_id
         WHERE pe.repartidor_id = $1
           AND (pe.estado <> 'completado' OR pe.completado_en > CURRENT_TIMESTAMP - INTERVAL '7 days')
         ORDER BY cm.creado_en ASC`, [authUser.id]);
        const pedidos = pedidosRes.rows.map(orderPrivacy_1.sanitizarPedidoParaUsuario);
        res.json({ pedidos, postulaciones: postulacionesRes.rows, mensajes: chatRes.rows });
    }
    catch (error) {
        console.error('Error al consultar pedidos:', error);
        res.status(500).json({ error: 'Error al consultar' });
    }
});
router.post('/:id/postular', (0, auth_1.requireRole)('repartidor'), async (req, res) => {
    const authUser = req.authUser;
    const id = getOrderId(req.params.id);
    if (!authUser)
        return res.status(401).json({ error: 'Sesión inválida.' });
    if (!id)
        return res.status(400).json({ error: 'Pedido inválido.' });
    const client = await db_1.pool.connect();
    try {
        await client.query('BEGIN');
        const pedido = await client.query('SELECT cliente_id, estado, publicado_en, metodo_pago, estado_pago FROM pedidos WHERE id = $1 FOR UPDATE', [id]);
        if (pedido.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Pedido no encontrado.' });
        }
        if (pedido.rows[0].cliente_id === authUser.id) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: 'No puedes postularte a tu propio pedido.' });
        }
        if (!['pendiente', 'postulado'].includes(pedido.rows[0].estado)) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'Este pedido ya no acepta postulaciones.' });
        }
        if (!pedido.rows[0].publicado_en
            || (pedido.rows[0].metodo_pago === 'pago_movil' && pedido.rows[0].estado_pago !== 'pagado')) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'Este pedido todavía no está publicado en el radar.' });
        }
        if ((0, payments_1.solicitudExpirada)(pedido.rows[0].publicado_en)
            && await expirarPedidoSiCorresponde(client, id)) {
            await client.query('COMMIT');
            return res.status(409).json({ error: 'El pedido venció porque ningún repartidor se postuló en 60 segundos.' });
        }
        const repartidor = await client.query(`SELECT nombre, vehiculo, placa, vehiculo_foto, calificacion
       FROM usuarios
       WHERE id = $1 AND (rol = $2 OR es_admin = TRUE)
         AND correo_verificado = TRUE`, [authUser.id, 'repartidor']);
        if (repartidor.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(401).json({ error: 'La cuenta de repartidor ya no está disponible.' });
        }
        if (!repartidor.rows[0].vehiculo || !repartidor.rows[0].placa) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'Completa el tipo de vehículo y la placa en tu perfil antes de postularte.' });
        }
        const existe = await client.query('SELECT id FROM postulaciones WHERE pedido_id = $1 AND repartidor_id = $2', [id, authUser.id]);
        if (existe.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Ya te postulaste a este pedido.' });
        }
        const nueva = await client.query(`INSERT INTO postulaciones (pedido_id, repartidor_id, repartidor_nombre, vehiculo, placa, vehiculo_foto, calificacion, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pendiente') RETURNING *`, [
            id, authUser.id, repartidor.rows[0].nombre, repartidor.rows[0].vehiculo,
            repartidor.rows[0].placa, repartidor.rows[0].vehiculo_foto || '',
            repartidor.rows[0].calificacion || 5.0
        ]);
        await client.query("UPDATE pedidos SET estado = 'postulado' WHERE id = $1 AND estado = 'pendiente'", [id]);
        await (0, activity_1.registrarActividad)(client, authUser.id, authUser.rol, 'repartidor_postulado', `Se postuló al pedido ${(0, orderCode_1.codigoPedido)(id)}.`, id);
        await client.query('COMMIT');
        res.json({ mensaje: 'Postulación enviada', postulacion: nueva.rows[0] });
    }
    catch (error) {
        console.error('Error al postularse:', error);
        try {
            await client.query('ROLLBACK');
        }
        catch (rollbackError) {
            console.error('Error al revertir la postulación:', rollbackError);
        }
        res.status(500).json({ error: 'Error al postularse' });
    }
    finally {
        client.release();
    }
});
// Cancelar postulación individual del repartidor
router.delete('/:id/postular/:repartidor_id', (0, auth_1.requireRole)('repartidor'), async (req, res) => {
    const authUser = req.authUser;
    const id = getOrderId(req.params.id);
    const repartidorId = getOrderId(req.params.repartidor_id);
    if (!authUser)
        return res.status(401).json({ error: 'Sesión inválida.' });
    if (!id || repartidorId !== authUser.id)
        return res.status(403).json({ error: 'No tienes permiso para cancelar esta postulación.' });
    const client = await db_1.pool.connect();
    try {
        await client.query('BEGIN');
        const pedido = await client.query('SELECT estado, tipo_servicio, tarifa, origen_texto, destino_texto FROM pedidos WHERE id = $1 FOR UPDATE', [id]);
        if (pedido.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Pedido no encontrado.' });
        }
        const eliminada = await client.query("DELETE FROM postulaciones WHERE pedido_id = $1 AND repartidor_id = $2 AND estado = 'pendiente' RETURNING id", [id, authUser.id]);
        if (eliminada.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'La postulación ya no está activa.' });
        }
        await (0, activity_1.registrarActividad)(client, authUser.id, authUser.rol, 'postulacion_cancelada', `Canceló su postulación al pedido ${(0, orderCode_1.codigoPedido)(id)} (${pedido.rows[0].tipo_servicio}, $${pedido.rows[0].tarifa}). ${pedido.rows[0].origen_texto} → ${pedido.rows[0].destino_texto}.`, id);
        const restantes = await client.query("SELECT id FROM postulaciones WHERE pedido_id = $1 AND estado = 'pendiente'", [id]);
        if (restantes.rows.length === 0) {
            await client.query("UPDATE pedidos SET estado = 'pendiente', publicado_en = CURRENT_TIMESTAMP WHERE id = $1 AND estado = 'postulado'", [id]);
        }
        await client.query('COMMIT');
        res.json({ mensaje: 'Postulación cancelada' });
    }
    catch (error) {
        console.error('Error al cancelar postulación:', error);
        try {
            await client.query('ROLLBACK');
        }
        catch (rollbackError) {
            console.error('Error al revertir la cancelación de postulación:', rollbackError);
        }
        res.status(500).json({ error: 'Error al cancelar postulación' });
    }
    finally {
        client.release();
    }
});
router.put('/:id/aceptar-postulacion', (0, auth_1.requireRole)('cliente'), async (req, res) => {
    const authUser = req.authUser;
    const id = getOrderId(req.params.id);
    const repartidorId = getOrderId(req.body?.repartidor_id);
    if (!authUser)
        return res.status(401).json({ error: 'Sesión inválida.' });
    if (!id || !repartidorId)
        return res.status(400).json({ error: 'Pedido o repartidor inválido.' });
    const client = await db_1.pool.connect();
    try {
        await client.query('BEGIN');
        const pedido = await client.query('SELECT estado FROM pedidos WHERE id = $1 AND cliente_id = $2 FOR UPDATE', [id, authUser.id]);
        if (pedido.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Pedido no encontrado.' });
        }
        if (pedido.rows[0].estado !== 'postulado') {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'El pedido ya no está esperando una selección.' });
        }
        const postulacion = await client.query(`SELECT repartidor_id, repartidor_nombre, vehiculo, placa, vehiculo_foto, calificacion
       FROM postulaciones
       WHERE pedido_id = $1 AND repartidor_id = $2 AND estado = 'pendiente'`, [id, repartidorId]);
        if (postulacion.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'La postulación ya no está disponible.' });
        }
        const elegido = postulacion.rows[0];
        await client.query("UPDATE postulaciones SET estado = 'aceptado' WHERE pedido_id = $1 AND repartidor_id = $2", [id, repartidorId]);
        await client.query("UPDATE postulaciones SET estado = 'rechazado' WHERE pedido_id = $1 AND repartidor_id != $2", [id, repartidorId]);
        const pedidoActualizado = await client.query(`UPDATE pedidos
       SET estado = 'aceptado', repartidor_id = $1, repartidor_nombre = $2, repartidor_vehiculo = $3, repartidor_placa = $4, repartidor_vehiculo_foto = $5, repartidor_calificacion = $6
       WHERE id = $7 AND cliente_id = $8 RETURNING *`, [elegido.repartidor_id, elegido.repartidor_nombre, elegido.vehiculo, elegido.placa, elegido.vehiculo_foto, elegido.calificacion, id, authUser.id]);
        const pedidoPublico = (0, orderPrivacy_1.sanitizarPedidoParaUsuario)(pedidoActualizado.rows[0]);
        await (0, activity_1.registrarActividad)(client, authUser.id, authUser.rol, 'repartidor_asignado', `Seleccionó a ${elegido.repartidor_nombre} para el pedido ${(0, orderCode_1.codigoPedido)(id)}. ${pedidoActualizado.rows[0].tipo_servicio} por $${pedidoActualizado.rows[0].tarifa}. ${pedidoActualizado.rows[0].origen_texto} → ${pedidoActualizado.rows[0].destino_texto}.`, id);
        await client.query('COMMIT');
        void (0, pushNotifications_1.notifyDriverOfUpdate)(elegido.repartidor_id, id, '¡Te eligieron para el trabajo!', 'Abre Llévalo para revisar los datos del servicio y comenzar.').catch(error => {
            console.error('No se pudo notificar al repartidor seleccionado:', error);
        });
        res.json({ mensaje: 'Repartidor seleccionado', pedido: pedidoPublico });
    }
    catch (error) {
        console.error('Error al aceptar postulación:', error);
        try {
            await client.query('ROLLBACK');
        }
        catch (rollbackError) {
            console.error('Error al revertir la aceptación:', rollbackError);
        }
        res.status(500).json({ error: 'Error al aceptar' });
    }
    finally {
        client.release();
    }
});
// Actualizar ubicación GPS en tiempo real del repartidor
router.put('/:id/ubicacion-repartidor', (0, auth_1.requireRole)('repartidor'), async (req, res) => {
    const authUser = req.authUser;
    const id = getOrderId(req.params.id);
    const { lat, lon } = req.body ?? {};
    const latitude = Number(lat);
    const longitude = Number(lon);
    if (!authUser)
        return res.status(401).json({ error: 'Sesión inválida.' });
    if (!id || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
        || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        return res.status(400).json({ error: 'La ubicación no es válida.' });
    }
    try {
        const result = await db_1.pool.query(`UPDATE pedidos SET repartidor_lat = $1, repartidor_lon = $2
       WHERE id = $3 AND repartidor_id = $4 AND estado IN ('aceptado', 'entregado_repartidor')`, [latitude, longitude, id, authUser.id]);
        if (result.rowCount === 0)
            return res.status(404).json({ error: 'No tienes una entrega activa con ese pedido.' });
        res.json({ mensaje: 'Ubicación actualizada' });
    }
    catch (error) {
        console.error('Error al actualizar ubicación:', error);
        res.status(500).json({ error: 'Error al actualizar ubicación' });
    }
});
router.post('/:id/chat', async (req, res) => {
    const authUser = req.authUser;
    const id = getOrderId(req.params.id);
    const mensaje = req.body?.mensaje;
    if (!authUser)
        return res.status(401).json({ error: 'Sesión inválida.' });
    if (!id || typeof mensaje !== 'string' || !mensaje.trim() || mensaje.length > 2000) {
        return res.status(400).json({ error: 'El mensaje no es válido.' });
    }
    try {
        const order = await db_1.pool.query(`SELECT id FROM pedidos
       WHERE id = $1 AND (cliente_id = $2 OR repartidor_id = $2)
         AND (
           estado IN ('aceptado', 'entregado_repartidor')
           OR (estado = 'completado' AND completado_en > CURRENT_TIMESTAMP - INTERVAL '7 days')
         )`, [id, authUser.id]);
        if (order.rows.length === 0)
            return res.status(404).json({ error: 'No tienes acceso al chat de este pedido.' });
        const sender = await db_1.pool.query('SELECT nombre FROM usuarios WHERE id = $1', [authUser.id]);
        if (sender.rows.length === 0)
            return res.status(401).json({ error: 'La cuenta ya no está disponible.' });
        const nuevoMsg = await db_1.pool.query(`INSERT INTO chat_mensajes (pedido_id, remitente_id, remitente_nombre, mensaje)
       VALUES ($1, $2, $3, $4) RETURNING *`, [id, authUser.id, sender.rows[0].nombre, mensaje.trim()]);
        res.json(nuevoMsg.rows[0]);
    }
    catch (error) {
        console.error('Error en chat:', error);
        res.status(500).json({ error: 'Error chat' });
    }
});
router.post('/:id/chat/media', parseChatMediaBody, async (req, res) => {
    const authUser = req.authUser;
    const id = getOrderId(req.params.id);
    const tipo = req.query.tipo;
    const mime = (req.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
    const caption = typeof req.query.caption === 'string' ? req.query.caption.trim().slice(0, 500) : '';
    const rawName = typeof req.query.nombre === 'string' ? req.query.nombre : '';
    const nombre = rawName.replace(/[\\/\u0000-\u001f]/g, '').slice(0, 120);
    const tiposMime = {
        imagen: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
        audio: ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/aac']
    };
    if (!authUser)
        return res.status(401).json({ error: 'Sesión inválida.' });
    if (!id || (tipo !== 'imagen' && tipo !== 'audio') || !tiposMime[tipo].includes(mime)) {
        return res.status(400).json({ error: 'El tipo de archivo no es válido.' });
    }
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({ error: 'El archivo está vacío o no se pudo leer.' });
    }
    if (req.body.length > MAX_CHAT_MEDIA_BYTES) {
        return res.status(413).json({ error: 'El archivo supera el límite de 10 MB.' });
    }
    try {
        await exports.tablasPedidosListas;
        const order = await db_1.pool.query(`SELECT id FROM pedidos
       WHERE id = $1 AND (cliente_id = $2 OR repartidor_id = $2)
         AND (
           estado IN ('aceptado', 'entregado_repartidor')
           OR (estado = 'completado' AND completado_en > CURRENT_TIMESTAMP - INTERVAL '7 days')
         )`, [id, authUser.id]);
        if (order.rows.length === 0)
            return res.status(404).json({ error: 'No tienes acceso al chat de este pedido.' });
        const sender = await db_1.pool.query('SELECT nombre FROM usuarios WHERE id = $1', [authUser.id]);
        if (sender.rows.length === 0)
            return res.status(401).json({ error: 'La cuenta ya no está disponible.' });
        const mediaComprimida = await gzipAsync(req.body);
        const nuevoMensaje = await db_1.pool.query(`INSERT INTO chat_mensajes
       (pedido_id, remitente_id, remitente_nombre, mensaje, tipo, media_mime, media_nombre, media_comprimida, media_bytes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, pedido_id, remitente_id, remitente_nombre, mensaje, tipo, media_mime, media_nombre, media_bytes, creado_en`, [id, authUser.id, sender.rows[0].nombre, caption, tipo, mime, nombre || null, mediaComprimida, req.body.length]);
        res.status(201).json(nuevoMensaje.rows[0]);
    }
    catch (error) {
        console.error('Error al enviar archivo de chat:', error);
        res.status(500).json({ error: 'No se pudo enviar el archivo.' });
    }
});
router.get('/:id/chat/media/:mensajeId', async (req, res) => {
    const authUser = req.authUser;
    const id = getOrderId(req.params.id);
    const mensajeId = getOrderId(req.params.mensajeId);
    if (!authUser)
        return res.status(401).json({ error: 'Sesión inválida.' });
    if (!id || !mensajeId)
        return res.status(400).json({ error: 'El archivo indicado no es válido.' });
    try {
        await exports.tablasPedidosListas;
        const result = await db_1.pool.query(`SELECT cm.media_comprimida, cm.media_mime
       FROM chat_mensajes cm
       JOIN pedidos pe ON pe.id = cm.pedido_id
       WHERE cm.id = $1 AND cm.pedido_id = $2
         AND cm.media_comprimida IS NOT NULL
         AND (pe.cliente_id = $3 OR pe.repartidor_id = $3)
         AND (pe.estado <> 'completado' OR pe.completado_en > CURRENT_TIMESTAMP - INTERVAL '7 days')`, [mensajeId, id, authUser.id]);
        if (result.rows.length === 0)
            return res.status(404).json({ error: 'El archivo no existe o ya expiró.' });
        const media = await gunzipAsync(result.rows[0].media_comprimida);
        res.setHeader('Content-Type', result.rows[0].media_mime);
        res.setHeader('Cache-Control', 'private, no-store');
        res.send(media);
    }
    catch (error) {
        console.error('Error al descargar archivo de chat:', error);
        res.status(500).json({ error: 'No se pudo cargar el archivo.' });
    }
});
router.put('/:id/estado', async (req, res) => {
    const authUser = req.authUser;
    const id = getOrderId(req.params.id);
    const nuevoEstado = req.body?.nuevo_estado;
    if (!authUser)
        return res.status(401).json({ error: 'Sesión inválida.' });
    if (!id || !['cancelado', 'entregado_repartidor', 'completado'].includes(nuevoEstado)) {
        return res.status(400).json({ error: 'El estado solicitado no es válido.' });
    }
    if (nuevoEstado === 'cancelado' && authUser.rol === 'cliente') {
        let client = null;
        try {
            client = await db_1.pool.connect();
            await client.query('BEGIN');
            const cancelable = await client.query(`SELECT id, metodo_pago, estado_pago, tipo_servicio, tarifa, origen_texto, destino_texto FROM pedidos
         WHERE id = $1 AND cliente_id = $2
           AND (estado IN ('pendiente', 'postulado')
                OR (tipo_servicio = 'viajes' AND estado = 'aceptado'))
         FOR UPDATE`, [id, authUser.id]);
            if (cancelable.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(409).json({ error: 'El pedido no existe o ya no se puede cancelar.' });
            }
            const nuevoEstadoPago = (0, payments_1.estadoPagoAlCancelar)(cancelable.rows[0].metodo_pago, cancelable.rows[0].estado_pago);
            const cancelado = await client.query(`UPDATE pedidos SET estado = 'cancelado', estado_pago = $3, motivo_cancelacion = 'cliente_cancelado'
         WHERE id = $1 AND cliente_id = $2
         RETURNING *`, [id, authUser.id, nuevoEstadoPago]);
            await client.query("UPDATE postulaciones SET estado = 'rechazado' WHERE pedido_id = $1 AND estado IN ('pendiente', 'aceptado')", [id]);
            if (cancelado.rows[0].metodo_pago === 'saldo_corporativo' && cancelado.rows[0].estado_pago === 'reembolsado') {
                const saldo = await client.query(`INSERT INTO saldos_corporativos (cliente_id, saldo)
           VALUES ($1, $2)
           ON CONFLICT (cliente_id) DO UPDATE
             SET saldo = saldos_corporativos.saldo + EXCLUDED.saldo
           RETURNING saldo`, [authUser.id, Number(cancelado.rows[0].tarifa)]);
                await client.query(`INSERT INTO movimientos_saldo
           (cliente_id, monto, saldo_resultante, tipo, pedido_id, nota)
           VALUES ($1, $2, $3, 'reembolso', $4, $5)`, [authUser.id, Number(cancelado.rows[0].tarifa), saldo.rows[0].saldo, id, `Reembolso de pedido ${id}`]);
            }
            if (['reembolso_pendiente', 'reembolsado'].includes(cancelado.rows[0].estado_pago)) {
                await client.query(`INSERT INTO historial_pagos
           (pedido_id, actor_id, actor_rol, accion, metodo_pago, estado_pago, monto, referencia_pago, detalle)
           VALUES ($1, $2, 'cliente', $3, $4, $5, $6, $7, $8)`, [
                    id, authUser.id,
                    cancelado.rows[0].estado_pago === 'reembolsado' ? 'saldo_reembolsado' : 'reembolso_solicitado',
                    cancelado.rows[0].metodo_pago, cancelado.rows[0].estado_pago,
                    cancelado.rows[0].tarifa, cancelado.rows[0].referencia_pago,
                    cancelado.rows[0].estado_pago === 'reembolsado'
                        ? 'El saldo anterior quedó registrado para conciliación manual al cancelar el pedido.'
                        : 'El cliente canceló el pedido y solicitó verificar el pago para procesar el reembolso.'
                ]);
            }
            await (0, activity_1.registrarActividad)(client, authUser.id, authUser.rol, 'pedido_cancelado_cliente', `Canceló el pedido ${(0, orderCode_1.codigoPedido)(id)} (${cancelado.rows[0].tipo_servicio}) por $${cancelado.rows[0].tarifa}, pagado con ${cancelado.rows[0].metodo_pago}. ${cancelado.rows[0].origen_texto} → ${cancelado.rows[0].destino_texto}.`, id);
            await client.query('COMMIT');
            const estadoPagoFinal = cancelado.rows[0].estado_pago;
            const mensaje = estadoPagoFinal === 'reembolso_pendiente'
                ? 'Pedido cancelado. El administrador debe verificar el pago y procesar el reembolso.'
                : estadoPagoFinal === 'reembolsado'
                    ? 'Pedido cancelado. El saldo de este pedido anterior quedó registrado para conciliación manual.'
                    : 'Pedido cancelado.';
            return res.json({ mensaje, pedido: (0, orderPrivacy_1.sanitizarPedidoParaUsuario)(cancelado.rows[0]) });
        }
        catch (error) {
            console.error('Error al cancelar pedido:', error);
            try {
                if (client)
                    await client.query('ROLLBACK');
            }
            catch (rollbackError) {
                console.error('Error al revertir la cancelación del pedido:', rollbackError);
            }
            return res.status(500).json({ error: 'Error al cancelar el pedido.' });
        }
        finally {
            client?.release();
        }
    }
    if (nuevoEstado === 'cancelado' && authUser.rol === 'repartidor') {
        let client = null;
        try {
            client = await db_1.pool.connect();
            await client.query('BEGIN');
            const actual = await client.query(`SELECT * FROM pedidos
         WHERE id = $1 AND repartidor_id = $2 AND estado = 'aceptado'
         FOR UPDATE`, [id, authUser.id]);
            if (actual.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(409).json({ error: 'El pedido no existe o ya no se puede cancelar como repartidor.' });
            }
            const pedido = actual.rows[0];
            const nuevoEstadoPago = (0, payments_1.estadoPagoAlCancelar)(pedido.metodo_pago, pedido.estado_pago);
            const cancelado = await client.query(`UPDATE pedidos
         SET estado = 'cancelado', estado_pago = $2, motivo_cancelacion = 'repartidor_cancelado'
         WHERE id = $1
         RETURNING *`, [id, nuevoEstadoPago]);
            await client.query("UPDATE postulaciones SET estado = 'rechazado' WHERE pedido_id = $1 AND estado IN ('pendiente', 'aceptado')", [id]);
            if (pedido.metodo_pago === 'saldo_corporativo' && nuevoEstadoPago === 'reembolsado') {
                const saldo = await client.query(`INSERT INTO saldos_corporativos (cliente_id, saldo)
           VALUES ($1, $2)
           ON CONFLICT (cliente_id) DO UPDATE
             SET saldo = saldos_corporativos.saldo + EXCLUDED.saldo
           RETURNING saldo`, [pedido.cliente_id, Number(pedido.tarifa)]);
                await client.query(`INSERT INTO movimientos_saldo
           (cliente_id, monto, saldo_resultante, tipo, pedido_id, nota)
           VALUES ($1, $2, $3, 'reembolso', $4, $5)`, [pedido.cliente_id, Number(pedido.tarifa), saldo.rows[0].saldo, id, `Reembolso por cancelación del repartidor del pedido ${id}`]);
            }
            if (['reembolso_pendiente', 'reembolsado'].includes(nuevoEstadoPago)) {
                await client.query(`INSERT INTO historial_pagos
           (pedido_id, actor_id, actor_rol, accion, metodo_pago, estado_pago, monto, referencia_pago, detalle)
           VALUES ($1, $2, 'repartidor', $3, $4, $5, $6, $7, $8)`, [
                    id, authUser.id,
                    nuevoEstadoPago === 'reembolsado' ? 'saldo_reembolsado' : 'reembolso_solicitado',
                    pedido.metodo_pago, nuevoEstadoPago, pedido.tarifa, pedido.referencia_pago,
                    nuevoEstadoPago === 'reembolsado'
                        ? 'El saldo de este pedido anterior quedó registrado para conciliación manual tras la cancelación.'
                        : 'El repartidor canceló antes de iniciar; el pago móvil quedó pendiente de reembolso.'
                ]);
            }
            await (0, activity_1.registrarActividad)(client, authUser.id, authUser.rol, 'pedido_cancelado_repartidor', `Canceló el pedido ${(0, orderCode_1.codigoPedido)(id)} antes de iniciar (${pedido.tipo_servicio}) por $${pedido.tarifa}, pagado con ${pedido.metodo_pago}. ${pedido.origen_texto} → ${pedido.destino_texto}.`, id);
            await client.query('COMMIT');
            return res.json({
                mensaje: 'Trabajo cancelado. El cliente puede crear una nueva solicitud.',
                pedido: (0, orderPrivacy_1.sanitizarPedidoParaUsuario)(cancelado.rows[0])
            });
        }
        catch (error) {
            console.error('Error al cancelar el trabajo como repartidor:', error);
            try {
                if (client)
                    await client.query('ROLLBACK');
            }
            catch (rollbackError) {
                console.error('Error al revertir la cancelación del trabajo:', rollbackError);
            }
            return res.status(500).json({ error: 'No se pudo cancelar el trabajo.' });
        }
        finally {
            client?.release();
        }
    }
    if (nuevoEstado === 'entregado_repartidor' && authUser.rol === 'repartidor') {
        let client = null;
        try {
            client = await db_1.pool.connect();
            await client.query('BEGIN');
            const actual = await client.query(`SELECT tipo_servicio, metodo_pago, estado_pago FROM pedidos
         WHERE id = $1 AND repartidor_id = $2 AND estado = 'aceptado'
         FOR UPDATE`, [id, authUser.id]);
            if (actual.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(409).json({ error: 'El pedido no existe o no admite ese cambio de estado.' });
            }
            const pedido = actual.rows[0];
            if (pedido.metodo_pago !== 'no_aplica'
                && pedido.metodo_pago !== 'efectivo'
                && pedido.estado_pago !== 'pagado') {
                await client.query('ROLLBACK');
                return res.status(409).json({ error: 'El pago debe estar verificado antes de iniciar el viaje.' });
            }
            const update = await client.query(`UPDATE pedidos
         SET estado = 'entregado_repartidor',
             iniciado_en = COALESCE(iniciado_en, CURRENT_TIMESTAMP),
             estado_pago = CASE
               WHEN metodo_pago = 'efectivo' AND estado_pago = 'pendiente' THEN 'pagado'
               ELSE estado_pago
             END,
             pago_confirmado_por = CASE
               WHEN metodo_pago = 'efectivo' AND estado_pago = 'pendiente' THEN $1
               ELSE pago_confirmado_por
             END,
             pago_confirmado_en = CASE
               WHEN metodo_pago = 'efectivo' AND estado_pago = 'pendiente' THEN CURRENT_TIMESTAMP
               ELSE pago_confirmado_en
             END
         WHERE id = $2 AND repartidor_id = $1 AND estado = 'aceptado'
         RETURNING *`, [authUser.id, id]);
            if (update.rows[0].metodo_pago === 'efectivo' && update.rows[0].estado_pago === 'pagado') {
                await client.query(`INSERT INTO historial_pagos
           (pedido_id, actor_id, actor_rol, accion, metodo_pago, estado_pago, monto, referencia_pago, detalle)
           VALUES ($1, $2, 'repartidor', 'efectivo_recibido', $3, $4, $5, NULL, $6)`, [
                    id, authUser.id, update.rows[0].metodo_pago, update.rows[0].estado_pago,
                    update.rows[0].tarifa, 'El repartidor confirmó la recepción del efectivo en el punto de retiro.'
                ]);
            }
            await (0, activity_1.registrarActividad)(client, authUser.id, authUser.rol, 'pedido_iniciado', `Inició el pedido ${(0, orderCode_1.codigoPedido)(id)} (${update.rows[0].tipo_servicio}) por $${update.rows[0].tarifa}.`, id);
            await client.query('COMMIT');
            return res.json({ mensaje: 'Estado actualizado', pedido: (0, orderPrivacy_1.sanitizarPedidoParaUsuario)(update.rows[0]) });
        }
        catch (error) {
            console.error('Error al iniciar el viaje:', error);
            try {
                if (client)
                    await client.query('ROLLBACK');
            }
            catch (rollbackError) {
                console.error('Error al revertir el inicio del viaje:', rollbackError);
            }
            return res.status(500).json({ error: 'No se pudo iniciar el viaje.' });
        }
        finally {
            client?.release();
        }
    }
    if (nuevoEstado === 'completado') {
        const client = await db_1.pool.connect();
        try {
            await client.query('BEGIN');
            const resultado = await client.query(`UPDATE pedidos SET estado = 'completado', completado_en = CURRENT_TIMESTAMP
         WHERE id = $1 AND estado = 'entregado_repartidor'
           AND (cliente_id = $2 OR repartidor_id = $2)
         RETURNING *`, [id, authUser.id]);
            if (resultado.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(409).json({ error: 'El pedido no existe o no admite ese cambio de estado.' });
            }
            const pedido = resultado.rows[0];
            await crearArchivoChatAdmin(client, pedido);
            await (0, activity_1.registrarActividad)(client, authUser.id, authUser.rol, 'pedido_completado', `Completó el pedido ${(0, orderCode_1.codigoPedido)(id)} (${pedido.tipo_servicio}) por $${pedido.tarifa}.`, id);
            await client.query('COMMIT');
            return res.json({ mensaje: 'Estado actualizado', pedido: (0, orderPrivacy_1.sanitizarPedidoParaUsuario)(pedido) });
        }
        catch (error) {
            console.error('Error al actualizar estado:', error);
            try {
                await client.query('ROLLBACK');
            }
            catch (rollbackError) {
                console.error('Error al revertir la finalización del pedido:', rollbackError);
            }
            return res.status(500).json({ error: 'Error al actualizar estado' });
        }
        finally {
            client.release();
        }
    }
    return res.status(403).json({ error: 'No tienes permiso para realizar este cambio de estado.' });
});
exports.default = router;
