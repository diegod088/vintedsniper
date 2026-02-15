import fs from 'fs';
import path from 'path';

export interface DynamicSettings {
    SEARCH_TERMS?: string[];
    MAX_PRICE?: number;
    ALLOWED_BRANDS?: string[];
    POLL_INTERVAL_MS?: number;
    SIZES?: string[];
    MAX_AGE_MINUTES?: number;
    EXCLUDE_KEYWORDS?: string[];
    EXCLUDE_CONDITIONS?: string[];
    AUTO_BUY_ENABLED?: boolean;
    PANEL_PASSWORD?: string;
}

export class DynamicConfigManager {
    private filePath: string;

    constructor(filePath: string = 'data/settings.json') {
        this.filePath = path.resolve(filePath);
        this.ensureDir();
    }

    private ensureDir(): void {
        const dir = path.dirname(this.filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    public load(): DynamicSettings {
        try {
            if (fs.existsSync(this.filePath)) {
                const data = fs.readFileSync(this.filePath, 'utf-8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.error('❌ Error loading dynamic settings:', error);
        }
        return {};
    }

    public save(settings: DynamicSettings): void {
        try {
            this.ensureDir();
            fs.writeFileSync(this.filePath, JSON.stringify(settings, null, 2));
            console.log('💾 Configuración persistida en data/settings.json');
        } catch (error) {
            console.error('❌ Error saving dynamic settings:', error);
        }
    }
}

export const dynamicConfigManager = new DynamicConfigManager();
export default dynamicConfigManager;
