const express = require('express');
const multer = require('multer');
const axios = require('axios');
const { createHash } = require('crypto');

const router = express.Router();
const API_BASE = 'https://backend.composio.dev/api/v3';
const TOOL_API_BASE = 'https://backend.composio.dev/api/v3.1';
const TOOLKIT_SLUG = 'googledrive';
const UPLOAD_TOOL = 'GOOGLEDRIVE_UPLOAD_FILE';
const PERMISSION_TOOL = 'GOOGLEDRIVE_CREATE_PERMISSION';
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_SIZE, files: 1 },
  fileFilter(req, file, callback) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      callback(new Error('Foto harus berformat JPG, PNG, atau WEBP.'));
      return;
    }
    callback(null, true);
  }
});

function getApiKey(req) {
  const header = req.headers['x-composio-key'];
  if (typeof header === 'string' && header.trim()) return header.trim();
  const bodyKey = req.body && req.body.composio_api_key;
  if (typeof bodyKey === 'string' && bodyKey.trim()) return bodyKey.trim();
  return process.env.COMPOSIO_API_KEY;
}

function keyIsValid(key) {
  return Boolean(key && key !== 'your_composio_api_key_here');
}

function requireApiKey(res) {
  return res.status(400).json({
    error: 'Masukkan API Key Composio di profil aktif sebelum menghubungkan Google Drive.'
  });
}

function composio(apiKey, baseURL = API_BASE) {
  return axios.create({
    baseURL,
    headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
    timeout: 60000
  });
}

function errorMessage(error) {
  return error.response?.data?.error?.message
    || (error.response?.data && JSON.stringify(error.response.data).slice(0, 500))
    || error.message
    || 'Composio API error';
}

async function getAuthConfigId(apiKey) {
  const client = composio(apiKey);
  const response = await client.get('/auth_configs', { params: { app: TOOLKIT_SLUG } });
  const items = response.data?.items || [];
  const existing = items.find(item => item.toolkit?.slug?.toLowerCase() === TOOLKIT_SLUG);
  if (existing) return existing.id;

  const created = await client.post('/auth_configs', {
    name: 'googledrive_default',
    type: 'OAUTH2',
    app: TOOLKIT_SLUG,
    toolkit: { slug: TOOLKIT_SLUG }
  });
  const authConfigId = created.data?.auth_config?.id || created.data?.id;
  if (!authConfigId) throw new Error('Composio tidak mengembalikan ID auth config Google Drive.');
  return authConfigId;
}

async function getActiveAccount(apiKey, userId, authConfigId) {
  const response = await composio(apiKey).get('/connected_accounts', {
    params: { user_id: userId, auth_config_id: authConfigId }
  });
  const accounts = (response.data?.items || [])
    .filter(account => account.status === 'ACTIVE')
    .sort((left, right) => {
      const leftDate = Date.parse(left.created_at || left.createdAt || '');
      const rightDate = Date.parse(right.created_at || right.createdAt || '');
      const leftCreated = Number.isFinite(leftDate) ? leftDate : 0;
      const rightCreated = Number.isFinite(rightDate) ? rightDate : 0;
      return rightCreated - leftCreated;
    });
  return accounts[0] || null;
}

async function executeTool(apiKey, toolSlug, accountId, userId, args) {
  const response = await composio(apiKey, TOOL_API_BASE).post(`/tools/execute/${toolSlug}`, {
    connected_account_id: accountId,
    user_id: userId,
    version: 'latest',
    arguments: args
  });
  const result = response.data || {};
  if (result.successful === false) {
    const message = typeof result.error === 'string'
      ? result.error
      : JSON.stringify(result.error || `Tool ${toolSlug} gagal.`);
    const error = new Error(message);
    if (isGoogleCredentialError(error)) error.code = 'GOOGLE_DRIVE_REAUTH_REQUIRED';
    throw error;
  }
  let data = result.data !== undefined ? result.data : result;
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch { /* Keep non-JSON tool output for validation below. */ }
  }
  return data;
}

function isGoogleCredentialError(error) {
  if (error.code === 'GOOGLE_DRIVE_REAUTH_REQUIRED') return true;
  const message = [
    error.message,
    error.response?.data?.error?.message,
    error.response?.data?.message,
    JSON.stringify(error.response?.data || {})
  ].filter(Boolean).join(' ').toLowerCase();
  return error.response?.status === 401
    || /http\s*401|invalid authentication credentials|invalid credentials|unauthorized/.test(message);
}

function getUserId(req) {
  const value = req.query.user_id || req.body?.user_id;
  return typeof value === 'string' && value.trim() ? value.trim() : 'user-123';
}

router.get('/connect', async (req, res) => {
  const apiKey = getApiKey(req);
  if (!keyIsValid(apiKey)) return requireApiKey(res);

  try {
    const userId = getUserId(req);
    const authConfigId = await getAuthConfigId(apiKey);
    const callbackBase = process.env.APP_BASE_URL || process.env.CALLBACK_URL || 'http://localhost:3000';
    const callbackUrl = new URL('/auth/google-drive/callback', callbackBase).toString();
    const response = await composio(apiKey).post('/connected_accounts/link', {
      user_id: userId,
      auth_config_id: authConfigId,
      callback_url: callbackUrl
    });
    const authUrl = response.data?.redirect_url;
    if (!authUrl) throw new Error('Composio tidak mengembalikan URL OAuth Google Drive.');
    res.json({ auth_url: authUrl });
  } catch (error) {
    console.error('[google-drive:connect]', errorMessage(error));
    res.status(502).json({ error: `Gagal memulai koneksi Google Drive: ${errorMessage(error)}` });
  }
});

router.get('/status', async (req, res) => {
  const apiKey = getApiKey(req);
  if (!keyIsValid(apiKey)) return requireApiKey(res);

  try {
    const userId = getUserId(req);
    const authConfigId = await getAuthConfigId(apiKey);
    const account = await getActiveAccount(apiKey, userId, authConfigId);
    res.json({
      connected: Boolean(account),
      account_id: account?.id || null,
      account_name: account?.display_name || account?.name || null
    });
  } catch (error) {
    console.error('[google-drive:status]', errorMessage(error));
    res.status(502).json({ error: `Gagal memeriksa koneksi Google Drive: ${errorMessage(error)}` });
  }
});

router.post('/upload', (req, res, next) => {
  upload.single('file')(req, res, error => {
    if (!error) return next();
    const status = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    res.status(status).json({ error: error.message });
  });
}, async (req, res) => {
  const apiKey = getApiKey(req);
  if (!keyIsValid(apiKey)) return requireApiKey(res);
  if (!req.file) return res.status(400).json({ error: 'Pilih file foto yang akan diunggah.' });

  try {
    const userId = getUserId(req);
    const authConfigId = await getAuthConfigId(apiKey);
    const account = await getActiveAccount(apiKey, userId, authConfigId);
    if (!account) {
      return res.status(401).json({ error: 'Google Drive belum terhubung. Hubungkan Drive melalui Composio terlebih dahulu.' });
    }

    const safeName = req.file.originalname.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 180) || 'foto.jpg';
    const md5 = createHash('md5').update(req.file.buffer).digest('hex');
    const fileRequest = await composio(apiKey, TOOL_API_BASE).post('/files/upload/request', {
      toolkit_slug: TOOLKIT_SLUG,
      tool_slug: UPLOAD_TOOL,
      filename: safeName,
      mimetype: req.file.mimetype,
      md5
    });
    const presignedUrl = fileRequest.data?.new_presigned_url || fileRequest.data?.newPresignedUrl;
    const storageKey = fileRequest.data?.key;
    if (!storageKey) {
      throw new Error('Composio tidak mengembalikan alamat upload file yang valid.');
    }

    if (presignedUrl) {
      const storageHeaders = { 'Content-Type': req.file.mimetype };
      if (fileRequest.data?.metadata?.storage_backend === 'azure_blob_storage') {
        storageHeaders['x-ms-blob-type'] = 'BlockBlob';
      }
      await axios.put(presignedUrl, req.file.buffer, {
        headers: storageHeaders,
        timeout: 60000,
        maxBodyLength: MAX_IMAGE_SIZE
      });
    }

    const uploaded = await executeTool(apiKey, UPLOAD_TOOL, account.id, userId, {
      file_to_upload: {
        name: `ReSell_${Date.now()}_${safeName}`,
        s3key: storageKey,
        mimetype: req.file.mimetype
      }
    });
    const fileId = uploaded?.id || uploaded?.file_id || uploaded?.fileId || uploaded?.data?.id;
    if (!fileId) throw new Error(`Tool upload tidak mengembalikan ID file: ${JSON.stringify(uploaded).slice(0, 500)}`);

    await executeTool(apiKey, PERMISSION_TOOL, account.id, userId, {
      file_id: fileId,
      type: 'anyone',
      role: 'reader'
    });

    const imageUrl = `https://drive.google.com/uc?export=view&id=${encodeURIComponent(fileId)}`;
    res.json({ success: true, file_id: fileId, image_url: imageUrl });
  } catch (error) {
    console.error('[google-drive:upload]', errorMessage(error));
    if (isGoogleCredentialError(error)) {
      return res.status(409).json({
        code: 'GOOGLE_DRIVE_REAUTH_REQUIRED',
        error: 'Google menolak kredensial Drive yang tersimpan di Composio. Hubungkan ulang Google Drive melalui Composio, pilih akun Google yang benar, izinkan akses, lalu coba unggah kembali.'
      });
    }
    res.status(502).json({ error: `Gagal mengunggah foto melalui Google Drive: ${errorMessage(error)}` });
  }
});

router.post('/disconnect', async (req, res) => {
  const apiKey = getApiKey(req);
  if (!keyIsValid(apiKey)) return requireApiKey(res);

  try {
    const userId = getUserId(req);
    const authConfigId = await getAuthConfigId(apiKey);
    const account = await getActiveAccount(apiKey, userId, authConfigId);
    if (!account) return res.json({ success: true });
    await composio(apiKey).delete(`/connected_accounts/${account.id}`);
    res.json({ success: true });
  } catch (error) {
    console.error('[google-drive:disconnect]', errorMessage(error));
    res.status(502).json({ error: `Gagal memutuskan Google Drive: ${errorMessage(error)}` });
  }
});

module.exports = router;
