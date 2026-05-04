import {
  exists,
  mkdir,
  readTextFile,
  writeTextFile,
  BaseDirectory,
} from '@tauri-apps/plugin-fs'
import { resolveResource, appDataDir, join } from '@tauri-apps/api/path'

const SAMPLE_FILES = ['overview.html', 'data-flow.html', 'notes.html']
const TARGET_DIRNAME = 'Sample Project'
const PROJECT_DIR = `${TARGET_DIRNAME}/.delineation`
const PROJECT_VIEWS_DIR = `${PROJECT_DIR}/views`
const PROJECT_FILE = `${PROJECT_DIR}/project.json`

async function ensureSampleProjectFile(): Promise<void> {
  const hasProjectFile = await exists(PROJECT_FILE, { baseDir: BaseDirectory.AppData })
  await mkdir(PROJECT_DIR, { baseDir: BaseDirectory.AppData, recursive: true })
  await mkdir(PROJECT_VIEWS_DIR, { baseDir: BaseDirectory.AppData, recursive: true })

  if (!hasProjectFile) {
    await writeTextFile(PROJECT_FILE, JSON.stringify({
      name: TARGET_DIRNAME,
      version: 1,
      createdAt: new Date().toISOString(),
    }, null, 2), {
      baseDir: BaseDirectory.AppData,
    })
  }
}

async function ensureSampleViews(): Promise<void> {
  for (const name of SAMPLE_FILES) {
    const target = `${PROJECT_VIEWS_DIR}/${name}`
    if (await exists(target, { baseDir: BaseDirectory.AppData })) continue
    const resPath = await resolveResource(`resources/sample-project/${name}`)
    const content = await readTextFile(resPath)
    await writeTextFile(target, content, {
      baseDir: BaseDirectory.AppData,
    })
  }
}

/**
 * On first run, copy the bundled sample project into the app data dir.
 * Returns the absolute path of the sample project folder, or null if seeding failed.
 */
export async function seedSampleProjectIfMissing(): Promise<string | null> {
  try {
    const dataDir = await appDataDir()
    const targetDir = await join(dataDir, TARGET_DIRNAME)

    const alreadyThere = await exists(TARGET_DIRNAME, { baseDir: BaseDirectory.AppData })
    if (alreadyThere) {
      await ensureSampleProjectFile()
      await ensureSampleViews()
      return targetDir
    }

    await mkdir(TARGET_DIRNAME, { baseDir: BaseDirectory.AppData, recursive: true })
    await ensureSampleProjectFile()
    await ensureSampleViews()

    return targetDir
  } catch (err) {
    console.error('seedSampleProject failed:', err)
    return null
  }
}
