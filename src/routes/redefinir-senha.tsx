import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Boxes } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export const Route = createFileRoute("/redefinir-senha")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Redefinir senha — Cubagem Angiolux" },
      { name: "description", content: "Defina uma nova senha de acesso ao Cubagem Angiolux." },
      { property: "og:title", content: "Redefinir senha — Cubagem Angiolux" },
      { property: "og:description", content: "Defina uma nova senha de acesso ao Cubagem Angiolux." },
    ],
  }),
  component: RedefinirSenhaPage,
});

function RedefinirSenhaPage() {
  const navigate = useNavigate();
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (senha !== confirmacao) { toast.error("As senhas não conferem."); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Senha redefinida com sucesso!");
    navigate({ to: "/", replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Boxes className="h-6 w-6" />
          </div>
          <CardTitle>Redefinir senha</CardTitle>
          <CardDescription>Escolha uma nova senha para a sua conta</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="nova-senha">Nova senha</Label>
              <Input id="nova-senha" type="password" required minLength={6} value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmar-senha">Confirmar nova senha</Label>
              <Input id="confirmar-senha" type="password" required minLength={6} value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} autoComplete="new-password" />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Aguarde..." : "Salvar nova senha"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
