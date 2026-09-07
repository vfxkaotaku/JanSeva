/**
 * JANSEVA.AI — Chat Routes
 * POST /api/chat        — Send a message
 * GET  /api/health      — Health check
 * POST /api/conversation/new    — New conversation
 * DELETE /api/conversation/:id  — Delete conversation
 * GET  /api/conversations       — List conversations
 */

const express = require('express');
const router  = express.Router();

const chatService         = require('../services/chatService');
const conversationService = require('../services/conversationService');
const geminiService       = require('../services/geminiService');
const { isSupportedLanguage } = require('../services/languageService');

// ── POST /api/chat ────────────────────────────────────────────────────────────
router.post('/chat', async (req, res, next) => {
  try {
    const { message, language = 'auto', conversationId } = req.body;

    // Validate
    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        error: { code: 'EMPTY_MESSAGE', message: 'Message is required and must be a string.' },
      });
    }

    if (message.trim().length > 5000) {
      return res.status(400).json({
        success: false,
        error: { code: 'MESSAGE_TOO_LONG', message: 'Message exceeds maximum length of 5000 characters.' },
      });
    }

    if (language && !isSupportedLanguage(language)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_LANGUAGE', message: `Language '${language}' is not supported.` },
      });
    }

    // Process through chat pipeline
    const result = await chatService.processMessage({ message, language, conversationId });

    res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/health ───────────────────────────────────────────────────────────
router.get('/health', async (req, res) => {
  try {
    const geminiStatus = await geminiService.healthCheck();
    res.json({
      status: geminiStatus.ok ? 'healthy' : 'degraded',
      service: 'JANSEVA.AI',
      gemini: geminiStatus,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// ── POST /api/conversation/new ────────────────────────────────────────────────
router.post('/conversation/new', (req, res) => {
  const id = conversationService.createConversation();
  res.json({ success: true, conversationId: id });
});

// ── DELETE /api/conversation/:id ──────────────────────────────────────────────
router.delete('/conversation/:id', (req, res) => {
  conversationService.deleteConversation(req.params.id);
  res.json({ success: true, message: 'Conversation deleted.' });
});

// ── POST /api/conversation/:id/clear ─────────────────────────────────────────
router.post('/conversation/:id/clear', (req, res) => {
  conversationService.clearConversation(req.params.id);
  res.json({ success: true, message: 'Conversation cleared.' });
});

// ── GET /api/conversations ────────────────────────────────────────────────────
router.get('/conversations', (req, res) => {
  const conversations = conversationService.listConversations();
  res.json({ success: true, conversations });
});

// ── PATCH /api/conversation/:id/language ─────────────────────────────────────
router.patch('/conversation/:id/language', (req, res) => {
  const { language } = req.body;
  if (!isSupportedLanguage(language)) {
    return res.status(400).json({ success: false, error: { message: 'Unsupported language code.' } });
  }
  conversationService.setConversationLanguage(req.params.id, language);
  res.json({ success: true, language });
});

module.exports = router;
