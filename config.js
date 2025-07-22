// config.js
require('dotenv').config();

function requireEnv(name) {
  if (!process.env[name]) {
    throw new Error(`Не указана обязательная переменная окружения: ${name}`);
  }
  return process.env[name];
}

module.exports = {
  telegram: {
    botToken: requireEnv('TELEGRAM_BOT_TOKEN'),
    chatId: requireEnv('TELEGRAM_CHAT_ID')
  },
  monitoring: {
    symbols: requireEnv('SYMBOLS').split(','),
    checkIntervalMinutes: parseInt(requireEnv('CHECK_INTERVAL_MINUTES'))
  },
  thresholds: {
    '15m': { window: '4h', percent: 10 },
    '30m': { window: '8h', percent: 10 },
    '1h':  { window: '16h', percent: 10 },
  }
}; 