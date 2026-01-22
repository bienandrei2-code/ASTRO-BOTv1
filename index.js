// ========================
// IMPORTS & ENV
// =======================
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

function loadJSON(path) {
  if (!fs.existsSync(path)) return {};
  return JSON.parse(fs.readFileSync(path, "utf8"));
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
  if (interaction.user.id !== interaction.guild.ownerId)
    return interaction.reply({ content: "❌ Owner only", ephemeral: true });

  // --------------------
  // VERIFIER
  // --------------------
  if (interaction.commandName === "verifier") {
    const sub = interaction.options.getSubcommand();
    const verifierData = loadJSON(VERIFIER_CONFIG);

    // ---------- SETUP ----------
    if (sub === "set") {
      const channels = interaction.guild.channels.cache
        .filter(c => c.isTextBased())
        .map(c => ({ label: c.name, value: c.id }));

      const roles = interaction.guild.roles.cache
        .filter(r => r.id !== interaction.guild.id)
        .map(r => ({ label: r.name, value: r.id }));

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

      await interaction.reply({ content: "Setup verifier:", components: menus, ephemeral: true });

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

    // ---------- SCAN OLD ----------
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

    const roles = interaction.guild.roles.cache
      .filter(r => r.id !== interaction.guild.id)
      .map(r => ({ label: r.name, value: r.id }))
      .slice(0, 25);

    await interaction.reply({
      content: "Select VB detection channels:",
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("vb_detect")
            .setPlaceholder("Detection channels")
            .setMinValues(1)
            .setMaxValues(Math.min(channels.length, 5))
            .addOptions(channels)
        )
      ],
      ephemeral: true
    });

    const temp = {};
    const collector = interaction.channel.createMessageComponentCollector({ time: 120000 });

    collector.on("collect", async i => {
      if (i.user.id !== interaction.user.id) return;

      if (i.customId === "vb_detect") {
        temp.channels = i.values;
        await i.update({
          content: "Select popup channel:",
          components: [
            new ActionRowBuilder().addComponents(
              new StringSelectMenuBuilder()
                .setCustomId("vb_popup")
                .setPlaceholder("Popup channel")
                .setMinValues(1)
                .setMaxValues(1)
                .addOptions(channels)
            )
          ]
        });
      }

      else if (i.customId === "vb_popup") {
        temp.popup = i.values[0];
        await i.update({
          content: "Select roles to ping:",
          components: [
            new ActionRowBuilder().addComponents(
              new StringSelectMenuBuilder()
                .setCustomId("vb_roles")
                .setPlaceholder("Roles to ping")
                .setMinValues(0)
                .setMaxValues(Math.min(roles.length, 5))
                .addOptions(roles)
            )
          ]
        });
      }

      else if (i.customId === "vb_roles") {
        temp.roles = i.values;
        const data = loadJSON(VB_CONFIG);
        data[interaction.guild.id] = { ...temp, warnings: {} };
        saveJSON(VB_CONFIG, data);
        await i.update({ content: "✅ Auto-VB enabled", components: [] });
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
  if (!reaction.message.author.bot) return;
  if (reaction.emoji.name !== "✅") return;

  const cfg = loadJSON(VERIFIER_CONFIG)[reaction.message.guild.id];
  if (!cfg) return;

  const member = await reaction.message.guild.members.fetch(user.id);
  await member.roles.add(cfg.roleToGive).catch(() => {});
  if (cfg.roleToRemove) await member.roles.remove(cfg.roleToRemove).catch(() => {});

  // Send verification embed
  const totalMembers = reaction.message.guild.memberCount;
  const mainChannel = reaction.message.guild.channels.cache.get(cfg.mainChannel);
  if (!mainChannel) return;

  const embed = new EmbedBuilder()
    .setColor("Green")
    .setTitle("✅ VERIFIED!")
    .setDescription(`${member} was verified by astrospc_x_hyperr and is now a member!`)
    .setFooter({ text: `Welcome to || KILLBØUND SMP ||! We’re now at ${totalMembers}` });

  mainChannel.send({ embeds: [embed] });
});

// ========================
// AUTO VB LIVE
// ========================
const BAD_WORDS = ["fuck", "shit", "bitch", "asshole"];

client.on("messageCreate", async message => {
  if (!message.guild || message.author.bot) return;

  const data = loadJSON(VB_CONFIG);
  const vb = data[message.guild.id];
  if (!vb || !vb.channels.includes(message.channel.id)) return;

  const found = BAD_WORDS.find(w => message.content.toLowerCase().includes(w));
  if (!found) return;

  vb.warnings[message.author.id] = (vb.warnings[message.author.id] || 0) + 1;
  saveJSON(VB_CONFIG, data);

  // Message in same channel
  await message.channel.send(
    `${message.author} detected using **${found}**\n⚠️ Warnings: **${vb.warnings[message.author.id]}**`
  );

  // Popup embed with pings
  const rolePings = vb.roles?.map(r => `<@&${r}>`).join(" ") || "";
  const embed = new EmbedBuilder()
    .setColor("Red")
    .setTitle(message.author.username)
    .setDescription(`He/She is now on **${vb.warnings[message.author.id]} warnings**\n\n${rolePings}`)
    .setFooter({ text: "VB detected!!" });

  const popup = message.guild.channels.cache.get(vb.popup);
  if (popup) popup.send({ embeds: [embed] });
});

// ========================
// LOGIN
// ========================
client.login(process.env.TOKEN);
