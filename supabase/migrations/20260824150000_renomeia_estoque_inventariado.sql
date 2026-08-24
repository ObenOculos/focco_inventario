-- `estoque_externo` -> `estoque_inventariado`.
--
-- Correção de VOCABULÁRIO, feita no mesmo dia em que a função nasceu e antes de
-- qualquer tela depender do nome antigo.
--
-- "Estoque externo" é o estoque da MALA — e ele tem duas leituras, que é justamente
-- o que torna a comparação útil:
--
--   - o SALDO que o ERP calcula para a mercadoria em poder de terceiros
--     (`eq_produtoespecifestoqterceiro.eqpet_estoqueemterceiro`), servido pelo
--     gateway em `/estoque-externo`;
--   - a CONTAGEM que o representante fez e o gerente aprovou — que é o que esta
--     função devolve.
--
-- Com as duas chamadas de "externo", qualquer conversa sobre o número ficaria
-- ambígua, e ambiguidade de nome é como um relatório passa a somar duas medidas
-- diferentes sem ninguém notar. O ERP é o "externo"; o Supabase é o "inventariado".
--
-- O corpo não muda em nada — só o nome.

ALTER FUNCTION public.estoque_externo() RENAME TO estoque_inventariado;

COMMENT ON FUNCTION public.estoque_inventariado() IS
  'Estoque da mala CONTADO: último inventário aprovado de cada vendedor, somado por '
  'código auxiliar. O par dele é o saldo do ERP em /estoque-externo — mesma '
  'mercadoria, dois caminhos, e a divergência entre eles é informação. Não é saldo ao '
  'vivo: cada vendedor tem uma data de contagem, e a última pode ser um fragmento.';
