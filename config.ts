/* eslint-disable node/prefer-global/process */
import type { Podcast, Site } from '@/types/podcast'

const defaultTitle = 'Agili 的 Hacker Podcast'
const defaultDescription
  = '一个基于 AI 的 Hacker News 中文播客项目，每天自动抓取 Hacker News 热门文章，通过 AI 生成中文总结并转换为播客内容。'
const defaultBaseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://hacker-podcast.agi.li'

export const keepDays = 30

export const podcast: Podcast = {
  base: {
    title: defaultTitle,
    description: defaultDescription,
    link: defaultBaseUrl,
    cover: '/logo.png',
  },
  hosts: [
    {
      name: 'Gemini',
      link: 'https://gemini.google',
    },
    {
      name: 'MiniMax',
      link: 'https://www.minimaxi.com/audio',
    },
  ],
  platforms: [
    {
      id: 'youtube',
      name: 'YouTube',
      link: 'https://www.youtube.com/@hacker-podcast-daily',
    },
    {
      id: 'apple',
      name: 'Apple Podcasts',
      link: 'https://podcasts.apple.com/us/podcast/Hacker-Podcast/id1809638204',
    },
    {
      id: 'spotify',
      name: 'Spotify',
      link: 'https://open.spotify.com/show/63cre75hc25H7McAY5bzyo',
    },
    {
      id: 'xiaoyuzhou',
      name: '小宇宙',
      link: 'https://www.xiaoyuzhoufm.com/podcast/67b06023606e5c59409cd9ba',
    },
    {
      id: 'rss',
      name: 'RSS',
      link: `${defaultBaseUrl}/rss.xml`,
    },
  ],
}

export const site: Site = {
  themeColor: 'orange',
  pageSize: 7,
  defaultDescriptionLength: 200,
  seo: {
    siteName: defaultTitle,
    defaultTitle,
    defaultDescription,
    defaultImage: '/opengraph-image.png',
    twitterHandle: '',
    locale: 'zh_CN',
  },
  favicon: '/favicon.ico',
}

export const externalLinks = {
  github: 'https://github.com/miantiao-me/hacker-podcast',
  rss: '/rss.xml',
}

export const defaultLlmBaseUrl = 'https://open.bigmodel.cn/api/paas/v4'
export const defaultLlmModel = 'glm-4.7-flash'

export const podcastTitle = podcast.base.title
export const podcastDescription = podcast.base.description
