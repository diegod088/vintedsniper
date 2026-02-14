
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const COOKIE_FILE = 'cookies/vinted.json';
const IMPORT_FILE = 'cookies_to_import.json';

console.log('╔══════════════════════════════════════╗');
console.log('║     🍪 IMPORTADOR DE COOKIES         ║');
console.log('╚══════════════════════════════════════╝');
console.log('');
console.log(`Leyendo cookies desde: ${IMPORT_FILE}`);

try {
    if (!fs.existsSync(IMPORT_FILE)) {
        throw new Error(`No se encontró el archivo ${IMPORT_FILE}. Por favor créalo y pega el JSON dentro.`);
    }

    const fileContent = fs.readFileSync(IMPORT_FILE, 'utf-8');
    if (!fileContent.trim() || fileContent.trim() === '[]') {
        throw new Error(`El archivo ${IMPORT_FILE} está vacío. Pega el JSON exportado de Cookie-Editor dentro.`);
    }

    // Intentar limpiar si el usuario pegó algo extra (aunque en archivo es menos probable)
    let jsonStr = fileContent.trim();
    if (!jsonStr.startsWith('[')) {
        const firstBracket = jsonStr.indexOf('[');
        if (firstBracket !== -1) {
            jsonStr = jsonStr.substring(firstBracket);
        }
    }

    const cookies = JSON.parse(jsonStr);

    if (!Array.isArray(cookies)) {
        throw new Error('El formato no es un array de cookies JSON válido.');
    }

    const dir = path.dirname(COOKIE_FILE);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(COOKIE_FILE, JSON.stringify(cookies, null, 2));

    console.log('');
    console.log('✅ Cookies guardadas exitosamente!');
    console.log(`📂 Archivo generado: ${COOKIE_FILE}`);
    console.log(`🔢 Cantidad: ${cookies.length} cookies`);
    console.log('');
    console.log('Ahora reinicia el bot con: docker-compose restart bot');

} catch (e: any) {
    console.error('');
    console.error('❌ Error al procesar el archivo:');
    console.error(e.message);
}
