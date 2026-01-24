require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const authRoutes = require("./routes/auth");

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;

// Middlewares
app.use(cors());
app.use(express.json());

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
  res.send("Backend irimo gukora neza 🚀");
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Backend running on http://localhost:${PORT}`);
});
