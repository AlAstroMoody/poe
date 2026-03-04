import { BASE_DATA_URL } from '@/config'

declare global {
  interface Window {
    Go: new () => {
      importObject: WebAssembly.Imports
      run: (instance: WebAssembly.WebAssemblyInstantiatedSource['instance']) => void
    }
  }
}

export interface WasmData {
  GetAlternatePassiveAdditionByIndex: (index: number) => unknown
  GetAlternatePassiveSkillByIndex: (index: number) => unknown
  GetPassiveSkillByIndex: (index: number) => { Index: number; PassiveSkillGraphID: number; StatsKeys?: number[] } | undefined
  GetStatByIndex: (index: number) => { Index: number; ID: string; Text: string }
  PassiveSkillAuraStatTranslationsJSON: string
  PassiveSkillStatTranslationsJSON: string
  SkillTree: string
  StatTranslationsJSON: string
  StatTranslationsRuJSON?: string
  PassiveSkillStatTranslationsRuJSON?: string
  PassiveSkillAuraStatTranslationsRuJSON?: string
  TreeToPassive: Record<number, { Index: number } | undefined>
  TimelessJewels: Record<number, string>
  TimelessJewelConquerors: Record<number, Record<string, { Index: number; Version: number } | undefined> | undefined>
  TimelessJewelSeedRanges: Record<number, { Min: number; Max: number; Special: boolean }>
  PossibleStats: string
}

export interface WasmCalculator {
  Calculate: (
    passiveID: number,
    seed: number,
    timelessJewelType: number,
    conqueror: string
  ) => {
    AlternatePassiveSkill?: { Index?: number; ID?: string; Name: string; StatsKeys?: number[] }
    StatRolls?: Record<number, number>
    AlternatePassiveAdditionInformations?: Array<{
      AlternatePassiveAddition?: { StatsKeys?: number[] }
      StatRolls?: Record<number, number>
    }>
  } | undefined
  ReverseSearch: (...args: unknown[]) => Promise<unknown>
}

let wasmData: WasmData | null = null
let wasmCalculator: WasmCalculator | null = null

export function getData(): WasmData {
  if (!wasmData) throw new Error('WASM data not loaded')
  return wasmData
}

export function getCalculator(): WasmCalculator {
  if (!wasmCalculator) throw new Error('WASM calculator not loaded')
  return wasmCalculator
}

export function isWasmReady(): boolean {
  return wasmData !== null && wasmCalculator !== null
}

function initializeFromGlobal(): void {
  const go = (typeof window !== 'undefined' && (window as unknown as { Go?: unknown }).Go) as
    | (new () => { importObject: WebAssembly.Imports })
    | undefined
  if (!go) throw new Error('Go runtime not found. Load wasm_exec.js first.')

  const tj = (globalThis as unknown as { go?: { 'timeless-jewels'?: { data: WasmData; calculator: WasmCalculator } } }).go?.[
    'timeless-jewels'
  ]
  if (!tj?.data || !tj?.calculator) throw new Error('timeless-jewels WASM module not found on globalThis.go')
  wasmData = tj.data
  wasmCalculator = tj.calculator
}

const PRIMARY_WASM_URL = BASE_DATA_URL.replace(/\/$/, '') + '/calculator.wasm'

/** Fallback: локальный файл из public/calculator.wasm (если основной источник недоступен). */
const FALLBACK_WASM_URL = '/calculator.wasm'

async function fetchWasmArrayBuffer(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.arrayBuffer()
}

export async function loadWasm(): Promise<void> {
  const Go = (typeof window !== 'undefined' && (window as unknown as { Go?: new () => { importObject: WebAssembly.Imports; run: (r: unknown) => void } }).Go)
  if (!Go) throw new Error('Load wasm_exec.js before loadWasm()')

  const go = new Go()
  let buf: ArrayBuffer
  try {
    buf = await fetchWasmArrayBuffer(PRIMARY_WASM_URL)
  } catch {
    try {
      buf = await fetchWasmArrayBuffer(FALLBACK_WASM_URL)
    } catch (fallbackErr) {
      throw new Error(
        `Failed to load WASM from ${PRIMARY_WASM_URL} and from fallback ${FALLBACK_WASM_URL}. ` +
          'Put calculator.wasm in public/ for offline/backup.',
      )
    }
  }
  const result = await WebAssembly.instantiate(buf, go.importObject)
  go.run(result.instance)
  initializeFromGlobal()
}
