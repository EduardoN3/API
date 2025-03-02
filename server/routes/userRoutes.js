const express = require('express');
const connection = require('../config/db');
const router = express.Router();
const xlsx = require('xlsx');
const PdfPrinter = require('pdfmake');

// Almacenar intentos fallidos y bloqueo temporal
const loginAttempts = {};
const MAX_ATTEMPTS = 3;
const LOCK_TIME = 60 * 1000; // 1 minuto

// Exportar una función que recibe upload como parámetro
module.exports = (upload) => {

  // Obtener usuarios
  router.get('/usuarios', (req, res) => {
    console.log('Se llamó a /api/usuarios');

    const query = 'SELECT id_usuario, nombre, email, rol FROM usuarios';
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
        // Manejo de intentos fallidos
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
    const nuevaFoto = req.file ? `/uploads/${req.file.filename}` : null;

    if (!nombre || !email) {
      return res.status(400).json({ error: "Nombre y email son obligatorios" });
    }

    // Obtener el usuario actual para conservar la imagen si no se proporciona una nueva
    connection.query('SELECT foto FROM usuarios WHERE id_usuario = ?', [id], (err, results) => {
      if (err) {
        console.error('Error al obtener el usuario:', err);
        return res.status(500).json({ error: 'Error al obtener el usuario' });
      }

      if (results.length === 0) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }

      const fotoActual = results[0].foto; // Mantener la imagen actual del usuario
      const foto = nuevaFoto || fotoActual; // Usar la nueva imagen o conservar la actual

      // Construir la consulta SQL dinámicamente para actualizar solo los campos proporcionados
      const campos = [];
      const valores = [];

      if (nombre) {
        campos.push('nombre = ?');
        valores.push(nombre);
      }
      if (email) {
        campos.push('email = ?');
        valores.push(email);
      }
      if (password) {
        campos.push('password = ?');
        valores.push(password);
      }
      if (rol) {
        campos.push('rol = ?');
        valores.push(rol);
      }
      if (foto) {
        campos.push('foto = ?');
        valores.push(foto);
      }

      // Agregar el ID al final de los valores
      valores.push(id);

      const query = `UPDATE usuarios SET ${campos.join(', ')} WHERE id_usuario = ?`;

      // Ejecutar la consulta
      connection.query(query, valores, (err, result) => {
        if (err) {
          console.error('Error al actualizar el usuario:', err);
          return res.status(500).json({ error: 'Error al actualizar el usuario' });
        }

        if (result.affectedRows === 0) {
          return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        // Devolver la información actualizada del usuario
        connection.query('SELECT * FROM usuarios WHERE id_usuario = ?', [id], (err, results) => {
          if (err) {
            return res.status(500).json({ error: 'Error al obtener el usuario actualizado' });
          }
          res.json({ message: 'Usuario actualizado correctamente', user: results[0] });
        });
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

  // Ruta para cargar usuarios desde un archivo Excel
  router.post('/usuarios/cargar-excel', upload.single('archivo'), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No se proporcionó un archivo Excel" });
    }

    const filePath = req.file.path;
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet);

    if (data.length === 0) {
      return res.status(400).json({ error: "El archivo Excel está vacío" });
    }

    const usuarios = data.map(row => ({
      nombre: row.nombre,
      email: row.email,
      password: row.password,
      rol: row.rol || 'usuario',
      foto: row.foto || null
    }));

    const query = 'INSERT INTO usuarios (nombre, email, password, rol, foto) VALUES ?';
    const values = usuarios.map(usuario => [usuario.nombre, usuario.email, usuario.password, usuario.rol, usuario.foto]);

    connection.query(query, [values], (err, result) => {
      if (err) {
        console.error('Error al cargar usuarios desde Excel:', err);
        return res.status(500).json({ error: 'Error al cargar usuarios desde Excel' });
      }

      res.status(201).json({ message: "Usuarios cargados correctamente desde Excel", total: result.affectedRows });
    });
  });

  // Ruta para obtener usuarios paginados
  router.get('/usuarios-paginados', (req, res) => {
    let { page = 1, limit = 10, search = '' } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);
    const offset = (page - 1) * limit;

    let query = `SELECT id_usuario, nombre, email, rol, foto FROM usuarios WHERE nombre LIKE ? OR email LIKE ? LIMIT ?, ?`;
    let countQuery = `SELECT COUNT(*) as total FROM usuarios WHERE nombre LIKE ? OR email LIKE ?`;

    let searchParam = `%${search}%`;

    connection.query(countQuery, [searchParam, searchParam], (err, countResult) => {
      if (err) {
        console.error('Error en la consulta:', err);
        return res.status(500).json({ error: 'Error al obtener los usuarios' });
      }

      let totalUsuarios = countResult[0].total;

      connection.query(query, [searchParam, searchParam, offset, limit], (err, results) => {
        if (err) {
          console.error('Error en la consulta:', err);
          return res.status(500).json({ error: 'Error al obtener los usuarios' });
        }

        res.json({
          total: totalUsuarios,
          page,
          totalPages: Math.ceil(totalUsuarios / limit),
          usuarios: results
        });
      });
    });
  });


  // Obtener usuarios en PDF
  router.get('/usuariopdf', (req, res) => {
    const query = 'SELECT id_usuario, nombre, email, rol FROM usuarios';
    connection.query(query, (err, results) => {
      if (err) {
        console.error('Error en la consulta:', err);
        return res.status(500).json({ error: 'Error al obtener los usuarios' });
      }

      const fonts = {
        Helvetica: {
          normal: 'Helvetica',
          bold: 'Helvetica-Bold',
          italics: 'Helvetica-Oblique',
          bolditalics: 'Helvetica-BoldOblique'
        }
      };

      const printer = new PdfPrinter(fonts);

      const docDefinition = {
        content: [
          { text: 'Lista de Usuarios', style: 'header' },
          {
            table: {
              headerRows: 1,
              widths: ['*', '*', '*', '*'],
              body: [
                ['ID', 'Nombre', 'Email', 'Rol'],
                ...results.map(user => [user.id_usuario, user.nombre, user.email, user.rol])
              ]
            }
          }
        ],
        styles: {
          header: {
            fontSize: 18,
            bold: true,
            margin: [0, 0, 0, 10]
          }
        },
        defaultStyle: {
          font: 'Helvetica'
        }
      };

      const pdfDoc = printer.createPdfKitDocument(docDefinition);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=usuarios.pdf');
      pdfDoc.pipe(res);
      pdfDoc.end();
    });
  });
  


  return router;
};