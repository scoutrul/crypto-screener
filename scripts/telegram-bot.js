const TelegramBot = require('node-telegram-bot-api');
const WatchlistStatusSender = require('./send-watchlist-status');
const { CryptoScreenerApp } = require('../src/app');

/**
 * Telegram бот для управления Crypto Screener
 */
class CryptoTelegramBot {
  constructor() {
    this.bot = null;
    this.app = null;
    this.watchlistSender = null;
  }

  /**
   * Инициализировать бота
   */
  async initialize() {
    try {
      // Загрузить токен из .env
      require('dotenv').config();
      const token = process.env.TELEGRAM_BOT_TOKEN;
      
      if (!token) {
        throw new Error('TELEGRAM_BOT_TOKEN не найден в .env файле');
      }

      // Создать бота с дополнительными опциями для избежания конфликтов
      this.bot = new TelegramBot(token, { 
        polling: true,
        polling_options: {
          timeout: 10,
          limit: 100,
          allowed_updates: ['message']
        }
      });
      
      // Инициализировать приложение
      this.app = new CryptoScreenerApp();
      await this.app.start();
      
      // Инициализировать отправитель watchlist
      this.watchlistSender = new WatchlistStatusSender();
      
      console.log('🤖 Telegram бот инициализирован');
      
      // Настроить команды
      this.setupCommands();

      // Отправить приветствие в основной чат
      const chatId = process.env.TELEGRAM_CHAT_ID;
      if (chatId) {
        const message = `🤖 Бот запущен и готов к работе!\n\n` +
                        `📋 Доступные команды:\n` +
                        `📊 /watchlist - Статус watchlist\n` +
                        `📈 /status - Общий статус системы\n` +
                        `❓ /help - Справка\n\n` +
                        `💡 Используйте /help для получения подробной информации`;
        try {
          await this.bot.sendMessage(chatId, message);
        } catch (e) {
          console.error('❌ Не удалось отправить стартовое сообщение в Telegram:', e.message);
        }
      } else {
        console.log('⚠️ TELEGRAM_CHAT_ID не задан, стартовое сообщение не отправлено');
      }
      
    } catch (error) {
      console.error('❌ Ошибка инициализации бота:', error.message);
      if (error.message.includes('409 Conflict')) {
        console.log('💡 Подсказка: Возможно, уже запущен другой экземпляр бота');
        console.log('💡 Остановите все процессы: taskkill /f /im node.exe');
      }
    }
  }

  /**
   * Настроить команды бота
   */
  setupCommands() {
    // Команда /start
    this.bot.onText(/\/start/, async (msg) => {
      const chatId = msg.chat.id;
      const message = `🤖 Добро пожаловать в Crypto Screener Bot!\n\n` +
                     `📋 Доступные команды:\n` +
                     `📊 /watchlist - Статус watchlist\n` +
                     `📈 /status - Общий статус системы\n` +
                     `❓ /help - Справка\n\n` +
                     `💡 Используйте /help для получения подробной информации`;
      
      await this.bot.sendMessage(chatId, message);
    });

    // Команда /watchlist
    this.bot.onText(/\/watchlist/, async (msg) => {
      const chatId = msg.chat.id;
      
      try {
        await this.bot.sendMessage(chatId, '📋 Загружаю статус watchlist...');
        
        // Получить статус watchlist
        const anomalies = await this.watchlistSender.loadPendingAnomalies();
        const message = this.watchlistSender.createWatchlistMessage(anomalies);
        
        // Разбить на части, если нужно
        const messageParts = this.watchlistSender.splitMessageForTelegram(message);
        
        for (let i = 0; i < messageParts.length; i++) {
          const part = messageParts[i];
          const partNumber = i + 1;
          const totalParts = messageParts.length;
          
          let partMessage = part;
          if (messageParts.length > 1) {
            partMessage = part.replace(
              '📋 WATCHLIST СТАТУС:',
              `📋 WATCHLIST СТАТУС (Часть ${partNumber}/${totalParts}):`
            );
          }
          
          await this.bot.sendMessage(chatId, partMessage, { parse_mode: 'HTML' });
          
          // Задержка между частями
          if (i < messageParts.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
        
      } catch (error) {
        console.error('❌ Ошибка отправки watchlist:', error.message);
        await this.bot.sendMessage(chatId, '❌ Ошибка загрузки статуса watchlist');
      }
    });

    // Команда /status
    this.bot.onText(/\/status/, async (msg) => {
      const chatId = msg.chat.id;
      
      try {
        await this.bot.sendMessage(chatId, '📊 Загружаю общий статус системы...');
        
        // Здесь можно добавить отправку общего статуса
        const message = `📊 ОБЩИЙ СТАТУС СИСТЕМЫ:\n\n` +
                       `🤖 Бот: Активен\n` +
                       `📋 Watchlist: Загружается...\n` +
                       `💰 Активные сделки: Загружается...\n\n` +
                       `💡 Используйте /watchlist для детального статуса`;
        
        await this.bot.sendMessage(chatId, message);
        
      } catch (error) {
        console.error('❌ Ошибка отправки статуса:', error.message);
        await this.bot.sendMessage(chatId, '❌ Ошибка загрузки статуса системы');
      }
    });

    // Команда /help
    this.bot.onText(/\/help/, async (msg) => {
      const chatId = msg.chat.id;
      const message = `❓ СПРАВКА ПО КОМАНДАМ:\n\n` +
                     `📊 /watchlist - Показать статус watchlist с детальной статистикой по каждой аномалии\n\n` +
                     `📈 /status - Показать общий статус системы\n\n` +
                     `💡 Команды:\n` +
                     `• /start - Начать работу с ботом\n` +
                     `• /help - Показать эту справку\n\n` +
                     `📋 Watchlist содержит аномалии, которые ожидают подтверждения для входа в сделку`;
      
      await this.bot.sendMessage(chatId, message);
    });

    // Обработка неизвестных команд
    this.bot.on('message', async (msg) => {
      if (msg.text && !msg.text.startsWith('/')) {
        const chatId = msg.chat.id;
        await this.bot.sendMessage(chatId, '❓ Используйте /help для получения списка команд');
      }
    });

    console.log('✅ Команды бота настроены');
  }

  /**
   * Запустить бота
   */
  async start() {
    try {
      await this.initialize();
      console.log('🚀 Telegram бот запущен');
    } catch (error) {
      console.error('❌ Ошибка запуска бота:', error.message);
    }
  }

  /**
   * Остановить бота
   */
  async stop() {
    if (this.bot) {
      this.bot.stopPolling();
      console.log('🛑 Telegram бот остановлен');
    }
  }
}

// Запуск бота
if (require.main === module) {
  const bot = new CryptoTelegramBot();
  bot.start();
  
  // Обработка сигналов завершения
  process.on('SIGINT', async () => {
    console.log('\n🛑 Получен сигнал завершения...');
    await bot.stop();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    console.log('\n🛑 Получен сигнал завершения...');
    await bot.stop();
    process.exit(0);
  });
}

module.exports = CryptoTelegramBot; 