import { verifyToken } from '@clerk/backend';
import type { HandlerEvent } from '@netlify/functions';

export interface AuthResult {
  authenticated: boolean;
  clerkUserId: string | null;
  error?: string;
}

export async function authenticateRequest(event: HandlerEvent): Promise<AuthResult> {
  const authHeader = event.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      authenticated: false,
      clerkUserId: null,
      error: 'Missing or invalid authorization header',
    };
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const secretKey = process.env.CLERK_SECRET_KEY;

    if (!secretKey) {
      console.error('CLERK_SECRET_KEY is not configured');
      return {
        authenticated: false,
        clerkUserId: null,
        error: 'Server configuration error',
      };
    }

    const verifiedToken = await verifyToken(token, {
      secretKey,
    });

    if (!verifiedToken.sub) {
      return {
        authenticated: false,
        clerkUserId: null,
        error: 'Invalid token: missing subject',
      };
    }

    return {
      authenticated: true,
      clerkUserId: verifiedToken.sub,
    };
  } catch (error) {
    console.error('Token verification failed:', error);
    return {
      authenticated: false,
      clerkUserId: null,
      error: 'Token verification failed',
    };
  }
}
