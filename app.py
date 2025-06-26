from flask import Flask, request, jsonify, render_template_string
from flask_socketio import SocketIO, emit
from flask_cors import CORS
import json
import os

app = Flask(__name__)
app.config['SECRET_KEY'] = 'exam_timer_secret_key'
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

# Stockage temporaire des données
config_data = {
    'title': 'Examen Universitaire',
    'totalTime': 90,
    'totalQuestions': 20,
    'totalTimeSeconds': 5400
}

questions_data = []
answers_data = {}

# Routes pour la configuration
@app.route('/config', methods=['GET'])
def get_config():
    return jsonify(config_data)

@app.route('/config', methods=['POST'])
def save_config():
    global config_data
    data = request.get_json()
    config_data.update(data)
    return jsonify({'status': 'success', 'message': 'Configuration sauvegardée'})

# Routes pour les questions
@app.route('/questions', methods=['GET'])
def get_questions():
    return jsonify(questions_data)

@app.route('/questions', methods=['POST'])
def save_questions():
    global questions_data
    data = request.get_json()
    questions_data = data.get('questions', [])
    return jsonify({'status': 'success', 'message': f'{len(questions_data)} questions sauvegardées'})

@app.route('/questions/<int:question_id>', methods=['GET'])
def get_question(question_id):
    if 0 <= question_id < len(questions_data):
        return jsonify(questions_data[question_id])
    return jsonify({'error': 'Question non trouvée'}), 404

# Routes pour les réponses
@app.route('/answers', methods=['GET'])
def get_answers():
    return jsonify(answers_data)

@app.route('/answers', methods=['POST'])
def save_answer():
    global answers_data
    data = request.get_json()
    question_id = data.get('question_id')
    answer = data.get('answer')
    
    if question_id is not None:
        answers_data[str(question_id)] = answer
        return jsonify({'status': 'success', 'message': 'Réponse sauvegardée'})
    
    return jsonify({'error': 'Données invalides'}), 400

@app.route('/answers/clear', methods=['POST'])
def clear_answers():
    global answers_data
    answers_data = {}
    return jsonify({'status': 'success', 'message': 'Réponses effacées'})

# Route pour initialiser des questions d'exemple
@app.route('/questions/sample', methods=['POST'])
def create_sample_questions():
    global questions_data
    questions_data = [
        {
            'id': 1,
            'question': 'Quelle est la dérivée de x²?',
            'options': ['x', '2x', 'x²', '2x²'],
            'correct': 1
        },
        {
            'id': 2,
            'question': 'Combien font 2 + 2?',
            'options': ['3', '4', '5', '6'],
            'correct': 1
        },
        {
            'id': 3,
            'question': 'Quelle est la capitale de la France?',
            'options': ['Lyon', 'Marseille', 'Paris', 'Toulouse'],
            'correct': 2
        },
        {
            'id': 4,
            'question': 'Quelle est la racine carrée de 16?',
            'options': ['2', '4', '6', '8'],
            'correct': 1
        },
        {
            'id': 5,
            'question': 'En quelle année a eu lieu la Révolution française?',
            'options': ['1789', '1799', '1804', '1815'],
            'correct': 0
        }
    ]
    return jsonify({'status': 'success', 'message': f'{len(questions_data)} questions d\'exemple créées'})

# WebSocket events
@socketio.on('start')
def handle_start(data):
    print(f'Démarrage de l\'examen: {data}')
    emit('start', data, broadcast=True)

@socketio.on('reset')
def handle_reset():
    print('Réinitialisation de l\'examen')
    global answers_data
    answers_data = {}
    emit('reset', broadcast=True)

@socketio.on('connect')
def handle_connect():
    print('Client connecté')

@socketio.on('disconnect')
def handle_disconnect():
    print('Client déconnecté')

# Route pour servir les fichiers statiques (admin et index)
@app.route('/')
def index():
    return '''
    <h1>Système de Timer d'Examen</h1>
    <p><a href="/admin">Interface d'administration</a></p>
    <p><a href="/exam">Interface d'examen</a></p>
    <p><a href="/questions/sample" onclick="fetch('/questions/sample', {method: 'POST'}); alert('Questions d\\'exemple créées!'); return false;">Créer des questions d'exemple</a></p>
    '''

@app.route('/admin')
def admin():
    try:
        with open('/opt/tabata-sync-server/public/admin.html', 'r', encoding='utf-8') as f:
            return f.read()
    except FileNotFoundError:
        return 'Fichier admin non trouvé', 404

@app.route('/exam')
def exam():
    try:
        with open('/opt/tabata-sync-server/public/index.html', 'r', encoding='utf-8') as f:
            return f.read()
    except FileNotFoundError:
        return 'Fichier index non trouvé', 404

if __name__ == '__main__':
    print("=== Système de Timer d'Examen ===")
    print("Serveur démarré sur http://localhost:5000")
    print("Admin: http://localhost:5000/admin")
    print("Examen: http://localhost:5000/exam")
    print("API Questions: http://localhost:5000/questions")
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)
