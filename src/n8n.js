// src/n8n.js
// Comunicação otimizada com o n8n: timeouts, logs e fallback inteligente.

import { setTimeout as sleep } from 'timers/promises';

const REPORT_URL = (process.env.N8N_REPORT_WEBHOOK_URL || '').trim();
const DOC_URL    = (process.env.N8N_DOC_WEBHOOK_URL || '').trim();

/**
 * Função auxiliar com timeout seguro
 * (evita travar caso o n8n fique lento ou inativo)
 */
async function safeFetch(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } catch (err) {
    if (err.name === 'AbortError') {
      console.warn(`[n8n] Timeout após ${timeoutMs}ms em ${url}`);
    } else {
      console.warn(`[n8n] Erro de conexão: ${err.message}`);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fallback simples para /feedback:
 * - Conta mensagens por categorias básicas.
 */
function fallbackFeedbackSummary(messages = [], lang = 'pt') {
  const t = (lang === 'en') ? {
    header: (n) => `Fallback summary: ${n} messages analyzed.`,
    bugs: 'Bugs/errors',
    lag: 'Lag/ping',
    price: 'Price',
    pass: 'Booyah pass',
    praise: 'Praise',
  } : {
    header: (n) => `Resumo (fallback): ${n} mensagens analisadas.`,
    bugs: 'Bugs/erros',
    lag: 'Lag/ping',
    price: 'Preço',
    pass: 'Passe Booyah',
    praise: 'Elogios',
  };

  const txts = messages.map(m => (m?.content || '').toLowerCase());
  const count = (keys) => txts.filter(s => keys.some(k => s.includes(k))).length;

  const bugs  = count(['bug','erro','error','crash','travou']);
  const lag   = count(['lag','ping','atraso','latência','latencia']);
  const price = count(['preço','preco','price','caro','barato']);
  const pass  = count(['booyah','passe booyah','booyapass','booya']);
  const praise= count(['bom','ótimo','otimo','excelente','curti','gostei','thanks','amazing']);

  return [
    t.header(messages.length),
    `• ${t.bugs}: ${bugs}`,
    `• ${t.lag}: ${lag}`,
    `• ${t.price}: ${price}`,
    `• ${t.pass}: ${pass}`,
    `• ${t.praise}: ${praise}`,
  ].join('\n');
}

/**
 * Envia mensagens para o webhook do n8n e tenta gerar um resumo.
 * Em caso de erro, retorna fallback local.
 */
export async function summarizeWithN8n({
  timeframeMs,
  timezone,
  preview = false,
  messages = [],
  lang = 'pt',
} = {}) {
  if (!REPORT_URL) {
    console.warn('[n8n] REPORT_URL não configurada — usando fallback local.');
    return fallbackFeedbackSummary(messages, lang);
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
        messages: messages.map(m => ({
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
    if (!res.ok) {
      console.warn(`[n8n] Resposta HTTP ${res.status}: ${text.slice(0, 100)}`);
      return fallbackFeedbackSummary(messages, lang);
    }

    try {
      const json = JSON.parse(text);
      return json?.summary || String(text || '').trim() || fallbackFeedbackSummary(messages, lang);
    } catch {
      return String(text || '').trim() || fallbackFeedbackSummary(messages, lang);
    }
  } catch (e) {
    console.warn('[n8n] summarizeWithN8n error:', e?.message || e);
    return fallbackFeedbackSummary(messages, lang);
  }
}

/**
 * Resumo de documentos via n8n (usado no /doc)
 * - Retorna null se não houver DOC_URL ou erro.
 * - O doc.js lida com o fallback local.
 */
export async function summarizeDocsWithN8n({ files = [], lang = 'pt' } = {}) {
  if (!DOC_URL) {
    console.warn('[n8n] DOC_URL não configurada — fallback local ativado.');
    return null;
  }

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
          text: f.text || '',
        })),
      }),
    });

    if (!res) return null;

    const text = await res.text();
    if (!res.ok) {
      console.warn(`[n8n] DOC summarize HTTP ${res.status}: ${text.slice(0, 100)}`);
      return null;
    }

    try {
      const json = JSON.parse(text);
      return json?.summary || String(text || '').trim() || null;
    } catch {
      return String(text || '').trim() || null;
    }
  } catch (e) {
    console.warn('[n8n] summarizeDocsWithN8n error:', e?.message || e);
    return null;
  }
}
