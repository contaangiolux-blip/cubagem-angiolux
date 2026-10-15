import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Boxes, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { traduzirErroAuth } from "@/lib/authErros";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

// Captura a URL antes que o cliente de autenticação limpe o token do endereço.
const urlInicial = typeof window !== "undefined" ? window.location.href : "";

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

type Estado = { tipo: "verificando" } | { tipo: "pronto" } | { tipo: "invalido"; motivo: string };

function lerLink(href: string) {
  const url = new URL(href || "http://x/");
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const get = (k: string) => url.searchParams.get(k) ?? hash.get(k);
  return {
    erro: get("error_description"),
    erroCodigo: get("error_code") ?? get("error"),
    code: url.searchParams.get("code"),
    tokenHash: get("token_hash"),
    tipo: get("type"),
    accessToken: hash.get("access_token"),
  };
}

function motivoErro(codigo: string | null, descricao: string | null) {
  if (codigo === "otp_expired" || /expired/i.test(descricao ?? ""))
    return "Este link de redefinição expirou ou já foi usado.";
  return "Este link de redefinição é inválido.";
}

function RedefinirSenhaPage() {
  const navigate = useNavigate();
  const [estado, setEstado] = useState<Estado>({ tipo: "verificando" });
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let ativo = true;
    const link = lerLink(urlInicial);
    const ok = () => ativo && setEstado({ tipo: "pronto" });
    const falha = (motivo: string) => ativo && setEstado({ tipo: "invalido", motivo });

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") ok();
    });

    (async () => {
      if (link.erro || link.erroCodigo) return falha(motivoErro(link.erroCodigo, link.erro));

      if (link.code) {
        const { error } = await supabase.auth.exchangeCodeForSession(link.code);
        return error ? falha(motivoErro(null, error.message)) : ok();
      }
      if (link.tokenHash && link.tipo === "recovery") {
        const { error } = await supabase.auth.verifyOtp({ type: "recovery", token_hash: link.tokenHash });
        return error ? falha(motivoErro(null, error.message)) : ok();
      }
      if (link.accessToken && link.tipo === "recovery") {
        // Fluxo por token na URL: o cliente cria a sessão de recuperação automaticamente.
        const { data, error } = await supabase.auth.getSession();
        return error || !data.session ? falha("Este link de redefinição é inválido ou expirou.") : ok();
      }
      falha("Abra esta página pelo link enviado ao seu e-mail.");
    })();

    return () => { ativo = false; sub.subscription.unsubscribe(); };
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (senha !== confirmacao) { toast.error("As senhas não conferem."); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setBusy(false);
    if (error) {
      const msg = traduzirErroAuth(error.message, error.code);
      toast.error(msg);
      if (/session/i.test(error.message)) setEstado({ tipo: "invalido", motivo: "Sua sessão de recuperação expirou." });
      return;
    }
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
          <CardDescription>
            {estado.tipo === "pronto" ? "Escolha uma nova senha para a sua conta" : "Cubagem Angiolux"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {estado.tipo === "verificando" && (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Validando link...
            </div>
          )}
          {estado.tipo === "invalido" && <PedirNovoLink motivo={estado.motivo} />}
          {estado.tipo === "pronto" && (
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="nova-senha">Nova senha</Label>
                <Input id="nova-senha" type="password" required minLength={8} value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirmar-senha">Confirmar nova senha</Label>
                <Input id="confirmar-senha" type="password" required minLength={8} value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} autoComplete="new-password" />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Aguarde..." : "Salvar nova senha e entrar"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PedirNovoLink({ motivo }: { motivo: string }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });
    setBusy(false);
    if (error) { toast.error(traduzirErroAuth(error.message, error.code)); return; }
    setEnviado(true);
    toast.success("Novo link enviado. Verifique seu e-mail (e a caixa de spam).");
  }

  return (
    <div className="space-y-4">
      <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
        {motivo} Peça um novo link abaixo.
      </div>
      {enviado ? (
        <p className="text-sm text-muted-foreground">
          Se houver uma conta para <strong>{email}</strong>, o novo link chegará em instantes. Ele vale por tempo limitado e só pode ser usado uma vez.
        </p>
      ) : (
        <form onSubmit={enviar} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="email-novo-link">E-mail</Label>
            <Input id="email-novo-link" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Enviando..." : "Pedir novo link"}
          </Button>
        </form>
      )}
      <a href="/login" className="block text-center text-sm text-muted-foreground underline-offset-4 hover:underline">
        Voltar para o login
      </a>
    </div>
  );
}
