import { randomUUID } from 'node:crypto';
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
  return {war_day:day,locked:!!real,reason:real?'Lista na tę wojnę została już utworzona. Nie nadpisujemy jej.':null,list_updated_at:shown?.created_at??null,list_sunday:!!real,can_override:device.manager===true};
 }
 save(device,body,testMode=false) {
  const {day}=this.current(device,testMode);
  // A Sunday preview (management, "Tylko podgląd") keeps the real enemy tech; weekday previews assume ours.
  if(testMode)body={...body,war_day:day,enemy_bonus:body?.real_tech===true?body.enemy_bonus:body?.own_bonus,test_mode:true};
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
   if(old && !testMode) {
    if(old.request_id===body.request_id)return {status:'saved',war_day:day};
    // Only management may replace the Sunday list, and only after confirming in the app.
    if(!(body.overwrite===true&&device.manager===true))throw new Error(device.manager?'Lista na tę wojnę już istnieje. Potwierdź aktualizację w aplikacji.':'Lista na tę wojnę już istnieje. Zapis został zablokowany.');
    this.database.db.prepare('DELETE FROM war_lists WHERE guild_id=? AND war_day=?').run(device.guild_id,day);
    this.database.db.prepare('INSERT INTO war_lists VALUES(?,?,?,?,?,?)').run(device.guild_id,day,body.request_id,device.user_id,new Date(this.clock()).toISOString(),JSON.stringify({...body,plan}));
    return {status:'saved',war_day:day,updated:true};
   }
   if(testMode)this.database.db.prepare('DELETE FROM war_lists WHERE guild_id=? AND war_day=?').run(device.guild_id,day);
   this.database.db.prepare('INSERT INTO war_lists VALUES(?,?,?,?,?,?)').run(device.guild_id,day,body.request_id,device.user_id,new Date(this.clock()).toISOString(),JSON.stringify({...body,plan}));
   return {status:'saved',war_day:day,created:true};
  });
 }
 /** One war list: the locked Sunday list during the war window, otherwise the latest repeatable list with equal bonuses. */
 /** The official Sunday list, only during the war window (it resets with the Monday game reset). */
 /** This game week's war day: today during the Sunday window, otherwise the coming Sunday. */
 officialDay() {
  const now=new Date(this.clock()),sunday=battleWindow(now);
  if(sunday)return sunday;
  const calendar=this.database.calendar;
  return calendar?calendar.shift(calendar.cycle(now).monday,6):null;
 }
 /** The official list of this game week: the Sunday scan, or a preview promoted by management (any day). */
 official(guildId) {
  const day=this.officialDay();
  return day?this.database.db.prepare('SELECT * FROM war_lists WHERE guild_id=? AND war_day=?').get(guildId,day)??null:null;
 }
 /** Management: the current preview becomes this week's official list, on any day. */
 promote(guildId,userId) {
  const preview=this.preview(guildId),day=this.officialDay();
  if(!preview)throw new Error('Brak listy poglądowej do zatwierdzenia.');
  if(!day)throw new Error('Nie ustalono dnia wojny.');
  const payload={...JSON.parse(preview.payload),test_mode:false,war_day:day,promoted:true};
  return this.database.transaction(()=>{
   this.database.db.prepare('DELETE FROM war_lists WHERE guild_id=? AND war_day=?').run(guildId,day);
   const request_id=randomUUID();
   this.database.db.prepare('INSERT INTO war_lists VALUES(?,?,?,?,?,?)').run(guildId,day,request_id,userId,new Date(this.clock()).toISOString(),JSON.stringify(payload));
   return {war_day:day,request_id};
  });
 }
 /** The preview (equal tech) of the current game week; it disappears with the Monday 00:00 UTC reset. */
 preview(guildId) {
  const row=this.database.db.prepare('SELECT * FROM war_lists WHERE guild_id=? AND war_day=?').get(guildId,'TEST');
  const calendar=this.database.calendar;
  const weekStart=calendar?calendar.boundary(calendar.cycle(new Date(this.clock())).monday).getTime():-Infinity;
  return row&&Date.parse(row.created_at)>=weekStart?row:null;
 }
 /**
  * /report war-list shows only the official Sunday list; previews live under /report war-list-preview,
  * so nobody mistakes an equal-tech preview for the real assignments.
  */
 report(guildId,userId,now,page=0,previewMode=false) {
  const empty=content=>({content,embeds:[],components:[],attachments:[],allowed_mentions:{parse:[]}});
  if(previewMode) {
   const row=this.preview(guildId);
   return row?WarReport.render(row,userId,page,true):empty('Brak listy poglądowej w tym tygodniu. Uruchom „Odczyt listy wojennej” w aplikacji przed niedzielą.');
  }
  const row=this.official(guildId);
  if(row)return WarReport.render(row,userId,page,false);
  if(!battleWindow(new Date(this.clock())))return empty('⏳ Lista wojenna pojawi się w niedzielę. Czekaj na niedzielny update listy.');
  return empty('Nie utworzono jeszcze niedzielnej listy wojennej. Uruchom „Odczyt listy wojennej” w aplikacji.');
 }
 /** /copy war-list: only the official list of this week (Sunday scan or a promoted preview). */
 copy(guildId) {
  const official=this.official(guildId);
  return official?{chunks:WarReport.copyChunks(official)}:null;
 }
}
