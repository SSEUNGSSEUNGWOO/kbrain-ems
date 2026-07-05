'use client';

import { createContext, useContext } from 'react';
import type { OperatorRole } from './auth';

type AuthContextType = {
  name: string;
  role: OperatorRole;
  title: string;
  isDeveloper: boolean;
  isAssistant: boolean;
  isReadOnly: boolean;
};

const AuthContext = createContext<AuthContextType>({
  name: '',
  role: 'viewer',
  title: '',
  isDeveloper: false,
  isAssistant: false,
  isReadOnly: true
});

export function AuthProvider({
  name,
  role,
  title,
  children
}: {
  name: string;
  role: OperatorRole;
  title: string;
  children: React.ReactNode;
}) {
  const isAssistant = role === 'assistant';
  const isReadOnly = role === 'viewer' || isAssistant;
  const isDeveloper = !!name && !isReadOnly;
  return (
    <AuthContext.Provider value={{ name, role, title, isDeveloper, isAssistant, isReadOnly }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
