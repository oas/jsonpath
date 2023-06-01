var assert = require('assert');
var dict = require('./dict');
var Parser = require('./parser');
var Handlers = require('./handlers');

var JSONPath = function() {
  this.initialize.apply(this, arguments);
};

JSONPath.prototype.initialize = function() {
  this.parser = new Parser();
  this.handlers = new Handlers();
};

JSONPath.prototype.parse = function(string) {
  assert.ok(_is_path(string), "we need a path");
  return this.parser.parse(string);
};

JSONPath.prototype.parent = function(obj, string) {

  assert.ok(typeof obj === 'object', "obj needs to be an object");
  assert.ok(_is_path(string), "we need a path");

  var node = this.nodes(obj, string)[0];
  var key = node.path.pop(); /* jshint unused:false */
  return this.value(obj, node.path);
}

JSONPath.prototype.apply = function(obj, string, fn) {

  assert.ok(typeof obj === 'object', "obj needs to be an object");
  assert.ok(_is_path(string), "we need a path");
  assert.equal(typeof fn, "function", "fn needs to be function")

  var nodes = this.nodes(obj, string).sort(function(a, b) {
    // sort nodes so we apply from the bottom up
    return b.path.length - a.path.length;
  });

  nodes.forEach(function(node) {
    var key = node.path.pop();
    var parent = this.value(obj, this.stringify(node.path));
    var val = node.value = fn.call(obj, parent[key]);
    parent[key] = val;
  }, this);

  return nodes;
}

JSONPath.prototype.delete = function(obj, path) {
	assert.ok(typeof obj === 'object', "obj needs to be an object");
	assert.ok(_is_path(path), "we need a path");

	this._vivify(obj, path, undefined, true);
}

JSONPath.prototype.value = function(obj, path, value) {
  assert.ok(typeof obj === 'object', "obj needs to be an object");
  assert.ok(_is_path(path), "we need a path");

  if (arguments.length >= 3) {
    return this._vivify(obj, path, value, false);
  }
  return this.query(obj, path, 1).shift();
}

JSONPath.prototype._vivify = function (obj, string, value, deleteValue) {
  var self = this;

  assert.ok(typeof obj === 'object', "obj needs to be an object");
  assert.ok(_is_path(string), "we need a path");

  var path = this._detectPath(string);

  const rootElement = path.shift();

  var cursor = obj;
  for (let i = 0; i < path.length; i++) {
    const pathEntry = path[i];
    const pathEntryValue = pathEntry.expression.value;

    if (i === path.length - 1) {
      if(deleteValue === true) {
        delete cursor[pathEntryValue];
        return;
      }

      cursor[pathEntryValue] = value;
      return value;
    }

    var mergedPathEntry = [rootElement, pathEntry];
    var nodes = self.nodes(cursor, mergedPathEntry, 1);
    if(nodes.length > 0) {
      cursor = nodes[0].value;
      continue;
    }
    const nextPathEntryValue = path[i + 1].expression.value;
    cursor[pathEntryValue] = typeof nextPathEntryValue === 'string' ? {} : [];
    cursor = cursor[pathEntryValue];
  }
  assert.ok(false, "should not get here");
}

JSONPath.prototype.query = function (obj, string, count) {

  assert.ok(typeof obj === 'object', "obj needs to be an object");
  assert.ok(_is_path(string), "we need a path");

  var results = this.nodes(obj, string, count)
  .map(function (r) {
    return r.value
  });

  return results;
};

JSONPath.prototype.paths = function(obj, string, count) {

  assert.ok(typeof obj === 'object', "obj needs to be an object");
  assert.ok(_is_path(string), "we need a path");

  var results = this.nodes(obj, string, count)
    .map(function(r) { return r.path });

  return results;
};

JSONPath.prototype.nodes = function(obj, string, count) {

  assert.ok(typeof obj === 'object', "obj needs to be an object");
  assert.ok(_is_path(string), "we need a path");

  if (count === 0) return [];

  var path = this._detectPath(string);
  var handlers = this.handlers;

  var partials = [ { path: ['$'], value: obj } ];
  var matches = [];

  if (path.length && path[0].expression.type == 'root') path.shift();

  if (!path.length) return partials;

  path.forEach(function(component, index) {

    if (matches.length >= count) return;
    var handler = handlers.resolve(component);
    var _partials = [];

    partials.forEach(function(p) {

      if (matches.length >= count) return;
      var results = handler(component, p, count);

      if (index == path.length - 1) {
        // if we're through the components we're done
        matches = matches.concat(results || []);
      } else {
        // otherwise accumulate and carry on through
        _partials = _partials.concat(results || []);
      }
    });

    partials = _partials;

  });

  return count ? matches.slice(0, count) : matches;
};

JSONPath.prototype.stringify = function(path) {
  assert.ok(_is_path(path), "we need a path");

  var string = '$';

  var templates = {
    'descendant-member': '..{{value}}',
    'child-member': '.{{value}}',
    'descendant-subscript': '..[{{value}}]',
    'child-subscript': '[{{value}}]'
  };

  path = this._normalize(path);

  path.forEach(function(component) {

    if (component.expression.type == 'root') return;

    var key = [component.scope, component.operation].join('-');
    var template = templates[key];
    var value;

    if (component.expression.type == 'string_literal') {
      value = JSON.stringify(component.expression.value)
    } else {
      value = component.expression.value;
    }

    if (!template) throw new Error("couldn't find template " + key);

    string += template.replace(/{{value}}/, value);
  });

  return string;
}

JSONPath.prototype._normalize = function(path) {
  assert.ok(_is_path(path), "we need a path");

  if (typeof path == "string") {

    return this.parser.parse(path);

  } else if (Array.isArray(path) && typeof path[0] == "string") {

    var _path = [ { expression: { type: "root", value: "$" } } ];

    path.forEach(function(component, index) {

      if (component == '$' && index === 0) return;

      if (typeof component == "string" && component.match("^" + dict.identifier + "$")) {

        _path.push({
          operation: 'member',
          scope: 'child',
          expression: { value: component, type: 'identifier' }
        });

      } else {

        var type = typeof component == "number" ?
          'numeric_literal' : 'string_literal';

        _path.push({
          operation: 'subscript',
          scope: 'child',
          expression: { value: component, type: type }
        });
      }
    });

    return _path;

  } else if (Array.isArray(path) && typeof path[0] == "object") {

    return path
  }

  throw new Error("couldn't understand path " + path);
}

JSONPath.prototype._detectPath = function(path) {
  if(Array.isArray(path)) {
    if(path.length === 0) {
      return path;
    }

    if(typeof path[0] === 'string') {
      return this.parser.parse(this.stringify(path));
    }

    return path;
  }

  return this.parser.parse(path);
}

function _is_path(path) {
  if(Array.isArray(path)) {
    return true;
  }
  if (typeof path === 'string') {
    return true;
  }
  return false;
}

JSONPath.Handlers = Handlers;
JSONPath.Parser = Parser;

var instance = new JSONPath;
instance.JSONPath = JSONPath;

module.exports = instance;
