const fs = require('fs').promises;
const path = require('path');
const ccxt = require('ccxt');

/**
 * Скрипт для очистки неактивных пар из отфильтрованного списка
 */
class InactivePairsCleaner {
  constructor() {
    this.exchange = new ccxt.binance({
      defaultType: 'spot',
      enableRateLimit: true
    });
  }

  /**
   * Загрузить отфильтрованный список монет
   */
  async loadFilteredCoins() {
    try {
      const filename = path.join(__dirname, '..', 'data', 'filtered-coins.json');
      const data = await fs.readFile(filename, 'utf8');
      const coinsData = JSON.parse(data);
      
      if (coinsData.coins) {
        return coinsData.coins;
      } else {
        return coinsData; // Старый формат без meta
      }
    } catch (error) {
      console.error('❌ Ошибка загрузки списка монет:', error.message);
      return [];
    }
  }

  /**
   * Проверить активность пары на Binance
   */
  async checkPairActivity(symbol) {
    try {
      // Попробовать получить тикер
      const ticker = await this.exchange.fetchTicker(symbol);
      
      // Проверить, что есть данные о торговле
      if (ticker && ticker.last && ticker.volume) {
        return true;
      }
      
      return false;
    } catch (error) {
      if (error.message.includes('does not have market symbol')) {
        return false;
      }
      // Другие ошибки (таймауты и т.д.) считаем активными
      return true;
    }
  }

  /**
   * Очистить неактивные пары
   */
  async cleanInactivePairs() {
    console.log('🔍 Загрузка отфильтрованного списка монет...');
    
    const coins = await this.loadFilteredCoins();
    if (coins.length === 0) {
      console.log('❌ Список монет пуст');
      return;
    }

    console.log(`📊 Загружено ${coins.length} монет для проверки`);
    console.log('🔍 Проверка активности пар на Binance...');

    const activeCoins = [];
    const inactiveCoins = [];
    let checked = 0;

    for (const coin of coins) {
      checked++;
      const symbol = `${coin.symbol}/USDT`;
      
      // Показать прогресс каждые 10 монет
      if (checked % 10 === 0) {
        console.log(`⏳ Проверено ${checked}/${coins.length} монет...`);
      }

      const isActive = await this.checkPairActivity(symbol);
      
      if (isActive) {
        activeCoins.push(coin);
      } else {
        inactiveCoins.push(coin);
        console.log(`❌ ${symbol} - неактивна`);
      }

      // Небольшая пауза между запросами
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('\n📊 РЕЗУЛЬТАТЫ ОЧИСТКИ:');
    console.log(`✅ Активных пар: ${activeCoins.length}`);
    console.log(`❌ Неактивных пар: ${inactiveCoins.length}`);
    console.log(`📈 Эффективность: ${((activeCoins.length / coins.length) * 100).toFixed(1)}%`);

    if (inactiveCoins.length > 0) {
      console.log('\n❌ УДАЛЕННЫЕ ПАРЫ:');
      inactiveCoins.forEach(coin => {
        console.log(`   - ${coin.symbol}/USDT`);
      });
    }

    // Сохранить очищенный список
    if (activeCoins.length > 0) {
      await this.saveCleanedCoins(activeCoins);
      console.log(`\n✅ Очищенный список сохранен (${activeCoins.length} активных пар)`);
    } else {
      console.log('\n❌ Нет активных пар для сохранения');
    }
  }

  /**
   * Сохранить очищенный список монет
   */
  async saveCleanedCoins(activeCoins) {
    try {
      const filename = path.join(__dirname, '..', 'data', 'filtered-coins.json');
      
      // Загрузить существующие данные для сохранения meta
      const existingData = await fs.readFile(filename, 'utf8');
      const existingCoinsData = JSON.parse(existingData);
      
      const result = {
        meta: existingCoinsData.meta || {
          source: 'CoinGecko top 1000',
          filter: 'Binance only, exclude stablecoins',
          cleanedAt: new Date().toISOString()
        },
        coins: activeCoins
      };

      // Добавить информацию об очистке в meta
      if (result.meta) {
        result.meta.cleanedAt = new Date().toISOString();
        result.meta.originalCount = existingCoinsData.coins ? existingCoinsData.coins.length : existingCoinsData.length;
        result.meta.activeCount = activeCoins.length;
      }

      await fs.writeFile(filename, JSON.stringify(result, null, 2));
      
      console.log(`💾 Сохранено в ${filename}`);
    } catch (error) {
      console.error('❌ Ошибка сохранения:', error.message);
    }
  }

  /**
   * Запустить очистку
   */
  async start() {
    try {
      console.log('🚀 Запуск очистки неактивных пар...');
      await this.cleanInactivePairs();
      console.log('✅ Очистка завершена');
    } catch (error) {
      console.error('❌ Ошибка очистки:', error.message);
    }
  }
}

// Запуск скрипта
if (require.main === module) {
  const cleaner = new InactivePairsCleaner();
  cleaner.start();
}

module.exports = InactivePairsCleaner; 