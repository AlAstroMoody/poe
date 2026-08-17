import { createRouter, createWebHashHistory } from "vue-router";

const SITE_TITLE = "Вневременные самоцветы и Бездна";

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/",
      name: "home",
      component: () => import("@/views/HomeView.vue"),
      meta: {
        title: `${SITE_TITLE} 3.29 — калькулятор Path of Exile`,
      },
    },
    {
      path: "/tree",
      name: "tree",
      component: () => import("@/views/TreeView.vue"),
      meta: { title: "Дерево навыков — легион и личи" },
    },
    {
      path: "/instruction",
      name: "instruction",
      component: () => import("@/views/InstructionView.vue"),
      meta: { title: "Инструкция" },
    },
    {
      path: "/faq",
      name: "faq",
      component: () => import("@/views/FaqView.vue"),
      meta: { title: "Чаво" },
    },
  ],
});

router.beforeEach((to) => {
  const title = to.meta?.title as string | undefined;
  if (title)
    document.title = to.name === "home" ? title : `${title} | ${SITE_TITLE}`;
});

export default router;
