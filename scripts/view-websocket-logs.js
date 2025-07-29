const fs = require('fs');
const path = require('path');

/**
 * Скрипт для просмотра логов системы виртуальной торговли с WebSocket
 */
function viewWebSocketLogs() {
  console.log('📊 ПРОСМОТР ЛОГОВ СИСТЕМЫ WEB SOCKET');
  console.log('=' .repeat(50));
  
  const logDir = path.join(__dirname, '../logs');
  
  // Проверить существование директории логов
  if (!fs.existsSync(logDir)) {
    console.log('ℹ️ Директория логов не найдена. Система, вероятно, не запускалась.');
    return;
  }
  
  // Получить список файлов логов
  const files = fs.readdirSync(logDir)
    .filter(file => file.startsWith('websocket-system'))
    .sort()
    .reverse(); // Новые файлы первыми
  
  if (files.length === 0) {
    console.log('ℹ️ Файлы логов не найдены.');
    return;
  }
  
  console.log('📁 Найденные файлы логов:');
  files.forEach((file, index) => {
    const filePath = path.join(logDir, file);
    const stats = fs.statSync(filePath);
    const size = (stats.size / 1024).toFixed(2); // KB
    console.log(`   ${index + 1}. ${file} (${size} KB)`);
  });
  
  // Показать последние строки из основного лог файла
  const mainLogFile = files.find(file => !file.includes('error'));
  if (mainLogFile) {
    console.log(`\n📝 ПОСЛЕДНИЕ СТРОКИ ИЗ ${mainLogFile}:`);
    console.log('=' .repeat(50));
    
    const logPath = path.join(logDir, mainLogFile);
    const content = fs.readFileSync(logPath, 'utf8');
    const lines = content.split('\n').filter(line => line.trim());
    
    // Показать последние 20 строк
    const lastLines = lines.slice(-20);
    lastLines.forEach(line => {
      console.log(line);
    });
  }
  
  // Показать ошибки, если есть
  const errorLogFile = files.find(file => file.includes('error'));
  if (errorLogFile) {
    console.log(`\n❌ ПОСЛЕДНИЕ ОШИБКИ ИЗ ${errorLogFile}:`);
    console.log('=' .repeat(50));
    
    const errorPath = path.join(logDir, errorLogFile);
    const errorContent = fs.readFileSync(errorPath, 'utf8');
    const errorLines = errorContent.split('\n').filter(line => line.trim());
    
    // Показать последние 10 ошибок
    const lastErrors = errorLines.slice(-10);
    lastErrors.forEach(line => {
      console.log(line);
    });
  }
  
  // Показать статус процесса
  const pidFile = path.join(__dirname, '../websocket-system.pid');
  if (fs.existsSync(pidFile)) {
    const pid = fs.readFileSync(pidFile, 'utf8').trim();
    console.log(`\n📄 PID файл найден: ${pid}`);
    
    try {
      process.kill(pid, 0);
      console.log('✅ Процесс активен');
    } catch (error) {
      console.log('❌ Процесс не активен');
    }
  } else {
    console.log('\n📄 PID файл не найден - система не запущена');
  }
}

// Просмотр логов
viewWebSocketLogs(); 