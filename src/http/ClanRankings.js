import { WarReport } from '../discord/WarReport.js';
import { clanRanking } from '../domain/ClanRanking.js';
import { validateRoster } from '../domain/WarPreparation.js';

const rankIcons={up:'<:rank_up:1569737222750601266>',down:'<:rank_down:1569737223782273024>',same:'<:rank_same:1569737224856277102>',new:'🆕'};
const identity=name=>name.trim().normalize('NFKC').toLocaleLowerCase('pl');
const powerOnly=player=>player.simulated===0&&player.byPower>0;
const winShare=(player,opponents)=>opponents?Math.round(player.points/opponents*100):0;
function signature(payload) {
 const {rows}=JSON.parse(payload);
 return JSON.stringify([rows.map(player=>[
  identity(player.name),WarReport.power(player.power),WarReport.number(player.points,1),
  powerOnly(player)?null:winShare(player,rows.length-1),
 ]),rows.reduce((total,player)=>total+player.simulated,0)]);
}
function sameClan(current,previous) {
 if(identity(current.clan)===identity(previous.clan))return true;
 // The clan heading is OCR text. A strong roster match is more reliable than a misread tag.
 const previousNames=new Set(previous.rows.map(player=>identity(player.name)));
 const overlap=new Set(current.rows.map(player=>identity(player.name)).filter(name=>previousNames.has(name))).size;
 return overlap>=3&&overlap>=.8*Math.max(current.rows.length,previous.rows.length);
}

export class ClanRankings {
 // Scans withdrawn by hand. 2026-11-20 16:17 UTC: war-day profiles with the player's power read as damage
 // (app 1.6.8 header parser) pushed GumowyPrzetyk and others to the top.
 static withdrawn=new Set(['f2b735c9-80d5-4523-9a81-d6a18449254c']);
 constructor(database,clock) {
  this.db=database.db;
  this.database=database;
  this.clock=clock;
  this.db.exec('CREATE TABLE IF NOT EXISTS clan_rankings(guild_id TEXT PRIMARY KEY,observed_at INTEGER NOT NULL,request_id TEXT NOT NULL,payload TEXT NOT NULL)');
  this.db.exec(`CREATE TABLE IF NOT EXISTS clan_ranking_history(guild_id TEXT NOT NULL, observed_at INTEGER NOT NULL, request_id TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(guild_id,request_id));
   INSERT INTO clan_ranking_history SELECT * FROM clan_rankings AS old WHERE NOT EXISTS (SELECT 1 FROM clan_ranking_history WHERE guild_id=old.guild_id);`);
  this.database.transaction(()=>{
   for(const id of ClanRankings.withdrawn) this.db.prepare('DELETE FROM clan_ranking_history WHERE request_id=?').run(id);
   for(const {guild_id} of this.db.prepare('SELECT DISTINCT guild_id FROM clan_ranking_history').all()) this.prune(guild_id);
  });
 }
 prune(guildId) {
  const retained=this.history(guildId).map(scan=>scan.request_id);
  if(retained.length) this.db.prepare(`DELETE FROM clan_ranking_history WHERE guild_id=? AND request_id NOT IN (${retained.map(()=>'?').join(',')})`).run(guildId,...retained);
 }
 history(guildId) {
  const scans=this.db.prepare('SELECT observed_at,request_id,payload FROM clan_ranking_history WHERE guild_id=? ORDER BY observed_at DESC,rowid DESC').all(guildId);
  const seen=new Set();
  return scans.filter(scan=>{
   const key=signature(scan.payload);
   if(seen.has(key))return false;
   seen.add(key);
   return true;
  }).slice(0,3);
 }
 save(device,body) {
  const observed=Date.parse(body?.observed_at),now=this.clock();
  if(!/^[a-f0-9-]{36}$/i.test(body?.request_id??'')||!Number.isFinite(observed)||Math.abs(observed-now)>30*60000||typeof body.clan!=='string'||!body.clan.trim()||body.clan.length>100)throw new Error('Nieprawidłowy skan rankingu klanu.');
  const members=validateRoster(body.members);
  if(members.length!==body.member_count)throw new Error('Skan nie obejmuje wszystkich członków klanu.');
  const rows=clanRanking(body,members,now);
  const payload=JSON.stringify({clan:body.clan.trim(),rows});
  this.database.transaction(()=>{
   const history=this.history(device.guild_id);
   if(ClanRankings.withdrawn.has(body.request_id)||history.some(scan=>scan.request_id===body.request_id)||observed<(history[0]?.observed_at??0))return;
   this.db.prepare('INSERT INTO clan_ranking_history VALUES(?,?,?,?) ON CONFLICT(guild_id,request_id) DO NOTHING').run(device.guild_id,observed,body.request_id,payload);
   this.prune(device.guild_id);
  });
  return {status:'saved'};
 }
 status(guildId) {
  const [saved]=this.history(guildId);
  return {ranking_updated_at:saved?new Date(saved.observed_at).toISOString():null,ranking_members:saved?JSON.parse(saved.payload).rows?.length??0:0};
 }
 report(guildId,userId,page=0,copy=false) {
  const history=this.history(guildId);
  const selected=copy?history.findIndex(scan=>scan.request_id===page):Math.min(page,Math.max(0,history.length-1));
  const saved=history[selected];
  const allowed_mentions={parse:[]};
  if(!saved)return {content:copy?'Ten ranking nie jest już dostępny. Otwórz aktualny ranking.':'Ranking klanu nie został jeszcze obliczony. Uruchom „Ranking klanu” w aplikacji.',allowed_mentions};
  const {clan,rows}=JSON.parse(saved.payload);
  const previous=history.slice(selected+1).map(scan=>JSON.parse(scan.payload)).find(scan=>sameClan({clan,rows},scan));
  const positions=previous?new Map(previous.rows.map((p,i)=>[identity(p.name),i])):null;
  const movement=(player,index)=>{
   if(!positions)return '';
   const prior=positions.get(identity(player.name));
   if(prior===undefined)return `${rankIcons.new} · `;
   const delta=prior-index;
   return `${delta>0?rankIcons.up:delta<0?rankIcons.down:rankIcons.same} ${Math.abs(delta)} · `;
  };
  const opponents=Math.max(0,rows.length-1);
  // Players without a complete profile are ranked by power only; everyone else's few power-only pairs are those games.
  const estimated=rows.filter(powerOnly);
  const medal=['🥇','🥈','🥉'];
  const lines=rows.map((p,i)=>{
   const share=winShare(p,opponents);
   const wins=`${WarReport.number(p.points,1)}/${opponents}`;
   const place=`${movement(p,i)}${i+1}.${medal[i]?' '+medal[i]:''}`;
   return powerOnly(p)
    ?`${place} ${WarReport.clean(p.name)} · ${WarReport.power(p.power)} · ⚖️ ok. ${wins} (tylko wg mocy)`
    :`${place} **${WarReport.clean(p.name)}** · ${WarReport.power(p.power)} · wygrane **${wins}** (${share}%)`;
  });
  if(copy){
   const chunks=[];
   let current=`🏆 Ranking klanu · ${WarReport.plain(clan)} · ${new Date(saved.observed_at).toISOString().slice(0,10)}`;
   for(const raw of lines){
    const line=raw.replaceAll(rankIcons.up,'⬆️').replaceAll(rankIcons.down,'⬇️').replaceAll(rankIcons.same,'〰️').replaceAll('**','');
    if(current.length+line.length+1>1850){chunks.push(current);current='';}
    current+=(current?'\n':'')+line;
   }
   chunks.push(current);
   return {chunks:chunks.map(text=>'```\n'+text+'\n```')};
  }
  const pairs=rows.length*(rows.length-1)/2;
  const simulated=rows.reduce((n,p)=>n+p.simulated,0)/2;
  const method=[
   `⚔️ **Każdy z każdym:** każdy gracz stoczył symulowaną walkę z każdym z pozostałych ${opponents} (bez bonusów wojennych).`,
   `**Wygrane X/${opponents}** = ile z tych walk wygrywa według modelu (remis liczy się jako ½). Wyżej = mocniejszy w bezpośrednim starciu.`,
   'Moc z gry jest tylko informacyjna — kolejność wynika z walk, nie z mocy. To szacunek eksperymentalnego modelu.',
   estimated.length?`⚖️ Bez pełnego profilu (oceniani tylko wg mocy): ${estimated.map(p=>WarReport.clean(p.name)).join(', ')}.`:'',
  ].filter(Boolean).join('\n');
  // Every player is listed; lines are packed into embeds within Discord's 4096/6000 character limits.
  const header=`${method}\n**${selected===0?'Oficjalny ranking':`Archiwum ${selected}/${history.length-1} (starszy)`}** · ${rows.length} graczy · ${simulated}/${pairs} walk z symulacji · <t:${Math.floor(saved.observed_at/1000)}:f>${positions?`\n${rankIcons.up} awans · ${rankIcons.down} spadek · ${rankIcons.same} bez zmian · ${rankIcons.new} nowy w rankingu`:'\nBrak wcześniejszego różnego rankingu tego klanu do porównania.'}\n\n`;
  const embeds=[];let current=header,total=0;
  for(const line of lines) {
   if(current.length+line.length+1>4000){embeds.push(current);total+=current.length;current='';}
   current+=(current&&!current.endsWith('\n\n')?'\n':'')+line;
  }
  embeds.push(current);
  return {allowed_mentions,components:userId?[{type:1,components:[...(history.length>1?[
    {type:2,style:selected>0?1:2,label:selected===1?'◀ Nowszy (oficjalny)':'◀ Nowszy',custom_id:`report:${userId}:clan-ranking:${Math.max(0,selected-1)}`,disabled:selected===0},
    {type:2,style:2,label:'Starszy ▶',custom_id:`report:${userId}:clan-ranking:${Math.min(history.length-1,selected+1)}`,disabled:selected===history.length-1},
   ]:[]),{type:2,style:2,label:'Kopiuj ranking',emoji:{name:'📋'},custom_id:`ranking-copy:${userId}:show:${saved.request_id}`}]}]:[],
   embeds:embeds.map((description,i)=>({...(i===0?{title:`🏆 Ranking klanu · ${WarReport.plain(clan)}`}:{}),color:0x61d6ac,description}))};
 }
}
