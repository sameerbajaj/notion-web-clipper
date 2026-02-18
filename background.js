// Background service worker

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: 'options.html' });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'saveToNotion') {
    handleSaveToNotion(request.payload)
      .then(result => sendResponse({ success: true, result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'createDatabase') {
    handleCreateDatabase(request.payload)
      .then(result => sendResponse({ success: true, result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'getDatabases') {
    handleGetDatabases(request.token)
      .then(result => sendResponse({ success: true, result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'searchPages') {
    handleSearchPages(request.token, request.query)
      .then(result => sendResponse({ success: true, result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'getDatabase') {
    handleGetDatabase(request.token, request.databaseId)
      .then(result => sendResponse({ success: true, result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

async function handleSaveToNotion({ token, databaseId, pageData, extraProperties }) {
  const properties = buildNotionProperties(pageData);
  const children = buildNotionBlocks(pageData);

  // Merge dynamic extra properties chosen by user in popup
  if (extraProperties && typeof extraProperties === 'object') {
    for (const [key, value] of Object.entries(extraProperties)) {
      if (!value || (Array.isArray(value) && !value.length)) continue;
      if (Array.isArray(value)) {
        properties[key] = { multi_select: value.map(v => ({ name: v })) };
      } else {
        properties[key] = { select: { name: value } };
      }
    }
  }

  const body = {
    parent: { database_id: databaseId },
    icon: pageData.favicon
      ? { type: 'external', external: { url: pageData.favicon } }
      : undefined,
    cover: pageData.coverImage
      ? { type: 'external', external: { url: pageData.coverImage } }
      : undefined,
    properties,
    children,
  };

  // Remove undefined values
  if (!body.icon) delete body.icon;
  if (!body.cover) delete body.cover;

  const response = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || `Notion API error: ${response.status}`);
  }

  return await response.json();
}

function buildNotionProperties(pageData) {
  const props = {
    // Title
    title: {
      title: [{ text: { content: pageData.title || 'Untitled' } }]
    },
    // Source URL
    source: {
      url: pageData.url || null
    },
    // Created
    created: {
      date: { start: new Date().toISOString().split('T')[0] }
    },
    // Type
    type: {
      select: { name: pageData.type || 'webpage' }
    },
    // Site
    site: {
      rich_text: [{ text: { content: pageData.siteName || '' } }]
    },
  };

  // Author
  if (pageData.author) {
    props.author = {
      rich_text: [{ text: { content: pageData.author } }]
    };
  }

  // Published date
  if (pageData.publishedDate) {
    try {
      const d = new Date(pageData.publishedDate);
      if (!isNaN(d.getTime())) {
        props.published = {
          date: { start: d.toISOString().split('T')[0] }
        };
      }
    } catch (_) {}
  }

  // Description
  if (pageData.description) {
    props.description = {
      rich_text: [{ text: { content: pageData.description.slice(0, 2000) } }]
    };
  }

  // Tags
  if (pageData.tags && pageData.tags.length > 0) {
    props.tags = {
      multi_select: pageData.tags.map(t => ({ name: t }))
    };
  } else if (pageData.keywords && pageData.keywords.length > 0) {
    props.tags = {
      multi_select: pageData.keywords.slice(0, 5).map(t => ({ name: t }))
    };
  }

  // Cover image URL stored separately as a property
  if (pageData.coverImage) {
    props['cover image'] = {
      url: pageData.coverImage
    };
  }

  // Full tweet text as its own rich_text column
  if (pageData.tweetContent) {
    props['tweet'] = {
      rich_text: [{ text: { content: pageData.tweetContent.slice(0, 2000) } }]
    };
  }

  return props;
}

function buildNotionBlocks(pageData) {
  const blocks = [];

  if (pageData.selectedText) {
    blocks.push({
      object: 'block',
      type: 'callout',
      callout: {
        rich_text: [{ text: { content: pageData.selectedText.slice(0, 2000) } }],
        icon: { emoji: '✂️' },
        color: 'yellow_background',
      }
    });
    blocks.push({ object: 'block', type: 'divider', divider: {} });
  }

  // Notes section placeholder
  blocks.push({
    object: 'block',
    type: 'callout',
    callout: {
      rich_text: [{ text: { content: 'Add your notes here...' } }],
      icon: { emoji: '💭' },
      color: 'gray_background',
    }
  });

  blocks.push({ object: 'block', type: 'divider', divider: {} });

  // Source link
  if (pageData.url) {
    blocks.push({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [{
          text: { content: '🔗 Source: ', link: null },
          annotations: { bold: true }
        }, {
          text: { content: pageData.url, link: { url: pageData.url } }
        }]
      }
    });
  }

  blocks.push({ object: 'block', type: 'divider', divider: {} });

  // Content blocks (up to 90 blocks, Notion limit is 100 per request)
  if (pageData.content && pageData.content.length > 0) {
    const contentBlocks = pageData.content.slice(0, 85).map(item => {
      const text = item.text.slice(0, 2000);
      if (['h1', 'h2', 'h3'].includes(item.tag)) {
        return {
          object: 'block',
          type: `heading_${item.tag.slice(1)}`,
          [`heading_${item.tag.slice(1)}`]: {
            rich_text: [{ text: { content: text } }]
          }
        };
      }
      if (item.tag === 'blockquote') {
        return {
          object: 'block',
          type: 'quote',
          quote: { rich_text: [{ text: { content: text } }] }
        };
      }
      if (item.tag === 'li') {
        return {
          object: 'block',
          type: 'bulleted_list_item',
          bulleted_list_item: { rich_text: [{ text: { content: text } }] }
        };
      }
      return {
        object: 'block',
        type: 'paragraph',
        paragraph: { rich_text: [{ text: { content: text } }] }
      };
    });
    blocks.push(...contentBlocks);
  }

  return blocks;
}

async function handleCreateDatabase({ token, parentPageId, databaseName }) {
  const body = {
    parent: { type: 'page_id', page_id: parentPageId },
    title: [{ type: 'text', text: { content: databaseName || 'Web Clippings' } }],
    icon: { type: 'emoji', emoji: '📎' },
    is_inline: false,
    properties: {
      title: { title: {} },
      source: { url: {} },
      author: { rich_text: {} },
      published: { date: {} },
      created: { date: {} },
      description: { rich_text: {} },
      tags: { multi_select: { options: [] } },
      type: {
        select: {
          options: [
            { name: 'article', color: 'blue' },
            { name: 'tweet', color: 'blue' },
            { name: 'video', color: 'red' },
            { name: 'repository', color: 'gray' },
            { name: 'discussion', color: 'orange' },
            { name: 'webpage', color: 'default' },
            { name: 'design', color: 'pink' },
            { name: 'tool', color: 'green' },
          ]
        }
      },
      site: { rich_text: {} },
      'cover image': { url: {} },
      tweet: { rich_text: {} },
    }
  };

  const response = await fetch('https://api.notion.com/v1/databases', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || `Failed to create database: ${response.status}`);
  }

  return await response.json();
}

async function handleGetDatabases(token) {
  const response = await fetch('https://api.notion.com/v1/search', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    },
    body: JSON.stringify({
      filter: { value: 'database', property: 'object' },
      sort: { direction: 'descending', timestamp: 'last_edited_time' },
      page_size: 50,
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || `Failed to fetch databases: ${response.status}`);
  }

  const data = await response.json();
  return data.results.map(db => ({
    id: db.id,
    name: db.title?.[0]?.plain_text || 'Untitled Database',
    lastEdited: db.last_edited_time,
  }));
}

async function handleSearchPages(token, query) {
  const response = await fetch('https://api.notion.com/v1/search', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    },
    body: JSON.stringify({
      query: query || '',
      filter: { value: 'page', property: 'object' },
      sort: { direction: 'descending', timestamp: 'last_edited_time' },
      page_size: 30,
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || `Failed to search pages: ${response.status}`);
  }

  const data = await response.json();
  return data.results.map(page => ({
    id: page.id,
    name: page.properties?.title?.title?.[0]?.plain_text ||
          page.title?.[0]?.plain_text ||
          'Untitled Page',
  }));
}

async function handleGetDatabase(token, databaseId) {
  const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    },
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || `Failed to fetch database schema: ${response.status}`);
  }

  const db = await response.json();

  // Extract only select and multi_select properties (and their options) that are user-defined
  // Note: 'tags' is NOT skipped — it's a multi_select users want to pick from
  const SKIP = new Set(['title', 'source', 'author', 'published', 'created', 'description',
    'type', 'site', 'cover image', 'tweet']);

  const customProps = [];
  for (const [name, prop] of Object.entries(db.properties || {})) {
    if (SKIP.has(name.toLowerCase())) continue;
    if (prop.type === 'select') {
      customProps.push({
        name,
        type: 'select',
        options: (prop.select?.options || []).map(o => ({ name: o.name, color: o.color })),
      });
    } else if (prop.type === 'multi_select') {
      customProps.push({
        name,
        type: 'multi_select',
        options: (prop.multi_select?.options || []).map(o => ({ name: o.name, color: o.color })),
      });
    }
  }

  return {
    id: db.id,
    name: db.title?.[0]?.plain_text || 'Untitled',
    customProps,
  };
}
