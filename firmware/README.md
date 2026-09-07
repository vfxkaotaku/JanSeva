# 🇮🇳 JANSEVA.AI — ESP32 Smart Citizen Kiosk Hardware Guide

This folder contains the complete firmware and setup documentation to connect an ESP32 hardware device to **JANSEVA.AI**.

Citizens can talk directly into the hardware kiosk (via microphone) and hear spoken responses (via speaker) in their native Indian language (Hindi, Marathi, Gujarati, Tamil, etc.).

---

## 🔌 Hardware Pin Connections

| Component | Component Pin | ESP32 Pin | Function / Description |
| :--- | :--- | :--- | :--- |
| **PAM8403 Audio Amp** | **VCC** | **VIN / 5V** | Power supply (5V for high volume) |
| | **GND** | **GND** | Ground |
| | **Audio IN (L/R)** | **GPIO 25** | DAC1 Channel (Analog audio output) |
| | **OUT+ / OUT−** | **Speaker +/−** | 4Ω / 8Ω 3W Speaker connections |
| **0.96" OLED (SSD1306)**| **VCC** | **3.3V** | 3.3V Power |
| | **GND** | **GND** | Ground |
| | **SCL** | **GPIO 22** | I2C Clock |
| | **SDA** | **GPIO 21** | I2C Data |
| **TTP223 Touch Sensor** | **VCC** | **3.3V** | 3.3V Power |
| | **GND** | **GND** | Ground |
| | **SIG** | **GPIO 33** | Touch trigger (Touch to talk / Hold 5s to reset WiFi) |
| **INMP441 I2S Mic** | **VDD** | **3.3V** | 3.3V Power |
| | **GND** | **GND** | Ground |
| | **SD** | **GPIO 32** | I2S Serial Data In |
| | **WS** | **GPIO 15** | I2S Word Select (L/R Clock) |
| | **SCK** | **GPIO 14** | I2S Serial Bit Clock |
| | **L/R** | **GND** | Left audio channel selection |

---

## 📡 Step 1: WiFi Setup via Captive Portal (First Wakeup)

1. On first power on (or if WiFi is not configured), the ESP32 starts an Access Point:
   - **SSID**: `JANSEVA_SETUP_AP`
   - **Password**: None (Open network)
2. Connect your mobile phone or laptop to `JANSEVA_SETUP_AP`.
3. Open your browser and visit: **`http://192.168.4.1`**
4. Enter:
   - **Home/Office WiFi Name (SSID)** & **Password**
   - **JANSEVA Server URL**: e.g., `http://192.168.1.100:3000` (Find your computer's IP using `ipconfig`)
   - **Device ID / Name**: e.g., `JANSEVA-Y1M6W`
5. Click **💾 Save & Connect**.
6. The ESP32 will reboot, connect to your WiFi, and display **"JANSEVA.AI Ready"** on the OLED display.

> [!TIP]
> **To Reset WiFi in the future**: Hold the TTP223 touch sensor for **5 seconds** continuously. The OLED will show "RESETTING WIFI" and open the captive portal again.

---

## 🎙️ Step 2: How Citizens Use the Hardware

1. Citizen touches the **TTP223 touch sensor**.
2. The OLED shows **"Listening... [🔴]"**.
3. Citizen speaks their question (e.g., *"मला शेतकऱ्यांसाठी योजना सांगा"* or *"Tell me about student scholarships"*).
4. Citizen releases touch (or after 5 seconds).
5. The OLED shows **"Contacting AI... ⏳"**.
6. Within 2–3 seconds:
   - The OLED shows the summary text.
   - The **PAM8403 amplifier and speaker speak the complete answer** in the citizen's native language!

---

## 🛠️ Flashing the Code to ESP32

### Required Software & Tools:
1. **Arduino IDE** (v2.0+ recommended)
2. ESP32 Board Package installed (`esp32` by Espressif Systems)
3. Select Board: **ESP32 Dev Module**

### Required Arduino Libraries:
Go to **Tools $\rightarrow$ Manage Libraries...** and install:
1. `Adafruit SSD1306` by Adafruit
2. `Adafruit GFX Library` by Adafruit
3. `ArduinoJson` (v6.x or v7.x) by Benoit Blanchon

### Flashing Steps:
1. Connect your ESP32 to your PC via USB cable.
2. Open `firmware/janseva_esp32_kiosk/janseva_esp32_kiosk.ino`.
3. Select your COM Port under **Tools $\rightarrow$ Port**.
4. Click **Upload** (➡️).
