const ccxt = require('ccxt');
const config = require('./config');
const { sendTelegramMessage } = require('./notifier');

const exchange = new ccxt.binance({ enableRateLimit: true });

console.log('Скрипт запущен');

function ms(timeframe) {
  const tfMap = {
    '1m': 60 * 1000,
    '5m': 5 * 60 * 1000,
    '15m': 15 * 60 * 1000,
    '30m': 30 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
    '8h': 8 * 60 * 60 * 1000,
    '16h': 16 * 60 * 60 * 1000
  };
  return tfMap[timeframe] || 60 * 1000;
}

function getMidPrice(candle) {
  return (candle[2] + candle[3]) / 2; // (high + low) / 2
}

function getPosition(anomalyCandle, high, low) {
  // Определяем, где аномалия: вверху или внизу графика
  const max = high;
  const min = low;
  const xPercent = 0.02; // 2% от диапазона, можно вынести в конфиг
  if (anomalyCandle[2] > max - (max - min) * xPercent) return 'top';
  if (anomalyCandle[3] < min + (max - min) * xPercent) return 'bottom';
  return 'middle';
}

async function fetchCandles(symbol, timeframe, since, limit = 1000) {
  return await exchange.fetchOHLCV(symbol, timeframe, since, limit);
}

function sumVolumes(candles) {
  return candles.reduce((sum, c) => sum + c[5], 0);
}

function detectVolumeSpike(currentVolume, historicalVolume, thresholdPercent) {
  return (currentVolume / historicalVolume) * 100 >= thresholdPercent;
}

function detectSetupPosition(anomalyCandle, nextCandle) {
  const middle = getMidPrice(anomalyCandle);
  const direction = nextCandle[4] > anomalyCandle[2] ? 'long' : nextCandle[4] < anomalyCandle[3] ? 'short' : null;

  const isLongConfirmed = nextCandle[4] > middle * 1.005;
  const isShortConfirmed = nextCandle[4] < middle * 0.995;

  if (direction === 'long' && isLongConfirmed) return 'long';
  if (direction === 'short' && isShortConfirmed) return 'short';
  return null;
}

const sentAlerts = new Set();

function getAlertKey(symbol, timeframe, candleTimestamp) {
  return `${symbol}_${timeframe}_${candleTimestamp}`;
}

async function checkAnomalies(symbol, timeframe, configThreshold) {
  console.log(`\n[INFO] Проверка аномалий для ${symbol} на таймфрейме ${timeframe}`);

  const now = Date.now();
  const windowMs = ms(configThreshold.window);
  const since = now - windowMs;
  
  const candles = await fetchCandles(symbol, timeframe, since);

  console.log(`[INFO] Загружено свечей: ${candles.length} (окно: ${configThreshold.window})`);

  if (candles.length < 4) {
    console.log('[WARN] Недостаточно свечей для анализа');
    return;
  }

  const latest = candles[candles.length - 3]; // аномальная свеча
  const after = candles[candles.length - 2];  // 1-я после аномальной (пока не используется)
  const next = candles[candles.length - 1];   // 2-я после аномальной
  const historical = candles.slice(0, -3);

  const alertKey = getAlertKey(symbol, timeframe, latest[0]);
  if (sentAlerts.has(alertKey)) {
    console.log(`[INFO] Сигнал для свечи ${new Date(latest[0]).toLocaleString()} уже отправлен, пропускаем.`);
    return;
  }

  const currentVolume = latest[5];
  const historicalVolumeSum = sumVolumes(historical);
  const avgHistoricalVolume = historical.length ? historicalVolumeSum / historical.length : 0;
  const exceedPercent = avgHistoricalVolume ? ((currentVolume / historicalVolumeSum) * 100 - 100) : 0;
  const percent = configThreshold.percent;

  console.log(`[INFO] Текущий объём: ${currentVolume}`);
  console.log(`[INFO] Суммарный исторический объём (${historical.length} свечей): ${historicalVolumeSum}`);
  console.log(`[INFO] Порог аномалии: ${percent}%`);
  
  if (detectVolumeSpike(currentVolume, historicalVolumeSum, percent)) {
    console.log('[ALERT] Аномалия по объёму обнаружена!');

    const highs = historical.map(c => c[2]);
    const lows = historical.map(c => c[3]);
    const max = Math.max(...highs, latest[2]);
    const min = Math.min(...lows, latest[3]);
    const position = getPosition(latest, max, min);
    
    const confirmedPosition = detectSetupPosition(latest, next);

    const tf = timeframe;
    const price = latest[4];
    const window = configThreshold.window;
    const time = new Date(latest[0]).toLocaleString('ru-RU');

    console.log(`[INFO] Позиция аномалии: ${position}`);
    console.log(`[INFO] Подтверждённый сигнал: ${confirmedPosition || 'нет подтверждения'}`);

    const reversalConfirmed = confirmedPosition !== null;

    await sendTelegramMessage({
      symbol,
      tf,
      price,
      currentVolume,
      avgHistoricalVolume,
      exceedPercent,
      percent,
      position,
      reversalConfirmed,
      window,
      time
    });

    sentAlerts.add(alertKey); // Помечаем сигнал как отправленный
  } else {
    console.log('[INFO] Аномалий по объёму не обнаружено');
  }
}

async function run() {
  for (const symbol of config.monitoring.symbols) {
    for (const [timeframe, threshold] of Object.entries(config.thresholds)) {
      try {
        await checkAnomalies(symbol, timeframe, threshold);
      } catch (e) {
        console.error(`Ошибка по ${symbol} ${timeframe}:`, e.message);
      }
    }
  }
}

setInterval(run, config.monitoring.checkIntervalMinutes * 60 * 1000);
run();
