/**
 * CLI интерфейс для отправки сводки рынка
 */
class MarketSummaryCLI {
  constructor() {
    this.useCase = null;
    this.notificationService = null;
  }

  /**
   * Инициализировать CLI
   */
  async initialize() {
    try {
      // Проверить, что приложение инициализировано
      if (!global.cryptoScreener) {
        throw new Error('Приложение не инициализировано');
      }

      this.useCase = global.cryptoScreener.sendMarketSummaryUseCase;
      this.notificationService = global.cryptoScreener.notificationService;
      console.log('✅ CLI инициализирован');
      
    } catch (error) {
      console.error('❌ Ошибка инициализации CLI:', error.message);
      throw error;
    }
  }

  /**
   * Показать справку
   */
  showHelp() {
    console.log(`
📊 Crypto Screener - CLI для отправки сводки рынка

Использование:
  node src/cli.js [команда] [параметры]

Команды:
  summary [limit]           - Отправить сводку рынка (по умолчанию 20 монет)
  rising [limit]           - Отправить сводку только растущих монет
  falling [limit]          - Отправить сводку только падающих монет
  test                     - Отправить тестовое сообщение
  help                     - Показать эту справку

Параметры:
  limit                    - Количество монет для отображения (1-100)

Примеры:
  node src/cli.js summary 10
  node src/cli.js rising 15
  node src/cli.js falling 5
  node src/cli.js test

Или через npm:
  npm run summary:10
  npm run rising
  npm run falling
  npm run test

Переменные окружения:
  TELEGRAM_BOT_TOKEN       - Токен Telegram бота
  TELEGRAM_CHAT_ID         - ID чата Telegram
  NODE_ENV                 - Режим работы (development/production)
    `);
  }

  /**
   * Выполнить команду
   * @param {string} command - Команда
   * @param {Array<string>} args - Аргументы
   */
  async executeCommand(command, args = []) {
    try {
      await this.initialize();

      switch (command) {
        case 'summary':
          await this.executeSummary(args);
          break;
        case 'rising':
          await this.executeRising(args);
          break;
        case 'falling':
          await this.executeFalling(args);
          break;
        case 'test':
          await this.executeTest();
          break;
        case 'help':
        case '--help':
        case '-h':
          this.showHelp();
          break;
        default:
          console.error(`❌ Неизвестная команда: ${command}`);
          this.showHelp();
          process.exit(1);
      }

    } catch (error) {
      console.error('❌ Ошибка выполнения команды:', error.message);
      process.exit(1);
    }
  }

  /**
   * Выполнить отправку сводки
   * @param {Array<string>} args - Аргументы
   */
  async executeSummary(args) {
    const limit = this.parseLimit(args[0]);
    
    console.log(`📊 Отправка сводки рынка (топ-${limit} монет)...`);
    
    await this.useCase.execute({
      limit: limit,
      totalLimit: 1000,
      currency: 'btc'
    });
    
    console.log('✅ Сводка отправлена успешно!');
  }

  /**
   * Выполнить отправку сводки растущих монет
   * @param {Array<string>} args - Аргументы
   */
  async executeRising(args) {
    const limit = this.parseLimit(args[0]);
    
    console.log(`📈 Отправка сводки растущих монет (топ-${limit} монет)...`);
    
    await this.useCase.executeRisingCoins({
      limit: limit,
      totalLimit: 1000,
      currency: 'btc'
    });
    
    console.log('✅ Сводка растущих монет отправлена успешно!');
  }

  /**
   * Выполнить отправку сводки падающих монет
   * @param {Array<string>} args - Аргументы
   */
  async executeFalling(args) {
    const limit = this.parseLimit(args[0]);
    
    console.log(`📉 Отправка сводки падающих монет (топ-${limit} монет)...`);
    
    await this.useCase.executeFallingCoins({
      limit: limit,
      totalLimit: 1000,
      currency: 'btc'
    });
    
    console.log('✅ Сводка падающих монет отправлена успешно!');
  }

  /**
   * Выполнить тестовое сообщение
   */
  async executeTest() {
    console.log('🧪 Отправка тестового сообщения...');
    
    await this.notificationService.sendTestMessage();
    
    console.log('✅ Тестовое сообщение отправлено успешно!');
  }

  /**
   * Парсить лимит из аргумента
   * @param {string} arg - Аргумент
   * @returns {number} Лимит
   */
  parseLimit(arg) {
    if (!arg) {
      return 20; // По умолчанию
    }

    const limit = parseInt(arg);
    
    if (isNaN(limit) || limit < 1 || limit > 100) {
      console.error('❌ Лимит должен быть числом от 1 до 100');
      process.exit(1);
    }
    
    return limit;
  }

  /**
   * Запустить CLI
   */
  static async run() {
    const cli = new MarketSummaryCLI();
    const args = process.argv.slice(2);
    const command = args[0] || 'help';
    const commandArgs = args.slice(1);

    await cli.executeCommand(command, commandArgs);
  }
}

// Экспорт для использования в других модулях
module.exports = MarketSummaryCLI;

// Если файл запущен напрямую
if (require.main === module) {
  MarketSummaryCLI.run().catch(error => {
    console.error('❌ Критическая ошибка CLI:', error.message);
    process.exit(1);
  });
} 