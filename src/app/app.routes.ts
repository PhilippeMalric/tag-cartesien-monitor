import { Routes } from '@angular/router';
import { adminGuard } from './guards/admin.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'rooms', pathMatch: 'full' },

  {
    path: 'rooms',
    loadComponent: () => import('./pages/rooms/rooms.component').then(m => m.RoomsComponent),
    canActivate: [adminGuard]
  },
  {
    path: 'room/:id',
    loadComponent: () => import('./pages/room-detail/room-detail.component').then(m => m.RoomDetailComponent),
    canActivate: [adminGuard]
  },
  {
    path: 'events',
    loadComponent: () => import('./pages/events/events.component').then(m => m.EventsComponent),
    canActivate: [adminGuard]
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./pages/dashboard/dashboard.component').then(m => m.DashboardComponent),
    canActivate: [adminGuard]
  },

  // 👇 Ajout du simulateur (lazy)
  {
    path: 'simulate',
    loadComponent: () =>
      import('./sim/simulator/match-simulator.component').then(m => m.MatchSimulatorComponent),
    canActivate: [adminGuard]
  },
  {
    path: 'simulate/:id',
    loadComponent: () =>
      import('./sim/simulator/match-simulator.component').then(m => m.MatchSimulatorComponent),
    canActivate: [adminGuard]
  },

  {
    path: 'login',
    loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent),
  },
  {
    path: 'forbidden',
    loadComponent: () => import('./pages/forbidden.component').then(m => m.ForbiddenComponent),
  },
  { path: '**', redirectTo: 'rooms' }
];
