
# Plano: Corrigir Interação entre Paginação e Filtros

## O Problema

Quando você troca o filtro de "Sobras (+)" (42 páginas) para "Faltas (-)" (1 página), o sistema mantém o número da página atual (ex: página 42). Como "Faltas" tem apenas 1 página, a listagem aparece vazia porque não existem dados nessa página.

## A Solução

Resetar automaticamente a paginação para a página 1 sempre que os dados filtrados mudarem, garantindo que o usuário sempre veja resultados válidos.

---

## Detalhes Técnicos

### Arquivo: `src/hooks/usePagination.tsx`

Modificar o `useEffect` existente para também reagir a mudanças nos dados:

**Código atual:**
```tsx
useEffect(() => {
  setCurrentPage(1);
}, [searchTerm]);
```

**Código novo:**
```tsx
useEffect(() => {
  setCurrentPage(1);
}, [searchTerm, data]);
```

Esta alteração é simples mas eficaz:
- Quando `data` muda (resultado de mudança nos filtros), a página volta para 1
- Quando `searchTerm` muda, a página também volta para 1
- O hook `usePagination` é genérico e será corrigido em todas as páginas que o utilizam

### Impacto

Esta correção beneficiará automaticamente todas as páginas que usam o hook `usePagination`:
- Análise de Inventário
- Conferência de Inventários
- Estoque ERP
- Outras páginas com paginação e filtros
