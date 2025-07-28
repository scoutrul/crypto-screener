/**
 * Скрипт для просмотра статистики виртуальной торговли
 */

const fs = require('fs').promises;
const path = require('path');

async function viewStatistics() {
  try {
    const filename = path.join(__dirname, '..', 'data', 'trade-history.json');
    const data = await fs.readFile(filename, 'utf8');
    const tradeHistory = JSON.parse(data);

    if (tradeHistory.length === 0) {
      console.log('📊 История сделок пуста');
      return;
    }

    // Базовая статистика
    const totalTrades = tradeHistory.length;
    const winningTrades = tradeHistory.filter(t => t.profitLoss > 0).length;
    const losingTrades = tradeHistory.filter(t => t.profitLoss < 0).length;
    const winRate = (winningTrades / totalTrades * 100).toFixed(1);
    
    const totalProfit = tradeHistory.reduce((sum, t) => sum + t.profitLoss, 0);
    const avgProfit = (totalProfit / totalTrades).toFixed(2);

    // Статистика по типам сделок
    const longTrades = tradeHistory.filter(t => t.type === 'Long');
    const shortTrades = tradeHistory.filter(t => t.type === 'Short');
    
    const longWinRate = longTrades.length > 0 ? 
      (longTrades.filter(t => t.profitLoss > 0).length / longTrades.length * 100).toFixed(1) : 0;
    const shortWinRate = shortTrades.length > 0 ? 
      (shortTrades.filter(t => t.profitLoss > 0).length / shortTrades.length * 100).toFixed(1) : 0;

    // Статистика по времени
    const avgDuration = tradeHistory.reduce((sum, t) => sum + t.duration, 0) / totalTrades / 1000 / 60; // в минутах

    // Топ-5 прибыльных и убыточных сделок
    const profitableTrades = tradeHistory.filter(t => t.profitLoss > 0).sort((a, b) => b.profitLoss - a.profitLoss).slice(0, 5);
    const topLosingTrades = tradeHistory.filter(t => t.profitLoss < 0).sort((a, b) => a.profitLoss - b.profitLoss).slice(0, 5);

    console.log('\n' + '='.repeat(60));
    console.log('📊 СТАТИСТИКА ВИРТУАЛЬНОЙ ТОРГОВЛИ');
    console.log('='.repeat(60));

    // Общая статистика
    console.log('\n📈 ОБЩАЯ СТАТИСТИКА:');
    console.log(`📊 Всего сделок: ${totalTrades}`);
    console.log(`🟢 Прибыльных: ${winningTrades}`);
    console.log(`🔴 Убыточных: ${losingTrades}`);
    console.log(`📊 Винрейт: ${winRate}%`);
    console.log(`💰 Общая прибыль: ${totalProfit.toFixed(2)}%`);
    console.log(`📊 Средняя прибыль: ${avgProfit}%`);
    console.log(`⏰ Средняя длительность: ${avgDuration.toFixed(1)} минут`);

    // Статистика по типам
    console.log('\n📊 СТАТИСТИКА ПО ТИПАМ СДЕЛОК:');
    console.log(`📈 Long сделок: ${longTrades.length} (винрейт: ${longWinRate}%)`);
    console.log(`📉 Short сделок: ${shortTrades.length} (винрейт: ${shortWinRate}%)`);

    // Топ-5 прибыльных сделок
    if (profitableTrades.length > 0) {
      console.log('\n🏆 ТОП-5 ПРИБЫЛЬНЫХ СДЕЛОК:');
      profitableTrades.forEach((trade, index) => {
        console.log(`${index + 1}. ${trade.symbol.replace('/USDT', '')} ${trade.type}: +${trade.profitLoss.toFixed(2)}% (${Math.round(trade.duration / 1000 / 60)} мин)`);
      });
    }

    // Топ-5 убыточных сделок
    if (topLosingTrades.length > 0) {
      console.log('\n💸 ТОП-5 УБЫТОЧНЫХ СДЕЛОК:');
      topLosingTrades.forEach((trade, index) => {
        console.log(`${index + 1}. ${trade.symbol.replace('/USDT', '')} ${trade.type}: ${trade.profitLoss.toFixed(2)}% (${Math.round(trade.duration / 1000 / 60)} мин)`);
      });
    }

    // Статистика по причинам закрытия
    const takeProfitTrades = tradeHistory.filter(t => t.closeReason === 'take_profit');
    const stopLossTrades = tradeHistory.filter(t => t.closeReason === 'stop_loss');
    
    console.log('\n🎯 СТАТИСТИКА ПО ПРИЧИНАМ ЗАКРЫТИЯ:');
    console.log(`🎯 Тейк-профит: ${takeProfitTrades.length} (${(takeProfitTrades.length / totalTrades * 100).toFixed(1)}%)`);
    console.log(`🛑 Стоп-лосс: ${stopLossTrades.length} (${(stopLossTrades.length / totalTrades * 100).toFixed(1)}%)`);

    // Статистика по дням недели
    const dayStats = {};
    tradeHistory.forEach(trade => {
      const day = new Date(trade.entryTime).toLocaleDateString('en-US', { weekday: 'long' });
      if (!dayStats[day]) {
        dayStats[day] = { total: 0, profitable: 0, totalProfit: 0 };
      }
      dayStats[day].total++;
      if (trade.profitLoss > 0) dayStats[day].profitable++;
      dayStats[day].totalProfit += trade.profitLoss;
    });

    console.log('\n📅 СТАТИСТИКА ПО ДНЯМ НЕДЕЛИ:');
    Object.entries(dayStats).forEach(([day, stats]) => {
      const winRate = (stats.profitable / stats.total * 100).toFixed(1);
      const avgProfit = (stats.totalProfit / stats.total).toFixed(2);
      console.log(`${day}: ${stats.total} сделок, винрейт ${winRate}%, средняя прибыль ${avgProfit}%`);
    });

    console.log('\n' + '='.repeat(60));

  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('📊 Файл истории сделок не найден. Запустите систему виртуальной торговли для создания истории.');
    } else {
      console.error('❌ Ошибка загрузки статистики:', error.message);
    }
  }
}

if (require.main === module) {
  viewStatistics();
}

module.exports = { viewStatistics }; 