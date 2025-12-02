// src/stores/selection.ts

import { defineStore } from 'pinia'
import type { Group } from 'three'
import { ref, computed, shallowRef, triggerRef } from 'vue'
import type { FurnitureConfig, ComponentSlotConfig } from '@/config/furniture'
import Experience from '@/three/Experience'
import { useConfigStore } from '@/stores/config'

export const useSelectionStore = defineStore('selection', () => {
  const selectedObject = shallowRef<Group | null>(null)

  const objectToDeleteUUID = ref<string | null>(null)
  const objectToDuplicateUUID = ref<string | null>(null)

  const materialChangeRequest = ref<{
    targetUUID: string
    slotId: string
    materialId: string
  } | null>(null)
  const styleChangeRequest = ref<{ targetUUID: string; slotId: string; newStyleId: string } | null>(
    null,
  )

  const selectedObjectConfig = computed<FurnitureConfig | null>(() => {
    if (selectedObject.value && selectedObject.value.userData.config) {
      return selectedObject.value.userData.config as FurnitureConfig
    }
    return null
  })

  // 🔥 ÚJ: Zárolás jelző
  const isBusy = ref(false)

  function selectObject(object: Group | null) {
    selectedObject.value = object
    triggerRef(selectedObject)
    const experience = Experience.getInstance()
    if (experience.camera && experience.camera.transformControls) {
      if (object) {
        experience.camera.transformControls.attach(object)
      } else {
        experience.camera.transformControls.detach()
      }
    }
  }

  function clearSelection() {
    selectObject(null)
  }
  function deleteSelectedObject() {
    if (selectedObject.value) {
      objectToDeleteUUID.value = selectedObject.value.uuid
      clearSelection()
    }
  }
  function acknowledgeDeletion() {
    objectToDeleteUUID.value = null
  }
  function duplicateSelectedObject() {
    if (selectedObject.value) {
      objectToDuplicateUUID.value = selectedObject.value.uuid
    }
  }
  function acknowledgeDuplication() {
    objectToDuplicateUUID.value = null
  }
  function changeMaterial(slotId: string, materialId: string) {
    if (selectedObject.value) {
      materialChangeRequest.value = { targetUUID: selectedObject.value.uuid, slotId, materialId }
    }
  }
  function acknowledgeMaterialChange() {
    materialChangeRequest.value = null
  }

  async function changeStyle(slotId: string, newComponentId: string) {
    if (!selectedObject.value || !selectedObjectConfig.value) return

    console.group(`[SelectionStore] 🎨 Stílus csere: ${slotId} -> ${newComponentId}`)

    // 1. State másolása
    const currentComponentState = JSON.parse(
      JSON.stringify(selectedObject.value.userData.componentState || {}),
    )

    // 2. Az új érték beállítása
    currentComponentState[slotId] = newComponentId

    // 3. 🧹 SZIGORÚ TAKARÍTÁS (SANITIZATION)
    // Lekérjük az összes JELENLEG érvényes slot ID-t a configból.
    // (Ez tartalmazza a fix slotokat és az aktív layout által generáltakat is)
    const validSlotIds = selectedObjectConfig.value.componentSlots.map((s) => s.slotId)

    // Végigmegyünk a state összes kulcsán...
    Object.keys(currentComponentState).forEach((stateKey) => {
      // ...és ha olyan kulcsot találunk, ami nincs a valid slotok között...
      if (!validSlotIds.includes(stateKey)) {
        console.warn(`[SelectionStore] 🗑️ Szellem elem törlése a state-ből: ${stateKey}`)
        // ...azt töröljük! Így nem épül fel a régi "szellem" modell.
        delete currentComponentState[stateKey]
      }
    })

    console.log('Tisztított State:', currentComponentState)
    console.groupEnd()

    // 4. Újraépítés a tiszta state-tel
    await rebuildObjectWithNewState(currentComponentState)
  }

  // 🔥 ÚJ: Tömeges csere a versenyhelyzetek elkerülésére
  async function changeStyles(updates: Record<string, string>) {
    // 1. Ha épp dolgozunk, vagy nincs kijelölés, STOP.
    if (isBusy.value || !selectedObject.value || !selectedObjectConfig.value) return

    try {
      isBusy.value = true // 🔒 ZÁROLÁS BE

      console.group(`[SelectionStore] 🎨 Tömeges csere (${Object.keys(updates).length} db)`)

      const currentComponentState = JSON.parse(
        JSON.stringify(selectedObject.value.userData.componentState || {}),
      )

      // Update
      Object.entries(updates).forEach(([slotId, newComponentId]) => {
        currentComponentState[slotId] = newComponentId
      })

      // Takarítás
      const validSlotIds = selectedObjectConfig.value.componentSlots.map((s) => s.slotId)
      Object.keys(currentComponentState).forEach((stateKey) => {
        if (!validSlotIds.includes(stateKey)) {
          // console.warn(`[SelectionStore] 🗑️ Szellem elem törlése: ${stateKey}`)
          delete currentComponentState[stateKey]
        }
      })

      console.log('Új state:', currentComponentState)
      console.groupEnd()

      // Építés
      await rebuildObjectWithNewState(currentComponentState)
    } catch (error) {
      console.error('[SelectionStore] ❌ Hiba a stílus cserénél:', error)
    } finally {
      isBusy.value = false // 🔓 ZÁROLÁS KI (Mindenképp lefut)
    }
  }

  // --- 🔄 JAVÍTOTT LAYOUT VÁLTÁS (Auto Polc Pozicionálás + Cleanup) ---
  async function applySchema(groupIndex: number, schemaId: string) {
    if (isBusy.value || !selectedObject.value || !selectedObjectConfig.value) return

    try {
      isBusy.value = true // 🔒 ZÁROLÁS BE

      const configStore = useConfigStore()
      const group = selectedObjectConfig.value.slotGroups?.[groupIndex]
      if (!group) return

      const schema = group.schemas.find((s: any) => s.id === schemaId)
      if (!schema) return

      console.group(`[SelectionStore] 🔄 LAYOUT VÁLTÁS: ${schema.name} (${schema.type})`)

      // 1. ÁLLAPOT MÁSOLÁSA
      const currentComponentState = JSON.parse(
        JSON.stringify(selectedObject.value.userData.componentState || {}),
      )

      // Törlési lista (state cleanup)
      const targetTypes = new Set<string>()
      if (schema.type === 'front') {
        targetTypes.add('fronts')
        targetTypes.add('handles')
        targetTypes.add('drawers')
      } else if (schema.type === 'shelf') {
        targetTypes.add('shelves')
      }

      Object.values(schema.apply).forEach((compId) => {
        const comp = configStore.getComponentById(compId as string)
        if (comp?.componentType) targetTypes.add(comp.componentType)
      })

      // State takarítás
      Object.keys(currentComponentState).forEach((slotId) => {
        // Polc váltásnál minden korábbi polcot törlünk
        if (schema.type === 'shelf' && slotId.startsWith('shelf_')) {
          delete currentComponentState[slotId]
          return
        }

        const currentCompId = currentComponentState[slotId]
        if (currentCompId) {
          const staticSlotDef = selectedObjectConfig.value?.componentSlots.find(
            (s) => s.slotId === slotId,
          )
          const compDef = configStore.getComponentById(currentCompId)
          const slotType = staticSlotDef?.componentType || compDef?.componentType

          if (slotType === 'corpuses') return

          // JAVÍTÁS: Polc módosításnál NE töröljük az attach_ slotokat (ajtók, stb.)
          // Csak akkor törlünk attach_ slotot, ha NEM polc sémát alkalmazunk,
          // VAGY ha az adott slot típusa benne van a törlendők között.
          const isShelfUpdate = schema.type === 'shelf'
          const shouldDeleteAttach = !isShelfUpdate && slotId.includes('attach_')

          if ((slotType && targetTypes.has(slotType)) || shouldDeleteAttach) {
            delete currentComponentState[slotId]
          }
        }
      })

      // 2. ÚJ ELEMEK BEÍRÁSA A STATE-BE
      Object.entries(schema.apply).forEach(([slotId, componentId]) => {
        if (componentId) currentComponentState[slotId] = componentId
      })

      // Polc state generálás
      const generatedShelfSlots: string[] = []
      if (schema.type === 'shelf' && (schema as any).shelfConfig) {
        const { count, componentId } = (schema as any).shelfConfig
        if (count > 0 && componentId) {
          for (let i = 1; i <= count; i++) {
            const slotId = `shelf_${i}`
            currentComponentState[slotId] = componentId
            generatedShelfSlots.push(slotId)
          }
        }
      }

      // 3. 🛠️ CONFIG PATCHELÉS (Slotok kezelése)
      const newConfig = JSON.parse(JSON.stringify(selectedObjectConfig.value)) as FurnitureConfig
      const corpusSlot = newConfig.componentSlots.find((s) => s.componentType === 'corpuses')
      const corpusSlotId = corpusSlot ? corpusSlot.slotId : 'corpus_1'

      // A) Fix slotok (pl. fogantyú) hozzáadása
      Object.keys(schema.apply).forEach((slotId) => {
        if (newConfig.componentSlots.find((s) => s.slotId === slotId)) return
        // ... (ez a rész változatlan, a slot definíció létrehozása) ...
        const parts = slotId.split('__')
        let attachTo = parts.slice(0, -1).join('__')
        const point = parts[parts.length - 1]
        if (attachTo === 'root') attachTo = corpusSlotId
        const compId = schema.apply[slotId]
        const compDef = configStore.getComponentById(compId as string)

        newConfig.componentSlots.push({
          slotId: slotId,
          name: slotId,
          componentType: compDef?.componentType || 'unknown',
          allowedComponents: compId ? [compId as string] : [],
          defaultComponent: compId as string,
          attachToSlot: attachTo,
          useAttachmentPoint: point,
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          isAutoGenerated: true,
        })
      })

      // B) POLC SLOTOK FRISSÍTÉSE (Törlés és Újragenerálás)

      // 1. Lépés: Töröljük a régi generált polc slotokat a configból
      // Ez azért kell, hogy ne maradjanak "szellem" slotok, és a pozíciók frissüljenek
      newConfig.componentSlots = newConfig.componentSlots.filter(
        (s) => !s.slotId.startsWith('shelf_'),
      )

      // 2. Lépés: Pozíció számítás
      const corpusId = currentComponentState[corpusSlotId]
      const corpusComp = configStore.getComponentById(corpusId)
      const corpusHeight = corpusComp?.properties?.height || 720

      // +1 osztás, hogy egyenletes legyen (pl. 1 polc -> 2 térfél)
      const segmentHeight = corpusHeight / (generatedShelfSlots.length + 1)

      // 3. Lépés: Új slotok beszúrása a helyes pozícióval
      generatedShelfSlots.forEach((slotId, index) => {
        const yPos = segmentHeight * (index + 1)

        // Korrekció: A korpusz origója általában az alján van.
        // Ha a modellben máshogy van, itt kell offsetelni.
        // Jelenleg feltételezzük: Y=0 a korpusz alja.

        const newSlotDef: ComponentSlotConfig = {
          slotId: slotId,
          name: `Auto Shelf ${slotId}`,
          componentType: 'shelves',
          allowedComponents: [currentComponentState[slotId]],
          defaultComponent: currentComponentState[slotId],
          attachToSlot: corpusSlotId,
          useAttachmentPoint: undefined, // Kikapcsoljuk a pont keresést
          position: { x: 0, y: yPos, z: 0 }, // Abszolút pozíció a korpuszhoz képest
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          isAutoGenerated: true,
        }

        console.log(`✨ Polc slot frissítve: ${slotId} @ Y=${Math.round(yPos)}mm`)
        newConfig.componentSlots.push(newSlotDef)
      })

      console.log('📝 Új állapot:', currentComponentState)
      console.groupEnd()

      await rebuildObjectWithNewState(currentComponentState, newConfig)
    } catch (error) {
      console.error('[SelectionStore] ❌ Hiba a layout váltásnál:', error)
    } finally {
      isBusy.value = false // 🔓 ZÁROLÁS KI
    }
  }

  // --- SEGÉDFÜGGVÉNY: ÚJRAÉPÍTÉS ---
  // JAVÍTÁS: Kivettük a felesleges eslint-disable sort
  async function rebuildObjectWithNewState(
    newComponentState: any,
    overrideConfig?: FurnitureConfig,
  ) {
    if (!selectedObject.value) return

    const experience = Experience.getInstance()
    const originalObject = selectedObject.value
    const parent = originalObject.parent

    if (!parent) return

    experience.camera.transformControls.detach()

    const config = overrideConfig || originalObject.userData.config

    const materialState = originalObject.userData.materialState
    const position = originalObject.position.clone()
    const rotation = originalObject.rotation.clone()
    const uuidToReplace = originalObject.uuid

    try {
      const newObject = await experience.assetManager.buildFurnitureFromConfig(
        config,
        newComponentState,
      )

      newObject.userData.materialState = materialState
      newObject.userData.config = config

      await experience.stateManager.applyMaterialsToObject(newObject)

      newObject.position.copy(position)
      newObject.rotation.copy(rotation)

      parent.remove(originalObject)
      parent.add(newObject)

      experience.experienceStore.replaceObject(uuidToReplace, newObject)
      selectObject(newObject)

      console.log('[SelectionStore] ✅ Objektum sikeresen cserélve.')
    } catch (error) {
      console.error('[SelectionStore] ❌ Hiba az objektum cseréjénél:', error)
      experience.camera.transformControls.attach(originalObject)
    }
  }

  return {
    selectedObject,
    selectedObjectConfig,
    objectToDeleteUUID,
    materialChangeRequest,
    styleChangeRequest,
    objectToDuplicateUUID,
    isBusy,
    duplicateSelectedObject,
    acknowledgeDuplication,
    selectObject,
    clearSelection,
    deleteSelectedObject,
    acknowledgeDeletion,
    changeMaterial,
    acknowledgeMaterialChange,
    changeStyle,
    changeStyles,
    applySchema,
  }
})
