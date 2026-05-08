import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Trash2, Plus, DollarSign } from 'lucide-react';

interface Ingredient {
  id: string;
  name: string;
  material: string;
  volume: number;
  recipe: number;
  unitPrice: number;
  totalCost: number;
}

interface CakeItem {
  id: string;
  name: string;
  ingredients: Ingredient[];
  totalProductCost: number;
  profitMargin: number;
  finalPrice: number;
}

/**
 * Design: Minimalista Moderno com Dark Mode
 * - Formulário à esquerda (40%), resumo à direita (60%)
 * - Cards com sombra mínima e bordas suaves
 * - Animações de entrada para novos ingredientes
 * - Cores: Azul (#1E40AF) light / Ciano (#06B6D4) dark
 * - Laranja (#F97316) light / Magenta (#EC4899) dark
 */

export default function PricingTab() {
  const [cakes, setCakes] = useState<CakeItem[]>([]);
  const [currentCakeName, setCurrentCakeName] = useState('');
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [profitMargin, setProfitMargin] = useState(50);
  const [newIngredient, setNewIngredient] = useState({
    name: '',
    material: '',
    volume: 0,
    recipe: 0,
    unitPrice: 0,
  });

  // Calcular custo total do ingrediente
  const calculateIngredientCost = (volume: number, recipe: number, unitPrice: number) => {
    return (volume / recipe) * unitPrice;
  };

  // Adicionar novo ingrediente
  const addIngredient = () => {
    if (
      !newIngredient.name ||
      !newIngredient.material ||
      newIngredient.volume <= 0 ||
      newIngredient.recipe <= 0 ||
      newIngredient.unitPrice <= 0
    ) {
      return;
    }

    const totalCost = calculateIngredientCost(
      newIngredient.volume,
      newIngredient.recipe,
      newIngredient.unitPrice
    );

    const ingredient: Ingredient = {
      id: Date.now().toString(),
      name: newIngredient.name,
      material: newIngredient.material,
      volume: newIngredient.volume,
      recipe: newIngredient.recipe,
      unitPrice: newIngredient.unitPrice,
      totalCost,
    };

    setIngredients([...ingredients, ingredient]);
    setNewIngredient({
      name: '',
      material: '',
      volume: 0,
      recipe: 0,
      unitPrice: 0,
    });
  };

  // Remover ingrediente
  const removeIngredient = (id: string) => {
    setIngredients(ingredients.filter((ing) => ing.id !== id));
  };

  // Calcular total do produto
  const totalProductCost = ingredients.reduce((sum, ing) => sum + ing.totalCost, 0);
  const finalPrice = totalProductCost * (1 + profitMargin / 100);

  // Salvar bolo
  const saveCake = () => {
    if (!currentCakeName || ingredients.length === 0) {
      return;
    }

    const cake: CakeItem = {
      id: Date.now().toString(),
      name: currentCakeName,
      ingredients: [...ingredients],
      totalProductCost,
      profitMargin,
      finalPrice,
    };

    setCakes([...cakes, cake]);
    setCurrentCakeName('');
    setIngredients([]);
    setProfitMargin(50);
  };

  // Remover bolo
  const removeCake = (id: string) => {
    setCakes(cakes.filter((cake) => cake.id !== id));
  };

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
      {/* Formulário - Esquerda */}
      <motion.div
        className="lg:col-span-1"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Card className="border border-slate-700 bg-slate-900 p-6 shadow-sm">
          <h2 className="mb-6 text-xl font-bold text-slate-100">
            Novo Bolo
          </h2>

          {/* Nome do Bolo */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Nome do Bolo
            </label>
            <Input
              type="text"
              placeholder="Ex: Bolo de Chocolate"
              value={currentCakeName}
              onChange={(e) => setCurrentCakeName(e.target.value)}
              className="border-slate-600 bg-slate-800 text-slate-100 focus:border-cyan-500 focus:ring-cyan-500"
            />
          </div>

          {/* Ingredientes */}
          <div className="mb-6 space-y-4">
            <h3 className="text-sm font-semibold text-slate-200">
              Adicionar Ingrediente
            </h3>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Nome do Ingrediente
              </label>
              <Input
                type="text"
                placeholder="Ex: Farinha"
                value={newIngredient.name}
                onChange={(e) =>
                  setNewIngredient({ ...newIngredient, name: e.target.value })
                }
                className="text-sm border-slate-600 bg-slate-800 text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Material
              </label>
              <Input
                type="text"
                placeholder="Ex: kg, L, unidade"
                value={newIngredient.material}
                onChange={(e) =>
                  setNewIngredient({ ...newIngredient, material: e.target.value })
                }
                className="text-sm border-slate-600 bg-slate-800 text-slate-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Volume
                </label>
                <Input
                  type="number"
                  placeholder="0"
                  value={newIngredient.volume || ''}
                  onChange={(e) =>
                    setNewIngredient({
                      ...newIngredient,
                      volume: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="text-sm border-slate-600 bg-slate-800 text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Receita
                </label>
                <Input
                  type="number"
                  placeholder="0"
                  value={newIngredient.recipe || ''}
                  onChange={(e) =>
                    setNewIngredient({
                      ...newIngredient,
                      recipe: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="text-sm border-slate-600 bg-slate-800 text-slate-100"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Valor Unitário (R$)
              </label>
              <Input
                type="number"
                placeholder="0.00"
                value={newIngredient.unitPrice || ''}
                onChange={(e) =>
                  setNewIngredient({
                    ...newIngredient,
                    unitPrice: parseFloat(e.target.value) || 0,
                  })
                }
                className="text-sm border-slate-600 bg-slate-800 text-slate-100"
              />
            </div>

            <Button
              onClick={addIngredient}
              className="w-full bg-cyan-600 hover:bg-cyan-700 text-white"
            >
              <Plus className="mr-2 h-4 w-4" />
              Adicionar Ingrediente
            </Button>
          </div>

          {/* Margem de Lucro */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Margem de Lucro (%): {profitMargin}%
            </label>
            <input
              type="range"
              min="0"
              max="200"
              value={profitMargin}
              onChange={(e) => setProfitMargin(parseInt(e.target.value))}
              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            />
          </div>

          {/* Botão Salvar */}
          <Button
            onClick={saveCake}
            disabled={!currentCakeName || ingredients.length === 0}
            className="w-full bg-magenta-600 hover:bg-magenta-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <DollarSign className="mr-2 h-4 w-4" />
            Salvar Bolo
          </Button>
        </Card>
      </motion.div>

      {/* Resumo - Direita */}
      <motion.div
        className="lg:col-span-2 space-y-6"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Ingredientes Atuais */}
        {ingredients.length > 0 && (
          <Card className="border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900 transition-colors duration-300">
            <h3 className="mb-4 text-lg font-bold text-slate-900 dark:text-slate-100 transition-colors duration-300">
              Ingredientes
            </h3>
            <div className="space-y-3">
              <AnimatePresence>
                {ingredients.map((ingredient, index) => (
                  <motion.div
                    key={ingredient.id}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 p-4 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-slate-900 dark:text-slate-100 transition-colors duration-300">
                        {ingredient.name}
                      </p>
                      <p className="text-sm text-slate-600 dark:text-slate-400 transition-colors duration-300">
                        {ingredient.volume} {ingredient.material} × R${ingredient.unitPrice.toFixed(2)} = R${ingredient.totalCost.toFixed(2)}
                      </p>
                    </div>
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => removeIngredient(ingredient.id)}
                      className="ml-4 rounded-lg p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </motion.button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </Card>
        )}

        {/* Resumo de Custos */}
        {ingredients.length > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="grid grid-cols-1 gap-4 sm:grid-cols-3"
          >
            <Card className="border border-slate-200 bg-gradient-to-br from-blue-50 to-blue-100 p-4 shadow-sm dark:border-slate-700 dark:from-slate-800 dark:to-slate-700 transition-colors duration-300">
              <p className="text-xs font-semibold text-blue-700 dark:text-cyan-400 uppercase tracking-wide transition-colors duration-300">
                Custo Total
              </p>
              <p className="mt-2 text-2xl font-bold text-blue-900 dark:text-cyan-300 transition-colors duration-300">
                R${totalProductCost.toFixed(2)}
              </p>
            </Card>

            <Card className="border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100 p-4 shadow-sm dark:border-slate-700 dark:from-slate-800 dark:to-slate-700 transition-colors duration-300">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide transition-colors duration-300">
                Margem
              </p>
              <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100 transition-colors duration-300">
                {profitMargin}%
              </p>
            </Card>

            <Card className="border border-slate-200 bg-gradient-to-br from-orange-50 to-orange-100 p-4 shadow-sm dark:border-slate-700 dark:from-slate-800 dark:to-slate-700 transition-colors duration-300">
              <p className="text-xs font-semibold text-orange-700 dark:text-magenta-400 uppercase tracking-wide transition-colors duration-300">
                Preço Final
              </p>
              <p className="mt-2 text-2xl font-bold text-orange-900 dark:text-magenta-300 transition-colors duration-300">
                R${finalPrice.toFixed(2)}
              </p>
            </Card>
          </motion.div>
        )}

        {/* Bolos Salvos */}
        {cakes.length > 0 && (
          <Card className="border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900 transition-colors duration-300">
            <h3 className="mb-4 text-lg font-bold text-slate-900 dark:text-slate-100 transition-colors duration-300">
              Bolos Salvos ({cakes.length})
            </h3>
            <div className="space-y-3">
              <AnimatePresence>
                {cakes.map((cake) => (
                  <motion.div
                    key={cake.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3 }}
                    className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 p-4 hover:shadow-md dark:border-slate-700 dark:bg-slate-800 dark:hover:shadow-lg transition-shadow"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-slate-900 dark:text-slate-100 transition-colors duration-300">{cake.name}</p>
                      <p className="text-sm text-slate-600 dark:text-slate-400 transition-colors duration-300">
                        {cake.ingredients.length} ingredientes • Custo: R${cake.totalProductCost.toFixed(2)} • Preço: R${cake.finalPrice.toFixed(2)}
                      </p>
                    </div>
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => removeCake(cake.id)}
                      className="ml-4 rounded-lg p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </motion.button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </Card>
        )}

        {/* Empty State */}
        {ingredients.length === 0 && cakes.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 p-12 text-center dark:border-slate-700 dark:bg-slate-800 transition-colors duration-300"
          >
            <DollarSign className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600 mb-4 transition-colors duration-300" />
            <p className="text-slate-600 dark:text-slate-400 transition-colors duration-300">
              Comece adicionando ingredientes para calcular o preço do bolo
            </p>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
