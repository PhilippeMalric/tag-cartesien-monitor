import { Component, inject, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { NgFor } from '@angular/common';

// Material
import { MatToolbarModule }  from '@angular/material/toolbar';
import { MatSidenavModule }  from '@angular/material/sidenav';
import { MatListModule }     from '@angular/material/list';
import { MatIconModule }     from '@angular/material/icon';
import { MatButtonModule }   from '@angular/material/button';
import { Database, ref, set } from '@angular/fire/database';


type NavItem = { label: string; icon: string; link: string; exact?: boolean };

@Component({
  standalone: true,
  selector: 'app-root',
  imports: [
    RouterOutlet, RouterLink, RouterLinkActive, NgFor,
    MatToolbarModule, MatSidenavModule, MatListModule, MatIconModule, MatButtonModule
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class AppComponent {
  opened = signal(true);
  nav: NavItem[] = [
    { label: 'Tableau de bord', icon: 'dashboard',      link: '/dashboard' },
    { label: 'Rooms',           icon: 'meeting_room',   link: '/rooms', exact: true },
    { label: 'Événements',      icon: 'history',        link: '/events' }
  ];

  db = inject(Database);

constructor() {
    
  }

  toggle() { this.opened.set(!this.opened()); }
  addAdmin = async ()=> {
  
    await set(ref(this.db, 'admins/xM9xZueVKUIAFFjyqCKB6SSfUf1e'), true);
  }
}



