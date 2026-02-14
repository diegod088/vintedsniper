import fs from 'fs';
import path from 'path';

interface CacheItem {
  id: string;
  timestamp: number;
  title: string;
  price: number;
}

export class ItemCache {
  private cacheFile: string;
  private cache: Map<string, CacheItem>;
  private maxAge: number; // Tiempo en milisegundos (24 horas por defecto)

  constructor(cacheFile: string = 'data/cache.json', maxAge: number = 24 * 60 * 60 * 1000) {
    this.cacheFile = path.resolve(cacheFile);
    this.maxAge = maxAge;
    this.cache = new Map();
    this.loadCache();
  }

  private loadCache(): void {
    try {
      // Asegurar que el directorio exista y sea accesible
      const dir = path.dirname(this.cacheFile);
      if (!fs.existsSync(dir)) {
        console.log(`📂 Creando directorio de cache: ${dir}`);
        fs.mkdirSync(dir, { recursive: true, mode: 0o777 });
      }

      if (fs.existsSync(this.cacheFile)) {
        const content = fs.readFileSync(this.cacheFile, 'utf8');
        if (content.trim()) {
          const data = JSON.parse(content);
          this.cache = new Map(data);
          console.log(`📂 Cache cargado: ${this.cache.size} items`);
        } else {
          console.log('📂 Archivo de cache vacío, iniciando nuevo');
          this.cache = new Map();
        }
      } else {
        console.log('📂 No se encontró archivo de cache, se creará al guardar.');
      }
    } catch (error: any) {
      console.error('❌ Error cargando cache:', error.message);
      if (error.code === 'EACCES') {
        console.error('👉 Tip: Revisa los permisos de la carpeta "data" o el archivo "cache.json"');
      }
      this.cache = new Map();
    }
  }

  private saveCache(): void {
    try {
      const dir = path.dirname(this.cacheFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o777 });
      }

      const data = JSON.stringify(Array.from(this.cache.entries()));
      fs.writeFileSync(this.cacheFile, data, { encoding: 'utf8', mode: 0o666 });
    } catch (error: any) {
      console.error('❌ Error guardando cache:', error.message);
      if (error.code === 'EACCES') {
        console.error('👉 Error de permisos al escribir cache en Railway. Intentando usar /tmp como fallback...');
        // Opcional: Fallback a /tmp si falla en Railway
        // this.cacheFile = path.join('/tmp', path.basename(this.cacheFile));
      }
    }
  }

  public isProcessed(itemId: string): boolean {
    const item = this.cache.get(itemId);
    if (!item) return false;

    // Verificar si el item ha expirado
    const now = Date.now();
    if (now - item.timestamp > this.maxAge) {
      this.cache.delete(itemId);
      return false;
    }

    return true;
  }

  public addItem(item: CacheItem): void {
    this.cache.set(item.id, {
      ...item,
      timestamp: Date.now()
    });
    this.saveCache();
  }

  public addProcessedItem(itemId: string, title: string, price: number): void {
    this.addItem({
      id: itemId,
      timestamp: Date.now(),
      title,
      price
    });
  }

  public cleanup(): void {
    const now = Date.now();
    let deleted = 0;

    for (const [id, item] of this.cache.entries()) {
      if (now - item.timestamp > this.maxAge) {
        this.cache.delete(id);
        deleted++;
      }
    }

    if (deleted > 0) {
      console.log(`🧹 Limpieza de cache: ${deleted} items eliminados`);
      this.saveCache();
    }
  }

  public getStats(): { total: number; recent: number } {
    const now = Date.now();
    const recent = Array.from(this.cache.values()).filter(
      item => now - item.timestamp < 60 * 60 * 1000 // Última hora
    ).length;

    return {
      total: this.cache.size,
      recent
    };
  }

  public clear(): void {
    this.cache.clear();
    this.saveCache();
    console.log('🗑️ Cache limpiado');
  }
}
