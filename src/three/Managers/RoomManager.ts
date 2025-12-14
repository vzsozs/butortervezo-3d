import * as THREE from 'three'
import type Experience from '../Experience'
import { useRoomStore } from '@/stores/room'
import { watch } from 'vue'
import { storeToRefs } from 'pinia'

const UNIT_SCALE = 0.001

// Fal azonosítók a könnyű hivatkozáshoz
export const WALL_NAMES = {
  0: 'WALL 0 (BACK)',
  1: 'WALL 1 (RIGHT)',
  2: 'WALL 2 (FRONT)',
  3: 'WALL 3 (LEFT)',
}

export default class RoomManager {
  private experience: Experience
  private scene: THREE.Scene
  private roomGroup: THREE.Group
  private debugGroup: THREE.Group // Külön csoport a debug elemeknek
  private roomStore: ReturnType<typeof useRoomStore>

  public get group() {
    return this.roomGroup
  }

  private wallMaterial: THREE.MeshBasicMaterial
  private shadowMaterial: THREE.ShadowMaterial
  private floorMaterial: THREE.MeshStandardMaterial
  private wireMaterial: THREE.LineBasicMaterial

  constructor(experience: Experience) {
    this.experience = experience
    this.scene = experience.scene

    this.roomGroup = new THREE.Group()
    this.debugGroup = new THREE.Group() // Debug réteg inicializálása

    this.scene.add(this.roomGroup)
    this.scene.add(this.debugGroup) // Hozzáadjuk a scene-hez

    this.roomStore = useRoomStore()

    // 1. FAL ALAP
    this.wallMaterial = new THREE.MeshBasicMaterial({
      color: 0x4b4e52,
      side: THREE.FrontSide,
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
    })

    // 2. ÁRNYÉK
    this.shadowMaterial = new THREE.ShadowMaterial({
      color: 0x000000,
      opacity: 0.3,
      side: THREE.FrontSide,
      transparent: true,
      depthWrite: false,
    })

    // 3. PADLÓ
    this.floorMaterial = new THREE.MeshStandardMaterial({
      color: 0x6f7378,
      roughness: 0.5,
      metalness: 0.1,
      side: THREE.FrontSide,
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
    })

    // 4. Drótváz
    this.wireMaterial = new THREE.LineBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.6,
      depthTest: true,
      depthWrite: false,
    })

    const { roomDimensions, openings } = storeToRefs(this.roomStore)

    let roomHistoryTimeout: any = null

    watch(
      [roomDimensions, openings],
      () => {
        this.buildRoom()

        if (roomHistoryTimeout) clearTimeout(roomHistoryTimeout)
        roomHistoryTimeout = setTimeout(() => {
          this.experience.historyStore.addState()
        }, 500)
      },
      { deep: true },
    )

    this.buildRoom()
  }

  private buildRoom() {
    this.roomGroup.clear()
    this.debugGroup.clear() // Töröljük a régi debug elemeket is

    const width = this.roomStore.roomDimensions.width * UNIT_SCALE
    const depth = this.roomStore.roomDimensions.depth * UNIT_SCALE
    const height = this.roomStore.roomDimensions.height * UNIT_SCALE

    // PADLÓ
    const floorGeo = new THREE.PlaneGeometry(width, depth)
    const floor = new THREE.Mesh(floorGeo, this.floorMaterial)
    floor.rotation.x = -Math.PI / 2
    floor.position.y = 0
    floor.receiveShadow = true
    floor.castShadow = false
    floor.name = 'RoomFloor'
    this.addEdges(floor, floorGeo)
    this.roomGroup.add(floor)

    // FALAK LÉTREHOZÁSA
    // Wall 0: Back (-Z)
    this.createWall(width, height, 0, new THREE.Vector3(0, height / 2, -depth / 2), 0)
    // Wall 1: Right (+X)
    this.createWall(depth, height, 1, new THREE.Vector3(width / 2, height / 2, 0), -Math.PI / 2)
    // Wall 2: Front (+Z)
    this.createWall(width, height, 2, new THREE.Vector3(0, height / 2, depth / 2), Math.PI)
    // Wall 3: Left (-X)
    this.createWall(depth, height, 3, new THREE.Vector3(-width / 2, height / 2, 0), Math.PI / 2)

    // DEBUG VIZUALIZÁCIÓ (Falak nevei és normál vektorai)
    this.buildDebugVisuals(width, height, depth)
  }

  private buildDebugVisuals(w: number, h: number, d: number) {
    // 1. Tengelykereszt a padlón (X=Piros, Z=Kék)
    const axesHelper = new THREE.AxesHelper(1.5)
    axesHelper.position.y = 0.01
    this.debugGroup.add(axesHelper)

    // 2. Fal címkék és normál vektorok
    const wallConfigs = [
      { id: 0, pos: new THREE.Vector3(0, h / 2, -d / 2), normal: new THREE.Vector3(0, 0, 1) }, // Back
      { id: 1, pos: new THREE.Vector3(w / 2, h / 2, 0), normal: new THREE.Vector3(-1, 0, 0) }, // Right
      { id: 2, pos: new THREE.Vector3(0, h / 2, d / 2), normal: new THREE.Vector3(0, 0, -1) }, // Front
      { id: 3, pos: new THREE.Vector3(-w / 2, h / 2, 0), normal: new THREE.Vector3(1, 0, 0) }, // Left
    ]

    wallConfigs.forEach((config) => {
      // Címke (Sprite)
      const label = this.createDebugLabel(config.id)
      // Kicsit eltoljuk a faltól befelé, hogy látszódjon
      label.position.copy(config.pos).add(config.normal.clone().multiplyScalar(0.2))
      this.debugGroup.add(label)

      // Nyíl (ArrowHelper) - A falból befelé mutat
      const arrow = new THREE.ArrowHelper(
        config.normal,
        config.pos,
        1.0,
        0xffff00, // Sárga szín
        0.2,
        0.1,
      )
      this.debugGroup.add(arrow)
    })
  }

  private createDebugLabel(wallId: number): THREE.Sprite {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const text = WALL_NAMES[wallId as keyof typeof WALL_NAMES] || `WALL ${wallId}`

    canvas.width = 128
    canvas.height = 32 // Szélesebb canvas

    if (ctx) {
      // Háttér
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Keret színe fal szerint (hogy könnyebb legyen megkülönböztetni)
      const colors = ['#00ffff', '#ff00ff', '#00ff00', '#ffaa00'] // Cyan, Magenta, Green, Orange
      ctx.strokeStyle = colors[wallId] || 'white'
      ctx.lineWidth = 5
      ctx.strokeRect(2, 2, canvas.width - 2, canvas.height - 2)

      // Szöveg
      ctx.font = 'bold 10px Arial'
      ctx.fillStyle = 'white'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(text, canvas.width / 2, canvas.height / 2)
    }

    const texture = new THREE.CanvasTexture(canvas)
    const material = new THREE.SpriteMaterial({
      map: texture,
      depthTest: false, // Mindig látszódjon (falon át is)
      depthWrite: false,
    })

    const sprite = new THREE.Sprite(material)
    sprite.scale.set(2, 0.5, 1) // Méretarány
    return sprite
  }

  private createWall(w: number, h: number, idx: number, pos: THREE.Vector3, rot: number) {
    const wallOpenings = this.roomStore.openings.filter((o) => o.wallIndex === idx)
    let geometry: THREE.BufferGeometry

    if (wallOpenings.length === 0) {
      geometry = new THREE.PlaneGeometry(w, h)
    } else {
      const shape = new THREE.Shape()
      const hW = w / 2,
        hH = h / 2
      shape.moveTo(-hW, -hH)
      shape.lineTo(hW, -hH)
      shape.lineTo(hW, hH)
      shape.lineTo(-hW, hH)
      shape.lineTo(-hW, -hH)

      wallOpenings.forEach((op) => {
        const path = new THREE.Path()
        const opPos = op.position * UNIT_SCALE,
          opW = op.width * UNIT_SCALE,
          opH = op.height * UNIT_SCALE,
          opE = op.elevation * UNIT_SCALE
        const cX = -hW + opPos + opW / 2,
          cY = -hH + opE + opH / 2
        const oW = opW / 2,
          oH = opH / 2
        path.moveTo(cX - oW, cY - oH)
        path.lineTo(cX + oW, cY - oH)
        path.lineTo(cX + oW, cY + oH)
        path.lineTo(cX - oW, cY + oH)
        path.lineTo(cX - oW, cY - oH)
        shape.holes.push(path)
      })
      geometry = new THREE.ShapeGeometry(shape)
    }

    // A) ALAP FAL
    const wall = new THREE.Mesh(geometry, this.wallMaterial)
    wall.position.copy(pos)
    wall.rotation.y = rot
    wall.castShadow = false
    wall.receiveShadow = false

    // B) ÁRNYÉK RÉTEG
    const shadowMesh = new THREE.Mesh(geometry, this.shadowMaterial)
    shadowMesh.receiveShadow = true
    shadowMesh.castShadow = false
    shadowMesh.position.z = 0.001

    wall.add(shadowMesh)

    // C) KERET
    this.addEdges(wall, geometry)

    this.roomGroup.add(wall)
  }

  private addEdges(mesh: THREE.Mesh, geometry: THREE.BufferGeometry) {
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 1), this.wireMaterial)
    mesh.add(edges)
  }

  public update() {}

  public reset() {
    this.roomStore.reset()
  }
}
