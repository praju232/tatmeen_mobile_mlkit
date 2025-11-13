declare module '@capacitor-community/barcode-scanner';
declare module '@capacitor-mlkit/barcode-scanning';

// BarcodeDetector API declarations
interface BarcodeDetectorOptions {
  formats: string[];
}

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DetectedBarcode {
  rawValue: string;
  boundingBox: BoundingBox;
  format: string;
  cornerPoints: Array<{ x: number; y: number }>;
}

declare class BarcodeDetector {
  constructor(options?: BarcodeDetectorOptions);
  detect(image: ImageBitmapSource): Promise<DetectedBarcode[]>;
  static getSupportedFormats(): Promise<string[]>;
}

interface Window {
  BarcodeDetector: typeof BarcodeDetector;
} 