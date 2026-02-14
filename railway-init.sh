#!/bin/bash
# Railway initialization script
# This script runs before the bot starts and loads cookies from environment variable

echo "🚀 Inicializando bot en Railway..."

# Crear directorios necesarios
mkdir -p /app/cookies /app/logs /app/data
echo "✅ Directorios creados"

# Si existe la variable VINTED_COOKIES y el archivo no existe, crearlo
if [ -n "$VINTED_COOKIES" ] && [ ! -f /app/cookies/vinted.json ]; then
    echo "📝 Creando archivo de cookies desde variable de entorno..."
    echo "$VINTED_COOKIES" > /app/cookies/vinted.json
    echo "✅ Cookies guardadas en /app/cookies/vinted.json"
elif [ -f /app/cookies/vinted.json ]; then
    echo "✅ Archivo de cookies ya existe"
else
    echo "⚠️ No se encontró VINTED_COOKIES ni archivo de cookies existente"
fi

# Verificar permisos
chmod 644 /app/cookies/vinted.json 2>/dev/null || true

echo "🎯 Iniciando bot..."
# Ejecutar el bot
exec node /app/dist/index.js
