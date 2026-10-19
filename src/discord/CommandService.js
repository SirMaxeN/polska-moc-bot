import { NumberParser } from '../domain/NumberParser.js';
import { Technology } from '../domain/Technology.js';
import { UserInputError } from '../domain/UserInputError.js';
import { ResourceForm } from './ResourceForm.js';
import { Navigation } from './Navigation.js';
import { WarOrders } from './WarOrders.js';
import { WeeklyPlayerRemoval } from './WeeklyPlayerRemoval.js';
import { PlayerHelp } from './PlayerHelp.js';
import { ServerSetup } from './ServerSetup.js';
import { ParticipationReminders } from './ParticipationReminders.js';
import { WeeklyReminders } from './WeeklyReminders.js';

export class CommandService {
  constructor(database, reports, scoring) { this.database = database; this.reports = reports; this.scoring = scoring; this.orders = new WarOrders(database); }
  reply(data, type = 4) {
    return { type, data: { ...(typeof data === 'string' ? { content: data } : data),
      ...(type === 4 ? { flags: 64 } : {}), allowed_mentions: { parse: [] } } };
  }
  reportReply(kind, snapshot, userId, now, type = 4, guildId) {
    if (kind !== 'player' && guildId && this.database.participationRoles(guildId).length) {
      return { eagerReport: true, response: { type: 5, data: { flags: 64 } }, complete: async () => {
        let enrollment;
        try { enrollment = await new ParticipationReminders(this.database, WeeklyReminders.tokenFromEnvironment()).enrollment(guildId, snapshot.players); }
        catch { enrollment = { unavailable: true }; }
        return this.reports.render(kind, { ...snapshot, enrollment }, userId, now);
      } };
    }
    const { additionalMessages = [], ...first } = this.reports.render(kind, snapshot, userId, now);
    const response = this.reply(first, type);
    return additionalMessages.length
      ? { response, followUps: additionalMessages.map(message => this.reply(message).data) }
      : response;
  }
  missingReport(interaction, now) {
    return { eagerReport: true, response: { type: 5, data: { flags: 64 } }, complete: async () => {
      const lists = await new ParticipationReminders(this.database, WeeklyReminders.tokenFromEnvironment()).messages(interaction.guild_id, now);
      const messages = lists.length ? lists : [{ content: 'Nie wybrano ról uczestników. Ustaw je przez /setup → Uczestnicy wojny.' }];
      // Keep both sections together instead of showing a follow-up for each list.
      const combined = messages.map(message => message.content).join('\n\n');
      if (combined.length + '**📋 Brakujące aktualizacje**\n'.length <= 2000) {
        messages.splice(0, messages.length, { content: combined });
      }
      const first = { ...messages[0], content: `**📋 Brakujące aktualizacje**\n${messages[0].content}`, components: Navigation.all(interaction.member.user.id), allowed_mentions: { parse: [] } };
      return { ...first, additionalMessages: messages.slice(1) };
    } };
  }
  management(interaction) {
    if ((BigInt(interaction.member?.permissions ?? '0') & 8n) !== 0n) return;
    const roles = this.database.managementRoles(interaction.guild_id);
    if (!roles.some(role => interaction.member?.roles?.includes(role))) throw new UserInputError('Ta opcja jest dostępna tylko dla administratora lub wskazanej roli zarządu.');
  }
  saveResources(interaction, values, now, tech) {
    if (!Object.keys(values).length) throw new UserInputError('Nie zmieniono danych. Wpisz wartość w przynajmniej jednym polu. Puste pola zachowują poprzednie wartości.');
    const user = interaction.member.user;
    const previous = this.database.profile(interaction.guild_id, user.id);
    const prospective = { skill_tickets: 0, mount_keys: 0, hammers: 0, pets: 0, mounts: 0, ...previous, ...values };
    for (const key of ['skill_tickets', 'mount_keys', 'hammers', 'pets', 'mounts']) prospective[key] ??= 0;
    this.scoring.player(prospective, tech);
    const player = this.database.update(interaction.guild_id, user.id, interaction.member.nick ?? user.global_name ?? user.username, values, now);
    return this.reply({ content: `Zapisano dane. Użyj **/report player**, aby zobaczyć swój potencjał.\n\n${this.reports.resources(player)}`,
      components: ResourceForm.buttons(user.id) });
  }
  panel(userId, tech, content = 'Wybierz technologię do aktualizacji.') {
    return { content, components: [{ type: 1, components: [{ type: 3, custom_id: `tech:${userId}:select`, placeholder: 'Wybierz technologię', options:
      Technology.entries.map(([key, label]) => ({ label: `${label}: ${tech[key]}%`, value: key })) }] }] };
  }

  async handle(interaction, now = new Date()) {
    try {
      if (!interaction.guild_id || !interaction.member?.user) throw new UserInputError('Użyj komendy na serwerze Discord.');
      const guildId = interaction.guild_id;
      const user = interaction.member.user;
      const userId = user.id;
      this.database.ensure(guildId, now);
      const snapshot = () => this.database.snapshot(guildId, now);
      if (interaction.type === 2) {
        const { name, options = [] } = interaction.data;
        if (name === 'hello') { this.management(interaction); return { type: 4, data: { flags: 0, allowed_mentions: { parse: [] }, embeds: [{ title: '👋 Cześć, klanie! Jestem BotysławSmith!', description: 'Pomagam ogarnąć zasoby, policzyć potencjał wojenny i przekazać rozkazy. Kliknij **Start** pod tą wiadomością, aby otworzyć swoje prywatne menu. Korzystaj z przycisków poniżej: **Start** do danych i raportów albo **Pomoc** do instrukcji. Nie musisz wpisywać komend! ⚔️', color: 0xc72c3b, image: { url: 'https://komars.eu/discord/botyslaw-smith/banner.png' } }], components: Navigation.welcome() } }; }
        if (name === 'setup') { this.management(interaction); return this.reply(ServerSetup.panel(userId, guildId, this.database, this.orders, now)); }
        if (name === 'ping-setup') { this.management(interaction); return this.reply(this.orders.setup(userId, guildId)); }
        if (name === 'ping-role-setup') { this.management(interaction); return this.reply(this.orders.targetSetup(userId, guildId)); }
        if (name === 'ping') {
          if (options[0]?.name === 'setup') { this.management(interaction); return this.reply(this.orders.setup(userId, guildId)); }
          if (options.length && options[0]?.name !== 'menu') throw new UserInputError('Wybierz /ping albo /ping-setup.');
          this.orders.access(interaction);
          return this.reply(this.orders.menu(userId, guildId));
        }
        if (name === 'costs') return ResourceForm.costs(userId, this.database.profile(guildId, userId));
        if (name === 'delete') {
          this.management(interaction);
          return this.reply(WeeklyPlayerRemoval.panel(userId, snapshot().players, this.database.calendar.cycle(now).id));
        }
        if (name === 'start') return this.reply(Navigation.start(userId));
        if (name === 'help') return this.reply(PlayerHelp.panel(userId));
        if (name === 'update') {
          if (!options.length) return ResourceForm.open(userId, this.database.profile(guildId, userId));
          const values = {};
          const allowed = ['skill_tickets', 'skill_cost_x5', 'mount_keys', 'hammers', 'pets', 'mounts'];
          for (const option of options) {
            if (!allowed.includes(option.name)) throw new UserInputError('Nieznane pole aktualizacji.');
            values[option.name] = NumberParser.integer(option.value, { positive: option.name === 'skill_cost_x5', implicitThousands: option.name !== 'skill_cost_x5' });
          }
          return this.saveResources(interaction, values, now, snapshot().tech);
        }
        const sub = options[0];
        if (name === 'report') {
          if (sub?.name === 'missing') return this.missingReport(interaction, now);
          if (!['player', 'clan', 'clan-details', 'clan-ultra', 'resources'].includes(sub?.name)) throw new UserInputError('Nieznany raport.');
          return this.reportReply(sub.name, snapshot(), userId, now, 4, guildId);
        }
        if (name === 'tech') {
          if (sub?.name === 'show') {
            const tech = snapshot().tech;
            return this.reply(Technology.entries.map(([key, label]) => `${label}: **${tech[key]}%**`).join('\n'));
          }
          this.management(interaction);
          if (sub?.name === 'update') return this.reply(this.panel(userId, snapshot().tech));
          if (sub?.name === 'reset') return this.reply({ content: 'Wyzerować wszystkie bonusy techu?', components: [{ type: 1, components: [
            { type: 2, style: 4, label: 'Wyzeruj cały tech', custom_id: `tech:${userId}:reset` },
            { type: 2, style: 2, label: 'Anuluj', custom_id: `tech:${userId}:cancel` },
          ] }] });
        }
        if (name === 'season' && sub?.name === 'reset') {
          this.management(interaction);
          const confirmation = sub.options?.find(option => option.name === 'confirmation')?.value;
          if (String(confirmation).trim().toUpperCase() !== 'BYEBYESEASON') throw new UserInputError('Potwierdź reset, wpisując BYEBYESEASON.');
          return { eagerReport: true, response: { type: 5, data: { flags: 64 } }, complete: async () => {
            const count = await this.database.seasonReset(guildId, userId, now, interaction.id);
            return this.reply(`Sezon zresetowany. Profile graczy: ${count}. Zasoby i tech: 0. Koszty domyślne: umiejętności x5 200, wierzchowiec 50.`).data;
          } };
        }
      }
      if (interaction.type === 3 || interaction.type === 5) {
        if (interaction.type === 3 && ['welcome:help', 'welcome:start'].includes(interaction.data.custom_id)) {
          return this.handle({ ...interaction, type: 2, data: { name: interaction.data.custom_id.split(':')[1] } }, now);
        }
        const [kind, owner, action, rawPage] = interaction.data.custom_id.split(':');
        if (owner !== userId) throw new UserInputError('Ten panel należy do innego gracza.');
        if (kind === 'setup' && interaction.type === 3) {
          this.management(interaction);
          if (action === 'missing') return this.missingReport(interaction, now);
          if (action === 'participants') return this.reply(ServerSetup.participationPanel(userId, guildId, this.database), 7);
          if (action === 'save-participants') {
            this.database.setParticipationRoles(guildId, interaction.data.values);
            return this.reply(ServerSetup.participationPanel(userId, guildId, this.database, 'Zapisano role uczestników.'), 7);
          }
          if (action === 'management') return this.reply(ServerSetup.managementPanel(userId, guildId, this.database), 7);
          if (action === 'save-management') {
            this.database.setManagementRoles(guildId, interaction.data.values);
            return this.reply(ServerSetup.managementPanel(userId, guildId, this.database, 'Zapisano role zarządu.'), 7);
          }
          if (action === 'preview') {
            return this.reply(ServerSetup.preview());
          }
          if (action === 'home') return this.reply(ServerSetup.panel(userId, guildId, this.database, this.orders, now), 7);
          if (action === 'channel') return this.reply(ServerSetup.channelPanel(userId, guildId, this.database), 7);
          if (action === 'roles' || action === 'target') {
            const panel = action === 'roles' ? this.orders.setup(userId, guildId) : this.orders.targetSetup(userId, guildId);
            return this.reply(panel, 7);
          }
          if (action === 'save-channel') {
            const values = interaction.data.values;
            if (!Array.isArray(values) || values.length > 1) throw new UserInputError('Wybierz jeden kanał.');
            const id = values[0] ?? null;
            const channel = interaction.data.resolved?.channels?.[id];
            if (id !== null && (!channel || channel.id !== id || ![0, 5].includes(channel.type) || (channel.guild_id && channel.guild_id !== guildId))) throw new UserInputError('Wybierz kanał tekstowy tego serwera.');
            this.database.setReminderChannel(guildId, id);
            return this.reply(ServerSetup.channelPanel(userId, guildId, this.database, id ? 'Zapisano kanał przypomnień.' : 'Przypomnienia wyłączone.'), 7);
          }
          throw new UserInputError('Nieznana opcja ustawień.');
        }
        if (kind === 'delete' && interaction.type === 3) {
          this.management(interaction);
          const cycle = rawPage;
          const page = Number(interaction.data.custom_id.split(':')[4]);
          if (!['page', 'remove'].includes(action) || !Number.isSafeInteger(page) || page < 0) throw new UserInputError('Nieprawidłowa lista graczy.');
          if (cycle !== this.database.calendar.cycle(now).id) throw new UserInputError('Lista pochodzi z poprzedniego tygodnia. Otwórz /delete ponownie.');
          let players = snapshot().players;
          let notice = '';
          if (action === 'remove') {
            WeeklyPlayerRemoval.validateSelection(players, page, interaction.data.values);
            const count = this.database.deleteWeeklyPlayers(guildId, interaction.data.values, cycle, now);
            notice = `Usunięto graczy z tego tygodnia: **${count}**.`;
            players = snapshot().players;
          }
          return this.reply(WeeklyPlayerRemoval.panel(userId, players, cycle, page, notice), 7);
        }
        if (kind === 'orders' && interaction.type === 3) {
          if (action === 'target-mode' || action === 'target-role') {
            this.management(interaction);
            const values = interaction.data.values;
            if (!Array.isArray(values) || values.length !== 1) throw new UserInputError('Wybierz dokładnie jedną opcję.');
            const value = values[0];
            if (action === 'target-role') this.database.setPingTarget(guildId, 'role', value);
            else if (value === 'role') return this.reply(this.orders.targetSetup(userId, guildId, true), 7);
            else this.database.setPingTarget(guildId, value);
            return this.reply(this.orders.targetSetup(userId, guildId), 7);
          }
          if (action === 'setup') {
            this.management(interaction);
            this.database.setPingRoles(guildId, interaction.data.values);
            return this.reply(this.orders.setup(userId, guildId), 7);
          }
          return this.orders.publish(interaction, action, now);
        }
        if (kind === 'menu' && interaction.type === 3) {
          const data = ['help', 'start'].includes(action) ? { name: action } : action === 'tech-show' ? { name: 'tech', options: [{ name: 'show' }] } : null;
          if (!data) throw new UserInputError('Nieznana opcja menu.');
          const result = await this.handle({ ...interaction, type: 2, data }, now);
          return this.reply({ content: '', embeds: [], components: Navigation.all(userId), ...result.data, flags: undefined }, 7);
        }
        if (kind === 'resources' && action === 'save-costs' && interaction.type === 5) {
          const values = ResourceForm.parse(interaction.data.components);
          if (Object.keys(values).some(key => !['skill_cost_x5', 'mount_cost'].includes(key))) throw new UserInputError('Nieznane pole kosztu.');
          return this.saveResources(interaction, values, now, snapshot().tech);
        }
        if (kind === 'resources' && interaction.type === 3) {
          if (action === 'costs' || action === 'mount-cost') return ResourceForm.costs(userId, this.database.profile(guildId, userId));
          // Keep old private cost buttons usable after deployment.
          if (action === 'cost') return ResourceForm.costs(userId, this.database.profile(guildId, userId));
          if (action === 'open') return ResourceForm.open(userId, this.database.profile(guildId, userId));
        }
        if (kind === 'resources' && action === 'save' && interaction.type === 5) {
          const values = ResourceForm.parse(interaction.data.components);
          return this.saveResources(interaction, values, now, snapshot().tech);
        }
        if (kind === 'resources' && action === 'save-cost' && interaction.type === 5) {
          const values = ResourceForm.parse(interaction.data.components);
          if (Object.keys(values).length !== 1 || !('skill_cost_x5' in values)) throw new UserInputError('Podaj koszt x5.');
          return this.saveResources(interaction, values, now, snapshot().tech);
        }
        if (['report', 'report-page'].includes(kind) && interaction.type === 3) {
          if (action === 'missing') return this.missingReport(interaction, now);
          const page = Number(rawPage);
          if (!['player', 'clan', 'clan-details', 'clan-ultra', 'resources'].includes(action) || !Number.isSafeInteger(page) || page < 0) throw new UserInputError('Nieprawidłowa strona.');
          return this.reportReply(action, snapshot(), userId, now, 7, guildId);
        }
        if (kind === 'tech') {
          this.management(interaction);
          if (action === 'cancel') return this.reply({ content: 'Anulowano.', components: [] }, 7);
          if (action === 'reset') { this.database.resetTech(guildId); return this.reply({ content: 'Tech wyzerowany.', components: [] }, 7); }
          if (action === 'select' && interaction.type === 3) {
            const key = interaction.data.values?.[0];
            if (!Technology.label(key)) throw new UserInputError('Nieznana technologia.');
            return { type: 9, data: { custom_id: `tech:${userId}:save:${key}`, title: Technology.label(key), components: [{ type: 1, components: [
              { type: 4, custom_id: 'percentage', label: 'Bonus (0–40%, co 4%)', style: 1, value: String(snapshot().tech[key]), required: true, max_length: 8 },
            ] }] } };
          }
          if (action === 'save' && interaction.type === 5) {
            const key = rawPage;
            const input = interaction.data.components.flatMap(row => row.components).find(field => field.custom_id === 'percentage')?.value;
            const value = NumberParser.percentage(input);
            const old = snapshot().tech[key];
            this.database.updateTech(guildId, key, value);
            return this.reply(this.panel(userId, snapshot().tech, `${Technology.label(key)}: ${old}% → ${value}%.`), interaction.message ? 7 : 4);
          }
        }
      }
      throw new UserInputError('Nieznana komenda lub panel.');
    } catch (error) {
      if (error.code?.startsWith('ERR_SQLITE') || error.code?.startsWith('SQLITE')) {
        console.error('Database operation failed:', error.code);
        return this.reply('Nie udało się zapisać danych. Spróbuj ponownie.');
      }
      if (error instanceof UserInputError) return this.reply(error.message);
      console.error('Command failed:', error.code ?? error.name);
      return this.reply('Nie udało się wykonać komendy. Spróbuj ponownie.');
    }
  }
}


