import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ProductLayout from './pages/ProductLayout';
import Overview from './pages/Overview';
import PostsManage from './pages/PostsManage';
import PostDetailManage from './pages/PostDetailManage';
import Categories from './pages/Categories';
import Tags from './pages/Tags';
import Settings from './pages/Settings';
import Faqs from './pages/Faqs';
import Changelogs from './pages/Changelogs';
import Notifications from './pages/Notifications';
import UserNotifications from './pages/UserNotifications';
import Account from './pages/Account';
import ApiTokens from './pages/ApiTokens';
import PublicBoard from './pages/PublicBoard';
import NewFeedback from './pages/NewFeedback';
import PublicPostDetail from './pages/PublicPostDetail';
import Embed from './pages/Embed';
import NotFound from './pages/NotFound';
import { ToastContainer } from './components/ui';
import { useUser } from './store/user';

function RequireAuth({ children }) {
  const token = useUser((s) => s.token);
  const loc = useLocation();
  if (!token) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  return children;
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/app" element={<RequireAuth><Dashboard /></RequireAuth>} />
        <Route path="/app/notifications" element={<RequireAuth><UserNotifications /></RequireAuth>} />
        <Route path="/app/account" element={<RequireAuth><Account /></RequireAuth>} />
        <Route path="/app/products/:id" element={<RequireAuth><ProductLayout /></RequireAuth>}>
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview" element={<Overview />} />
          <Route path="posts" element={<PostsManage />} />
          <Route path="posts/:postId" element={<PostDetailManage />} />
          <Route path="categories" element={<Categories />} />
          <Route path="tags" element={<Tags />} />
          <Route path="settings" element={<Settings />} />
          <Route path="faqs" element={<Faqs />} />
          <Route path="changelogs" element={<Changelogs />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="tokens" element={<ApiTokens />} />
        </Route>
        {/* C 端公开 */}
        <Route path="/p/:slug" element={<PublicBoard />} />
        <Route path="/p/:slug/new" element={<NewFeedback />} />
        <Route path="/p/:slug/posts/:id" element={<PublicPostDetail />} />
        <Route path="/embed/:slug" element={<Embed />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <ToastContainer />
    </>
  );
}
