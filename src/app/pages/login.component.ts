import { Component, inject, signal } from '@angular/core';
import { Auth, GoogleAuthProvider, signInWithPopup, signOut } from '@angular/fire/auth';
import { onIdTokenChanged } from 'firebase/auth';

@Component({
  selector: 'app-login',
  standalone: true,
  template: `
    <h2>Connexion</h2>

    @if (!uid()) {
      <button (click)="login()">Se connecter (Google)</button>
    } @else {
      <p>
        Connecté : <strong>{{ uid() }}</strong><br>
        Admin : <strong>{{ isAdmin() ? 'oui' : 'non' }}</strong>
      </p>
      <button (click)="logout()">Se déconnecter</button>
    }
  `
})
export class LoginComponent {
  private auth = inject(Auth);

  // état réactif
  uid = signal<string | null>(null);
  isAdmin = signal<boolean>(false);

  constructor() {
    // écoute les changements de session/jeton pour récupérer la claim 'admin'
    onIdTokenChanged(this.auth, async (user) => {
      if (!user) {
        this.uid.set(null);
        this.isAdmin.set(false);
        return;
      }
      this.uid.set(user.uid);
      const token = await user.getIdTokenResult();
      this.isAdmin.set(!!token.claims['admin']);
    });
  }

  async login() {
    try {
      await signInWithPopup(this.auth, new GoogleAuthProvider());
      const u = this.auth.currentUser;
      if (u) {
        await u.getIdToken(true);
        const token = await u.getIdTokenResult();
        this.isAdmin.set(!!token.claims['admin']);
      }
    } catch (e) {
      console.error('Login error', e);
    }
  }

  async logout() {
    await signOut(this.auth);
    // onIdTokenChanged remettra uid/isAdmin à vide
  }
}
