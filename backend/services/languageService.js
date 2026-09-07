/**
 * JANSEVA.AI — Language Service
 * Handles language detection, mapping, and prompt instructions.
 * Designed to be extended with dedicated language detection APIs later.
 */

// Language code to full name mapping
const LANGUAGE_MAP = {
  hi: { name: 'Hindi', native: 'हिंदी', script: 'Devanagari' },
  mr: { name: 'Marathi', native: 'मराठी', script: 'Devanagari' },
  en: { name: 'English', native: 'English', script: 'Latin' },
  gu: { name: 'Gujarati', native: 'ગુજરાતી', script: 'Gujarati' },
  bn: { name: 'Bengali', native: 'বাংলা', script: 'Bengali' },
  ta: { name: 'Tamil', native: 'தமிழ்', script: 'Tamil' },
  te: { name: 'Telugu', native: 'తెలుగు', script: 'Telugu' },
  kn: { name: 'Kannada', native: 'ಕನ್ನಡ', script: 'Kannada' },
  ml: { name: 'Malayalam', native: 'മലയാളം', script: 'Malayalam' },
  pa: { name: 'Punjabi', native: 'ਪੰਜਾਬੀ', script: 'Gurmukhi' },
  ur: { name: 'Urdu', native: 'اردو', script: 'Arabic' },
};

// Unicode script ranges for heuristic language detection
const SCRIPT_RANGES = [
  { range: /[\u0900-\u097F]/, candidates: ['hi', 'mr'] }, // Devanagari → Hindi/Marathi
  { range: /[\u0A80-\u0AFF]/, candidates: ['gu'] },        // Gujarati
  { range: /[\u0980-\u09FF]/, candidates: ['bn'] },        // Bengali
  { range: /[\u0B80-\u0BFF]/, candidates: ['ta'] },        // Tamil
  { range: /[\u0C00-\u0C7F]/, candidates: ['te'] },        // Telugu
  { range: /[\u0C80-\u0CFF]/, candidates: ['kn'] },        // Kannada
  { range: /[\u0D00-\u0D7F]/, candidates: ['ml'] },        // Malayalam
  { range: /[\u0A00-\u0A7F]/, candidates: ['pa'] },        // Gurmukhi (Punjabi)
  { range: /[\u0600-\u06FF]/, candidates: ['ur'] },        // Arabic script (Urdu)
];

// Common Hindi vs Marathi word clues (Devanagari disambiguation)
const MARATHI_MARKERS = ['आहे', 'नाही', 'आहेत', 'सांगा', 'मला', 'तुम्ही', 'करा', 'झाले', 'येथे', 'काय', 'कसे'];
const HINDI_MARKERS   = ['है', 'हैं', 'नहीं', 'मुझे', 'आप', 'करें', 'बताओ', 'चाहिए', 'कहाँ', 'कैसे', 'क्या'];

/**
 * Heuristic language detection from message text.
 * Returns a language code (e.g., 'hi', 'mr', 'en').
 */
function detectLanguage(text) {
  if (!text || text.trim().length === 0) return 'en';

  // Check each script range
  for (const { range, candidates } of SCRIPT_RANGES) {
    if (range.test(text)) {
      if (candidates.length === 1) return candidates[0];

      // Devanagari: disambiguate Hindi vs Marathi
      if (candidates.includes('hi') && candidates.includes('mr')) {
        const lower = text.toLowerCase();
        let marathiScore = 0;
        let hindiScore = 0;
        MARATHI_MARKERS.forEach(w => { if (lower.includes(w)) marathiScore++; });
        HINDI_MARKERS.forEach(w => { if (lower.includes(w)) hindiScore++; });
        return marathiScore >= hindiScore ? 'mr' : 'hi';
      }
      return candidates[0];
    }
  }

  // Default to English for Latin script or undetected
  return 'en';
}

/**
 * Get the language instruction string for the system prompt.
 */
function getLanguageInstruction(langCode) {
  const lang = LANGUAGE_MAP[langCode];
  if (!lang) return 'Respond in English.';
  if (langCode === 'en') return 'Respond in clear, simple English.';
  return `Respond in ${lang.name} (${lang.native}). Use simple, everyday ${lang.name} that ordinary citizens can understand. Avoid overly formal or bureaucratic language.`;
}

/**
 * Resolve the effective language: 'auto' → detected, otherwise use specified.
 */
function resolveLanguage(userMessage, preferredLanguage) {
  if (!preferredLanguage || preferredLanguage === 'auto') {
    return detectLanguage(userMessage);
  }
  if (LANGUAGE_MAP[preferredLanguage]) return preferredLanguage;
  return detectLanguage(userMessage);
}

/**
 * Validate that a language code is supported.
 */
function isSupportedLanguage(code) {
  return code === 'auto' || Boolean(LANGUAGE_MAP[code]);
}

module.exports = {
  LANGUAGE_MAP,
  detectLanguage,
  getLanguageInstruction,
  resolveLanguage,
  isSupportedLanguage,
};
