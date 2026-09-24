const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'web/dashboard.js'), 'utf8');
const source = js.match(/function isTransSpliceosome\(r\)\{[\s\S]*?\n    \}/)[0];
const classify = vm.runInNewContext('(' + source + ')');
test('trans badge identifies trans structures without confusing cis-trans isomerases or transesterification', () => {
 const records=JSON.parse(fs.readFileSync(path.join(root,'data/structures.json'))).records;
 assert.deepEqual(records.filter(classify).map(r=>r.pdb_id).sort(),['9if7','9if8']);
 assert.equal(classify({title:'Cis spliceosome after transesterification'}),false);
 assert.equal(classify({title:'Peptidyl-prolyl cis-trans isomerase'}),false);
 assert.equal(classify({title:'Minor spliceosome'}),false);
});
