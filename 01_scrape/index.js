const assert = require('node:assert');
const fs = require('node:fs');
const http = require('http'); ;
const https = require('https'); ;
const path = require('node:path');
const url = require('node:url');

const puppeteer = require('puppeteer');

const sleep = (timeout) => {
  return new Promise((resolve) => {
    setTimeout(resolve, timeout);
  });
};

// A promise with resolve & reject method on it
const deferred = () => {
  let resolve;
  let reject;

  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });

  promise.resolve = resolve;
  promise.reject = reject;
  return promise;
};

class HeartBeat {
  constructor() {
    this.resolved = false;
    this.deferred = deferred();
    this.timer = undefined;
  }

  heartbeat(timeout) {
    // if (this.resolved) {
    //   throw new Error('Already timed out');
    // }
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (timeout >= 0) {
      this.timer = setTimeout(() => {
        // assert(!this.resolved);
        this.deferred.resolve();
        this.resolved = true;
      }, timeout);
    }
  };

  async wait() {
    await this.deferred;
  }
}

class WaitAll {
  constructor() {
    this.waitlist = new Set();
    this.deferred = deferred();
  }

  add(promise) {
    this.waitlist.add(promise);

    promise.then(() => {
      this.waitlist.delete(promise);
      if (!this.waitlist.size) {
        this.deferred.resolve();
      }
    }, (err) => {
      this.deferred.reject(err);
    });
  }

  async wait() {
    await this.deferred;
  }
}

class PageHandler {
  constructor(parent, browser, pageUrl) {
    this.parent = parent;
    this.browser = browser;
    this.pageUrl = pageUrl;

    this.redirectedTargets = new Map();
    this.pendingRequests = new Set();
    this.browseCompleted = undefined;
  }

  setHooks(page) {
    // Sometimes static files don't get requestfinished somehow.
    // - If all requests done, timeout 250ms
    // - If only irrelevant files remaining, timeout 10s
    // - Else timeout infinity.
    const heartbeat = () => {
      let timeout;
      if (!this.pendingRequests.size) {
        timeout = 250;
      } else if (Array.from(this.pendingRequests).every((requestUrl) => {
        return !requestUrl.startsWith(this.parent.origin) ||
            this.parent.completedPaths.has(this.parent.urlToPath(requestUrl));
      })) {
        timeout = 10000;
      } else {
        timeout = -1;
      }
      this.browseCompleted.heartbeat(timeout);
    };

    page.on('request', (request) => {
      const requestUrl = request.url();

      if (requestUrl.startsWith('data:')) {
        return;
      }

      this.pendingRequests.add(requestUrl);
      heartbeat();
    });

    page.on('requestfailed', (request) => {
      const requestUrl = request.url();

      this.pendingRequests.delete(requestUrl);
      heartbeat();

      if (requestUrl.startsWith(this.parent.origin)) {
        this.parent.completedPaths.add(this.parent.urlToPath(requestUrl));
      }
    });

    page.on('requestfinished', async (request) => {
      const requestUrl = request.url();
      console.log("request finished:", requestUrl);
      const response = request.response();
      const originRedirect = this.redirectedTargets.get(requestUrl);

      this.pendingRequests.delete(requestUrl);
      heartbeat();

      if (requestUrl.startsWith(this.parent.origin)) {
        this.parent.completedPaths.add(this.parent.urlToPath(requestUrl));
      }

      if (originRedirect || requestUrl.startsWith(this.parent.origin)) {
        const status = response.status();

        if ((status >= 200 && status < 300) ||
            requestUrl === `${this.parent.origin}404`) {
          if (requestUrl === `${this.parent.origin}404`) {
            assert(status === 404);
          }

          let filepath;
          if (!originRedirect || requestUrl.startsWith(this.parent.origin)) {
            filepath = this.parent.urlToPath(requestUrl);
          } else {
            filepath = this.parent.urlToPath(originRedirect);
          }

          // File extension added because sometimes an URL needs to be both a
          // page and a directory...
          if (!filepath.endsWith('.json') &&
              response.headers()['content-type'] === 'application/json') {
            filepath += '.json';
          }
          if (!filepath.endsWith('.html') && !filepath.includes('?') &&
              response.headers()['content-type'] ===
                'text/html; charset=utf-8') {
            filepath += '.html';
          }

          if (!this.parent.completedDownloads.has(filepath)) {
            this.parent.completedDownloads.add(filepath);

            await fs.promises.mkdir(path.dirname(filepath), {recursive: true});

            console.log("saving:", requestUrl, "to", filepath);
            let buffer;
            try {
              console.log("getting buffer:", requestUrl, "to", filepath);
              buffer = await response.buffer();
              console.log("buffer retrieved:", buffer);
            } catch (err) {
              console.log(requestUrl, filepath);
              console.log(err);
              throw err;
            }

            await fs.promises.writeFile(filepath, buffer);
            console.log('done:', filepath);
          }

          if (originRedirect && requestUrl.startsWith(this.parent.origin)) {
            // not handling internal -> internal redirects
            assert(false);
          }
        } else if (status >= 300 && status < 400) {
          const next = new url.URL(
              response.headers()['location'], requestUrl).href;

          this.redirectedTargets.set(next, originRedirect || requestUrl);
        }
      }
    });
  }

  async handleSpecials(page) {
    if (this.pageUrl === `${this.parent.origin}`) {
      // Puppeteer headless don't fetch favicon
      const favicon = await page.evaluate(() => {
        return document.querySelector('link[rel*=\'icon\']').href;
      });
      this.parent.allHandouts.add(favicon);
    } else if (this.pageUrl === `${this.parent.origin}challenges`) {
      const chals = await page.evaluate(() => {
        return Array.from(document.querySelectorAll(
            '.challengeItem[data-is-center]')).map((e) => e.dataset.id);
      });
      console.log('chals:', chals);

      for (const chal of chals) {
        // Challenge Tab
        console.log('chal:', chal);
        this.browseCompleted = new HeartBeat();
        await page.evaluate((chal) => {
          document.querySelector('.challengeItem[data-id="' + chal + '"]')
              .click();
        }, chal);
        await this.browseCompleted.wait();

        const handouts = await page.evaluate(() => {
          return Array.from(document.querySelectorAll(
              '.buttonRow a')).map((e) => e.href);
        });
        console.log('handouts of', chal, '=', handouts);
        for (const handout of handouts) {
          assert(handout.startsWith(this.parent.origin));
          this.parent.allHandouts.add(handout);
        }

        // Solves Tab
        const isSolversDisabled = await page.evaluate(() => document.querySelector('.solvers button').disabled, chal);
        console.log('is solvers disabled', isSolversDisabled);
        if (!isSolversDisabled) {
          console.log('clicking solvers button', chal);
          this.browseCompleted = new HeartBeat();
          await page.evaluate(() => {
            document.querySelector('.solvers button').click();
          }, chal);
          console.log('clicked', chal);
          await this.browseCompleted.wait();
          console.log('heartbeat received', chal);
        }

        await page.keyboard.press('Escape');
      }
    }
  }

  async run() {
    const page = await this.browser.newPage();
    this.browseCompleted = new HeartBeat();

    this.setHooks(page);

    console.log('visiting:', this.pageUrl);
    await page.goto(this.pageUrl, {timeout: 0});

    await this.browseCompleted.wait();

    const links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a')).map((e) => e.href);
    });

    for (let link of links) {
      console.log('found link', link, this.parent.origin);
      if (!link.startsWith(this.parent.origin)) {
        continue;
      }

      // if (!(
      //   link.startsWith(this.parent.origin + 'challenges') ||
      //   link.startsWith(this.parent.origin + 'rules') ||
      //     link.startsWith(this.parent.origin + 'api/v1/challenge') ||
      //     link.startsWith(this.parent.origin + 'files')
      // )) {
      //   continue;
      // }

      link = new url.URL(link);
      link.hash = '';
      link = link.href;

      this.parent.pushpage(link);
    }

    // Return this promise, then async handle special pages
    this.parent.waitallnav.add((async () => {
      await this.handleSpecials(page);

      // Give it 10 seconds to download any remaining resources
      await sleep(10000);

      page.close();
    })());
  }
}

class Ctfd2Pages {
  constructor(origin, basepath) {
    this.origin = origin;
    this.basepath = basepath;

    this.toVisit = [];
    this.visited = new Set();
    this.completedDownloads = new Set();
    this.completedPaths = new Set();
    this.allHandouts = new Set();
    this.waitallnav = new WaitAll();
  }

  urlToPath(requestUrl) {
    assert(requestUrl.startsWith(this.origin));
    let filepath = '/' + requestUrl.substring(this.origin.length);
    filepath = filepath.replace(/\?d=[0-9a-f]{8}$/, '');
    filepath = filepath.replace(/\?_=[0-9]+$/, '');
    if (filepath.endsWith('/')) {
      filepath += 'index.html';
    }
    filepath = path.join(this.basepath, `./${filepath}`);
    return filepath;
  };

  downloadFile(requestUrl, filepath) {
    const urlobj = new url.URL(requestUrl);
    let handlerModule;

    if (urlobj.protocol === 'http:') {
      handlerModule = http;
    } else if (urlobj.protocol === 'https:') {
      handlerModule = https;
    } else {
      assert(false);
    }

    return new Promise((resolve, reject) => {
      handlerModule.get(requestUrl, (response) => {
        const status = response.statusCode;

        if (status >= 200 && status < 300) {
          let fd = fs.openSync(filepath, 'w');

          response.on('data', (chunk) => {
            fs.writeSync(fd, chunk);
          });
          response.on('end', () => {
            fs.closeSync(fd);
            fd = undefined;
            resolve();
          });
        } else if (status >= 300 && status < 400) {
          const next = new url.URL(response.headers.location, requestUrl).href;
          this.downloadFile(next, filepath).then(resolve, reject);
        } else {
          reject(new Error(status));
        }
      }).on('error', (err) => {
        reject(err);
      });
    });
  };

  pushpage(pageUrl) {
    console.log('pushing:', pageUrl);
    if (this.visited.has(pageUrl)) {
      return;
    }

    this.toVisit.push(pageUrl);
    this.visited.add(pageUrl);
  }

  async poppage(browser) {
    const pageUrl = this.toVisit.shift();
    console.log('popping:', pageUrl);
    await new PageHandler(this, browser, pageUrl).run();
  }

  async run() {
    const browser = await puppeteer.launch({headless: true});

    this.pushpage(this.origin);
    this.pushpage(`${this.origin}challenges`);
    this.pushpage(`${this.origin}404`);

    while (this.toVisit.length) {
      console.log(this.toVisit.length, 'pending pages');
      await this.poppage(browser);
    }

    await this.waitallnav.wait();

    for (const handout of this.allHandouts) {
      const filepath = this.urlToPath(handout);
      if (!this.completedDownloads.has(filepath)) {
        await fs.promises.mkdir(path.dirname(filepath), {recursive: true});
        console.log("downloading:", handout, "to", filepath);
        await this.downloadFile(handout, filepath);
        console.log('done:', filepath);
      }
    }

    browser.close();
  }
}

const main = async function() {
  const args = process.argv.slice(2);

  if (args.length !== 2) {
    console.error(
        `Usage: ${process.argv[0]} ${process.argv[1]} [origin] [path]`);
    console.error(
        `Example: ${process.argv[0]} ${process.argv[1]} https://2022.uiuc.tf 2022/`);
    return 1;
  }

  let [origin, basepath] = args;
  if (!origin.endsWith('/')) {
    origin += '/';
  }
  await new Ctfd2Pages(origin, basepath).run();

  return 0;
};

if (require.main === module) {
  main().then(process.exit);
}
