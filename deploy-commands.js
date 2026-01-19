require("dotenv").config();
const { REST, Routes, SlashCommandBuilder } = require("discord.js");

// Replace these with your bot and server IDs
const CLIENT_ID = "1460924904450035764";   // Bot client ID
const GUILD_ID = "1457264127939579988";   // Server ID

// ------------------------
// DEFINE COMMANDS
// ------------------------
const commands = [
  new SlashCommandBuilder()
    .setName("verifier")
    .setDescription("Setup or manage the verification system")
    .addSubcommand(sub => 
      sub.setName("set")
         .setDescription("Setup verifier channels and roles"))
    .addSubcommand(sub => 
      sub.setName("scan-old")
         .setDescription("Scan old messages and post in backup channel"))
].map(cmd => cmd.toJSON());

// ------------------------
// REGISTER COMMANDS
// ------------------------
const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
  try {
    console.log("🔄 Registering slash commands...");

    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), // Guild command (instant)
      { body: commands }
    );

    console.log("✅ Slash commands registered successfully!");
  } catch (err) {
    console.error("❌ Error registering commands:", err);
  }
})();
