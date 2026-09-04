const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const { OAuth2Client } = require('google-auth-library');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

// ⚠️ REEMPLAZA ESTO CON TU CLIENT ID REAL DE GOOGLE
const GOOGLE_CLIENT_ID = "671969205745-3jkucr332s9e8pdo49752f8ihh6k7fgs.apps.googleusercontent.com"; 
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

// Conexión a Base de Datos
const db = new sqlite3.Database('./polleria.db', (err) => {
    if (err) console.error("Error al conectar SQLite:", err);
    else console.log("Base de datos polleria.db conectada.");
});

// Inicialización de la base de datos de forma segura
db.serialize(() => {
    // 1. Crear tabla usuarios si no existe
    db.run(`CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        google_id TEXT UNIQUE,
        nombre_completo TEXT,
        email TEXT UNIQUE,
        es_admin INTEGER DEFAULT 0
    )`);

    // 2. Agregar la columna 'es_admin' si la tabla ya existía sin ella
    db.run(`ALTER TABLE usuarios ADD COLUMN es_admin INTEGER DEFAULT 0`, (err) => {
        // Se ignora el error si la columna ya existía
    });

    // 3. Crear tabla productos
    db.run(`CREATE TABLE IF NOT EXISTS productos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        descripcion TEXT,
        precio_venta REAL NOT NULL,
        unidad_medida TEXT DEFAULT 'kg',
        imagen_url TEXT
    )`);

    // 4. Marcar tu mail como Admin por defecto
    db.run(`INSERT INTO usuarios (email, nombre_completo, es_admin) 
            VALUES ('jereigl.stt@gmail.com', 'Admin Jyreh', 1) 
            ON CONFLICT(email) DO UPDATE SET es_admin = 1`);
});

// Middlewares
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'polleria_jyreh_secret_key_2026',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

// Servir Archivos HTML
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin', (req, res) => {
    if (req.session.usuario && req.session.usuario.es_admin) {
        res.sendFile(path.join(__dirname, 'admin.html'));
    } else {
        res.redirect('/');
    }
});

// API: Autenticación con Google
app.post('/api/auth/google', async (req, res) => {
    const { token } = req.body;
    try {
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: GOOGLE_CLIENT_ID
        });
        const payload = ticket.getPayload();
        const { sub, name, email } = payload;

        const esAdmin = (email === 'jereigl.stt@gmail.com') ? 1 : 0;

        db.run(`INSERT INTO usuarios (google_id, nombre_completo, email, es_admin) 
                VALUES (?, ?, ?, ?) 
                ON CONFLICT(email) DO UPDATE SET google_id = ?, nombre_completo = ?, es_admin = ?`,
            [sub, name, email, esAdmin, sub, name, esAdmin],
            function (err) {
                if (err) return res.status(500).json({ error: "Error en la BD" });

                const usuarioSession = {
                    id: this.lastID,
                    nombre_completo: name,
                    email: email,
                    es_admin: esAdmin === 1
                };

                req.session.usuario = usuarioSession;
                res.json({ usuario: usuarioSession });
            }
        );
    } catch (error) {
        res.status(400).json({ error: "Token de Google inválido" });
    }
});

// API: Obtener usuario actual
app.get('/api/auth/me', (req, res) => {
    if (req.session.usuario) {
        res.json(req.session.usuario);
    } else {
        res.status(401).json({ error: "No autenticado" });
    }
});

// API: Cerrar Sesión
app.post('/api/auth/logout', (req, res) => {
    req.session.destroy();
    res.json({ ok: true });
});

// API: Productos (CRUD)
app.get('/api/productos', (req, res) => {
    db.all("SELECT * FROM productos", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/productos', (req, res) => {
    if (!req.session.usuario || !req.session.usuario.es_admin) return res.status(403).json({ error: "No autorizado" });
    const { nombre, descripcion, precio_venta, unidad_medida, imagen_url } = req.body;
    db.run(`INSERT INTO productos (nombre, descripcion, precio_venta, unidad_medida, imagen_url) VALUES (?, ?, ?, ?, ?)`,
        [nombre, descripcion, precio_venta, unidad_medida, imagen_url],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID });
        }
    );
});

app.put('/api/productos/:id', (req, res) => {
    if (!req.session.usuario || !req.session.usuario.es_admin) return res.status(403).json({ error: "No autorizado" });
    const { nombre, descripcion, precio_venta, unidad_medida, imagen_url } = req.body;
    db.run(`UPDATE productos SET nombre=?, descripcion=?, precio_venta=?, unidad_medida=?, imagen_url=? WHERE id=?`,
        [nombre, descripcion, precio_venta, unidad_medida, imagen_url, req.params.id],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ ok: true });
        }
    );
});

app.delete('/api/productos/:id', (req, res) => {
    if (!req.session.usuario || !req.session.usuario.es_admin) return res.status(403).json({ error: "No autorizado" });
    db.run(`DELETE FROM productos WHERE id=?`, [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ ok: true });
    });
});

app.listen(PORT, () => console.log(`Servidor corriendo en el puerto ${PORT}`));
