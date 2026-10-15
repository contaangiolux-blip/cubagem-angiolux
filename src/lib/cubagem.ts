/**
 * Motor de cubagem Angiolux — porte fiel de cubagem.py (protótipo Python).
 * Mesma lógica, mesmos resultados:
 *   1. caixas terciárias originais do fornecedor cheias;
 *   1b. caixa original incompleta quando atinge a fração mínima (terciaria_parcial_minimo);
 *   2. secundárias cheias + no máximo 1 parcial por item;
 *   3. consolidação das secundárias soltas em terciárias Angiolux (FFD, fator 0,85,
 *      checagem de dimensões, terciária do fornecedor reaproveitável como candidata).
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
  parcial_min: number | null;    // (terciária fornecedor) fração mínima p/ despachar caixa original incompleta
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
export function calcular(
  pedido: Pedido,
  produtos: Map<string, Produto>,
  caixas: Map<number, Caixa>,
  fatorOcupacao: number = FATOR_OCUPACAO,
  reaproveitarTerciariaFornecedor: boolean = true,
): Resultado {
  const volumes: Volume[] = [];
  const avisos: string[] = [];
  const nao_cubados: NaoCubado[] = [];
  let peso_nao_cubado = 0;
  const soltos: Pacote[] = [];

  for (const item of pedido.itens) {
    const prod = produtos.get(item.codigo.toUpperCase());
    if (!prod) {
      nao_cubados.push({ item, motivo: "produto não cadastrado em produtos.csv" });
      continue;
    }
    if (prod.codigo_caixa === null || !caixas.has(prod.codigo_caixa)) {
      nao_cubados.push({
        item,
        motivo: "produto sem caixa secundária cadastrada (codigo_caixa vazio)",
      });
      peso_nao_cubado += prod.peso * item.qtd;
      continue;
    }
    const sec = caixas.get(prod.codigo_caixa)!;
    if (!sec.itens_sec) {
      nao_cubados.push({
        item,
        motivo: `caixa ${sec.codigo} sem 'quantidade_itens_por_caixa_secundaria'`,
      });
      peso_nao_cubado += prod.peso * item.qtd;
      continue;
    }

    let restante = item.qtd;

    // 1) caixas terciárias originais do fornecedor, cheias
    const terc = sec.terc_fornecedor ? caixas.get(sec.terc_fornecedor) : undefined;
    if (terc && terc.itens_terc) {
      const n_terc = Math.floor(restante / terc.itens_terc);
      if (n_terc) {
        const n_secs = terc.secs_na_terc || Math.ceil(terc.itens_terc / sec.itens_sec);
        const peso = terc.peso + n_secs * sec.peso + terc.itens_terc * prod.peso;
        for (let i = 0; i < n_terc; i++) {
          volumes.push({
            caixa: terc,
            origem: "fornecedor",
            peso,
            conteudo: [
              `${terc.itens_terc} un ${prod.codigo} em ${n_secs} cx secundárias (caixa original cheia)`,
            ],
            pacotes: [],
          });
        }
        restante -= n_terc * terc.itens_terc;
      }

      // 1b) caixa original incompleta (Simeks, PHS, Sinapi) quando atinge a fração mínima
      if (restante && terc.parcial_min && restante >= terc.parcial_min * terc.itens_terc) {
        const n_secs = Math.ceil(restante / sec.itens_sec);
        const peso = terc.peso + n_secs * sec.peso + restante * prod.peso;
        const pct = Math.round((restante / terc.itens_terc) * 100);
        volumes.push({
          caixa: terc,
          origem: "fornecedor_parcial",
          peso,
          conteudo: [
            `${restante} un ${prod.codigo} em ${n_secs} cx secundárias ` +
              `(caixa original incompleta, ${pct}% da lotação; completar com enchimento)`,
          ],
          pacotes: [],
        });
        restante = 0;
      }
    }

    // 2) secundárias cheias + 1 parcial
    const n_cheias = Math.floor(restante / sec.itens_sec);
    const resto = restante % sec.itens_sec;
    for (let i = 0; i < n_cheias; i++) soltos.push({ caixa: sec, produto: prod, unidades: sec.itens_sec });
    if (resto) soltos.push({ caixa: sec, produto: prod, unidades: resto });
  }

  // 3) consolida secundárias soltas em terciárias Angiolux
  if (soltos.length) {
    let candidatas = [...caixas.values()].filter((c) => c.tipo === "terciaria" && !c.fornecedor);
    if (reaproveitarTerciariaFornecedor) {
      // a terciária original dos próprios itens do pedido também pode servir de caixa de envio
      const cods = [...new Set(soltos.map((p) => p.caixa.terc_fornecedor).filter((c): c is number => !!c))].sort(
        (a, b) => a - b,
      );
      candidatas = candidatas.concat(cods.filter((c) => caixas.has(c)).map((c) => caixas.get(c)!));
    }
    candidatas.sort((a, b) => volumeCaixa(a) - volumeCaixa(b)); // sort estável
    const { volumes: vols, avisos: avs } = consolidar(soltos, candidatas, fatorOcupacao);
    volumes.push(...vols);
    avisos.push(...avs);
  }

  // ordena: fornecedor primeiro, depois por tamanho (sort estável)
  volumes.sort((a, b) => {
    const ka = a.origem.startsWith("fornecedor") ? 0 : 1;
    const kb = b.origem.startsWith("fornecedor") ? 0 : 1;
    if (ka !== kb) return ka - kb;
    return volumeCaixa(b.caixa) - volumeCaixa(a.caixa);
  });

  return { pedido, volumes, avisos, nao_cubados, peso_nao_cubado };
}

/** Bin packing simples (First Fit Decreasing por volume) com redução final da caixa. */
function consolidar(
  pacotesIn: Pacote[],
  candidatas: Caixa[],
  fator: number,
): { volumes: Volume[]; avisos: string[] } {
  const avisos: string[] = [];
  const volumes: Volume[] = [];
  let pacotes = [...pacotesIn].sort((a, b) => volumePacote(b) - volumePacote(a)); // estável

  // pacotes que não cabem em nenhuma candidata viajam como volume próprio
  const restantes: Pacote[] = [];
  for (const p of pacotes) {
    if (candidatas.some((c) => cabe(c, p.caixa))) {
      restantes.push(p);
    } else {
      avisos.push(
        `${p.caixa.nome} (${dimsTxt(p.caixa)} cm) não cabe em nenhuma caixa terciária ` +
          `cadastrada; considerada como volume avulso.`,
      );
      volumes.push({
        caixa: p.caixa,
        origem: "angiolux",
        peso: pesoPacote(p),
        conteudo: [descricaoPacote(p)],
        pacotes: [p],
      });
    }
  }
  pacotes = restantes;
  if (!pacotes.length) return { volumes, avisos };

  // tenta tudo em uma única caixa (candidatas já ordenadas da menor para a maior)
  const vol_total = pacotes.reduce((s, p) => s + volumePacote(p), 0);
  for (const c of candidatas) {
    if (vol_total <= volumeCaixa(c) * fator && pacotes.every((p) => cabe(c, p.caixa))) {
      volumes.push(montarVolume(c, pacotes));
      return { volumes, avisos };
    }
  }

  // FFD: abre caixas do tamanho da maior candidata e depois reduz cada uma
  const maior = candidatas[candidatas.length - 1]!;
  const bins: Pacote[][] = [];
  for (const p of pacotes) {
    let colocado = false;
    for (const b of bins) {
      const vb = b.reduce((s, q) => s + volumePacote(q), 0);
      if (vb + volumePacote(p) <= volumeCaixa(maior) * fator && cabe(maior, p.caixa)) {
        b.push(p);
        colocado = true;
        break;
      }
    }
    if (!colocado) bins.push([p]);
  }
  for (const b of bins) {
    const vol_b = b.reduce((s, q) => s + volumePacote(q), 0);
    const caixa =
      candidatas.find((c) => vol_b <= volumeCaixa(c) * fator && b.every((q) => cabe(c, q.caixa))) ?? maior;
    volumes.push(montarVolume(caixa, b));
  }
  return { volumes, avisos };
}

function montarVolume(caixa: Caixa, pacotes: Pacote[]): Volume {
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
  const ocup = (pacotes.reduce((s, p) => s + volumePacote(p), 0) / volumeCaixa(caixa)) * 100;
  conteudo.push(`ocupação volumétrica: ${Math.round(ocup)}%`);
  const origem: Origem = caixa.fornecedor ? "reaproveitada" : "angiolux";
  return { caixa, origem, peso, conteudo, pacotes };
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
  reaproveitada: "secundárias soltas em caixa do fornecedor reaproveitada",
  angiolux: "secundárias soltas consolidadas em caixa Angiolux",
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
      caixa: v.caixa.nome,
      dimensoes_cm: [...v.caixa.dims],
      peso_kg: round(v.peso, 3),
      m3: round(m3Volume(v), 5),
      origem: v.origem,
      conteudo: v.conteudo,
    })),
    quantidade_volumes: res.volumes.length,
    peso_total_kg: round(pesoTotal(res), 3),
    m3_total: round(m3Total(res), 5),
    nao_cubados: res.nao_cubados.map(({ item, motivo }) => ({ codigo: item.codigo, qtd: item.qtd, motivo })),
    avisos: res.avisos,
  };
}
