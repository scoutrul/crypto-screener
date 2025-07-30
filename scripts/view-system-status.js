/**
 * Скрипт для просмотра текущего состояния системы виртуальной торговли
 */

const fs = require('fs').promises;
const path = require('path');

async function viewSystemStatus() {
  try {
    console.log('🔍 СТАТУС СИСТЕМЫ ВИРТУАЛЬНОЙ ТОРГОВЛИ\n');

    // Проверить активные сделки
    try {
      const activeTradesFile = path.join(__dirname, '..', 'data', 'active-trades.json');
      const activeTradesData = await fs.readFile(activeTradesFile, 'utf8');
      const activeTrades = JSON.parse(activeTradesData);
      
      console.log(`📊 АКТИВНЫЕ СДЕЛКИ (${activeTrades.length}):`);
      if (activeTrades.length === 0) {
        console.log('   Нет активных сделок');
      } else {
        activeTrades.forEach((trade, index) => {
          const duration = Math.round((Date.now() - new Date(trade.entryTime).getTime()) / 1000 / 60);
          console.log(`   ${index + 1}. ${trade.symbol} (${trade.type})`);
          console.log(`      Вход: $${trade.entryPrice.toFixed(6)} | Время: ${duration} мин назад`);
          console.log(`      Стоп: $${trade.stopLoss.toFixed(6)} | Тейк: $${trade.takeProfit.toFixed(6)}`);
          console.log('');
        });
      }
    } catch (error) {
      console.log('📊 АКТИВНЫЕ СДЕЛКИ: Файл не найден');
    }

    // Проверить pending anomalies
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
      
      console.log(`⏳ PENDING ANOMALIES (${anomalies.length}):`);
      if (anomalies.length === 0) {
        console.log('   Нет ожидающих аномалий');
      } else {
        anomalies.forEach((anomaly, index) => {
          const timeSinceAnomaly = Math.round((Date.now() - new Date(anomaly.anomalyTime).getTime()) / 1000 / 60);
          console.log(`   ${index + 1}. ${anomaly.symbol} (${anomaly.tradeType})`);
          console.log(`      Время аномалии: ${timeSinceAnomaly} мин назад`);
          console.log(`      Цена аномалии: $${anomaly.anomalyPrice.toFixed(6)}`);
          console.log('');
        });
      }
    } catch (error) {
      console.log('⏳ PENDING ANOMALIES: Файл не найден');
    }

    // Проверить историю сделок
    try {
      const tradeHistoryFile = path.join(__dirname, '..', 'data', 'trade-history.json');
      const tradeHistoryData = await fs.readFile(tradeHistoryFile, 'utf8');
      const tradeHistory = JSON.parse(tradeHistoryData);
      
      console.log(`📈 ИСТОРИЯ СДЕЛОК (${tradeHistory.length}):`);
      if (tradeHistory.length === 0) {
        console.log('   История сделок пуста');
      } else {
        const winningTrades = tradeHistory.filter(t => t.profitLoss > 0).length;
        const totalProfit = tradeHistory.reduce((sum, t) => sum + t.profitLoss, 0);
        const winRate = (winningTrades / tradeHistory.length * 100).toFixed(1);
        
        console.log(`   Винрейт: ${winRate}% (${winningTrades}/${tradeHistory.length})`);
        console.log(`   Общая прибыль: ${totalProfit.toFixed(2)}%`);
        console.log(`   Средняя прибыль: ${(totalProfit / tradeHistory.length).toFixed(2)}%`);
        
        // Последние 5 сделок
        const recentTrades = tradeHistory.slice(-5).reverse();
        console.log('\n   ПОСЛЕДНИЕ 5 СДЕЛОК:');
        recentTrades.forEach((trade, index) => {
          const profitLossText = trade.profitLoss >= 0 ? `+${trade.profitLoss.toFixed(2)}%` : `${trade.profitLoss.toFixed(2)}%`;
          const emoji = trade.profitLoss >= 0 ? '🟢' : '🔴';
          const duration = Math.round(trade.duration / 1000 / 60);
          console.log(`   ${index + 1}. ${trade.symbol} (${trade.type}) ${emoji} ${profitLossText} - ${duration} мин`);
        });
      }
    } catch (error) {
      console.log('📈 ИСТОРИЯ СДЕЛОК: Файл не найден');
    }

    console.log('\n✅ Статус системы проверен');

  } catch (error) {
    console.error('❌ Ошибка проверки статуса:', error.message);
  }
}

if (require.main === module) {
  viewSystemStatus().catch(error => {
    console.error('❌ Критическая ошибка:', error.message);
    process.exit(1);
  });
}

module.exports = { viewSystemStatus }; 