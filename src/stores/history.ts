// src/stores/history.ts

import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { EulerOrder } from 'three'
import { useExperienceStore } from './experience'
import type { FurnitureConfig } from '@/config/furniture' // Import added

type Vector3Array = [number, number, number]
// JAVÍTÁS: Az EulerOrder opcionális, a toArray() nem mindig adja vissza
type EulerArray = [number, number, number, (EulerOrder | undefined)?]

export interface SerializableObjectState {
  configId: string
  config: FurnitureConfig // ÚJ: A teljes konfigot mentjük, hogy a dinamikus slotok megmaradjanak
  position: Vector3Array
  rotation: EulerArray
  componentState: Record<string, string>
  materialState: Record<string, string | null>
  // --- ÚJ TULAJDONSÁG ---
  propertyState: Record<string, Record<string, string | number | boolean>>
}
export type SceneState = SerializableObjectState[]

export const useHistoryStore = defineStore('history', () => {
  const experienceStore = useExperienceStore()
  const history = ref<SceneState[]>([])
  const canUndo = computed(() => history.value.length > 1)

  function createSnapshot(): SceneState {
    const snapshot: SceneState = []
    for (const obj of experienceStore.placedObjects) {
      if (!obj.userData.config) continue
      snapshot.push({
        configId: obj.userData.config.id,
        config: JSON.parse(JSON.stringify(obj.userData.config)), // A teljes konfig mentése
        position: obj.position.toArray() as Vector3Array,
        rotation: obj.rotation.toArray() as EulerArray,
        componentState: JSON.parse(JSON.stringify(obj.userData.componentState)),
        materialState: JSON.parse(JSON.stringify(obj.userData.materialState)),
        // --- ÚJ TULAJDONSÁG HOZZÁADÁSA A MENTÉSHEZ ---
        propertyState: JSON.parse(JSON.stringify(obj.userData.propertyState || {})),
      })
    }
    return snapshot
  }

  function addState() {
    // ... (ez a függvény változatlan)
    const newState = createSnapshot()
    const lastState = history.value[history.value.length - 1]
    if (lastState && JSON.stringify(lastState) === JSON.stringify(newState)) {
      return
    }
    history.value.push(newState)
    console.log(`[History] Új állapot mentve. Történelem hossza: ${history.value.length}`)
  }

  function undo() {
    // ... (ez a függvény változatlan)
    if (canUndo.value) {
      history.value.pop()
      const prevState = history.value[history.value.length - 1]
      if (prevState) {
        experienceStore.instance?.loadState(prevState)
      }
      console.log(`[History] Visszavonás. Történelem új hossza: ${history.value.length}`)
    }
  }

  function clearHistory() {
    history.value = []
  }

  return {
    history,
    canUndo,
    addState,
    undo,
    clearHistory,
    createSnapshot,
  }
})
