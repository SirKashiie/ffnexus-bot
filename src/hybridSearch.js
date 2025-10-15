// src/hybridSearch.js
import MiniSearch from 'minisearch';
import {
  loadDocs as providerLoadDocs,
  searchDocs as providerSearchByName,
  getDocById,
} from './docs.js';

const INDEX_STATE = {
  mini: null,
  docs: [],
  byId: new Map(),
  lastBuiltAt: 0,
};

const MODE = (process.env.DOCS_INDEX_MODE || 'hybrid').toLowerCase(); // hybrid | name | content
const REINDEX_ON_BOOT = String(process.env.DOCS_REINDEX_ON_BOOT || 'true').toLowerCase() === 'true';
const MAX_CHARS = Number(process.env.DOCS_MAX_INDEX_CHARS || 6000);
const FALLBACK_THRESHOLD = Number(process.env.DOCS_HYBRID_THRESHOLD || 3); // <N por nome => busca conteúdo

function newMini() {
  return new MiniSearch({
    fields: ['name', 'content'],
    storeFields: ['id', 'name'],
    searchOptions: {
      prefix: true,
      fuzzy: 0.1,
      boost: { name: 3, content: 1 },
    },
  });
}

export async function buildIndex({ force = true } = {}) {
  // 1) garantir docs listados
  await providerLoadDocs();
  const all = await providerSearchByName(''); // lista completa pelo provider
  INDEX_STATE.docs = all || [];
  INDEX_STATE.byId = new Map(INDEX_STATE.docs.map(d => [d.id, d]));

  // 2) modo somente nome
  if (MODE === 'name') {
    INDEX_STATE.mini = null;
    INDEX_STATE.lastBuiltAt = Date.now();
    console.log(`🔎 [index] mode=name, docs=${INDEX_STATE.docs.length}`);
    return { docs: INDEX_STATE.docs.length, contentIndexed: 0 };
  }

  // 3) construir índice de conteúdo (amostra)
  const mini = newMini();
  let contentIndexed = 0;

  for (const doc of INDEX_STATE.docs) {
    try {
      const full = await getDocById(doc.id);
      const snippet = (full.content || '').slice(0, MAX_CHARS);
      mini.add({ id: doc.id, name: doc.name, content: snippet });
      contentIndexed++;
    } catch {
      // ignora falhas em docs individuais
    }
  }

  INDEX_STATE.mini = mini;
  INDEX_STATE.lastBuiltAt = Date.now();
  console.log(`🔎 [index] mode=${MODE}, docs=${INDEX_STATE.docs.length}, contentIndexed=${contentIndexed}`);
  return { docs: INDEX_STATE.docs.length, contentIndexed };
}

export async function ensureIndexReady() {
  if (INDEX_STATE.lastBuiltAt === 0 && REINDEX_ON_BOOT) {
    await buildIndex({ force: true });
  }
}

export async function hybridSearch(query, limit = 20) {
  await ensureIndexReady();

  // modo 'content' puro
  if (MODE === 'content' && INDEX_STATE.mini) {
    const hits = INDEX_STATE.mini.search(query).slice(0, limit);
    return hits.map(h => INDEX_STATE.byId.get(h.id)).filter(Boolean);
  }

  // 1) tenta por nome
  let byName = [];
  try { byName = await providerSearchByName(query, limit); } catch {}

  // 2) se já foi suficiente, devolve
  if ((byName?.length || 0) >= FALLBACK_THRESHOLD || MODE === 'name') {
    return byName.slice(0, limit);
  }

  // 3) completa com conteúdo
  if (!INDEX_STATE.mini) return byName;

  const contentHits = INDEX_STATE.mini.search(query);
  const seen = new Set(byName.map(d => d.id));
  const blended = [...byName];

  for (const hit of contentHits) {
    if (blended.length >= limit) break;
    if (seen.has(hit.id)) continue;
    const doc = INDEX_STATE.byId.get(hit.id);
    if (doc) blended.push(doc);
  }
  return blended;
}
