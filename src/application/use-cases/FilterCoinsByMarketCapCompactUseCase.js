const CoinRepository = require('../../domain/repositories/CoinRepository');
const NotificationService = require('../services/NotificationService');

/**
 * Компактный Use Case для фильтрации монет по минимальной капитализации
 * Отправляет больше монет в одном сообщении
 */
class FilterCoinsByMarketCapCompactUseCase {
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
      currency = 'btc',
      maxResults = null
    } = params;

    try {
      console.log(`=== Компактная фильтрация монет по капитализации >= ${minMarketCapBTC} BTC ===`);
      console.log(`Параметры: totalLimit=${totalLimit}, minMarketCapBTC=${minMarketCapBTC}, currency=${currency}, maxResults=${maxResults || 'не ограничено'}`);
      
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

      // Фильтровать монеты по минимальной капитализации за 24 часа и исключить стейблкоины
      console.log(`Фильтрация монет с капитализацией за 24ч >= ${minMarketCapBTC} BTC (исключая стейблкоины)...`);
      
      // Сначала исключаем стейблкоины
      const nonStablecoins = allCoins.filter(coin => !this.isStablecoin(coin));
      console.log(`Исключено ${allCoins.length - nonStablecoins.length} стейблкоинов`);
      
      // Затем фильтруем по капитализации
      const filteredCoins = nonStablecoins.filter(coin => {
        try {
          const marketCap24h = coin.getMarketCap24h();
          return marketCap24h && marketCap24h.getValue() >= minMarketCapBTC;
        } catch (error) {
          console.warn(`Ошибка получения капитализации за 24ч для ${coin.getSymbol()}:`, error.message);
          return false;
        }
      });

      console.log(`Найдено ${filteredCoins.length} монет с капитализацией за 24ч >= ${minMarketCapBTC} BTC (без стейблкоинов)`);

      // Ограничить количество результатов если указано
      let finalCoins = filteredCoins;
      if (maxResults && filteredCoins.length > maxResults) {
        finalCoins = filteredCoins.slice(0, maxResults);
        console.log(`Ограничено до топ-${maxResults} монет из ${filteredCoins.length} найденных`);
      }

      if (finalCoins.length === 0) {
        await this.notificationService.sendNotification(
          'Фильтрация завершена',
          `Не найдено монет с капитализацией за 24ч >= ${minMarketCapBTC} BTC среди топ-${totalLimit} монет (исключая стейблкоины).`,
          'info'
        );
        return;
      }

      // Отправить результаты фильтрации в компактном формате
      await this.sendCompactResults(finalCoins, allCoins.length, minMarketCapBTC);

      console.log('✅ Компактная фильтрация монет по капитализации завершена успешно!');
      
    } catch (error) {
      console.error('❌ Ошибка при фильтрации монет:', error.message);
      
      // Отправить уведомление об ошибке
      try {
        await this.notificationService.sendErrorNotification(error, 'FilterCoinsByMarketCapCompactUseCase');
      } catch (sendError) {
        console.error('Не удалось отправить уведомление об ошибке:', sendError.message);
      }
      
      throw error;
    }
  }

  /**
   * Проверить, является ли монета стейблкоином
   * @param {Coin} coin - Монета для проверки
   * @returns {boolean} - true если это стейблкоин
   */
  isStablecoin(coin) {
    const symbol = coin.getSymbol()?.toUpperCase() || '';
    const name = coin.getName()?.toUpperCase() || '';
    
    // Список ключевых слов для стейблкоинов
    const stablecoinKeywords = [
      'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'KRW', 'CAD', 'AUD', 'CHF', 'SGD',
      'USDT', 'USDC', 'BUSD', 'DAI', 'TUSD', 'FRAX', 'USDP', 'USDD', 'GUSD',
      'USDK', 'USDN', 'USDJ', 'USDK', 'USDN', 'USDJ', 'USDK', 'USDN', 'USDJ'
    ];
    
    // Проверяем символ и название на наличие ключевых слов
    return stablecoinKeywords.some(keyword => 
      symbol.includes(keyword) || name.includes(keyword)
    );
  }

  /**
   * Отправить результаты фильтрации в компактном формате
   * @param {Array<Coin>} filteredCoins - Отфильтрованные монеты
   * @param {number} totalAnalyzed - Общее количество проанализированных монет
   * @param {number} minMarketCapBTC - Минимальная капитализация
   */
  async sendCompactResults(filteredCoins, totalAnalyzed, minMarketCapBTC) {
    // Создать компактный список отфильтрованных монет
    const coinList = filteredCoins.map((coin, index) => {
      const rank = index + 1;
      const symbol = coin.getSymbol() || 'N/A';
      
      // Безопасное получение данных
      let marketCap24h = 0;
      let price = 0;
      let change24h = 0;
      
      try {
        const marketCap24hObj = coin.getMarketCap24h();
        marketCap24h = marketCap24hObj ? marketCap24hObj.getValue() : 0;
      } catch (error) {
        console.warn(`Ошибка получения капитализации за 24ч для ${symbol}:`, error.message);
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
      
      // Компактное форматирование цены
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
      
      // Компактный формат: Ранг. Символ Эмодзи Изменение% | Цена | Капитализация за 24ч BTC
      return `${rank.toString().padStart(2)}.${symbol.padEnd(6)}${changeEmoji}${changeSign}${change24h.toFixed(1)}%|${priceFormatted}|${marketCap24h.toFixed(1)}BTC(24h)`;
    });

    // Разбить на части по 50 монет (уменьшено для избежания ошибки 400)
    const chunks = [];
    for (let i = 0; i < coinList.length; i += 50) {
      chunks.push(coinList.slice(i, i + 50));
    }

    // Отправить каждую часть с обработкой rate limit
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const partNumber = i + 1;
      const totalParts = chunks.length;
      
      const message = `📊 **МОНЕТЫ ЗА 24Ч >= ${minMarketCapBTC} BTC** (${partNumber}/${totalParts})
🚫 **Исключены стейблкоины**

${chunk.join('\n')}

🕐 ${new Date().toLocaleString('ru-RU')}`;

      // Проверить длину сообщения
      const messageLength = message.length;
      console.log(`📏 Длина сообщения: ${messageLength} символов`);
      
      if (messageLength > 4000) {
        console.warn(`⚠️ Сообщение слишком длинное (${messageLength} символов), обрезаем...`);
        const maxLength = 4000;
        const header = `📊 **МОНЕТЫ ЗА 24Ч >= ${minMarketCapBTC} BTC** (${partNumber}/${totalParts})\n\n`;
        const footer = `\n\n🕐 ${new Date().toLocaleString('ru-RU')}`;
        const availableLength = maxLength - header.length - footer.length;
        
        const truncatedChunk = chunk.slice(0, Math.floor(availableLength / 50)); // Примерная оценка
        const truncatedMessage = header + truncatedChunk.join('\n') + footer;
        console.log(`📏 Обрезанное сообщение: ${truncatedMessage.length} символов`);
        
        console.log(`📤 Отправка обрезанной части ${partNumber}/${totalParts}...`);
        await this.sendWithRetry(
          `Монеты за 24ч >= ${minMarketCapBTC} BTC (${partNumber}/${totalParts})`,
          truncatedMessage,
          'info',
          partNumber,
          totalParts
        );
      } else {
        console.log(`📤 Отправка компактной части ${partNumber}/${totalParts}...`);
        await this.sendWithRetry(
          `Монеты за 24ч >= ${minMarketCapBTC} BTC (${partNumber}/${totalParts})`,
          message,
          'info',
          partNumber,
          totalParts
        );
      }
      
      // Увеличенная пауза между сообщениями для избежания rate limit
      if (i < chunks.length - 1) {
        console.log(`⏳ Пауза 5 секунд перед следующей частью...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
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
    
    const statsMessage = `📈 **СТАТИСТИКА ЗА 24Ч >= ${minMarketCapBTC} BTC**
🚫 **Исключены стейблкоины**

📊 Найдено: ${filteredCoins.length} из ${totalAnalyzed}
💰 Общая капитализация за 24ч: ${totalMarketCap24h.toFixed(2)} BTC

📈 Растущих: ${risingCoins} (${(risingCoins/filteredCoins.length*100).toFixed(1)}%)
📉 Падающих: ${fallingCoins} (${(fallingCoins/filteredCoins.length*100).toFixed(1)}%)
➡️ Стабильных: ${stableCoins} (${(stableCoins/filteredCoins.length*100).toFixed(1)}%)

🔗 CoinGecko API`;

    console.log('📤 Отправка статистики...');
    await this.sendWithRetry(
      `Статистика за 24ч >= ${minMarketCapBTC} BTC`,
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
    const baseDelay = 10000; // 10 секунд для компактной версии
    
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

module.exports = FilterCoinsByMarketCapCompactUseCase; 