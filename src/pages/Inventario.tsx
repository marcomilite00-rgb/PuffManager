import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useRealtime } from '../hooks/useRealtime';
import type { ProductVariant, Inventory } from '../types/database';
import {
    Package,
    AlertCircle,
    Search,
    LayoutGrid,
    List as ListIcon,
    Copy,
    Check
} from 'lucide-react';
import { clsx } from 'clsx';

interface GroupedInventory {
    modelName: string;
    items: {
        flavorName: string;
        qty: number;
        variantId: string;
    }[];
}

export const Inventario: React.FC = () => {
    const [variants, setVariants] = useState<ProductVariant[]>([]);
    const [inventory, setInventory] = useState<Inventory[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [toast, setToast] = useState<string | null>(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        const [variantsRes, inventoryRes] = await Promise.all([
            supabase
                .from('product_variants')
                .select('*, model:product_models(name), flavor:product_flavors(name)')
                .eq('active', true),
            supabase
                .from('inventory')
                .select('*')
        ]);

        if (variantsRes.data) {
            const formattedVariants = variantsRes.data.map((v: any) => ({
                ...v,
                model_name: v.model.name,
                flavor_name: v.flavor.name
            }));
            setVariants(formattedVariants);
        }

        if (inventoryRes.data) {
            setInventory(inventoryRes.data);
        }

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

            if (!groups[v.model_name!]) {
                groups[v.model_name!] = { modelName: v.model_name!, items: [] };
            }

            groups[v.model_name!].items.push({
                flavorName: v.flavor_name!,
                qty,
                variantId: v.id
            });
        });

        // Filter by search
        return Object.values(groups)
            .map(group => ({
                ...group,
                items: group.items.filter(item =>
                    group.modelName.toLowerCase().includes(search.toLowerCase()) ||
                    item.flavorName.toLowerCase().includes(search.toLowerCase())
                )
            }))
            .filter(group => group.items.length > 0)
            .sort((a, b) => a.modelName.localeCompare(b.modelName));
    }, [variants, inventory, search]);

    const totalPuffs = inventory.reduce((acc, curr) => acc + curr.qty, 0);

    const copyForWhatsApp = async () => {
        const d = new Date();
        const date = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
        let text = `📦 STOCK UPDATE 📦\n\n`;

        groupedData.forEach((group, index) => {
            text += `${group.modelName.toUpperCase()}:\n`;
            group.items.forEach(item => {
                text += `· ${item.flavorName} : ${item.qty}\n`;
            });
            if (index < groupedData.length - 1) {
                text += `\n`; // Add a space between different models
            }
        });

        text += `\n${date}`;

        try {
            await navigator.clipboard.writeText(text);
            showToast('Stock copiato negli appunti!');
        } catch (err) {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            showToast('Stock copiato negli appunti!');
        }
    };

    const showToast = (message: string) => {
        setToast(message);
        setTimeout(() => setToast(null), 3000);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header & Stats */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Inventario</h1>
                    <p className="text-slate-400">Modelli e gusti disponibili in tempo reale</p>
                </div>

                <div className={clsx(
                    "px-6 py-4 rounded-3xl flex flex-col items-center justify-center transition-all duration-500 shadow-lg border",
                    totalPuffs < 20 ? "bg-red-500/10 border-red-500/20 text-red-400" : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                )}>
                    <span className="text-xs uppercase font-black tracking-widest opacity-70">Totale Puff Rimaste</span>
                    <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-black">{totalPuffs}</span>
                        {totalPuffs < 20 && <AlertCircle size={16} className="animate-pulse" />}
                    </div>
                </div>
            </div>

            {/* Controls */}
            <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input
                        type="text"
                        placeholder="Cerca modello o gusto..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full bg-slate-900 border border-white/10 rounded-2xl py-3 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                        className="p-3 bg-slate-900 border border-white/10 rounded-2xl text-slate-400 hover:text-white transition-colors"
                    >
                        {viewMode === 'grid' ? <ListIcon size={20} /> : <LayoutGrid size={20} />}
                    </button>

                    <button
                        onClick={copyForWhatsApp}
                        className="flex items-center gap-2 px-4 sm:px-6 py-3 bg-primary text-black font-bold rounded-2xl hover:bg-primary-dark transition-all active:scale-95 shadow-lg min-h-[48px]"
                        aria-label="Copia stock negli appunti"
                    >
                        <Copy size={20} />
                        <span className="font-black text-sm sm:text-base">Copia stock</span>
                    </button>
                </div>
            </div>

            {/* Inventory Grid/List */}
            <div className="flex flex-col gap-10 w-full max-w-[1600px] mx-auto">
                {groupedData.length > 0 ? (
                    groupedData.map((group) => {
                        const total = group.items.length;
                        const sortedItems = [...group.items].sort((a, b) => a.flavorName.localeCompare(b.flavorName));

                        // Logica Simmetrica Ottimizzata:
                        // - Se multiplo di 3 (e almeno 6): 3 colonne (bilanciamento perfetto: 2-2-2, 3-3-3, etc.)
                        // - Altrimenti: 2 colonne (bilanciamento perfetto per pari, diff 1 per dispari)
                        let columnCount = 1;
                        if (total > 1) {
                            if (total % 3 === 0 && total >= 6) columnCount = 3;
                            else columnCount = 2;
                        }

                        // Logica di divisione bilanciata matematica per garantire la simmetria richiesta
                        const baseCount = Math.floor(total / columnCount);
                        const remainder = total % columnCount;
                        const columns: any[][] = [];
                        let start = 0;

                        for (let i = 0; i < columnCount; i++) {
                            const count = baseCount + (i < remainder ? 1 : 0);
                            columns.push(sortedItems.slice(start, start + count));
                            start += count;
                        }

                        return (
                            <div key={group.modelName} className="glass rounded-[2rem] md:rounded-[3rem] overflow-hidden border border-white/10 flex flex-col shadow-2xl w-full">
                                <div className="p-6 md:p-10 bg-white/5 border-b border-white/10 flex items-center justify-between">
                                    <div className="flex items-center gap-4 md:gap-6">
                                        <div className="w-12 h-12 md:w-16 md:h-16 bg-primary/20 rounded-2xl md:rounded-[1.5rem] flex items-center justify-center text-primary shadow-2xl shadow-primary/10">
                                            <Package className="w-6 h-6 md:w-8 md:h-8" />
                                        </div>
                                        <div>
                                            <h3 className="font-black text-xl md:text-3xl tracking-tight uppercase text-white leading-none">{group.modelName}</h3>
                                            <p className="text-[10px] md:text-xs text-slate-500 font-bold tracking-[0.2em] md:tracking-[0.3em] uppercase mt-1.5 md:mt-2">{total} VARIANTI DISPONIBILI</p>
                                        </div>
                                    </div>
                                </div>

                                <div className={clsx(
                                    "p-6 md:p-10 gap-x-8 md:gap-x-16 gap-y-4 md:gap-y-6 grid grid-cols-1",
                                    columnCount === 2 && "lg:grid-cols-2",
                                    columnCount === 3 && "lg:grid-cols-3"
                                )}>
                                    {columns.map((colItems, colIdx) => (
                                        <div key={colIdx} className="space-y-3 md:space-y-4">
                                            {colItems.map((item) => (
                                                <div
                                                    key={item.variantId}
                                                    className="flex items-center justify-between p-4 md:p-6 bg-white/10 rounded-[1.5rem] md:rounded-[2.5rem] border border-white/5 hover:border-primary/40 hover:bg-white/[0.15] transition-all duration-500 group"
                                                >
                                                    <span className="text-slate-200 text-lg md:text-2xl font-bold group-hover:text-white transition-colors pr-4 md:pr-8">{item.flavorName}</span>
                                                    <div className={clsx(
                                                        "px-6 md:px-10 py-3 md:py-5 rounded-[1.25rem] md:rounded-[2rem] font-black min-w-[4.5rem] md:min-w-[6.5rem] text-center text-xl md:text-3xl shadow-2xl",
                                                        item.qty === 0 ? "bg-red-500/20 text-red-500 border border-red-500/30" :
                                                            item.qty < 5 ? "bg-orange-500/20 text-orange-400 border border-orange-500/30" :
                                                                "bg-primary/20 text-primary border border-primary/40"
                                                    )}>
                                                        {item.qty}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <div className="col-span-full py-20 text-center glass rounded-3xl border-dashed">
                        <Package size={48} className="mx-auto text-slate-700 mb-4" />
                        <p className="text-slate-400">Nessun prodotto trovato nell'inventario.</p>
                    </div>
                )}
            </div>

            {/* Toast Notification */}
            {toast && (
                <div className="fixed bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 bg-green-500 text-white rounded-2xl font-bold text-sm shadow-xl animate-in slide-in-from-bottom-4 fade-in duration-300">
                    <div className="flex items-center gap-2">
                        <Check size={18} />
                        {toast}
                    </div>
                </div>
            )}
        </div>
    );
};
