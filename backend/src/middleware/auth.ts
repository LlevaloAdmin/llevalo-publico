import jwt from 'jsonwebtoken';
import { NextFunction, Request, Response } from 'express';
import { JWT_SECRET } from '../config';

export interface AuthenticatedUser {
  id: number;
  rol: 'cliente' | 'repartidor';
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
    return { id, rol };
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
