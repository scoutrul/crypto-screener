#!/usr/bin/env node

/**
 * Скрипт для автоматического добавления торговых файлов в Git
 * Запускается после обновления важных JSON файлов
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Список важных файлов для отслеживания в Git
const TRADING_FILES = [
  'data/active-trades.json',
  'data/pending-anomalies.json',
  'data/trade-history.json',
  'data/trading-statistics.json'
];

/**
 * Добавить файлы в Git stage
 */
function stageTradingFiles() {
  let stagedCount = 0;
  
  for (const file of TRADING_FILES) {
    try {
      // Проверить, существует ли файл
      if (fs.existsSync(file)) {
        // Добавить файл в Git stage
        execSync(`git add "${file}"`, { stdio: 'pipe' });
        stagedCount++;
      } else {
        console.log(`⚠️ Файл ${file} не найден`);
      }
    } catch (error) {
      console.error(`❌ Ошибка добавления ${file}:`, error.message);
    }
  }
  
  if (stagedCount > 0) {
    // Показать статус только если есть изменения
    try {
      execSync('git status --porcelain', { stdio: 'pipe' });
    } catch (error) {
      console.error('❌ Ошибка получения статуса Git:', error.message);
    }
  }
}

/**
 * Проверить, есть ли изменения в торговых файлах
 */
function checkTradingFilesChanges() {
  console.log('🔍 Проверка изменений в торговых файлах...');
  
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf8' });
    const lines = status.split('\n').filter(line => line.trim());
    
    const tradingFileChanges = lines.filter(line => {
      const fileName = line.substring(3); // Убрать статус (M, A, D, etc.)
      return TRADING_FILES.some(tradingFile => fileName.includes(tradingFile));
    });
    
    if (tradingFileChanges.length > 0) {
      console.log('📈 Обнаружены изменения в торговых файлах:');
      tradingFileChanges.forEach(change => {
        console.log(`   ${change}`);
      });
      return true;
    } else {
      console.log('ℹ️ Изменений в торговых файлах не обнаружено');
      return false;
    }
  } catch (error) {
    console.error('❌ Ошибка проверки статуса Git:', error.message);
    return false;
  }
}

/**
 * Основная функция
 */
function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'stage';
  
  console.log('🚀 Git Trading Files Manager');
  console.log('=============================\n');
  
  switch (command) {
    case 'stage':
      stageTradingFiles();
      break;
      
    case 'check':
      checkTradingFilesChanges();
      break;
      
    case 'auto':
      if (checkTradingFilesChanges()) {
        console.log('\n🔄 Автоматическое добавление изменений...');
        stageTradingFiles();
      }
      break;
      
    default:
      console.log('Использование:');
      console.log('  node scripts/git-stage-trading-files.js [команда]');
      console.log('');
      console.log('Команды:');
      console.log('  stage  - Добавить все торговые файлы в stage');
      console.log('  check  - Проверить изменения в торговых файлах');
      console.log('  auto   - Автоматически добавить измененные файлы');
      console.log('');
      console.log('Примеры:');
      console.log('  node scripts/git-stage-trading-files.js stage');
      console.log('  node scripts/git-stage-trading-files.js check');
      console.log('  node scripts/git-stage-trading-files.js auto');
  }
}

// Запустить скрипт
if (require.main === module) {
  main();
}

module.exports = {
  stageTradingFiles,
  checkTradingFilesChanges
}; 