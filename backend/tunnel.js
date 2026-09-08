const localtunnel = require('localtunnel');
const fs = require('fs');
const path = require('path');

const URL_FILE = path.join(__dirname, '..', 'tunnel_url.txt');

async function startTunnel() {
  try {
    console.log('Connecting tunnel to http://localhost:3000...');
    const tunnel = await localtunnel({ port: 3000 });

    console.log('✅ Localtunnel live at:', tunnel.url);
    fs.writeFileSync(URL_FILE, tunnel.url, 'utf-8');

    tunnel.on('close', () => {
      console.log('Tunnel closed. Reconnecting in 5s...');
      setTimeout(startTunnel, 5000);
    });

    tunnel.on('error', (err) => {
      console.error('Tunnel error:', err.message);
      try { tunnel.close(); } catch(e){}
      setTimeout(startTunnel, 5000);
    });
  } catch (err) {
    console.error('Failed to start tunnel:', err.message);
    setTimeout(startTunnel, 10000);
  }
}

startTunnel();
