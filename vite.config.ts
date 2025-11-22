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
            const componentData: ComponentConfig = JSON.parse(req.body.componentData);
            const componentType: string = req.body.componentType;
            const file = req.file;

            const projectRoot = path.dirname(fileURLToPath(import.meta.url));

            if (file) {
              const targetDir = path.join(projectRoot, 'public/models', componentType);
              const finalPath = path.join(targetDir, `${componentData.id}.glb`);
              await fs.mkdir(targetDir, { recursive: true });
              await fs.rename(file.path, finalPath);
              componentData.model = `/models/${componentType}/${componentData.id}.glb`;
            }

            const dbPath = path.join(projectRoot, 'public/database/components.json');
            const dbContent = await fs.readFile(dbPath, 'utf-8');
            const componentsDb: ComponentDatabase = JSON.parse(dbContent);

            if (!componentsDb[componentType]) {
              componentsDb[componentType] = [];
            }
            const componentIndex = componentsDb[componentType].findIndex(c => c.id === componentData.id);
            if (componentIndex > -1) {
              componentsDb[componentType][componentIndex] = componentData;
            } else {
              componentsDb[componentType].push(componentData);
            }

            await fs.writeFile(dbPath, JSON.stringify(componentsDb, null, 2));

            res.status(200).json({ 
              message: 'Komponens sikeresen mentve!',
              updatedComponent: componentData 
            });
          } catch (error) {
            console.error('API hiba a /api/save-component végponton:', error);
            res.status(500).json({ message: 'Szerveroldali hiba történt.' });
          }
        });

        // --- 2. VÉGPONT: SIMA JSON ADATBÁZIS MENTÉSE ---
        app.use(express.json({ limit: '10mb' })); // JSON parser
        app.post('/api/save-database', async (req, res) => {
          try {
            const { filename, data } = req.body;
            if (!filename || !data || (filename !== 'furniture.json' && filename !== 'components.json' && filename !== 'globalSettings.json')) {
              return res.status(400).json({ message: 'Érvénytelen kérés.' });
            }
            const projectRoot = path.dirname(fileURLToPath(import.meta.url));
            const filePath = path.join(projectRoot, 'public/database', filename);
            await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
            console.log(`✅ Fájl sikeresen mentve: ${filePath}`);
            res.status(200).json({ message: `${filename} sikeresen mentve.` });
          } catch (error) {
            console.error(`❌ Hiba a /api/save-database végponton:`, error);
            res.status(500).json({ message: 'Szerver oldali hiba a fájl mentésekor.' });
          }
        });

        // Az express app-ot használjuk middleware-ként
        server.middlewares.use(app);
      }
    }
  ],
  resolve: {
    dedupe: ['three'],
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  }
})