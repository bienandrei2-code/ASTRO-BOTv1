const fs = require("fs");
const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
  REST,
  Routes,
  SlashCommandBuilder
} = require("discord.js");

const CONFIG = "./verifierConfig.json";

const load = () => fs.existsSync(CONFIG) ? JSON.parse(fs.readFileSync(CONFIG)) : {};
const save = data => fs.writeFileSync(CONFIG, JSON.stringify(data, null, 2));

module.exports = async (client) => {

  // Register /verify dynamically in all guilds
  client.once("ready", async () => {
    const command = new SlashCommandBuilder()
      .setName("verify")
      .setDescription("Setup the verifier system");

    const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

    try {
      const guilds = client.guilds.cache.map(g => g.id);
      for (const guildId of guilds) {
        await rest.put(
          Routes.applicationGuildCommands(client.user.id, guildId),
          { body: [command.toJSON()] }
        );
      }
      console.log("✅ /verify command registered in all guilds!");
    } catch (err) {
      console.error("Error registering /verify:", err);
    }
  });

  // Slash command handler
  client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "verify") return;
    if (interaction.user.id !== interaction.guild.ownerId)
      return interaction.reply({ content: "❌ Only server owner", ephemeral: true });

    const channels = interaction.guild.channels.cache
      .filter(c => c.isTextBased())
      .map(c => ({ label: c.name, value: c.id }));

    const roles = interaction.guild.roles.cache
      .filter(r => r.id !== interaction.guild.id)
      .map(r => ({ label: r.name, value: r.id }));

    // Drop-down menus
    const rows = [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("channel")
          .setPlaceholder("Select channel where verification works")
          .addOptions(channels)
      ),
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("give")
          .setPlaceholder("Select role(s) to GIVE")
          .setMinValues(1)
          .setMaxValues(roles.length)
          .addOptions(roles)
      ),
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("remove")
          .setPlaceholder("Select role(s) to REMOVE")
          .setMinValues(0)
          .setMaxValues(roles.length)
          .addOptions(roles)
      )
    ];

    await interaction.reply({ content: "🛡️ Setup verifier:", components: rows, ephemeral: true });

    const temp = {};
    const collector = interaction.channel.createMessageComponentCollector({ time: 120000 });

    collector.on("collect", async i => {
      if (i.user.id !== interaction.user.id) return;
      temp[i.customId] = i.values;
      await i.deferUpdate();

      if (temp.channel && temp.give) {
        const data = load();
        data[interaction.guild.id] = {
          channel: temp.channel[0],
          give: temp.give,
          remove: temp.remove || []
        };
        save(data);
        await interaction.followUp({ content: "✅ Verifier configured!", ephemeral: true });
        collector.stop();
      }
    });
  });

  // Reaction handler
  client.on("messageReactionAdd", async (reaction, user) => {
    if (user.bot || reaction.emoji.name !== "✅") return;

    const cfg = load()[reaction.message.guild.id];
    if (!cfg) return;

    // Only run in selected channel
    if (reaction.message.channel.id !== cfg.channel) return;

    const member = await reaction.message.guild.members.fetch(user.id);

    // Add/remove roles
    if (cfg.give) for (const r of cfg.give) await member.roles.add(r).catch(() => {});
    if (cfg.remove) for (const r of cfg.remove) await member.roles.remove(r).catch(() => {});

    // Embed
    const embed = new EmbedBuilder()
      .setColor("Green")
      .setTitle("✅ VERIFIED!")
      .addFields(
        { name: "Role Update", value: `${reaction.message.guild.roles.cache.filter(r => member.roles.cache.has(r.id)).map(r => r.name).join(", ")}` }
      )
      .setDescription(`${member} has been verified by ${reaction.message.author} 🎉 Congrats!`)
      .setFooter({ text: `Welcome to KB SMP! Members: ${reaction.message.guild.members.cache.filter(m => !m.user.bot).size}` });

    reaction.message.channel.send({ embeds: [embed] });
  });

};

