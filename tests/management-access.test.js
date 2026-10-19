import test from 'node:test';
import assert from 'node:assert/strict';
import { Database } from '../src/storage/Database.js';
import { WarCalendar } from '../src/domain/WarCalendar.js';
import { ScoringService } from '../src/domain/ScoringService.js';
import { ReportService } from '../src/discord/ReportService.js';
import { CommandService } from '../src/discord/CommandService.js';
import { CommandRegistrar } from '../src/discord/CommandRegistrar.js';

const now = new Date('2026-10-15T12:00:00Z');
const guild = '1540254259348512848', role = '1540267344209907732';
test('management roles authorize every former admin entry point, recheck components, and remain separate from ping', async t => {
  const calendar = new WarCalendar(), scoring = new ScoringService(), db = new Database(':memory:', calendar);
  t.after(() => db.close());
  const service = new CommandService(db, new ReportService(calendar, scoring), scoring);
  const user = (roles = [], permissions = '0', id = '11') => ({ user: { id, username: 'Manager' }, roles, permissions });
  const command = (name, options = [], member = user()) => ({ id: 'test', type: 2, guild_id: guild, member, data: { name, options } });
  const click = (custom_id, values, member = user([role])) => ({ type: 3, guild_id: guild, member, data: { custom_id, values } });
  const privileged = [['hello', []], ['setup', []], ['delete', []], ['tech', [{ name: 'update' }]], ['tech', [{ name: 'reset' }]], ['season', [{ name: 'reset', options: [{ name: 'confirmation', value: 'byebyeseason' }] }]]];
  for (const [name, options] of privileged) {
    assert.match((await service.handle(command(name, options), now)).data.content, /administrator/);
  }
  const admin = user([], '8');
  const setup = await service.handle(command('setup', [], admin), now);
  assert.ok(setup.data.components.flatMap(row => row.components).some(button => button.custom_id === 'setup:11:management'));
  const saved = await service.handle(click('setup:11:save-management', [role], admin), now);
  assert.match(saved.data.content, /Zapisano role/);
  assert.deepEqual(db.managementRoles(guild), [role]);
  assert.deepEqual(db.managementRoles('33'), []);
  for (const [name, options] of privileged) {
    const response = await service.handle(command(name, options, user([role])), now);
    assert.doesNotMatch(response.data?.content ?? '', /tylko dla administratora/);
    assert.ok(response.type || response.response);
    if (name === 'season') assert.equal(response.response.type, 5); // Never execute the destructive completion here.
  }
  assert.match((await service.handle(command('season', [{ name: 'reset', options: [{ name: 'confirmation', value: 'wrong' }] }], user([role])), now)).data.content, /BYEBYESEASON/);
  assert.match((await service.handle(command('ping', [], user([role])), now)).data.content, /roli uprawnionej/);
  db.setPingRoles(guild, [role]);
  db.setManagementRoles(guild, []);
  assert.match((await service.handle(command('setup', [], user([role])), now)).data.content, /administrator/);
  assert.ok((await service.handle(command('ping', [], user([role])), now)).data.embeds);
  db.setManagementRoles(guild, [role]);
  const panel = await service.handle(click('setup:11:management'), now);
  assert.equal(panel.data.components[0].components[0].type, 6);
  assert.equal(panel.data.flags, undefined); // Existing private panel is updated in place.
  assert.match((await service.handle(click('setup:11:save-management', [], user([role], '0', '22')), now)).data.content, /innego gracza/);
  db.setManagementRoles(guild, []);
  for (const action of ['setup:11:save-management', 'setup:11:save-channel', 'orders:11:setup', 'orders:11:target-mode', 'tech:11:reset', 'delete:11:page:stale:0']) {
    assert.match((await service.handle(click(action, [role]), now)).data.content, /administrator/, 'Old panels must not retain revoked management access');
  }
  assert.ok((await service.handle(command('setup', [], admin), now)).data.components);
  for (const invalid of [[guild], ['invalid'], Array(11).fill(role), null]) assert.throws(() => db.setManagementRoles(guild, invalid));
  for (const name of ['hello', 'setup', 'delete', 'season']) {
    const definition = CommandRegistrar.definitions().find(item => item.name === name);
    assert.equal(definition.default_member_permissions, null, 'Discord must allow configured non-admin roles to invoke the guarded handler');
    assert.match(definition.description, /admin only/);
  }
  assert.match(CommandRegistrar.definitions().find(item => item.name === 'season').options[0].description, /admin only/);
});
