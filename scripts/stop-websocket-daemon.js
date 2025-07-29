const fs = require('fs');
const path = require('path');

/**
 * Скрипт для остановки системы виртуальной торговли с WebSocket
 * Останавливает daemon процесс по PID
 */
function stopWebSocketDaemon() {
  console.log('🛑 ОСТАНОВКА СИСТЕМЫ ВИРТУАЛЬНОЙ ТОРГОВЛИ С WEB SOCKET');
  console.log('=' .repeat(50));
  
  const pidFile = path.join(__dirname, '../websocket-system.pid');
  
  // Проверить существование PID файла
  if (!fs.existsSync(pidFile)) {
    console.log('ℹ️ PID файл не найден. Система, вероятно, не запущена.');
    return;
  }
  
  try {
    // Прочитать PID
    const pid = fs.readFileSync(pidFile, 'utf8').trim();
    console.log(`📄 Найден PID: ${pid}`);
    
    // Проверить, существует ли процесс
    try {
      process.kill(pid, 0); // Проверка существования процесса
      console.log('✅ Процесс найден, отправляем сигнал завершения...');
      
      // Отправить сигнал SIGTERM
      process.kill(pid, 'SIGTERM');
      console.log('📤 Сигнал SIGTERM отправлен');
      
      // Подождать немного и проверить
      setTimeout(() => {
        try {
          process.kill(pid, 0);
          console.log('⚠️ Процесс все еще работает, отправляем SIGKILL...');
          process.kill(pid, 'SIGKILL');
          console.log('📤 Сигнал SIGKILL отправлен');
        } catch (error) {
          console.log('✅ Процесс успешно остановлен');
        }
        
        // Удалить PID файл
        try {
          fs.unlinkSync(pidFile);
          console.log('🗑️ PID файл удален');
        } catch (error) {
          console.log('⚠️ Не удалось удалить PID файл:', error.message);
        }
      }, 3000);
      
    } catch (error) {
      console.log('ℹ️ Процесс не найден (возможно, уже остановлен)');
      
      // Удалить PID файл
      try {
        fs.unlinkSync(pidFile);
        console.log('🗑️ PID файл удален');
      } catch (error) {
        console.log('⚠️ Не удалось удалить PID файл:', error.message);
      }
    }
    
  } catch (error) {
    console.error('❌ Ошибка при остановке процесса:', error.message);
  }
}

// Остановка daemon
stopWebSocketDaemon(); 