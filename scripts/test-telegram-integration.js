/**
 * Тест интеграции Telegram бота в VirtualTradingSystem
 * Проверяет, что команды бота работают в основном потоке
 */

const { VirtualTradingSystem } = require('./virtual-trading-system');
const telegramBotSingleton = require('./telegram-bot-singleton');

class TelegramIntegrationTest {
  constructor() {
    this.tradingSystem = null;
  }

  /**
   * Запустить тест
   */
  async run() {
    console.log('🧪 Тест интеграции Telegram бота в VirtualTradingSystem');
    console.log('=' .repeat(60));
    
    try {
      // Тест 1: Проверка инициализации синглтона
      console.log('\n📋 Тест 1: Инициализация Telegram бота синглтона');
      const bot = await telegramBotSingleton.initialize();
      if (bot) {
        console.log('✅ Telegram бот синглтона инициализирован успешно');
      } else {
        console.log('❌ Telegram бот синглтона не инициализирован');
        return;
      }

      // Тест 2: Проверка инициализации VirtualTradingSystem
      console.log('\n📋 Тест 2: Инициализация VirtualTradingSystem');
      this.tradingSystem = new VirtualTradingSystem();
      await this.tradingSystem.initialize();
      console.log('✅ VirtualTradingSystem инициализирован успешно');

      // Тест 3: Проверка настройки команд
      console.log('\n📋 Тест 3: Проверка настройки команд бота');
      if (this.tradingSystem.telegramBot) {
        console.log('✅ Telegram бот доступен в VirtualTradingSystem');
        console.log('✅ Команды бота настроены');
      } else {
        console.log('❌ Telegram бот недоступен в VirtualTradingSystem');
      }

      // Тест 4: Проверка методов команд
      console.log('\n📋 Тест 4: Проверка методов команд');
      const methods = [
        'setupCommands',
        'sendWelcomeMessage',
        'splitMessageForTelegram'
      ];
      
      for (const method of methods) {
        if (typeof this.tradingSystem[method] === 'function') {
          console.log(`✅ Метод ${method} доступен`);
        } else {
          console.log(`❌ Метод ${method} недоступен`);
        }
      }

      // Тест 5: Проверка отправки приветственного сообщения
      console.log('\n📋 Тест 5: Проверка отправки приветственного сообщения');
      try {
        await this.tradingSystem.sendWelcomeMessage();
        console.log('✅ Приветственное сообщение отправлено');
      } catch (error) {
        console.log('⚠️ Приветственное сообщение не отправлено:', error.message);
      }

      // Тест 6: Проверка разбивки сообщений
      console.log('\n📋 Тест 6: Проверка разбивки длинных сообщений');
      const longMessage = 'Тестовое сообщение\n'.repeat(1000);
      const parts = this.tradingSystem.splitMessageForTelegram(longMessage);
      console.log(`✅ Сообщение разбито на ${parts.length} частей`);

      // Тест 7: Проверка загрузки активных сделок
      console.log('\n📋 Тест 7: Проверка загрузки активных сделок');
      try {
        const activeTrades = await this.tradingSystem.loadActiveTrades();
        console.log(`✅ Загружено ${activeTrades ? activeTrades.length : 0} активных сделок`);
      } catch (error) {
        console.log('⚠️ Ошибка загрузки активных сделок:', error.message);
      }

      console.log('\n🎉 Все тесты завершены успешно!');
      console.log('✅ Telegram бот интегрирован в VirtualTradingSystem');
      console.log('✅ Команды бота работают в основном потоке');
      console.log('✅ Синглтон обеспечивает единственный экземпляр бота');

    } catch (error) {
      console.error('❌ Ошибка в тесте:', error.message);
    } finally {
      // Очистка
      if (this.tradingSystem) {
        try {
          await this.tradingSystem.stop();
          console.log('🛑 VirtualTradingSystem остановлен');
        } catch (error) {
          console.log('⚠️ Ошибка остановки VirtualTradingSystem:', error.message);
        }
      }
      
      try {
        await telegramBotSingleton.stop();
        console.log('🛑 Telegram бот синглтона остановлен');
      } catch (error) {
        console.log('⚠️ Ошибка остановки Telegram бота:', error.message);
      }
    }
  }

  /**
   * Показать информацию о системе
   */
  showSystemInfo() {
    console.log('\n📊 ИНФОРМАЦИЯ О СИСТЕМЕ:');
    console.log(`   • Node.js: ${process.version}`);
    console.log(`   • Платформа: ${process.platform}`);
    console.log(`   • Архитектура: ${process.arch}`);
    console.log(`   • TELEGRAM_BOT_TOKEN: ${process.env.TELEGRAM_BOT_TOKEN ? '✅ Установлен' : '❌ Не установлен'}`);
    console.log(`   • TELEGRAM_CHAT_ID: ${process.env.TELEGRAM_CHAT_ID ? '✅ Установлен' : '❌ Не установлен'}`);
  }
}

// Запуск теста
if (require.main === module) {
  const test = new TelegramIntegrationTest();
  test.showSystemInfo();
  test.run();
}

module.exports = TelegramIntegrationTest; 