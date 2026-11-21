import { NextFunction, Request, Response } from 'express';
import { pool } from '../db';
import { sesionAutenticadaActiva } from '../utils/authSessions';
import { type AuthenticatedUser, verifyAccessToken } from '../utils/authToken';

export type { AuthenticatedUser } from '../utils/authToken';

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthenticatedUser;
    }
  }
}

export const requireAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const authorization = req.header('authorization');
  const tokenMatch = authorization?.match(/^Bearer ([^\s]+)$/);

  if (!tokenMatch) {
    res.status(401).json({ error: 'Debes iniciar sesión para realizar esta acción.' });
    return;
  }

  const authUser = verifyAccessToken(tokenMatch[1]);
  if (!authUser) {
    res.status(401).json({ error: 'La sesión es inválida o expiró. Inicia sesión nuevamente.' });
    return;
  }

  try {
    if (!await sesionAutenticadaActiva(authUser.session_id, authUser.id)) {
      res.status(401).json({ error: 'La sesión fue cerrada o expiró. Inicia sesión nuevamente.' });
      return;
    }
    req.authUser = authUser;
    next();
  } catch (error) {
    console.error('Error verificando la sesión autenticada:', error);
    res.status(503).json({ error: 'No se pudo verificar la sesión. Inténtalo nuevamente.' });
  }
};

export const requireRole = (rol: AuthenticatedUser['rol']) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authUser = req.authUser;
    if (!authUser || authUser.rol !== rol) {
      res.status(403).json({ error: 'No tienes permiso para realizar esta acción.' });
      return;
    }
    if (authUser.rol === authUser.rol_base) {
      next();
      return;
    }

    try {
      const result = await pool.query('SELECT es_admin FROM usuarios WHERE id = $1', [authUser.id]);
      if (result.rows[0]?.es_admin !== true) {
        res.status(403).json({ error: 'El cambio de perspectiva ya no está autorizado.' });
        return;
      }
      next();
    } catch (error) {
      console.error('Error verificando el rol activo:', error);
      res.status(500).json({ error: 'No se pudo verificar el rol activo.' });
    }
  };

export const requireAdmin = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const authUser = req.authUser;
  if (!authUser) {
    res.status(401).json({ error: 'Debes iniciar sesión para realizar esta acción.' });
    return;
  }

  try {
    const result = await pool.query('SELECT es_admin FROM usuarios WHERE id = $1', [authUser.id]);
    if (result.rows[0]?.es_admin !== true) {
      res.status(403).json({ error: 'Esta acción requiere permisos de administrador.' });
      return;
    }
    next();
  } catch (error) {
    console.error('Error verificando permisos de administrador:', error);
    res.status(500).json({ error: 'No se pudieron verificar los permisos de administrador.' });
  }
};
