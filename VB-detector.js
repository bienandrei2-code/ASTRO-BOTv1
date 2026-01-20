const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder
} = require("discord.js");

/**
 * TEMP MEMORY STORAGE (resets on restart)
 * Later we can move this to JSON
 */
const vbConfig = {};
const warnings = {};

// VERY BASIC BAD WORD LIST (you can expand later)
const BAD_WORDS = ["fuck", "shit", "bitch", "asshole", "nigga"];

module.exports = {
  data: new SlashCommandBuilder()
    .setName("auto-vb")
    .setDescription("Auto verbal abuse detector")
    .addSubcommand(sub =>
      sub.setName("setup").setDescription("Setup VB detector")
    ),

  async execute(interaction, client) {
    // OWNER ONLY
    if (interaction.user.id !== interaction.guild.ownerId) {
      return interaction.reply({
        content: "❌ Only the server owner can use this.",
        ephemeral: true
      });
    }

    const sub = interaction.options.getSubcommand();
    if (sub !== "setup") return;

    // CHANNEL OPTIONS (MULTI)
    const textChannels = interaction.guild.channels.cache
      .filter(c => c.isTextBased())
      .map(c => ({
        label: c.name,
        value: c.id
      }));

    // ROLE + USER OPTIONS
    const pingOptions = [
      ...interaction.guild.roles.cache
        .filter(r => r.id !== interaction.guild.id)
        .map(r => ({
          label: `ROLE: ${r.name}`,
          value: `role_${r.id}`
        })),
      ...interaction.guild.members.cache.map(m => ({
        label: `USER: ${m.user.username}`,
        value: `user_${m.id}`
      }))
    ].slice(0, 25); // Discord limit

    // DROPDOWNS
    const detectChannelMenu = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("vb_detect_channels")
        .setPlaceholder("Select channels to DETECT VB")
        .setMinValues(1)
        .setMaxValues(5)
        .addOptions(textChannels)
    );

    const popupChannelMenu = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("vb_popup_channel")
        .setPlaceholder("Select POPUP channel (staff logs)")
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(textChannels)
    );

    const pingMenu = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("vb_ping_targets")
        .setPlaceholder("Select who to PING")
        .setMinValues(0)
        .setMaxValues(5)
        .addOptions(pingOptions)
    );

    await interaction.reply({
      content: "⚙️ **Auto-VB Setup**\nFollow the steps below:",
      components: [detectChannelMenu, popupChannelMenu, pingMenu],
      ephemeral: true
    });

    const temp = {};
    const collector = interaction.channel.createMessageComponentCollector({
      time: 120000
    });

    collector.on("collect", async i => {
      if (i.user.id !== interaction.user.id) return;

      if (i.customId === "vb_detect_channels") {
        temp.detectChannels = i.values;
        await i.deferUpdate();
      }

      if (i.customId === "vb_popup_channel") {
        temp.popupChannel = i.values[0];
        await i.deferUpdate();
      }

      if (i.customId === "vb_ping_targets") {
        temp.pings = i.values;
        await i.deferUpdate();
      }

      if (temp.detectChannels && temp.popupChannel) {
        vbConfig[interaction.guild.id] = temp;

        await interaction.followUp({
          content:
            "✅ **Auto-VB ENABLED**\n" +
            `• Detect channels: ${temp.detectChannels.length}\n` +
            `• Popup channel set\n` +
            `• Ping targets: ${temp.pings?.length || 0}`,
          ephemeral: true
        });

        collector.stop();
      }
    });
  }
};

/**
 * MESSAGE LISTENER (ANTI-VB CORE)
 * THIS RUNS AUTOMATICALLY
 */
module.exports.messageHandler = async message => {
  if (message.author.bot || !message.guild) return;

  const cfg = vbConfig[message.guild.id];
  if (!cfg) return;
  if (!cfg.detectChannels.includes(message.channel.id)) return;

  const content = message.content.toLowerCase();
  const detected = BAD_WORDS.find(w => content.includes(w));
  if (!detected) return;

  // WARNING COUNT
  warnings[message.author.id] ??= 0;
  warnings[message.author.id]++;

  const popup = message.guild.channels.cache.get(cfg.popupChannel);
  if (!popup) return;

  let pingText = "";
  if (cfg.pings) {
    for (const p of cfg.pings) {
      if (p.startsWith("role_")) {
        pingText += `<@&${p.replace("role_", "")}> `;
      }
      if (p.startsWith("user_")) {
        pingText += `<@${p.replace("user_", "")}> `;
      }
    }
  }

  const embed = new EmbedBuilder()
    .setColor("Red")
    .setTitle("🚨 VB DETECTED")
    .setDescription(
      `**User:** ${message.author}\n` +
      `**Word:** \`${detected}\`\n` +
      `**Channel:** ${message.channel}\n` +
      `**Warnings:** ${warnings[message.author.id]}`
    )
    .setFooter({ text: "ASTRO Auto-VB System" });

  popup.send({ content: pingText || null, embeds: [embed] });
};
