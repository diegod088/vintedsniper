# 🚂 Guía de Despliegue en Railway

## Paso 1: Instalar Railway CLI

```bash
npm i -g @railway/cli
```

## Paso 2: Autenticarse en Railway

```bash
railway login
```

Esto abrirá tu navegador para que inicies sesión.

## Paso 3: Crear el Volumen Persistente

1. Ve a tu proyecto en Railway (https://railway.app)
2. Selecciona tu servicio
3. Ve a **Settings** → **Volumes**
4. Haz clic en **+ New Volume**
5. Configura:
   - **Mount Path**: `/app/cookies`
   - **Size**: 1 GB

## Paso 4: Vincular el Proyecto Localmente

Desde la carpeta del proyecto:

```bash
cd /home/yadied/Escritorio/vinted-sniper-telebot
railway link
```

Selecciona tu proyecto cuando te lo pida.

## Paso 5: Subir las Cookies al Volumen

```bash
# Verificar que las cookies existen localmente
cat cookies/vinted.json

# Subir las cookies a Railway
railway run bash -c "mkdir -p /app/cookies && cat > /app/cookies/vinted.json" < cookies/vinted.json

# Verificar que se subieron correctamente
railway run cat /app/cookies/vinted.json
```

## Paso 6: Configurar Variables de Entorno

En el dashboard de Railway, añade estas variables:

```
TOK=8599394040:AAGuiCHnSbg8VQX3DDz53XQPCFYKTRaNxZw
CHAT_ID=-1003834686492
COOKIE_FILE=/app/cookies/vinted.json
VINTED_BASE_URL=https://www.vinted.it
MAX_PRICE=200
POLL_INTERVAL_MS=4000
MAX_AGE_MINUTES=60
```

## Paso 7: Desplegar

Railway desplegará automáticamente cuando hagas push a tu repositorio Git.

Si quieres desplegar manualmente:

```bash
railway up
```

## Paso 8: Verificar el Despliegue

```bash
# Ver logs en tiempo real
railway logs

# Verificar que las cookies se cargaron
railway run cat /app/cookies/vinted.json
```

## 🔄 Actualizar Cookies en el Futuro

Si necesitas actualizar las cookies más adelante:

```bash
# Generar nuevas cookies localmente
npm run login

# Subirlas a Railway
railway run bash -c "cat > /app/cookies/vinted.json" < cookies/vinted.json

# Reiniciar el servicio
railway restart
```

## ⚠️ Notas Importantes

1. **El volumen persiste** incluso si reinicias o redespliegas el servicio
2. **Las cookies no se borran** al hacer redeploy
3. **Backup de cookies**: Guarda una copia local de `cookies/vinted.json` por si acaso
4. **Logs**: Usa `railway logs` para ver si el bot está funcionando correctamente

## 🐛 Troubleshooting

### Error: "No se encontraron cookies"
```bash
# Verificar que el volumen está montado
railway run ls -la /app/cookies

# Verificar contenido del archivo
railway run cat /app/cookies/vinted.json
```

### Error: "Permission denied"
```bash
# Verificar permisos
railway run ls -la /app/cookies/vinted.json

# Corregir permisos si es necesario
railway run chmod 644 /app/cookies/vinted.json
```
