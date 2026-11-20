import type { PoolClient } from 'pg';
import { pool } from '../db';

let tablasActividadListas: Promise<void> | null = null;

export const asegurarTablasActividad = () => {
  if (!tablasActividadListas) {
    tablasActividadListas = pool.query(`
      CREATE TABLE IF NOT EXISTS actividad_admin (
        id BIGSERIAL PRIMARY KEY,
        actor_id INTEGER,
        actor_nombre VARCHAR(120) NOT NULL,
        actor_rol VARCHAR(20) NOT NULL,
        evento VARCHAR(50) NOT NULL,
        resumen VARCHAR(500) NOT NULL,
        pedido_id INTEGER,
        creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sesiones_activas (
        session_id VARCHAR(100) PRIMARY KEY,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        ultimo_pulso TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_actividad_admin_creado_en ON actividad_admin (creado_en DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_sesiones_activas_ultimo_pulso ON sesiones_activas (ultimo_pulso DESC);
    `).then(() => undefined).catch((error) => {
      tablasActividadListas = null;
      console.error('Error preparando el monitoreo administrativo:', error);
      throw error;
    });
  }
  return tablasActividadListas;
};

export const registrarActividad = async (
  client: PoolClient,
  actorId: number | null,
  actorRol: string,
  evento: string,
  resumen: string,
  pedidoId: number | null = null,
  nombreSistema = 'Sistema'
) => {
  await asegurarTablasActividad();
  await client.query(
    `INSERT INTO actividad_admin (actor_id, actor_nombre, actor_rol, evento, resumen, pedido_id)
     VALUES ($1, COALESCE((SELECT nombre FROM usuarios WHERE id = $1), $2), $3, $4, $5, $6)`,
    [actorId, nombreSistema, actorRol, evento, resumen.slice(0, 500), pedidoId]
  );
};

export const registrarActividadDirecta = async (
  actorId: number,
  actorRol: string,
  evento: string,
  resumen: string
) => {
  await asegurarTablasActividad();
  await pool.query(
    `INSERT INTO actividad_admin (actor_id, actor_nombre, actor_rol, evento, resumen)
     SELECT id, nombre, $2, $3, $4 FROM usuarios WHERE id = $1`,
    [actorId, actorRol, evento, resumen.slice(0, 500)]
  );
};
