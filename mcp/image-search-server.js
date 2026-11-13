'use strict';

/**
 * nodepgadmin-image-search — MCP-сервер поиска картинок, логотипов и иконок.
 * Работает через stdin/stdout по протоколу Model Context Protocol (stdio).
 * Источники: Wikimedia Commons API (без API-ключа) + DuckDuckGo HTML (fallback).
 */

const http = require('http');
const https = require('https');
const { StringDecoder } = require('string_decoder');

const USER_AGENT = 'nodepgadmin-image-search/1.0 (contact: admin@example.com)';

function get(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https:') ? https : http;
    const req = lib.get(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
    req.on('error', reject);
    let data = '';
    res = req.res;
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      if (res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      resolve(data);
    });
  });
}

let res;

/**
 * Поиск изображений в Wikimedia Commons.
 */
async function searchWikimedia(query, limit = 10) {
  const qs = encodeURIComponent(query.trim());
  const url =
    'https://commons.wikimedia.org/w/api.php?' +
    'action=query&generator=search&gsrsearch=' + qs +
    '&gsrnamespace=6&gsrlimit=' + limit +
    '&prop=imageinfo&iiprop=url|size|dimensions&iiurlwidth=128&iiurlheight=128' +
    '&format=json&origin=*';
  const text = await get(url);
  const json = JSON.parse(text);
  const pages = json.query && json.query.pages;
  if (!pages) return [];
  return Object.values(pages).map((p) => {
    const ii = (p.imageinfo && p.imageinfo[0]) || {};
    return {
      url: ii.thumburl || ii.url,
      sourceUrl: ii.url,
      title: p.title,
      source: 'Wikimedia Commons',
      width: ii.thumbwidth || ii.width,
      height: ii.thumbheight || ii.height,
    };
  });
}

/**
 * Поиск изображений через DuckDuckGo HTML (fallback).
 */
async function searchDuckDuckGo(query, limit = 10) {
  const qs = encodeURIComponent(query.trim());
  const url = 'https://duckduckgo.com/html/?q=' + qs + '+icon';
  let text;
  try {
    text = await get(url);
  } catch (e) {
    return [];
  }
  const results = [];
  const re = /<a rel="nofollow" class="result__a" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(text)) && results.length < limit) {
    const href = m[1];
    const title = m[2].replace(/<[^>]+>/g, '').trim();
    if (href && title) {
      results.push({
        url: href,
        sourceUrl: href,
        title: title || 'DuckDuckGo результат',
        source: 'DuckDuckGo',
        width: null,
        height: null,
      });
    }
  }
  return results;
}

/**
 * Выполнение поиска картинок.
 */
async function searchImages({ query, limit = 8 }) {
  if (!query || !query.trim()) return [];
  let items = [];
  try {
    items = await searchWikimedia(query, limit);
  } catch (e) {
    // fall through to DDG
  }
  if (items.length === 0) {
    try {
      items = await searchDuckDuckGo(query, limit);
    } catch (e) {
      return [];
    }
  }
  return items.slice(0, limit);
}

/* ---------------- MCP stdio transport ---------------- */

const decoder = new StringDecoder('utf8');
let buffer = '';
let contentLength = null;
let body = '';

function send(obj) {
  const payload = JSON.stringify(obj);
  const len = Buffer.byteLength(payload, 'utf8');
  process.stdout.write('Content-Length: ' + len + '\r\n\r\n' + payload);
}

function onMessage(message) {
  const { jsonrpc, id, method, params } = message;
  if (jsonrpc !== '2.0') return;
  console.error('[MCP] <-', method, id);
  const respond = (result) => send({ jsonrpc: '2.0', id, result });
  const fail = (code, msg) => send({ jsonrpc: '2.0', id, error: { code, message: msg } });

  try {
    if (method === 'initialize') {
      respond({
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'nodepgadmin-image-search', version: '1.0.0' },
      });
    } else if (method === 'initialized') {
      // уведомление, ответа не требуется
    } else if (method === 'tools/list') {
      respond({
        tools: [
          {
            name: 'search_images',
            description:
              'Ищет картинки, логотипы и иконки по запросу (Wikimedia Commons + DuckDuckGo fallback).',
            inputSchema: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'Поисковый запрос' },
                limit: { type: 'number', description: 'Максимум результатов', default: 8 },
              },
              required: ['query'],
            },
          },
        ],
      });
    } else if (method === 'tools/call') {
      const { name, arguments: args } = params || {};
      if (name === 'search_images') {
        searchImages({ query: args.query, limit: args.limit })
          .then((items) => respond({ items }))
          .catch((err) => fail(-32603, err.message));
      } else {
        fail(-32601, 'Метод не найден: ' + name);
      }
    } else {
      fail(-32601, 'Метод не найден: ' + method);
    }
  } catch (err) {
    fail(-32603, err.message);
  }
}

function feed(data) {
  buffer += decoder.write(data);
  while (buffer.length > 0) {
    if (contentLength === null) {
      const idx = buffer.indexOf('\r\n\r\n');
      if (idx === -1) break;
      const head = buffer.slice(0, idx);
      const m = head.match(/^Content-Length:\s*(\d+)/i);
      if (!m) {
        buffer = '';
        break;
      }
      contentLength = parseInt(m[1], 10);
      buffer = buffer.slice(idx + 4);
    }
    if (buffer.length < contentLength) break;
    body = buffer.slice(0, contentLength);
    buffer = buffer.slice(contentLength);
    contentLength = null;
    try {
      onMessage(JSON.parse(body));
    } catch (e) {
      // игнорируем битые сообщения
    }
    body = '';
  }
}

process.stdin.on('data', (d) => feed(d));
process.stdin.on('end', () => process.exit(0));
process.on('uncaughtException', (err) => {
  console.error('MCP server fatal:', err.message);
  process.exit(1);
});
