import { Navigation } from './Navigation.js';
import { DailyReminders } from './DailyReminders.js';
import { WeeklyReminders } from './WeeklyReminders.js';

export class ServerSetup {
  static managementPanel(userId, guildId, database, notice = '') {
    const saved = database.managementRoles(guildId);
    return { content: `${notice ? `${notice}\n\n` : ''}**👑 Dostęp zarządu**\nWybierz role uprawnione do /hello, /setup, /delete, zmian i resetu techu oraz /season reset. Administrator zawsze ma dostęp. Wyczyszczenie wyboru pozostawia dostęp tylko administratorom.\nDostęp do /ping ustawiasz osobno.`,
      embeds: [], components: [{ type: 1, components: [{ type: 6, custom_id: `setup:${userId}:save-management`, min_values: 0, max_values: 10,
        placeholder: 'Role zarządu', ...(saved.length ? { default_values: saved.map(id => ({ id, type: 'role' })) } : {}),
      }] }, this.back(userId)] };
  }
  static participationPanel(userId, guildId, database, notice = '') {
    const saved = database.participationRoles(guildId);
    return { content: `${notice}\n**👥 Uczestnicy wojny**\nWybierz role osób, które powinny wpisywać zasoby. Wystarczy jedna z wybranych ról. Boty są pomijane. Przypomnienia pokażą osoby bez wpisu w tym tygodniu i osobno zapisanych bez aktualizacji od 02:00 czasu polskiego. Wyczyszczenie wyboru wyłącza listy.\nW Discord Developer Portal musi być włączone Server Members Intent.`, embeds: [],
      components: [{ type: 1, components: [{ type: 6, custom_id: `setup:${userId}:save-participants`, min_values: 0, max_values: 10, placeholder: 'Role uczestników', ...(saved.length ? { default_values: saved.map(id => ({ id, type: 'role' })) } : {}) }] }, this.back(userId)] };
  }
  static preview() {
    const days = Array.from({ length: 7 }, (_, i) => DailyReminders.message(`2026-10-${19 + i}`));
    return { content: '**🧪 Podgląd wszystkich przypomnień: tylko dla Ciebie**\nNie wykonano resetu ani wysyłki na kanał. Na końcu pokazujemy przykładowe listy uczestników; nazwy są fikcyjne.',
      embeds: [...[...days, WeeklyReminders.message()].map((message, index) => ({
        title: index === 7 ? '🔄 Reset tygodniowy: poniedziałek 02:00' : `🔔 ${DailyReminders.weekdays[(index + 1) % 7]}: 20:00`,
        description: message.content, color: 0xc72c3b,
      })), { title: '👥 Przykładowe listy pod przypomnieniem', description: '**Dane przykładowe: fikcyjne nazwy**\nWpisani: **8/10 członków**\nW rzeczywistym przypomnieniu pojawią się osoby z wybranych ról.\n\n**🔴 Bez wpisu w tym tygodniu: 2**\n❗ Gracz Alfa\n❗ Gracz Beta\n\n**🕒 Zapisani, ale bez dzisiejszej aktualizacji: 2**\nGracz Gamma\nGracz Delta', color: 0xc72c3b }], components: Navigation.welcome() };
  }
  static back(userId, refresh = false) {
    return { type: 1, components: [{ type: 2, style: 2, label: refresh ? 'Odśwież' : 'Ustawienia serwera', emoji: { name: refresh ? '🔄' : '⚙️' }, custom_id: `setup:${userId}:home` }] };
  }

  static panel(userId, guildId, database, orders, now = new Date()) {
    const channel = database.reminderChannel(guildId);
    const roles = database.pingRoles(guildId);
    const next = database.calendar.cycle(now).end;
    const minutes = Math.max(1, Math.ceil((next - now) / 60000));
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor(minutes % 1440 / 60);
    const remaining = [days ? `${days} dni` : '', hours ? `${hours} godz.` : '', minutes % 60 ? `${minutes % 60} min` : ''].filter(Boolean).join(' ');
    const format = value => new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
    const last = database.lastReminder(guildId);
    return { content: '**⚙️ Ustawienia serwera**\nDostępne dla administratorów i wskazanych ról zarządu.\n\n'
      + `**👑 Role zarządu:** ${database.managementRoles(guildId).length ? database.managementRoles(guildId).map(id => `<@&${id}>`).join(', ') : 'tylko administratorzy'}\n\n`
      + `**👥 Role uczestników:** ${database.participationRoles(guildId).map(id => `<@&${id}>`).join(', ') || 'listy wyłączone'}\n\n`
      + `**🔔 Kanał przypomnień:** ${channel ? `<#${channel}>` : 'wyłączone'}\n`
      + '**Codziennie:** 20:00, czas polski.\n'
      + `**Następne codzienne:** ${channel ? format(DailyReminders.next(now, database.calendar)) : 'wyłączone: wybierz kanał'}\n`
      + `**Ostatnie codzienne:** ${database.lastDailyReminder(guildId) ? format(database.lastDailyReminder(guildId)) : 'jeszcze nie wysłano'}\n`
      + '**Reset tygodniowy:** poniedziałek 02:00, czas polski.\n'
      + `**Następne przypomnienie:** ${channel ? `${format(next)} · za ${remaining}` : 'wyłączone: wybierz kanał'}\n`
      + `**Ostatnia udana wysyłka:** ${last ? format(last) : 'jeszcze nie wysłano'}\n`
      + '-# Czas polski. Odliczanie jest aktualne na moment otwarcia panelu.\n\n'
      + `**🛡️ Dostęp do /ping:** ${roles.length ? roles.map(id => `<@&${id}>`).join(', ') : 'brak uprawnionych ról'}\n`
      + `**📣 Odbiorca pingów:** ${orders.targetLabel(guildId)}`,
    embeds: [], components: [{ type: 1, components: [
      ['channel', 'Kanał przypomnień', '🔔'], ['roles', 'Dostęp do /ping', '🛡️'], ['target', 'Odbiorca pingów', '📣'], ['management', 'Role zarządu', '👑'], ['participants', 'Uczestnicy wojny', '👥'],
    ].map(([action, label, name]) => ({ type: 2, style: 2, label, emoji: { name }, custom_id: `setup:${userId}:${action}` })) },
    { type: 1, components: [...this.back(userId, true).components,
      { type: 2, style: 2, label: 'Brakujące aktualizacje', emoji: { name: '📋' }, custom_id: `setup:${userId}:missing` },
      { type: 2, style: 2, label: 'Podgląd wszystkich przypomnień', emoji: { name: '🧪' }, custom_id: `setup:${userId}:preview` },
    ] }] };
  }

  static channelPanel(userId, guildId, database, notice = '') {
    const channel = database.reminderChannel(guildId);
    return { content: `${notice ? `${notice}\n\n` : ''}**🔔 Kanał automatycznych przypomnień**\n`
      + `Aktualnie: ${channel ? `<#${channel}>` : 'wyłączone'}.\nCodziennie o 20:00 bot przypomni o aktualizacji danych i akcjach danego dnia. Po resecie w poniedziałek o 02:00 poprosi o nowe zasoby. Czas polski. Koszty graczy pozostają.\nWybierz kanał, na którym bot może wyświetlać kanał i wysyłać wiadomości z osadzonymi linkami. Wyczyszczenie wyboru wyłącza wszystkie przypomnienia. Automatyczna wiadomość nie oznacza @everyone ani ról.`,
    embeds: [], components: [{ type: 1, components: [{ type: 8, custom_id: `setup:${userId}:save-channel`,
      channel_types: [0, 5], min_values: 0, max_values: 1, placeholder: 'Wybierz kanał przypomnień',
      ...(channel ? { default_values: [{ id: channel, type: 'channel' }] } : {}),
    }] }, this.back(userId)] };
  }
}
