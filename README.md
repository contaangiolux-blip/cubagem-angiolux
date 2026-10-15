# Cubagem Angiolux

Aplicativo interno da Angiolux para calcular os volumes de expedição (quantidade de caixas,
dimensões e peso) a partir do espelho do pedido em PDF gerado pelo sistema Odin, gerando o
texto pronto para o cliente cotar o frete (FOB / Correios).

- **App publicado:** https://cubagem-angiolux.lovable.app
- **Editor Lovable:** https://lovable.dev/projects/a17232af-e3c8-4313-8618-782c1f196248
- **Banco:** Lovable Cloud (Supabase), projeto `thscddzbggevevnbirwy`

## Como usar

1. Entrar com e-mail e senha (ou criar conta na aba "Criar conta").
2. **Cubagem**: arrastar o PDF do espelho do pedido, conferir os itens e quantidades
   (pode adicionar itens manualmente), clicar em **Calcular cubagem** e copiar o bloco
   **Texto para o cliente**. **Salvar no histórico** guarda o cálculo.
3. **Cadastros**: manutenção das caixas e dos produtos (busca, filtros, edição com duplo
   clique, incluir, excluir). **Validar cadastros** aponta inconsistências.
4. **Histórico**: cubagens salvas, com busca por pedido/cliente e o texto para copiar.

## Lógica do cálculo (`src/lib/cubagem.ts`)

Porte fiel do protótipo Python (`cubagem.py`, pasta Estoque/Cálculo de frete/Cubagem):

1. Caixa terciária original do fornecedor cheia.
2. Caixa original incompleta quando atinge a fração mínima (`terciaria_parcial_minimo`,
   hoje 60% para Simeks, PHS e Sinapi, cujas secundárias são lacradas).
3. Secundárias cheias + no máximo uma parcial por item.
4. Consolidação das secundárias soltas em caixas terciárias Angiolux: menor caixa que
   comporta tudo (85% de aproveitamento e checagem de dimensões); senão várias caixas
   (First Fit Decreasing) reduzidas depois para a menor possível. A terciária do próprio
   fornecedor também é candidata.

Peso de cada volume = produtos + secundárias + terciária.

## Banco de dados

Tabelas `caixas`, `produtos` (mesmas colunas dos CSVs do protótipo) e `cubagens`
(histórico). Migration em `drizzle/migrations/0000_cubagem_schema.sql`. Acesso só para
usuários autenticados (RLS).

## Desenvolvimento

```bash
npm install
npm run dev      # servidor local
npm test         # vitest: motor (6 casos de referência) e leitura do PDF de exemplo
npm run build    # build de produção
```

O projeto está conectado ao Lovable: commits na branch principal do GitHub são puxados
automaticamente pelo Lovable e publicados pelo botão Publish.

Arquivos principais:

| arquivo | função |
|---|---|
| `src/lib/cubagem.ts` | motor de cálculo, validação dos cadastros, texto para o cliente |
| `src/lib/pedidoPdf.ts` | leitura do espelho do pedido (posição das palavras por linha/coluna) |
| `src/lib/lerPdf.ts` | carrega o pdf.js no navegador e chama o leitor |
| `src/routes/_authenticated/index.tsx` | tela Cubagem |
| `src/routes/_authenticated/cadastros.tsx` | tela Cadastros (grade editável) |
| `src/routes/_authenticated/historico.tsx` | tela Histórico |
| `src/routes/login.tsx` | login / criar conta |
