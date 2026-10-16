import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/ToastProvider';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { safeNumber } from '../lib/money';
import type { Staff, ProductVariant, StaffRole, ProductModel, ProductFlavor, Settings, VariantWithMeta } from '../types/database';
import { Plus, Trash2, Shield, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';

type TabId = 'settings' | 'staff' | 'inventory_management' | 'products';

export const Admin: React.FC = () => {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [activeTab, setActiveTab] = useState<TabId>('settings');
    const [staff, setStaff] = useState<Staff[]>([]);
    const [variants, setVariants] = useState<VariantWithMeta[]>([]);
    const [models, setModels] = useState<ProductModel[]>([]);
    const [flavors, setFlavors] = useState<ProductFlavor[]>([]);
    const [settings, setSettings] = useState<Settings | null>(null);
    const [newModel, setNewModel] = useState('');
    const [newFlavor, setNewFlavor] = useState('');
    const [newVariant, setNewVariant] = useState({ model_id: '', flavor_id: '', default_price: 15, initial_qty: 0 });
    const [editingVariant, setEditingVariant] = useState<VariantWithMeta | null>(null);
    const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
    const [editingStaffRole, setEditingStaffRole] = useState<Staff | null>(null);
    const [showAddVariant, setShowAddVariant] = useState(false);
    const [newPin, setNewPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [pinError, setPinError] = useState('');
    const [showAddStaff, setShowAddStaff] = useState(false);
    const [newStaff, setNewStaff] = useState({ name: '', role: 'staff' as StaffRole, pin: '', confirmPin: '' });
    const [showClosingLoad, setShowClosingLoad] = useState(false);
    const [closingSoldiSpesi, setClosingSoldiSpesi] = useState('');
    const [closingPezziComprati, setClosingPezziComprati] = useState('');
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [confirmDeleteType, setConfirmDeleteType] = useState<'variant' | 'model' | 'flavor' | 'staff'>('variant');
    const [confirmDeleteLabel, setConfirmDeleteLabel] = useState('');

    const isAdmin = user?.role === 'admin';

    const fetchData = async () => {
        try {
            const [staffRes, variantsRes, modelsRes, flavorsRes, settingsRes, inventoryRes] = await Promise.all([
                supabase.from('staff').select('*').order('name'),
                supabase.from('product_variants').select('*, model:product_models(name), flavor:product_flavors(name)'),
                supabase.from('product_models').select('*').order('name'),
                supabase.from('product_flavors').select('*').order('name'),
                supabase.from('settings').select('*').single(),
                supabase.from('inventory').select('*')
            ]);
            if (staffRes.data) setStaff(staffRes.data);
            if (variantsRes.data) {
                const inventory = inventoryRes.data || [];
                type VariantRow = ProductVariant & { model?: { name: string } | null; flavor?: { name: string } | null; deleted?: boolean };
                const merged = (variantsRes.data as VariantRow[])
                    .filter((v) => !v.deleted)
                    .map((v) => ({
                        ...v, model_name: v.model?.name ?? '', flavor_name: v.flavor?.name ?? '', qty: inventory.find((i) => i.variant_id === v.id)?.qty ?? 0
                    }));
                merged.sort((a, b) => a.model_name.localeCompare(b.model_name) || a.flavor_name.localeCompare(b.flavor_name));
                setVariants(merged);
            }
            if (modelsRes.data) setModels(modelsRes.data);
            if (flavorsRes.data) setFlavors(flavorsRes.data);
            if (settingsRes.data) setSettings(settingsRes.data as Settings);
        } catch (error) {
            console.error('Admin load error:', error);
        }
    };

    useEffect(() => { if (isAdmin) { const t = setTimeout(() => void fetchData(), 0); return () => clearTimeout(t); } }, [isAdmin]);

    const handleUpdateSettings = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!settings) return;
        const { error } = await supabase.from('settings').update({ money_spent_total: settings.money_spent_total, money_spent_current_load: settings.money_spent_current_load }).eq('id', 1);
        if (error) showToast('Errore salvataggio', 'error'); else showToast('Impostazioni salvate');
    };

    const handleAddModel = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newModel.trim()) return;
        const nameUpper = newModel.trim().toUpperCase();
        const { error } = await supabase.rpc('add_product_model', { p_name: nameUpper });
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
        const { error } = await supabase.rpc('add_product_flavor', { p_name: nameUpper });
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
        if (error) showToast(error.message, 'error'); else { setShowAddVariant(false); setNewVariant({ model_id: '', flavor_id: '', default_price: 15, initial_qty: 0 }); fetchData(); showToast('Variante creata'); }
    };

    const handleUpdateVariant = async (v: VariantWithMeta) => {
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
        const { error } = await supabase.from('inventory').update({ qty: newQty }).eq('variant_id', variantId);
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
        if (!editingStaffRole) return;
        const { error } = await supabase.from('staff').update({ role: editingStaffRole.role }).eq('id', editingStaffRole.id);
        if (error) showToast('Errore aggiornamento ruolo', 'error');
        else { setEditingStaffRole(null); fetchData(); showToast('Ruolo aggiornato'); }
    };

    const handleAddStaff = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newStaff.pin !== newStaff.confirmPin) { setPinError('I PIN non corrispondono'); return; }
        const { error } = await supabase.rpc('create_staff', { p_name: newStaff.name.trim(), p_role: newStaff.role, p_pin: newStaff.pin });
        if (error) showToast(error.message, 'error');
        else { setShowAddStaff(false); setNewStaff({ name: '', role: 'staff', pin: '', confirmPin: '' }); setPinError(''); fetchData(); showToast('Membro aggiunto'); }
    };

    const handleUpdateStaffPin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newPin !== confirmPin) { setPinError('I PIN non corrispondono'); return; }
        if (!editingStaff) return;
        const { error } = await supabase.rpc('update_staff_pin', { p_staff_id: editingStaff.id, p_new_pin: newPin });
        if (error) showToast('Errore PIN: ' + error.message, 'error');
        else { setEditingStaff(null); setNewPin(''); setConfirmPin(''); setPinError(''); showToast('PIN aggiornato'); fetchData(); }
    };

    const handleConfirmClosingLoad = async () => {
        if (!closingSoldiSpesi || Number(closingSoldiSpesi) < 0) { showToast('Inserisci i soldi spesi per il carico', 'error'); return; }
        if (!closingPezziComprati || Number(closingPezziComprati) <= 0) { showToast('Inserisci i pezzi totali (> 0)', 'error'); return; }
        const soldiSpesi = Number(closingSoldiSpesi);
        const pezziComprati = Number(closingPezziComprati);
        await supabase.from('settings').update({ money_spent_total: soldiSpesi }).eq('id', 1);
        const { data, error } = await supabase.rpc('close_current_load', { p_soldi_spesi: soldiSpesi, p_pezzi_comprati: pezziComprati });
        if (error) { showToast(error.message, 'error'); } else {
            const unitCost = safeNumber(data?.unit_cost_calcolato) || (soldiSpesi / pezziComprati);
            setShowClosingLoad(false); setClosingSoldiSpesi(''); setClosingPezziComprati(''); fetchData();
            showToast(`Carico chiuso · costo unitario €${unitCost.toFixed(2)}`);
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

    const closeSheet = () => {
        setShowAddStaff(false); setShowAddVariant(false); setEditingVariant(null);
        setEditingStaff(null); setEditingStaffRole(null); setShowClosingLoad(false);
        setPinError('');
    };

    const sheetOpen = showAddStaff || showAddVariant || !!editingVariant || !!editingStaff || !!editingStaffRole || showClosingLoad;

    if (!isAdmin) return (
        <div className="ios-page items-center justify-center text-center" style={{ minHeight: '60vh' }}>
            <Shield size={36} className="mx-auto" style={{ color: '#C0392B' }} />
            <h1 className="ios-title-3 mt-3">Accesso vietato</h1>
            <p className="ios-footnote mt-1">Solo gli amministratori possono vedere questa pagina</p>
        </div>
    );

    const TABS: { id: TabId; label: string }[] = [
        { id: 'settings', label: 'Home' },
        { id: 'staff', label: 'Team' },
        { id: 'products', label: 'Catalogo' },
        { id: 'inventory_management', label: 'Stock' },
    ];

    return (
        <div className="ios-page">
            <div>
                <h1 className="ios-title-large">Admin</h1>
                <p className="ios-footnote mt-0.5">Gestione negozio, team e catalogo</p>
            </div>

            <div className="ios-segmented" role="tablist">
                {TABS.map(t => (
                    <button key={t.id} role="tab" aria-selected={activeTab === t.id} onClick={() => setActiveTab(t.id)}>
                        {t.label}
                    </button>
                ))}
            </div>

            {activeTab === 'settings' && (
                <div className="flex flex-col gap-3">
                    <div className="ios-card p-5">
                        <h3 className="ios-title-3">Chiudi carico</h3>
                        <p className="ios-footnote mt-0.5 mb-4">Archivia la sessione e azzera il magazzino</p>
                        <button onClick={() => { setClosingSoldiSpesi(''); setClosingPezziComprati(''); setShowClosingLoad(true); }} className="ios-btn w-full" style={{ background: '#C0392B' }}>
                            Avvia chiusura
                        </button>
                    </div>
                    <div className="ios-card p-5">
                        <h3 className="ios-title-3">Bilancio</h3>
                        <p className="ios-footnote mt-0.5">Utile netto ultimo carico</p>
                        <p className="ios-title-1 ios-amount mt-1" style={{ color: '#248A3D' }}>
                            €{(settings?.total_net_earned ?? 0).toLocaleString('it-IT')}
                        </p>
                        <form onSubmit={handleUpdateSettings} className="grid gap-2.5 mt-4">
                            <div>
                                <label className="ios-footnote block mb-1">Spese carico</label>
                                <input type="number" value={settings?.money_spent_total ?? ''} onChange={e => setSettings(prev => prev ? { ...prev, money_spent_total: Number(e.target.value) } : prev)} className="ios-input ios-amount" />
                            </div>
                            <div>
                                <label className="ios-footnote block mb-1">Spese durante il carico</label>
                                <input type="number" value={settings?.money_spent_current_load ?? ''} onChange={e => setSettings(prev => prev ? { ...prev, money_spent_current_load: Number(e.target.value) } : prev)} className="ios-input ios-amount" />
                            </div>
                            <button type="submit" className="ios-btn w-full" style={{ background: 'var(--surface-tertiary)', color: 'var(--accent)' }}>Salva</button>
                        </form>
                    </div>
                </div>
            )}

            {activeTab === 'staff' && (
                <div className="flex flex-col gap-3">
                    <button onClick={() => setShowAddStaff(true)} className="ios-btn ios-btn-filled w-full">
                        <Plus size={17} /> Aggiungi membro
                    </button>
                    <div className="ios-grouped">
                        {staff.map((s) => (
                            <div key={s.id} className="ios-row" style={{ minHeight: 60 }}>
                                <div className="w-10 h-10 rounded-full flex items-center justify-center font-semibold shrink-0" style={{ background: s.role === 'admin' ? '#C2703D' : 'var(--label)', color: 'var(--surface-secondary)' }}>
                                    {s.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="ios-headline text-[15px] truncate">{s.name}</p>
                                    <p className="ios-caption capitalize">{s.role}</p>
                                </div>
                                <button onClick={() => setEditingStaffRole({ ...s })} className="ios-press ios-footnote px-2.5 py-1.5 rounded-lg" style={{ background: 'var(--accent-tint)', color: 'var(--accent)' }}>Ruolo</button>
                                <button onClick={() => { setEditingStaff(s); setNewPin(''); setConfirmPin(''); setPinError(''); }} className="ios-press ios-footnote px-2.5 py-1.5 rounded-lg" style={{ background: 'var(--surface-tertiary)', color: 'var(--label)' }}>PIN</button>
                                <button onClick={() => { setConfirmDeleteId(s.id); setConfirmDeleteType('staff'); setConfirmDeleteLabel(s.name); }} className="ios-press p-2" style={{ color: '#C0392B' }} aria-label="Elimina membro"><Trash2 size={16} /></button>
                            </div>
                        ))}
                    </div>
                    {staff.length === 0 && <EmptyState title="Nessun membro" />}
                </div>
            )}

            {activeTab === 'products' && (
                <div className="flex flex-col gap-5">
                    <section>
                        <h2 className="ios-footnote px-1 mb-1.5">MODELLI · {models.filter(m => !m.deleted && m.active !== false).length}</h2>
                        <form onSubmit={handleAddModel} className="flex gap-2 mb-2">
                            <input type="text" value={newModel} onChange={e => setNewModel(e.target.value)} placeholder="Nuovo modello" className="ios-input flex-1" />
                            <button type="submit" className="ios-btn ios-btn-filled shrink-0" aria-label="Aggiungi modello"><Plus size={18} /></button>
                        </form>
                        <div className="ios-grouped">
                            {models.filter(m => !m.deleted && m.active !== false).map(m => (
                                <div key={m.id} className="ios-row">
                                    <span className="ios-headline text-[15px] flex-1 truncate">{m.name}</span>
                                    <button onClick={() => { setConfirmDeleteId(m.id); setConfirmDeleteType('model'); setConfirmDeleteLabel(m.name); }} className="ios-press p-2" style={{ color: '#C0392B' }} aria-label="Elimina modello"><Trash2 size={15} /></button>
                                </div>
                            ))}
                        </div>
                    </section>
                    <section>
                        <h2 className="ios-footnote px-1 mb-1.5">GUSTI · {flavors.filter(f => !f.deleted && f.active !== false).length}</h2>
                        <form onSubmit={handleAddFlavor} className="flex gap-2 mb-2">
                            <input type="text" value={newFlavor} onChange={e => setNewFlavor(e.target.value)} placeholder="Nuovo gusto" className="ios-input flex-1" />
                            <button type="submit" className="ios-btn shrink-0" style={{ background: '#C2703D' }} aria-label="Aggiungi gusto"><Plus size={18} /></button>
                        </form>
                        <div className="ios-grouped">
                            {flavors.filter(f => !f.deleted && f.active !== false).map(f => (
                                <div key={f.id} className="ios-row">
                                    <span className="ios-subhead flex-1 truncate">{f.name}</span>
                                    <button onClick={() => { setConfirmDeleteId(f.id); setConfirmDeleteType('flavor'); setConfirmDeleteLabel(f.name); }} className="ios-press p-2" style={{ color: '#C0392B' }} aria-label="Elimina gusto"><Trash2 size={15} /></button>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>
            )}

            {activeTab === 'inventory_management' && (
                <div className="flex flex-col gap-3">
                    <button onClick={() => setShowAddVariant(true)} className="ios-btn ios-btn-filled w-full">
                        <Plus size={17} /> Nuova variante
                    </button>
                    {variants.length === 0 ? (
                        <EmptyState title="Nessuna variante" subtitle="Creane una con il pulsante sopra" />
                    ) : (
                        <div className="ios-grouped">
                            {variants.map((v) => (
                                <div key={v.id} className="ios-row" style={{ minHeight: 64, opacity: v.active ? 1 : 0.5 }}>
                                    <div className="flex-1 min-w-0">
                                        <p className="ios-headline text-[15px] truncate">{v.model_name} <span className="ios-footnote">· {v.flavor_name}</span></p>
                                        <p className="ios-caption">€{Number(v.default_price).toFixed(2)}{!v.active ? ' · non attiva' : ''}</p>
                                    </div>
                                    <div className="flex items-center gap-2 rounded-xl px-1.5 py-1 shrink-0" style={{ background: 'var(--surface-tertiary)' }}>
                                        <button onClick={() => handleUpdateQty(v.id, Math.max(0, (v.qty || 0) - 1))} className="ios-press w-7 h-7 rounded-lg flex items-center justify-center text-[16px]" style={{ background: 'var(--surface-secondary)' }} aria-label="Meno">−</button>
                                        <span className="ios-headline ios-amount text-[15px] w-7 text-center">{v.qty || 0}</span>
                                        <button onClick={() => handleUpdateQty(v.id, (v.qty || 0) + 1)} className="ios-press w-7 h-7 rounded-lg flex items-center justify-center text-[16px]" style={{ background: 'var(--surface-secondary)' }} aria-label="Più">+</button>
                                    </div>
                                    <button onClick={() => setEditingVariant({ ...v })} className="ios-press ios-footnote px-2.5 py-1.5 rounded-lg shrink-0" style={{ background: 'var(--accent-tint)', color: 'var(--accent)' }}>Prezzo</button>
                                    <button onClick={() => { setConfirmDeleteId(v.id); setConfirmDeleteType('variant'); setConfirmDeleteLabel(`${v.model_name} ${v.flavor_name}`); }} className="ios-press p-1.5 shrink-0" style={{ color: '#C0392B' }} aria-label="Elimina variante"><Trash2 size={15} /></button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Sheet unificato */}
            <AnimatePresence>
                {sheetOpen && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-4" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={closeSheet}>
                        <motion.div
                            initial={{ y: 48 }} animate={{ y: 0 }} exit={{ y: 48 }}
                            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                            onClick={(e) => e.stopPropagation()}
                            className="ios-sheet w-full sm:max-w-md p-5 pb-8"
                        >
                            <div className="ios-grabber" />
                            <div className="flex items-center justify-between mt-1 mb-4">
                                <h2 className="ios-title-3">
                                    {showAddStaff ? 'Nuovo membro' : showAddVariant ? 'Nuova variante' : editingVariant ? 'Modifica variante' : editingStaffRole ? 'Ruolo' : editingStaff ? `PIN · ${editingStaff.name}` : 'Chiudi carico'}
                                </h2>
                                <button onClick={closeSheet} className="ios-press p-2 -mr-2" style={{ color: 'var(--label-tertiary)' }} aria-label="Chiudi"><X size={20} /></button>
                            </div>

                            {showAddStaff && (
                                <form onSubmit={handleAddStaff} className="grid gap-2.5">
                                    <input required value={newStaff.name} onChange={e => setNewStaff({ ...newStaff, name: e.target.value })} className="ios-input" placeholder="Nome" />
                                    <select value={newStaff.role} onChange={e => setNewStaff({ ...newStaff, role: e.target.value as StaffRole })} className="ios-input">
                                        <option value="staff">Staff</option><option value="helper">Helper</option><option value="admin">Admin</option>
                                    </select>
                                    <div className="grid grid-cols-2 gap-2.5">
                                        <input type="password" required maxLength={8} value={newStaff.pin} onChange={e => setNewStaff({ ...newStaff, pin: e.target.value })} className="ios-input text-center" placeholder="PIN" inputMode="numeric" />
                                        <input type="password" required maxLength={8} value={newStaff.confirmPin} onChange={e => setNewStaff({ ...newStaff, confirmPin: e.target.value })} className="ios-input text-center" placeholder="Ripeti PIN" inputMode="numeric" />
                                    </div>
                                    {pinError && <p className="ios-footnote text-center" style={{ color: '#C0392B' }}>{pinError}</p>}
                                    <button type="submit" className="ios-btn ios-btn-filled w-full">Aggiungi</button>
                                </form>
                            )}

                            {showAddVariant && (
                                <form onSubmit={handleAddVariant} className="grid gap-2.5">
                                    <select required value={newVariant.model_id} onChange={e => setNewVariant({ ...newVariant, model_id: e.target.value })} className="ios-input">
                                        <option value="">Modello…</option>{models.filter(m => !m.deleted && m.active !== false).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                    </select>
                                    <select required value={newVariant.flavor_id} onChange={e => setNewVariant({ ...newVariant, flavor_id: e.target.value })} className="ios-input">
                                        <option value="">Gusto…</option>{flavors.filter(f => !f.deleted && f.active !== false).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                    </select>
                                    <div className="grid grid-cols-2 gap-2.5">
                                        <div><label className="ios-footnote block mb-1">Prezzo €</label>
                                            <input type="number" required value={newVariant.default_price} onChange={e => setNewVariant({ ...newVariant, default_price: Number(e.target.value) })} className="ios-input ios-amount text-center" /></div>
                                        <div><label className="ios-footnote block mb-1">Quantità</label>
                                            <input type="number" required value={newVariant.initial_qty} onChange={e => setNewVariant({ ...newVariant, initial_qty: Number(e.target.value) })} className="ios-input ios-amount text-center" /></div>
                                    </div>
                                    <button type="submit" className="ios-btn ios-btn-filled w-full">Crea</button>
                                </form>
                            )}

                            {editingVariant && (
                                <div className="grid gap-3">
                                    <div>
                                        <label className="ios-footnote block mb-1">Prezzo €</label>
                                        <input type="number" value={editingVariant.default_price} onChange={e => setEditingVariant({ ...editingVariant, default_price: Number(e.target.value) })} className="ios-input ios-amount text-center" style={{ fontSize: 24, fontWeight: 700 }} />
                                    </div>
                                    <button onClick={() => setEditingVariant({ ...editingVariant, active: !editingVariant.active })} className="ios-press flex items-center justify-between p-3.5 rounded-2xl" style={{ background: 'var(--surface-tertiary)' }}>
                                        <span className="ios-headline text-[15px]">Variante attiva</span>
                                        <span className="ios-press inline-flex rounded-full p-0.5" style={{ width: 51, background: editingVariant.active ? '#2F7D4F' : 'var(--surface-tertiary)', border: '1px solid var(--separator)', justifyContent: editingVariant.active ? 'flex-end' : 'flex-start' }}>
                                            <span className="rounded-full" style={{ width: 27, height: 27, background: '#fff', boxShadow: 'var(--ios-shadow-sm)' }} />
                                        </span>
                                    </button>
                                    <button onClick={() => handleUpdateVariant(editingVariant)} className="ios-btn ios-btn-filled w-full">Salva</button>
                                </div>
                            )}

                            {editingStaffRole && (
                                <form onSubmit={handleUpdateStaffRole} className="grid gap-2">
                                    {(['admin', 'staff', 'helper'] as StaffRole[]).map(role => (
                                        <button type="button" key={role} onClick={() => setEditingStaffRole({ ...editingStaffRole, role })}
                                            className="ios-press flex items-center gap-3 p-3.5 rounded-2xl text-left"
                                            style={editingStaffRole.role === role ? { background: 'var(--accent-tint)', border: '1px solid var(--accent)' } : { background: 'var(--surface-tertiary)' }}>
                                            <span className="ios-headline text-[15px] capitalize flex-1">{role}</span>
                                            {editingStaffRole.role === role && <Badge variant="primary" size="xs">Attivo</Badge>}
                                        </button>
                                    ))}
                                    <button type="submit" className="ios-btn ios-btn-filled w-full mt-1">Salva ruolo</button>
                                </form>
                            )}

                            {editingStaff && (
                                <form onSubmit={handleUpdateStaffPin} className="grid gap-2.5">
                                    <input type="password" required maxLength={8} value={newPin} onChange={e => setNewPin(e.target.value)} className="ios-input text-center" placeholder="Nuovo PIN" inputMode="numeric" style={{ fontSize: 20 }} />
                                    <input type="password" required maxLength={8} value={confirmPin} onChange={e => setConfirmPin(e.target.value)} className="ios-input text-center" placeholder="Ripeti PIN" inputMode="numeric" style={{ fontSize: 20 }} />
                                    {pinError && <p className="ios-footnote text-center" style={{ color: '#C0392B' }}>{pinError}</p>}
                                    <button type="submit" className="ios-btn ios-btn-filled w-full">Aggiorna PIN</button>
                                </form>
                            )}

                            {showClosingLoad && (
                                <div className="grid gap-2.5">
                                    <p className="ios-footnote">Archivia la sessione e azzera il magazzino.</p>
                                    <div><label className="ios-footnote block mb-1">Soldi spesi (€)</label>
                                        <input type="number" step="0.01" value={closingSoldiSpesi} onChange={e => setClosingSoldiSpesi(e.target.value)} className="ios-input ios-amount text-center" placeholder="0.00" style={{ fontSize: 22, fontWeight: 700 }} /></div>
                                    <div><label className="ios-footnote block mb-1">Pezzi comprati</label>
                                        <input type="number" value={closingPezziComprati} onChange={e => setClosingPezziComprati(e.target.value)} className="ios-input ios-amount text-center" placeholder="0" style={{ fontSize: 22, fontWeight: 700 }} /></div>
                                    <button onClick={handleConfirmClosingLoad} className="ios-btn w-full text-white mt-1" style={{ background: '#C0392B' }}>Conferma chiusura</button>
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
                title="Eliminare?"
                message={`Vuoi eliminare "${confirmDeleteLabel}"?`}
                variant="danger" confirmLabel="Elimina" />
        </div>
    );
};
