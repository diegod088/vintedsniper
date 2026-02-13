import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import path from 'path';
import { config } from './config';
import { handleCookieConsent } from './browser-helper';

puppeteer.use(StealthPlugin());

// Cache global para almacenar imágenes capturadas durante el scraping
const globalImageCache = new Map<string, Buffer>();

export async function extractImagesFromItemPage(itemUrl: string): Promise<{ urls: string[], description?: string, timeAgo?: string }> {
  const browser = await puppeteer.launch({
    headless: true,
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

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1366, height: 768 });

    // Cargar cookies si existen
    const cookiePath = config.COOKIE_FILE;
    if (fs.existsSync(cookiePath)) {
      const cookies = JSON.parse(fs.readFileSync(cookiePath, 'utf8'));
      await page.setCookie(...cookies);
    }

    console.log(`🔍 Extrayendo imágenes de página del item: ${itemUrl}`);
    await page.goto(itemUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await handleCookieConsent(page);

    // Esperar a que carguen las imágenes completamente
    await page.waitForTimeout(5000);

    console.log('🔍 Extrayendo URLs de imágenes de la página del item...');

    // Extraer TODAS las URLs de imágenes de la página con múltiples métodos mejorados
    imageUrls = await page.evaluate(() => {
      const urls = new Set<string>();
      let methodStats = { method1: 0, method2: 0, method3: 0, method4: 0, method5: 0 };

      // Método 1: Buscar imágenes con selectores específicos de Vinted
      const vintedSelectors = [
        '.item-photo img',
        '.item-photos img',
        '[data-testid="item-photo"] img',
        '[data-testid="item-photos"] img',
        '.ItemBox img',
        '.details-list img',
        'img[alt*="photo"]',
        'img[alt*="Photo"]'
      ];

      vintedSelectors.forEach(selector => {
        document.querySelectorAll(selector).forEach((img: any) => {
          const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy') || img.getAttribute('data-original');
          if (src && src.includes('vinted.net') && src.length > 50) {
            const cleanUrl = src.split('?')[0];
            if ((cleanUrl.includes('images') || cleanUrl.match(/\.(webp|jpg|jpeg|png)$/i)) && cleanUrl.includes('vinted.net')) {
              urls.add(cleanUrl);
              methodStats.method1++;
            }
          }
        });
      });

      // Método 2: Buscar en TODAS las imágenes de la página como fallback
      document.querySelectorAll('img').forEach((img: any) => {
        const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy') || img.getAttribute('data-original');
        if (src && src.includes('vinted.net') && src.length > 50) {
          const cleanUrl = src.split('?')[0];
          if ((cleanUrl.includes('images') || cleanUrl.match(/\.(webp|jpg|jpeg|png)$/i)) && cleanUrl.includes('vinted.net')) {
            if (!urls.has(cleanUrl)) {
              urls.add(cleanUrl);
              methodStats.method2++;
            }
          }
        }
      });

      // Método 3: Buscar en elementos con background-image
      document.querySelectorAll('[style*="background-image"]').forEach((el: any) => {
        const bgImage = el.style.backgroundImage;
        const match = bgImage.match(/url\(['"]?([^'"]+)['"]?\)/);
        if (match && match[1].includes('vinted.net') && match[1].length > 50) {
          const cleanUrl = match[1].split('?')[0];
          if ((cleanUrl.includes('images') || cleanUrl.match(/\.(webp|jpg|jpeg|png)$/i))) {
            if (!urls.has(cleanUrl)) {
              urls.add(cleanUrl);
              methodStats.method3++;
            }
          }
        }
      });

      // Método 4: Buscar en scripts e JSON data
      const scripts = document.querySelectorAll('script');
      scripts.forEach((script: any) => {
        const content = script.textContent || '';
        const imageMatches = content.match(/https:\/\/[^"'\s]*vinted\.net[^"'\s]*\.(webp|jpg|jpeg|png)[^"'\s]*/gi);
        if (imageMatches) {
          imageMatches.forEach((url: string) => {
            const cleanUrl = url.split('?')[0];
            if (cleanUrl.length > 50 && (cleanUrl.includes('images') || cleanUrl.match(/\.(webp|jpg|jpeg|png)$/i))) {
              if (!urls.has(cleanUrl)) {
                urls.add(cleanUrl);
                methodStats.method4++;
              }
            }
          });
        }
      });

      // Método 5: Buscar en meta tags y link tags
      document.querySelectorAll('meta[property="og:image"], meta[name="twitter:image"], link[rel="image_src"]').forEach((el: any) => {
        const content = el.content || el.href;
        if (content && content.includes('vinted.net') && content.length > 50) {
          const cleanUrl = content.split('?')[0];
          if ((cleanUrl.includes('images') || cleanUrl.match(/\.(webp|jpg|jpeg|png)$/i))) {
            if (!urls.has(cleanUrl)) {
              urls.add(cleanUrl);
              methodStats.method5++;
            }
          }
        }
      });

      return Array.from(urls);
    });

    // Extraer descripción completa
    description = await page.evaluate(() => {
      const selectors = [
        '[data-testid="item-description"]',
        '.item-description',
        '.details-list__item-description',
        '[itemprop="description"]',
        '.u-p-bottom-m > div:nth-child(1)'
      ];

      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent) {
          return el.textContent.trim();
        }
      }
      return undefined;
    });

    // Extraer tiempo de publicación
    timeAgo = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('.details-list__item'));
      for (const item of items) {
        const title = item.querySelector('.details-list__item-title')?.textContent?.toLowerCase() || '';
        if (title.includes('caricato') || title.includes('uploaded') || title.includes('aggiunto')) {
          return item.querySelector('.details-list__item-value')?.textContent?.trim();
        }
      }
      return document.querySelector('.details-list__item:last-child .details-list__item-value')?.textContent?.trim();
    });

    // Captura de primera imagen para caché
    if (imageUrls.length > 0) {
      const firstImageUrl = imageUrls[0];
      try {
        const imageElement = await page.$('.item-photo img') ||
          await page.$('[data-testid="item-photo"] img') ||
          await page.$('.item-photos img') ||
          await page.$('img[alt*="photo"]');

        if (imageElement) {
          const buffer = await imageElement.screenshot({ type: 'jpeg', quality: 85 }) as Buffer;
          if (buffer && buffer.length > 5000) {
            globalImageCache.set(firstImageUrl, buffer);
          }
        }
      } catch (e) {
        console.log(`⚠️ No se pudo capturar datos de imagen: ${e}`);
      }
    }

    await browser.close();
    return { urls: imageUrls, description, timeAgo };
  } catch (error: any) {
    console.error('❌ Error extrayendo imágenes de página del item:', error.message);
    await browser.close();
    return { urls: imageUrls, description, timeAgo };
  }
}

export async function captureImageElement(itemUrl: string): Promise<Buffer | null> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });

    const cookiesPath = path.join(__dirname, '../cookies/vinted.json');
    if (fs.existsSync(cookiesPath)) {
      const cookiesString = fs.readFileSync(cookiesPath, 'utf8');
      const cookies = JSON.parse(cookiesString);
      await page.setCookie(...cookies);
    }

    await page.goto(itemUrl, { waitUntil: 'networkidle0', timeout: 30000 });
    await handleCookieConsent(page);
    await page.waitForTimeout(2000);

    const imageElement = await page.$('img[data-testid="item-photo"]') ||
      await page.$('.item-photo img') ||
      await page.$('.details-list__item-photo img') ||
      await page.$('img[alt*="photo"]') ||
      await page.$('.item-details img:first-of-type');

    if (!imageElement) {
      await browser.close();
      return null;
    }

    const screenshot = await imageElement.screenshot({ type: 'png' }) as Buffer;
    await browser.close();
    return screenshot;
  } catch (error: any) {
    console.log(`⚠️ Error capturando elemento de imagen: ${error.message}`);
    await browser.close();
    return null;
  }
}

export async function downloadImageWithPuppeteer(url: string): Promise<Buffer | null> {
  if (globalImageCache.has(url)) {
    return globalImageCache.get(url) || null;
  }

  if (url.includes('/items/')) {
    return await captureImageElement(url);
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });

    const cookiesPath = path.join(__dirname, '../cookies/vinted.json');
    if (fs.existsSync(cookiesPath)) {
      const cookiesString = fs.readFileSync(cookiesPath, 'utf8');
      const cookies = JSON.parse(cookiesString);
      await page.setCookie(...cookies);
    }

    await page.setExtraHTTPHeaders({
      'Referer': 'https://www.vinted.it/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    const response = await page.goto(url, { waitUntil: 'networkidle0', timeout: 15000 });
    if (response && response.ok()) {
      const buffer = await response.buffer();
      await browser.close();
      return buffer;
    }

    await browser.close();
    return null;
  } catch (error: any) {
    await browser.close();
    return null;
  }
}

export async function downloadImageWithAllMethods(originalUrl: string): Promise<Buffer | null> {
  return await downloadImageWithPuppeteer(originalUrl);
}
