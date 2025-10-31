const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
// Cargar variables de entorno en desarrollo/local
try {
  require('dotenv').config({ path: path.join(__dirname, '.env') });
} catch (_) {
  // Si dotenv no está instalado en producción, ignorar silenciosamente
}

const app = express();
const port = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(express.static(path.join(__dirname, '..')));
app.use('/public', express.static(path.join(__dirname, 'public')));

// Configuración de la Base de Datos
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL no está definida.');
if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET no está definida.');

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

// Migraciones automáticas
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS empresas (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(255) NOT NULL,
        ruc VARCHAR(20),
        direccion TEXT,
        telefono VARCHAR(50),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        descripcion TEXT,
        logo_url TEXT
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS socios (
        id SERIAL PRIMARY KEY,
        nombres VARCHAR(100) NOT NULL,
        apellidos VARCHAR(100) NOT NULL,
        cedula VARCHAR(20) UNIQUE NOT NULL,
        telefono VARCHAR(50) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        direccion TEXT,
        experiencia TEXT,
        fecha_registro TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS productos (
        id SERIAL PRIMARY KEY,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        nombre VARCHAR(255) NOT NULL,
        categoria VARCHAR(100),
        precio NUMERIC(10, 2) NOT NULL,
        comision NUMERIC(5, 2),
        stock INTEGER,
        descripcion TEXT,
        color_capuchon VARCHAR(100),
        fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ventas (
        id SERIAL PRIMARY KEY,
        socio_id INTEGER REFERENCES socios(id) ON DELETE CASCADE,
        producto_id INTEGER REFERENCES productos(id) ON DELETE CASCADE,
        cantidad INTEGER NOT NULL,
        precio_total NUMERIC(10, 2) NOT NULL,
        comision_total NUMERIC(10, 2) NOT NULL,
        fecha_venta TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS clientes (
        id SERIAL PRIMARY KEY,
        socio_id INTEGER REFERENCES socios(id) ON DELETE CASCADE,
        tipo VARCHAR(50) NOT NULL,
        razon_social VARCHAR(255),
        representante VARCHAR(255),
        ruc VARCHAR(20),
        nombres VARCHAR(100),
        apellidos VARCHAR(100),
        cedula VARCHAR(20),
        email VARCHAR(255),
        telefono VARCHAR(50),
        direccion TEXT,
        ciudad VARCHAR(100),
        fecha_registro TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS proformas (
        id SERIAL PRIMARY KEY,
        socio_id INTEGER REFERENCES socios(id) ON DELETE CASCADE,
        cliente_id INTEGER REFERENCES clientes(id) ON DELETE CASCADE,
        empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
        producto_id INTEGER REFERENCES productos(id) ON DELETE CASCADE,
        cantidad INTEGER NOT NULL,
        precio_estimado NUMERIC(10, 2) NOT NULL,
        observaciones TEXT,
        urgencia VARCHAR(50),
        estado VARCHAR(50) NOT NULL,
        fecha_solicitud TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        numero_proforma VARCHAR(100),
        respuesta JSONB,
        fecha_respuesta TIMESTAMP WITH TIME ZONE
      );
    `);
  } catch (e) {
    console.warn('Migración error:', e.message);
  }
})();

// JWT Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

// Guardar logo base64 en disco
function saveDataUrlToFile(dataUrl, subfolder) {
  try {
    const match = /^data:(.+);base64,(.+)$/.exec(dataUrl || '');
    if (!match) return null;
    const mime = match[1];
    const b64 = match[2];
    const buf = Buffer.from(b64, 'base64');
    const extMap = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
    const ext = extMap[mime] || 'bin';
    const dir = path.join(__dirname, 'public', subfolder);
    fs.mkdirSync(dir, { recursive: true });
    const filename = `logo_${Date.now()}_${Math.floor(Math.random()*1e6)}.${ext}`;
    fs.writeFileSync(path.join(dir, filename), buf);
    return `/public/${subfolder.replace(/\\/g, '/')}/${filename}`;
  } catch (e) {
    console.error('Error guardando logo:', e);
    return null;
  }
}

// Registro empresa
app.post('/api/register/empresa', async (req, res) => {
  const { nombre, ruc, direccion, telefono, email, password, descripcion, logo } = req.body;

  // Validación de campos obligatorios y tipos
  if (!nombre || typeof nombre !== 'string' || !email || typeof email !== 'string' || !password || typeof password !== 'string') {
    return res.status(400).json({ message: 'Faltan campos obligatorios o formato incorrecto.' });
  }
  // Validación de email simple
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Email inválido.' });
  }
  // Validación de longitud mínima de contraseña
  if (password.length < 6) {
    return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres.' });
  }

  try {
    const t = (v) => typeof v === 'string' ? v.trim() : v;
    const password_hash = await bcrypt.hash(password, 10);
    let logo_url = null;
    if (logo && typeof logo === 'string' && logo.startsWith('data:')) {
      logo_url = saveDataUrlToFile(logo, 'uploads/logos');
      if (!logo_url) {
        return res.status(400).json({ message: 'El logo no pudo guardarse. Verifica el formato.' });
      }
    }
    const { rows } = await pool.query(
      `INSERT INTO empresas (nombre, ruc, direccion, telefono, email, password_hash, descripcion, logo_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, nombre, email, logo_url;`,
      [t(nombre), t(ruc), t(direccion), t(telefono), t(email), password_hash, t(descripcion), logo_url]
    );
    res.status(201).json({ message: 'Empresa registrada exitosamente', user: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'El email ya está registrado.' });
    if (err.code === '22P02') return res.status(400).json({ message: 'Formato de datos inválido.' });
    console.error('Error registro empresa:', err);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Registro socio
app.post('/api/register/socio', async (req, res) => {
  const { nombres, apellidos, cedula, telefono, email, password, direccion, experiencia } = req.body;
  if (!nombres || !apellidos || !cedula || !telefono || !email || !password) return res.status(400).json({ message: 'Faltan campos obligatorios.' });
  // Validaciones adicionales
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Email inválido.' });
  }
  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres.' });
  }
  try {
    const t = (v) => typeof v === 'string' ? v.trim() : v;
    const password_hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO socios (nombres, apellidos, cedula, telefono, email, password_hash, direccion, experiencia)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, nombres, email;`,
      [t(nombres), t(apellidos), t(cedula), t(telefono), t(email), password_hash, t(direccion), t(experiencia)]
    );
    res.status(201).json({ message: 'Socio registrado exitosamente', user: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'El email o la cédula ya está registrado.' });
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Login empresa
app.post('/api/login/empresa', async (req, res) => {
  const { email, password } = req.body;
  try {
    const { rows } = await pool.query('SELECT * FROM empresas WHERE email = $1', [email]);
    if (!rows.length) return res.status(401).json({ message: 'Email o contraseña incorrectos.' });
    const user = rows[0];
    if (!await bcrypt.compare(password, user.password_hash)) return res.status(401).json({ message: 'Email o contraseña incorrectos.' });
    const token = jwt.sign({ userId: user.id, userRole: 'empresa' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    delete user.password_hash;
    res.status(200).json({ message: 'Login exitoso', token, user });
  } catch (err) {
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Login socio
app.post('/api/login/socio', async (req, res) => {
  const { email, password } = req.body;
  try {
    const { rows } = await pool.query('SELECT * FROM socios WHERE email = $1', [email]);
    if (!rows.length) return res.status(401).json({ message: 'Email o contraseña incorrectos.' });
    const user = rows[0];
    if (!await bcrypt.compare(password, user.password_hash)) return res.status(401).json({ message: 'Email o contraseña incorrectos.' });
    const token = jwt.sign({ userId: user.id, userRole: 'socio' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    delete user.password_hash;
    res.status(200).json({ message: 'Login exitoso', token, user });
  } catch (err) {
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// CRUD productos (empresa)
app.post('/api/products', authenticateToken, async (req, res) => {
  if (req.user.userRole !== 'empresa') return res.status(403).json({ message: 'Solo empresas pueden crear productos.' });
  const { nombre, categoria, precio, comision, stock, descripcion, colorCapuchon } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO productos (empresa_id, nombre, categoria, precio, comision, stock, descripcion, color_capuchon)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *;`,
      [req.user.userId, nombre, categoria, precio, comision, stock, descripcion, colorCapuchon]
    );
    res.status(201).json({ message: 'Producto creado exitosamente', product: rows[0] });
  } catch (err) {
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

app.get('/api/products', authenticateToken, async (req, res) => {
  try {
    let query, values = [];
    if (req.user.userRole === 'empresa') {
      query = 'SELECT * FROM productos WHERE empresa_id = $1 ORDER BY fecha_creacion DESC';
      values = [req.user.userId];
    } else {
      query = 'SELECT p.*, e.nombre as empresa_nombre FROM productos p JOIN empresas e ON p.empresa_id = e.id ORDER BY e.nombre, p.nombre';
    }
    const { rows } = await pool.query(query, values);
    res.status(200).json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

app.put('/api/products/:id', authenticateToken, async (req, res) => {
  if (req.user.userRole !== 'empresa') return res.status(403).json({ message: 'Solo empresas pueden actualizar productos.' });
  const { nombre, categoria, precio, comision, stock, descripcion, colorCapuchon } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE productos SET nombre=$1, categoria=$2, precio=$3, comision=$4, stock=$5, descripcion=$6, color_capuchon=$7
       WHERE id=$8 AND empresa_id=$9 RETURNING *;`,
      [nombre, categoria, precio, comision, stock, descripcion, colorCapuchon, req.params.id, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ message: 'Producto no encontrado.' });
    res.status(200).json({ message: 'Producto actualizado', product: rows[0] });
  } catch (err) {
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

app.delete('/api/products/:id', authenticateToken, async (req, res) => {
  if (req.user.userRole !== 'empresa') return res.status(403).json({ message: 'Solo empresas pueden eliminar productos.' });
  try {
    const result = await pool.query('DELETE FROM productos WHERE id=$1 AND empresa_id=$2', [req.params.id, req.user.userId]);
    if (!result.rowCount) return res.status(404).json({ message: 'Producto no encontrado.' });
    res.status(200).json({ message: 'Producto eliminado' });
  } catch (err) {
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// CRUD clientes (socio)
app.post('/api/clientes', authenticateToken, async (req, res) => {
  if (req.user.userRole !== 'socio') return res.status(403).json({ message: 'Solo socios pueden crear clientes.' });
  const { tipo, razon_social, representante, ruc, nombres, apellidos, cedula, email, telefono, direccion, ciudad } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO clientes (socio_id, tipo, razon_social, representante, ruc, nombres, apellidos, cedula, email, telefono, direccion, ciudad)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *;`,
      [req.user.userId, tipo, razon_social, representante, ruc, nombres, apellidos, cedula, email, telefono, direccion, ciudad]
    );
    res.status(201).json({ message: 'Cliente creado', cliente: rows[0] });
  } catch (err) {
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

app.get('/api/clientes', authenticateToken, async (req, res) => {
  if (req.user.userRole !== 'socio') return res.status(403).json({ message: 'Solo socios pueden ver clientes.' });
  try {
    const { rows } = await pool.query('SELECT * FROM clientes WHERE socio_id = $1 ORDER BY fecha_registro DESC', [req.user.userId]);
    res.status(200).json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// CRUD ventas (socio)
app.post('/api/ventas', authenticateToken, async (req, res) => {
  if (req.user.userRole !== 'socio') return res.status(403).json({ message: 'Solo socios pueden registrar ventas.' });
  const { productoId, cantidad, total, comision } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: prodRows } = await client.query('SELECT * FROM productos WHERE id = $1 FOR UPDATE', [productoId]);
    const producto = prodRows[0];
    if (!producto) throw new Error('Producto no encontrado.');
    if ((producto.stock || 0) < cantidad) throw new Error('Stock insuficiente.');
    await client.query('UPDATE productos SET stock = $1 WHERE id = $2', [producto.stock - cantidad, productoId]);
    const { rows: ventaRows } = await client.query(
      `INSERT INTO ventas (socio_id, producto_id, cantidad, precio_total, comision_total)
       VALUES ($1,$2,$3,$4,$5) RETURNING *;`,
      [req.user.userId, productoId, cantidad, total, comision]
    );
    await client.query('COMMIT');
    res.status(201).json({ message: 'Venta registrada', venta: ventaRows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ message: err.message || 'Error interno del servidor.' });
  } finally {
    client.release();
  }
});

app.get('/api/ventas', authenticateToken, async (req, res) => {
  if (req.user.userRole !== 'socio') return res.status(403).json({ message: 'Solo socios pueden ver ventas.' });
  try {
    const { rows } = await pool.query(`
      SELECT v.id, v.fecha_venta, p.nombre as producto_nombre, e.nombre as empresa_nombre,
             v.cantidad, v.precio_total, v.comision_total
      FROM ventas v
      JOIN productos p ON v.producto_id = p.id
      JOIN empresas e ON p.empresa_id = e.id
      WHERE v.socio_id = $1
      ORDER BY v.fecha_venta DESC;`, [req.user.userId]);
    res.status(200).json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// CRUD proformas (socio y empresa)
app.post('/api/proformas', authenticateToken, async (req, res) => {
  if (req.user.userRole !== 'socio') return res.status(403).json({ message: 'Solo socios pueden crear proformas.' });
  const { clienteId, empresaId, productoId, cantidad, precioEstimado, observaciones, urgencia } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO proformas (socio_id, cliente_id, empresa_id, producto_id, cantidad, precio_estimado, observaciones, urgencia, estado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'enviada') RETURNING *;`,
      [req.user.userId, clienteId, empresaId, productoId, cantidad, precioEstimado, observaciones, urgencia]
    );
    res.status(201).json({ message: 'Proforma creada', proforma: rows[0] });
  } catch (err) {
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

app.get('/api/proformas/empresa', authenticateToken, async (req, res) => {
  if (req.user.userRole !== 'empresa') return res.status(403).json({ message: 'Solo empresas pueden ver proformas.' });
  try {
    const { rows } = await pool.query(`
      SELECT pf.id, pf.fecha_solicitud,
             s.nombres as socio_nombres, s.apellidos as socio_apellidos,
             c.razon_social as cliente_razon_social, c.nombres as cliente_nombres, c.apellidos as cliente_apellidos,
             p.nombre as producto_nombre,
             pf.cantidad, pf.precio_estimado, pf.estado
      FROM proformas pf
      JOIN socios s ON pf.socio_id = s.id
      JOIN clientes c ON pf.cliente_id = c.id
      JOIN productos p ON pf.producto_id = p.id
      WHERE pf.empresa_id = $1
      ORDER BY pf.fecha_solicitud DESC;`, [req.user.userId]);
    res.status(200).json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

app.get('/api/proformas/socio', authenticateToken, async (req, res) => {
  if (req.user.userRole !== 'socio') return res.status(403).json({ message: 'Solo socios pueden ver proformas.' });
  try {
    const { rows } = await pool.query(`
      SELECT pf.id, pf.fecha_solicitud,
             c.razon_social as cliente_razon_social, c.nombres as cliente_nombres, c.apellidos as cliente_apellidos,
             e.nombre as empresa_nombre,
             p.nombre as producto_nombre,
             pf.cantidad, pf.precio_estimado, pf.estado
      FROM proformas pf
      JOIN clientes c ON pf.cliente_id = c.id
      JOIN empresas e ON pf.empresa_id = e.id
      JOIN productos p ON pf.producto_id = p.id
      WHERE pf.socio_id = $1
      ORDER BY pf.fecha_solicitud DESC;`, [req.user.userId]);
    res.status(200).json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

app.put('/api/proformas/:id/respuesta', authenticateToken, async (req, res) => {
  if (req.user.userRole !== 'empresa') return res.status(403).json({ message: 'Solo empresas pueden responder proformas.' });
  const { respuesta } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE proformas SET respuesta=$1, estado='aprobada', fecha_respuesta=CURRENT_TIMESTAMP
       WHERE id=$2 AND empresa_id=$3 RETURNING *;`,
      [respuesta, req.params.id, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ message: 'Proforma no encontrada.' });
    res.status(200).json({ message: 'Respuesta enviada', proforma: rows[0] });
  } catch (err) {
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Listar empresas (socio)
app.get('/api/empresas', authenticateToken, async (req, res) => {
  if (req.user.userRole !== 'socio') return res.status(403).json({ message: 'Solo socios pueden ver empresas.' });
  try {
    const { rows } = await pool.query('SELECT id, nombre, ruc, direccion, telefono, email, descripcion, logo_url FROM empresas ORDER BY nombre');
    res.status(200).json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Listar socios de una empresa
app.get('/api/socios', authenticateToken, async (req, res) => {
  if (req.user.userRole !== 'empresa') return res.status(403).json({ message: 'Solo empresas pueden ver socios.' });
  try {
    const { rows } = await pool.query(`
      SELECT s.id, s.nombres, s.apellidos, s.email, s.telefono,
             COALESCE(SUM(v.cantidad),0) as productos_vendidos,
             COALESCE(SUM(v.comision_total),0) as comision_total
      FROM socios s
      JOIN ventas v ON s.id = v.socio_id
      JOIN productos p ON v.producto_id = p.id
      WHERE p.empresa_id = $1
      GROUP BY s.id, s.nombres, s.apellidos, s.email, s.telefono
      ORDER BY comision_total DESC;`, [req.user.userId]);
    res.status(200).json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Estadísticas del socio
app.get('/api/socios/stats', authenticateToken, async (req, res) => {
  if (req.user.userRole !== 'socio') return res.status(403).json({ message: 'Solo socios pueden ver estadísticas.' });
  try {
    const [{ rows: rowsMes }, { rows: rowsTot }, { rows: rowsCount }, { rows: rowsEmp }] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(comision_total),0) as comisiones_mes FROM ventas WHERE socio_id=$1 AND date_trunc('month', fecha_venta) = date_trunc('month', CURRENT_DATE)`, [req.user.userId]),
      pool.query(`SELECT COALESCE(SUM(comision_total),0) as comisiones_total FROM ventas WHERE socio_id=$1`, [req.user.userId]),
      pool.query(`SELECT COUNT(*)::int as ventas_realizadas FROM ventas WHERE socio_id=$1`, [req.user.userId]),
      pool.query(`SELECT COUNT(DISTINCT e.id)::int as empresas_colaborando FROM ventas v JOIN productos p ON v.producto_id=p.id JOIN empresas e ON p.empresa_id=e.id WHERE v.socio_id=$1`, [req.user.userId])
    ]);
    res.status(200).json({
      comisiones_mes: rowsMes[0].comisiones_mes,
      comisiones_total: rowsTot[0].comisiones_total,
      ventas_realizadas: rowsCount[0].ventas_realizadas,
      empresas_colaborando: rowsEmp[0].empresas_colaborando
    });
  } catch (err) {
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Actualizar perfil empresa
app.put('/api/empresas/profile', authenticateToken, async (req, res) => {
  if (req.user.userRole !== 'empresa') return res.status(403).json({ message: 'Solo empresas pueden actualizar perfil.' });
  const { nombre, ruc, direccion, telefono, email, descripcion } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE empresas SET nombre=$1, ruc=$2, direccion=$3, telefono=$4, email=$5, descripcion=$6
       WHERE id=$7 RETURNING id, nombre, ruc, direccion, telefono, email, descripcion, logo_url;`,
      [nombre, ruc, direccion, telefono, email, descripcion, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ message: 'Empresa no encontrada.' });
    res.status(200).json({ message: 'Perfil actualizado', user: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'El email ya está en uso.' });
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Actualizar perfil socio
app.put('/api/socios/profile', authenticateToken, async (req, res) => {
  if (req.user.userRole !== 'socio') return res.status(403).json({ message: 'Solo socios pueden actualizar perfil.' });
  const { nombres, apellidos, cedula, telefono, email, direccion, experiencia } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE socios SET nombres=$1, apellidos=$2, cedula=$3, telefono=$4, email=$5, direccion=$6, experiencia=$7
       WHERE id=$8 RETURNING id, nombres, apellidos, cedula, telefono, email, direccion, experiencia;`,
      [nombres, apellidos, cedula, telefono, email, direccion, experiencia, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ message: 'Socio no encontrado.' });
    res.status(200).json({ message: 'Perfil actualizado', user: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'El email o la cédula ya está en uso.' });
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Healthcheck sencillo para verificar la BD y tablas clave
app.get('/api/health', async (req, res) => {
  try {
    const client = await pool.connect();
    try {
      const checks = {};
      // Comprobar conexión
      const { rows: ping } = await client.query('SELECT NOW() as now');
      checks.db_now = ping[0].now;
      // Comprobar tablas mínimas
      await client.query('SELECT 1 FROM empresas LIMIT 1');
      await client.query('SELECT 1 FROM socios LIMIT 1');
      await client.query('SELECT 1 FROM productos LIMIT 1');
      checks.tables = 'ok';
      return res.status(200).json({ status: 'ok', ...checks });
    } finally {
      client.release();
    }
  } catch (err) {
    // Si falta una tabla, Postgres devuelve 42P01
    const code = err && err.code ? err.code : undefined;
    const msg = code === '42P01' ? 'Falta alguna tabla. Ejecuta migraciones.' : (err && err.message ? err.message : 'Error desconocido');
    return res.status(500).json({ status: 'error', code, message: msg });
  }
});

// Iniciar servidor
app.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`);
});

