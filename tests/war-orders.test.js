import test from 'node:test';
import assert from 'node:assert/strict';
import { WarCalendar } from '../src/domain/WarCalendar.js';
import { Database } from '../src/storage/Database.js';
import { ScoringService } from '../src/domain/ScoringService.js';
import { ReportService } from '../src/discord/ReportService.js';
import { CommandService } from '../src/discord/CommandService.js';
import { WarOrders } from '../src/discord/WarOrders.js';
const now = new Date('2026-10-14T10:00:00Z');
test('war orders require configured roles, owner and current access; publish only the test role', async t => {
  const calendar=new WarCalendar(), scoring=new ScoringService(), db=new Database(':memory:',calendar);
  t.after(()=>db.close());
  const commands=new CommandService(db,new ReportService(calendar,scoring),scoring);
  const base={id:'orders1',guild_id:WarOrders.testGuild,member:{user:{id:'11',username:'Test'},roles:[WarOrders.testRole],permissions:'0'}};
  const command=(name,sub,admin=false)=>({...base,type:2,member:{...base.member,permissions:admin?'8':'0'},data:{name,options:sub?[{name:sub}]:[]}});
  assert.match((await commands.handle(command('ping'),now)).data.content,/Nie masz roli/);
  assert.match((await commands.handle(command('ping-setup'),now)).data.content,/administrator/);
  const setup=await commands.handle(command('ping-setup',undefined,true),now);
  assert.equal(setup.data.flags,64);
  const select={...base,type:3,member:{...base.member,permissions:'8'},data:{custom_id:'orders:11:setup',values:[WarOrders.testRole]}};
  await commands.handle(select,now);
  assert.deepEqual(db.pingRoles(base.guild_id),[WarOrders.testRole]);
  for (const permissions of ['0','8']) {
    const denied = await commands.handle({...command('ping'),member:{...base.member,roles:['1540267344209907799'],permissions}},now);
    assert.match(denied.data.content,/Nie masz roli/);
    assert.equal(denied.data.flags,64);
  }
  const menu=await commands.handle(command('ping'),now);
  assert.equal(menu.data.flags,64);
  assert.equal(menu.data.components.length,5);
  const buttons=menu.data.components.flatMap(row=>row.components);
  assert.equal(buttons.length,13);
  assert.equal(new Set(buttons.map(button=>button.custom_id)).size,13);
  const click={...base,type:3,data:{custom_id:buttons[0].custom_id}};
  const outsider=await commands.handle({...click,member:{...base.member,user:{id:'99'}}},now);
  assert.match(outsider.data.content,/innego gracza/);
  const revoked=await commands.handle({...click,member:{...base.member,roles:[]}},now);
  assert.match(revoked.data.content,/Nie masz roli/);
  const sent=await commands.handle(click,now);
  assert.equal(sent.data.flags,0);
  assert.equal(sent.data.content,`<@&${WarOrders.testRole}>`);
  assert.deepEqual(sent.data.allowed_mentions,{parse:[],roles:[WarOrders.testRole]});
  assert.equal((await commands.handle(click,now)).data.flags,0);
  for (const [index,button] of buttons.entries()) {
    const result=await commands.handle({...click,data:{custom_id:button.custom_id}},now);
    assert.equal(result.data.flags,0);
    assert.ok(!JSON.stringify(result.data).includes('@everyone'));
  }
  db.setPingRoles(base.guild_id,[]);
  assert.match((await commands.handle(click,new Date(now.getTime()+200000))).data.content,/Nie masz roli/);
  assert.throws(()=>db.setPingRoles(base.guild_id,[base.guild_id]));
  assert.equal(db.pingRoles('33').length,0);
  assert.match((await commands.handle(command('hello'),now)).data.content,/administrator/);
  const hello=await commands.handle(command('hello',undefined,true),now);
  assert.equal(hello.data.flags,0);
  assert.match(hello.data.embeds[0].description, /Kliknij \*\*Start\*\* pod tą wiadomością/);
  assert.match(hello.data.embeds[0].image.url,/banner.png$/);
  assert.deepEqual(hello.data.allowed_mentions,{parse:[]});
});

test('recipient configuration is admin-only, singular, guild-scoped and used by already-open order buttons', async t => {
  const calendar=new WarCalendar(), scoring=new ScoringService(), db=new Database(':memory:',calendar);
  t.after(()=>db.close());
  const commands=new CommandService(db,new ReportService(calendar,scoring),scoring);
  const base={id:'recipient1',guild_id:WarOrders.testGuild,member:{user:{id:'11',username:'Test'},roles:[WarOrders.testRole],permissions:'8'},app_permissions:'131072'};
  const invoke=member=>commands.handle({...base,type:2,member,data:{name:'ping-role-setup'}},now);
  assert.match((await invoke({...base.member,permissions:'0'})).data.content,/administrator/);
  const setup=await invoke(base.member);
  assert.equal(setup.data.flags,64);
  assert.equal(setup.data.components[1].components[0].max_values,1);
  db.setPingRoles(base.guild_id,[WarOrders.testRole]);
  const click={...base,type:3,data:{custom_id:'orders:11:fight'}};
  const select=(action,values,member=base.member)=>commands.handle({...base,type:3,member,data:{custom_id:`orders:11:${action}`,values}},now);
  const role='1540267344209907799';
  await select('target-role',[role],{...base.member,permissions:'0'});
  assert.equal(db.pingTarget(base.guild_id),undefined);
  await select('target-role',[role]);
  let result=await commands.handle(click,now);
  assert.equal(result.data.content,`<@&${role}>`);
  assert.deepEqual(result.data.allowed_mentions,{parse:[],roles:[role]});
  assert.deepEqual(db.pingRoles(base.guild_id),[WarOrders.testRole]);
  await select('target-role',[role,WarOrders.testRole]);
  assert.equal(db.pingTarget(base.guild_id).role_id,role);
  await select('target-role',[base.guild_id]);
  assert.equal(db.pingTarget(base.guild_id).role_id,role);
  for (const mode of ['everyone','here']) {
    await select('target-mode',[mode]);
    result=await commands.handle(click,now);
    assert.equal(result.data.content,`@${mode}`);
    assert.deepEqual(result.data.allowed_mentions,{parse:['everyone']});
    assert.equal(result.data.flags,0);
    assert.match((await commands.handle({...click,app_permissions:'0'},now)).data.content,/Bot nie ma/);
  }
  await select('target-mode',['invalid']);
  assert.equal(db.pingTarget(base.guild_id).kind,'here');
  assert.equal(db.pingTarget('33'),undefined);
  const sunday=new Date('2026-10-18T00:00:00Z');
  db.snapshot(base.guild_id,sunday);
  assert.equal(db.pingTarget(base.guild_id).kind,'here');
});

test('public hello buttons open private help/start for each clicking member', async t => {
  const calendar=new WarCalendar(), scoring=new ScoringService(), db=new Database(':memory:',calendar);
  t.after(()=>db.close());
  const commands=new CommandService(db,new ReportService(calendar,scoring),scoring);
  const guild_id=WarOrders.testGuild;
  const hello=await commands.handle({type:2,guild_id,member:{user:{id:'11'},permissions:'8'},data:{name:'hello'}},now);
  const buttons=hello.data.components[0].components;
  assert.equal(hello.data.flags,0);
  assert.match(hello.data.embeds[0].description, /Kliknij \*\*Start\*\* pod tą wiadomością/);
  assert.equal(buttons.length,2);
  for (const id of ['22','33']) for (const button of buttons) {
    const result=await commands.handle({type:3,guild_id,member:{user:{id},permissions:'0'},data:{custom_id:button.custom_id}},now);
    assert.equal(result.type,4);
    assert.equal(result.data.flags,64);
    assert.ok(result.data.components.flatMap(row=>row.components).some(component=>component.custom_id===`resources:${id}:open`));
  }
});
