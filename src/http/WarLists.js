import { WarReport } from '../discord/WarReport.js';
import { planHybridWar,validateSimulation } from '../domain/WarSimulation.js';
import { battleWindow,matchWar,validateRoster } from '../domain/WarPreparation.js';
export class WarLists {
 constructor(database,clock=()=>Date.now()) {this.database=database;this.clock=clock;database.db.exec('CREATE TABLE IF NOT EXISTS war_lists(guild_id TEXT NOT NULL,war_day TEXT NOT NULL,request_id TEXT NOT NULL,author TEXT NOT NULL,created_at TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(guild_id,war_day))');}
 current(device,testMode=false) {const day=testMode?"TEST":battleWindow(new Date(this.clock()));if(!day) throw new Error('Lista wojenna dostępna od niedzieli 01:00 do poniedziałku 01:00 (Polska).');return {day,row:this.database.db.prepare('SELECT * FROM war_lists WHERE guild_id=? AND war_day=?').get(device.guild_id,day)};}
 /** What the app shows before a scan: is the Sunday list already taken, and when was the visible list last saved. */
 status(device) {
  const find=day=>this.database.db.prepare('SELECT war_day,created_at FROM war_lists WHERE guild_id=? AND war_day=?').get(device.guild_id,day);
  const day=battleWindow(new Date(this.clock()))??null;
  const real=day?find(day):null;
  const calendar=this.database.calendar;
  const weekStart=calendar?calendar.boundary(calendar.cycle(new Date(this.clock())).monday).getTime():-Infinity;
  const preview=find('TEST');
  const shown=real??(preview&&Date.parse(preview.created_at)>=weekStart?preview:null);
  return {war_day:day,locked:!!real,reason:real?'Lista na tę wojnę została już utworzona. Nie nadpisujemy jej.':null,list_updated_at:shown?.created_at??null,list_sunday:!!real};
 }
 save(device,body,testMode=false) {
  const {day}=this.current(device,testMode);
  if(testMode)body={...body,war_day:day,enemy_bonus:body?.own_bonus,test_mode:true};
  if(!body || !/^[a-f0-9-]{36}$/i.test(body.request_id??'') || body.war_day!==day || !Number.isFinite(Date.parse(body.observed_at)) || Math.abs(this.clock()-Date.parse(body.observed_at))>30*60000) throw new Error('Nieaktualny skan wojenny.');
  const ours=validateRoster(body.ours),enemies=validateRoster(body.enemies);
  if(ours.length!==body.our_count||enemies.length!==body.enemy_count) throw new Error('Skan nie obejmuje wszystkich członków.');
  const key=x=>x.normalize('NFKC').toLocaleLowerCase('pl').replace(/[^\p{L}\p{N}]/gu,'');
  // Older clients omit clan headers. When supplied, both identities must be present and different.
  if(body.own_clan!=null||body.enemy_clan!=null) {
   if(![body.own_clan,body.enemy_clan].every(x=>typeof x==='string'&&x.length<=100&&key(x).length>=2))throw new Error('Brak nazw obu klanów.');
   if(key(body.own_clan)===key(body.enemy_clan))throw new Error('Zeskanowano ten sam klan dwa razy. Otwórz klan przeciwników.');
  }
  const signature=list=>JSON.stringify(list.map(p=>[key(p.name),p.power]).sort((a,b)=>a[0].localeCompare(b[0])||a[1]-b[1]));
  if(signature(ours)===signature(enemies))throw new Error('Listy członków są identyczne. Zeskanuj klan przeciwników.');
  const boost=x=>{if(!x||![x.damage,x.health].every(v=>Number.isFinite(v)&&v>=0&&v<=100000))throw new Error('Brak bonusów wojennych.');return Math.sqrt((1+x.damage/100)*(1+x.health/100));};
  const ownBoost=boost(body.own_bonus),enemyBoost=boost(body.enemy_bonus);
  const plan=body.simulation?planHybridWar(validateSimulation(body,ours,enemies,this.clock(),{allowUnknown:true}),ours,enemies,body.own_bonus,body.enemy_bonus):matchWar(ours,enemies,ownBoost,enemyBoost);
  return this.database.transaction(()=>{
   const old=this.database.db.prepare('SELECT * FROM war_lists WHERE guild_id=? AND war_day=?').get(device.guild_id,day);
   if(old && !testMode) {if(old.request_id===body.request_id)return {status:'saved',war_day:day};throw new Error('Lista na tę wojnę już istnieje. Zapis został zablokowany.');}
   if(testMode)this.database.db.prepare('DELETE FROM war_lists WHERE guild_id=? AND war_day=?').run(device.guild_id,day);
   this.database.db.prepare('INSERT INTO war_lists VALUES(?,?,?,?,?,?)').run(device.guild_id,day,body.request_id,device.user_id,new Date(this.clock()).toISOString(),JSON.stringify({...body,plan}));
   return {status:'saved',war_day:day};
  });
 }
 /** One war list: the locked Sunday list during the war window, otherwise the latest repeatable list with equal bonuses. */
 report(guildId,userId,now,page=0,testMode=false) {
  const find=day=>this.database.db.prepare('SELECT * FROM war_lists WHERE guild_id=? AND war_day=?').get(guildId,day);
  const sunday=testMode?null:battleWindow(new Date(this.clock()));
  const real=sunday?find(sunday):null;
  // The preview list belongs to the current game week and disappears with the Monday 00:00 UTC reset.
  const calendar=this.database.calendar;
  const weekStart=calendar?calendar.boundary(calendar.cycle(new Date(this.clock())).monday).getTime():-Infinity;
  const preview=find('TEST');
  const row=real??(preview&&Date.parse(preview.created_at)>=weekStart?preview:null);
  if(!row)return {content:'Nie utworzono jeszcze listy wojennej. Uruchom „Lista wojenna” w aplikacji.',embeds:[],components:[],attachments:[],allowed_mentions:{parse:[]}};
  return WarReport.render(row,userId,page,!real);
 }
}
