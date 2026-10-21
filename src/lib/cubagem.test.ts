import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  agruparVolumes, caixasParaVolume, calcular, faixaVolumes, lerItensTexto, mapCaixas, mapProdutos, paraJson, textoParaCliente, trocarCaixa,
  type Caixa, type CaixaRow, type ProdutoRow,
} from "./cubagem";
import { parseCsv } from "./csv";
import { textoParaCorreios } from "./correios";

const fx = (f: string) => readFileSync(path.resolve(__dirname, "../test/fixtures", f), "utf8");
const caixas = mapCaixas(parseCsv(fx("caixas.csv")) as unknown as CaixaRow[]);
const produtos = mapProdutos(parseCsv(fx("produtos.csv")) as unknown as ProdutoRow[]);
const run = (t: string, cx: Map<number, Caixa> = caixas) => paraJson(calcular(lerItensTexto(t), produtos, cx));
const comMinimo = (codigo: number, minimo: number) => {
  const m = new Map(caixas);
  m.set(codigo, { ...m.get(codigo)!, parcial_min: minimo });
  return m;
};
const unidades = (r: ReturnType<typeof run>, codigo: string) =>
  r.volumes.flatMap((v) => v.conteudo).reduce((s, c) => s + Number(c.match(new RegExp(`^(\\d+) un ${codigo}\\b`))?.[1] ?? 0), 0);

describe("caixa original do fornecedor: só acima de 60% da lotação", () => {
  it("40 introdutores Shunmei (4 de 10 secundárias = 40%) vão para caixa Angiolux", () => {
    const r = run("615601:40");
    expect(r.volumes).toHaveLength(1);
    expect(r.volumes[0]).toMatchObject({ codigo_caixa: 2, dimensoes_cm: [68, 26, 20], origem: "angiolux" });
  });

  it("outro introdutor completa a caixa Shunmei (70%): ela é mantida", () => {
    const r = run("615601:40,615501:30");
    expect(r.volumes).toHaveLength(1);
    expect(r.volumes[0]).toMatchObject({ codigo_caixa: 17, origem: "fornecedor_parcial" });
    expect(r.volumes[0]!.conteudo).toContain("ocupação: 70%");
  });

  it("outro produto que caiba também conta para completar a caixa original", () => {
    // 5 secundárias de introdutor (50%) + 2 de torniquete → passa de 60%
    const r = run("615601:50,629904:20");
    expect(r.volumes).toHaveLength(1);
    expect(r.volumes[0]!.codigo_caixa).toBe(17);
    expect(r.volumes[0]!.conteudo.join(" ")).toContain("629904");
    // com 1 secundária de torniquete fica abaixo de 60%: os dois vão para uma caixa Angiolux
    const s = run("615601:50,629904:10");
    expect(s.volumes).toHaveLength(1);
    expect(s.volumes[0]!.origem).toBe("angiolux");
  });

  it("615601:137 → 1 caixa Shunmei cheia + sobra (40%) em caixa Angiolux", () => {
    const r = run("615601:137");
    expect(r.quantidade_volumes).toBe(2);
    expect(r.volumes[0]).toMatchObject({ codigo_caixa: 17, dimensoes_cm: [45, 31, 58], peso_kg: 7.86, origem: "fornecedor" });
    expect(r.volumes[1]).toMatchObject({ codigo_caixa: 2, dimensoes_cm: [68, 26, 20], peso_kg: 3.126, origem: "angiolux" });
    expect(r.volumes[1]!.conteudo).toContain("37 un 615601 (3 cx cheias + 1 com 7 un)");
    expect(r.peso_total_kg).toBe(10.986);
  });

  it("pedido Hope: sobras de 615501 e 615601 juntas na 2ª caixa Shunmei (9 de 10 secundárias)", () => {
    const r = run("615501:80,615601:110");
    const shunmei = r.volumes.filter((v) => v.codigo_caixa === 17);
    expect(shunmei).toHaveLength(2);
    expect(shunmei[0]).toMatchObject({ origem: "fornecedor", conteudo: ["100 un 615601 (10 cx secundárias)"] });
    expect(shunmei[1]!.origem).toBe("fornecedor_parcial");
    expect(shunmei[1]!.conteudo.slice(0, 3)).toEqual(["80 un 615501 (8 cx secundárias)", "10 un 615601 (1 cx secundária)", "ocupação: 90%"]);
    expect(r.quantidade_volumes).toBe(2);
  });

  it("casos de referência do protótipo", () => {
    expect(run("BM-FA0611:20").volumes).toEqual([
      expect.objectContaining({ codigo_caixa: 2, dimensoes_cm: [68, 26, 20], peso_kg: 1.99, m3: 0.03536, origem: "angiolux" }),
    ]);
    const d = run("30100215:100,615601:30");
    expect(d.quantidade_volumes).toBe(6);
    expect(d.volumes.filter((v) => v.codigo_caixa === 24 && v.peso_kg === 9.095)).toHaveLength(5);
    expect(d.volumes.find((v) => v.codigo_caixa === 2)).toMatchObject({ peso_kg: 2.59 });
    expect(d.peso_total_kg).toBe(48.065);
    expect(run("PS20015:40").volumes[0]).toMatchObject({ codigo_caixa: 30, peso_kg: 8.28, origem: "fornecedor_parcial" }); // 67%
    expect(run("PS20015:20").volumes[0]).toMatchObject({ codigo_caixa: 2, peso_kg: 4.19, origem: "angiolux" }); // 33%
    expect(run("CTKP-008IS:25").volumes[0]).toMatchObject({ codigo_caixa: 32, dimensoes_cm: [56, 40, 28], peso_kg: 10.05 }); // 78%
  });

  it("mínimo editável por caixa: 0 = usar sempre a caixa original", () => {
    const r = run("BM-FA0611:20", comMinimo(19, 0)); // 4 de 20 secundárias = 20%
    expect(r.volumes).toHaveLength(1);
    expect(r.volumes[0]).toMatchObject({ codigo_caixa: 19, origem: "fornecedor_parcial" });
  });
});

describe("balões e produtos inteiros", () => {
  it("balões (frágeis) não dividem caixa com outros produtos", () => {
    const r = run("615601:20,SE90040-130:3");
    const comBalao = r.volumes.filter((v) => v.conteudo.join(" ").includes("SE90040-130"));
    const comIntrodutor = r.volumes.filter((v) => v.conteudo.join(" ").includes("615601"));
    expect(comBalao).toHaveLength(1);
    expect(comIntrodutor).toHaveLength(1);
    expect(comBalao[0]).not.toBe(comIntrodutor[0]);
  });

  it("balões de tipos diferentes podem ir juntos (SE e SND)", () => {
    const r = run("SE90040-130:3,SND200150-150:2");
    expect(r.quantidade_volumes).toBe(1);
    expect(r.volumes[0]!.conteudo.slice(0, 2)).toEqual(["3 un SE90040-130", "2 un SND200150-150"]);
  });

  it("o mesmo código não é repartido entre caixas quando dá", () => {
    // 139 balões em 3 caixas Simeks (47 cada; a 3ª com 45 = 96%)
    const itens = "SE10040-130:2,SE10060-130:2,SE12080-130:2,SE300100-130:11,SE300120-130:6,SE300150-130:2,SE30040-130:3,SE30060-130:2," +
      "SE400120-130:6,SE40040-130:2,SE40060-130:6,SE40080-130:3,SE500120-130:6,SE500150-130:20,SE50040-130:5,SE50060-130:6," +
      "SE50080-130:1,SE60040-130:2,SE70040-130:2,SE80060-130:2,SND200100-150:2,SND200120-150:5,SND200150-150:2,SND20080-150:3," +
      "SND250120-150:10,SND250150-150:7,SND25080-150:7,SND300100-150:2,SND300120-150:6,SND30060-150:2,SND30080-150:2";
    const r = run(itens);
    expect(r.volumes.filter((v) => v.codigo_caixa === 29)).toHaveLength(3);
    const codigos = r.volumes.flatMap((v) => v.conteudo.map((c) => c.match(/^\d+ un (\S+)/)?.[1]).filter(Boolean));
    const repetidos = codigos.filter((c, i) => codigos.indexOf(c) !== i);
    expect(repetidos.length).toBeLessThanOrEqual(1);
    expect(unidades(r, "SE500150-130")).toBe(20);
  });
});

describe("edição manual da caixa", () => {
  it("lista só caixas em que o conteúdo cabe e recalcula peso ao trocar", () => {
    const res = calcular(lerItensTexto("BM-FA0611:20"), produtos, caixas);
    expect(res.volumes[0]!.caixa.codigo).toBe(2);
    const opcoes = caixasParaVolume(res.volumes[0]!, caixas);
    const codigos = opcoes.map((o) => o.caixa.codigo);
    expect(codigos).toContain(19); // caixa original Brosmed
    expect(codigos).not.toContain(1); // Mini não comporta 4 caixas de introdutor Brosmed
    expect(opcoes.find((o) => o.caixa.codigo === 19)!.ocupacao).toBeCloseTo(0.2, 5); // 4 de 20 secundárias
    const novo = trocarCaixa(res, 0, caixas.get(19)!);
    expect(novo.volumes[0]).toMatchObject({ origem: "fornecedor_parcial", editado: true });
    expect(paraJson(novo).volumes[0]).toMatchObject({ codigo_caixa: 19, peso_kg: 3.09, editado: true });
    expect(res.volumes[0]!.caixa.codigo).toBe(2); // original intacto
  });
});

describe("resumo dos volumes", () => {
  it("balão (1 un por secundária) aparece só como quantidade e código", () => {
    const r = run("SND250150-150:7,SND25080-150:7");
    expect(r.volumes[0]!.conteudo.slice(0, 2)).toEqual(["7 un SND250150-150", "7 un SND25080-150"]);
  });

  it("volumes iguais seguidos viram um grupo", () => {
    const res = calcular(lerItensTexto("30100215:200,615601:5"), produtos, caixas);
    const grupos = agruparVolumes(res.volumes);
    const dil = grupos.find((g) => g.volume.caixa.codigo === 24)!;
    expect(dil.indices).toHaveLength(10);
    expect(faixaVolumes(dil.indices)).toMatch(/^\d+ a \d+$/);
    expect(grupos).toHaveLength(2);
    expect(textoParaCorreios(res)).toContain("(10 iguais): 55 x 40 x 36 cm, 9,09 kg cada");
  });
});

describe("texto para o cliente", () => {
  it("começa pelo nome do cliente", () => {
    const pedido = lerItensTexto("BM-FA0611:20");
    pedido.cliente = "104 - EV MEDICA COMÉRCIO E DISTRIBUIÇÃO DE ARTIGOS MÉDICOS LTDA";
    pedido.valor_total = 620;
    expect(textoParaCliente(calcular(pedido, produtos, caixas)).split("\n")).toEqual([
      "Cliente: 104 - EV MEDICA COMÉRCIO E DISTRIBUIÇÃO DE ARTIGOS MÉDICOS LTDA",
      "Quantidade de volumes: 1",
      "Peso: 1,99 kg",
      "Dimensões: 68 x 26 x 20 cm",
      "Valor da NF: R$ 620,00",
    ]);
    pedido.cliente = "";
    expect(textoParaCliente(calcular(pedido, produtos, caixas)).startsWith("Quantidade de volumes: 1")).toBe(true);
  });
});
