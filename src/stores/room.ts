import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface RoomOpening {
  id: string
  // ÚJ TÍPUS: 'opening'
  type: 'door' | 'window' | 'opening'
  wallIndex: number
  position: number
  width: number
  height: number
  elevation: number
}

export const useRoomStore = defineStore('room', () => {
  // --- STATE ---

  const roomDimensions = ref({
    width: 6000,
    depth: 4000,
    height: 2600,
  })

  const openings = ref<RoomOpening[]>([])

  // --- SEGÉDFÜGGVÉNYEK ---

  function getWallLength(wallIndex: number): number {
    return wallIndex === 0 || wallIndex === 2
      ? roomDimensions.value.width
      : roomDimensions.value.depth
  }

  function validateOpening(op: RoomOpening) {
    const wallLength = getWallLength(op.wallIndex)
    const margin = 2

    // 0. NEGATÍV ÉRTÉKEK SZŰRÉSE (ÚJ)
    if (op.width < 100) op.width = 100 // Minimum szélesség
    if (op.height < 100) op.height = 100 // Minimum magasság
    if (op.elevation < 0) op.elevation = 0

    // 1. ÜTKÖZÉSVIZSGÁLAT
    const neighbors = openings.value.filter((o) => o.wallIndex === op.wallIndex && o.id !== op.id)

    for (const neighbor of neighbors) {
      const opEnd = op.position + op.width
      const neighborEnd = neighbor.position + neighbor.width

      if (op.position < neighborEnd + margin && opEnd > neighbor.position - margin) {
        const opCenter = op.position + op.width / 2
        const neighborCenter = neighbor.position + neighbor.width / 2

        if (opCenter < neighborCenter) {
          op.position = neighbor.position - op.width - margin
        } else {
          op.position = neighborEnd + margin
        }
      }
    }

    // 2. FAL HATÁROK
    if (op.width > wallLength - margin * 2) {
      op.width = wallLength - margin * 2
    }
    if (op.position < margin) {
      op.position = margin
    }
    if (op.position + op.width > wallLength - margin) {
      op.position = wallLength - op.width - margin
    }
    if (op.elevation + op.height > roomDimensions.value.height) {
      if (op.height > roomDimensions.value.height) op.height = roomDimensions.value.height
      op.elevation = roomDimensions.value.height - op.height
    }
  }

  // --- ACTIONS ---

  function setDimensions(width: number, depth: number, height: number) {
    // Negatív értékek szűrése itt is
    roomDimensions.value = {
      width: Math.max(1000, width),
      depth: Math.max(1000, depth),
      height: Math.max(2000, height),
    }
    openings.value.forEach((op) => validateOpening(op))
  }

  // OKOS HOZZÁADÁS
  // Most már elfogadja az 'opening' típust is
  function addOpening(type: 'door' | 'window' | 'opening') {
    const id = `${type}_${Date.now()}`
    const wallIndex = 0
    const wallLength = getWallLength(wallIndex)
    const margin = 2
    const minSize = 100

    const itemsOnWall = openings.value
      .filter((o) => o.wallIndex === wallIndex)
      .sort((a, b) => a.position - b.position)

    let bestGap = { start: margin, length: 0 }
    let currentPos = margin

    for (const item of itemsOnWall) {
      const gapLength = item.position - margin - currentPos
      if (gapLength > bestGap.length) {
        bestGap = { start: currentPos, length: gapLength }
      }
      currentPos = item.position + item.width + margin
    }

    const lastGapLength = wallLength - margin - currentPos
    if (lastGapLength > bestGap.length) {
      bestGap = { start: currentPos, length: lastGapLength }
    }

    if (bestGap.length < minSize) {
      alert('Nincs elég hely a falon új elem elhelyezéséhez!')
      return
    }

    // MÉRETEK BEÁLLÍTÁSA TÍPUS SZERINT
    let defaultWidth = 900 // Ajtó alap
    let defaultHeight = 2100
    let defaultElevation = 0

    if (type === 'window') {
      defaultWidth = 1200
      defaultHeight = 1200
      defaultElevation = 900
    } else if (type === 'opening') {
      defaultWidth = 2000 // Kicsit szélesebb átjáró
      defaultHeight = 3000
      defaultElevation = 0 // Földig ér
    }

    let finalWidth = defaultWidth
    if (bestGap.length < defaultWidth) {
      finalWidth = bestGap.length
    }

    const finalPos = bestGap.start + bestGap.length / 2 - finalWidth / 2

    const newOpening: RoomOpening = {
      id,
      type,
      wallIndex,
      position: finalPos,
      width: finalWidth,
      height: defaultHeight,
      elevation: defaultElevation,
    }

    validateOpening(newOpening)
    openings.value.push(newOpening)
  }

  function removeOpening(id: string) {
    openings.value = openings.value.filter((o) => o.id !== id)
  }

  function updateOpening(id: string, updates: Partial<RoomOpening>) {
    const index = openings.value.findIndex((o) => o.id === id)
    if (index !== -1) {
      const updatedOpening = { ...openings.value[index], ...updates } as RoomOpening
      validateOpening(updatedOpening)
      openings.value[index] = updatedOpening
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
