"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const config_1 = require("./config");
const auth_1 = require("./middleware/auth");
dotenv_1.default.config();
require("./db");
const auth_2 = __importDefault(require("./routes/auth"));
const pedidos_1 = __importDefault(require("./routes/pedidos"));
const pagos_1 = __importDefault(require("./routes/pagos"));
const app = (0, express_1.default)();
app.use((0, cors_1.default)({
    origin: (origin, callback) => callback(null, !origin || config_1.allowedOrigins.includes(origin))
}));
app.use(express_1.default.json({ limit: '1mb' }));
app.use('/api/auth', auth_2.default);
app.use('/api/pedidos', pedidos_1.default);
app.use('/api/pagos', pagos_1.default);
const server = http_1.default.createServer(app);
const io = new socket_io_1.Server(server, {
    cors: {
        origin: config_1.allowedOrigins,
        methods: ["GET", "POST"]
    }
});
io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    const authUser = typeof token === 'string' ? (0, auth_1.verifyAccessToken)(token) : null;
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
