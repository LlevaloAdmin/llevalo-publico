import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import type { Request } from 'express';

const limitePorAdministrador = (req: Request) =>
  req.authUser
    ? `admin:${req.authUser.id}`
    : ipKeyGenerator(req.ip || req.socket.remoteAddress || 'unknown');

export const inicioSesionRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Demasiados intentos. Espera unos minutos e inténtalo nuevamente.' }
});

export const registroRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Se alcanzó el límite de registros. Inténtalo más tarde.' }
});

export const emisionCorreoRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  message: { error: 'Se alcanzó el límite de envíos de correo. Inténtalo más tarde.' }
});

export const adminActionRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  keyGenerator: limitePorAdministrador,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Se alcanzó el límite de acciones administrativas. Espera un minuto.' }
});
