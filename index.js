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

const loadJSON = path => fs.existsSync(path) ? JSON.parse(fs.readFileSync(path)) : {};
const saveJSON = (path, data) => fs.writeFileSync(path, JSON.stringify(data, null, 2));

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
    .setDescription("Setup Auto VB system")
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
client.once(Events.ClientReady, () => {
  console.log(`🟢 ASTRO online as ${client.user.tag}`);
});

// ========================
// INTERACTIONS
// ========================
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.user.id !== interaction.guild.ownerId) {
    return interaction.reply({ content: "❌ Owner only", flags: 64 });
  }

  // --------------------
  // VERIFIER
  // --------------------
  if (interaction.commandName === "verifier") {
    const sub = interaction.options.getSubcommand();
    const verifierData = loadJSON(VERIFIER_CONFIG);

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

      await interaction.reply({ content: "Setup verifier:", components: menus, flags: 64 });

      const temp = {};
      const collector = interaction.channel.createMessageComponentCollector({ time: 120000 });

      collector.on("collect", async i => {
        if (i.user.id !== interaction.user.id) return i.reply({ content: "❌ Not for you", flags: 64 });

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
          await interaction.followUp({ content: "✅ Verifier saved", flags: 64 });
          collector.stop();
        }
      });
    }

    // SCAN OLD
    if (sub === "scan-old") {
      const cfg = verifierData[interaction.guild.id];
      if (!cfg) return interaction.reply({ content: "❌ Not set up", flags: 64 });

      const main = await client.channels.fetch(cfg.mainChannel);
      const backup = await client.channels.fetch(cfg.backupChannel);

      await interaction.reply({ content: "🔄 Scanning...", flags: 64 });

      const msgs = await main.messages.fetch({ limit: 100 });
      let count = 0;
      for (const m of msgs.values()) {
        if (m.author.bot) continue;
        await backup.send(`📌 ${m.author}: ${m.content}`);
        count++;
      }

      await interaction.followUp({ content: `✅ ${count} messages scanned`, flags: 64 });
    }
  }

  // --------------------
  // AUTO VB SETUP
  // --------------------
  if (interaction.commandName === "autovb") {
    const pad = t => t.length >= 10 ? t : t + " ".repeat(10 - t.length);

    const channels = interaction.guild.channels.cache
      .filter(c => c.isTextBased())
      .map(c => ({ label: pad(c.name), value: c.id }));

    const roles = interaction.guild.roles.cache
      .filter(r => r.id !== interaction.guild.id)
      .map(r => ({ label: pad(r.name), value: r.id }));

    const members = interaction.guild.members.cache
      .map(m => ({ label: pad(m.user.username), value: m.id }))
      .slice(0, 25);

    const detectMenu = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("vb_detect")
        .setPlaceholder("Channels to detect VB")
        .setMinValues(1)
        .setMaxValues(Math.min(5, channels.length))
        .addOptions(channels)
    );

    await interaction.reply({ content: "Select channels for VB detection:", components: [detectMenu], flags: 64 });

    const temp = {};
    const collector = interaction.channel.createMessageComponentCollector({ time: 120000 });

    collector.on("collect", async i => {
      if (i.user.id !== interaction.user.id) return;

      // STEP 1: Channels
      if (i.customId === "vb_detect") {
        temp.detect = i.values;

        const popupMenu = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("vb_popup")
            .setPlaceholder("Popup channel")
            .addOptions(channels)
        );

        return i.update({ content: "Select popup channel:", components: [popupMenu] });
      }

      // STEP 2: Popup channel
      if (i.customId === "vb_popup") {
        temp.popup = i.values[0];

        const roleMenu = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("vb_ping_roles")
            .setPlaceholder("Select roles to ping (optional)")
            .setMinValues(0)
            .setMaxValues(Math.min(roles.length, 5))
            .addOptions(roles)
        );

        const userMenu = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("vb_ping_users")
            .setPlaceholder("Select users to ping (optional)")
            .setMinValues(0)
            .setMaxValues(Math.min(members.length, 5))
            .addOptions(members)
        );

        return i.update({ content: "Select roles/users to ping:", components: [roleMenu, userMenu] });
      }

      // STEP 3: Roles
      if (i.customId === "vb_ping_roles") {
        temp.roles = i.values;
        return i.deferUpdate();
      }

      // STEP 4: Users
      if (i.customId === "vb_ping_users") {
        temp.users = i.values;

        const data = loadJSON(VB_CONFIG);
        data[interaction.guild.id] = {
          channels: temp.detect,
          popup: temp.popup,
          pingRoles: temp.roles || [],
          pingUsers: temp.users || [],
          warnings: {}
        };
        saveJSON(VB_CONFIG, data);

        await i.update({ content: "✅ Auto-VB setup complete!", components: [] });
        collector.stop();
      }
    });
  }
});

// ========================
// VERIFICATION REACTION (BOT ONLY)
// ========================
client.on(Events.MessageReactionAdd, async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) await reaction.fetch();
  if (reaction.message.partial) await reaction.message.fetch();

  if (!reaction.message.author.bot) return;
  if (reaction.emoji.name !== "✅") return;

  const cfg = loadJSON(VERIFIER_CONFIG)[reaction.message.guild.id];
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

client.on(Events.MessageCreate, async message => {
  if (!message.guild || message.author.bot || !message.content) return;

  const data = loadJSON(VB_CONFIG);
  const vb = data[message.guild.id];
  if (!vb || !vb.channels.includes(message.channel.id)) return;

  const found = BAD_WORDS.find(w => message.content.toLowerCase().includes(w));
  if (!found) return;

  vb.warnings[message.author.id] = (vb.warnings[message.author.id] || 0) + 1;
  saveJSON(VB_CONFIG, data);

  // Same channel message
  const sameChannelMsg = `<@${message.author.id}> has been detected for using "${found}"\n⚠️ Warnings: ${vb.warnings[message.author.id]}`;
  message.channel.send(sameChannelMsg);

  // Popup embed
  const rolePings = vb.pingRoles.map(r => `<@&${r}>`).join(" ");
  const userPings = vb.pingUsers.map(u => `<@${u}>`).join(" ");
  const allPings = [rolePings, userPings].filter(Boolean).join(" ");

  const embed = new EmbedBuilder()
    .setColor("Red")
    .setTitle(message.author.username)
    .setDescription(`He/She is now on **${vb.warnings[message.author.id]} warnings**\n\n${allPings}`)
    .setFooter({ text: "VB detected!!" });

  const popup = message.guild.channels.cache.get(vb.popup);
  if (popup) popup.send({ embeds: [embed] });
});

// ========================
// LOGIN
// ========================
client.login(process.env.TOKEN);
