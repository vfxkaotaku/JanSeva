# JANSEVA.AI 🇮🇳
### AI-Powered Multilingual Citizen Service Assistant

JANSEVA.AI is a professional government citizen-service platform powered by **Google Gemini**. Citizens can ask questions about government schemes and services in their native language — Hindi, Marathi, English, Gujarati, Bengali, Tamil, Telugu, Kannada, Malayalam, Punjabi, or Urdu — and get natural, helpful responses.

---

## ✨ Features (Step 1)

- 🤖 **Google Gemini AI** — Powered by `gemini-1.5-flash` (configurable)
- 🌐 **Automatic Language Detection** — Detects Hindi, Marathi, Gujarati, Bengali, Tamil, Telugu, Kannada, Malayalam, Punjabi, Urdu, English from Unicode script
- 💬 **Conversation Memory** — Full multi-turn context per session
- 🎨 **Premium Government UI** — Navy/Saffron/Green palette, glassmorphism, animations
- 📱 **Responsive** — Desktop sidebar + mobile collapsible layout
- 🔒 **Secure** — API key stays on backend, never exposed to frontend
- ⚡ **Modular Architecture** — Ready for voice, ESP32, MQTT, RAG additions

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** v18 or later
- **Google Gemini API Key** — [Get it free from Google AI Studio](https://aistudio.google.com/app/apikey)

### 1. Install Dependencies

```bash
cd janseva-ai
npm install
```

### 2. Configure Environment

```bash
copy .env.example .env
```

Open `.env` and set your API key:

```env
GEMINI_API_KEY=AIza...your_key_here...
```

### 3. Start the Server

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

### 4. Open in Browser

```
http://localhost:3000
```

---

## 📁 Project Structure

```
janseva-ai/
│
├── backend/
│   ├── server.js                    # Express app entry point
│   ├── routes/
│   │   └── chat.js                  # API routes
│   ├── services/
│   │   ├── geminiService.js         # Google Gemini SDK wrapper + system prompt
│   │   ├── chatService.js           # Chat pipeline orchestrator
│   │   ├── languageService.js       # Multilingual detection & mapping
│   │   └── conversationService.js  # In-memory session management
│   └── middleware/
│       └── errorHandler.js          # Citizen-friendly error responses
│
├── frontend/
│   ├── index.html                   # Complete SPA
│   ├── styles/
│   │   └── main.css                 # Design system + components
│   └── services/
│       ├── api.js                   # Backend API client
│       └── storage.js               # LocalStorage persistence
│
├── .env                             # Your secrets (not committed)
├── .env.example                     # Template
├── package.json
└── README.md
```

---

## 🌐 API Reference

### `POST /api/chat`
Send a message to the AI.

**Request:**
```json
{
  "message": "मुझे किसानों के लिए सरकारी योजना बताओ",
  "language": "auto",
  "conversationId": "uuid-or-null"
}
```

**Response:**
```json
{
  "success": true,
  "reply": "किसानों के लिए कई सरकारी योजनाएं हैं...",
  "language": "hi",
  "conversationId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### `GET /api/health`
Check API and Gemini status.

### `POST /api/conversation/new`
Create a new conversation session.

### `DELETE /api/conversation/:id`
Delete a conversation.

### `POST /api/conversation/:id/clear`
Clear messages in a conversation.

### `PATCH /api/conversation/:id/language`
Set language preference for a conversation.

---

## 🔧 Configuration (`.env`)

| Variable | Default | Description |
|---|---|---|
| `GEMINI_API_KEY` | — | **Required.** Your Google Gemini API key |
| `GEMINI_MODEL` | `gemini-1.5-flash` | Gemini model to use |
| `PORT` | `3000` | Server port |
| `NODE_ENV` | `development` | Environment |
| `FRONTEND_URL` | `http://localhost:5500` | Allowed CORS origin |
| `RATE_LIMIT_MAX` | `100` | Requests per 15 minutes per IP |
| `MAX_CONVERSATION_HISTORY` | `50` | Max messages per conversation |

---

## 🌍 Supported Languages

| Code | Language | Script |
|---|---|---|
| `hi` | Hindi | Devanagari |
| `mr` | Marathi | Devanagari |
| `en` | English | Latin |
| `gu` | Gujarati | Gujarati |
| `bn` | Bengali | Bengali |
| `ta` | Tamil | Tamil |
| `te` | Telugu | Telugu |
| `kn` | Kannada | Kannada |
| `ml` | Malayalam | Malayalam |
| `pa` | Punjabi | Gurmukhi |
| `ur` | Urdu | Arabic |

Language detection uses Unicode script range analysis with Hindi/Marathi disambiguation via vocabulary markers.

---

## 🏗️ Architecture (Voice-Ready)

```
User Browser
    │
    ▼
Frontend (HTML/CSS/JS)
    │  POST /api/chat
    ▼
Express Server (backend/server.js)
    │
    ├─► chatService.js ──► languageService.js
    │        │
    │        ▼
    │   conversationService.js (session store)
    │        │
    │        ▼
    │   geminiService.js ──► Google Gemini API
    │
    └─► errorHandler.js (friendly citizen errors)

Future additions (same architecture):
    ├─► speechService.js (STT/TTS)
    ├─► mqttService.js (ESP32 devices)
    └─► ragService.js (Government scheme database)
```

---

## 🔮 Coming Next (Step 2+)

- 📚 Government Scheme RAG Database
- 🗣️ Voice Input/Output (Speech-to-Text, Text-to-Speech)
- 📟 ESP32 Hardware Integration
- 🖨️ Thermal Printer Support
- 📊 Analytics Dashboard
- 🏛️ Multi-district Device Management

---

## 📄 License

MIT © VKO Studios
