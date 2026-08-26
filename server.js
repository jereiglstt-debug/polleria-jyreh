const express = require('express');
const sqlite3 = require('sqlite3').verbose(); // Usamos SQLite para DB Browser
const path = require('path');
const cors = require('cors');
const { OAuth2Client } = require('google-auth-library');

const app = express();
const PORT = process.env.PORT || 3000;

// 🚨 REEMPLAZA CON TU CLIENT ID REAL GENERADO EN GOOGLE CLOUD CONSOLE
const GOOGLE_CLIENT_ID = "TU_CLIENT_ID_DE_GOOGLE.apps.googleusercontent.com";
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

// Middlewares globales de performance y seguridad
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname))); 

// --- CONEXIÓN A LA BASE DE DATOS DE DB BROWSER (SQLITE) ---
// 🚨 Cambia 'polleria.db' por el nombre exacto de tu archivo de base de datos si es otro.
const dbPath = path.join(__dirname, 'polleria.db'); 

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Error abriendo el archivo de DB Browser:', err.message);
        return;
    }
    console.log('🔗 Conectado exitosamente al archivo de base de datos de Jyreh');
});

// --- RUTAS DE NAVEGACIÓN ---

// Tienda Principal (Frontend)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Panel de Administración Interno
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});


// --- ENDPOINTS DE LA API (PRODUCTOS) ---

// 1. Obtener todos los productos (Para la Tienda y el Administrador)
app.get('/api/productos', (req, res) => {
    const query = 'SELECT id, nombre, descripcion, precio_venta, unidad_medida, imagen_url FROM productos';
    db.all(query, [], (err, rows) => {
        if (err) {
            console.error('Error al obtener productos:', err.message);
            return res.status(500).json({ error: 'Error en el servidor al traer el catálogo' });
        }
        res.json(rows);
    });
});

// 2. Crear un nuevo producto (Desde el Panel de Administración)
app.post('/api/productos', (req, res) => {
    const { nombre, descripcion, precio_venta, unidad_medida, imagen_url } = req.body;
    const query = 'INSERT INTO productos (nombre, descripcion, precio_venta, unidad_medida, imagen_url) VALUES (?, ?, ?, ?, ?)';
    
    db.run(query, [nombre, descripcion, precio_venta, unidad_medida, imagen_url], function(err) {
        if (err) {
            console.error('Error al insertar producto:', err.message);
            return res.status(500).json({ error: 'No se pudo guardar el producto' });
        }
        res.status(201).json({ message: 'Producto creado', id: this.lastID });
    });
});

// 3. Modificar un producto existente (Desde el Panel de Administración)
app.put('/api/productos/:id', (req, res) => {
    const { id } = req.params;
    const { nombre, descripcion, precio_venta, unidad_medida, imagen_url } = req.body;
    const query = 'UPDATE productos SET nombre = ?, descripcion = ?, precio_venta = ?, unidad_medida = ?, imagen_url = ? WHERE id = ?';
    
    db.run(query, [nombre, descripcion, precio_venta, unidad_medida, imagen_url, id], function(err) {
        if (err) {
            console.error('Error al actualizar producto:', err.message);
            return res.status(500).json({ error: 'No se pudieron guardar los cambios' });
        }
        res.json({ message: 'Producto actualizado con éxito' });
    });
});

// 4. Eliminar un producto (Desde el Panel de Administración)
app.delete('/api/productos/:id', (req, res) => {
    const { id } = req.params;
    const query = 'DELETE FROM productos WHERE id = ?';
    
    db.run(query, [id], function(err) {
        if (err) {
            console.error('Error al eliminar producto:', err.message);
            return res.status(500).json({ error: 'No se pudo eliminar el producto' });
        }
        res.json({ message: 'Producto eliminado correctamente' });
    });
});


// --- ENDPOINT DE AUTENTICACIÓN (GOOGLE) ---
app.post('/api/auth/google', async (req, res) => {
    const { token } = req.body;
    try {
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: GOOGLE_CLIENT_ID
        });
        const payload = ticket.getPayload();
        
        const usuario = {
            google_id: payload['sub'],
            email: payload['email'],
            nombre_completo: payload['name'],
            foto_url: payload['picture']
        };

        res.json({ message: 'Autenticación exitosa', usuario });

    } catch (err) {
        console.error('Error verificando token de Google:', err);
        res.status(401).json({ error: 'Token de Google inválido' });
    }
});


// --- ENCENDER EL SERVIDOR ---
app.listen(PORT, () => {
    console.log(`🚀 Servidor de Pollería Jyreh corriendo en http://localhost:${PORT}`);
});