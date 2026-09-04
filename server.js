const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const { OAuth2Client } = require('google-auth-library');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

// ⚠️ Tu Client ID de Google OAuth
const GOOGLE_CLIENT_ID = "671969205745-3jkucr332s9e8pdo49752f8ihh6k7fgs.apps.googleusercontent.com"; 
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

// Conexión a la Base de Datos SQLite
const db = new sqlite3.Database('./polleria.db', (err) => {
    if (err) {
        console.error(" Error crítico al conectar con SQLite:", err.message);
    } else {
        console.log(" Base de datos polleria.db conectada exitosamente.");
    }
});

// Inicialización de esquema y migraciones seguras
db.serialize(() => {
    // 1. Estructura de la tabla usuarios
    db.run(`CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        google_id TEXT UNIQUE,
        nombre_completo TEXT,
        email TEXT UNIQUE,
        rol TEXT DEFAULT 'cliente',
        es_admin INTEGER DEFAULT 0
    )`);

    // 2. Migraciones para bases de datos existentes: se intentan agregar las columnas por si faltan
    db.run(`ALTER TABLE usuarios ADD COLUMN es_admin INTEGER DEFAULT 0`, () => {});
    db.run(`ALTER TABLE usuarios ADD COLUMN rol TEXT DEFAULT 'cliente'`, () => {});

    // 3. Estructura de la tabla productos
    db.run(`CREATE TABLE IF NOT EXISTS productos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        descripcion TEXT,
        precio_venta REAL NOT NULL,
        unidad_medida TEXT DEFAULT 'kg',
        imagen_url TEXT
    )`);

    // 4. Registro/Actualización del Administrador Principal
    // Se proveen todos los campos (incluyendo 'rol') para evitar violaciones de NOT NULL
    const adminEmail = 'jereigl.stt@gmail.com';
    const adminNombre = 'Admin Jyreh';

    db.run(
        `INSERT INTO usuarios (email, nombre_completo, es_admin, rol) 
         VALUES (?, ?, 1, 'admin') 
         ON CONFLICT(email) DO UPDATE SET es_admin = 1, rol = 'admin'`,
        [adminEmail, adminNombre],
        (err) => {
            if (err) {
                console.error(" Error al inicializar usuario admin:", err.message);
            } else {
                console.log(` Usuario administrador (${adminEmail}) verificado correctamente en la BD.`);
            }
        }
    );
});

// Middlewares
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'polleria_jyreh_secret_key_2026',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, // Cambiar a true si se configura HTTPS estricto con proxy
        maxAge: 1000 * 60 * 60 * 24 // La sesión dura 24 horas
    }
}));

// RUTA HTML: Tienda
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// RUTA HTML: Panel Admin (Protección del lado del servidor)
app.get('/admin', (req, res) => {
    if (req.session.usuario && req.session.usuario.es_admin) {
        res.sendFile(path.join(__dirname, 'admin.html'));
    } else {
        res.redirect('/');
    }
});

// API: Autenticación con Token de Google
app.post('/api/auth/google', async (req, res) => {
    const { token } = req.body;
    if (!token) {
        return res.status(400).json({ error: "Token no proporcionado" });
    }

    try {
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: GOOGLE_CLIENT_ID
        });
        const payload = ticket.getPayload();
        const { sub, name, email } = payload;

        const esAdmin = (email === 'jereigl.stt@gmail.com') ? 1 : 0;
        const rolUsuario = esAdmin ? 'admin' : 'cliente';

        db.run(
            `INSERT INTO usuarios (google_id, nombre_completo, email, es_admin, rol) 
             VALUES (?, ?, ?, ?, ?) 
             ON CONFLICT(email) DO UPDATE SET 
                google_id = ?, 
                nombre_completo = ?, 
                es_admin = ?, 
                rol = ?`,
            [sub, name, email, esAdmin, rolUsuario, sub, name, esAdmin, rolUsuario],
            function (err) {
                if (err) {
                    console.error("Error al registrar/actualizar usuario en Login:", err.message);
                    return res.status(500).json({ error: "Error en la base de datos al guardar la sesión" });
                }

                const usuarioSession = {
                    id: this.lastID || null,
                    nombre_completo: name,
                    email: email,
                    es_admin: esAdmin === 1,
                    rol: rolUsuario
                };

                req.session.usuario = usuarioSession;
                res.json({ usuario: usuarioSession });
            }
        );
    } catch (error) {
        console.error("Error al verificar token con Google:", error.message);
        res.status(400).json({ error: "Token de Google inválido o expirado" });
    }
});

// API: Consultar estado de la sesión activa
app.get('/api/auth/me', (req, res) => {
    if (req.session && req.session.usuario) {
        res.json(req.session.usuario);
    } else {
        res.status(401).json({ error: "No hay sesión activa" });
    }
});

// API: Cierre de Sesión
app.post('/api/auth/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: "No se pudo cerrar la sesión" });
        }
        res.clearCookie('connect.sid');
        res.json({ ok: true, mensaje: "Sesión cerrada correctamente" });
    });
});

// API: Obtener productos para el catálogo
app.get('/api/productos', (req, res) => {
    db.all("SELECT * FROM productos", [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: "Error al consultar productos" });
        }
        res.json(rows);
    });
});

// API: Crear producto (Solo Admin)
app.post('/api/productos', (req, res) => {
    if (!req.session.usuario || !req.session.usuario.es_admin) {
        return res.status(403).json({ error: "Acceso denegado: Requiere permisos de administrador" });
    }
    const { nombre, descripcion, precio_venta, unidad_medida, imagen_url } = req.body;
    db.run(
        `INSERT INTO productos (nombre, descripcion, precio_venta, unidad_medida, imagen_url) VALUES (?, ?, ?, ?, ?)`,
        [nombre, descripcion, precio_venta, unidad_medida || 'kg', imagen_url || ''],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID, mensaje: "Producto guardado con éxito" });
        }
    );
});

// API: Editar producto (Solo Admin)
app.put('/api/productos/:id', (req, res) => {
    if (!req.session.usuario || !req.session.usuario.es_admin) {
        return res.status(403).json({ error: "Acceso denegado: Requiere permisos de administrador" });
    }
    const { nombre, descripcion, precio_venta, unidad_medida, imagen_url } = req.body;
    db.run(
        `UPDATE productos SET nombre=?, descripcion=?, precio_venta=?, unidad_medida=?, imagen_url=? WHERE id=?`,
        [nombre, descripcion, precio_venta, unidad_medida, imagen_url, req.params.id],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true, mensaje: "Producto actualizado" });
        }
    );
});

// API: Eliminar producto (Solo Admin)
app.delete('/api/productos/:id', (req, res) => {
    if (!req.session.usuario || !req.session.usuario.es_admin) {
        return res.status(403).json({ error: "Acceso denegado: Requiere permisos de administrador" });
    }
    db.run(`DELETE FROM productos WHERE id=?`, [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true, mensaje: "Producto eliminado" });
    });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor ejecutándose en el puerto ${PORT}`);
});
