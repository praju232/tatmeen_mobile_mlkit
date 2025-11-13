import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable } from 'rxjs';
import { isPlatformBrowser } from '@angular/common';

export interface User {
  id: number;
  username: string;
  email: string;
  f_name: string;
  l_name: string;
  mobile: string;
  user_type: string;
  user_type_id: number;
  company: { company: number }[];
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private tokenKey = 'authToken';
  private userKey = 'currentUser';
  private apiUrl = 'https://tatmeenapi.esarwa.com/auth/login/';
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private http: HttpClient,
    private router: Router
  ) {
    if (isPlatformBrowser(this.platformId)) {
      const savedUser = localStorage.getItem(this.userKey);
      const token = localStorage.getItem(this.tokenKey);
      if (savedUser && token) {
        this.currentUserSubject.next(JSON.parse(savedUser));
      }
    }
  }

  login(username: string, password: string): Observable<any> {
    const payload = { username, password };
    return this.http.post<any>(this.apiUrl, payload);
  }

  handleLoginResponse(response: any): void {
    if (response && response.token && response.user && response.user.length > 0) {
      if (isPlatformBrowser(this.platformId)) {
        localStorage.setItem(this.tokenKey, response.token);
        localStorage.setItem(this.userKey, JSON.stringify(response.user[0]));
      }
      this.currentUserSubject.next(response.user[0]);
    }
  }

  logout(): void {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem(this.tokenKey);
      localStorage.removeItem(this.userKey);
    }
    this.currentUserSubject.next(null);
    this.router.navigate(['/login']);
  }

  isLoggedIn(): boolean {
    if (isPlatformBrowser(this.platformId)) {
      return !!localStorage.getItem(this.tokenKey);
    }
    return false;
  }

  getToken(): string | null {
    if (isPlatformBrowser(this.platformId)) {
      return localStorage.getItem(this.tokenKey);
    }
    return null;
  }

  getCurrentUser(): User | null {
    if (isPlatformBrowser(this.platformId)) {
      const user = localStorage.getItem(this.userKey);
      return user ? JSON.parse(user) : null;
    }
    return null;
  }
} 