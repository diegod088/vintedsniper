import axios from 'axios';
import { config } from './config';

export interface BotSharedState {
  paused: boolean;
  pollIntervalMs: number;
}

export interface StatusInfo {
  searchTerms: string[];
  maxPrice: number;
  paused: boolean;
  cacheTotal: number;
  cacheRecent: number;
}

const BASE = `https://api.telegram.org/bot${config.TOK}`;

function sendMessage(text: string, replyMarkup?: object): Promise<void> {
  return axios.post(`${BASE}/sendMessage`, {
    chat_id: config.CHAT_ID,
    text,
    parse_mode: 'Markdown',
    disable_web_page_preview: true,
    reply_markup: replyMarkup,
  }, { timeout: 10000 }).then(() => { });
}

function editMessage(chatId: string, messageId: number, text: string, replyMarkup?: object): Promise<void> {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'Markdown',
  };
  if (replyMarkup) body.reply_markup = replyMarkup;
  return axios.post(`${BASE}/editMessageText`, body, { timeout: 10000 }).then(() => { });
}

function answerCallback(callbackQueryId: string): Promise<void> {
  return axios.post(`${BASE}/answerCallbackQuery`, { callback_query_id: callbackQueryId }, { timeout: 5000 }).then(() => { });
}

function formatStatus(info: StatusInfo): string {
  const mode = info.paused ? '⏸ *SOSPESO*' : '▶ *Attivo*';
  const brands = config.ALLOWED_BRANDS ? config.ALLOWED_BRANDS.join(', ') : 'Tutte';

  return [
    '📊 *Stato del Bot*',
    '',
    `Stato: ${mode}`,
    `🔍 Termini: ${info.searchTerms.join(', ')}`,
    `🏷️ Marche consentite: ${brands}`,
    `💰 Prezzo max: ${info.maxPrice}€`,
    `⏱️ Intervallo: ${config.POLL_INTERVAL_MS / 1000}s`,
    `📂 Cache: ${info.cacheTotal} articoli (${info.cacheRecent} recenti)`,
    '',
    '_Usa i pulsanti per sospendere/riprendere._',
  ].join('\n');
}

const PANEL_KEYBOARD = {
  inline_keyboard: [
    [
      { text: '📊 Status', callback_data: 'status' },
      { text: '⏸ Sospendi', callback_data: 'pause' },
      { text: '▶ Riprendi', callback_data: 'resume' },
    ],
  ],
};

export function startTelegramCommands(
  sharedState: BotSharedState,
  getStatus: () => StatusInfo,
  updateSpeed: (ms: number) => void
): void {
  let offset = 0;

  const poll = async () => {
    try {
      // Intentar eliminar webhook por si acaso quedara alguno activo de otra sesión
      if (offset === 0) {
        try {
          await axios.get(`${BASE}/setWebhook`, { params: { url: '' }, timeout: 5000 });
        } catch (e) { }
      }

      const res = await axios.get(`${BASE}/getUpdates`, {
        params: { offset, timeout: 20 }, // Long polling (más eficiente)
        timeout: 30000,
      });
      const updates = res.data?.result ?? [];
      for (const u of updates) {
        offset = u.update_id + 1;
        const chatId = u.message?.chat?.id ?? u.callback_query?.message?.chat?.id;
        if (String(chatId) !== String(config.CHAT_ID)) continue;

        if (u.message?.text) {
          const text = (u.message.text as string).trim().toLowerCase();
          if (text === '/start') {
            await sendMessage(
              '🎯 *Vinted Sniper Bot* – Pannello di controllo\n\nScegli un\'azione:',
              PANEL_KEYBOARD,
            );
          } else if (text === '/status') {
            await sendMessage(formatStatus(getStatus()));
          } else if (text === '/pause' || text === 'sospendi') {
            sharedState.paused = true;
            await sendMessage('⏸ Bot *sospeso*. Non verranno cercati capi finché non invierai /resume o premerai Riprendi.');
          } else if (text === '/resume' || text === 'riprendi') {
            sharedState.paused = false;
            await sendMessage('▶ Bot *ripreso*.');
          } else if (text.startsWith('/speed')) {
            const parts = text.split(' ');
            if (parts.length === 2) {
              const seconds = parseFloat(parts[1]);
              if (!isNaN(seconds) && seconds >= 0.5 && seconds <= 600) {
                updateSpeed(seconds * 1000);
                await sendMessage(`⏱️ Velocità aggiornata: *${seconds}s*`);
              } else {
                await sendMessage('⚠️ Inserisci un numero valido tra 0.5 y 600 secondi.');
              }
            } else {
              await sendMessage('💡 Uso: `/speed 2` (per 2 secondi de intervallo)');
            }
          } else if (text === '/help') {
            await sendMessage(
              '*Comandi:*\n/start – Pannello\n/status – Stato\n/pause – Sospendi\n/resume – Riprendi\n/speed <sec> – Velocità\n/help – Aiuto',
            );
          }
        }

        if (u.callback_query) {
          const data = u.callback_query.data as string;
          const msg = u.callback_query.message;
          await answerCallback(u.callback_query.id);
          if (data === 'status') {
            await editMessage(msg.chat.id, msg.message_id, formatStatus(getStatus()), PANEL_KEYBOARD);
          } else if (data === 'pause') {
            sharedState.paused = true;
            await editMessage(msg.chat.id, msg.message_id, '⏸ Bot *sospeso*. Premi Riprendi o invia /resume.', PANEL_KEYBOARD);
          } else if (data === 'resume') {
            sharedState.paused = false;
            await editMessage(msg.chat.id, msg.message_id, '▶ Bot *ripreso*.', PANEL_KEYBOARD);
          }
        }
      }
    } catch (e: any) {
      if (e.response?.status === 409) {
        // Reducir ruido en consola pero avisar
        process.stdout.write('⚠️');
      } else if (e.code !== 'ECONNABORTED' && e.code !== 'ETIMEDOUT') {
        console.warn('[Telegram commands]', e.message);
      }
    } finally {
      // Programar el siguiente poll SIEMPRE, incluso tras error
      setTimeout(poll, 1000);
    }
  };

  poll();
  console.log('📱 Pannello di controllo Telegram attivo (invia /start nella chat del bot)');
}
