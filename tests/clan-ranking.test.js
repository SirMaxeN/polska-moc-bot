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
