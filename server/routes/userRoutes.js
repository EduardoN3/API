const express = require('express');
const connection = require('../config/db');
const router = express.Router();

// Almacenar intentos fallidos y bloqueo temporal
const loginAttempts = {};
const MAX_ATTEMPTS = 3;
const LOCK_TIME = 60 * 1000; // 1 minuto

// Exportar una función que recibe upload como parámetro
module.exports = (upload) => {

  // Obtener usuarios
  router.get('/usuarios', (req, res) => {
    console.log('Se llamó a /api/usuarios');

    const query = 'SELECT id_usuario, nombre, email FROM usuarios';
    connection.query(query, (err, results) => {
      if (err) {
        console.error('Error en la consulta:', err);
        return res.status(500).json({ error: 'Error al obtener los usuarios' });
      }

      console.log('Con Resultados:', results);
      res.json(results);
    });
  });

  // Ruta para obtener un usuario específico por ID
  router.get('/usuarios/:id', (req, res) => {
    const { id } = req.params;

    connection.query('SELECT * FROM usuarios WHERE id_usuario = ?', [id], (err, results) => {
      if (err) {
        return res.status(500).json({ message: 'Error al obtener el usuario' });
      }
      if (results.length === 0) {
        return res.status(404).json({ message: 'Usuario no encontrado' });
      }
      res.json(results[0]); 
    });
  });

  // Registrar un usuario
  router.post('/registro', upload.single('foto'), (req, res) => {
    const { nombre, email, password, rol } = req.body;
    const foto = req.file ? `/uploads/${req.file.filename}` : null;

    if (!nombre || !email || !password) {
      return res.status(400).json({ error: "Todos los campos son obligatorios" });
    }

    const query = 'INSERT INTO usuarios (nombre, email, password, rol, foto) VALUES (?, ?, ?, ?, ?)';
    connection.query(query, [nombre, email, password, rol || 'usuario', foto], (err, result) => {
      if (err) {
        console.error('Error al registrar usuario:', err);
        return res.status(500).json({ error: 'Error al registrar el usuario' });
      }
      res.status(201).json({ message: "Usuario registrado correctamente" });
    });
  });

  // Iniciar sesión
  router.post('/login', (req, res) => {
    const { email, password } = req.body;
  
    if (!email || !password) {
      return res.status(400).json({ error: "Email y contraseña son obligatorios" });
    }
  
    // Verificar si el usuario está bloqueado
    if (loginAttempts[email] && loginAttempts[email].lockedUntil > Date.now()) {
      return res.status(403).json({ error: "Demasiados intentos fallidos. Inténtalo más tarde." });
    }
  
    const query = 'SELECT id_usuario, nombre, email, rol, password, foto FROM usuarios WHERE email = ?';
    connection.query(query, [email], (err, results) => {
      if (err) {
        return res.status(500).json({ error: "Error al iniciar sesión" });
      }
  
      if (results.length === 0 || results[0].password !== password) {
        // Manejar intentos fallidos
        if (!loginAttempts[email]) {
          loginAttempts[email] = { attempts: 0, lockedUntil: 0 };
        }
        loginAttempts[email].attempts++;
  
        if (loginAttempts[email].attempts >= MAX_ATTEMPTS) {
          loginAttempts[email].lockedUntil = Date.now() + LOCK_TIME;
          return res.status(403).json({ error: "Demasiados intentos fallidos. Inténtalo en 1 minuto." });
        }
  
        return res.status(401).json({ error: "Credenciales incorrectas" });
      }
  
      // Restablecer intentos si el inicio de sesión es exitoso
      delete loginAttempts[email];
  
      res.json({ message: "Login exitoso", user: results[0] });
    });
  });

  // Actualizar usuario (PUT)
  router.put('/usuarios/:id', upload.single('foto'), (req, res) => {
    const { id } = req.params;
    const { nombre, email, password, rol } = req.body;
    const foto = req.file ? `/uploads/${req.file.filename}` : null;
  
    if (!nombre || !email || !password) {
      return res.status(400).json({ error: "Nombre, email y contraseña son obligatorios" });
    }
  
    const query = 'UPDATE usuarios SET nombre = ?, email = ?, password = ?, rol = ?, foto = ? WHERE id_usuario = ?';
    connection.query(query, [nombre, email, password, rol, foto, id], (err, result) => {
      if (err) {
        console.error('Error al actualizar el usuario:', err);
        return res.status(500).json({ error: 'Error al actualizar el usuario' });
      }
  
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }
  
      // Devolver la información actualizada del usuario, incluyendo la URL de la imagen
      connection.query('SELECT * FROM usuarios WHERE id_usuario = ?', [id], (err, results) => {
        if (err) {
          return res.status(500).json({ error: 'Error al obtener el usuario actualizado' });
        }
        res.json({ message: 'Usuario actualizado correctamente', user: results[0] });
      });
    });
  });

  // Eliminar usuario (DELETE)
  router.delete('/usuarios/:id', (req, res) => {
    const { id } = req.params;

    console.log('Eliminando usuario con ID:', id);

    const query = 'DELETE FROM usuarios WHERE id_usuario = ?';
    connection.query(query, [id], (err, result) => {
      if (err) {
        console.error('Error al eliminar el usuario:', err);
        return res.status(500).json({ error: 'Error al eliminar el usuario' });
      }

      console.log('Resultado de la eliminación:', result);

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }

      res.json({ message: 'Usuario eliminado correctamente' });
    });
  });

  return router;
};