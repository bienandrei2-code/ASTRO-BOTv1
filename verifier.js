const fs = require("fs");
const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder
} = require("discord.js");

const CONFIG = "./verifierConfig.json";

const load = () =>
  fs.existsSync(CONFIG) ? JSON.parse(fs.readFileSync(CONFIG)) : {};
const save = data =>
  fs.writeFileSync(CONFIG, JSON.stringify(data, null, 2));

module.exports = client => {

  // SLASH COMMAND
  client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "verify") return;
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
      content: "🛡️ **Verifier Setup**",
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("main")
            .setPlaceholder("Main verify channel")
            .addOptions(channels)
        ),
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("backup")
            .setPlaceholder("Backup / scan-old channel")
            .addOptions(channels)
        ),
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("give")
            .setPlaceholder("Role to GIVE")
            .addOptions(roles)
        ),
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("remove")
            .setPlaceholder("Role to REMOVE")
            .addOptions(roles)
        )
      ],
      ephemeral: true
    });

    const temp = {};
    const col = interaction.channel.createMessageComponentCollector({ time: 60000 });

    col.on("collect", async i => {
      if (i.user.id !== interaction.user.id) return;
      temp[i.customId] = i.values[0];
      await i.deferUpdate();

      if (temp.main && temp.backup && temp.give && temp.remove) {
        const data = load();
        data[interaction.guild.id] = temp;
        save(data);
        interaction.followUp({ content: "✅ Verifier configured!", ephemeral: true });
        col.stop();
      }
    });
  });

  // REACTION VERIFY
  client.on("messageReactionAdd", async (reaction, user) => {
    if (user.bot || reaction.emoji.name !== "✅") return;

    const cfg = load()[reaction.message.guild.id];
    if (!cfg) return;

    const member = await reaction.message.guild.members.fetch(user.id);

    await member.roles.add(cfg.give).catch(() => {});
    await member.roles.remove(cfg.remove).catch(() => {});

    const embed = new EmbedBuilder()
      .setColor("Green")
      .setTitle("✅ VERIFIED!")
      .setDescription(
        `${member} was verified by ${reaction.message.author}\n🎉 Congrats!`
      )
      .setFooter({
        text: `Welcome to KillboundSMP! We're now at ${reaction.message.guild.memberCount} members`
      });

    const channel = reaction.message.guild.channels.cache.get(cfg.main);
    if (channel) channel.send({ embeds: [embed] });
  });
};
