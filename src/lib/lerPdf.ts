import type { Pedido } from "./cubagem";
import { lerPedidoDePaginas, type PaginaTexto } from "./pedidoPdf";

/** Lê o PDF do espelho do pedido no navegador (pdf.js carregado sob demanda). */
export async function lerPedidoPdf(file: File): Promise<Pedido> {
  const pdfjs = await import("pdfjs-dist");
  const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const paginas: PaginaTexto[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    paginas.push({ altura: vp.height, items: tc.items.filter((it) => "str" in it) as PaginaTexto["items"] });
  }
  return lerPedidoDePaginas(paginas);
}
