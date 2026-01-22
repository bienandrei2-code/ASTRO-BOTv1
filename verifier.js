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

  // SLASH COMMANDS
  client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "verifier") return;
    if (interaction.user.id !== interaction.guild.ownerId)
      return interaction.reply({ content: "❌ Owner only", ephemeral: true });

    const data = load();

    if (interaction.options.getSubcommand() === "set") {
      const channels = interaction.guild.channels.cache
        .filter(c => c.isTextBased())
        .map(c => ({ label: c.name, value: c.id }))
        .slice(0, 25);

      const roles = interaction.guild.roles.cache
        .filter(r => r.id !== interaction.guild.id)
        .map(r => ({ label: r.name, value: r.id }))
        .slice(0, 25);

      await interaction.reply({
        content: "Setup verifier:",
        components: [
          new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId("main")
              .setPlaceholder("Main channel")
              .addOptions(channels)
          ),
          new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId("give")
              .setPlaceholder("Role to give")
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

        if (temp.main && temp.give) {
          data[interaction.guild.id] = {
            mainChannel: temp.main,
            roleToGive: temp.give
          };
          save(data);
          interaction.followUp({ content: "✅ Verifier saved", ephemeral: true });
          col.stop();
        }
      });
    }
  });

  // REACTION VERIFY
  client.on("messageReactionAdd", async (reaction, user) => {
    if (user.bot) return;
    if (reaction.emoji.name !== "✅") return;

    const data = load()[reaction.message.guild.id];
    if (!data) return;

    const member = await reaction.message.guild.members.fetch(user.id);
    await member.roles.add(data.roleToGive).catch(() => {});

    const channel = reaction.message.guild.channels.cache.get(data.mainChannel);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setColor("Green")
      .setTitle("✅ VERIFIED")
      .setDescription(`${member} is now verified!`);

    channel.send({ embeds: [embed] });
  });
};
