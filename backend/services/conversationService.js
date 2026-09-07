/**
 * JANSEVA.AI — Conversation Service
 * Manages in-memory conversation sessions with TTL cleanup.
 * Designed to be swapped with a database (Redis/MongoDB) in production.
 */

const { v4: uuidv4 } = require('uuid');

// In-memory store: conversationId → { messages: [], createdAt, updatedAt, language }
const conversationStore = new Map();

const MAX_HISTORY    = parseInt(process.env.MAX_CONVERSATION_HISTORY) || 50;
const CONV_TTL_MS    = parseInt(process.env.CONVERSATION_TTL_MS)     || 86400000; // 24h

/**
 * Create a new conversation session.
 */
function createConversation() {
  const id = uuidv4();
  const now = Date.now();
  conversationStore.set(id, {
    id,
    messages: [],
    language: 'auto',
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

/**
 * Get conversation by ID. Returns null if not found or expired.
 */
function getConversation(conversationId) {
  const conv = conversationStore.get(conversationId);
  if (!conv) return null;

  // Check TTL
  if (Date.now() - conv.updatedAt > CONV_TTL_MS) {
    conversationStore.delete(conversationId);
    return null;
  }
  return conv;
}

/**
 * Get or create a conversation.
 */
function getOrCreateConversation(conversationId) {
  if (conversationId) {
    const existing = getConversation(conversationId);
    if (existing) return existing;
  }
  const newId = createConversation();
  return conversationStore.get(newId);
}

/**
 * Append a message to a conversation's history.
 * role: 'user' | 'model'
 */
function appendMessage(conversationId, role, content, language = null) {
  const conv = conversationStore.get(conversationId);
  if (!conv) throw new Error(`Conversation ${conversationId} not found`);

  conv.messages.push({
    role,
    content,
    language,
    timestamp: new Date().toISOString(),
  });

  // Keep history within limit (trim oldest pairs)
  while (conv.messages.length > MAX_HISTORY) {
    conv.messages.shift();
  }

  conv.updatedAt = Date.now();
}

/**
 * Get message history formatted for the Gemini SDK (contents array).
 * Excludes the latest user message (which is sent separately).
 */
function getGeminiHistory(conversationId) {
  const conv = conversationStore.get(conversationId);
  if (!conv || conv.messages.length === 0) return [];

  // Build clean alternating history (user -> model -> user -> model...)
  const history = [];
  let expectedRole = 'user';

  for (const msg of conv.messages) {
    if (msg.role === expectedRole && msg.content) {
      history.push({
        role: msg.role,
        parts: [{ text: msg.content }],
      });
      expectedRole = expectedRole === 'user' ? 'model' : 'user';
    }
  }

  // Must end with 'model' so startChat() is ready for the incoming user message
  while (history.length > 0 && history[history.length - 1].role !== 'model') {
    history.pop();
  }

  return history;
}

/**
 * Update conversation preferred language.
 */
function setConversationLanguage(conversationId, language) {
  const conv = conversationStore.get(conversationId);
  if (conv) {
    conv.language = language;
    conv.updatedAt = Date.now();
  }
}

/**
 * Clear all messages in a conversation (keep session).
 */
function clearConversation(conversationId) {
  const conv = conversationStore.get(conversationId);
  if (conv) {
    conv.messages = [];
    conv.updatedAt = Date.now();
  }
}

/**
 * Delete a conversation entirely.
 */
function deleteConversation(conversationId) {
  conversationStore.delete(conversationId);
}

/**
 * List all active conversation IDs and metadata.
 */
function listConversations() {
  const now = Date.now();
  const result = [];
  for (const [id, conv] of conversationStore.entries()) {
    if (now - conv.updatedAt <= CONV_TTL_MS) {
      result.push({
        id,
        messageCount: conv.messages.length,
        language: conv.language,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        preview: conv.messages.length > 0 ? conv.messages[0].content.slice(0, 80) : '',
      });
    }
  }
  return result.sort((a, b) => b.updatedAt - a.updatedAt);
}

// Cleanup expired conversations every hour
setInterval(() => {
  const now = Date.now();
  for (const [id, conv] of conversationStore.entries()) {
    if (now - conv.updatedAt > CONV_TTL_MS) {
      conversationStore.delete(id);
    }
  }
}, 3600000);

module.exports = {
  createConversation,
  getConversation,
  getOrCreateConversation,
  appendMessage,
  getGeminiHistory,
  setConversationLanguage,
  clearConversation,
  deleteConversation,
  listConversations,
};
