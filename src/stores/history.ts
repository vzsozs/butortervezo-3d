// src/stores/history.ts (Csak UNDO verzió)
import { ref, computed } from 'vue';
import { defineStore } from 'pinia';
import type { EulerOrder } from 'three'; // <-- ÚJ IMPORT
import { useExperienceStore } from './experience';

// Pontosabb típusok
type Vector3Array = [number, number, number];
type EulerArray = [number, number, number, EulerOrder];

// A szerializálható típusok ugyanúgy kellenek
export interface SerializableObjectState {
  configId: string;
  position: Vector3Array;
  rotation: EulerArray;
  componentState: Record<string, string>;
  materialState: Record<string, string | null>;
}
export type SceneState = SerializableObjectState[];

export const useHistoryStore = defineStore('history', () => {
  const experienceStore = useExperienceStore();

  // A történelem egy egyszerű tömb, ami veremként működik
  const history = ref<SceneState[]>([]);

  // A gomb letiltásához
  const canUndo = computed(() => history.value.length > 1);

  /**
   * Létrehoz egy szerializálható pillanatképet a jelenlegi 3D állapotról.
   */
  function createSnapshot(): SceneState {
    const snapshot: SceneState = [];
    for (const obj of experienceStore.placedObjects) {
      if (!obj.userData.config) continue;
      snapshot.push({
        configId: obj.userData.config.id,
        // Típus-kényszerítéssel jelezzük, hogy tudjuk, mit kapunk
        position: obj.position.toArray() as Vector3Array,
        rotation: obj.rotation.toArray() as EulerArray,
        componentState: JSON.parse(JSON.stringify(obj.userData.componentState)),
        materialState: JSON.parse(JSON.stringify(obj.userData.materialState)),
      });
    }
    return snapshot;
  }

  /**
   * Hozzáad egy új állapotot a történelemhez (a verem tetejére).
   */
  function addState() {
    const newState = createSnapshot();
    const lastState = history.value[history.value.length - 1];

    // Ne mentsünk, ha nem történt változás
    if (lastState && JSON.stringify(lastState) === JSON.stringify(newState)) {
      return;
    }

    history.value.push(newState);
    console.log(`[History] Új állapot mentve. Történelem hossza: ${history.value.length}`);
  }

  /**
   * Visszavonja a legutóbbi állapotot.
   */
  function undo() {
    if (canUndo.value) {
      // 1. Eldobjuk a jelenlegi (legutóbbi) állapotot
      history.value.pop();
      
      // 2. Betöltjük az újonnan legfelső állapotot
      const prevState = history.value[history.value.length - 1];
      if (prevState) {
        experienceStore.instance?.loadState(prevState);
      }
      console.log(`[History] Visszavonás. Történelem új hossza: ${history.value.length}`);
    }
  }

  /**
   * A történelem törlése (pl. új projekt betöltésekor)
   */
  function clearHistory() {
    history.value = [];
  }

  return {
    history,
    canUndo,
    addState,
    undo,
    clearHistory,
    createSnapshot,
  };
});