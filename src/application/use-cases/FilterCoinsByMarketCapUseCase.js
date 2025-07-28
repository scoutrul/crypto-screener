const CoinRepository = require('../../domain/repositories/CoinRepository');
const NotificationService = require('../services/NotificationService');

/**
 * Use Case для фильтрации монет по минимальной капитализации
 */
class FilterCoinsByMarketCapUseCase {
  constructor(coinRepository, notificationService) {
    this.coinRepository = coinRepository;
    this.notificationService = notificationService;
  }

  /**
   * Выполнить фильтрацию монет по минимальной капитализации
   * @param {Object} params - Параметры
   * @param {number} params.totalLimit - Общее количество монет для анализа (по умолчанию 100)
   * @param {number} params.minMarketCapBTC - Минимальная капитализация в BTC (по умолчанию 40)
   * @param {string} params.currency - Валюта (по умолчанию 'btc')
   * @returns {Promise<void>}
   */
  async execute(params = {}) {
    const {
      totalLimit = 100,
      minMarketCapBTC = 40,
      currency = 'btc'
    } = params;

    try {
      console.log(`=== Фильтрация монет по капитализации >= ${minMarketCapBTC} BTC ===`);
      console.log(`Параметры: totalLimit=${totalLimit}, minMarketCapBTC=${minMarketCapBTC}, currency=${currency}`);
      
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
      const allCoins = await this.coinRepository.getTopCoinsByMarketCap(totalLimit, currency);
      
      if (!allCoins || allCoins.length === 0) {
        throw new Error('Не удалось получить данные о монетах');
      }

      console.log(`Получено ${allCoins.length} монет для анализа`);

      // Фильтровать монеты по минимальной капитализации за 24 часа
      console.log(`Фильтрация монет с капитализацией за 24ч >= ${minMarketCapBTC} BTC...`);
      const filteredCoins = allCoins.filter(coin => {
        try {
          const marketCap24h = coin.getMarketCap24h();
          return marketCap24h && marketCap24h.getValue() >= minMarketCapBTC;
        } catch (error) {
          console.warn(`Ошибка получения капитализации за 24ч для ${coin.getSymbol()}:`, error.message);
          return false;
        }
      });

      console.log(`Найдено ${filteredCoins.length} монет с капитализацией за 24ч >= ${minMarketCapBTC} BTC`);

      if (filteredCoins.length === 0) {
        await this.notificationService.sendNotification(
          'Фильтрация завершена',
          `Не найдено монет с капитализацией за 24ч >= ${minMarketCapBTC} BTC среди топ-${totalLimit} монет.`,
          'info'
        );
        return;
      }

      // Отправить результаты фильтрации
      await this.sendFilteredResults(filteredCoins, allCoins.length, minMarketCapBTC);

      console.log('✅ Фильтрация монет по капитализации завершена успешно!');
      
    } catch (error) {
      console.error('❌ Ошибка при фильтрации монет:', error.message);
      
      // Отправить уведомление об ошибке
      try {
        await this.notificationService.sendErrorNotification(error, 'FilterCoinsByMarketCapUseCase');
      } catch (sendError) {
        console.error('Не удалось отправить уведомление об ошибке:', sendError.message);
      }
      
      throw error;
    }
  }

  /**
   * Отправить результаты фильтрации
   * @param {Array<Coin>} filteredCoins - Отфильтрованные монеты
   * @param {number} totalAnalyzed - Общее количество проанализированных монет
   * @param {number} minMarketCapBTC - Минимальная капитализация
   */
  async sendFilteredResults(filteredCoins, totalAnalyzed, minMarketCapBTC) {
    // Создать список отфильтрованных монет
    const coinList = filteredCoins.map((coin, index) => {
      const rank = index + 1;
      const symbol = coin.getSymbol() || 'N/A';
      
      // Безопасное получение данных
      let marketCap24h = 0;
      let currentMarketCap = 0;
      let price = 0;
      let change24h = 0;
      
      try {
        const marketCap24hObj = coin.getMarketCap24h();
        marketCap24h = marketCap24hObj ? marketCap24hObj.getValue() : 0;
      } catch (error) {
        console.warn(`Ошибка получения капитализации за 24ч для ${symbol}:`, error.message);
      }
      
      try {
        const marketCapObj = coin.getMarketCap();
        currentMarketCap = marketCapObj ? marketCapObj.getValue() : 0;
      } catch (error) {
        console.warn(`Ошибка получения текущей капитализации для ${symbol}:`, error.message);
      }
      
      try {
        const priceObj = coin.getCurrentPrice();
        price = priceObj ? priceObj.getValue() : 0;
      } catch (error) {
        console.warn(`Ошибка получения цены для ${symbol}:`, error.message);
      }
      
      try {
        const changeObj = coin.getPriceChangePercentage24h();
        change24h = changeObj ? changeObj.getValue() : 0;
      } catch (error) {
        console.warn(`Ошибка получения изменения цены для ${symbol}:`, error.message);
      }
      
      // Форматируем цену
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
      
      return `${rank.toString().padStart(2)}. ${symbol.padEnd(8)} ${changeEmoji} ${changeSign}${change24h.toFixed(2)}% | ${priceFormatted} | ${marketCap24h.toFixed(2)} BTC (24ч)`;
    });

    // Разбить на части по 50 монет (максимум для Telegram)
    const chunks = [];
    for (let i = 0; i < coinList.length; i += 50) {
      chunks.push(coinList.slice(i, i + 50));
    }

    // Отправить каждую часть с обработкой rate limit
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const partNumber = i + 1;
      const totalParts = chunks.length;
      
      const message = `📊 **МОНЕТЫ С КАПИТАЛИЗАЦИЕЙ ЗА 24Ч >= ${minMarketCapBTC} BTC** (часть ${partNumber}/${totalParts})

${chunk.join('\n')}

🕐 Обновлено: ${new Date().toLocaleString('ru-RU')}`;

      console.log(`📤 Отправка части ${partNumber}/${totalParts}...`);
      
      // Отправка с повторными попытками при rate limit
      await this.sendWithRetry(
        `Монеты за 24ч >= ${minMarketCapBTC} BTC (часть ${partNumber}/${totalParts})`,
        message,
        'info',
        partNumber,
        totalParts
      );
      
      // Увеличенная пауза между сообщениями для избежания rate limit
      if (i < chunks.length - 1) {
        console.log(`⏳ Пауза 3 секунды перед следующей частью...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    // Отправить итоговую статистику
    const risingCoins = filteredCoins.filter(coin => {
      try {
        return coin.isPriceRising24h();
      } catch (error) {
        return false;
      }
    }).length;
    
    const fallingCoins = filteredCoins.filter(coin => {
      try {
        return coin.isPriceFalling24h();
      } catch (error) {
        return false;
      }
    }).length;
    
    const stableCoins = filteredCoins.length - risingCoins - fallingCoins;
    
    const totalMarketCap24h = filteredCoins.reduce((sum, coin) => {
      try {
        const marketCap24h = coin.getMarketCap24h();
        return sum + (marketCap24h ? marketCap24h.getValue() : 0);
      } catch (error) {
        return sum;
      }
    }, 0);
    
    const statsMessage = `📈 **СТАТИСТИКА МОНЕТ ЗА 24Ч >= ${minMarketCapBTC} BTC**

📊 Найдено: ${filteredCoins.length} монет из ${totalAnalyzed} проанализированных
💰 Общая капитализация за 24ч: ${totalMarketCap24h.toFixed(2)} BTC

📈 Растущих: ${risingCoins} (${(risingCoins/filteredCoins.length*100).toFixed(1)}%)
📉 Падающих: ${fallingCoins} (${(fallingCoins/filteredCoins.length*100).toFixed(1)}%)
➡️ Стабильных: ${stableCoins} (${(stableCoins/filteredCoins.length*100).toFixed(1)}%)

🔗 Данные: CoinGecko API`;

    console.log('📤 Отправка статистики...');
    await this.sendWithRetry(
      `Статистика монет за 24ч >= ${minMarketCapBTC} BTC`,
      statsMessage,
      'info',
      'stats',
      'stats'
    );
  }

  /**
   * Отправить сообщение с повторными попытками при rate limit
   * @param {string} title - Заголовок
   * @param {string} message - Сообщение
   * @param {string} type - Тип сообщения
   * @param {string|number} partNumber - Номер части
   * @param {string|number} totalParts - Общее количество частей
   */
  async sendWithRetry(title, message, type, partNumber, totalParts) {
    const maxRetries = 5;
    const baseDelay = 5000; // 5 секунд
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.notificationService.sendNotification(title, message, type);
        console.log(`✅ Часть ${partNumber}/${totalParts} отправлена успешно (попытка ${attempt})`);
        return;
      } catch (error) {
        const isRateLimit = error.message && error.message.includes('429');
        
        if (isRateLimit && attempt < maxRetries) {
          const delay = baseDelay * attempt; // Увеличиваем задержку с каждой попыткой
          console.log(`⚠️ Rate limit (429) для части ${partNumber}/${totalParts}. Попытка ${attempt}/${maxRetries}`);
          console.log(`⏳ Ожидание ${delay/1000} секунд перед повторной попыткой...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          console.error(`❌ Не удалось отправить часть ${partNumber}/${totalParts} после ${attempt} попыток:`, error.message);
          throw error;
        }
      }
    }
  }
}

module.exports = FilterCoinsByMarketCapUseCase; 