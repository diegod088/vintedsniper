import axios from 'axios';
import FormData from 'form-data';
import { config } from './config';
import { VintedItem } from './vinted';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import { extractImagesFromItemPage, downloadImageWithAllMethods, captureImageElement } from './image-helper';

puppeteer.use(StealthPlugin());

export class TelegramBot {
  private token: string;
  private chatId: string;
  private baseURL: string;

  constructor() {
    this.token = config.TOK;
    this.chatId = config.CHAT_ID;
    this.baseURL = `https://api.telegram.org/bot${this.token}`;
  }

  public async sendSystemMessage(text: string): Promise<void> {
    try {
      const url = `${this.baseURL}/sendMessage`;
      await axios.post(url, {
        chat_id: this.chatId,
        text: `🤖 *Bot:* ${text}`,
        parse_mode: 'Markdown',
      }, {
        timeout: 30000,
      });
    } catch (error: any) {
      console.error('❌ Error enviando mensaje de sistema:', error.message);
    }
  }

  public async sendItemNotification(item: VintedItem): Promise<void> {
    try {
      // 1. Extraer detalles enriquecidos (descripción completa y tiempo de publicación)
      // Entramos a la página del item para obtener info que no está en el catálogo
      console.log(`\n🔍 Obteniendo detalles de: ${item.title}`);
      const extraction = await extractImagesFromItemPage(item.url);

      if (extraction.description) {
        item.description = extraction.description;
      }

      if (extraction.timeAgo) {
        item.time_ago = extraction.timeAgo;
        const filter = new (require('./filters').AdvancedFilter)({ maxAgeMinutes: config.MAX_AGE_MINUTES });
        const ageFiltered = filter.filterItem(item);

        if (!ageFiltered.passed) {
          console.log(`⚠️ Item descartado por antigüedad: ${extraction.timeAgo} (${item.title})`);
          return;
        }
        console.log(`✅ Item pasa filtro de antigüedad: ${extraction.timeAgo}`);
      }

      // 2. Actualizar URLs de imágenes si se encontraron mejores en la página
      if (extraction.urls && extraction.urls.length > 0) {
        item.photo_urls = extraction.urls;
        item.photo_url = extraction.urls[0];
      }

      const caption = this.formatCaption(item);

      if (item.photo_urls && item.photo_urls.length > 1) {
        await this.sendMultiplePhotos(item, caption);
      } else {
        await this.sendSinglePhoto(item, caption);
      }
    } catch (error: any) {
      console.error('❌ Error en sendItemNotification:', error.message);
    }
  }

  private formatCaption(item: VintedItem): string {
    const title = item.title.length > 50 ? item.title.substring(0, 50) + '...' : item.title;
    const price = item.price ? `€${item.price}` : 'N/A';
    const brand = item.brand || 'N/A';
    const size = item.size || 'N/A';
    const condition = item.condition || 'N/A';
    const url = item.url || '';
    const description = item.description ? `\n\n📝 *Descrizione:* \n${item.description.substring(0, 500)}${item.description.length > 500 ? '...' : ''}` : '';

    return `🎯 *${title}*\n` +
      `💰 *Prezzo:* ${price}\n` +
      `🏷️ *Marca:* ${brand}\n` +
      `📏 *Taglia:* ${size}\n` +
      `✨ *Condizione:* ${condition}` +
      `${description}\n\n` +
      `🔗 [Vedi su Vinted](${url})`;
  }

  private async sendMultiplePhotos(item: VintedItem, caption: string): Promise<void> {
    try {
      const mediaGroup = [];
      const maxPhotos = Math.min(item.photo_urls!.length, 10);

      for (let i = 0; i < maxPhotos; i++) {
        const photoUrl = item.photo_urls![i];
        const imageBuffer = await this.downloadVintedImage(photoUrl);

        if (imageBuffer && imageBuffer.length > 0 && imageBuffer.length <= TelegramBot.MAX_PHOTO_BYTES) {
          const formData = new FormData();
          formData.append('photo', imageBuffer, {
            filename: `photo_${i}.jpg`,
            contentType: 'image/jpeg'
          });

          // Pequeño retardo para no saturar la API de Telegram
          if (i > 0) await new Promise(r => setTimeout(r, 1000));

          try {
            const uploadResponse = await axios.post(`${this.baseURL}/sendPhoto`, formData, {
              headers: formData.getHeaders(),
              params: {
                chat_id: this.chatId,
                caption: i === 0 ? caption : undefined,
                parse_mode: 'Markdown'
              },
              timeout: 30000
            });

            if (uploadResponse.data.ok) {
              console.log(`✅ Foto ${i + 1} enviada: ${photoUrl.substring(0, 60)}...`);
              mediaGroup.push({
                type: 'photo',
                media: uploadResponse.data.result.photo.file_id
              });
            }
          } catch (err: any) {
            console.error(`❌ Error subiendo foto ${i + 1}: ${err.message}`);
          }
        }
      }

      // Si tenemos múltiples file_ids, enviarlos como grupo (esto es redundante si ya los enviamos arriba, 
      // pero sendMediaGroup suele ser mejor para la experiencia de usuario si se envían todos a la vez.
      // Sin embargo, el código original los subía uno a uno. Mantendré la lógica de subida individual pero 
      // mejorada con avisos.

      console.log(`✅ Se procesaron ${mediaGroup.length} fotos para el item`);
    } catch (error: any) {
      console.error('❌ Error enviando múltiples fotos:', error.message);
      await this.sendMessage(caption);
    }
  }

  private async sendMediaGroup(mediaGroup: any[], caption: string): Promise<void> {
    try {
      const url = `${this.baseURL}/sendMediaGroup`;
      await axios.post(url, {
        chat_id: this.chatId,
        media: mediaGroup,
        caption: caption,
        parse_mode: 'Markdown'
      }, {
        timeout: 30000
      });
      console.log('✅ Grupo de fotos enviado');
    } catch (error: any) {
      console.error('❌ Error enviando grupo de fotos:', error.message);
    }
  }

  private async sendSinglePhoto(item: VintedItem, caption: string): Promise<void> {
    let imageBuffer: Buffer | null = null;

    try {
      if (item.photo_url) {
        console.log(`📸 Obteniendo imagen de Vinted: ${item.photo_url.substring(0, 80)}...`);
        imageBuffer = await this.downloadVintedImage(item.photo_url);

        // Si la descarga directa falla, intentar con las URLs adicionales
        if (!imageBuffer && item.photo_urls && item.photo_urls.length > 1) {
          console.log(`🔄 Intentando con URLs adicionales...`);
          for (let i = 1; i < item.photo_urls.length && !imageBuffer; i++) {
            console.log(`📸 Intentando URL alternativa ${i}: ${item.photo_urls[i].substring(0, 60)}...`);
            imageBuffer = await this.downloadVintedImage(item.photo_urls[i]);
          }
        }
      }

      if (imageBuffer && imageBuffer.length > 0 && imageBuffer.length <= TelegramBot.MAX_PHOTO_BYTES) {
        try {
          await this.sendPhotoBuffer(imageBuffer, caption);
          console.log('✅ Notificación con foto enviada');
          return;
        } catch (e: any) {
          console.warn(`⚠️ Envío de foto fallido: ${e.message}`);
        }
      }

      // Si la descarga falla, intentar capturar el elemento de imagen directamente
      if (!imageBuffer && item.url) {
        console.log('🔄 Intentando capturar elemento de imagen directamente...');
        try {
          imageBuffer = await captureImageElement(item.url);
          if (imageBuffer) {
            console.log('✅ Captura de elemento de imagen exitosa');
          }
        } catch (e: any) {
          console.log(`⚠️ Captura de elemento fallida: ${e.message}`);
        }
      }

      // Solo tomar screenshot completo si todo lo demás falla

      if (!imageBuffer && item.url) {
        console.log('📸 Todas las URLs de imágenes fallaron, capturando página como último recurso...');
        try {
          imageBuffer = await this.captureItemScreenshot(item.url);
          if (imageBuffer && imageBuffer.length > 0) {
            await this.sendPhotoBuffer(imageBuffer, caption);
            console.log('✅ Notificación con screenshot enviada');
            return;
          }
        } catch (e: any) {
          console.log(`⚠️ Screenshot fallido: ${e.message}`);
        }
      }

      // Fallback final a texto - DESACTIVADO por petición del usuario
      // si no hay imagen, no se envía nada.
      console.log('⚠️ No se pudo obtener imagen válida, saltando notificación');
      throw new Error('No se pudo obtener imagen válida para el item');
    } catch (error: any) {
      console.error('❌ Error enviando notificación:', error.message);
    }
  }

  private async sendPhotoBuffer(imageBuffer: Buffer, caption: string): Promise<void> {
    console.log(`📤 Enviando foto a Telegram (${imageBuffer.length} bytes)...`);

    try {
      // Detectar si es PNG o JPEG basado en el buffer (shorthand)
      let contentType = 'image/jpeg';
      let filename = 'item.jpg';

      if (imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50) {
        contentType = 'image/png';
        filename = 'item.png';
      }

      const formData = new FormData();
      formData.append('photo', imageBuffer, {
        filename: filename,
        contentType: contentType
      });

      await axios.post(`${this.baseURL}/sendPhoto`, formData, {
        headers: formData.getHeaders(),
        params: {
          chat_id: this.chatId,
          caption: caption,
          parse_mode: 'Markdown'
        },
        timeout: 30000
      });
      console.log('✅ Foto enviada correctamente a Telegram API');
    } catch (error: any) {
      console.error(`❌ Error en sendPhotoBuffer: ${error.message}`);
      if (error.response) {
        console.error(`   API Error: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  private async sendMessage(text: string): Promise<void> {
    const url = `${this.baseURL}/sendMessage`;

    await axios.post(url, {
      chat_id: this.chatId,
      text: text,
      parse_mode: 'Markdown',
      disable_web_page_preview: false,
    }, {
      timeout: 30000,
    });
  }

  private async downloadVintedImage(photoUrl: string): Promise<Buffer | null> {
    if (!photoUrl) return null;

    console.log(`📸 Descargando imagen con todos los métodos: ${photoUrl.substring(0, 80)}...`);
    return await downloadImageWithAllMethods(photoUrl);
  }

  private async captureItemScreenshot(itemUrl: string): Promise<Buffer | null> {
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ]
    });

    try {
      const page = await browser.newPage();

      // Configurar user agent y viewport
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setViewport({ width: 1366, height: 768 });

      // Cargar cookies si existen
      const cookiePath = config.COOKIE_FILE;
      if (fs.existsSync(cookiePath)) {
        const cookies = JSON.parse(fs.readFileSync(cookiePath, 'utf8'));
        await page.setCookie(...cookies);
        console.log(`🍪 Cargadas ${cookies.length} cookies para screenshot`);
      }

      console.log(`🔍 Navegando a: ${itemUrl}`);

      // Navegar a la página del item
      await page.goto(itemUrl, {
        waitUntil: 'networkidle2',
        timeout: 60000
      });

      // Esperar a que cargue la imagen principal
      await page.waitForTimeout(3000);

      // Tomar screenshot completo de la página como fallback definitivo
      console.log('📸 Capturando screenshot completo de la página como fallback...');
      const fullPageScreenshot = await page.screenshot({
        type: 'jpeg',
        quality: 85,
        fullPage: true
      });

      console.log(`📸 Screenshot completo capturado: ${fullPageScreenshot.byteLength} bytes`);
      return fullPageScreenshot as Buffer;
    } catch (error: any) {
      console.error('❌ Error capturando screenshot:', error.message);
      return null;
    } finally {
      await browser.close();
    }
  }

  static readonly MAX_PHOTO_BYTES = 10 * 1024 * 1024; // 10MB
}
