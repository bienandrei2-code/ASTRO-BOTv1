require("dotenv").config();
const { Client, GatewayIntentBits, Partials } = require("discord.js");

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

// LOAD SYSTEMS
require("./verifier")(client);
require("./autovb")(client);

client.once("ready", () => {
  console.log(`🟢 Bot online as ${client.user.tag}`);
});

client.login(process.env.TOKEN);
