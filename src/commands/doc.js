import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} from 'discord.js';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import 'dotenv/config';

const DOCS_DIR = process.env.DOCS_DIR || './data/docs';
const N8N_DOC_WEBHOOK_URL = process.env.N8N_DOC_WEBHOOK_URL;
const COLOR_RED = 0xE53935;
const COLOR_YELLOW = 0xFFD600;
const COLOR_WHITE = 0xffffff;

export default {
  data: new SlashCommandBuilder()
    .setName('doc')
    .setDescription('Acessa e resume documentos da biblioteca FFNexus'),

  async execute(interaction) {
    // Etapa 1 — Seleção de idioma
    const embedLang = new EmbedBuilder()
      .setColor(COLOR_RED)
      .setTitle('🗣️ Selecione o idioma / Select language')
      .setFooter({ text: 'FFNexus • Garena BR' });

    const rowLang = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('lang_pt')
        .setLabel('Português')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🇧🇷')
        .setStyle(3), // 🟡 amarelo
      new ButtonBuilder()
        .setCustomId('lang_en')
        .setLabel('Inglês')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🇺🇸')
    );

    const reply = await interaction.reply({
      embeds: [embedLang],
      components: [rowLang],
      ephemeral: true,
    });

    const collector = reply.createMessageComponentCollector({ time: 60000 });

    collector.on('collect', async (i) => {
      if (i.user.id !== interaction.user.id) return;
      await i.deferUpdate();

      // Etapa 2 — Escolher ação (Pesquisar / Ver lista)
      const embedAction = new EmbedBuilder()
        .setColor(COLOR_RED)
        .setTitle('📚 Biblioteca de Documentos')
        .setDescription('Escolha uma opção abaixo:')
        .setFooter({ text: 'FFNexus • Garena BR' });

      const rowAction = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('doc_search')
          .setLabel('Pesquisar documento')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🔍')
          .setStyle(3),
        new ButtonBuilder()
          .setCustomId('doc_list')
          .setLabel('Ver lista completa')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('📂'),
        new ButtonBuilder()
          .setCustomId('cancel')
          .setLabel('Cancelar')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('❌')
      );

      await i.editReply({ embeds: [embedAction], components: [rowAction] });
    });

    // Segunda coleta (ações da biblioteca)
    collector.on('end', async (_, reason) => {
      if (reason === 'time') {
        await interaction.editReply({
          content: '⏰ Tempo esgotado. Tente novamente com `/doc`.',
          components: [],
        });
      }
    });

    // Novo collector global de botões (documentos)
    interaction.client.on('interactionCreate', async (btn) => {
      if (!btn.isButton() || btn.user.id !== interaction.user.id) return;

      // Cancelar
      if (btn.customId === 'cancel') {
        await btn.update({
          content: '❌ Operação cancelada.',
          embeds: [],
          components: [],
        });
        return;
      }

      // Etapa 3 — Mostrar lista completa
      if (btn.customId === 'doc_list') {
        const files = fs
          .readdirSync(DOCS_DIR)
          .filter((f) => !f.startsWith('.') && f.endsWith('.txt'));

        if (files.length === 0) {
          await btn.update({
            embeds: [
              new EmbedBuilder()
                .setColor(COLOR_RED)
                .setDescription('📁 Nenhum documento encontrado na biblioteca.'),
            ],
            components: [],
          });
          return;
        }

        const options = files.slice(0, 25).map((file) => ({
          label: file.length > 90 ? file.slice(0, 87) + '...' : file,
          value: file,
        }));

        const select = new StringSelectMenuBuilder()
          .setCustomId('select_doc')
          .setPlaceholder('Selecione um documento...')
          .addOptions(options);

        const embedList = new EmbedBuilder()
          .setColor(COLOR_RED)
          .setTitle('📂 Lista de Documentos')
          .setDescription('Selecione um arquivo para visualizar as opções.')
          .setFooter({ text: 'FFNexus • Garena BR' });

        await btn.update({
          embeds: [embedList],
          components: [new ActionRowBuilder().addComponents(select)],
        });
      }
    });

    // Seleção de documento
    interaction.client.on('interactionCreate', async (menu) => {
      if (!menu.isStringSelectMenu() || menu.customId !== 'select_doc') return;
      if (menu.user.id !== interaction.user.id) return;

      const selectedFile = menu.values[0];
      const embedOptions = new EmbedBuilder()
        .setColor(COLOR_RED)
        .setTitle('📄 Documento Selecionado')
        .setDescription(`**${selectedFile}**\nEscolha uma ação abaixo:`)
        .setFooter({ text: 'FFNexus • Garena BR' });

      const rowOptions = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`summary_${selectedFile}`)
          .setLabel('Resumo IA')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🤖')
          .setStyle(3),
        new ButtonBuilder()
          .setCustomId(`download_${selectedFile}`)
          .setLabel('Link para download')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🔗'),
        new ButtonBuilder()
          .setCustomId('back_library')
          .setLabel('Voltar')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('⬅️')
      );

      await menu.update({ embeds: [embedOptions], components: [rowOptions] });
    });

    // Etapa final — Ações do documento
    interaction.client.on('interactionCreate', async (btn) => {
      if (!btn.isButton() || btn.user.id !== interaction.user.id) return;

      // Voltar à biblioteca
      if (btn.customId === 'back_library') {
        await btn.update({
          content: '🔙 Voltando à biblioteca...',
          embeds: [],
          components: [],
        });
        await execute(interaction); // reinicia fluxo
        return;
      }

      // Download
      if (btn.customId.startsWith('download_')) {
        const filename = btn.customId.replace('download_', '');
        const filePath = path.join(DOCS_DIR, filename);
        if (!fs.existsSync(filePath)) {
          await btn.update({
            content: '⚠️ Arquivo não encontrado.',
            embeds: [],
            components: [],
          });
          return;
        }
        await btn.reply({
          content: `📥 [Clique aqui para baixar **${filename}**](${filePath})`,
          ephemeral: true,
        });
        return;
      }

      // Resumo IA
      if (btn.customId.startsWith('summary_')) {
        const filename = btn.customId.replace('summary_', '');
        const filePath = path.join(DOCS_DIR, filename);
        const content = fs.readFileSync(filePath, 'utf8');

        const embedLoading = new EmbedBuilder()
          .setColor(COLOR_YELLOW)
          .setDescription(`⏳ Gerando resumo inteligente para **${filename}**...`);
        await btn.update({ embeds: [embedLoading], components: [] });

        try {
          const res = await fetch(N8N_DOC_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename, content }),
          });

          const data = await res.json();
          const resumo = data?.choices?.[0]?.message?.content || '⚠️ Não foi possível gerar o resumo.';

          const embedResumo = new EmbedBuilder()
            .setColor(COLOR_RED)
            .setTitle(`🧠 Resumo IA — ${filename}`)
            .setDescription(resumo.slice(0, 3900))
            .setFooter({ text: 'FFNexus • Gerado via IA' });

          const rowResumo = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('keep_summary')
              .setLabel('Manter no chat')
              .setStyle(ButtonStyle.Success)
              .setEmoji('📤'),
            new ButtonBuilder()
              .setCustomId('view_only')
              .setLabel('Apenas visualizar')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('👁️'),
            new ButtonBuilder()
              .setCustomId('back_library')
              .setLabel('Voltar')
              .setStyle(ButtonStyle.Danger)
              .setEmoji('⬅️')
          );

          await btn.editReply({ embeds: [embedResumo], components: [rowResumo] });
        } catch (err) {
          console.error(err);
          await btn.editReply({
            embeds: [new EmbedBuilder().setColor(COLOR_RED).setDescription('❌ Erro ao processar o documento.')],
            components: [],
          });
        }
      }
    });
  },
};
