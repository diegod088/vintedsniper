#!/bin/bash
# Railway initialization script
# This script runs before the bot starts and loads cookies from environment variable

echo "🚀 Inicializando bot en Railway como root..."

# Crear directorios necesarios
mkdir -p /app/cookies /app/logs /app/data
echo "✅ Directorios creados"

# IMPORTANTE: Cambiar el dueño de las carpetas (especialmente volúmenes montados por Railway)
echo "🔧 Ajustando permisos de volúmenes..."
chown -R botuser:botuser /app/cookies /app/logs /app/data 2>/dev/null || true
chmod -R 777 /app/cookies /app/logs /app/data 2>/dev/null || true

# Si existe la variable VINTED_COOKIES, crear/actualizar el archivo
if [ -n "$VINTED_COOKIES" ]; then
    echo "📝 Actualizando cookies desde variable de entorno..."
    echo "$VINTED_COOKIES" > /app/cookies/vinted.json
    chown botuser:botuser /app/cookies/vinted.json 2>/dev/null || true
    chmod 666 /app/cookies/vinted.json 2>/dev/null || true
    echo "✅ Cookies guardadas"
fi

echo "🎯 Iniciando bot como botuser..."
# Ejecutar el bot como botuser pero manteniendo todas las variables de entorno
# Usamos 'su -m' para mantener el entorno y '--' para pasar los argumentos correctamente
exec su -m botuser -c "node /app/dist/index.js"
