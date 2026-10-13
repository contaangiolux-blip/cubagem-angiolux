/**
 * Leitura do pedido a partir de uma captura de tela (OCR com Tesseract no navegador).
 *
 * Pipeline:
 *   1. amplia a imagem (2x quando é pequena) — melhora muito a leitura de dígitos;
 *   2. OCR completo com posição das palavras → mesmas regras de colunas do leitor de PDF;
 *   3. releitura da coluna QTD só com dígitos (evita "30" virar "so");
 *   4. itens recebem a confiança mínima (código + quantidade) para a tela pedir conferência.
 */
import type { Pedido } from "./cubagem";
import { agruparLinhas, localizarCabecalho, lerPedidoDeLinhas, type Colunas, type Palavra } from "./pedidoPdf";

export interface PalavraOcr extends Palavra {
  y: number;
  y1: number;
  conf: number;
}

export interface ResultadoOcr {
  pedido: Pedido;
  avisos: string[];
  /** confiança média do OCR (0-100) */
  confianca: number;
  /** fator de ampliação aplicado à imagem */
  escala: number;
}

/** Abaixo disso o item é marcado para conferência na tela. */
export const CONFIANCA_MINIMA = 85;

/** Largura mínima da imagem para o OCR; abaixo disso ampliamos 2x. */
export const LARGURA_MINIMA_OCR = 1500;

type BlocosTesseract = Array<{
  paragraphs: Array<{ lines: Array<{ words: Array<{ text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }> }> }>;
}>;

/** Converte os blocos do Tesseract em palavras posicionadas. */
export function palavrasDeBlocos(blocks: BlocosTesseract | null | undefined): PalavraOcr[] {
  const out: PalavraOcr[] = [];
  for (const b of blocks ?? []) for (const p of b.paragraphs) for (const l of p.lines) for (const w of l.words) {
    const t = w.text.trim();
    if (!t) continue;
    out.push({ x0: w.bbox.x0, x1: w.bbox.x1, y: w.bbox.y0, y1: w.bbox.y1, w: t, conf: w.confidence });
  }
  return out;
}

/** Tolerância de linha = ~60% da altura mediana das palavras. */
export function toleranciaLinha(palavras: PalavraOcr[]): number {
  const alturas = palavras.map((p) => p.y1 - p.y).filter((h) => h > 0).sort((a, b) => a - b);
  const mediana = alturas[Math.floor(alturas.length / 2)] ?? 10;
  return Math.max(3, mediana * 0.6);
}

const RE_CODIGO = /^[A-Z0-9][A-Z0-9.\-/]{3,}$/i;
const RE_QTD = /^\d{1,5}$/;
const RE_PRECO = /^\d{1,3}(\.\d{3})*,\d{2}$/;

/**
 * Quando o cabeçalho "Código / Descrição / QTD / Valor / Total" não foi lido (fundo cinza),
 * infere as colunas pela primeira linha com cara de item: `código ... qtd valor total`.
 */
export function inferirColunas(rows: Palavra[][]): Colunas | null {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if (row.length < 4) continue;
    const [q, v, tt] = row.slice(-3) as [Palavra, Palavra, Palavra];
    const primeiro = row[0]!;
    if (!RE_CODIGO.test(primeiro.w) || !RE_QTD.test(q.w) || !RE_PRECO.test(v.w) || !RE_PRECO.test(tt.w)) continue;
    if (!(q.x0 < v.x0 && v.x0 < tt.x0)) continue;
    const margem = Math.max(4, 0.27 * (v.x0 - q.x0));
    const descricao = row[1]!.x0;
    return { idx: i - 1, qtd: q.x0, valor: v.x0, total: tt.x0, descricao, margem, limiteCodigo: descricao - margem };
  }
  return null;
}

/** Colunas da tabela de itens: cabeçalho lido, senão inferidas pela linha do item. */
export function colunasOcr(rows: Palavra[][]): Colunas | null {
  return localizarCabecalho(rows) ?? inferirColunas(rows);
}

/** Retângulo da coluna QTD (abaixo do cabeçalho) para a releitura só com dígitos. */
export function retanguloQtd(rows: Palavra[][], palavras: PalavraOcr[], largura: number, altura: number, col: Colunas | null) {
  if (!col) return null;
  const cab = col.idx >= 0 ? rows[col.idx]! : [];
  const yCab = cab.length ? Math.max(...cab.map((w) => palavras.find((p) => p === w)?.y1 ?? 0)) : 0;
  const left = Math.max(0, Math.round(col.qtd - col.margem * 2));
  const right = Math.min(largura, Math.round(col.valor - col.margem));
  const top = Math.min(altura - 1, Math.round(yCab + 2));
  return { left, top, width: Math.max(1, right - left), height: Math.max(1, altura - top) };
}

/**
 * Substitui, em cada linha abaixo do cabeçalho, as palavras da coluna QTD pelas lidas na
 * passada só com dígitos (quando houver uma na mesma altura).
 */
export function aplicarQtdDigitos(rows: Palavra[][], palavras: PalavraOcr[], digitos: PalavraOcr[], col: Colunas | null): Palavra[][] {
  if (!col || !digitos.length) return rows;
  return rows.map((row, i) => {
    if (i <= col.idx) return row;
    const ys = row.map((w) => palavras.find((p) => p === w)).filter((p): p is PalavraOcr => !!p);
    if (!ys.length) return row;
    const y0 = Math.min(...ys.map((p) => p.y)), y1 = Math.max(...ys.map((p) => p.y1));
    const d = digitos.find((q) => /^\d+$/.test(q.w) && (q.y + q.y1) / 2 >= y0 && (q.y + q.y1) / 2 <= y1);
    if (!d) return row;
    const naColuna = row.filter((w) => w.x0 >= col.qtd - col.margem && w.x0 < col.valor - col.margem);
    const semQtd = row.filter((w) => !naColuna.includes(w));
    // leituras iguais nas duas passadas: fica a maior confiança; diferentes: vale a passada só com dígitos
    const textoAntes = naColuna.map((w) => w.w).join("");
    const confAntes = Math.min(...naColuna.map((w) => w.conf ?? 0));
    const conf = textoAntes === d.w ? Math.max(d.conf, confAntes) : d.conf;
    return [...semQtd, { x0: d.x0, x1: d.x1, w: d.w, conf }].sort((a, b) => a.x0 - b.x0);
  });
}

/** Mínimo necessário do worker do Tesseract (evita depender dos tipos do pacote nos testes). */
export interface WorkerOcr {
  recognize(image: unknown, options?: Record<string, unknown>, output?: Record<string, unknown>): Promise<{ data: { confidence: number; blocks?: BlocosTesseract | null } }>;
  setParameters(params: Record<string, string>): Promise<unknown>;
}

/** Executa as duas passadas de OCR sobre uma imagem já ampliada e monta o pedido. */
export async function ocrPedido(worker: WorkerOcr, imagem: unknown, largura: number, altura: number, escala: number): Promise<ResultadoOcr> {
  const passo1 = await worker.recognize(imagem, {}, { blocks: true });
  const palavras = palavrasDeBlocos(passo1.data.blocks);
  let rows = agruparLinhas(palavras, toleranciaLinha(palavras));
  const col = colunasOcr(rows);

  const rect = retanguloQtd(rows, palavras, largura, altura, col);
  if (rect) {
    await worker.setParameters({ tessedit_char_whitelist: "0123456789", tessedit_pageseg_mode: "6" });
    const passo2 = await worker.recognize(imagem, { rectangle: rect }, { blocks: true });
    await worker.setParameters({ tessedit_char_whitelist: "", tessedit_pageseg_mode: "3" });
    rows = aplicarQtdDigitos(rows, palavras, palavrasDeBlocos(passo2.data.blocks), col);
  }

  const pedido = lerPedidoDeLinhas(rows, undefined, col);
  const avisos: string[] = [];
  if (!rect) avisos.push("Não encontrei a tabela de itens (cabeçalho Código / Descrição / QTD / Valor / Total). Confira se a captura mostra a tabela inteira.");
  else if (!pedido.itens.length) avisos.push("A tabela de itens foi encontrada, mas nenhum item foi lido. Informe os itens manualmente.");
  if (pedido.valor_total === null) {
    const soma = pedido.itens.reduce((s, i) => s + (i.total ?? 0), 0);
    if (soma > 0) { pedido.valor_total = Math.round(soma * 100) / 100; avisos.push("Valor da NF estimado pela soma dos itens; confira com o pedido."); }
  }
  if (!pedido.numero) avisos.push("Número do pedido não foi lido na captura; informe no campo.");
  if (!pedido.data) avisos.push("Data do pedido não foi lida com segurança; informe no campo.");
  const duvidosos = pedido.itens.filter((i) => (i.confianca ?? 100) < CONFIANCA_MINIMA).length;
  if (duvidosos) avisos.push(`${duvidosos} item(ns) com leitura duvidosa: confira código e quantidade.`);
  return { pedido, avisos, confianca: passo1.data.confidence, escala };
}

/**
 * Tenta corrigir um código mal lido pelo OCR trocando caracteres parecidos (O/0, I/1, S/5, B/8, Z/2).
 * Devolve o código corrigido quando exatamente uma variante existe no cadastro.
 */
export function corrigirCodigo(codigo: string, existe: (c: string) => boolean): string | null {
  if (existe(codigo)) return codigo;
  const pares: Record<string, string[]> = { O: ["0"], "0": ["O"], I: ["1"], l: ["1"], "1": ["I"], S: ["5"], "5": ["S"], B: ["8"], "8": ["B"], Z: ["2"], "2": ["Z"], "&": ["8"] };
  const posicoes = [...codigo].map((ch, i) => (pares[ch] ? i : -1)).filter((i) => i >= 0).slice(0, 6);
  const achados = new Set<string>();
  const total = 1 << posicoes.length;
  for (let mask = 1; mask < total; mask++) {
    const chars = [...codigo];
    for (let k = 0; k < posicoes.length; k++) {
      if (mask & (1 << k)) { const i = posicoes[k]!; chars[i] = pares[chars[i]!]![0]!; }
    }
    const cand = chars.join("");
    if (existe(cand)) achados.add(cand);
    if (achados.size > 1) return null;
  }
  return achados.size === 1 ? [...achados][0]! : null;
}

/** Cinza + contraste: melhora a leitura dos cabeçalhos em fundo cinza e dos dígitos pequenos. */
export function prepararParaOcr(ctx: CanvasRenderingContext2D, largura: number, altura: number, contraste = 1.3): void {
  const img = ctx.getImageData(0, 0, largura, altura);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const cinza = 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!;
    const v = Math.max(0, Math.min(255, (cinza - 128) * contraste + 128));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
}

/** Lê a captura de tela no navegador. Carrega o Tesseract sob demanda (worker, core e idioma via CDN). */
export async function lerPedidoImagem(arquivo: Blob, onProgresso?: (msg: string) => void): Promise<ResultadoOcr> {
  onProgresso?.("Preparando a imagem...");
  const bitmap = await createImageBitmap(arquivo);
  const escala = bitmap.width < LARGURA_MINIMA_OCR ? 2 : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  prepararParaOcr(ctx, canvas.width, canvas.height);

  onProgresso?.("Carregando o leitor de texto (primeira vez pode demorar)...");
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("por", 1, {
    logger: (m: { status?: string; progress?: number }) => {
      if (m.status === "recognizing text" && typeof m.progress === "number") onProgresso?.(`Lendo a captura... ${Math.round(m.progress * 100)}%`);
    },
  });
  try {
    return await ocrPedido(worker as unknown as WorkerOcr, canvas, canvas.width, canvas.height, escala);
  } finally {
    await worker.terminate();
  }
}
