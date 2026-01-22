const fs = require("fs");
const {
  ActionRowBuilder,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  EmbedBuilder,
  ChannelType
} = require("discord.js");

const CONFIG = "./vbConfig.json";
const BAD_WORDS = ["fuck", "shit", "bitch", "asshole"];

const load = () =>
  fs.existsSync(CONFIG) ? JSON.parse(fs.readFileSync(CONFIG)) : {};
const save = d =>
  fs.writeFileSync(CONFIG, JSON.stringify(d, null, 2));

module.exports = client => {

  // ======================
  // SETUP COMMAND
  // ======================
  client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "autovb") return;

    if (interaction.user.id !== interaction.guild.ownerId)
      return interaction.reply({
        content: "❌ Only the server owner can use this.",
        ephemeral: true
      });

    const detectMenu = new ChannelSelectMenuBuilder()
      .setCustomId("vb_detect")
      .setPlaceholder("Select channels to scan (Auto-VB)")
      .setMinValues(1)
      .setMaxValues(5)
      .addChannelTypes(ChannelType.GuildText);

    const popupMenu = new ChannelSelectMenuBuilder()
      .setCustomId("vb_popup")
      .setPlaceholder("Select popup channel")
      .setMinValues(1)
      .setMaxValues(1)
      .addChannelTypes(ChannelType.GuildText);

    const pingMenu = new RoleSelectMenuBuilder()
      .setCustomId("vb_ping")
      .setPlaceholder("Select roles to ping")
      .setMinValues(0)
      .setMaxValues(5);

    await interaction.reply({
      content: "⚠️ **Auto-VB Setup**",
      components: [
        new ActionRowBuilder().addComponents(detectMenu),
        new ActionRowBuilder().addComponents(popupMenu),
        new ActionRowBuilder().addComponents(pingMenu)
      ],
      ephemeral: true
    });

    const temp = {};
    const collector =
      interaction.channel.createMessageComponentCollector({ time: 60000 });

    collector.on("collect", async i => {
      if (i.user.id !== interaction.user.id) return;

      temp[i.customId] = i.values;
      await i.deferUpdate();

      if (temp.vb_detect && temp.vb_popup && temp.vb_ping !== undefined) {
        const allData = load();

        allData[interaction.guild.id] = {
          detect: temp.vb_detect,
          popup: temp.vb_popup[0],
          ping: temp.vb_ping,
          warnings: {}
        };

        save(allData);

        await interaction.followUp({
          content: "✅ **Auto-VB has been enabled successfully!**",
          ephemeral: true
        });

        collector.stop();
      }
    });
  });

  // ======================
  // MESSAGE LISTENER
  // ======================
  client.on("messageCreate", async msg => {
    if (!msg.guild || msg.author.bot) return;

    const allData = load();
    const cfg = allData[msg.guild.id];
    if (!cfg) return;
    if (!cfg.detect.includes(msg.channel.id)) return;

    const bad = BAD_WORDS.find(w =>
      msg.content.toLowerCase().includes(w)
    );
    if (!bad) return;

    cfg.warnings[msg.author.id] =
      (cfg.warnings[msg.author.id] || 0) + 1;

    save(allData);

    const embed = new EmbedBuilder()
      .setColor("Red")
      .setTitle("🚨 DETECTED!")
      .setDescription(
        `${msg.author} has been detected!\n\n` +
        `**Word:** ${bad}\n` +
        `**Warnings:** ${cfg.warnings[msg.author.id]}\n\n` +
        (cfg.ping.length
          ? cfg.ping.map(r => `<@&${r}>`).join(" ")
          : "")
      )
      .setFooter({ text: "VB detected!" });

    const popupChannel = msg.guild.channels.cache.get(cfg.popup);
    if (popupChannel) popupChannel.send({ embeds: [embed] });
  });
};
