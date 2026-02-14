import puppeteer from 'puppeteer-extra';
import { Browser } from 'puppeteer';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import axios from 'axios';
import { config } from './config';
import { CookieManager } from './cookies';
import { AdvancedFilter, FilterConfig, FilterResult } from './filters';
import { logger } from './logger';
import { handleCookieConsent } from './browser-helper';

puppeteer.use(StealthPlugin());

export interface VintedItem {
  id: number;
  title: string;
  price: number;
  currency: string;
  brand: string;
  size: string;
  condition: string;
  url: string;
  photo_url?: string;
  photo_urls?: string[]; // Soporta múltiples fotos
  description?: string; // Descripción completa del producto
  seller: {
    id: number;
    login: string;
    business: boolean;
    feedback_reputation: number;
    feedback_count: number;
  };
  created_at: string;
  time_ago?: string; // "5 minuti fa", etc.
  location?: string; // "Italia", "Francia", etc.
}

export class VintedAPI {
  private cookieManager: CookieManager;
  private baseURL: string;
  private advancedFilter: AdvancedFilter;
  private browser: Browser | null = null;

  constructor(filterConfig?: FilterConfig) {
    this.cookieManager = new CookieManager(config.COOKIE_FILE);
    this.baseURL = config.VINTED_BASE_URL;

    // Usar configuración de filtros avanzados o configuración básica
    const configToUse = filterConfig || {
      maxPrice: config.MAX_PRICE,
      excludeKeywords: ['bambino', 'bambina', 'kids', 'child'], // Excluir ropa de niños por defecto
      requireImages: true
    };

    this.advancedFilter = new AdvancedFilter(configToUse);
    logger.info('Filtros avanzados inicializados', configToUse, 'FILTERS');
  }

  public async getBrowser(): Promise<Browser> {
    if (this.browser) {
      try {
        // Verificar si el browser sigue vivo
        await this.browser.version();
        return this.browser;
      } catch (e) {
        console.log('🔄 Browser anterior cerrado o muerto, iniciando uno nuevo...');
        this.browser = null;
      }
    }

    const args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor,LibvpxVp8IncrementalDecoding,WebRtcHideLocalIpsWithMdns,GpuProcessHighPriority',
      '--disable-crash-reporter',
      '--disable-crashpad',
      '--disable-breakpad',
      '--single-process',
      '--use-gl=swiftshader',
      '--crash-dumps-dir=/tmp/crash_dumps'
    ];

    console.log(`🚀 Lanzando browser con args: ${args.join(' ')}`);

    this.browser = await puppeteer.launch({
      headless: 'new', // Volviendo a 'new' que es más moderno
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
      userDataDir: '/tmp/puppeteer_user_data',
      args
    });
    return this.browser;
  }

  public async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      console.log('🛑 Browser de VintedAPI cerrado');
    }
  }

  private async fetchFromAPI(keyword: string): Promise<VintedItem[]> {
    try {
      const cookies = this.cookieManager.load();
      if (cookies.length === 0) {
        console.log('⚠️ No hay cookies para la API. Intentando obtenerlas...');
        return [];
      }

      const cookieHeader = this.cookieManager.toAxiosHeaders(cookies);
      const url = `${this.baseURL}/api/v2/catalog/items`;

      // Extraer el Bearer token (access_token_web) de las cookies
      const accessTokenCookie = cookies.find(c => c.name === 'access_token_web');
      const vudtCookie = cookies.find(c => c.name === 'v_udt');

      console.log(`📡 Consultando API Vinted (${this.baseURL}): ${url}?search_text=${encodeURIComponent(keyword)}`);

      const headers: any = {
        'Cookie': cookieHeader,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
        'x-app-version': '23.0.0',
        'x-cross-site-proxy': 'false'
      };

      if (accessTokenCookie) {
        headers['Authorization'] = `Bearer ${accessTokenCookie.value}`;
      }

      if (vudtCookie) {
        headers['x-v-udt'] = vudtCookie.value;
      }

      const response = await axios.get(url, {
        params: {
          search_text: keyword,
          order: 'newest_first',
          per_page: '24'
        },
        headers,
        timeout: 10000
      });

      if (response.data && response.data.items) {
        console.log(`✅ API retornó ${response.data.items.length} items`);

        return response.data.items.map((item: any) => ({
          id: item.id,
          title: item.title,
          price: parseFloat(item.price?.amount || item.total_item_price?.amount || '0'),
          currency: item.price?.currency_code || 'EUR',
          brand: item.brand_title || '',
          size: item.size_title || '',
          condition: item.status || '',
          url: `https://www.vinted.it${item.path || `/items/${item.id}`}`,
          photo_url: item.photo?.url || '',
          photo_urls: item.photos?.map((p: any) => p.url) || [],
          description: item.description || '',
          seller: {
            id: item.user?.id || 0,
            login: item.user?.login || '',
            business: item.user?.business || false,
            feedback_reputation: item.user?.feedback_reputation || 0,
            feedback_count: item.user?.feedback_count || 0
          },
          created_at: new Date(item.photo?.high_resolution?.timestamp * 1000 || Date.now()).toISOString(),
          time_ago: 'Appena postato', // La API no suele dar el string relativo directamente
          location: item.user?.country_title || item.location_title || item.user?.city || ''
        }));
      }

      return [];
    } catch (error: any) {
      console.error(`❌ Error en fetchFromAPI: ${error.message}`);
      if (error.response?.status === 401 || error.response?.status === 403) {
        console.error('🛑 API bloqueada o cookies inválidas (401/403)');
      }
      return [];
    }
  }

  /**
   * Parsea los items directamente del HTML usando regex (súper rápido y evita Cloudflare)
   */
  private parseItemsFromHTML(html: string): VintedItem[] {
    const items: VintedItem[] = [];
    try {
      // 1. Buscar el bloque de JSON en el payload de Next.js o INITIAL_STATE
      // El patrón de Vinted para items suele ser un objeto con id, title, price, etc.
      // Usamos un regex global para encontrar todos los objetos que parezcan items
      const itemRegex = /\{"id":(\d+),"title":"([^"]+)","price":\{"amount":"([^"]+)","currency_code":"([^"]+)"\},"brand_title":"([^"]*)","size_title":"([^"]*)","status":"([^"]*)","url":"([^"]+)","photo":\{"id":\d+,"url":"([^"]+)"\}/g;

      let match;
      while ((match = itemRegex.exec(html)) !== null) {
        items.push({
          id: parseInt(match[1]),
          title: match[2],
          price: parseFloat(match[3].replace(',', '.')),
          currency: match[4],
          brand: match[5],
          size: match[6],
          condition: match[7],
          url: match[8].startsWith('http') ? match[8] : `https://www.vinted.it${match[8]}`,
          photo_url: match[9].replace(/\\\//g, '/'),
          photo_urls: [match[9].replace(/\\\//g, '/')],
          seller: { id: 0, login: 'Unknown', business: false, feedback_reputation: 0, feedback_count: 0 },
          created_at: new Date().toISOString()
        });
      }

      // 2. Si el anterior falla, intentar con un regex más flexible para el JSON de Vinted 2024/2025
      if (items.length === 0) {
        // Buscar bloques que contengan "path" e "items"
        const jsonBlocks = html.match(/\{"id":\d+,"title":[\s\S]*?,"path":"\/items\/\d+-[^"]+"/g);
        if (jsonBlocks) {
          for (const block of jsonBlocks) {
            try {
              // Limpiar posibles escapes de Next.js
              const cleanBlock = block.replace(/\\"/g, '"').replace(/\\\//g, '/');
              const item = JSON.parse(cleanBlock + '}'); // El regex corta antes del cierre total
              items.push({
                id: item.id,
                title: item.title,
                price: parseFloat((item.price?.amount || item.total_item_price?.amount || '0').toString().replace(',', '.')),
                currency: item.price?.currency_code || 'EUR',
                brand: item.brand_title || '',
                size: item.size_title || '',
                condition: item.status || '',
                url: item.path.startsWith('http') ? item.path : `https://www.vinted.it${item.path}`,
                photo_url: item.photo?.url || '',
                photo_urls: item.photos?.map((p: any) => p.url) || (item.photo?.url ? [item.photo.url] : []),
                seller: {
                  id: item.user?.id || 0,
                  login: item.user?.login || item.user_login || 'Unknown',
                  business: item.user?.business || false,
                  feedback_reputation: 0,
                  feedback_count: 0
                },
                created_at: new Date().toISOString(),
                location: item.user?.country_title || item.user?.city || item.location_title || ''
              });
            } catch (e) { }
          }
        }
      }

      console.log(`🎯 Parser encontró ${items.length} items en el HTML`);
      return items;
    } catch (error) {
      console.error('❌ Error parseando HTML:', error);
      return [];
    }
  }

  /**
   * Intenta obtener items scrapeando el HTML con Axios (más ligero que Puppeteer y menos bloqueado)
   */
  private async fetchHTMLViaAxios(keyword: string, useCookies: boolean = false): Promise<VintedItem[]> {
    try {
      const url = `${this.baseURL}/catalog?search_text=${encodeURIComponent(keyword)}&order=newest_first`;
      const cookies = useCookies ? this.cookieManager.load() : [];
      const cookieHeader = useCookies ? this.cookieManager.toAxiosHeaders(cookies) : '';

      console.log(`📡 Consultando HTML vía Axios (${useCookies ? 'con' : 'SIN'} cookies) en ${this.baseURL}`);

      const headers: any = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Referer': `${this.baseURL}/`
      };

      if (useCookies && cookieHeader) {
        headers['Cookie'] = cookieHeader;
      }

      const response = await axios.get(url, {
        headers,
        timeout: 15000,
        validateStatus: (status) => status < 500
      });

      if (response.status === 403) {
        console.error(`🛑 Axios HTML recibió 403 en ${this.baseURL}`);
        return [];
      }

      const html = response.data;
      if (typeof html !== 'string') return [];

      if (html.includes('id="challenge-platform"') || html.includes('captcha')) {
        console.error('🛑 Axios HTML detectó Cloudflare Challenge');
        return [];
      }

      return this.parseItemsFromHTML(html);
    } catch (error: any) {
      console.error(`❌ Error en fetchHTMLViaAxios: ${error.message}`);
      return [];
    }
  }

  public async searchItems(keyword: string): Promise<VintedItem[]> {
    // 1. Intentar con Axios HTML (SIN cookies - método más robusto en .ro)
    try {
      const axiosItems = await this.fetchHTMLViaAxios(keyword, false);
      if (axiosItems.length > 0) {
        return axiosItems;
      }
    } catch (error) {
      console.log('⚠️ Error en bypass .ro SIN cookies, intentando con cookies...');
    }

    // 2. Intentar con la API (Fallback secundario)
    try {
      const apiItems = await this.fetchFromAPI(keyword);
      if (apiItems.length > 0) {
        return apiItems;
      }
    } catch (apiError) {
      console.log('⚠️ Error en API...');
    }

    // 3. Fallback final desesperado: Puppeteer
    console.log('⚠️ Iniciando fallback de browser como última opción...');
    const browser = await this.getBrowser();

    try {
      const page = await browser.newPage();

      // Configurar user agent y viewport
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setViewport({ width: 1366, height: 768 });

      // Cargar cookies
      const cookies = this.cookieManager.load();
      if (cookies.length > 0) {
        const puppeteerCookies = this.cookieManager.toPuppeteerCookies(cookies);
        await page.setCookie(...puppeteerCookies);
        console.log(`🍪 Cookies cargadas: ${cookies.length}`);
      } else {
        console.log(`⚠️ No se encontraron cookies en ${config.COOKIE_FILE}. Continuando sin sesión.`);
      }

      // Añadir un retardo aleatorio pequeño para parecer más humano
      const jitter = Math.floor(Math.random() * 3000) + 1000;
      await new Promise(resolve => setTimeout(resolve, jitter));

      // Navegar a la página con timeout aumentado y reintentos
      const searchUrl = `${this.baseURL}/catalog?search_text=${encodeURIComponent(keyword)}&order=newest_first`;
      console.log(`🔍 Navegando a: ${searchUrl}`);

      let navigationSuccess = false;
      let attempts = 0;
      const maxAttempts = 3;

      while (!navigationSuccess && attempts < maxAttempts) {
        attempts++;
        console.log(`🔄 Intento ${attempts}/${maxAttempts}`);

        try {
          // Usar un timeout más largo y esperar a que la red esté tranquila
          await page.goto(searchUrl, {
            waitUntil: 'networkidle2',
            timeout: 60000
          });

          // Check for Cloudflare
          const pageTitle = await page.title();
          const pageContent = await page.content();
          if (pageTitle.includes('Just a moment') || pageContent.includes('challenge-platform')) {
            console.error('🛑 CLOUDFLARE BLOCK DETECTED (Just a moment...)');
            console.error('👉 ACTION REQUIRED: Run "npm run login" locally to generate valid cookies.');
            if (process.env.DEBUG_SCREENSHOT === 'true') {
              try { await page.screenshot({ path: 'cloudflare-block.png' }); } catch (e) { }
            }
            throw new Error('CLOUDFLARE_BLOCK');
          }

          await handleCookieConsent(page);
          navigationSuccess = true;
          console.log('✅ Navegación exitosa');
        } catch (navError: any) {
          console.log(`⚠️ Error en navegación (intento ${attempts}): ${navError.message}`);

          if (navError.message === 'CLOUDFLARE_BLOCK') {
            throw navError; // Stop retrying immediately if blocked
          }

          if (attempts < maxAttempts) {
            console.log('🔄 Esperando 5 segundos antes de reintentar...');
            await page.waitForTimeout(5000);

            // Intentar con waitUntil menos estricto
            try {
              await page.goto(searchUrl, {
                waitUntil: 'domcontentloaded',
                timeout: 90000 // 90 segundos
              });
              // ... (imports remain the same) ...

              await handleCookieConsent(page);
              navigationSuccess = true;
              console.log('✅ Navegación exitosa con domcontentloaded');
            } catch (secondError: any) {
              console.log(`❌ Segundo intento fallido: ${secondError.message}`);
            }
          }
        }
      }

      if (!navigationSuccess) {
        await page.close();
        throw new Error(`No se pudo navegar a ${searchUrl} después de ${maxAttempts} intentos`);
      }

      // Esperar un poco a que carguen los items
      await page.waitForTimeout(2000);

      // Screenshot solo en modo debug (evita I/O cada 4s en producción)
      if (process.env.DEBUG_SCREENSHOT === 'true') {
        await page.screenshot({ path: 'debug-screenshot.png', fullPage: true });
        console.log('📸 Screenshot guardado en debug-screenshot.png');
      }

      // Extraer items del DOM
      const items = await page.evaluate(() => {
        // Encontrar el contenedor principal de resultados (evita secciones laterales o de sugerencias)
        const catalogGrid = document.querySelector('[data-testid="catalog-grid"]') ||
          document.querySelector('.feed-grid') ||
          document.querySelector('.catalog-items') ||
          document.body;

        // Intentar diferentes selectores para los cards de items dentro del grid
        const selectors = [
          '[data-testid="item-card"]',
          '.ItemBox_root',
          '.feed-grid .item',
          '.catalog-item',
          'article[data-cy="item-card"]'
        ];

        let itemElements: Element[] = [];
        let foundSelector = '';

        for (const selector of selectors) {
          const found = Array.from(catalogGrid.querySelectorAll(selector));
          if (found.length > 0) {
            itemElements = found;
            foundSelector = selector;
            break;
          }
        }

        // Si no encontramos nada con selectores específicos, buscar selectores genéricos de cards
        if (itemElements.length === 0) {
          itemElements = Array.from(catalogGrid.querySelectorAll('.item-card, .grid-item, .product-card'));
          foundSelector = 'generic-card';
        }

        return {
          selector: foundSelector,
          count: itemElements.length,
          html: catalogGrid.outerHTML.substring(0, 5000)
        };
      });

      console.log(`🔍 Grid detectado con selector: ${items.selector}`);
      console.log(`📊 Elementos encontrados: ${items.count}`);

      // Si no encontramos elementos, devolver array vacío
      if (items.count === 0) {
        console.log('❌ No se encontraron elementos en el grid catalog');
        return [];
      }

      // Extraer datos de los elementos encontrados
      const extractedItems = await page.evaluate((itemSelector) => {
        const catalogGrid = document.querySelector('[data-testid="catalog-grid"]') ||
          document.querySelector('.feed-grid') ||
          document.querySelector('.catalog-items') ||
          document.body;

        const elements = Array.from(catalogGrid.querySelectorAll(itemSelector));
        const results: any[] = [];

        elements.forEach((element: any, index) => {
          try {
            // VERIFICACIÓN CRUCIAL: ¿Está este elemento dentro de una sección de "Sugeridos" o "Anuncios"?
            const parentSection = element.closest('section, div[class*="similar"], div[class*="suggested"], div[class*="liked"]');
            if (parentSection) {
              const sectionText = parentSection.textContent?.toLowerCase() || '';
              if (sectionText.includes('people also liked') ||
                sectionText.includes('suggested') ||
                sectionText.includes('similar') ||
                sectionText.includes('ti potrebbero piacere')) {
                return; // Ignorar recomendaciones
              }
            }

            // Buscar enlace al producto (elemento base para ID y URL)
            const link = element.querySelector('a[href*="/items/"]') || (element.tagName === 'A' ? element : null);
            if (!link || !link.href) return;

            // Extraer título - Buscar lo más descriptivo primero
            let title = '';
            const titleEl = element.querySelector('[data-testid="item-card-title"]') ||
              element.querySelector('.item-description__title') ||
              element.querySelector('img')?.alt ||
              element.querySelector('a')?.title;

            title = (titleEl?.textContent || titleEl?.alt || titleEl?.title || '').trim();
            if (!title) title = link.textContent?.split('€')[0]?.trim() || '';

            // Extraer precio - Solo dentro del card actual
            let price = 0;
            const priceEl = element.querySelector('[data-testid="item-card-price"]') ||
              element.querySelector('.price, .amount, [data-testid="price"], .cost');

            if (priceEl) {
              const priceText = priceEl.textContent || '';
              const priceMatch = priceText.match(/(\d+[.,]\d+|\d+)/);
              if (priceMatch) {
                price = parseFloat(priceMatch[1].replace(',', '.'));
              }
            }

            // Extraer fotos - ESTRICTAMENTE dentro de este card
            const photoUrls: string[] = [];
            const imgs = element.querySelectorAll('img');

            imgs.forEach((img: any) => {
              let src = img.getAttribute('data-src') || img.getAttribute('data-lazy') || img.src;
              if (src && src.length > 20 && !src.includes('base64')) {
                // Filtrar anuncios/logos (usando la lógica ya implementada)
                const isAd = src.toLowerCase().match(/(cms|asset|advertising|banner|logo|promo|marketing|avatar|placeholder|vinted\.png|cookie|onetrust)/i);
                if (!isAd && (src.includes('vinted.net/t/') || src.includes('f800') || src.includes('large'))) {
                  if (src.startsWith('//')) src = 'https:' + src;
                  if (!photoUrls.includes(src)) photoUrls.push(src);
                }
              }
            });

            if (title && price > 0) {
              // Extraer otros metadatos (marca, talla)
              const brand = element.querySelector('[data-testid="item-card-brand"]')?.textContent?.trim() || '';
              const size = element.querySelector('.taglia, .size, [data-testid="item-card-size"]')?.textContent?.trim() || '';

              results.push({
                id: parseInt(link.href.match(/\/items\/(\d+)/)?.[1] || '0'),
                title: title,
                price: price,
                currency: 'EUR',
                brand: brand,
                size: size,
                url: link.href,
                photo_url: photoUrls[0] || '',
                photo_urls: photoUrls,
                seller: { id: 0, login: 'Unknown', business: false },
                created_at: new Date().toISOString()
              });
            }
          } catch (e) {
            console.log(`❌ Error procesando ítem Puppeteer ${index}:`, e);
          }
        });

        return results;
      }, items.selector);

      console.log(`📦 Items extraídos (post-filtro): ${extractedItems.length}`);
      extractedItems.forEach((item, index) => {
        console.log(`  ${index + 1}. ${item.title} - ${item.price}€ (Fotos: ${item.photo_urls.length})`);
      });

      // Limpiar
      await page.close();

      return extractedItems;
    } catch (error: any) {
      if (error.message === 'CLOUDFLARE_BLOCK') {
        console.error('❌ Aborting search due to Cloudflare block.');
      } else {
        console.error(`❌ Error en searchItems para "${keyword}":`, error.message);
      }
      return [];
    }
  }

  public filterItems(items: VintedItem[], keyword: string | string[], maxPrice: number): VintedItem[] {
    const keywords = Array.isArray(keyword) ? keyword : [keyword];
    console.log(`\n🔍 Filtrando ${items.length} items con filtros avanzados:`);
    console.log(`  - Keywords: ${keywords.map(k => `"${k}"`).join(', ')}`);
    if (this.advancedFilter['config'].brands) console.log(`  - Marcas permitidas: ${this.advancedFilter['config'].brands.join(', ')}`);
    if (this.advancedFilter['config'].sizes) console.log(`  - Tallas permitidas: ${this.advancedFilter['config'].sizes.join(', ')}`);
    console.log(`  - Max Price: ${maxPrice}€`);

    const pairs: { item: VintedItem; result: FilterResult }[] = [];
    const titleLower = (t: string) => t.toLowerCase();

    items.forEach((item, index) => {
      const matchesKeyword = keywords.some(k => titleLower(item.title).includes(titleLower(k)));
      const withinBudget = item.price <= maxPrice;

      if (!matchesKeyword || !withinBudget) return;

      const filterResult = this.advancedFilter.filterItem(item);

      console.log(`\nItem ${index + 1}:`);
      console.log(`  - Título: "${item.title}"`);
      console.log(`  - Precio: ${item.price}€`);
      console.log(`  - Marca: ${item.brand || 'N/A'}`);
      console.log(`  - Talla: ${item.size || 'N/A'}`);
      console.log(`  - Estado: ${item.condition || 'N/A'}`);
      console.log(`  - Score: ${filterResult.score}/100`);
      console.log(`  - ✅ Pasa filtros: ${filterResult.passed}`);

      if (!filterResult.passed) {
        console.log(`  - ❌ Razones: ${filterResult.reasons.join(', ')}`);
      }

      if (filterResult.passed) {
        pairs.push({ item, result: filterResult });
        logger.info('Item pasó filtros avanzados', {
          id: item.id,
          title: item.title.substring(0, 50),
          score: filterResult.score,
          reasons: filterResult.reasons
        }, 'FILTERS');
      }
    });

    // Ordenar por score (mayor a menor) y devolver solo items
    pairs.sort((a, b) => b.result.score - a.result.score);
    const filteredItems = pairs.map(p => p.item);

    console.log(`\n✅ ${filteredItems.length} items pasan todos los filtros`);
    if (filteredItems.length > 0) {
      console.log('\n📊 Items ordenados por score:');
      pairs.forEach((p, index) => {
        const score = p.result?.score ?? 0;
        console.log(`  ${index + 1}. ${p.item.title.substring(0, 40)}... - Score: ${score}/100`);
      });
    }

    return filteredItems;
  }

  // Método para actualizar configuración de filtros en tiempo de ejecución
  public updateFilterConfig(newConfig: Partial<FilterConfig>): void {
    this.advancedFilter.updateConfig(newConfig);
    logger.info('Configuración de filtros actualizada', newConfig, 'FILTERS');
  }

  // Método para obtener configuración actual
  public getFilterConfig(): FilterConfig {
    return this.advancedFilter.getConfig();
  }
}

export default VintedAPI;
