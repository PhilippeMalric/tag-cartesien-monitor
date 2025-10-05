// src/app/sim/create-room/create-room.component.ts
import { Component, input, output } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-create-room',
  standalone: true,
  imports: [MatFormFieldModule, MatInputModule, MatButtonModule],
  templateUrl: './create-room.component.html'
})
export class CreateRoomComponent {
  name = input<string>('');
  nameChange = output<string>();
  create = output<void>();
}
