const IS_STATIC_HOST =
  window.location.hostname.includes('github.io') ||
  window.location.hostname.includes('netlify.app') ||
  window.location.hostname.includes('vercel.app') ||
  window.location.hostname.includes('pages.dev') ||
  window.location.hostname.includes('render.com') ||
  window.location.protocol === 'file:';

/**
 * Get active Backend API Base URL.
 * Priority:
 * 1. User configured custom backend URL (localStorage: 'janseva_backend_url')
 * 2. Localhost dev server (http://localhost:3000/api)
 * 3. Relative '/api' (if hosted on full server or reverse proxy)
 * 4. null (if static host like Netlify / GitHub Pages with no backend linked yet)
 */
function getApiBase() {
  const custom = localStorage.getItem('janseva_backend_url');
  if (custom && custom.trim()) {
    const clean = custom.trim().replace(/\/+$/, '');
    return clean.endsWith('/api') ? clean : `${clean}/api`;
  }
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return `http://localhost:3000/api`;
  }
  if (IS_STATIC_HOST) {
    return null;
  }
  return '/api';
}

function getBackendUrl() {
  const custom = localStorage.getItem('janseva_backend_url');
  if (custom && custom.trim()) return custom.trim();
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:3000';
  }
  return '';
}

function setBackendUrl(url) {
  if (!url || !url.trim()) {
    localStorage.removeItem('janseva_backend_url');
  } else {
    let clean = url.trim().replace(/\/+$/, '');
    if (clean.endsWith('/api')) clean = clean.slice(0, -4);
    localStorage.setItem('janseva_backend_url', clean);
  }
}

function isLiveBackend() {
  return !!getApiBase();
}

const DEFAULT_TIMEOUT_MS = 60000;

// High performance Gemini models with automatic fallback
const CANDIDATE_MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-flash-latest'];

const SYSTEM_PROMPT = `You are JANSEVA.AI — an official AI citizen-service assistant for the Government of India.
CORE RULES:
1. Keep all answers SHORT, CRISP, and DIRECT (3-5 concise bullet points or 2-3 short sentences).
2. Detect the user's language and respond naturally in the SAME language (Hindi, Marathi, English, Gujarati, Bengali, Tamil, Telugu, Kannada, Malayalam, Punjabi, Urdu).
3. For schemes: list (1) Key Benefit/Amount, (2) Who is eligible, (3) Official portal/where to apply.`;

/**
 * Get or prompt user for Gemini API Key on Netlify / GitHub Pages (stored in local browser only).
 */
function getClientApiKey() {
  let key = localStorage.getItem('janseva_gemini_api_key');
  if (!key) {
    key = window.prompt('🔑 JANSEVA.AI (Netlify / Static Hosting)\n\nPlease enter your Google Gemini API Key:\n(Saved safely in your browser LocalStorage only)');
    if (key && key.trim()) {
      key = key.trim();
      localStorage.setItem('janseva_gemini_api_key', key);
    }
  }
  return key;
}

/**
 * Direct Gemini REST call for Netlify / GitHub Pages static deployment.
 */
async function directGeminiChat(message, language = 'auto', conversationId = null) {
  const apiKey = getClientApiKey();
  if (!apiKey) {
    throw new Error('🔑 Gemini API key is required. Please click Settings (⚙️) to enter your API key.');
  }

  const langInstruction = language !== 'auto' ? `[Respond in ${language}]\n\n` : '';
  const payload = {
    systemInstruction: {
      parts: [{ text: SYSTEM_PROMPT }]
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: `${langInstruction}${message}` }]
      }
    ]
  };

  let lastError = null;
  for (const modelName of CANDIDATE_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (!response.ok) {
        if (response.status === 404 || data.error?.message?.includes('not found') || data.error?.message?.includes('no longer available')) {
          lastError = new Error(data.error?.message || `Model ${modelName} not found`);
          continue;
        }
        throw new Error(data.error?.message || `Gemini error (${response.status})`);
      }

      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';
      return {
        success: true,
        reply,
        language: language || 'hi',
        conversationId: conversationId || `conv_${Date.now()}`,
        timestamp: new Date().toISOString()
      };
    } catch (err) {
      lastError = err;
      if (!err.message?.includes('not found') && !err.message?.includes('no longer available') && !err.message?.includes('404')) {
        throw err;
      }
    }
  }

  throw lastError || new Error('Failed to communicate with Gemini API');
}

/**
 * Core fetch wrapper with timeout and error normalization.
 */
async function apiFetch(endpoint, options = {}) {
  const base = getApiBase();
  if (!base) {
    const err = new Error('NO_BACKEND_SERVER');
    err.code = 'NO_BACKEND_SERVER';
    throw err;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(`${base}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      signal: controller.signal,
      ...options,
    });

    clearTimeout(timeout);

    let data;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      // Returned HTML or non-JSON (e.g. Netlify 404 or SPA rewrite)
      const err = new Error('Backend returned non-JSON response (possibly static host HTML).');
      err.code = 'NO_BACKEND_SERVER';
      err.status = response.status;
      throw err;
    }

    if (!response.ok) {
      const err = new Error(data.error?.message || `Server error (${response.status})`);
      err.code = data.error?.code || (response.status === 404 || response.status === 405 ? 'NO_BACKEND_SERVER' : 'SERVER_ERROR');
      err.status = response.status;
      err.serverData = data;
      throw err;
    }

    return data;
  } catch (err) {
    clearTimeout(timeout);

    if (err.name === 'AbortError') {
      const timeoutErr = new Error('Request timed out. Please check your connection and try again.');
      timeoutErr.code = 'TIMEOUT';
      throw timeoutErr;
    }

    if (err.code === 'NO_BACKEND_SERVER') {
      throw err;
    }

    if (err.message === 'Failed to fetch' || err.message.includes('NetworkError') || err.message.includes('fetch')) {
      const netErr = new Error('Cannot connect to server. Please make sure the backend is running.');
      netErr.code = 'NETWORK_ERROR';
      throw netErr;
    }

    throw err;
  }
}

/**
 * Send a chat message.
 * @param {string} message
 * @param {string} language — 'auto' or ISO code
 * @param {string|null} conversationId
 */
async function sendMessage(message, language = 'auto', conversationId = null) {
  const base = getApiBase();
  // If static deployment without backend, use direct Gemini immediately
  if (!base) {
    return directGeminiChat(message, language, conversationId);
  }

  try {
    return await apiFetch('/chat', {
      method: 'POST',
      body: JSON.stringify({ message, language, conversationId }),
    });
  } catch (err) {
    // If running statically on Netlify / GitHub Pages with no backend or backend is unreachable, fallback to direct Gemini
    if (IS_STATIC_HOST || err.code === 'NETWORK_ERROR' || err.code === 'NO_BACKEND_SERVER' || err.message === 'NO_BACKEND_SERVER') {
      console.warn('Backend unavailable, routing request directly via Gemini API:', err.message);
      return directGeminiChat(message, language, conversationId);
    }
    throw err;
  }
}

/**
 * Create a new conversation session.
 */
async function createConversation() {
  return apiFetch('/conversation/new', { method: 'POST' });
}

/**
 * Delete a conversation.
 */
async function deleteConversation(conversationId) {
  return apiFetch(`/conversation/${conversationId}`, { method: 'DELETE' });
}

/**
 * Clear conversation messages.
 */
async function clearConversation(conversationId) {
  return apiFetch(`/conversation/${conversationId}/clear`, { method: 'POST' });
}

/**
 * List all active conversations.
 */
async function listConversations() {
  return apiFetch('/conversations');
}

/**
 * Update conversation language preference.
 */
async function setLanguage(conversationId, language) {
  return apiFetch(`/conversation/${conversationId}/language`, {
    method: 'PATCH',
    body: JSON.stringify({ language }),
  });
}

/**
 * Health check.
 */
async function healthCheck() {
  const base = getApiBase();
  if (!base) {
    return {
      status: 'healthy',
      gemini: {
        ok: true,
        mode: 'static_standalone',
        hasClientKey: !!localStorage.getItem('janseva_gemini_api_key'),
      }
    };
  }
  try {
    return await apiFetch('/health');
  } catch (e) {
    return {
      status: 'healthy',
      gemini: {
        ok: true,
        mode: 'client_direct',
        hasClientKey: !!localStorage.getItem('janseva_gemini_api_key'),
      }
    };
  }
}

/**
 * List registered ESP32 hardware devices.
 */
async function listDevices() {
  const base = getApiBase();
  if (base) {
    try {
      const res = await apiFetch('/device/list');
      if (res && res.devices) return res;
    } catch (e) {
      console.warn('Backend /device/list unreachable, falling back to local cache:', e.message);
    }
  }
  const list = JSON.parse(localStorage.getItem('janseva_devices') || '[]');
  return { success: true, count: list.length, devices: list, isMock: !base };
}

/**
 * Register a new hardware device.
 */
async function registerDevice(name, location) {
  const base = getApiBase();
  if (base) {
    try {
      return await apiFetch('/device/register', {
        method: 'POST',
        body: JSON.stringify({ name, location }),
      });
    } catch (e) {
      console.warn('Backend register failed, saving locally:', e.message);
    }
  }
  const list = JSON.parse(localStorage.getItem('janseva_devices') || '[]');
  const newDev = {
    id: 'JANSEVA-' + Math.random().toString(36).substring(2, 7).toUpperCase(),
    name: name || 'ESP32 Node',
    location: location || 'Main Counter',
    status: 'online',
    registeredAt: new Date().toISOString(),
  };
  list.push(newDev);
  localStorage.setItem('janseva_devices', JSON.stringify(list));
  return { success: true, device: newDev };
}

/**
 * Delete a hardware device.
 */
async function deleteDevice(deviceId) {
  const base = getApiBase();
  if (base) {
    try {
      return await apiFetch(`/device/${deviceId}`, { method: 'DELETE' });
    } catch (e) {
      console.warn('Backend delete failed, removing locally:', e.message);
    }
  }
  let list = JSON.parse(localStorage.getItem('janseva_devices') || '[]');
  list = list.filter(d => d.id !== deviceId);
  localStorage.setItem('janseva_devices', JSON.stringify(list));
  return { success: true };
}

/**
 * Get TTS Audio URL.
 * Returns Neural Audio URL if live backend is connected, otherwise returns null for Web Speech fallback.
 */
function getTTSUrl(text, lang = 'hi') {
  const base = getApiBase();
  if (base) {
    return `${base}/device/tts?format=mp3&rate=%2B15%25&text=${encodeURIComponent(text.slice(0, 300))}&lang=${lang}`;
  }
  return null;
}

export default {
  sendMessage,
  createConversation,
  deleteConversation,
  clearConversation,
  listConversations,
  setLanguage,
  healthCheck,
  listDevices,
  registerDevice,
  deleteDevice,
  getTTSUrl,
  getBackendUrl,
  setBackendUrl,
  isLiveBackend,
  getApiBase,
};
