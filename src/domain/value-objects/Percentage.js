/**
 * Value Object для процентного значения
 */
class Percentage {
  constructor(value) {
    if (typeof value !== 'number') {
      throw new Error('Percentage must be a number');
    }
    
    this.value = value;
  }

  /**
   * Создать процент из значения
   */
  static fromValue(value) {
    return new Percentage(value);
  }

  /**
   * Создать процент из десятичной дроби (0.05 -> 5%)
   */
  static fromDecimal(decimal) {
    return new Percentage(decimal * 100);
  }

  /**
   * Получить значение
   */
  getValue() {
    return this.value;
  }

  /**
   * Получить десятичную дробь
   */
  getDecimal() {
    return this.value / 100;
  }

  /**
   * Форматировать для отображения
   */
  format(precision = 2) {
    const sign = this.value >= 0 ? '+' : '';
    return `${sign}${this.value.toFixed(precision)}%`;
  }

  /**
   * Сравнить с другим процентом
   */
  equals(other) {
    return this.value === other.value;
  }

  /**
   * Добавить процент
   */
  add(other) {
    return new Percentage(this.value + other.value);
  }

  /**
   * Вычесть процент
   */
  subtract(other) {
    return new Percentage(this.value - other.value);
  }

  /**
   * Умножить на коэффициент
   */
  multiply(factor) {
    return new Percentage(this.value * factor);
  }

  /**
   * Разделить на коэффициент
   */
  divide(factor) {
    if (factor === 0) {
      throw new Error('Cannot divide by zero');
    }
    return new Percentage(this.value / factor);
  }

  /**
   * Проверить, положительный ли процент
   */
  isPositive() {
    return this.value > 0;
  }

  /**
   * Проверить, отрицательный ли процент
   */
  isNegative() {
    return this.value < 0;
  }

  /**
   * Проверить, равен ли нулю
   */
  isZero() {
    return this.value === 0;
  }

  /**
   * Получить абсолютное значение
   */
  abs() {
    return new Percentage(Math.abs(this.value));
  }

  /**
   * Ограничить значение диапазоном
   */
  clamp(min, max) {
    const clampedValue = Math.max(min, Math.min(max, this.value));
    return new Percentage(clampedValue);
  }

  toString() {
    return this.format();
  }
}

module.exports = Percentage; 