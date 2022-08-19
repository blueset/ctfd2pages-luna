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

    let deleteNode = Array.from(document.querySelectorAll('input'))
        .filter((node) => node.attributes.placeholder
            ?.value?.startsWith('Search for matching '));

    assert(deleteNode.length === 1);
    [deleteNode] = deleteNode;

    deleteNode = deleteNode.closest('div.row');
    const deletion = util.expandHTMLs(
        deleteNode, 'next', (node) => node.tagName === 'HR');

    const outputhtml = await util.deleteHtmlWithFixup(
        inputhtml, deletion, lastFixup);
    fs.writeFileSync(file, outputhtml);
  }

  return 0;
};

if (require.main === module) {
  main().then(process.exit);
}
