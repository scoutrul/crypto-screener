/**
 * Единый CLI скрипт для Crypto Screener
 */
const { CryptoScreenerApp } = require('./app');
const MarketSummaryCLI = require('./presentation/cli/MarketSummaryCLI');

/**
 * Главная функция CLI
 */
async function main() {
  try {
    // Инициализировать приложение
    console.log('🚀 Инициализация Crypto Screener...');
    const app = new CryptoScreenerApp();
    await app.start();

    // Получить аргументы командной строки
    const args = process.argv.slice(2);
    const command = args[0] || 'help';
    const commandArgs = args.slice(1);

    // Создать и запустить CLI
    const cli = new MarketSummaryCLI();
    await cli.executeCommand(command, commandArgs);

    // Остановить приложение
    await app.stop();
    
  } catch (error) {
    console.error('❌ Критическая ошибка:', error.message);
    process.exit(1);
  }
}

// Обработка сигналов для корректного завершения
process.on('SIGINT', () => {
  console.log('\n🛑 Получен сигнал SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Получен сигнал SIGTERM');
  process.exit(0);
});

// Запуск CLI
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Критическая ошибка CLI:', error.message);
    process.exit(1);
  });
}

module.exports = { main }; 