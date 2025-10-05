import { Component, input, output } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';


@Component({
  selector: 'app-tag-controls',
  standalone: true,
  imports: [MatFormFieldModule, MatSelectModule, MatButtonModule, MatIconModule],
  templateUrl: './tag-controls.component.html'
})
export class TagControlsComponent {
  dots = input<any[]>([]);
  victimUid = input<string | null>(null);
  victimUidChange = output<string | null>();
  simulate = output<void>();
}
