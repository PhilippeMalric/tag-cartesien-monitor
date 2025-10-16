// Firebase
import { FirebaseApp, initializeApp } from 'firebase/app';
import { provideFirebaseApp } from '@angular/fire/app';
import { provideAuth, getAuth } from '@angular/fire/auth';
import { provideFirestore, getFirestore } from '@angular/fire/firestore';
import { provideDatabase, getDatabase } from '@angular/fire/database';
import { provideFunctions, getFunctions } from '@angular/fire/functions';
import { provideStorage, getStorage } from '@angular/fire/storage';


import { ApplicationConfig } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideClientHydration } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import { environment } from 'src/environnement/environment';

let theApp: FirebaseApp;

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withInMemoryScrolling({ anchorScrolling: 'enabled' })),
    provideHttpClient(withInterceptorsFromDi()),
    provideClientHydration(),
    provideAnimations(),

    // App
    provideFirebaseApp(() => {
      theApp = initializeApp({
        ...environment.firebase,
        // Garder l'URL firebaseio.com réelle si vous utilisez Realtime Database
      });
      return theApp;
    }),

    // Auth
    provideAuth(() => getAuth()),

    // Firestore
    provideFirestore(() => getFirestore(theApp)),

    // Realtime Database (si utilisée)
    provideDatabase(() => getDatabase(theApp)),

    // Storage (si utilisé)
    provideStorage(() => getStorage(theApp)),

    // Functions (si utilisé) — ajuste la région au besoin
    provideFunctions(() => getFunctions(theApp, 'us-central1')),
  ],
};
