#!/usr/bin/env node

import { Command } from 'commander';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

import { printHeader, logInfo, logSuccess, logError, logWarn, renderLeaderboard } from './src/cli/ui.js';
import { scrapeFacebookComments } from './src/scraper/playwrightScraper.js';
import { scrapeWithApify } from './src/scraper/apifyScraper.js';
import { analyzeComments, exportResults } from './src/analyzer/giveawayAnalyzer.js';

dotenv.config();

const program = new Command();

program
  .name('facebook-comment-scraper')
  .description('Robust Facebook Reel & Post comment scraper and giveaway leaderboard analyzer')
  .version('1.0.0')
  .requiredOption('-u, --url <url>', 'Facebook Reel or Post URL (e.g. https://www.facebook.com/reel/1380713653617436)')
  .option('-m, --max <number>', 'Maximum number of comments to extract', (val) => parseInt(val, 10), 1000)
  .option('-e, --engine <engine>', 'Scraping engine: "playwright" (local stealth) or "apify" (cloud API)', 'playwright')
  .option('-c, --cookies <path>', 'Path to cookies.json file for authenticated session', './cookies.json')
  .option('-h, --headless <boolean>', 'Run browser in headless mode', (val) => val !== 'false', true)
  .option('-o, --output <dir>', 'Output directory for exported CSV & JSON results', './results')
  .option('--apify-token <token>', 'Apify API Token (if using apify engine)')
  .option('--top <number>', 'Number of top giveaway leaders to display in terminal table', (val) => parseInt(val, 10), 20);

program.parse(process.argv);

const options = program.opts();

async function main() {
  printHeader();

  logInfo(`Target URL: ${options.url}`);
  logInfo(`Max Comments Target: ${options.max}`);
  logInfo(`Engine Selected: ${options.engine.toUpperCase()}`);

  let comments = [];

  try {
    if (options.engine.toLowerCase() === 'apify') {
      comments = await scrapeWithApify(options.url, {
        maxComments: options.max,
        apifyToken: options.apifyToken
      });
    } else {
      comments = await scrapeFacebookComments(options.url, {
        maxComments: options.max,
        headless: options.headless,
        cookiesPath: options.cookies
      });
    }

    if (!comments || comments.length === 0) {
      logWarn('No comments were extracted. Please check the URL, cookie validity, or try running in headed mode (--headless false).');
      process.exit(0);
    }

    logInfo('\nAnalyzing comments and calculating giveaway leaderboard...');
    const leaderboard = analyzeComments(comments);

    renderLeaderboard(leaderboard, options.top);

    logInfo('Exporting data files...');
    await exportResults(comments, leaderboard, options.output);

    logSuccess('Process completed successfully!');

  } catch (err) {
    logError(`Execution failed: ${err.message}`);
    process.exit(1);
  }
}

main();
