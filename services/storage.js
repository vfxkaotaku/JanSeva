/**
 * JANSEVA.AI — Local Storage Service (Frontend)
 * Persists conversation list and UI preferences to localStorage.
 * The actual message content lives on the backend; we only track metadata here.
 */

const STORAGE_KEYS = {
  CONVERSATIONS: 'janseva_conversations',
  ACTIVE_CONV:   'janseva_active_conversation',
  LANGUAGE:      'janseva_language',
  THEME:         'janseva_theme',
};

// ── Conversation Metadata ─────────────────────────────────────────────────────

function saveConversationMeta(conv) {
  const list = getConversationList();
  const idx = list.findIndex(c => c.id === conv.id);
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...conv };
  } else {
    list.unshift(conv);
  }
  localStorage.setItem(STORAGE_KEYS.CONVERSATIONS, JSON.stringify(list.slice(0, 50)));
}

function getConversationList() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.CONVERSATIONS) || '[]');
  } catch {
    return [];
  }
}

function removeConversationMeta(conversationId) {
  const list = getConversationList().filter(c => c.id !== conversationId);
  localStorage.setItem(STORAGE_KEYS.CONVERSATIONS, JSON.stringify(list));
}

// ── Active Conversation ───────────────────────────────────────────────────────

function setActiveConversation(conversationId) {
  localStorage.setItem(STORAGE_KEYS.ACTIVE_CONV, conversationId || '');
}

function getActiveConversation() {
  return localStorage.getItem(STORAGE_KEYS.ACTIVE_CONV) || null;
}

// ── Language Preference ───────────────────────────────────────────────────────

function setLanguagePreference(lang) {
  localStorage.setItem(STORAGE_KEYS.LANGUAGE, lang);
}

function getLanguagePreference() {
  return localStorage.getItem(STORAGE_KEYS.LANGUAGE) || 'auto';
}

// ── Local Chat Messages (for UI restore on refresh) ───────────────────────────
// We store a lightweight copy of messages per conversation for UI display.

function saveMessages(conversationId, messages) {
  try {
    localStorage.setItem(`janseva_msgs_${conversationId}`, JSON.stringify(messages.slice(-100)));
  } catch {
    // localStorage may be full; silently ignore
  }
}

function loadMessages(conversationId) {
  try {
    return JSON.parse(localStorage.getItem(`janseva_msgs_${conversationId}`) || '[]');
  } catch {
    return [];
  }
}

function clearMessages(conversationId) {
  localStorage.removeItem(`janseva_msgs_${conversationId}`);
}

export default {
  saveConversationMeta,
  getConversationList,
  removeConversationMeta,
  setActiveConversation,
  getActiveConversation,
  setLanguagePreference,
  getLanguagePreference,
  saveMessages,
  loadMessages,
  clearMessages,
};
