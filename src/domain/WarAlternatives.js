/** Globally balance two distinct alternatives, preserving main targets and eligibility. */
export function distributeAlternatives(assignments, candidates) {
 const names=[...new Set(candidates.flatMap(row=>row.map(x=>x.name)))].sort();
 const n=assignments.length,m=names.length,source=0,firstPlayer=1,firstTarget=1+n,sink=1+n+m;
 const graph=Array.from({length:sink+1},()=>[]),edges=Array.from({length:n},()=>[]);
 function edge(from,to,capacity,cost) {const a={to,rev:graph[to].length,capacity,cost},b={to:from,rev:graph[from].length,capacity:0,cost:-cost};graph[from].push(a);graph[to].push(b);return a;}
 const primary=new Map();assignments.forEach(a=>{if(a.main)primary.set(a.main,(primary.get(a.main)??0)+1);});
 for(let i=0;i<n;i++) {
  edge(source,firstPlayer+i,2,0);
  const seen=new Set();for(const c of candidates[i])if(c.name!==assignments[i].main&&!seen.has(c.name)) {
   seen.add(c.name);const quality=Number.isFinite(c.quality)?Math.max(0,Math.min(1,c.quality)):0;
   const e=edge(firstPlayer+i,firstTarget+names.indexOf(c.name),1,Math.round((1-quality)*1000));edges[i].push({name:c.name,quality,edge:e});
  }
 }
 for(let j=0;j<m;j++)for(let slot=0;slot<n;slot++)edge(firstTarget+j,sink,1,((primary.get(names[j])??0)+slot)*1_000_000);
 for(;;) {
  const distance=Array(graph.length).fill(Infinity),previous=Array(graph.length),queued=Array(graph.length).fill(false),queue=[source];distance[source]=0;queued[source]=true;
  for(let head=0;head<queue.length;head++) {const from=queue[head];queued[from]=false;
   for(let k=0;k<graph[from].length;k++){const e=graph[from][k];if(e.capacity>0&&distance[e.to]>distance[from]+e.cost){distance[e.to]=distance[from]+e.cost;previous[e.to]=[from,k];if(!queued[e.to]){queue.push(e.to);queued[e.to]=true;}}}
  }
  if(!Number.isFinite(distance[sink]))break;
  for(let to=sink;to!==source;){const[from,k]=previous[to],e=graph[from][k];e.capacity--;graph[to][e.rev].capacity++;to=from;}
 }
 return assignments.map((a,i)=>({...a,alternatives:edges[i].filter(x=>x.edge.capacity===0).sort((a,b)=>b.quality-a.quality||a.name.localeCompare(b.name)).map(x=>x.name)}));
}
export function rebalanceWarAlternatives(plan,ours,enemies,ownBonus={damage:0,health:0},enemyBonus={damage:0,health:0}) {
 const boost=b=>Math.sqrt((1+b.damage/100)*(1+b.health/100)),own=boost(ownBonus),rival=boost(enemyBonus);
 const allies=new Map(ours.map(p=>[p.name,p]));
 const candidates=plan.assignments.map(a=>plan.type==='simulation'
  ? a.eligibleTargets??(a.matchups??[]).filter(x=>!x.error&&x.probability>.5).map(x=>({name:x.name,quality:x.probability}))
  : enemies.filter(e=>e.power*rival<=allies.get(a.name).power*own).map(e=>({name:e.name,quality:e.power*rival/(allies.get(a.name).power*own)})));
 return {...plan,assignments:distributeAlternatives(plan.assignments,candidates)};
}
