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
const config_1 = require("../config");
const router = (0, express_1.Router)();
// REGISTRO DIRECTO (Sin verificación SMS)
router.post('/register', async (req, res) => {
    const { nombre, email, telefono, password } = req.body ?? {};
    const rol = req.body?.rol || 'cliente';
    if (typeof nombre !== 'string' || !nombre.trim() || nombre.length > 120
        || typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        || typeof password !== 'string'
        || password.length < 8 || password.length > 128 || !/[A-Z]/.test(password) || !/[a-z]/.test(password)
        || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)
        || (telefono !== undefined && (typeof telefono !== 'string' || telefono.length > 30))
        || (rol !== 'cliente' && rol !== 'repartidor')) {
        return res.status(400).json({ error: 'Los datos de registro no son válidos.' });
    }
    const emailNormalizado = email.trim().toLowerCase();
    try {
        // 1. Validar dominio de correo real (MX)
        const dominio = emailNormalizado.split('@')[1];
        try {
            const mx = await promises_1.default.resolveMx(dominio);
            if (!mx || mx.length === 0)
                throw new Error();
        }
        catch {
            return res.status(400).json({ error: `El dominio "@${dominio}" no puede recibir correos.` });
        }
        // 2. Verificar si el correo ya existe en la base de datos
        const userCheck = await db_1.pool.query('SELECT * FROM usuarios WHERE lower(email) = $1', [emailNormalizado]);
        if (userCheck.rows.length > 0) {
            const usuarioExistente = userCheck.rows[0];
            if (usuarioExistente.rol === rol) {
                return res.status(400).json({ error: `Ya existe una cuenta de ${rol} registrada con este correo electrónico.` });
            }
            else {
                return res.status(400).json({ error: `Este correo ya está registrado como ${usuarioExistente.rol}. No puedes usarlo para un rol distinto.` });
            }
        }
        // 3. Crear usuario (Hasheando la contraseña)
        const salt = await bcryptjs_1.default.genSalt(10);
        const passwordHash = await bcryptjs_1.default.hash(password, salt);
        const newUser = await db_1.pool.query('INSERT INTO usuarios (nombre, email, telefono, password_hash, rol) VALUES ($1, $2, $3, $4, $5) RETURNING id, nombre, email, telefono, rol', [nombre.trim(), emailNormalizado, telefono?.trim() || null, passwordHash, rol]);
        const user = newUser.rows[0];
        const token = jsonwebtoken_1.default.sign({ id: user.id, rol: user.rol }, config_1.JWT_SECRET, { expiresIn: '7d' });
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
    const { email, password } = req.body ?? {};
    if (typeof email !== 'string' || email.length > 254 || typeof password !== 'string' || password.length > 128) {
        return res.status(400).json({ error: 'Correo o contraseña incorrectos.' });
    }
    try {
        const result = await db_1.pool.query('SELECT * FROM usuarios WHERE lower(email) = $1', [email.trim().toLowerCase()]);
        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Correo o contraseña incorrectos.' });
        }
        const user = result.rows[0];
        const validPassword = await bcryptjs_1.default.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(400).json({ error: 'Correo o contraseña incorrectos.' });
        }
        const token = jsonwebtoken_1.default.sign({ id: user.id, rol: user.rol }, config_1.JWT_SECRET, { expiresIn: '7d' });
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
