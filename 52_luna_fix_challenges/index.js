const assert = require('node:assert');
const fs = require('node:fs');
const {JSDOM} = require('jsdom');

const util = require('../util.js');

const {PAGES_REPO} = process.env;

const main = async function() {
  const lastFixup = {};

  // index.html
  let inputhtml = fs.readFileSync(`${PAGES_REPO}/challenges/index.html`, 'utf8');
  const {window} = new JSDOM(inputhtml);
  const {document} = window;

  let targetNode = Array.from(document.querySelectorAll('#challengeContentErrors'));
  assert(targetNode.length === 1);
  [targetNode] = targetNode;
  const deletionRaw = targetNode.outerHTML;
  const deletion = await util.findWithFixup(
      inputhtml, deletionRaw, lastFixup);

  const outputhtml = inputhtml.replace(
      new RegExp(util.makeRegexForLine(deletion)), '');
  assert(outputhtml !== inputhtml);

  fs.writeFileSync(`${PAGES_REPO}/challenges/index.html`, outputhtml);

  return 0;
};

if (require.main === module) {
  main().then(process.exit);
}
