# Notion Web Clipper

A beautiful Chrome extension to clip any webpage directly into a Notion database — your personal mood board and knowledge vault.

![Extension popup](https://img.shields.io/badge/Chrome-Extension-yellow?logo=googlechrome&logoColor=black) ![Manifest V3](https://img.shields.io/badge/Manifest-V3-black) ![Notion API](https://img.shields.io/badge/Notion-API-white?logo=notion&logoColor=black)

## Features

- **Smart title extraction** — tweets get "Tweet by @author" titles; full tweet text saved in its own column
- **Full page content** — saves article body as structured Notion blocks (headings, paragraphs, quotes, lists)
- **Auto-extracted metadata** — title, author, published date, description, cover image, favicon, site name, tags
- **Dynamic database properties** — when you select a Notion database, its `select` and `multi_select` fields auto-populate as clickable chips in the popup
- **Create database** — create a new clipping database inside any Notion page, right from the popup
- **Mood board ready** — cover images, tags, and all metadata saved as database columns for gallery view
- **Selected text** — highlights any text you selected before clipping

## Fields saved to Notion

| Property | Type | Description |
|---|---|---|
| title | Title | Clean page/tweet title |
| source | URL | Original page URL |
| author | Text | Author or @handle |
| published | Date | Article publish date |
| created | Date | Date clipped |
| description | Text | Meta description |
| tags | Multi-select | Keywords / manual tags |
| type | Select | article, tweet, video, repository, etc. |
| site | Text | Domain name |
| cover image | URL | og:image URL |
| tweet | Text | Full tweet text (Twitter/X only) |
| + any custom select/multi_select props | — | Pre-populated from your DB schema |

## Setup

### 1. Load the extension in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **"Load unpacked"** and select this folder

### 2. Create a Notion Integration

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Click **"+ New integration"**
3. Name it (e.g. "Web Clipper"), select your workspace
4. Under **Capabilities**, enable: **Read content**, **Insert content**, **Read user information**
5. Click **Save** and copy the **Internal Integration Secret** (starts with `ntn_` or `secret_`)

### 3. Connect pages to your integration

In every Notion page you want to use as a parent for clipped databases:

> Click `⋯` (top right) → **Connections** → **Add connection** → select your integration

### 4. Configure the extension

1. Click the extension icon → **Settings** (gear icon)
2. Paste your integration token → **Verify** → **Save**
3. Optionally set a default database

## Usage

1. Navigate to any webpage, article, or tweet
2. Click the Notion Clipper extension icon
3. Review / edit the extracted metadata
4. Select (or create) a destination database
5. Select values for any custom database properties (they auto-populate!)
6. Click **Save to Notion**

## Security

- Your Notion token is stored in `chrome.storage.sync` (encrypted by Chrome, tied to your Google account)
- The token is **only** sent to `https://api.notion.com` — never to any third-party server
- No analytics, no telemetry, no external dependencies

## Tech Stack

- Manifest V3 Chrome Extension
- Vanilla JS (no build step required)
- Notion API `2022-06-28`

## License

MIT
