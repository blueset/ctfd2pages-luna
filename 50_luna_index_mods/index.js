const assert = require('node:assert');
const fs = require('node:fs');
const {JSDOM} = require('jsdom');

const util = require('../util.js');

const {PAGES_REPO} = process.env;

const main = async function() {
  const lastFixup = {};

  // index.html
  let inputhtml = fs.readFileSync(`${PAGES_REPO}/index.html`, 'utf8');
  if (!inputhtml.includes('\'archived\': true,')) {
    inputhtml = inputhtml.replace(
        'window.init = {',
        'window.init = {\n\'archived\': true,');
    const {window} = new JSDOM(inputhtml);
    const {document} = window;

    let replaceRaw;
    let targetRaw;
    let outputhtml = inputhtml;

    let targetNode = Array.from(document.querySelectorAll('a.homeCTAButton[href="/register"]'));
    if (targetNode.length === 1) {
      [targetNode] = targetNode;

      replaceRaw = targetNode.outerHTML;
      targetNode.attributes.href.value = '/scoreboard';
      targetNode.querySelector('iconify-icon').attributes.icon.value = 'mdi:podium';
      targetNode.querySelector('span').innerHTML = 'Rankings';
      targetRaw = targetNode.outerHTML;

      assert(targetRaw !== replaceRaw);
      replaceRaw = await util.findWithFixup(
          inputhtml, replaceRaw, lastFixup);
      outputhtml = outputhtml.replace(
          new RegExp(util.makeRegexForLine(replaceRaw)), targetRaw);
    }

    targetNode = Array.from(document.querySelectorAll('a.homeCTAButton[href="/login"]'));
    if (targetNode.length === 1) {
      [targetNode] = targetNode;
      replaceRaw = targetNode.outerHTML;
      targetNode.attributes.href.value = '/challenges';
      targetNode.querySelector('iconify-icon').attributes.icon.value = 'fluent:music-note-2-24-filled';
      targetNode.querySelector('iconify-icon').attributes.style.value = 'transform: translateY(-15px) scale(1.4);';
      targetNode.querySelector('span').innerHTML = 'Challenges';
      targetRaw = targetNode.outerHTML;
      assert(targetRaw !== replaceRaw);
      replaceRaw = await util.findWithFixup(
          inputhtml, replaceRaw, lastFixup);
      outputhtml = outputhtml.replace(
          new RegExp(util.makeRegexForLine(replaceRaw)), targetRaw);
    }

    targetNode = Array.from(document.querySelectorAll('#sessionSid'));
    if (targetNode.length === 1) {
      [targetNode] = targetNode;
      replaceRaw = targetNode.outerHTML;
      targetNode.innerHTML = '50534354-4620-696e-2041-726368697665';
      // `PSCTF in Archive`
      targetRaw = targetNode.outerHTML;
      replaceRaw = await util.findWithFixup(
          inputhtml, replaceRaw, lastFixup);
      outputhtml = outputhtml.replace(
          new RegExp(util.makeRegexForLine(replaceRaw)), targetRaw);
    }

    if (outputhtml !== inputhtml) {
      fs.writeFileSync(`${PAGES_REPO}/index.html`, outputhtml);
    }
  }

  return 0;
};

if (require.main === module) {
  main().then(process.exit);
}
