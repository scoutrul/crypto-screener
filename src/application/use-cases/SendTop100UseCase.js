const CoinRepository = require('../../domain/repositories/CoinRepository');
const NotificationService = require('../services/NotificationService');

/**
 * Оптимизированный Use Case для отправки топ-100 монет
 * Использует только один запрос к API вместо четырех
 */
class SendTop100UseCase {
  constructor(coinRepository, notificationService) {
    this.coinRepository = coinRepository;
    this.notificationService = notificationService;
  }

  /**
   * Выполнить отправку топ-100 монет
   * @param {Object} params - Параметры
   * @param {number} params.limit - Количество монет для отображения (по умолчанию 100)
   * @param {string} params.currency - Валюта (по умолчанию 'btc')
   * @returns {Promise<void>}
   */
  async execute(params = {}) {
    const {
      limit = 100,
      currency = 'btc'
    } = params;

    try {
      console.log(`=== Отправка топ-${limit} монет (оптимизированно) ===`);
      console.log(`Параметры: limit=${limit}, currency=${currency}`);
      
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

      // Получить топ монет (только нужное количество)
      console.log(`Получение топ-${limit} монет по капитализации (1 запрос)...`);
      const coins = await this.coinRepository.getTopCoinsByMarketCap(limit, currency);
      
      if (!coins || coins.length === 0) {
        throw new Error('Не удалось получить данные о монетах');
      }

      console.log(`Получено ${coins.length} монет (оптимизированно)`);

      // Отправить сводку
      console.log(`Отправка сводки топ-${limit} монет...`);
      await this.notificationService.sendMarketSummary(coins, limit);

      console.log('✅ Топ-100 монет успешно отправлены!');
      
    } catch (error) {
      console.error('❌ Ошибка при отправке топ-100 монет:', error.message);
      
      // Отправить уведомление об ошибке
      try {
        await this.notificationService.sendErrorNotification(error, 'SendTop100UseCase');
      } catch (sendError) {
        console.error('Не удалось отправить уведомление об ошибке:', sendError.message);
      }
      
      throw error;
    }
  }

  /**
   * Выполнить отправку топ-100 монет в упрощенном формате
   * @param {Object} params - Параметры
   * @returns {Promise<void>}
   */
  async executeSimpleFormat(params = {}) {
    const {
      limit = 100,
      currency = 'btc'
    } = params;

    try {
      console.log(`=== Отправка топ-${limit} монет в упрощенном формате ===`);
      
      // Получить топ монет (только нужное количество)
      console.log(`Получение топ-${limit} монет по капитализации (1 запрос)...`);
      const coins = await this.coinRepository.getTopCoinsByMarketCap(limit, currency);
      
      if (!coins || coins.length === 0) {
        throw new Error('Не удалось получить данные о монетах');
      }

      console.log(`Получено ${coins.length} монет (оптимизированно)`);

      // Создать упрощенный список
      const simpleList = coins.map((coin, index) => {
        const rank = index + 1;
        const symbol = coin.getSymbol() || 'N/A';
        
        // Безопасное получение цены
        let price = 0;
        try {
          const currentPrice = coin.getCurrentPrice();
          price = currentPrice ? currentPrice.getValue() : 0;
        } catch (error) {
          console.warn(`Ошибка получения цены для ${symbol}:`, error.message);
          price = 0;
        }
        
        // Безопасное получение изменения цены
        let change24h = 0;
        try {
          const priceChange = coin.getPriceChangePercentage24h();
          change24h = priceChange ? priceChange.getValue() : 0;
        } catch (error) {
          console.warn(`Ошибка получения изменения цены для ${symbol}:`, error.message);
          change24h = 0;
        }
        
        // Форматируем цену в зависимости от величины
        let priceFormatted;
        if (price >= 1) {
          priceFormatted = `$${price.toFixed(2)}`;
        } else if (price >= 0.01) {
          priceFormatted = `$${price.toFixed(4)}`;
        } else {
          priceFormatted = `$${price.toFixed(6)}`;
        }
        
        // Эмодзи для изменения цены
        const changeEmoji = change24h > 0 ? '📈' : change24h < 0 ? '📉' : '➡️';
        const changeSign = change24h > 0 ? '+' : '';
        
        return `${rank.toString().padStart(2)}. ${symbol.padEnd(8)} ${changeEmoji} ${changeSign}${change24h.toFixed(2)}% | ${priceFormatted}`;
      });

      // Разбить на части по 20 монет
      const chunks = [];
      for (let i = 0; i < simpleList.length; i += 20) {
        chunks.push(simpleList.slice(i, i + 20));
      }

      // Отправить каждую часть
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const partNumber = i + 1;
        const totalParts = chunks.length;
        
        const message = `📊 **ТОП-${limit} КРИПТОВАЛЮТ ПО КАПИТАЛИЗАЦИИ** (часть ${partNumber}/${totalParts})

${chunk.join('\n')}

🕐 Обновлено: ${new Date().toLocaleString('ru-RU')}`;

        console.log(`📤 Отправка части ${partNumber}/${totalParts}...`);
        await this.notificationService.sendNotification(
          `Топ-${limit} монет (часть ${partNumber}/${totalParts})`,
          message,
          'info'
        );
        
        // Небольшая пауза между сообщениями
        if (i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      // Отправить итоговую статистику
      const risingCoins = coins.filter(coin => {
        try {
          return coin.isPriceRising24h();
        } catch (error) {
          return false;
        }
      }).length;
      
      const fallingCoins = coins.filter(coin => {
        try {
          return coin.isPriceFalling24h();
        } catch (error) {
          return false;
        }
      }).length;
      
      const stableCoins = coins.length - risingCoins - fallingCoins;
      
      const statsMessage = `📈 **СТАТИСТИКА ТОП-${limit} МОНЕТ**

📈 Растущих: ${risingCoins} (${(risingCoins/coins.length*100).toFixed(1)}%)
📉 Падающих: ${fallingCoins} (${(fallingCoins/coins.length*100).toFixed(1)}%)
➡️ Стабильных: ${stableCoins} (${(stableCoins/coins.length*100).toFixed(1)}%)

🔗 Данные: CoinGecko API (оптимизированно)`;

      console.log('📤 Отправка статистики...');
      await this.notificationService.sendNotification(
        `Статистика топ-${limit} монет`,
        statsMessage,
        'info'
      );

      console.log('✅ Топ-100 монет в упрощенном формате отправлены успешно!');
      
    } catch (error) {
      console.error('❌ Ошибка при отправке топ-100 монет в упрощенном формате:', error.message);
      throw error;
    }
  }
}

module.exports = SendTop100UseCase; 