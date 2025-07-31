import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import MarkdownIt from 'markdown-it';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';

const POSTS_PER_PAGE = 15;
const CONTENT_DIR = path.join(process.cwd(), 'content/posts');
const DIST = path.join(process.cwd(), 'dist');
const TEMPLATE_DIR = path.join(process.cwd(), 'templates');
const STATIC_DIR = path.join(process.cwd(), 'static');

function readTemplate(name: string) {
  return fs.readFileSync(path.join(TEMPLATE_DIR, name), 'utf-8');
}
function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}
function daysAgo(date: string | Date) {
  const now = new Date();
  const d = new Date(date);
  const diffMs = now.getTime() - d.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days === 0) return '今天';
  if (days === 1) return '1 天前';
  return `${days} 天前`;
}
function formatDate(d: string | Date) {
  const dt = new Date(d);
  return dt.toISOString().split('T')[0];
}


// 读取 markdown
const md = new MarkdownIt({ html: true });
const postFiles = fs.existsSync(CONTENT_DIR)
  ? fs.readdirSync(CONTENT_DIR).filter(f => f.endsWith('.md'))
  : [];

interface Post {
  slug: string;
  title: string;
  date: string;
  updated: string;
  tags: string[];
  content: string;
  rawContent: string;
  summary: string;
}
const posts: Post[] = [];

for (const file of postFiles) {
  const filePath = path.join(CONTENT_DIR, file);
  const raw = fs.readFileSync(filePath, 'utf-8');
  const { data, content } = matter(raw);
  const html = md.render(content);
  const stats = fs.statSync(filePath);
  const slug = file.replace(/\.md$/, '');
  const title = data.title || slug;
  const date = data.date ? new Date(data.date).toISOString() : stats.birthtime.toISOString();
  const updated = stats.mtime.toISOString();
  const tags: string[] = Array.isArray(data.tags) ? data.tags.map(String) : [];
  const summary = data.summary
    ? String(data.summary)
    : (content.trim().split('\n')[0] || '').slice(0, 140) + '...';

  posts.push({ slug, title, date, updated, tags, content: html, rawContent: content, summary });
}

// 排序
posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
const totalPages = Math.ceil(posts.length / POSTS_PER_PAGE);

// 模板
const headerTpl = readTemplate('header.html');
const footerTpl = readTemplate('footer.html');
const listTpl = readTemplate('list-template.html');
const postTpl = readTemplate('post-template.html');
const tagTpl = readTemplate('tag-template.html');

// 清理并准备输出
fs.rmSync(DIST, { recursive: true, force: true });
ensureDir(DIST);
if (fs.existsSync(STATIC_DIR)) {
  fs.cpSync(STATIC_DIR, path.join(DIST, 'static'), { recursive: true });
}
function makePagination(current: number, total: number) {
  const pages: number[] = [];
  for (let i = 1; i <= total; i++) pages.push(i);
  return { current, total, pages };
}

async function generateListPages() {
  for (let page = 1; page <= totalPages; page++) {
    const start = (page - 1) * POSTS_PER_PAGE;
    const pagePosts = posts.slice(start, start + POSTS_PER_PAGE);
    const app = createSSRApp({
      data: () => ({
        posts: pagePosts,
        page,
        totalPages,
        pagination: makePagination(page, totalPages),
        daysAgoFn: daysAgo,
        formatDate
      }),
      template: listTpl
    });
    const inner = await renderToString(app);
    const full = headerTpl + inner + footerTpl;
    const targetDir = page === 1 ? path.join(DIST) : path.join(DIST, 'page', String(page));
    ensureDir(targetDir);
    fs.writeFileSync(path.join(targetDir, 'index.html'), full, 'utf-8');
  }
}

async function generatePostPages() {
  for (const post of posts) {
    const app = createSSRApp({
      data: () => ({
        title: post.title,
        date: post.date,
        updated: post.updated,
        content: post.content,
        tags: post.tags,
        slug: post.slug,
        daysAgoFn: daysAgo,
        formatDate
      }),
      template: postTpl
    });
    const inner = await renderToString(app);
    const full = headerTpl + inner + footerTpl;
    const targetDir = path.join(DIST, 'posts', post.slug);
    ensureDir(targetDir);
    fs.writeFileSync(path.join(targetDir, 'index.html'), full, 'utf-8');
  }
}

async function generateTagPages() {
  const tagMap: Record<string, Post[]> = {};
  for (const post of posts) {
    for (const tag of post.tags) {
      tagMap[tag] = tagMap[tag] || [];
      tagMap[tag].push(post);
    }
  }
  for (const tag of Object.keys(tagMap)) {
    const tagged = tagMap[tag];
    tagged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const app = createSSRApp({
      data: () => ({ tag, posts: tagged, daysAgoFn: daysAgo, formatDate }),
      template: tagTpl
    });
    const inner = await renderToString(app);
    const full = headerTpl + inner + footerTpl;
    const targetDir = path.join(DIST, 'tags', encodeURIComponent(tag));
    ensureDir(targetDir);
    fs.writeFileSync(path.join(targetDir, 'index.html'), full, 'utf-8');
  }
}

function generateSitemap() {
  const baseUrl = 'https://BLOGGEN_WEST2.com'; // 替换为你自己的域名
  const urls: string[] = [];
  urls.push(`${baseUrl}/`);
  for (let i = 2; i <= totalPages; i++) {
    urls.push(`${baseUrl}/page/${i}/`);
  }
  for (const post of posts) {
    urls.push(`${baseUrl}/posts/${post.slug}/`);
  }
  const tags = new Set<string>();
  posts.forEach(p => p.tags.forEach(t => tags.add(t)));
  for (const tag of tags) {
    urls.push(`${baseUrl}/tags/${encodeURIComponent(tag)}/`);
  }
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u}</loc>
  </url>`).join('\n')}
</urlset>`;
  fs.writeFileSync(path.join(DIST, 'sitemap.xml'), sitemap, 'utf-8');
}
console.log('找到的文章数量:', posts.length);
posts.forEach(p => {
  console.log(`- slug=${p.slug}, title=${p.title}, date=${p.date}, updated=${p.updated}, tags=${p.tags.join(',')}`);
});
(async function main() {
  await generateListPages();
  await generatePostPages();
  await generateTagPages();
  generateSitemap();
  console.log('构建完成，输出在 dist/ 目录');
})();
