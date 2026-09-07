/**
 * JANSEVA.AI — Express Server
 * Entry point for the backend API.
 *
 * Architecture note: Services are initialized here at startup.
 * Future voice/ESP32/MQTT services will be initialized the same way.
 */

require('dotenv').config();

// ── Global error safety (prevents nodemon crash on bad API key) ───────────────
process.on('unhandledRejection', (reason) => {
  console.error('⚠️  Unhandled Rejection (safe catch):', reason?.message || reason);
});
process.on('uncaughtException', (err) => {
  console.error('⚠️  Uncaught Exception (safe catch):', err.message);
});

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const rateLimit  = require('express-rate-limit');
const path       = require('path');

const chatRoutes                     = require('./routes/chat');
const deviceRoutes                   = require('./routes/device');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const geminiService                  = require('./services/geminiService');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Security & Logging ────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // Relaxed for dev; tighten in production
}));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:5500',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5500',
  'http://127.0.0.1:3000',
  'null', // For file:// protocol during local development
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (ESP32 hardware, mobile apps, curl)
    // and allow GitHub Pages, localhost, and custom frontend domains
    if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.github.io') || origin.includes('localhost') || origin.includes('127.0.0.1')) {
      callback(null, true);
    } else {
      // In citizen kiosk architecture, allow all origins for transparent hardware sync
      callback(null, true);
    }
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-Id', 'X-Requested-With', 'Range'],
  exposedHeaders: ['Content-Length', 'Content-Type', 'X-Audio-Format'],
  credentials: true,
}));

// ── Body Parsing ──────────────────────────────────────────────────────────────
app.use(express.raw({ type: ['audio/*', 'application/octet-stream'], limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Rate Limiting ─────────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 min
  max:      parseInt(process.env.RATE_LIMIT_MAX)        || 200,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT',
      message: 'Too many requests. Please wait before trying again.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);

// ── Static Frontend ───────────────────────────────────────────────────────────
// Serve the frontend from the backend so you can open just localhost:3000
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api', chatRoutes);
app.use('/api/device', deviceRoutes);

// ── Root Health ───────────────────────────────────────────────────────────────
app.get('/api', (req, res) => {
  res.json({
    service: 'JANSEVA.AI Backend',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      chat:           'POST /api/chat',
      health:         'GET  /api/health',
      newConversation:'POST /api/conversation/new',
      conversations:  'GET  /api/conversations',
    },
  });
});

// ── Serve Frontend for SPA (catch-all) ───────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

// ── Error Handlers ────────────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ── Startup ───────────────────────────────────────────────────────────────────
async function start() {
  console.log('\n🇮🇳  JANSEVA.AI — Starting...\n');

  // Initialize Gemini (will throw if API key is missing)
  try {
    geminiService.initialize();
  } catch (err) {
    console.error(`❌ Gemini initialization failed: ${err.message}`);
    console.error('   → Set GEMINI_API_KEY in your .env file and restart.\n');
    // Don't crash — let the server start so the UI shows a config error
  }

  app.listen(PORT, () => {
    console.log(`\n✅ JANSEVA.AI Backend running on http://localhost:${PORT}`);
    console.log(`   Frontend:  http://localhost:${PORT}`);
    console.log(`   API Base:  http://localhost:${PORT}/api`);
    console.log(`   Health:    http://localhost:${PORT}/api/health`);
    console.log(`   Env:       ${process.env.NODE_ENV || 'development'}\n`);
  });
}

start().catch(err => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});

module.exports = app;
