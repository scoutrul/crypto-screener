/**
 * Скрипт для фильтрации монет, торгующихся на Binance
 */
const ccxt = require('ccxt');
const fs = require('fs').promises;
const path = require('path');

class BinanceCoinFilter {
  constructor() {
    this.exchange = new ccxt.binance({ enableRateLimit: true });
    this.availableMarkets = new Set();
  }

  /**
   * Загрузить доступные рынки Binance
   */
  async loadBinanceMarkets() {
    try {
      console.log('📊 Загрузка доступных рынков Binance...');
      const markets = await this.exchange.loadMarkets();
      
      // Фильтруем только USDT пары
      const usdtPairs = Object.keys(markets).filter(symbol => 
        symbol.endsWith('/USDT') && markets[symbol].active
      );
      
      this.availableMarkets = new Set(usdtPairs);
      console.log(`✅ Загружено ${this.availableMarkets.size} активных USDT пар на Binance`);
      
      return true;
    } catch (error) {
      console.error('❌ Ошибка загрузки рынков Binance:', error.message);
      return false;
    }
  }

  /**
   * Загрузить отфильтрованные монеты
   */
  async loadFilteredCoins() {
    try {
      const filename = path.join(__dirname, '..', 'data', 'filtered-coins.json');
      const data = await fs.readFile(filename, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('❌ Ошибка загрузки списка монет:', error.message);
      return null;
    }
  }

  /**
   * Фильтровать монеты, торгующиеся на Binance
   */
  filterBinanceCoins(coinsData) {
    const binanceCoins = coinsData.coins.filter(coin => {
      const symbol = `${coin.symbol}/USDT`;
      return this.availableMarkets.has(symbol);
    });

    console.log(`📊 Найдено ${binanceCoins.length} монет из ${coinsData.coins.length}, торгующихся на Binance`);

    return {
      ...coinsData,
      coins: binanceCoins,
      totalCoins: binanceCoins.length,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Сохранить отфильтрованные монеты
   */
  async saveBinanceCoins(filteredData) {
    try {
      const filename = path.join(__dirname, '..', 'data', 'binance-coins.json');
      await fs.writeFile(filename, JSON.stringify(filteredData, null, 2));
      console.log(`✅ Сохранено ${filteredData.coins.length} монет в ${filename}`);
      return true;
    } catch (error) {
      console.error('❌ Ошибка сохранения:', error.message);
      return false;
    }
  }

  /**
   * Показать статистику
   */
  showStatistics(originalData, filteredData) {
    console.log('\n📈 Статистика фильтрации:');
    console.log(`- Исходное количество монет: ${originalData.coins.length}`);
    console.log(`- Доступно на Binance: ${filteredData.coins.length}`);
    console.log(`- Процент покрытия: ${((filteredData.coins.length / originalData.coins.length) * 100).toFixed(1)}%`);
    
    console.log('\n🏆 Топ-10 монет по капитализации (доступные на Binance):');
    filteredData.coins.slice(0, 10).forEach((coin, index) => {
      console.log(`${index + 1}. ${coin.symbol} - ${coin.name} (${coin.marketCap24h.toFixed(2)} BTC)`);
    });
  }

  /**
   * Основной метод
   */
  async run() {
    try {
      console.log('🚀 Запуск фильтрации монет для Binance...\n');

      // Загрузить рынки Binance
      if (!await this.loadBinanceMarkets()) {
        return;
      }

      // Загрузить отфильтрованные монеты
      const originalData = await this.loadFilteredCoins();
      if (!originalData) {
        return;
      }

      // Фильтровать монеты
      const filteredData = this.filterBinanceCoins(originalData);

      // Сохранить результат
      if (await this.saveBinanceCoins(filteredData)) {
        this.showStatistics(originalData, filteredData);
      }

      console.log('\n✅ Фильтрация завершена успешно!');

    } catch (error) {
      console.error('❌ Ошибка:', error.message);
    }
  }
}

// Запуск скрипта
if (require.main === module) {
  const filter = new BinanceCoinFilter();
  filter.run().catch(error => {
    console.error('❌ Критическая ошибка:', error.message);
    process.exit(1);
  });
}

module.exports = { BinanceCoinFilter }; 