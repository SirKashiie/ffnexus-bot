// src/apify.js
// ==========================================================
// 🔹 Integração com Apify (armazenamento remoto de relatórios)
// ==========================================================
// Funções:
// - appendToApify(data): envia o relatório consolidado para dataset remoto
// - fallback local automático se não houver token configurado
// ==========================================================

import fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import path from 'node:path';

const APIFY_TOKEN = (process.env.APIFY_TOKEN || '').trim();
const APIFY_DATASET_ID = (process.env.APIFY_DATASET_ID || '').trim();
const LOCAL_BACKUP = path.resolve('./data/reports_local.jsonl');

const API_BASE = 'https://api.apify.com/v2';

// ==========================================================
// 🔹 Envio remoto com timeout e log seguro
// ==========================================================
async function postWithTimeout(url, options, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ==========================================================
// 🔹 Função principal: appendToApify
// ==========================================================
export async function appendToApify(report = {}) {
  // Se não há token → salva local
  if (!APIFY_TOKEN) {
    await saveLocal(report);
    console.warn('[apify] ⚠️ APIFY_TOKEN ausente — relatório salvo localmente.');
    return;
  }

  try {
    let datasetId = APIFY_DATASET_ID;

    // cria novo dataset se não houver um definido
    if (!datasetId) {
      console.log('[apify] Criando novo dataset remoto...');
      const createRes = await postWithTimeout(`${API_BASE}/datasets?token=${APIFY_TOKEN}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'discord_report_dataset' }),
      });

      if (!createRes.ok) throw new Error(`Falha ao criar dataset (${createRes.status})`);
      const json = await createRes.json();
      datasetId = json?.data?.id;
      if (!datasetId) throw new Error('Dataset ID não retornado pela API Apify');
      console.log(`[apify] ✅ Novo dataset criado: ${datasetId}`);
    }

    // envia o relatório
    const url = `${API_BASE}/datasets/${datasetId}/items?token=${APIFY_TOKEN}`;
    const res = await postWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`);
    }

    console.log(`[apify] ✅ Relatório enviado com sucesso (${datasetId})`);
  } catch (err) {
    console.error('[apify] Falha no envio remoto:', err.message);
    await saveLocal(report);
  }
}

// ==========================================================
// 🔹 Fallback local — salva tudo em /data/reports_local.jsonl
// ==========================================================
async function saveLocal(report) {
  try {
    const dir = path.dirname(LOCAL_BACKUP);
    fs.mkdirSync(dir, { recursive: true });
    const line = JSON.stringify({ ...report, savedAt: new Date().toISOString() }) + '\n';
    await fsp.appendFile(LOCAL_BACKUP, line, 'utf-8');
    console.log('[apify] 💾 Backup local salvo com sucesso.');
  } catch (err) {
    console.error('[apify] Erro ao salvar backup local:', err.message);
  }
}
