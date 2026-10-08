import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Boxes } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/login")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Entrar — Cubagem Angiolux" },
      { name: "description", content: "Acesso da equipe de expedição ao cálculo de cubagem Angiolux." },
      { property: "og:title", content: "Entrar — Cubagem Angiolux" },
      { property: "og:description", content: "Acesso da equipe de expedição ao cálculo de cubagem Angiolux." },
    ],
  }),
  component: LoginPage,
});

function traduzir(msg: string) {
  if (/invalid login/i.test(msg)) return "E-mail ou senha incorretos.";
  if (/already registered/i.test(msg)) return "Este e-mail já tem conta. Use a aba Entrar.";
  if (/password/i.test(msg) && /(weak|pwned|leaked|characters)/i.test(msg)) return "Senha fraca ou vazada. Use pelo menos 8 caracteres e uma senha única.";
  return msg;
}

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent, modo: "entrar" | "criar") {
    e.preventDefault();
    setBusy(true);
    const { error } =
      modo === "entrar"
        ? await supabase.auth.signInWithPassword({ email, password: senha })
        : await supabase.auth.signUp({ email, password: senha, options: { emailRedirectTo: window.location.origin } });
    setBusy(false);
    if (error) { toast.error(traduzir(error.message)); return; }
    toast.success(modo === "entrar" ? "Bem-vindo!" : "Conta criada.");
    navigate({ to: "/", replace: true });
  }

  const form = (modo: "entrar" | "criar") => (
    <form onSubmit={(e) => submit(e, modo)} className="space-y-4 pt-2">
      <div className="space-y-1.5">
        <Label htmlFor={`email-${modo}`}>E-mail</Label>
        <Input id={`email-${modo}`} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`senha-${modo}`}>Senha</Label>
        <Input id={`senha-${modo}`} type="password" required minLength={6} value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete={modo === "entrar" ? "current-password" : "new-password"} />
      </div>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Aguarde..." : modo === "entrar" ? "Entrar" : "Criar conta"}
      </Button>
    </form>
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Boxes className="h-6 w-6" />
          </div>
          <CardTitle>Cubagem Angiolux</CardTitle>
          <CardDescription>Volumes de expedição para cotação de frete</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="entrar">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="entrar">Entrar</TabsTrigger>
              <TabsTrigger value="criar">Criar conta</TabsTrigger>
            </TabsList>
            <TabsContent value="entrar">{form("entrar")}</TabsContent>
            <TabsContent value="criar">{form("criar")}</TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
