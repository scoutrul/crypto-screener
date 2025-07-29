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
        message += `   ${index + 1}. ${trade.symbol} ${emoji} (${trade.type})\n`;
        message += `      💰 Вход: $${trade.entryPrice.toFixed(6)}\n`;
        message += `      🛑 Стоп: $${trade.stopLoss.toFixed(6)}\n`;
        message += `      🎯 Тейк: $${trade.takeProfit.toFixed(6)}\n`;
        message += `      ⏱️ Время: ${formatDuration(duration)} назад\n\n`;
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
      
      // Последние 5 сделок
      const recentTrades = tradeHistory.slice(-5).reverse();
      message += `   ПОСЛЕДНИЕ 5 СДЕЛОК:\n`;
      recentTrades.forEach((trade, index) => {
        const profitLossText = trade.profitLoss >= 0 ? `+${trade.profitLoss.toFixed(2)}%` : `${trade.profitLoss.toFixed(2)}%`;
        const emoji = trade.profitLoss >= 0 ? '🟢' : '🔴';
        const duration = Math.round(trade.duration / 1000 / 60);
        message += `   ${index + 1}. ${trade.symbol} ${emoji} ${profitLossText} (${formatDuration(duration)})\n`;
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
    
    message += `📊 ТОРГОВАЯ СТАТИСТИКА:\n`;
    message += `   🎯 Общий винрейт: ${tradingStats.winRate.toFixed(1)}%\n`;
    message += `   💰 Общая прибыль: ${tradingStats.totalProfit.toFixed(2)}%\n`;
    message += `   📈 Лучшая сделка: +${tradingStats.bestTrade.toFixed(2)}%\n`;
    message += `   📉 Худшая сделка: ${tradingStats.worstTrade.toFixed(2)}%\n`;
    message += `   ⏱️ Среднее время: ${formatDuration(Math.round(tradingStats.averageDuration / 1000 / 60))}\n\n`;
  } catch (error) {
    message += `📊 ТОРГОВАЯ СТАТИСТИКА: Файл не найден\n\n`;
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

    // Создание и отправка сообщения
    const message = await createSystemStatusMessage();
    await notificationRepository.sendTelegramMessage(message);
    
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