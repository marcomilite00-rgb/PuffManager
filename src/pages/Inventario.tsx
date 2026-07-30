import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useRealtime } from '../hooks/useRealtime';
import type { ProductVariant, Inventory } from '../types/database';
import {
    Package,
    Search,
    Copy,
    Check,
    RefreshCw,
    AlertCircle
} from 'lucide-react';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';

interface GroupedInventory {
    modelName: string;
    items: {
        flavorName: string;
        qty: number;
        variantId: string;
    }[];
}

type SortOption = 'name' | 'stock-asc' | 'stock-desc';
type FilterStatus = 'all' | 'out_of_stock' | 'low_stock' | 'in_stock';

export const Inventario: React.FC = () => {
    const [variants, setVariants] = useState<ProductVariant[]>([]);
    const [inventory, setInventory] = useState<Inventory[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [sortBy] = useState<SortOption>('name');
    const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
    const [showOnlyInStock] = useState(false);
    const [toast, setToast] = useState<string | null>(null);

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
                ...v,
                model_name: v.model.name,
                flavor_name: v.flavor.name
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
                if (index >= 0) {
                    const next = [...prev];
                    next[index] = newData;
                    return next;
                }
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

            if (!groups[v.model_name!]) {
                groups[v.model_name!] = { modelName: v.model_name!, items: [] };
            }
            
            groups[v.model_name!].items.push({ 
                flavorName: v.flavor_name!, 
                qty, 
                variantId: v.id 
            });
        });

        let results = Object.values(groups).map(group => ({
            ...group,
            items: group.items.filter(item =>
                group.modelName.toLowerCase().includes(search.toLowerCase()) ||
                item.flavorName.toLowerCase().includes(search.toLowerCase())
            )
        })).filter(group => group.items.length > 0);

        if (sortBy === 'name') {
            results.sort((a, b) => a.modelName.localeCompare(b.modelName));
        } else {
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
                inStockItems.forEach(item => {
                    text += `• ${item.flavorName}: ${item.qty}pz\n`;
                });
                text += `\n`;
            }
        });
        
        try {
            await navigator.clipboard.writeText(text.trim());
            showToast('Inventario copiato!');
        } catch (err) {
            showToast('Errore durante la copia');
        }
    };

    const showToast = (message: string) => {
        setToast(message);
        setTimeout(() => setToast(null), 3000);
    };

    if (loading) return (
        <div className="min-h-screen bg-surface-950 flex flex-col items-center justify-center space-y-4">
            <RefreshCw className="animate-spin text-primary" size={32} />
            <p className="label-caps text-xs text-slate-500">Sincronizzazione scorte...</p>
        </div>
    );

    return (
        <div className="min-h-screen bg-surface-950 pb-32 safe-area-pt">
            {/* Legend & Quick Info */}
            <div className="px-4 md:px-8 py-6 flex flex-col md:flex-row justify-between items-center gap-6 border-b border-white/5 bg-white/[0.02] sticky top-0 z-50 backdrop-blur-xl">
                <div className="flex flex-col">
                    <h1 className="text-3xl md:text-5xl font-black italic tracking-tighter text-white uppercase leading-none">
                        Magazzino<span className="text-primary not-italic">.</span>
                    </h1>
                    <div className="flex items-center gap-4 mt-2">
                        <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-danger shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
                            <span className="label-caps text-[8px] text-slate-500 font-bold">Finito</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-warning shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
                            <span className="label-caps text-[8px] text-slate-500 font-bold">Pochi</span>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-3 md:gap-6">
                    <div className="flex flex-col items-center px-4 py-2 bg-white/5 rounded-2xl border border-white/5">
                        <span className="text-2xl font-black text-white italic">{stats.total}</span>
                        <span className="label-caps text-[7px] text-slate-500 font-black">Totale</span>
                    </div>
                    <div className="flex flex-col items-center px-4 py-2 bg-danger/10 rounded-2xl border border-danger/20">
                        <span className="text-2xl font-black text-danger italic">{stats.outOfStock}</span>
                        <span className="label-caps text-[7px] text-danger font-black">Zero</span>
                    </div>
                    <div className="flex flex-col items-center px-4 py-2 bg-warning/10 rounded-2xl border border-warning/20">
                        <span className="text-2xl font-black text-warning italic">{stats.lowStock}</span>
                        <span className="label-caps text-[7px] text-warning font-black">Alert</span>
                    </div>
                </div>
            </div>

            {/* Controls */}
            <div className="px-4 md:px-8 py-6 space-y-4">
                <div className="flex flex-col lg:flex-row gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-600" size={18} />
                        <input
                            type="text"
                            placeholder="Cerca per modello o aroma..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full bg-surface-900 border border-white/10 rounded-2xl py-4 md:py-5 pl-14 pr-6 focus:outline-none focus:border-primary/50 text-white text-lg font-bold italic"
                        />
                    </div>
                    <div className="flex gap-2 scrollbar-hide overflow-x-auto">
                        <button
                            onClick={copyForWhatsApp}
                            className="flex items-center gap-3 px-6 bg-primary text-black font-black rounded-2xl hover:bg-primary-dark transition-all active:scale-95 label-caps text-xs py-4 whitespace-nowrap"
                        >
                            <Copy size={16} /> COPIA STOCK
                        </button>
                        <select 
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
                            className="bg-surface-900 border border-white/10 text-white font-bold label-caps text-xs px-4 rounded-2xl focus:ring-0"
                        >
                            <option value="all">TUTTI</option>
                            <option value="in_stock">DISPONIBILI</option>
                            <option value="low_stock">POCHI PEZZI</option>
                            <option value="out_of_stock">ESAURITI</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Content: List View (High Visibility) */}
            <div className="px-4 md:px-8 space-y-10">
                {groupedData.length > 0 ? (
                    groupedData.map((group) => (
                        <div key={group.modelName} className="space-y-4">
                            <div className="flex items-center gap-3 px-2">
                                <Package className="text-primary" size={20} />
                                <h3 className="text-xl md:text-3xl font-black italic tracking-tighter text-white uppercase">{group.modelName}</h3>
                                <div className="h-px bg-white/10 flex-1 ml-4" />
                            </div>

                            <div className="bg-surface-900/60 border border-white/5 rounded-[2rem] overflow-hidden">
                                <div className="divide-y divide-white/5">
                                    {group.items.map((item) => (
                                        <div 
                                            key={item.variantId} 
                                            className={clsx(
                                                "flex items-center justify-between p-5 md:p-6 transition-all hover:bg-white/[0.03]",
                                                item.qty === 0 ? "bg-danger/[0.02]" : item.qty <= STOCK_THRESHOLD ? "bg-warning/[0.02]" : ""
                                            )}
                                        >
                                            <div className="flex-1 min-w-0 pr-4">
                                                <div className="flex items-center gap-3">
                                                    <p className={clsx(
                                                        "text-lg md:text-2xl font-black tracking-tight uppercase italic",
                                                        item.qty === 0 ? "text-slate-600 line-through" : "text-slate-100"
                                                    )}>
                                                        {item.flavorName}
                                                    </p>
                                                    {item.qty <= STOCK_THRESHOLD && (
                                                        <div className={clsx(
                                                            "px-2 py-0.5 rounded-md flex items-center gap-1",
                                                            item.qty === 0 ? "bg-danger/10" : "bg-warning/10"
                                                        )}>
                                                            <AlertCircle size={10} className={item.qty === 0 ? "text-danger" : "text-warning"} />
                                                            <span className={clsx(
                                                                "text-[8px] font-black uppercase tracking-widest",
                                                                item.qty === 0 ? "text-danger" : "text-warning"
                                                            )}>
                                                                {item.qty === 0 ? 'Finito' : 'Alert'}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className={clsx(
                                                "w-16 h-16 md:w-20 md:h-20 flex flex-col items-center justify-center rounded-2xl md:rounded-3xl border transition-all",
                                                item.qty === 0 
                                                    ? "bg-danger border-danger/20 text-white shadow-lg shadow-danger/20" 
                                                    : item.qty <= STOCK_THRESHOLD 
                                                        ? "bg-warning border-warning/20 text-surface-950 shadow-lg shadow-warning/20" 
                                                        : "bg-white/5 border-white/10 text-white"
                                            )}>
                                                <span className="text-2xl md:text-4xl font-black italic">{item.qty}</span>
                                                <span className="label-caps text-[7px] font-black uppercase opacity-60">PZ</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="py-40 text-center glass rounded-[3rem] border-dashed border-white/5">
                        <Package size={60} className="mx-auto text-slate-800 mb-6 opacity-40 animate-pulse" />
                        <h3 className="text-xl font-bold text-slate-500 uppercase tracking-widest">Nessun Riscontro</h3>
                    </div>
                )}
            </div>

            {/* Toast Notifications */}
            <AnimatePresence>
                {toast && (
                    <motion.div 
                        initial={{ opacity: 0, y: 50, x: '-50%' }}
                        animate={{ opacity: 1, y: 0, x: '-50%' }}
                        exit={{ opacity: 0, y: 50, x: '-50%' }}
                        className="fixed bottom-12 left-1/2 z-[100] px-8 py-4 bg-white text-surface-950 rounded-2xl font-black label-caps text-sm shadow-2xl flex items-center gap-4"
                    >
                        <Check size={20} className="text-success" />
                        {toast}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
