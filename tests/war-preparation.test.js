import { Navigation } from '../src/discord/Navigation.js';
import { CommandService } from '../src/discord/CommandService.js';
import { ReportService } from '../src/discord/ReportService.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { battleWindow,matchWar } from '../src/domain/WarPreparation.js';
import { Database } from '../src/storage/Database.js';
import { WarCalendar } from '../src/domain/WarCalendar.js';
import { WarAnnouncement } from '../src/discord/WarAnnouncement.js';
import { WarLists } from '../src/http/WarLists.js';
import { MobileSync } from '../src/http/MobileSync.js';
import { ScoringService } from '../src/domain/ScoringService.js';
import { createServer } from 'node:http';
const reportText=message=>JSON.stringify(message.embeds??[]);
test('fixed Polish window includes Monday before 01 and handles summer separately from resource reset',()=>{
 assert.equal(battleWindow(new Date('2026-11-01T00:00:00Z')),'2026-11-01');
 assert.equal(battleWindow(new Date('2026-10-31T23:59:59Z')),null);
 assert.equal(battleWindow(new Date('2026-11-01T23:59:59Z')),'2026-11-01');
 assert.equal(battleWindow(new Date('2026-11-02T00:00:00Z')),null);
 assert.equal(battleWindow(new Date('2026-07-04T23:00:00Z')),'2026-07-05');
});
test('matching maximizes unique pairs without wasting strongest ally on weakest enemy',()=>{
 const plan=matchWar([{name:'a',power:100},{name:'b',power:60},{name:'c',power:1}],[{name:'x',power:90},{name:'y',power:50},{name:'boss',power:1000}]);
 assert.equal(plan.assignments.find(x=>x.name==='a').main,'x');
 assert.equal(plan.assignments.find(x=>x.name==='b').main,'y');
 assert.match(plan.assignments.find(x=>x.name==='c').note,/przegra/);
 assert.deepEqual(plan.tooStrong,['boss']);
 assert.ok(plan.assignments.every(x=>x.alternatives.length<=3));
});
test('one immutable report per Discord guild and day, idempotent retry and isolation',t=>{
 const db=new Database(':memory:',new WarCalendar());t.after(()=>db.close());
 let now=Date.parse('2026-11-01T12:00:00Z');const lists=new WarLists(db,()=>now);
 const device={guild_id:'guild1',user_id:'member1'};
 const body={request_id:randomUUID(),war_day:'2026-11-01',observed_at:new Date(now).toISOString(),ours:[{name:'a',power:100}],enemies:[{name:'b',power:90}],our_count:1,enemy_count:1,own_bonus:{damage:8700,health:7700},enemy_bonus:{damage:9600,health:8200}};
 assert.equal(lists.status(device).locked,false);
 lists.save(device,body);assert.equal(lists.status(device).locked,true);
 assert.equal(lists.save(device,body).status,'saved');
 assert.throws(()=>lists.save({...device,user_id:'another'}, {...body,request_id:randomUUID()}),/istnieje/);
 assert.equal(lists.status({guild_id:'other'}).locked,false);
 assert.match(reportText(lists.report('guild1','member1',new Date(now))),/według mocy/);
 now=Date.parse('2026-11-02T00:00:00Z');assert.throws(()=>lists.save(device,body),/niedzieli/);
});
test('incomplete or duplicate roster never consumes the weekly lock',t=>{
 const db=new Database(':memory:',new WarCalendar());t.after(()=>db.close());const now=Date.parse('2026-11-01T12:00:00Z');const lists=new WarLists(db,()=>now);const device={guild_id:'1',user_id:'2'};
 assert.throws(()=>lists.save(device,{request_id:randomUUID(),war_day:'2026-11-01',observed_at:new Date(now).toISOString(),ours:[{name:'a',power:1}],enemies:[{name:'b',power:1}],our_count:2,enemy_count:1}),/wszystkich/);
 assert.equal(lists.status(device).locked,false);
 assert.throws(()=>matchWar([{name:'A',power:1},{name:'a',power:2}],[{name:'b',power:1}]),/Powtórzone/);
});

test('extra allies retain one explicitly shared primary and up to three separate alternatives',()=>{
 const p=matchWar([{name:'a',power:100},{name:'b',power:90},{name:'c',power:80}],[{name:'x',power:70}]);
 assert.equal(p.assignments.filter(x=>!x.shared).length,1);
 assert.ok(p.assignments.every(x=>x.main==='x' && !x.alternatives.includes(x.main)));
});
test('fifty long unmatchable names remain within Discord message limits',t=>{
 const db=new Database(':memory:',new WarCalendar());t.after(()=>db.close());const now=Date.parse('2026-11-01T12:00:00Z');const lists=new WarLists(db,()=>now);
 lists.save({guild_id:'1',user_id:'2'},{request_id:randomUUID(),war_day:'2026-11-01',observed_at:new Date(now).toISOString(),ours:[{name:'a',power:1}],enemies:Array.from({length:50},(_,i)=>({name:String(i)+'x'.repeat(70),power:100})),our_count:1,enemy_count:50,own_bonus:{damage:0,health:0},enemy_bonus:{damage:0,health:0}});
 for(let i=0;i<8;i++){const v=lists.report('1','2',new Date(now),i);assert.ok(v.embeds.reduce((n,e)=>n+(e.description?.length??0),0)<=6000);assert.equal(v.files,undefined);}
});
test('paired-phone HTTP status and upload are authenticated and shared lock survives another member',async t=>{
 const db=new Database(':memory:',new WarCalendar());t.after(()=>db.close());const now=Date.parse('2026-11-01T12:00:00Z');
 const announced=[];
 const mobile=new MobileSync(db,new ScoringService(),{clock:()=>now,announcer:{send:async(guild,day)=>announced.push([guild,day])}});
 const token=mobile.pair({code:mobile.code('g','u','Player')}).token;
 const token2=mobile.pair({code:mobile.code('g','u2','Player2')}).token;
 t.after(()=>assert.deepEqual(announced,[['g','2026-11-01']],'only the first Sunday list is announced'));
 const server=createServer(async(req,res)=>{await mobile.receive(req,res,req.url,(res,status,data)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(data));});});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const send=(path,body,auth=token)=>fetch(`http://127.0.0.1:${server.address().port}/mobile/${path}`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${auth}`},body:JSON.stringify(body)});
 assert.equal((await send('war-status',{},'bad')).status,401);
 assert.equal((await (await send('war-status',{})).json()).locked,false);
 const body={request_id:randomUUID(),war_day:'2026-11-01',observed_at:new Date(now).toISOString(),ours:[{name:'a',power:100}],enemies:[{name:'b',power:90}],our_count:1,enemy_count:1,own_bonus:{damage:8700,health:7700},enemy_bonus:{damage:9600,health:8200}};
 assert.equal((await send('war-list',body)).status,200);
 assert.equal((await (await send('war-status',{},token2)).json()).locked,true);
 assert.equal((await send('war-list',{...body,request_id:randomUUID()},token2)).status,409);
});


test('matching agrees with exhaustive optimal pairing for small rosters',()=>{
 const triples=[];
 for(let a=1;a<=3;a++)for(let b=1;b<=3;b++)for(let c=1;c<=3;c++)triples.push([a,b,c]);
 const optimum=(a,b,i=0,used=new Set())=>{
  if(i===a.length)return 0;
  let best=optimum(a,b,i+1,used);
  for(let j=0;j<b.length;j++)if(!used.has(j)&&a[i]>=b[j]) {
   used.add(j);best=Math.max(best,1+optimum(a,b,i+1,used));used.delete(j);
  }
  return best;
 };
 for(const a of triples)for(const b of triples) {
  const plan=matchWar(a.map((power,i)=>({name:`a${i}`,power})),b.map((power,i)=>({name:`b${i}`,power})));
  const unique=plan.assignments.filter(x=>x.main&&!x.shared);
  assert.equal(unique.length,optimum(a,b));
  assert.equal(new Set(unique.map(x=>x.main)).size,unique.length);
 }
});

test('technology multipliers affect eligibility without turning it into a probability',()=>{
 const ours=[{name:'a',power:100}],enemies=[{name:'b',power:200}];
 assert.equal(matchWar(ours,enemies).assignments[0].main,null);
 assert.equal(matchWar(ours,enemies,3,1).assignments[0].main,'b');
 assert.equal(matchWar(ours,enemies,3,1).approximate,true);
 assert.throws(()=>matchWar(ours,enemies,Infinity,1),/mnożniki/);
});


test('Discord menu exposes the time-gated war report and dispatches it for ordinary members',async t=>{
 const now=new Date('2026-11-01T12:00:00Z');
 const calendar=new WarCalendar(), db=new Database(':memory:',calendar), scoring=new ScoringService();t.after(()=>db.close());
 const mobile=new MobileSync(db,scoring,{clock:()=>now.getTime()});
 const commands=new CommandService(db,new ReportService(calendar,scoring),scoring,mobile);
 const button=date=>Navigation.reports('u',date).flatMap(row=>row.components).find(x=>x.custom_id==='report:u:war-list:0');
 // The war list is always available: Sunday list in the war window, otherwise the equal-bonus preview.
 assert.ok(button(now)&&!button(now).disabled);
 assert.ok(button(new Date('2026-11-03T12:00:00Z'))&&!button(new Date('2026-11-03T12:00:00Z')).disabled);
 const interaction={id:'id',type:3,guild_id:'g',member:{user:{id:'u',username:'Player'},permissions:'0'},data:{custom_id:'report:u:war-list:0'}};
 const empty=await commands.handle(interaction,now);
 assert.equal(empty.type,7);
 assert.match(empty.data.content,/Nie utworzono/);
 mobile.warLists.save({guild_id:'g',user_id:'u'},{request_id:randomUUID(),war_day:'2026-11-01',observed_at:now.toISOString(),ours:[{name:'ally',power:100}],enemies:[{name:'enemy',power:90}],our_count:1,enemy_count:1,own_bonus:{damage:0,health:0},enemy_bonus:{damage:0,health:0}});
 const report=await commands.handle(interaction,now);
 assert.equal(report.type,7);
 assert.match(reportText(report.data),/ally/);assert.match(reportText(report.data),/enemy/);
 const slash=await commands.handle({...interaction,type:2,data:{name:'report',options:[{name:'war-list'}]}},now);
 assert.equal(slash.type,4);
 assert.equal(slash.data.flags,64);
 assert.match(reportText(slash.data),/ally/);assert.match(reportText(slash.data),/enemy/);
 assert.deepEqual(report.data.allowed_mentions,{parse:[]});
 const other=await commands.handle({...interaction,member:{...interaction.member,user:{id:'other',username:'Other'}}},now);
 assert.match(other.data.content,/innego gracza/);
 const isolated=await commands.handle({...interaction,guild_id:'another'},now);
 assert.match(isolated.data.content,/Nie utworzono/);
});

test('test war reports work on Tuesday, force equal bonuses, are repeatable and do not consume real war lock',t=>{
 const db=new Database(':memory:',new WarCalendar());t.after(()=>db.close());
 let now=Date.parse('2026-11-03T12:00:00Z');const lists=new WarLists(db,()=>now);const device={guild_id:'testguild',user_id:'u'};
 const body={request_id:randomUUID(),observed_at:new Date(now).toISOString(),ours:[{name:'ally',power:100}],enemies:[{name:'enemy',power:90}],our_count:1,enemy_count:1,own_bonus:{damage:100,health:100},enemy_bonus:{damage:100000,health:100000}};
 lists.save(device,body,true);
 const report=lists.report(device.guild_id,'u',new Date(now),0,true);
 assert.match(reportText(report),/LISTA POGLĄDOWA BEZ TECHU/);assert.match(reportText(report),/ally/);
 assert.match(reportText(lists.report(device.guild_id,'u',new Date(now))),/LISTA POGLĄDOWA BEZ TECHU/);assert.match(reportText(report),/enemy/);
 assert.equal(report.content,'# ⚠️ LISTA POGLĄDOWA BEZ TECHU\n## Czekaj na update niedzielny');
 assert.match(reportText(report),/⚙️ Tech odczytany przez aplikację: \*\*my\*\* \+100% obrażeń \/ \+100% zdrowia · \*\*rywal\*\* = nasz \(założenie\)/);
 assert.equal(report.files,undefined);assert.deepEqual(report.components,[]);
 lists.save(device,{...body,request_id:randomUUID()},true);
 const stored=JSON.parse(db.db.prepare('SELECT payload FROM war_lists WHERE guild_id=? AND war_day=?').get(device.guild_id,'TEST').payload);
 assert.deepEqual(stored.enemy_bonus,stored.own_bonus);
 now=Date.parse('2026-11-08T12:00:00Z');assert.equal(lists.status(device).locked,false);
});

test('war upload rejects scanning own clan twice, without creating a report or lock',t=>{
 const db=new Database(':memory:',new WarCalendar());t.after(()=>db.close());
 const now=Date.parse('2026-11-03T12:00:00Z'),lists=new WarLists(db,()=>now),device={guild_id:'g',user_id:'u'};
 const body={request_id:randomUUID(),observed_at:new Date(now).toISOString(),own_clan:'Clan A [PL]',enemy_clan:'Clan B [PL]',ours:[{name:'Ally',power:100}],enemies:[{name:'Enemy',power:90}],our_count:1,enemy_count:1,own_bonus:{damage:0,health:0}};
 assert.throws(()=>lists.save(device,{...body,enemy_clan:'clan a[pl]'},true),/ten sam klan/);
 assert.throws(()=>lists.save(device,{...body,enemies:[{name:'ALLY',power:100}]},true),/identyczne/);
 assert.throws(()=>lists.save(device,{...body,enemy_clan:null},true),/nazw obu/);
 assert.equal(db.db.prepare('SELECT count(*) n FROM war_lists').get().n,0);
 lists.save(device,body,true);
 const rendered=reportText(lists.report('g','u',new Date(now),0,true));
 const plainText=lists.report('g','u',new Date(now),0,true).embeds.map(e=>e.description).join('\n');
 assert.ok(rendered.length>0);assert.ok(plainText.includes('Clan A \\[PL\\]'));assert.ok(plainText.includes('Clan B \\[PL\\]'));
});

test('preview war list disappears with the weekly reset and the start menu offers ranking',t=>{
 const db=new Database(':memory:',new WarCalendar());t.after(()=>db.close());
 let now=Date.parse('2026-11-06T12:00:00Z');const lists=new WarLists(db,()=>now);const device={guild_id:'g',user_id:'u'};
 lists.save(device,{request_id:randomUUID(),observed_at:new Date(now).toISOString(),ours:[{name:'ally',power:100}],enemies:[{name:'enemy',power:90}],our_count:1,enemy_count:1,own_bonus:{damage:0,health:0}},true);
 assert.match(reportText(lists.report('g','u',new Date(now))),/ally/);
 now=Date.parse('2026-11-08T23:59:00Z');assert.match(reportText(lists.report('g','u',new Date(now))),/ally/);
 now=Date.parse('2026-11-09T00:01:00Z');assert.match(lists.report('g','u',new Date(now)).content,/Nie utworzono/);
 assert.ok(Navigation.reports('u').flatMap(r=>r.components).some(b=>b.custom_id==='report:u:clan-ranking:0'));
});

test('war status works outside Sunday and reports when the visible list was saved',t=>{
 const db=new Database(':memory:',new WarCalendar());t.after(()=>db.close());
 let now=Date.parse('2026-11-06T12:00:00Z');const lists=new WarLists(db,()=>now);const device={guild_id:'g',user_id:'u'};
 assert.deepEqual(lists.status(device),{war_day:null,locked:false,reason:null,list_updated_at:null,list_sunday:false,can_override:false});
 lists.save(device,{request_id:randomUUID(),observed_at:new Date(now).toISOString(),ours:[{name:'ally',power:100}],enemies:[{name:'enemy',power:90}],our_count:1,enemy_count:1,own_bonus:{damage:0,health:0}},true);
 assert.equal(lists.status(device).list_updated_at,new Date(now).toISOString());
 now=Date.parse('2026-11-08T12:00:00Z');
 assert.equal(lists.status(device).locked,false);
 lists.save(device,{request_id:randomUUID(),war_day:'2026-11-08',observed_at:new Date(now).toISOString(),ours:[{name:'ally',power:100}],enemies:[{name:'enemy',power:90}],our_count:1,enemy_count:1,own_bonus:{damage:0,health:0},enemy_bonus:{damage:0,health:0}});
 const s=lists.status(device);assert.equal(s.locked,true);assert.equal(s.list_sunday,true);assert.equal(s.list_updated_at,new Date(now).toISOString());
});

test('Sunday war list announcement pings @everyone once on the reminder channel with how to open it',async t=>{
 const db=new Database(':memory:',new WarCalendar());t.after(()=>db.close());
 const calls=[];const request=async(url,options)=>{calls.push([url,JSON.parse(options.body)]);return {ok:true,json:async()=>({id:'123456789012345678'})};};
 const announcer=new WarAnnouncement(db,'token',{request,logger:{error(){}}});
 assert.equal(await announcer.send('900000000000000000','2026-11-08'),false,'no channel configured: nothing is sent');
 db.setReminderChannel('900000000000000000','800000000000000000');
 assert.equal(await announcer.send('900000000000000000','2026-11-08'),true);
 const [url,body]=calls[0];
 assert.match(url,/channels\/800000000000000000\/messages$/);
 assert.match(body.content,/^@everyone\n/);
 assert.match(body.content,/każdy ma przypisanego przeciwnika/);
 assert.match(body.content,/\/start → Lista wojenna.*\/report war-list/);
 assert.deepEqual(body.allowed_mentions,{parse:['everyone']});
 assert.equal(body.nonce.length,24);
 assert.equal(await new WarAnnouncement(db,'',{request}).send('900000000000000000','2026-11-08'),false,'no token: nothing is sent');
});

test('management may replace the Sunday list only after confirming; others stay locked',t=>{
 const db=new Database(':memory:',new WarCalendar());t.after(()=>db.close());
 const now=Date.parse('2026-11-08T12:00:00Z');const lists=new WarLists(db,()=>now);
 const list=(extra={})=>({request_id:randomUUID(),war_day:'2026-11-08',observed_at:new Date(now).toISOString(),ours:[{name:'ally',power:100}],enemies:[{name:'enemy',power:90}],our_count:1,enemy_count:1,own_bonus:{damage:0,health:0},enemy_bonus:{damage:0,health:0},...extra});
 assert.equal(lists.save({guild_id:'g',user_id:'u'},list()).created,true);
 assert.throws(()=>lists.save({guild_id:'g',user_id:'u2'},list({overwrite:true})),/zablokowany/);
 assert.throws(()=>lists.save({guild_id:'g',user_id:'boss',manager:true},list()),/Potwierdź aktualizację/);
 const updated=lists.save({guild_id:'g',user_id:'boss',manager:true},list({ours:[{name:'ally',power:120}],overwrite:true}));
 assert.equal(updated.updated,true);
 assert.equal(lists.status({guild_id:'g',manager:true}).can_override,true);
 assert.equal(lists.status({guild_id:'g'}).can_override,false);
 assert.match(JSON.stringify(lists.report('g','u',new Date(now))),/120|ally/);
});
