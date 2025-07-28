const axios = require('axios');
const Coin = require('../../domain/entities/Coin');

/**
 * Адаптер для работы с CoinGecko API
 */
class CoinGeckoAdapter {
  constructor() {
    this.baseURL = 'https://api.coingecko.com/api/v3';
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Crypto-Screener/1.0'
      }
    });

    // Добавить обработчик для rate limiting
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 429) {
          console.log('Rate limit hit, waiting 60 seconds...');
          await new Promise(resolve => setTimeout(resolve, 60000));
          return this.client.request(error.config);
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Получить топ монет по рыночной капитализации
   * @param {number} limit - Количество монет
   * @param {string} currency - Валюта
   * @returns {Promise<Array<Coin>>}
   */
  async getTopCoinsByMarketCap(limit = 1000, currency = 'btc') {
    try {
      console.log(`Fetching top ${limit} coins by market cap in ${currency.toUpperCase()} pairs...`);
      
      const allCoins = [];
      const perPage = 250; // CoinGecko позволяет до 250 на страницу
      const totalPages = Math.ceil(limit / perPage);
      
      for (let page = 1; page <= totalPages; page++) {
        console.log(`Fetching page ${page}/${totalPages}...`);
        
        const response = await this.client.get('/coins/markets', {
          params: {
            vs_currency: currency,
            order: 'market_cap_desc',
            per_page: perPage,
            page: page,
            sparkline: false,
            price_change_percentage: '24h,7d,30d'
          }
        });

        const markets = response.data;
        allCoins.push(...markets);
        
        console.log(`Fetched ${markets.length} coins from page ${page}`);
        
        // Добавить задержку для соблюдения rate limits
        if (page < totalPages) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      console.log(`Successfully fetched ${allCoins.length} coins total`);
      
      // Обрезать до запрошенного количества
      const trimmedCoins = allCoins.slice(0, limit);
      console.log(`Returning ${trimmedCoins.length} coins (requested: ${limit})`);
      
      // Преобразовать в доменные сущности
      return trimmedCoins.map(data => Coin.fromApiData(data));
      
    } catch (error) {
      console.error('Error fetching top coins:', error.message);
      if (error.response) {
        console.error('API Error Status:', error.response.status);
        console.error('API Error Data:', error.response.data);
      }
      throw error;
    }
  }

  /**
   * Получить монету по ID
   * @param {string} id - ID монеты
   * @returns {Promise<Coin|null>}
   */
  async getCoinById(id) {
    try {
      console.log(`Fetching data for coin: ${id}`);
      
      const response = await this.client.get(`/coins/${id}`, {
        params: {
          localization: false,
          tickers: false,
          market_data: true,
          community_data: false,
          developer_data: false,
          sparkline: false
        }
      });
      
      const coinData = response.data;
      
      // Преобразовать данные в формат, совместимый с fromApiData
      const apiData = {
        id: coinData.id,
        symbol: coinData.symbol,
        name: coinData.name,
        current_price: coinData.market_data?.current_price?.btc || 0,
        market_cap: coinData.market_data?.market_cap?.btc || 0,
        total_volume: coinData.market_data?.total_volume?.btc || 0,
        market_cap_rank: null,
        price_change_24h: coinData.market_data?.price_change_24h || 0,
        price_change_percentage_24h: coinData.market_data?.price_change_percentage_24h || 0,
        price_change_percentage_7d: coinData.market_data?.price_change_percentage_7d || 0,
        price_change_percentage_30d: coinData.market_data?.price_change_percentage_30d || 0,
        market_cap_change_24h: coinData.market_data?.market_cap_change_24h || 0,
        market_cap_change_percentage_24h: coinData.market_data?.market_cap_change_percentage_24h || 0,
        circulating_supply: coinData.market_data?.circulating_supply,
        total_supply: coinData.market_data?.total_supply,
        max_supply: coinData.market_data?.max_supply,
        ath: coinData.market_data?.ath?.btc,
        ath_change_percentage: coinData.market_data?.ath_change_percentage?.btc,
        ath_date: coinData.market_data?.ath_date,
        atl: coinData.market_data?.atl?.btc,
        atl_change_percentage: coinData.market_data?.atl_change_percentage?.btc,
        atl_date: coinData.market_data?.atl_date,
        last_updated: coinData.last_updated,
        image: coinData.image?.large
      };
      
      return Coin.fromApiData(apiData);
      
    } catch (error) {
      console.error(`Error fetching data for coin ${id}:`, error.message);
      if (error.response) {
        console.error('API Error Status:', error.response.status);
        console.error('API Error Data:', error.response.data);
      }
      throw error;
    }
  }

  /**
   * Получить трендовые монеты
   * @returns {Promise<Array<Coin>>}
   */
  async getTrendingCoins() {
    try {
      console.log('Fetching trending coins...');
      
      const response = await this.client.get('/search/trending');
      const trending = response.data;
      
      // Преобразовать трендовые данные в формат Coin
      const coins = trending.coins.map((item, index) => {
        const apiData = {
          id: item.item.id,
          symbol: item.item.symbol,
          name: item.item.name,
          current_price: item.item.price_btc || 0,
          market_cap: item.item.market_cap_btc || 0,
          total_volume: item.item.total_volume_btc || 0,
          market_cap_rank: item.item.market_cap_rank,
          price_change_24h: 0,
          price_change_percentage_24h: 0,
          price_change_percentage_7d: 0,
          price_change_percentage_30d: 0,
          market_cap_change_24h: 0,
          market_cap_change_percentage_24h: 0,
          circulating_supply: null,
          total_supply: null,
          max_supply: null,
          ath: null,
          ath_change_percentage: null,
          ath_date: null,
          atl: null,
          atl_change_percentage: null,
          atl_date: null,
          last_updated: new Date().toISOString(),
          image: item.item.large
        };
        
        return Coin.fromApiData(apiData);
      });
      
      return coins;
      
    } catch (error) {
      console.error('Error fetching trending coins:', error.message);
      if (error.response) {
        console.error('API Error Status:', error.response.status);
        console.error('API Error Data:', error.response.data);
      }
      throw error;
    }
  }

  /**
   * Получить поддерживаемые валюты
   * @returns {Promise<Array<string>>}
   */
  async getSupportedCurrencies() {
    try {
      console.log('Fetching supported currencies...');
      
      const response = await this.client.get('/simple/supported_vs_currencies');
      return response.data;
      
    } catch (error) {
      console.error('Error fetching supported currencies:', error.message);
      throw error;
    }
  }

  /**
   * Проверить доступность API
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    try {
      const response = await this.client.get('/ping');
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }
}

module.exports = CoinGeckoAdapter; 