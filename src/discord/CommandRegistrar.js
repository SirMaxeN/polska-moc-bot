export class CommandRegistrar {
  static definitions() {
    const sub = (name, description, options) => ({ type: 1, name, description, ...(options ? { options } : {}) });
    const command = (name, description, options, admin = false) => ({ name, description, type: 1, contexts: [0], integration_types: [0],
      ...(admin ? { default_member_permissions: null, description: `${description} (admin only)` } : {}), options });
    return [
      command('hello', 'Introduce the bot publicly with its banner', [], true),
      command('ping', 'Open your private war orders menu', []),
      command('setup', 'Configure reminders, ping access and recipients', [], true),
      command('costs', 'Edit your skill and mount summon costs', []),
      command('mobile', 'Connect or disconnect the Android resource scanner', [sub('pair', 'Generate a private one-time phone pairing code'), sub('revoke', 'Disconnect your phone from this server')]),
      command('delete', 'Remove selected players from this week', [], true),
      command('start', 'Open the player menu', []),
      command('import', 'Import your complete resources and costs from the scanner', [{ type: 3, name: 'dane', description: 'Paste the complete JSON payload copied by Botysław Skaner', required: true, max_length: 1024 }]),
      command('update', 'Open your private resource form', []),
      command('help', 'Learn how to update resources and view reports', []),
      command('report', 'View a private potential report', [sub('player', 'Your six-day potential'), sub('clan', 'Clan daily totals'), sub('clan-details', 'Every player and daily clan totals'), sub('clan-ultra', 'Every player with daily points broken down by action'), sub('resources', 'Saved resources of every clan member and clan totals'), sub('selected', 'Choose players and a war day to see their points and sum'), sub('updated', 'Players who entered or updated resources today'), sub('missing', 'Missing weekly entries and daily updates'), sub('clan-ranking', 'Rank clan members by round-robin battles'), sub('war-list', 'Official Sunday war list (Sunday only)'), sub('war-list-preview', 'Preview war list with equal tech (this week)')]),
      command('copy', 'Copy data for the in-game chat', [sub('war-list', 'Short war list split into chat-sized messages')]),
      command('tech', 'View or manage clan technology', [sub('show', 'Show all clan bonuses'), sub('update', 'Update technology (administrator)'), sub('reset', 'Clear technology (administrator)')]),
      command('season', 'Manage clan seasons', [sub('reset', 'Reset resources, costs and technology (admin only)', [{ type: 3, name: 'confirmation', description: 'Type BYEBYESEASON to confirm', required: true, max_length: 32 }])], true),
    ];
  }

  async register(applicationId, token, guildId) {
    if (!/^\d+$/.test(applicationId ?? '') || !token) throw new Error('Set DISCORD_APPLICATION_ID and DISCORD_BOT_TOKEN.');
    if (guildId && !/^\d+$/.test(guildId)) throw new Error('Invalid DISCORD_GUILD_ID.');
    const scope = guildId ? `guilds/${guildId}/` : '';
    const result = await fetch(`https://discord.com/api/v10/applications/${applicationId}/${scope}commands`, {
      method: 'PUT', headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(CommandRegistrar.definitions()),
      signal: AbortSignal.timeout(15000),
    });
    if (!result.ok) throw new Error(`Discord command registration failed (HTTP ${result.status}).`);
    return (await result.json()).length;
  }
}
