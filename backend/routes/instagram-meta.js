/**
 * Instagram Auto Post via Meta Instagram Login (tanpa Composio)
 * =============================================================
 * Alur resmi terbaru Meta — "Instagram API with Instagram Login":
 *  1. User klik "Hubungkan" → redirect ke instagram.com/oauth/authorize
 *  2. User login dengan akun Instagram (Business/Creator) & authorize
 *  3. Meta redirect balik ke /callback dengan ?code=
 *  4. Backend tukar code → short-lived token (POST api.instagram.com)
 *  5. Backend tukar → long-lived token (60 hari, graph.instagram.com)
 *  6. Posting via graph.instagram.com (container → publish)
 *
 * Syarat akun IG user:
 *  - Akun Instagram Business/Creator (tidak perlu Facebook Page)
 *
 * Konfigurasi (backend/config.env):
 *  META_APP_ID, META_APP_SECRET, META_REDIRECT_URI
 *
 * Di dashboard Meta: tambah produk "Instagram" → "API setup with
 * Instagram business login", dan daftarkan redirect URI di sana.
 *
 * Token disimpan per-profil di localStorage frontend (via header X-Meta-Token),
 * backend stateless.
 */

const express = require('express');
const router  = express.Router();
const axios   = require('axios');

const GRAPH = 'https://graph.instagram.com/v26.0';
const OAUTH_DIALOG = 'https://www.instagram.com/oauth/authorize';
const TOKEN_URL = 'https://api.instagram.com/oauth/access_token';

const APP_ID     = process.env.META_APP_ID;
const APP_SECRET = process.env.META_APP_SECRET;
const REDIRECT_URI = process.env.META_REDIRECT_URI || 'http://localhost:3000/api/instagram/meta/callback';

// Scope baru Instagram API (pengganti instagram_basic / instagram_content_publish
// yang sudah deprecated per Jan 2025)
const SCOPES = [
  'instagram_business_basic',
  'instagram_business_content_publish'
].join(',');

function configured() {
  return !!(APP_ID && APP_SECRET);
}

function needConfig(res) {
  return res.status(500).json({
    error: 'META_APP_ID / META_APP_SECRET belum dikonfigurasi di backend/config.env. Lihat README.'
  });
}

function getToken(req) {
  const h = req.headers['x-meta-token'];
  if (h && typeof h === 'string' && h.trim()) return h.trim();
  const b = req.body && req.body.meta_token;
  if (b && typeof b === 'string' && b.trim()) return b.trim();
  return null;
}

// ─── Ambil profil IG (user_id + username) dari token ─────────────────────────
async function getIgProfile(accessToken) {
  const r = await axios.get(`${GRAPH}/me`, {
    params: { access_token: accessToken, fields: 'user_id,username' }
  });
  return { ig_user_id: r.data.user_id, username: r.data.username || '' };
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. URL OAuth — frontend redirect user ke sini
//    GET /api/instagram/meta/auth-url?state=<profileUserId>
//    → { auth_url }
// ══════════════════════════════════════════════════════════════════════════════
router.get('/auth-url', (req, res) => {
  if (!configured()) return needConfig(res);

  const state = req.query.state || '';
  const params = new URLSearchParams({
    client_id: APP_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    response_type: 'code',
    state
  });

  res.json({ auth_url: `${OAUTH_DIALOG}?${params.toString()}` });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. OAuth callback — Meta redirect ke sini setelah user authorize
//    GET /api/instagram/meta/callback?code=xxx&state=<profileUserId>
//    → redirect ke frontend dengan token & ig_user_id
// ══════════════════════════════════════════════════════════════════════════════
router.get('/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;

  if (error) {
    return res.redirect(`/?ig_error=${encodeURIComponent(error_description || error)}`);
  }
  if (!code) {
    return res.redirect(`/?ig_error=${encodeURIComponent('Kode OAuth tidak diterima.')}`);
  }
  if (!configured()) {
    return res.redirect(`/?ig_error=${encodeURIComponent('Konfigurasi Meta belum lengkap.')}`);
  }

  try {
    // Tukar code → short-lived token (1 jam) via POST form-encoded
    const tokenRes = await axios.post(TOKEN_URL, new URLSearchParams({
      client_id: APP_ID,
      client_secret: APP_SECRET,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI,
      code
    }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    const shortToken = tokenRes.data.access_token;
    if (!shortToken) throw new Error('Meta tidak mengembalikan access token.');

    // Tukar → long-lived token (60 hari)
    const longRes = await axios.get(`${GRAPH}/access_token`, {
      params: {
        grant_type: 'ig_exchange_token',
        client_secret: APP_SECRET,
        access_token: shortToken
      }
    });
    const longToken = longRes.data.access_token;
    const expiresIn = longRes.data.expires_in || 5184000;
    if (!longToken) throw new Error('Gagal mendapatkan long-lived token.');

    // Ambil user_id + username IG
    const profile = await getIgProfile(longToken);
    if (!profile.ig_user_id) throw new Error('Tidak dapat membaca profil Instagram.');

    console.log(`[ig-meta:callback] ig_user_id=${profile.ig_user_id} username=${profile.username}`);

    // Redirect ke frontend dengan semua data (frontend simpan ke profil aktif)
    const q = new URLSearchParams({
      ig_connected: '1',
      meta_token: longToken,
      ig_user_id: String(profile.ig_user_id),
      ig_username: profile.username,
      page_name: '',
      expires_in: String(expiresIn),
      state: state || ''
    });
    res.redirect(`/?${q.toString()}`);
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.response?.data?.error_description || err.message;
    console.error('[ig-meta:callback]', msg);
    res.redirect(`/?ig_error=${encodeURIComponent('OAuth gagal: ' + msg)}`);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. Status koneksi — validasi token & ambil info akun
//    GET /api/instagram/meta/status   (header X-Meta-Token)
//    → { connected, ig_user_id, username }
// ══════════════════════════════════════════════════════════════════════════════
router.get('/status', async (req, res) => {
  const token = getToken(req);
  if (!token) return res.json({ connected: false, needs_token: true });

  try {
    const profile = await getIgProfile(token);
    if (!profile.ig_user_id) return res.json({ connected: false });

    res.json({
      connected: true,
      ig_user_id: String(profile.ig_user_id),
      username: profile.username ? '@' + profile.username : '@instagram'
    });
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    console.error('[ig-meta:status]', msg);
    res.json({ connected: false, error: msg });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. Posting ke Instagram (container → publish)
//    POST /api/instagram/meta/post   (header X-Meta-Token)
//    Body: { ig_user_id, image_url, caption }
//    → { success, creation_id, published_media_id }
// ══════════════════════════════════════════════════════════════════════════════
router.post('/post', async (req, res) => {
  const token = getToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Belum terhubung. Klik "Hubungkan via Meta" dulu.' });
  }

  const { ig_user_id, image_url, caption } = req.body || {};
  if (!ig_user_id) return res.status(400).json({ error: 'ig_user_id diperlukan.' });
  if (!image_url)  return res.status(400).json({ error: 'URL foto diperlukan.' });
  if (!caption)    return res.status(400).json({ error: 'Caption diperlukan.' });

  try {
    // Langkah 1: buat media container
    const c1 = await axios.post(`${GRAPH}/${ig_user_id}/media`, null, {
      params: { access_token: token, image_url, caption }
    });
    const creation_id = c1.data.id;
    if (!creation_id) throw new Error('Meta tidak mengembalikan creation_id.');
    console.log(`[ig-meta:post] creation_id=${creation_id}`);

    // Tunggu container siap (polling status)
    let ready = false;
    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 5000));
      try {
        const s = await axios.get(`${GRAPH}/${creation_id}`, {
          params: { access_token: token, fields: 'status_code' }
        });
        if (s.data.status_code === 'FINISHED') { ready = true; break; }
        if (s.data.status_code === 'ERROR') throw new Error('Media gagal diproses Meta.');
      } catch (_) { /* coba lagi */ }
    }

    // Langkah 2: publish
    const c2 = await axios.post(`${GRAPH}/${ig_user_id}/media_publish`, null, {
      params: { access_token: token, creation_id }
    });
    const published_media_id = c2.data.id;
    console.log(`[ig-meta:post] published_media_id=${published_media_id} (ready=${ready})`);

    res.json({ success: true, creation_id, published_media_id });
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    console.error('[ig-meta:post]', msg);
    res.status(500).json({ error: `Gagal posting: ${msg}` });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. Refresh token (perpanjang 60 hari; disarankan refresh tiap hari)
//    POST /api/instagram/meta/refresh   (header X-Meta-Token)
//    → { access_token, expires_in }
// ══════════════════════════════════════════════════════════════════════════════
router.post('/refresh', async (req, res) => {
  const token = getToken(req);
  if (!token) return res.status(401).json({ error: 'Token diperlukan.' });

  try {
    const r = await axios.get(`${GRAPH}/refresh_access_token`, {
      params: {
        grant_type: 'ig_refresh_token',
        access_token: token
      }
    });
    res.json({ access_token: r.data.access_token, expires_in: r.data.expires_in });
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    res.status(500).json({ error: `Gagal refresh token: ${msg}` });
  }
});

module.exports = router;
