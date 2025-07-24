#!/bin/bash

# Créer les répertoires nécessaires
mkdir -p config data

# Copier le fichier .env si nécessaire
if [ ! -f .env ]; then
    cp .env.example .env
    echo "⚠️  Fichier .env créé. Veuillez le configurer avant de continuer."
    exit 1
fi

# Construire et démarrer les conteneurs
docker-compose up -d --build

# Afficher les logs
docker-compose logs -f
