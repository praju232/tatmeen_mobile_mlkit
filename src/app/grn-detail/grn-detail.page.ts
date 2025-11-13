import { Component, OnInit } from '@angular/core';
import { ViewWillEnter } from '@ionic/angular';
import { ActivatedRoute, Router, NavigationEnd } from '@angular/router';
import { AuthService } from '../auth.service';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonLabel, IonSpinner, IonButtons, IonBackButton, IonInput, IonButton, IonIcon, IonCard, IonCardContent } from '@ionic/angular/standalone';
import { ToastController,ModalController } from '@ionic/angular/standalone';
import { Capacitor } from '@capacitor/core';
import { BarcodeScanner, BarcodeFormat } from '@capacitor-mlkit/barcode-scanning';
// import { BrowserMultiFormatReader } from '@zxing/browser';
import { NgZone } from '@angular/core';
import { CameraScannerComponent } from '../camera-scanner/camera-scanner.component';
import { Api } from 'src/services/api';
import { addIcons } from 'ionicons';
import { 
  clipboard,
  arrowBack,
  documentText,
  listOutline,
  cubeOutline,
  scanCircle,
  playCircle,
  camera,
  arrowForward,
  checkmarkCircle,
  checkmarkCircleOutline,
  checkmark,
  locationOutline,
  cloudUpload,
  list,
  alertCircle,
  scanOutline,
  cube,
  barcodeOutline
} from 'ionicons/icons';

addIcons({ 
  clipboard,
  arrowBack,
  documentText,
  listOutline,
  cubeOutline,
  scanCircle,
  playCircle,
  camera,
  arrowForward,
  checkmarkCircle,
  checkmarkCircleOutline,
  checkmark,
  locationOutline,
  cloudUpload,
  list,
  alertCircle,
  scanOutline,
  cube,
  barcodeOutline
});

@Component({
  selector: 'app-grn-detail',
  templateUrl: './grn-detail.page.html',
  styleUrls: ['./grn-detail.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonLabel, IonSpinner, IonButtons, IonBackButton, IonInput, IonButton, IonIcon,IonCard, IonCardContent],
})
export class GrnDetailPage implements OnInit, ViewWillEnter {
  tasks: any[] = [];
  uniqueGrnRefs: string[] = [];
  loading: boolean = false;
  error: string = '';
  grnRef: string = '';
  warehouseLocations: any[] = [];
  locationBarcode: string = '';
  matchedLocations: any[] = [];
  itemBarcode: string = '';
  matchedItemName: string = '';
  itemBarcodeError: string = '';
  manualQuantity: number | null = null;
  showQuantityModal: boolean = false;
  quantityModalError: string = '';
  confirmedQuantity: number | null = null;
  confirmedName: string = '';
  confirmedItems: Array<{ name: string; quantity: number; total: number; locationName: string; status: 'none' | 'item' | 'both'; [key: string]: any; }> = [];
  isScanning = false;
  // Track current remaining quantity for each item barcode
  currentRemaningQtyMap: { [barcode: string]: number } = {};
  itemLocations: any = null;
  listType: number | null = null;
  requition_no: string | null = null;
  locationError: string = '';
  boxBarcode: string = '';
  matchedBoxName: string = '';
  boxBarcodeError: string = '';
  
  // Sequential task scanning properties
  currentTaskIndex: number = 0;
  isTaskScanningMode: boolean = false;
  currentTask: any = null;
  scannedBoxBarcode: string = '';
  scannedBarcodes: any[] = [];
  taskScanningData: any[] = [];
  availableLocations: any[] = [];
  showLocationSelector: boolean = false;
  selectedLocationString: string = '';
  isPlacingBarcodes: boolean = false;
  baseUrl: string = 'https://tatmeenapi.esarwa.com';

  // Multi-box scanning properties
  currentBoxIndex: number = 0;
  currentTaskBoxes: any[] = [];
  currentBox: any = null;
  boxScanningData: any[] = [];
  isBoxScanningMode: boolean = false;

  // Location selection properties
  showLocationModal: boolean = false;
  selectedLocation: any | null = null;
  locationSearchTerm: string = '';

  // Step-by-step scanning workflow properties
  currentScanningStep: 'box_confirmed' | 'batches_confirmed' | 'location_selected' | 'box_submitted' | 'ready_for_next_box' | null = null;
  currentBoxData: any = null;
  currentBatchData: any = null;
  taskId: any = null;
  taskData: any = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService,
    private http: HttpClient,
    private toastController: ToastController,
    private ngZone: NgZone,
    private modalController: ModalController,
    private ap: Api
  ) {}

  /**
   * Handle scanning data received from camera scanner navigation
   */
  private handleScanningDataFromNavigation(nav: any) {
    // Handle box confirmation step
    if (nav && nav.boxConfirmation && nav.boxData) {
      console.log('Received box confirmation data:', nav.boxData);
      this.handleBoxConfirmation(nav.boxData);
    }
    // Handle batch scanning step
    else if (nav && nav.batchScanning && nav.batchData) {
      console.log('Received batch scanning data:', nav.batchData);
      this.handleBatchScanning(nav.batchData);
    }
    // Handle legacy scanning data (for backward compatibility)
    else if (nav && nav.scanningCompleted && nav.scanningData) {
      console.log('Received legacy scanning data from camera scanner:', nav.scanningData);
      this.handleLegacyScanningData(nav.scanningData);
    }
    
    // Clear the navigation state after processing to prevent persistence
    this.clearNavigationState();
  }

  /**
   * Clear navigation state to prevent data persistence
   */
  private clearNavigationState() {
    // Clear the browser history state
    if (window.history && window.history.replaceState) {
      window.history.replaceState({}, '', window.location.href);
    }
    console.log('Navigation state cleared');
  }

  /**
   * Handle box confirmation step
   */
  private handleBoxConfirmation(boxData: any) {
    console.log('Processing box confirmation data:', boxData);
    
    // Check if boxData is a string (raw barcode) or object
    let parsedBoxData;
    if (typeof boxData === 'string') {
      // Parse the GS1 DataMatrix barcode string
      parsedBoxData = this.parseGS1DataMatrix(boxData, true);
      console.log('Parsed barcode data:', parsedBoxData);
    } else {
      // Use the provided object data
      parsedBoxData = boxData.parsedBoxData || boxData;
    }
    
    // Set box barcode and related data
    this.scannedBoxBarcode = boxData.boxBarcode || parsedBoxData.boxBarcode || parsedBoxData.gtin || boxData;
    this.boxBarcode = boxData.boxBarcode || parsedBoxData.boxBarcode || parsedBoxData.gtin || boxData;
    this.matchedBoxName = boxData.boxProductName || parsedBoxData.boxProductName || parsedBoxData.productName || '';
    
    // Store box data for later use
    this.currentBoxData = {
      boxBarcode: this.scannedBoxBarcode,
      boxProductName: this.matchedBoxName,
      boxGTIN: boxData.boxGTIN || parsedBoxData.gtin || parsedBoxData.boxBarcode,
      parsedBoxData: parsedBoxData,
      originalData: boxData,
      grnRef: boxData.grnRef,
      taskId: boxData.taskId,
      taskData: boxData.taskData
    };
    
    // Box data is stored in component state only
    
    // Show success message
    this.showToast(`Box confirmed: ${this.scannedBoxBarcode}`, 'success');
    
    // Set current scanning step
    this.currentScanningStep = 'box_confirmed';
    
    console.log('Box confirmation completed:', this.currentBoxData);
  }

  /**
   * Handle batch scanning step
   */
  private handleBatchScanning(batchData: any) {
    // Set scanned batches
    this.scannedBarcodes = batchData.batches || [];
    console.log(`Loaded ${this.scannedBarcodes.length} batches from camera scanner`);
    
    // Store batch data for later use
    this.currentBatchData = batchData;
    
    // Persist batch data to localStorage
    
    // Show success message
    this.showToast(`Batches confirmed: ${this.scannedBarcodes.length} batches for box ${batchData.boxBarcode}`, 'success');
    
    // Set current scanning step
    this.currentScanningStep = 'batches_confirmed';
    
    console.log('Batch scanning completed:', batchData);
  }

  /**
   * Handle legacy scanning data (for backward compatibility)
   */
  private handleLegacyScanningData(scanningData: any) {
    console.log('Processing legacy scanning data:', scanningData);
    
    // Parse box barcode to extract proper information
    let parsedBoxData: any = {};
    if (scanningData.boxBarcode) {
      parsedBoxData = this.parseGS1DataMatrix(scanningData.boxBarcode, true);
      console.log('Parsed box barcode data:', parsedBoxData);
    }
    
    // Set box barcode and related data with proper parsing
    if (scanningData.boxBarcode) {
      this.scannedBoxBarcode = parsedBoxData.gtin || scanningData.boxBarcode;
      this.boxBarcode = parsedBoxData.gtin || scanningData.boxBarcode;
      this.matchedBoxName = scanningData.boxProductName || parsedBoxData.boxProductName || scanningData.taskData?.itemName || 'Unknown Product';
    }
    
    // Set scanned batches
    if (scanningData.batches && scanningData.batches.length > 0) {
      this.scannedBarcodes = scanningData.batches;
      console.log(`Loaded ${scanningData.batches.length} batches from camera scanner`);
    }
    
    // Set location if provided
    if (scanningData.selectedLocation) {
      this.selectedLocation = scanningData.selectedLocation;
      this.selectedLocationString = scanningData.selectedLocation.barcode || '';
    }
    
    // Set current scanning step based on what data we have
    if (this.scannedBoxBarcode && this.scannedBarcodes.length > 0) {
      this.currentScanningStep = 'batches_confirmed';
    } else if (this.scannedBoxBarcode) {
      this.currentScanningStep = 'box_confirmed';
    }
    
    // Store current data for persistence
    this.currentBoxData = {
      boxBarcode: this.scannedBoxBarcode,
      boxProductName: this.matchedBoxName,
      boxGTIN: parsedBoxData.gtin || scanningData.boxBarcode,
      parsedBoxData: parsedBoxData,
      originalData: scanningData,
      grnRef: scanningData.grnRef,
      taskId: scanningData.taskId,
      taskData: scanningData.taskData
    };
    
    this.currentBatchData = {
      batches: this.scannedBarcodes,
      totalBatches: scanningData.totalBatches || this.scannedBarcodes.length,
      boxBarcode: this.scannedBoxBarcode,
      boxProductName: this.matchedBoxName,
      grnRef: scanningData.grnRef,
      taskId: scanningData.taskId,
      taskData: scanningData.taskData
    };
    
    // Persist data to localStorage
    
    // Show success message
    this.showToast(`Successfully loaded scanning data: ${scanningData.totalBatches || 0} batches for box ${this.scannedBoxBarcode}`, 'success');
    
    // If we have both box and batches, we can auto-complete the current task
    if (this.scannedBoxBarcode && this.scannedBarcodes.length > 0) {
      this.handleAutoCompleteFromScanning(scanningData);
    }
  }

  /**
   * Handle auto-completion when scanning data is received
   */
  private async handleAutoCompleteFromScanning(scanningData: any) {
    try {
      // Find the current task that matches the scanned data
      const currentTask = this.tasks.find(task => 
        task.grnRef === scanningData.grnRef && 
        task.itemId === scanningData.taskData?.itemId
      );
      
      if (currentTask) {
        // Create task scanning data entry
        const taskData = {
          taskId: scanningData.taskId,
          grnRef: scanningData.grnRef,
          itemId: scanningData.taskData?.itemId,
          itemName: scanningData.taskData?.itemName,
          boxBarcode: scanningData.boxBarcode,
          boxProductName: scanningData.boxProductName,
          boxGTIN: scanningData.boxGTIN,
          scannedBarcodes: scanningData.batches,
          toLocation: scanningData.selectedLocation?.name || 'Not specified',
          toLocationId: scanningData.selectedLocation?.id || null,
          timestamp: scanningData.timestamp,
          autoCompleted: true
        };
        
        // Add to task scanning data
        this.taskScanningData.push(taskData);
        
        // Mark task as completed
        this.markTaskAsCompleted(currentTask);
        
        console.log('Auto-completed task with scanning data:', taskData);
        
        // Show completion message
        await this.showToast(`Task auto-completed: ${scanningData.totalBatches} batches scanned for box ${scanningData.boxBarcode}`, 'success');
      }
    } catch (error) {
      console.error('Error handling auto-completion from scanning:', error);
      await this.showToast('Error processing scanning data', 'danger');
    }
  }

  /**
   * Mark a task as completed
   */
  private markTaskAsCompleted(task: any) {
    if (task) {
      task.completed = true;
      task.completedAt = new Date().toISOString();
      task.scannedBarcodes = this.scannedBarcodes;
      task.boxBarcode = this.scannedBoxBarcode;
    }
  }



  /**
   * Clear scanning data
   */
  clearScanningData() {
    this.scannedBoxBarcode = '';
    this.scannedBarcodes = [];
    this.boxBarcode = '';
    this.matchedBoxName = '';
    this.selectedLocation = null;
    this.selectedLocationString = '';
    this.currentBoxData = null;
    this.currentBatchData = null;
    this.currentScanningStep = null;
    
    // Clear persisted data from localStorage
    
    this.showToast('Scanning data cleared', 'info');
  }

  /**
   * Process scanning data
   */
  async processScanningData() {
    try {
      if (!this.scannedBoxBarcode || this.scannedBarcodes.length === 0) {
        this.showToast('No scanning data to process', 'warning');
        return;
      }

      // Find the first incomplete task to process
      const incompleteTask = this.tasks.find(task => !task.completed);
      
      if (incompleteTask) {
        // Create task scanning data entry
        const taskData = {
          taskId: incompleteTask.id,
          grnRef: incompleteTask.grnRef,
          itemId: incompleteTask.itemId,
          itemName: incompleteTask.itemName,
          boxBarcode: this.scannedBoxBarcode,
          boxProductName: this.matchedBoxName,
          scannedBarcodes: this.scannedBarcodes,
          toLocation: this.selectedLocation?.name || 'Not specified',
          toLocationId: this.selectedLocation?.id || null,
          timestamp: new Date().toISOString(),
          processed: true
        };
        
        // Add to task scanning data
        this.taskScanningData.push(taskData);
        
        // Mark task as completed
        this.markTaskAsCompleted(incompleteTask);
        
        this.showToast(`Successfully processed ${this.scannedBarcodes.length} batches for box ${this.scannedBoxBarcode}`, 'success');
        
        // Clear the scanning data after processing
        this.clearScanningData();
      } else {
        this.showToast('No incomplete tasks found to process', 'warning');
      }
    } catch (error) {
      console.error('Error processing scanning data:', error);
      this.showToast('Error processing scanning data', 'danger');
    }
  }

  /**
   * Proceed to batch scanning after box confirmation
   */
  async proceedToBatchScanning() {
    try {
      if (!this.currentBoxData) {
        this.showToast('No box data available', 'warning');
        return;
      }

      // Navigate back to camera scanner for batch scanning
      const grnId = this.route.snapshot.paramMap.get('inward');
      console.log('GRN detail grnId (inward):', grnId);
      if (grnId) {
        console.log('Navigating to camera-scanner with grnId:', grnId);
        this.router.navigate(['/camera-scanner', grnId], {
          state: {
            grnId: grnId,
            grnRef: this.grnRef,
            taskId: this.taskId,
            taskData: this.taskData,
            listType: this.listType,
            requition_no: this.requition_no,
            scanningMode: 'batch',
            boxData: this.currentBoxData,
            proceedToBatchScanning: true
          }
        }).catch(error => {
          console.error('Navigation error:', error);
          this.showToast('Error navigating to camera scanner', 'danger');
        });
      } else {
        this.showToast('GRN ID not found', 'danger');
      }
    } catch (error) {
      console.error('Error proceeding to batch scanning:', error);
      this.showToast('Error proceeding to batch scanning', 'danger');
    }
  }

  /**
   * Proceed to location selection after batch confirmation
   */
  async proceedToLocationSelection() {
    try {
      if (!this.currentBoxData || !this.currentBatchData) {
        this.showToast('Missing box or batch data', 'warning');
        return;
      }

      // Check if any batches were scanned
      if (this.scannedBarcodes.length === 0) {
        this.showToast('Please scan at least one batch before proceeding', 'warning');
        return;
      }

      // Set current scanning step
      this.currentScanningStep = 'location_selected';
      
      // Show location selection options
      this.showLocationSelection();
      
      this.showToast('Please select or scan a location for this box', 'info');
    } catch (error) {
      console.error('Error proceeding to location selection:', error);
      this.showToast('Error proceeding to location selection', 'danger');
    }
  }

  /**
   * Submit current box with all data
   */
  async submitCurrentBox() {
    try {
      if (!this.currentBoxData || !this.currentBatchData) {
        this.showToast('Missing box or batch data', 'warning');
        return;
      }

      // Check if any batches were scanned
      if (this.scannedBarcodes.length === 0) {
        this.showToast('Please scan at least one batch before submitting', 'warning');
        return;
      }

      if (!this.selectedLocation) {
        this.showToast('Please select a location first', 'warning');
        return;
      }

      // Create complete box submission data
      const boxSubmissionData = {
        boxBarcode: this.scannedBoxBarcode,
        boxProductName: this.matchedBoxName,
        boxGTIN: this.currentBoxData.boxGTIN,
        batches: this.scannedBarcodes,
        totalBatches: this.scannedBarcodes.length,
        location: this.selectedLocation,
        grnRef: this.grnRef,
        taskId: this.taskId,
        taskData: this.taskData,
        timestamp: new Date().toISOString()
      };

      // Add to task scanning data
      this.taskScanningData.push(boxSubmissionData);

      // Mark current task as completed if it exists
      const currentTask = this.tasks.find(task => 
        task.grnRef === this.grnRef && 
        task.itemId === this.taskData?.itemId
      );
      
      if (currentTask) {
        this.markTaskAsCompleted(currentTask);
      }

      // Set current scanning step
      this.currentScanningStep = 'box_submitted';

      this.showToast(`Box ${this.scannedBoxBarcode} submitted successfully with ${this.scannedBarcodes.length} batches`, 'success');

      // Clear current data
      this.clearCurrentBoxData();

      // Check if there are more boxes to process
      this.checkForNextBox();

    } catch (error) {
      console.error('Error submitting box:', error);
      this.showToast('Error submitting box', 'danger');
    }
  }

  /**
   * Clear current box data
   */
  clearCurrentBoxData() {
    this.scannedBoxBarcode = '';
    this.scannedBarcodes = [];
    this.boxBarcode = '';
    this.matchedBoxName = '';
    this.selectedLocation = null;
    this.selectedLocationString = '';
    this.currentBoxData = null;
    this.currentBatchData = null;
    this.currentScanningStep = null;
    
    // Clear persisted data from localStorage
  }

  /**
   * Check if there are more boxes to process
   */
  checkForNextBox() {
    const incompleteTasks = this.tasks.filter(task => !task.completed);
    
    if (incompleteTasks.length > 0) {
      this.showToast(`${incompleteTasks.length} more boxes to process`, 'info');
      // Show option to start next box
      this.showNextBoxOption();
    } else {
      this.showToast('All putaway tasks completed!', 'success');
      this.currentScanningStep = null;
    }
  }



  /**
   * Parse GS1 Data Matrix barcode format
   * Format: "(01)01234567890128(17)251231(10)BATCH123(21)000001"
   */
  private parseGS1DataMatrix(barcode: string, isBoxBarcode: boolean = false) {
    if (!barcode) return {};

    console.log('Parsing GS1 DataMatrix barcode:', barcode);

    const result: any = {
      rawValue: barcode,
      isBoxBarcode: isBoxBarcode
    };

    try {
      // Extract GTIN (01)
      const gtinMatch = barcode.match(/\(01\)(\d{14})/);
      if (gtinMatch) {
        result.gtin = gtinMatch[1];
        result.boxBarcode = gtinMatch[1];
      }

      // Extract expiry date (17)
      const expiryMatch = barcode.match(/\(17\)(\d{6})/);
      if (expiryMatch) {
        const expiryStr = expiryMatch[1];
        const year = '20' + expiryStr.substring(0, 2);
        const month = expiryStr.substring(2, 4);
        const day = expiryStr.substring(4, 6);
        result.expiryDate = `${year}-${month}-${day}`;
      }

      // Extract batch number (10)
      const batchMatch = barcode.match(/\(10\)([^(]+)/);
      if (batchMatch) {
        result.batchNumber = batchMatch[1];
      }

      // Extract serial number (21)
      const serialMatch = barcode.match(/\(21\)([^(]+)/);
      if (serialMatch) {
        result.serialNumber = serialMatch[1];
      }

      // For box barcodes, set additional properties
      if (isBoxBarcode) {
        result.boxProductName = result.gtin || 'Unknown Product';
        result.boxGTIN = result.gtin;
      }

      console.log('Parsed GS1 DataMatrix result:', result);
      return result;

    } catch (error) {
      console.error('Error parsing GS1 DataMatrix barcode:', error);
      return {
        rawValue: barcode,
        isBoxBarcode: isBoxBarcode,
        error: 'Failed to parse barcode'
      };
    }
  }



  /**
   * Reset all scanning data to initial state
   */
  private resetScanningData() {
    // Reset box scanning data
    this.scannedBoxBarcode = '';
    this.boxBarcode = '';
    this.matchedBoxName = '';
    this.boxBarcodeError = '';
    this.currentBoxData = null;
    
    // Reset batch scanning data
    this.scannedBarcodes = [];
    this.currentBatchData = null;
    
    // Reset location data
    this.selectedLocation = null;
    this.selectedLocationString = '';
    this.locationSearchTerm = '';
    this.showLocationModal = false;
    
    // Reset scanning steps
    this.currentScanningStep = null;
    this.isScanning = false;
    
    // Reset task scanning data
    this.taskScanningData = [];
    this.boxScanningData = [];
    this.currentTaskIndex = 0;
    this.currentBoxIndex = 0;
    this.currentTask = null;
    this.currentBox = null;
    this.currentTaskBoxes = [];
    
    console.log('Scanning data reset to initial state');
  }

  /**
   * Refresh tasks data from API
   */
  async refreshTasksData() {
    try {
      const user = this.authService.getCurrentUser();
      const token = this.authService.getToken();
      const inwardParam = this.route.snapshot.paramMap.get('inward');
      const inward = inwardParam ? Number(inwardParam) : null;
      
      if (user && user.company && token && inward) {
        const companyId = user.company;
        this.loading = true;
        
        this.http.post<any>(
          this.baseUrl+'/invoice/putaway-tasks-list/s=/',
          { company: companyId, id: inward }
        ).subscribe({
          next: (res) => {
            this.tasks = res.data || res;
            // Extract unique grnRef numbers
            this.uniqueGrnRefs = Array.from(new Set((this.tasks || []).map((task: any) => task.grnRef)));
            // Initialize currentRemaningQtyMap
            this.currentRemaningQtyMap = {};
            (this.tasks || []).forEach((task: any) => {
              this.currentRemaningQtyMap[task.item_barcode] = task.remaning_qty;
            });
            this.loading = false;
            console.log('Tasks data refreshed successfully');
          },
          error: (err) => {
            console.error('Error refreshing tasks data:', err);
            this.loading = false;
          }
        });
      }
    } catch (error) {
      console.error('Error refreshing tasks data:', error);
      this.loading = false;
    }
  }

  /**
   * Show option to start next box
   */
  showNextBoxOption() {
    // This will be handled by the UI showing the next box option
    this.currentScanningStep = 'ready_for_next_box';
  }

  /**
   * Start scanning next box
   */
  async startNextBox() {
    try {
      const incompleteTasks = this.tasks.filter(task => !task.completed);
      
      if (incompleteTasks.length === 0) {
        this.showToast('No more boxes to process', 'info');
        return;
      }

      // Get the next task
      const nextTask = incompleteTasks[0];
      
      // Navigate to camera scanner for next box
      const grnId = this.route.snapshot.paramMap.get('inward');
      if (grnId) {
        this.router.navigate(['/camera-scanner', grnId], {
          state: {
            grnId: grnId,
            grnRef: this.grnRef,
            taskId: nextTask.id,
            taskData: nextTask,
            listType: this.listType,
            requition_no: this.requition_no,
            scanningMode: 'box',
            startNewBox: true
          }
        }).catch(error => {
          console.error('Navigation error:', error);
          this.showToast('Error navigating to camera scanner', 'danger');
        });
      } else {
        this.showToast('GRN ID not found', 'danger');
      }
    } catch (error) {
      console.error('Error starting next box:', error);
      this.showToast('Error starting next box', 'danger');
    }
  }

  ionViewWillEnter() {
    // Check for scanning data from navigation state when page becomes visible
    const nav = window.history.state;
    if (nav && (nav.boxConfirmation || nav.batchScanning || nav.scanningCompleted || nav.boxData || nav.batches || nav.selectedLocation)) {
      // Only process navigation data if it contains scanning information
      this.handleScanningDataFromNavigation(nav);
    } else {
      // If no scanning data in navigation state, reset scanning data
      // this.resetScanningData();
    }
    
    // Refresh data when page becomes visible (e.g., returning from camera scanner)
    // this.refreshTasksData();
  }

  ngOnInit() {
    // Reset all scanning data on page load
    this.resetScanningData();
    
    // Get current user and token
    const user = this.authService.getCurrentUser();
    const token = this.authService.getToken();
    // Get the GRN id from the route (from the clicked list item)
    const inwardParam = this.route.snapshot.paramMap.get('inward');
    // Get navigation state for listType and requition_no
    const nav = window.history.state;
    this.listType = nav.listType ? Number(nav.listType) : null;
    this.requition_no = nav.requition_no || null;
    this.taskId = nav.taskId || null;
    this.taskData = nav.taskData || null;
    
    // Check for scanning data from camera scanner
    this.handleScanningDataFromNavigation(nav);
    
    // Convert inwardParam to number if possible
    const inward = inwardParam ? Number(inwardParam) : null;
    // Check all required values
    if (user && user.company && token && inward) {
      // Get company id from login response (user object)
      const companyId = user.company;
      this.loading = true;
      // API call: both company and id are set dynamically
      this.http.post<any>(
        this.baseUrl+'/invoice/putaway-tasks-list/s=/',
        { company: companyId, id: inward }
      ).subscribe({
        next: (res) => {
          this.tasks = res.data || res;
          // Extract unique grnRef numbers
          this.uniqueGrnRefs = Array.from(new Set((this.tasks || []).map((task: any) => task.grnRef)));
          // Initialize currentRemaningQtyMap
          this.currentRemaningQtyMap = {};
          (this.tasks || []).forEach((task: any) => {
            this.currentRemaningQtyMap[task.item_barcode] = task.remaning_qty;
          });
          this.loading = false;
        },
        error: (err) => {
          this.error = err?.error?.detail || 'Failed to load putaway tasks.';
          this.loading = false;
        }
      });
      // Fetch warehouse locations (company-specific if needed)
      this.http.get<any>(this.baseUrl+'/warehouses/warehouse-wise-location/1/').subscribe({
        next: (res) => {
          this.warehouseLocations = res.data || [];
        },
        error: (err) => {
          // Optionally handle error
        }
      });
    } else {
      this.error = 'No company or GRN information found.';
    }

    // Handle all scanning data from camera scanner
    this.router.events.subscribe(event => {
      if (event instanceof NavigationEnd) {
        const state = this.router.getCurrentNavigation()?.extras?.state;
        console.log('Navigation state received:', state);
        this.listType = state?.['listType'] ? Number(state['listType']) : null;
        
        if (state) {
          // Handle box confirmation data
          if (state['boxData'] && !state['batches']) {
            console.log('Handling box barcode scanned:', state);
            this.handleBoxBarcodeScanned(state);
          }
          // Handle batch scanning completion
          else if (state['batches']) {
            console.log('Handling batch scanning completion:', state);
            this.handleAutoCompleteTask(state);
            // Refresh tasks data after scanning completion
            this.refreshTasksData();
          }
          // Handle location barcode scanning
          else if (state['selectedLocation'] || state['scannedLocationBarcode']) {
            console.log('Handling location barcode scanned:', state);
            this.handleLocationBarcodeScanned(state);
          }
          // Handle general scanning data
          else if (state['boxConfirmation'] || state['batchScanning'] || state['scanningCompleted']) {
            console.log('Handling general scanning data:', state);
            this.handleScanningDataFromNavigation(state);
          }
        }
      }
    });
  }
  ionViewWillLeave() {
    const nav = window.history.state;
    this.listType = nav.listType ? Number(nav.listType) : null;
  }
  
  async loadWarehouseLocations() {
    try {
      // Load warehouse locations from API
      const response = await this.ap.getWarehouseLocations().toPromise();
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
        console.log('Using mock warehouse locations:', this.availableLocations);
      }
    } catch (error) {
      console.error('Error loading warehouse locations:', error);
      // Use mock data as fallback
      this.availableLocations = [
        { name: 'Zone A-1', barcode: 'ZONE_A_1', description: 'Main storage zone A' },
        { name: 'Zone A-2', barcode: 'ZONE_A_2', description: 'Secondary storage zone A' },
        { name: 'Zone B-1', barcode: 'ZONE_B_1', description: 'Main storage zone B' },
        { name: 'Zone B-2', barcode: 'ZONE_B_2', description: 'Secondary storage zone B' },
        { name: 'Zone C-1', barcode: 'ZONE_C_1', description: 'Main storage zone C' }
      ];
      console.log('Using fallback mock warehouse locations:', this.availableLocations);
    }
  }

  /**
   * Show location selector
  
  showLocationSelection() {
    if (this.decodedBarcodes.length === 0) {
      this.showToast('No barcodes to place. Please scan some barcodes first.', 'warning');
      return;
    }
    console.log('Showing location selector...');
    this.showLocationSelector = true;
    console.log('showLocationSelector set to:', this.showLocationSelector);
  }

  /**
   * Hide location selector
   */
  hideLocationSelection() {
    this.showLocationSelector = false;
    this.selectedLocation = '';
  }
  async startScanningWorkflow() {
    // Get the GRN ID from the current route
    const grnIdParam = this.route.snapshot.paramMap.get('inward');
    const grnId = grnIdParam ? Number(grnIdParam) : null;
    
    if (grnId) {
      const modal = await this.modalController.create({
        component: CameraScannerComponent,
        backdropDismiss: false,
        showBackdrop: true
      });
    } else {
      this.showToast('Invalid GRN ID for scanning workflow.');
    }
  }

  startAdvancedScanning() {
    // Get the GRN ID from the current route
    const grnIdParam = this.route.snapshot.paramMap.get('inward');
    const grnId = grnIdParam ? Number(grnIdParam) : null;
    
    if (grnId) {
      // Get the first GRN reference for context
      const grnRef = this.uniqueGrnRefs.length > 0 ? this.uniqueGrnRefs[0] : '';
      
      this.router.navigate(['/advanced-scanner', grnId], { 
        state: { 
          listType: this.listType, 
          requition_no: this.requition_no,
          grnRef: grnRef
        } 
      });
    } else {
      this.showToast('Invalid GRN ID for advanced scanning.');
    }
  }

  /**
   * Start sequential task scanning workflow
   */
  startSequentialTaskScanning() {
    if (!this.tasks || this.tasks.length === 0) {
      this.showToast('No tasks available for scanning', 'danger');
      return;
    }

    this.isTaskScanningMode = true;
    this.currentTaskIndex = 0;
    this.taskScanningData = [];
    this.boxScanningData = [];
    this.loadCurrentTask();
  }

  /**
   * Select a specific task for scanning
   */
  selectTaskForScanning(taskIndex: number) {
    this.currentTaskIndex = taskIndex;
    this.isTaskScanningMode = true;
    this.taskScanningData = [];
    this.boxScanningData = [];
    this.loadCurrentTask();
  }

  /**
   * Go back to task list
   */
  backToTaskList() {
    this.isTaskScanningMode = false;
    this.isBoxScanningMode = false;
    this.currentTask = null;
    this.currentBox = null;
    this.scannedBoxBarcode = '';
    this.scannedBarcodes = [];
  }

  /**
   * Check if a task is completed
   */
  isTaskCompleted(task: any): boolean {
    const completedBoxes = this.boxScanningData.filter(box => box.taskId === task.id).length;
    return completedBoxes >= task.quantity;
  }

  /**
   * Get completed boxes for a specific task
   */
  getTaskCompletedBoxes(task: any): number {
    return this.boxScanningData.filter(box => box.taskId === task.id).length;
  }

  /**
   * Get progress percentage for a task
   */
  getTaskProgress(task: any): number {
    const completed = this.getTaskCompletedBoxes(task);
    return Math.round((completed / task.quantity) * 100);
  }

  /**
   * Check if all tasks are completed
   */
  allTasksCompleted(): boolean {
    return this.tasks?.every(task => this.isTaskCompleted(task)) || false;
  }

  /**
   * Get location info for display
   */
  getLocationInfo(): string {
    if (this.selectedLocation) {
      return `${this.selectedLocation.name} (${this.selectedLocation.barcode})`;
    }
    return 'No location selected';
  }

  /**
   * Load current task for scanning
   */
  loadCurrentTask() {
    if (this.currentTaskIndex >= this.tasks.length) {
      this.finishSequentialTaskScanning();
      return;
    }

    this.currentTask = this.tasks[this.currentTaskIndex];
    this.scannedBoxBarcode = '';
    this.scannedBarcodes = [];
    this.boxBarcodeError = '';
    
    // Initialize box scanning for current task
    this.initializeBoxScanning();
  }

  /**
   * Initialize box scanning for current task
   */
  initializeBoxScanning() {
    if (!this.currentTask) return;
    
    // Create boxes based on quantity - each box represents a unit
    this.currentTaskBoxes = [];
    const quantity = this.currentTask.quantity || 1;
    
    for (let i = 0; i < quantity; i++) {
      this.currentTaskBoxes.push({
        id: `${this.currentTask.id}_box_${i + 1}`,
        taskId: this.currentTask.id,
        boxNumber: i + 1,
        totalBoxes: quantity,
        scannedBarcodes: [],
        boxBarcode: '',
        productName: '',
        gtin: '',
        isCompleted: false,
        submitted: false
      });
    }
    
    this.currentBoxIndex = 0;
    this.isBoxScanningMode = true;
    this.loadCurrentBox();
  }

  /**
   * Load current box for scanning
   */
  loadCurrentBox() {
    if (this.currentBoxIndex >= this.currentTaskBoxes.length) {
      this.finishCurrentTaskBoxes();
      return;
    }

    this.currentBox = this.currentTaskBoxes[this.currentBoxIndex];
    this.scannedBoxBarcode = '';
    this.scannedBarcodes = [];
    this.boxBarcodeError = '';
  }

  /**
   * Finish scanning all boxes for current task
   */
  finishCurrentTaskBoxes() {
    // All boxes for current task are completed
    this.isBoxScanningMode = false;
    this.currentBox = null;
    this.currentBoxIndex = 0;
    
    // Check if all tasks are completed
    const allTasksCompleted = this.tasks?.every(task => this.isTaskCompleted(task));
    
    if (allTasksCompleted) {
      this.showToast('All tasks completed successfully!', 'success');
      this.isTaskScanningMode = false;
      this.currentTask = null;
    } else {
      // Move to next task
      this.currentTaskIndex++;
      this.loadCurrentTask();
    }
  }

  /**
   * Scan box barcode for current task
   */
  async scanTaskBoxBarcode() {
    if (!this.currentTask) {
      this.showToast('No current task available', 'danger');
      return;
    }

    console.log('Scanning box barcode for task:', this.currentTask);
    
    // Navigate to camera scanner for box barcode scanning
    const grnId = this.route.snapshot.paramMap.get('inward');
    if (grnId) {
      this.router.navigate(['/camera-scanner', grnId], {
        state: {
          scanningMode: 'box',
          grnId: Number(grnId),
          taskId: this.currentTask.id,
          taskData: {
            ...this.currentTask,
            nextTaskIndex: this.currentTaskIndex + 1
          },
          grnRef: this.grnRef,
          boxProductName: this.currentTask.productName || '',
          boxGTIN: this.currentTask.gtin || '',
          listType: this.listType,
          requition_no: this.requition_no
        }
      });
    } else {
      this.showToast('GRN ID not found', 'danger');
    }
  }

  /**
   * Handle box barcode scanned from camera scanner
   */
  async handleBoxBarcodeScanned(state: any) {
    console.log('handleBoxBarcodeScanned', state);
    
    const scannedBoxBarcode = state['scannedBoxBarcode'];
    const boxProductName = state['boxProductName'];
    const boxGTIN = state['boxGTIN'];
    const parsedBoxData = state['parsedBoxData'];

    if (scannedBoxBarcode && this.currentTask) {
      // Update current task with box information
      this.scannedBoxBarcode = scannedBoxBarcode;
      this.currentTask.productName = boxProductName;
      this.currentTask.gtin = boxGTIN;
      
      // Parse and validate the box barcode
      this.parseBoxBarcodeForTask(scannedBoxBarcode);
      this.onTaskBoxBarcodeChange(scannedBoxBarcode);
      
      this.showToast('Box barcode scanned successfully!', 'success');
    }
  }

  /**
   * Parse box barcode to extract product information
   */
  parseBoxBarcodeForTask(barcodeString: string) {
    // Extract GTIN (01) - 14 digits
    const gtinMatch = barcodeString.match(/\(01\)(\d{14})/);
    if (gtinMatch) {
      const gtin = gtinMatch[1];
      // Store product name for current box
      if (this.currentBox) {
        this.currentBox.gtin = gtin;
        this.getProductNameFromGTIN(gtin).then(productName => {
          this.currentBox.productName = productName;
          console.log('Box product name for box:', this.currentBox.productName);
        });
      }
      // Also update current task for backward compatibility
      this.currentTask.productName = this.getProductNameFromGTIN(gtin);
      this.currentTask.gtin = gtin;
      console.log('Box product name for task:', this.currentTask.productName);
    }
  }

  /**
   * Get product name from GTIN
   */
  getProductNameFromGTIN(gtin: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.ap.post('/items/list-item/s='+gtin+"/", {
        company: this.ap.getUserCompany(),
      }).subscribe({
        next: (response: any) => {
          console.log(response);
          if(response.status == 200 && response.data && response.data.length > 0){
            this.currentTask.productName = response.data[0].name;
            resolve(response.data[0].name);
          } else {
            resolve('Unknown Product');
          }
        },
        error: (error: any) => {
          console.error('Error fetching item list:', error);
          this.showToast('Error', 'Failed to load items');
          resolve('Unknown Product');
        }
      });
    });
  }
  /**
   * Handle task box barcode change
   */
  onTaskBoxBarcodeChange(barcode: string) {
    this.scannedBoxBarcode = barcode;
    this.boxBarcodeError = '';
    
    if (barcode) {
      this.showToast(`Box barcode scanned: ${barcode}`, 'success');
    }
  }

  /**
   * Start scanning multiple barcodes for current task
   */
  async startTaskBarcodeScanning() {
    if (!this.scannedBoxBarcode) {
      this.showToast('Please scan box barcode first', 'warning');
      return;
    }

    // Navigate to camera scanner for this specific task
    const grnIdParam = this.route.snapshot.paramMap.get('inward');
    const grnId = grnIdParam ? Number(grnIdParam) : null;
    
    if (grnId) {
      this.router.navigate(['/advanced-scanner', grnId], { 
        state: { 
          listType: this.listType, 
          requition_no: this.requition_no,
          grnRef: this.uniqueGrnRefs[0],
          taskId: this.currentTask.id,
          boxBarcode: this.scannedBoxBarcode,
          boxProductName: this.currentTask.productName,
          boxGTIN: this.currentTask.gtin,
          taskData: {
            ...this.currentTask,
            nextTaskIndex: this.currentTaskIndex + 1
          }
        } 
      });
    }
  }

  /**
   * Handle return from camera scanner with scanned barcodes
   */
  handleTaskBarcodeScanningResult(result: any) {
    if (result && result.scannedBarcodes) {
      // Add location information to each scanned barcode
      this.scannedBarcodes = result.scannedBarcodes.map((barcode: any) => ({
        ...barcode,
        toLocation: this.selectedLocation?.name || '',
        toLocationId: this.selectedLocation?.id || null
      }));
      this.showToast(`Scanned ${result.scannedBarcodes.length} barcodes for task`, 'success');
    }
  }

  /**
   * Handle auto-completion from camera scanner
   */
  async handleAutoCompleteTask(state: any) {
    const completedTaskId = state['completedTaskId'];
    const nextTaskIndex = state['nextTaskIndex'] || 0;
    const scannedBarcodes = state['scannedBarcodes'] || [];

    if (completedTaskId) {
      // Add location information to each scanned barcode
      this.scannedBarcodes = scannedBarcodes.map((barcode: any) => ({
        ...barcode,
        toLocation: this.selectedLocation?.name || '',
        toLocationId: this.selectedLocation?.id || null
      }));
      
      // Mark current task as completed
      this.showToast(`Task completed successfully! Scanned ${scannedBarcodes.length} barcodes`, 'success');
      
      // Show submit option for current task
      this.showToast('Ready to submit current task data', 'info');
      
      // Don't move to next task automatically - let user submit first
      // The user can manually submit and then move to next task
    }
  }

  /**
   * Handle location barcode scanning result
   */
  async handleLocationBarcodeScanned(state: any) {
    const selectedLocation = state['selectedLocation'];
    const scannedLocationBarcode = state['scannedLocationBarcode'];

    if (selectedLocation) {
      // Location object was found and passed back
      this.selectedLocation = selectedLocation;
      this.selectedLocationString = selectedLocation.barcode || '';
      this.showToast(`Location selected: ${selectedLocation.name}`, 'success');
      
      // Update scanned barcodes with location information
      this.updateScannedBarcodesWithLocation();
      
      // Update scanning step
      this.currentScanningStep = 'location_selected';
    } else if (scannedLocationBarcode) {
      // Only barcode was scanned, need to find the location
      console.log('Searching for location with barcode:', scannedLocationBarcode);
      
      // Load locations if not already loaded
      if (this.availableLocations.length === 0) {
        await this.loadAvailableLocations();
      }
      
      const location = this.availableLocations.find(loc => loc.barcode === scannedLocationBarcode);
      if (location) {
        this.selectedLocation = location;
        this.selectedLocationString = location.barcode;
        this.showToast(`Location found: ${location.name}`, 'success');
        
        // Update scanned barcodes with location information
        this.updateScannedBarcodesWithLocation();
        
        // Update scanning step
        this.currentScanningStep = 'location_selected';
      } else {
        this.showToast('Location not found for this barcode', 'warning');
        console.log('Available locations:', this.availableLocations);
      }
    }
  }

  /**
   * Show location selection modal
   */
  showLocationSelection() {
    this.loadAvailableLocations();
    this.showLocationModal = true;
  }

  /**
   * Capture location barcode using camera scanner
   */
  async captureLocationBarcode() {
    const grnId = this.route.snapshot.paramMap.get('inward');
    try {
      // Navigate to camera scanner for single location barcode scanning
      this.router.navigate(['/camera-scanner', grnId], {
        state: {
          grnId: grnId,
          grnRef: this.currentTask?.grnRef || '',
          scanningMode: 'location_single',
          taskId: this.currentTask?.id,
          boxBarcode: this.scannedBoxBarcode,
          boxProductName: this.currentBox?.productName || this.currentTask?.productName,
          boxGTIN: this.currentBox?.gtin || this.currentTask?.gtin,
          taskData: this.currentTask,
          singleScan: true, // Indicate this is a single scan operation
          returnImmediately: true // Return immediately after scanning
        }
      });
    } catch (error) {
      console.error('Error navigating to location barcode scanner:', error);
      this.showToast('Failed to open location barcode scanner', 'danger');
    }
  }

  /**
   * Load available locations from API
   */
  loadAvailableLocations() {
    this.http.get<any>(this.baseUrl + '/warehouses/warehouse-wise-location/1/').subscribe({
      next: (response) => {
        this.availableLocations = response.data || response || [];
        console.log('Available locations:', this.availableLocations);
      },
      error: (error) => {
        console.error('Error loading locations:', error);
        this.showToast('Failed to load locations', 'danger');
      }
    });
  }

  /**
   * Filter locations based on search term
   */
  get filteredLocations() {
    if (!this.locationSearchTerm) {
      return this.availableLocations;
    }
    return this.availableLocations.filter(location =>
      location.name.toLowerCase().includes(this.locationSearchTerm.toLowerCase()) ||
      location.description?.toLowerCase().includes(this.locationSearchTerm.toLowerCase()) ||
      location.barcode.toLowerCase().includes(this.locationSearchTerm.toLowerCase())
    );
  }

  /**
   * Select a location
   */
  selectLocation(location: any) {
    this.selectedLocation = location;
    this.showLocationModal = false;
    this.locationSearchTerm = '';
    
    // Update existing scanned barcodes with location information
    this.updateScannedBarcodesWithLocation();
    
    // Persist location selection
  }

  /**
   * Update scanned barcodes with current location information
   */
  updateScannedBarcodesWithLocation() {
    if (this.selectedLocation && this.scannedBarcodes.length > 0) {
      this.scannedBarcodes = this.scannedBarcodes.map(barcode => ({
        ...barcode,
        toLocation: this.selectedLocation.name,
        toLocationId: this.selectedLocation.id
      }));
    }
  }

  /**
   * Close location modal
   */
  closeLocationModal() {
    this.showLocationModal = false;
    this.selectedLocation = null;
    this.locationSearchTerm = '';
  }

  /**
   * Submit current box data
   */
  async submitCurrentBoxData() {
    if (!this.currentBox || !this.scannedBoxBarcode) {
      this.showToast('Please complete scanning for current box', 'warning');
      return;
    }

    // Check if location is selected
    if (!this.selectedLocation) {
      this.showToast('Please select a location before submitting', 'warning');
      this.showLocationSelection();
      return;
    }

    // Ensure scanned barcodes have location information
    const scannedBarcodesWithLocation = this.scannedBarcodes.map(barcode => ({
      ...barcode,
      toLocation: this.selectedLocation.name,
      toLocationId: this.selectedLocation.id
    }));
    const allTasksCompleted = this.tasks?.every(task => this.isTaskCompleted(task));
    console.log(this.currentBox.totalBoxes,"this.currentBox.totalBoxes",allTasksCompleted);
    const boxData = {
      // boxId: this.currentBox.id,
      taskId: this.currentTask.id,
      grnRef: this.currentTask.grnRef,
      itemId: this.currentTask.itemId,
      itemName: this.currentTask.itemName,
      // productName: this.currentBox.productName || this.currentTask.productName,
      boxBarcode: this.scannedBoxBarcode,
      scanned_barcodes: scannedBarcodesWithLocation,
      toLocation: this.selectedLocation.name,
      toLocationId: this.selectedLocation.id,
      boxNumber: this.currentBox.boxNumber,
      totalBoxes: this.currentBox.totalBoxes,
      status:allTasksCompleted ? 4: 3,
      timestamp: new Date().toISOString(),
      company:this.ap.getUserCompany(),
      type:this.listType
    };
    if(this.currentBox.totalBoxes == this.currentBox.boxNumber){
      boxData.status = 4;
    }
    console.log('Submitting box data:', boxData);
    
    try {
      const response = await this.http.post<any>(this.baseUrl+'/invoice/grn-create/', boxData).toPromise();
      console.log('Box submission response:', response);
      
      if (response.status === 200) {
        // Mark current box as completed and submitted
        this.currentBox.isCompleted = true;
        this.currentBox.submitted = true;
        this.currentBox.scannedBarcodes = [...scannedBarcodesWithLocation];
        this.currentBox.boxBarcode = this.scannedBoxBarcode;
        this.currentBox.selectedLocation = this.selectedLocation;
        
        this.boxScanningData.push(boxData);
        
        this.showToast(`Box ${this.currentBox.boxNumber} of ${this.currentBox.totalBoxes} submitted: ${this.scannedBarcodes.length} barcodes scanned`, 'success');
        
        // Reset location selection for next box
        this.selectedLocation = null;
        
        // Move to next box
        this.currentBoxIndex++;
        this.loadCurrentBox();
        
      } else {
        this.showToast('Failed to submit box data. Please try again.', 'danger');
      }
    } catch (error) {
      console.error('Error submitting box data:', error);
      this.showToast('Failed to submit box data. Please try again.', 'danger');
    }
  }

  /**
   * Submit current task data (legacy method for backward compatibility)
   */
  async submitCurrentTaskData() {
    // Redirect to box submission
    await this.submitCurrentBoxData();
  }

  /**
   * Get total number of scanned barcodes across all tasks
   */
  getTotalScannedBarcodes(): number {
    return this.boxScanningData.reduce((total, box) => {
      return total + (box.scanned_barcodes?.length || 0);
    }, 0);
  }

  /**
   * Get total number of boxes across all tasks
   */
  getTotalBoxes(): number {
    return this.tasks?.reduce((total, task) => {
      return total + (task.quantity || 1);
    }, 0) || 0;
  }

  /**
   * Get completed boxes count
   */
  getCompletedBoxes(): number {
    // Count completed tasks (each task represents a box)
    return this.tasks?.filter(task => task.completed).length || 0;
  }

  /**
   * Place all scanned items in their designated locations
   */
  async placeItemsInLocations() {
    if (this.taskScanningData.length === 0) {
      this.showToast('No scanned data to place', 'warning');
      return;
    }

    try {
      // Group barcodes by location
      const locationGroups = new Map<string, any[]>();
      
      this.taskScanningData.forEach(task => {
        const location = task.toLocation || 'Default Location';
        if (!locationGroups.has(location)) {
          locationGroups.set(location, []);
        }
        locationGroups.get(location)!.push(...task.scannedBarcodes);
      });

      // Place barcodes in each location
      for (const [location, barcodes] of locationGroups) {
        try {
          const response = await this.http.post<any>(this.baseUrl+'/warehouses/update-item-location/', {
            scanned_barcodes: this.taskScanningData,
            boxGrn:this.uniqueGrnRefs[0],
            location:location,
            putawayitemid:this.route.snapshot.paramMap.get('inward')
          }).toPromise();

          if (response && response.success) {
            this.showToast(`Placed ${barcodes.length} barcodes in ${location}`, 'success');
          } else {
            this.showToast(`Failed to place barcodes in ${location}`, 'danger');
          }
        } catch (error) {
          console.error(`Error placing barcodes in ${location}:`, error);
          this.showToast(`Failed to place barcodes in ${location}`, 'danger');
        }
      }

      // Clear scanning data after successful placement
      this.taskScanningData = [];
      this.showToast('All items placed successfully!', 'success');
      
    } catch (error) {
      console.error('Error placing items:', error);
      this.showToast('Failed to place items in locations', 'danger');
    }
  }

  /**
   * View scanning summary
   */
  viewScanningSummary() {
    // This could open a modal or navigate to a summary page
    this.showToast('Scanning summary feature coming soon', 'info');
    this.router.navigate(['/scanning-summary'], {
      state: {
        boxScanningData: this.boxScanningData,
        taskScanningData: this.taskScanningData
      }
    });
  }

  /**
   * Start a new scanning session
   */
  startNewScanningSession() {
    this.goBack();
    this.taskScanningData = [];
    this.currentTaskIndex = 0;
    this.scannedBoxBarcode = '';
    this.scannedBarcodes = [];
    this.showToast('Ready for new scanning session', 'info');
  }

  /**
   * Finish sequential task scanning and submit all data
   */
  async finishSequentialTaskScanning() {
    if (this.boxScanningData.length === 0) {
      this.showToast('No box data to submit', 'warning');
      return;
    }
    console.log('Final box scanning data:', this.boxScanningData);
    try {
      // Submit all box data to backend
      const response = await this.http.post<any>(this.baseUrl+'/tasks/submit-scanning-data/', {
        grnRef: this.uniqueGrnRefs[0],
        boxes: this.boxScanningData,
        totalBoxes: this.boxScanningData.length
      }).toPromise();

      if (response.success) {
        this.showToast(`Successfully submitted ${this.boxScanningData.length} boxes across all tasks`, 'success');
        this.isTaskScanningMode = false;
        this.isBoxScanningMode = false;
        this.taskScanningData = [];
        this.boxScanningData = [];
        this.currentTaskIndex = 0;
        this.currentBoxIndex = 0;
        this.currentTask = null;
        this.currentBox = null;
        // Tasks will be refreshed on next page load
      } else {
        throw new Error(response.error || 'Failed to submit box data');
      }
    } catch (error) {
      console.error('Error submitting box data:', error);
      this.showToast('Failed to submit box data', 'danger');
    }
  }

  /**
   * Cancel sequential task scanning
   */
  cancelSequentialTaskScanning() {
    this.isTaskScanningMode = false;
    this.isBoxScanningMode = false;
    this.currentTaskIndex = 0;
    this.currentBoxIndex = 0;
    this.taskScanningData = [];
    this.boxScanningData = [];
    this.currentTask = null;
    this.currentBox = null;
    this.currentTaskBoxes = [];
    this.scannedBoxBarcode = '';
    this.scannedBarcodes = [];
  }

  processMultipleBoxBarcodes(barcodes: any[]) {
    const validBoxes: any[] = [];
    const invalidBarcodes: string[] = [];
    
    barcodes.forEach(barcode => {
      const barcodeValue = barcode.rawValue || '';
      const matchedBox = (this.tasks || []).find(task => task.item_barcode === barcodeValue);
      
      if (matchedBox) {
        validBoxes.push(matchedBox);
      } else {
        invalidBarcodes.push(barcodeValue);
      }
    });
    
    if (validBoxes.length > 0) {
      // Use the first valid box
      this.boxBarcode = validBoxes[0].item_barcode;
      this.matchedBoxName = validBoxes[0].itemName;
      this.boxBarcodeError = '';
      
      if (validBoxes.length > 1) {
        this.showToast(`Found ${validBoxes.length} valid boxes. Using: ${validBoxes[0].itemName}`);
      } else {
        this.showToast(`Box scanned: ${validBoxes[0].itemName}`);
      }
    }
    
    if (invalidBarcodes.length > 0) {
      this.boxBarcodeError = `Invalid barcodes: ${invalidBarcodes.join(', ')}`;
    }
  }

  onBoxBarcodeChange(barcode: string | number | null | undefined) {
    this.boxBarcode = (barcode ?? '').toString();
    const matchedBox = (this.tasks || []).find(task => task.item_barcode === this.boxBarcode);
    if (matchedBox) {
      this.matchedBoxName = matchedBox.itemName;
      this.boxBarcodeError = '';
    } else if (this.boxBarcode) {
      this.matchedBoxName = '';
      this.boxBarcodeError = 'Box barcode does not match in this GRN number';
    } else {
      this.matchedBoxName = '';
      this.boxBarcodeError = '';
    }
  }

  async scanBoxBarcode() {
    console.log('Starting box barcode scan...');
    
    if (!Capacitor.isNativePlatform()) {
      // For development/testing - simulate scanning
      this.boxBarcode = 'TEST_BOX_' + Date.now();
      this.onBoxBarcodeChange(this.boxBarcode);
      return;
    }

    // Try ZXing first (works better on mobile)
    try {
      await this.scanWithZXing();
    } catch (err) {
      console.log('ZXing failed, trying Capacitor MLKit...', err);
      // Fallback to Capacitor MLKit
      await this.scanWithCapacitorMLKit();
    }
  }

  async scanWithZXing() {
    // const codeReader = new BrowserMultiFormatReader();
    
    // try {
    //   // Get available video input devices
    //   const videoInputDevices = await BrowserMultiFormatReader.listVideoInputDevices();
      
    //   if (videoInputDevices.length === 0) {
    //     throw new Error('No camera devices found');
    //   }

    //   this.isScanning = true;
    //   const selectedDeviceId = videoInputDevices[0].deviceId;

    //   // Create a temporary video element
    //   const videoElement = document.createElement('video');
    //   videoElement.id = 'temp-video';
    //   videoElement.style.position = 'fixed';
    //   videoElement.style.top = '0';
    //   videoElement.style.left = '0';
    //   videoElement.style.width = '100%';
    //   videoElement.style.height = '100%';
    //   videoElement.style.zIndex = '9999';
    //   videoElement.style.objectFit = 'cover';
    //   document.body.appendChild(videoElement);

    //   // Start scanning
    //   codeReader.decodeFromVideoDevice(selectedDeviceId, videoElement, (result, err) => {
    //     if (result) {
    //       this.ngZone.run(() => {
    //         const scannedBarcode = result.getText();
            
    //         // Check if we're in task scanning mode
    //         if (this.isTaskScanningMode && this.currentTask) {
    //           this.scannedBoxBarcode = scannedBarcode;
    //           this.parseBoxBarcodeForTask(this.scannedBoxBarcode);
    //           this.onTaskBoxBarcodeChange(this.scannedBoxBarcode);
    //           this.showToast('Box barcode scanned successfully', 'success');
    //         } else {
    //           // Regular box scanning
    //           this.boxBarcode = scannedBarcode;
    //           this.onBoxBarcodeChange(this.boxBarcode);
    //           this.showToast('Barcode scanned successfully');
    //         }
            
    //         this.isScanning = false;
    //         // Stop scanning
    //         if (document.body.contains(videoElement)) {
    //           document.body.removeChild(videoElement);
    //         }
    //       });
    //     }
    //     if (err && !(err instanceof Error)) {
    //       console.error('ZXing scanning error:', err);
    //     }
    //   });

    //   // Timeout after 15 seconds
    //   setTimeout(() => {
    //     if (this.isScanning) {
    //       this.isScanning = false;
    //       // Stop scanning
    //       if (document.body.contains(videoElement)) {
    //         document.body.removeChild(videoElement);
    //       }
    //       this.showToast('Scan timed out');
    //     }
    //   }, 15000);

    // } catch (error) {
    //   console.error('ZXing error:', error);
    //   throw error;
    // }
  }

  async scanWithCapacitorMLKit() {
    console.log('Checking camera permissions...');
    const hasPermission = await this.ensureCameraPermission();
    if (!hasPermission) {
      this.showToast('Camera permission is required for scanning.');
      return;
    }

    console.log('Starting barcode scanner...');
    document.body.classList.add('barcode-scanner-active');
    this.isScanning = true;
    let listener: any = null;
    let timeoutId: any = null;

    try {
      // Add listener first
      listener = await BarcodeScanner.addListener('barcodeScanned', (result: any) => {
        console.log('Barcode scanned:', result);
        this.ngZone.run(() => {
          // Handle multiple barcodes from single scan
          if (result.barcodes && result.barcodes.length > 0) {
            if (this.isTaskScanningMode && this.currentTask) {
              // For task scanning, take the first barcode
              const scannedBarcode = result.barcodes[0].rawValue || '';
              this.scannedBoxBarcode = scannedBarcode;
              this.parseBoxBarcodeForTask(this.scannedBoxBarcode);
              this.onTaskBoxBarcodeChange(this.scannedBoxBarcode);
              this.showToast('Box barcode scanned successfully', 'success');
            } else {
              this.processMultipleBoxBarcodes(result.barcodes);
            }
          } else if (result.barcode) {
            const scannedBarcode = result.barcode.rawValue || '';
            
            if (this.isTaskScanningMode && this.currentTask) {
              this.scannedBoxBarcode = scannedBarcode;
              this.parseBoxBarcodeForTask(this.scannedBoxBarcode);
              this.onTaskBoxBarcodeChange(this.scannedBoxBarcode);
              this.showToast('Box barcode scanned successfully', 'success');
            } else {
              this.boxBarcode = scannedBarcode;
              this.onBoxBarcodeChange(this.boxBarcode);
            }
          }
          this.isScanning = false;
          document.body.classList.remove('barcode-scanner-active');
          BarcodeScanner.stopScan();
          if (listener) listener.remove();
        });
      });

      // Start scanning
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

      console.log('Barcode scanner started successfully');

      timeoutId = setTimeout(() => {
        if (this.isScanning) {
          console.log('Scan timeout reached');
          this.isScanning = false;
          document.body.classList.remove('barcode-scanner-active');
          this.showToast('Scan timed out.');
          if (listener) listener.remove();
          BarcodeScanner.stopScan();
        }
      }, 15000);
    } catch (err) {
      console.error('Barcode scanning error:', err);
      this.isScanning = false;
      document.body.classList.remove('barcode-scanner-active');
      if (timeoutId) clearTimeout(timeoutId);
      if (listener) listener.remove();
      BarcodeScanner.stopScan();
      this.showToast('Scanning failed: ' + (err as any).message, 'danger');
    }
  }

  ngOnChanges() {
    // Not used, but placeholder if needed for future
  }

  // Add this method to update confirmedItems when both itemBarcode and locationBarcode are set
  updatePendingDoubleTick() {
    if (this.itemBarcode && this.locationBarcode) {
      const pendingItem = (this.tasks || []).find(task => task.item_barcode === this.itemBarcode);
      const pendingLocation = (this.warehouseLocations || []).find(loc => loc.barcode === this.locationBarcode);
      if (pendingItem && pendingLocation) {
        const existingIndex = this.confirmedItems.findIndex(row => row.name === pendingItem.itemName && row.total === pendingItem.quantity);
        // If no row found, or the found row has status 'both', create a new row
        if (existingIndex === -1 || this.confirmedItems[existingIndex].status === 'both') {
          this.confirmedItems.push({
            name: pendingItem.itemName,
            quantity: 0,
            total: pendingItem.quantity,
            locationName: pendingLocation.name,
            status: 'both'
          });
        } else {
          // Update location and status if needed
          this.confirmedItems[existingIndex].locationName = pendingLocation.name;
          this.confirmedItems[existingIndex].status = 'both';
        }
      }
    }
  }

  // Call updatePendingDoubleTick whenever itemBarcode or locationBarcode changes
  onLocationBarcodeChange(barcode: string | number | null | undefined) {
    this.locationBarcode = (barcode ?? '').toString();
    console.log('Scanned Location Barcode:', this.locationBarcode);

    // Find location in warehouseLocations
    const matchedLocation = this.warehouseLocations.find(
      loc => loc.barcode === this.locationBarcode
    );

    if (!matchedLocation) {
      this.showToast('Invalid location scanned');
      return;
    }

    console.log('Matched Location:', matchedLocation);

    // Debug itemLocations
    console.log('Item Locations Array:', this.itemLocations);

    // Check if location is valid
    let isLocationValid = false;
    if (Array.isArray(this.itemLocations) && this.itemLocations.length > 0) {
      isLocationValid = this.itemLocations.some(
        (loc: any) => Number(loc.location) === Number(matchedLocation.id)
      );
    } else {
      console.warn('itemLocations is empty or not an array!');
    }

    console.log(
      `Checking if location ${matchedLocation.id} exists in itemLocations ->`,
      isLocationValid,
      '| Expected Location IDs:',
      this.itemLocations.map((x: any) => x.location)
    );

    if (!isLocationValid) {
      this.showToast('This item does not belong to this location. Please scan again.');
      this.locationError = 'This item does not belong to this location. Please scan again.';
      this.locationBarcode = '';
      return;
    }

    console.log('Location matched successfully!');

    // Find the matched item
    const matchedItem = this.tasks.find(task => task.item_barcode === this.itemBarcode);
    console.log('Matched Item:', matchedItem);

    if (matchedItem) {
      // Find the last row for this item
      const lastIndex = [...this.confirmedItems]
        .map((row, idx) => ({ row, idx }))
        .filter(obj => obj.row.name === matchedItem.itemName)
        .map(obj => obj.idx)
        .pop();

      if (lastIndex !== undefined) {
        this.confirmedItems[lastIndex].locationName = matchedLocation.name;
        this.confirmedItems[lastIndex].status = 'both';
        this.confirmedItems = [...this.confirmedItems]; // Force UI update
      }
      // No new row creation here!
    }
  }
  
  onItemBarcodeChange(barcode: string | number | null | undefined) {
    this.itemBarcode = (barcode ?? '').toString();
    const matchedItem = (this.tasks || []).find(task => task.item_barcode === this.itemBarcode);
    if (matchedItem) {
      this.matchedItemName = matchedItem.itemName;
      this.itemBarcodeError = '';
      // Clear location input and matched locations when a new item is scanned
      this.locationBarcode = '';
      this.matchedLocations = [];
      // Show quantity modal
      this.manualQuantity = null;
      this.showQuantityModal = true;
      this.quantityModalError = '';

      // --- Call item-wise-locations API ---
      this.http.get(`${this.baseUrl}/items/item-wise-locations/${matchedItem.itemId}/`).subscribe({
        next: (res:any) => {
          this.itemLocations = res.data;
          console.log('Item-wise locations:', res);
        },
        error: (err) => {
          console.error('Failed to fetch item-wise locations', err);
        }
      });
      // --- End API call ---
    } else if (this.itemBarcode) {
      this.matchedItemName = '';
      this.itemBarcodeError = 'Item barcode does not match in this GRN number';
    } else {
      this.matchedItemName = '';
      this.itemBarcodeError = '';
    }
  }

  get currentItemQuantity(): number {
    const matchedItem = (this.tasks || []).find(task => task.item_barcode === this.itemBarcode);
    return matchedItem ? matchedItem.remaning_qty : 0;
  }

  onQuantityInputChange(value: any) {
    let inputValue = value;
    if (typeof value === 'object' && value && value.target) {
      inputValue = value.target.value;
    }
    const matchedItem = (this.tasks || []).find(task => task.item_barcode === this.itemBarcode);
    // Use currentRemaningQtyMap for up-to-date remaning_qty
    const remaningQty = matchedItem ? this.currentRemaningQtyMap[matchedItem.item_barcode] : 0;
    const enteredQty = Number(inputValue);
    this.manualQuantity = isNaN(enteredQty) ? null : enteredQty;
    if (this.manualQuantity === null || this.manualQuantity <= 0) {
      this.quantityModalError = 'Enter a valid quantity.';
    } else if (this.manualQuantity > remaningQty) {
      this.quantityModalError = 'Entered quantity exceeds remaining quantity.';
    } else {
      this.quantityModalError = '';
    }
  }

  confirmQuantity() {
    if (this.quantityModalError || this.manualQuantity === null) return;
    this.confirmedQuantity = this.manualQuantity;
    this.showQuantityModal = false;
    const matchedItem = (this.tasks || []).find(task => task.item_barcode === this.itemBarcode);
    if (matchedItem) {
      const totalQty = matchedItem.quantity;
      // Calculate remaining quantity for this item before adding this row
      const prevConfirmed = this.confirmedItems
        .filter(ci => ci.name === matchedItem.itemName)
        .reduce((sum, ci) => sum + (ci.quantity || 0), 0);
      const remaning = matchedItem.remaning_qty - prevConfirmed - this.manualQuantity;
      this.confirmedItems.push({
        name: matchedItem.itemName,
        quantity: this.manualQuantity,
        total: totalQty,
        remaning: remaning < 0 ? 0 : remaning,
        locationName: '',
        status: 'item'
      });
    }
  }

  get canSubmit(): boolean {
    // Enable submit if at least one confirmed item with status 'both',
    // or if a currently scanned item and location are both set
    const hasConfirmed = this.confirmedItems.length > 0 && this.confirmedItems.every(row => row.status === 'both');
    const hasPending = !!(this.itemBarcode && this.locationBarcode);
    return hasConfirmed || hasPending;
  }

  closeQuantityModal() {
    this.showQuantityModal = false;
  }

  onSubmit() {
    // Find the matched item from tasks
    if (!this.canSubmit) return;

    // Only include confirmed items with status 'both'
    let location_list = this.confirmedItems
      .filter(row => row.status === 'both')
      .map(row => {
        const matchedItem = (this.tasks || []).find(task => task.itemName === row.name && task.quantity === row.total);
        const matchedLocation = (this.warehouseLocations || []).find(loc => loc.name === row.locationName || loc.barcode === this.locationBarcode);
        // Use the stored remaning value for this row
        const remaning_qty = row['remaning'];
        const enteredQty = row.quantity;
        return {
          location: matchedLocation ? matchedLocation.id : null,
          putaway: matchedItem ? matchedItem.id : null,
          item: matchedItem ? matchedItem.itemId : null,
          quantity: enteredQty,
          remaning_qty: remaning_qty
        };
      });

    // If there is a pending (not-yet-confirmed) item and location, add it to location_list
    if (this.itemBarcode && this.locationBarcode) {
      const pendingItem = (this.tasks || []).find(task => task.item_barcode === this.itemBarcode);
      const pendingLocation = (this.warehouseLocations || []).find(loc => loc.barcode === this.locationBarcode);
      // Only add if not already in confirmedItems
      const alreadyConfirmed = this.confirmedItems.some(row => row.name === pendingItem?.itemName && row.status === 'both');
      if (pendingItem && pendingLocation && !alreadyConfirmed) {
        location_list.push({
          location: pendingLocation.id,
          putaway: pendingItem.id,
          item: pendingItem.itemId,
          quantity: 0, // or prompt for quantity if needed
          remaning_qty: pendingItem.remaning_qty
        });
      }
    }

    // Use the first matched item as the main payload (as in your API example)
    const matchedItem = (this.tasks || []).find(task => task.itemName === (this.confirmedItems[0]?.name || '') && task.quantity === (this.confirmedItems[0]?.total || 0));
    if (!matchedItem && location_list.length === 0) {
      this.error = 'Could not find item for submission.';
      return;
    }

    const payload = {
      ...(matchedItem || {}),
      location_list
    };

    this.loading = true;
    this.http.post(this.baseUrl+'/invoice/update-item-location/', payload).subscribe({
      next: async (res: any) => {
        this.loading = false;
        if (res?.status === 200 || res?.data === 'Transfer Successful') {
          await this.showToast('Location updated successfully!', 'success');
          this.resetItemEntry(true);
        } else {
          await this.showToast('Update failed. Please try again.', 'danger');
        }
      },
      error: async (err) => {
        this.loading = false;
        const errorMessage = err?.error?.error || err?.error?.detail || 'Failed to update location.';
        await this.showToast(errorMessage, 'danger');
      }
    });
    
  }

  resetItemEntry(clearTable: boolean = true) {
    this.itemBarcode = '';
    this.locationBarcode = '';
    this.matchedItemName = '';
    this.matchedLocations = [];
    this.itemBarcodeError = '';
    this.locationError = '';
    this.manualQuantity = null;
    this.showQuantityModal = false;
    this.quantityModalError = '';
    this.confirmedQuantity = null;
    this.confirmedName = '';
    if (clearTable) {
      this.confirmedItems = [];
    }
  }

  async showSuccessToast(message: string, color: string) {
    const toast = await this.toastController.create({
      message,
      duration: 2000,
      color,
      position: 'top'
    });
    toast.present();
  }
  

  getConfirmedItem(item: any) {
    return this.confirmedItems.find(
      ci => ci.name === item.itemName && ci.total === item.quantity
    );
  }

  getPendingLocation(item: any) {
    // If the item is the currently scanned item, return the entered locationBarcode
    if (this.itemBarcode && item.item_barcode === this.itemBarcode && this.locationBarcode) {
      // Try to get the location name from matchedLocations or warehouseLocations
      const matchedLoc = (this.warehouseLocations || []).find(loc => loc.barcode === this.locationBarcode);
      return matchedLoc ? matchedLoc.name : this.locationBarcode;
    }
    return undefined;
  }

  // Helper to get up-to-date remaning_qty for table display
  getCurrentRemaningQty(item: any): number {
    return this.currentRemaningQtyMap[item.item_barcode] ?? item.remaning_qty;
  }

  // Utility to get dynamic remaining quantity for an item
  getRemainingQty(itemName: string): number {
    const task = (this.tasks || []).find(t => t.itemName === itemName);
    if (!task) return 0;
    const total = task.remaning_qty;
    // Subtract all confirmed quantities for this item
    const used = this.confirmedItems
      .filter(ci => ci.name === itemName)
      .reduce((sum, ci) => sum + (ci.quantity || 0), 0);
    return total - used;
  }

  async ensureCameraPermission(): Promise<boolean> {
    try {
      const status = await BarcodeScanner.checkPermissions();
      console.log('Camera permission status:', status);
      
      if (status.camera !== 'granted') {
        console.log('Requesting camera permission...');
        const request = await BarcodeScanner.requestPermissions();
        console.log('Camera permission request result:', request);
        
        if (request.camera === 'denied') {
          this.showToast('Camera permission is required for scanning. Please enable it in settings.', 'danger');
          return false;
        }
        
        return request.camera === 'granted';
      }
      return true;
    } catch (error) {
      console.error('Camera permission error:', error);
      this.showToast('Failed to check camera permissions: ' + error, 'danger');
      return false;
    }
  }

  // Scan for item barcode
  // async scanItemBarcode() {
  //   if (!Capacitor.isNativePlatform()) {
  //     this.showToast('Barcode scanning only works on a real device.');
  //     return;
  //   }
  //   const hasPermission = await this.ensureCameraPermission();
  //   if (!hasPermission) {
  //     this.showToast('Camera permission is required for scanning.');
  //     return;
  //   }
  //   document.body.classList.add('barcode-scanner-active');
  //   this.isScanning = true;
  //   let listener: any = null;
  //   let timeoutId: any = null;
  //   try {
  //     listener = await BarcodeScanner.addListener('barcodeScanned', (result: any) => {
  //       console.log('barcodeScanned12345', result,result.barcode.rawValue);
  //       this.itemBarcode = result.barcode.rawValue || '';
  //     this.isScanning = false;
  //       document.body.classList.remove('barcode-scanner-active');
  //       // if (timeoutId) clearTimeout(timeoutId);
  //     // if (result.barcodes && result.barcodes.length > 0) {
  //     //   this.itemBarcode = result.barcodes[0].rawValue || '';
  //     //   this.onItemBarcodeChange(this.itemBarcode);
  //     //   } else {
  //     //     this.showToast('No barcode found.');
  //     //   }
  //       // listener.remove();
  //       BarcodeScanner.stopScan();
  //       if (listener) listener.remove(); // <-- Ensure listener is removed after scan
  //       console.log('barcodeScannedstoped', this.itemBarcode);
  //     });
  //     await BarcodeScanner.startScan({
  //       formats: [
  //         BarcodeFormat.Code128,
  //         BarcodeFormat.Ean13,
  //         BarcodeFormat.Ean8,
  //         BarcodeFormat.UpcA,
  //         BarcodeFormat.UpcE,
  //         BarcodeFormat.QrCode,
  //         BarcodeFormat.Pdf417,
  //         BarcodeFormat.DataMatrix,
  //         BarcodeFormat.Aztec,
  //         BarcodeFormat.Codabar,
  //         BarcodeFormat.Code39,
  //         BarcodeFormat.Code93,
  //         BarcodeFormat.Itf
  //       ]
  //     });
  //     // Timeout after 15 seconds
  //     timeoutId = setTimeout(() => {
  //       if (this.isScanning) {
  //         this.isScanning = false;
  //         document.body.classList.remove('barcode-scanner-active');
  //         this.showToast('Scan timed out.');
  //         if (listener) listener.remove();
  //         BarcodeScanner.stopScan();
  //       }
  //     }, 15000);
  //   } catch (err) {
  //     this.isScanning = false;
  //     document.body.classList.remove('barcode-scanner-active');
  //     if (timeoutId) clearTimeout(timeoutId);
  //     if (listener) listener.remove();
  //     BarcodeScanner.stopScan();
  //     this.showToast('Scanning cancelled or failed.');
  //   }
  // }

  async scanItemBarcode() {
    if (!Capacitor.isNativePlatform()) {
      this.showToast('Barcode scanning only works on a real device.');
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
          this.itemBarcode = result.barcode.rawValue || '';
          this.onItemBarcodeChange(this.itemBarcode);  // ✅ Trigger modal logic immediately
          this.isScanning = false;
          document.body.classList.remove('barcode-scanner-active');
          BarcodeScanner.stopScan();
          if (listener) listener.remove();
        });
      });
  
      await BarcodeScanner.startScan({
        formats: [
          BarcodeFormat.Code128, BarcodeFormat.Ean13, BarcodeFormat.Ean8,
          BarcodeFormat.UpcA, BarcodeFormat.UpcE, BarcodeFormat.QrCode,
          BarcodeFormat.Pdf417, BarcodeFormat.DataMatrix, BarcodeFormat.Aztec,
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
  

  // Scan for location barcode
  // async scanLocationBarcode() {
  //   if (!Capacitor.isNativePlatform()) {
  //     this.showToast('Barcode scanning only works on a real device.');
  //     return;
  //   }
  //   const hasPermission = await this.ensureCameraPermission();
  //   if (!hasPermission) {
  //     this.showToast('Camera permission is required for scanning.');
  //     return;
  //   }
  //   document.body.classList.add('barcode-scanner-active');
  //   this.isScanning = true;
  //   let listener: any = null;
  //   let timeoutId: any = null;
  //   try {
  //     listener = await BarcodeScanner.addListener('barcodeScanned', (result: any) => {
  //       console.log('barcodeScanned12345', result,result.barcode.rawValue);
  //       this.locationBarcode = result.barcode.rawValue || '';
  //     this.isScanning = false;
  //       document.body.classList.remove('barcode-scanner-active');
  //       // if (timeoutId) clearTimeout(timeoutId);
  //     // if (result.barcodes && result.barcodes.length > 0) {
  //     //   this.locationBarcode = result.barcodes[0].rawValue || '';
  //     //   this.onLocationBarcodeChange(this.locationBarcode);
  //     //   } else {
  //     //     this.showToast('No barcode found.');
  //     //   }
  //     //   listener.remove();
  //       BarcodeScanner.stopScan();
  //       if (listener) listener.remove(); // <-- Ensure listener is removed after scan
  //     });
  //     await BarcodeScanner.startScan({
  //       formats: [
  //         BarcodeFormat.Code128,
  //         BarcodeFormat.Ean13,
  //         BarcodeFormat.Ean8,
  //         BarcodeFormat.UpcA,
  //         BarcodeFormat.UpcE,
  //         BarcodeFormat.QrCode,
  //         BarcodeFormat.Pdf417,
  //         BarcodeFormat.DataMatrix,
  //         BarcodeFormat.Aztec,
  //         BarcodeFormat.Codabar,
  //         BarcodeFormat.Code39,
  //         BarcodeFormat.Code93,
  //         BarcodeFormat.Itf
  //       ]
  //     });
  //     // Timeout after 15 seconds
  //     timeoutId = setTimeout(() => {
  //       if (this.isScanning) {
  //         this.isScanning = false;
  //         document.body.classList.remove('barcode-scanner-active');
  //         this.showToast('Scan timed out.');
  //         if (listener) listener.remove();
  //         BarcodeScanner.stopScan();
  //       }
  //     }, 15000);
  //   } catch (err) {
  //     this.isScanning = false;
  //     document.body.classList.remove('barcode-scanner-active');
  //     if (timeoutId) clearTimeout(timeoutId);
  //     if (listener) listener.remove();
  //     BarcodeScanner.stopScan();
  //     this.showToast('Scanning cancelled or failed.');
  //   }
  // }

  async scanLocationBarcode() {
    if (!Capacitor.isNativePlatform()) {
      this.showToast('Barcode scanning only works on a real device.');
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
          this.locationBarcode = result.barcode.rawValue || '';
          this.onLocationBarcodeChange(this.locationBarcode);  // ✅ Trigger location logic immediately
          this.isScanning = false;
          document.body.classList.remove('barcode-scanner-active');
          BarcodeScanner.stopScan();
          if (listener) listener.remove();
        });
      });
  
      await BarcodeScanner.startScan({
        formats: [
          BarcodeFormat.Code128, BarcodeFormat.Ean13, BarcodeFormat.Ean8,
          BarcodeFormat.UpcA, BarcodeFormat.UpcE, BarcodeFormat.QrCode,
          BarcodeFormat.Pdf417, BarcodeFormat.DataMatrix, BarcodeFormat.Aztec,
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
  

  async showToast(message: string, color: string = 'warning') {
    const toast = await this.toastController.create({
      message,
      duration: 2000,
      color,
      position: 'top'
    });
    toast.present();
  }

  goBack() {
    console.log(this.listType);
    this.router.navigate(['/home'], { state: { company: this.ap.getUserCompany(), type: this.listType } });
  }

  hasConfirmedItemProperty(prop: string): boolean {
    return this.confirmedItems.some(item => item[prop] !== undefined && item[prop] !== null && item[prop] !== '');
  }
} 