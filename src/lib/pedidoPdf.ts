/**
 * Leitura do espelho do pedido (PDF do sistema Odin) com pdf.js — porte de ler_pedido_pdf().
 * Estratégia: agrupa as palavras em linhas pela coordenada y (origem no topo), localiza o
 * cabeçalho "Código / Descrição / QTD / Valor / Total" e atribui cada palavra a uma coluna
 * pela posição x. Captura nº do pedido, cliente, data, tipo de frete e TOTAL.
 *
 * Recebe o resultado de page.getTextContent() de cada página (pdfjs-dist) para não depender
 * do ambiente (navegador ou Node). No app: usar `getDocument({ data }).promise`.
 */
import type { Pedido, ItemPedido } from "./cubagem";

export interface Palavra {
  x0: number;
  x1: number;
  w: string;
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
    const x = it.transform[4];
    const fontH = Math.abs(it.transform[3]) || it.height || 0;
    // pdf.js: baseline em (e,f) com origem embaixo; PyMuPDF usa y0 = topo do bbox
    const yTop = pag.altura - it.transform[5] - fontH * 0.8;
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

/** Agrupa palavras em linhas (tolerância de 2.5 pt em y), ordenadas de cima para baixo e por x. */
export function agruparLinhas(palavras: Array<Palavra & { y: number }>): Palavra[][] {
  const ordenadas = [...palavras].sort((a, b) => a.y - b.y || a.x0 - b.x0);
  const linhas: Array<{ y: number; ws: Palavra[] }> = [];
  for (const p of ordenadas) {
    const ult = linhas[linhas.length - 1];
    if (ult && Math.abs(p.y - ult.y) <= 2.5) ult.ws.push(p);
    else linhas.push({ y: p.y, ws: [p] });
  }
  return linhas.map((l) => l.ws.sort((a, b) => a.x0 - b.x0));
}

export function paraFloatBr(s: string): number | null {
  const t = s.trim().replace(/\./g, "").replace(",", ".");
  const f = Number(t);
  return t === "" || !Number.isFinite(f) ? null : f;
}

export function lerPedidoDePaginas(paginas: PaginaTexto[]): Pedido {
  const pedido: Pedido = { numero: "", cliente: "", data: "", tipo_frete: "", valor_total: null, itens: [] };

  for (const pag of paginas) {
    const rows = agruparLinhas(extrairPalavras(pag));

    // cabeçalho da tabela de itens -> posições das colunas
    let col: { qtd: number; valor: number; total: number } | null = null;
    let idxHeader = -1;
    for (let i = 0; i < rows.length; i++) {
      const textos = rows[i].map((p) => p.w);
      if (textos.includes("QTD") && textos.includes("Valor") && textos.includes("Total")) {
        const pos = (w: string) => rows[i].find((p) => p.w === w)!.x0;
        col = { qtd: pos("QTD"), valor: pos("Valor"), total: pos("Total") };
        idxHeader = i;
        break;
      }
    }

    for (const row of rows) {
      const textos = row.map((p) => p.w);
      if (!pedido.numero && textos.length === 2 && textos[0] === "PEDIDO" && /^\d+$/.test(textos[1])) {
        pedido.numero = textos[1];
      }
      if (!pedido.cliente && textos.length && textos[0] === "CLIENTE:") {
        pedido.cliente = textos.slice(1).join(" ").replace(/^[\s-]+|[\s-]+$/g, "");
      }
      if (!pedido.data && textos.includes("DATA:")) {
        const j = textos.indexOf("DATA:");
        if (j + 1 < textos.length) pedido.data = textos[j + 1];
      }
      if (!pedido.tipo_frete && textos.includes("FRETE:") && textos.includes("TIPO")) {
        const j = textos.indexOf("FRETE:");
        if (j + 1 < textos.length) pedido.tipo_frete = textos[j + 1];
      }
      if (pedido.valor_total === null && textos.length === 2 && textos[0] === "TOTAL:") {
        pedido.valor_total = paraFloatBr(textos[1]);
      }
    }

    if (!col) continue;

    // itens: linhas abaixo do cabeçalho até a seção de VALORES
    for (const row of rows.slice(idxHeader + 1)) {
      const textos = row.map((p) => p.w);
      if (textos.includes("VALORES") || textos.includes("MERCADORIA:")) break;
      const codigo: string[] = [], desc: string[] = [], qtd: string[] = [], valor: string[] = [], total: string[] = [];
      for (const { x0, w } of row) {
        if (x0 >= col.total - 15) total.push(w);
        else if (x0 >= col.valor - 15) valor.push(w);
        else if (x0 >= col.qtd - 15) qtd.push(w);
        else if (x0 < 60) codigo.push(w);
        else desc.push(w);
      }
      const qtdTxt = qtd.join("");
      if (codigo.length && /^\d+$/.test(qtdTxt)) {
        const item: ItemPedido = {
          codigo: codigo.join(" ").trim(),
          descricao: desc.join(" ").trim(),
          qtd: parseInt(qtdTxt, 10),
          valor_unit: valor.length ? paraFloatBr(valor.join("")) : null,
          total: total.length ? paraFloatBr(total.join("")) : null,
        };
        pedido.itens.push(item);
      } else if (desc.length && pedido.itens.length && !codigo.length && !qtd.length) {
        // continuação de descrição quebrada em 2 linhas
        pedido.itens[pedido.itens.length - 1].descricao += " " + desc.join(" ");
      }
    }
  }
  return pedido;
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
