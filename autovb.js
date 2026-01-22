const fs = require("fs");
const { ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } = require("discord.js");

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

    await interaction.reply({
      content: "Select VB channels:",
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("vb_channels")
            .setMinValues(1)
            .setMaxValues(5)
            .addOptions(channels)
        )
      ],
      ephemeral: true
    });

    const col = interaction.channel.createMessageComponentCollector({ time: 60000 });

    col.on("collect", async i => {
      if (i.user.id !== interaction.user.id) return;

      const data = load();
      data[interaction.guild.id] = {
        channels: i.values,
        warnings: {}
      };
      save(data);

      await i.update({ content: "✅ Auto-VB enabled", components: [] });
      col.stop();
    });
  });

  // LISTENER
  client.on("messageCreate", async msg => {
    if (!msg.guild || msg.author.bot) return;

    const data = load()[msg.guild.id];
    if (!data || !data.channels.includes(msg.channel.id)) return;

    const bad = BAD_WORDS.find(w =>
      msg.content.toLowerCase().includes(w)
    );
    if (!bad) return;

    data.warnings[msg.author.id] = (data.warnings[msg.author.id] || 0) + 1;
    save(load());

    const embed = new EmbedBuilder()
      .setColor("Red")
      .setDescription(
        `${msg.author} used **${bad}**\nWarnings: **${data.warnings[msg.author.id]}**`
      );

    msg.channel.send({ embeds: [embed] });
  });
};
