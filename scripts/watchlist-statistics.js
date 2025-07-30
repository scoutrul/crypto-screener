const fs = require('fs').promises;
const path = require('path');

/**
 * Анализатор статистики watchlist
 */
class WatchlistStatisticsAnalyzer {
  constructor() {
    this.pendingAnomaliesFile = path.join(__dirname, '..', 'data', 'pending-anomalies.json');
    this.tradeHistoryFile = path.join(__dirname, '..', 'data', 'trade-history.json');
    this.signalStatisticsFile = path.join(__dirname, '..', 'data', 'signal-statistics.json');
  }

  /**
   * Загрузить данные
   */
  async loadData() {
    try {
      const pendingData = await fs.readFile(this.pendingAnomaliesFile, 'utf8');
      const parsed = JSON.parse(pendingData);
      
      // Поддержка новой структуры (объект с meta и anomalies) и старой (массив)
      if (Array.isArray(parsed)) {
        // Старая структура - массив
        this.pendingAnomalies = parsed;
      } else if (parsed.anomalies && Array.isArray(parsed.anomalies)) {
        // Новая структура - объект с anomalies
        this.pendingAnomalies = parsed.anomalies;
      } else {
        console.log('📊 Неизвестная структура pending-anomalies.json');
        this.pendingAnomalies = [];
      }
      
      try {
        const historyData = await fs.readFile(this.tradeHistoryFile, 'utf8');
        this.tradeHistory = JSON.parse(historyData);
      } catch (error) {
        this.tradeHistory = [];
      }
      
      try {
        const signalData = await fs.readFile(this.signalStatisticsFile, 'utf8');
        this.signalStatistics = JSON.parse(signalData);
      } catch (error) {
        this.signalStatistics = { totalLeads: 0, convertedToTrade: 0, averageLeadLifetimeMinutes: 0 };
      }
      
      console.log(`📊 Загружено ${this.pendingAnomalies.length} аномалий в watchlist`);
      console.log(`📊 Загружено ${this.tradeHistory.length} исторических сделок`);
    } catch (error) {
      console.error('❌ Ошибка загрузки данных:', error.message);
      this.pendingAnomalies = [];
      this.tradeHistory = [];
      this.signalStatistics = { totalLeads: 0, convertedToTrade: 0, averageLeadLifetimeMinutes: 0 };
    }
  }

  /**
   * Получить статистику за период
   */
  getPeriodStatistics(hours = 24) {
    const now = new Date();
    const periodStart = new Date(now.getTime() - (hours * 60 * 60 * 1000));
    
    // Фильтровать аномалии за период
    const periodAnomalies = this.pendingAnomalies.filter(anomaly => {
      const watchlistTime = new Date(anomaly.watchlistTime);
      return watchlistTime >= periodStart;
    });

    // Фильтровать сделки за период
    const periodTrades = this.tradeHistory.filter(trade => {
      const tradeTime = new Date(trade.entryTime);
      return tradeTime >= periodStart;
    });

    return {
      period: `${hours}ч`,
      periodStart: periodStart.toISOString(),
      periodEnd: now.toISOString(),
      anomalies: periodAnomalies,
      trades: periodTrades
    };
  }

  /**
   * Рассчитать детальную статистику
   */
  calculateDetailedStatistics(periodData) {
    const { anomalies, trades } = periodData;
    
    // Статистика по типам аномалий
    const longAnomalies = anomalies.filter(a => a.tradeType === 'Long');
    const shortAnomalies = anomalies.filter(a => a.tradeType === 'Short');
    
    // Статистика по объемам
    const volumeLeverages = anomalies.map(a => a.volumeLeverage).filter(v => v);
    const avgVolumeLeverage = volumeLeverages.length > 0 
      ? (volumeLeverages.reduce((sum, v) => sum + v, 0) / volumeLeverages.length).toFixed(1)
      : 0;
    
    // Время в watchlist
    const watchlistTimes = anomalies.map(anomaly => {
      const watchlistTime = new Date(anomaly.watchlistTime);
      const now = new Date();
      return Math.floor((now - watchlistTime) / (1000 * 60)); // минуты
    });
    
    const avgWatchlistTime = watchlistTimes.length > 0
      ? Math.floor(watchlistTimes.reduce((sum, time) => sum + time, 0) / watchlistTimes.length)
      : 0;
    
    // Конверсия в сделки
    const convertedAnomalies = trades.filter(trade => 
      anomalies.some(anomaly => 
        anomaly.symbol === trade.symbol && 
        Math.abs(new Date(anomaly.watchlistTime) - new Date(trade.entryTime)) < 30 * 60 * 1000 // 30 минут
      )
    );
    
    const conversionRate = anomalies.length > 0 
      ? ((convertedAnomalies.length / anomalies.length) * 100).toFixed(1)
      : 0;
    
    // Статистика по сделкам
    const profitableTrades = trades.filter(trade => trade.profitPercent > 0);
    const avgProfit = trades.length > 0 
      ? (trades.reduce((sum, t) => sum + (t.profitPercent || 0), 0) / trades.length).toFixed(2)
      : 0;
    
    return {
      totalAnomalies: anomalies.length,
      longAnomalies: longAnomalies.length,
      shortAnomalies: shortAnomalies.length,
      avgVolumeLeverage: parseFloat(avgVolumeLeverage),
      avgWatchlistTimeMinutes: avgWatchlistTime,
      convertedToTrades: convertedAnomalies.length,
      conversionRate: parseFloat(conversionRate),
      totalTrades: trades.length,
      profitableTrades: profitableTrades.length,
      avgProfitPercent: parseFloat(avgProfit),
      volumeLeverages: volumeLeverages,
      watchlistTimes: watchlistTimes
    };
  }

  /**
   * Создать отчет
   */
  createReport(periodData, detailedStats) {
    const { period, periodStart, periodEnd } = periodData;
    const startTime = new Date(periodStart).toLocaleString('ru-RU');
    const endTime = new Date(periodEnd).toLocaleString('ru-RU');
    
    let report = `📊 СТАТИСТИКА WATCHLIST ЗА ${period}\n\n`;
    report += `🕐 Период: ${startTime} - ${endTime}\n\n`;
    
    // Общая статистика
    report += `📈 ОБЩАЯ СТАТИСТИКА:\n`;
    report += `   📊 Всего аномалий: ${detailedStats.totalAnomalies}\n`;
    report += `   🟢 Long: ${detailedStats.longAnomalies}\n`;
    report += `   🔴 Short: ${detailedStats.shortAnomalies}\n`;
    report += `   📈 Средний leverage: ${detailedStats.avgVolumeLeverage}x\n`;
    report += `   ⏱️ Среднее время в watchlist: ${detailedStats.avgWatchlistTimeMinutes} мин\n\n`;
    
    // Конверсия
    report += `🔄 КОНВЕРСИЯ:\n`;
    report += `   ✅ Конвертировано в сделки: ${detailedStats.convertedToTrades}\n`;
    report += `   📊 Конверсия: ${detailedStats.conversionRate}%\n\n`;
    
    // Сделки
    if (detailedStats.totalTrades > 0) {
      report += `💰 СДЕЛКИ:\n`;
      report += `   📊 Всего сделок: ${detailedStats.totalTrades}\n`;
      report += `   ✅ Прибыльных: ${detailedStats.profitableTrades}\n`;
      report += `   📈 Средняя прибыль: ${detailedStats.avgProfitPercent}%\n`;
      report += `   📊 Успешность: ${((detailedStats.profitableTrades / detailedStats.totalTrades) * 100).toFixed(1)}%\n\n`;
    }
    
    // Топ аномалий по leverage
    if (detailedStats.volumeLeverages.length > 0) {
      const sortedLeverages = detailedStats.volumeLeverages.sort((a, b) => b - a);
      report += `🏆 ТОП-5 ПО LEVERAGE:\n`;
      sortedLeverages.slice(0, 5).forEach((leverage, index) => {
        report += `   ${index + 1}. ${leverage.toFixed(1)}x\n`;
      });
      report += `\n`;
    }
    
    // Распределение времени в watchlist
    if (detailedStats.watchlistTimes.length > 0) {
      const timeRanges = {
        '0-30 мин': 0,
        '30-60 мин': 0,
        '1-2 часа': 0,
        '2+ часа': 0
      };
      
      detailedStats.watchlistTimes.forEach(time => {
        if (time <= 30) timeRanges['0-30 мин']++;
        else if (time <= 60) timeRanges['30-60 мин']++;
        else if (time <= 120) timeRanges['1-2 часа']++;
        else timeRanges['2+ часа']++;
      });
      
      report += `⏱️ РАСПРЕДЕЛЕНИЕ ВРЕМЕНИ В WATCHLIST:\n`;
      Object.entries(timeRanges).forEach(([range, count]) => {
        if (count > 0) {
          const percentage = ((count / detailedStats.watchlistTimes.length) * 100).toFixed(1);
          report += `   ${range}: ${count} (${percentage}%)\n`;
        }
      });
    }
    
    return report;
  }

  /**
   * Показать статистику за разные периоды
   */
  async showPeriodStatistics() {
    await this.loadData();
    
    const periods = [1, 6, 12, 24, 48, 168]; // 1ч, 6ч, 12ч, 24ч, 48ч, 168ч (неделя)
    
    console.log('📊 СТАТИСТИКА WATCHLIST ПО ПЕРИОДАМ:\n');
    
    for (const hours of periods) {
      const periodData = this.getPeriodStatistics(hours);
      const detailedStats = this.calculateDetailedStatistics(periodData);
      const report = this.createReport(periodData, detailedStats);
      
      console.log(report);
      console.log('─'.repeat(80));
      console.log('');
    }
  }

  /**
   * Показать текущую статистику
   */
  async showCurrentStatistics() {
    await this.loadData();
    
    const currentData = this.getPeriodStatistics(24); // Последние 24 часа
    const detailedStats = this.calculateDetailedStatistics(currentData);
    const report = this.createReport(currentData, detailedStats);
    
    console.log(report);
  }

  /**
   * Экспортировать статистику в JSON
   */
  async exportStatistics(hours = 24) {
    await this.loadData();
    
    const periodData = this.getPeriodStatistics(hours);
    const detailedStats = this.calculateDetailedStatistics(periodData);
    
    const exportData = {
      period: periodData,
      statistics: detailedStats,
      anomalies: periodData.anomalies,
      trades: periodData.trades,
      exportedAt: new Date().toISOString()
    };
    
    const filename = `watchlist-stats-${hours}h-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
    await fs.writeFile(filename, JSON.stringify(exportData, null, 2));
    
    console.log(`📁 Статистика экспортирована в ${filename}`);
    return filename;
  }
}

// Запуск анализатора
if (require.main === module) {
  const analyzer = new WatchlistStatisticsAnalyzer();
  
  const args = process.argv.slice(2);
  const command = args[0];
  
  switch (command) {
    case 'current':
      analyzer.showCurrentStatistics();
      break;
    case 'periods':
      analyzer.showPeriodStatistics();
      break;
    case 'export':
      const hours = parseInt(args[1]) || 24;
      analyzer.exportStatistics(hours);
      break;
    default:
      console.log('📊 Анализатор статистики watchlist\n');
      console.log('Команды:');
      console.log('  node scripts/watchlist-statistics.js current    - Текущая статистика (24ч)');
      console.log('  node scripts/watchlist-statistics.js periods    - Статистика по периодам');
      console.log('  node scripts/watchlist-statistics.js export [часов] - Экспорт статистики');
      break;
  }
}

module.exports = WatchlistStatisticsAnalyzer; 