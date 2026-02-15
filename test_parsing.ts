
import * as fs from 'fs';
import * as path from 'path';

// Mock types
interface VintedItem {
    id: number;
    title: string;
    price: number;
    currency: string;
    brand: string;
    size: string;
    condition: string;
    url: string;
    photo_url: string;
    description?: string;
    location?: string;
    [key: string]: any;
}

function parseItemsFromHTML(html: string, baseURL: string): VintedItem[] {
    const items: VintedItem[] = [];
    const itemBlocks = html.split('data-testid="grid-item"').slice(1);

    itemBlocks.forEach((block, index) => {
        try {
            const idMatch = block.match(/data-testid="product-item-id-(\d+)"/);
            const itemId = idMatch ? parseInt(idMatch[1]) : 0;

            const urlMatch = block.match(/href="([^"]+)"/);
            const titleMatch = block.match(/title="([^"]+)"/) || block.match(/alt="([^"]+)"/);
            const priceMatch = block.match(/data-testid="[^"]+--price-text">([^<]+)<\/p>/) || block.match(/aria-label="([^"]+)"/);
            const imgMatch = block.match(/src="([^"]+)"/);

            if (urlMatch && (titleMatch || priceMatch)) {
                let priceStr = '0';
                let currency = 'EUR';
                if (priceMatch) {
                    const p = priceMatch[1].toUpperCase();
                    const priceExtracted = p.match(/[\d,.]+/);
                    if (priceExtracted) priceStr = priceExtracted[0];

                    if (p.includes('RON')) currency = 'RON';
                    else if (p.includes('PLN')) currency = 'PLN';
                }

                const titleFull = titleMatch ? titleMatch[1] : 'Item Vinted';
                let brand = '';
                if (titleFull.includes('brand: ')) {
                    brand = titleFull.split('brand: ')[1].split(',')[0].trim();
                }

                let description = '';
                if (titleFull.includes(',')) {
                    description = titleFull;
                }

                let location = '';
                if (currency === 'RON') location = 'Romania';
                else if (baseURL.includes('.ro')) location = 'Romania';

                items.push({
                    id: itemId,
                    title: titleFull.split(', brand:')[0].trim(),
                    price: parseFloat(priceStr.replace(',', '.')),
                    currency: currency,
                    brand: brand,
                    size: titleFull.includes('mărime: ') ? titleFull.split('mărime: ')[1].split(',')[0].trim() : (titleFull.includes('taglia: ') ? titleFull.split('taglia: ')[1].split(',')[0].trim() : ''),
                    condition: titleFull.includes('stare: ') ? titleFull.split('stare: ')[1].split(',')[0].trim() : (titleFull.includes('condizioni: ') ? titleFull.split('condizioni: ')[1].split(',')[0].trim() : ''),
                    url: urlMatch[1].startsWith('http') ? urlMatch[1] : `${baseURL}${urlMatch[1]}`,
                    photo_url: imgMatch ? imgMatch[1] : '',
                    photo_urls: imgMatch ? [imgMatch[1]] : [],
                    description: description,
                    location: location,
                    created_at: new Date().toISOString(),
                    original_index: index
                });
            }
        } catch (e) { }
    });

    return items;
}

function getCountryFlag(item: VintedItem): string {
    const location = (item.location || '').toLowerCase();
    const currency = (item.currency || '').toUpperCase();

    if (location.includes('italia') || location.includes('italy')) return '🇮🇹';
    if (location.includes('francia') || location.includes('france')) return '🇫🇷';
    if (location.includes('spagna') || location.includes('spain')) return '🇪🇸';
    if (currency === 'RON') return '🇷🇴';
    return '🌍';
}

const samplePath = path.join(process.cwd(), 'vinted_sample.html');
if (fs.existsSync(samplePath)) {
    const html = fs.readFileSync(samplePath, 'utf8');
    const items = parseItemsFromHTML(html, 'https://www.vinted.ro');
    console.log(`Parsed ${items.length} items from sample`);

    const item = items[0];
    const flag = getCountryFlag(item);
    console.log('--- UI PREVIEW ---');
    console.log(`🎯 *${item.title}*`);
    console.log(`💰 *Prezzo:* €${item.price.toFixed(2)}`);
    console.log(`🏷️ *Marca:* ${item.brand}`);
    console.log(`📏 *Taglia:* ${item.size}`);
    console.log(`📍 *Località:* ${item.location} ${flag}`);
    console.log('━━━━━━━━━━━━━━');
    console.log(`📝 *Descrizione:*\n_${item.description?.substring(0, 100)}..._`);
    console.log('------------------');
}
