// Must be imported BEFORE pdfjs-dist so the polyfills exist when pdfjs checks
// for them at module-evaluation time. @napi-rs/canvas provides Node-native
// implementations of these browser globals that pdfjs uses for rendering.
import * as canvasLib from '@napi-rs/canvas';

const { DOMMatrix, Path2D, ImageData, DOMPoint } = canvasLib;

if (typeof globalThis.DOMMatrix === 'undefined' && DOMMatrix) globalThis.DOMMatrix = DOMMatrix;
if (typeof globalThis.Path2D === 'undefined' && Path2D) globalThis.Path2D = Path2D;
if (typeof globalThis.ImageData === 'undefined' && ImageData) globalThis.ImageData = ImageData;
if (typeof globalThis.DOMPoint === 'undefined' && DOMPoint) globalThis.DOMPoint = DOMPoint;
