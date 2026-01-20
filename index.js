// ------------------------
// IMPORTS & CONFIG
// ------------------------
const fs = require("fs");
require("dotenv").config(); // load TOKEN from .env
const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  REST,
  Routes,
  SlashCommandBuilder
} = require("discord.js");

// ------------------------
// CONFIG FILES
// ------------------------
const VERIFIER_CONFIG = "./verifierConfig.json";
const VB_CONFIG = "./vbConfig.json";

// Load/save helper functions
function loadConfig() {
  if (!fs.existsSync(VERIFIER_CONFIG)) return {};
  return JSON.parse(fs.readFileSync(VERIFIER_CONFIG));
}
function saveConfig(data) {
  fs.writeFileSync(VERIFIER_CONFIG, JSON.stringify(data, null, 2));
}

function loadVB() {
  if (!fs.existsSync(VB_CONFIG)) return {};
  return JSON.parse(fs.readFileSync(VB_CONFIG));
}
function saveVB(data) {
  fs.writeFileSync(VB_CONFIG, JSON.stringify(data, null, 2));
}

// ------------------------
// CREATE CLIENT
// ------------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Message, Partials.Reaction, Partials.Channel]
});

// ------------------------
// SLASH COMMANDS SETUP
// ------------------------
const CLIENT_ID = "YOUR_BOT_ID";  // Replace with your bot ID
const GUILD_ID = "YOUR_GUILD_ID";  // Replace with your server ID

const commands = [
  new SlashCommandBuilder()
    .setName("verifier")
    .setDescription("Setup or manage verification")
    .addSubcommand(sub => sub.setName("set").setDescription("Setup verifier channels and roles"))
    .addSubcommand(sub => sub.setName("scan-old").setDescription("Scan old messages")),
  new SlashCommandBuilder()
    .setName("autovb")
    .setDescription("Setup auto verbal abuse detection")
].map(cmd => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
  try {
    console.log("🔄 Registering slash commands...");
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );
    console.log("✅ Slash commands registered successfully!");
  } catch (err) {
    console.error("❌ Error registering commands:", err);
  }
})();

// ------------------------
// BOT READY
// ------------------------
client.once("ready", () => {
  console.log(`ASTRO online as ${client.user.tag}`);
});

// ------------------------
// INTERACTION HANDLER
// ------------------------
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  // Only server owner can use commands
  if (interaction.user.id !== interaction.guild.ownerId) {
    return interaction.reply({ content: "❌ Only the owner can use this.", ephemeral: true });
  }

  const verifierData = loadConfig();
  const vbData = loadVB();

  // ------------------------
  // VERIFIER COMMAND
  // ------------------------
  if (interaction.commandName === "verifier") {
    const sub = interaction.options.getSubcommand();

    // VERIFIER SET
    if (sub === "set") {
      const channels = interaction.guild.channels.cache
        .filter(ch => ch.isTextBased())
        .map(ch => ({ label: ch.name, value: ch.id }));

      const roles = interaction.guild.roles.cache
        .map(r => ({ label: r.name, value: r.id }));

      const noneOption = { label: "None", value: "none" };

      const mainMenu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("main_channel")
          .setPlaceholder("Select Main Channel")
          .addOptions(channels)
      );
      const backupMenu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("backup_channel")
          .setPlaceholder("Select Backup Channel")
          .addOptions(channels)
      );
      const giveMenu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("role_give")
          .setPlaceholder("Select Role to Give")
          .addOptions(roles)
      );
      const removeMenu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("role_remove")
          .setPlaceholder("Select Role to Remove")
          .addOptions([...roles, noneOption])
      );

      await interaction.reply({
        content: "Please select your verifier settings:",
        components: [mainMenu, backupMenu, giveMenu, removeMenu],
        ephemeral: true
      });

      const collector = interaction.channel.createMessageComponentCollector({ time: 120000 });
      let tempConfig = {};

      collector.on("collect", async i => {
        if (i.user.id !== interaction.user.id) return;

        switch (i.customId) {
          case "main_channel": tempConfig.mainChannel = i.values[0]; break;
          case "backup_channel": tempConfig.backupChannel = i.values[0]; break;
          case "role_give": tempConfig.roleToGive = i.values[0]; break;
          case "role_remove": tempConfig.roleToRemove = i.values[0] === "none" ? null : i.values[0]; break;
        }

        await i.deferUpdate();

        if (tempConfig.mainChannel && tempConfig.backupChannel && tempConfig.roleToGive !== undefined && tempConfig.roleToRemove !== undefined) {
          verifierData[interaction.guild.id] = tempConfig;
          saveConfig(verifierData);
          await interaction.followUp({ content: "✅ Verifier setup complete!", ephemeral: true });
          collector.stop();
        }
      });
    }

    // SCAN OLD MESSAGES
    if (sub === "scan-old") {
      const cfg = verifierData[interaction.guild.id];
      if (!cfg) return interaction.reply({ content: "❌ Verifier not set up yet.", ephemeral: true });

      const mainChannel = client.channels.cache.get(cfg.mainChannel);
      const backupChannel = client.channels.cache.get(cfg.backupChannel);
      if (!mainChannel || !backupChannel) return interaction.reply({ content: "❌ Channels not found.", ephemeral: true });

      await interaction.reply({ content: "🔄 Scanning old messages...", ephemeral: true });

      const messages = await mainChannel.messages.fetch({ limit: 100 });
      let repostCount = 0;

      for (const message of messages.values()) {
        if (message.author.bot) continue;
        const member = await interaction.guild.members.fetch(message.author.id).catch(() => null);
        if (!member) continue;

        if (member.roles.cache.has(cfg.roleToGive)) continue;

        try {
          await backupChannel.send({
            content: `📌 Old message from ${member}:\n"${message.content}"`,
            allowedMentions: { users: [member.id] }
          });
          repostCount++;
        } catch (err) {
          await backupChannel.send(`❌ Failed to repost message from ${member.tag}`);
        }
      }

      await interaction.followUp({ content: `✅ Reposted ${repostCount} old messages`, ephemeral: true });
    }
  }

  // ------------------------
  // AUTO VB COMMAND
  // ------------------------
  if (interaction.commandName === "autovb") {
    const channels = interaction.guild.channels.cache
      .filter(c => c.isTextBased())
      .map(c => ({ label: c.name, value: c.id }));

    const selectDetect = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("vb_detect")
        .setPlaceholder("Select detection channels")
        .setMinValues(1)
        .setMaxValues(channels.length)
        .addOptions(channels)
    );

    await interaction.reply({
      content: "Select channels where VB will be detected:",
      components: [selectDetect],
      ephemeral: true
    });

    const temp = {};
    const collector = interaction.channel.createMessageComponentCollector({ time: 60000 });

    collector.on("collect", async i => {
      if (i.user.id !== interaction.user.id) return;

      if (i.customId === "vb_detect") {
        temp.detect = i.values;

        const popupRow = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("vb_popup")
            .setPlaceholder("Select popup channel")
            .addOptions(channels)
        );

        await i.update({ content: "Select popup channel for warnings:", components: [popupRow] });
      }

      if (i.customId === "vb_popup") {
        const data = loadVB();
        data[interaction.guild.id] = {
          channels: temp.detect,
          popup: i.values[0],
          warnings: {}
        };
        saveVB(data);

        await i.update({ content: "✅ Auto VB detector setup complete", components: [] });
        collector.stop();
      }
    });
  }
});

// ------------------------
// REACTION VERIFICATION
// ------------------------
client.on("messageReactionAdd", async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) await reaction.fetch();
  if (reaction.message.partial) await reaction.message.fetch();

  const data = loadConfig();
  const cfg = data[reaction.message.guild.id];
  if (!cfg) return;

  if (![cfg.mainChannel, cfg.backupChannel].includes(reaction.message.channel.id)) return;
  if (reaction.emoji.name !== "✅") return;

  let member;
  try { member = await reaction.message.guild.members.fetch(reaction.message.author.id); } catch { return; }

  const roleGive = reaction.message.guild.roles.cache.get(cfg.roleToGive);
  const roleRemove = cfg.roleToRemove ? reaction.message.guild.roles.cache.get(cfg.roleToRemove) : null;

  if (roleRemove && member.roles.cache.has(roleRemove.id)) await member.roles.remove(roleRemove).catch(() => {});
  if (roleGive && !member.roles.cache.has(roleGive.id)) await member.roles.add(roleGive).catch(() => {});

  const embed = new EmbedBuilder()
    .setColor("Green")
    .setTitle("✅ VERIFIED!")
    .setDescription(`${member} was verified by ${user.tag} and is now a member!`)
    .setFooter({ text: `Welcome to ${reaction.message.guild.name}! Members: ${reaction.message.guild.memberCount}` });

  reaction.message.channel.send({ embeds: [embed] });
  reaction.users.remove(user.id).catch(() => {});
});

// ------------------------
// AUTO VB DETECTOR LIVE
// ------------------------
const BAD_WORDS = ["fuck","shit","bitch","asshole"];

client.on("messageCreate", async message => {
  if (!message.guild || message.author.bot) return;

  const vb = loadVB()[message.guild.id];
  if (!vb) return;
  if (!vb.channels.includes(message.channel.id)) return;

  const found = BAD_WORDS.find(w => message.content.toLowerCase().includes(w));
  if (!found) return;

  vb.warnings[message.author.id] = (vb.warnings[message.author.id] || 0) + 1;
  saveVB(loadVB());

  const embed = new EmbedBuilder()
    .setColor("Red")
    .setTitle("🚨 VB DETECTED!")
    .setDescription(`**User:** ${message.author}\n**Word:** \`${found}\`\n**Warnings:** ${vb.warnings[message.author.id]}`);

  const popup = message.guild.channels.cache.get(vb.popup);
  if (popup) popup.send({ embeds: [embed] });
});

// ------------------------
// LOGIN
// ------------------------
client.login(process.env.TOKEN);

