<template>
  <RouterView v-slot="{ Component }">
    <Transition name="page" mode="out-in">
      <component :is="Component" :key="$route.path" />
    </Transition>
  </RouterView>
</template>

<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Syne:wght@700;800&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body, #app { width: 100%; height: 100%; overflow: hidden; background: #080808; }

.page-enter-active,
.page-leave-active {
  transition: opacity 0.4s ease, transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}
.page-enter-from {
  opacity: 0;
  transform: scale(1.03);
}
.page-leave-to {
  opacity: 0;
  transform: scale(0.97);
}

/* ── Shared Nav ── */
.shared-nav {
  position: fixed;
  top: 28px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  display: flex;
  gap: 6px;
  background: rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(20px) saturate(1.5);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 100px;
  padding: 6px;
}
.nav-link {
  padding: 9px 22px;
  border-radius: 100px;
  font-size: 0.72rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.5);
  text-decoration: none;
  font-weight: 500;
  font-family: 'Inter', sans-serif;
  transition: all 0.25s ease;
  cursor: pointer;
  background: transparent;
  border: none;
}
.nav-link.active {
  background: #fff;
  color: #000;
}
.nav-link:hover:not(.active) {
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
}

@media (max-width: 700px) {
  .shared-nav {
    top: max(14px, env(safe-area-inset-top));
    gap: 3px;
    padding: 5px;
  }
  .nav-link {
    padding: 8px clamp(10px, 3.2vw, 16px);
    font-size: 0.62rem;
    letter-spacing: 0.09em;
  }
}
</style>
