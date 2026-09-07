/**
 * JANSEVA.AI — Speech & Audio Service
 * Handles Speech-to-Text (STT) via Gemini Multimodal & Text-to-Speech (TTS) for ESP32 and Web.
 */

const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
const { MPEGDecoder } = require('mpg123-decoder');
const geminiService = require('./geminiService');
const languageService = require('./languageService');

// State-of-the-art Azure Neural human voices for natural regional speech
const NEURAL_VOICE_MAP = {
  hi: 'hi-IN-SwaraNeural',              // Warm, natural, polite female Hindi voice
  mr: 'mr-IN-AarohiNeural',             // Authentic, expressive Marathi voice
  en: 'en-IN-NeerjaExpressiveNeural',    // Natural Indian-accented English
  gu: 'gu-IN-DhwaniNeural',             // Natural Gujarati voice
  bn: 'bn-IN-TanishaaNeural',           // Natural Bengali voice
  ta: 'ta-IN-PallaviNeural',            // Natural Tamil voice
  te: 'te-IN-ShrutiNeural',             // Natural Telugu voice
  kn: 'kn-IN-SapnaNeural',              // Natural Kannada voice
  ml: 'ml-IN-SobhanaNeural',            // Natural Malayalam voice
  ur: 'ur-IN-GulNeural',                // Natural Urdu voice
  pa: 'hi-IN-SwaraNeural',              // Punjabi fallback
};

// Fallback legacy language codes
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
 * Transcribe speech to text using Gemini multimodal audio model.
 * @param {Buffer} audioBuffer
 * @param {string} mimeType
 * @returns {Promise<string>}
 */
async function transcribeAudio(audioBuffer, mimeType = 'audio/wav') {
  if (!audioBuffer || audioBuffer.length === 0) {
    throw new Error('Empty audio buffer received');
  }
  return await geminiService.transcribeAudio(audioBuffer, mimeType);
}

/**
 * Synthesize ultra-natural human speech using Microsoft Azure Neural TTS.
 * @param {string} cleanText
 * @param {string} langCode
 * @param {string} rate - Prosody rate (default '+15%' for lively, natural conversational pace)
 * @returns {Promise<Buffer>}
 */
async function synthesizeNeuralTTS(cleanText, langCode = 'hi', rate = '+15%') {
  const voice = NEURAL_VOICE_MAP[langCode] || NEURAL_VOICE_MAP['hi'];
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const { audioStream } = tts.toStream(cleanText, { rate });

  const chunks = [];
  return new Promise((resolve, reject) => {
    audioStream.on('data', chunk => chunks.push(chunk));
    audioStream.on('end', () => {
      tts.close();
      resolve(Buffer.concat(chunks));
    });
    audioStream.on('error', err => {
      try { tts.close(); } catch (e) {}
      reject(err);
    });
  });
}

/**
 * Fallback TTS in case edge-tts is unavailable or blocked.
 * @param {string} cleanText
 * @param {string} langCode
 * @returns {Promise<Buffer>}
 */
async function synthesizeFallbackTTS(cleanText, langCode = 'hi') {
  const ttsLang = TTS_LANG_MAP[langCode] || 'hi';
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(cleanText)}&tl=${ttsLang}&client=tw-ob`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://translate.google.com/',
    },
  });

  if (!response.ok) {
    throw new Error(`Fallback TTS failed with status: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Generate natural TTS audio stream for a given text and language.
 * Returns an audio/mpeg Buffer playable by browsers and hardware decoders.
 * @param {string} text
 * @param {string} langCode
 * @param {string} rate - Speed rate (e.g. '+15%', '+20%')
 * @returns {Promise<Buffer>}
 */
async function generateTTS(text, langCode = 'hi', rate = '+15%') {
  if (!text || text.trim().length === 0) {
    throw new Error('Text is required for TTS');
  }

  // Clean markdown symbols, asterisks, bullet points, and emojis from text before speaking
  const cleanText = text
    .replace(/[*_#`~[\]()]/g, '')
    .replace(/📋|🎁|✅|🔗|📄|👥|🌾|💳|🏛️|🇮🇳|💡|🚨|⚠️|🔴|🤖/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 320); // 320 char snippet for fast, natural delivery

  try {
    return await synthesizeNeuralTTS(cleanText, langCode, rate);
  } catch (err) {
    console.warn('[TTS] Neural voice error, falling back to legacy TTS:', err.message);
    return await synthesizeFallbackTTS(cleanText, langCode);
  }
}

/**
 * Generate 8-bit unsigned PCM audio at 16kHz for ESP32 internal DAC (GPIO 25 -> PAM8403).
 * Uses mpg123-decoder with linear interpolation resampling for crystal-clear output.
 * @param {string} text
 * @param {string} langCode
 * @param {string} rate - Speed rate (default '+15%')
 * @returns {Promise<Buffer>}
 */
async function generateTTSPCM(text, langCode = 'hi', rate = '+15%') {
  const mp3Buffer = await generateTTS(text, langCode, rate);
  const decoder = new MPEGDecoder();
  await decoder.ready;
  const { channelData, samplesDecoded, sampleRate } = decoder.decode(new Uint8Array(mp3Buffer));
  decoder.free();

  if (!channelData || channelData.length === 0 || samplesDecoded === 0) {
    throw new Error('Failed to decode MP3 stream');
  }

  const targetRate = 16000;
  const numOutputSamples = Math.floor((samplesDecoded * targetRate) / sampleRate);
  const pcmBuf = Buffer.alloc(numOutputSamples);
  const ch0 = channelData[0];
  const ch1 = channelData[1] || ch0;

  for (let i = 0; i < numOutputSamples; i++) {
    const srcIndex = i * (sampleRate / targetRate);
    const idx = Math.floor(srcIndex);
    const frac = srcIndex - idx;
    const s0 = (ch0[idx] + ch1[idx]) * 0.5;
    const s1 = idx + 1 < samplesDecoded ? (ch0[idx + 1] + ch1[idx + 1]) * 0.5 : s0;
    const sample = s0 + frac * (s1 - s0);
    const clamped = Math.max(-1.0, Math.min(1.0, sample));
    // Map Float32 (-1.0 to 1.0) to 8-bit unsigned integer (0 to 255) for ESP32 DAC
    pcmBuf[i] = Math.max(0, Math.min(255, Math.floor((clamped + 1.0) * 127.5)));
  }

  return pcmBuf;
}

module.exports = {
  processVoiceQuery,
  transcribeAudio,
  generateTTS,
  generateTTSPCM,
  NEURAL_VOICE_MAP,
  TTS_LANG_MAP,
};

