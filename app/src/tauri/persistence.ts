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
}

async function ensureAppDataDir(): Promise<void> {
  const dirExists = await exists('', { baseDir: BaseDirectory.AppData })
  if (!dirExists) {
    await mkdir('', { baseDir: BaseDirectory.AppData, recursive: true })
  }
}

export async function loadLastProject(): Promise<string | null> {
  try {
    const text = await readTextFile(CONFIG_FILE, { baseDir: BaseDirectory.AppData })
    const cfg = JSON.parse(text) as PersistedConfig
    return cfg.lastProject ?? null
  } catch {
    return null
  }
}

export async function saveLastProject(path: string | null): Promise<void> {
  await ensureAppDataDir()
  const cfg: PersistedConfig = { lastProject: path }
  await writeTextFile(CONFIG_FILE, JSON.stringify(cfg, null, 2), {
    baseDir: BaseDirectory.AppData,
  })
}
