/**
 * JANSEVA.AI — Hardware Device Management Service
 * Manages ESP32 AI kiosk / hardware nodes.
 * Stores device registration, live status (online/offline), IP addresses, and activity logs.
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const STORAGE_FILE = path.join(__dirname, '..', '..', '.devices.json');
const HEARTBEAT_TIMEOUT_MS = 60000; // 60s to consider device offline

// In-memory cache
let devices = new Map();

/**
 * Load devices from persistent JSON file.
 */
function loadDevices() {
  try {
    if (fs.existsSync(STORAGE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf8'));
      devices.clear();
      data.forEach(dev => devices.set(dev.id, dev));
    }
  } catch (err) {
    console.warn('⚠️ Could not load .devices.json, starting with empty store:', err.message);
  }
}

/**
 * Save devices to persistent JSON file.
 */
function saveDevices() {
  try {
    const list = Array.from(devices.values());
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (err) {
    console.warn('⚠️ Could not save .devices.json:', err.message);
  }
}

// Initialize on load
loadDevices();

/**
 * Register a new hardware device.
 * @param {object} params { name, location }
 * @returns {object} device info with ID and auth token
 */
function registerDevice({ name, location = 'Jan Seva Kendra' }) {
  const shortId = 'JANSEVA-' + Math.random().toString(36).substring(2, 7).toUpperCase();
  const token = 'KEY_' + uuidv4().replace(/-/g, '');

  const device = {
    id: shortId,
    name: name || `ESP32 Kiosk (${shortId})`,
    location: location || 'Main Counter',
    token,
    ip: null,
    rssi: null,
    freeHeap: null,
    status: 'offline',
    registeredAt: new Date().toISOString(),
    lastSeen: null,
    logs: [
      { timestamp: new Date().toISOString(), message: 'Device registered in JANSEVA.AI system' }
    ],
  };

  devices.set(shortId, device);
  saveDevices();
  return device;
}

/**
 * List all devices with computed online/offline status.
 */
function listDevices() {
  const now = Date.now();
  return Array.from(devices.values()).map(dev => {
    const isOnline = dev.lastSeen && (now - new Date(dev.lastSeen).getTime() < HEARTBEAT_TIMEOUT_MS);
    return {
      ...dev,
      status: isOnline ? 'online' : 'offline',
    };
  });
}

/**
 * Get device by ID.
 */
function getDevice(deviceId) {
  if (!deviceId) return null;
  const dev = devices.get(deviceId.toUpperCase()) || devices.get(deviceId);
  if (!dev) return null;

  const now = Date.now();
  const isOnline = dev.lastSeen && (now - new Date(dev.lastSeen).getTime() < HEARTBEAT_TIMEOUT_MS);
  return {
    ...dev,
    status: isOnline ? 'online' : 'offline',
  };
}

/**
 * Delete a device.
 */
function deleteDevice(deviceId) {
  const deleted = devices.delete(deviceId.toUpperCase()) || devices.delete(deviceId);
  if (deleted) saveDevices();
  return deleted;
}

/**
 * Update device heartbeat from ESP32.
 */
function recordHeartbeat(deviceId, { ip, rssi, freeHeap } = {}) {
  let dev = devices.get(deviceId.toUpperCase()) || devices.get(deviceId);
  if (!dev) {
    // Auto-register discovered device
    dev = registerDevice({ name: `ESP32 Node (${deviceId})` });
    dev.id = deviceId.toUpperCase();
    devices.set(dev.id, dev);
  }

  dev.ip = ip || dev.ip;
  dev.rssi = rssi || dev.rssi;
  dev.freeHeap = freeHeap || dev.freeHeap;
  dev.lastSeen = new Date().toISOString();
  dev.status = 'online';

  saveDevices();
  return dev;
}

/**
 * Log activity from device.
 */
function logActivity(deviceId, message) {
  let dev = devices.get(deviceId.toUpperCase()) || devices.get(deviceId);
  if (!dev) {
    dev = registerDevice({ name: `ESP32 Kiosk (${deviceId})` });
    dev.id = deviceId.toUpperCase();
    devices.set(dev.id, dev);
  }

  if (!dev.logs) dev.logs = [];
  dev.logs.unshift({
    timestamp: new Date().toISOString(),
    message,
  });

  // Keep last 30 logs
  if (dev.logs.length > 30) dev.logs.pop();
  saveDevices();
}

module.exports = {
  registerDevice,
  listDevices,
  getDevice,
  deleteDevice,
  recordHeartbeat,
  logActivity,
};
