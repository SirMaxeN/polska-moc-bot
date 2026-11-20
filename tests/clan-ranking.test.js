import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {clanRanking} from '../src/domain/ClanRanking.js';
import {ClanRankings} from '../src/http/ClanRankings.js';
import {Database} from '../src/storage/Database.js';
import {WarCalendar} from '../src/domain/WarCalendar.js';

const now=Date.parse('2026-11-06T12:00:00Z');
const profile=p=>({...p,damage:1e6,health:1e9,ranged:false,mounted:true,pets:3,bonuses:{},skillsReviewed:true,skills:[],fairy:{present:false},scannedAt:now});
function body(count=4,{unknown=[]}={}) {
 const members=Array.from({length:count},(_,i)=>({name:`Gracz${i}`,power:1e9-i*1e7}));
 const matrix=[];
 for(let a=0;a<count;a++)for(let b=a+1;b<count;b++)
  matrix.push(unknown.includes(a)||unknown.includes(b)?{ally:a,enemy:b,error:'Brak profilu'}:{ally:a,enemy:b,wins:b===3&&a===2?100:900,losses:b===3&&a===2?924:124,draws:0,trials:1024});
 return {request_id:randomUUID(),observed_at:new Date(now).toISOString(),clan:'PolskaMoc',members,member_count:count,
  profiles:members.map((p,i)=>unknown.includes(i)?null:profile(p)),simulation:{model:'pvp-full-v1',experimental:true,matrix}};
}

test('round-robin ranking orders by simulated points and falls back to power only for unknown pairs',()=>{
 const b=body(4);
 const rows=clanRanking(b,b.members,now);
 assert.deepEqual(rows.map(r=>r.name),['Gracz0','Gracz1','Gracz3','Gracz2']);
 assert.ok(rows.every(r=>r.simulated===3&&r.byPower===0));
 const u=body(4,{unknown:[1]});
 const mixed=clanRanking(u,u.members,now);
 assert.equal(mixed.find(r=>r.name==='Gracz1').byPower,3);
 assert.equal(mixed.reduce((n,r)=>n+r.points,0),6);
});

test('ranking rejects an incomplete or duplicated pair matrix',()=>{
 const b=body(3);b.simulation.matrix.pop();
 assert.throws(()=>clanRanking(b,b.members,now),/wszystkich par/);
 const d=body(3);d.simulation.matrix[1]={...d.simulation.matrix[0]};
 assert.throws(()=>clanRanking(d,d.members,now),/Powtórzona/);
});

test('saved ranking renders a private report with wins out of all opponents and never mentions',t=>{
 const db=new Database(':memory:',new WarCalendar());t.after(()=>db.close());
 const rankings=new ClanRankings(db,()=>now);
 assert.match(rankings.report('g').content,/nie został jeszcze obliczony/);
 assert.equal(rankings.save({guild_id:'g'},body(4)).status,'saved');
 const view=rankings.report('g');
 assert.deepEqual(view.allowed_mentions,{parse:[]});
 assert.match(view.embeds[0].description,/1\. 🥇 \*\*Gracz0\*\* · .* · wygrane \*\*[\d,]+\/3\*\*/);assert.match(view.embeds[0].description,/Każdy z każdym/);
 assert.equal(view.files,undefined);assert.match(view.embeds.map(e=>e.description).join('\n'),/Gracz2/);
});

test('ranking report lists all fifty players across embeds within Discord limits',t=>{
 const db=new Database(':memory:',new WarCalendar());t.after(()=>db.close());
 const rankings=new ClanRankings(db,()=>now);
 const b=body(50);b.members.forEach((m,i)=>m.name=`DlugiNickGracza${String(i).padStart(2,'0')}xxxxxxxxxxxxxxxxxxxx`);b.profiles=b.members.map(profile);
 rankings.save({guild_id:'g'},b);
 const view=rankings.report('g');const text=view.embeds.map(e=>e.description).join('\n');
 for(let i=0;i<50;i++)assert.match(text,new RegExp(`DlugiNickGracza${String(i).padStart(2,'0')}`));
 assert.match(text,/^50\. /m);
 assert.ok(view.embeds.every(e=>e.description.length<=4096));
 assert.ok(view.embeds.reduce((n,e)=>n+e.description.length+(e.title?.length??0),0)<=6000);
});

test('history is browsed with newer/older buttons that end at the official ranking',t=>{
 const db=new Database(':memory:',new WarCalendar());t.after(()=>db.close());
 let clock=now;const rankings=new ClanRankings(db,()=>clock);
 for(let i=0;i<3;i++){const b=body(4+i);b.observed_at=new Date(clock).toISOString();rankings.save({guild_id:'g'},b);clock+=60000;}
 const buttons=page=>rankings.report('g','u',page).components[0].components;
 const [newer,older]=buttons(0);
 assert.equal(newer.label,'◀ Nowszy');assert.equal(newer.disabled,true);
 assert.equal(older.custom_id,'report:u:clan-ranking:1');assert.equal(older.disabled,false);
 const middle=buttons(1);
 assert.equal(middle[0].label,'◀ Nowszy (oficjalny)');assert.equal(middle[0].custom_id,'report:u:clan-ranking:0');
 assert.equal(middle[1].custom_id,'report:u:clan-ranking:2');
 const last=buttons(2);
 assert.equal(last[0].custom_id,'report:u:clan-ranking:1');assert.equal(last[1].disabled,true);
 assert.ok(new Set(last.map(b=>b.custom_id)).size===last.length);
 assert.match(rankings.report('g','u',0).embeds[0].description,/Oficjalny ranking/);
 assert.match(rankings.report('g','u',2).embeds[0].description,/Archiwum 2\/2/);
});

test('a withdrawn scan is deleted on start and never saved again',t=>{
 const db=new Database(':memory:',new WarCalendar());t.after(()=>db.close());
 const id=[...ClanRankings.withdrawn][0];
 const rankings=new ClanRankings(db,()=>now);
 const good=body(4);rankings.save({guild_id:'g'},good);
 const bad=body(4);bad.request_id=id;bad.members[0].name='Inny';bad.profiles=bad.members.map(profile);
 db.db.prepare('INSERT INTO clan_ranking_history VALUES(?,?,?,?)').run('g',now+1,id,JSON.stringify({clan:'PolskaMoc',rows:[]}));
 new ClanRankings(db,()=>now);
 assert.deepEqual(db.db.prepare('SELECT request_id FROM clan_ranking_history').all().map(r=>r.request_id),[good.request_id]);
 rankings.save({guild_id:'g'},bad);
 assert.equal(db.db.prepare('SELECT COUNT(*) n FROM clan_ranking_history WHERE request_id=?').get(id).n,0);
});
