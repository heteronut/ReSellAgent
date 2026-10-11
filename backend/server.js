require('dotenv').config({ path: './config.env' });
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');

const flowRoutes      = require('./routes/flows');
const instagramRoutes = require('./routes/instagram');
const instagramMetaRoutes = require('./routes/instagram-meta');
const googleDriveRoutes = require('./routes/google-drive');
const inboxRoutes = require('./routes/inbox');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Composio-Key', 'X-Meta-Token']
}));
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// Serve frontend static files
app.use(express.static(path.join(__dirname, '../frontend')));

// API Routes
app.use('/api/flows',     flowRoutes);
app.use('/api/instagram', instagramRoutes);
app.use('/api/instagram/meta', instagramMetaRoutes);
app.use('/api/google-drive', googleDriveRoutes);
app.use('/api/inbox', inboxRoutes);

// ─── Composio OAuth callbacks ─────────────────────────────────────────────────
// Composio redirects back here after Instagram or Google Drive OAuth completes.
// Mirrors the Python FastAPI @app.get("/auth/callback") handler.
app.get('/auth/callback', (req, res) => {
  // Pass connected flag to frontend so it can fetch ig_user_id
  const userId = req.query.user_id || '';
  res.redirect(`/?ig_connected=1${userId ? '&local_user_id=' + encodeURIComponent(userId) : ''}`);
});

app.get('/auth/google-drive/callback', (req, res) => {
  const userId = req.query.user_id || '';
  const error = req.query.error;
  const query = error
    ? `drive_error=${encodeURIComponent(error)}`
    : `drive_connected=1${userId ? '&local_user_id=' + encodeURIComponent(userId) : ''}`;
  res.redirect(`/?${query}`);
});

app.get('/auth/inbox/callback', (req, res) => {
  const channel = ['messenger', 'instagram'].includes(req.query.channel) ? req.query.channel : '';
  const error = req.query.error_description || req.query.error;
  const params = new URLSearchParams();
  if (error) {
    params.set('inbox_error', String(error));
  } else if (channel) {
    params.set('inbox_connected', '1');
    params.set('channel', channel);
  } else {
    params.set('inbox_error', 'Kanal koneksi tidak valid.');
  }
  res.redirect(`/?${params.toString()}`);
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    langflow_url: process.env.LANGFLOW_SERVER_URL,
    instagram_configured: !!(process.env.COMPOSIO_API_KEY && process.env.COMPOSIO_API_KEY !== 'your_composio_api_key_here'),
    instagram_meta_configured: !!(process.env.META_APP_ID && process.env.META_APP_SECRET),
    flows: {
      konsultan_resell: process.env.FLOW_KONSULTAN_RESELL,
      rekomendasi_harga: process.env.FLOW_REKOMENDASI_HARGA,
      deskripsi_caption: process.env.FLOW_DESKRIPSI_CAPTION,
      perbandingan_harga_beli_jual: process.env.FLOW_PERBANDINGAN_HARGA_BELI_JUAL,
      perbandingan_marketplace: process.env.FLOW_PERBANDINGAN_MARKETPLACE,
      konsultasi_ongkir: process.env.FLOW_KONSULTASI_ONGKIR,
      foto_validator: process.env.FLOW_FOTO_VALIDATOR,
      foto_editor: process.env.FLOW_FOTO_EDITOR,
      inbox_reply_draft: !!process.env.FLOW_INBOX_REPLY_DRAFT
    }
  });
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Endpoint API tidak ditemukan.' });
});

// Catch-all: serve frontend index
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🚀 ReSell AI Agent Backend running on http://localhost:${PORT}`);
  console.log(`📡 Langflow: ${process.env.LANGFLOW_SERVER_URL}`);
  console.log(`✅ API ready at http://localhost:${PORT}/api/\n`);
});
