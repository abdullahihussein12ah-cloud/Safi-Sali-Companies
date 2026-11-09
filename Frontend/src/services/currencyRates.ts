import { CurrencyCode } from '../types';
import { CURRENCY_SYMBOLS } from './store';

const RATE_CACHE_KEY = 'maqsuud_currency_rates_usd_v1';
const EXCHANGE_RATE_URL = 'https://open.er-api.com/v6/latest/USD';

interface ExchangeRateResponse {
  result?: string;
  base_code?: string;
  rates?: Record<string, number>;
  time_last_update_utc?: string;
}

interface CachedExchangeRates {
  rates: Record<string, number>;
  updatedAt: string;
}

let cachedUpdatedAt: string | null = null;
let cacheRestored = false;

const isRateTable = (value: unknown): value is Record<string, number> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;

  const entries = Object.entries(value);
  return (
    entries.length >= 100 &&
    entries.every(
      ([code, rate]) => /^[A-Z]{3}$/.test(code) && typeof rate === 'number' && Number.isFinite(rate) && rate > 0
    ) &&
    entries.some(([code, rate]) => code === 'USD' && rate === 1)
  );
};

const getCurrencyName = (code: string, locale = 'en'): string => {
  try {
    return new Intl.DisplayNames([locale], { type: 'currency' }).of(code) || code;
  } catch (error) {
    if (error instanceof RangeError) return CURRENCY_SYMBOLS[code]?.name || code;
    throw error;
  }
};

const getCurrencySymbol = (code: string): string => {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      currencyDisplay: 'narrowSymbol',
    })
      .formatToParts(0)
      .find((part) => part.type === 'currency')?.value || code;
  } catch (error) {
    if (error instanceof RangeError) return CURRENCY_SYMBOLS[code]?.symbol || code;
    throw error;
  }
};

const applyRates = (rates: Record<string, number>): void => {
  Object.entries(rates).forEach(([code, rate]) => {
    if (!/^[A-Z]{3}$/.test(code) || !Number.isFinite(rate) || rate <= 0) return;

    const name = getCurrencyName(code);
    if (name === 'Unknown Currency') return;

    CURRENCY_SYMBOLS[code] = {
      symbol: getCurrencySymbol(code),
      rateAgainstUSD: rate,
      name,
    };
  });
};

export const restoreCachedExchangeRates = (): string | null => {
  if (cacheRestored) return cachedUpdatedAt;
  cacheRestored = true;

  let cached: string | null;
  try {
    cached = localStorage.getItem(RATE_CACHE_KEY);
  } catch (error) {
    console.error('Unable to read cached currency rates:', error);
    return null;
  }
  if (!cached) return null;

  try {
    const parsed: unknown = JSON.parse(cached);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('rates' in parsed) ||
      !isRateTable(parsed.rates) ||
      !('updatedAt' in parsed) ||
      typeof parsed.updatedAt !== 'string' ||
      !Number.isFinite(Date.parse(parsed.updatedAt))
    ) {
      throw new Error('Cached currency rates have an invalid format.');
    }

    applyRates(parsed.rates);
    cachedUpdatedAt = parsed.updatedAt;
  } catch (error) {
    console.error('Unable to restore cached currency rates:', error);
    try {
      localStorage.removeItem(RATE_CACHE_KEY);
    } catch (removeError) {
      console.error('Unable to remove invalid cached currency rates:', removeError);
    }
  }

  return cachedUpdatedAt;
};

export const refreshExchangeRates = async (): Promise<string> => {
  restoreCachedExchangeRates();

  const response = await fetch(EXCHANGE_RATE_URL);
  if (!response.ok) {
    throw new Error(`Currency-rate service responded with HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as ExchangeRateResponse;
  if (
    payload.result !== 'success' ||
    payload.base_code !== 'USD' ||
    !payload.rates ||
    typeof payload.rates !== 'object'
  ) {
    throw new Error('Currency-rate service returned an invalid USD rate table.');
  }

  const rates = Object.fromEntries(
    Object.entries(payload.rates).filter(([, rate]) => Number.isFinite(rate) && rate > 0)
  );
  if (rates.USD !== 1 || Object.keys(rates).length < 100) {
    throw new Error('Currency-rate service returned an incomplete rate table.');
  }

  applyRates(rates);
  cachedUpdatedAt = payload.time_last_update_utc || new Date().toISOString();
  const cache: CachedExchangeRates = { rates, updatedAt: cachedUpdatedAt };
  try {
    localStorage.setItem(RATE_CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.error('Unable to cache refreshed currency rates:', error);
  }

  return cachedUpdatedAt;
};

export const getCurrencyCodes = (): CurrencyCode[] =>
  Object.keys(CURRENCY_SYMBOLS).sort((left, right) => {
    if (left === 'USD') return -1;
    if (right === 'USD') return 1;
    return CURRENCY_SYMBOLS[left].name.localeCompare(CURRENCY_SYMBOLS[right].name);
  });

export const getCurrencyOptionLabel = (code: CurrencyCode, locale: string): string => {
  const currency = CURRENCY_SYMBOLS[code];
  return `${getCurrencyName(code, locale)} (${code}) · ${currency.symbol}`;
};

export const getCachedExchangeRatesUpdatedAt = (): string | null => cachedUpdatedAt;
