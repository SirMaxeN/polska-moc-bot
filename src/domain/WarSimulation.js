const skillTypes=new Set(['MEAT','ARROWS','SHOUT','BERSERK','SHURIKENS','CANNON_BARRAGE','BUFF','ARROW_RAIN','THORNS','MORALE','BOMB','METEORITE','STAMPEDE','WORM','LIGHTNING','HIGHER_MORALE','STRAFE_RUN','DRONE']);
/** Profiles are reused incrementally on the phone for a week while the member's power is unchanged. */
// A profile with unchanged power stays valid for a month; seasons can change game rules, so not forever.
export const PROFILE_MAX_AGE=31*86400000;
const nameKey=s=>s.normalize('NFKC').toLocaleLowerCase('pl');
import { rebalanceWarAlternatives } from './WarAlternatives.js';
import { simulateClanBrawl } from './ClanBrawl.js';
/** Hungarian rectangular assignment, including dummy columns for no favourable target. */
export function maximumExpectedWins(matrix) {
 return maximumWeightAssignment(matrix.map(row=>row.map(p=>p>.5?p:0)));
}
function maximumWeightAssignment(matrix) {
 const n=matrix.length;if(!n)return [];
 const targets=matrix[0].length,m=targets+n,u=Array(n+1).fill(0),v=Array(m+1).fill(0),p=Array(m+1).fill(0),way=Array(m+1).fill(0);
 for(let i=1;i<=n;i++) {
  p[0]=i;let j0=0;const min=Array(m+1).fill(Infinity),used=Array(m+1).fill(false);
  do {
   used[j0]=true;const i0=p[j0];let delta=Infinity,j1=0;
   for(let j=1;j<=m;j++)if(!used[j]) {
    const weight=j<=targets?matrix[i0-1][j-1]:0,cur=-weight-u[i0]-v[j];
    if(cur<min[j]){min[j]=cur;way[j]=j0;}if(min[j]<delta){delta=min[j];j1=j;}
   }
   for(let j=0;j<=m;j++)if(used[j]){u[p[j]]+=delta;v[j]-=delta;}else min[j]-=delta;
   j0=j1;
  }while(p[j0]!==0);
  do {const j1=way[j0];p[j0]=p[j1];j0=j1;}while(j0);
 }
 const answer=Array(n).fill(-1);for(let j=1;j<=targets;j++)if(p[j]>0&&matrix[p[j]-1][j-1]>0)answer[p[j]-1]=j-1;
 return answer;
}
export function wilson(wins,trials) {
 const z=1.96,p=wins/trials,d=1+z*z/trials,centre=(p+z*z/(2*trials))/d,radius=z*Math.sqrt(p*(1-p)/trials+z*z/(4*trials*trials))/d;
 return [Math.max(0,centre-radius),Math.min(1,centre+radius)];
}
export function validateProfiles(data,members,now) {
  if(!Array.isArray(data)||data.length!==members.length)throw new Error('Brak zapisanych profili klanu.');
  return data.map((profile,i)=>{
   if(profile===null)return null;
   if(!profile||typeof profile.name!=='string'||nameKey(profile.name)!==nameKey(members[i].name)||![profile.damage,profile.health].every(x=>Number.isFinite(x)&&x>0&&x<=1e24)||typeof profile.ranged!=='boolean'||typeof profile.mounted!=='boolean'||!Number.isInteger(profile.pets)||profile.pets<0||profile.pets>3||!Number.isFinite(profile.scannedAt)||profile.scannedAt>now+60000||now-profile.scannedAt>PROFILE_MAX_AGE)throw new Error('Nieprawidłowy lub nieaktualny profil gracza.');
   if(profile.skillsReviewed!==true||!Array.isArray(profile.skills)||profile.skills.length>3||profile.skills.some(s=>!s||!skillTypes.has(s.type)||!Number.isInteger(s.level)||s.level<1||s.level>100)||new Set(profile.skills.map(s=>s.type)).size!==profile.skills.length)throw new Error('Niekompletne umiejętności gracza.');
   if(!profile.bonuses||typeof profile.bonuses!=='object'||Array.isArray(profile.bonuses)||Object.values(profile.bonuses).some(x=>!Number.isFinite(x)||x<0||x>100000))throw new Error('Nieprawidłowe bonusy profilu.');
   const fairy=profile.fairy;if(!fairy||(fairy.present!==false&&(!['LORA','MIRA','TIRA'].includes(fairy.type)||!Number.isInteger(fairy.level)||fairy.level<1||fairy.level>20)))throw new Error('Niekompletne dane wróżki.');
   if(!Number.isFinite(profile.skillMastery??0)||(profile.skillMastery??0)<0||(profile.skillMastery??0)>100000)throw new Error('Nieprawidłowy bonus umiejętności.');
   return profile;
  });
}
export function checkCombatResult(x,first,second) {
 // Season 2026-11 Tira adds damage already included in the displayed profile; reflect remains unmodelled.
 const unsupported=[first,second].some(p=>p&&(p.bonuses.REFLECT??0)>0);
 if(x.error!=null) {
  if(typeof x.error!=='string'||!x.error.trim()||x.error.length>1000||['wins','losses','draws','trials'].some(k=>x[k]!=null))throw new Error('Nieprawidłowy brak wyniku pary.');
  return {error:x.error};
 }
 if(!first||!second||unsupported||![x.wins,x.losses,x.draws,x.trials].every(Number.isInteger)||x.trials<128||x.trials>10000||Math.min(x.wins,x.losses,x.draws)<0||x.wins+x.losses+x.draws!==x.trials)throw new Error('Niewiarygodny wynik symulacji pary.');
 return {wins:x.wins,losses:x.losses,draws:x.draws,trials:x.trials,probability:x.wins/x.trials,interval:wilson(x.wins,x.trials)};
}
export function validateSimulation(body,ours,enemies,now,{allowUnknown=false}={}) {
 const sim=body.simulation;
 if(!sim||sim.model!=='pvp-full-v1'||sim.experimental!==true)throw new Error('Nieznana wersja modelu symulacji.');
 const a=validateProfiles(body.profiles?.ours,ours,now),b=validateProfiles(body.profiles?.enemies,enemies,now);
 if(!Array.isArray(sim.matrix)||sim.matrix.length!==ours.length*enemies.length)throw new Error('Brak wyników wszystkich par.');
 const results=Array.from({length:ours.length},()=>Array(enemies.length).fill(null));
 for(const x of sim.matrix) {
  if(!x||!Number.isInteger(x.ally)||!Number.isInteger(x.enemy)||x.ally<0||x.ally>=a.length||x.enemy<0||x.enemy>=b.length||results[x.ally][x.enemy])throw new Error('Powtórzona lub nieprawidłowa para symulacji.');
  results[x.ally][x.enemy]=checkCombatResult(x,a[x.ally],b[x.enemy]);
 }
 const matrix=results.map(row=>row.map(x=>x.error?null:x.probability));
 if(!allowUnknown&&!matrix.some(row=>row.some(p=>p!==null)))throw new Error('Brak choć jednej wiarygodnej pary do symulacji. Popraw profile lub nieobsługiwane efekty.');
 const primary=maximumExpectedWins(matrix);
 const assignments=ours.map((player,i)=>{
  const eligible=enemies.map((enemy,j)=>({name:enemy.name,j,p:matrix[i][j]})).filter(x=>x.p>.5).sort((a,b)=>b.p-a.p||a.j-b.j);
  const j=primary[i]>=0?primary[i]:eligible[0]?.j??-1;
  const main=j>=0?enemies[j].name:null,shared=primary[i]<0&&j>=0,unknown=results[i].some(x=>x.error);
  return {name:player.name,main,shared,alternatives:eligible.filter(x=>x.name!==main).slice(0,3).map(x=>x.name),
   note:shared?'Wspólny cel — brak dostępnej unikalnej pary':main?null:unknown?'Brak pełnej oceny: niekompletne dane lub nieobsługiwany efekt':'Brak celu z przewagą w symulacji',
   matchups:enemies.map((enemy,j)=>({name:enemy.name,...results[i][j]}))};
 });
 const plan={type:'simulation',approximate:true,model:sim.model,experimental:true,method:'Eksperymentalna symulacja walk: wyniki modelu, nie gwarancja wygranej. Przedział 95% opisuje losowość prób, nie błędy modelu.',assignments,
  expectedWins:primary.reduce((sum,j,i)=>sum+(j>=0?matrix[i][j]:0),0),
  tooStrong:enemies.filter((_,j)=>matrix.every(row=>row[j]!==null&&row[j]<=.5)).map(x=>x.name),
  unrated:enemies.filter((_,j)=>matrix.some(row=>row[j]===null)).map(x=>x.name),
  completeOurs:a.filter(Boolean).length,completeEnemies:b.filter(Boolean).length,pairs:sim.matrix.length,validPairs:results.flat().filter(x=>!x.error).length};
 plan.brawl=body.own_bonus&&body.enemy_bonus?simulateClanBrawl(a,b,body.own_bonus,body.enemy_bonus):null;
 return rebalanceWarAlternatives(plan,ours,enemies,body.own_bonus,body.enemy_bonus);
}

/** Apply at rendering too so already saved tests can be read under the current pairing policy. */
export function planHybridWar(plan,ours,enemies,ownBonus,enemyBonus) {
 const boost=b=>Math.sqrt((1+b.damage/100)*(1+b.health/100));
 const own=boost(ownBonus),rival=boost(enemyBonus);
 const strengths=(members,scale)=>new Map(members.map(p=>[p.name,p.power*scale]));
 const a=strengths(ours,own),b=strengths(enemies,rival);
 const rank=(members,s)=>new Map([...members].sort((x,y)=>s.get(y.name)-s.get(x.name)||x.name.localeCompare(y.name)).map((p,i)=>[p.name,i/Math.max(1,members.length-1)]));
 const ar=rank(ours,a),br=rank(enemies,b);
 const options=plan.assignments.map(player=>{
  const fights=new Map(player.matchups.map(m=>[m.name,m]));
  return enemies.map(({name})=>{
   const fight=fights.get(name),ratio=a.get(player.name)/b.get(name);
   const source=fight?.error?'power':'simulation';
   const eligible=source==='power'?ratio>=1:fight?.probability>.5;
   const quality=source==='power'?Math.min(1,ratio-1):fight?.probability??0;
   const proximity=1-Math.abs(ar.get(player.name)-br.get(name));
   return {name,source,eligible,quality,priority:quality+.30*proximity};
  });
 });
 const span=2*(ours.length+1);
 // First maximize distinct feasible targets. Then maximize the count backed by simulation.
 // Nearby power ranks decide similar matchups and keep stronger allies available for stronger targets.
 // Then give every remaining ally a distinct remaining rival (best available chance), so nobody shares
 // a target while free rivals exist. Favourable pairs always outweigh any number of unfavourable ones.
 const primary=maximumWeightAssignment(options.map(row=>row.map(c=>c.eligible?span*span+(c.source==='simulation'?span:0)+c.priority:(1+c.priority)/(4*span))));
 const assignments=plan.assignments.map((player,i)=>{
  const choices=options[i].filter(c=>c.eligible).sort((x,y)=>Number(y.source==='simulation')-Number(x.source==='simulation')||y.priority-x.priority||x.name.localeCompare(y.name));
  const target=options[i][primary[i]]??choices[0]??[...options[i]].sort((x,y)=>y.priority-x.priority)[0];
  return {...player,main:target?.name??null,mainSource:target?.source??null,shared:!!target&&primary[i]<0,
   alternatives:[],eligibleTargets:choices.map(c=>({name:c.name,quality:c.quality,source:c.source})),
   note:target?null:player.matchups.some(r=>r.error)?'Brak celu z przewagą w symulacji lub według mocy':'Brak celu z przewagą w symulacji'};
 });
 return rebalanceWarAlternatives({...plan,assignments,hybrid:true,
  expectedWins:assignments.reduce((n,p)=>n+(!p.shared&&p.mainSource==='simulation'?p.matchups.find(m=>m.name===p.main).probability:0),0),
  powerTargets:assignments.filter(p=>p.mainSource==='power').length},ours,enemies,ownBonus,enemyBonus);
}
