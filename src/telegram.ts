import axios from 'axios';
import FormData from 'form-data';
import { config } from './config';
import { VintedItem } from './types';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import { extractImagesFromItemPage, downloadImageWithAllMethods } from './image-helper';
import { logger } from './logger';

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

  public async sendItemNotification(item: VintedItem): Promise<boolean> {
    const caption = this.formatCaption(item);

    try {
      if (item.photo_urls && item.photo_urls.length > 1) {
        await this.sendMultiplePhotos(item, caption);
      } else {
        await this.sendSinglePhoto(item, caption);
      }
    } catch (error: any) {
      console.error('❌ Error enviando notificación:', error.message);
    }

    return true;
  }

  private formatCaption(item: VintedItem): string {
    const title = item.title.length > 50 ? item.title.substring(0, 50) + '...' : item.title;
    const flag = this.getCountryFlag(item);
    const price = item.price ? `€${item.price.toFixed(2)}` : 'N/A';
    const brand = item.brand || 'N/A';
    const size = item.size || 'N/A';
    const condition = item.condition || 'N/A';
    const url = item.url || '';
    const time = item.time_ago ? `\n🕒 *Caricato:* ${item.time_ago}` : '';
    const locationStr = item.location ? `\n📍 *Località:* ${item.location} ${flag}` : `\n📍 *Origine:* ${flag}`;

    let description = '';
    if (item.description) {
      const cleanDesc = item.description.replace(/[_*`[\]()]/g, ''); // Evitar rotura de Markdown
      // Formatear la descripción de forma más profesional
      description = `\n\n━━━━━━━━━━━━━━\n📝 *Descrizione:*\n_${cleanDesc.substring(0, 300)}${cleanDesc.length > 300 ? '...' : ''}_`;
    }

    return `🎯 *${title}*\n\n💰 *Prezzo:* ${price}\n🏷️ *Marca:* ${brand}\n📏 *Taglia:* ${size}\n✨ *Condizione:* ${condition}${locationStr}${time}${description}\n\n[🔗 Guarda su Vinted](${url})`;
  }

  private getCountryFlag(item: VintedItem): string {
    const location = (item.location || '').toLowerCase();
    const currency = (item.currency || '').toUpperCase();

    if (location.includes('italia') || location.includes('italy')) return '🇮🇹';
    if (location.includes('francia') || location.includes('france')) return '🇫🇷';
    if (location.includes('spagna') || location.includes('spain')) return '🇪🇸';
    if (location.includes('belgio') || location.includes('belgium')) return '🇧🇪';
    if (location.includes('olanda') || location.includes('netherlands')) return '🇳🇱';
    if (location.includes('germania') || location.includes('germany')) return '🇩🇪';
    if (location.includes('portogallo') || location.includes('portugal')) return '🇵🇹';
    if (location.includes('lussemburgo') || location.includes('luxembourg')) return '🇱🇺';
    if (location.includes('austria')) return '🇦🇹';

    // Basado en moneda si la localización falla
    if (currency === 'RON') return '🇷🇴';
    if (currency === 'PLN') return '🇵🇱';
    if (currency === 'CZK') return '🇨🇿';
    if (currency === 'HUF') return '🇭🇺';
    if (currency === 'GBP') return '🇬🇧';
    if (currency === 'SEK') return '🇸🇪';

    return '🌍'; // Genérico Europa/Mundo
  }

  private async sendMultiplePhotos(item: VintedItem, caption: string): Promise<void> {
    let retryCount = 0;
    const maxRetries = 2;

    const attemptSend = async () => {
      try {
        const maxPhotos = Math.min(item.photo_urls!.length, 10);
        const buffers: Buffer[] = [];

        console.log(`📸 Preparando álbum de ${maxPhotos} fotos...`);

        for (let i = 0; i < maxPhotos; i++) {
          try {
            const buffer = await this.downloadVintedImage(item.photo_urls[i]);
            if (buffer && buffer.length > 1000) {
              buffers.push(buffer);
            }
          } catch (err) {
            console.error(`⚠️ Error descargando foto ${i + 1} para el álbum`);
          }
        }

        if (buffers.length === 0) {
          console.log('⚠️ No se pudo descargar ninguna foto, intentando single photo fallback.');
          await this.sendSinglePhoto(item, caption);
          return;
        }

        const formData = new FormData();
        const mediaGroup = buffers.map((buffer, i) => {
          const attachmentName = `photo${i}.jpg`;
          formData.append(attachmentName, buffer, { filename: attachmentName, contentType: 'image/jpeg' });

          return {
            type: 'photo',
            media: attachmentName
          };
        });

        try {
          const response = await axios.post(`${this.baseURL}/sendMediaGroup`, {
            chat_id: this.chatId,
            media: mediaGroup,
            caption: caption,
            parse_mode: 'Markdown'
          }, {
            timeout: 30000
          });

          if (response.data.ok) {
            console.log(`✅ Álbum de ${mediaGroup.length} fotos enviado`);
          } else {
            throw new Error(`Error enviando álbum: ${response.data.description}`);
          }
        } catch (error: any) {
          console.error('❌ Error enviando álbum de fotos:', error.message);
          if (error.response?.status === 429 && retryCount < maxRetries) {
            const retryAfter = (error.response.data?.parameters?.retry_after || 5) + 2;
            console.warn(`⚠️ Telegram Rate Limit (429). Esperando ${retryAfter}s para reintentar...`);
            retryCount++;
            await new Promise(r => setTimeout(r, retryAfter * 1000));
            return await attemptSend();
          }
          console.error('❌ Error enviando álbum de fotos:', error.message);
          await this.sendSinglePhoto(item, caption).catch(() => { });
        }
      } catch (error: any) {
        console.error('❌ Error general en sendMultiplePhotos:', error.message);
        await this.sendSinglePhoto(item, caption).catch(() => { });
      }
    };

    await attemptSend();
  }

  private async sendSinglePhoto(item: VintedItem, caption: string): Promise<void> {
    let imageBuffer: Buffer | null = null;

    try {
      if (item.photo_url) {
        console.log(`📸 Descargando imagen: ${item.photo_url.substring(0, 80)}...`);
        imageBuffer = await this.downloadVintedImage(item.photo_url);

        if (!imageBuffer && item.photo_urls && item.photo_urls.length > 1) {
          for (let i = 1; i < item.photo_urls.length && !imageBuffer; i++) {
            console.log(`📸 Intentando URL alternativa ${i}`);
            imageBuffer = await this.downloadVintedImage(item.photo_urls[i]);
          }
        }
      }

      if (!imageBuffer && item.url) {
        console.log(`🔄 Extrayendo imágenes de la página del item...`);
        const itemPageImages = await extractImagesFromItemPage(item.url);

        if (Array.isArray(itemPageImages) && itemPageImages.length > 0) {
          for (const imageUrl of itemPageImages) {
            if (!imageBuffer) {
              console.log(`📸 Intentando imagen de página item: ${imageUrl.substring(0, 60)}...`);
              imageBuffer = await this.downloadVintedImage(imageUrl);
            }
          }
        }
      }

      if (imageBuffer && imageBuffer.length > 0 && imageBuffer.length <= TelegramBot.MAX_PHOTO_BYTES) {
        await this.sendPhotoBuffer(imageBuffer, caption);
        console.log('✅ Notificación con foto enviada');
        return;
      }

      console.log('📝 Publicando item sin imágenes (texto solamente)');
      await this.sendMessage(caption);
      console.log('✅ Notificación con texto enviada');
      return;
    } catch (error: any) {
      console.error('❌ Error enviando notificación:', error.message);
    }
  }

  private async sendPhotoBuffer(imageBuffer: Buffer, caption: string): Promise<void> {
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
      timeout: 30000
    });
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

  static readonly MAX_PHOTO_BYTES = 10 * 1024 * 1024; // 10MB

  public async sendPhoto(chatId: string, buffer: Buffer, caption: string): Promise<void> {
    const formData = new FormData();
    formData.append('photo', buffer, { filename: 'photo.jpg', contentType: 'image/jpeg' });
    await axios.post(`${this.baseURL}/sendPhoto`, formData, {
      headers: formData.getHeaders(),
      params: { chat_id: chatId, caption, parse_mode: 'Markdown' }
    });
  }
}
