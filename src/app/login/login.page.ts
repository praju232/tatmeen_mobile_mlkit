import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent } from '@ionic/angular/standalone';
import { AuthService } from '../auth.service';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClientModule } from '@angular/common/http';
import { IonInput, IonButton, IonIcon, IonSpinner, IonCheckbox, ToastController } from '@ionic/angular/standalone';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,
  imports: [
    IonContent,
    CommonModule,
    ReactiveFormsModule,
    HttpClientModule,
    IonInput,
    IonButton,
    IonIcon,
    IonSpinner,
    IonCheckbox
  ]
})
export class LoginPage implements OnInit {
  loginForm!: FormGroup;
  loading = false;
  error: string | null = null;
  showPassword = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private toastController: ToastController
  ) {}

  ngOnInit() {
    this.loginForm = this.fb.group({
      username: ['', Validators.required],
      password: ['', Validators.required]
    });
  }

  async showToast(message: string, color: 'success' | 'danger' = 'success') {
    const toast = await this.toastController.create({
      message,
      duration: 2000,
      color,
      position: 'top',
    });
    await toast.present();
  }

  onLogin() {
    this.error = null;
    if (this.loginForm.invalid) return;
    this.loading = true;
    const { username, password } = this.loginForm.value;
    this.authService.login(username, password).subscribe({
      next: async (response) => {
        if (response && response.token && response.user && response.user.length > 0) {
          this.authService.handleLoginResponse(response);
          this.loading = false;
          await this.showToast('Login successful!', 'success');
          this.router.navigate(['/dashboard']);
        } else {
          this.loading = false;
          this.error = 'Invalid username or password';
          await this.showToast('Invalid username or password', 'danger');
        }
      },
      error: async (err) => {
        this.loading = false;
        this.error = 'Invalid username or password';
        await this.showToast('Invalid username or password', 'danger');
      }
    });
  }

  togglePassword() {
    this.showPassword = !this.showPassword;
  }
}
