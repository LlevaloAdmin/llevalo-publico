"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAdmin = exports.requireRole = exports.requireAuth = exports.verifyAccessToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = require("../config");
const db_1 = require("../db");
const verifyAccessToken = (token) => {
    try {
        const payload = jsonwebtoken_1.default.verify(token, config_1.JWT_SECRET);
        if (typeof payload === 'string')
            return null;
        const id = Number(payload.id);
        const rol = payload.rol;
        const rolBase = payload.rol_base ?? rol;
        if (!Number.isSafeInteger(id) || id <= 0
            || (rol !== 'cliente' && rol !== 'repartidor')
            || (rolBase !== 'cliente' && rolBase !== 'repartidor'))
            return null;
        return { id, rol, rol_base: rolBase, es_admin: payload.es_admin === true };
    }
    catch {
        return null;
    }
};
exports.verifyAccessToken = verifyAccessToken;
const requireAuth = (req, res, next) => {
    const authorization = req.header('authorization');
    const [scheme, token] = authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) {
        res.status(401).json({ error: 'Debes iniciar sesión para realizar esta acción.' });
        return;
    }
    const authUser = (0, exports.verifyAccessToken)(token);
    if (!authUser) {
        res.status(401).json({ error: 'La sesión es inválida o expiró. Inicia sesión nuevamente.' });
        return;
    }
    req.authUser = authUser;
    next();
};
exports.requireAuth = requireAuth;
const requireRole = (rol) => async (req, res, next) => {
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
        const result = await db_1.pool.query('SELECT es_admin FROM usuarios WHERE id = $1', [authUser.id]);
        if (result.rows[0]?.es_admin !== true) {
            res.status(403).json({ error: 'El cambio de perspectiva ya no está autorizado.' });
            return;
        }
        next();
    }
    catch (error) {
        console.error('Error verificando el rol activo:', error);
        res.status(500).json({ error: 'No se pudo verificar el rol activo.' });
    }
};
exports.requireRole = requireRole;
const requireAdmin = async (req, res, next) => {
    const authUser = req.authUser;
    if (!authUser) {
        res.status(401).json({ error: 'Debes iniciar sesión para realizar esta acción.' });
        return;
    }
    try {
        const result = await db_1.pool.query('SELECT es_admin FROM usuarios WHERE id = $1', [authUser.id]);
        if (result.rows[0]?.es_admin !== true) {
            res.status(403).json({ error: 'Esta acción requiere permisos de administrador.' });
            return;
        }
        next();
    }
    catch (error) {
        console.error('Error verificando permisos de administrador:', error);
        res.status(500).json({ error: 'No se pudieron verificar los permisos de administrador.' });
    }
};
exports.requireAdmin = requireAdmin;
