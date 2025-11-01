// register-commands.js
import 'dotenv/config';
import { REST, Routes } from 'discord.js';

const commands = [
  {
    name: 'menu',
    description: 'Mở menu để nhập token bot khác + guildId + channelId + message'
  }
];

const rest = new REST({ version: '10' }).setToken(process.env.CONTROLLER_TOKEN);

(async () => {
  try {
    console.log('Registering commands...');
    await rest.put(
      Routes.applicationCommands(process.env.CONTROLLER_CLIENT_ID),
      { body: commands }
    );
    console.log('Done.');
  } catch (err) {
    console.error(err);
  }
})();
