/**
 * Скрипт для просмотра исторических аномалий
 */

const fs = require('fs').promises;
const path = require('path');

async function viewHistoricalAnomalies(dayString = null) {
  try {
    // Если день не указан, используем сегодня
    if (!dayString) {
      const now = new Date();
      dayString = now.toISOString().split('T')[0]; // YYYY-MM-DD
    }
    
    const filePath = path.join(__dirname, '..', 'data', `anomalies_${dayString}.json`);
    
    console.log(`📊 Просмотр исторических аномалий за ${dayString}...`);
    console.log(`📁 Файл: ${filePath}`);
    
    // Проверить существование файла
    try {
      await fs.access(filePath);
    } catch (error) {
      console.log(`❌ Файл не найден: ${filePath}`);
      return;
    }
    
    // Загрузить данные
    const data = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(data);
    
    if (parsed.meta && parsed.anomalies) {
      // Новая структура
      const { meta, anomalies } = parsed;
      
      console.log('\n📊 МЕТА-СТАТИСТИКА:');
      console.log(`📅 Дата: ${meta.dayStats.date}`);
      console.log(`📋 Всего аномалий: ${meta.dayStats.totalAnomalies}`);
      console.log(`📈 Long аномалии: ${meta.dayStats.longAnomaliesCount}`);
      console.log(`📉 Short аномалии: ${meta.dayStats.shortAnomaliesCount}`);
      console.log(`📊 Средний leverage: ${meta.dayStats.averageVolumeLeverage}x`);
      console.log(`⏰ Последнее обновление: ${new Date(meta.dayStats.lastUpdated).toLocaleString('ru-RU')}`);
      
      if (meta.dayStats.topVolumeLeverages.length > 0) {
        console.log('\n🏆 ТОП-10 ПО LEVERAGE:');
        meta.dayStats.topVolumeLeverages.forEach((item, index) => {
          console.log(`  ${index + 1}. ${item.symbol} - ${item.leverage}x`);
        });
      }
      
      console.log('\n📋 СПИСОК АНОМАЛИЙ:');
      if (anomalies.length === 0) {
        console.log('  Нет аномалий за этот день');
      } else {
        anomalies.forEach((anomaly, index) => {
          const time = new Date(anomaly.anomalyTime).toLocaleString('ru-RU');
          const priceChange = ((anomaly.anomalyPrice - anomaly.historicalPrice) / anomaly.historicalPrice * 100).toFixed(2);
          const changeSign = priceChange >= 0 ? '+' : '';
          
          console.log(`  ${index + 1}. ${anomaly.symbol}`);
          console.log(`     🕐 Время: ${time}`);
          console.log(`     📊 Тип: ${anomaly.tradeType}`);
          console.log(`     💰 Цена: $${anomaly.anomalyPrice.toFixed(6)}`);
          console.log(`     📈 Изменение: ${changeSign}${priceChange}%`);
          console.log(`     📊 Объем: ${anomaly.volumeLeverage}x`);
          console.log(`     🆔 ID: ${anomaly.anomalyId}`);
          console.log('');
        });
      }
      
    } else if (Array.isArray(parsed)) {
      // Старая структура
      console.log('\n📋 СПИСОК АНОМАЛИЙ (старая структура):');
      if (parsed.length === 0) {
        console.log('  Нет аномалий за этот день');
      } else {
        parsed.forEach((anomaly, index) => {
          const time = new Date(anomaly.anomalyTime).toLocaleString('ru-RU');
          console.log(`  ${index + 1}. ${anomaly.symbol} - ${anomaly.tradeType} (${anomaly.volumeLeverage}x) - ${time}`);
        });
      }
    } else {
      console.log('❌ Неизвестная структура файла');
    }
    
  } catch (error) {
    console.error('❌ Ошибка чтения файла:', error.message);
  }
}

// Получить день из аргументов командной строки
const dayArg = process.argv[2];

if (require.main === module) {
  viewHistoricalAnomalies(dayArg).catch(error => {
    console.error('❌ Критическая ошибка:', error.message);
    process.exit(1);
  });
}

module.exports = { viewHistoricalAnomalies }; 