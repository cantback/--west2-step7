<template>
  <div class="post">
    <h1>{{ title }}</h1>
    <div class="meta">
      发布：{{ formatDate(date) }}（{{ daysAgo(date) }}） |
      更新：{{ formatDate(updated) }}（{{ daysAgo(updated) }})
    </div>
    <div class="tags">
      <span v-for="t in tags" :key="t">
        <a :href="`/tags/${encodeURIComponent(t)}/index.html`">{{ t }}</a>&nbsp;
      </span>
    </div>
    <article v-html="content"></article>
  </div>
</template>

<script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js" setup lang="ts">
const props = defineProps<{
  title: string;
  date: string;
  updated: string;
  tags: string[];
  content: string;
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
