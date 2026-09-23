import { Routes } from '@angular/router';
import { WeightPageComponent } from './components/weight-page/weight-page.component';

/** Gewicht-Ansicht `/gewicht` (ADR-0019) — zweite Route des Features `goals`. */
export const WEIGHT_ROUTES: Routes = [{ path: '', component: WeightPageComponent }];
