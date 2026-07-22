import { Routes } from '@angular/router';
import { authGuard, roleGuard } from './core/auth/auth.guards';
import { AppShell } from './features/shell/app-shell';

/** Rutas de registro/consulta clínica compartidas entre familia y cuidador. */
const careChildren: Routes = [
  {
    path: 'patients/:patientId/dashboard',
    loadComponent: () => import('./features/care/patient-dashboard-page').then((m) => m.PatientDashboardPage),
  },
  {
    path: 'patients/:patientId/history',
    loadComponent: () => import('./features/care/patient-history-page').then((m) => m.PatientHistoryPage),
  },
  {
    path: 'patients/:patientId/record/vitals',
    loadComponent: () => import('./features/care/record-vitals-page').then((m) => m.RecordVitalsPage),
  },
  {
    path: 'patients/:patientId/record/medication',
    loadComponent: () => import('./features/care/record-medication-page').then((m) => m.RecordMedicationPage),
  },
  {
    path: 'patients/:patientId/record/note',
    loadComponent: () => import('./features/care/record-note-page').then((m) => m.RecordNotePage),
  },
  {
    path: 'patients/:patientId/charts',
    loadComponent: () => import('./features/care/patient-charts-page').then((m) => m.PatientChartsPage),
  },
];

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login-page').then((m) => m.LoginPage),
  },
  {
    path: 'signup',
    loadComponent: () => import('./features/auth/signup-page').then((m) => m.SignupPage),
  },
  {
    path: 'invite/:token',
    loadComponent: () => import('./features/auth/invite-landing-page').then((m) => m.InviteLandingPage),
  },
  {
    path: 'app',
    component: AppShell,
    canActivate: [authGuard, roleGuard('family', 'patient')],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'marketplace' },
      {
        path: 'marketplace',
        loadComponent: () => import('./features/marketplace/marketplace-page').then((m) => m.MarketplacePage),
      },
      {
        path: 'marketplace/:caregiverId',
        loadComponent: () =>
          import('./features/marketplace/caregiver-detail-page').then((m) => m.CaregiverDetailPage),
      },
      {
        path: 'marketplace/:caregiverId/request',
        loadComponent: () =>
          import('./features/marketplace/request-wizard-page').then((m) => m.RequestWizardPage),
      },
      {
        path: 'hiring',
        loadComponent: () => import('./features/marketplace/hirings-page').then((m) => m.HiringsPage),
      },
      {
        path: 'patients',
        loadComponent: () => import('./features/patients/patients-page').then((m) => m.PatientsPage),
      },
      {
        path: 'patients/new',
        loadComponent: () =>
          import('./features/patients/patient-register-page').then((m) => m.PatientRegisterPage),
      },
      {
        path: 'patients/:patientId/caregivers',
        loadComponent: () =>
          import('./features/patients/patient-caregivers-page').then((m) => m.PatientCaregiversPage),
      },
      {
        path: 'patients/:patientId/record',
        loadComponent: () =>
          import('./features/patients/patient-record-page').then((m) => m.PatientRecordPage),
      },
      {
        // UC-12 A3 (NFR-30): solo el círculo (familia) gestiona la cuarentena — no va en careChildren.
        path: 'patients/:patientId/quarantine',
        loadComponent: () =>
          import('./features/care/patient-quarantine-page').then((m) => m.PatientQuarantinePage),
      },
      ...careChildren,
      { path: 'patients/:patientId', pathMatch: 'full', redirectTo: 'patients/:patientId/dashboard' },
    ],
  },
  {
    path: 'caregiver',
    component: AppShell,
    canActivate: [authGuard, roleGuard('caregiver')],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'profile' },
      {
        path: 'profile',
        loadComponent: () =>
          import('./features/caregiver/caregiver-profile-page').then((m) => m.CaregiverProfilePage),
      },
      {
        path: 'onboarding',
        loadComponent: () =>
          import('./features/caregiver/caregiver-onboarding-page').then((m) => m.CaregiverOnboardingPage),
      },
      {
        path: 'requests',
        loadComponent: () =>
          import('./features/caregiver/caregiver-inbox-page').then((m) => m.CaregiverInboxPage),
      },
      {
        path: 'services',
        loadComponent: () =>
          import('./features/caregiver/caregiver-services-page').then((m) => m.CaregiverServicesPage),
      },
      ...careChildren,
    ],
  },
  {
    path: 'admin',
    component: AppShell,
    canActivate: [authGuard, roleGuard('admin')],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'pending' },
      {
        path: 'pending',
        loadComponent: () => import('./features/admin/admin-pending-page').then((m) => m.AdminPendingPage),
      },
      {
        path: 'caregivers',
        loadComponent: () =>
          import('./features/admin/admin-caregivers-page').then((m) => m.AdminCaregiversPage),
      },
      {
        path: 'caregivers/:id',
        loadComponent: () =>
          import('./features/admin/admin-caregiver-detail-page').then((m) => m.AdminCaregiverDetailPage),
      },
      {
        path: 'ops',
        loadComponent: () => import('./features/admin/admin-ops-page').then((m) => m.AdminOpsPage),
      },
    ],
  },
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: '**', redirectTo: 'login' },
];
