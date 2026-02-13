import fs from 'fs';
import path from 'path';

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
    return cookies.map(c => ({
      name: c.name,
      value: c.value,
      domain: c.domain || '.vinted.es',
      path: c.path || '/',
      expires: c.expires || -1,
      httpOnly: c.httpOnly || false,
      secure: c.secure || true,
      sameSite: c.sameSite || 'Lax'
    }));
  }
}

export default CookieManager;
