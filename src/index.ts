import fs from 'fs';
import path from 'path';
import { config } from './config';
import { VintedAPI } from './vinted';
import { TelegramBot } from './telegram';
import { VintedBuyer } from './buyer';
import { ItemCache } from './cache';
import { logger, LogLevel } from './logger';
import { startTelegramCommands } from './telegramCommands';
import { WebPanel } from './webpanel';
import { execSync } from 'child_process';
import { dynamicConfigManager } from './dynamic-config';

// 🧹 Matar instancias anteriores para evitar conflictos de Telegram (409 Conflict)
try {
  const currentPid = process.pid;
  // Buscar procesos ts-node que ejecuten src/index.ts
  const pids = execSync('pgrep -f "ts-node.*src/index.ts" || true').toString().trim().split('\n');

  if (pids.length > 0) {
    pids.forEach(pidStr => {
      const pid = parseInt(pidStr, 10);
      if (pid && pid !== currentPid && pid !== process.ppid) {
        try {
          const cmd = execSync(`ps -p ${pid} -o args=`).toString();
          // Solo matar si es el proceso del bot real, no nodemon
          if (!cmd.includes('nodemon') && !cmd.includes('grep')) {
            console.log(`🧹 Matando proceso fantasma con PID: ${pid}`);
            // Primero SIGTERM (amable)
            process.kill(pid, 'SIGTERM');

            // Si sigue vivo después de 1s, SIGKILL (agresivo)
            setTimeout(() => {
              try {
                process.kill(pid, 'SIGKILL');
              } catch (e) { }
            }, 1500);
          }
        } catch (e) { }
      }
    });
  }
} catch (e) { }


export interface BotSharedState {
  paused: boolean;
  pollIntervalMs: number;
}

export class SniperBot {
  private vintedAPI: VintedAPI;
  private telegram: TelegramBot;
  private buyer: VintedBuyer;
  private cache: ItemCache;
  private webPanel: WebPanel;
  private isRunning: boolean;
  private backoffUntil: number;
  public sharedState: BotSharedState;

  constructor() {
    this.sharedState = {
      paused: false,
      pollIntervalMs: config.POLL_INTERVAL_MS
    };
    const filterConfig = {
      maxPrice: config.MAX_PRICE,
      brands: config.ALLOWED_BRANDS,
      excludeKeywords: ['bambino', 'bambina', 'kids', 'child'],
      requireImages: true,
    };
    this.vintedAPI = new VintedAPI(filterConfig);
    this.telegram = new TelegramBot();
    this.buyer = new VintedBuyer();
    this.cache = new ItemCache('data/cache.json', 24 * 60 * 60 * 1000); // 24 horas
    this.webPanel = new WebPanel(this, this.sharedState);
    this.isRunning = false;
    this.backoffUntil = 0;

    logger.info('Bot inicializado', {
      version: '2.0',
      searchTerms: config.SEARCH_TERMS,
      allowedBrands: config.ALLOWED_BRANDS ?? 'todos',
      maxPrice: config.MAX_PRICE,
      interval: config.POLL_INTERVAL_MS
    }, 'BOT');
  }

  private isNewItem(itemId: string): boolean {
    return !this.cache.isProcessed(itemId);
  }

  private markAsSeen(item: any): void {
    this.cache.addProcessedItem(item.id.toString(), item.title, parseFloat(item.price));
  }

  private async searchAndProcess(): Promise<void> {
    // Verificar si estamos en backoff
    if (Date.now() < this.backoffUntil) {
      const waitSeconds = Math.ceil((this.backoffUntil - Date.now()) / 1000);
      logger.debug(`En backoff. Esperando ${waitSeconds}s...`, undefined, 'BACKOFF');
      console.log(`⏳ En backoff. Esperando ${waitSeconds}s...`);
      return;
    }

    try {
      logger.info(`Iniciando búsqueda`, {
        searchTerms: config.SEARCH_TERMS,
        maxPrice: config.MAX_PRICE
      }, 'SEARCH');

      console.log(`\n🔍 Buscando marcas: ${config.SEARCH_TERMS.map(k => `"${k}"`).join(', ')} (max ${config.MAX_PRICE}€)`);

      this.cache.cleanup();
      const stats = this.cache.getStats();
      logger.logCacheStats(stats);
      console.log(`📊 Cache: ${stats.total} items totales, ${stats.recent} recientes`);

      // Buscar por cada marca/ término y fusionar resultados (sin duplicados por id)
      const seenIds = new Set<number>();
      const items: Awaited<ReturnType<VintedAPI['searchItems']>> = [];
      for (const term of config.SEARCH_TERMS) {
        const found = await this.vintedAPI.searchItems(term);
        for (const item of found) {
          if (!seenIds.has(item.id)) {
            seenIds.add(item.id);
            items.push(item);
          }
        }
      }

      logger.info(`Items encontrados en búsqueda`, {
        count: items.length,
        searchTerms: config.SEARCH_TERMS
      }, 'VINTED');

      console.log(`📦 Items encontrados en búsqueda: ${items.length}`);

      if (items.length === 0) {
        logger.warn('No se encontraron items en la búsqueda', { searchTerms: config.SEARCH_TERMS }, 'VINTED');
        console.log('📭 No se encontraron items en la búsqueda');
        return;
      }

      console.log(`📦 Encontrados ${items.length} items`);

      const filtered = this.vintedAPI.filterItems(items, config.SEARCH_TERMS, config.MAX_PRICE);

      logger.logSearch(config.SEARCH_TERMS.join(','), items.length, filtered.length);
      console.log(`✅ ${filtered.length} items pasan los filtros`);

      // Mostrar detalles de los items filtrados
      if (filtered.length > 0) {
        filtered.forEach((item, index) => {
          logger.logItemFound(item);
          console.log(`  ${index + 1}. ${item.title} - ${item.price}€ - ID: ${item.id}`);
        });
      }

      // Procesar items nuevos
      let newItemsCount = 0;
      for (const item of filtered) {
        if (this.isNewItem(item.id.toString())) {
          newItemsCount++;
          logger.info(`Procesando nuevo item`, {
            id: item.id,
            title: item.title,
            price: item.price
          }, 'PROCESSOR');

          console.log(`\n🆕 NUEVO ITEM: ${item.title} - ${item.price}€`);

          // Verificar explícitamente que tenga imagen válida antes de enviar
          if (!item.photo_url || item.photo_url.length < 10) {
            console.log(`⚠️ Saltando item ${item.id} - No tiene imagen válida`);
            logger.warn('Saltando item sin imagen', { itemId: item.id }, 'PROCESSOR');
            this.markAsSeen(item);
            continue;
          }

          // Enviar notificación a Telegram (reutilizando browser para detalles)
          try {
            const sharedBrowser = await this.vintedAPI.getBrowser();
            const sent = await this.telegram.sendItemNotification(item, sharedBrowser);
            if (sent) {
              logger.logTelegramSent(item, true);
            }
          } catch (error: any) {
            logger.error(`Error enviando notificación Telegram`, error, 'TELEGRAM');
            logger.logTelegramSent(item, false);
          }

          // Intentar compra automática (si está activada)
          if (config.AUTO_BUY_ENABLED) {
            console.log('🛒 Intentando compra automática...');
            try {
              const bought = await this.buyer.buyItem(item.id);
              if (bought) {
                logger.info(`Compra exitosa`, { itemId: item.id }, 'BUYER');
                await this.telegram.sendSystemMessage(`✅ ¡COMPRA EXITOSA! Item ${item.id}`);
              }
            } catch (error: any) {
              logger.error(`Error en compra automática`, error, 'BUYER');
            }
          } else {
            console.log('🛒 Compra automática desactivada en configuración');
          }

          // Marcar como visto
          this.markAsSeen(item);
          logger.logItemProcessed(item, true);
        }
      }

      if (newItemsCount === 0) {
        logger.debug('No hay items nuevos que procesar', undefined, 'PROCESSOR');
        console.log('📭 No hay items nuevos que procesar');
      } else {
        logger.info(`Procesamiento completado`, {
          newItems: newItemsCount,
          totalFiltered: filtered.length
        }, 'PROCESSOR');
        console.log(`\n🎯 Procesados ${newItemsCount} items nuevos`);
      }

    } catch (error: any) {
      if (error.message === 'RATE_LIMIT') {
        logger.error('Rate limit detectado', error, 'RATE_LIMIT');
        console.error('❌ Rate limit detectado (429)');
        this.backoffUntil = Date.now() + config.BACKOFF_DELAY_MS;
        console.log(`⏸️ Backoff activado por ${config.BACKOFF_DELAY_MS / 1000}s`);
      } else {
        logger.error('Error en búsqueda', error, 'SEARCH');
        console.error('❌ Error en búsqueda:', error.message);
      }
    }
  }

  public async start(): Promise<void> {
    this.isRunning = true;

    // Iniciar el panel web
    const port = process.env.PORT ? parseInt(process.env.PORT) : 3001;
    this.webPanel.start(port);

    logger.info('Bot iniciado', {
      version: '2.0',
      pid: process.pid,
      nodeVersion: process.version
    }, 'BOT');

    console.log('╔══════════════════════════════════════╗');
    console.log('║     🎯 VINTED SNIPER BOT v2.0       ║');
    console.log('╚══════════════════════════════════════╝');
    const isBrandMode = !!config.ALLOWED_BRANDS;
    console.log(isBrandMode ? `🏷️ Marcas (todos los productos): ${config.SEARCH_TERMS.join(', ')}` : `🔤 Palabras clave: ${config.SEARCH_TERMS.join(', ')}`);
    if (!isBrandMode) console.log('💡 Tip: Pon BRANDS=Nike,Adidas,... en .env para buscar por marcas (camisetas, pantalones, etc.)');
    console.log(`💰 Max Price: ${config.MAX_PRICE}€`);
    console.log(`⏱️ Interval: ${config.POLL_INTERVAL_MS / 1000}s`);
    console.log('');



    startTelegramCommands(this.sharedState, () => ({
      searchTerms: config.SEARCH_TERMS,
      maxPrice: config.MAX_PRICE,
      paused: this.sharedState.paused,
      cacheTotal: this.getCacheStats().total,
      cacheRecent: this.getCacheStats().recent,
    }), this.updatePollInterval.bind(this));

    // Bucle principal (respeta pausa desde Telegram)
    while (this.isRunning) {
      if (this.sharedState.paused) {
        await this.sleep(5000);
        continue;
      }
      await this.searchAndProcess();

      // Esperar antes de la próxima búsqueda
      await this.sleep(this.sharedState.pollIntervalMs);
    }
  }

  /**
   * Actualiza el intervalo de búsqueda y lo persiste
   */
  public updatePollInterval(ms: number): void {
    this.sharedState.pollIntervalMs = ms;
    const settings = dynamicConfigManager.load();
    settings.POLL_INTERVAL_MS = ms;
    dynamicConfigManager.save(settings);
    logger.info(`Intervalo de búsqueda actualizado: ${ms}ms`, undefined, 'BOT');
    console.log(`⏱️ Intervalo de búsqueda actualizado a ${ms / 1000}s`);
  }

  public getCacheStats(): { total: number; recent: number } {
    return this.cache.getStats();
  }

  /**
   * Aplica cambios de configuración en tiempo de ejecución
   */
  public applyConfig(filterUpdates: any): void {
    // Actualizar filtros en la API de Vinted
    this.vintedAPI.updateFilterConfig(filterUpdates);

    logger.info('Configuración aplicada dinámicamente', {
      searchTerms: config.SEARCH_TERMS,
      maxPrice: config.MAX_PRICE,
      filters: filterUpdates
    }, 'BOT');

    console.log('⚙️ Configuración actualizada desde el panel web');
  }

  public async stop(): Promise<void> {
    this.isRunning = false;
    this.webPanel.stop();
    logger.info(`Status final`, {
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage()
    }, 'BOT');

    // Cerrar browser de Vinted si está abierto
    await this.vintedAPI.closeBrowser();

    console.log('\n👋 Bot detenido');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Manejar señales de terminación
const bot = new SniperBot();

process.on('SIGINT', () => {
  console.log('\n⚠️ SIGINT recibido');
  bot.stop();
  setTimeout(() => process.exit(0), 500);
});

process.on('SIGTERM', () => {
  console.log('\n⚠️ SIGTERM recibido');
  bot.stop();
  setTimeout(() => process.exit(0), 500);
});

// Iniciar bot
bot.start().catch((error) => {
  console.error('💥 Error fatal:', error);
  process.exit(1);
});
