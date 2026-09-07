/**
 * JANSEVA.AI — Speech & Audio Service
 * Handles Speech-to-Text (STT) via Gemini Multimodal & Text-to-Speech (TTS) for ESP32 and Web.
 */

const geminiService = require('./geminiService');
const languageService = require('./languageService');

// ISO language codes for Google TTS
const TTS_LANG_MAP = {
  hi: 'hi',
  mr: 'mr',
  en: 'en-IN',
  gu: 'gu',
  bn: 'bn',
  ta: 'ta',
  te: 'te',
  kn: 'kn',
  ml: 'ml',
  pa: 'pa',
  ur: 'ur',
};

/**
 * Process audio stream received from ESP32 or web client.
 * @param {Buffer} audioBuffer
 * @param {string} mimeType
 * @returns {Promise<{ reply: string, language: string }>}
 */
async function processVoiceQuery(audioBuffer, mimeType = 'audio/wav') {
  if (!audioBuffer || audioBuffer.length === 0) {
    throw new Error('Empty audio buffer received');
  }

  // Use Gemini Multimodal to listen and reply concisely
  const reply = await geminiService.processAudioMessage(audioBuffer, mimeType);
  const detectedLang = languageService.detectLanguage(reply);

  return {
    reply,
    language: detectedLang || 'hi',
  };
}

/**
 * Generate TTS audio stream for a given text and language.
 * Returns an audio/mpeg Buffer playable by browsers and ESP32 audio decoders.
 * @param {string} text
 * @param {string} langCode
 * @returns {Promise<Buffer>}
 */
async function generateTTS(text, langCode = 'hi') {
  if (!text || text.trim().length === 0) {
    throw new Error('Text is required for TTS');
  }

  // Clean markdown symbols from text before speaking
  const cleanText = text
    .replace(/[*_#`~[\]()]/g, '')
    .replace(/📋|🎁|✅|🔗|📄|👥/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300); // 300 char snippet for fast hardware voice delivery

  const ttsLang = TTS_LANG_MAP[langCode] || 'hi';
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(cleanText)}&tl=${ttsLang}&client=tw-ob`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://translate.google.com/',
    },
  });

  if (!response.ok) {
    throw new Error(`TTS generation failed with status: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

module.exports = {
  processVoiceQuery,
  generateTTS,
  TTS_LANG_MAP,
};
