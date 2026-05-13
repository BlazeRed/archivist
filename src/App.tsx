import { Routes, Route } from 'react-router-dom';
import { Topbar } from './components/Topbar';
import { TimelinePage } from './pages/TimelinePage';
import { GroupsPage } from './pages/GroupsPage';
import { ImportPage } from './pages/ImportPage';
import { SettingsPage } from './pages/SettingsPage';

function App() {
  return (
    <div className="min-h-screen flex flex-col bg-[#D2E8F7]">
      <Topbar />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<TimelinePage />} />
          <Route path="/groups" element={<GroupsPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;