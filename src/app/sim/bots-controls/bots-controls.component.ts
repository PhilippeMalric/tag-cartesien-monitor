import { Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSliderModule } from '@angular/material/slider';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-bots-controls',
  standalone: true,
  imports: [MatIconModule, MatFormFieldModule, MatInputModule, MatSliderModule, MatButtonModule],
  templateUrl: './bots-controls.component.html'
})
export class BotsControlsComponent {
  nbBots = input<number>(6);
  nbBotsChange = output<number>();
  speed = input<number>(300);
  speedChange = output<number>();
  displayMs = input<(v:number|null)=>string>((v)=>`${v??0} ms`);

  spawn = output<void>();
  start = output<void>();
  stop = output<void>();
}
