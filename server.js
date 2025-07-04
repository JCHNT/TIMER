const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const socketio = require('socket.io');
const session = require('express-session');

const app = express();
const server = http.createServer(app);
const io = socketio(server);

const CONFIG_PATH = path.join(__dirname, 'public', 'config.json');
const USERS_PATH = path.join(__dirname, 'users.json');

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Pour parser les données de formulaire

app.use(session({
  secret: 'your_secret_key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 3600000 } // 1 heure
}));

// Middleware d'authentification
function isAuthenticated(req, res, next) {
  if (req.session.isAuthenticated) {
    return next();
  }
  res.redirect('/login.html'); // Rediriger vers la page de connexion
}

app.get('/config', (req, res) => {
  fs.readFile(CONFIG_PATH, (err, data) => {
    if (err) return res.status(500).send('Erreur de lecture config.json');
    res.json(JSON.parse(data));
  });
});

app.post('/config', (req, res) => {
  fs.writeFile(CONFIG_PATH, JSON.stringify(req.body, null, 2), err => {
    if (err) return res.status(500).send('Erreur d\'écriture config.json');
    res.send('Configuration enregistrée');
  });
});

// Route de connexion
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  fs.readFile(USERS_PATH, (err, data) => {
    if (err) return res.status(500).send('Erreur de lecture des utilisateurs');
    const users = JSON.parse(data);
    const user = users.find(u => u.username === username && u.password === password);

    if (user) {
      req.session.isAuthenticated = true;
      res.redirect('/admin.html'); // Rediriger vers la page d'administration après connexion réussie
    } else {
      res.status(401).send('Nom d\'utilisateur ou mot de passe incorrect');
    }
  });
});

// Protéger la page d'administration
app.get('/admin.html', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

io.on('connection', socket => {
  console.log('Client connecté');

  socket.on('start', data => {
    io.emit('start', data);
  });

  socket.on('reset', () => {
    io.emit('reset');
  });
});

const PORT = 3000;
server.listen(PORT, () => console.log(`Serveur en écoute sur le port ${PORT}`));
