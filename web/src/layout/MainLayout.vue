<template>
  <div class="layout">
    <header class="topbar">
      <div class="brand">排期甘特图</div>
      <nav class="nav">
        <RouterLink to="/" class="nav-item" active-class="nav-item--active">甘特视图</RouterLink>
        <RouterLink to="/list" class="nav-item" active-class="nav-item--active">列表</RouterLink>
      </nav>
      <div class="topbar-slot">
        <slot name="actions" />
        <!-- 备份是全局操作，两个视图都要用，所以放顶栏而不是各视图里 -->
        <BackupBar />
      </div>
    </header>
    <main class="content">
      <RouterView />
    </main>
  </div>
</template>

<script setup>
import { RouterLink, RouterView } from 'vue-router'
import BackupBar from '../components/BackupBar.vue'
</script>

<style scoped>
.layout {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.topbar {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: none;
  padding: 0 16px;
  height: 52px;
  background: var(--header-bg);
  border-bottom: 1px solid var(--cell-border);
}

.brand {
  font-size: 15px;
  font-weight: 600;
}

.nav {
  display: flex;
  gap: 4px;
}

.nav-item {
  padding: 5px 12px;
  border-radius: 6px;
  color: var(--legend-text);
  text-decoration: none;
}

.nav-item:hover {
  background: #f0f1f3;
}

.nav-item--active {
  background: var(--today-bg);
  color: var(--today-text);
}

/* 右侧操作区由各视图通过 slot 注入，顶栏本身不认识业务 */
.topbar-slot {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.content {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
</style>
