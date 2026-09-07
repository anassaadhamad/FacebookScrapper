import { ApifyClient } from 'apify-client';
import { logInfo, logSuccess, logError } from '../cli/ui.js';

export async function scrapeWithApify(url, options = {}) {
  const apiKey = process.env.APIFY_API_TOKEN || options.apifyToken;

  if (!apiKey) {
    throw new Error('Apify API token is required. Set APIFY_API_TOKEN environment variable or pass --apify-token flag.');
  }

  logInfo('Initializing Apify Client...');
  const client = new ApifyClient({ token: apiKey });

  const { maxComments = 1000 } = options;

  logInfo(`Preparing Apify actor task for Facebook URL: ${url} (Max comments: ${maxComments})`);

  // Target popular Facebook Comments Scraper actor
  const input = {
    startUrls: [{ url: url }],
    resultsLimit: maxComments,
    includeNestedComments: true
  };

  try {
    logInfo('Launching Apify Facebook Comments Scraper actor (apify/facebook-comments-scraper)...');
    const run = await client.actor('apify/facebook-comments-scraper').call(input);

    logInfo(`Apify run started with ID: ${run.id}. Waiting for dataset results...`);
    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    logSuccess(`Apify run completed! Fetched ${items.length} raw records.`);

    // Normalize Apify comment schema to standard output format
    const normalizedComments = items.map((item, idx) => ({
      id: item.id || `apify_${idx}`,
      'author/id': item.profileId || item.profileUrl || item.user?.id || item.profileName,
      'author/name': item.profileName || item.user?.name || 'Facebook User',
      text: item.text || item.commentText || '',
      profileUrl: item.profileUrl || item.user?.profileUrl || '',
      commentUrl: item.commentUrl || item.url || '',
      date: item.date || item.createdTime || new Date().toISOString()
    }));

    return normalizedComments;

  } catch (err) {
    logError(`Apify Scraping failed: ${err.message}`);
    throw err;
  }
}
