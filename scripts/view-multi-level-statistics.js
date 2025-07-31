/**
 * Скрипт для просмотра статистики многоуровневой торговли
 */

const fs = require('fs').promises;
const path = require('path');

async function viewMultiLevelStatistics() {
  try {
    const filename = path.join(__dirname, '..', 'data', 'multi-level-statistics.json');
    const data = await fs.readFile(filename, 'utf8');
    const statistics = JSON.parse(data);

    console.log('📊 СТАТИСТИКА МНОГОУРОВНЕВОЙ ТОРГОВЛИ\n');

    // Общая статистика
    console.log('🎯 ОБЩАЯ СТАТИСТИКА:');
    console.log(`📊 Всего сделок: ${statistics.totalTrades}`);
    console.log(`🎯 Выполнено уровней: ${statistics.totalLevelsExecuted}`);
    console.log(`💰 Общий объём: $${statistics.totalVolume.toFixed(2)}`);
    console.log(`💵 Общая прибыль: $${statistics.totalProfit.toFixed(2)}`);
    console.log(`💸 Общая комиссия: $${statistics.totalCommission.toFixed(2)}`);
    console.log(`🟢 Чистая прибыль: $${statistics.totalNetProfit.toFixed(2)}`);

    // Статистика по типам сделок
    console.log('\n📈 СТАТИСТИКА ПО ТИПАМ СДЕЛОК:');
    const longStats = statistics.tradeTypes.Long;
    const shortStats = statistics.tradeTypes.Short;
    
    console.log(`Long: ${longStats.total} сделок, ${longStats.profitable} прибыльных`);
    console.log(`   💰 Общая прибыль: $${longStats.totalProfit.toFixed(2)}`);
    console.log(`Short: ${shortStats.total} сделок, ${shortStats.profitable} прибыльных`);
    console.log(`   💰 Общая прибыль: $${shortStats.totalProfit.toFixed(2)}`);

    // Статистика по уровням
    console.log('\n🎯 СТАТИСТИКА ПО УРОВНЯМ:');
    const levels = statistics.levelStatistics;
    
    Object.keys(levels).forEach(levelKey => {
      const level = levels[levelKey];
      const levelNumber = levelKey.replace('level', '');
      const avgProfit = level.executed > 0 ? (level.totalProfit / level.executed).toFixed(2) : '0.00';
      const avgCommission = level.executed > 0 ? (level.totalCommission / level.executed).toFixed(2) : '0.00';
      
      console.log(`Уровень ${levelNumber}:`);
      console.log(`   ✅ Выполнено: ${level.executed}`);
      console.log(`   💰 Общая прибыль: $${level.totalProfit.toFixed(2)}`);
      console.log(`   💸 Общая комиссия: $${level.totalCommission.toFixed(2)}`);
      console.log(`   📊 Средняя прибыль: $${avgProfit}`);
      console.log(`   📊 Средняя комиссия: $${avgCommission}`);
    });

    // Дневная статистика
    console.log('\n📅 ДНЕВНАЯ СТАТИСТИКА:');
    const dailyStats = statistics.dailyStats;
    
    if (Object.keys(dailyStats).length === 0) {
      console.log('Нет данных по дням');
    } else {
      Object.keys(dailyStats).sort().forEach(day => {
        const dayStats = dailyStats[day];
        const netProfit = dayStats.profit - dayStats.commission;
        const avgProfit = dayStats.levelsExecuted > 0 ? (dayStats.profit / dayStats.levelsExecuted).toFixed(2) : '0.00';
        
        console.log(`${day}:`);
        console.log(`   🎯 Выполнено уровней: ${dayStats.levelsExecuted}`);
        console.log(`   💰 Объём: $${dayStats.volume.toFixed(2)}`);
        console.log(`   💵 Прибыль: $${dayStats.profit.toFixed(2)}`);
        console.log(`   💸 Комиссия: $${dayStats.commission.toFixed(2)}`);
        console.log(`   🟢 Чистая прибыль: $${netProfit.toFixed(2)}`);
        console.log(`   📊 Средняя прибыль за уровень: $${avgProfit}`);
      });
    }

    // Анализ эффективности
    console.log('\n📊 АНАЛИЗ ЭФФЕКТИВНОСТИ:');
    
    if (statistics.totalLevelsExecuted > 0) {
      const avgProfitPerLevel = (statistics.totalProfit / statistics.totalLevelsExecuted).toFixed(2);
      const avgCommissionPerLevel = (statistics.totalCommission / statistics.totalLevelsExecuted).toFixed(2);
      const profitToCommissionRatio = (statistics.totalProfit / statistics.totalCommission).toFixed(2);
      
      console.log(`📊 Средняя прибыль за уровень: $${avgProfitPerLevel}`);
      console.log(`📊 Средняя комиссия за уровень: $${avgCommissionPerLevel}`);
      console.log(`📊 Соотношение прибыль/комиссия: ${profitToCommissionRatio}:1`);
      
      // Эффективность по уровням
      console.log('\n🎯 ЭФФЕКТИВНОСТЬ ПО УРОВНЯМ:');
      Object.keys(levels).forEach(levelKey => {
        const level = levels[levelKey];
        const levelNumber = levelKey.replace('level', '');
        
        if (level.executed > 0) {
          const avgProfit = (level.totalProfit / level.executed).toFixed(2);
          const avgCommission = (level.totalCommission / level.executed).toFixed(2);
          const ratio = level.totalCommission > 0 ? (level.totalProfit / level.totalCommission).toFixed(2) : '∞';
          
          console.log(`Уровень ${levelNumber}: ${avgProfit}$ прибыль, ${avgCommission}$ комиссия, соотношение ${ratio}:1`);
        }
      });
    }

    console.log('\n' + '='.repeat(60));

  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('📊 Файл статистики многоуровневой торговли не найден.');
      console.log('Запустите систему виртуальной торговли для создания статистики.');
    } else {
      console.error('❌ Ошибка загрузки статистики:', error.message);
    }
  }
}

if (require.main === module) {
  viewMultiLevelStatistics();
}

module.exports = { viewMultiLevelStatistics }; 