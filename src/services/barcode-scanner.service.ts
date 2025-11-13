import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { BarcodeFormat, BrowserMultiFormatReader, DecodeHintType } from '@zxing/library';

export interface ScannedBarcode {
  id: string;
  data: string;
  format: string;
  timestamp: Date;
  productName?: string;
  quantity?: number;
  location?: string;
}

@Injectable({
  providedIn: 'root'
})
export class BarcodeScannerService {
  private scannedBarcodesSubject = new BehaviorSubject<ScannedBarcode[]>([]);
  public scannedBarcodes$ = this.scannedBarcodesSubject.asObservable();

  private currentScannedBarcodes: ScannedBarcode[] = [];
  private codeReader: BrowserMultiFormatReader;
  private isScanning = false;
  private scannedBarcodeIds = new Set<string>();

  constructor() {
    // Initialize the barcode reader with support for GS1 Data Matrix
    this.codeReader = new BrowserMultiFormatReader();
    
    // Configure hints for better GS1 Data Matrix detection
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.DATA_MATRIX,
      BarcodeFormat.QR_CODE,
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E
    ]);
    hints.set(DecodeHintType.TRY_HARDER, true);
    
    this.codeReader.hints = hints;
  }

  /**
   * Start continuous barcode scanning
   */
  async startContinuousScanning(): Promise<boolean> {
    try {
      if (this.isScanning) {
        return true;
      }

      // Get available video input devices
      const videoInputDevices = await this.codeReader.listVideoInputDevices();
      
      if (videoInputDevices.length === 0) {
        throw new Error('No camera devices found');
      }

      this.isScanning = true;
      const selectedDeviceId = videoInputDevices[0].deviceId;

      // Start continuous decoding
      this.codeReader.decodeFromVideoDevice(selectedDeviceId, 'video', (result, err) => {
        if (result && this.isScanning) {
          const scannedBarcode = this.createScannedBarcode(result);
          
          // Check for duplicates
          if (!this.scannedBarcodeIds.has(scannedBarcode.data)) {
            this.scannedBarcodeIds.add(scannedBarcode.data);
            this.addScannedBarcode(scannedBarcode);
            console.log('Scanned barcode:', scannedBarcode.data);
          }
        }
        if (err && !(err instanceof Error)) {
          console.error('Barcode scanning error:', err);
        }
      });

      return true;
    } catch (error) {
      console.error('Camera scanning error:', error);
      this.isScanning = false;
      return false;
    }
  }

  /**
   * Stop continuous barcode scanning
   */
  stopContinuousScanning(): void {
    this.isScanning = false;
    this.codeReader.reset();
  }

  /**
   * Check if currently scanning
   */
  getScanningStatus(): boolean {
    return this.isScanning;
  }

  /**
   * Scan single barcode (legacy method for backward compatibility)
   */
  async scanBarcode(): Promise<ScannedBarcode | null> {
    // Fallback to mock scanning for single barcode
    return this.mockScanBarcode();
  }

  /**
   * Mock barcode scanning for development/testing
   */
  private async mockScanBarcode(): Promise<ScannedBarcode | null> {
    return new Promise((resolve) => {
      setTimeout(() => {
        const mockBarcodes = this.generateMockBarcodes();
        const randomBarcode = mockBarcodes[Math.floor(Math.random() * mockBarcodes.length)];
        
        if (randomBarcode) {
          this.addScannedBarcode(randomBarcode);
          resolve(randomBarcode);
        } else {
          resolve(null);
        }
      }, 2000);
    });
  }

  /**
   * Create ScannedBarcode object from ZXing result
   */
  private createScannedBarcode(result: any): ScannedBarcode {
    const barcodeId = `barcode_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      id: barcodeId,
      data: result.getText(),
      format: result.getBarcodeFormat().toString(),
      timestamp: new Date(),
      productName: this.getProductNameFromBarcode(result.getText()),
      quantity: this.getQuantityFromBarcode(result.getText()),
      location: this.getLocationFromBarcode(result.getText())
    };
  }

  /**
   * Add a scanned barcode to the list
   */
  addScannedBarcode(barcode: ScannedBarcode): void {
    this.currentScannedBarcodes.unshift(barcode);
    this.scannedBarcodesSubject.next([...this.currentScannedBarcodes]);
  }

  /**
   * Get all scanned barcodes
   */
  getScannedBarcodes(): ScannedBarcode[] {
    return [...this.currentScannedBarcodes];
  }

  /**
   * Clear all scanned barcodes
   */
  clearScannedBarcodes(): void {
    this.currentScannedBarcodes = [];
    this.scannedBarcodeIds.clear();
    this.scannedBarcodesSubject.next([]);
  }

  /**
   * Remove a specific barcode
   */
  removeBarcode(barcodeId: string): void {
    this.currentScannedBarcodes = this.currentScannedBarcodes.filter(b => b.id !== barcodeId);
    this.scannedBarcodesSubject.next([...this.currentScannedBarcodes]);
  }

  /**
   * Generate mock GS1 Data Matrix barcodes for demonstration
   */
  private generateMockBarcodes(): ScannedBarcode[] {
    const mockProducts = [
      { name: 'Electronics Component A', quantity: 50, location: 'Zone A-1' },
      { name: 'Clothing Item B', quantity: 25, location: 'Zone B-2' },
      { name: 'Home & Garden Product C', quantity: 100, location: 'Zone C-3' },
      { name: 'Sports Equipment D', quantity: 15, location: 'Zone D-1' },
      { name: 'Electronics Component E', quantity: 75, location: 'Zone A-2' },
      { name: 'Clothing Item F', quantity: 30, location: 'Zone B-1' },
      { name: 'Home & Garden Product G', quantity: 60, location: 'Zone C-1' },
      { name: 'Sports Equipment H', quantity: 20, location: 'Zone D-2' }
    ];

    return mockProducts.map((product, index) => ({
      id: `barcode_${Date.now()}_${index}`,
      data: `01${String(Math.floor(Math.random() * 1000000000000)).padStart(12, '0')}21${String(Math.floor(Math.random() * 100000000000)).padStart(10, '0')}`,
      format: 'GS1 Data Matrix',
      timestamp: new Date(),
      productName: product.name,
      quantity: product.quantity,
      location: product.location
    }));
  }

  /**
   * Parse GS1 Data Matrix barcode data
   */
  parseGS1DataMatrix(data: string): any {
    const result: any = {};
    
    // GS1 Data Matrix parsing logic
    // This is a simplified parser for demonstration
    if (data.startsWith('01')) {
      result.gtin = data.substring(2, 14);
    }
    if (data.includes('21')) {
      const serialIndex = data.indexOf('21');
      result.serialNumber = data.substring(serialIndex + 2, serialIndex + 12);
    }
    
    return result;
  }

  /**
   * Get product name from barcode data
   */
  private getProductNameFromBarcode(barcodeData: string): string {
    // In a real implementation, this would query a database
    // For now, we'll use a simple mapping based on barcode patterns
    const productMap: { [key: string]: string } = {
      '01': 'Electronics Component',
      '02': 'Clothing Item',
      '03': 'Home & Garden Product',
      '04': 'Sports Equipment',
      '05': 'Food & Beverage',
      '06': 'Health & Beauty',
      '07': 'Automotive Parts',
      '08': 'Office Supplies'
    };

    const prefix = barcodeData.substring(0, 2);
    return productMap[prefix] || 'Unknown Product';
  }

  /**
   * Get quantity from barcode data
   */
  private getQuantityFromBarcode(barcodeData: string): number {
    // Extract quantity from barcode (simplified logic)
    // In real implementation, this would parse GS1 data properly
    const quantityMatch = barcodeData.match(/\d{2,3}$/);
    return quantityMatch ? parseInt(quantityMatch[0]) : Math.floor(Math.random() * 100) + 1;
  }

  /**
   * Get location from barcode data
   */
  private getLocationFromBarcode(barcodeData: string): string {
    // Extract location from barcode (simplified logic)
    const locations = ['Zone A-1', 'Zone A-2', 'Zone B-1', 'Zone B-2', 'Zone C-1', 'Zone C-2', 'Zone D-1', 'Zone D-2'];
    const hash = barcodeData.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);
    return locations[Math.abs(hash) % locations.length];
  }

  /**
   * Stop camera scanning
   */
  stopScanning(): void {
    this.codeReader.reset();
  }

  /**
   * Get available cameras
   */
  async getAvailableCameras(): Promise<MediaDeviceInfo[]> {
    try {
      return await this.codeReader.listVideoInputDevices();
    } catch (error) {
      console.error('Error getting cameras:', error);
      return [];
    }
  }
}
