// src/storage.js
import fs from 'fs';
import * as fsp from 'fs/promises';
import path from 'path';

const DATA_DIR = './data';
const FILE = path.join(DATA_DIR, 'messages.jsonl');
const ALERTS_FILE = path.join(DATA_DIR, 'alerts.jsonl');

export async function initStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, '', 'utf-8');
  if (!fs.existsSync(ALERTS_FILE)) fs.writeFileSync(ALERTS_FILE, '', 'utf-8');
}

export async function saveMessage(obj) {
  const line = JSON.stringify(obj) + '\n';
  await fsp.appendFile(FILE, line, 'utf-8');
}

export async function storeMessage(obj) {
  await saveMessage(obj);
}

export async function saveAlert(obj) {
  const payload = { ...obj, createdAt: obj.createdAt ?? Date.now() };
  const line = JSON.stringify(payload) + '\n';
  await fsp.appendFile(ALERTS_FILE, line, 'utf-8');
}

export async function findMessages({ fromMs }) {
  const out = [];
  try {
    const txt = await fsp.readFile(FILE, 'utf-8');
    if (!txt) return out;
    for (const raw of txt.split(/\r?\n/)) {
      const t = raw.trim();
      if (!t) continue;
      try {
        const obj = JSON.parse(t);
        if (!fromMs || obj.createdAt >= fromMs) out.push(obj);
      } catch {}
    }
    out.sort((a, b) => a.createdAt - b.createdAt);
    return out;
  } catch {
    return out;
  }
}
