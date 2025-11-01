// index.js
import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  Partials,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  SlashCommandBuilder,
  REST,
  Routes,
  ButtonBuilder,
  ButtonStyle,
  InteractionType,
} from 'discord.js';

const token = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const TEST_GUILD_ID = process.env.GUILD_ID || null; // guild test, để null nếu global

if (!BOT_TOKEN || !CLIENT_ID) {
  console.error('Vui lòng set TOKEN và CLIENT_ID trong .env');
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds], partials: [Partials.Channel] });
const states = new Map(); // key: userId, value: { controller, meta }

const randomMessages = [
  'Thằng kid lỏ này rác lắm 😎',
  'Cả ngày chỉ xem sex và lọ thôi🌀',
  'Cha mẹ mày.. Có khỏe không :)))',
  'Chào cả giòng họ nhà mày nhá ',
  'Giòng họ mày thất vọng vì ba mẹ mày đẻ được thằng vô sinh như mày💥',
  'Hí hí  😜',
];

function randomMsg() {
  return randomMessages[Math.floor(Math.random() * randomMessages.length)];
}

// --- register slash command ---
async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName('menu')
      .setDescription('Mở menu để nhập token bot phụ + guild + channel + user tùy chọn')
      .toJSON(),
  ];

  const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);

  try {
    if (TEST_GUILD_ID) {
      console.log('Registering guild command to', TEST_GUILD_ID);
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, TEST_GUILD_ID), { body: commands });
    } else {
      console.log('Registering global command (may take vài phút để hiện)');
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    }
    console.log('Commands registered.');
  } catch (err) {
    console.error('Failed to register commands:', err);
  }
}

// --- ready ---
client.once('ready', () => console.log(`Controller bot logged in as ${client.user.tag}`));

// --- interaction handler ---
client.on('interactionCreate', async (interaction) => {
  try {
    // Slash /menu
    if (interaction.isChatInputCommand() && interaction.commandName === 'menu') {
      const modal = new ModalBuilder().setCustomId('menu_modal').setTitle('Nhập token + guild + channel');

      const tokenInput = new TextInputBuilder()
        .setCustomId('token_input')
        .setLabel('Token bot phụ (BOT token)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const guildInput = new TextInputBuilder()
        .setCustomId('guild_input')
        .setLabel('Guild ID (Server)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const channelInput = new TextInputBuilder()
        .setCustomId('channel_input')
        .setLabel('Channel ID')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const userInput = new TextInputBuilder()
        .setCustomId('user_input')
        .setLabel('Ping User ID (tùy chọn)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('123456789012345678 hoặc <@123...> hoặc bỏ trống');

      modal.addComponents(
        new ActionRowBuilder().addComponents(tokenInput),
        new ActionRowBuilder().addComponents(guildInput),
        new ActionRowBuilder().addComponents(channelInput),
        new ActionRowBuilder().addComponents(userInput)
      );

      await interaction.showModal(modal);
      return;
    }

    // Modal submit -> start spam
    if (interaction.type === InteractionType.ModalSubmit && interaction.customId === 'menu_modal') {
      await interaction.deferReply({ ephemeral: true });

      const token = interaction.fields.getTextInputValue('token_input').trim();
      const guildId = interaction.fields.getTextInputValue('guild_input').trim();
      const channelId = interaction.fields.getTextInputValue('channel_input').trim();
      let rawUser = interaction.fields.getTextInputValue('user_input')?.trim() || '';

      // parse userId
      let userId = null;
      const mentionMatch = rawUser.match(/^<@!?(\d+)>$/);
      if (mentionMatch) userId = mentionMatch[1];
      else if (/^\d{17,20}$/.test(rawUser)) userId = rawUser;

      const uid = interaction.user.id;

      if (!token || token.length < 40) {
        await interaction.editReply({ content: '❌ Token quá ngắn, không hợp lệ.' });
        return;
      }

      const prev = states.get(uid);
      if (prev && prev.controller && prev.controller.subBot && prev.controller.stopFlag === false) {
        await interaction.editReply({ content: '⚠️ Phiên spam đang chạy. Dùng nút Stop trước khi tạo mới.' });
        return;
      }

      const state = { controller: { stopFlag: false, subBot: null }, meta: { token, guildId, channelId, userId } };
      states.set(uid, state);

      const stopBtn = new ButtonBuilder().setCustomId(`stop_${uid}`).setLabel('Stop').setStyle(ButtonStyle.Danger);
      const row = new ActionRowBuilder().addComponents(stopBtn);

      await interaction.editReply({ content: '✅ Đang đăng nhập bot phụ và spam. Bấm Stop để dừng.', components: [row] });

      (async () => {
        const subBot = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
        state.controller.subBot = subBot;

        try {
          await subBot.login(token);
        } catch (err) {
          console.error('Sub-bot login failed:', err);
          try { await interaction.followUp({ content: '❌ Đăng nhập bot phụ thất bại. Token không hợp lệ.', ephemeral: true }); } catch {}
          try { await subBot.destroy(); } catch {}
          states.delete(uid);
          return;
        }

        let targetChannel;
        try {
          const g = await subBot.guilds.fetch(guildId);
          const ch = await g.channels.fetch(channelId);
          if (!ch || !ch.isTextBased?.()) throw new Error('Channel không hợp lệ.');
          targetChannel = ch;
        } catch (err) {
          console.error('Fetch failed:', err);
          try { await interaction.followUp({ content: '❌ Không thể fetch guild/channel bot phụ.', ephemeral: true }); } catch {}
          try { await subBot.destroy(); } catch {}
          states.delete(uid);
          return;
        }

        try {
          while (!state.controller.stopFlag) {
            let content = randomMsg();
            if (state.meta.userId) content = `<@${state.meta.userId}> ` + content;
            try { await targetChannel.send(content); } catch (err) { break; }
            await new Promise((r) => setTimeout(r, 1000));
          }
        } finally {
          try { await subBot.destroy(); } catch {}
          states.delete(uid);
          try { await interaction.followUp({ content: '✅ Spam đã dừng và bot phụ bị hủy.', ephemeral: true }); } catch {}
        }
      })();

      return;
    }

    // Button Stop
    if (interaction.isButton() && interaction.customId.startsWith('stop_')) {
      const ownerId = interaction.customId.split('_')[1];
      if (interaction.user.id !== ownerId) {
        await interaction.reply({ content: '❌ Bạn không có quyền dừng phiên này.', ephemeral: true });
        return;
      }
      const st = states.get(ownerId);
      if (!st || !st.controller) {
        await interaction.reply({ content: 'Không có phiên nào đang chạy.', ephemeral: true });
        return;
      }
      st.controller.stopFlag = true;
      await interaction.reply({ content: '⏳ Yêu cầu dừng đã gửi...', ephemeral: true });
      return;
    }
  } catch (err) {
    console.error('Interaction error:', err);
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: 'Đã xảy ra lỗi nội bộ.', ephemeral: true });
      } else {
        await interaction.reply({ content: 'Đã xảy ra lỗi nội bộ.', ephemeral: true });
      }
    } catch {}
  }
});

// --- register command + login ---
(async () => {
  await registerCommands();
  await client.login(BOT_TOKEN);
})();

