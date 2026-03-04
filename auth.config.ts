import type { NextAuthConfig } from 'next-auth';

export const authConfig = {
    pages: {
        signIn: '/auth/signin',
    },
    callbacks: {
        session({ session, token }) {
            if (session.user && token.sub) {
                session.user.id = token.sub;
                session.user.role = token.role as string | undefined;
            }
            return session;
        },
        jwt({ token, user }) {
            if (user) {
                token.sub = user.id;
                token.role = (user as { role?: string }).role;
            }
            return token;
        },
    },
    providers: [], // Added in auth.ts
} satisfies NextAuthConfig;