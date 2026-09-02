import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ClipboardCheck, FileSpreadsheet, PackagePlus } from 'lucide-react';
import { XmlPorInventarioTab } from '@/components/XmlPorInventarioTab';
import { XmlPorExcelTab } from '@/components/XmlPorExcelTab';
import { XmlPorReposicaoTab } from '@/components/XmlPorReposicaoTab';

export default function ExportarXml() {
  return (
    <AppLayout>
      <div className="space-y-6">
        <PageHeader
          title="Exportar XML"
          description="Gere o XML no formato Ciclone a partir de um inventário, de uma planilha ou da reposição da mala"
        />

        {/* Três abas, três origens do MESMO pedido. A ordem é a do uso: devolver o que
            foi contado, subir uma planilha, e — a última a chegar — repor na mala o que a
            empresa tem parado. */}
        <Tabs defaultValue="inventario" className="w-full">
          <TabsList className="flex-wrap">
            <TabsTrigger value="inventario" className="gap-2">
              <ClipboardCheck className="h-4 w-4" />
              A partir de Inventário
            </TabsTrigger>
            <TabsTrigger value="excel" className="gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              A partir de Excel
            </TabsTrigger>
            <TabsTrigger value="reposicao" className="gap-2">
              <PackagePlus className="h-4 w-4" />
              Reposição da mala
            </TabsTrigger>
          </TabsList>
          <TabsContent value="inventario">
            <XmlPorInventarioTab />
          </TabsContent>
          <TabsContent value="excel">
            <XmlPorExcelTab />
          </TabsContent>
          <TabsContent value="reposicao">
            <XmlPorReposicaoTab />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
