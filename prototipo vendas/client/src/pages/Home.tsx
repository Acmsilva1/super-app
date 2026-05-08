import { useState } from 'react';
import { motion } from 'framer-motion';
import PricingTab from '@/components/PricingTab';
import SalesTab from '@/components/SalesTab';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calculator, TrendingUp } from 'lucide-react';

/**
 * Design: Minimalista Moderno com Foco em Dados
 * - Layout em duas abas principais: Precificação e Vendas
 * - Tipografia forte com Poppins para títulos
 * - Cores: Azul profundo (#1E40AF) e Laranja (#F97316)
 * - Transições suaves com Framer Motion
 */

export default function Home() {
  const [activeTab, setActiveTab] = useState('pricing');

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5 },
    },
  };

  return (
    <motion.div
      className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <motion.header
        className="border-b border-slate-700 bg-slate-900"
        initial="hidden"
        animate="visible"
        variants={itemVariants}
      >
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-gradient-to-br from-cyan-500 to-cyan-600 p-3">
                <Calculator className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-slate-100">
                  Cake Pricing Manager
                </h1>
                <p className="text-sm text-slate-400">
                  Precificação inteligente e controle de vendas
                </p>
              </div>
            </div>
          </div>
        </div>
      </motion.header>

      {/* Main Content */}
      <motion.main className="container mx-auto px-4 py-8" variants={itemVariants}>
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="w-full"
        >
          <TabsList className="grid w-full max-w-md grid-cols-2 bg-slate-100 p-1 rounded-lg">
            <TabsTrigger
              value="pricing"
              className="flex items-center gap-2 data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm transition-all duration-200"
            >
              <Calculator className="h-4 w-4" />
              <span className="hidden sm:inline">Precificação</span>
              <span className="sm:hidden">Preço</span>
            </TabsTrigger>
            <TabsTrigger
              value="sales"
              className="flex items-center gap-2 data-[state=active]:bg-white data-[state=active]:text-orange-600 data-[state=active]:shadow-sm transition-all duration-200"
            >
              <TrendingUp className="h-4 w-4" />
              <span className="hidden sm:inline">Vendas</span>
              <span className="sm:hidden">Vnd</span>
            </TabsTrigger>
          </TabsList>

          {/* Pricing Tab */}
          <TabsContent value="pricing" className="mt-6">
            <motion.div
              key="pricing"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <PricingTab />
            </motion.div>
          </TabsContent>

          {/* Sales Tab */}
          <TabsContent value="sales" className="mt-6">
            <motion.div
              key="sales"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <SalesTab />
            </motion.div>
          </TabsContent>
        </Tabs>
      </motion.main>
    </motion.div>
  );
}
