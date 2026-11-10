import { NumberParser } from '../domain/NumberParser.js';
import { UserInputError } from '../domain/UserInputError.js';
import { ReportService } from './ReportService.js';
import { Navigation } from './Navigation.js';
import { randomUUID } from 'node:crypto';

export class ResourceForm {
  static fields = [
    ['skill_tickets', '🎟️ Bilety umiejętności'],
    ['mount_keys', '🔑 Klucze wierzchowców'],
    ['mounts', '🐎 Wierzchowce (bez 1 bazowego)'],
    ['hammers', '🔨 Młotki'],
    ['pets', '🥚 Zwierzaki lub jajka (bez 3 bazowych)'],
  ];

  /** Extra resources shown with the clan resources and excluded from points. */
  static extras = [
    ['green_vials', '🧪 Zielone fiolki (badania klanu)'],
    ['gems', '💎 Diamenty'],
    ['red_vials', '⚗️ Czerwone fiolki'],
    ['shells', '🥚 Skorupki'],
    ['coins', '🪙 Monety'],
  ];

  static openExtras(userId, player) {
    return { type: 9, data: { custom_id: `resources:${userId}:save-extra:${randomUUID()}`, title: '🧪 Dodatkowe informacje',
      components: this.extras.map(([key, label], index) => ({ type: 18, label,
        ...(index === 0 ? { description: 'Nie wpływają na punkty. Diamenty i zielone fiolki liczą się do darowizn w wyścigu klanu.' } : {}),
        component: { type: 4, custom_id: key, style: 1, required: false, max_length: 128, ...(player?.[key] != null ? { value: String(player[key]) } : {}) },
      })),
    } };
  }

  // Accept submissions of combined modals opened before the update.
  static legacyGroups = {
    equipment: [['mounts','Wierzchowce'],['pets','Zwierzaki']],
    extra: [['green_vials','Zielone fiolki'],['gems','Diamenty'],['red_vials','Czerwone fiolki'],['shells','Skorupki'],['coins','Monety']],
  };

  static open(userId, player) {
    const fields=this.fields.map(([key,label],index)=>({
      type:18,label,
      ...(index===0?{description:'Możesz liczyć, np. 3+5*3=18. Wpisz samo działanie. Puste pole zachowuje wartość.'}:{}),
      component:{type:4,custom_id:key,style:1,required:false,max_length:128,...(player?.[key]!=null?{value:String(player[key])}:{})},
    }));
    return {type:9,data:{custom_id:`resources:${userId}:save:${randomUUID()}`,title:'✏️ Aktualizuj swoje zasoby',components:fields}};
  }

  static costs(userId, player) {
    return { type: 9, data: { custom_id: `resources:${userId}:save-costs:${randomUUID()}`, title: '⚙️ Koszty przywołań',
      components: [
        ['skill_cost_x5', '🎟️ Koszt 5 umiejętności', 200],
        ['mount_cost', '🔑 Koszt 1 wierzchowca', 50],
      ].map(([key, label, fallback], index) => ({ type: 18, label,
        ...(index === 0 ? { description: 'Możesz obliczać: + - * / i nawiasy, np. 200-3*4=188. Wpisz samo działanie.' } : {}), component: {
        type: 4, custom_id: key, style: 1, required: false, max_length: 128,
        value: String(player?.[key] ?? fallback),
      } })),
    } };
  }

  static buttons(userId) {
    return [...Navigation.update(userId), ...Navigation.reports(userId)];
  }

  static panel(userId, player, reports) {
    return { content: '**✏️ Aktualizuj swoje zasoby**\n'
      + `${ReportService.emojis.skill_tickets} Bilety · ${ReportService.emojis.mount_keys} Klucze · ${ReportService.emojis.hammers} Młotki · ${ReportService.emojis.pets} Zwierzaki lub jajka\n`
      + '-# *Format zasobów: 9550 = 9,55 = 9.55 = 9,55k = 9.55k. Koszty wpisuj jako pełne liczby.*\n'
      + '-# *Puste pole zachowuje dane; 0 zeruje zasób.*\n\n'
      + '-# W każdym polu możesz liczyć: `3+5*3` = 18, `(3+5)*5-2` = 38. Wpisz samo działanie, bez znaku =.\n\n'
      + (player ? reports.resources(player) : 'Nie masz jeszcze zapisanych danych. Domyślne koszty: 200 biletów za 5 umiejętności i 50 kluczy za 1 wierzchowca.'),
      components: this.buttons(userId) };
  }

  static parse(components, { legacyCombined = false } = {}) {
    const values = {};
    const seen=new Set();
    const parseValue=(key,value)=>{
      if(seen.has(key))throw new UserInputError('Powtórzone pole zasobu.');
      seen.add(key);
      if(String(value??'').trim()==='')return;
      const isCost=['skill_cost_x5','mount_cost'].includes(key);
      values[key]=NumberParser.integer(value,{positive:isCost,implicitThousands:!isCost});
    };
    for (const field of components.flatMap(row => row.component ? [row.component] : row.components ?? [])) {
      if(legacyCombined&&Object.hasOwn(this.legacyGroups,field.custom_id)){
        const keys=new Map(this.legacyGroups[field.custom_id].map(([key,name])=>[name.toLocaleLowerCase('pl'),key]));
        for(const line of String(field.value??'').split(/\r?\n/).filter(line=>line.trim())){
          const [,label,value]=line.match(/^([^:]+):(.*)$/)??[];
          const key=label&&keys.get(label.trim().toLocaleLowerCase('pl'));
          if(!key)throw new UserInputError('Zostaw nazwę zasobu i wpisz ilość po dwukropku.');
          parseValue(key,value);
        }
        continue;
      }
      if (![...this.fields, ...this.extras].some(([key]) => key === field.custom_id) && !['skill_cost_x5', 'mount_cost'].includes(field.custom_id)) throw new UserInputError('Nieznane pole aktualizacji.');
      parseValue(field.custom_id,field.value);
    }
    return values;
  }
}
