require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/folders', require('./routes/folders'));
app.use('/api/files', require('./routes/files'));
app.use('/api/labels', require('./routes/labels'));
app.use('/api/templates', require('./routes/templates'));
app.use('/api/ctops', require('./routes/ctops'));
app.use('/api/search', require('./routes/search'));

// Local file download route (for local storage mode)
const { getAbsolutePath } = require('./services/storage');
app.get('/api/storage/download', (req, res) => {
  try {
    const key = req.query.key;
    if (!key) return res.status(400).json({ error: 'key is required' });
    const filePath = getAbsolutePath(key);
    res.download(filePath);
  } catch (err) {
    res.status(404).json({ error: 'File not found' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// SPA fallback - serve index.html for non-API routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

app.listen(PORT, () => {
  console.log(`PID-Builder server running on port ${PORT}`);
});

module.exports = app;
