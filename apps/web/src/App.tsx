import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { RedirectIfAuthed, RequireAuth } from './auth';
import { AppShell } from './components/shell';
import LandingPage from './pages/Landing';
import { LoginPage, RegisterPage } from './pages/Auth';
import OverviewPage from './pages/Overview';
import InvestigationsPage from './pages/Investigations';
import NewInvestigationPage from './pages/NewInvestigation';
import InvestigationDetailPage from './pages/InvestigationDetail';
import ExperimentsPage from './pages/Experiments';
import RunWorkspacePage from './pages/RunWorkspace';
import FindingsPage from './pages/Findings';
import FindingDetailPage from './pages/FindingDetail';
import EvidencePage from './pages/Evidence';
import ReportsPage from './pages/Reports';
import ReportPreviewPage from './pages/ReportPreview';
import SettingsPage from './pages/Settings';
import DocsPage from './pages/Docs';

function LegacyRun() {
  const { id } = useParams();
  return <Navigate to={`/app/runs/${id}`} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<RedirectIfAuthed><LoginPage /></RedirectIfAuthed>} />
      <Route path="/register" element={<RedirectIfAuthed><RegisterPage /></RedirectIfAuthed>} />
      <Route path="/runs/:id" element={<LegacyRun />} />
      <Route
        path="/app"
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<OverviewPage />} />
        <Route path="investigations" element={<InvestigationsPage />} />
        <Route path="investigations/new" element={<NewInvestigationPage />} />
        <Route path="investigations/:id" element={<InvestigationDetailPage />} />
        <Route path="experiments" element={<ExperimentsPage />} />
        <Route path="runs/:id" element={<RunWorkspacePage />} />
        <Route path="findings" element={<FindingsPage />} />
        <Route path="findings/:id" element={<FindingDetailPage />} />
        <Route path="evidence" element={<EvidencePage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="reports/preview/:runId" element={<ReportPreviewPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="docs" element={<DocsPage />} />
        <Route path="*" element={<div className="p-8 text-fg-2">Page not found.</div>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
