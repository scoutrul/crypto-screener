const CoinRepository = require('../../domain/repositories/CoinRepository');
const CoinGeckoAdapter = require('../adapters/CoinGeckoAdapter');

/**
 * Реализация репозитория для работы с CoinGecko API
 */
class CoinGeckoRepository extends CoinRepository {
  constructor() {
    super();
    this.adapter = new CoinGeckoAdapter();
  }

  /**
   * Получить топ монет по рыночной капитализации
   * @param {number} limit - Количество монет
   * @param {string} currency - Валюта
   * @returns {Promise<Array<Coin>>}
   */
  async getTopCoinsByMarketCap(limit = 1000, currency = 'btc') {
    return await this.adapter.getTopCoinsByMarketCap(limit, currency);
  }

  /**
   * Получить монету по ID
   * @param {string} id - ID монеты
   * @returns {Promise<Coin|null>}
   */
  async getById(id) {
    try {
      return await this.adapter.getCoinById(id);
    } catch (error) {
      if (error.response && error.response.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Получить монеты по символам
   * @param {Array<string>} symbols - Массив символов
   * @returns {Promise<Array<Coin>>}
   */
  async getBySymbols(symbols) {
    const coins = [];
    
    for (const symbol of symbols) {
      try {
        // CoinGecko API не поддерживает поиск по символам напрямую
        // Поэтому сначала нужно получить список всех монет и найти по символу
        const allCoins = await this.getTopCoinsByMarketCap(1000);
        const coin = allCoins.find(c => c.getSymbol().toLowerCase() === symbol.toLowerCase());
        if (coin) {
          coins.push(coin);
        }
      } catch (error) {
        console.error(`Error fetching coin with symbol ${symbol}:`, error.message);
      }
    }
    
    return coins;
  }

  /**
   * Получить трендовые монеты
   * @returns {Promise<Array<Coin>>}
   */
  async getTrendingCoins() {
    return await this.adapter.getTrendingCoins();
  }

  /**
   * Сохранить монету (не поддерживается в CoinGecko API)
   * @param {Coin} coin - Монета для сохранения
   * @returns {Promise<void>}
   */
  async save(coin) {
    console.warn('Save operation is not supported in CoinGecko API');
    return Promise.resolve();
  }

  /**
   * Сохранить несколько монет (не поддерживается в CoinGecko API)
   * @param {Array<Coin>} coins - Массив монет
   * @returns {Promise<void>}
   */
  async saveMany(coins) {
    console.warn('SaveMany operation is not supported in CoinGecko API');
    return Promise.resolve();
  }

  /**
   * Обновить монету (не поддерживается в CoinGecko API)
   * @param {Coin} coin - Монета для обновления
   * @returns {Promise<void>}
   */
  async update(coin) {
    console.warn('Update operation is not supported in CoinGecko API');
    return Promise.resolve();
  }

  /**
   * Удалить монету (не поддерживается в CoinGecko API)
   * @param {string} id - ID монеты
   * @returns {Promise<void>}
   */
  async delete(id) {
    console.warn('Delete operation is not supported in CoinGecko API');
    return Promise.resolve();
  }

  /**
   * Получить все монеты
   * @returns {Promise<Array<Coin>>}
   */
  async getAll() {
    return await this.getTopCoinsByMarketCap(1000);
  }

  /**
   * Поиск монет по названию или символу
   * @param {string} query - Поисковый запрос
   * @returns {Promise<Array<Coin>>}
   */
  async search(query) {
    if (!query || query.trim().length === 0) {
      return [];
    }

    const allCoins = await this.getTopCoinsByMarketCap(1000);
    const searchTerm = query.toLowerCase();
    
    return allCoins.filter(coin => 
      coin.getName().toLowerCase().includes(searchTerm) ||
      coin.getSymbol().toLowerCase().includes(searchTerm)
    );
  }

  /**
   * Получить статистику рынка
   * @returns {Promise<Object>}
   */
  async getMarketStats() {
    const coins = await this.getTopCoinsByMarketCap(1000);
    
    const totalCoins = coins.length;
    const totalMarketCap = coins.reduce((sum, coin) => sum + coin.getMarketCap().getValue(), 0);
    const averagePrice = coins.reduce((sum, coin) => sum + coin.getCurrentPrice().getValue(), 0) / totalCoins;
    
    const risingCoins = coins.filter(coin => coin.isPriceRising24h()).length;
    const fallingCoins = coins.filter(coin => coin.isPriceFalling24h()).length;
    const stableCoins = totalCoins - risingCoins - fallingCoins;

    return {
      totalCoins,
      totalMarketCap,
      averagePrice,
      risingCoins,
      fallingCoins,
      stableCoins,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Проверить доступность API
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    return await this.adapter.isAvailable();
  }
}

module.exports = CoinGeckoRepository; 