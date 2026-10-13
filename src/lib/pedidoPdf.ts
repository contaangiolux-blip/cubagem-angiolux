/**
 * Leitura do espelho do pedido (sistema Odin) a partir de palavras posicionadas — porte de
 * ler_pedido_pdf() do protótipo Python.
 * Estratégia: agrupa as palavras em linhas pela coordenada y (origem no topo), localiza o
 * cabeçalho "Código / Descrição / QTD / Valor / Total" e atribui cada palavra a uma coluna
 * pela posição x. Captura nº do pedido, cliente, data, tipo de frete, CEP/cidade/UF e TOTAL.
 *
 * As palavras podem vir do pdf.js (`extrairPalavras`) ou de OCR (ver pedidoImagem.ts);
 * `lerPedidoDeLinhas` é tolerante a pequenas falhas de leitura (acentos, maiúsculas).
 */
import type { Pedido, ItemPedido } from "./cubagem";

export interface Palavra {
  x0: number;
  x1: number;
  w: string;
  /** confiança 0-100 (só OCR) */
  conf?: number;
}

export interface PaginaTexto {
  /** altura da página em pontos (viewport.height com scale 1) */
  altura: number;
  /** items de getTextContent() */
  items: Array<{ str: string; transform: number[]; width: number; height: number }>;
}

/** Converte os items do pdf.js em palavras com x0/x1 e y (topo = 0), como o PyMuPDF. */
export function extrairPalavras(pag: PaginaTexto): Array<Palavra & { y: number }> {
  const out: Array<Palavra & { y: number }> = [];
  for (const it of pag.items) {
    const str = it.str;
    if (!str || !str.trim()) continue;
    const x = it.transform[4] ?? 0;
    const fontH = Math.abs(it.transform[3] ?? 0) || it.height || 0;
    // pdf.js: baseline em (e,f) com origem embaixo; PyMuPDF usa y0 = topo do bbox
    const yTop = pag.altura - (it.transform[5] ?? 0) - fontH * 0.8;
    const larguraTotal = it.width || 0;
    const charW = str.length ? larguraTotal / str.length : 0;
    // divide o item em palavras (espaços) estimando o x de cada uma proporcionalmente
    const re = /\S+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(str))) {
      const x0 = x + m.index * charW;
      const x1 = x0 + m[0].length * charW;
      out.push({ x0, x1, w: m[0], y: yTop });
    }
  }
  return out;
}

/** Agrupa palavras em linhas (tolerância em y), ordenadas de cima para baixo e por x. */
export function agruparLinhas(palavras: Array<Palavra & { y: number }>, tolerancia = 2.5): Palavra[][] {
  const ordenadas = [...palavras].sort((a, b) => a.y - b.y || a.x0 - b.x0);
  const linhas: Array<{ y: number; ws: Palavra[] }> = [];
  for (const p of ordenadas) {
    const ult = linhas[linhas.length - 1];
    if (ult && Math.abs(p.y - ult.y) <= tolerancia) ult.ws.push(p);
    else linhas.push({ y: p.y, ws: [p] });
  }
  return linhas.map((l) => l.ws.sort((a, b) => a.x0 - b.x0));
}

export function paraFloatBr(s: string): number | null {
  const t = s.trim().replace(/\./g, "").replace(",", ".");
  const f = Number(t);
  return t === "" || !Number.isFinite(f) ? null : f;
}

/** Normaliza um rótulo para comparação tolerante (sem acentos, minúsculas, só letras/dígitos/":"). */
export function normalizarRotulo(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9:]/g, "");
}

export interface Colunas {
  /** índice da linha do cabeçalho */
  idx: number;
  qtd: number;
  valor: number;
  total: number;
  /** x0 do cabeçalho "Descrição" (quando lido) */
  descricao?: number;
  /** margem de tolerância para atribuir palavras às colunas */
  margem: number;
  /** palavras com x0 abaixo disso pertencem à coluna Código */
  limiteCodigo: number;
}

/** Localiza o cabeçalho "Código / Descrição / QTD / Valor / Total" e as posições das colunas. */
export function localizarCabecalho(rows: Palavra[][]): Colunas | null {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const acha = (pred: (n: string) => boolean) => row.find((p) => pred(normalizarRotulo(p.w)));
    const qtd = acha((n) => n === "qtd");
    const valor = acha((n) => n === "valor");
    const total = acha((n) => n === "total");
    if (!qtd || !valor || !total || !(qtd.x0 < valor.x0 && valor.x0 < total.x0)) continue;
    const desc = acha((n) => n.startsWith("descri"));
    const margem = Math.max(4, 0.27 * (valor.x0 - qtd.x0));
    const primeiro = row[0]!.x0;
    const limiteCodigo = desc ? desc.x0 - margem : primeiro + 0.15 * (qtd.x0 - primeiro);
    const col: Colunas = { idx: i, qtd: qtd.x0, valor: valor.x0, total: total.x0, margem, limiteCodigo };
    if (desc) col.descricao = desc.x0;
    return col;
  }
  return null;
}

const RE_DATA = /^\d{2}\/\d{2}\/\d{4}$/;

/** Monta o pedido a partir das linhas de palavras (PDF ou OCR). `colunas` substitui a detecção do cabeçalho. */
export function lerPedidoDeLinhas(rows: Palavra[][], pedido?: Pedido, colunas?: Colunas | null): Pedido {
  const p: Pedido = pedido ?? { numero: "", cliente: "", data: "", tipo_frete: "", valor_total: null, itens: [], cep: "", cidade: "", uf: "" };
  const col = colunas ?? localizarCabecalho(rows);

  for (const row of rows) {
    const textos = row.map((w) => w.w);
    const normais = textos.map(normalizarRotulo);

    if (!p.numero && textos.length <= 4 && normais.includes("pedido")) {
      const num = textos.find((t) => /^\d{3,8}$/.test(t));
      if (num) p.numero = num;
    }
    if (!p.cliente && normais[0] === "cliente:") {
      p.cliente = textos.slice(1).join(" ").replace(/^[\s-]+|[\s-]+$/g, "");
    }
    if (!p.data && normais.includes("data:")) {
      const j = normais.indexOf("data:");
      const d = textos[j + 1] ?? "";
      if (RE_DATA.test(d)) p.data = d;
    }
    if (!p.tipo_frete && normais.includes("frete:") && normais.some((n) => n.startsWith("tipo"))) {
      const j = normais.indexOf("frete:");
      const f = (textos[j + 1] ?? "").replace(/[^A-Za-z]/g, "").toUpperCase();
      if (f) p.tipo_frete = f;
    }
    if (!p.cep && normais.includes("cep:")) {
      const j = normais.indexOf("cep:");
      const cep = (textos[j + 1] ?? "").replace(/\D/g, "");
      if (cep.length === 8) p.cep = cep;
    }
    if (!p.cidade && normais[0] === "cidade:") {
      // "CIDADE: FORTALEZA - CE    BAIRRO: CENTRO" (no OCR o hífen pode sumir)
      const fim = normais.indexOf("bairro:");
      const partes = textos.slice(1, fim === -1 ? undefined : fim);
      const sep = partes.lastIndexOf("-");
      if (sep > 0 && sep === partes.length - 2) {
        p.cidade = partes.slice(0, sep).join(" ");
        p.uf = partes[sep + 1] ?? "";
      } else if (partes.length >= 2 && /^[A-Z]{2}$/.test(partes[partes.length - 1] ?? "")) {
        p.cidade = partes.slice(0, -1).join(" ");
        p.uf = partes[partes.length - 1]!;
      } else {
        p.cidade = partes.join(" ");
      }
    }
    if (p.valor_total === null && textos.length === 2 && normais[0] === "total:") {
      p.valor_total = paraFloatBr(textos[1]!);
    }
  }

  if (!col) return p;

  // itens: linhas abaixo do cabeçalho até a seção de VALORES
  for (const row of rows.slice(col.idx + 1)) {
    const normais = row.map((w) => normalizarRotulo(w.w));
    if (normais.includes("valores") || normais.includes("mercadoria:")) break;
    const codigo: Palavra[] = [], desc: Palavra[] = [], qtd: Palavra[] = [], valor: Palavra[] = [], total: Palavra[] = [];
    for (const w of row) {
      if (w.x0 >= col.total - col.margem) total.push(w);
      else if (w.x0 >= col.valor - col.margem) valor.push(w);
      else if (w.x0 >= col.qtd - col.margem) qtd.push(w);
      else if (w.x0 < col.limiteCodigo) codigo.push(w);
      else desc.push(w);
    }
    const txt = (ws: Palavra[], sep = "") => ws.map((w) => w.w).join(sep);
    const qtdTxt = txt(qtd);
    if (codigo.length && /^\d+$/.test(qtdTxt)) {
      const item: ItemPedido = {
        codigo: txt(codigo, " ").trim(),
        descricao: txt(desc, " ").trim(),
        qtd: parseInt(qtdTxt, 10),
        valor_unit: valor.length ? paraFloatBr(txt(valor)) : null,
        total: total.length ? paraFloatBr(txt(total)) : null,
      };
      const confs = [...codigo, ...qtd].map((w) => w.conf).filter((c): c is number => typeof c === "number");
      if (confs.length) item.confianca = Math.min(...confs);
      p.itens.push(item);
    } else if (desc.length && p.itens.length && !codigo.length && !qtd.length) {
      // continuação de descrição quebrada em 2 linhas
      p.itens[p.itens.length - 1]!.descricao += " " + txt(desc, " ");
    }
  }
  return p;
}

export function lerPedidoDePaginas(paginas: PaginaTexto[]): Pedido {
  let pedido: Pedido | undefined;
  for (const pag of paginas) {
    pedido = lerPedidoDeLinhas(agruparLinhas(extrairPalavras(pag)), pedido);
  }
  return pedido ?? lerPedidoDeLinhas([]);
}

/**
 * No app (navegador):
 *   import * as pdfjs from "pdfjs-dist";
 *   import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
 *   pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
 *   const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
 *   const paginas = [];
 *   for (let i = 1; i <= doc.numPages; i++) {
 *     const page = await doc.getPage(i);
 *     const vp = page.getViewport({ scale: 1 });
 *     const tc = await page.getTextContent();
 *     paginas.push({ altura: vp.height, items: tc.items.filter(it => "str" in it) });
 *   }
 *   const pedido = lerPedidoDePaginas(paginas);
 */
