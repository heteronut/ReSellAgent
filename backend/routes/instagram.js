/**
 * Instagram Auto Post via Composio v3 API (REST langsung, tanpa SDK)
 * =================================================================
 * Alur:
 *  1. GET /connect?user_id=xxx   → buat link OAuth
 *  2. User login Instagram di halaman Composio
 *  3. GET /status?user_id=xxx    → cek connected account ACTIVE + ambil ig_user_id
 *  4. GET /fetch-ids?user_id=xxx → khusus ambil ig_user_id & creation_id dengan log detail
 *  5. POST /post                 → INSTAGRAM_CREATE_MEDIA_CONTAINER + INSTAGRAM_CREATE_POST
 */

const express = require('express');
const router  = express.Router();
const axios   = require('axios');

const API_BASE    = 'https://backend.composio.dev/api/v3';
const CALLBACK_URL = process.env.CALLBACK_URL || 'http://localhost:3000/auth/callback';

// --- API key per-request ---------------------------------------------------
function getApiKey(req) {
  const h = req.headers['x-composio-key'];
  if (h && typeof h === 'string' && h.trim()) return h.trim();
  const b = req.body && req.body.composio_api_key;
  if (b && typeof b === 'string' && b.trim()) return b.trim();
  return process.env.COMPOSIO_API_KEY;
}

function keyOk(k) {
  return !!k && k !== 'your_composio_api_key_here';
}

function needKey(res) {
  return res.status(500).json({
    error: 'COMPOSIO_API_KEY belum dikonfigurasi. Masukkan API key Composio Anda di kolom yang tersedia.'
  });
}

// --- HTTP client Composio v3 -----------------------------------------------
function api(apiKey) {
  return axios.create({
    baseURL: API_BASE,
    headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
    timeout: 60000
  });
}

function errMsg(err) {
  return (err.response && err.response.data && err.response.data.error && err.response.data.error.message)
    || (err.response && err.response.data && JSON.stringify(err.response.data).slice(0, 300))
    || err.message
    || 'Composio API error';
}

// --- Auth config Instagram (cache + auto-create) ---------------------------
let cachedAuthConfigId = null;

async function getAuthConfigId(apiKey) {
  if (cachedAuthConfigId) return cachedAuthConfigId;
  const c = api(apiKey);

  const list = await c.get('/auth_configs', { params: { app: 'instagram' } });
  const items = (list.data && list.data.items) || [];
  const existing = items.find(a => a.toolkit && a.toolkit.slug === 'instagram');
  if (existing) {
    cachedAuthConfigId = existing.id;
    return cachedAuthConfigId;
  }

  const created = await c.post('/auth_configs', {
    name: 'instagram_default',
    type: 'OAUTH2',
    app: 'instagram',
    toolkit: { slug: 'instagram' }
  });
  cachedAuthConfigId = created.data.auth_config.id;
  console.log(`[ig] auth_config dibuat: ${cachedAuthConfigId}`);
  return cachedAuthConfigId;
}

// --- Cari connected account ACTIVE untuk user ------------------------------
async function getActiveAccount(apiKey, userId, authConfigId) {
  const c = api(apiKey);
  const r = await c.get('/connected_accounts', {
    params: { user_id: userId, auth_config_id: authConfigId }
  });
  const items = (r.data && r.data.items) || [];
  return items.find(a => a.status === 'ACTIVE') || null;
}

// --- Ambil numeric IG User ID via Composio tool (dengan entity_id) ---------
async function fetchIgUserInfo(apiKey, connectedAccountId, entityId) {
  try {
    const info = await execTool(apiKey, 'INSTAGRAM_GET_USER_INFO', connectedAccountId, {}, entityId);
    console.log('[ig:userinfo]', JSON.stringify(info).slice(0, 400));
    // Coba semua path yang mungkin dikembalikan Composio
    const id = info && (info.id || info.user_id || (info.user && info.user.id) || (info.data && info.data.id));
    const username = info && (info.username || (info.user && info.user.username) || (info.data && info.data.username));
    return { id: id ? String(id) : null, username: username || null };
  } catch (err) {
    console.warn('[ig:userinfo] gagal:', err.message);
    return null;
  }
}

// --- Eksekusi tool Composio ------------------------------------------------
// Composio v3 memerlukan entity_id (= user_id) DAN connected_account_id
async function execTool(apiKey, toolSlug, connectedAccountId, args, entityId) {
  const c = api(apiKey);
  const body = {
    connected_account_id: connectedAccountId,
    arguments: args || {}
  };
  if (entityId) body.entity_id = entityId;
  const r = await c.post(`/tools/execute/${toolSlug}`, body);
  const d = r.data || {};
  if (d.successful === false) {
    throw new Error(d.error ? JSON.stringify(d.error).slice(0, 300) : `Tool ${toolSlug} gagal`);
  }
  return d.data !== undefined ? d.data : d;
}

// ==========================================================================
// 1. Mulai OAuth Instagram via Composio v3
//    GET /api/instagram/connect?user_id=xxx  →  { auth_url }
// ==========================================================================
router.get('/connect', async (req, res) => {
  const apiKey  = getApiKey(req);
  const user_id = req.query.user_id || 'user-123';
  if (!keyOk(apiKey)) return needKey(res);

  try {
    const authConfigId = await getAuthConfigId(apiKey);
    const c = api(apiKey);
    const r = await c.post('/connected_accounts/link', {
      user_id,
      auth_config_id: authConfigId,
      callback_url: CALLBACK_URL
    });
    const url = r.data && r.data.redirect_url;
    if (!url) throw new Error('Composio tidak mengembalikan URL OAuth.');
    console.log(`[ig:connect] user=${user_id} account=${r.data.connected_account_id}`);
    res.json({ auth_url: url });
  } catch (err) {
    console.error('[ig:connect]', errMsg(err));
    res.status(500).json({ error: `Gagal memulai OAuth: ${errMsg(err)}` });
  }
});

// ==========================================================================
// 2. Status koneksi
//    GET /api/instagram/status?user_id=xxx
//    → { connected, username?, ig_user_id?, connected_account_id? }
// ==========================================================================
router.get('/status', async (req, res) => {
  const apiKey  = getApiKey(req);
  const user_id = req.query.user_id || 'user-123';
  if (!keyOk(apiKey)) return res.json({ connected: false, needs_api_key: true });

  try {
    const authConfigId = await getAuthConfigId(apiKey);
    const account = await getActiveAccount(apiKey, user_id, authConfigId);
    if (!account) return res.json({ connected: false });

    // Ambil IG User ID via Composio tool dengan entity_id
    const userInfo   = await fetchIgUserInfo(apiKey, account.id, user_id);
    const ig_user_id = (userInfo && userInfo.id)       || null;
    const username   = (userInfo && userInfo.username) || null;

    console.log(`[ig:status] user=${user_id} ig_user_id=${ig_user_id} username=${username}`);
    res.json({ connected: true, username, ig_user_id, connected_account_id: account.id });
  } catch (err) {
    console.error('[ig:status]', errMsg(err));
    res.json({ connected: false, error: errMsg(err) });
  }
});

// ==========================================================================
// 2b. Fetch IDs — endpoint khusus tombol "Get User ID & Creation ID"
//     GET /api/instagram/fetch-ids?user_id=xxx
//     → { username, ig_user_id, connected_account_id }
// ==========================================================================
router.get('/fetch-ids', async (req, res) => {
  const apiKey  = getApiKey(req);
  const user_id = req.query.user_id || 'user-123';
  if (!keyOk(apiKey)) return needKey(res);

  try {
    const authConfigId = await getAuthConfigId(apiKey);
    const account = await getActiveAccount(apiKey, user_id, authConfigId);
    if (!account) {
      return res.status(404).json({
        error: 'Belum ada akun Instagram yang terhubung. Selesaikan OAuth dulu.'
      });
    }

    // Ambil IG User ID via Composio tool dengan entity_id
    const userInfo   = await fetchIgUserInfo(apiKey, account.id, user_id);
    const ig_user_id = (userInfo && userInfo.id)       || null;
    const username   = (userInfo && userInfo.username) || null;

    console.log(`[ig:fetch-ids] user=${user_id} ig_user_id=${ig_user_id} username=${username}`);
    res.json({
      username,
      ig_user_id: ig_user_id || '',
      connected_account_id: account.id
    });
  } catch (err) {
    console.error('[ig:fetch-ids]', errMsg(err));
    res.status(500).json({ error: `Gagal mengambil data IG: ${errMsg(err)}` });
  }
});

// ==========================================================================
// 3a. Buat media container (draf) — tanpa publish
//     POST /api/instagram/container
//     Body: { user_id, image_url, caption }
//     → { creation_id, ig_user_id }
// ==========================================================================
router.post('/container', async (req, res) => {
  const apiKey = getApiKey(req);
  const { user_id, image_url, caption } = req.body || {};
  if (!keyOk(apiKey)) return needKey(res);
  if (!image_url) return res.status(400).json({ error: 'URL foto diperlukan.' });
  if (!caption)   return res.status(400).json({ error: 'Caption diperlukan.' });

  try {
    const uid = user_id || 'user-123';
    const authConfigId = await getAuthConfigId(apiKey);
    const account = await getActiveAccount(apiKey, uid, authConfigId);
    if (!account) {
      return res.status(401).json({ error: 'Belum terhubung. Hubungkan Instagram dulu.' });
    }

    const userInfo = await fetchIgUserInfo(apiKey, account.id, uid);
    const igUserId = userInfo && userInfo.id;
    if (!igUserId) throw new Error('Tidak dapat membaca IG User ID. Pastikan akun Instagram sudah terhubung.');

    const c1 = await execTool(apiKey, 'INSTAGRAM_CREATE_MEDIA_CONTAINER', account.id, {
      ig_user_id: String(igUserId),
      image_url,
      caption
    }, uid);
    const creation_id = c1.id || c1.creation_id || c1.container_id;
    if (!creation_id) throw new Error('Composio tidak mengembalikan creation_id.');

    console.log(`[ig:container] creation_id=${creation_id} user=${uid}`);
    res.json({ success: true, creation_id, ig_user_id: String(igUserId) });
  } catch (err) {
    console.error('[ig:container]', errMsg(err));
    res.status(500).json({ error: `Gagal membuat container: ${errMsg(err)}` });
  }
});

// ==========================================================================
// 3b. Publish container yang sudah dibuat
//     POST /api/instagram/publish
//     Body: { user_id, ig_user_id, creation_id }
//     → { success, published_media_id }
// ==========================================================================
router.post('/publish', async (req, res) => {
  const apiKey = getApiKey(req);
  const { user_id, ig_user_id, creation_id } = req.body || {};
  if (!keyOk(apiKey)) return needKey(res);
  if (!creation_id) return res.status(400).json({ error: 'creation_id diperlukan.' });

  try {
    const uid = user_id || 'user-123';
    const authConfigId = await getAuthConfigId(apiKey);
    const account = await getActiveAccount(apiKey, uid, authConfigId);
    if (!account) {
      return res.status(401).json({ error: 'Belum terhubung. Hubungkan Instagram dulu.' });
    }

    // Gunakan ig_user_id dari body jika ada, jika tidak ambil via tool
    let igUserId = ig_user_id;
    if (!igUserId) {
      const userInfo = await fetchIgUserInfo(apiKey, account.id, uid);
      igUserId = userInfo && userInfo.id;
    }
    if (!igUserId) throw new Error('ig_user_id tidak tersedia.');

    // Tunggu container siap (maks 60 detik)
    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 5000));
      try {
        const s = await execTool(apiKey, 'INSTAGRAM_GET_POST_STATUS', account.id, {
          creation_id: String(creation_id)
        }, uid);
        const st = (s.status_code || s.status || '').toUpperCase();
        if (st === 'FINISHED') break;
        if (st === 'ERROR') throw new Error('Media gagal diproses Meta.');
      } catch (_) { /* coba lagi */ }
    }

    const c2 = await execTool(apiKey, 'INSTAGRAM_CREATE_POST', account.id, {
      ig_user_id: String(igUserId),
      creation_id: String(creation_id)
    }, uid);
    const published_media_id = c2.id || c2.media_id || c2.published_media_id;
    console.log(`[ig:publish] published_media_id=${published_media_id} creation_id=${creation_id}`);

    res.json({ success: true, published_media_id, creation_id });
  } catch (err) {
    console.error('[ig:publish]', errMsg(err));
    res.status(500).json({ error: `Gagal publish: ${errMsg(err)}` });
  }
});

// ==========================================================================
// 3c. Posting atomik (container + publish sekaligus) — legacy / compat
//     POST /api/instagram/post
//     Body: { user_id, image_url, caption }
//     → { success, creation_id, published_media_id, ig_user_id }
// ==========================================================================
router.post('/post', async (req, res) => {
  const apiKey = getApiKey(req);
  const { user_id, image_url, caption } = req.body || {};
  if (!keyOk(apiKey)) return needKey(res);
  if (!image_url) return res.status(400).json({ error: 'URL foto diperlukan.' });
  if (!caption)   return res.status(400).json({ error: 'Caption diperlukan.' });

  try {
    const uid = user_id || 'user-123';
    const authConfigId = await getAuthConfigId(apiKey);
    const account = await getActiveAccount(apiKey, uid, authConfigId);
    if (!account) {
      return res.status(401).json({ error: 'Belum terhubung. Hubungkan Instagram dulu.' });
    }

    const userInfo = await fetchIgUserInfo(apiKey, account.id, uid);
    const igUserId = userInfo && userInfo.id;
    if (!igUserId) throw new Error('Tidak dapat membaca IG User ID. Pastikan akun Instagram sudah terhubung dengan benar.');

    // Langkah 1: buat media container
    const c1 = await execTool(apiKey, 'INSTAGRAM_CREATE_MEDIA_CONTAINER', account.id, {
      ig_user_id: String(igUserId),
      image_url,
      caption
    }, uid);
    const creation_id = c1.id || c1.creation_id || c1.container_id;
    if (!creation_id) throw new Error('Composio tidak mengembalikan creation_id.');
    console.log(`[ig:post] creation_id=${creation_id}`);

    // Tunggu container siap
    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 5000));
      try {
        const s = await execTool(apiKey, 'INSTAGRAM_GET_POST_STATUS', account.id, {
          creation_id: String(creation_id)
        }, uid);
        const st = (s.status_code || s.status || '').toUpperCase();
        if (st === 'FINISHED') break;
        if (st === 'ERROR') throw new Error('Media gagal diproses Meta.');
      } catch (_) { /* coba lagi */ }
    }

    // Langkah 2: publish
    const c2 = await execTool(apiKey, 'INSTAGRAM_CREATE_POST', account.id, {
      ig_user_id: String(igUserId),
      creation_id: String(creation_id)
    }, uid);
    const published_media_id = c2.id || c2.media_id || c2.published_media_id;
    console.log(`[ig:post] published_media_id=${published_media_id}`);

    res.json({ success: true, creation_id, published_media_id, ig_user_id: String(igUserId) });
  } catch (err) {
    console.error('[ig:post]', errMsg(err));
    res.status(500).json({ error: `Gagal posting: ${errMsg(err)}` });
  }
});

// ==========================================================================
// 4. Putuskan koneksi
//    POST /api/instagram/disconnect  Body: { user_id }
// ==========================================================================
router.post('/disconnect', async (req, res) => {
  const apiKey = getApiKey(req);
  const { user_id } = req.body || {};
  if (!keyOk(apiKey)) return needKey(res);

  try {
    const uid = user_id || 'user-123';
    const authConfigId = await getAuthConfigId(apiKey);
    const account = await getActiveAccount(apiKey, uid, authConfigId);
    if (!account) return res.json({ success: true, message: 'Tidak ada koneksi aktif.' });

    const c = api(apiKey);
    await c.delete(`/connected_accounts/${account.id}`);
    res.json({ success: true });
  } catch (err) {
    console.error('[ig:disconnect]', errMsg(err));
    res.status(500).json({ error: errMsg(err) });
  }
});

module.exports = router;
