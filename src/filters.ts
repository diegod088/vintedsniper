export interface FilterConfig {
  // Filtros de inclusión
  brands?: string[];           // Marcas permitidas
  sizes?: string[];            // Tallas permitidas
  conditions?: string[];       // Estados permitidos (Nuovo, Ottime, etc.)
  minPrice?: number;           // Precio mínimo
  maxPrice?: number;           // Precio máximo

  // Filtros de exclusión
  excludeBrands?: string[];    // Marcas excluidas
  excludeKeywords?: string[];  // Palabras clave excluidas
  excludeConditions?: string[]; // Estados excluidos

  // Configuración adicional
  requireImages?: boolean;      // Requerir imágenes
  maxAge?: number;            // Edad máxima del item en días
  sellerRating?: number;       // Calificación mínima del vendedor
  maxAgeMinutes?: number;      // Edad máxima en minutos
}

export interface FilterResult {
  passed: boolean;
  reasons: string[];
  score: number; // 0-100, mayor es mejor
}

export class AdvancedFilter {
  private config: FilterConfig;

  constructor(config: FilterConfig) {
    this.config = config;
  }

  public filterItem(item: any): FilterResult {
    const result: FilterResult = {
      passed: true,
      reasons: [],
      score: 0
    };

    // Precio
    this.checkPrice(item, result);

    // Marca
    this.checkBrand(item, result);

    // Talla
    this.checkSize(item, result);

    // Estado
    this.checkCondition(item, result);

    // Palabras clave excluidas
    this.checkExcludeKeywords(item, result);

    // Imágenes
    this.checkImages(item, result);

    // Edad del item
    this.checkAge(item, result);

    // Calcular score final
    this.calculateScore(item, result);

    return result;
  }

  private checkPrice(item: any, result: FilterResult): void {
    const price = parseFloat(item.price);

    if (this.config.minPrice && price < this.config.minPrice) {
      result.passed = false;
      result.reasons.push(`Precio ${price}€ inferior al mínimo ${this.config.minPrice}€`);
      return;
    }

    if (this.config.maxPrice && price > this.config.maxPrice) {
      result.passed = false;
      result.reasons.push(`Precio ${price}€ superior al máximo ${this.config.maxPrice}€`);
      return;
    }

    // Score basado en precio (más bajo es mejor)
    if (this.config.maxPrice) {
      result.score += Math.max(0, 100 - (price / this.config.maxPrice * 50));
    }
  }

  private checkBrand(item: any, result: FilterResult): void {
    // En el scraper a veces item.brand viene vacío; la marca puede estar en el título (ej. "brand: Nike" o "Nike")
    const brandFromField = (item.brand || '').toLowerCase();
    const titleLower = (item.title || '').toLowerCase();
    // CRÍTICO: Buscar en AMBOS. Si brandFromField es "Zara" pero titleLower tiene "Nike", queremos detectarlo.
    const textToCheck = `${brandFromField} ${titleLower}`.trim();

    // Filtro de inclusión de marcas (solo estas marcas permitidas)
    if (this.config.brands && this.config.brands.length > 0) {
      console.log(`  - 🔍 Filtrando por marcas permitidas: ${this.config.brands.join(', ')}`);
      console.log(`  - 🔍 Texto a comprobar: "${textToCheck}"`);

      const brandFound = this.config.brands.some(b =>
        textToCheck.includes(b.toLowerCase())
      );

      if (!brandFound) {
        result.passed = false;
        result.reasons.push(`Marca no está en la lista permitida (${this.config.brands.join(', ')})`);
        console.log(`  - ❌ Marca RECHAZADA: no coincide con ninguna permitida`);
        return;
      }

      console.log(`  - ✅ Marca ACEPTADA: coincide con una permitida`);
      result.score += 20; // Bonus por marca deseada
    } else {
      console.log(`  - ℹ️ Sin filtro de marcas (todas permitidas)`);
    }

    // Filtro de exclusión de marcas
    if (this.config.excludeBrands && this.config.excludeBrands.length > 0) {
      const excludedBrand = this.config.excludeBrands.some(b =>
        textToCheck.includes(b.toLowerCase())
      );

      if (excludedBrand) {
        result.passed = false;
        result.reasons.push(`Marca en título/marca está excluida`);
        return;
      }
    }
  }

  private checkSize(item: any, result: FilterResult): void {
    const itemSize = (item.size || '').toLowerCase();
    const titleLower = (item.title || '').toLowerCase();
    // A veces la talla está en el título o en el campo size con slashes (ej: "S / 36 / 8")
    const textToCheck = `${itemSize} ${titleLower}`.trim();

    if (this.config.sizes && this.config.sizes.length > 0) {
      console.log(`  - 🔍 Filtrando por tallas permitidas: ${this.config.sizes.join(', ')}`);
      console.log(`  - 🔍 Talla detectada: "${itemSize}"`);

      const sizeFound = this.config.sizes.some(s =>
        textToCheck.includes(s.toLowerCase())
      );

      if (!sizeFound) {
        result.passed = false;
        result.reasons.push(`Talla "${itemSize}" no está en la lista permitida`);
        console.log(`  - ❌ Talla RECHAZADA: no coincide con ninguna permitida`);
        return;
      }

      console.log(`  - ✅ Talla ACEPTADA: coincide con una permitida`);
      result.score += 15; // Bonus por talla deseada
    } else {
      console.log(`  - ℹ️ Sin filtro de tallas (todas permitidas)`);
    }
  }

  private checkCondition(item: any, result: FilterResult): void {
    const condition = (item.condition || '').toLowerCase();
    const titleLower = (item.title || '').toLowerCase();
    const textToCheck = condition || titleLower;

    // Mapeo de condiciones en italiano a inglés
    const conditionMap: { [key: string]: string } = {
      'nuovo con cartellino': 'new_with_tags',
      'nuovo senza cartellino': 'new_without_tags',
      'ottime': 'very_good',
      'buone': 'good',
      'soddisfacenti': 'satisfactory'
    };

    const normalizedCondition = conditionMap[condition] || condition;
    const normalizedTextToCheck = (conditionMap[condition] || condition) + ' ' + titleLower;

    // Filtro de inclusión de condiciones
    if (this.config.conditions && this.config.conditions.length > 0) {
      const conditionFound = this.config.conditions.some(c =>
        normalizedTextToCheck.includes(c.toLowerCase())
      );

      if (!conditionFound) {
        result.passed = false;
        result.reasons.push(`Estado "${condition}" no está en la lista permitida`);
        return;
      }

      // Score basado en condición
      if (normalizedCondition.includes('new')) {
        result.score += 25;
      } else if (normalizedCondition.includes('very_good')) {
        result.score += 20;
      } else if (normalizedCondition.includes('good')) {
        result.score += 15;
      }
    }

    // Filtro de exclusión de condiciones
    if (this.config.excludeConditions && this.config.excludeConditions.length > 0) {
      const excludedCondition = this.config.excludeConditions.some(c =>
        normalizedCondition.includes(c.toLowerCase())
      );

      if (excludedCondition) {
        result.passed = false;
        result.reasons.push(`Estado "${condition}" está excluido`);
        return;
      }
    }
  }

  private checkExcludeKeywords(item: any, result: FilterResult): void {
    const title = (item.title || '').toLowerCase();
    const description = (item.description || '').toLowerCase();
    const fullText = title + ' ' + description;

    if (this.config.excludeKeywords && this.config.excludeKeywords.length > 0) {
      const excludedKeyword = this.config.excludeKeywords.some(keyword =>
        fullText.includes(keyword.toLowerCase())
      );

      if (excludedKeyword) {
        result.passed = false;
        result.reasons.push('Contiene palabra clave excluida');
        return;
      }
    }
  }

  private checkImages(item: any, result: FilterResult): void {
    if (this.config.requireImages && !item.photo_url) {
      result.passed = false;
      result.reasons.push('No tiene imágenes');
      return;
    }

    if (item.photo_url) {
      result.score += 10; // Bonus por tener imágenes
    }
  }

  private checkAge(item: any, result: FilterResult): void {
    if (!this.config.maxAgeMinutes || !item.time_ago) return;

    const ageInMinutes = this.parseAge(item.time_ago);
    if (ageInMinutes > this.config.maxAgeMinutes) {
      result.passed = false;
      result.reasons.push(`El artículo tiene ${ageInMinutes} minutos (máximo permitido: ${this.config.maxAgeMinutes})`);
    } else {
      // Bonus por ser muy nuevo (menos de 5 min)
      if (ageInMinutes <= 5) result.score += 20;
      else if (ageInMinutes <= 15) result.score += 10;
    }
  }

  private parseAge(timeStr: string): number {
    const str = timeStr.toLowerCase();

    // Segundos
    if (str.includes('second')) return 1;

    // Minutos
    const minMatch = str.match(/(\d+)\s*(?:min|minuti|minute)/);
    if (minMatch) return parseInt(minMatch[1]);

    // Horas
    const hourMatch = str.match(/(\d+)\s*(?:ora|ore|hour)/);
    if (hourMatch) return parseInt(hourMatch[1]) * 60;

    if (str.includes('un\'ora') || str.includes('one hour') || str.includes('una hora')) return 60;

    // Días
    const dayMatch = str.match(/(\d+)\s*(?:giorno|giorni|day)/);
    if (dayMatch) return parseInt(dayMatch[1]) * 24 * 60;

    if (str.includes('un giorno') || str.includes('one day') || str.includes('un día')) return 24 * 60;

    // Si no se reconoce, asumir que es viejo para ser conservadores
    return 9999;
  }

  private calculateScore(item: any, result: FilterResult): void {
    // Score base por pasar todos los filtros
    if (result.passed) {
      result.score += 30;
    }

    // Bonus adicional por palabras clave deseadas en el título
    const title = (item.title || '').toLowerCase();
    const desirableKeywords = ['vintage', 'limited', 'exclusive', 'rare', 'collector'];
    const desirableFound = desirableKeywords.filter(keyword => title.includes(keyword));
    result.score += desirableFound.length * 5;

    // Asegurar que el score esté entre 0 y 100
    result.score = Math.min(100, Math.max(0, result.score));
  }

  public updateConfig(newConfig: Partial<FilterConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  public getConfig(): FilterConfig {
    return { ...this.config };
  }

  // Método estático para crear configuración desde variables de entorno
  public static fromEnv(): FilterConfig {
    return {
      brands: process.env.FILTER_BRANDS?.split(',').map(b => b.trim()).filter(b => b),
      sizes: process.env.FILTER_SIZES?.split(',').map(s => s.trim()).filter(s => s),
      conditions: process.env.FILTER_CONDITIONS?.split(',').map(c => c.trim()).filter(c => c),
      minPrice: process.env.FILTER_MIN_PRICE ? parseFloat(process.env.FILTER_MIN_PRICE) : undefined,
      maxPrice: process.env.FILTER_MAX_PRICE ? parseFloat(process.env.FILTER_MAX_PRICE) : undefined,
      excludeBrands: process.env.EXCLUDE_BRANDS?.split(',').map(b => b.trim()).filter(b => b),
      excludeKeywords: process.env.EXCLUDE_KEYWORDS?.split(',').map(k => k.trim()).filter(k => k),
      excludeConditions: process.env.EXCLUDE_CONDITIONS?.split(',').map(c => c.trim()).filter(c => c),
      requireImages: process.env.REQUIRE_IMAGES === 'true',
      maxAge: process.env.MAX_ITEM_AGE_DAYS ? parseInt(process.env.MAX_ITEM_AGE_DAYS) : undefined,
      sellerRating: process.env.MIN_SELLER_RATING ? parseFloat(process.env.MIN_SELLER_RATING) : undefined
    };
  }
}
