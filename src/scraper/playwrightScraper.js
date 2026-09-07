import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import { logInfo, logSuccess, logWarn, logError } from '../cli/ui.js';

// Register stealth plugin
chromium.use(stealthPlugin());

function randomDelay(minMs = 800, maxMs = 2000) {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise(resolve => setTimeout(resolve, delay));
}

function sanitizeCookiesForPlaywright(cookies) {
  if (!Array.isArray(cookies)) return [];

  return cookies.map(c => {
    const cookie = {
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path || '/',
      secure: typeof c.secure === 'boolean' ? c.secure : true,
      httpOnly: typeof c.httpOnly === 'boolean' ? c.httpOnly : false
    };

    // Handle expiration date
    if (c.expires && typeof c.expires === 'number') {
      cookie.expires = Math.floor(c.expires);
    } else if (c.expirationDate && typeof c.expirationDate === 'number') {
      cookie.expires = Math.floor(c.expirationDate);
    }

    // Normalize sameSite for Playwright (Strict | Lax | None)
    if (c.sameSite) {
      const s = String(c.sameSite).toLowerCase();
      if (s === 'no_restriction' || s === 'none') {
        cookie.sameSite = 'None';
      } else if (s === 'strict') {
        cookie.sameSite = 'Strict';
      } else if (s === 'lax') {
        cookie.sameSite = 'Lax';
      }
    }

    return cookie;
  });
}

export async function scrapeFacebookComments(url, options = {}) {
  const {
    maxComments = 1000,
    headless = true,
    cookiesPath = './cookies.json',
    scrollDelayMin = 1000,
    scrollDelayMax = 2500,
    maxScrollAttemptsWithoutNew = 10
  } = options;

  logInfo(`Initializing Stealth Playwright Browser (Headless: ${headless})...`);

  const browser = await chromium.launch({
    headless: headless,
    args: [
      '--disable-notifications',
      '--disable-infobars',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled'
    ]
  });

  const contextOptions = {
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36'
  };

  const context = await browser.newContext(contextOptions);

  // Load session cookies if provided
  if (fs.existsSync(cookiesPath)) {
    try {
      const rawCookieData = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
      const sanitizedCookies = sanitizeCookiesForPlaywright(rawCookieData);
      await context.addCookies(sanitizedCookies);
      logSuccess(`Loaded ${sanitizedCookies.length} cookies from ${cookiesPath}`);
    } catch (err) {
      logWarn(`Failed to parse cookies file: ${err.message}`);
    }
  } else {
    logWarn(`No cookies file found at ${cookiesPath}.`);
    logWarn(`Note: Facebook requires session cookies for reading large comment threads on public Reels & Posts.`);
    logWarn(`Export cookies using EditThisCookie extension and place them in 'cookies.json'.`);
  }

  const page = await context.newPage();

  try {
    logInfo(`Navigating to target URL: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await randomDelay(3000, 5000);

    // 1. Dismiss login overlay modal if present
    await dismissLoginOverlay(page);

    // 2. Open comments panel/drawer if viewing a Reel or video post
    await openCommentDrawer(page);

    // 3. Attempt to switch to "All comments" filter if available
    await enableAllCommentsFilter(page);

    const commentsMap = new Map();
    let attemptsWithoutNew = 0;
    let totalExtracted = 0;
    const maxAttempts = options.maxScrollAttemptsWithoutNew || 30;

    logInfo('Starting dynamic extraction loop (scrolling & expanding comment threads)...');

    while (totalExtracted < maxComments && attemptsWithoutNew < maxAttempts) {
      // Dismiss any popup modal that might re-appear during scrolling
      await dismissLoginOverlay(page);

      // Expand "View more comments", "View replies" buttons
      await expandCommentButtons(page);

      // Parse currently visible comments in DOM
      const newComments = await extractVisibleComments(page);
      
      let addedInThisStep = 0;
      for (const comment of newComments) {
        const uniqueKey = comment.id || `${comment['author/id']}_${comment.text.slice(0, 30)}`;
        if (!commentsMap.has(uniqueKey)) {
          commentsMap.set(uniqueKey, comment);
          addedInThisStep++;
        }
      }

      totalExtracted = commentsMap.size;
      logInfo(`Comments collected: ${totalExtracted} / ${maxComments}`);

      if (addedInThisStep > 0) {
        attemptsWithoutNew = 0;
      } else {
        attemptsWithoutNew++;
        logWarn(`No new comments found in this iteration (${attemptsWithoutNew}/${maxAttempts})`);

        // If stalled for 3+ attempts, press PageDown key to wake up observer
        if (attemptsWithoutNew % 3 === 0) {
          await page.keyboard.press('PageDown').catch(() => {});
          await randomDelay(1200, 2000);
        }
      }

      if (totalExtracted >= maxComments) {
        logSuccess(`Reached target limit of ${maxComments} comments.`);
        break;
      }

      // Scroll down comment panel dialog or window
      await page.evaluate(() => {
        const dialog = document.querySelector('div[role="dialog"]') || document.querySelector('div[aria-label*="Comments"]');
        if (dialog) {
          dialog.scrollTop += 1200;
          // Scroll last article element into view if available
          const articles = dialog.querySelectorAll('div[role="article"]');
          if (articles.length > 0) {
            articles[articles.length - 1].scrollIntoView({ behavior: 'smooth', block: 'end' });
          }
        } else {
          window.scrollBy(0, 1200);
        }
      });

      await randomDelay(scrollDelayMin, scrollDelayMax);
    }

    logSuccess(`Scraping finished. Total unique comments captured: ${commentsMap.size}`);
    return Array.from(commentsMap.values());

  } catch (err) {
    logError(`Error during scraping: ${err.message}`);
    throw err;
  } finally {
    await browser.close();
  }
}

async function dismissLoginOverlay(page) {
  try {
    const closeButtons = page.locator('div[role="dialog"] div[aria-label="Close"], div[aria-label="Close"], button:has-text("Decline optional cookies")');
    const count = await closeButtons.count();
    if (count > 0) {
      const btn = closeButtons.first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click({ force: true }).catch(() => {});
        await randomDelay(1000, 1500);
      }
    }
  } catch (e) {
    // Non-fatal
  }
}

async function openCommentDrawer(page) {
  try {
    const commentBtn = page.locator('div[aria-label="Comment"], div[role="button"]:has-text("Comment"), div[aria-label*="comments"]').first();
    if (await commentBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      logInfo('Clicking comment button to open comments panel...');
      await commentBtn.click().catch(() => {});
      await randomDelay(2000, 3500);
    }
  } catch (e) {
    // Non-fatal
  }
}

async function enableAllCommentsFilter(page) {
  try {
    const filterBtn = page.locator('text=/Most relevant|Most Recent|All comments|أبرز التعليقات|جميع التعليقات|أحدث التعليقات/i').first();
    if (await filterBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      logInfo('Found comment filter button. Switching to "All comments" / "جميع التعليقات"...');
      await filterBtn.click().catch(() => {});
      await randomDelay(1000, 1500);

      const allCommentsOption = page.locator('text=/All comments|جميع التعليقات|أحدث التعليقات/i').first();
      if (await allCommentsOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await allCommentsOption.click().catch(() => {});
        logSuccess('Switched filter to "All comments"');
        await randomDelay(2000, 3000);
      }
    }
  } catch (e) {
    // Ignore if filter dropdown is not visible
  }
}

async function expandCommentButtons(page) {
  try {
    const selectors = [
      'text=/View (more|previous) comments/i',
      'text=/See more comments/i',
      'text=/عرض المزيد من التعليقات/i',
      'text=/عرض التعليقات السابقة/i',
      'text=/View \\d+ (more )?(reply|replies)/i',
      'text=/View previous replies/i',
      'text=/عرض \\d+ من الردود/i',
      'text=/عرض الردود/i',
      'text=/عرض المزيد/i'
    ];

    for (const sel of selectors) {
      const buttons = page.locator(sel);
      const count = await buttons.count();
      if (count > 0) {
        for (let i = 0; i < Math.min(count, 3); i++) {
          const btn = buttons.nth(i);
          if (await btn.isVisible().catch(() => false)) {
            await btn.scrollIntoViewIfNeeded().catch(() => {});
            await btn.click({ force: true }).catch(() => {});
            await randomDelay(600, 1200);
          }
        }
      }
    }
  } catch (e) {
    // Non-fatal
  }
}

async function extractVisibleComments(page) {
  return await page.evaluate(() => {
    const comments = [];
    const articleElements = Array.from(document.querySelectorAll('div[role="article"], div[aria-label*="Comment by"], div[aria-label*="تعليق من"]'));

    articleElements.forEach((el, index) => {
      try {
        const ariaLabel = el.getAttribute('aria-label') || '';

        // Find all links inside the comment article
        const allLinks = Array.from(el.querySelectorAll('a'));
        
        // Find links that contain non-empty inner text
        const textLinks = allLinks.filter(a => a.innerText && a.innerText.trim().length > 0);

        let authorName = '';
        let profileUrl = '';
        let authorId = '';

        // 1. Author Name & Profile Link
        // The first text link in a Facebook comment block is the commenter's profile link
        if (textLinks.length > 0) {
          const authorLink = textLinks[0];
          authorName = authorLink.innerText.trim();
          profileUrl = authorLink.href || '';
        }

        // Fallback for author name from aria-label (e.g. "تعليق من اسم المستحدم منذ يوم")
        if (!authorName && ariaLabel) {
          const match = ariaLabel.match(/(?:Comment by|تعليق من)\s+([^0-9\n\t]+)/i);
          if (match && match[1]) {
            authorName = match[1].replace(/منذ.*/, '').trim();
          }
        }

        // 2. Extract Author ID / Clean Username
        if (profileUrl) {
          try {
            const urlObj = new URL(profileUrl, window.location.origin);
            if (urlObj.searchParams.has('id')) {
              authorId = urlObj.searchParams.get('id');
            } else {
              const pathname = urlObj.pathname.replace(/\/$/, '');
              const parts = pathname.split('/').filter(Boolean);
              if (parts.length > 0) {
                authorId = parts[parts.length - 1];
              }
            }
          } catch (e) {
            authorId = profileUrl;
          }
        }

        // 3. Comment Text Content
        // Collect text elements inside comment body
        const textElements = Array.from(el.querySelectorAll('div[dir="auto"], span[dir="auto"]'));
        let textParts = textElements
          .map(t => t.innerText ? t.innerText.trim() : '')
          .filter(t => t.length > 0 && t !== authorName);

        // Remove duplicate spans and timestamp text
        textParts = Array.from(new Set(textParts));
        const text = textParts.join(' ').trim();

        if (!authorName && !text) return;

        // 4. Timestamp & Permalink
        const timeLink = allLinks.find(a => a.href && (a.href.includes('comment_id=') || a.href.includes('/posts/') || a.href.includes('/reel/')));
        let commentUrl = '';
        let date = '';
        if (timeLink) {
          commentUrl = timeLink.href;
          date = timeLink.getAttribute('aria-label') || timeLink.innerText.trim();
        }

        const commentId = commentUrl || `comment_${authorId}_${index}_${text.slice(0, 20)}`;

        comments.push({
          id: commentId,
          'author/id': authorId || profileUrl || (authorName ? authorName.toLowerCase().replace(/\s+/g, '.') : `user_${index}`),
          'author/name': authorName || 'Facebook User',
          text: text,
          profileUrl: profileUrl,
          commentUrl: commentUrl,
          date: date,
          timestamp: new Date().toISOString()
        });

      } catch (err) {
        // Ignore single element parsing error
      }
    });

    return comments;
  });
}
