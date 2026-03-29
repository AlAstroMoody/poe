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
  /** Ключ = PassiveSkillGraphId; значение = строка passive_skills (Index = _key в дампе). */
  TreeToPassive: Record<
    number,
    | {
        Index: number
        Id?: string
        PassiveSkillGraphID?: number
        Name?: string
        IsNotable?: boolean
        IsKeystone?: boolean
        StatsKeys?: number[]
      }
    | undefined
  >
  TimelessJewels: Record<number, string>
  TimelessJewelConquerors: Record<number, Record<string, { Index: number; Version: number } | undefined> | undefined>
  TimelessJewelSeedRanges: Record<number, { Min: number; Max: number; Special: boolean }>
  PossibleStats: string
}

/** Снимок цепочки поиска пулов альтернатив (см. calculator/trace.go). */
export type AlternateLookupTrace = {
  lookupSummary: string
  passiveTableIndex: number
  passiveGraphId: number
  passiveRowId: string
  passiveName: string
  isKeystone: boolean
  isNotable: boolean
  isJewelSocket: boolean
  statIndices: number[]
  passiveSkillType: string
  jewelType: number
  conqueror: string
  conquerorRow: { index: number; version: number }
  alternateTreeVersionKey: number
  alternateTreeVersionId: string
  treeRules: {
    notableReplacementSpawnWeight: number
    minimumAdditions: number
    maximumAdditions: number
    areSmallAttributePassiveSkillsReplaced: boolean
    areSmallNormalPassiveSkillsReplaced: boolean
  }
  seedUi: number
  seedForRng: number
  validForAlteration: boolean
  replacePoolCount: number
  replacePoolSampleIds: string[]
  additionPoolCount: number
  additionPoolSampleIds: string[]
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
  /** По каким ключам выбираются пулы замен/дополнений до RNG (для отладки). */
  AlternateLookupTrace: (
    passiveID: number,
    seed: number,
    timelessJewelType: number,
    conqueror: string,
  ) => AlternateLookupTrace
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

export type LoadWasmProgress = {
  phase: 'download' | 'instantiate' | 'initialize'
  percent: number
  source: 'primary' | 'fallback'
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

/** Local wasm from public/ (preferred in dev and prod). Respect Vite base path (e.g. /poe/). */
const LOCAL_WASM_URL = `${import.meta.env.BASE_URL}calculator.wasm`
const PRIMARY_WASM_URL = LOCAL_WASM_URL

/** Optional remote fallback via VITE_DATA_URL. */
const FALLBACK_WASM_URL = BASE_DATA_URL ? BASE_DATA_URL.replace(/\/$/, '') + '/calculator.wasm' : ''

async function fetchWasmArrayBuffer(
  url: string,
  source: 'primary' | 'fallback',
  onProgress?: (progress: LoadWasmProgress) => void,
): Promise<ArrayBuffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const contentLength = Number(res.headers.get('content-length') ?? 0)
  const reader = res.body?.getReader()
  if (!reader) return res.arrayBuffer()

  let loaded = 0
  let unknownPercent = 0
  const chunks: Uint8Array[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    chunks.push(value)
    loaded += value.length
    if (onProgress) {
      if (contentLength > 0) {
        const percent = Math.min(100, Math.max(0, Math.round((loaded / contentLength) * 100)))
        onProgress({ phase: 'download', percent, source })
      } else {
        unknownPercent = Math.min(90, unknownPercent + 2)
        onProgress({ phase: 'download', percent: unknownPercent, source })
      }
    }
  }
  const out = new Uint8Array(loaded)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out.buffer
}

async function instantiateWasmFromUrl(
  url: string,
  source: 'primary' | 'fallback',
  go: { importObject: WebAssembly.Imports },
  onProgress?: (progress: LoadWasmProgress) => void,
): Promise<WebAssembly.Instance> {
  // Prefer streaming compilation when possible; it can reduce total blocking time.
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    onProgress?.({ phase: 'download', percent: 100, source })
    if (WebAssembly.instantiateStreaming) {
      onProgress?.({ phase: 'instantiate', percent: 50, source })
      const streamed = await WebAssembly.instantiateStreaming(res, go.importObject)
      onProgress?.({ phase: 'instantiate', percent: 100, source })
      return streamed.instance
    }
  } catch {
    // Fall back to ArrayBuffer path below.
  }

  const buf = await fetchWasmArrayBuffer(url, source, onProgress)
  onProgress?.({ phase: 'instantiate', percent: 100, source })
  const result = await WebAssembly.instantiate(buf, go.importObject)
  return result.instance
}

export async function loadWasm(onProgress?: (progress: LoadWasmProgress) => void): Promise<void> {
  const Go = (typeof window !== 'undefined' && (window as unknown as { Go?: new () => { importObject: WebAssembly.Imports; run: (r: unknown) => void } }).Go)
  if (!Go) throw new Error('Load wasm_exec.js before loadWasm()')

  const go = new Go()
  let instance: WebAssembly.Instance
  let source: 'primary' | 'fallback' = 'primary'
  try {
    instance = await instantiateWasmFromUrl(PRIMARY_WASM_URL, 'primary', go, onProgress)
  } catch {
    if (!FALLBACK_WASM_URL) {
      throw new Error(
        `Failed to load local WASM from ${PRIMARY_WASM_URL}. Put calculator.wasm in public/.`,
      )
    }
    try {
      instance = await instantiateWasmFromUrl(FALLBACK_WASM_URL, 'fallback', go, onProgress)
      source = 'fallback'
    } catch {
      throw new Error(
        `Failed to load WASM from ${PRIMARY_WASM_URL} and fallback ${FALLBACK_WASM_URL}.`,
      )
    }
  }
  go.run(instance)
  initializeFromGlobal()
  if (onProgress) onProgress({ phase: 'initialize', percent: 100, source })
}
