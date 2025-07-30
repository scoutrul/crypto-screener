const TelegramBot = require('node-telegram-bot-api');
const WatchlistStatusSender = require('./send-watchlist-status');
const { CryptoScreenerApp } = require('../src/app');
const messageQueue = require('./telegram-message-queue');

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
      
             // Инициализировать очередь сообщений
       messageQueue.setBot(this.bot);
       
       // Дождаться полной инициализации бота
       await new Promise(resolve => setTimeout(resolve, 10000));
       
       // Проверить, что бот готов
       if (!this.bot.isPolling()) {
         throw new Error('Бот не готов к работе');
       }
       
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
                         `💰 /trades - Активные сделки\n` +
                         `📊 /watchlist - Статус watchlist\n` +
                         `📈 /stats - Статистика watchlist\n` +
                         `📊 /trading - Полная торговая статистика\n` +
                         `📋 /status - Общий статус системы\n` +
                         `❓ /help - Справка\n\n` +
                         `💡 Используйте /help для получения подробной информации`;
        try {
          await messageQueue.addMessage(chatId, message);
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
                      `💰 /trades - Активные сделки\n` +
                      `📊 /watchlist - Статус watchlist\n` +
                      `📈 /stats - Статистика watchlist\n` +
                      `📊 /trading - Полная торговая статистика\n` +
                      `📋 /status - Общий статус системы\n` +
                      `❓ /help - Справка\n\n` +
                      `💡 Используйте /help для получения подробной информации`;
       
       await messageQueue.addMessage(chatId, message);
     });

    // Команда /watchlist
    this.bot.onText(/\/watchlist/, async (msg) => {
      const chatId = msg.chat.id;
      
      try {
        await messageQueue.addMessage(chatId, '📋 Загружаю статус watchlist...');
        
        // Получить статус watchlist
        const anomalies = await this.watchlistSender.loadPendingAnomalies();
        const message = this.watchlistSender.createWatchlistMessage(anomalies);
        
                 // Разбить на части, если нужно
         const messageParts = this.splitMessageForTelegram(message);
        
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
          
          await messageQueue.addMessage(chatId, partMessage, { parse_mode: 'HTML' });
          
          // Задержка между частями
          if (i < messageParts.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
        
      } catch (error) {
        console.error('❌ Ошибка отправки watchlist:', error.message);
        await messageQueue.addMessage(chatId, '❌ Ошибка загрузки статуса watchlist');
      }
    });

    // Команда /trades - активные сделки
    this.bot.onText(/\/trades/, async (msg) => {
      const chatId = msg.chat.id;
      
      try {
        await messageQueue.addMessage(chatId, '💰 Загружаю активные сделки...');
        
        // Загрузить активные сделки
        const fs = require('fs').promises;
        const path = require('path');
        
        const activeTradesFile = path.join(__dirname, '..', 'data', 'active-trades.json');
        const activeTradesData = await fs.readFile(activeTradesFile, 'utf8');
        const activeTrades = JSON.parse(activeTradesData);
        
        if (activeTrades.length === 0) {
          const message = `💰 АКТИВНЫЕ СДЕЛКИ:\n\n📊 Нет активных сделок`;
          await messageQueue.addMessage(chatId, message);
          return;
        }
        
        let message = `💰 АКТИВНЫЕ СДЕЛКИ (${activeTrades.length}):\n\n`;
        
        activeTrades.forEach((trade, index) => {
          const duration = Math.round((Date.now() - new Date(trade.entryTime).getTime()) / 1000 / 60);
          const emoji = trade.type === 'Long' ? '🟢' : '🔴';
          
          // Рассчитать изменение цены
          const currentPrice = trade.lastPrice || trade.entryPrice;
          const priceChange = trade.type === 'Long' 
            ? ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100
            : ((trade.entryPrice - currentPrice) / trade.entryPrice) * 100;
          const changeSign = priceChange >= 0 ? '+' : '';
          const changeEmoji = priceChange >= 0 ? '🟢' : '🔴';
          
          message += `${index + 1}. ${trade.symbol} ${emoji} (${trade.type})\n`;
          message += `   💰 Вход: $${trade.entryPrice.toFixed(6)}\n`;
          message += `   📈 Текущая: $${currentPrice.toFixed(6)} ${changeEmoji} ${changeSign}${priceChange.toFixed(2)}%\n`;
          message += `   🛑 Стоп: $${trade.stopLoss.toFixed(6)}\n`;
          message += `   🎯 Тейк: $${trade.takeProfit.toFixed(6)}\n`;
          message += `   ⏱️ Время: ${duration} мин назад\n`;
          message += `   📊 Объем: ${trade.volumeIncrease ? `${trade.volumeIncrease}x` : 'N/A'}\n\n`;
        });
        
        // Разбить на части, если сообщение слишком длинное
        const messageParts = this.splitMessageForTelegram(message);
        
        for (let i = 0; i < messageParts.length; i++) {
          const part = messageParts[i];
          const partNumber = i + 1;
          const totalParts = messageParts.length;
          
          let partMessage = part;
          if (messageParts.length > 1) {
            partMessage = part.replace(
              '💰 АКТИВНЫЕ СДЕЛКИ:',
              `💰 АКТИВНЫЕ СДЕЛКИ (Часть ${partNumber}/${totalParts}):`
            );
          }
          
          await messageQueue.addMessage(chatId, partMessage);
          
          // Задержка между частями
          if (i < messageParts.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
        
      } catch (error) {
        console.error('❌ Ошибка отправки активных сделок:', error.message);
        await messageQueue.addMessage(chatId, '❌ Ошибка загрузки активных сделок');
      }
    });

    // Команда /status
    this.bot.onText(/\/status/, async (msg) => {
      const chatId = msg.chat.id;
      
      try {
        await messageQueue.addMessage(chatId, '📊 Загружаю общий статус системы...');
        
        // Здесь можно добавить отправку общего статуса
        const message = `📊 ОБЩИЙ СТАТУС СИСТЕМЫ:\n\n` +
                       `🤖 Бот: Активен\n` +
                       `📋 Watchlist: Загружается...\n` +
                       `💰 Активные сделки: Загружается...\n\n` +
                       `💡 Используйте /watchlist для детального статуса`;
        
        await messageQueue.addMessage(chatId, message);
        
      } catch (error) {
        console.error('❌ Ошибка отправки статуса:', error.message);
        await messageQueue.addMessage(chatId, '❌ Ошибка загрузки статуса системы');
      }
    });

         // Команда /help - справка
     this.bot.onText(/\/help/, async (msg) => {
       const chatId = msg.chat.id;
       
       const message = `🤖 Crypto Screener Bot - Справка\n\n` +
                       `📋 Доступные команды:\n\n` +
                       `💰 /trades - Активные сделки\n` +
                       `📊 /watchlist - Детальный статус watchlist\n` +
                       `📈 /stats - Статистика watchlist за 24 часа\n` +
                       `📊 /trading - Полная торговая статистика\n` +
                       `📋 /status - Общий статус системы\n` +
                       `❓ /help - Эта справка\n\n` +
                       `💡 Используйте /trades для просмотра текущих активных сделок\n` +
                       `💡 Используйте /watchlist для получения подробной информации о каждой аномалии\n` +
                       `💡 Используйте /stats для анализа эффективности watchlist\n` +
                       `💡 Используйте /trading для полной торговой статистики\n` +
                       `💡 Используйте /status для общего обзора системы`;
       
       await messageQueue.addMessage(chatId, message);
     });

         // Команда /stats - статистика watchlist
     this.bot.onText(/\/stats/, async (msg) => {
       const chatId = msg.chat.id;
       
       try {
         await messageQueue.addMessage(chatId, '📊 Загружаю статистику watchlist...');
         
         // Импортировать анализатор статистики
         const WatchlistStatisticsAnalyzer = require('./watchlist-statistics');
         const analyzer = new WatchlistStatisticsAnalyzer();
         
         // Получить статистику за 24 часа
         await analyzer.loadData();
         const periodData = analyzer.getPeriodStatistics(24);
         const detailedStats = analyzer.calculateDetailedStatistics(periodData);
         const report = analyzer.createReport(periodData, detailedStats);
         
         // Разбить на части, если сообщение слишком длинное
         const messageParts = this.splitMessageForTelegram(report);
         
         if (messageParts.length > 1) {
           for (let i = 0; i < messageParts.length; i++) {
             const part = messageParts[i];
             const partNumber = i + 1;
             const totalParts = messageParts.length;
             
             const partMessage = part.replace(
               '📊 СТАТИСТИКА WATCHLIST ЗА 24ч',
               `📊 СТАТИСТИКА WATCHLIST ЗА 24ч (Часть ${partNumber}/${totalParts})`
             );
             
             await messageQueue.addMessage(chatId, partMessage, { parse_mode: 'HTML' });
             
             // Задержка между частями
             if (i < messageParts.length - 1) {
               await new Promise(resolve => setTimeout(resolve, 1000));
             }
           }
         } else {
           await messageQueue.addMessage(chatId, report, { parse_mode: 'HTML' });
         }
         
       } catch (error) {
         console.error('❌ Ошибка отправки статистики:', error.message);
         await messageQueue.addMessage(chatId, '❌ Ошибка загрузки статистики watchlist');
       }
     });

     // Команда /trading - полная торговая статистика
     this.bot.onText(/\/trading/, async (msg) => {
       const chatId = msg.chat.id;
       
       try {
         await messageQueue.addMessage(chatId, '📊 Загружаю торговую статистику...');
         
         // Импортировать функцию создания статуса системы
         const { createSystemStatusMessage } = require('./send-system-status');
         
         // Создать сообщение со статусом системы
         const message = await createSystemStatusMessage();
         
         // Разбить на части, если сообщение слишком длинное
         const messageParts = this.splitMessageForTelegram(message);
         
         if (messageParts.length > 1) {
           for (let i = 0; i < messageParts.length; i++) {
             const part = messageParts[i];
             const partNumber = i + 1;
             const totalParts = messageParts.length;
             
             const partMessage = part.replace(
               '📊 СТАТУС СИСТЕМЫ:',
               `📊 СТАТУС СИСТЕМЫ (Часть ${partNumber}/${totalParts}):`
             );
             
             await messageQueue.addMessage(chatId, partMessage);
             
             // Задержка между частями
             if (i < messageParts.length - 1) {
               await new Promise(resolve => setTimeout(resolve, 1000));
             }
           }
         } else {
           await messageQueue.addMessage(chatId, message);
         }
         
       } catch (error) {
         console.error('❌ Ошибка отправки торговой статистики:', error.message);
         await messageQueue.addMessage(chatId, '❌ Ошибка загрузки торговой статистики');
       }
     });

    // Обработка неизвестных команд
    this.bot.on('message', async (msg) => {
      if (msg.text && !msg.text.startsWith('/')) {
        const chatId = msg.chat.id;
        await messageQueue.addMessage(chatId, '❓ Используйте /help для получения списка команд');
      }
    });

    console.log('✅ Команды бота настроены');
  }

  /**
   * Разбить длинное сообщение на части для Telegram
   */
  splitMessageForTelegram(message, maxLength = 4000) {
    const parts = [];
    let currentPart = '';
    
    const lines = message.split('\n');
    
    for (const line of lines) {
      // Если добавление этой строки превысит лимит
      if (currentPart.length + line.length + 1 > maxLength) {
        if (currentPart.trim()) {
          parts.push(currentPart.trim());
        }
        currentPart = line;
      } else {
        currentPart += (currentPart ? '\n' : '') + line;
      }
    }
    
    // Добавить последнюю часть
    if (currentPart.trim()) {
      parts.push(currentPart.trim());
    }
    
    return parts;
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