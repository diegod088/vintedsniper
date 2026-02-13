
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { extractImagesFromItemPage, downloadImageWithAllMethods } from './image-helper';
import { VintedAPI } from './vinted';

puppeteer.use(StealthPlugin());

async function runTest() {
    const itemUrl = 'https://www.vinted.it/items/8168336461-veste-adidas-noire-l?referrer=catalog'; // URL from the user's log
    // Or use a generic one if that one is gone
    // const itemUrl = 'https://www.vinted.it/items/8168336659-conjunto-chandal-adidas';

    console.log(`Testing image extraction for: ${itemUrl}`);

    const browser = await puppeteer.launch({
        headless: 'new' as any,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.goto(itemUrl, { waitUntil: 'domcontentloaded' });

        // Simulate VintedAPI logic
        console.log('--- Simulating VintedAPI logic ---');

        const extraction = await extractImagesFromItemPage(itemUrl, browser);
        console.log('Extracted URLs:', extraction.urls);

        if (extraction.urls.length > 0) {
            const firstUrl = extraction.urls[0];
            console.log(`First URL: ${firstUrl}`);

            // Test the logic from vinted.ts that appends .webp
            let cleanUrl = firstUrl.split('?')[0];
            if (!cleanUrl.match(/\.(webp|jpg|jpeg|png)$/i)) {
                console.log(`[VintedAPI-Sim] URL without extension detected: ${cleanUrl}`);
                cleanUrl = cleanUrl + '.webp';
                console.log(`[VintedAPI-Sim] Added .webp: ${cleanUrl}`);
            }

            console.log(`Attempting download of: ${cleanUrl}`);
            const buffer = await downloadImageWithAllMethods(cleanUrl, browser);
            if (buffer) {
                console.log(`✅ Download SUCCESS! Size: ${buffer.length} bytes`);
            } else {
                console.log(`❌ Download FAILED`);
            }

            // Also try downloading WITHOUT the forced extension if it failed or just to compare
            if (cleanUrl !== firstUrl) {
                console.log(`Attempting download of ORIGINAL url: ${firstUrl}`);
                const bufferOrig = await downloadImageWithAllMethods(firstUrl, browser);
                if (bufferOrig) {
                    console.log(`✅ Original Download SUCCESS! Size: ${bufferOrig.length} bytes`);
                } else {
                    console.log(`❌ Original Download FAILED`);
                }
            }
        } else {
            console.log('No images extracted.');
        }

    } catch (error) {
        console.error('Test failed:', error);
    } finally {
        await browser.close();
    }
}

runTest();
