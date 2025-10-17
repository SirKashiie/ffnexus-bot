// src/alerts.js
import { EmbedBuilder } from 'discord.js';

const WINDOW_MIN = Number(process.env.INCIDENT_WINDOW_MIN || 15);
const THRESHOLD = Number(process.env.INCIDENT_THRESHOLD || 1);

const INCIDENTS = [
  { key: 'login', label: 'Problemas de login/conexão', kw: ['login','logar','entrar','conectar','conexao','conexão','servidor','auth','conectar-se','não consigo entrar','nao consigo entrar'] },
  { key: 'lag', label: 'Lag/Ping/Quedas', kw: ['lag','ping','latencia','latência','travando','travou','delay','queda','desconectou','dc'] },
  { key: 'crash', label: 'Erros/Bugs/Crash', kw: ['bug','erro','error','crash','falha','travamento','fechou sozinho'] }
];

const state = new Map();

function detectType(norm) {
  for (const inc of INCIDENTS) {
    if (inc.kw.some(k => norm.includes(k))) return inc.key;
  }
  return null;
}

function pushAndCount(key) {
  const now = Date.now();
  const windowMs = WINDOW_MIN * 60 * 1000;
  const s = state.get(key) || { ts: [], lastAlertAt: 0 };
  s.ts = s.ts.filter(t => now - t <= windowMs);
  s.ts.push(now);
  state.set(key, s);
  return s.ts.length;
}

function shouldThrottle(key) {
  const now = Date.now();
  const s = state.get(key) || { ts: [], lastAlertAt: 0 };
  if (now - s.lastAlertAt < 2 * 60 * 1000) return true;
  return false;
}

function markAlert(key) {
  const s = state.get(key) || { ts: [], lastAlertAt: 0 };
  s.lastAlertAt = Date.now();
  state.set(key, s);
}

export async function processRelevantMessageForAlerts(client, row, norm) {
  const type = detectType(norm);
  if (!type) return;

  const count = pushAndCount(type);
  if (count < THRESHOLD) return;
  if (shouldThrottle(type)) return;

  const alertChannelId = process.env.ALERT_CHANNEL_ID || process.env.DEST_CHANNEL_ID;
  if (!alertChannelId) return;

  const meta = INCIDENTS.find(i => i.key === type);
  const title = `⚠️ Alerta: ${meta.label}`;
  const desc = [
    `Ocorrências nos últimos ${WINDOW_MIN} min: ${count}`,
    `Servidor: ${row.guildId || '-'}`,
    `Canal: ${row.channelId || '-'}`,
    `Autor: ${row.authorTag || row.authorId || '-'}`,
    row.url ? `Link: ${row.url}` : null
  ].filter(Boolean).join('\n');

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(desc)
    .setTimestamp(new Date(row.createdAt || Date.now()))
    .setFooter({ text: 'FFNexus • Garena BR' });

  try {
    const ch = await client.channels.fetch(alertChannelId);
    if (ch && ch.send) await ch.send({ embeds: [embed] });
    markAlert(type);
  } catch {}
}
