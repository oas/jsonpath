const JSONPath = require('../');
const assert = require("assert");
const data = require("./data/store.json");

suite('delete', function() {
  test('delete', function() {
    const data = {a: 1, b: 2, c: 3, z: {a: 100, b: 200}};
    JSONPath.delete(data, '$.a');
    assert.deepEqual(data, {b: 2, c: 3, z: {a: 100, b: 200}});
  });
});
