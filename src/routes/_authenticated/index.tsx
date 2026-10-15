import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";
import { AlertTriangle, Calculator, Copy, FileUp, Loader2, Plus, Save, Trash2, Eraser } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { caixasQuery, produtosQuery, fmtNum } from "@/lib/data";
import {
  calcular, mapCaixas, mapProdutos, paraJson, textoParaCliente, dimsTxt, fmtKg, fmtBrl, m3Volume,
  pesoTotal, m3Total, DESCRICAO_ORIGEM, type Pedido, type Resultado, type CaixaRow, type ProdutoRow,
} from "@/lib/cubagem";
import { lerPedidoPdf } from "@/lib/lerPdf";
import { copiar } from "@/lib/copiar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Cubagem — Cubagem Angiolux" },
      { name: "description", content: "Envie o espelho do pedido e calcule volumes, dimensões e peso para cotação de frete." },
      { property: "og:title", content: "Cubagem — Cubagem Angiolux" },
      { property: "og:description", content: "Envie o espelho do pedido e calcule volumes, dimensões e peso para cotação de frete." },
    ],
  }),
  component: CubagemPage,
});

const vazio = (): Pedido => ({ numero: "", cliente: "", data: "", tipo_frete: "", valor_total: null, itens: [] });


function CubagemPage() {
  const cx = useQuery(caixasQuery);
  const pr = useQuery(produtosQuery);
  const caixas = useMemo(() => mapCaixas((cx.data ?? []) as CaixaRow[]), [cx.data]);
  const produtos = useMemo(() => mapProdutos((pr.data ?? []) as ProdutoRow[]), [pr.data]);

  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [lendo, setLendo] = useState(false);
  const [drag, setDrag] = useState(false);
  const [res, setRes] = useState<Resultado | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [novoCod, setNovoCod] = useState("");
  const [novaQtd, setNovaQtd] = useState("1");
  const fileRef = useRef<HTMLInputElement>(null);

  async function receber(file?: File) {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) { toast.error("Envie um arquivo PDF."); return; }
    setLendo(true);
    setRes(null);
    try {
      const p = await lerPedidoPdf(file);
      setPedido(p);
      if (!p.itens.length) toast.warning("Nenhum item encontrado. O arquivo é um espelho de pedido do Odin em texto (não imagem)?");
      else toast.success(`Pedido ${p.numero || ""} lido: ${p.itens.length} item(ns)`);
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível ler o PDF.");
    } finally {
      setLendo(false);
    }
  }

  const upd = (patch: Partial<Pedido>) => { setPedido((p) => ({ ...(p ?? vazio()), ...patch })); setRes(null); };
  const setItens = (fn: (i: Pedido["itens"]) => Pedido["itens"]) => upd({ itens: fn(pedido?.itens ?? []) });

  function adicionar() {
    const cod = novoCod.trim();
    const q = parseInt(novaQtd, 10);
    if (!cod || !(q > 0)) { toast.error("Informe código e quantidade."); return; }
    const prod = produtos.get(cod.toUpperCase());
    setItens((it) => [...it, { codigo: prod?.codigo ?? cod, descricao: prod?.nome ?? "", qtd: q }]);
    setNovoCod(""); setNovaQtd("1");
  }

  function calc() {
    if (!pedido?.itens.length) { toast.error("Adicione ao menos um item."); return; }
    setRes(calcular({ ...pedido, itens: pedido.itens.filter((i) => i.qtd > 0) }, produtos, caixas));
  }

  async function salvar() {
    if (!res) return;
    setSalvando(true);
    const { data: u } = await supabase.auth.getUser();
    const j = paraJson(res);
    const { error } = await supabase.from("cubagens").insert({
      pedido: res.pedido.numero, cliente: res.pedido.cliente, data_pedido: res.pedido.data, tipo_frete: res.pedido.tipo_frete,
      valor_nf: res.pedido.valor_total, itens: j.itens, volumes: j.volumes, resultado: j, texto_cliente: textoParaCliente(res),
      quantidade_volumes: j.quantidade_volumes, peso_total_kg: j.peso_total_kg, m3_total: j.m3_total,
      user_id: u.user?.id ?? null, user_email: u.user?.email ?? null,
    });
    setSalvando(false);
    if (error) toast.error(`Erro ao salvar: ${error.message}`);
    else toast.success("Cubagem salva no histórico");
  }

  const carregando = cx.isLoading || pr.isLoading;
  const erro = cx.error || pr.error;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cubagem do pedido</h1>
          <p className="text-sm text-muted-foreground">
            {carregando ? "Carregando cadastros..." : erro ? "" : `${produtos.size} produtos e ${caixas.size} caixas cadastrados`}
          </p>
        </div>
        <Button variant="outline" onClick={() => { setPedido(vazio()); setRes(null); }}><Eraser className="mr-1 h-4 w-4" />Limpar</Button>
      </div>
      {erro && <div className="rounded-md border border-destructive/40 bg-danger-soft p-3 text-sm text-destructive">{(erro as Error).message}</div>}

      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e: DragEvent) => { e.preventDefault(); setDrag(false); receber(e.dataTransfer.files[0]); }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors ${drag ? "border-primary bg-accent" : "border-input bg-card hover:border-primary/60"}`}
      >
        <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => { receber(e.target.files?.[0]); e.target.value = ""; }} />
        {lendo ? <Loader2 className="h-8 w-8 animate-spin text-primary" /> : <FileUp className="h-8 w-8 text-primary" />}
        <p className="font-medium">{lendo ? "Lendo PDF..." : "Arraste o PDF do espelho do pedido ou clique para escolher"}</p>
        <p className="text-xs text-muted-foreground">Arquivo gerado pelo Odin (PDF em texto)</p>
      </div>

      {pedido && (
        <>
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Dados do pedido</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Campo label="Nº do pedido" value={pedido.numero} onChange={(v) => upd({ numero: v })} />
              <div className="lg:col-span-2"><Campo label="Cliente" value={pedido.cliente} onChange={(v) => upd({ cliente: v })} /></div>
              <Campo label="Data" value={pedido.data} onChange={(v) => upd({ data: v })} />
              <Campo label="Tipo de frete" value={pedido.tipo_frete} onChange={(v) => upd({ tipo_frete: v })} />
              <Campo
                label="Valor da NF (R$)"
                value={pedido.valor_total === null ? "" : String(pedido.valor_total).replace(".", ",")}
                onChange={(v) => { const n = Number(v.replace(/\./g, "").replace(",", ".")); upd({ valor_total: v.trim() === "" || !Number.isFinite(n) ? null : n }); }}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Itens ({pedido.itens.length})</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {pedido.itens.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum item. Envie um PDF ou adicione manualmente abaixo.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow><TableHead className="w-36">Código</TableHead><TableHead>Descrição</TableHead><TableHead className="w-28">Qtd</TableHead><TableHead className="w-32">Status</TableHead><TableHead className="w-12" /></TableRow>
                  </TableHeader>
                  <TableBody>
                    {pedido.itens.map((it, idx) => {
                      const p = produtos.get(it.codigo.toUpperCase());
                      return (
                        <TableRow key={idx}>
                          <TableCell className="font-mono text-sm">{it.codigo}</TableCell>
                          <TableCell className="text-sm">{it.descricao || p?.nome || "-"}</TableCell>
                          <TableCell>
                            <Input type="number" min={0} className="h-8 w-24" value={it.qtd}
                              onChange={(e) => setItens((l) => l.map((x, i) => (i === idx ? { ...x, qtd: parseInt(e.target.value, 10) || 0 } : x)))} />
                          </TableCell>
                          <TableCell>
                            {!p ? <Badge className="border-transparent bg-danger-soft text-destructive">sem cadastro</Badge>
                              : p.codigo_caixa === null ? <Badge className="border-transparent bg-warning-soft text-warning">sem caixa</Badge>
                              : <Badge className="border-transparent bg-success-soft text-success">cadastrado</Badge>}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" aria-label="Remover" onClick={() => setItens((l) => l.filter((_, i) => i !== idx))}><Trash2 className="h-4 w-4" /></Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
              <div className="flex flex-wrap items-end gap-2 border-t pt-4">
                <div className="min-w-64 flex-1 space-y-1">
                  <Label htmlFor="novo-cod">Adicionar item (código ou nome)</Label>
                  <Input id="novo-cod" list="lista-produtos" value={novoCod} onChange={(e) => setNovoCod(e.target.value)} placeholder="Ex.: BM-FA0611" onKeyDown={(e) => e.key === "Enter" && adicionar()} />
                  <datalist id="lista-produtos">
                    {[...produtos.values()].map((p) => <option key={p.codigo} value={p.codigo}>{p.nome}</option>)}
                  </datalist>
                </div>
                <div className="w-24 space-y-1">
                  <Label htmlFor="nova-qtd">Qtd</Label>
                  <Input id="nova-qtd" type="number" min={1} value={novaQtd} onChange={(e) => setNovaQtd(e.target.value)} onKeyDown={(e) => e.key === "Enter" && adicionar()} />
                </div>
                <Button variant="secondary" onClick={adicionar}><Plus className="mr-1 h-4 w-4" />Adicionar</Button>
              </div>
            </CardContent>
          </Card>

          <Button size="lg" className="h-12 w-full text-base" onClick={calc} disabled={carregando || !!erro}>
            <Calculator className="mr-2 h-5 w-5" />Calcular cubagem
          </Button>
        </>
      )}

      {res && <ResultadoView res={res} onSalvar={salvar} salvando={salvando} />}
    </div>
  );
}

function Campo({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function Resumo({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <Card><CardContent className="p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{titulo}</p>
      <p className="mt-1 text-2xl font-semibold text-primary">{valor}</p>
    </CardContent></Card>
  );
}

function ResultadoView({ res, onSalvar, salvando }: { res: Resultado; onSalvar: () => void; salvando: boolean }) {
  const texto = textoParaCliente(res);
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">Resultado</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Resumo titulo="Volumes" valor={String(res.volumes.length)} />
        <Resumo titulo="Peso total" valor={`${fmtKg(pesoTotal(res))} kg`} />
        <Resumo titulo="m³ total" valor={fmtNum(m3Total(res), 4)} />
        <Resumo titulo="Valor da NF" valor={fmtBrl(res.pedido.valor_total)} />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead className="w-10">Nº</TableHead><TableHead>Dimensões</TableHead><TableHead>Peso</TableHead><TableHead>m³</TableHead><TableHead>Caixa / conteúdo</TableHead></TableRow></TableHeader>
            <TableBody>
              {res.volumes.map((v, i) => (
                <TableRow key={i} className="align-top">
                  <TableCell className="font-semibold">{i + 1}</TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-sm">{dimsTxt(v.caixa)} cm</TableCell>
                  <TableCell className="whitespace-nowrap">{fmtKg(v.peso)} kg</TableCell>
                  <TableCell>{fmtNum(m3Volume(v), 4)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{v.caixa.nome}</span>
                      <Badge variant="secondary">{DESCRICAO_ORIGEM[v.origem]}</Badge>
                    </div>
                    <ul className="mt-1 space-y-0.5 text-sm text-muted-foreground">{v.conteudo.map((c, k) => <li key={k}>{c}</li>)}</ul>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {res.nao_cubados.length > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning-soft p-4">
          <h3 className="mb-2 flex items-center gap-2 font-semibold text-warning"><AlertTriangle className="h-4 w-4" />Itens não cubados</h3>
          <ul className="space-y-1 text-sm">{res.nao_cubados.map((n, i) => <li key={i}><span className="font-mono">{n.item.codigo}</span> × {n.item.qtd} — {n.motivo}</li>)}</ul>
        </div>
      )}
      {res.avisos.length > 0 && (
        <div className="rounded-lg border bg-muted p-4">
          <h3 className="mb-2 font-semibold">Avisos</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm">{res.avisos.map((a, i) => <li key={i}>{a}</li>)}</ul>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Texto para o cliente</CardTitle>
          <Button size="sm" variant="outline" onClick={() => copiar(texto)}><Copy className="mr-1 h-4 w-4" />Copiar</Button>
        </CardHeader>
        <CardContent><pre className="whitespace-pre-wrap rounded-md bg-muted p-4 font-mono text-sm">{texto}</pre></CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={onSalvar} disabled={salvando}>
          {salvando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}Salvar no histórico
        </Button>
      </div>
    </section>
  );
}
