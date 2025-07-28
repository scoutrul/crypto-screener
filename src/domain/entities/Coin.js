const Price = require('../value-objects/Price');
const Percentage = require('../value-objects/Percentage');

/**
 * Доменная сущность - Монета
 */
class Coin {
  constructor(id, symbol, name, currentPrice, marketCap, volume) {
    if (!id || !symbol || !name) {
      throw new Error('Coin must have id, symbol and name');
    }

    this.id = id;
    this.symbol = symbol.toUpperCase();
    this.name = name;
    this.currentPrice = currentPrice instanceof Price ? currentPrice : Price.safe(currentPrice);
    this.marketCap = marketCap instanceof Price ? marketCap : Price.safe(marketCap);
    this.volume = volume instanceof Price ? volume : Price.safe(volume);
    
    // Дополнительные свойства
    this.rank = null;
    this.priceChange24h = null;
    this.priceChangePercentage24h = null;
    this.priceChangePercentage7d = null;
    this.priceChangePercentage30d = null;
    this.marketCapChange24h = null;
    this.marketCapChangePercentage24h = null;
    this.circulatingSupply = null;
    this.totalSupply = null;
    this.maxSupply = null;
    this.ath = null;
    this.athChangePercentage = null;
    this.athDate = null;
    this.atl = null;
    this.atlChangePercentage = null;
    this.atlDate = null;
    this.lastUpdated = null;
    this.image = null;
  }

  /**
   * Создать монету из данных API
   */
  static fromApiData(data) {
    const coin = new Coin(
      data.id,
      data.symbol,
      data.name,
      data.current_price || 0,
      data.market_cap || 0,
      data.total_volume || 0
    );

    // Установить дополнительные свойства
    coin.rank = data.market_cap_rank;
    coin.priceChange24h = data.price_change_24h ? Price.safe(data.price_change_24h) : null;
    coin.priceChangePercentage24h = data.price_change_percentage_24h ? 
      Percentage.fromValue(data.price_change_percentage_24h) : null;
    coin.priceChangePercentage7d = data.price_change_percentage_7d ? 
      Percentage.fromValue(data.price_change_percentage_7d) : null;
    coin.priceChangePercentage30d = data.price_change_percentage_30d ? 
      Percentage.fromValue(data.price_change_percentage_30d) : null;
    coin.marketCapChange24h = data.market_cap_change_24h ? 
      Price.safe(data.market_cap_change_24h) : null;
    coin.marketCapChangePercentage24h = data.market_cap_change_percentage_24h ? 
      Percentage.fromValue(data.market_cap_change_percentage_24h) : null;
    coin.circulatingSupply = data.circulating_supply;
    coin.totalSupply = data.total_supply;
    coin.maxSupply = data.max_supply;
    coin.ath = data.ath ? Price.safe(data.ath) : null;
    coin.athChangePercentage = data.ath_change_percentage ? 
      Percentage.fromValue(data.ath_change_percentage) : null;
    coin.athDate = data.ath_date;
    coin.atl = data.atl ? Price.safe(data.atl) : null;
    coin.atlChangePercentage = data.atl_change_percentage ? 
      Percentage.fromValue(data.atl_change_percentage) : null;
    coin.atlDate = data.atl_date;
    coin.lastUpdated = data.last_updated;
    coin.image = data.image;

    return coin;
  }

  /**
   * Получить ID монеты
   */
  getId() {
    return this.id;
  }

  /**
   * Получить символ монеты
   */
  getSymbol() {
    return this.symbol;
  }

  /**
   * Получить название монеты
   */
  getName() {
    return this.name;
  }

  /**
   * Получить текущую цену
   */
  getCurrentPrice() {
    return this.currentPrice;
  }

  /**
   * Получить рыночную капитализацию
   */
  getMarketCap() {
    return this.marketCap;
  }

  /**
   * Получить объем торгов
   */
  getVolume() {
    return this.volume;
  }

  /**
   * Получить ранг по капитализации
   */
  getRank() {
    return this.rank;
  }

  /**
   * Получить изменение цены за 24 часа
   */
  getPriceChange24h() {
    return this.priceChange24h;
  }

  /**
   * Получить процентное изменение цены за 24 часа
   */
  getPriceChangePercentage24h() {
    return this.priceChangePercentage24h;
  }

  /**
   * Проверить, растет ли цена за 24 часа
   */
  isPriceRising24h() {
    return this.priceChangePercentage24h && this.priceChangePercentage24h.isPositive();
  }

  /**
   * Проверить, падает ли цена за 24 часа
   */
  isPriceFalling24h() {
    return this.priceChangePercentage24h && this.priceChangePercentage24h.isNegative();
  }

  /**
   * Получить процентное изменение цены за 7 дней
   */
  getPriceChangePercentage7d() {
    return this.priceChangePercentage7d;
  }

  /**
   * Получить процентное изменение цены за 30 дней
   */
  getPriceChangePercentage30d() {
    return this.priceChangePercentage30d;
  }

  /**
   * Получить изменение рыночной капитализации за 24 часа
   */
  getMarketCapChange24h() {
    return this.marketCapChange24h;
  }

  /**
   * Получить процентное изменение рыночной капитализации за 24 часа
   */
  getMarketCapChangePercentage24h() {
    return this.marketCapChangePercentage24h;
  }

  /**
   * Получить капитализацию за последние 24 часа (текущая - изменение)
   */
  getMarketCap24h() {
    if (!this.marketCap || !this.marketCapChange24h) {
      return null;
    }
    
    const currentMarketCap = this.marketCap.getValue();
    const marketCapChange = this.marketCapChange24h.getValue();
    const marketCap24h = currentMarketCap - marketCapChange;
    
    return Price.safe(marketCap24h);
  }

  /**
   * Получить циркулирующее предложение
   */
  getCirculatingSupply() {
    return this.circulatingSupply;
  }

  /**
   * Получить общее предложение
   */
  getTotalSupply() {
    return this.totalSupply;
  }

  /**
   * Получить максимальное предложение
   */
  getMaxSupply() {
    return this.maxSupply;
  }

  /**
   * Получить исторический максимум
   */
  getAth() {
    return this.ath;
  }

  /**
   * Получить процент от исторического максимума
   */
  getAthChangePercentage() {
    return this.athChangePercentage;
  }

  /**
   * Получить дату исторического максимума
   */
  getAthDate() {
    return this.athDate;
  }

  /**
   * Получить исторический минимум
   */
  getAtl() {
    return this.atl;
  }

  /**
   * Получить процент от исторического минимума
   */
  getAtlChangePercentage() {
    return this.atlChangePercentage;
  }

  /**
   * Получить дату исторического минимума
   */
  getAtlDate() {
    return this.atlDate;
  }

  /**
   * Получить время последнего обновления
   */
  getLastUpdated() {
    return this.lastUpdated;
  }

  /**
   * Получить URL изображения
   */
  getImage() {
    return this.image;
  }

  /**
   * Обновить цену
   */
  updatePrice(newPrice) {
    this.currentPrice = newPrice instanceof Price ? newPrice : Price.safe(newPrice);
    this.lastUpdated = new Date().toISOString();
  }

  /**
   * Обновить объем
   */
  updateVolume(newVolume) {
    this.volume = newVolume instanceof Price ? newVolume : Price.safe(newVolume);
  }

  /**
   * Обновить рыночную капитализацию
   */
  updateMarketCap(newMarketCap) {
    this.marketCap = newMarketCap instanceof Price ? newMarketCap : Price.safe(newMarketCap);
  }

  /**
   * Получить краткую информацию о монете
   */
  getSummary() {
    return {
      id: this.id,
      symbol: this.symbol,
      name: this.name,
      price: this.currentPrice.format(),
      marketCap: this.marketCap.format(),
      volume: this.volume.format(),
      rank: this.rank,
      change24h: this.priceChangePercentage24h ? this.priceChangePercentage24h.format() : 'N/A'
    };
  }

  /**
   * Сравнить с другой монетой по рыночной капитализации
   */
  compareByMarketCap(other) {
    return this.marketCap.getValue() - other.marketCap.getValue();
  }

  /**
   * Сравнить с другой монетой по объему торгов
   */
  compareByVolume(other) {
    return this.volume.getValue() - other.volume.getValue();
  }

  /**
   * Сравнить с другой монетой по изменению цены за 24 часа
   */
  compareByPriceChange24h(other) {
    const thisChange = this.priceChangePercentage24h ? this.priceChangePercentage24h.getValue() : 0;
    const otherChange = other.priceChangePercentage24h ? other.priceChangePercentage24h.getValue() : 0;
    return thisChange - otherChange;
  }

  toString() {
    return `${this.name} (${this.symbol}) - ${this.currentPrice.format()}`;
  }
}

module.exports = Coin; 