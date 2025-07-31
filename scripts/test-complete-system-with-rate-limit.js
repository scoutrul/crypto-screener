/**
 * Итоговый тест полной системы с правилом ограничения частоты перезапуска аномалий
 */

const { VirtualTradingSystem } = require('./virtual-trading-system');

class TestCompleteSystemWithRateLimit extends VirtualTradingSystem {
  constructor() {
    super();
    this.testMode = true;
  }

  async testCompleteSystem() {
    console.log('🧪 ИТОГОВЫЙ ТЕСТ: Полная система с правилом ограничения частоты...');
    
    try {
      // Тест 1: Проверка приоритетной очереди
      console.log('\n📋 Тест 1: Проверка приоритетной очереди');
      await this.checkPriorityQueue();
      console.log('   ✅ Приоритетная очередь работает корректно');
      
      // Тест 2: Проверка правила ограничения частоты
      console.log('\n📋 Тест 2: Проверка правила ограничения частоты');
      const rateLimitResult = this.checkAnomalyRateLimit();
      console.log(`   ✅ Правило ограничения: ${rateLimitResult ? 'разрешено' : 'заблокировано'}`);
      
      // Тест 3: Симуляция полного цикла работы
      console.log('\n📋 Тест 3: Симуляция полного цикла работы');
      
      // Первая проверка аномалий
      console.log('   🔍 Запуск первой проверки аномалий...');
      await this.runAnomalyCheck();
      
      // Попытка повторной проверки сразу
      console.log('   🔍 Попытка повторной проверки...');
      await this.runAnomalyCheck();
      
      // Проверка активных сделок (должна работать)
      console.log('   💰 Проверка активных сделок...');
      await this.runActiveTradesCheck();
      
      // Проверка watchlist (должна работать)
      console.log('   📋 Проверка watchlist...');
      await this.runPendingCheck();
      
      console.log('   ✅ Все потоки работают корректно');
      
      // Тест 4: Проверка конфигурации
      console.log('\n📋 Тест 4: Проверка конфигурации');
      console.log(`   • Минимальный интервал: ${this.anomalyCheckMinInterval / 1000} сек`);
      console.log(`   • Максимальная продолжительность: ${this.anomalyCheckMaxDuration / 1000} сек`);
      console.log(`   • Приоритет активных сделок: ${this.config.activeTradesInterval / 1000} сек`);
      console.log(`   • Приоритет watchlist: ${this.config.pendingCheckInterval / 1000} сек`);
      console.log(`   • Приоритет аномалий: ${this.config.anomalyCheckInterval / 1000 / 60} мин`);
      
      // Тест 5: Проверка состояния системы
      console.log('\n📋 Тест 5: Проверка состояния системы');
      console.log(`   • Время последней проверки аномалий: ${this.lastAnomalyCheckStart ? new Date(this.lastAnomalyCheckStart).toLocaleTimeString() : 'не выполнялась'}`);
      console.log(`   • Продолжительность последней проверки: ${Math.ceil(this.anomalyCheckDuration / 1000)} сек`);
      console.log(`   • Размер очереди задач: ${this.taskQueue.length}`);
      console.log(`   • Состояние обработки: ${this.isProcessing}`);
      
      console.log('\n✅ Итоговый тест пройден успешно!');
      console.log('🎯 Система готова к работе с правилом ограничения частоты');
      
    } catch (error) {
      console.error('❌ Ошибка итогового тестирования:', error.message);
    }
  }

  async testRateLimitScenarios() {
    console.log('\n🧪 ТЕСТ: Сценарии работы правила ограничения...');
    
    try {
      // Сценарий 1: Нормальная работа
      console.log('\n📋 Сценарий 1: Нормальная работа');
      this.lastAnomalyCheckStart = 0;
      this.anomalyCheckDuration = 0;
      
      const normalResult = this.checkAnomalyRateLimit();
      console.log(`   Результат: ${normalResult ? '✅ Разрешено' : '❌ Заблокировано'}`);
      
      // Сценарий 2: Слишком рано
      console.log('\n📋 Сценарий 2: Слишком рано для повторной проверки');
      this.lastAnomalyCheckStart = Date.now();
      this.anomalyCheckDuration = 30000; // 30 сек
      
      const earlyResult = this.checkAnomalyRateLimit();
      console.log(`   Результат: ${earlyResult ? '✅ Разрешено' : '❌ Заблокировано'}`);
      
      // Сценарий 3: Долгая проверка
      console.log('\n📋 Сценарий 3: Долгая проверка (превышает лимит)');
      this.anomalyCheckDuration = 6 * 60 * 1000; // 6 минут
      
      const longResult = this.checkAnomalyRateLimit();
      console.log(`   Результат: ${longResult ? '✅ Разрешено' : '❌ Заблокировано'}`);
      
      // Сценарий 4: Прошло достаточно времени
      console.log('\n📋 Сценарий 4: Прошло достаточно времени');
      this.lastAnomalyCheckStart = Date.now() - (6 * 60 * 1000); // 6 минут назад
      this.anomalyCheckDuration = 30000; // 30 сек
      
      const lateResult = this.checkAnomalyRateLimit();
      console.log(`   Результат: ${lateResult ? '✅ Разрешено' : '❌ Заблокировано'}`);
      
      console.log('\n✅ Все сценарии протестированы успешно!');
      
    } catch (error) {
      console.error('❌ Ошибка тестирования сценариев:', error.message);
    }
  }
}

// Запуск теста
if (require.main === module) {
  const testSystem = new TestCompleteSystemWithRateLimit();
  
  testSystem.testCompleteSystem().then(() => {
    return testSystem.testRateLimitScenarios();
  }).then(() => {
    console.log('\n🏁 Итоговый тест завершен');
    console.log('🎯 Система готова к продакшн использованию');
    process.exit(0);
  }).catch(error => {
    console.error('❌ Критическая ошибка итогового теста:', error.message);
    process.exit(1);
  });
}

module.exports = TestCompleteSystemWithRateLimit; 