-- Combinações de categoria existentes no catálogo, para montar os filtros da tela
-- de Produtos.
--
-- POR QUE UMA FUNÇÃO E NÃO UM SELECT DA TELA: o PostgREST não faz DISTINCT. Sem
-- isso, popular quatro seletores exigiria baixar marca/tipo/subtipo/grupo dos 5.000
-- produtos a cada visita — 300 KB para exibir uma dúzia de opções.
--
-- POR QUE COMBINAÇÕES E NÃO QUATRO LISTAS SOLTAS: com as combinações, escolher OBEN
-- pode restringir os tipos oferecidos ao que existe DENTRO de OBEN. Quatro listas
-- independentes ofereceriam recortes que devolvem zero produtos, e o usuário só
-- descobre isso depois de aplicar o filtro. São ~10 linhas no total — cabe inteiro
-- no cliente, e é ele que cruza.
--
-- Sem filtro de `ativo`: a lista de opções não pode depender do filtro de situação
-- da tela, senão uma marca que só tem produtos inativos sumiria do seletor
-- exatamente quando o usuário pede para ver inativos.
--
-- SECURITY INVOKER (o padrão) de propósito: é leitura de catálogo e deve respeitar
-- a RLS de `produtos` como qualquer outra consulta da tela.

CREATE OR REPLACE FUNCTION public.categorias_produtos()
RETURNS TABLE(
  marca text,
  tipo text,
  subtipo text,
  grupo text,
  total bigint
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT p.marca, p.tipo, p.subtipo, p.grupo, COUNT(*)
  FROM produtos p
  GROUP BY p.marca, p.tipo, p.subtipo, p.grupo
  ORDER BY p.marca NULLS LAST, p.tipo, p.subtipo, p.grupo;
$$;

COMMENT ON FUNCTION public.categorias_produtos() IS
  'Combinações distintas de marca/tipo/subtipo/grupo em `produtos`, com a contagem de '
  'cada uma. Alimenta os filtros encadeados da tela de Produtos. Inclui a combinação '
  'toda-nula (produtos sem categoria), que a tela oferece como "Sem categoria".';
