import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";
import { AlertTriangle, Calculator, Copy, FileUp, Loader2, Plus, Save, Trash2, Eraser, PackageX, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { caixasQuery, produtosQuery, fmtNum } from "@/lib/data";
import {
  agruparVolumes, calcular, caixasParaVolume, faixaVolumes, mapCaixas, mapProdutos, paraJson, textoParaCliente, trocarCaixa, dimsTxt, fmtKg, fmtBrl, m3Volume,
  pesoTotal, m3Total, volumeCaixa, DESCRICAO_ORIGEM, type Caixa, type Pedido, type Resultado, type CaixaRow, type ProdutoRow,
} from "@/lib/cubagem";
import { avisosCorreios, CEP_ORIGEM_ANGIOLUX, dimsCorreios, fmtCep, pesoCubico, pesoParaCotacao, textoParaCorreios } from "@/lib/correios";
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

const vazio = (): Pedido => ({ numero: "", cliente: "", data: "", tipo_frete: "", valor_total: null, itens: [], cep: "", cidade: "", uf: "" });

const ehPdf = (f: File) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");

/** "Caixa Terciária Angiolux Pequena" -> "Angiolux Pequena" */
const nomeCurto = (c: Caixa) => c.nome.replace(/^Caixa (Terciária|Secundária) /i, "");

/** Caixas marcadas como "não tenho hoje": lembradas no navegador até o fim do dia. */
const CHAVE_INDISP = "cubagem.indisponiveis";
function lerIndisponiveis(): number[] {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE_INDISP) ?? "null") as { dia: string; codigos: number[] } | null;
    return v && v.dia === new Date().toDateString() ? v.codigos : [];
  } catch {
    return [];
  }
}
function gravarIndisponiveis(codigos: number[]) {
  try {
    localStorage.setItem(CHAVE_INDISP, JSON.stringify({ dia: new Date().toDateString(), codigos }));
  } catch {
    /* navegador sem armazenamento: só não lembra */
  }
}

function CubagemPage() {
  const cx = useQuery(caixasQuery);
  const pr = useQuery(produtosQuery);
  const caixas = useMemo(() => mapCaixas((cx.data ?? []) as CaixaRow[]), [cx.data]);
  const produtos = useMemo(() => mapProdutos((pr.data ?? []) as ProdutoRow[]), [pr.data]);

  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [lendo, setLendo] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [res, setRes] = useState<Resultado | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [novoCod, setNovoCod] = useState("");
  const [novaQtd, setNovaQtd] = useState("1");
  const [indisponiveis, setIndisponiveis] = useState<number[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setIndisponiveis(lerIndisponiveis()); }, []);

  async function receber(file?: File | null) {
    if (!file) return;
    if (!ehPdf(file)) { toast.error("Envie o PDF do espelho do pedido (arquivo .pdf gerado pelo Odin)."); return; }
    setLendo("Lendo PDF...");
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
      setLendo(null);
    }
  }

  useEffect(() => {
    // Ctrl+V de um arquivo PDF copiado (ex.: no Explorador de Arquivos)
    function onPaste(e: ClipboardEvent) {
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA")) return;
      const arquivo = [...(e.clipboardData?.files ?? [])].find(ehPdf);
      if (!arquivo) return;
      e.preventDefault();
      void receber(arquivo);
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    setRes(calcular({ ...pedido, itens: pedido.itens.filter((i) => i.qtd > 0) }, produtos, caixas, undefined, { indisponiveis }));
  }

  function limpar() {
    setPedido(vazio());
    setRes(null);
  }

  async function salvar() {
    if (!res) return;
    setSalvando(true);
    const { data: u } = await supabase.auth.getUser();
    const j = paraJson(res);
    const { error } = await supabase.from("cubagens").insert({
      pedido: res.pedido.numero, cliente: res.pedido.cliente, data_pedido: res.pedido.data, tipo_frete: res.pedido.tipo_frete,
      cep: res.pedido.cep || null, cidade: res.pedido.cidade || null, uf: res.pedido.uf || null,
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
        <Button variant="outline" onClick={limpar}><Eraser className="mr-1 h-4 w-4" />Limpar</Button>
      </div>
      {erro && <div className="rounded-md border border-destructive/40 bg-danger-soft p-3 text-sm text-destructive">{(erro as Error).message}</div>}

      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e: DragEvent) => { e.preventDefault(); setDrag(false); void receber(e.dataTransfer.files[0]); }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors ${drag ? "border-primary bg-accent" : "border-input bg-card hover:border-primary/60"}`}
      >
        <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => { void receber(e.target.files?.[0]); e.target.value = ""; }} />
        {lendo ? <Loader2 className="h-8 w-8 animate-spin text-primary" /> : <FileUp className="h-8 w-8 text-primary" />}
        <p className="font-medium">{lendo ?? "Arraste o PDF do espelho do pedido ou clique para escolher"}</p>
        <p className="text-xs text-muted-foreground">Arquivo gerado pelo Odin (PDF em texto)</p>
      </div>

      {pedido && (
        <>
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Dados do pedido</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              <Campo label="Nº do pedido" value={pedido.numero} onChange={(v) => upd({ numero: v })} />
              <div className="lg:col-span-3"><Campo label="Cliente" value={pedido.cliente} onChange={(v) => upd({ cliente: v })} /></div>
              <Campo label="Data" value={pedido.data} onChange={(v) => upd({ data: v })} />
              <Campo label="Tipo de frete" value={pedido.tipo_frete} onChange={(v) => upd({ tipo_frete: v })} />
              <div className="lg:col-span-2">
                <Campo
                  label="CEP de entrega"
                  value={pedido.cep ?? ""}
                  onChange={(v) => upd({ cep: v.replace(/\D/g, "").slice(0, 8) })}
                  acao={pedido.cep ? <Button type="button" size="sm" variant="outline" className="h-9" onClick={() => copiar(fmtCep(pedido.cep))}><Copy className="mr-1 h-4 w-4" />Copiar CEP</Button> : undefined}
                />
              </div>
              <div className="lg:col-span-2"><Campo label="Cidade" value={pedido.cidade ?? ""} onChange={(v) => upd({ cidade: v })} /></div>
              <Campo label="UF" value={pedido.uf ?? ""} onChange={(v) => upd({ uf: v.toUpperCase().slice(0, 2) })} />
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

      {pedido && caixas.size > 0 && (
        <CaixasIndisponiveis
          caixas={caixas}
          marcadas={indisponiveis}
          onMudar={(cods) => {
            setIndisponiveis(cods);
            gravarIndisponiveis(cods);
            if (res && pedido) setRes(calcular({ ...pedido, itens: pedido.itens.filter((i) => i.qtd > 0) }, produtos, caixas, undefined, { indisponiveis: cods }));
          }}
        />
      )}

      {res && (
        <ResultadoView
          res={res}
          caixas={caixas}
          onTrocar={(indices, c) => setRes(indices.reduce((r, i) => trocarCaixa(r, i, c), res))}
          onRefazer={calc}
          onSalvar={salvar}
          salvando={salvando}
        />
      )}
    </div>
  );
}

function Campo({ label, value, onChange, acao }: { label: string; value: string; onChange: (v: string) => void; acao?: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex gap-2">
        <Input value={value} onChange={(e) => onChange(e.target.value)} />
        {acao}
      </div>
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

function CaixasIndisponiveis({ caixas, marcadas, onMudar }: { caixas: Map<number, Caixa>; marcadas: number[]; onMudar: (c: number[]) => void }) {
  const terciarias = [...caixas.values()].filter((c) => c.tipo === "terciaria");
  const angiolux = terciarias.filter((c) => !c.fornecedor).sort((a, b) => a.codigo - b.codigo);
  const fornecedor = terciarias.filter((c) => c.fornecedor).sort((a, b) => a.codigo - b.codigo);
  const alternar = (cod: number) => onMudar(marcadas.includes(cod) ? marcadas.filter((c) => c !== cod) : [...marcadas, cod]);
  const lista = (cs: Caixa[]) => (
    <div className="flex flex-wrap gap-2">
      {cs.map((c) => {
        const fora = marcadas.includes(c.codigo);
        return (
          <button
            key={c.codigo}
            type="button"
            onClick={() => alternar(c.codigo)}
            title={fora ? "Marcada como indisponível hoje: clique para voltar a usar" : "Clique se não tiver esta caixa hoje"}
            className={`rounded-md border px-2 py-1 text-xs transition-colors ${fora ? "border-destructive/50 bg-danger-soft text-destructive line-through" : "border-input bg-card hover:border-primary/60"}`}
          >
            <span className="font-semibold">{c.codigo}</span> · {nomeCurto(c)} <span className="text-muted-foreground">({dimsTxt(c)})</span>
          </button>
        );
      })}
    </div>
  );
  return (
    <details className="rounded-lg border bg-card p-4" open={marcadas.length > 0}>
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
        <PackageX className="h-4 w-4" />Caixas que não tenho hoje{marcadas.length ? ` (${marcadas.length} marcada(s))` : ""}
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs text-muted-foreground">Clique nas caixas em falta: o cálculo deixa de sugeri-las. A marcação vale até o fim do dia neste computador.</p>
        <div><p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Angiolux</p>{lista(angiolux)}</div>
        <div><p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Fornecedor (vazias para reaproveitar)</p>{lista(fornecedor)}</div>
      </div>
    </details>
  );
}

function ResultadoView({ res, caixas, onTrocar, onRefazer, onSalvar, salvando }: {
  res: Resultado;
  caixas: Map<number, Caixa>;
  onTrocar: (indices: number[], caixa: Caixa) => void;
  onRefazer: () => void;
  onSalvar: () => void;
  salvando: boolean;
}) {
  const texto = textoParaCliente(res);
  const editado = res.volumes.some((v) => v.editado);
  const grupos = agruparVolumes(res.volumes);
  const textoCorreios = textoParaCorreios(res);
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">Resultado</h2>
        {editado && <Button size="sm" variant="outline" onClick={onRefazer}><RotateCcw className="mr-1 h-4 w-4" />Desfazer trocas de caixa</Button>}
      </div>
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
              {grupos.map(({ volume: v, indices }) => {
                const i = indices[0]!;
                const n = indices.length;
                return (
                <TableRow key={i} className="align-top">
                  <TableCell className="whitespace-nowrap font-semibold">
                    {faixaVolumes(indices)}
                    {n > 1 && <div className="mt-1"><Badge variant="outline" className="whitespace-nowrap">{n} volumes iguais</Badge></div>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-sm">{dimsTxt(v.caixa)} cm</TableCell>
                  <TableCell className="whitespace-nowrap">{fmtKg(v.peso)} kg{n > 1 && <span className="text-xs text-muted-foreground"> cada</span>}</TableCell>
                  <TableCell>{fmtNum(m3Volume(v), 4)}{n > 1 && <span className="text-xs text-muted-foreground"> cada</span>}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-primary px-2 py-0.5 text-sm font-bold text-primary-foreground" title="Número da caixa (etiqueta da prateleira)">Caixa {v.caixa.codigo}</span>
                      <span className="font-medium">{nomeCurto(v.caixa)}</span>
                      <Badge variant="secondary">{DESCRICAO_ORIGEM[v.origem]}</Badge>
                      {v.editado && <Badge className="border-transparent bg-warning-soft text-warning">trocada manualmente</Badge>}
                    </div>
                    <ul className="mt-1 space-y-0.5 text-sm text-muted-foreground">{v.conteudo.map((c, k) => <li key={k}>{c}</li>)}</ul>
                    {v.pacotes.length > 0 && (
                      <div className="mt-2 flex items-center gap-2">
                        <Label htmlFor={`troca-${i}`} className="text-xs text-muted-foreground">{n > 1 ? `Trocar caixa dos ${n}` : "Trocar caixa"}</Label>
                        <select
                          id={`troca-${i}`}
                          className="h-8 max-w-md rounded-md border border-input bg-card px-2 text-xs"
                          value={v.caixa.codigo}
                          onChange={(e) => { const c = caixas.get(Number(e.target.value)); if (c) onTrocar(indices, c); }}
                        >
                          {!caixasParaVolume(v, caixas).some((o) => o.caixa.codigo === v.caixa.codigo) && (
                            <option value={v.caixa.codigo}>{v.caixa.codigo} · {nomeCurto(v.caixa)}</option>
                          )}
                          {caixasParaVolume(v, caixas)
                            .sort((a, b) => Number(a.caixa.fornecedor) - Number(b.caixa.fornecedor) || volumeCaixa(a.caixa) - volumeCaixa(b.caixa))
                            .map((o) => (
                              <option key={o.caixa.codigo} value={o.caixa.codigo}>
                                {o.caixa.codigo} · {nomeCurto(o.caixa)} · {dimsTxt(o.caixa)} · ocupa {Math.round(o.ocupacao * 100)}%{o.apertada ? " (apertada: conferir)" : ""}
                              </option>
                            ))}
                        </select>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
                );
              })}
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

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Dados para cotação nos Correios (SEDEX contrato)</CardTitle>
          <div className="flex gap-2">
            {res.pedido.cep && <Button size="sm" variant="outline" onClick={() => copiar(fmtCep(res.pedido.cep))}><Copy className="mr-1 h-4 w-4" />Copiar CEP</Button>}
            <Button size="sm" variant="outline" onClick={() => copiar(textoCorreios)}><Copy className="mr-1 h-4 w-4" />Copiar tudo</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">
            <span className="text-muted-foreground">Origem</span> <span className="font-mono">{fmtCep(CEP_ORIGEM_ANGIOLUX)}</span>
            <span className="mx-2 text-muted-foreground">→</span>
            <span className="text-muted-foreground">Destino</span>{" "}
            {res.pedido.cep ? <span className="font-mono font-semibold">{fmtCep(res.pedido.cep)}</span> : <span className="text-warning">CEP não informado</span>}
            {res.pedido.cidade && <span className="text-muted-foreground"> · {res.pedido.cidade}{res.pedido.uf ? `/${res.pedido.uf}` : ""}</span>}
          </p>
          <Table>
            <TableHeader><TableRow><TableHead className="w-10">Nº</TableHead><TableHead>C x L x A (cm)</TableHead><TableHead>Peso real</TableHead><TableHead>Peso cúbico</TableHead><TableHead>Peso p/ cotação</TableHead><TableHead>Observação</TableHead></TableRow></TableHeader>
            <TableBody>
              {grupos.map(({ volume: v, indices }) => {
                const [c, l, a] = dimsCorreios(v);
                const av = avisosCorreios(v);
                return (
                  <TableRow key={indices[0]}>
                    <TableCell className="whitespace-nowrap font-semibold">{faixaVolumes(indices)}{indices.length > 1 && <span className="font-normal text-muted-foreground"> ({indices.length}x)</span>}</TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-sm">{c} x {l} x {a}</TableCell>
                    <TableCell className="whitespace-nowrap">{fmtKg(v.peso)} kg</TableCell>
                    <TableCell className="whitespace-nowrap">{fmtKg(pesoCubico(v))} kg</TableCell>
                    <TableCell className="whitespace-nowrap font-semibold">{fmtKg(pesoParaCotacao(v))} kg</TableCell>
                    <TableCell className="text-sm">
                      {av.length ? <span className="text-destructive">Fora dos limites de SEDEX/PAC: {av.join("; ")}</span>
                        : pesoCubico(v) > v.peso ? <span className="text-muted-foreground">cobrado pelo peso cúbico (caixa grande para o conteúdo)</span>
                        : <span className="text-muted-foreground">cobrado pelo peso real</span>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <p className="text-xs text-muted-foreground">Os Correios cobram o maior entre o peso real e o peso cúbico (C x L x A ÷ 6000). Limites de SEDEX/PAC: cada lado até 100 cm, soma até 200 cm, até 30 kg.</p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={onSalvar} disabled={salvando}>
          {salvando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}Salvar no histórico
        </Button>
      </div>
    </section>
  );
}
