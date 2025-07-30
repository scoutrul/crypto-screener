const fs = require('fs').promises;
const path = require('path');
const { CryptoScreenerApp } = require('../src/app');
const messageQueue = require('./telegram-message-queue');

/**
 * Скрипт для отправки статуса watchlist через Telegram
 */
class WatchlistStatusSender {
  constructor() {
    this.app = null;
  }

  /**
   * Загрузить pending anomalies
   */
  async loadPendingAnomalies() {
    try {
      const filename = path.join(__dirname, '..', 'data', 'pending-anomalies.json');
      const data = await fs.readFile(filename, 'utf8');
      const parsed = JSON.parse(data);
      
      // Поддержка новой структуры (объект с meta и anomalies) и старой (массив)
      if (Array.isArray(parsed)) {
        // Старая структура - массив
        return parsed;
      } else if (parsed.anomalies && Array.isArray(parsed.anomalies)) {
        // Новая структура - объект с anomalies
        return parsed.anomalies;
      } else {
        console.log('📊 Неизвестная структура pending-anomalies.json');
        return [];
      }
    } catch (error) {
      console.log('📊 Pending anomalies не найдены');
      return [];
    }
  }

  /**
   * Рассчитать статистику для аномалии
   */
  calculateAnomalyStats(anomaly) {
    const now = new Date();
    const watchlistTime = new Date(anomaly.watchlistTime);
    const timeInWatchlist = Math.floor((now - watchlistTime) / (1000 * 60)); // минуты
    
    // Безопасные значения по умолчанию
    const maxPrice = anomaly.maxPrice || anomaly.anomalyPrice;
    const minPrice = anomaly.minPrice || anomaly.anomalyPrice;
    const entryLevel = anomaly.entryLevel || anomaly.anomalyPrice;
    const cancelLevel = anomaly.cancelLevel || anomaly.anomalyPrice;
    
    // Рассчитать изменение цены с момента аномалии
    const priceChange = ((maxPrice - anomaly.anomalyPrice) / anomaly.anomalyPrice) * 100;
    const priceChangeFromMin = ((maxPrice - minPrice) / minPrice) * 100;
    
    // Рассчитать расстояние до уровней
    const currentPrice = maxPrice; // Используем максимальную цену как текущую
    const distanceToEntry = ((entryLevel - currentPrice) / currentPrice) * 100;
    const distanceToCancel = ((currentPrice - cancelLevel) / currentPrice) * 100;
    
    return {
      timeInWatchlist,
      priceChange,
      priceChangeFromMin,
      distanceToEntry,
      distanceToCancel,
      currentPrice
    };
  }

  /**
   * Создать сообщение со статусом watchlist
   */
  createWatchlistMessage(anomalies) {
    if (anomalies.length === 0) {
      return `📋 WATCHLIST СТАТУС:\n\n📊 В watchlist: 0 аномалий\n\n💡 Нет активных аномалий для отслеживания`;
    }

    let message = `📋 WATCHLIST СТАТУС:\n\n📊 В watchlist: ${anomalies.length} аномалий\n\n`;

    // Статистика по типам
    const longCount = anomalies.filter(a => a.tradeType === 'Long').length;
    const shortCount = anomalies.filter(a => a.tradeType === 'Short').length;
    message += `📈 Long: ${longCount} | Short: ${shortCount}\n\n`;

    // Детальная информация по каждой аномалии
    anomalies.forEach((anomaly, index) => {
      const stats = this.calculateAnomalyStats(anomaly);
      const symbol = anomaly.symbol.replace('/USDT', '');
      const emoji = anomaly.tradeType === 'Long' ? '🟢' : '🔴';
      
      message += `${emoji} ${symbol} (${anomaly.tradeType})\n`;
      message += `   📊 Объем: ${anomaly.volumeLeverage ? `${anomaly.volumeLeverage}x` : 'N/A'}\n`;
      message += `   💰 Аномальная цена: $${anomaly.anomalyPrice.toFixed(6)}\n`;
      message += `   📈 Текущая цена: $${stats.currentPrice.toFixed(6)}\n`;
      message += `   ⏱️ Время в watchlist: ${stats.timeInWatchlist} мин\n`;
      message += `   📊 Изменение цены: ${stats.priceChange.toFixed(2)}%\n`;
      message += `   🎯 До входа: ${stats.distanceToEntry.toFixed(2)}%\n`;
      message += `   ❌ До отмены: ${stats.distanceToCancel.toFixed(2)}%\n`;
      message += `   📊 Диапазон: ${stats.priceChangeFromMin.toFixed(2)}%\n\n`;
    });

    // Общая статистика
    const validLeverages = anomalies.filter(a => a.volumeLeverage).map(a => a.volumeLeverage);
    const avgLeverage = validLeverages.length > 0 
      ? (validLeverages.reduce((sum, v) => sum + v, 0) / validLeverages.length).toFixed(1)
      : 'N/A';
    const avgTimeInWatchlist = (anomalies.reduce((sum, a) => sum + this.calculateAnomalyStats(a).timeInWatchlist, 0) / anomalies.length).toFixed(0);
    
    message += `📊 ОБЩАЯ СТАТИСТИКА:\n`;
    message += `   📈 Средний leverage: ${avgLeverage}x\n`;
    message += `   ⏱️ Среднее время в watchlist: ${avgTimeInWatchlist} мин\n`;
    message += `   🕐 Обновлено: ${new Date().toLocaleString('ru-RU')}\n`;

    return message;
  }

  /**
   * Отправить сообщение через Telegram
   */
  async sendTelegramMessage(message) {
    try {
      if (!this.app) {
        this.app = new CryptoScreenerApp();
        await this.app.start();
      }

      // Получить chat ID из переменных окружения
      const chatId = process.env.TELEGRAM_CHAT_ID;
      if (!chatId) {
        console.error('❌ TELEGRAM_CHAT_ID не найден в переменных окружения');
        return;
      }

             // Небольшая задержка для инициализации бота
       await new Promise(resolve => setTimeout(resolve, 5000));

      await messageQueue.addMessage(chatId, message);
      console.log('✅ Статус watchlist отправлен в Telegram');
    } catch (error) {
      console.error('❌ Ошибка отправки в Telegram:', error.message);
    }
  }

  /**
   * Разбить длинное сообщение на части
   */
  splitMessageForTelegram(message) {
    const maxLength = 4000;
    const parts = [];
    
    if (message.length <= maxLength) {
      return [message];
    }
    
    const lines = message.split('\n');
    let currentPart = '';
    
    for (const line of lines) {
      if ((currentPart + line + '\n').length > maxLength) {
        parts.push(currentPart.trim());
        currentPart = line + '\n';
      } else {
        currentPart += line + '\n';
      }
    }
    
    if (currentPart.trim()) {
      parts.push(currentPart.trim());
    }
    
    return parts;
  }

  /**
   * Запустить отправку статуса
   */
  async start() {
    try {
      console.log('📋 Загрузка статуса watchlist...');
      
      const anomalies = await this.loadPendingAnomalies();
      const message = this.createWatchlistMessage(anomalies);
      
      console.log('📊 Статус watchlist подготовлен:');
      console.log(message);
      
      // Разбить сообщение на части, если оно слишком длинное
      const messageParts = this.splitMessageForTelegram(message);
      
      if (messageParts.length > 1) {
        console.log(`📤 Отправка ${messageParts.length} частей сообщения...`);
        
        for (let i = 0; i < messageParts.length; i++) {
          const part = messageParts[i];
          const partNumber = i + 1;
          const totalParts = messageParts.length;
          
          const partMessage = part.replace(
            '📋 WATCHLIST СТАТУС:',
            `📋 WATCHLIST СТАТУС (Часть ${partNumber}/${totalParts}):`
          );
          
          await this.sendTelegramMessage(partMessage);
          
          // Небольшая задержка между отправками
          if (i < messageParts.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      } else {
        await this.sendTelegramMessage(message);
      }
      
      console.log('✅ Статус watchlist отправлен');
    } catch (error) {
      console.error('❌ Ошибка отправки статуса:', error.message);
    }
  }
}

// Запуск скрипта
if (require.main === module) {
  const sender = new WatchlistStatusSender();
  sender.start();
}

module.exports = WatchlistStatusSender; 