import { Router, type Request, type Response } from 'express';
import { pool } from '../db';
import { requireAuth } from '../middleware/auth';
import { tablasPedidosListas } from './pedidos';
import { rankForRating } from '../utils/reputation';

const router = Router();
let reviewsTableReady: Promise<void> | null = null;

const ensureReviewsTable = (): Promise<void> => {
  if (!reviewsTableReady) {
    reviewsTableReady = (async () => {
      await tablasPedidosListas;
      await pool.query(`
      CREATE TABLE IF NOT EXISTS evaluaciones_usuarios (
        id SERIAL PRIMARY KEY,
        pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
        evaluador_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        evaluado_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        estrellas SMALLINT NOT NULL CHECK (estrellas BETWEEN 1 AND 5),
        creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (pedido_id, evaluador_id),
        CHECK (evaluador_id <> evaluado_id)
      );
      CREATE INDEX IF NOT EXISTS evaluaciones_usuarios_evaluado_idx
        ON evaluaciones_usuarios(evaluado_id, creado_en DESC);
      `);
    })().catch(error => {
      reviewsTableReady = null;
      throw error;
    });
  }
  return reviewsTableReady;
};

const parsePositiveId = (value: unknown): number | null => {
  if (typeof value !== 'string' || !/^[1-9]\d{0,8}$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

router.use(requireAuth);

router.get('/summary', async (req: Request, res: Response): Promise<any> => {
  const authUser = req.authUser;
  const includeAllOrders = req.query.all === 'true';
  if (!authUser) return res.status(401).json({ error: 'Sesión inválida.' });

  try {
    await ensureReviewsTable();
    const [profileResult, completedOrders] = await Promise.all([
      pool.query(
        `SELECT COALESCE(AVG(estrellas), 0)::numeric(3,2) AS promedio,
                COUNT(*)::integer AS cantidad
         FROM evaluaciones_usuarios
         WHERE evaluado_id = $1`,
        [authUser.id]
      ),
      pool.query(
        `SELECT p.id AS pedido_id, p.tipo_servicio, p.creado_en,
                u.id AS contraparte_id, u.nombre AS contraparte_nombre,
                u.foto AS contraparte_foto, u.vehiculo AS contraparte_vehiculo,
                COALESCE(mi.estrellas, 0)::integer AS mis_estrellas,
                COUNT(*) OVER()::integer AS total_pedidos
         FROM pedidos p
         JOIN usuarios u ON u.id = CASE WHEN p.cliente_id = $1 THEN p.repartidor_id ELSE p.cliente_id END
         LEFT JOIN evaluaciones_usuarios mi ON mi.pedido_id = p.id AND mi.evaluador_id = $1
         WHERE p.estado = 'completado'
           AND (p.cliente_id = $1 OR p.repartidor_id = $1)
           AND p.repartidor_id IS NOT NULL
         ORDER BY p.creado_en DESC
         ${includeAllOrders ? '' : 'LIMIT 3'}`,
        [authUser.id]
      )
    ]);

    const promedio = Number(profileResult.rows[0]?.promedio ?? 0);
    const cantidad = Number(profileResult.rows[0]?.cantidad ?? 0);
    const totalPedidos = Number(completedOrders.rows[0]?.total_pedidos ?? 0);
    res.json({
      perfil: { promedio, cantidad, rango: rankForRating(promedio, cantidad) },
      pedidos: completedOrders.rows,
      total_pedidos: totalPedidos
    });
  } catch (error) {
    console.error('Error consultando las calificaciones:', error);
    res.status(500).json({ error: 'No se pudieron consultar las calificaciones.' });
  }
});

router.get('/profile/:id', async (req: Request, res: Response): Promise<any> => {
  const authUser = req.authUser;
  const profileId = parsePositiveId(req.params.id);
  const orderId = parsePositiveId(req.query.pedidoId);
  if (!authUser) return res.status(401).json({ error: 'Sesión inválida.' });
  if (!profileId || !orderId || profileId === authUser.id) {
    return res.status(400).json({ error: 'La cuenta o el pedido solicitado no son válidos.' });
  }

  try {
    await ensureReviewsTable();
    const result = await pool.query(
      `SELECT u.id, u.nombre, u.rol, u.foto, u.vehiculo,
              COALESCE(AVG(e.estrellas), 0)::numeric(3,2) AS promedio,
              COUNT(e.id)::integer AS cantidad
       FROM usuarios u
       LEFT JOIN evaluaciones_usuarios e ON e.evaluado_id = u.id
       WHERE u.id = $2
         AND EXISTS (
           SELECT 1
           FROM pedidos p
           WHERE p.id = $3
             AND p.estado <> 'cancelado'
             AND (
               (p.cliente_id = $1 AND (
                 p.repartidor_id = $2
                 OR EXISTS (
                   SELECT 1 FROM postulaciones po
                   WHERE po.pedido_id = p.id AND po.repartidor_id = $2
                 )
               ))
               OR (p.repartidor_id = $1 AND p.cliente_id = $2)
               OR (p.cliente_id = $2 AND p.estado IN ('pendiente', 'postulado')
                   AND p.publicado_en > CURRENT_TIMESTAMP - INTERVAL '60 seconds'
                   AND EXISTS (SELECT 1 FROM usuarios viewer WHERE viewer.id = $1 AND viewer.rol = 'repartidor'))
               OR (p.cliente_id = $2 AND EXISTS (
                 SELECT 1 FROM postulaciones po
                 WHERE po.pedido_id = p.id AND po.repartidor_id = $1
               ))
             )
         )
       GROUP BY u.id`,
      [authUser.id, profileId, orderId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No se encontró el perfil asociado a este pedido.' });
    }

    const profile = result.rows[0];
    const promedio = Number(profile.promedio);
    const cantidad = Number(profile.cantidad);
    res.json({
      perfil: {
        id: profile.id,
        nombre: profile.nombre,
        rol: profile.rol,
        foto: profile.foto || '',
        vehiculo: profile.vehiculo || '',
        promedio,
        cantidad,
        rango: rankForRating(promedio, cantidad)
      }
    });
  } catch (error) {
    console.error('Error consultando el perfil público:', error);
    res.status(500).json({ error: 'No se pudo consultar el perfil.' });
  }
});

router.post('/', async (req: Request, res: Response): Promise<any> => {
  const authUser = req.authUser;
  const pedidoId = Number.isSafeInteger(req.body?.pedidoId) && req.body.pedidoId > 0
    ? req.body.pedidoId as number
    : null;
  const estrellas = req.body?.estrellas;
  if (!authUser) return res.status(401).json({ error: 'Sesión inválida.' });
  if (!pedidoId || !Number.isInteger(estrellas) || estrellas < 1 || estrellas > 5) {
    return res.status(400).json({ error: 'El pedido y la calificación deben ser válidos.' });
  }

  try {
    await ensureReviewsTable();
    const inserted = await pool.query(
      `INSERT INTO evaluaciones_usuarios (pedido_id, evaluador_id, evaluado_id, estrellas)
       SELECT p.id, $2,
              CASE WHEN p.cliente_id = $2 THEN p.repartidor_id ELSE p.cliente_id END,
              $3
       FROM pedidos p
       WHERE p.id = $1
         AND p.estado = 'completado'
         AND (p.cliente_id = $2 OR p.repartidor_id = $2)
         AND p.repartidor_id IS NOT NULL
         AND p.cliente_id <> p.repartidor_id
       ON CONFLICT (pedido_id, evaluador_id) DO NOTHING
       RETURNING evaluado_id`,
      [pedidoId, authUser.id, estrellas]
    );
    if (inserted.rows.length === 0) {
      return res.status(409).json({ error: 'Solo puedes calificar una vez a la otra persona después de completar un pedido.' });
    }

    const aggregate = await pool.query(
      `UPDATE usuarios
       SET calificacion = (
         SELECT AVG(estrellas)::numeric(3,2)
         FROM evaluaciones_usuarios
         WHERE evaluado_id = $1
       )
       WHERE id = $1
       RETURNING calificacion`,
      [inserted.rows[0].evaluado_id]
    );
    res.status(201).json({
      mensaje: 'Gracias por calificar el servicio.',
      calificacion: Number(aggregate.rows[0]?.calificacion ?? 0)
    });
  } catch (error) {
    console.error('Error guardando la calificación:', error);
    res.status(500).json({ error: 'No se pudo guardar la calificación.' });
  }
});

export default router;
