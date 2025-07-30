const fs = require('fs').promises;
const path = require('path');
const { CryptoScreenerApp } = require('../src/app');

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
      return JSON.parse(data);
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
    
    // Рассчитать изменение цены с момента аномалии
    const priceChange = ((anomaly.maxPrice - anomaly.anomalyPrice) / anomaly.anomalyPrice) * 100;
    const priceChangeFromMin = ((anomaly.maxPrice - anomaly.minPrice) / anomaly.minPrice) * 100;
    
    // Рассчитать расстояние до уровней
    const currentPrice = anomaly.maxPrice; // Используем максимальную цену как текущую
    const distanceToEntry = ((anomaly.entryLevel - currentPrice) / currentPrice) * 100;
    const distanceToCancel = ((currentPrice - anomaly.cancelLevel) / currentPrice) * 100;
    
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
      message += `   📊 Объем: ${anomaly.volumeLeverage}x\n`;
      message += `   💰 Аномальная цена: $${anomaly.anomalyPrice.toFixed(6)}\n`;
      message += `   📈 Текущая цена: $${stats.currentPrice.toFixed(6)}\n`;
      message += `   ⏱️ Время в watchlist: ${stats.timeInWatchlist} мин\n`;
      message += `   📊 Изменение цены: ${stats.priceChange.toFixed(2)}%\n`;
      message += `   🎯 До входа: ${stats.distanceToEntry.toFixed(2)}%\n`;
      message += `   ❌ До отмены: ${stats.distanceToCancel.toFixed(2)}%\n`;
      message += `   📊 Диапазон: ${stats.priceChangeFromMin.toFixed(2)}%\n\n`;
    });

    // Общая статистика
    const avgLeverage = (anomalies.reduce((sum, a) => sum + a.volumeLeverage, 0) / anomalies.length).toFixed(1);
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

      const notificationRepository = global.cryptoScreener.notificationRepository;
      await notificationRepository.sendTelegramMessage(message);
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