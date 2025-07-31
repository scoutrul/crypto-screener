/**
 * Система виртуальной торговли с REST API
 * Наследует общую бизнес-логику из VirtualTradingBaseService
 */

const fs = require('fs').promises;
const path = require('path');
const ccxt = require('ccxt');
const telegramBotSingleton = require('./telegram-bot-singleton');
const { CryptoScreenerApp } = require('../src/app');
const { VirtualTradingBaseService } = require('../src/domain/services/VirtualTradingBaseService');
const PendingAnomaliesStatsUpdater = require('./update-pending-anomalies-stats');
const WatchlistStatsSync = require('./sync-watchlist-stats');
const messageQueue = require('./telegram-message-queue');

// Конфигурация для REST API системы (наследуется из базового класса)
const CONFIG = {
  // Интервалы потоков
  activeTradesInterval: 30 * 1000,      // 30 секунд - Trade List (высший приоритет)
  pendingCheckInterval: 30 * 1000,      // 30 секунд - Watchlist (средний приоритет)
  anomalyCheckInterval: 5 * 60 * 1000,  // 5 минут - Anomalies (низший приоритет)
  
  // Дополнительные параметры для REST API системы
  monitoringInterval: 5 * 60 * 1000, // 5 минут
  priceTrackingInterval: 5 * 60 * 1000, // 5 минут для отслеживания цены
  exchanges: ['Binance']
};

class VirtualTradingSystem extends VirtualTradingBaseService {
  constructor() {
    // Вызвать конструктор базового класса с конфигурацией
    super(CONFIG);
    
    // REST API специфичные поля
    this.exchange = new ccxt.binance({ 
      enableRateLimit: true,
      options: {
        defaultType: 'spot' // Явно указываем использование spot API
      }
    });
    this.app = null;
    
    // Приоритетная очередь для потоков
    this.taskQueue = [];
    this.isProcessing = false;
    this.lastActiveTradesCheck = 0;
    this.lastPendingCheck = 0;
    this.lastAnomalyCheck = 0;
    
    // Правило ограничения частоты перезапуска аномалий
    this.lastAnomalyCheckStart = 0;  // Время начала последней проверки аномалий
    this.anomalyCheckDuration = 0;   // Продолжительность последней проверки аномалий
    this.anomalyCheckMinInterval = 5 * 60 * 1000; // Минимальный интервал между проверками (5 минут)
    this.anomalyCheckMaxDuration = 5 * 60 * 1000; // Максимальная продолжительность проверки (5 минут)
    
    // Интервалы для разных потоков (REST API)
    this.anomalyCheckInterval = null;      // Поток 1: 5 минут
    this.pendingCheckInterval = null;      // Поток 2: 30 секунд  
    this.activeTradesInterval = null;      // Поток 3: 30 секунд
    this.pendingAnomaliesStatsUpdater = new PendingAnomaliesStatsUpdater();
    this.watchlistStatsSync = new WatchlistStatsSync();
    
    // Исторические аномалии
    this.historicalAnomalies = new Map(); // Кэш аномалий за текущий день
    this.currentDay = this.getCurrentDayString();
  }

  /**
   * Получить строку текущего дня в формате YYYY-MM-DD
   */
  getCurrentDayString() {
    const now = new Date();
    return now.toISOString().split('T')[0]; // YYYY-MM-DD
  }

  /**
   * Получить путь к файлу исторических аномалий для указанного дня
   */
  getHistoricalAnomaliesFilePath(dayString = null) {
    const day = dayString || this.getCurrentDayString();
    return path.join(__dirname, '..', 'data', `anomalies_${day}.json`);
  }

  /**
   * Загрузить исторические аномалии за день
   */
  async loadHistoricalAnomalies(dayString = null) {
    try {
      const filePath = this.getHistoricalAnomaliesFilePath(dayString);
      const data = await fs.readFile(filePath, 'utf8');
      const parsed = JSON.parse(data);
      
      if (parsed.anomalies && Array.isArray(parsed.anomalies)) {
        return parsed.anomalies;
      } else if (Array.isArray(parsed)) {
        // Старая структура
        return parsed;
      } else {
        return [];
      }
    } catch (error) {
      // Файл не существует или пустой
      return [];
    }
  }

  /**
   * Сохранить аномалию в исторический файл
   */
  async saveAnomalyToHistory(anomaly) {
    try {
      const currentDay = this.getCurrentDayString();
      
      // Проверить, не изменился ли день
      if (currentDay !== this.currentDay) {
        // День изменился, сохранить текущие аномалии и начать новый день
        await this.saveHistoricalAnomaliesForDay(this.currentDay);
        this.currentDay = currentDay;
        this.historicalAnomalies.clear();
      }
      
      // Добавить аномалию в кэш текущего дня
      this.historicalAnomalies.set(anomaly.anomalyId, anomaly);
      
      // Сохранить в файл
      await this.saveHistoricalAnomaliesForDay(currentDay);
      
      console.log(`📊 Аномалия ${anomaly.symbol} сохранена в историю (${this.historicalAnomalies.size} за день)`);
    } catch (error) {
      console.error('❌ Ошибка сохранения аномалии в историю:', error.message);
    }
  }

  /**
   * Сохранить исторические аномалии за день
   */
  async saveHistoricalAnomaliesForDay(dayString) {
    try {
      const filePath = this.getHistoricalAnomaliesFilePath(dayString);
      const anomalies = Array.from(this.historicalAnomalies.values());
      
      // Создать структуру с мета-информацией
      const data = {
        meta: {
          dayStats: {
            date: dayString,
            totalAnomalies: anomalies.length,
            lastUpdated: new Date().toISOString(),
            longAnomaliesCount: anomalies.filter(a => a.tradeType === 'Long').length,
            shortAnomaliesCount: anomalies.filter(a => a.tradeType === 'Short').length,
            averageVolumeLeverage: anomalies.length > 0 ? 
              (anomalies.reduce((sum, a) => sum + (a.volumeLeverage || 0), 0) / anomalies.length).toFixed(1) : 0,
            topVolumeLeverages: anomalies
              .sort((a, b) => (b.volumeLeverage || 0) - (a.volumeLeverage || 0))
              .slice(0, 10)
              .map(a => ({ symbol: a.symbol, leverage: a.volumeLeverage }))
          },
          fileInfo: {
            version: "1.0",
            description: `Historical anomalies for ${dayString}`,
            createdAt: new Date().toISOString(),
            lastModified: new Date().toISOString()
          }
        },
        anomalies: anomalies
      };
      
      await fs.writeFile(filePath, JSON.stringify(data, null, 2));
      console.log(`💾 Сохранено ${anomalies.length} аномалий в историю за ${dayString}`);
      
      // Отправить уведомление в Telegram
      if (this.notificationService && anomalies.length > 0) {
        try {
          const message = `💾 Сохранено ${anomalies.length} аномалий в историю за ${dayString}`;
          await this.notificationService.sendTelegramMessage(message);
          console.log('✅ Уведомление о сохранении аномалий отправлено в Telegram');
        } catch (error) {
          console.error('❌ Ошибка отправки уведомления в Telegram:', error.message);
        }
      }
    } catch (error) {
      console.error(`❌ Ошибка сохранения исторических аномалий за ${dayString}:`, error.message);
    }
  }

  /**
   * Инициализация системы (переопределение абстрактного метода)
   */
  async initialize() {
    console.log('🚀 Инициализация системы виртуальной торговли (REST API)...');
    
    // ПЕРВЫМ ДЕЛОМ - проверить приоритетную очередь
    console.log('🔍 ПЕРВЫЙ ПРИОРИТЕТ: Проверка приоритетной очереди...');
    await this.checkPriorityQueue();
    
    // Инициализировать Telegram бота
    await this.initializeTelegramBot();
    
    // Инициализировать приложение
    this.app = new CryptoScreenerApp();
    await this.app.start();
    
    // Загрузить данные (используем методы базового класса)
    const loaded = await this.loadFilteredCoins();
    if (!loaded) {
      throw new Error('Не удалось загрузить список монет');
    }

    await this.loadTradeHistory();
    await this.loadTradingStatistics();
    await this.loadPendingAnomalies();
    await this.loadActiveTrades();
    
    // Загрузить исторические аномалии за текущий день
    const todayAnomalies = await this.loadHistoricalAnomalies();
    todayAnomalies.forEach(anomaly => {
      this.historicalAnomalies.set(anomaly.anomalyId, anomaly);
    });
    console.log(`📊 Загружено ${todayAnomalies.length} исторических аномалий за сегодня`);

    // Установить сервис уведомлений
    if (this.app && this.app.container) {
      this.setNotificationService(this.app.container.getNotificationService());
    }
    
    console.log('✅ Система инициализирована');
  }

  /**
   * Инициализировать Telegram бота
   */
  async initializeTelegramBot() {
    try {
      // Использовать синглтон для инициализации бота
      this.telegramBot = await telegramBotSingleton.initialize();
      
      if (!this.telegramBot) {
        console.log('⚠️ Telegram бот не инициализирован, уведомления отключены');
        return;
      }
      
      console.log('🤖 Telegram бот инициализирован для виртуальной торговой системы (синглтон)');
      
      // Настроить команды бота
      this.setupCommands();
      
    } catch (error) {
      console.error('❌ Ошибка инициализации Telegram бота:', error.message);
    }
  }

  /**
   * Настроить команды бота
   */
  setupCommands() {
    if (!this.telegramBot) {
      console.log('⚠️ Telegram бот не инициализирован, команды не настроены');
      return;
    }

    // Команда /start
    this.telegramBot.onText(/\/start/, async (msg) => {
      const chatId = msg.chat.id;
      const message = `🤖 Добро пожаловать в Crypto Screener Bot!\n\n` +
                     `📋 Доступные команды:\n` +
                     `💰 /trades - Активные сделки\n` +
                     `📊 /watchlist - Статус watchlist\n` +
                     `📈 /stats - Общая статистика\n` +
                     `📊 /trading - Полная торговая статистика\n` +
                     `📋 /status - Общий статус системы\n` +
                     `❓ /help - Справка\n\n` +
                     `💡 Используйте /help для получения подробной информации`;
      
      await messageQueue.addMessage(chatId, message);
    });

    // Команда /watchlist
    this.telegramBot.onText(/\/watchlist/, async (msg) => {
      const chatId = msg.chat.id;
      
      try {
        await messageQueue.addMessage(chatId, '📋 Загружаю статус watchlist...');
        
        // Получить статус watchlist
        const WatchlistStatusSender = require('./send-watchlist-status');
        const watchlistSender = new WatchlistStatusSender();
        const anomalies = await watchlistSender.loadPendingAnomalies();
        const message = watchlistSender.createWatchlistMessage(anomalies);
        
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
    this.telegramBot.onText(/\/trades/, async (msg) => {
      const chatId = msg.chat.id;
      
      try {
        await messageQueue.addMessage(chatId, '💰 Загружаю активные сделки...');
        
        // Загрузить активные сделки
        const activeTrades = await this.loadActiveTrades();
        
        if (!activeTrades || activeTrades.length === 0) {
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
    this.telegramBot.onText(/\/status/, async (msg) => {
      const chatId = msg.chat.id;
      
      try {
        await messageQueue.addMessage(chatId, '📊 Загружаю общий статус системы...');
        
        // Загрузить реальные данные
        const fs = require('fs').promises;
        const path = require('path');
        
        // Получить статус watchlist
        let watchlistStatus = '❌ Ошибка загрузки';
        let watchlistCount = 0;
        try {
          const pendingAnomaliesFile = path.join(__dirname, '..', 'data', 'pending-anomalies.json');
          const pendingData = await fs.readFile(pendingAnomaliesFile, 'utf8');
          const parsed = JSON.parse(pendingData);
          
          let anomalies = [];
          if (Array.isArray(parsed)) {
            anomalies = parsed;
          } else if (parsed.anomalies && Array.isArray(parsed.anomalies)) {
            anomalies = parsed.anomalies;
          }
          
          watchlistCount = anomalies.length;
          watchlistStatus = watchlistCount > 0 ? `✅ ${watchlistCount} аномалий` : '📭 Пуст';
        } catch (error) {
          watchlistStatus = '❌ Ошибка загрузки';
        }
        
        // Получить статус активных сделок
        let tradesStatus = '❌ Ошибка загрузки';
        let tradesCount = 0;
        try {
          const activeTrades = await this.loadActiveTrades();
          tradesCount = activeTrades ? activeTrades.length : 0;
          tradesStatus = tradesCount > 0 ? `✅ ${tradesCount} сделок` : '📭 Нет активных';
        } catch (error) {
          tradesStatus = '❌ Ошибка загрузки';
        }
        
        const message = `📊 ОБЩИЙ СТАТУС СИСТЕМЫ:\n\n` +
                       `🤖 Бот: Активен\n` +
                       `📋 Watchlist: ${watchlistStatus}\n` +
                       `💰 Активные сделки: ${tradesStatus}\n\n` +
                       `💡 Используйте /watchlist для детального статуса`;
        
        await messageQueue.addMessage(chatId, message);
        
      } catch (error) {
        console.error('❌ Ошибка отправки статуса:', error.message);
        await messageQueue.addMessage(chatId, '❌ Ошибка загрузки статуса системы');
      }
    });

    // Команда /help - справка
    this.telegramBot.onText(/\/help/, async (msg) => {
      const chatId = msg.chat.id;
      
      const message = `🤖 Crypto Screener Bot - Справка\n\n` +
                     `📋 Доступные команды:\n\n` +
                     `💰 /trades - Активные сделки\n` +
                     `📊 /watchlist - Детальный статус watchlist\n` +
                     `📈 /stats - Общая статистика\n` +
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
    this.telegramBot.onText(/\/stats/, async (msg) => {
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
    this.telegramBot.onText(/\/trading/, async (msg) => {
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
    this.telegramBot.on('message', async (msg) => {
      if (msg.text && !msg.text.startsWith('/')) {
        const chatId = msg.chat.id;
        await messageQueue.addMessage(chatId, '❓ Используйте /help для получения списка команд');
      }
    });

    console.log('✅ Команды бота настроены в VirtualTradingSystem');
  }

  /**
   * Отправить приветственное сообщение в Telegram
   */
  async sendWelcomeMessage() {
    try {
      const chatId = process.env.TELEGRAM_CHAT_ID;
      if (!chatId) {
        console.log('⚠️ TELEGRAM_CHAT_ID не задан, приветственное сообщение не отправлено');
        return;
      }

      const message = `🤖 Бот запущен и готов к работе!\n\n` +
                     `📋 Доступные команды:\n` +
                     `💰 /trades - Активные сделки\n` +
                     `📊 /watchlist - Статус watchlist\n` +
                     `📈 /stats - Общая статистика\n` +
                     `📊 /trading - Полная торговая статистика\n` +
                     `📋 /status - Общий статус системы\n` +
                     `❓ /help - Справка\n\n` +
                     `💡 Используйте /help для получения подробной информации`;
      
      await messageQueue.addMessage(chatId, message);
      console.log('📱 Приветственное сообщение отправлено в Telegram');
      
    } catch (error) {
      console.error('❌ Ошибка отправки приветственного сообщения:', error.message);
    }
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
   * Добавить задачу в приоритетную очередь
   */
  addTaskToQueue(task, priority) {
    // Увеличиваем лимит очереди до 50 задач
    if (this.taskQueue.length >= 50) {
      // Если очередь переполнена, удаляем старые задачи с низким приоритетом
      if (priority <= 2) { // Только для высокоприоритетных задач (1-2)
        // Удаляем старые задачи с приоритетом 3
        this.taskQueue = this.taskQueue.filter(item => item.priority < 3);
        console.log(`🔄 Очищена очередь от низкоприоритетных задач, добавлена задача с приоритетом ${priority}`);
      } else {
        console.log(`⚠️ Очередь переполнена (${this.taskQueue.length} задач), пропускаем добавление задачи с приоритетом ${priority}`);
        return;
      }
    }
    
    this.taskQueue.push({ task, priority, timestamp: Date.now() });
    // Сортировка по приоритету (1 - высший приоритет)
    this.taskQueue.sort((a, b) => a.priority - b.priority);
    
    // Запустить обработку очереди, если она не запущена
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  /**
   * Проверить и инициализировать приоритетную очередь
   */
  async checkPriorityQueue() {
    console.log('🔍 Проверка приоритетной очереди...');
    
    // Проверить состояние очереди
    console.log(`📊 Текущее состояние очереди:`);
    console.log(`   • Задач в очереди: ${this.taskQueue.length}`);
    console.log(`   • Обработка активна: ${this.isProcessing}`);
    console.log(`   • Последняя проверка активных сделок: ${this.lastActiveTradesCheck ? new Date(this.lastActiveTradesCheck).toLocaleTimeString() : 'не выполнялась'}`);
    console.log(`   • Последняя проверка watchlist: ${this.lastPendingCheck ? new Date(this.lastPendingCheck).toLocaleTimeString() : 'не выполнялась'}`);
    console.log(`   • Последняя проверка аномалий: ${this.lastAnomalyCheck ? new Date(this.lastAnomalyCheck).toLocaleTimeString() : 'не выполнялась'}`);
    
    // Очистить очередь если она в недопустимом состоянии
    if (this.taskQueue.length > 100) {
      console.log('⚠️ Очередь переполнена, очищаем...');
      this.taskQueue = [];
      this.isProcessing = false;
    }
    
    // Проверить интервалы
    const intervalsStatus = {
      activeTrades: !!this.activeTradesInterval,
      pendingCheck: !!this.pendingCheckInterval,
      anomalyCheck: !!this.anomalyCheckInterval
    };
    
    console.log(`⏰ Статус интервалов:`);
    console.log(`   • Активные сделки: ${intervalsStatus.activeTrades ? '🟢 Активен' : '🔴 Остановлен'}`);
    console.log(`   • Watchlist: ${intervalsStatus.pendingCheck ? '🟢 Активен' : '🔴 Остановлен'}`);
    console.log(`   • Аномалии: ${intervalsStatus.anomalyCheck ? '🟢 Активен' : '🔴 Остановлен'}`);
    
    // Инициализировать базовую задачу если очередь пуста
    if (this.taskQueue.length === 0) {
      console.log('📦 Очередь пуста, добавляем базовую задачу...');
      this.addTaskToQueue(async () => {
        console.log('🔍 [ПОТОК 1] Базовая задача поиска аномалий...');
        await this.runAnomalyCheck();
      }, 3);
    }
    
    console.log('✅ Проверка приоритетной очереди завершена');
  }

  /**
   * Проверить правило ограничения частоты перезапуска аномалий
   * @returns {boolean} true если проверка разрешена, false если нужно пропустить
   */
  checkAnomalyRateLimit() {
    const now = Date.now();
    const timeSinceLastStart = now - this.lastAnomalyCheckStart;
    
    // Если проверка еще не запускалась, разрешить
    if (this.lastAnomalyCheckStart === 0) {
      return true;
    }
    
    // Проверить минимальный интервал между проверками
    if (timeSinceLastStart < this.anomalyCheckMinInterval) {
      const remainingTime = Math.ceil((this.anomalyCheckMinInterval - timeSinceLastStart) / 1000);
      console.log(`⏳ Правило ограничения: проверка аномалий пропущена. Осталось ${remainingTime} сек до следующей проверки`);
      return false;
    }
    
    // Проверить, не превышает ли последняя проверка максимальную продолжительность
    if (this.anomalyCheckDuration > this.anomalyCheckMaxDuration) {
      console.log(`⚠️ Правило ограничения: последняя проверка аномалий заняла ${Math.ceil(this.anomalyCheckDuration / 1000)} сек (максимум ${this.anomalyCheckMaxDuration / 1000} сек)`);
      console.log(`⏳ Следующая проверка будет через ${Math.ceil(this.anomalyCheckMinInterval / 1000)} сек для предотвращения перегрузки`);
      return false;
    }
    
    return true;
  }

  /**
   * Обработать приоритетную очередь
   */
  async processQueue() {
    if (this.isProcessing) {
      return;
    }
    
    this.isProcessing = true;
    
    while (this.taskQueue.length > 0) {
      const { task, priority } = this.taskQueue.shift();
      
      try {
        console.log(`🎯 Выполнение задачи с приоритетом ${priority} (${this.taskQueue.length} в очереди)`);
        await task();
    } catch (error) {
        console.error(`❌ Ошибка выполнения задачи с приоритетом ${priority}:`, error.message);
      }
      
      // Небольшая пауза между задачами
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    
    // Если очередь пуста, добавляем задачу из приоритета 3 (аномалии)
    if (this.taskQueue.length === 0) {
      console.log('📦 Очередь пуста, добавляем задачу из приоритета 3 (аномалии)...');
      this.addTaskToQueue(async () => {
        console.log('🔍 [ПОТОК 1] Запуск поиска аномалий из пустой очереди...');
        await this.runAnomalyCheck();
      }, 3);
    } else {
      console.log(`📊 Очередь содержит ${this.taskQueue.length} задач`);
    }
    
    this.isProcessing = false;
  }

  /**
   * Получить свечи с Binance с повторными попытками (REST API специфика)
   */
  async fetchCandles(symbol, since, limit = 100, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await this.exchange.fetchOHLCV(symbol, this.config.timeframe, since, limit);
      } catch (error) {
        if (error.message.includes('does not have market symbol')) {
          return [];
        } else if (error.message.includes('timeout') || error.message.includes('fetch failed')) {
          if (attempt < retries) {
            console.log(`⏳ Таймаут для ${symbol}, попытка ${attempt}/${retries}, повтор через 2 сек...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
            continue;
          } else {
            console.error(`❌ Ошибка получения свечей для ${symbol} после ${retries} попыток:`, error.message);
            return [];
          }
        } else {
          console.error(`❌ Ошибка получения свечей для ${symbol}:`, error.message);
          return [];
        }
      }
    }
    return [];
  }

  /**
   * Рассчитать среднюю цену
   */
  calculateAveragePrice(candles) {
    if (!candles || candles.length === 0) return 0;
    
    const totalPrice = candles.reduce((sum, candle) => {
      return sum + (candle[1] + candle[4]) / 2; // (open + close) / 2
    }, 0);
    
    return totalPrice / candles.length;
  }

  /**
   * Рассчитать средний объем
   */
  calculateAverageVolume(candles) {
    if (!candles || candles.length === 0) return 0;
    
    const totalVolume = candles.reduce((sum, candle) => sum + candle[5], 0);
    return totalVolume / candles.length;
  }

  /**
   * Обнаружить аномалию объема
   */
  detectVolumeAnomaly(currentVolume, historicalVolume) {
    return currentVolume > historicalVolume * this.config.volumeThreshold;
  }

  /**
   * Проверить cooldown для аномалий
   */
  isAnomalyOnCooldown(symbol) {
    const cooldownTime = this.anomalyCooldowns.get(symbol);
    if (!cooldownTime) return false;
    
    const now = Date.now();
    const cooldownDuration = this.config.anomalyCooldown * 15 * 60 * 1000; // 4 TF * 15 минут
    return (now - cooldownTime) < cooldownDuration;
  }

  /**
   * Установить cooldown для аномалий
   */
  setAnomalyCooldown(symbol) {
    this.anomalyCooldowns.set(symbol, Date.now());
  }

  /**
   * Определить тип сделки на основе изменения цены
   */
  determineTradeType(anomalyPrice, historicalPrice) {
    const priceDiff = (anomalyPrice - historicalPrice) / historicalPrice;
    const priceDiffPercent = priceDiff * 100;
    
    console.log(`📊 Анализ типа сделки:`);
    console.log(`   💰 Аномальная цена: $${anomalyPrice.toFixed(6)}`);
    console.log(`   📈 Историческая цена: $${historicalPrice.toFixed(6)}`);
    console.log(`   📊 Изменение цены: ${priceDiffPercent.toFixed(2)}%`);
    console.log(`   🎯 Порог: ${(this.config.priceThreshold * 100).toFixed(2)}%`);
    
    if (priceDiff > this.config.priceThreshold) {
      console.log(`   ✅ Определен тип: Short (изменение > ${(this.config.priceThreshold * 100).toFixed(2)}%)`);
      return 'Short';
    } else if (priceDiff < -this.config.priceThreshold) {
      console.log(`   ✅ Определен тип: Long (изменение < -${(this.config.priceThreshold * 100).toFixed(2)}%)`);
      return 'Long';
    }
    
    console.log(`   ❌ Тип не определен (изменение в пределах ±${(this.config.priceThreshold * 100).toFixed(2)}%)`);
    return null;
  }

  /**
   * Проверить подтверждение входа (REST API специфика с новой логикой)
   */
  async checkEntryConfirmation(symbol, tradeType, anomalyCandleIndex) {
    try {
      const since = Date.now() - (this.config.entryConfirmationTFs * 15 * 60 * 1000);
      const candles = await this.fetchCandles(symbol, since, this.config.entryConfirmationTFs + 1, 3);
      
      if (candles.length < this.config.entryConfirmationTFs) {
        return;
      }

      const currentPrice = this.calculateAveragePrice(candles.slice(-1));
      const anomaly = this.pendingAnomalies.get(symbol);
      
      if (!anomaly) {
        console.log(`⚠️ ${symbol} - Аномалия не найдена в pending`);
        return;
      }
      
      console.log('─'.repeat(50)); // Отбивка между сообщениями
      console.log(`🔍 [CONFIRMATION] Проверка подтверждения входа для ${symbol}:`);
      console.log(`   💰 Текущая цена: $${currentPrice}`);
      console.log(`   📊 Аномалия: ${tradeType} по $${anomaly.anomalyPrice}`);
      
      // Этап 2: Проверка консолидации (если еще не проверена)
      if (!anomaly.isConsolidated) {
        console.log(`🔍 [CONSOLIDATION] Проверка консолидации для ${symbol}...`);
        
        // Получить аномальную свечу для проверки консолидации
        const anomalyCandle = candles[anomalyCandleIndex] || candles[candles.length - 2];
        
        if (!this.checkConsolidation(anomalyCandle)) {
          console.log(`❌ ${symbol} - Консолидация не подтвердилась, удаляем из watchlist`);
          // Записать лид как неудачную консолидацию
          super.addLeadRecord(anomaly, 'consolidation', false);
          await this.removeFromWatchlist(symbol, 'consolidation');
          await super.saveSignalStatistics();
          return;
        }
        
        // Консолидация подтвердилась, определяем сетап
        console.log(`✅ ${symbol} - Консолидация подтвердилась`);
        anomaly.isConsolidated = true;
        anomaly.closePrice = currentPrice;
        
        // Этап 3: Определение сетапа и триггеров
        const { entryLevel, cancelLevel } = this.calculateEntryLevels(currentPrice, tradeType);
        anomaly.entryLevel = entryLevel;
        anomaly.cancelLevel = cancelLevel;
        
        console.log(`📊 ${symbol} - Уровни установлены: вход $${entryLevel}, отмена $${cancelLevel}`);
        await this.savePendingAnomalies();
        return;
      }
      
      // Обновить максимальную/минимальную цену в watchlist
      if (!anomaly.maxPrice || currentPrice > anomaly.maxPrice) {
        anomaly.maxPrice = currentPrice;
      }
      if (!anomaly.minPrice || currentPrice < anomaly.minPrice) {
        anomaly.minPrice = currentPrice;
      }
      
      // Этап 4: Проверка условий входа или отмены
      const result = this.checkEntryConditions(currentPrice, anomaly.entryLevel, anomaly.cancelLevel, tradeType);
      
      if (result === 'entry') {
        console.log(`✅ ${symbol} - Условие входа выполнено!`);
        
        // Создать сделку (используем метод базового класса)
        const currentVolume = candles[candles.length - 1][5]; // Объем текущей свечи
        
        const trade = this.createVirtualTrade(
          symbol, 
          tradeType, 
          currentPrice, 
          anomaly.anomalyId, 
          currentVolume,
          anomaly.entryLevel,
          anomaly.cancelLevel,
          anomaly.volumeLeverage
        );
        
        // Записать лид как сконвертированный
        super.addLeadRecord(anomaly, 'entry', true);
        
        // Удалить из watchlist
        await this.removeFromWatchlist(symbol, 'converted_to_trade');
        
        // Отправить уведомление о входе в сделку с обоснованием
        await this.sendTradeEntryNotification(trade, anomaly);
        
        // Сохранить данные (используем методы базового класса)
        await this.saveActiveTrades();
        await super.saveSignalStatistics();
        
      } else if (result === 'cancel') {
        console.log(`❌ ${symbol} - Условие отмены выполнено, удаляем из watchlist`);
        
        // Записать лид как отмененный
        super.addLeadRecord(anomaly, 'cancel', false);
        
        await this.removeFromWatchlist(symbol, 'cancel');
        await super.saveSignalStatistics();
        
      } else {
        // Проверить таймаут
        if (this.checkEntryTimeout(anomaly)) {
          console.log(`⏰ ${symbol} - Таймаут подтверждения входа, удаляем из watchlist`);
          
          // Записать лид как таймаут
          super.addLeadRecord(anomaly, 'timeout', false);
          
          await this.removeFromWatchlist(symbol, 'timeout');
          await super.saveSignalStatistics();
        } else {
          console.log(`⏳ ${symbol} - Ожидание выполнения условий...`);
          console.log('─'.repeat(50)); // Отбивка между сообщениями
          // Сохраняем обновления аномалии в файл
          await this.savePendingAnomalies();
        }
      }
    } catch (error) {
      console.error(`❌ Ошибка проверки подтверждения входа для ${symbol}:`, error.message);
    }
  }

  /**
   * Рассчитать динамический процент тейк-профита на основе leverage объема
   */
  calculateDynamicTakeProfitPercent(volumeLeverage) {
    if (!volumeLeverage || volumeLeverage < 8) {
      return this.config.takeProfitPercent; // По умолчанию 2.5%
    }
    
    if (volumeLeverage >= 8 && volumeLeverage < 10) {
      return 0.03; // 3%
    } else if (volumeLeverage >= 10 && volumeLeverage < 12) {
      return 0.035; // 3.5%
    } else if (volumeLeverage >= 12 && volumeLeverage < 16) {
      return 0.04; // 4%
    } else if (volumeLeverage >= 16 && volumeLeverage < 20) {
      return 0.045; // 4.5%
    } else if (volumeLeverage >= 20) {
      return 0.05; // 5%
    }
    
    return this.config.takeProfitPercent; // Fallback
  }

  /**
   * Создать виртуальную сделку
   */
  createVirtualTrade(symbol, tradeType, entryPrice, anomalyId = null, currentVolume = null, volumeLeverage = null) {
    const stopLoss = tradeType === 'Long' 
      ? entryPrice * (1 - this.config.stopLossPercent)
      : entryPrice * (1 + this.config.stopLossPercent);
    
    // Рассчитать динамический тейк-профит на основе leverage
    const dynamicTakeProfitPercent = this.calculateDynamicTakeProfitPercent(volumeLeverage);
    
    const takeProfit = tradeType === 'Long'
      ? entryPrice * (1 + dynamicTakeProfitPercent)
      : entryPrice * (1 - dynamicTakeProfitPercent);

    const trade = {
      id: `${symbol}_${Date.now()}`,
      anomalyId: anomalyId || `${symbol.replace('/USDT', '')}_${Date.now()}`,
      symbol: symbol,
      type: tradeType,
      entryPrice: entryPrice,
      stopLoss: stopLoss,
      takeProfit: takeProfit,
      entryTime: new Date().toISOString(),
      status: 'open',
      lastPrice: entryPrice,
      lastUpdateTime: new Date().toISOString(),
      currentVolume: currentVolume, // Добавляем текущий объем свечи
      volumeIncrease: volumeLeverage, // Увеличение объема в разах
      bezubitok: false, // Режим безубытка
      
      // Динамический тейк-профит
      volumeLeverage: volumeLeverage,
      dynamicTakeProfitPercent: dynamicTakeProfitPercent
    };

    this.activeTrades.set(symbol, trade);
    this.watchlist.add(symbol);
    
    console.log(`💰 Создана виртуальная сделка ${tradeType} для ${symbol} по цене $${entryPrice.toFixed(6)}`);
    
    if (volumeLeverage) {
      console.log(`📊 Leverage: ${volumeLeverage.toFixed(1)}x, Тейк-профит: ${(dynamicTakeProfitPercent * 100).toFixed(1)}%`);
    }
    
    // Отправить уведомление о новой сделке
    this.sendNewTradeNotification(trade).catch(error => {
      console.error(`❌ Ошибка отправки уведомления о новой сделке для ${symbol}:`, error.message);
    });
    
    return trade;
  }

  /**
   * Проверить pending anomalies (переопределение абстрактного метода)
   */
  async checkPendingAnomalies() {
    if (this.pendingAnomalies.size === 0) {
      return; // Нет монет в watchlist
    }
    
    console.log(`⏳ [ПОТОК 2] Мониторинг ${this.pendingAnomalies.size} монет в watchlist (многопоточный)...`);
    
    const batchSize = 5; // Меньший размер батча для watchlist
    const delayBetweenBatches = 500; // Меньшая задержка
    
    const anomalies = Array.from(this.pendingAnomalies.entries());
    
    // Разбить на батчи
    for (let i = 0; i < anomalies.length; i += batchSize) {
      const batch = anomalies.slice(i, i + batchSize);
      
      console.log(`📦 Обработка watchlist батча ${Math.floor(i / batchSize) + 1}/${Math.ceil(anomalies.length / batchSize)} (${batch.length} монет)`);
      
      // Запустить все запросы в батче параллельно
      const promises = batch.map(async ([symbol, anomaly]) => {
        try {
          // Проверить подтверждение входа
          await this.checkEntryConfirmation(symbol, anomaly.tradeType, anomaly.anomalyCandleIndex);
          
          // Проверить таймаут watchlist
          this.checkWatchlistTimeout(symbol, anomaly);
        } catch (error) {
          console.error(`❌ Ошибка проверки ${symbol}:`, error.message);
        }
      });
      
      // Ждать завершения всех запросов в батче
      await Promise.all(promises);
      
      // Задержка между батчами
      if (i + batchSize < anomalies.length) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    }
    
    console.log('✅ [ПОТОК 2] Мониторинг watchlist завершен');
  }

  /**
   * Проверить таймаут watchlist (REST API специфика)
   */
  checkWatchlistTimeout(symbol, anomaly) {
    // Используем метод базового класса для проверки таймаута
    if (this.checkEntryTimeout(anomaly)) {
      console.log(`⏰ ${symbol} - Таймаут подтверждения входа (6 TF), удаляем из watchlist`);
      
      // Удалить из watchlist с правильной причиной
      this.removeFromWatchlist(symbol, 'timeout');
    }
  }

  /**
   * Отслеживание активных сделок (переопределение абстрактного метода)
   */
  async trackActiveTrades() {
    if (this.activeTrades.size === 0) {
      return; // Нет активных сделок для отслеживания
    }

    console.log(`📊 [ПОТОК 3] Мониторинг ${this.activeTrades.size} сделок в trade list (многопоточный)...`);
    
    const batchSize = 3; // Меньший размер батча для активных сделок
    const delayBetweenBatches = 300; // Меньшая задержка
    
    const trades = Array.from(this.activeTrades.entries());
    
    // Разбить на батчи
    for (let i = 0; i < trades.length; i += batchSize) {
      const batch = trades.slice(i, i + batchSize);
      
      console.log(`📦 Обработка trade list батча ${Math.floor(i / batchSize) + 1}/${Math.ceil(trades.length / batchSize)} (${batch.length} сделок)`);
      
      // Запустить все запросы в батче параллельно
      const promises = batch.map(async ([symbol, trade]) => {
        try {
          const since = Date.now() - (2 * 15 * 60 * 1000); // Последние 2 свечи
          const candles = await this.fetchCandles(symbol, since, 2, 3);
          
        if (candles.length === 0) {
            console.log(`⚠️ Не удалось получить данные для ${symbol}`);
            return;
        }

        const currentPrice = this.calculateAveragePrice(candles);
          const currentVolume = candles[candles.length - 1][5]; // Объем текущей свечи
        
          // Обновить последнюю цену, время и объем
        trade.lastPrice = currentPrice;
        trade.lastUpdateTime = new Date().toISOString();
          trade.currentVolume = currentVolume; // Обновляем текущий объем
          
          // Проверить и установить режим безубытка
          this.checkAndSetBezubitok(trade, currentPrice);
          
          // Проверить условия закрытия
          this.checkTradeExitConditions(trade, currentPrice);
        } catch (error) {
          console.error(`❌ Ошибка отслеживания ${symbol}:`, error.message);
        }
      });
      
      // Ждать завершения всех запросов в батче
      await Promise.all(promises);
      
      // Задержка между батчами
      if (i + batchSize < trades.length) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    }
    
    // Сохранить обновленные данные в файл
    await this.saveActiveTrades();
    
    console.log('✅ [ПОТОК 3] Мониторинг trade list завершен');
  }

  /**
   * Проверить условия выхода из сделки (REST API специфика)
   */
  checkTradeExitConditions(trade, currentPrice) {
    const { symbol, type, entryPrice, stopLoss, takeProfit } = trade;
    
    // Проверить и установить режим безубытка
    this.checkAndSetBezubitok(trade, currentPrice);
    
        let shouldClose = false;
    let reason = '';
        let profitLoss = 0;

    // Логика из базового класса
    if (type === 'Long') {
      if (currentPrice >= takeProfit) {
            shouldClose = true;
        reason = 'take_profit';
        profitLoss = ((currentPrice - entryPrice) / entryPrice) * 100;
      } else if (currentPrice <= stopLoss) {
            shouldClose = true;
        reason = 'stop_loss';
        profitLoss = ((currentPrice - entryPrice) / entryPrice) * 100;
          }
        } else { // Short
      if (currentPrice <= takeProfit) {
            shouldClose = true;
        reason = 'take_profit';
        profitLoss = ((entryPrice - currentPrice) / entryPrice) * 100;
      } else if (currentPrice >= stopLoss) {
            shouldClose = true;
        reason = 'stop_loss';
        profitLoss = ((entryPrice - currentPrice) / entryPrice) * 100;
          }
        }

        if (shouldClose) {
      console.log(`🔴 ${symbol} - Закрытие сделки: ${reason} (${profitLoss.toFixed(2)}%)`);
      this.closeTrade(trade, currentPrice, reason, profitLoss);
    }
  }

  /**
   * Закрыть сделку
   */
  async closeTrade(trade, exitPrice, reason, profitLoss) {
    trade.exitPrice = exitPrice;
    trade.exitTime = new Date().toISOString();
    trade.status = 'closed';
    trade.closeReason = reason;
    trade.profitLoss = profitLoss;
    trade.duration = new Date(trade.exitTime) - new Date(trade.entryTime);

    // Добавить в историю
    this.tradeHistory.push(trade);
    
    // Удалить из активных сделок и watchlist
    this.activeTrades.delete(trade.symbol);
    this.watchlist.delete(trade.symbol);
    console.log(`🗑️ ${trade.symbol} удален из trade list и watchlist`);

    // Сохранить историю и статистику
    await this.saveTradeHistory();
    await this.saveTradingStatistics();

    console.log(`🔒 Закрыта сделка ${trade.type} для ${trade.symbol}: ${profitLoss.toFixed(2)}% (${reason})`);
    
    // Отправить уведомление
    await this.sendTradeNotification(trade);
  }

  /**
   * Отправить уведомление о сделке
   */
  async sendTradeNotification(trade) {
    try {
      if (!this.app) return;
      
      const notificationRepository = global.cryptoScreener.notificationRepository;
      const message = this.createTradeNotificationMessage(trade);
      await notificationRepository.sendTelegramMessage(message);
      console.log('✅ Уведомление о сделке отправлено');
    } catch (error) {
      console.error('❌ Ошибка отправки уведомления:', error.message);
    }
  }

  /**
   * Создать сообщение о сделке
   */
  createTradeNotificationMessage(trade) {
    const symbol = trade.symbol.replace('/USDT', '');
    const profitLossText = trade.profitLoss >= 0 ? `+${trade.profitLoss.toFixed(2)}%` : `${trade.profitLoss.toFixed(2)}%`;
    const emoji = trade.profitLoss >= 0 ? '🟢' : '🔴';
    const reasonText = trade.closeReason === 'take_profit' ? 'Тейк-профит' : 'Стоп-лосс';
    
    // Получить текущую статистику
    const stats = this.getCurrentStatistics();
    
    // Форматировать время закрытия сделки
    const closeTime = new Date(trade.exitTime).toLocaleString('ru-RU', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    
    // Рассчитать прогресс тейк-профита для закрытой сделки
    let takeProfitProgress = 0;
    if (trade.type === 'Long') {
      takeProfitProgress = ((trade.exitPrice - trade.entryPrice) / (trade.takeProfit - trade.entryPrice)) * 100;
    } else {
      // Для Short сделок логика обратная
      takeProfitProgress = ((trade.entryPrice - trade.exitPrice) / (trade.entryPrice - trade.takeProfit)) * 100;
    }
    
    // Ограничить прогресс от 0 до 100%
    takeProfitProgress = Math.max(0, Math.min(100, takeProfitProgress));
    
    return `${symbol} → ${trade.type} ${emoji} ЗАКРЫТА
🆔 ID: ${trade.anomalyId || trade.id || 'N/A'}
🕐 Время закрытия: ${closeTime}

💰 Вход: $${trade.entryPrice.toFixed(6)}
💰 Выход: $${trade.exitPrice.toFixed(6)}
📊 Результат: ${profitLossText}
🎯 Тейк: $${trade.takeProfit.toFixed(6)} (${takeProfitProgress.toFixed(0)}% прогресс)
⏱️ Длительность: ${Math.round(trade.duration / 1000 / 60)} минут
🎯 Причина: ${reasonText}

📈 ТЕКУЩАЯ СТАТИСТИКА:
• Всего сделок: ${stats.totalTrades}
• Прибыльных: ${stats.winningTrades} 🟢
• Убыточных: ${stats.losingTrades} 🔴
• Винрейт: ${stats.winRate}%
• Общая прибыль: ${stats.totalProfit}%
• Активных сделок: ${this.activeTrades.size}`;
  }

  /**
   * Получить текущую статистику
   */
  getCurrentStatistics() {
    if (!this.tradingStatistics) {
      return {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        totalProfit: 0
      };
    }
    
    return {
      totalTrades: this.tradingStatistics.totalTrades,
      winningTrades: this.tradingStatistics.winningTrades,
      losingTrades: this.tradingStatistics.losingTrades,
      winRate: this.tradingStatistics.winRate,
      totalProfit: this.tradingStatistics.totalProfit.toFixed(2)
    };
  }

  /**
   * Обновить статистику торговли
   */
  updateTradingStatistics() {
    if (!this.tradingStatistics) return;

    const totalTrades = this.tradeHistory.length;
    const winningTrades = this.tradeHistory.filter(t => t.profitLoss > 0).length;
    const losingTrades = this.tradeHistory.filter(t => t.profitLoss < 0).length;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades * 100).toFixed(1) : 0;
    const totalProfit = this.tradeHistory.reduce((sum, t) => sum + t.profitLoss, 0);
    const averageProfit = totalTrades > 0 ? (totalProfit / totalTrades).toFixed(2) : 0;

    // Найти лучшую и худшую сделки
    const bestTrade = this.tradeHistory.length > 0 ? 
      this.tradeHistory.reduce((best, current) => 
        current.profitLoss > best.profitLoss ? current : best
      ) : null;

    const worstTrade = this.tradeHistory.length > 0 ? 
      this.tradeHistory.reduce((worst, current) => 
        current.profitLoss < worst.profitLoss ? current : worst
      ) : null;

    // Найти самую длинную и короткую сделки
    const longestTrade = this.tradeHistory.length > 0 ? 
      this.tradeHistory.reduce((longest, current) => 
        current.duration > longest.duration ? current : longest
      ) : null;

    const shortestTrade = this.tradeHistory.length > 0 ? 
      this.tradeHistory.reduce((shortest, current) => 
        current.duration < shortest.duration ? current : shortest
      ) : null;

    // Рассчитать дни работы системы
    const systemStartTime = new Date(this.tradingStatistics.systemStartTime);
    const now = new Date();
    const totalDaysRunning = Math.ceil((now - systemStartTime) / (1000 * 60 * 60 * 24));
    const averageTradesPerDay = totalDaysRunning > 0 ? (totalTrades / totalDaysRunning).toFixed(1) : 0;

    // Обновить статистику
    this.tradingStatistics = {
      ...this.tradingStatistics,
      lastUpdated: new Date().toISOString(),
      totalTrades,
      winningTrades,
      losingTrades,
      winRate: parseFloat(winRate),
      totalProfit,
      averageProfit: parseFloat(averageProfit),
      bestTrade: bestTrade ? {
        symbol: bestTrade.symbol,
        type: bestTrade.type,
        profitLoss: bestTrade.profitLoss,
        entryTime: bestTrade.entryTime
      } : null,
      worstTrade: worstTrade ? {
        symbol: worstTrade.symbol,
        type: worstTrade.type,
        profitLoss: worstTrade.profitLoss,
        entryTime: worstTrade.entryTime
      } : null,
      longestTrade: longestTrade ? {
        symbol: longestTrade.symbol,
        type: longestTrade.type,
        duration: longestTrade.duration,
        entryTime: longestTrade.entryTime
      } : null,
      shortestTrade: shortestTrade ? {
        symbol: shortestTrade.symbol,
        type: shortestTrade.type,
        duration: shortestTrade.duration,
        entryTime: shortestTrade.entryTime
      } : null,
      tradeHistory: this.tradeHistory.map(trade => ({
        id: trade.id,
        symbol: trade.symbol,
        type: trade.type,
        entryPrice: trade.entryPrice,
        exitPrice: trade.exitPrice,
        profitLoss: trade.profitLoss,
        entryTime: trade.entryTime,
        exitTime: trade.exitTime,
        closeReason: trade.closeReason,
        duration: trade.duration
      })),
      totalDaysRunning,
      averageTradesPerDay: parseFloat(averageTradesPerDay)
    };
  }

  /**
   * Показать статистику торговли с дополнительной информацией о приоритетной очереди
   */
  showStatistics() {
    // Вызвать базовый метод
    super.showStatistics();
    
    // Добавить статистику приоритетной очереди
    console.log('\n🎯 СТАТИСТИКА ПРИОРИТЕТНОЙ ОЧЕРЕДИ:');
    console.log(`📦 Задач в очереди: ${this.taskQueue.length}`);
    console.log(`⚙️ Обработка активна: ${this.isProcessing ? 'Да' : 'Нет'}`);
    
    const now = Date.now();
    const activeTradesAgo = this.lastActiveTradesCheck ? Math.round((now - this.lastActiveTradesCheck) / 1000) : 'Никогда';
    const pendingAgo = this.lastPendingCheck ? Math.round((now - this.lastPendingCheck) / 1000) : 'Никогда';
    const anomalyAgo = this.lastAnomalyCheck ? Math.round((now - this.lastAnomalyCheck) / 1000) : 'Никогда';
    
    console.log(`🥇 Активные сделки: ${activeTradesAgo} сек назад`);
    console.log(`🥈 Watchlist: ${pendingAgo} сек назад`);
    console.log(`🥉 Аномалии: ${anomalyAgo} сек назад`);
    
    // Добавить статистику по watchlist
    if (this.pendingAnomalies.size > 0) {
      console.log('\n📊 СТАТИСТИКА WATCHLIST:');
      console.log(`📋 Монет в watchlist: ${this.pendingAnomalies.size}`);
      
      let longCount = 0, shortCount = 0;
      let totalVolumeLeverage = 0;
      let maxLeverage = 0;
      let minLeverage = Infinity;
      
      this.pendingAnomalies.forEach(anomaly => {
        if (anomaly.tradeType === 'Long') longCount++;
        else shortCount++;
        
        if (anomaly.volumeLeverage) {
          totalVolumeLeverage += anomaly.volumeLeverage;
          maxLeverage = Math.max(maxLeverage, anomaly.volumeLeverage);
          minLeverage = Math.min(minLeverage, anomaly.volumeLeverage);
        }
      });
      
      const avgLeverage = totalVolumeLeverage > 0 ? (totalVolumeLeverage / this.pendingAnomalies.size).toFixed(1) : 0;
      
      console.log(`📈 Long позиции: ${longCount}`);
      console.log(`📉 Short позиции: ${shortCount}`);
      console.log(`📊 Средний leverage: ${avgLeverage}x`);
      console.log(`📊 Максимальный leverage: ${maxLeverage > 0 ? maxLeverage.toFixed(1) + 'x' : 'N/A'}`);
      console.log(`📊 Минимальный leverage: ${minLeverage < Infinity ? minLeverage.toFixed(1) + 'x' : 'N/A'}`);
    }
    
    // Добавить статистику исторических аномалий
    if (this.historicalAnomalies.size > 0) {
      console.log('\n📊 СТАТИСТИКА ИСТОРИЧЕСКИХ АНОМАЛИЙ (сегодня):');
      console.log(`📋 Всего аномалий за день: ${this.historicalAnomalies.size}`);
      
      let longCount = 0, shortCount = 0;
      let totalVolumeLeverage = 0;
      let maxLeverage = 0;
      let minLeverage = Infinity;
      
      this.historicalAnomalies.forEach(anomaly => {
        if (anomaly.tradeType === 'Long') longCount++;
        else shortCount++;
        
        if (anomaly.volumeLeverage) {
          totalVolumeLeverage += anomaly.volumeLeverage;
          maxLeverage = Math.max(maxLeverage, anomaly.volumeLeverage);
          minLeverage = Math.min(minLeverage, anomaly.volumeLeverage);
        }
      });
      
      const avgLeverage = totalVolumeLeverage > 0 ? (totalVolumeLeverage / this.historicalAnomalies.size).toFixed(1) : 0;
      
      console.log(`📈 Long аномалии: ${longCount}`);
      console.log(`📉 Short аномалии: ${shortCount}`);
      console.log(`📊 Средний leverage: ${avgLeverage}x`);
      console.log(`📊 Максимальный leverage: ${maxLeverage > 0 ? maxLeverage.toFixed(1) + 'x' : 'N/A'}`);
      console.log(`📊 Минимальный leverage: ${minLeverage < Infinity ? minLeverage.toFixed(1) + 'x' : 'N/A'}`);
      console.log(`📁 Файл: anomalies_${this.currentDay}.json`);
    }
  }

  /**
   * Проверить аномалии для одной монеты (переопределение абстрактного метода)
   */
  async checkAnomalies(coin) {
    const symbol = `${coin.symbol}/USDT`;
    
    // Проверки уже выполнены в runAnomalyCheck, поэтому сразу переходим к анализу

    try {
      const since = Date.now() - (this.config.historicalWindow * 15 * 60 * 1000);
      const candles = await this.fetchCandles(symbol, since, Math.max(this.config.historicalWindow, 20), 3);
      
      if (candles.length < this.config.historicalWindow) {
        return;
      }

      const anomalyCandle = candles[candles.length - 2];
      const historicalCandles = candles.slice(0, -2);

      const anomalyVolume = anomalyCandle[5];
      const avgHistoricalVolume = this.calculateAverageVolume(historicalCandles);
      const anomalyPrice = this.calculateAveragePrice([anomalyCandle]);
      const avgHistoricalPrice = this.calculateAveragePrice(historicalCandles);

      // Обнаружение аномалии объема (используем метод базового класса)
      if (!this.detectVolumeAnomaly(anomalyVolume, avgHistoricalVolume)) {
        return;
      }

      // Рассчитать leverage (увеличение объема)
      const volumeLeverage = parseFloat((anomalyVolume / avgHistoricalVolume).toFixed(1));

      console.log(`🚨 Аномалия объема обнаружена для ${symbol}! (${volumeLeverage}x)`);
      console.log(`📊 Детали аномалии:`);
      console.log(`   📈 Аномальный объем: ${anomalyVolume.toLocaleString()}`);
      console.log(`   📊 Средний объем: ${avgHistoricalVolume.toLocaleString()}`);
      console.log(`   💰 Аномальная цена: $${anomalyPrice.toFixed(6)}`);
      console.log(`   📈 Историческая цена: $${avgHistoricalPrice.toFixed(6)}`);

      // Определение типа сделки (используем метод базового класса)
      let tradeType = this.determineTradeType(anomalyPrice, avgHistoricalPrice);
      
      // Если тип не определен, но leverage очень высокий, попробуем снизить порог
      if (!tradeType && volumeLeverage > 20) {
        console.log(`🔥 Очень высокий leverage (${volumeLeverage}x), пробуем сниженный порог...`);
        
        // Временно снизить порог для определения типа сделки
        const originalThreshold = this.config.priceThreshold;
        this.config.priceThreshold = 0.005; // 0.5% вместо 1%
        
        tradeType = this.determineTradeType(anomalyPrice, avgHistoricalPrice);
        
        // Восстановить оригинальный порог
        this.config.priceThreshold = originalThreshold;
        
        if (tradeType) {
          console.log(`✅ Тип сделки определен со сниженным порогом: ${tradeType}`);
        }
      }
      
      if (!tradeType) {
        console.log(`⚠️ Неопределенный тип сделки для ${symbol}`);
        this.setAnomalyCooldown(symbol);
        return;
      }

      console.log(`📈 Тип сделки: ${tradeType}`);

      // Создать уникальный ID аномалии
      const anomalyId = `${symbol.replace('/USDT', '')}_${Date.now()}`;
      
      // Сохранить аномалию в pending для ожидания подтверждения
      const anomalyTime = new Date(anomalyCandle[0]);
      
      const anomaly = {
        symbol: symbol, // Добавляем символ
        anomalyId,
        tradeType: tradeType,
        anomalyTime: anomalyTime.toISOString(),
        watchlistTime: new Date().toISOString(), // Время добавления в watchlist
        anomalyCandleIndex: candles.length - 2,
        anomalyPrice: anomalyPrice,
        historicalPrice: avgHistoricalPrice,
        currentVolume: anomalyVolume, // Добавляем текущий объем свечи
        volumeLeverage: parseFloat(volumeLeverage) // Добавляем leverage объема
      };
      
      // Добавить в watchlist
      await this.addToWatchlist(anomaly);
      
      // Сохранить в историю
      await this.saveAnomalyToHistory(anomaly);
      
      // Отправить уведомление
      const message = `🚨 НОВАЯ АНОМАЛИЯ ОБНАРУЖЕНА!\n\n` +
                      `🪙 ${symbol}\n` +
                      `📊 Тип: ${tradeType}\n` +
                      `💰 Цена: $${anomalyPrice.toFixed(6)}\n` +
                      `📈 Объем: ${volumeLeverage ? `${volumeLeverage.toFixed(1)}x` : 'N/A'}\n` +
                      `📈 Изменение цены: ${((anomalyPrice - avgHistoricalPrice) / avgHistoricalPrice * 100).toFixed(2)}%\n` +
                      `⏰ Время: ${new Date().toLocaleString('ru-RU')}\n\n` +
                      `📋 Добавлено в watchlist для мониторинга`;
      
      await this.notificationService.sendTelegramMessage(message);

    } catch (error) {
      console.error(`❌ Ошибка проверки ${symbol}:`, error.message);
    }
  }

  /**
   * Отправить уведомление о новой сделке
   */
  async sendNewTradeNotification(trade) {
    try {
      if (!this.app) return;
      
      const notificationRepository = global.cryptoScreener.notificationRepository;
      const message = this.createNewTradeMessage(trade);
      await notificationRepository.sendTelegramMessage(message);
      console.log('✅ Уведомление о новой сделке отправлено');
    } catch (error) {
      console.error('❌ Ошибка отправки уведомления:', error.message);
    }
  }

  /**
   * Создать сообщение о новой сделке
   */
  createNewTradeMessage(trade) {
    const symbol = trade.symbol.replace('/USDT', '');
    const emoji = trade.type === 'Long' ? '🟢' : '🔴';
    const stopLoss = trade.stopLoss;
    const takeProfit = trade.takeProfit;

    // Получить текущую статистику
    const stats = this.getCurrentStatistics();

    // Форматировать время создания сделки
    const tradeTime = new Date(trade.entryTime).toLocaleString('ru-RU', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    return `🎯 НОВАЯ СДЕЛКА: ${symbol} → ${trade.type} ${emoji}
🆔 ID: ${trade.anomalyId || trade.id || 'N/A'}
🕐 Время: ${tradeTime}

💰 Вход: $${trade.entryPrice.toFixed(6)}
🛑 Стоп: $${stopLoss.toFixed(6)}
🎯 Тейк: $${takeProfit.toFixed(6)} (0% прогресс)
📊 Объем: ${trade.volumeIncrease ? `${trade.volumeIncrease}x` : 'N/A'}

📈 ТЕКУЩАЯ СТАТИСТИКА:
• Всего сделок: ${stats.totalTrades}
• Прибыльных: ${stats.winningTrades} 🟢
• Убыточных: ${stats.losingTrades} 🔴
• Винрейт: ${stats.winRate}%
• Активных сделок: ${this.activeTrades.size}`;
  }

  /**
   * Отправить уведомление об обновлении watchlist
   */
  async sendWatchlistUpdateNotification(symbol, tradeType, priceDiff) {
    try {
      if (!this.app) return;
      
      const notificationRepository = global.cryptoScreener.notificationRepository;
      const message = this.createWatchlistUpdateMessage(symbol, tradeType, priceDiff);
      await notificationRepository.sendTelegramMessage(message);
      console.log(`📱 Уведомление о watchlist отправлено для ${symbol}`);
    } catch (error) {
      console.error(`❌ Ошибка отправки уведомления о watchlist для ${symbol}:`, error.message);
    }
  }

  /**
   * Создать сообщение об обновлении watchlist
   */
  createWatchlistUpdateMessage(symbol, tradeType, priceDiff) {
    const symbolName = symbol.replace('/USDT', '');
    const priceChangeText = priceDiff >= 0 ? `+${(priceDiff * 100).toFixed(2)}%` : `${(priceDiff * 100).toFixed(2)}%`;
    const emoji = tradeType === 'Long' ? '🟢' : '🔴';
    
    return `⏳ ${symbolName} → ${tradeType} ${emoji} - ОЖИДАНИЕ

📊 Изменение цены: ${priceChangeText}
🎯 Нужно: ${tradeType === 'Long' ? '>+0.5%' : '<-0.5%'}
⏰ Статус: Ожидаем более сильного движения

💡 Монета остается в watchlist для дальнейшего мониторинга`;
  }

  /**
   * Отправить уведомление о добавлении в watchlist
   */
  async sendWatchlistAddedNotification(symbol, tradeType, anomalyId = null) {
    try {
      if (!this.app) return;
      
      const notificationRepository = global.cryptoScreener.notificationRepository;
      const message = this.createWatchlistAddedMessage(symbol, tradeType, anomalyId);
      await notificationRepository.sendTelegramMessage(message);
      console.log(`📱 Уведомление о добавлении в watchlist отправлено для ${symbol}`);
    } catch (error) {
      console.error(`❌ Ошибка отправки уведомления о добавлении в watchlist для ${symbol}:`, error.message);
    }
  }

  /**
   * Отправить уведомление о существующих сделках при запуске
   */
  async sendExistingTradesNotification() {
    try {
      if (!this.app) return;
      
      const notificationRepository = global.cryptoScreener.notificationRepository;
      const message = this.createExistingTradesMessage();
      await notificationRepository.sendTelegramMessage(message);
      console.log('📱 Уведомление о существующих сделках отправлено');
    } catch (error) {
      console.error('❌ Ошибка отправки уведомления о существующих сделках:', error.message);
    }
  }

  /**
   * Создать сообщение о существующих сделках
   */
  createExistingTradesMessage() {
    const trades = Array.from(this.activeTrades.values());
    const longTrades = trades.filter(t => t.type === 'Long');
    const shortTrades = trades.filter(t => t.type === 'Short');
    
    let message = `📊 СУЩЕСТВУЮЩИЕ СДЕЛКИ (${trades.length})\n\n`;
    
    if (longTrades.length > 0) {
      message += `🟢 LONG (${longTrades.length}):\n`;
      longTrades.forEach(trade => {
        const symbol = trade.symbol.replace('/USDT', '');
        const entryTime = new Date(trade.entryTime).toLocaleString('ru-RU');
        const lastUpdateTime = trade.lastUpdateTime ? new Date(trade.lastUpdateTime).toLocaleString('ru-RU') : 'Не обновлялось';
        
        // Рассчитать изменение в процентах
        const lastPrice = trade.lastPrice || trade.entryPrice;
        const priceChange = ((lastPrice - trade.entryPrice) / trade.entryPrice) * 100;
        const changeEmoji = priceChange >= 0 ? '🟢' : '🔴';
        const changeSign = priceChange >= 0 ? '+' : '';
        
        // Рассчитать прогресс тейк-профита по формуле: (текущая - вход)/(тейк-вход)*100
        let takeProfitProgress = 0;
        if (trade.type === 'Long') {
          takeProfitProgress = ((lastPrice - trade.entryPrice) / (trade.takeProfit - trade.entryPrice)) * 100;
        } else {
          // Для Short сделок логика обратная
          takeProfitProgress = ((trade.entryPrice - lastPrice) / (trade.entryPrice - trade.takeProfit)) * 100;
        }
        
        // Ограничить прогресс от 0 до 100%
        takeProfitProgress = Math.max(0, Math.min(100, takeProfitProgress));
        
        // Определить иконку прогресса
        const progressEmoji = takeProfitProgress > 0 ? '🟢' : '⚪';
        
        message += `• ${symbol} ${changeEmoji}\n`;
        message += `  🕐 Вход: ${entryTime}\n`;
        message += `  💰 Точка входа: $${trade.entryPrice.toFixed(6)}\n`;
        message += `  📈 Текущая цена: $${lastPrice.toFixed(6)}\n`;
        message += `  📊 Изменение: ${changeSign}${priceChange.toFixed(2)}%\n`;
        message += `  🎯 Тейк: $${trade.takeProfit.toFixed(6)}\n`;
        message += `  📊 Прогресс: ${progressEmoji} ${takeProfitProgress.toFixed(0)}%\n`;
        message += `  ⏰ Обновлено: ${lastUpdateTime}\n\n`;
      });
    }
    
    if (shortTrades.length > 0) {
      message += `🔴 SHORT (${shortTrades.length}):\n`;
      shortTrades.forEach(trade => {
        const symbol = trade.symbol.replace('/USDT', '');
        const entryTime = new Date(trade.entryTime).toLocaleString('ru-RU');
        const lastUpdateTime = trade.lastUpdateTime ? new Date(trade.lastUpdateTime).toLocaleString('ru-RU') : 'Не обновлялось';
        
        // Рассчитать изменение в процентах (для Short логика обратная)
        const lastPrice = trade.lastPrice || trade.entryPrice;
        const priceChange = ((trade.entryPrice - lastPrice) / trade.entryPrice) * 100;
        const changeEmoji = priceChange >= 0 ? '🟢' : '🔴';
        const changeSign = priceChange >= 0 ? '+' : '';
        
        // Рассчитать прогресс тейк-профита по формуле: (текущая - вход)/(тейк-вход)*100
        let takeProfitProgress = 0;
        if (trade.type === 'Long') {
          takeProfitProgress = ((lastPrice - trade.entryPrice) / (trade.takeProfit - trade.entryPrice)) * 100;
        } else {
          // Для Short сделок логика обратная
          takeProfitProgress = ((trade.entryPrice - lastPrice) / (trade.entryPrice - trade.takeProfit)) * 100;
        }
        
        // Ограничить прогресс от 0 до 100%
        takeProfitProgress = Math.max(0, Math.min(100, takeProfitProgress));
        
        // Определить иконку прогресса
        const progressEmoji = takeProfitProgress > 0 ? '🟢' : '⚪';
        
        message += `• ${symbol} ${changeEmoji}\n`;
        message += `  🕐 Вход: ${entryTime}\n`;
        message += `  💰 Точка входа: $${trade.entryPrice.toFixed(6)}\n`;
        message += `  📈 Текущая цена: $${lastPrice.toFixed(6)}\n`;
        message += `  📊 Изменение: ${changeSign}${priceChange.toFixed(2)}%\n`;
        message += `  🎯 Тейк: $${trade.takeProfit.toFixed(6)}\n`;
        message += `  📊 Прогресс: ${progressEmoji} ${takeProfitProgress.toFixed(0)}%\n`;
        message += `  ⏰ Обновлено: ${lastUpdateTime}\n\n`;
      });
    }
    
    message += `💡 Система мониторит эти сделки каждые 30 секунд`;
    
    return message;
  }

  /**
   * Создать сообщение о добавлении в watchlist
   */
  createWatchlistAddedMessage(symbol, tradeType, anomalyId = null) {
    const symbolName = symbol.replace('/USDT', '');
    const emoji = tradeType === 'Long' ? '🟢' : '🔴';
    const idText = anomalyId ? `\n🆔 ID: ${anomalyId}` : '';
    
    return `📋 ${symbolName} → ${tradeType} ${emoji} - ДОБАВЛЕН В WATCHLIST${idText}

🚨 Аномалия объема обнаружена
📈 Направление: ${tradeType}
⏰ Ожидаем подтверждения точки входа (2 свечи)

💡 Система будет мониторить движение цены каждые 5 минут`;
  }

  /**
   * Поток 1: Поиск аномалий среди всех монет (5 минут) - REST API
   * Многопоточная обработка с ограниченным количеством одновременных запросов
   * Приоритет 3 - низший приоритет
   */
  async runAnomalyCheck() {
    console.log('🔍 [ПОТОК 1] Поиск аномалий среди всех монет (многопоточный)...');
    
    // Проверить правило ограничения частоты перезапуска
    if (!this.checkAnomalyRateLimit()) {
      return;
    }
    
    // Зафиксировать время начала проверки
    const checkStartTime = Date.now();
    this.lastAnomalyCheckStart = checkStartTime;
    
    try {
      // Проверить, не слишком ли часто добавляем задачи в очередь
      const now = Date.now();
      const timeSinceLastCheck = now - this.lastAnomalyCheck;
      
      // Добавляем задачи в очередь только каждые 2 минуты
      if (timeSinceLastCheck < 2 * 60 * 1000) {
        console.log('⏳ Слишком рано для добавления задач в очередь, пропускаем');
        return;
      }
      
      this.lastAnomalyCheck = now;
      
      // Фильтровать монеты, которые уже в pending или на cooldown
      const pendingSymbols = Array.from(this.pendingAnomalies.keys());
      const cooldownSymbols = Array.from(this.anomalyCooldowns.keys());
      
      const availableCoins = this.filteredCoins.filter(coin => {
        const symbol = `${coin.symbol}/USDT`;
        return !this.pendingAnomalies.has(symbol) && 
               !this.isAnomalyOnCooldown(symbol) && 
               !this.activeTrades.has(symbol);
      });
      
      const excludedFromPending = this.filteredCoins.filter(coin => {
        const symbol = `${coin.symbol}/USDT`;
        return this.pendingAnomalies.has(symbol);
      });
      
      const excludedFromCooldown = this.filteredCoins.filter(coin => {
        const symbol = `${coin.symbol}/USDT`;
        return this.isAnomalyOnCooldown(symbol);
      });
      
      const excludedFromActiveTrades = this.filteredCoins.filter(coin => {
        const symbol = `${coin.symbol}/USDT`;
        return this.activeTrades.has(symbol);
      });
      
      console.log(`📊 Статистика фильтрации:`);
      console.log(`   📋 Всего монет: ${this.filteredCoins.length}`);
      console.log(`   ✅ Доступно для проверки: ${availableCoins.length}`);
      console.log(`   ⏳ Исключено (в pending): ${excludedFromPending.length}`);
      console.log(`   🚫 Исключено (на cooldown): ${excludedFromCooldown.length}`);
      console.log(`   💰 Исключено (активные сделки): ${excludedFromActiveTrades.length}`);
      
      if (excludedFromPending.length > 0) {
        console.log(`   📋 Монеты в pending: ${excludedFromPending.map(coin => coin.symbol).join(', ')}`);
      }
      
      if (excludedFromActiveTrades.length > 0) {
        console.log(`   💰 Активные сделки: ${excludedFromActiveTrades.map(coin => coin.symbol).join(', ')}`);
      }
      
      if (availableCoins.length === 0) {
        console.log('📊 Нет доступных монет для проверки');
        return;
      }
      
      // Разбить на батчи для многопоточности
      const batchSize = 10;
      const batches = [];
      
      for (let i = 0; i < availableCoins.length; i += batchSize) {
        batches.push(availableCoins.slice(i, i + batchSize));
      }
      
      console.log(`📦 Обработка ${batches.length} батчей по ${batchSize} монет`);
      
      // Обработать батчи с задержкой
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        
        console.log(`📦 Обработка батча ${i + 1}/${batches.length} (${batch.length} монет)`);
        
        // Запустить все запросы в батче параллельно
        const promises = batch.map(coin => this.checkAnomalies(coin));
        await Promise.all(promises);
        
        // Небольшая задержка между батчами
        if (i < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      console.log('✅ [ПОТОК 1] Поиск аномалий завершен');
      
      // Добавить задачи в очередь только каждые 5 батчей
      if (batches.length > 0 && (batches.length % 5 === 0)) {
        console.log('📦 Добавление задач в очередь...');
        
        // Добавить задачи с разными приоритетами
        this.addTaskToQueue(() => this.runActiveTradesCheck(), 1); // Trade List (высший приоритет)
        this.addTaskToQueue(() => this.runPendingCheck(), 2);       // Watchlist (средний приоритет)
      }
      
    } finally {
      // Зафиксировать продолжительность проверки
      this.anomalyCheckDuration = Date.now() - checkStartTime;
      console.log(`⏱️ Проверка аномалий завершена за ${Math.ceil(this.anomalyCheckDuration / 1000)} сек`);
      
      // Если проверка заняла больше максимального времени, вывести предупреждение
      if (this.anomalyCheckDuration > this.anomalyCheckMaxDuration) {
        console.log(`⚠️ ВНИМАНИЕ: Проверка аномалий заняла ${Math.ceil(this.anomalyCheckDuration / 1000)} сек (превышает лимит ${this.anomalyCheckMaxDuration / 1000} сек)`);
        console.log(`⏳ Следующая проверка будет отложена на ${Math.ceil(this.anomalyCheckMinInterval / 1000)} сек для предотвращения перегрузки`);
      }
    }
  }

  /**
   * Поток 2: Мониторинг watchlist (30 секунд) - REST API
   * Приоритет 2 - средний приоритет
   */
  async runPendingCheck() {
    this.addTaskToQueue(async () => {
    await this.checkPendingAnomalies();
      this.lastPendingCheck = Date.now();
    }, 2);
  }

  /**
   * Поток 3: Мониторинг trade list (30 секунд) - REST API
   * Приоритет 1 - высший приоритет
   */
  async runActiveTradesCheck() {
    this.addTaskToQueue(async () => {
    await this.trackActiveTrades();
      this.lastActiveTradesCheck = Date.now();
    }, 1);
  }

  /**
   * Запустить систему (переопределение абстрактного метода)
   */
  async start() {
    try {
      // ПЕРВЫМ ДЕЛОМ - проверить приоритетную очередь
      console.log('🔍 ПЕРВЫЙ ПРИОРИТЕТ: Проверка приоритетной очереди при запуске...');
      await this.checkPriorityQueue();
      
      // Инициализировать систему
      await this.initialize();
      
      console.log('🚀 Запуск системы виртуальной торговли (REST API) с приоритетной очередью...');
      
      // Отправить приветственное сообщение в Telegram
      await this.sendWelcomeMessage();
      
      // Запустить первый цикл всех потоков в правильном порядке приоритетов
      await this.runActiveTradesCheck(); // Приоритет 1 - сначала активные сделки
      await this.runPendingCheck();      // Приоритет 2 - потом watchlist
      await this.runAnomalyCheck();      // Приоритет 3 - потом общий мониторинг

      // Заполнить очередь задачами из приоритета 3 для непрерывной работы
      console.log('📦 Инициализация очереди задачами из приоритета 3...');
      this.addTaskToQueue(async () => {
        console.log('🔍 [ПОТОК 1] Инициализация поиска аномалий...');
      await this.runAnomalyCheck();
      }, 3);

      // Установить интервалы для 3 потоков с приоритетной очередью
      this.activeTradesInterval = setInterval(async () => {
      await this.runActiveTradesCheck();
      }, this.config.activeTradesInterval); // Trade List - высший приоритет

      this.pendingCheckInterval = setInterval(async () => {
        await this.runPendingCheck();
      }, this.config.pendingCheckInterval); // Watchlist - средний приоритет

      this.anomalyCheckInterval = setInterval(async () => {
        await this.runAnomalyCheck();
      }, this.config.anomalyCheckInterval); // Anomalies - низший приоритет

      console.log('⏰ Приоритетная система мониторинга запущена:');
      console.log(`   🥇 Поток 3 (активные сделки): каждые ${this.config.activeTradesInterval / 1000} сек - ПРИОРИТЕТ 1`);
      console.log(`   🥈 Поток 2 (watchlist): каждые ${this.config.pendingCheckInterval / 1000} сек - ПРИОРИТЕТ 2`);
      console.log(`   🥉 Поток 1 (аномалии): каждые ${this.config.anomalyCheckInterval / 1000 / 60} мин - ПРИОРИТЕТ 3`);
      console.log('   📤 Статус в Telegram: каждые 2 часа');

      // Отправить начальный статус через 1 минуту после запуска
      setTimeout(async () => {
        try {
          const { sendSystemStatus } = require('./send-system-status.js');
          await sendSystemStatus();
        } catch (error) {
          console.log('ℹ️ Начальная отправка статуса не выполнена:', error.message);
        }
      }, 60 * 1000); // 1 минута

      // Показывать статистику каждые 30 минут
      setInterval(() => {
        this.showStatistics();
      }, 30 * 60 * 1000);

      // Отправлять статус в Telegram каждые 2 часа
      setInterval(async () => {
        try {
          const { sendSystemStatus } = require('./send-system-status.js');
          await sendSystemStatus();
        } catch (error) {
          console.log('ℹ️ Автоматическая отправка статуса не выполнена:', error.message);
        }
      }, 2 * 60 * 60 * 1000); // 2 часа

    } catch (error) {
      console.error('❌ Ошибка запуска системы:', error.message);
      await this.stop();
    }
  }

  /**
   * Остановить систему (переопределение абстрактного метода)
   */
  async stop() {
    console.log('🛑 Остановка системы...');
    
    // Остановить все потоки
    if (this.anomalyCheckInterval) {
      clearInterval(this.anomalyCheckInterval);
      this.anomalyCheckInterval = null;
    }
    
    if (this.pendingCheckInterval) {
      clearInterval(this.pendingCheckInterval);
      this.pendingCheckInterval = null;
    }
    
    if (this.activeTradesInterval) {
      clearInterval(this.activeTradesInterval);
      this.activeTradesInterval = null;
    }
    
    // Сохранить данные перед остановкой (используем методы базового класса)
    await this.saveTradeHistory();
    await this.savePendingAnomalies();
    await this.saveActiveTrades();
    
    // Сохранить исторические аномалии за текущий день
    if (this.historicalAnomalies.size > 0) {
      await this.saveHistoricalAnomaliesForDay(this.currentDay);
    }
    
    if (this.app) {
      await this.app.stop();
      this.app = null;
    }
    
    // Остановить Telegram бота через синглтон
    if (telegramBotSingleton.isReady()) {
      try {
        await telegramBotSingleton.stop();
        console.log('🤖 Telegram бот остановлен (синглтон)');
      } catch (error) {
        console.error('❌ Ошибка остановки Telegram бота:', error.message);
      }
    }
    
    console.log('✅ Система остановлена');
  }

  /**
   * Загрузить pending anomalies
   */
  async loadPendingAnomalies() {
    try {
      const filename = path.join(__dirname, '..', 'data', 'pending-anomalies.json');
      const data = await fs.readFile(filename, 'utf8');
      const parsed = JSON.parse(data);
      
      // Проверить структуру файла
      if (parsed.meta && parsed.anomalies) {
        // Новая структура
        this.pendingAnomalies = new Map();
        parsed.anomalies.forEach(anomaly => {
          this.pendingAnomalies.set(anomaly.symbol, anomaly);
        });
        console.log(`📊 Загружено ${this.pendingAnomalies.size} pending anomalies (новая структура)`);
      } else if (Array.isArray(parsed)) {
        // Старая структура - конвертировать
        this.pendingAnomalies = new Map();
        parsed.forEach(anomaly => {
          this.pendingAnomalies.set(anomaly.symbol, anomaly);
        });
        console.log(`📊 Загружено ${this.pendingAnomalies.size} pending anomalies (конвертировано из старой структуры)`);
        
        // Обновить структуру файла
        await this.savePendingAnomalies();
      } else {
        this.pendingAnomalies = new Map();
        console.log('📊 Pending anomalies не найдены, создаем новый список');
      }
    } catch (error) {
      console.log('📊 Pending anomalies не найдены, создаем новый список');
      this.pendingAnomalies = new Map();
    }
  }

  /**
   * Сохранить pending anomalies
   */
  async savePendingAnomalies() {
    try {
      const filename = path.join(__dirname, '..', 'data', 'pending-anomalies.json');
      const anomalies = Array.from(this.pendingAnomalies.values());
      
      // Создать новую структуру с мета-статистикой
      const data = {
        meta: {
          sessionStats: {
            sessionStartTime: anomalies.length > 0 ? anomalies[0].watchlistTime : new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
            totalAnomaliesProcessed: anomalies.length,
            currentAnomaliesCount: anomalies.length,
            convertedToTrades: 0,
            removedFromWatchlist: 0,
            averageVolumeLeverage: 0,
            averageWatchlistTimeMinutes: 0,
            longAnomaliesCount: 0,
            shortAnomaliesCount: 0,
            consolidatedAnomaliesCount: 0,
            unconsolidatedAnomaliesCount: 0,
            topVolumeLeverages: [],
            conversionRate: 0.0,
            sessionDurationMinutes: 0
          },
          fileInfo: {
            version: "2.0",
            description: "Pending anomalies with session statistics",
            createdAt: anomalies.length > 0 ? anomalies[0].watchlistTime : new Date().toISOString(),
            lastModified: new Date().toISOString()
          }
        },
        anomalies: anomalies
      };
      
      await fs.writeFile(filename, JSON.stringify(data, null, 2));
      
      // Обновить мета-статистику
      await this.pendingAnomaliesStatsUpdater.updateStats();
      
      console.log(`💾 Сохранено ${anomalies.length} pending anomalies`);
    } catch (error) {
      console.error('❌ Ошибка сохранения pending anomalies:', error.message);
    }
  }

  /**
   * Добавить аномалию в watchlist
   */
  async addToWatchlist(anomaly) {
    try {
      this.pendingAnomalies.set(anomaly.symbol, anomaly);
      await this.savePendingAnomalies();
      
      // Обновить мета-статистику
      await this.pendingAnomaliesStatsUpdater.addAnomaly(anomaly);
      
      // Синхронизировать с trading-statistics.json
      await this.watchlistStatsSync.syncWatchlistStats();
      
      console.log(`📋 ${anomaly?.symbol || 'Unknown'} добавлен в watchlist (${this.pendingAnomalies.size} всего)`);
      
      // Отправить уведомление о добавлении в pending anomalies
      await this.sendPendingAnomalyAddedNotification(anomaly);
    } catch (error) {
      console.error('❌ Ошибка добавления в watchlist:', error.message);
    }
  }

  /**
   * Удалить аномалию из watchlist
   */
  async removeFromWatchlist(symbol, reason = 'removed') {
    try {
      if (this.pendingAnomalies.has(symbol)) {
        const anomaly = this.pendingAnomalies.get(symbol);
        this.pendingAnomalies.delete(symbol);
        await this.savePendingAnomalies();
        
        // Обновить мета-статистику
        await this.pendingAnomaliesStatsUpdater.removeAnomaly(symbol, reason);
        
        // Синхронизировать с trading-statistics.json
        await this.watchlistStatsSync.syncWatchlistStats();
        
        console.log(`❌ ${symbol} удален из watchlist (${reason})`);
        
        // Отправить уведомление об удалении из pending anomalies
        // (но не отправляем если удаление по причине перехода в сделку)
        if (reason !== 'converted_to_trade') {
          await this.sendPendingAnomalyRemovedNotification(symbol, reason, anomaly);
        } else {
          console.log(`💰 ${symbol} конвертирована в сделку - уведомление об удалении не отправляется`);
        }
      }
    } catch (error) {
      console.error('❌ Ошибка удаления из watchlist:', error.message);
    }
  }
}

// Обработка завершения процесса
process.on('SIGINT', async () => {
  console.log('\n🛑 Получен сигнал завершения...');
  await system.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Получен сигнал завершения...');
  await system.stop();
  process.exit(0);
});

// Запуск системы
const system = new VirtualTradingSystem();

if (require.main === module) {
  system.start().catch(error => {
    console.error('❌ Критическая ошибка:', error.message);
    process.exit(1);
  });
}

module.exports = { VirtualTradingSystem }; 