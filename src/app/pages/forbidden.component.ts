import { Component } from '@angular/core';

@Component({
  selector: 'app-forbidden',
  standalone: true,
  template: `<h2>Accès refusé</h2><p>Votre compte n'a pas les droits admin.</p>`
})
export class ForbiddenComponent {}
