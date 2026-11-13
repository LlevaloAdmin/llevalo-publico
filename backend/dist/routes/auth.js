"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const promises_1 = __importDefault(require("dns/promises"));
const db_1 = require("../db");
const router = (0, express_1.Router)();
const JWT_SECRET = process.env.JWT_SECRET || 'llevalo_clave_secreta_2026';
const codigosSMS = {};
// Enviar SMS simulado
router.post('/enviar-sms', async (req, res) => {
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
router.post('/register', async (req, res) => {
    const { nombre, email, telefono, codigoSms, password, rol } = req.body;
    try {
        // 1. Validar dominio de correo real (MX)
        const dominio = email.split('@')[1];
        if (!dominio)
            return res.status(400).json({ error: 'Correo inválido.' });
        try {
            const mx = await promises_1.default.resolveMx(dominio);
            if (!mx || mx.length === 0)
                throw new Error();
        }
        catch {
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
        const userCheck = await db_1.pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
        if (userCheck.rows.length > 0) {
            const usuarioExistente = userCheck.rows[0];
            if (usuarioExistente.rol === rol) {
                return res.status(400).json({ error: `Ya existe una cuenta de ${rol} registrada con este correo electrónico.` });
            }
            else {
                return res.status(400).json({ error: `Este correo ya está registrado como ${usuarioExistente.rol}. No puedes usarlo para un rol distinto.` });
            }
        }
        // 4. Crear usuario
        const salt = await bcryptjs_1.default.genSalt(10);
        const passwordHash = await bcryptjs_1.default.hash(password, salt);
        const newUser = await db_1.pool.query('INSERT INTO usuarios (nombre, email, telefono, password_hash, rol) VALUES ($1, $2, $3, $4, $5) RETURNING id, nombre, email, telefono, rol', [nombre, email, telefono || null, passwordHash, rol || 'cliente']);
        const user = newUser.rows[0];
        const token = jsonwebtoken_1.default.sign({ id: user.id, rol: user.rol }, JWT_SECRET, { expiresIn: '7d' });
        res.status(201).json({
            mensaje: '¡Cuenta creada con éxito!',
            token,
            usuario: user
        });
    }
    catch (error) {
        console.error('Error en registro:', error);
        res.status(500).json({ error: 'Error interno al registrar el usuario.' });
    }
});
// LOGIN
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await db_1.pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Correo o contraseña incorrectos.' });
        }
        const user = result.rows[0];
        const validPassword = await bcryptjs_1.default.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(400).json({ error: 'Correo o contraseña incorrectos.' });
        }
        const token = jsonwebtoken_1.default.sign({ id: user.id, rol: user.rol }, JWT_SECRET, { expiresIn: '7d' });
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
    }
    catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ error: 'Error interno al iniciar sesión.' });
    }
});
exports.default = router;
