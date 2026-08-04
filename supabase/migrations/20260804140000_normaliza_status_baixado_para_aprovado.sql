-- Normaliza o status 'baixado' para 'aprovado'.
--
-- 'baixado' pertencia ao subsistema de nota de retorno, que está sendo removido: marcava
-- um inventário já aprovado cujo retorno havia sido enviado ao ERP. Sem esse subsistema o
-- status não tem significado próprio, e nada mais o escreve.
--
-- Além de virar estado órfão, ele causava um problema real: a base de comparação da
-- Conferência é o último inventário com status = 'aprovado', então marcar um inventário
-- como 'baixado' o removia do conjunto de referências. Efeito observado em produção: o
-- inventário aprovado de 09/07/2026 do vendedor 8 ficou sem nenhuma base de comparação,
-- porque os quatro inventários anteriores dele estavam 'baixado' — e toda peça contada
-- aparecia como sobra na conferência.
--
-- São 4 linhas em produção, todas do vendedor 8:
--   fd89da9c-f3e9-41ed-8936-7aacc125fdd9  inventário de 2026-02-19
--   b1469e7f-7d4b-4fa9-ac22-5bb3872fc3cf  inventário de 2026-05-05
--   508a1fc0-7276-4a6e-a74f-54ba2dfd6d88  inventário de 2026-05-06
--   6a44d752-4b9f-4535-ae8f-24c4a9b80d91  inventário de 2026-06-09
--
-- O rastro de que houve nota de retorno permanece em observacoes_gerente, que não é
-- tocado (guarda o número da nota e a data de emissão).
--
-- O valor 'baixado' continua existindo no enum inventory_status: Postgres não remove
-- valor de enum, e recriar o tipo exigiria mexer na coluna de inventarios e nas
-- assinaturas que o referenciam. Após esta migration ele fica sem uso e sem escritor.

-- O trigger de updated_at é BEFORE UPDATE e sobrescreve com now() sem condição. Como
-- updated_at destes registros documenta quando a nota de retorno foi gerada, ele é
-- desligado durante o UPDATE para preservar essa informação histórica.
ALTER TABLE public.inventarios DISABLE TRIGGER update_inventarios_updated_at;

UPDATE public.inventarios
SET status = 'aprovado'
WHERE status = 'baixado';

ALTER TABLE public.inventarios ENABLE TRIGGER update_inventarios_updated_at;

DO $$
DECLARE
  v_restantes integer;
BEGIN
  SELECT count(*) INTO v_restantes FROM public.inventarios WHERE status = 'baixado';
  IF v_restantes > 0 THEN
    RAISE EXCEPTION 'Ainda restam % inventarios com status baixado', v_restantes;
  END IF;
  RAISE NOTICE 'Nenhum inventario com status baixado restante.';
END $$;
