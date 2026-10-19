import { UserInputError } from '../domain/UserInputError.js';

export class WeeklyPlayerRemoval {
  static pageSize = 25;

  static page(players, requestedPage = 0) {
    return Math.min(requestedPage, Math.max(0, Math.ceil(players.length / this.pageSize) - 1));
  }

  static panel(userId, players, cycle, requestedPage = 0, notice = '') {
    if (!players.length) return { content: `${notice ? `${notice}\n\n` : ''}**🗑️ Gracze w tym tygodniu**\nLista jest pusta.`, components: [] };
    const page = this.page(players, requestedPage);
    const pages = Math.ceil(players.length / this.pageSize);
    const visible = players.slice(page * this.pageSize, (page + 1) * this.pageSize);
    const components = [{ type: 1, components: [{ type: 3, custom_id: `delete:${userId}:remove:${cycle}:${page}`,
      placeholder: 'Zaznacz graczy do usunięcia z tego tygodnia', min_values: 1, max_values: visible.length,
      options: visible.map(player => ({ label: player.name.slice(0, 100) || player.user_id, value: player.user_id,
        description: `Discord ID: ${player.user_id}` })),
    }] }];
    if (pages > 1) components.push({ type: 1, components: [
      { type: 2, style: 2, label: 'Poprzedni gracze', custom_id: `delete:${userId}:page:${cycle}:${Math.max(0, page - 1)}`, disabled: page === 0 },
      { type: 2, style: 2, label: 'Kolejni gracze', custom_id: `delete:${userId}:page:${cycle}:${page + 1}`, disabled: page === pages - 1 },
    ] });
    return { content: `${notice ? `${notice}\n\n` : ''}**🗑️ Gracze w tym tygodniu**\nZapisanych graczy: **${players.length}**. Lista **${page + 1}/${pages}**.\nZaznaczenie usuwa wybrane osoby z raportów tego tygodnia. Ich zapisane koszty pozostają. Gracz może wrócić przez /update.`, components };
  }

  static validateSelection(players, page, values) {
    const allowed = new Set(players.slice(page * this.pageSize, (page + 1) * this.pageSize).map(player => player.user_id));
    if (!Array.isArray(values) || !values.length || values.length > this.pageSize || new Set(values).size !== values.length || values.some(id => !allowed.has(id))) {
      throw new UserInputError('Lista graczy zmieniła się. Otwórz /delete ponownie i wybierz aktualne osoby.');
    }
  }
}
