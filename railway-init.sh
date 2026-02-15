#!/bin/bash
# Railway initialization script (Forced Update: 2026-02-14 03:02)
# This script runs before the bot starts and loads cookies from environment variable

echo "🚀 Inicializando bot en Railway como root..."

# Crear directorios necesarios
# Crear directorios necesarios (cookies dentro de data para persistencia única)
mkdir -p /app/data/cookies /app/logs
echo "✅ Directorios creados"

# IMPORTANTE: Cambiar el dueño de las carpetas (especialmente volúmenes montados por Railway)
echo "🔧 Ajustando permisos de volúmenes..."
chown -R botuser:botuser /app/data /app/logs 2>/dev/null || true
chmod -R 777 /app/data /app/logs 2>/dev/null || true

# Si existe la variable VINTED_COOKIES, crear/actualizar el archivo
if [ -n "$VINTED_COOKIES" ]; then
    echo "📝 Actualizando cookies desde variable de entorno..."
    echo "$VINTED_COOKIES" > /app/data/cookies/vinted.json
    chown botuser:botuser /app/data/cookies/vinted.json 2>/dev/null || true
    chmod 666 /app/data/cookies/vinted.json 2>/dev/null || true
    echo "✅ Cookies guardadas en /app/data/cookies/vinted.json"
fi

echo "🎯 Iniciando bot como botuser..."
# Ejecutar el bot como botuser pero manteniendo todas las variables de entorno
# Usamos 'su -m' para mantener el entorno y '--' para pasar los argumentos correctamente
exec su -m botuser -c "node /app/dist/index.js"
