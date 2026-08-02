const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const session = JSON.parse(fs.readFileSync(path.join(process.env.TEMP, 'opencode', 'session.json'), 'utf8'));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: 'new',
    args: ['--no-sandbox', '--window-size=390,844', '--disable-gpu'],
    defaultViewport: { width: 390, height: 844, isMobile: true, hasTouch: true },
  });
  const page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[C]', m.type(), m.text().slice(0, 200)); });
  page.on('pageerror', (e) => console.log('[PAGEERROR]', e.message.slice(0, 300)));
  page.on('request', (req) => { if (req.method() === 'PATCH' || (req.method() === 'POST' && req.url().includes('rpc'))) console.log('[REQ]', req.method(), req.url().split('rest')[1]?.slice(0, 80), req.postData()?.slice(0, 120)); });
  page.on('response', async (res) => { if (res.status() >= 400) { let b = ''; try { b = (await res.text()).slice(0, 200); } catch {} console.log('[RESP]', res.status(), b); } });

  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 60000 });
  await page.evaluate((s) => localStorage.setItem('sb-msmkwyoojgdbwwxnvcbf-auth-token', JSON.stringify(s)), session);
  await page.goto('http://localhost:5173/admin', { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 3000));

  await page.evaluate(() => Array.from(document.querySelectorAll('button')).find(x => x.innerText.trim().toUpperCase() === 'TEAM')?.click());
  await new Promise(r => setTimeout(r, 1000));
  await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('div')).filter(d => d.innerText && d.innerText.includes('ZZ_TEST_ROLE'));
    for (const card of cards) {
      const btn = Array.from(card.querySelectorAll('button[title="Modifica ruolo"]'))[0];
      if (btn) { btn.click(); break; }
    }
  });
  await new Promise(r => setTimeout(r, 1000));

  // reset role to helper via API first
  await page.evaluate(async () => {
    await fetch('https://msmkwyoojgdbwwxnvcbf.supabase.co/rest/v1/staff?id=eq.bbef0c83-ccd8-479f-81db-8f22abe79ab5', { method: 'PATCH', headers: { apikey: 'sb_publishable_IZz1ReSU57fpIh1rWuGPVA_HRhn4e2o', Authorization: 'Bearer ' + JSON.parse(localStorage.getItem('sb-msmkwyoojgdbwwxnvcbf-auth-token')).access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'helper' }) });
  });
  await new Promise(r => setTimeout(r, 500));

  // click STAFF option
  await page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll('label'));
    const el = labels.find(l => /^\s*STAFF\s/.test(l.innerText.replace(/\n/g, ' ').toUpperCase()));
    el?.click();
  });
  await new Promise(r => setTimeout(r, 600));
  const selected = await page.evaluate(() => {
    const l = Array.from(document.querySelectorAll('label')).find(l => l.className.includes('border-primary'));
    return l ? l.innerText.replace(/\n/g, ' ').trim() : 'none';
  });
  console.log('SELECTED:', selected);

  // submit
  await page.evaluate(() => Array.from(document.querySelectorAll('button')).find(x => x.innerText.trim().toUpperCase() === 'SALVA RUOLO')?.click());
  await new Promise(r => setTimeout(r, 3000));

  const after = await page.evaluate(() => ({
    modalOpen: document.body.innerText.includes('MODIFICA RUOLO'),
    toasts: Array.from(document.querySelectorAll('div')).map(d => d.innerText).filter(t => t && t.length < 80 && !t.includes('\n')),
  }));
  console.log('AFTER:', JSON.stringify(after));

  // verify server-side role
  const dbRes = await page.evaluate(async () => {
    const r = await fetch('https://msmkwyoojgdbwwxnvcbf.supabase.co/rest/v1/staff?select=role&name=eq.ZZ_TEST_ROLE', { headers: { apikey: 'sb_publishable_IZz1ReSU57fpIh1rWuGPVA_HRhn4e2o', Authorization: 'Bearer ' + JSON.parse(localStorage.getItem('sb-msmkwyoojgdbwwxnvcbf-auth-token')).access_token } });
    const j = await r.json();
    return j[0]?.role;
  });
  console.log('DB ROLE AFTER TEST:', dbRes);

  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });