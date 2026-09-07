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
| **ESP32 BOOT Button** | **Built-in** | **GPIO 0** | Hold 3s: Factory Reset / Short tap: Start speaking |
| **TTP223 Touch Sensor** | **VCC** | **3.3V** | 3.3V Power |
| | **GND** | **GND** | Ground |
| | **SIG** | **GPIO 33** | Touch trigger (Touch to talk / Hold 5s to reset WiFi) |
| **INMP441 I2S Mic** | **VDD** | **3.3V** | 3.3V Power |
| | **GND** | **GND** | Ground |
| | **SD** | **GPIO 32** | I2S Serial Data In |
| | **WS** | **GPIO 15** | I2S Word Select (L/R Clock) |
| | **SCK** | **GPIO 14** | I2S Serial Bit Clock |
| | **L/R** | **GND** | ⚠️ **MUST connect to GND** (selects Left audio channel) |

---

## 📡 Step 1: WiFi Setup via Captive Portal (First Wakeup)

1. On first power on (or if WiFi is not configured), the ESP32 starts an Access Point:
   - **SSID**: `JANSEVA_SETUP`
   - **Password**: None (Open network)
2. Connect your mobile phone or laptop to `JANSEVA_SETUP`.
3. An automatic captive portal will pop up. If not, open your browser and visit: **`http://192.168.4.1`**
4. Enter:
   - **Home/Office WiFi Name (SSID)** & **Password** (must be 2.4 GHz WiFi)
   - **JANSEVA Server URL**: e.g., `http://10.111.125.210:3000` (Your PC IP on WiFi)
   - **Device ID / Name**: e.g., `JANSEVA-ESP32`
   - **Location**: e.g., `Maharashtra / Pune`
   - **Language**: Hindi / Marathi / English etc.
5. Click **Save & Connect**.
6. The ESP32 will reboot, connect to your WiFi, and immediately speak:
   > *"Namaste! Mera naam JanSeva hai. Main aapki kya madad kar sakti hoon?"*

> [!TIP]
> **Ways to Factory Reset WiFi**:
> 1. **ESP32 Physical BOOT Button**: Hold the **BOOT button** on the ESP32 board for **3 seconds** (or hold it during power-on).
> 2. **TTP223 Touch Sensor**: Hold touch for **5 seconds**.
> 3. **Serial Monitor**: Type `reset` in the Arduino Serial Monitor (115200 baud).

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
1. `Adafruit SSD1306` by Adafruit (standard for 0.96" OLEDs)
2. `Adafruit GFX Library` by Adafruit
3. `ArduinoJson` (v6.x or v7.x) by Benoit Blanchon
4. *(Optional)* `Adafruit SH110X` by Adafruit (only if your 1" or 1.3" display uses the SH1106 chip)

### Flashing Steps:
1. Connect your ESP32 to your PC via USB cable.
2. Open `firmware/janseva_esp32_kiosk/janseva_esp32_kiosk.ino`.
3. Select your COM Port under **Tools $\rightarrow$ Port**.
4. Click **Upload** (➡️).

---

## 📺 OLED Troubleshooting: "Screen is showing random pixels / snow"

If your OLED screen turns on with static dots/pixels and no text:

| Cause | Why it Happens | How to Fix |
| :--- | :--- | :--- |
| **1. 1.3" or 1" SH1106 Chip** | Most 1.3" (and some 1") OLEDs use the **SH1106** driver instead of SSD1306. SSD1306 code causes garbled snow/pixels on SH1106. | In `janseva_esp32_kiosk.ino`, change line 79 to `#define USE_SH1106 1` and install **Adafruit SH110X** from Library Manager. |
| **2. Wrong I2C Address** | Display is on `0x3D` instead of `0x3C`. | The firmware now auto-scans both `0x3C` and `0x3D` on boot. Open Serial Monitor (115200 baud) to see which address is detected. |
| **3. Low Voltage on 3.3V Pin** | The onboard regulator on clone OLEDs drops 3.3V to ~2.7V, which fails to start the internal charge pump. | Move the OLED **VCC wire from 3.3V to VIN (5V)**. |
| **4. Inverted SDA/SCL Wires** | Communication cannot start. | Ensure **SDA $\rightarrow$ GPIO 21** and **SCL $\rightarrow$ GPIO 22**. |
