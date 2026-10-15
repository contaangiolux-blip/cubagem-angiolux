/**
 * Motor de cubagem Angiolux. Nasceu como porte do protótipo Python (cubagem.py) e evoluiu com o
 * uso na expedição (out/2026): as sobras vão sempre que possível para a caixa original do
 * fornecedor (economia de caixas compradas), balões só dividem caixa com balões, e o mesmo
 * produto não é repartido entre caixas quando dá. Regras detalhadas em `calcular` e no README.
 * Peso = produtos + secundárias + terciária.
 */

export const FATOR_OCUPACAO = 0.85;

// --------------------------------------------------------------------------- //
// Modelo de dados
// --------------------------------------------------------------------------- //
export interface Caixa {
  codigo: number;
  nome: string;
  peso: number;
  dims: [number, number, number]; // largura, altura, comprimento
  tipo: "secundaria" | "terciaria" | string;
  fornecedor: boolean;
  itens_sec: number | null;      // unidades por caixa secundária
  itens_terc: number | null;     // unidades por caixa terciária do fornecedor
  secs_na_terc: number | null;   // nº de secundárias dentro da terciária do fornecedor
  terc_fornecedor: number | null; // (só secundária) código da terciária original
  parcial_min: number | null;    // (terciária fornecedor) fração mínima p/ usar a caixa original incompleta; vazio = sempre
  /** (secundária) embalagem frágil (balões): só divide caixa com outras frágeis */
  fragil: boolean;
  observacao: string;
}

export interface Produto {
  codigo: string;
  nome: string;
  peso: number;
  codigo_caixa: number | null;
  fabricante: string;
}

export interface ItemPedido {
  codigo: string;
  descricao: string;
  qtd: number;
  valor_unit?: number | null;
  total?: number | null;
}

export interface Pedido {
  numero: string;
  cliente: string;
  data: string;
  tipo_frete: string;
  valor_total: number | null;
  itens: ItemPedido[];
  /** endereço de entrega (para cotação nos Correios) */
  cep?: string;
  cidade?: string;
  uf?: string;
}

export interface Pacote {
  caixa: Caixa;
  produto: Produto;
  unidades: number;
}

export type Origem = "fornecedor" | "fornecedor_parcial" | "reaproveitada" | "angiolux";

export interface Volume {
  caixa: Caixa;
  origem: Origem;
  peso: number;
  conteudo: string[];
  pacotes: Pacote[];
  /** caixa trocada manualmente na tela */
  editado?: boolean;
}

export interface NaoCubado {
  item: ItemPedido;
  motivo: string;
}

export interface Resultado {
  pedido: Pedido;
  volumes: Volume[];
  avisos: string[];
  nao_cubados: NaoCubado[];
  peso_nao_cubado: number;
}

// --------------------------------------------------------------------------- //
// Utilidades (equivalentes a _num, volume, dims_ord, cabe ...)
// --------------------------------------------------------------------------- //
/** Converte "1,5" / "1.5" / "" / null em número (ou default). */
export function num(v: unknown, def: number | null = null): number | null {
  if (v === null || v === undefined) return def;
  const s = String(v).trim().replace(",", ".");
  if (s === "") return def;
  const f = Number(s);
  if (!Number.isFinite(f)) return def;
  return f;
}

export function volumeCaixa(c: Caixa): number {
  return c.dims[0] * c.dims[1] * c.dims[2];
}

export function dimsOrd(c: Caixa): [number, number, number] {
  return [...c.dims].sort((a, b) => a - b) as [number, number, number];
}

/** `outra` cabe (individualmente) dentro de `c`? */
export function cabe(c: Caixa, outra: Caixa): boolean {
  const a = dimsOrd(outra);
  const b = dimsOrd(c);
  return a[0] <= b[0] && a[1] <= b[1] && a[2] <= b[2];
}

export function fmtDim(d: number): string {
  if (Number.isInteger(d)) return String(d);
  // equivalente a f"{d:g}" com vírgula decimal
  return String(parseFloat(d.toPrecision(6))).replace(".", ",");
}

export function dimsTxt(c: Caixa): string {
  return c.dims.map(fmtDim).join(" x ");
}

export function fmtKg(v: number): string {
  return v.toFixed(2).replace(".", ",");
}

export function fmtBrl(v: number | null | undefined): string {
  if (v === null || v === undefined) return "-";
  return (
    "R$ " +
    v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

export function pesoPacote(p: Pacote): number {
  return p.caixa.peso + p.unidades * p.produto.peso;
}

export function volumePacote(p: Pacote): number {
  return volumeCaixa(p.caixa);
}

export function descricaoPacote(p: Pacote): string {
  const cheia = p.unidades === p.caixa.itens_sec ? "cheia" : "parcial";
  return `${p.caixa.nome} (${cheia}, ${p.unidades} un ${p.produto.codigo})`;
}

export function m3Volume(v: Volume): number {
  return volumeCaixa(v.caixa) / 1_000_000;
}

export function pesoTotal(r: Resultado): number {
  return r.volumes.reduce((s, v) => s + v.peso, 0) + r.peso_nao_cubado;
}

export function m3Total(r: Resultado): number {
  return r.volumes.reduce((s, v) => s + m3Volume(v), 0);
}

/** Arredonda como round(x, n) do Python (suficiente para os casos de uso). */
export function round(x: number, n: number): number {
  const f = Math.pow(10, n);
  return Math.round((x + Number.EPSILON) * f) / f;
}

// --------------------------------------------------------------------------- //
// Conversão das linhas do banco/CSV para o modelo
// --------------------------------------------------------------------------- //
/** Linha da tabela `caixas` (mesmos nomes de coluna do caixas.csv). */
export interface CaixaRow {
  codigo_caixa: number | string;
  nome_caixa: string;
  peso_caixa_kg: number | string | null;
  largura_cm: number | string | null;
  altura_cm: number | string | null;
  comprimento_cm: number | string | null;
  tipo_caixa: string;
  caixa_fornecedor: boolean | string | null;
  quantidade_itens_por_caixa_secundaria: number | string | null;
  quantidade_itens_por_caixa_terciaria: number | string | null;
  caixas_secundarias_permitidas_na_terciaria: number | string | null;
  caixa_terciaria_fornecedor: number | string | null;
  terciaria_parcial_minimo: number | string | null;
  fragil?: boolean | string | null;
  observacao: string | null;
}

/** Linha da tabela `produtos` (mesmos nomes de coluna do produtos.csv). */
export interface ProdutoRow {
  codigo: string;
  nome_produto: string | null;
  peso_unitario_kg: number | string | null;
  codigo_caixa: number | string | null;
  fabricante: string | null;
}

export function caixaFromRow(r: CaixaRow): Caixa | null {
  const cod = num(r.codigo_caixa);
  if (cod === null) return null;
  const forn =
    typeof r.caixa_fornecedor === "boolean"
      ? r.caixa_fornecedor
      : String(r.caixa_fornecedor ?? "").trim().toUpperCase() === "TRUE";
  return {
    codigo: cod,
    nome: (r.nome_caixa ?? "").trim(),
    peso: num(r.peso_caixa_kg, 0)!,
    dims: [num(r.largura_cm, 0)!, num(r.altura_cm, 0)!, num(r.comprimento_cm, 0)!],
    tipo: (r.tipo_caixa ?? "").trim().toLowerCase(),
    fornecedor: forn,
    itens_sec: num(r.quantidade_itens_por_caixa_secundaria),
    itens_terc: num(r.quantidade_itens_por_caixa_terciaria),
    secs_na_terc: num(r.caixas_secundarias_permitidas_na_terciaria),
    terc_fornecedor: num(r.caixa_terciaria_fornecedor),
    parcial_min: num(r.terciaria_parcial_minimo),
    fragil: typeof r.fragil === "boolean" ? r.fragil : String(r.fragil ?? "").trim().toUpperCase() === "TRUE",
    observacao: (r.observacao ?? "").trim(),
  };
}

export function produtoFromRow(r: ProdutoRow): Produto | null {
  const cod = (r.codigo ?? "").trim();
  if (!cod) return null;
  return {
    codigo: cod,
    nome: (r.nome_produto ?? "").trim(),
    peso: num(r.peso_unitario_kg, 0)!,
    codigo_caixa: num(r.codigo_caixa),
    fabricante: (r.fabricante ?? "").trim(),
  };
}

/** Mapa codigo -> Caixa (ordem de inserção preservada, como no CSV). */
export function mapCaixas(rows: CaixaRow[]): Map<number, Caixa> {
  const m = new Map<number, Caixa>();
  for (const r of rows) {
    const c = caixaFromRow(r);
    if (c) m.set(c.codigo, c);
  }
  return m;
}

/** Mapa CODIGO (maiúsculo) -> Produto. */
export function mapProdutos(rows: ProdutoRow[]): Map<string, Produto> {
  const m = new Map<string, Produto>();
  for (const r of rows) {
    const p = produtoFromRow(r);
    if (p) m.set(p.codigo.toUpperCase(), p);
  }
  return m;
}

// --------------------------------------------------------------------------- //
// Itens manuais: "COD:QTD,COD:QTD" (ler_itens_texto)
// --------------------------------------------------------------------------- //
export function lerItensTexto(txt: string): Pedido {
  const pedido: Pedido = {
    numero: "(manual)",
    cliente: "",
    data: "",
    tipo_frete: "",
    valor_total: null,
    itens: [],
  };
  for (const parte of txt.trim().split(/[,\n]+/)) {
    if (!parte.trim()) continue;
    const i = parte.lastIndexOf(":");
    const cod = parte.slice(0, i).trim();
    const qtd = parseInt(parte.slice(i + 1).trim(), 10);
    pedido.itens.push({ codigo: cod, descricao: "", qtd });
  }
  return pedido;
}

// --------------------------------------------------------------------------- //
// Motor de cubagem (calcular)
// --------------------------------------------------------------------------- //
export interface OpcoesCalculo {
  /** fração do volume interno das caixas Angiolux considerada aproveitável (padrão 0,85) */
  fatorOcupacao?: number;
  /** códigos das caixas terciárias que não estão disponíveis hoje (não serão sugeridas) */
  indisponiveis?: Iterable<number>;
}

/** Todas as secundárias de um mesmo produto: o motor tenta não separá-las em caixas diferentes. */
interface Bloco {
  pacotes: Pacote[];
  fragil: boolean;
  vol: number;
}

/** Caixa em montagem. */
interface Montagem {
  caixa: Caixa;
  pacotes: Pacote[];
  capacidade: number; // cm³ aproveitáveis
  usado: number; // cm³ ocupados pelas secundárias
  fragil: boolean;
  /** (caixa do fornecedor) nº de secundárias que ela leva quando cheia */
  lotacao?: number;
}

const volPacotes = (ps: Pacote[]) => ps.reduce((s, p) => s + volumePacote(p), 0);

function blocosPorProduto(pacotes: Pacote[]): Bloco[] {
  const m = new Map<string, Pacote[]>();
  for (const p of pacotes) {
    const k = `${p.caixa.codigo}|${p.produto.codigo}`;
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(p);
  }
  return [...m.values()].map((ps) => ({ pacotes: ps, fragil: !!ps[0]!.caixa.fragil, vol: volPacotes(ps) }));
}

function cabeBloco(m: Montagem, b: Bloco): boolean {
  return m.fragil === b.fragil && m.usado + b.vol <= m.capacidade + 1e-6 && b.pacotes.every((p) => cabe(m.caixa, p.caixa));
}

function colocar(m: Montagem, ps: Pacote[]): void {
  m.pacotes.push(...ps);
  m.usado += volPacotes(ps);
}

/** Secundárias que a terciária do fornecedor leva cheia. */
function lotacaoFornecedor(terc: Caixa, sec: Caixa): number {
  return terc.secs_na_terc || Math.ceil((terc.itens_terc ?? 0) / (sec.itens_sec || 1)) || 1;
}

/**
 * Regras (ver README):
 *   1. cada item enche as caixas originais do fornecedor que conseguir (caixa cheia de um produto só);
 *   2. o que sobra vira secundárias (cheias + no máximo 1 parcial por item);
 *   3. as sobras de todos os itens que usam a mesma caixa do fornecedor vão juntas para a caixa
 *      original (sempre, ou a partir do mínimo `terciaria_parcial_minimo`, se preenchido), e o espaço
 *      livre recebe secundárias de outros produtos que caibam;
 *   4. o que não couber em caixa de fornecedor vai para caixas Angiolux (a menor que comporta tudo,
 *      com 85% de aproveitamento e checagem de dimensões);
 *   - secundárias frágeis (balões) só dividem caixa com outras frágeis;
 *   - as secundárias de um mesmo produto ficam juntas sempre que possível.
 */
export function calcular(
  pedido: Pedido,
  produtos: Map<string, Produto>,
  caixas: Map<number, Caixa>,
  fatorOcupacao: number = FATOR_OCUPACAO,
  opcoes: OpcoesCalculo = {},
): Resultado {
  const fator = opcoes.fatorOcupacao ?? fatorOcupacao;
  const indisp = new Set(opcoes.indisponiveis ?? []);
  const disponivel = (c: Caixa | undefined): c is Caixa => !!c && !indisp.has(c.codigo);

  const volumes: Volume[] = [];
  const avisos: string[] = [];
  const nao_cubados: NaoCubado[] = [];
  let peso_nao_cubado = 0;
  const soltos: Pacote[] = [];

  for (const item of pedido.itens) {
    const prod = produtos.get(item.codigo.toUpperCase());
    if (!prod) {
      nao_cubados.push({ item, motivo: "produto não cadastrado" });
      continue;
    }
    if (prod.codigo_caixa === null || !caixas.has(prod.codigo_caixa)) {
      nao_cubados.push({ item, motivo: "produto sem caixa secundária cadastrada (codigo_caixa vazio)" });
      peso_nao_cubado += prod.peso * item.qtd;
      continue;
    }
    const sec = caixas.get(prod.codigo_caixa)!;
    if (!sec.itens_sec) {
      nao_cubados.push({ item, motivo: `caixa ${sec.codigo} sem 'quantidade_itens_por_caixa_secundaria'` });
      peso_nao_cubado += prod.peso * item.qtd;
      continue;
    }

    let restante = item.qtd;

    // 1) caixas originais do fornecedor cheias, de um produto só
    const terc = sec.terc_fornecedor ? caixas.get(sec.terc_fornecedor) : undefined;
    if (disponivel(terc) && terc.itens_terc) {
      const n_terc = Math.floor(restante / terc.itens_terc);
      const n_secs = lotacaoFornecedor(terc, sec);
      for (let i = 0; i < n_terc; i++) {
        const pacotes: Pacote[] = [];
        let falta = terc.itens_terc;
        for (let s = 0; s < n_secs && falta > 0; s++) {
          const u = Math.min(sec.itens_sec, falta);
          pacotes.push({ caixa: sec, produto: prod, unidades: u });
          falta -= u;
        }
        volumes.push({
          caixa: terc,
          origem: "fornecedor",
          peso: terc.peso + pacotes.reduce((s, p) => s + pesoPacote(p), 0),
          conteudo: [`${terc.itens_terc} un ${prod.codigo} em ${n_secs} cx secundárias (caixa original cheia)`],
          pacotes,
        });
      }
      restante -= n_terc * terc.itens_terc;
    }

    // 2) secundárias cheias + 1 parcial
    const n_cheias = Math.floor(restante / sec.itens_sec);
    const resto = restante % sec.itens_sec;
    for (let i = 0; i < n_cheias; i++) soltos.push({ caixa: sec, produto: prod, unidades: sec.itens_sec });
    if (resto) soltos.push({ caixa: sec, produto: prod, unidades: resto });
  }

  // 3) sobras agrupadas pela caixa original do fornecedor
  const montagens: Montagem[] = [];
  const paraAngiolux: Bloco[] = [];
  const porTerc = new Map<number, Bloco[]>();
  for (const b of blocosPorProduto(soltos)) {
    const terc = b.pacotes[0]!.caixa.terc_fornecedor ? caixas.get(b.pacotes[0]!.caixa.terc_fornecedor!) : undefined;
    if (disponivel(terc) && terc.tipo === "terciaria" && b.pacotes.every((p) => cabe(terc, p.caixa))) {
      if (!porTerc.has(terc.codigo)) porTerc.set(terc.codigo, []);
      porTerc.get(terc.codigo)!.push(b);
    } else {
      paraAngiolux.push(b);
    }
  }
  const grupos = [...porTerc.entries()]
    .map(([cod, bs]) => ({ terc: caixas.get(cod)!, blocos: bs.sort((x, y) => y.vol - x.vol), vol: bs.reduce((s, b) => s + b.vol, 0) }))
    .sort((a, b) => b.vol - a.vol);

  for (const g of grupos) {
    const sec = g.blocos[0]!.pacotes[0]!.caixa;
    const lotacao = lotacaoFornecedor(g.terc, sec);
    const capacidade = lotacao * volumeCaixa(sec);
    // 3a) cabe inteiro no espaço livre de uma caixa de fornecedor já aberta neste pedido?
    const restantes: Bloco[] = [];
    for (const b of g.blocos) {
      const m = montagens.find((x) => cabeBloco(x, b));
      if (m) colocar(m, b.pacotes);
      else restantes.push(b);
    }
    if (!restantes.length) continue;
    // 3b) abre as caixas originais necessárias e distribui os produtos sem separá-los quando der
    const nSecs = restantes.reduce((s, b) => s + b.pacotes.length, 0);
    const novas: Montagem[] = Array.from({ length: Math.ceil(nSecs / lotacao) }, () => ({
      caixa: g.terc, pacotes: [], capacidade, usado: 0, fragil: g.blocos[0]!.fragil, lotacao,
    }));
    const quebrar: Pacote[] = [];
    for (const b of restantes) {
      const m = novas.find((x) => cabeBloco(x, b));
      if (m) colocar(m, b.pacotes);
      else quebrar.push(...b.pacotes);
    }
    for (const p of quebrar) {
      const m = novas
        .filter((x) => x.usado + volumePacote(p) <= x.capacidade + 1e-6)
        .sort((a, b) => b.capacidade - b.usado - (a.capacidade - a.usado))[0];
      if (m) colocar(m, [p]);
      else paraAngiolux.push({ pacotes: [p], fragil: !!p.caixa.fragil, vol: volumePacote(p) });
    }
    // 3c) mínimo opcional para usar a caixa original incompleta
    const minimo = g.terc.parcial_min ?? 0;
    for (const m of novas) {
      if (!m.pacotes.length) continue;
      if (minimo > 0 && m.pacotes.length < lotacao && m.pacotes.length < minimo * lotacao) {
        paraAngiolux.push(...blocosPorProduto(m.pacotes));
      } else {
        montagens.push(m);
      }
    }
  }

  // 3d) espaço livre das caixas de fornecedor abertas recebe as sobras que iriam para caixa Angiolux
  for (const b of [...paraAngiolux].sort((x, y) => y.vol - x.vol)) {
    const m = montagens.find((x) => cabeBloco(x, b));
    if (m) {
      colocar(m, b.pacotes);
      paraAngiolux.splice(paraAngiolux.indexOf(b), 1);
    }
  }
  for (const m of montagens) {
    const cheia = m.lotacao !== undefined && m.pacotes.length >= m.lotacao && m.pacotes.every((p) => p.caixa.terc_fornecedor === m.caixa.codigo);
    volumes.push(montarVolume(m.caixa, m.pacotes, cheia ? "fornecedor" : "fornecedor_parcial"));
  }

  // 4) caixas Angiolux para o restante, separando frágeis (balões) dos demais
  if (paraAngiolux.length) {
    const candidatas = [...caixas.values()]
      .filter((c) => c.tipo === "terciaria" && !c.fornecedor && disponivel(c))
      .sort((a, b) => volumeCaixa(a) - volumeCaixa(b));
    if (!candidatas.length) {
      avisos.push("Nenhuma caixa Angiolux disponível: as secundárias abaixo seguem como volumes avulsos.");
    }
    for (const fragil of [false, true]) {
      const bs = paraAngiolux.filter((b) => b.fragil === fragil);
      if (!bs.length) continue;
      const { volumes: vs, avisos: avs } = consolidar(bs, candidatas, fator);
      volumes.push(...vs);
      avisos.push(...avs);
    }
  }

  ordenarVolumes(volumes);
  return { pedido, volumes, avisos, nao_cubados, peso_nao_cubado };
}

/** Fornecedor primeiro, depois do maior para o menor (ordenação estável). */
function ordenarVolumes(volumes: Volume[]): void {
  volumes.sort((a, b) => {
    const ka = a.origem.startsWith("fornecedor") ? 0 : 1;
    const kb = b.origem.startsWith("fornecedor") ? 0 : 1;
    if (ka !== kb) return ka - kb;
    return volumeCaixa(b.caixa) - volumeCaixa(a.caixa);
  });
}

/** Caixas Angiolux: a menor que comporta tudo; senão várias (First Fit Decreasing por produto) e reduz cada uma. */
function consolidar(blocosIn: Bloco[], candidatas: Caixa[], fator: number): { volumes: Volume[]; avisos: string[] } {
  const avisos: string[] = [];
  const volumes: Volume[] = [];

  // secundárias que não cabem em nenhuma candidata viajam como volume próprio
  const blocos: Bloco[] = [];
  for (const b of blocosIn) {
    const ok = b.pacotes.filter((p) => candidatas.some((c) => cabe(c, p.caixa)));
    for (const p of b.pacotes.filter((q) => !ok.includes(q))) {
      avisos.push(`${p.caixa.nome} (${dimsTxt(p.caixa)} cm) não cabe em nenhuma caixa Angiolux disponível; considerada como volume avulso.`);
      volumes.push({ caixa: p.caixa, origem: "angiolux", peso: pesoPacote(p), conteudo: [descricaoPacote(p)], pacotes: [p] });
    }
    if (ok.length) blocos.push({ ...b, pacotes: ok, vol: volPacotes(ok) });
  }
  if (!blocos.length) return { volumes, avisos };

  const todos = blocos.flatMap((b) => b.pacotes);
  const vol_total = volPacotes(todos);
  const servem = (c: Caixa, ps: Pacote[], v: number) => v <= volumeCaixa(c) * fator && ps.every((p) => cabe(c, p.caixa));

  // tudo numa caixa só (candidatas já em ordem crescente de volume)
  const unica = candidatas.find((c) => servem(c, todos, vol_total));
  if (unica) {
    volumes.push(montarVolume(unica, todos));
    return { volumes, avisos };
  }

  // várias caixas do tamanho da maior candidata, produto inteiro por caixa sempre que couber
  const maior = candidatas[candidatas.length - 1]!;
  const cap = volumeCaixa(maior) * fator;
  const abertas: Montagem[] = [];
  const nova = (): Montagem => {
    const m: Montagem = { caixa: maior, pacotes: [], capacidade: cap, usado: 0, fragil: blocos[0]!.fragil };
    abertas.push(m);
    return m;
  };
  for (const b of [...blocos].sort((x, y) => y.vol - x.vol)) {
    const m = abertas.find((x) => x.usado + b.vol <= x.capacidade + 1e-6 && b.pacotes.every((p) => cabe(maior, p.caixa)));
    if (m) colocar(m, b.pacotes);
    else if (b.vol <= cap) colocar(nova(), b.pacotes);
    else {
      for (const p of b.pacotes) {
        const n = abertas.find((x) => x.usado + volumePacote(p) <= x.capacidade + 1e-6) ?? nova();
        colocar(n, [p]);
      }
    }
  }
  for (const m of abertas) {
    const caixa = candidatas.find((c) => servem(c, m.pacotes, m.usado)) ?? maior;
    volumes.push(montarVolume(caixa, m.pacotes));
  }
  return { volumes, avisos };
}

/** Monta (ou remonta) um volume com as secundárias dadas: conteúdo, peso e ocupação. */
export function montarVolume(caixa: Caixa, pacotes: Pacote[], origem?: Origem): Volume {
  const grupos = new Map<string, Pacote[]>();
  for (const p of pacotes) {
    const k = `${p.caixa.codigo}|${p.produto.codigo}`;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k)!.push(p);
  }
  const conteudo: string[] = [];
  for (const ps of grupos.values()) {
    const cheias = ps.filter((p) => p.unidades === p.caixa.itens_sec).length;
    const parciais = ps.filter((p) => p.unidades !== p.caixa.itens_sec);
    const un = ps.reduce((s, p) => s + p.unidades, 0);
    let txt = `${ps.length}x ${ps[0]!.caixa.nome}`;
    if (parciais.length && cheias) txt += ` (${cheias} cheia(s) + 1 parcial c/ ${parciais[0]!.unidades} un)`;
    else if (parciais.length) txt += ` (parcial c/ ${parciais[0]!.unidades} un)`;
    txt += ` = ${un} un ${ps[0]!.produto.codigo}`;
    conteudo.push(txt);
  }
  const peso = caixa.peso + pacotes.reduce((s, p) => s + pesoPacote(p), 0);
  const ocup = (volPacotes(pacotes) / volumeCaixa(caixa)) * 100;
  conteudo.push(`ocupação volumétrica: ${Math.round(ocup)}%`);
  const o: Origem = origem ?? (caixa.fornecedor ? "reaproveitada" : "angiolux");
  if (o === "fornecedor_parcial") conteudo.push("caixa original incompleta: completar com enchimento");
  return { caixa, origem: o, peso, conteudo, pacotes };
}

// --------------------------------------------------------------------------- //
// Edição da cubagem: trocar a caixa de um volume
// --------------------------------------------------------------------------- //
export interface OpcaoCaixa {
  caixa: Caixa;
  /** fração do volume da caixa ocupada pelas secundárias (0-1) */
  ocupacao: number;
  /** acima do aproveitamento padrão (85%): conferir ao embalar */
  apertada: boolean;
}

/** Caixas terciárias (Angiolux e de fornecedor) em que o conteúdo do volume cabe. */
export function caixasParaVolume(v: Volume, caixas: Map<number, Caixa>, fator: number = FATOR_OCUPACAO): OpcaoCaixa[] {
  const vol = volPacotes(v.pacotes);
  return [...caixas.values()]
    .filter((c) => c.tipo === "terciaria" && v.pacotes.every((p) => cabe(c, p.caixa)) && vol <= volumeCaixa(c))
    .map((c) => ({ caixa: c, ocupacao: vol / volumeCaixa(c), apertada: vol > volumeCaixa(c) * fator }))
    .sort((a, b) => volumeCaixa(a.caixa) - volumeCaixa(b.caixa));
}

/** Novo resultado com a caixa do volume `indice` trocada (peso, ocupação e textos recalculados). */
export function trocarCaixa(res: Resultado, indice: number, nova: Caixa): Resultado {
  const v = res.volumes[indice];
  if (!v || !v.pacotes.length) return res;
  const origem: Origem = nova.fornecedor
    ? v.pacotes.every((p) => p.caixa.terc_fornecedor === nova.codigo)
      ? (v.pacotes.length >= lotacaoFornecedor(nova, v.pacotes[0]!.caixa) ? "fornecedor" : "fornecedor_parcial")
      : "reaproveitada"
    : "angiolux";
  const nv: Volume = { ...montarVolume(nova, v.pacotes, origem), editado: true };
  return { ...res, volumes: res.volumes.map((x, i) => (i === indice ? nv : x)) };
}

// --------------------------------------------------------------------------- //
// Validação dos cadastros (validar)
// --------------------------------------------------------------------------- //
export function validar(produtos: Map<string, Produto>, caixas: Map<number, Caixa>): string[] {
  const msgs: string[] = [];
  const todas = [...caixas.values()];
  for (const c of todas) {
    if (c.tipo === "secundaria") {
      if (!c.itens_sec) msgs.push(`[caixa ${c.codigo}] ${c.nome}: sem quantidade de itens por secundária`);
      if (c.terc_fornecedor === null) {
        msgs.push(
          `[caixa ${c.codigo}] ${c.nome}: sem caixa terciária do fornecedor vinculada ` +
            `(itens só serão consolidados em caixas Angiolux)`,
        );
      } else {
        const t = caixas.get(c.terc_fornecedor);
        if (!t) {
          msgs.push(`[caixa ${c.codigo}] aponta para terciária ${c.terc_fornecedor} inexistente`);
        } else {
          if (t.secs_na_terc && c.itens_sec && t.itens_terc && t.secs_na_terc * c.itens_sec !== t.itens_terc) {
            msgs.push(
              `[caixa ${c.codigo}->${t.codigo}] inconsistência: ${t.secs_na_terc} secundárias x ` +
                `${c.itens_sec} un = ${t.secs_na_terc * c.itens_sec}, mas a terciária diz ${t.itens_terc} un`,
            );
          }
          if (t.secs_na_terc && volumeCaixa(c) * t.secs_na_terc > volumeCaixa(t) * 1.02) {
            msgs.push(
              `[caixa ${c.codigo}->${t.codigo}] ${t.secs_na_terc} secundárias somam ` +
                `${((volumeCaixa(c) * t.secs_na_terc) / 1000).toFixed(1)} L, mais que a terciária (${(volumeCaixa(t) / 1000).toFixed(1)} L)`,
            );
          }
          if (!cabe(t, c)) {
            msgs.push(`[caixa ${c.codigo}->${t.codigo}] secundária ${dimsTxt(c)} não cabe na terciária ${dimsTxt(t)}`);
          }
        }
      }
    } else if (c.fornecedor && !todas.some((s) => s.tipo === "secundaria" && s.terc_fornecedor === c.codigo)) {
      msgs.push(`[caixa ${c.codigo}] ${c.nome}: terciária de fornecedor sem nenhuma secundária vinculada`);
    }
  }

  const prods = [...produtos.values()];
  const sem_caixa = prods.filter((p) => p.codigo_caixa === null);
  const por_fab = new Map<string, number>();
  for (const p of sem_caixa) {
    const k = p.fabricante || "(sem fabricante)";
    por_fab.set(k, (por_fab.get(k) ?? 0) + 1);
  }
  if (sem_caixa.length) {
    const partes = [...por_fab.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`);
    msgs.push(`${sem_caixa.length} de ${prods.length} produtos sem codigo_caixa: ${partes.join(", ")}`);
  }
  for (const p of prods) {
    if (p.codigo_caixa !== null && !caixas.has(p.codigo_caixa)) {
      msgs.push(`[produto ${p.codigo}] codigo_caixa ${p.codigo_caixa} não existe em caixas.csv`);
    }
    if (!p.peso) msgs.push(`[produto ${p.codigo}] sem peso unitário`);
  }
  return msgs;
}

// --------------------------------------------------------------------------- //
// Saída: texto para o cliente e JSON (imprimir / para_json)
// --------------------------------------------------------------------------- //
export const DESCRICAO_ORIGEM: Record<Origem, string> = {
  fornecedor: "caixa original do fornecedor, cheia",
  fornecedor_parcial: "caixa original do fornecedor, incompleta (com enchimento)",
  reaproveitada: "caixa de fornecedor reaproveitada",
  angiolux: "caixa Angiolux",
};

export function textoParaCliente(res: Resultado): string {
  const p = res.pedido;
  const grupos = new Map<string, Volume[]>();
  for (const v of res.volumes) {
    const k = dimsTxt(v.caixa);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k)!.push(v);
  }
  const linhas: string[] = [];
  if (p.cliente.trim()) linhas.push(`Cliente: ${p.cliente.trim()}`);
  linhas.push(`Quantidade de volumes: ${res.volumes.length}`);
  if (grupos.size === 1) {
    const [dims, vs] = [...grupos.entries()][0]!;
    linhas.push(`Peso: ${fmtKg(pesoTotal(res))} kg`);
    linhas.push(`Dimensões: ${dims} cm` + (vs.length > 1 ? ` (cada volume ~${fmtKg(vs[0]!.peso)} kg)` : ""));
  } else {
    linhas.push(`Peso total: ${fmtKg(pesoTotal(res))} kg`);
    linhas.push("Dimensões:");
    for (const [dims, vs] of grupos) {
      linhas.push(`  - ${vs.length} volume(s) ${dims} cm, ${fmtKg(vs.reduce((s, x) => s + x.peso, 0))} kg`);
    }
  }
  linhas.push(`Valor da NF: ${fmtBrl(p.valor_total)}`);
  if (res.peso_nao_cubado) {
    linhas.push(`(inclui ${fmtKg(res.peso_nao_cubado)} kg de itens sem caixa cadastrada, sem dimensão)`);
  }
  return linhas.join("\n");
}

export function paraJson(res: Resultado) {
  return {
    pedido: res.pedido.numero,
    cliente: res.pedido.cliente,
    tipo_frete: res.pedido.tipo_frete,
    valor_nf: res.pedido.valor_total,
    itens: res.pedido.itens.map((i) => ({ codigo: i.codigo, descricao: i.descricao, qtd: i.qtd })),
    volumes: res.volumes.map((v) => ({
      codigo_caixa: v.caixa.codigo,
      caixa: v.caixa.nome,
      dimensoes_cm: [...v.caixa.dims],
      peso_kg: round(v.peso, 3),
      m3: round(m3Volume(v), 5),
      origem: v.origem,
      conteudo: v.conteudo,
      ...(v.editado ? { editado: true } : {}),
    })),
    quantidade_volumes: res.volumes.length,
    peso_total_kg: round(pesoTotal(res), 3),
    m3_total: round(m3Total(res), 5),
    nao_cubados: res.nao_cubados.map(({ item, motivo }) => ({ codigo: item.codigo, qtd: item.qtd, motivo })),
    avisos: res.avisos,
  };
}
