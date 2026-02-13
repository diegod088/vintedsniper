import axios, { AxiosResponse } from 'axios';
import { config } from './config';
import { CookieManager } from './cookies';

export interface VintedItem {
  id: number;
  title: string;
  price: number;
  currency: string;
  brand: string;
  size: string;
  condition: string;
  url: string;
  photo_url: string;
  seller: {
    id: number;
    login: string;
    business: boolean;
    feedback_reputation: number;
    feedback_count: number;
  };
  created_at: string;
}

export interface VintedApiResponse {
  items: any[];
  pagination?: {
    current_page: number;
    total_pages: number;
  };
}

export class VintedAPI {
  private cookieManager: CookieManager;
  private baseURL: string;

  constructor() {
    this.cookieManager = new CookieManager(config.COOKIE_FILE);
    this.baseURL = config.VINTED_BASE_URL;
  }

  public async searchItems(keyword: string): Promise<VintedItem[]> {
    const cookies = this.cookieManager.load();
    const cookieHeader = this.cookieManager.toAxiosHeaders(cookies);

    const url = `${this.baseURL}/api/v2/catalog/items`;
    const params = {
      search_text: keyword,
      order: 'newest_first',
      per_page: 20,
    };

    const headers: Record<string, string> = {
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'es-ES,es;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Referer': `${this.baseURL}/catalog?search_text=${encodeURIComponent(keyword)}`,
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.537 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };

    if (cookieHeader) {
      headers['Cookie'] = cookieHeader;
    }

    try {
      const response: AxiosResponse<VintedApiResponse> = await axios.get(url, {
        params,
        headers,
        timeout: 15000,
      });

      if (response.data && response.data.items) {
        return response.data.items.map(item => this.parseItem(item));
      }

      return [];
    } catch (error: any) {
      if (error.response?.status === 429) {
        throw new Error('RATE_LIMIT');
      }
      throw error;
    }
  }

  private parseItem(item: any): VintedItem {
    return {
      id: item.id,
      title: item.title || 'Sin título',
      price: parseFloat(item.price?.amount || '0'),
      currency: item.price?.currency || 'EUR',
      brand: item.brand?.title || 'Sin marca',
      size: item.size?.title || 'Talla no especificada',
      condition: this.translateCondition(item.status),
      url: item.url || `${this.baseURL}/items/${item.id}`,
      photo_url: item.photos?.[0]?.url || '',
      seller: {
        id: item.user?.id || 0,
        login: item.user?.login || 'unknown',
        business: item.user?.business || false,
        feedback_reputation: item.user?.feedback_reputation || 0,
        feedback_count: item.user?.feedback_count || 0,
      },
      created_at: item.created_at || new Date().toISOString(),
    };
  }

  private translateCondition(status: string): string {
    const translations: Record<string, string> = {
      'brand_new': 'Nuevo',
      'new': 'Nuevo',
      'new_without_tags': 'Nuevo sin etiquetas',
      'new_with_defects': 'Nuevo con defectos',
      'very_good': 'Muy bueno',
      'good': 'Bueno',
      'fair': 'Aceptable',
      'poor': 'Deficiente',
    };
    return translations[status] || status || 'No especificado';
  }

  public filterItems(items: VintedItem[], keyword: string, maxPrice: number): VintedItem[] {
    const keywordLower = keyword.toLowerCase();

    return items.filter(item => {
      // Filtrar por precio
      if (item.price > maxPrice) {
        return false;
      }

      // Filtrar por keyword en título
      if (!item.title.toLowerCase().includes(keywordLower)) {
        return false;
      }

      // Filtrar vendedores business
      if (item.seller.business) {
        return false;
      }

      return true;
    });
  }
}

export default VintedAPI;
