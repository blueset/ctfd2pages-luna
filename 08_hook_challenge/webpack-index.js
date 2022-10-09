/* global CTFd */

const FLAGS = require('./flags.json');
const escape = CTFd.utils.html.htmlEntities;

const sha256sum = async (string) => {
  const utf8 = new TextEncoder().encode(string);
  const hashBuffer = await crypto.subtle.digest('SHA-256', utf8);
  return Array.from(new Uint8Array(hashBuffer))
      .map((bytes) => bytes.toString(16).padStart(2, '0'))
      .join('');
};

CTFd.pages.challenge.submitChallenge = async function(chalId, flag) {
  const expectedSHA = FLAGS[`${chalId}`];
  const submittedSHA = await sha256sum(flag);

  if (!expectedSHA?.length) {
    return {
      status: 200,
      success: true,
      data: {
        status: 'paused',
        message: 'Flag not archived',
      },
    };
  } else if (expectedSHA.includes(submittedSHA)) {
    return {
      status: 200,
      success: true,
      data: {
        status: 'correct',
        message: 'Correct',
      },
    };
  } else {
    return {
      status: 200,
      success: true,
      data: {
        status: 'incorrect',
        message: 'Incorrect',
      },
    };
  }
};

CTFd.pages.challenge.loadHint = async function(hintId) {
  for (const hintOrig of CTFd._internal.challenge.data.hints) {
    if (hintOrig.id !== hintId) {
      continue;
    }

    const hint = Object.assign({}, hintOrig);
    if (hint.html === undefined) {
      hint.html = escape(hint.content);
    }

    return {
      status: 200,
      success: true,
      data: hint,
    };
  }

  throw new Error('Hint not found');
};
