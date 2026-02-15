import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Page } from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { config } from './config';
import { VintedItem } from './types';
import { AdvancedFilter, FilterConfig } from './filters';
import axios from 'axios';
import { CookieManager } from './cookies';
import { logger } from './logger';

puppeteer.use(StealthPlugin());

export class VintedAPI {
  private baseURL: string;
  private cookieManager: CookieManager;
  private advancedFilter: AdvancedFilter;
  public lastHtml: string = '';
  private browserInitialized: boolean = false;

  constructor() {
    this.baseURL = config.VINTED_BASE_URL;
    this.cookieManager = new CookieManager(config.COOKIE_FILE);
    this.advancedFilter = new AdvancedFilter({
      maxPrice: config.MAX_PRICE,
      excludeKeywords: config.EXCLUDE_KEYWORDS,
      brands: config.ALLOWED_BRANDS,
      excludeConditions: config.EXCLUDE_CONDITIONS,
      sizes: config.SIZES,
      requireImages: true,
    });
  }

  private async fetchFromAPI(keyword: string): Promise<VintedItem[]> {
    const url = `${this.baseURL}/api/v2/catalog/items`;
    const params = { search_text: keyword, order: 'newest_first', per_page: '96' };
    const headers: any = {
      'Accept': 'application/json, text/plain, */*',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Referer': `${this.baseURL}/`,
    };

    const cookies = this.cookieManager.load();
    if (cookies?.length) headers['Cookie'] = this.cookieManager.toAxiosHeaders(cookies);

    try {
      const response = await axios.get(url, { params, headers, timeout: 10000 });
      return this.parseAPIResponse(response.data);
    } catch (error: any) {
      if (error.response?.status === 401) console.error('❌ Error 401 en API');
      return [];
    }
  }

  private parseAPIResponse(data: any): VintedItem[] {
    const items: VintedItem[] = [];
    if (!data.items || !Array.isArray(data.items)) return items;
    data.items.forEach((item: any, index: number) => {
      if (!item.id || !item.title) return;
      const photos = item.photos || [];
      const photoUrls = photos.map((p: any) => p.url).filter(Boolean);
      items.push({
        id: item.id,
        title: item.title,
        price: parseFloat((item.price?.amount || item.total_item_price?.amount || '0').toString().replace(',', '.')),
        currency: item.price?.currency_code || 'EUR',
        brand: item.brand_title || '',
        size: item.size_title || '',
        condition: item.status || '',
        url: item.path?.startsWith('http') ? item.path : `${this.baseURL}${item.path}`,
        photo_url: photoUrls[0] || '',
        photo_urls: photoUrls,
        seller: { id: item.user?.id || 0, login: item.user?.login || 'Unknown', business: item.user?.business || false, feedback_reputation: 0, feedback_count: 0 },
        created_at: new Date().toISOString(),
        location: item.user?.country_title || '',
        original_index: index
      });
    });
    return items;
  }

  private async fetchHTMLViaAxios(keyword: string, useCookies: boolean = true): Promise<{ items: VintedItem[], html: string }> {
    const searchUrl = `${this.baseURL}/catalog?search_text=${encodeURIComponent(keyword)}&order=newest_first`;
    const headers: any = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Referer': `${this.baseURL}/`,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    };
    if (useCookies) {
      const cookies = this.cookieManager.load();
      if (cookies?.length) headers['Cookie'] = this.cookieManager.toAxiosHeaders(cookies);
    }
    try {
      const response = await axios.get(searchUrl, { headers, timeout: 15000 });
      const html = response.data;
      this.lastHtml = html;
      return { items: this.parseItemsFromHTML(html), html };
    } catch (error: any) {
      return { items: [], html: '' };
    }
  }

  private parseItemsFromHTML(html: string): VintedItem[] {
    try {
      // Intento 1: NEXT_DATA JSON (más rápido y completo)
      const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
      if (match) {
        const data = JSON.parse(match[1]);
        const pageProps = data.props.pageProps;
        const nextItems = pageProps.items || pageProps.catalogItems?.data || pageProps.search_results?.items || [];

        if (nextItems.length > 0) {
          return nextItems.map((item: any, index: number) => ({
            id: item.id,
            title: item.title,
            price: parseFloat((item.price?.amount || item.price || 0).toString().replace(',', '.')),
            currency: item.price?.currency_code || 'EUR',
            brand: item.brand_title || '',
            size: item.size_title || '',
            condition: item.status || '',
            url: `${this.baseURL}${item.path}`,
            photo_url: item.photo?.url || '',
            photo_urls: item.photo ? [item.photo.url] : [],
            seller: { id: item.user?.id || 0, login: item.user?.login || 'Unknown', business: item.user?.business || false, feedback_reputation: 0, feedback_count: 0 },
            created_at: new Date().toISOString(),
            original_index: index
          }));
        }
      }

      // Intento 2: Fallback DOM Parsing (Más robusto para Puppeteer)
      console.log('🔄 NEXT_DATA no encontrado o vacío, intentando parseo manual del DOM...');
      // Usamos una aproximación simple con regex para extraer datos básicos si el JSON falla
      const items: VintedItem[] = [];

      // Buscamos bloques de items en el HTML
      const itemBlocks = html.split('data-testid="grid-item"').slice(1);
      console.log(`📦 Encontrados ${itemBlocks.length} bloques potenciales de items`);

      itemBlocks.forEach((block, index) => {
        try {
          // Extraemos el ID real del item del data-testid
          const idMatch = block.match(/data-testid="product-item-id-(\d+)"/);
          const itemId = idMatch ? parseInt(idMatch[1]) : Math.floor(Math.random() * 1000000000);

          const urlMatch = block.match(/href="([^"]+)"/);
          const titleMatch = block.match(/title="([^"]+)"/) || block.match(/alt="([^"]+)"/);
          const priceMatch = block.match(/data-testid="[^"]+--price-text">([^<]+)<\/p>/) || block.match(/aria-label="([^"]+)"/);
          const imgMatch = block.match(/src="([^"]+)"/);

          if (urlMatch && (titleMatch || priceMatch)) {
            let priceStr = '0';
            if (priceMatch) {
              const priceExtracted = priceMatch[1].match(/[\d,.]+/);
              if (priceExtracted) priceStr = priceExtracted[0];
            }

            const titleFull = titleMatch ? titleMatch[1] : 'Item Vinted';
            let brand = '';
            if (titleFull.includes('brand: ')) {
              brand = titleFull.split('brand: ')[1].split(',')[0].trim();
            }

            // Intentar extraer una mini descripción del atributo 'title' si es rico en información
            let description = '';
            if (titleFull.includes(',')) {
              description = titleFull; // A menudo el 'title' contiene Brand, Size, Condition, Price
            }

            let currency = 'EUR';
            if (priceMatch) {
              const p = priceMatch[1].toUpperCase();
              if (p.includes('RON')) currency = 'RON';
              else if (p.includes('PLN')) currency = 'PLN';
              else if (p.includes('HUF')) currency = 'HUF';
              else if (p.includes('CZK')) currency = 'CZK';
              else if (p.includes('£') || p.includes('GBP')) currency = 'GBP';
              else if (p.includes('SEK')) currency = 'SEK';
            }

            // Inferir localización básica si no existe
            let location = '';
            if (currency === 'RON') location = 'Romania';
            else if (currency === 'PLN') location = 'Poland';
            else if (this.baseURL.includes('.it')) location = 'Italia';

            items.push({
              id: itemId,
              title: titleFull.split(', brand:')[0].trim(),
              price: parseFloat(priceStr.replace(',', '.')),
              currency: currency,
              brand: brand,
              size: titleFull.includes('mărime: ') ? titleFull.split('mărime: ')[1].split(',')[0].trim() : (titleFull.includes('taglia: ') ? titleFull.split('taglia: ')[1].split(',')[0].trim() : ''),
              condition: titleFull.includes('stare: ') ? titleFull.split('stare: ')[1].split(',')[0].trim() : (titleFull.includes('condizioni: ') ? titleFull.split('condizioni: ')[1].split(',')[0].trim() : ''),
              url: urlMatch[1].startsWith('http') ? urlMatch[1] : `${this.baseURL}${urlMatch[1]}`,
              photo_url: imgMatch ? imgMatch[1] : '',
              photo_urls: imgMatch ? [imgMatch[1]] : [],
              description: description,
              location: location,
              seller: { id: 0, login: 'Unknown', business: false, feedback_reputation: 0, feedback_count: 0 },
              created_at: new Date().toISOString(),
              original_index: index
            });
          }
        } catch (e) {
          console.error(`⚠️ Error parseando bloque ${index}:`, e);
        }
      });

      return items;
    } catch (e) {
      console.error('❌ Error parseando HTML:', e);
    }
    return [];
  }

  public getSignedPhotoUrl(html: string, itemIndex: number): string {
    try {
      const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
      if (!match) return '';
      const data = JSON.parse(match[1]);
      const items = data.props.pageProps.items || data.props.pageProps.catalogItems?.data || data.props.pageProps.search_results?.items || [];
      return items[itemIndex]?.photo?.high_resolution?.url || '';
    } catch (error) { return ''; }
  }

  public async downloadPhoto(signedUrl: string): Promise<Buffer> {
    const res = await axios.get(signedUrl, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Referer': `${this.baseURL}/`
      },
      timeout: 10000
    });
    return Buffer.from(res.data);
  }

  private browser: Browser | null = null;
  private page: Page | null = null;

  private async getBrowserPage(): Promise<{ browser: Browser; page: Page }> {
    if (this.browser && this.page && this.browser.isConnected()) {
      return { browser: this.browser, page: this.page };
    }

    console.log('🚀 Iniciando nueva sesión de navegador persistente...');
    this.browser = await puppeteer.launch({
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--window-size=1280,800', // Tamaño de ventana más estándar
        '--disable-features=IsolateOrigins,site-per-process',
        '--blink-settings=imagesEnabled=true'
      ],
      ignoreHTTPSErrors: true,
      defaultViewport: { width: 1280, height: 800 }, // Forzar viewport para evitar zoom/corte
      userDataDir: path.join(process.cwd(), 'browser_data')
    });

    this.page = await this.browser.newPage();

    // Evitar detección de webdriver y añadir plugins falsos
    await this.page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['it-IT', 'it', 'en-US', 'en'] });
    });

    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];
    const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];
    await this.page.setUserAgent(randomUA);
    await this.page.setViewport({ width: 1920 + Math.floor(Math.random() * 100), height: 1080 + Math.floor(Math.random() * 100) });

    const cookies = this.cookieManager.load();
    if (cookies?.length) {
      const puppeteerCookies = cookies.map((c: any) => ({
        name: c.name, value: c.value, domain: c.domain, path: c.path || '/',
        secure: c.secure || false, httpOnly: c.httpOnly || false, sameSite: c.sameSite || 'Lax'
      }));
      await this.page.setCookie(...puppeteerCookies);
    }

    return { browser: this.browser, page: this.page };
  }

  private async waitForCloudflare(page: Page): Promise<void> {
    try {
      const cloudflareDetected = await page.evaluate(() => document.body.innerText.includes('Verifying you are human'));
      if (!cloudflareDetected) return;

      console.log('🛑 CAPTCHA DE CLOUDFLARE DETECTADO');
      console.log('🤖 Intentando resolver automáticamente...');

      // Intentar clicar el checkbox dentro del iframe de Turnstile
      const frames = page.frames();
      for (const frame of frames) {
        try {
          const checkbox = await frame.$('input[type="checkbox"]');
          if (checkbox) {
            await checkbox.click();
            console.log('✅ Click enviado al checkbox de Cloudflare');
            await new Promise(r => setTimeout(r, 5000));
          }
        } catch (e) { }
      }

      console.log('⏳ Esperando resolución del CAPTCHA (máximo 5 minutos)...');
      console.log('👉 Si ves la ventana del navegador, resuelve el CAPTCHA manualmente');

      await page.waitForFunction(
        () => !document.body.innerText.includes('Verifying you are human'),
        { timeout: 300000, polling: 3000 }
      );
      console.log('✅ CAPTCHA resuelto, continuando...');
      await new Promise(r => setTimeout(r, 5000)); // Espera larga tras resolución
    } catch (e: any) {
      if (e.message?.includes('timeout')) {
        console.error('❌ Tiempo de espera agotado para resolver el CAPTCHA');
      }
    }
  }

  public async searchItems(keyword: string): Promise<{ items: VintedItem[], html: string }> {
    // 1. Intentar con Axios
    const axiosResult = await this.fetchHTMLViaAxios(keyword, true);
    if (axiosResult.items.length > 0) return axiosResult;

    // 2. Intentar con API
    const apiItems = await this.fetchFromAPI(keyword);
    if (apiItems.length > 0) return { items: apiItems, html: '' };

    // 3. Fallback Puppeteer (Salta Cloudflare)
    console.log(`🔍 Usando Puppeteer persistente para (${keyword})...`);
    try {
      const { browser, page } = await this.getBrowserPage();
      const searchUrl = `${this.baseURL}/catalog?search_text=${encodeURIComponent(keyword)}&order=newest_first`;

      // Solo navegar a la Home la primera vez para establecer sesión
      if (!this.browserInitialized) {
        console.log('🏠 Primera ejecución: navegando a Home para establecer sesión...');
        await page.goto(this.baseURL, { waitUntil: 'networkidle2', timeout: 60000 });
        await new Promise(r => setTimeout(r, 5000));

        // Manejar popups de Vinted (Cookies y Selección de país)
        try {
          const cookieButton = await page.$('#onetrust-accept-btn-handler');
          if (cookieButton) {
            await cookieButton.click();
            console.log('✅ Cookies aceptadas');
            await new Promise(r => setTimeout(r, 2000));
          }
          const closeSelectors = ['[data-testid="country-select-modal"] button[aria-label="Close"]', '.web_ui__Modal__close', '[data-testid="modal-close"]'];
          for (const selector of closeSelectors) {
            const closeButton = await page.$(selector);
            if (closeButton) {
              await closeButton.click();
              console.log(`✅ Popup cerrado (${selector})`);
              await new Promise(r => setTimeout(r, 2000));
              break;
            }
          }
        } catch (e) { }

        // Detectar y esperar resolución de Cloudflare
        await this.waitForCloudflare(page);
        this.browserInitialized = true;
      }

      // Navegar al catálogo de búsqueda
      await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });
      await new Promise(r => setTimeout(r, 3000));

      // Verificar Cloudflare y errores de Vinted (con más variantes de mensajes)
      const content = await page.content();
      const hasOopsError = content.includes('Oops! Something went wrong') ||
        content.includes('experienced some technical difficulties') ||
        content.includes('Access Denied') ||
        content.includes('403 Forbidden');

      if (hasOopsError) {
        console.error('⚠️ Vinted bloqueó la sesión o hubo un error técnico. Limpiando para reintento limpio...');
        if (this.browser) {
          try {
            await this.browser.close();
          } catch (e) { }
          this.browser = null;
          this.page = null;
          this.browserInitialized = false;
        }
        return { items: [], html: content };
      }

      await this.waitForCloudflare(page);

      // Captura de pantalla para depuración
      const screenshotPath = path.join(process.cwd(), `debug-search-${keyword.substring(0, 10)}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`📸 Screenshot guardado: ${screenshotPath}`);

      const html = await page.content();
      this.lastHtml = html;
      const items = this.parseItemsFromHTML(html);
      console.log(`📦 Puppeteer encontró ${items.length} items para "${keyword}"`);

      // NO cerrar el navegador - mantener sesión persistente
      return { items, html };
    } catch (error: any) {
      console.error(`❌ Error en Puppeteer: ${error.message}`);
      // Si hay error crítico, resetear el navegador
      if (this.browser) {
        try { await this.browser.close(); } catch (e) { }
        this.browser = null;
        this.page = null;
        this.browserInitialized = false;
      }
      return { items: [], html: '' };
    }
  }

  public filterItems(items: VintedItem[]): VintedItem[] {
    return items.filter(item => {
      const result = this.advancedFilter.filterItem(item);
      if (!result.passed) {
        // Log solo si es verboso o debug para no saturar
        // console.log(`  - ❌ Item ${item.id} rechazado: ${result.reasons.join(', ')}`);
        return false;
      }
      return true;
    });
  }

  public updateFilterConfig(newConfig: Partial<FilterConfig>): void {
    this.advancedFilter.updateConfig(newConfig);
    logger.info('Configuración de filtros actualizada', newConfig, 'FILTERS');
  }
}

export default VintedAPI;
