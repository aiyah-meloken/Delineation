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

/**
 * On first run, copy the bundled sample project into the app data dir.
 * Returns the absolute path of the sample project folder, or null if seeding failed.
 */
export async function seedSampleProjectIfMissing(): Promise<string | null> {
  try {
    const dataDir = await appDataDir()
    const targetDir = await join(dataDir, TARGET_DIRNAME)

    const alreadyThere = await exists(TARGET_DIRNAME, { baseDir: BaseDirectory.AppData })
    if (alreadyThere) return targetDir

    await mkdir(TARGET_DIRNAME, { baseDir: BaseDirectory.AppData, recursive: true })

    for (const name of SAMPLE_FILES) {
      const resPath = await resolveResource(`resources/sample-project/${name}`)
      const content = await readTextFile(resPath)
      await writeTextFile(`${TARGET_DIRNAME}/${name}`, content, {
        baseDir: BaseDirectory.AppData,
      })
    }

    return targetDir
  } catch (err) {
    console.error('seedSampleProject failed:', err)
    return null
  }
}
