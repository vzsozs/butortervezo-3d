import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface RoomOpening {
  id: string
  type: 'door' | 'window'
  wallIndex: number // 0: Front, 1: Right, 2: Back, 3: Left
  position: number // Távolság a fal bal szélétől (mm)
  width: number
  height: number
  elevation: number // Ablaknál parapet magasság
}

export const useRoomStore = defineStore('room', () => {
  // --- STATE ---

  // Szoba méretei (mm)
  const roomDimensions = ref({
    width: 4000, // Szélesség (X tengely)
    depth: 3000, // Mélység (Z tengely)
    height: 2600, // Belmagasság (Y tengely)
  })

  // Nyílászárók listája
  const openings = ref<RoomOpening[]>([])

  // --- ACTIONS ---

  function setDimensions(width: number, depth: number, height: number) {
    roomDimensions.value = { width, depth, height }
  }

  function addOpening(type: 'door' | 'window') {
    const id = `${type}_${Date.now()}`

    // Default értékek típus szerint
    const newOpening: RoomOpening =
      type === 'door'
        ? { id, type, wallIndex: 0, position: 1000, width: 900, height: 2100, elevation: 0 }
        : { id, type, wallIndex: 0, position: 1000, width: 1200, height: 1200, elevation: 900 }

    openings.value.push(newOpening)
  }

  function removeOpening(id: string) {
    openings.value = openings.value.filter((o) => o.id !== id)
  }

  function updateOpening(id: string, updates: Partial<RoomOpening>) {
    const index = openings.value.findIndex((o) => o.id === id)
    if (index !== -1) {
      openings.value[index] = { ...openings.value[index], ...updates } as RoomOpening
    }
  }

  return {
    roomDimensions,
    openings,
    setDimensions,
    addOpening,
    removeOpening,
    updateOpening,
  }
})
