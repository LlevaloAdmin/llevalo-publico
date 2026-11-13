"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const router = (0, express_1.Router)();
const initTables = async () => {
    try {
        await db_1.pool.query(`
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
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Autoparches absolutos para la tabla pedidos
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cliente_cedula VARCHAR(30);
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cliente_foto TEXT;
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS repartidor_id INTEGER;
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS repartidor_nombre VARCHAR(120);
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS repartidor_vehiculo VARCHAR(100) DEFAULT 'Moto Suzuki GN';
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS repartidor_placa VARCHAR(30) DEFAULT 'ABC-123';
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS repartidor_foto TEXT;
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS repartidor_vehiculo_foto TEXT;
      ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS repartidor_calificacion NUMERIC(3,2) DEFAULT 5.0;

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

      -- Autoparches para la tabla postulaciones
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
    }
    catch (err) {
        console.error('Error inicializando tablas:', err);
    }
};
initTables();
router.post('/', async (req, res) => {
    const { cliente_id, cliente_nombre, cliente_cedula, cliente_foto, tipo_servicio, descripcion, origen_texto, origen_lat, origen_lon, destino_texto, destino_lat, destino_lon, distancia_km, tiempo_min, tarifa } = req.body;
    try {
        const result = await db_1.pool.query(`INSERT INTO pedidos 
      (cliente_id, cliente_nombre, cliente_cedula, cliente_foto, tipo_servicio, descripcion, origen_texto, origen_lat, origen_lon, destino_texto, destino_lat, destino_lon, distancia_km, tiempo_min, tarifa, estado)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'pendiente')
      RETURNING *`, [
            cliente_id,
            cliente_nombre || 'Cliente',
            cliente_cedula || 'V-00000000',
            cliente_foto || '',
            tipo_servicio || 'comida',
            descripcion || 'Servicio estándar',
            origen_texto || 'Origen',
            Number(origen_lat) || 10.2291,
            Number(origen_lon) || -68.0055,
            destino_texto || 'Destino',
            Number(destino_lat) || 10.2491,
            Number(destino_lon) || -68.0255,
            Number(distancia_km) || 3.5,
            Number(tiempo_min) || 10,
            Number(tarifa) || 3.50
        ]);
        res.status(201).json({ mensaje: 'Pedido publicado', pedido: result.rows[0] });
    }
    catch (error) {
        console.error("❌ ERROR REAL AL CREAR PEDIDO EN BACKEND:", error.message || error);
        res.status(500).json({ error: error.message || 'Error en servidor' });
    }
});
router.get('/', async (_req, res) => {
    try {
        const pedidosRes = await db_1.pool.query("SELECT * FROM pedidos WHERE estado != 'cancelado' ORDER BY creado_en DESC");
        const postulacionesRes = await db_1.pool.query("SELECT * FROM postulaciones");
        const chatRes = await db_1.pool.query("SELECT * FROM chat_mensajes ORDER BY creado_en ASC");
        res.json({ pedidos: pedidosRes.rows, postulaciones: postulacionesRes.rows, mensajes: chatRes.rows });
    }
    catch (error) {
        res.status(500).json({ error: 'Error al consultar' });
    }
});
router.post('/:id/postular', async (req, res) => {
    const { id } = req.params;
    const { repartidor_id, repartidor_nombre, vehiculo, placa, vehiculo_foto, calificacion } = req.body;
    try {
        const existe = await db_1.pool.query("SELECT * FROM postulaciones WHERE pedido_id = $1 AND repartidor_id = $2", [id, repartidor_id]);
        if (existe.rows.length > 0) {
            return res.status(400).json({ error: 'Ya te postulaste a este pedido.' });
        }
        const nueva = await db_1.pool.query(`INSERT INTO postulaciones (pedido_id, repartidor_id, repartidor_nombre, vehiculo, placa, vehiculo_foto, calificacion, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pendiente') RETURNING *`, [id, repartidor_id, repartidor_nombre, vehiculo || 'Moto', placa || 'ABC-123', vehiculo_foto || '', calificacion || 4.9]);
        await db_1.pool.query("UPDATE pedidos SET estado = 'postulado' WHERE id = $1 AND estado = 'pendiente'", [id]);
        res.json({ mensaje: 'Postulación enviada', postulacion: nueva.rows[0] });
    }
    catch (error) {
        console.error("❌ ERROR AL POSTULARSE:", error.message);
        res.status(500).json({ error: 'Error al postularse' });
    }
});
router.put('/:id/aceptar-postulacion', async (req, res) => {
    const { id } = req.params;
    const { repartidor_id, repartidor_nombre, vehiculo, placa, vehiculo_foto, calificacion } = req.body;
    try {
        await db_1.pool.query("UPDATE postulaciones SET estado = 'aceptado' WHERE pedido_id = $1 AND repartidor_id = $2", [id, repartidor_id]);
        await db_1.pool.query("UPDATE postulaciones SET estado = 'rechazado' WHERE pedido_id = $1 AND repartidor_id != $2", [id, repartidor_id]);
        const pedidoActualizado = await db_1.pool.query(`UPDATE pedidos 
       SET estado = 'aceptado', repartidor_id = $1, repartidor_nombre = $2, repartidor_vehiculo = $3, repartidor_placa = $4, repartidor_vehiculo_foto = $5, repartidor_calificacion = $6 
       WHERE id = $7 RETURNING *`, [repartidor_id, repartidor_nombre, vehiculo || 'Moto', placa || 'ABC-123', vehiculo_foto || '', calificacion || 4.9, id]);
        res.json({ mensaje: 'Repartidor seleccionado', pedido: pedidoActualizado.rows[0] });
    }
    catch (error) {
        console.error("❌ ERROR AL ACEPTAR POSTULACIÓN:", error.message);
        res.status(500).json({ error: 'Error al aceptar' });
    }
});
router.post('/:id/chat', async (req, res) => {
    const { id } = req.params;
    const { remitente_id, remitente_nombre, mensaje } = req.body;
    try {
        const nuevoMsg = await db_1.pool.query(`INSERT INTO chat_mensajes (pedido_id, remitente_id, remitente_nombre, mensaje)
       VALUES ($1, $2, $3, $4) RETURNING *`, [id, remitente_id, remitente_nombre, mensaje]);
        res.json(nuevoMsg.rows[0]);
    }
    catch (error) {
        res.status(500).json({ error: 'Error chat' });
    }
});
router.put('/:id/estado', async (req, res) => {
    const { id } = req.params;
    const { nuevo_estado, rol_usuario } = req.body;
    try {
        // Obtenemos el pedido actual
        const pedidoActual = await db_1.pool.query("SELECT * FROM pedidos WHERE id = $1", [id]);
        if (pedidoActual.rows.length === 0)
            return res.status(404).json({ error: 'Pedido no encontrado' });
        let p = pedidoActual.rows[0];
        let estadoFinal = p.estado;
        if (nuevo_estado === 'completar_solicitado') {
            if (rol_usuario === 'repartidor') {
                await db_1.pool.query("UPDATE pedidos SET repartidor_quiere_finalizar = TRUE WHERE id = $1", [id]);
            }
            else {
                await db_1.pool.query("UPDATE pedidos SET cliente_quiere_finalizar = TRUE WHERE id = $1", [id]);
            }
            // Verificamos si ambos ya querían finalizar
            const actualizado = await db_1.pool.query("SELECT * FROM pedidos WHERE id = $1", [id]);
            p = actualizado.rows[0];
            if (p.repartidor_quiere_finalizar && p.cliente_quiere_finalizar) {
                estadoFinal = 'completado';
                await db_1.pool.query("UPDATE pedidos SET estado = 'completado' WHERE id = $1", [id]);
            }
            else {
                estadoFinal = 'esperando_confirmacion_mutua';
                await db_1.pool.query("UPDATE pedidos SET estado = 'esperando_confirmacion_mutua' WHERE id = $1", [id]);
            }
        }
        else {
            estadoFinal = nuevo_estado;
            await db_1.pool.query("UPDATE pedidos SET estado = $1 WHERE id = $2", [nuevo_estado, id]);
        }
        const resultadoFinal = await db_1.pool.query("SELECT * FROM pedidos WHERE id = $1", [id]);
        res.json({ mensaje: `Estado actualizado`, pedido: resultadoFinal.rows[0] });
    }
    catch (error) {
        res.status(500).json({ error: 'Error al actualizar estado' });
    }
});
exports.default = router;
