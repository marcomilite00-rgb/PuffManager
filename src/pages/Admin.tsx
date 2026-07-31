import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/ToastProvider';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import type { Staff, ProductVariant, StaffRole, Inventory } from '../types/database';
import {
    Plus, X, Package, Trash2, Check, TrendingUp, AlertCircle, DollarSign,
    Users, Settings, LayoutGrid, Key, Shield, ArrowUpRight, Lock
} from 'lucide-react';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';

export const Admin: React.FC = () => {
    const { user } = useAuth();
    const { showToast } = useToast();
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
    const [editingStaffRole, setEditingStaffRole] = useState<any>(null);
    const [showAddVariant, setShowAddVariant] = useState(false);
    const [newPin, setNewPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [pinError, setPinError] = useState('');
    const [showAddStaff, setShowAddStaff] = useState(false);
    const [newStaff, setNewStaff] = useState({ name: '', role: 'staff' as StaffRole, pin: '', confirmPin: '' });
    const [showClosingLoad, setShowClosingLoad] = useState(false);
    const [closingSoldiSpesi, setClosingSoldiSpesi] = useState('');
    const [closingPezziComprati, setClosingPezziComprati] = useState('');
    const [, setClosingLoading] = useState(false);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [confirmDeleteType, setConfirmDeleteType] = useState<'variant' | 'model' | 'flavor' | 'staff'>('variant');
    const [confirmDeleteLabel, setConfirmDeleteLabel] = useState('');

    const isAdmin = user?.role === 'admin';

    useEffect(() => { if (isAdmin) fetchData(); }, [isAdmin]);

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
            const merged = variantsRes.data.filter((v: any) => !v.deleted).map((v: any) => {
                const inv = (inventoryRes.data || []).find((i: any) => i.variant_id === v.id);
                return { ...v, model_name: v.model?.name ?? '', flavor_name: v.flavor?.name ?? '', qty: inv ? inv.qty : 0 };
            });
            merged.sort((a: any, b: any) => a.model_name.localeCompare(b.model_name) || a.flavor_name.localeCompare(b.flavor_name));
            setVariants(merged);
        }
        if (modelsRes.data) setModels(modelsRes.data);
        if (flavorsRes.data) setFlavors(flavorsRes.data);
        if (settingsRes.data) setSettings(settingsRes.data);
        setLoading(false);
    };

    const handleUpdateSettings = async (e: React.FormEvent) => {
        e.preventDefault();
        const { error } = await supabase.from('settings').update({ money_spent_total: settings.money_spent_total, money_spent_current_load: settings.money_spent_current_load }).eq('id', 1);
        if (error) showToast('Errore salvataggio', 'error'); else showToast('Impostazioni salvate');
    };

    const handleAddModel = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newModel.trim()) return;
        const nameUpper = newModel.trim().toUpperCase();
        const { data, error } = await supabase.rpc('add_product_model', { p_name: nameUpper });
        if (error) {
            if (error.message?.includes('function') || error.code === '42883') {
                const { error: insertErr } = await supabase.from('product_models').insert({ name: nameUpper }).select();
                if (insertErr) showToast('Errore modello: ' + insertErr.message, 'error');
                else { setNewModel(''); fetchData(); showToast('Modello aggiunto'); }
            } else if (error.message?.includes('duplicate') || error.code === '23505') showToast('Modello già esistente', 'error');
            else showToast('Errore modello: ' + error.message, 'error');
        } else { setNewModel(''); fetchData(); showToast('Modello aggiunto'); }
    };

    const handleAddFlavor = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newFlavor.trim()) return;
        const nameUpper = newFlavor.trim().toUpperCase();
        const { data, error } = await supabase.rpc('add_product_flavor', { p_name: nameUpper });
        if (error) {
            if (error.message?.includes('function') || error.code === '42883') {
                const { error: insertErr } = await supabase.from('product_flavors').insert({ name: nameUpper }).select();
                if (insertErr) showToast('Errore gusto: ' + insertErr.message, 'error');
                else { setNewFlavor(''); fetchData(); showToast('Gusto aggiunto'); }
            } else if (error.message?.includes('duplicate') || error.code === '23505') showToast('Gusto già esistente', 'error');
            else showToast('Errore gusto: ' + error.message, 'error');
        } else { setNewFlavor(''); fetchData(); showToast('Gusto aggiunto'); }
    };

    const handleAddVariant = async (e: React.FormEvent) => {
        e.preventDefault();
        const { error } = await supabase.rpc('create_product_variant', { p_model_id: newVariant.model_id, p_flavor_id: newVariant.flavor_id, p_default_price: newVariant.default_price, p_initial_qty: newVariant.initial_qty });
        if (error) showToast(error.message, 'error'); else { setShowAddVariant(false); fetchData(); showToast('Variante creata'); }
    };

    const handleUpdateVariant = async (v: any) => {
        const { error } = await supabase.from('product_variants').update({ default_price: v.default_price, active: v.active }).eq('id', v.id);
        if (error) showToast('Errore aggiornamento', 'error'); else { setEditingVariant(null); fetchData(); showToast('Variante aggiornata'); }
    };

    const handleDeleteVariant = async (id: string) => {
        const { error } = await supabase.from('product_variants').delete().eq('id', id);
        if (error) {
            const { error: updateError } = await supabase.from('product_variants').update({ deleted: true, active: false }).eq('id', id);
            if (updateError) showToast('Errore eliminazione variante', 'error'); else { fetchData(); showToast('Variante eliminata'); }
        } else { fetchData(); showToast('Variante eliminata'); }
        setConfirmDeleteId(null);
    };

    const handleUpdateQty = async (variantId: string, newQty: number) => {
        const { error } = await supabase.from('inventory').update({ qty: newQty, initial_load_qty: newQty }).eq('variant_id', variantId);
        if (error) showToast('Errore aggiornamento quantità: ' + error.message, 'error');
        else { setVariants(prev => prev.map(v => v.id === variantId ? { ...v, qty: newQty } : v)); }
    };

    const handleDeleteStaff = async (id: string) => {
        await supabase.from('reservations').update({ created_by_staff_id: null }).eq('created_by_staff_id', id);
        await supabase.from('orders').update({ sold_by_staff_id: null }).eq('sold_by_staff_id', id);
        await supabase.from('reminders').update({ created_by_staff_id: null }).eq('created_by_staff_id', id);
        await supabase.from('audit_log').update({ staff_id: null }).eq('staff_id', id);
        await supabase.from('archived_loads').update({ created_by: null }).eq('created_by', id);
        await supabase.from('staff_sessions').delete().eq('staff_id', id);
        const { error } = await supabase.from('staff').delete().eq('id', id);
        if (error) showToast('Errore: ' + error.message, 'error'); else { fetchData(); showToast('Membro rimosso'); }
        setConfirmDeleteId(null);
    };

    const handleUpdateStaffRole = async (e: React.FormEvent) => {
        e.preventDefault();
        const { error } = await supabase.from('staff').update({ role: editingStaffRole.role }).eq('id', editingStaffRole.id);
        if (error) showToast('Errore aggiornamento ruolo', 'error');
        else { setEditingStaffRole(null); fetchData(); showToast('Ruolo aggiornato'); }
    };

    const handleAddStaff = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newStaff.pin !== newStaff.confirmPin) { setPinError('PIN non corrispondono'); return; }
        const { error } = await supabase.rpc('create_staff', { p_name: newStaff.name.trim(), p_role: newStaff.role, p_pin: newStaff.pin });
        if (error) showToast(error.message, 'error');
        else { setShowAddStaff(false); setNewStaff({ name: '', role: 'staff', pin: '', confirmPin: '' }); setPinError(''); fetchData(); showToast('Staff aggiunto'); }
    };

    const handleUpdateStaffPin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newPin !== confirmPin) { setPinError('PIN non corrispondono'); return; }
        const { error } = await supabase.rpc('update_staff_pin', { p_staff_id: editingStaff.id, p_new_pin: newPin });
        if (error) showToast('Errore PIN: ' + error.message, 'error');
        else { setEditingStaff(null); setNewPin(''); setConfirmPin(''); setPinError(''); showToast('PIN aggiornato'); fetchData(); }
    };

    const handleClosingLoadClick = () => {
        setClosingSoldiSpesi('');
        setClosingPezziComprati('');
        setShowClosingLoad(true);
    };

    const handleConfirmClosingLoad = async () => {
        if (!closingSoldiSpesi || Number(closingSoldiSpesi) < 0) { showToast('Inserire i soldi spesi per il carico', 'error'); return; }
        if (!closingPezziComprati || Number(closingPezziComprati) <= 0) { showToast('Inserire i pezzi totali comprati (> 0)', 'error'); return; }
        const soldiSpesi = Number(closingSoldiSpesi);
        const pezziComprati = Number(closingPezziComprati);
        setClosingLoading(true);
        await supabase.from('settings').update({ money_spent_total: soldiSpesi }).eq('id', 1);
        const { data, error } = await supabase.rpc('close_current_load', { p_soldi_spesi: soldiSpesi, p_pezzi_comprati: pezziComprati });
        if (error) { showToast(error.message, 'error'); setClosingLoading(false); } else {
            const unitCost = data?.unit_cost_calcolato ?? (soldiSpesi / pezziComprati);
            setShowClosingLoad(false); fetchData();
            showToast(`Carico chiuso ✓ Prezzo unit.: €${Number(unitCost).toFixed(2)}`);
            setClosingLoading(false);
        }
    };

    const handleDeleteModel = async (id: string) => {
        const { error } = await supabase.from('product_models').delete().eq('id', id);
        if (error) {
            const { error: updateError } = await supabase.from('product_models').update({ deleted: true, active: false }).eq('id', id);
            if (updateError) showToast('Errore eliminazione modello', 'error');
            else { await supabase.from('product_variants').update({ deleted: true, active: false }).eq('model_id', id); fetchData(); showToast('Modello eliminato'); }
        } else { fetchData(); showToast('Modello eliminato'); }
        setConfirmDeleteId(null);
    };

    const handleDeleteFlavor = async (id: string) => {
        const { error } = await supabase.from('product_flavors').delete().eq('id', id);
        if (error) {
            const { error: updateError } = await supabase.from('product_flavors').update({ deleted: true, active: false }).eq('id', id);
            if (updateError) showToast('Errore eliminazione gusto', 'error');
            else { await supabase.from('product_variants').update({ deleted: true, active: false }).eq('flavor_id', id); fetchData(); showToast('Gusto eliminato'); }
        } else { fetchData(); showToast('Gusto eliminato'); }
        setConfirmDeleteId(null);
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
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="min-h-0 bg-surface-950 overflow-x-hidden">
            <header className="px-2 md:px-6 py-2 md:py-4 bg-white/[0.02] border-b border-white/5 sticky top-0 z-40 backdrop-blur-3xl overflow-hidden">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-end gap-2 md:gap-6 relative z-10">
                    <div>
                        <h1 className="text-lg md:text-4xl font-black italic tracking-tighter text-white uppercase leading-none">
                            Admin<span className="text-primary not-italic">.</span>
                        </h1>
                        <p className="label-caps text-[7px] md:text-[8px] text-slate-600 tracking-widest mt-0.5 uppercase font-bold opacity-70">Infrastructure</p>
                    </div>
                    <div className="flex p-0.5 bg-white/5 rounded-xl border border-white/5 gap-0.5 w-full md:w-auto overflow-x-auto">
                        {[
                            { id: 'settings', label: 'Home', icon: Settings },
                            { id: 'staff', label: 'Team', icon: Users },
                            { id: 'products', label: 'Catalog', icon: LayoutGrid },
                            { id: 'inventory_management', label: 'Inventory', icon: Package },
                        ].map((tab) => (
                            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
                                className={clsx("flex items-center gap-1 px-3 py-1.5 md:px-4 md:py-2 rounded-lg font-black label-caps text-[7px] md:text-[9px] transition-all whitespace-nowrap uppercase tracking-widest shrink-0",
                                    activeTab === tab.id ? "bg-primary text-surface-950 shadow-lg shadow-primary/20" : "text-slate-500 hover:text-white")}>
                                <tab.icon size={12} /> {tab.label}
                            </button>
                        ))}
                    </div>
                </div>
            </header>

            <div className="max-w-7xl mx-auto px-2 md:px-6 py-3 md:py-6">
                {/* TAB: DASHBOARD */}
                {activeTab === 'settings' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-6">
                        <div className="glass rounded-2xl md:rounded-3xl p-5 md:p-8 border-white/5 bg-surface-900/40 relative overflow-hidden group">
                            <div className="absolute -inset-1 bg-gradient-to-r from-danger/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 rounded-[inherit] pointer-events-none" />
                            <div className="relative z-10 space-y-4">
                                <div className="w-10 h-10 md:w-12 md:h-12 bg-danger/20 rounded-xl flex items-center justify-center text-danger">
                                    <TrendingUp size={20} />
                                </div>
                                <div>
                                    <h3 className="text-lg md:text-3xl font-black italic text-white uppercase">Chiudi Carico</h3>
                                    <p className="text-slate-500 text-[10px] md:text-sm mt-0.5 md:mt-1 max-w-xs">Sincronizza e archivia la sessione corrente.</p>
                                </div>
                                <button onClick={handleClosingLoadClick}
                                    className="w-full py-3.5 md:py-4 bg-danger text-white font-black text-[9px] md:text-xs rounded-xl md:rounded-2xl uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-danger/20 active:scale-95 transition-transform hover:bg-danger-dark">
                                    <ArrowUpRight size={14} /> AVVIA CHIUSURA CARICO
                                </button>
                            </div>
                        </div>

                        <div className="glass rounded-2xl md:rounded-3xl p-5 md:p-8 border-white/5 space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 md:w-10 md:h-10 bg-success/20 rounded-xl flex items-center justify-center text-success"><DollarSign size={16} /></div>
                                <h3 className="text-base md:text-2xl font-black italic uppercase">Bilancio</h3>
                            </div>
                            <div className="p-4 md:p-5 bg-black/40 border border-success/20 rounded-2xl">
                                <p className="text-[8px] md:text-[9px] font-black text-success/70 uppercase tracking-widest mb-0.5">Utile Netto (ultimo carico chiuso)</p>
                                <p className="text-2xl md:text-5xl font-black text-success italic tabular-nums">
                                    €{(settings?.total_net_earned ?? 0).toLocaleString('it-IT')}
                                </p>
                            </div>
                            <form onSubmit={handleUpdateSettings} className="space-y-2.5">
                                <div className="space-y-0.5">
                                    <label className="text-[7px] md:text-[8px] font-black uppercase text-danger/80 ml-1 tracking-widest">Spese Carico</label>
                                    <input type="number" value={settings?.money_spent_total ?? ''}
                                        onChange={e => setSettings({ ...settings, money_spent_total: Number(e.target.value) })}
                                        className="w-full bg-black/40 border border-danger/20 rounded-xl py-2.5 md:py-3 px-4 font-black text-xs md:text-sm text-white outline-none focus:border-danger/50 transition-all" />
                                </div>
                                <div className="space-y-0.5">
                                    <label className="text-[7px] md:text-[8px] font-black uppercase text-warning/80 ml-1 tracking-widest">Spese Durante Carico</label>
                                    <input type="number" value={settings?.money_spent_current_load ?? ''}
                                        onChange={e => setSettings({ ...settings, money_spent_current_load: Number(e.target.value) })}
                                        className="w-full bg-black/40 border border-warning/20 rounded-xl py-2.5 md:py-3 px-4 font-black text-xs md:text-sm text-white outline-none focus:border-warning/50 transition-all" />
                                </div>
                                <button type="submit" className="w-full py-2.5 md:py-3 bg-white/5 border border-white/5 rounded-xl text-white font-black text-[8px] md:text-[9px] uppercase tracking-widest hover:bg-white/10 transition-colors">SALVA DATI</button>
                            </form>
                        </div>
                    </div>
                )}

                {/* TAB: STAFF */}
                {activeTab === 'staff' && (
                    <div className="space-y-4">
                        <div className="flex justify-between items-center gap-4">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 md:w-10 md:h-10 bg-primary/20 rounded-xl flex items-center justify-center text-primary"><Users size={16} /></div>
                                <h3 className="text-base md:text-2xl font-black italic uppercase">Organigramma</h3>
                            </div>
                            <button onClick={() => setShowAddStaff(true)}
                                className="px-4 py-2 md:px-5 md:py-3 bg-primary text-surface-950 font-black rounded-xl text-[8px] md:text-[9px] uppercase tracking-widest shadow-lg shadow-primary/20 active:scale-95 transition-all hover:shadow-xl">
                                <Plus size={12} className="inline mr-1" /> AGGIUNGI
                            </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 md:gap-4">
                            {staff.map((s) => (
                                <div key={s.id} className="p-4 md:p-5 glass rounded-2xl border-white/5 relative overflow-hidden group bg-surface-900/30">
                                    <div className="flex justify-between items-start mb-3">
                                        <div className={clsx("w-8 h-8 md:w-10 md:h-10 rounded-xl flex items-center justify-center font-black text-sm md:text-lg border",
                                            s.role === 'admin' ? 'bg-warning/20 text-warning border-warning/20' :
                                            s.role === 'staff' ? 'bg-primary/20 text-primary border-primary/20' :
                                            'bg-white/5 text-slate-500 border-white/5')}>
                                            {s.name[0]}
                                        </div>
                                        <div className="flex gap-1.5 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => setEditingStaffRole({ ...s })} className="p-2 text-slate-500 hover:text-primary bg-white/5 rounded-lg" title="Modifica ruolo"><Shield size={12} /></button>
                                            <button onClick={() => setEditingStaff(s)} className="p-2 text-slate-500 hover:text-white bg-white/5 rounded-lg" title="Modifica PIN"><Key size={12} /></button>
                                            <button onClick={() => { setConfirmDeleteId(s.id); setConfirmDeleteType('staff'); setConfirmDeleteLabel(s.name); }} className="p-2 text-danger/60 hover:text-danger bg-white/5 rounded-lg" title="Elimina"><Trash2 size={12} /></button>
                                        </div>
                                    </div>
                                    <p className="font-black text-white text-lg uppercase italic truncate leading-none mb-1">{s.name}</p>
                                    <span className={clsx("label-caps text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md",
                                        s.role === 'admin' ? 'bg-warning/10 text-warning' :
                                        s.role === 'staff' ? 'bg-primary/10 text-primary' : 'bg-white/5 text-slate-500')}>{s.role}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* TAB: CATALOG */}
                {activeTab === 'products' && (
                    <div className="space-y-6">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 md:w-10 md:h-10 bg-primary/20 rounded-xl flex items-center justify-center text-primary"><LayoutGrid size={16} /></div>
                            <h3 className="text-base md:text-2xl font-black italic uppercase">Catalogo</h3>
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <p className="label-caps text-[9px] text-primary font-black uppercase flex justify-between items-center group px-1">
                                    <span>MODELLI HARDWARE</span>
                                    <span className="opacity-40 italic">{models.filter(m => !m.deleted && m.active !== false).length} ITEMS</span>
                                </p>
                                <form onSubmit={handleAddModel} className="flex gap-2">
                                    <input type="text" value={newModel} onChange={e => setNewModel(e.target.value)} placeholder="Nuovo modello..."
                                        className="flex-1 bg-surface-900 border border-white/5 rounded-xl px-4 py-2.5 md:px-5 md:py-3 text-white font-bold italic text-[10px] md:text-xs outline-none focus:border-primary/40 transition-all" />
                                    <button type="submit" className="w-10 h-10 md:w-12 md:h-12 bg-primary text-surface-950 rounded-xl flex items-center justify-center shadow-lg active:scale-95 transition-all" aria-label="Aggiungi"><Plus size={16} /></button>
                                </form>
                                <div className="grid grid-cols-1 gap-1.5">
                                    {models.filter(m => !m.deleted && m.active !== false).map(m => (
                                        <div key={m.id} className="p-3.5 bg-white/[0.03] border border-white/5 rounded-xl flex items-center justify-between group hover:bg-white/5">
                                            <span className="font-black text-white italic tracking-tight uppercase text-xs">{m.name}</span>
                                            <button onClick={() => { setConfirmDeleteId(m.id); setConfirmDeleteType('model'); setConfirmDeleteLabel(m.name); }} className="p-1.5 text-danger/50 hover:text-danger transition-all" aria-label="Elimina"><Trash2 size={14} /></button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="space-y-4">
                                <p className="label-caps text-[9px] text-secondary font-black uppercase flex justify-between items-center group px-1">
                                    <span>LIBRERIA AROMI</span>
                                    <span className="opacity-40 italic">{flavors.filter(f => !f.deleted && f.active !== false).length} GUSTI</span>
                                </p>
                                <form onSubmit={handleAddFlavor} className="flex gap-2">
                                    <input type="text" value={newFlavor} onChange={e => setNewFlavor(e.target.value)} placeholder="Nuovo gusto..."
                                        className="flex-1 bg-surface-900 border border-white/5 rounded-xl px-4 py-2.5 md:px-5 md:py-3 text-white font-bold italic text-[10px] md:text-xs outline-none focus:border-secondary/40 transition-all" />
                                    <button type="submit" className="w-10 h-10 md:w-12 md:h-12 bg-secondary text-white rounded-xl flex items-center justify-center shadow-lg active:scale-95 transition-all" aria-label="Aggiungi"><Plus size={16} /></button>
                                </form>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                    {flavors.filter(f => !f.deleted && f.active !== false).map(f => (
                                        <div key={f.id} className="p-3 bg-white/[0.02] border border-white/5 rounded-xl flex items-center justify-between group hover:bg-white/5">
                                            <span className="font-bold text-slate-400 text-[10px] uppercase italic break-words pr-1 leading-tight">{f.name}</span>
                                            <button onClick={() => { setConfirmDeleteId(f.id); setConfirmDeleteType('flavor'); setConfirmDeleteLabel(f.name); }} className="p-1 text-danger/40 hover:text-danger shrink-0" aria-label="Elimina"><Trash2 size={12} /></button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* TAB: INVENTORY */}
                {activeTab === 'inventory_management' && (
                    <div className="space-y-4">
                        <div className="flex justify-between items-center gap-4">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 md:w-10 md:h-10 bg-warning/20 rounded-xl flex items-center justify-center text-warning"><Package size={16} /></div>
                                <h3 className="text-base md:text-2xl font-black italic uppercase">Assets</h3>
                            </div>
                            <button onClick={() => setShowAddVariant(true)}
                                className="px-4 py-2 md:px-5 md:py-3 bg-warning text-surface-950 font-black rounded-xl text-[8px] md:text-[9px] uppercase tracking-widest shadow-lg active:scale-95 transition-all">
                                <Plus size={12} className="inline mr-1" /> VARIANTE
                            </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-4">
                            {variants.length === 0 && (
                                <div className="col-span-full py-20 text-center text-slate-500 font-bold uppercase tracking-widest text-xs">
                                    Nessuna variante trovata. Creane una con il pulsante VARIANTE.
                                </div>
                            )}
                            {variants.map((v) => (
                                <div key={v.id} className={`p-4 md:p-5 glass rounded-2xl border-white/5 hover:border-warning/20 transition-all group relative bg-surface-900/30 ${!v.active ? 'opacity-40' : ''}`}>
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="min-w-0 pr-2">
                                            <div className="flex items-center gap-2">
                                                <p className="font-black text-white text-sm md:text-base uppercase italic leading-none truncate">{v.model_name}</p>
                                                {!v.active && <span className="bg-danger/20 text-danger text-[7px] font-black uppercase px-1.5 py-0.5 rounded tracking-widest shrink-0">Inattivo</span>}
                                            </div>
                                            <p className="label-caps text-[7px] md:text-[8px] text-warning font-bold tracking-widest mt-1 opacity-80 uppercase italic truncate">{v.flavor_name}</p>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="text-base md:text-lg font-black text-white italic leading-none tabular-nums">€{v.default_price}</p>
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-3">
                                        <div className="flex items-center justify-between bg-black/40 border border-white/5 rounded-xl px-3 py-1.5 md:px-4 md:py-2">
                                            <span className="text-[9px] md:text-[10px] font-black text-slate-500 uppercase">Stock</span>
                                            <div className="flex items-center gap-2 md:gap-3">
                                                <button onClick={() => handleUpdateQty(v.id, Math.max(0, (v.qty || 0) - 1))} className="w-7 h-7 md:w-8 md:h-8 flex items-center justify-center bg-white/5 rounded-lg hover:bg-white/10 active:scale-90 transition-all text-xs md:text-sm font-black" aria-label="Diminuisci stock">-</button>
                                                <input type="number" value={v.qty || 0} onChange={(e) => handleUpdateQty(v.id, parseInt(e.target.value) || 0)} className="w-10 md:w-12 bg-transparent text-center font-black text-white outline-none tabular-nums" />
                                                <button onClick={() => handleUpdateQty(v.id, (v.qty || 0) + 1)} className="w-7 h-7 md:w-8 md:h-8 flex items-center justify-center bg-white/5 rounded-lg hover:bg-white/10 active:scale-90 transition-all text-xs md:text-sm font-black" aria-label="Aumenta stock">+</button>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between pt-3 border-t border-white/5">
                                            <button onClick={() => setEditingVariant({ ...v })} className="px-4 py-1.5 md:px-5 md:py-2 bg-white/5 border border-white/10 rounded-lg text-[8px] md:text-[9px] font-black uppercase text-white hover:bg-white/10 transition-all">MODIFICA</button>
                                            <button onClick={() => { setConfirmDeleteId(v.id); setConfirmDeleteType('variant'); setConfirmDeleteLabel(`${v.model_name} ${v.flavor_name}`); }} className="p-1.5 md:p-2 text-danger/60 hover:text-danger shrink-0" aria-label="Elimina"><Trash2 size={12} /></button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* MODALS */}
            <AnimatePresence>
                {(showAddStaff || showAddVariant || editingVariant || editingStaff || editingStaffRole || showClosingLoad) && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
                        <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
                            className="glass w-full max-w-md rounded-3xl p-8 md:p-12 border-white/10">

                            {showAddStaff && (
                                <div className="space-y-6">
                                    <div className="flex justify-between items-center mb-2"><h2 className="text-xl font-black italic uppercase">Nuovo Staff</h2><button onClick={() => setShowAddStaff(false)} aria-label="Chiudi"><X size={20} /></button></div>
                                    <form onSubmit={handleAddStaff} className="space-y-4">
                                        <input required value={newStaff.name} onChange={e => setNewStaff({ ...newStaff, name: e.target.value })} className="w-full bg-surface-950 border border-white/5 rounded-xl px-5 py-3.5 text-white font-bold italic outline-none" placeholder="Nome..." />
                                        <select value={newStaff.role} onChange={e => setNewStaff({ ...newStaff, role: e.target.value as StaffRole })}
                                            className="w-full bg-surface-950 border border-white/5 rounded-xl px-5 py-3.5 text-white font-bold outline-none">
                                            <option value="staff">Staff</option><option value="helper">Helper</option><option value="admin">Admin</option>
                                        </select>
                                        <div className="grid grid-cols-2 gap-3">
                                            <input type="password" required maxLength={6} value={newStaff.pin} onChange={e => setNewStaff({ ...newStaff, pin: e.target.value })}
                                                className="bg-surface-950 border border-white/5 rounded-xl py-3 px-2 text-white font-black text-center outline-none" placeholder="PIN" inputMode="numeric" />
                                            <input type="password" required maxLength={6} value={newStaff.confirmPin} onChange={e => setNewStaff({ ...newStaff, confirmPin: e.target.value })}
                                                className="bg-surface-950 border border-white/5 rounded-xl py-3 px-2 text-white font-black text-center outline-none" placeholder="RE-PIN" inputMode="numeric" />
                                        </div>
                                        {pinError && <p className="text-danger text-[9px] font-black text-center">{pinError}</p>}
                                        <button type="submit" className="w-full py-4 bg-primary text-surface-950 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg active:scale-95 transition-all">AUTORIZZA STAFF</button>
                                    </form>
                                </div>
                            )}

                            {showAddVariant && (
                                <div className="space-y-6">
                                    <div className="flex justify-between items-center mb-2"><h2 className="text-xl font-black italic uppercase">Nuova Variante</h2><button onClick={() => setShowAddVariant(false)} aria-label="Chiudi"><X size={20} /></button></div>
                                    <form onSubmit={handleAddVariant} className="space-y-4 text-xs">
                                        <select required value={newVariant.model_id} onChange={e => setNewVariant({ ...newVariant, model_id: e.target.value })}
                                            className="w-full bg-surface-950 border border-white/5 rounded-xl px-4 py-3 text-white font-bold">
                                            <option value="">Scegli Modello...</option>{models.filter(m => !m.deleted && m.active !== false).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                        </select>
                                        <select required value={newVariant.flavor_id} onChange={e => setNewVariant({ ...newVariant, flavor_id: e.target.value })}
                                            className="w-full bg-surface-950 border border-white/5 rounded-xl px-4 py-3 text-white font-bold">
                                            <option value="">Scegli Gusto...</option>{flavors.filter(f => !f.deleted && f.active !== false).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                        </select>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-1"><label className="text-[8px] text-slate-500 uppercase ml-1">Prezzo Default</label>
                                                <input type="number" required value={newVariant.default_price} onChange={e => setNewVariant({ ...newVariant, default_price: Number(e.target.value) })}
                                                    className="w-full bg-surface-950 border border-white/5 rounded-xl px-4 py-3 text-white font-black" /></div>
                                            <div className="space-y-1"><label className="text-[8px] text-slate-500 uppercase ml-1">Initial Qty</label>
                                                <input type="number" required value={newVariant.initial_qty} onChange={e => setNewVariant({ ...newVariant, initial_qty: Number(e.target.value) })}
                                                    className="w-full bg-surface-950 border border-white/5 rounded-xl px-4 py-3 text-white font-black" /></div>
                                        </div>
                                        <button type="submit" className="w-full py-4 bg-warning text-surface-950 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg">CREA VARIANTE</button>
                                    </form>
                                </div>
                            )}

                            {editingVariant && (
                                <div className="space-y-6">
                                    <div className="flex justify-between items-center mb-1">
                                        <div><h2 className="text-xl font-black italic uppercase leading-tight">{editingVariant.model_name}</h2><p className="text-[9px] text-warning font-bold uppercase italic">{editingVariant.flavor_name}</p></div>
                                        <button onClick={() => setEditingVariant(null)} aria-label="Chiudi"><X size={20} /></button>
                                    </div>
                                    <div className="space-y-5">
                                        <div className="space-y-1.5"><label className="text-[8px] text-slate-500 uppercase ml-1">Cambia Prezzo Default</label>
                                            <div className="flex items-center gap-3"><input type="number" value={editingVariant.default_price}
                                                onChange={e => setEditingVariant({ ...editingVariant, default_price: Number(e.target.value) })}
                                                className="flex-1 bg-surface-950 border border-white/5 rounded-xl px-6 py-4 text-white font-black italic text-2xl outline-none" /><span className="text-2xl font-black text-slate-700 italic">€</span></div></div>
                                        <div className="flex items-center gap-3 p-3.5 bg-white/5 rounded-xl border border-white/5 cursor-pointer"
                                            onClick={() => setEditingVariant({ ...editingVariant, active: !editingVariant.active })}>
                                            <div className={clsx("w-5 h-5 rounded flex items-center justify-center transition-all", editingVariant.active ? "bg-primary" : "bg-white/10")}>
                                                {editingVariant.active && <Check size={12} className="text-surface-950" />}
                                            </div>
                                            <span className="text-[10px] text-white font-bold uppercase tracking-widest">Variante Attiva</span>
                                        </div>
                                        <button onClick={() => handleUpdateVariant(editingVariant)} className="w-full py-5 bg-primary text-surface-950 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg active:scale-95 transition-all">SALVA MODIFICHE</button>
                                    </div>
                                </div>
                            )}

                            {editingStaffRole && (
                                <div className="space-y-6">
                                    <div className="flex justify-between items-center mb-2">
                                        <div><h2 className="text-xl font-black italic uppercase">Modifica Ruolo</h2><p className="text-[9px] text-slate-500 mt-0.5">{editingStaffRole.name}</p></div>
                                        <button onClick={() => setEditingStaffRole(null)} aria-label="Chiudi"><X size={20} /></button>
                                    </div>
                                    <form onSubmit={handleUpdateStaffRole} className="space-y-4">
                                        {(['admin', 'staff', 'helper'] as StaffRole[]).map(role => (
                                            <label key={role} className={clsx("flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all",
                                                editingStaffRole.role === role ? 'border-primary/40 bg-primary/10' : 'border-white/5 bg-white/[0.02] hover:bg-white/5')}>
                                                <div className={clsx("w-5 h-5 rounded-full flex items-center justify-center transition-all", editingStaffRole.role === role ? "bg-primary" : "bg-white/10")}>
                                                    {editingStaffRole.role === role && <div className="w-2 h-2 rounded-full bg-surface-950" />}
                                                </div>
                                                <div>
                                                    <p className="font-black text-white uppercase text-sm">{role}</p>
                                                    <p className="text-[9px] text-slate-500">
                                                        {role === 'admin' ? 'Accesso completo + chiusura carico' :
                                                            role === 'staff' ? 'Vendite, ordini e inventario' : 'Solo prenotazioni e incassi'}
                                                    </p>
                                                </div>
                                            </label>
                                        ))}
                                        <button type="submit" className="w-full py-4 bg-primary text-surface-950 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg mt-2">SALVA RUOLO</button>
                                    </form>
                                </div>
                            )}

                            {editingStaff && (
                                <div className="space-y-6">
                                    <div className="flex justify-between items-center mb-2"><h2 className="text-xl font-black italic uppercase">Modifica PIN: {editingStaff.name}</h2><button onClick={() => setEditingStaff(null)} aria-label="Chiudi"><X size={20} /></button></div>
                                    <form onSubmit={handleUpdateStaffPin} className="space-y-4">
                                        <input type="password" required maxLength={6} value={newPin} onChange={e => setNewPin(e.target.value)}
                                            className="w-full bg-surface-950 border border-white/10 rounded-xl py-4 text-white font-black text-center text-lg outline-none" placeholder="NUOVO PIN" inputMode="numeric" />
                                        <input type="password" required maxLength={6} value={confirmPin} onChange={e => setConfirmPin(e.target.value)}
                                            className="w-full bg-surface-950 border border-white/10 rounded-xl py-4 text-white font-black text-center text-lg outline-none" placeholder="RIPETI PIN" inputMode="numeric" />
                                        {pinError && <p className="text-danger text-[9px] font-black text-center">{pinError}</p>}
                                        <button type="submit" className="w-full py-4 bg-primary text-surface-950 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg">AGGIORNA PIN</button>
                                    </form>
                                </div>
                            )}

                            {showClosingLoad && (
                                <div className="space-y-5">
                                    <div className="flex justify-between items-center">
                                        <h2 className="text-xl font-black italic uppercase">Chiudi Carico</h2>
                                        <button onClick={() => setShowClosingLoad(false)} aria-label="Chiudi"><X size={20} /></button>
                                    </div>
                                    <p className="text-[10px] text-slate-500">Inserisci i dati del carico per sincronizzare e archiviare la sessione.</p>
                                    <div className="space-y-4">
                                        <div className="space-y-1">
                                            <label className="text-[8px] text-danger/80 uppercase font-black ml-1 tracking-widest">Soldi Spesi (€)</label>
                                            <input type="number" step="0.01" value={closingSoldiSpesi} onChange={e => setClosingSoldiSpesi(e.target.value)}
                                                className="w-full bg-surface-950 border border-danger/20 rounded-xl py-4 px-5 text-white font-black text-lg outline-none focus:border-danger/50 transition-all" placeholder="0.00" />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[8px] text-primary/80 uppercase font-black ml-1 tracking-widest">Pezzi Comprati</label>
                                            <input type="number" value={closingPezziComprati} onChange={e => setClosingPezziComprati(e.target.value)}
                                                className="w-full bg-surface-950 border border-primary/20 rounded-xl py-4 px-5 text-white font-black text-lg outline-none focus:border-primary/50 transition-all" placeholder="0" />
                                        </div>
                                        <div className="flex gap-3 pt-2">
                                            <button onClick={() => setShowClosingLoad(false)} className="flex-1 py-4 bg-white/5 rounded-xl text-slate-400 font-bold text-xs uppercase tracking-widest hover:text-white transition-colors">Annulla</button>
                                            <button onClick={handleConfirmClosingLoad} className="flex-1 py-4 bg-gradient-to-r from-primary to-secondary text-white font-black rounded-xl text-xs uppercase tracking-widest shadow-lg active:scale-95 transition-all">CONFERMA CHIUSURA</button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <ConfirmModal isOpen={!!confirmDeleteId} onClose={() => setConfirmDeleteId(null)}
                onConfirm={() => {
                    if (!confirmDeleteId) return;
                    if (confirmDeleteType === 'variant') handleDeleteVariant(confirmDeleteId);
                    else if (confirmDeleteType === 'model') handleDeleteModel(confirmDeleteId);
                    else if (confirmDeleteType === 'flavor') handleDeleteFlavor(confirmDeleteId);
                    else if (confirmDeleteType === 'staff') handleDeleteStaff(confirmDeleteId);
                }}
                title={`Elimina ${confirmDeleteType}`}
                message={`Sei sicuro di voler eliminare "${confirmDeleteLabel}"?`}
                variant="danger" confirmLabel="Elimina" />
        </motion.div>
    );
};
