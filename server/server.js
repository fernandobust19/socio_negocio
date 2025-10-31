const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
const port = process.env.PORT || 3000;

// Middlewares
app.use(cors());
// Permite payloads grandes (logos en base64)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
// Servir frontend desde el raíz del proyecto
app.use(express.static(path.join(__dirname, '..')));
// Servir assets públicos del backend bajo /public
app.use('/public', express.static(path.join(__dirname, 'public')));

// --- Configuración de la Base de Datos (PostgreSQL) ---
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL no está definida en las variables de entorno.');
}
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET no está definida en las variables de entorno.');
}

const pool = new Pool({
  connectionString,
  // Requerido por Render; mantiene compatibilidad en despliegue
  ssl: { rejectUnauthorized: false }
});

// Migración ligera: asegurar columnas/tablas requeridas
(async () => {
  try {
    await pool.query('ALTER TABLE empresas ADD COLUMN IF NOT EXISTS ruc VARCHAR(20);');
    await pool.query('ALTER TABLE empresas ADD COLUMN IF NOT EXISTS logo_url TEXT;');
    await pool.query('ALTER TABLE empresas ADD COLUMN IF NOT EXISTS direccion TEXT;');
    await pool.query('ALTER TABLE empresas ADD COLUMN IF NOT EXISTS telefono VARCHAR(50);');
    await pool.query('ALTER TABLE empresas ADD COLUMN IF NOT EXISTS descripcion TEXT;');
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
    console.warn('No se pudo asegurar el esquema de la base de datos:', e.message);
  }
})();

// Middleware para verificar JWT
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

// Guardar Data URL (base64) a disco y retornar URL pública
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
    const fullPath = path.join(dir, filename);
    fs.writeFileSync(fullPath, buf);
    const subfolderNormalized = subfolder.replace(/\\/g, '/');
    return `/public/${subfolderNormalized}/${filename}`;
  } catch (e) {
    console.error('Error saving Data URL:', e);
    return null;
  }
}

// --- Rutas de la API ---

// Registrar nueva empresa
app.post('/api/register/empresa', async (req, res) => {
  const { nombre, ruc, direccion, telefono, email, password, descripcion, logo } = req.body;
  if (!nombre || !email || !password) {
    return res.status(400).json({ message: 'Faltan campos obligatorios: nombre, email o password.' });
  }
  try {
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);

    let logo_url = null;
    if (logo && typeof logo === 'string' && logo.startsWith('data:')) {
      const base64Match = /^data:(.+);base64,(.+)$/.exec(logo);
      if (!base64Match) {
        return res.status(400).json({ message: 'El logo no tiene un formato base64 válido.' });
      }
      logo_url = saveDataUrlToFile(logo, 'uploads/logos');
    }

    const query = `
      INSERT INTO empresas (nombre, ruc, direccion, telefono, email, password_hash, descripcion, logo_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, nombre, email, logo_url;
    `;
    const values = [nombre, ruc, direccion, telefono, email, password_hash, descripcion, logo_url];
    const { rows } = await pool.query(query, values);
    const newUser = rows[0];
    res.status(201).json({ message: 'Empresa registrada exitosamente', user: newUser });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'El email ya se encuentra registrado.' });
    }
    console.error('Registro empresa error:', err);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Registrar nuevo socio
app.post('/api/register/socio', async (req, res) => {
  const { nombres, apellidos, cedula, telefono, email, password, direccion, experiencia } = req.body;
  if (!nombres || !apellidos || !cedula || !telefono || !email || !password) {
    return res.status(400).json({ message: 'Faltan campos obligatorios.' });
  }
  try {
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);
    const query = `
      INSERT INTO socios (nombres, apellidos, cedula, telefono, email, password_hash, direccion, experiencia)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, nombres, email;
    `;
    const values = [nombres, apellidos, cedula, telefono, email, password_hash, direccion, experiencia];
    const { rows } = await pool.query(query, values);
    const newUser = rows[0];
    res.status(201).json({ message: 'Socio registrado exitosamente', user: newUser });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'El email ya se encuentra registrado.' });
    }
    console.error('Registro socio error:', err);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Login empresa
app.post('/api/login/empresa', async (req, res) => {
  const { email, password } = req.body;
  try {
    const { rows } = await pool.query('SELECT * FROM empresas WHERE email = $1', [email]);
    if (rows.length === 0) return res.status(401).json({ message: 'Email o contraseña incorrectos.' });
    const user = rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) return res.status(401).json({ message: 'Email o contraseña incorrectos.' });
    const token = jwt.sign({ userId: user.id, userRole: 'empresa' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    delete user.password_hash;
    res.status(200).json({ message: 'Login exitoso', token, user });
  } catch (err) {
    console.error('Login empresa error:', err);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Login socio
app.post('/api/login/socio', async (req, res) => {
  const { email, password } = req.body;
  try {
    const { rows } = await pool.query('SELECT * FROM socios WHERE email = $1', [email]);
    if (rows.length === 0) return res.status(401).json({ message: 'Email o contraseña incorrectos.' });
    const user = rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) return res.status(401).json({ message: 'Email o contraseña incorrectos.' });
    const token = jwt.sign({ userId: user.id, userRole: 'socio' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    delete user.password_hash;
    res.status(200).json({ message: 'Login exitoso', token, user });
  } catch (err) {
    console.error('Login socio error:', err);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Crear producto (empresa)
app.post('/api/products', authenticateToken, async (req, res) => {
  if (req.user.userRole !== 'empresa') return res.status(403).json({ message: 'Acceso denegado. Solo empresas.' });
  const { nombre, categoria, precio, comision, stock, descripcion, colorCapuchon } = req.body;
  const empresaId = req.user.userId;
  try {
    const query = `
      INSERT INTO productos (empresa_id, nombre, categoria, precio, comision, stock, descripcion, color_capuchon)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `;
    const values = [empresaId, nombre, categoria, precio, comision, stock, descripcion, colorCapuchon];
    const { rows } = await pool.query(query, values);
    res.status(201).json({ message: 'Producto creado exitosamente', product: rows[0] });
  } catch (err) {
    console.error('Crear producto error:', err);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Obtener productos
app.get('/api/products', authenticateToken, async (req, res) => {
  try {
    let query;
    const values = [];
    if (req.user.userRole === 'empresa') {
      query = 'SELECT * FROM productos WHERE empresa_id = $1 ORDER BY fecha_creacion DESC';
      values.push(req.user.userId);
    } else {
      query = 'SELECT p.*, e.nombre as empresa_nombre FROM productos p JOIN empresas e ON p.empresa_id = e.id ORDER BY e.nombre, p.nombre';
    }
    const { rows } = await pool.query(query, values);
    res.status(200).json(rows);
  } catch (err) {
    console.error('Obtener productos error:', err);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Eliminar producto (empresa)
app.delete('/api/products/:id', authenticateToken, async (req, res) => {
  if (req.user.userRole !== 'empresa') return res.status(403).json({ message: 'Acceso denegado. Solo empresas.' });
  const productId = req.params.id;
  const empresaId = req.user.userId;
  try {
    const result = await pool.query('DELETE FROM productos WHERE id = $1 AND empresa_id = $2', [productId, empresaId]);
    if (result.rowCount === 0) return res.status(404).json({ message: 'Producto no encontrado o sin permiso.' });
    res.status(200).json({ message: 'Producto eliminado exitosamente' });
  } catch (err) {
    console.error('Eliminar producto error:', err);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Actualizar producto (empresa)
app.put('/api/products/:id', authenticateToken, async (req, res) => {
  if (req.user.userRole !== 'empresa') return res.status(403).json({ message: 'Acceso denegado. Solo empresas.' });
  const productId = req.params.id;
  const empresaId = req.user.userId;
  const { nombre, categoria, precio, comision, stock, descripcion, colorCapuchon } = req.body;
  try {
    const query = `
      UPDATE productos
      SET nombre = $1, categoria = $2, precio = $3, comision = $4, stock = $5, descripcion = $6, color_capuchon = $7
      WHERE id = $8 AND empresa_id = $9
      RETURNING *;
    `;
    const values = [nombre, categoria, precio, comision, stock, descripcion, colorCapuchon, productId, empresaId];
    const { rows } = await pool.query(query, values);
    if (rows.length === 0) return res.status(404).json({ message: 'Producto no encontrado o sin permiso.' });
    res.status(200).json({ message: 'Producto actualizado exitosamente', product: rows[0] });
  } catch (err) {
    console.error('Actualizar producto error:', err);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Listar empresas (socio)
app.get('/api/empresas', authenticateToken, async (req, res) => {
  if (req.user.userRole !== 'socio') return res.status(403).json({ message: 'Acceso denegado. Solo socios.' });
  try {
    const { rows } = await pool.query('SELECT id, nombre, ruc, direccion, telefono, email, descripcion, logo_url FROM empresas ORDER BY nombre');
    res.status(200).json(rows);
  } catch (err) {
    console.error('Obtener empresas error:', err);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Listar socios de una empresa
app.get('/api/socios', authenticateToken, async (req, res) => {
  if (req.user.userRole !== 'empresa') return res.status(403).json({ message: 'Acceso denegado. Solo empresas.' });
  const empresaId = req.user.userId;
  try {
    const query = `
      SELECT
        s.id,
        s.nombres,
        s.apellidos,
        s.email,
        s.telefono,
        COALESCE(SUM(v.cantidad), 0) as productos_vendidos,
        COALESCE(SUM(v.comision_total), 0) as comision_total
      FROM socios s
      JOIN ventas v ON s.id = v.socio_id
      JOIN productos p ON v.producto_id = p.id
      WHERE p.empresa_id = $1
      GROUP BY s.id, s.nombres, s.apellidos, s.email, s.telefono
      ORDER BY comision_total DESC;
    `;
    const { rows } = await pool.query(query, [empresaId]);
    res.status(200).json(rows);
  } catch (err) {
    console.error('Obtener socios error:', err);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Registrar venta (socio)
app.post('/api/ventas', authenticateToken, async (req, res) => {
  if (req.user.userRole !== 'socio') return res.status(403).json({ message: 'Acceso denegado. Solo socios.' });
  const { productoId, cantidad, total, comision } = req.body;
  const socioId = req.user.userId;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const productResult = await client.query('SELECT * FROM productos WHERE id = $1 FOR UPDATE', [productoId]);
    const producto = productResult.rows[0];
    if (!producto) throw new Error('Producto no encontrado.');
    if ((producto.stock || 0) < cantidad) throw new Error('Stock insuficiente.');
    await client.query('UPDATE productos SET stock = $1 WHERE id = $2', [producto.stock - cantidad, productoId]);
    const ventaResult = await client.query(
      `INSERT INTO ventas (socio_id, producto_id, cantidad, precio_total, comision_total)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *;`,
      [socioId, productoId, cantidad, total, comision]
    );
    await client.query('COMMIT');
    res.status(201).json({ message: 'Venta registrada exitosamente', venta: ventaResult.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Registrar venta error:', err);
    res.status(500).json({ message: err.message || 'Error interno del servidor.' });
  } finally {
    client.release();
  }
});

// Obtener ventas del socio
app.get('/api/ventas', authenticateToken, async (req, res) => {
  if (req.user.userRole !== 'socio') return res.status(403).json({ message: 'Acceso denegado. Solo socios.' });
  const socioId = req.user.userId;
  try {
    const query = `
      SELECT v.id, v.fecha_venta, p.nombre as producto_nombre, e.nombre as empresa_nombre,
             v.cantidad, v.precio_total, v.comision_total
      FROM ventas v
      JOIN productos p ON v.producto_id = p.id
      JOIN empresas e ON p.empresa_id = e.id
      WHERE v.socio_id = $1
      ORDER BY v.fecha_venta DESC;`;
    const { rows } = await pool.query(query, [socioId]);
    res.status(200).json(rows);
  } catch (err) {
    console.error('Obtener ventas error:', err);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Estadísticas del socio
app.get('/api/socios/stats', authenticateToken, async (req, res) => {
  if (req.user.userRole !== 'socio') return res.status(403).json({ message: 'Acceso denegado. Solo socios.' });
  const socioId = req.user.userId;
  try {
    const [{ rows: rowsMes }, { rows: rowsTot }, { rows: rowsCount }, { rows: rowsEmp } ] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(comision_total),0) as comisiones_mes FROM ventas WHERE socio_id=$1 AND date_trunc('month', fecha_venta) = date_trunc('month', CURRENT_DATE)`, [socioId]),
      pool.query(`SELECT COALESCE(SUM(comision_total),0) as comisiones_total FROM ventas WHERE socio_id=$1`, [socioId]),
      pool.query(`SELECT COUNT(*)::int as ventas_realizadas FROM ventas WHERE socio_id=$1`, [socioId]),
      pool.query(`SELECT COUNT(DISTINCT e.id)::int as empresas_colaborando FROM ventas v JOIN productos p ON v.producto_id=p.id JOIN empresas e ON p.empresa_id=e.id WHERE v.socio_id=$1`, [socioId])
    ]);
    res.status(200).json({
      comisiones_mes: rowsMes[0].comisiones_mes,
      comisiones_total: rowsTot[0].comisiones_total,
      ventas_realizadas: rowsCount[0].ventas_realizadas,
      empresas_colaborando: rowsEmp[0].empresas_colaborando
    });
  } catch (err) {
    console.error('Stats socio error:', err);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Actualizar perfil empresa
app.put('/api/empresas/profile', authenticateToken, async (req, res) => {
  if (req.user.userRole !== 'empresa') return res.status(403).json({ message: 'Acceso denegado. Solo empresas.' });
  const empresaId = req.user.userId;
  const { nombre, ruc, direccion, telefono, email, descripcion } = req.body;
  try {
    const query = `
      UPDATE empresas
      SET nombre = $1, ruc = $2, direccion = $3, telefono = $4, email = $5, descripcion = $6
      WHERE id = $7
      RETURNING id, nombre, ruc, direccion, telefono, email, descripcion, logo_url;`;
    const { rows } = await pool.query(query, [nombre, ruc, direccion, telefono, email, descripcion, empresaId]);
    if (rows.length === 0) return res.status(404).json({ message: 'Empresa no encontrada.' });
    res.status(200).json({ message: 'Perfil actualizado exitosamente', user: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'El email ya está en uso por otra cuenta.' });
    console.error('Actualizar perfil empresa error:', err);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Actualizar perfil socio
app.put('/api/socios/profile', authenticateToken, async (req, res) => {
  if (req.user.userRole !== 'socio') return res.status(403).json({ message: 'Acceso denegado. Solo socios.' });
  const socioId = req.user.userId;
  const { nombres, apellidos, cedula, telefono, email, direccion, experiencia } = req.body;
  try {
    const query = `
      UPDATE socios
      SET nombres = $1, apellidos = $2, cedula = $3, telefono = $4, email = $5, direccion = $6, experiencia = $7
      WHERE id = $8
      RETURNING id, nombres, apellidos, cedula, telefono, email, direccion, experiencia;`;
    const { rows } = await pool.query(query, [nombres, apellidos, cedula, telefono, email, direccion, experiencia, socioId]);
    if (rows.length === 0) return res.status(404).json({ message: 'Socio no encontrado.' });
    res.status(200).json({ message: 'Perfil actualizado exitosamente', user: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'El email o la cédula ya está en uso por otra cuenta.' });
    console.error('Actualizar perfil socio error:', err);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Crear cliente (socio)
app.post('/api/clientes', authenticateToken, async (req, res) => {
  if (req.user.userRole !== 'socio') return res.status(403).json({ message: 'Acceso denegado. Solo socios.' });
  const socioId = req.user.userId;
  const { tipo, razon_social, representante, ruc, nombres, apellidos, cedula, email, telefono, direccion, ciudad } = req.body;
  try {
    const query = `
      INSERT INTO clientes (socio_id, tipo, razon_social, representante, ruc, nombres, apellidos, cedula, email, telefono, direccion, ciudad)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *;`;
    const values = [socioId, tipo, razon_social, representante, ruc, nombres, apellidos, cedula, email, telefono, direccion, ciudad];
    const { rows } = await pool.query(query, values);
    res.status(201).json({ message: 'Cliente creado exitosamente', cliente: rows[0] });
  } catch (err) {
    console.error('Crear cliente error:', err);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Listar clientes del socio
app.get('/api/clientes', authenticateToken, async (req, res) => {
  if (req.user.userRole !== 'socio') return res.status(403).json({ message: 'Acceso denegado. Solo socios.' });
  const socioId = req.user.userId;
  try {
    const { rows } = await pool.query('SELECT * FROM clientes WHERE socio_id = $1 ORDER BY fecha_registro DESC', [socioId]);
    res.status(200).json(rows);
  } catch (err) {
    console.error('Obtener clientes error:', err);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Crear proforma (socio)
app.post('/api/proformas', authenticateToken, async (req, res) => {
  if (req.user.userRole !== 'socio') return res.status(403).json({ message: 'Acceso denegado. Solo socios.' });
  const socioId = req.user.userId;
  const { clienteId, empresaId, productoId, cantidad, precioEstimado, observaciones, urgencia } = req.body;
  try {
    const query = `
      INSERT INTO proformas (socio_id, cliente_id, empresa_id, producto_id, cantidad, precio_estimado, observaciones, urgencia, estado)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'enviada')
      RETURNING *;`;
    const values = [socioId, clienteId, empresaId, productoId, cantidad, precioEstimado, observaciones, urgencia];
    const { rows } = await pool.query(query, values);
    res.status(201).json({ message: 'Proforma creada exitosamente', proforma: rows[0] });
  } catch (err) {
    console.error('Crear proforma error:', err);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Proformas de la empresa
app.get('/api/proformas/empresa', authenticateToken, async (req, res) => {
  if (req.user.userRole !== 'empresa') return res.status(403).json({ message: 'Acceso denegado. Solo empresas.' });
  const empresaId = req.user.userId;
  try {
    const query = `
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
      ORDER BY pf.fecha_solicitud DESC;`;
    const { rows } = await pool.query(query, [empresaId]);
    res.status(200).json(rows);
  } catch (err) {
    console.error('Obtener proformas empresa error:', err);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Proformas del socio
app.get('/api/proformas/socio', authenticateToken, async (req, res) => {
  if (req.user.userRole !== 'socio') return res.status(403).json({ message: 'Acceso denegado. Solo socios.' });
  const socioId = req.user.userId;
  try {
    const query = `
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
      ORDER BY pf.fecha_solicitud DESC;`;
    const { rows } = await pool.query(query, [socioId]);
    res.status(200).json(rows);
  } catch (err) {
    console.error('Obtener proformas socio error:', err);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Responder proforma (empresa)
app.put('/api/proformas/:id/respuesta', authenticateToken, async (req, res) => {
  if (req.user.userRole !== 'empresa') return res.status(403).json({ message: 'Acceso denegado. Solo empresas.' });
  const proformaId = req.params.id;
  const empresaId = req.user.userId;
  const { respuesta } = req.body; // JSON
  try {
    const query = `
      UPDATE proformas
      SET respuesta = $1, estado = 'aprobada', fecha_respuesta = CURRENT_TIMESTAMP
      WHERE id = $2 AND empresa_id = $3
      RETURNING *;`;
    const { rows } = await pool.query(query, [respuesta, proformaId, empresaId]);
    if (rows.length === 0) return res.status(404).json({ message: 'Proforma no encontrada o sin permiso.' });
    res.status(200).json({ message: 'Respuesta a la proforma enviada exitosamente', proforma: rows[0] });
  } catch (err) {
    console.error('Responder proforma error:', err);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Iniciar servidor
app.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`);
});

