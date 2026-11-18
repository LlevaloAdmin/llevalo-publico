import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { allowedOrigins } from './config';
import { verifyAccessToken } from './middleware/auth';

dotenv.config();

import './db';
import authRoutes from './routes/auth';
import pedidosRoutes from './routes/pedidos';

const app = express();
app.use(cors({
  origin: (origin, callback) => callback(null, !origin || allowedOrigins.includes(origin))
}));
app.use(express.json({ limit: '1mb' }));
app.use('/api/auth', authRoutes);
app.use('/api/pedidos', pedidosRoutes);

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"]
  }
});

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  const authUser = typeof token === 'string' ? verifyAccessToken(token) : null;
  if (!authUser) {
    next(new Error('Unauthorized'));
    return;
  }
  socket.data.authUser = authUser;
  next();
});

const PORT = process.env.PORT || 5000;

// Ruta de prueba para verificar estado
app.get('/api/ping', (req, res) => {
  res.json({ status: 'Servidor de Llévalo activo y operativo 🚀' });
});

// Canal de WebSockets para rastreo en tiempo real
io.on('connection', (socket) => {
  console.log(`Usuario conectado: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`Usuario desconectado: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});