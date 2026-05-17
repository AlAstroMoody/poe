import { ref, watch } from "vue";

export function useLeagueData() {
  const platform = ref(localStorage.getItem("platform") || "PC");
  const league = ref(localStorage.getItem("league") || "Standard");
  const leagues = ref<{ value: string; label: string }[]>([]);

  watch(platform, () => localStorage.setItem("platform", platform.value));
  watch(league, () => localStorage.setItem("league", league.value));

  fetch("https://api.poe.watch/leagues")
    .then((r) => r.json())
    .then((arr: { name: string }[]) => {
      leagues.value = arr.map((l) => ({ value: l.name, label: l.name }));
      const saved = localStorage.getItem("league");
      if (saved && leagues.value.some((l) => l.value === saved))
        league.value = saved;
    })
    .catch(() => {});

  return {
    platform,
    league,
    leagues,
  };
}
