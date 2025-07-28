/**
 * Value Object для временного интервала
 */
class TimeFrame {
  constructor(value) {
    if (!TimeFrame.isValid(value)) {
      throw new Error(`Invalid timeframe: ${value}`);
    }
    
    this.value = value;
  }

  /**
   * Доступные временные интервалы
   */
  static get VALID_VALUES() {
    return ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w', '1M'];
  }

  /**
   * Проверить валидность временного интервала
   */
  static isValid(value) {
    return TimeFrame.VALID_VALUES.includes(value);
  }

  /**
   * Создать временной интервал
   */
  static fromString(value) {
    return new TimeFrame(value);
  }

  /**
   * Получить значение
   */
  getValue() {
    return this.value;
  }

  /**
   * Получить количество миллисекунд
   */
  getMilliseconds() {
    const timeMap = {
      '1m': 60 * 1000,
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '30m': 30 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '4h': 4 * 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000,
      '1w': 7 * 24 * 60 * 60 * 1000,
      '1M': 30 * 24 * 60 * 60 * 1000
    };
    
    return timeMap[this.value];
  }

  /**
   * Получить количество секунд
   */
  getSeconds() {
    return this.getMilliseconds() / 1000;
  }

  /**
   * Получить количество минут
   */
  getMinutes() {
    return this.getSeconds() / 60;
  }

  /**
   * Получить количество часов
   */
  getHours() {
    return this.getMinutes() / 60;
  }

  /**
   * Получить количество дней
   */
  getDays() {
    return this.getHours() / 24;
  }

  /**
   * Сравнить с другим временным интервалом
   */
  equals(other) {
    return this.value === other.value;
  }

  /**
   * Проверить, меньше ли текущий интервал другого
   */
  isLessThan(other) {
    return this.getMilliseconds() < other.getMilliseconds();
  }

  /**
   * Проверить, больше ли текущий интервал другого
   */
  isGreaterThan(other) {
    return this.getMilliseconds() > other.getMilliseconds();
  }

  /**
   * Получить человекочитаемое описание
   */
  getDescription() {
    const descriptions = {
      '1m': '1 минута',
      '5m': '5 минут',
      '15m': '15 минут',
      '30m': '30 минут',
      '1h': '1 час',
      '4h': '4 часа',
      '1d': '1 день',
      '1w': '1 неделя',
      '1M': '1 месяц'
    };
    
    return descriptions[this.value];
  }

  /**
   * Получить краткое описание
   */
  getShortDescription() {
    const descriptions = {
      '1m': '1м',
      '5m': '5м',
      '15m': '15м',
      '30m': '30м',
      '1h': '1ч',
      '4h': '4ч',
      '1d': '1д',
      '1w': '1н',
      '1M': '1м'
    };
    
    return descriptions[this.value];
  }

  /**
   * Получить все временные интервалы меньше текущего
   */
  getSmallerTimeFrames() {
    const currentIndex = TimeFrame.VALID_VALUES.indexOf(this.value);
    return TimeFrame.VALID_VALUES.slice(0, currentIndex).map(tf => new TimeFrame(tf));
  }

  /**
   * Получить все временные интервалы больше текущего
   */
  getLargerTimeFrames() {
    const currentIndex = TimeFrame.VALID_VALUES.indexOf(this.value);
    return TimeFrame.VALID_VALUES.slice(currentIndex + 1).map(tf => new TimeFrame(tf));
  }

  toString() {
    return this.value;
  }
}

module.exports = TimeFrame; 