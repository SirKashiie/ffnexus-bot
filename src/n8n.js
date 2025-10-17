// src/n8n.js
// Node 20+ já tem fetch global
const REPORT_URL = (process.env.N8N_REPORT_WEBHOOK_URL || '').trim();
const DOC_URL = (process.env.N8N_DOC_WEBHOOK_URL || '').trim();

async function safeFetch(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function fallbackFeedbackSummary(messages = [], lang = 'pt') {
  const T =
    lang === 'en'
      ? {
          header: (n) => `Fallback summary: ${n} messages analyzed.`,
          bugs: 'Bugs/errors',
          lag: 'Lag/ping',
          price: 'Price',
          pass: 'Booyah pass',
          praise: 'Praise',
        }
      : {
          header: (n) => `Resumo (fallback): ${n} mensagens analisadas.`,
          bugs: 'Bugs/erros',
          lag: 'Lag/ping',
          price: 'Preço',
          pass: 'Passe Booyah',
          praise: 'Elogios',
        };

  const texts = messages.map((m) => String(m?.content || '').toLowerCase());
  const count = (keys) => texts.filter((s) => keys.some((k) => s.includes(k))).length;

  const bugs = count(['bug', 'erro', 'error', 'crash', 'travou']);
  const lag = count(['lag', 'ping', 'latencia', 'latência', 'atraso']);
  const price = count(['preço', 'preco', 'price', 'caro', 'barato']);
  const pass = count(['booyah', 'passe booyah', 'booyapass']);
  const praise = count(['bom', 'ótimo', 'otimo', 'excelente', 'curti', 'gostei', 'amazing', 'thanks']);

  return [
    T.header(messages.length),
    `• ${T.bugs}: ${bugs}`,
    `• ${T.lag}: ${lag}`,
    `• ${T.price}: ${price}`,
    `• ${T.pass}: ${pass}`,
    `• ${T.praise}: ${praise}`,
  ].join('\n');
}

export async function summarizeWithN8n({
  timeframeMs,
  timezone,
  preview = false,
  messages = [],
  lang = 'pt',
} = {}) {
  if (!REPORT_URL) return fallbackFeedbackSummary(messages, lang);

  try {
    const res = await safeFetch(REPORT_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        timeframeMs,
        timezone,
        preview,
        lang,
        messages: messages.map((m) => ({
          id: m.id,
          authorId: m.authorId,
          channelId: m.channelId,
          guildId: m.guildId,
          content: m.content,
          createdAt: m.createdAt,
        })),
      }),
    });

    if (!res) return fallbackFeedbackSummary(messages, lang);
    const text = await res.text();
    if (!res.ok) return fallbackFeedbackSummary(messages, lang);
    try {
      const json = JSON.parse(text);
      return json?.summary || String(text || '').trim() || fallbackFeedbackSummary(messages, lang);
    } catch {
      return String(text || '').trim() || fallbackFeedbackSummary(messages, lang);
    }
  } catch {
    return fallbackFeedbackSummary(messages, lang);
  }
}

export async function summarizeDocsWithN8n({ files = [], lang = 'pt' } = {}) {
  if (!DOC_URL) return null;

  try {
    const res = await safeFetch(DOC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        lang,
        files: files.map((f) => ({
          title: f.title,
          absPath: f.absPath,
          mime: f.mime,
          text: f.text || '',
        })),
      }),
    });

    if (!res) return null;
    const text = await res.text();
    if (!res.ok) return null;
    try {
      const json = JSON.parse(text);
      return json?.summary || String(text || '').trim() || null;
    } catch {
      return String(text || '').trim() || null;
    }
  } catch {
    return null;
  }
}

import { findMessages } from './storage.js';

export function registerAutoReportRoute(app, client) {
  app.post('/ffnexus/auto-report', async (req, res) => {
    try {
      const lang = typeof req.body?.lang === 'string' ? req.body.lang : 'pt';
      const hours = Number(req.body?.hours || process.env.AUTO_REPORT_HOURS || 12);
      const timeframeMs = hours * 60 * 60 * 1000;
      const since = Date.now() - timeframeMs;
      const rows = await findMessages({ fromMs: since });
      const timezone = process.env.TIMEZONE || 'America/Sao_Paulo';

      let summaryText = '';
      if (REPORT_URL) {
        try {
          const r = await safeFetch(REPORT_URL, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              tipo: 'auto',
              lang,
              timeframeMs,
              timezone,
              mensagens: rows,
              timestamp: new Date().toISOString(),
            }),
          });
          if (r && r.ok) {
            const t = await r.text();
            try {
              const j = JSON.parse(t);
              summaryText = j?.summary || '';
            } catch {
              summaryText = t || '';
            }
          }
        } catch {
          // mantém vazio para cair no fallback
        }
      }

      if (!summaryText) summaryText = fallbackFeedbackSummary(rows, lang);

      const channelId = process.env.AUTO_REPORT_CHANNEL_ID || process.env.DEST_CHANNEL_ID;
      if (client && channelId) {
        try {
          const ch = await client.channels.fetch(channelId);
          if (ch && ch.send) {
            const head =
              lang === 'en'
                ? `🧾 Auto feedback report (last ${hours}h)`
                : `🧾 Relatório automático (últimas ${hours}h)`;
            await ch.send(`${head}\n\n${summaryText}`.slice(0, 1900));
          }
        } catch {
          // ignora erro de envio
        }
      }

      res.json({ ok: true, count: rows.length, hours });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });
}
