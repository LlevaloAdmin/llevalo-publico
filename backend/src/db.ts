import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: true
  }
});

// Prueba de conexión inmediata al arrancar
pool.connect((err, client, release) => {
  if (err) {
    return console.error('Error al conectar a la base de datos de Neon ❌', err.stack);
  }
  console.log('Conectado exitosamente a la base de datos de Neon 🐘');
  release();
});