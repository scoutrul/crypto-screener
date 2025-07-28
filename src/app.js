/**
 * Главный файл приложения с чистой архитектурой
 */
const AppConfig = require('./infrastructure/config/AppConfig');
const CoinGeckoRepository = require('./infrastructure/repositories/CoinGeckoRepository');
const TelegramNotificationRepository = require('./infrastructure/repositories/TelegramNotificationRepository');
const MarketAnalysisService = require('./domain/services/MarketAnalysisService');
const NotificationService = require('./application/services/NotificationService');
const SendMarketSummaryUseCase = require('./application/use-cases/SendMarketSummaryUseCase');

/**
 * Контейнер зависимостей
 */
class DependencyContainer {
  constructor() {
    this.config = null;
    this.coinRepository = null;
    this.notificationRepository = null;
    this.marketAnalysisService = null;
    this.notificationService = null;
    this.sendMarketSummaryUseCase = null;
  }

  /**
   * Инициализировать все зависимости
   */
  async initialize() {
    try {
      console.log('🚀 Инициализация Crypto Screener с чистой архитектурой...');

      // 1. Инициализация конфигурации
      console.log('📋 Инициализация конфигурации...');
      this.config = new AppConfig();
      
      if (!this.config.validate()) {
        throw new Error('Invalid configuration');
      }
      
      console.log(`✅ Конфигурация загружена (${this.config.app.environment} режим)`);

      // 2. Инициализация репозиториев
      console.log('🗄️ Инициализация репозиториев...');
      this.coinRepository = new CoinGeckoRepository();
      this.notificationRepository = new TelegramNotificationRepository();
      
      // Проверка доступности сервисов
      const isCoinGeckoAvailable = await this.coinRepository.isAvailable();
      const isNotificationAvailable = await this.notificationRepository.isAvailable();
      
      console.log(`✅ CoinGecko API: ${isCoinGeckoAvailable ? 'доступен' : 'недоступен'}`);
      console.log(`✅ Сервис уведомлений: ${isNotificationAvailable ? 'доступен' : 'недоступен'}`);

      // 3. Инициализация доменных сервисов
      console.log('🔧 Инициализация доменных сервисов...');
      this.marketAnalysisService = new MarketAnalysisService();
      console.log('✅ MarketAnalysisService инициализирован');

      // 4. Инициализация сервисов приложения
      console.log('⚙️ Инициализация сервисов приложения...');
      this.notificationService = new NotificationService(
        this.notificationRepository,
        this.marketAnalysisService
      );
      console.log('✅ NotificationService инициализирован');

      // 5. Инициализация use cases
      console.log('🎯 Инициализация use cases...');
      this.sendMarketSummaryUseCase = new SendMarketSummaryUseCase(
        this.coinRepository,
        this.notificationService
      );
      console.log('✅ SendMarketSummaryUseCase инициализирован');

      console.log('🎉 Все зависимости успешно инициализированы!');
      
      // Отправить уведомление о запуске
      await this.notificationService.sendStartupNotification();
      
    } catch (error) {
      console.error('❌ Ошибка инициализации:', error.message);
      throw error;
    }
  }

  /**
   * Получить конфигурацию
   */
  getConfig() {
    return this.config;
  }

  /**
   * Получить репозиторий монет
   */
  getCoinRepository() {
    return this.coinRepository;
  }

  /**
   * Получить репозиторий уведомлений
   */
  getNotificationRepository() {
    return this.notificationRepository;
  }

  /**
   * Получить сервис анализа рынка
   */
  getMarketAnalysisService() {
    return this.marketAnalysisService;
  }

  /**
   * Получить сервис уведомлений
   */
  getNotificationService() {
    return this.notificationService;
  }

  /**
   * Получить use case отправки сводки рынка
   */
  getSendMarketSummaryUseCase() {
    return this.sendMarketSummaryUseCase;
  }
}

/**
 * Главный класс приложения
 */
class CryptoScreenerApp {
  constructor() {
    this.container = new DependencyContainer();
  }

  /**
   * Запустить приложение
   */
  async start() {
    try {
      await this.container.initialize();
      console.log('🚀 Crypto Screener запущен успешно!');
      
      // Экспортировать зависимости для использования в других модулях
      global.cryptoScreener = {
        config: this.container.getConfig(),
        coinRepository: this.container.getCoinRepository(),
        notificationRepository: this.container.getNotificationRepository(),
        marketAnalysisService: this.container.getMarketAnalysisService(),
        notificationService: this.container.getNotificationService(),
        sendMarketSummaryUseCase: this.container.getSendMarketSummaryUseCase()
      };
      
    } catch (error) {
      console.error('❌ Ошибка запуска приложения:', error.message);
      process.exit(1);
    }
  }

  /**
   * Остановить приложение
   */
  async stop() {
    console.log('🛑 Остановка Crypto Screener...');
    // Здесь можно добавить логику очистки ресурсов
    console.log('✅ Crypto Screener остановлен');
  }
}

// Экспорт для использования в других модулях
module.exports = {
  CryptoScreenerApp,
  DependencyContainer
};

// Если файл запущен напрямую
if (require.main === module) {
  const app = new CryptoScreenerApp();
  
  // Обработка сигналов для корректного завершения
  process.on('SIGINT', async () => {
    console.log('\n🛑 Получен сигнал SIGINT');
    await app.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n🛑 Получен сигнал SIGTERM');
    await app.stop();
    process.exit(0);
  });

  // Запуск приложения
  app.start().catch(error => {
    console.error('❌ Критическая ошибка:', error.message);
    process.exit(1);
  });
} 