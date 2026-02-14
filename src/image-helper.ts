import puppeteer from 'puppeteer-extra';
import { Browser, Page } from 'puppeteer';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { config } from './config';
import { handleCookieConsent } from './browser-helper';

puppeteer.use(StealthPlugin());

// Cache global para almacenar imágenes capturadas durante el scraping
const globalImageCache = new Map<string, Buffer>();

export async function extractImagesFromItemPage(itemUrl: string, existingBrowser?: Browser): Promise<{ urls: string[], description?: string, timeAgo?: string, location?: string }> {
  const browser = existingBrowser || await puppeteer.launch({
    headless: 'new' as any,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor'
    ]
  });

  let imageUrls: string[] = [];
  let description: string | undefined = undefined;
  let timeAgo: string | undefined = undefined;
  let location: string | undefined = undefined;
  let page: Page | null = null;

  try {
    page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1366, height: 768 });

    // Cargar cookies si existen
    const cookiePath = config.COOKIE_FILE;
    if (fs.existsSync(cookiePath)) {
      try {
        const cookies = JSON.parse(fs.readFileSync(cookiePath, 'utf8'));
        const sanitizedCookies = cookies.map((c: any) => {
          const pCookie: any = {
            name: c.name,
            value: c.value,
            domain: c.domain,
            path: c.path || '/',
            expires: c.expires,
            httpOnly: c.httpOnly,
            secure: c.secure
          };
          if (c.sameSite) {
            const ss = c.sameSite.toLowerCase();
            if (ss === 'strict' || ss === 'lax' || ss === 'none') {
              pCookie.sameSite = c.sameSite.charAt(0).toUpperCase() + ss.slice(1);
            }
          }
          return pCookie;
        }).filter((c: any) => c.name && c.value && c.domain);

        if (sanitizedCookies.length > 0) {
          await page.setCookie(...sanitizedCookies);
        }
      } catch (e) {
        console.error('⚠️ Error cargando cookies:', e);
      }
    }

    console.log(`🔍 Extrayendo detalles de la página: ${itemUrl}`);

    // Navegar con timeout aumentado y waitUntil menos estricto para mayor velocidad
    await page.goto(itemUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    await handleCookieConsent(page);

    // Esperar un poco a que los elementos dinámicos carguen si es necesario
    try {
      await page.waitForSelector('.details-list__item', { timeout: 10000 });
    } catch (e) {
      console.log('⚠️ Selector .details-list__item no encontrado, procediendo con extracción rápida...');
    }

    // Extraer TODAS las URLs de imágenes
    imageUrls = await page.evaluate(() => {
      const urls = new Set<string>();

      // 1. Selectores específicos de Vinted (actualizados)
      const vintedSelectors = [
        '.item-photo img', '.item-photos img', '[data-testid="item-photo"] img',
        '[data-testid="item-photos"] img', '.ItemBox img', '.details-list img',
        'img[alt*="photo"]', 'img[alt*="Photo"]', 'img[itemprop="image"]',
        '.item-description img', '.user-items img', '.main-photo img'
      ];

      vintedSelectors.forEach(selector => {
        document.querySelectorAll(selector).forEach((img: any) => {
          // Intentar obtener la mejor resolución posible
          let src = img.getAttribute('data-src') || img.getAttribute('data-lazy') || img.src;
          if (src && src.length > 20) {
            // No limpiar totalmente el query param si es de vinted.net, a veces son necesarios
            // Pero si termina en .webp o similar, podemos intentar limpiar
            if (src.includes('vinted.net')) {
              // Intentar forzar resolución alta si es una miniatura
              src = src.replace(/\/t\/\d+_\d+_[^/]+\/\d+x\d+\//, (match: string) => match.replace(/\d+x\d+/, 'f800'));
            }
            urls.add(src);
          }
        });
      });

      // 2. Si no encontramos nada, buscar en TODAS las imágenes grandes
      if (urls.size === 0) {
        document.querySelectorAll('img').forEach((img: any) => {
          const src = img.getAttribute('data-src') || img.getAttribute('data-lazy') || img.src;
          if (src && src.length > 20 && !src.includes('avatar') && !src.includes('icon') && !src.includes('placeholder')) {
            if (img.naturalWidth > 150 || src.includes('f800') || src.includes('large') || src.includes('images')) {
              urls.add(src);
            }
          }
        });
      }

      return Array.from(urls);
    });

    // Extraer descripción completa
    description = await page.evaluate(() => {
      const selectors = [
        '[data-testid="item-description"]', '.item-description',
        '.details-list__item-description', '[itemprop="description"]',
        '.item-description__text'
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent) return el.textContent.trim();
      }
      return undefined;
    });

    // Extraer tiempo de publicación Y ubicación
    const details = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('.details-list__item'));
      let extractedTime: string | undefined = undefined;
      let extractedLocation: string | undefined = undefined;

      const timeKeywords = [
        'caricato', 'uploaded', 'aggiunto', 'pubblicato', 'posted', 'publié', 'subido',
        'minuti', 'ore', 'giorni', 'settimane', 'mesi', 'anni',
        'minutes', 'hours', 'days', 'weeks', 'months', 'years',
        'minutos', 'horas', 'días', 'semanas', 'meses', 'años',
        'hace', 'fa', 'ago', 'il y a'
      ];

      const locationKeywords = [
        'posizione', 'location', 'lieu', 'ubicación', 'país', 'country'
      ];

      for (const item of items) {
        const titleEl = item.querySelector('.details-list__item-title');
        const valueEl = item.querySelector('.details-list__item-value');

        if (!titleEl || !valueEl) continue;

        const title = titleEl.textContent?.toLowerCase() || '';
        const value = valueEl.textContent?.trim() || '';

        // Buscar Ubicación
        if (locationKeywords.some(k => title.includes(k))) {
          extractedLocation = value;
          continue;
        }

        // Buscar Tiempo
        if (title.includes('caricato') || title.includes('uploaded') || title.includes('aggiunto') ||
          title.includes('tempo') || title.includes('time') ||
          timeKeywords.some(k => value.toLowerCase().includes(k))) {
          if (!extractedTime) extractedTime = value;
        }
      }

      return { timeAgo: extractedTime, location: extractedLocation };
    });

    timeAgo = details.timeAgo;
    location = details.location;

    await page.close();
    if (!existingBrowser) await browser.close();

    return { urls: imageUrls, description, timeAgo, location };
  } catch (error: any) {
    console.error('❌ Error en extractImagesFromItemPage:', error.message);
    if (page) await page.close();
    if (!existingBrowser) await browser.close();
    return { urls: imageUrls, description, timeAgo, location };
  }
}

export async function captureImageElement(itemUrl: string, existingBrowser?: Browser): Promise<Buffer | null> {
  const browser = existingBrowser || await puppeteer.launch({
    headless: 'new' as any,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  let page: Page | null = null;
  try {
    page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });

    const cookiePath = config.COOKIE_FILE;
    if (fs.existsSync(cookiePath)) {
      try {
        const cookies = JSON.parse(fs.readFileSync(cookiePath, 'utf8'));
        const sanitizedCookies = cookies.map((c: any) => ({
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path,
          expires: c.expires,
          httpOnly: c.httpOnly,
          secure: c.secure,
          sameSite: c.sameSite
        })).filter((c: any) => c.name && c.value && c.domain);

        if (sanitizedCookies.length > 0) {
          await page.setCookie(...sanitizedCookies);
        }
      } catch (e) {
        console.error('⚠️ Error cargando cookies en captureImage:', e);
      }
    }

    await page.goto(itemUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await handleCookieConsent(page);

    const imageElement = await page.$('img[data-testid="item-photo"]') ||
      await page.$('.item-photo img') ||
      await page.$('.details-list__item-photo img');

    if (!imageElement) {
      await page.close();
      if (!existingBrowser) await browser.close();
      return null;
    }

    const screenshot = await imageElement.screenshot({ type: 'png' }) as Buffer;
    await page.close();
    if (!existingBrowser) await browser.close();
    return screenshot;
  } catch (error: any) {
    console.log(`⚠️ Error capturando elemento de imagen: ${error.message}`);
    if (page) await page.close();
    if (!existingBrowser) await browser.close();
    return null;
  }
}

export async function downloadImageWithPuppeteer(url: string, existingBrowser?: Browser): Promise<Buffer | null> {
  if (globalImageCache.has(url)) {
    return globalImageCache.get(url) || null;
  }

  if (url.includes('/items/')) {
    return await captureImageElement(url, existingBrowser);
  }

  const browser = existingBrowser || await puppeteer.launch({
    headless: 'new' as any,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  let page: Page | null = null;
  try {
    page = await browser.newPage();

    // Configurar viewport
    await page.setViewport({ width: 1366, height: 768 });

    // CARGAR COOKIES (Crucial para pasar Cloudflare/Vinted protection)
    const cookiePath = config.COOKIE_FILE;
    if (fs.existsSync(cookiePath)) {
      try {
        const cookies = JSON.parse(fs.readFileSync(cookiePath, 'utf8'));
        // Filtrar cookies inválidas si es necesario
        const sanitizedCookies = cookies.map((c: any) => ({
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path,
          expires: c.expires,
          httpOnly: c.httpOnly,
          secure: c.secure,
          sameSite: c.sameSite
        })).filter((c: any) => c.name && c.value && c.domain);

        if (sanitizedCookies.length > 0) {
          await page.setCookie(...sanitizedCookies);
        }
      } catch (e) {
        console.error('⚠️ Error cargando cookies en downloadImage:', e);
      }
    }

    await page.setExtraHTTPHeaders({
      'Referer': 'https://www.vinted.it/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    console.log(`📸 Puppeteer descargando: ${url.substring(0, 50)}...`);
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

    if (response) {
      if (response.ok()) {
        const buffer = await response.buffer();
        console.log(`✅ Imagen descargada (${buffer.length} bytes)`);
        await page.close();
        if (!existingBrowser) await browser.close();
        return buffer;
      } else {
        console.log(`❌ Error descarga Puppeteer: ${response.status()} ${response.statusText()}`);
      }
    }

    await page.close();
    if (!existingBrowser) await browser.close();
    return null;
  } catch (error: any) {
    console.error(`❌ Excepción descarga Puppeteer: ${error.message}`);
    if (page) await page.close();
    if (!existingBrowser) await browser.close();
    return null;
  }
}

export async function downloadImageWithAxios(url: string): Promise<Buffer | null> {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.vinted.it/'
      },
      timeout: 10000
    });
    if (response.status === 200) {
      return Buffer.from(response.data);
    }
    return null;
  } catch (error: any) {
    console.log(`⚠️ Error descarga Axios (${url}): ${error.message}`);
    return null;
  }
}

export async function downloadImageWithAllMethods(originalUrl: string, existingBrowser?: Browser): Promise<Buffer | null> {
  // 1. Intentar con Axios (más rápido)
  const axiosBuffer = await downloadImageWithAxios(originalUrl);
  if (axiosBuffer) return axiosBuffer;

  // 2. Intentar con Puppeteer (más lento, pero maneja JS/cookies)
  console.log('🔄 Fallback a Puppeteer para descarga...');
  return await downloadImageWithPuppeteer(originalUrl, existingBrowser);
}
