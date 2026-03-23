

# Conferência: layout de tela única (sem divisão)

## O que muda

Atualmente a página tem layout master-detail lado a lado (lista de inventários à esquerda, detalhes à direita em `grid-cols-3`). O usuário quer que a lista e os detalhes ocupem o **mesmo espaço**, alternando entre duas "telas":

- **Tela 1**: Lista de inventários pendentes (tela cheia)
- **Tela 2**: Detalhes/divergências do inventário selecionado (tela cheia), com botão "Voltar" para retornar à lista

## Alteração técnica

### `src/pages/Conferencia.tsx`

1. **Remover o grid de colunas** (`grid grid-cols-1 lg:grid-cols-3`) e a borda lateral (`border-l-2`)
2. **Renderização condicional simples**:
   - Se `selectedInventario` é `null` → mostra a lista de inventários (largura total)
   - Se `selectedInventario` existe → mostra os detalhes (largura total)
3. **Adicionar botão "Voltar"** no topo da tela de detalhes, que faz `setSelectedInventario(null)` e limpa os estados relacionados
4. Remover o placeholder "Selecione um inventário" (não é mais necessário)

Apenas 1 arquivo alterado. Refatoração puramente de layout, sem mudança de lógica.

