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

function buildNarrativeSummary(rows = [], lang = 'pt', hours = 12, timezone = process.env.TIMEZONE || 'America/Sao_Paulo') {
  const fmt = (ts) =>
    new Date(ts || Date.now()).toLocaleTimeString(lang === 'en' ? 'en-US' : 'pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timezone,
    });

  const items = rows.map((r) => ({
    text: String(r?.content || '').toLowerCase(),
    at: Number(r?.createdAt || Date.now()),
  }));

  const THEMES = [
    { key: 'login', pt: 'problemas de login/conexão', en: 'login/connection issues', kw: ['login', 'logar', 'entrar', 'conectar', 'conexao', 'conexão', 'servidor', 'auth'] },
    { key: 'lag', pt: 'lag/ping', en: 'lag/ping', kw: ['lag', 'ping', 'latencia', 'latência', 'travando', 'travou', 'delay'] },
    { key: 'bugs', pt: 'bugs/erros', en: 'bugs/errors', kw: ['bug', 'erro', 'error', 'crash', 'falha'] },
    { key: 'price', pt: 'preço', en: 'price', kw: ['preço', 'preco', 'price', 'caro', 'barato', 'caríssimo', 'carissima'] },
    { key: 'pass', pt: 'Passe Booyah', en: 'Booyah Pass', kw: ['booyah', 'passe booyah', 'booyapass', 'passe'] },
    { key: 'praise', pt: 'elogios', en: 'praise', kw: ['bom', 'ótimo', 'otimo', 'excelente', 'curti', 'gostei', 'amazing', 'thanks'] },
  ];

  const stat = new Map();
  const times = new Map();
  for (const t of THEMES) {
    stat.set(t.key, 0);
    times.set(t.key, []);
  }

  for (const it of items) {
    for (const t of THEMES) {
      if (t.kw.some((k) => it.text.includes(k))) {
        stat.set(t.key, stat.get(t.key) + 1);
        if (times.get(t.key).length < 3) times.get(t.key).push(fmt(it.at));
      }
    }
  }

  const total = items.length;
  const topics = THEMES
    .filter((t) => t.key !== 'praise')
    .map((t) => ({ key: t.key, label: lang === 'en' ? t.en : t.pt, count: stat.get(t.key) }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  const praise = stat.get('praise') || 0;

  if (topics.length === 0) {
    return lang === 'en'
      ? `No relevant feedback was found in the last ${hours}h.`
      : `Não encontramos feedback relevante nas últimas ${hours}h.`;
  }

  const lead =
    lang === 'en'
      ? `In the last ${hours}h we analyzed ${total} messages. The most cited topics were `
      : `Nas últimas ${hours}h analisamos ${total} mensagens. Os temas mais citados foram `;

  const list = topics
    .map((t, i) => {
      const ts = times.get(t.key);
      const hint =
        ts.length > 0 ? (lang === 'en' ? ` peaks around ${ts.join(', ')}` : ` picos por volta de ${ts.join(', ')}`) : '';
      return `${i === 0 ? '' : i === topics.length - 1 ? (lang === 'en' ? ' and ' : ' e ') : ', '}${t.label} (${t.count})${hint}`;
    })
    .join('');

  const tail = praise > 0 ? (lang === 'en' ? `. We also saw ${praise} positive comments.` : `. Também registramos ${praise} elogios.`) : '';

  return lead + list + tail;
}

export async function summarizeWithN8n({ timeframeMs, timezone, preview = false, messages = [], lang = 'pt' } = {}) {
  if (!REPORT_URL) {
    return buildNarrativeSummary(messages, lang, Math.round((timeframeMs || 0) / 3600000) || 12, timezone);
  }

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

    if (!res) return buildNarrativeSummary(messages, lang, Math.round((timeframeMs || 0) / 3600000) || 12, timezone);
    const text = await res.text();
    if (!res.ok) return buildNarrativeSummary(messages, lang, Math.round((timeframeMs || 0) / 3600000) || 12, timezone);

    try {
      const json = JSON.parse(text);
      const out = json?.summary || String(text || '').trim();
      return out || buildNarrativeSummary(messages, lang, Math.round((timeframeMs || 0) / 3600000) || 12, timezone);
    } catch {
      const out = String(text || '').trim();
      return out || buildNarrativeSummary(messages, lang, Math.round((timeframeMs || 0) / 3600000) || 12, timezone);
    }
  } catch {
    return buildNarrativeSummary(messages, lang, Math.round((timeframeMs || 0) / 3600000) || 12, timezone);
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

import { findMessages, pruneOlderThan } from './storage.js';

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
        } catch {}
      }

      if (!summaryText) {
        summaryText = buildNarrativeSummary(rows, lang, hours, timezone);
      }

      const channelId = process.env.AUTO_REPORT_CHANNEL_ID || process.env.DEST_CHANNEL_ID;
      if (client && channelId) {
        try {
          const ch = await client.channels.fetch(channelId);
          if (ch && ch.send) {
            const head = lang === 'en'
              ? `Summary of the last ${hours} hours - Free Fire BR feedback`
              : `Resumo das últimas ${hours} horas - Feedback Free Fire BR`;
            await ch.send(`${head}\n\n${summaryText}`.slice(0, 1900));
          }
        } catch {}
      }

      await pruneOlderThan(24 * 60 * 60 * 1000);

      res.json({ ok: true, count: rows.length, hours });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });
}
