const { spawn } = require('child_process');
const path = require('path');

/**
 * Универсальный главный скрипт для запуска всей системы
 * Работает на Windows, Linux и macOS
 */
class MainSystemUniversal {
  constructor() {
    this.processes = [];
    this.isShuttingDown = false;
    
    // Определяем ОС и команду npm
    this.isWindows = process.platform === 'win32';
    this.npmCommand = this.isWindows ? 'npm.cmd' : 'npm';
    
    console.log(`🖥️ ОС: ${process.platform} (${this.isWindows ? 'Windows' : 'Unix'})`);
    console.log(`📦 Команда npm: ${this.npmCommand}`);
  }

  /**
   * Запустить процесс
   */
  spawnProcess(command, name, args = []) {
    console.log(`🚀 Запуск ${name}...`);
    
    const process = spawn(this.npmCommand, ['run', command, ...args], {
      stdio: 'inherit',
      shell: true,
      cwd: path.join(__dirname, '..')
    });

    process.on('error', (error) => {
      console.error(`❌ Ошибка запуска ${name}:`, error.message);
    });

    process.on('exit', (code) => {
      if (!this.isShuttingDown) {
        console.log(`⚠️ ${name} завершился с кодом ${code}`);
      }
    });

    this.processes.push({ process, name });
    return process;
  }

  /**
   * Остановить все процессы
   */
  async stopAllProcesses() {
    console.log('\n🛑 Остановка всех процессов...');
    this.isShuttingDown = true;

    for (const { process, name } of this.processes) {
      try {
        console.log(`🛑 Остановка ${name}...`);
        process.kill('SIGTERM');
        
        // Ждать завершения процесса
        await new Promise((resolve) => {
          const timeout = setTimeout(() => {
            console.log(`⚠️ Принудительное завершение ${name}`);
            process.kill('SIGKILL');
            resolve();
          }, 5000);

          process.on('exit', () => {
            clearTimeout(timeout);
            resolve();
          });
        });
        
        console.log(`✅ ${name} остановлен`);
      } catch (error) {
        console.error(`❌ Ошибка остановки ${name}:`, error.message);
      }
    }
  }

  /**
   * Запустить всю систему
   */
  async start() {
    try {
      console.log('🚀 Запуск Crypto Screener Main System (Universal)...');
      console.log('📋 Компоненты:');
      console.log('   • Приоритетная очередь (проверяется первой)');
      console.log('   • Основная система торговли (monitor:virtual)');
      console.log('   • Telegram бот (инициализируется автоматически через синглтон)');
      console.log('');

      // Запустить основную систему торговли (которая сама инициализирует Telegram бота через синглтон)
      const tradingSystem = this.spawnProcess('monitor:virtual', 'Trading System');
      
      console.log('💡 Приоритетная очередь будет проверена первой при запуске системы');
      console.log('💡 Telegram бот будет инициализирован автоматически через синглтон');

      console.log('\n✅ Все компоненты запущены!');
      console.log('📊 Система работает в фоновом режиме');
      console.log('🤖 Telegram бот готов к использованию');
      console.log('💡 Используйте Ctrl+C для остановки всех процессов');
      console.log('');

      // Обработка сигналов завершения
      process.on('SIGINT', async () => {
        console.log('\n🛑 Получен сигнал завершения...');
        await this.stopAllProcesses();
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        console.log('\n🛑 Получен сигнал завершения...');
        await this.stopAllProcesses();
        process.exit(0);
      });

      // Мониторинг процессов
      setInterval(() => {
        for (const { process, name } of this.processes) {
          if (process.exitCode !== null && !this.isShuttingDown) {
            console.log(`⚠️ ${name} завершился неожиданно`);
          }
        }
      }, 30000); // Проверка каждые 30 секунд

    } catch (error) {
      console.error('❌ Ошибка запуска системы:', error.message);
      await this.stopAllProcesses();
      process.exit(1);
    }
  }

  /**
   * Показать статус процессов
   */
  showStatus() {
    console.log('\n📊 СТАТУС ПРОЦЕССОВ:');
    for (const { process, name } of this.processes) {
      const status = process.exitCode === null ? '🟢 Активен' : '🔴 Остановлен';
      console.log(`   ${name}: ${status}`);
    }
  }

  /**
   * Получить информацию о системе
   */
  getSystemInfo() {
    return {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      npmCommand: this.npmCommand,
      isWindows: this.isWindows
    };
  }
}

// Запуск главной системы
if (require.main === module) {
  const mainSystem = new MainSystemUniversal();
  mainSystem.start();
}

module.exports = MainSystemUniversal; 