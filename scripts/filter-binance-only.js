/**
 * Скрипт для фильтрации только Binance торговых пар
 * Исключает стейблкоины и оставляет только активно торгуемые пары
 */
const ccxt = require('ccxt');
const fs = require('fs').promises;
const path = require('path');

class BinanceOnlyFilter {
  constructor() {
    this.exchange = new ccxt.binance({
      enableRateLimit: true,
      options: { defaultType: 'spot' }
    });
    this.filteredCoins = [];
    this.binancePairs = new Set();
  }

  /**
   * Загрузить все монеты из файла
   */
  async loadAllCoins() {
    try {
      const filename = path.join(__dirname, '..', 'data', 'filtered-coins.json');
      const data = await fs.readFile(filename, 'utf8');
      const coinsData = JSON.parse(data);
      
      console.log(`📊 Загружено ${coinsData.coins.length} монет из файла`);
      return coinsData.coins;
    } catch (error) {
      console.error('❌ Ошибка загрузки монет:', error.message);
      return [];
    }
  }

  /**
   * Получить все торговые пары Binance
   */
  async getBinanceTradingPairs() {
    try {
      console.log('🔍 Получение торговых пар Binance...');
      const markets = await this.exchange.loadMarkets();
      
      // Фильтруем только USDT пары
      const usdtPairs = Object.keys(markets).filter(symbol => 
        symbol.endsWith('/USDT') && 
        markets[symbol].active && 
        markets[symbol].spot
      );
      
      console.log(`📊 Найдено ${usdtPairs.length} активных USDT пар на Binance`);
      
      // Исключить стейблкоины
      const nonStablecoins = usdtPairs.filter(symbol => {
        const base = symbol.split('/')[0].toUpperCase();
        const stablecoinKeywords = [
          'USDT', 'USDC', 'BUSD', 'DAI', 'TUSD', 'FRAX', 'USDP', 'USDD', 'GUSD',
          'USDK', 'USDN', 'USDJ', 'USDK', 'USDN', 'USDJ', 'USDK', 'USDN', 'USDJ'
        ];
        
        return !stablecoinKeywords.some(keyword => base.includes(keyword));
      });
      
      console.log(`🚫 Исключено ${usdtPairs.length - nonStablecoins.length} стейблкоинов`);
      console.log(`✅ Осталось ${nonStablecoins.length} торговых пар`);
      
      return nonStablecoins;
    } catch (error) {
      console.error('❌ Ошибка получения торговых пар Binance:', error.message);
      return [];
    }
  }

  /**
   * Проверить доступность пары
   */
  async checkPairAvailability(symbol) {
    try {
      // Проверяем, что пара активна и торгуется
      const ticker = await this.exchange.fetchTicker(symbol);
      return ticker && ticker.last > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Фильтровать только Binance пары
   */
  async filterBinanceOnly() {
    try {
      // Загрузить все монеты
      const allCoins = await this.loadAllCoins();
      if (allCoins.length === 0) {
        throw new Error('Нет монет для фильтрации');
      }

      // Получить торговые пары Binance
      const binancePairs = await this.getBinanceTradingPairs();
      if (binancePairs.length === 0) {
        throw new Error('Не удалось получить торговые пары Binance');
      }

      // Создать Set для быстрого поиска
      const binancePairsSet = new Set(binancePairs.map(pair => pair.split('/')[0]));

      // Фильтровать монеты, которые торгуются на Binance
      const filteredCoins = allCoins.filter(coin => {
        const symbol = coin.symbol.toUpperCase();
        return binancePairsSet.has(symbol);
      });

      console.log(`📊 Отфильтровано ${filteredCoins.length} монет из ${allCoins.length} (только Binance)`);

      // Проверить доступность пар (выборочно)
      console.log('🔍 Проверка доступности пар...');
      const availablePairs = [];
      const checkLimit = Math.min(50, filteredCoins.length); // Проверяем первые 50

      for (let i = 0; i < checkLimit; i++) {
        const coin = filteredCoins[i];
        const symbol = `${coin.symbol}/USDT`;
        
        const isAvailable = await this.checkPairAvailability(symbol);
        if (isAvailable) {
          availablePairs.push(coin);
        }
        
        // Небольшая задержка между запросами
        if (i % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      console.log(`✅ Проверено ${checkLimit} пар, доступно: ${availablePairs.length}`);

      // Добавить остальные монеты без проверки (для экономии времени)
      const remainingCoins = filteredCoins.slice(checkLimit);
      this.filteredCoins = [...availablePairs, ...remainingCoins];

      console.log(`📊 Итого отфильтровано: ${this.filteredCoins.length} монет (Binance + проверенные)`);

    } catch (error) {
      console.error('❌ Ошибка фильтрации:', error.message);
    }
  }

  /**
   * Сохранить отфильтрованный список
   */
  async saveFilteredList() {
    try {
      const dataDir = path.join(__dirname, '..', 'data');
      await fs.mkdir(dataDir, { recursive: true });
      
      const filename = path.join(dataDir, 'binance-only-coins.json');
      
      const data = {
        timestamp: new Date().toISOString(),
        totalCoins: this.filteredCoins.length,
        source: 'filtered-coins.json',
        filter: 'Binance only (exclude stablecoins)',
        coins: this.filteredCoins
      };

      await fs.writeFile(filename, JSON.stringify(data, null, 2));
      console.log(`✅ Сохранено ${this.filteredCoins.length} монет в файл: ${filename}`);
      
      return filename;
    } catch (error) {
      console.error('❌ Ошибка сохранения:', error.message);
      return null;
    }
  }

  /**
   * Обновить основной список
   */
  async updateMainList() {
    try {
      const dataDir = path.join(__dirname, '..', 'data');
      const filename = path.join(dataDir, 'filtered-coins.json');
      
      const data = {
        timestamp: new Date().toISOString(),
        totalCoins: this.filteredCoins.length,
        source: 'Binance only filter',
        filter: 'Binance only (exclude stablecoins)',
        coins: this.filteredCoins
      };

      await fs.writeFile(filename, JSON.stringify(data, null, 2));
      console.log(`✅ Обновлен основной список: ${filename}`);
      console.log(`📊 Теперь в мониторинге: ${this.filteredCoins.length} монет (только Binance)`);
      
    } catch (error) {
      console.error('❌ Ошибка обновления основного списка:', error.message);
    }
  }

  /**
   * Запустить фильтрацию
   */
  async run() {
    try {
      console.log('🚀 Запуск фильтрации только Binance пар...');
      
      await this.filterBinanceOnly();
      
      if (this.filteredCoins.length > 0) {
        await this.saveFilteredList();
        await this.updateMainList();
        
        console.log('\n📊 РЕЗУЛЬТАТ ФИЛЬТРАЦИИ:');
        console.log(`✅ Отфильтровано: ${this.filteredCoins.length} монет`);
        console.log(`🎯 Только Binance торговые пары`);
        console.log(`🚫 Исключены стейблкоины`);
        console.log(`📈 Готово к мониторингу!`);
      } else {
        console.log('❌ Нет монет для сохранения');
      }
      
    } catch (error) {
      console.error('❌ Критическая ошибка:', error.message);
    }
  }
}

// Запуск фильтрации
if (require.main === module) {
  const filter = new BinanceOnlyFilter();
  filter.run().catch(error => {
    console.error('❌ Ошибка запуска:', error.message);
    process.exit(1);
  });
}

module.exports = { BinanceOnlyFilter }; 