const express = require("express");
const http = require("http");
const fs = require("fs");
const path = require("path");
const socketio = require("socket.io");
const session = require("express-session");

const app = express();
const server = http.createServer(app);
const io = socketio(server);

// Utiliser des chemins absolus pour fonctionner depuis n'importe quel répertoire
const BASE_DIR = process.env.BASE_DIR || "/opt/tabata-sync-server";
const PUBLIC_DIR = path.join(BASE_DIR, "public");
const CONFIG_PATH = path.join(PUBLIC_DIR, "config.json");
const USERS_PATH = path.join(BASE_DIR, "users.json");

app.use(express.static(PUBLIC_DIR));
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Pour parser les données de formulaire

app.use(session({
  secret: "your_secret_key",
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 3600000 } // 1 heure
}));

// Middleware d'authentification
function isAuthenticated(req, res, next) {
  if (req.session.isAuthenticated) {
    return next();
  }
  res.redirect("/login.html"); // Rediriger vers la page de connexion
}

app.get("/config", (req, res) => {
  fs.readFile(CONFIG_PATH, (err, data) => {
    if (err) {
      console.error("Erreur de lecture config.json:", err);
      return res.status(500).send("Erreur de lecture config.json");
    }
    try {
      const jsonData = JSON.parse(data);
      res.json(jsonData);
    } catch (e) {
      console.error("Erreur de parsing JSON:", e);
      res.status(500).send("Erreur de parsing JSON");
    }
  });
});

app.post("/config", (req, res) => {
  fs.writeFile(CONFIG_PATH, JSON.stringify(req.body, null, 2), err => {
    if (err) {
      console.error("Erreur d'écriture config.json:", err);
      return res.status(500).send("Erreur d'écriture config.json");
    }
    res.send("Configuration enregistrée");
  });
});

// Route de connexion
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  fs.readFile(USERS_PATH, (err, data) => {
    if (err) {
      console.error("Erreur de lecture des utilisateurs:", err);
      return res.status(500).send("Erreur de lecture des utilisateurs");
    }
    try {
      const users = JSON.parse(data);
      const user = users.find(u => u.username === username && u.password === password);

      if (user) {
        req.session.isAuthenticated = true;
        res.redirect("/admin.html"); // Rediriger vers la page d'administration après connexion réussie
      } else {
        res.status(401).send("Nom d'utilisateur ou mot de passe incorrect");
      }
    } catch (e) {
      console.error("Erreur de parsing JSON des utilisateurs:", e);
      res.status(500).send("Erreur de parsing JSON des utilisateurs");
    }
  });
});

// Protéger la page d'administration
app.get("/admin.html", isAuthenticated, (req, res) => {
  const adminPath = path.join(PUBLIC_DIR, "admin.html");
  console.log("Chemin vers admin.html:", adminPath);
  
  fs.access(adminPath, fs.constants.F_OK, (err) => {
    if (err) {
      console.error("Erreur d'accès à admin.html:", err);
      return res.status(404).send("Fichier admin.html non trouvé");
    }
    res.sendFile(adminPath);
  });
});

io.on("connection", socket => {
  console.log("Client connecté");

  socket.on("start", data => {
    io.emit("start", data);
  });

  socket.on("reset", () => {
    io.emit("reset");
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Serveur en écoute sur le port ${PORT}`);
  console.log(`Répertoire public: ${PUBLIC_DIR}`);
  console.log(`Chemin vers config.json: ${CONFIG_PATH}`);
  console.log(`Chemin vers users.json: ${USERS_PATH}`);
});

