import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth } from '@angular/fire/auth';

export const adminGuard: CanActivateFn = async () => {
  const auth = inject(Auth);
  const router = inject(Router);

  const user = auth.currentUser ?? null;
  if (!user) {
    router.navigate(['/login']);
    return false;
  }
  const token = await user.getIdTokenResult();
  const isAdmin = !!token.claims['admin'];
  if (!isAdmin) {
    router.navigate(['/forbidden']);
    return false;
  }
  return true;
};
