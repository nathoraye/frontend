declare module 'imagetracerjs' {
  interface ImageTracerOptions {
    pathomit?: number;
    ltres?: number;
    qtres?: number;
    scale?: number;
    rightangleenhance?: boolean;
    numberofcolors?: number;
    [key: string]: unknown;
  }

  interface ImageTracerInstance {
    imagedataToSVG(imageData: ImageData, options?: ImageTracerOptions): string;
    imageToSVG(url: string, callback: (svgString: string) => void, options?: ImageTracerOptions): void;
  }

  const instance: ImageTracerInstance;
  export default instance;
}
