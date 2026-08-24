import { PasswordForm } from "./PasswordForm";

export default function PasswordPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-xl">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">
            Definir nova senha
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Crie uma senha segura para os próximos acessos ao painel.
          </p>
        </div>
        <PasswordForm />
      </div>
    </div>
  );
}

