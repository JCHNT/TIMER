// create-user.js
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Configuration
const BASE_DIR = process.env.BASE_DIR || "/opt/tabata-sync-server";
const USERS_PATH = path.join(BASE_DIR, "users.json");
const SALT_ROUNDS = 12;

async function createUser(username, password) {
    try {
        // Vérifier si le nom d'utilisateur existe déjà
        let users = [];
        if (fs.existsSync(USERS_PATH)) {
            const data = fs.readFileSync(USERS_PATH, 'utf8');
            users = JSON.parse(data);
            
            if (users.find(u => u.username === username)) {
                console.log(`❌ L'utilisateur '${username}' existe déjà.`);
                return false;
            }
        }
        
        // Hacher le mot de passe
        console.log('🔐 Hachage du mot de passe...');
        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
        
        // Ajouter le nouvel utilisateur
        users.push({ username, password: hashedPassword });
        
        // Créer le répertoire si nécessaire
        const dir = path.dirname(USERS_PATH);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        // Sauvegarder
        fs.writeFileSync(USERS_PATH, JSON.stringify(users, null, 2));
        console.log(`✅ Utilisateur '${username}' créé avec succès !`);
        console.log(`📁 Fichier sauvegardé : ${USERS_PATH}`);
        return true;
        
    } catch (error) {
        console.error('❌ Erreur lors de la création de l\'utilisateur :', error.message);
        return false;
    }
}

async function listUsers() {
    try {
        if (!fs.existsSync(USERS_PATH)) {
            console.log('📝 Aucun fichier d\'utilisateurs trouvé.');
            return;
        }
        
        const data = fs.readFileSync(USERS_PATH, 'utf8');
        const users = JSON.parse(data);
        
        console.log('\n👥 Utilisateurs existants :');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        users.forEach((user, index) => {
            console.log(`${index + 1}. ${user.username}`);
        });
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        
    } catch (error) {
        console.error('❌ Erreur lors de la lecture des utilisateurs :', error.message);
    }
}

async function deleteUser(username) {
    try {
        if (!fs.existsSync(USERS_PATH)) {
            console.log('📝 Aucun fichier d\'utilisateurs trouvé.');
            return false;
        }
        
        const data = fs.readFileSync(USERS_PATH, 'utf8');
        let users = JSON.parse(data);
        
        const initialLength = users.length;
        users = users.filter(u => u.username !== username);
        
        if (users.length === initialLength) {
            console.log(`❌ Utilisateur '${username}' non trouvé.`);
            return false;
        }
        
        fs.writeFileSync(USERS_PATH, JSON.stringify(users, null, 2));
        console.log(`✅ Utilisateur '${username}' supprimé avec succès !`);
        return true;
        
    } catch (error) {
        console.error('❌ Erreur lors de la suppression :', error.message);
        return false;
    }
}

async function changePassword(username, newPassword) {
    try {
        if (!fs.existsSync(USERS_PATH)) {
            console.log('📝 Aucun fichier d\'utilisateurs trouvé.');
            return false;
        }
        
        const data = fs.readFileSync(USERS_PATH, 'utf8');
        let users = JSON.parse(data);
        
        const user = users.find(u => u.username === username);
        if (!user) {
            console.log(`❌ Utilisateur '${username}' non trouvé.`);
            return false;
        }
        
        console.log('🔐 Hachage du nouveau mot de passe...');
        const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
        user.password = hashedPassword;
        
        fs.writeFileSync(USERS_PATH, JSON.stringify(users, null, 2));
        console.log(`✅ Mot de passe de '${username}' modifié avec succès !`);
        return true;
        
    } catch (error) {
        console.error('❌ Erreur lors du changement de mot de passe :', error.message);
        return false;
    }
}

function showHelp() {
    console.log(`
🚀 Gestionnaire d'utilisateurs Timer ECOS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 Utilisation :
   node create-user.js [commande] [options]

🔧 Commandes disponibles :
   create <nom> <motdepasse>    Créer un nouvel utilisateur
   list                         Lister tous les utilisateurs
   delete <nom>                 Supprimer un utilisateur
   password <nom> <nouveau>     Changer le mot de passe
   interactive                  Mode interactif
   help                         Afficher cette aide

📝 Exemples :
   node create-user.js create admin motdepasse123
   node create-user.js list
   node create-user.js delete ancien_user
   node create-user.js password admin nouveau_motdepasse
   node create-user.js interactive

📁 Fichier des utilisateurs : ${USERS_PATH}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

async function interactiveMode() {
    console.log('\n🎯 Mode interactif - Gestionnaire d\'utilisateurs');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const askQuestion = (question) => {
        return new Promise((resolve) => {
            rl.question(question, (answer) => {
                resolve(answer.trim());
            });
        });
    };
    
    try {
        const action = await askQuestion('Que voulez-vous faire ? (create/list/delete/password/quit) : ');
        
        switch (action.toLowerCase()) {
            case 'create':
                const username = await askQuestion('Nom d\'utilisateur : ');
                const password = await askQuestion('Mot de passe : ');
                if (username && password) {
                    await createUser(username, password);
                } else {
                    console.log('❌ Nom d\'utilisateur et mot de passe requis.');
                }
                break;
                
            case 'list':
                await listUsers();
                break;
                
            case 'delete':
                await listUsers();
                const userToDelete = await askQuestion('Nom d\'utilisateur à supprimer : ');
                if (userToDelete) {
                    const confirm = await askQuestion(`Êtes-vous sûr de vouloir supprimer '${userToDelete}' ? (oui/non) : `);
                    if (confirm.toLowerCase() === 'oui') {
                        await deleteUser(userToDelete);
                    } else {
                        console.log('❌ Suppression annulée.');
                    }
                }
                break;
                
            case 'password':
                await listUsers();
                const userToUpdate = await askQuestion('Nom d\'utilisateur : ');
                const newPassword = await askQuestion('Nouveau mot de passe : ');
                if (userToUpdate && newPassword) {
                    await changePassword(userToUpdate, newPassword);
                } else {
                    console.log('❌ Nom d\'utilisateur et nouveau mot de passe requis.');
                }
                break;
                
            case 'quit':
                console.log('👋 Au revoir !');
                rl.close();
                return;
                
            default:
                console.log('❌ Action non reconnue. Utilisez : create, list, delete, password, ou quit');
        }
        
        // Proposer de continuer
        const continueWork = await askQuestion('\nVoulez-vous effectuer une autre action ? (oui/non) : ');
        if (continueWork.toLowerCase() === 'oui') {
            await interactiveMode();
        } else {
            console.log('👋 Au revoir !');
            rl.close();
        }
        
    } catch (error) {
        console.error('❌ Erreur dans le mode interactif :', error.message);
        rl.close();
    }
}

// Traitement des arguments de ligne de commande
async function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0 || args[0] === 'help') {
        showHelp();
        return;
    }
    
    const command = args[0];
    
    switch (command) {
        case 'create':
            if (args.length < 3) {
                console.log('❌ Usage: node create-user.js create <nom> <motdepasse>');
                return;
            }
            await createUser(args[1], args[2]);
            break;
            
        case 'list':
            await listUsers();
            break;
            
        case 'delete':
            if (args.length < 2) {
                console.log('❌ Usage: node create-user.js delete <nom>');
                return;
            }
            await deleteUser(args[1]);
            break;
            
        case 'password':
            if (args.length < 3) {
                console.log('❌ Usage: node create-user.js password <nom> <nouveau_motdepasse>');
                return;
            }
            await changePassword(args[1], args[2]);
            break;
            
        case 'interactive':
            await interactiveMode();
            return; // Le mode interactif gère sa propre fermeture
            
        default:
            console.log(`❌ Commande '${command}' non reconnue.`);
            showHelp();
    }
    
    rl.close();
}

// Gestion des erreurs globales
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Erreur non gérée :', reason);
    rl.close();
    process.exit(1);
});

process.on('SIGINT', () => {
    console.log('\n👋 Arrêt du programme...');
    rl.close();
    process.exit(0);
});

// Lancement du programme
main().catch(error => {
    console.error('❌ Erreur fatale :', error.message);
    rl.close();
    process.exit(1);
});
