import { Page } from 'puppeteer';

export async function handleCookieConsent(page: Page): Promise<void> {
    try {
        // Selectores comunes para popups de cookies en Vinted (OneTrust y otros)
        const cookieSelectors = [
            '#onetrust-accept-btn-handler', // Botón "Aceptar todo" de OneTrust
            '[data-testid="domain-banner-accept-all"]', // Banner genérico de Vinted
            'button#onetrust-accept-btn-handler',
            'button[id*="onetrust-accept"]',
            // Selectores por texto (menos robustos pero útiles como fallback)
            '//button[contains(text(), "Accetta")]',
            '//button[contains(text(), "Accept")]',
            '//button[contains(text(), "Aceptar")]',
            '//button[contains(text(), "Tout accepter")]'
        ];

        console.log('🍪 Buscando popup de cookies...');

        // Intentar encontrar y hacer click en alguno de los selectores
        for (const selector of cookieSelectors) {
            try {
                if (selector.startsWith('//')) {
                    // Selector XPath
                    const elements = await page.$x(selector);
                    if (elements.length > 0) {
                        const element = elements[0] as any;
                        if (await element.isIntersectingViewport()) {
                            await element.click();
                            console.log(`✅ Cookies aceptadas usando XPath: ${selector}`);
                            // @ts-ignore
                            if (page.waitForTimeout) await page.waitForTimeout(1000);
                            else await new Promise(r => setTimeout(r, 1000));
                            return;
                        }
                    }
                } else {
                    // Selector CSS
                    const element = await page.$(selector);
                    if (element) {
                        // Verificar visibilidad antes de clickar
                        const isVisible = await element.isIntersectingViewport();
                        if (isVisible) {
                            await element.click();
                            console.log(`✅ Cookies aceptadas usando selector: ${selector}`);
                            // @ts-ignore
                            if (page.waitForTimeout) await page.waitForTimeout(1000);
                            else await new Promise(r => setTimeout(r, 1000));
                            return;
                        }
                    }
                }
            } catch (e) {
                // Ignorar errores individuales por selector
            }
        }

        console.log('ℹ️ No se detectó popup de cookies o ya fue aceptado.');

    } catch (error: any) {
        console.log(`⚠️ Error al manejar cookies: ${error.message}`);
    }
}

// También exportamos launchBrowser por si algún otro archivo lo usa (aunque VintedAPI tiene el suyo)
export async function launchBrowser(): Promise<void> {
    console.log('⚠️ launchBrowser en browser-helper.ts es un placeholder. Use handleCookieConsent o el método de VintedAPI.');
}
