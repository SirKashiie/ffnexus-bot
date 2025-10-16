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
  EmbedBuilder, StringSelectMenuBuilder
} from 'discord.js';

import { initStore } from './storage.js';
import { loadKeywordsFromMCP } from './filters.js';

// ==== ENV ====
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_IDS = (process.env.GUILD_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
const DEST_CHANNEL_ID = process.env.DEST_CHANNEL_ID;
const SOURCE_CHANNEL_IDS = (process.env.SOURCE_CHANNEL_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
const ALLOWED_ROLE_IDS = (process.env.ALLOWED_ROLE_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
const TIMEZONE = process.env.TIMEZONE || 'America/Sao_Paulo';
const DOCS_PROVIDER = process.env.DOCS_PROVIDER || 'local';
const DIARIO_CONSELHEIRO_CHANNEL_IDS = (process.env.DIARIO_CONSELHEIRO_CHANNEL_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
const DIARIO_APRENDIZ_CHANNEL_IDS = (process.env.DIARIO_APRENDIZ_CHANNEL_IDS || '').split(',').map(s => s.trim()).filter(Boolean);

// ==== Cores (Free Fire)
const COLOR_RED = 0xE53935;
const COLOR_YELLOW = 0xFBC02D;
const COLOR_PURPLE = 0x9C27B0;

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

// ===============================================
// 🌍 Traduções
// ===============================================
const LANGS = {
  pt: {
    confirm: "✅ Confirmar",
    cancel: "❌ Cancelar",
    aiSummary: "🧠 Gerar resumo IA",
    rawMessages: "📜 Mensagens brutas",
    export: "📄 Exportar PDF/Sheets",
    back: "⬅️ Voltar",
    feedbackTitle: "🕒 Gerar relatório de feedback",
    feedbackDesc: "Escolha o período de mensagens que deseja analisar.",
    docTitle: "📚 Biblioteca de Documentos",
    docDesc: "Escolha uma opção:",
    searchDoc: "🔍 Pesquisar documento",
    viewList: "📁 Ver lista completa",
    diarioActions: "O que deseja fazer?",
    lastHours: "🕒 Últimas horas",
    today: "📅 Mensagens do dia",
    search: "🔍 Buscar palavra",
    last100: "🧾 Selecionar últimas 100",
    selectLang: "🗣️ Selecione o idioma / Select language",
    langPT: "🇧🇷 Português",
    langEN: "🇺🇸 English"
  },
  en: {
    confirm: "✅ Confirm",
    cancel: "❌ Cancel",
    aiSummary: "🧠 Generate AI Summary",
    rawMessages: "📜 Raw Messages",
    export: "📄 Export PDF/Sheets",
    back: "⬅️ Back",
    feedbackTitle: "🕒 Generate feedback report",
    feedbackDesc: "Choose the message period to analyze.",
    docTitle: "📚 Document Library",
    docDesc: "Choose an option:",
    searchDoc: "🔍 Search document",
    viewList: "📁 View full list",
    diarioActions: "What do you want to do?",
    lastHours: "🕒 Last hours",
    today: "📅 Today’s messages",
    search: "🔍 Search keyword",
    last100: "🧾 Select last 100",
    selectLang: "🗣️ Select your language",
    langPT: "🇧🇷 Portuguese",
    langEN: "🇺🇸 English"
  }
};

// ===============================================
// /feedback
// ===============================================
async function handleFeedbackCommand(interaction, lang = 'pt') {
  const L = LANGS[lang];
  await interaction.deferReply({ ephemeral: true, fetchReply: true });

  const select = new StringSelectMenuBuilder()
    .setCustomId('fb-time')
    .setPlaceholder(lang === 'pt' ? 'Selecione a janela de tempo' : 'Select time range')
    .addOptions([
      { label: lang === 'pt' ? 'Última 1h' : 'Last 1h', value: '3600000' },
      { label: lang === 'pt' ? 'Últimas 3h' : 'Last 3h', value: '10800000' },
      { label: lang === 'pt' ? 'Últimas 6h' : 'Last 6h', value: '21600000' },
      { label: lang === 'pt' ? 'Últimas 12h' : 'Last 12h', value: '43200000' },
      { label: lang === 'pt' ? 'Últimas 24h' : 'Last 24h', value: '86400000' },
    ]);

  const embed = new EmbedBuilder()
    .setColor(COLOR_RED)
    .setTitle(L.feedbackTitle)
    .setDescription(L.feedbackDesc)
    .setFooter({ text: 'FFNexus • Garena BR' });

  await interaction.editReply({
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(select)],
  });
}

// ===============================================
// /doc
// ===============================================
async function handleDocCommand(interaction, lang = 'pt') {
  const L = LANGS[lang];
  await interaction.deferReply({ ephemeral: true, fetchReply: true });

  const embed = new EmbedBuilder()
    .setColor(COLOR_YELLOW)
    .setTitle(L.docTitle)
    .setDescription(`${L.docDesc}\n\n${L.searchDoc}\n${L.viewList}`)
    .setFooter({ text: 'FFNexus • Garena BR' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('doc-search').setLabel(L.searchDoc).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('doc-list').setLabel(L.viewList).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('doc-cancel').setLabel(L.cancel).setStyle(ButtonStyle.Danger)
  );

  await interaction.editReply({ embeds: [embed], components: [row] });
}

// ===============================================
// /diario_aprendiz & /diario_conselheiro
// ===============================================
async function handleDiarioCommand(interaction, titulo, color, lang = 'pt') {
  const L = LANGS[lang];
  await interaction.deferReply({ ephemeral: true, fetchReply: true });

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`📘 ${titulo}`)
    .setDescription(`${L.diarioActions}\n\n${L.lastHours}\n${L.today}\n${L.search}\n${L.last100}\n${L.cancel}`)
    .setFooter({ text: 'FFNexus • Garena BR' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('diario-last').setLabel(L.lastHours).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('diario-today').setLabel(L.today).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('diario-search').setLabel(L.search).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('diario-100').setLabel(L.last100).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('diario-cancel').setLabel(L.cancel).setStyle(ButtonStyle.Danger)
  );

  await interaction.editReply({ embeds: [embed], components: [row] });
}

// ===============================================
// Router principal
// ===============================================
client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const L = LANGS.pt;
      const langSelect = new EmbedBuilder()
        .setColor(COLOR_PURPLE)
        .setTitle(L.selectLang)
        .setDescription(`${L.langPT}\n${L.langEN}`)
        .setFooter({ text: 'FFNexus • Garena BR' });

      const langRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('lang-pt').setLabel(L.langPT).setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('lang-en').setLabel(L.langEN).setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({ embeds: [langSelect], components: [langRow], ephemeral: true });
    }

    if (interaction.isButton() && (interaction.customId === 'lang-pt' || interaction.customId === 'lang-en')) {
      const lang = interaction.customId.split('-')[1];
      const cmd = interaction.message.interaction?.commandName;

      if (cmd === 'feedback') return handleFeedbackCommand(interaction, lang);
      if (cmd === 'doc') return handleDocCommand(interaction, lang);
      if (cmd === 'diario_aprendiz')
        return handleDiarioCommand(interaction, 'Diário dos Aprendizes', COLOR_YELLOW, lang);
      if (cmd === 'diario_conselheiro')
        return handleDiarioCommand(interaction, 'Diário dos Conselheiros', COLOR_RED, lang);
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
    new SlashCommandBuilder().setName('feedback').setDescription('Gera relatório das últimas mensagens.'),
    new SlashCommandBuilder().setName('doc').setDescription('Busca documentos e gera resumo IA.'),
    new SlashCommandBuilder().setName('diario_aprendiz').setDescription('Gera relatório IA para aprendizes.'),
    new SlashCommandBuilder().setName('diario_conselheiro').setDescription('Gera relatório IA para conselheiros.')
  ].map(c => c.toJSON());

  const rest = new REST({ version: '10' }).setToken(TOKEN);
  for (const gid of GUILD_IDS) {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, gid), { body: commands });
    console.log(`✅ Comandos atualizados no guild ${gid}`);
  }
}

// ===============================================
// Keep-alive + Start
// ===============================================
setInterval(() => console.log('🟢 FFNexus ativo - ' + new Date().toLocaleString('pt-BR')), 30000);

await registerCommands();
await client.login(TOKEN);
