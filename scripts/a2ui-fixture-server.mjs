import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const port = Number.parseInt(process.env.A2UI_FIXTURE_PORT ?? '4319', 10)

const fixtures = new Map([
  ['/legacy-card-gap.json', 'legacy-card-gap.a2ui.json'],
  ['/valid-card.json', 'valid-card.a2ui.json'],
])

const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`)
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ ok: true }))
    return
  }

  const fixture = fixtures.get(url.pathname)
  if (!fixture) {
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ error: 'fixture not found', fixtures: [...fixtures.keys()] }))
    return
  }

  try {
    const body = await readFile(join(root, 'fixtures', fixture), 'utf8')
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(body)
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ error: String(error) }))
  }
})

server.listen(port, '127.0.0.1', () => {
  console.log(`A2UI fixture server listening at http://127.0.0.1:${port}`)
  for (const path of fixtures.keys()) {
    console.log(`- http://127.0.0.1:${port}${path}`)
  }
})
