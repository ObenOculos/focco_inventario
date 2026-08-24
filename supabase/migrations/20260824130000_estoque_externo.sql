-- `estoque_externo` — o que está na mão dos representantes, para o Panorama.
--
-- É o contrapeso do `/estoque` do gateway, que traz o saldo INTERNO da empresa.
-- Juntos respondem "quanto temos, e onde está".
--
-- O QUE ESTA FUNÇÃO É, E O QUE ELA NÃO É
--
-- Ela NÃO é um saldo ao vivo. Não existe saldo por representante em lugar nenhum:
-- o que existe é a última CONTAGEM que cada um enviou e o gerente aprovou. Duas
-- consequências que a tela é obrigada a mostrar, não esconder:
--
--   1. **Cada pedaço tem uma data diferente.** Um vendedor contou ontem, outro há
--      quatro meses. Somar os dois dá um número que não existiu em nenhum instante.
--      Por isso `data_inventario` viaja em toda linha — é o que permite à tela dizer
--      "este total mistura contagens de 12/04 a 22/08".
--   2. **A última contagem pode ser um fragmento.** Inventários do mesmo dia são
--      contagens PARCIAIS, não recontagens (medido em produção; é a razão de existir
--      o `juntar_inventarios`). Pegar o mais recente de cada vendedor pode pegar
--      justamente um pedaço. Não dá para corrigir aqui sem inventar regra: juntar os
--      fragmentos é decisão do gerente, e a função de juntar já existe para isso.
--
-- Por que o ÚLTIMO APROVADO, e não o último de qualquer status: `pendente` e
-- `revisao` são contagens que ninguém conferiu. Um total de estoque construído sobre
-- elas mudaria sozinho quando o gerente reprovasse uma.
--
-- GRÃO: `codigo_auxiliar` (modelo + cor). Note que o estoque INTERNO do Ciclone só
-- desce até o modelo — comparar os dois exige subir este lado, e a tela precisa
-- dizer isso em vez de somar as duas medidas caladas.

CREATE OR REPLACE FUNCTION public.estoque_externo()
RETURNS TABLE(
  codigo_vendedor text,
  nome_vendedor text,
  inventario_id uuid,
  data_inventario date,
  codigo_auxiliar text,
  codigo_produto text,
  nome_produto text,
  cor text,
  marca text,
  tipo text,
  subtipo text,
  grupo text,
  quantidade numeric,
  valor numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- SECURITY DEFINER para atravessar a RLS de `itens_inventario` e ler a contagem de
  -- qualquer vendedor; por isso a autorização é feita aqui dentro, como nas demais.
  IF public.get_user_role(auth.uid()) IS DISTINCT FROM 'gerente'::user_role THEN
    RAISE EXCEPTION 'Acesso negado: apenas gerentes veem o estoque externo.';
  END IF;

  RETURN QUERY
  WITH ultimo_por_vendedor AS (
    -- DISTINCT ON é o group-wise maximum do Postgres: uma linha por vendedor, a de
    -- maior data. O desempate por `created_at` importa — vários inventários do mesmo
    -- vendedor podem ter a MESMA `data_inventario`, e sem ele a escolha ficaria a
    -- cargo da ordem de leitura, mudando o total entre duas execuções iguais.
    SELECT DISTINCT ON (i.codigo_vendedor)
           i.id, i.codigo_vendedor, i.data_inventario
    FROM inventarios i
    WHERE i.status = 'aprovado'::inventory_status
    ORDER BY i.codigo_vendedor, i.data_inventario DESC, i.created_at DESC
  )
  SELECT
    u.codigo_vendedor,
    -- O perfil é por `codigo_vendedor`, que não tem unicidade garantida no cadastro;
    -- `MIN` evita que um código duplicado multiplique as linhas do item.
    (SELECT MIN(p.nome) FROM profiles p WHERE p.codigo_vendedor = u.codigo_vendedor),
    u.id,
    u.data_inventario::date,
    it.codigo_auxiliar,
    pr.codigo_produto,
    -- O nome do catálogo manda; o da contagem é o reserva. Produto contado antes da
    -- sincronização não tem par em `produtos` e ficaria sem nome nenhum.
    COALESCE(pr.nome_produto, it.nome_produto),
    pr.cor,
    pr.marca,
    pr.tipo,
    pr.subtipo,
    pr.grupo,
    SUM(it.quantidade_fisica)::numeric,
    -- Valorização a PREÇO DE TABELA (`valor_produto`), decisão registrada do usuário.
    -- Produto sem cadastro vale zero e continua aparecendo em unidades: some do total
    -- financeiro, nunca do físico.
    (SUM(it.quantidade_fisica) * COALESCE(pr.valor_produto, 0))::numeric
  FROM ultimo_por_vendedor u
  JOIN itens_inventario it ON it.inventario_id = u.id
  LEFT JOIN produtos pr ON pr.codigo_auxiliar = it.codigo_auxiliar
  GROUP BY
    u.codigo_vendedor, u.id, u.data_inventario, it.codigo_auxiliar,
    pr.codigo_produto, pr.nome_produto, it.nome_produto, pr.cor,
    pr.marca, pr.tipo, pr.subtipo, pr.grupo, pr.valor_produto;
END;
$function$;

COMMENT ON FUNCTION public.estoque_externo() IS
  'Estoque na mão dos representantes: último inventário APROVADO de cada vendedor, '
  'somado por código auxiliar. Não é saldo ao vivo — cada vendedor tem uma data de '
  'contagem, e a última pode ser um fragmento. Ver o cabeçalho da migration.';
