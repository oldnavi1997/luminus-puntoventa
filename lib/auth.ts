import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

const POS_ROLES = ["CASHIER", "SUPERVISOR", "ADMIN"] as const;

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user || !user.password) return null;
        if (!POS_ROLES.includes(user.role as typeof POS_ROLES[number])) return null;

        const isValid = await bcrypt.compare(credentials.password, user.password);
        if (!isValid) return null;

        // Attach active session id
        const activeSession = await prisma.posSession.findFirst({
          where: { userId: user.id, status: "OPEN" },
          select: { id: true },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          posSessionId: activeSession?.id ?? null,
        };
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id;
        token.role = (user as unknown as { role: string }).role;
        token.posSessionId = (user as { posSessionId?: string | null }).posSessionId ?? null;
      }
      // Refresh posSessionId on every request
      if (trigger === "update" || (!user && token.id)) {
        const activeSession = await prisma.posSession.findFirst({
          where: { userId: token.id as string, status: "OPEN" },
          select: { id: true },
        });
        token.posSessionId = activeSession?.id ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.posSessionId = (token.posSessionId as string | null) ?? null;
      }
      return session;
    },
  },
};
