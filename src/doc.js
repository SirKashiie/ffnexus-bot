// src/doc.js
import fs from 'node:fs';
import path from 'node:path';

const DOCS_DIR = path.resolve('./docs');
const N8N_DOC_WEBHOOK_URL = (process.env.N8N_DOC_WEBHOOK_URL || '').trim();

// ==========================================================
// 🔹 Utilidades básicas
// ==========================================================
function clean(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function summarizeLocally(text, lang = 'pt') {
  const t = clean(text);
  if (!t) return lang === 'en' ? 'Empty or unreadable.' : 'Vazio ou ilegível.';
  const sentences = t.split(/(?<=[.!?])\s+/).slice(0, 3);
  return sentences.join(' ');
}

// ==========================================================
// 🔹 Extração de texto (com import dinâmico de pdf-parse)
// ==========================================================
export async function extractTextFromFile(absPath) {
  const ext = path.extname(absPath).toLowerCase();
  if (ext === '.pdf') {
    try {
      const pdfParse = (await import('pdf-parse')).default;
      const buf = fs.readFileSync(absPath);
      const data = await pdfParse(buf);
      return data.text || '';
    } catch (err) {
      console.warn('[doc] Falha ao ler PDF:', absPath, '-', err.message);
      return '';
    }
  }
  try {
    return fs.readFileSync(absPath, 'utf8');
  } catch {
    return '';
  }
}

// ==========================================================
// 🔹 Chamadas para o n8n
// ==========================================================
async function summarizeDocsViaN8n({ files, lang = 'pt' }) {
  if (!N8N_DOC_WEBHOOK_URL) throw new Error('N8N_DOC_WEBHOOK_URL ausente');
  const payload = {
    files: files.map(f => ({
      title: f.title || path.basename(f.absPath || 'document'),
      text: f.text || ''
    })),
    lang
  };
  const res = await fetch(N8N_DOC_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const bodyTxt = await res.text().catch(() => '');
    throw new Error(`n8n HTTP ${res.status} – ${bodyTxt.slice(0, 300)}`);
  }
  const data = await res.json().catch(() => ({}));
  const summary = data.summary || data.result || data.output || '';
  if (!summary) throw new Error('n8n retornou sem campo "summary"');
  return summary;
}

// ==========================================================
// 🔹 Fallback local (sem n8n)
// ==========================================================
async function summarizeDocsFallback({ files, lang = 'pt' }) {
  const bullets = files.map(f => {
    const brief = summarizeLocally(f.text || '', lang);
    return `• **${f.title || 'documento'}**\n${brief}`;
  });
  const header = lang === 'en'
    ? `Summary of ${files.length} document(s):`
    : `Resumo de ${files.length} documento(s):`;
  return [header, '', ...bullets].join('\n');
}

// ==========================================================
// 🔹 Summarizer final
// ==========================================================
export async function summarizeDocsPure({ files, lang = 'pt' }) {
  console.log('[doc] SummarizeDocs chamado.');
  try {
    const txt = await summarizeDocsViaN8n({ files, lang });
    return txt;
  } catch (err) {
    console.warn('[doc] n8n falhou, usando fallback:', err.message);
    return summarizeDocsFallback({ files, lang });
  }
}

// ==========================================================
// 🔹 Indexação e busca local
// ==========================================================
let INDEX = [];

export async function reindexDocs() {
  INDEX = [];
  if (!fs.existsSync(DOCS_DIR)) return 0;
  const files = fs.readdirSync(DOCS_DIR);
  for (const file of files) {
    const absPath = path.join(DOCS_DIR, file);
    const stats = fs.statSync(absPath);
    if (!stats.isFile()) continue;
    const text = await extractTextFromFile(absPath);
    INDEX.push({
      title: file,
      absPath,
      size: stats.size,
      text: clean(text)
    });
  }
  console.log(`[doc] Reindexado ${INDEX.length} arquivo(s).`);
  return INDEX.length;
}

export async function searchDocsLocal({ query = '', page = 1, pageSize = 10 }) {
  if (!INDEX.length) await reindexDocs();
  const q = clean(query).toLowerCase();
  const filtered = !q
    ? INDEX
    : INDEX.filter(f => f.title.toLowerCase().includes(q) || f.text.toLowerCase().includes(q));
  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize).map(f => ({
    title: f.title,
    absPath: f.absPath,
    summary: summarizeLocally(f.text),
    size: f.size
  }));
  return { total, items };
}

export async function getDocsFull(files) {
  const out = [];
  for (const f of files) {
    const abs = f.absPath || path.join(DOCS_DIR, f.title);
    const text = f.text || await extractTextFromFile(abs);
    const stats = fs.existsSync(abs) ? fs.statSync(abs) : { size: 0 };
    out.push({ title: f.title, absPath: abs, size: stats.size, text });
  }
  return out;
}

// ==========================================================
// 🔹 Formatação para exibição no Discord
// ==========================================================
export function formatResultsList({ items, page, pageCount, lang = 'pt' }) {
  if (!items?.length) return lang === 'en' ? 'No documents found.' : 'Nenhum documento encontrado.';
  const lines = items.map((it, idx) => {
    const title = it.title || '(sem título)';
    const summary = it.summary ? ` — ${it.summary.slice(0, 100)}...` : '';
    return `${idx + 1}. ${title}${summary}`;
  });
  const footer = lang === 'en' ? `Page ${page} of ${pageCount}` : `Página ${page} de ${pageCount}`;
  return `${lines.join('\n')}\n\n${footer}`;
}
