const assert = require('node:assert');
const fs = require('node:fs');
const {JSDOM} = require('jsdom');

const util = require('../util.js');

const {PAGES_REPO} = process.env;

const main = async function() {
  const lastFixup = {};

  for (const file of [
    ...await util.globPromise(`${PAGES_REPO}/*.html`),
    ...await util.globPromise(`${PAGES_REPO}/teams/*.html`),
    ...await util.globPromise(`${PAGES_REPO}/users/*.html`),
  ]) {
    console.log(file);

    const inputhtml = fs.readFileSync(file, 'utf8');
    const {window} = new JSDOM(inputhtml);
    const {document} = window;

    let replaceRaw;
    let targetRaw;
    let outputhtml;

    let targetNode = Array.from(document.querySelectorAll('a.alternate[href="/login"]'));
    if (targetNode.length === 1) {
      [targetNode] = targetNode;

      // targetNode = targetNode.closest('ul.navbar-nav');
      // const deletionRaw = util.expandHTMLs(
      //     targetNode, 'previous', (node) => node.tagName === 'HR');
      // const deletion = await util.findWithFixup(
      //     inputhtml, deletionRaw, lastFixup);

      replaceRaw = targetNode.outerHTML;
      targetNode.attributes.href.value = 'https://github.com/project-sekai-ctf/sekaictf-2022/';
      targetNode.querySelector('iconify-icon').attributes.icon.value = 'mdi:github';
      targetNode.querySelector('span').innerHTML = 'GitHub';
      targetRaw = targetNode.outerHTML;
      assert(targetRaw !== replaceRaw);
      replaceRaw = await util.findWithFixup(
          inputhtml, replaceRaw, lastFixup);
      outputhtml = inputhtml.replace(
          new RegExp(util.makeRegexForLine(replaceRaw)), targetRaw);
    }

    targetNode = Array.from(document.querySelectorAll('a.alternate[href="/register"]'));
    if (targetNode.length === 1) {
      [targetNode] = targetNode;
      replaceRaw = targetNode.outerHTML;
      targetNode.attributes.href.value = '/challenges';
      targetNode.querySelector('iconify-icon').attributes.icon.value = 'fluent:music-note-2-24-filled';
      targetNode.querySelector('span').innerHTML = 'Challenges';
      targetRaw = targetNode.outerHTML;
      assert(targetRaw !== replaceRaw);
      replaceRaw = await util.findWithFixup(
          inputhtml, replaceRaw, lastFixup);
      outputhtml = outputhtml.replace(
          new RegExp(util.makeRegexForLine(replaceRaw)), targetRaw);
    }

    // console.log(outputhtml);
    // assert(false);

    // const outputhtml = inputhtml.replace(
    //     new RegExp(util.makeRegexForLine(deletion)), '');
    if (outputhtml) {
      assert(outputhtml !== inputhtml);

      fs.writeFileSync(file, outputhtml);
    }
  }

  return 0;
};

if (require.main === module) {
  main().then(process.exit);
}
