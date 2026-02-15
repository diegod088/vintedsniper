import { VintedAPI } from './vinted';
import { logger } from './logger';

async function verify() {
    console.log('🧪 Iniciando verificación de Vinted...');
    const api = new VintedAPI();

    try {
        console.log('🔍 Probando búsqueda de "adidas"...');
        const result = await api.searchItems('adidas');

        console.log(`📦 Búsqueda completada. Items encontrados: ${result.items.length}`);

        if (result.items.length > 0) {
            console.log('✅ ÉXITO: Se encontraron items. La sesión y las cookies parecen funcionar.');
            console.log('Primer item:', result.items[0].title, '-', result.items[0].price, result.items[0].currency);
        } else {
            console.log('⚠️ ADVERTENCIA: No se encontraron items. Esto podría ser normal o indicar un bloqueo.');
            if (result.html.includes('Oops!Something went wrong')) {
                console.log('❌ ERROR: Detectado el bloqueo "Oops!Something went wrong".');
            } else if (result.html.includes('Verifying you are human')) {
                console.log('❌ ERROR: Detectado Cloudflare (Turnstile).');
            } else {
                console.log('❓ El HTML no parece contener el bloqueo típico, pero no hay items.');
            }
        }
    } catch (error: any) {
        console.error('❌ Error crítico durante la verificación:', error.message);
    } finally {
        // En una prueba real querríamos cerrar el navegador si falló todo, 
        // pero VintedAPI lo mantiene abierto si funciona.
        // Para este script de verificación lo cerraremos tras 10 segundos 
        // para dar tiempo a ver la captura si se generó.
        console.log('⏳ Finalizando en 5 segundos...');
        setTimeout(() => {
            process.exit(0);
        }, 5000);
    }
}

verify();
