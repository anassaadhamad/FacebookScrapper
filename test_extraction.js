import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

chromium.use(stealthPlugin());

async function inspectReelDOM() {
  console.log('Launching Playwright browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36'
  });

  // Check if cookies exist
  if (fs.existsSync('./cookies.json')) {
    const cookies = JSON.parse(fs.readFileSync('./cookies.json', 'utf8'));
    await context.addCookies(cookies);
    console.log('Loaded cookies');
  }

  const page = await context.newPage();
  console.log('Navigating to Reel URL...');
  await page.goto('https://www.facebook.com/reel/1380713653617436', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);

  // Take initial screenshot
  await page.screenshot({ path: 'step1_loaded.png' });

  // Dismiss modal
  const closeBtn = page.locator('div[role="dialog"] div[aria-label="Close"], div[aria-label="Close"]').first();
  if (await closeBtn.isVisible().catch(() => false)) {
    console.log('Closing overlay modal...');
    await closeBtn.click().catch(() => {});
    await page.waitForTimeout(2000);
  }

  await page.screenshot({ path: 'step2_modal_closed.png' });

  // Click Comment button
  console.log('Looking for Comment button...');
  const commentBtn = page.locator('div[aria-label="Comment"], div[role="button"]:has-text("Comment")').first();
  if (await commentBtn.isVisible().catch(() => false)) {
    console.log('Clicking Comment button...');
    await commentBtn.click().catch(() => {});
    await page.waitForTimeout(4000);
  }

  await page.screenshot({ path: 'step3_comments_clicked.png' });

  // Now let's dump the entire structure of all elements on the page!
  const domDump = await page.evaluate(() => {
    // Collect all links, articles, comments, text containers
    const allDivs = Array.from(document.querySelectorAll('div, span, a, article'));
    
    // Find any element containing commenter name or text or comment patterns
    const commentLikeElements = allDivs.map(el => {
      const text = el.innerText ? el.innerText.trim() : '';
      const role = el.getAttribute('role');
      const ariaLabel = el.getAttribute('aria-label');
      const className = el.className;
      return {
        tag: el.tagName,
        role: role,
        ariaLabel: ariaLabel,
        class: typeof className === 'string' ? className.slice(0, 50) : '',
        text: text.slice(0, 100),
        childCount: el.children.length
      };
    }).filter(e => e.text && e.text.length > 0 && e.text.length < 200);

    return commentLikeElements.slice(0, 100);
  });

  console.log('\n--- DOM Elements Sample (First 100) ---');
  console.log(JSON.stringify(domDump, null, 2));

  // Specifically check if there are any spans or divs with text matching comment authors or replies
  const textBlocks = await page.evaluate(() => {
    const dialog = document.querySelector('div[role="dialog"]') || document.body;
    return dialog.innerText;
  });

  console.log('\n--- Dialog Text Content ---');
  console.log(textBlocks.slice(0, 2000));

  await browser.close();
}

inspectReelDOM().catch(console.error);
