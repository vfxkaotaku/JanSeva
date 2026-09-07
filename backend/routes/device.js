/**
 * JANSEVA.AI — Device Routes
 * API endpoints for ESP32 hardware kiosk integration and device management.
 */

const express = require('express');
const router = express.Router();

const deviceService = require('../services/deviceService');
const speechService = require('../services/speechService');
const chatService   = require('../services/chatService');
const languageService = require('../services/languageService');

/**
 * GET /api/device/list
 * List all registered ESP32 devices and their online/offline status.
 */
router.get('/list', (req, res) => {
  const devices = deviceService.listDevices();
  res.json({
    success: true,
    count: devices.length,
    devices,
  });
});

/**
 * POST /api/device/register
 * Register a new device from the web UI.
 */
router.post('/register', (req, res) => {
  const { name, location } = req.body;
  const device = deviceService.registerDevice({ name, location });
  res.status(201).json({
    success: true,
    message: 'Device registered successfully',
    device,
  });
});

/**
 * DELETE /api/device/:id
 * Remove a registered device.
 */
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const deleted = deviceService.deleteDevice(id);
  if (!deleted) {
    return res.status(404).json({ success: false, message: 'Device not found' });
  }
  res.json({ success: true, message: `Device ${id} deleted` });
});

/**
 * POST /api/device/heartbeat
 * ESP32 periodic status ping.
 */
router.post('/heartbeat', (req, res) => {
  const { deviceId, ip, rssi, freeHeap } = req.body;
  if (!deviceId) {
    return res.status(400).json({ success: false, message: 'deviceId is required' });
  }

  const device = deviceService.recordHeartbeat(deviceId, {
    ip: ip || req.ip,
    rssi,
    freeHeap,
  });

  res.json({
    success: true,
    status: 'acknowledged',
    device: {
      id: device.id,
      name: device.name,
      status: device.status,
    },
  });
});

/**
 * Transliterate Devanagari script to clean Latin/ASCII for 128x64 OLED displays.
 */
function devanagariToLatin(str) {
  if (!str) return '';
  if (!/[\u0900-\u097F]/.test(str)) {
    return str.replace(/[^\x20-\x7E]/g, '').trim();
  }

  const vowelMap = {
    'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo',
    'ऋ': 'ri', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au'
  };

  const matraMap = {
    'ा': 'a', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo',
    'ृ': 'ri', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au',
    'ं': 'n', 'ँ': 'n', 'ः': 'h'
  };

  const consonantMap = {
    'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'ng',
    'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'ny',
    'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n',
    'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
    'प': 'p', 'फ': 'f', 'ब': 'b', 'भ': 'bh', 'म': 'm',
    'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v', 'श': 'sh',
    'ष': 'sh', 'स': 's', 'ह': 'h', 'ळ': 'l'
  };

  const numMap = {
    '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
    '५': '5', '६': '6', '७': '7', '८': '8', '९': '9'
  };

  let out = '';
  const len = str.length;
  for (let i = 0; i < len; i++) {
    const ch = str[i];
    if (vowelMap[ch]) {
      out += vowelMap[ch];
    } else if (numMap[ch]) {
      out += numMap[ch];
    } else if (consonantMap[ch]) {
      const cons = consonantMap[ch];
      const next = str[i + 1];
      if (next === '्') {
        out += cons;
        i++;
      } else if (matraMap[next]) {
        out += cons + matraMap[next];
        i++;
      } else {
        const afterNext = str[i + 1];
        if (!afterNext || afterNext === ' ' || afterNext === '\n' || /[.,?!]/.test(afterNext)) {
          out += cons;
        } else {
          out += cons + 'a';
        }
      }
    } else if (matraMap[ch]) {
      out += matraMap[ch];
    } else if (ch >= ' ' && ch <= '~') {
      out += ch;
    }
  }
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * Generate 3-4 concise ASCII lines suitable for 128x64 OLED display.
 */
function generateScreenSummary(reply) {
  if (!reply) return '';
  let clean = reply
    .replace(/[*_#`~[\]()]/g, '')
    .replace(/📋|🎁|✅|🔗|📄|👥|🌾|💳|🏛️|🇮🇳|💡|🚨|⚠️|🔴|🤖/g, '')
    .trim();

  let lines = clean.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  let formatted = [];
  for (let l of lines) {
    if (/योजना|scheme/i.test(l)) {
      let val = l.replace(/^[^:]+:\s*/, '');
      formatted.push('Yoj: ' + (devanagariToLatin(val) || val).slice(0, 16));
    } else if (/लाभ|benefit|amount|रुपये/i.test(l)) {
      let val = l.replace(/^[^:]+:\s*/, '');
      formatted.push('Labh: ' + (devanagariToLatin(val) || val).slice(0, 15));
    } else if (/पात्रता|eligible|who/i.test(l)) {
      let val = l.replace(/^[^:]+:\s*/, '');
      formatted.push('Patra: ' + (devanagariToLatin(val) || val).slice(0, 14));
    } else if (/आवेदन|अर्ज|apply|portal|kendra/i.test(l)) {
      let val = l.replace(/^[^:]+:\s*/, '');
      formatted.push('Apply: ' + (devanagariToLatin(val) || val).slice(0, 14));
    }
  }

  if (formatted.length === 0) {
    formatted = lines.slice(0, 4).map((l, i) => {
      let lat = devanagariToLatin(l) || l;
      return `${i + 1}. ` + lat.slice(0, 17);
    });
  }

  return formatted.slice(0, 4).join('\n');
}

/**
 * POST /api/device/stt
 * Speech-to-Text endpoint for ESP32 conversation flow.
 * Transcribes audio recorded via INMP441 into text.
 */
router.post('/stt', async (req, res, next) => {
  try {
    const deviceId = req.headers['x-device-id'] || req.query.deviceId || 'JANSEVA-ESP32';
    let audioBuffer;
    let mimeType = req.headers['content-type'] || 'audio/wav';

    if (Buffer.isBuffer(req.body)) {
      audioBuffer = req.body;
    } else if (req.body?.audioBase64) {
      audioBuffer = Buffer.from(req.body.audioBase64, 'base64');
      mimeType = req.body.mimeType || 'audio/wav';
    } else {
      return res.status(400).json({ success: false, message: 'No audio data received' });
    }

    deviceService.logActivity(deviceId, `Recording received (${audioBuffer.length} bytes), transcribing...`);

    const text = await speechService.transcribeAudio(audioBuffer, mimeType);
    const displayText = devanagariToLatin(text);
    deviceService.logActivity(deviceId, `Heard: "${text}"`);

    res.json({
      success: true,
      text,
      displayText: displayText || text,
      reply: text,
      deviceId,
    });
  } catch (err) {
    console.error('[STT Error]', err.message);
    next(err);
  }
});

/**
 * POST /api/device/audio
 * Receive voice audio from ESP32 (INMP441 recording) and return direct AI answer.
 * Supports raw audio in body or JSON with base64 audio.
 */
router.post('/audio', async (req, res, next) => {
  try {
    const deviceId = req.headers['x-device-id'] || req.body?.deviceId || 'ESP32_UNKNOWN';
    let audioBuffer;
    let mimeType = 'audio/wav';

    if (Buffer.isBuffer(req.body)) {
      audioBuffer = req.body;
      mimeType = req.headers['content-type'] || 'audio/wav';
    } else if (req.body?.audioBase64) {
      audioBuffer = Buffer.from(req.body.audioBase64, 'base64');
      mimeType = req.body.mimeType || 'audio/wav';
    } else {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_AUDIO', message: 'No audio data provided in request body' },
      });
    }

    deviceService.logActivity(deviceId, `Received ${audioBuffer.length} bytes of audio for processing`);

    // Process audio with Gemini Multimodal
    const result = await speechService.processVoiceQuery(audioBuffer, mimeType);
    deviceService.logActivity(deviceId, `Generated answer in [${result.language}]: ${result.reply.slice(0, 60)}...`);

    // If client requested audio back (e.g. ?format=audio or header)
    if (req.query.format === 'audio') {
      const ttsBuffer = await speechService.generateTTS(result.reply, result.language);
      res.set('Content-Type', 'audio/mpeg');
      res.set('X-Reply-Text', encodeURIComponent(result.reply.slice(0, 200)));
      res.set('X-Language', result.language);
      return res.send(ttsBuffer);
    }

    const screenSummary = generateScreenSummary(result.reply);

    // Default: return JSON response with text, screen summary, and TTS URL
    res.json({
      success: true,
      deviceId,
      reply: result.reply,
      screenSummary,
      text: result.reply,
      language: result.language,
      ttsUrl: `/api/device/tts?text=${encodeURIComponent(result.reply.slice(0, 250))}&lang=${result.language}`,
      timestamp: new Date().toISOString(),
    });

  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/device/text
 * Direct query from ESP32 Smart Kiosk or terminal test.
 */
router.post('/text', async (req, res, next) => {
  try {
    const { deviceId = 'ESP32_NODE', message, language = 'auto', userName, userPhone, location } = req.body;
    if (!message) {
      return res.status(400).json({ success: false, message: 'message is required' });
    }

    const citizenTag = userName ? ` [${userName}${userPhone ? ' | 📱' + userPhone : ''}]` : '';
    deviceService.logActivity(deviceId, `👤 Citizen${citizenTag}: "${message.slice(0, 60)}"`);

    const result = await chatService.processMessage({ message, language });
    const screenSummary = generateScreenSummary(result.reply);

    deviceService.logActivity(deviceId, `🤖 JanSeva AI: "${result.reply.slice(0, 60)}..."`);

    res.json({
      success: true,
      deviceId,
      reply: result.reply,
      screenSummary,
      language: result.language,
      ttsUrl: `/api/device/tts?text=${encodeURIComponent(result.reply.slice(0, 250))}&lang=${result.language}`,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * ALL /api/device/tts
 * Generate and stream TTS audio for hardware speaker (PAM8403) and web preview.
 * Supports:
 *   - format=pcm: 16kHz 8-bit unsigned PCM for ESP32 internal DAC (default for POST)
 *   - format=mp3: standard audio/mpeg for web browser playback
 */
router.all('/tts', async (req, res, next) => {
  try {
    const text = req.query.text || req.body?.text;
    const lang = req.query.lang || req.body?.lang || 'hi';
    const format = req.query.format || req.body?.format || (req.method === 'POST' ? 'pcm' : 'mp3');
    const rate = req.query.rate || req.body?.rate || '+15%';

    if (!text) {
      return res.status(400).json({ success: false, message: 'text parameter is required' });
    }

    if (format === 'pcm' || format === 'raw') {
      const pcmBuffer = await speechService.generateTTSPCM(text, lang, rate);
      res.set({
        'Content-Type': 'application/octet-stream',
        'Content-Length': pcmBuffer.length,
        'X-Audio-Format': 'pcm-u8-16000',
      });
      return res.send(pcmBuffer);
    }

    const audioBuffer = await speechService.generateTTS(text, lang, rate);
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.length,
      'Cache-Control': 'public, max-age=3600',
    });
    res.send(audioBuffer);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
