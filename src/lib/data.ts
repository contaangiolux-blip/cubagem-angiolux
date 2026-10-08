import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type CaixaDb = Database["public"]["Tables"]["caixas"]["Row"];
export type ProdutoDb = Database["public"]["Tables"]["produtos"]["Row"];
export type CubagemDb = Database["public"]["Tables"]["cubagens"]["Row"];

async function fetchAll<T>(table: "caixas" | "produtos", order: string): Promise<T[]> {
  const out: T[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase.from(table).select("*").order(order).range(from, from + page - 1);
    if (error) throw new Error(`Erro ao carregar ${table}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < page) break;
  }
  return out;
}

export const caixasQuery = queryOptions({
  queryKey: ["caixas"],
  queryFn: () => fetchAll<CaixaDb>("caixas", "codigo_caixa"),
});

export const produtosQuery = queryOptions({
  queryKey: ["produtos"],
  queryFn: () => fetchAll<ProdutoDb>("produtos", "codigo"),
});

export const cubagensQuery = queryOptions({
  queryKey: ["cubagens"],
  queryFn: async () => {
    const { data, error } = await supabase.from("cubagens").select("*").order("created_at", { ascending: false }).limit(1000);
    if (error) throw new Error(`Erro ao carregar histórico: ${error.message}`);
    return data;
  },
});

export const fmtNum = (v: number | null | undefined, casas = 2) =>
  v === null || v === undefined ? "-" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });

export const fmtDataHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";
