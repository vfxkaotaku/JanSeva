const localtunnel = require('localtunnel');
const fs = require('fs');
const path = require('path');

const URL_FILE = path.join(__dirname, '..', 'tunnel_url.txt');

async function startTunnel() {
  try {
    const tunnel = await localtunnel({
      port: 3000,
      subdomain: 'janseva-kiosk-live'
    });

    console.log('✅ Localtunnel live at:', tunnel.url);
    fs.writeFileSync(URL_FILE, tunnel.url, 'utf-8');

    tunnel.on('close', () => {
      console.log('Tunnel closed. Reconnecting in 5s...');
      setTimeout(startTunnel, 5000);
    });

    tunnel.on('error', (err) => {
      console.error('Tunnel error:', err.message);
      tunnel.close();
    });
  } catch (err) {
    console.error('Failed to start tunnel:', err.message);
    setTimeout(startTunnel, 10000);
  }
}

startTunnel();
