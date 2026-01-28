import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { Staff, ProductVariant, StaffRole } from '../types/database';
import {
    Plus,
    Edit2 as Edit,
    Save,
    X,
    Package,
    DollarSign,
    ShieldCheck,
    Database,
    Camera,
    Lock,
    Trash2,
    Eye,
    EyeOff,
    Check,
    AlertCircle
} from 'lucide-react';
import { clsx } from 'clsx';

export const Admin: React.FC = () => {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<'stock' | 'spese' | 'dev'>('stock');
    const [staff, setStaff] = useState<Staff[]>([]);
    const [variants, setVariants] = useState<ProductVariant[]>([]);
    const [models, setModels] = useState<any[]>([]);
    const [flavors, setFlavors] = useState<any[]>([]);
    const [settings, setSettings] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    // Form states
    const [newModel, setNewModel] = useState('');
    const [newFlavor, setNewFlavor] = useState('');
    const [newVariant, setNewVariant] = useState({ model_id: '', flavor_id: '', default_price: 15, unit_cost: 0, initial_qty: 0 });
    const [editingVariant, setEditingVariant] = useState<any>(null);
    const [editingStaff, setEditingStaff] = useState<any>(null);
    const [showAddVariant, setShowAddVariant] = useState(false);
    // PIN management state
    const [newPin, setNewPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [showPin, setShowPin] = useState(false);
    const [pinError, setPinError] = useState('');
    const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);

    // New Features State
    const [showAddStaff, setShowAddStaff] = useState(false);
    const [newStaff, setNewStaff] = useState({ name: '', role: 'staff' as StaffRole, pin: '', confirmPin: '' });

    const [showClosingLoad, setShowClosingLoad] = useState(false);
    const [closingPreview, setClosingPreview] = useState<{ gross_total: number, reinvest_amount: number, net_total: number } | null>(null);

    const isAdmin = user?.role === 'admin';

    useEffect(() => {
        fetchData();
    }, [activeTab]);

    const fetchData = async () => {
        setLoading(true);
        const [modelsRes, flavorsRes, variantsRes, staffRes, settingsRes] = await Promise.all([
            supabase.from('product_models').select('*').order('name'),
            supabase.from('product_flavors').select('*').order('name'),
            supabase.from('product_variants').select('*, model:product_models(name), flavor:product_flavors(name), inventory(qty)'),
            supabase.from('staff').select('*').order('name'),
            supabase.from('settings').select('*').single()
        ]);

        if (modelsRes.data) setModels(modelsRes.data);
        if (flavorsRes.data) setFlavors(flavorsRes.data);
        if (variantsRes.data) setVariants(variantsRes.data.map((v: any) => ({
            ...v,
            model_name: v.model.name,
            flavor_name: v.flavor.name,
            qty: v.inventory?.qty || 0
        })));
        if (staffRes.data) setStaff(staffRes.data);
        if (settingsRes.data) setSettings(settingsRes.data);
        setLoading(false);
    };

    const handleAddModel = async () => {
        if (!newModel) return;
        const { error } = await supabase.from('product_models').insert({ name: newModel });
        if (!error) { setNewModel(''); fetchData(); }
    };

    const handleAddFlavor = async () => {
        if (!newFlavor) return;
        const { error } = await supabase.from('product_flavors').insert({ name: newFlavor });
        if (!error) { setNewFlavor(''); fetchData(); }
    };

    const handleDeleteModel = async (id: string) => {
        if (!confirm('Eliminando questo modello eliminerai anche tutte le varianti associate. Procedere?')) return;
        const { error } = await supabase.from('product_models').delete().eq('id', id);
        if (error) alert(error.message);
        else fetchData();
    };

    const handleDeleteFlavor = async (id: string) => {
        if (!confirm('Eliminando questo gusto eliminerai anche tutte le varianti associate. Procedere?')) return;
        const { error } = await supabase.from('product_flavors').delete().eq('id', id);
        if (error) alert(error.message);
        else fetchData();
    };

    const handleAddVariant = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newVariant.model_id || !newVariant.flavor_id) return;

        const { data, error } = await supabase
            .from('product_variants')
            .insert({
                model_id: newVariant.model_id,
                flavor_id: newVariant.flavor_id,
                default_price: newVariant.default_price,
                unit_cost: newVariant.unit_cost
            })
            .select()
            .single();

        if (error) alert(error.message);
        else {
            if (data) {
                await supabase.from('inventory').insert({ variant_id: data.id, qty: newVariant.initial_qty });
            }
            setShowAddVariant(false);
            setNewVariant({ model_id: '', flavor_id: '', default_price: 15, unit_cost: 0, initial_qty: 0 });
            fetchData();
        }
    };

    const handleDeleteVariant = async (id: string) => {
        if (!confirm('Eliminare questa variante?')) return;
        const { error } = await supabase.from('product_variants').delete().eq('id', id);
        if (error) alert(error.message);
        else fetchData();
    };

    const handleUpdateVariant = async (e: React.FormEvent) => {
        e.preventDefault();
        const { error } = await supabase
            .from('product_variants')
            .update({
                default_price: editingVariant.default_price,
                unit_cost: editingVariant.unit_cost,
                active: editingVariant.active
            })
            .eq('id', editingVariant.id);

        if (error) alert(error.message);
        else {
            // Update inventory manually if changed
            if (editingVariant.new_qty !== undefined) {
                await supabase.from('inventory').upsert({ variant_id: editingVariant.id, qty: editingVariant.new_qty });
            }
            setEditingVariant(null);
            fetchData();
        }
    };

    const handleUpdateSettings = async (e: React.FormEvent) => {
        e.preventDefault();
        const { error } = await supabase
            .from('settings')
            .update({
                money_spent_total: settings.money_spent_total,
                reinvest_mode: settings.reinvest_mode,
                reinvest_value: settings.reinvest_value
            })
            .eq('id', 1);

        if (!error) alert('Impostazioni salvate!');
    };

    const handleUpdateStaff = async (e: React.FormEvent) => {
        e.preventDefault();
        setPinError('');

        try {
            // Update role first
            const { error: roleError } = await supabase
                .from('staff')
                .update({ role: editingStaff.role })
                .eq('id', editingStaff.id);

            if (roleError) throw roleError;

            // Update PIN if provided (use RPC for secure hashing)
            if (newPin) {
                // Validate PIN
                if (!/^[0-9]{4,8}$/.test(newPin)) {
                    setPinError('Il PIN deve essere di 4-8 cifre numeriche');
                    return;
                }
                if (newPin !== confirmPin) {
                    setPinError('I PIN non corrispondono');
                    return;
                }

                const { error: pinError } = await supabase.rpc('update_staff_pin', {
                    p_staff_id: editingStaff.id,
                    p_new_pin: newPin
                });

                if (pinError) throw pinError;
            }

            showToast('Profilo aggiornato con successo', 'success');
            closeStaffModal();
            fetchData();
        } catch (err: any) {
            showToast(err.message || 'Errore durante il salvataggio', 'error');
        }
    };

    const handleDeletePin = async () => {
        if (!confirm('Sei sicuro di voler eliminare il PIN? Lo staff potrà accedere senza PIN.')) return;

        try {
            const { error } = await supabase.rpc('update_staff_pin', {
                p_staff_id: editingStaff.id,
                p_new_pin: null
            });

            if (error) throw error;

            showToast('PIN eliminato con successo', 'success');
            setEditingStaff({ ...editingStaff, has_pin: false });
            fetchData();
        } catch (err: any) {
            showToast(err.message || 'Errore durante eliminazione PIN', 'error');
        }
    };

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const handleDeleteStaff = async (id: string) => {
        if (!confirm('Sei sicuro di voler eliminare questo membro dello staff?')) return;

        try {
            const { error } = await supabase.from('staff').delete().eq('id', id);
            if (error) throw error;

            showToast('Staff eliminato con successo', 'success');
            fetchData();
        } catch (err: any) {
            showToast(err.message || 'Errore durante eliminazione', 'error');
        }
    };

    const handleAddStaff = async (e: React.FormEvent) => {
        e.preventDefault();
        setPinError('');

        if (newStaff.pin) {
            if (!/^[0-9]{4,6}$/.test(newStaff.pin)) {
                setPinError('Il PIN deve essere di 4-6 cifre numeriche');
                return;
            }
            if (newStaff.pin !== newStaff.confirmPin) {
                setPinError('I PIN non corrispondono');
                return;
            }
        }

        try {
            const { error } = await supabase.rpc('create_staff', {
                p_name: newStaff.name,
                p_role: newStaff.role,
                p_pin: newStaff.pin || null
            });

            if (error) throw error;

            showToast('Staff aggiunto con successo!', 'success');
            setShowAddStaff(false);
            setNewStaff({ name: '', role: 'staff', pin: '', confirmPin: '' });
            fetchData();
        } catch (err: any) {
            showToast(err.message || 'Errore durante la creazione dello staff', 'error');
        }
    };

    const handleClosingLoadClick = async () => {
        if (!settings?.last_reset_date) {
            showToast('Errore: Data di reset non trovata', 'error');
            return;
        }

        // Calculate preview values client-side for immediate feedback
        // Note: Real calculation happens in RPC, this is for user filtered view
        try {
            const { data: orders, error } = await supabase
                .from('orders')
                .select('gross_total')
                .gt('created_at', settings.last_reset_date); // > last_reset

            if (error) throw error;

            const gross = orders?.reduce((acc, curr) => acc + Number(curr.gross_total), 0) || 0;
            let reinvest = 0;

            if (settings.reinvest_mode === 'percentage') {
                reinvest = gross * (Number(settings.reinvest_value) / 100);
            } else {
                reinvest = Number(settings.reinvest_value);
            }

            // Reinvestment cannot exceed gross for this logic (visual only)
            if (reinvest > gross) reinvest = gross; // Visual clamp

            const net = gross - reinvest;

            setClosingPreview({
                gross_total: gross,
                reinvest_amount: reinvest,
                net_total: net
            });
            setShowClosingLoad(true);
        } catch (err: any) {
            showToast('Errore nel calcolo del pre-carico', 'error');
        }
    };

    const handleConfirmClosing = async () => {
        try {
            const { error } = await supabase.rpc('perform_closing_load');
            if (error) throw error;

            showToast('Carico effettuato e cassa resettata!', 'success');
            setShowClosingLoad(false);
            fetchData(); // Refresh all data
        } catch (err: any) {
            showToast(err.message || 'Errore durante il closing', 'error');
        }
    };

    const closeStaffModal = () => {
        setEditingStaff(null);
        setNewPin('');
        setConfirmPin('');
        setShowPin(false);
        setPinError('');
    };

    if (loading) return (
        <div className="flex items-center justify-center min-h-[60vh]">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
    );

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col gap-2">
                <h1 className="text-2xl md:text-3xl font-black tracking-tight uppercase">Admin & Dev Mode</h1>
                <p className="text-sm text-slate-500 font-bold uppercase tracking-widest">Pannello di controllo globale</p>
            </div>

            {/* Tabs - Scrollable on mobile */}
            <div className="overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
                <div className="flex p-1 bg-white/5 rounded-2xl w-max md:w-fit border border-white/5">
                    <button
                        onClick={() => setActiveTab('stock')}
                        className={clsx(
                            "px-4 md:px-6 py-2 md:py-2.5 rounded-xl font-black transition-all flex items-center gap-2 text-xs md:text-sm uppercase tracking-widest",
                            activeTab === 'stock' ? "bg-primary text-black" : "text-slate-500 hover:text-white"
                        )}
                    >
                        <Package size={16} />
                        <span>Stock</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('spese')}
                        className={clsx(
                            "px-4 md:px-6 py-2 md:py-2.5 rounded-xl font-black transition-all flex items-center gap-2 text-xs md:text-sm uppercase tracking-widest",
                            activeTab === 'spese' ? "bg-primary text-black" : "text-slate-500 hover:text-white"
                        )}
                    >
                        <DollarSign size={16} />
                        <span>Spese</span>
                    </button>
                    {isAdmin && (
                        <button
                            onClick={() => setActiveTab('dev')}
                            className={clsx(
                                "px-4 md:px-6 py-2 md:py-2.5 rounded-xl font-black transition-all flex items-center gap-2 text-xs md:text-sm uppercase tracking-widest",
                                activeTab === 'dev' ? "bg-red-500 text-white" : "text-slate-500 hover:text-white"
                            )}
                        >
                            <ShieldCheck size={16} />
                            <span>Staff</span>
                        </button>
                    )}
                </div>
            </div>

            <div className="animate-in fade-in slide-in-from-top-4 duration-500">
                {activeTab === 'stock' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Models & Flavors Mgmt */}
                        <div className="space-y-6">
                            <div className="glass rounded-[1.5rem] md:rounded-[2rem] p-5 md:p-6 border-white/5 space-y-4">
                                <h3 className="font-black text-base md:text-lg flex items-center gap-2 uppercase tracking-tight">
                                    <Database size={18} className="text-primary" />
                                    Modelli
                                </h3>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={newModel}
                                        onChange={e => setNewModel(e.target.value)}
                                        placeholder="Nuovo modello..."
                                        className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary/50 placeholder:text-slate-700"
                                    />
                                    <button onClick={handleAddModel} className="bg-primary text-black p-2.5 rounded-xl shadow-lg shadow-primary/20 active:scale-95 transition-transform">
                                        <Plus size={20} />
                                    </button>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {models.map(m => (
                                        <div key={m.id} className="flex items-center gap-1.5 px-3 py-1 bg-white/5 rounded-full text-[10px] md:text-xs border border-white/5 group font-bold">
                                            <span>{m.name}</span>
                                            <button
                                                onClick={() => handleDeleteModel(m.id)}
                                                className="opacity-40 group-hover:opacity-100 hover:text-red-500 transition-all ml-1"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="glass rounded-[1.5rem] md:rounded-[2rem] p-5 md:p-6 border-white/5 space-y-4">
                                <h3 className="font-black text-base md:text-lg flex items-center gap-2 uppercase tracking-tight">
                                    <Database size={18} className="text-primary" />
                                    Gusti
                                </h3>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={newFlavor}
                                        onChange={e => setNewFlavor(e.target.value)}
                                        placeholder="Nuovo gusto..."
                                        className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-primary/50 placeholder:text-slate-700"
                                    />
                                    <button onClick={handleAddFlavor} className="bg-primary text-black p-2.5 rounded-xl shadow-lg shadow-primary/20 active:scale-95 transition-transform">
                                        <Plus size={20} />
                                    </button>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {flavors.map(f => (
                                        <div key={f.id} className="flex items-center gap-1.5 px-3 py-1 bg-white/5 rounded-full text-[10px] md:text-xs border border-white/5 group font-bold">
                                            <span>{f.name}</span>
                                            <button
                                                onClick={() => handleDeleteFlavor(f.id)}
                                                className="opacity-40 group-hover:opacity-100 hover:text-red-500 transition-all ml-1"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Variants Listing */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between px-2">
                                <h3 className="font-bold text-lg uppercase tracking-widest text-slate-500">Varianti & Prezzi</h3>
                                <button
                                    onClick={() => setShowAddVariant(true)}
                                    className="p-2 bg-primary/10 text-primary rounded-xl hover:bg-primary hover:text-black transition-all"
                                    title="Nuova Variante"
                                >
                                    <Plus size={20} />
                                </button>
                            </div>

                            <div className="space-y-2 max-h-[60vh] md:max-h-[70vh] overflow-y-auto pr-1 md:pr-2 custom-scrollbar">
                                {variants.map(v => (
                                    <div key={v.id} className="glass rounded-xl md:rounded-2xl p-3 md:p-4 border border-white/5 flex items-center justify-between group">
                                        <div className="flex-1 overflow-hidden pr-2">
                                            <p className="font-black text-sm md:text-base truncate uppercase">{v.model_name}</p>
                                            <p className="text-[10px] md:text-xs text-slate-500 font-bold truncate">{v.flavor_name}</p>
                                        </div>
                                        <div className="flex items-center gap-2 md:gap-4 shrink-0">
                                            <div className="text-right">
                                                <p className="text-xs md:text-sm font-black text-white">€{Number(v.default_price).toFixed(0)}</p>
                                                <p className="text-[8px] md:text-[10px] text-slate-500 uppercase tracking-tighter font-black">Prezzo</p>
                                            </div>
                                            <div className="flex gap-1 md:gap-2">
                                                <button
                                                    onClick={() => setEditingVariant({ ...v, new_qty: v.qty })}
                                                    className="p-2 bg-white/5 rounded-lg md:rounded-xl hover:bg-primary hover:text-black transition-all active:scale-95"
                                                >
                                                    <Edit size={16} className="w-4 h-4 md:w-5 md:h-5" />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteVariant(v.id)}
                                                    className="p-2 bg-white/5 rounded-lg md:rounded-xl hover:bg-red-500 hover:text-white transition-all active:scale-95"
                                                >
                                                    <Trash2 size={16} className="w-4 h-4 md:w-5 md:h-5" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'spese' && (
                    <div className="max-w-xl mx-auto glass rounded-[2rem] md:rounded-[2.5rem] p-6 md:p-8 border-white/10 shadow-xl">
                        <div className="flex items-center gap-4 mb-8">
                            <div className="p-3 md:p-4 bg-primary/20 rounded-2xl text-primary">
                                <DollarSign size={32} className="w-6 h-6 md:w-8 md:h-8" />
                            </div>
                            <div>
                                <h3 className="text-xl md:text-2xl font-black tracking-tight uppercase leading-tight">Spese Globali</h3>
                                <p className="text-[10px] text-slate-500 uppercase tracking-widest font-black">Admin Management</p>
                            </div>
                        </div>

                        <form onSubmit={handleUpdateSettings} className="space-y-6 md:space-y-8">
                            <div className="space-y-3 md:space-y-4">
                                <label className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-500 ml-1">Guadagno netto totale</label>
                                <div className="relative">
                                    <span className="absolute left-6 top-1/2 -translate-y-1/2 text-xl md:text-2xl font-black text-emerald-500">€</span>
                                    <input
                                        type="text"
                                        readOnly
                                        value={settings?.total_net_earned?.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0,00'}
                                        className="w-full bg-emerald-500/10 border border-emerald-500/20 rounded-[1.25rem] md:rounded-[1.5rem] py-4 md:py-6 pl-14 pr-6 text-2xl md:text-4xl font-black text-emerald-500 focus:outline-none cursor-default"
                                    />
                                </div>
                            </div>

                            <div className="space-y-3 md:space-y-4">
                                <label className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 ml-1">Soldi spesi totali</label>
                                <div className="relative">
                                    <span className="absolute left-6 top-1/2 -translate-y-1/2 text-xl md:text-2xl font-black text-slate-500">€</span>
                                    <input
                                        type="number"
                                        step="1"
                                        value={settings?.money_spent_total || ''}
                                        onFocus={(e) => e.target.select()}
                                        onChange={e => setSettings({ ...settings, money_spent_total: e.target.value === '' ? 0 : Number(e.target.value) })}
                                        className="w-full bg-black/40 border border-white/10 rounded-[1.25rem] md:rounded-[1.5rem] py-4 md:py-6 pl-14 pr-6 text-2xl md:text-4xl font-black focus:outline-none focus:ring-4 focus:ring-primary/20 focus:border-primary transition-all"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Modalità Reinvest.</label>
                                    <select
                                        value={settings?.reinvest_mode}
                                        onChange={e => setSettings({ ...settings, reinvest_mode: e.target.value })}
                                        className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 font-bold text-sm focus:outline-none"
                                    >
                                        <option value="percentage">Percentuale (%)</option>
                                        <option value="fixed">Importo Fisso (€)</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Valore</label>
                                    <input
                                        type="number"
                                        value={settings?.reinvest_value || ''}
                                        onFocus={(e) => e.target.select()}
                                        onChange={e => setSettings({ ...settings, reinvest_value: e.target.value === '' ? 0 : Number(e.target.value) })}
                                        className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 font-bold text-sm focus:outline-none"
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                className="w-full py-4 md:py-5 bg-primary text-black font-black text-lg md:text-xl rounded-[1.25rem] md:rounded-[1.5rem] shadow-[0_10px_30px_rgba(34,211,238,0.2)] hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3 uppercase"
                            >
                                <Save size={24} className="w-5 h-5 md:w-6 md:h-6" />
                                SALVA MODIFICHE
                            </button>
                        </form>

                        <div className="mt-8 pt-8 border-t border-white/5">
                            <button
                                onClick={handleClosingLoadClick}
                                className="w-full py-4 md:py-5 bg-white/5 text-slate-300 font-black text-lg md:text-xl rounded-[1.25rem] md:rounded-[1.5rem] hover:bg-white/10 hover:text-white transition-all flex items-center justify-center gap-3 uppercase border-2 border-dashed border-white/10 hover:border-white/20"
                            >
                                <DollarSign size={24} className="w-5 h-5 md:w-6 md:h-6" />
                                NUOVO CARICO (CHIUSURA CASSA)
                            </button>
                        </div>
                    </div>
                )}

                {activeTab === 'dev' && isAdmin && (
                    <div className="space-y-8 max-w-4xl mx-auto">
                        <div className="flex items-center justify-between">
                            <h3 className="text-2xl font-bold flex items-center gap-3">
                                <ShieldCheck size={28} className="text-red-500" />
                                Gestione Staff
                            </h3>
                            <button
                                onClick={() => setShowAddStaff(true)}
                                className="flex items-center gap-2 px-6 py-3 bg-red-500 text-white font-bold rounded-2xl hover:bg-red-600 transition-all shadow-lg active:scale-95"
                            >
                                <Plus size={20} />
                                NUOVO STAFF
                            </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {staff.map(s => (
                                <div key={s.id} className="glass rounded-[1.5rem] md:rounded-3xl p-4 md:p-6 border border-white/5 flex items-center justify-between border-l-4 border-l-red-500/50">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 md:w-14 md:h-14 bg-red-500/10 rounded-2xl flex items-center justify-center text-red-500 font-black text-lg md:text-xl">
                                            {s.name[0]}
                                        </div>
                                        <div>
                                            <p className="text-base md:text-lg font-black uppercase tracking-tight">{s.name}</p>
                                            <p className="text-[9px] md:text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">{s.role}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setEditingStaff(s)}
                                            className="p-2 md:p-3 bg-white/5 rounded-xl md:rounded-2xl text-slate-400 hover:text-white"
                                        >
                                            <Edit size={20} className="w-5 h-5" />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteStaff(s.id)}
                                            className="p-2 md:p-3 bg-white/5 rounded-xl md:rounded-2xl text-slate-700 hover:text-red-500 transition-colors"
                                        >
                                            <Trash2 size={20} className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Edit Variant Modal */}
            {editingVariant && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 md:p-8 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="w-full max-w-lg glass-dark rounded-[2rem] md:rounded-[2.5rem] p-6 md:p-8 border border-white/10 shadow-2xl space-y-6 md:space-y-8 animate-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto custom-scrollbar">
                        <div className="flex justify-between items-start">
                            <div>
                                <h4 className="text-2xl font-black tracking-tight">{editingVariant.model_name}</h4>
                                <p className="text-primary font-bold">{editingVariant.flavor_name}</p>
                            </div>
                            <button onClick={() => setEditingVariant(null)} className="p-2 bg-white/5 rounded-full text-slate-500 hover:text-white">
                                <X size={24} />
                            </button>
                        </div>

                        <form onSubmit={handleUpdateVariant} className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Prezzo Default (€)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={editingVariant.default_price || ''}
                                        onFocus={(e) => e.target.select()}
                                        onChange={e => setEditingVariant({ ...editingVariant, default_price: e.target.value === '' ? 0 : Number(e.target.value) })}
                                        className="w-full bg-slate-900 border border-white/10 rounded-2xl py-4 px-4 font-black text-xl text-primary focus:border-primary/50 focus:outline-none"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Costo Unitario (€)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={editingVariant.unit_cost || ''}
                                        onFocus={(e) => e.target.select()}
                                        onChange={e => setEditingVariant({ ...editingVariant, unit_cost: e.target.value === '' ? 0 : Number(e.target.value) })}
                                        className="w-full bg-slate-900 border border-white/10 rounded-2xl py-4 px-4 font-black text-xl text-red-400 focus:border-red-500/50 focus:outline-none"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Quantità Inventario (Manuale)</label>
                                <input
                                    type="number"
                                    value={editingVariant.new_qty ?? ''}
                                    onFocus={(e) => e.target.select()}
                                    onChange={e => setEditingVariant({ ...editingVariant, new_qty: e.target.value === '' ? 0 : Number(e.target.value) })}
                                    className="w-full bg-slate-900 border border-white/10 rounded-2xl py-4 px-4 font-black text-xl text-white focus:border-white/20 focus:outline-none text-center"
                                />
                            </div>

                            <div className="flex items-center gap-3 p-4 bg-white/5 rounded-2xl border border-white/5">
                                <Camera size={20} className="text-slate-500" />
                                <span className="text-slate-400 text-sm font-bold flex-1">Media (Foto/Video)</span>
                                <button type="button" className="text-xs font-black text-primary px-3 py-1 bg-primary/10 rounded-full">Coming Soon</button>
                            </div>

                            <button
                                type="submit"
                                className="w-full py-5 bg-white text-black font-black text-xl rounded-2xl hover:bg-primary transition-all active:scale-[0.98] shadow-xl"
                            >
                                AGGIORNA VARIANTE
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit Staff Modal */}
            {editingStaff && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 md:p-8 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="w-full max-w-md glass-dark rounded-[2rem] md:rounded-[2.5rem] p-6 md:p-8 border border-white/10 shadow-2xl space-y-6 md:space-y-8 animate-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto custom-scrollbar">
                        <div className="flex justify-between items-start">
                            <div>
                                <h4 className="text-2xl font-black tracking-tight">{editingStaff.name}</h4>
                                <p className="text-red-500 font-bold tracking-widest uppercase text-xs">Modifica Profilo</p>
                            </div>
                            <button onClick={closeStaffModal} className="p-2 bg-white/5 rounded-full text-slate-500 hover:text-white">
                                <X size={24} />
                            </button>
                        </div>

                        <form onSubmit={handleUpdateStaff} className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Ruolo</label>
                                <select
                                    value={editingStaff.role}
                                    onChange={e => setEditingStaff({ ...editingStaff, role: e.target.value as StaffRole })}
                                    className="w-full bg-slate-900 border border-white/10 rounded-2xl py-4 px-4 font-bold text-white focus:outline-none"
                                >
                                    <option value="admin">Admin</option>
                                    <option value="staff">Staff</option>
                                    <option value="helper">Helper</option>
                                </select>
                            </div>

                            {/* PIN Management Section */}
                            <div className="space-y-4 pt-4 border-t border-white/5">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <span className="text-sm font-bold text-slate-400">Gestione PIN</span>
                                        {(editingStaff.has_pin || editingStaff.pin_hash) && (
                                            <span className="ml-2 text-[10px] px-2 py-0.5 bg-primary/20 text-primary rounded-full font-bold">PIN ATTIVO</span>
                                        )}
                                    </div>
                                    {(editingStaff.has_pin || editingStaff.pin_hash) && (
                                        <button
                                            type="button"
                                            onClick={handleDeletePin}
                                            className="text-xs text-red-400 hover:text-red-300 font-bold uppercase tracking-wider flex items-center gap-1"
                                        >
                                            <Trash2 size={14} />
                                            Elimina PIN
                                        </button>
                                    )}
                                </div>

                                <div className="space-y-3">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">
                                            {(editingStaff.has_pin || editingStaff.pin_hash) ? 'Nuovo PIN (4-8 cifre)' : 'Imposta PIN (4-8 cifre)'}
                                        </label>
                                        <div className="relative">
                                            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                                            <input
                                                type={showPin ? 'text' : 'password'}
                                                inputMode="numeric"
                                                placeholder="Lascia vuoto per non cambiare"
                                                value={newPin}
                                                onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                                                className="w-full bg-slate-900 border border-white/10 rounded-2xl py-4 pl-12 pr-12 text-center font-black tracking-[0.3em] text-xl focus:outline-none focus:border-primary/50"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPin(!showPin)}
                                                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                                            >
                                                {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
                                            </button>
                                        </div>
                                    </div>

                                    {newPin && (
                                        <div className="space-y-2 animate-in slide-in-from-top-2">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Conferma PIN</label>
                                            <div className="relative">
                                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                                                <input
                                                    type={showPin ? 'text' : 'password'}
                                                    inputMode="numeric"
                                                    placeholder="Ripeti PIN"
                                                    value={confirmPin}
                                                    onChange={e => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                                                    className={clsx(
                                                        "w-full bg-slate-900 border rounded-2xl py-4 pl-12 pr-12 text-center font-black tracking-[0.3em] text-xl focus:outline-none",
                                                        confirmPin && confirmPin === newPin ? "border-green-500/50" : confirmPin ? "border-red-500/50" : "border-white/10"
                                                    )}
                                                />
                                                {confirmPin && (
                                                    <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                                        {confirmPin === newPin ? (
                                                            <Check size={18} className="text-green-500" />
                                                        ) : (
                                                            <AlertCircle size={18} className="text-red-500" />
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {pinError && (
                                        <p className="text-red-400 text-xs font-bold text-center">{pinError}</p>
                                    )}
                                </div>
                            </div>

                            <button
                                type="submit"
                                className="w-full py-5 bg-red-500 text-white font-black text-xl rounded-2xl hover:bg-red-600 transition-all active:scale-[0.98] shadow-xl"
                            >
                                SALVA PROFILO
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Add Variant Modal */}
            {showAddVariant && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 md:p-8 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="w-full max-w-lg glass-dark rounded-[2rem] md:rounded-[2.5rem] p-6 md:p-8 border border-white/10 shadow-2xl space-y-6 md:space-y-8 animate-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto custom-scrollbar">
                        <div className="flex justify-between items-start">
                            <div>
                                <h4 className="text-2xl font-black tracking-tight">Nuova Variante</h4>
                                <p className="text-primary font-bold uppercase text-xs">Crea associazione Modello + Gusto</p>
                            </div>
                            <button onClick={() => setShowAddVariant(false)} className="p-2 bg-white/5 rounded-full text-slate-500 hover:text-white">
                                <X size={24} />
                            </button>
                        </div>

                        <form onSubmit={handleAddVariant} className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Modello</label>
                                <select
                                    value={newVariant.model_id}
                                    onChange={e => setNewVariant({ ...newVariant, model_id: e.target.value })}
                                    className="w-full bg-slate-900 border border-white/10 rounded-2xl py-4 px-4 font-bold text-white focus:outline-none focus:border-primary/50"
                                    required
                                >
                                    <option value="">Seleziona Modello...</option>
                                    {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                </select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Gusto</label>
                                <select
                                    value={newVariant.flavor_id}
                                    onChange={e => setNewVariant({ ...newVariant, flavor_id: e.target.value })}
                                    className="w-full bg-slate-900 border border-white/10 rounded-2xl py-4 px-4 font-bold text-white focus:outline-none focus:border-primary/50"
                                    required
                                >
                                    <option value="">Seleziona Gusto...</option>
                                    {flavors.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Prezzo Default (€)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={newVariant.default_price || ''}
                                        onFocus={(e) => e.target.select()}
                                        onChange={e => setNewVariant({ ...newVariant, default_price: e.target.value === '' ? 0 : Number(e.target.value) })}
                                        className="w-full bg-slate-900 border border-white/10 rounded-2xl py-4 px-4 font-black text-xl text-primary focus:border-primary/50 focus:outline-none"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Costo Unitario (€)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={newVariant.unit_cost || ''}
                                        onFocus={(e) => e.target.select()}
                                        onChange={e => setNewVariant({ ...newVariant, unit_cost: e.target.value === '' ? 0 : Number(e.target.value) })}
                                        className="w-full bg-slate-900 border border-white/10 rounded-2xl py-4 px-4 font-black text-xl text-red-400 focus:border-red-500/50 focus:outline-none"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Quantità Iniziale (Inventario)</label>
                                <input
                                    type="number"
                                    value={newVariant.initial_qty ?? ''}
                                    onFocus={(e) => e.target.select()}
                                    onChange={e => setNewVariant({ ...newVariant, initial_qty: e.target.value === '' ? 0 : Number(e.target.value) })}
                                    className="w-full bg-slate-900 border border-white/10 rounded-2xl py-4 px-4 font-black text-xl text-white focus:border-white/20 focus:outline-none text-center"
                                />
                            </div>

                            <button
                                type="submit"
                                className="w-full py-5 bg-primary text-black font-black text-xl rounded-2xl hover:bg-primary-dark transition-all active:scale-[0.98] shadow-xl"
                            >
                                CREA VARIANTE
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Add Staff Modal */}
            {showAddStaff && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 md:p-8 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="w-full max-w-md glass-dark rounded-[2rem] md:rounded-[2.5rem] p-6 md:p-8 border border-white/10 shadow-2xl space-y-6 md:space-y-8 animate-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto custom-scrollbar">
                        <div className="flex justify-between items-start">
                            <div>
                                <h4 className="text-2xl font-black tracking-tight">Nuovo Membro Staff</h4>
                                <p className="text-primary font-bold uppercase text-xs">Aggiungi al team</p>
                            </div>
                            <button onClick={() => setShowAddStaff(false)} className="p-2 bg-white/5 rounded-full text-slate-500 hover:text-white">
                                <X size={24} />
                            </button>
                        </div>

                        <form onSubmit={handleAddStaff} className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Nome*</label>
                                <input
                                    type="text"
                                    value={newStaff.name}
                                    onChange={e => setNewStaff({ ...newStaff, name: e.target.value })}
                                    className="w-full bg-slate-900 border border-white/10 rounded-2xl py-4 px-4 font-bold text-white focus:outline-none focus:border-primary/50"
                                    placeholder="Nome dello staff"
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Ruolo*</label>
                                <select
                                    value={newStaff.role}
                                    onChange={e => setNewStaff({ ...newStaff, role: e.target.value as StaffRole })}
                                    className="w-full bg-slate-900 border border-white/10 rounded-2xl py-4 px-4 font-bold text-white focus:outline-none"
                                >
                                    <option value="admin">Admin</option>
                                    <option value="staff">Staff</option>
                                    <option value="helper">Helper</option>
                                </select>
                            </div>

                            <div className="space-y-3 pt-4 border-t border-white/5">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">PIN (Opzionale)</label>
                                    <div className="relative">
                                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                                        <input
                                            type={showPin ? 'text' : 'password'}
                                            inputMode="numeric"
                                            placeholder="4-6 cifre"
                                            value={newStaff.pin}
                                            onChange={e => setNewStaff({ ...newStaff, pin: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                                            className="w-full bg-slate-900 border border-white/10 rounded-2xl py-4 pl-12 pr-12 text-center font-black tracking-[0.3em] text-xl focus:outline-none focus:border-primary/50"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPin(!showPin)}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                                        >
                                            {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
                                        </button>
                                    </div>
                                </div>
                                {newStaff.pin && (
                                    <div className="space-y-2 animate-in slide-in-from-top-2">
                                        <input
                                            type={showPin ? 'text' : 'password'}
                                            inputMode="numeric"
                                            placeholder="Conferma PIN"
                                            value={newStaff.confirmPin}
                                            onChange={e => setNewStaff({ ...newStaff, confirmPin: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                                            className={clsx(
                                                "w-full bg-slate-900 border rounded-2xl py-4 pl-12 pr-12 text-center font-black tracking-[0.3em] text-xl focus:outline-none",
                                                newStaff.confirmPin && newStaff.confirmPin === newStaff.pin ? "border-green-500/50" : newStaff.confirmPin ? "border-red-500/50" : "border-white/10"
                                            )}
                                        />
                                    </div>
                                )}
                            </div>

                            {pinError && (
                                <p className="text-red-400 text-xs font-bold text-center">{pinError}</p>
                            )}

                            <button
                                type="submit"
                                className="w-full py-5 bg-primary text-black font-black text-xl rounded-2xl hover:bg-primary-dark transition-all active:scale-[0.98] shadow-xl"
                            >
                                AGGIUNGI STAFF
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Closing Load Modal */}
            {showClosingLoad && closingPreview && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 md:p-8 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="w-full max-w-lg glass-dark rounded-[2rem] md:rounded-[2.5rem] p-6 md:p-8 border border-white/10 shadow-2xl space-y-8 animate-in zoom-in-95 duration-300">
                        <div className="text-center space-y-2">
                            <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center text-primary mx-auto mb-4">
                                <DollarSign size={32} />
                            </div>
                            <h4 className="text-2xl md:text-3xl font-black tracking-tight text-white">Nuovo Carico</h4>
                            <p className="text-slate-400 text-sm font-bold">Conferma chiusura cassa e reset sessione</p>
                        </div>

                        <div className="space-y-4 p-6 bg-white/5 rounded-[1.5rem] border border-white/5">
                            <div className="flex justify-between items-center">
                                <span className="text-slate-500 font-bold uppercase text-xs tracking-widest">Incasso Lordo</span>
                                <span className="text-xl font-black text-white">€{closingPreview.gross_total.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-center text-red-400">
                                <span className="font-bold uppercase text-xs tracking-widest">Reinvestimento</span>
                                <span className="text-xl font-black">- €{closingPreview.reinvest_amount.toFixed(2)}</span>
                            </div>
                            <div className="h-px bg-white/10 my-2"></div>
                            <div className="flex justify-between items-center">
                                <span className="text-primary font-bold uppercase text-xs tracking-widest">Incasso Netto</span>
                                <span className="text-3xl font-black text-primary">€{closingPreview.net_total.toFixed(2)}</span>
                            </div>
                        </div>

                        <div className="flex items-start gap-3 p-4 bg-orange-500/10 rounded-xl border border-orange-500/20">
                            <AlertCircle size={20} className="text-orange-500 mt-0.5 shrink-0" />
                            <p className="text-xs text-orange-200/80 leading-relaxed">
                                <strong>Attenzione:</strong> Questa azione salverà i dati nello storico, azzererà i totali della cassa e imposterà "Soldi Spesi" al valore del reinvestimento attuale (€{closingPreview.reinvest_amount.toFixed(2)}).
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <button
                                onClick={() => setShowClosingLoad(false)}
                                className="py-4 bg-white/5 text-white font-bold rounded-2xl hover:bg-white/10 transition-colors"
                            >
                                ANNULLA
                            </button>
                            <button
                                onClick={handleConfirmClosing}
                                className="py-4 bg-primary text-black font-black rounded-2xl hover:bg-primary-dark transition-transform active:scale-95 shadow-lg shadow-primary/20"
                            >
                                CONFERMA
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Toast Notification */}
            {toast && (
                <div className={clsx(
                    "fixed bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-2xl font-bold text-sm shadow-xl animate-in slide-in-from-bottom-4 fade-in duration-300",
                    toast.type === 'success' ? "bg-green-500 text-white" : "bg-red-500 text-white"
                )}>
                    <div className="flex items-center gap-2">
                        {toast.type === 'success' ? <Check size={18} /> : <AlertCircle size={18} />}
                        {toast.message}
                    </div>
                </div>
            )}
        </div>
    );
};
