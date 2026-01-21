// ========================
// IMPORTS & ENV
// ========================
const fs = require("fs");
require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  REST,
  Routes,
  SlashCommandBuilder,
  Events
} = require("discord.js");

// ========================
// CONFIG FILES
// ========================
const VERIFIER_CONFIG = "./verifierConfig.json";
const VB_CONFIG = "./vbConfig.json";

function loadJSON(path) {
  if (!fs.existsSync(path)) return {};
  return JSON.parse(fs.readFileSync(path));
}
function saveJSON(path, data) {
  fs.writeFileSync(path, JSON.stringify(data, null, 2));
}

// ========================
// CLIENT
// ========================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Message, Partials.Reaction, Partials.Channel, Partials.User]
});

// ========================
// SLASH COMMANDS
// ========================
const CLIENT_ID = "1460924904450035764";
const GUILD_ID = "1457264127939579988";

const commands = [
  new SlashCommandBuilder()
    .setName("verifier")
    .setDescription("Verification system")
    .addSubcommand(s => s.setName("set").setDescription("Setup verifier"))
    .addSubcommand(s => s.setName("scan-old").setDescription("Scan old messages")),
  new SlashCommandBuilder()
    .setName("autovb")
    .setDescription("Setup Auto Verbal Abuse detector")
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );
  console.log("✅ Slash commands registered");
})();

// ========================
// READY
// ========================
client.once("ready", () => {
  console.log(`🟢 ASTRO online as ${client.user.tag}`);
});

// ========================
// INTERACTIONS
// ========================
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.user.id !== interaction.guild.ownerId) {
    return interaction.reply({ content: "❌ Owner only", ephemeral: true });
  }

  const verifierData = loadJSON(VERIFIER_CONFIG);
  const vbData = loadJSON(VB_CONFIG);

  // -------------------- VERIFIER --------------------
  if (interaction.commandName === "verifier") {
    const sub = interaction.options.getSubcommand();

    // SETUP VERIFIER
    if (sub === "set") {
      const channels = interaction.guild.channels.cache
        .filter(c => c.isTextBased())
        .map(c => ({ label: c.name, value: c.id }));

      const roles = interaction.guild.roles.cache.map(r => ({ label: r.name, value: r.id }));

      const menus = [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("main")
            .setPlaceholder("Main verification channel")
            .addOptions(channels)
        ),
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("backup")
            .setPlaceholder("Backup channel")
            .addOptions(channels)
        ),
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("give")
            .setPlaceholder("Role to give")
            .addOptions(roles)
        ),
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("remove")
            .setPlaceholder("Role to remove")
            .addOptions([{ label: "None", value: "none" }, ...roles])
        )
      ];

      await interaction.reply({
        content: "Setup verifier:",
        components: menus,
        ephemeral: true
      });

      const temp = {};
      const collector = interaction.channel.createMessageComponentCollector({ time: 120000 });

      collector.on("collect", async i => {
        if (i.user.id !== interaction.user.id) return i.reply({ content: "❌ Not for you", ephemeral: true });

        temp[i.customId] = i.values[0];
        await i.deferUpdate();

        if (temp.main && temp.backup && temp.give && temp.remove !== undefined) {
          verifierData[interaction.guild.id] = {
            mainChannel: temp.main,
            backupChannel: temp.backup,
            roleToGive: temp.give,
            roleToRemove: temp.remove === "none" ? null : temp.remove
          };
          saveJSON(VERIFIER_CONFIG, verifierData);
          await interaction.followUp({ content: "✅ Verifier saved", ephemeral: true });
          collector.stop();
        }
      });
    }

    // SCAN OLD MESSAGES
    if (sub === "scan-old") {
      const cfg = verifierData[interaction.guild.id];
      if (!cfg) return interaction.reply({ content: "❌ Not set up", ephemeral: true });

      const main = await client.channels.fetch(cfg.mainChannel);
      const backup = await client.channels.fetch(cfg.backupChannel);

      await interaction.reply({ content: "🔄 Scanning...", ephemeral: true });

      const msgs = await main.messages.fetch({ limit: 100 });
      let count = 0;

      for (const m of msgs.values()) {
        if (m.author.bot) continue;
        await backup.send(`📌 ${m.author}: ${m.content}`);
        count++;
      }

      await interaction.followUp({ content: `✅ ${count} messages scanned`, ephemeral: true });
    }
  }

  // -------------------- AUTO VB --------------------
  if (interaction.commandName === "autovb") {
    const channels = interaction.guild.channels.cache
      .filter(c => c.isTextBased())
      .map(c => ({ label: c.name, value: c.id }));

    const roles = interaction.guild.roles.cache
      .filter(r => r.id !== interaction.guild.id)
      .map(r => ({ label: r.name, value: r.id }));

    const members = interaction.guild.members.cache
      .map(m => ({ label: m.user.username, value: m.id }))
      .slice(0, 25); // Discord select menu limit

    // Step 1: detection channels
    const detectMenu = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("vb_detect")
        .setPlaceholder("Select detection channels")
        .setMinValues(1)
        .setMaxValues(channels.length)
        .addOptions(channels)
    );

    await interaction.reply({ content: "Select channels for VB detection:", components: [detectMenu], ephemeral: true });

    const temp = {};
    const collector = interaction.channel.createMessageComponentCollector({ time: 120000 });

    collector.on("collect", async i => {
      if (i.user.id !== interaction.user.id) return;

      // STEP 1: detection channels
      if (i.customId === "vb_detect") {
        temp.detect = i.values;

        // Step 2: popup channel
        const popupMenu = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("vb_popup")
            .setPlaceholder("Select popup channel")
            .addOptions(channels)
        );
        await i.update({ content: "Select popup channel:", components: [popupMenu] });
      }

      // STEP 2: popup channel
      else if (i.customId === "vb_popup") {
        temp.popup = i.values[0];

        // Step 3: select ping roles
        const roleMenu = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("vb_ping_roles")
            .setPlaceholder("Select roles to ping (optional)")
            .setMinValues(0)
            .setMaxValues(Math.min(roles.length, 10))
            .addOptions(roles)
        );

        // Step 3: select ping users
        const userMenu = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("vb_ping_users")
            .setPlaceholder("Select users to ping (optional)")
            .setMinValues(0)
            .setMaxValues(10)
            .addOptions(members)
        );

        await i.update({ content: "Select roles/users to ping:", components: [roleMenu, userMenu] });
      }

      // STEP 3: ping roles
      else if (i.customId === "vb_ping_roles") {
        temp.pingRoles = i.values || [];
        await i.deferUpdate();
      }

      // STEP 3: ping users
      else if (i.customId === "vb_ping_users") {
        temp.pingUsers = i.values || [];

        vbData[interaction.guild.id] = {
          channels: temp.detect,
          popup: temp.popup,
          pingRoles: temp.pingRoles,
          pingUsers: temp.pingUsers,
          warnings: {}
        };
        saveJSON(VB_CONFIG, vbData);

        await i.update({ content: "✅ Auto VB setup complete!", components: [] });
        collector.stop();
      }
    });
  }
});

// ========================
// VERIFICATION REACTION
// ========================
client.on("messageReactionAdd", async (reaction, user) => {
  if (user.bot) return;

  if (reaction.partial) await reaction.fetch();
  if (reaction.message.partial) await reaction.message.fetch();

  if (reaction.emoji.name !== "✅") return;

  const cfg = loadJSON(VERIFIER_CONFIG)[reaction.message.guild.id];
  if (!cfg) return;

  // optional: only main channel
  if (reaction.message.channel.id !== cfg.mainChannel) return;

  const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
  if (!member) return;

  if (cfg.roleToRemove) await member.roles.remove(cfg.roleToRemove).catch(() => {});
  if (cfg.roleToGive) await member.roles.add(cfg.roleToGive).catch(() => {});
});

// ========================
// AUTO VB LIVE
// ========================
const BAD_WORDS = ["fuck", "shit", "bitch", "asshole"];

client.on("messageCreate", async message => {
  if (!message.guild || message.author.bot || !message.content) return;

  const vbData = loadJSON(VB_CONFIG);
  const vb = vbData[message.guild.id];
  if (!vb) return;
  if (!vb.channels.includes(message.channel.id)) return;

  const found = BAD_WORDS.find(w => message.content.toLowerCase().includes(w));
  if (!found) return;

  vb.warnings[message.author.id] = (vb.warnings[message.author.id] || 0) + 1;
  saveJSON(VB_CONFIG, vbData);

  // Message in same channel
  await message.channel.send(
    `${message.author} has been detected for using **"${found}"**\n⚠️ Warnings: **${vb.warnings[message.author.id]}**`
  );

  // Build ping mentions
  const rolePings = (vb.pingRoles || []).map(id => `<@&${id}>`).join(" ");
  const userPings = (vb.pingUsers || []).map(id => `<@${id}>`).join(" ");
  const allPings = [rolePings, userPings].filter(Boolean).join(" ");

  // Popup embed
  const popup = message.guild.channels.cache.get(vb.popup);
  if (popup) {
    const embed = new EmbedBuilder()
      .setColor("Red")
      .setTitle(message.author.username)
      .setDescription(`He/She is now on **${vb.warnings[message.author.id]} warnings**\n${allPings}`)
      .setFooter({ text: "VB detected!!" });
    popup.send({ embeds: [embed] });
  }
});

// ========================
// LOGIN
// ========================
client.login(process.env.TOKEN);
