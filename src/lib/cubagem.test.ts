import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { calcular, lerItensTexto, mapCaixas, mapProdutos, paraJson, type CaixaRow, type ProdutoRow } from "./cubagem";
import { parseCsv } from "./csv";

const fx = (f: string) => readFileSync(path.resolve(__dirname, "../test/fixtures", f), "utf8");
const caixas = mapCaixas(parseCsv(fx("caixas.csv")) as unknown as CaixaRow[]);
const produtos = mapProdutos(parseCsv(fx("produtos.csv")) as unknown as ProdutoRow[]);
const run = (t: string) => paraJson(calcular(lerItensTexto(t), produtos, caixas));

describe("cubagem", () => {
  it("BM-FA0611:20", () => {
    const r = run("BM-FA0611:20");
    expect(r.quantidade_volumes).toBe(1);
    expect(r.volumes[0]!.caixa).toBe("Caixa Terciária Angiolux Pequena");
    expect(r.volumes[0]!.dimensoes_cm).toEqual([68, 26, 20]);
    expect(r.volumes[0]!.peso_kg).toBe(1.99);
    expect(r.volumes[0]!.m3).toBe(0.03536);
  });

  it("615601:137", () => {
    const r = run("615601:137");
    expect(r.quantidade_volumes).toBe(2);
    expect(r.volumes[0]).toMatchObject({ caixa: "Caixa Terciária Shunmei Introdutor", dimensoes_cm: [45, 31, 58], peso_kg: 7.86, origem: "fornecedor" });
    expect(r.volumes[1]!).toMatchObject({ caixa: "Caixa Terciária Angiolux Pequena", dimensoes_cm: [68, 26, 20], peso_kg: 3.126 });
    expect(r.volumes[1]!.conteudo).toContain("4x Caixa Secundária Introdutores Shunmei (3 cheia(s) + 1 parcial c/ 7 un) = 37 un 615601");
    expect(r.peso_total_kg).toBe(10.986);
  });

  it("30100215:100,615601:30", () => {
    const r = run("30100215:100,615601:30");
    expect(r.quantidade_volumes).toBe(6);
    const dil = r.volumes.filter((v) => v.caixa === "Caixa Terciária Xiamen Dilatador");
    expect(dil).toHaveLength(5);
    dil.forEach((v) => { expect(v.dimensoes_cm).toEqual([55, 36, 40]); expect(v.peso_kg).toBe(9.095); });
    const peq = r.volumes.filter((v) => v.caixa === "Caixa Terciária Angiolux Pequena");
    expect(peq).toHaveLength(1);
    expect(peq[0]!.peso_kg).toBe(2.59);
    expect(r.peso_total_kg).toBe(48.065);
  });

  it("PS20015:40", () => {
    const r = run("PS20015:40");
    expect(r.quantidade_volumes).toBe(1);
    expect(r.volumes[0]).toMatchObject({ caixa: "Caixa Terciária Simeks Coronários", dimensoes_cm: [56, 40, 26], peso_kg: 8.28, origem: "fornecedor_parcial" });
  });

  it("PS20015:20", () => {
    const r = run("PS20015:20");
    expect(r.quantidade_volumes).toBe(1);
    expect(r.volumes[0]).toMatchObject({ caixa: "Caixa Terciária Angiolux Pequena", peso_kg: 4.19 });
  });

  it("CTKP-008IS:25", () => {
    const r = run("CTKP-008IS:25");
    expect(r.quantidade_volumes).toBe(1);
    expect(r.volumes[0]).toMatchObject({ caixa: "Caixa Terciária PHS", dimensoes_cm: [56, 40, 28], peso_kg: 10.05, origem: "fornecedor_parcial" });
  });
});
