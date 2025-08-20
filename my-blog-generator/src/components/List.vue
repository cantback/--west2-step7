<template>
  <div class="list">
    <h1>文章列表</h1>
    <div v-for="post in posts" :key="post.slug" class="post-summary">
      <h2>
        <a :href="`/posts/${post.slug}/index.html`">{{ post.title }}</a>
      </h2>
      <div class="meta">
        发布：{{ formatDate(post.date) }}({{ daysAgo(post.date) }}) |
        更新：{{ formatDate(post.updated) }}({{ daysAgo(post.updated) }})
      </div>
      <p>{{ post.summary }}</p>
      <div class="tags">
        <span v-for="t in post.tags" :key="t">
          <a :href="`/tags/${encodeURIComponent(t)}/index.html`">{{ t }}</a>&nbsp;
        </span>
      </div>
    </div>
    <div class="pagination">
      <a v-if="page > 1" :href="page === 2 ? '/index.html' : `/page/${page - 1}/index.html`">上一页</a>
      <span>第 {{ page }} / {{ totalPages }} 页</span>
      <a v-if="page < totalPages" :href="`/page/${page + 1}/index.html`">下一页</a>
      <a v-if="page > 1" href="/">首页</a>
      <a v-if="page > 1" :href="`/page/${totalPages}/index.html`">末页</a>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Post {
  slug: string;
  title: string;
  date: string;
  updated: string;
  tags: string[];
  summary: string;
}

const props = defineProps<{
  posts: Post[];
  page: number;
  totalPages: number;
}>();

function formatDate(d: string) {
  return new Date(d).toISOString().split('T')[0];
}
function daysAgo(d: string) {
  const now = Date.now();
  const diff = now - new Date(d).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return '今天';
  if (days === 1) return '1 天前';
  return `${days} 天前`;
}
</script>
