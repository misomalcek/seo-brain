/**
 * Night Shift: Article Scraper
 * Schedule: Sunday 3:00 AM
 *
 * Scrapes articles from 3 msg websites via sitemaps.
 * Converts to markdown, generates embeddings, stores in pgvector.
 */

import { db, log, cleanup, postToBrainFeed } from './runner';

async function main() {
  log('article-scraper', 'Starting weekly article scrape...');

  try {
    // Dynamic import to avoid loading model at startup
    const { scrapeAllDomains } = await import('../../apps/brain-api/src/services/article-scraper');

    const results = await scrapeAllDomains();

    const totalNew = results.reduce((sum, r) => sum + r.newArticles, 0);
    const totalUpdated = results.reduce((sum, r) => sum + r.updatedArticles, 0);
    const totalErrors = results.reduce((sum, r) => sum + r.errors, 0);

    const summary = results.map(r =>
      `${r.domain}: ${r.newArticles} new, ${r.updatedArticles} updated, ${r.errors} errors`
    ).join('\n');

    await postToBrainFeed(`🔍 Article Scraper\n\n${summary}\n\nCelkovo: ${totalNew} nových, ${totalUpdated} aktualizovaných`);

    log('article-scraper', `Done. New: ${totalNew}, Updated: ${totalUpdated}, Errors: ${totalErrors}`);
  } catch (err) {
    log('article-scraper', `Error: ${(err as Error).message}`);
    await postToBrainFeed(`⚠️ Article Scraper: zlyhalo — ${(err as Error).message}`);
  } finally {
    await cleanup();
  }
}

main();
