import { useEffect, useState } from 'react'
import { useProjectStore } from './store/projectStore'
import { pickFolder, listHtmlFiles, readViewFile, pathBasename } from './tauri/fs'
import { loadLastProject, saveLastProject } from './tauri/persistence'
import { seedSampleProjectIfMissing } from './seed/seedSampleProject'
import { TopBar } from './components/TopBar'
import { Sidebar } from './components/Sidebar'
import { TabStrip } from './components/TabStrip'
import { ViewerPane } from './components/ViewerPane'
import { EmptyState } from './components/EmptyState'

export default function App() {
  const {
    currentProject,
    viewList,
    openTabs,
    activeTab,
    openProject,
    openView,
    closeTab,
    refreshViewList,
  } = useProjectStore()

  const [projectName, setProjectName] = useState<string | null>(null)
  const [activeHtml, setActiveHtml] = useState<string | null>(null)

  // On startup: try to restore the last project.
  // If the restore fails (e.g., folder was moved/deleted), clear the stored path
  // so the user lands on EmptyState cleanly on subsequent launches.
  useEffect(() => {
    ;(async () => {
      const last = await loadLastProject()
      if (!last) return
      const ok = await tryOpenProjectAt(last)
      if (!ok) await saveLastProject(null)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update the project name display whenever currentProject changes.
  useEffect(() => {
    ;(async () => {
      setProjectName(currentProject ? await pathBasename(currentProject) : null)
    })()
  }, [currentProject])

  // Load the active tab's HTML whenever activeTab or currentProject changes.
  useEffect(() => {
    ;(async () => {
      if (!currentProject || !activeTab) {
        setActiveHtml(null)
        return
      }
      try {
        const html = await readViewFile(currentProject, activeTab)
        setActiveHtml(html)
      } catch (err) {
        console.error('readViewFile failed:', err)
        setActiveHtml(`<p style="font-family:sans-serif;padding:24px;color:#a00">Failed to read ${activeTab}: ${String(err)}</p>`)
      }
    })()
  }, [currentProject, activeTab])

  async function tryOpenProjectAt(path: string): Promise<boolean> {
    try {
      const files = await listHtmlFiles(path)
      openProject(path, files)
      await saveLastProject(path)
      return true
    } catch (err) {
      console.error('Failed to open project:', err)
      return false
    }
  }

  async function handleOpenProject() {
    const path = await pickFolder()
    if (path) await tryOpenProjectAt(path)
  }

  async function handleOpenSample() {
    const samplePath = await seedSampleProjectIfMissing()
    if (samplePath) {
      await tryOpenProjectAt(samplePath)
    } else {
      console.error('Failed to seed sample project')
    }
  }

  async function handleRefresh() {
    if (!currentProject) return
    try {
      const files = await listHtmlFiles(currentProject)
      refreshViewList(files)
    } catch (err) {
      console.error('refresh failed:', err)
    }
  }

  if (!currentProject) {
    return (
      <EmptyState
        onOpenProject={handleOpenProject}
        onOpenSample={handleOpenSample}
      />
    )
  }

  return (
    <div className="app">
      <TopBar projectName={projectName} onOpenProject={handleOpenProject} />
      <div className="app-body">
        <Sidebar
          views={viewList}
          activeView={activeTab}
          onSelect={openView}
          onRefresh={handleRefresh}
        />
        <main className="viewer">
          <TabStrip
            tabs={openTabs}
            activeTab={activeTab}
            onActivate={openView}
            onClose={closeTab}
          />
          <ViewerPane html={activeHtml} viewKey={activeTab} />
        </main>
      </div>
    </div>
  )
}
