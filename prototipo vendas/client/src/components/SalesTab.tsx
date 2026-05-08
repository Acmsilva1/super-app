import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Trash2, Plus, TrendingUp, BarChart3 } from 'lucide-react';

interface Sale {
  id: string;
  userName: string;
  flavor: string;
  salePrice: number;
  timestamp: Date;
}

interface DailySalesStats {
  totalSales: number;
  totalRevenue: number;
  averagePrice: number;
}

/**
 * Design: Minimalista Moderno com Dark Mode
 * - Formulário para registrar vendas
 * - Tabela visual com histórico do dia
 * - Dashboard com estatísticas
 * - Animações suaves com Framer Motion
 * - Cores: Verde (#10B981) light / Verde (#10B981) dark
 */

export default function SalesTab() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [newSale, setNewSale] = useState({
    userName: '',
    flavor: '',
    salePrice: 0,
  });

  // Carregar vendas do localStorage
  useEffect(() => {
    const today = new Date().toDateString();
    const savedSales = localStorage.getItem(`sales_${today}`);
    if (savedSales) {
      const parsedSales = JSON.parse(savedSales).map((sale: any) => ({
        ...sale,
        timestamp: new Date(sale.timestamp),
      }));
      setSales(parsedSales);
    }
  }, []);

  // Salvar vendas no localStorage
  useEffect(() => {
    const today = new Date().toDateString();
    localStorage.setItem(`sales_${today}`, JSON.stringify(sales));
  }, [sales]);

  // Adicionar nova venda
  const addSale = () => {
    if (!newSale.userName || !newSale.flavor || newSale.salePrice <= 0) {
      return;
    }

    const sale: Sale = {
      id: Date.now().toString(),
      userName: newSale.userName,
      flavor: newSale.flavor,
      salePrice: newSale.salePrice,
      timestamp: new Date(),
    };

    setSales([...sales, sale]);
    setNewSale({
      userName: '',
      flavor: '',
      salePrice: 0,
    });
  };

  // Remover venda
  const removeSale = (id: string) => {
    setSales(sales.filter((sale) => sale.id !== id));
  };

  // Calcular estatísticas
  const calculateStats = (): DailySalesStats => {
    if (sales.length === 0) {
      return {
        totalSales: 0,
        totalRevenue: 0,
        averagePrice: 0,
      };
    }

    const totalRevenue = sales.reduce((sum, sale) => sum + sale.salePrice, 0);
    const averagePrice = totalRevenue / sales.length;

    return {
      totalSales: sales.length,
      totalRevenue,
      averagePrice,
    };
  };

  const stats = calculateStats();

  // Agrupar vendas por sabor
  const flavorStats = sales.reduce(
    (acc, sale) => {
      const existing = acc.find((f) => f.flavor === sale.flavor);
      if (existing) {
        existing.count += 1;
        existing.revenue += sale.salePrice;
      } else {
        acc.push({
          flavor: sale.flavor,
          count: 1,
          revenue: sale.salePrice,
        });
      }
      return acc;
    },
    [] as Array<{ flavor: string; count: number; revenue: number }>
  );

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
      {/* Formulário - Esquerda */}
      <motion.div
        className="lg:col-span-1"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Card className="border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900 transition-colors duration-300">
          <h2 className="mb-6 text-xl font-bold text-slate-900 dark:text-slate-100 transition-colors duration-300">
            Registrar Venda
          </h2>

          {/* Nome do Usuário */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 transition-colors duration-300">
              Nome do Cliente
            </label>
            <Input
              type="text"
              placeholder="Ex: João Silva"
              value={newSale.userName}
              onChange={(e) =>
                setNewSale({ ...newSale, userName: e.target.value })
              }
              className="border-slate-300 bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 focus:border-blue-600 focus:ring-blue-600 dark:focus:border-cyan-500 dark:focus:ring-cyan-500 transition-colors duration-300"
            />
          </div>

          {/* Sabor */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 transition-colors duration-300">
              Sabor do Bolo
            </label>
            <Input
              type="text"
              placeholder="Ex: Chocolate"
              value={newSale.flavor}
              onChange={(e) =>
                setNewSale({ ...newSale, flavor: e.target.value })
              }
              className="border-slate-300 bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 focus:border-blue-600 focus:ring-blue-600 dark:focus:border-cyan-500 dark:focus:ring-cyan-500 transition-colors duration-300"
            />
          </div>

          {/* Valor da Venda */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 transition-colors duration-300">
              Valor da Venda (R$)
            </label>
            <Input
              type="number"
              placeholder="0.00"
              value={newSale.salePrice || ''}
              onChange={(e) =>
                setNewSale({
                  ...newSale,
                  salePrice: parseFloat(e.target.value) || 0,
                })
              }
              className="border-slate-300 bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 focus:border-blue-600 focus:ring-blue-600 dark:focus:border-cyan-500 dark:focus:ring-cyan-500 transition-colors duration-300"
            />
          </div>

          {/* Botão Registrar */}
          <Button
            onClick={addSale}
            disabled={!newSale.userName || !newSale.flavor || newSale.salePrice <= 0}
            className="w-full bg-green-600 hover:bg-green-700 text-white dark:bg-green-700 dark:hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
          >
            <Plus className="mr-2 h-4 w-4" />
            Registrar Venda
          </Button>
        </Card>
      </motion.div>

      {/* Dashboard e Tabela - Direita */}
      <motion.div
        className="lg:col-span-2 space-y-6"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Estatísticas */}
        {sales.length > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="grid grid-cols-1 gap-4 sm:grid-cols-3"
          >
            <Card className="border border-slate-200 bg-gradient-to-br from-green-50 to-green-100 p-4 shadow-sm dark:border-slate-700 dark:from-slate-800 dark:to-slate-700 transition-colors duration-300">
              <p className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase tracking-wide transition-colors duration-300">
                Vendas do Dia
              </p>
              <p className="mt-2 text-2xl font-bold text-green-900 dark:text-green-300 transition-colors duration-300">
                {stats.totalSales}
              </p>
            </Card>

            <Card className="border border-slate-200 bg-gradient-to-br from-orange-50 to-orange-100 p-4 shadow-sm dark:border-slate-700 dark:from-slate-800 dark:to-slate-700 transition-colors duration-300">
              <p className="text-xs font-semibold text-orange-700 dark:text-magenta-400 uppercase tracking-wide transition-colors duration-300">
                Faturamento
              </p>
              <p className="mt-2 text-2xl font-bold text-orange-900 dark:text-magenta-300 transition-colors duration-300">
                R${stats.totalRevenue.toFixed(2)}
              </p>
            </Card>

            <Card className="border border-slate-200 bg-gradient-to-br from-blue-50 to-blue-100 p-4 shadow-sm dark:border-slate-700 dark:from-slate-800 dark:to-slate-700 transition-colors duration-300">
              <p className="text-xs font-semibold text-blue-700 dark:text-cyan-400 uppercase tracking-wide transition-colors duration-300">
                Ticket Médio
              </p>
              <p className="mt-2 text-2xl font-bold text-blue-900 dark:text-cyan-300 transition-colors duration-300">
                R${stats.averagePrice.toFixed(2)}
              </p>
            </Card>
          </motion.div>
        )}

        {/* Vendas por Sabor */}
        {flavorStats.length > 0 && (
          <Card className="border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900 transition-colors duration-300">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-slate-100 transition-colors duration-300">
              <BarChart3 className="h-5 w-5 text-blue-600 dark:text-cyan-500" />
              Vendas por Sabor
            </h3>
            <div className="space-y-3">
              {flavorStats.map((flavor, index) => (
                <motion.div
                  key={flavor.flavor}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 p-4 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors"
                >
                  <div className="flex-1">
                    <p className="font-medium text-slate-900 dark:text-slate-100 transition-colors duration-300">{flavor.flavor}</p>
                    <p className="text-sm text-slate-600 dark:text-slate-400 transition-colors duration-300">
                      {flavor.count} venda{flavor.count !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-orange-600 dark:text-magenta-400 transition-colors duration-300">
                      R${flavor.revenue.toFixed(2)}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-400 transition-colors duration-300">
                      {((flavor.revenue / stats.totalRevenue) * 100).toFixed(1)}%
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </Card>
        )}

        {/* Histórico de Vendas */}
        {sales.length > 0 && (
          <Card className="border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900 transition-colors duration-300">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-slate-100 transition-colors duration-300">
              <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-500" />
              Histórico de Vendas ({sales.length})
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-300 transition-colors duration-300">
                      Cliente
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-300 transition-colors duration-300">
                      Sabor
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-700 dark:text-slate-300 transition-colors duration-300">
                      Valor
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-700 dark:text-slate-300 transition-colors duration-300">
                      Hora
                    </th>
                    <th className="px-4 py-3 text-center font-semibold text-slate-700 dark:text-slate-300 transition-colors duration-300">
                      Ação
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence>
                    {[...sales].reverse().map((sale, index) => (
                      <motion.tr
                        key={sale.id}
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                        className="border-b border-slate-100 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800 transition-colors"
                      >
                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100 transition-colors duration-300">
                          {sale.userName}
                        </td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300 transition-colors duration-300">
                          {sale.flavor}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-orange-600 dark:text-magenta-400 transition-colors duration-300">
                          R${sale.salePrice.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-400 transition-colors duration-300">
                          {sale.timestamp.toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <motion.button
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => removeSale(sale.id)}
                            className="rounded-lg p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </motion.button>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Empty State */}
        {sales.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 p-12 text-center dark:border-slate-700 dark:bg-slate-800 transition-colors duration-300"
          >
            <TrendingUp className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600 mb-4 transition-colors duration-300" />
            <p className="text-slate-600 dark:text-slate-400 transition-colors duration-300">
              Nenhuma venda registrada hoje. Comece a registrar vendas!
            </p>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
