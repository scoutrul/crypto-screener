/**
 * Скрипт для отправки статуса системы в Telegram
 */

const fs = require('fs').promises;
const path = require('path');

// Импорт зависимостей из чистой архитектуры
const AppConfig = require('../src/infrastructure/config/AppConfig');
const TelegramNotificationRepository = require('../src/infrastructure/repositories/TelegramNotificationRepository');

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
        
        message += `   ${index + 1}. ${trade.symbol} ${emoji} (${trade.type}) - ${formatDuration(duration)} назад\n`;
        message += `      💰 Вход: $${trade.entryPrice.toFixed(6)} → $${currentPrice.toFixed(6)} ${changeEmoji} ${changeSign}${priceChange.toFixed(2)}%\n`;
        message += `      🛑 Стоп: $${trade.stopLoss.toFixed(6)}\n`;
        message += `      🎯 Тейк: $${trade.takeProfit.toFixed(6)}\n`;
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
    
    message += `⏳ PENDING ANOMALIES (${pendingAnomalies.length}):\n`;
    if (pendingAnomalies.length === 0) {
      message += `   Нет ожидающих аномалий\n\n`;
    } else {
      pendingAnomalies.forEach((anomaly, index) => {
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
    // Получить данные о pending anomalies для статистики
    const pendingAnomaliesFile = path.join(__dirname, '..', 'data', 'pending-anomalies.json');
    const pendingAnomaliesData = await fs.readFile(pendingAnomaliesFile, 'utf8');
    const pendingAnomalies = JSON.parse(pendingAnomaliesData);
    
    // Получить историю сделок для анализа конверсии
    const tradeHistoryFile = path.join(__dirname, '..', 'data', 'trade-history.json');
    const tradeHistoryData = await fs.readFile(tradeHistoryFile, 'utf8');
    const tradeHistory = JSON.parse(tradeHistoryData);
    
    // Статистика по типам в watchlist
    const longInWatchlist = pendingAnomalies.filter(a => a.tradeType === 'Long').length;
    const shortInWatchlist = pendingAnomalies.filter(a => a.tradeType === 'Short').length;
    
    // Статистика по объемам в watchlist
    const volumeLeverages = pendingAnomalies
      .filter(a => a.volumeLeverage)
      .map(a => a.volumeLeverage);
    
    const avgLeverage = volumeLeverages.length > 0 
      ? (volumeLeverages.reduce((sum, v) => sum + v, 0) / volumeLeverages.length).toFixed(1)
      : '0.0';
    
    const maxLeverage = volumeLeverages.length > 0 
      ? Math.max(...volumeLeverages).toFixed(1)
      : '0.0';
    
    // Анализ конверсии (сколько сделок из watchlist превратились в активные)
    const activeTradesFile = path.join(__dirname, '..', 'data', 'active-trades.json');
    const activeTradesData = await fs.readFile(activeTradesFile, 'utf8');
    const activeTrades = JSON.parse(activeTradesData);
    
    // Подсчитать сделки с anomalyId (которые прошли через watchlist)
    const tradesFromWatchlist = activeTrades.filter(t => t.anomalyId).length;
    const totalActiveTrades = activeTrades.length;
    const conversionRate = totalActiveTrades > 0 
      ? ((tradesFromWatchlist / totalActiveTrades) * 100).toFixed(1)
      : '0.0';
    
    message += `📊 СТАТИСТИКА СИГНАЛОВ:\n`;
    message += `   📋 В watchlist: ${pendingAnomalies.length} (Long: ${longInWatchlist}, Short: ${shortInWatchlist})\n`;
    message += `   📊 Средний leverage: ${avgLeverage}x (макс: ${maxLeverage}x)\n`;
    message += `   🎯 Конверсия в сделки: ${conversionRate}% (${tradesFromWatchlist}/${totalActiveTrades})\n`;
    message += `   📈 Всего сделок: ${tradeHistory.length + totalActiveTrades}\n`;
    message += `   ⏱️ Активных сделок: ${totalActiveTrades}\n\n`;
  } catch (error) {
    message += `📊 СТАТИСТИКА СИГНАЛОВ: Данные недоступны\n\n`;
  }

  message += `🔗 Crypto Screener v2.0`;
  
  return message;
}

/**
 * Отправить статус в Telegram
 */
async function sendSystemStatus() {
  try {
    console.log('📤 Отправка статуса системы в Telegram...');

    // Инициализация зависимостей
    const config = new AppConfig();
    const notificationRepository = new TelegramNotificationRepository();

    // Проверка доступности Telegram
    const isAvailable = await notificationRepository.isAvailable();
    if (!isAvailable) {
      console.log('⚠️ Telegram недоступен, отправляем в консоль');
      const message = await createSystemStatusMessage();
      console.log(message);
      return;
    }

    // Создание сообщения
    const message = await createSystemStatusMessage();
    
    // Разбить сообщение на части, если оно слишком длинное
    const messageParts = splitMessageForTelegram(message);
    
    if (messageParts.length > 1) {
      console.log(`📤 Отправка ${messageParts.length} частей сообщения...`);
      
      for (let i = 0; i < messageParts.length; i++) {
        const part = messageParts[i];
        const partNumber = i + 1;
        const totalParts = messageParts.length;
        
        // Добавить номер части к заголовку
        const partMessage = part.replace(
          '📊 СТАТУС СИСТЕМЫ ВИРТУАЛЬНОЙ ТОРГОВЛИ',
          `📊 СТАТУС СИСТЕМЫ ВИРТУАЛЬНОЙ ТОРГОВЛИ (Часть ${partNumber}/${totalParts})`
        );
        
        await notificationRepository.sendTelegramMessage(partMessage);
        
        // Небольшая задержка между отправками
        if (i < messageParts.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    } else {
      // Отправить как одно сообщение
      await notificationRepository.sendTelegramMessage(message);
    }
    
    console.log('✅ Статус системы отправлен в Telegram');

  } catch (error) {
    console.error('❌ Ошибка отправки статуса:', error.message);
    
    // Fallback - показать в консоли
    try {
      const message = await createSystemStatusMessage();
      console.log('\n📋 СТАТУС СИСТЕМЫ (консоль):\n');
      console.log(message);
    } catch (fallbackError) {
      console.error('❌ Ошибка создания сообщения:', fallbackError.message);
    }
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