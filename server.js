const express = require('express');
const cors = require('cors');
const http = require('http');
require('dotenv').config();
const path = require('path');

const authRoutes = require('./routes/authRoutes');
const suratRoutes = require('./routes/suratRoutes');
const logRoutes = require('./routes/logRoutes');
const userRoutes = require('./routes/userRoutes');
const folderRoutes = require('./routes/folderRoutes');
const documentRoutes = require('./routes/documentRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const { initWebSocket } = require('./websocket');

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads'))); // <--- ini penting buat serve file

// Middleware logging yang lebih sederhana
app.use((req, res, next) => {
  // Hanya log endpoint penting dan error saja
  if (req.url.includes('/api/surat') && 
      (req.method !== 'GET' || req.url.includes('/status') || process.env.DEBUG_API === 'true')) {
    console.log(`[${ new Date().toISOString() }] ${req.method} ${req.url}`);
    
    // Log headers hanya jika dalam mode debug
    if (process.env.DEBUG_API === 'true') {
      console.log(`Headers: ${JSON.stringify(req.headers)}`);
    }
  }
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/surat', suratRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/users', userRoutes);
app.use('/api/folders', folderRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/notifications', notificationRoutes);

// Error handling
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] 404 - Not Found: ${req.method} ${req.url}`);
  res.status(404).json({ 
    error: 'Not Found',
    message: `Route tidak ditemukan: ${req.method} ${req.url}` 
  });
});

app.use((err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] Error:`, err);
  res.status(500).json({ 
    error: 'Internal Server Error',
    message: err.message 
  });
});

initWebSocket(server);

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
