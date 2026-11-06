import test from 'node:test';
import assert from 'node:assert/strict';
import { WarReport } from '../src/discord/WarReport.js';
import { matchWar } from '../src/domain/WarPreparation.js';
import { discordMessageBody } from '../src/http/DiscordMessageBody.js';
import { InteractionServer } from '../src/http/InteractionServer.js';
import { generateKeyPairSync } from 'node:crypto';
import { CommandService } from '../src/discord/CommandService.js';

function row(ours,enemies,extra={}) {
 return {war_day:'TEST',payload:JSON.stringify({ours,enemies,own_clan:'PolskaMOC',enemy_clan:'Rywal',own_bonus:{damage:20,health:10},enemy_bonus:{damage:20,health:10},plan:matchWar(ours,enemies),...extra})};
}
test('short report: one line per player with a unique rival, chance or power and alternatives, posts only',()=>{
 const r=row([{name:'Strong',power:1.23e9},{name:'Second',power:1.2e9},{name:'Shared',power:1.1e9},{name:'Weak',power:1}],
  [{name:'One',power:1e9},{name:'Two',power:900e6},{name:'TooStrong',power:9e9},{name:'Three',power:800e6}]);
 const view=WarReport.render(r,'u',0,true),text=view.embeds.map(e=>e.description).join('\n');
 assert.equal(view.files,undefined);assert.deepEqual(view.allowed_mentions,{parse:[]});
 assert.match(text,/Format: \*\*gracz\*\* → \*\*przeciwnik\*\*/);
 const lines=text.split('\n').filter(l=>/→ \*\*/.test(l)&&!l.startsWith('Format'));
 assert.equal(lines.length,4);
 const targets=lines.map(l=>l.match(/→ \*\*([^*]+)\*\*/)[1]);
 assert.equal(new Set(targets).size,4,'every player gets a distinct rival');
 assert.match(text,/\*\*Weak\*\* → \*\*[^*]+\*\* \(moc -/);
});
test('all fifty long unicode names survive Discord limits without attachments',()=>{
 const ours=Array.from({length:50},(_,i)=>({name:`Nasi${i}_${'Ł'.repeat(70)}`,power:1e12+i}));
 const enemies=Array.from({length:50},(_,i)=>({name:`Rywale${i}_${'Ż'.repeat(68)}`,power:1e6+i}));
 const r=row(ours,enemies),first=WarReport.render(r,'u',0,true);
 const pages=first.embeds.at(-1).footer?Number(first.embeds.at(-1).footer.text.match(/Strona 1\/(\d+)/)[1]):1;
 const seen=[];
 for(let i=0;i<pages;i++) {
  const view=WarReport.render(r,'u',i,true);
  assert.equal(view.files,undefined);assert.ok(view.embeds.length<=10);
  assert.ok(view.embeds.reduce((n,e)=>n+WarReport.length(e),0)<=6000);
  view.embeds.forEach(e=>assert.ok((e.description?.length??0)<=4096));
  seen.push(...view.embeds.map(e=>e.description));
 }
 for(const player of ours)assert.ok(seen.join('\n').includes(WarReport.clean(player.name)));
});
test('hostile names cannot mention players or inject markdown into the visual report',()=>{
 const view=WarReport.render(row([{name:'@everyone **Admin**\n<@123>',power:100}],[{name:'`enemy`',power:50}]),'u');
 assert.deepEqual(view.allowed_mentions,{parse:[]});
 assert.doesNotMatch(JSON.stringify(view.embeds),/@everyone|<@123>|\*\*Admin\*\*/);
});
test('multipart attachment keeps every UTF-8 byte and resets attachments on an original-message edit',async()=>{
 const bytes=Buffer.from('\ufeffŁódź — cała lista\n','utf8');
 const result=discordMessageBody({content:'Raport',files:[{name:'lista.txt',data:bytes,contentType:'text/plain; charset=utf-8'}],allowed_mentions:{parse:[]}});
 assert.ok(result.body instanceof FormData);assert.equal(result.headers,undefined);
 const payload=JSON.parse(result.body.get('payload_json'));assert.deepEqual(payload.attachments,[{id:0,filename:'lista.txt'}]);assert.equal(payload.files,undefined);
 assert.deepEqual(Buffer.from(await result.body.get('files[0]').arrayBuffer()),bytes);
 assert.throws(()=>discordMessageBody({files:[{name:'../secret',data:bytes}]}),/Invalid/);
 assert.equal(discordMessageBody({content:'Normal'}).headers['Content-Type'],'application/json');
});
test('slash and page attachment replies defer and edit the original once, never create additional posts',async()=>{
 const {publicKey}=generateKeyPairSync('ed25519'),key=publicKey.export({type:'spki',format:'der'}).subarray(-32).toString('hex');
 const server=new InteractionServer(key,{},'123');
 const data={content:'Raport',files:[{name:'lista.txt',data:Buffer.from('all players')}],flags:64};
 for(const type of [4,7]) {
  const ready=await server.prepareResult({type,data});
  assert.deepEqual(ready.response,type===7?{type:6}:{type:5,data:{flags:64}});
  assert.equal(ready.followUps,undefined);assert.equal(await ready.complete(),data);
 }
});

test('webhook delivery uploads the full file by editing the original private report',async t=>{
 const {publicKey}=generateKeyPairSync('ed25519'),key=publicKey.export({type:'spki',format:'der'}).subarray(-32).toString('hex');
 const server=new InteractionServer(key,{},'123');let calls=0;
 t.mock.method(globalThis,'fetch',async(url,init)=>{
  calls++;assert.match(url,/\/messages\/@original$/);assert.equal(init.method,'PATCH');assert.ok(init.body instanceof FormData);
  const payload=JSON.parse(init.body.get('payload_json'));assert.deepEqual(payload.allowed_mentions,{parse:[]});
  assert.equal(payload.attachments.length,1);assert.equal(payload.files,undefined);
  assert.equal(await init.body.get('files[0]').text(),'wszyscy gracze');
  return {ok:true};
 });
 await server.followUp({token:'fixture'},{content:'Raport',files:[{name:'lista.txt',data:Buffer.from('wszyscy gracze')}],allowed_mentions:{parse:[]}});
 assert.equal(calls,1);
});

test('reports without attachments are delivered unchanged regardless of attachment permission',()=>{
 const context={reply:CommandService.prototype.reply};
 const view=WarReport.render(row([{name:'A',power:100}],[{name:'B',power:90}]),'u');
 const reply=permissions=>CommandService.prototype.warReportReply.call(context,view,{app_permissions:permissions},7);
 assert.equal(reply('0').data.files,undefined);assert.deepEqual(reply('0').data.embeds,view.embeds);
});
