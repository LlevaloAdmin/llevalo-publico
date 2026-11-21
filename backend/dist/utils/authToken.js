"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyAccessToken = exports.JWT_AUDIENCE = exports.JWT_ISSUER = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = require("../config");
exports.JWT_ISSUER = 'llevalo-api';
exports.JWT_AUDIENCE = 'llevalo-app';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const verifyAccessToken = (token) => {
    try {
        const payload = jsonwebtoken_1.default.verify(token, config_1.JWT_SECRET, { algorithms: ['HS256'] });
        if (typeof payload === 'string')
            return null;
        const id = Number(payload.id);
        const rol = payload.rol;
        const rolBase = payload.rol_base ?? rol;
        const sessionId = payload.jti;
        const audienciaValida = payload.aud === undefined
            || payload.aud === exports.JWT_AUDIENCE
            || (Array.isArray(payload.aud) && payload.aud.includes(exports.JWT_AUDIENCE));
        if (!Number.isSafeInteger(id) || id <= 0
            || (rol !== 'cliente' && rol !== 'repartidor')
            || (rolBase !== 'cliente' && rolBase !== 'repartidor')
            || typeof sessionId !== 'string' || !UUID_PATTERN.test(sessionId)
            || (payload.iss !== undefined && payload.iss !== exports.JWT_ISSUER)
            || !audienciaValida)
            return null;
        return { id, rol, rol_base: rolBase, es_admin: payload.es_admin === true, session_id: sessionId };
    }
    catch {
        return null;
    }
};
exports.verifyAccessToken = verifyAccessToken;
