import { AppLayout } from '@/components/layout/AppLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ClipboardCheck, FileSpreadsheet } from 'lucide-react';
import { XmlPorInventarioTab } from '@/components/XmlPorInventarioTab';
import { XmlPorExcelTab } from '@/components/XmlPorExcelTab';

export default function ExportarXml() {
  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Exportar XML</h1>
          <p className="text-muted-foreground">
            Gere o XML no formato Ciclone a partir de um inventário
          </p>
        </div>

        <Tabs defaultValue="inventario" className="w-full">
          <TabsList>
            <TabsTrigger value="inventario" className="gap-2">
              <ClipboardCheck className="h-4 w-4" />
              A partir de Inventário
            </TabsTrigger>
            <TabsTrigger value="excel" className="gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              A partir de Excel
            </TabsTrigger>
          </TabsList>
          <TabsContent value="inventario">
            <XmlPorInventarioTab />
          </TabsContent>
          <TabsContent value="excel">
            <XmlPorExcelTab />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
