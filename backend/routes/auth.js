const router = require("express").Router();
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const { OAuth2Client } = require('google-auth-library');

// Google OAuth Client
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID || '534367923011-sejspfqhk9i62fob2i254e25n557vqjv.apps.googleusercontent.com');

// Simple in-memory storage for when MongoDB is not available
let users = [];
const usersFile = path.join(__dirname, "../users.json");

// Load users from file if it exists
if (fs.existsSync(usersFile)) {
  try {
    users = JSON.parse(fs.readFileSync(usersFile, "utf8"));
  } catch (err) {
    console.log("Error loading users file:", err.message);
  }
}

// Save users to file
const saveUsers = () => {
  try {
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
  } catch (err) {
    console.log("Error saving users file:", err.message);
  }
};

// SIGNUP
router.post("/signup", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Check if MongoDB is connected
    if (mongoose.connection.readyState === 1) {
      // Use MongoDB
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      const newUser = new User({
        username,
        email,
        password: hashedPassword,
      });

      const user = await newUser.save();
      return res.status(201).json({ message: "User created successfully", user: { username: user.username, email: user.email } });
    } else {
      // Use file storage
      const existingUser = users.find(u => u.email === email || u.username === username);
      if (existingUser) {
        return res.status(400).json({ message: "Username or email already exists" });
      }

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      const newUser = {
        id: Date.now().toString(),
        username,
        email,
        password: hashedPassword,
        createdAt: new Date().toISOString()
      };

      users.push(newUser);
      saveUsers();

      return res.status(201).json({ message: "User created successfully", user: { username: newUser.username, email: newUser.email } });
    }
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ message: "Server error occurred" });
  }
});

// LOGIN
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    // Check if MongoDB is connected
    if (mongoose.connection.readyState === 1) {
      // Use MongoDB
      const user = await User.findOne({ email });
      if (!user) return res.status(404).json({ message: "User not found" });

      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) return res.status(400).json({ message: "Wrong password" });

      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "1h" });
      return res.status(200).json({ message: "Login successful", user: { username: user.username, email: user.email }, token });
    } else {
      // Use file storage
      const user = users.find(u => u.email === email);
      if (!user) return res.status(404).json({ message: "User not found" });

      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) return res.status(400).json({ message: "Wrong password" });

      const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: "1h" });
      return res.status(200).json({ message: "Login successful", user: { username: user.username, email: user.email }, token });
    }
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error occurred" });
  }
});

// TOKEN VALIDATION
router.get("/validate", async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: "No token provided" });
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix

        // Verify the token
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'ganzakmk');

        // Check if MongoDB is connected
        if (mongoose.connection.readyState === 1) {
            // Use MongoDB
            const user = await User.findById(decoded.id);
            if (!user) {
                return res.status(401).json({ message: "User not found" });
            }
        } else {
            // Use file storage
            const user = users.find(u => u.id === decoded.id);
            if (!user) {
                return res.status(401).json({ message: "User not found" });
            }
        }

        res.status(200).json({ valid: true, message: "Token is valid" });
    } catch (error) {
        console.error("Token validation error:", error);
        res.status(401).json({ message: "Invalid token" });
    }
});

router.post("/google", async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ message: "Google token is required" });
    }

    // Verify Google token
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID || '534367923011-sejspfqhk9i62fob2i254e25n557vqjv.apps.googleusercontent.com',
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    // Check if MongoDB is connected
    if (mongoose.connection.readyState === 1) {
      // Use MongoDB
      let user = await User.findOne({ email });

      if (!user) {
        // Create new user from Google data
        user = new User({
          username: name.replace(/\s+/g, '').toLowerCase() + googleId.slice(-4), // Create unique username
          email,
          password: await bcrypt.hash(Math.random().toString(36), 10), // Random password for Google users
        });
        user = await user.save();
      }

      const jwtToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "1h" });
      return res.status(200).json({
        message: "Google authentication successful",
        user: { username: user.username, email: user.email, avatar: picture },
        token: jwtToken
      });
    } else {
      // Use file storage
      let user = users.find(u => u.email === email);

      if (!user) {
        // Create new user from Google data
        user = {
          id: googleId,
          username: name.replace(/\s+/g, '').toLowerCase() + googleId.slice(-4),
          email,
          password: await bcrypt.hash(Math.random().toString(36), 10),
          avatar: picture,
          createdAt: new Date().toISOString(),
          googleId
        };
        users.push(user);
        saveUsers();
      }

      const jwtToken = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: "1h" });
      return res.status(200).json({
        message: "Google authentication successful",
        user: { username: user.username, email: user.email, avatar: user.avatar },
        token: jwtToken
      });
    }
  } catch (error) {
    console.error("Google auth error:", error);
    res.status(500).json({ message: "Google authentication failed" });
  }
});

module.exports = router;
