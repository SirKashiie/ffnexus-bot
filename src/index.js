import 'dotenv/config';
import express from 'express';
import fetch from 'node-fetch';
import {
  Client, GatewayIntentBits, Partials,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  EmbedBuilder, StringSelectMenuBuilder
} from 'discord.js';
import { initStore } from './storage.js';
import { loadKeywordsFromMCP } from './filters.js';
import { registerAutoReportRoute } from './n8n.js';

const TOKEN = process.env.DISCORD_TOKEN;
const N8N_REPORT_WEBHOOK_URL = process.env.N8N_REPORT_WEBHOOK_URL;
const COLOR_RED = 0xE53935, COLOR_YELLOW = 0xFBC02D, COLOR_PURPLE = 0x9C27B0;

const app = express();
app.use(express.json());
app.get('/health', (req, res) => res.json({ ok: true }));
app.get('/', (req, res) => res.send('FFNexus HTTP OK'));
const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => console.log(`HTTP up on ${PORT}`));

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember],
});

await initStore();
await loadKeywordsFromMCP();

client.once('ready', () => console.log(`✅ Logado como ${client.user.tag}`));
registerAutoReportRoute(app, client);

const LANGS = {
  pt: {
    feedbackTitle: "🕒 Gerar relatório de feedback",
    feedbackDesc: "Escolha o período de mensagens que deseja analisar.",
    reportDone: "✅ Relatório enviado para o N8N. Aguarde processamento.",
    docTitle: "📚 Biblioteca de Documentos",
    docDesc: "Escolha uma opção:",
    searchDoc: "🔍 Pesquisar documento",
    viewList: "📁 Ver lista completa",
    diarioActions: "O que deseja fazer?",
    lastHours: "🕒 Últimas horas",
    today: "📅 Mensagens do dia",
    search: "🔍 Buscar palavra",
    last100: "🧾 Selecionar últimas 100",
    cancel: "❌ Cancelar",
    langSelect: "🗣️ Selecione o idioma / Select language",
    langPT: "🇧🇷 Português",
    langEN: "🇺🇸 English"
  },
  en: {
    feedbackTitle: "🕒 Generate feedback report",
    feedbackDesc: "Choose the message period to analyze.",
    reportDone: "✅ Report sent to N8N. Please wait while it is processed.",
    docTitle: "📚 Document Library",
    docDesc: "Choose an option:",
    searchDoc: "🔍 Search document",
    viewList: "📁 View full list",
    diarioActions: "What do you want to do?",
    lastHours: "🕒 Last hours",
    today: "📅 Today’s messages",
    search: "🔍 Search keyword",
    last100: "🧾 Select last 100",
    cancel: "❌ Cancel",
    langSelect: "🗣️ Select your language",
    langPT: "🇧🇷 Portuguese",
    langEN: "🇺🇸 English"
  }
};

function makeLangButtons(commandName) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`lang-pt|${commandName}`).setLabel(LANGS.pt.langPT).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`lang-en|${commandName}`).setLabel(LANGS.en.langEN).setStyle(ButtonStyle.Secondary)
  );
}

function feedbackSelectMenu(lang) {
  return new StringSelectMenuBuilder()
    .setCustomId('fb-time')
    .setPlaceholder(lang === 'pt' ? 'Selecione a janela de tempo' : 'Select time range')
    .addOptions([
      { label: lang === 'pt' ? 'Última 1h' : 'Last 1h', value: '3600000' },
      { label: lang === 'pt' ? 'Últimas 3h' : 'Last 3h', value: '10800000' },
      { label: lang === 'pt' ? 'Últimas 6h' : 'Last 6h', value: '21600000' },
      { label: lang === 'pt' ? 'Últimas 12h' : 'Last 12h', value: '43200000' },
      { label: lang === 'pt' ? 'Últimas 24h' : 'Last 24h', value: '86400000' }
    ]);
}

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const cmdName = interaction.commandName;
      const L = LANGS.pt;
      const embed = new EmbedBuilder()
        .setColor(COLOR_PURPLE)
        .setTitle(L.langSelect)
        .setDescription(`${L.langPT}\n${L.langEN}`)
        .setFooter({ text: 'FFNexus • Garena BR' });

      await interaction.reply({ embeds: [embed], components: [makeLangButtons(cmdName)], ephemeral: true });
      return;
    }

    if (interaction.isButton()) {
      const parts = interaction.customId.split('|');
      const lang = parts[0] === 'lang-pt' ? 'pt' : 'en';
      const cmd = parts[1] || null;

      if (cmd === 'feedback') {
        const embed = new EmbedBuilder()
          .setColor(COLOR_RED)
          .setTitle(LANGS[lang].feedbackTitle)
          .setDescription(LANGS[lang].feedbackDesc)
          .setFooter({ text: 'FFNexus • Garena BR' });

        await interaction.update({
          embeds: [embed],
          components: [new ActionRowBuilder().addComponents(feedbackSelectMenu(lang))]
        });
        return;
      }

      if (cmd === 'doc') {
        const embed = new EmbedBuilder()
          .setColor(COLOR_YELLOW)
          .setTitle(LANGS[lang].docTitle)
          .setDescription(`${LANGS[lang].docDesc}\n\n${LANGS[lang].searchDoc}\n${LANGS[lang].viewList}`)
          .setFooter({ text: 'FFNexus • Garena BR' });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`doc-search|${lang}`).setLabel(LANGS[lang].searchDoc).setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`doc-list|${lang}`).setLabel(LANGS[lang].viewList).setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`doc-cancel|${lang}`).setLabel(LANGS[lang].cancel).setStyle(ButtonStyle.Danger)
        );

        await interaction.update({ embeds: [embed], components: [row] });
        return;
      }

      await interaction.reply({ content: 'Opção selecionada.', ephemeral: true });
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'fb-time') {
      await interaction.deferReply({ ephemeral: true });
      try {
        const timeRange = interaction.values[0];
        const payload = {
          guild: interaction.guild?.name || 'Servidor desconhecido',
          user: interaction.user.tag,
          timeRange: parseInt(timeRange, 10),
          timestamp: Date.now()
        };

        const res = await fetch(N8N_REPORT_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error(`N8N HTTP ${res.status}`);
        await interaction.editReply(LANGS.pt.reportDone);
      } catch {
        try { await interaction.editReply('❌ Falha ao enviar relatório para o N8N.'); } catch {}
      }
      return;
    }
  } catch {
    try { if (!interaction.replied) await interaction.reply({ content: '❌ Erro inesperado ao processar.', ephemeral: true }); } catch {}
  }
});

setInterval(() => console.log('🟢 FFNexus ativo - ' + new Date().toLocaleString('pt-BR')), 30000);
client.login(TOKEN).catch(err => console.error('Discord login error:', err));

process.on('unhandledRejection', (e) => console.error('unhandledRejection', e));
process.on('uncaughtException', (e) => console.error('uncaughtException', e));
