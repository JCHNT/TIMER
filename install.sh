#!/bin/bash

# 🚀 Script d'installation Timer ECOS
# Usage: ./install.sh [--production]

set -e  # Arrêter en cas d'erreur

# Couleurs pour l'affichage
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_NAME="timer-ecos"
INSTALL_DIR="/opt/tabata-sync-server"
SERVICE_NAME="timer-ecos"
NGINX_SITE="timer-ecos"
DEFAULT_PORT=3000

# Détection du mode
PRODUCTION_MODE=false
if [[ "$1" == "--production" ]]; then
    PRODUCTION_MODE=true
fi

# Fonctions utilitaires
print_header() {
    echo -e "${BLUE}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🚀 INSTALLATION TIMER ECOS"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${NC}"
}

print_step() {
    echo -e "${YELLOW}📋 $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Vérifications préalables
check_requirements() {
    print_step "Vérification des prérequis..."
    
    # Vérifier Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js n'est pas installé. Veuillez l'installer d'abord."
        echo "sudo apt update && sudo apt install nodejs npm"
        exit 1
    fi
    
    # Vérifier npm
    if ! command -v npm &> /dev/null; then
        print_error "npm n'est pas installé."
        exit 1
    fi
    
    # Vérifier la version de Node.js
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 16 ]; then
        print_error "Node.js version 16+ requis. Version actuelle: $(node -v)"
        exit 1
    fi
    
    print_success "Prérequis validés (Node.js $(node -v), npm $(npm -v))"
}

# Création de l'utilisateur système
create_system_user() {
    if $PRODUCTION_MODE; then
        print_step "Création de l'utilisateur système..."
        
        if ! id "timer-ecos" &>/dev/null; then
            sudo useradd -r -s /bin/false -d $INSTALL_DIR timer-ecos
            print_success "Utilisateur 'timer-ecos' créé"
        else
            print_info "Utilisateur 'timer-ecos' existe déjà"
        fi
    fi
}

# Création des répertoires
create_directories() {
    print_step "Création de la structure des répertoires..."
    
    if $PRODUCTION_MODE; then
        sudo mkdir -p $INSTALL_DIR/{public,logs,data}
        sudo mkdir -p /etc/systemd/system
    else
        mkdir -p {public,logs,data,config,scripts,docs}
    fi
    
    print_success "Répertoires créés"
}

# Installation des fichiers
install_files() {
    print_step "Installation des fichiers..."
    
    if $PRODUCTION_MODE; then
        # Copier les fichiers vers le répertoire de production
        sudo cp server.js $INSTALL_DIR/
        sudo cp package.json $INSTALL_DIR/
        sudo cp create-user.js $INSTALL_DIR/
        sudo cp public/*.html $INSTALL_DIR/public/
        
        # Créer le fichier de configuration par défaut
        echo '{"title":"TIMER ECOS","prepare":10,"work":20,"rest":10,"cycles":8,"sets":1,"restBetweenSets":0,"coolDown":0,"workDescription":"","restDescription":""}' | sudo tee $INSTALL_DIR/public/config.json > /dev/null
        
        # Permissions
        sudo chown -R timer-ecos:timer-ecos $INSTALL_DIR
        sudo chmod 755 $INSTALL_DIR
        sudo chmod 644 $INSTALL_DIR/*.js $INSTALL_DIR/package.json
        sudo chmod 755 $INSTALL_DIR/create-user.js
        sudo chmod -R 644 $INSTALL_DIR/public
        sudo chmod 600 $INSTALL_DIR/data 2>/dev/null || true
        
    else
        # Mode développement - rester dans le répertoire courant
        print_info "Mode développement - fichiers gardés dans le répertoire courant"
    fi
    
    print_success "Fichiers installés"
}

# Installation des dépendances
install_dependencies() {
    print_step "Installation des dépendances npm..."
    
    if $PRODUCTION_MODE; then
        cd $INSTALL_DIR
        sudo -u timer-ecos npm install --production
    else
        npm install
    fi
    
    print_success "Dépendances installées"
}

# Création du premier utilisateur
create_first_user() {
    print_step "Création du premier utilisateur admin..."
    
    # Demander les credentials à l'utilisateur
    echo -n "Nom d'utilisateur admin [admin]: "
    read ADMIN_USER
    ADMIN_USER=${ADMIN_USER:-admin}
    
    echo -n "Mot de passe admin [admin123]: "
    read -s ADMIN_PASS
    ADMIN_PASS=${ADMIN_PASS:-admin123}
    echo
    
    if $PRODUCTION_MODE; then
        cd $INSTALL_DIR
        sudo -u timer-ecos node create-user.js create "$ADMIN_USER" "$ADMIN_PASS"
    else
        node create-user.js create "$ADMIN_USER" "$ADMIN_PASS"
    fi
    
    print_success "Utilisateur admin créé: $ADMIN_USER"
}

# Configuration du service systemd
setup_systemd_service() {
    if $PRODUCTION_MODE; then
        print_step "Configuration du service systemd..."
        
        sudo tee /etc/systemd/system/$SERVICE_NAME.service > /dev/null <<EOF
[Unit]
Description=Timer ECOS Application
After=network.target

[Service]
Type=simple
User=timer-ecos
Group=timer-ecos
WorkingDirectory=$INSTALL_DIR
Environment=NODE_ENV=production
Environment=BASE_DIR=$INSTALL_DIR
Environment=PORT=$DEFAULT_PORT
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=10
StandardOutput=append:/var/log/$SERVICE_NAME.log
StandardError=append:/var/log/$SERVICE_NAME.error.log

# Sécurité
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=$INSTALL_DIR

[Install]
WantedBy=multi-user.target
EOF
        
        sudo systemctl daemon-reload
        sudo systemctl enable $SERVICE_NAME
        
        print_success "Service systemd configuré"
    fi
}

# Configuration Nginx (optionnel)
setup_nginx() {
    if $PRODUCTION_MODE && command -v nginx &> /dev/null; then
        echo -n "Configurer Nginx comme proxy reverse? [y/N]: "
        read SETUP_NGINX
        
        if [[ "$SETUP_NGINX" =~ ^[Yy]$ ]]; then
            print_step "Configuration de Nginx..."
            
            echo -n "Nom de domaine [timer-ecos.local]: "
            read DOMAIN_NAME
            DOMAIN_NAME=${DOMAIN_NAME:-timer-ecos.local}
            
            sudo tee /etc/nginx/sites-available/$NGINX_SITE > /dev/null <<EOF
server {
    listen 80;
    server_name $DOMAIN_NAME;
    
    # Logs
    access_log /var/log/nginx/${NGINX_SITE}_access.log;
    error_log /var/log/nginx/${NGINX_SITE}_error.log;
    
    # Proxy vers l'application
    location / {
        proxy_pass http://localhost:$DEFAULT_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    # Support spécifique pour Socket.IO
    location /socket.io/ {
        proxy_pass http://localhost:$DEFAULT_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    
    # Sécurité
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
}
EOF
            
            sudo ln -sf /etc/nginx/sites-available/$NGINX_SITE /etc/nginx/sites-enabled/
            sudo nginx -t && sudo systemctl reload nginx
            
            print_success "Nginx configuré pour $DOMAIN_NAME"
        fi
    fi
}

# Démarrage du service
start_service() {
    print_step "Démarrage du service..."
    
    if $PRODUCTION_MODE; then
        sudo systemctl start $SERVICE_NAME
        
        # Vérifier le statut
        if sudo systemctl is-active --quiet $SERVICE_NAME; then
            print_success "Service démarré avec succès"
        else
            print_error "Échec du démarrage du service"
            sudo systemctl status $SERVICE_NAME
            exit 1
        fi
    else
        print_info "Mode développement - démarrer avec: npm start"
    fi
}

# Affichage des informations finales
show_final_info() {
    print_step "Installation terminée !"
    
    echo -e "${GREEN}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🎉 TIMER ECOS INSTALLÉ AVEC SUCCÈS"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${NC}"
    
    if $PRODUCTION_MODE; then
        echo -e "${BLUE}📍 URLs d'accès:${NC}"
        echo "   🌐 Timer principal : http://localhost:$DEFAULT_PORT"
        echo "   ⚙️  Administration : http://localhost:$DEFAULT_PORT/admin.html"
        echo "   🔑 Connexion      : http://localhost:$DEFAULT_PORT/login.html"
        echo
        echo -e "${BLUE}🔧 Gestion du service:${NC}"
        echo "   sudo systemctl start $SERVICE_NAME"
        echo "   sudo systemctl stop $SERVICE_NAME"
        echo "   sudo systemctl restart $SERVICE_NAME"
        echo "   sudo systemctl status $SERVICE_NAME"
        echo
        echo -e "${BLUE}👥 Gestion des utilisateurs:${NC}"
        echo "   cd $INSTALL_DIR"
        echo "   sudo -u timer-ecos node create-user.js interactive"
        echo
        echo -e "${BLUE}📊 Logs:${NC}"
        echo "   sudo journalctl -u $SERVICE_NAME -f"
        echo "   tail -f /var/log/$SERVICE_NAME.log"
        
    else
        echo -e "${BLUE}📍 Développement:${NC}"
        echo "   npm start                    # Démarrer l'application"
        echo "   node create-user.js interactive  # Gérer les utilisateurs"
        echo "   http://localhost:$DEFAULT_PORT    # Accéder à l'application"
    fi
    
    echo -e "${BLUE}🔐 Compte admin créé:${NC}"
    echo "   Utilisateur: $ADMIN_USER"
    echo "   Mot de passe: [celui que vous avez saisi]"
    echo
    echo -e "${YELLOW}⚠️  N'oubliez pas de changer le mot de passe par défaut !${NC}"
}

# Fonction principale
main() {
    print_header
    
    # Vérifier les permissions
    if $PRODUCTION_MODE && [ "$EUID" -ne 0 ]; then
        print_error "Ce script doit être exécuté avec sudo en mode production"
        echo "Usage: sudo ./install.sh --production"
        exit 1
    fi
    
    check_requirements
    create_system_user
    create_directories
    install_files
    install_dependencies
    create_first_user
    setup_systemd_service
    setup_nginx
    start_service
    show_final_info
}

# Gestion des erreurs
trap 'print_error "Installation interrompue"; exit 1' INT TERM

# Lancement
main "$@"
# Fin du script
