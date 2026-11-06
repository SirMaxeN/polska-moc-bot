import { rebalanceWarAlternatives } from './WarAlternatives.js';
/** This feature deliberately follows the requested Polish 01:00 window, including summer. */
export function battleWindow(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23' }).formatToParts(now).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  let key=`${p.year}-${p.month}-${p.day}`;
  if (Number(p.hour)<1) { const d=new Date(`${key}T12:00:00Z`);d.setUTCDate(d.getUTCDate()-1);key=d.toISOString().slice(0,10); }
  return new Date(`${key}T12:00:00Z`).getUTCDay()===0 ? key : null;
}
export function validateRoster(value) {
  if (!Array.isArray(value) || !value.length || value.length>50) throw new Error('Wymagana kompletna lista 1–50 członków.');
  const seen=new Set();
  return value.map(p=>{
    if (!p || typeof p.name!=='string' || !p.name.trim() || p.name.length>80 || !Number.isFinite(p.power) || p.power<=0 || p.power>1e18) throw new Error('Nieprawidłowy członek klanu.');
    const name=p.name.trim();const key=name.normalize('NFKC').toLocaleLowerCase('pl');
    if(seen.has(key)) throw new Error('Powtórzone nazwy na liście.');seen.add(key);
    return {name,power:p.power};
  });
}
/** Maximum-cardinality matching first, then deterministic strongest eligible target.
 * Power is only a heuristic, never a combat win probability. */
export function matchWar(ours,enemies,ownBoost=1,enemyBoost=1) {
  ours=validateRoster(ours);enemies=validateRoster(enemies);
  if (![ownBoost,enemyBoost].every(x=>Number.isFinite(x)&&x>0&&x<=1e8)) throw new Error('Nieprawidłowe mnożniki wojenne.');
  const a=ours.map(p=>({...p,score:p.power*ownBoost})).sort((x,y)=>y.score-x.score||x.name.localeCompare(y.name));
  const b=enemies.map(p=>({...p,score:p.power*enemyBoost})).sort((x,y)=>y.score-x.score||x.name.localeCompare(y.name));
  const owner=new Map();
  function assign(i,seen) { for(let j=0;j<b.length;j++) if(a[i].score>=b[j].score&&!seen.has(j)) { seen.add(j);if(!owner.has(j)||assign(owner.get(j),seen)){owner.set(j,i);return true;} }return false; }
  for(let i=a.length-1;i>=0;i--) assign(i,new Set());
  const primary=new Map([...owner].map(([j,i])=>[i,j]));
  const plan={ approximate:true, method:'Ranking orientacyjny mocy × średnia geometryczna mnożników obrażeń i zdrowia; to nie są szanse wygranej.',
    assignments:a.map((p,i)=>{const choices=b.filter(q=>p.score>=q.score);const j=primary.get(i);const main=j===undefined?(choices[0]?.name??null):b[j].name;return {name:p.name,main,shared:j===undefined&&choices.length>0,alternatives:choices.filter(q=>q.name!==main).slice(0,3).map(q=>q.name),note:!choices.length?'Według mocy przegra ze wszystkimi':j===undefined?'Wspólny cel — brak dostępnej unikalnej pary':null};}),
    tooStrong:b.filter(q=>!a.some(p=>p.score>=q.score)).map(q=>q.name) };
  return rebalanceWarAlternatives(plan,ours,enemies,{damage:(ownBoost-1)*100,health:(ownBoost-1)*100},{damage:(enemyBoost-1)*100,health:(enemyBoost-1)*100});
}
