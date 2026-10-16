import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useRealtime } from '../hooks/useRealtime';
import { useToast } from '../components/ui/ToastProvider';
import { EmptyState } from '../components/ui/EmptyState';
import { PageSkeleton } from '../components/ui/PageSkeleton';
import { Badge } from '../components/ui/Badge';
import type { ProductVariant, Inventory } from '../types/database';
import { Search, Copy, X, Package, AlertTriangle, XCircle } from 'lucide-react';
import { cn } from '../lib/cn';

interface GroupedInventory {
  modelName: string;
  items: { flavorName: string; qty: number; variantId: string }[];
}

type FilterStatus = 'all' | 'out_of_stock' | 'low_stock' | 'in_stock';

const FILTERS: { id: FilterStatus; label: string }[] = [
  { id: 'all', label: 'Tutti' },
  { id: 'in_stock', label: 'Disponibili' },
  { id: 'low_stock', label: 'Pochi (≤ 3)' },
  { id: 'out_of_stock', label: 'Esauriti' },
];

export const Inventario: React.FC = () => {
  const { showToast } = useToast();
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const STOCK_THRESHOLD = 3;

  const fetchData = async () => {
    try {
      const [variantsRes, inventoryRes] = await Promise.all([
        supabase
          .from('product_variants')
          .select('*, model:product_models(name), flavor:product_flavors(name)')
          .eq('active', true),
        supabase.from('inventory').select('*'),
      ]);
      if (variantsRes.data) {
        setVariants(
          variantsRes.data.map(
            (v: ProductVariant & { model?: { name: string }; flavor?: { name: string } }) => ({
              ...v,
              model_name: v.model?.name ?? '',
              flavor_name: v.flavor?.name ?? '',
            })
          )
        );
      }
      if (inventoryRes.data) setInventory(inventoryRes.data);
    } catch (error) {
      console.error('Inventario load error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useRealtime<Inventory>('inventory', (payload) => {
    if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
      const newData = payload.new as Inventory;
      setInventory((prev) => {
        const index = prev.findIndex((i) => i.variant_id === newData.variant_id);
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
    variants.forEach((v) => {
      const inv = inventory.find((i) => i.variant_id === v.id);
      const qty = inv ? inv.qty : 0;
      if (filterStatus === 'out_of_stock' && qty > 0) return;
      if (filterStatus === 'low_stock' && (qty === 0 || qty > STOCK_THRESHOLD)) return;
      if (filterStatus === 'in_stock' && qty <= STOCK_THRESHOLD) return;
      if (!groups[v.model_name!]) {
        groups[v.model_name!] = { modelName: v.model_name!, items: [] };
      }
      groups[v.model_name!].items.push({
        flavorName: v.flavor_name!,
        qty,
        variantId: v.id,
      });
    });
    return Object.values(groups)
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (item) =>
            group.modelName.toLowerCase().includes(search.toLowerCase()) ||
            item.flavorName.toLowerCase().includes(search.toLowerCase())
        ),
      }))
      .filter((group) => group.items.length > 0)
      .sort((a, b) => a.modelName.localeCompare(b.modelName));
  }, [variants, inventory, search, filterStatus]);

  const stats = useMemo(() => {
    const total = inventory.reduce((acc, curr) => acc + curr.qty, 0);
    const outOfStock = variants.filter((v) => {
      const inv = inventory.find((i) => i.variant_id === v.id);
      return !inv || inv.qty === 0;
    }).length;
    const lowStock = variants.filter((v) => {
      const inv = inventory.find((i) => i.variant_id === v.id);
      return inv && inv.qty > 0 && inv.qty <= STOCK_THRESHOLD;
    }).length;
    return { total, outOfStock, lowStock };
  }, [inventory, variants]);

  const copyForWhatsApp = async () => {
    const d = new Date();
    const date = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
    let text = `📦 *STOCK UPDATE* 📦\n_${date}_\n\n`;
    groupedData.forEach((group) => {
      const inStockItems = group.items.filter((item) => item.qty > 0);
      if (inStockItems.length > 0) {
        text += `*${group.modelName.toUpperCase()}*:\n`;
        inStockItems.forEach((item) => {
          text += `• ${item.flavorName}: ${item.qty}pz\n`;
        });
        text += `\n`;
      }
    });
    try {
      await navigator.clipboard.writeText(text.trim());
      showToast('Inventario copiato negli appunti', 'success');
    } catch {
      showToast('Errore durante la copia', 'error');
    }
  };

  if (loading) {
    return (
      <PageSkeleton
        titleClass="w-52 h-10"
        blocks={[
          { count: 3, className: 'h-24' },
          { count: 4, className: 'h-20' },
        ]}
      />
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      {/* ── Top Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="spatial-chip spatial-chip-blue text-[11px] py-0.5">
              <Package size={11} /> Stock & Magazzino
            </span>
            <span className="spatial-caption text-white/50">
              {variants.length} Varianti
            </span>
          </div>
          <h1 className="spatial-title text-2xl sm:text-3xl font-semibold text-white">
            Stato Magazzino
          </h1>
        </div>

        {/* WhatsApp Export Button */}
        <button
          type="button"
          onClick={copyForWhatsApp}
          className="spatial-btn-ghost h-11 px-4 text-xs font-semibold flex items-center gap-2 self-start sm:self-auto shrink-0"
          aria-label="Copia testo inventario per WhatsApp"
        >
          <Copy size={15} />
          <span>Copia per WhatsApp</span>
        </button>
      </div>

      {/* ── 3 Smart-Home KPI Tiles (Humidity / Wind Speed Style) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        {/* Tile 1: Totale */}
        <div className="spatial-tile">
          <div className="flex items-center justify-between">
            <span className="spatial-caption text-white/50">Giacenza Totale</span>
            <div className="w-9 h-9 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-white">
              <Package size={17} />
            </div>
          </div>
          <div className="mt-2">
            <p className="spatial-amount text-3xl sm:text-4xl font-bold text-white tracking-tight">
              {stats.total}
            </p>
            <p className="spatial-footnote text-xs text-white/50 mt-0.5">
              Pezzi fisici disponibili
            </p>
          </div>
        </div>

        {/* Tile 2: Pochi */}
        <div className="spatial-tile border-[#FF9F0A]/25">
          <div className="flex items-center justify-between">
            <span className="spatial-caption text-[#FF9F0A]">In Esaurimento</span>
            <div className="w-9 h-9 rounded-full bg-[#FF9F0A]/15 border border-[#FF9F0A]/30 flex items-center justify-center text-[#FF9F0A]">
              <AlertTriangle size={17} />
            </div>
          </div>
          <div className="mt-2">
            <p className="spatial-amount text-3xl sm:text-4xl font-bold text-[#FF9F0A] tracking-tight">
              {stats.lowStock}
            </p>
            <p className="spatial-footnote text-xs text-[#FF9F0A]/70 mt-0.5">
              Scorte critiche (≤ {STOCK_THRESHOLD} pz)
            </p>
          </div>
        </div>

        {/* Tile 3: Esauriti */}
        <div className="spatial-tile border-[#FF453A]/25">
          <div className="flex items-center justify-between">
            <span className="spatial-caption text-[#FF453A]">Esauriti</span>
            <div className="w-9 h-9 rounded-full bg-[#FF453A]/15 border border-[#FF453A]/30 flex items-center justify-center text-[#FF453A]">
              <XCircle size={17} />
            </div>
          </div>
          <div className="mt-2">
            <p className="spatial-amount text-3xl sm:text-4xl font-bold text-[#FF453A] tracking-tight">
              {stats.outOfStock}
            </p>
            <p className="spatial-footnote text-xs text-[#FF453A]/70 mt-0.5">
              Varianti a stock zero
            </p>
          </div>
        </div>
      </div>

      {/* ── Search Bar & Filter Pills ── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        {/* Search */}
        <div className="spatial-search flex-1">
          <Search size={18} className="text-white/40 shrink-0" />
          <input
            type="search"
            placeholder="Cerca modello o gusto nel magazzino..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Cerca nel magazzino"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="text-white/40 hover:text-white"
              aria-label="Pulisci ricerca"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="spatial-segmented shrink-0">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilterStatus(f.id)}
              className={cn(
                'spatial-segmented-item text-xs',
                filterStatus === f.id && 'spatial-segmented-item-active'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Grouped Inventory Sections ── */}
      {groupedData.length === 0 ? (
        <EmptyState
          title="Nessun prodotto trovato"
          subtitle="Nessun articolo corrisponde ai filtri selezionati o alla parola chiave"
        />
      ) : (
        <div className="space-y-6">
          {groupedData.map((group) => {
            const groupTotal = group.items.reduce((acc, curr) => acc + curr.qty, 0);

            return (
              <section key={group.modelName} className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <h2 className="spatial-caption text-white/60 tracking-wider font-semibold">
                    {group.modelName.toUpperCase()}
                  </h2>
                  <span className="spatial-caption text-white/40">
                    {groupTotal} pezzi disponibili
                  </span>
                </div>

                <div className="spatial-panel p-0 overflow-hidden divide-y divide-white/10">
                  {group.items.map((item) => {
                    const isZero = item.qty === 0;
                    const isLow = item.qty > 0 && item.qty <= STOCK_THRESHOLD;

                    return (
                      <div
                        key={item.variantId}
                        className={cn(
                          'spatial-row px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3 transition-colors',
                          isZero ? 'opacity-40 bg-white/[0.02]' : 'hover:bg-white/5'
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="spatial-headline text-[15px] sm:text-[16px] text-white font-medium truncate">
                            {item.flavorName}
                          </p>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          {isZero ? (
                            <Badge variant="danger" size="xs">
                              Esaurito
                            </Badge>
                          ) : isLow ? (
                            <Badge variant="warning" size="xs">
                              Pochi
                            </Badge>
                          ) : (
                            <Badge variant="success" size="xs">
                              Disponibile
                            </Badge>
                          )}

                          <span
                            className={cn(
                              'spatial-amount text-lg sm:text-xl font-bold w-12 text-right',
                              isZero
                                ? 'text-white/30'
                                : isLow
                                ? 'text-[#FF9F0A]'
                                : 'text-white'
                            )}
                          >
                            {item.qty}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
};
