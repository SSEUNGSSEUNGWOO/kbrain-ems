'use client';

import { createContext, useContext } from 'react';
import type { OperatorRole } from './auth';

type AuthContextType = {
  name: string;
  role: OperatorRole;
  title: string;
  isDeveloper: boolean;
};

const AuthContext = createContext<AuthContextType>({
  name: '',
  role: 'operator',
  title: '',
  isDeveloper: false
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
  return (
    <AuthContext.Provider value={{ name, role, title, isDeveloper: role === 'developer' }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
