/**
 * JANSEVA.AI — Gemini Service
 * Wraps the Google Generative AI SDK.
 * Modular: change GEMINI_MODEL in .env to swap models.
 * Voice/STT/TTS will be added as separate services later.
 */

const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');

// ── SYSTEM PROMPT ────────────────────────────────────────────────────────────
const JANSEVA_SYSTEM_PROMPT = `You are JANSEVA.AI — an official AI citizen-service assistant for the Government of India.

CORE DIRECTIVES:
1. **CONCISE & DIRECT**: Keep all answers SHORT, CRISP, and TO THE POINT (ideal for voice playback on hardware speakers and quick reading).
   - Aim for 3-5 clear bullet points or 2-3 short sentences.
   - Avoid long preambles, introductory filler, or unnecessary bureaucratic jargon.
   - Directly state: (1) Key Benefit/Amount, (2) Who is eligible, (3) Official portal/where to apply.

2. **LANGUAGE RULES**:
   - Always detect the user's language and respond naturally in the EXACT SAME language (Hindi, Marathi, English, Gujarati, Bengali, Tamil, Telugu, Kannada, Malayalam, Punjabi, Urdu).
   - If user asks in Marathi (मराठी), reply directly in clean Marathi.
   - If user asks in Hindi (हिंदी), reply directly in clean Hindi.
   - Use simple, everyday citizen-friendly terms.

3. **GOVERNMENT SCHEMES FORMAT (Keep it short!)**:
   📋 **योजना:** [Name]
   🎁 **लाभ:** [₹ Amount / Key benefit in 1 line]
   ✅ **पात्रता:** [Who gets it in 1 line]
   🔗 **आवेदन:** [Portal link or nearest CSC/Jan Seva Kendra]

4. **HONESTY & ACCURACY**:
   - Do not invent schemes or figures. If unsure, advise visiting the official portal or nearest Jan Seva Kendra / CSC.
   - Stick to citizen welfare, agriculture, schemes, documents, certificates, and civic services.`;

// ── SAFETY SETTINGS ──────────────────────────────────────────────────────────
const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT,        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,       threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

// ── GENERATION CONFIG ─────────────────────────────────────────────────────────
const GENERATION_CONFIG = {
  temperature: 0.7,
  topP: 0.9,
  topK: 40,
  maxOutputTokens: 2048,
};

let genAI = null;
let model = null;

/**
 * Initialize the Gemini client. Called once at startup.
 */
function initialize() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY_HERE') {
    throw new Error('GEMINI_API_KEY is not set in .env file');
  }

  if (!apiKey || apiKey.trim().length < 10) {
    throw new Error('GEMINI_API_KEY is invalid or too short in .env file');
  }

  const primaryModel = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
  genAI = new GoogleGenerativeAI(apiKey);

  const candidateModels = [
    primaryModel,
    'gemini-3.5-flash-lite',
    'gemini-flash-latest',
    'gemini-3.1-flash-lite',
    'gemini-3.6-flash'
  ];

  // Remove duplicates
  const uniqueModels = [...new Set(candidateModels)];

  model = genAI.getGenerativeModel({
    model: primaryModel,
    systemInstruction: JANSEVA_SYSTEM_PROMPT,
    safetySettings: SAFETY_SETTINGS,
    generationConfig: GENERATION_CONFIG,
  });

  console.log(`✅ Gemini initialized with primary model: ${primaryModel}`);
}

/**
 * Send a message to Gemini with conversation history and automatic model fallback.
 * @param {string} userMessage — The user's current message
 * @param {Array}  history     — Previous messages in Gemini SDK format
 * @param {string} langInstruction — Language instruction to prepend
 * @returns {string} AI response text
 */
async function sendMessage(userMessage, history = [], langInstruction = '') {
  if (!genAI) {
    throw new Error('Gemini service not initialized. Call initialize() first.');
  }

  const primaryModel = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
  const candidateModels = [
    primaryModel,
    'gemini-3.5-flash-lite',
    'gemini-flash-latest',
    'gemini-3.1-flash-lite',
    'gemini-3.6-flash'
  ];
  const uniqueModels = [...new Set(candidateModels)];

  const fullMessage = langInstruction
    ? `[Language Instruction: ${langInstruction}]\n\n${userMessage}`
    : userMessage;

  let lastError = null;

  for (const mName of uniqueModels) {
    try {
      const activeModel = genAI.getGenerativeModel({
        model: mName,
        systemInstruction: JANSEVA_SYSTEM_PROMPT,
        safetySettings: SAFETY_SETTINGS,
        generationConfig: GENERATION_CONFIG,
      });

      const chat = activeModel.startChat({
        history,
        safetySettings: SAFETY_SETTINGS,
        generationConfig: GENERATION_CONFIG,
      });

      const result = await chat.sendMessage(fullMessage);
      const response = result.response;
      if (response && response.text) {
        return response.text();
      }
    } catch (err) {
      console.warn(`[Gemini] Model ${mName} attempt notice:`, err.message);
      lastError = err;
    }
  }

  throw lastError || new Error('All Gemini candidate models exhausted');
}

/**
 * Process multimodal audio input (e.g. from ESP32 INMP441 recording or voice upload).
 * @param {Buffer} audioBuffer
 * @param {string} mimeType (e.g. 'audio/wav', 'audio/mp3', 'audio/pcm')
 * @returns {string} AI response text
 */
async function processAudioMessage(audioBuffer, mimeType = 'audio/wav') {
  if (!model) {
    throw new Error('Gemini service not initialized. Call initialize() first.');
  }

  const audioPart = {
    inlineData: {
      data: audioBuffer.toString('base64'),
      mimeType,
    },
  };

  const promptText = `Listen to the user's spoken audio carefully. Identify their query and language, then provide a short, helpful, and concise answer in the SAME language as the user's speech. Keep the answer under 60-80 words so it is easy to listen to on a speaker.`;

  const result = await model.generateContent([promptText, audioPart]);
  const response = result.response;

  if (!response) {
    throw new Error('Empty audio response from Gemini API');
  }

  return response.text();
}

/**
 * Transcribe speech from audio buffer to clean text.
 * @param {Buffer} audioBuffer
 * @param {string} mimeType
 * @returns {Promise<string>}
 */
async function transcribeAudio(audioBuffer, mimeType = 'audio/wav') {
  if (!model) {
    throw new Error('Gemini service not initialized. Call initialize() first.');
  }

  const audioPart = {
    inlineData: {
      data: audioBuffer.toString('base64'),
      mimeType,
    },
  };

  const promptText = `Transcribe the spoken speech in this audio recording accurately.
Return ONLY the exact text spoken in the speaker's language (Hindi, Marathi, English, Gujarati, etc.).
Do not add prefixes like "The user said" or quotes or explanations. Just return the clean transcribed words.`;

  const result = await model.generateContent([promptText, audioPart]);
  const response = result.response;
  if (!response) {
    throw new Error('Empty transcription from Gemini API');
  }

  return response.text().trim();
}

/**
 * Simple health check — validates the API key works.
 */
async function healthCheck() {
  if (!model) return { ok: false, error: 'Not initialized' };
  try {
    const result = await model.generateContent('Say "OK" in one word.');
    const text = result.response.text();
    return { ok: true, response: text.trim() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = {
  initialize,
  sendMessage,
  processAudioMessage,
  transcribeAudio,
  healthCheck,
  SYSTEM_PROMPT: JANSEVA_SYSTEM_PROMPT,
};

