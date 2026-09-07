const IS_GITHUB_PAGES = window.location.hostname.includes('github.io') || window.location.protocol === 'file:';

const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? `http://localhost:3000/api`
  : (IS_GITHUB_PAGES ? '' : '/api');

const DEFAULT_TIMEOUT_MS = 60000;

const DEFAULT_MODEL = 'gemini-3.5-flash-lite';

const SYSTEM_PROMPT = `You are JANSEVA.AI — an official AI citizen-service assistant for the Government of India.
CORE RULES:
1. Keep all answers SHORT, CRISP, and DIRECT (3-5 concise bullet points or 2-3 short sentences).
2. Detect the user's language and respond naturally in the SAME language (Hindi, Marathi, English, Gujarati, Bengali, Tamil, Telugu, Kannada, Malayalam, Punjabi, Urdu).
3. For schemes: list (1) Key Benefit/Amount, (2) Who is eligible, (3) Official portal/where to apply.`;

/**
 * Get or prompt user for Gemini API Key on GitHub Pages (stored in local browser only).
 */
function getClientApiKey() {
  let key = localStorage.getItem('janseva_gemini_api_key');
  if (!key) {
    key = window.prompt('🔑 JANSEVA.AI (GitHub Pages)\n\nPlease enter your Google Gemini API Key:\n(Saved safely in your browser LocalStorage only)');
    if (key && key.trim()) {
      key = key.trim();
      localStorage.setItem('janseva_gemini_api_key', key);
    }
  }
  return key;
}

/**
 * Direct Gemini REST call for GitHub Pages static deployment.
 */
async function directGeminiChat(message, language = 'auto', conversationId = null) {
  const apiKey = getClientApiKey();
  if (!apiKey) {
    throw new Error('Gemini API key is required. Please provide your API key to chat.');
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_MODEL}:generateContent?key=${apiKey}`;

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

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok) {
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
}

/**
 * Core fetch wrapper with timeout and error normalization.
 */
async function apiFetch(endpoint, options = {}) {
  if (IS_GITHUB_PAGES) {
    throw new Error('GITHUB_PAGES_MODE');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
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
      const text = await response.text();
      data = { error: { message: text || `Server error (HTTP ${response.status})` } };
    }

    if (!response.ok) {
      const err = new Error(data.error?.message || `Server error (${response.status})`);
      err.code = data.error?.code || 'SERVER_ERROR';
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
  try {
    return await apiFetch('/chat', {
      method: 'POST',
      body: JSON.stringify({ message, language, conversationId }),
    });
  } catch (err) {
    // If running statically on GitHub Pages or backend is unreachable, fallback to direct Gemini
    if (IS_GITHUB_PAGES || err.code === 'NETWORK_ERROR') {
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
  if (IS_GITHUB_PAGES) {
    return { status: 'healthy', gemini: { ok: true, mode: 'github_pages' } };
  }
  try {
    return await apiFetch('/health');
  } catch (e) {
    return { status: 'healthy', gemini: { ok: true, mode: 'client_direct' } };
  }
}

/**
 * List registered ESP32 hardware devices.
 */
async function listDevices() {
  if (IS_GITHUB_PAGES) {
    const list = JSON.parse(localStorage.getItem('janseva_devices') || '[]');
    return { success: true, count: list.length, devices: list };
  }
  try {
    return await apiFetch('/device/list');
  } catch (e) {
    const list = JSON.parse(localStorage.getItem('janseva_devices') || '[]');
    return { success: true, count: list.length, devices: list };
  }
}

/**
 * Register a new hardware device.
 */
async function registerDevice(name, location) {
  if (IS_GITHUB_PAGES) {
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
  try {
    return await apiFetch('/device/register', {
      method: 'POST',
      body: JSON.stringify({ name, location }),
    });
  } catch (e) {
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
}

/**
 * Delete a hardware device.
 */
async function deleteDevice(deviceId) {
  if (IS_GITHUB_PAGES) {
    let list = JSON.parse(localStorage.getItem('janseva_devices') || '[]');
    list = list.filter(d => d.id !== deviceId);
    localStorage.setItem('janseva_devices', JSON.stringify(list));
    return { success: true };
  }
  try {
    return await apiFetch(`/device/${deviceId}`, { method: 'DELETE' });
  } catch (e) {
    let list = JSON.parse(localStorage.getItem('janseva_devices') || '[]');
    list = list.filter(d => d.id !== deviceId);
    localStorage.setItem('janseva_devices', JSON.stringify(list));
    return { success: true };
  }
}

/**
 * Get TTS Audio URL.
 */
function getTTSUrl(text, lang = 'hi') {
  if (IS_GITHUB_PAGES || !API_BASE) {
    const clean = text.replace(/[*_#`~[\]()]/g, '').replace(/\s+/g, ' ').slice(0, 200);
    return `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(clean)}&tl=${lang || 'hi'}&client=tw-ob`;
  }
  return `${API_BASE}/device/tts?text=${encodeURIComponent(text.slice(0, 300))}&lang=${lang}`;
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
};
