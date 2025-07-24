x# Utiliser une image Node.js Alpine pour la légèreté
FROM node:18-alpine

# Installer dumb-init pour une meilleure gestion des processus
RUN apk add --no-cache dumb-init

# Créer un utilisateur non-root pour la sécurité
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Définir le répertoire de travail
WORKDIR /app

# Copier les fichiers de dépendances
COPY package*.json ./

# Installer les dépendances
RUN npm ci --only=production && npm cache clean --force

# Copier le reste de l'application
COPY --chown=nodejs:nodejs . .

# Créer les répertoires nécessaires et définir les permissions
RUN mkdir -p /app/public && \
    chown -R nodejs:nodejs /app

# Exposer le port
EXPOSE 3000

# Utiliser l'utilisateur non-root
USER nodejs

# Variables d'environnement par défaut
ENV NODE_ENV=production \
    PORT=3000 \
    BASE_DIR=/app

# Utiliser dumb-init pour gérer les signaux correctement
ENTRYPOINT ["dumb-init", "--"]

# Commande de démarrage
CMD ["node", "server.js"]
