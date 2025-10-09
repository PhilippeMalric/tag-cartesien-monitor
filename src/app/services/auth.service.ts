import { inject, Injectable, signal } from '@angular/core';
import { Auth, GoogleAuthProvider, signInWithPopup, signOut } from '@angular/fire/auth';
import { onIdTokenChanged, User } from 'firebase/auth';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private auth = inject(Auth);

  // État exposé par le service
  readonly uid = signal<string | null>(null);
  readonly isAdmin = signal<boolean>(false);
  readonly user = signal<User | null>(null);

  constructor() {
    // Écoute les changements de session/jeton et met à jour uid/isAdmin
    onIdTokenChanged(this.auth, async (u) => {
      this.user.set(u);
      if (!u) {
        this.uid.set(null);
        this.isAdmin.set(false);
        return;
      }
      this.uid.set(u.uid);
      const token = await u.getIdTokenResult();
      console.log('Token claims:', token.claims);
      
      this.isAdmin.set(!!token.claims['admin']);
    });
  }

  async loginWithGoogle(): Promise<void> {
    await signInWithPopup(this.auth, new GoogleAuthProvider());
    const u = this.auth.currentUser;
    if (u) {
      await u.getIdToken(true);
      const token = await u.getIdTokenResult();
      this.isAdmin.set(!!token.claims['admin']);
    }
  }

  async logout(): Promise<void> {
    await signOut(this.auth);
    // onIdTokenChanged remettra uid/isAdmin
  }
}
