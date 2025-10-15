// src/providers/local.js
import fs from 'node:fs';
import path from 'node:path';
import 'dotenv/config';

const DOCS_DIR = path.resolve('data/docs');

// -------- PDF parse (lazy) --------
let __pdfParse;
async function parsePdfBuffer(buf) {
  if (!__pdfParse) {
    const mod = await import('pdf-parse/lib/pdf-parse.js');
    __pdfParse = mod.default || mod;
  }
  try {
    const out = await __pdfParse(buf);
    return out.text || '';
  } catch {
    return '';
  }
}
// ----------------------------------

function readMeta() {
  try {
    const p = path.join(DOCS_DIR, '_meta.json');
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {}
  return {};
}
let META = {};

const INDEX = { items: [], byId: new Map() };

export function docNeedsPassword(name) {
  const v = META?.[name];
  return !!(v && v.password);
}
export function validatePassword(name, given) {
  const v = META?.[name];
  return v && v.password && given && given === v.password;
}

export async function loadDocs() {
  META = readMeta();

  if (!fs.existsSync(DOCS_DIR)) fs.mkdirSync(DOCS_DIR, { recursive: true });
  const entries = fs.readdirSync(DOCS_DIR, { withFileTypes: true })
    .filter(d => d.isFile())
    .map(d => d.name);

  const items = entries.map((name, i) => ({
    id: `${i}-${name}`,
    name,
    mimeType: guessMime(name),
    _path: path.join(DOCS_DIR, name),
  }));

  INDEX.items = items;
  INDEX.byId = new Map(items.map(x => [x.id, x]));
  return { count: items.length };
}

function guessMime(name) {
  const ext = path.extname(name).toLowerCase();
  if (ext === '.txt') return 'text/plain';
  if (ext === '.csv') return 'text/csv';
  if (ext === '.json') return 'application/json';
  if (ext === '.pdf') return 'application/pdf';
  return 'application/octet-stream';
}

export async function searchDocs(query, limit = 100) {
  if (!query) return INDEX.items.slice(0, limit);
  const q = query.toLowerCase();
  return INDEX.items.filter(d => d.name.toLowerCase().includes(q)).slice(0, limit);
}

export function getDocsByIds(ids = []) {
  return ids.map(id => INDEX.byId.get(id)).filter(Boolean);
}

export async function getDocById(id) {
  const file = INDEX.byId.get(id);
  if (!file) throw new Error('Documento não encontrado');

  const ext = path.extname(file.name).toLowerCase();
  const buf = fs.readFileSync(file._path);

  if (ext === '.txt' || ext === '.csv' || ext === '.json') {
    return { id: file.id, name: file.name, content: buf.toString('utf-8') };
  }
  if (ext === '.pdf') {
    const text = await parsePdfBuffer(buf);
    return { id: file.id, name: file.name, content: text };
  }
  return { id: file.id, name: file.name, content: '' };
}

export async function summarizeDocWithN8n({ title, content, maxChars = 6000 }) {
  const mod = await import('../n8n.js');
  const body = [{ title, content: (content || '').slice(0, maxChars) }];
  try { return await mod.summarizeWithN8n({ messages: body, preview: false }) || ''; }
  catch { return (content || '').slice(0, 600); }
}
