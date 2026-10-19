import { UserInputError } from '../domain/UserInputError.js';
import { ServerSetup } from './ServerSetup.js';
import { Navigation } from './Navigation.js';

export class WarOrders {
  static testGuild = '1540254259348512848';
  static testRole = '1540267344209907732';
  static groups = [
    ['🐎 Wierzchowce', [
      ['mount-buy', 'Kupujemy wierzchowce', '🐎', 'Wydajemy klucze na przywoływanie wierzchowców.'],
      ['mount-merge', 'Łączymy wierzchowce', '🔗', 'Łączymy dostępne wierzchowce i zdobywamy punkty wojny.'],
    ]],
    ['🎟️ Umiejętności i kuźnia', [
      ['skill-buy', 'Kupujemy umiejętności', '🎟️', 'Kupujemy bilety umiejętności i przygotowujemy zapas do przywołań.'],
      ['skill-summon', 'Przyzywamy umiejętności', '✨', 'Wydajemy bilety na przywoływanie umiejętności.'],
      ['forge', 'Kujemy wyposażenie', '🔨', 'Wydajemy młotki i kujemy wyposażenie.'],
    ]],
    ['🥚 Zwierzaki, jajka i lochy', [
      ['pets', 'Łączymy zwierzaki lub jajka', '🥚', 'Łączymy zwierzaki lub jajka i zdobywamy punkty wojny. Każde połączenie daje tyle samo punktów, niezależnie od rzadkości.'],
      ['keys', 'Tylko klucze do lochów', '🔑', 'Używamy wyłącznie kluczy do lochów. Pozostałe zasoby zachowujemy.'],
    ]],
    ['📅 Przygotowania na jutro', [
      ['research', 'Badania na jutro', '🔬', 'Planujemy zakończenie badań technologii na jutro, po zmianie dnia o 02:00.'],
      ['eggs', 'Wykluwanie na jutro', '🪺', 'Planujemy zakończenie wykluwania jaj na jutro, po zmianie dnia o 02:00.'],
    ]],
    ['⚔️ Decyzje dowództwa', [
      ['fight', 'Do boju!', '⚔️', 'Ruszamy do walk w wojnie klanów!'],
      ['all-in', 'ALL IN: pełna mobilizacja', '🔥', 'Wydajemy wszystkie zasoby punktujące w dzisiejszym dniu wojny!'],
      ['hold', 'STOP: oszczędzamy zasoby', '🛑', 'Wstrzymujemy wydawanie zasobów. Czekamy na kolejny rozkaz.'],
      ['update', 'Zaktualizuj dane w bocie', '🔔', 'Przypominamy o aktualizacji zasobów w Botysławie! Użyj /update i wpisz aktualne bilety, klucze, młotki, zwierzaki lub jajka do połączenia oraz posiadane wierzchowce bez 1 bazowego. Jeśli zmieniły się koszty przywołań, popraw /costs. Główne menu: /start.'],
    ]],
  ];
  constructor(database) { this.database = database; }
  access(interaction) {
    const roles = this.database.pingRoles(interaction.guild_id);
    if (!roles.some(role => interaction.member.roles?.includes(role))) throw new UserInputError('Nie masz roli uprawnionej do rozkazów. Administrator może ustawić dostęp przez /setup.');
  }
  setup(userId, guildId) {
    const saved = this.database.pingRoles(guildId);
    return { content: '**⚙️ Dostęp do rozkazów wojennych**\nWybierz role, które mogą otwierać menu i wysyłać rozkazy. Wyczyszczenie wyboru blokuje rozkazy.\n-# Odbiorcę rozkazów ustawisz osobno przez /setup.', embeds: [], components: [{ type: 1, components: [{ type: 6, custom_id: `orders:${userId}:setup`, min_values: 0, max_values: 10, placeholder: 'Role uprawnione do /ping', ...(saved.length ? { default_values: saved.map(id => ({ id, type: 'role' })) } : {}) }] }, ServerSetup.back(userId)] };
  }
  target(guildId) {
    return this.database.pingTarget(guildId) ?? (guildId === WarOrders.testGuild ? { kind: 'role', role_id: WarOrders.testRole } : null);
  }
  targetLabel(guildId) {
    const target = this.target(guildId);
    return !target ? 'Nie ustawiono' : target.kind === 'role' ? `<@&${target.role_id}>` : `@${target.kind}`;
  }
  targetSetup(userId, guildId, pickRole = false) {
    const target = this.target(guildId);
    return { content: '**📣 Odbiorca rozkazów wojennych**\nAktualnie: **' + this.targetLabel(guildId) + '**\nWybierz jedną rolę albo oznaczenie zbiorcze. Zmiana dotyczy kolejnych rozkazów, także z już otwartego menu.\n-# @everyone: wszyscy z dostępem do kanału. @here: osoby online z dostępem do kanału. Dla obu bot potrzebuje uprawnienia „Wspominanie @everyone, @here i wszystkich ról”. Wybrana rola musi być oznaczalna lub bot musi mieć to samo uprawnienie.' + (pickRole ? '\n**Wybierz rolę poniżej, aby zapisać odbiorcę.**' : ''), embeds: [], components: [
      { type: 1, components: [{ type: 3, custom_id: `orders:${userId}:target-mode`, placeholder: 'Kogo powiadamiamy?', options: [
        { label: 'Jedna wybrana rola', value: 'role', emoji: { name: '👥' }, default: pickRole || target?.kind === 'role' },
        { label: '@everyone: wszyscy', value: 'everyone', emoji: { name: '📣' }, default: !pickRole && target?.kind === 'everyone' },
        { label: '@here: osoby online', value: 'here', emoji: { name: '🟢' }, default: !pickRole && target?.kind === 'here' },
      ] }] },
      { type: 1, components: [{ type: 6, custom_id: `orders:${userId}:target-role`, placeholder: 'Wybierz dokładnie jedną rolę', min_values: 1, max_values: 1,
        ...(target?.kind === 'role' ? { default_values: [{ id: target.role_id, type: 'role' }] } : {}),
      }] },
      ServerSetup.back(userId),
    ] };
  }
  menu(userId, guildId) {
    return { embeds: [{ title: '⚔️ ROZKAZY WOJENNE', color: 0xc72c3b, description: `Wybierz rozkaz. Wiadomość pojawi się publicznie na tym kanale.\nOdbiorca: **${this.targetLabel(guildId)}**. Ustawienie jest sprawdzane przy wysłaniu.`, fields: WarOrders.groups.map(([name, entries], index) => ({ name: `${index + 1}. ${name}`, value: entries.map(([, label]) => label).join(' · ') })) }], components: WarOrders.groups.map(([, entries]) => ({ type: 1, components: entries.map(([key, label, emoji]) => ({ type: 2, style: key === 'hold' ? 4 : key === 'all-in' ? 3 : 2, label, emoji: { name: emoji }, custom_id: `orders:${userId}:${key}` })) })) };
  }
  publish(interaction, action, now) {
    this.access(interaction);
    const target = this.target(interaction.guild_id);
    if (!target) throw new UserInputError('Administrator musi wybrać odbiorcę przez /setup.');
    if (target.kind !== 'role' && (BigInt(interaction.app_permissions ?? '0') & 131072n) === 0n) throw new UserInputError('Bot nie ma na tym kanale uprawnienia do wspominania @everyone i @here. Nadaj je albo wybierz rolę przez /setup.');
    const order = WarOrders.groups.flatMap(([, entries]) => entries).find(([key]) => key === action);
    if (!order) throw new UserInputError('Nieznany rozkaz.');
    const [, label, emoji, description] = order;
    return { type: 4, data: { flags: 0, content: target.kind === 'role' ? `<@&${target.role_id}>` : `@${target.kind}`, allowed_mentions: target.kind === 'role' ? { parse: [], roles: [target.role_id] } : { parse: ['everyone'] }, embeds: [{ title: `${emoji} ${action === 'update' ? 'PRZYPOMNIENIE' : 'ROZKAZ WOJENNY'}: ${label}`, description, color: action === 'hold' ? 0xed4245 : action === 'all-in' ? 0x57f287 : 0xc72c3b, footer: { text: '⚔️ Rozkazy wojenne' }, timestamp: now.toISOString() }], ...(action === 'update' ? { components: Navigation.welcome() } : {}) } };
  }
}
