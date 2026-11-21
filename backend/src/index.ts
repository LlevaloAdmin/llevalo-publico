import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { allowedOrigins, TRUST_PROXY_HOPS } from './config';
import { verifyAccessToken } from './utils/authToken';
import { sesionAutenticadaActiva } from './utils/authSessions';

dotenv.config();

import './db';
import authRoutes from './routes/auth';
import notificationsRoutes from './routes/notifications';
import pedidosRoutes from './routes/pedidos';
import pagosRoutes from './routes/pagos';
import reviewsRoutes from './routes/reviews';

const app = express();
app.set('trust proxy', TRUST_PROXY_HOPS);
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => callback(null, !origin || allowedOrigins.includes(origin)),
  maxAge: 600
}));
app.use(express.json({ limit: '1mb' }));
app.use('/api/auth', authRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/pedidos', pedidosRoutes);
app.use('/api/pagos', pagosRoutes);
app.use('/api/reviews', reviewsRoutes);

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"]
  }
});

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    const authUser = typeof token === 'string' ? verifyAccessToken(token) : null;
    if (!authUser || !await sesionAutenticadaActiva(authUser.session_id, authUser.id)) {
      next(new Error('Unauthorized'));
      return;
    }
    socket.data.authUser = authUser;
    next();
  } catch (error) {
    console.error('Error verificando la sesión del WebSocket:', error);
    next(new Error('Service unavailable'));
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

  socket.on('disconnect', () => {
    console.log(`Usuario desconectado: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});