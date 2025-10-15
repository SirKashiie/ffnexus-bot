// src/storage.js
// Armazenamento em JSONL (sem módulos nativos). Cada linha é um JSON de uma mensagem.
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
      } catch {
        // ignora linhas quebradas
      }
    }
    out.sort((a, b) => a.createdAt - b.createdAt);
    return out;
  } catch {
    return out; // se o arquivo não existir/erro de leitura, retorna vazio
  }
}
