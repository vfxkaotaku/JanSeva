const speechService = require('./services/speechService');
const fs = require('fs');
const path = require('path');

async function main() {
  const text = 'Hii, mai hu JanSeva AI. Mujhe sarkari yojnaon ki jaankari dene ke liye banaya gaya hai.';
  const pcm16k = await speechService.generateTTSPCM(text, 'hi', '+20%');
  
  // Downsample 16kHz to 8kHz by taking every 2nd sample
  const pcm8k = [];
  for (let i = 0; i < pcm16k.length; i += 2) {
    pcm8k.push(pcm16k[i]);
  }
  
  // Trim silence & boost volume
  let start = 0;
  while (start < pcm8k.length && Math.abs(pcm8k[start] - 128) < 6) start++;
  start = Math.max(0, start - 150);

  let end = pcm8k.length - 1;
  while (end > 0 && Math.abs(pcm8k[end] - 128) < 6) end--;
  end = Math.min(pcm8k.length, end + 250);

  const activeSamples = pcm8k.slice(start, end);
  let maxDev = 0;
  activeSamples.forEach(v => {
    const dev = Math.abs(v - 128);
    if (dev > maxDev) maxDev = dev;
  });

  const gain = Math.min(1.5, 120 / (maxDev || 1));
  const finalSamples = activeSamples.map(v => {
    const centered = (v - 128) * gain;
    return Math.max(0, Math.min(255, Math.round(128 + centered)));
  });

  console.log(`Final 8kHz samples: ${finalSamples.length} (${(finalSamples.length / 1024).toFixed(1)} KB), Gain: ${gain.toFixed(2)}x`);

  let cCode = `// Auto-generated offline voice sample: "${text}"\n`;
  cCode += `#include <pgmspace.h>\n`;
  cCode += `#define EMBEDDED_VOICE_RATE 8000\n`;
  cCode += `#define EMBEDDED_VOICE_LEN ${finalSamples.length}\n\n`;
  cCode += `const uint8_t PROGMEM embedded_voice_data[] = {\n  `;

  for (let i = 0; i < finalSamples.length; i++) {
    cCode += `0x${finalSamples[i].toString(16).padStart(2, '0')},`;
    if ((i + 1) % 20 === 0) cCode += '\n  ';
  }
  cCode += `\n};\n`;

  const destDir1 = path.join(__dirname, '..', 'firmware', 'voice_commanda_janseva_test');
  const destDir2 = path.join(__dirname, '..', 'firmware', 'voice_commands_janseva_test');
  const destDir3 = path.join(__dirname, '..', 'firmware', 'janseva_esp32_kiosk');

  if (!fs.existsSync(destDir1)) fs.mkdirSync(destDir1, { recursive: true });
  if (!fs.existsSync(destDir2)) fs.mkdirSync(destDir2, { recursive: true });
  if (!fs.existsSync(destDir3)) fs.mkdirSync(destDir3, { recursive: true });

  fs.writeFileSync(path.join(destDir1, 'embedded_voice.h'), cCode);
  fs.writeFileSync(path.join(destDir2, 'embedded_voice.h'), cCode);
  fs.writeFileSync(path.join(destDir3, 'embedded_voice.h'), cCode);
  console.log('Successfully written embedded_voice.h to firmware directories!');
}

main().catch(console.error);
