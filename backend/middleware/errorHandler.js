/**
 * JANSEVA.AI — Error Handler Middleware
 * Converts technical errors into citizen-friendly responses.
 */

const { getFriendlyErrorMessage } = require('../services/chatService');

/**
 * Map Gemini API error messages to friendly codes.
 */
function classifyGeminiError(error) {
  const msg = (error.message || '').toLowerCase();

  if (msg.includes('api key') || msg.includes('api_key') || msg.includes('invalid key')) {
    return { code: 'INVALID_API_KEY', status: 503 };
  }
  if (msg.includes('quota') || msg.includes('rate limit') || msg.includes('resource exhausted')) {
    return { code: 'RATE_LIMIT', status: 429 };
  }
  if (msg.includes('timeout') || msg.includes('deadline')) {
    return { code: 'GEMINI_ERROR', status: 504 };
  }
  if (msg.includes('safety') || msg.includes('blocked')) {
    return { code: 'CONTENT_BLOCKED', status: 422 };
  }
  return { code: 'GEMINI_ERROR', status: 502 };
}

/**
 * Global Express error handler.
 */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const language = req.body?.language || 'en';
  const isDev = process.env.NODE_ENV === 'development';

  let statusCode = err.statusCode || 500;
  let errorCode  = err.code || 'SERVER_ERROR';

  // Classify Gemini errors
  if (err.message && (err.message.includes('API') || err.message.includes('Gemini'))) {
    const classified = classifyGeminiError(err);
    statusCode = classified.status;
    errorCode  = classified.code;
  }

  const friendlyMessage = getFriendlyErrorMessage(errorCode, language);

  console.error(`[${new Date().toISOString()}] ERROR [${errorCode}]: ${err.message}`);
  if (isDev && err.stack) console.error(err.stack);

  res.status(statusCode).json({
    success: false,
    error: {
      code: errorCode,
      message: friendlyMessage,
      ...(isDev && { technical: err.message }),
    },
    timestamp: new Date().toISOString(),
  });
}

/**
 * 404 handler.
 */
function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Endpoint ${req.method} ${req.path} not found`,
    },
  });
}

module.exports = { errorHandler, notFoundHandler };
