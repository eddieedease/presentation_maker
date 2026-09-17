// reveal.js 5.x ships no type declarations; these describe the slice we use.
declare module 'reveal.js/dist/reveal.esm.js' {
  export interface RevealOptions {
    [option: string]: unknown;
  }

  export interface RevealApi {
    initialize(config?: RevealOptions): Promise<void>;
    destroy(): void;
    sync(): void;
    slide(indexh: number, indexv?: number, fragment?: number): void;
    getIndices(): { h: number; v: number; f?: number };
    getTotalSlides(): number;
    on(type: string, listener: (event: Event) => void): void;
    off(type: string, listener: (event: Event) => void): void;
    layout(): void;
  }

  const Reveal: {
    new (element: HTMLElement, options?: RevealOptions): RevealApi;
  };

  export default Reveal;
}

declare module 'reveal.js/plugin/highlight/highlight.esm.js' {
  const plugin: unknown;
  export default plugin;
}

declare module 'reveal.js/plugin/notes/notes.esm.js' {
  const plugin: unknown;
  export default plugin;
}

declare module 'reveal.js/plugin/zoom/zoom.esm.js' {
  const plugin: unknown;
  export default plugin;
}
