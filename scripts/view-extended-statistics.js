/**
 * Скрипт для просмотра расширенной статистики торговли
 */

const fs = require('fs').promises;
const path = require('path');

async function viewExtendedStatistics() {
  try {
    console.log('📊 РАСШИРЕННАЯ СТАТИСТИКА ТОРГОВЛИ\n');

    // Загрузить статистику
    const filename = path.join(__dirname, '..', 'data', 'trading-statistics.json');
    const data = await fs.readFile(filename, 'utf8');
    const stats = JSON.parse(data);

    console.log(`📈 ОБЩАЯ СТАТИСТИКА:`);
    console.log(`• Всего сделок: ${stats.totalTrades}`);
    console.log(`• Прибыльных: ${stats.winningTrades} 🟢`);
    console.log(`• Убыточных: ${stats.losingTrades} 🔴`);
    console.log(`• Винрейт: ${stats.winRate}%`);
    console.log(`• Общая прибыль: ${stats.totalProfit.toFixed(2)}%`);
    console.log(`• Средняя прибыль: ${stats.averageProfit}%`);

    if (stats.bestTrade) {
      console.log(`\n🏆 ЛУЧШАЯ СДЕЛКА:`);
      console.log(`• Символ: ${stats.bestTrade.symbol}`);
      console.log(`• Тип: ${stats.bestTrade.type}`);
      console.log(`• Прибыль: +${stats.bestTrade.profitLoss.toFixed(2)}%`);
      console.log(`• Дата: ${new Date(stats.bestTrade.entryTime).toLocaleString()}`);
    }

    if (stats.worstTrade) {
      console.log(`\n💀 ХУДШАЯ СДЕЛКА:`);
      console.log(`• Символ: ${stats.worstTrade.symbol}`);
      console.log(`• Тип: ${stats.worstTrade.type}`);
      console.log(`• Убыток: ${stats.worstTrade.profitLoss.toFixed(2)}%`);
      console.log(`• Дата: ${new Date(stats.worstTrade.entryTime).toLocaleString()}`);
    }

    if (stats.longestTrade) {
      console.log(`\n⏱️ САМАЯ ДЛИННАЯ СДЕЛКА:`);
      console.log(`• Символ: ${stats.longestTrade.symbol}`);
      console.log(`• Тип: ${stats.longestTrade.type}`);
      console.log(`• Длительность: ${Math.round(stats.longestTrade.duration / 1000 / 60)} минут`);
      console.log(`• Дата: ${new Date(stats.longestTrade.entryTime).toLocaleString()}`);
    }

    if (stats.shortestTrade) {
      console.log(`\n⚡ САМАЯ КОРОТКАЯ СДЕЛКА:`);
      console.log(`• Символ: ${stats.shortestTrade.symbol}`);
      console.log(`• Тип: ${stats.shortestTrade.type}`);
      console.log(`• Длительность: ${Math.round(stats.shortestTrade.duration / 1000 / 60)} минут`);
      console.log(`• Дата: ${new Date(stats.shortestTrade.entryTime).toLocaleString()}`);
    }

    console.log(`\n📅 СИСТЕМНАЯ ИНФОРМАЦИЯ:`);
    console.log(`• Дней работы: ${stats.totalDaysRunning}`);
    console.log(`• Сделок в день: ${stats.averageTradesPerDay}`);
    console.log(`• Дата запуска: ${new Date(stats.systemStartTime).toLocaleString()}`);
    console.log(`• Последнее обновление: ${new Date(stats.lastUpdated).toLocaleString()}`);

    if (stats.tradeHistory.length > 0) {
      console.log(`\n📋 ПОСЛЕДНИЕ 5 СДЕЛОК:`);
      const recentTrades = stats.tradeHistory.slice(-5).reverse();
      recentTrades.forEach((trade, index) => {
        const emoji = trade.profitLoss >= 0 ? '🟢' : '🔴';
        const profitText = trade.profitLoss >= 0 ? `+${trade.profitLoss.toFixed(2)}%` : `${trade.profitLoss.toFixed(2)}%`;
        console.log(`${index + 1}. ${trade.symbol} ${trade.type} ${emoji} ${profitText} (${Math.round(trade.duration / 1000 / 60)} мин)`);
      });
    }

    console.log(`\n✅ Статистика загружена успешно`);

  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('📊 Файл статистики не найден. Запустите систему виртуальной торговли для создания статистики.');
    } else {
      console.error('❌ Ошибка загрузки статистики:', error.message);
    }
  }
}

// Запустить просмотр статистики
viewExtendedStatistics(); 