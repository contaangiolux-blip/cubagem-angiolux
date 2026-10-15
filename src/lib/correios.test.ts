import { describe, expect, it } from "vitest";
import type { Caixa, Produto, Resultado, Volume } from "./cubagem";
import { avisosCorreios, dimsCorreios, fmtCep, pesoCubico, pesoParaCotacao, textoParaCorreios } from "./correios";

const caixa = (codigo: number, nome: string, dims: [number, number, number]): Caixa => ({
  codigo, nome, peso: 0.5, dims, tipo: "terciaria", fornecedor: false,
  itens_sec: null, itens_terc: null, secs_na_terc: null, terc_fornecedor: null, parcial_min: null, fragil: false, observacao: "",
});
const vol = (c: Caixa, peso: number): Volume => ({ caixa: c, origem: "angiolux", peso, conteudo: [], pacotes: [] });
const produtoVazio: Produto = { codigo: "X", nome: "", peso: 0, codigo_caixa: null, fabricante: "" };
void produtoVazio;

const pequena = caixa(34, "Caixa Terciária Angiolux Pequena", [68, 26, 20]);
const comprida = caixa(40, "Caixa Terciária Angiolux Cat Angiográfico", [127, 26, 20]);

describe("apoio Correios", () => {
  it("formata CEP", () => {
    expect(fmtCep("60160280")).toBe("60160-280");
    expect(fmtCep("60160-280")).toBe("60160-280");
    expect(fmtCep("")).toBe("");
  });

  it("peso cúbico e peso para cotação (pedido 4599: 68x26x20, 1,99 kg)", () => {
    const v = vol(pequena, 1.99);
    expect(dimsCorreios(v)).toEqual([68, 26, 20]);
    expect(pesoCubico(v)).toBeCloseTo(5.893, 3);
    expect(pesoParaCotacao(v)).toBeCloseTo(5.893, 3);
    expect(avisosCorreios(v)).toEqual([]);
  });

  it("avisa quando excede os limites de SEDEX/PAC", () => {
    const v = vol(comprida, 3);
    expect(avisosCorreios(v)).toEqual(["lado de 127 cm excede o máximo de 100 cm"]);
    expect(avisosCorreios(vol(pequena, 31))).toEqual(["peso de 31,00 kg excede 30 kg"]);
  });

  it("texto para os Correios", () => {
    const res: Resultado = {
      pedido: { numero: "4599", cliente: "EV MEDICA", data: "23/07/2026", tipo_frete: "FOB", valor_total: 620, itens: [], cep: "60160280", cidade: "FORTALEZA", uf: "CE" },
      volumes: [vol(pequena, 1.99)],
      avisos: [], nao_cubados: [], peso_nao_cubado: 0,
    };
    expect(textoParaCorreios(res)).toBe(
      "CEP origem: 90035-120\nCEP destino: 60160-280 - FORTALEZA/CE\nVolume 1: 68 x 26 x 20 cm, 1,99 kg (peso cúbico 5,89 kg)",
    );
  });
});
