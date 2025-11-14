// src/three/Utils/Sizes.ts
export default class Sizes extends EventTarget {
  public width: number;
  public height: number;
  public pixelRatio: number;

  constructor() {
    super(); // Fontos, hogy az EventTarget konstruktorát meghívjuk

    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.pixelRatio = Math.min(window.devicePixelRatio, 2);

    window.addEventListener('resize', this.onResize);
  }

  private onResize = () => {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.pixelRatio = Math.min(window.devicePixelRatio, 2);

    // Kibocsátunk egy 'resize' eseményt, amire más osztályok feliratkozhatnak
    this.dispatchEvent(new Event('resize'));
  }

  public destroy() {
    window.removeEventListener('resize', this.onResize);
  }
}