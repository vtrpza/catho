import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';

import {
  buildContactOptions,
  hasContactTrigger,
  hasVisibleContact,
  clickContactButton,
  collectContactValues
} from '../src/utils/contactHelpers.js';

const sampleHtml = `
<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>Contato de Teste</title>
    <style>
      body { font-family: Arial, sans-serif; }
      .Row__StyledRow-sc-tx22b8-0 { display: flex; gap: 16px; align-items: center; }
      .Button__StyledButton-sc-1ovnfsw-1 { cursor: pointer; padding: 12px 16px; border: 1px solid #ddd; border-radius: 6px; display: inline-flex; align-items: center; gap: 12px; }
      .hidden-value { display: none; margin-top: 6px; }
    </style>
  </head>
  <body>
    <div class="Row__StyledRow-sc-tx22b8-0">
      <button id="phoneButton" type="button" class="Button__StyledButton-sc-1ovnfsw-1 gBoQyu sc-imWYAI cHCQIy">
        <svg data-testid="SmartphoneIcon"></svg>
        <div class="sc-kAkpmW ueZhd">
          <span class="sc-cmaqmh dlKMgH">Ver telefone</span>
        </div>
      </button>
      <div id="phoneValue" class="hidden-value">(41) 99999-1234</div>
    </div>

    <div class="Row__StyledRow-sc-tx22b8-0">
      <button id="emailButton" type="button" class="Button__StyledButton-sc-1ovnfsw-1 gBoQyu sc-imWYAI cHCQIy">
        <svg data-testid="MailOutlineIcon"></svg>
        <div class="sc-kAkpmW ueZhd">
          <span class="sc-cmaqmh dlKMgH">
            VER   E-MAIL
          </span>
        </div>
      </button>
      <div id="emailValue" class="hidden-value">
        <a href="mailto:wellington@example.com">wellington@example.com</a>
      </div>
    </div>

    <script>
      const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim();

      document.getElementById('phoneButton').addEventListener('click', () => {
        const span = document.querySelector('#phoneButton span');
        span.textContent = '(41) 99999-1234';
        document.getElementById('phoneValue').style.display = 'block';
      });

      document.getElementById('emailButton').addEventListener('click', () => {
        const span = document.querySelector('#emailButton span');
        span.textContent = 'wellington@example.com';
        document.getElementById('emailValue').style.display = 'block';
      });
    </script>
  </body>
</html>
`;

async function run() {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setContent(sampleHtml, { waitUntil: 'domcontentloaded' });

    const phoneOptions = { ...buildContactOptions('phone'), kind: 'phone' };
    const emailOptions = { ...buildContactOptions('email'), kind: 'email' };

    assert.equal(await page.evaluate(hasVisibleContact, phoneOptions), false, 'Phone should start hidden');
    assert.equal(await page.evaluate(hasVisibleContact, emailOptions), false, 'Email should start hidden');

    // Ensure buttons become detectable.
    await page.waitForFunction(hasContactTrigger, {}, phoneOptions);
    await page.waitForFunction(hasContactTrigger, {}, emailOptions);

    assert.equal(await page.evaluate(clickContactButton, phoneOptions), true, 'Phone button should be clicked');
    assert.equal(await page.evaluate(clickContactButton, emailOptions), true, 'Email button should be clicked');

    await page.waitForFunction(hasVisibleContact, {}, phoneOptions);
    await page.waitForFunction(hasVisibleContact, {}, emailOptions);

    const phoneValue = await page.evaluate(collectContactValues, phoneOptions);
    const emailValue = await page.evaluate(collectContactValues, emailOptions);

    assert.equal(phoneValue, '(41) 99999-1234', 'Phone value extracted');
    assert.equal(emailValue, 'wellington@example.com', 'Email value extracted');

    console.log('✅ contactHelpers tests passed.');
  } finally {
    await browser.close();
  }
}

run().catch(error => {
  console.error('❌ contactHelpers tests failed:', error);
  process.exitCode = 1;
});
