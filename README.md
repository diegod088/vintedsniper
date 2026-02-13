# 🎯 Vinted Sniper TeleBot

Bot automático para Vinted que busca items, notifica por Telegram y realiza autocompras.

## 📁 Estructura

```
vinted-sniper-telebot/
├── src/
│   ├── index.ts          # Bucle principal
│   ├── config.ts         # Configuración (.env)
│   ├── vinted.ts         # API Vinted + parseo
│   ├── telegram.ts       # Envío Telegram
│   ├── buyer.ts          # Autocompra 1-click
│   ├── cookies.ts        # Gestión cookies
│   └── quick-login.ts    # Captura cookies
├── cookies/              # Cookies persistentes
├── logs/                 # Logs y screenshots
├── .env                  # Variables de entorno
├── docker-compose.yml    # Orquestación Docker
└── Dockerfile            # Build multietapa
```

## 🚀 Instalación

### 1. Clonar y entrar al directorio

```bash
cd vinted-sniper-telebot
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
# Editar .env con tus datos
```

Variables requeridas (una de las dos opciones):

**Opción 1 – Solo marcas (recomendado):** busca cualquier producto (camisetas, pantalones, cinturones, etc.) de esas marcas.
- `BRANDS` - Marcas separadas por coma. Ej: `BRANDS=Nike,Adidas,Carhartt,Stone Island,Lacoste,Polo Ralph Lauren,Dickies,The North Face,Tommy Hilfiger`

**Opción 2 – Palabras clave:**
- `KEYWORD` - Un término (ej: "nike dunk") o `KEYWORDS=term1,term2` para varios.

Comunes:
- `MAX_PRICE` - Precio máximo en €
- `TOK` - Token del bot Telegram (@BotFather)
- `CHAT_ID` - ID del chat o canal (@tucanal)
- `COOKIE_FILE` - Ruta cookies (default: cookies/vinted.json)

Opcional:
- `DEBUG_SCREENSHOT=true` - Guarda `debug-screenshot.png` en cada búsqueda (útil para depurar).

### 3. Capturar cookies de Vinted

**Método 1: Script automático**
```bash
npm install
npm run login
```

**Método 2: Manual**
1. Inicia sesión en Vinted.es con tu navegador
2. Abre DevTools → Application → Cookies
3. Copia las cookies a `cookies/vinted.json`

Formato:
```json
[
  {
    "name": "_vinted_fr_session",
    "value": "tu_cookie_aqui",
    "domain": ".vinted.es",
    "path": "/"
  }
]
```

## 🐳 Docker Compose (Recomendado)

### 1. Construir y ejecutar

```bash
docker-compose up -d
```

### 2. Ver logs

```bash
docker-compose logs -f bot
```

### 3. Detener

```bash
docker-compose down
```

## 🛠️ Desarrollo Local

```bash
# Instalar dependencias
npm install

# Modo desarrollo (con hot reload)
npm run dev

# Compilar
npm run build

# Ejecutar compilado
npm start
```

## ⚙️ Funcionalidad

### Panel de control por Telegram
En el chat del bot puedes enviar:
- **/start** – Abre el panel con botones: Status, Pausar, Reanudar
- **/status** – Ver marcas/términos, precio máx, estado (activo/pausado) y cache
- **/pause** – Pausar búsquedas (no se procesan items hasta /resume)
- **/resume** – Reanudar
- **/help** – Lista de comandos

Así puedes pausar o reanudar el bot sin reiniciarlo.

### Búsqueda (cada 4s)
- GET a `/api/v2/catalog/items?search_text=${KEYWORD}&order=newest_first`
- Filtra: precio ≤ MAX_PRICE, título incluye KEYWORD, vendedor no business

### Notificación Telegram
- Foto del item
- Título, precio, marca, talla
- Info del vendedor (reputación, reviews)
- Link directo a Vinted

### Autocompra (opcional)
- Navega a `/transaction/{id}/buy`
- Pulsa "Comprar" y confirma
- Usa dirección guardada

### Persistencia
- `seen.json` - IDs ya procesados (no repite)
- `cookies/vinted.json` - Sesión persistente
- `logs/` - Screenshots de errores

## 🛡️ Manejo de errores

- **Rate limit (429)**: Backoff 30s automático
- **Sesión expirada**: Requiere recapturar cookies
- **Item no disponible**: Skip y continúa
- **Error de red**: Reintento automático

## 📊 Scripts

```bash
npm run dev      # Desarrollo con nodemon
npm run build    # Compilar TypeScript
npm start        # Ejecutar producción
npm run login    # Capturar cookies
```

## ⚠️ Disclaimer

Este bot es para fines educativos. El uso de bots en Vinted puede violar sus Términos de Servicio. Úsalo bajo tu propia responsabilidad.

## 📄 Licencia

MIT
