<script setup lang="ts">
import AppButton from "@/components/AppButton.vue";

const bgImages = ["main1.webp", "main2.webp", "main3.webp"];
const bgImage = bgImages[Math.floor(Math.random() * bgImages.length)];
</script>

<template>
  <div
    class="home-hero relative min-h-screen w-full flex items-start justify-start bg-black bg-no-repeat"
    :style="{ backgroundImage: `url(${bgImage})` }"
  >
    <div class="home-vignette" aria-hidden />
    <img
      src="/logo.webp"
      alt=""
      class="absolute top-2 md:top-5 right-2 md:right-5 z-10 h-16 md:h-24 w-auto object-contain"
    />
    <div class="relative z-10 px-2 md:px-10 pt-2 md:pt-8 text-gray-50">
      <h1
        class="home-title font-celtes text-heading text-2xl tracking-wide m-0 mb-5"
      >
        Вневременные <br class="block md:hidden" />самоцветы
      </h1>
      <nav class="m-0 flex flex-wrap gap-3">
        <AppButton to="/tree">Калькулятор</AppButton>
        <AppButton to="/instruction">Инструкция</AppButton>
        <AppButton to="/faq">Чаво</AppButton>
      </nav>
    </div>
  </div>
</template>

<style>
.home-hero {
  background-size: 120%;
  background-position: center;
}

@media (min-width: 768px) {
  .home-hero {
    background-size: 75%;
  }
}

.home-vignette {
  pointer-events: none;
  position: absolute;
  inset: 0;
  z-index: 0;
  background:
    linear-gradient(to bottom, rgba(0, 0, 0, 0.8) 0%, transparent 30%),
    linear-gradient(to top, rgba(0, 0, 0, 0.8) 0%, transparent 30%),
    linear-gradient(to left, rgba(0, 0, 0, 0.6) 0%, transparent 25%),
    linear-gradient(to right, rgba(0, 0, 0, 0.6) 0%, transparent 25%),
    radial-gradient(
      ellipse 100% 100% at 50% 50%,
      transparent 0%,
      transparent 42%,
      rgba(0, 0, 0, 0.4) 70%,
      black 100%
    );
}

.home-title::first-letter {
  font-size: 1.55em;
}
</style>
