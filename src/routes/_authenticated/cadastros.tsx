import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ShieldCheck, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { caixasQuery, produtosQuery, type CaixaDb, type ProdutoDb } from "@/lib/data";
import { mapCaixas, mapProdutos, validar, type CaixaRow, type ProdutoRow } from "@/lib/cubagem";
import { GradeEditavel, type Coluna } from "@/components/GradeEditavel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/cadastros")({
  head: () => ({
    meta: [
      { title: "Cadastros — Cubagem Angiolux" },
      { name: "description", content: "Manutenção dos cadastros de caixas e produtos usados na cubagem." },
      { property: "og:title", content: "Cadastros — Cubagem Angiolux" },
      { property: "og:description", content: "Manutenção dos cadastros de caixas e produtos usados na cubagem." },
    ],
  }),
  component: CadastrosPage,
});

const sel = "h-9 rounded-md border border-input bg-card px-2 text-sm";
const norm = (s: unknown) => String(s ?? "").toLowerCase();

function CadastrosPage() {
  const qc = useQueryClient();
  const cx = useQuery(caixasQuery);
  const pr = useQuery(produtosQuery);
  const caixas = cx.data ?? [];
  const produtos = pr.data ?? [];
  const [msgs, setMsgs] = useState<string[] | null>(null);

  // filtros
  const [qC, setQC] = useState(""); const [tipo, setTipo] = useState(""); const [forn, setForn] = useState("");
  const [qP, setQP] = useState(""); const [fab, setFab] = useState(""); const [semCaixa, setSemCaixa] = useState(false);

  const nomeCaixa = useMemo(() => new Map(caixas.map((c) => [c.codigo_caixa, c.nome_caixa])), [caixas]);
  const opt = (c: CaixaDb) => ({ value: String(c.codigo_caixa), label: `${c.codigo_caixa} – ${c.nome_caixa}` });
  const fabricantes = useMemo(() => [...new Set(produtos.map((p) => (p.fabricante ?? "").trim()).filter(Boolean))].sort(), [produtos]);

  const colsCaixa: Coluna[] = [
    { key: "codigo_caixa", label: "Cód.", kind: "int", required: true },
    { key: "nome_caixa", label: "Nome", kind: "text", required: true, className: "min-w-52" },
    { key: "tipo_caixa", label: "Tipo", kind: "select", required: true, options: [{ value: "secundaria", label: "secundária" }, { value: "terciaria", label: "terciária" }] },
    { key: "caixa_fornecedor", label: "Fornecedor", kind: "bool" },
    { key: "peso_caixa_kg", label: "Peso kg", kind: "num", min: 0 },
    { key: "largura_cm", label: "Larg.", kind: "num", min: 0 },
    { key: "altura_cm", label: "Alt.", kind: "num", min: 0 },
    { key: "comprimento_cm", label: "Comp.", kind: "num", min: 0 },
    { key: "quantidade_itens_por_caixa_secundaria", label: "Un/sec.", kind: "int", min: 0 },
    { key: "quantidade_itens_por_caixa_terciaria", label: "Un/terc.", kind: "int", min: 0 },
    { key: "caixas_secundarias_permitidas_na_terciaria", label: "Sec/terc.", kind: "int", min: 0 },
    { key: "caixa_terciaria_fornecedor", label: "Terc. fornecedor", kind: "select", options: caixas.filter((c) => c.tipo_caixa === "terciaria" && c.caixa_fornecedor).map(opt), className: "min-w-44" },
    { key: "terciaria_parcial_minimo", label: "Parcial mín.", kind: "num", min: 0, max: 1 },
    { key: "observacao", label: "Observação", kind: "text", className: "min-w-60" },
  ];
  const colsProduto: Coluna[] = [
    { key: "codigo", label: "Código", kind: "text", required: true, className: "font-mono" },
    { key: "nome_produto", label: "Nome", kind: "text", className: "min-w-72" },
    { key: "peso_unitario_kg", label: "Peso un. kg", kind: "num", min: 0 },
    { key: "codigo_caixa", label: "Caixa secundária", kind: "select", options: caixas.filter((c) => c.tipo_caixa === "secundaria").map(opt), className: "min-w-56",
      render: (v) => (v === null || v === undefined ? <span className="font-medium text-warning">sem caixa</span> : `${v} – ${nomeCaixa.get(Number(v)) ?? "?"}`) },
    { key: "fabricante", label: "Fabricante", kind: "text" },
  ];

  const caixasF = caixas.filter((c) =>
    (!qC || norm(c.codigo_caixa).includes(norm(qC)) || norm(c.nome_caixa).includes(norm(qC))) &&
    (!tipo || c.tipo_caixa === tipo) && (!forn || String(c.caixa_fornecedor) === forn));
  const produtosF = produtos.filter((p) =>
    (!qP || norm(p.codigo).includes(norm(qP)) || norm(p.nome_produto).includes(norm(qP))) &&
    (!fab || (p.fabricante ?? "").trim() === fab) && (!semCaixa || p.codigo_caixa === null));

  async function salvarCaixa(r: Record<string, unknown>) {
    const { error } = await supabase.from("caixas").upsert({ ...(r as CaixaDb), updated_at: new Date().toISOString() }, { onConflict: "codigo_caixa" });
    if (!error) await qc.invalidateQueries({ queryKey: ["caixas"] });
    return error?.message ?? null;
  }
  async function salvarProduto(r: Record<string, unknown>) {
    const { error } = await supabase.from("produtos").upsert({ ...(r as ProdutoDb), updated_at: new Date().toISOString() }, { onConflict: "codigo" });
    if (!error) await qc.invalidateQueries({ queryKey: ["produtos"] });
    return error?.message ?? null;
  }

  const carregando = cx.isLoading || pr.isLoading;
  const erro = cx.error || pr.error;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cadastros</h1>
          <p className="text-sm text-muted-foreground">{caixas.length} caixas / {produtos.length} produtos · duplo clique numa célula para editar</p>
        </div>
        <Button variant="outline" disabled={carregando} onClick={() => setMsgs(validar(mapProdutos(produtos as ProdutoRow[]), mapCaixas(caixas as CaixaRow[])))}>
          <ShieldCheck className="mr-1 h-4 w-4" />Validar cadastros
        </Button>
      </div>

      {msgs && (
        <div className={`rounded-lg border p-4 text-sm ${msgs.length ? "border-warning/40 bg-warning-soft" : "border-success/40 bg-success-soft"}`}>
          <div className="mb-1 flex items-center justify-between">
            <strong>{msgs.length ? `${msgs.length} ponto(s) de atenção` : "Nenhum problema encontrado"}</strong>
            <button className="text-xs underline" onClick={() => setMsgs(null)}>fechar</button>
          </div>
          {msgs.length > 0 && <ul className="list-disc space-y-0.5 pl-5">{msgs.map((m, i) => <li key={i}>{m}</li>)}</ul>}
        </div>
      )}

      {erro && <div className="rounded-md border border-destructive/40 bg-danger-soft p-3 text-sm text-destructive">{(erro as Error).message}</div>}
      {carregando ? (
        <div className="flex items-center gap-2 py-10 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando cadastros...</div>
      ) : (
        <Tabs defaultValue="caixas">
          <TabsList>
            <TabsTrigger value="caixas">Caixas ({caixas.length})</TabsTrigger>
            <TabsTrigger value="produtos">Produtos ({produtos.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="caixas" className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Input className="max-w-xs" placeholder="Buscar código ou nome" value={qC} onChange={(e) => setQC(e.target.value)} />
              <select className={sel} value={tipo} onChange={(e) => setTipo(e.target.value)}><option value="">Todos os tipos</option><option value="secundaria">Secundária</option><option value="terciaria">Terciária</option></select>
              <select className={sel} value={forn} onChange={(e) => setForn(e.target.value)}><option value="">Fornecedor: todos</option><option value="true">Fornecedor: sim</option><option value="false">Fornecedor: não</option></select>
              <span className="self-center text-sm text-muted-foreground">{caixasF.length} exibida(s)</span>
            </div>
            <GradeEditavel rows={caixasF} colunas={colsCaixa} pk="codigo_caixa" titulo="Nova caixa" onSalvar={salvarCaixa}
              onExcluir={async (id) => { const { error } = await supabase.from("caixas").delete().eq("codigo_caixa", Number(id)); if (!error) await qc.invalidateQueries({ queryKey: ["caixas"] }); return error?.message ?? null; }} />
          </TabsContent>
          <TabsContent value="produtos" className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Input className="max-w-xs" placeholder="Buscar código ou nome" value={qP} onChange={(e) => setQP(e.target.value)} />
              <select className={sel} value={fab} onChange={(e) => setFab(e.target.value)}><option value="">Todos os fabricantes</option>{fabricantes.map((f) => <option key={f}>{f}</option>)}</select>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={semCaixa} onChange={(e) => setSemCaixa(e.target.checked)} />Sem caixa</label>
              <span className="self-center text-sm text-muted-foreground">{produtosF.length} exibido(s)</span>
            </div>
            <GradeEditavel rows={produtosF} colunas={colsProduto} pk="codigo" titulo="Novo produto" onSalvar={salvarProduto}
              onExcluir={async (id) => { const { error } = await supabase.from("produtos").delete().eq("codigo", String(id)); if (!error) await qc.invalidateQueries({ queryKey: ["produtos"] }); return error?.message ?? null; }} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
