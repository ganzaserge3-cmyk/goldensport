const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');

const JWT_SECRET = process.env.JWT_SECRET || 'ganzakmk';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '534367923011-sejspfqhk9i62fob2i254e25n557vqjv.apps.googleusercontent.com';
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

const usersFilePath = path.join(process.cwd(), 'backend', 'users.json');

// In-memory fallback for Vercel (serverless filesystem is read-only)
let usersCache = null;

const readUsers = () => {
  try {
    if (usersCache) return usersCache;
    if (fs.existsSync(usersFilePath)) {
      usersCache = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
      return usersCache;
    }
  } catch (e) {
    console.error('readUsers error', e.message);
  }
  return usersCache || [];
};

const writeUsers = (users) => {
  usersCache = users;
  try {
    fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2));
  } catch (e) {
    // Fail silently on Vercel (read-only fs) - data persists in-memory for the request
    console.warn('writeUsers: filesystem read-only (Vercel). Using in-memory cache.');
  }
};

const getBody = async (req) => {
  if (req.body) return req.body;
  return new Promise((resolve) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); }
    });
  });
};

module.exports = async (req, res) => {
  try {
    const slug = Array.isArray(req.query.slug) ? req.query.slug : (req.query.slug ? [req.query.slug] : []);
    const action = slug[0] || '';
    const method = req.method.toUpperCase();

    if (action === 'signup' && method === 'POST') {
      const { username, email, password } = await getBody(req);
      if (!username || !email || !password) return res.status(400).json({ message: 'All fields are required' });

      const users = readUsers();
      if (users.find(u => u.email === email || u.username === username)) return res.status(400).json({ message: 'Username or email exists' });

      const salt = await bcrypt.genSalt(10);
      const hashed = await bcrypt.hash(password, salt);
      const newUser = { id: Date.now().toString(), username, email, password: hashed, createdAt: new Date().toISOString() };
      users.push(newUser);
      writeUsers(users);
      const token = jwt.sign({ id: newUser.id }, JWT_SECRET, { expiresIn: '1h' });
      return res.status(201).json({ message: 'User created', user: { username: newUser.username, email: newUser.email }, token });
    }

    if (action === 'login' && method === 'POST') {
      const { email, password } = await getBody(req);
      if (!email || !password) return res.status(400).json({ message: 'Email and password required' });
      const users = readUsers();
      const user = users.find(u => u.email === email);
      if (!user) return res.status(404).json({ message: 'User not found' });
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) return res.status(400).json({ message: 'Wrong password' });
      const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '1h' });
      return res.status(200).json({ message: 'Login successful', user: { username: user.username, email: user.email }, token });
    }

    if (action === 'validate' && method === 'GET') {
      const auth = req.headers.authorization || '';
      if (!auth.startsWith('Bearer ')) return res.status(401).json({ message: 'No token' });
      const token = auth.substring(7);
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const users = readUsers();
        const user = users.find(u => u.id === decoded.id);
        if (!user) return res.status(401).json({ message: 'User not found' });
        return res.status(200).json({ valid: true });
      } catch (e) {
        return res.status(401).json({ message: 'Invalid token' });
      }
    }

    if (action === 'google' && method === 'POST') {
      const { token } = await getBody(req);
      if (!token) return res.status(400).json({ message: 'Google token required' });
      try {
        const ticket = await googleClient.verifyIdToken({ idToken: token, audience: GOOGLE_CLIENT_ID });
        const payload = ticket.getPayload();
        const { sub: googleId, email, name, picture } = payload;
        const users = readUsers();
        let user = users.find(u => u.email === email);
        if (!user) {
          user = { id: googleId, username: (name || 'user').replace(/\s+/g,'').toLowerCase()+googleId.slice(-4), email, password: await bcrypt.hash(Math.random().toString(36), 10), avatar: picture, createdAt: new Date().toISOString() };
          users.push(user);
          writeUsers(users);
        }
        const jwtToken = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '1h' });
        return res.status(200).json({ message: 'Google auth', user: { username: user.username, email: user.email, avatar: user.avatar || picture }, token: jwtToken });
      } catch (e) {
        console.error('google verify error', e.message);
        return res.status(500).json({ message: 'Google authentication failed' });
      }
    }

    return res.status(404).json({ message: 'Not found' });
  } catch (err) {
    console.error('auth function error', err);
    return res.status(500).json({ message: 'Server error' });
  }
};
