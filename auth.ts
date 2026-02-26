import NextAuth from "next-auth"
import { MongoDBAdapter } from "@auth/mongodb-adapter"
import Credentials from "next-auth/providers/credentials"
import clientPromise from "./lib/auth-client"

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: MongoDBAdapter(clientPromise),
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        if (
          credentials.email === "demo@example.com" &&
          credentials.password === "password"
        ) {
          return {
            id: "dummy-user-id",
            name: "Demo User",
            email: "demo@example.com",
            image: "https://avatar.vercel.sh/demo",
          }
        }
        return null
      },
    }),
  ],
  callbacks: {
    session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub
      }
      return session
    },
    jwt({ token, user }) {
      if (user) {
        token.sub = user.id
      }
      return token
    }
  },
  session: {
    strategy: "jwt",
  },
})
