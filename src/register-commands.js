// src/register-commands.js
import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder } from 'discord.js';

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_IDS = (process.env.GUILD_IDS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const commands = [
  // /doc
  new SlashCommandBuilder()
    .setName('doc')
    .setDescription('Busca documentos por nome e conteúdo (híbrido)')
    .addStringOption(opt =>
      opt.setName('query')
        .setDescription('termo de busca')
        .setRequired(true)
    ),

  // /doc-reindex
  new SlashCommandBuilder()
    .setName('doc-reindex')
    .setDescription('Reconstrói o índice (nome + conteúdo)'),

  // /feedback (janela em HORAS = inteiro)
  new SlashCommandBuilder()
    .setName('feedback')
    .setDescription('Gera um relatório a partir das mensagens dos últimos X horas.')
    .addIntegerOption(opt =>
      opt.setName('horas')
        .setDescription('Janela em horas (ex.: 24).')
        .setMinValue(1)
        .setMaxValue(168)
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('senha')
        .setDescription('Senha (se exigida).')
        .setRequired(false)
    ),

  // /diario_aprendiz
  new SlashCommandBuilder()
    .setName('diario_aprendiz')
    .setDescription('Posta o diário do canal/thread de Aprendiz (últimas 24h).'),

  // /diario_conselheiro
  new SlashCommandBuilder()
    .setName('diario_conselheiro')
    .setDescription('Posta o diário do canal/thread de Conselheiro (últimas 24h).'),
].map(c => c.toJSON());

async function main() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  for (const gid of GUILD_IDS) {
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, gid),
      { body: commands }
    );
    console.log(`✅ Comandos atualizados no guild ${gid}`);
  }
}

main().catch(console.error);
