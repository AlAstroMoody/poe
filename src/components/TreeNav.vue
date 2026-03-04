<script setup lang="ts">
import { RouterLink } from "vue-router";
import { setLanguage, type Lang } from "@/lib/i18n";

const lang = defineModel<Lang>("lang", { required: true });

function setLang(value: Lang) {
  setLanguage(value);
  lang.value = value;
}
</script>

<template>
  <nav
    class="tree-nav absolute right-0 top-6 z-[50] flex flex-col gap-3 rounded-l-lg border border-r-0 border-heading/30 bg-black/75 px-3 py-3 backdrop-blur-sm"
    aria-label="Навигация и язык"
  >
    <RouterLink
      to="/"
      class="text-heading text-sm no-underline opacity-80 hover:opacity-100"
    >
      Главная
    </RouterLink>
    <RouterLink
      to="/instruction"
      class="text-heading text-sm no-underline opacity-80 hover:opacity-100"
    >
      Инструкция
    </RouterLink>
    <RouterLink
      to="/faq"
      class="text-heading text-sm no-underline opacity-80 hover:opacity-100"
    >
      Чаво
    </RouterLink>
    <div
      class="mt-1 border-t border-heading/20 pt-2"
      role="group"
      aria-label="Язык"
    >
      <button
        type="button"
        class="mr-1 rounded px-2 py-0.5 text-sm transition-opacity"
        :class="
          lang === 'en'
            ? 'bg-heading/20 opacity-100'
            : 'opacity-60 hover:opacity-100'
        "
        @click="setLang('en')"
      >
        EN
      </button>
      <button
        type="button"
        class="rounded px-2 py-0.5 text-sm transition-opacity"
        :class="
          lang === 'ru'
            ? 'bg-heading/20 opacity-100'
            : 'opacity-60 hover:opacity-100'
        "
        @click="setLang('ru')"
      >
        RU
      </button>
    </div>
  </nav>
</template>
