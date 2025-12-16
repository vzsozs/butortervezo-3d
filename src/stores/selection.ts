// src/stores/selection.ts

import { defineStore } from 'pinia'
import type { Group } from 'three'
import { ref, computed, shallowRef, triggerRef } from 'vue'
import type { FurnitureConfig } from '@/config/furniture' // JAVÍTÁS: ComponentSlotConfig kivéve
import { ComponentType } from '@/config/furniture'
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
      const controls = experience.camera.transformControls

      if (object) {
        // --- KIJELÖLÉS ---
        controls.visible = true
        controls.attach(object)
      } else {
        // --- LECSATOLÁS ---
        controls.detach()
        controls.visible = false // Ez tünteti el a sárga dobozt
      }
    }
  }

  function clearSelection() {
    selectObject(null)
  }
  function deleteSelectedObject() {
    if (selectedObject.value) {
      objectToDeleteUUID.value = selectedObject.value.uuid
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

  // 🔥 ÚJ: Tömeges anyagcsere (Batch)
  function changeMaterials(updates: { slotId: string; materialId: string }[]) {
    if (!selectedObject.value) return

    // 1. AZONNALI UI FRISSÍTÉS (Optimista update)
    const currentMatState = selectedObject.value.userData.materialState || {}

    updates.forEach((update) => {
      currentMatState[update.slotId] = update.materialId
    })

    selectedObject.value.userData.materialState = currentMatState
    triggerRef(selectedObject)

    // 2. KÜLDÉS A 3D ENGINE-NEK
    updates.forEach((update, index) => {
      setTimeout(() => {
        materialChangeRequest.value = {
          targetUUID: selectedObject.value!.uuid,
          slotId: update.slotId,
          materialId: update.materialId,
        }
      }, index * 20)
    })
  }

  function acknowledgeMaterialChange() {
    materialChangeRequest.value = null
  }

  async function changeStyle(slotId: string, newComponentId: string) {
    if (!selectedObject.value || !selectedObjectConfig.value) return

    console.group(`[SelectionStore] 🎨 Stílus csere: ${slotId} -> ${newComponentId}`)

    const currentComponentState = JSON.parse(
      JSON.stringify(selectedObject.value.userData.componentState || {}),
    )

    currentComponentState[slotId] = newComponentId

    // 3. 🧹 SZIGORÚ TAKARÍTÁS (SANITIZATION)
    const validSlotIds = selectedObjectConfig.value.componentSlots.map((s) => s.slotId)

    Object.keys(currentComponentState).forEach((stateKey) => {
      if (!validSlotIds.includes(stateKey)) {
        console.warn(`[SelectionStore] 🗑️ Szellem elem törlése a state-ből: ${stateKey}`)
        delete currentComponentState[stateKey]
      }
    })

    console.log('Tisztított State:', currentComponentState)
    console.groupEnd()

    await rebuildObjectWithNewState(currentComponentState)
  }

  // 🔥 ÚJ: Tömeges csere a versenyhelyzetek elkerülésére
  async function changeStyles(updates: Record<string, string>) {
    if (isBusy.value || !selectedObject.value || !selectedObjectConfig.value) return

    try {
      isBusy.value = true // 🔒 ZÁROLÁS BE

      console.group(`[SelectionStore] 🎨 Tömeges csere (${Object.keys(updates).length} db)`)

      const currentComponentState = JSON.parse(
        JSON.stringify(selectedObject.value.userData.componentState || {}),
      )

      Object.entries(updates).forEach(([slotId, newComponentId]) => {
        currentComponentState[slotId] = newComponentId
      })

      const validSlotIds = selectedObjectConfig.value.componentSlots.map((s) => s.slotId)
      Object.keys(currentComponentState).forEach((stateKey) => {
        if (!validSlotIds.includes(stateKey)) {
          delete currentComponentState[stateKey]
        }
      })

      console.log('Új state:', currentComponentState)
      console.groupEnd()

      await rebuildObjectWithNewState(currentComponentState)
    } catch (error) {
      console.error('[SelectionStore] ❌ Hiba a stílus cserénél:', error)
    } finally {
      isBusy.value = false // 🔓 ZÁROLÁS KI
    }
  }

  // --- 🔄 JAVÍTOTT LAYOUT VÁLTÁS (Polc logika eltávolítva) ---
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
        targetTypes.add(ComponentType.FRONT)
        targetTypes.add(ComponentType.HANDLE)
        targetTypes.add(ComponentType.DRAWER)
      }
      // POLC TÖRLÉS KIVETTVE - A procedurális rendszer kezeli

      Object.values(schema.apply).forEach((compId) => {
        const comp = configStore.getComponentById(compId as string)
        if (comp?.componentType) targetTypes.add(comp.componentType)
      })

      // State takarítás
      Object.keys(currentComponentState).forEach((slotId) => {
        const currentCompId = currentComponentState[slotId]
        if (currentCompId) {
          const staticSlotDef = selectedObjectConfig.value?.componentSlots.find(
            (s) => s.slotId === slotId,
          )
          const compDef = configStore.getComponentById(currentCompId)
          const slotType = staticSlotDef?.componentType || compDef?.componentType

          if (slotType === ComponentType.CORPUS) return

          // attach_ slotok törlése, ha releváns
          const shouldDeleteAttach = slotId.includes('attach_')

          if ((slotType && targetTypes.has(slotType)) || shouldDeleteAttach) {
            delete currentComponentState[slotId]
          }
        }
      })

      // 2. ÚJ ELEMEK BEÍRÁSA A STATE-BE
      Object.entries(schema.apply).forEach(([slotId, componentId]) => {
        if (componentId) currentComponentState[slotId] = componentId
      })

      // 3. 🛠️ CONFIG PATCHELÉS (Slotok kezelése)
      const newConfig = JSON.parse(JSON.stringify(selectedObjectConfig.value)) as FurnitureConfig
      const corpusSlot = newConfig.componentSlots.find(
        (s) => s.componentType === ComponentType.CORPUS,
      )
      const corpusSlotId = corpusSlot ? corpusSlot.slotId : 'corpus_1'

      // A) Fix slotok (pl. fogantyú) hozzáadása
      Object.keys(schema.apply).forEach((slotId) => {
        if (newConfig.componentSlots.find((s) => s.slotId === slotId)) return

        const parts = slotId.split('__')
        let attachTo = parts.slice(0, -1).join('__')
        const point = parts[parts.length - 1]
        if (attachTo === 'root') attachTo = corpusSlotId
        const compId = schema.apply[slotId]
        const compDef = configStore.getComponentById(compId as string)

        const savedProps = (schema.slotProperties && schema.slotProperties[slotId]) || {}

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
          ...savedProps,
        })
      })

      // B) POLC SLOTOK FRISSÍTÉSE - KIVETTVE
      // A procedurális rendszer nem igényel slotokat a configban,
      // mert közvetlenül a Three.js scene-hez adja a BoxGeometry-ket.

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

    // Polc adatok átmentése
    const shelfCount = originalObject.userData.shelfCount
    const shelfType = originalObject.userData.shelfType

    try {
      const newObject = await experience.assetManager.buildFurnitureFromConfig(
        config,
        newComponentState,
      )

      newObject.userData.materialState = materialState
      newObject.userData.config = config
      newObject.userData.initialized = originalObject.userData.initialized

      // Polc adatok visszaírása (EZ A LÉNYEG!)
      if (shelfCount !== undefined) newObject.userData.shelfCount = shelfCount
      if (shelfType !== undefined) newObject.userData.shelfType = shelfType

      await experience.stateManager.applyMaterialsToObject(newObject)

      newObject.position.copy(position)
      newObject.rotation.copy(rotation)

      parent.remove(originalObject)
      parent.add(newObject)

      experience.experienceStore.replaceObject(uuidToReplace, newObject)
      selectObject(newObject)

      experience.historyStore.addState()

      console.log('[SelectionStore] ✅ Objektum sikeresen cserélve.')
    } catch (error) {
      console.error('[SelectionStore] ❌ Hiba az objektum cseréjénél:', error)
      experience.camera.transformControls.attach(originalObject)
    }
  }

  function acknowledgeStyleChange() {
    styleChangeRequest.value = null
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
    changeMaterials,
    acknowledgeMaterialChange,
    changeStyle,
    changeStyles,
    applySchema,
    acknowledgeStyleChange,
  }
})
