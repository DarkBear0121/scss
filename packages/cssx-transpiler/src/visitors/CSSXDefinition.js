var isArray = require('../helpers/isArray');
var injectAt = require('../helpers/injectAt');
var getID = require('../helpers/randomId');
var t = require('babel-types');
var isIgnored = require('../core/traverse').isIgnored;

var updateStyleSheet = function (node, stylesheetId, options) {
  var key, i;

  if (
    node && node.type === 'CallExpression' &&
    node.callee && node.callee.type === 'MemberExpression' &&
    node.callee.object && node.callee.object.name === 'cssx'
  ) {
    node.callee.object.name = stylesheetId;
  } else if (
    options.format === 'object' && node && node.type === 'AssignmentExpression' &&
    node.left && node.left.type === 'MemberExpression' &&
    node.left.object && node.left.object.name === 'cssx'
  ) {
    node.left.object.name = stylesheetId;
  } else {
    if (isArray(node)) {
      for (i = 0; i < node.length; i++) {
        updateStyleSheet(node[i], stylesheetId, options);
      }
    } else {
      for (key in node) {
        if (!isIgnored(key)) {
          if (typeof node[key] === 'object') {
            updateStyleSheet(node[key], stylesheetId, options);
          }
        }
      }
    }
  }
  return node;
};

var checkForStyleDefinition = function (node) {
  return node.body &&
    node.body.length === 1 &&
    node.body[0].type === 'CallExpression' &&
    node.body[0].callee && node.body[0].callee.name === 'cssx' &&
    node.body[0].arguments && node.body[0].arguments.length === 1 &&
    node.body[0].arguments[0].type === 'Identifier';
};

var funcLines, objectLiterals, stylesheetId;

module.exports = {
  enter: function (node, parent, index, context) {
    funcLines = [];
    objectLiterals = [];
    stylesheetId = getID();
    context.addToCSSXSelfInvoke = function (item, parent) {
      funcLines = [item].concat(funcLines);
      if (item.type === 'VariableDeclaration') {
        objectLiterals.push({
          selector: parent.selector.value ? t.stringLiteral(parent.selector.value) : parent.selector,
          rulesObjVar: item.declarations[0].id.name
        });
      }
    };
  },
  exit: function (node, parent, index, context) {
    var rulesRegistration;
    var newStylesheetExpr;
    var createSelfInvoke;
    var funcExpr;
    var funcCallExpr;
    var result;
    var options = this.options;

    var applyResult = function (r) {
      if (isArray(parent)) {
        injectAt(parent, index, r);
      } else {
        parent[index] = r;
      }
    };

    delete context.addToCSSXSelfInvoke;

    if (node.body.length === 0) {
      delete parent[index];
      return;
    }

    // make sure that we keep the stylesheet definitions
    if (checkForStyleDefinition(node)) {
      applyResult(node.body[0]);
      return;
    }

    newStylesheetExpr = t.variableDeclaration(
      'var',
      [
        t.variableDeclarator(
          t.identifier(stylesheetId),
          this.options.format === 'object' ? t.objectExpression([]) : t.arrayExpression()
        )
      ]
    );

    rulesRegistration = node.body.map(function (line) {
      line = updateStyleSheet(line, stylesheetId, options);
      if (line.type === 'CallExpression') {
        line = t.expressionStatement(updateStyleSheet(line, stylesheetId, options));
      }
      return line;
    });

    // styles for only one rule
    if (
      objectLiterals.length >= 1 &&
      (typeof objectLiterals[0].selector === 'object' ?
        objectLiterals[0].selector.value === '' :
        objectLiterals[0].selector === '')
    ) {
      funcLines.push(t.returnStatement(t.identifier(objectLiterals[0].rulesObjVar)));
    } else {
      funcLines.push(newStylesheetExpr);
      funcLines = funcLines.concat(rulesRegistration);
      funcLines.push(t.returnStatement(t.identifier(stylesheetId)));
    }

    createSelfInvoke = function (expr) { return t.parenthesizedExpression(expr); };

    // wrapping up the self-invoke function
    funcExpr = t.functionExpression(null, [], t.blockStatement(funcLines));
    funcCallExpr = t.callExpression(
      t.memberExpression(funcExpr, t.identifier('apply')),
      [t.thisExpression()]
    );

    result = createSelfInvoke(funcCallExpr);

    applyResult(result);
  }
};
