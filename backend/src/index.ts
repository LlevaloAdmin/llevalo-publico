import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

import './db';
import authRoutes from './routes/auth';
import pedidosRoutes from './routes/pedidos';

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/pedidos', pedidosRoutes);

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 5000;

// Ruta de prueba para verificar estado
app.get('/api/ping', (req, res) => {
  res.json({ status: 'Servidor de Llévalo activo y operativo 🚀' });
});

// Canal de WebSockets para rastreo en tiempo real
io.on('connection', (socket) => {
  console.log(`Usuario conectado: ${socket.id}`);

  socket.on('actualizar_ubicacion_repartidor', (data) => {
    io.emit('ubicacion_repartidor_actualizada', data);
  });

  socket.on('disconnect', () => {
    console.log(`Usuario desconectado: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});