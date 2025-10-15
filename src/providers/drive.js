// src/providers/drive.js
import 'dotenv/config';
import { google } from 'googleapis';
import { Buffer } from 'node:buffer';
import path from 'node:path';

const FOLDER_ID = process.env.GDRIVE_FOLDER_ID;
const SA_KEY_FILE = process.env.GDRIVE_SA_KEY_FILE || './secrets/sa.json';
const ALLOWED_MIMES = (process.env.GDRIVE_ALLOWED_MIMES || '')
  .split(',').map(s => s.trim()).filter(Boolean);

let drive;
const INDEX = { items: [], byId: new Map(), meta: {} };

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

function isGoogleDoc(m) { return m === 'application/vnd.google-apps.document'; }
function isGoogleSheet(m) { return m === 'application/vnd.google-apps.spreadsheet'; }
function isGoogleSlide(m) { return m === 'application/vnd.google-apps.presentation'; }

const EXPORT = {
  gdoc:  { mime: 'text/plain',       ext: '.txt' },
  sheet: { mime: 'text/csv',         ext: '.csv' },
  slide: { mime: 'application/pdf',  ext: '.pdf' },
};

function getDriveClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: SA_KEY_FILE,
    scopes: ['https://www.googleapis.com/auth/drive.readonly']
  });
  return google.drive({ version: 'v3', auth });
}

async function loadMetaJSON() {
  try {
    const res = await drive.files.list({
      q: `'${FOLDER_ID}' in parents and name = '_meta.json' and trashed = false`,
      fields: 'files(id,name,mimeType)',
      pageSize: 1,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    const file = res.data.files?.[0];
    if (!file) return;
    const data = await drive.files.get(
      { fileId: file.id, alt: 'media', supportsAllDrives: true },
      { responseType: 'arraybuffer' }
    );
    const json = JSON.parse(Buffer.from(data.data).toString('utf-8'));
    INDEX.meta = json || {};
  } catch (e) {
    console.warn('[docs:drive] _meta.json:', e?.message || e);
  }
}
export function docNeedsPassword(name) {
  const v = INDEX.meta?.[name];
  return !!(v && v.password);
}
export function validatePassword(name, given) {
  const v = INDEX.meta?.[name];
  return v && v.password && given && given === v.password;
}

export async function loadDocs() {
  drive = getDriveClient();
  if (!FOLDER_ID) {
    console.warn('[docs:drive] GDRIVE_FOLDER_ID ausente no .env');
    INDEX.items = [];
    INDEX.byId = new Map();
    return { count: 0 };
  }

  const q = [`'${FOLDER_ID}' in parents`, 'trashed = false'].join(' and ');
  let pageToken, items = [];
  do {
    const res = await drive.files.list({
      q,
      fields: 'nextPageToken, files(id,name,mimeType)',
      pageSize: 1000,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    (res.data.files || []).forEach(f => {
      if (ALLOWED_MIMES.length && !ALLOWED_MIMES.includes(f.mimeType)) return;
      items.push({
        id: f.id, name: f.name, mimeType: f.mimeType,
        isGDoc: isGoogleDoc(f.mimeType),
        isGSheet: isGoogleSheet(f.mimeType),
        isGSlide: isGoogleSlide(f.mimeType),
      });
    });
    pageToken = res.data.nextPageToken;
  } while (pageToken);

  INDEX.items = items;
  INDEX.byId = new Map(items.map(x => [x.id, x]));
  await loadMetaJSON();

  return { count: items.length };
}

export async function searchDocs(query, limit = 100) {
  if (!query) return INDEX.items.slice(0, limit);
  const q = query.toLowerCase();
  return INDEX.items.filter(d => d.name.toLowerCase().includes(q)).slice(0, limit);
}
export function getDocsByIds(ids = []) {
  return ids.map(id => INDEX.byId.get(id)).filter(Boolean);
}

async function fetchFileBuffer(file) {
  if (file.isGDoc) {
    const { data } = await drive.files.export(
      { fileId: file.id, mimeType: EXPORT.gdoc.mime, supportsAllDrives: true },
      { responseType: 'arraybuffer' }
    );
    return Buffer.from(data);
  }
  if (file.isGSheet) {
    const { data } = await drive.files.export(
      { fileId: file.id, mimeType: EXPORT.sheet.mime, supportsAllDrives: true },
      { responseType: 'arraybuffer' }
    );
    return Buffer.from(data);
  }
  if (file.isGSlide) {
    const { data } = await drive.files.export(
      { fileId: file.id, mimeType: EXPORT.slide.mime, supportsAllDrives: true },
      { responseType: 'arraybuffer' }
    );
    return Buffer.from(data);
  }
  const { data } = await drive.files.get(
    { fileId: file.id, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' }
  );
  return Buffer.from(data);
}

function extFromMime(m) {
  if (m === 'text/plain') return '.txt';
  if (m === 'application/pdf') return '.pdf';
  if (m === 'text/csv') return '.csv';
  if (m === 'application/json') return '.json';
  if (isGoogleDoc(m)) return EXPORT.gdoc.ext;
  if (isGoogleSheet(m)) return EXPORT.sheet.ext;
  if (isGoogleSlide(m)) return EXPORT.slide.ext;
  return '';
}

async function bufferToText(file, buf) {
  const ext = (path.extname(file.name) || extFromMime(file.mimeType)).toLowerCase();

  if (ext === '.txt' || file.mimeType === 'text/plain') return buf.toString('utf-8');
  if (ext === '.csv' || file.mimeType === 'text/csv')  return buf.toString('utf-8');
  if (ext === '.json' || file.mimeType === 'application/json') {
    try { return JSON.stringify(JSON.parse(buf.toString('utf-8')), null, 2); }
    catch { return buf.toString('utf-8'); }
  }
  if (ext === '.pdf' || file.mimeType === 'application/pdf') {
    const text = await parsePdfBuffer(buf);
    return text;
  }

  return '';
}

export async function getDocById(id) {
  const file = INDEX.byId.get(id);
  if (!file) throw new Error('Documento não encontrado');
  const buf = await fetchFileBuffer(file);
  const text = await bufferToText(file, buf);
  return { id: file.id, name: file.name, content: text };
}

export async function summarizeDocWithN8n({ title, content, maxChars = 6000 }) {
  const mod = await import('../n8n.js');
  const body = [{ title, content: (content || '').slice(0, maxChars) }];
  try { return await mod.summarizeWithN8n({ messages: body, preview: false }) || ''; }
  catch { return (content || '').slice(0, 600); } // fallback
}
