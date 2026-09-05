const {test} = require('node:test');
const assert = require('node:assert/strict');
const {load} = require('../web/viewer-loader.js');

function fixture(render) {
  let callback, unsubscribed = 0;
  const instance = {
    events: {loadComplete: {subscribe(fn) {callback = fn; return {unsubscribe() {unsubscribed++;}};}}},
    render: render || (() => Promise.resolve())
  };
  return {instance, complete: value => callback(value), clean: () => unsubscribed};
}

test('render completion is not model readiness; even slow loading is accepted', async () => {
  const f = fixture();
  let ready = false;
  const promise = load(f.instance, {}, {}).then(() => {ready = true;});
  await new Promise(resolve => setTimeout(resolve, 3600));
  assert.equal(ready, false);
  f.complete(true);
  await promise;
  assert.equal(f.clean(), 1);
});
test('load failure rejects and unsubscribes', async () => {
  const f = fixture();
  const promise = load(f.instance, {}, {});
  f.complete(false);
  await assert.rejects(promise, /Coordinates/);
  assert.equal(f.clean(), 1);
});
test('timeout is recoverable, not falsely reported as ready', async () => {
  const f = fixture();
  await assert.rejects(load(f.instance, {}, {}, null, 5), /timed out/);
  assert.equal(f.clean(), 1);
});
test('superseded requests detach their listeners', async () => {
  const f = fixture(), controller = new AbortController();
  const promise = load(f.instance, {}, {}, controller.signal);
  controller.abort();
  await assert.rejects(promise, {name:'AbortError'});
  assert.equal(f.clean(), 1);
});
test('synchronous render failures reject', async () => {
  const f = fixture(() => {throw Error('WebGL unavailable');});
  await assert.rejects(load(f.instance, {}, {}), /WebGL/);
  assert.equal(f.clean(), 1);
});
