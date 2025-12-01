import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import svgLoader from 'vite-svg-loader'
import path from 'path'
import fs from 'fs/promises' // fs/promises a modern, async/await használathoz
import os from 'os'
import express from 'express' // express-t használunk a kényelmesebb routingért
import multer from 'multer'
import type { ComponentConfig, ComponentDatabase } from './src/config/furniture'
import { execSync } from 'child_process' // <--- EZ HIÁNYZOTT!

// --- GIT VERZIÓ KINYERÉSE ---
let commitHash = 'Dev'
try {
  // RÉGI (Hash): execSync('git rev-parse --short HEAD').toString().trim()

  // ÚJ (Üzenet): Lekérjük az utolsó commit üzenetének tárgyát (subject)
  commitHash = execSync('git log -1 --format=%s').toString().trim()
} catch {
  console.warn('Nem sikerült kinyerni a git verziót.')
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
    svgLoader(),
    {
      name: 'api-endpoints',
      configureServer(server) {
        const app = express()

        // --- 1. VÉGPONT: KOMPONENS MENTÉSE FÁJLLAL ---
        const upload = multer({ dest: os.tmpdir() })
        app.post('/api/save-component', upload.single('modelFile'), async (req, res) => {
          try {
            console.log('📥 /api/save-component hívás érkezett')

            const componentData: ComponentConfig = JSON.parse(req.body.componentData)
            const componentType: string = req.body.componentType
            const file = req.file

            console.log(`📦 Adatok: ID=${componentData.id}, Type=${componentType}`)

            const projectRoot = path.dirname(fileURLToPath(import.meta.url))

            if (file) {
              console.log(
                `📎 Fájl érkezett: ${file.originalname} (${file.size} bytes) -> Temp: ${file.path}`,
              )

              const targetDir = path.join(projectRoot, 'public/models', componentType)
              const finalPath = path.join(targetDir, `${componentData.id}.glb`)

              // Mappa létrehozása
              await fs.mkdir(targetDir, { recursive: true })

              // JAVÍTÁS: rename helyett copyFile + unlink (Biztonságosabb Windows-on)
              await fs.copyFile(file.path, finalPath)
              await fs.unlink(file.path) // Temp törlése

              console.log(`✅ Fájl mozgatva ide: ${finalPath}`)

              // Útvonal frissítése a JSON objektumban
              componentData.model = `/models/${componentType}/${componentData.id}.glb`
            } else {
              console.log('⚠️ Nincs fájl csatolva a kéréshez.')
            }

            // Adatbázis frissítése
            const dbPath = path.join(projectRoot, 'public/database/components.json')
            // Ha még nincs db fájl, kezeljük le
            let componentsDb: ComponentDatabase = {}
            try {
              const dbContent = await fs.readFile(dbPath, 'utf-8')
              componentsDb = JSON.parse(dbContent)
            } catch (_e) {
              console.log('Új adatbázis fájl létrehozása...')
            }

            if (!componentsDb[componentType]) {
              componentsDb[componentType] = []
            }

            const componentIndex = componentsDb[componentType].findIndex(
              (c) => c.id === componentData.id,
            )

            if (componentIndex > -1) {
              componentsDb[componentType][componentIndex] = componentData
            } else {
              componentsDb[componentType].push(componentData)
            }

            await fs.writeFile(dbPath, JSON.stringify(componentsDb, null, 2))
            console.log('💾 Adatbázis frissítve.')

            res.status(200).json({
              message: 'Komponens sikeresen mentve!',
              updatedComponent: componentData,
            })
          } catch (error) {
            console.error('❌ API hiba a /api/save-component végponton:', error)
            res.status(500).json({ message: 'Szerveroldali hiba történt: ' + String(error) })
          }
        })

        // --- 2. VÉGPONT: TEXTÚRA FELTÖLTÉS ---
        app.post('/api/upload-texture', upload.single('textureFile'), async (req, res) => {
          try {
            const file = req.file
            if (!file) {
              return res.status(400).json({ message: 'Nincs fájl feltöltve.' })
            }

            const projectRoot = path.dirname(fileURLToPath(import.meta.url))
            const targetDir = path.join(projectRoot, 'public/textures/uploaded')
            // Eredeti kiterjesztés megtartása, vagy jpg/png feltételezése
            const ext = path.extname(file.originalname).toLowerCase() || '.jpg'
            const filename = `texture_${Date.now()}${ext}`
            const finalPath = path.join(targetDir, filename)

            await fs.mkdir(targetDir, { recursive: true })
            await fs.rename(file.path, finalPath)

            const textureUrl = `/textures/uploaded/${filename}`

            res.status(200).json({
              message: 'Textúra sikeresen feltöltve!',
              url: textureUrl,
            })
          } catch (error) {
            console.error('API hiba a /api/upload-texture végponton:', error)
            res.status(500).json({ message: 'Szerveroldali hiba történt.' })
          }
        })

        // --- 3. VÉGPONT: SIMA JSON ADATBÁZIS MENTÉSE ---
        app.use(express.json({ limit: '10mb' })) // JSON parser
        app.post('/api/save-database', async (req, res) => {
          try {
            const { filename, data } = req.body
            const allowedFiles = [
              'furniture.json',
              'components.json',
              'globalSettings.json',
              'materials.json',
              'styles.json',
            ]

            if (!filename || !data || !allowedFiles.includes(filename)) {
              return res.status(400).json({ message: 'Érvénytelen kérés.' })
            }
            const projectRoot = path.dirname(fileURLToPath(import.meta.url))
            const filePath = path.join(projectRoot, 'public/database', filename)
            await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
            console.log(`✅ Fájl sikeresen mentve: ${filePath}`)
            res.status(200).json({ message: `${filename} sikeresen mentve.` })
          } catch (error) {
            console.error(`❌ Hiba a /api/save-database végponton:`, error)
            res.status(500).json({ message: 'Szerver oldali hiba a fájl mentésekor.' })
          }
        })

        // Az express app-ot használjuk middleware-ként
        server.middlewares.use(app)
      },
    },
  ],
  resolve: {
    dedupe: ['three'],
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(commitHash),
  },
})
