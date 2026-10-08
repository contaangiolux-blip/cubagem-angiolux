import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Copy, Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cubagensQuery, fmtDataHora, fmtNum, type CubagemDb } from "@/lib/data";
import { DESCRICAO_ORIGEM, type Origem } from "@/lib/cubagem";
import { copiar } from "@/lib/copiar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/historico")({
  head: () => ({
    meta: [
      { title: "Histórico — Cubagem Angiolux" },
      { name: "description", content: "Cubagens salvas pela equipe, com volumes e texto para o cliente." },
      { property: "og:title", content: "Histórico — Cubagem Angiolux" },
      { property: "og:description", content: "Cubagens salvas pela equipe, com volumes e texto para o cliente." },
    ],
  }),
  component: HistoricoPage,
});

type VolJson = { caixa: string; dimensoes_cm: number[]; peso_kg: number; m3: number; origem: Origem; conteudo: string[] };

function HistoricoPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery(cubagensQuery);
  const { user } = Route.useRouteContext();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<CubagemDb | null>(null);

  const lista = (data ?? []).filter((c) => !q || `${c.pedido} ${c.cliente}`.toLowerCase().includes(q.toLowerCase()));

  async function excluir(id: string) {
    if (!confirm("Excluir este registro do histórico?")) return;
    const { error } = await supabase.from("cubagens").delete().eq("id", id);
    if (error) return toast.error(`Erro ao excluir: ${error.message}`);
    toast.success("Registro excluído");
    setSel(null);
    qc.invalidateQueries({ queryKey: ["cubagens"] });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Histórico</h1>
          <p className="text-sm text-muted-foreground">{data ? `${data.length} cubagem(ns) salva(s)` : ""}</p>
        </div>
        <Input className="max-w-xs" placeholder="Buscar pedido ou cliente" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {error && <div className="rounded-md border border-destructive/40 bg-danger-soft p-3 text-sm text-destructive">{(error as Error).message}</div>}
      {isLoading ? (
        <div className="flex items-center gap-2 py-10 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando histórico...</div>
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader><TableRow><TableHead>Data/hora</TableHead><TableHead>Pedido</TableHead><TableHead>Cliente</TableHead><TableHead className="text-right">Volumes</TableHead><TableHead className="text-right">Peso (kg)</TableHead><TableHead className="text-right">m³</TableHead><TableHead>Usuário</TableHead></TableRow></TableHeader>
            <TableBody>
              {lista.length === 0 && <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Nenhuma cubagem salva.</TableCell></TableRow>}
              {lista.map((c) => (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => setSel(c)}>
                  <TableCell className="whitespace-nowrap text-sm">{fmtDataHora(c.created_at)}</TableCell>
                  <TableCell className="font-medium">{c.pedido || "-"}</TableCell>
                  <TableCell className="max-w-80 truncate text-sm">{c.cliente || "-"}</TableCell>
                  <TableCell className="text-right">{c.quantidade_volumes}</TableCell>
                  <TableCell className="text-right">{fmtNum(c.peso_total_kg)}</TableCell>
                  <TableCell className="text-right">{fmtNum(c.m3_total, 4)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{c.user_email}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!sel} onOpenChange={(o) => !o && setSel(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          {sel && (
            <>
              <DialogHeader>
                <DialogTitle>Pedido {sel.pedido || "-"}</DialogTitle>
                <DialogDescription>{sel.cliente} · {sel.data_pedido} · {sel.tipo_frete} · salvo em {fmtDataHora(sel.created_at)} por {sel.user_email}</DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                {((sel.volumes ?? []) as VolJson[]).map((v, i) => (
                  <div key={i} className="rounded-md border p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong>#{i + 1}</strong>
                      <span className="font-mono">{v.dimensoes_cm.map((d) => String(d).replace(".", ",")).join(" x ")} cm</span>
                      <span>{fmtNum(v.peso_kg)} kg</span><span>{fmtNum(v.m3, 4)} m³</span>
                      <span className="font-medium">{v.caixa}</span>
                      <Badge variant="secondary">{DESCRICAO_ORIGEM[v.origem] ?? v.origem}</Badge>
                    </div>
                    <ul className="mt-1 text-muted-foreground">{v.conteudo.map((t, k) => <li key={k}>{t}</li>)}</ul>
                  </div>
                ))}
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <h3 className="font-semibold">Texto para o cliente</h3>
                  <Button size="sm" variant="outline" onClick={() => copiar(sel.texto_cliente ?? "")}><Copy className="mr-1 h-4 w-4" />Copiar</Button>
                </div>
                <pre className="whitespace-pre-wrap rounded-md bg-muted p-3 font-mono text-sm">{sel.texto_cliente}</pre>
              </div>
              {sel.user_id === user.id && (
                <div className="flex justify-end">
                  <Button variant="destructive" onClick={() => excluir(sel.id)}><Trash2 className="mr-1 h-4 w-4" />Excluir registro</Button>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
