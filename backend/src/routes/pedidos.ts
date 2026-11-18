import { Router, Request, Response } from 'express';
import { pool } from '../db';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

const initTables = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pedidos (
        id SERIAL PRIMARY KEY,
        cliente_id INTEGER NOT NULL,
        cliente_nombre VARCHAR(120) NOT NULL,
        cliente_cedula VARCHAR(30),
        cliente_foto TEXT,
        repartidor_id INTEGER,
        repartidor_nombre VARCHAR(120),
        repartidor_vehiculo VARCHAR(100) DEFAULT 'Moto Suzuki GN',
        repartidor_placa VARCHAR(30) DEFAULT 'ABC-123',
        repartidor_foto TEXT,
        repartidor_vehiculo_foto TEXT,
        repartidor_calificacion NUMERIC(3,2) DEFAULT 5.0,
        tipo_servicio VARCHAR(50) NOT NULL,
        descripcion TEXT NOT NULL,
        origen_texto TEXT NOT NULL,
        origen_lat DOUBLE PRECISION NOT NULL,
        origen_lon DOUBLE PRECISION NOT NULL,
        destino_texto TEXT NOT NULL,
        destino_lat DOUBLE PRECISION NOT NULL,
        destino_lon DOUBLE PRECISION NOT NULL,
        distancia_km DOUBLE PRECISION NOT NULL,
        tiempo_min INTEGER NOT NULL,
        tarifa NUMERIC(10, 2) NOT NULL,
        estado VARCHAR(30) DEFAULT 'pendiente',
        repartidor_lat DOUBLE PRECISION,
        repartidor_lon DOUBLE PRECISION,
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cliente_cedula VARCHAR(30);
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cliente_foto TEXT;
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS repartidor_id INTEGER;
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS repartidor_nombre VARCHAR(120);
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS repartidor_vehiculo VARCHAR(100) DEFAULT 'Moto Suzuki GN';
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS repartidor_placa VARCHAR(30) DEFAULT 'ABC-123';
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS repartidor_foto TEXT;
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS repartidor_vehiculo_foto TEXT;
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS repartidor_calificacion NUMERIC(3,2) DEFAULT 5.0;
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS repartidor_lat DOUBLE PRECISION;
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS repartidor_lon DOUBLE PRECISION;

      CREATE TABLE IF NOT EXISTS postulaciones (
        id SERIAL PRIMARY KEY,
        pedido_id INTEGER REFERENCES pedidos(id) ON DELETE CASCADE,
        repartidor_id INTEGER NOT NULL,
        repartidor_nombre VARCHAR(120) NOT NULL,
        vehiculo VARCHAR(100) NOT NULL,
        placa VARCHAR(30) NOT NULL,
        vehiculo_foto TEXT,
        calificacion NUMERIC(3,2) DEFAULT 5.0,
        estado VARCHAR(20) DEFAULT 'pendiente',
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE postulaciones ADD COLUMN IF NOT EXISTS placa VARCHAR(30);
      ALTER TABLE postulaciones ADD COLUMN IF NOT EXISTS vehiculo_foto TEXT;
      ALTER TABLE postulaciones ADD COLUMN IF NOT EXISTS calificacion NUMERIC(3,2) DEFAULT 5.0;

      CREATE TABLE IF NOT EXISTS chat_mensajes (
        id SERIAL PRIMARY KEY,
        pedido_id INTEGER REFERENCES pedidos(id) ON DELETE CASCADE,
        remitente_id INTEGER NOT NULL,
        remitente_nombre VARCHAR(120) NOT NULL,
        mensaje TEXT NOT NULL,
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } catch (err) {
    console.error('Error inicializando tablas:', err);
  }
};
initTables();

router.use(requireAuth);

const getOrderId = (value: string | string[] | undefined): number | null => {
  if (typeof value !== 'string') return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

router.post('/', requireRole('cliente'), async (req: Request, res: Response): Promise<any> => {
  const authUser = req.authUser;
  if (!authUser) return res.status(401).json({ error: 'Sesión inválida.' });

  const {
    cliente_cedula, cliente_foto, tipo_servicio, descripcion,
    origen_texto, origen_lat, origen_lon,
    destino_texto, destino_lat, destino_lon,
    distancia_km, tiempo_min, tarifa
  } = req.body ?? {};

  const origenLat = Number(origen_lat);
  const origenLon = Number(origen_lon);
  const destinoLat = Number(destino_lat);
  const destinoLon = Number(destino_lon);
  const distancia = Number(distancia_km);
  const tiempo = Number(tiempo_min);
  const monto = Number(tarifa);
  const serviciosPermitidos = ['comida', 'mercado', 'mandados', 'viajes'];

  if (!serviciosPermitidos.includes(tipo_servicio)
    || typeof descripcion !== 'string' || !descripcion.trim() || descripcion.length > 500
    || typeof origen_texto !== 'string' || !origen_texto.trim() || origen_texto.length > 300
    || typeof destino_texto !== 'string' || !destino_texto.trim() || destino_texto.length > 300
    || !Number.isFinite(origenLat) || origenLat < -90 || origenLat > 90
    || !Number.isFinite(origenLon) || origenLon < -180 || origenLon > 180
    || !Number.isFinite(destinoLat) || destinoLat < -90 || destinoLat > 90
    || !Number.isFinite(destinoLon) || destinoLon < -180 || destinoLon > 180
    || !Number.isFinite(distancia) || distancia <= 0 || distancia > 1000
    || !Number.isSafeInteger(tiempo) || tiempo <= 0 || tiempo > 10000
    || !Number.isFinite(monto) || monto < 1.5 || monto > 10000) {
    return res.status(400).json({ error: 'Los datos del pedido o de la ruta no son válidos.' });
  }

  try {
    const cliente = await pool.query(
      'SELECT nombre FROM usuarios WHERE id = $1 AND rol = $2',
      [authUser.id, 'cliente']
    );
    if (cliente.rows.length === 0) return res.status(401).json({ error: 'La cuenta de cliente ya no está disponible.' });

    const result = await pool.query(
      `INSERT INTO pedidos
      (cliente_id, cliente_nombre, cliente_cedula, cliente_foto, tipo_servicio, descripcion, origen_texto, origen_lat, origen_lon, destino_texto, destino_lat, destino_lon, distancia_km, tiempo_min, tarifa, estado)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'pendiente')
      RETURNING *`,
      [
        authUser.id, cliente.rows[0].nombre,
        typeof cliente_cedula === 'string' ? cliente_cedula.slice(0, 30) : 'V-00000000',
        typeof cliente_foto === 'string' ? cliente_foto : '',
        tipo_servicio, descripcion.trim(), origen_texto.trim(), origenLat, origenLon,
        destino_texto.trim(), destinoLat, destinoLon, distancia, tiempo, monto
      ]
    );
    res.status(201).json({ mensaje: 'Pedido publicado', pedido: result.rows[0] });
  } catch (error) {
    console.error('Error al crear pedido:', error);
    res.status(500).json({ error: 'Error al crear el pedido.' });
  }
});

router.get('/', async (req: Request, res: Response): Promise<any> => {
  const authUser = req.authUser;
  if (!authUser) return res.status(401).json({ error: 'Sesión inválida.' });

  try {
    const pedidosRes = authUser.rol === 'cliente'
      ? await pool.query(
        "SELECT * FROM pedidos WHERE cliente_id = $1 AND estado != 'cancelado' ORDER BY creado_en DESC",
        [authUser.id]
      )
      : await pool.query(
        `SELECT id, cliente_id, cliente_nombre, tipo_servicio, descripcion,
                origen_texto, origen_lat, origen_lon, destino_texto, destino_lat, destino_lon,
                distancia_km, tiempo_min, tarifa, estado, repartidor_id, repartidor_nombre,
                repartidor_vehiculo, repartidor_placa, repartidor_foto, repartidor_vehiculo_foto,
                repartidor_calificacion, repartidor_lat, repartidor_lon, creado_en
         FROM pedidos
         WHERE estado IN ('pendiente', 'postulado')
            OR (repartidor_id = $1 AND estado IN ('aceptado', 'entregado_repartidor'))
         ORDER BY creado_en DESC`,
        [authUser.id]
      );

    const postulacionesRes = authUser.rol === 'cliente'
      ? await pool.query(
        `SELECT po.* FROM postulaciones po
         JOIN pedidos pe ON pe.id = po.pedido_id
         WHERE pe.cliente_id = $1`,
        [authUser.id]
      )
      : await pool.query('SELECT * FROM postulaciones WHERE repartidor_id = $1', [authUser.id]);

    const chatRes = authUser.rol === 'cliente'
      ? await pool.query(
        `SELECT cm.* FROM chat_mensajes cm
         JOIN pedidos pe ON pe.id = cm.pedido_id
         WHERE pe.cliente_id = $1
         ORDER BY cm.creado_en ASC`,
        [authUser.id]
      )
      : await pool.query(
        `SELECT cm.* FROM chat_mensajes cm
         JOIN pedidos pe ON pe.id = cm.pedido_id
         WHERE pe.repartidor_id = $1
         ORDER BY cm.creado_en ASC`,
        [authUser.id]
      );
    res.json({ pedidos: pedidosRes.rows, postulaciones: postulacionesRes.rows, mensajes: chatRes.rows });
  } catch (error) {
    console.error('Error al consultar pedidos:', error);
    res.status(500).json({ error: 'Error al consultar' });
  }
});

router.post('/:id/postular', requireRole('repartidor'), async (req: Request, res: Response): Promise<any> => {
  const authUser = req.authUser;
  const id = getOrderId(req.params.id);
  if (!authUser) return res.status(401).json({ error: 'Sesión inválida.' });
  if (!id) return res.status(400).json({ error: 'Pedido inválido.' });

  const { vehiculo, placa, vehiculo_foto } = req.body ?? {};
  if ((vehiculo !== undefined && (typeof vehiculo !== 'string' || vehiculo.length > 100))
    || (placa !== undefined && (typeof placa !== 'string' || placa.length > 30))
    || (vehiculo_foto !== undefined && (typeof vehiculo_foto !== 'string' || vehiculo_foto.length > 1_000_000))) {
    return res.status(400).json({ error: 'Los datos del vehículo no son válidos.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const pedido = await client.query('SELECT cliente_id, estado FROM pedidos WHERE id = $1 FOR UPDATE', [id]);
    if (pedido.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Pedido no encontrado.' });
    }
    if (pedido.rows[0].cliente_id === authUser.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'No puedes postularte a tu propio pedido.' });
    }
    if (!['pendiente', 'postulado'].includes(pedido.rows[0].estado)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Este pedido ya no acepta postulaciones.' });
    }

    const repartidor = await client.query(
      'SELECT nombre FROM usuarios WHERE id = $1 AND rol = $2',
      [authUser.id, 'repartidor']
    );
    if (repartidor.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(401).json({ error: 'La cuenta de repartidor ya no está disponible.' });
    }

    const existe = await client.query(
      'SELECT id FROM postulaciones WHERE pedido_id = $1 AND repartidor_id = $2',
      [id, authUser.id]
    );
    if (existe.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Ya te postulaste a este pedido.' });
    }

    const nueva = await client.query(
      `INSERT INTO postulaciones (pedido_id, repartidor_id, repartidor_nombre, vehiculo, placa, vehiculo_foto, calificacion, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pendiente') RETURNING *`,
      [id, authUser.id, repartidor.rows[0].nombre, vehiculo || 'Moto', placa || 'ABC-123', vehiculo_foto || '', 5.0]
    );

    await client.query("UPDATE pedidos SET estado = 'postulado' WHERE id = $1 AND estado = 'pendiente'", [id]);
    await client.query('COMMIT');
    res.json({ mensaje: 'Postulación enviada', postulacion: nueva.rows[0] });
  } catch (error) {
    console.error('Error al postularse:', error);
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Error al revertir la postulación:', rollbackError);
    }
    res.status(500).json({ error: 'Error al postularse' });
  } finally {
    client.release();
  }
});

// Cancelar postulación individual del repartidor
router.delete('/:id/postular/:repartidor_id', requireRole('repartidor'), async (req: Request, res: Response): Promise<any> => {
  const authUser = req.authUser;
  const id = getOrderId(req.params.id);
  const repartidorId = getOrderId(req.params.repartidor_id);
  if (!authUser) return res.status(401).json({ error: 'Sesión inválida.' });
  if (!id || repartidorId !== authUser.id) return res.status(403).json({ error: 'No tienes permiso para cancelar esta postulación.' });

  try {
    await pool.query("DELETE FROM postulaciones WHERE pedido_id = $1 AND repartidor_id = $2 AND estado = 'pendiente'", [id, authUser.id]);
    const restantes = await pool.query("SELECT * FROM postulaciones WHERE pedido_id = $1", [id]);
    if (restantes.rows.length === 0) {
      await pool.query("UPDATE pedidos SET estado = 'pendiente' WHERE id = $1 AND estado = 'postulado'", [id]);
    }
    res.json({ mensaje: 'Postulación cancelada' });
  } catch (error) {
    console.error('Error al cancelar postulación:', error);
    res.status(500).json({ error: 'Error al cancelar postulación' });
  }
});

router.put('/:id/aceptar-postulacion', requireRole('cliente'), async (req: Request, res: Response): Promise<any> => {
  const authUser = req.authUser;
  const id = getOrderId(req.params.id);
  const repartidorId = getOrderId(req.body?.repartidor_id);
  if (!authUser) return res.status(401).json({ error: 'Sesión inválida.' });
  if (!id || !repartidorId) return res.status(400).json({ error: 'Pedido o repartidor inválido.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const pedido = await client.query(
      'SELECT estado FROM pedidos WHERE id = $1 AND cliente_id = $2 FOR UPDATE',
      [id, authUser.id]
    );
    if (pedido.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Pedido no encontrado.' });
    }
    if (pedido.rows[0].estado !== 'postulado') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'El pedido ya no está esperando una selección.' });
    }

    const postulacion = await client.query(
      `SELECT repartidor_id, repartidor_nombre, vehiculo, placa, vehiculo_foto, calificacion
       FROM postulaciones
       WHERE pedido_id = $1 AND repartidor_id = $2 AND estado = 'pendiente'`,
      [id, repartidorId]
    );
    if (postulacion.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'La postulación ya no está disponible.' });
    }
    const elegido = postulacion.rows[0];

    await client.query("UPDATE postulaciones SET estado = 'aceptado' WHERE pedido_id = $1 AND repartidor_id = $2", [id, repartidorId]);
    await client.query("UPDATE postulaciones SET estado = 'rechazado' WHERE pedido_id = $1 AND repartidor_id != $2", [id, repartidorId]);

    const pedidoActualizado = await client.query(
      `UPDATE pedidos
       SET estado = 'aceptado', repartidor_id = $1, repartidor_nombre = $2, repartidor_vehiculo = $3, repartidor_placa = $4, repartidor_vehiculo_foto = $5, repartidor_calificacion = $6
       WHERE id = $7 AND cliente_id = $8 RETURNING *`,
      [elegido.repartidor_id, elegido.repartidor_nombre, elegido.vehiculo, elegido.placa, elegido.vehiculo_foto, elegido.calificacion, id, authUser.id]
    );

    await client.query('COMMIT');
    res.json({ mensaje: 'Repartidor seleccionado', pedido: pedidoActualizado.rows[0] });
  } catch (error) {
    console.error('Error al aceptar postulación:', error);
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Error al revertir la aceptación:', rollbackError);
    }
    res.status(500).json({ error: 'Error al aceptar' });
  } finally {
    client.release();
  }
});

// Actualizar ubicación GPS en tiempo real del repartidor
router.put('/:id/ubicacion-repartidor', requireRole('repartidor'), async (req: Request, res: Response): Promise<any> => {
  const authUser = req.authUser;
  const id = getOrderId(req.params.id);
  const { lat, lon } = req.body ?? {};
  const latitude = Number(lat);
  const longitude = Number(lon);
  if (!authUser) return res.status(401).json({ error: 'Sesión inválida.' });
  if (!id || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return res.status(400).json({ error: 'La ubicación no es válida.' });
  }

  try {
    const result = await pool.query(
      `UPDATE pedidos SET repartidor_lat = $1, repartidor_lon = $2
       WHERE id = $3 AND repartidor_id = $4 AND estado IN ('aceptado', 'entregado_repartidor')`,
      [latitude, longitude, id, authUser.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'No tienes una entrega activa con ese pedido.' });
    res.json({ mensaje: 'Ubicación actualizada' });
  } catch (error) {
    console.error('Error al actualizar ubicación:', error);
    res.status(500).json({ error: 'Error al actualizar ubicación' });
  }
});

router.post('/:id/chat', async (req: Request, res: Response): Promise<any> => {
  const authUser = req.authUser;
  const id = getOrderId(req.params.id);
  const mensaje = req.body?.mensaje;
  if (!authUser) return res.status(401).json({ error: 'Sesión inválida.' });
  if (!id || typeof mensaje !== 'string' || !mensaje.trim() || mensaje.length > 2000) {
    return res.status(400).json({ error: 'El mensaje no es válido.' });
  }

  try {
    const order = await pool.query(
      `SELECT id FROM pedidos
       WHERE id = $1 AND (cliente_id = $2 OR repartidor_id = $2)
         AND estado IN ('aceptado', 'entregado_repartidor')`,
      [id, authUser.id]
    );
    if (order.rows.length === 0) return res.status(404).json({ error: 'No tienes acceso al chat de este pedido.' });

    const sender = await pool.query('SELECT nombre FROM usuarios WHERE id = $1', [authUser.id]);
    if (sender.rows.length === 0) return res.status(401).json({ error: 'La cuenta ya no está disponible.' });

    const nuevoMsg = await pool.query(
      `INSERT INTO chat_mensajes (pedido_id, remitente_id, remitente_nombre, mensaje)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [id, authUser.id, sender.rows[0].nombre, mensaje.trim()]
    );
    res.json(nuevoMsg.rows[0]);
  } catch (error) {
    console.error('Error en chat:', error);
    res.status(500).json({ error: 'Error chat' });
  }
});

router.put('/:id/estado', async (req: Request, res: Response): Promise<any> => {
  const authUser = req.authUser;
  const id = getOrderId(req.params.id);
  const nuevoEstado = req.body?.nuevo_estado;
  if (!authUser) return res.status(401).json({ error: 'Sesión inválida.' });
  if (!id || !['cancelado', 'entregado_repartidor', 'completado'].includes(nuevoEstado)) {
    return res.status(400).json({ error: 'El estado solicitado no es válido.' });
  }

  let query: string;
  let params: Array<string | number>;
  if (nuevoEstado === 'cancelado' && authUser.rol === 'cliente') {
    query = "UPDATE pedidos SET estado = $1 WHERE id = $2 AND cliente_id = $3 AND estado IN ('pendiente', 'postulado')";
    params = [nuevoEstado, id, authUser.id];
  } else if (nuevoEstado === 'entregado_repartidor' && authUser.rol === 'repartidor') {
    query = "UPDATE pedidos SET estado = $1 WHERE id = $2 AND repartidor_id = $3 AND estado = 'aceptado'";
    params = [nuevoEstado, id, authUser.id];
  } else if (nuevoEstado === 'completado') {
    query = `UPDATE pedidos SET estado = $1 WHERE id = $2
             AND estado = 'entregado_repartidor'
             AND (cliente_id = $3 OR repartidor_id = $3)`;
    params = [nuevoEstado, id, authUser.id];
  } else {
    return res.status(403).json({ error: 'No tienes permiso para realizar este cambio de estado.' });
  }

  try {
    const update = await pool.query(query, params);
    if (update.rowCount === 0) return res.status(409).json({ error: 'El pedido no existe o no admite ese cambio de estado.' });
    const resultadoFinal = await pool.query('SELECT * FROM pedidos WHERE id = $1', [id]);
    res.json({ mensaje: `Estado actualizado`, pedido: resultadoFinal.rows[0] });
  } catch (error) {
    console.error('Error al actualizar estado:', error);
    res.status(500).json({ error: 'Error al actualizar estado' });
  }
});

export default router;