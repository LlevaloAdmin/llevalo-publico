"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const auth_1 = require("../middleware/auth");
const pushNotifications_1 = require("../utils/pushNotifications");
const router = (0, express_1.Router)();
router.use(auth_1.requireAuth);
const requireNotificationAccess = async (req, res, next) => {
    if (req.authUser?.rol === 'repartidor') {
        await (0, auth_1.requireRole)('repartidor')(req, res, next);
        return;
    }
    await (0, auth_1.requireAdmin)(req, res, next);
};
router.post('/device-token', requireNotificationAccess, async (req, res) => {
    const userId = req.authUser?.id;
    const token = req.body?.token;
    const platform = req.body?.platform;
    const disponible = req.body?.disponible;
    if (!userId)
        return res.status(401).json({ error: 'Sesión inválida.' });
    if (typeof token !== 'string' || token.length < 20 || token.length > 4096
        || (platform !== 'android' && platform !== 'web')
        || (disponible !== undefined && typeof disponible !== 'boolean')) {
        return res.status(400).json({ error: 'El token, la plataforma o la disponibilidad no son válidos.' });
    }
    try {
        await (0, pushNotifications_1.ensurePushTargetsTable)();
        await db_1.pool.query(`INSERT INTO notification_devices (token, user_id, platform, disponible)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (token) DO UPDATE
       SET user_id = EXCLUDED.user_id,
           platform = EXCLUDED.platform,
           disponible = EXCLUDED.disponible,
           actualizado_en = CURRENT_TIMESTAMP`, [token, userId, platform, disponible === true]);
        res.json({ mensaje: 'Dispositivo registrado para notificaciones.' });
    }
    catch (error) {
        console.error('Error al registrar el dispositivo para notificaciones:', error);
        res.status(500).json({ error: 'No se pudo registrar el dispositivo.' });
    }
});
router.put('/availability', (0, auth_1.requireRole)('repartidor'), async (req, res) => {
    const userId = req.authUser?.id;
    const disponible = req.body?.disponible;
    if (!userId)
        return res.status(401).json({ error: 'Sesión inválida.' });
    if (typeof disponible !== 'boolean') {
        return res.status(400).json({ error: 'El estado de disponibilidad no es válido.' });
    }
    try {
        await (0, pushNotifications_1.ensurePushTargetsTable)();
        await db_1.pool.query('UPDATE notification_devices SET disponible = $1, actualizado_en = CURRENT_TIMESTAMP WHERE user_id = $2', [disponible, userId]);
        res.json({ mensaje: 'Disponibilidad de notificaciones actualizada.' });
    }
    catch (error) {
        console.error('Error al actualizar la disponibilidad de notificaciones:', error);
        res.status(500).json({ error: 'No se pudo actualizar la disponibilidad.' });
    }
});
router.delete('/device-token', requireNotificationAccess, async (req, res) => {
    const userId = req.authUser?.id;
    const token = req.body?.token;
    if (!userId)
        return res.status(401).json({ error: 'Sesión inválida.' });
    if (typeof token !== 'string' || token.length < 20 || token.length > 4096) {
        return res.status(400).json({ error: 'El token de notificación no es válido.' });
    }
    try {
        await (0, pushNotifications_1.ensurePushTargetsTable)();
        await db_1.pool.query('DELETE FROM notification_devices WHERE user_id = $1 AND token = $2', [userId, token]);
        res.json({ mensaje: 'Dispositivo retirado de las notificaciones.' });
    }
    catch (error) {
        console.error('Error al retirar el dispositivo de notificaciones:', error);
        res.status(500).json({ error: 'No se pudo retirar el dispositivo.' });
    }
});
exports.default = router;
