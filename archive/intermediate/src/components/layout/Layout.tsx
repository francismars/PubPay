// Layout component - minimal wrapper for React Router
import React from 'react';
import { Outlet } from 'react-router-dom';

export const Layout: React.FC = () => {
  return <Outlet />;
};
