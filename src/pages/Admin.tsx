import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/ToastProvider';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { safeNumber } from '../lib/money';
import { SpatialToggle } from '../components/ui/SpatialToggle';
import type {
  Staff,
  ProductVariant,
  StaffRole,
  ProductModel,
  ProductFlavor,
  Settings,
  VariantWithMeta,
} from '../types/database';
import {
  Plus,
  Trash2,
  Shield,
  X,
  Settings as SettingsIcon,
  Users,
  Layers,
  Boxes,
  KeyRound,
  UserCheck,
  Check,
  AlertOctagon,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { cn } from '../lib/cn';

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
  const [newVariant, setNewVariant] = useState({
    model_id: '',
    flavor_id: '',
    default_price: 15,
    initial_qty: 0,
  });
  const [editingVariant, setEditingVariant] = useState<VariantWithMeta | null>(null);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [editingStaffRole, setEditingStaffRole] = useState<Staff | null>(null);
  const [showAddVariant, setShowAddVariant] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [newStaff, setNewStaff] = useState({
    name: '',
    role: 'staff' as StaffRole,
    pin: '',
    confirmPin: '',
  });
  const [showClosingLoad, setShowClosingLoad] = useState(false);
  const [closingSoldiSpesi, setClosingSoldiSpesi] = useState('');
  const [closingPezziComprati, setClosingPezziComprati] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteType, setConfirmDeleteType] = useState<
    'variant' | 'model' | 'flavor' | 'staff'
  >('variant');
  const [confirmDeleteLabel, setConfirmDeleteLabel] = useState('');

  const isAdmin = user?.role === 'admin';

  const fetchData = async () => {
    try {
      const [staffRes, variantsRes, modelsRes, flavorsRes, settingsRes, inventoryRes] =
        await Promise.all([
          supabase.from('staff').select('*').order('name'),
          supabase
            .from('product_variants')
            .select('*, model:product_models(name), flavor:product_flavors(name)'),
          supabase.from('product_models').select('*').order('name'),
          supabase.from('product_flavors').select('*').order('name'),
          supabase.from('settings').select('*').single(),
          supabase.from('inventory').select('*'),
        ]);
      if (staffRes.data) setStaff(staffRes.data);
      if (variantsRes.data) {
        const inventory = inventoryRes.data || [];
        type VariantRow = ProductVariant & {
          model?: { name: string } | null;
          flavor?: { name: string } | null;
          deleted?: boolean;
        };
        const merged = (variantsRes.data as VariantRow[])
          .filter((v) => !v.deleted)
          .map((v) => ({
            ...v,
            model_name: v.model?.name ?? '',
            flavor_name: v.flavor?.name ?? '',
            qty: inventory.find((i) => i.variant_id === v.id)?.qty ?? 0,
          }));
        merged.sort(
          (a, b) =>
            a.model_name.localeCompare(b.model_name) ||
            a.flavor_name.localeCompare(b.flavor_name)
        );
        setVariants(merged);
      }
      if (modelsRes.data) setModels(modelsRes.data);
      if (flavorsRes.data) setFlavors(flavorsRes.data);
      if (settingsRes.data) setSettings(settingsRes.data as Settings);
    } catch (error) {
      console.error('Admin load error:', error);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      const t = setTimeout(() => void fetchData(), 0);
      return () => clearTimeout(t);
    }
  }, [isAdmin]);

  const handleUpdateSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    const { error } = await supabase
      .from('settings')
      .update({
        money_spent_total: settings.money_spent_total,
        money_spent_current_load: settings.money_spent_current_load,
      })
      .eq('id', 1);
    if (error) showToast('Errore salvataggio impostazioni', 'error');
    else showToast('Impostazioni bilancio salvate', 'success');
  };

  const handleAddModel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newModel.trim()) return;
    const nameUpper = newModel.trim().toUpperCase();
    const { error } = await supabase.rpc('add_product_model', { p_name: nameUpper });
    if (error) {
      if (error.message?.includes('function') || error.code === '42883') {
        const { error: insertErr } = await supabase
          .from('product_models')
          .insert({ name: nameUpper })
          .select();
        if (insertErr) showToast('Errore modello: ' + insertErr.message, 'error');
        else {
          setNewModel('');
          fetchData();
          showToast('Modello aggiunto con successo', 'success');
        }
      } else if (error.message?.includes('duplicate') || error.code === '23505') {
        showToast('Modello già esistente', 'error');
      } else {
        showToast('Errore modello: ' + error.message, 'error');
      }
    } else {
      setNewModel('');
      fetchData();
      showToast('Modello aggiunto con successo', 'success');
    }
  };

  const handleAddFlavor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFlavor.trim()) return;
    const nameUpper = newFlavor.trim().toUpperCase();
    const { error } = await supabase.rpc('add_product_flavor', { p_name: nameUpper });
    if (error) {
      if (error.message?.includes('function') || error.code === '42883') {
        const { error: insertErr } = await supabase
          .from('product_flavors')
          .insert({ name: nameUpper })
          .select();
        if (insertErr) showToast('Errore gusto: ' + insertErr.message, 'error');
        else {
          setNewFlavor('');
          fetchData();
          showToast('Gusto aggiunto con successo', 'success');
        }
      } else if (error.message?.includes('duplicate') || error.code === '23505') {
        showToast('Gusto già esistente', 'error');
      } else {
        showToast('Errore gusto: ' + error.message, 'error');
      }
    } else {
      setNewFlavor('');
      fetchData();
      showToast('Gusto aggiunto con successo', 'success');
    }
  };

  const handleAddVariant = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.rpc('create_product_variant', {
      p_model_id: newVariant.model_id,
      p_flavor_id: newVariant.flavor_id,
      p_default_price: newVariant.default_price,
      p_initial_qty: newVariant.initial_qty,
    });
    if (error) {
      showToast(error.message, 'error');
    } else {
      setShowAddVariant(false);
      setNewVariant({
        model_id: '',
        flavor_id: '',
        default_price: 15,
        initial_qty: 0,
      });
      fetchData();
      showToast('Variante creata con successo', 'success');
    }
  };

  const handleUpdateVariant = async (v: VariantWithMeta) => {
    const { error } = await supabase
      .from('product_variants')
      .update({ default_price: v.default_price, active: v.active })
      .eq('id', v.id);
    if (error) {
      showToast('Errore aggiornamento', 'error');
    } else {
      setEditingVariant(null);
      fetchData();
      showToast('Variante aggiornata', 'success');
    }
  };

  const handleDeleteVariant = async (id: string) => {
    const { error } = await supabase.from('product_variants').delete().eq('id', id);
    if (error) {
      const { error: updateError } = await supabase
        .from('product_variants')
        .update({ deleted: true, active: false })
        .eq('id', id);
      if (updateError) {
        showToast('Errore eliminazione variante', 'error');
      } else {
        fetchData();
        showToast('Variante eliminata', 'success');
      }
    } else {
      fetchData();
      showToast('Variante eliminata', 'success');
    }
    setConfirmDeleteId(null);
  };

  const handleUpdateQty = async (variantId: string, newQty: number) => {
    const { error } = await supabase
      .from('inventory')
      .update({ qty: newQty })
      .eq('variant_id', variantId);
    if (error) {
      showToast('Errore aggiornamento quantità: ' + error.message, 'error');
    } else {
      setVariants((prev) =>
        prev.map((v) => (v.id === variantId ? { ...v, qty: newQty } : v))
      );
    }
  };

  const handleDeleteStaff = async (id: string) => {
    await supabase.from('reservations').update({ created_by_staff_id: null }).eq('created_by_staff_id', id);
    await supabase.from('orders').update({ sold_by_staff_id: null }).eq('sold_by_staff_id', id);
    await supabase.from('reminders').update({ created_by_staff_id: null }).eq('created_by_staff_id', id);
    await supabase.from('audit_log').update({ staff_id: null }).eq('staff_id', id);
    await supabase.from('archived_loads').update({ created_by: null }).eq('created_by', id);
    await supabase.from('staff_sessions').delete().eq('staff_id', id);
    const { error } = await supabase.from('staff').delete().eq('id', id);
    if (error) {
      showToast('Errore eliminazione membro: ' + error.message, 'error');
    } else {
      fetchData();
      showToast('Membro rimosso dallo staff', 'success');
    }
    setConfirmDeleteId(null);
  };

  const handleUpdateStaffRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStaffRole) return;
    const { error } = await supabase
      .from('staff')
      .update({ role: editingStaffRole.role })
      .eq('id', editingStaffRole.id);
    if (error) {
      showToast('Errore aggiornamento ruolo', 'error');
    } else {
      setEditingStaffRole(null);
      fetchData();
      showToast('Ruolo aggiornato con successo', 'success');
    }
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newStaff.pin !== newStaff.confirmPin) {
      setPinError('I PIN non corrispondono');
      return;
    }
    const { error } = await supabase.rpc('create_staff', {
      p_name: newStaff.name.trim(),
      p_role: newStaff.role,
      p_pin: newStaff.pin,
    });
    if (error) {
      showToast(error.message, 'error');
    } else {
      setShowAddStaff(false);
      setNewStaff({ name: '', role: 'staff', pin: '', confirmPin: '' });
      setPinError('');
      fetchData();
      showToast('Membro aggiunto allo staff', 'success');
    }
  };

  const handleUpdateStaffPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPin !== confirmPin) {
      setPinError('I PIN non corrispondono');
      return;
    }
    if (!editingStaff) return;
    const { error } = await supabase.rpc('update_staff_pin', {
      p_staff_id: editingStaff.id,
      p_new_pin: newPin,
    });
    if (error) {
      showToast('Errore PIN: ' + error.message, 'error');
    } else {
      setEditingStaff(null);
      setNewPin('');
      setConfirmPin('');
      setPinError('');
      showToast('PIN aggiornato con successo', 'success');
      fetchData();
    }
  };

  const handleConfirmClosingLoad = async () => {
    if (!closingSoldiSpesi || Number(closingSoldiSpesi) < 0) {
      showToast('Inserisci i soldi spesi per il carico', 'error');
      return;
    }
    if (!closingPezziComprati || Number(closingPezziComprati) <= 0) {
      showToast('Inserisci i pezzi totali (> 0)', 'error');
      return;
    }
    const soldiSpesi = Number(closingSoldiSpesi);
    const pezziComprati = Number(closingPezziComprati);
    await supabase.from('settings').update({ money_spent_total: soldiSpesi }).eq('id', 1);
    const { data, error } = await supabase.rpc('close_current_load', {
      p_soldi_spesi: soldiSpesi,
      p_pezzi_comprati: pezziComprati,
    });
    if (error) {
      showToast(error.message, 'error');
    } else {
      const unitCost =
        safeNumber(data?.unit_cost_calcolato) || soldiSpesi / pezziComprati;
      setShowClosingLoad(false);
      setClosingSoldiSpesi('');
      setClosingPezziComprati('');
      fetchData();
      showToast(`Carico chiuso con successo · Costo unitario €${unitCost.toFixed(2)}`, 'success');
    }
  };

  const handleDeleteModel = async (id: string) => {
    const { error } = await supabase.from('product_models').delete().eq('id', id);
    if (error) {
      const { error: updateError } = await supabase
        .from('product_models')
        .update({ deleted: true, active: false })
        .eq('id', id);
      if (updateError) {
        showToast('Errore eliminazione modello', 'error');
      } else {
        await supabase
          .from('product_variants')
          .update({ deleted: true, active: false })
          .eq('model_id', id);
        fetchData();
        showToast('Modello eliminato', 'success');
      }
    } else {
      fetchData();
      showToast('Modello eliminato', 'success');
    }
    setConfirmDeleteId(null);
  };

  const handleDeleteFlavor = async (id: string) => {
    const { error } = await supabase.from('product_flavors').delete().eq('id', id);
    if (error) {
      const { error: updateError } = await supabase
        .from('product_flavors')
        .update({ deleted: true, active: false })
        .eq('id', id);
      if (updateError) {
        showToast('Errore eliminazione gusto', 'error');
      } else {
        await supabase
          .from('product_variants')
          .update({ deleted: true, active: false })
          .eq('flavor_id', id);
        fetchData();
        showToast('Gusto eliminato', 'success');
      }
    } else {
      fetchData();
      showToast('Gusto eliminato', 'success');
    }
    setConfirmDeleteId(null);
  };

  const closeSheet = () => {
    setShowAddStaff(false);
    setShowAddVariant(false);
    setEditingVariant(null);
    setEditingStaff(null);
    setEditingStaffRole(null);
    setShowClosingLoad(false);
    setPinError('');
  };

  const sheetOpen =
    showAddStaff ||
    showAddVariant ||
    !!editingVariant ||
    !!editingStaff ||
    !!editingStaffRole ||
    showClosingLoad;

  if (!isAdmin) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6">
        <div className="w-16 h-16 rounded-3xl bg-[#FF453A]/15 border border-[#FF453A]/30 flex items-center justify-center text-[#FF453A] mb-4 shadow-xl">
          <Shield size={32} />
        </div>
        <h1 className="spatial-title text-2xl font-bold text-white">Accesso Riservato</h1>
        <p className="spatial-subhead text-white/50 mt-1 max-w-sm">
          Questa sezione è accessibile esclusivamente agli utenti con ruolo Amministratore.
        </p>
      </div>
    );
  }

  const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: 'settings', label: 'Home & Bilancio', icon: SettingsIcon },
    { id: 'staff', label: 'Team', icon: Users },
    { id: 'products', label: 'Catalogo', icon: Layers },
    { id: 'inventory_management', label: 'Stock', icon: Boxes },
  ];

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      {/* ── Top Header ── */}
      <div className="flex items-center justify-between pt-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="spatial-chip spatial-chip-blue text-[11px] py-0.5">
              <Shield size={11} /> Pannello Amministratore
            </span>
            <span className="spatial-caption text-white/50">Configurazione Negozio</span>
          </div>
          <h1 className="spatial-title text-2xl sm:text-3xl font-semibold text-white">
            Amministrazione
          </h1>
        </div>
      </div>

      {/* ── 4-Tab Segmented Navigation ── */}
      <div className="spatial-segmented" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={activeTab === t.id}
            onClick={() => setActiveTab(t.id)}
            className={cn(
              'spatial-segmented-item shrink-0 sm:flex-1 text-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 text-xs sm:text-sm',
              activeTab === t.id && 'spatial-segmented-item-active'
            )}
          >
            <t.icon size={15} />
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* ── TAB 1: Home & Bilancio ── */}
      {activeTab === 'settings' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Panel Chiudi Carico */}
          <div className="spatial-panel-strong p-6 border-[#FF453A]/30 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <AlertOctagon size={18} className="text-[#FF453A]" />
                <h3 className="spatial-headline text-lg font-semibold text-white">
                  Chiusura Carico
                </h3>
              </div>
              <p className="spatial-subhead text-xs text-white/60 mb-6">
                Archivia in modo definitivo la sessione corrente di vendita, calcola il costo
                unitario medio e azzera il conteggio carichi.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setClosingSoldiSpesi('');
                setClosingPezziComprati('');
                setShowClosingLoad(true);
              }}
              className="h-12 rounded-full font-semibold text-sm bg-[#FF453A] hover:bg-[#E03A30] text-white flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(255,69,58,0.4)] transition-all active:scale-98"
            >
              <AlertOctagon size={16} /> Avvia Chiusura Carico
            </button>
          </div>

          {/* Panel Bilancio Spese */}
          <div className="spatial-panel p-6 flex flex-col justify-between">
            <div>
              <h3 className="spatial-headline text-lg font-semibold text-white mb-1">
                Bilancio & Spese
              </h3>
              <p className="spatial-caption text-white/50 mb-3">
                Utile netto complessivo registrato
              </p>
              <p className="spatial-amount text-3xl font-extrabold text-[#30D158] tracking-tight mb-4">
                €{(settings?.total_net_earned ?? 0).toLocaleString('it-IT', {
                  minimumFractionDigits: 2,
                })}
              </p>

              <form onSubmit={handleUpdateSettings} className="space-y-3">
                <div>
                  <label className="spatial-caption block mb-1 text-white/60">
                    Spese Totali Carico (€)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={settings?.money_spent_total ?? ''}
                    onChange={(e) =>
                      setSettings((prev) =>
                        prev
                          ? { ...prev, money_spent_total: Number(e.target.value) }
                          : prev
                      )
                    }
                    className="w-full px-4 py-2.5 rounded-xl bg-white/10 border border-white/15 text-white font-bold spatial-amount focus:outline-none focus:border-[#0A84FF]"
                  />
                </div>
                <div>
                  <label className="spatial-caption block mb-1 text-white/60">
                    Spese Extra Durante il Carico (€)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={settings?.money_spent_current_load ?? ''}
                    onChange={(e) =>
                      setSettings((prev) =>
                        prev
                          ? {
                              ...prev,
                              money_spent_current_load: Number(e.target.value),
                            }
                          : prev
                      )
                    }
                    className="w-full px-4 py-2.5 rounded-xl bg-white/10 border border-white/15 text-white font-bold spatial-amount focus:outline-none focus:border-[#0A84FF]"
                  />
                </div>
                <button
                  type="submit"
                  className="spatial-btn-primary w-full h-11 text-xs font-semibold mt-2"
                >
                  Salva Modifiche Bilancio
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: Team ── */}
      {activeTab === 'staff' && (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => setShowAddStaff(true)}
            className="spatial-btn-primary w-full h-12 text-sm font-semibold flex items-center justify-center gap-2 shadow-lg"
          >
            <Plus size={18} /> Aggiungi Nuovo Membro Staff
          </button>

          <div className="spatial-panel p-0 overflow-hidden divide-y divide-white/10">
            {staff.map((s) => (
              <div
                key={s.id}
                className="spatial-row px-4 sm:px-6 py-4 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  <div
                    className={cn(
                      'w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-white text-base shrink-0 border',
                      s.role === 'admin'
                        ? 'bg-[#FF9F0A]/20 border-[#FF9F0A]/40 text-[#FF9F0A]'
                        : 'bg-white/10 border-white/20'
                    )}
                  >
                    {s.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="spatial-headline text-[15px] font-semibold text-white truncate">
                      {s.name}
                    </p>
                    <p className="spatial-caption text-white/50 capitalize mt-0.5">
                      Ruolo: {s.role}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setEditingStaffRole({ ...s })}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold bg-white/10 hover:bg-white/20 text-white transition-colors flex items-center gap-1"
                  >
                    <UserCheck size={13} /> Ruolo
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingStaff(s);
                      setNewPin('');
                      setConfirmPin('');
                      setPinError('');
                    }}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold bg-white/10 hover:bg-white/20 text-white transition-colors flex items-center gap-1"
                  >
                    <KeyRound size={13} /> PIN
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmDeleteId(s.id);
                      setConfirmDeleteType('staff');
                      setConfirmDeleteLabel(s.name);
                    }}
                    className="w-8 h-8 rounded-full bg-[#FF453A]/15 hover:bg-[#FF453A]/25 border border-[#FF453A]/30 text-[#FF453A] flex items-center justify-center transition-colors"
                    aria-label={`Elimina ${s.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
            {staff.length === 0 && (
              <EmptyState title="Nessun membro configurato nello staff" />
            )}
          </div>
        </div>
      )}

      {/* ── TAB 3: Catalogo (Modelli & Gusti) ── */}
      {activeTab === 'products' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Modelli */}
          <section className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="spatial-caption text-white/60 font-semibold tracking-wider">
                MODELLI DISPOSITIVI (
                {models.filter((m) => !m.deleted && m.active !== false).length})
              </h2>
            </div>

            <form onSubmit={handleAddModel} className="flex gap-2">
              <input
                type="text"
                value={newModel}
                onChange={(e) => setNewModel(e.target.value)}
                placeholder="Nuovo modello (es. ELF BAR 600)"
                className="flex-1 px-4 py-2.5 rounded-2xl bg-white/10 border border-white/15 text-white placeholder:text-white/30 text-sm focus:outline-none focus:border-[#0A84FF]"
              />
              <button
                type="submit"
                className="w-11 h-11 rounded-2xl bg-[#0A84FF] text-white flex items-center justify-center shrink-0 shadow-[0_0_12px_rgba(10,132,255,0.4)]"
                aria-label="Aggiungi modello"
              >
                <Plus size={18} />
              </button>
            </form>

            <div className="spatial-panel p-0 overflow-hidden divide-y divide-white/10">
              {models
                .filter((m) => !m.deleted && m.active !== false)
                .map((m) => (
                  <div
                    key={m.id}
                    className="spatial-row px-4 py-3 flex items-center justify-between gap-3"
                  >
                    <span className="spatial-headline text-sm font-medium text-white truncate flex-1">
                      {m.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmDeleteId(m.id);
                        setConfirmDeleteType('model');
                        setConfirmDeleteLabel(m.name);
                      }}
                      className="w-8 h-8 rounded-full bg-[#FF453A]/15 hover:bg-[#FF453A]/25 border border-[#FF453A]/30 text-[#FF453A] flex items-center justify-center transition-colors"
                      aria-label={`Elimina modello ${m.name}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
            </div>
          </section>

          {/* Gusti */}
          <section className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="spatial-caption text-white/60 font-semibold tracking-wider">
                GUSTI & AROMI (
                {flavors.filter((f) => !f.deleted && f.active !== false).length})
              </h2>
            </div>

            <form onSubmit={handleAddFlavor} className="flex gap-2">
              <input
                type="text"
                value={newFlavor}
                onChange={(e) => setNewFlavor(e.target.value)}
                placeholder="Nuovo gusto (es. BLUE RAZZ ICE)"
                className="flex-1 px-4 py-2.5 rounded-2xl bg-white/10 border border-white/15 text-white placeholder:text-white/30 text-sm focus:outline-none focus:border-[#0A84FF]"
              />
              <button
                type="submit"
                className="w-11 h-11 rounded-2xl bg-[#FF9F0A] text-white flex items-center justify-center shrink-0 shadow-[0_0_12px_rgba(255,159,10,0.4)]"
                aria-label="Aggiungi gusto"
              >
                <Plus size={18} />
              </button>
            </form>

            <div className="spatial-panel p-0 overflow-hidden divide-y divide-white/10">
              {flavors
                .filter((f) => !f.deleted && f.active !== false)
                .map((f) => (
                  <div
                    key={f.id}
                    className="spatial-row px-4 py-3 flex items-center justify-between gap-3"
                  >
                    <span className="spatial-subhead text-sm font-medium text-white/90 truncate flex-1">
                      {f.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmDeleteId(f.id);
                        setConfirmDeleteType('flavor');
                        setConfirmDeleteLabel(f.name);
                      }}
                      className="w-8 h-8 rounded-full bg-[#FF453A]/15 hover:bg-[#FF453A]/25 border border-[#FF453A]/30 text-[#FF453A] flex items-center justify-center transition-colors"
                      aria-label={`Elimina gusto ${f.name}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
            </div>
          </section>
        </div>
      )}

      {/* ── TAB 4: Stock & Varianti ── */}
      {activeTab === 'inventory_management' && (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => setShowAddVariant(true)}
            className="spatial-btn-primary w-full h-12 text-sm font-semibold flex items-center justify-center gap-2 shadow-lg"
          >
            <Plus size={18} /> Crea Nuova Variante Prodotto
          </button>

          {variants.length === 0 ? (
            <EmptyState
              title="Nessuna variante presente"
              subtitle="Crea la prima combinazione modello-gusto con il tasto sopra"
            />
          ) : (
            <div className="spatial-panel p-0 overflow-hidden divide-y divide-white/10">
              {variants.map((v) => (
                <div
                  key={v.id}
                  className={cn(
                    'spatial-row px-4 sm:px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-opacity',
                    !v.active && 'opacity-40'
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="spatial-headline text-[15px] font-semibold text-white truncate">
                      {v.model_name}{' '}
                      <span className="spatial-subhead text-white/60">· {v.flavor_name}</span>
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="spatial-amount text-xs text-white/70">
                        €{Number(v.default_price).toFixed(2)}
                      </span>
                      {!v.active && (
                        <Badge variant="ghost" size="xs">
                          Non attiva
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Stock Stepper */}
                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                    <div className="flex items-center gap-1.5 bg-white/10 rounded-full p-1 border border-white/15">
                      <button
                        type="button"
                        onClick={() =>
                          handleUpdateQty(v.id, Math.max(0, (v.qty || 0) - 1))
                        }
                        className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center text-white text-sm"
                        aria-label="Diminuisci stock"
                      >
                        −
                      </button>
                      <span className="spatial-amount text-sm font-bold w-8 text-center text-white">
                        {v.qty || 0}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleUpdateQty(v.id, (v.qty || 0) + 1)}
                        className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center text-white text-sm"
                        aria-label="Aumenta stock"
                      >
                        +
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => setEditingVariant({ ...v })}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold bg-white/10 hover:bg-white/20 text-white transition-colors"
                    >
                      Prezzo
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setConfirmDeleteId(v.id);
                        setConfirmDeleteType('variant');
                        setConfirmDeleteLabel(`${v.model_name} ${v.flavor_name}`);
                      }}
                      className="w-8 h-8 rounded-full bg-[#FF453A]/15 hover:bg-[#FF453A]/25 border border-[#FF453A]/30 text-[#FF453A] flex items-center justify-center transition-colors"
                      aria-label="Elimina variante"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── UN SOLO Sheet di Vetro per i 6 Form ── */}
      <AnimatePresence>
        {sheetOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-md"
            onClick={closeSheet}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 320 }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="admin-sheet-title"
              className="spatial-sheet w-full sm:max-w-md p-6 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] flex flex-col"
              style={{ maxHeight: '90dvh' }}
            >
              <div className="spatial-grabber" />

              <div className="flex items-center justify-between pb-3 mb-4 border-b border-white/10">
                <h2
                  id="admin-sheet-title"
                  className="spatial-headline text-lg font-semibold text-white"
                >
                  {showAddStaff
                    ? 'Nuovo Membro Staff'
                    : showAddVariant
                    ? 'Nuova Variante Prodotto'
                    : editingVariant
                    ? 'Modifica Variante'
                    : editingStaffRole
                    ? 'Aggiorna Ruolo'
                    : editingStaff
                    ? `PIN Operatore · ${editingStaff.name}`
                    : 'Chiusura Carico Magazzino'}
                </h2>
                <button
                  type="button"
                  onClick={closeSheet}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                  aria-label="Chiudi"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Form 1: Add Staff */}
              {showAddStaff && (
                <form onSubmit={handleAddStaff} className="space-y-3.5">
                  <div>
                    <label className="spatial-caption block mb-1 text-white/60">Nome</label>
                    <input
                      required
                      value={newStaff.name}
                      onChange={(e) =>
                        setNewStaff({ ...newStaff, name: e.target.value })
                      }
                      className="w-full px-4 py-2.5 rounded-2xl bg-white/10 border border-white/15 text-white text-sm focus:outline-none focus:border-[#0A84FF]"
                      placeholder="Nome operatore"
                    />
                  </div>
                  <div>
                    <label className="spatial-caption block mb-1 text-white/60">Ruolo</label>
                    <select
                      value={newStaff.role}
                      onChange={(e) =>
                        setNewStaff({
                          ...newStaff,
                          role: e.target.value as StaffRole,
                        })
                      }
                      className="w-full px-4 py-2.5 rounded-2xl bg-white/10 border border-white/15 text-white text-sm focus:outline-none focus:border-[#0A84FF]"
                    >
                      <option value="staff" className="bg-[#14161C] text-white">Staff</option>
                      <option value="helper" className="bg-[#14161C] text-white">Helper</option>
                      <option value="admin" className="bg-[#14161C] text-white">Admin</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="spatial-caption block mb-1 text-white/60">PIN</label>
                      <input
                        type="password"
                        required
                        maxLength={8}
                        value={newStaff.pin}
                        onChange={(e) =>
                          setNewStaff({ ...newStaff, pin: e.target.value })
                        }
                        className="w-full px-4 py-2.5 rounded-2xl bg-white/10 border border-white/15 text-white text-center text-base tracking-widest focus:outline-none focus:border-[#0A84FF]"
                        placeholder="••••"
                        inputMode="numeric"
                      />
                    </div>
                    <div>
                      <label className="spatial-caption block mb-1 text-white/60">Ripeti PIN</label>
                      <input
                        type="password"
                        required
                        maxLength={8}
                        value={newStaff.confirmPin}
                        onChange={(e) =>
                          setNewStaff({
                            ...newStaff,
                            confirmPin: e.target.value,
                          })
                        }
                        className="w-full px-4 py-2.5 rounded-2xl bg-white/10 border border-white/15 text-white text-center text-base tracking-widest focus:outline-none focus:border-[#0A84FF]"
                        placeholder="••••"
                        inputMode="numeric"
                      />
                    </div>
                  </div>
                  {pinError && (
                    <p className="spatial-footnote text-[#FF453A] text-center text-xs font-medium">
                      {pinError}
                    </p>
                  )}
                  <button
                    type="submit"
                    className="spatial-btn-primary w-full h-12 text-sm font-semibold mt-4 shadow-lg"
                  >
                    Crea Membro Staff
                  </button>
                </form>
              )}

              {/* Form 2: Add Variant */}
              {showAddVariant && (
                <form onSubmit={handleAddVariant} className="space-y-3.5">
                  <div>
                    <label className="spatial-caption block mb-1 text-white/60">Modello</label>
                    <select
                      required
                      value={newVariant.model_id}
                      onChange={(e) =>
                        setNewVariant({ ...newVariant, model_id: e.target.value })
                      }
                      className="w-full px-4 py-2.5 rounded-2xl bg-white/10 border border-white/15 text-white text-sm focus:outline-none focus:border-[#0A84FF]"
                    >
                      <option value="" className="bg-[#14161C] text-white">Seleziona Modello…</option>
                      {models
                        .filter((m) => !m.deleted && m.active !== false)
                        .map((m) => (
                          <option key={m.id} value={m.id} className="bg-[#14161C] text-white">
                            {m.name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="spatial-caption block mb-1 text-white/60">Gusto</label>
                    <select
                      required
                      value={newVariant.flavor_id}
                      onChange={(e) =>
                        setNewVariant({ ...newVariant, flavor_id: e.target.value })
                      }
                      className="w-full px-4 py-2.5 rounded-2xl bg-white/10 border border-white/15 text-white text-sm focus:outline-none focus:border-[#0A84FF]"
                    >
                      <option value="" className="bg-[#14161C] text-white">Seleziona Gusto…</option>
                      {flavors
                        .filter((f) => !f.deleted && f.active !== false)
                        .map((f) => (
                          <option key={f.id} value={f.id} className="bg-[#14161C] text-white">
                            {f.name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="spatial-caption block mb-1 text-white/60">Prezzo (€)</label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={newVariant.default_price}
                        onChange={(e) =>
                          setNewVariant({
                            ...newVariant,
                            default_price: Number(e.target.value),
                          })
                        }
                        className="w-full px-3 py-2.5 rounded-2xl bg-white/10 border border-white/15 text-white text-center spatial-amount text-base font-bold focus:outline-none focus:border-[#0A84FF]"
                      />
                    </div>
                    <div>
                      <label className="spatial-caption block mb-1 text-white/60">Quantità Iniziale</label>
                      <input
                        type="number"
                        required
                        value={newVariant.initial_qty}
                        onChange={(e) =>
                          setNewVariant({
                            ...newVariant,
                            initial_qty: Number(e.target.value),
                          })
                        }
                        className="w-full px-3 py-2.5 rounded-2xl bg-white/10 border border-white/15 text-white text-center spatial-amount text-base font-bold focus:outline-none focus:border-[#0A84FF]"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="spatial-btn-primary w-full h-12 text-sm font-semibold mt-4 shadow-lg"
                  >
                    Salva Variante Prodotto
                  </button>
                </form>
              )}

              {/* Form 3: Edit Variant (with SpatialToggle) */}
              {editingVariant && (
                <div className="space-y-4">
                  <div>
                    <label className="spatial-caption block text-center mb-1 text-white/60">
                      Prezzo di Default (€)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={editingVariant.default_price}
                      onChange={(e) =>
                        setEditingVariant({
                          ...editingVariant,
                          default_price: Number(e.target.value),
                        })
                      }
                      className="w-full px-4 py-3 rounded-2xl bg-white/10 border border-white/20 text-white text-center spatial-amount text-2xl font-bold focus:outline-none focus:border-[#0A84FF]"
                    />
                  </div>

                  {/* SpatialToggle Row */}
                  <div className="spatial-subpanel p-4 flex items-center justify-between">
                    <div>
                      <p className="spatial-headline text-sm font-semibold text-white">
                        Variante Attiva nel Catalogo
                      </p>
                      <p className="spatial-caption text-white/50">
                        {editingVariant.active
                          ? 'Visibile nel terminale di vendita'
                          : 'Nascosta dal catalogo'}
                      </p>
                    </div>
                    <SpatialToggle
                      checked={Boolean(editingVariant.active)}
                      onChange={(checked) =>
                        setEditingVariant({ ...editingVariant, active: checked })
                      }
                      aria-label="Attiva o disattiva variante"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => handleUpdateVariant(editingVariant)}
                    className="spatial-btn-primary w-full h-12 text-sm font-semibold mt-2 shadow-lg"
                  >
                    Salva Modifiche
                  </button>
                </div>
              )}

              {/* Form 4: Edit Staff Role */}
              {editingStaffRole && (
                <form onSubmit={handleUpdateStaffRole} className="space-y-3">
                  <p className="spatial-caption text-white/60 mb-2">
                    Seleziona il nuovo livello di permessi per {editingStaffRole.name}:
                  </p>
                  {(['admin', 'staff', 'helper'] as StaffRole[]).map((role) => (
                    <button
                      type="button"
                      key={role}
                      onClick={() =>
                        setEditingStaffRole({ ...editingStaffRole, role })
                      }
                      className={cn(
                        'w-full flex items-center justify-between p-4 rounded-2xl border text-left transition-all',
                        editingStaffRole.role === role
                          ? 'bg-[#0A84FF]/20 border-[#0A84FF] shadow-[0_0_12px_rgba(10,132,255,0.3)]'
                          : 'bg-white/5 hover:bg-white/10 border-white/10'
                      )}
                    >
                      <div>
                        <span className="spatial-headline text-sm font-semibold text-white capitalize block">
                          {role}
                        </span>
                        <span className="spatial-caption text-white/50 text-[11px]">
                          {role === 'admin'
                            ? 'Accesso completo a gestione, storico e bilancio'
                            : role === 'staff'
                            ? 'Accesso a vendite, prenotazioni e cassa'
                            : 'Accesso limitato alle vendite'}
                        </span>
                      </div>
                      {editingStaffRole.role === role && (
                        <div className="w-6 h-6 rounded-full bg-[#0A84FF] text-white flex items-center justify-center shrink-0">
                          <Check size={14} />
                        </div>
                      )}
                    </button>
                  ))}
                  <button
                    type="submit"
                    className="spatial-btn-primary w-full h-12 text-sm font-semibold mt-4 shadow-lg"
                  >
                    Conferma Ruolo
                  </button>
                </form>
              )}

              {/* Form 5: Edit Staff PIN */}
              {editingStaff && (
                <form onSubmit={handleUpdateStaffPin} className="space-y-4">
                  <div className="space-y-3">
                    <div>
                      <label className="spatial-caption block text-center mb-1 text-white/60">
                        Nuovo Codice PIN
                      </label>
                      <input
                        type="password"
                        required
                        maxLength={8}
                        value={newPin}
                        onChange={(e) => setNewPin(e.target.value)}
                        className="w-full px-4 py-3 rounded-2xl bg-white/10 border border-white/20 text-white text-center text-xl font-bold tracking-widest focus:outline-none focus:border-[#0A84FF]"
                        placeholder="••••"
                        inputMode="numeric"
                      />
                    </div>
                    <div>
                      <label className="spatial-caption block text-center mb-1 text-white/60">
                        Conferma Nuovo PIN
                      </label>
                      <input
                        type="password"
                        required
                        maxLength={8}
                        value={confirmPin}
                        onChange={(e) => setConfirmPin(e.target.value)}
                        className="w-full px-4 py-3 rounded-2xl bg-white/10 border border-white/20 text-white text-center text-xl font-bold tracking-widest focus:outline-none focus:border-[#0A84FF]"
                        placeholder="••••"
                        inputMode="numeric"
                      />
                    </div>
                  </div>
                  {pinError && (
                    <p className="spatial-footnote text-[#FF453A] text-center text-xs font-semibold">
                      {pinError}
                    </p>
                  )}
                  <button
                    type="submit"
                    className="spatial-btn-primary w-full h-12 text-sm font-semibold shadow-lg"
                  >
                    Salva Nuovo PIN
                  </button>
                </form>
              )}

              {/* Form 6: Closing Load */}
              {showClosingLoad && (
                <div className="space-y-4">
                  <p className="spatial-subhead text-xs text-white/60">
                    Archivia la sessione corrente, calcola il costo unitario medio e azzera il
                    magazzino per il nuovo carico.
                  </p>
                  <div>
                    <label className="spatial-caption block mb-1 text-white/60">
                      Totale Soldi Spesi per il Carico (€) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={closingSoldiSpesi}
                      onChange={(e) => setClosingSoldiSpesi(e.target.value)}
                      className="w-full px-4 py-3 rounded-2xl bg-white/10 border border-white/20 text-white text-center spatial-amount text-xl font-bold focus:outline-none focus:border-[#0A84FF]"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="spatial-caption block mb-1 text-white/60">
                      Pezzi Totali Acquistati nel Carico *
                    </label>
                    <input
                      type="number"
                      value={closingPezziComprati}
                      onChange={(e) => setClosingPezziComprati(e.target.value)}
                      className="w-full px-4 py-3 rounded-2xl bg-white/10 border border-white/20 text-white text-center spatial-amount text-xl font-bold focus:outline-none focus:border-[#0A84FF]"
                      placeholder="0"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleConfirmClosingLoad}
                    className="h-12 w-full rounded-full font-semibold text-sm bg-[#FF453A] hover:bg-[#E03A30] text-white flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(255,69,58,0.4)] transition-all active:scale-98 mt-2"
                  >
                    <AlertOctagon size={16} /> Conferma Chiusura Definitiva
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Universal ConfirmModal for Deletes */}
      <ConfirmModal
        isOpen={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={() => {
          if (!confirmDeleteId) return;
          if (confirmDeleteType === 'variant') handleDeleteVariant(confirmDeleteId);
          else if (confirmDeleteType === 'model') handleDeleteModel(confirmDeleteId);
          else if (confirmDeleteType === 'flavor') handleDeleteFlavor(confirmDeleteId);
          else if (confirmDeleteType === 'staff') handleDeleteStaff(confirmDeleteId);
        }}
        title="Conferma Eliminazione"
        message={`Sei sicuro di voler eliminare definitivamente "${confirmDeleteLabel}"?`}
        variant="danger"
        confirmLabel="Elimina"
      />
    </div>
  );
};
