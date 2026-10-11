/* ══════════════════════════════════════════════════════════
   CONFIG
   Auto-detect base URL:
   - Jika diakses lewat backend sendiri (port 3000) → pakai path relatif
   - Jika diakses lewat dev server lain (mis. Live Server 5500) → pakai localhost:3000
══════════════════════════════════════════════════════════ */
const _BACKEND_ORIGIN = window.location.port === '3000'
  ? ''                           // same-origin — gunakan path relatif
  : 'http://localhost:3000';     // frontend di file:// atau dev server lain

const API_BASE    = _BACKEND_ORIGIN + '/api/flows';
const IG_API_BASE = _BACKEND_ORIGIN + '/api/instagram';
const DRIVE_API_BASE = _BACKEND_ORIGIN + '/api/google-drive';
const INBOX_API_BASE = _BACKEND_ORIGIN + '/api/inbox';

/* ══════════════════════════════════════════════════════════
   PROFIL IG (multi-user, multi-akun)
   ─────────────────────────────────────────────────────────
   Setiap profil menyimpan:
     - nama profil (mis. "Toko Utama", "Akun Pribadi")
     - API key Composio milik user profil tersebut
     - userId Composio (entity) untuk profil tersebut
     - status koneksi Instagram (username, igUserId)
   Semua tersimpan di localStorage browser.
══════════════════════════════════════════════════════════ */
const IG_PROFILES_KEY = 'ig_profiles';
const IG_ACTIVE_KEY   = 'ig_active_profile';

function igLoadProfiles() {
  try {
    const arr = JSON.parse(localStorage.getItem(IG_PROFILES_KEY) || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function igSaveProfiles(profiles) {
  localStorage.setItem(IG_PROFILES_KEY, JSON.stringify(profiles));
}

function igGetProfiles() {
  let profiles = igLoadProfiles();

  // Migrasi sekali: state lama (single) → profil pertama
  if (profiles.length === 0) {
    const oldKey = (localStorage.getItem('composio_api_key') || '').trim();
    const oldState = JSON.parse(localStorage.getItem('ig_state') || 'null');
    const oldUserId = localStorage.getItem('resell_user_id');
    profiles = [{
      id: 'p_' + Math.random().toString(36).slice(2, 10),
      name: 'Profil Utama',
      composioKey: oldKey || '',
      composioUserId: oldUserId || ('user_' + Math.random().toString(36).slice(2, 10)),
      connected: !!(oldState && oldState.connected),
      igUsername: (oldState && oldState.username) || null,
      igUserId: (oldState && oldState.igUserId) || null,
      lastCreationId: (oldState && oldState.lastCreationId) || null
    }];
    igSaveProfiles(profiles);
    localStorage.setItem(IG_ACTIVE_KEY, profiles[0].id);
    // Bersihkan key lama (sudah pindah ke profil)
    localStorage.removeItem('composio_api_key');
    localStorage.removeItem('ig_state');
  }
  return profiles;
}

function igActiveProfile() {
  const profiles = igGetProfiles();
  const activeId = localStorage.getItem(IG_ACTIVE_KEY);
  return profiles.find(p => p.id === activeId) || profiles[0] || null;
}

function igUpdateActiveProfile(patch) {
  const profiles = igGetProfiles();
  const activeId = localStorage.getItem(IG_ACTIVE_KEY);
  const idx = profiles.findIndex(p => p.id === activeId);
  if (idx < 0) return null;
  profiles[idx] = { ...profiles[idx], ...patch };
  igSaveProfiles(profiles);
  return profiles[idx];
}

function igRenderProfileSelect() {
  const sel = document.getElementById('igProfileSelect');
  if (!sel) return;
  const profiles = igGetProfiles();
  const activeId = localStorage.getItem(IG_ACTIVE_KEY);
  sel.innerHTML = profiles.map(p => {
    const label = p.connected && p.igUsername
      ? `${p.name} (${p.igUsername})`
      : p.name;
    return `<option value="${p.id}"${p.id === activeId ? ' selected' : ''}>${escapeHtml(label)}</option>`;
  }).join('');

  const subtitle = document.getElementById('igSetupSubtitle');
  if (subtitle) {
    const active = igActiveProfile();
    subtitle.textContent = active
      ? `Profil: ${active.name}${active.connected && active.igUsername ? ' — ' + active.igUsername : ''}`
      : 'Profil: —';
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function igSwitchProfile(id) {
  if (!id) return;
  localStorage.setItem(IG_ACTIVE_KEY, id);
  igRenderProfileSelect();
  igRestoreApiKeyUI();
  igUpdateUI();
  const p = igActiveProfile();
  if (p) showToast(`👤 Profil aktif: ${p.name}`, 'info');
  // Refresh status koneksi profil yang baru dipilih
  igFetchStatus();
  igDriveCheckStatus();
  if (currentFn === 'inbox') inboxRefresh();
}

function igCreateProfile() {
  const name = prompt('Nama profil baru (mis. "Toko Cabang 2"):', 'Profil ' + (igGetProfiles().length + 1));
  if (!name || !name.trim()) return;

  const profiles = igGetProfiles();
  const profile = {
    id: 'p_' + Math.random().toString(36).slice(2, 10),
    name: name.trim(),
    composioKey: '',
    composioUserId: 'user_' + Math.random().toString(36).slice(2, 10),
    connected: false,
    igUsername: null,
    igUserId: null,
    lastCreationId: null
  };
  profiles.push(profile);
  igSaveProfiles(profiles);
  localStorage.setItem(IG_ACTIVE_KEY, profile.id);
  igRenderProfileSelect();
  igRestoreApiKeyUI();
  igUpdateUI();
  igDriveCheckStatus();
  showToast(`✅ Profil "${profile.name}" dibuat. Masukkan API key Composio untuk profil ini.`, 'success');
}

function igRenameProfile() {
  const p = igActiveProfile();
  if (!p) return;
  const name = prompt('Nama baru untuk profil:', p.name);
  if (!name || !name.trim()) return;
  igUpdateActiveProfile({ name: name.trim() });
  igRenderProfileSelect();
  showToast('✅ Nama profil diperbarui.', 'success');
}

function igDeleteProfile() {
  const profiles = igGetProfiles();
  const p = igActiveProfile();
  if (!p) return;
  if (profiles.length <= 1) {
    showToast('❌ Tidak bisa hapus — minimal 1 profil harus ada.', 'error');
    return;
  }
  if (!confirm(`Hapus profil "${p.name}"?`)) return;

  const rest = profiles.filter(x => x.id !== p.id);
  igSaveProfiles(rest);
  localStorage.setItem(IG_ACTIVE_KEY, rest[0].id);
  igRenderProfileSelect();
  igRestoreApiKeyUI();
  igUpdateUI();
  igDriveCheckStatus();
  showToast(`🗑️ Profil "${p.name}" dihapus.`, 'info');
}

/* ─── API key per profil aktif ─── */
function igGetApiKey() {
  const p = igActiveProfile();
  return (p && p.composioKey ? p.composioKey : '').trim();
}

function igSaveApiKey() {
  const input  = document.getElementById('ig_apiKey');
  const status = document.getElementById('igApiKeyStatus');
  const key    = (input.value || '').trim();

  if (!key) {
    status.textContent = '❌ API key tidak boleh kosong.';
    status.className = 'ig-apikey-status err';
    return;
  }

  igUpdateActiveProfile({ composioKey: key });
  input.value = '';
  input.placeholder = '••••••••  tersimpan — klik Simpan untuk ganti';
  status.textContent = '✅ API key tersimpan untuk profil ini.';
  status.className = 'ig-apikey-status ok';
  showToast('✅ API Key Composio tersimpan.', 'success');
  igUpdateApiKeyUI();
  igUpdateStepChecks();
  igDriveCheckStatus();
}

/** Tampilkan status API key profil aktif (tanpa menampilkan nilainya) */
function igRestoreApiKeyUI() {
  const input  = document.getElementById('ig_apiKey');
  const status = document.getElementById('igApiKeyStatus');
  if (!input || !status) return;

  if (igGetApiKey()) {
    input.placeholder = '••••••••  tersimpan — klik Simpan untuk ganti';
    status.textContent = '✅ API key sudah tersimpan untuk profil ini.';
    status.className = 'ig-apikey-status ok';
  } else {
    input.placeholder = 'sk-...';
    input.value = '';
    status.textContent = '';
    status.className = 'ig-apikey-status';
  }
  igUpdateApiKeyUI();
  igUpdateStepChecks();
}

/** Sembunyikan/tampilkan input API key berdasarkan status tersimpan & terhubung */
function igUpdateApiKeyUI() {
  const inputRow    = document.getElementById('igApiKeyInputRow');
  const connectedEl = document.getElementById('igApiKeyConnected');
  if (!inputRow || !connectedEl) return;

  const p = igActiveProfile();
  const hasKey     = !!(p && p.composioKey);
  const connected  = !!(p && p.connected);

  if (hasKey && connected) {
    inputRow.classList.add('hidden');
    connectedEl.classList.remove('hidden');
  } else {
    inputRow.classList.remove('hidden');
    connectedEl.classList.add('hidden');
  }
}

/** Ganti API Key — tampilkan kembali input */
function igChangeApiKey() {
  const inputRow    = document.getElementById('igApiKeyInputRow');
  const connectedEl = document.getElementById('igApiKeyConnected');
  const input       = document.getElementById('ig_apiKey');
  if (inputRow)    inputRow.classList.remove('hidden');
  if (connectedEl) connectedEl.classList.add('hidden');
  if (input)       { input.value = ''; input.placeholder = 'sk-...'; input.focus(); }
}

/** Update ceklis setiap step tutorial */
function igUpdateStepChecks() {
  const p = igActiveProfile();
  const hasKey    = !!(p && p.composioKey);
  const connected = !!(p && p.connected);

  // Step 1: daftar Composio — dianggap selesai jika sudah punya key
  igMarkStep('igStep1Num', hasKey);
  // Step 2: masukkan API key — selesai jika key tersimpan
  igMarkStep('igStep2Num', hasKey);
  // Step 3: buka Composio Toolkits — tidak otomatis, tapi jika connected berarti sudah
  igMarkStep('igStep3Num', connected);
  // Step 4: OAuth — selesai jika connected
  igMarkStep('igStep4Num', connected);
}

function igMarkStep(numElId, done) {
  const el = document.getElementById(numElId);
  if (!el) return;
  if (done) {
    el.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
    el.classList.add('ig-step-num--done');
  } else {
    // restore number from the step element order
    const step = el.closest('.ig-step');
    if (step) {
      const steps = Array.from(document.querySelectorAll('.ig-setup-steps .ig-step'));
      const idx = steps.indexOf(step);
      el.textContent = idx + 1;
    }
    el.classList.remove('ig-step-num--done');
  }
}

/** Headers untuk request Instagram — sertakan API key profil aktif */
function igApiHeaders(extra = {}) {
  const headers = { ...extra };
  const key = igGetApiKey();
  if (key) headers['X-Composio-Key'] = key;
  return headers;
}

/** Cek API key sebelum aksi yang butuh Composio; return false bila belum ada */
function igRequireApiKey() {
  if (igGetApiKey()) return true;
  showToast('❌ Masukkan API Key Composio untuk profil ini terlebih dahulu.', 'error');
  const input = document.getElementById('ig_apiKey');
  if (input) input.focus();
  return false;
}

/* ══════════════════════════════════════════════════════════
   FUNCTION DEFINITIONS
══════════════════════════════════════════════════════════ */
const FN_CONFIG = {
  'konsultan-pembelian': {
    label: 'Konsultan Pembelian',
    subtitle: 'Analisis kelayakan beli & estimasi harga jual terbaik',
    endpoint: 'konsultan-pembelian'
  },
  'penilai-harga': {
    label: 'Penilai Harga Jual',
    subtitle: 'Rekomendasi harga jual optimal berdasarkan kondisi & minus produk',
    endpoint: 'penilai-harga'
  },
  'estimasi-ongkir': {
    label: 'Estimasi Ongkir',
    subtitle: 'Rekomendasi jasa kirim & estimasi ongkos pengiriman',
    endpoint: 'estimasi-ongkir'
  },
  'analisis-pasar': {
    label: 'Analisis Harga Pasar',
    subtitle: 'Bandingkan harga produk di Tokopedia, Shopee, OLX, Facebook Marketplace',
    endpoint: 'analisis-pasar'
  },
  'caption-posting': {
    label: 'Caption Posting',
    subtitle: 'Generate deskripsi produk & caption promosi siap posting',
    endpoint: 'caption-posting'
  },
  'foto-editor': {
    label: 'Studio Foto Editor',
    subtitle: 'Validasi otomatis, komposisi foto produk & latar, penyesuaian cahaya & bayangan berbasis AI',
    endpoint: null
  },
  'ig-autopost': {
    label: 'Post IG',
    subtitle: 'Posting produk otomatis ke Instagram via Composio',
    endpoint: null
  },
  inbox: {
    label: 'Inbox Pesan',
    subtitle: 'Tinjau dan balas pesan Messenger dan Instagram',
    endpoint: null
  },
  'ai-agent': {
    label: 'AI Agent',
    subtitle: 'Tanyakan apapun tentang resell — AI agent akan membimbing',
    endpoint: 'ai-agent'
  }
};

/* ══════════════════════════════════════════════════════════
   STATE
══════════════════════════════════════════════════════════ */
let currentFn = 'konsultan-pembelian';
let isLoading  = false;
const photoEditorState = {
  file: null,
  imageDataUrl: '',
  previewUrl: '',
  accepted: null,
  itemPhotoContextId: null,       // context_id untuk Studio Foto Editor
  identifiedItem: '',             // identified_item_name dari validator
  itemCategory: '',               // item_category dari validator
  suggestedBackgrounds: [],       // suggested_backgrounds dari validator
  resultUrl: '',
  // background foto kustom
  bgFile: null,
  bgImageDataUrl: '',
  bgPreviewUrl: '',
  bgPhotoContextId: null
};

const APP_SESSION_KEY = 'resell_app_session_v1';
const APP_SHARED_INPUTS = {
  productName: ['kp_productName', 'ph_productName', 'eo_productName', 'ap_productName', 'cp_productName', 'ig_prodName'],
  buyPrice: ['kp_buyPrice', 'ph_buyPrice'],
  condition: ['kp_condition', 'ph_condition', 'ap_condition', 'cp_condition', 'ig_condition'],
  specs: ['kp_specs', 'ph_specs', 'ap_specs', 'cp_specs', 'ig_specs'],
  sellingPrice: ['cp_price', 'ig_price'],
  sellingPoints: ['cp_sellingPoints', 'ig_sellingPoints']
};
let appSession = { inputs: {}, sharedInputs: {}, outputs: {}, igContentCards: [] };
let appSessionStorageWarningShown = false;

function appSessionLoad() {
  try {
    const saved = JSON.parse(localStorage.getItem(APP_SESSION_KEY) || 'null');
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return appSession;
    return {
      inputs: saved.inputs && typeof saved.inputs === 'object' ? saved.inputs : {},
      sharedInputs: saved.sharedInputs && typeof saved.sharedInputs === 'object' ? saved.sharedInputs : {},
      outputs: saved.outputs && typeof saved.outputs === 'object' ? saved.outputs : {},
      igContentCards: Array.isArray(saved.igContentCards) ? saved.igContentCards : []
    };
  } catch (error) {
    console.error('[app-session:load]', error);
    showToast('Sesi input sebelumnya tidak dapat dibaca. Data sesi baru akan disimpan di browser ini.', 'error');
    return appSession;
  }
}

function appSessionPersist() {
  try {
    localStorage.setItem(APP_SESSION_KEY, JSON.stringify(appSession));
    appSessionStorageWarningShown = false;
  } catch (error) {
    console.error('[app-session:save]', error);
    if (!appSessionStorageWarningShown) {
      appSessionStorageWarningShown = true;
      showToast('Perubahan belum tersimpan di browser. Kosongkan ruang penyimpanan lalu coba lagi.', 'error');
    }
  }
}

function appSessionOpenFilesDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('resell_app_session_files', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('files');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Database foto sesi tidak dapat dibuka.'));
  });
}

async function appSessionSaveAgentImage(file) {
  const db = await appSessionOpenFilesDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('files', 'readwrite');
    transaction.objectStore('files').put(file, 'agent-image');
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      const error = transaction.error || new Error('Foto sesi tidak dapat disimpan.');
      db.close();
      reject(error);
    };
    transaction.onabort = () => {
      const error = transaction.error || new Error('Penyimpanan foto sesi dibatalkan.');
      db.close();
      reject(error);
    };
  });
}

async function appSessionLoadAgentImage() {
  const db = await appSessionOpenFilesDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('files', 'readonly');
    const request = transaction.objectStore('files').get('agent-image');
    let imageFile = null;
    request.onsuccess = () => { imageFile = request.result || null; };
    transaction.oncomplete = () => {
      db.close();
      resolve(imageFile);
    };
    transaction.onerror = () => {
      const error = transaction.error || new Error('Foto sesi tidak dapat dibaca.');
      db.close();
      reject(error);
    };
    transaction.onabort = () => {
      const error = transaction.error || new Error('Pembacaan foto sesi dibatalkan.');
      db.close();
      reject(error);
    };
  });
}

async function appSessionDeleteAgentImage() {
  const db = await appSessionOpenFilesDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('files', 'readwrite');
    transaction.objectStore('files').delete('agent-image');
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      const error = transaction.error || new Error('Foto sesi tidak dapat dihapus.');
      db.close();
      reject(error);
    };
    transaction.onabort = () => {
      const error = transaction.error || new Error('Penghapusan foto sesi dibatalkan.');
      db.close();
      reject(error);
    };
  });
}

function appSessionInitInputs() {
  appSession = appSessionLoad();
  const controls = [...document.querySelectorAll(
    '#extraFields input[id]:not([type="file"]):not([type="password"]), #extraFields select[id], #extraFields textarea[id]'
  )];
  const controlsById = new Map(controls.map(control => [control.id, control]));
  const sharedFieldIds = new Set(Object.values(APP_SHARED_INPUTS).flat());

  Object.entries(APP_SHARED_INPUTS).forEach(([key, ids]) => {
    const hasSharedValue = Object.prototype.hasOwnProperty.call(appSession.sharedInputs, key);
    const legacyValue = ids
      .map(id => appSession.inputs[id])
      .find(value => value !== undefined && value !== '');
    const value = hasSharedValue ? appSession.sharedInputs[key] : legacyValue;
    if (value === undefined) return;
    ids.forEach(id => {
      const control = controlsById.get(id);
      if (control) control.value = value;
      appSession.inputs[id] = value;
    });
    appSession.sharedInputs[key] = value;
  });

  controls.forEach(control => {
    if (!sharedFieldIds.has(control.id)
        && Object.prototype.hasOwnProperty.call(appSession.inputs, control.id)) {
      control.value = appSession.inputs[control.id];
    }
    const saveInput = () => appSessionSaveInput(control);
    control.addEventListener('input', saveInput);
    control.addEventListener('change', saveInput);
  });
}

function appSessionSaveInput(control) {
  const sharedEntry = Object.entries(APP_SHARED_INPUTS).find(([, ids]) => ids.includes(control.id));
  const value = control.value;
  if (sharedEntry) {
    const [key, ids] = sharedEntry;
    appSession.sharedInputs[key] = value;
    ids.forEach(id => {
      const relatedControl = document.getElementById(id);
      if (relatedControl && relatedControl !== control) relatedControl.value = value;
      appSession.inputs[id] = value;
    });
  } else {
    appSession.inputs[control.id] = value;
  }
  appSessionPersist();
}

function appSessionSetInputValue(id, value) {
  const control = document.getElementById(id);
  if (!control) return;
  control.value = value;
  appSessionSaveInput(control);
}

// IG state — Proxy ke profil aktif.
// Semua baca/tulis igState.xxx otomatis tersimpan ke profil yang sedang aktif.
// Mapping: userId → composioUserId, username → igUsername.
const igState = new Proxy({}, {
  get(_, prop) {
    const p = (typeof igActiveProfile === 'function') ? igActiveProfile() : null;
    if (!p) return null;
    const map = { userId: 'composioUserId', username: 'igUsername' };
    const v = p[map[prop] || prop];
    return v ?? null;
  },
  set(_, prop, value) {
    const map = { userId: 'composioUserId', username: 'igUsername' };
    if (typeof igUpdateActiveProfile === 'function') {
      igUpdateActiveProfile({ [map[prop] || prop]: value });
    }
    return true;
  }
});

/* ══════════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  appSessionInitInputs();
  igContentCards = appSession.igContentCards;
  igRenderContentCards();

  // Inisialisasi profil IG (termasuk migrasi otomatis dari state lama)
  igRenderProfileSelect();
  igRestoreApiKeyUI();
  igUpdateUI();          // populate profile card dengan data tersimpan di localStorage

  switchFn('konsultan-pembelian');
  checkHealth();

  // Handle IG OAuth callback redirects (?ig_connected=1 or ?ig_error=...)
  igHandleCallbackParams();
  inboxInit();

  // Sidebar nav items
  document.querySelectorAll('.nav-item[data-fn]').forEach(btn => {
    btn.addEventListener('click', () => {
      switchFn(btn.dataset.fn);
      document.getElementById('sidebar').classList.remove('open');
    });
  });

  // Run buttons
  document.getElementById('runBtn').addEventListener('click', runCurrentFn);
  document.getElementById('agentRunBtn')?.addEventListener('click', runCurrentFn);

  // Mobile sidebar toggle
  document.getElementById('sidebarToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });

  // AI Agent — image drop zone
  agentImgInit();
  photoEditorInit();
  igDriveInit();
});

/* ══════════════════════════════════════════════════════════
   AI AGENT IMAGE UPLOAD
══════════════════════════════════════════════════════════ */
function agentImgInit() {
  const drop    = document.getElementById('agentImgDrop');
  const input   = document.getElementById('agentImgInput');
  const ph      = document.getElementById('agentImgPlaceholder');
  const preview = document.getElementById('agentImgPreview');
  const thumb   = document.getElementById('agentImgThumb');
  const nameEl  = document.getElementById('agentImgName');
  const removeBtn = document.getElementById('agentImgRemove');
  if (!drop) return;

  const loadFile = (file, persist = true) => {
    if (!file || !file.type.startsWith('image/')) {
      showToast('◉ File harus berupa gambar (JPG/PNG/WEBP)', 'error'); return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('◉ Ukuran gambar maks 5 MB', 'error'); return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      thumb.src = e.target.result;
      nameEl.textContent = file.name;
      ph.classList.add('hidden');
      preview.classList.remove('hidden');
      if (persist) {
        appSessionSaveAgentImage(file).catch(error => {
          console.error('[app-session:save-agent-image]', error);
          showToast('Foto AI Agent tampil, tetapi belum tersimpan untuk sesi berikutnya.', 'error');
        });
      }
    };
    reader.readAsDataURL(file);
  };

  drop.addEventListener('click', e => {
    if (e.target === removeBtn || removeBtn.contains(e.target)) return;
    input.click();
  });
  drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') input.click(); });
  input.addEventListener('change', () => { if (input.files[0]) loadFile(input.files[0]); });

  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('is-drag'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-drag'));
  drop.addEventListener('drop', e => {
    e.preventDefault();
    drop.classList.remove('is-drag');
    if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
  });

  removeBtn.addEventListener('click', e => {
    e.stopPropagation();
    thumb.src = '';
    nameEl.textContent = '';
    input.value = '';
    preview.classList.add('hidden');
    ph.classList.remove('hidden');
    appSessionDeleteAgentImage().catch(error => {
      console.error('[app-session:delete-agent-image]', error);
      showToast('Foto dihapus dari tampilan, tetapi data sesinya gagal dihapus.', 'error');
    });
  });

  appSessionLoadAgentImage().then(file => {
    if (file) loadFile(file, false);
  }).catch(error => {
    console.error('[app-session:load-agent-image]', error);
    showToast('Foto AI Agent dari sesi sebelumnya tidak dapat dipulihkan.', 'error');
  });
}

function photoEditorInit() {
  const input = document.getElementById('photoEditorInput');
  const drop = document.getElementById('photoEditorDrop');
  if (!input || !drop) return;

  // ── Muat & auto-validasi foto barang ──
  const loadItemFile = file => {
    if (!file) return;
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      showToast('Pilih foto JPG, PNG, atau WEBP.', 'error');
      return;
    }
    if (file.size > 7 * 1024 * 1024) {
      showToast('Ukuran foto maksimal 7 MB.', 'error');
      return;
    }

    if (photoEditorState.previewUrl) URL.revokeObjectURL(photoEditorState.previewUrl);
    photoEditorState.file = file;
    photoEditorState.imageDataUrl = '';
    photoEditorState.accepted = null;
    photoEditorState.itemPhotoContextId = null;
    photoEditorState.resultUrl = '';
    photoEditorState.previewUrl = URL.createObjectURL(file);

    document.getElementById('photoSourcePreview').src = photoEditorState.previewUrl;
    document.getElementById('photoFileName').textContent = file.name;
    document.getElementById('photoValidateStatus').textContent = 'Memvalidasi foto…';
    document.getElementById('photoUploadPreview').classList.remove('hidden');
    document.getElementById('photoEditorDrop').classList.add('has-photo');
    document.getElementById('photoEditorStatus').textContent = 'Membaca foto…';
    resetPhotoResult();
    updatePhotoEditorButton();

    const reader = new FileReader();
    reader.onload = () => {
      if (photoEditorState.file === file && typeof reader.result === 'string') {
        photoEditorState.imageDataUrl = reader.result;
        updatePhotoEditorButton();
        // Auto-validasi segera setelah data URL siap
        _autoValidateItemPhoto();
      }
    };
    reader.onerror = () => {
      if (photoEditorState.file === file) {
        photoEditorState.imageDataUrl = '';
        document.getElementById('photoEditorStatus').textContent = 'Foto gagal dibaca. Coba unggah ulang.';
        showToast('Foto tidak dapat dibaca oleh browser.', 'error');
        updatePhotoEditorButton();
      }
    };
    reader.readAsDataURL(file);
  };

  input.addEventListener('change', () => { loadItemFile(input.files && input.files[0]); input.value = ''; });
  drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('is-drag'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-drag'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('is-drag'); loadItemFile(e.dataTransfer?.files[0]); });
  document.getElementById('photoRemoveBtn').addEventListener('click', clearPhotoEditorFile);

  // ── Latar belakang: toggle warna / foto kustom ──
  document.getElementById('photoBackground').addEventListener('change', event => {
    const val = event.target.value;
    document.getElementById('photoColorField').classList.toggle('hidden', val !== 'solid');
    document.getElementById('photoBgImageField').classList.toggle('hidden', val !== 'custom-image');
  });
  document.getElementById('photoBackgroundColor').addEventListener('input', event => {
    document.getElementById('photoBackgroundColorValue').textContent = event.target.value.toUpperCase();
  });

  // ── Upload foto latar kustom ──
  const bgInput = document.getElementById('photoBgInput');
  const bgDrop  = document.getElementById('photoBgDrop');
  if (bgInput && bgDrop) {
    const loadBgFile = file => {
      if (!file) return;
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        showToast('Pilih foto latar JPG, PNG, atau WEBP.', 'error');
        return;
      }
      if (file.size > 7 * 1024 * 1024) {
        showToast('Ukuran foto latar maksimal 7 MB.', 'error');
        return;
      }
      if (photoEditorState.bgPreviewUrl) URL.revokeObjectURL(photoEditorState.bgPreviewUrl);
      photoEditorState.bgFile = file;
      photoEditorState.bgImageDataUrl = '';
      photoEditorState.bgPreviewUrl = URL.createObjectURL(file);
      photoEditorState.bgPhotoContextId = `bg_${Date.now()}`;

      document.getElementById('photoBgSourcePreview').src = photoEditorState.bgPreviewUrl;
      document.getElementById('photoBgFileName').textContent = file.name;
      document.getElementById('photoBgPreview').classList.remove('hidden');
      bgDrop.classList.add('has-photo');

      const r = new FileReader();
      r.onload = () => {
        if (photoEditorState.bgFile === file) {
          photoEditorState.bgImageDataUrl = r.result;
          updatePhotoEditorButton();
        }
      };
      r.readAsDataURL(file);
    };
    bgInput.addEventListener('change', () => { loadBgFile(bgInput.files?.[0]); bgInput.value = ''; });
    bgDrop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); bgInput.click(); } });
    bgDrop.addEventListener('dragover', e => { e.preventDefault(); bgDrop.classList.add('is-drag'); });
    bgDrop.addEventListener('dragleave', () => bgDrop.classList.remove('is-drag'));
    bgDrop.addEventListener('drop', e => { e.preventDefault(); bgDrop.classList.remove('is-drag'); loadBgFile(e.dataTransfer?.files[0]); });
    document.getElementById('photoBgRemoveBtn').addEventListener('click', clearPhotoBgFile);
  }

  // ── Sliders ──
  const sliders = [
    ['photoLighting', 'photoLightingValue', v => `${v}%`],
    ['photoShadow', 'photoShadowValue', v => `${v}%`],
    ['photoTemperature', 'photoTemperatureValue', v => {
      const n = Number(v);
      return n === 0 ? 'Netral' : `${n > 0 ? 'Hangat' : 'Dingin'} ${Math.abs(n)}`;
    }]
  ];
  sliders.forEach(([inputId, outputId, format]) => {
    const ctrl = document.getElementById(inputId);
    const out  = document.getElementById(outputId);
    ctrl.addEventListener('input', () => { out.textContent = format(ctrl.value); });
  });

  updatePhotoEditorButton();
}

function _applyValidationResult(validation, status, validateStatus) {
  photoEditorState.accepted         = validation.accepted;
  photoEditorState.identifiedItem   = validation.identified_item  || '';
  photoEditorState.itemCategory     = validation.item_category    || '';
  photoEditorState.suggestedBackgrounds = validation.suggested_backgrounds || [];

  // Buat item_photo_context_id dari nama barang
  const slug = photoEditorState.identifiedItem
    ? photoEditorState.identifiedItem.replace(/\s+/g, '_').toLowerCase()
    : 'photo';
  photoEditorState.itemPhotoContextId = `item_${slug}_${Date.now()}`;

  if (!validation.accepted) {
    const reason = validation.reason || 'Foto tidak mengandung barang yang dapat dijual.';
    if (status)        status.textContent        = `Foto tidak layak: ${reason}`;
    if (validateStatus) validateStatus.textContent = '❌ Tidak layak';
    showToast('Foto tidak lolos validasi.', 'error');
  } else {
    const itemName  = photoEditorState.identifiedItem ? ` — ${photoEditorState.identifiedItem}` : '';
    const catName   = photoEditorState.itemCategory   ? ` (${photoEditorState.itemCategory})`   : '';
    if (status)        status.textContent        = `Foto layak${itemName}${catName}. Pilih latar, lalu tekan Proses Foto.`;
    if (validateStatus) validateStatus.textContent = '✅ Lolos validasi';
    showToast(`Foto lolos validasi${itemName}.`, 'success');
    // Tambahkan suggested_backgrounds ke dropdown jika ada
    _populateSuggestedBackgrounds(photoEditorState.suggestedBackgrounds);
  }
}

function _populateSuggestedBackgrounds(suggestions) {
  const select = document.getElementById('photoBackground');
  if (!select || !Array.isArray(suggestions) || !suggestions.length) return;

  // Hapus opsi saran sebelumnya
  Array.from(select.options).forEach(o => { if (o.dataset.suggested) o.remove(); });

  suggestions.forEach(bg => {
    const label = bg.description || bg.bg_type || 'Saran AI';
    const option = document.createElement('option');
    option.value = `suggested_${bg.bg_type || 'ai'}`;
    option.textContent = `✨ ${label}`;
    option.dataset.suggested = '1';
    option.dataset.colorHex  = bg.bg_color_hex || '#FFFFFF';
    // Sisipkan tepat sebelum "Foto latar sendiri"
    const customOpt = Array.from(select.options).find(o => o.value === 'custom-image');
    if (customOpt) select.insertBefore(option, customOpt);
    else select.appendChild(option);
  });
}

async function _autoValidateItemPhoto() {
  if (!photoEditorState.imageDataUrl || isLoading) return;
  const status = document.getElementById('photoEditorStatus');
  const validateStatus = document.getElementById('photoValidateStatus');
  status.textContent = 'AI sedang memvalidasi foto…';
  if (validateStatus) validateStatus.textContent = 'Memvalidasi…';
  updatePhotoEditorButton();

  try {
    const response = await fetch(`${API_BASE}/foto-editor/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_base64: photoEditorState.imageDataUrl })
    });
    const data = await _safeJsonResponse(response);
    if (!response.ok || data.error) throw new Error(data.error || 'Validasi gagal.');

    const validation = data.validation;
    if (!validation || typeof validation.accepted !== 'boolean') {
      throw new Error('Flow Validator Foto mengirim hasil yang tidak dikenali.');
    }

    _applyValidationResult(validation, status, validateStatus);
  } catch (err) {
    photoEditorState.accepted = null;
    // Beri pesan bersih — sembunyikan detail teknis dari user
    const msg = err.message || 'Terjadi kesalahan saat menghubungi server.';
    status.textContent = `Validasi gagal: ${msg}`;
    if (validateStatus) validateStatus.textContent = 'Gagal — coba manual';
    showToast(msg, 'error');
  } finally {
    updatePhotoEditorButton();
  }
}

function clearPhotoEditorFile() {
  if (photoEditorState.previewUrl) URL.revokeObjectURL(photoEditorState.previewUrl);
  photoEditorState.file = null;
  photoEditorState.imageDataUrl = '';
  photoEditorState.previewUrl = '';
  photoEditorState.accepted = null;
  photoEditorState.itemPhotoContextId = null;
  photoEditorState.identifiedItem = '';
  photoEditorState.itemCategory = '';
  photoEditorState.suggestedBackgrounds = [];
  photoEditorState.resultUrl = '';
  document.getElementById('photoSourcePreview').removeAttribute('src');
  document.getElementById('photoUploadPreview').classList.add('hidden');
  document.getElementById('photoEditorDrop').classList.remove('has-photo');
  document.getElementById('photoEditorStatus').textContent = 'Unggah foto produk untuk memulai validasi otomatis.';
  // Hapus suggested background options dari dropdown
  const select = document.getElementById('photoBackground');
  if (select) Array.from(select.options).forEach(o => { if (o.dataset.suggested) o.remove(); });
  resetPhotoResult();
  updatePhotoEditorButton();
}

function clearPhotoBgFile() {
  if (photoEditorState.bgPreviewUrl) URL.revokeObjectURL(photoEditorState.bgPreviewUrl);
  photoEditorState.bgFile = null;
  photoEditorState.bgImageDataUrl = '';
  photoEditorState.bgPreviewUrl = '';
  photoEditorState.bgPhotoContextId = null;
  document.getElementById('photoBgSourcePreview').removeAttribute('src');
  document.getElementById('photoBgPreview').classList.add('hidden');
  document.getElementById('photoBgDrop').classList.remove('has-photo');
  updatePhotoEditorButton();
}

function resetPhotoResult() {
  const image = document.getElementById('photoResultImage');
  image.removeAttribute('src');
  image.classList.add('hidden');
  document.getElementById('photoResultEmpty').classList.remove('hidden');
  document.getElementById('photoResultEmpty').textContent = 'Pratinjau hasil edit akan muncul di sini.';
  document.getElementById('photoDownloadBtn').classList.add('hidden');
  document.getElementById('photoResultCaption').textContent = 'Hasil akhir akan tampil setelah pemrosesan selesai.';
  const ctx = document.getElementById('photoContextPanel');
  if (ctx) ctx.classList.add('hidden');
}

function updatePhotoEditorButton() {
  const button = document.getElementById('runBtn');
  if (!button || currentFn !== 'foto-editor' || isLoading) return;
  const text = document.getElementById('runText');
  const bgSelect = document.getElementById('photoBackground');
  const isCustomBg = bgSelect && bgSelect.value === 'custom-image';
  const bgReady = !isCustomBg || (photoEditorState.bgImageDataUrl !== '');

  if (photoEditorState.accepted === true) {
    text.textContent = 'Proses Foto';
    button.disabled = !bgReady;
  } else if (photoEditorState.accepted === false) {
    text.textContent = 'Foto Tidak Layak';
    button.disabled = true;
  } else {
    text.textContent = 'Validasi Foto';
    // Jika ada file tapi belum ada dataUrl (masih dibaca), disable
    button.disabled = !photoEditorState.file || !photoEditorState.imageDataUrl;
  }
}

async function _safeJsonResponse(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    // Non-JSON body (HTML error page, rate-limit, proxy error, etc.)
    if (response.status === 404) throw new Error('Endpoint tidak ditemukan (404). Restart server backend agar route foto terdaftar.');
    if (response.status === 413) throw new Error('Foto terlalu besar untuk dikirim. Kompres atau perkecil ukuran foto.');
    if (response.status === 429) throw new Error('Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.');
    if (response.status === 503) throw new Error('Layanan belum dikonfigurasi. Periksa FLOW_FOTO_VALIDATOR dan REMOVE_BG_API_KEY di backend/config.env.');
    throw new Error(`Server mengembalikan respons tidak valid (HTTP ${response.status}). Pastikan backend sudah di-restart.`);
  }
}

async function photoEditorRequest(endpoint, payload) {
  const response = await fetch(`${API_BASE}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await _safeJsonResponse(response);
  if (!response.ok || data.error) throw new Error(data.error || 'Permintaan pemrosesan foto gagal.');
  return data;
}

function renderCompositingContext(ctx) {
  const grid = document.getElementById('photoContextGrid');
  const panel = document.getElementById('photoContextPanel');
  if (!grid || !panel || !ctx) return;

  const fmt = v => (v === null || v === undefined) ? '—' : String(v);
  const rows = [
    ['Item ID',             ctx.source_inputs?.item_id],
    ['Background ID',       ctx.source_inputs?.background_id],
    ['Sudut Cahaya',        ctx.lighting_analysis?.light_source_angle_degrees != null ? `${ctx.lighting_analysis.light_source_angle_degrees}°` : null],
    ['Intensitas Cahaya',   ctx.lighting_analysis?.light_intensity],
    ['Temperatur Warna',    ctx.lighting_analysis?.color_temperature],
    ['Brightness',          ctx.image_adjustments?.brightness != null ? `${ctx.image_adjustments.brightness > 0 ? '+' : ''}${ctx.image_adjustments.brightness}` : null],
    ['Contrast',            ctx.image_adjustments?.contrast != null ? `${ctx.image_adjustments.contrast > 0 ? '+' : ''}${ctx.image_adjustments.contrast}` : null],
    ['Saturation',          ctx.image_adjustments?.saturation != null ? `${ctx.image_adjustments.saturation > 0 ? '+' : ''}${ctx.image_adjustments.saturation}` : null],
    ['Exposure',            ctx.image_adjustments?.exposure != null ? `${ctx.image_adjustments.exposure > 0 ? '+' : ''}${ctx.image_adjustments.exposure}` : null],
    ['Temp Shift',          ctx.image_adjustments?.color_temperature_shift != null ? `${ctx.image_adjustments.color_temperature_shift > 0 ? '+' : ''}${ctx.image_adjustments.color_temperature_shift}` : null],
    ['Bayangan Aktif',      ctx.drop_shadow_params?.enable_shadow != null ? (ctx.drop_shadow_params.enable_shadow ? 'Ya' : 'Tidak') : null],
    ['Jarak Bayangan',      ctx.drop_shadow_params?.shadow_distance_px != null ? `${ctx.drop_shadow_params.shadow_distance_px}px` : null],
    ['Blur Bayangan',       ctx.drop_shadow_params?.shadow_blur_px != null ? `${ctx.drop_shadow_params.shadow_blur_px}px` : null],
    ['Opasitas Bayangan',   ctx.drop_shadow_params?.shadow_opacity != null ? `${Math.round(ctx.drop_shadow_params.shadow_opacity * 100)}%` : null],
    ['CSS Filter',          ctx.css_filter_string]
  ];

  grid.innerHTML = rows.map(([label, value]) =>
    `<div class="photo-ctx-row"><span class="photo-ctx-lbl">${escapeHtml(label)}</span><span class="photo-ctx-val">${escapeHtml(fmt(value))}</span></div>`
  ).join('');

  panel.classList.remove('hidden');
}

// ── Helper: muat gambar dari data URL ke HTMLImageElement ──────────────────
function _loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error('Gagal memuat gambar untuk komposisi.'));
    img.src = dataUrl;
  });
}

// ── Helper: komposit objek (PNG transparan) di atas background via Canvas ──
async function _compositeOnCanvas(fgDataUrl, bgDataUrl, bgColor, lightingPct, shadowPct, temperaturePct) {
  const fgImg = await _loadImage(fgDataUrl);
  const W = fgImg.naturalWidth  || fgImg.width;
  const H = fgImg.naturalHeight || fgImg.height;

  const canvas = document.createElement('canvas');
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // 1. Latar belakang
  if (bgDataUrl) {
    const bgImg = await _loadImage(bgDataUrl);
    // Cover: skala dan crop ke tengah
    const scale = Math.max(W / bgImg.naturalWidth, H / bgImg.naturalHeight);
    const bw = bgImg.naturalWidth  * scale;
    const bh = bgImg.naturalHeight * scale;
    ctx.drawImage(bgImg, (W - bw) / 2, (H - bh) / 2, bw, bh);
  } else {
    ctx.fillStyle = bgColor || '#FFFFFF';
    ctx.fillRect(0, 0, W, H);
  }

  // 2. Drop-shadow (bayangan di bawah objek)
  if (shadowPct > 0) {
    const blur   = Math.round(10 + shadowPct * 0.3);
    const offset = Math.round(shadowPct * 0.15);
    const alpha  = (shadowPct / 100 * 0.55).toFixed(2);
    ctx.save();
    ctx.shadowColor   = `rgba(26,26,36,${alpha})`;
    ctx.shadowBlur    = blur;
    ctx.shadowOffsetX = offset;
    ctx.shadowOffsetY = offset * 2;
    ctx.drawImage(fgImg, 0, 0, W, H);
    ctx.restore();
  }

  // 3. Objek utama
  const brightness  = (lightingPct / 100).toFixed(2);        // 0.7–1.4
  const contrast    = (0.9 + (lightingPct - 100) * 0.002).toFixed(2);
  const saturate    = (0.9 + (lightingPct - 100) * 0.003).toFixed(2);
  const hueShift    = Math.round(temperaturePct * 1.2);       // -60..+60 deg

  ctx.save();
  ctx.filter = `brightness(${brightness}) contrast(${contrast}) saturate(${saturate}) hue-rotate(${hueShift}deg)`;
  ctx.drawImage(fgImg, 0, 0, W, H);
  ctx.restore();

  return canvas.toDataURL('image/png');
}

async function runPhotoEditor() {
  if (!photoEditorState.file || !photoEditorState.imageDataUrl) {
    showToast('Unggah foto barang yang valid sebelum melanjutkan.', 'error');
    return;
  }
  const status = document.getElementById('photoEditorStatus');
  const fn = 'foto-editor';
  setLoading(true, fn);

  try {
    // ── Tahap 1: Validasi manual (jika belum accepted) ──────────────────────
    if (photoEditorState.accepted !== true) {
      status.textContent = 'AI sedang memvalidasi foto barang…';
      const data = await photoEditorRequest('foto-editor/validate', {
        image_base64: photoEditorState.imageDataUrl
      });
      const validation = data.validation;
      if (!validation || typeof validation.accepted !== 'boolean') {
        throw new Error('Flow Validator Foto mengirim hasil yang tidak dikenali.');
      }
      _applyValidationResult(validation, status, document.getElementById('photoValidateStatus'));
      if (!validation.accepted) return;
      return; // Kembalikan ke user agar bisa pilih latar dulu
    }

    // ── Tahap 2: Hapus background via remove.bg ──────────────────────────────
    const bgSelect    = document.getElementById('photoBackground');
    const bgValue     = bgSelect.value;
    const isCustomBg  = bgValue === 'custom-image';
    const isSuggested = bgValue.startsWith('suggested_');

    if (isCustomBg && !photoEditorState.bgImageDataUrl) {
      showToast('Unggah foto latar kustom sebelum memproses.', 'error');
      return;
    }

    status.textContent = 'Memindai objek dan menghapus latar belakang…';
    document.getElementById('photoResultEmpty').textContent = 'Menghapus latar belakang…';

    const removeBgData = await photoEditorRequest('foto-editor/remove-bg', {
      image_base64: photoEditorState.imageDataUrl
    });
    if (!removeBgData.image_base64 || !removeBgData.image_base64.startsWith('data:image/png')) {
      throw new Error('Hapus background tidak mengembalikan gambar PNG yang valid.');
    }
    const fgDataUrl = removeBgData.image_base64;  // PNG transparan

    // ── Tahap 3: Komposit objek + background via Canvas ──────────────────────
    status.textContent = 'Menyusun komposisi dengan latar pilihan…';
    document.getElementById('photoResultEmpty').textContent = 'Menyusun komposisi…';

    let resolvedBgColor = document.getElementById('photoBackgroundColor').value;
    let resolvedBgImage = null;

    if (isSuggested) {
      resolvedBgColor = bgSelect.options[bgSelect.selectedIndex]?.dataset?.colorHex || '#FFFFFF';
    } else if (isCustomBg && photoEditorState.bgImageDataUrl) {
      resolvedBgImage = photoEditorState.bgImageDataUrl;
    } else if (bgValue === 'studio-cream') {
      resolvedBgColor = '#F5F0E8';
    } else if (bgValue === 'studio-cool') {
      resolvedBgColor = '#E8ECF0';
    } else if (bgValue === 'marketplace-white') {
      resolvedBgColor = '#FFFFFF';
    } else if (bgValue === 'lifestyle-warm') {
      resolvedBgColor = '#EDE8E0';
    }

    const lightingVal     = Number(document.getElementById('photoLighting').value);
    const shadowVal       = Number(document.getElementById('photoShadow').value);
    const temperatureVal  = Number(document.getElementById('photoTemperature').value);

    const compositeDataUrl = await _compositeOnCanvas(
      fgDataUrl, resolvedBgImage, resolvedBgColor,
      lightingVal, shadowVal, temperatureVal
    );

    // ── Tampilkan hasil ──────────────────────────────────────────────────────
    photoEditorState.resultUrl = compositeDataUrl;
    const resultImage = document.getElementById('photoResultImage');
    resultImage.src = compositeDataUrl;
    resultImage.classList.remove('hidden');
    document.getElementById('photoResultEmpty').classList.add('hidden');
    document.getElementById('photoResultCaption').textContent = 'Komposisi selesai — latar baru, pencahayaan, dan bayangan telah diterapkan.';
    const download = document.getElementById('photoDownloadBtn');
    download.href     = compositeDataUrl;
    download.download = 'resell-studio-foto.png';
    download.classList.remove('hidden');
    status.textContent = 'Foto selesai diproses dan siap diunduh.';
    showToast('Foto berhasil diproses.', 'success');

  } catch (error) {
    console.error('[foto-editor]', error);
    status.textContent = error.message || 'Terjadi masalah saat memproses foto.';
    showToast(status.textContent, 'error');
  } finally {
    setLoading(false, fn);
    updatePhotoEditorButton();
  }
}

/* ══════════════════════════════════════════════════════════
   SWITCH FUNCTION
══════════════════════════════════════════════════════════ */
function switchFn(fn) {
  if (!FN_CONFIG[fn]) return;
  currentFn = fn;
  const cfg = FN_CONFIG[fn];

  const fnIcon = document.getElementById('fnIcon');
  if (fn === 'foto-editor') {
    fnIcon.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>';
    fnIcon.dataset.photoIcon = 'true';
  } else if (fnIcon.dataset.photoIcon === 'true') {
    fnIcon.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>';
    delete fnIcon.dataset.photoIcon;
  }
  document.getElementById('fnTitle').textContent    = cfg.label;
  document.getElementById('fnSubtitle').textContent = cfg.subtitle;

  // Show main run button for all fns except ai-agent & ig-autopost; show agent inline button for ai-agent
  const runBtn     = document.getElementById('runBtn');
  const agentRunBtn = document.getElementById('agentRunBtn');
  const isAgent  = fn === 'ai-agent';
  const isIgPost = fn === 'ig-autopost';
  const isPhotoEditor = fn === 'foto-editor';
  const isInbox = fn === 'inbox';
  runBtn.classList.toggle('hidden', isAgent || isIgPost || isInbox);
  if (agentRunBtn) agentRunBtn.classList.toggle('hidden', !isAgent);
  document.getElementById('mainContent').classList.toggle('is-inbox', isInbox);
  document.getElementById('inboxWorkspace').classList.toggle('hidden', !isInbox);

  // Update run button — color driven by CSS data-fn, no inline gradient
  runBtn.dataset.fn = fn;
  runBtn.style.background = ''; // let CSS handle it
  document.getElementById('runText').textContent = cfg.label;

  // Update output label (text only — no emoji prefix)
  document.getElementById('outputFnLabel').textContent = cfg.label;

  // Show/hide IG content area
  const igContentArea = document.getElementById('igContentArea');
  if (igContentArea) {
    // Only show if ig-autopost AND there are cards
    if (!isIgPost) igContentArea.classList.add('hidden');
    else if (typeof igContentCards !== 'undefined' && igContentCards.length > 0) igContentArea.classList.remove('hidden');
  }

  // Show/hide main output panel (hide for ig-autopost when there are cards)
  const outputPanel = document.getElementById('outputPanel');
  if (outputPanel) outputPanel.classList.toggle('hidden', isIgPost || isPhotoEditor);
  document.getElementById('photoResultPanel')?.classList.toggle('hidden', !isPhotoEditor);

  // Hide all result widgets when switching function
  ['kpAnalysisWidget','phWidget','eoWidget','marketWidget','kaWidget','cpWidget'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });

  // Show/hide extra field groups
  document.querySelectorAll('.extra-group').forEach(g => {
    g.classList.toggle('hidden', g.dataset.for !== fn);
  });

  // Update tab active states
  document.querySelectorAll('.fn-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.fn === fn);
  });
  setNavActive(fn);
  appSessionRestoreOutput(fn);
  updatePhotoEditorButton();

  // Refresh IG card setiap kali tab ig-autopost dibuka
  if (isIgPost) igUpdateUI();
  inboxSetActive(isInbox);
}

function setNavActive(fn) {
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.fn === fn);
  });
}

/* ══════════════════════════════════════════════════════════
   BUILD PAYLOAD from shared + extra fields
══════════════════════════════════════════════════════════ */
function val(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

function buildPayload(fn) {
  switch (fn) {
    case 'konsultan-pembelian':
      return {
        productName: val('kp_productName'),
        buyPrice:    val('kp_buyPrice'),
        condition:   val('kp_condition'),
        specs:       val('kp_specs'),
        repairCost:  val('kp_repairCost'),
        marketplace: val('kp_marketplace')
      };
    case 'penilai-harga':
      return {
        productName: val('ph_productName'),
        buyPrice:    val('ph_buyPrice'),
        condition:   val('ph_condition'),
        specs:       val('ph_specs'),
        defects:     val('ph_defects')
      };
    case 'estimasi-ongkir':
      return {
        productName:  val('eo_productName'),
        weight:       val('eo_weight'),
        origin:       val('eo_origin'),
        destination:  val('eo_destination')
      };
    case 'analisis-pasar':
      return {
        productName:  val('ap_productName'),
        currentPrice: val('ap_currentPrice'),
        condition:    val('ap_condition'),
        specs:        val('ap_specs'),
        region:       val('ap_region')
      };
    case 'caption-posting':
      return {
        productName:   val('cp_productName'),
        price:         val('cp_price'),
        condition:     val('cp_condition'),
        specs:         val('cp_specs'),
        platform:      val('cp_platform'),
        sellingPoints: val('cp_sellingPoints')
      };
    case 'ai-agent': {
      const payload = { message: val('f_agent_message') };
      const thumb = document.getElementById('agentImgThumb');
      if (thumb && thumb.src && thumb.src.startsWith('data:')) {
        payload.image_base64 = thumb.src;
      }
      return payload;
    }
    default:
      return {};
  }
}

function appSessionRestoreOutput(fn) {
  const savedOutput = appSession.outputs[fn];
  if (typeof savedOutput === 'string' && savedOutput) {
    showOutput(savedOutput, FN_CONFIG[fn], fn);
    return;
  }
  appSessionRenderEmptyOutput();
}

function appSessionRenderEmptyOutput() {
  document.getElementById('outputBody').innerHTML = `
    <div class="output-empty">
      <div class="empty-icon">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" opacity="0.35"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      </div>
      <p>Hasil AI akan muncul di sini</p>
      <span>Pilih menu di sidebar, isi form, dan tekan tombol fungsi</span>
    </div>`;
}

/* ══════════════════════════════════════════════════════════
   RUN CURRENT FUNCTION
══════════════════════════════════════════════════════════ */
async function runCurrentFn() {
  if (isLoading) return;
  // ig-autopost has its own dedicated buttons — skip generic run
  if (currentFn === 'ig-autopost') return;
  if (currentFn === 'foto-editor') {
    await runPhotoEditor();
    return;
  }
  const fn = currentFn;
  const cfg = FN_CONFIG[fn];
  const payload = buildPayload(fn);

  // Validate required fields
  if (fn === 'ai-agent' && !val('f_agent_message')) {
    showToast('◉ Tulis pertanyaan terlebih dahulu', 'error'); return;
  }
  if (fn === 'estimasi-ongkir' && (!val('eo_origin') || !val('eo_destination'))) {
    showToast('◉ Kota Asal & Tujuan wajib diisi', 'error'); return;
  }
  const requiresProduct = ['konsultan-pembelian', 'penilai-harga', 'analisis-pasar', 'caption-posting'];
  if (requiresProduct.includes(fn) && !payload.productName) {
    showToast('◉ Nama Produk wajib diisi', 'error'); return;
  }

  setLoading(true, fn);

  try {
    const res  = await fetch(`${API_BASE}/${cfg.endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (!res.ok || data.error || data.connected === false) {
      showToast(`❌ ${data.error || 'Terjadi kesalahan'}`, 'error');
    } else {
      appSession.outputs[fn] = data.result;
      appSessionPersist();
      if (currentFn === fn) showOutput(data.result, cfg, fn);
      showToast('✅ Selesai!', 'success');
    }
  } catch {
    showToast('❌ Tidak bisa terhubung ke backend. Pastikan server aktif di port 3000.', 'error');
  } finally {
    setLoading(false, fn);
  }
}

/* ══════════════════════════════════════════════════════════
   LOADING STATE
══════════════════════════════════════════════════════════ */
function setLoading(state, fn = currentFn) {
  isLoading = state;
  // Drive both the main run button and the inline ai-agent run button
  const isAgent = fn === 'ai-agent';
  const btn = isAgent
    ? (document.getElementById('agentRunBtn') || document.getElementById('runBtn'))
    : document.getElementById('runBtn');
  btn.disabled = state;

  // Toggle spinner/icon for whichever button is active
  const textId    = isAgent ? 'agentRunText'    : 'runText';
  const iconId    = isAgent ? 'agentRunIcon'    : 'runIcon';
  const spinnerId = isAgent ? 'agentRunSpinner' : 'runSpinner';
  document.getElementById(textId)?.classList.toggle('hidden', state);
  document.getElementById(iconId)?.classList.toggle('hidden', state);
  document.getElementById(spinnerId)?.classList.toggle('hidden', !state);

  if (state) {
    document.getElementById('outputBody').innerHTML = `
      <div class="skeleton-wrap">
        <div class="sk w90"></div><div class="sk w60"></div>
        <div class="sk w80"></div><div class="sk w45"></div>
        <div class="sk w90"></div><div class="sk w70"></div>
      </div>`;
  }
}

/* ══════════════════════════════════════════════════════════
   SHOW OUTPUT
══════════════════════════════════════════════════════════ */
function showOutput(text, cfg, fn = currentFn) {
  const body = document.getElementById('outputBody');
  document.getElementById('outputFnLabel').textContent = cfg.label;
  // Strip the JSON block and any heading immediately before it from displayed markdown
  const textForDisplay = text
    .replace(/^[^\n]*(?:data terstruktur|structured data|json output|context[_\s]id)[^\n]*\n?(?=```json)/gim, '')
    .replace(/```json[\s\S]*?```/gi, '')
    .trim();
  body.innerHTML = renderMarkdown(textForDisplay);

  ['kpAnalysisWidget', 'phWidget', 'eoWidget', 'marketWidget', 'kaWidget', 'cpWidget'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });

  // Parse JSON block and update widgets based on current function
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/i);

  if (fn === 'konsultan-pembelian') {
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1].trim());
        renderKpWidget(parsed.context_id || {});
      } catch (_) {}
    }
  } else if (fn === 'penilai-harga') {
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1].trim());
        renderPhWidget(parsed.valuation_context_id || parsed.context_id || {});
      } catch (_) {}
    }
  } else if (fn === 'estimasi-ongkir') {
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1].trim());
        renderEoWidget(parsed.shipping_context_id || parsed.context_id || {});
      } catch (_) {}
    }
  } else if (fn === 'analisis-pasar') {
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1].trim());
        const context = parsed.market_intel_context_id
          || parsed.market_intelligence_context_id
          || parsed.market_context_id
          || parsed.context_id
          || parsed;
        renderMarketWidget(context);
      } catch (err) {
        console.error('[analisis-pasar] Gagal membaca context JSON:', err);
      }
    }
  } else if (fn === 'caption-posting') {
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1].trim());
        const ctx = parsed.caption_context_id || parsed.context_id || parsed;
        renderCpWidget(ctx);
      } catch (_) {}
    }
  } else if (fn === 'ai-agent') {
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1].trim());
        renderKonsultanWidget(parsed);
      } catch (_) {}
    }
  }
}

function clearOutput() {
  delete appSession.outputs[currentFn];
  appSessionPersist();
  appSessionRenderEmptyOutput();
  ['kpAnalysisWidget','phWidget','eoWidget','marketWidget','kaWidget','cpWidget'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
}

/* ══════════════════════════════════════════════════════════
   MARKET INTELLIGENCE WIDGET — render dari context ID JSON
   Context IDs: platform_prices[], regional_prices[],
   msrp_original_price, price_trend_history[],
   future_projection.{trend_type,summary},
   competitor_analysis.{unique_selling_points,weaknesses,quality_position}
══════════════════════════════════════════════════════════ */
function renderMarketWidget(data) {
  const widget = document.getElementById('marketWidget');
  if (!widget || !data || typeof data !== 'object' || Array.isArray(data)) return false;

  const CONTEXT_KEYS = [
    'platform_prices', 'regional_prices', 'msrp_original_price',
    'price_trend_history', 'future_projection', 'competitor_analysis'
  ];
  if (!CONTEXT_KEYS.some(k => Object.prototype.hasOwnProperty.call(data, k))) return false;

  /* ── Helpers ── */
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const num = v => (v == null || v === '' || !Number.isFinite(Number(v))) ? null : Number(v);
  const rp  = v => { const n = num(v); return n == null ? '—' : 'Rp\u00a0' + n.toLocaleString('id-ID'); };
  const arr = v => Array.isArray(v) ? v : [];

  const rpCompact = v => {
    const n = num(v);
    if (n == null) return '—';
    if (n >= 1_000_000) return `Rp\u00a0${Number((n / 1_000_000).toFixed(1)).toLocaleString('id-ID')} jt`;
    if (n >= 1_000)     return `Rp\u00a0${Number((n / 1_000).toFixed(1)).toLocaleString('id-ID')} rb`;
    return rp(n);
  };

  const priceRange = (min, max) => `
    <div class="market-price-range">
      <div><span>Terendah</span><strong>${rp(min)}</strong></div>
      <div><span>Tertinggi</span><strong>${rp(max)}</strong></div>
    </div>`;

  /* ── Platform colour chips: platform_prices[].platform ── */
  const PLATFORM_THEME = {
    tokopedia:  { bg: '#E8F5E9', color: '#1B5E20', label: 'TK' },
    shopee:     { bg: '#FFF3E0', color: '#E65100', label: 'SH' },
    olx:        { bg: '#E3F2FD', color: '#1565C0', label: 'OL' },
    facebook:   { bg: '#E8EAF6', color: '#283593', label: 'FB' },
    lazada:     { bg: '#F3E5F5', color: '#6A1B9A', label: 'LZ' },
    bukalapak:  { bg: '#FFEBEE', color: '#B71C1C', label: 'BL' },
    carousell:  { bg: '#E0F7FA', color: '#006064', label: 'CR' },
  };
  const getPlatformTheme = name => {
    const key = String(name || '').toLowerCase().replace(/\s+/g, '');
    for (const [k, v] of Object.entries(PLATFORM_THEME)) {
      if (key.includes(k)) return v;
    }
    const initials = String(name || 'M').trim().split(/\s+/).slice(0, 2)
      .map(w => w[0]).join('').toUpperCase() || 'M';
    return { bg: '#EEF4FD', color: '#315F96', label: initials };
  };

  /* Section A — platform_prices[] */
  const platforms = arr(data.platform_prices).filter(item => item && typeof item === 'object');
  const platformMarkup = platforms.length
    ? platforms.map(item => {
        const name  = String(item.platform || 'Marketplace');
        const theme = getPlatformTheme(name);
        return `<article class="market-platform">
          <div class="market-platform-heading">
            <span class="market-platform-mark" style="background:${theme.bg};color:${theme.color}" aria-hidden="true">${esc(theme.label)}</span>
            <h4>${esc(name)}</h4>
          </div>
          ${priceRange(item.min_price, item.max_price)}
          ${item.market_trait
            ? `<p class="market-trait">${esc(item.market_trait)}</p>`
            : ''}
        </article>`;
      }).join('')
    : '<p class="market-empty">Data perbandingan platform belum tersedia.</p>';

  /* Section B — regional_prices[] */
  const regions = arr(data.regional_prices).filter(item => item && typeof item === 'object');
  const allRegPrices = regions.flatMap(r => [num(r.min_price), num(r.max_price)]).filter(v => v != null);
  const regMin  = allRegPrices.length ? Math.min(...allRegPrices) : 0;
  const regSpan = allRegPrices.length ? Math.max(...allRegPrices) - regMin : 0;

  /* colour-encode region groups */
  const REGION_COLORS = [
    { bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' },
    { bg: '#F0FDF4', color: '#15803D', border: '#BBF7D0' },
    { bg: '#FFF7ED', color: '#C2410C', border: '#FED7AA' },
    { bg: '#FDF4FF', color: '#7E22CE', border: '#E9D5FF' },
    { bg: '#FFFBEB', color: '#B45309', border: '#FDE68A' },
  ];

  const regionalMarkup = regions.length
    ? regions.map((item, idx) => {
        const min   = num(item.min_price);
        const max   = num(item.max_price);
        const low   = min == null ? regMin : min;
        const high  = max == null ? low : max;
        const pLeft = regSpan ? Math.max(0, Math.min(100, ((low  - regMin) / regSpan) * 100)) : 0;
        const pRight= regSpan ? Math.max(pLeft, Math.min(100, ((high - regMin) / regSpan) * 100)) : 100;
        const width = Math.max(6, pRight - pLeft);
        const theme = REGION_COLORS[idx % REGION_COLORS.length];
        const label = String(item.region_group || 'Wilayah');
        return `<article class="market-region">
          <div class="market-region-heading">
            <span class="market-region-badge" style="background:${theme.bg};color:${theme.color};border-color:${theme.border}">${esc(label)}</span>
          </div>
          ${priceRange(min, max)}
          <div class="market-region-band" aria-hidden="true" title="Rentang harga: ${esc(rp(min))} – ${esc(rp(max))}">
            <span style="left:${pLeft.toFixed(1)}%;width:${width.toFixed(1)}%" style="background:${theme.color}"></span>
          </div>
        </article>`;
      }).join('')
    : '<p class="market-empty">Data harga regional belum tersedia.</p>';

  /* Section C — msrp_original_price + price_trend_history[] + future_projection */
  const msrp = num(data.msrp_original_price);
  const history = arr(data.price_trend_history)
    .filter(p => p && typeof p === 'object')
    .map(p => ({
      label: String(p.year ?? p.date ?? p.time ?? p.period ?? p.timestamp ?? p.time_point ?? p.point ?? ''),
      price: num(p.price ?? p.market_price ?? p.value)
    }))
    .filter(p => p.price != null);

  /* msrp_original_price becomes the chart anchor / starting point */
  const chartPoints = msrp != null ? [{ label: 'Rilis', price: msrp, isMsrp: true }, ...history] : history;

  let chartMarkup = '<div class="market-chart-empty">Riwayat harga belum tersedia untuk divisualisasikan.</div>';
  if (chartPoints.length > 1) {
    const W = 640, H = 230, PL = 82, PR = 20, PT = 18, PB = 42;
    const values   = chartPoints.map(p => p.price);
    const vMin     = Math.min(...values);
    const vMax     = Math.max(...values);
    const vSpan    = vMax - vMin || Math.max(vMax * 0.1, 1);
    const plotW    = W - PL - PR;
    const plotH    = H - PT - PB;

    const coords = chartPoints.map((p, i) => ({
      x:      PL + (chartPoints.length === 1 ? 0 : i / (chartPoints.length - 1)) * plotW,
      y:      PT + ((vMax - p.price) / vSpan) * plotH,
      label:  p.label || `T${i + 1}`,
      price:  p.price,
      isMsrp: !!p.isMsrp
    }));

    const polyline  = coords.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const areaPath  = `M ${coords[0].x.toFixed(1)} ${H - PB}`
      + ` L ${coords.map(p => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ')}`
      + ` L ${coords[coords.length - 1].x.toFixed(1)} ${H - PB} Z`;

    /* Y-axis grid — 3 lines */
    const gridLines = [0, 0.5, 1].map(t => {
      const y = PT + plotH * t;
      const v = vMax - vSpan * t;
      return `<g>
        <line x1="${PL}" y1="${y.toFixed(1)}" x2="${W - PR}" y2="${y.toFixed(1)}" class="market-chart-grid"/>
        <text x="${PL - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" class="market-chart-axis">${esc(rpCompact(v))}</text>
      </g>`;
    }).join('');

    /* dots — MSRP anchor uses a star/diamond shape to mark it as the original release price */
    const dots = coords.map(p => {
      if (p.isMsrp) {
        const s = 5.5;
        return `<polygon points="${p.x.toFixed(1)},${(p.y - s).toFixed(1)} ${(p.x + s).toFixed(1)},${p.y.toFixed(1)} ${p.x.toFixed(1)},${(p.y + s).toFixed(1)} ${(p.x - s).toFixed(1)},${p.y.toFixed(1)}" class="market-chart-dot-msrp"><title>Harga Rilis (MSRP) · ${esc(rp(p.price))}</title></polygon>`;
      }
      return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4.5" class="market-chart-dot"><title>${esc(p.label)} · ${esc(rp(p.price))}</title></circle>`;
    }).join('');

    /* X-axis labels — first & last only to avoid crowding */
    const xLabels = [coords[0], coords[coords.length - 1]]
      .map((p, i) => `<text x="${p.x.toFixed(1)}" y="${H - 12}" text-anchor="${i ? 'end' : 'start'}" class="market-chart-axis">${esc(p.label)}</text>`)
      .join('');

    /* MSRP dashed reference line */
    const msrpLine = msrp != null
      ? `<line x1="${PL}" y1="${coords[0].y.toFixed(1)}" x2="${W - PR}" y2="${coords[0].y.toFixed(1)}" class="market-chart-msrp-line"/>`
      : '';

    chartMarkup = `<svg class="market-chart" viewBox="0 0 ${W} ${H}" role="img"
        aria-label="Grafik tren depresiasi dari ${esc(coords[0].label)} hingga ${esc(coords[coords.length - 1].label)}">
      <defs>
        <linearGradient id="mktAreaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#3879B9" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="#3879B9" stop-opacity="0.02"/>
        </linearGradient>
      </defs>
      ${gridLines}
      ${msrpLine}
      <path d="${areaPath}" fill="url(#mktAreaGrad)"/>
      <polyline points="${polyline}" class="market-chart-line"/>
      ${dots}
      ${xLabels}
    </svg>`;
  }

  /* future_projection.trend_type — arrow icon (Down / Flat / Up) */
  const projection = (data.future_projection && typeof data.future_projection === 'object')
    ? data.future_projection : {};
  const trendRaw  = String(projection.trend_type || '').trim();
  const trendKey  = trendRaw.toLowerCase().replace(/[\s_-]+/g, '_');
  const isDown    = /down|declin|fall|turun|menurun|depreciat/.test(trendKey);
  const isUp      = /up|ris|increas|naik|meningkat|apprec/.test(trendKey);
  const isFlat    = /flat|stable|stabil|sideways|tetap/.test(trendKey);
  const trendLabel = isDown ? 'Menurun' : isUp ? 'Meningkat' : isFlat ? 'Stabil' : trendRaw || 'Belum tersedia';
  const trendClass = isDown ? 'is-down' : isUp ? 'is-up' : 'is-flat';
  /* Directional arrow icons */
  const trendIcon  = isDown
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12l7 7 7-7"/></svg>`
    : isUp
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M15 8l4 4-4 4"/></svg>`;

  /* future_projection.summary — summary callout */
  const projSummary = projection.summary
    ? `<p>${esc(projection.summary)}</p>`
    : `<p class="market-empty">Ringkasan proyeksi belum tersedia.</p>`;

  /* Section D — competitor_analysis */
  const comp = (data.competitor_analysis && typeof data.competitor_analysis === 'object')
    ? data.competitor_analysis : {};

  /* unique_selling_points — green checkmark SVG bullets */
  const usp       = arr(comp.unique_selling_points).filter(s => s != null);
  /* weaknesses — red warning SVG bullets */
  const weaknesses = arr(comp.weaknesses).filter(s => s != null);

  const SVG_CHECK = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 8 6.5 11.5 13 5"/></svg>`;
  const SVG_WARN  = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3L14 13H2L8 3Z"/><line x1="8" y1="7" x2="8" y2="10"/><circle cx="8" cy="12" r="0.6" fill="currentColor" stroke="none"/></svg>`;

  const listMarkup = (items, cls, icon) => items.length
    ? `<ul class="${cls}">${items.map(s => `<li><span aria-hidden="true">${icon}</span>${esc(s)}</li>`).join('')}</ul>`
    : '<p class="market-empty">Belum ada poin yang tersedia.</p>';

  /* quality_position — Tier Gauge */
  const qualRaw   = String(comp.quality_position || '').trim();
  const qualKey   = qualRaw.toLowerCase().replace(/[\s_-]+/g, '_');
  const qualVal   = /above|premium|unggul|atas|high/.test(qualKey) ? 80
    : /below|low|bawah|rendah/.test(qualKey) ? 18
    : /average|medium|standar|sedang|rata/.test(qualKey) ? 50
    : null;
  const qualLabel = qualRaw
    ? qualRaw.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    : 'Belum dinilai';
  /* tier badge label */
  const TIER_MAP = [
    [/above|premium|unggul|atas|high/, 'Di atas rata-rata', '#15803D', '#F0FDF4', '#BBF7D0'],
    [/below|low|bawah|rendah/,         'Di bawah rata-rata', '#B91C1C', '#FFF1F2', '#FECDD3'],
    [/average|medium|standar|sedang|rata/, 'Rata-rata',       '#92400E', '#FFFBEB', '#FDE68A'],
  ];
  let tierLabel = qualLabel, tierColor = '#425166', tierBg = '#F1F5F9', tierBorder = '#CBD5E1';
  for (const [re, lbl, clr, bg, bdr] of TIER_MAP) {
    if (re.test(qualKey)) { tierLabel = lbl; tierColor = clr; tierBg = bg; tierBorder = bdr; break; }
  }

  /* ── Final HTML assembly ── */
  widget.innerHTML = `
    <header class="market-widget-header">
      <div>
        <h2>Analisis Harga Pasar</h2>
        <p>Perbandingan kanal, wilayah, tren depresiasi, dan posisi kompetitor dalam satu ringkasan.</p>
      </div>
      ${msrp != null
        ? `<div class="market-msrp">
            <span>Harga rilis (MSRP)</span>
            <strong>${rp(msrp)}</strong>
           </div>`
        : ''}
    </header>

    <div class="market-widget-content">

      <!-- Section A: Platform Cards -->
      <section class="market-section" aria-labelledby="mkt-platform-title">
        <div class="market-section-heading">
          <div>
            <h3 id="mkt-platform-title">Perbandingan platform</h3>
            <p>Rentang harga dan karakter transaksi tiap marketplace.</p>
          </div>
          <span class="market-section-count">${platforms.length} platform</span>
        </div>
        <div class="market-platform-grid">${platformMarkup}</div>
      </section>

      <!-- Section B: Regional Pricing -->
      <section class="market-section" aria-labelledby="mkt-region-title">
        <div class="market-section-heading">
          <div>
            <h3 id="mkt-region-title">Harga menurut wilayah</h3>
            <p>Rentang harga per kelompok wilayah di Indonesia.</p>
          </div>
          <span class="market-section-count">${regions.length} wilayah</span>
        </div>
        <div class="market-region-grid">${regionalMarkup}</div>
      </section>

      <!-- Section C: Depreciation Trend -->
      <section class="market-section market-trend-section" aria-labelledby="mkt-trend-title">
        <div class="market-section-heading">
          <div>
            <h3 id="mkt-trend-title">Tren depresiasi</h3>
            <p>Perubahan nilai dari harga rilis hingga kondisi pasar terkini.</p>
          </div>
          <span class="market-trend-badge ${trendClass}">
            ${trendIcon}${esc(trendLabel)}
          </span>
        </div>
        ${chartMarkup}
        <div class="market-projection">
          <div class="market-projection-icon ${trendClass}" aria-hidden="true">${trendIcon}</div>
          <div><strong>Proyeksi ke depan</strong>${projSummary}</div>
        </div>
      </section>

      <!-- Section D: Competitor Benchmark -->
      <section class="market-section" aria-labelledby="mkt-competitor-title">
        <div class="market-section-heading">
          <div>
            <h3 id="mkt-competitor-title">Benchmark kompetitor</h3>
            <p>Keunggulan, kelemahan, dan posisi kualitas produk di pasar.</p>
          </div>
          ${qualRaw
            ? `<span class="market-tier-badge" style="color:${tierColor};background:${tierBg};border-color:${tierBorder}">${esc(tierLabel)}</span>`
            : ''}
        </div>
        <div class="market-competitor-grid">
          <div class="market-competitor-column">
            <h4>Keunggulan</h4>
            ${listMarkup(usp, 'market-points is-positive', SVG_CHECK)}
          </div>
          <div class="market-competitor-column">
            <h4>Perlu diperhatikan</h4>
            ${listMarkup(weaknesses, 'market-points is-caution', SVG_WARN)}
          </div>
          <div class="market-quality">
            <h4>Posisi kualitas</h4>
            <strong>${esc(qualLabel)}</strong>
            <div class="market-quality-track" role="img" aria-label="Posisi kualitas: ${esc(qualLabel)}">
              <span${qualVal == null ? ' class="is-unknown"' : ` style="left:${qualVal}%"`}></span>
            </div>
            <div class="market-quality-labels">
              <span>Di bawah rata-rata</span>
              <span>Rata-rata</span>
              <span>Premium</span>
            </div>
          </div>
        </div>
      </section>

    </div>`;

  widget.classList.remove('hidden');
  return true;
}

/* ══════════════════════════════════════════════════════════
   KONSULTAN RESELL AI WIDGET
   Renders dynamic context IDs from the konsultan_resell flow:
   scanned_item, valuation_context_id, purchasing_context_id,
   active_tools
══════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════
   CAPTION POSTING WIDGET
   Context IDs: caption_context_id.options[]
   Each option: option_id, label, channel, caption_text,
                supported_automation, automation_meta
══════════════════════════════════════════════════════════ */
function renderCpWidget(data) {
  const widget = document.getElementById('cpWidget');
  if (!widget || !data || typeof data !== 'object') return;

  const options = Array.isArray(data.options) ? data.options.filter(o => o && typeof o === 'object') : [];
  if (!options.length) return;

  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  /* Channel icon SVGs keyed by option_id */
  const CHANNEL_ICONS = {
    OPTION_1_QUICK:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
    OPTION_2_SOCMED:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>`,
    OPTION_3_ECOMMERCE:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`,
  };
  const CHANNEL_THEME = {
    OPTION_1_QUICK:     { bg: '#F0FDF4', border: '#BBF7D0', color: '#15803D', accent: '#16A34A' },
    OPTION_2_SOCMED:    { bg: '#FDF4FF', border: '#E9D5FF', color: '#7E22CE', accent: '#9333EA' },
    OPTION_3_ECOMMERCE: { bg: '#EFF6FF', border: '#BFDBFE', color: '#1D4ED8', accent: '#2563EB' },
  };

  /* State: which option is selected */
  const firstId = options[0].option_id;
  const widgetId = `cpw_${Date.now()}`;

  const tabsMarkup = options.map((opt, i) => {
    const theme = CHANNEL_THEME[opt.option_id] || CHANNEL_THEME.OPTION_1_QUICK;
    const icon  = CHANNEL_ICONS[opt.option_id] || CHANNEL_ICONS.OPTION_1_QUICK;
    return `<button class="cp-tab${i === 0 ? ' is-active' : ''}"
        data-widget="${widgetId}" data-option="${esc(opt.option_id)}"
        style="--cp-accent:${theme.accent};--cp-bg:${theme.bg};--cp-border:${theme.border};--cp-color:${theme.color}">
      <span class="cp-tab-icon">${icon}</span>
      <span class="cp-tab-label">${esc(opt.label)}</span>
      <span class="cp-tab-channel">${esc(opt.channel)}</span>
    </button>`;
  }).join('');

  const panelsMarkup = options.map((opt, i) => {
    const theme    = CHANNEL_THEME[opt.option_id] || CHANNEL_THEME.OPTION_1_QUICK;
    const canAuto  = opt.supported_automation === true;
    const meta     = opt.automation_meta && typeof opt.automation_meta === 'object' ? opt.automation_meta : null;
    const rawText  = String(opt.caption_text || '').trim();
    const hashtags = meta && Array.isArray(meta.payload?.hashtags)
      ? meta.payload.hashtags.map(h => `<span class="cp-hashtag">#${esc(String(h).replace(/^#/, ''))}</span>`).join('')
      : '';

    const autoBlock = canAuto && meta
      ? `<div class="cp-auto-block" style="border-color:${theme.border};background:${theme.bg}">
          <div class="cp-auto-head">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            <span>Automasi tersedia — <strong>${esc(meta.target_flow || '')}</strong></span>
          </div>
          <button class="cp-auto-btn" style="background:${theme.accent}"
            onclick="cpTriggerAuto(${JSON.stringify(esc(opt.option_id))}, ${JSON.stringify(esc(JSON.stringify(meta)))})">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Post Otomatis Sekarang
          </button>
        </div>`
      : `<div class="cp-auto-block is-disabled">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
          <span>Auto-post belum tersedia untuk kanal ini</span>
        </div>`;

    return `<div class="cp-panel${i === 0 ? '' : ' hidden'}" data-widget="${widgetId}" data-option="${esc(opt.option_id)}">
      <div class="cp-caption-block">
        <div class="cp-caption-toolbar">
          <span class="cp-caption-label">${esc(opt.label)} — ${esc(opt.channel)}</span>
          <button class="cp-copy-btn" onclick="cpCopy(this)" aria-label="Salin caption">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            Salin
          </button>
        </div>
        <pre class="cp-caption-text" data-raw="${esc(rawText)}">${esc(rawText)}</pre>
        ${hashtags ? `<div class="cp-hashtags">${hashtags}</div>` : ''}
      </div>
      ${autoBlock}
    </div>`;
  }).join('');

  widget.innerHTML = `
    <div class="cp-widget-inner">
      <header class="cp-widget-header">
        <div>
          <h2>Caption Posting</h2>
          <p>Pilih opsi caption yang sesuai platform tujuan — salin atau posting otomatis.</p>
        </div>
        ${data.product_name ? `<span class="cp-product-name">${esc(data.product_name)}</span>` : ''}
      </header>
      <div class="cp-tabs">${tabsMarkup}</div>
      <div class="cp-panels">${panelsMarkup}</div>
    </div>`;

  /* Tab switching */
  widget.querySelectorAll('.cp-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const wid = btn.dataset.widget;
      const opt = btn.dataset.option;
      widget.querySelectorAll(`.cp-tab[data-widget="${wid}"]`).forEach(t => t.classList.remove('is-active'));
      widget.querySelectorAll(`.cp-panel[data-widget="${wid}"]`).forEach(p => p.classList.add('hidden'));
      btn.classList.add('is-active');
      widget.querySelector(`.cp-panel[data-widget="${wid}"][data-option="${opt}"]`)?.classList.remove('hidden');
    });
  });

  widget.classList.remove('hidden');
}

/* Copy caption text */
function cpCopy(btn) {
  const pre = btn.closest('.cp-caption-block')?.querySelector('.cp-caption-text');
  if (!pre) return;
  navigator.clipboard.writeText(pre.dataset.raw || pre.textContent).then(() => {
    const orig = btn.innerHTML;
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Disalin!`;
    setTimeout(() => { btn.innerHTML = orig; }, 1800);
  });
}

/* Trigger automation — wires to IG auto-post or external flow */
function cpTriggerAuto(optionId, metaJson) {
  try {
    const meta = JSON.parse(metaJson);
    if (meta.target_flow === 'flow_auto_post_instagram') {
      /* Pre-fill the IG caption field and switch to ig-autopost tab if available */
      const igCaption = document.getElementById('ig_caption');
      if (igCaption && meta.payload?.caption) {
        appSessionSetInputValue('ig_caption', meta.payload.caption);
        switchFn('ig-autopost');
        showToast('✅ Caption sudah diisi ke form Instagram!', 'success');
      } else {
        showToast('◉ Hubungkan akun Instagram terlebih dahulu di tab Post IG.', 'info');
      }
    } else {
      showToast(`◉ Flow "${meta.target_flow}" belum terhubung.`, 'info');
    }
  } catch (_) {
    showToast('❌ Gagal memproses automation.', 'error');
  }
}

/* ══════════════════════════════════════════════════════════
   KONSULTAN RESELL AI WIDGET
   Renders dynamic context IDs from the konsultan_resell flow:
   scanned_item, valuation_context_id, purchasing_context_id,
   active_tools
══════════════════════════════════════════════════════════ */
function renderKonsultanWidget(data) {
  const widget = document.getElementById('kaWidget');
  if (!widget || !data || typeof data !== 'object') return;

  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const num = v => (v == null || v === '' || !Number.isFinite(Number(v))) ? null : Number(v);
  const rp  = v => { const n = num(v); return n == null ? '—' : 'Rp\u00a0' + n.toLocaleString('id-ID'); };
  const arr = v => Array.isArray(v) ? v : [];

  /* ── scanned_item — visual detection result ── */
  const scan = data.scanned_item && typeof data.scanned_item === 'object' ? data.scanned_item : null;
  let scanMarkup = '';
  if (scan) {
    const isValid    = scan.is_valid_object !== false;
    const isSellable = scan.is_sellable !== false;
    const defects    = arr(scan.detected_visual_defects);

    const validBadge = isValid
      ? `<span class="ka-scan-badge is-ok">Objek Terdeteksi</span>`
      : `<span class="ka-scan-badge is-warn">Tidak Teridentifikasi</span>`;
    const sellBadge = isSellable
      ? `<span class="ka-scan-badge is-ok">Layak Jual</span>`
      : `<span class="ka-scan-badge is-warn">Perlu Evaluasi</span>`;

    const defectList = defects.length
      ? `<ul class="ka-defect-list">${defects.map(d =>
          `<li><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M8 3L14 13H2L8 3Z"/><line x1="8" y1="7" x2="8" y2="10"/></svg>${esc(d)}</li>`
        ).join('')}</ul>`
      : `<p class="ka-empty">Tidak ada cacat visual terdeteksi</p>`;

    scanMarkup = `
      <div class="ka-section ka-scan">
        <div class="ka-section-head">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/><path d="M7 8l3 3 5-5"/></svg>
          <h3>Hasil Scan Barang</h3>
        </div>
        <div class="ka-scan-body">
          <div class="ka-scan-id">
            <span class="ka-scan-label">Teridentifikasi sebagai</span>
            <strong class="ka-scan-name">${esc(scan.identified_item || 'Tidak diketahui')}</strong>
            <div class="ka-scan-badges">${validBadge}${sellBadge}</div>
          </div>
          <div class="ka-scan-defects">
            <span class="ka-scan-label">Cacat visual terdeteksi</span>
            ${defectList}
          </div>
        </div>
      </div>`;
  }

  /* ── valuation_context_id — price tiers & deductions ── */
  const val = data.valuation_context_id && typeof data.valuation_context_id === 'object'
    ? data.valuation_context_id : null;
  let valuationMarkup = '';
  if (val) {
    const tiers    = val.price_tiers && typeof val.price_tiers === 'object' ? val.price_tiers : {};
    const deducts  = arr(val.deductions);
    const totalDed = num(val.total_deduction);

    const tierCards = [
      { key: 'quick_sale_price',  label: 'Cepat Laku',    note: 'Butuh dana cepat',         cls: 'is-low'  },
      { key: 'ideal_fair_price',  label: 'Ideal',          note: 'Rekomendasi terbaik',       cls: 'is-mid'  },
      { key: 'max_listing_price', label: 'Buka Iklan',     note: 'Ada ruang nego',            cls: 'is-high' },
    ].map(t => {
      const v = num(tiers[t.key]);
      return `<div class="ka-tier-card ${t.cls}">
        <span class="ka-tier-label">${t.label}</span>
        <strong class="ka-tier-price">${rp(v)}</strong>
        <small>${t.note}</small>
      </div>`;
    }).join('');

    const deductRows = deducts.length
      ? deducts.map(d => `<div class="ka-deduct-row">
          <span>${esc(d.issue || 'Minus')}</span>
          <span class="ka-deduct-amount">−${rp(d.deduction_amount)}</span>
        </div>`).join('')
        + (totalDed != null ? `<div class="ka-deduct-row ka-deduct-total">
          <span>Total potongan</span><span>−${rp(totalDed)}</span></div>` : '')
      : `<p class="ka-empty">Tidak ada potongan nilai</p>`;

    valuationMarkup = `
      <div class="ka-section ka-valuation">
        <div class="ka-section-head">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>
          <h3>Penilaian Harga Jual — ${esc(val.item_name || '')}</h3>
        </div>
        <div class="ka-tier-grid">${tierCards}</div>
        <div class="ka-deduct-block">
          <h4>Rincian potongan nilai</h4>
          ${deductRows}
        </div>
      </div>`;
  }

  /* ── purchasing_context_id — buy feasibility ── */
  const pur = data.purchasing_context_id && typeof data.purchasing_context_id === 'object'
    ? data.purchasing_context_id : null;
  let purchasingMarkup = '';
  if (pur) {
    const decision = String(pur.decision_status || '').toUpperCase();
    const DECISION = {
      RECOMMENDED: { label: 'Direkomendasikan', cls: 'is-green',  icon: `<path d="M20 6L9 17l-5-5"/>` },
      RISKY:       { label: 'Berisiko',          cls: 'is-yellow', icon: `<path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>` },
      SKIP:        { label: 'Jangan Beli',       cls: 'is-red',   icon: `<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>` },
    };
    const dec = DECISION[decision] || { label: decision || '—', cls: '', icon: '' };

    const metrics = [
      { label: 'Harga Penawaran', val: rp(pur.asking_price) },
      { label: 'Biaya Perbaikan',  val: rp(pur.repair_cost) },
      { label: 'Total Modal',      val: rp(pur.total_cost) },
      { label: 'Harga Pasar',      val: rp(pur.market_price) },
      { label: 'Estimasi Profit',  val: rp(pur.estimated_profit) },
      { label: 'ROI',              val: pur.roi_percentage != null ? `${esc(pur.roi_percentage)}%` : '—' },
    ].map(m => `<div class="ka-metric"><span>${m.label}</span><strong>${m.val}</strong></div>`).join('');

    const negoReasons = arr(pur.nego_reasoning);
    const negoList = negoReasons.length
      ? `<ul class="ka-nego-list">${negoReasons.map(r =>
          `<li><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 8 6.5 11.5 13 5"/></svg>${esc(r)}</li>`
        ).join('')}</ul>`
      : '';

    purchasingMarkup = `
      <div class="ka-section ka-purchasing">
        <div class="ka-section-head">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
          <h3>Kelayakan Pembelian — ${esc(pur.item_name || '')}</h3>
          <span class="ka-decision-badge ${dec.cls}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${dec.icon}</svg>
            ${esc(dec.label)}
          </span>
        </div>
        <div class="ka-metrics-grid">${metrics}</div>
        ${pur.target_nego_price != null ? `
        <div class="ka-nego-block">
          <div class="ka-nego-header">
            <h4>Target Negosiasi</h4>
            <strong class="ka-nego-price">${rp(pur.target_nego_price)}</strong>
            ${pur.target_roi_after_nego != null
              ? `<span class="ka-nego-roi">ROI setelah nego: ${esc(pur.target_roi_after_nego)}%</span>`
              : ''}
          </div>
          ${negoList}
        </div>` : ''}
      </div>`;
  }

  /* ── active_tools badge strip ── */
  const tools = arr(data.active_tools);
  const TOOL_LABELS = {
    tool_penilai_harga_jual:   'Penilai Harga',
    tool_konsultasi_pembelian: 'Konsultan Pembelian',
    tool_analisis_pasar:       'Analisis Pasar',
    tool_estimasi_ongkir:      'Estimasi Ongkir',
  };
  const toolsMarkup = tools.length
    ? `<div class="ka-tools-strip">
        <span class="ka-tools-label">Tools aktif</span>
        ${tools.map(t => `<span class="ka-tool-chip">${esc(TOOL_LABELS[t] || t)}</span>`).join('')}
       </div>`
    : '';

  const hasContent = scan || val || pur;
  if (!hasContent) return;

  widget.innerHTML = `
    <div class="ka-widget-inner">
      ${toolsMarkup}
      ${scanMarkup}
      ${valuationMarkup}
      ${purchasingMarkup}
    </div>`;
  widget.classList.remove('hidden');
}

/* ══════════════════════════════════════════════════════════
   KP ANALYSIS WIDGET — render dari context_id JSON
══════════════════════════════════════════════════════════ */
function renderKpWidget(d) {
  const widget = document.getElementById('kpAnalysisWidget');
  if (!widget) return;

  // ── Helpers ──
  const fmt = n => (n != null && n !== '' && !isNaN(Number(n)))
    ? 'Rp\u00a0' + Number(n).toLocaleString('id-ID') : '—';
  const pct = n => (n != null && n !== '' && !isNaN(Number(n)))
    ? Number(n).toFixed(1) + '%' : '—';
  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  const svgCheck = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
  const svgWarn  = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
  const svgSkip  = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
  const svgTool  = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`;
  const svgOk    = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
  const svgShield= `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;

  // ── Row 1: item_name ──
  setEl('kpItemName', d.item_name || '—');

  // ── Decision badge (with icon + label, not color-only) ──
  const decisionMap = {
    RECOMMENDED: { label: 'Direkomendasikan', icon: svgCheck, cls: 'RECOMMENDED' },
    RISKY:       { label: 'Berisiko',          icon: svgWarn,  cls: 'RISKY' },
    SKIP:        { label: 'Lewati',            icon: svgSkip,  cls: 'SKIP' }
  };
  const dec = decisionMap[d.decision_status] || { label: d.decision_status || '—', icon: '', cls: '' };
  const decBadge = document.getElementById('kpDecisionBadge');
  if (decBadge) {
    decBadge.className = 'kp-decision-badge ' + dec.cls;
    document.getElementById('kpDecisionIcon').innerHTML = dec.icon;
    document.getElementById('kpDecisionLabel').textContent = dec.label;
  }

  // ── Risk level badge ──
  const riskMap = {
    LOW:    { label: 'Risiko Rendah', icon: svgCheck, cls: 'LOW' },
    MEDIUM: { label: 'Risiko Sedang', icon: svgWarn,  cls: 'MEDIUM' },
    HIGH:   { label: 'Risiko Tinggi', icon: svgWarn,  cls: 'HIGH' }
  };
  const risk = riskMap[d.risk_level] || { label: d.risk_level || '—', icon: svgShield, cls: '' };
  const riskBadge = document.getElementById('kpRiskBadge');
  if (riskBadge) {
    riskBadge.className = 'kp-risk-badge ' + risk.cls;
    document.getElementById('kpRiskIcon').innerHTML = risk.icon;
    document.getElementById('kpRiskLabel').textContent = risk.label;
  }

  // ── Repair badge ──
  const repairBadge = document.getElementById('kpRepairBadge');
  if (repairBadge) {
    const needsRepair = d.repair_required === true || d.repair_required === 'true';
    repairBadge.className = 'kp-repair-badge ' + (needsRepair ? 'needs-repair' : 'no-repair');
    document.getElementById('kpRepairIcon').innerHTML = needsRepair ? svgTool : svgOk;
    document.getElementById('kpRepairLabel').textContent = needsRepair ? 'Perlu Perbaikan' : 'Tidak Perlu Perbaikan';
  }

  // ── Decision meta description ──
  const metaMap = {
    RECOMMENDED: 'Barang ini layak dibeli. Estimasi keuntungan dan ROI memadai untuk resell.',
    RISKY: 'Ada risiko pada pembelian ini. Pertimbangkan dengan cermat sebelum memutuskan.',
    SKIP: 'Tidak disarankan untuk dibeli. Potensi kerugian atau margin terlalu tipis.'
  };
  setEl('kpDecisionMeta', metaMap[d.decision_status] || '');

  // ── Row 2: Metric cards ──
  setEl('kpAskingPrice', fmt(d.asking_price));
  setEl('kpTotalCost',   fmt(d.total_cost));
  setEl('kpRoi',         pct(d.roi_percentage));

  // Profit — with explicit positive/negative indicator
  const profitNum = Number(d.estimated_profit);
  const profitEl  = document.getElementById('kpProfit');
  const profitNote = document.getElementById('kpProfitNote');
  if (profitEl) {
    profitEl.textContent = fmt(d.estimated_profit);
    const isPositive = !isNaN(profitNum) && profitNum > 0;
    const isNegative = !isNaN(profitNum) && profitNum < 0;
    profitEl.style.color = isPositive ? '#34d399' : isNegative ? '#f87171' : '';
  }
  if (profitNote) {
    const isLoss = !isNaN(profitNum) && profitNum < 0;
    const isGain = !isNaN(profitNum) && profitNum > 0;
    if (isLoss) {
      profitNote.textContent = 'Merugi';
      profitNote.className = 'kp-mc-profit-note loss';
      profitNote.classList.remove('hidden');
    } else if (isGain) {
      profitNote.textContent = 'Untung';
      profitNote.className = 'kp-mc-profit-note gain';
      profitNote.classList.remove('hidden');
    } else {
      profitNote.classList.add('hidden');
    }
  }

  // ROI bar (scale: 60% ROI = full bar)
  const roiBarEl = document.getElementById('kpRoiBarFill');
  if (roiBarEl) roiBarEl.style.width = Math.min(Math.max((Number(d.roi_percentage) || 0) / 60 * 100, 0), 100) + '%';

  // ── Row 3a: Analisis Harga & Biaya ──
  const needsRepairTag = d.repair_required === true || d.repair_required === 'true';
  const repairTagEl = document.getElementById('kpRepairTag');
  if (repairTagEl) {
    repairTagEl.className = 'kp-repair-tag ' + (needsRepairTag ? 'needs' : 'no');
    repairTagEl.textContent = needsRepairTag ? 'Perlu Perbaikan' : 'Tidak Perlu Perbaikan';
  }
  setEl('kpCostAsking', fmt(d.asking_price));
  setEl('kpCostRepair', fmt(d.repair_cost));   // always shown, even if 0
  setEl('kpCostTotal',  fmt(d.total_cost));
  setEl('kpMarketPrice', fmt(d.market_price));
  // profit in cost panel — colored by sign
  const costProfitEl = document.getElementById('kpCostProfit');
  if (costProfitEl) {
    costProfitEl.textContent = fmt(d.estimated_profit);
    costProfitEl.style.color = !isNaN(profitNum)
      ? (profitNum >= 0 ? '#34d399' : '#f87171') : '';
  }

  // ── Horizontal comparison bar ──
  const maxVal = Math.max(Number(d.total_cost) || 0, Number(d.market_price) || 0);
  if (maxVal > 0) {
    const buyPct    = Math.min(((Number(d.asking_price) || 0) / maxVal) * 100, 100);
    const repairPct = Math.min(((Number(d.repair_cost)  || 0) / maxVal) * 100, 100);
    const marketPct = Math.min(((Number(d.market_price) || 0) / maxVal) * 100, 100);
    const buyEl    = document.getElementById('kpBarBuy');
    const repairEl = document.getElementById('kpBarRepair');
    const markerEl = document.getElementById('kpBarMarker');
    if (buyEl)    buyEl.style.width = buyPct + '%';
    if (repairEl) { repairEl.style.width = repairPct + '%'; repairEl.style.left = buyPct + '%'; }
    if (markerEl) markerEl.style.left = marketPct + '%';
  }
  setEl('kpBarLabelTotal',  'Modal: ' + fmt(d.total_cost));
  setEl('kpBarLabelMarket', 'Pasar: ' + fmt(d.market_price));

  // ── Row 3b: Target Negosiasi ──
  setEl('kpNegoPrice',     fmt(d.target_nego_price));
  setEl('kpNegoCmpAsk',    fmt(d.asking_price));
  setEl('kpNegoCmpTarget', fmt(d.target_nego_price));
  setEl('kpNegoRoi',       pct(d.target_roi_after_nego));

  // Nego reasoning list
  const argsEl = document.getElementById('kpNegoArgs');
  if (argsEl) {
    if (Array.isArray(d.nego_reasoning) && d.nego_reasoning.length > 0) {
      argsEl.innerHTML = d.nego_reasoning
        .map(r => `<li>${escapeHtml(String(r))}</li>`).join('');
    } else {
      argsEl.innerHTML = '<li class="kp-nego-args-empty">Tidak ada alasan negosiasi.</li>';
    }
  }

  widget.classList.remove('hidden');
}

/* ══════════════════════════════════════════════════════════
   PH (PENILAI HARGA JUAL) WIDGET — render dari context_id JSON
   Context IDs: item_name, market_normal_min, market_normal_max,
                deductions[], total_deduction,
                price_tiers.quick_sale_price, price_tiers.ideal_fair_price, price_tiers.max_listing_price,
                recommendation_action, notes
══════════════════════════════════════════════════════════ */
function renderPhWidget(d) {
  const widget = document.getElementById('phWidget');
  if (!widget) return;

  const fmt = n => (n != null && n !== '' && !isNaN(Number(n)))
    ? 'Rp\u00a0' + Number(n).toLocaleString('id-ID') : '—';
  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  // ── A. Header: nama barang + range gauge ──
  setEl('phItemName', d.item_name || '—');

  const minVal = Number(d.market_normal_min) || 0;
  const maxVal = Number(d.market_normal_max) || 0;
  setEl('phRangeMin', fmt(minVal));
  setEl('phRangeMax', fmt(maxVal));

  // Range gauge — render min..max as a filled band within a wider reference (max * 1.3 = 100%)
  const refMax = maxVal > 0 ? maxVal * 1.3 : 1;
  const fillLeft  = minVal > 0 ? ((minVal / refMax) * 100).toFixed(1) + '%' : '10%';
  const fillWidth = (minVal > 0 && maxVal > 0)
    ? (((maxVal - minVal) / refMax) * 100).toFixed(1) + '%' : '60%';
  const thumbMinLeft = minVal > 0 ? ((minVal / refMax) * 100).toFixed(1) + '%' : '10%';
  const thumbMaxLeft = maxVal > 0 ? ((maxVal / refMax) * 100).toFixed(1) + '%' : '70%';

  const fillEl = document.getElementById('phRangeFill');
  const thumbMin = document.getElementById('phRangeThumbMin');
  const thumbMax = document.getElementById('phRangeThumbMax');
  if (fillEl)   { fillEl.style.left = fillLeft; fillEl.style.width = fillWidth; }
  if (thumbMin) thumbMin.style.left = thumbMinLeft;
  if (thumbMax) thumbMax.style.left = thumbMaxLeft;

  // ── B. 3-Tier Price Cards ──
  const tiers = d.price_tiers || {};
  setEl('phQuickPrice', fmt(tiers.quick_sale_price));
  setEl('phIdealPrice', fmt(tiers.ideal_fair_price));
  setEl('phMaxPrice',   fmt(tiers.max_listing_price));

  // ── C. Deductions list ──
  const listEl = document.getElementById('phDeductionsList');
  if (listEl) {
    if (Array.isArray(d.deductions) && d.deductions.length > 0) {
      listEl.innerHTML = d.deductions.map(item => `
        <div class="ph-deduction-row">
          <span class="ph-deduction-issue">${escapeHtml(String(item.issue || ''))}</span>
          <span class="ph-deduction-amount">- ${fmt(item.deduction_amount)}</span>
        </div>`).join('');
    } else {
      listEl.innerHTML = '<div class="ph-deduction-empty">Tidak ada minus yang terdeteksi.</div>';
    }
  }
  setEl('phTotalDeduction', d.total_deduction != null ? '- ' + fmt(d.total_deduction) : '—');

  // ── D. Recommendation action pill ──
  const pillEl = document.getElementById('phActionPill');
  if (pillEl) {
    const action = (d.recommendation_action || '').toString().toUpperCase().replace(/\s+/g, '_');
    const actionLabels = {
      SELL_AS_IS:   { text: '✓ Jual Langsung', cls: 'SELL_AS_IS' },
      REPAIR_FIRST: { text: '⚒ Perbaiki Dulu', cls: 'REPAIR_FIRST' }
    };
    const info = actionLabels[action] || { text: d.recommendation_action || '—', cls: '' };
    pillEl.textContent = info.text;
    pillEl.className = 'ph-action-pill ' + info.cls;
  }

  // Notes callout
  setEl('phNotesText', d.notes || '—');

  widget.classList.remove('hidden');
}

/* ══════════════════════════════════════════════════════════
   EO (ESTIMASI ONGKIR) WIDGET — render dari shipping_context_id JSON
   Context IDs: origin_address, destination_address,
                route_metrics.{distance_km, duration_minutes, traffic_condition},
                self_delivery.{fuel_cost, operational_cost, total_recommended_fee},
                courier_options[], best_recommendation.{method, reason}
══════════════════════════════════════════════════════════ */
function renderEoWidget(d) {
  const widget = document.getElementById('eoWidget');
  if (!widget) return;

  const fmt = n => (n != null && n !== '' && !isNaN(Number(n)))
    ? 'Rp\u00a0' + Number(n).toLocaleString('id-ID') : '—';
  const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

  // ── A. Route endpoints ──
  const origin = d.origin_address || '—';
  const dest   = d.destination_address || '—';
  setEl('eoOriginLabel', origin);
  setEl('eoDestLabel',   dest);

  // ── Route metrics ──
  const rm = d.route_metrics || {};
  const distKm  = Number(rm.distance_km) || 0;
  const durMin  = Number(rm.duration_minutes) || 0;
  const traffic = (rm.traffic_condition || '').toString().toUpperCase();

  setEl('eoDistanceVal', distKm  ? distKm + ' km'  : '—');
  setEl('eoDurationVal', durMin  ? (durMin >= 60 ? Math.round(durMin / 60) + ' jam ' + (durMin % 60 ? (durMin % 60) + ' mnt' : '') : durMin + ' menit') : '—');

  // Traffic pill
  const trafficDot   = document.getElementById('eoTrafficDot');
  const trafficLabel = document.getElementById('eoTrafficLabel');
  const trafficMap = { CLEAR: 'Lalu Lintas Lancar', MODERATE: 'Sedang', HEAVY: 'Macet' };
  if (trafficDot) {
    trafficDot.className = 'eo-traffic-dot ' + traffic;
  }
  if (trafficLabel) trafficLabel.textContent = trafficMap[traffic] || traffic || '—';

  // SVG polyline color by traffic
  const polyline = document.getElementById('eoPolyline');
  if (polyline) {
    const colors = { CLEAR: '#22C55E', MODERATE: '#F59E0B', HEAVY: '#EF4444' };
    polyline.setAttribute('stroke', colors[traffic] || '#3B82F6');
  }

  // ── B. Self delivery ──
  const sd = d.self_delivery || {};
  setEl('eoFuelCost', fmt(sd.fuel_cost));
  setEl('eoOpCost',   fmt(sd.operational_cost));
  setEl('eoSelfTotal', fmt(sd.total_recommended_fee));

  // ── C. Courier options ──
  const bestMethod = ((d.best_recommendation || {}).method || '').toUpperCase();
  const listEl = document.getElementById('eoCourierList');
  if (listEl) {
    const options = Array.isArray(d.courier_options) ? d.courier_options : [];
    if (options.length > 0) {
      listEl.innerHTML = options.map(opt => {
        const type = (opt.service_type || '').toUpperCase();
        const isRec = type === bestMethod;
        const typeLabels = { INSTANT: 'Instant', SAMEDAY: 'Sameday', EXPRESS: 'Express', REGULAR: 'Reguler', ECONOMY: 'Ekonomi' };
        return `<div class="eo-courier-card${isRec ? ' is-recommended' : ''}">
          <span class="eo-courier-type-badge eo-type-${type}">${typeLabels[type] || type}</span>
          <div class="eo-courier-info">
            <span class="eo-courier-provider">${escapeHtml(opt.provider || '—')}</span>
            <span class="eo-courier-etd">${escapeHtml(opt.estimated_etd || '—')}</span>
          </div>
          <span class="eo-courier-price">${fmt(opt.estimated_cost)}</span>
          ${isRec ? '<span class="eo-courier-rec-tag">✓ Terbaik</span>' : ''}
        </div>`;
      }).join('');
    } else {
      listEl.innerHTML = '<div class="eo-courier-empty">Tidak ada data ekspedisi.</div>';
    }
  }

  // ── D. Recommendation ──
  const rec = d.best_recommendation || {};
  const methodLabels = { INSTANT: 'Kurir Instan', SAMEDAY: 'Sameday', EXPRESS: 'Ekspedisi Express', REGULAR: 'Ekspedisi Reguler', ECONOMY: 'Ekspedisi Ekonomi', SELF: 'Kurir Pribadi' };
  const pillEl = document.getElementById('eoRecMethodPill');
  if (pillEl) pillEl.textContent = methodLabels[bestMethod] || rec.method || '—';
  setEl('eoRecReason', rec.reason || '—');

  widget.classList.remove('hidden');
}

function copyOutput() {
  const text = document.getElementById('outputBody').innerText;
  if (!text || text.includes('Hasil AI akan muncul')) {
    showToast('◉ Belum ada hasil untuk disalin', 'error'); return;
  }
  navigator.clipboard.writeText(text).then(() => showToast('✅ Disalin!', 'success'));
}

/** Salin nilai dari ig-id-panel ke clipboard */
function igCopyId(elementId) {
  const el = document.getElementById(elementId);
  const text = el ? el.textContent.trim() : '';
  if (!text || text === '—') {
    showToast('◉ Belum ada nilai untuk disalin', 'error'); return;
  }
  navigator.clipboard.writeText(text).then(() => showToast(`✅ Disalin: ${text}`, 'success'));
}

/**
 * Tombol "Get User ID & Creation ID"
 * Memanggil /fetch-ids (lebih verbose) untuk mendapatkan ig_user_id terbaru.
 * Creation ID diambil dari profil aktif (tersimpan saat post terakhir).
 * Jika /fetch-ids gagal, fallback ke /status.
 */
async function igFetchIds() {
  if (!igRequireApiKey()) return;

  const btn     = document.getElementById('igFetchIdsBtn');
  const btnText = document.getElementById('igFetchIdsText');
  const spinner = document.getElementById('igFetchSpinner');

  btn.disabled = true;
  btnText.classList.add('hidden');
  spinner.classList.remove('hidden');
  showToast('⏳ Mengambil User ID & Creation ID...', 'info');

  try {
    const userId = igState.userId;

    // Panggil /fetch-ids
    const r1 = await fetch(`${IG_API_BASE}/fetch-ids?user_id=${encodeURIComponent(userId)}`, {
      headers: igApiHeaders()
    });
    const data = await r1.json();

    if (!r1.ok || (data.error && !data.connected_account_id)) {
      showToast(`❌ ${data.error || 'Koneksi tidak aktif. Lakukan OAuth terlebih dahulu.'}`, 'error');
      return;
    }

    // ig_user_id dari Composio bisa berupa connected_account_id jika IG tidak mengembalikan numeric ID
    const newUserId = data.ig_user_id || data.connected_account_id || igState.igUserId || null;
    igState.connected = true;
    igState.username  = data.username ? '@' + data.username : (igState.username || '@instagram');
    igState.igUserId  = newUserId;

    igUpdateUI();
    igPersistState();

    const displayUserId     = igState.igUserId       || '—';
    const displayCreationId = igState.lastCreationId || '—';

    showToast(`✅ User ID: ${displayUserId}  |  Creation ID: ${displayCreationId}`, 'success');
    console.log(`[igFetchIds] ig_user_id=${displayUserId} creation_id=${displayCreationId}`);
  } catch {
    showToast('❌ Tidak dapat terhubung ke server. Pastikan backend aktif.', 'error');
  } finally {
    btn.disabled = false;
    btnText.classList.remove('hidden');
    spinner.classList.add('hidden');
  }
}

/* ══════════════════════════════════════════════════════════
   MARKDOWN RENDERER
══════════════════════════════════════════════════════════ */
function renderMarkdown(text) {
  if (!text) return '';

  // Convert markdown tables to HTML before escaping
  const tableRegex = /^(\|.+\|\n)((?:\|[-: ]+)+\|\n)((?:\|.+\|\n?)*)/gm;
  const withTables = text.replace(tableRegex, (match, header, separator, body) => {
    const parseRow = row => row.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
    const headers = parseRow(header);
    const alignRow = parseRow(separator);
    const aligns = alignRow.map(c => {
      if (/^:-+:$/.test(c)) return 'center';
      if (/^-+:$/.test(c))  return 'right';
      return 'left';
    });
    const rows = body.trim() ? body.trim().split('\n').map(r => parseRow(r)) : [];
    const esc2 = v => String(v == null ? '' : v).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    const thead = '<thead><tr>' + headers.map((h, i) =>
      `<th style="text-align:${aligns[i] || 'left'}">${esc2(h)}</th>`).join('') + '</tr></thead>';
    const tbody = rows.length
      ? '<tbody>' + rows.map(row =>
          '<tr>' + headers.map((_, i) =>
            `<td style="text-align:${aligns[i] || 'left'}">${esc2(row[i] ?? '')}</td>`).join('') + '</tr>'
        ).join('') + '</tbody>'
      : '';
    return `<table class="md-table">${thead}${tbody}</table>\n`;
  });

  // Process non-table chunks (escape + markdown); pass table HTML through unchanged
  const html = withTables
    .split(/(<table[\s\S]*?<\/table>)/g)
    .map((chunk, idx) => {
      if (idx % 2 === 1) return chunk; // already rendered table HTML — pass through
      return chunk
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        // Headers
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        .replace(/^# (.+)$/gm, '<h1>$1</h1>')
        // Standalone bold lines
        .replace(/^\*\*\*(.+?)\*\*\*$/gm, '<p class="md-section-title"><strong><em>$1</em></strong></p>')
        .replace(/^\*\*(.+?)\*\*$/gm, '<p class="md-section-title"><strong>$1</strong></p>')
        // Inline bold/italic
        .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        // Dividers
        .replace(/^---+$/gm, '<hr>')
        // Blockquotes
        .replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>')
        // Unordered list items
        .replace(/^\s*[-•] (.+)$/gm, '<li>$1</li>')
        // Wrap consecutive <li> into <ul>
        .replace(/(<li>.*<\/li>(\n<li>.*<\/li>)*)/g, '<ul>$1</ul>')
        // Inline code
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        // Paragraph breaks
        .replace(/\n{2,}/g, '\n<br/>\n');
    })
    .join('');

  return `<div>${html}</div>`;
}

/* ══════════════════════════════════════════════════════════
   TOAST
══════════════════════════════════════════════════════════ */
function showToast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type}`;
  t.classList.remove('hidden');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.add('hidden'), 3500);
}


/* ══════════════════════════════════════════════════════════
   HEALTH CHECK (server status)
══════════════════════════════════════════════════════════ */
async function checkHealth() {
  try {
    const res = await fetch('http://localhost:3000/api/health', { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      setStatus('online', '🟢 Terhubung');
    } else {
      setStatus('offline', '🔴 Error server');
    }
  } catch {
    setStatus('offline', '🔴 Backend offline');
  }
}

function setStatus(state, text) {
  const dot  = document.getElementById('statusDot');
  const txt  = document.getElementById('statusText');
  const tbs  = document.getElementById('topbarStatus');
  dot.className = `status-dot ${state}`;
  txt.textContent = text;
  if (tbs) { tbs.textContent = state === 'online' ? '●' : '●'; tbs.className = `topbar-status ${state}`; }
}

/* ══════════════════════════════════════════════════════════
   INSTAGRAM AUTO POST  (via Composio)
══════════════════════════════════════════════════════════ */

const IG_DRIVE_CONNECTED_KEY = 'resell_google_drive_connected';
let igDriveUploading = false;
let igImageObjectUrl = null;
let igDriveUploadedUrl = '';

function igDriveInit() {
  const connectBtn = document.getElementById('igDriveConnectBtn');
  const disconnectBtn = document.getElementById('igDriveDisconnectBtn');
  const fileInput = document.getElementById('ig_imageFile');
  const previewBtn = document.getElementById('igPreviewUrlBtn');
  const imageUrlInput = document.getElementById('ig_imageUrl');
  const clearBtn = document.getElementById('igImageClearBtn');
  if (!connectBtn || !fileInput) return;

  connectBtn.addEventListener('click', igDriveConnect);
  disconnectBtn.addEventListener('click', igDriveDisconnect);
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) igDriveUploadSelected(fileInput.files[0]);
  });
  previewBtn.addEventListener('click', igPreviewImageUrl);
  imageUrlInput.addEventListener('input', () => {
    if (imageUrlInput.value.trim() !== igDriveUploadedUrl) {
      igDriveUploadedUrl = '';
      igImageHidePreview();
    }
  });
  clearBtn.addEventListener('click', igClearImage);
  if (imageUrlInput.value.trim()) {
    try {
      const restoredUrl = new URL(imageUrlInput.value.trim());
      if (['http:', 'https:'].includes(restoredUrl.protocol)) {
        igShowImagePreview(restoredUrl.href, 'Preview foto dari URL publik.', restoredUrl.href, false);
      }
    } catch (error) {
      console.warn('[app-session:restore-image-preview] URL foto tersimpan tidak valid.', error);
    }
  }
  igDriveUpdateUI();
  if (igGetApiKey()) igDriveCheckStatus();
}

function igDriveOpenComposio() {
  window.open('https://app.composio.dev/app/googledrive', '_blank', 'noopener,noreferrer');
}

async function igDriveConnect() {
  if (!igRequireApiKey()) return;

  const connectBtn = document.getElementById('igDriveConnectBtn');
  connectBtn.disabled = true;
  try {
    const response = await fetch(`${DRIVE_API_BASE}/connect?user_id=${encodeURIComponent(igState.userId)}`, {
      headers: igApiHeaders()
    });
    const data = await response.json();
    if (!response.ok || !data.auth_url) {
      throw new Error(data.error || 'Composio tidak mengembalikan URL koneksi Google Drive.');
    }
    window.location.href = data.auth_url;
  } catch (error) {
    console.error('[google-drive:connect]', error);
    igDriveSetUploadStatus(error.message, 'error');
    showToast(`❌ ${error.message}`, 'error');
    connectBtn.disabled = false;
  }
}

async function igDriveCheckStatus() {
  if (!igGetApiKey() || !igState.userId) {
    localStorage.setItem(igDriveConnectedKey(), '0');
    igDriveUpdateUI(false);
    return false;
  }
  if (localStorage.getItem(igDriveReauthKey()) === '1') {
    igDriveMarkReauthRequired('Kredensial Google ditolak. Hubungkan ulang Google Drive melalui Composio untuk melanjutkan upload.');
    return false;
  }
  try {
    const response = await fetch(`${DRIVE_API_BASE}/status?user_id=${encodeURIComponent(igState.userId)}`, {
      headers: igApiHeaders()
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Gagal memeriksa koneksi Google Drive.');
    localStorage.setItem(igDriveConnectedKey(), data.connected ? '1' : '0');
    igDriveUpdateUI(Boolean(data.connected));
    if (data.connected) igDriveSetUploadStatus('Google Drive terhubung via Composio. Foto yang diunggah akan diberi akses publik.', 'success');
    return Boolean(data.connected);
  } catch (error) {
    console.error('[google-drive:status]', error);
    localStorage.setItem(igDriveConnectedKey(), '0');
    igDriveUpdateUI(false);
    igDriveSetUploadStatus(error.message, 'error');
    return false;
  }
}

function igDriveConnectedKey() {
  return `${IG_DRIVE_CONNECTED_KEY}_${igState.userId || 'default'}`;
}

function igDriveReauthKey() {
  return `${IG_DRIVE_CONNECTED_KEY}_reauth_${igState.userId || 'default'}`;
}

function igDriveUpdateUI(connected = localStorage.getItem(igDriveConnectedKey()) === '1') {
  const status = document.getElementById('igDriveStatus');
  const connectBtn = document.getElementById('igDriveConnectBtn');
  const disconnectBtn = document.getElementById('igDriveDisconnectBtn');
  const fileInput = document.getElementById('ig_imageFile');
  const fileLabel = document.querySelector('.ig-drive-file-label');
  if (!status || !connectBtn || !fileInput) return;

  status.textContent = connected ? 'Google Drive terhubung via Composio' : 'Google Drive belum terhubung ke Composio';
  status.classList.toggle('is-connected', connected);
  connectBtn.textContent = connected ? 'Hubungkan ulang via Composio' : 'Hubungkan via Composio';
  disconnectBtn.classList.toggle('hidden', !connected);
  fileInput.disabled = !connected || igDriveUploading;
  fileLabel.classList.toggle('is-disabled', fileInput.disabled);
}

function igDriveSetUploadStatus(message, state) {
  const status = document.getElementById('igDriveUploadStatus');
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('is-error', state === 'error');
  status.classList.toggle('is-success', state === 'success');
}

async function igDriveDisconnect() {
  if (!igRequireApiKey()) return;
  try {
    const response = await fetch(`${DRIVE_API_BASE}/disconnect`, {
      method: 'POST',
      headers: igApiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ user_id: igState.userId })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Gagal memutuskan Google Drive.');
    localStorage.removeItem(igDriveConnectedKey());
    localStorage.removeItem(igDriveReauthKey());
    igDriveUpdateUI(false);
    igDriveSetUploadStatus('Google Drive diputus. URL foto publik yang sudah dibuat tetap dapat digunakan.', '');
    showToast('Google Drive berhasil diputus.', 'info');
  } catch (error) {
    console.error('[google-drive:disconnect]', error);
    igDriveSetUploadStatus(error.message, 'error');
    showToast(`❌ ${error.message}`, 'error');
  }
}

async function igPrepareInstagramImage(file) {
  const bitmap = await createImageBitmap(file);
  const maxDimension = 1440;
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  if (file.type === 'image/jpeg' && scale === 1 && file.size <= 5 * 1024 * 1024) {
    bitmap.close();
    return file;
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    throw new Error('Browser tidak dapat memproses foto ini.');
  }
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(result => result ? resolve(result) : reject(new Error('Foto gagal dikonversi ke JPEG.')), 'image/jpeg', 0.88);
  });
  if (blob.size > 5 * 1024 * 1024) throw new Error('Ukuran foto setelah diproses masih lebih dari 5 MB.');
  return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg' });
}

async function igDriveUploadSelected(file) {
  const imageUrlInput = document.getElementById('ig_imageUrl');
  const fileInput = document.getElementById('ig_imageFile');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    showToast('Pilih foto JPG, PNG, atau WEBP.', 'error');
    fileInput.value = '';
    return;
  }
  if (file.size > 20 * 1024 * 1024) {
    showToast('Ukuran file foto maksimal 20 MB.', 'error');
    fileInput.value = '';
    return;
  }

  appSessionSetInputValue('ig_imageUrl', '');
  igDriveUploadedUrl = '';
  igImageHidePreview();
  if (localStorage.getItem(igDriveConnectedKey()) !== '1') {
    igDriveSetUploadStatus('Google Drive belum terhubung ke Composio.', 'error');
    showToast('❌ Hubungkan Google Drive melalui Composio sebelum upload.', 'error');
    fileInput.value = '';
    return;
  }

  if (igImageObjectUrl) URL.revokeObjectURL(igImageObjectUrl);
  igImageObjectUrl = URL.createObjectURL(file);
  igShowImagePreview(igImageObjectUrl, 'Foto dipilih — sedang diunggah ke Google Drive…', '', false);
  igDriveUploading = true;
  igDriveUpdateUI();
  igDriveSetUploadStatus('Memproses dan mengunggah foto…', '');

  try {
    const image = await igPrepareInstagramImage(file);
    const formData = new FormData();
    formData.append('user_id', igState.userId);
    formData.append('file', image, image.name);
    const uploadResponse = await fetch(`${DRIVE_API_BASE}/upload`, {
      method: 'POST',
      headers: igApiHeaders(),
      body: formData
    });
    const data = await uploadResponse.json();
    if (data.code === 'GOOGLE_DRIVE_REAUTH_REQUIRED') {
      igDriveMarkReauthRequired(data.error);
    }
    if (!uploadResponse.ok || !data.image_url) throw new Error(data.error || 'Composio tidak mengembalikan URL foto publik.');
    const publicUrl = data.image_url;
    appSessionSetInputValue('ig_imageUrl', publicUrl);
    igDriveUploadedUrl = publicUrl;
    igShowImagePreview(igImageObjectUrl, 'Foto tersimpan di Drive dan akses publik aktif.', publicUrl, true);
    igDriveSetUploadStatus('Upload selesai. URL publik foto sudah diisi otomatis.', 'success');
    showToast('✅ Foto berhasil diunggah dan URL publik sudah diisi.', 'success');
  } catch (error) {
    console.error('[google-drive:upload]', error);
    igDriveSetUploadStatus(error.message, 'error');
    showToast(`❌ Upload Google Drive gagal: ${error.message}`, 'error');
    appSessionSetInputValue('ig_imageUrl', '');
  } finally {
    igDriveUploading = false;
    igDriveUpdateUI();
    fileInput.value = '';
  }
}

function igDriveMarkReauthRequired(message) {
  localStorage.setItem(igDriveReauthKey(), '1');
  localStorage.setItem(igDriveConnectedKey(), '0');
  igDriveUpdateUI(false);
  const connectBtn = document.getElementById('igDriveConnectBtn');
  if (connectBtn) connectBtn.textContent = 'Hubungkan ulang via Composio';
  igDriveSetUploadStatus(message, 'error');
}

function igShowImagePreview(src, message, link, isDriveUpload) {
  const preview = document.getElementById('igImagePreview');
  const image = document.getElementById('igImagePreviewImg');
  const messageEl = document.getElementById('igImagePreviewMessage');
  const linkEl = document.getElementById('igImagePreviewLink');
  preview.classList.remove('hidden');
  image.onerror = () => {
    messageEl.textContent = 'Foto tidak dapat dimuat dari URL ini. Periksa URL dan akses publiknya.';
  };
  image.onload = () => {
    messageEl.textContent = message;
  };
  messageEl.textContent = message;
  image.src = src;
  if (image.complete) {
    messageEl.textContent = image.naturalWidth
      ? message
      : 'Foto tidak dapat dimuat dari URL ini. Periksa URL dan akses publiknya.';
  } else if (typeof image.decode === 'function') {
    image.decode().then(() => {
      if (image.src === src) messageEl.textContent = message;
    }).catch(() => {
      if (image.src === src) messageEl.textContent = 'Foto tidak dapat dimuat dari URL ini. Periksa URL dan akses publiknya.';
    });
  }
  linkEl.href = link || '#';
  linkEl.classList.toggle('hidden', !link);
  linkEl.textContent = isDriveUpload ? 'Buka file di Drive' : 'Buka foto';
}

function igImageHidePreview() {
  const preview = document.getElementById('igImagePreview');
  const image = document.getElementById('igImagePreviewImg');
  const link = document.getElementById('igImagePreviewLink');
  if (image) {
    image.onerror = null;
    image.onload = null;
    image.removeAttribute('src');
  }
  if (link) {
    link.href = '#';
    link.classList.add('hidden');
  }
  preview?.classList.add('hidden');
}

function igPreviewImageUrl() {
  const value = document.getElementById('ig_imageUrl').value.trim();
  if (!value) {
    showToast('Masukkan URL foto atau unggah foto dari Google Drive.', 'error');
    return;
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    showToast('URL foto tidak valid. Periksa kembali alamatnya.', 'error');
    return;
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    showToast('URL foto harus menggunakan HTTP atau HTTPS.', 'error');
    return;
  }
  if (igImageObjectUrl) {
    URL.revokeObjectURL(igImageObjectUrl);
    igImageObjectUrl = null;
  }
  igShowImagePreview(url.href, 'Preview foto dari URL publik.', url.href, false);
}

function igClearImage() {
  const imageUrlInput = document.getElementById('ig_imageUrl');
  const fileInput = document.getElementById('ig_imageFile');
  if (igImageObjectUrl) {
    URL.revokeObjectURL(igImageObjectUrl);
    igImageObjectUrl = null;
  }
  appSessionSetInputValue('ig_imageUrl', '');
  fileInput.value = '';
  igDriveUploadedUrl = '';
  igImageHidePreview();
  igDriveSetUploadStatus(localStorage.getItem(igDriveConnectedKey()) === '1'
    ? 'Pilih foto untuk mengunggahnya ke Google Drive.'
    : 'Tambahkan toolkit Google Drive di Composio lalu hubungkan dengan API Key profil ini.', '');
}

/**
 * Complete Instagram or Google Drive Composio callbacks and clean the URL.
 */
async function igHandleCallbackParams() {
  const params = new URLSearchParams(window.location.search);

  if (params.get('ig_connected') === '1') {
    // Clean URL params immediately
    window.history.replaceState({}, document.title, '/');

    showToast('⏳ Menghubungkan akun Instagram via Composio...', 'info');

    // Fetch real account info from Composio via backend
    await igFetchStatus();

    if (igState.connected) {
      switchFn('ig-autopost');
      showToast(`✅ Instagram ${igState.username || ''} berhasil terhubung via Composio!`, 'success');
    }
  }

  if (params.get('drive_connected') === '1') {
    window.history.replaceState({}, document.title, '/');
    localStorage.removeItem(igDriveReauthKey());
    showToast('⏳ Memverifikasi koneksi Google Drive via Composio...', 'info');
    if (await igDriveCheckStatus()) {
      switchFn('ig-autopost');
      showToast('✅ Google Drive berhasil terhubung via Composio!', 'success');
    }
  }

  if (params.get('drive_error')) {
    showToast(`❌ Gagal menghubungkan Google Drive: ${params.get('drive_error')}`, 'error');
    window.history.replaceState({}, document.title, '/');
  }

  if (params.get('ig_error')) {
    showToast(`❌ Gagal hubungkan IG: ${decodeURIComponent(params.get('ig_error'))}`, 'error');
    window.history.replaceState({}, document.title, '/');
  }

  // Restore persisted IG state from localStorage (for page refreshes)
  igRestoreState();
}

/**
 * Call backend /status → fetch connection info from Composio.
 * Updates igState and UI.
 */
async function igFetchStatus() {
  if (!igState.userId) return;
  try {
    const res  = await fetch(`${IG_API_BASE}/status?user_id=${encodeURIComponent(igState.userId)}`, {
      headers: igApiHeaders()
    });
    const data = await res.json();

    if (res.ok && data.connected) {
      igState.connected  = true;
      igState.username   = data.username ? '@' + data.username : '@instagram';
      igState.igUserId   = data.ig_user_id || data.connection_id || null;
      igUpdateUI();
      igPersistState();
    } else {
      igState.connected = false;
      igUpdateUI();
    }
  } catch (_) { /* network error — keep existing state */ }
}

/** Persist — tidak lagi diperlukan, Proxy igState otomatis simpan ke profil aktif. */
function igPersistState() { /* no-op: handled by igState Proxy */ }

/** Restore — tidak lagi diperlukan, profil dimuat otomatis saat init. */
function igRestoreState() { /* no-op: handled by profile system */ }

/** Update the setup guide ↔ connected card visibility */
function igUpdateUI() {
  const setupGuide = document.getElementById('igSetupGuide');
  const info       = document.getElementById('igConnectedInfo');

  if (!setupGuide || !info) return;

  if (igState.connected) {
    setupGuide.classList.add('hidden');
    info.classList.remove('hidden');
    // connected card username
    const connUser = document.getElementById('igUsernameConnected');
    if (connUser) connUser.textContent = igState.username || '@—';
  } else {
    setupGuide.classList.remove('hidden');
    info.classList.add('hidden');
  }

  // Profile card: IG User ID + username
  const userIdEl = document.getElementById('igUserId');
  if (userIdEl) userIdEl.textContent = igState.igUserId || '—';

  const usernameEl = document.getElementById('igUsername');
  if (usernameEl) usernameEl.textContent = igState.username || '—';

  // Update API key visibility and step checks
  igUpdateApiKeyUI();
  igUpdateStepChecks();

  // Sinkronkan dropdown profil (label bisa berubah setelah connect)
  igRenderProfileSelect();
}

/**
 * Step 1 — Open Composio Toolkits page for Instagram in a new tab.
 * User adds the Instagram toolkit and their account on Composio.
 */
function igOpenComposioToolkits() {
  window.open('https://app.composio.dev/app/instagram', '_blank', 'noopener,noreferrer');
  showToast('🌐 Halaman Composio dibuka di tab baru. Tambahkan Instagram dan klik "Add Account".', 'info');
}

/**
 * Step 3 — Verify connection by calling /status.
 * Retrieves ig_user_id and shows User ID + Creation ID in the connected info card.
 */
async function igVerifyConnection() {
  if (!igRequireApiKey()) return;

  const btn = document.getElementById('igVerifyBtn');
  if (btn) btn.disabled = true;
  showToast('⏳ Memverifikasi koneksi dan mengambil IG User ID...', 'info');

  try {
    const res  = await fetch(`${IG_API_BASE}/status?user_id=${encodeURIComponent(igState.userId)}`, {
      headers: igApiHeaders()
    });
    const data = await res.json();

    if (!res.ok || data.error || data.connected === false) {
      showToast(`❌ ${data.error || 'Koneksi tidak aktif. Pastikan OAuth sudah selesai.'}`, 'error');
      if (btn) btn.disabled = false;
      return;
    }

    igState.connected = true;
    igState.username  = data.username ? '@' + data.username : (igState.username || '@instagram');
    igState.igUserId  = data.ig_user_id || data.connected_account_id || igState.igUserId || null;

    // lastCreationId stays as previously stored (from last post)
    igUpdateUI(); // also updates igUserId / igCreationId DOM elements
    igPersistState();

    const userId = igState.igUserId || '—';

    // Force-update the profile card IG User ID element
    const userIdEl = document.getElementById('igUserId');
    if (userIdEl) userIdEl.textContent = userId;

    showToast(`✅ Terverifikasi! IG User ID: ${userId}`, 'success');
  } catch {
    showToast('❌ Tidak dapat terhubung ke server. Pastikan backend aktif.', 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

/**
 * Step 2 — Request Composio OAuth URL from backend, then redirect user.
 * Backend calls entity.initiateConnection({ appName: 'instagram' })
 * and returns { auth_url } which is the Composio-managed OAuth redirect.
 */
async function igConnect() {
  if (!igRequireApiKey()) return;

  showToast('⏳ Menyiapkan koneksi Composio...', 'info');

  try {
    const res  = await fetch(`${IG_API_BASE}/connect?user_id=${encodeURIComponent(igState.userId)}`, {
      headers: igApiHeaders()
    });
    const data = await res.json();

    if (!res.ok || data.error || data.connected === false) {
      showToast(`❌ ${data.error}`, 'error');
      return;
    }

    // Composio returns a hosted OAuth page — redirect user there
    window.location.href = data.auth_url;
  } catch {
    showToast('❌ Tidak dapat menghubungkan ke server. Pastikan backend aktif.', 'error');
  }
}

/**
 * Disconnect IG — clears local state + calls backend to revoke Composio connection.
 */
async function igDisconnect() {
  await fetch(`${IG_API_BASE}/disconnect`, {
    method: 'POST',
    headers: igApiHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ user_id: igState.userId })
  }).catch(() => {});

  igState.connected       = false;
  igState.username        = null;
  igState.igUserId        = null;
  igState.lastCreationId  = null;
  igUpdateUI();
  showToast('✅ Akun Instagram diputus dari Composio.', 'success');
}

/**
 * Generate Caption — menggunakan flow caption-posting, platform Instagram.
 */
async function igGenerateCaption() {
  // Build payload for caption-posting flow (platform = Instagram)
  const payload = {
    productName:   val('ig_prodName') || 'Produk Resell',
    price:         val('ig_price') || '',
    condition:     val('ig_condition') || '',
    specs:         val('ig_specs') || '',
    platform:      'Instagram',
    sellingPoints: val('ig_sellingPoints') || ''
  };

  showToast('⏳ Generating caption Instagram...', 'info');
  const genBtn = document.querySelector('.ig-action-btn.ig-gen-btn');
  if (genBtn) genBtn.disabled = true;

  try {
    const res  = await fetch(`${API_BASE}/caption-posting`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (!res.ok || data.error) {
      showToast(`❌ ${data.error || 'Gagal generate caption'}`, 'error'); return;
    }

    // Prioritas: ambil caption_text dari opsi Instagram di JSON block
    const rawResult  = data.result || '';
    let captionText  = '';

    const jsonMatch = rawResult.match(/```json\s*([\s\S]*?)```/i);
    if (jsonMatch) {
      try {
        const parsed  = JSON.parse(jsonMatch[1].trim());
        const ctx     = parsed.caption_context_id || parsed.context_id || parsed;
        const options = Array.isArray(ctx.options) ? ctx.options : [];
        // Cari opsi Instagram: option_id OPTION_2_SOCMED atau channel mengandung "instagram"
        const igOpt = options.find(o =>
          o.option_id === 'OPTION_2_SOCMED' ||
          String(o.channel || '').toLowerCase().includes('instagram') ||
          String(o.label   || '').toLowerCase().includes('instagram')
        );
        if (igOpt && igOpt.caption_text) {
          captionText = String(igOpt.caption_text).trim();
        }
      } catch (_) { /* fallthrough ke teks biasa */ }
    }

    // Fallback: strip semua JSON block dan ambil teks markdown bersih
    if (!captionText) {
      captionText = rawResult
        .replace(/```json[\s\S]*?```/gi, '')
        .replace(/^[^\n]*(?:data terstruktur|json output)[^\n]*\n?/gim, '')
        .trim();
    }

    appSessionSetInputValue('ig_caption', captionText);
    showToast('✅ Caption IG berhasil di-generate!', 'success');
  } catch {
    showToast('❌ Tidak bisa terhubung ke backend.', 'error');
  } finally {
    if (genBtn) genBtn.disabled = false;
  }
}

/* ── IG Content Cards Storage ── */
let igContentCards = [];

/**
 * Buat Konten — simpan sebagai container/draf di Instagram (belum dipublish).
 * Menampilkan kartu preview konten di area output.
 */
async function igCreateContent() {
  if (!igRequireApiKey()) return;
  if (igDriveUploading) {
    showToast('Tunggu sampai upload foto ke Google Drive selesai.', 'info'); return;
  }
  if (!igState.connected) {
    showToast('◉ Hubungkan akun Instagram terlebih dahulu.', 'error'); return;
  }
  if (!igState.igUserId) {
    showToast('◉ ig_user_id belum tersedia. Selesaikan langkah koneksi terlebih dahulu.', 'error'); return;
  }

  const caption  = document.getElementById('ig_caption')?.value?.trim();
  const imageUrl = document.getElementById('ig_imageUrl')?.value?.trim();
  const tags     = document.getElementById('ig_tags')?.value?.trim() || '';

  if (!caption)  { showToast('◉ Caption wajib diisi.', 'error'); return; }
  if (!imageUrl) { showToast('◉ URL foto wajib diisi.', 'error'); return; }

  // Loading state
  const createBtn  = document.getElementById('igCreateBtn');
  const createText = document.getElementById('igCreateText');
  const createIcon = document.getElementById('igCreateIcon');
  const spinner    = document.getElementById('igCreateSpinner');
  if (createIcon)  createIcon.classList.add('hidden');
  if (createText)  createText.classList.add('hidden');
  if (spinner)     spinner.classList.remove('hidden');
  if (createBtn)   createBtn.disabled = true;

  try {
    showToast('⏳ Membuat konten Instagram (container/draf)...', 'info');

    const res = await fetch(`${IG_API_BASE}/container`, {
      method:  'POST',
      headers: igApiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        user_id:    igState.userId,
        ig_user_id: igState.igUserId,
        image_url:  imageUrl,
        caption:    tags ? caption + '\n\n' + tags : caption
      })
    });
    const data = await res.json();

    if (!res.ok || data.error) {
      showToast(`❌ ${data.error || 'Gagal membuat konten'}`, 'error'); return;
    }

    const creationId = data.creation_id || data.container_id || ('draft_' + Date.now());

    // Simpan creation_id ke profil
    igState.lastCreationId = creationId;
    igPersistState();

    // Tambah kartu ke area output
    igAddContentCard({ caption, imageUrl, tags, creationId });
    showToast(`✅ Konten berhasil dibuat! Creation ID: ${creationId}`, 'success');

  } catch {
    showToast('❌ Tidak bisa terhubung ke backend.', 'error');
  } finally {
    if (createIcon) createIcon.classList.remove('hidden');
    if (createText) { createText.textContent = 'Buat Konten'; createText.classList.remove('hidden'); }
    if (spinner)    spinner.classList.add('hidden');
    if (createBtn)  createBtn.disabled = false;
  }
}

/**
 * Tambah kartu konten ke area output.
 */
function igAddContentCard({ caption, imageUrl, tags, creationId }) {
  const id = 'igcard_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  igContentCards.push({ id, caption, imageUrl, tags, creationId });
  appSession.igContentCards = igContentCards;
  appSessionPersist();
  igRenderContentCards();
}

/**
 * Hapus kartu konten.
 */
function igDeleteContentCard(cardId) {
  igContentCards = igContentCards.filter(c => c.id !== cardId);
  appSession.igContentCards = igContentCards;
  appSessionPersist();
  igRenderContentCards();
}

/**
 * Render semua kartu konten ke area output.
 */
function igRenderContentCards() {
  const area  = document.getElementById('igContentArea');
  const grid  = document.getElementById('igContentGrid');
  const count = document.getElementById('igContentCount');
  if (!area || !grid) return;

  if (igContentCards.length === 0) {
    area.classList.add('hidden');
    return;
  }

  area.classList.remove('hidden');
  if (count) count.textContent = igContentCards.length + ' konten';

  grid.innerHTML = igContentCards.map(card => `
    <div class="ig-content-card${card.posted ? ' ig-content-card--posted' : ''}" id="${escapeHtml(card.id)}">
      <!-- Delete button -->
      <button class="ig-card-delete-btn" onclick="igDeleteContentCard('${escapeHtml(card.id)}')" title="Hapus konten">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
      </button>
      <!-- Image preview -->
      <div class="ig-card-img-wrap">
        <img class="ig-card-img" src="${escapeHtml(card.imageUrl)}" alt="Preview foto konten"
          onerror="this.parentNode.innerHTML='<div class=ig-card-img-placeholder><svg width=28 height=28 viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'currentColor\\' stroke-width=\\'1.5\\'><rect x=\\'3\\' y=\\'3\\' width=\\'18\\' height=\\'18\\' rx=\\'2\\'></rect><circle cx=\\'8.5\\' cy=\\'8.5\\' r=\\'1.5\\'></circle><polyline points=\\'21 15 16 10 5 21\\'></polyline></svg></div>'" />
      </div>
      <!-- Caption -->
      <div class="ig-card-body">
        <p class="ig-card-caption">${escapeHtml(card.caption)}</p>
        ${card.tags ? `<p class="ig-card-tags">${escapeHtml(card.tags)}</p>` : ''}
        <!-- Creation ID -->
        <div class="ig-card-creation-id">
          <span class="ig-card-creation-label">Creation ID</span>
          <span class="ig-id-value ig-card-creation-val">${escapeHtml(card.creationId)}</span>
        </div>
        <!-- Post button -->
        <button class="ig-card-post-btn" ${card.posted ? 'disabled' : ''} onclick="igPostContent('${escapeHtml(card.id)}', '${escapeHtml(card.creationId)}')">
          ${card.posted ? '✅ Sudah Diposting' : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Post Konten`}
        </button>
      </div>
    </div>
  `).join('');
}

/**
 * Post konten yang sudah dibuat (publish dari container).
 */
async function igPostContent(cardId, creationId) {
  if (!igRequireApiKey()) return;
  if (!igState.connected) {
    showToast('◉ Hubungkan akun Instagram terlebih dahulu.', 'error'); return;
  }

  const card = igContentCards.find(c => c.id === cardId);
  if (!card) return;

  const cardEl  = document.getElementById(cardId);
  const postBtn = cardEl?.querySelector('.ig-card-post-btn');
  if (postBtn) { postBtn.disabled = true; postBtn.textContent = '⏳ Posting...'; }

  try {
    showToast('⏳ Memposting ke Instagram...', 'info');

    const res = await fetch(`${IG_API_BASE}/publish`, {
      method:  'POST',
      headers: igApiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        user_id:      igState.userId,
        ig_user_id:   igState.igUserId,
        creation_id:  creationId
      })
    });
    const data = await res.json();

    if (!res.ok || data.error) {
      showToast(`❌ ${data.error || 'Gagal posting konten'}`, 'error');
      if (postBtn) { postBtn.disabled = false; postBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Post Konten'; }
      return;
    }

    showToast('🎉 Konten berhasil dipublikasikan ke Instagram!', 'success');

    // Mark card as posted
    if (cardEl) {
      card.posted = true;
      appSession.igContentCards = igContentCards;
      appSessionPersist();
      cardEl.classList.add('ig-content-card--posted');
      if (postBtn) { postBtn.disabled = true; postBtn.textContent = '✅ Sudah Diposting'; }
    }

  } catch {
    showToast('❌ Tidak bisa terhubung ke backend.', 'error');
    if (postBtn) { postBtn.disabled = false; postBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Post Konten'; }
  }
}

/** Legacy — kept for backward compatibility with igVerifyConnection */
async function igPost() {
  showToast('◉ Gunakan tombol "Buat Konten" untuk membuat konten Instagram.', 'info');
}

/* ══════════════════════════════════════════════════════════
   UNIFIED MESSAGE INBOX
══════════════════════════════════════════════════════════ */
const inboxState = {
  active: false,
  timer: null,
  busy: false,
  userId: '',
  connections: {},
  conversations: { instagram: [] },
  selected: null,
  messages: [],
  errors: {}
};

function inboxUserId() {
  const profile = igActiveProfile();
  return profile && profile.composioUserId ? profile.composioUserId : '';
}

async function inboxRequest(path, options = {}) {
  const url = path.startsWith('http')
    ? path
    : path.startsWith('/api/')
      ? `${_BACKEND_ORIGIN}${path}`
      : `${INBOX_API_BASE}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: igApiHeaders({
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    })
  });
  const body = await response.text();
  let data;
  try {
    data = body ? JSON.parse(body) : {};
  } catch {
    if ((response.headers.get('content-type') || '').includes('text/html')) {
      throw new Error('Endpoint Inbox tidak ditemukan di backend. Restart backend, lalu segarkan halaman.');
    }
    throw new Error(`Respons backend bukan JSON (HTTP ${response.status}).`);
  }
  if (!response.ok) throw new Error(data.error || `Permintaan gagal (HTTP ${response.status}).`);
  return data;
}

function inboxInit() {
  const workspace = document.getElementById('inboxWorkspace');
  if (!workspace) return;

  document.getElementById('inboxRefreshBtn').addEventListener('click', inboxRefresh);
  document.getElementById('inboxOpenInstagram').addEventListener('click', () => {
    switchFn('ig-autopost');
  });
  document.getElementById('inboxThreadList').addEventListener('click', event => {
    const button = event.target.closest('[data-conversation-id]');
    if (!button) return;
    const conversation = inboxState.conversations[button.dataset.channel]
      .find(item => item.id === button.dataset.conversationId);
    if (conversation) inboxSelectConversation(conversation);
  });
  document.getElementById('inboxReloadMessagesBtn').addEventListener('click', inboxLoadSelectedMessages);
  document.getElementById('inboxReplyText').addEventListener('input', inboxUpdateSendButton);
  document.getElementById('inboxComposer').addEventListener('submit', inboxSendReply);
  document.getElementById('inboxDraftBtn').addEventListener('click', inboxCreateDraft);
}

function inboxSetActive(active) {
  if (!active) {
    inboxState.active = false;
    if (inboxState.timer) clearInterval(inboxState.timer);
    inboxState.timer = null;
    return;
  }
  if (inboxState.active) return;
  inboxState.active = true;
  inboxRefresh();
  inboxState.timer = setInterval(() => {
    if (document.visibilityState === 'visible') inboxRefresh();
  }, 60000);
}

function inboxSetSyncStatus(message, state = '') {
  const status = document.getElementById('inboxSyncStatus');
  if (!status) return;
  const wrap = status.parentElement;
  status.textContent = message;
  wrap.classList.toggle('is-busy', state === 'busy');
  wrap.classList.toggle('is-error', state === 'error');
}

function inboxRenderConnections() {
  const card = document.querySelector('[data-inbox-connection="instagram"]');
  const status = card && card.querySelector('[data-connection-status]');
  const connection = inboxState.connections.instagram || {};
  if (card) card.classList.toggle('is-connected', !!connection.connected);
  if (status) {
    status.textContent = connection.connected
      ? `Terhubung${connection.username ? ` sebagai ${connection.username}` : ''} — akun Post IG`
      : 'Menggunakan akun Instagram yang sama dengan Post IG';
  }
}

function inboxRenderConversations() {
  const list = document.getElementById('inboxThreadList');
  const items = (inboxState.conversations.instagram || [])
    .sort((left, right) => (Date.parse(right.updatedAt) || 0) - (Date.parse(left.updatedAt) || 0));

  if (!items.length) {
    const error = Object.values(inboxState.errors)[0];
    list.innerHTML = `<div class="inbox-empty">${escapeHtml(error || 'Belum ada percakapan. Pastikan akun terhubung dan memiliki izin pesan.')}</div>`;
    return;
  }

  list.innerHTML = items.map(conversation => {
    const selected = inboxState.selected
      && inboxState.selected.platform === conversation.platform
      && inboxState.selected.id === conversation.id;
    const mark = (conversation.name || 'P').trim().slice(0, 1).toUpperCase();
    return `<button type="button" class="inbox-thread${selected ? ' is-selected' : ''}" data-channel="${conversation.platform}" data-conversation-id="${escapeHtml(conversation.id)}">
      <span class="inbox-thread-mark" data-platform="${conversation.platform}">${escapeHtml(mark)}</span>
      <span class="inbox-thread-content">
        <span class="inbox-thread-top"><strong>${escapeHtml(conversation.name)}</strong><time>${escapeHtml(inboxFormatTime(conversation.updatedAt))}</time></span>
        <span class="inbox-thread-platform">Instagram</span>
        <p>${escapeHtml(conversation.preview || 'Buka percakapan')}</p>
      </span>
    </button>`;
  }).join('');
}

function inboxFormatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: 'short'
  }).format(date);
}

async function inboxLoadConversations(channel, userId) {
  const params = new URLSearchParams({ user_id: userId });
  const result = await inboxRequest(`/${channel}/conversations?${params.toString()}`);
  inboxState.conversations[channel] = Array.isArray(result.conversations) ? result.conversations : [];
  delete inboxState.errors[channel];
}

async function inboxRefresh() {
  if (inboxState.busy || !inboxState.active) return;
  const userId = inboxUserId();
  if (!userId) {
    inboxSetSyncStatus('Profil aktif tidak memiliki ID Composio', 'error');
    return;
  }
  if (inboxState.userId !== userId) {
    inboxState.userId = userId;
    inboxState.connections = {};
    inboxState.conversations = { instagram: [] };
    inboxState.selected = null;
    inboxState.messages = [];
    inboxState.errors = {};
  }
  if (!igGetApiKey()) {
    inboxSetSyncStatus('Masukkan API key Composio pada menu Post IG', 'error');
    inboxRenderConnections();
    inboxRenderConversations();
    return;
  }

  inboxState.busy = true;
  inboxSetSyncStatus('Memeriksa koneksi dan pesan…', 'busy');
  try {
    const status = await inboxRequest(`${IG_API_BASE}/status?user_id=${encodeURIComponent(userId)}`);
    if (status.error) throw new Error(status.error);
    inboxState.connections.instagram = {
      connected: !!status.connected,
      username: status.username || ''
    };
    inboxRenderConnections();

    if (inboxState.connections.instagram.connected) {
      await inboxLoadConversations('instagram', userId);
    } else {
      inboxState.conversations.instagram = [];
      delete inboxState.errors.instagram;
    }
    inboxRenderConversations();
    if (inboxState.selected) {
      const current = (inboxState.conversations[inboxState.selected.platform] || [])
        .find(item => item.id === inboxState.selected.id);
      if (current) {
        inboxState.selected = {
          ...current,
          recipientId: inboxState.selected.recipientId,
          fallbackRecipientId: inboxState.selected.fallbackRecipientId
        };
        await inboxLoadSelectedMessages();
      }
    }
    const failures = Object.keys(inboxState.errors);
    inboxSetSyncStatus(failures.length
      ? `Sebagian inbox gagal dimuat (${failures.join(', ')})`
      : `Diperbarui ${new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`,
    failures.length ? 'error' : '');
  } catch (error) {
    inboxState.errors.instagram = error.message;
    inboxRenderConversations();
    inboxSetSyncStatus(error.message, 'error');
  } finally {
    inboxState.busy = false;
  }
}

async function inboxSelectConversation(conversation) {
  inboxState.selected = {
    ...conversation,
    recipientId: '',
    fallbackRecipientId: conversation.recipientId
  };
  document.getElementById('inboxChatEmpty').classList.add('hidden');
  document.getElementById('inboxChat').classList.remove('hidden');
  document.getElementById('inboxContactName').textContent = conversation.name || 'Pelanggan';
  document.getElementById('inboxContactChannel').textContent = 'Instagram';
  inboxRenderConversations();
  await inboxLoadSelectedMessages();
}

async function inboxLoadSelectedMessages() {
  const selected = inboxState.selected;
  if (!selected) return;
  const userId = inboxUserId();
  const params = new URLSearchParams({ user_id: userId });
  const list = document.getElementById('inboxMessageList');
  list.innerHTML = '<div class="inbox-empty">Memuat pesan…</div>';
  try {
    const result = await inboxRequest(
      `/${selected.platform}/conversations/${encodeURIComponent(selected.id)}/messages?${params.toString()}`
    );
    if (!inboxState.selected || inboxState.selected.id !== selected.id) return;
    inboxState.messages = Array.isArray(result.messages) ? result.messages : [];
    inboxState.messages.sort((left, right) => (Date.parse(left.createdAt) || 0) - (Date.parse(right.createdAt) || 0));
    const latestInbound = [...inboxState.messages].reverse().find(message =>
      !message.isOutgoing && message.senderId
    );
    inboxState.selected.recipientId = latestInbound
      ? latestInbound.senderId
      : selected.fallbackRecipientId;
    inboxRenderMessages();
    inboxUpdateSendButton();
  } catch (error) {
    list.innerHTML = `<div class="inbox-empty">${escapeHtml(error.message)}</div>`;
    inboxSetSyncStatus(error.message, 'error');
  }
}

function inboxRenderMessages() {
  const list = document.getElementById('inboxMessageList');
  if (!inboxState.messages.length) {
    list.innerHTML = '<div class="inbox-empty">Belum ada pesan yang dapat ditampilkan.</div>';
    return;
  }
  list.innerHTML = inboxState.messages.map(message => `<article class="inbox-message${message.isOutgoing ? ' is-outgoing' : ''}">
    <p>${escapeHtml(message.text || (message.attachments && message.attachments.length ? 'Lampiran media' : 'Pesan tanpa teks'))}</p>
    <time>${escapeHtml(inboxFormatTime(message.createdAt))}</time>
  </article>`).join('');
  list.scrollTop = list.scrollHeight;
}

function inboxUpdateSendButton() {
  const button = document.getElementById('inboxSendBtn');
  const notice = document.getElementById('inboxReplyWindowNotice');
  const text = document.getElementById('inboxReplyText').value.trim();
  const latestInbound = [...inboxState.messages].reverse().find(message =>
    !message.isOutgoing && message.createdAt
  );
  const inboundTime = latestInbound ? Date.parse(latestInbound.createdAt) : NaN;
  const outsideWindow = Number.isFinite(inboundTime)
    && Date.now() - inboundTime >= 24 * 60 * 60 * 1000;

  if (notice) {
    notice.textContent = outsideWindow
      ? 'Batas balasan 24 jam sudah lewat. Minta pelanggan mengirim DM baru untuk membuka jendela balasan.'
      : 'Balas DM dalam 24 jam setelah pesan terbaru dari pelanggan.';
    notice.classList.toggle('is-expired', outsideWindow);
  }
  button.disabled = outsideWindow
    || !inboxState.selected
    || !inboxState.selected.recipientId
    || !text
    || text.length > 4000;
  button.title = outsideWindow
    ? 'Jendela balasan Instagram selama 24 jam telah berakhir.'
    : '';
}

async function inboxCreateDraft() {
  if (!inboxState.selected || !inboxState.messages.length) {
    showToast('Pilih percakapan yang memiliki pesan terlebih dahulu.', 'error');
    return;
  }
  const button = document.getElementById('inboxDraftBtn');
  button.disabled = true;
  button.textContent = 'Menyiapkan draf…';
  try {
    const result = await inboxRequest('/draft', {
      method: 'POST',
      body: JSON.stringify({
        platform: inboxState.selected.platform,
        contact_name: inboxState.selected.name,
        messages: inboxState.messages.slice(-12).map(message => ({
          text: message.text,
          isOutgoing: message.isOutgoing
        }))
      })
    });
    if (!result.draft) throw new Error('Flow AI tidak menghasilkan draf balasan.');
    document.getElementById('inboxReplyText').value = result.draft;
    inboxUpdateSendButton();
    document.getElementById('inboxReplyText').focus();
    showToast('Draf AI siap ditinjau. Pesan belum dikirim.', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'Buat draf AI';
  }
}

async function inboxSendReply(event) {
  event.preventDefault();
  const selected = inboxState.selected;
  const text = document.getElementById('inboxReplyText').value.trim();
  if (!selected || !text || !selected.recipientId) {
    showToast('Pilih percakapan dan pastikan penerima dapat diidentifikasi.', 'error');
    return;
  }
  const button = document.getElementById('inboxSendBtn');
  button.disabled = true;
  button.textContent = 'Mengirim…';
  try {
    await inboxRequest(`/${selected.platform}/send`, {
      method: 'POST',
      body: JSON.stringify({
        user_id: inboxUserId(),
        conversation_id: selected.id,
        recipient_id: selected.recipientId,
        reply_to_message_id: selected.platform === 'instagram'
          ? [...inboxState.messages].reverse().find(message => !message.isOutgoing)?.id
          : undefined,
        text
      })
    });
    document.getElementById('inboxReplyText').value = '';
    showToast('Balasan berhasil dikirim.', 'success');
    await inboxRefresh();
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    button.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></svg> Kirim balasan';
    inboxUpdateSendButton();
  }
}
