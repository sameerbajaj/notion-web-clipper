// Content script: extracts page metadata and full article content

function extractPageData() {
  const data = {};

  // URL first (needed for type detection below)
  data.url = window.location.href;

  // Type detection (needed for smart title)
  data.type = detectContentType();

  // Raw og/meta title
  const rawTitle =
    document.querySelector('meta[property="og:title"]')?.content ||
    document.querySelector('meta[name="twitter:title"]')?.content ||
    document.title ||
    '';

  // For tweets: build a clean short title from author + first line of content
  // Full tweet text goes into tweetContent separately
  if (data.type === 'tweet') {
    const tweetAuthorEl =
      document.querySelector('[data-testid="User-Name"] span') ||
      document.querySelector('.css-1jxf684') ||
      null;
    const tweetAuthor = tweetAuthorEl?.textContent?.trim() || '';

    // Grab the full tweet text from the DOM
    const tweetEl =
      document.querySelector('[data-testid="tweetText"]') ||
      document.querySelector('article [lang]');
    const tweetText = tweetEl?.innerText?.trim() || '';

    data.tweetContent = tweetText; // full tweet goes to its own column

    // Smart short title
    if (tweetAuthor) {
      data.title = `Tweet by ${tweetAuthor}`;
    } else {
      // Fallback: first ~60 chars of tweet, or og:title without trailing " / X"
      const cleaned = rawTitle.replace(/\s*[\/|]\s*(X|Twitter)\s*$/i, '').trim();
      data.title = cleaned.length > 80 ? cleaned.slice(0, 78) + '…' : cleaned;
    }
  } else {
    data.title = rawTitle;
    data.tweetContent = '';
  }

  // Description
  data.description =
    document.querySelector('meta[property="og:description"]')?.content ||
    document.querySelector('meta[name="description"]')?.content ||
    document.querySelector('meta[name="twitter:description"]')?.content ||
    '';

  // Author
  data.author =
    document.querySelector('meta[name="author"]')?.content ||
    document.querySelector('meta[property="article:author"]')?.content ||
    document.querySelector('[rel="author"]')?.textContent?.trim() ||
    document.querySelector('.author')?.textContent?.trim() ||
    document.querySelector('[class*="author"]')?.textContent?.trim() ||
    '';

  // Twitter/X handle detection
  const twitterMeta = document.querySelector('meta[name="twitter:creator"]')?.content;
  if (twitterMeta && !data.author) {
    data.author = twitterMeta;
  }

  // Published date
  data.publishedDate =
    document.querySelector('meta[property="article:published_time"]')?.content ||
    document.querySelector('meta[name="date"]')?.content ||
    document.querySelector('time[datetime]')?.getAttribute('datetime') ||
    document.querySelector('meta[itemprop="datePublished"]')?.content ||
    '';

  // Site name
  data.siteName =
    document.querySelector('meta[property="og:site_name"]')?.content ||
    new URL(window.location.href).hostname.replace('www.', '') ||
    '';

  // Favicon
  data.favicon =
    document.querySelector('link[rel="icon"]')?.href ||
    document.querySelector('link[rel="shortcut icon"]')?.href ||
    `${window.location.origin}/favicon.ico`;

  // Cover image
  data.coverImage =
    document.querySelector('meta[property="og:image"]')?.content ||
    document.querySelector('meta[name="twitter:image"]')?.content ||
    '';

  // Keywords/tags
  const keywords = document.querySelector('meta[name="keywords"]')?.content || '';
  data.keywords = keywords
    ? keywords.split(',').map(k => k.trim()).filter(Boolean).slice(0, 10)
    : [];

  // Extract main content text (simplified readability)
  data.content = extractMainContent();

  // Selected text (if any)
  data.selectedText = window.getSelection()?.toString()?.trim() || '';

  return data;
}

function extractMainContent() {
  // Try to find the main article content
  const selectors = [
    'article',
    '[role="main"]',
    'main',
    '.post-content',
    '.article-content',
    '.entry-content',
    '.content',
    '#content',
    '.post-body',
    '.story-body',
  ];

  let contentEl = null;
  for (const sel of selectors) {
    contentEl = document.querySelector(sel);
    if (contentEl) break;
  }

  if (!contentEl) contentEl = document.body;

  // Clone and clean
  const clone = contentEl.cloneNode(true);
  const removeSelectors = [
    'nav', 'header', 'footer', 'aside', 'script', 'style',
    '.nav', '.header', '.footer', '.sidebar', '.ad', '.advertisement',
    '.cookie-banner', '.popup', '[class*="widget"]', '[class*="banner"]',
    'iframe', 'noscript'
  ];
  removeSelectors.forEach(sel => {
    clone.querySelectorAll(sel).forEach(el => el.remove());
  });

  // Get paragraphs as structured content
  const paragraphs = [];
  clone.querySelectorAll('h1, h2, h3, h4, h5, h6, p, blockquote, li').forEach(el => {
    const text = el.textContent.trim();
    if (text.length > 20) {
      paragraphs.push({
        tag: el.tagName.toLowerCase(),
        text: text
      });
    }
  });

  return paragraphs.slice(0, 100); // limit to 100 blocks
}

function detectContentType() {
  const url = window.location.href;
  if (url.includes('twitter.com') || url.includes('x.com')) return 'tweet';
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'video';
  if (url.includes('github.com')) return 'repository';
  if (url.includes('reddit.com')) return 'discussion';
  if (document.querySelector('article')) return 'article';
  return 'webpage';
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getPageData') {
    try {
      const data = extractPageData();
      sendResponse({ success: true, data });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }
  return true;
});
