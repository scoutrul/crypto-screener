const fs = require('fs').promises;
const path = require('path');

/**
 * Утилита для обновления мета-статистики в pending-anomalies.json
 */
class PendingAnomaliesStatsUpdater {
  constructor() {
    this.filePath = path.join(__dirname, '..', 'data', 'pending-anomalies.json');
  }

  /**
   * Загрузить данные
   */
  async loadData() {
    try {
      const data = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(data);
      
      // Проверить структуру файла
      if (parsed.meta && parsed.anomalies) {
        return parsed;
      } else if (Array.isArray(parsed)) {
        // Старая структура - конвертировать в новую
        return this.convertToNewStructure(parsed);
      } else {
        throw new Error('Неизвестная структура файла');
      }
    } catch (error) {
      console.error('❌ Ошибка загрузки данных:', error.message);
      return this.createNewStructure();
    }
  }

  /**
   * Конвертировать старую структуру в новую
   */
  convertToNewStructure(anomalies) {
    const now = new Date().toISOString();
    const sessionStartTime = anomalies.length > 0 
      ? anomalies[0].watchlistTime 
      : now;

    return {
      meta: {
        sessionStats: this.calculateSessionStats(anomalies, sessionStartTime),
        fileInfo: {
          version: "2.0",
          description: "Pending anomalies with session statistics",
          createdAt: sessionStartTime,
          lastModified: now
        }
      },
      anomalies: anomalies
    };
  }

  /**
   * Создать новую структуру
   */
  createNewStructure() {
    const now = new Date().toISOString();
    return {
      meta: {
        sessionStats: {
          sessionStartTime: now,
          lastUpdated: now,
          totalAnomaliesProcessed: 0,
          currentAnomaliesCount: 0,
          convertedToTrades: 0,
          removedFromWatchlist: 0,
          averageVolumeLeverage: 0,
          averageWatchlistTimeMinutes: 0,
          longAnomaliesCount: 0,
          shortAnomaliesCount: 0,
          consolidatedAnomaliesCount: 0,
          unconsolidatedAnomaliesCount: 0,
          topVolumeLeverages: [],
          conversionRate: 0.0,
          sessionDurationMinutes: 0
        },
        fileInfo: {
          version: "2.0",
          description: "Pending anomalies with session statistics",
          createdAt: now,
          lastModified: now
        }
      },
      anomalies: []
    };
  }

  /**
   * Рассчитать статистику сессии
   */
  calculateSessionStats(anomalies, sessionStartTime) {
    const now = new Date();
    const sessionStart = new Date(sessionStartTime);
    const sessionDurationMinutes = Math.floor((now - sessionStart) / (1000 * 60));

    // Базовые счетчики
    const longAnomalies = anomalies.filter(a => a.tradeType === 'Long');
    const shortAnomalies = anomalies.filter(a => a.tradeType === 'Short');
    const consolidatedAnomalies = anomalies.filter(a => a.isConsolidated === true);
    const unconsolidatedAnomalies = anomalies.filter(a => a.isConsolidated === false);

    // Статистика по объемам
    const volumeLeverages = anomalies.map(a => a.volumeLeverage).filter(v => v && v > 0);
    const averageVolumeLeverage = volumeLeverages.length > 0 
      ? (volumeLeverages.reduce((sum, v) => sum + v, 0) / volumeLeverages.length).toFixed(1)
      : 0;

    // Время в watchlist
    const watchlistTimes = anomalies.map(anomaly => {
      const watchlistTime = new Date(anomaly.watchlistTime);
      return Math.floor((now - watchlistTime) / (1000 * 60));
    });
    
    const averageWatchlistTimeMinutes = watchlistTimes.length > 0
      ? Math.floor(watchlistTimes.reduce((sum, time) => sum + time, 0) / watchlistTimes.length)
      : 0;

    // Топ leverage
    const topVolumeLeverages = volumeLeverages
      .sort((a, b) => b - a)
      .slice(0, 5);

    return {
      sessionStartTime: sessionStartTime,
      lastUpdated: now.toISOString(),
      totalAnomaliesProcessed: anomalies.length,
      currentAnomaliesCount: anomalies.length,
      convertedToTrades: 0, // Будет обновляться извне
      removedFromWatchlist: 0, // Будет обновляться извне
      averageVolumeLeverage: parseFloat(averageVolumeLeverage),
      averageWatchlistTimeMinutes: averageWatchlistTimeMinutes,
      longAnomaliesCount: longAnomalies.length,
      shortAnomaliesCount: shortAnomalies.length,
      consolidatedAnomaliesCount: consolidatedAnomalies.length,
      unconsolidatedAnomaliesCount: unconsolidatedAnomalies.length,
      topVolumeLeverages: topVolumeLeverages,
      conversionRate: 0.0, // Будет обновляться извне
      sessionDurationMinutes: sessionDurationMinutes
    };
  }

  /**
   * Обновить статистику
   */
  async updateStats(additionalStats = {}) {
    try {
      const data = await this.loadData();
      
      // Обновить мета-статистику
      const newSessionStats = {
        ...data.meta.sessionStats,
        ...additionalStats,
        lastUpdated: new Date().toISOString()
      };

      // Пересчитать статистику на основе текущих аномалий
      const recalculatedStats = this.calculateSessionStats(data.anomalies, data.meta.sessionStats.sessionStartTime);
      
      // Объединить с дополнительной статистикой
      data.meta.sessionStats = {
        ...recalculatedStats,
        ...additionalStats,
        lastUpdated: new Date().toISOString()
      };

      // Обновить fileInfo
      data.meta.fileInfo.lastModified = new Date().toISOString();

      // Сохранить обновленные данные
      await fs.writeFile(this.filePath, JSON.stringify(data, null, 2));
      
      console.log('✅ Мета-статистика обновлена');
      return data;
    } catch (error) {
      console.error('❌ Ошибка обновления статистики:', error.message);
      throw error;
    }
  }

  /**
   * Добавить аномалию и обновить статистику
   */
  async addAnomaly(anomaly) {
    try {
      const data = await this.loadData();
      
      // Добавить аномалию
      data.anomalies.push(anomaly);
      
      // Обновить статистику
      await this.updateStats({
        totalAnomaliesProcessed: data.meta.sessionStats.totalAnomaliesProcessed + 1
      });
      
      console.log(`✅ Аномалия ${anomaly?.symbol || 'Unknown'} добавлена`);
    } catch (error) {
      console.error('❌ Ошибка добавления аномалии:', error.message);
      throw error;
    }
  }

  /**
   * Удалить аномалию и обновить статистику
   */
  async removeAnomaly(symbol, reason = 'removed') {
    try {
      const data = await this.loadData();
      
      // Найти и удалить аномалию
      const index = data.anomalies.findIndex(a => a.symbol === symbol);
      if (index === -1) {
        throw new Error(`Аномалия ${symbol} не найдена`);
      }
      
      const removedAnomaly = data.anomalies.splice(index, 1)[0];
      
      // Обновить статистику
      const additionalStats = {
        removedFromWatchlist: data.meta.sessionStats.removedFromWatchlist + 1
      };
      
      if (reason === 'converted') {
        additionalStats.convertedToTrades = data.meta.sessionStats.convertedToTrades + 1;
      }
      
      await this.updateStats(additionalStats);
      
      console.log(`✅ Аномалия ${symbol} удалена (${reason})`);
      return removedAnomaly;
    } catch (error) {
      console.error('❌ Ошибка удаления аномалии:', error.message);
      throw error;
    }
  }

  /**
   * Получить текущую статистику
   */
  async getCurrentStats() {
    try {
      const data = await this.loadData();
      return data.meta.sessionStats;
    } catch (error) {
      console.error('❌ Ошибка получения статистики:', error.message);
      return null;
    }
  }

  /**
   * Показать текущую статистику
   */
  async showCurrentStats() {
    try {
      const stats = await this.getCurrentStats();
      if (!stats) {
        console.log('❌ Не удалось загрузить статистику');
        return;
      }

      console.log('📊 СТАТИСТИКА СЕССИИ WATCHLIST:\n');
      console.log(`🕐 Начало сессии: ${new Date(stats.sessionStartTime).toLocaleString('ru-RU')}`);
      console.log(`🔄 Последнее обновление: ${new Date(stats.lastUpdated).toLocaleString('ru-RU')}`);
      console.log(`⏱️ Длительность сессии: ${stats.sessionDurationMinutes} мин\n`);
      
      console.log(`📈 ОБЩАЯ СТАТИСТИКА:`);
      console.log(`   📊 Всего обработано: ${stats.totalAnomaliesProcessed}`);
      console.log(`   📋 Текущих в watchlist: ${stats.currentAnomaliesCount}`);
      console.log(`   ✅ Конвертировано в сделки: ${stats.convertedToTrades}`);
      console.log(`   ❌ Удалено из watchlist: ${stats.removedFromWatchlist}\n`);
      
      console.log(`📊 РАСПРЕДЕЛЕНИЕ:`);
      console.log(`   🟢 Long: ${stats.longAnomaliesCount}`);
      console.log(`   🔴 Short: ${stats.shortAnomaliesCount}`);
      console.log(`   ✅ Консолидированные: ${stats.consolidatedAnomaliesCount}`);
      console.log(`   ⏳ Не консолидированные: ${stats.unconsolidatedAnomaliesCount}\n`);
      
      console.log(`📈 МЕТРИКИ:`);
      console.log(`   📊 Средний leverage: ${stats.averageVolumeLeverage}x`);
      console.log(`   ⏱️ Среднее время в watchlist: ${stats.averageWatchlistTimeMinutes} мин`);
      console.log(`   📈 Конверсия: ${stats.conversionRate}%\n`);
      
      if (stats.topVolumeLeverages.length > 0) {
        console.log(`🏆 ТОП LEVERAGE:`);
        stats.topVolumeLeverages.forEach((leverage, index) => {
          console.log(`   ${index + 1}. ${leverage.toFixed(1)}x`);
        });
      }
    } catch (error) {
      console.error('❌ Ошибка отображения статистики:', error.message);
    }
  }
}

// Экспорт для использования в других модулях
module.exports = PendingAnomaliesStatsUpdater;

// Запуск утилиты
if (require.main === module) {
  const updater = new PendingAnomaliesStatsUpdater();
  
  const args = process.argv.slice(2);
  const command = args[0];
  
  switch (command) {
    case 'update':
      updater.updateStats();
      break;
    case 'show':
      updater.showCurrentStats();
      break;
    case 'convert':
      const symbol = args[1];
      if (symbol) {
        updater.removeAnomaly(symbol, 'converted');
      } else {
        console.log('❌ Укажите символ: node scripts/update-pending-anomalies-stats.js convert SYMBOL');
      }
      break;
    case 'remove':
      const symbolToRemove = args[1];
      if (symbolToRemove) {
        updater.removeAnomaly(symbolToRemove, 'removed');
      } else {
        console.log('❌ Укажите символ: node scripts/update-pending-anomalies-stats.js remove SYMBOL');
      }
      break;
    default:
      console.log('📊 Утилита обновления мета-статистики pending-anomalies.json\n');
      console.log('Команды:');
      console.log('  node scripts/update-pending-anomalies-stats.js update    - Обновить статистику');
      console.log('  node scripts/update-pending-anomalies-stats.js show      - Показать статистику');
      console.log('  node scripts/update-pending-anomalies-stats.js convert SYMBOL - Конвертировать в сделку');
      console.log('  node scripts/update-pending-anomalies-stats.js remove SYMBOL - Удалить из watchlist');
      break;
  }
} 