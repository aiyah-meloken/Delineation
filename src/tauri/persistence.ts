import {
  readTextFile,
  writeTextFile,
  mkdir,
  exists,
  BaseDirectory,
} from '@tauri-apps/plugin-fs'

const CONFIG_FILE = 'config.json'

interface PersistedConfig {
  lastProject?: string | null
  windowSize?: WindowSize | null
}

export interface WindowSize {
  width: number
  height: number
}

async function ensureAppDataDir(): Promise<void> {
  const dirExists = await exists('', { baseDir: BaseDirectory.AppData })
  if (!dirExists) {
    await mkdir('', { baseDir: BaseDirectory.AppData, recursive: true })
  }
}

async function loadConfig(): Promise<PersistedConfig> {
  try {
    const text = await readTextFile(CONFIG_FILE, { baseDir: BaseDirectory.AppData })
    return JSON.parse(text) as PersistedConfig
  } catch {
    return {}
  }
}

async function saveConfig(config: PersistedConfig): Promise<void> {
  await ensureAppDataDir()
  await writeTextFile(CONFIG_FILE, JSON.stringify(config, null, 2), {
    baseDir: BaseDirectory.AppData,
  })
}

export async function loadLastProject(): Promise<string | null> {
  const cfg = await loadConfig()
  return cfg.lastProject ?? null
}

export async function saveLastProject(path: string | null): Promise<void> {
  const cfg = await loadConfig()
  await saveConfig({ ...cfg, lastProject: path })
}

export async function loadWindowSize(): Promise<WindowSize | null> {
  const cfg = await loadConfig()
  const width = Number(cfg.windowSize?.width)
  const height = Number(cfg.windowSize?.height)
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null
  if (width < 760 || height < 500) return null
  return { width, height }
}

export async function saveWindowSize(width: number, height: number): Promise<void> {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return
  if (width < 760 || height < 500) return
  const cfg = await loadConfig()
  await saveConfig({
    ...cfg,
    windowSize: {
      width: Math.round(width),
      height: Math.round(height),
    },
  })
}
