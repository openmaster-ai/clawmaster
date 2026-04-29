/// <reference types="vite/client" />

declare const __CLAWMASTER_VERSION__: string

declare module '*.css' {
  const content: { [className: string]: string }
  export default content
}
