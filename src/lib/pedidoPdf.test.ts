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
    expect(p.cep).toBe("60160280");
    expect(p.cidade).toBe("FORTALEZA");
    expect(p.uf).toBe("CE");
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

describe("pedido com mais de uma página", () => {
  // Monta páginas sintéticas no formato do Odin (sem dados de cliente reais).
  const ALTURA = 841;
  const pal = (x: number, yTopo: number, s: string) => ({ str: s, transform: [1, 0, 0, 8, x, ALTURA - yTopo - 6.4], width: s.length * 5, height: 8 });
  const linha = (y: number, ...ws: Array<[number, string]>) => ws.map(([x, s]) => pal(x, y, s));
  const topo = () => [...linha(33, [140, "ANGIOMED"], [223, "IMPORTACAO"]), ...linha(98, [262, "PEDIDO"])];
  const rodape = (n: string) => [...linha(767, [390, "Impresso"], [426, "em:"], [442, "14/10/2026"], [546, n]), ...linha(775, [14, "Sistema"], [41, "Odin®"])];

  const pagina1 = {
    altura: ALTURA,
    items: [
      ...topo(),
      ...linha(122, [17, "PEDIDO"], [187, "9001"]),
      ...linha(142, [19, "CLIENTE:"], [79, "1"], [102, "-"], [110, "CLIENTE"], [160, "TESTE"], [210, "LTDA"]),
      ...linha(266, [20, "Código"], [86, "Descrição"], [423, "QTD"], [478, "Valor"], [539, "Total"]),
      ...linha(278, [20, "615501"], [86, "KIT"], [101, "INTRODUTOR"], [431, "80"], [479, "29,00"], [529, "2.320,00"]),
      ...linha(290, [86, "LOTE"], [120, "111"]),
      ...linha(302, [20, "SND200150-150"], [86, "SIMPASS"], [122, "ENDO"], [336, "LOTES:"], [436, "2"], [476, "330,00"], [536, "660,00"]),
      ...rodape("1"),
    ],
  };
  const pagina2 = {
    altura: ALTURA,
    items: [
      ...topo(),
      ...linha(120, [86, "25120357"], [122, "V:"], [134, "30/11/28"]),
      ...linha(132, [20, "30100215"], [86, "DILATADOR"], [427, "200"], [480, "68,00"], [525, "13.600,00"]),
      ...linha(144, [20, "612003"], [86, "SHUN"], [109, "SKYLINE"], [427, "120"], [480, "16,00"], [529, "1.920,00"]),
      ...linha(683, [33, "VALORES"], [91, "+"], [98, "MERCADORIA:"], [182, "18.500,00"]),
      ...linha(719, [338, "TOTAL:"], [428, "18.500,00"]),
      ...rodape("2"),
    ],
  };

  it("lê os itens da 2ª página mesmo sem o cabeçalho da tabela", () => {
    const p = lerPedidoDePaginas([pagina1, pagina2] as PaginaTexto[]);
    expect(p.numero).toBe("9001");
    expect(p.valor_total).toBe(18500);
    expect(p.itens.map((i) => [i.codigo, i.qtd])).toEqual([
      ["615501", 80],
      ["SND200150-150", 2],
      ["30100215", 200],
      ["612003", 120],
    ]);
    // lote que quebrou para o topo da página 2 continua na descrição do último item da página 1
    expect(p.itens[1]!.descricao).toContain("25120357");
    // cabeçalho e rodapé da página não viram descrição
    expect(p.itens[0]!.descricao).toBe("KIT INTRODUTOR LOTE 111");
    expect(p.itens.some((i) => /ANGIOMED|Impresso/.test(i.descricao))).toBe(false);
  });
});
