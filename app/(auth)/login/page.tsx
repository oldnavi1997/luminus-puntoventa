import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Iniciar sesión — Luminus POS" };

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-surface-dark flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-accent rounded-2xl mb-4">
            <span className="text-white text-2xl font-bold">L</span>
          </div>
          <h1 className="text-2xl font-bold text-text">Luminus POS</h1>
          <p className="text-text-muted mt-1 text-sm">Acceso para personal autorizado</p>
        </div>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
