// notifier.js

const axios = require('axios');
const config = require('./config');

const TELEGRAM_API_URL = `https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`;

function formatNumber(n) {
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function buildMessage({ symbol, tf, price, currentVolume, avgHistoricalVolume, exceedPercent, percent, position, reversalConfirmed, time, window }) {
  return `
🚨 <b>ОБЪЁМНАЯ АНОМАЛИЯ ОБНАРУЖЕНА</b>

📊 <b>Пара:</b> ${symbol}
⏰ <b>Таймфрейм:</b> ${tf}
💰 <b>Цена:</b> $${formatNumber(price)}

📈 <b>Объём:</b>
• Текущий (${tf}): ${formatNumber(currentVolume)}
• Средний (${window}): ${formatNumber(avgHistoricalVolume)}
• Превышение: <b>+${exceedPercent.toFixed(1)}%</b>

🎯 <b>Порог:</b> ${percent}%
📌 <b>Аномалия:</b> ${position === 'bottom' ? 'внизу графика (лонг-сетап)' : 'вверху графика (шорт-сетап)'}
✅ <b>Подтверждение разворота:</b> ${reversalConfirmed ? 'да, точка входа подтверждена' : 'ожидается сигнал'}

🕐 <b>Время:</b> ${time}
`.trim();
}

async function sendTelegramMessage(data) {
  const message = buildMessage(data);
  // Всегда выводим в консоль
  console.log('[ALERT]', message);
  // В dev-режиме только консоль
  if (process.env.NODE_ENV === 'development') return;
  try {
    const response = await axios.post(TELEGRAM_API_URL, {
      chat_id: config.telegram.chatId,
      text: message,
      parse_mode: 'HTML',
    });
    if (!response.data.ok) {
      console.error('Telegram API Error:', response.data);
    }
  } catch (error) {
    console.error('Failed to send Telegram message:', error.message);
  }
}

module.exports = { sendTelegramMessage };
