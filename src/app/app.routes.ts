import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'home',
    loadComponent: () => import('./home/home.page').then((m) => m.HomePage),
  },
  {
    path: 'login',
    loadComponent: () => import('./login/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'grn/:inward',
    loadComponent: () => import('./grn-detail/grn-detail.page').then((m) => m.GrnDetailPage),
  },
  {
    path: 'grn-scanning/:grnId',
    loadComponent: () => import('./grn-scanning/grn-scanning.page').then((m) => m.GrnScanningPage),
  },
  {
    path: 'advanced-scanner/:grnId',
    loadComponent: () => import('./camera-scanner/camera-scanner.component').then((m) => m.CameraScannerComponent),
    // loadComponent: () => import('./advanced-scanner/advanced-scanner.page').then((m) => m.AdvancedScannerPage),
  },
  {
    path: 'camera-scanner/:grnId',
    loadComponent: () => import('./camera-scanner/camera-scanner.component').then((m) => m.CameraScannerComponent),
  },
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full',
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./dashboard/dashboard.page').then( m => m.DashboardPage)
  },
];
