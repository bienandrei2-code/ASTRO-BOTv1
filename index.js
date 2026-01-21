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
  SlashCommandBuilder
} = require("discord.js");

// ========================
// CONFIG FILES
// ========================
const VERIFIER_CONFIG = "./verifierConfig.json";
const VB_CONFIG = "./vbConfig.json";

function loadVerifier() {
  if (!fs.existsSync(VERIFIER_CONFIG)) return {};
  return JSON.parse(fs.readFileSync(VERIFIER_CONFIG));
}
function saveVerifier(data) {
  fs.writeFileSync(VERIFIER_CONFIG, JSON.stringify(data, null, 2));
}

function loadVB() {
  if (!fs.existsSync(VB_CONFIG)) return {};
  return JSON.parse(fs.readFileSync(VB_CONFIG));
}
function saveVB(data) {
  fs.writeFileSync(VB_CONFIG, JSON.stringify(data, null, 2));
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
  partials: [Partials.Message, Partials.Reaction, Partials.Channel]
});

// ========================
// SLASH COMMAND REGISTRATION
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

  // --------------------
  // VERIFIER
  // --------------------
  if (interaction.commandName === "verifier") {
    const sub = interaction.options.getSubcommand();
    const verifierData = loadVerifier();

    // SETUP
    if (sub === "set") {
      const channels = interaction.guild.channels.cache
        .filter(c => c.isTextBased())
        .map(c => ({ label: c.name, value: c.id }));

      const roles = interaction.guild.roles.cache.map(r => ({
        label: r.name,
        value: r.id
      }));

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
        if (i.user.id !== interaction.user.id) {
          return i.reply({ content: "❌ Not for you", ephemeral: true });
        }

        temp[i.customId] = i.values[0];
        await i.deferUpdate();

        if (temp.main && temp.backup && temp.give && temp.remove !== undefined) {
          verifierData[interaction.guild.id] = {
            mainChannel: temp.main,
            backupChannel: temp.backup,
            roleToGive: temp.give,
            roleToRemove: temp.remove === "none" ? null : temp.remove
          };
          saveVerifier(verifierData);
          await interaction.followUp({ content: "✅ Verifier saved", ephemeral: true });
          collector.stop();
        }
      });
    }

    // SCAN OLD
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

  // --------------------
  // AUTO VB SETUP
  // --------------------
  if (interaction.commandName === "autovb") {
    const channels = interaction.guild.channels.cache
      .filter(c => c.isTextBased())
      .map(c => ({ label: c.name, value: c.id }));

    const detectMenu = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("detect")
        .setPlaceholder("Channels to detect")
        .setMinValues(1)
        .setMaxValues(channels.length)
        .addOptions(channels)
    );

    await interaction.reply({
      content: "Select detection channels:",
      components: [detectMenu],
      ephemeral: true
    });

    const temp = {};
    const collector = interaction.channel.createMessageComponentCollector({ time: 60000 });

    collector.on("collect", async i => {
      if (i.user.id !== interaction.user.id) {
        return i.reply({ content: "❌ Not for you", ephemeral: true });
      }

      if (i.customId === "detect") {
        temp.channels = i.values;

        const popupMenu = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("popup")
            .setPlaceholder("Popup channel")
            .addOptions(channels)
        );

        await i.update({ content: "Select popup channel:", components: [popupMenu] });
      }

      if (i.customId === "popup") {
        const allVB = loadVB();
        allVB[interaction.guild.id] = {
          channels: temp.channels,
          popup: i.values[0],
          warnings: {}
        };
        saveVB(allVB);

        await i.deferUpdate();
        await interaction.followUp({ content: "✅ Auto VB enabled", ephemeral: true });
        collector.stop();
      }
    });
  }
});

// ========================
// VERIFICATION REACTION (BOT ONLY)
// ========================
client.on("messageReactionAdd", async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) await reaction.fetch();
  if (reaction.message.partial) await reaction.message.fetch();

  if (!reaction.message.author.bot) return;
  if (reaction.emoji.name !== "✅") return;

  const cfg = loadVerifier()[reaction.message.guild.id];
  if (!cfg) return;

  const member = await reaction.message.guild.members.fetch(reaction.message.author.id);
  if (!member) return;

  if (cfg.roleToRemove) await member.roles.remove(cfg.roleToRemove).catch(() => {});
  await member.roles.add(cfg.roleToGive).catch(() => {});
});

// ========================
// AUTO VB LIVE
// ========================
const BAD_WORDS = ["fuck", "shit", "bitch", "asshole"];

client.on("messageCreate", async message => {
  if (!message.guild || message.author.bot || !message.content) return;

  const allVB = loadVB();
  const vb = allVB[message.guild.id];
  if (!vb) return;
  if (!vb.channels.includes(message.channel.id)) return;

  const found = BAD_WORDS.find(w =>
    message.content.toLowerCase().includes(w)
  );
  if (!found) return;

  vb.warnings[message.author.id] =
    (vb.warnings[message.author.id] || 0) + 1;

  saveVB(allVB);

  const embed = new EmbedBuilder()
    .setColor("Red")
    .setTitle("🚨 VB DETECTED")
    .setDescription(
      `User: ${message.author}\nWord: \`${found}\`\nWarnings: ${vb.warnings[message.author.id]}`
    );

  const popup = message.guild.channels.cache.get(vb.popup);
  if (popup) popup.send({ embeds: [embed] });
});

// ========================
// LOGIN
// ========================
client.login(process.env.TOKEN);
