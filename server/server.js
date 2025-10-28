const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

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

app.get('/', (req, res) => {
  res.send('Backend de Socio Negocio funcionando!');
});

// Ruta para registrar una nueva empresa
app.post('/api/register/empresa', async (req, res) => {
  const { nombre, ruc, direccion, telefono, email, password, descripcion } = req.body;
  console.log('Datos de la nueva empresa recibidos:', req.body);

  // Aquí irá la lógica para guardar en la base de datos

  res.status(201).json({ message: 'Empresa registrada exitosamente (simulación)' });
});

// Ruta para registrar un nuevo socio
app.post('/api/register/socio', async (req, res) => {
  const { nombres, apellidos, cedula, telefono, email, password, direccion, experiencia } = req.body;
  console.log('Datos del nuevo socio recibidos:', req.body);

  // Aquí irá la lógica para guardar en la base de datos

  res.status(201).json({ message: 'Socio registrado exitosamente (simulación)' });
});


// Iniciar el servidor
app.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`);
});