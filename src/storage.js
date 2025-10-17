import fs from 'fs';
import * as fsp from 'fs/promises';
import path from 'path';

const DATA_DIR = './data';
const FILE = path.join(DATA_DIR, 'messages.jsonl');

export async function initStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, '', 'utf-8');
}

export async function saveMessage(obj) {
  const line = JSON.stringify(obj) + '\n';
  await fsp.appendFile(FILE, line, 'utf-8');
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

export async function pruneOlderThan(msAge) {
  const cutoff = Date.now() - msAge;
  try {
    const txt = await fsp.readFile(FILE, 'utf-8');
    if (!txt) return { kept: 0, pruned: 0 };
    const lines = txt.split(/\r?\n/);
    const kept = [];
    let pruned = 0;
    for (const raw of lines) {
      const t = raw.trim();
      if (!t) continue;
      try {
        const obj = JSON.parse(t);
        if (obj.createdAt >= cutoff) kept.push(JSON.stringify(obj));
        else pruned++;
      } catch {
        pruned++;
      }
    }
    await fsp.writeFile(FILE, kept.length ? kept.join('\n') + '\n' : '', 'utf-8');
    return { kept: kept.length, pruned };
  } catch {
    return { kept: 0, pruned: 0 };
  }
}
