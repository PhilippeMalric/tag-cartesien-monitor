import { Component, inject } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AuthService } from '../../services/auth.service';


@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    // Material
    MatCardModule, MatButtonModule, MatIconModule,
    MatChipsModule, MatDividerModule, MatTooltipModule, MatSnackBarModule
  ],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent {
  private snack = inject(MatSnackBar);
  private authSvc = inject(AuthService);

  uid = this.authSvc.uid;
  isAdmin = this.authSvc.isAdmin;

  shortUid(uid: string | null): string {
    return uid && uid.length > 6 ? uid.slice(0, 6) : (uid ?? '—');
  }

  async login()  { await this.authSvc.loginWithGoogle(); }
  async logout() { await this.authSvc.logout(); }

  async copyUid() {
    const u = this.uid();
    if (!u) return;
    await navigator.clipboard.writeText(u);
    this.snack.open('UID copié dans le presse-papiers', 'OK', { duration: 2000 });
  }
}
