import fs from "fs";
import path from "path";
import matter from "gray-matter";
import nunjucks from "nunjucks";
import MarkdownIt from "markdown-it";
import mila from "markdown-it-link-attributes";
import hljs from "highlight.js";
import mathjax3 from "markdown-it-mathjax3";

// 路径
const CONTENT_DIR = path.join(process.cwd(), "content", "posts");
const OUTPUT_DIR = path.join(process.cwd(), "dist");
const TEMPLATE_DIR = path.join(process.cwd(), "templates");

// Markdown 渲染器（带数学与高亮）
const md: MarkdownIt = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  highlight: (str: string, lang: string | undefined): string => {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return `<pre class="hljs"><code>${hljs.highlight(str, { language: lang, ignoreIllegals: true }).value}</code></pre>`;
      } catch (__) {}
    }
    return `<pre class="hljs"><code>${md.utils.escapeHtml(str)}</code></pre>`;
  },
})
  .use(mathjax3)
  .use(mila, {
    attrs: {
      target: "_blank",
      rel: "noopener",
    },
  });

// 配置 nunjucks（使用同一个 env，这样 addFilter 生效）
const env = nunjucks.configure(TEMPLATE_DIR, { autoescape: false });

// 注册日期/相对时间过滤器
env.addFilter("formatDate", function (dateStr: string, format = "YYYY-MM-DD") {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  if (format === "YYYY-MM-DD") return `${year}-${month}-${day}`;
  if (format === "YYYY/MM/DD") return `${year}/${month}/${day}`;
  return d.toISOString();
});

env.addFilter("daysAgo", function (dateStr: string) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "未知日期";
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days <= 0) return "今天";
  return `${days} 天前`;
});

// 确保输出目录存在
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

interface Post {
  title: string;
  date: string;
  tags: string[];
  content: string; // 渲染后的 HTML
  rawContent: string; // 原始 markdown
  slug: string;
  excerpt: string; // 列表页摘要
}

// 如果 Markdown 没有 front-matter，则自动补上并写回文件
function ensureFrontMatter(filePath: string) {
  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = matter(raw);
  if (!parsed.data || Object.keys(parsed.data).length === 0) {
    const slug = path.basename(filePath).replace(/\.md$/, "");
    const fm = {
      title: slug,
      date: new Date().toISOString(),
      tags: [],
    } as any;
    const newRaw = matter.stringify(parsed.content, fm);
    fs.writeFileSync(filePath, newRaw, "utf-8");
    return { data: fm, content: parsed.content };
  }
  return parsed;
}

function stripTags(html: string) {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function makeExcerptFromHtml(html: string, maxLen = 200) {
  // 尝试取第一个段落
  const m = html.match(/<p>([\s\S]*?)<\/p>/i);
  let txt = m ? stripTags(m[1]) : stripTags(html);
  if (txt.length > maxLen) txt = txt.slice(0, maxLen).trim() + "...";
  return txt;
}

function loadPosts(): Post[] {
  if (!fs.existsSync(CONTENT_DIR)) return [];
  const files = fs.readdirSync(CONTENT_DIR).filter(f => f.endsWith(".md"));

  const posts: Post[] = files.map(file => {
    const filePath = path.join(CONTENT_DIR, file);
    const parsed = ensureFrontMatter(filePath);
    const data = parsed.data || {};
    const rawContent = parsed.content || "";
    const rendered = md.render(rawContent);

    const slug = file.replace(/\.md$/, "");

    const excerpt = makeExcerptFromHtml(rendered, 220);

    return {
      title: data.title || slug,
      date: data.date || new Date().toISOString(),
      tags: data.tags || [],
      content: rendered,
      rawContent,
      slug,
      excerpt,
    } as Post;
  });

  // 按日期降序排列
  return posts.sort((a, b) => +new Date(b.date) - +new Date(a.date));
}

// 生成文章页
function buildPosts(posts: Post[]) {
  const postsDir = path.join(OUTPUT_DIR, "posts");
  fs.mkdirSync(postsDir, { recursive: true });
  posts.forEach(post => {
    // 传入 post 对象，模板使用 post.title / post.content 等
    const html = env.render("post-template.html", { post });
    fs.writeFileSync(path.join(postsDir, `${post.slug}.html`), html, "utf-8");
  });
}

// 生成文章列表页（带分页）
function buildList(posts: Post[], perPage = 5) {
  const totalPages = Math.ceil(posts.length / perPage);
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);

  for (let page = 1; page <= totalPages; page++) {
    const start = (page - 1) * perPage;
    const end = start + perPage;
    const pagePosts = posts.slice(start, end);

    const html = env.render("list-template.html", {
      posts: pagePosts,
      currentPage: page,
      totalPages,
      pages,
    });

    const filePath = page === 1
      ? path.join(OUTPUT_DIR, "index.html")
      : path.join(OUTPUT_DIR, `page${page}.html`);

    fs.writeFileSync(filePath, html, "utf-8");
  }
}

// 生成标签页
function buildTags(posts: Post[]) {
  const tagMap: Record<string, Post[]> = {};

  posts.forEach(post => {
    (post.tags || []).forEach(tag => {
      if (!tagMap[tag]) tagMap[tag] = [];
      tagMap[tag].push(post);
    });
  });

  const tagDir = path.join(OUTPUT_DIR, "tags");
  fs.mkdirSync(tagDir, { recursive: true });

  Object.entries(tagMap).forEach(([tag, tagPosts]) => {
    const dir = path.join(tagDir, tag);
    fs.mkdirSync(dir, { recursive: true });

    const html = env.render("list-template.html", {
      tag,
      posts: tagPosts,
    });

    fs.writeFileSync(path.join(dir, "index.html"), html, "utf-8");
  });
}

// 生成 sitemap.xml（指向实际生成的 HTML）
function buildSitemap(posts: Post[]) {
  const urls = [
    { loc: "/", lastmod: new Date().toISOString() },
    ...posts.map(p => ({ loc: `/posts/${p.slug}.html`, lastmod: p.date })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map(u =>
      ` <url>\n <loc>${u.loc}</loc>\n <lastmod>${u.lastmod}</lastmod>\n </url>`
    ).join("\n") +
    `\n</urlset>`;

  fs.writeFileSync(path.join(OUTPUT_DIR, "sitemap.xml"), xml, "utf-8");
}

function copyStyle() {
  const src = path.join(process.cwd(), "static", "style.css");
  const dest = path.join(OUTPUT_DIR, "style.css");

  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log("✅ style.css copied to dist/");
  } else {
    console.warn("⚠️ style.css not found in project root.");
  }
}

// 执行构建
const posts = loadPosts();
buildPosts(posts);
buildList(posts);
buildTags(posts);
buildSitemap(posts);
copyStyle();

console.log(`Built ${posts.length} posts → ${OUTPUT_DIR}`);
