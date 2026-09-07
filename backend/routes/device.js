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
    deviceService.logActivity(deviceId, `Heard: "${text}"`);

    res.json({
      success: true,
      text,
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

    // Default: return JSON response with text and TTS URL
    res.json({
      success: true,
      deviceId,
      reply: result.reply,
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
 * Direct text query from ESP32 or terminal test.
 */
router.post('/text', async (req, res, next) => {
  try {
    const { deviceId = 'ESP32_NODE', message, language = 'auto' } = req.body;
    if (!message) {
      return res.status(400).json({ success: false, message: 'message is required' });
    }

    deviceService.logActivity(deviceId, `Text query: "${message.slice(0, 40)}"`);

    const result = await chatService.processMessage({ message, language });
    deviceService.logActivity(deviceId, `Reply: "${result.reply.slice(0, 40)}..."`);

    res.json({
      success: true,
      deviceId,
      reply: result.reply,
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
