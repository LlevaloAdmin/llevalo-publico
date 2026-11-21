"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TRUST_PROXY_HOPS = exports.allowedOrigins = exports.JWT_SECRET = void 0;
require("dotenv/config");
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || Buffer.byteLength(jwtSecret, 'utf8') < 32) {
    throw new Error('JWT_SECRET must be configured with at least 32 bytes.');
}
exports.JWT_SECRET = jwtSecret;
const configuredOrigins = (process.env.CORS_ORIGINS
    || 'https://llevalo.vercel.app,http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
for (const origin of configuredOrigins) {
    let parsedOrigin;
    try {
        parsedOrigin = new URL(origin);
    }
    catch {
        throw new Error(`CORS_ORIGINS contains an invalid origin: ${origin}`);
    }
    const isLocalHttp = parsedOrigin.protocol === 'http:'
        && ['localhost', '127.0.0.1'].includes(parsedOrigin.hostname);
    if (origin === '*' || parsedOrigin.origin !== origin
        || (parsedOrigin.protocol !== 'https:' && !isLocalHttp)) {
        throw new Error(`CORS_ORIGINS must contain exact HTTPS origins: ${origin}`);
    }
}
exports.allowedOrigins = configuredOrigins;
const proxyHopsConfig = process.env.TRUST_PROXY_HOPS?.trim();
const trustProxyHops = proxyHopsConfig ? Number(proxyHopsConfig) : 0;
if ((proxyHopsConfig && !/^\d+$/.test(proxyHopsConfig))
    || !Number.isSafeInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 5) {
    throw new Error('TRUST_PROXY_HOPS must be an integer between 0 and 5.');
}
exports.TRUST_PROXY_HOPS = trustProxyHops;
