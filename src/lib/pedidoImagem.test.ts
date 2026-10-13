// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import Jimp from "jimp";
import { createWorker } from "tesseract.js";
import { corrigirCodigo, inferirColunas, ocrPedido, type WorkerOcr } from "./pedidoImagem";

const fixtures = path.resolve(__dirname, "../test/fixtures");

describe("leitura de captura de tela (OCR)", () => {
  it("captura_pedido_4780.png: itens, CEP, cidade e cliente", async () => {
    const img = await Jimp.read(readFileSync(path.join(fixtures, "captura_pedido_4780.png")));
    const escala = img.bitmap.width < 1500 ? 2 : 1;
    img.scale(escala, Jimp.RESIZE_BICUBIC).greyscale().contrast(0.2); // equivale a prepararParaOcr no navegador
    const buf = await img.getBufferAsync(Jimp.MIME_PNG);

    const worker = await createWorker("por", 1, { langPath: fixtures, gzip: true, logger: () => {} });
    try {
      const r = await ocrPedido(worker as unknown as WorkerOcr, buf, img.bitmap.width, img.bitmap.height, escala);
      expect(r.pedido.itens).toHaveLength(1);
      expect(r.pedido.itens[0]).toMatchObject({ codigo: "615601", qtd: 30, valor_unit: 28.75, total: 862.5 });
      expect(r.pedido.itens[0]!.confianca ?? 0).toBeGreaterThanOrEqual(85);
      expect(r.pedido.cep).toBe("14026567");
      expect(r.pedido.uf).toBe("SP");
      expect((r.pedido.cidade ?? "").toUpperCase()).toContain("PRETO");
      expect(r.pedido.cliente).toContain("NEO MEDICAL COMERCIAL HOSPITALAR LTDA");
      expect(r.pedido.tipo_frete).toBe("FOB");
      expect(r.pedido.valor_total).toBe(862.5); // estimado pela soma dos itens (TOTAL não aparece na captura)
      expect(r.avisos.join(" ")).toContain("Valor da NF estimado");
    } finally {
      await worker.terminate();
    }
  }, 120_000);

  it("infere as colunas pela linha do item quando o cabeçalho não foi lido", () => {
    const w = (x0: number, s: string) => ({ x0, x1: x0 + 10, w: s });
    const rows = [
      [w(44, "COND."), w(134, "PAGTO:"), w(244, "30"), w(281, "DIAS")],
      [w(22, "eo"), w(233, "ser"), w(1549, "Yao"), w(1746, "Total")],
      [w(46, "615601"), w(266, "KIT"), w(314, "INTRODUTOR"), w(1423, "30"), w(1588, "28,75"), w(1773, "862,50")],
      [w(267, "75726050730X"), w(459, "V:"), w(494, "06/05/29")],
    ];
    const col = inferirColunas(rows);
    expect(col).toMatchObject({ idx: 1, qtd: 1423, valor: 1588, total: 1773, descricao: 266 });
  });

  it("corrige códigos com caracteres parecidos quando há um único candidato", () => {
    const cadastro = new Set(["615601", "BM-FA0611", "PS20015", "30100215"]);
    const existe = (c: string) => cadastro.has(c);
    expect(corrigirCodigo("6I560l", existe)).toBe("615601");
    expect(corrigirCodigo("BM-FAO611", existe)).toBe("BM-FA0611");
    expect(corrigirCodigo("PS2OO15", existe)).toBe("PS20015");
    expect(corrigirCodigo("615601", existe)).toBe("615601");
    expect(corrigirCodigo("XYZ", existe)).toBeNull();
  });
});
