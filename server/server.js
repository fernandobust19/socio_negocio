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
  } catch (e) {
    console.warn('Could not ensure empresas.logo_url column:', e.message);
  }
})();

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


// Iniciar el servidor
app.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`);
});
