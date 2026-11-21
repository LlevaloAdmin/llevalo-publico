"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.revocarSesionAutenticada = exports.sesionAutenticadaActiva = exports.guardarSesionAutenticada = void 0;
const db_1 = require("../db");
let authSessionsReady = null;
const ensureAuthSessions = () => {
    if (!authSessionsReady) {
        authSessionsReady = db_1.pool.query(`
      CREATE TABLE IF NOT EXISTS auth_sessions (
        session_id UUID PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiration ON auth_sessions (expires_at);
      DO $$
      BEGIN
        IF to_regclass('public.sesiones_activas') IS NOT NULL THEN
          INSERT INTO auth_sessions (session_id, user_id, expires_at)
          SELECT CASE
                   WHEN s.session_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                   THEN s.session_id::uuid
                 END,
                 s.usuario_id, CURRENT_TIMESTAMP + INTERVAL '7 days'
          FROM sesiones_activas s
          WHERE s.session_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            AND s.ultimo_pulso >= CURRENT_TIMESTAMP - INTERVAL '60 seconds'
          ON CONFLICT (session_id) DO NOTHING;
        END IF;
      END $$;
    `).then(() => undefined).catch((error) => {
            authSessionsReady = null;
            throw error;
        });
    }
    return authSessionsReady;
};
const guardarSesionAutenticada = async (sessionId, userId, expiresAt) => {
    await ensureAuthSessions();
    await db_1.pool.query('DELETE FROM auth_sessions WHERE expires_at <= CURRENT_TIMESTAMP');
    const result = await db_1.pool.query(`INSERT INTO auth_sessions (session_id, user_id, expires_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (session_id) DO UPDATE
       SET expires_at = EXCLUDED.expires_at
       WHERE auth_sessions.user_id = EXCLUDED.user_id
         AND auth_sessions.revoked_at IS NULL
     RETURNING session_id`, [sessionId, userId, expiresAt]);
    if (result.rows.length === 0)
        throw new Error('La sesión no se puede renovar.');
};
exports.guardarSesionAutenticada = guardarSesionAutenticada;
const sesionAutenticadaActiva = async (sessionId, userId) => {
    await ensureAuthSessions();
    const result = await db_1.pool.query(`SELECT 1 FROM auth_sessions
     WHERE session_id = $1 AND user_id = $2
       AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP`, [sessionId, userId]);
    return result.rows.length > 0;
};
exports.sesionAutenticadaActiva = sesionAutenticadaActiva;
const revocarSesionAutenticada = async (client, sessionId, userId) => {
    await ensureAuthSessions();
    await client.query(`UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP
     WHERE session_id = $1 AND user_id = $2 AND revoked_at IS NULL`, [sessionId, userId]);
};
exports.revocarSesionAutenticada = revocarSesionAutenticada;
