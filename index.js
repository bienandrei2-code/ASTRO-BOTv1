// ------------------------
// IMPORTS & CONFIG
// ------------------------
const fs = require("fs");
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
// KEEP REPLIT ALIVE
// ------------------------
const app = express();
app.get("/", (req, res) => res.send("ASTRO is alive!"));
app.listen(3000);

// ------------------------
// BOT CLIENT
// ------------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [Partials.Message, Partials.Reaction, Partials.Channel]
});

// ------------------------
// CONFIG FILE
// ------------------------
const CONFIG_FILE = "./verifierConfig.json";

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) return {};
  return JSON.parse(fs.readFileSync(CONFIG_FILE));
}

function saveConfig(data) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2));
}

// ------------------------
// SLASH COMMANDS
// ------------------------
const CLIENT_ID = "YOUR_BOT_ID"; // Replace with your bot client ID
const GUILD_ID = "YOUR_GUILD_ID"; // Replace with your server ID

const commands = [
  new SlashCommandBuilder()
    .setName("verifier")
    .setDescription("Setup or manage the verification system")
    .addSubcommand(sub => sub.setName("set").setDescription("Setup verifier channels and roles"))
    .addSubcommand(sub => sub.setName("scan-old").setDescription("Scan old messages and post in backup channel"))
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
// /VERIFIER INTERACTIONS
// ------------------------
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  // Only server owner can run
  if (interaction.user.id !== interaction.guild.ownerId) {
    return interaction.reply({ content: "❌ Only the server owner can use this.", ephemeral: true });
  }

  const data = loadConfig();
  const sub = interaction.options.getSubcommand();

  // ------------------------
  // VERIFIER SETUP WITH DROPDOWNS
  // ------------------------
  if (sub === "set") {
    const channels = interaction.guild.channels.cache
      .filter(ch => ch.isTextBased())
      .map(ch => ({ label: ch.name, value: ch.id }));

    const roles = interaction.guild.roles.cache
      .map(r => ({ label: r.name, value: r.id }));

    const noneOption = { label: "None", value: "none" };

    // Dropdown menus
    const mainChannelMenu = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("main_channel")
        .setPlaceholder("Select Main Channel")
        .addOptions(channels)
    );
    const backupChannelMenu = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("backup_channel")
        .setPlaceholder("Select Backup Channel")
        .addOptions(channels)
    );
    const roleGiveMenu = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("role_give")
        .setPlaceholder("Select Role to Give")
        .addOptions(roles)
    );
    const roleRemoveMenu = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("role_remove")
        .setPlaceholder("Select Role to Remove")
        .addOptions([...roles, noneOption])
    );

    await interaction.reply({
      content: "Please select your verifier settings:",
      components: [mainChannelMenu, backupChannelMenu, roleGiveMenu, roleRemoveMenu],
      ephemeral: true
    });

    const collector = interaction.channel.createMessageComponentCollector({ time: 120000 });
    let tempConfig = {};

    collector.on("collect", async i => {
      if (i.user.id !== interaction.user.id) return;

      switch (i.customId) {
        case "main_channel":
          tempConfig.mainChannel = i.values[0];
          await i.deferUpdate();
          break;
        case "backup_channel":
          tempConfig.backupChannel = i.values[0];
          await i.deferUpdate();
          break;
        case "role_give":
          tempConfig.roleToGive = i.values[0];
          await i.deferUpdate();
          break;
        case "role_remove":
          tempConfig.roleToRemove = i.values[0] === "none" ? null : i.values[0];
          await i.deferUpdate();
          break;
      }

      if (
        tempConfig.mainChannel &&
        tempConfig.backupChannel &&
        tempConfig.roleToGive !== undefined &&
        tempConfig.roleToRemove !== undefined
      ) {
        data[interaction.guild.id] = tempConfig;
        saveConfig(data);
        await interaction.followUp({ content: "✅ Verifier setup complete!", ephemeral: true });
        collector.stop();
      }
    });
  }

  // ------------------------
  // SCAN OLD MESSAGES
  // ------------------------
  if (sub === "scan-old") {
    const cfg = data[interaction.guild.id];
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

      // Skip if already verified
      if (member.roles.cache.has(cfg.roleToGive)) continue;

      // Try to repost in backup channel
      try {
        await backupChannel.send({
          content: `📌 Old message from ${member}:\n"${message.content}"`,
          allowedMentions: { users: [member.id] } // pings member
        });
        repostCount++;
      } catch (err) {
        // If fail, send a fail message in the backup channel
        await backupChannel.send(`❌ Failed to repost message from ${member.tag}. Check bot permissions.`);
      }
    }

    await interaction.followUp({ content: `✅ Reposted ${repostCount} old messages to backup channel.`, ephemeral: true });
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
  try {
    member = await reaction.message.guild.members.fetch(reaction.message.author.id);
  } catch {
    return;
  }

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
// LOGIN BOT
// ------------------------
client.login(process.env.TOKEN);
