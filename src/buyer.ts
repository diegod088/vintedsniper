import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { config } from './config';
import { CookieManager } from './cookies';

puppeteer.use(StealthPlugin());

export class VintedBuyer {
  private cookieManager: CookieManager;
  private baseURL: string;

  constructor() {
    this.cookieManager = new CookieManager(config.COOKIE_FILE);
    this.baseURL = config.VINTED_BASE_URL;
  }

  /**
   * Intenta comprar un item automáticamente (1-click buy)
   * Navega a la página de compra, pulsa el botón y confirma
   */
  public async buyItem(itemId: number): Promise<boolean> {
    const buyUrl = `${this.baseURL}/transaction/${itemId}/buy`;

    console.log(`🛒 Iniciando compra para item ${itemId}`);
    console.log(`🔗 URL: ${buyUrl}`);

    const browser = await puppeteer.launch({
      headless: 'new',
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080',
        '--disable-features=VizDisplayCompositor,LibvpxVp8IncrementalDecoding,WebRtcHideLocalIpsWithMdns,GpuProcessHighPriority',
        '--disable-crash-reporter',
        '--disable-crashpad',
        '--single-process',
        '--use-gl=swiftshader',
        '--crash-dumps-dir=/tmp'
      ],
    });

    try {
      const page = await browser.newPage();

      // Cargar cookies
      const cookies = this.cookieManager.load();
      if (cookies.length > 0) {
        const puppeteerCookies = this.cookieManager.toPuppeteerCookies(cookies);
        await page.setCookie(...puppeteerCookies);
        console.log(`🍪 Cookies cargadas: ${cookies.length}`);
      } else {
        console.warn('⚠️ No hay cookies disponibles. La compra probablemente fallará.');
      }

      // Configurar user agent
      await page.setUserAgent(
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      // Navegar a la página de compra
      console.log('📄 Cargando página de compra...');
      await page.goto(buyUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      // Esperar a que la página cargue completamente
      await page.waitForTimeout(2000);

      // Verificar si estamos logueados
      const currentUrl = page.url();
      if (currentUrl.includes('/login') || currentUrl.includes('/auth')) {
        console.error('❌ Sesión no válida. Redirigido a login.');
        return false;
      }

      // Buscar y hacer clic en el botón de compra
      const buyButtonSelectors = [
        'button[data-testid="buy-button"]',
        '[data-testid="purchase-button"]',
        'button[type="submit"]',
        'button.item-buy-button',
        'button.c-button--primary',
      ];

      let buyButtonFound = false;

      // Log current URL for debugging
      console.log(`📍 URL actual: ${page.url()}`);

      for (const selector of buyButtonSelectors) {
        try {
          const button = await page.$(selector);
          if (button) {
            const isVisible = await button.isIntersectingViewport();
            const text = await button.evaluate((el: any) => el.textContent);
            console.log(`🔎 Botón encontrado: ${selector}, Texto: "${text?.trim()}", Visible: ${isVisible}`);

            await button.evaluate((el: any) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
            await page.waitForTimeout(500);
            await button.click();
            console.log('🖱️ Clic en botón de compra');
            buyButtonFound = true;
            break;
          }
        } catch (e) { }
      }

      // XPath fallback: botones cuyo texto contiene "Comprar", "Buy", "Acquista", etc.
      if (!buyButtonFound) {
        const xpaths = [
          "//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'acquista')]",
          "//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'comprar')]",
          "//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'buy')]",
          "//button[contains(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'acquisto')]",
          "//*[@role='button' and (contains(., 'Acquista') or contains(., 'Buy') or contains(., 'Comprar'))]",
        ];
        for (const xpath of xpaths) {
          const elements = await page.$x(xpath);
          if (elements.length > 0) {
            console.log(`✅ Botón de compra encontrado por XPath: ${xpath}`);
            const el = elements[0] as any;
            await el.evaluate((e: any) => e.scrollIntoView({ behavior: 'smooth', block: 'center' }));
            await page.waitForTimeout(500);
            await el.click();
            buyButtonFound = true;
            break;
          }
        }
      }

      if (!buyButtonFound) {
        console.error('❌ No se encontró el botón de compra');
        await page.screenshot({ path: `logs/buy-error-${itemId}.png` });
        return false;
      }

      // Esperar a que cargue la siguiente pantalla
      console.log('⏳ Esperando pantalla de confirmación...');
      await page.waitForTimeout(3000);

      // Buscar botón de confirmación
      const confirmSelectors = [
        'button[data-testid="confirm-purchase"]',
        'button[id="payment-button"]',
        'button.c-button--primary.c-button--full-width',
        'button[type="submit"]',
      ];

      let confirmed = false;
      for (const selector of confirmSelectors) {
        try {
          const confirmButton = await page.$(selector);
          if (confirmButton) {
            const text = await confirmButton.evaluate((el: any) => el.textContent);
            console.log(`✅ Botón de confirmación encontrado: ${selector}, Texto: "${text?.trim()}"`);
            await confirmButton.evaluate((el: any) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
            await page.waitForTimeout(500);
            await confirmButton.click();
            console.log('🖱️ Clic en confirmar compra');
            confirmed = true;
            break;
          }
        } catch (e) { }
      }

      if (!confirmed) {
        const confirmXpaths = [
          "//button[contains(., 'Paga') or contains(., 'Pay') or contains(., 'Confirmar') or contains(., 'Conferma')]",
          "//button[contains(., 'Acquista ora') or contains(., 'Buy now')]",
        ];
        for (const xpath of confirmXpaths) {
          const elements = await page.$x(xpath);
          if (elements.length > 0) {
            console.log('✅ Botón de confirmación encontrado por XPath');
            const el = elements[0] as any;
            await el.evaluate((e: any) => e.scrollIntoView({ behavior: 'smooth', block: 'center' }));
            await page.waitForTimeout(500);
            await el.click();
            confirmed = true;
            break;
          }
        }
      }

      // Esperar respuesta del servidor
      await page.waitForTimeout(3000);

      // Verificar resultado
      const finalUrl = page.url();
      if (finalUrl.includes('/success') || finalUrl.includes('/confirmation') || finalUrl.includes('/order')) {
        console.log(`✅ ¡Compra exitosa! Item ${itemId}`);
        return true;
      } else if (finalUrl.includes('/error') || finalUrl.includes('/failed')) {
        console.error('❌ La compra falló');
        await page.screenshot({ path: `logs/buy-failed-${itemId}.png` });
        return false;
      } else {
        console.log(`ℹ️ Estado final desconocido. URL: ${finalUrl}`);
        await page.screenshot({ path: `logs/buy-unknown-${itemId}.png` });
        // Podría ser éxito o necesitar confirmación adicional
        return false;
      }

    } catch (error: any) {
      console.error('❌ Error en proceso de compra:', error.message);
      return false;
    } finally {
      await browser.close();
      console.log('🔒 Navegador cerrado');
    }
  }
}

export default VintedBuyer;
