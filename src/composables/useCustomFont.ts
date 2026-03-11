import { ref, watch } from "vue";

const STORAGE_KEY = "customFont";

function readStored(): boolean {
  if (typeof localStorage === "undefined") return true;
  return localStorage.getItem(STORAGE_KEY) !== "0";
}

const customFont = ref(readStored());

export function useCustomFont() {
  watch(
    customFont,
    (enabled) => {
      document.documentElement.classList.toggle("system-font", !enabled);
      localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
    },
    { immediate: true },
  );

  function setCustomFont(enabled: boolean) {
    customFont.value = enabled;
  }

  return { customFont, setCustomFont };
}
