const fs = require("fs");
const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder
} = require("discord.js");

const CONFIG = "./vbConfig.json";
const BAD_WORDS = ["fuck", "shit", "bitch", "asshole"];

const load = () =>
  fs.existsSync(CONFIG) ? JSON.parse(fs.readFileSync(CONFIG)) : {};
const save = d =>
  fs.writeFileSync(CONFIG, JSON.stringify(d, null, 2));

module.exports = client => {

  // SETUP
  client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "autovb") return;
    if (interaction.user.id !== interaction.guild.ownerId)
      return interaction.reply({ content: "❌ Owner only", ephemeral: true });

    const channels = interaction.guild.channels.cache
      .filter(c => c.isTextBased())
      .map(c => ({ label: c.name, value: c.id }))
      .slice(0, 25);

    const roles = interaction.guild.roles.cache
      .filter(r => r.id !== interaction.guild.id)
      .map(r => ({ label: r.name, value: r.id }))
      .slice(0, 25);

    await interaction.reply({
      content: "⚠️ **Auto-VB Setup**",
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("detect")
            .setPlaceholder("Channels to detect")
            .setMinValues(1)
            .setMaxValues(5)
            .addOptions(channels)
        ),
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("popup")
            .setPlaceholder("Popup channel")
            .addOptions(channels)
        ),
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("ping")
            .setPlaceholder("Roles to ping")
            .setMinValues(1)
            .setMaxValues(5)
            .addOptions(roles)
        )
      ],
      ephemeral: true
    });

    const temp = {};
    const col = interaction.channel.createMessageComponentCollector({ time: 60000 });

    col.on("collect", async i => {
      if (i.user.id !== interaction.user.id) return;
      temp[i.customId] = i.values;
      await i.deferUpdate();

      if (temp.detect && temp.popup && temp.ping) {
        const data = load();
        data[interaction.guild.id] = {
          detect: temp.detect,
          popup: temp.popup[0],
          ping: temp.ping,
          warnings: {}
        };
        save(data);
        interaction.followUp({ content: "✅ Auto-VB enabled!", ephemeral: true });
        col.stop();
      }
    });
  });

  // LISTENER
  client.on("messageCreate", async msg => {
    if (!msg.guild || msg.author.bot) return;

    const cfg = load()[msg.guild.id];
    if (!cfg || !cfg.detect.includes(msg.channel.id)) return;

    const bad = BAD_WORDS.find(w =>
      msg.content.toLowerCase().includes(w)
    );
    if (!bad) return;

    cfg.warnings[msg.author.id] =
      (cfg.warnings[msg.author.id] || 0) + 1;
    save(load());

    const embed = new EmbedBuilder()
      .setColor("Red")
      .setTitle("🚨 DETECTED!")
      .setDescription(
        `${msg.author} has been detected!\n\n` +
        `**Word:** ${bad}\n` +
        `**Warnings:** ${cfg.warnings[msg.author.id]}\n\n` +
        cfg.ping.map(r => `<@&${r}>`).join(" ")
      );

    const ch = msg.guild.channels.cache.get(cfg.popup);
    if (ch) ch.send({ embeds: [embed] });
  });
};
