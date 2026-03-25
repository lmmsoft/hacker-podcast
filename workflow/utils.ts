import puppeteer from '@cloudflare/puppeteer'
import * as cheerio from 'cheerio'
import { $fetch } from 'ofetch'

async function getContentFromJina(url: string, format: 'html' | 'markdown', selector?: { include?: string, exclude?: string }, JINA_KEY?: string) {
  const jinaHeaders: HeadersInit = {
    'X-Retain-Images': 'none',
    'X-Return-Format': format,
  }

  if (JINA_KEY) {
    jinaHeaders.Authorization = `Bearer ${JINA_KEY}`
  }

  if (selector?.include) {
    jinaHeaders['X-Target-Selector'] = selector.include
  }

  if (selector?.exclude) {
    jinaHeaders['X-Remove-Selector'] = selector.exclude
  }

  console.info('get content from jina', url)
  const content = await $fetch(`https://r.jina.ai/${url}`, {
    headers: jinaHeaders,
    timeout: 30000,
    parseResponse: txt => txt,
  })
  return content
}

async function getContentFromFirecrawl(url: string, format: 'html' | 'markdown', selector?: { include?: string, exclude?: string }, FIRECRAWL_KEY?: string) {
  const firecrawlHeaders: HeadersInit = {
    Authorization: `Bearer ${FIRECRAWL_KEY}`,
  }

  try {
    console.info('get content from firecrawl', url)
    const result = await $fetch<{ success: boolean, data: Record<string, string> }>('https://api.firecrawl.dev/v2/scrape', {
      method: 'POST',
      headers: firecrawlHeaders,
      timeout: 30000,
      body: {
        url,
        formats: [format],
        onlyMainContent: true,
        includeTags: selector?.include ? [selector.include] : undefined,
        excludeTags: selector?.exclude ? [selector.exclude] : undefined,
      },
    })
    if (result.success) {
      return result.data[format] || ''
    }
    else {
      console.error(`get content from firecrawl failed: ${url} ${result}`)
      return ''
    }
  }
  catch (error: Error | any) {
    console.error(`get content from firecrawl failed: ${url} ${error}`, error.data)
    return ''
  }
}

export async function getHackerNewsTopStories(today: string, {
  RSS_SOURCE_LIST_URL,
  RSS_FEED_URLS,
}: {
  RSS_SOURCE_LIST_URL?: string
  RSS_FEED_URLS?: string
}) {
  const rssListUrl = RSS_SOURCE_LIST_URL || 'https://gist.githubusercontent.com/emschwartz/e6d2bf860ccc367fe37ff953ba6de66b/raw/'
  console.info('get RSS list from', rssListUrl)

  let rssListContent = RSS_FEED_URLS
  if (!rssListContent) {
    try {
      rssListContent = await $fetch(rssListUrl, {
        timeout: 30000,
        parseResponse: txt => txt,
      })
    }
    catch (error) {
      throw new Error(`failed to load rss source list: ${rssListUrl}, ${(error as Error).message}`)
    }
  }

  const rssUrls = parseRssUrlsFromList(rssListContent)
  if (!rssUrls.length) {
    throw new Error(`no rss sources found from list: ${rssListUrl}`)
  }

  const feedStories = await Promise.all(
    rssUrls.map(async (rssUrl) => {
      try {
        const xml = await $fetch(rssUrl, {
          timeout: 30000,
          parseResponse: txt => txt,
        })
        return parseStoriesFromRss(xml, rssUrl)
      }
      catch (error) {
        console.error('failed to fetch rss source', rssUrl, error)
        return [] as Story[]
      }
    }),
  )

  const dayStart = new Date(`${today}T00:00:00.000Z`).getTime()
  const dayEnd = new Date(`${today}T23:59:59.999Z`).getTime()

  const map = new Map<string, Story>()
  for (const story of feedStories.flat()) {
    if (!story.url || !story.title) {
      continue
    }

    if (story.publishedAt) {
      const publishedAt = new Date(story.publishedAt).getTime()
      if (!Number.isNaN(publishedAt) && (publishedAt < dayStart || publishedAt > dayEnd)) {
        continue
      }
    }

    const dedupeKey = story.url
    if (!map.has(dedupeKey)) {
      map.set(dedupeKey, story)
    }
  }

  const stories = Array.from(map.values())
    .sort((a, b) => {
      const aTime = a.publishedAt ? new Date(a.publishedAt).getTime() : 0
      const bTime = b.publishedAt ? new Date(b.publishedAt).getTime() : 0
      return bTime - aTime
    })
    .slice(0, 30)

  if (stories.length) {
    return stories
  }

  return Array.from(map.values()).slice(0, 30)
}

export async function getStoryContent(story: Story, maxTokens: number, { JINA_KEY, FIRECRAWL_KEY }: { JINA_KEY?: string, FIRECRAWL_KEY?: string }) {
  const article = await getContentFromJina(story.url!, 'markdown', {}, JINA_KEY)
    .catch((error) => {
      console.error('getHackerNewsStory from Jina failed', error)
      return getContentFromFirecrawl(story.url!, 'markdown', {}, FIRECRAWL_KEY)
    })
  return [
    story.title
      ? `
<title>
${story.title}
</title>
`
      : '',
    article
      ? `
<article>
${article.substring(0, maxTokens * 5)}
</article>
`
      : '',
  ].filter(Boolean).join('\n\n---\n\n')
}

function parseRssUrlsFromList(content: string): string[] {
  if (!content.trim()) {
    return []
  }

  if (content.includes('<opml') || content.includes('<outline')) {
    const $ = cheerio.load(content, { xml: true })
    const urls = $('outline[xmlUrl]')
      .map((_, el) => $(el).attr('xmlUrl')?.trim() || '')
      .get()
      .filter(Boolean)
    return Array.from(new Set(urls))
  }

  const urls = content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('http://') || line.startsWith('https://'))
  return Array.from(new Set(urls))
}

function getRssItemLink($: cheerio.CheerioAPI, el: cheerio.Element) {
  const atomAltLink = $(el).find('link[rel="alternate"]').attr('href')?.trim()
  if (atomAltLink) {
    return atomAltLink
  }

  const atomFirstLink = $(el).find('link').first().attr('href')?.trim()
  if (atomFirstLink) {
    return atomFirstLink
  }

  const rssLink = $(el).find('link').first().text().trim()
  if (rssLink) {
    return rssLink
  }

  return undefined
}

function getStoryId(link: string, guid: string, index: number) {
  const seed = link || guid || `${index}`
  const normalized = seed.replace(/[^a-z0-9]/gi, '-').replace(/^-+|-+$/g, '').slice(0, 64)
  return normalized || `story-${index}`
}

function parseStoriesFromRss(xml: string, sourceUrl: string): Story[] {
  const $ = cheerio.load(xml, { xml: true })
  const items = $('item, entry')
  return items.map((index, el) => {
    const title = ($(el).find('title').first().text() || '').trim()
    const link = getRssItemLink($, el)
    const guid = ($(el).find('guid, id').first().text() || '').trim()
    const publishedAt = ($(el).find('pubDate, published, updated').first().text() || '').trim()
    const safeLink = link || sourceUrl

    return {
      id: getStoryId(safeLink, guid, index),
      title,
      url: safeLink,
      hackerNewsUrl: safeLink,
      publishedAt: publishedAt || undefined,
    }
  }).get().filter(story => Boolean(story.title && story.url))
}

export async function concatAudioFiles(audioFiles: string[], BROWSER: Fetcher, { workerUrl }: { workerUrl: string }) {
  const browser = await puppeteer.launch(BROWSER)
  const page = await browser.newPage()
  await page.goto(`${workerUrl}/audio`)

  console.info('start concat audio files', audioFiles)
  const fileUrl = await page.evaluate(async (audioFiles) => {
    // 此处 JS 运行在浏览器中
    // @ts-expect-error 浏览器内的对象
    const blob = await concatAudioFilesOnBrowser(audioFiles)

    const result = new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
    return await result
  }, audioFiles) as string

  console.info('concat audio files result', fileUrl.substring(0, 100))

  await browser.close()

  const response = await fetch(fileUrl)
  return await response.blob()
}
