import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder
} from 'discord.js';
import fetch from 'node-fetch';
import 'dotenv/config';

const SOURCE_CHANNEL_IDS = process.env.SOURCE_CHANNEL_IDS?.split(',').map(id => id.trim()) || [];
const N8N_REPORT_WEBHOOK_URL = process.env.N8N_REPORT_WEBHOOK_URL;

// 🔧 Funções utilitárias
function filtrarMensagemUtil(m) {
  if (m.author.bot || m.system) return false;
  const texto = m.content?.trim();
  const temTexto = texto && texto.length > 3;
  const temAnexo = m.attachments.size > 0;
  return temTexto || temAnexo;
}

async function enviarParaN8N(mensagens, user) {
  try {
    const res = await fetch(N8N_REPORT_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tipo: 'manual',
        user,
        mensagens,
        timestamp: new Date().toISOString()
      }),
    });
    if (!res.ok) throw new Error(`Erro N8N: ${res.status}`);
    return true;
  } catch (err) {
    console.error('❌ Falha ao enviar para N8N:', err);
    return false;
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName('feedback')
    .setDescription('Analisa mensagens e gera relatório via N8N'),

  async execute(interaction) {
    try {
      // Etapa 1 — Escolha de idioma
      const embedIdioma = new EmbedBuilder()
        .setTitle('🗣️ Selecione o idioma / Select language')
        .setFooter({ text: 'FFNexus • Garena BR' });

      const rowIdioma = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('lang_pt')
          .setLabel('Português')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('lang_en')
          .setLabel('English')
          .setStyle(ButtonStyle.Secondary)
      );

      const reply = await interaction.reply({
        embeds: [embedIdioma],
        components: [rowIdioma],
        ephemeral: true
      });

      const idiomaSelecionado = await reply
        .awaitMessageComponent({ time: 60000 })
        .catch(() => null);

      if (!idiomaSelecionado) {
        await interaction.editReply({ content: '⏰ Tempo esgotado.', components: [] });
        return;
      }

      await idiomaSelecionado.deferUpdate();

      // Etapa 2 — Escolha de período
      const embedPeriodo = new EmbedBuilder()
        .setTitle('🕒 Gerar relatório de feedback')
        .setDescription('Escolha o período de mensagens que deseja analisar.')
        .setFooter({ text: 'FFNexus • Garena BR' });

      const rowPeriodo = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('period')
          .setPlaceholder('Selecione o período...')
          .addOptions([
            { label: 'Última 1h', value: '1' },
            { label: 'Últimas 6h', value: '6' },
            { label: 'Últimas 12h', value: '12' },
            { label: 'Últimas 24h', value: '24' },
          ])
      );

      await interaction.editReply({ embeds: [embedPeriodo], components: [rowPeriodo] });

      const periodoSelecionado = await interaction.channel
        .awaitMessageComponent({ time: 60000 })
        .catch(() => null);

      if (!periodoSelecionado) {
        await interaction.editReply({ content: '⏰ Tempo esgotado.', components: [] });
        return;
      }

      const hours = parseInt(periodoSelecionado.values[0]);
      const cutoff = Date.now() - hours * 60 * 60 * 1000;

      // Etapa 3 — Coleta de mensagens
      const messages = [];
      for (const id of SOURCE_CHANNEL_IDS) {
        const channel = await interaction.client.channels.fetch(id);
        const fetched = await channel.messages.fetch({ limit: 100 });
        fetched.forEach(m => {
          if (filtrarMensagemUtil(m) && m.createdTimestamp > cutoff) {
            messages.push({
              author: m.author?.tag || 'Desconhecido',
              content: m.content?.trim() || '[Imagem sem texto]',
              url: m.url,
              attachments: Array.from(m.attachments.values()).map(a => a.url),
              createdAt: m.createdAt
            });
          }
        });
      }

      // Envio ao N8N
      const enviado = await enviarParaN8N(messages, interaction.user.tag);

      const embedResultado = new EmbedBuilder()
        .setTitle(
          enviado
            ? '✅ Relatório enviado para o N8N. Aguarde processamento.'
            : '❌ Falha ao enviar relatório.'
        )
        .setFooter({ text: 'FFNexus • Garena BR' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embedResultado], components: [] });
    } catch (err) {
      console.error('❌ Erro no comando /feedback:', err);
      await interaction.editReply({
        content: '❌ Ocorreu um erro ao processar o comando. Tente novamente.',
        components: []
      });
    }
  }
};
