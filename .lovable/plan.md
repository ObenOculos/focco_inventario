

# Corrigir constantes no XML Ciclone

## Alteracoes no arquivo `src/lib/gerarXmlCiclone.ts`

Tres ajustes simples de valores fixos no template XML:

1. **`pgwsm_codigo`**: Trocar de `4` para `1` (aparece 2 vezes: no registro principal e no sub-registro cliente)
2. **`wsapd_origem`**: Trocar de `STORMSYSTEM` para `FOCCO_BRASIL`
3. **`wsapd_pedidonumero`**: Este campo ja existe no XML atual (esta vazio: `<wsapd_pedidonumero></wsapd_pedidonumero>`). Preciso confirmar: o usuario quer que ele tenha algum valor especifico, ou esta dizendo que o campo sumiu e precisa ser mantido?

Vou verificar o arquivo atual para confirmar o estado exato.

