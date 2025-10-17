import { getKeywordsFromMCP, setKeywordsToMCP, getIncidentKeywordsFromMCP, setIncidentKeywordsToMCP } from './mcp.js';

export function getNormalized(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}+/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const trivialPatterns = [
  /^bom dia!?$/i,
  /^boa tarde!?$/i,
  /^boa noite!?$/i,
  /^kk+k+$/i,
  /^rs+$/i,
  /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+$/u,
  /^ok+$/i,
  /^blz+$/i,
  /^h{2,}$/i,
  /^e+ita+$/i,
  /^testando$/i,
  /^.$/
];

const CHATTER_WORDS = [
  'bom dia','boa tarde','boa noite','eae','fala galera','salve',
  'guilda','clã','clan','add','me adiciona','bora','vamo jogar',
  'partiu','manda nick','nick','ajuda','recrutando','recruta',
  'sala personalizada','sala','alguém','tô montando','to montando',
  'vem jogar','entra','grupo','meta','foco','equipe','time',
  'oi','olá','ola','tudo bem','kk','rs','haha','boa sorte',
  'vamos subir','me aceita','aceita','vem pro x1','tropa','squad'
];

const questionPatterns = [
  /(quando|que dia|qnd|vai ter|tem)\b.*(evento|passe|booyah|skin|atualiza(cao|ção))/i,
  /(algu[eé]m sabe|quando vem|quando vai vir|que dia sai)/i,
  /\?$/
];

const WEAK_TERMS = [
  'evento','novidade','quando','qnd','server','atualizacao','atualização'
];

const SENTIMENT = [
  'horrivel','horrível','ruim','pessimo','péssimo','bugado','bug','travando','lag','lento',
  'caro','barato','carissimo','otimo','ótimo','bom','muito bom','terrivel','terrível',
  'nerf','buff','corrigir','arrumar','conserta','nerfaram','buffaram','travou','demorado'
];

const PRODUCT = [
  'passe booyah','booyah','passe','skin','gloo wall','parede de gel','royale',
  'top criminal','dourado','emote','token','bundle','booyah pass','booyapass'
];

const MIN_SCORE = Number(process.env.MIN_SCORE || 2);
const MIN_WORDS = Number(process.env.MIN_WORDS || 3);
const KEYWORDS_CACHE_TTL = Number(process.env.KEYWORDS_CACHE_TTL || 300) * 1000;

export function scoreMessage(norm, keywords = []) {
  let score = 0;
  const words = norm.split(/\s+/);
  const kws = (keywords || []).map(k => k.toLowerCase());
  const hasAny = (list) => list.some(w => norm.includes(w));

  if (hasAny(SENTIMENT)) score += 2;
  if (hasAny(PRODUCT)) score += 1;

  for (const kw of kws) if (kw && norm.includes(kw)) score += 1;
  if (questionPatterns.some(rx => rx.test(norm))) score -= 1;

  const onlyWeak = WEAK_TERMS.some(w => norm.includes(w))
    && !hasAny(SENTIMENT)
    && !hasAny(PRODUCT)
    && !kws.some(kw => norm.includes(kw));
  if (onlyWeak) score -= 1;

  if (norm.length < 12 || words.length < MIN_WORDS) score -= 1;

  return score;
}

export function isChatter(norm) {
  if (!norm) return true;
  const hasChatterWord = CHATTER_WORDS.some(w => norm.includes(getNormalized(w)));
  if (hasChatterWord) return true;
  return trivialPatterns.some(rx => rx.test(norm));
}

export function passesKeywordFilter(norm, keywords) {
  if (!keywords || keywords.length === 0) return true;
  return keywords.some(kw => norm.includes(kw.toLowerCase()));
}

export function isRelevant(norm, keywords) {
  if (isChatter(norm)) return { ok: false, score: -99 };
  const score = scoreMessage(norm, keywords);
  return { ok: score >= MIN_SCORE, score };
}

export async function loadKeywordsFromMCP() {
  try {
    const list = await getKeywordsFromMCP();
    if (Array.isArray(list) && list.length) return list;
  } catch {}
  return [
    'passe booyah','booyah','skin','gloo wall','parede de gel',
    'nerf','buff','token','preco','preço','caro','barato','bug','lag',
    'servidor','evento','royale','bundle','horrivel','horrível','ruim','ótimo','otimo','feedback'
  ];
}

export async function learnKeywordsFromMessages(rows) {
  try {
    const freq = new Map();
    for (const r of rows) {
      const words = getNormalized(r.content).split(/[^a-z0-9]+/).filter(Boolean);
      for (const w of words) {
        if (w.length <= 3) continue;
        freq.set(w, (freq.get(w) || 0) + 1);
      }
    }
    const top = [...freq.entries()].filter(([_, c]) => c >= 3).map(([w]) => w).filter(Boolean);
    if (top.length) {
      const existing = await getKeywordsFromMCP();
      const merged = Array.from(new Set([...(existing || []), ...top]));
      await setKeywordsToMCP(merged);
    }
  } catch {}
}

const INCIDENT_KEYWORDS_BASE = [
  'não consigo logar','nao consigo logar','nao loga','nao entra','não entra',
  'login','logar','erro de login','servidor caiu','server down','server caiu',
  'não conecta','nao conecta','conectar','conexão','conexao','fila de login',
  'autenticação','autenticacao','deslogou','dc geral'
].map(getNormalized);

let incidentCache = {
  list: INCIDENT_KEYWORDS_BASE,
  loadedAt: 0
};

export function setIncidentKeywords(list) {
  const merged = Array.from(new Set([
    ...INCIDENT_KEYWORDS_BASE,
    ...(Array.isArray(list) ? list.map(getNormalized) : [])
  ]));
  incidentCache = { list: merged, loadedAt: Date.now() };
  return incidentCache.list;
}

export function getIncidentKeywords() {
  return incidentCache.list;
}

export async function loadIncidentKeywordsFromMCP() {
  try {
    const now = Date.now();
    if (now - incidentCache.loadedAt < KEYWORDS_CACHE_TTL && incidentCache.list?.length) {
      return incidentCache.list;
    }
    const list = await getIncidentKeywordsFromMCP();
    if (Array.isArray(list) && list.length) return setIncidentKeywords(list);
  } catch {}
  return setIncidentKeywords([]);
}

export async function saveIncidentKeywordsToMCP(list) {
  try {
    await setIncidentKeywordsToMCP(Array.isArray(list) ? list : []);
  } catch {}
}

export function isIncident(text) {
  const norm = getNormalized(text);
  if (!norm) return false;
  return incidentCache.list.some(k => norm.includes(k));
}

export function isRelevantMessage(m, keywords = []) {
  if (!m || m.author?.bot || m.system) return false;
  const content = (m.content || '').trim();
  const hasAttach = m.attachments?.size > 0;
  const norm = getNormalized(content);
  if (!hasAttach && !norm) return false;
  const { ok } = isRelevant(norm, keywords);
  return ok || hasAttach;
}
