import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import readline from 'readline';

puppeteer.use(StealthPlugin());

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query: string): Promise<string> {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function captureCookies(): Promise<void> {
  console.log('╔══════════════════════════════════════╗');
  console.log('║     🔐 CAPTURADOR DE COOKIES         ║');
  console.log('╚══════════════════════════════════════╝');
  console.log('');
  console.log('Este script te ayudará a obtener las cookies de Vinted.');
  console.log('Se abrirá un navegador para que inicies sesión.');
  console.log('');

  const email = await question('📧 Email de Vinted: ');
  const password = await question('🔑 Contraseña: ');
  const cookieFile = await question('📁 Ruta para guardar cookies (default: cookies/vinted.json): ') || 'cookies/vinted.json';

  console.log('');
  console.log('🚀 Iniciando navegador...');

  const browser = await puppeteer.launch({
    headless: false,
    args: [
      '--start-maximized', // Maximizar ventana
      '--disable-blink-features=AutomationControlled', // Intentar ocultar automatización
      '--no-sandbox', // Necesario en algunos sistemas Linux
      '--disable-setuid-sandbox',
    ],
    defaultViewport: null, // Importante para que --start-maximized funcione
  });

  try {
    const page = await browser.newPage();
    // await page.setViewport({ width: 1280, height: 720 }); // Comentado para usar tamaño completo

    // Navegar a Vinted
    console.log('📄 Cargando Vinted.it...');
    await page.goto('https://www.vinted.it/', { waitUntil: 'networkidle2' });

    // Esperar un momento
    await page.waitForTimeout(2000);

    // Buscar y hacer clic en "Iniciar sesión"
    const loginSelectors = [
      'a[href*="login"]',
      'button:has-text("Iniciar sesión")',
      'button:has-text("Entrar")',
      'button:has-text("Accedi")', // Añadido para IT
      '[data-testid="login-button"]',
    ];

    let loginClicked = false;
    for (const selector of loginSelectors) {
      try {
        const btn = await page.$(selector);
        if (btn) {
          await btn.click();
          loginClicked = true;
          console.log('🖱️ Clic en Iniciar sesión');
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!loginClicked) {
      console.log('⚠️ No se encontró botón de login. Intentando navegar directamente...');
      try {
        await page.goto('https://www.vinted.it/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
      } catch (e: any) {
        console.warn(`⚠️ La navegación automática falló (${e.message}).`);
        console.warn('👉 Por favor, escribe "https://www.vinted.it/login" en la barra de direcciones del navegador o haz clic en "Accedi/Entrar" manualmente.');
      }
    }

    // Esperar formulario de login (solo si estamos en la página correcta, si no, usuario navega)
    await page.waitForTimeout(3000);

    // Intentar login automático
    try {
      // Buscar campos de email y password
      const emailSelectors = ['input[type="email"]', 'input[name="email"]', '#email'];
      const passSelectors = ['input[type="password"]', 'input[name="password"]', '#password'];

      for (const emailSel of emailSelectors) {
        const emailInput = await page.$(emailSel);
        if (emailInput) {
          await emailInput.type(email, { delay: 100 });
          console.log('✉️ Email ingresado');
          break;
        }
      }

      await page.waitForTimeout(500);

      for (const passSel of passSelectors) {
        const passInput = await page.$(passSel);
        if (passInput) {
          await passInput.type(password, { delay: 100 });
          console.log('🔑 Contraseña ingresada');
          break;
        }
      }

      // Buscar botón de submit
      const submitSelectors = ['button[type="submit"]', 'button:has-text("Entrar")', 'button:has-text("Iniciar")'];
      for (const submitSel of submitSelectors) {
        const submitBtn = await page.$(submitSel);
        if (submitBtn) {
          await submitBtn.click();
          console.log('🚀 Login enviado');
          break;
        }
      }

    } catch (e) {
      console.log('⚠️ Login automático falló. Por favor, inicia sesión manualmente.');
    }

    // Esperar a que el usuario confirme que está logueado
    console.log('');
    console.log('⏳ Esperando inicio de sesión...');
    console.log('Si el login automático falló, inicia sesión MANUALMENTE en el navegador.');

    const confirm = await question('✅ ¿Has iniciado sesión correctamente? (s/n): ');

    if (confirm.toLowerCase() !== 's') {
      console.log('❌ Cancelado por el usuario');
      return;
    }

    // Extraer cookies
    console.log('🍪 Extrayendo cookies...');
    const cookies = await page.cookies();

    // Guardar cookies
    const cookieData = cookies.map(c => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      expires: c.expires,
      httpOnly: c.httpOnly,
      secure: c.secure,
      sameSite: c.sameSite as 'Strict' | 'Lax' | 'None',
    }));

    // Crear directorio si no existe
    const dir = cookieFile.substring(0, cookieFile.lastIndexOf('/'));
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(cookieFile, JSON.stringify(cookieData, null, 2));
    console.log(`💾 Cookies guardadas en: ${cookieFile}`);
    console.log(`📊 Total cookies: ${cookieData.length}`);

    // Verificar sesión haciendo una petición
    console.log('🔍 Verificando sesión...');
    await page.goto('https://www.vinted.es/inbox', { waitUntil: 'networkidle2' });

    const url = page.url();
    if (url.includes('/inbox')) {
      console.log('✅ ¡Sesión verificada correctamente!');
    } else {
      console.warn('⚠️ No se pudo verificar la sesión. Es posible que las cookies expiren pronto.');
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
    rl.close();
    console.log('👋 Listo');
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  captureCookies().catch(console.error);
}

export default captureCookies;
