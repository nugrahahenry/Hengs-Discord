const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('rollback invokes health inspection through bash for Windows-authored archives', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'deploy/linux/rollback.sh'),
    'utf8',
  );
  assert.match(source, /HEALTH_OUTPUT="\$\(bash "\$\{SCRIPT_DIR\}\/inspect-health\.sh"/);
});

