// src/filters.js
// ==========================================================
// 🔹 Filtros e classificação de mensagens (feedbacks)
// ==========================================================
// Responsável por:
// - Normalizar texto
// - Ignorar mensagens irrelevantes (ex: "bom dia", "kkk", "guilda nova")
// - Pontuar mensagens com base em sentimento e contexto
// - Aprender novas palavras automaticamente (MCP ou local)
// ==========================================================

import { getKeywordsFromMCP, setKeywordsToMCP } from './mcp.js';

// ==========================================================
// 🔹 Normalização de texto
// ==========================================================
export function getNormalized(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}+/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ==========================================================
// 🔹 Padrões de ruído e irrelevância
// ==========================================================
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

// 🔹 Novo filtro semântico para conversas genéricas
const CHATTER_WORDS = [
  'bom dia', 'boa tarde', 'boa noite', 'eae', 'fala galera', 'salve',
  'guilda', 'clã', 'clan', 'add', 'me adiciona', 'bora', 'vamo jogar',
  'partiu', 'manda nick', 'nick', 'ajuda', 'recrutando', 'recruta',
  'sala personalizada', 'sala', 'alguém', 'tô montando', 'to montando',
  'vem jogar', 'entra', 'grupo', 'meta', 'foco', 'equipe', 'time',
  'oi', 'olá', 'ola', 'tudo bem', 'kk', 'rs', 'haha', 'boa sorte',
  'vamos subir', 'me aceita', 'aceita', 'vem pro x1', 'tropa', 'squad'
];

// Perguntas genéricas (costumam não ser feedback)
const questionPatterns = [
  /(quando|que dia|qnd|vai ter|tem)\b.*(evento|passe|booyah|skin|atualiza(cao|ção))/i,
  /(algu[eé]m sabe|quando vem|quando vai vir|que dia sai)/i,
  /\?$/ // termina com interrogação
];

// Palavras fracas (sozinhas não bastam)
const WEAK_TERMS = [
  'evento','novidade','quando','qnd','server','atualizacao','atualização'
];

// Palavras de sentimento
const SENTIMENT = [
  'horrivel','horrível','ruim','pessimo','péssimo','bugado','bug','travando','lag','lento',
  'caro','barato','carissimo','otimo','ótimo','bom','muito bom','terrivel','terrível',
  'nerf','buff','corrigir','arrumar','conserta','nerfaram','buffaram','travou','demorado'
];

// Palavras de produto / contexto de jogo
const PRODUCT = [
  'passe booyah','booyah','passe','skin','gloo wall','parede de gel','royale',
  'top criminal','dourado','emote','token','bundle','booyah pass','booyapass'
];

// ==========================================================
// 🔹 Configurações via .env
// ==========================================================
const MIN_SCORE = Number(process.env.MIN_SCORE || 2);
const MIN_WORDS = Number(process.env.MIN_WORDS || 3);

// ==========================================================
// 🔹 Scoring inteligente
// ==========================================================
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

// ==========================================================
// 🔹 Identificação de ruído (mensagens triviais, curtas ou off-topic)
// ==========================================================
export function isChatter(norm) {
  if (!norm) return true;

  const hasChatterWord = CHATTER_WORDS.some(w => norm.includes(getNormalized(w)));
  if (hasChatterWord) return true;

  return trivialPatterns.some(rx => rx.test(norm));
}

// ==========================================================
// 🔹 Verifica se contém alguma keyword
// ==========================================================
export function passesKeywordFilter(norm, keywords) {
  if (!keywords || keywords.length === 0) return true;
  return keywords.some(kw => norm.includes(kw.toLowerCase()));
}

// ==========================================================
// 🔹 Avalia relevância geral (score + regras)
// ==========================================================
export function isRelevant(norm, keywords) {
  if (isChatter(norm)) return { ok: false, score: -99 };
  const score = scoreMessage(norm, keywords);
  return { ok: score >= MIN_SCORE, score };
}

// ==========================================================
// 🔹 Carrega keywords do MCP/local
// ==========================================================
export async function loadKeywordsFromMCP() {
  try {
    const list = await getKeywordsFromMCP();
    if (Array.isArray(list) && list.length) return list;
  } catch (err) {
    console.warn('[filters] Falha ao carregar keywords:', err.message);
  }

  // fallback inicial
  return [
    'passe booyah','booyah','skin','gloo wall','parede de gel',
    'nerf','buff','token','preco','preço','caro','barato','bug','lag',
    'servidor','evento','royale','bundle','horrivel','horrível','ruim','ótimo','otimo','feedback'
  ];
}

// ==========================================================
// 🔹 Aprende novas keywords com base nas mensagens filtradas
// ==========================================================
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

    const top = [...freq.entries()]
      .filter(([_, c]) => c >= 3)
      .map(([w]) => w)
      .filter(Boolean);

    if (top.length) {
      const existing = await getKeywordsFromMCP();
      const merged = Array.from(new Set([...(existing || []), ...top]));
      await setKeywordsToMCP(merged);
      console.log(`[filters] 🧠 Aprendeu ${top.length} novas palavras.`);
    }
  } catch (e) {
    console.warn('[filters] Falha ao aprender keywords:', e.message);
  }
}
