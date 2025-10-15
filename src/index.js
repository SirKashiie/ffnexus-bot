// ===============================================
// 🧠 FFNEXUS V3 — MULTILÍNGUE + IA + PDF/SHEETS
// ===============================================
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import {
  Client, GatewayIntentBits, Partials,
  SlashCommandBuilder, REST, Routes,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  EmbedBuilder, StringSelectMenuBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle
} from 'discord.js';

import { initStore, saveMessage, findMessages } from './storage.js';
import { summarizeWithN8n } from './n8n.js';
import { loadKeywordsFromMCP, passesKeywordFilter, isChatter, getNormalized } from './filters.js';
import { searchDriveDocs, downloadDriveFile } from './drive.js';

// ==== ENV ====
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_IDS = (process.env.GUILD_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
const DEST_CHANNEL_ID = process.env.DEST_CHANNEL_ID;
const SOURCE_CHANNEL_IDS = (process.env.SOURCE_CHANNEL_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
const ALLOWED_ROLE_IDS = (process.env.ALLOWED_ROLE_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
const TIMEZONE = process.env.TIMEZONE || 'America/Sao_Paulo';

const DOCS_DIR = process.env.DOCS_DIR || './data/docs';
const DOCS_PROVIDER = process.env.DOCS_PROVIDER || 'local';
const DIARIO_CONSELHEIRO_CHANNEL_IDS = (process.env.DIARIO_CONSELHEIRO_CHANNEL_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
const DIARIO_APRENDIZ_CHANNEL_IDS = (process.env.DIARIO_APRENDIZ_CHANNEL_IDS || '').split(',').map(s => s.trim()).filter(Boolean);

// ==== Cores (Free Fire)
const COLOR_RED = 0xE53935;
const COLOR_YELLOW = 0xFBC02D;
const COLOR_PURPLE = 0x9C27B0;
const COLOR_GRAY = 0x2C2F33;

// ==== Cliente Discord ====
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember],
});

// ==== Boot ====
await initStore();
let KEYWORDS = await loadKeywordsFromMCP();

client.once('ready', () => {
  console.log(`✅ Logado como ${client.user.tag}`);
  console.log(`📚 Provider de documentos ativo: ${DOCS_PROVIDER}`);
});

// ==== Helpers ====
function hasAllowedRole(member) {
  if (!member) return false;
  if (!ALLOWED_ROLE_IDS.length) return true;
  return member.roles.cache.some(r => ALLOWED_ROLE_IDS.includes(r.id));
}

function withinSourceScope(message) {
  const isGuildC = DEST_CHANNEL_ID && message.guild?.channels?.cache?.get(DEST_CHANNEL_ID)?.guildId === message.guildId;
  if (isGuildC) return false;
  if (SOURCE_CHANNEL_IDS.length > 0) return SOURCE_CHANNEL_IDS.includes(message.channelId);
  if (GUILD_IDS.length > 0) return GUILD_IDS.includes(message.guildId);
  return true;
}

// ===============================================
// 🌍 Seleção de idioma (PT/EN)
// ===============================================
const LANGS = {
  pt: {
    confirm: "✅ Confirmar",
    cancel: "❌ Cancelar",
    aiSummary: "🧠 Gerar resumo IA",
    rawMessages: "📜 Mensagens brutas",
    export: "📄 Exportar PDF/Sheets",
    back: "⬅️ Voltar",
    selectLang: "🗣️ Selecione o idioma",
    selected: "Idioma definido: Português 🇧🇷"
  },
  en: {
    confirm: "✅ Confirm",
    cancel: "❌ Cancel",
    aiSummary: "🧠 Generate AI Summary",
    rawMessages: "📜 Raw Messages",
    export: "📄 Export PDF/Sheets",
    back: "⬅️ Back",
    selectLang: "🗣️ Select your language",
    selected: "Language set: English 🇺🇸"
  }
};

// ===============================================
// /feedback — IA + Export + Bruto
// ===============================================
async function handleFeedbackCommand(interaction, lang = 'pt') {
  await interaction.deferReply({ ephemeral: true });

  const L = LANGS[lang];

  const select = new StringSelectMenuBuilder()
    .setCustomId('fb-time')
    .setPlaceholder(lang === 'pt' ? 'Selecione a janela de tempo' : 'Select time range')
    .addOptions([
      { label: 'Última 1h / Last 1h', value: '3600000' },
      { label: 'Últimas 3h / Last 3h', value: '10800000' },
      { label: 'Últimas 6h / Last 6h', value: '21600000' },
      { label: 'Últimas 12h / Last 12h', value: '43200000' },
      { label: 'Últimas 24h / Last 24h', value: '86400000' },
    ]);

  const embed = new EmbedBuilder()
    .setColor(COLOR_RED)
    .setTitle(lang === 'pt' ? '🕒 Gerar relatório de feedback' : '🕒 Generate feedback report')
    .setDescription(lang === 'pt'
      ? 'Escolha o período de mensagens que deseja analisar.'
      : 'Choose the message period to analyze.')
    .setFooter({ text: 'FFNexus • Garena BR' });

  await interaction.editReply({
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(select)],
  });
}

// ===============================================
// /doc — IA + Download + Bruto + Export
// ===============================================
async function handleDocCommand(interaction, lang = 'pt') {
  await interaction.deferReply({ ephemeral: true });
  const L = LANGS[lang];

  const embed = new EmbedBuilder()
    .setColor(COLOR_YELLOW)
    .setTitle(lang === 'pt' ? '📚 Biblioteca de Documentos' : '📚 Document Library')
    .setDescription(lang === 'pt'
      ? 'Escolha uma opção:\n\n🔍 Pesquisar documento\n📁 Ver lista completa'
      : 'Choose an option:\n\n🔍 Search document\n📁 View full list')
    .setFooter({ text: 'FFNexus • Garena BR' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('doc-search').setLabel('🔍 Pesquisar / Search').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('doc-list').setLabel('📁 Ver lista / View list').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('doc-cancel').setLabel(L.cancel).setStyle(ButtonStyle.Danger)
  );

  await interaction.editReply({ embeds: [embed], components: [row] });
}

// ===============================================
// /diario_aprendiz & /diario_conselheiro
// ===============================================
async function handleDiarioCommand(interaction, channels, titulo, color, lang = 'pt') {
  await interaction.deferReply({ ephemeral: true });
  const L = LANGS[lang];

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(lang === 'pt' ? `📘 ${titulo}` : `📘 ${titulo} (English)`)
    .setDescription(lang === 'pt'
      ? 'O que deseja fazer?\n\n🕒 Últimas horas\n📅 Mensagens do dia\n🔍 Buscar palavra\n🧾 Selecionar últimas 100\n❌ Cancelar'
      : 'What do you want to do?\n\n🕒 Last hours\n📅 Today\'s messages\n🔍 Search keyword\n🧾 Select last 100\n❌ Cancel')
    .setFooter({ text: 'FFNexus • Garena BR' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('diario-last').setLabel('🕒 Últimas horas / Last hours').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('diario-today').setLabel('📅 Hoje / Today').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('diario-search').setLabel('🔍 Buscar / Search').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('diario-100').setLabel('🧾 100 últimas / Last 100').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('diario-cancel').setLabel(L.cancel).setStyle(ButtonStyle.Danger)
  );

  await interaction.editReply({ embeds: [embed], components: [row] });
}

// ===============================================
// Router principal
// ===============================================
client.on('interactionCreate', async (interaction) => {
  try {
    // Seleção de idioma (base)
    if (interaction.isChatInputCommand()) {
      const langSelect = new EmbedBuilder()
        .setColor(COLOR_PURPLE)
        .setTitle('🗣️ Selecione o idioma / Select language')
        .setDescription('🇧🇷 Português\n🇺🇸 English')
        .setFooter({ text: 'FFNexus • Garena BR' });

      const langRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('lang-pt').setLabel('🇧🇷 Português').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('lang-en').setLabel('🇺🇸 English').setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({ embeds: [langSelect], components: [langRow], ephemeral: true });
    }

    if (interaction.isButton() && (interaction.customId === 'lang-pt' || interaction.customId === 'lang-en')) {
      const lang = interaction.customId.split('-')[1];

      if (interaction.message.interaction?.commandName === 'feedback')
        return handleFeedbackCommand(interaction, lang);
      if (interaction.message.interaction?.commandName === 'doc')
        return handleDocCommand(interaction, lang);
      if (interaction.message.interaction?.commandName === 'diario_aprendiz')
        return handleDiarioCommand(interaction, DIARIO_APRENDIZ_CHANNEL_IDS, 'Diário dos Aprendizes', COLOR_YELLOW, lang);
      if (interaction.message.interaction?.commandName === 'diario_conselheiro')
        return handleDiarioCommand(interaction, DIARIO_CONSELHEIRO_CHANNEL_IDS, 'Diário dos Conselheiros', COLOR_RED, lang);
    }

  } catch (err) {
    console.error('❌ Erro em interactionCreate:', err);
  }
});

// ===============================================
// Registro de comandos
// ===============================================
async function registerCommands() {
  const commands = [
    new SlashCommandBuilder().setName('feedback').setDescription('Gera relatório das últimas mensagens. / Generate feedback report.'),
    new SlashCommandBuilder().setName('doc').setDescription('Busca documentos e gera resumo IA. / Search docs & AI summary.'),
    new SlashCommandBuilder().setName('diario_aprendiz').setDescription('Gera relatório IA para aprendizes. / AI report for apprentices.'),
    new SlashCommandBuilder().setName('diario_conselheiro').setDescription('Gera relatório IA para conselheiros. / AI report for mentors.')
  ].map(c => c.toJSON());

  const rest = new REST({ version: '10' }).setToken(TOKEN);
  for (const gid of GUILD_IDS) {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, gid), { body: commands });
    console.log(`✅ Comandos atualizados no guild ${gid}`);
  }
}

await registerCommands();
await client.login(TOKEN);
