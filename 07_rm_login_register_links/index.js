const assert = require('node:assert');
const fs = require('node:fs');
const {JSDOM} = require('jsdom');

const util = require('../util.js');

const main = async function() {
  const files = process.argv.slice(2);
  const lastFixup = {};

  for (const file of files) {
    console.log(file);

    const inputhtml = fs.readFileSync(file, 'utf8');
    const {window} = new JSDOM(inputhtml);
    const {document} = window;

    let targetNode = Array.from(document.querySelectorAll('a[href="/login"]'));
    assert(targetNode.length === 1);
    [targetNode] = targetNode;

    targetNode = targetNode.closest('ul.navbar-nav');
    const deletionRaw = util.expandHTMLs(
        targetNode, 'previous', (node) => node.tagName === 'HR');
    const deletion = await util.findWithFixup(
        inputhtml, deletionRaw, lastFixup);

    const outputhtml = inputhtml.replace(
        new RegExp(util.makeRegexForLine(deletion)), '');
    assert(outputhtml !== inputhtml);

    fs.writeFileSync(file, outputhtml);
  }

  return 0;
};

if (require.main === module) {
  main().then(process.exit);
}
