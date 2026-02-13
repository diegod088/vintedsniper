import puppeteer from 'puppeteer-extra';
import { Browser } from 'puppeteer';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
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

  public async searchItems(keyword: string): Promise<VintedItem[]> {
    const browser = await this.getBrowser();

    try {
      const page = await browser.newPage();

      // Configurar user agent y viewport
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setViewport({ width: 1366, height: 768 });

      // Cargar cookies
      const cookies = JSON.parse(fs.readFileSync(config.COOKIE_FILE, 'utf8'));
      await page.setCookie(...cookies);
      console.log(`🍪 Cargadas ${cookies.length} cookies desde ${config.COOKIE_FILE}`);

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
          await page.goto(searchUrl, {
            waitUntil: 'networkidle2',
            timeout: 120000 // 120 segundos
          });
          await handleCookieConsent(page);
          navigationSuccess = true;
          console.log('✅ Navegación exitosa');
        } catch (navError: any) {
          console.log(`⚠️ Error en navegación (intento ${attempts}): ${navError.message}`);

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
        // Intentar diferentes selectores para Vinted Italia
        const selectors = [
          '.ItemBox_root',
          '[data-testid="item-card"]',
          '.feed-grid .item',
          '.catalog-item',
          '.ItemBox',
          'article[data-cy="item-card"]',
          '.item-card',
          '.grid-item',
          '.product-card',
          'a[href*="/items/"]' // Cualquier enlace que vaya a un item
        ];

        let itemElements: NodeListOf<Element> | null = null;
        let foundSelector = '';

        for (const selector of selectors) {
          itemElements = document.querySelectorAll(selector);
          if (itemElements.length > 0) {
            foundSelector = selector;
            break;
          }
        }

        // Si no encontramos nada con selectores específicos, buscar todos los enlaces a items
        if (!itemElements || itemElements.length === 0) {
          itemElements = document.querySelectorAll('a[href*="/items/"]');
          foundSelector = 'a[href*="/items/"]';
        }

        return {
          selector: foundSelector,
          count: itemElements ? itemElements.length : 0,
          html: document.documentElement.outerHTML.substring(0, 5000) // Primeros 5000 chars del HTML
        };
      });

      console.log(`🔍 Selector usado: ${items.selector}`);
      console.log(`📊 Elementos encontrados: ${items.count}`);
      console.log(`📄 HTML preview: ${items.html.substring(0, 500)}...`);

      // Si no encontramos elementos, devolver array vacío
      if (items.count === 0) {
        console.log('❌ No se encontraron elementos para extraer');
        return [];
      }

      // Extraer datos de los elementos encontrados
      const extractedItems = await page.evaluate((selector) => {
        const elements = document.querySelectorAll(selector);
        const results: any[] = [];

        elements.forEach((element: any, index) => {
          try {
            // Si es un enlace, buscar información en el elemento o sus padres
            if (element.tagName === 'A' && element.href) {
              // Buscar título y precio en el enlace o sus hijos
              let title = '';
              let price = 0;

              // Intentar diferentes fuentes para el título
              title = element.textContent ||
                element.title ||
                element.getAttribute('aria-label') ||
                element.querySelector('img')?.alt || '';

              // Extraer URL de la foto con múltiples métodos mejorados
              let photoUrls: string[] = [];

              console.log(`     🔍 Extrayendo imágenes del item ${index + 1}...`);

              // Buscar todas las imágenes en el elemento actual y padres
              let imgs = element.querySelectorAll('img');

              // Si no hay imágenes, buscar en elementos padre
              if (imgs.length === 0) {
                let parent = element.parentElement;
                let attempts = 0;
                while (parent && attempts < 5) {
                  imgs = parent.querySelectorAll('img');
                  if (imgs.length > 0) {
                    console.log(`     📸 Encontradas ${imgs.length} imágenes en elemento padre (nivel ${attempts + 1})`);
                    break;
                  }
                  parent = parent.parentElement;
                  attempts++;
                }
              } else {
                console.log(`     📸 Encontradas ${imgs.length} imágenes en elemento actual`);
              }

              // Extraer URLs de todas las imágenes encontradas
              if (imgs.length > 0) {
                imgs.forEach((img: any, imgIndex: number) => {
                  // Intentar múltiples atributos para obtener la URL
                  let photoUrl = img.src ||
                    img.getAttribute('data-src') ||
                    img.getAttribute('data-lazy') ||
                    img.getAttribute('data-original') ||
                    img.getAttribute('data-image-src') ||
                    img.getAttribute('data-lazy-src') ||
                    '';

                  // Intentar extraer de srcset si está disponible
                  if (!photoUrl && img.srcset) {
                    const srcsetParts = img.srcset.split(',');
                    if (srcsetParts.length > 0) {
                      // Tomar la URL de mayor resolución (última en srcset)
                      const lastSrcset = srcsetParts[srcsetParts.length - 1].trim();
                      photoUrl = lastSrcset.split(' ')[0];
                    }
                  }

                  // Si aún no hay URL, intentar desde srcset del primer elemento
                  if (!photoUrl && img.getAttribute('srcset')) {
                    const srcset = img.getAttribute('srcset') || '';
                    const srcsetParts = srcset.split(',');
                    if (srcsetParts.length > 0) {
                      // Tomar la última (mayor resolución)
                      const lastPart = srcsetParts[srcsetParts.length - 1].trim();
                      photoUrl = lastPart.split(' ')[0];
                    }
                  }

                  // Intentar extraer de background-image del padre
                  if (!photoUrl) {
                    let parent = img.parentElement;
                    let attempts = 0;
                    while (parent && attempts < 3 && !photoUrl) {
                      if (parent.style && parent.style.backgroundImage) {
                        const bgImage = parent.style.backgroundImage;
                        const match = bgImage.match(/url\(['"]?([^'"]+)['"]?\)/);
                        if (match) {
                          photoUrl = match[1];
                          console.log(`     📸 URL extraída de background-image`);
                        }
                      }
                      parent = parent.parentElement;
                      attempts++;
                    }
                  }

                  console.log(`     📸 Imagen ${imgIndex + 1}: URL raw = ${photoUrl ? photoUrl : 'NO ENCONTRADA'}`);

                  // Convertir URLs relativas a absolutas
                  if (photoUrl && !photoUrl.startsWith('http')) {
                    if (photoUrl.startsWith('//')) {
                      photoUrl = `https:${photoUrl}`;
                    } else if (photoUrl.startsWith('/')) {
                      photoUrl = `https://www.vinted.it${photoUrl}`;
                    } else {
                      photoUrl = `https://www.vinted.it/${photoUrl}`;
                    }
                    console.log(`     📸 URL convertida a absoluta: ${photoUrl.substring(0, 80)}`);
                  }

                  // Limpiar URL de parámetros innecesarios pero mantener la URL completa
                  if (photoUrl) {
                    // Solo eliminar parámetros después de ?, no truncar la URL
                    let cleanUrl = photoUrl.split('?')[0];

                    // CRÍTICO: Asegurar que la URL tenga extensión de archivo
                    // Si la URL no termina en .webp, .jpg, .jpeg o .png, añadir .webp
                    if (!cleanUrl.match(/\.(webp|jpg|jpeg|png)$/i)) {
                      console.log(`     ⚠️ URL sin extensión detectada: ${cleanUrl}`);
                      // Vinted usa principalmente .webp
                      cleanUrl = cleanUrl + '.webp';
                      console.log(`     ✅ Extensión .webp añadida: ${cleanUrl}`);
                    }

                    console.log(`     📸 URL limpia: ${cleanUrl}`);
                    console.log(`     📸 Validación: vinted.net=${cleanUrl.includes('vinted.net')}, images=${cleanUrl.includes('images')}, length=${cleanUrl.length}`);

                    // Verificar que sea una URL de imagen válida y completa
                    // Aceptar URLs de vinted.net que contengan 'images' o terminen en .webp/.jpg/.jpeg/.png
                    const isVintedImage = cleanUrl.includes('vinted.net') &&
                      (cleanUrl.includes('images') ||
                        cleanUrl.match(/\.(webp|jpg|jpeg|png)$/i));

                    if (isVintedImage &&
                      cleanUrl.length > 50 && // URLs de imágenes suelen ser largas
                      !photoUrls.includes(cleanUrl)) {
                      photoUrls.push(cleanUrl);
                      console.log(`     ✅ URL válida agregada: ${cleanUrl.substring(0, 80)}`);
                    } else {
                      console.log(`     ❌ URL rechazada: isVintedImage=${isVintedImage}, length=${cleanUrl.length}, duplicate=${photoUrls.includes(cleanUrl)}`);
                    }
                  }
                });
              } else {
                console.log(`     ⚠️ No se encontraron imágenes para el item ${index + 1}`);
              }

              console.log(`Item ${index + 1}: title="${title.substring(0, 50)}...", price=${price}`);
              console.log(`     📸 Buscando imágenes...`);
              console.log(`     📸 Elemento tiene imágenes directas: ${element.querySelectorAll('img').length}`);
              console.log(`     📸 URLs encontradas: ${photoUrls.length} fotos`);
              if (photoUrls.length > 0) {
                photoUrls.forEach((url, i) => {
                  console.log(`        📸 Foto ${i + 1}: ${url.substring(0, 60)}...`);
                });
              }

              // Buscar precio en el texto del elemento o sus padres
              let priceElement = element;
              let attempts = 0;

              while (priceElement && attempts < 5) {
                const text = priceElement.textContent || '';
                const priceMatch = text.match(/(\d+,\d+|\d+\.\d+|\d+)\s*€/);
                if (priceMatch) {
                  price = parseFloat(priceMatch[1].replace(',', '.'));
                  break;
                }

                // Buscar en elementos con precios específicos
                const priceSelectors = ['.price', '.amount', '[data-testid="price"]', '.cost'];
                for (const sel of priceSelectors) {
                  const priceEl = priceElement.querySelector(sel);
                  if (priceEl) {
                    const priceText = priceEl.textContent || '';
                    const priceMatch = priceText.match(/(\d+,\d+|\d+\.\d+|\d+)\s*€/);
                    if (priceMatch) {
                      price = parseFloat(priceMatch[1].replace(',', '.'));
                      break;
                    }
                  }
                }

                priceElement = priceElement.parentElement;
                attempts++;
              }

              console.log(`Item ${index + 1}: title="${title.substring(0, 50)}...", price=${price}, photos=${photoUrls.length}`);

              if (title && price > 0) {
                // Intentar extraer marca, talla y estado si están embebidos en el título (formato Vinted ARIA/labels)
                let brand = '';
                let size = '';
                let condition = '';

                // Patrones comunes en Vinted IT/ES/FR
                const brandMatch = title.match(/brand:\s*([^,]+)/i);
                const sizeMatch = title.match(/(?:taglia|talla|taille|size):\s*([^,]+)/i);
                const conditionMatch = title.match(/(?:condizioni|estado|état|condition):\s*([^,]+)/i);

                if (brandMatch) brand = brandMatch[1].trim();
                if (sizeMatch) size = sizeMatch[1].trim();
                if (conditionMatch) condition = conditionMatch[1].trim();

                results.push({
                  id: parseInt(element.href.match(/\/items\/(\d+)/)?.[1] || '0'),
                  title: title.trim(),
                  price: price,
                  currency: 'EUR',
                  brand: brand,
                  size: size,
                  condition: condition,
                  url: element.href,
                  photo_url: photoUrls[0] || '', // Mantener compatibilidad con código existente
                  photo_urls: photoUrls, // Nuevo campo con múltiples fotos
                  seller: {
                    id: 0,
                    login: '',
                    business: false,
                    feedback_reputation: 0,
                    feedback_count: 0
                  },
                  created_at: new Date().toISOString(),
                });
              }
            }
          } catch (e) {
            console.log(`❌ Error procesando elemento ${index}:`, e);
          }
        });

        return results;
      }, items.selector);

      console.log(`📦 Items extraídos: ${extractedItems.length}`);
      extractedItems.forEach((item, index) => {
        console.log(`  ${index + 1}. ${item.title} - ${item.price}€`);
        if (item.photo_url) {
          console.log(`     📸 Foto principal: ${item.photo_url.substring(0, 100)}...`);
        } else {
          console.log(`     📸 Foto: NO DISPONIBLE`);
        }
        if (item.photo_urls && item.photo_urls.length > 1) {
          console.log(`     📸 Total fotos: ${item.photo_urls.length}`);
        }
      });

      // Limpiar
      await page.close();

      return extractedItems;
    } catch (error: any) {
      console.error(`❌ Error en searchItems para "${keyword}":`, error.message);
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
