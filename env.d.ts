/// <reference types="vite/client" />
/// <reference types="vite-svg-loader" />

declare module '*.vue' {
  import type { ComponentOptions } from 'vue';
  const component: ComponentOptions;
  export default component;
}