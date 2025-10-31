# Copilot Instructions for socio_negocio

## Arquitectura general
- El proyecto está dividido en frontend (archivos HTML, CSS, JS en la raíz) y backend (carpeta `server/`).
- El backend es una API REST construida con Node.js y Express, conectada a una base de datos PostgreSQL.
- El frontend interactúa con la API mediante llamadas HTTP (fetch/ajax).

## Backend (`server/`)
- El archivo principal es `server/server.js`. Aquí se definen rutas, lógica de negocio y migraciones ligeras de la base de datos.
- Las rutas están protegidas por JWT. Usa el middleware `authenticateToken` para endpoints que requieren autenticación.
- Roles principales: `empresa` y `socio`. El acceso a rutas y acciones depende del rol del usuario autenticado.
- Las rutas principales incluyen:
  - Registro y login de empresas y socios (`/api/register/*`, `/api/login/*`)
  - CRUD de productos, clientes, ventas y proformas
  - Estadísticas y reportes para socios y empresas
- Los assets públicos del backend se sirven desde `server/public/` bajo la ruta `/public`.
- Las migraciones de tablas se ejecutan automáticamente al iniciar el servidor.
- Variables sensibles (DB, JWT) se configuran vía `.env`.

## Frontend
- Los archivos HTML principales son: `index.html`, `empresa.html`, `socio.html`, `dashboard-empresa.html`, `dashboard-socio.html`.
- El archivo `script.js` contiene la lógica de interacción con la API y manipulación del DOM.
- Los estilos globales están en `styles.css`.

## Flujos de desarrollo
- Para iniciar el backend: `cd server && npm start` (requiere Node.js 20+).
- No hay tests automatizados definidos (el script `test` es un placeholder).
- Para desarrollo local, asegúrate de tener PostgreSQL corriendo y las variables de entorno configuradas.
- El frontend puede abrirse directamente en el navegador; asegúrate que el backend esté corriendo para funcionalidad completa.

## Convenciones y patrones
- Los endpoints siguen el patrón REST y devuelven respuestas JSON.
- Los errores de base de datos (duplicados, permisos) se manejan con códigos HTTP apropiados (401, 403, 409, 500).
- Los assets subidos (ej. logos en base64) se guardan en disco y se exponen vía URL pública.
- El acceso a datos está segmentado por rol: empresas solo acceden a sus propios datos, socios acceden a datos globales o propios según el endpoint.

## Dependencias clave
- express, cors, pg, bcrypt, jsonwebtoken

## Ejemplo de flujo de registro/login
1. POST `/api/register/empresa` o `/api/register/socio` para crear usuario.
2. POST `/api/login/empresa` o `/api/login/socio` para obtener JWT.
3. Usar JWT en el header `Authorization: Bearer <token>` para acceder a rutas protegidas.

## Archivos relevantes
- `server/server.js`: lógica principal del backend y rutas
- `server/package.json`: dependencias y scripts
- `.env`: configuración sensible (no versionado)
- `script.js`: lógica de frontend
- HTMLs: vistas principales

---
¿Falta algún flujo, convención o integración importante? Indica detalles para mejorar estas instrucciones.