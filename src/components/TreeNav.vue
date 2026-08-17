<script setup lang="ts">
import { onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { setLanguage, type Lang } from "@/lib/i18n";
import { useCustomFont } from "@/composables/useCustomFont";
import { ui } from "@/lib/dict";
import MenuBurgerButton from "./MenuBurgerButton.vue";

const lang = defineModel<Lang>("lang", { required: true });
const { customFont, setCustomFont } = useCustomFont();

/** На мобилке по умолчанию свёрнуто, чтобы не перекрывать дерево. */
const open = ref(true);

onMounted(() => {
  if (window.matchMedia("(max-width: 767px)").matches) {
    open.value = false;
  }
});

function setLang(value: Lang) {
  setLanguage(value);
  lang.value = value;
}
</script>

<template>
  <div
    class="tree-nav-root absolute right-0 top-2 z-[50] flex flex-col items-end gap-px"
    data-tree-nav
  >
    <MenuBurgerButton
      :open="open"
      :label="open ? ui('hideNav', lang) : ui('showNav', lang)"
      class="size-9 shrink-0 rounded-none rounded-l-lg border border-r-0 border-heading/30 bg-black/75 shadow-none backdrop-blur-sm hover:bg-black/85"
      @click="open = !open"
    />

    <nav
      v-show="open"
      class="flex w-fit flex-col gap-3 rounded-l-lg border border-r-0 border-heading/30 bg-black/75 px-3 py-3 backdrop-blur-sm"
      :aria-label="ui('navAria', lang)"
    >
      <RouterLink
        to="/"
        class="text-heading text-sm no-underline opacity-80 hover:opacity-100"
      >
        {{ ui("navHome", lang) }}
      </RouterLink>
      <RouterLink
        to="/instruction"
        class="text-heading text-sm no-underline opacity-80 hover:opacity-100"
      >
        {{ ui("navInstruction", lang) }}
      </RouterLink>
      <RouterLink
        to="/faq"
        class="text-heading text-sm no-underline opacity-80 hover:opacity-100"
      >
        {{ ui("navFaq", lang) }}
      </RouterLink>
      <a
        href="https://github.com/AlAstroMoody/poe/issues"
        target="_blank"
        rel="noopener noreferrer"
        class="text-heading text-sm leading-snug no-underline opacity-80 hover:opacity-100"
      >
        {{ ui("issues", lang) }}
      </a>
      <div
        class="mt-1 border-t border-heading/20 pt-2"
        role="group"
        :aria-label="ui('langAria', lang)"
      >
        <button
          type="button"
          class="mr-1 cursor-pointer rounded px-2 py-0.5 text-sm transition-opacity"
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
          class="cursor-pointer rounded px-2 py-0.5 text-sm transition-opacity"
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
      <div
        class="mt-1 border-t border-heading/20 pt-2"
        role="group"
        :aria-label="ui('customFont', lang)"
      >
        <button
          type="button"
          class="cursor-pointer rounded px-2 py-0.5 text-sm transition-opacity"
          :class="
            customFont
              ? 'bg-heading/20 opacity-100'
              : 'opacity-60 hover:opacity-100'
          "
          @click="setCustomFont(!customFont)"
        >
          {{ ui("customFont", lang) }}
        </button>
      </div>
    </nav>
  </div>
</template>
