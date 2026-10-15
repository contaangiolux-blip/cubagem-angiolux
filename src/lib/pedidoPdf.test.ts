// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { lerPedidoDePaginas, type PaginaTexto } from "./pedidoPdf";

async function lerFixture(nome: string) {
  const data = new Uint8Array(readFileSync(path.resolve(__dirname, "../test/fixtures", nome)));
  const doc = await getDocument({ data, verbosity: 0 }).promise;
  const paginas: PaginaTexto[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    paginas.push({ altura: vp.height, items: tc.items.filter((it) => "str" in it) as PaginaTexto["items"] });
  }
  return lerPedidoDePaginas(paginas);
}

describe("leitura do espelho do pedido (Odin)", () => {
  it("exemplo_pedido_4599.pdf", async () => {
    const p = await lerFixture("exemplo_pedido_4599.pdf");
    expect(p.numero).toBe("4599");
    expect(p.cliente).toBe("104 - EV MEDICA COMÉRCIO E DISTRIBUIÇÃO DE ARTIGOS MÉDICOS LTDA");
    expect(p.data).toBe("23/07/2026");
    expect(p.tipo_frete).toBe("FOB");
    expect(p.valor_total).toBe(620);
    expect(p.itens).toEqual([
      {
        codigo: "BM-FA0611",
        descricao: 'KIT INTRODUTOR FEMORAL 6F, 11CM, FIO GUIA 0,035", 45CM',
        qtd: 20,
        valor_unit: 31,
        total: 620,
      },
    ]);
  });
});
