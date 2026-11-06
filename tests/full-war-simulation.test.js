import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {maximumExpectedWins,validateSimulation,wilson} from '../src/domain/WarSimulation.js';
import {WarReport} from '../src/discord/WarReport.js';
import {MobileSync} from '../src/http/MobileSync.js';
import {Database} from '../src/storage/Database.js';
import {WarCalendar} from '../src/domain/WarCalendar.js';
import {ScoringService} from '../src/domain/ScoringService.js';
const now=Date.parse('2026-11-04T12:00:00Z');
function fixture(count=2) {
 const ours=Array.from({length:count},(_,i)=>({name:`Nasz${i}`,power:1e9+i})),enemies=Array.from({length:count},(_,i)=>({name:`Rywal${i}`,power:9e8+i}));
 const profile=p=>({...p,damage:1e6,health:1e9,ranged:false,mounted:true,pets:3,bonuses:{CRIT:65},skillsReviewed:true,skills:[{type:'STAMPEDE',level:14}],fairy:{present:false},scannedAt:now});
 return {request_id:randomUUID(),war_day:'TEST',observed_at:new Date(now).toISOString(),ours,enemies,our_count:count,enemy_count:count,own_clan:'Nasz klan',enemy_clan:'Rywal',own_bonus:{damage:8700,health:7700},enemy_bonus:{damage:8700,health:7700},profiles:{ours:ours.map(profile),enemies:enemies.map(profile)},simulation:{model:'pvp-full-v1',experimental:true,matrix:ours.flatMap((_,ally)=>enemies.map((_,enemy)=>({ally,enemy,wins:enemy===ally?800:600,losses:enemy===ally?224:424,draws:0,trials:1024})))}};
}
const plan=body=>validateSimulation(body,body.ours,body.enemies,now);
test('global probabilities beat independent greedy picks and never reuse main targets',()=>{
 assert.deepEqual(maximumExpectedWins([[.90,.89],[.88,.01]]),[1,0]);
 assert.deepEqual(maximumExpectedWins([[null,.5],[.2,.1]]),[-1,-1]);
 const matched=maximumExpectedWins([[.8],[.9]]);assert.equal(matched.filter(x=>x===0).length,1);assert.equal(matched[1],0);
});
test('weighted assignment agrees with exhaustive optimum on every small probability matrix',()=>{
 function optimum(a,i=0,used=new Set()) {if(i===a.length)return 0;let best=optimum(a,i+1,used);for(let j=0;j<a[i].length;j++)if(a[i][j]>.5&&!used.has(j)){used.add(j);best=Math.max(best,a[i][j]+optimum(a,i+1,used));used.delete(j);}return best;}
 for(let mask=0;mask<729;mask++){let k=mask;const a=Array.from({length:2},()=>Array.from({length:3},()=>{const p=[null,.6,.9][k%3];k=Math.floor(k/3);return p;}));const got=maximumExpectedWins(a).reduce((n,j,i)=>n+(j>=0?a[i][j]:0),0);assert.ok(Math.abs(got-optimum(a))<1e-10);}
});
test('Wilson intervals retain uncertainty at zero/all wins and narrow with more trials',()=>{
 const low=wilson(0,128),high=wilson(128,128);assert.ok(Math.abs(low[0])<1e-12);assert.ok(low[1]>0);assert.ok(high[0]<1);assert.ok(Math.abs(high[1]-1)<1e-12);
 assert.ok(wilson(512,1024)[1]-wilson(512,1024)[0]<wilson(64,128)[1]-wilson(64,128)[0]);
 assert.match(WarReport.chance({probability:0,interval:wilson(0,1024),trials:1024},true),/0,4%/);
});
test('complete simulation plan has measured probabilities, alternatives, trials and main assignment',()=>{
 const p=plan(fixture(4));assert.equal(p.type,'simulation');assert.equal(p.validPairs,16);assert.equal(p.completeOurs,4);
 assert.equal(new Set(p.assignments.map(x=>x.main)).size,4);
 assert.ok(p.assignments.every(x=>x.alternatives.length===2&&x.matchups.every(r=>r.trials===1024&&r.probability===r.wins/r.trials)));
});
test('unknown profile stays unknown in every pair and cannot become a zero-percent or too-strong claim',()=>{
 const b=fixture();b.profiles.enemies[1]=null;
 b.simulation.matrix=b.simulation.matrix.map(x=>x.enemy===1?{ally:x.ally,enemy:x.enemy,error:'Brak profilu'}:x);
 const p=plan(b);assert.equal(p.validPairs,2);assert.deepEqual(p.unrated,['Rywal1']);assert.ok(!p.tooStrong.includes('Rywal1'));
 assert.ok(p.assignments.every(x=>x.matchups.find(r=>r.name==='Rywal1').probability===undefined));
});
test('unsupported reflect cannot carry an invented numeric probability',()=>{
 const b=fixture();b.profiles.ours[0].bonuses.REFLECT=5;assert.throws(()=>plan(b),/Niewiarygodny/);
 b.simulation.matrix=b.simulation.matrix.map(x=>x.ally===0?{ally:x.ally,enemy:x.enemy,error:'Nieobsługiwane odbicie'}:x);
 const p=plan(b);assert.equal(p.assignments[0].main,null);assert.match(p.assignments[0].note,/Brak pełnej oceny/);
});
test('season 2026-11 Tira is simulated while reflect stays guarded',()=>{
 const b=fixture();b.profiles.ours[0].fairy={type:'TIRA',level:3};assert.equal(plan(b).validPairs,4);
 b.profiles.ours[0].bonuses.REFLECT=5;assert.throws(()=>plan(b),/Niewiarygodny/);
 b.simulation.matrix=b.simulation.matrix.map(x=>x.ally===0?{ally:x.ally,enemy:x.enemy,error:'Odbicie: efekt niepotwierdzony'}:x);assert.equal(plan(b).validPairs,2);
});
test('invalid pair counts, duplicates, fake samples and mismatched/stale profiles are rejected',()=>{
 for(const mutate of [b=>b.simulation.matrix.pop(),b=>b.simulation.matrix[1]=b.simulation.matrix[0],b=>b.simulation.matrix[0].wins++,b=>b.simulation.matrix[0].trials=10,b=>b.profiles.ours[0].name='Someone else',b=>b.profiles.ours[0].scannedAt-=8*86400000+1,b=>b.profiles.ours[0].pets=4,b=>b.profiles.ours[0].skills[0].level=0,b=>b.profiles.ours[0].fairy={type:'UNKNOWN',level:8}]){const b=fixture();mutate(b);assert.throws(()=>plan(b));}
});
test('a fully unknown matrix cannot be saved as a combat probability report',()=>{
 const b=fixture();b.profiles.ours.fill(null);b.simulation.matrix=b.simulation.matrix.map(x=>({ally:x.ally,enemy:x.enemy,error:'Brak profilu'}));assert.throws(()=>plan(b),/Brak choć jednej/);
});
test('full 50x50 report stays in one message, keeps every matchup in its attachment and respects embed limits',()=>{
 const b=fixture(50);b.plan=plan(b);const row={war_day:'TEST',payload:JSON.stringify(b)},first=WarReport.render(row,'u',0,true);
 const count=Number(first.embeds.at(-1).footer.text.match(/\/(\d+)/)[1]);
 for(let i=0;i<count;i++){const view=WarReport.render(row,'u',i,true);assert.ok(view.embeds.reduce((n,e)=>n+WarReport.length(e),0)<=6000);assert.ok(view.embeds.every(e=>(e.description?.length??0)<=4096));assert.equal(view.additionalMessages,undefined);}
 const text=first.files[0].data.toString('utf8');assert.match(text,/2500\/2500/);assert.match(text,/1024 prób/);assert.match(text,/95%/);assert.match(text,/Nasz49 → Rywal49/);assert.doesNotMatch(text,/Metoda: moc ×/);
});
test('authenticated large full-profile upload survives HTTP, remains repeatable TEST and does not lock real Sunday',async t=>{
 const db=new Database(':memory:',new WarCalendar());t.after(()=>db.close());const mobile=new MobileSync(db,new ScoringService(),{clock:()=>now});
 const token=mobile.pair({code:mobile.code('g','u','Player')}).token;
 const server=createServer((req,res)=>mobile.receive(req,res,req.url,(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body));}));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const b=fixture(50);b.profiles.ours.forEach(p=>p.raw='potwierdzone bonusy '.repeat(50));assert.ok(JSON.stringify(b).length>65536);
 const url=`http://127.0.0.1:${server.address().port}/mobile/war-test`;
 const send=auth=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json',authorization:`Bearer ${auth}`},body:JSON.stringify(b)});
 assert.equal((await send('bad')).status,401);assert.equal((await send(token)).status,200);assert.equal((await send(token)).status,200);
 const stored=JSON.parse(db.db.prepare('SELECT payload FROM war_lists WHERE guild_id=?').get('g').payload);assert.equal(stored.plan.type,'simulation');assert.equal(stored.plan.pairs,2500);assert.equal(stored.profiles.ours.length,50);
});
test('equal simulated chances send stronger allies to stronger rivals so weaker allies keep easier targets',async()=>{
 const {planHybridWar}=await import('../src/domain/WarSimulation.js');
 const b=fixture(3);b.ours.forEach((p,i)=>p.power=3e9-i*1e9);b.enemies.forEach((p,i)=>p.power=2.5e9-i*1e9+1);
 b.profiles={ours:b.ours.map(p=>({...b.profiles.ours[0],...p})),enemies:b.enemies.map(p=>({...b.profiles.enemies[0],...p}))};
 b.simulation.matrix=b.simulation.matrix.map(x=>({...x,wins:700,losses:324,draws:0}));
 const result=planHybridWar(validateSimulation(b,b.ours,b.enemies,now),b.ours,b.enemies,b.own_bonus,b.enemy_bonus);
 assert.deepEqual(result.assignments.map(a=>a.main),['Rywal0','Rywal1','Rywal2']);
});
test('incrementally reused profiles from earlier this week remain valid',()=>{
 const b=fixture();b.profiles.ours[0].scannedAt-=6*86400000;assert.equal(plan(b).validPairs,4);
});
