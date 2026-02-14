import axios from 'axios';
import FormData from 'form-data';
import { config } from './config';
import { VintedItem } from './vinted';
import { Browser } from 'puppeteer';
import fs from 'fs';
import { extractImagesFromItemPage, downloadImageWithAllMethods, captureImageElement } from './image-helper';
import { logger } from './logger';

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

  public async sendItemNotification(item: VintedItem, existingBrowser?: Browser): Promise<boolean> {
    try {
      // 1. Extraer detalles enriquecidos (descripción completa y tiempo de publicación)
      console.log(`\n🔍 Obteniendo detalles de: ${item.title}`);

      const extraction = await extractImagesFromItemPage(item.url, existingBrowser);

      if (extraction.description) {
        item.description = extraction.description;
      }

      if (extraction.timeAgo) {
        item.time_ago = extraction.timeAgo;
        // Importación dinámica para evitar ciclos
        const { AdvancedFilter } = require('./filters');
        const filter = new AdvancedFilter({ maxAgeMinutes: config.MAX_AGE_MINUTES });
        const ageFiltered = filter.filterItem(item);

        if (!ageFiltered.passed) {
          console.log(`⚠️ Item descartado por antigüedad: ${extraction.timeAgo} (${item.title})`);
          return false;
        }
        console.log(`✅ Item pasa filtro de antigüedad: ${extraction.timeAgo}`);
      }

      // 2. Actualizar URLs de imágenes
      if (extraction.urls && extraction.urls.length > 0) {
        item.photo_urls = extraction.urls;
        item.photo_url = extraction.urls[0];
      }

      const caption = this.formatCaption(item);

      if (item.photo_urls && item.photo_urls.length > 1) {
        await this.sendMultiplePhotos(item, caption, existingBrowser);
      } else {
        await this.sendSinglePhoto(item, caption, existingBrowser);
      }
      return true;
    } catch (error: any) {
      console.error('❌ Error en sendItemNotification:', error.message);
      return false;
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

  private async sendMultiplePhotos(item: VintedItem, caption: string, existingBrowser?: Browser): Promise<void> {
    try {
      const maxPhotos = Math.min(item.photo_urls!.length, 10);
      const buffers: Buffer[] = [];

      console.log(`📸 Preparando álbum de ${maxPhotos} fotos...`);

      for (let i = 0; i < maxPhotos; i++) {
        try {
          const buffer = await downloadImageWithAllMethods(item.photo_urls![i], existingBrowser);
          if (buffer && buffer.length > 1000) {
            buffers.push(buffer);
          }
        } catch (err) {
          console.error(`⚠️ Error descargando foto ${i + 1} para el álbum`);
        }
      }

      if (buffers.length === 0) {
        console.log('⚠️ No se pudo descargar ninguna foto, intentando single photo fallback.');
        await this.sendSinglePhoto(item, caption, existingBrowser);
        return;
      }

      const formData = new FormData();
      const mediaGroup = buffers.map((buffer, i) => {
        const attachmentName = `photo${i}.jpg`;
        formData.append(attachmentName, buffer, { filename: attachmentName, contentType: 'image/jpeg' });

        return {
          type: 'photo',
          media: `attach://${attachmentName}`,
          caption: i === 0 ? caption : undefined,
          parse_mode: i === 0 ? 'Markdown' : undefined
        };
      });

      formData.append('media', JSON.stringify(mediaGroup));

      await axios.post(`${this.baseURL}/sendMediaGroup`, formData, {
        params: { chat_id: this.chatId },
        headers: formData.getHeaders(),
        timeout: 60000
      });

      console.log(`✅ Álbum de ${mediaGroup.length} fotos enviado con éxito`);
    } catch (error: any) {
      console.error('❌ Error enviando álbum de fotos:', error.message);
      // fallback a una sola foto si falla el álbum
      await this.sendSinglePhoto(item, caption, existingBrowser).catch(() => { });
    }
  }

  private async sendSinglePhoto(item: VintedItem, caption: string, existingBrowser?: Browser): Promise<void> {
    let imageBuffer: Buffer | null = null;

    try {
      if (item.photo_url) {
        console.log(`📸 Descargando imagen: ${item.photo_url.substring(0, 80)}...`);
        imageBuffer = await downloadImageWithAllMethods(item.photo_url, existingBrowser);

        if (!imageBuffer && item.photo_urls && item.photo_urls.length > 1) {
          for (let i = 1; i < item.photo_urls.length && !imageBuffer; i++) {
            console.log(`📸 Intentando URL alternativa ${i}`);
            imageBuffer = await downloadImageWithAllMethods(item.photo_urls[i], existingBrowser);
          }
        }
      }

      if (imageBuffer && imageBuffer.length > 0 && imageBuffer.length <= TelegramBot.MAX_PHOTO_BYTES) {
        await this.sendPhotoBuffer(imageBuffer, caption);
        return;
      }

      // Captura directa si falla la descarga
      if (!imageBuffer && item.url) {
        console.log('🔄 Intentando captura directa del elemento...');
        imageBuffer = await captureImageElement(item.url, existingBrowser);
        if (imageBuffer) {
          await this.sendPhotoBuffer(imageBuffer, caption);
          return;
        }
      }

      // NO enviar si no hay imagen
      console.log('❌ No se pudo obtener imagen, OMITIENDO item (sin foto = sin notificación)');
      throw new Error('No se pudo obtener ninguna imagen para el item');
    } catch (error: any) {
      console.error('❌ Error enviando notificación:', error.message);
      throw error;
    }
  }

  private async sendPhotoBuffer(imageBuffer: Buffer, caption: string): Promise<void> {
    try {
      const formData = new FormData();
      formData.append('photo', imageBuffer, {
        filename: 'item.jpg',
        contentType: 'image/jpeg'
      });

      await axios.post(`${this.baseURL}/sendPhoto`, formData, {
        headers: formData.getHeaders(),
        params: {
          chat_id: this.chatId,
          caption: caption,
          parse_mode: 'Markdown'
        },
        timeout: 45000
      });
      console.log('✅ Foto enviada a Telegram');
    } catch (error: any) {
      console.error(`❌ Error enviando buffer de foto: ${error.message}`);
      throw error;
    }
  }

  private async sendMessage(text: string): Promise<void> {
    try {
      const url = `${this.baseURL}/sendMessage`;
      await axios.post(url, {
        chat_id: this.chatId,
        text: text,
        parse_mode: 'Markdown',
        disable_web_page_preview: false,
      }, {
        timeout: 30000,
      });
    } catch (e: any) {
      console.error('❌ Error enviando mensaje de texto:', e.message);
    }
  }

  static readonly MAX_PHOTO_BYTES = 10 * 1024 * 1024; // 10MB
}
