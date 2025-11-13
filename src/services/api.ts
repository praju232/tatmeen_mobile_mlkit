import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

export interface GS1BarcodeData {
  gtin: string;
  serialNumber: string;
  batchNumber?: any;
  expiryDate?: any;
  productionDate?: string;
  productName?: string;
  quantity?: any;
  location?: string;
  parentBarcode?: string;
  childBarcodes?: string[];
  isParent?: boolean;
  isChild?: boolean;
}

export interface BackendResponse {
  status: number;
  success: boolean;
  data: GS1BarcodeData[];
  message?: string;
  error?: string;
}

export interface ImageCaptureResult {
  imageData: Uint8Array;
  imageDataUrl: string;
  imageFormat: string;
  timestamp: Date;
}

export interface BarcodeDetectionResult {
  data: string;
  coordinates?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  format?: string;
  confidence?: number;
}

@Injectable({
  providedIn: 'root'
})
export class Api {
  private baseUrl = 'https://tatmeenapi.esarwa.com'; // Replace with actual backend URL
  private capturedImagesSubject = new BehaviorSubject<ImageCaptureResult[]>([]);
  public capturedImages$ = this.capturedImagesSubject.asObservable();

  private currentImages: ImageCaptureResult[] = [];

  constructor(
    private http: HttpClient,
    // private gs1Decoder: GS1DataMatrixDecoderService
  ) {}
  get(url: string): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}${url}`);
  }

  post(url: string, data: any): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}${url}`, data);
  }
  getUserCompany(){
    const userData = localStorage.getItem('userKey');
    if (userData) {
      const user = JSON.parse(userData);
      return user[0]?.company;
    }
    return 1;
  }

  async captureImage(): Promise<ImageCaptureResult | null> {
    try {
      const image = await Camera.getPhoto({
        quality: 70, // Reduced from 90 to 70 for better compression
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera
      });

      if (image.dataUrl) {
        // Compress the image further using canvas
        const compressedDataUrl = await this.compressImage(image.dataUrl, 0.8, 1024); // 80% quality, max width 1024px
        
        // Convert base64 to binary data
        const base64Data = compressedDataUrl.split(',')[1];
        const binaryString = atob(base64Data);
        const binaryData = new Uint8Array(binaryString.length);
        
        for (let i = 0; i < binaryString.length; i++) {
          binaryData[i] = binaryString.charCodeAt(i);
        }

        const imageResult: ImageCaptureResult = {
          imageData: binaryData,
          imageDataUrl: compressedDataUrl, // Store the compressed data URL for display
          imageFormat: image.format,
          timestamp: new Date()
        };

        this.addCapturedImage(imageResult);
        return imageResult;
      }

      return null;
    } catch (error) {
      console.error('Error capturing image:', error);
      throw new Error('Failed to capture image');
    }
  }

  /**
   * Compress image using canvas to reduce file size
   */
  private async compressImage(dataUrl: string, quality: number = 0.8, maxWidth: number = 1024): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        // Calculate new dimensions maintaining aspect ratio
        let { width, height } = img;
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;

        // Draw and compress
        ctx.drawImage(img, 0, 0, width, height);
        
        // Convert to compressed data URL
        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedDataUrl);
      };
      
      img.onerror = () => reject(new Error('Failed to load image for compression'));
      img.src = dataUrl;
    });
  }

  /**
   * Send image to backend for GS1 DataMatrix barcode decoding
   */
  // async decodeBarcodesFromImage(imageData: Uint8Array): Promise<BackendResponse> {
  //   try {
  //     const headers = new HttpHeaders({
  //       'Content-Type': 'application/octet-stream'
  //     });

  //     const response = await this.http.post<BackendResponse>(
  //       `${this.baseUrl}/decode-barcodes`,
  //       imageData,
  //       { headers }
  //     ).toPromise();

  //     if (response) {
  //       // Process parent-child relationships
  //       this.processParentChildRelationships(response.data);
  //       return response;
  //     }

  //     throw new Error('No response from backend');
  //   } catch (error) {
  //     console.error('Error decoding barcodes:', error);
  //     return {      
  //       status: 400,
  //       success: false,
  //       data: [],
  //       error: 'Failed to decode barcodes from image'
  //     };
  //   }
  // }

  /**
   * Send multiple images for batch processing
   */
  async decodeBarcodesFromImages(images: ImageCaptureResult[]): Promise<BackendResponse> {
    try {
      // Validate images array
      if (!images || images.length === 0) {
        throw new Error('No images provided for processing');
      }

      const formData = new FormData();
      images.forEach((img, index) => {
        // Validate image data
        if (!img.imageData || img.imageData.length === 0) {
          console.warn(`Image ${index} has no data, skipping`);
          return;
        }
        
        try {
          const blob = new Blob([new Uint8Array(img.imageData)], { type: `image/${img.imageFormat || 'jpeg'}` });
          formData.append(`image`, blob);
        } catch (error) {
          console.error(`Error creating blob for image ${index}:`, error);
          throw new Error(`Invalid image data for image ${index}`);
        }
      });

      // Check if any valid images were added
      if (formData.getAll('image').length === 0) {
        throw new Error('No valid images to process');
      }

      const response = await this.http.post<any>(
        `${this.baseUrl}/scanner/qr-scanner/`,
        formData
      ).toPromise();

      if (response && Array.isArray(response.data)) {
        // Process the raw barcode data from backend
        // const decodedBarcodes = this.gs1Decoder.parseMultipleBarcodes(response.data);
        
        // Add product names and other data
        // decodedBarcodes.forEach((barcode) => {
        //   barcode.productName = this.getProductNameFromBarcode(barcode.gtin);
        //   barcode.quantity = this.getQuantityFromBarcode(barcode.serialNumber);
        //   barcode.location = this.getLocationFromBarcode(barcode.gtin);
        // });

        return {
          status: 200,
          success: true,
          data: response.data,
          message: `Successfully decoded ${response.data.length} GS1 DataMatrix barcodes`
        };
      }

      throw new Error('No response from backend');
    } catch (error) {
      console.error('Error decoding barcodes from images:', error);
      return {
        status: 400,
        success: false,
        data: [],
        error: 'Failed to decode barcodes from images'
      };
    }
  }

  /**
   * Process parent-child relationships in barcode data
   */
  private processParentChildRelationships(barcodes: GS1BarcodeData[]): void {
    // Group barcodes by GTIN to identify parent-child relationships
    const gtinGroups = new Map<string, GS1BarcodeData[]>();
    
    barcodes.forEach(barcode => {
      if (!gtinGroups.has(barcode.gtin)) {
        gtinGroups.set(barcode.gtin, []);
      }
      gtinGroups.get(barcode.gtin)!.push(barcode);
    });

    // Process each GTIN group
    gtinGroups.forEach((groupBarcodes, gtin) => {
      if (groupBarcodes.length > 1) {
        // Multiple barcodes with same GTIN - likely parent-child relationship
        const parentBarcode = groupBarcodes.find(b => b.isParent) || groupBarcodes[0];
        const childBarcodes = groupBarcodes.filter(b => b !== parentBarcode);

        // Mark parent
        parentBarcode.isParent = true;
        parentBarcode.childBarcodes = childBarcodes.map(c => c.serialNumber);

        // Mark children
        childBarcodes.forEach(child => {
          child.isChild = true;
          child.parentBarcode = parentBarcode.serialNumber;
        });
      }
    });
  }

 
   addCapturedImage(image: ImageCaptureResult): void {
    this.currentImages.unshift(image);
    this.capturedImagesSubject.next([...this.currentImages]);
  }

  /**
   * Get all captured images
   */
  getCapturedImages(): ImageCaptureResult[] {
    return [...this.currentImages];
  }

  /**
   * Clear all captured images
   */
  clearCapturedImages(): void {
    this.currentImages = [];
    this.capturedImagesSubject.next([]);
  }

  /**
   * Remove a specific captured image
   */
  removeCapturedImage(timestamp: Date): void {
    this.currentImages = this.currentImages.filter(img => img.timestamp !== timestamp);
    this.capturedImagesSubject.next([...this.currentImages]);
  }

  /**
   * Mock backend response for development/testing
   */
  // async mockDecodeBarcodes(imageData: Uint8Array): Promise<BackendResponse> {
  //   // Simulate API delay
  //   await new Promise(resolve => setTimeout(resolve, 2000));

  //   // Generate mock GS1 DataMatrix barcode data
  //   const mockBarcodeData = [
  //     '010123456789012321SN00123456710BATCH00117251231',
  //     '010123456789012321SN00123456810BATCH001',
  //     '010123456789012321SN00123456910BATCH001',
  //     '010987654321098721SN98765432110BATCH00217251231',
  //     '010987654321098721SN98765432210BATCH002'
  //   ];

  //   // Decode using GS1 DataMatrix decoder
  //   const decodedBarcodes = this.gs1Decoder.parseMultipleBarcodes(mockBarcodeData);

  //   // Add product names and other mock data
  //   decodedBarcodes.forEach((barcode, index) => {
  //     barcode.productName = this.getMockProductName(barcode.gtin);
  //     barcode.quantity = this.getMockQuantity(barcode.gtin);
  //     barcode.location = this.getMockLocation(barcode.gtin);
  //   });

  //   return {
  //     success: true,
  //     barcodes: decodedBarcodes,
  //     message: `Successfully decoded ${decodedBarcodes.length} GS1 DataMatrix barcodes`
  //   };
  // }

  /**
   * Get product name based on GTIN
   */
  

  /**
   * Get quantity based on serial number
   */
 
  /**
   * Get barcode list for a specific item
   */
  async getBarcodeList(itemId: string, grnRef: string): Promise<{ success: boolean; barcodes: any[]; error?: string }> {
    try {
      const response = await this.http.post<any>(
        `${this.baseUrl}/items/barcode-list/`,
        { itemId, grnRef }
      ).toPromise();

      if (response && response.data) {
        return {
          success: true,
          barcodes: response.data
        };
      }

      throw new Error('No barcode data received');
    } catch (error) {
      console.error('Error getting barcode list:', error);
      return {
        success: false,
        barcodes: [],
        error: 'Failed to get barcode list'
      };
    }
  }

  /**
   * Get item configuration for batch scanning
   */
  async getItemConfiguration(itemId: string): Promise<{ success: boolean; config: any; error?: string }> {
    try {
      const response = await this.http.get<any>(
        `${this.baseUrl}/items/configuration/${itemId}/`
      ).toPromise();

      if (response && response.data) {
        return {
          success: true,
          config: response.data
        };
      }

      throw new Error('No configuration data received');
    } catch (error) {
      console.error('Error getting item configuration:', error);
      return {
        success: false,
        config: null,
        error: 'Failed to get item configuration'
      };
    }
  }

  /**
   * Submit batch scanning results
   */
  async submitBatchScanningResults(data: {
    grnRef: string;
    itemId: string;
    itemBarcode: string;
    scannedBoxes: any[];
    scannedStrips: any[];
  }): Promise<{ success: boolean; message: string; error?: string }> {
    try {
      const response = await this.http.post<any>(
        `${this.baseUrl}/invoice/batch-scanning-complete/`,
        data
      ).toPromise();

      if (response && (response.status === 200 || response.success)) {
        return {
          success: true,
          message: response.message || 'Batch scanning results submitted successfully'
        };
      }

      throw new Error(response?.error || 'Failed to submit batch scanning results');
    } catch (error) {
      console.error('Error submitting batch scanning results:', error);
      return {
        success: false,
        message: 'Failed to submit batch scanning results',
        // error: error?.error?.detail || error?.message || 'Unknown error'
      };
    }
  }

  /**
   * Get scanning progress for a GRN
   */
  async getScanningProgress(grnRef: string): Promise<{ success: boolean; progress: any; error?: string }> {
    try {
      const response = await this.http.get<any>(
        `${this.baseUrl}/invoice/scanning-progress/${grnRef}/`
      ).toPromise();

      if (response && response.data) {
        return {
          success: true,
          progress: response.data
        };
      }

      throw new Error('No progress data received');
    } catch (error) {
      console.error('Error getting scanning progress:', error);
      return {
        success: false,
        progress: null,
        error: 'Failed to get scanning progress'
      };
    }
  }

  /**
   * Get warehouse locations
   */
  getWarehouseLocations(): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/warehouses/warehouse-wise-location/1/`);
  }

  /**
   * Place barcodes in warehouse location
   */
  async placeBarcodesInLocation(data: {
    barcodes: GS1BarcodeData[];
    location: string;
    grnRef?: string;
  }): Promise<{ success: boolean; message: string; error?: string }> {
    try {
      const response = await this.http.post<any>(
        `${this.baseUrl}/warehouses/place-barcodes/`,
        {
          barcodes: data.barcodes,
          location: data.location,
          grnRef: data.grnRef,
          timestamp: new Date().toISOString()
        }
      ).toPromise();

      if (response && response.success) {
        return {
          success: true,
          message: response.message || 'Barcodes placed successfully'
        };
      }

      throw new Error(response?.error || 'Failed to place barcodes');
    } catch (error) {
      console.error('Error placing barcodes:', error);
      return {
        success: false,
        message: 'Failed to place barcodes in location',
        error: (error as any)?.error?.detail || (error as any)?.message || 'Unknown error'
      };
    }
  }

  /**
   * Submit task scanning data
   */
  async submitTaskScanningData(data: {
    grnRef: string;
    tasks: any[];
  }): Promise<{ success: boolean; message: string; error?: string }> {
    try {
      const response = await this.http.post<any>(
        `${this.baseUrl}/tasks/submit-scanning-data/`,
        {
          grnRef: data.grnRef,
          tasks: data.tasks,
          timestamp: new Date().toISOString()
        }
      ).toPromise();
      console.log(response);
      console.log(data);
      console.log(response.message);
      console.log(response.error);
      if (response && response.success) {
        return {
          success: true,
          message: response.message || 'Task scanning data submitted successfully'
        };
      }

      throw new Error(response?.error || 'Failed to submit task scanning data');
    } catch (error) {
      console.error('Error submitting task scanning data:', error);
      return {
        success: false,
        message: 'Failed to submit task scanning data',
        error: (error as any)?.error?.detail || (error as any)?.message || 'Unknown error'
      };
    }
  }
}
