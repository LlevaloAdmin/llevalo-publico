"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminActionRateLimit = exports.emisionCorreoRateLimit = exports.registroRateLimit = exports.inicioSesionRateLimit = void 0;
const express_rate_limit_1 = require("express-rate-limit");
const limitePorAdministrador = (req) => req.authUser
    ? `admin:${req.authUser.id}`
    : (0, express_rate_limit_1.ipKeyGenerator)(req.ip || req.socket.remoteAddress || 'unknown');
exports.inicioSesionRateLimit = (0, express_rate_limit_1.rateLimit)({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { error: 'Demasiados intentos. Espera unos minutos e inténtalo nuevamente.' }
});
exports.registroRateLimit = (0, express_rate_limit_1.rateLimit)({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { error: 'Se alcanzó el límite de registros. Inténtalo más tarde.' }
});
exports.emisionCorreoRateLimit = (0, express_rate_limit_1.rateLimit)({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
    message: { error: 'Se alcanzó el límite de envíos de correo. Inténtalo más tarde.' }
});
exports.adminActionRateLimit = (0, express_rate_limit_1.rateLimit)({
    windowMs: 60 * 1000,
    limit: 30,
    keyGenerator: limitePorAdministrador,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Se alcanzó el límite de acciones administrativas. Espera un minuto.' }
});
