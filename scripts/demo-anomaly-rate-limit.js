/**
 * Демонстрация правила ограничения частоты перезапуска аномалий
 */

console.log('🎯 ДЕМОНСТРАЦИЯ: Правило ограничения частоты перезапуска аномалий');
console.log('=' * 70);

console.log('\n📋 ПРОБЛЕМА:');
console.log('   Если список аномалий большой, проверка может занимать больше 5 минут');
console.log('   Это приводит к перегрузке системы при частых перезапусках');
console.log('   Нужно ограничить частоту перезапуска проверки аномалий');

console.log('\n🔧 РЕШЕНИЕ:');
console.log('   Добавлено правило ограничения частоты перезапуска:');
console.log('   • Минимальный интервал между проверками: 5 минут');
console.log('   • Максимальная продолжительность проверки: 5 минут');
console.log('   • Если проверка превышает лимит, следующая откладывается');

console.log('\n📊 ПРАВИЛА:');
console.log('   1️⃣ Первая проверка: всегда разрешена');
console.log('   2️⃣ Повторная проверка: не раньше чем через 5 минут');
console.log('   3️⃣ Долгая проверка: если > 5 минут, следующая откладывается');
console.log('   4️⃣ Отслеживание времени: начало и продолжительность каждой проверки');

console.log('\n⚙️ ТЕХНИЧЕСКАЯ РЕАЛИЗАЦИЯ:');
console.log('   • Новые поля в VirtualTradingSystem:');
console.log('     - lastAnomalyCheckStart: время начала последней проверки');
console.log('     - anomalyCheckDuration: продолжительность последней проверки');
console.log('     - anomalyCheckMinInterval: минимальный интервал (5 мин)');
console.log('     - anomalyCheckMaxDuration: максимальная продолжительность (5 мин)');
console.log('   • Новый метод checkAnomalyRateLimit(): проверяет правила');
console.log('   • Модифицированный runAnomalyCheck(): использует правила');

console.log('\n🔍 ЛОГИКА ПРОВЕРКИ:');
console.log('   function checkAnomalyRateLimit() {');
console.log('     const now = Date.now();');
console.log('     const timeSinceLastStart = now - this.lastAnomalyCheckStart;');
console.log('     ');
console.log('     // Если проверка еще не запускалась, разрешить');
console.log('     if (this.lastAnomalyCheckStart === 0) return true;');
console.log('     ');
console.log('     // Проверить минимальный интервал между проверками');
console.log('     if (timeSinceLastStart < this.anomalyCheckMinInterval) {');
console.log('       console.log("⏳ Правило ограничения: проверка пропущена");');
console.log('       return false;');
console.log('     }');
console.log('     ');
console.log('     // Проверить, не превышает ли последняя проверка максимальную продолжительность');
console.log('     if (this.anomalyCheckDuration > this.anomalyCheckMaxDuration) {');
console.log('       console.log("⚠️ Правило ограничения: проверка заняла слишком много времени");');
console.log('       return false;');
console.log('     }');
console.log('     ');
console.log('     return true;');
console.log('   }');

console.log('\n📈 ПРИМЕРЫ СЦЕНАРИЕВ:');
console.log('   Сценарий 1: Нормальная проверка (30 сек)');
console.log('     ✅ Проверка завершена за 30 сек');
console.log('     ✅ Следующая проверка через 5 минут');
console.log('   ');
console.log('   Сценарий 2: Долгая проверка (6 минут)');
console.log('     ⚠️ Проверка заняла 6 минут (превышает лимит 5 минут)');
console.log('     ⏳ Следующая проверка отложена на 5 минут');
console.log('   ');
console.log('   Сценарий 3: Попытка повторной проверки раньше времени');
console.log('     ⏳ Правило ограничения: проверка пропущена');
console.log('     ⏳ Осталось X сек до следующей проверки');

console.log('\n🧪 ТЕСТИРОВАНИЕ:');
console.log('   npm run test:anomaly-rate-limit - тест правила ограничения');
console.log('   npm run demo:anomaly-rate-limit - эта демонстрация');
console.log('   npm run run - полный запуск системы с новым правилом');

console.log('\n✅ ПРЕИМУЩЕСТВА:');
console.log('   • Предотвращение перегрузки системы');
console.log('   • Стабильная работа при больших списках аномалий');
console.log('   • Автоматическое регулирование частоты проверок');
console.log('   • Детальное логирование для мониторинга');
console.log('   • Обратная совместимость с существующей системой');

console.log('\n🎯 РЕЗУЛЬТАТ:');
console.log('   Система теперь автоматически ограничивает частоту перезапуска');
console.log('   проверки аномалий, предотвращая перегрузку при больших списках');
console.log('   и обеспечивая стабильную работу системы');

console.log('\n' + '=' * 70);
console.log('✅ Демонстрация завершена'); 