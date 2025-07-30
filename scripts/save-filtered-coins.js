/**
 * Скрипт для сохранения списка отфильтрованных монет
 */
const { CryptoScreenerApp } = require('../src/app');
const FilterCoinsByMarketCapCompactUseCase = require('../src/application/use-cases/FilterCoinsByMarketCapCompactUseCase');
const fs = require('fs').promises;
const path = require('path');

async function saveFilteredCoins() {
  let app;
  
  try {
    console.log('🚀 Запуск сохранения отфильтрованных монет...');
    
    // Инициализировать приложение
    app = new CryptoScreenerApp();
    await app.start();
    
    // Получить зависимости
    const coinRepository = global.cryptoScreener.coinRepository;
    const notificationService = global.cryptoScreener.notificationService;
    
    // Создать use case для компактной фильтрации
    const filterUseCase = new FilterCoinsByMarketCapCompactUseCase(coinRepository, notificationService);
    
    console.log('📊 Получение отфильтрованных монет...');
    
    // Выполнить фильтрацию без отправки в Telegram
    const params = {
      totalLimit: 1250,        // Анализируем топ-1250 монет (один запрос)
      minMarketCapBTC: 40,    // Минимальная капитализация 40 BTC
      currency: 'btc',        // В BTC парах
      maxResults: 1250         // Показываем топ-1250 из отфильтрованных
    };

    // Получить монеты без отправки уведомлений
    const allCoins = await coinRepository.getTopCoinsByMarketCap(params.totalLimit, params.currency);
    
    if (!allCoins || allCoins.length === 0) {
      throw new Error('Не удалось получить данные о монетах');
    }

    console.log(`Получено ${allCoins.length} монет для анализа`);

    // Исключить стейблкоины
    const nonStablecoins = allCoins.filter(coin => {
      const symbol = coin.getSymbol()?.toUpperCase() || '';
      const name = coin.getName()?.toUpperCase() || '';
      
      const stablecoinKeywords = [
        'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'KRW', 'CAD', 'AUD', 'CHF', 'SGD',
        'USDT', 'USDC', 'BUSD', 'DAI', 'TUSD', 'FRAX', 'USDP', 'USDD', 'GUSD',
        'USDK', 'USDN', 'USDJ', 'USDK', 'USDN', 'USDJ', 'USDK', 'USDN', 'USDJ'
      ];
      
      return !stablecoinKeywords.some(keyword => 
        symbol.includes(keyword) || name.includes(keyword)
      );
    });

    console.log(`Исключено ${allCoins.length - nonStablecoins.length} стейблкоинов`);

    // Фильтровать по капитализации
    const filteredCoins = nonStablecoins.filter(coin => {
      try {
        const marketCap24h = coin.getMarketCap24h();
        return marketCap24h && marketCap24h.getValue() >= params.minMarketCapBTC;
      } catch (error) {
        console.warn(`Ошибка получения капитализации за 24ч для ${coin.getSymbol()}:`, error.message);
        return false;
      }
    });

    console.log(`Найдено ${filteredCoins.length} монет с капитализацией за 24ч >= ${params.minMarketCapBTC} BTC (без стейблкоинов)`);

    // Ограничить количество результатов
    let finalCoins = filteredCoins;
    if (params.maxResults && filteredCoins.length > params.maxResults) {
      finalCoins = filteredCoins.slice(0, params.maxResults);
      console.log(`Ограничено до топ-${params.maxResults} монет из ${filteredCoins.length} найденных`);
    }

    // Преобразовать в простой формат для сохранения
    const coinsData = finalCoins.map(coin => ({
      id: coin.getId(),
      symbol: coin.getSymbol(),
      name: coin.getName(),
      currentPrice: coin.getCurrentPrice()?.getValue() || 0,
      marketCap: coin.getMarketCap()?.getValue() || 0,
      marketCap24h: coin.getMarketCap24h()?.getValue() || 0,
      volume: coin.getVolume()?.getValue() || 0,
      priceChange24h: coin.getPriceChangePercentage24h()?.getValue() || 0,
      lastUpdated: coin.getLastUpdated()
    }));

    // Meta-блок (только инфо о фильтрации)
    const meta = {
      source: 'CoinGecko top 1000',
      filter: 'Binance only, exclude stablecoins',
      params,
      savedAt: new Date().toISOString()
    };

    // Итоговый объект
    const result = {
      meta,
      coins: coinsData
    };

    // Сохранить в файл
    const dataDir = path.join(__dirname, '..', 'data');
    await fs.mkdir(dataDir, { recursive: true });
    const filename = path.join(dataDir, 'filtered-coins.json');
    await fs.writeFile(filename, JSON.stringify(result, null, 2));
    console.log(`✅ Сохранено ${coinsData.length} монет в файл: ${filename}`);
    console.log('META:', JSON.stringify(meta, null, 2));
    
    // Отправить уведомление о сохранении
    await notificationService.sendNotification(
      'Список монет обновлен',
      `Сохранено ${finalCoins.length} отфильтрованных монет для мониторинга аномалий.`,
      'info'
    );

  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    if (app) {
      await app.stop();
    }
  }
}

// Запуск скрипта
if (require.main === module) {
  saveFilteredCoins().catch(error => {
    console.error('❌ Критическая ошибка:', error.message);
    process.exit(1);
  });
}

module.exports = { saveFilteredCoins }; 