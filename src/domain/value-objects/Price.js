/**
 * Value Object для цены
 */
class Price {
  constructor(value, currency = 'BTC') {
    if (typeof value !== 'number') {
      throw new Error('Price must be a number');
    }
    
    // Разрешаем нулевые и отрицательные значения для обработки данных API
    this.value = value;
    this.currency = currency;
  }

  /**
   * Создать цену в BTC
   */
  static fromBTC(value) {
    return new Price(value, 'BTC');
  }

  /**
   * Создать цену в USD
   */
  static fromUSD(value) {
    return new Price(value, 'USD');
  }

  /**
   * Создать цену с безопасной обработкой
   */
  static safe(value, currency = 'BTC') {
    if (value === null || value === undefined || isNaN(value)) {
      return new Price(0, currency);
    }
    return new Price(value, currency);
  }

  /**
   * Получить значение
   */
  getValue() {
    return this.value;
  }

  /**
   * Получить валюту
   */
  getCurrency() {
    return this.currency;
  }

  /**
   * Форматировать для отображения
   */
  format(precision = 8) {
    if (this.value === 0) {
      return `0.00000000 ${this.currency}`;
    }
    return `${this.value.toFixed(precision)} ${this.currency}`;
  }

  /**
   * Сравнить с другой ценой
   */
  equals(other) {
    return this.value === other.value && this.currency === other.currency;
  }

  /**
   * Добавить цену
   */
  add(other) {
    if (this.currency !== other.currency) {
      throw new Error('Cannot add prices with different currencies');
    }
    return new Price(this.value + other.value, this.currency);
  }

  /**
   * Вычесть цену
   */
  subtract(other) {
    if (this.currency !== other.currency) {
      throw new Error('Cannot subtract prices with different currencies');
    }
    return new Price(this.value - other.value, this.currency);
  }

  /**
   * Умножить на коэффициент
   */
  multiply(factor) {
    return new Price(this.value * factor, this.currency);
  }

  /**
   * Разделить на коэффициент
   */
  divide(factor) {
    if (factor === 0) {
      throw new Error('Cannot divide by zero');
    }
    return new Price(this.value / factor, this.currency);
  }

  /**
   * Вычислить процентное изменение
   */
  percentageChange(oldPrice) {
    if (this.currency !== oldPrice.currency) {
      throw new Error('Cannot calculate percentage change for different currencies');
    }
    if (oldPrice.value === 0) {
      return 0;
    }
    return ((this.value - oldPrice.value) / oldPrice.value) * 100;
  }

  /**
   * Проверить, положительная ли цена
   */
  isPositive() {
    return this.value > 0;
  }

  /**
   * Проверить, отрицательная ли цена
   */
  isNegative() {
    return this.value < 0;
  }

  /**
   * Проверить, равна ли цена нулю
   */
  isZero() {
    return this.value === 0;
  }

  /**
   * Получить абсолютное значение
   */
  abs() {
    return new Price(Math.abs(this.value), this.currency);
  }

  toString() {
    return this.format();
  }
}

module.exports = Price; 