// @vitest-environment node
import { describe, expect, it } from "vitest";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { lerPedidoDePaginas, type PaginaTexto } from "./pedidoPdf";

/**
 * PDF sintético no layout do espelho do pedido do Odin (sem dados de cliente reais).
 * Cada palavra vai em [x, y a partir do topo, texto]; fonte Helvetica 8 pt, página A4 (595 x 841).
 */
function pdfSintetico(palavras: Array<[number, number, string]>): Uint8Array {
  const esc = (s: string) => s.replace(/[()\\]/g, (m) => "\\" + m);
  const conteudo = palavras.map(([x, y, s]) => `BT /F1 8 Tf ${x} ${841 - y - 7} Td (${esc(s)}) Tj ET`).join("\n");
  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 841] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    `<< /Length ${Buffer.byteLength(conteudo, "latin1")} >>\nstream\n${conteudo}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objetos.forEach((o, i) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(pdf, "latin1"));
}

async function lerPdf(data: Uint8Array) {
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

const palavras = (y: number, ...ws: Array<[number, string]>): Array<[number, number, string]> => ws.map(([x, s]) => [x, y, s]);

describe("leitura do espelho do pedido (Odin) via pdf.js", () => {
  it("cabeçalho, endereço e itens", async () => {
    const pdf = pdfSintetico([
      ...palavras(33, [140, "ANGIOMED"], [223, "IMPORTACAO"], [325, "E"], [343, "EXPORTACAO"], [445, "LTDA"]),
      ...palavras(98, [262, "PEDIDO"]),
      ...palavras(122, [17, "PEDIDO"], [187, "9002"]),
      ...palavras(142, [19, "CLIENTE:"], [79, "77"], [102, "-"], [110, "CLIENTE"], [150, "EXEMPLO"], [200, "LTDA"], [240, "-"]),
      ...palavras(157, [19, "FANTASIA:"], [79, "EXEMPLO"], [354, "DATA:"], [426, "05/09/2026"]),
      ...palavras(169, [19, "ENDERECO:"], [79, "RUA"], [100, "TESTE"], [354, "CEP:"], [426, "90000000"]),
      ...palavras(181, [19, "CIDADE:"], [79, "PORTO"], [110, "ALEGRE"], [150, "-"], [158, "RS"], [354, "BAIRRO:"], [426, "CENTRO"]),
      ...palavras(241, [19, "TRANSPORT.:"], [354, "TIPO"], [377, "DE"], [391, "FRETE:"], [426, "FOB"]),
      ...palavras(266, [20, "Codigo"], [86, "Descricao"], [423, "QTD"], [478, "Valor"], [539, "Total"]),
      ...palavras(278, [20, "BM-FA0611"], [86, "KIT"], [101, "INTRODUTOR"], [158, "FEMORAL"], [431, "20"], [479, "31,00"], [535, "620,00"]),
      ...palavras(683, [33, "VALORES"], [91, "+"], [98, "MERCADORIA:"], [182, "620,00"]),
      ...palavras(719, [338, "TOTAL:"], [428, "620,00"]),
    ]);
    const p = await lerPdf(pdf);
    expect(p.numero).toBe("9002");
    expect(p.cliente).toBe("77 - CLIENTE EXEMPLO LTDA");
    expect(p.data).toBe("05/09/2026");
    expect(p.tipo_frete).toBe("FOB");
    expect(p.valor_total).toBe(620);
    expect(p.cep).toBe("90000000");
    expect(p.cidade).toBe("PORTO ALEGRE");
    expect(p.uf).toBe("RS");
    expect(p.itens).toEqual([{ codigo: "BM-FA0611", descricao: "KIT INTRODUTOR FEMORAL", qtd: 20, valor_unit: 31, total: 620 }]);
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
