import { Component, inject, signal } from '@angular/core';
import { Router, RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { NgFor } from '@angular/common';

// Material
import { MatToolbarModule }  from '@angular/material/toolbar';
import { MatSidenavModule }  from '@angular/material/sidenav';
import { MatListModule }     from '@angular/material/list';
import { MatIconModule }     from '@angular/material/icon';
import { MatButtonModule }   from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule }     from '@angular/material/input';
import { MatDividerModule }   from '@angular/material/divider';

import { Database, ref, serverTimestamp, set } from '@angular/fire/database';
import { FormsModule } from '@angular/forms';
import { Firestore, setDoc } from '@angular/fire/firestore';

type NavItem = { label: string; icon: string; link: string; exact?: boolean };

@Component({
  standalone: true,
  selector: 'app-root',
  imports: [
    RouterOutlet, RouterLink, RouterLinkActive, NgFor,
    MatToolbarModule, MatSidenavModule, MatListModule, MatIconModule, MatButtonModule,
    MatFormFieldModule, MatInputModule, MatDividerModule,FormsModule
  ],
  templateUrl: './app.html',
  styleUrls: ['./app.scss']
})
export class AppComponent {
  // état UI
  opened = signal(true);

  // navigation latérale
  nav: NavItem[] = [
    { label: 'Tableau de bord', icon: 'dashboard',      link: '/dashboard' },
    { label: 'Rooms',           icon: 'meeting_room',   link: '/rooms', exact: true },
    { label: 'Événements',      icon: 'history',        link: '/events' },
    { label: 'Simulation',      icon: 'smart_toy',      link: '/simulate', exact: true }, // 👈 ajouté
  ];

  // injections
  private router = inject(Router);
  db = inject(Database);
  fs = inject(Firestore);



  toggle() { this.opened.update(v => !v); }

  // Accès direct au simulateur: /simulate ou /simulate/:id
  goSim(id?: string) {
    const trimmed = (id ?? '').trim();
    this.router.navigate(trimmed ? ['/simulate', trimmed] : ['/simulate']);
  }

  // utilitaire admin (existant)
  addAdmin = async () => {
    await set(ref(this.db, 'admins/xM9xZueVKUIAFFjyqCKB6SSfUf1e'), true);
  };
}
