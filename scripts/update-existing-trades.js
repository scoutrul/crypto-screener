const fs = require('fs');
const path = require('path');

/**
 * Обновить существующие сделки, добавив anomalyId
 */
function updateExistingTrades() {
  console.log('🔄 Обновление существующих сделок...');
  
  // Обновить active-trades.json
  const activeTradesPath = path.join(__dirname, '../data/active-trades.json');
  if (fs.existsSync(activeTradesPath)) {
    const activeTrades = JSON.parse(fs.readFileSync(activeTradesPath, 'utf8'));
    let updated = false;
    
    activeTrades.forEach(trade => {
      if (!trade.anomalyId) {
        // Создать anomalyId на основе id сделки
        const symbol = trade.symbol.replace('/USDT', '');
        const timestamp = trade.id.split('_')[1] || Date.now().toString();
        trade.anomalyId = `${symbol}_${timestamp}`;
        updated = true;
        console.log(`✅ Добавлен anomalyId для ${trade.symbol}: ${trade.anomalyId}`);
      }
    });
    
    if (updated) {
      fs.writeFileSync(activeTradesPath, JSON.stringify(activeTrades, null, 2));
      console.log('✅ active-trades.json обновлен');
    } else {
      console.log('ℹ️ active-trades.json уже содержит anomalyId');
    }
  }
  
  // Обновить trade-history.json
  const tradeHistoryPath = path.join(__dirname, '../data/trade-history.json');
  if (fs.existsSync(tradeHistoryPath)) {
    const tradeHistory = JSON.parse(fs.readFileSync(tradeHistoryPath, 'utf8'));
    let updated = false;
    
    tradeHistory.forEach(trade => {
      if (!trade.anomalyId) {
        // Создать anomalyId на основе id сделки
        const symbol = trade.symbol.replace('/USDT', '');
        const timestamp = trade.id.split('_')[1] || Date.now().toString();
        trade.anomalyId = `${symbol}_${timestamp}`;
        updated = true;
        console.log(`✅ Добавлен anomalyId для ${trade.symbol}: ${trade.anomalyId}`);
      }
    });
    
    if (updated) {
      fs.writeFileSync(tradeHistoryPath, JSON.stringify(tradeHistory, null, 2));
      console.log('✅ trade-history.json обновлен');
    } else {
      console.log('ℹ️ trade-history.json уже содержит anomalyId');
    }
  }
  
  console.log('🎉 Обновление завершено!');
}

// Запустить обновление
updateExistingTrades(); 