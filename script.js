// Global variables
// En desarrollo, el servidor se ejecuta en localhost:3000. 
// En producción (Render), usaremos una ruta relativa y una regla de reescritura.
const apiUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3000'
  : '';
let currentUser = null;
let userType = null; // 'empresa' or 'socio'



// Helpers
async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('token');
  const headers = Object.assign(
    { 'Content-Type': 'application/json' },
    options.headers || {}
  );
  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const resp = await fetch(`${apiUrl}${path}`, { ...options, headers });
  if (resp.status === 401) {
    alert('Tu sesión ha expirado. Por favor, inicia sesión nuevamente.');
    logout();
    return resp; // caller may handle if needed
  }
  return resp;
}

// Authentication functions
async function registerEmpresa(empresaData) {
  try {
    const response = await fetch(`${apiUrl}/api/register/empresa`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(empresaData),
    });

    if (!response.ok) {
      if (response.status === 413 && empresaData && empresaData.logo) {
        // Reintentar automáticamente sin logo si el servidor rechaza por tamaño
        const retryData = { ...empresaData };
        delete retryData.logo;
        const retryResp = await fetch(`${apiUrl}/api/register/empresa`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(retryData),
        });
        if (retryResp.ok) {
          const okRes = await retryResp.json();
          alert('Empresa registrada exitosamente (sin logo por tamaño).');
          return true;
        }
      }
      // Try to get error message from server response
      const errorData = await response.json().catch(() => ({}));
      alert(`Error al registrar la empresa: ${errorData.message || response.statusText}`);
      return false;
    }

    const result = await response.json();
    console.log(result.message); // "Empresa registrada exitosamente (simulación)"

    // NOTE: The original function performed an auto-login.
    // This is not secure. After registration, the user should be
    // redirected to the login page to log in with their new credentials.
    // For now, we will just show a success message.
    alert('¡Empresa registrada exitosamente! Por favor, inicia sesión.');

    // We won't auto-login here. The login function will need to be updated next.
    // The old auto-login logic is removed.

    return true;
  } catch (error) {
    console.error('Error en registerEmpresa:', error);
    alert('Ocurrió un error de red. Por favor, intenta de nuevo.');
    return false;
  }
}

async function registerSocio(socioData) {
  try {
    const response = await fetch(`${apiUrl}/api/register/socio`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(socioData),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      alert(`Error al registrar el socio: ${errorData.message || response.statusText}`);
      return false;
    }

    const result = await response.json();
    console.log(result.message); // "Socio registrado exitosamente (simulación)"

    alert('¡Socio registrado exitosamente! Por favor, inicia sesión.');
    
    return true;
  } catch (error) {
    console.error('Error en registerSocio:', error);
    alert('Ocurrió un error de red. Por favor, intenta de nuevo.');
    return false;
  }
}

async function loginEmpresa(email, password) {
  try {
    const response = await fetch(`${apiUrl}/api/login/empresa`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      if (response.status >= 500) alert(err.message || 'Error del servidor. Intenta más tarde.');
      return false; // El llamador mostrará alerta genérica para credenciales
    }

    const { token, user } = await response.json();

    // Store user info and token in localStorage to manage session
    currentUser = user;
    userType = 'empresa';
    localStorage.setItem('currentUser', JSON.stringify(user));
    localStorage.setItem('userType', 'empresa');
    localStorage.setItem('token', token); // Store the token

    return true;
  } catch (error) {
    console.error('Error en loginEmpresa:', error);
    return false;
  }
}

async function loginSocio(email, password) {
  try {
    const response = await fetch(`${apiUrl}/api/login/socio`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      if (response.status >= 500) alert(err.message || 'Error del servidor. Intenta más tarde.');
      return false;
    }

    const { token, user } = await response.json();

    currentUser = user;
    userType = 'socio';
    localStorage.setItem('currentUser', JSON.stringify(user));
    localStorage.setItem('userType', 'socio');
    localStorage.setItem('token', token);

    return true;
  } catch (error) {
    console.error('Error en loginSocio:', error);
    return false;
  }
}

function logout() {
  currentUser = null;
  userType = null;
  localStorage.removeItem('currentUser');
  localStorage.removeItem('userType');
  localStorage.removeItem('token');
  window.location.href = 'index.html';
}

// Tab functionality
function showTab(tabName, el) {
  // Hide all tabs
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.remove('active');
  });
  
  // Remove active class from all tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  
  // Show selected tab
  document.getElementById(tabName + '-tab').classList.add('active');
  
  // Add active class to clicked button or matching tab button
  if (el) {
    el.classList.add('active');
  } else {
    const buttons = document.querySelectorAll('.tab-btn');
    buttons.forEach(btn => {
      const onclickAttr = btn.getAttribute('onclick') || '';
      if (onclickAttr.includes("showTab('" + tabName + "')") || onclickAttr.includes("showTab(\"" + tabName + "\")")) {
        btn.classList.add('active');
      }
    });
  }
}

// Section navigation
function showSection(sectionName) {
  // Hide all sections
  document.querySelectorAll('.section').forEach(section => {
    section.classList.remove('active');
  });
  
  // Remove active class from sidebar items
  document.querySelectorAll('.sidebar-item').forEach(item => {
    item.classList.remove('active');
  });
  
  // Show selected section
  document.getElementById(sectionName + '-section').classList.add('active');
  
  // Add active class to clicked sidebar item
  event.target.classList.add('active');
}

// Product management
async function addProduct(productData) {
  try {
    const response = await apiFetch(`/api/products`, {
      method: 'POST',
      body: JSON.stringify(productData),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      alert(`Error al agregar el producto: ${errorData.message || response.statusText}`);
      return false;
    }

    const result = await response.json();
    console.log(result.message);
    alert('Producto agregado exitosamente');
    
    // Reload products view
    loadProducts();

    return true;
  } catch (error) {
    console.error('Error en addProduct:', error);
    alert('Ocurrió un error de red. Por favor, intenta de nuevo.');
    return false;
  }
}

async function loadProducts() {
  if (!currentUser || userType !== 'empresa') return;

  try {
    const response = await apiFetch(`/api/products`, { method: 'GET' });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error(`Error al cargar productos: ${errorData.message || response.statusText}`);
      return;
    }

    const empresaProductos = await response.json();
    const container = document.getElementById('products-container');
    if (!container) return;

    container.innerHTML = '';

    if (empresaProductos.length === 0) {
      container.innerHTML = '<p>No tienes productos registrados. Agrega tu primer producto.</p>';
      return;
    }

    empresaProductos.forEach(producto => {
      const productCard = document.createElement('div');
      productCard.className = 'product-card';
      productCard.innerHTML = `
        <h3>${producto.nombre}</h3>
        <p class="price">$${producto.precio}</p>
        <p class="commission">Comisión: ${producto.comision}%</p>
        <p class="stock">Stock: ${producto.stock} unidades</p>
        <p>${producto.descripcion}</p>
        ${producto.color_capuchon ? `<p><strong>Color capuchón:</strong> ${producto.color_capuchon}</p>` : ''}
        <div style="margin-top: 1rem;">
          <button class="btn-action btn-edit" onclick="editProduct(${producto.id})">Editar</button>
          <button class="btn-action btn-delete" onclick="deleteProduct(${producto.id})">Eliminar</button>
        </div>
      `;
      container.appendChild(productCard);
    });
  } catch (error) {
    console.error('Error en loadProducts:', error);
  }
}

async function editProduct(productId) {
  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`${apiUrl}/api/products`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    if (!response.ok) {
      throw new Error('Could not fetch products');
    }
    const products = await response.json();
    const product = products.find(p => p.id === productId);

    if (product) {
      document.getElementById('edit-product-id').value = product.id;
      document.getElementById('edit-product-nombre').value = product.nombre;
      document.getElementById('edit-product-categoria').value = product.categoria;
      document.getElementById('edit-product-precio').value = product.precio;
      document.getElementById('edit-product-comision').value = product.comision;
      document.getElementById('edit-product-stock').value = product.stock;
      document.getElementById('edit-product-descripcion').value = product.descripcion;
      
      document.getElementById('edit-product-modal').style.display = 'block';
    }
  } catch (error) {
    console.error('Error in editProduct:', error);
    alert('Ocurrió un error al obtener los datos del producto.');
  }
}

function closeEditProductModal() {
  document.getElementById('edit-product-modal').style.display = 'none';
  document.getElementById('edit-product-form').reset();
}

async function deleteProduct(productId) {
  if (confirm('¿Estás seguro de que quieres eliminar este producto?')) {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${apiUrl}/api/products/${productId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        alert(`Error al eliminar el producto: ${errorData.message || response.statusText}`);
        return;
      }

      alert('Producto eliminado exitosamente');
      loadProducts();

    } catch (error) {
      console.error('Error en deleteProduct:', error);
      alert('Ocurrió un error de red. Por favor, intenta de nuevo.');
    }
  }
}

// Modal functions
function showAddProductModal() {
  document.getElementById('add-product-modal').style.display = 'block';
}

function closeAddProductModal() {
  document.getElementById('add-product-modal').style.display = 'none';
  document.getElementById('add-product-form').reset();
}

function showRegistrarVentaModal() {
  document.getElementById('registrar-venta-modal').style.display = 'block';
  loadEmpresasForVenta();
}

function closeRegistrarVentaModal() {
  document.getElementById('registrar-venta-modal').style.display = 'none';
  document.getElementById('registrar-venta-form').reset();
}

// Dashboard loading functions
function loadEmpresaProfile() {
  if (!currentUser || userType !== 'empresa') return;
  
  const nameElement = document.getElementById('empresa-name');
  if (nameElement) {
    nameElement.textContent = currentUser.nombre;
  }
  
  // Load profile form
  const fields = ['nombre', 'ruc', 'direccion', 'telefono', 'email', 'descripcion'];
  fields.forEach(field => {
    const element = document.getElementById(`profile-${field}`);
    if (element) {
      element.value = currentUser[field] || '';
    }
  });
}

function loadSocioProfile() {
  if (!currentUser || userType !== 'socio') return;
  
  const nameElement = document.getElementById('socio-name');
  if (nameElement) {
    nameElement.textContent = `${currentUser.nombres} ${currentUser.apellidos}`;
  }
  
  // Load profile form
  const fields = ['nombres', 'apellidos', 'cedula', 'telefono', 'email', 'direccion', 'experiencia'];
  fields.forEach(field => {
    const element = document.getElementById(`profile-${field}`);
    if (element) {
      element.value = currentUser[field] || '';
    }
  });
}

async function loadSocios() {
  if (!currentUser || userType !== 'empresa') return;

  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`${apiUrl}/api/socios`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error(`Error al cargar socios: ${errorData.message || response.statusText}`);
      return;
    }

    const sociosVendedores = await response.json();
    const tableBody = document.getElementById('socios-table');
    if (!tableBody) return;

    tableBody.innerHTML = '';

    if (sociosVendedores.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="6">No hay socios vendiendo tus productos aún.</td></tr>';
      return;
    }

    sociosVendedores.forEach(socio => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${socio.nombres} ${socio.apellidos}</td>
        <td>${socio.email}</td>
        <td>${socio.telefono}</td>
        <td>${socio.productos_vendidos}</td>
        <td>$${parseFloat(socio.comision_total).toFixed(2)}</td>
        <td><span class="status-active">Activo</span></td>
      `;
      tableBody.appendChild(row);
    });
  } catch (error) {
    console.error('Error en loadSocios:', error);
  }
}

async function loadEmpresas() {
  if (!currentUser || userType !== 'socio') return;

  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`${apiUrl}/api/empresas`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error(`Error al cargar empresas: ${errorData.message || response.statusText}`);
      return;
    }

    const empresas = await response.json();
    const container = document.getElementById('empresas-container');

    if (!container) return;

    container.innerHTML = '';

    empresas.forEach(empresa => {
      const empresaCard = document.createElement('div');
      empresaCard.className = 'empresa-card';
      empresaCard.innerHTML = `
        <h3>${empresa.nombre}</h3>
        <p><strong>Dirección:</strong> ${empresa.direccion}</p>
        <p><strong>Teléfono:</strong> ${empresa.telefono}</p>
        <p>${empresa.descripcion}</p>
        <button class="btn-primary" onclick="verProductosEmpresa(${empresa.id})" style="margin-top: 1rem; width: 100%;">
          Ver Productos
        </button>
      `;
      container.appendChild(empresaCard);
    });
  } catch (error) {
    console.error('Error en loadEmpresas:', error);
  }
}

function verProductosEmpresa(empresaId) {
  showSection('productos');
  filterProductsByEmpresa(empresaId);
}

async function loadProductosDisponibles() {
  if (!currentUser || userType !== 'socio') return;

  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`${apiUrl}/api/products`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error(`Error al cargar productos disponibles: ${errorData.message || response.statusText}`);
      return;
    }

    const productos = await response.json();
    const container = document.getElementById('productos-disponibles');
    const empresaFilter = document.getElementById('empresa-filter');

    if (!container) return;

    // Populate empresa filter
    if (empresaFilter) {
      const empresas = [...new Set(productos.map(p => p.empresa_nombre))];
      empresaFilter.innerHTML = '<option value="">Todas las empresas</option>';
      empresas.forEach(empresa_nombre => {
        const option = document.createElement('option');
        option.value = empresa_nombre;
        option.textContent = empresa_nombre;
        empresaFilter.appendChild(option);
      });
    }

    container.innerHTML = '';

    if (productos.length === 0) {
      container.innerHTML = '<p>No hay productos disponibles para vender.</p>';
      return;
    }

    productos.forEach(producto => {
      const productCard = document.createElement('div');
      productCard.className = 'product-card';
      productCard.innerHTML = `
        <h3>${producto.nombre}</h3>
        <p><strong>Empresa:</strong> ${producto.empresa_nombre || 'N/A'}</p>
        <p class="price">$${producto.precio}</p>
        <p class="commission">Tu comisión: ${producto.comision}% ($${(producto.precio * producto.comision / 100).toFixed(2)})</p>
        <p class="stock">Stock: ${producto.stock} unidades</p>
        <p>${producto.descripcion}</p>
        <button class="btn-primary" onclick="seleccionarProducto(${producto.id})" style="margin-top: 1rem; width: 100%;">
          Vender Este Producto
        </button>
      `;
      container.appendChild(productCard);
    });
  } catch (error) {
    console.error('Error en loadProductosDisponibles:', error);
  }
}

function seleccionarProducto(productoId) {
  showRegistrarVentaModal();
  
  const productos = JSON.parse(localStorage.getItem('productos') || '[]');
  const producto = productos.find(p => p.id === productoId);
  
  if (producto) {
    document.getElementById('venta-empresa').value = producto.empresaId;
    loadProductosVenta();
    document.getElementById('venta-producto').value = productoId;
    updatePrecioVenta();
  }
}

function filterProducts() {
  const empresaFilter = document.getElementById('empresa-filter').value;
  const categoriaFilter = document.getElementById('categoria-filter').value;
  const searchText = (document.getElementById('search-filter')?.value || '').toLowerCase();
  
  const productos = JSON.parse(localStorage.getItem('productos') || '[]');
  const empresas = JSON.parse(localStorage.getItem('empresas') || '[]');
  
  let filteredProductos = productos;
  
  if (empresaFilter) {
    filteredProductos = filteredProductos.filter(p => p.empresaId == empresaFilter);
  }
  
  if (categoriaFilter) {
    filteredProductos = filteredProductos.filter(p => p.categoria === categoriaFilter);
  }
  
  if (searchText) {
    filteredProductos = filteredProductos.filter(p => {
      const nombre = (p.nombre || '').toLowerCase();
      const descripcion = (p.descripcion || '').toLowerCase();
      const color = (p.colorCapuchon || '').toLowerCase();
      return nombre.includes(searchText) || descripcion.includes(searchText) || color.includes(searchText);
    });
  }
  
  const container = document.getElementById('productos-disponibles');
  container.innerHTML = '';
  
  filteredProductos.forEach(producto => {
    const empresa = empresas.find(e => e.id === producto.empresaId);
    
    const productCard = document.createElement('div');
    productCard.className = 'product-card';
    productCard.innerHTML = `
      <h3>${producto.nombre}</h3>
      <p><strong>Empresa:</strong> ${empresa?.nombre || 'N/A'}</p>
      <p class="price">$${producto.precio}</p>
      <p class="commission">Tu comisión: ${producto.comision}% ($${(producto.precio * producto.comision / 100).toFixed(2)})</p>
      <p class="stock">Stock: ${producto.stock} unidades</p>
      <p>${producto.descripcion}</p>
      <button class="btn-primary" onclick="seleccionarProducto(${producto.id})" style="margin-top: 1rem; width: 100%;">
        Vender Este Producto
      </button>
    `;
    container.appendChild(productCard);
  });
}

// Helper to filter by empresa programatically
function filterProductsByEmpresa(empresaId) {
  const sel = document.getElementById('empresa-filter');
  if (sel) {
    sel.value = String(empresaId || '');
    filterProducts();
  }
}

// CSV import for catálogo (empresa dashboard)
function importCatalogoDesdeCSV(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const text = e.target.result;
      const rows = parseCSV(text);
      if (!rows || rows.length === 0) {
        alert('El archivo CSV no contiene datos.');
        return;
      }
      // Normalizamos encabezados
      const normalizeKey = k => (k || '').toString().trim().toLowerCase();
      const mapRowToProduct = (row, index) => {
        const r = {};
        // Copia con claves normalizadas
        Object.keys(row).forEach(k => { r[normalizeKey(k)] = row[k]; });
        const producto = {
          id: 0, // se recalcula
          empresaId: currentUser?.id || 1,
          nombre: r['nombre'] || r['producto'] || '',
          categoria: r['categoria'] || r['categoría'] || 'otros',
          precio: parseFloat(r['precio'] || r['precio_unitario'] || r['precio unitario'] || 0) || 0,
          comision: parseFloat(r['comision'] || r['comisión'] || 0) || 0,
          stock: parseInt(r['stock'] || r['inventario'] || 0) || 0,
          descripcion: r['descripcion'] || r['descripción'] || r['detalle'] || '',
          colorCapuchon: r['colorcapuchon'] || r['color_capuchon'] || r['color capuchon'] || r['color'] || ''
        };
        // Solo filas con nombre
        if (!producto.nombre) return null;
        return producto;
      };

      const productosImportados = rows.map(mapRowToProduct).filter(Boolean);
      if (productosImportados.length === 0) {
        alert('No se encontraron productos válidos en el CSV.');
        return;
      }

      // Reemplazar productos de esta empresa por los importados
      const existentes = JSON.parse(localStorage.getItem('productos') || '[]');
      const restantes = existentes.filter(p => p.empresaId !== (currentUser?.id || 1));
      // Asignar IDs consecutivos a nivel global
      let nextId = 1;
      const reindexed = [...restantes, ...productosImportados].map(p => ({ ...p, id: nextId++ }));
      localStorage.setItem('productos', JSON.stringify(reindexed));
      alert(`Catálogo importado: ${productosImportados.length} productos.`);
      // Recargar vistas relevantes
      loadProducts?.();
      loadProductosDisponibles?.();
    } catch (err) {
      console.error(err);
      alert('Error al procesar el CSV. Verifique el formato.');
    }
  };
  reader.readAsText(file, 'utf-8');
}

// CSV parser sencillo (maneja comillas y separadores básicos)
function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim().length > 0);
  if (lines.length === 0) return [];
  const headers = splitCSVLine(lines[0]).map(h => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i]);
    const obj = {};
    headers.forEach((h, idx) => obj[h] = cols[idx] !== undefined ? cols[idx] : '');
    rows.push(obj);
  }
  return rows;
}

function splitCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { // escaped quote
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result.map(v => v.trim());
}

function loadEmpresasForVenta() {
  const empresas = JSON.parse(localStorage.getItem('empresas') || '[]');
  const select = document.getElementById('venta-empresa');
  
  if (!select) return;
  
  select.innerHTML = '<option value="">Seleccionar empresa</option>';
  empresas.forEach(empresa => {
    const option = document.createElement('option');
    option.value = empresa.id;
    option.textContent = empresa.nombre;
    select.appendChild(option);
  });
}

function loadProductosVenta() {
  const empresaId = document.getElementById('venta-empresa').value;
  const select = document.getElementById('venta-producto');
  
  if (!select || !empresaId) return;
  
  const productos = JSON.parse(localStorage.getItem('productos') || '[]');
  const empresaProductos = productos.filter(p => p.empresaId == empresaId);
  
  select.innerHTML = '<option value="">Seleccionar producto</option>';
  empresaProductos.forEach(producto => {
    const option = document.createElement('option');
    option.value = producto.id;
    option.textContent = `${producto.nombre} - $${producto.precio}`;
    select.appendChild(option);
  });
}

function updatePrecioVenta() {
  const productoId = document.getElementById('venta-producto').value;
  
  if (!productoId) return;
  
  const productos = JSON.parse(localStorage.getItem('productos') || '[]');
  const producto = productos.find(p => p.id == productoId);
  
  if (producto) {
    document.getElementById('venta-precio').value = producto.precio;
    calculateTotal();
  }
}

function calculateTotal() {
  const precio = parseFloat(document.getElementById('venta-precio').value) || 0;
  const cantidad = parseInt(document.getElementById('venta-cantidad').value) || 0;
  const productoId = document.getElementById('venta-producto').value;
  
  const total = precio * cantidad;
  document.getElementById('venta-total').value = total.toFixed(2);
  
  if (productoId) {
    const productos = JSON.parse(localStorage.getItem('productos') || '[]');
    const producto = productos.find(p => p.id == productoId);
    
    if (producto) {
      const comision = (total * producto.comision) / 100;
      document.getElementById('venta-comision').value = comision.toFixed(2);
    }
  }
}

async function registrarVenta(ventaData) {
  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`${apiUrl}/api/ventas`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(ventaData),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      alert(`Error al registrar la venta: ${errorData.message || response.statusText}`);
      return false;
    }

    alert('Venta registrada exitosamente');
    closeRegistrarVentaModal();
    loadVentasSocio();
    loadComisionesSocio();
    return true;

  } catch (error) {
    console.error('Error en registrarVenta:', error);
    alert('Ocurrió un error de red. Por favor, intenta de nuevo.');
    return false;
  }
}

async function loadVentasSocio() {
  if (!currentUser || userType !== 'socio') return;

  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`${apiUrl}/api/ventas`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error(`Error al cargar las ventas: ${errorData.message || response.statusText}`);
      return;
    }

    const socioVentas = await response.json();
    const tableBody = document.getElementById('ventas-socio-table');

    if (!tableBody) return;

    tableBody.innerHTML = '';

    if (socioVentas.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="8">No has registrado ventas aún.</td></tr>';
      return;
    }

    socioVentas.forEach(venta => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${new Date(venta.fecha_venta).toLocaleDateString()}</td>
        <td>${venta.empresa_nombre || 'N/A'}</td>
        <td>${venta.producto_nombre || 'N/A'}</td>
        <td>${venta.cantidad}</td>
        <td>$${(venta.precio_total / venta.cantidad).toFixed(2)}</td>
        <td>$${parseFloat(venta.precio_total).toFixed(2)}</td>
        <td>$${parseFloat(venta.comision_total).toFixed(2)}</td>
        <td><span class="status-active">Completada</span></td>
      `;
      tableBody.appendChild(row);
    });
  } catch (error) {
    console.error('Error en loadVentasSocio:', error);
  }
}

async function loadComisionesSocio() {
  if (!currentUser || userType !== 'socio') return;

  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`${apiUrl}/api/socios/stats`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error(`Error al cargar las estadísticas: ${errorData.message || response.statusText}`);
      return;
    }

    const stats = await response.json();

    // Update stats
    const elements = {
      'comisiones-mes': `$${parseFloat(stats.comisiones_mes).toFixed(2)}`,
      'comisiones-total': `$${parseFloat(stats.comisiones_total).toFixed(2)}`,
      'ventas-realizadas': stats.ventas_realizadas,
      'empresas-colaborando': stats.empresas_colaborando
    };

    Object.entries(elements).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) element.textContent = value;
    });
  } catch (error) {
    console.error('Error en loadComisionesSocio:', error);
  }
}

function loadVentas() {
  // Implementation for empresa sales view
}

function loadStats() {
  // Implementation for empresa stats
}

async function updateEmpresaProfile(profileData) {
  if (!currentUser || userType !== 'empresa') return false;

  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`${apiUrl}/api/empresas/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(profileData),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      alert(`Error al actualizar el perfil: ${errorData.message || response.statusText}`);
      return false;
    }

    const result = await response.json();
    
    // Update current user in localStorage
    currentUser = result.user;
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    
    alert('Perfil actualizado exitosamente');
    loadEmpresaProfile(); // Reload profile form with updated data
    return true;

  } catch (error) {
    console.error('Error en updateEmpresaProfile:', error);
    alert('Ocurrió un error de red. Por favor, intenta de nuevo.');
    return false;
  }
}

async function updateSocioProfile(profileData) {
  if (!currentUser || userType !== 'socio') return false;

  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`${apiUrl}/api/socios/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(profileData),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      alert(`Error al actualizar el perfil: ${errorData.message || response.statusText}`);
      return false;
    }

    const result = await response.json();
    
    // Update current user in localStorage
    currentUser = result.user;
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    
    alert('Perfil actualizado exitosamente');
    loadSocioProfile(); // Reload profile form with updated data
    return true;

  } catch (error) {
    console.error('Error en updateSocioProfile:', error);
    alert('Ocurrió un error de red. Por favor, intenta de nuevo.');
    return false;
  }
}

// Cliente management functions
async function agregarCliente(clienteData) {
  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`${apiUrl}/api/clientes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(clienteData),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      alert(`Error al agregar el cliente: ${errorData.message || response.statusText}`);
      return false;
    }

    alert('Cliente agregado exitosamente');
    closeAgregarClienteModal();
    loadClientes();
    return true;

  } catch (error) {
    console.error('Error en agregarCliente:', error);
    alert('Ocurrió un error de red. Por favor, intenta de nuevo.');
    return false;
  }
}

async function loadClientes() {
  if (!currentUser || userType !== 'socio') return;

  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`${apiUrl}/api/clientes`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error(`Error al cargar clientes: ${errorData.message || response.statusText}`);
      return;
    }

    const socioClientes = await response.json();
    const tableBody = document.getElementById('clientes-table');
    if (!tableBody) return;

    tableBody.innerHTML = '';

    if (socioClientes.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="7">No tienes clientes registrados aún.</td></tr>';
      return;
    }

    socioClientes.forEach(cliente => {
      const nombreCompleto = cliente.tipo === 'empresa' ?
        cliente.razon_social :
        `${cliente.nombres} ${cliente.apellidos}`;

      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${nombreCompleto}</td>
        <td>${cliente.tipo === 'empresa' ? cliente.representante : 'N/A'}</td>
        <td>${cliente.email}</td>
        <td>${cliente.telefono}</td>
        <td>${cliente.direccion}, ${cliente.ciudad}</td>
        <td>0</td>
        <td>
          <button class="btn-action btn-view" onclick="verCliente(${cliente.id})">Ver</button>
          <button class="btn-action btn-primary" onclick="solicitarProformaCliente(${cliente.id})">Nueva Proforma</button>
          <button class="btn-action btn-edit" onclick="editarCliente(${cliente.id})">Editar</button>
        </td>
      `;
      tableBody.appendChild(row);
    });
  } catch (error) {
    console.error('Error en loadClientes:', error);
  }
}

// Proforma management functions
async function solicitarProforma(proformaData) {
  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`${apiUrl}/api/proformas`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(proformaData),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      alert(`Error al solicitar la proforma: ${errorData.message || response.statusText}`);
      return false;
    }

    alert('Proforma solicitada exitosamente');
    closeSolicitarProformaModal();
    loadProformasSocio();
    return true;

  } catch (error) {
    console.error('Error en solicitarProforma:', error);
    alert('Ocurrió un error de red. Por favor, intenta de nuevo.');
    return false;
  }
}

async function generarProformaRespuesta(proformaId, respuestaData) {
  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`${apiUrl}/api/proformas/${proformaId}/respuesta`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ respuesta: respuestaData }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      alert(`Error al generar la proforma: ${errorData.message || response.statusText}`);
      return false;
    }

    alert('Proforma generada y enviada al socio exitosamente');
    closeGenerarProformaModal();
    loadProformasEmpresa();
    return true;

  } catch (error) {
    console.error('Error en generarProformaRespuesta:', error);
    alert('Ocurrió un error de red. Por favor, intenta de nuevo.');
    return false;
  }
}

async function loadProformasEmpresa() {
  if (!currentUser || userType !== 'empresa') return;

  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`${apiUrl}/api/proformas/empresa`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error(`Error al cargar las proformas: ${errorData.message || response.statusText}`);
      return;
    }

    const empresaProformas = await response.json();
    const tableBody = document.getElementById('proformas-empresa-table');
    if (!tableBody) return;

    tableBody.innerHTML = '';

    if (empresaProformas.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="8">No hay proformas solicitadas aún.</td></tr>';
      return;
    }

    empresaProformas.forEach(proforma => {
      const total = proforma.cantidad * proforma.precio_estimado;
      const statusClass = proforma.estado === 'enviada' ? 'status-enviada' :
                        proforma.estado === 'aprobada' ? 'status-aprobada' : 'status-rechazada';

      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${new Date(proforma.fecha_solicitud).toLocaleDateString()}</td>
        <td>${proforma.socio_nombres} ${proforma.socio_apellidos}</td>
        <td>${proforma.cliente_razon_social || (proforma.cliente_nombres + ' ' + proforma.cliente_apellidos)}</td>
        <td>${proforma.producto_nombre || 'N/A'}</td>
        <td>${proforma.cantidad}</td>
        <td>$${total.toFixed(2)}</td>
        <td><span class="${statusClass}">${proforma.estado}</span></td>
        <td>
          <button class="btn-action btn-view" onclick="verDetallesProforma(${proforma.id})">Ver</button>
          ${proforma.estado === 'enviada' ?
            `<button class="btn-action btn-primary" onclick="mostrarGenerarProforma(${proforma.id})">Generar</button>` :
            `<button class="btn-action btn-view" onclick="verProformaGenerada(${proforma.id})">Proforma</button>`
          }
        </td>
      `;
      tableBody.appendChild(row);
    });
  } catch (error) {
    console.error('Error en loadProformasEmpresa:', error);
  }
}

async function loadProformasSocio() {
  if (!currentUser || userType !== 'socio') return;

  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`${apiUrl}/api/proformas/socio`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error(`Error al cargar las proformas: ${errorData.message || response.statusText}`);
      return;
    }

    const socioProformas = await response.json();
    const tableBody = document.getElementById('proformas-socio-table');
    if (!tableBody) return;

    tableBody.innerHTML = '';

    if (socioProformas.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="8">No has solicitado proformas aún.</td></tr>';
      return;
    }

    socioProformas.forEach(proforma => {
      const statusClass = proforma.estado === 'enviada' ? 'status-enviada' :
                        proforma.estado === 'aprobada' ? 'status-aprobada' : 'status-rechazada';

      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${new Date(proforma.fecha_solicitud).toLocaleDateString()}</td>
        <td>${proforma.cliente_razon_social || (proforma.cliente_nombres + ' ' + proforma.cliente_apellidos)}</td>
        <td>${proforma.empresa_nombre || 'N/A'}</td>
        <td>${proforma.producto_nombre || 'N/A'}</td>
        <td>${proforma.cantidad}</td>
        <td>$${parseFloat(proforma.precio_estimado).toFixed(2)}</td>
        <td><span class="${statusClass}">${proforma.estado}</span></td>
        <td>
          <button class="btn-action btn-view" onclick="verEstadoProforma(${proforma.id})">Ver</button>
          ${proforma.estado === 'aprobada' ?
            `<button class="btn-action btn-primary" onclick="verProformaRecibida(${proforma.id})">Proforma</button>` : ''
          }
        </td>
      `;
      tableBody.appendChild(row);
    });
  } catch (error) {
    console.error('Error en loadProformasSocio:', error);
  }
}

// Modal functions for clientes and proformas
function showAgregarClienteModal() {
  document.getElementById('agregar-cliente-modal').style.display = 'block';
}

function closeAgregarClienteModal() {
  document.getElementById('agregar-cliente-modal').style.display = 'none';
  document.getElementById('agregar-cliente-form').reset();
  document.querySelectorAll('.cliente-fields').forEach(field => {
    field.style.display = 'none';
  });
}

function showSolicitarProformaModal() {
  document.getElementById('solicitar-proforma-modal').style.display = 'block';
  loadClientesForProforma();
  loadEmpresasForProforma();
}

function closeSolicitarProformaModal() {
  document.getElementById('solicitar-proforma-modal').style.display = 'none';
  document.getElementById('solicitar-proforma-form').reset();
}

function toggleClienteFields() {
  const tipo = document.getElementById('cliente-tipo').value;
  
  document.querySelectorAll('.cliente-fields').forEach(field => {
    field.style.display = 'none';
  });
  
  if (tipo === 'persona') {
    document.getElementById('persona-fields').style.display = 'block';
  } else if (tipo === 'empresa') {
    document.getElementById('empresa-fields').style.display = 'block';
  }
}

function loadClientesForProforma() {
  const clientes = JSON.parse(localStorage.getItem('clientes') || '[]');
  const socioClientes = clientes.filter(c => c.socioId === currentUser.id);
  const select = document.getElementById('proforma-cliente');
  
  if (!select) return;
  
  select.innerHTML = '<option value="">Seleccionar cliente</option>';
  socioClientes.forEach(cliente => {
    const nombre = cliente.tipo === 'empresa' ? 
      cliente.razonSocial : 
      `${cliente.nombres} ${cliente.apellidos}`;
    
    const option = document.createElement('option');
    option.value = cliente.id;
    option.textContent = nombre;
    select.appendChild(option);
  });
}

function loadEmpresasForProforma() {
  const empresas = JSON.parse(localStorage.getItem('empresas') || '[]');
  const select = document.getElementById('proforma-empresa-socio');
  
  if (!select) return;
  
  select.innerHTML = '<option value="">Seleccionar empresa</option>';
  empresas.forEach(empresa => {
    const option = document.createElement('option');
    option.value = empresa.id;
    option.textContent = empresa.nombre;
    select.appendChild(option);
  });
}

function loadProductosProforma() {
  const empresaId = document.getElementById('proforma-empresa-socio').value;
  const select = document.getElementById('proforma-producto-socio');
  
  if (!select || !empresaId) return;
  
  const productos = JSON.parse(localStorage.getItem('productos') || '[]');
  const empresaProductos = productos.filter(p => p.empresaId == empresaId);
  
  select.innerHTML = '<option value="">Seleccionar producto</option>';
  empresaProductos.forEach(producto => {
    const option = document.createElement('option');
    option.value = producto.id;
    option.textContent = `${producto.nombre} - $${producto.precio}`;
    option.setAttribute('data-precio', producto.precio);
    select.appendChild(option);
  });
}

function updatePrecioEstimadoProforma() {
  const select = document.getElementById('proforma-producto-socio');
  const cantidadInput = document.getElementById('proforma-cantidad-socio');
  const precioInput = document.getElementById('proforma-precio-estimado');
  
  const selectedOption = select.selectedOptions[0];
  if (selectedOption && cantidadInput.value) {
    const precio = parseFloat(selectedOption.getAttribute('data-precio')) || 0;
    const cantidad = parseInt(cantidadInput.value) || 0;
    precioInput.value = (precio * cantidad).toFixed(2);
  }
}

function solicitarProformaCliente(clienteId) {
  showSolicitarProformaModal();
  document.getElementById('proforma-cliente').value = clienteId;
  mostrarInfoCliente(clienteId);
}

function mostrarInfoCliente(clienteId) {
  const clientes = JSON.parse(localStorage.getItem('clientes') || '[]');
  const cliente = clientes.find(c => c.id == clienteId);
  
  const infoDiv = document.getElementById('cliente-info-preview');
  if (!infoDiv || !cliente) return;
  
  const nombre = cliente.tipo === 'empresa' ? 
    cliente.razonSocial : 
    `${cliente.nombres} ${cliente.apellidos}`;
  
  infoDiv.innerHTML = `
    <h4>Información del Cliente</h4>
    <p><strong>Nombre:</strong> ${nombre}</p>
    <p><strong>Tipo:</strong> ${cliente.tipo === 'empresa' ? 'Empresa' : 'Persona Natural'}</p>
    <p><strong>Email:</strong> ${cliente.email}</p>
    <p><strong>Teléfono:</strong> ${cliente.telefono}</p>
    <p><strong>Dirección:</strong> ${cliente.direccion}, ${cliente.ciudad}</p>
  `;
}

// Proforma generation functions
function verDetallesProforma(proformaId) {
  const proformas = JSON.parse(localStorage.getItem('proformas') || '[]');
  const proforma = proformas.find(p => p.id === proformaId);
  
  if (!proforma) return;
  
  const productos = JSON.parse(localStorage.getItem('productos') || '[]');
  const socios = JSON.parse(localStorage.getItem('socios') || '[]');
  
  const producto = productos.find(p => p.id === proforma.productoId);
  const socio = socios.find(s => s.id === proforma.socioId);
  
  const modal = document.getElementById('proforma-details-modal');
  const infoDiv = document.getElementById('proforma-info');
  
  infoDiv.innerHTML = `
    <div class="cliente-info">
      <h4>Información del Cliente</h4>
      <p><strong>Nombre:</strong> ${proforma.clienteInfo.nombre}</p>
      <p><strong>Tipo:</strong> ${proforma.clienteInfo.tipo === 'empresa' ? 'Empresa' : 'Persona Natural'}</p>
      <p><strong>Documento:</strong> ${proforma.clienteInfo.documento}</p>
      <p><strong>Email:</strong> ${proforma.clienteInfo.email}</p>
      <p><strong>Teléfono:</strong> ${proforma.clienteInfo.telefono}</p>
      <p><strong>Dirección:</strong> ${proforma.clienteInfo.direccion}</p>
      ${proforma.clienteInfo.representante ? `<p><strong>Representante:</strong> ${proforma.clienteInfo.representante}</p>` : ''}
    </div>
    
    <div class="proforma-info">
      <h4>Detalles de la Solicitud</h4>
      <p><strong>Socio:</strong> ${socio?.nombres} ${socio?.apellidos}</p>
      <p><strong>Producto:</strong> ${producto?.nombre}</p>
      <p><strong>Cantidad:</strong> ${proforma.cantidad} unidades</p>
      <p><strong>Precio Estimado:</strong> $${proforma.precioEstimado.toFixed(2)}</p>
      <p><strong>Urgencia:</strong> ${proforma.urgencia}</p>
      <p><strong>Fecha Solicitud:</strong> ${new Date(proforma.fechaSolicitud).toLocaleDateString()}</p>
      ${proforma.observaciones ? `<p><strong>Observaciones:</strong> ${proforma.observaciones}</p>` : ''}
    </div>
  `;
  
  // Store current proforma ID for actions
  window.currentProformaId = proformaId;
  
  modal.style.display = 'block';
}

function mostrarGenerarProforma(proformaId) {
  verDetallesProforma(proformaId);
  setTimeout(() => {
    closeProformaDetailsModal();
    showGenerarProformaModal(proformaId);
  }, 100);
}

function showGenerarProformaModal(proformaId) {
  const proformas = JSON.parse(localStorage.getItem('proformas') || '[]');
  const proforma = proformas.find(p => p.id === proformaId);
  const productos = JSON.parse(localStorage.getItem('productos') || '[]');
  const producto = productos.find(p => p.id === proforma.productoId);
  
  // Pre-fill form with product data
  document.getElementById('proforma-precio').value = producto.precio;
  document.getElementById('proforma-entrega').value = 7;
  
  // Set default validity date (30 days from now)
  const validezDate = new Date();
  validezDate.setDate(validezDate.getDate() + 30);
  document.getElementById('proforma-validez').value = validezDate.toISOString().split('T')[0];
  
  window.currentProformaId = proformaId;
  document.getElementById('generar-proforma-modal').style.display = 'block';
}

function closeProformaDetailsModal() {
  document.getElementById('proforma-details-modal').style.display = 'none';
}

function closeGenerarProformaModal() {
  document.getElementById('generar-proforma-modal').style.display = 'none';
  document.getElementById('generar-proforma-form').reset();
}

function generateProformaDocument(proforma, empresa, producto, respuesta) {
  const descuento = respuesta.descuento || 0;
  const subtotal = proforma.cantidad * respuesta.precioUnitario;
  const montoDescuento = (subtotal * descuento) / 100;
  const total = subtotal - montoDescuento;
  
  const logoHtml = empresa.logo ? 
    `<img src="${empresa.logo}" alt="Logo ${empresa.nombre}" class="empresa-logo">` : 
    `<div class="empresa-logo" style="width: 150px; height: 80px; background: #f0f0f0; display: flex; align-items: center; justify-content: center; border: 2px dashed #ccc;">Logo</div>`;
  
// Additional helper functions
function verCliente(clienteId) {
  alert('Función ver cliente en desarrollo');
}

function editarCliente(clienteId) {
  alert('Función editar cliente en desarrollo');
}

function verEstadoProforma(proformaId) {
  const proformas = JSON.parse(localStorage.getItem('proformas') || '[]');
  const proforma = proformas.find(p => p.id === proformaId);
  
  if (proforma) {
    alert(`Estado de la proforma: ${proforma.estado}\nFecha de solicitud: ${new Date(proforma.fechaSolicitud).toLocaleDateString()}`);
  }
}

function verProformaRecibida(proformaId) {
  const proformas = JSON.parse(localStorage.getItem('proformas') || '[]');
  const proforma = proformas.find(p => p.id === proformaId);
  
  if (proforma && proforma.estado === 'aprobada') {
    mostrarProformaCompleta(proforma);
  }
}

function verProformaGenerada(proformaId) {
  verProformaRecibida(proformaId);
}

function mostrarProformaCompleta(proforma) {
  const empresas = JSON.parse(localStorage.getItem('empresas') || '[]');
  const productos = JSON.parse(localStorage.getItem('productos') || '[]');
  
  const empresa = empresas.find(e => e.id === proforma.empresaId);
  const producto = productos.find(p => p.id === proforma.productoId);
  
  const modal = document.getElementById('ver-proforma-modal');
  const content = document.getElementById('proforma-content');
  
  content.innerHTML = generateProformaDocument(proforma, empresa, producto, proforma.respuesta);
  
  window.currentProformaForDownload = proforma;
  modal.style.display = 'block';
}

function closeVerProformaModal() {
  document.getElementById('ver-proforma-modal').style.display = 'none';
}

function descargarProforma() {
  alert('Funcionalidad de descarga PDF en desarrollo');
}

function generarProforma() {
  if (window.currentProformaId) {
    showGenerarProformaModal(window.currentProformaId);
  }
}

function rechazarProforma() {
  if (confirm('¿Está seguro de que desea rechazar esta solicitud de proforma?')) {
    const proformas = JSON.parse(localStorage.getItem('proformas') || '[]');
    const proformaIndex = proformas.findIndex(p => p.id === window.currentProformaId);
    
    if (proformaIndex !== -1) {
      proformas[proformaIndex].estado = 'rechazada';
      proformas[proformaIndex].fechaRespuesta = new Date().toISOString();
      localStorage.setItem('proformas', JSON.stringify(proformas));
      
      alert('Proforma rechazada');
      closeProformaDetailsModal();
      loadProformasEmpresa();
    }
  }
}

function filterProformas() {
  const estado = document.getElementById('proforma-estado-filter').value;
  // Implementation for filtering proformas by status
  loadProformasEmpresa(); // For now, just reload all
}

function filterProformasSocio() {
  const estado = document.getElementById('proformas-estado-filter').value;
  // Implementation for filtering proformas by status
  loadProformasSocio(); // For now, just reload all
}

  return `
    <div class="proforma-document">
      <div class="proforma-header">
        ${logoHtml}
        <div class="empresa-info">
          <h1 class="proforma-title">PROFORMA</h1>
          <p class="proforma-number">Nº ${proforma.numeroProforma}</p>
          <p><strong>${empresa.nombre}</strong></p>
          <p>RUC: ${empresa.ruc}</p>
          <p>${empresa.direccion}</p>
          <p>Tel: ${empresa.telefono}</p>
          <p>Email: ${empresa.email}</p>
        </div>
      </div>
      
      <div class="proforma-body">
        <div class="cliente-section">
          <h4>DATOS DEL CLIENTE</h4>
          <p><strong>Nombre:</strong> ${proforma.clienteInfo.nombre}</p>
          <p><strong>${proforma.clienteInfo.tipo === 'empresa' ? 'RUC' : 'Cédula'}:</strong> ${proforma.clienteInfo.documento}</p>
          <p><strong>Dirección:</strong> ${proforma.clienteInfo.direccion}</p>
          <p><strong>Teléfono:</strong> ${proforma.clienteInfo.telefono}</p>
          <p><strong>Email:</strong> ${proforma.clienteInfo.email}</p>
        </div>
        
        <div class="productos-section">
          <h4>DETALLE DE PRODUCTOS</h4>
          <table class="productos-table">
            <thead>
              <tr>
                <th>Descripción</th>
                <th class="text-right">Cantidad</th>
                <th class="text-right">Precio Unit.</th>
                <th class="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>${producto.nombre}<br><small>${producto.descripcion}</small></td>
                <td class="text-right">${proforma.cantidad}</td>
                <td class="text-right">$${respuesta.precioUnitario.toFixed(2)}</td>
                <td class="text-right">$${subtotal.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
          
          <div class="proforma-totals">
            <div class="total-line">
              <span>Subtotal:</span>
              <span>$${subtotal.toFixed(2)}</span>
            </div>
            ${descuento > 0 ? `
            <div class="total-line">
              <span>Descuento (${descuento}%):</span>
              <span>-$${montoDescuento.toFixed(2)}</span>
            </div>
            ` : ''}
            <div class="total-line total-final">
              <span>TOTAL:</span>
              <span>$${total.toFixed(2)}</span>
            </div>
          </div>
        </div>
        
        <div class="validez-info">
          <p><strong>Tiempo de Entrega:</strong> ${respuesta.tiempoEntrega} días hábiles</p>
          <p><strong>Válida hasta:</strong> ${new Date(respuesta.validezHasta).toLocaleDateString()}</p>
        </div>
        
        ${respuesta.terminos ? `
        <div class="terminos-section">
          <h4>TÉRMINOS Y CONDICIONES</h4>
          <p>${respuesta.terminos}</p>
        </div>
        ` : ''}
        
        ${respuesta.notas ? `
        <div class="terminos-section">
          <h4>NOTAS ADICIONALES</h4>
          <p>${respuesta.notas}</p>
        </div>
        ` : ''}
      </div>
      
      <div class="proforma-footer">
        <p>Proforma generada el ${new Date().toLocaleDateString()}</p>
        <p>Esta proforma es válida hasta la fecha indicada y está sujeta a disponibilidad de stock.</p>
      </div>
    </div>
  `;
}

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
  
  
  // Check if user is logged in
  const savedUser = localStorage.getItem('currentUser');
  const savedUserType = localStorage.getItem('userType');
  
  if (savedUser && savedUserType) {
    currentUser = JSON.parse(savedUser);
    userType = savedUserType;
  }
  
  // Event listeners for proforma-related forms
  const agregarClienteForm = document.getElementById('agregar-cliente-form');
  if (agregarClienteForm) {
    agregarClienteForm.addEventListener('submit', function(e) {
      e.preventDefault();
      const formData = new FormData(e.target);
      const clienteData = Object.fromEntries(formData.entries());
      
      if (agregarCliente(clienteData)) {
        alert('Cliente agregado exitosamente');
        closeAgregarClienteModal();
        loadClientes();
      }
    });
  }
  
  const solicitarProformaForm = document.getElementById('solicitar-proforma-form');
  if (solicitarProformaForm) {
    solicitarProformaForm.addEventListener('submit', function(e) {
      e.preventDefault();
      const formData = new FormData(e.target);
      const proformaData = Object.fromEntries(formData.entries());
      
      if (solicitarProforma(proformaData)) {
        alert('Proforma solicitada exitosamente');
        closeSolicitarProformaModal();
        loadProformasSocio();
      }
    });
  }
  
  const generarProformaForm = document.getElementById('generar-proforma-form');
  if (generarProformaForm) {
    generarProformaForm.addEventListener('submit', function(e) {
      e.preventDefault();
      const formData = new FormData(e.target);
      const respuestaData = Object.fromEntries(formData.entries());
      
      if (generarProformaRespuesta(window.currentProformaId, respuestaData)) {
        alert('Proforma generada y enviada al socio exitosamente');
        closeGenerarProformaModal();
        loadProformasEmpresa();
      }
    });
  }

  // Handle edit product form
  const editProductForm = document.getElementById('edit-product-form');
  if (editProductForm) {
    editProductForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      const formData = new FormData(e.target);
      const producto = Object.fromEntries(formData.entries());
    const productId = producto.id;

    try {
      const response = await apiFetch(`/api/products/${productId}`, {
        method: 'PUT',
        body: JSON.stringify(producto),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        alert(`Error al actualizar el producto: ${errorData.message || response.statusText}`);
        return;
      }

      alert('Producto actualizado exitosamente');
      closeEditProductModal();
      loadProducts();

    } catch (error) {
      console.error('Error en la actualización del producto:', error);
      alert('Ocurrió un error de red. Por favor, intenta de nuevo.');
    }
  });
  }
  
  // Update estimated price when quantity or product changes
  const cantidadProforma = document.getElementById('proforma-cantidad-socio');
  const productoProforma = document.getElementById('proforma-producto-socio');
  
  if (cantidadProforma) {
    cantidadProforma.addEventListener('input', updatePrecioEstimadoProforma);
  }
  
  if (productoProforma) {
    productoProforma.addEventListener('change', updatePrecioEstimadoProforma);
  }
  
  // Show client info when client is selected
  const clienteSelect = document.getElementById('proforma-cliente');
  if (clienteSelect) {
    clienteSelect.addEventListener('change', function() {
      if (this.value) {
        mostrarInfoCliente(this.value);
      } else {
        document.getElementById('cliente-info-preview').innerHTML = '';
      }
    });
  }
  
  // Close modals when clicking outside
  window.onclick = function(event) {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
      if (event.target === modal) {
        modal.style.display = 'none';
      }
    });
  };
});
// === API Debug Panel (enable with ?debug=1 or localStorage.DEBUG_API='1') ===
(() => {
  try {
    const isDebug = /[?&]debug=1\b/.test(location.search) || localStorage.getItem('DEBUG_API') === '1';
    if (!isDebug || typeof window.fetch !== 'function') return;

    const panel = document.createElement('div');
    panel.id = 'api-debug-panel';
    panel.style.cssText = [
      'position:fixed', 'right:12px', 'bottom:12px', 'z-index:99999',
      'width:min(520px,95vw)', 'max-height:55vh', 'overflow:auto',
      'background:#0b1020', 'color:#e8eefc',
      'font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
      'border:1px solid #334', 'border-radius:12px', 'box-shadow:0 6px 18px rgba(0,0,0,.35)'
    ].join(';');
    panel.innerHTML = (
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-bottom:1px solid #334;">' +
        '<strong>API Debug</strong>' +
        '<div>' +
          '<button id="api-debug-copy" style="margin-right:6px">Copy</button>' +
          '<button id="api-debug-close">Close</button>' +
        '</div>' +
      '</div>' +
      '<pre id="api-debug-pre" style="margin:0;padding:10px;white-space:pre-wrap;"></pre>'
    );
    document.addEventListener('DOMContentLoaded', () => document.body.appendChild(panel));
    const pre = panel.querySelector('#api-debug-pre');
    panel.querySelector('#api-debug-close').onclick = () => panel.remove();
    panel.querySelector('#api-debug-copy').onclick = async () => {
      try { await navigator.clipboard.writeText(pre.textContent || ''); } catch(_) {}
    };

    const origFetch = window.fetch.bind(window);
    window.fetch = async (input, init = {}) => {
      const req = new Request(input, init);
      if (!/\/api\//.test(req.url)) return origFetch(input, init);

      // Try to preview request body safely using clone()
      let bodyPreview = null;
      try {
        const ct = req.headers.get('Content-Type') || '';
        // Clone the request so we don't consume the original body
        const cloneForBody = req.clone();
        // Some bodies may be empty or non-readable
        const raw = await cloneForBody.text();
        if (raw && ct.includes('application/json')) {
          try { bodyPreview = JSON.parse(raw); } catch { bodyPreview = raw; }
        } else if (raw) {
          bodyPreview = raw;
        }
      } catch (_) {}

      const startedAt = new Date();
      let res, status, json, text, out;
      try {
        res = await origFetch(req);
        status = res.status;
        try { json = await res.clone().json(); } catch { text = await res.clone().text(); }
        out = {
          time: startedAt.toISOString(),
          request: { method: req.method, url: req.url, headers: Object.fromEntries(req.headers.entries()), body: bodyPreview },
          response: { status, json, text }
        };
        pre.textContent = JSON.stringify(out, null, 2);
        console[status >= 400 ? 'error' : 'log']('[API DEBUG]', out);
        return res;
      } catch (err) {
        out = {
          time: startedAt.toISOString(),
          request: { method: req.method, url: req.url, headers: Object.fromEntries(req.headers.entries()), body: bodyPreview },
          error: { name: err?.name, message: err?.message }
        };
        pre.textContent = JSON.stringify(out, null, 2);
        console.error('[API DEBUG]', out);
        throw err;
      }
    };

    window.addEventListener('keydown', (e) => {
      if (e.altKey && e.key && e.key.toLowerCase() === 'd') {
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
      }
    });

    console.log('[API DEBUG] Interceptor activo. Usa ?debug=1 o localStorage.DEBUG_API="1"');
  } catch (e) {
    try { console.warn('[API DEBUG] no se pudo activar:', e?.message || e); } catch(_) {}
  }
})();
