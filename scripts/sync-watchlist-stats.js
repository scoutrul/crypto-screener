const fs = require('fs').promises;
const path = require('path');
const PendingAnomaliesStatsUpdater = require('./update-pending-anomalies-stats');

/**
 * Утилита для синхронизации статистики watchlist с trading-statistics.json
 */
class WatchlistStatsSync {
  constructor() {
    this.pendingAnomaliesFile = path.join(__dirname, '..', 'data', 'pending-anomalies.json');
    this.tradingStatsFile = path.join(__dirname, '..', 'data', 'trading-statistics.json');
    this.statsUpdater = new PendingAnomaliesStatsUpdater();
  }

  /**
   * Загрузить trading statistics
   */
  async loadTradingStats() {
    try {
      const data = await fs.readFile(this.tradingStatsFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('❌ Ошибка загрузки trading statistics:', error.message);
      return null;
    }
  }

  /**
   * Сохранить trading statistics
   */
  async saveTradingStats(stats) {
    try {
      await fs.writeFile(this.tradingStatsFile, JSON.stringify(stats, null, 2));
      console.log('✅ Trading statistics обновлены');
    } catch (error) {
      console.error('❌ Ошибка сохранения trading statistics:', error.message);
    }
  }

  /**
   * Получить актуальную статистику watchlist
   */
  async getWatchlistStats() {
    try {
      return await this.statsUpdater.getCurrentStats();
    } catch (error) {
      console.error('❌ Ошибка получения статистики watchlist:', error.message);
      return null;
    }
  }

  /**
   * Синхронизировать статистику watchlist с trading statistics
   */
  async syncWatchlistStats() {
    try {
      console.log('🔄 Синхронизация статистики watchlist...');
      
      // Получить актуальную статистику watchlist
      const watchlistStats = await this.getWatchlistStats();
      if (!watchlistStats) {
        console.log('❌ Не удалось получить статистику watchlist');
        return;
      }

      // Загрузить trading statistics
      const tradingStats = await this.loadTradingStats();
      if (!tradingStats) {
        console.log('❌ Не удалось загрузить trading statistics');
        return;
      }

      // Обновить watchlist статистику
      tradingStats.watchlistStats = {
        sessionStartTime: watchlistStats.sessionStartTime,
        lastUpdated: watchlistStats.lastUpdated,
        totalAnomaliesProcessed: watchlistStats.totalAnomaliesProcessed,
        currentAnomaliesCount: watchlistStats.currentAnomaliesCount,
        convertedToTrades: watchlistStats.convertedToTrades,
        removedFromWatchlist: watchlistStats.removedFromWatchlist,
        averageVolumeLeverage: watchlistStats.averageVolumeLeverage,
        averageWatchlistTimeMinutes: watchlistStats.averageWatchlistTimeMinutes,
        longAnomaliesCount: watchlistStats.longAnomaliesCount,
        shortAnomaliesCount: watchlistStats.shortAnomaliesCount,
        consolidatedAnomaliesCount: watchlistStats.consolidatedAnomaliesCount,
        unconsolidatedAnomaliesCount: watchlistStats.unconsolidatedAnomaliesCount,
        topVolumeLeverages: watchlistStats.topVolumeLeverages,
        conversionRate: watchlistStats.conversionRate,
        sessionDurationMinutes: watchlistStats.sessionDurationMinutes
      };

      // Обновить lastUpdated
      tradingStats.lastUpdated = new Date().toISOString();

      // Сохранить обновленные trading statistics
      await this.saveTradingStats(tradingStats);
      
      console.log('✅ Статистика watchlist синхронизирована');
      return tradingStats;
    } catch (error) {
      console.error('❌ Ошибка синхронизации:', error.message);
    }
  }

  /**
   * Показать текущую статистику
   */
  async showCurrentStats() {
    try {
      const tradingStats = await this.loadTradingStats();
      if (!tradingStats) {
        console.log('❌ Не удалось загрузить trading statistics');
        return;
      }

      const watchlistStats = tradingStats.watchlistStats;
      if (!watchlistStats) {
        console.log('❌ Статистика watchlist не найдена в trading statistics');
        return;
      }

      console.log('📊 СТАТИСТИКА WATCHLIST (из trading-statistics.json):\n');
      console.log(`🕐 Начало сессии: ${new Date(watchlistStats.sessionStartTime).toLocaleString('ru-RU')}`);
      console.log(`🔄 Последнее обновление: ${new Date(watchlistStats.lastUpdated).toLocaleString('ru-RU')}`);
      console.log(`⏱️ Длительность сессии: ${watchlistStats.sessionDurationMinutes} мин\n`);
      
      console.log(`📈 ОБЩАЯ СТАТИСТИКА:`);
      console.log(`   📊 Всего обработано: ${watchlistStats.totalAnomaliesProcessed}`);
      console.log(`   📋 Текущих в watchlist: ${watchlistStats.currentAnomaliesCount}`);
      console.log(`   ✅ Конвертировано в сделки: ${watchlistStats.convertedToTrades}`);
      console.log(`   ❌ Удалено из watchlist: ${watchlistStats.removedFromWatchlist}\n`);
      
      console.log(`📊 РАСПРЕДЕЛЕНИЕ:`);
      console.log(`   🟢 Long: ${watchlistStats.longAnomaliesCount}`);
      console.log(`   🔴 Short: ${watchlistStats.shortAnomaliesCount}`);
      console.log(`   ✅ Консолидированные: ${watchlistStats.consolidatedAnomaliesCount}`);
      console.log(`   ⏳ Не консолидированные: ${watchlistStats.unconsolidatedAnomaliesCount}\n`);
      
      console.log(`📈 МЕТРИКИ:`);
      console.log(`   📊 Средний leverage: ${watchlistStats.averageVolumeLeverage}x`);
      console.log(`   ⏱️ Среднее время в watchlist: ${watchlistStats.averageWatchlistTimeMinutes} мин`);
      console.log(`   📈 Конверсия: ${watchlistStats.conversionRate}%\n`);
      
      if (watchlistStats.topVolumeLeverages && watchlistStats.topVolumeLeverages.length > 0) {
        console.log(`🏆 ТОП LEVERAGE:`);
        watchlistStats.topVolumeLeverages.forEach((leverage, index) => {
          console.log(`   ${index + 1}. ${leverage.toFixed(1)}x`);
        });
      }
    } catch (error) {
      console.error('❌ Ошибка отображения статистики:', error.message);
    }
  }

  /**
   * Автоматическая синхронизация при изменениях
   */
  async autoSync() {
    try {
      await this.syncWatchlistStats();
      console.log('✅ Автоматическая синхронизация завершена');
    } catch (error) {
      console.error('❌ Ошибка автоматической синхронизации:', error.message);
    }
  }
}

// Экспорт для использования в других модулях
module.exports = WatchlistStatsSync;

// Запуск утилиты
if (require.main === module) {
  const sync = new WatchlistStatsSync();
  
  const args = process.argv.slice(2);
  const command = args[0];
  
  switch (command) {
    case 'sync':
      sync.syncWatchlistStats();
      break;
    case 'show':
      sync.showCurrentStats();
      break;
    case 'auto':
      sync.autoSync();
      break;
    default:
      console.log('📊 Утилита синхронизации статистики watchlist\n');
      console.log('Команды:');
      console.log('  node scripts/sync-watchlist-stats.js sync - Синхронизировать статистику');
      console.log('  node scripts/sync-watchlist-stats.js show - Показать статистику');
      console.log('  node scripts/sync-watchlist-stats.js auto - Автоматическая синхронизация');
      break;
  }
} 