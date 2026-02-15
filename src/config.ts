import dotenv from 'dotenv';
import path from 'path';
import { dynamicConfigManager } from './dynamic-config';

dotenv.config();

export interface Config {
  /** Términos de búsqueda: marcas (BRANDS) o palabras clave (KEYWORDS) */
  SEARCH_TERMS: string[];
  /** Si está definido, solo se aceptan items de estas marcas */
  ALLOWED_BRANDS: string[] | undefined;
  MAX_PRICE: number;
  TOK: string;
  CHAT_ID: string;
  COOKIE_FILE: string;
  POLL_INTERVAL_MS: number;
  BACKOFF_DELAY_MS: number;
  VINTED_BASE_URL: string;
  AUTO_BUY_ENABLED: boolean;
  PANEL_PASSWORD?: string;
  MAX_AGE_MINUTES: number;
  EXCLUDE_KEYWORDS: string[];
  SIZES: string[];
  EXCLUDE_CONDITIONS: string[];
}

function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (!value && !defaultValue) {
    console.error(`\n❌ ERROR: Falta la variable de entorno obligatoria: ${key}`);
    console.error(`👉 Si estás en Railway, ve a 'Settings' > 'Variables' y añádela.`);
    console.error(`👉 Si estás local, añádela a tu archivo .env\n`);
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value || defaultValue || '';
}

function parseList(raw: string): string[] {
  // Prioriza comas si existen, si no, usa espacios
  if (raw.includes(',')) {
    return raw.split(',').map(k => k.trim()).filter(Boolean);
  }
  return raw.split(/\s+/).map(k => k.trim()).filter(Boolean);
}

/** Si BRANDS está definido, busca solo por marcas y filtra por ellas. Si no, usa KEYWORD/KEYWORDS. */
function getSearchTerms(): string[] {
  const brands = process.env.BRANDS?.trim();
  if (brands) return parseList(brands);
  const kw = process.env.KEYWORDS || process.env.KEYWORD || '';
  if (!kw.trim()) throw new Error('Missing required: BRANDS or KEYWORD/KEYWORDS');
  return parseList(kw);
}

function getAllowedBrands(): string[] | undefined {
  const brands = process.env.BRANDS?.trim();
  if (!brands) return undefined;
  return parseList(brands);
}

// Cargar configuraciones guardadas previamente si existen
const savedSettings = dynamicConfigManager.load();

export const config: Config = {
  SEARCH_TERMS: savedSettings.SEARCH_TERMS ?? getSearchTerms(),
  ALLOWED_BRANDS: savedSettings.ALLOWED_BRANDS ?? getAllowedBrands(),
  MAX_PRICE: savedSettings.MAX_PRICE ?? parseFloat(getEnvVar('MAX_PRICE', '40')),
  TOK: getEnvVar('TOK'),
  CHAT_ID: getEnvVar('CHAT_ID'),
  COOKIE_FILE: path.resolve(getEnvVar('COOKIE_FILE', 'data/cookies/vinted.json')),
  POLL_INTERVAL_MS: savedSettings.POLL_INTERVAL_MS ?? 60000, // Aumentado a 60s para mayor seguridad
  BACKOFF_DELAY_MS: 30000, // 30 segundos en caso de 429
  VINTED_BASE_URL: process.env.VINTED_BASE_URL || 'https://www.vinted.it',
  AUTO_BUY_ENABLED: process.env.AUTO_BUY_ENABLED === 'true',
  PANEL_PASSWORD: process.env.PANEL_PASSWORD,
  MAX_AGE_MINUTES: savedSettings.MAX_AGE_MINUTES ?? parseInt(getEnvVar('MAX_AGE_MINUTES', '60')),
  EXCLUDE_KEYWORDS: savedSettings.EXCLUDE_KEYWORDS || parseList(process.env.EXCLUDE_KEYWORDS || ''),
  SIZES: savedSettings.SIZES || parseList(process.env.SIZES || ''),
  EXCLUDE_CONDITIONS: (savedSettings as any).EXCLUDE_CONDITIONS || parseList(process.env.EXCLUDE_CONDITIONS || '')
};

export default config;
