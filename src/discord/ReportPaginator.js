export class ReportPaginator {
  static cards(intro, groups) {
    const pages = [[intro]];
    let used = this.size(intro, '');
    let index = 0;
    for (const group of groups) {
      for (const field of group.fields) {
        const card = { fields: [field], color: index++ % 2 ? 0xb94b33 : 0xc72c3b };
        const size = this.size(card, '');
        if (pages.at(-1).length === 10 || used + size > 5950) {
          pages.push([]);
          card.title = `${intro.title} (ciąg dalszy)`;
          used = card.title.length;
        }
        pages.at(-1).push(card);
        used += size;
      }
    }
    return pages;
  }
  static size(embed, footer = 'Europe/Warsaw') {
    return (embed.title?.length ?? 0) + (embed.description?.length ?? 0) + footer.length
      + embed.fields.reduce((sum, field) => sum + field.name.length + field.value.length, 0);
  }

  static fits(embed, footer) {
    return (embed.title?.length ?? 0) <= 256 && (embed.description?.length ?? 0) <= 4096
      && embed.fields.length <= 25 && embed.fields.every(field => field.name.length <= 256 && field.value.length <= 1024)
      && this.size(embed, footer) <= 6000;
  }

  static pack(template, groups, firstCard = null) {
    const fits = (embed, footer) => this.fits(embed, footer) && (!firstCard ||
      this.size(embed, footer) + this.size(firstCard, '') <= 6000);
    const complete = { ...template, fields: groups.flatMap(group => group.fields) };
    if (fits(complete)) return [complete];
    const pages = [];
    for (const group of groups) {
      let current;
      let continuation = false;
      const start = () => ({ ...template,
        title: `${template.title}${Number.isInteger(group.day) ? `: dzień ${group.day}` : ''}${continuation ? ' (ciąg dalszy)' : ''}`, fields: [],
      });
      current = start();
      for (const field of group.fields) {
        const first = () => group.label ? field : ({ ...field, name: group.header + (continuation ? ' (ciąg dalszy)' : '') });
        let next = current.fields.length ? field : first();
        // Reserve the longest realistic multipart footer before the page count is known.
        if (!fits({ ...current, fields: [...current.fields, next] }, 'Część 999999/999999 · Europe/Warsaw')) {
          if (!current.fields.length) throw new Error('Report field exceeds Discord message limits.');
          pages.push(current);
          continuation = true;
          current = start();
          // Keep summary/rate labels if they happen to begin a continuation part.
          next = group.label ? field : { ...field, name: group.header + ' (ciąg dalszy)', value:
            field.name !== '\u200b' && field.name !== group.header ? `**${field.name}**\n${field.value}` : field.value };
        }
        current.fields.push(next);
      }
      if (current.fields.length) pages.push(current);
    }
    return pages;
  }
}
