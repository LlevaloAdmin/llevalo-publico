import jwt from 'jsonwebtoken';
import { NextFunction, Request, Response } from 'express';
import { JWT_SECRET } from '../config';
import { pool } from '../db';

export interface AuthenticatedUser {
  id: number;
  rol: 'cliente' | 'repartidor';
  es_admin: boolean;
}

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthenticatedUser;
    }
  }
}

export const verifyAccessToken = (token: string): AuthenticatedUser | null => {
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (typeof payload === 'string') return null;

    const id = Number(payload.id);
    const rol = payload.rol;
    if (!Number.isSafeInteger(id) || id <= 0 || (rol !== 'cliente' && rol !== 'repartidor')) return null;
    return { id, rol, es_admin: payload.es_admin === true };
  } catch {
    return null;
  }
};

export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  const authorization = req.header('authorization');
  const [scheme, token] = authorization?.split(' ') ?? [];

  if (scheme !== 'Bearer' || !token) {
    res.status(401).json({ error: 'Debes iniciar sesión para realizar esta acción.' });
    return;
  }

  const authUser = verifyAccessToken(token);
  if (!authUser) {
    res.status(401).json({ error: 'La sesión es inválida o expiró. Inicia sesión nuevamente.' });
    return;
  }

  req.authUser = authUser;
  next();
};

export const requireRole = (rol: AuthenticatedUser['rol']) =>
  (req: Request, res: Response, next: NextFunction): void => {
    if (req.authUser?.rol !== rol) {
      res.status(403).json({ error: 'No tienes permiso para realizar esta acción.' });
      return;
    }
    next();
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
