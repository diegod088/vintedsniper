import fs from 'fs';
import path from 'path';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  context?: any;
  module?: string;
}

export class Logger {
  private static instance: Logger;
  private recentLogs: LogEntry[] = [];
  private maxBufferSize: number = 50;
  private logFile: string;
  private logLevel: LogLevel;
  private maxFileSize: number;
  private maxFiles: number;

  constructor(
    logFile: string = 'logs/bot.log',
    logLevel: LogLevel = LogLevel.INFO,
    maxFileSize: number = 10 * 1024 * 1024, // 10MB
    maxFiles: number = 5
  ) {
    this.logFile = path.resolve(logFile);
    this.logLevel = logLevel;
    this.maxFileSize = maxFileSize;
    this.maxFiles = maxFiles;
    this.ensureLogDirectory();
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private ensureLogDirectory(): void {
    const dir = path.dirname(this.logFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private rotateLog(): void {
    try {
      if (fs.existsSync(this.logFile)) {
        const stats = fs.statSync(this.logFile);
        if (stats.size > this.maxFileSize) {
          // Rotar archivos existentes
          for (let i = this.maxFiles - 1; i > 0; i--) {
            const oldFile = `${this.logFile}.${i}`;
            const newFile = `${this.logFile}.${i + 1}`;
            if (fs.existsSync(oldFile)) {
              if (i === this.maxFiles - 1) {
                fs.unlinkSync(oldFile);
              } else {
                fs.renameSync(oldFile, newFile);
              }
            }
          }
          // Renombrar archivo actual
          fs.renameSync(this.logFile, `${this.logFile}.1`);
        }
      }
    } catch (error: any) {
      console.error('❌ Error rotando logs:', error.message);
    }
  }

  private formatMessage(level: string, message: string, context?: any, module?: string): LogEntry {
    const timestamp = new Date().toISOString();
    return {
      timestamp,
      level,
      message,
      context,
      module
    };
  }

  private writeLog(level: LogLevel, levelStr: string, message: string, context?: any, module?: string): void {
    if (level < this.logLevel) return;

    const entry = this.formatMessage(levelStr, message, context, module);
    const formattedMessage = JSON.stringify(entry);

    // Escribir a consola con colores
    const colorCode = this.getColorCode(level);
    const resetCode = this.resetCode;
    console.log(`${colorCode}[${levelStr}]${resetCode} ${message}`);

    // Agregar al buffer de logs recientes para el panel web
    this.recentLogs.unshift(entry);
    if (this.recentLogs.length > this.maxBufferSize) {
      this.recentLogs.pop();
    }

    // Escribir a archivo
    try {
      this.rotateLog();
      fs.appendFileSync(this.logFile, formattedMessage + '\n');
    } catch (error: any) {
      console.error('❌ Error escribiendo log:', error.message);
    }
  }

  public getRecentLogs(): LogEntry[] {
    return [...this.recentLogs];
  }

  private getColorCode(level: LogLevel): string {
    switch (level) {
      case LogLevel.DEBUG: return '\x1b[36m'; // Cyan
      case LogLevel.INFO: return '\x1b[32m';  // Green
      case LogLevel.WARN: return '\x1b[33m';  // Yellow
      case LogLevel.ERROR: return '\x1b[31m'; // Red
      default: return '\x1b[0m';
    }
  }

  private get resetCode(): string {
    return '\x1b[0m';
  }

  public debug(message: string, context?: any, module?: string): void {
    this.writeLog(LogLevel.DEBUG, 'DEBUG', message, context, module);
  }

  public info(message: string, context?: any, module?: string): void {
    this.writeLog(LogLevel.INFO, 'INFO', message, context, module);
  }

  public warn(message: string, context?: any, module?: string): void {
    this.writeLog(LogLevel.WARN, 'WARN', message, context, module);
  }

  public error(message: string, error?: any, module?: string): void {
    const context = error ? {
      message: error.message,
      stack: error.stack,
      name: error.name
    } : undefined;
    this.writeLog(LogLevel.ERROR, 'ERROR', message, context, module);
  }

  public logItemFound(item: any): void {
    this.info(`Item encontrado: ${item.title}`, {
      id: item.id,
      price: item.price,
      brand: item.brand,
      url: item.url
    }, 'VINTED');
  }

  public logItemProcessed(item: any, success: boolean): void {
    this.info(`Item procesado: ${item.title}`, {
      id: item.id,
      success,
      price: item.price
    }, 'PROCESSOR');
  }

  public logTelegramSent(item: any, success: boolean): void {
    this.info(`Notificación Telegram: ${success ? '✅' : '❌'}`, {
      itemId: item.id,
      title: item.title.substring(0, 50) + '...'
    }, 'TELEGRAM');
  }

  public logCacheStats(stats: { total: number; recent: number }): void {
    this.info(`Estadísticas de cache`, stats, 'CACHE');
  }

  public logSearch(keyword: string, found: number, filtered: number): void {
    this.info(`Búsqueda completada`, {
      keyword,
      found,
      filtered,
      timestamp: new Date().toISOString()
    }, 'SEARCH');
  }

  public setLogLevel(level: LogLevel): void {
    this.logLevel = level;
    this.info(`Nivel de log cambiado a ${LogLevel[level]}`, undefined, 'LOGGER');
  }

  public getLogStats(): { size: number; lines: number } {
    try {
      if (!fs.existsSync(this.logFile)) {
        return { size: 0, lines: 0 };
      }
      const stats = fs.statSync(this.logFile);
      const content = fs.readFileSync(this.logFile, 'utf8');
      const lines = content.split('\n').length - 1;
      return { size: stats.size, lines };
    } catch (error: any) {
      this.error('Error obteniendo estadísticas de log', error, 'LOGGER');
      return { size: 0, lines: 0 };
    }
  }
}

// Exportar instancia singleton
export const logger = Logger.getInstance();
