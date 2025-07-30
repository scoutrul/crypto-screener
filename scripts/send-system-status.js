/**
 * Скрипт для отправки статуса системы через Telegram
 */

const fs = require('fs').promises;
const path = require('path');
const { CryptoScreenerApp } = require('../src/app');
const messageQueue = require('./telegram-message-queue');

/**
 * Форматировать время в читаемый вид
 */
function formatDuration(minutes) {
  if (minutes < 60) {
    return `${minutes} мин`;
  } else if (minutes < 1440) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}ч ${mins}мин`;
  } else {
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    return `${days}д ${hours}ч`;
  }
}

/**
 * Разбить длинное сообщение на части для Telegram
 */
function splitMessageForTelegram(message, maxLength = 4000) {
  const parts = [];
  let currentPart = '';
  
  const lines = message.split('\n');
  
  for (const line of lines) {
    // Если добавление этой строки превысит лимит
    if (currentPart.length + line.length + 1 > maxLength) {
      if (currentPart.trim()) {
        parts.push(currentPart.trim());
      }
      currentPart = line;
    } else {
      currentPart += (currentPart ? '\n' : '') + line;
    }
  }
  
  // Добавить последнюю часть
  if (currentPart.trim()) {
    parts.push(currentPart.trim());
  }
  
  return parts;
}

/**
 * Создать сообщение о статусе системы
 */
async function createSystemStatusMessage() {
  const now = new Date().toLocaleString('ru-RU');
  let message = `📊 СТАТУС СИСТЕМЫ ВИРТУАЛЬНОЙ ТОРГОВЛИ\n\n`;
  message += `🕐 Обновлено: ${now}\n\n`;

  // Активные сделки
  try {
    const activeTradesFile = path.join(__dirname, '..', 'data', 'active-trades.json');
    const activeTradesData = await fs.readFile(activeTradesFile, 'utf8');
    const activeTrades = JSON.parse(activeTradesData);
    
    message += `📊 АКТИВНЫЕ СДЕЛКИ (${activeTrades.length}):\n`;
    if (activeTrades.length === 0) {
      message += `   Нет активных сделок\n\n`;
    } else {
      activeTrades.forEach((trade, index) => {
        const duration = Math.round((Date.now() - new Date(trade.entryTime).getTime()) / 1000 / 60);
        const emoji = trade.type === 'Long' ? '🟢' : '🔴';
        
        // Рассчитать изменение цены
        const currentPrice = trade.lastPrice || trade.entryPrice;
        const priceChange = trade.type === 'Long' 
          ? ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100
          : ((trade.entryPrice - currentPrice) / trade.entryPrice) * 100;
        const changeSign = priceChange >= 0 ? '+' : '';
        const changeEmoji = priceChange >= 0 ? '🟢' : '🔴';
        
        // Рассчитать прогресс тейк-профита по формуле: (текущая - вход)/(тейк-вход)*100
        let takeProfitProgress = 0;
        if (trade.type === 'Long') {
          takeProfitProgress = ((currentPrice - trade.entryPrice) / (trade.takeProfit - trade.entryPrice)) * 100;
        } else {
          // Для Short сделок логика обратная
          takeProfitProgress = ((trade.entryPrice - currentPrice) / (trade.entryPrice - trade.takeProfit)) * 100;
        }
        
        // Ограничить прогресс от 0 до 100%
        takeProfitProgress = Math.max(0, Math.min(100, takeProfitProgress));
        
        // Определить иконку прогресса
        const progressEmoji = takeProfitProgress > 0 ? '🟢' : '⚪';
        
        message += `   ${index + 1}. ${trade.symbol} ${emoji} (${trade.type})\n`;
        message += `      💰 Вход: $${trade.entryPrice.toFixed(6)}\n`;
        message += `      📈 Текущая: $${currentPrice.toFixed(6)} ${changeEmoji} ${changeSign}${priceChange.toFixed(2)}%\n`;
        message += `      🛑 Стоп: $${trade.stopLoss.toFixed(6)}\n`;
        message += `      🎯 Тейк: $${trade.takeProfit.toFixed(6)}\n`;
        message += `      📊 Прогресс: ${progressEmoji} ${takeProfitProgress.toFixed(0)}%\n`;
        message += `      ⏱️ Время: ${formatDuration(duration)} назад\n`;
        message += `      📊 Объем: ${trade.volumeIncrease ? `${trade.volumeIncrease}x` : 'N/A'}\n\n`;
      });
    }
  } catch (error) {
    message += `📊 АКТИВНЫЕ СДЕЛКИ: Файл не найден\n\n`;
  }

  // Pending anomalies
  try {
    const pendingAnomaliesFile = path.join(__dirname, '..', 'data', 'pending-anomalies.json');
    const pendingAnomaliesData = await fs.readFile(pendingAnomaliesFile, 'utf8');
    const pendingAnomalies = JSON.parse(pendingAnomaliesData);
    
    // Поддержка новой структуры (объект с meta и anomalies) и старой (массив)
    let anomalies = [];
    if (Array.isArray(pendingAnomalies)) {
      // Старая структура - массив
      anomalies = pendingAnomalies;
    } else if (pendingAnomalies.anomalies && Array.isArray(pendingAnomalies.anomalies)) {
      // Новая структура - объект с anomalies
      anomalies = pendingAnomalies.anomalies;
    }
    
    message += `⏳ PENDING ANOMALIES (${anomalies.length}):\n`;
    if (anomalies.length === 0) {
      message += `   Нет ожидающих аномалий\n\n`;
    } else {
      anomalies.forEach((anomaly, index) => {
        const timeSinceAnomaly = Math.round((Date.now() - new Date(anomaly.anomalyTime).getTime()) / 1000 / 60);
        const emoji = anomaly.tradeType === 'Long' ? '🟢' : '🔴';
        message += `   ${index + 1}. ${anomaly.symbol} ${emoji} (${anomaly.tradeType})\n`;
        message += `      💰 Цена: $${anomaly.anomalyPrice.toFixed(6)}\n`;
        message += `      📊 Объем: ${anomaly.volumeLeverage ? `${anomaly.volumeLeverage}x` : 'N/A'}\n`;
        message += `      ⏱️ Время: ${formatDuration(timeSinceAnomaly)} назад\n\n`;
      });
    }
  } catch (error) {
    message += `⏳ PENDING ANOMALIES: Файл не найден\n\n`;
  }

  // История сделок
  try {
    const tradeHistoryFile = path.join(__dirname, '..', 'data', 'trade-history.json');
    const tradeHistoryData = await fs.readFile(tradeHistoryFile, 'utf8');
    const tradeHistory = JSON.parse(tradeHistoryData);
    
    message += `📈 ИСТОРИЯ СДЕЛОК (${tradeHistory.length}):\n`;
    if (tradeHistory.length === 0) {
      message += `   История сделок пуста\n\n`;
    } else {
      const winningTrades = tradeHistory.filter(t => t.profitLoss > 0).length;
      const totalProfit = tradeHistory.reduce((sum, t) => sum + t.profitLoss, 0);
      const winRate = (winningTrades / tradeHistory.length * 100).toFixed(1);
      const avgProfit = (totalProfit / tradeHistory.length).toFixed(2);
      
      message += `   🎯 Винрейт: ${winRate}% (${winningTrades}/${tradeHistory.length})\n`;
      message += `   💰 Общая прибыль: ${totalProfit.toFixed(2)}%\n`;
      message += `   📊 Средняя прибыль: ${avgProfit}%\n\n`;
      
      // Последние 10 сделок
      const recentTrades = tradeHistory.slice(-10).reverse();
      message += `   ПОСЛЕДНИЕ 10 СДЕЛОК:\n`;
      recentTrades.forEach((trade, index) => {
        const profitLossText = trade.profitLoss >= 0 ? `+${trade.profitLoss.toFixed(2)}%` : `${trade.profitLoss.toFixed(2)}%`;
        const emoji = trade.profitLoss >= 0 ? '🟢' : '🔴';
        const duration = Math.round(trade.duration / 1000 / 60);
        const typeEmoji = trade.type === 'Long' ? '🟢' : '🔴';
        message += `   ${index + 1}. ${trade.symbol} ${emoji} ${profitLossText} (${trade.type} ${typeEmoji}) - ${formatDuration(duration)}\n`;
      });
      message += `\n`;
    }
  } catch (error) {
    message += `📈 ИСТОРИЯ СДЕЛОК: Файл не найден\n\n`;
  }

  // Торговая статистика
  try {
    const tradingStatsFile = path.join(__dirname, '..', 'data', 'trading-statistics.json');
    const tradingStatsData = await fs.readFile(tradingStatsFile, 'utf8');
    const tradingStats = JSON.parse(tradingStatsData);
    
    // Рассчитать среднее время сделок
    let averageDuration = 0;
    if (tradingStats.totalTrades > 0) {
      const totalDuration = tradingStats.totalTrades * (tradingStats.averageProfit || 0);
      averageDuration = Math.round(totalDuration / 1000 / 60);
    }
    
    message += `📊 ТОРГОВАЯ СТАТИСТИКА:\n`;
    message += `   🎯 Общий винрейт: ${tradingStats.winRate.toFixed(1)}%\n`;
    message += `   💰 Общая прибыль: ${tradingStats.totalProfit.toFixed(2)}%\n`;
    message += `   ⏱️ Среднее время: ${formatDuration(averageDuration)}\n\n`;
  } catch (error) {
    message += `📊 ТОРГОВАЯ СТАТИСТИКА: Файл не найден\n\n`;
  }

  // Расширенная статистика сигналов
  try {
    const pendingAnomaliesFile = path.join(__dirname, '..', 'data', 'pending-anomalies.json');
    const pendingAnomaliesData = await fs.readFile(pendingAnomaliesFile, 'utf8');
    const pendingAnomalies = JSON.parse(pendingAnomaliesData);
    
    const tradeHistoryFile = path.join(__dirname, '..', 'data', 'trade-history.json');
    const tradeHistoryData = await fs.readFile(tradeHistoryFile, 'utf8');
    const tradeHistory = JSON.parse(tradeHistoryData);
    
    const activeTradesFile = path.join(__dirname, '..', 'data', 'active-trades.json');
    const activeTradesData = await fs.readFile(activeTradesFile, 'utf8');
    const activeTrades = JSON.parse(activeTradesData);

    // Поддержка новой структуры (объект с meta и anomalies) и старой (массив)
    let anomalies = [];
    if (Array.isArray(pendingAnomalies)) {
      // Старая структура - массив
      anomalies = pendingAnomalies;
    } else if (pendingAnomalies.anomalies && Array.isArray(pendingAnomalies.anomalies)) {
      // Новая структура - объект с anomalies
      anomalies = pendingAnomalies.anomalies;
    }

    const longInWatchlist = anomalies.filter(a => a.tradeType === 'Long').length;
    const shortInWatchlist = anomalies.filter(a => a.tradeType === 'Short').length;
    
    const volumeLeverages = anomalies
      .filter(a => a.volumeLeverage)
      .map(a => a.volumeLeverage);
    
    const avgLeverage = volumeLeverages.length > 0 
      ? (volumeLeverages.reduce((sum, v) => sum + v, 0) / volumeLeverages.length).toFixed(1)
      : '0.0';
    
    const maxLeverage = volumeLeverages.length > 0 
      ? Math.max(...volumeLeverages).toFixed(1)
      : '0.0';
    
    const tradesFromWatchlist = activeTrades.filter(t => t.anomalyId).length;
    const totalActiveTrades = activeTrades.length;
    const conversionRate = totalActiveTrades > 0 
      ? ((tradesFromWatchlist / totalActiveTrades) * 100).toFixed(1)
      : '0.0';
    
    message += `📊 СТАТИСТИКА СИГНАЛОВ:\n`;
    message += `   📋 В watchlist: ${anomalies.length} (Long: ${longInWatchlist}, Short: ${shortInWatchlist})\n`;
    message += `   📊 Средний leverage: ${avgLeverage}x (макс: ${maxLeverage}x)\n`;
    message += `   🎯 Конверсия в сделки: ${conversionRate}% (${tradesFromWatchlist}/${totalActiveTrades})\n`;
    message += `   📈 Всего сделок: ${tradeHistory.length + totalActiveTrades}\n`;
    message += `   ⏱️ Активных сделок: ${totalActiveTrades}\n\n`;
  } catch (error) {
    message += `📊 СТАТИСТИКА СИГНАЛОВ: Данные недоступны\n\n`;
  }

  // Статистика сигналов
  try {
    const signalStatsFile = path.join(__dirname, '..', 'data', 'signal-statistics.json');
    const signalStatsData = await fs.readFile(signalStatsFile, 'utf8');
    const signalStats = JSON.parse(signalStatsData);
    
    message += `📊 СТАТИСТИКА СИГНАЛОВ:\n`;
    message += `   📈 Всего лидов: ${signalStats.totalLeads}\n`;
    message += `   ✅ Конвертировано в сделки: ${signalStats.convertedToTrade}\n`;
    message += `   ⏱️ Среднее время жизни лида: ${signalStats.averageLeadLifetimeMinutes} мин\n`;
    
    if (signalStats.totalLeads > 0) {
      const conversionRate = ((signalStats.convertedToTrade / signalStats.totalLeads) * 100).toFixed(1);
      message += `   📊 Конверсия: ${conversionRate}%\n`;
    }
    message += `\n`;
  } catch (error) {
    message += `📊 СТАТИСТИКА СИГНАЛОВ: Файл не найден\n\n`;
  }

  // Статистика watchlist из trading-statistics.json
  try {
    const tradingStatsFile = path.join(__dirname, '..', 'data', 'trading-statistics.json');
    const tradingStatsData = await fs.readFile(tradingStatsFile, 'utf8');
    const tradingStats = JSON.parse(tradingStatsData);
    
    if (tradingStats.watchlistStats) {
      const ws = tradingStats.watchlistStats;
      message += `📋 СТАТИСТИКА WATCHLIST:\n`;
      message += `   📊 Всего обработано: ${ws.totalAnomaliesProcessed}\n`;
      message += `   📋 Текущих в watchlist: ${ws.currentAnomaliesCount}\n`;
      message += `   ✅ Конвертировано в сделки: ${ws.convertedToTrades}\n`;
      message += `   ❌ Удалено из watchlist: ${ws.removedFromWatchlist}\n`;
      message += `   📊 Средний leverage: ${ws.averageVolumeLeverage}x\n`;
      message += `   ⏱️ Среднее время в watchlist: ${ws.averageWatchlistTimeMinutes} мин\n`;
      message += `   🟢 Long: ${ws.longAnomaliesCount} | 🔴 Short: ${ws.shortAnomaliesCount}\n`;
      message += `   ✅ Консолидированные: ${ws.consolidatedAnomaliesCount} | ⏳ Не консолидированные: ${ws.unconsolidatedAnomaliesCount}\n`;
      message += `   📈 Конверсия: ${ws.conversionRate}%\n\n`;
    } else {
      message += `📋 СТАТИСТИКА WATCHLIST: Не найдена\n\n`;
    }
  } catch (error) {
    message += `📋 СТАТИСТИКА WATCHLIST: Файл не найден\n\n`;
  }

  message += `🔗 Crypto Screener v2.0`;
  
  return message;
}

/**
 * Отправить статус системы в Telegram
 */
async function sendSystemStatus() {
  try {
    console.log('📤 Отправка статуса системы в Telegram...');
    
    // Инициализация приложения
    const app = new CryptoScreenerApp();
    await app.start();
    
    // Создание сообщения
    const message = await createSystemStatusMessage();
    
    // Получить chat ID из переменных окружения
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!chatId) {
      console.error('❌ TELEGRAM_CHAT_ID не найден в переменных окружения');
      return;
    }
    
    // Разбить сообщение на части, если оно слишком длинное
    const messageParts = splitMessageForTelegram(message);
    
    if (messageParts.length > 1) {
      console.log(`📤 Отправка ${messageParts.length} частей сообщения...`);
      
      for (let i = 0; i < messageParts.length; i++) {
        const part = messageParts[i];
        const partNumber = i + 1;
        const totalParts = messageParts.length;
        
        const partMessage = part.replace(
          '📊 СТАТУС СИСТЕМЫ ВИРТУАЛЬНОЙ ТОРГОВЛИ',
          `📊 СТАТУС СИСТЕМЫ ВИРТУАЛЬНОЙ ТОРГОВЛИ (Часть ${partNumber}/${totalParts})`
        );
        
        await messageQueue.addMessage(chatId, partMessage);
        
        // Небольшая задержка между отправками
        if (i < messageParts.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    } else {
      // Отправить как одно сообщение
      await messageQueue.addMessage(chatId, message);
    }
    
    console.log('✅ Статус системы отправлен в Telegram');
  } catch (error) {
    console.error('❌ Ошибка отправки статуса:', error.message);
  }
}

/**
 * Основная функция
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'send';

  console.log('🚀 System Status Sender');
  console.log('========================\n');

  switch (command) {
    case 'send':
      await sendSystemStatus();
      break;
      
    case 'preview':
      console.log('📋 Предварительный просмотр сообщения:\n');
      const message = await createSystemStatusMessage();
      console.log(message);
      break;
      
    default:
      console.log('Использование:');
      console.log('  node scripts/send-system-status.js [команда]');
      console.log('');
      console.log('Команды:');
      console.log('  send    - Отправить статус в Telegram');
      console.log('  preview - Показать сообщение в консоли');
      console.log('');
      console.log('Примеры:');
      console.log('  node scripts/send-system-status.js send');
      console.log('  node scripts/send-system-status.js preview');
  }
}

// Запустить скрипт
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Критическая ошибка:', error.message);
    process.exit(1);
  });
}

module.exports = {
  sendSystemStatus,
  createSystemStatusMessage
}; 