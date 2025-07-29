/**
 * Скрипт для фильтрации списка монет, оставляя только торгуемые на Binance пары
 */
const ccxt = require('ccxt');
const fs = require('fs').promises;
const path = require('path');

class BinancePairFilter {
  constructor() {
    this.exchange = new ccxt.binance({ 
      enableRateLimit: true,
      options: {
        defaultType: 'spot'
      }
    });
    this.tradingPairs = new Set();
    this.filteredCoins = [];
  }

  /**
   * Загрузить список всех монет
   */
  async loadAllCoins() {
    try {
      const filename = path.join(__dirname, '..', 'data', 'filtered-coins.json');
      const data = await fs.readFile(filename, 'utf8');
      const coinsData = JSON.parse(data);
      console.log(`📊 Загружено ${coinsData.coins.length} монет из filtered-coins.json`);
      return coinsData.coins;
    } catch (error) {
      console.error('❌ Ошибка загрузки списка монет:', error.message);
      return [];
    }
  }

  /**
   * Получить список всех торгуемых пар с Binance
   */
  async getBinanceTradingPairs() {
    try {
      console.log('🔄 Получение списка торгуемых пар с Binance...');
      const markets = await this.exchange.loadMarkets();
      
      // Фильтруем только USDT пары
      const usdtPairs = Object.keys(markets).filter(symbol => 
        symbol.endsWith('/USDT') && markets[symbol].active
      );
      
      console.log(`✅ Найдено ${usdtPairs.length} активных USDT пар на Binance`);
      return usdtPairs;
    } catch (error) {
      console.error('❌ Ошибка получения списка пар с Binance:', error.message);
      return [];
    }
  }

  /**
   * Проверить доступность пары на Binance
   */
  async checkPairAvailability(symbol) {
    try {
      // Проверяем, есть ли пара в списке торгуемых
      const pairSymbol = `${symbol}/USDT`;
      return this.tradingPairs.has(pairSymbol);
    } catch (error) {
      return false;
    }
  }

  /**
   * Фильтровать монеты, оставляя только торгуемые на Binance
   */
  async filterTradingPairs() {
    console.log('🔍 Начинаем фильтрацию монет...');
    
    // Загрузить все монеты
    const allCoins = await this.loadAllCoins();
    if (allCoins.length === 0) {
      console.log('❌ Нет монет для фильтрации');
      return;
    }

    // Получить список торгуемых пар с Binance
    const binancePairs = await this.getBinanceTradingPairs();
    this.tradingPairs = new Set(binancePairs);

    console.log(`🔍 Проверяем ${allCoins.length} монет на доступность на Binance...`);
    
    let availableCount = 0;
    let unavailableCount = 0;
    
    // Фильтровать монеты
    for (const coin of allCoins) {
      const isAvailable = await this.checkPairAvailability(coin.symbol);
      
      if (isAvailable) {
        this.filteredCoins.push(coin);
        availableCount++;
        console.log(`✅ ${coin.symbol}/USDT - доступна`);
      } else {
        unavailableCount++;
        console.log(`❌ ${coin.symbol}/USDT - недоступна`);
      }
    }

    console.log(`\n📊 Результаты фильтрации:`);
    console.log(`✅ Доступных пар: ${availableCount}`);
    console.log(`❌ Недоступных пар: ${unavailableCount}`);
    console.log(`📈 Эффективность: ${((availableCount / allCoins.length) * 100).toFixed(1)}%`);
  }

  /**
   * Сохранить отфильтрованный список
   */
  async saveFilteredList() {
    try {
      const dataDir = path.join(__dirname, '..', 'data');
      await fs.mkdir(dataDir, { recursive: true });

      const filename = path.join(dataDir, 'binance-trading-pairs.json');
      
      const filteredData = {
        timestamp: new Date().toISOString(),
        totalCoins: this.filteredCoins.length,
        source: 'filtered-coins.json',
        filter: 'binance-trading-pairs',
        description: 'Список монет, которые реально торгуются на Binance',
        coins: this.filteredCoins
      };

      await fs.writeFile(filename, JSON.stringify(filteredData, null, 2));
      console.log(`✅ Сохранено ${this.filteredCoins.length} торгуемых пар в ${filename}`);
      
      return filename;
    } catch (error) {
      console.error('❌ Ошибка сохранения отфильтрованного списка:', error.message);
      return null;
    }
  }

  /**
   * Обновить основной список монет
   */
  async updateMainList() {
    try {
      const dataDir = path.join(__dirname, '..', 'data');
      const filename = path.join(dataDir, 'filtered-coins.json');
      
      const updatedData = {
        timestamp: new Date().toISOString(),
        totalCoins: this.filteredCoins.length,
        params: {
          totalLimit: 600,
          minMarketCapBTC: 20,
          currency: 'btc',
          maxResults: 300,
          filter: 'binance-trading-pairs-only'
        },
        coins: this.filteredCoins
      };

      await fs.writeFile(filename, JSON.stringify(updatedData, null, 2));
      console.log(`✅ Обновлен основной список filtered-coins.json с ${this.filteredCoins.length} торгуемыми парами`);
      
      return filename;
    } catch (error) {
      console.error('❌ Ошибка обновления основного списка:', error.message);
      return null;
    }
  }

  /**
   * Запустить фильтрацию
   */
  async run() {
    try {
      console.log('🚀 Запуск фильтрации монет по доступности на Binance...');
      
      // Выполнить фильтрацию
      await this.filterTradingPairs();
      
      if (this.filteredCoins.length === 0) {
        console.log('❌ Нет доступных пар для сохранения');
        return;
      }

      // Сохранить отфильтрованный список
      await this.saveFilteredList();
      
      // Обновить основной список
      await this.updateMainList();
      
      console.log('\n🎉 Фильтрация завершена успешно!');
      console.log(`📊 Теперь система будет мониторить только ${this.filteredCoins.length} реально торгуемых пар`);
      
    } catch (error) {
      console.error('❌ Критическая ошибка:', error.message);
    }
  }
}

// Запуск скрипта
if (require.main === module) {
  const filter = new BinancePairFilter();
  filter.run().catch(error => {
    console.error('❌ Критическая ошибка:', error.message);
    process.exit(1);
  });
}

module.exports = { BinancePairFilter }; 