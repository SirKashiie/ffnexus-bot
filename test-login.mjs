import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';

const token = process.env.DISCORD_TOKEN;
console.log('Token presente?', !!token);

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.on('ready', () => {
  console.log('READY AS', client.user?.tag);
  process.exit(0);
});

client.on('error', (e) => console.error('CLIENT_ERROR:', e));
process.on('unhandledRejection', (e) => console.error('UNHANDLED:', e));

client.login(token).catch(e => {
  console.error('LOGIN_ERROR:', e?.message || e);
  process.exit(1);
});
