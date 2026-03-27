/**
 * Optional remote data URL (for fallback).
 * Default is empty: app uses local /calculator.wasm from public.
 */
export const BASE_DATA_URL = (import.meta.env.VITE_DATA_URL as string | undefined)?.trim() ?? ''
