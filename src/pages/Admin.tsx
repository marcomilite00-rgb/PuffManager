import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { Staff, ProductVariant, StaffRole, Inventory } from '../types/database';
import {
    Plus,
    X,
    Package,
    Trash2,
    Check,
    TrendingUp,
    AlertCircle,
    DollarSign,
    Users,
    Settings,
    LayoutGrid,
    Key,
    Shield,
    ArrowUpRight
} from 'lucide-react';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';

export const Admin: React.FC = () => {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<'settings' | 'staff' | 'inventory_management' | 'products'>('settings');
    const [staff, setStaff] = useState<Staff[]>([]);
    const [variants, setVariants] = useState<ProductVariant[]>([]);
    const [, setInventory] = useState<Inventory[]>([]);
    const [models, setModels] = useState<any[]>([]);
    const [flavors, setFlavors] = useState<any[]>([]);
    const [settings, setSettings] = useState<any>(null);
    const [, setLoading] = useState(true);

    const [newModel, setNewModel] = useState('');
    const [newFlavor, setNewFlavor] = useState('');
    const [newVariant, setNewVariant] = useState({ model_id: '', flavor_id: '', default_price: 15, initial_qty: 0 });
    const [editingVariant, setEditingVariant] = useState<any>(null);
    const [editingStaff, setEditingStaff] = useState<any>(null);
    const [showAddVariant, setShowAddVariant] = useState(false);
    const [newPin, setNewPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [pinError, setPinError] = useState('');
    const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);

    const [showAddStaff, setShowAddStaff] = useState(false);
    const [newStaff, setNewStaff] = useState({ name: '', role: 'staff' as StaffRole, pin: '', confirmPin: '' });

    const [showClosingLoad, setShowClosingLoad] = useState(false);
    const [closingPreview, setClosingPreview] = useState<{ gross_total: number } | null>(null);
    const [closingSoldiSpesi, setClosingSoldiSpesi] = useState('');
    const [closingPezziComprati, setClosingPezziComprati] = useState('');
    const [, setClosingLoading] = useState(false);

    const isAdmin = user?.role === 'admin';

    useEffect(() => {
        if (isAdmin) fetchData();
    }, [isAdmin]);

    const fetchData = async () => {
        setLoading(true);
        const [staffRes, variantsRes, modelsRes, flavorsRes, settingsRes, inventoryRes] = await Promise.all([
            supabase.from('staff').select('*').order('name'),
            supabase.from('product_variants').select('*, model:product_models(name), flavor:product_flavors(name)'),
            supabase.from('product_models').select('*').order('name'),
            supabase.from('product_flavors').select('*').order('name'),
            supabase.from('settings').select('*').single(),
            supabase.from('inventory').select('*')
        ]);

        if (staffRes.data) setStaff(staffRes.data);
        if (inventoryRes.data) setInventory(inventoryRes.data);
        if (variantsRes.data) {
            const merged = variantsRes.data.map((v: any) => {
                const inv = (inventoryRes.data || []).find((i: any) => i.variant_id === v.id);
                return {
                    ...v,
                    model_name: v.model?.name ?? '',
                    flavor_name: v.flavor?.name ?? '',
                    qty: inv ? inv.qty : 0
                };
            });
            merged.sort((a: any, b: any) => a.model_name.localeCompare(b.model_name) || a.flavor_name.localeCompare(b.flavor_name));
            setVariants(merged);
        }
        if (modelsRes.data) setModels(modelsRes.data);
        if (flavorsRes.data) setFlavors(flavorsRes.data);
        if (settingsRes.data) setSettings(settingsRes.data);
        setLoading(false);
    };

    const showToast = (message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const handleUpdateSettings = async (e: React.FormEvent) => {
        e.preventDefault();
        const { error } = await supabase
            .from('settings')
            .update({
                money_spent_total: settings.money_spent_total,
                money_spent_current_load: settings.money_spent_current_load
            })
            .eq('id', 1);

        if (error) showToast('Errore salvataggio', 'error');
        else showToast('Impostazioni salvate');
    };

    const handleAddModel = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newModel.trim()) return;
        const { error } = await supabase.from('product_models').insert({ name: newModel.trim().toUpperCase() });
        if (error) showToast('Errore modello', 'error');
        else { setNewModel(''); fetchData(); showToast('Modello aggiunto'); }
    };

    const handleAddFlavor = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newFlavor.trim()) return;
        const { error } = await supabase.from('product_flavors').insert({ name: newFlavor.trim().toUpperCase() });
        if (error) showToast('Errore gusto', 'error');
        else { setNewFlavor(''); fetchData(); showToast('Gusto aggiunto'); }
    };

    const handleAddVariant = async (e: React.FormEvent) => {
        e.preventDefault();
        const { error } = await supabase.rpc('create_product_variant', {
            p_model_id: newVariant.model_id,
            p_flavor_id: newVariant.flavor_id,
            p_default_price: newVariant.default_price,
            p_initial_qty: newVariant.initial_qty
        });
        if (error) showToast(error.message, 'error');
        else { setShowAddVariant(false); fetchData(); showToast('Variante creata'); }
    };

    const handleUpdateVariant = async (v: any) => {
        const { error } = await supabase
            .from('product_variants')
            .update({ default_price: v.default_price, active: v.active })
            .eq('id', v.id);
        
        if (error) showToast('Errore aggiornamento', 'error');
        else { setEditingVariant(null); fetchData(); showToast('Variante aggiornata'); }
    };

    const handleDeleteVariant = async (id: string) => {
        if (!confirm('Eliminare questa variante?')) return;
        const { error } = await supabase.from('product_variants').delete().eq('id', id);
        if (error) showToast('In uso in alcuni ordini', 'error');
        else { fetchData(); showToast('Variante eliminata'); }
    };

    const handleUpdateQty = async (variantId: string, newQty: number) => {
        const { error } = await supabase
            .from('inventory')
            .upsert({ variant_id: variantId, qty: newQty }, { onConflict: 'variant_id' });

        if (error) showToast('Errore aggiornamento quantità', 'error');
        else {
            setVariants(prev => prev.map(v => v.id === variantId ? { ...v, qty: newQty } : v));
            showToast('Quantità aggiornata');
        }
    };

    const handleDeleteStaff = async (id: string) => {
        if (!confirm('Rimuovere membro staff?')) return;
        const { error } = await supabase.from('staff').delete().eq('id', id);
        if (error) showToast('Errore eliminazione staff', 'error');
        else { fetchData(); showToast('Membro rimosso'); }
    };

    const handleAddStaff = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newStaff.pin !== newStaff.confirmPin) {
            setPinError('PIN non corrispondono');
            return;
        }
        const { error } = await supabase.rpc('create_staff', {
            p_name: newStaff.name.trim(),
            p_role: newStaff.role,
            p_pin: newStaff.pin
        });

        if (error) showToast(error.message, 'error');
        else {
            setShowAddStaff(false);
            setNewStaff({ name: '', role: 'staff', pin: '', confirmPin: '' });
            setPinError('');
            fetchData();
            showToast('Staff aggiunto');
        }
    };

    const handleUpdateStaffPin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newPin !== confirmPin) { setPinError('PIN non corrispondono'); return; }
        const { error } = await supabase.from('staff').update({ pin_hash: newPin }).eq('id', editingStaff.id);
        if (error) showToast('Errore PIN', 'error');
        else { setEditingStaff(null); setNewPin(''); setConfirmPin(''); setPinError(''); showToast('PIN aggiornato'); }
    };

    const handleClosingLoadClick = async () => {
        setClosingLoading(true);
        // Correctly handle JSON response from preview RPC
        const { data, error } = await supabase.rpc('get_closing_preview');
        if (error) {
            showToast('Errore preview: ' + error.message, 'error');
        } else {
            setClosingPreview(data);
            setClosingSoldiSpesi(settings?.money_spent_current_load?.toString() || '');
            setShowClosingLoad(true);
        }
        setClosingLoading(false);
    };

    const handleConfirmClosingLoad = async () => {
        if (!closingPezziComprati || Number(closingPezziComprati) <= 0) {
            showToast('Inserire pezzi comprati (> 0)', 'error');
            return;
        }

        setClosingLoading(true);
        const { error } = await supabase.rpc('close_current_load', {
            p_soldi_spesi: Number(closingSoldiSpesi) || 0,
            p_pezzi_comprati: Number(closingPezziComprati) || 0
        });

        if (error) {
            showToast(error.message, 'error');
        } else {
            setShowClosingLoad(false);
            setClosingPezziComprati('');
            fetchData();
            showToast('Carico chiuso');
        }
        setClosingLoading(false);
    };

    const handleDeleteModel = async (id: string) => {
        if (!confirm('Eliminare modello?')) return;
        const { error } = await supabase.from('product_models').delete().eq('id', id);
        if (error) showToast('Errore: in uso', 'error');
        else { fetchData(); showToast('Eliminato'); }
    };

    const handleDeleteFlavor = async (id: string) => {
        if (!confirm('Eliminare gusto?')) return;
        const { error } = await supabase.from('product_flavors').delete().eq('id', id);
        if (error) showToast('Errore: in uso', 'error');
        else { fetchData(); showToast('Eliminato'); }
    };

    if (!isAdmin) return (
        <div className="min-h-screen bg-surface-950 flex items-center justify-center p-6 text-center">
            <div className="glass p-10 rounded-3xl border-danger/20 space-y-4">
                <Shield size={40} className="mx-auto text-danger" />
                <h1 className="text-2xl font-black italic tracking-tighter text-white uppercase">Accesso Vietato</h1>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-surface-950 pb-32 safe-area-pt overflow-x-hidden">
            {/* Header */}
            <header className="px-3 md:px-12 py-4 md:py-12 bg-white/[0.02] border-b border-white/5 sticky top-0 z-40 backdrop-blur-3xl overflow-hidden">
                <div className="absolute -top-24 -left-24 w-96 h-96 bg-primary/5 rounded-full blur-[120px] pointer-events-none" />
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-end gap-3 md:gap-10 relative z-10">
                    <div>
                        <h1 className="text-2xl md:text-7xl font-black italic tracking-tighter text-white uppercase leading-none">
                            Admin<span className="text-primary not-italic">.</span>
                        </h1>
                        <p className="label-caps text-[7px] md:text-[8px] text-slate-600 tracking-widest mt-1 uppercase font-bold opacity-70">Infrastructure</p>
                    </div>

                    <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide w-full md:w-auto -mx-3 px-3 md:mx-0 md:px-0">
                        {[
                            { id: 'settings', label: 'Home', icon: Settings },
                            { id: 'staff', label: 'Team', icon: Users },
                            { id: 'products', label: 'Catalog', icon: LayoutGrid },
                            { id: 'inventory_management', label: 'Inventory', icon: Package },
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={clsx(
                                    "flex items-center gap-1.5 px-3 py-2 rounded-lg font-black label-caps text-[7.5px] md:text-[10px] transition-all whitespace-nowrap uppercase tracking-widest shrink-0 border duration-300",
                                    activeTab === tab.id 
                                        ? "bg-primary border-primary text-surface-950 scale-105" 
                                        : "bg-surface-900/60 border-white/5 text-slate-500 hover:text-white"
                                )}
                            >
                                <tab.icon size={12} strokeWidth={activeTab === tab.id ? 3 : 2} />
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-3 md:px-12 py-6 md:py-16">
                {/* TAB: DASHBOARD */}
                {activeTab === 'settings' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8 animate-in slide-in-from-bottom-5 duration-700">
                        <div className="glass rounded-3xl p-6 md:p-10 border-white/5 bg-surface-900/40 relative overflow-hidden group">
                            <div className="relative z-10 space-y-4">
                                <div className="w-12 h-12 bg-danger/20 rounded-xl flex items-center justify-center text-danger">
                                    <TrendingUp size={24} />
                                </div>
                                <div>
                                    <h3 className="text-xl md:text-3xl font-black italic text-white uppercase">Chiudi Carico</h3>
                                    <p className="text-slate-500 text-xs md:text-sm mt-1 max-w-xs">Sincronizza e archivia la sessione corrente.</p>
                                </div>
                                <button onClick={handleClosingLoadClick} className="w-full py-4 bg-danger text-white font-black text-[10px] md:text-xs rounded-xl md:rounded-2xl uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-danger/20 active:scale-95 transition-transform">
                                    <ArrowUpRight size={16} /> AVVIA CHIUSURA CARICO
                                </button>
                            </div>
                        </div>

                        <div className="glass rounded-3xl p-6 md:p-10 border-white/5 space-y-6">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center text-emerald-500"><DollarSign size={20} /></div>
                                <h3 className="text-lg md:text-2xl font-black italic uppercase">Bilancio</h3>
                            </div>
                            <form onSubmit={handleUpdateSettings} className="space-y-4">
                                <div className="p-5 md:p-8 bg-black/40 border border-white/5 rounded-2xl">
                                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Utile Netto</p>
                                    <p className="text-3xl md:text-5xl font-black text-emerald-500 italic tabular-nums">€{settings?.total_net_earned?.toLocaleString('it-IT')}</p>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <label className="text-[8px] font-black uppercase text-slate-500 ml-1">Spese Carico</label>
                                        <input type="number" value={settings?.money_spent_current_load || ''} onChange={e => setSettings({ ...settings, money_spent_current_load: Number(e.target.value) })}
                                            className="w-full bg-black/40 border border-white/5 rounded-xl py-3 px-4 font-black text-sm text-white outline-none focus:border-primary/40 transition-all"/>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[8px] font-black uppercase text-slate-500 ml-1">Archive</label>
                                        <input type="number" value={settings?.money_spent_total || ''} onChange={e => setSettings({ ...settings, money_spent_total: Number(e.target.value) })}
                                            className="w-full bg-black/40 border border-white/5 rounded-xl py-3 px-4 font-black text-sm text-white outline-none focus:border-primary/40 transition-all"/>
                                    </div>
                                </div>
                                <button type="submit" className="w-full py-3 bg-white/5 border border-white/5 rounded-xl text-white font-black text-[9px] uppercase tracking-widest hover:bg-white/10 transition-colors">SALVA DATI</button>
                            </form>
                        </div>
                    </div>
                )}

                {/* TAB: STAFF */}
                {activeTab === 'staff' && (
                    <div className="space-y-6 animate-in slide-in-from-right-10 duration-500">
                         <div className="flex justify-between items-center gap-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center text-primary"><Users size={20} /></div>
                                <h3 className="text-lg md:text-2xl font-black italic uppercase">Organigramma</h3>
                            </div>
                            <button onClick={() => setShowAddStaff(true)} className="px-5 py-3 bg-primary text-surface-950 font-black rounded-xl text-[9px] uppercase tracking-widest shadow-lg shadow-primary/20 active:scale-95 transition-all">
                                <Plus size={14} className="inline mr-1" /> AGGIUNGI
                            </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
                            {staff.map((s) => (
                                <div key={s.id} className="p-5 glass rounded-2xl border-white/5 relative overflow-hidden group bg-surface-900/30">
                                     <div className="flex justify-between items-start mb-4">
                                        <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center text-slate-500 font-black text-lg border border-white/5">{s.name[0]}</div>
                                        <div className="flex gap-1.5 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => setEditingStaff(s)} className="p-2 text-slate-500 hover:text-white bg-white/5 rounded-lg"><Key size={12} /></button>
                                            <button onClick={() => handleDeleteStaff(s.id)} className="p-2 text-danger/60 hover:text-danger bg-white/5 rounded-lg"><Trash2 size={12} /></button>
                                        </div>
                                     </div>
                                     <p className="font-black text-white text-lg uppercase italic truncate leading-none mb-1">{s.name}</p>
                                     <span className="label-caps text-[8px] text-slate-600 font-bold uppercase tracking-widest">{s.role}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* TAB: CATALOG */}
                {activeTab === 'products' && (
                    <div className="space-y-10 animate-in slide-in-from-right-10 duration-500">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-cyan-500/20 rounded-xl flex items-center justify-center text-cyan-400"><LayoutGrid size={20} /></div>
                            <h3 className="text-lg md:text-2xl font-black italic uppercase">Catalogo</h3>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <div className="space-y-4">
                                <p className="label-caps text-[9px] text-primary font-black uppercase flex justify-between items-center group px-1">
                                    <span>MODELLI HARDWARE</span>
                                    <span className="opacity-40 italic">{models.length} ITEMS</span>
                                </p>
                                <form onSubmit={handleAddModel} className="flex gap-2">
                                    <input type="text" value={newModel} onChange={e => setNewModel(e.target.value)} placeholder="Nuovo modello..."
                                        className="flex-1 bg-surface-900 border border-white/5 rounded-xl px-5 py-3 text-white font-bold italic text-xs outline-none focus:border-primary/40 transition-all"/>
                                    <button type="submit" className="w-12 h-12 bg-primary text-surface-950 rounded-xl flex items-center justify-center shadow-lg active:scale-95 transition-all"><Plus size={20} /></button>
                                </form>
                                <div className="grid grid-cols-1 gap-1.5">
                                    {models.map(m => (
                                        <div key={m.id} className="p-3.5 bg-white/[0.03] border border-white/5 rounded-xl flex items-center justify-between group hover:bg-white/5">
                                            <span className="font-black text-white italic tracking-tight uppercase text-xs">{m.name}</span>
                                            <button onClick={() => handleDeleteModel(m.id)} className="p-1.5 text-danger/50 transition-all"><Trash2 size={14} /></button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-4">
                                <p className="label-caps text-[9px] text-indigo-400 font-black uppercase flex justify-between items-center group px-1">
                                    <span>LIBRERIA AROMI</span>
                                    <span className="opacity-40 italic">{flavors.length} GUSTI</span>
                                </p>
                                <form onSubmit={handleAddFlavor} className="flex gap-2">
                                    <input type="text" value={newFlavor} onChange={e => setNewFlavor(e.target.value)} placeholder="Nuovo gusto..."
                                        className="flex-1 bg-surface-900 border border-white/5 rounded-xl px-5 py-3 text-white font-bold italic text-xs outline-none focus:border-indigo-500/40 transition-all"/>
                                    <button type="submit" className="w-12 h-12 bg-indigo-500 text-white rounded-xl flex items-center justify-center shadow-lg active:scale-95 transition-all"><Plus size={20} /></button>
                                </form>
                                <div className="grid grid-cols-2 gap-1.5">
                                    {flavors.map(f => (
                                        <div key={f.id} className="p-3 bg-white/[0.02] border border-white/5 rounded-xl flex items-center justify-between group hover:bg-white/5">
                                            <span className="font-bold text-slate-400 text-[10px] uppercase italic truncate pr-1">{f.name}</span>
                                            <button onClick={() => handleDeleteFlavor(f.id)} className="p-1 text-danger/40 shrink-0"><Trash2 size={12} /></button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* TAB: INVENTORY */}
                {activeTab === 'inventory_management' && (
                    <div className="space-y-6 animate-in slide-in-from-right-10 duration-500">
                        <div className="flex justify-between items-center gap-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-amber-500/20 rounded-xl flex items-center justify-center text-amber-500"><Package size={20} /></div>
                                <h3 className="text-lg md:text-2xl font-black italic uppercase">Assets</h3>
                            </div>
                            <button onClick={() => setShowAddVariant(true)} className="px-5 py-3 bg-amber-500 text-surface-950 font-black rounded-xl text-[9px] uppercase tracking-widest shadow-lg active:scale-95 transition-all">
                                <Plus size={14} className="inline mr-1" /> VARIANTE
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                            {variants.length === 0 && (
                                <div className="col-span-full py-20 text-center text-slate-500 font-bold uppercase tracking-widest text-xs">
                                    Nessuna variante trovata. Creane una con il pulsante VARIANTE.
                                </div>
                            )}
                            {variants.map((v) => (
                                <div key={v.id} className="p-6 glass rounded-2xl border-white/5 hover:border-amber-500/20 transition-all group relative bg-surface-900/30">
                                    <div className="flex justify-between items-start mb-6">
                                        <div className="min-w-0 pr-2">
                                            <p className="font-black text-white text-base md:text-xl uppercase italic leading-none truncate">{v.model_name}</p>
                                            <p className="label-caps text-[8px] text-amber-500 font-bold tracking-widest mt-1.5 opacity-80 uppercase italic truncate">{v.flavor_name}</p>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="text-lg font-black text-white italic leading-none pt-0.5">€{v.default_price}</p>
                                        </div>
                                    </div>
                                    
                                    <div className="flex flex-col gap-4">
                                        <div className="flex items-center justify-between bg-black/40 border border-white/5 rounded-xl px-4 py-2">
                                            <span className="text-[10px] font-black text-slate-500 uppercase">Stock</span>
                                            <div className="flex items-center gap-3">
                                                <button 
                                                    onClick={() => handleUpdateQty(v.id, Math.max(0, (v.qty || 0) - 1))}
                                                    className="w-8 h-8 flex items-center justify-center bg-white/5 rounded-lg hover:bg-white/10 active:scale-90 transition-all"
                                                >
                                                    -
                                                </button>
                                                <input 
                                                    type="number" 
                                                    value={v.qty || 0}
                                                    onChange={(e) => handleUpdateQty(v.id, parseInt(e.target.value) || 0)}
                                                    className="w-12 bg-transparent text-center font-black text-white outline-none"
                                                />
                                                <button 
                                                    onClick={() => handleUpdateQty(v.id, (v.qty || 0) + 1)}
                                                    className="w-8 h-8 flex items-center justify-center bg-white/5 rounded-lg hover:bg-white/10 active:scale-90 transition-all"
                                                >
                                                    +
                                                </button>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between pt-4 border-t border-white/5">
                                            <button onClick={() => setEditingVariant({ ...v })} className="px-5 py-2 bg-white/5 border border-white/10 rounded-lg text-[9px] font-black uppercase text-white hover:bg-white/10 transition-all">MODIFICA</button>
                                            <button onClick={() => handleDeleteVariant(v.id)} className="p-2 text-danger/60 hover:text-danger shrink-0"><Trash2 size={14} /></button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </main>

            {/* MODALS */}
            <AnimatePresence>
                {(showAddStaff || showAddVariant || editingVariant || editingStaff || showClosingLoad) && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl overflow-y-auto">
                        <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }} className="glass w-full max-w-md rounded-3xl p-8 md:p-12 border-white/10">
                            
                            {showAddStaff && (
                                <div className="space-y-6">
                                    <div className="flex justify-between items-center mb-2"><h2 className="text-xl font-black italic uppercase">Nuovo Staff</h2><button onClick={() => setShowAddStaff(false)}><X size={20} /></button></div>
                                    <form onSubmit={handleAddStaff} className="space-y-4">
                                        <input required value={newStaff.name} onChange={e => setNewStaff({ ...newStaff, name: e.target.value })} className="w-full bg-surface-950 border border-white/5 rounded-xl px-5 py-3.5 text-white font-bold italic outline-none" placeholder="Nome..."/>
                                        <select value={newStaff.role} onChange={e => setNewStaff({...newStaff, role: e.target.value as StaffRole})} className="w-full bg-surface-950 border border-white/5 rounded-xl px-5 py-3.5 text-white font-bold outline-none">
                                            <option value="staff">Staff</option><option value="helper">Helper</option><option value="admin">Admin</option>
                                        </select>
                                        <div className="grid grid-cols-2 gap-3">
                                            <input type="password" required maxLength={6} value={newStaff.pin} onChange={e => setNewStaff({ ...newStaff, pin: e.target.value })} className="bg-surface-950 border border-white/5 rounded-xl py-3 px-2 text-white font-black text-center outline-none" placeholder="PIN"/>
                                            <input type="password" required maxLength={6} value={newStaff.confirmPin} onChange={e => setNewStaff({ ...newStaff, confirmPin: e.target.value })} className="bg-surface-950 border border-white/5 rounded-xl py-3 px-2 text-white font-black text-center outline-none" placeholder="RE-PIN"/>
                                        </div>
                                        {pinError && <p className="text-danger text-[9px] font-black text-center">{pinError}</p>}
                                        <button type="submit" className="w-full py-4 bg-primary text-surface-950 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg active:scale-95 transition-all">AUTORIZZA STAFF</button>
                                    </form>
                                </div>
                            )}

                            {showAddVariant && (
                                <div className="space-y-6">
                                    <div className="flex justify-between items-center mb-2"><h2 className="text-xl font-black italic uppercase">Nuova Variante</h2><button onClick={() => setShowAddVariant(false)}><X size={20} /></button></div>
                                    <form onSubmit={handleAddVariant} className="space-y-4 text-xs">
                                        <select required value={newVariant.model_id} onChange={e => setNewVariant({ ...newVariant, model_id: e.target.value })} className="w-full bg-surface-950 border border-white/5 rounded-xl px-4 py-3 text-white font-bold">
                                            <option value="">Scegli Modello...</option>{models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                        </select>
                                        <select required value={newVariant.flavor_id} onChange={e => setNewVariant({ ...newVariant, flavor_id: e.target.value })} className="w-full bg-surface-950 border border-white/5 rounded-xl px-4 py-3 text-white font-bold">
                                            <option value="">Scegli Gusto...</option>{flavors.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                        </select>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-1"><label className="text-[8px] text-slate-500 uppercase ml-1">Prezzo Default</label><input type="number" required value={newVariant.default_price} onChange={e => setNewVariant({ ...newVariant, default_price: Number(e.target.value) })} className="w-full bg-surface-950 border border-white/5 rounded-xl px-4 py-3 text-white font-black"/></div>
                                            <div className="space-y-1"><label className="text-[8px] text-slate-500 uppercase ml-1">Initial Qty</label><input type="number" required value={newVariant.initial_qty} onChange={e => setNewVariant({ ...newVariant, initial_qty: Number(e.target.value) })} className="w-full bg-surface-950 border border-white/5 rounded-xl px-4 py-3 text-white font-black"/></div>
                                        </div>
                                        <button type="submit" className="w-full py-4 bg-amber-500 text-surface-950 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg">CREA VARIANTE</button>
                                    </form>
                                </div>
                            )}

                            {editingVariant && (
                                <div className="space-y-6">
                                    <div className="flex justify-between items-center mb-1"><div><h2 className="text-xl font-black italic uppercase leading-tight">{editingVariant.model_name}</h2><p className="text-[9px] text-amber-500 font-bold uppercase italic">{editingVariant.flavor_name}</p></div><button onClick={() => setEditingVariant(null)}><X size={20} /></button></div>
                                    <div className="space-y-5">
                                        <div className="space-y-1.5"><label className="text-[8px] text-slate-500 uppercase ml-1">Cambia Prezzo Default</label><div className="flex items-center gap-3"><input type="number" value={editingVariant.default_price} onChange={e => setEditingVariant({ ...editingVariant, default_price: Number(e.target.value) })} className="flex-1 bg-surface-950 border border-white/5 rounded-xl px-6 py-4 text-white font-black italic text-2xl outline-none"/><span className="text-2xl font-black text-slate-700 italic">€</span></div></div>
                                        <div className="flex items-center gap-3 p-3.5 bg-white/5 rounded-xl border border-white/5 cursor-pointer" onClick={() => setEditingVariant({ ...editingVariant, active: !editingVariant.active })}>
                                            <input type="checkbox" checked={editingVariant.active} readOnly className="w-5 h-5 rounded bg-surface-950 border-white/5 text-primary"/><span className="text-[10px] text-white font-bold uppercase tracking-widest">Variante Attiva</span>
                                        </div>
                                        <button onClick={handleUpdateVariant} className="w-full py-5 bg-primary text-surface-950 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg active:scale-95 transition-all">SALVA MODIFICHE</button>
                                    </div>
                                </div>
                            )}

                            {editingStaff && (
                                <div className="space-y-6">
                                    <div className="flex justify-between items-center mb-2"><h2 className="text-xl font-black italic uppercase">Modifica PIN: {editingStaff.name}</h2><button onClick={() => setEditingStaff(null)}><X size={20} /></button></div>
                                    <form onSubmit={handleUpdateStaffPin} className="space-y-4">
                                        <input type="password" required maxLength={6} value={newPin} onChange={e => setNewPin(e.target.value)} className="w-full bg-surface-950 border border-white/10 rounded-xl py-4 text-white font-black text-center text-lg outline-none" placeholder="NUOVO PIN"/>
                                        <input type="password" required maxLength={6} value={confirmPin} onChange={e => setConfirmPin(e.target.value)} className="w-full bg-surface-950 border border-white/10 rounded-xl py-4 text-white font-black text-center text-lg outline-none" placeholder="RIPETI PIN"/>
                                        {pinError && <p className="text-danger text-[9px] font-black text-center">{pinError}</p>}
                                        <button type="submit" className="w-full py-4 bg-primary text-surface-950 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg">AGGIURNA PIN</button>
                                    </form>
                                </div>
                            )}

                            {showClosingLoad && (
                                <div className="space-y-6">
                                    <div className="flex justify-between items-center mb-2"><h2 className="text-xl font-black italic uppercase">Chiusura Carico</h2><button onClick={() => setShowClosingLoad(false)}><X size={20} /></button></div>
                                    <div className="grid grid-cols-2 gap-3 mb-6">
                                        <div className="glass p-4 rounded-xl border-primary/20"><p className="text-[7px] text-primary font-black uppercase mb-1">Lordo</p><p className="text-xl font-black text-white tabular-nums">€{closingPreview?.gross_total?.toLocaleString('it-IT')}</p></div>
                                        <div className="glass p-4 rounded-xl border-danger/20"><p className="text-[7px] text-danger font-black uppercase mb-1">Spese</p><p className="text-xl font-black text-white tabular-nums">€{Number(closingSoldiSpesi).toLocaleString('it-IT')}</p></div>
                                    </div>
                                    <div className="space-y-3">
                                        <div className="space-y-1"><label className="text-[8px] text-slate-500 uppercase ml-1">Conferma Spese Durante Carico</label><input type="number" value={closingSoldiSpesi} onChange={(e) => setClosingSoldiSpesi(e.target.value)} className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-lg font-black italic text-white outline-none"/></div>
                                        <div className="space-y-1"><label className="text-[8px] text-slate-500 uppercase ml-1">Pezzi per Statistica U.</label><input type="number" required value={closingPezziComprati} onChange={(e) => setClosingPezziComprati(e.target.value)} className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-lg font-black italic text-white outline-none" placeholder="Esempio: 100"/></div>
                                    </div>
                                    <button onClick={handleConfirmClosingLoad} className="w-full py-5 bg-danger text-white rounded-2xl font-black text-sm italic uppercase tracking-tighter shadow-xl active:scale-95 transition-all">CONFERMA E ARCHIVIA</button>
                                </div>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* TOAST */}
            <AnimatePresence>
                {toast && (
                    <motion.div initial={{ opacity: 0, y: 50, x: '-50%' }} animate={{ opacity: 1, y: 0, x: '-50%' }} exit={{ opacity: 0, y: 50, x: '-50%' }} className={clsx("fixed bottom-24 left-1/2 z-[200] px-6 py-3 rounded-2xl font-black text-[9px] uppercase tracking-widest shadow-2xl flex items-center gap-3 border", toast.type === 'error' ? "bg-danger text-white border-white/10" : "bg-white text-surface-950 border-primary/10")}>
                        {toast.type === 'error' ? <AlertCircle size={14} /> : <Check size={14} className="text-success" />}
                        {toast.message}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
