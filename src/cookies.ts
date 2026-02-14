import fs from 'fs';
import path from 'path';
import { config } from './config';

export interface Cookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

export class CookieManager {
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.ensureDir();
  }

  private ensureDir(): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  public load(): Cookie[] {
    try {
      if (!fs.existsSync(this.filePath)) {
        return [];
      }
      const data = fs.readFileSync(this.filePath, 'utf-8');
      const cookies = JSON.parse(data) as Cookie[];
      console.log(`🍪 Cargadas ${cookies.length} cookies desde ${this.filePath}`);
      return cookies;
    } catch (error) {
      console.error('❌ Error cargando cookies:', error);
      return [];
    }
  }

  public save(cookies: Cookie[]): void {
    try {
      this.ensureDir();
      fs.writeFileSync(this.filePath, JSON.stringify(cookies, null, 2));
      console.log(`💾 Guardadas ${cookies.length} cookies en ${this.filePath}`);
    } catch (error) {
      console.error('❌ Error guardando cookies:', error);
    }
  }

  public exists(): boolean {
    return fs.existsSync(this.filePath);
  }

  public toAxiosHeaders(cookies: Cookie[]): string {
    return cookies.map(c => `${c.name}=${c.value}`).join('; ');
  }

  public toPuppeteerCookies(cookies: Cookie[]): any[] {
    return cookies.map(c => {
      const pCookie: any = {
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        expires: c.expires,
        httpOnly: c.httpOnly,
        secure: c.secure
      };

      // Sanitize sameSite
      if (c.sameSite) {
        const ss = c.sameSite.toLowerCase();
        if (ss === 'strict' || ss === 'lax' || ss === 'none') {
          pCookie.sameSite = c.sameSite.charAt(0).toUpperCase() + ss.slice(1);
        }
      }

      return pCookie;
    });
  }
}

export default CookieManager;
