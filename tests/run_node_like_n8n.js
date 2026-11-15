const vm = require('node:vm');

// n8n runs Code nodes in a vm context without web globals such as URL (seen in execution 343, 2026-11-16)
function runNodeLikeN8n(workflow, nodeName, items, { httpRequest, nodeOutputs = {} } = {}) {

  const node = workflow.nodes.find((candidate) => candidate.name === nodeName);
  const context = vm.createContext({ require, console, setTimeout: (resolve) => resolve() });
  const nodeFunction = vm.runInContext(`(async function ($input, $) {\n${node.parameters.jsCode}\n})`, context);
  const readNode = (name) => ({ all: () => nodeOutputs[name] || [], isExecuted: name in nodeOutputs });
  return nodeFunction.call({ helpers: { httpRequest } }, { all: () => items }, readNode);
}

module.exports = { runNodeLikeN8n };
