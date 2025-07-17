// config.js
require('dotenv').config();

module.exports = {
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '8166427966:AAFpTC8o4PkbXo4VEb-wM5ZSxtw7GoCeYz4',
    chatId: process.env.TELEGRAM_CHAT_ID || '-4825810353'
  },
  monitoring: {
    symbols: process.env.SYMBOLS ? process.env.SYMBOLS.split(',') : ['BONK/USDT', 'PEPE/USDT', 'LDO/USDT', 'TRX/USDT', 'XLM/USDT'],
    checkIntervalMinutes: parseInt(process.env.CHECK_INTERVAL_MINUTES) || 5
  },
  thresholds: {
    '15m': { window: '4h', percent: 10 },
    '30m': { window: '8h', percent: 10 },
    '1h':  { window: '16h', percent: 10 },
  }
}; 