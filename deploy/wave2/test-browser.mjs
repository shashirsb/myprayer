// Runs inside the isolated CI stack. Chrome supplies a synthetic camera stream.
import assert from 'node:assert/strict';
import {createServer} from 'node:https';
import {request} from 'node:http';
import {readFileSync} from 'node:fs';
import {once} from 'node:events';
import puppeteer from 'puppeteer-core';

const proxy = createServer({
  cert:readFileSync(new URL('cert.pem',import.meta.url)),
  key:readFileSync(new URL('key.pem',import.meta.url)),
}, (incoming,outgoing) => {
  const upstream = request({hostname:'127.0.0.1',port:8080,path:incoming.url,method:incoming.method,headers:incoming.headers}, res => {
    outgoing.writeHead(res.statusCode, res.headers);
    res.pipe(outgoing);
  });
  upstream.on('error', () => { outgoing.writeHead(502); outgoing.end(); });
  incoming.pipe(upstream);
}).listen(9443, '127.0.0.1');
await once(proxy,'listening');
let browser;
try {
  browser = await puppeteer.launch({executablePath:process.env.CHROME_BIN, headless:true,
    args:['--no-sandbox','--ignore-certificate-errors','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
  const page = await browser.newPage();
  page.setDefaultTimeout(12000);
  await page.goto('https://localhost:9443/#login');
  await page.waitForSelector('#password-form input[name="login"]',{visible:true});
  await page.type('#password-form input[name="login"]','tester');
  await page.type('#password-form input[name="password"]',process.env.CI_STAFF_PASSWORD);
  await page.click('#password-form button');
  await page.waitForSelector('#local-camera',{visible:true});
  await page.click('#frame');
  await page.waitForFunction(() => document.querySelector('#frame').textContent === 'Capture front view');
  await page.click('#frame');
  await page.waitForFunction(() => document.querySelector('#frame').textContent === 'Verify my photo');
  const decision = page.waitForResponse(r => r.url().endsWith('/v1/photo/complete'));
  await page.click('#frame');
  // The test enrollment is a synthetic image with no face, so biometric processing must fail closed.
  assert.ok([403,503].includes((await decision).status()));
  assert.equal(await page.evaluate(async () => (await fetch('/v1/session')).status),401);
} finally {
  await browser?.close();
  proxy.closeAllConnections();
  await new Promise(resolve => proxy.close(resolve));
}
