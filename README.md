# Cubagem Angiolux

Aplicativo interno da Angiolux para calcular os volumes de expedição (quantidade de caixas,
dimensões e peso) a partir do espelho do pedido em PDF gerado pelo sistema Odin, gerando o
texto pronto para o cliente cotar o frete (FOB / Correios).

- **App publicado:** https://cubagem-angiolux.lovable.app
- **Editor Lovable:** https://lovable.dev/projects/a17232af-e3c8-4313-8618-782c1f196248
- **Banco:** Lovable Cloud (Supabase), projeto `thscddzbggevevnbirwy`

## Como usar

1. Entrar com e-mail e senha (ou criar conta na aba "Criar conta").
2. **Cubagem**: arrastar o PDF do espelho do pedido (ou clicar em **Cubagem manual** e digitar
   os itens), conferir itens e quantidades, clicar em **Calcular cubagem** e copiar o bloco
   **Texto para o cliente**. Na seção **Dados para os Correios**, cada CEP, medida e peso tem
   botão de copiar. **Salvar no histórico** guarda o cálculo.
3. **Cadastros**: manutenção das caixas e dos produtos (busca, filtros, edição com duplo
   clique, incluir, excluir). **Validar cadastros** aponta inconsistências.
4. **Histórico**: cubagens salvas, com busca por pedido/cliente e o texto para copiar.

## Lógica do cálculo (`src/lib/cubagem.ts`)

Nasceu como porte do protótipo Python (`cubagem.py`) e foi ajustada com o uso na expedição:

1. Cada item enche as caixas originais do fornecedor que conseguir (caixa cheia de um produto só).
2. O que sobra vira secundárias: cheias + no máximo uma parcial por item.
3. As sobras de todos os itens que usam a mesma caixa do fornecedor vão juntas para a caixa
   original (economia de caixas compradas), e o espaço livre recebe secundárias de outros produtos
   que caibam. Se, mesmo assim, a caixa original ficar com **até 60% da lotação**, o conteúdo vai
   para a menor caixa Angiolux que o comporta. Em Cadastros, "Mín. p/ usar original" muda esse
   limite por caixa (vazio = 0,6; 0 = usar sempre a original).
4. O que não couber em caixa de fornecedor vai para as caixas Angiolux: a menor que comporta tudo
   (85% de aproveitamento e checagem de dimensões); senão várias, reduzidas para a menor possível.

- Secundárias marcadas como **frágeis** (balões Simeks e Simvalve) só dividem caixa com outras frágeis.
- As secundárias de um mesmo produto ficam juntas sempre que possível.
- **Trocar caixa:** cada volume do resultado tem uma lista com as caixas em que o conteúdo cabe;
  o app recalcula peso, m³ e textos, e o histórico guarda a versão editada.

Peso de cada volume = produtos + secundárias + terciária.

### Numeração das caixas

| faixa | caixas |
|---|---|
| 1 a 9 | caixas Angiolux, da menor para a maior (número da etiqueta na prateleira) |
| 17 a 32 | caixas originais dos fornecedores |
| 101 a 117 | caixas secundárias |

## Banco de dados

Tabelas `caixas`, `produtos` (mesmas colunas dos CSVs do protótipo) e `cubagens`
(histórico). Migration em `drizzle/migrations/0000_cubagem_schema.sql`. Acesso só para
usuários autenticados (RLS).

## Desenvolvimento

```bash
npm install
npm run dev      # servidor local
npm test         # vitest: motor, leitura do PDF (inclusive várias páginas) e apoio aos Correios
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
