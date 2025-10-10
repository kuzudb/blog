import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import config from '@config/config.json';

export async function GET(context) {
  const posts = await getCollection('post');
  return rss({
    title: config.site.title,
    description: config.site.description,
    site: context.site,
    items: posts
      .slice()
      .sort((a, b) => new Date(b.data.pubDate) - new Date(a.data.pubDate))
      .map((post) => ({
        ...post.data,
        link: `/blog/post/${post.slug}/`,
      })),
  });
}
