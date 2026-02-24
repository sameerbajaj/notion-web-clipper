// Content script: extracts page metadata and full article content

function getTweetStatusId(url) {
  const match = url.match(/\/status\/(\d+)/);
  return match?.[1] || null;
}

function getPrimaryTweetArticle() {
  const statusId = getTweetStatusId(window.location.href);
  const allArticles = [...document.querySelectorAll('article')];

  if (!allArticles.length) return null;
  if (!statusId) return allArticles[0];

  const matched = allArticles.find(article =>
    article.querySelector(`a[href*="/status/${statusId}"]`)
  );

  return matched || allArticles[0];
}

function extractTweetAuthor(article) {
  const authorSelectors = [
    '[data-testid="User-Name"] a[role="link"] span',
    '[data-testid="User-Name"] div[dir="ltr"] span',
    '[data-testid="User-Name"] span',
  ];

  for (const selector of authorSelectors) {
    const nodes = [...(article?.querySelectorAll(selector) || document.querySelectorAll(selector))];
    for (const node of nodes) {
      const text = node.textContent?.trim();
      if (!text) continue;
      if (text.startsWith('@')) continue;
      if (/^·$/.test(text)) continue;
      return text;
    }
  }

  const handleMatch = window.location.pathname.match(/^\/@?([^/]+)/);
  return handleMatch?.[1] || '';
}

function extractTweetText(article) {
  const textEl =
    article?.querySelector('[data-testid="tweetText"]') ||
    article?.querySelector('[lang]') ||
    document.querySelector('[data-testid="tweetText"]') ||
    document.querySelector('article [lang]');

  return textEl?.innerText?.trim() || '';
}

function extractTweetProfileImage(article) {
  const avatar =
    article?.querySelector('[data-testid="Tweet-User-Avatar"] img') ||
    article?.querySelector('a[href*="/photo"] img[src*="profile_images"]') ||
    article?.querySelector('img[src*="profile_images"]') ||
    document.querySelector('[data-testid="Tweet-User-Avatar"] img') ||
    document.querySelector('img[src*="profile_images"]');

  return avatar?.getAttribute('src') || avatar?.currentSrc || '';
}

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
    const tweetArticle = getPrimaryTweetArticle();
    const tweetAuthor = extractTweetAuthor(tweetArticle);
    const tweetText = extractTweetText(tweetArticle);
    const tweetProfileImage = extractTweetProfileImage(tweetArticle);

    data.tweetContent = tweetText; // full tweet goes to its own column
    if (tweetAuthor) data.author = tweetAuthor;
    if (tweetProfileImage) data.coverImage = tweetProfileImage;

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
  if (!data.author) {
    data.author =
    document.querySelector('meta[name="author"]')?.content ||
    document.querySelector('meta[property="article:author"]')?.content ||
    document.querySelector('[rel="author"]')?.textContent?.trim() ||
    document.querySelector('.author')?.textContent?.trim() ||
    document.querySelector('[class*="author"]')?.textContent?.trim() ||
    '';
  }

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
  if (!data.coverImage) {
    data.coverImage =
    document.querySelector('meta[property="og:image"]')?.content ||
    document.querySelector('meta[name="twitter:image"]')?.content ||
    '';
  }

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
