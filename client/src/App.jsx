import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard.jsx';
import Search from './pages/Search.jsx';
import Applications from './pages/Applications.jsx';
import Profile from './pages/Profile.jsx';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: '📊' },
  { to: '/search', label: 'Find Jobs', icon: '🔍' },
  { to: '/applications', label: 'Applications', icon: '📋' },
  { to: '/profile', label: 'My Profile', icon: '👤' },
];

export default function App() {
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">Job<span>Portal</span></div>
        <div className="brand-sub">Search · Autofill · Track</div>
        <nav>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <span className="nav-icon">{n.icon}</span> {n.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/search" element={<Search />} />
          <Route path="/applications" element={<Applications />} />
          <Route path="/profile" element={<Profile />} />
        </Routes>
      </main>
    </div>
  );
}
