// verifier.js
const fs = require("fs");
const {
  Client,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  REST,
  Routes,
  SlashCommandBuilder
} = require("discord.js");

const CONFIG = "./verifierConfig.json";

// ---------------------
// Helpers to load/save
// ---------------------
const load = () => fs.existsSync(CONFIG) ? JSON.parse(fs.readFileSync(CONFIG)) : {};
const save = data => fs.writeFileSync(CONFIG, JSON.stringify(data, null, 2));

module.exports = async (client) => {

  // ---------------------
  // Auto-register /verify
  // ---------------------
  const command = new SlashCommandBuilder()
    .setName("verify")
    .setDescription("Setup the verifier system");

  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  client.once("ready", async () => {
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

  // ---------------------
  // Interaction Handler
  // ---------------------
  client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "verify") return;
    if (interaction.user.id !== interaction.guild.ownerId)
      return interaction.reply({ content: "❌ Owner only", ephemeral: true });

    const channels = interaction.guild.channels.cache
      .filter(c => c.isTextBased())
      .map(c => ({ label: c.name, value: c.id }));

    const roles = interaction.guild.roles.cache
      .filter(r => r.id !== interaction.guild.id)
      .map(r => ({ label: r.name, value: r.id }));

    // Dropbar menus
    const rows = [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("main")
          .setPlaceholder("Main verification channel")
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
          .addOptions([{ label: "None", value: "none" }, ...roles])
      )
    ];

    await interaction.reply({ content: "🛡️ **Verifier Setup**", components: rows, ephemeral: true });

    const temp = {};
    const collector = interaction.channel.createMessageComponentCollector({ time: 120000 });

    collector.on("collect", async i => {
      if (i.user.id !== interaction.user.id) return;
      temp[i.customId] = i.values[0];
      await i.deferUpdate();

      if (temp.main && temp.backup && temp.give && temp.remove !== undefined) {
        const data = load();
        data[interaction.guild.id] = {
          main: temp.main,
          backup: temp.backup,
          give: temp.give,
          remove: temp.remove === "none" ? null : temp.remove
        };
        save(data);
        await interaction.followUp({ content: "✅ Verifier configured!", ephemeral: true });
        collector.stop();
      }
    });
  });

  // ---------------------
  // Reaction Handler
  // ---------------------
  client.on("messageReactionAdd", async (reaction, user) => {
    if (user.bot || reaction.emoji.name !== "✅") return;

    const cfg = load()[reaction.message.guild.id];
    if (!cfg) return;

    const member = await reaction.message.guild.members.fetch(user.id);

    if (cfg.give) await member.roles.add(cfg.give).catch(() => {});
    if (cfg.remove) await member.roles.remove(cfg.remove).catch(() => {});

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
