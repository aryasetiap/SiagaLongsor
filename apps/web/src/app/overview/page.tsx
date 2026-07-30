'use client';

import { ProtectedRoute } from '../../auth/protected-route';
import { ApplicationShell } from '../../components/application-shell';

export default function OverviewPage() {
  return (
    <ProtectedRoute>{(principal) => <ApplicationShell principal={principal} />}</ProtectedRoute>
  );
}
