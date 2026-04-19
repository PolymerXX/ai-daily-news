/**
 * AI News Scraper Script
 * This script fetches AI news from various sources and updates data/news.json
 * 
 * Usage:
 * npm run fetch-news
 * or
 * tsx scripts/fetch-news.ts
 */

import fs from 'fs';
import path from 'path';

interface NewsItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  publishTime: string;
  category: string;
  highlight: boolean;
  content: string;
}

const CATEGORIES = [
  '大模型',
  '芯片',
  '政策',
  '应用',
  '开源',
] as const;

/**
 * Fetch news from a source (placeholder implementation)
 * In a real implementation, this would scrape websites or call APIs
 */
async function fetchFromSource(source: string): Promise<NewsItem[]> {
  console.log(`Fetching news from ${source}...`);
  
  // TODO: Implement actual scraping logic here
  // Examples of sources to scrape:
  // - TechCrunch AI section
  // - The Verge AI section
  // - OpenAI blog
  // - Google AI blog
  // - Hugging Face blog
  // - etc.
  
  return [];
}

/**
 * Generate unique ID for news item
 */
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * Determine category from content (simple keyword matching)
 */
function categorizeNews(title: string, content: string): string {
  const text = (title + ' ' + content).toLowerCase();
  
  const categoryKeywords: Record<string, string[]> = {
    '大模型': ['gpt', 'llm', 'transformer', 'language model', 'chatgpt', 'claude', 'llama'],
    '芯片': ['chip', 'gpu', 'tpu', 'npu', 'processor', 'hardware', 'h100'],
    '政策': ['law', 'regulation', 'bill', 'policy', 'government', 'eu', 'act'],
    '应用': ['application', 'service', 'platform', 'product', 'tool', 'api'],
    '开源': ['open source', 'github', 'hugging face', 'release', 'community'],
  };
  
  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    if (keywords.some(keyword => text.includes(keyword))) {
      return category;
    }
  }
  
  return '应用';
}

/**
 * Validate news item structure
 */
function validateNewsItem(item: NewsItem): boolean {
  return !!(
    item.id &&
    item.title &&
    item.summary &&
    item.source &&
    item.publishTime &&
    item.category &&
    typeof item.highlight === 'boolean' &&
    item.content
  );
}

/**
 * Load existing news from data/news.json
 */
function loadExistingNews(): NewsItem[] {
  const newsPath = path.join(process.cwd(), 'data', 'news.json');
  
  if (!fs.existsSync(newsPath)) {
    return [];
  }
  
  try {
    const data = fs.readFileSync(newsPath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading existing news:', error);
    return [];
  }
}

/**
 * Save news to data/news.json
 */
function saveNews(news: NewsItem[]): void {
  const newsPath = path.join(process.cwd(), 'data', 'news.json');
  const dirPath = path.dirname(newsPath);
  
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  
  fs.writeFileSync(newsPath, JSON.stringify(news, null, 2), 'utf-8');
  console.log(`Saved ${news.length} news items to ${newsPath}`);
}

/**
 * Remove duplicates based on title and source
 */
function removeDuplicates(news: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  return news.filter(item => {
    const key = `${item.title}-${item.source}`;
    if (seen.has(key)) {
      console.log(`Removed duplicate: ${item.title} from ${item.source}`);
      return false;
    }
    seen.add(key);
    return true;
  });
}

/**
 * Main function to fetch and update news
 */
async function main() {
  console.log('Starting AI news scraper...');
  
  const sources = [
    'TechCrunch',
    'The Verge',
    'OpenAI Blog',
    'Google AI Blog',
    'Hugging Face Blog',
  ];
  
  let allNews: NewsItem[] = [];
  
  for (const source of sources) {
    try {
      const news = await fetchFromSource(source);
      allNews = [...allNews, ...news];
    } catch (error) {
      console.error(`Error fetching from ${source}:`, error);
    }
  }
  
  if (allNews.length === 0) {
    console.log('No news fetched. Exiting...');
    return;
  }
  
  console.log(`Fetched ${allNews.length} news items`);
  
  const existingNews = loadExistingNews();
  console.log(`Found ${existingNews.length} existing news items`);
  
  const combinedNews = removeDuplicates([...allNews, ...existingNews]);
  
  const validNews = combinedNews.filter(validateNewsItem);
  console.log(`Valid news items: ${validNews.length}`);
  
  saveNews(validNews);
  
  console.log('News scraping completed!');
}

if (require.main === module) {
  main().catch(console.error);
}

export { main, fetchFromSource, categorizeNews, validateNewsItem, loadExistingNews, saveNews };