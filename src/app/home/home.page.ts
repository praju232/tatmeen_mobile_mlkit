import { Component, OnInit } from '@angular/core';
import { ViewWillEnter } from '@ionic/angular';
import { IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonLabel, IonSpinner, IonIcon, IonButton } from '@ionic/angular/standalone';
import { AuthService } from '../auth.service';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { IonButtons, IonBackButton } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { 
  receipt, 
  arrowBack, 
  search, 
  closeCircle, 
  alertCircle, 
  documentText,
  listOutline,
  cubeOutline,
  arrowForward,
  fileTrayOutline
} from 'ionicons/icons';

addIcons({ 
  receipt, 
  arrowBack, 
  search, 
  closeCircle, 
  alertCircle, 
  documentText,
  listOutline,
  cubeOutline,
  arrowForward,
  fileTrayOutline
});

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [CommonModule, IonHeader, IonToolbar, IonTitle, IonContent, IonSpinner, 
    FormsModule, IonButtons, IonButton, IonIcon
  ],
})
export class HomePage implements OnInit, ViewWillEnter {
  invoiceList: any[] = [];
  loading: boolean = false;
  error: string = '';
  searchTerm: string = '';
  filteredInvoiceList: any[] = [];
  listType: number | null = null; // 1 = put away, 2 = pickup
  baseUrl: string = 'https://tatmeenapi.esarwa.com';
  constructor(private authService: AuthService, private http: HttpClient, private router: Router) {}

  ngOnInit() {
    console.log('HomePage ngOnInit called');
    this.loadInvoices();
  }

  ionViewWillEnter() {
    console.log('HomePage ionViewWillEnter called');
    this.loadInvoices();
  }

  loadInvoices() {
    // Try to get company and type from navigation state
    const nav = window.history.state;
    const user = this.authService.getCurrentUser();
    const token = this.authService.getToken();
    console.log(user);
    console.log(nav,token);
    const companyId = user && user.company ? user.company : null;
    const type = nav.type || null;
    this.listType = type ? Number(type) : null;
    if (companyId && token) {
      this.loading = true;
      this.http.post<any>(this.baseUrl+'/invoice/inward-list/s=/', { company: companyId, type: type }).subscribe({
        next: (res) => {
          console.log('API response:', res);
          this.invoiceList = res.data || res;
          this.filteredInvoiceList = this.invoiceList;
          this.loading = false;
        },
        error: (err) => {
          this.error = err?.error?.detail || 'Failed to load invoice list.';
          this.loading = false;
        }
      });
    } else {
      this.error = 'No company information found.';
    }
  }

  onGrnClick(invoice: any) {
    if (!invoice || invoice.id === undefined || invoice.id === null) {
      alert('Invalid GRN ID. Please try another item.');
      return;
    }
    this.router.navigate(['/grn', invoice.id], { state: { listType: this.listType, requition_no: invoice.grnRef } });
  }

  onLogout() {
    this.authService.logout();
  }

  goBack() {
    this.router.navigate(['/dashboard']);
  }

  clearSearch() {
    this.searchTerm = '';
    this.onSearchChange();
  }

  onSearchChange() {
    const term = this.searchTerm.trim().toLowerCase();
    if (!term) {
      this.filteredInvoiceList = this.invoiceList;
    } else {
      this.filteredInvoiceList = this.invoiceList.filter(invoice =>
        invoice.grnRef && invoice.grnRef.toLowerCase().includes(term)
      );
    }
  }

  getTotalItems(invoice: any): number {
    if (typeof invoice.total_items === 'number') return invoice.total_items;
    if (Array.isArray(invoice.items)) return invoice.items.length;
    return 0;
  }

  getTotalQuantity(invoice: any): number {
    if (typeof invoice.quantity === 'number') return invoice.quantity;
    if (Array.isArray(invoice.items)) {
      return invoice.items.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0);
    }
    return 0;
  }
}
