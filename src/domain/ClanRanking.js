import { checkCombatResult,validateProfiles } from './WarSimulation.js';

export function clanRanking(body,members,now) {
 const sim=body.simulation;
 if(sim?.model!=='pvp-full-v1'||!Array.isArray(sim.matrix)||sim.matrix.length!==members.length*(members.length-1)/2)throw new Error('Brak symulacji wszystkich par klanu.');
 const profiles=validateProfiles(body.profiles,members,now);
 const rows=members.map(p=>({...p,points:0,simulated:0,byPower:0}));
 const seen=new Set();
 for(const match of sim.matrix) {
  const a=match?.ally,b=match?.enemy;
  if(!Number.isInteger(a)||!Number.isInteger(b)||a<0||a>=b||b>=members.length||seen.has(a*members.length+b))throw new Error('Powtórzona lub nieprawidłowa para rankingu.');
  seen.add(a*members.length+b);
  const result=checkCombatResult(match,profiles[a],profiles[b]);
  const first=rows[a],second=rows[b];
  const points=result.error?(first.power===second.power?.5:Number(first.power>second.power)):(result.wins+result.draws/2)/result.trials;
  first.points+=points;
  second.points+=1-points;
  const metric=result.error?'byPower':'simulated';
  first[metric]++;
  second[metric]++;
 }
 return rows.sort((a,b)=>b.points-a.points||b.power-a.power||a.name.localeCompare(b.name));
}
