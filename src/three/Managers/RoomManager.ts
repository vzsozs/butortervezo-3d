import * as THREE from 'three'
import type Experience from '../Experience'
import { useRoomStore } from '@/stores/room'
import { watch } from 'vue'
import { storeToRefs } from 'pinia'

// KONVERZIÓ: 1 mm = 0.001 m
const UNIT_SCALE = 0.001

export default class RoomManager {
  private experience: Experience
  private scene: THREE.Scene
  private roomGroup: THREE.Group
  private roomStore: ReturnType<typeof useRoomStore>

  private roomMaterial: THREE.MeshStandardMaterial

  constructor(experience: Experience) {
    this.experience = experience
    this.scene = experience.scene
    this.roomGroup = new THREE.Group()
    this.scene.add(this.roomGroup)

    this.roomStore = useRoomStore()

    this.roomMaterial = new THREE.MeshStandardMaterial({
      color: 0x444444,
      roughness: 0.5,
      metalness: 0.1,
      side: THREE.FrontSide,
      transparent: true,
      opacity: 0.3, // Vissza 0.3-ra, hogy jobban látszódjon az árnyék
      depthWrite: false,

      // Kicsit visszavettem a fényerőből, hogy az árnyékok érvényesüljenek
      emissive: 0xe0e0e0,
      emissiveIntensity: 0.2,
    })

    const { roomDimensions, openings } = storeToRefs(this.roomStore)

    watch(
      [roomDimensions, openings],
      () => {
        this.buildRoom()
      },
      { deep: true },
    )

    this.buildRoom()
  }

  private buildRoom() {
    this.roomGroup.clear()

    const width = this.roomStore.roomDimensions.width * UNIT_SCALE
    const depth = this.roomStore.roomDimensions.depth * UNIT_SCALE
    const height = this.roomStore.roomDimensions.height * UNIT_SCALE

    // 1. PADLÓ
    const floorGeo = new THREE.PlaneGeometry(width, depth)
    const floor = new THREE.Mesh(floorGeo, this.roomMaterial)
    floor.rotation.x = -Math.PI / 2
    floor.position.y = 0

    // 🔥 ÁRNYÉK FOGADÁSA BEKAPCSOLVA
    floor.receiveShadow = true

    this.roomGroup.add(floor)

    // 2. FALAK
    this.createWall(width, height, 0, new THREE.Vector3(0, height / 2, -depth / 2), 0)
    this.createWall(width, height, 2, new THREE.Vector3(0, height / 2, depth / 2), Math.PI)
    this.createWall(depth, height, 3, new THREE.Vector3(-width / 2, height / 2, 0), Math.PI / 2)
    this.createWall(depth, height, 1, new THREE.Vector3(width / 2, height / 2, 0), -Math.PI / 2)
  }

  private createWall(
    wallWidth: number,
    wallHeight: number,
    wallIndex: number,
    position: THREE.Vector3,
    rotationY: number,
  ) {
    const wallOpenings = this.roomStore.openings.filter((o) => o.wallIndex === wallIndex)

    // 1. ESET: NINCS LYUK
    if (wallOpenings.length === 0) {
      const geo = new THREE.PlaneGeometry(wallWidth, wallHeight)
      const wall = new THREE.Mesh(geo, this.roomMaterial)

      wall.position.copy(position)
      wall.rotation.y = rotationY

      // 🔥 ÁRNYÉK FOGADÁSA BEKAPCSOLVA
      wall.receiveShadow = true

      this.roomGroup.add(wall)
      return
    }

    // 2. ESET: VAN LYUK
    const shape = new THREE.Shape()
    const halfW = wallWidth / 2
    const halfH = wallHeight / 2

    shape.moveTo(-halfW, -halfH)
    shape.lineTo(halfW, -halfH)
    shape.lineTo(halfW, halfH)
    shape.lineTo(-halfW, halfH)
    shape.lineTo(-halfW, -halfH)

    wallOpenings.forEach((op) => {
      const holePath = new THREE.Path()

      const opPos = op.position * UNIT_SCALE
      const opWidth = op.width * UNIT_SCALE
      const opHeight = op.height * UNIT_SCALE
      const opElev = op.elevation * UNIT_SCALE

      const holeCenterX = -halfW + opPos + opWidth / 2
      const holeCenterY = -halfH + opElev + opHeight / 2
      const hW = opWidth / 2
      const hH = opHeight / 2

      holePath.moveTo(holeCenterX - hW, holeCenterY - hH)
      holePath.lineTo(holeCenterX + hW, holeCenterY - hH)
      holePath.lineTo(holeCenterX + hW, holeCenterY + hH)
      holePath.lineTo(holeCenterX - hW, holeCenterY + hH)
      holePath.lineTo(holeCenterX - hW, holeCenterY - hH)

      shape.holes.push(holePath)
    })

    const geometry = new THREE.ShapeGeometry(shape)
    const wall = new THREE.Mesh(geometry, this.roomMaterial)

    wall.position.copy(position)
    wall.rotation.y = rotationY

    // 🔥 ÁRNYÉK FOGADÁSA BEKAPCSOLVA
    wall.receiveShadow = true

    this.roomGroup.add(wall)
  }

  public update() {}
}
