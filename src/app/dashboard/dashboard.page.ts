import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { AuthService } from '../auth.service';
import { Router } from '@angular/router';
import { IonButtons, IonButton } from '@ionic/angular/standalone';
import { IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { 
  cubeOutline, 
  bagOutline, 
  homeOutline, 
  logOutOutline, 
  personCircleOutline,
  business,
  cube,
  bagHandle,
  arrowForward,
  timeOutline,
  checkmarkDoneOutline,
  handRight
} from 'ionicons/icons';
import { HttpClient } from '@angular/common/http';

addIcons({ 
  cubeOutline, 
  bagOutline,
  business,
  cube,
  bagHandle,
  arrowForward,
  timeOutline,
  checkmarkDoneOutline,
  handRight,
  homeOutline,
  logOutOutline,
  personCircleOutline
});

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  standalone: true,
  imports: [
    IonContent, IonHeader, IonTitle, IonToolbar, CommonModule, FormsModule, IonButtons, IonButton,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonIcon
  ]
})
export class DashboardPage implements OnInit {
  username: string = '';
  putawayCount: number = 0;
  pickupCount: number = 0;
  baseUrl: string = 'https://tatmeenapi.esarwa.com';
  
  constructor(private authService: AuthService, private router: Router, private http: HttpClient) {}

  ngOnInit() {
    const user = this.authService.getCurrentUser();
    this.username = user ? user.username : '';
    const token = this.authService.getToken();
    const companyId = user && user.company ? user.company : null;
    console.log(companyId,token);
    if (companyId && token) {
      // Putaway count (type 1)
      this.http.post<any>(this.baseUrl+'/invoice/inward-list/s=/', { company: companyId, type: 1 }).subscribe({
        next: (res) => {
          this.putawayCount = Array.isArray(res.data) ? res.data.length : (Array.isArray(res) ? res.length : 0);
        },
        error: () => { this.putawayCount = 0; }
      });
      // Pickup count (type 2)
      this.http.post<any>(this.baseUrl+'/invoice/inward-list/s=/', { company: companyId, type: 2 }).subscribe({
        next: (res) => {
          this.pickupCount = Array.isArray(res.data) ? res.data.length : (Array.isArray(res) ? res.length : 0);
        },
        error: () => { this.pickupCount = 0; }
      });
    }
  }
 ngAfterViewInit() {
 }
  onLogout() {
    this.authService.logout();
  }

  onPutAway() {
    const user = this.authService.getCurrentUser();
    const companyId = user && user.company ? user.company : null;
    this.router.navigate(['/home'], { state: { company: companyId, type: 1 } });
  }

  onPickup() {
    const user = this.authService.getCurrentUser();
    const companyId = user && user.company && user.company.length > 0 ? user.company[0].company : null;
    this.router.navigate(['/home'], { state: { company: companyId, type: 2 } });
  }
}