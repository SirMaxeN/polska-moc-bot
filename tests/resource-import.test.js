import test from 'node:test';
import assert from 'node:assert/strict';
import { ResourceImport } from '../src/discord/ResourceImport.js';
import { CommandService } from '../src/discord/CommandService.js';
import { Database } from '../src/storage/Database.js';
import { WarCalendar } from '../src/domain/WarCalendar.js';
import { ScoringService } from '../src/domain/ScoringService.js';

const values = {skill_tickets:9880,mount_keys:2840,mounts:5,hammers:11026,pets:28,skill_cost_x5:188,mount_cost:50};
test('scanner import accepts exactly seven bounded numeric fields and rejects unsafe payloads', () => {
  assert.deepEqual(ResourceImport.parse(JSON.stringify(values)),values);
  for (const payload of [null, 'DEMO', '[]', '{}', 'x'.repeat(1025), JSON.stringify({...values,user_id:'other'}), JSON.stringify({...values,pets:-1}), JSON.stringify({...values,mount_cost:0}), JSON.stringify({...values,pets:1.5}), JSON.stringify({...values,pets:'28'}), JSON.stringify({...values,pets:9000000000001}), JSON.stringify({...values,pets:null})]) assert.throws(()=>ResourceImport.parse(payload));
});
test('import updates only invoking guild member, remains private, and malformed input never changes data', async t => {
 const db = new Database(':memory:',new WarCalendar());t.after(()=>db.close());
 const now=new Date('2026-10-24T12:00:00Z');db.ensure('22',now);db.update('22','other','Other',{pets:7},now);
 const service=new CommandService(db,{resources:p=>String(p.pets)},new ScoringService());
 const interaction={type:2,guild_id:'22',member:{user:{id:'11',username:'Alice'}},data:{name:'import',options:[{name:'dane',value:JSON.stringify(values)}]}};
 const reply=await service.handle(interaction,now); assert.equal(reply.data.flags,64);assert.deepEqual(reply.data.allowed_mentions,{parse:[]});assert.equal(db.profile('22','11').pets,28);assert.equal(db.profile('22','other').pets,7);
 interaction.data.options[0].value=JSON.stringify({...values,user_id:'other'});const failed=await service.handle(interaction,now);assert.match(failed.data.content,/7 pól/);assert.equal(db.profile('22','11').pets,28);
});
