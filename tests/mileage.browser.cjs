// Run against an isolated server/database with MILEAGE_TEST_URL set.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const base = process.env.MILEAGE_TEST_URL;
  if (!base) throw new Error('MILEAGE_TEST_URL must point to an isolated test server.');
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || chromium.executablePath() });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Tehran' });
    const password = randomBytes(20).toString('hex');
    const headers = { Origin: base };
    const bootstrap = await context.request.post(`${base}/api/bootstrap`, { headers, data: { mobile: '09990000990', name: 'مدیر آزمون کارکرد', password } });
    assert.equal(bootstrap.status(), 201, 'Use a fresh temporary database for this test.');
    const expert = await context.request.post(`${base}/api/admin/experts`, { headers, data: {
      mobile: '09990000991', name: 'کارشناس آزمون کارکرد', password,
      status: 'active', city: '', specialty: '', email: '', address: ''
    } });
    assert.equal(expert.status(), 201);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    await page.locator('[name="mobile"]').fill('09990000991');
    await page.locator('[name="password"]').fill(password);
    await page.locator('[form="expert-login-form"]').click();
    const input = page.locator('[name="mileage"]');
    await input.waitFor();
    const checks = [];
    const format = number => new Intl.NumberFormat('fa-IR').format(number);
    const saved = async () => {
      await page.waitForFunction(() => !serverSaving && serverPending.size === 0);
      const response = await context.request.get(`${base}/api/expert/inspections`);
      assert.equal(response.status(), 200);
      return (await response.json()).inspections[0].vehicle.mileage;
    };
    await input.focus();
    let typed = '';
    for (const digit of '1234567') {
      typed += digit;
      await input.press(digit);
      assert.equal(await input.inputValue(), format(Number(typed)));
      assert.equal(await input.evaluate(el => el.selectionStart), (await input.inputValue()).length);
      assert.equal(await input.evaluate(el => el === document.activeElement), true);
    }
    assert.equal(await saved(), typed);
    checks.push('Every keystroke formats immediately, retains focus/caret and persists plain digits through the API.');

    for (const value of ['۱۲۳۴۵۶', '١٢٣٤٥٦', '123,456', '۱۲۳٬۴۵۶']) {
      await input.fill(value);
      assert.equal(await input.inputValue(), '۱۲۳٬۴۵۶');
      assert.equal(await saved(), '123456');
    }
    checks.push('Persian, Arabic and Latin digits and pasted grouping separators format consistently.');

    await input.fill('12345');
    await input.evaluate(el => el.setSelectionRange(2, 2));
    await page.keyboard.insertText('9');
    assert.equal(await input.inputValue(), '۱۲۹٬۳۴۵');
    assert.ok(await input.evaluate(el => el.selectionStart < el.value.length));
    await page.keyboard.insertText('8');
    assert.equal(await input.inputValue(), '۱٬۲۹۸٬۳۴۵');
    assert.equal(await saved(), '1298345');
    checks.push('Typing in the middle stays at the intended digit instead of jumping to the end.');

    await input.fill('12345');
    await input.evaluate(el => el.setSelectionRange(3, 3));
    await input.press('Backspace');
    await input.press('Backspace');
    assert.equal(await input.inputValue(), '۱٬۳۴۵');
    await input.fill('12345');
    await input.evaluate(el => el.setSelectionRange(2, 2));
    await input.press('Delete');
    await input.press('Delete');
    assert.equal(await input.inputValue(), '۱٬۲۴۵');
    await input.fill('12345');
    for (let i = 0; i < 5; i++) await input.press('Backspace');
    assert.equal(await input.inputValue(), '');
    assert.equal(await saved(), '');
    checks.push('Backspace/Delete cross grouping boundaries and the field can be cleared.');

    await input.fill('123456');
    await page.locator('.mileage-plus').click();
    assert.equal(await input.inputValue(), '۱۳۳٬۴۵۶');
    await page.locator('.mileage-minus').click();
    assert.equal(await input.inputValue(), '۱۲۳٬۴۵۶');
    assert.equal(await saved(), '123456');
    await page.reload();
    await input.waitFor();
    assert.equal(await input.inputValue(), '۱۲۳٬۴۵۶');
    assert.equal(await page.locator('#mileage-words').textContent(), 'صد و بیست و سه هزار و چهارصد و پنجاه و شش کیلومتر');
    checks.push('Step buttons, words and reload remain consistent with the persisted number.');

    for (const width of [320, 390, 1398]) {
      await page.setViewportSize({ width, height: 844 });
      await input.fill('9999999');
      assert.equal(await input.inputValue(), '۹٬۹۹۹٬۹۹۹');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await input.fill('123456');
    await input.focus();
    await page.locator('.mileage-field').screenshot({ path: path.join(__dirname, '../artifacts/mileage-input-grouping.png') });
    assert.deepEqual(errors, []);
    checks.push('Maximum value fits at 320, 390 and 1398px without horizontal overflow; no runtime errors.');
    fs.writeFileSync(path.join(__dirname, '../artifacts/mileage-input-verification.json'), JSON.stringify({ checks, errors }, null, 2));
    process.stdout.write(JSON.stringify({ passed: checks.length, checks, errors }, null, 2) + '\n');
  } finally { await browser.close(); }
})().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
