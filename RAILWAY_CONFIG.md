# 🚂 Configuración Final de Railway

## ✅ Archivos Preparados

- ✅ `railway-init.sh` - Script de inicialización
- ✅ `Dockerfile` - Actualizado para usar el script
- ✅ Proyecto vinculado con Railway CLI

## 📋 Variables de Entorno para Railway

Copia y pega estas variables en el dashboard de Railway (**Settings** → **Variables**):

### Variables Básicas

```
TOK=8599394040:AAGuiCHnSbg8VQX3DDz53XQPCFYKTRaNxZw
CHAT_ID=-1003834686492
COOKIE_FILE=/app/cookies/vinted.json
VINTED_BASE_URL=https://www.vinted.it
MAX_PRICE=200
POLL_INTERVAL_MS=4000
MAX_AGE_MINUTES=60
```

### Variable de Cookies (IMPORTANTE)

Añade esta variable con el contenido completo de tus cookies:

**Nombre:** `VINTED_COOKIES`

**Valor:** (Copia el contenido del archivo `cookies/vinted.json` - está en el siguiente bloque)

```json
[{"name":"_gcl_au","value":"1.1.1337893929.1739011241","domain":".vinted.it","hostOnly":false,"path":"/","secure":false,"httpOnly":false,"sameSite":"lax","session":false,"firstPartyDomain":"","partitionKey":null,"expirationDate":1746787241,"storeId":null},{"name":"_ga","value":"GA1.1.1337893929.1739011241","domain":".vinted.it","hostOnly":false,"path":"/","secure":false,"httpOnly":false,"sameSite":"lax","session":false,"firstPartyDomain":"","partitionKey":null,"expirationDate":1804843229.696,"storeId":null},{"name":"_ga_BNVQH1FQNP","value":"GS1.1.1771017922.3.1.1771018529.60.0.0","domain":".vinted.it","hostOnly":false,"path":"/","secure":false,"httpOnly":false,"sameSite":"lax","session":false,"firstPartyDomain":"","partitionKey":null,"expirationDate":1804843229.696,"storeId":null},{"name":"OTAdditionalConsentString","value":"1~","domain":".vinted.it","hostOnly":false,"path":"/","secure":false,"httpOnly":false,"sameSite":"lax","session":false,"firstPartyDomain":"","partitionKey":null,"expirationDate":1785835241,"storeId":null},{"name":"is_shipping_fees_applied_info_banner_dismissed","value":"false","domain":"www.vinted.it","hostOnly":true,"path":"/","secure":false,"httpOnly":false,"sameSite":null,"session":false,"firstPartyDomain":"","partitionKey":null,"expirationDate":1804843233.642,"storeId":null},{"name":"anonymous-locale","value":"it-fr","domain":"www.vinted.it","hostOnly":true,"path":"/","secure":false,"httpOnly":false,"sameSite":"lax","session":false,"firstPartyDomain":"","partitionKey":null,"expirationDate":1805577922.513,"storeId":null},{"name":"viewport_size","value":"1387","domain":"www.vinted.it","hostOnly":true,"path":"/","secure":false,"httpOnly":false,"sameSite":null,"session":false,"firstPartyDomain":"","partitionKey":null,"expirationDate":1771104328.73,"storeId":null},{"name":"OptanonConsent","value":"isGpcEnabled=1&datestamp=Fri+Feb+13+2026+22%3A25%3A29+GMT%2B0100+(hora+est%C3%A1ndar+de+Europa+central)&version=202512.1.0&browserGpcFlag=1&isIABGlobal=false&consentId=3134823156&isAnonUser=0&interactionCount=2&intType=2&hosts=&landingPath=NotLandingPage&groups=C0001%3A1%2CC0002%3A0%2CC0003%3A0%2CC0004%3A0%2CC0005%3A0%2CV2STACK42%3A0%2CC0035%3A0%2CC0038%3A0&genVendors=V2%3A0%2CV1%3A0%2C&crTime=1770283241677&geolocation=IT%3B25&AwaitingReconsent=false","domain":".vinted.it","hostOnly":false,"path":"/","secure":false,"httpOnly":false,"sameSite":"lax","session":false,"firstPartyDomain":"","partitionKey":null,"expirationDate":1786569929,"storeId":null},{"name":"refresh_token_web","value":"eyJraWQiOiJFNTdZZHJ1SHBsQWp1MmNObzFEb3JIM2oyN0J1NS1zX09QNVB3UGlobjVNIiwiYWxnIjoiUFMyNTYifQ.eyJhY2NvdW50X2lkIjozMTM5MjAzNjkxLCJhcHBfaWQiOjQsImF1ZCI6ImZyLmNvcmUuYXBpIiwiY2xpZW50X2lkIjoid2ViIiwiZXhwIjoxNzcxNjIyNzI2LCJpYXQiOjE3NzEwMTc5MjYsImlzcyI6InZpbnRlZC1pYW0tc2VydmljZSIsImxvZ2luX3R5cGUiOjMsInB1cnBvc2UiOiJyZWZyZXNoIiwicm9sZXMiOiIiLCJzY29wZSI6InVzZXIiLCJzaWQiOiJiODlkYWIxNi0xNzcxMDE3OTI2Iiwic3ViIjoiMzEzNDgyMzE1NiIsImNjIjoiSVQiLCJhbmlkIjoiMzA5MGMwMTItMmM3NS00YzExLWI5MWUtZjJkNzIxYWMyMjBjIiwiYWN0Ijp7InN1YiI6IjMxMzQ4MjMxNTYifX0.wMMVSX8UyBbWpiNy_4Cq0MSHooDpe3L4kLHp8Ad6M0EIJ7B5dnJyTjhV3ymIXekd3Y6n8fnYoFWL817r5LKWd4c7xYxeTeLkkKnEebMZkqgYKa12VVr96VOWeMHPRKZNdLA3aLvPwFFcLxHILaNeQW9Ou66tY28FSgwN1FE0FN81inw-NiFxlU99Ww9LVE_ZUbI0m7fC-pQZ2lWFXefeonOJbp92IUDYLPzgOidjjLLjjWuP5O7w-VxVweGmfWQG_YqNLlS6iTbMfPdJCLQsZF82ZDI1wAlFXf2Hao8-Jruv0jT5434wNIpNGO2erCLBV-1FR1QmUAS2ECux21vSZg","domain":".www.vinted.it","hostOnly":false,"path":"/","secure":true,"httpOnly":true,"sameSite":"lax","session":false,"firstPartyDomain":"","partitionKey":null,"expirationDate":1771622726.373,"storeId":null},{"name":"banners_ui_state","value":"SUCCESS","domain":"www.vinted.it","hostOnly":true,"path":"/","secure":false,"httpOnly":false,"sameSite":null,"session":false,"firstPartyDomain":"","partitionKey":null,"expirationDate":1771018529.305,"storeId":null},{"name":"eupubconsent-v2","value":"CQfJhpgQfJhpgAcABBITCQFgAAAAAEPgAAwIAAAWZABMNCogjLIgACBQMAIEACgrCACgQBAAAkDRAQAmDAhyBgAusJkAIAUAAwQAgABBgACAAASABCIAIACAQAgQCBQABgAQBAQAMDAAGACxEAgABAdAxTAggECwASMyqDTAlAASCAlsqEEgCBBXCEIs8AggREwUAAAIABQAAADwWAhJICViQQBcQTQAAEAAAUQIECKQswBBQGaLQVgScBkaYBg-YJklOgyAJghIyDIhN-Ew8UhRAAAA.YAAACHwAAAAA.ILNtR_G__bXlv-Tb36fpkeYxf99hr7sQxBgbJs24FzLvW7JwS32E7NEzatqYKmRIAu3TBIQNtHJjURUChKIgVrzDsaEyUoTtKJ-BkiDMRY2JYCFxvm4pjWQCZ4vr_91d9mT-N7dr-2dzyy5hnv3a9_-S1UJicKYetHfn8ZBKT-_IU9_x-_4v4_MbpE2-eS1v_tGvt43d-4tP_dpuxt-Tyffz___f72_e7X__c__33_-_Xf_7__4A","domain":".vinted.it","hostOnly":false,"path":"/","secure":false,"httpOnly":false,"sameSite":"lax","session":false,"firstPartyDomain":"","partitionKey":null,"expirationDate":1785835241,"storeId":null},{"name":"access_token_web","value":"eyJraWQiOiJFNTdZZHJ1SHBsQWp1MmNObzFEb3JIM2oyN0J1NS1zX09QNVB3UGlobjVNIiwiYWxnIjoiUFMyNTYifQ.eyJhY2NvdW50X2lkIjozMTM5MjAzNjkxLCJhcHBfaWQiOjQsImF1ZCI6ImZyLmNvcmUuYXBpIiwiY2xpZW50X2lkIjoid2ViIiwiZXhwIjoxNzcxMDI1MTI2LCJpYXQiOjE3NzEwMTc5MjYsImlzcyI6InZpbnRlZC1pYW0tc2VydmljZSIsImxvZ2luX3R5cGUiOjMsInB1cnBvc2UiOiJhY2Nlc3MiLCJyb2xlcyI6IiIsInNjb3BlIjoidXNlciIsInNpZCI6ImI4OWRhYjE2LTE3NzEwMTc5MjYiLCJzdWIiOiIzMTM0ODIzMTU2IiwiY2MiOiJJVCIsImFuaWQiOiIzMDkwYzAxMi0yYzc1LTRjMTEtYjkxZS1mMmQ3MjFhYzIyMGMiLCJhY3QiOnsic3ViIjoiMzEzNDgyMzE1NiJ9fQ.cyktPm9XquTQQzEYJXtnmt7CcA0wAEqx8kEnyWDTbsryGgWINcYFmor-A9-aEvovqhkiPMDqZa_KX-cfGAC-LQGZZpEPcTXHDVB9ng5viPmszdo2atuXXHn7q9CpxdXjSxPj1hJRHycOBPjsxqPpjE5_ORizCQDNLo9urKmLNoxOUsD42nLZcqVJh1onDdDXVJDfM_awDY7RuY2b3sz-0DgHO6tRDwzR9J_U_LWTHgTAv9lyaUNpmliA9WwJV_5rnColOr0oQ_KVfGi887z1nGlyuh5po5z1QyNL4vBUODn-1UK6QDx9UK0Qpm-ybIujbm5jcD_VNtY9bRxaoohLsw","domain":".vinted.it","hostOnly":false,"path":"/","secure":true,"httpOnly":true,"sameSite":"lax","session":false,"firstPartyDomain":"","partitionKey":null,"expirationDate":1771622726.402,"storeId":null},{"name":"domain_selected","value":"true","domain":"www.vinted.it","hostOnly":true,"path":"/","secure":false,"httpOnly":false,"sameSite":null,"session":false,"firstPartyDomain":"","partitionKey":null,"expirationDate":1804843246.827,"storeId":null},{"name":"_vinted_fr_session","value":"VWhsL1FPbkVTZDNlNHorK0ZuMS94dnRqd081U1p3US9GYkc2SXpFM3pyaWlrdk91aVZqd2dSRXpyUVNuWS9iUDVmaStoRzF3ZTFXL2d0bkVQUnV4UUlsL3ROV2FIZlNQdjdRdGV3alhlWmtPWVhCdXdTQU1kQ2ZKa2pnMVg2VGFubTlIQWxBRGczKytQWW5uc09rK09FaUhJQS8vQXpjcmFKdEkvL0c2eTJNdzVFaWU3aWozRmlwYldyYU52RHFieHhETC80cUhaNktRWnB4UUtZY3pWeVdKbG9pSVE4M0hCb3J5a0xUMzJCWWswQnZrODRwYXZXYXlRemhEUUlVQ0M4RlhyVzFTNnAxaWpKZHB0TnJiZVczc295VUszOCtQYmkxdmo2NjRhamhDTG5EbS9qQmYyUlgzajdhenA2YmItLVZiSmVYbUh5dWtjdkw5c1N2aXBnM1E9PQ%3D%3D--0d72b2ccb1a425fcb4f33dfa347a9021021f5ff5","domain":".www.vinted.it","hostOnly":false,"path":"/","secure":true,"httpOnly":true,"sameSite":"lax","session":false,"firstPartyDomain":"","partitionKey":null,"expirationDate":1771622732.57,"storeId":null},{"name":"anon_id","value":"3090c012-2c75-4c11-b91e-f2d721ac220c","domain":"www.vinted.it","hostOnly":true,"path":"/","secure":false,"httpOnly":false,"sameSite":"lax","session":false,"firstPartyDomain":"","partitionKey":null,"expirationDate":1805577932.545,"storeId":null},{"name":"datadome","value":"6NwfsNkqmMuDwlsve6z~qa2s5kHSFCpN3iKM7HbPYTcTDr1Df2t0y4mRWMG~OMvQpBHoIK8Uckyh7IdNsXtCREFNpqV7iaGfJVb4jq9f5RT2UkhoOo~vdNQz7ZIKybh2","domain":".vinted.it","hostOnly":false,"path":"/","secure":true,"httpOnly":false,"sameSite":"lax","session":false,"firstPartyDomain":"","partitionKey":null,"expirationDate":1802553940.306,"storeId":null},{"name":"non_dot_com_www_domain_cookie_buster","value":"1","domain":".www.vinted.it","hostOnly":false,"path":"/","secure":false,"httpOnly":false,"sameSite":null,"session":false,"firstPartyDomain":"","partitionKey":null,"expirationDate":1772875229.7,"storeId":null},{"name":"OptanonAlertBoxClosed","value":"2026-02-05T09:20:41.202Z","domain":".vinted.it","hostOnly":false,"path":"/","secure":false,"httpOnly":false,"sameSite":"lax","session":false,"firstPartyDomain":"","partitionKey":null,"expirationDate":1785835241,"storeId":null},{"name":"seen_banners","value":"onboarding_modal","domain":"www.vinted.it","hostOnly":true,"path":"/","secure":false,"httpOnly":false,"sameSite":null,"session":false,"firstPartyDomain":"","partitionKey":null,"expirationDate":1770283923.172,"storeId":null},{"name":"seller_header_visits","value":"3","domain":"www.vinted.it","hostOnly":true,"path":"/","secure":false,"httpOnly":false,"sameSite":null,"session":false,"firstPartyDomain":"","partitionKey":null,"expirationDate":1802553928.727,"storeId":null},{"name":"v_sid","value":"b89dab16-1771017926","domain":"www.vinted.it","hostOnly":true,"path":"/","secure":false,"httpOnly":true,"sameSite":"lax","session":false,"firstPartyDomain":"","partitionKey":null,"expirationDate":1805577926.948,"storeId":null},{"name":"v_uid","value":"3134823156","domain":"www.vinted.it","hostOnly":true,"path":"/","secure":false,"httpOnly":true,"sameSite":"lax","session":false,"firstPartyDomain":"","partitionKey":null,"expirationDate":1805577926.948,"storeId":null}]
```

## 🚀 Pasos para Desplegar

### 1. Configurar Variables en Railway

1. Ve a tu proyecto en Railway: https://railway.app
2. Selecciona el servicio **vintedsniper**
3. Ve a **Settings** → **Variables**
4. Añade TODAS las variables listadas arriba (incluyendo `VINTED_COOKIES`)

### 2. Crear el Volumen Persistente

1. En el mismo servicio, ve a **Settings** → **Volumes**
2. Haz clic en **+ New Volume**
3. Configura:
   - **Mount Path**: `/app/cookies`
   - **Size**: 1 GB

### 3. Hacer Push a Git

```bash
git add .
git commit -m "Add Railway initialization script for cookies"
git push
```

Railway desplegará automáticamente.

### 4. Verificar el Despliegue

```bash
# Ver logs en tiempo real
railway logs

# Deberías ver:
# 🚀 Inicializando bot en Railway...
# ✅ Directorios creados
# 📝 Creando archivo de cookies desde variable de entorno...
# ✅ Cookies guardadas en /app/cookies/vinted.json
# 🎯 Iniciando bot...
```

## 🔄 Actualizar Cookies en el Futuro

Si las cookies expiran, simplemente:

1. Genera nuevas cookies localmente: `npm run login`
2. Copia el contenido de `cookies/vinted.json`
3. Actualiza la variable `VINTED_COOKIES` en Railway
4. Reinicia el servicio

## ⚠️ Notas Importantes

- Las cookies se guardan en el volumen persistente la primera vez
- El volumen persiste entre redespliegues
- Si borras el volumen, las cookies se recrearán desde `VINTED_COOKIES`
