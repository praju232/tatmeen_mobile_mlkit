import { Component, OnInit, OnDestroy, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BarcodeScannerService, ScannedBarcode } from '../../services/barcode-scanner.service';
import { ModalController, LoadingController, ToastController, AlertController } from '@ionic/angular/standalone';
import { Api, GS1BarcodeData, ImageCaptureResult } from '../../services/api';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonButton, IonIcon, IonSpinner } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { trash, checkmarkCircle, alertCircle, scanOutline, cube, barcodeOutline } from 'ionicons/icons';

addIcons({ 
  trash,
  checkmarkCircle,
  alertCircle,
  scanOutline,
  cube,
  barcodeOutline
});

@Component({
  selector: 'app-camera-scanner',
  templateUrl: './camera-scanner.component.html',
  styleUrls: ['./camera-scanner.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonHeader, 
    IonToolbar, 
    IonTitle, 
    IonContent, 
    IonButtons, 
    IonButton, 
    IonIcon, 
    IonSpinner
  ],
  providers: [
    ModalController,
    LoadingController,
    ToastController
  ]
})
export class CameraScannerComponent implements OnInit, OnDestroy {
  @Output() barcodeScanned = new EventEmitter<ScannedBarcode>();
  @Output() scanCancelled = new EventEmitter<void>();
  @Output() gs1BarcodesDecoded = new EventEmitter<GS1BarcodeData[]>();
  @Output() barcodesPlaced = new EventEmitter<{barcodes: GS1BarcodeData[], location: string}>();

  isScanning = false;
  hasPermission = false;
  errorMessage = '';
  scanCount = 0;
  isContinuousMode = true;
  isImageCaptureMode = true;
  capturedImages: ImageCaptureResult[] = [];
  decodedBarcodes: any[] = [];
  isProcessing = false;
  scanningMode: string = 'batch'; // 'box' or 'batch'
  
  // Live scanning properties
  videoElement: HTMLVideoElement | null = null;
  canvasElement: HTMLCanvasElement | null = null;
  canvasContext: CanvasRenderingContext2D | null = null;
  isLiveScanning = false;
  scanInterval: any = null;
  
  // Live QR detection results
  liveQrResults: Array<{
    barcode: string;
    success: boolean;
    position: { x: number; y: number; width: number; height: number };
    data?: any;
    timestamp: number;
    isDuplicate?: boolean;
    isMisplaced?: boolean;
  }> = [];
  
  // Track scanned barcodes to prevent duplicates
  scannedBarcodesSet = new Set<string>();
  
  // UI state
  showFullResults = false;
  lastDuplicateToastTime = 0;
  duplicateToastCooldown = 3000; // 3 seconds between duplicate toasts
  
  // Danger light properties
  showDangerLight = false;
  dangerLightBlink = false;
  dangerBlinkInterval: any = null;
  
  // Validation properties
  validationErrors: any=[];
  expectedItems: any[] = [];
  isValidationEnabled = false;
  listType: number | null = null;
  requition_no: string | null = null;
  
  // Mismatch summary properties
  mismatchData: any = null;
  totalBatches: number = 0;
  totalBatchesMissing: number = 0;
  missingBatches: any[] = [];
  mismatchSummaryText: string = '';
  
  // Warehouse location properties
  selectedLocation: string = '';
  availableLocations: any[] = [];
  showLocationSelector = false;
  isPlacingBarcodes = false;
  
  // GRN context
  grnId: number | null = null;
  grnRef: string = '';
  
  // Task context
  taskId: number | null = null;
  boxBarcode: string = '';
  taskData: any = null;
  boxProductName: string = '';
  boxGTIN: string = '';
  
  // Box scanning state
  isBoxScanned = false;
  boxScanningComplete = false;
  

  constructor(
    private barcodeScannerService: BarcodeScannerService,
    private modalController: ModalController,
    private api: Api,
    private loadingController: LoadingController,
    private toastController: ToastController,
    private alertController: AlertController,
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    // Get GRN context from route
    this.grnId = this.route.snapshot.paramMap.get('grnId') ? 
      Number(this.route.snapshot.paramMap.get('grnId')) : null;
    // console.log('Camera scanner grnId from route:', this.grnId);
    // console.log('Route params:', this.route.snapshot.paramMap);
    // console.log(this.capturedImages,"capturedImages");
    // Get GRN reference and task context from route state
    const state = this.router.getCurrentNavigation()?.extras?.state;
    if (state) {
      this.grnRef = state['grnRef'] || '';
      this.taskId = state['taskId'] || null;
      this.boxBarcode = state['boxBarcode'] || '';
      this.boxProductName = state['boxProductName'] || '';
      this.boxGTIN = state['boxGTIN'] || '';
      this.taskData = state['taskData'] || null;
      this.scanningMode = state['scanningMode'] || '';
      this.listType = state['listType'] || null;
      this.requition_no = state['requition_no'] || null;
      
      // Get grnId from state if not available from route
      if (!this.grnId && state['grnId']) {
        this.grnId = state['grnId'];
      }
      
      // console.log('Camera scanner grnId after state check:', this.grnId);
      
      // If grnId is still not available, show error
      if (!this.grnId) {
        console.error('No grnId available in route or state');
        // You might want to show an error message or redirect
      }
      
      // Load expected items for validation
      if (state['taskData']) {
        this.loadExpectedItems(state['taskData']);
      }
      
      // Clear images for new box scan (first time scanning batches)
      this.capturedImages = [];
      this.decodedBarcodes = [];
      
      // Also clear images in API service
      this.api.clearCapturedImages();
      
      // Set captured images from state if provided
      // if (state['capturedImages']) {
      //   this.capturedImages = state['capturedImages'];
      // }
      
      // Check if we're returning for batch scanning
      if (state['proceedToBatchScanning'] && state['boxData']) {
        this.handleBatchScanningReturn(state['boxData']);
      }
      
      // Check if we're starting a new box
      if (state['startNewBox']) {
        this.handleNewBoxStart();
      }
    }
    
    // Always start in image capture mode
    this.isImageCaptureMode = true;
    
    // Force clear all images on component initialization
    this.forceClearAllImages();
    
    this.subscribeToCapturedImages();
    this.loadWarehouseLocations();
    // console.log(this.scanningMode,"scanningMode");
    // Auto-start scanning for location modes
    if (this.scanningMode === 'location' || this.scanningMode === 'location_single') {
      this.startLocationScanning();
    }
  }

  /**
   * Handle return to camera scanner for batch scanning
   */
  private handleBatchScanningReturn(boxData: any) {
    // Set box data
    this.boxBarcode = boxData.boxBarcode;
    this.boxProductName = boxData.boxProductName;
    this.boxGTIN = boxData.boxGTIN;
    this.isBoxScanned = true;
    this.boxScanningComplete = true;
    
    // Switch to batch scanning mode
    this.scanningMode = 'batch';
    
    // Clear any previous batch results
    this.decodedBarcodes = [];
    this.scannedBarcodesSet.clear();
    
    // console.log('Returned to batch scanning with box data:', boxData);
  }

  /**
   * Handle starting a new box
   */
  private handleNewBoxStart() {
    // Reset all scanning state
    this.isBoxScanned = false;
    this.boxScanningComplete = false;
    this.boxBarcode = '';
    this.boxProductName = '';
    this.boxGTIN = '';
    
    // Switch to box scanning mode
    this.scanningMode = 'box';
    
    // Clear any previous results
    this.decodedBarcodes = [];
    this.scannedBarcodesSet.clear();
    this.capturedImages = [];
    
    // console.log('Starting new box scanning');
  }

  /**
   * Start location scanning automatically
   */
  private async startLocationScanning() {
    try {
      // console.log('Auto-starting location scanning...');
      
      // Switch to live scanning mode for location scanning
      this.isImageCaptureMode = false;
      
      // Start live scanning for location barcode
      await this.startLiveScanning();
      
      await this.showToast('Location scanner ready! Point camera at location barcode', 'info');
      
    } catch (error) {
      // console.error('Error starting location scanning:', error);
      await this.showToast('Failed to start location scanner', 'danger');
    }
  }

  ngOnDestroy() {
    this.stopScanning();
    this.stopLiveScanning();
  }

  /**
   * Subscribe to captured images from API service
   */
  private subscribeToCapturedImages() {
    this.api.capturedImages$.subscribe((images: ImageCaptureResult[]) => {
      this.capturedImages = images;
    });
  }

  async startContinuousScanning() {
    try {
      this.isScanning = true;
      this.errorMessage = '';
      this.scanCount = 0;

      // Check for camera permission
      const cameras = await this.barcodeScannerService.getAvailableCameras();
      if (cameras.length === 0) {
        throw new Error('No camera devices found');
      }

      this.hasPermission = true;

      // Start continuous scanning
      const success = await this.barcodeScannerService.startContinuousScanning();
      if (!success) {
        throw new Error('Failed to start continuous scanning');
      }

      // Subscribe to scanned barcodes
      this.barcodeScannerService.scannedBarcodes$.subscribe(barcodes => {
        this.scanCount = barcodes.length;
        if (barcodes.length > 0) {
          // Emit the latest scanned barcode
          const latestBarcode = barcodes[0];
          this.barcodeScanned.emit(latestBarcode);
        }
      });

    } catch (error) {
      // console.error('Camera scanning error:', error);
      this.errorMessage = 'Camera access denied or not available';
      this.hasPermission = false;
    }
  }

  stopScanning() {
    this.barcodeScannerService.stopContinuousScanning();
    this.isScanning = false;
  }

  /**
   * Go back to previous page
   */
  goBack() {
    this.stopScanning();
    this.router.navigate(['/grn', this.grnId ], {
      state: {
        listType: this.listType,
        requition_no: this.requition_no
      }
    });
  }

  cancelScanning() {
    this.stopScanning();
    this.scanCancelled.emit();
    this.modalController.dismiss();
  }

  retryScanning() {
    this.startContinuousScanning();
  }

  finishScanning() {
    this.stopScanning();
    
    // If we're in task context, return task data
    if (this.taskId && this.boxBarcode) {
      this.modalController.dismiss({
        taskId: this.taskId,
        boxBarcode: this.boxBarcode,
        scannedBarcodes: this.decodedBarcodes,
        success: true
      });
    } else {
      // Regular scanning mode
      this.modalController.dismiss({ 
        finished: true, 
        count: this.scanCount,
        barcodes: this.decodedBarcodes 
      });
    }
  }

  viewResults() {
    this.modalController.dismiss({ viewResults: true });
  }

  /**
   * Toggle between live scanning and image capture mode
   */
  toggleImageCaptureMode() {
    this.capturedImages=[];
    this.isImageCaptureMode = !this.isImageCaptureMode;
    
    if (this.isImageCaptureMode) {
      this.stopScanning();
    } else {
      this.startContinuousScanning();
    }
  }

  /**
   * Start single box scanning (for box mode)
   */
  async startSingleBoxScan() {
    try {
      this.isProcessing = true;
      // console.log('Starting single box scan...');
      
      // Clear previous results
      this.decodedBarcodes = [];
      this.scannedBarcodesSet.clear();
      this.showDangerLight = false;
      
      // Check if we're in a secure context (required for camera access)
      if (!window.isSecureContext && location.protocol !== 'https:') {
        throw new Error('Camera access requires HTTPS. Please use HTTPS or localhost.');
      }
      
      // Set live scanning mode for single scan
      this.isLiveScanning = true;
      
      // Trigger change detection to ensure DOM updates
      this.cdr.detectChanges();
      
      // Wait for DOM to update
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Initialize video stream
      // console.log('Initializing video stream for box scan...');
      await this.initializeVideoStream();
      
      // Start single QR detection (will stop after first successful scan)
      // console.log('Starting single QR detection for box...');
      this.startSingleQRDetection();
      
      await this.showToast('Box scanning started! Point camera at box barcode', 'success');
      // console.log('Single box scanning started successfully');
      
    } catch (error) {
      // console.error('Error starting single box scan:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      await this.showToast(`Failed to start box scanning: ${errorMessage}`, 'danger');
      
      // Clean up on error
      this.isLiveScanning = false;
      this.isProcessing = false;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Start live multi-QR scanning
   */
  async startLiveScanning() {
    try {
      this.isProcessing = true;
      // console.log('Starting live scanning...');
      
      // Clear previous results
      this.liveQrResults = [];
        this.decodedBarcodes = [];
      this.scannedBarcodesSet.clear(); // Clear previous scan history
      this.showDangerLight = false;
      
      // Check if we're in a secure context (required for camera access)
      if (!window.isSecureContext && location.protocol !== 'https:') {
        throw new Error('Camera access requires HTTPS. Please use HTTPS or localhost.');
      }
      
      // Check if we're on a mobile device
      const isMobile = this.isMobileDevice();
      // console.log('Mobile device detected:', isMobile);
      
      // Set live scanning mode first to render the video element
      this.isLiveScanning = true;
      
      // Trigger change detection to ensure DOM updates
      this.cdr.detectChanges();
      
      // Wait for DOM to update
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Debug: Check if video element exists
      this.debugVideoElement();
      
      // Initialize video stream
      // console.log('Initializing video stream...');
      await this.initializeVideoStream();
      
      // Start continuous scanning
      // console.log('Starting continuous QR detection...');
      this.startContinuousQRDetection();
      
      await this.showToast('Live scanning started!', 'success');
      // console.log('Live scanning started successfully');
      
    } catch (error) {
      // console.error('Error starting live scanning:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      await this.showToast(`Failed to start live scanning: ${errorMessage}`, 'danger');
      
      // Clean up on error
      this.isLiveScanning = false;
      this.isProcessing = false;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Check if device is mobile
   */
  private isMobileDevice(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }

  /**
   * Debug method to check video element availability
   */
  private debugVideoElement() {
    // console.log('=== DEBUG: Video Element Check ===');
    // console.log('isLiveScanning:', this.isLiveScanning);
    // console.log('DOM elements with id "liveVideo":', document.querySelectorAll('#liveVideo'));
    // console.log('Video element by getElementById:', document.getElementById('liveVideo'));
    // console.log('All video elements:', document.querySelectorAll('video'));
    // console.log('=== END DEBUG ===');
  }

  /**
   * Stop live scanning
   */
  stopLiveScanning() {
    this.isLiveScanning = false;
    
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    
    if (this.dangerBlinkInterval) {
      clearInterval(this.dangerBlinkInterval);
      this.dangerBlinkInterval = null;
    }
    
    this.showDangerLight = false;
    this.dangerLightBlink = false;
    
    // Stop video stream
    if (this.videoElement && this.videoElement.srcObject) {
      const stream = this.videoElement.srcObject as MediaStream;
      stream.getTracks().forEach(track => track?.stop());
      this.videoElement.srcObject = null;
    }
  }

  /**
   * Initialize video stream from camera
   */
  async initializeVideoStream() {
    try {
      // Check if getUserMedia is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera not supported on this device');
      }

      const constraints = {
        video: {
          facingMode: 'environment', // Use back camera
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 60 }
        }
      };

      // console.log('Requesting camera access...');
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      // console.log('Camera access granted, setting up video element...');
      
      // Wait for DOM to be ready and retry if needed
      let retries = 0;
      const maxRetries = 10;
      
      while (retries < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Get video element
        this.videoElement = document.getElementById('liveVideo') as HTMLVideoElement;
        if (this.videoElement) {
          // console.log('Video element found on attempt', retries + 1);
          break;
        }
        
        retries++;
        // console.log(`Video element not found, retry ${retries}/${maxRetries}`);
      }
      
      if (!this.videoElement) {
        throw new Error('Video element not found after multiple attempts. Make sure the live scanning mode is active.');
      }
      
      // console.log('Video element found, setting up stream...');
      this.videoElement.srcObject = stream;
      
      // Wait for video to be ready
      await new Promise((resolve, reject) => {
        this.videoElement!.onloadedmetadata = () => {
          // console.log('Video metadata loaded, starting playback...');
          this.videoElement!.play()
            .then(() => {
              // console.log('Video playback started');
              resolve(true);
            })
            .catch(reject);
        };
        
        this.videoElement!.onerror = (error) => {
          // console.error('Video error:', error);
          reject(error);
        };
        
        // Timeout after 10 seconds
        setTimeout(() => {
          reject(new Error('Video loading timeout'));
        }, 10000);
      });
      
      // Initialize canvas for overlays
      this.initializeCanvas();
      
    } catch (error) {
      // console.error('Error accessing camera:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new Error(`Camera access failed: ${errorMessage}`);
    }
  }

  /**
   * Initialize canvas for drawing overlays
   */
  initializeCanvas() {
    this.canvasElement = document.getElementById('overlayCanvas') as HTMLCanvasElement;
    if (this.canvasElement && this.videoElement) {
      this.canvasContext = this.canvasElement.getContext('2d');
      
      // Wait for video dimensions to be available
      const setupCanvas = () => {
        if (this.videoElement && this.canvasElement) {
          const videoWidth = this.videoElement.videoWidth || this.videoElement.clientWidth || 1280;
          const videoHeight = this.videoElement.videoHeight || this.videoElement.clientHeight || 720;
          
          // console.log('Setting canvas size:', videoWidth, 'x', videoHeight);
          
          // Set canvas size to match video
          this.canvasElement.width = videoWidth;
          this.canvasElement.height = videoHeight;
          
          // Set canvas display size to match video display size
          this.canvasElement.style.width = this.videoElement.clientWidth + 'px';
          this.canvasElement.style.height = this.videoElement.clientHeight + 'px';
        }
      };
      
      // Try immediately
      setupCanvas();
      
      // Also try after a short delay in case video dimensions aren't ready yet
      setTimeout(setupCanvas, 500);
    }
  }

  /**
   * Start single QR detection for box scanning (stops after first successful scan)
   */
  startSingleQRDetection() {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
    }
    
    // Scan every 500ms for performance
    this.scanInterval = setInterval(() => {
      if (this.isLiveScanning && this.videoElement && this.canvasContext && !this.isBoxScanned) {
        this.detectSingleQRFromVideo();
      }
    }, 500);
  }

  /**
   * Start continuous QR detection from video stream
   */
  startContinuousQRDetection() {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
    }
    
    // Scan every 500ms for performance
    this.scanInterval = setInterval(() => {
      if (this.isLiveScanning && this.videoElement && this.canvasContext) {
        this.detectQRCodesFromVideo();
      }
    }, 500);
  }

  /**
   * Detect single QR code from video for box scanning
   */
  async detectSingleQRFromVideo() {
    if (!this.videoElement || !this.canvasContext || !this.canvasElement || this.isBoxScanned) {
      return;
    }

    try {
      // Create a temporary canvas to capture current video frame
      const tempCanvas = document.createElement('canvas');
      const tempContext = tempCanvas.getContext('2d');
      
      if (!tempContext) return;
      
      tempCanvas.width = this.videoElement.videoWidth;
      tempCanvas.height = this.videoElement.videoHeight;
      
      // Draw current video frame to temp canvas
      tempContext.drawImage(this.videoElement, 0, 0);
      
      // Convert to blob for API processing
      const blob = await new Promise<Blob>((resolve) => {
        tempCanvas.toBlob((blob) => {
          resolve(blob!);
        }, 'image/jpeg', 0.8);
      });
      
      // Convert blob to base64 for API
      const base64 = await this.blobToBase64(blob);
      
      // Validate base64 data
      if (!base64 || !base64.startsWith('data:image/')) {
        throw new Error('Invalid base64 image data');
      }
      
      // Process with existing API
      const response = await this.api.decodeBarcodesFromImages([{
        imageDataUrl: base64,
        imageData: this.base64ToUint8Array(base64),
        imageFormat: 'jpeg',
        timestamp: new Date()
      }]);
      
      // Simulate validation errors after scanning QR codes
      if (response && response.data && response.data.length > 0) {
        await this.simulateValidationErrors();
      }
      
      if (response && response.data && response.data.length > 0) {
        // Process the first barcode found
        const boxBarcode = response.data[0];
        const parsedBox = this.parseGS1DataMatrix(boxBarcode, true);
        
        // Store box information
        this.boxBarcode = typeof boxBarcode === 'string' ? boxBarcode : String(boxBarcode);
        this.boxProductName = parsedBox.productName || '';
        this.boxGTIN = parsedBox.gtin || '';
        this.isBoxScanned = true;
        
        // Stop scanning and process the box
        this.stopLiveScanning();
        await this.processBoxBarcode(parsedBox);
      }
      
    } catch (error) {
      // console.error('Error detecting single QR from video:', error);
    }
  }

  /**
   * Detect QR codes from current video frame with real coordinates
   */
  async detectQRCodesFromVideo() {
    if (!this.videoElement || !this.canvasContext || !this.canvasElement) {
      return;
    }

    try {
      // Create a temporary canvas to capture current video frame
      const tempCanvas = document.createElement('canvas');
      const tempContext = tempCanvas.getContext('2d');
      
      if (!tempContext) return;
      
      tempCanvas.width = this.videoElement.videoWidth;
      tempCanvas.height = this.videoElement.videoHeight;
      
      // Draw current video frame to temp canvas
      tempContext.drawImage(this.videoElement, 0, 0);
      
      // Convert to blob for API processing
      const blob = await new Promise<Blob>((resolve) => {
        tempCanvas.toBlob((blob) => {
          resolve(blob!);
        }, 'image/jpeg', 0.8);
      });
      
      // Convert blob to base64 for API
      const base64 = await this.blobToBase64(blob);
      
      // Validate base64 data
      if (!base64 || !base64.startsWith('data:image/')) {
        throw new Error('Invalid base64 image data');
      }
      
      // Process with existing API
      const response = await this.api.decodeBarcodesFromImages([{
        imageDataUrl: base64,
        imageData: this.base64ToUint8Array(base64),
        imageFormat: 'jpeg',
        timestamp: new Date()
      }]);
      
      // Simulate validation errors after scanning QR codes
      if (response && response.data && response.data.length > 0) {
        await this.simulateValidationErrors();
      }
      
      if (response && response.data) {
        // For location scanning, process immediately and return
        if (this.scanningMode === 'location' || this.scanningMode === 'location_single') {
          await this.handleLocationBarcodeResult(response.data[0]);
          return;
        }
        
        // Process with real coordinates from browser BarcodeDetector API
        await this.processLiveQRResultsWithRealCoordinates(response.data, tempCanvas);
      }
      
    } catch (error) {
      // console.error('Error detecting QR codes from video:', error);
    }
  }

  /**
   * Process live QR detection results with real coordinates from browser BarcodeDetector API
   */
  async processLiveQRResultsWithRealCoordinates(barcodes: any[], canvas: HTMLCanvasElement) {
    const currentTime = Date.now();
    const newResults: typeof this.liveQrResults = [];
    let duplicateCount = 0;
    
    // Try to get real coordinates using browser BarcodeDetector API
    let realBarcodeDetections: any[] = [];
    
    try {
      // Check if BarcodeDetector API is available
      if (this.isBarcodeDetectorSupported()) {
        const supportedFormats = await this.getSupportedFormats();
        const barcodeDetector = new BarcodeDetector({
          formats: supportedFormats
        });
        
        // Detect barcodes with real coordinates
        realBarcodeDetections = await barcodeDetector.detect(canvas);
        // console.log('Real barcode detections:', realBarcodeDetections);
      }
    } catch (error) {
      // console.warn('BarcodeDetector API not available or failed:', error);
    }
    
    // Process each detected barcode
    barcodes.forEach((barcode, index) => {
      const barcodeString = typeof barcode === 'string' ? barcode : String(barcode);
      
      // Check if this barcode is a duplicate
      const isDuplicate = this.scannedBarcodesSet.has(barcodeString);
      
      if (isDuplicate) {
        duplicateCount++;
        // console.log('Duplicate barcode detected:', barcodeString);
        
        // Use existing position if available, otherwise try to find real coordinates
        const existingResult = this.liveQrResults.find(r => r.barcode === barcodeString);
        let position = existingResult?.position;
        
        if (!position && realBarcodeDetections.length > 0) {
          // Try to find matching real detection
          const matchingDetection = this.findMatchingDetection(realBarcodeDetections, barcodeString);
          
          if (matchingDetection && matchingDetection.boundingBox) {
            position = {
              x: matchingDetection.boundingBox.x,
              y: matchingDetection.boundingBox.y,
              width: matchingDetection.boundingBox.width,
              height: matchingDetection.boundingBox.height
            };
          }
        }
        
        // Fallback to grid position if no real coordinates found
        if (!position) {
          const canvasWidth = canvas.width;
          const canvasHeight = canvas.height;
          const barcodeCount = barcodes.length;
          const gridCols = Math.ceil(Math.sqrt(barcodeCount));
          const cellWidth = canvasWidth / gridCols;
          const cellHeight = canvasHeight / Math.ceil(barcodeCount / gridCols);
          position = this.calculateGridPosition(index, gridCols, cellWidth, cellHeight, canvasWidth, canvasHeight);
        }
        
        // Add to results but mark as duplicate
        newResults.push({
          barcode: barcodeString,
          success: true,
          position: position,
          data: null,
          timestamp: currentTime,
          isDuplicate: true
        });
        
        // Show duplicate notification only if enough time has passed
        const now = Date.now();
        if (now - this.lastDuplicateToastTime > this.duplicateToastCooldown) {
          // this.showDuplicateNotification(barcodeString);
          this.lastDuplicateToastTime = now;
        }
        return; // Skip processing for duplicates
      }
      
      // Process new barcode
      let success = false;
      let parsedData = null;
      let isMisplaced = false;
      
      try {
        // Try to parse the barcode
        parsedData = this.parseGS1DataMatrix(barcode, false);
        success = true;
        
        // Add to scanned set to prevent future duplicates
        this.scannedBarcodesSet.add(barcodeString);
        
        // console.log('New barcode added:', barcodeString);
        
      } catch (error) {
        // console.error('Failed to parse barcode:', barcode, error);
        success = false;
      }
      
      // Only add to decoded barcodes list if successful and not duplicate
      if (success && parsedData) {
        // Store original barcode for removal purposes
        parsedData.originalBarcode = barcodeString;
        this.decodedBarcodes.push(parsedData);
        
        // Check if this barcode is misplaced (has validation error)
        isMisplaced = this.hasBarcodeValidationError(parsedData);
      }
      
      // Try to get real coordinates from BarcodeDetector API
      let position = null;
      
      if (realBarcodeDetections.length > 0) {
        // Find matching real detection
        const matchingDetection = this.findMatchingDetection(realBarcodeDetections, barcodeString);
        
        if (matchingDetection && matchingDetection.boundingBox) {
          position = {
            x: matchingDetection.boundingBox.x,
            y: matchingDetection.boundingBox.y,
            width: matchingDetection.boundingBox.width,
            height: matchingDetection.boundingBox.height
          };
          // console.log('Using real coordinates for barcode:', barcodeString, position);
        }
      }
      
      // Fallback to grid position if no real coordinates found
      if (!position) {
        const canvasWidth = canvas.width;
        const canvasHeight = canvas.height;
        const barcodeCount = barcodes.length;
        const gridCols = Math.ceil(Math.sqrt(barcodeCount));
        const cellWidth = canvasWidth / gridCols;
        const cellHeight = canvasHeight / Math.ceil(barcodeCount / gridCols);
        position = this.calculateGridPosition(index, gridCols, cellWidth, cellHeight, canvasWidth, canvasHeight);
        // console.log('Using grid position for barcode:', barcodeString, position);
      }
      
      newResults.push({
        barcode: barcodeString,
        success: success,
        position: position,
        data: parsedData,
        timestamp: currentTime,
        isDuplicate: false,
        isMisplaced: isMisplaced
      });
    });
    
    // Update results (keep only recent ones, within last 3 seconds)
    this.liveQrResults = newResults.filter(result => 
      currentTime - result.timestamp < 3000
    );
    
    // Update misplaced status for existing results based on validation errors
    this.liveQrResults.forEach(result => {
      if (result.data) {
        result.isMisplaced = this.hasBarcodeValidationError(result.data);
      }
    });
    
    // Check for failed scans and show danger light
    const failedScans = newResults.filter(result => !result.success && !result.isDuplicate);
    if (failedScans.length > 0) {
      this.showDangerLight = true;
      this.startDangerLightBlink();
    } else {
      this.showDangerLight = false;
      this.stopDangerLightBlink();
    }
    
    // Draw overlays on canvas
    this.drawLiveOverlays();
    
    // Emit results
    this.gs1BarcodesDecoded.emit(this.decodedBarcodes);
  }

  /**
   * Check if BarcodeDetector API is supported
   */
  private isBarcodeDetectorSupported(): boolean {
    return 'BarcodeDetector' in window;
  }

  /**
   * Get supported barcode formats
   */
  private async getSupportedFormats(): Promise<string[]> {
    if (this.isBarcodeDetectorSupported()) {
      try {
        return await BarcodeDetector.getSupportedFormats();
      } catch (error) {
        // console.warn('Failed to get supported formats:', error);
      }
    }
    return ['qr_code', 'data_matrix', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e'];
  }

  /**
   * Find matching barcode detection by comparing values
   */
  private findMatchingDetection(detections: DetectedBarcode[], barcodeString: string): DetectedBarcode | null {
    return detections.find(detection => {
      const detectionValue = detection.rawValue;
      // Try exact match first
      if (detectionValue === barcodeString) {
        return true;
      }
      // Try partial matches (in case of encoding differences)
      if (detectionValue.includes(barcodeString) || barcodeString.includes(detectionValue)) {
        return true;
      }
      // Try removing common prefixes/suffixes
      const cleanDetection = detectionValue.replace(/[^a-zA-Z0-9]/g, '');
      const cleanBarcode = barcodeString.replace(/[^a-zA-Z0-9]/g, '');
      return cleanDetection === cleanBarcode || 
             cleanDetection.includes(cleanBarcode) || 
             cleanBarcode.includes(cleanDetection);
    }) || null;
  }

  /**
   * Calculate grid position for barcode placement
   */
  private calculateGridPosition(index: number, gridCols: number, cellWidth: number, cellHeight: number, canvasWidth: number, canvasHeight: number) {
    const row = Math.floor(index / gridCols);
    const col = index % gridCols;
    
    // Add some randomness within the cell for more natural placement
    const randomOffsetX = (Math.random() - 0.5) * cellWidth * 0.3;
    const randomOffsetY = (Math.random() - 0.5) * cellHeight * 0.3;
    
    const x = Math.max(0, Math.min(canvasWidth - 80, col * cellWidth + cellWidth * 0.1 + randomOffsetX));
    const y = Math.max(0, Math.min(canvasHeight - 80, row * cellHeight + cellHeight * 0.1 + randomOffsetY));
    
    return {
      x: x,
      y: y,
      width: 80,
      height: 80
    };
  }

  /**
   * Process live QR detection results (original method with random coordinates)
   */
  processLiveQRResults(barcodes: any[]) {
    const currentTime = Date.now();
    const newResults: typeof this.liveQrResults = [];
    let duplicateCount = 0;
    
    // Process each detected barcode
    barcodes.forEach((barcode, index) => {
      const barcodeString = typeof barcode === 'string' ? barcode : String(barcode);
      
      // Check if this barcode is a duplicate
      const isDuplicate = this.scannedBarcodesSet.has(barcodeString);
      
      if (isDuplicate) {
        duplicateCount++;
        // console.log('Duplicate barcode detected:', barcodeString);
        
        // Add to results but mark as duplicate
        newResults.push({
          barcode: barcodeString,
          success: true, // Duplicates are considered "successful" but not added to main list
          position: {
            x: Math.random() * (this.canvasElement?.width || 800) * 0.6 + (this.canvasElement?.width || 800) * 0.2,
            y: Math.random() * (this.canvasElement?.height || 600) * 0.6 + (this.canvasElement?.height || 600) * 0.2,
            width: 80,
            height: 80
          },
          data: null,
          timestamp: currentTime,
          isDuplicate: true
        });
        
        // Show duplicate notification only if enough time has passed
        const now = Date.now();
        if (now - this.lastDuplicateToastTime > this.duplicateToastCooldown) {
          this.showDuplicateNotification(barcodeString);
          this.lastDuplicateToastTime = now;
        }
        return; // Skip processing for duplicates
      }
      
      // Process new barcode
      let success = false;
      let parsedData = null;
      let isMisplaced = false;
      
      try {
        // Try to parse the barcode
        parsedData = this.parseGS1DataMatrix(barcode, false);
        success = true;
        
        // Add to scanned set to prevent future duplicates
        this.scannedBarcodesSet.add(barcodeString);
        
        // console.log('New barcode added:', barcodeString);
        
      } catch (error) {
        // console.error('Failed to parse barcode:', barcode, error);
        success = false;
      }
      
      // Only add to decoded barcodes list if successful and not duplicate
      if (success && parsedData) {
        // Store original barcode for removal purposes
        parsedData.originalBarcode = barcodeString;
        this.decodedBarcodes.push(parsedData);
        
        // Check if this barcode is misplaced (has validation error)
        isMisplaced = this.hasBarcodeValidationError(parsedData);
      }
      
      // Generate position (in a real implementation, this would come from QR detection library)
      const position = {
        x: Math.random() * (this.canvasElement?.width || 800) * 0.6 + (this.canvasElement?.width || 800) * 0.2,
        y: Math.random() * (this.canvasElement?.height || 600) * 0.6 + (this.canvasElement?.height || 600) * 0.2,
        width: 80,
        height: 80
      };
      
      newResults.push({
        barcode: barcodeString,
        success: success,
        position: position,
        data: parsedData,
        timestamp: currentTime,
        isDuplicate: false,
        isMisplaced: isMisplaced
      });
    });
    
    // Update results (keep only recent ones, within last 3 seconds)
    this.liveQrResults = newResults.filter(result => 
      currentTime - result.timestamp < 3000
    );
    
    // Update misplaced status for existing results based on validation errors
    this.liveQrResults.forEach(result => {
      if (result.data) {
        result.isMisplaced = this.hasBarcodeValidationError(result.data);
      }
    });
    
    // Check for failed scans and show danger light
    const failedScans = newResults.filter(result => !result.success && !result.isDuplicate);
    if (failedScans.length > 0) {
      this.showDangerLight = true;
      this.startDangerLightBlink();
    } else {
      this.showDangerLight = false;
      this.stopDangerLightBlink();
    }
    
    // Note: Duplicate count is shown in the live stats, no need for toast
    
    // Draw overlays on canvas
    this.drawLiveOverlays();
    
    // Emit results
    this.gs1BarcodesDecoded.emit(this.decodedBarcodes);
  }

  /**
   * Draw live overlays on canvas
   */
  drawLiveOverlays() {
    if (!this.canvasContext || !this.canvasElement) return;
    
    // Clear canvas
    this.canvasContext.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
    
    // Draw highlights for each QR code
    this.liveQrResults.forEach((result) => {
      const { x, y, width, height } = result.position;
      
      // Set highlight color based on priority: misplaced > duplicate > success > failure
      if (result.isMisplaced) {
        // Red for misplaced barcodes (validation errors) - thicker border
        this.canvasContext!.strokeStyle = '#F44336'; // Red
        this.canvasContext!.fillStyle = 'rgba(244, 67, 54, 0.4)'; // More visible
        this.canvasContext!.lineWidth = 5; // Thicker border for misplaced
      } else if (result.isDuplicate) {
        // Orange for duplicates
        this.canvasContext!.strokeStyle = 'rgba(255, 153, 0, 0)';
        this.canvasContext!.fillStyle = 'rgba(255, 153, 0, 0)';
        this.canvasContext!.lineWidth = 0;
      } else if (result.success) {
        // Green for success
        this.canvasContext!.strokeStyle = '#4CAF50';
        this.canvasContext!.fillStyle = 'rgba(76, 175, 80, 0.3)';
        this.canvasContext!.lineWidth = 3;
      } else {
        // Red for failure
        this.canvasContext!.strokeStyle = '#F44336';
        this.canvasContext!.fillStyle = 'rgba(244, 67, 54, 0.3)';
        this.canvasContext!.lineWidth = 3;
      }
      
      // Draw rectangle around QR code
      this.canvasContext!.fillRect(x, y, width, height);
      this.canvasContext!.strokeRect(x, y, width, height);
      
      // Add status indicator with larger text for misplaced
      if (result.isMisplaced) {
        // Warning icon for misplaced items - larger and more visible
        this.canvasContext!.fillStyle = '#FFFFFF'; // White text for better visibility
        this.canvasContext!.font = 'bold 24px Arial';
        this.canvasContext!.shadowColor = '#F44336';
        this.canvasContext!.shadowBlur = 10;
        this.canvasContext!.fillText('⚠', x + 5, y + 30);
        this.canvasContext!.shadowBlur = 0; // Reset shadow
      } else if (result.isDuplicate) {
        this.canvasContext!.fillStyle = '#FF9800';
        this.canvasContext!.font = 'bold 20px Arial';
        this.canvasContext!.fillText('↻', x + 5, y + 25);
      } else if (result.success) {
        this.canvasContext!.fillStyle = '#4CAF50';
        this.canvasContext!.font = 'bold 20px Arial';
        this.canvasContext!.fillText('✓', x + 5, y + 25);
      } else {
        this.canvasContext!.fillStyle = '#F44336';
        this.canvasContext!.font = 'bold 20px Arial';
        this.canvasContext!.fillText('✗', x + 5, y + 25);
      }
    });
  }

  /**
   * Start danger light blinking
   */
  
  startDangerLightBlink() {
    if (this.dangerBlinkInterval) return;
    
    this.dangerLightBlink = true;
    this.dangerBlinkInterval = setInterval(() => {
      this.dangerLightBlink = !this.dangerLightBlink;
    }, 500);
  }

  /**
   * Stop danger light blinking
   */
  stopDangerLightBlink() {
    if (this.dangerBlinkInterval) {
      clearInterval(this.dangerBlinkInterval);
      this.dangerBlinkInterval = null;
    }
    this.dangerLightBlink = false;
  }

  /**
   * Convert blob to base64
   */
  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          if (!result || !result.startsWith('data:')) {
            reject(new Error('Invalid data URL format'));
            return;
          }
          resolve(result);
        };
        reader.onerror = (error) => {
          // console.error('FileReader error:', error);
          reject(new Error('Failed to read blob as data URL'));
        };
        reader.readAsDataURL(blob);
      } catch (error) {
        // console.error('Error setting up FileReader:', error); 
        reject(new Error('Failed to convert blob to base64'));
      }
    });
  }

  /**
   * Convert base64 string to Uint8Array
   */
  private base64ToUint8Array(base64: string): Uint8Array {
    try {
      // Handle data URL format (data:image/jpeg;base64,...)
      const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes;
    } catch (error) {
      // console.error('Error converting base64 to Uint8Array:', error);
      return new Uint8Array(0);
    }
  }


  /**
   * Process captured image for GS1 DataMatrix barcode decoding
   */
  async processCapturedImage(imageResult: ImageCaptureResult) {
    const loading = await this.loadingController.create({
      message: this.scanningMode === 'box' ? 
        'Processing image for box barcode...' : 
        'Processing image for GS1 DataMatrix barcodes...',
      duration: 0
    });
    await loading.present();

    try {
      // Use mock data for development - replace with actual API call
      const response = await this.api.decodeBarcodesFromImages([imageResult]);
      
      // Simulate validation errors after scanning QR codes
      if (response && response.data && response.data.length > 0) {
        await this.simulateValidationErrors();
      }
      
      if (response) {
        if (this.scanningMode === 'box') {
          // For box scanning, take the first barcode and process it as a box
          if (response.data && response.data.length > 0) {
            const boxBarcode = response.data[0];
            const parsedBox = this.parseGS1DataMatrix(boxBarcode, true);
            
            // Store box information
            this.boxBarcode = typeof boxBarcode === 'string' ? boxBarcode : String(boxBarcode);
            this.boxProductName = parsedBox.productName || '';
            this.boxGTIN = parsedBox.gtin || '';
            
            // Navigate back to GRN detail with box information
            await this.returnBoxBarcodeToGrnDetail(parsedBox);
          } else {
            await this.showToast('No barcode found in image', 'warning');
          }
        } else if (this.scanningMode === 'location' || this.scanningMode === 'location_single') {
          // For location scanning, find location by barcode
          if (response.data && response.data.length > 0) {
            const locationBarcode = response.data[0];
            await this.handleLocationBarcodeResult(locationBarcode);
          } else {
            await this.showToast('No location barcode found in image', 'warning');
          }
        } else {
          // For batch scanning, process all barcodes
          const newBarcodes = response.data.map(barcode => {
            return this.parseGS1DataMatrix(barcode, false);
          });
          
          // Add new barcodes to existing ones (cumulative)
          this.decodedBarcodes = [...this.decodedBarcodes, ...newBarcodes];
                  
          this.gs1BarcodesDecoded.emit(this.decodedBarcodes);
          this.simulateValidationErrors();

          // console.log(this.decodedBarcodes,"decodedBarcodes");
          
          await this.showToast(`Found ${response.data.length} GS1 DataMatrix barcodes`, 'success');
        }
      } else {
        // await this.showToast(response.error || 'Failed to decode barcodes', 'danger');
      }
    } catch (error) {
      // console.error('Error processing image:', error);
      await this.showToast('Error processing image', 'danger');
    } finally {
      await loading.dismiss();
    }
  }

  /**
   * Finish scanning and navigate to GRN detail page
   */
  async finishScanningAndNavigate() {
    try {
      if (!this.isBoxScanned) {
        await this.showToast('Please scan a box barcode first', 'warning');
        return;
      }

      // Check if any batches were scanned
      if (this.decodedBarcodes.length === 0) {
        await this.showToast('Please scan at least one batch before finishing', 'warning');
        return;
      }

      // Check for validation errors - prevent finishing if there are errors
      if (this.hasValidationErrors()) {
        const errorCount = this.getTotalValidationErrorCount();
        await this.showToast(`Cannot finish: ${errorCount} barcode(s) have validation errors. Please fix them first.`, 'danger');
        return;
      }

      if (!this.grnId) {
        await this.showToast('Error: GRN ID not found', 'danger');
        return;
      }

      // Stop any ongoing scanning
      this.stopLiveScanning();

      // Navigate to GRN detail with current data
      await this.navigateToGrnDetailWithData();

    } catch (error) {
      // console.error('Error finishing scanning:', error);
      await this.showToast('Error finishing scanning', 'danger');
    }
  }

  /**
   * Navigate to GRN page for batch scanning after box confirmation
   */
  async navigateToGrnForBatchScanning() {
    try {
      if (!this.grnId) {
        await this.showToast('Error: GRN ID not found', 'danger');
        return;
      }

      // Prepare batch scanning data
      const batchData = {
        boxBarcode: this.boxBarcode,
        boxProductName: this.boxProductName,
        boxGTIN: this.boxGTIN,
        batches: this.decodedBarcodes,
        totalBatches: this.decodedBarcodes.length,
        scanningStep: 'batch_scanning',
        grnRef: this.grnRef,
        taskId: this.taskId,
        taskData: this.taskData,
        listType: this.listType,
        requition_no: this.requition_no,
        timestamp: new Date().toISOString()
      };

      // console.log('Navigating to GRN for batch scanning:', batchData);

      // Show message
      await this.showToast('Navigating to GRN page for batch scanning...', 'info');

      // Navigate to GRN detail page for batch scanning
      setTimeout(() => {
        this.router.navigate(['/grn', this.grnId], {
          state: {
            isTaskScanningMode:true,
            batchScanning: true,
            batchData: batchData,
            scanningStep: 'batch_scanning',
            grnRef: this.grnRef,
            taskId: this.taskId,
            taskData: this.taskData,
            listType: this.listType,
            requition_no: this.requition_no
          }
        });
      }, 1500);

    } catch (error) {
      // console.error('Error navigating to GRN for batch scanning:', error);
      await this.showToast('Error navigating to GRN page', 'danger');
    }
  }

  /**
   * Navigate to GRN detail page with both box and batch data
   */
  async navigateToGrnDetailWithData() {
    try {
      if (!this.grnId) {
        await this.showToast('Error: GRN ID not found', 'danger');
        return;
      }

      // Prepare the data to send to GRN detail page
      const scanningData = {
        boxBarcode: this.boxBarcode,
        boxProductName: this.boxProductName,
        boxGTIN: this.boxGTIN,
        batches: this.decodedBarcodes,
        totalBatches: this.decodedBarcodes.length,
        scanningMode: this.scanningMode,
        isBoxScanned: this.isBoxScanned,
        timestamp: new Date().toISOString(),
        grnRef: this.grnRef,
        taskId: this.taskId,
        taskData: this.taskData,
        listType: this.listType,
        requition_no: this.requition_no
      };

      // console.log('Navigating to GRN detail with data:', scanningData);

      // Show success message
      await this.showToast(`Scanning completed! ${this.decodedBarcodes.length} batches scanned for box ${this.boxBarcode}`, 'success');

      // Navigate to GRN detail page with the data
      setTimeout(() => {
        this.router.navigate(['/grn', this.grnId], {
          state: {
            scanningCompleted: true,
            scanningData: scanningData,
            boxBarcode: this.boxBarcode,
            boxProductName: this.boxProductName,
            boxGTIN: this.boxGTIN,
            batches: this.decodedBarcodes,
            totalBatches: this.decodedBarcodes.length,
            listType: this.listType,
            requition_no: this.requition_no
          }
        });
      }, 2000);

    } catch (error) {
      // console.error('Error navigating to GRN detail:', error);
      await this.showToast('Error navigating to GRN detail page', 'danger');
    }
  }

  /**
   * Process box barcode and navigate to GRN page for box confirmation
   */
  async processBoxBarcode(parsedBox: any) {
    try {
      // console.log('Processing box barcode:', parsedBox);
      
      // Set box barcode information
      this.boxBarcode = parsedBox.boxBarcode || parsedBox.gtin || parsedBox.rawValue;
      this.boxProductName = parsedBox.boxProductName || parsedBox.productName || this.taskData?.itemName || 'Unknown Product';
      this.boxGTIN = parsedBox.gtin || parsedBox.boxBarcode || parsedBox.rawValue;
      
      console.log('Box barcode set:', {
        boxBarcode: this.boxBarcode,
        boxProductName: this.boxProductName,
        boxGTIN: this.boxGTIN
      });
      
      // Show success message
      await this.showToast('Box barcode scanned successfully!', 'success');
      
      // Mark box as scanned
      this.isBoxScanned = true;
      this.boxScanningComplete = true;
      
      // Navigate to GRN page to confirm box details
      await this.navigateToGrnForBoxConfirmation(parsedBox);
      
    } catch (error) {
     // console.error('Error processing box barcode:', error);
      await this.showToast('Error processing box barcode', 'danger');
    }
  }

  /**
   * Navigate to GRN page for box confirmation
   */
  async navigateToGrnForBoxConfirmation(parsedBox: any) {
    try {
      if (!this.grnId) {
        await this.showToast('Error: GRN ID not found', 'danger');
        return;
      }

      // Prepare box data for GRN page
      const boxData = {
        boxBarcode: this.boxBarcode,
        boxProductName: this.boxProductName,
        boxGTIN: this.boxGTIN,
        parsedBoxData: parsedBox,
        scanningStep: 'box_confirmation',
        grnRef: this.grnRef,
        taskId: this.taskId,
        taskData: this.taskData,
        listType: this.listType,
        requition_no: this.requition_no,
        timestamp: new Date().toISOString()
      };

      // console.log('Navigating to GRN for box confirmation:', boxData);

      // Show message
      await this.showToast('Navigating to GRN page to confirm box details...', 'info');

      // Navigate to GRN detail page with box data
      setTimeout(() => {
        this.router.navigate(['/grn', this.grnId], {
          state: {
            boxConfirmation: true,
            boxData: boxData,
            scanningStep: 'box_confirmation',
            grnRef: this.grnRef,
            taskId: this.taskId,
            taskData: this.taskData,
            listType: this.listType,
            requition_no: this.requition_no
          }
        });
      }, 1500);

    } catch (error) {
      // console.error('Error navigating to GRN for box confirmation:', error);
      await this.showToast('Error navigating to GRN page', 'danger');
    }
  }

  /**
   * Reset box scanning to allow rescanning the box
   */
  async resetBoxScanning() {
    try {
      // Reset box scanning state
      this.isBoxScanned = false;
      this.boxScanningComplete = false;
      this.scanningMode = 'box';
      
      // Clear box information
      this.boxBarcode = '';
      this.boxProductName = '';
      this.boxGTIN = '';
      
      // Clear any scanned barcodes
      this.decodedBarcodes = [];
      this.scannedBarcodesSet.clear();
      
      // Stop any ongoing scanning
      this.stopLiveScanning();
      
      // Update UI
      this.cdr.detectChanges();
      
      await this.showToast('Box scanning reset. You can now scan a new box.', 'info');
      
    } catch (error) {
      // console.error('Error resetting box scanning:', error);
      await this.showToast('Error resetting box scanning', 'danger');
    }
  }

  /**
   * Return box barcode information to GRN detail page
   */
  async returnBoxBarcodeToGrnDetail(parsedBox: any) {
    if (this.grnId) {
      await this.showToast('Box barcode scanned successfully!', 'success');
      
      // Navigate back to GRN detail with box information
      setTimeout(() => {
        this.router.navigate(['/grn', this.grnId], {
          state: {
            boxBarcodeScanned: true,
            scannedBoxBarcode: this.boxBarcode,
            boxProductName: this.boxProductName,
            boxGTIN: this.boxGTIN,
            parsedBoxData: parsedBox,
            listType: this.listType, requition_no: this.requition_no 
          }
        });
      }, 1500);
    } else {
      await this.showToast('Error: GRN ID not found', 'danger');
      // console.error('GRN ID is null, cannot navigate back to GRN detail');
    }
  }

  /**
   * Handle location barcode scanning result
   */
  async handleLocationBarcodeResult(locationBarcode: any) {
    // console.log(locationBarcode,"locationBarcode");
    try {
      // Find location by barcode
      const location = this.availableLocations.find(loc => loc.barcode == locationBarcode);
      
      if (location) {
        // Return to GRN detail with selected location
        this.router.navigate(['/grn', this.grnId], {
          state: {
            selectedLocation: location,
            scannedLocationBarcode: locationBarcode,
            singleScan: true,
            returnImmediately: true
          }
        });
        await this.showToast(`Location found: ${location.name}`, 'success');
      } else {
        // Even if location not found, return the scanned barcode
        // this.router.navigate(['/grn', this.grnId], {
        //   state: {
        //     scannedLocationBarcode: locationBarcode,
        //     singleScan: true,
        //     returnImmediately: true
        //   }
        // });
        await this.showToast('Location not found for this barcode', 'warning');
      }
    } catch (error) {
      // console.error('Error handling location barcode result:', error);
      await this.showToast('Failed to process location barcode', 'danger');
    }
  }

  /**
   * Process all captured images in batch
   */
  async processAllImages() {
    if (this.capturedImages.length === 0) {
      await this.showToast('No images to process', 'warning');
      return;
    }

    const loading = await this.loadingController.create({
      message: `Processing ${this.capturedImages.length} images...`,
      duration: 0
    });
    await loading.present();

    try {
      // const response = await this.api.decodeBarcodesFromImages(this.capturedImages);
      
      // if (response.status==200) {
      //   // Parse new barcodes
      //   const newBarcodes = response.data.map(barcode => {
      //     return this.parseGS1DataMatrix(barcode, false);
      //   });
        
        // Add new barcodes to existing ones (cumulative)
        // this.decodedBarcodes = [...this.decodedBarcodes, ...newBarcodes];
        
        this.gs1BarcodesDecoded.emit(this.decodedBarcodes);
        
        // Check if any batches were scanned
        if (this.decodedBarcodes.length === 0) {
          await this.showToast('No batches found in images. Please scan some batches first.', 'warning');
          return;
        }
        
        await this.showToast(`Processed ${this.decodedBarcodes.length} new barcodes (Total: ${this.decodedBarcodes.length}) from ${this.capturedImages.length} images`, 'success');
        
        // Navigate to GRN page for batch scanning
        await this.navigateToGrnForBatchScanning();
        
      // } else {
      //   await this.showToast(response.error || 'Failed to process images', 'danger');
      // }
    } catch (error) {
      // console.error('Error processing images:', error);
      await this.showToast('Error processing images', 'danger');
    } finally {
      await loading.dismiss();
    }
  }

  /**
   * Parse GS1 Data Matrix barcode format
   * Format: "(01)01234567890128(17)251231(10)BATCH123(21)000001"
   */
  parseGS1DataMatrix(barcode: any, isBoxBarcode: boolean = false) {
    if (!barcode) return;

    // Handle both string and object inputs
    let barcodeString: string;
    let barcodeObj: any;

    if (typeof barcode === 'string') {
      barcodeString = barcode;
      barcodeObj = { data: barcode };
    } else {
      barcodeString = barcode.data || barcode;
      barcodeObj = barcode;
    }

    // console.log('Parsing GS1 Data Matrix:', barcodeString, isBoxBarcode ? '(BOX)' : '(BATCH)');
    if (isBoxBarcode) {
      const gtinMatch = barcodeString;
      if (gtinMatch) {
        barcodeObj.gtin = gtinMatch;
      }
      // list-item/s=/
      this.api.post('/items/list-item/s='+barcodeObj.gtin+"/", {
        company:  this.api.getUserCompany(),
      }).subscribe({
        next: (response: any) => {
          // console.log(response);
          if(response.status==200 && response.data){
            this.expectedItems = response.data;
            barcodeObj.productName = this.expectedItems[0]?.name;
            this.boxProductName = barcodeObj.productName;
      
            // console.log(this.expectedItems,"expectedItems");
          }
        }
      });
    }else{
    // Extract GTIN (01) - 14 digits
    const gtinMatch = barcodeString.match(/\(01\)(\d{14})/);
    if (gtinMatch) {
      barcodeObj.gtin = gtinMatch[1];
    }
  }
    // Extract Expiry Date (17) - YYMMDD format
    const expiryMatch = barcodeString.match(/\(17\)(\d{6})/);
    if (expiryMatch) {
      const expiryStr = expiryMatch[1];
      // Convert YYMMDD to readable format
      const year = '20' + expiryStr.substring(0, 2);
      const month = expiryStr.substring(2, 4);
      const day = expiryStr.substring(4, 6);
      barcodeObj.expiryDate = `${year}-${month}-${day}`;
    }

    // Extract Batch Number (10) - variable length
    const batchMatch = barcodeString.match(/\(10\)([^(]+)/);
    if (batchMatch) {
      barcodeObj.batchNumber = batchMatch[1].trim();
    }

    // Extract Serial Number (21) - variable length
    const serialMatch = barcodeString.match(/\(21\)([^(]+)/);
    if (serialMatch) {
      barcodeObj.serialNumber = serialMatch[1].trim();
    }

    // Determine product name based on context
    if (isBoxBarcode) {
      // For box barcode, get product name from GTIN and store it
      this.boxGTIN = barcodeObj.gtin;
      barcodeObj.isParent = true;
      barcodeObj.barcodeType = 'BOX';
      // console.log('Box product name stored:', this.boxProductName);
    } else {
      // For batch barcodes, inherit product name from box
      // barcodeObj.productName = this.boxProductName || this.expectedItems[0].name;
      barcodeObj.parentGTIN = this.boxGTIN;
      barcodeObj.parentBarcode = this.boxBarcode;
      barcodeObj.isChild = true;
      barcodeObj.barcodeType = 'BATCH';
    }

    // console.log('Parsed barcode:', {
    //   gtin: barcodeObj.gtin,
    //   batchNumber: barcodeObj.batchNumber,
    //   serialNumber: barcodeObj.serialNumber,
    //   expiryDate: barcodeObj.expiryDate,
    //   productName: barcodeObj.productName,
    //   barcodeType: barcodeObj.barcodeType,
    //   isParent: barcodeObj.isParent,
    //   isChild: barcodeObj.isChild
    // });

    return barcodeObj;
  }

  /**
   * Parse box barcode and store product information
   */
  parseBoxBarcode(barcodeString: string) {
    // console.log('Parsing box barcode:', barcodeString);
    const boxData = this.parseGS1DataMatrix(barcodeString, true);
    this.boxBarcode = barcodeString;
    return boxData;
  }

  /**
   * Reset box information when starting new task
   */
  resetBoxInformation() {
    this.boxProductName = '';
    this.boxGTIN = '';
    this.boxBarcode = '';
    // console.log('Box information reset');
  }

  /**
   * Validate scanned items against expected items
   * Only mark 2 items with validation errors for demonstration
   */
  validateScannedItems() {
    this.validationErrors = {};
    
    if (!this.isValidationEnabled || this.expectedItems.length === 0) {
      return;
    }

    // Group scanned items by GTIN
    const scannedByGTIN = new Map<string, GS1BarcodeData[]>();
    this.decodedBarcodes.forEach(item => {
      if (!scannedByGTIN.has(item.gtin)) {
        scannedByGTIN.set(item.gtin, []);
      }
      scannedByGTIN.get(item.gtin)!.push(item);
    });

    // Check each expected item
    this.expectedItems.forEach(expectedItem => {
      const gtin = expectedItem.gtin || expectedItem.itemId;
      const expectedQuantity = expectedItem.quantity || expectedItem.remaning_qty || 0;
      const scannedItems = scannedByGTIN.get(gtin) || [];
      const scannedQuantity = scannedItems.length;

      const errors: string[] = [];

      // Check for missing items
      if (scannedQuantity < expectedQuantity) {
        const missing = expectedQuantity - scannedQuantity;
        errors.push(`Missing ${missing} item(s)`);
      }

      // Check for extra items
      if (scannedQuantity > expectedQuantity) {
        const extra = scannedQuantity - expectedQuantity;
        errors.push(`Extra ${extra} item(s) - Wrong placement`);
      }

      // Check for wrong GTIN
      if (scannedQuantity > 0 && !scannedByGTIN.has(gtin)) {
        errors.push('Wrong item type detected');
      }

      // Check for aggregation issues (parent-child relationships)
      if (expectedItem.requiresAggregation) {
        const hasParent = scannedItems.some(item => item.isParent);
        const hasChildren = scannedItems.some(item => item.isChild);
        
        if (expectedItem.requiresParent && !hasParent) {
          errors.push('Missing parent/box barcode');
        }
        
        if (expectedItem.requiresChildren && !hasChildren) {
          errors.push('Missing child/batch barcodes');
        }
      }

      if (errors.length > 0) {
        this.validationErrors[gtin] = errors;
      }
    });

    // Check for completely wrong items (not in expected list)
    scannedByGTIN.forEach((items, gtin) => {
      const isExpected = this.expectedItems.some(expected => 
        (expected.gtin || expected.itemId) === gtin
      );
      
      if (!isExpected) {
        this.validationErrors[gtin] = ['Item not expected in this box - Wrong placement'];
      }
    });

    // Limit validation errors to only 2 items for demonstration
    this.limitValidationErrorsToTwo();
  }

  /**
   * Limit validation errors to only 2 items for demonstration
   */
  limitValidationErrorsToTwo() {
    const errorKeys = Object.keys(this.validationErrors);
    
    if (errorKeys.length > 2) {
      // Keep only the first 2 items with errors
      const limitedErrors: { [key: string]: string[] } = {};
      for (let i = 0; i < 2 && i < errorKeys.length; i++) {
        const key = errorKeys[i];
        limitedErrors[key] = this.validationErrors[key];
      }
      this.validationErrors = limitedErrors;
    }
  }

  /**
   * Get validation errors for a specific item
   */
  getItemValidationErrors(data: string): string[] {
    return this.validationErrors[data] || [];
  }

  /**
   * Check if an item has validation errors
   */
  // hasValidationErrors(data: string): boolean {
  //   return this.validationErrors[data] && this.validationErrors[data].length > 0;
  // }

  /**
   * Check if a specific barcode object has validation errors
   */
  hasBarcodeValidationError(barcode: any): boolean {
    if (!barcode) return false;
    
    // Check if the barcode object has validation error flags
    if (barcode.hasValidationError) {
      return true;
    }
    
    // Check validation errors by barcode data
    const barcodeData = barcode.data || barcode.rawValue || barcode.originalBarcode || barcode;
    return this.validationErrors[barcodeData] && this.validationErrors[barcodeData].length > 0;
  }

  /**
   * Get validation errors for a specific barcode
   */
  getBarcodeValidationErrors(barcode: any): string[] {
    if (!barcode) return [];
    
    // Check if the barcode object has validation errors
    if (barcode.validationErrors && Array.isArray(barcode.validationErrors)) {
      return barcode.validationErrors;
    }
    
    // Check validation errors by barcode data
    const barcodeData = barcode.data || barcode.rawValue || barcode.originalBarcode || barcode;
    return this.validationErrors[barcodeData] || [];
  }

  /**
   * Get total validation error count
   */
  getTotalValidationErrorCount(): number {
    if (this.decodedBarcodes.length === 0) {
      return 0;
    }
    
    // Count barcodes with validation errors
    return this.decodedBarcodes.filter(barcode => this.hasBarcodeValidationError(barcode)).length;
  }

  /**
   * Check if there are any validation errors that prevent finishing
   */
  hasValidationErrors(): boolean {
    return this.getTotalValidationErrorCount() > 0;
  }

  /**
   * Check if scanning can be finished (no validation errors)
   */
  canFinishScanning(): boolean {
    return this.decodedBarcodes.length > 0 && !this.hasValidationErrors();
  }


  /**
   * Load expected items from task data for validation
   * Only enable validation for listType 2 (requisition)
   */
  loadExpectedItems(taskData: any) {
    // Only enable validation for listType 2 (requisition)
    if (this.listType === 2 && this.requition_no && taskData && taskData.quantity) {
      this.expectedItems = [{
        gtin: this.boxGTIN,
        itemId: taskData.itemId,
        quantity: taskData.quantity,
        itemName: taskData.itemName,
        requiresAggregation: true,
        requiresParent: true,
        requiresChildren: true
      }];
      
      this.isValidationEnabled = true;
      // console.log('Expected items loaded for validation (Requisition):', this.expectedItems);
    } else {
      this.isValidationEnabled = false;
      // console.log('Validation disabled - listType:', this.listType, 'requition_no:', this.requition_no);
    }
  }

  simulateValidationErrors() {
    // if (!this.isValidationEnabled || this.decodedBarcodes.length === 0) {
    //   return;
    // }
    this.validationErrors = {};

    // invoice/qr_check/    --->post
    const body = {
      grnRef: this.grnRef,
      itemId: this.taskData?.itemId,
      itemName: this.taskData?.itemName,
      boxBarcode: this.boxBarcode,
      scannedBarcodes: this.decodedBarcodes,
      type: this.listType
    }
   this.api.post('/invoice/qr_check/', body).subscribe({
    next: (response: any) => {
      // console.log('QR Check API Response:', response);

      if(response.status == 500){
        if(response.error){
          this.showToast(response.error, 'danger');
        }
        // Handle 500 error response - mark items as wrongly placed
        this.handleValidationErrorResponse(response);
      }else if(response.status == 200){
        this.validationErrors = {};
        this.clearMismatchSummary();
      }
    },
    error: (error: any) => {
      // console.error('QR Check API Error:', error);
      // Handle API error - mark items as wrongly placed
      // this.handleApiError();
    }
   });

    // console.log('Simulated validation errors for first 2 items:', this.validationErrors);
  }

  /**
   * Handle validation error response from API
   */
  private handleValidationErrorResponse(response: any) {
    // console.log(response,"response");
    try {
      // Store mismatch data for summary
      this.mismatchData = response;
      this.totalBatches = response.total_batches || 0;
      this.totalBatchesMissing = response.total_batches_missing || 0;
      this.missingBatches = response.missing_batches || [];
      
      // Generate compact mismatch summary
      this.generateCompactMismatchSummary();
      
      // Check if response.details exists and is an array or object
      if (response.details) {
        // console.log(response.details,"response.details");
        // if (Array.isArray(response.details)) {
          // If details is an array, match each item by barcode data
          response.details.forEach((errorItem: any) => {
            // Find the matching barcode in decodedBarcodes by comparing the data
            const matchingBarcode = this.decodedBarcodes.find(barcode => {
              // Check multiple possible properties for the barcode data
              const barcodeData = barcode.data || barcode.rawValue || barcode.originalBarcode || barcode;
              return barcodeData == errorItem.data;
            });
            // console.log(matchingBarcode,"matchingBarcode");

            if (matchingBarcode) {
              // Mark the barcode as having validation errors
              matchingBarcode.hasValidationError = true;
              matchingBarcode.validationErrors = this.validationErrors[errorItem.data] || [];
              
              const barcodeData = matchingBarcode.data || matchingBarcode.rawValue || matchingBarcode.originalBarcode || matchingBarcode;
              this.validationErrors[barcodeData] = ['Item wrongly placed in this box'];
              console.log(barcodeData,"barcode");
              
              // Update liveQrResults to show red box overlay for misplaced items
              this.liveQrResults.forEach(result => {
                // (result.data && (result.data.data === barcodeData || result.data.originalBarcode === barcodeData))
                if (result.barcode == barcodeData 
                   ) {
                  result.isMisplaced = true;
                }
              });
            }
          });
          
          // Redraw overlays to show red boxes for misplaced items
          if (this.isLiveScanning) {
            this.drawLiveOverlays();
          }
        // } else if (typeof response.details === 'object') {
        //   // If details is an object, match keys with barcode data
        //   Object.keys(response.details).forEach(errorKey => {
        //     const matchingBarcode = this.decodedBarcodes.find(barcode => {
        //       const barcodeData = barcode.data || barcode;
        //       return barcodeData === errorKey || barcodeData.includes(errorKey) || errorKey.includes(barcodeData);
        //     });
            
        //     if (matchingBarcode) {
        //       const barcodeData = matchingBarcode.data || matchingBarcode;
        //       this.validationErrors[barcodeData] = response.details[errorKey] || ['Item wrongly placed in this box'];
        //     }
        //   });
        // }
      }
    } catch (error) {
      // console.error('Error handling validation response:', error);
    }
  }

  /**
   * Handle API error by marking items as wrongly placed
   */
  // private handleApiError() {
  //   this.markAllItemsAsWronglyPlaced();
  // }

  /**
   * Mark all scanned items as wrongly placed
   */
  // private markAllItemsAsWronglyPlaced() {
  //   this.decodedBarcodes.forEach((item: any) => {
  //     const barcodeData = item.data || item;
  //     this.validationErrors[barcodeData] = ['Item wrongly placed in this box'];
  //   });
  // }

  shouldShowValidationError(data: string, index: number): boolean {
    if (!this.isValidationEnabled) {
      return false;
    }
    
    const hasError = this.validationErrors[data] && this.validationErrors[data].length > 0;
    // console.log(`Checking validation for data: "${data}", hasError: ${hasError}`, this.validationErrors[data]);
    return hasError;
    // return index < 2 && this.validationErrors[gtin] && this.validationErrors[gtin].length > 0;
  }

  /**
   * Get the count of validation errors
   */
  getValidationErrorCount(): number {
    if (!this.validationErrors || typeof this.validationErrors !== 'object') {
      return 0;
    }
    const count = Object.keys(this.validationErrors).length;
    // console.log('Validation error count:', count, 'Errors:', this.validationErrors);
    return count;
  }



  /**
   * Auto-complete task after processing images
   */
  async autoCompleteTask() {
    if (!this.taskId || !this.boxBarcode || this.decodedBarcodes.length === 0) {
      return;
    }

    try {
      // Submit task data
      const taskData = {
        taskId: this.taskId,
        grnRef: this.grnRef,
        itemId: this.taskData?.itemId,
        itemName: this.taskData?.itemName,
        boxBarcode: this.boxBarcode,
        scannedBarcodes: this.decodedBarcodes,
        toLocation: this.taskData?.toLocation,
        toLocationId: this.taskData?.toLocationId,
        timestamp: new Date().toISOString()
      };

      // const response = await this.api.submitTaskScanningData({
      //   grnRef: this.grnRef,
      //   tasks: [taskData]
      // });

      // if (response.success) {
        await this.showToast('Task completed successfully! Moving to next task...', 'success');
        
        // Navigate back to GRN detail page after a short delay
        setTimeout(() => {
          this.router.navigate(['/grn', this.grnId], {
            state: { 
              autoCompleteTask: true,
              completedTaskId: this.taskId,
              nextTaskIndex: this.taskData?.nextTaskIndex || 0,
              scannedBarcodes: this.decodedBarcodes
            }
          });
        }, 2000);
      // } else {
      //   await this.showToast('Failed to complete task', 'danger');
      // }
    } catch (error) {
      // console.error('Error auto-completing task:', error);
      await this.showToast('Error completing task', 'danger');
    }
  }

  /**
   * Clear all captured images
   */
  clearCapturedImages() {
    this.api.clearCapturedImages();
    this.capturedImages = [];
    this.decodedBarcodes = [];
  }

  /**
   * Clear images for new box scan (first time scanning batches)
   */
  clearImagesForNewBox() {
    this.api.clearCapturedImages();
    this.capturedImages = [];
    this.decodedBarcodes = [];
  }

  /**
   * Force clear all images (both local and API service)
   */
  forceClearAllImages() {
    // console.log('Force clearing all images - before:', this.capturedImages.length);
    this.api.clearCapturedImages();
    this.capturedImages = [];
    this.decodedBarcodes = [];
    // console.log('Force clearing all images - after:', this.capturedImages.length);
  }

  /**
   * Remove a specific captured image
   */
  removeCapturedImage(timestamp: Date) {
    this.api.removeCapturedImage(timestamp);
  }

  /**
   * Get parent barcodes (aggregation data)
   */
  getParentBarcodes(): GS1BarcodeData[] {
    return this.decodedBarcodes.filter(barcode => barcode.isParent);
  }

  /**
   * Get child barcodes for a specific parent
   */
  getChildBarcodes(parentSerialNumber: string): GS1BarcodeData[] {
    return this.decodedBarcodes.filter(barcode => 
      barcode.isChild && barcode.parentBarcode === parentSerialNumber
    );
  }

  /**
   * Load warehouse locations
   */
  async loadWarehouseLocations() {
    try {
      // Load warehouse locations from API
      const response = await this.api.getWarehouseLocations().toPromise();
      this.availableLocations = response?.data || [];
      
      // Add mock data for testing if no locations are loaded
      if (this.availableLocations.length === 0) {
        this.availableLocations = [
          { name: 'Zone A-1', barcode: 'ZONE_A_1', description: 'Main storage zone A' },
          { name: 'Zone A-2', barcode: 'ZONE_A_2', description: 'Secondary storage zone A' },
          { name: 'Zone B-1', barcode: 'ZONE_B_1', description: 'Main storage zone B' },
          { name: 'Zone B-2', barcode: 'ZONE_B_2', description: 'Secondary storage zone B' },
          { name: 'Zone C-1', barcode: 'ZONE_C_1', description: 'Main storage zone C' }
        ];
        // console.log('Using mock warehouse locations:', this.availableLocations);
      }
    } catch (error) {
      // console.error('Error loading warehouse locations:', error);
      // Use mock data as fallback
      this.availableLocations = [
        { name: 'Zone A-1', barcode: 'ZONE_A_1', description: 'Main storage zone A' },
        { name: 'Zone A-2', barcode: 'ZONE_A_2', description: 'Secondary storage zone A' },
        { name: 'Zone B-1', barcode: 'ZONE_B_1', description: 'Main storage zone B' },
        { name: 'Zone B-2', barcode: 'ZONE_B_2', description: 'Secondary storage zone B' },
        { name: 'Zone C-1', barcode: 'ZONE_C_1', description: 'Main storage zone C' }
      ];
      // console.log('Using fallback mock warehouse locations:', this.availableLocations);
    }
  }

  /**
   * Show location selector
   */
  showLocationSelection() {
    if (this.decodedBarcodes.length === 0) {
      this.showToast('No barcodes to place. Please scan some barcodes first.', 'warning');
      return;
    }
    // console.log('Showing location selector...');
    this.showLocationSelector = true;
    // console.log('showLocationSelector set to:', this.showLocationSelector);
  }

  /**
   * Hide location selector
   */
  hideLocationSelection() {
    this.showLocationSelector = false;
    this.selectedLocation = '';
  }

  /**
   * Place barcodes in selected warehouse location
   */
  async placeBarcodesInLocation() {
    if (!this.selectedLocation) {
      this.showToast('Please select a warehouse location', 'warning');
      return;
    }

    if (this.decodedBarcodes.length === 0) {
      this.showToast('No barcodes to place', 'warning');
      return;
    }

    this.isPlacingBarcodes = true;
    const loading = await this.loadingController.create({
      message: `Placing ${this.decodedBarcodes.length} barcodes in location...`,
      duration: 0
    });
    await loading.present();

    try {
      // Call API to place barcodes in warehouse location
      const result = await this.api.placeBarcodesInLocation({
        barcodes: this.decodedBarcodes,
        location: this.selectedLocation,
        grnRef: this.grnRef
      });

      if (result.success) {
        // Show success message
        this.showToast(`Successfully placed ${this.decodedBarcodes.length} barcodes in ${this.selectedLocation}`, 'success');
        
        // Clear the barcodes and hide location selector
        this.decodedBarcodes = [];
        this.hideLocationSelection();
        
        // Navigate back to GRN detail page after a short delay
        setTimeout(() => {
          this.router.navigate(['/grn', this.grnId]);
        }, 2000);
      } else {
        throw new Error(result.error || 'Failed to place barcodes');
      }
      
    } catch (error) {
      // console.error('Error placing barcodes:', error);
      this.showToast('Failed to place barcodes in location', 'danger');
    } finally {
      await loading.dismiss();
      this.isPlacingBarcodes = false;
    }
  }

  /**
   * Export decoded barcodes as JSON
   */
  exportResults() {
    if (this.decodedBarcodes.length === 0) {
      this.showToast('No barcodes to export', 'warning');
      return;
    }

    const exportData = {
      timestamp: new Date().toISOString(),
      totalBarcodes: this.decodedBarcodes.length,
      barcodes: this.decodedBarcodes.map((barcode, index) => ({
        id: index + 1,
        gtin: barcode.gtin,
        serialNumber: barcode.serialNumber,
        batchNumber: barcode.batchNumber,
        expiryDate: barcode.expiryDate,
        productName: barcode.productName,
        quantity: barcode.quantity,
        isParent: barcode.isParent,
        isChild: barcode.isChild,
        parentBarcode: barcode.parentBarcode,
        childBarcodes: barcode.childBarcodes
      }))
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gs1_barcodes_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    this.showToast(`Exported ${this.decodedBarcodes.length} barcodes`, 'success');
  }

  /**
   * Close highlighted image view
   */
  closeHighlightedImage() {
    // This method is kept for compatibility but not used in live scanning mode
  }

  /**
   * Get successful scan count
   */
  getSuccessfulScanCount(): number {
    return this.liveQrResults.filter(r => r.success && !r.isDuplicate).length;
  }

  /**
   * Get failed scan count
   */
  getFailedScanCount(): number {
    return this.liveQrResults.filter(r => !r.success && !r.isDuplicate).length;
  }

  /**
   * Get duplicate scan count
   */
  getDuplicateScanCount(): number {
    return this.liveQrResults.filter(r => r.isDuplicate).length;
  }

  /**
   * Get misplaced barcode count (validation errors)
   */
  getMisplacedBarcodeCount(): number {
    return this.decodedBarcodes.filter(barcode => this.hasBarcodeValidationError(barcode)).length;
  }

  /**
   * Check if there are failed scans
   */
  hasFailedScans(): boolean {
    return this.liveQrResults.some(r => !r.success && !r.isDuplicate);
  }

  /**
   * Check if there are duplicate scans
   */
  hasDuplicateScans(): boolean {
    return this.liveQrResults.some(r => r.isDuplicate);
  }

  /**
   * Check if there are misplaced barcodes
   */
  hasMisplacedBarcodes(): boolean {
    return this.getMisplacedBarcodeCount() > 0;
  }

  /**
   * Get scan results summary
   */
  getScanResultsSummary() {
    const total = this.liveQrResults.length;
    const successful = this.getSuccessfulScanCount();
    const failed = this.getFailedScanCount();
    
    return {
      total,
      successful,
      failed,
      successRate: total > 0 ? Math.round((successful / total) * 100) : 0
    };
  }

  /**
   * Show toast message
   */
  private async showToast(message: string, color: 'success' | 'danger' | 'warning' | 'info' = 'success') {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      color,
      position: 'bottom'
    });
    await toast.present();
  }

  /**
   * Generate compact mismatch summary for display in validation error box
   */
  private generateCompactMismatchSummary(): void {
    let summary = `⚠️ Total Batches: ${this.totalBatches}`;
    
    // Handle positive/negative missing batches count
    if (this.totalBatchesMissing > 0) {
      summary += `, ${this.totalBatchesMissing} missing`;
    } else if (this.totalBatchesMissing < 0) {
      summary += `, ${Math.abs(this.totalBatchesMissing)} extra`;
    }
    
    if (this.missingBatches.length > 0) {
      summary += `\nMissing Items:`;
      this.missingBatches.forEach((batch, index) => {
        const serialNum = batch.serialNumber || batch.data.substring(batch.data.length - 6);
        summary += `\n${index + 1}. Serial: ${serialNum}`;
        if (batch.batchNumber) {
          summary += ` | Batch: ${batch.batchNumber}`;
        }
        if (batch.gtin) {
          summary += ` | GTIN: ${batch.gtin}`;
        }
      });
    }
    
    summary += `\nMisplaced: ${this.mismatchData?.details?.length || 0} items`;
    
    this.mismatchSummaryText = summary;
    console.log('Generated mismatch summary:', this.mismatchSummaryText);
  }

  /**
   * Get mismatch summary data for display
   */
  getMismatchSummaryData() {
    return {
      totalBatches: this.totalBatches,
      totalBatchesMissing: Math.abs(this.totalBatchesMissing),
      missingBatches: this.missingBatches,
      misplacedItems: this.mismatchData?.details?.length || 0,
      hasMismatch: this.mismatchData !== null,
      summaryText: this.mismatchSummaryText
    };
  }

  /**
   * Get compact mismatch summary text for display
   */
  getMismatchSummaryText(): string {
    return this.mismatchSummaryText;
  }

  /**
   * Clear mismatch summary data
   */
  private clearMismatchSummary(): void {
    this.mismatchData = null;
    this.totalBatches = 0;
    this.totalBatchesMissing = 0;
    this.missingBatches = [];
    this.mismatchSummaryText = '';
  }

  /**
   * Show duplicate notification
   */
  private async showDuplicateNotification(barcode: string) {
    const toast = await this.toastController.create({
      message: `Duplicate detected`,
      duration: 1000,
      color: 'warning',
      position: 'top',
      cssClass: 'compact-toast'
    });
    await toast.present();
  }

  /**
   * Get scanner title based on scanning mode
   */
  getScannerTitle(): string {
    if (this.scanningMode === 'box') {
      return 'Scan Box Barcode';
    } else if (this.scanningMode === 'location' || this.scanningMode === 'location_single') {
      return 'Scan Location Barcode';
    } else if (this.isImageCaptureMode) {
      return 'Capture Images inside box';
    } else {
      return 'Scan Barcodes';
    }
  }

  /**
   * Remove a barcode from the results
   */
  removeBarcode(index: number) {
    if (index >= 0 && index < this.decodedBarcodes.length) {
      const removedBarcode = this.decodedBarcodes[index];
      this.decodedBarcodes.splice(index, 1);
      
      // Also remove from scanned set to allow re-scanning
      if (removedBarcode && removedBarcode.originalBarcode) {
        this.scannedBarcodesSet.delete(removedBarcode.originalBarcode);
      }
      
      // Emit updated results
      this.gs1BarcodesDecoded.emit(this.decodedBarcodes);
      
      this.showToast('Barcode removed', 'warning');
    }
  }

  /**
   * Remove a misplaced barcode (with validation errors) from the results
   */
  removeMisplacedBarcode(index: number) {
    if (index >= 0 && index < this.decodedBarcodes.length) {
      const removedBarcode = this.decodedBarcodes[index];
      
      // Only allow removal if it has validation errors
      if (this.hasBarcodeValidationError(removedBarcode)) {
        this.decodedBarcodes.splice(index, 1);
        
        // Also remove from scanned set to allow re-scanning
        if (removedBarcode && removedBarcode.originalBarcode) {
          this.scannedBarcodesSet.delete(removedBarcode.originalBarcode);
        }
        
        // Remove from validation errors
        const barcodeData = removedBarcode.data || removedBarcode.rawValue || removedBarcode.originalBarcode || removedBarcode;
        if (this.validationErrors[barcodeData]) {
          delete this.validationErrors[barcodeData];
        }
        
        // Update liveQrResults to remove misplaced status
        this.liveQrResults.forEach(result => {
          if (result.barcode === barcodeData || 
              (result.data && (result.data.data === barcodeData || result.data.originalBarcode === barcodeData))) {
            result.isMisplaced = false;
          }
        });
        
        // Redraw overlays to remove red boxes
        if (this.isLiveScanning) {
          this.drawLiveOverlays();
        }
        
        // Emit updated results
        this.gs1BarcodesDecoded.emit(this.decodedBarcodes);
        
        this.showToast('Misplaced barcode removed. You can now finish scanning.', 'success');
      } else {
        this.showToast('This barcode does not have validation errors', 'warning');
      }
    }
  }
}
