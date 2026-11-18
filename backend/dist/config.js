"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.allowedOrigins = exports.JWT_SECRET = void 0;
require("dotenv/config");
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be configured with at least 32 characters.');
}
exports.JWT_SECRET = jwtSecret;
exports.allowedOrigins = (process.env.CORS_ORIGINS
    || 'https://llevalo.vercel.app,http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
