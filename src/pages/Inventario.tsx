import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useRealtime } from '../hooks/useRealtime';
import { useToast } from '../components/ui/ToastProvider';
import { EmptyState } from '../components/ui/EmptyState';
import type { ProductVariant, Inventory } from '../types/database';
import { Package, Search, Copy, AlertCircle, Box, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { clsx } from 'clsx';
import { motion } from 'framer-motion';
import { TiltCard } from '../components/ui/TiltCard';

interface GroupedInventory {
  modelName: string;
  items: { flavorName: string; qty: number; variantId: string }[];
}

type SortOption = 'name' | 'stock-asc' | 'stock-desc';
type FilterStatus = 'all' | 'out_of_stock' | 'low_stock' | 'in_stock';

export const Inventario: React.FC = () => {
  const { showToast } = useToast();
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy] = useState<SortOption>('name');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [showOnlyInStock] = useState(false);
  const STOCK_THRESHOLD = 3;

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    const [variantsRes, inventoryRes] = await Promise.all([
      supabase.from('product_variants').select('*, model:product_models(name), flavor:product_flavors(name)').eq('active', true),
      supabase.from('inventory').select('*')
    ]);
    if (variantsRes.data) {
      setVariants(variantsRes.data.map((v: any) => ({
        ...v, model_name: v.model.name, flavor_name: v.flavor.name
      })));
    }
    if (inventoryRes.data) setInventory(inventoryRes.data);
    setLoading(false);
  };

  useRealtime<Inventory>('inventory', (payload: any) => {
    if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
      const newData = payload.new as Inventory;
      setInventory(prev => {
        const index = prev.findIndex(i => i.variant_id === newData.variant_id);
        if (index >= 0) { const next = [...prev]; next[index] = newData; return next; }
        return [...prev, newData];
      });
    }
  });

  const groupedData = useMemo(() => {
    const groups: { [key: string]: GroupedInventory } = {};
    variants.forEach(v => {
      const inv = inventory.find(i => i.variant_id === v.id);
      const qty = inv ? inv.qty : 0;
      if (filterStatus === 'out_of_stock' && qty > 0) return;
      if (filterStatus === 'low_stock' && (qty === 0 || qty > STOCK_THRESHOLD)) return;
      if (filterStatus === 'in_stock' && qty <= STOCK_THRESHOLD) return;
      if (showOnlyInStock && qty === 0) return;
      if (!groups[v.model_name!]) groups[v.model_name!] = { modelName: v.model_name!, items: [] };
      groups[v.model_name!].items.push({ flavorName: v.flavor_name!, qty, variantId: v.id });
    });
    let results = Object.values(groups).map(group => ({
      ...group,
      items: group.items.filter(item =>
        group.modelName.toLowerCase().includes(search.toLowerCase()) ||
        item.flavorName.toLowerCase().includes(search.toLowerCase())
      )
    })).filter(group => group.items.length > 0);
    if (sortBy === 'name') results.sort((a, b) => a.modelName.localeCompare(b.modelName));
    else {
      results = results.map(g => ({
        ...g,
        items: g.items.sort((a, b) => sortBy === 'stock-asc' ? a.qty - b.qty : b.qty - a.qty)
      }));
      results.sort((a, b) => {
        const valA = sortBy === 'stock-asc' ? Math.min(...a.items.map(i => i.qty)) : Math.max(...a.items.map(i => i.qty));
        const valB = sortBy === 'stock-asc' ? Math.min(...b.items.map(i => i.qty)) : Math.max(...b.items.map(i => i.qty));
        return sortBy === 'stock-asc' ? valA - valB : valB - valA;
      });
    }
    return results;
  }, [variants, inventory, search, sortBy, filterStatus, showOnlyInStock]);

  const stats = useMemo(() => {
    const total = inventory.reduce((acc, curr) => acc + curr.qty, 0);
    const outOfStock = variants.filter(v => {
      const inv = inventory.find(i => i.variant_id === v.id);
      return !inv || inv.qty === 0;
    }).length;
    const lowStock = variants.filter(v => {
      const inv = inventory.find(i => i.variant_id === v.id);
      return inv && inv.qty > 0 && inv.qty <= STOCK_THRESHOLD;
    }).length;
    return { total, outOfStock, lowStock };
  }, [inventory, variants]);

  const copyForWhatsApp = async () => {
    const d = new Date();
    const date = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
    let text = `📦 *STOCK UPDATE* 📦\n_${date}_\n\n`;
    groupedData.forEach((group) => {
      const inStockItems = group.items.filter(item => item.qty > 0);
      if (inStockItems.length > 0) {
        text += `*${group.modelName.toUpperCase()}*:\n`;
        inStockItems.forEach(item => { text += `• ${item.flavorName}: ${item.qty}pz\n`; });
        text += `\n`;
      }
    });
    try {
      await navigator.clipboard.writeText(text.trim());
      showToast('Inventario copiato!', 'success');
    } catch { showToast('Errore durante la copia', 'error'); }
  };

  if (loading) return (
    <div className="p-6 space-y-8">
      <div className="h-10 w-48 skeleton" />
      <div className="grid grid-cols-3 gap-3">
        {[...Array(3)].map((_, i) => <div key={i} className="h-24 skeleton" />)}
      </div>
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => <div key={i} className="h-20 skeleton" />)}
      </div>
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="min-h-0 bg-surface-950 relative z-10">
      <div className="px-3 md:px-6 py-3 flex flex-col md:flex-row justify-between items-center gap-3 border-b border-white/5">
        <div className="flex flex-col">
          <h1 className="text-3xl md:text-5xl font-black italic tracking-tighter text-white uppercase leading-none">
            Magazzino<span className="text-primary not-italic">.</span>
          </h1>
          <div className="flex items-center gap-4 mt-2">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-danger shadow-[0_0_8px_rgba(255,59,92,0.5)]" />
              <span className="label-caps text-[8px] text-slate-500 font-bold">Finito</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-warning shadow-[0_0_8px_rgba(255,184,0,0.5)]" />
              <span className="label-caps text-[8px] text-slate-500 font-bold">Pochi</span>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 md:gap-6">
          <motion.div whileHover={{ scale: 1.05 }}
            className="flex flex-col items-center justify-center px-2 py-3 md:px-4 md:py-2 bg-white/5 rounded-2xl border border-white/5 min-w-0">
            <span className="text-2xl md:text-3xl font-black text-white italic leading-none">{stats.total}</span>
            <span className="label-caps text-[7px] md:text-[8px] text-slate-500 font-black mt-1">Totale</span>
          </motion.div>
          <motion.div whileHover={{ scale: 1.05 }}
            className="flex flex-col items-center justify-center px-2 py-3 md:px-4 md:py-2 bg-danger/10 rounded-2xl border border-danger/20 min-w-0">
            <span className="text-2xl md:text-3xl font-black text-danger italic leading-none">{stats.outOfStock}</span>
            <span className="label-caps text-[7px] md:text-[8px] text-danger font-black mt-1">Zero</span>
          </motion.div>
          <motion.div whileHover={{ scale: 1.05 }}
            className="flex flex-col items-center justify-center px-2 py-3 md:px-4 md:py-2 bg-warning/10 rounded-2xl border border-warning/20 min-w-0">
            <span className="text-2xl md:text-3xl font-black text-warning italic leading-none">{stats.lowStock}</span>
            <span className="label-caps text-[7px] md:text-[8px] text-warning font-black mt-1">Alert</span>
          </motion.div>
        </div>
      </div>

      <div className="px-3 md:px-6 py-3 space-y-3">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-600" size={18} />
            <input type="text" placeholder="Cerca per modello o aroma..." value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-surface-900/80 border border-white/10 rounded-2xl py-4 md:py-5 pl-14 pr-6 focus:outline-none focus:border-primary/50 text-white text-lg font-bold italic" />
          </div>
          <div className="flex flex-wrap gap-2">
            <motion.button whileTap={{ scale: 0.95 }}
              onClick={copyForWhatsApp}
              className="flex items-center gap-3 px-6 bg-gradient-to-r from-primary to-primary-dark text-black font-black rounded-2xl hover:shadow-xl transition-all active:scale-95 label-caps text-xs py-4 whitespace-nowrap">
              <Copy size={16} /> COPIA STOCK
            </motion.button>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
              className="bg-surface-900/80 border border-white/10 text-white font-bold label-caps text-xs px-4 rounded-2xl focus:ring-0">
              <option value="all">TUTTI</option>
              <option value="in_stock">DISPONIBILI</option>
              <option value="low_stock">POCHI PEZZI</option>
              <option value="out_of_stock">ESAURITI</option>
            </select>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 space-y-10">
        {groupedData.length > 0 ? groupedData.map((group) => (
          <div key={group.modelName} className="space-y-4">
            <div className="flex items-center gap-3 px-2">
              <Package className="text-primary" size={20} />
              <h3 className="text-xl md:text-3xl font-black italic tracking-tighter text-white uppercase">{group.modelName}</h3>
              <div className="h-px bg-white/10 flex-1 ml-4" />
            </div>
            <div className="grid grid-cols-1 gap-3">
              {group.items.map((item) => (
                <TiltCard key={item.variantId} tiltDegree={4} glare={false}>
                  <div className={clsx(
                    "flex items-center justify-between gap-2 p-5 md:p-6 rounded-2xl md:rounded-[2rem] border transition-all",
                    item.qty === 0
                      ? "bg-gradient-to-br from-danger/[0.05] to-transparent border-danger/10"
                      : item.qty <= STOCK_THRESHOLD
                        ? "bg-gradient-to-br from-warning/[0.05] to-transparent border-warning/10"
                        : "bg-gradient-to-br from-white/[0.03] to-white/[0.01] border-white/5 hover:border-primary/20"
                  )}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <p className={clsx(
                          "text-lg md:text-2xl font-black tracking-tight uppercase italic",
                          item.qty === 0 ? "text-slate-600 line-through" : "text-slate-100"
                        )}>
                          {item.flavorName}
                        </p>
                        {item.qty <= STOCK_THRESHOLD && (
                          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
                            className={clsx(
                              "px-2.5 py-1 rounded-lg flex items-center gap-1.5",
                              item.qty === 0 ? "bg-danger/10" : "bg-warning/10"
                            )}>
                            <AlertCircle size={10} className={clsx(item.qty === 0 ? "text-danger" : "text-warning", item.qty === 0 ? "" : "animate-pulse")} />
                            <span className={clsx("text-[8px] font-black uppercase tracking-widest", item.qty === 0 ? "text-danger" : "text-warning")}>
                              {item.qty === 0 ? 'Finito' : 'Alert'}
                            </span>
                          </motion.div>
                        )}
                      </div>
                    </div>
                    <motion.div whileHover={{ scale: 1.1 }}
                      className={clsx(
                        "shrink-0 w-16 h-16 md:w-20 md:h-20 flex flex-col items-center justify-center rounded-2xl md:rounded-3xl border transition-all",
                        item.qty === 0
                          ? "bg-danger/10 border-danger/20 text-white shadow-lg shadow-danger/10"
                          : item.qty <= STOCK_THRESHOLD
                            ? "bg-warning/10 border-warning/20 text-surface-950 shadow-lg shadow-warning/10"
                            : "bg-white/5 border-white/10 text-white"
                      )}>
                      <span className="text-2xl md:text-4xl font-black italic leading-none">{item.qty}</span>
                      <span className="label-caps text-[7px] font-black uppercase opacity-60 mt-0.5">PZ</span>
                    </motion.div>
                  </div>
                </TiltCard>
              ))}
            </div>
          </div>
        )) : (
          <EmptyState icon={Box} title="Nessun Riscontro" subtitle="Prova a modificare i filtri di ricerca" />
        )}
      </div>
    </motion.div>
  );
};
