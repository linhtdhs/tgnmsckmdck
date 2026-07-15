import { Component, inject } from '@angular/core';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [],
  template: `
    <div class="toast-container">
      @for (t of toastSvc.toasts(); track t.id) {
        <div class="toast" [class.toast-error]="t.type === 'error'">
          <span>{{ t.type === 'error' ? '✖' : '✔' }}</span>
          <span>{{ t.message }}</span>
        </div>
      }
    </div>
  `
})
export class ToastComponent {
  toastSvc = inject(ToastService);
}
