-- 15/10/2026: renumeração das caixas, campo "frágil" e caixa do fornecedor sempre que houver sobra.
ALTER TABLE public.caixas ADD COLUMN IF NOT EXISTS fragil boolean NOT NULL DEFAULT false;
-- secundárias: 1..16 -> 101..116 e 42 -> 117
UPDATE public.produtos SET codigo_caixa = CASE WHEN codigo_caixa = 42 THEN 117 ELSE codigo_caixa + 100 END WHERE codigo_caixa BETWEEN 1 AND 16 OR codigo_caixa = 42;
UPDATE public.caixas SET codigo_caixa = CASE WHEN codigo_caixa = 42 THEN 117 ELSE codigo_caixa + 100 END WHERE tipo_caixa = 'secundaria';
-- caixas Angiolux numeradas 1..9 da menor para a maior (etiqueta da prateleira)
UPDATE public.caixas SET codigo_caixa = CASE codigo_caixa WHEN 33 THEN 1 WHEN 34 THEN 2 WHEN 35 THEN 3 WHEN 41 THEN 4 WHEN 36 THEN 5 WHEN 38 THEN 6 WHEN 40 THEN 7 WHEN 37 THEN 8 WHEN 39 THEN 9 END
  WHERE codigo_caixa IN (33,34,35,36,37,38,39,40,41) AND caixa_fornecedor = false AND tipo_caixa = 'terciaria';
-- balões são frágeis: só dividem caixa com balões
UPDATE public.caixas SET fragil = true WHERE codigo_caixa IN (114, 116, 117);
-- sobras sempre na caixa original do fornecedor (mínimo vazio = sempre)
UPDATE public.caixas SET terciaria_parcial_minimo = NULL WHERE caixa_fornecedor = true;
