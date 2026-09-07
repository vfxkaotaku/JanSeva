/**
 * ============================================================================
 * JANSEVA.AI -- ESP32 Smart Citizen Kiosk Firmware v2.0
 * ============================================================================
 *
 * CONVERSATION FLOW:
 *   1. Touch sensor (single touch) -> Wake up + Greeting
 *   2. Language selection (say Hindi, English, Marathi, etc.)
 *   3. Ask for user Name -> Voice reply
 *   4. Ask for user Phone Number -> Voice reply
 *   5. Ask for the Problem -> Voice reply
 *   6. AI processes -> Speaks Solution
 *   7. Ask to Repeat solution -> Touch or Voice (yes/haan)
 *   8. Ask if more help needed -> Loop back or say Goodbye
 *
 * WiFi SETUP (First Boot or Reset):
 *   1. ESP32 creates AP named JANSEVA_SETUP
 *   2. Connect phone/laptop to that WiFi (no password)
 *   3. Open browser -> 192.168.4.1 (auto captive portal)
 *   4. Fill: Home WiFi SSID + Password + Server URL +
 *            Device ID + Location + Default Language
 *   5. Save -> ESP32 restarts and connects to home WiFi
 *
 * RESET WiFi: Hold touch sensor for 5 seconds
 *
 * Hardware Connections:
 *   PAM8403 VCC     -> ESP32 VIN/5V
 *   PAM8403 GND     -> GND
 *   PAM8403 Audio IN-> GPIO 25 (DAC1)
 *   PAM8403 OUT+/-  -> Speaker +/-
 *   OLED VCC        -> 3.3V
 *   OLED GND        -> GND
 *   OLED SCL        -> GPIO 22
 *   OLED SDA        -> GPIO 21
 *   TTP223 VCC      -> 3.3V
 *   TTP223 GND      -> GND
 *   TTP223 SIG      -> GPIO 33
 *   INMP441 VDD     -> 3.3V
 *   INMP441 GND     -> GND
 *   INMP441 SD      -> GPIO 32
 *   INMP441 WS      -> GPIO 15
 *   INMP441 SCK     -> GPIO 14
 *   INMP441 L/R     -> GND
 *
 * Required Libraries (Arduino Library Manager):
 *   Adafruit SH110X  (for 1" SH1106 OLED  -- PRIMARY)
 *   Adafruit SSD1306 (for 0.96" OLED only -- set USE_SH1106 = 0)
 *   Adafruit GFX, ArduinoJson (v6+)
 * ============================================================================
 */

#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Preferences.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <driver/i2s.h>
#include <ArduinoJson.h>

// ============================================================================
// PIN DEFINITIONS
// ============================================================================
#define PIN_BOOT_BTN    0    // Physical BOOT button on ESP32 board (hold 3s = Factory Reset)
#define PIN_TOUCH_SIG   33   // TTP223 capacitive touch sensor
#define PIN_MIC_SD      32   // INMP441 Serial Data
#define PIN_MIC_WS      15   // INMP441 Word Select (L/R clock)
#define PIN_MIC_SCK     14   // INMP441 Serial Bit Clock
#define PIN_AUDIO_DAC   25   // DAC1 output to PAM8403 amplifier
#define PIN_OLED_SDA    21   // I2C SDA for OLED
#define PIN_OLED_SCL    22   // I2C SCL for OLED

// ============================================================================
// OLED DISPLAY CONFIGURATION
// ============================================================================
// USE_SH1106 = 1  -> 1" or 1.3" displays (SH1106 chip) -- DEFAULT for this build
// USE_SH1106 = 0  -> 0.96" displays    (SSD1306 chip)
// Install "Adafruit SH110X" library when USE_SH1106 = 1
#define USE_SH1106 1

#define SCREEN_W 128
#define SCREEN_H 64

#if USE_SH1106
  #include <Adafruit_SH110X.h>
  Adafruit_SH1106G oled(SCREEN_W, SCREEN_H, &Wire, -1);
  #define OLED_WHITE SH110X_WHITE
  #define OLED_BLACK 0
#else
  #include <Adafruit_SSD1306.h>
  Adafruit_SSD1306 oled(SCREEN_W, SCREEN_H, &Wire, -1);
  #define OLED_WHITE SSD1306_WHITE
  #define OLED_BLACK SSD1306_BLACK
#endif

// Robot face state enum
enum FaceState {
  FACE_IDLE    = 0,   // Neutral, blinking
  FACE_GREET   = 1,   // Big smile + wave
  FACE_LISTEN  = 2,   // Big eyes + mic symbol
  FACE_THINK   = 3,   // Eyes up, animated dots
  FACE_SPEAK   = 4,   // Animated mouth open/close
  FACE_HAPPY   = 5,   // Happy eyes + smile
  FACE_SETUP   = 6,   // WiFi/config screen
  FACE_BYE     = 7    // Waving goodbye
};

uint32_t faceFrame = 0;  // incremented each draw call for animation

// ============================================================================
// AUDIO CONFIG
// ============================================================================
#define I2S_MIC_PORT    I2S_NUM_0
#define SAMPLE_RATE     16000
#define MAX_REC_SECS    7
#define WAV_HDR_SZ      44
#define AUDIO_BUF_SZ    (SAMPLE_RATE * 2 * MAX_REC_SECS + WAV_HDR_SZ)

uint8_t* audioBuf = nullptr;
size_t   recBytes = 0;

// ============================================================================
// PERSISTENT SETTINGS (saved to flash)
// ============================================================================
Preferences prefs;
String cfg_ssid     = "";
String cfg_pass     = "";
String cfg_server   = "https://janseva-kiosk-live.loca.lt";
String cfg_devid    = "JANSEVA-ESP32";
String cfg_location = "Main Counter";
String cfg_lang     = "hi";

// ============================================================================
// CAPTIVE PORTAL
// ============================================================================
const char* AP_NAME = "JANSEVA_SETUP";
DNSServer   dnsServer;
WebServer   portalServer(80);
bool        portalActive = false;

// ============================================================================
// CONVERSATION STATE MACHINE
// ============================================================================
enum ConvStep {
  STEP_IDLE = 0,
  STEP_GREET,
  STEP_LANG_CHOICE,
  STEP_ASK_NAME,
  STEP_GET_NAME,
  STEP_ASK_PHONE,
  STEP_GET_PHONE,
  STEP_ASK_PROBLEM,
  STEP_GET_PROBLEM,
  STEP_THINKING,
  STEP_SPEAK_SOLUTION,
  STEP_ASK_REPEAT,
  STEP_ASK_MORE
};

ConvStep convStep          = STEP_IDLE;
String   userName          = "";
String   userPhone         = "";
String   userProblem       = "";
String   lastSolution      = "";
String   lastScreenSummary = "";
String   sttDisplayText    = "";
String   activeLang        = "hi";
String   convId            = "";
String   serialTypedInput  = "";  // Allows typing directly into Serial Monitor as voice fallback

unsigned long lastHeartbeat = 0;
#define HEARTBEAT_MS 30000

// ============================================================================
// FORWARD DECLARATIONS
// ============================================================================
void drawRobotFace(FaceState state, String label);
void showOLED(String l1, String l2, String l3, String l4);  // legacy wrapper
void showScreenCard(String title, String body, String status);
void playTone(int freqHz, int durationMs);
void startPortal();
void handlePortalRoot();
void handlePortalSave();
void handlePortalRedirect();
void initMicrophone();
bool recordVoice(int maxSecs);
String sendAudioForSTT();
String sendChatMessage(String message, String ctx);
void speakText(String text, String lang);
void playDAC(const uint8_t* data, size_t len);
void sendHeartbeat();
void runConversationStep(String voiceInput);
void resetConversation();
bool containsAny(String haystack, const char* needles[], int count);
void handleSerialCommand(String cmd);
void runMicDiagnostic();
void testServerConnection();

// ============================================================================
// SETUP
// ============================================================================
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("=== JANSEVA.AI ESP32 Kiosk v2.0 ===");

  pinMode(PIN_TOUCH_SIG, INPUT_PULLDOWN);
  pinMode(PIN_BOOT_BTN,  INPUT_PULLUP);

  // Initialize I2C Bus & OLED Display
  Wire.begin(PIN_OLED_SDA, PIN_OLED_SCL);
  Wire.setTimeOut(100);
  delay(150);

  // Auto-scan I2C for display address (0x3C vs 0x3D)
  uint8_t oledAddr = 0x3C;
  bool oledFound = false;

  Wire.beginTransmission(0x3C);
  if (Wire.endTransmission() == 0) {
    oledAddr = 0x3C;
    oledFound = true;
    Serial.println("[OLED] Found I2C display at 0x3C");
  } else {
    Wire.beginTransmission(0x3D);
    if (Wire.endTransmission() == 0) {
      oledAddr = 0x3D;
      oledFound = true;
      Serial.println("[OLED] Found I2C display at 0x3D");
    }
  }

  if (!oledFound) {
    Serial.println("[OLED] WARNING: No I2C display detected at 0x3C or 0x3D!");
    Serial.println("[OLED] 1. Check wiring: SDA->GPIO 21, SCL->GPIO 22");
    Serial.println("[OLED] 2. Try powering OLED from VIN/5V instead of 3.3V");
  }

#if USE_SH1106
  if (!oled.begin(oledAddr, true)) {
    Serial.println("[OLED] SH1106 begin failed!");
  } else {
    Serial.println("[OLED] SH1106 display ready");
    oled.clearDisplay();
    oled.display();
  }
#else
  if (!oled.begin(SSD1306_SWITCHCAPVCC, oledAddr)) {
    Serial.println("[OLED] SSD1306 begin failed! If screen shows random pixels, set USE_SH1106 to 1");
  } else {
    Serial.println("[OLED] SSD1306 display ready");
    oled.clearDisplay();
    oled.display();
  }
#endif

  // Show happy boot face
  drawRobotFace(FACE_HAPPY, "Boot");
  delay(500);

  // Play startup test chime through speaker (verifies PAM8403 & speaker immediately)
  Serial.println("[AUDIO] Playing startup test chime...");
  for (int f = 0; f < 200; f++) {
    dacWrite(PIN_AUDIO_DAC, (f % 16 < 8) ? 200 : 50);
    delayMicroseconds(500);
  }
  delay(50);
  for (int f = 0; f < 250; f++) {
    dacWrite(PIN_AUDIO_DAC, (f % 12 < 6) ? 210 : 45);
    delayMicroseconds(375);
  }
  dacWrite(PIN_AUDIO_DAC, 0);
  Serial.println("[AUDIO] Startup chime finished");

  // Load saved config from flash
  prefs.begin("janseva", false);
  cfg_ssid     = prefs.getString("ssid",     "");
  cfg_pass     = prefs.getString("pass",     "");
  cfg_server   = prefs.getString("server",   "https://janseva-kiosk-live.loca.lt");
  cfg_devid    = prefs.getString("devid",    "JANSEVA-ESP32");
  cfg_location = prefs.getString("location", "Main Counter");
  cfg_lang     = prefs.getString("deflang",  "hi");
  activeLang   = cfg_lang;

  // Allocate audio buffer (use PSRAM if available, or safe block in SRAM)
  audioBuf = (uint8_t*) ps_malloc(AUDIO_BUF_SZ);
  if (!audioBuf) {
    size_t largest = heap_caps_get_largest_free_block(MALLOC_CAP_8BIT);
    size_t safeSz = (largest > 40000) ? (largest - 35000) : (SAMPLE_RATE * 2 * 3 + WAV_HDR_SZ);
    audioBuf = (uint8_t*) malloc(safeSz);
    Serial.printf("[AUDIO] Allocated %u bytes buffer (largest block: %u)\n", safeSz, largest);
  }

  initMicrophone();

  // -----------------------------------------------------------------------
  // PORTAL TRIGGER LOGIC (First boot OR forced by BOOT button)
  // -----------------------------------------------------------------------
  bool forcePortal = false;

  if (cfg_ssid == "" || cfg_ssid == "Your Home WiFi") {
    Serial.println("\n[BOOT] No WiFi saved. Opening setup portal...");
    forcePortal = true;
  } else {
    Serial.println("\n[BOOT] Saved WiFi: " + cfg_ssid);
    Serial.println("[BOOT] Connecting to WiFi (Hold BOOT 2s to open Setup Portal)...");

    showScreenCard("JANSEVA AI KIOSK",
                   "Starting up...\nWiFi: " + cfg_ssid + "\nConnecting...",
                   "[Boot Standby]");

    // Check if user is actively holding BOOT button at startup
    if (digitalRead(PIN_BOOT_BTN) == LOW) {
      unsigned long btnStart = millis();
      while (digitalRead(PIN_BOOT_BTN) == LOW) {
        if (millis() - btnStart > 2000) {
          Serial.println("[BOOT] BOOT button held! Entering Setup Portal...");
          forcePortal = true;
          break;
        }
        delay(30);
      }
    }
  }

  if (forcePortal) {
    startPortal();
    return;
  }

  // Connect to saved WiFi
  showScreenCard("CONNECTING...",
                 "Connecting to WiFi:\n" + cfg_ssid + "\n\nPlease wait...",
                 "[WiFi Connecting]");
  WiFi.disconnect(true);
  delay(100);
  WiFi.mode(WIFI_STA);
  WiFi.begin(cfg_ssid.c_str(), cfg_pass.c_str());
  Serial.print("[WiFi] Connecting to: " + cfg_ssid);

  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 25) {
    delay(500);
    tries++;
    Serial.print(".");
    if (tries % 2 == 0) drawRobotFace(FACE_THINK, "WiFi...");

    // Check if user manually holds BOOT button to abort
    if (digitalRead(PIN_BOOT_BTN) == LOW) {
      unsigned long abortStart = millis();
      while (digitalRead(PIN_BOOT_BTN) == LOW) {
        if (millis() - abortStart > 2000) {
          Serial.println("\n[WiFi] Aborted by user via BOOT button. Opening setup portal...");
          startPortal();
          return;
        }
        delay(30);
      }
    }
  }

  if (WiFi.status() == WL_CONNECTED) {
    String ip = WiFi.localIP().toString();
    Serial.println("\n[WiFi] Connected: " + ip);
    sendHeartbeat();

    // Pleasant 2-tone melodic ready chime (silent boot - no unprompted voice)
    playTone(659, 100);
    delay(40);
    playTone(880, 160);

    showScreenCard("JANSEVA READY",
                   "WiFi Connected!\nIP: " + ip + "\n" + cfg_location + "\nTouch sensor to start",
                   "[Ready Standby]");
    delay(1200);

    Serial.println("\n=======================================================");
    Serial.println("  [KIOSK READY] JANSEVA.AI ESP32 Kiosk v2.0");
    Serial.println("  [TOUCH SENSOR] Tap touch sensor (GPIO 33) or BOOT button");
    Serial.println("  [SERIAL CONSOLE] You can also type commands anytime:");
    Serial.println("    -> 'start' or 'hi'     : Wake up kiosk & begin voice chat");
    Serial.println("    -> 'mic'               : Test microphone live with VU meter");
    Serial.println("    -> 'audio'             : Test PAM8403 speaker chime");
    Serial.println("    -> 'reset'             : Reset WiFi setup portal");
    Serial.println("    -> Or type any query   : e.g. 'PM Kisan Yojana kya hai'");
    Serial.println("=======================================================\n");

    convStep = STEP_IDLE;
    drawRobotFace(FACE_IDLE, cfg_location.substring(0, 9));
  } else {
    Serial.println("\n[WiFi] Connection timeout. Opening setup portal...");
    startPortal();
  }
}

// ============================================================================
// LOOP
// ============================================================================
void loop() {
  // Serial command listener (Full interactive console & text chat)
  if (Serial.available() > 0) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    if (cmd.length() > 0) {
      handleSerialCommand(cmd);
      return;
    }
  }

  // Portal mode
  if (portalActive) {
    dnsServer.processNextRequest();
    portalServer.handleClient();
    return;
  }

  // Physical BOOT button (GPIO 0) detection:
  // - Hold for 3s -> Factory Reset (wipes WiFi & restarts)
  // - Short tap -> Wake up kiosk / continuous question
  if (digitalRead(PIN_BOOT_BTN) == LOW) {
    unsigned long pressStart = millis();
    while (digitalRead(PIN_BOOT_BTN) == LOW) {
      if (millis() - pressStart > 3000) {
        Serial.println("[BTN] BOOT button held 3s -> FACTORY RESET!");
        showScreenCard("FACTORY RESET", "Clearing settings...\nRestarting device.", "[Resetting]");
        while (digitalRead(PIN_BOOT_BTN) == LOW) delay(50);
        prefs.clear();
        delay(500);
        ESP.restart();
        return;
      }
      delay(30);
    }
    // Short tap on BOOT button triggers conversation just like touch sensor!
    if (convStep == STEP_IDLE) {
      playTone(784, 80); delay(20); playTone(1046, 120);
      resetConversation();
      convStep = STEP_GREET;
      runConversationStep("");
      return;
    } else if (convStep == STEP_ASK_MORE || convStep == STEP_SPEAK_SOLUTION) {
      playTone(880, 80);
      convStep = STEP_ASK_PROBLEM;
      runConversationStep("");
      return;
    }
  }

  // TTP223 Touch detection (GPIO 33) with debounce to eliminate RF glitches
  if (digitalRead(PIN_TOUCH_SIG) == HIGH) {
    delay(40); // 40ms debounce
    if (digitalRead(PIN_TOUCH_SIG) == HIGH) {
      unsigned long touchStart = millis();
      while (digitalRead(PIN_TOUCH_SIG) == HIGH) {
        if (millis() - touchStart > 5000) {
          // 5s long press -> WiFi reset
          showScreenCard("WIFI RESET", "Clearing settings...\nStarting portal.", "[Resetting]");
          while (digitalRead(PIN_TOUCH_SIG) == HIGH) delay(50);
          prefs.clear();
          ESP.restart();
          return;
        }
        delay(30);
      }
      // Short tap on Touch Sensor:
      if (convStep == STEP_IDLE) {
        // Wake up from sleep!
        playTone(784, 80); delay(20); playTone(1046, 120);
        resetConversation();
        convStep = STEP_GREET;
        runConversationStep("");
      } else if (convStep == STEP_ASK_MORE || convStep == STEP_SPEAK_SOLUTION) {
        // Citizen wants to ask another question!
        playTone(880, 80);
        convStep = STEP_ASK_PROBLEM;
        runConversationStep("");
      } else {
        // Record and process voice for current step
        bool got = recordVoice(6);
        if (got) {
          String text = sendAudioForSTT();
          if (text.length() > 0) runConversationStep(text);
          else speakText((activeLang == "mr") ? "Mala aikayala aale nahi. Krupaya punha bola." : "Mujhe sunai nahi diya. Kripya dobara boliye.", activeLang);
        }
      }
    }
  }

  // Periodic heartbeat
  if (WiFi.status() == WL_CONNECTED &&
      millis() - lastHeartbeat > HEARTBEAT_MS) {
    lastHeartbeat = millis();
    sendHeartbeat();
  }

  // Idle face animation (blink eyes, show ready screen)
  if (convStep == STEP_IDLE) {
    drawRobotFace(FACE_IDLE, cfg_location.substring(0, 9));
    delay(80);  // ~12 fps animation
  }
}

// ============================================================================
// ROBOT FACE DRAWING ENGINE
// All faces fit the 128x64 OLED. Robot head is on LEFT, label text on RIGHT.
// ============================================================================

// --- Shared helper: draw robot head outline (left side) ---
static void _drawHead() {
  // Head: rounded rect 56x46 at (2,9)
  oled.drawRoundRect(2, 9, 56, 46, 6, OLED_WHITE);
  // Antenna on top
  oled.drawLine(30, 9, 30, 3, OLED_WHITE);
  oled.fillCircle(30, 2, 2, OLED_WHITE);
  // Ears (small side tabs)
  oled.drawRect(0, 22, 2, 8, OLED_WHITE);   // left ear
  oled.drawRect(58, 22, 2, 8, OLED_WHITE);  // right ear
}

// --- Draw standard eyes (open) ---
static void _drawEyesOpen() {
  oled.fillCircle(18, 27, 7, OLED_WHITE);   // left eye
  oled.fillCircle(42, 27, 7, OLED_WHITE);   // right eye
  oled.fillCircle(18, 27, 3, OLED_BLACK);   // left pupil
  oled.fillCircle(42, 27, 3, OLED_BLACK);   // right pupil
}

// --- Draw blinking eyes (flat lines) ---
static void _drawEyesBlink() {
  oled.drawLine(11, 27, 25, 27, OLED_WHITE);
  oled.drawLine(35, 27, 49, 27, OLED_WHITE);
}

// --- Draw happy curved eyes ---
static void _drawEyesHappy() {
  // Upward arcs = happy ^^
  oled.drawCircle(18, 30, 7, OLED_WHITE);
  oled.fillRect(11, 30, 15, 8, OLED_BLACK); // clip bottom half -> ^^
  oled.drawCircle(42, 30, 7, OLED_WHITE);
  oled.fillRect(35, 30, 15, 8, OLED_BLACK);
}

// --- Draw thinking eyes (looking up-right) ---
static void _drawEyesThink() {
  oled.fillCircle(18, 27, 7, OLED_WHITE);
  oled.fillCircle(42, 27, 7, OLED_WHITE);
  oled.fillCircle(20, 24, 3, OLED_BLACK);  // pupils look upper-right
  oled.fillCircle(44, 24, 3, OLED_BLACK);
}

// --- Straight mouth ---
static void _mouthNeutral() {
  oled.drawLine(14, 46, 46, 46, OLED_WHITE);
}

// --- Smile mouth ---
static void _mouthSmile() {
  oled.drawCircle(30, 38, 10, OLED_WHITE);
  oled.fillRect(20, 28, 20, 10, OLED_BLACK); // clip top -> smile arc
}

// --- Open mouth (speaking) ---
static void _mouthOpen(uint8_t openAmt) { // openAmt: 2..8
  oled.drawRoundRect(18, 43, 24, openAmt, 3, OLED_WHITE);
  oled.fillRoundRect(19, 44, 22, openAmt-2, 2, OLED_WHITE);
}

// --- Label text on the right column (x=66..127) ---
static void _drawLabel(String top, String mid, String bot) {
  oled.setTextColor(OLED_WHITE);
  oled.setTextSize(1);
  oled.setCursor(66, 0);  oled.print(top);
  oled.setCursor(66, 24); oled.print(mid);
  oled.setCursor(66, 48); oled.print(bot);
}

// ----------------------------------------------------------------
void drawRobotFace(FaceState state, String label) {
  faceFrame++;
  oled.clearDisplay();

  switch (state) {

    // ---- IDLE: neutral face, slow blink every ~60 frames --------
    case FACE_IDLE: {
      _drawHead();
      if ((faceFrame % 60) < 4) _drawEyesBlink();
      else                      _drawEyesOpen();
      _mouthNeutral();
      // JANSEVA text right side
      oled.setTextSize(1);
      oled.setTextColor(OLED_WHITE);
      oled.setCursor(66, 4);  oled.print("JANSEVA");
      oled.setCursor(66, 14); oled.print("  .AI");
      oled.drawLine(64, 26, 127, 26, OLED_WHITE);
      oled.setCursor(66, 30); oled.print(label.substring(0,9));
      oled.setCursor(66, 42); oled.print("Touch to");
      oled.setCursor(66, 52); oled.print("  start");
      break;
    }

    // ---- LISTEN: big eyes, animated ear waves, mic icon ----------
    case FACE_LISTEN: {
      _drawHead();
      // Pulsing ear tabs
      uint8_t earH = 8 + (faceFrame % 4 < 2 ? 4 : 0);
      oled.fillRect(0, 22, 2, earH, OLED_WHITE);
      oled.fillRect(58, 22, 2, earH, OLED_WHITE);
      _drawEyesOpen();
      _mouthNeutral();
      // Mic icon right side
      oled.setTextSize(1);
      oled.setTextColor(OLED_WHITE);
      oled.setCursor(66, 0);  oled.print("Listening");
      // Animated sound waves
      uint8_t wOff = (faceFrame % 6) * 2;
      oled.drawLine(66,         20+wOff, 66,         30-wOff, OLED_WHITE);
      oled.drawLine(70,         16+wOff, 70,         34-wOff, OLED_WHITE);
      oled.drawLine(74,         20+wOff, 74,         30-wOff, OLED_WHITE);
      oled.drawLine(78,         24,      78,         26,      OLED_WHITE);
      oled.setCursor(66, 44); oled.print("Boliye...");
      oled.setCursor(66, 54); oled.print(label.substring(0,9));
      break;
    }

    // ---- THINK: upward eyes, animated dots ----------------------
    case FACE_THINK: {
      _drawHead();
      _drawEyesThink();
      // pursed mouth (thinking)
      oled.drawLine(20, 47, 40, 47, OLED_WHITE);
      // Animated thinking dots right side
      oled.setTextSize(1);
      oled.setTextColor(OLED_WHITE);
      oled.setCursor(66, 0); oled.print("Thinking");
      oled.setCursor(66, 12); oled.print(label.substring(0,9));
      // Three dots cycling
      uint8_t d = faceFrame % 12;
      if (d > 0)  { oled.fillCircle(72,  40, 3, OLED_WHITE); }
      if (d > 3)  { oled.fillCircle(84,  40, 3, OLED_WHITE); }
      if (d > 6)  { oled.fillCircle(96,  40, 3, OLED_WHITE); }
      oled.setCursor(66, 52); oled.print("Please wait");
      break;
    }

    // ---- SPEAK: open/close mouth animation ----------------------
    case FACE_SPEAK: {
      _drawHead();
      _drawEyesHappy();
      // Mouth cycles: open -> close -> open
      uint8_t phase = faceFrame % 8;
      uint8_t openAmt = (phase < 4) ? (2 + phase * 2) : (10 - (phase - 4) * 2);
      if (openAmt < 2) openAmt = 2;
      _mouthOpen(openAmt);
      oled.setTextSize(1);
      oled.setTextColor(OLED_WHITE);
      oled.setCursor(66, 0);  oled.print("Speaking");
      oled.setCursor(66, 12); oled.print(label.substring(0,9));
      // Sound wave lines
      oled.drawLine(66, 36, 66, 44, OLED_WHITE);
      oled.drawLine(70, 32, 70, 48, OLED_WHITE);
      oled.drawLine(74, 36, 74, 44, OLED_WHITE);
      oled.drawLine(78, 34, 78, 46, OLED_WHITE);
      oled.drawLine(82, 38, 82, 42, OLED_WHITE);
      break;
    }

    // ---- HAPPY: big smile, sparkles, greeting -------------------
    case FACE_GREET:
    case FACE_HAPPY: {
      _drawHead();
      // Bigger antenna glow
      oled.drawCircle(30, 2, 3, OLED_WHITE);
      _drawEyesHappy();
      _mouthSmile();
      // Sparkles (twinkling)
      if (faceFrame % 6 < 3) {
        oled.fillCircle(68, 8,  2, OLED_WHITE);
        oled.fillCircle(120, 20, 2, OLED_WHITE);
      } else {
        oled.fillCircle(80, 16, 2, OLED_WHITE);
        oled.fillCircle(112, 6, 2, OLED_WHITE);
      }
      oled.setTextSize(1);
      oled.setTextColor(OLED_WHITE);
      oled.setCursor(66, 28); oled.print("Namaskar!");
      oled.setCursor(66, 40); oled.print(label.substring(0,9));
      oled.setCursor(66, 52); oled.print("JANSEVA.AI");
      break;
    }

    // ---- SETUP: WiFi config screen ------------------------------
    case FACE_SETUP: {
      _drawHead();
      _drawEyesOpen();
      // neutral mouth with question mark feel
      oled.drawCircle(30, 46, 4, OLED_WHITE); // O mouth
      // WiFi symbol on right
      oled.setTextSize(1);
      oled.setTextColor(OLED_WHITE);
      oled.setCursor(66, 0);  oled.print("WiFi Setup");
      oled.setCursor(66, 12); oled.print("Connect to:");
      oled.setCursor(66, 24); oled.print("JANSEVA");
      oled.setCursor(66, 34); oled.print("_SETUP");
      oled.setCursor(66, 46); oled.print("192.168.4.1");
      break;
    }

    // ---- BYE: waving hand animation ----------------------------
    case FACE_BYE: {
      _drawHead();
      _drawEyesHappy();
      _mouthSmile();
      // Waving arm
      uint8_t waveY = (faceFrame % 6 < 3) ? 48 : 44;
      oled.drawLine(58, 34, 72, waveY, OLED_WHITE);  // arm out
      oled.fillCircle(74, waveY, 3, OLED_WHITE);      // hand
      oled.setTextSize(1);
      oled.setTextColor(OLED_WHITE);
      oled.setCursor(78, 28); oled.print("Dhanya-");
      oled.setCursor(78, 38); oled.print("waad!");
      oled.setCursor(78, 50); oled.print(label.substring(0,8));
      break;
    }
  }

  oled.display();
}

// Legacy text helper (still used for portal/boot messages)
void showOLED(String l1, String l2, String l3, String l4) {
  oled.clearDisplay();
  oled.setTextColor(OLED_WHITE);
  oled.setTextSize(1);
  oled.setCursor(0, 0);  oled.println(l1);
  oled.drawLine(0, 10, 127, 10, OLED_WHITE);
  oled.setCursor(0, 14); oled.println(l2);
  oled.setCursor(0, 30); oled.println(l3);
  oled.setCursor(0, 46); oled.println(l4);
  oled.display();
}

// Play clear melodic tone on DAC GPIO 25 for audible chimes
void playTone(int freqHz, int durationMs) {
  if (freqHz <= 0) { delay(durationMs); return; }
  uint32_t periodUs = 1000000 / freqHz;
  uint32_t halfUs = periodUs / 2;
  unsigned long start = millis();
  while (millis() - start < (unsigned long)durationMs) {
    dacWrite(PIN_AUDIO_DAC, 200);
    delayMicroseconds(halfUs);
    dacWrite(PIN_AUDIO_DAC, 50);
    delayMicroseconds(halfUs);
  }
  dacWrite(PIN_AUDIO_DAC, 0);
}

// Display high-contrast text card on 128x64 OLED (title banner + body + status)
void showScreenCard(String title, String body, String status) {
  oled.clearDisplay();

  // Top header banner (inverted white bar with crisp black title)
  oled.fillRect(0, 0, 128, 12, OLED_WHITE);
  oled.setTextColor(OLED_BLACK, OLED_WHITE);
  oled.setTextSize(1);
  oled.setCursor(3, 2);
  oled.print(title.substring(0, 20));

  // Main body text (white on black, auto-wrapped lines)
  oled.setTextColor(OLED_WHITE);
  oled.setTextSize(1);
  int cursorY = 15;
  int lineStart = 0;
  int len = body.length();

  while (lineStart < len && cursorY <= 43) {
    int lineEnd = lineStart;
    int nextNewline = body.indexOf('\n', lineStart);
    if (nextNewline != -1 && nextNewline - lineStart <= 21) {
      lineEnd = nextNewline;
    } else {
      lineEnd = min(lineStart + 21, len);
      if (lineEnd < len && body.charAt(lineEnd) != ' ') {
        int lastSpace = body.lastIndexOf(' ', lineEnd);
        if (lastSpace > lineStart + 4) {
          lineEnd = lastSpace;
        }
      }
    }

    String lineStr = body.substring(lineStart, lineEnd);
    lineStr.trim();
    oled.setCursor(2, cursorY);
    oled.print(lineStr);
    cursorY += 10;

    lineStart = lineEnd;
    while (lineStart < len && (body.charAt(lineStart) == ' ' || body.charAt(lineStart) == '\n')) {
      lineStart++;
    }
  }

  // Bottom footer status bar
  oled.drawLine(0, 51, 127, 51, OLED_WHITE);
  oled.setCursor(2, 53);
  oled.print(status.substring(0, 21));

  oled.display();
}

// ============================================================================
// I2S MICROPHONE INIT
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
    .dma_buf_len          = 512,
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
  i2s_driver_install(I2S_MIC_PORT, &cfg, 0, NULL);
  i2s_set_pin(I2S_MIC_PORT, &pins);
  i2s_zero_dma_buffer(I2S_MIC_PORT);
}

// ============================================================================
// RECORD VOICE -> WAV in audioBuf
// ============================================================================
bool recordVoice(int maxSecs) {
  if (!audioBuf) return false;
  recBytes = 0;
  size_t bytesRead = 0;
  unsigned long start  = millis();
  unsigned long limit  = (unsigned long)maxSecs * 1000UL;
  serialTypedInput = "";

  drawRobotFace(FACE_LISTEN, "Boliye!");
  Serial.printf("[MIC] Listening for %d seconds... (Speak into mic OR type answer in Serial Monitor)\n", maxSecs);

  int maxAmp = 0;
  while (recBytes < (AUDIO_BUF_SZ - WAV_HDR_SZ - 512) &&
         (millis() - start) < limit) {

    // Allow user to type their response directly into Serial Monitor!
    if (Serial.available() > 0) {
      String typed = Serial.readStringUntil('\n');
      typed.trim();
      if (typed.length() > 0) {
        serialTypedInput = typed;
        Serial.println("[SERIAL-INPUT] Captured: " + typed);
        return true;
      }
    }

    uint8_t tmp[512];
    i2s_read(I2S_MIC_PORT, tmp, sizeof(tmp), &bytesRead, 20 / portTICK_PERIOD_MS);
    if (bytesRead > 0) {
      int16_t* s16 = (int16_t*)tmp;
      int sCount = bytesRead / 2;
      for (int i = 0; i < sCount; i++) {
        int a = abs(s16[i]);
        if (a > maxAmp) maxAmp = a;
      }
      memcpy(audioBuf + WAV_HDR_SZ + recBytes, tmp, bytesRead);
      recBytes += bytesRead;
    }
  }

  Serial.printf("[MIC] Recorded %d bytes. Peak amplitude: %d\n", recBytes, maxAmp);
  if (maxAmp < 100) {
    Serial.println("[MIC] WARNING: Audio is near silence (amplitude < 100)!");
    Serial.println("[MIC] -> Type 'mic' in Serial Monitor to test microphone live.");
    Serial.println("[MIC] -> Check INMP441 wiring: L/R pin MUST be connected to GND!");
    Serial.println("[MIC] -> TIP: You can also type your answers/questions in Serial Monitor!");
  }

  if (recBytes < 512) return false;

  // Build WAV header
  uint32_t sr   = SAMPLE_RATE; uint16_t ch = 1, bps = 16;
  uint32_t brate = sr * ch * (bps / 8);
  uint32_t ds   = recBytes; uint32_t cs = 36 + ds;
  uint16_t ba   = ch * (bps / 8); uint16_t fmt = 1; uint32_t s1sz = 16;
  memcpy(audioBuf,    "RIFF", 4); memcpy(audioBuf+4,  &cs,   4);
  memcpy(audioBuf+8,  "WAVE", 4);
  memcpy(audioBuf+12, "fmt ", 4); memcpy(audioBuf+16, &s1sz, 4);
  memcpy(audioBuf+20, &fmt,   2); memcpy(audioBuf+22, &ch,   2);
  memcpy(audioBuf+24, &sr,    4); memcpy(audioBuf+28, &brate,4);
  memcpy(audioBuf+32, &ba,    2); memcpy(audioBuf+34, &bps,  2);
  memcpy(audioBuf+36, "data", 4); memcpy(audioBuf+40, &ds,   4);
  recBytes += WAV_HDR_SZ;

  return true;
}

// ============================================================================
// SEND AUDIO FOR STT (Speech-to-Text)
// ============================================================================
String sendAudioForSTT() {
  // If user typed the input in Serial Monitor, bypass STT audio upload and use text directly
  if (serialTypedInput.length() > 0) {
    String res = serialTypedInput;
    serialTypedInput = "";
    sttDisplayText = res;
    Serial.println("[STT-BYPASS] Using Serial Monitor input: " + res);
    return res;
  }

  if (WiFi.status() != WL_CONNECTED || recBytes <= WAV_HDR_SZ) return "";
  drawRobotFace(FACE_THINK, "Samajh...");

  HTTPClient http;
  String url = cfg_server + "/api/device/stt?lang=" + activeLang + "&deviceId=" + cfg_devid;
  http.begin(url);
  http.addHeader("Content-Type", "audio/wav");
  http.addHeader("X-Device-Id",  cfg_devid);
  http.addHeader("Bypass-Tunnel-Reminder", "true");
  http.addHeader("User-Agent", "ESP32-JanSeva/2.0");
  http.setTimeout(25000);

  int code = http.POST(audioBuf, recBytes);
  Serial.printf("[STT] HTTP response: %d\n", code);

  String result = "";
  sttDisplayText = "";
  if (code == 200) {
    String body = http.getString();
    StaticJsonDocument<1024> doc;
    if (deserializeJson(doc, body) == DeserializationError::Ok) {
      result         = doc["text"] | doc["reply"] | "";
      sttDisplayText = doc["displayText"] | "";
    } else {
      result = body;
    }
    result.trim();
    sttDisplayText.trim();
    Serial.println("[STT] Recognized: " + result);
    if (sttDisplayText.length() > 0) {
      Serial.println("[STT] DisplayText: " + sttDisplayText);
    }
  } else {
    Serial.printf("[STT] Error %d from server\n", code);
  }
  http.end();
  return result;
}

// ============================================================================
// SEND CHAT MESSAGE TO AI (Syncs with JanSeva AI web backend)
// ============================================================================
String sendChatMessage(String message, String ctx) {
  if (WiFi.status() != WL_CONNECTED) return "";

  HTTPClient http;
  http.begin(cfg_server + "/api/device/text");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Id",  cfg_devid);
  http.addHeader("Bypass-Tunnel-Reminder", "true");
  http.addHeader("User-Agent", "ESP32-JanSeva/2.0");
  http.setTimeout(30000);

  StaticJsonDocument<1024> req;
  req["message"]       = message;
  req["language"]      = activeLang;
  req["userName"]      = userName;
  req["userPhone"]     = userPhone;
  req["deviceId"]      = cfg_devid;
  req["location"]      = cfg_location;
  req["deviceContext"] = ctx;

  String body;
  serializeJson(req, body);
  int code = http.POST(body);
  Serial.printf("[CHAT] HTTP %d\n", code);

  String reply = "";
  lastScreenSummary = "";
  if (code == 200) {
    String res = http.getString();
    StaticJsonDocument<2048> doc;
    if (deserializeJson(doc, res) == DeserializationError::Ok) {
      reply             = doc["reply"] | doc["message"] | "";
      lastScreenSummary = doc["screenSummary"] | "";
    } else {
      reply = res;
    }
    reply.trim();
    lastScreenSummary.trim();
    Serial.println("[CHAT] " + reply.substring(0, 80));
    if (lastScreenSummary.length() > 0) {
      Serial.println("[CHAT] ScreenSummary: " + lastScreenSummary);
    }
  }
  http.end();
  return reply;
}

// ============================================================================
// SPEAK TEXT via TTS -> DAC -> PAM8403
// ============================================================================
void speakText(String text, String lang) {
  if (text.length() == 0 || WiFi.status() != WL_CONNECTED) return;
  if (lang.length() == 0) lang = activeLang;

  // Strip markdown
  text.replace("**", ""); text.replace("*", "");
  text.replace("__", ""); text.replace("#", "");
  text.replace("`",  ""); text.replace("\n", " ");
  if (text.length() > 300) text = text.substring(0, 300);

  Serial.println("[TTS] Requesting voice for: " + text.substring(0, 30) + "...");
  HTTPClient http;
  http.begin(cfg_server + "/api/device/tts");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Bypass-Tunnel-Reminder", "true");
  http.addHeader("User-Agent", "ESP32-JanSeva/2.0");
  http.setTimeout(15000);

  StaticJsonDocument<512> req;
  req["text"]   = text;
  req["lang"]   = lang;
  req["format"] = "pcm";
  req["rate"]   = "+15%";
  String reqBody;
  serializeJson(req, reqBody);

  int code = http.POST(reqBody);
  Serial.printf("[TTS] Response code: %d, Content-Length: %d\n", code, http.getSize());

  if (code == 200) {
    drawRobotFace(FACE_SPEAK, "Bol raha..");
    WiFiClient* stream = http.getStreamPtr();
    int size = http.getSize();
    size_t freeHeap = ESP.getFreeHeap();
    Serial.printf("[TTS] Audio size: %d, Free Heap: %u\n", size, freeHeap);

    // If audio fits in RAM (keeping 45KB safe margin for WiFi/system),
    // download entirely first into RAM. This eliminates 100% of Wi-Fi buffer pauses and slow-motion speech!
    if (size > 0 && size < (int)(freeHeap - 45000)) {
      uint8_t* audioBuf = (uint8_t*)malloc(size);
      if (audioBuf) {
        int totalRead = 0;
        unsigned long dlStart = millis();
        while (totalRead < size && (millis() - dlStart < 6000)) {
          int avail = stream->available();
          if (avail > 0) {
            int r = stream->readBytes(audioBuf + totalRead, min(avail, size - totalRead));
            if (r > 0) totalRead += r;
          } else {
            delay(1);
          }
        }
        Serial.printf("[TTS] Downloaded %d/%d bytes in %lu ms. Playing smooth audio...\n", totalRead, size, millis() - dlStart);
        playDAC(audioBuf, totalRead);
        free(audioBuf);
      } else {
        streamAudioFromNetwork(stream, size);
      }
    } else {
      streamAudioFromNetwork(stream, size);
    }
    Serial.println("[TTS] Playback complete");
  } else {
    Serial.printf("[TTS] Error HTTP %d from server\n", code);
  }
  http.end();
  dacWrite(PIN_AUDIO_DAC, 0); // silence to prevent DC hum
}

// Fallback streamer with 2048-byte buffer for long responses
void streamAudioFromNetwork(WiFiClient* stream, int size) {
  const size_t CHUNK = 2048;
  uint8_t* chunk = (uint8_t*)malloc(CHUNK);
  if (!chunk) return;
  unsigned long startAudio = millis();
  while (stream->connected() && (size > 0 || size == -1)) {
    int avail = stream->available();
    if (avail >= 512 || (size > 0 && avail == size)) {
      int toRead = min(avail, (int)CHUNK);
      int r = stream->readBytes(chunk, toRead);
      if (r > 0) {
        playDAC(chunk, r);
        if (size > 0) size -= r;
      }
    } else if (avail > 0 && !stream->connected()) {
      int r = stream->readBytes(chunk, min(avail, (int)CHUNK));
      if (r > 0) playDAC(chunk, r);
      break;
    } else {
      delay(2);
    }
    if (millis() - startAudio > 30000) break;
  }
  free(chunk);
}

// ============================================================================
// DAC AUDIO PLAYBACK -> GPIO 25 -> PAM8403
// ============================================================================
void playDAC(const uint8_t* data, size_t len) {
  // Accurate 16,000 Hz hardware-timed playback (62.5 us period)
  // Microsecond timestamp tracking prevents any FreeRTOS or loop-overhead drift
  const uint32_t periodUs = 62;
  uint32_t nextUs = micros();
  for (size_t i = 0; i < len; i++) {
    dacWrite(PIN_AUDIO_DAC, data[i]);
    nextUs += periodUs;
    int32_t waitUs = (int32_t)(nextUs - micros());
    if (waitUs > 0) {
      delayMicroseconds(waitUs);
    }
  }
  dacWrite(PIN_AUDIO_DAC, 0); // silence to prevent DC hum
}

// ============================================================================
// HEARTBEAT
// ============================================================================
void sendHeartbeat() {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  http.begin(cfg_server + "/api/device/heartbeat");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Bypass-Tunnel-Reminder", "true");
  http.addHeader("User-Agent", "ESP32-JanSeva/2.0");
  http.setTimeout(5000);

  StaticJsonDocument<256> doc;
  doc["deviceId"] = cfg_devid;
  doc["location"] = cfg_location;
  doc["ip"]       = WiFi.localIP().toString();
  doc["rssi"]     = WiFi.RSSI();
  doc["freeHeap"] = ESP.getFreeHeap();
  doc["lang"]     = cfg_lang;

  String body; serializeJson(doc, body);
  http.POST(body); http.end();
  Serial.println("[HB] Sent");
}

// ============================================================================
// CONVERSATION STATE MACHINE
// ============================================================================
void resetConversation() {
  userName     = ""; userPhone  = "";
  userProblem  = ""; lastSolution = "";
  activeLang   = cfg_lang;
  convId       = "esp32_" + String(millis());
}

void runConversationStep(String voiceInput) {
  voiceInput.trim();
  String vi = voiceInput; vi.toLowerCase();

  switch (convStep) {

    // ------------------------------------------------------------------------
    // STEP 1: GREETING & ASK COMFORTABLE LANGUAGE (IN HINDI)
    // ------------------------------------------------------------------------
    case STEP_GREET: {
      showScreenCard("JANSEVA AI KIOSK",
                     "Namaste! Swagat hai.\nBhasha chuniye:\nHindi, Marathi, English",
                     "[🔊 Suniye...]");

      String g = "Namaste! JanSeva Kendra mein aapka swagat hai. Aap kis bhasha mein baat karna chahte hain? Hindi, Marathi, ya English boliye.";
      speakText(g, "hi");

      showScreenCard("BHASHA CHUNIYE",
                     "Bhasha boliye:\nHindi / Marathi / English\n\nMic chalu hai...",
                     "[🎙️ Boliye...]");

      convStep = STEP_LANG_CHOICE;
      delay(200);
      if (recordVoice(5)) {
        String t = sendAudioForSTT();
        if (t.length() > 0) runConversationStep(t);
        else {
          speakText("Bhasha sunai nahi di. Theek hai, hum Hindi mein baat karenge.", "hi");
          activeLang = "hi";
          convStep = STEP_ASK_NAME;
          delay(200);
          runConversationStep("");
        }
      } else {
        activeLang = "hi";
        convStep = STEP_ASK_NAME;
        delay(200);
        runConversationStep("");
      }
      break;
    }

    // ------------------------------------------------------------------------
    // STEP 2: DETECT LANGUAGE & CONFIRM IN USER'S CHOSEN LANGUAGE
    // ------------------------------------------------------------------------
    case STEP_LANG_CHOICE: {
      if      (vi.indexOf("marathi") >= 0 || vi.indexOf("मराठी") >= 0) activeLang = "mr";
      else if (vi.indexOf("english") >= 0 || vi.indexOf("angrezi") >= 0 || vi.indexOf("इंग्रजी") >= 0) activeLang = "en";
      else if (vi.indexOf("gujarati") >= 0 || vi.indexOf("ગુજરાતી") >= 0) activeLang = "gu";
      else if (vi.indexOf("tamil") >= 0)    activeLang = "ta";
      else if (vi.indexOf("telugu") >= 0)   activeLang = "te";
      else if (vi.indexOf("bengali") >= 0 || vi.indexOf("bangla") >= 0) activeLang = "bn";
      else if (vi.indexOf("punjabi") >= 0)  activeLang = "pa";
      else if (vi.indexOf("kannada") >= 0)  activeLang = "kn";
      else if (vi.indexOf("malayalam") >= 0)activeLang = "ml";
      else if (vi.indexOf("urdu") >= 0)     activeLang = "ur";
      else activeLang = "hi";

      String langName = (activeLang == "mr") ? "Marathi" : (activeLang == "en") ? "English" : (activeLang == "gu") ? "Gujarati" : "Hindi";
      showScreenCard("BHASHA SET",
                     "Bhasha: " + langName + "\n\nAb aage ki baat\naapki bhasha mein!",
                     "[✓ Language Set]");

      String conf = (activeLang == "mr") ? "Thik ahe, apan Marathi madhe bolu." :
                    (activeLang == "en") ? "Great! We will converse in English." :
                    (activeLang == "gu") ? "Saras! Have tame Gujarati ma vaat karishu." :
                                           "Theek hai, ab hum Hindi mein baat karenge.";
      speakText(conf, activeLang);

      convStep = STEP_ASK_NAME;
      delay(200);
      runConversationStep("");
      break;
    }

    // ------------------------------------------------------------------------
    // STEP 3: ASK NAME IN CITIZEN'S LANGUAGE
    // ------------------------------------------------------------------------
    case STEP_ASK_NAME: {
      String q = (activeLang == "mr") ? "Krupaya tumche purna nav sanga?" :
                 (activeLang == "en") ? "Please tell me your full name?" :
                 (activeLang == "gu") ? "Tamaru puru naam shu che?" :
                                        "Aapka shubh naam kya hai?";

      showScreenCard("AAPKA NAAM?",
                     "Kripya aapka pura\nnaam boliye.\nMic chalu hai...",
                     "[🔊 Suniye...]");

      speakText(q, activeLang);

      showScreenCard("AAPKA NAAM?",
                     "Kripya aapka pura\nnaam boliye.\nMic chalu hai...",
                     "[🎙️ Boliye...]");

      convStep = STEP_GET_NAME;
      delay(200);
      if (recordVoice(5)) {
        String t = sendAudioForSTT();
        if (t.length() > 0) runConversationStep(t);
        else {
          speakText((activeLang == "mr") ? "Nav aikayala aale nahi, punha sanga." : "Naam sunai nahi diya, kripya dobara boliye.", activeLang);
          convStep = STEP_ASK_NAME;
          delay(200);
          runConversationStep("");
        }
      }
      break;
    }

    // ------------------------------------------------------------------------
    // STEP 4: CAPTURE & ACKNOWLEDGE CITIZEN NAME
    // ------------------------------------------------------------------------
    case STEP_GET_NAME: {
      if (vi.length() < 2) {
        speakText((activeLang == "mr") ? "Nav spashta aale nahi, punha sanga." : "Naam spasht nahi mila, kripya dobara boliye.", activeLang);
        convStep = STEP_ASK_NAME;
        delay(200);
        runConversationStep("");
        break;
      }

      userName = (sttDisplayText.length() > 0) ? sttDisplayText : voiceInput;
      userName[0] = toupper(userName[0]);

      showScreenCard("CITIZEN NAME",
                     "Namaste,\n" + userName + " ji!\nJanSeva me swagat hai.",
                     "[✓ Verified]");

      String ack = (activeLang == "mr") ? "Namaskar " + userName + "! Swagat ahe." :
                   (activeLang == "en") ? "Welcome " + userName + "!" :
                   (activeLang == "gu") ? "Namaste " + userName + " bhai!" :
                                          "Namaste " + userName + " ji!";
      speakText(ack, activeLang);

      convStep = STEP_ASK_PHONE;
      delay(200);
      runConversationStep("");
      break;
    }

    // ------------------------------------------------------------------------
    // STEP 5: ASK 10-DIGIT MOBILE NUMBER IN CITIZEN'S LANGUAGE
    // ------------------------------------------------------------------------
    case STEP_ASK_PHONE: {
      String q = (activeLang == "mr") ? userName + ", tumcha 10 ankacha mobile number sanga." :
                 (activeLang == "en") ? userName + ", please say your 10-digit mobile number." :
                 (activeLang == "gu") ? userName + ", tamaro 10 ankno mobile number bolo." :
                                        userName + " ji, apna 10 ankon ka mobile number boliye.";

      showScreenCard("MOBILE NUMBER?",
                     userName + " ji,\n10 digits boliye:\ne.g. 9876543210",
                     "[🔊 Suniye...]");

      speakText(q, activeLang);

      showScreenCard("MOBILE NUMBER?",
                     userName + " ji,\n10 digits boliye:\ne.g. 9876543210",
                     "[🎙️ 10 Digits...]");

      convStep = STEP_GET_PHONE;
      delay(200);
      if (recordVoice(8)) {
        String t = sendAudioForSTT();
        if (t.length() > 0) runConversationStep(t);
        else {
          speakText((activeLang == "mr") ? "Mobile number aala nahi, punha sanga." : "Number sunai nahi diya, kripya dobara boliye.", activeLang);
          convStep = STEP_ASK_PHONE;
          delay(200);
          runConversationStep("");
        }
      }
      break;
    }

    // ------------------------------------------------------------------------
    // STEP 6: CAPTURE & ACKNOWLEDGE MOBILE NUMBER
    // ------------------------------------------------------------------------
    case STEP_GET_PHONE: {
      String digits = "";
      for (char c : voiceInput) if (isDigit(c)) digits += c;

      if (digits.length() < 6) {
        speakText((activeLang == "mr") ? "Number barobar nahi aala, krupaya 10 ank punha sanga." :
                  (activeLang == "en") ? "Mobile number invalid, please repeat 10 digits." :
                                         "Number sahi nahi mila, kripya apna 10 ankon ka number dobara boliye.", activeLang);
        convStep = STEP_ASK_PHONE;
        delay(200);
        runConversationStep("");
        break;
      }

      userPhone = digits;
      showScreenCard("MOBILE VERIFIED",
                     "Mob: " + userPhone + "\nRecord registered\nin JanSeva Portal.",
                     "[✓ Note Ho Gaya]");

      String ack = (activeLang == "mr") ? "Tumcha number note jhala: " + userPhone :
                   (activeLang == "en") ? "Your mobile number is noted: " + userPhone :
                                          "Aapka number note ho gaya hai: " + userPhone;
      speakText(ack, activeLang);

      convStep = STEP_ASK_PROBLEM;
      delay(200);
      runConversationStep("");
      break;
    }

    // ------------------------------------------------------------------------
    // STEP 7: ASK CITIZEN QUERY / PROBLEM IN THEIR LANGUAGE
    // ------------------------------------------------------------------------
    case STEP_ASK_PROBLEM: {
      String q = (activeLang == "mr") ? "Sanga " + userName + ", tumhala konya sarkari yojnebaddal mahiti havi ahe?" :
                 (activeLang == "en") ? "Please tell me " + userName + ", what government scheme or service can I help you with?" :
                                        "Bataiye " + userName + " ji, aapko kis sarkari yojana ya samasya ke baare mein jaankari chahiye?";

      showScreenCard("AAPKA SAWAL?",
                     "Bataiye " + userName + " ji,\nkya janna hai?\nMic chalu hai...",
                     "[🔊 Suniye...]");

      speakText(q, activeLang);

      showScreenCard("AAPKA SAWAL?",
                     "Bataiye " + userName + " ji,\nkya janna hai?\nMic chalu hai...",
                     "[🎙️ Boliye...]");

      convStep = STEP_GET_PROBLEM;
      delay(200);
      if (recordVoice(MAX_REC_SECS)) {
        String t = sendAudioForSTT();
        if (t.length() > 0) runConversationStep(t);
        else {
          speakText((activeLang == "mr") ? "Prashna aaikayala aale nahi, punha bola." : "Aapka sawal sunai nahi diya, kripya dobara boliye.", activeLang);
          convStep = STEP_ASK_PROBLEM;
          delay(200);
          runConversationStep("");
        }
      }
      break;
    }

    // ------------------------------------------------------------------------
    // STEP 8: DISPLAY USER QUERY ON SCREEN & PROCESS WITH GEMINI AI
    // ------------------------------------------------------------------------
    case STEP_GET_PROBLEM: {
      if (vi.length() < 3) {
        speakText((activeLang == "mr") ? "Prashna spashta nahi aala, punha bola." : "Sawal samajh nahi aaya, kripya dobara boliye.", activeLang);
        convStep = STEP_ASK_PROBLEM;
        delay(200);
        runConversationStep("");
        break;
      }

      userProblem = voiceInput;
      String dispProblem = (sttDisplayText.length() > 0) ? sttDisplayText : userProblem;

      // Crucial: DISPLAY WHAT THE CITIZEN ASKED ON THE SCREEN!
      showScreenCard("AAPNE PUCHA:",
                     dispProblem,
                     "[⏳ Soch raha hai...]");

      String th = (activeLang == "mr") ? "Ek minute, mi uttar shodhat ahe." :
                  (activeLang == "en") ? "One moment, finding the best answer for you." :
                                         "Ek minute, main aapka jawab dhundh rahi hoon.";
      speakText(th, activeLang);

      String ctx = "User: " + userName + ". Phone: " + userPhone + ". Location: " + cfg_location + ". Device: " + cfg_devid + ". "
                 + "Respond ONLY in language: " + activeLang + ". "
                 + "Keep answer SHORT (3-5 bullet points) suitable for voice reading and OLED screen. "
                 + "Focus on government schemes relevant to location: " + cfg_location;

      String ans = sendChatMessage(userProblem, ctx);
      if (ans.length() == 0) {
        ans = (activeLang == "mr") ? "Kshamasva, server kadun uttar aale nahi. Krupaya kahi velane prayatna kara." :
              (activeLang == "en") ? "Sorry, could not connect to JanSeva server. Please try again." :
                                     "Maafi, server se jawab nahi mila. Kripya thodi der baad try karein.";
      }
      lastSolution = ans;

      convStep = STEP_SPEAK_SOLUTION;
      delay(200);
      runConversationStep("");
      break;
    }

    // ------------------------------------------------------------------------
    // STEP 9: DISPLAY ANSWER ON SCREEN & SPEAK VIA PAM8403 SPEAKER
    // ------------------------------------------------------------------------
    case STEP_SPEAK_SOLUTION: {
      String dispAns = (lastScreenSummary.length() > 0) ? lastScreenSummary : lastSolution;

      // DISPLAY ANSWER ON SCREEN
      showScreenCard("JANSEVA JAWAB",
                     dispAns,
                     "[🔊 Bol raha hai...]");

      // SPEAK ANSWER VIA SPEAKER
      speakText(lastSolution, activeLang);

      convStep = STEP_ASK_MORE;
      delay(400);
      runConversationStep("");
      break;
    }

    // ------------------------------------------------------------------------
    // STEP 10: ASK IF CITIZEN NEEDS MORE HELP (OR TOUCH SENSOR CONTINUATION)
    // ------------------------------------------------------------------------
    case STEP_ASK_MORE: {
      String q = (activeLang == "mr") ? "Tumhala ajun konya yojnebaddal mahiti havi ahe ka? Haan bola kinva touch kara." :
                 (activeLang == "en") ? "Do you need more information about any other scheme? Say yes or touch sensor." :
                                        "Kya aapko kisi aur yojana ki jaankari chahiye? Haan boliye ya touch sensor dabayein.";

      showScreenCard("KUCH AUR MADAD?",
                     "Haan boliye ya\ntouch sensor dabayein\nSawal dobara puchein",
                     "[🎙️ / Touch Sensor]");

      speakText(q, activeLang);

      delay(200);
      if (recordVoice(5)) {
        String r = sendAudioForSTT();
        r.toLowerCase();
        const char* YES[] = {
          "haan", "ha", "yes", "aur", "more", "help", "kuch", "problem", "sawal", "ho", "ahe", "yojana"
        };
        const char* NO[] = {
          "nahi", "na", "no", "bye", "bas", "kahi", "nako"
        };

        if (containsAny(r, YES, 12)) {
          // Continuous session: jump straight to ask question without re-asking name/mobile!
          convStep = STEP_ASK_PROBLEM;
          runConversationStep("");
          break;
        } else if (r.length() > 5 && !containsAny(r, NO, 7)) {
          // User asked their next question directly!
          convStep = STEP_GET_PROBLEM;
          runConversationStep(r);
          break;
        }
      }

      // Citizen is done: Warm goodbye in their language!
      String bye = (activeLang == "mr") ? "Khup dhanyavad, " + userName + "! JanSeva Kendra madhe aalyabaddal aabhar. Jai Hind!" :
                   (activeLang == "en") ? "Thank you very much, " + userName + "! It was a pleasure serving you. Jai Hind!" :
                                          "Bahut dhanyawaad, " + userName + " ji! JanSeva Kendra me aane ke liye shukriya. Jai Hind!";

      showScreenCard("DHANYAWAAD!",
                     "Aapki seva karke\nkhushi hui, " + userName + " ji!\n\nJai Hind! 🇮🇳",
                     "[Session Complete]");

      speakText(bye, activeLang);

      for (int i = 0; i < 10; i++) {
        drawRobotFace(FACE_BYE, userName.substring(0, 8));
        delay(250);
      }

      convStep = STEP_IDLE;
      drawRobotFace(FACE_IDLE, cfg_location.substring(0, 9));
      break;
    }

    default:
      convStep = STEP_IDLE;
      break;
  }
}

// ============================================================================
// SERIAL COMMAND HANDLER & INTERACTIVE CONSOLE
// ============================================================================
void handleSerialCommand(String cmd) {
  cmd.trim();
  if (cmd.length() == 0) return;

  // 1. Reset WiFi / Open Setup Portal
  if (cmd.equalsIgnoreCase("reset") || cmd.equalsIgnoreCase("setup") || cmd.equalsIgnoreCase("portal") || cmd.equalsIgnoreCase("r")) {
    Serial.println("[CMD] Reset command received! Clearing WiFi and restarting...");
    prefs.clear();
    showScreenCard("WIFI RESET", "Clearing settings...\nStarting portal.", "[Resetting]");
    delay(800);
    ESP.restart();
    return;
  }

  // 2. Microphone live diagnostic & VU meter
  if (cmd.equalsIgnoreCase("mic") || cmd.equalsIgnoreCase("mic test") || cmd.equalsIgnoreCase("m")) {
    runMicDiagnostic();
    return;
  }

  // 3. Audio speaker chime test
  if (cmd.equalsIgnoreCase("audio") || cmd.equalsIgnoreCase("speaker") || cmd.equalsIgnoreCase("chime")) {
    Serial.println("[CMD] Playing test sound through PAM8403 speaker...");
    for (int f = 0; f < 200; f++) {
      dacWrite(PIN_AUDIO_DAC, (f % 16 < 8) ? 200 : 50);
      delayMicroseconds(500);
    }
    delay(50);
    for (int f = 0; f < 250; f++) {
      dacWrite(PIN_AUDIO_DAC, (f % 12 < 6) ? 210 : 45);
      delayMicroseconds(375);
    }
    dacWrite(PIN_AUDIO_DAC, 0);
    Serial.println("[CMD] Audio chime complete!");
    return;
  }

  // 4. Change Server URL (e.g. "server https://janseva-kiosk-live.loca.lt" or "server http://10.111.125.210:3000")
  if (cmd.startsWith("server ") || cmd.startsWith("url ")) {
    int spaceIdx = cmd.indexOf(' ');
    String newUrl = cmd.substring(spaceIdx + 1);
    newUrl.trim();
    if (newUrl.length() > 0) {
      if (newUrl.endsWith("/")) newUrl = newUrl.substring(0, newUrl.length() - 1);
      cfg_server = newUrl;
      prefs.putString("server", cfg_server);
      Serial.println("[CMD] Server URL updated to: " + cfg_server);
      testServerConnection();
      return;
    }
  }

  // 5. Ping / Test Server Connection
  if (cmd.equalsIgnoreCase("ping") || cmd.equalsIgnoreCase("test") || cmd.equalsIgnoreCase("status") || cmd.equalsIgnoreCase("server")) {
    testServerConnection();
    return;
  }

  // 6. Device Info (WiFi, IP, Server URL, RSSI, Heap)
  if (cmd.equalsIgnoreCase("info") || cmd.equalsIgnoreCase("ip")) {
    Serial.println("\n==========================================");
    Serial.println("[DEVICE INFO]");
    Serial.println("  WiFi SSID:   " + cfg_ssid);
    Serial.println("  ESP32 IP:    " + WiFi.localIP().toString());
    Serial.println("  Server URL:  " + cfg_server);
    Serial.println("  Device ID:   " + cfg_devid);
    Serial.println("  Location:    " + cfg_location);
    Serial.println("  Signal RSSI: " + String(WiFi.RSSI()) + " dBm");
    Serial.println("  Free Heap:   " + String(ESP.getFreeHeap()) + " bytes");
    Serial.println("==========================================\n");
    return;
  }

  // 7. Wake up conversation (identical to touching TTP223 sensor)
  if (cmd.equalsIgnoreCase("start") || cmd.equalsIgnoreCase("touch") || cmd.equalsIgnoreCase("wake") || cmd.equalsIgnoreCase("hi") || cmd.equalsIgnoreCase("namaste")) {
    Serial.println("[CMD] Wake up command received via Serial! Starting kiosk...");
    playTone(784, 80); delay(20); playTone(1046, 120);
    resetConversation();
    convStep = STEP_GREET;
    runConversationStep("");
    return;
  }

  // 8. If kiosk is in active conversation, feed this typed string as the answer to the current step!
  if (convStep != STEP_IDLE) {
    Serial.println("[CMD] Answer received for current step: " + cmd);
    sttDisplayText = cmd;
    runConversationStep(cmd);
    return;
  }

  // 9. Direct citizen question from idle (e.g. user typed "PM Kisan Yojana")
  Serial.println("[CMD] Direct question received: " + cmd);
  playTone(880, 80);
  resetConversation();
  userName = "Citizen";
  userPhone = "9999999999";
  convStep = STEP_GET_PROBLEM;
  runConversationStep(cmd);
}

// ============================================================================
// TEST SERVER CONNECTION
// ============================================================================
void testServerConnection() {
  Serial.println("\n[SERVER TEST] Testing connection to: " + cfg_server + "/api/health");
  showScreenCard("SERVER TEST", "Checking server:\n" + cfg_server.substring(0, 20) + "...\nWait...", "[Testing Server]");

  HTTPClient http;
  http.begin(cfg_server + "/api/health");
  http.addHeader("Bypass-Tunnel-Reminder", "true");
  http.addHeader("User-Agent", "ESP32-JanSeva/2.0");
  http.setTimeout(7000);

  int code = http.GET();
  Serial.printf("[SERVER TEST] HTTP Response: %d\n", code);
  if (code == 200) {
    String body = http.getString();
    Serial.println("[SERVER TEST] SUCCESS! Server is online and responsive.");
    Serial.println("[SERVER TEST] Response payload: " + body);
    showScreenCard("SERVER ONLINE!", "Server connected!\nStatus: 200 OK\nReady to chat.", "[Server OK]");
  } else {
    Serial.printf("[SERVER TEST] FAILED with HTTP code: %d\n", code);
    if (code == -1) {
      Serial.println("[SERVER TEST] HTTP -1 = Connection Refused / Unreachable.");
      Serial.println("  -> If using local IP, Windows Defender Firewall may block port 3000.");
      Serial.println("  -> Or your Wi-Fi router has Client Isolation turned on.");
      Serial.println("  -> EASY FIX: Type this in Serial Monitor:");
      Serial.println("     server https://janseva-kiosk-live.loca.lt");
    }
    showScreenCard("SERVER FAILED", "Connection error: " + String(code) + "\nType in Serial:\nserver <url>", "[Conn Error]");
  }
  http.end();
  delay(2000);
  drawRobotFace(FACE_IDLE, cfg_location.substring(0, 9));
}

// ============================================================================
// MICROPHONE LIVE DIAGNOSTIC & VU METER
// ============================================================================
void runMicDiagnostic() {
  Serial.println("\n==========================================");
  Serial.println("[MIC DIAGNOSTIC] Testing INMP441 Microphone (5s)...");
  Serial.println("Speak into the mic or tap it now!");
  Serial.println("==========================================");

  showScreenCard("MIC DIAGNOSTIC", "Testing Mic (5s)...\nSpeak or tap mic\nCheck Serial Mon.", "[Testing Mic]");

  unsigned long start = millis();
  int overallMax = 0;
  size_t bytesRead = 0;
  uint8_t tmp[512];

  while (millis() - start < 5000) {
    int winMax = 0;
    for (int b = 0; b < 4; b++) {
      i2s_read(I2S_MIC_PORT, tmp, sizeof(tmp), &bytesRead, 20 / portTICK_PERIOD_MS);
      if (bytesRead > 0) {
        int16_t* s16 = (int16_t*)tmp;
        int count = bytesRead / 2;
        for (int i = 0; i < count; i++) {
          int a = abs(s16[i]);
          if (a > winMax) winMax = a;
        }
      }
    }
    if (winMax > overallMax) overallMax = winMax;

    // Print visual bar
    int bars = min(winMax / 150, 25);
    Serial.printf("[MIC LEVEL] Amp: %5d | ", winMax);
    for (int i = 0; i < bars; i++) Serial.print("#");
    for (int i = bars; i < 25; i++) Serial.print(".");
    if (winMax > 200) Serial.println(" (SOUND DETECTED!)");
    else Serial.println(" (silence)");
    delay(150);
  }

  Serial.println("------------------------------------------");
  Serial.printf("[MIC RESULT] Peak Amplitude: %d\n", overallMax);
  if (overallMax > 200) {
    Serial.println("[MIC RESULT] SUCCESS! Microphone is working and receiving audio.");
    showScreenCard("MIC TEST: OK!", "Microphone works!\nAudio detected.\nPeak: " + String(overallMax), "[Test Passed]");
  } else {
    Serial.println("[MIC RESULT] FAILED: Audio is near 0 / silence!");
    Serial.println("[MIC RESULT] Troubleshooting checklist:");
    Serial.println("  1. Connect INMP441 L/R pin to GND (CRITICAL!)");
    Serial.println("  2. Connect VDD to 3.3V and GND to GND");
    Serial.println("  3. Connect SD to GPIO 32");
    Serial.println("  4. Connect WS to GPIO 15");
    Serial.println("  5. Connect SCK to GPIO 14");
    showScreenCard("MIC: SILENT!", "No audio detected!\nCheck L/R pin -> GND\nSD:32, WS:15, SCK:14", "[Check Wiring]");
  }
  Serial.println("==========================================\n");
  delay(2000);
  drawRobotFace(FACE_IDLE, cfg_location.substring(0, 9));
}

// ============================================================================
// CAPTIVE PORTAL
// ============================================================================
void handlePortalRedirect() {
  portalServer.sendHeader("Location", "http://192.168.4.1/", true);
  portalServer.send(302, "text/plain", "");
}

void startPortal() {
  portalActive = true;

  Serial.println("\n==========================================");
  Serial.println("[PORTAL] Starting WiFi Hotspot Setup Mode...");
  Serial.println("==========================================");

  // 1. Reset WiFi radio
  WiFi.disconnect(true, true);
  WiFi.mode(WIFI_OFF);
  delay(200);

  // 2. Set AP mode and disable radio sleep
  WiFi.mode(WIFI_AP);
  WiFi.setSleep(false);
  delay(100);

  // 3. Configure IP BEFORE starting softAP (MANDATORY on ESP32)
  IPAddress apIP(192, 168, 4, 1);
  IPAddress netMsk(255, 255, 255, 0);
  WiFi.softAPConfig(apIP, apIP, netMsk);
  delay(100);

  // 4. Start Open Hotspot (No password - pass only AP_NAME)
  bool apStarted = WiFi.softAP(AP_NAME);
  delay(500);

  IPAddress assignedIP = WiFi.softAPIP();
  Serial.println("[PORTAL] AP Status:    " + String(apStarted ? "ACTIVE (Broadcasting)" : "FAILED"));
  Serial.println("[PORTAL] Hotspot SSID: " + String(AP_NAME));
  Serial.println("[PORTAL] IP Address:   " + assignedIP.toString());
  Serial.println("[PORTAL] -> Look for WiFi 'JANSEVA_SETUP' on your phone");
  Serial.println("[PORTAL] -> Connect to it and open: http://192.168.4.1");
  Serial.println("==========================================\n");

  // 5. DNS Captive Redirect
  dnsServer.setErrorReplyCode(DNSReplyCode::NoError);
  dnsServer.start(53, "*", apIP);

  // 6. Web Routes
  portalServer.on("/",                  HTTP_GET,  handlePortalRoot);
  portalServer.on("/save",              HTTP_POST, handlePortalSave);
  portalServer.on("/generate_204",                 handlePortalRedirect);
  portalServer.on("/gen_204",                      handlePortalRedirect);
  portalServer.on("/hotspot-detect.html",          handlePortalRoot);
  portalServer.on("/ncsi.txt",                     handlePortalRoot);
  portalServer.onNotFound(handlePortalRedirect);
  portalServer.begin();

  // Attention chime for first wake up WiFi setup prompt
  playTone(500, 150);
  delay(50);
  playTone(400, 150);
  delay(50);
  playTone(600, 250);

  showScreenCard("WIFI SETUP MODE",
                 "Connect Phone to WiFi:\nJANSEVA_SETUP\n\nOpen Browser:\n192.168.4.1",
                 "[Hotspot Active]");
}

void handlePortalRoot() {
  String html = "<!DOCTYPE html><html><head>"
    "<meta charset='UTF-8'><meta name='viewport' content='width=device-width,initial-scale=1'>"
    "<title>JANSEVA.AI Setup</title>"
    "<style>"
    "*{box-sizing:border-box;margin:0;padding:0}"
    "body{font-family:'Segoe UI',Arial,sans-serif;background:linear-gradient(135deg,#0B1F3A,#0f2d4a);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}"
    ".card{background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.15);padding:28px 24px;border-radius:16px;max-width:420px;width:100%}"
    ".logo{font-size:26px;font-weight:900;color:#FF9933;margin-bottom:4px}"
    ".sub{font-size:12px;color:#94a3b8;margin-bottom:20px}"
    ".sec{background:rgba(255,255,255,0.04);border-radius:10px;padding:16px;margin-bottom:14px;border:1px solid rgba(255,255,255,0.08)}"
    ".sec-title{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#FF9933;margin-bottom:10px;font-weight:700}"
    "label{display:block;font-size:12px;color:#cbd5e1;margin-bottom:3px;margin-top:10px}"
    "label:first-of-type{margin-top:0}"
    "input,select{width:100%;padding:10px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:#071322;color:#fff;font-size:13px;outline:none}"
    ".hint{font-size:10px;color:#64748b;margin-top:3px}"
    "button{width:100%;padding:13px;margin-top:18px;background:linear-gradient(135deg,#FF9933,#e8860a);border:none;border-radius:10px;color:#0B1F3A;font-weight:800;font-size:15px;cursor:pointer}"
    ".flag{display:flex;gap:4px;margin-bottom:14px}"
    ".flag span{height:4px;border-radius:3px;flex:1}"
    ".f1{background:#FF9933}.f2{background:#fff}.f3{background:#138808}"
    ".info{background:rgba(255,153,51,0.08);border:1px solid rgba(255,153,51,0.2);padding:10px;border-radius:8px;font-size:11px;color:#fed7aa;line-height:1.7;margin-bottom:14px}"
    "</style></head><body><div class='card'>"
    "<div class='flag'><span class='f1'></span><span class='f2'></span><span class='f3'></span></div>"
    "<div class='logo'>JANSEVA.AI</div>"
    "<div class='sub'>ESP32 Smart Citizen Kiosk Setup</div>"
    "<div class='info'>Step 1: Connect to WiFi: <b>JANSEVA_SETUP</b><br>Step 2: Fill this form & Save</div>"
    "<form method='POST' action='/save'>"
    "<div class='sec'><div class='sec-title'>Home WiFi</div>"
    "<label>WiFi SSID (Network Name)</label><input name='ssid' value='" + cfg_ssid + "' placeholder='Your Home WiFi' required>"
    "<label>WiFi Password</label><input name='pass' type='password' placeholder='Leave blank if open'></div>"
    "<div class='sec'><div class='sec-title'>Server & Device</div>"
    "<label>JANSEVA Server URL</label><input name='server' value='" + cfg_server + "' placeholder='http://10.111.125.210:3000' required>"
    "<div class='hint'>Your PC IP on WiFi: 10.111.125.210:3000</div>"
    "<label>Device ID</label><input name='devid' value='" + cfg_devid + "' placeholder='JANSEVA-ESP32-1' required></div>"
    "<div class='sec'><div class='sec-title'>Location & Language</div>"
    "<label>Location (State / District / Block)</label><input name='location' value='" + cfg_location + "' placeholder='Maharashtra / Pune / Haveli' required>"
    "<div class='hint'>Used for location-specific government scheme answers</div>"
    "<label>Default Language</label><select name='deflang'>"
    "<option value='hi'>Hindi</option><option value='en'>English</option>"
    "<option value='mr'>Marathi</option><option value='gu'>Gujarati</option>"
    "<option value='ta'>Tamil</option><option value='te'>Telugu</option>"
    "<option value='bn'>Bengali</option><option value='pa'>Punjabi</option>"
    "<option value='kn'>Kannada</option><option value='ml'>Malayalam</option>"
    "<option value='ur'>Urdu</option></select></div>"
    "<button type='submit'>Save & Connect</button>"
    "</form></div></body></html>";
  portalServer.send(200, "text/html", html);
}

void handlePortalSave() {
  cfg_ssid     = portalServer.arg("ssid");
  cfg_pass     = portalServer.arg("pass");
  cfg_server   = portalServer.arg("server");
  cfg_devid    = portalServer.arg("devid");
  cfg_location = portalServer.arg("location");
  cfg_lang     = portalServer.arg("deflang");
  if(cfg_lang.length()==0) cfg_lang="hi";

  prefs.putString("ssid",     cfg_ssid);
  prefs.putString("pass",     cfg_pass);
  prefs.putString("server",   cfg_server);
  prefs.putString("devid",    cfg_devid);
  prefs.putString("location", cfg_location);
  prefs.putString("deflang",  cfg_lang);

  String html = "<!DOCTYPE html><html><head><style>body{font-family:Arial;background:#0B1F3A;color:#fff;text-align:center;padding:40px}</style></head>"
    "<body><h2 style='color:#FF9933'>Settings Saved!</h2>"
    "<p>WiFi: <b>" + cfg_ssid + "</b></p>"
    "<p>Device: <b>" + cfg_devid + "</b> at " + cfg_location + "</p>"
    "<p style='color:#94a3b8;margin-top:20px'>Restarting now... Reconnect to your home WiFi.</p></body></html>";
  portalServer.send(200, "text/html", html);
  showOLED("Saved! Restarting", cfg_ssid, cfg_devid, "");
  delay(1500);
  ESP.restart();
}

// ============================================================================
// UTILITY: Check if haystack contains any needle word
// ============================================================================
bool containsAny(String haystack, const char* needles[], int count) {
  for(int i=0;i<count;i++) if(haystack.indexOf(needles[i])>=0) return true;
  return false;
}
