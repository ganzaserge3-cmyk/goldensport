import os
import json
import uuid
from pathlib import Path
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import bcrypt
import jwt

# Config
JWT_SECRET = os.environ.get('JWT_SECRET', 'ganzakmk')
PORT = int(os.environ.get('PORT', 3000))

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent
USERS_FILE = BASE_DIR / 'users.json'

# Helpers
def read_users():
    try:
        if USERS_FILE.exists():
            return json.loads(USERS_FILE.read_text(encoding='utf-8'))
    except Exception:
        return []
    return []

def write_users(users):
    try:
        USERS_FILE.write_text(json.dumps(users, indent=2), encoding='utf-8')
    except Exception as e:
        # If filesystem is read-only, just keep data in memory (best-effort)
        print('write_users error:', e)

# Flask app
app = Flask(__name__, static_folder=str(BASE_DIR / 'public'))
CORS(app)

@app.route('/api/auth/signup', methods=['POST'])
def signup():
    data = request.get_json() or {}
    username = data.get('username')
    email = data.get('email')
    password = data.get('password')

    if not username or not email or not password:
        return jsonify({'message': 'All fields are required'}), 400

    users = read_users()
    if any(u for u in users if u.get('email') == email or u.get('username') == username):
        return jsonify({'message': 'Username or email already exists'}), 400

    hashed = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    new_user = {
        'id': str(uuid.uuid4()),
        'username': username,
        'email': email,
        'password': hashed,
        'createdAt': None
    }
    users.append(new_user)
    write_users(users)

    token = jwt.encode({'id': new_user['id']}, JWT_SECRET, algorithm='HS256')
    return jsonify({'message': 'User created successfully', 'user': {'username': username, 'email': email}, 'token': token}), 201

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    email = data.get('email')
    password = data.get('password')

    if not email or not password:
        return jsonify({'message': 'Email and password are required'}), 400

    users = read_users()
    user = next((u for u in users if u.get('email') == email), None)
    if not user:
        return jsonify({'message': 'User not found'}), 404

    if not bcrypt.checkpw(password.encode('utf-8'), user['password'].encode('utf-8')):
        return jsonify({'message': 'Wrong password'}), 400

    token = jwt.encode({'id': user['id']}, JWT_SECRET, algorithm='HS256')
    return jsonify({'message': 'Login successful', 'user': {'username': user['username'], 'email': user['email']}, 'token': token}), 200

# Simple placeholder for Google auth (accepts email in body if provided)
@app.route('/api/auth/google', methods=['POST'])
def google_auth():
    data = request.get_json() or {}
    email = data.get('email') or data.get('token')
    name = data.get('name', 'googleuser')

    if not email:
        return jsonify({'message': 'Google token/email is required'}), 400

    users = read_users()
    user = next((u for u in users if u.get('email') == email), None)
    if not user:
        # create user
        new_user = {
            'id': str(uuid.uuid4()),
            'username': name.replace(' ', '').lower() + (str(uuid.uuid4())[-6:]),
            'email': email,
            'password': bcrypt.hashpw(os.urandom(8), bcrypt.gensalt()).decode('utf-8')
        }
        users.append(new_user)
        write_users(users)
        user = new_user

    token = jwt.encode({'id': user['id']}, JWT_SECRET, algorithm='HS256')
    return jsonify({'message': 'Google authentication successful', 'user': {'username': user['username'], 'email': user['email']}, 'token': token}), 200

# Static files serving (mirrors Node static behavior)
@app.route('/public/<path:filename>')
def public_files(filename):
    return send_from_directory(str(BASE_DIR / 'public'), filename)

@app.route('/Leagues/<path:filename>')
def leagues_files(filename):
    return send_from_directory(str(BASE_DIR / 'Leagues'), filename)

@app.route('/', methods=['GET'])
def root_index():
    return send_from_directory(str(BASE_DIR / 'Leagues'), 'index.html')

if __name__ == '__main__':
    print(f"Starting Flask auth fallback on http://0.0.0.0:{PORT}")
    app.run(host='0.0.0.0', port=PORT)
