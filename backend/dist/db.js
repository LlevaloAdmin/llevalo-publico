"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
const pg_1 = require("pg");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.pool = new pg_1.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});
// Prueba de conexión inmediata al arrancar
exports.pool.connect((err, client, release) => {
    if (err) {
        return console.error('Error al conectar a la base de datos de Neon ❌', err.stack);
    }
    console.log('Conectado exitosamente a la base de datos de Neon 🐘');
    release();
});
