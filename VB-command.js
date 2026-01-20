const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("auto-vb")
    .setDescription("Setup auto verbal abuse detector"),

  async execute(interaction) {
    // OWNER ONLY
    if (interaction.user.id !== interaction.guild.ownerId) {
      return interaction.reply({
        content: "❌ Only the server owner can use this.",
        ephemeral: true
      });
    }

    await interaction.reply({
      content: "🛡️ Auto Verbal Abuse system setup started.\n(Next steps coming next phase)",
      ephemeral: true
    });
  }
};
