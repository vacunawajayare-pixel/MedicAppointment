import { Navigate, Route, Routes } from 'react-router-dom';
import { StaffAuthProvider } from './pages/appointments/auth/staffAuth';
import { ThemeProvider } from './lib/theme';
import { BoardAuthProvider } from './pages/queue-board/auth/boardAuth';
import StaffLogin from './pages/appointments/StaffLogin';
import StaffLayout from './pages/appointments/StaffLayout';
import Dashboard from './pages/appointments/Dashboard';
import Patients from './pages/appointments/Patients';
import Doctors from './pages/appointments/Doctors';
import Booking from './pages/appointments/Booking';
import CheckIn from './pages/appointments/CheckIn';
import Reports from './pages/appointments/Reports';
import Settings from './pages/appointments/Settings';
import BoardLogin from './pages/queue-board/BoardLogin';
import BoardDisplay from './pages/queue-board/BoardDisplay';

export default function App() {
  return (
    <ThemeProvider>
      <Routes>
      <Route path="/" element={<Navigate to="/appointments/login" replace />} />

      {/* Staff section — own provider + session, never touches board auth */}
      <Route
        path="/appointments/*"
        element={
          <StaffAuthProvider>
              <Routes>
              <Route path="login" element={<StaffLogin />} />
              <Route element={<StaffLayout />}>
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="patients" element={<Patients />} />
                <Route path="doctors" element={<Doctors />} />
                <Route path="booking" element={<Booking />} />
                <Route path="check-in" element={<CheckIn />} />
                <Route path="reports" element={<Reports />} />
                <Route path="settings" element={<Settings />} />
                <Route index element={<Navigate to="dashboard" replace />} />
              </Route>
              </Routes>
          </StaffAuthProvider>
        }
      />

      {/* Board section — own provider + session, never touches staff auth */}
      <Route
        path="/queue-board/*"
        element={
          <BoardAuthProvider>
            <Routes>
              <Route path="login" element={<BoardLogin />} />
              <Route path="display" element={<BoardDisplay />} />
              <Route index element={<Navigate to="display" replace />} />
            </Routes>
          </BoardAuthProvider>
        }
      />

      <Route path="*" element={<Navigate to="/appointments/login" replace />} />
      </Routes>
    </ThemeProvider>
  );
}
