import { captureImageElement } from './image-helper';

async function testCapture() {
    const url = 'https://www.vinted.it/items/4447608889-maglietta-uom'; // URL de ejemplo, se puede cambiar
    // Usaré una URL real de los logs anteriores
    const realUrl = 'https://www.vinted.it/items/8162037574-maglietta-originale-adidas-deutscher-fussball-bund';

    console.log(`🧪 Probando captura de elemento para: ${realUrl}`);

    try {
        const buffer = await captureImageElement(realUrl);

        if (buffer) {
            console.log(`✅ Captura exitosa! Tamaño: ${buffer.length} bytes`);
            // Guardar para verificar visualmente si es necesario (aunque el tamaño ya indica éxito)
            // fs.writeFileSync('test-capture.png', buffer);
        } else {
            console.log('❌ Falló la captura (buffer nulo)');
        }
    } catch (error: any) {
        console.log(`❌ Error durante la prueba: ${error.message}`);
    }
}

testCapture();
