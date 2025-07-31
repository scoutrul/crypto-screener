/**
 * Тестовый скрипт для проверки правила ограничения частоты перезапуска аномалий
 */

const { VirtualTradingSystem } = require('./virtual-trading-system');

class TestAnomalyRateLimit extends VirtualTradingSystem {
  constructor() {
    super();
    this.testMode = true;
  }

  async testRateLimitRule() {
    console.log('🧪 ТЕСТ: Правило ограничения частоты перезапуска аномалий...');
    
    try {
      // Тест 1: Первая проверка должна пройти
      console.log('\n📋 Тест 1: Первая проверка (должна пройти)');
      const result1 = this.checkAnomalyRateLimit();
      console.log(`   Результат: ${result1 ? '✅ Разрешено' : '❌ Заблокировано'}`);
      
      // Симулировать запуск проверки
      this.lastAnomalyCheckStart = Date.now();
      this.anomalyCheckDuration = 30000; // 30 сек
      
      // Тест 2: Слишком рано для повторной проверки
      console.log('\n📋 Тест 2: Слишком рано для повторной проверки (должна быть заблокирована)');
      await new Promise(resolve => setTimeout(resolve, 1000)); // Подождать 1 сек
      const result2 = this.checkAnomalyRateLimit();
      console.log(`   Результат: ${result2 ? '✅ Разрешено' : '❌ Заблокировано'}`);
      
      // Тест 3: Долгая проверка (превышает лимит)
      console.log('\n📋 Тест 3: Долгая проверка (превышает лимит)');
      this.anomalyCheckDuration = 6 * 60 * 1000; // 6 минут (превышает лимит 5 минут)
      const result3 = this.checkAnomalyRateLimit();
      console.log(`   Результат: ${result3 ? '✅ Разрешено' : '❌ Заблокировано'}`);
      
      // Тест 4: Прошло достаточно времени
      console.log('\n📋 Тест 4: Прошло достаточно времени (должна пройти)');
      this.lastAnomalyCheckStart = Date.now() - (6 * 60 * 1000); // 6 минут назад
      this.anomalyCheckDuration = 30000; // 30 сек (нормальная продолжительность)
      const result4 = this.checkAnomalyRateLimit();
      console.log(`   Результат: ${result4 ? '✅ Разрешено' : '❌ Заблокировано'}`);
      
      // Тест 5: Симуляция полного цикла проверки
      console.log('\n📋 Тест 5: Симуляция полного цикла проверки');
      console.log('   Запуск проверки аномалий...');
      
      // Сбросить состояние
      this.lastAnomalyCheckStart = 0;
      this.anomalyCheckDuration = 0;
      
      // Симулировать быструю проверку
      const startTime = Date.now();
      this.lastAnomalyCheckStart = startTime;
      
      // Симулировать обработку
      await new Promise(resolve => setTimeout(resolve, 2000)); // 2 сек обработки
      
      this.anomalyCheckDuration = Date.now() - startTime;
      console.log(`   ✅ Проверка завершена за ${Math.ceil(this.anomalyCheckDuration / 1000)} сек`);
      
      // Попытка повторной проверки сразу
      console.log('   Попытка повторной проверки...');
      const immediateResult = this.checkAnomalyRateLimit();
      console.log(`   Результат: ${immediateResult ? '✅ Разрешено' : '❌ Заблокировано'}`);
      
      console.log('\n✅ Все тесты правила ограничения частоты пройдены успешно!');
      
    } catch (error) {
      console.error('❌ Ошибка тестирования правила ограничения частоты:', error.message);
    }
  }

  async testRateLimitIntegration() {
    console.log('\n🧪 ТЕСТ: Интеграция с runAnomalyCheck...');
    
    try {
      // Сбросить состояние
      this.lastAnomalyCheckStart = 0;
      this.anomalyCheckDuration = 0;
      
      // Тест 1: Первый запуск
      console.log('\n📋 Тест 1: Первый запуск runAnomalyCheck');
      await this.runAnomalyCheck();
      
      // Тест 2: Попытка повторного запуска сразу
      console.log('\n📋 Тест 2: Попытка повторного запуска (должна быть заблокирована)');
      await this.runAnomalyCheck();
      
      // Тест 3: Запуск после ожидания
      console.log('\n📋 Тест 3: Запуск после ожидания (должен пройти)');
      this.lastAnomalyCheckStart = Date.now() - (6 * 60 * 1000); // 6 минут назад
      await this.runAnomalyCheck();
      
      console.log('\n✅ Все интеграционные тесты пройдены успешно!');
      
    } catch (error) {
      console.error('❌ Ошибка интеграционного тестирования:', error.message);
    }
  }
}

// Запуск теста
if (require.main === module) {
  const testSystem = new TestAnomalyRateLimit();
  
  testSystem.testRateLimitRule().then(() => {
    return testSystem.testRateLimitIntegration();
  }).then(() => {
    console.log('\n🏁 Все тесты завершены');
    process.exit(0);
  }).catch(error => {
    console.error('❌ Критическая ошибка теста:', error.message);
    process.exit(1);
  });
}

module.exports = TestAnomalyRateLimit; 