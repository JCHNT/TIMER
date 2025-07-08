const express = require("express");
const http = require("http");
const fs = require("fs");
const path = require("path");
const socketio = require("socket.io");
const session = require("express-session");
const bcrypt = require("bcrypt");

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

// Fonction utilitaire pour créer un utilisateur avec mot de passe haché
async function createUser(username, plainPassword) {
  const saltRounds = 12;
  const hashedPassword = await bcrypt.hash(plainPassword, saltRounds);
  return { username, password: hashedPassword };
}

// Fonction pour migrer les anciens mots de passe en clair vers des mots de passe hachés
async function migratePasswordsIfNeeded() {
  try {
    const data = fs.readFileSync(USERS_PATH, 'utf8');
    const users = JSON.parse(data);
    let needsMigration = false;

    // Vérifier si les mots de passe sont déjà hachés (bcrypt commence par $2b$)
    for (const user of users) {
      if (!user.password.startsWith('$2b$')) {
        needsMigration = true;
        break;
      }
    }

    if (needsMigration) {
      console.log("Migration des mots de passe en cours...");
      const migratedUsers = await Promise.all(
        users.map(async (user) => {
          if (!user.password.startsWith('$2b$')) {
            // Mot de passe en clair, le hacher
            const hashedPassword = await bcrypt.hash(user.password, 12);
            return { ...user, password: hashedPassword };
          }
          return user;
        })
      );

      fs.writeFileSync(USERS_PATH, JSON.stringify(migratedUsers, null, 2));
      console.log("Migration des mots de passe terminée.");
    }
  } catch (err) {
    console.error("Erreur lors de la migration des mots de passe:", err);
    
    // Créer un utilisateur par défaut si le fichier n'existe pas
    const defaultUser = await createUser("admin", "admin123");
    fs.writeFileSync(USERS_PATH, JSON.stringify([defaultUser], null, 2));
    console.log("Fichier utilisateurs créé avec utilisateur par défaut (admin/admin123)");
  }
}

app.get("/config", isAuthenticated, (req, res) => {
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

app.post("/config", isAuthenticated, (req, res) => {
  fs.writeFile(CONFIG_PATH, JSON.stringify(req.body, null, 2), err => {
    if (err) {
      console.error("Erreur d'écriture config.json:", err);
      return res.status(500).send("Erreur d'écriture config.json");
    }
    res.send("Configuration enregistrée");
  });
});

// Route de connexion avec vérification des mots de passe hachés
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const data = fs.readFileSync(USERS_PATH, 'utf8');
    const users = JSON.parse(data);
    const user = users.find(u => u.username === username);

    if (user) {
      // Vérifier le mot de passe haché
      const isPasswordValid = await bcrypt.compare(password, user.password);
      
      if (isPasswordValid) {
        req.session.isAuthenticated = true;
        res.redirect("/admin.html");
      } else {
        res.status(401).send("Nom d'utilisateur ou mot de passe incorrect");
      }
    } else {
      res.status(401).send("Nom d'utilisateur ou mot de passe incorrect");
    }
  } catch (err) {
    console.error("Erreur lors de la connexion:", err);
    res.status(500).send("Erreur de connexion");
  }
});

// Route pour terminer l'examen (arrêter le serveur)
app.post("/terminate", (req, res) => {
  console.log("Demande de terminaison de l'examen reçue");
  res.json({ message: "Examen terminé. Le serveur va s'arrêter." });
  
  // Émettre un signal à tous les clients connectés
  io.emit("examTerminated");
  
  // Arrêter le serveur après un délai pour permettre l'envoi du message
  setTimeout(() => {
    console.log("Arrêt du serveur...");
    process.exit(0);
  }, 1000);
});

// Route de déconnexion
app.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Erreur lors de la déconnexion:", err);
    }
    res.redirect("/login.html");
  });
});

// Protéger toutes les routes d'administration
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

// Protéger l'accès à la configuration (route GET et POST)
app.get("/config", isAuthenticated, (req, res) => {
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

app.post("/config", isAuthenticated, (req, res) => {
  fs.writeFile(CONFIG_PATH, JSON.stringify(req.body, null, 2), err => {
    if (err) {
      console.error("Erreur d'écriture config.json:", err);
      return res.status(500).send("Erreur d'écriture config.json");
    }
    res.send("Configuration enregistrée");
  });
});

// Route pour vérifier l'état de l'authentification
app.get("/auth-status", (req, res) => {
  res.json({ authenticated: !!req.session.isAuthenticated });
});

io.on("connection", socket => {
  console.log("Client connecté");

  socket.on("start", data => {
    io.emit("start", data);
  });

  socket.on("reset", () => {
    io.emit("reset");
  });

  socket.on("terminate", () => {
    io.emit("examTerminated");
    setTimeout(() => {
      console.log("Arrêt du serveur via Socket.IO...");
      process.exit(0);
    }, 1000);
  });
});

const PORT = 3000;

// Migrer les mots de passe au démarrage du serveur
migratePasswordsIfNeeded().then(() => {
  server.listen(PORT, () => {
    console.log(`Serveur en écoute sur le port ${PORT}`);
    console.log(`Répertoire public: ${PUBLIC_DIR}`);
    console.log(`Chemin vers config.json: ${CONFIG_PATH}`);
    console.log(`Chemin vers users.json: ${USERS_PATH}`);
  });
}).catch(err => {
  console.error("Erreur lors du démarrage:", err);
});
