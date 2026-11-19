require('dotenv').config();
const {
  Client, GatewayIntentBits, REST, Routes,
  SlashCommandBuilder, EmbedBuilder, ChannelType,
} = require('discord.js');
const { incrementCount, getCount } = require('./db');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const MAX_HISTORY_SCAN = 150_000;

async function scanHistory(member, guild) {
  let total = 0;
  const textChannels = [...guild.channels.cache.values()].filter(
    (ch) => ch.type === ChannelType.GuildText && ch.viewable
  );

  for (const channel of textChannels) {
    if (total >= MAX_HISTORY_SCAN) break;
    try {
      let before;
      while (true) {
        const msgs = await channel.messages.fetch({ limit: 100, before });
        if (!msgs.size) break;
        total += msgs.filter((m) => m.author.id === member.id).length;
        if (msgs.size < 100 || total >= MAX_HISTORY_SCAN) break;
        before = msgs.last().id;
      }
    } catch {
      // skip unreadable channels
    }
  }
  return total;
}

const command = new SlashCommandBuilder()
  .setName('messages')
  .setDescription("Count messages a member has sent")
  .addUserOption((opt) =>
    opt.setName('user').setDescription('Member to check').setRequired(true)
  );

client.once('clientReady', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', (msg) => {
  if (msg.author.bot || !msg.inGuild()) return;
  incrementCount(msg.guildId, msg.author.id);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'messages') return;

  const member = interaction.options.getMember('user');
  if (!member) {
    return interaction.reply({ content: 'That user is not a member of this server.', ephemeral: true });
  }

  await interaction.deferReply();

  const joinedAt = `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`;
  const trackedCount = await getCount(interaction.guildId, member.id);
  const scannedCount = await scanHistory(member, interaction.guild);

  const lines = [
    `**Joined:** ${joinedAt}`,
  ];

  if (trackedCount > 0) {
    lines.push(`**Tracked** (since bot started): **${trackedCount.toLocaleString()}**`);
  } else {
    lines.push('_Tracked count: 0 _(no messages while bot was online)_');
  }

  lines.push(`**In-channel history**: **${scannedCount.toLocaleString()}**`);
  lines.push('_Deleted messages cannot be counted — Discord permanently removes them._');

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setAuthor({ name: member.user.tag, iconURL: member.displayAvatarURL() })
    .setDescription(lines.join('\n'));

  interaction.editReply({ embeds: [embed] });
});

(async () => {
  const rest = new REST().setToken(process.env.DISCORD_TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
    { body: [command.toJSON()] },
  );
  console.log('Slash command registered!');
  await client.login(process.env.DISCORD_TOKEN);
})();
