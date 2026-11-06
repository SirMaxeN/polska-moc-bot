import { rebalanceWarAlternatives } from '../domain/WarAlternatives.js';
import { planHybridWar } from '../domain/WarSimulation.js';
/** Detailed power-based report. Probabilities are reserved for actual combat simulations. */
export class WarReport {
 static clean(value) { return String(value).replace(/[\\`*_~|<>@\[\]#]/g,'').replace(/[\u0000-\u001f\u007f]/g,' ').trim(); }
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
 static render(row,userId,page=0,testMode=false) {
  const p=JSON.parse(row.payload),simulated=p.plan.type==='simulation',clean=this.clean;
  const plan=simulated?planHybridWar(p.plan,p.ours,p.enemies,p.own_bonus,p.enemy_bonus):rebalanceWarAlternatives(p.plan,p.ours,p.enemies,p.own_bonus,p.enemy_bonus);
  const allies=new Map(p.ours.map(x=>[x.name,x])),enemies=new Map(p.enemies.map(x=>[x.name,x]));
  const ownBonus=p.own_bonus,enemyBonus=p.enemy_bonus;
  const boost=b=>Math.sqrt((1+b.damage/100)*(1+b.health/100));
  const ownBoost=boost(ownBonus),enemyBoost=boost(enemyBonus);
  const unique=plan.assignments.filter(x=>x.main&&!x.shared).length;
  const shared=plan.assignments.filter(x=>x.shared).length,unmatched=plan.assignments.filter(x=>!x.main).length;
  const clan=(name,members)=>`${clean(name??'Klan')} · **${members.length} osób**\nMoc łącznie: **${this.power(members.reduce((n,x)=>n+x.power,0))}**`;
  const bonus=b=>`⚔️ +${this.number(b.damage)}% obrażeń · ❤️ +${this.number(b.health)}% zdrowia`;
  const summary={title:`⚔️ Przygotowanie do bitwy wojennej · ${testMode?'TEST':row.war_day}`,color:0x61d6ac,
   description:`${testMode?'🧪 **TEST — bonusy przeciwnika przyjęte takie jak nasze.**\n':''}${simulated?'🧬 **Przydział na podstawie symulacji i mocy.** Szanse pochodzą z modelu walki. Gdy wyniku brak, cel dobieramy według mocy z bonusami wojennymi.':'Ranking orientacyjny według mocy i bonusów wojennych. **To nie jest symulacja szans wygranej.**'}`,
   fields:[{name:'🛡️ Nasz klan',value:clan(p.own_clan,p.ours),inline:true},{name:'⚔️ Przeciwnicy',value:clan(p.enemy_clan,p.enemies),inline:true},
    {name:'Nasze bonusy',value:bonus(ownBonus),inline:false},{name:'Bonusy rywali',value:bonus(enemyBonus),inline:false},
    {name:'Przydział celów',value:`🟢 Unikalne: **${unique}** · 🟠 Wspólne: **${shared}** · 🔴 Bez celu: **${unmatched}**\n⛔ Za mocni według modelu: **${plan.tooStrong.length}**`,inline:false}]};
  if(simulated)summary.fields.push({name:'Kompletność symulacji',value:`Profile: **${plan.completeOurs}/${p.ours.length}** + **${plan.completeEnemies}/${p.enemies.length}** · ocenione pary: **${plan.validPairs}/${plan.pairs}**\nGłówne cele według mocy: **${plan.powerTargets}** · oczekiwane wygrane par z symulacji: **${this.number(plan.expectedWins,1)}**`});
  const label=name=>`${clean(name)} · ${this.power(enemies.get(name).power)}`;
  const plain=[`PRZYGOTOWANIE DO BITWY WOJENNEJ — ${row.war_day}`,
   `${clean(p.own_clan??'Nasz klan')} (${p.ours.length}) → ${clean(p.enemy_clan??'Rywal')} (${p.enemies.length})`,
   `Nasz klan: ${bonus(ownBonus)}; rywal: ${bonus(enemyBonus)}`,
   testMode?'TEST: bonusy rywala przyjęto takie jak nasze.':'',
   simulated?`Metoda: ${plan.method} Model: ${plan.model}. Dodatkowy bonus mistrzostwa poza widoczną listą: 0%, jeśli nie poprawiono go ręcznie.`:'Metoda: moc × √((1 + obrażenia/100) × (1 + zdrowie/100)). Przewaga porównuje ten wskaźnik obu graczy.',
   simulated?`Profile: ${plan.completeOurs}/${p.ours.length} + ${plan.completeEnemies}/${p.enemies.length}; ocenione pary ${plan.validPairs}/${plan.pairs}.`:'To ranking orientacyjny, nie symulacja prawdopodobieństwa wygranej.',
   `Unikalne cele: ${unique}; wspólne: ${shared}; bez celu: ${unmatched}.`,''];
  const blocks=plan.assignments.map((a,index)=>{
   const player=allies.get(a.name),target=a.main?enemies.get(a.main):null;
   const advantage=target?((player.power*ownBoost)/(target.power*enemyBoost)-1)*100:null;
   const mainResult=a.matchups?.find(x=>x.name===a.main);
   const powerDelta=advantage==null?'':`${advantage>=0?'+':''}${this.number(advantage,1)}% wskaźnika mocy`;
   const delta=simulated&&a.mainSource!=='power'?this.chance(mainResult,true):powerDelta;
   const alternativeChance=(name,detail=false)=>{const m=a.matchups?.find(x=>x.name===name);return m?.error?'wg mocy':this.chance(m,detail);};
   const marker=!a.main?'🔴':a.shared?'🟠':'🟢';
   const title=`${String(index+1).padStart(2,'0')}. ${clean(a.name)} · ${this.power(player.power)}`;
   const note=!target?(simulated?a.note:'Brak celu z przewagą według mocy'):a.shared?'Wspólny cel — brak wolnej unikalnej pary':'';
   const main=target?`${label(a.main)} · ${delta}`:note;
   plain.push(`${marker} ${title}`,`   Moc z gry: ${this.number(player.power,0)}`,`   Główny cel: ${main}`);
   if(simulated) {
    const source=p.profiles?.ours?.[index];
    if(source)plain.push(`   Profil: obrażenia ${this.number(source.damage,0)}; zdrowie ${this.number(source.health,0)}; broń ${source.ranged?'dystans':'wręcz'}; zwierzaki ${source.pets}; wierzchowiec ${source.mounted?'tak':'nie'}; wróżka ${source.fairy.present===false?'brak':clean(source.fairy.type)+' poz. '+source.fairy.level}`);
   }
   if(target)plain.push(`   Moc celu z gry: ${this.number(target.power,0)}`);
   if(note&&target)plain.push(`   ${note}`);
   a.alternatives.forEach((name,i)=>plain.push(`   Alternatywa ${i+1}: ${label(name)} (moc z gry: ${this.number(enemies.get(name).power,0)})${simulated?' · '+alternativeChance(name,true):''}`));
   if(!a.alternatives.length)plain.push('   Alternatywy: brak');
   plain.push('');
   return {title:'🎯 Cele główne i alternatywy',color:0x61d6ac,text:`${marker} **${title}**\n🎯 ${target?`**${clean(a.main)}** · **${this.power(target.power)}** · ${delta}`:note}${a.shared?'\n🟠 Wspólny cel':''}${a.alternatives.length?'\n↳ '+a.alternatives.map(name=>label(name)+(simulated?' · '+alternativeChance(name):'' )).join(' · '):''}`};
  });
  plain.push(simulated?'PRZECIWNICY BEZ KORZYSTNEJ PARY WEDŁUG SYMULACJI':'PRZECIWNICY ZA MOCNI DLA WSZYSTKICH WEDŁUG MOCY');
  if(!plan.tooStrong.length)plain.push('Brak.');
  for(const name of plan.tooStrong) {
   plain.push(`${label(name)} (moc z gry: ${this.number(enemies.get(name).power,0)})`);
   blocks.push({title:'⛔ Brak celu z przewagą po naszej stronie',color:0xed4245,text:`**${label(name)}**`});
  }
  if(simulated) {
   plain.push('','WSZYSTKIE PARY — WYGRANE / PORAŻKI / REMISY');
   for(const a of plan.assignments)for(const result of a.matchups)plain.push(`${clean(a.name)} → ${clean(result.name)}: ${result.error?'BRAK OCENY — '+clean(result.error):`${this.chance(result,true)} · ${result.wins}/${result.losses}/${result.draws}`}`);
   const causes=new Map();
   for(const a of plan.assignments)for(const m of a.matchups)if(m.error)causes.set(m.error,(causes.get(m.error)??0)+1);
   if(causes.size) {
    const counts=[...causes].sort((x,y)=>y[1]-x[1]);
    plain.push('','PRZYCZYNY BRAKU SYMULACJI',...counts.map(([reason,count])=>`${count} par · ${clean(reason)}`));
    summary.fields.push({name:'Przyczyny braku symulacji',value:counts.slice(0,4).map(([reason,count])=>`**${count}** par · ${clean(reason).slice(0,155)}`).join('\n')});
   }
  }
  // Fit all rows when possible; otherwise edit pages of this same Discord message.
  const pages=[];let embeds=[],used=this.length(summary);
  for(const block of blocks) {
   let last=embeds.at(-1),append=last?.title===block.title&&last.description.length+block.text.length+2<=4096;
   const cost=block.text.length+(append?2:block.title.length);
   if(used+cost>5850||(!append&&embeds.length>=8)) {pages.push(embeds);embeds=[];used=this.length(summary);last=null;append=false;}
   if(append)last.description+='\n\n'+block.text;
   else embeds.push({title:block.title,color:block.color,description:block.text});
   used+=block.text.length+(append?2:block.title.length);
  }
  if(embeds.length)pages.push(embeds);
  if(!pages.length)pages.push([]);
  page=Math.min(Math.max(0,Number.isFinite(page)?Math.trunc(page):0),pages.length-1);
  const visible=[structuredClone(summary),...pages[page]];
  visible.at(-1).footer={text:`Strona ${page+1}/${pages.length} · 🎯 cel główny · ↳ do 2 zróżnicowanych alternatyw · ${simulated?'szacunki eksperymentalnego modelu':'przewaga dotyczy wskaźnika, nie szans wygranej'}`};
  return {content:'📎 **Pełna lista wszystkich graczy, mocy, celów i alternatyw jest w załączonym pliku.**',embeds:visible,allowed_mentions:{parse:[]},
   files:[{name:`lista-wojenna-${testMode?'TEST':row.war_day}.txt`,data:Buffer.from('\ufeff'+plain.join('\n'),'utf8'),contentType:'text/plain; charset=utf-8'}],
   components:pages.length>1?[{type:1,components:[{type:2,style:2,label:'◀ Poprzednia',disabled:page===0,custom_id:`report:${userId}:${testMode?'war-test':'war-list'}:${page-1}`},{type:2,style:2,label:'Następna ▶',disabled:page===pages.length-1,custom_id:`report:${userId}:${testMode?'war-test':'war-list'}:${page+1}`}]}]:[]};
 }
}
