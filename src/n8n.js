import { findMessages } from './storage.js';

const REPORT_URL = (process.env.N8N_REPORT_WEBHOOK_URL || '').trim();
const DOC_URL = (process.env.N8N_DOC_WEBHOOK_URL || '').trim();

async function safeFetch(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function fallbackFeedbackSummary(messages = [], lang = 'pt') {
  const t = lang === 'en'
    ? { header: n => `Fallback summary: ${n} messages analyzed.`, bugs: 'Bugs/errors', lag: 'Lag/ping', price: 'Price', pass: 'Booyah pass', praise: 'Praise' }
    : { header: n => `Resumo (fallback): ${n} mensagens analisadas.`, bugs: 'Bugs/erros', lag: 'Lag/ping', price: 'Preço', pass: 'Passe Booyah', praise: 'Elogios' };
  const txts = messages.map(m => (m?.content || '').toLowerCase());
  const count = keys => txts.filter(s => keys.some(k => s.includes(k))).length;
  const bugs = count(['bug','erro','error','crash','travou']);
  const lag = count(['lag','ping','atraso','latência','latencia']);
  const price = count(['preço','preco','price','caro','barato']);
  const pass = count(['booyah','passe booyah','booyapass','booya']);
  const praise = count(['bom','ótimo','otimo','excelente','curti','gostei','thanks','amazing']);
  return [
    t.header(messages.length),
    `• ${t.bugs}: ${bugs}`,
    `• ${t.lag}: ${lag}`,
    `• ${t.price}: ${price}`,
    `• ${t.pass}: ${pass}`,
    `• ${t.praise}: ${praise}`
  ].join('\n');
}

export async function summarizeWithN8n({ timeframeMs, timezone, preview = false, messages = [], lang = 'pt' } = {}) {
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
        messages: messages.map(m => ({
          id: m.id,
          authorId: m.authorId,
          channelId: m.channelId,
          guildId: m.guildId,
          content: m.content,
          createdAt: m.createdAt
        }))
      })
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
        files: files.map(f => ({
          title: f.title,
          absPath: f.absPath,
          mime: f.mime,
          text: f.text || ''
        }))
      })
    });
  } catch {
    return null;
  }
}

export function registerAutoReportRoute(app, client) {
  app.post('/ffnexus/auto-report', async (req, res) => {
    try {
