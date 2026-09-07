/**
 * JANSEVA.AI — Chat Service
 * Orchestrates the full chat pipeline:
 * User Message → Language Detection → Conversation History → Gemini → Response
 *
 * This is the main business logic layer. Designed to be voice-ready:
 * STT output can be passed as `userMessage` without changing this service.
 */

const geminiService   = require('./geminiService');
const languageService = require('./languageService');
const conversationService = require('./conversationService');

/**
 * Process a chat message through the full pipeline.
 * @param {object} params
 * @param {string} params.message          — Raw user message text
 * @param {string} params.language         — 'auto' or ISO code (hi, mr, en, ...)
 * @param {string} params.conversationId   — Existing conversation ID or null
 * @returns {object} { reply, language, conversationId, timestamp }
 */
async function processMessage({ message, language = 'auto', conversationId = null }) {
  // ── 1. Input validation ────────────────────────────────────────────────────
  if (!message || message.trim().length === 0) {
    throw createChatError('EMPTY_MESSAGE', 'Message cannot be empty', 400);
  }

  const trimmedMessage = message.trim();

  // ── 2. Conversation management ────────────────────────────────────────────
  const conversation = conversationService.getOrCreateConversation(conversationId);
  const convId = conversation.id;

  // ── 3. Language resolution ────────────────────────────────────────────────
  // If user set a preferred language for this session, use it
  const sessionLanguage = conversation.language !== 'auto' ? conversation.language : language;
  const resolvedLang = languageService.resolveLanguage(trimmedMessage, sessionLanguage);
  const langInstruction = languageService.getLanguageInstruction(resolvedLang);

  // ── 4. Get conversation history for Gemini ────────────────────────────────
  const history = conversationService.getGeminiHistory(convId);

  // ── 5. Call Gemini ────────────────────────────────────────────────────────
  const aiReply = await geminiService.sendMessage(trimmedMessage, history, langInstruction);

  // ── 6. Save both user message and AI response to history on success ────────
  conversationService.appendMessage(convId, 'user', trimmedMessage, resolvedLang);
  conversationService.appendMessage(convId, 'model', aiReply, resolvedLang);

  // ── 8. Update session language if it was auto-detected ───────────────────
  if (language === 'auto') {
    // Keep auto-detect active for future messages (don't lock the language)
    conversationService.setConversationLanguage(convId, 'auto');
  }

  return {
    reply: aiReply,
    language: resolvedLang,
    conversationId: convId,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create a structured chat error with citizen-friendly message.
 */
function createChatError(code, technicalMessage, statusCode = 500) {
  const err = new Error(technicalMessage);
  err.code = code;
  err.statusCode = statusCode;
  return err;
}

/**
 * Get user-friendly error message in the appropriate language.
 * These are shown directly to citizens, so they must be friendly.
 */
function getFriendlyErrorMessage(errorCode, language = 'en') {
  const messages = {
    EMPTY_MESSAGE: {
      en: 'Please type your question before sending.',
      hi: 'कृपया भेजने से पहले अपना प्रश्न लिखें।',
      mr: 'कृपया पाठवण्यापूर्वी आपला प्रश्न लिहा.',
    },
    GEMINI_ERROR: {
      en: 'Our AI assistant is temporarily unavailable. Please try again in a moment.',
      hi: 'हमारी AI सेवा अभी अनुपलब्ध है। कृपया थोड़ी देर बाद पुनः प्रयास करें।',
      mr: 'आमची AI सेवा सध्या उपलब्ध नाही. कृपया थोड्या वेळाने पुन्हा प्रयत्न करा.',
    },
    RATE_LIMIT: {
      en: 'You are sending messages too quickly. Please wait a moment.',
      hi: 'आप बहुत तेजी से संदेश भेज रहे हैं। कृपया थोड़ा इंतजार करें।',
      mr: 'आपण खूप वेगाने संदेश पाठवत आहात. कृपया थोडा वेळ थांबा.',
    },
    INVALID_API_KEY: {
      en: 'Service configuration error. Please contact the administrator.',
      hi: 'सेवा कॉन्फ़िगरेशन त्रुटि। कृपया प्रशासक से संपर्क करें।',
      mr: 'सेवा कॉन्फिगरेशन त्रुटी. कृपया प्रशासकाशी संपर्क करा.',
    },
    SERVER_ERROR: {
      en: 'Something went wrong on our side. Please try again.',
      hi: 'हमारी तरफ से कुछ गड़बड़ी हुई। कृपया पुनः प्रयास करें।',
      mr: 'आमच्याकडून काहीतरी चूक झाली. कृपया पुन्हा प्रयत्न करा.',
    },
  };

  const msgGroup = messages[errorCode] || messages.SERVER_ERROR;
  return msgGroup[language] || msgGroup.en;
}

module.exports = {
  processMessage,
  getFriendlyErrorMessage,
  createChatError,
};
