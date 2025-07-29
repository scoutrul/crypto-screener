const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Скрипт для запуска системы виртуальной торговли с WebSocket в фоновом режиме
 * Создает daemon процесс для непрерывной работы
 */
function startWebSocketDaemon() {
  console.log('🚀 ЗАПУСК СИСТЕМЫ В ФОНОВОМ РЕЖИМЕ (DAEMON)');
  console.log('=' .repeat(50));
  
  // Путь к основному скрипту
  const scriptPath = path.join(__dirname, 'start-websocket-system.js');
  
  // Проверить существование файла
  if (!fs.existsSync(scriptPath)) {
    console.error('❌ Файл start-websocket-system.js не найден');
    process.exit(1);
  }
  
  // Создать лог файл
  const logDir = path.join(__dirname, '../logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  const logFile = path.join(logDir, `websocket-system-${new Date().toISOString().split('T')[0]}.log`);
  const errorFile = path.join(logDir, `websocket-system-error-${new Date().toISOString().split('T')[0]}.log`);
  
  console.log(`📝 Логи будут записываться в: ${logFile}`);
  console.log(`❌ Ошибки будут записываться в: ${errorFile}`);
  
  // Создать поток для записи логов
  const logStream = fs.createWriteStream(logFile, { flags: 'a' });
  const errorStream = fs.createWriteStream(errorFile, { flags: 'a' });
  
  // Запустить процесс
  const child = spawn('node', [scriptPath], {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  
  // Перенаправить вывод
  child.stdout.pipe(logStream);
  child.stderr.pipe(errorStream);
  
  // Также выводить в консоль для отладки
  child.stdout.on('data', (data) => {
    console.log(`[SYSTEM] ${data.toString().trim()}`);
  });
  
  child.stderr.on('data', (data) => {
    console.error(`[ERROR] ${data.toString().trim()}`);
  });
  
  // Обработка завершения процесса
  child.on('close', (code) => {
    console.log(`🛑 Процесс завершен с кодом: ${code}`);
    logStream.end();
    errorStream.end();
  });
  
  // Обработка ошибок
  child.on('error', (error) => {
    console.error('❌ Ошибка запуска процесса:', error);
    logStream.end();
    errorStream.end();
    process.exit(1);
  });
  
  // Отсоединить от родительского процесса
  child.unref();
  
  console.log(`✅ Система запущена в фоновом режиме (PID: ${child.pid})`);
  console.log('💡 Для остановки используйте: npm run stop:websocket');
  console.log('📊 Для просмотра логов используйте: npm run logs:websocket');
  
  // Сохранить PID в файл для управления
  const pidFile = path.join(__dirname, '../websocket-system.pid');
  fs.writeFileSync(pidFile, child.pid.toString());
  console.log(`📄 PID сохранен в: ${pidFile}`);
}

// Запуск daemon
startWebSocketDaemon(); 