# CoinGecko Top 1000 Coins by Market Cap

This module provides functionality to fetch the top 1000 cryptocurrencies by market capitalization in Bitcoin pairs using the CoinGecko API.

## Features

- ✅ Fetch top 1000 coins by market cap in Bitcoin pairs
- ✅ Filter coins by market cap, volume, and other criteria
- ✅ Get specific coin data
- ✅ Get trending coins
- ✅ Save data to JSON files
- ✅ Rate limiting and error handling
- ✅ Free to use (no API key required)

## Installation

The required dependencies are already included in your project:

```bash
npm install axios
```

## Usage

### Basic Usage

```javascript
const { getTop1000CoinsByMarketCap } = require('./coinGeckoTop1000');

async function main() {
  try {
    const coins = await getTop1000CoinsByMarketCap();
    console.log(`Fetched ${coins.length} coins`);
    
    // Display first 5 coins
    coins.slice(0, 5).forEach(coin => {
      console.log(`${coin.rank}. ${coin.name} (${coin.symbol})`);
      console.log(`   Price: ${coin.current_price_btc} BTC`);
      console.log(`   Market Cap: ${coin.market_cap_btc} BTC`);
      console.log(`   24h Change: ${coin.price_change_percentage_24h}%`);
    });
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
```

### Filtered Results

```javascript
const { getTopCoinsWithFilters } = require('./coinGeckoTop1000');

async function getFilteredCoins() {
  const coins = await getTopCoinsWithFilters({
    limit: 50,           // Get top 50 coins
    minVolume: 10,       // Minimum 10 BTC volume
    minMarketCap: 1000   // Minimum 1000 BTC market cap
  });
  
  return coins;
}
```

### Get Specific Coin Data

```javascript
const { getCoinData } = require('./coinGeckoTop1000');

async function getBitcoinData() {
  const bitcoin = await getCoinData('bitcoin');
  console.log(`Bitcoin price: ${bitcoin.current_price_btc} BTC`);
  console.log(`Bitcoin market cap: ${bitcoin.market_cap_btc} BTC`);
}
```

### Get Trending Coins

```javascript
const { getTrendingCoins } = require('./coinGeckoTop1000');

async function getTrending() {
  const trending = await getTrendingCoins();
  trending.forEach(coin => {
    console.log(`${coin.name} (${coin.symbol}) - Score: ${coin.score}`);
  });
}
```

### Save Data to File

```javascript
const { getTop1000CoinsByMarketCap, saveCoinsToFile } = require('./coinGeckoTop1000');

async function saveData() {
  const coins = await getTop1000CoinsByMarketCap();
  saveCoinsToFile(coins, 'my_coins_data.json');
}
```

## API Functions

### `getTop1000CoinsByMarketCap()`

Fetches the top 1000 coins by market cap in Bitcoin pairs.

**Returns:** `Promise<Array>` - Array of coin objects

**Coin Object Structure:**
```javascript
{
  rank: 1,                           // Market cap rank
  id: "bitcoin",                     // Coin ID
  symbol: "BTC",                     // Symbol
  name: "Bitcoin",                   // Name
  current_price_btc: 1.0,           // Current price in BTC
  market_cap_btc: 19898575.0,       // Market cap in BTC
  total_volume_btc: 123456.0,       // 24h volume in BTC
  price_change_24h_btc: 0.001,      // 24h price change in BTC
  price_change_percentage_24h: 2.5,  // 24h price change percentage
  price_change_percentage_7d: 5.2,   // 7d price change percentage
  price_change_percentage_30d: -1.8, // 30d price change percentage
  market_cap_change_24h_btc: 1000.0, // 24h market cap change in BTC
  market_cap_change_percentage_24h: 0.5, // 24h market cap change percentage
  circulating_supply: 19500000,      // Circulating supply
  total_supply: 21000000,           // Total supply
  max_supply: 21000000,             // Max supply
  ath_btc: 1.2,                     // All-time high in BTC
  ath_change_percentage: -16.67,     // ATH change percentage
  ath_date: "2021-11-10T14:24:11.849Z", // ATH date
  atl_btc: 0.0001,                  // All-time low in BTC
  atl_change_percentage: 999900.0,   // ATL change percentage
  atl_date: "2013-07-06T00:00:00.000Z", // ATL date
  last_updated: "2024-01-15T10:30:00.000Z", // Last updated
  image: "https://..."              // Coin image URL
}
```

### `getTopCoinsWithFilters(options)`

Fetches coins with filtering options.

**Parameters:**
- `options.limit` (number, optional): Number of coins to return (default: 1000)
- `options.minMarketCap` (number, optional): Minimum market cap in BTC
- `options.maxMarketCap` (number, optional): Maximum market cap in BTC
- `options.minVolume` (number, optional): Minimum 24h volume in BTC

**Returns:** `Promise<Array>` - Filtered array of coin objects

### `getCoinData(coinId)`

Fetches detailed data for a specific coin.

**Parameters:**
- `coinId` (string): Coin ID (e.g., 'bitcoin', 'ethereum')

**Returns:** `Promise<Object>` - Coin data object

### `getTrendingCoins()`

Fetches currently trending coins.

**Returns:** `Promise<Array>` - Array of trending coin objects

### `saveCoinsToFile(coins, filename)`

Saves coin data to a JSON file.

**Parameters:**
- `coins` (Array): Array of coin objects
- `filename` (string, optional): Output filename (default: 'top1000_coins_btc.json')

## Rate Limiting

The module includes built-in rate limiting:
- 1-second delay between API requests
- 30-second timeout for requests
- Automatic retry logic for failed requests

## Error Handling

All functions include comprehensive error handling:
- Network errors
- API rate limiting
- Invalid responses
- Timeout errors

## Example Output

When you run the main script:

```bash
node coinGeckoTop1000.js
```

You'll see output like:

```
=== CoinGecko Top 1000 Coins by Market Cap ===

Fetching top 1000 coins by market cap in Bitcoin pairs...
Fetching page 1/4...
Fetched 250 coins from page 1
Fetching page 2/4...
Fetched 250 coins from page 2
Fetching page 3/4...
Fetched 250 coins from page 3
Fetching page 4/4...
Fetched 250 coins from page 4
Successfully fetched 1000 coins total
Data saved to C:\git\crypto-screener\top1000_coins_btc.json
Total coins saved: 1000

Top 10 coins by market cap:
1. Bitcoin (BTC)
   Market Cap: 19898575.00000000 BTC
   Price: 1.00000000 BTC
   24h Change: 0.00%
   7d Change: N/A%
   30d Change: N/A%

2. Ethereum (ETH)
   Market Cap: 3946675.00000000 BTC
   Price: 0.03267970 BTC
   24h Change: 2.23%
   7d Change: N/A%
   30d Change: N/A%
...
```

## Files Generated

- `top1000_coins_btc.json` - Complete data for all 1000 coins
- `top100_coins_btc.json` - Example with top 100 coins (from example usage)

## Notes

- The CoinGecko API is free to use but has rate limits
- All prices and market caps are in Bitcoin (BTC) pairs
- Data is fetched in real-time from CoinGecko's servers
- The module handles pagination automatically to fetch all 1000 coins
- No API key is required for basic usage

## Integration with Existing Project

This module can be easily integrated with your existing `anomalyDetector.js` and other crypto screening tools. You can use the fetched data for:

- Price anomaly detection
- Market analysis
- Portfolio tracking
- Trading signals
- Market sentiment analysis 