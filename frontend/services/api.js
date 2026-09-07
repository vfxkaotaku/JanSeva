/**
 * JANSEVA.AI — Backend API Service (Frontend)
 * All fetch calls to the Node.js backend go through this module.
 * Voice/STT integration: add sendAudio() here later without changing chat logic.
 */

const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? `http://localhost:3000/api`
  : '/api';

const DEFAULT_TIMEOUT_MS = 60000;

/**
 * Core fetch wrapper with timeout and error normalization.
 */
async function apiFetch(endpoint, options = {}) {
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
  return apiFetch('/chat', {
    method: 'POST',
    body: JSON.stringify({ message, language, conversationId }),
  });
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
  return apiFetch('/health');
}

/**
 * List registered ESP32 hardware devices.
 */
async function listDevices() {
  return apiFetch('/device/list');
}

/**
 * Register a new hardware device.
 */
async function registerDevice(name, location) {
  return apiFetch('/device/register', {
    method: 'POST',
    body: JSON.stringify({ name, location }),
  });
}

/**
 * Delete a hardware device.
 */
async function deleteDevice(deviceId) {
  return apiFetch(`/device/${deviceId}`, { method: 'DELETE' });
}

/**
 * Get TTS Audio URL.
 */
function getTTSUrl(text, lang = 'hi') {
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
