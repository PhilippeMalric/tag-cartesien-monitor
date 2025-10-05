import { AfterViewInit, Component, effect, ElementRef, input, OnDestroy, output, ViewChild } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-room-input',
  standalone: true,
  imports: [MatFormFieldModule, MatInputModule, MatButtonModule],
  templateUrl: './room-input.component.html'
})
export class RoomInputComponent {
  roomId = input<string>('');
  roomIdChange = output<string>();
  listen = output<void>();
  unlisten = output<void>();
}


