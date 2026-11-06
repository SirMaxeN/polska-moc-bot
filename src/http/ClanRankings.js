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
  const opponents=Math.max(0,rows.length-1);
  // Players without a complete profile are ranked by power only; everyone else's few power-only pairs are those games.
  const powerOnly=rows.filter(p=>p.simulated===0&&p.byPower>0);
  const medal=['🥇','🥈','🥉'];
  const lines=rows.map((p,i)=>{
   const share=opponents?Math.round(p.points/opponents*100):0;
   const wins=`${WarReport.number(p.points,1)}/${opponents}`;
   const place=`${i+1}.${medal[i]?' '+medal[i]:''}`;
   return powerOnly.includes(p)
    ?`${place} ${WarReport.clean(p.name)} · ${WarReport.power(p.power)} · ⚖️ ok. ${wins} (tylko wg mocy)`
    :`${place} **${WarReport.clean(p.name)}** · ${WarReport.power(p.power)} · wygrane **${wins}** (${share}%)`;
  });
  const pairs=rows.length*(rows.length-1)/2;
  const simulated=rows.reduce((n,p)=>n+p.simulated,0)/2;
  const method=[
   `⚔️ **Każdy z każdym:** każdy gracz stoczył symulowaną walkę z każdym z pozostałych ${opponents} (bez bonusów wojennych).`,
   `**Wygrane X/${opponents}** = ile z tych walk wygrywa według modelu (remis liczy się jako ½). Wyżej = mocniejszy w bezpośrednim starciu.`,
   'Moc z gry jest tylko informacyjna — kolejność wynika z walk, nie z mocy. To szacunek eksperymentalnego modelu.',
   powerOnly.length?`⚖️ Bez pełnego profilu (oceniani tylko wg mocy): ${powerOnly.map(p=>WarReport.clean(p.name)).join(', ')}.`:'',
  ].filter(Boolean).join('\n');
  // Every player is listed; lines are packed into embeds within Discord's 4096/6000 character limits.
  const header=`${method}\n**${rows.length} graczy** · ${simulated}/${pairs} walk z symulacji · <t:${Math.floor(saved.observed_at/1000)}:R>\n\n`;
  const embeds=[];let current=header,total=0;
  for(const line of lines) {
   if(current.length+line.length+1>4000){embeds.push(current);total+=current.length;current='';}
   current+=(current&&!current.endsWith('\n\n')?'\n':'')+line;
  }
  embeds.push(current);
  return {allowed_mentions,
   embeds:embeds.map((description,i)=>({...(i===0?{title:`🏆 Ranking klanu · ${WarReport.plain(clan)}`}:{}),color:0x61d6ac,description}))};
 }
}
