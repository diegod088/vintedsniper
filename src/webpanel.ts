import express from 'express';
import cors from 'cors';
import path from 'path';
import { SniperBot, BotSharedState } from './index';
import { config } from './config';
import { dynamicConfigManager } from './dynamic-config';

export class WebPanel {
    private app: express.Application;
    private server: any;
    private bot: SniperBot;
    private sharedState: BotSharedState;

    constructor(bot: SniperBot, sharedState: BotSharedState) {
        this.app = express();
        this.bot = bot;
        this.sharedState = sharedState;

        this.setupMiddleware();
        this.setupRoutes();
    }

    private setupMiddleware(): void {
        this.app.use(cors());
        this.app.use(express.json());

        // Basic Auth Middleware
        this.app.use((req, res, next) => {
            if (!config.PANEL_PASSWORD) {
                console.log('⚠️ PANEL_PASSWORD no configurado. El panel web no tendrá contraseña.');
                return next();
            }
            // console.log('🔐 PANEL_PASSWORD configurado. Autenticación básica activada.');

            const authHeader = req.headers.authorization;
            if (!authHeader) {
                res.setHeader('WWW-Authenticate', 'Basic realm="Web Panel"');
                return res.status(401).send('Authentication required');
            }

            const auth = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
            const password = auth[1];

            if (password === config.PANEL_PASSWORD) {
                next();
            } else {
                res.setHeader('WWW-Authenticate', 'Basic realm="Web Panel"');
                return res.status(401).send('Invalid password');
            }
        });

        this.app.use(express.static(path.join(__dirname, '../public')));
    }

    private setupRoutes(): void {
        // API Routes
        this.app.get('/api/status', this.getStatus.bind(this));
        this.app.get('/api/config', this.getConfig.bind(this));
        this.app.post('/api/config', this.updateConfig.bind(this));
        this.app.post('/api/control', this.controlBot.bind(this));
        this.app.get('/api/stats', this.getStats.bind(this));
        this.app.get('/api/logs', this.getLogs.bind(this));

        // Serve the main panel
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, '../public/index.html'));
        });
    }

    private getStatus(req: express.Request, res: express.Response) {
        res.json({
            running: !this.sharedState.paused,
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            timestamp: new Date().toISOString()
        });
    }

    private getConfig(req: express.Request, res: express.Response) {
        res.json({
            searchTerms: config.SEARCH_TERMS,
            maxPrice: config.MAX_PRICE,
            allowedBrands: config.ALLOWED_BRANDS,
            pollInterval: config.POLL_INTERVAL_MS,
            backoffDelay: config.BACKOFF_DELAY_MS,
            vintedBaseUrl: config.VINTED_BASE_URL,
            maxAgeMinutes: config.MAX_AGE_MINUTES
        });
    }

    private async updateConfig(req: express.Request, res: express.Response) {
        try {
            const { searchTerms, maxPrice, allowedBrands, pollInterval, excludeKeywords, sizes, maxAgeMinutes } = req.body;

            const parseListHelper = (val: any) => {
                if (val === undefined || val === null) return undefined;
                if (Array.isArray(val)) return val.map(s => String(s).trim()).filter(Boolean);
                if (typeof val !== 'string') return [String(val).trim()];

                let result: string[] = [];
                if (val.includes(',')) {
                    result = val.split(',').map((s: string) => s.trim());
                } else {
                    result = val.split(/\s+/).map((s: string) => s.trim());
                }
                return result.filter(Boolean);
            };

            // Actualizar config en memoria
            if (searchTerms !== undefined) {
                config.SEARCH_TERMS = parseListHelper(searchTerms) || config.SEARCH_TERMS;
            }

            if (maxPrice !== undefined) {
                config.MAX_PRICE = parseFloat(String(maxPrice).replace(',', '.'));
            }

            if (allowedBrands !== undefined) {
                config.ALLOWED_BRANDS = parseListHelper(allowedBrands);
                if (config.ALLOWED_BRANDS && config.ALLOWED_BRANDS.length === 0) config.ALLOWED_BRANDS = undefined;
            }

            if (pollInterval) {
                this.bot.updatePollInterval(parseInt(String(pollInterval)));
            }

            if (maxAgeMinutes !== undefined) {
                config.MAX_AGE_MINUTES = parseInt(String(maxAgeMinutes));
            }

            // Propagar cambios a los filtros del bot
            const filterUpdates: any = {
                maxPrice: config.MAX_PRICE,
                brands: config.ALLOWED_BRANDS,
                maxAgeMinutes: config.MAX_AGE_MINUTES
            };

            if (excludeKeywords !== undefined) {
                filterUpdates.excludeKeywords = parseListHelper(excludeKeywords);
            }

            if (sizes !== undefined) {
                filterUpdates.sizes = parseListHelper(sizes);
            }

            // Persistir configuración
            dynamicConfigManager.save({
                SEARCH_TERMS: config.SEARCH_TERMS,
                MAX_PRICE: config.MAX_PRICE,
                ALLOWED_BRANDS: config.ALLOWED_BRANDS,
                POLL_INTERVAL_MS: config.POLL_INTERVAL_MS,
                SIZES: filterUpdates.sizes,
                MAX_AGE_MINUTES: config.MAX_AGE_MINUTES,
                EXCLUDE_KEYWORDS: filterUpdates.excludeKeywords
            });

            // Notificar al bot que aplique los cambios
            this.bot.applyConfig(filterUpdates);

            res.json({
                success: true,
                config: {
                    searchTerms: config.SEARCH_TERMS,
                    maxPrice: config.MAX_PRICE,
                    allowedBrands: config.ALLOWED_BRANDS,
                    pollInterval: config.POLL_INTERVAL_MS,
                    maxAgeMinutes: config.MAX_AGE_MINUTES,
                    ...filterUpdates
                }
            });
        } catch (error: any) {
            console.error('❌ Error en updateConfig:', error);
            if (!res.headersSent) {
                res.status(500).json({ success: false, error: error.message });
            }
        }
    }

    private controlBot(req: express.Request, res: express.Response) {
        try {
            const { action } = req.body;

            switch (action) {
                case 'pause':
                    this.sharedState.paused = true;
                    res.json({ success: true, status: 'paused' });
                    break;
                case 'resume':
                    this.sharedState.paused = false;
                    res.json({ success: true, status: 'running' });
                    break;
                case 'restart':
                    // Restart would require more complex implementation
                    res.json({ success: false, error: 'Restart not implemented yet' });
                    break;
                default:
                    res.status(400).json({ success: false, error: 'Invalid action' });
            }
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }

    private getStats(req: express.Request, res: express.Response) {
        const cacheStats = this.bot.getCacheStats();
        res.json({
            cache: cacheStats,
            timestamp: new Date().toISOString()
        });
    }

    private getLogs(req: express.Request, res: express.Response) {
        // This would require implementing log storage
        res.json({
            logs: [],
            timestamp: new Date().toISOString()
        });
    }

    public start(port: number = 3001): void {
        this.server = this.app.listen(port, () => {
            console.log(`🌐 Panel de control disponible en http://localhost:${port}`);
        });
    }

    public stop(): void {
        if (this.server) {
            this.server.close();
        }
    }
}
