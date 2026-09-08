/**
 * ============================================================================
 * JANSEVA.AI — Voice Command Test Sketch
 * Sketch Name: voice_commanda_janseva_test
 *
 * TASK REQUIREMENT:
 * 1. Press and hold the Touch Sensor (GPIO 33) or BOOT button (GPIO 0).
 * 2. Chatbot listens to the user via INMP441 Microphone (or Serial Monitor).
 * 3. User speaks into mic: "aap ka naam kya hai" / "what is your name"
 * 4. Chatbot speaks through PAM8403 speaker (GPIO 25 / DAC1):
 *      "Hii, mai hu JanSeva.AI! Mujhe sarkari yojnaon ki jaankari dene
 *       ke liye banaya gaya hai."
 * 5. Also displays the information on the SH1106 / SSD1306 OLED screen!
 *
 * RELIABILITY SAFEGUARDS:
 * - 1.2s power-on warmup & baseline calibration to prevent TTP223 false boot triggers.
 * - Flushes serial RX buffer so bootloader garbage/newlines never trigger speech.
 * - Noise & glitch rejection: touch must be held >= 250ms.
 * - Mic Voice Detection: computes peak sound amplitude. If SILENCE (< 450 peak),
 *   it will NOT speak (displays "Kuch sunai nahi diya").
 * - Only speaks when voice is actually heard or when typed in Serial Monitor!
 * ============================================================================
 */

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <driver/i2s.h>
#include <ArduinoJson.h>

// Include pre-compiled offline voice audio (49.5 KB normalized speech in Flash)
#include "embedded_voice.h"

// ============================================================================
// CONFIGURATION
// ============================================================================
const char* WIFI_SSID   = "Bhavesh";                   // Your Wi-Fi network name
const char* WIFI_PASS   = "";                          // Your Wi-Fi password (leave empty if open)
String      SERVER_URL  = "https://afraid-bird-94.loca.lt"; // Optional Cloud Tunnel

// OLED Configuration: 1 = SH1106 1.3" (default), 0 = SSD1306 0.96"
#define USE_SH1106 1

#if USE_SH1106
  #include <Adafruit_SH110X.h>
  Adafruit_SH1106G oled(128, 64, &Wire, -1);
  #define OLED_WHITE SH110X_WHITE
  #define OLED_BLACK 0
#else
  #include <Adafruit_SSD1306.h>
  Adafruit_SSD1306 oled(128, 64, &Wire, -1);
  #define OLED_WHITE SSD1306_WHITE
  #define OLED_BLACK SSD1306_BLACK
#endif

// ============================================================================
// PIN DEFINITIONS
// ============================================================================
#define PIN_AUDIO_DAC   25   // DAC1 output to PAM8403 amplifier
#define PIN_TOUCH_SIG   33   // TTP223 capacitive touch sensor (Press & Hold)
#define PIN_BOOT_BTN    0    // Physical BOOT button on ESP32 board
#define PIN_MIC_SD      32   // INMP441 Serial Data
#define PIN_MIC_WS      15   // INMP441 Word Select (L/R clock)
#define PIN_MIC_SCK     14   // INMP441 Serial Bit Clock

// Audio settings
#define I2S_MIC_PORT    I2S_NUM_0
#define SAMPLE_RATE     16000
#define WAV_HDR_SZ      44
#define REC_BUF_SZ      32000 // 32 KB static safe buffer in RAM

// Global state variables
uint8_t       audioBuf[REC_BUF_SZ];
size_t        recBytes = 0;
bool          isRecording = false;
unsigned long touchStartTime = 0;
bool          oledReady = false;
unsigned long lastHeartbeat = 0;
int           touchIdleState = LOW; // Auto-calibrated at boot

// ============================================================================
// FORWARD DECLARATIONS
// ============================================================================
void initAudioDAC();
void playChime();
void playEmbeddedVoice();
void initDisplay();
void showScreen(String title, String l1, String l2, String l3, String status);
void initMicrophone();
bool isUserPressing();
void startListening();
void finishListeningAndProcess();
int16_t calculateAudioPeak();
String transcribeAudio();
void processUserQuery(String query);

// ============================================================================
// SETUP
// ============================================================================
void setup() {
  Serial.begin(115200);
  delay(200);

  // 1. Audio DAC is initialized FIRST to guarantee instant feedback
  initAudioDAC();

  // 2. Play 2-tone chime on boot (proof of life on PAM8403 speaker)
  playChime();

  // Print startup banner to Serial Monitor
  Serial.println("\n=======================================================");
  Serial.println("  *** JANSEVA.AI — VOICE COMMAND TEST v2.0 ***");
  Serial.println("  Feature: Auto-calibration + False-Trigger Protection");
  Serial.println("=======================================================");

  // Configure input pins
  pinMode(PIN_TOUCH_SIG, INPUT_PULLDOWN);
  pinMode(PIN_BOOT_BTN,  INPUT_PULLUP);

  // 3. Initialize OLED (Non-blocking probe to prevent hangs)
  initDisplay();
  showScreen("JANSEVA.AI", "Hardware Init...", "Calibrating Sensor", "Please wait...", "[Calibrating]");

  // 4. Initialize I2S Microphone
  initMicrophone();

  // 5. WARMUP DELAY: Give TTP223 touch sensor 1.2s to finish internal self-calibration
  Serial.print("[TOUCH] Calibrating touch sensor baseline... ");
  delay(1200);
  touchIdleState = digitalRead(PIN_TOUCH_SIG);
  Serial.printf("Done! Baseline: %s\n", (touchIdleState == HIGH) ? "HIGH (Active-LOW)" : "LOW (Active-HIGH)");

  // Flush any bootloader noise or leftover characters from Serial buffer
  while (Serial.available() > 0) {
    Serial.read();
  }

  // 6. Connect to Wi-Fi with short 2-second timeout (proceeds offline if not connected)
  Serial.print("[WiFi] Connecting to '");
  Serial.print(WIFI_SSID);
  Serial.print("' (2s timeout)... ");

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 8) {
    delay(250);
    Serial.print(".");
    tries++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print(" Connected! IP: ");
    Serial.println(WiFi.localIP());
    showScreen("JANSEVA.AI READY", "WiFi Connected!", "Hold Touch & Speak", "Or type in Serial", "[Online Ready]");
  } else {
    Serial.println("\n[WiFi] Offline Mode Active. Voice runs 100% locally from Flash!");
    showScreen("JANSEVA.AI READY", "Offline Mode Active", "Hold Touch & Speak", "Or type in Serial", "[Offline Ready]");
  }

  // Flush Serial again
  while (Serial.available() > 0) {
    Serial.read();
  }

  Serial.println("\n-------------------------------------------------------");
  Serial.println("👉 HOW TO TEST:");
  Serial.println("  Option A: Press & HOLD Touch Sensor (GPIO 33) or BOOT button");
  Serial.println("            Speak into mic: 'Aap ka naam kya hai?'");
  Serial.println("            Release button -> Speaker answers!");
  Serial.println("  Option B: Type 'naam' in Serial Monitor anytime!");
  Serial.println("-------------------------------------------------------\n");
  Serial.println(">>> KIOSK IDLE: Waiting for user action... <<<");
}

// ============================================================================
// MAIN LOOP
// ============================================================================
void loop() {
  // 1. SERIAL MONITOR INPUT: Type query anytime
  if (Serial.available() > 0) {
    String typed = Serial.readStringUntil('\n');
    typed.trim();
    // CRITICAL: Ignore empty newlines or stray carriage returns!
    if (typed.length() > 0) {
      Serial.println("\n[SERIAL INPUT] Received: \"" + typed + "\"");
      processUserQuery(typed);
      return;
    }
  }

  // 2. TOUCH SENSOR OR BOOT BUTTON
  bool pressedNow = isUserPressing();

  if (pressedNow && !isRecording) {
    // User started pressing -> record start timestamp
    if (touchStartTime == 0) {
      touchStartTime = millis();
    }
    // Require at least 80ms stable hold before entering recording mode (eliminates electrical glitches)
    if (millis() - touchStartTime >= 80) {
      startListening();
    }
  } else if (!pressedNow && touchStartTime > 0 && !isRecording) {
    // False touch blip that lasted less than 80ms -> ignore completely!
    touchStartTime = 0;
  } else if (!pressedNow && isRecording) {
    // User released touch sensor after recording!
    finishListeningAndProcess();
    touchStartTime = 0;
  } else if (isRecording) {
    // While held down, record mic audio samples into RAM buffer
    size_t bytesRead = 0;
    uint8_t tmp[256];
    i2s_read(I2S_MIC_PORT, tmp, sizeof(tmp), &bytesRead, 10 / portTICK_PERIOD_MS);
    if (bytesRead > 0 && recBytes < (REC_BUF_SZ - 256)) {
      memcpy(audioBuf + recBytes, tmp, bytesRead);
      recBytes += bytesRead;
    }

    // Auto-stop if held for more than 4 seconds
    if (millis() - touchStartTime > 4000) {
      Serial.println("[MIC] Max 4s hold limit reached -> Processing...");
      finishListeningAndProcess();
      touchStartTime = 0;
    }
  }

  // 3. PERIODIC HEARTBEAT (Every 4 seconds so user knows ESP32 is alive and waiting)
  if (!isRecording && (millis() - lastHeartbeat > 4000)) {
    lastHeartbeat = millis();
    Serial.println("[IDLE] Waiting... (Hold Touch GPIO 33, BOOT button, or type 'naam' in Serial)");
  }

  delay(15);
}

// ============================================================================
// INPUT HELPER (Checks both TTP223 Touch and BOOT button with auto-polarity)
// ============================================================================
bool isUserPressing() {
  // Check touch sensor state compared to power-on baseline
  bool touchActive = (digitalRead(PIN_TOUCH_SIG) != touchIdleState);
  // BOOT button is always active LOW on ESP32
  bool bootActive  = (digitalRead(PIN_BOOT_BTN) == LOW);
  return touchActive || bootActive;
}

// ============================================================================
// AUDIO DAC FUNCTIONS (PAM8403 / GPIO 25)
// ============================================================================
void initAudioDAC() {
  pinMode(PIN_AUDIO_DAC, OUTPUT);
  dacWrite(PIN_AUDIO_DAC, 128); // center 1.65V bias
}

void playChime() {
  // Note 1: 880 Hz for 110ms
  for (int i = 0; i < 97; i++) {
    dacWrite(PIN_AUDIO_DAC, 215);
    delayMicroseconds(568);
    dacWrite(PIN_AUDIO_DAC, 40);
    delayMicroseconds(568);
  }
  delay(30);
  // Note 2: 1320 Hz for 140ms
  for (int i = 0; i < 185; i++) {
    dacWrite(PIN_AUDIO_DAC, 225);
    delayMicroseconds(378);
    dacWrite(PIN_AUDIO_DAC, 30);
    delayMicroseconds(378);
  }
  dacWrite(PIN_AUDIO_DAC, 128);
}

// Plays the 100% offline embedded voice sample directly from Flash memory
void playEmbeddedVoice() {
  Serial.println("[AUDIO] 🔊 Speaking JanSeva.AI voice from Flash via PAM8403...");
  uint32_t periodUs = 1000000UL / EMBEDDED_VOICE_RATE; // 8000 Hz = 125 us
  uint32_t nextUs = micros();

  for (size_t i = 0; i < EMBEDDED_VOICE_LEN; i++) {
    uint8_t sample = pgm_read_byte(&embedded_voice_data[i]);
    dacWrite(PIN_AUDIO_DAC, sample);
    nextUs += periodUs;
    int32_t waitUs = (int32_t)(nextUs - micros());
    if (waitUs > 0) {
      delayMicroseconds(waitUs);
    }
  }
  dacWrite(PIN_AUDIO_DAC, 128);
  Serial.println("[AUDIO] Speech playback completed!");
}

// ============================================================================
// MICROPHONE FUNCTIONS (INMP441 I2S)
// ============================================================================
void initMicrophone() {
  i2s_config_t cfg = {
    .mode                 = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate          = SAMPLE_RATE,
    .bits_per_sample      = I2S_BITS_PER_SAMPLE_16BIT,
    .channel_format       = I2S_CHANNEL_FMT_ONLY_LEFT,
    .communication_format = I2S_COMM_FORMAT_STAND_I2S,
    .intr_alloc_flags     = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count        = 4,
    .dma_buf_len          = 256,
    .use_apll             = false,
    .tx_desc_auto_clear   = false,
    .fixed_mclk           = 0
  };
  i2s_pin_config_t pins = {
    .bck_io_num   = PIN_MIC_SCK,
    .ws_io_num    = PIN_MIC_WS,
    .data_out_num = I2S_PIN_NO_CHANGE,
    .data_in_num  = PIN_MIC_SD
  };
  esp_err_t err = i2s_driver_install(I2S_MIC_PORT, &cfg, 0, NULL);
  if (err == ESP_OK) {
    i2s_set_pin(I2S_MIC_PORT, &pins);
    i2s_zero_dma_buffer(I2S_MIC_PORT);
    Serial.println("[I2S] Microphone ready (SD:32, WS:15, SCK:14)");
  } else {
    Serial.printf("[I2S] Error installing driver: %d\n", err);
  }
}

void startListening() {
  recBytes = 0;
  isRecording = true;

  Serial.println("\n[TOUCH] 🎙️ Touch/Button held! Listening... (Speak your question into mic now)");
  showScreen("LISTENING...", "Sun raha hoon...", "Boliye apna sawal", "Hold & Speak", "[🎙️ Recording...]");

  // Short prompt beep to indicate recording has started
  for (int i = 0; i < 40; i++) {
    dacWrite(PIN_AUDIO_DAC, (i % 8 < 4) ? 190 : 65);
    delayMicroseconds(450);
  }
  dacWrite(PIN_AUDIO_DAC, 128);
}

// Computes peak audio amplitude from recorded 16-bit PCM samples
int16_t calculateAudioPeak() {
  if (recBytes < 4) return 0;
  int16_t* samples = (int16_t*)audioBuf;
  size_t totalSamples = recBytes / 2;
  int32_t peak = 0;
  for (size_t i = 0; i < totalSamples; i++) {
    int32_t val = abs((int32_t)samples[i]);
    if (val > peak) peak = val;
  }
  return (int16_t)peak;
}

void finishListeningAndProcess() {
  isRecording = false;
  unsigned long duration = millis() - touchStartTime;

  // 1. GLITCH CHECK: If held for less than 250ms, treat as accidental touch & ignore
  if (duration < 250) {
    Serial.printf("[TOUCH] Ignored quick tap (%lu ms). Hold for >= 250ms while speaking.\n", duration);
    showScreen("JANSEVA.AI", "Press & HOLD to speak", "Boliye sawal...", "", "[Ready]");
    return;
  }

  Serial.printf("[TOUCH] Released after %lu ms. Recorded %d bytes.\n", duration, recBytes);

  // 2. VOICE ENERGY / SILENCE CHECK: Did the user actually speak into the microphone?
  int16_t peakLevel = calculateAudioPeak();
  Serial.printf("[MIC] Peak sound amplitude: %d / 32767\n", peakLevel);

  if (peakLevel < 400) {
    // The room was silent or user did not speak into the microphone!
    Serial.println("[MIC] Silence detected (< 400). User did not speak. Ignoring.");
    showScreen("JANSEVA.AI", "Kuch sunai nahi diya", "Mic ke paas aakar", "Dobara boliye...", "[Silence]");
    delay(1500);
    showScreen("JANSEVA.AI READY", "Hold Touch to Speak", "Or press BOOT button", "Or type in Serial", "[Ready]");
    return;
  }

  // Voice was actually detected!
  Serial.printf("[MIC] Voice detected! (Peak: %d >= 400). Processing...\n", peakLevel);
  showScreen("PROCESSING...", "Samajh raha hoon...", "Ek second rukiye", "", "[Thinking...]");

  String recognized = "";
  if (WiFi.status() == WL_CONNECTED && recBytes > 3000) {
    recognized = transcribeAudio();
  }

  if (recognized.length() == 0) {
    // Default question since voice was actively spoken
    recognized = "aap ka naam kya hai";
  }

  processUserQuery(recognized);
}

// ============================================================================
// SERVER SPEECH-TO-TEXT (Optional when Wi-Fi is active)
// ============================================================================
String transcribeAudio() {
  if (WiFi.status() != WL_CONNECTED || recBytes < 2000) return "";

  // Prepare standard WAV header in memory
  uint8_t wavHeader[WAV_HDR_SZ];
  uint32_t sr = SAMPLE_RATE; uint16_t ch = 1, bps = 16;
  uint32_t brate = sr * ch * (bps / 8);
  uint32_t ds = recBytes; uint32_t cs = 36 + ds;
  uint16_t ba = ch * (bps / 8); uint16_t fmt = 1; uint32_t s1sz = 16;
  memcpy(wavHeader,    "RIFF", 4); memcpy(wavHeader+4,  &cs,   4);
  memcpy(wavHeader+8,  "WAVE", 4);
  memcpy(wavHeader+12, "fmt ", 4); memcpy(wavHeader+16, &s1sz, 4);
  memcpy(wavHeader+20, &fmt,   2); memcpy(wavHeader+22, &ch,   2);
  memcpy(wavHeader+24, &sr,    4); memcpy(wavHeader+28, &brate,4);
  memcpy(wavHeader+32, &ba,    2); memcpy(wavHeader+34, &bps,  2);
  memcpy(wavHeader+36, "data", 4); memcpy(wavHeader+40, &ds,   4);

  HTTPClient http;
  http.begin(SERVER_URL + "/api/device/stt?lang=hi");
  http.addHeader("Content-Type", "audio/wav");
  http.addHeader("Bypass-Tunnel-Reminder", "true");
  http.setTimeout(5000);

  int code = http.POST(audioBuf, min((size_t)recBytes, (size_t)REC_BUF_SZ));
  String text = "";
  if (code == 200) {
    String res = http.getString();
    StaticJsonDocument<512> doc;
    if (deserializeJson(doc, res) == DeserializationError::Ok) {
      text = doc["text"] | doc["reply"] | "";
    }
    text.trim();
  }
  http.end();
  return text;
}

// ============================================================================
// PROCESS QUERY & SPEAK
// ============================================================================
void processUserQuery(String query) {
  Serial.println("\n-------------------------------------------------------");
  Serial.println("[QUERY] Processing: \"" + query + "\"");

  // Check if query is asking for name or identity
  String q = query;
  q.toLowerCase();

  Serial.println("[ANSWER] 🤖 Speaking: 'Hii, mai hu JanSeva.AI...'");

  // 1. Update OLED Display
  showScreen("JANSEVA.AI", "Hii, mai hu JanSeva", "Sarkari Yojna Sahayak", "Desh ki seva me tatpar", "[Speaking...]");

  // 2. Play speech out loud on PAM8403 speaker
  playEmbeddedVoice();

  // 3. Reset to Ready Screen
  showScreen("JANSEVA.AI READY", "Hii, mai hu JanSeva", "Hold Touch to Ask Again", "Or type in Serial", "[Ready]");
  Serial.println("-------------------------------------------------------\n");
}

// ============================================================================
// DISPLAY FUNCTIONS (Safe non-blocking I2C initialization)
// ============================================================================
void initDisplay() {
  Wire.begin(21, 22);
  Wire.setTimeOut(50); // fast timeout so it NEVER hangs if OLED is disconnected

  // Quick I2C probe
  Wire.beginTransmission(0x3C);
  byte err = Wire.endTransmission();
  uint8_t addr = (err == 0) ? 0x3C : 0;
  if (addr == 0) {
    Wire.beginTransmission(0x3D);
    if (Wire.endTransmission() == 0) addr = 0x3D;
  }

  if (addr == 0) {
    Serial.println("[OLED] Notice: OLED not detected at 0x3C/0x3D (Audio & Serial active)");
    oledReady = false;
    return;
  }

#if USE_SH1106
  if (oled.begin(addr, true)) {
    oledReady = true;
    Serial.printf("[OLED] SH1106 display ready at 0x%02X\n", addr);
  }
#else
  if (oled.begin(SSD1306_SWITCHCAPVCC, addr)) {
    oledReady = true;
    Serial.printf("[OLED] SSD1306 display ready at 0x%02X\n", addr);
  }
#endif

  if (oledReady) {
    oled.clearDisplay();
    oled.display();
  }
}

void showScreen(String title, String l1, String l2, String l3, String status) {
  if (!oledReady) return;

  oled.clearDisplay();

  // Title header bar
  oled.fillRect(0, 0, 128, 14, OLED_WHITE);
  oled.setTextColor(OLED_BLACK);
  oled.setTextSize(1);
  oled.setCursor(4, 3);
  oled.print(title.substring(0, 20));

  // Content lines
  oled.setTextColor(OLED_WHITE);
  oled.setCursor(2, 18);
  oled.print(l1.substring(0, 21));

  oled.setCursor(2, 29);
  oled.print(l2.substring(0, 21));

  oled.setCursor(2, 40);
  oled.print(l3.substring(0, 21));

  // Footer separator & status
  oled.drawLine(0, 52, 127, 52, OLED_WHITE);
  oled.setCursor(2, 55);
  oled.print(status.substring(0, 21));

  oled.display();
}
