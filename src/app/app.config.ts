
// Firebase
import { initializeApp } from 'firebase/app';
import { provideFirebaseApp } from '@angular/fire/app';
import { provideAuth, getAuth, connectAuthEmulator } from '@angular/fire/auth';
import { provideFirestore, getFirestore, connectFirestoreEmulator } from '@angular/fire/firestore';
import { provideDatabase, getDatabase, connectDatabaseEmulator } from '@angular/fire/database';
import { provideFunctions, getFunctions, connectFunctionsEmulator } from '@angular/fire/functions';
import { provideStorage, getStorage, connectStorageEmulator } from '@angular/fire/storage';
import { environment } from '../environnement/environment.development';
import { ApplicationConfig } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideClientHydration } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';

const IS_BROWSER = typeof window !== 'undefined';
const IS_LOCALHOST = IS_BROWSER && /(^|\.)(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);
console.log('[IS_BROWSER]', IS_BROWSER);
console.log('[IS_LOCALHOST]', IS_LOCALHOST);
const shouldUseEmulators = !!environment.useEmulators && IS_LOCALHOST;
console.log('[ENV]', environment);
console.log('[shouldUseEmulators]', shouldUseEmulators, 'host=', IS_BROWSER ? window.location.hostname : '(ssr)');



export const appConfig: ApplicationConfig = {
  providers: [
    
    provideRouter(routes, withInMemoryScrolling({ anchorScrolling: 'enabled' })),
    provideHttpClient(withInterceptorsFromDi()),
    provideClientHydration(),
    provideAnimations(),
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideAuth(() => {
      const auth = getAuth();
      if (shouldUseEmulators) connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      return auth;
    }),
    provideFirestore(() => {
      const fs = getFirestore();
      if (shouldUseEmulators) connectFirestoreEmulator(fs, '127.0.0.1', 8080);
      return fs;
    }),
    provideDatabase(() => {
      const db = getDatabase();
      //if (shouldUseEmulators) connectDatabaseEmulator(db, '127.0.0.1', 9000);
      return db;
    }),
    provideFunctions(() => {
      const fns = getFunctions(undefined, 'us-central1');
      if (shouldUseEmulators) connectFunctionsEmulator(fns, '127.0.0.1', 5001);
      return fns;
    }),
    provideStorage(() => {
      const st = getStorage();
      if (shouldUseEmulators) connectStorageEmulator(st, '127.0.0.1', 9199);
      return st;
    }),
  ]
};
