/**
 * Apoio à cotação nos Correios (SEDEX/PAC com contrato): limites de encomenda,
 * peso cúbico e texto resumido para copiar no simulador dos Correios.
 * A consulta de preço pela API oficial entra numa etapa posterior (função de backend).
 */
import { agruparVolumes, faixaVolumes, fmtKg, type Resultado, type Volume } from "./cubagem";

/** CEP da Angiolux (origem das postagens). */
export const CEP_ORIGEM_ANGIOLUX = "90035120";

/** Limites de encomenda nacional (SEDEX/PAC): cada lado até 100 cm, soma até 200 cm, até 30 kg. */
export const LIMITES_CORREIOS = { ladoMaxCm: 100, somaMaxCm: 200, pesoMaxKg: 30, divisorCubagem: 6000 };

export function fmtCep(cep: string | null | undefined): string {
  const d = (cep ?? "").replace(/\D/g, "");
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : (cep ?? "");
}

/** Dimensões em ordem decrescente (comprimento, largura, altura), como se preenche no simulador. */
export function dimsCorreios(v: Volume): [number, number, number] {
  return [...v.caixa.dims].sort((a, b) => b - a) as [number, number, number];
}

/** Peso cúbico em kg: (C x L x A) / 6000. Os Correios cobram o maior entre peso real e cúbico. */
export function pesoCubico(v: Volume): number {
  const [c, l, a] = dimsCorreios(v);
  return (c * l * a) / LIMITES_CORREIOS.divisorCubagem;
}

export function pesoParaCotacao(v: Volume): number {
  return Math.max(v.peso, pesoCubico(v));
}

/** Avisos quando o volume não cabe nos limites de SEDEX/PAC. */
export function avisosCorreios(v: Volume): string[] {
  const [c, l, a] = dimsCorreios(v);
  const avisos: string[] = [];
  if (c > LIMITES_CORREIOS.ladoMaxCm) avisos.push(`lado de ${c} cm excede o máximo de ${LIMITES_CORREIOS.ladoMaxCm} cm`);
  if (c + l + a > LIMITES_CORREIOS.somaMaxCm) avisos.push(`soma das dimensões (${c + l + a} cm) excede ${LIMITES_CORREIOS.somaMaxCm} cm`);
  if (v.peso > LIMITES_CORREIOS.pesoMaxKg) avisos.push(`peso de ${fmtKg(v.peso)} kg excede ${LIMITES_CORREIOS.pesoMaxKg} kg`);
  return avisos;
}

/** Texto para colar/consultar no simulador dos Correios, volume a volume. */
export function textoParaCorreios(res: Resultado): string {
  const p = res.pedido;
  const linhas: string[] = [];
  linhas.push(`CEP origem: ${fmtCep(CEP_ORIGEM_ANGIOLUX)}`);
  linhas.push(`CEP destino: ${p.cep ? fmtCep(p.cep) : "(não informado)"}${p.cidade ? ` - ${p.cidade}${p.uf ? "/" + p.uf : ""}` : ""}`);
  for (const g of agruparVolumes(res.volumes)) {
    const v = g.volume;
    const [c, l, a] = dimsCorreios(v);
    const n = g.indices.length;
    let linha = `${n > 1 ? `Volumes ${faixaVolumes(g.indices)} (${n} iguais)` : `Volume ${faixaVolumes(g.indices)}`}: ` +
      `${c} x ${l} x ${a} cm, ${fmtKg(v.peso)} kg${n > 1 ? " cada" : ""} (peso cúbico ${fmtKg(pesoCubico(v))} kg)`;
    const av = avisosCorreios(v);
    if (av.length) linha += ` - ATENÇÃO: ${av.join("; ")}`;
    linhas.push(linha);
  }
  return linhas.join("\n");
}
