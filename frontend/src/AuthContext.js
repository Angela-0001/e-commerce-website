import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const groups = JSON.parse(localStorage.getItem('groups') || '[]');
    const email = localStorage.getItem('email');
    if (token) setUser({ token, groups, email });
  }, []);

  function login(token, groups, email) {
    localStorage.setItem('token', token);
    localStorage.setItem('groups', JSON.stringify(groups));
    localStorage.setItem('email', email);
    setUser({ token, groups, email });
  }

  function logout() {
    localStorage.clear();
    setUser(null);
  }

  const isAdmin = user?.groups?.includes('Admin');

  return (
    <AuthContext.Provider value={{ user, login, logout, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
