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
// CONFIG FILES (AUTO-CREATED)
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
    .addSubcommand(s => s.setName("set").setDescription("Setup verifier")),
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
client.once("clientReady", () => {
  console.log(`🟢 ASTRO online as ${client.user.tag}`);
});

// ========================
// INTERACTIONS
// ========================
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.user.id !== interaction.guild.ownerId)
    return interaction.reply({ content: "❌ Owner only", ephemeral: true });

  // ========================
  // VERIFIER SETUP
  // ========================
  if (interaction.commandName === "verifier") {
    const channels = interaction.guild.channels.cache
      .filter(c => c.isTextBased())
      .map(c => ({ label: c.name, value: c.id }));

    const roles = interaction.guild.roles.cache.map(r => ({
      label: r.name,
      value: r.id
    }));

    await interaction.reply({
      content: "Setup verification system:",
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("v_channel")
            .setPlaceholder("Verification channel")
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(channels)
        ),
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("v_role")
            .setPlaceholder("Role to give")
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(roles)
        )
      ],
      ephemeral: true
    });

    const temp = {};
    const collector = interaction.channel.createMessageComponentCollector({ time: 60000 });

    collector.on("collect", async i => {
      if (i.user.id !== interaction.user.id) return;
      temp[i.customId] = i.values[0];
      await i.deferUpdate();

      if (temp.v_channel && temp.v_role) {
        const data = loadJSON(VERIFIER_CONFIG);
        data[interaction.guild.id] = temp;
        saveJSON(VERIFIER_CONFIG, data);
        await interaction.followUp({ content: "✅ Verifier saved", ephemeral: true });
        collector.stop();
      }
    });
  }

  // ========================
  // AUTO VB SETUP
  // ========================
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
            .setMaxValues(5)
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
                .setMinValues(1)
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
  await member.roles.add(cfg.v_role).catch(() => {});
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

  await message.channel.send(
    `${message.author} detected using **${found}**\n⚠️ Warnings: **${vb.warnings[message.author.id]}**`
  );

  const pings = vb.roles.map(r => `<@&${r}>`).join(" ");
  const embed = new EmbedBuilder()
    .setColor("Red")
    .setTitle(message.author.username)
    .setDescription(`Warnings: **${vb.warnings[message.author.id]}**\n${pings}`)
    .setFooter({ text: "VB detected!" });

  const popup = message.guild.channels.cache.get(vb.popup);
  if (popup) popup.send({ embeds: [embed] });
});

// ========================
// LOGIN
// ========================
client.login(process.env.TOKEN);
