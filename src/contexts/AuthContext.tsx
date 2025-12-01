import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useUser } from '@clerk/clerk-react';
import { usersApi } from '../lib/api';
import type { User } from '../types';

interface AuthContextType {
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  user: User | null;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { isLoaded: clerkLoaded, isSignedIn, user: clerkUser } = useUser();
  const [user, setUser] = useState<User | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const fetchOrCreateUser = async () => {
    if (!isSignedIn || !clerkUser) {
      setUser(null);
      setIsLoaded(true);
      return;
    }

    try {
      // Try to get existing user
      const response = await usersApi.get();

      if (response.data) {
        setUser(response.data);
      } else if (response.error?.includes('not found') || response.error?.includes('404')) {
        // Create new user if not found
        const email = clerkUser.emailAddresses[0]?.emailAddress || '';
        const createResponse = await usersApi.create({
          email,
          first_name: clerkUser.firstName || undefined,
          last_name: clerkUser.lastName || undefined,
        });

        if (createResponse.data) {
          setUser(createResponse.data);
        }
      }
    } catch (error) {
      console.error('Error fetching/creating user:', error);
    } finally {
      setIsLoaded(true);
    }
  };

  const refreshUser = async () => {
    const response = await usersApi.get();
    if (response.data) {
      setUser(response.data);
    }
  };

  useEffect(() => {
    if (clerkLoaded) {
      fetchOrCreateUser();
    }
  }, [clerkLoaded, isSignedIn, clerkUser?.id]);

  const value: AuthContextType = {
    isLoaded: clerkLoaded && isLoaded,
    isSignedIn: isSignedIn || false,
    userId: clerkUser?.id || null,
    userEmail: clerkUser?.emailAddresses[0]?.emailAddress || null,
    userName: clerkUser?.fullName || clerkUser?.firstName || null,
    user,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
}
