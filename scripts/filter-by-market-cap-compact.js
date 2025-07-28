/**
 * Скрипт для компактной фильтрации монет по минимальной капитализации
 */
const { CryptoScreenerApp } = require('../src/app');
const FilterCoinsByMarketCapCompactUseCase = require('../src/application/use-cases/FilterCoinsByMarketCapCompactUseCase');

async function filterByMarketCapCompact() {
  let app;
  
  try {
    console.log('🚀 Запуск компактной фильтрации монет по капитализации...');
    
    // Инициализировать приложение
    app = new CryptoScreenerApp();
    await app.start();
    
    // Получить зависимости
    const coinRepository = global.cryptoScreener.coinRepository;
    const notificationService = global.cryptoScreener.notificationService;
    
    // Создать use case для компактной фильтрации
    const filterUseCase = new FilterCoinsByMarketCapCompactUseCase(coinRepository, notificationService);
    
    console.log('📊 Компактная фильтрация монет с капитализацией >= 40 BTC...');
    
    // Выполнить фильтрацию
    await filterUseCase.execute({
      totalLimit: 250,        // Анализируем топ-250 монет (один запрос)
      minMarketCapBTC: 40,    // Минимальная капитализация 40 BTC
      currency: 'btc',        // В BTC парах
      maxResults: 200         // Показываем топ-200 из отфильтрованных
    });
    
    console.log('✅ Компактная фильтрация завершена успешно!');
    
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
  filterByMarketCapCompact().catch(error => {
    console.error('❌ Критическая ошибка:', error.message);
    process.exit(1);
  });
}

module.exports = { filterByMarketCapCompact }; 