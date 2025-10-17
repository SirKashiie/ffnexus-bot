import { REST, Routes } from 'discord.js';
import fs from 'fs';
import 'dotenv/config';

const commands = [];
const foldersPath = './src/commands';
const commandFiles = fs.readdirSync(foldersPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = (await import(`./commands/${file}`)).default;
  if ('data' in command && 'execute' in command) {
    commands.push(command.data.toJSON());
  } else {
    console.log(`[AVISO] O comando em ${file} está sem "data" ou "execute".`);
  }
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

try {
  console.log(`🔁 Atualizando ${commands.length} comandos do servidor...`);
  const data = await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.SOURCE_GUILD_ID),
    { body: commands },
  );
  console.log(`✅ ${data.length} comandos registrados com sucesso no servidor local.`);
} catch (error) {
  console.error('❌ Erro ao registrar comandos:', error);
}
