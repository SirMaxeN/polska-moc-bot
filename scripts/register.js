import { CommandRegistrar } from '../src/discord/CommandRegistrar.js';

try {
  const count = await new CommandRegistrar().register(process.env.DISCORD_APPLICATION_ID,
    process.env.DISCORD_BOT_TOKEN, process.env.DISCORD_GUILD_ID);
  console.log(`Registered ${count} commands (${process.env.DISCORD_GUILD_ID ? 'server' : 'global'} scope).`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
