// src/stores/persistence.ts
import { defineStore } from 'pinia';
import { useHistoryStore, type SceneState } from './history';
import { useExperienceStore } from './experience';

const LOCAL_STORAGE_KEY = 'kitchenDesignerSave';

export const usePersistenceStore = defineStore('persistence', () => {
  const historyStore = useHistoryStore();
  const experienceStore = useExperienceStore();

  /**
   * Elmenti a jelenlegi állapotot a böngésző localStorage-ébe.
   */
  function saveStateToLocalStorage() {
    // A history store-ból kérjük el a legfrissebb állapotot
    const currentState = historyStore.createSnapshot();
    
    try {
      const jsonState = JSON.stringify(currentState);
      localStorage.setItem(LOCAL_STORAGE_KEY, jsonState);
      console.log(`[Persistence] Jelenet sikeresen mentve a localStorage-be.`);
      // Opcionálisan itt lehetne egy kis "Mentve!" üzenet a UI-on
    } catch (error) {
      console.error("[Persistence] Hiba a mentés során:", error);
    }
  }

  /**
   * Betölti az állapotot a localStorage-ből, ha van.
   * @returns True, ha volt mit betölteni, egyébként false.
   */
  function loadStateFromLocalStorage(): boolean {
    console.log("[Persistence] loadStateFromLocalStorage elindult.");
    const savedState = localStorage.getItem(LOCAL_STORAGE_KEY);

    if (savedState) {
      console.log("[Persistence] Mentett állapotot találtam a localStorage-ben.");
      try {
        const parsedState = JSON.parse(savedState) as SceneState;
        if (parsedState && Array.isArray(parsedState)) {
          console.log("[Persistence] Az állapot sikeresen parse-olva.");

          // === KRITIKUS PONT ELLENŐRZÉSE ===
          if (experienceStore.instance) {
            console.log("[Persistence] Experience instance létezik, loadState() hívás indul...");
            
            // A hívást tegyük async-await blokkba, hogy elkapjuk az esetleges hibákat
            (async () => {
              try {
                await experienceStore.instance!.loadState(parsedState);
                console.log("[Persistence] loadState() sikeresen lefutott.");

                // History frissítése a sikeres betöltés UTÁN
                historyStore.clearHistory();
                historyStore.addState();
                console.log("[Persistence] History store frissítve.");
              } catch (loadError) {
                console.error("[Persistence] Hiba a loadState() metódus végrehajtása közben:", loadError);
              }
            })();

            return true;
          } else {
            console.error("[Persistence] HIBA: Az Experience instance még NULL! A betöltés nem tud lefutni.");
            return false;
          }
        }
      } catch (error) {
        console.error("[Persistence] Hiba a mentett állapot parse-olása során:", error);
        localStorage.removeItem(LOCAL_STORAGE_KEY);
      }
    }
    
    console.log("[Persistence] Nincs mentett állapot a localStorage-ben.");
    return false;
  }

  function saveStateToFile() {
    const currentState = historyStore.createSnapshot();
    try {
      const jsonState = JSON.stringify(currentState, null, 2); // A 'null, 2' szépen formázza a JSON-t
      const blob = new Blob([jsonState], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `konyhaterv_${new Date().toISOString().slice(0, 10)}.json`; // pl. konyhaterv_2023-10-27.json
      document.body.appendChild(link);
      link.click();
      
      // Takarítás
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      console.log(`[Persistence] Jelenet sikeresen elmentve fájlba.`);

    } catch (error) {
      console.error("[Persistence] Hiba a fájlba mentés során:", error);
    }
  }

  function loadStateFromFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json, .json';

    input.onchange = (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (readEvent) => {
        try {
          const content = readEvent.target?.result as string;
          const parsedState = JSON.parse(content) as SceneState;

          if (parsedState && Array.isArray(parsedState)) {
            console.log("[Persistence] Fájl sikeresen beolvasva, állapot betöltése...");
            experienceStore.instance?.loadState(parsedState);
            historyStore.clearHistory();
            historyStore.addState();
          } else {
            throw new Error("A fájl formátuma nem megfelelő.");
          }
        } catch (error) {
          console.error("[Persistence] Hiba a fájl feldolgozása során:", error);
          // Itt lehetne egy hibaüzenet a felhasználónak
        }
      };
      reader.readAsText(file);
    };

    input.click(); // A fájlválasztó ablak megnyitása
  }




  return {
    saveStateToLocalStorage,
    loadStateFromLocalStorage,
    saveStateToFile,
    loadStateFromFile, 
  };
});