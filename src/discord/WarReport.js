import { rebalanceWarAlternatives } from '../domain/WarAlternatives.js';
import { planHybridWar } from '../domain/WarSimulation.js';
import { warDaySixCeiling } from '../domain/WarDaySix.js';
/** Short war list. Probabilities are shown only for actual combat simulations; otherwise power. */
export class WarReport {
 static TECH_POTIONS_PER_LEVEL=492;
 static TECH_GEMS_PER_LEVEL=246;
 /** Strip markdown/mentions; square brackets (clan tags like PolskaMoc[PL]) stay visible but escaped. */
 static clean(value) { return String(value).replace(/[\\`*_~|<>@#]/g,'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().replace(/[[\]]/g,m=>'\\'+m); }
 /** For embed titles, which Discord does not render as markdown: same stripping, brackets left as they are. */
 static plain(value) { return String(value).replace(/[\\`*_~|<>@#]/g,'').replace(/[\u0000-\u001f\u007f]/g,' ').trim(); }
 static number(value, digits=2) { return new Intl.NumberFormat('pl-PL',{maximumFractionDigits:digits}).format(value); }
 static brawlLine(brawl) {
  return brawl?`🏆 Bitka (+1 000 pkt): **${this.number(100*brawl.nearest,0)}%** przy celowaniu w najbliższego na pierwszej linii · **${this.number(100*brawl.focus,0)}%** przy skupieniu ognia. Model eksperymentalny oparty na atakach podstawowych.`:'🏆 Bitka: **+1 000 pkt za wygraną**. Szacunek szans wymaga kompletu obsługiwanych profili obu klanów.';
 }
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
 /** The assignments every view shares (report, ping, /copy): unique rivals, leftovers by power, reserves. */
 static compute(row) {
  const p=JSON.parse(row.payload),simulated=p.plan.type==='simulation';
  const plan=simulated?planHybridWar(p.plan,p.ours,p.enemies,p.own_bonus,p.enemy_bonus):rebalanceWarAlternatives(p.plan,p.ours,p.enemies,p.own_bonus,p.enemy_bonus);
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
  return {p,plan,simulated,tooStrong,skip:new Set(tooStrong.map(e=>e.name))};
 }
 /**
  * In-game chat copy: "Player → Rival" (main targets only, no description), packed into messages of at
  * most `limit` characters (in-game chat limit: 280) without splitting a player's line.
  */
 static copyChunks(row,limit=280) {
  const {plan,skip}=this.compute(row);
  const lines=plan.assignments.map(a=>`${a.name} → ${!a.main?'brak celu':skip.has(a.main)?'rezerwa':a.main}`.slice(0,limit));
  const chunks=[];let current='';
  for(const line of lines) {
   if(current&&current.length+1+line.length>limit){chunks.push(current);current='';}
   current=current?`${current}\n${line}`:line;
  }
  if(current)chunks.push(current);
  return chunks;
 }
 /** Every page of the official list as plain messages (no buttons) for the channel post after the ping. */
 static channelMessages(row) {
  const first=this.render(row,'',0,false),last=first.embeds.at(-1).footer?.text?.match(/Strona 1\/(\d+)/);
  const pages=last?Number(last[1]):1;
  return Array.from({length:pages},(_,i)=>({embeds:(i?this.render(row,'',i,false):first).embeds,allowed_mentions:{parse:[]}}));
 }
  /**
   * Clan War Damage/Health upgrade hint sent by the app: levels per rival nobody beats.
   * Cost per level 246 tech points = 492 green potions or 246 gems (forgemaster.pro clan tech, game 2.11).
   */
 static techHint(hint) {
  const int=(x,lo,hi)=>Number.isInteger(x)&&x>=lo&&x<=hi?x:null;
  if(!hint||typeof hint!=='object'||!Array.isArray(hint.enemies)||!hint.enemies.length)return [];
  const max=int(hint.max_level,1,1000)??100,dmg=int(hint.damage_level,0,max)??0,hp=int(hint.health_level,0,max)??0;
  const beaten=int(hint.beaten,0,100),reset=int(hint.reset_needed,0,100);
  const cost=l=>`${this.number(l*WarReport.TECH_POTIONS_PER_LEVEL,0)} fiolek lub ${this.number(l*WarReport.TECH_GEMS_PER_LEVEL,0)} 💎`;
  const option=(label,l,from)=>l==null?null:`${label} +${l} poz. (do ${from+l}/${max}, +${this.number(l*100,0)}%) · ${cost(l)}`;
  const rows=hint.enemies.slice(0,10).map(e=>{
   const name=this.clean(String(e?.name??'?').slice(0,60));
   const options=[option('⚔️',int(e?.damage,1,max),dmg),option('❤️',int(e?.health,1,max),hp),option('⚔️+❤️ po',int(e?.both,1,max),Math.max(dmg,hp))].filter(Boolean);
   return `• **${name}**: ${options.length?options.join(' · '):'nawet maksymalny tech nie wystarcza'}`;
  });
  const missing=beaten!=null&&reset!=null&&beaten<reset?` Do resetu (${reset} pokonanych) brakuje **${reset-beaten}**.`:'';
  return [`📈 **Tech wojenny** (teraz ⚔️ ${dmg}/${max} · ❤️ ${hp}/${max}): ${hint.enemies.length} rywali poza zasięgiem.${missing} Ile poziomów trzeba, żeby ktoś z nas ich pokonał (≥50%):`,...rows];
 }
 static render(row,userId,page=0,testMode=false) {
  const clean=this.clean;
  const {p,plan,simulated,tooStrong,skip}=this.compute(row);
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
  const realTech=p.real_tech===true;
  const tech=b=>`+${this.number(b?.damage??0,1)}% obrażeń / +${this.number(b?.health??0,1)}% zdrowia`;
  const legend=[
   testMode?(realTech?'🧪 **Podgląd z prawdziwym techem rywala** — oficjalna lista pozostaje bez zmian, dopóki zarząd nie zatwierdzi podglądu.':'🧪 **Poza niedzielą** — rywal ma takie same bonusy jak my. W niedzielę aplikacja odczyta prawdziwe bonusy rywala.'):`Wojna ${clean(row.war_day)}.`,
   `⚙️ Tech odczytany przez aplikację: **my** ${tech(p.own_bonus)} · **rywal** ${testMode&&!realTech?'= nasz (założenie)':tech(p.enemy_bonus)}`,
   `**${clean(p.own_clan??'Nasz klan')}** (${p.ours.length}) vs **${clean(p.enemy_clan??'Rywal')}** (${p.enemies.length})`,
   'Format: **gracz** → **przeciwnik** (szansa wygranej) · alt: zapasowe cele (z szansą, jeśli jest symulacja).',
   `🟢 przewaga w symulacji (${counts('🟢')}) · 🟡 szansa ≤50% (${counts('🟡')}) · ⚖️ dobór wg mocy, brak pełnych danych (${counts('⚖️')})${counts('🟠')?` · 🟠 wspólny cel (${counts('🟠')})`:''}${counts('🔴')?` · 🔴 bez celu (${counts('🔴')})`:''}`,
   ...(tooStrong.length?[`🔁 Rezerwa (${counts('🔁')}): do resetu listy wystarczy pokonać 45 rywali, więc ${tooStrong.length} poza zasięgiem (${tooStrong.map(e=>clean(e.name)).join(', ')}) pomijamy. Rezerwa dobija rywali, których atak się nie udał.`]:[]),
   ...this.techHint(p.simulation?.tech_hint),
   simulated?`Szanse to wynik modelu walki, nie gwarancja. Profile: ${plan.completeOurs}/${p.ours.length} + ${plan.completeEnemies}/${p.enemies.length}.`:'Brak symulacji — dobór wyłącznie według mocy z bonusami.',
  ].join('\n');
  // Pack lines into ≤4000-character embeds and ≤5800 characters per message.
  const title=testMode?(realTech?'🧪 LISTA POGLĄDOWA (tech rywala odczytany)':'🧪 LISTA POGLĄDOWA BEZ TECHU RYWALA'):`⚔️ Lista wojenna · ${clean(row.war_day)}`;
  const pages=[];let embeds=[{title,color:0x61d6ac,description:legend+'\n\n'}],used=title.length+legend.length+2;
  const ceiling=warDaySixCeiling(p.ours.length,p.enemies.length);
  const brawl=plan.brawl;
  const summary=[
   `\n🧮 **Maksymalny potencjał dnia 6: ${this.number(ceiling.attackPoints+1000,0)} pkt**`,
   `⚔️ Ataki: **${this.number(ceiling.attackPoints,0)} pkt** przy ${ceiling.tickets} wygranych atakach, celach od góry listy i resecie po ${ceiling.resetAt} pokonanych (${ceiling.resets} pełnych resetów).`,
   this.brawlLine(brawl),
  ];
  for(const line of [...lines,...summary]) {
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
  // Management can promote the preview to this week's official list on any day (checked on click).
  const promote=testMode&&userId?[{type:1,components:[{type:2,style:1,label:'Ustaw jako oficjalną i pinguj',emoji:{name:'⬆️'},custom_id:`warpromote:${userId}:ping`},{type:2,style:2,label:'Ustaw jako oficjalną',emoji:{name:'⬆️'},custom_id:`warpromote:${userId}:silent`}]}]:[];
  return {...(testMode?{content:realTech?'# ⚠️ LISTA POGLĄDOWA\n## Oficjalna lista bez zmian: /report war-list':'# ⚠️ LISTA POGLĄDOWA BEZ TECHU\n## Czekaj na update niedzielny'}:{}),embeds:visible,allowed_mentions:{parse:[]},
   components:[...(pages.length>1?[{type:1,components:[{type:2,style:2,label:'◀ Poprzednia',disabled:page===0,custom_id:`report:${userId}:${testMode?'war-test':'war-list'}:${page-1}`},{type:2,style:2,label:'Następna ▶',disabled:page===pages.length-1,custom_id:`report:${userId}:${testMode?'war-test':'war-list'}:${page+1}`}]}]:[]),...promote]};
 }
}
