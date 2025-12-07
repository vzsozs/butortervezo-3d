import * as THREE from 'three'
import type Experience from '../Experience'
import { useRoomStore } from '@/stores/room'
import { watch } from 'vue'
import { storeToRefs } from 'pinia'

const UNIT_SCALE = 0.001

export default class RoomManager {
  private experience: Experience
  private scene: THREE.Scene
  private roomGroup: THREE.Group
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
    this.scene.add(this.roomGroup)

    this.roomStore = useRoomStore()

    // 1. FAL ALAP (Basic - Tiszta szín)
    this.wallMaterial = new THREE.MeshBasicMaterial({
      color: 0x4b4e52,
      side: THREE.FrontSide,
      transparent: true,
      opacity: 0.1,
      depthWrite: false, // Átlátszóság miatt kell
    })

    // 2. ÁRNYÉK (ShadowMaterial - Most már bátran használhatjuk!)
    this.shadowMaterial = new THREE.ShadowMaterial({
      color: 0x000000,
      opacity: 0.3, // Finom árnyék
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

    // PADLÓ
    const floorGeo = new THREE.PlaneGeometry(width, depth)
    const floor = new THREE.Mesh(floorGeo, this.floorMaterial)
    floor.rotation.x = -Math.PI / 2
    floor.position.y = 0
    floor.receiveShadow = true
    floor.castShadow = false
    floor.name = 'RoomFloor' // JAVÍTÁS: Név adása a szűréshez
    this.addEdges(floor, floorGeo)
    this.roomGroup.add(floor)

    // FALAK
    this.createWall(width, height, 0, new THREE.Vector3(0, height / 2, -depth / 2), 0)
    this.createWall(width, height, 2, new THREE.Vector3(0, height / 2, depth / 2), Math.PI)
    this.createWall(depth, height, 3, new THREE.Vector3(-width / 2, height / 2, 0), Math.PI / 2)
    this.createWall(depth, height, 1, new THREE.Vector3(width / 2, height / 2, 0), -Math.PI / 2)
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
    wall.receiveShadow = false // Az alap fal nem fogad, csak a shadowMesh

    // B) ÁRNYÉK RÉTEG
    const shadowMesh = new THREE.Mesh(geometry, this.shadowMaterial)
    shadowMesh.receiveShadow = true
    shadowMesh.castShadow = false
    // Pici eltolás, hogy ne vibráljon
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
}
