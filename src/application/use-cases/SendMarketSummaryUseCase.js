const CoinRepository = require('../../domain/repositories/CoinRepository');
const NotificationService = require('../services/NotificationService');

/**
 * Use Case для отправки сводки рынка
 */
class SendMarketSummaryUseCase {
  constructor(coinRepository, notificationService) {
    this.coinRepository = coinRepository;
    this.notificationService = notificationService;
  }

  /**
   * Выполнить отправку сводки рынка
   * @param {Object} params - Параметры
   * @param {number} params.limit - Количество монет для отображения
   * @param {number} params.totalLimit - Общее количество монет для анализа
   * @param {string} params.currency - Валюта
   * @returns {Promise<void>}
   */
  async execute(params = {}) {
    const {
      limit = 20,
      totalLimit = 1000,
      currency = 'btc'
    } = params;

    try {
      console.log(`=== Отправка сводки рынка ===`);
      console.log(`Параметры: limit=${limit}, totalLimit=${totalLimit}, currency=${currency}`);
      
      // Проверить доступность репозитория
      const isCoinGeckoAvailable = await this.coinRepository.isAvailable();
      if (!isCoinGeckoAvailable) {
        throw new Error('CoinGecko API недоступен');
      }

      // Проверить доступность сервиса уведомлений
      const isNotificationAvailable = await this.notificationService.isAvailable();
      if (!isNotificationAvailable) {
        throw new Error('Сервис уведомлений недоступен');
      }

      // Получить топ монет
      console.log(`Получение топ-${totalLimit} монет по капитализации...`);
      const coins = await this.coinRepository.getTopCoinsByMarketCap(totalLimit, currency);
      
      if (!coins || coins.length === 0) {
        throw new Error('Не удалось получить данные о монетах');
      }

      console.log(`Получено ${coins.length} монет`);

      // Отправить сводку
      console.log(`Отправка сводки топ-${limit} монет...`);
      await this.notificationService.sendMarketSummary(coins, limit);

      console.log('✅ Сводка рынка успешно отправлена!');
      
    } catch (error) {
      console.error('❌ Ошибка при отправке сводки рынка:', error.message);
      
      // Отправить уведомление об ошибке
      try {
        await this.notificationService.sendErrorNotification(error, 'SendMarketSummaryUseCase');
      } catch (sendError) {
        console.error('Не удалось отправить уведомление об ошибке:', sendError.message);
      }
      
      throw error;
    }
  }

  /**
   * Выполнить отправку сводки с фильтрацией
   * @param {Object} params - Параметры
   * @param {number} params.limit - Количество монет для отображения
   * @param {number} params.totalLimit - Общее количество монет для анализа
   * @param {string} params.currency - Валюта
   * @param {Object} params.filters - Фильтры
   * @returns {Promise<void>}
   */
  async executeWithFilters(params = {}) {
    const {
      limit = 20,
      totalLimit = 1000,
      currency = 'btc',
      filters = {}
    } = params;

    try {
      console.log(`=== Отправка сводки рынка с фильтрами ===`);
      console.log(`Параметры: limit=${limit}, totalLimit=${totalLimit}, currency=${currency}`);
      console.log(`Фильтры:`, filters);
      
      // Получить топ монет
      const coins = await this.coinRepository.getTopCoinsByMarketCap(totalLimit, currency);
      
      if (!coins || coins.length === 0) {
        throw new Error('Не удалось получить данные о монетах');
      }

      // Применить фильтры
      let filteredCoins = coins;
      
      if (filters.minMarketCap) {
        filteredCoins = filteredCoins.filter(coin => 
          coin.getMarketCap().getValue() >= filters.minMarketCap
        );
      }

      if (filters.maxMarketCap) {
        filteredCoins = filteredCoins.filter(coin => 
          coin.getMarketCap().getValue() <= filters.maxMarketCap
        );
      }

      if (filters.priceDirection) {
        switch (filters.priceDirection) {
          case 'rising':
            filteredCoins = filteredCoins.filter(coin => coin.isPriceRising24h());
            break;
          case 'falling':
            filteredCoins = filteredCoins.filter(coin => coin.isPriceFalling24h());
            break;
        }
      }

      console.log(`После фильтрации: ${filteredCoins.length} монет`);

      // Отправить сводку
      await this.notificationService.sendMarketSummary(filteredCoins, limit);

      console.log('✅ Сводка рынка с фильтрами успешно отправлена!');
      
    } catch (error) {
      console.error('❌ Ошибка при отправке сводки рынка с фильтрами:', error.message);
      throw error;
    }
  }

  /**
   * Выполнить отправку сводки только растущих монет
   * @param {Object} params - Параметры
   * @returns {Promise<void>}
   */
  async executeRisingCoins(params = {}) {
    return this.executeWithFilters({
      ...params,
      filters: { priceDirection: 'rising' }
    });
  }

  /**
   * Выполнить отправку сводки только падающих монет
   * @param {Object} params - Параметры
   * @returns {Promise<void>}
   */
  async executeFallingCoins(params = {}) {
    return this.executeWithFilters({
      ...params,
      filters: { priceDirection: 'falling' }
    });
  }
}

module.exports = SendMarketSummaryUseCase; 