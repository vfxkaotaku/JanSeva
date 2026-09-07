/**
 * ============================================================================
 * 🇮🇳 JANSEVA.AI — ESP32 Smart Citizen Kiosk Firmware
 * ============================================================================
 * 
 * Hardware Connections:
 * 
 * 1. PAM8403 Audio Amplifier + Speaker:
 *    - PAM8403 VCC     -> ESP32 VIN / 5V
 *    - PAM8403 GND     -> ESP32 GND
 *    - PAM8403 Audio IN-> ESP32 GPIO 25 (Internal DAC1 / Audio Output)
 *    - PAM8403 OUT+    -> Speaker (+)
 *    - PAM8403 OUT-    -> Speaker (-)
 * 
 * 2. 0.96" OLED Display (SSD1306 128x64 I2C):
 *    - OLED VCC        -> ESP32 3.3V
 *    - OLED GND        -> ESP32 GND
 *    - OLED SCL        -> ESP32 GPIO 22
 *    - OLED SDA        -> ESP32 GPIO 21
 * 
 * 3. TTP223 Capacitive Touch Sensor:
 *    - TTP223 VCC      -> ESP32 3.3V
 *    - TTP223 GND      -> ESP32 GND
 *    - TTP223 SIG      -> ESP32 GPIO 33 (Push-to-Talk / Hold 5s for WiFi reset)
 * 
 * 4. INMP441 I2S Digital Microphone:
 *    - INMP441 VDD     -> ESP32 3.3V
 *    - INMP441 GND     -> ESP32 GND
 *    - INMP441 SD      -> ESP32 GPIO 32 (I2S Data In)
 *    - INMP441 WS      -> ESP32 GPIO 15 (I2S Word Select / L/R Clock)
 *    - INMP441 SCK     -> ESP32 GPIO 14 (I2S Serial Clock / BCLK)
 *    - INMP441 L/R     -> ESP32 GND    (Left Channel)
 * 
 * Required Arduino Libraries (Install via Library Manager):
 * - Adafruit SSD1306 & Adafruit GFX Library
 * - ArduinoJson (v6 or v7)
 * ============================================================================
 */

#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Preferences.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <driver/i2s.h>
#include <driver/dac.h>
#include <ArduinoJson.h>

// ── PIN DEFINITIONS ─────────────────────────────────────────────────────────
#define PIN_OLED_SDA      21
#define PIN_OLED_SCL      22
#define PIN_TOUCH_SIG     33
#define PIN_MIC_I2S_SD    32
#define PIN_MIC_I2S_WS    15
#define PIN_MIC_I2S_SCK   14
#define PIN_AUDIO_DAC_OUT 25 // PAM8403 Audio IN

// ── OLED CONFIG ─────────────────────────────────────────────────────────────
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// ── AUDIO & RECORDING CONFIG ────────────────────────────────────────────────
#define I2S_PORT_MIC      I2S_NUM_0
#define SAMPLE_RATE       16000
#define BITS_PER_SAMPLE   16
#define MAX_RECORD_SECS   6
#define BUFFER_SIZE       (SAMPLE_RATE * 2 * MAX_RECORD_SECS) // ~192 KB RAM

uint8_t* audioBuffer = nullptr;
size_t recordedBytes = 0;

// ── PREFERENCES & CONFIG ────────────────────────────────────────────────────
Preferences prefs;
String wifi_ssid     = "";
String wifi_password = "";
String server_url    = "http://192.168.1.100:3000";
String device_id     = "JANSEVA-ESP32";

// ── CAPTIVE PORTAL CONFIG ───────────────────────────────────────────────────
const char* AP_SSID = "JANSEVA_SETUP_AP";
const byte DNS_PORT = 53;
DNSServer dnsServer;
WebServer server(80);
bool inConfigPortal = false;

// ── STATE ───────────────────────────────────────────────────────────────────
unsigned long lastHeartbeat = 0;
const unsigned long HEARTBEAT_INTERVAL = 30000; // 30s

// ── FORWARD DECLARATIONS ────────────────────────────────────────────────────
void showOLED(const String& line1, const String& line2 = "", const String& line3 = "", const String& line4 = "");
void startCaptivePortal();
void handleRoot();
void handleSave();
void initI2SMicrophone();
void recordVoice();
void sendAudioToServer();
void playDACAudio(const uint8_t* data, size_t len);
void sendHeartbeat();

// ── SETUP ───────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n\n==========================================");
  Serial.println("🇮🇳 JANSEVA.AI — ESP32 Smart Kiosk Node");
  Serial.println("==========================================");

  // Initialize GPIOs
  pinMode(PIN_TOUCH_SIG, INPUT);
  dac_output_enable(DAC_CHANNEL_1); // GPIO 25

  // Initialize I2C OLED
  Wire.begin(PIN_OLED_SDA, PIN_OLED_SCL);
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("⚠️ OLED display not found on 0x3C");
  } else {
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    showOLED("JANSEVA.AI", "Citizen Assistant", "Initializing...", "Please wait");
  }

  // Load preferences from flash
  prefs.begin("janseva", false);
  wifi_ssid     = prefs.getString("ssid", "");
  wifi_password = prefs.getString("pass", "");
  server_url    = prefs.getString("server", "http://192.168.1.100:3000");
  device_id     = prefs.getString("devid", "JANSEVA-ESP32");

  // Allocate audio recording buffer
  audioBuffer = (uint8_t*) ps_malloc(BUFFER_SIZE);
  if (!audioBuffer) {
    audioBuffer = (uint8_t*) malloc(BUFFER_SIZE);
  }
  if (!audioBuffer) {
    Serial.println("⚠️ Could not allocate full audio buffer, using 3s buffer");
    audioBuffer = (uint8_t*) malloc(SAMPLE_RATE * 2 * 3);
  }

  // Initialize I2S INMP441 Microphone
  initI2SMicrophone();

  // Check if touch button is held on startup (forces Captive Portal)
  if (digitalRead(PIN_TOUCH_SIG) == HIGH || wifi_ssid == "") {
    Serial.println("Starting WiFi Configuration Portal...");
    startCaptivePortal();
    return;
  }

  // Connect to Home/Office WiFi
  showOLED("Connecting WiFi...", wifi_ssid, "Server:", server_url);
  WiFi.mode(WIFI_STA);
  WiFi.begin(wifi_ssid.c_str(), wifi_password.c_str());

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 25) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅ WiFi Connected! IP: " + WiFi.localIP().toString());
    showOLED("JANSEVA.AI Ready", "IP: " + WiFi.localIP().toString(), "Touch to Speak [🎙️]", "Hold 5s to Reset");
    sendHeartbeat();
  } else {
    Serial.println("\n❌ WiFi Connection Failed. Starting Setup Portal.");
    startCaptivePortal();
  }
}

// ── MAIN LOOP ───────────────────────────────────────────────────────────────
void loop() {
  if (inConfigPortal) {
    dnsServer.processNextRequest();
    server.handleClient();
    return;
  }

  // Check for Touch Trigger (TTP223 SIG)
  if (digitalRead(PIN_TOUCH_SIG) == HIGH) {
    unsigned long touchStart = millis();
    showOLED("Listening... [🔴]", "Speak your question", "Keep touching...", "");

    // Check for long press (5 seconds) -> Reset WiFi
    while (digitalRead(PIN_TOUCH_SIG) == HIGH) {
      if (millis() - touchStart > 5000) {
        showOLED("RESETTING WIFI...", "Release touch", "Opening portal", "");
        while (digitalRead(PIN_TOUCH_SIG) == HIGH) delay(50);
        prefs.clear();
        startCaptivePortal();
        return;
      }
      delay(50);
    }

    // Short touch -> Record Voice Query
    recordVoice();
    sendAudioToServer();

    showOLED("JANSEVA.AI Ready", "Touch to Speak [🎙️]", "Server: Online", "");
  }

  // Periodic Heartbeat
  if (millis() - lastHeartbeat > HEARTBEAT_INTERVAL && WiFi.status() == WL_CONNECTED) {
    lastHeartbeat = millis();
    sendHeartbeat();
  }
}

// ── OLED HELPER ─────────────────────────────────────────────────────────────
void showOLED(const String& line1, const String& line2, const String& line3, const String& line4) {
  display.clearDisplay();
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println(line1);
  display.drawLine(0, 11, 127, 11, SSD1306_WHITE);
  display.setCursor(0, 16);
  display.println(line2);
  display.setCursor(0, 32);
  display.println(line3);
  display.setCursor(0, 48);
  display.println(line4);
  display.display();
}

// ── I2S MICROPHONE INIT (INMP441) ───────────────────────────────────────────
void initI2SMicrophone() {
  i2s_config_t i2s_config = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate = SAMPLE_RATE,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
    .communication_format = I2S_COMM_FORMAT_STAND_I2S,
    .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count = 4,
    .dma_buf_len = 512,
    .use_apll = false,
    .tx_desc_auto_clear = false,
    .fixed_mclk = 0
  };

  i2s_pin_config_t pin_config = {
    .bck_io_num = PIN_MIC_I2S_SCK,
    .ws_io_num = PIN_MIC_I2S_WS,
    .data_out_num = I2S_PIN_NO_CHANGE,
    .data_in_num = PIN_MIC_I2S_SD
  };

  i2s_driver_install(I2S_PORT_MIC, &i2s_config, 0, NULL);
  i2s_set_pin(I2S_PORT_MIC, &pin_config);
  i2s_zero_dma_buffer(I2S_PORT_MIC);
}

// ── RECORD VOICE FROM INMP441 ───────────────────────────────────────────────
void recordVoice() {
  if (!audioBuffer) return;
  recordedBytes = 0;
  size_t bytesRead = 0;
  unsigned long start = millis();

  showOLED("Recording Audio...", "Listening...", "Max 5 seconds", "");

  // Record for up to 5 seconds
  while (recordedBytes < (BUFFER_SIZE - 44) && (millis() - start < 5000)) {
    uint8_t tempBuf[512];
    i2s_read(I2S_PORT_MIC, tempBuf, sizeof(tempBuf), &bytesRead, portMAX_DELAY);
    if (bytesRead > 0) {
      memcpy(audioBuffer + 44 + recordedBytes, tempBuf, bytesRead);
      recordedBytes += bytesRead;
    }
  }

  // Generate 44-byte WAV header at the beginning of audioBuffer
  uint32_t sampleRate = SAMPLE_RATE;
  uint16_t numChannels = 1;
  uint16_t bitsPerSample = 16;
  uint32_t byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  uint32_t dataSize = recordedBytes;
  uint32_t chunkSize = 36 + dataSize;

  // RIFF Chunk
  memcpy(audioBuffer, "RIFF", 4);
  memcpy(audioBuffer + 4, &chunkSize, 4);
  memcpy(audioBuffer + 8, "WAVE", 4);

  // fmt subchunk
  memcpy(audioBuffer + 12, "fmt ", 4);
  uint32_t subchunk1Size = 16;
  uint16_t audioFormat = 1; // PCM
  memcpy(audioBuffer + 16, &subchunk1Size, 4);
  memcpy(audioBuffer + 20, &audioFormat, 2);
  memcpy(audioBuffer + 22, &numChannels, 2);
  memcpy(audioBuffer + 24, &sampleRate, 4);
  memcpy(audioBuffer + 28, &byteRate, 4);
  uint16_t blockAlign = numChannels * (bitsPerSample / 8);
  memcpy(audioBuffer + 32, &blockAlign, 2);
  memcpy(audioBuffer + 34, &bitsPerSample, 2);

  // data subchunk
  memcpy(audioBuffer + 36, "data", 4);
  memcpy(audioBuffer + 40, &dataSize, 4);

  recordedBytes += 44; // Total WAV size
  Serial.printf("Recorded %d bytes of WAV audio\n", recordedBytes);
}

// ── SEND AUDIO TO JANSEVA SERVER ────────────────────────────────────────────
void sendAudioToServer() {
  if (WiFi.status() != WL_CONNECTED || recordedBytes <= 44) {
    showOLED("Error", "WiFi Disconnected", "or Empty Audio", "");
    delay(2000);
    return;
  }

  showOLED("Contacting AI...", "Analyzing voice", "Please wait...", "");

  HTTPClient http;
  String endpoint = server_url + "/api/device/audio?format=audio";
  http.begin(endpoint);
  http.addHeader("Content-Type", "audio/wav");
  http.addHeader("x-device-id", device_id);
  http.setTimeout(25000); // 25s timeout for AI generation

  int httpCode = http.POST(audioBuffer, recordedBytes);
  Serial.printf("Server response code: %d\n", httpCode);

  if (httpCode == HTTP_CODE_OK) {
    String replyText = http.header("X-Reply-Text");
    if (replyText.length() == 0) replyText = "Playing Voice Answer";

    showOLED("JANSEVA AI Answer", "Speaking on speaker...", replyText.substring(0, 40), "");

    // Stream received audio to PAM8403 Speaker via DAC (GPIO 25)
    WiFiClient* stream = http.getStreamPtr();
    size_t size = http.getSize();
    uint8_t pcmBuf[256];

    while (http.connected() && (size > 0 || size == -1)) {
      size_t availableBytes = stream->available();
      if (availableBytes > 0) {
        int readBytes = stream->readBytes(pcmBuf, min(availableBytes, sizeof(pcmBuf)));
        if (readBytes > 0) {
          playDACAudio(pcmBuf, readBytes);
          if (size > 0) size -= readBytes;
        }
      }
      delay(1);
    }
  } else {
    String err = http.getString();
    Serial.println("Server error: " + err);
    showOLED("Error from Server", "Code: " + String(httpCode), "Check PC / Server", "");
    delay(2500);
  }

  http.end();
}

// ── PLAY AUDIO THROUGH DAC (GPIO 25) TO PAM8403 ─────────────────────────────
void playDACAudio(const uint8_t* data, size_t len) {
  for (size_t i = 0; i < len; i++) {
    // 8-bit DAC output on GPIO 25
    dacWrite(DAC_CHANNEL_1, data[i]);
    delayMicroseconds(60); // ~16kHz sample rate timing
  }
}

// ── SEND PERIODIC HEARTBEAT ─────────────────────────────────────────────────
void sendHeartbeat() {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  http.begin(server_url + "/api/device/heartbeat");
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<200> doc;
  doc["deviceId"] = device_id;
  doc["ip"] = WiFi.localIP().toString();
  doc["rssi"] = WiFi.RSSI();
  doc["freeHeap"] = ESP.getFreeHeap();

  String payload;
  serializeJson(doc, payload);
  http.POST(payload);
  http.end();
}

// ── CAPTIVE PORTAL (WIFI SETUP AT 192.168.4.1) ──────────────────────────────
void startCaptivePortal() {
  inConfigPortal = true;
  WiFi.mode(WIFI_AP);
  WiFi.softAP(AP_SSID);
  delay(200);

  IPAddress apIP = WiFi.softAPIP();
  dnsServer.start(DNS_PORT, "*", apIP);

  Serial.println("\n-------------------------------------------");
  Serial.printf("📡 Captive Portal Started! AP: %s\n", AP_SSID);
  Serial.printf("🌐 Connect your phone & open: http://%s\n", apIP.toString().c_str());
  Serial.println("-------------------------------------------");

  showOLED("WiFi Setup Mode", "1. Connect WiFi:", AP_SSID, "2. Go to: 192.168.4.1");

  server.on("/", handleRoot);
  server.on("/save", HTTP_POST, handleSave);
  server.onNotFound(handleRoot); // Captive portal redirect
  server.begin();
}

void handleRoot() {
  String html = "<!DOCTYPE html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>"
    "<title>JANSEVA.AI Device Setup</title>"
    "<style>"
    "body{font-family:Arial,sans-serif;background:#0B1F3A;color:#fff;margin:0;padding:20px;}"
    ".card{background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);padding:24px;border-radius:12px;max-width:400px;margin:auto;}"
    "h2{color:#FF9933;margin-top:0;font-size:22px;}"
    "label{display:block;margin-top:14px;font-size:13px;color:#cbd5e1;}"
    "input{width:100%;box-sizing:border-box;padding:12px;margin-top:6px;border-radius:6px;border:1px solid rgba(255,255,255,0.2);background:#071322;color:#fff;font-size:15px;}"
    "button{width:100%;padding:14px;margin-top:22px;background:#FF9933;border:none;border-radius:6px;color:#0B1F3A;font-weight:bold;font-size:16px;cursor:pointer;}"
    ".badge{background:#138808;padding:4px 8px;border-radius:4px;font-size:11px;font-weight:bold;}"
    "</style></head><body>"
    "<div class='card'>"
    "<h2>🇮🇳 JANSEVA.AI Kiosk <span class='badge'>Setup</span></h2>"
    "<p style='font-size:13px;color:#94a3b8;'>Configure home WiFi and backend server address.</p>"
    "<form method='POST' action='/save'>"
    "<label>Home/Office WiFi SSID:</label><input name='ssid' value='" + wifi_ssid + "' placeholder='WiFi Name' required>"
    "<label>WiFi Password:</label><input name='pass' type='password' value='" + wifi_password + "' placeholder='WiFi Password'>"
    "<label>JANSEVA Server URL:</label><input name='server' value='" + server_url + "' placeholder='http://192.168.1.100:3000' required>"
    "<label>Device ID / Name:</label><input name='devid' value='" + device_id + "' placeholder='JANSEVA-ESP32-1' required>"
    "<button type='submit'>💾 Save & Connect</button>"
    "</form></div></body></html>";

  server.send(200, "text/html", html);
}

void handleSave() {
  wifi_ssid     = server.arg("ssid");
  wifi_password = server.arg("pass");
  server_url    = server.arg("server");
  device_id     = server.arg("devid");

  prefs.putString("ssid", wifi_ssid);
  prefs.putString("pass", wifi_password);
  prefs.putString("server", server_url);
  prefs.putString("devid", device_id);

  String html = "<!DOCTYPE html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>"
    "<style>body{font-family:Arial;background:#0B1F3A;color:#fff;text-align:center;padding:40px;}</style></head>"
    "<body><h2>✅ Settings Saved!</h2><p>Connecting to WiFi: <b>" + wifi_ssid + "</b>...</p>"
    "<p>ESP32 is restarting now.</p></body></html>";

  server.send(200, "text/html", html);
  delay(1500);
  ESP.restart();
}
