import { rebalanceWarAlternatives } from '../domain/WarAlternatives.js';
import { planHybridWar } from '../domain/WarSimulation.js';
/** Short war list. Probabilities are shown only for actual combat simulations; otherwise power. */
export class WarReport {
 /** Strip markdown/mentions; square brackets (clan tags like PolskaMoc[PL]) stay visible but escaped. */
 static clean(value) { return String(value).replace(/[\\`*_~|<>@#]/g,'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().replace(/[[\]]/g,m=>'\\'+m); }
 /** For embed titles, which Discord does not render as markdown: same stripping, brackets left as they are. */
 static plain(value) { return String(value).replace(/[\\`*_~|<>@#]/g,'').replace(/[\u0000-\u001f\u007f]/g,' ').trim(); }
 static number(value, digits=2) { return new Intl.NumberFormat('pl-PL',{maximumFractionDigits:digits}).format(value); }
 static power(value) {
  for(const [unit,size] of [['t',1e12],['b',1e9],['m',1e6],['k',1e3]])if(value>=size)return `${this.number(value/size)}${unit}`;
  return this.number(value);
 }
 static length(embed) {return (embed.title?.length??0)+(embed.description?.length??0)+(embed.footer?.text?.length??0)+(embed.fields??[]).reduce((n,f)=>n+f.name.length+f.value.length,0);}
 static chance(result,detail=false) {
  if(!result||result.error)return 'brak oceny';
  const percent=(x,digits=0)=>this.number(x*100,digits)+'%';
  return `${percent(result.probability)}${detail?` · 95%: ${percent(result.interval[0],1)}–${percent(result.interval[1],1)} · ${result.trials} prób`:''}`;
 }
 /**
  * Short war list: one line per player — player → unique rival (chance) · alternatives — under a legend.
  * Posts only (no attachments). Pages are only used when the clan does not fit one message.
  */
 static render(row,userId,page=0,testMode=false) {
  const p=JSON.parse(row.payload),simulated=p.plan.type==='simulation',clean=this.clean;
  const plan=simulated?planHybridWar(p.plan,p.ours,p.enemies,p.own_bonus,p.enemy_bonus):rebalanceWarAlternatives(p.plan,p.ours,p.enemies,p.own_bonus,p.enemy_bonus);
  const allies=new Map(p.ours.map(x=>[x.name,x])),enemies=new Map(p.enemies.map(x=>[x.name,x]));
  const boost=b=>Math.sqrt((1+b.damage/100)*(1+b.health/100));
  const ownBoost=boost(p.own_bonus),enemyBoost=boost(p.enemy_bonus);
  const percent=x=>`${this.number(x*100,0)}%`;
  const odds=(player,name)=>{
   const m=simulated?player.matchups?.find(x=>x.name===name):null;
   if(m&&!m.error)return {text:percent(m.probability),good:m.probability>.5,source:'sim'};
   const ratio=(allies.get(player.name).power*ownBoost)/(enemies.get(name).power*enemyBoost);
   return {text:`moc ${ratio>=1?'+':''}${this.number((ratio-1)*100,0)}%`,good:ratio>=1,source:'power'};
  };
  // Everyone gets a distinct rival while free rivals remain: leftovers take the best free one by power.
  const taken=new Set(plan.assignments.filter(a=>a.main&&!a.shared).map(a=>a.main));
  for(const a of plan.assignments)if(!a.main||a.shared) {
   const free=p.enemies.filter(e=>!taken.has(e.name)).sort((x,y)=>x.power-y.power)[0];
   if(free){a.main=free.name;a.shared=false;a.mainSource='power';taken.add(free.name);}
  }
  // War rules (GuildWarConfig): 5 attacks each, and the defeated list resets after 45 rivals, so up to
  // (rivals − 45, max 5) of the strongest need not be beaten. Only a rival out of everyone's reach
  // (best simulated chance below 25%) is skipped; its assigned player becomes a reserve for retries.
  const skippable=Math.min(5,Math.max(0,p.enemies.length-45));
  const bestChance=name=>Math.max(0,...plan.assignments.map(a=>a.matchups?.find(m=>m.name===name&&!m.error)?.probability??0));
  const tooStrong=simulated&&skippable?p.enemies.map(e=>({name:e.name,best:bestChance(e.name)})).filter(e=>e.best<.25).sort((x,y)=>x.best-y.best).slice(0,skippable):[];
  const skip=new Set(tooStrong.map(e=>e.name));
  const lines=plan.assignments.map(a=>{
   if(!a.main)return `🔴 **${clean(a.name)}** → brak wolnego przeciwnika`;
   if(skip.has(a.main)) {
    const retry=(a.matchups??[]).filter(m=>!m.error&&!skip.has(m.name)&&m.name!==a.main).sort((x,y)=>y.probability-x.probability).slice(0,3)
     .map(m=>`${clean(m.name)} ${percent(m.probability)}`).join(', ');
    return `🔁 **${clean(a.name)}** → rezerwa (${clean(a.main)} poza zasięgiem, ${odds(a,a.main).text})${retry?` · dobij: ${retry}`:''}`;
   }
   const main=odds(a,a.main);
   const marker=a.shared?'🟠':main.source==='power'?'⚖️':main.good?'🟢':'🟡';
   // Alternatives stay short: the name, plus the chance only when a simulation exists (never power).
   const alts=a.alternatives.map(name=>{const o=odds(a,name);return o.source==='sim'?`${clean(name)} ${o.text}`:clean(name);}).join(', ');
   return `${marker} **${clean(a.name)}** → **${clean(a.main)}** (${main.text})${alts?` · alt: ${alts}`:''}`;
  });
  const counts=marker=>lines.filter(x=>x.startsWith(marker)).length;
  const tech=b=>`+${this.number(b?.damage??0,1)}% obrażeń / +${this.number(b?.health??0,1)}% zdrowia`;
  const legend=[
   testMode?'🧪 **Poza niedzielą** — rywal ma takie same bonusy jak my. W niedzielę aplikacja odczyta prawdziwe bonusy rywala.':`Wojna ${clean(row.war_day)}.`,
   `⚙️ Tech odczytany przez aplikację: **my** ${tech(p.own_bonus)} · **rywal** ${testMode?'= nasz (założenie)':tech(p.enemy_bonus)}`,
   `**${clean(p.own_clan??'Nasz klan')}** (${p.ours.length}) vs **${clean(p.enemy_clan??'Rywal')}** (${p.enemies.length})`,
   'Format: **gracz** → **przeciwnik** (szansa wygranej) · alt: zapasowe cele (z szansą, jeśli jest symulacja).',
   `🟢 przewaga w symulacji (${counts('🟢')}) · 🟡 szansa ≤50% (${counts('🟡')}) · ⚖️ dobór wg mocy, brak pełnych danych (${counts('⚖️')})${counts('🟠')?` · 🟠 wspólny cel (${counts('🟠')})`:''}${counts('🔴')?` · 🔴 bez celu (${counts('🔴')})`:''}`,
   ...(tooStrong.length?[`🔁 Rezerwa (${counts('🔁')}): do resetu listy wystarczy pokonać 45 rywali, więc ${tooStrong.length} poza zasięgiem (${tooStrong.map(e=>clean(e.name)).join(', ')}) pomijamy. Rezerwa dobija rywali, których atak się nie udał.`]:[]),
   simulated?`Szanse to wynik modelu walki, nie gwarancja. Profile: ${plan.completeOurs}/${p.ours.length} + ${plan.completeEnemies}/${p.enemies.length}.`:'Brak symulacji — dobór wyłącznie według mocy z bonusami.',
  ].join('\n');
  // Pack lines into ≤4000-character embeds and ≤5800 characters per message.
  const title=testMode?'🧪 LISTA POGLĄDOWA BEZ TECHU RYWALA':`⚔️ Lista wojenna · ${clean(row.war_day)}`;
  const pages=[];let embeds=[{title,color:0x61d6ac,description:legend+'\n\n'}],used=title.length+legend.length+2;
  for(const line of lines) {
   const last=embeds.at(-1);
   if(used+line.length+1>5800){pages.push(embeds);embeds=[{color:0x61d6ac,description:''}];used=0;}
   else if(last.description.length+line.length+1>4000){embeds.push({color:0x61d6ac,description:''});}
   const target=embeds.at(-1);target.description+=(target.description&&!target.description.endsWith('\n\n')?'\n':'')+line;used+=line.length+1;
  }
  pages.push(embeds);
  page=Math.min(Math.max(0,Number.isFinite(page)?Math.trunc(page):0),pages.length-1);
  const visible=structuredClone(pages[page]);
  if(pages.length>1)visible.at(-1).footer={text:`Strona ${page+1}/${pages.length}`};
  // Every page of a preview carries a large warning above the list.
  return {...(testMode?{content:'# ⚠️ LISTA POGLĄDOWA BEZ TECHU\n## Czekaj na update niedzielny'}:{}),embeds:visible,allowed_mentions:{parse:[]},
   components:pages.length>1?[{type:1,components:[{type:2,style:2,label:'◀ Poprzednia',disabled:page===0,custom_id:`report:${userId}:${testMode?'war-test':'war-list'}:${page-1}`},{type:2,style:2,label:'Następna ▶',disabled:page===pages.length-1,custom_id:`report:${userId}:${testMode?'war-test':'war-list'}:${page+1}`}]}]:[]};
 }
}
