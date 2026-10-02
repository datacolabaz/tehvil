import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRailwayContext, project } from 'railway/iac';
import configuration from './railway';

for (const [environment, branch, suffix] of [['production', 'main', ''], ['staging', 'develop', '-staging']] as const) {
  test(`${environment} keeps both service branches aligned and R2 backend-only`, async () => {
    const graph = await configuration(createRailwayContext({ environment, projectName: 'tehvil' }), project);
    const serialized = JSON.stringify(graph);
    assert.equal((serialized.match(new RegExp(`"branch":"${branch}"`, 'g')) || []).length, 2);
    assert.ok(serialized.includes(`tehvil-web${suffix}`));
    assert.ok(serialized.includes(`tehvil-api${suffix}`));
    assert.equal(JSON.parse(serialized).resources[0].variables.R2_REGION.value, 'auto');
    assert.equal((serialized.match(/"R2_SECRET_ACCESS_KEY"/g) || []).length, 1);
    assert.equal((serialized.match(/"DATABASE_URL"/g) || []).length, 1);
    assert.ok(!serialized.includes('"branch":"frontend"'));
    assert.ok(!serialized.includes('"branch":"backend"'));
  });
}
test('unknown environments cannot silently use production', async () => {
  await assert.rejects(async () => configuration(createRailwayContext({ environment: 'preview' }), project), /production or staging/);
});