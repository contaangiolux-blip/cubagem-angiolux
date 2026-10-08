# Angiolux Carga

# Cubagem Angiolux — app interno de cálculo de volumes para cotação de frete

Construa um aplicativo web interno, em **português do Brasil**, chamado **"Cubagem Angiolux"**, para a equipe de estoque/expedição da Angiolux (distribuidora de dispositivos médicos, Porto Alegre). O app recebe o PDF do "espelho do pedido" gerado pelo sistema Odin, identifica os itens e calcula os volumes de expedição (quantidade de caixas, dimensões, peso), gerando um texto pronto para enviar ao cliente cotar o frete (FOB/Correios). Uso em notebook (desktop first, mas responsivo). Visual limpo e profissional, tema claro, cor primária azul-escuro, shadcn/ui.

## Arquivos anexados (use-os literalmente)

1. **cubagem.ts** — motor de cálculo já portado e validado. Salve em `src/lib/cubagem.ts` **sem alterar a lógica** (pode ajustar imports/`.ts` nas extensões e tipagem para compilar). Exporta: tipos `Caixa`, `Produto`, `Pedido`, `ItemPedido`, `Resultado`, `Volume`; `mapCaixas(rows)`, `mapProdutos(rows)` (convertem linhas do banco, mesmas colunas das tabelas abaixo), `calcular(pedido, produtos, caixas)`, `validar(produtos, caixas)`, `textoParaCliente(res)`, `paraJson(res)`, `lerItensTexto`, `dimsTxt`, `fmtKg`, `fmtBrl`, `m3Volume`, `pesoTotal`, `m3Total`, `DESCRICAO_ORIGEM`.
2. **pedidoPdf.ts** — leitor do espelho do pedido com pdf.js. Salve em `src/lib/pedidoPdf.ts`. Use `pdfjs-dist` (versão 4.x) no navegador conforme o comentário no fim do arquivo (worker via `?url` do Vite). Função principal: `lerPedidoDePaginas(paginas)` → `Pedido` com `numero`, `cliente`, `data`, `tipo_frete`, `valor_total` e `itens[]` (`codigo`, `descricao`, `qtd`).
3. **caixas.csv** e **produtos.csv** — cadastros atuais (separador `;`, UTF-8). Servem como referência do esquema. **Não precisa importar os dados**: a importação será feita por SQL depois.
4. **exemplo_pedido_4599.pdf** — PDF real para testar. Resultado esperado: pedido 4599, cliente "104 - EV MEDICA COMÉRCIO E DISTRIBUIÇÃO DE ARTIGOS MÉDICOS LTDA", data 23/07/2026, frete FOB, valor NF R$ 620,00, 1 item BM-FA0611 x 20 → **1 volume 68 x 26 x 20 cm, 1,99 kg, 0,03536 m³**, caixa "Caixa Terciária Angiolux Pequena", conteúdo "4x Caixa Secundária Introdutores Brosmed = 20 un BM-FA0611", "ocupação volumétrica: 57%".

## Banco de dados (Lovable Cloud / Supabase)

Crie via migration exatamente estas tabelas (nomes de coluna idênticos aos CSVs):

**caixas**
- `codigo_caixa integer primary key`
- `nome_caixa text not null`
- `peso_caixa_kg numeric not null default 0`
- `largura_cm numeric not null default 0`, `altura_cm numeric not null default 0`, `comprimento_cm numeric not null default 0`
- `tipo_caixa text not null check (tipo_caixa in ('secundaria','terciaria'))`
- `caixa_fornecedor boolean not null default false`
- `quantidade_itens_por_caixa_secundaria integer null`
- `quantidade_itens_por_caixa_terciaria integer null`
- `caixas_secundarias_permitidas_na_terciaria integer null`
- `caixa_terciaria_fornecedor integer null`
- `terciaria_parcial_minimo numeric null` (fração 0 a 1)
- `observacao text null`
- `updated_at timestamptz default now()`

**produtos**
- `codigo text primary key` (exatamente como aparece no espelho do pedido)
- `nome_produto text`
- `peso_unitario_kg numeric not null default 0`
- `codigo_caixa integer null` (aponta para a caixa secundária)
- `fabricante text`
- `updated_at timestamptz default now()`

**cubagens** (histórico)
- `id uuid pk default gen_random_uuid()`, `created_at timestamptz default now()`, `user_id uuid` (auth.uid()), `user_email text`
- `pedido text`, `cliente text`, `data_pedido text`, `tipo_frete text`, `valor_nf numeric null`
- `itens jsonb` (itens do pedido), `volumes jsonb` (lista de volumes), `resultado jsonb` (saída de `paraJson`), `texto_cliente text`
- `quantidade_volumes integer`, `peso_total_kg numeric`, `m3_total numeric`

RLS: ativar em todas; qualquer usuário **autenticado** pode SELECT/INSERT/UPDATE/DELETE em caixas e produtos; em cubagens, autenticado pode SELECT tudo e INSERT (user_id = auth.uid()); DELETE só o próprio registro. Nada é público.

## Autenticação

Supabase Auth com e-mail/senha. Tela `/login` com abas "Entrar" e "Criar conta" (a equipe cria a própria conta; sem confirmação de e-mail — ative auto-confirm). Todas as outras rotas exigem login (redirecionar para /login). Mostrar e-mail do usuário e botão "Sair" no cabeçalho.

## Layout

Cabeçalho fixo com logo/texto "Cubagem Angiolux" e navegação: **Cubagem** (`/`), **Cadastros** (`/cadastros`), **Histórico** (`/historico`). Conteúdo em container largo (max ~1200px). Tudo em pt-BR (números com vírgula decimal, datas dd/mm/aaaa).

## Tela 1 — Cubagem (`/`)

1. **Área de upload**: arrastar/soltar ou clicar para escolher o PDF do espelho do pedido (`application/pdf`). Ao receber, parsear no navegador com pdf.js + `lerPedidoDePaginas`. Mostrar um card com nº do pedido, cliente, data, tipo de frete e valor da NF (editáveis). Se nenhum item for encontrado, avisar: "Nenhum item encontrado. O arquivo é um espelho de pedido do Odin em texto (não imagem)?".
2. **Tabela de itens** (editável): colunas Código, Descrição (do pedido ou nome do produto cadastrado), Qtd (input numérico editável), Status (badge verde "cadastrado" / vermelho "sem cadastro" / amarelo "sem caixa") e botão remover. Abaixo, linha para **adicionar item manualmente**: campo código com autocomplete (busca em produtos por código ou nome) + quantidade + botão "Adicionar". Também um botão "Limpar" para começar um pedido manual do zero (sem PDF).
3. Botão grande **"Calcular cubagem"** → chama `calcular(pedido, produtos, caixas)` com os cadastros carregados do banco (carregue caixas e produtos uma vez ao abrir a tela, via React Query, e converta com `mapCaixas`/`mapProdutos`).
4. **Resultado**:
   - Cards de resumo: Quantidade de volumes, Peso total (kg), m³ total, Valor da NF.
   - Lista/tabela de volumes: nº, dimensões (`dimsTxt` + " cm"), peso (`fmtKg` + " kg"), m³ (4 casas), nome da caixa, badge com a origem (`DESCRICAO_ORIGEM[origem]`) e as linhas de `conteudo`.
   - Seção "Itens não cubados" (se houver): código, qtd, motivo, em destaque amarelo.
   - Seção "Avisos" (se houver).
   - Bloco **"Texto para o cliente"**: `<pre>` com o retorno de `textoParaCliente(res)` e botão **"Copiar"** (clipboard + toast "Copiado").
   - Botão **"Salvar no histórico"** que grava em `cubagens` (pedido, cliente, data_pedido, tipo_frete, valor_nf, itens, volumes = `paraJson(res).volumes`, resultado = `paraJson(res)`, texto_cliente, quantidade_volumes, peso_total_kg, m3_total, user_id, user_email). Toast de sucesso. Se o pedido já tiver cálculo salvo, salvar mesmo assim (novo registro).

## Tela 2 — Cadastros (`/cadastros`)

Abas **Caixas** e **Produtos**, cada uma com grade editável para a equipe manter os cadastros sem planilha:
- Campo de busca (texto livre: código/nome) e filtros (Caixas: tipo secundária/terciária e fornecedor sim/não; Produtos: fabricante, "sem caixa").
- Edição **inline** (clicar na célula ou botão lápis → inputs na linha → Salvar/Cancelar), com upsert no Supabase e toast. Em Produtos, a coluna `codigo_caixa` deve ser um select com as caixas **secundárias** (mostrar "código – nome"). Em Caixas, `caixa_terciaria_fornecedor` é select com as terciárias de fornecedor; `tipo_caixa` select; `caixa_fornecedor` checkbox; `terciaria_parcial_minimo` numérico 0–1.
- Botão "Nova caixa" / "Novo produto" (formulário em dialog) e botão excluir com confirmação.
- Contador "N caixas / N produtos".
- Botão **"Validar cadastros"** no topo: roda `validar(produtos, caixas)` com os dados atuais e mostra a lista de mensagens em um painel (ou "Nenhum problema encontrado").

## Tela 3 — Histórico (`/historico`)

Tabela das cubagens salvas (mais recentes primeiro): data/hora, pedido, cliente, nº volumes, peso, m³, usuário. Busca por pedido/cliente. Clicar abre um dialog/painel com os volumes e o texto para o cliente (com botão copiar) e botão para excluir o próprio registro.

## Qualidade

- Adicione testes (vitest) em `src/lib/cubagem.test.ts` usando os dados dos CSVs anexados (pode copiar as linhas relevantes como fixtures) com estes casos esperados (saída de `paraJson`):
  - `BM-FA0611:20` → 1 volume, caixa "Caixa Terciária Angiolux Pequena", dims [68,26,20], peso 1.99, m3 0.03536.
  - `615601:137` → 2 volumes: "Caixa Terciária Shunmei Introdutor" [45,31,58] 7.86 kg origem fornecedor; "Caixa Terciária Angiolux Pequena" [68,26,20] 3.126 kg, conteúdo "4x Caixa Secundária Introdutores Shunmei (3 cheia(s) + 1 parcial c/ 7 un) = 37 un 615601"; total 10.986 kg.
  - `30100215:100,615601:30` → 6 volumes (5x "Caixa Terciária Xiamen Dilatador" [55,36,40] 9.095 kg + 1x Angiolux Pequena 2.59 kg), total 48.065 kg.
  - `PS20015:40` → 1 volume "Caixa Terciária Simeks Coronários" [56,40,26] 8.28 kg origem fornecedor_parcial.
  - `PS20015:20` → 1 volume "Caixa Terciária Angiolux Pequena" 4.19 kg.
  - `CTKP-008IS:25` → 1 volume "Caixa Terciária PHS" [56,40,28] 10.05 kg origem fornecedor_parcial.
- Estados de carregamento e erro com mensagens em português. Sem dados fictícios na UI.

Comece pelo backend (Cloud + migrations + auth), depois as três telas. Ao terminar, teste o fluxo com o PDF anexado e confirme que o resultado bate com o esperado acima.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://cubagem-angiolux.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/a17232af-e3c8-4313-8618-782c1f196248).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
