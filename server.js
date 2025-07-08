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
  secret: process.env.SESSION_SECRET || "your_secret_key_change_in_production",
  resave: false,
  saveUninitialized: false,
  name: 'timer-ecos-session', // Nom spécifique pour éviter les conflits
  cookie: { 
    maxAge: 3600000, // 1 heure
    secure: false, // Mettre à true en HTTPS seulement
    httpOnly: true, // Sécurité contre XSS
    sameSite: 'lax' // Protection CSRF tout en permettant la navigation
  }
}));

// Middleware d'authentification
function isAuthenticated(req, res, next) {
  console.log(`Vérification auth pour ${req.path}, Session ID: ${req.session.id}, Authentifié: ${!!req.session.isAuthenticated}`);
  
  if (req.session.isAuthenticated) {
    return next();
  }
  
  console.log(`Accès refusé à ${req.path}, redirection vers login`);
  res.redirect("/login.html"); // Rediriger vers la page de connexion
}

// Middleware de debugging des sessions (en développement)
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    if (req.path.includes('admin') || req.path.includes('auth') || req.path.includes('config')) {
      console.log(`${req.method} ${req.path} - Session: ${req.session.id} - Auth: ${!!req.session.isAuthenticated}`);
    }
    next();
  });
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

// Créer une configuration par défaut si elle n'existe pas
function createDefaultConfig() {
  const defaultConfig = {
    title: 'TIMER ECOS',
    prepare: 10,
    work: 20,
    rest: 10,
    cycles: 8,
    sets: 1,
    restBetweenSets: 0,
    coolDown: 0,
    workDescription: '',
    restDescription: '',
    audioSettings: {
      soundEnabled: true,
      speechEnabled: true,
      volume: 70
    }
  };

  if (!fs.existsSync(CONFIG_PATH)) {
    try {
      const dir = path.dirname(CONFIG_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaultConfig, null, 2));
      console.log("Configuration par défaut créée:", CONFIG_PATH);
    } catch (err) {
      console.error("Erreur lors de la création de la configuration par défaut:", err);
    }
  }
}

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
  // Valider les données reçues
  const config = req.body;
  
  // Validation basique
  if (typeof config.prepare !== 'number' || config.prepare < 0) {
    return res.status(400).send("Valeur de préparation invalide");
  }
  if (typeof config.work !== 'number' || config.work < 0) {
    return res.status(400).send("Valeur de travail invalide");
  }
  if (typeof config.rest !== 'number' || config.rest < 0) {
    return res.status(400).send("Valeur de repos invalide");
  }
  if (typeof config.cycles !== 'number' || config.cycles < 1) {
    return res.status(400).send("Nombre de cycles invalide");
  }
  if (typeof config.sets !== 'number' || config.sets < 1) {
    return res.status(400).send("Nombre de séries invalide");
  }

  fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), err => {
    if (err) {
      console.error("Erreur d'écriture config.json:", err);
      return res.status(500).send("Erreur d'écriture config.json");
    }
    console.log("Configuration mise à jour:", {
      prepare: config.prepare,
      work: config.work,
      rest: config.rest,
      cycles: config.cycles,
      sets: config.sets,
      audioEnabled: config.audioSettings?.soundEnabled || false
    });
    res.send("Configuration enregistrée");
  });
});

// Route pour vérifier l'état de l'authentification
app.get("/auth-status", (req, res) => {
  console.log('Vérification auth-status pour session:', req.session.id);
  console.log('Session authentifiée:', !!req.session.isAuthenticated);
  
  // Headers pour éviter la mise en cache
  res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  
  res.json({ 
    authenticated: !!req.session.isAuthenticated,
    sessionId: req.session.id 
  });
});

// Route de connexion avec vérification des mots de passe hachés
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  console.log(`Tentative de connexion pour: ${username}`);

  try {
    const data = fs.readFileSync(USERS_PATH, 'utf8');
    const users = JSON.parse(data);
    const user = users.find(u => u.username === username);

    if (user) {
      // Vérifier le mot de passe haché
      const isPasswordValid = await bcrypt.compare(password, user.password);
      
      if (isPasswordValid) {
        // Définir la session
        req.session.isAuthenticated = true;
        req.session.username = username;
        
        // Sauvegarder la session explicitement
        req.session.save((err) => {
          if (err) {
            console.error('Erreur lors de la sauvegarde de session:', err);
            return res.status(500).send("Erreur de session");
          }
          
          console.log(`Connexion réussie pour: ${username}, Session ID: ${req.session.id}`);
          res.redirect("/admin.html");
        });
      } else {
        console.log(`Échec de connexion pour: ${username} - Mot de passe incorrect`);
        res.status(401).send("Nom d'utilisateur ou mot de passe incorrect");
      }
    } else {
      console.log(`Tentative de connexion avec un utilisateur inexistant: ${username}`);
      res.status(401).send("Nom d'utilisateur ou mot de passe incorrect");
    }
  } catch (err) {
    console.error("Erreur lors de la connexion:", err);
    res.status(500).send("Erreur de connexion");
  }
});

// Route pour terminer l'examen (arrêter le serveur)
app.post("/terminate", (req, res) => {
  const username = req.session.username || 'Anonyme';
  console.log(`Demande de terminaison de l'examen reçue de: ${username}`);
  res.json({ message: "Examen terminé. Le serveur va s'arrêter." });
  
  // Émettre un signal à tous les clients connectés
  io.emit("examTerminated", { terminatedBy: username });
  
  // Arrêter le serveur après un délai pour permettre l'envoi du message
  setTimeout(() => {
    console.log("Arrêt du serveur suite à une demande de terminaison...");
    process.exit(0);
  }, 2000);
});

// Route de déconnexion
app.post("/logout", (req, res) => {
  const username = req.session.username || 'Anonyme';
  console.log(`Déconnexion de l'utilisateur: ${username}`);
  
  req.session.destroy((err) => {
    if (err) {
      console.error("Erreur lors de la déconnexion:", err);
      return res.status(500).send("Erreur lors de la déconnexion");
    }
    res.redirect("/login.html");
  });
});

// Protéger la page d'administration
app.get("/admin.html", isAuthenticated, (req, res) => {
  const adminPath = path.join(PUBLIC_DIR, "admin.html");
  
  fs.access(adminPath, fs.constants.F_OK, (err) => {
    if (err) {
      console.error("Erreur d'accès à admin.html:", err);
      return res.status(404).send("Fichier admin.html non trouvé");
    }
    res.sendFile(adminPath);
  });
});

// Route pour servir des informations sur le serveur (pour le QR code)
app.get("/server-info", (req, res) => {
  const serverInfo = {
    url: `${req.protocol}://${req.get('host')}`,
    name: 'Timer ECOS',
    version: '1.0.0'
  };
  res.json(serverInfo);
});

// Gestion des connexions Socket.IO
io.on("connection", socket => {
  console.log(`Client connecté: ${socket.id}`);

  // Événement de démarrage du timer
  socket.on("start", data => {
    console.log("Démarrage du timer avec la configuration:", {
      prepare: data.prepare,
      work: data.work,
      rest: data.rest,
      cycles: data.cycles,
      sets: data.sets
    });
    
    // Diffuser à tous les clients connectés
    io.emit("start", data);
  });

  // Événement de reset du timer
  socket.on("reset", () => {
    console.log("Reset du timer demandé");
    io.emit("reset");
  });

  // Événement de test audio
  socket.on("audioTest", (audioSettings) => {
    console.log("Test audio demandé avec paramètres:", audioSettings);
    // Diffuser les paramètres audio pour test à tous les clients
    io.emit("audioTest", audioSettings);
  });

  // Événement de terminaison
  socket.on("terminate", () => {
    console.log("Demande de terminaison via Socket.IO");
    io.emit("examTerminated", { terminatedBy: 'Socket.IO' });
    setTimeout(() => {
      console.log("Arrêt du serveur via Socket.IO...");
      process.exit(0);
    }, 2000);
  });

  // Événement de mise à jour des paramètres audio
  socket.on("updateAudioSettings", (audioSettings) => {
    console.log("Mise à jour des paramètres audio:", audioSettings);
    // Diffuser les nouveaux paramètres à tous les clients
    socket.broadcast.emit("audioSettingsUpdated", audioSettings);
  });

  // Gestion de la déconnexion
  socket.on("disconnect", () => {
    console.log(`Client déconnecté: ${socket.id}`);
  });
});

// Middleware de gestion des erreurs
app.use((err, req, res, next) => {
  console.error('Erreur serveur:', err.stack);
  res.status(500).send('Erreur interne du serveur');
});

// Gestion des signaux système pour arrêt propre
process.on('SIGINT', () => {
  console.log('\nSignal SIGINT reçu. Arrêt propre du serveur...');
  server.close(() => {
    console.log('Serveur arrêté proprement.');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('Signal SIGTERM reçu. Arrêt propre du serveur...');
  server.close(() => {
    console.log('Serveur arrêté proprement.');
    process.exit(0);
  });
});

// Configuration du port
const PORT = process.env.PORT || 3000;

// Fonction de démarrage
async function startServer() {
  try {
    // Migrer les mots de passe si nécessaire
    await migratePasswordsIfNeeded();
    
    // Créer la configuration par défaut
    createDefaultConfig();
    
    // Démarrer le serveur
    server.listen(PORT, () => {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🚀 TIMER ECOS - SERVEUR DÉMARRÉ');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`📍 URL principale    : http://localhost:${PORT}`);
      console.log(`⚙️  Administration   : http://localhost:${PORT}/admin.html`);
      console.log(`🔑 Connexion        : http://localhost:${PORT}/login.html`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`📁 Répertoire public : ${PUBLIC_DIR}`);
      console.log(`📄 Configuration    : ${CONFIG_PATH}`);
      console.log(`👥 Utilisateurs     : ${USERS_PATH}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('✅ Fonctionnalités activées :');
      console.log('   • Authentification sécurisée (bcrypt)');
      console.log('   • Audio et annonces vocales');
      console.log('   • Thèmes personnalisables');
      console.log('   • QR Code d\'accès');
      console.log('   • Raccourcis clavier');
      console.log('   • Synchronisation temps réel');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    });
  } catch (error) {
    console.error('❌ Erreur lors du démarrage du serveur:', error);
    process.exit(1);
  }
}

// Lancement du serveur
startServer();
