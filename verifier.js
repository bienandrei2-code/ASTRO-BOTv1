// verifier.js
const fs = require("fs");
const {
  ActionRowBuilder,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  EmbedBuilder
} = require("discord.js");

const CONFIG = "./verifierConfig.json";

const load = () => (fs.existsSync(CONFIG) ? JSON.parse(fs.readFileSync(CONFIG)) : {});
const save = (data) => fs.writeFileSync(CONFIG, JSON.stringify(data, null, 2));

module.exports = (client) => {

  // ---------------------
  // /verify COMMAND
  // ---------------------
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "verify") return;

    // Owner only
    if (interaction.user.id !== interaction.guild.ownerId)
      return interaction.reply({ content: "❌ Only server owner can use this.", ephemeral: true });

    // Dropbar menus
    const mainMenu = new ChannelSelectMenuBuilder()
      .setCustomId("main")
      .setPlaceholder("Select Main Verification Channel")
      .setMinValues(1)
      .setMaxValues(1)
      .addChannelTypes(0); // Text channels only

    const backupMenu = new ChannelSelectMenuBuilder()
      .setCustomId("backup")
      .setPlaceholder("Select Backup / Scan-Old Channel")
      .setMinValues(1)
      .setMaxValues(1)
      .addChannelTypes(0);

    const giveRoleMenu = new RoleSelectMenuBuilder()
      .setCustomId("give")
      .setPlaceholder("Select Role to GIVE")
      .setMinValues(1)
      .setMaxValues(1);

    const removeRoleMenu = new RoleSelectMenuBuilder()
      .setCustomId("remove")
      .setPlaceholder("Select Role to REMOVE (optional)")
      .setMinValues(0)
      .setMaxValues(1);

    await interaction.reply({
      content: "🛡️ **Verifier Setup**\nSelect channels and roles below:",
      components: [
        new ActionRowBuilder().addComponents(mainMenu),
        new ActionRowBuilder().addComponents(backupMenu),
        new ActionRowBuilder().addComponents(giveRoleMenu),
        new ActionRowBuilder().addComponents(removeRoleMenu)
      ],
      ephemeral: true
    });

    const temp = {};
    const collector = interaction.channel.createMessageComponentCollector({ time: 180000 });

    collector.on("collect", async (i) => {
      if (i.user.id !== interaction.user.id) return i.reply({ content: "❌ Not for you", ephemeral: true });

      if (i.isChannelSelectMenu() || i.isRoleSelectMenu()) {
        temp[i.customId] = i.values[0] || null;
        await i.deferUpdate();
      }

      if (temp.main && temp.backup && temp.give) {
        const data = load();
        data[interaction.guild.id] = {
          main: temp.main,
          backup: temp.backup,
          give: temp.give,
          remove: temp.remove || null
        };
        save(data);
        await interaction.followUp({ content: "✅ Verifier configured!", ephemeral: true });
        collector.stop();
      }
    });

    collector.on("end", (collected, reason) => {
      if (reason === "time" && !temp.main)
        interaction.followUp({ content: "⏰ Verifier setup timed out!", ephemeral: true });
    });
  });

  // ---------------------
  // REACTION VERIFY
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
      .setDescription(`${member} was verified by ${reaction.message.author}\n🎉 Congrats!`)
      .setFooter({
        text: `Welcome to KillboundSMP! We're now at ${reaction.message.guild.memberCount} members`
      });

    const channel = reaction.message.guild.channels.cache.get(cfg.main);
    if (channel) channel.send({ embeds: [embed] });
  });
};
