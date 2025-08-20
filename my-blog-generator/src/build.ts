import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import MarkdownIt from 'markdown-it';
import mathjax3 from "markdown-it-mathjax3";   //数学公式插件

// 配置
const POSTS_PER_PAGE = 6;
const CONTENT_DIR = path.join(process.cwd(), 'content/posts');  //文章目录
const DIST = path.join(process.cwd(), 'dist');
const TEMPLATE_DIR = path.join(process.cwd(), 'templates');
const STATIC_DIR = path.join(process.cwd(), 'static');

// 工具
//确保目录存在
function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}   
//格式化日期
function formatDate(d: string | Date) {
  const dt = new Date(d);
  return dt.toISOString().split('T')[0];
}  
//计算几天前
function daysAgo(date: string | Date) {
  const now = Date.now();
  const d = new Date(date).getTime();
  const diff = Math.max(0, now - d);
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return '今天';
  if (days === 1) return '1 天前';
  return `${days} 天前`;
}
//读取文件内容
function readFile(p: string) {
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : '';
}
// 转义 HTML
function escapeHtml(s: string) {
  return s
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');
}

// 加载文章
const md = new MarkdownIt({ html: true }).use(mathjax3);
const posts: any[] = [];  
//依次读取 content/posts 下的 Markdown 文件，解析并生成文章对象
if (fs.existsSync(CONTENT_DIR)) {
  for (const file of fs.readdirSync(CONTENT_DIR).filter(f => f.endsWith('.md'))) {
    const full = path.join(CONTENT_DIR, file);
    const raw = fs.readFileSync(full, 'utf-8');
    const { data, content } = matter(raw);
    const html = md.render(content);
    const stats = fs.statSync(full);
    const slug = file.replace(/\.md$/, '');
    const title = data.title || slug;
    const date = data.date ? new Date(data.date).toISOString() : stats.birthtime.toISOString();
    const updated = stats.mtime.toISOString();
    const tags: string[] = Array.isArray(data.tags) ? data.tags.map(String) : [];
    // 文章摘要（读取第一段）
    const summary = data.summary
      ? String(data.summary)
      : (content.trim().split('\n')[0] || '').slice(0, 140) + '...';
    posts.push({ slug, title, date, updated, tags, content: html, summary });
  }
}

// 排序：date 降序
posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
const totalPages = Math.ceil(posts.length / POSTS_PER_PAGE);

// 清理并准备输出。删除旧的 dist，重新生成。
fs.rmSync(DIST, { recursive: true, force: true });
ensureDir(DIST);
if (fs.existsSync(STATIC_DIR)) {
  fs.cpSync(STATIC_DIR, path.join(DIST, 'static'), { recursive: true });
}

// 读取 header/footer（可以插入 responsive meta 和基础 CSS）
const header = readFile(path.join(TEMPLATE_DIR, 'header.html'));
const footer = readFile(path.join(TEMPLATE_DIR, 'footer.html'));

// 生成分页导航 HTML（首页/前后/末页）
function renderPagination(cur: number, total: number) {
  let nav = `<div class="pagination">`;
  if (cur > 1) {
    nav += `<a href="${cur === 2 ? '/index.html' : '/page/' + (cur - 1) + '/index.html'}">上一页</a>`;
  }
  nav += ` <span>第 ${cur} / ${total} 页</span> `;
  if (cur < total) {
    nav += `<a href="/page/${cur + 1}/index.html">下一页</a>`;
  }
  nav += ` <a href="/">首页</a> <a href="/page/${total}/index.html">末页</a>`;
  nav += `</div>`;
  return nav;
}
// 生成文章列表项，每篇文章生成一个独立页面：地址：/posts/slug/index.html
function renderPostSummary(post: any) {
  const tagLinks = post.tags.map((t: string) => `<a href="/tags/${encodeURIComponent(t)}/index.html">${escapeHtml(t)}</a>`).join(' ');
  return `
  <div class="post-summary">
    <h2><a href="/posts/${post.slug}/index.html">${escapeHtml(post.title)}</a></h2>
    <div class="meta">
      发布：${formatDate(post.date)}（${daysAgo(post.date)}） | 更新：${formatDate(post.updated)}（${daysAgo(post.updated)}）
    </div>
    <p>${escapeHtml(post.summary)}</p>
    <div class="tags">${tagLinks}</div>
  </div>`;
} 

// 1. 生成首页 & 分页
for (let page = 1; page <= totalPages; page++) {
  const start = (page - 1) * POSTS_PER_PAGE;
  const slice = posts.slice(start, start + POSTS_PER_PAGE);
  const listHtml = slice.map(renderPostSummary).join('\n');
  const paginationHtml = renderPagination(page, totalPages);
  const body = `
  <main class="container">
    <h1>文章列表</h1>
    ${listHtml}
    ${paginationHtml}
  </main>`;
  const full = `${header}${body}${footer}`;
  const targetDir = page === 1 ? DIST : path.join(DIST, 'page', String(page));
  ensureDir(targetDir);
  fs.writeFileSync(path.join(targetDir, 'index.html'), full, 'utf-8');
}

// 2. 生成文章详情页
for (const post of posts) {
  const tagLinks = post.tags.map((t: string) => `<a href="/tags/${encodeURIComponent(t)}/index.html">${escapeHtml(t)}</a>`).join(' ');
  const body = `
  <main class="container">
    <h1>${escapeHtml(post.title)}</h1>
    <div class="meta">
      发布：${formatDate(post.date)}（${daysAgo(post.date)}） | 更新：${formatDate(post.updated)}（${daysAgo(post.updated)}）
    </div>
    <div class="tags">标签：${tagLinks}</div>
    <article class="content">${post.content}</article>
  </main>`;
  const full = `${header}${body}${footer}`;
  const targetDir = path.join(DIST, 'posts', post.slug);
  ensureDir(targetDir);
  fs.writeFileSync(path.join(targetDir, 'index.html'), full, 'utf-8');
}

// 3. 标签页
const tagMap: Record<string, any[]> = {};
for (const post of posts) {
  for (const tag of post.tags) {
    tagMap[tag] = tagMap[tag] || [];
    tagMap[tag].push(post);
  }
}
for (const tag of Object.keys(tagMap)) {
  const tagged = tagMap[tag]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .map(renderPostSummary)
    .join('\n');
  const body = `
  <main class="container">
    <h1>标签：${escapeHtml(tag)}</h1>
    ${tagged}
  </main>`;
  const full = `${header}${body}${footer}`;
  const targetDir = path.join(DIST, 'tags', tag);
  ensureDir(targetDir);
  fs.writeFileSync(path.join(targetDir, 'index.html'), full, 'utf-8');
}

// 4. sitemap
function generateSitemap() {
  const baseUrl = 'https://example.com'; // 替换为真实域名
  const urls = new Set<string>();
  urls.add(`${baseUrl}/`);
  for (let i = 2; i <= totalPages; i++) urls.add(`${baseUrl}/page/${i}/`);
  for (const post of posts) urls.add(`${baseUrl}/posts/${post.slug}/`);
  for (const tag of Object.keys(tagMap)) urls.add(`${baseUrl}/tags/${encodeURIComponent(tag)}/`);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...urls].map(u => `  <url>
    <loc>${u}</loc>
  </url>`).join('\n')}
</urlset>`;
  fs.writeFileSync(path.join(DIST, 'sitemap.xml'), xml, 'utf-8');
}
generateSitemap();

console.log('构建完成，文章:', posts.length);
