CREATE TABLE public.caixas (
  codigo_caixa integer PRIMARY KEY,
  nome_caixa text NOT NULL,
  peso_caixa_kg numeric NOT NULL DEFAULT 0,
  largura_cm numeric NOT NULL DEFAULT 0,
  altura_cm numeric NOT NULL DEFAULT 0,
  comprimento_cm numeric NOT NULL DEFAULT 0,
  tipo_caixa text NOT NULL CHECK (tipo_caixa IN ('secundaria','terciaria')),
  caixa_fornecedor boolean NOT NULL DEFAULT false,
  quantidade_itens_por_caixa_secundaria integer NULL,
  quantidade_itens_por_caixa_terciaria integer NULL,
  caixas_secundarias_permitidas_na_terciaria integer NULL,
  caixa_terciaria_fornecedor integer NULL,
  terciaria_parcial_minimo numeric NULL,
  observacao text NULL,
  updated_at timestamptz DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.caixas TO authenticated;
GRANT ALL ON public.caixas TO service_role;
ALTER TABLE public.caixas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all caixas" ON public.caixas FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.produtos (
  codigo text PRIMARY KEY,
  nome_produto text,
  peso_unitario_kg numeric NOT NULL DEFAULT 0,
  codigo_caixa integer NULL,
  fabricante text,
  updated_at timestamptz DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.produtos TO authenticated;
GRANT ALL ON public.produtos TO service_role;
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all produtos" ON public.produtos FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.cubagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  user_id uuid,
  user_email text,
  pedido text, cliente text, data_pedido text, tipo_frete text,
  valor_nf numeric NULL,
  itens jsonb, volumes jsonb, resultado jsonb, texto_cliente text,
  quantidade_volumes integer, peso_total_kg numeric, m3_total numeric
);
GRANT SELECT, INSERT, DELETE ON public.cubagens TO authenticated;
GRANT ALL ON public.cubagens TO service_role;
ALTER TABLE public.cubagens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth select cubagens" ON public.cubagens FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert own cubagens" ON public.cubagens FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "auth delete own cubagens" ON public.cubagens FOR DELETE TO authenticated USING (user_id = auth.uid());