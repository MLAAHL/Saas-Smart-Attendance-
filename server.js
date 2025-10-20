require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const compression = require("compression");

const app = express();
const PORT = process.env.PORT || 8080;
const MONGODB_URI = process.env.MONGODB_URI;

// ===== Middleware =====
app.use(compression());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

const corsOptions = {
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
};
app.use(cors(corsOptions));

// ===== NO CACHE HEADERS =====
app.use((req, res, next) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  });
  next();
});

// ===== MongoDB Connection =====
mongoose.connect(MONGODB_URI, {
  maxPoolSize: 20,
  serverSelectionTimeoutMS: 5000
})
  .then(() => {
    console.log("✅ MongoDB connected");
    app.locals.db = mongoose.connection.db;
  })
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// Database middleware
app.use((req, res, next) => {
  if (!req.app.locals.db && mongoose.connection.db) {
    req.app.locals.db = mongoose.connection.db;
  }
  req.db = req.app.locals.db;
  next();
});

// ===== Routes =====
const teacherRoutes = require("./routes/teacherRoutes");
const streamRoutes = require("./routes/streamRoutes");
const attendanceRoutes = require("./routes/attendanceRoutes");
const studentsRoutes = require("./routes/students");
const reportsRoutes = require('./routes/reports');
const viewAttendanceRoutes = require('./routes/viewAttendanceRoutes');
const promotionRoutes = require('./routes/promotion');

// ✅ REGISTER ROUTES - Make sure this line is correct
app.use('/', promotionRoutes);
// Mount routes - MAKE SURE THIS IS CORRECT
app.use('/api', viewAttendanceRoutes); 
// Mount routes
app.use('/api/reports', reportsRoutes);

// ✅ Mount routes in correct order
app.use("/api/teacher", teacherRoutes);
app.use("/api/students", studentsRoutes);
app.use("/api", attendanceRoutes);
app.use("/api", streamRoutes);

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? "Connected" : "Disconnected",
    database: mongoose.connection.db?.databaseName
  });
});

// ===== Static HTML routes (NO CACHE) =====
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "login.html")));
app.get("/login.html", (req, res) => res.sendFile(path.join(__dirname, "public", "login.html")));
app.get("/myclass.html", (req, res) => res.sendFile(path.join(__dirname, "public", "myclass.html")));
app.get("/index.html", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/students.html", (req, res) => res.sendFile(path.join(__dirname, "public", "students.html")));
app.get("/view-attendance.html", (req, res) => res.sendFile(path.join(__dirname, "public", "view-attendance.html")));

// ===== Static files with NO CACHE =====
app.use(express.static(path.join(__dirname, "public"), {
  maxAge: 0,
  etag: false,
  lastModified: false,
  setHeaders: (res, path) => {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
  }
}));

// Fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// ===== Start server =====
app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log('='.repeat(60));
  console.log('📍 Available routes:');
  console.log(`   Health:       http://localhost:${PORT}/health`);
  console.log(`   Students API: http://localhost:${PORT}/api/students/all`);
  console.log(`   Students UI:  http://localhost:${PORT}/students.html`);
  console.log(`   Attendance:   http://localhost:${PORT}/view-attendance.html`);
  console.log('='.repeat(60));
  console.log('⚠️  Caching DISABLED for all static files');
  console.log('='.repeat(60));
});
