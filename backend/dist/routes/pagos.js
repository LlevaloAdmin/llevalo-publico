"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const auth_1 = require("../middleware/auth");
const rateLimits_1 = require("../middleware/rateLimits");
const pedidos_1 = require("./pedidos");
const exchangeRates_1 = require("../utils/exchangeRates");
const activity_1 = require("../utils/activity");
const pricing_1 = require("../utils/pricing");
const pricingSettings_1 = require("../utils/pricingSettings");
const pushNotifications_1 = require("../utils/pushNotifications");
const router = (0, express_1.Router)();
let tablasPagoListas = null;
const asegurarTablasPago = () => {
    if (!tablasPagoListas) {
        tablasPagoListas = pedidos_1.tablasPedidosListas.then(() => undefined).catch((error) => {
            tablasPagoListas = null;
            throw error;
        });
    }
    return tablasPagoListas;
};
const obtenerId = (value) => {
    if (typeof value !== 'string' || !/^\d+$/.test(value))
        return null;
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
};
const tarifasParaCliente = (tarifas) => ({
    ...tarifas,
    viajesCortoPorKm: tarifas.viajesLargosPorKm,
    viajesLargoPorKm: tarifas.viajesDesde1KmPorKm,
    monedaVisualizacion: 'VES'
});
router.use(auth_1.requireAuth);
router.get('/config', async (req, res) => {
    const authUser = req.authUser;
    if (!authUser)
        return res.status(401).json({ error: 'Sesión inválida.' });
    try {
        await asegurarTablasPago();
        const config = await db_1.pool.query('SELECT banco, telefono, cedula, titular FROM configuracion_pago_movil WHERE id = 1');
        const datos = config.rows[0] || {};
        res.json({
            pagoMovil: {
                banco: datos.banco || '',
                telefono: datos.telefono || '',
                cedula: datos.cedula || '',
                titular: datos.titular || ''
            }
        });
    }
    catch (error) {
        console.error('Error al consultar métodos de pago:', error);
        res.status(500).json({ error: 'No se pudieron cargar los métodos de pago.' });
    }
});
router.get('/tarifas', async (_req, res) => {
    try {
        const tarifas = await (0, pricingSettings_1.obtenerConfiguracionTarifas)();
        const tarifasPublicas = tarifasParaCliente(tarifas);
        try {
            const tasas = await (0, exchangeRates_1.obtenerTasasCambio)();
            res.json({ tarifas: tarifasPublicas, tasas });
        }
        catch (error) {
            console.error('No se pudieron consultar las tasas externas:', error);
            res.json({ tarifas: tarifasPublicas, tasas: null, errorTasas: 'La tasa de cambio no está disponible en este momento.' });
        }
    }
    catch (error) {
        console.error('Error al consultar tarifas:', error);
        res.status(503).json({ error: 'No se pudieron cargar las tarifas configuradas. Inténtalo nuevamente.' });
    }
});
router.put('/admin/tarifas', auth_1.requireAdmin, rateLimits_1.adminActionRateLimit, async (req, res) => {
    const body = req.body ?? {};
    const configuracionRecibida = {
        enviosPorKm: body.enviosPorKm,
        viajesDesde1KmPorKm: body.viajesDesde1KmPorKm ?? body.viajesLargoPorKm,
        viajesLargosPorKm: body.viajesLargosPorKm ?? body.viajesCortoPorKm,
        tarifaMinima: body.tarifaMinima
    };
    if (!(0, pricing_1.esConfiguracionTarifasValida)(configuracionRecibida)) {
        return res.status(400).json({ error: 'Revisa que todas las tarifas sean valores positivos válidos.' });
    }
    try {
        const tarifas = await (0, pricingSettings_1.guardarConfiguracionTarifas)(configuracionRecibida);
        const actorId = req.authUser?.id;
        if (actorId) {
            try {
                await (0, activity_1.registrarActividadDirecta)(actorId, 'admin', 'configuracion_tarifas_actualizada', 'Actualizó tarifas por kilómetro; los montos se muestran en bolívares según la tasa BCV.');
            }
            catch (activityError) {
                console.error('No se pudo registrar la actualización de tarifas:', activityError);
            }
        }
        res.json({ tarifas: tarifasParaCliente(tarifas) });
    }
    catch (error) {
        console.error('Error al guardar tarifas:', error);
        res.status(500).json({ error: 'No se pudieron guardar las tarifas.' });
    }
});
router.get('/admin/pendientes', auth_1.requireAdmin, async (_req, res) => {
    try {
        await asegurarTablasPago();
        const result = await db_1.pool.query(`SELECT p.id, p.cliente_id, p.cliente_nombre, u.email AS cliente_email,
              p.tipo_servicio, p.descripcion, p.origen_texto, p.destino_texto,
              p.distancia_km, p.tiempo_min, p.tarifa, p.metodo_pago,
              p.referencia_pago, p.estado_pago, p.estado, p.creado_en
       FROM pedidos p
       JOIN usuarios u ON u.id = p.cliente_id
       WHERE p.metodo_pago = 'pago_movil'
         AND ((p.estado_pago = 'pendiente' AND p.estado != 'cancelado')
              OR (p.estado_pago = 'reembolso_pendiente' AND p.estado = 'cancelado'))
       ORDER BY p.creado_en ASC`);
        res.json({ pagos: result.rows });
    }
    catch (error) {
        console.error('Error al cargar pagos pendientes:', error);
        res.status(500).json({ error: 'No se pudieron cargar los pagos pendientes.' });
    }
});
router.get('/admin/historial', auth_1.requireAdmin, async (_req, res) => {
    try {
        await asegurarTablasPago();
        const result = await db_1.pool.query(`SELECT hp.id, hp.pedido_id, hp.actor_id, u.nombre AS actor_nombre, hp.actor_rol,
              hp.accion, hp.metodo_pago, hp.estado_pago, hp.monto, hp.referencia_pago,
              hp.detalle, hp.creado_en, p.tipo_servicio, p.descripcion, p.cliente_nombre,
              p.origen_texto, p.destino_texto, p.distancia_km, p.tiempo_min,
              p.estado AS estado_pedido
       FROM historial_pagos hp
       JOIN pedidos p ON p.id = hp.pedido_id
       LEFT JOIN usuarios u ON u.id = hp.actor_id
       ORDER BY hp.creado_en DESC, hp.id DESC
       LIMIT 100`);
        res.json({ historial: result.rows });
    }
    catch (error) {
        console.error('Error al consultar el historial de pagos:', error);
        res.status(500).json({ error: 'No se pudo consultar el historial de pagos.' });
    }
});
router.put('/admin/config', auth_1.requireAdmin, rateLimits_1.adminActionRateLimit, async (req, res) => {
    const { banco, telefono, cedula, titular } = req.body ?? {};
    if (typeof banco !== 'string' || !banco.trim() || banco.length > 100
        || typeof telefono !== 'string' || !telefono.trim() || telefono.length > 30
        || typeof cedula !== 'string' || !cedula.trim() || cedula.length > 30
        || typeof titular !== 'string' || !titular.trim() || titular.length > 120) {
        return res.status(400).json({ error: 'Completa los datos de recepción de Pago Móvil.' });
    }
    try {
        await asegurarTablasPago();
        const result = await db_1.pool.query(`UPDATE configuracion_pago_movil
       SET banco = $1, telefono = $2, cedula = $3, titular = $4
       WHERE id = 1
       RETURNING banco, telefono, cedula, titular`, [banco.trim(), telefono.trim(), cedula.trim(), titular.trim()]);
        res.json({ pagoMovil: result.rows[0] });
    }
    catch (error) {
        console.error('Error al guardar datos de Pago Móvil:', error);
        res.status(500).json({ error: 'No se pudieron guardar los datos de Pago Móvil.' });
    }
});
router.put('/admin/pedidos/:id', auth_1.requireAdmin, rateLimits_1.adminActionRateLimit, async (req, res) => {
    const adminId = req.authUser?.id;
    if (!adminId)
        return res.status(401).json({ error: 'Sesión inválida.' });
    const id = obtenerId(req.params.id);
    const accion = req.body?.accion;
    const accionesValidas = ['aprobar', 'rechazar', 'reembolsar', 'sin_pago'];
    if (!id || !accionesValidas.includes(accion)) {
        return res.status(400).json({ error: 'La acción solicitada no es válida.' });
    }
    const accionReembolso = accion === 'reembolsar' || accion === 'sin_pago';
    let client = null;
    try {
        await asegurarTablasPago();
        client = await db_1.pool.connect();
        await client.query('BEGIN');
        const pedido = await client.query(`SELECT id FROM pedidos
       WHERE id = $1 AND metodo_pago = 'pago_movil'
         AND (($2 = FALSE AND estado_pago = 'pendiente' AND estado != 'cancelado')
              OR ($2 = TRUE AND estado_pago = 'reembolso_pendiente' AND estado = 'cancelado'))
       FOR UPDATE`, [id, accionReembolso]);
        if (pedido.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'El pago ya fue revisado o la solicitud ya no está disponible.' });
        }
        const estadoPago = accion === 'aprobar'
            ? 'pagado'
            : accion === 'reembolsar' ? 'reembolsado' : 'rechazado';
        const result = await client.query(`UPDATE pedidos
       SET estado_pago = $1,
           estado = CASE WHEN $2 = 'rechazar' THEN 'cancelado' ELSE estado END,
           pago_confirmado_por = CASE WHEN $2 IN ('aprobar', 'rechazar') THEN $3 ELSE pago_confirmado_por END,
           pago_confirmado_en = CASE WHEN $2 IN ('aprobar', 'rechazar') THEN CURRENT_TIMESTAMP ELSE pago_confirmado_en END,
           publicado_en = CASE WHEN $2 = 'aprobar' THEN CURRENT_TIMESTAMP ELSE publicado_en END,
           motivo_cancelacion = CASE WHEN $2 = 'rechazar' THEN 'pago_rechazado' ELSE motivo_cancelacion END,
           reembolso_confirmado_por = CASE WHEN $2 = 'reembolsar' THEN $3 ELSE reembolso_confirmado_por END,
           reembolso_confirmado_en = CASE WHEN $2 = 'reembolsar' THEN CURRENT_TIMESTAMP ELSE reembolso_confirmado_en END
       WHERE id = $4
       RETURNING *`, [estadoPago, accion, adminId, id]);
        await client.query(`INSERT INTO historial_pagos
       (pedido_id, actor_id, actor_rol, accion, metodo_pago, estado_pago, monto, referencia_pago, detalle)
       SELECT id, $2, 'admin', $3, metodo_pago, estado_pago, tarifa, referencia_pago, $4
       FROM pedidos WHERE id = $1`, [
            id, adminId,
            accion === 'aprobar' ? 'pago_aprobado'
                : accion === 'rechazar' ? 'pago_rechazado'
                    : accion === 'reembolsar' ? 'reembolso_aprobado'
                        : 'reembolso_rechazado',
            accion === 'aprobar' ? 'El administrador confirmó el pago móvil.'
                : accion === 'rechazar' ? 'El administrador rechazó la referencia y canceló el pedido.'
                    : accion === 'reembolsar' ? 'El administrador confirmó el reembolso del pago móvil.'
                        : 'El administrador confirmó que no se recibió el pago.'
        ]);
        if (accion === 'rechazar') {
            await client.query("UPDATE postulaciones SET estado = 'rechazado' WHERE pedido_id = $1 AND estado IN ('pendiente', 'aceptado')", [id]);
        }
        await client.query('COMMIT');
        if (accion === 'aprobar' && result.rows[0].publicado_en) {
            void (0, pushNotifications_1.notifyDriversOfNewOrder)(result.rows[0]).catch(error => {
                console.error('No se pudo notificar a los repartidores sobre el pedido pagado:', error);
            });
        }
        res.json({ pedido: result.rows[0] });
    }
    catch (error) {
        console.error('Error al revisar el pago:', error);
        try {
            if (client)
                await client.query('ROLLBACK');
        }
        catch (rollbackError) {
            console.error('Error al revertir la revisión del pago:', rollbackError);
        }
        res.status(500).json({ error: 'No se pudo revisar el pago.' });
    }
    finally {
        client?.release();
    }
});
exports.default = router;
