/**
 * Скрипт для мониторинга обновлений данных в реальном времени
 * Показывает изменения в pending anomalies и active trades
 */

const fs = require('fs').promises;
const path = require('path');

class DataMonitor {
  constructor() {
    this.pendingAnomaliesPath = path.join(__dirname, '..', 'data', 'pending-anomalies.json');
    this.activeTradesPath = path.join(__dirname, '..', 'data', 'active-trades.json');
    this.lastPendingAnomalies = null;
    this.lastActiveTrades = null;
  }

  async start() {
    console.log('📊 Запуск мониторинга обновлений данных...');
    
    // Загрузить начальные данные
    await this.loadInitialData();
    
    // Запустить мониторинг
    this.startMonitoring();
  }

  async loadInitialData() {
    try {
      const pendingData = await fs.readFile(this.pendingAnomaliesPath, 'utf8');
      this.lastPendingAnomalies = JSON.parse(pendingData);
      
      const activeData = await fs.readFile(this.activeTradesPath, 'utf8');
      this.lastActiveTrades = JSON.parse(activeData);
      
      console.log(`📋 Загружено ${this.lastPendingAnomalies.length} pending anomalies`);
      console.log(`💰 Загружено ${this.lastActiveTrades.length} активных сделок`);
      
    } catch (error) {
      console.error('❌ Ошибка загрузки данных:', error.message);
    }
  }

  startMonitoring() {
    // Проверять обновления каждые 5 секунд
    setInterval(async () => {
      await this.checkUpdates();
    }, 5000);
  }

  async checkUpdates() {
    try {
      // Проверить pending anomalies
      const pendingData = await fs.readFile(this.pendingAnomaliesPath, 'utf8');
      const currentPendingAnomalies = JSON.parse(pendingData);
      
      // Проверить active trades
      const activeData = await fs.readFile(this.activeTradesPath, 'utf8');
      const currentActiveTrades = JSON.parse(activeData);
      
      // Сравнить pending anomalies
      this.comparePendingAnomalies(currentPendingAnomalies);
      
      // Сравнить active trades
      this.compareActiveTrades(currentActiveTrades);
      
      // Обновить последние данные
      this.lastPendingAnomalies = currentPendingAnomalies;
      this.lastActiveTrades = currentActiveTrades;
      
    } catch (error) {
      console.error('❌ Ошибка проверки обновлений:', error.message);
    }
  }

  comparePendingAnomalies(currentData) {
    if (!this.lastPendingAnomalies) return;
    
    currentData.forEach(currentAnomaly => {
      const lastAnomaly = this.lastPendingAnomalies.find(
        a => a.symbol === currentAnomaly.symbol
      );
      
      if (lastAnomaly) {
        // Проверить обновления цены
        if (currentAnomaly.lastPrice && currentAnomaly.lastPrice !== lastAnomaly.lastPrice) {
          console.log(`📊 [UPDATE] ${currentAnomaly.symbol} - Цена обновлена: $${lastAnomaly.lastPrice} → $${currentAnomaly.lastPrice}`);
        }
        
        // Проверить обновления времени
        if (currentAnomaly.lastUpdateTime && currentAnomaly.lastUpdateTime !== lastAnomaly.lastUpdateTime) {
          console.log(`🕐 [UPDATE] ${currentAnomaly.symbol} - Время обновлено: ${new Date(currentAnomaly.lastUpdateTime).toLocaleString()}`);
        }
      }
    });
  }

  compareActiveTrades(currentData) {
    if (!this.lastActiveTrades) return;
    
    currentData.forEach(currentTrade => {
      const lastTrade = this.lastActiveTrades.find(
        t => t.symbol === currentTrade.symbol
      );
      
      if (lastTrade) {
        // Проверить обновления цены
        if (currentTrade.lastPrice && currentTrade.lastPrice !== lastTrade.lastPrice) {
          const priceChange = ((currentTrade.lastPrice - lastTrade.lastPrice) / lastTrade.lastPrice) * 100;
          const changeSign = priceChange >= 0 ? '+' : '';
          console.log(`💰 [UPDATE] ${currentTrade.symbol} - Цена обновлена: $${lastTrade.lastPrice} → $${currentTrade.lastPrice} (${changeSign}${priceChange.toFixed(2)}%)`);
        }
        
        // Проверить обновления времени
        if (currentTrade.lastUpdateTime && currentTrade.lastUpdateTime !== lastTrade.lastUpdateTime) {
          console.log(`🕐 [UPDATE] ${currentTrade.symbol} - Время обновлено: ${new Date(currentTrade.lastUpdateTime).toLocaleString()}`);
        }
      }
    });
  }

  showCurrentStatus() {
    console.log('\n📊 ТЕКУЩИЙ СТАТУС ДАННЫХ:');
    
    if (this.lastPendingAnomalies) {
      console.log(`📋 Pending anomalies: ${this.lastPendingAnomalies.length}`);
      this.lastPendingAnomalies.forEach(anomaly => {
        const lastUpdate = anomaly.lastUpdateTime ? new Date(anomaly.lastUpdateTime).toLocaleString() : 'Не обновлялось';
        const lastPrice = anomaly.lastPrice ? `$${anomaly.lastPrice}` : 'Нет данных';
        console.log(`   ${anomaly.symbol} (${anomaly.tradeType}) - ${lastPrice} - ${lastUpdate}`);
      });
    }
    
    if (this.lastActiveTrades) {
      console.log(`💰 Active trades: ${this.lastActiveTrades.length}`);
      this.lastActiveTrades.forEach(trade => {
        const lastUpdate = trade.lastUpdateTime ? new Date(trade.lastUpdateTime).toLocaleString() : 'Не обновлялось';
        const lastPrice = trade.lastPrice ? `$${trade.lastPrice}` : 'Нет данных';
        console.log(`   ${trade.symbol} (${trade.type}) - ${lastPrice} - ${lastUpdate}`);
      });
    }
  }
}

// Обработка завершения процесса
process.on('SIGINT', async () => {
  console.log('\n🛑 Получен сигнал завершения...');
  process.exit(0);
});

// Запуск мониторинга
const monitor = new DataMonitor();

if (require.main === module) {
  monitor.start().catch(error => {
    console.error('❌ Ошибка запуска мониторинга:', error.message);
    process.exit(1);
  });
  
  // Показывать статус каждые 30 секунд
  setInterval(() => {
    monitor.showCurrentStatus();
  }, 30000);
}

module.exports = { DataMonitor }; 