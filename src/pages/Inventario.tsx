import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useRealtime } from '../hooks/useRealtime';
import { useToast } from '../components/ui/ToastProvider';
import { EmptyState } from '../components/ui/EmptyState';
import { PageSkeleton } from '../components/ui/PageSkeleton';
import { Badge } from '../components/ui/Badge';
import type { ProductVariant, Inventory } from '../types/database';
import { Search, Copy, X } from 'lucide-react';
import { clsx } from 'clsx';

interface GroupedInventory {
  modelName: string;
  items: { flavorName: string; qty: number; variantId: string }[];
}

type FilterStatus = 'all' | 'out_of_stock' | 'low_stock' | 'in_stock';

const FILTERS: { id: FilterStatus; label: string }[] = [
  { id: 'all', label: 'Tutti' },
  { id: 'in_stock', label: 'Disponibili' },
  { id: 'low_stock', label: 'Pochi' },
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

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const [variantsRes, inventoryRes] = await Promise.all([
        supabase.from('product_variants').select('*, model:product_models(name), flavor:product_flavors(name)').eq('active', true),
        supabase.from('inventory').select('*')
      ]);
      if (variantsRes.data) {
        setVariants(variantsRes.data.map((v: ProductVariant & { model?: { name: string }; flavor?: { name: string } }) => ({
          ...v, model_name: v.model?.name ?? '', flavor_name: v.flavor?.name ?? ''
        })));
      }
      if (inventoryRes.data) setInventory(inventoryRes.data);
    } catch (error) {
      console.error('Inventario load error:', error);
    } finally {
      setLoading(false);
    }
  };

  useRealtime<Inventory>('inventory', (payload) => {
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
      if (!groups[v.model_name!]) groups[v.model_name!] = { modelName: v.model_name!, items: [] };
      groups[v.model_name!].items.push({ flavorName: v.flavor_name!, qty, variantId: v.id });
    });
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
  }, [variants, inventory, search, filterStatus]);

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
      showToast('Inventario copiato', 'success');
    } catch { showToast('Errore durante la copia', 'error'); }
  };

  if (loading) return (
    <PageSkeleton titleClass="w-48 h-9" blocks={[{ count: 3, className: 'h-20' }, { count: 4, className: 'h-[60px]' }]} />
  );

  return (
    <div className="ios-page">
      <div>
        <h1 className="ios-title-large">Magazzino</h1>
        <p className="ios-footnote mt-0.5">{stats.total} pezzi totali · {stats.outOfStock} esauriti · {stats.lowStock} in avviso</p>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        {[
          { label: 'Totale', val: stats.total, tone: 'var(--label)' },
          { label: 'Esauriti', val: stats.outOfStock, tone: '#C0392B' },
          { label: 'Pochi', val: stats.lowStock, tone: '#B97A1A' },
        ].map((s) => (
          <div key={s.label} className="ios-card p-3.5 text-center">
            <p className="ios-title-1 ios-amount" style={{ color: s.tone }}>{s.val}</p>
            <p className="ios-caption mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="ios-search">
        <Search size={18} style={{ color: 'var(--label-tertiary)', flexShrink: 0 }} />
        <input type="search" placeholder="Cerca modello o gusto" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Cerca in magazzino" />
        {search && <button onClick={() => setSearch('')} className="ios-press" style={{ color: 'var(--label-tertiary)' }} aria-label="Pulisci"><X size={16} /></button>}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map(f => (
          <button key={f.id} onClick={() => setFilterStatus(f.id)}
            className={clsx('ios-press whitespace-nowrap px-3.5 py-1.5 rounded-full text-[14px]', filterStatus === f.id && 'font-semibold')}
            style={filterStatus === f.id ? { background: 'var(--label)', color: 'var(--surface-secondary)' } : { background: 'var(--surface-secondary)', color: 'var(--label)' }}>
            {f.label}
          </button>
        ))}
        <button onClick={copyForWhatsApp} className="ios-press whitespace-nowrap px-3.5 py-1.5 rounded-full text-[14px] font-medium flex items-center gap-1.5 ml-auto" style={{ background: 'var(--accent-tint)', color: 'var(--accent)' }}>
          <Copy size={14} /> Stock
        </button>
      </div>

      {groupedData.length === 0 ? (
        <EmptyState title="Niente da mostrare" subtitle="Prova a cambiare filtro o ricerca" />
      ) : (
        groupedData.map((group) => (
          <section key={group.modelName}>
            <h2 className="ios-footnote px-1 mb-1.5">{group.modelName.toUpperCase()}</h2>
            <div className="ios-grouped">
              {group.items.map((item) => (
                <div key={item.variantId} className="ios-row" style={{ minHeight: 56 }}>
                  <div className="flex-1 min-w-0">
                    <p className="ios-headline text-[15px] truncate" style={item.qty === 0 ? { color: 'var(--label-tertiary)' } : undefined}>
                      {item.flavorName}
                    </p>
                  </div>
                  {item.qty === 0
                    ? <Badge variant="danger" size="sm">Esaurito</Badge>
                    : item.qty <= STOCK_THRESHOLD
                      ? <Badge variant="warning" size="sm">Pochi</Badge>
                      : null}
                  <span className="ios-title-3 ios-amount" style={{ color: item.qty === 0 ? 'var(--label-tertiary)' : item.qty <= STOCK_THRESHOLD ? '#B97A1A' : undefined }}>
                    {item.qty}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
};
