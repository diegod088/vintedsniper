import { extractImagesFromItemPage, downloadImageWithAllMethods } from './image-helper';
import fs from 'fs';
import path from 'path';

/**
 * Script de prueba para verificar la extracción y descarga de imágenes de Vinted
 * 
 * Uso:
 *   ts-node src/test-images.ts https://www.vinted.it/items/XXXXXXX
 */

async function testImageExtraction() {
    const itemUrl = process.argv[2];

    if (!itemUrl || !itemUrl.includes('vinted.it/items/')) {
        console.error('❌ Error: Debes proporcionar una URL válida de un item de Vinted');
        console.log('Uso: ts-node src/test-images.ts https://www.vinted.it/items/XXXXXXX');
        process.exit(1);
    }

    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║  🧪 TEST DE EXTRACCIÓN Y DESCARGA DE IMÁGENES DE VINTED    ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    console.log(`🔗 URL del item: ${itemUrl}\n`);

    try {
        // Paso 1: Extraer URLs de imágenes de la página
        console.log('📋 PASO 1: Extrayendo URLs de imágenes de la página...\n');
        const result = await extractImagesFromItemPage(itemUrl);
        const imageUrls = result.urls;

        if (imageUrls.length === 0) {
            console.log('❌ No se encontraron URLs de imágenes en la página');
            console.log('💡 Esto puede indicar que:');
            console.log('   - Los selectores necesitan actualizarse');
            console.log('   - La página requiere autenticación');
            console.log('   - Vinted cambió su estructura HTML');
            process.exit(1);
        }

        console.log(`\n✅ Se encontraron ${imageUrls.length} URLs de imágenes\n`);

        // Paso 2: Intentar descargar cada imagen
        console.log('📋 PASO 2: Descargando imágenes...\n');

        const outputDir = '/tmp/vinted-test';
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < imageUrls.length; i++) {
            const imageUrl = imageUrls[i];
            console.log(`\n📸 Descargando imagen ${i + 1}/${imageUrls.length}...`);
            console.log(`   URL: ${imageUrl}`);

            const imageBuffer = await downloadImageWithAllMethods(imageUrl);

            if (imageBuffer && imageBuffer.length > 0) {
                const filename = `image_${i + 1}.jpg`;
                const filepath = path.join(outputDir, filename);
                fs.writeFileSync(filepath, imageBuffer);

                console.log(`   ✅ Descargada exitosamente (${imageBuffer.length} bytes)`);
                console.log(`   💾 Guardada en: ${filepath}`);
                successCount++;
            } else {
                console.log(`   ❌ Fallo en la descarga`);
                failCount++;
            }
        }

        // Resumen final
        console.log('\n╔══════════════════════════════════════════════════════════════╗');
        console.log('║                    📊 RESUMEN FINAL                         ║');
        console.log('╚══════════════════════════════════════════════════════════════╝\n');
        console.log(`📸 URLs encontradas:      ${imageUrls.length}`);
        console.log(`✅ Descargas exitosas:    ${successCount}`);
        console.log(`❌ Descargas fallidas:    ${failCount}`);
        console.log(`📁 Directorio de salida:  ${outputDir}\n`);

        if (successCount > 0) {
            console.log('✅ ¡Éxito! Al menos una imagen se descargó correctamente');
            console.log(`💡 Revisa las imágenes en: ${outputDir}`);
        } else {
            console.log('❌ Error: No se pudo descargar ninguna imagen');
            console.log('💡 Revisa los logs arriba para más detalles');
            process.exit(1);
        }

    } catch (error: any) {
        console.error('\n❌ Error durante la prueba:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Ejecutar el test
testImageExtraction().catch(error => {
    console.error('❌ Error fatal:', error);
    process.exit(1);
});
