import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config';

export const JWT_ISSUER = 'llevalo-api';
export const JWT_AUDIENCE = 'llevalo-app';

export interface AuthenticatedUser {
  id: number;
  rol: 'cliente' | 'repartidor';
  rol_base: 'cliente' | 'repartidor';
  es_admin: boolean;
  session_id: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const verifyAccessToken = (token: string): AuthenticatedUser | null => {
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    if (typeof payload === 'string') return null;

    const id = Number(payload.id);
    const rol = payload.rol;
    const rolBase = payload.rol_base ?? rol;
    const sessionId = payload.jti;
    const audienciaValida = payload.aud === undefined
      || payload.aud === JWT_AUDIENCE
      || (Array.isArray(payload.aud) && payload.aud.includes(JWT_AUDIENCE));
    if (!Number.isSafeInteger(id) || id <= 0
      || (rol !== 'cliente' && rol !== 'repartidor')
      || (rolBase !== 'cliente' && rolBase !== 'repartidor')
      || typeof sessionId !== 'string' || !UUID_PATTERN.test(sessionId)
      || (payload.iss !== undefined && payload.iss !== JWT_ISSUER)
      || !audienciaValida) return null;

    return { id, rol, rol_base: rolBase, es_admin: payload.es_admin === true, session_id: sessionId };
  } catch {
    return null;
  }
};
