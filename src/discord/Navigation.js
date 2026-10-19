export class Navigation {
  static welcome() {
    return [{ type: 1, components: [
      { type: 2, style: 2, label: 'Pomoc', emoji: { name: '❓' }, custom_id: 'welcome:help' },
      { type: 2, style: 1, label: 'Start', emoji: { name: '🏠' }, custom_id: 'welcome:start' },
    ] }];
  }
  static update(userId) {
    return [{ type: 1, components: [{ type: 2, style: 1, label: 'Wpisz / edytuj dane',
      emoji: { name: '✏️' }, custom_id: `resources:${userId}:open` },
      { type: 2, style: 2, label: 'Edytuj koszty', emoji: { name: '🔑' }, custom_id: `resources:${userId}:costs` }] }];
  }

  static all(userId) { return [...this.update(userId), ...this.reports(userId)]; }

  static start(userId) {
    return { content: '**🏠 BotysławSmith: menu gracza**\nWybierz opcję. Ten panel i raporty widzisz tylko Ty.', embeds: [],
      components: [...this.all(userId), { type: 1, components: [
        ['help', 'Pomoc', '❓'], ['tech-show', 'Pokaż tech', '🔬'],
      ].map(([action, label, name]) => ({ type: 2, style: 2, label, emoji: { name }, custom_id: `menu:${userId}:${action}` })) }] };
  }

  static reports(userId) {
    return [{ type: 1, components: [
      ['player', 'Mój raport', '📊'], ['clan', 'Raport klanu', '👥'], ['clan-details', 'Szczegóły klanu', '📋'], ['clan-ultra', 'Ultra szczegóły', '🔎'], ['resources', 'Zasoby klanu', '🎒'],
    ].map(([kind, label, name]) => ({ type: 2, style: 2, label, emoji: { name }, custom_id: `report:${userId}:${kind}:0` })) },
    { type: 1, components: [{ type: 2, style: 2, label: 'Brakujące aktualizacje', emoji: { name: '📋' }, custom_id: `report:${userId}:missing:0` }] }];
  }
}
