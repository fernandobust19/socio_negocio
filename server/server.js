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
// Aumentar el límite del body para permitir logos en base64 (hasta 10MB)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(express.static(path.join(__dirname, '..')));
// Serve backend public assets under /public
app.use('/public', express.static(path.join(__dirname, 'public')));

// Ensure required DB columns exist (lightweight migration)
(async () => {
  try {
    await pool.query('ALTER TABLE empresas ADD COLUMN IF NOT EXISTS logo_url TEXT');
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
        tipo VARCHAR(50) NOT NULL, -- 'persona' o 'empresa'
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
    console.warn('Could not ensure database schema:', e.message);
  }
})();

// Middleware to verify JWT
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

// Save Data URL (base64) to disk and return public URL
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

// --- Configuración de la Base de Datos (PostgreSQL) ---
// Render inyectará la URL de la base de datos en esta variable de entorno.
const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString: connectionString,
  // Render requiere SSL para conexiones externas, pero puede que no lo necesites para desarrollo local.
  // Lo mantenemos así para que sea compatible con el despliegue.
  ssl: {
    rejectUnauthorized: false
  }
});

// Ruta de prueba para la conexión a la BD
app.get('/test-db', async (req, res) => {
  try {
    const client = await pool.connect();
    res.send('Conexión a la base de datos exitosa!');
    client.release();
  } catch (err) {
    res.status(500).send('Error al conectar a la base de datos: ' + err.message);
  }
});


// --- Rutas de la API ---



// Ruta para registrar una nueva empresa
app.post('/api/register/empresa', async (req, res) => {
  const { nombre, ruc, direccion, telefono, email, password, descripcion, logo } = req.body;

  try {
    // Hash the password
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);

    // Save logo if provided
    let logo_url = null;
    if (logo && typeof logo === 'string' && logo.startsWith('data:')) {
      logo_url = saveDataUrlToFile(logo, 'uploads/logos');
    }

    // Save to database
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
    console.error('Error durante el registro de empresa:', err);
    // Check for unique violation error (duplicate email)
    if (err.code === '23505') { // 23505 is the PostgreSQL error code for unique_violation
      return res.status(409).json({ message: 'El email ya se encuentra registrado.' });
    }
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Ruta para registrar un nuevo socio
app.post('/api/register/socio', async (req, res) => {
  const { nombres, apellidos, cedula, telefono, email, password, direccion, experiencia } = req.body;

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
    console.error('Error durante el registro de socio:', err);
    if (err.code === '23505') {
      return res.status(409).json({ message: 'El email ya se encuentra registrado.' });
    }
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Ruta para login de empresa
app.post('/api/login/empresa', async (req, res) => {
  const { email, password } = req.body;

  try {
    // Find user in database
    const query = 'SELECT * FROM empresas WHERE email = $1';
    const { rows } = await pool.query(query, [email]);

    if (rows.length === 0) {
      return res.status(401).json({ message: 'Email o contraseña incorrectos.' });
    }

    const user = rows[0];

    // Compare passwords
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ message: 'Email o contraseña incorrectos.' });
    }

    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, userRole: 'empresa' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' } // Token expires in 1 hour
    );

    // Don't send password hash to frontend
    delete user.password_hash;

    res.status(200).json({
      message: 'Login exitoso',
      token,
      user
    });

  } catch (err) {
    console.error('Error durante el login de empresa:', err);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Ruta para login de socio
app.post('/api/login/socio', async (req, res) => {
  const { email, password } = req.body;

  try {
    // Find user in database
    const query = 'SELECT * FROM socios WHERE email = $1';
    const { rows } = await pool.query(query, [email]);

    if (rows.length === 0) {
      return res.status(401).json({ message: 'Email o contraseña incorrectos.' });
    }

    const user = rows[0];

    // Compare passwords
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ message: 'Email o contraseña incorrectos.' });
    }

    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, userRole: 'socio' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Don't send password hash to frontend
    delete user.password_hash;

    res.status(200).json({
      message: 'Login exitoso',
      token,
      user
    });

  } catch (err) {
    console.error('Error durante el login de socio:', err);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Ruta para crear un nuevo producto
app.post('/api/products', authenticateToken, async (req, res) => {
  // solo empresas pueden crear productos
  if (req.user.userRole !== 'empresa') {
    return res.status(403).json({ message: 'Acceso denegado. Solo las empresas pueden crear productos.' });
  }

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
    const newProduct = rows[0];

    res.status(201).json({ message: 'Producto creado exitosamente', product: newProduct });

  } catch (err) {
    console.error('Error durante la creación del producto:', err);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Ruta para obtener productos
app.get('/api/products', authenticateToken, async (req, res) => {
  try {
    let query;
    const values = [];

    if (req.user.userRole === 'empresa') {
      // Empresas obtienen solo sus productos
      query = 'SELECT * FROM productos WHERE empresa_id = $1 ORDER BY fecha_creacion DESC';
      values.push(req.user.userId);
    } else {
      // Socios obtienen todos los productos
      query = 'SELECT p.*, e.nombre as empresa_nombre FROM productos p JOIN empresas e ON p.empresa_id = e.id ORDER BY e.nombre, p.nombre';
    }

    const { rows } = await pool.query(query, values);
    res.status(200).json(rows);

  } catch (err) {
    console.error('Error al obtener productos:', err);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Ruta para eliminar un producto
app.delete('/api/products/:id', authenticateToken, async (req, res) => {
  // solo empresas pueden eliminar productos
  if (req.user.userRole !== 'empresa') {
    return res.status(403).json({ message: 'Acceso denegado. Solo las empresas pueden eliminar productos.' });
  }

  const productId = req.params.id;
  const empresaId = req.user.userId;

  try {
    const query = 'DELETE FROM productos WHERE id = $1 AND empresa_id = $2';
    const values = [productId, empresaId];

    const result = await pool.query(query, values);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Producto no encontrado o no tienes permiso para eliminarlo.' });
    }

    res.status(200).json({ message: 'Producto eliminado exitosamente' });

  } catch (err) {
    console.error('Error durante la eliminación del producto:', err);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Ruta para actualizar un producto
app.put('/api/products/:id', authenticateToken, async (req, res) => {
  // solo empresas pueden actualizar productos
  if (req.user.userRole !== 'empresa') {
    return res.status(403).json({ message: 'Acceso denegado. Solo las empresas pueden actualizar productos.' });
  }

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

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Producto no encontrado o no tienes permiso para actualizarlo.' });
    }

    const updatedProduct = rows[0];
    res.status(200).json({ message: 'Producto actualizado exitosamente', product: updatedProduct });

  } catch (err) {
    console.error('Error durante la actualización del producto:', err);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Ruta para obtener todas las empresas (para socios)
app.get('/api/empresas', authenticateToken, async (req, res) => {
  if (req.user.userRole !== 'socio') {
    return res.status(403).json({ message: 'Acceso denegado. Solo los socios pueden ver las empresas.' });
  }

  try {
    const query = 'SELECT id, nombre, ruc, direccion, telefono, email, descripcion, logo_url FROM empresas ORDER BY nombre';
    const { rows } = await pool.query(query);
    res.status(200).json(rows);
  } catch (err) {
    console.error('Error al obtener empresas:', err);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Ruta para obtener los socios de una empresa
app.get('/api/socios', authenticateToken, async (req, res) => {
  if (req.user.userRole !== 'empresa') {
    return res.status(403).json({ message: 'Acceso denegado. Solo las empresas pueden ver sus socios.' });
  }

  const empresaId = req.user.userId;

  try {
    const query = `
      SELECT
        s.id,
        s.nombres,
        s.apellidos,
        s.email,
        s.telefono,
        SUM(v.cantidad) as productos_vendidos,
        SUM(v.comision_total) as comision_total
      FROM socios s
      JOIN ventas v ON s.id = v.socio_id
      JOIN productos p ON v.producto_id = p.id
      WHERE p.empresa_id = $1
      GROUP BY s.id, s.nombres, s.apellidos, s.email, s.telefono
      ORDER BY comision_total DESC;
    `;
    const values = [empresaId];

    const { rows } = await pool.query(query, values);
    res.status(200).json(rows);

  } catch (err) {
    console.error('Error al obtener socios:', err);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Ruta para registrar una venta
app.post('/api/ventas', authenticateToken, async (req, res) => {
  if (req.user.userRole !== 'socio') {
    return res.status(403).json({ message: 'Acceso denegado. Solo los socios pueden registrar ventas.' });
  }

  const { productoId, cantidad, total, comision } = req.body;
  const socioId = req.user.userId;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Verificar stock del producto
    const productQuery = 'SELECT * FROM productos WHERE id = $1 FOR UPDATE';
    const productResult = await client.query(productQuery, [productoId]);
    const producto = productResult.rows[0];

    if (!producto) {
      throw new Error('Producto no encontrado.');
    }

    if (producto.stock < cantidad) {
      throw new Error('Stock insuficiente.');
    }

    // 2. Actualizar stock
    const newStock = producto.stock - cantidad;
    const updateStockQuery = 'UPDATE productos SET stock = $1 WHERE id = $2';
    await client.query(updateStockQuery, [newStock, productoId]);

    // 3. Insertar la venta
    const insertVentaQuery = `
      INSERT INTO ventas (socio_id, producto_id, cantidad, precio_total, comision_total)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;
    const ventaValues = [socioId, productoId, cantidad, total, comision];
    const ventaResult = await client.query(insertVentaQuery, ventaValues);
    const nuevaVenta = ventaResult.rows[0];

    await client.query('COMMIT');

    res.status(201).json({ message: 'Venta registrada exitosamente', venta: nuevaVenta });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error durante el registro de la venta:', err);
    res.status(500).json({ message: err.message || 'Error interno del servidor.' });
  } finally {
    client.release();
  }
});

// Ruta para obtener las ventas de un socio
app.get('/api/ventas', authenticateToken, async (req, res) => {
  if (req.user.userRole !== 'socio') {
    return res.status(403).json({ message: 'Acceso denegado. Solo los socios pueden ver sus ventas.' });
  }

  const socioId = req.user.userId;

  try {
    const query = `
      SELECT
        v.id,
        v.fecha_venta,
        p.nombre as producto_nombre,
        e.nombre as empresa_nombre,
        v.cantidad,
        v.precio_total,
        v.comision_total
      FROM ventas v
      JOIN productos p ON v.producto_id = p.id
      JOIN empresas e ON p.empresa_id = e.id
      WHERE v.socio_id = $1
      ORDER BY v.fecha_venta DESC;
    `;
    const values = [socioId];

    const { rows } = await pool.query(query, values);
    res.status(200).json(rows);

  } catch (err) {
    console.error('Error al obtener las ventas del socio:', err);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Ruta para obtener las estadísticas de un socio
app.get('/api/socios/stats', authenticateToken, async (req, res) => {
  if (req.user.userRole !== 'socio') {
    return res.status(403).json({ message: 'Acceso denegado. Solo los socios pueden ver sus estadísticas.' });
  }

  const socioId = req.user.userId;

  try {
    const query = `
      SELECT
        COALESCE(SUM(v.comision_total), 0) as comisiones_total,
        COALESCE(SUM(CASE WHEN DATE_TRUNC('month', v.fecha_venta) = DATE_TRUNC('month', CURRENT_DATE) THEN v.comision_total ELSE 0 END), 0) as comisiones_mes,
        COUNT(v.id) as ventas_realizadas,
        COUNT(DISTINCT p.empresa_id) as empresas_colaborando
      FROM ventas v
      JOIN productos p ON v.producto_id = p.id
      WHERE v.socio_id = $1;
    `;
    const values = [socioId];

    const { rows } = await pool.query(query, values);
    res.status(200).json(rows[0]);

  } catch (err) {
    console.error('Error al obtener las estadísticas del socio:', err);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Ruta para actualizar el perfil de una empresa
app.put('/api/empresas/profile', authenticateToken, async (req, res) => {
  if (req.user.userRole !== 'empresa') {
    return res.status(403).json({ message: 'Acceso denegado. Solo las empresas pueden actualizar su perfil.' });
  }

  const empresaId = req.user.userId;
  const { nombre, ruc, direccion, telefono, email, descripcion } = req.body;

  try {
    const query = `
      UPDATE empresas
      SET nombre = $1, ruc = $2, direccion = $3, telefono = $4, email = $5, descripcion = $6
      WHERE id = $7
      RETURNING id, nombre, ruc, direccion, telefono, email, descripcion, logo_url;
    `;
    const values = [nombre, ruc, direccion, telefono, email, descripcion, empresaId];

    const { rows } = await pool.query(query, values);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Empresa no encontrada.' });
    }

    const updatedProfile = rows[0];
    res.status(200).json({ message: 'Perfil actualizado exitosamente', user: updatedProfile });

  } catch (err) {
    console.error('Error durante la actualización del perfil de la empresa:', err);
    if (err.code === '23505') { // unique_violation
      return res.status(409).json({ message: 'El email ya está en uso por otra cuenta.' });
    }
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Ruta para actualizar el perfil de un socio
app.put('/api/socios/profile', authenticateToken, async (req, res) => {
  if (req.user.userRole !== 'socio') {
    return res.status(403).json({ message: 'Acceso denegado. Solo los socios pueden actualizar su perfil.' });
  }

  const socioId = req.user.userId;
  const { nombres, apellidos, cedula, telefono, email, direccion, experiencia } = req.body;

  try {
    const query = `
      UPDATE socios
      SET nombres = $1, apellidos = $2, cedula = $3, telefono = $4, email = $5, direccion = $6, experiencia = $7
      WHERE id = $8
      RETURNING id, nombres, apellidos, cedula, telefono, email, direccion, experiencia;
    `;
    const values = [nombres, apellidos, cedula, telefono, email, direccion, experiencia, socioId];

    const { rows } = await pool.query(query, values);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Socio no encontrado.' });
    }

    const updatedProfile = rows[0];
    res.status(200).json({ message: 'Perfil actualizado exitosamente', user: updatedProfile });

  } catch (err) {
    console.error('Error durante la actualización del perfil del socio:', err);
    if (err.code === '23505') { // unique_violation
      return res.status(409).json({ message: 'El email o la cédula ya está en uso por otra cuenta.' });
    }
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Ruta para crear un nuevo cliente
app.post('/api/clientes', authenticateToken, async (req, res) => {
  if (req.user.userRole !== 'socio') {
    return res.status(403).json({ message: 'Acceso denegado. Solo los socios pueden crear clientes.' });
  }

  const socioId = req.user.userId;
  const { tipo, razon_social, representante, ruc, nombres, apellidos, cedula, email, telefono, direccion, ciudad } = req.body;

  try {
    const query = `
      INSERT INTO clientes (socio_id, tipo, razon_social, representante, ruc, nombres, apellidos, cedula, email, telefono, direccion, ciudad)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *;
    `;
    const values = [socioId, tipo, razon_social, representante, ruc, nombres, apellidos, cedula, email, telefono, direccion, ciudad];

    const { rows } = await pool.query(query, values);
    const nuevoCliente = rows[0];

    res.status(201).json({ message: 'Cliente creado exitosamente', cliente: nuevoCliente });

  } catch (err) {
    console.error('Error durante la creación del cliente:', err);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Ruta para obtener los clientes de un socio
app.get('/api/clientes', authenticateToken, async (req, res) => {
  if (req.user.userRole !== 'socio') {
    return res.status(403).json({ message: 'Acceso denegado. Solo los socios pueden ver sus clientes.' });
  }

  const socioId = req.user.userId;

  try {
    const query = 'SELECT * FROM clientes WHERE socio_id = $1 ORDER BY fecha_registro DESC';
    const values = [socioId];

    const { rows } = await pool.query(query, values);
    res.status(200).json(rows);

  } catch (err) {
    console.error('Error al obtener los clientes del socio:', err);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Ruta para crear una nueva proforma
app.post('/api/proformas', authenticateToken, async (req, res) => {
  if (req.user.userRole !== 'socio') {
    return res.status(403).json({ message: 'Acceso denegado. Solo los socios pueden crear proformas.' });
  }

  const socioId = req.user.userId;
  const { clienteId, empresaId, productoId, cantidad, precioEstimado, observaciones, urgencia } = req.body;

  try {
    const query = `
      INSERT INTO proformas (socio_id, cliente_id, empresa_id, producto_id, cantidad, precio_estimado, observaciones, urgencia, estado)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'enviada')
      RETURNING *;
    `;
    const values = [socioId, clienteId, empresaId, productoId, cantidad, precioEstimado, observaciones, urgencia];

    const { rows } = await pool.query(query, values);
    const nuevaProforma = rows[0];

    res.status(201).json({ message: 'Proforma creada exitosamente', proforma: nuevaProforma });

  } catch (err) {
    console.error('Error durante la creación de la proforma:', err);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Ruta para obtener las proformas de una empresa
app.get('/api/proformas/empresa', authenticateToken, async (req, res) => {
  if (req.user.userRole !== 'empresa') {
    return res.status(403).json({ message: 'Acceso denegado. Solo las empresas pueden ver sus proformas.' });
  }

  const empresaId = req.user.userId;

  try {
    const query = `
      SELECT
        pf.id,
        pf.fecha_solicitud,
        s.nombres as socio_nombres,
        s.apellidos as socio_apellidos,
        c.razon_social as cliente_razon_social,
        c.nombres as cliente_nombres,
        c.apellidos as cliente_apellidos,
        p.nombre as producto_nombre,
        pf.cantidad,
        pf.precio_estimado,
        pf.estado
      FROM proformas pf
      JOIN socios s ON pf.socio_id = s.id
      JOIN clientes c ON pf.cliente_id = c.id
      JOIN productos p ON pf.producto_id = p.id
      WHERE pf.empresa_id = $1
      ORDER BY pf.fecha_solicitud DESC;
    `;
    const values = [empresaId];

    const { rows } = await pool.query(query, values);
    res.status(200).json(rows);

  } catch (err) {
    console.error('Error al obtener las proformas de la empresa:', err);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Ruta para obtener las proformas de un socio
app.get('/api/proformas/socio', authenticateToken, async (req, res) => {
  if (req.user.userRole !== 'socio') {
    return res.status(403).json({ message: 'Acceso denegado. Solo los socios pueden ver sus proformas.' });
  }

  const socioId = req.user.userId;

  try {
    const query = `
      SELECT
        pf.id,
        pf.fecha_solicitud,
        c.razon_social as cliente_razon_social,
        c.nombres as cliente_nombres,
        c.apellidos as cliente_apellidos,
        e.nombre as empresa_nombre,
        p.nombre as producto_nombre,
        pf.cantidad,
        pf.precio_estimado,
        pf.estado
      FROM proformas pf
      JOIN clientes c ON pf.cliente_id = c.id
      JOIN empresas e ON pf.empresa_id = e.id
      JOIN productos p ON pf.producto_id = p.id
      WHERE pf.socio_id = $1
      ORDER BY pf.fecha_solicitud DESC;
    `;
    const values = [socioId];

    const { rows } = await pool.query(query, values);
    res.status(200).json(rows);

  } catch (err) {
    console.error('Error al obtener las proformas del socio:', err);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});

// Ruta para responder a una proforma
app.put('/api/proformas/:id/respuesta', authenticateToken, async (req, res) => {
  if (req.user.userRole !== 'empresa') {
    return res.status(403).json({ message: 'Acceso denegado. Solo las empresas pueden responder a proformas.' });
  }

  const proformaId = req.params.id;
  const empresaId = req.user.userId;
  const { respuesta } = req.body;

  try {
    const query = `
      UPDATE proformas
      SET respuesta = $1, estado = 'aprobada', fecha_respuesta = CURRENT_TIMESTAMP
      WHERE id = $2 AND empresa_id = $3
      RETURNING *;
    `;
    const values = [respuesta, proformaId, empresaId];

    const { rows } = await pool.query(query, values);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Proforma no encontrada o no tienes permiso para responderla.' });
    }

    const proformaActualizada = rows[0];
    res.status(200).json({ message: 'Respuesta a la proforma enviada exitosamente', proforma: proformaActualizada });

  } catch (err) {
    console.error('Error al responder a la proforma:', err);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
});


// Iniciar el servidor
app.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`);
});
