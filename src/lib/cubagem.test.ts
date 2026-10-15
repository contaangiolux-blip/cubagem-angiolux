import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  caixasParaVolume, calcular, lerItensTexto, mapCaixas, mapProdutos, paraJson, textoParaCliente, trocarCaixa,
  type Caixa, type CaixaRow, type ProdutoRow,
} from "./cubagem";
import { parseCsv } from "./csv";

const fx = (f: string) => readFileSync(path.resolve(__dirname, "../test/fixtures", f), "utf8");
const caixas = mapCaixas(parseCsv(fx("caixas.csv")) as unknown as CaixaRow[]);
const produtos = mapProdutos(parseCsv(fx("produtos.csv")) as unknown as ProdutoRow[]);
const run = (t: string, indisponiveis: number[] = [], cx: Map<number, Caixa> = caixas) =>
  paraJson(calcular(lerItensTexto(t), produtos, cx, undefined, { indisponiveis }));
const comMinimo = (codigo: number, minimo: number) => {
  const m = new Map(caixas);
  m.set(codigo, { ...m.get(codigo)!, parcial_min: minimo });
  return m;
};

describe("caixa original do fornecedor (sempre que houver)", () => {
  it("615601:137 → 1 caixa Shunmei cheia + sobra na própria caixa Shunmei", () => {
    const r = run("615601:137");
    expect(r.quantidade_volumes).toBe(2);
    expect(r.volumes[0]).toMatchObject({ codigo_caixa: 17, dimensoes_cm: [45, 31, 58], peso_kg: 7.86, origem: "fornecedor" });
    expect(r.volumes[1]).toMatchObject({ codigo_caixa: 17, origem: "fornecedor_parcial", peso_kg: 3.636 });
    expect(r.volumes[1]!.conteudo).toContain("4x Caixa Secundária Introdutores Shunmei (3 cheia(s) + 1 parcial c/ 7 un) = 37 un 615601");
    expect(r.peso_total_kg).toBe(11.496);
  });

  it("pedido Hope: sobras de 615501 e 615601 juntas na 2ª caixa Shunmei (9 de 10 secundárias)", () => {
    const r = run("615501:80,615601:110");
    const shunmei = r.volumes.filter((v) => v.codigo_caixa === 17);
    expect(shunmei).toHaveLength(2);
    expect(shunmei[0]).toMatchObject({ origem: "fornecedor", conteudo: ["100 un 615601 em 10 cx secundárias (caixa original cheia)"] });
    expect(shunmei[1]!.origem).toBe("fornecedor_parcial");
    expect(shunmei[1]!.conteudo.slice(0, 2)).toEqual([
      "8x Caixa Secundária Introdutores Shunmei = 80 un 615501",
      "1x Caixa Secundária Introdutores Shunmei = 10 un 615601",
    ]);
    expect(r.quantidade_volumes).toBe(2);
  });

  it("30100215:100,615601:30 → 5 caixas de dilatador cheias + introdutores na caixa Shunmei", () => {
    const r = run("30100215:100,615601:30");
    expect(r.quantidade_volumes).toBe(6);
    const dil = r.volumes.filter((v) => v.codigo_caixa === 24);
    expect(dil).toHaveLength(5);
    dil.forEach((v) => { expect(v.origem).toBe("fornecedor"); expect(v.peso_kg).toBe(9.095); });
    expect(r.volumes.filter((v) => v.codigo_caixa === 17)).toHaveLength(1);
  });

  it("balões Simeks e PHS na caixa original incompleta", () => {
    expect(run("PS20015:40").volumes[0]).toMatchObject({ codigo_caixa: 30, peso_kg: 8.28, origem: "fornecedor_parcial" });
    expect(run("PS20015:20").volumes[0]).toMatchObject({ codigo_caixa: 30, peso_kg: 4.64, origem: "fornecedor_parcial" });
    expect(run("CTKP-008IS:25").volumes[0]).toMatchObject({ codigo_caixa: 32, dimensoes_cm: [56, 40, 28], peso_kg: 10.05 });
  });

  it("espaço livre da caixa do fornecedor recebe outro produto que caiba", () => {
    // 615601 x50 abre a caixa Shunmei com 5 de 10 secundárias; o torniquete sem caixa disponível vai junto
    const r = run("615601:50,629904:10", [23]);
    expect(r.quantidade_volumes).toBe(1);
    expect(r.volumes[0]!.codigo_caixa).toBe(17);
    expect(r.volumes[0]!.conteudo.join(" ")).toContain("629904");
  });

  it("mínimo opcional por caixa: abaixo dele vai para caixa Angiolux", () => {
    const r = run("BM-FA0611:20", [], comMinimo(19, 0.6)); // 4 de 20 secundárias = 20%
    expect(r.volumes).toHaveLength(1);
    expect(r.volumes[0]).toMatchObject({ codigo_caixa: 2, dimensoes_cm: [68, 26, 20], peso_kg: 1.99, origem: "angiolux" });
  });
});

describe("balões, produtos inteiros e caixas indisponíveis", () => {
  it("balões (frágeis) não dividem caixa com outros produtos", () => {
    const r = run("615601:20,SE90040-130:3", [17, 29]); // sem as caixas de fornecedor → caixas Angiolux
    const comBalao = r.volumes.filter((v) => v.conteudo.join(" ").includes("SE90040-130"));
    const comIntrodutor = r.volumes.filter((v) => v.conteudo.join(" ").includes("615601"));
    expect(comBalao).toHaveLength(1);
    expect(comIntrodutor).toHaveLength(1);
    expect(comBalao[0]).not.toBe(comIntrodutor[0]);
  });

  it("balões de tipos diferentes podem ir juntos (SE e SND)", () => {
    const r = run("SE90040-130:3,SND200150-150:2");
    expect(r.quantidade_volumes).toBe(1);
    expect(r.volumes[0]!.codigo_caixa).toBe(29);
  });

  it("o mesmo código não é repartido entre caixas quando dá", () => {
    // 139 balões em 3 caixas Simeks (47 cada): cada código fica numa caixa só, salvo o necessário
    const itens = "SE10040-130:2,SE10060-130:2,SE12080-130:2,SE300100-130:11,SE300120-130:6,SE300150-130:2,SE30040-130:3,SE30060-130:2," +
      "SE400120-130:6,SE40040-130:2,SE40060-130:6,SE40080-130:3,SE500120-130:6,SE500150-130:20,SE50040-130:5,SE50060-130:6," +
      "SE50080-130:1,SE60040-130:2,SE70040-130:2,SE80060-130:2,SND200100-150:2,SND200120-150:5,SND200150-150:2,SND20080-150:3," +
      "SND250120-150:10,SND250150-150:7,SND25080-150:7,SND300100-150:2,SND300120-150:6,SND30060-150:2,SND30080-150:2";
    const r = run(itens);
    expect(r.volumes.filter((v) => v.codigo_caixa === 29)).toHaveLength(3);
    const codigos = r.volumes.flatMap((v) => v.conteudo.map((c) => c.match(/un (\S+)$/)?.[1]).filter(Boolean));
    const repetidos = codigos.filter((c, i) => codigos.indexOf(c) !== i);
    expect(repetidos.length).toBeLessThanOrEqual(1);
  });

  it("caixa indisponível hoje não é sugerida", () => {
    const r = run("615601:137", [17]);
    expect(r.volumes.every((v) => v.codigo_caixa !== 17)).toBe(true);
    expect(r.volumes.every((v) => v.origem === "angiolux")).toBe(true);
    const un = r.volumes.flatMap((v) => v.conteudo).join(" ").match(/= (\d+) un 615601/g)!.reduce((s, m) => s + Number(m.match(/\d+/)![0]), 0);
    expect(un).toBe(137);
  });
});

describe("edição manual da caixa", () => {
  it("lista só caixas em que o conteúdo cabe e recalcula peso ao trocar", () => {
    const res = calcular(lerItensTexto("BM-FA0611:20"), produtos, caixas);
    expect(res.volumes[0]!.caixa.codigo).toBe(19);
    const opcoes = caixasParaVolume(res.volumes[0]!, caixas);
    const codigos = opcoes.map((o) => o.caixa.codigo);
    expect(codigos).toContain(2); // Angiolux Pequena
    expect(codigos).not.toContain(1); // Mini não comporta 4 caixas de introdutor Brosmed
    const novo = trocarCaixa(res, 0, caixas.get(2)!);
    expect(novo.volumes[0]).toMatchObject({ origem: "angiolux", editado: true });
    expect(paraJson(novo).volumes[0]).toMatchObject({ codigo_caixa: 2, peso_kg: 1.99, editado: true });
    expect(res.volumes[0]!.caixa.codigo).toBe(19); // original intacto
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
      "Peso: 3,09 kg",
      "Dimensões: 59 x 54 x 36 cm",
      "Valor da NF: R$ 620,00",
    ]);
    pedido.cliente = "";
    expect(textoParaCliente(calcular(pedido, produtos, caixas)).startsWith("Quantidade de volumes: 1")).toBe(true);
  });
});
