import { Router, type Request, type Response } from 'express';
import { pool } from '../db';
import { requireAuth, requireRole } from '../middleware/auth';
import { ensurePushTargetsTable } from '../utils/pushNotifications';

const router = Router();

router.use(requireAuth);

router.post('/device-token', requireRole('repartidor'), async (req: Request, res: Response): Promise<any> => {
  const userId = req.authUser?.id;
  const token = req.body?.token;
  const platform = req.body?.platform;
  if (!userId) return res.status(401).json({ error: 'Sesión inválida.' });
  if (typeof token !== 'string' || token.length < 20 || token.length > 4096
    || (platform !== 'android' && platform !== 'web')) {
    return res.status(400).json({ error: 'El token o la plataforma de notificación no son válidos.' });
  }

  try {
    await ensurePushTargetsTable();
    await pool.query(
      `INSERT INTO notification_devices (token, user_id, platform)
       VALUES ($1, $2, $3)
       ON CONFLICT (token) DO UPDATE
       SET user_id = EXCLUDED.user_id,
           platform = EXCLUDED.platform,
           actualizado_en = CURRENT_TIMESTAMP`,
      [token, userId, platform]
    );
    res.json({ mensaje: 'Dispositivo registrado para notificaciones.' });
  } catch (error) {
    console.error('Error al registrar el dispositivo para notificaciones:', error);
    res.status(500).json({ error: 'No se pudo registrar el dispositivo.' });
  }
});

router.delete('/device-token', requireRole('repartidor'), async (req: Request, res: Response): Promise<any> => {
  const userId = req.authUser?.id;
  const token = req.body?.token;
  if (!userId) return res.status(401).json({ error: 'Sesión inválida.' });
  if (typeof token !== 'string' || token.length < 20 || token.length > 4096) {
    return res.status(400).json({ error: 'El token de notificación no es válido.' });
  }

  try {
    await ensurePushTargetsTable();
    await pool.query('DELETE FROM notification_devices WHERE user_id = $1 AND token = $2', [userId, token]);
    res.json({ mensaje: 'Dispositivo retirado de las notificaciones.' });
  } catch (error) {
    console.error('Error al retirar el dispositivo de notificaciones:', error);
    res.status(500).json({ error: 'No se pudo retirar el dispositivo.' });
  }
});

export default router;
