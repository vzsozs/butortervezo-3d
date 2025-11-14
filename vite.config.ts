// vite.config.ts
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import svgLoader from 'vite-svg-loader'
import path from 'path'
import fs from 'fs'
import bodyParser from 'body-parser'
// JAVÍTÁS: A Vite/Connect és a Node típusait importáljuk a pontos típusdefiníciókhoz
import type { Connect } from 'vite'
import type { ServerResponse } from 'http'

// JAVÍTÁS: A 'data' típusát pontosítjuk, hogy ne 'any' legyen.
// Ez egy általános típus, ami lefedi a JSON fájljaink tartalmát.
type JsonData = Record<string, unknown> | Record<string, unknown>[];

// A body-parser által kiegészített request típus definiálása
interface RequestWithBody extends Connect.IncomingMessage {
  body: {
    filename?: string;
    data?: JsonData; // Pontosabb típus használata
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
    svgLoader(),
    {
      name: 'save-database-endpoint',
      configureServer(server) {
        server.middlewares.use(bodyParser.json({ limit: '10mb' }));

        // JAVÍTÁS: A middleware függvényt egy változóba tesszük a helyes típusozásért
        const saveDatabaseMiddleware: Connect.NextHandleFunction = (
          req: Connect.IncomingMessage, 
          res: ServerResponse, 
          next: Connect.NextFunction
        ) => {
          // A 'req' objektumot átalakítjuk a mi 'RequestWithBody' típusunkká
          const request = req as RequestWithBody;

          if (request.method !== 'POST') {
            return next();
          }

          const { filename, data } = request.body;

          if (!filename || !data) {
            res.statusCode = 400;
            res.end('Hiányzó "filename" vagy "data" a kérésben.');
            return;
          }

          if (filename !== 'components.json' && filename !== 'furniture.json') {
            res.statusCode = 403;
            res.end('Nem engedélyezett fájlnév.');
            return;
          }

          const projectRoot = path.dirname(fileURLToPath(import.meta.url));
          const filePath = path.resolve(projectRoot, 'public/database', filename);
          
          try {
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
            console.log(`✅ Fájl sikeresen mentve: ${filePath}`);
            res.statusCode = 200;
            res.end('Fájl sikeresen mentve.');
          } catch (error) {
            console.error(`❌ Hiba a fájl mentésekor (${filePath}):`, error);
            res.statusCode = 500;
            res.end('Szerver oldali hiba a fájl mentésekor.');
          }
        };
        
        // A middleware-t a '/api/save-database' útvonalhoz kötjük
        server.middlewares.use('/api/save-database', saveDatabaseMiddleware);
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