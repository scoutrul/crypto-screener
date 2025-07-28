const Coin = require('../entities/Coin');
const Percentage = require('../value-objects/Percentage');

/**
 * Доменный сервис для анализа рынка
 */
class MarketAnalysisService {
  /**
   * Получить статистику рынка
   * @param {Array<Coin>} coins - Массив монет
   * @returns {Object} Статистика рынка
   */
  getMarketStats(coins) {
    if (!coins || coins.length === 0) {
      return {
        totalCoins: 0,
        totalMarketCap: 0,
        averagePrice: 0,
        risingCoins: 0,
        fallingCoins: 0,
        stableCoins: 0,
        topGainers: [],
        topLosers: [],
        marketSentiment: 'neutral'
      };
    }

    const totalCoins = coins.length;
    const totalMarketCap = coins.reduce((sum, coin) => sum + coin.getMarketCap().getValue(), 0);
    const averagePrice = coins.reduce((sum, coin) => sum + coin.getCurrentPrice().getValue(), 0) / totalCoins;

    // Подсчет растущих/падающих монет
    const risingCoins = coins.filter(coin => coin.isPriceRising24h()).length;
    const fallingCoins = coins.filter(coin => coin.isPriceFalling24h()).length;
    const stableCoins = totalCoins - risingCoins - fallingCoins;

    // Топ-5 растущих монет
    const topGainers = coins
      .filter(coin => coin.getPriceChangePercentage24h() && coin.getPriceChangePercentage24h().isPositive())
      .sort((a, b) => b.getPriceChangePercentage24h().getValue() - a.getPriceChangePercentage24h().getValue())
      .slice(0, 5)
      .map(coin => ({
        symbol: coin.getSymbol(),
        name: coin.getName(),
        change: coin.getPriceChangePercentage24h().format()
      }));

    // Топ-5 падающих монет
    const topLosers = coins
      .filter(coin => coin.getPriceChangePercentage24h() && coin.getPriceChangePercentage24h().isNegative())
      .sort((a, b) => a.getPriceChangePercentage24h().getValue() - b.getPriceChangePercentage24h().getValue())
      .slice(0, 5)
      .map(coin => ({
        symbol: coin.getSymbol(),
        name: coin.getName(),
        change: coin.getPriceChangePercentage24h().format()
      }));

    // Определение настроений рынка
    const marketSentiment = this.calculateMarketSentiment(risingCoins, fallingCoins, totalCoins);

    return {
      totalCoins,
      totalMarketCap,
      averagePrice,
      risingCoins,
      fallingCoins,
      stableCoins,
      topGainers,
      topLosers,
      marketSentiment
    };
  }

  /**
   * Вычислить настроения рынка
   * @param {number} risingCoins - Количество растущих монет
   * @param {number} fallingCoins - Количество падающих монет
   * @param {number} totalCoins - Общее количество монет
   * @returns {string} Настроения рынка
   */
  calculateMarketSentiment(risingCoins, fallingCoins, totalCoins) {
    if (totalCoins === 0) return 'neutral';

    const risingPercentage = (risingCoins / totalCoins) * 100;
    const fallingPercentage = (fallingCoins / totalCoins) * 100;

    if (risingPercentage >= 70) return 'very_bullish';
    if (risingPercentage >= 60) return 'bullish';
    if (fallingPercentage >= 70) return 'very_bearish';
    if (fallingPercentage >= 60) return 'bearish';
    return 'neutral';
  }

  /**
   * Получить топ монет по критерию
   * @param {Array<Coin>} coins - Массив монет
   * @param {string} criteria - Критерий сортировки (marketCap, volume, priceChange24h)
   * @param {number} limit - Количество монет
   * @returns {Array<Coin>} Отсортированные монеты
   */
  getTopCoinsByCriteria(coins, criteria = 'marketCap', limit = 20) {
    if (!coins || coins.length === 0) return [];

    let sortedCoins = [...coins];

    switch (criteria) {
      case 'marketCap':
        sortedCoins.sort((a, b) => b.compareByMarketCap(a));
        break;
      case 'volume':
        sortedCoins.sort((a, b) => b.compareByVolume(a));
        break;
      case 'priceChange24h':
        sortedCoins.sort((a, b) => b.compareByPriceChange24h(a));
        break;
      default:
        sortedCoins.sort((a, b) => b.compareByMarketCap(a));
    }

    return sortedCoins.slice(0, limit);
  }

  /**
   * Фильтровать монеты по условиям
   * @param {Array<Coin>} coins - Массив монет
   * @param {Object} filters - Условия фильтрации
   * @returns {Array<Coin>} Отфильтрованные монеты
   */
  filterCoins(coins, filters = {}) {
    if (!coins || coins.length === 0) return [];

    let filteredCoins = [...coins];

    // Фильтр по минимальной рыночной капитализации
    if (filters.minMarketCap) {
      filteredCoins = filteredCoins.filter(coin => 
        coin.getMarketCap().getValue() >= filters.minMarketCap
      );
    }

    // Фильтр по максимальной рыночной капитализации
    if (filters.maxMarketCap) {
      filteredCoins = filteredCoins.filter(coin => 
        coin.getMarketCap().getValue() <= filters.maxMarketCap
      );
    }

    // Фильтр по минимальному объему
    if (filters.minVolume) {
      filteredCoins = filteredCoins.filter(coin => 
        coin.getVolume().getValue() >= filters.minVolume
      );
    }

    // Фильтр по изменению цены за 24 часа
    if (filters.minPriceChange24h) {
      filteredCoins = filteredCoins.filter(coin => 
        coin.getPriceChangePercentage24h() && 
        coin.getPriceChangePercentage24h().getValue() >= filters.minPriceChange24h
      );
    }

    if (filters.maxPriceChange24h) {
      filteredCoins = filteredCoins.filter(coin => 
        coin.getPriceChangePercentage24h() && 
        coin.getPriceChangePercentage24h().getValue() <= filters.maxPriceChange24h
      );
    }

    // Фильтр по направлению движения цены
    if (filters.priceDirection) {
      switch (filters.priceDirection) {
        case 'rising':
          filteredCoins = filteredCoins.filter(coin => coin.isPriceRising24h());
          break;
        case 'falling':
          filteredCoins = filteredCoins.filter(coin => coin.isPriceFalling24h());
          break;
        case 'stable':
          filteredCoins = filteredCoins.filter(coin => 
            !coin.isPriceRising24h() && !coin.isPriceFalling24h()
          );
          break;
      }
    }

    return filteredCoins;
  }

  /**
   * Найти аномалии в объеме торгов
   * @param {Array<Coin>} coins - Массив монет
   * @param {number} threshold - Порог аномалии (в процентах)
   * @returns {Array<Object>} Аномалии
   */
  findVolumeAnomalies(coins, threshold = 50) {
    if (!coins || coins.length === 0) return [];

    const anomalies = [];

    coins.forEach(coin => {
      const volumeChange = coin.getVolume().getValue();
      const priceChange = coin.getPriceChangePercentage24h() ? 
        coin.getPriceChangePercentage24h().getValue() : 0;

      // Аномалия: большой объем при значительном изменении цены
      if (Math.abs(priceChange) > threshold) {
        anomalies.push({
          coin: coin.getSymbol(),
          type: 'volume_price_anomaly',
          volumeChange: volumeChange,
          priceChange: priceChange,
          severity: Math.abs(priceChange) > 100 ? 'high' : 'medium'
        });
      }
    });

    return anomalies;
  }

  /**
   * Получить сводку рынка для отображения
   * @param {Array<Coin>} coins - Массив монет
   * @param {number} limit - Количество монет для отображения
   * @returns {Object} Сводка рынка
   */
  getMarketSummary(coins, limit = 20) {
    const stats = this.getMarketStats(coins);
    const topCoins = this.getTopCoinsByCriteria(coins, 'marketCap', limit);

    return {
      timestamp: new Date().toISOString(),
      stats,
      topCoins: topCoins.map(coin => ({
        rank: coin.getRank(),
        symbol: coin.getSymbol(),
        name: coin.getName(),
        price: coin.getCurrentPrice().format(),
        marketCap: coin.getMarketCap().format(),
        volume: coin.getVolume().format(),
        change24h: coin.getPriceChangePercentage24h() ? 
          coin.getPriceChangePercentage24h().format() : 'N/A'
      }))
    };
  }
}

module.exports = MarketAnalysisService; 