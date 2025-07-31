/**
 * Сервис для управления уведомлениями о многоуровневой торговле
 */
const TelegramNotificationRepository = require('../../infrastructure/repositories/TelegramNotificationRepository');

class MultiLevelNotificationService {
  constructor(config) {
    this.config = config;
    this.notificationRepository = new TelegramNotificationRepository();
    this.globalStatistics = {
      totalTrades: 0,
      totalLevelsExecuted: 0,
      totalVolume: 0,
      totalProfit: 0,
      totalCommission: 0,
      totalNetProfit: 0,
      levelStatistics: {
        level1: { executed: 0, totalProfit: 0, totalCommission: 0 },
        level2: { executed: 0, totalProfit: 0, totalCommission: 0 },
        level3: { executed: 0, totalProfit: 0, totalCommission: 0 },
        level4: { executed: 0, totalProfit: 0, totalCommission: 0 }
      },
      tradeTypes: {
        Long: { total: 0, profitable: 0, totalProfit: 0 },
        Short: { total: 0, profitable: 0, totalProfit: 0 }
      },
      dailyStats: {}
    };
  }

  /**
   * Отправить уведомление о выполнении уровня
   */
  async sendLevelExecutedNotification(trade, executedLevel) {
    const message = this.createLevelExecutedMessage(trade, executedLevel);
    
    // Отправить в Telegram
    await this.notificationRepository.sendTelegramMessage(message);
    
    // Обновить статистику
    this.updateGlobalStatistics(trade, executedLevel);
    
    // Отправить обновлённую общую статистику
    await this.sendGlobalStatisticsUpdate();
  }

  /**
   * Создать сообщение о выполнении уровня
   */
  createLevelExecutedMessage(trade, executedLevel) {
    const emoji = trade.type === 'Long' ? '📈' : '📉';
    const profitEmoji = executedLevel.profitLoss >= 0 ? '🟢' : '🔴';
    const profitText = executedLevel.profitLoss >= 0 ? 
      `+$${executedLevel.profitLoss.toFixed(2)}` : 
      `-$${Math.abs(executedLevel.profitLoss).toFixed(2)}`;
    
    const currentDay = new Date().toLocaleDateString('ru-RU');
    const currentTime = new Date().toLocaleTimeString('ru-RU');

    return `🎯 УРОВЕНЬ ВЫПОЛНЕН ${emoji}

📊 СДЕЛКА: ${trade.symbol}
🆔 ID: ${trade.anomalyId || trade.id || 'N/A'}
📅 Дата: ${currentDay} ${currentTime}

🎯 УРОВЕНЬ ${executedLevel.levelNumber}:
💰 Объём: $${executedLevel.volumeAmount.toFixed(2)}
🎯 Целевая цена: $${executedLevel.targetPrice.toFixed(6)}
💰 Цена выполнения: $${executedLevel.executionPrice.toFixed(6)}
${profitEmoji} Прибыль: ${profitText} (${executedLevel.profitLossPercent.toFixed(2)}%)
💸 Комиссия: $${executedLevel.commission.toFixed(2)}

📈 ПРОГРЕСС СДЕЛКИ:
${this.createLevelsProgressText(trade)}

📊 ОБЩАЯ СТАТИСТИКА СИСТЕМЫ:
${this.createGlobalStatisticsText()}`;
  }

  /**
   * Создать текст прогресса уровней
   */
  createLevelsProgressText(trade) {
    if (!trade.tradeLevels) return 'Нет данных об уровнях';

    const totalLevels = trade.tradeLevels.length;
    const executedLevels = trade.tradeLevels.filter(level => level.isExecuted).length;
    const progressPercent = (executedLevels / totalLevels * 100).toFixed(0);

    let progressText = `Прогресс: ${progressPercent}% (${executedLevels}/${totalLevels})\n\n`;
    
    trade.tradeLevels.forEach((level, index) => {
      const status = level.isExecuted ? '✅' : '⏳';
      const profitText = level.isExecuted ? 
        (level.profitLoss >= 0 ? `+$${level.profitLoss.toFixed(2)}` : `-$${Math.abs(level.profitLoss).toFixed(2)}`) : 
        '—';
      
      progressText += `${status} Уровень ${level.levelNumber}: $${level.volumeAmount.toFixed(0)} → $${level.targetPrice.toFixed(6)}\n`;
      if (level.isExecuted) {
        progressText += `   💰 Прибыль: ${profitText} (${level.profitLossPercent.toFixed(2)}%)\n`;
        progressText += `   💸 Комиссия: $${level.commission.toFixed(2)}\n`;
      }
      progressText += '\n';
    });

    return progressText;
  }

  /**
   * Создать текст общей статистики
   */
  createGlobalStatisticsText() {
    const stats = this.globalStatistics;
    
    return `📊 ВСЕГО СДЕЛОК: ${stats.totalTrades}
🎯 ВЫПОЛНЕНО УРОВНЕЙ: ${stats.totalLevelsExecuted}
💰 ОБЩИЙ ОБЪЁМ: $${stats.totalVolume.toFixed(2)}
💵 ОБЩАЯ ПРИБЫЛЬ: $${stats.totalProfit.toFixed(2)}
💸 ОБЩАЯ КОМИССИЯ: $${stats.totalCommission.toFixed(2)}
🟢 ЧИСТАЯ ПРИБЫЛЬ: $${stats.totalNetProfit.toFixed(2)}

📈 ПО ТИПАМ СДЕЛОК:
Long: ${stats.tradeTypes.Long.total} сделок, ${stats.tradeTypes.Long.profitable} прибыльных
Short: ${stats.tradeTypes.Short.total} сделок, ${stats.tradeTypes.Short.profitable} прибыльных

🎯 СТАТИСТИКА ПО УРОВНЯМ:
Уровень 1: ${stats.levelStatistics.level1.executed} выполнено, $${stats.levelStatistics.level1.totalProfit.toFixed(2)} прибыль
Уровень 2: ${stats.levelStatistics.level2.executed} выполнено, $${stats.levelStatistics.level2.totalProfit.toFixed(2)} прибыль
Уровень 3: ${stats.levelStatistics.level3.executed} выполнено, $${stats.levelStatistics.level3.totalProfit.toFixed(2)} прибыль
Уровень 4: ${stats.levelStatistics.level4.executed} выполнено, $${stats.levelStatistics.level4.totalProfit.toFixed(2)} прибыль`;
  }

  /**
   * Обновить глобальную статистику
   */
  updateGlobalStatistics(trade, executedLevel) {
    const stats = this.globalStatistics;
    
    // Общая статистика
    stats.totalLevelsExecuted++;
    stats.totalVolume += executedLevel.volumeAmount;
    stats.totalProfit += executedLevel.profitLoss;
    stats.totalCommission += executedLevel.commission;
    stats.totalNetProfit = stats.totalProfit - stats.totalCommission;

    // Статистика по уровням
    const levelKey = `level${executedLevel.levelNumber}`;
    if (stats.levelStatistics[levelKey]) {
      stats.levelStatistics[levelKey].executed++;
      stats.levelStatistics[levelKey].totalProfit += executedLevel.profitLoss;
      stats.levelStatistics[levelKey].totalCommission += executedLevel.commission;
    }

    // Статистика по типам сделок
    if (stats.tradeTypes[trade.type]) {
      stats.tradeTypes[trade.type].total++;
      if (executedLevel.profitLoss > 0) {
        stats.tradeTypes[trade.type].profitable++;
      }
      stats.tradeTypes[trade.type].totalProfit += executedLevel.profitLoss;
    }

    // Дневная статистика
    const currentDay = new Date().toLocaleDateString('ru-RU');
    if (!stats.dailyStats[currentDay]) {
      stats.dailyStats[currentDay] = {
        trades: 0,
        levelsExecuted: 0,
        volume: 0,
        profit: 0,
        commission: 0
      };
    }
    stats.dailyStats[currentDay].levelsExecuted++;
    stats.dailyStats[currentDay].volume += executedLevel.volumeAmount;
    stats.dailyStats[currentDay].profit += executedLevel.profitLoss;
    stats.dailyStats[currentDay].commission += executedLevel.commission;
  }

  /**
   * Отправить обновление общей статистики
   */
  async sendGlobalStatisticsUpdate() {
    const message = this.createGlobalStatisticsUpdateMessage();
    await this.notificationRepository.sendTelegramMessage(message);
  }

  /**
   * Создать сообщение обновления общей статистики
   */
  createGlobalStatisticsUpdateMessage() {
    const stats = this.globalStatistics;
    const currentTime = new Date().toLocaleTimeString('ru-RU');
    
    return `📊 ОБНОВЛЕНИЕ СТАТИСТИКИ СИСТЕМЫ
🕐 Время: ${currentTime}

${this.createGlobalStatisticsText()}

📅 СЕГОДНЯ (${new Date().toLocaleDateString('ru-RU')}):
${this.createDailyStatisticsText()}`;
  }

  /**
   * Создать текст дневной статистики
   */
  createDailyStatisticsText() {
    const currentDay = new Date().toLocaleDateString('ru-RU');
    const dayStats = this.globalStatistics.dailyStats[currentDay];
    
    if (!dayStats) {
      return 'Нет данных за сегодня';
    }

    return `🎯 Выполнено уровней: ${dayStats.levelsExecuted}
💰 Объём: $${dayStats.volume.toFixed(2)}
💵 Прибыль: $${dayStats.profit.toFixed(2)}
💸 Комиссия: $${dayStats.commission.toFixed(2)}
🟢 Чистая прибыль: $${(dayStats.profit - dayStats.commission).toFixed(2)}`;
  }

  /**
   * Отправить уведомление о завершении сделки
   */
  async sendTradeCompletedNotification(trade) {
    const message = this.createTradeCompletedMessage(trade);
    await this.notificationRepository.sendTelegramMessage(message);
  }

  /**
   * Создать сообщение о завершении сделки
   */
  createTradeCompletedMessage(trade) {
    const emoji = trade.type === 'Long' ? '📈' : '📉';
    const profitEmoji = trade.netProfit >= 0 ? '🟢' : '🔴';
    const profitText = trade.netProfit >= 0 ? 
      `+$${trade.netProfit.toFixed(2)}` : 
      `-$${Math.abs(trade.netProfit).toFixed(2)}`;

    return `🎯 СДЕЛКА ЗАВЕРШЕНА ${emoji}

📊 СДЕЛКА: ${trade.symbol}
🆔 ID: ${trade.anomalyId || trade.id || 'N/A'}
📅 Дата: ${new Date().toLocaleDateString('ru-RU')} ${new Date().toLocaleTimeString('ru-RU')}

💰 ИТОГОВЫЙ РЕЗУЛЬТАТ:
${profitEmoji} Чистая прибыль: ${profitText}
💸 Общая комиссия: $${trade.totalCommission.toFixed(2)}
🎯 Выполнено уровней: ${trade.executedLevels}/4

📈 ДЕТАЛИ ПО УРОВНЯМ:
${this.createTradeLevelsDetails(trade)}

📊 ОБЩАЯ СТАТИСТИКА СИСТЕМЫ:
${this.createGlobalStatisticsText()}`;
  }

  /**
   * Создать детали по уровням сделки
   */
  createTradeLevelsDetails(trade) {
    if (!trade.tradeLevels) return 'Нет данных об уровнях';

    let details = '';
    trade.tradeLevels.forEach(level => {
      const status = level.isExecuted ? '✅' : '❌';
      const profitText = level.isExecuted ? 
        (level.profitLoss >= 0 ? `+$${level.profitLoss.toFixed(2)}` : `-$${Math.abs(level.profitLoss).toFixed(2)}`) : 
        '—';
      
      details += `${status} Уровень ${level.levelNumber}: $${level.volumeAmount.toFixed(0)}\n`;
      if (level.isExecuted) {
        details += `   💰 Прибыль: ${profitText} (${level.profitLossPercent.toFixed(2)}%)\n`;
        details += `   💸 Комиссия: $${level.commission.toFixed(2)}\n`;
      }
      details += '\n';
    });

    return details;
  }

  /**
   * Получить глобальную статистику
   */
  getGlobalStatistics() {
    return this.globalStatistics;
  }

  /**
   * Сохранить статистику в файл
   */
  async saveStatistics() {
    const fs = require('fs').promises;
    const path = require('path');
    
    try {
      const filename = path.join(__dirname, '../../../data/multi-level-statistics.json');
      await fs.writeFile(filename, JSON.stringify(this.globalStatistics, null, 2));
      console.log('📊 Статистика многоуровневой торговли сохранена');
    } catch (error) {
      console.error('❌ Ошибка сохранения статистики:', error.message);
    }
  }

  /**
   * Загрузить статистику из файла
   */
  async loadStatistics() {
    const fs = require('fs').promises;
    const path = require('path');
    
    try {
      const filename = path.join(__dirname, '../../../data/multi-level-statistics.json');
      const data = await fs.readFile(filename, 'utf8');
      this.globalStatistics = JSON.parse(data);
      console.log('📊 Статистика многоуровневой торговли загружена');
    } catch (error) {
      console.log('📊 Статистика многоуровневой торговли не найдена, создана новая');
    }
  }
}

module.exports = { MultiLevelNotificationService }; 