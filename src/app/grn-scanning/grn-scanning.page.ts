
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '../auth.service';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonHeader, IonToolbar, IonTitle, IonContent, IonSpinner, IonButtons, IonBackButton, IonButton, IonIcon, IonCard, IonCardContent, IonCardHeader, IonCardTitle } from '@ionic/angular/standalone';
import { ToastController } from '@ionic/angular/standalone';
import { Capacitor } from '@capacitor/core';
import { BarcodeScanner, BarcodeFormat } from '@capacitor-mlkit/barcode-scanning';
import { NgZone } from '@angular/core';

interface ScannedBox {
  barcode: string;
  itemName: string;
  quantity: number;
  batches: ScannedBatch[];
}

interface ScannedBatch {
  barcode: string;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  primaryUnit: string;
}

@Component({
  selector: 'app-grn-scanning',
  templateUrl: './grn-scanning.page.html',
  styleUrls: ['./grn-scanning.page.scss'],
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule, 
    IonHeader, 
    IonToolbar, 
    IonTitle, 
    IonContent, 
    IonSpinner, 
    IonButtons, 
    IonBackButton, 
    IonButton, 
    IonIcon, 
    IonCard, 
    IonCardContent, 
    IonCardHeader, 
    IonCardTitle
  ],
})
export class GrnScanningPage implements OnInit {
  grnId: number | null = null;
  grnData: any = null;
  loading: boolean = false;
  error: string = '';
  currentStep: 'box' | 'batch' = 'box';
  currentBoxIndex: number = 0;
  scannedBoxes: ScannedBox[] = [];
  currentBoxBarcode: string = '';
  currentBatchBarcode: string = '';
  isScanning = false;
  listType: number | null = null;
  requition_no: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private authService: AuthService,
    private http: HttpClient,
    private toastController: ToastController,
    private ngZone: NgZone
  ) {}

  ngOnInit() {
    // Get GRN ID from route
    const grnIdParam = this.route.snapshot.paramMap.get('grnId');
    this.grnId = grnIdParam ? Number(grnIdParam) : null;
    
    // Get navigation state
    const nav = window.history.state;
    this.listType = nav.listType ? Number(nav.listType) : null;
    this.requition_no = nav.requition_no || null;

    if (this.grnId) {
      this.loadGrnData();
    } else {
      this.error = 'Invalid GRN ID';
    }
  }

  async loadGrnData() {
    const user = this.authService.getCurrentUser();
    const token = this.authService.getToken();
    
    if (!user || !user.company || !user.company.length || !token) {
      this.error = 'Authentication required';
      return;
    }

    this.loading = true;
    const companyId = user.company[0].company;
    
    try {
      const response = await this.http.post<any>(
        'https://tatmeenapi.esarwa.com/invoice/putaway-tasks-list/s=/',
        { company: companyId, id: this.grnId }
      ).toPromise();
      
      this.grnData = response.data || response;
      this.initializeBoxes();
      this.loading = false;
    } catch (err: any) {
      this.error = err?.error?.detail || 'Failed to load GRN data';
      this.loading = false;
    }
  }

  initializeBoxes() {
    if (!this.grnData || !Array.isArray(this.grnData)) return;
    
    // Group items by their properties to create boxes
    const itemMap = new Map();
    
    this.grnData.forEach((item: any) => {
      const key = `${item.itemName}_${item.item_barcode}`;
      if (!itemMap.has(key)) {
        itemMap.set(key, {
          barcode: item.item_barcode,
          itemName: item.itemName,
          quantity: item.quantity,
          batches: []
        });
      }
    });
    
    this.scannedBoxes = Array.from(itemMap.values());
  }

  async scanBoxBarcode() {
    if (!Capacitor.isNativePlatform()) {
      // For development/testing - simulate scanning
      this.currentBoxBarcode = 'TEST_BOX_123';
      this.processBoxBarcode();
      return;
    }

    const hasPermission = await this.ensureCameraPermission();
    if (!hasPermission) {
      this.showToast('Camera permission is required for scanning.');
      return;
    }

    document.body.classList.add('barcode-scanner-active');
    this.isScanning = true;
    let listener: any = null;
    let timeoutId: any = null;

    try {
      listener = await BarcodeScanner.addListener('barcodeScanned', (result: any) => {
        this.ngZone.run(() => {
          // Handle multiple barcodes from single scan
          if (result.barcodes && result.barcodes.length > 0) {
            this.processMultipleBoxBarcodes(result.barcodes);
          } else if (result.barcode) {
            this.currentBoxBarcode = result.barcode.rawValue || '';
            this.processBoxBarcode();
          }
          this.isScanning = false;
          document.body.classList.remove('barcode-scanner-active');
          BarcodeScanner.stopScan();
          if (listener) listener.remove();
        });
      });

      await BarcodeScanner.startScan({
        formats: [
          BarcodeFormat.DataMatrix, // UAE Tameen portal uses GS1 Data Matrix
          BarcodeFormat.Code128, BarcodeFormat.Ean13, BarcodeFormat.Ean8,
          BarcodeFormat.UpcA, BarcodeFormat.UpcE, BarcodeFormat.QrCode,
          BarcodeFormat.Pdf417, BarcodeFormat.Aztec,
          BarcodeFormat.Codabar, BarcodeFormat.Code39, BarcodeFormat.Code93,
          BarcodeFormat.Itf
        ]
      });

      timeoutId = setTimeout(() => {
        if (this.isScanning) {
          this.isScanning = false;
          document.body.classList.remove('barcode-scanner-active');
          this.showToast('Scan timed out.');
          if (listener) listener.remove();
          BarcodeScanner.stopScan();
        }
      }, 15000);
    } catch (err) {
      this.isScanning = false;
      document.body.classList.remove('barcode-scanner-active');
      if (timeoutId) clearTimeout(timeoutId);
      if (listener) listener.remove();
      BarcodeScanner.stopScan();
      this.showToast('Scanning cancelled or failed.');
    }
  }

  processMultipleBoxBarcodes(barcodes: any[]) {
    const validBoxes: ScannedBox[] = [];
    const invalidBarcodes: string[] = [];
    
    barcodes.forEach(barcode => {
      const barcodeValue = barcode.rawValue || '';
      const matchedBox = this.scannedBoxes.find(box => box.barcode === barcodeValue);
      
      if (matchedBox) {
        validBoxes.push(matchedBox);
      } else {
        invalidBarcodes.push(barcodeValue);
      }
    });
    
    if (validBoxes.length > 0) {
      // Process the first valid box
      this.currentBoxIndex = this.scannedBoxes.indexOf(validBoxes[0]);
      this.currentStep = 'batch';
      this.showToast(`Box scanned: ${validBoxes[0].itemName}. Found ${validBoxes.length} valid box(es).`);
      
      // If multiple boxes found, add them to scanned boxes
      if (validBoxes.length > 1) {
        validBoxes.slice(1).forEach(box => {
          if (!this.scannedBoxes.find(existingBox => existingBox.barcode === box.barcode)) {
            this.scannedBoxes.push(box);
          }
        });
      }
    }
    
    if (invalidBarcodes.length > 0) {
      this.showToast(`Invalid barcodes: ${invalidBarcodes.join(', ')}`);
    }
  }

  processBoxBarcode() {
    const matchedBox = this.scannedBoxes.find(box => box.barcode === this.currentBoxBarcode);
    console.log(this.scannedBoxes,"scannedBoxes");
    console.log(matchedBox,"matchedBox");
    
    if (matchedBox) {
      this.currentBoxIndex = this.scannedBoxes.indexOf(matchedBox);
      this.currentStep = 'batch';
      this.showToast(`Box scanned: ${matchedBox.itemName}. Now scan ${matchedBox.quantity} batches.`);
    } else {
      this.showToast('Box barcode not found in this GRN.');
    }
  }

  async scanBatchBarcode() {
    if (!Capacitor.isNativePlatform()) {
      // For development/testing - simulate scanning
      this.currentBatchBarcode = 'TEST_BATCH_' + Date.now();
      this.processBatchBarcode();
      return;
    }

    const hasPermission = await this.ensureCameraPermission();
    if (!hasPermission) {
      this.showToast('Camera permission is required for scanning.');
      return;
    }

    document.body.classList.add('barcode-scanner-active');
    this.isScanning = true;
    let listener: any = null;
    let timeoutId: any = null;

    try {
      listener = await BarcodeScanner.addListener('barcodeScanned', (result: any) => {
        this.ngZone.run(() => {
          // Handle multiple batch barcodes from single scan
          if (result.barcodes && result.barcodes.length > 0) {
            this.processMultipleBatchBarcodes(result.barcodes);
          } else if (result.barcode) {
            this.currentBatchBarcode = result.barcode.rawValue || '';
            this.processBatchBarcode();
          }
          this.isScanning = false;
          document.body.classList.remove('barcode-scanner-active');
          BarcodeScanner.stopScan();
          if (listener) listener.remove();
        });
      });

      await BarcodeScanner.startScan({
        formats: [
          BarcodeFormat.DataMatrix, // UAE Tameen portal uses GS1 Data Matrix
          BarcodeFormat.Code128, BarcodeFormat.Ean13, BarcodeFormat.Ean8,
          BarcodeFormat.UpcA, BarcodeFormat.UpcE, BarcodeFormat.QrCode,
          BarcodeFormat.Pdf417, BarcodeFormat.Aztec,
          BarcodeFormat.Codabar, BarcodeFormat.Code39, BarcodeFormat.Code93,
          BarcodeFormat.Itf
        ]
      });

      timeoutId = setTimeout(() => {
        if (this.isScanning) {
          this.isScanning = false;
          document.body.classList.remove('barcode-scanner-active');
          this.showToast('Scan timed out.');
          if (listener) listener.remove();
          BarcodeScanner.stopScan();
        }
      }, 15000);
    } catch (err) {
      this.isScanning = false;
      document.body.classList.remove('barcode-scanner-active');
      if (timeoutId) clearTimeout(timeoutId);
      if (listener) listener.remove();
      BarcodeScanner.stopScan();
      this.showToast('Scanning cancelled or failed.');
    }
  }

  processMultipleBatchBarcodes(barcodes: any[]) {
    const currentBox = this.getCurrentBox();
    if (!currentBox) return;

    const remainingBatches = currentBox.quantity - currentBox.batches.length;
    const batchesToProcess = barcodes.slice(0, remainingBatches);

    batchesToProcess.forEach(async (barcode) => {
      await this.processSingleBatchBarcode(barcode.rawValue || '');
    });

    if (barcodes.length > remainingBatches) {
      this.showToast(`Processed ${remainingBatches} batches. ${barcodes.length - remainingBatches} extra barcodes ignored.`);
    }
  }

  async processBatchBarcode() {
    await this.processSingleBatchBarcode(this.currentBatchBarcode);
  }

  async processSingleBatchBarcode(barcodeValue: string) {
    try {
      // Parse GS1 Data Matrix for UAE Tameen portal
      const parsedData = this.parseGS1DataMatrix(barcodeValue);
      
      // Call API to get batch information
      const response = await this.http.post<any>(
        'https://tatmeenapi.esarwa.com/barcode/scan/',
        { barcode: barcodeValue }
      ).toPromise();

      if (response && response.data) {
        const batchData = response.data;
        const newBatch: ScannedBatch = {
          barcode: barcodeValue,
          batchNumber: parsedData.batchNumber || batchData.batch_number || 'N/A',
          expiryDate: parsedData.expiryDate || batchData.expiry_date || 'N/A',
          quantity: parsedData.quantity || batchData.quantity || 1,
          primaryUnit: parsedData.primaryUnit || batchData.primary_unit || 'Box'
        };

        this.scannedBoxes[this.currentBoxIndex].batches.push(newBatch);
        this.showToast(`Batch scanned: ${newBatch.batchNumber}`);
        
        // Check if all batches are scanned for current box
        if (this.scannedBoxes[this.currentBoxIndex].batches.length >= this.scannedBoxes[this.currentBoxIndex].quantity) {
          this.showToast('All batches scanned for this box!');
          this.moveToNextBox();
        }
      } else {
        this.showToast('Invalid batch barcode or no data found.');
      }
    } catch (err: any) {
      this.showToast('Failed to process batch barcode: ' + (err?.error?.detail || 'Unknown error'));
    }
  }

  parseGS1DataMatrix(barcodeValue: string): any {
    // Parse UAE Tameen portal GS1 Data Matrix format
    // Format: (01)GTIN(17)EXPIRY(10)BATCH(21)SERIAL
    const result: any = {};
    
    // Extract GTIN (01)
    const gtinMatch = barcodeValue.match(/\(01\)(\d{14})/);
    if (gtinMatch) {
      result.gtin = gtinMatch[1];
    }
    
    // Extract Expiry Date (17) - Format: YYMMDD
    const expiryMatch = barcodeValue.match(/\(17\)(\d{6})/);
    if (expiryMatch) {
      const expiry = expiryMatch[1];
      const year = '20' + expiry.substring(0, 2);
      const month = expiry.substring(2, 4);
      const day = expiry.substring(4, 6);
      result.expiryDate = `${day}/${month}/${year}`;
    }
    
    // Extract Batch Number (10)
    const batchMatch = barcodeValue.match(/\(10\)([^(]+)/);
    if (batchMatch) {
      result.batchNumber = batchMatch[1];
    }
    
    // Extract Serial Number (21)
    const serialMatch = barcodeValue.match(/\(21\)([^(]+)/);
    if (serialMatch) {
      result.serialNumber = serialMatch[1];
    }
    
    // Set default values
    result.quantity = 1;
    result.primaryUnit = 'Box';
    
    return result;
  }

  moveToNextBox() {
    const nextBoxIndex = this.currentBoxIndex + 1;
    if (nextBoxIndex < this.scannedBoxes.length) {
      this.currentBoxIndex = nextBoxIndex;
      this.currentStep = 'box';
      this.showToast(`Move to next box: ${this.scannedBoxes[nextBoxIndex].itemName}`);
    } else {
      this.showToast('All boxes and batches have been scanned!');
      this.currentStep = 'box';
    }
  }

  goBackToBoxScanning() {
    this.currentStep = 'box';
    this.currentBoxIndex = 0;
  }

  async ensureCameraPermission(): Promise<boolean> {
    const status = await BarcodeScanner.checkPermissions();
    if (status.camera !== 'granted') {
      const request = await BarcodeScanner.requestPermissions();
      return request.camera === 'granted';
    }
    return true;
  }

  async showToast(message: string, color: string = 'warning') {
    const toast = await this.toastController.create({
      message,
      duration: 2000,
      color,
      position: 'top'
    });
    toast.present();
  }

  getCurrentBox() {
    return this.scannedBoxes[this.currentBoxIndex];
  }

  getScannedBatchesCount() {
    return this.scannedBoxes[this.currentBoxIndex]?.batches.length || 0;
  }

  getTotalBatchesScanned() {
    return this.scannedBoxes.reduce((total, box) => total + box.batches.length, 0);
  }

  getTotalBatchesExpected() {
    return this.scannedBoxes.reduce((total, box) => total + box.quantity, 0);
  }
}
