/**
 * Единый источник версии игры для UI.
 * Значение задаётся в src/config/game-version.json (тот же файл читают скрипты пайплайна).
 */
import gameVersionConfig from "@/config/game-version.json";

export const GAME_VERSION: string = gameVersionConfig.gameVersion;
