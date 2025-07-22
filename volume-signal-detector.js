// volume-signal-detector.js
const ccxt = require('ccxt');
const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');

// Инициализация
const exchange = new ccxt.binance();
const bot = new TelegramBot(config.telegram.botToken);

// Настройки из конфига
const symbols = config.monitoring.symbols;
const thresholds = config.thresholds;
const checkInterval = config.monitoring.checkIntervalMinutes;

// Преобразование таймфрейма в миллисекунды
const timeframeToMs = {
  '1m': 60000,
  '5m': 300000,
  '15m': 900000,
  '30m': 1800000,
  '1h': 3600000,
  '4h': 14400000,
  '8h': 28800000,
  '16h': 57600000,
};

// Функция отправки сообщения в Telegram
async function sendTelegramMessage(message) {
  if (process.env.NODE_ENV === 'development') {
    console.log('🟡 [DEV] Сообщение (только консоль, не отправлено в Telegram):\n' + message);
    return;
  }
  try {
    await bot.sendMessage(config.telegram.chatId, message, { parse_mode: 'HTML' });
    console.log('✅ Сообщение отправлено в Telegram');
  } catch (error) {
    console.error('❌ Ошибка отправки в Telegram:', error.message);
  }
}

// Форматирование числа
function formatNumber(num) {
  return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

// Главная логика
async function checkVolumes() {
  console.log(`🔍 Проверка объёмов в ${new Date().toLocaleString('ru-RU')}`);
  
  for (const symbol of symbols) {
    for (const tf of Object.keys(thresholds)) {
      try {
        const { window, percent } = thresholds[tf];
        const tfMs = timeframeToMs[tf];
        const windowMs = timeframeToMs[window];
        const limit = Math.ceil(windowMs / tfMs) + 1;

        const candles = await exchange.fetchOHLCV(symbol, tf, undefined, limit);
        if (candles.length < limit) {
          console.log(`⚠️  Недостаточно данных для ${symbol} [${tf}]`);
          continue;
        }

        const volumes = candles.map(c => c[5]);
        const currentVolume = volumes[volumes.length - 1];
        const historicalVolumes = volumes.slice(0, -1);
        const avgHistoricalVolume = historicalVolumes.reduce((a, b) => a + b, 0) / historicalVolumes.length;
        
        // Расчёт процента превышения
        const exceedPercent = ((currentVolume / avgHistoricalVolume) - 1) * 100;
        
        if (currentVolume > avgHistoricalVolume * (1 + percent / 100)) {
          const price = candles[candles.length - 1][4]; // Цена закрытия
          
          const message = `
🚨 <b>ОБЪЁМНАЯ АНОМАЛИЯ ОБНАРУЖЕНА</b>

📊 <b>Пара:</b> ${symbol}
⏰ <b>Таймфрейм:</b> ${tf}
💰 <b>Цена:</b> $${formatNumber(price)}

📈 <b>Объём:</b>
• Текущий (${tf}): ${formatNumber(currentVolume)}
• Средний (${window}): ${formatNumber(avgHistoricalVolume)}
• Превышение: <b>+${exceedPercent.toFixed(1)}%</b>

🎯 <b>Порог:</b> ${percent}%
🕐 <b>Время:</b> ${new Date().toLocaleString('ru-RU')}
          `.trim();
          
          console.log(`🚨 Аномалия обнаружена для ${symbol} [${tf}]`);
          console.log(`Превышение: +${exceedPercent.toFixed(1)}%`);
          
          await sendTelegramMessage(message);
        }
        
        // Логирование для отладки
        console.log(`✅ ${symbol} [${tf}]: ${formatNumber(currentVolume)} vs ${formatNumber(avgHistoricalVolume)} (${exceedPercent.toFixed(1)}%)`);
        
      } catch (err) {
        console.error(`❌ Ошибка проверки ${symbol} [${tf}]:`, err.message);
      }
    }
  }
  
  console.log('---\n');
}

// Запуск
console.log('🚀 Запуск детектора объёмных сигналов...');
console.log(`📊 Мониторинг: ${symbols.join(', ')}`);
console.log(`⏱️  Интервал проверки: ${checkInterval} минут`);
console.log(`📱 Telegram: настроен`);
console.log('---\n');

// Первоначальная проверка
checkVolumes();

// Запуск по расписанию
setInterval(checkVolumes, checkInterval * 60 * 1000);
