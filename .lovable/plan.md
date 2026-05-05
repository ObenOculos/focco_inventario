Atualizar `src/pages/Inventario.tsx` (catch do `handleSubmit`, ~linha 456) para incluir o detalhe do erro na notificação:

```tsx
} catch (error: any) {
  console.error('Erro ao salvar inventário:', error);
  const msg =
    error?.message ||
    error?.error_description ||
    error?.details ||
    (typeof error === 'string' ? error : 'Erro desconhecido');
  toast.error('Erro ao salvar inventário', { description: msg });
}
```

Sem mudanças em outros arquivos.