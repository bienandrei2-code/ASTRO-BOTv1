require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  Partials,
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  PermissionsBitField,
  EmbedBuilder,
} = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMessages,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// ====== MEMORY CONFIG ======
const verifyConfig = {
  channelId: null,
  addRoles: [],
  removeRoles: [],
};
// ===========================

// REGISTER COMMAND
client.once("clientReady", async () => {
  const command = new SlashCommandBuilder()
    .setName("setup-verify")
    .setDescription("Setup reaction verification system");

  await client.application.commands.create(command);
  console.log("✅ Bot ready");
});

// COMMAND HANDLER
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "setup-verify") {
    if (
      !interaction.member.permissions.has(
        PermissionsBitField.Flags.Administrator
      )
    ) {
      return interaction.reply({
        content: "❌ Admin only",
        ephemeral: true,
      });
    }

    const channelMenu = new ChannelSelectMenuBuilder()
      .setCustomId("verify_channel")
      .setPlaceholder("What channel do you want this to work?")
      .setMaxValues(1);

    const addRolesMenu = new RoleSelectMenuBuilder()
      .setCustomId("verify_add_roles")
      .setPlaceholder("What roles do you wanna ADD?")
      .setMaxValues(5);

    const removeRolesMenu = new RoleSelectMenuBuilder()
      .setCustomId("verify_remove_roles")
      .setPlaceholder("What roles do you wanna REMOVE?")
      .setMaxValues(5);

    await interaction.reply({
      content: "⚙️ Setup verification system",
      components: [
        new ActionRowBuilder().addComponents(channelMenu),
        new ActionRowBuilder().addComponents(addRolesMenu),
        new ActionRowBuilder().addComponents(removeRolesMenu),
      ],
      ephemeral: true,
    });
  }
});

// DROPDOWNS
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isAnySelectMenu()) return;

  if (interaction.customId === "verify_channel") {
    verifyConfig.channelId = interaction.values[0];
  }

  if (interaction.customId === "verify_add_roles") {
    verifyConfig.addRoles = interaction.values;
  }

  if (interaction.customId === "verify_remove_roles") {
    verifyConfig.removeRoles = interaction.values;
  }

  if (
    verifyConfig.channelId &&
    verifyConfig.addRoles.length &&
    verifyConfig.removeRoles.length
  ) {
    const channel = await interaction.guild.channels.fetch(
      verifyConfig.channelId
    );

    const embed = new EmbedBuilder()
      .setTitle("🔐 Verification")
      .setDescription("React with ✅ to get verified")
      .setColor("Blue");

    const msg = await channel.send({ embeds: [embed] });
    await msg.react("✅");

    await interaction.reply({
      content: "✅ Verification system setup!",
      ephemeral: true,
    });
  }
});

// REACTION VERIFY
client.on("messageReactionAdd", async (reaction, user) => {
  if (user.bot) return;
  if (reaction.emoji.name !== "✅") return;

  if (reaction.partial) await reaction.fetch();
  if (reaction.message.partial) await reaction.message.fetch();

  if (reaction.message.channel.id !== verifyConfig.channelId) return;

  const guild = reaction.message.guild;
  const member = await guild.members.fetch(user.id);

  const beforeRoles = member.roles.cache
    .filter((r) => !r.managed)
    .map((r) => r.name)
    .join(", ");

  await member.roles.add(verifyConfig.addRoles);
  await member.roles.remove(verifyConfig.removeRoles);

  const humans = guild.members.cache.filter((m) => !m.user.bot).size;

  const embed = new EmbedBuilder()
    .setTitle("✅ VERIFIED!")
    .setDescription(
      `${user} has been verified by ${reaction.message.author}\n\n**Congrats!!**`
    )
    .addFields({
      name: "Roles Update",
      value: `${beforeRoles} ➜ Verified`,
    })
    .setFooter({
      text: `Welcome to KB SMP! You're our member #${humans}`,
    })
    .setColor("Green");

  await reaction.message.edit({ embeds: [embed] });
});

client.login(process.env.TOKEN);
