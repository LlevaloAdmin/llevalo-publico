import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dns from 'dns/promises';
import { pool } from '../db';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'llevalo_clave_secreta_2026';
const codigosSMS: Record<string, string> = {};

// Enviar SMS simulado
router.post('/enviar-sms', async (req: Request, res: Response): Promise<any> => {
  const { telefono } = req.body;
  if (!telefono || telefono.length < 10) {
    return res.status(400).json({ error: 'Ingresa un número de teléfono válido.' });
  }
  const codigo = Math.floor(100000 + Math.random() * 900000).toString();
  codigosSMS[telefono] = codigo;
  console.log(`📲 [SMS Llévalo] Código para ${telefono}: ${codigo}`);
  res.json({ mensaje: 'Código enviado', codigoPrueba: codigo });
});

// REGISTRO CON VALIDACIÓN ESTRICTA DE CORREO Y ROL ÚNICO
router.post('/register', async (req: Request, res: Response): Promise<any> => {
  const { nombre, email, telefono, codigoSms, password, rol } = req.body;

  try {
    // 1. Validar dominio de correo real (MX)
    const dominio = email.split('@')[1];
    if (!dominio) return res.status(400).json({ error: 'Correo inválido.' });

    try {
      const mx = await dns.resolveMx(dominio);
      if (!mx || mx.length === 0) throw new Error();
    } catch {
      return res.status(400).json({ error: `El dominio "@${dominio}" no puede recibir correos.` });
    }

    // 2. Validar código SMS si se proporcionó teléfono
    if (telefono) {
      if (!codigoSms || codigosSMS[telefono] !== codigoSms) {
        return res.status(400).json({ error: 'Código de verificación SMS incorrecto o expirado.' });
      }
      delete codigosSMS[telefono];
    }

    // 3. Verificar si el correo ya existe en la base de datos
    const userCheck = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
    
    if (userCheck.rows.length > 0) {
      const usuarioExistente = userCheck.rows[0];
      if (usuarioExistente.rol === rol) {
        return res.status(400).json({ error: `Ya existe una cuenta de ${rol} registrada con este correo electrónico.` });
      } else {
        return res.status(400).json({ error: `Este correo ya está registrado como ${usuarioExistente.rol}. No puedes usarlo para un rol distinto.` });
      }
    }

    // 4. Crear usuario
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = await pool.query(
      'INSERT INTO usuarios (nombre, email, telefono, password_hash, rol) VALUES ($1, $2, $3, $4, $5) RETURNING id, nombre, email, telefono, rol',
      [nombre, email, telefono || null, passwordHash, rol || 'cliente']
    );

    const user = newUser.rows[0];
    const token = jwt.sign({ id: user.id, rol: user.rol }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      mensaje: '¡Cuenta creada con éxito!',
      token,
      usuario: user
    });
  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({ error: 'Error interno al registrar el usuario.' });
  }
});

// LOGIN
router.post('/login', async (req: Request, res: Response): Promise<any> => {
  const { email, password } = req.body;

  try {
    const result = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Correo o contraseña incorrectos.' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(400).json({ error: 'Correo o contraseña incorrectos.' });
    }

    const token = jwt.sign({ id: user.id, rol: user.rol }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      mensaje: 'Login exitoso',
      token,
      usuario: {
        id: user.id,
        nombre: user.nombre,
        email: user.email,
        telefono: user.telefono,
        rol: user.rol
      }
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error interno al iniciar sesión.' });
  }
});

export default router;