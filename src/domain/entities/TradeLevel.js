/**
 * Доменная сущность уровня фиксации прибыли
 * Представляет один уровень в многоуровневой системе фиксации
 */

class TradeLevel {
  constructor(levelNumber, volumeAmount, targetPrice, tradeType) {
    this.levelNumber = levelNumber;
    this.volumeAmount = volumeAmount;
    this.targetPrice = targetPrice;
    this.tradeType = tradeType;
    this.isExecuted = false;
    this.executionPrice = null;
    this.executionTime = null;
    this.profitLoss = 0;
    this.profitLossPercent = 0;
    this.commission = 0;
  }

  /**
   * Выполнить уровень
   */
  execute(currentPrice, commissionPercent = 0.0003) {
    if (this.isExecuted) {
      throw new Error(`Уровень ${this.levelNumber} уже выполнен`);
    }

    this.isExecuted = true;
    this.executionPrice = currentPrice;
    this.executionTime = new Date().toISOString();

    // Рассчитать прибыль/убыток
    this.calculateProfitLoss(commissionPercent);
  }

  /**
   * Рассчитать прибыль/убыток уровня
   */
  calculateProfitLoss(commissionPercent = 0.0003) {
    if (!this.isExecuted || !this.executionPrice) {
      return;
    }

    const entryPrice = this.getEntryPrice();
    let priceDiff, priceDiffPercent;

    if (this.tradeType === 'Long') {
      priceDiff = this.executionPrice - entryPrice;
      priceDiffPercent = (priceDiff / entryPrice) * 100;
    } else { // Short
      priceDiff = entryPrice - this.executionPrice;
      priceDiffPercent = (priceDiff / entryPrice) * 100;
    }

    // Рассчитать прибыль в долларах
    this.profitLoss = (priceDiffPercent / 100) * this.volumeAmount;
    
    // Рассчитать комиссию
    const totalAmount = this.volumeAmount + this.profitLoss;
    this.commission = totalAmount * commissionPercent;
    
    // Чистая прибыль с учётом комиссии
    this.profitLoss = this.profitLoss - this.commission;
    this.profitLossPercent = (this.profitLoss / this.volumeAmount) * 100;
  }

  /**
   * Получить цену входа (должна быть передана из родительской сделки)
   */
  getEntryPrice() {
    // Этот метод должен быть переопределён или цена входа должна быть передана
    throw new Error('Метод getEntryPrice должен быть переопределён');
  }

  /**
   * Проверить, достигнута ли целевая цена
   */
  isTargetReached(currentPrice) {
    if (this.tradeType === 'Long') {
      return currentPrice >= this.targetPrice;
    } else { // Short
      return currentPrice <= this.targetPrice;
    }
  }

  /**
   * Получить статус уровня
   */
  getStatus() {
    if (this.isExecuted) {
      const status = this.profitLoss >= 0 ? 'profit' : 'loss';
      return {
        status,
        profitLoss: this.profitLoss,
        profitLossPercent: this.profitLossPercent,
        commission: this.commission
      };
    }
    return { status: 'pending' };
  }

  /**
   * Создать копию уровня
   */
  clone() {
    const cloned = new TradeLevel(
      this.levelNumber,
      this.volumeAmount,
      this.targetPrice,
      this.tradeType
    );
    
    if (this.isExecuted) {
      cloned.isExecuted = true;
      cloned.executionPrice = this.executionPrice;
      cloned.executionTime = this.executionTime;
      cloned.profitLoss = this.profitLoss;
      cloned.profitLossPercent = this.profitLossPercent;
      cloned.commission = this.commission;
    }
    
    return cloned;
  }

  /**
   * Преобразовать в объект для сохранения
   */
  toJSON() {
    return {
      levelNumber: this.levelNumber,
      volumeAmount: this.volumeAmount,
      targetPrice: this.targetPrice,
      tradeType: this.tradeType,
      isExecuted: this.isExecuted,
      executionPrice: this.executionPrice,
      executionTime: this.executionTime,
      profitLoss: this.profitLoss,
      profitLossPercent: this.profitLossPercent,
      commission: this.commission
    };
  }

  /**
   * Создать из JSON объекта
   */
  static fromJSON(data) {
    const level = new TradeLevel(
      data.levelNumber,
      data.volumeAmount,
      data.targetPrice,
      data.tradeType
    );
    
    if (data.isExecuted) {
      level.isExecuted = true;
      level.executionPrice = data.executionPrice;
      level.executionTime = data.executionTime;
      level.profitLoss = data.profitLoss;
      level.profitLossPercent = data.profitLossPercent;
      level.commission = data.commission;
    }
    
    return level;
  }
}

module.exports = { TradeLevel }; 