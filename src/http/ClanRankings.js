import { WarReport } from '../discord/WarReport.js';
import { clanRanking } from '../domain/ClanRanking.js';
import { validateRoster } from '../domain/WarPreparation.js';

export class ClanRankings {
 constructor(database,clock) {
  this.db=database.db;
  this.clock=clock;
  this.db.exec('CREATE TABLE IF NOT EXISTS clan_rankings(guild_id TEXT PRIMARY KEY,observed_at INTEGER NOT NULL,request_id TEXT NOT NULL,payload TEXT NOT NULL)');
 }
 save(device,body) {
  const observed=Date.parse(body?.observed_at),now=this.clock();
  if(!/^[a-f0-9-]{36}$/i.test(body?.request_id??'')||!Number.isFinite(observed)||Math.abs(observed-now)>30*60000||typeof body.clan!=='string'||!body.clan.trim()||body.clan.length>100)throw new Error('Nieprawidłowy skan rankingu klanu.');
  const members=validateRoster(body.members);
  if(members.length!==body.member_count)throw new Error('Skan nie obejmuje wszystkich członków klanu.');
  const rows=clanRanking(body,members,now);
  this.db.prepare('INSERT INTO clan_rankings VALUES(?,?,?,?) ON CONFLICT(guild_id) DO UPDATE SET observed_at=excluded.observed_at,request_id=excluded.request_id,payload=excluded.payload WHERE excluded.observed_at>=clan_rankings.observed_at').run(device.guild_id,observed,body.request_id,JSON.stringify({clan:body.clan,rows}));
  return {status:'saved'};
 }
 report(guildId) {
  const saved=this.db.prepare('SELECT observed_at,payload FROM clan_rankings WHERE guild_id=?').get(guildId);
  const allowed_mentions={parse:[]};
  if(!saved)return {content:'Ranking klanu nie został jeszcze obliczony. Uruchom „Ranking klanu” w aplikacji.',allowed_mentions};
  const {clan,rows}=JSON.parse(saved.payload);
  const lines=rows.map((p,i)=>`${i+1}. ${WarReport.clean(p.name)} · ${WarReport.power(p.power)} · ${WarReport.number(p.points,2)} pkt · ${p.simulated} sym. / ${p.byPower} wg mocy`);
  const pairs=rows.length*(rows.length-1)/2;
  const simulated=rows.reduce((n,p)=>n+p.simulated,0)/2;
  const date=new Date(saved.observed_at).toISOString();
  const method='Każdy walczy z każdym bez bonusów wojennych. Wygrana daje 1 pkt, remis ½ pkt. Brak wyniku zastępuje porównanie mocy.';
  return {content:'📎 Pełny ranking jest w załączniku.',allowed_mentions,
   embeds:[{title:`🏆 Ranking klanu · ${WarReport.clean(clan)}`,color:0x61d6ac,
    description:`${method}\n**${rows.length} graczy** · ${simulated}/${pairs} par z symulacji · <t:${Math.floor(saved.observed_at/1000)}:R>\n\n${lines.slice(0,20).join('\n')}`}],
   files:[{name:'ranking-klanu.txt',data:Buffer.from('\ufeff'+[WarReport.clean(clan),date,method,'',...lines].join('\n')),contentType:'text/plain; charset=utf-8'}]};
 }
}
