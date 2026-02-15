import { TelegramBot } from './telegram';
import { VintedAPI } from './vinted';

/**
 * Script de prueba para enviar un item real de Vinted a Telegram
 * Esto verifica que la descarga de imágenes funcione correctamente
 */

async function testSendItem() {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║  🧪 TEST DE ENVÍO DE ITEM CON IMÁGENES A TELEGRAM          ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    try {
        // Inicializar Telegram Bot (sin argumentos, usa config internamente)
        const telegramBot = new TelegramBot();
        console.log('✅ Bot de Telegram inicializado\n');

        // Inicializar Vinted API
        const vintedApi = new VintedAPI();
        console.log('✅ Vinted API inicializada\n');

        // Buscar items reales
        console.log('🔍 Buscando items en Vinted...\n');
        const result = await vintedApi.searchItems('nike');
        const items = result.items;

        if (!items || items.length === 0) {
            console.log('❌ No se encontraron items');
            process.exit(1);
        }

        // Tomar el primer item
        const testItem = items[0];
        console.log(`📦 Item seleccionado: ${testItem.title}`);
        console.log(`   URL: ${testItem.url}`);
        console.log(`   Precio: ${testItem.price}`);
        console.log(`   Foto principal: ${testItem.photo_url}\n`);

        // Enviar a Telegram
        console.log('📤 Enviando item a Telegram...\n');
        // El método sendItemNotification ya no requiere browser
        await telegramBot.sendItemNotification(testItem);

        console.log('\n✅ ¡ÉXITO! El item se envió correctamente a Telegram con imágenes');
        console.log('💡 Revisa tu canal/chat de Telegram para ver el mensaje');

        process.exit(0);

    } catch (error: any) {
        console.error('\n❌ Error durante la prueba:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Ejecutar el test
testSendItem();

