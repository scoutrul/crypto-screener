/**
 * Сервис многоуровневой фиксации прибыли
 * Управляет системой из 4 уровней фиксации с различными объёмами и целями
 */

const { TradeLevel } = require('../entities/TradeLevel');

class MultiLevelTradingService {
  constructor(config) {
    this.config = config;
  }

  /**
   * Создать уровни для сделки
   */
  createTradeLevels(entryPrice, tradeType, initialVolume = null) {
    const volume = initialVolume || this.config.initialVolume;
    
    // Создаём уровни с соответствующими объёмами
    const levels = [];
    
    // Уровень 1 - Вход (100% объёма)
    const level1Volume = volume;
    const level1 = new TradeLevel(1, level1Volume, entryPrice, tradeType);
    level1.getEntryPrice = () => entryPrice; // Привязываем цену входа
    levels.push(level1);
    
    // Уровень 2 - Безубыток с комиссией (20% объёма)
    const level2Volume = volume * this.config.level2VolumePercent;
    const level2TargetPrice = this.calculateLevel2TargetPrice(entryPrice, tradeType);
    const level2 = new TradeLevel(2, level2Volume, level2TargetPrice, tradeType);
    level2.getEntryPrice = () => entryPrice;
    levels.push(level2);
    
    // Уровень 3 - Фиксация прибыли (40% объёма)
    const level3Volume = volume * this.config.level3VolumePercent;
    const level3TargetPrice = this.calculateProfitTargetPrice(entryPrice, tradeType, this.config.level3TargetPercent);
    const level3 = new TradeLevel(3, level3Volume, level3TargetPrice, tradeType);
    level3.getEntryPrice = () => entryPrice;
    levels.push(level3);
    
    // Уровень 4 - Фиксация прибыли (40% объёма)
    const level4Volume = volume * this.config.level4VolumePercent;
    const level4TargetPrice = this.calculateProfitTargetPrice(entryPrice, tradeType, this.config.level4TargetPercent);
    const level4 = new TradeLevel(4, level4Volume, level4TargetPrice, tradeType);
    level4.getEntryPrice = () => entryPrice;
    levels.push(level4);
    
    return levels;
  }

  /**
   * Рассчитать целевую цену для уровня 2 (безубыток с комиссией)
   */
  calculateLevel2TargetPrice(entryPrice, tradeType) {
    // Компенсируем комиссию 0.03% * 2 (вход + выход)
    const commissionCompensation = this.config.commissionPercent * 2;
    
    if (tradeType === 'Long') {
      return entryPrice * (1 + commissionCompensation);
    } else { // Short
      return entryPrice * (1 - commissionCompensation);
    }
  }

  /**
   * Рассчитать целевую цену для уровней 3 и 4 (фиксация прибыли)
   */
  calculateProfitTargetPrice(entryPrice, tradeType, targetPercent) {
    if (tradeType === 'Long') {
      return entryPrice * (1 + targetPercent);
    } else { // Short
      return entryPrice * (1 - targetPercent);
    }
  }

  /**
   * Проверить выполнение уровней
   */
  checkLevelExecution(trade, currentPrice) {
    if (!trade.tradeLevels || !this.config.multiLevelEnabled) {
      return null;
    }

    const executedLevels = [];
    
    for (const level of trade.tradeLevels) {
      if (!level.isExecuted && level.isTargetReached(currentPrice)) {
        try {
          level.execute(currentPrice, this.config.commissionPercent);
          executedLevels.push(level);
          console.log(`✅ Уровень ${level.levelNumber} выполнен для ${trade.symbol} по цене $${currentPrice.toFixed(6)}`);
        } catch (error) {
          console.error(`❌ Ошибка выполнения уровня ${level.levelNumber}:`, error.message);
        }
      }
    }
    
    return executedLevels.length > 0 ? executedLevels : null;
  }

  /**
   * Рассчитать общую комиссию по сделке
   */
  calculateTotalCommission(trade) {
    if (!trade.tradeLevels) return 0;
    
    return trade.tradeLevels.reduce((total, level) => {
      return total + (level.commission || 0);
    }, 0);
  }

  /**
   * Рассчитать чистую прибыль по сделке
   */
  calculateNetProfit(trade) {
    if (!trade.tradeLevels) return 0;
    
    const totalProfit = trade.tradeLevels.reduce((total, level) => {
      return total + (level.profitLoss || 0);
    }, 0);
    
    return totalProfit;
  }

  /**
   * Получить статистику по уровням
   */
  getLevelsStatistics(trade) {
    if (!trade.tradeLevels) {
      return {
        totalLevels: 0,
        executedLevels: 0,
        totalVolume: 0,
        totalProfit: 0,
        totalCommission: 0,
        netProfit: 0
      };
    }
    
    const executedLevels = trade.tradeLevels.filter(level => level.isExecuted);
    const totalVolume = trade.tradeLevels.reduce((sum, level) => sum + level.volumeAmount, 0);
    const totalProfit = trade.tradeLevels.reduce((sum, level) => sum + (level.profitLoss || 0), 0);
    const totalCommission = this.calculateTotalCommission(trade);
    
    return {
      totalLevels: trade.tradeLevels.length,
      executedLevels: executedLevels.length,
      totalVolume,
      totalProfit,
      totalCommission,
      netProfit: totalProfit - totalCommission,
      levels: trade.tradeLevels.map(level => ({
        levelNumber: level.levelNumber,
        volumeAmount: level.volumeAmount,
        targetPrice: level.targetPrice,
        isExecuted: level.isExecuted,
        executionPrice: level.executionPrice,
        profitLoss: level.profitLoss,
        profitLossPercent: level.profitLossPercent,
        commission: level.commission
      }))
    };
  }

  /**
   * Проверить, завершена ли сделка (все уровни выполнены)
   */
  isTradeCompleted(trade) {
    if (!trade.tradeLevels || !this.config.multiLevelEnabled) {
      return false;
    }
    
    return trade.tradeLevels.every(level => level.isExecuted);
  }

  /**
   * Получить прогресс выполнения уровней
   */
  getLevelsProgress(trade) {
    if (!trade.tradeLevels) {
      return { progress: 0, executedLevels: 0, totalLevels: 0 };
    }
    
    const executedLevels = trade.tradeLevels.filter(level => level.isExecuted).length;
    const progress = (executedLevels / trade.tradeLevels.length) * 100;
    
    return {
      progress: Math.round(progress),
      executedLevels,
      totalLevels: trade.tradeLevels.length
    };
  }

  /**
   * Создать сообщение о прогрессе уровней
   */
  createLevelsProgressMessage(trade) {
    if (!trade.tradeLevels || !this.config.multiLevelEnabled) {
      return '';
    }
    
    const stats = this.getLevelsStatistics(trade);
    const progress = this.getLevelsProgress(trade);
    
    let message = `📊 ПРОГРЕСС УРОВНЕЙ (${progress.executedLevels}/${progress.totalLevels}):\n`;
    
    trade.tradeLevels.forEach(level => {
      const status = level.isExecuted ? '✅' : '⏳';
      const targetText = level.isExecuted ? 
        `$${level.executionPrice.toFixed(6)}` : 
        `$${level.targetPrice.toFixed(6)}`;
      
      message += `${status} Уровень ${level.levelNumber}: $${level.volumeAmount} → ${targetText}\n`;
      
      if (level.isExecuted) {
        const profitText = level.profitLoss >= 0 ? 
          `+$${level.profitLoss.toFixed(2)}` : 
          `-$${Math.abs(level.profitLoss).toFixed(2)}`;
        message += `   💰 Прибыль: ${profitText} (${level.profitLossPercent.toFixed(2)}%)\n`;
        message += `   💸 Комиссия: $${level.commission.toFixed(2)}\n`;
      }
    });
    
    message += `\n📈 ОБЩАЯ СТАТИСТИКА:\n`;
    message += `💰 Общий объём: $${stats.totalVolume}\n`;
    message += `💵 Общая прибыль: $${stats.totalProfit.toFixed(2)}\n`;
    message += `💸 Общая комиссия: $${stats.totalCommission.toFixed(2)}\n`;
    message += `🟢 Чистая прибыль: $${stats.netProfit.toFixed(2)}\n`;
    
    return message;
  }

  /**
   * Создать уведомление о выполнении уровня
   */
  createLevelExecutedMessage(trade, executedLevel) {
    const symbol = trade.symbol.replace('/USDT', '');
    const emoji = trade.type === 'Long' ? '🟢' : '🔴';
    const profitText = executedLevel.profitLoss >= 0 ? 
      `+$${executedLevel.profitLoss.toFixed(2)}` : 
      `-$${Math.abs(executedLevel.profitLoss).toFixed(2)}`;
    
    const executionTime = new Date(executedLevel.executionTime).toLocaleString('ru-RU');
    
    return `✅ УРОВЕНЬ ${executedLevel.levelNumber} ВЫПОЛНЕН: ${symbol} → ${trade.type} ${emoji}

💰 Объём уровня: $${executedLevel.volumeAmount}
🎯 Целевая цена: $${executedLevel.targetPrice.toFixed(6)}
💵 Цена выполнения: $${executedLevel.executionPrice.toFixed(6)}
📊 Прибыль: ${profitText} (${executedLevel.profitLossPercent.toFixed(2)}%)
💸 Комиссия: $${executedLevel.commission.toFixed(2)}
⏰ Время: ${executionTime}

📈 ПРОГРЕСС СДЕЛКИ: ${this.getLevelsProgress(trade).progress}%`;
  }
}

module.exports = { MultiLevelTradingService }; 