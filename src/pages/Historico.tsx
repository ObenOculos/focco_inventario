import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { useInventariosQuery } from '@/hooks/useInventariosQuery';
import { Card, CardContent } from '@/components/ui/card';
import { ClipboardList } from 'lucide-react';
import { ListaCardsSkeleton } from '@/components/skeletons/CardSkeleton';
import { CardInventario } from '@/components/historico/CardInventario';

export default function Historico() {
  const { profile } = useAuth();
  const [abertoId, setAbertoId] = useState<string | null>(null);

  const { data: inventarios = [], isLoading: carregando } = useInventariosQuery(
    profile?.codigo_vendedor
  );

  return (
    <AppLayout>
      <div className="space-y-6">
        <PageHeader
          title="Histórico de Inventários"
          description="Suas contagens anteriores e em que pé está cada uma"
        />

        {carregando ? (
          <ListaCardsSkeleton />
        ) : inventarios.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <ClipboardList size={44} className="mx-auto mb-4 text-muted-foreground/50" />
              <h2 className="mb-2 text-xl font-bold">Nenhuma contagem ainda</h2>
              <p className="text-sm text-muted-foreground">
                Assim que você enviar seu primeiro inventário, ele aparece aqui.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {inventarios.map((inventario) => (
              <CardInventario
                key={inventario.id}
                inventario={inventario}
                aberto={abertoId === inventario.id}
                onAlternar={() => setAbertoId(abertoId === inventario.id ? null : inventario.id)}
              />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
