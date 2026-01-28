require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const authRoutes = require("./routes/auth");

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;

// Middlewares
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5000', 'http://localhost', 'http://127.0.0.1', '*'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Connect to MongoDB
mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch(err => {
    console.log("❌ MongoDB error:", err.message);
    console.log("⚠️  Running in offline mode - authentication will not persist");
  });

// Routes
app.use("/api/auth", authRoutes);

// Serve static files from Leagues folder
app.use('/Leagues', express.static('../Leagues'));

// Serve static files from public folder
app.use('/public', express.static('../public'));

// Serve static files from root directory
app.use(express.static('../'));

// Test route
app.get("/", (req, res) => {
  res.sendFile(__dirname + '/../Leagues/index.html');
});

// 404 handler
app.use((req, res) => {
  res.status(404).sendFile(__dirname + '/../public/404.html');
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Backend running on http://localhost:${PORT}`);
});
