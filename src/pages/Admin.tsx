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
  TrendingUp,
  Edit3,
  Search,
  Lock,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { EmptyState } from '../components/ui/EmptyState';
import { cn } from '../lib/cn';
import { useSiteGate } from '../context/SiteGateContext';

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
  const [variantSearch, setVariantSearch] = useState('');
  const { lockTerminal } = useSiteGate();
  const [newSitePass, setNewSitePass] = useState('');
  const [confirmSitePass, setConfirmSitePass] = useState('');
  const [updatingSitePass, setUpdatingSitePass] = useState(false);

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
      if (staffRes.data) {
        setStaff(
          (staffRes.data as Staff[]).map((s) => ({
            ...s,
            has_pin: Boolean(s.has_pin ?? s.pin_hash),
          }))
        );
      }
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
        money_spent_total: Number(settings.money_spent_total) || 0,
        money_spent_current_load: Number(settings.money_spent_current_load) || 0,
        total_net_earned: Number(settings.total_net_earned) || 0,
      })
      .eq('id', 1);
    if (error) {
      showToast('Errore salvataggio impostazioni', 'error');
    } else {
      showToast('Impostazioni bilancio salvate', 'success');
      fetchData();
    }
  };

  const handleUpdateSitePass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newSitePass.length < 6) {
      showToast('La nuova password del sito deve contenere almeno 6 caratteri', 'error');
      return;
    }
    if (newSitePass !== confirmSitePass) {
      showToast('Le password del sito non coincidono', 'error');
      return;
    }
    setUpdatingSitePass(true);
    try {
      const { error } = await supabase.rpc('update_site_access_key', {
        p_new_key: newSitePass,
      });
      if (error) {
        showToast(error.message, 'error');
      } else {
        showToast('PIN Passmaster aggiornato. Disconnessione di tutti i dispositivi in corso...', 'success');
        setNewSitePass('');
        setConfirmSitePass('');
        setTimeout(() => {
          try {
            localStorage.removeItem('puff_terminal_device_token');
            sessionStorage.removeItem('puff_terminal_device_token');
          } catch {
            // Ignore
          }
          window.dispatchEvent(new CustomEvent('puff:lock-terminal'));
          lockTerminal();
        }, 1200);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Errore aggiornamento chiave';
      showToast(msg, 'error');
    } finally {
      setUpdatingSitePass(false);
    }
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
      // Fallback: remove blocking reminders if the column cannot be nulled
      await supabase.from('reminders').delete().eq('created_by_staff_id', id);
      const { error: retryError } = await supabase.from('staff').delete().eq('id', id);
      if (retryError) {
        showToast('Errore eliminazione membro: ' + retryError.message, 'error');
      } else {
        fetchData();
        showToast('Membro rimosso dallo staff', 'success');
      }
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
      p_name: newStaff.name.trim().toUpperCase(),
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

  const handleRemoveStaffPin = async () => {
    if (!editingStaff) return;
    const { error } = await supabase.rpc('update_staff_pin', {
      p_staff_id: editingStaff.id,
      p_new_pin: null,
    });
    if (error) {
      showToast('Errore rimozione PIN: ' + error.message, 'error');
    } else {
      setEditingStaff(null);
      setNewPin('');
      setConfirmPin('');
      setPinError('');
      showToast('PIN rimosso con successo', 'success');
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
    { id: 'settings', label: 'Bilancio', icon: SettingsIcon },
    { id: 'staff', label: 'Team', icon: Users },
    { id: 'products', label: 'Catalogo', icon: Layers },
    { id: 'inventory_management', label: 'Stock', icon: Boxes },
  ];

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 overflow-x-hidden">
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

      {/* ── 4-Tab Segmented Navigation Centrata ── */}
      <div className="flex justify-center w-full">
        <div className="spatial-segmented max-w-full" role="tablist">
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
      </div>

      {/* ── TAB 1: Home & Bilancio ── */}
      {activeTab === 'settings' && (
        <div className="space-y-4">
          {/* KPI Banner: total_net_earned */}
          <div className="spatial-panel p-5 sm:p-6 bg-gradient-to-br from-[#30D158]/10 via-transparent to-transparent border-[#30D158]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-[#30D158]/15 border border-[#30D158]/30 flex items-center justify-center text-[#30D158] shrink-0 shadow-lg shadow-[#30D158]/10">
                <TrendingUp size={24} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="spatial-caption text-xs uppercase tracking-wider text-white/60 font-semibold">
                    Total Net Earned
                  </span>
                  <span className="spatial-chip spatial-chip-green text-[10px] py-0.5">
                    settings.total_net_earned
                  </span>
                </div>
                <p className="spatial-amount text-3xl sm:text-4xl font-extrabold text-[#30D158] tracking-tight mt-0.5">
                  €{safeNumber(settings?.total_net_earned).toLocaleString('it-IT', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
                <p className="spatial-caption text-xs text-white/50 mt-0.5">
                  Guadagno netto totale accumulato attraverso tutte le sessioni e carichi chiusi
                </p>
              </div>
            </div>
            {settings?.last_reset_date && (
              <div className="text-left sm:text-right shrink-0 border-t sm:border-t-0 border-white/10 pt-2 sm:pt-0">
                <span className="spatial-caption text-[11px] text-white/40 block">
                  Ultimo Reset Sessione
                </span>
                <span className="spatial-headline text-xs font-semibold text-white/80">
                  {new Date(settings.last_reset_date).toLocaleString('it-IT')}
                </span>
              </div>
            )}
          </div>

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
                  unitario medio, aggiunge l'utile al <code className="text-[#30D158] font-bold">total_net_earned</code> e azzera il conteggio carichi.
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

            {/* Panel Bilancio Spese & Modifica Parametri */}
            <div className="spatial-panel p-6 flex flex-col justify-between">
              <div>
                <h3 className="spatial-headline text-lg font-semibold text-white mb-1">
                  Parametri Cassa & Bilancio
                </h3>
                <p className="spatial-caption text-white/50 mb-4">
                  Visualizza o modifica i parametri contabili salvati nel database
                </p>

                <form onSubmit={handleUpdateSettings} className="space-y-3.5">
                  {/* total_net_earned input */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="spatial-caption text-white/70 font-medium">
                        Total Net Earned (€)
                      </label>
                      <span className="text-[10px] text-[#30D158] font-semibold">
                        Utile Netto Storico
                      </span>
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      value={settings?.total_net_earned ?? ''}
                      onChange={(e) =>
                        setSettings((prev) =>
                          prev
                            ? { ...prev, total_net_earned: Number(e.target.value) }
                            : prev
                        )
                      }
                      className="w-full px-4 py-2.5 rounded-xl bg-white/10 border border-[#30D158]/30 text-[#30D158] font-bold spatial-amount focus:outline-none focus:border-[#30D158]"
                      placeholder="0.00"
                    />
                  </div>

                  {/* Spese Totali Carico */}
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
                      placeholder="0.00"
                    />
                  </div>

                  {/* Spese Extra */}
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
                      placeholder="0.00"
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

          {/* Card: Protezione Stealth & Passphrase Master */}
          <div className="spatial-panel-strong p-6 border-[#0A84FF]/30 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-[#0A84FF]/15 border border-[#0A84FF]/30 flex items-center justify-center text-[#0A84FF]">
                    <Shield size={16} />
                  </div>
                  <div>
                    <h3 className="spatial-headline text-lg font-semibold text-white">
                      Protezione Stealth & Passphrase Master
                    </h3>
                    <span className="spatial-caption text-xs text-white/50">
                      Cancello di accesso globale al terminale (Site Gatekeeper)
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#30D158]/10 border border-[#30D158]/20 text-[#30D158] text-[10px] font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#30D158] animate-pulse" />
                  GATE ATTIVO
                </div>
              </div>

              <p className="spatial-subhead text-xs text-white/60 mb-5">
                La passphrase master nasconde completamente il sito, il catalogo e l&apos;elenco operatori agli estranei.
                Nessuna informazione o schermata gestionale viene mostrata fino all&apos;inserimento della chiave corretta.
              </p>

              <form onSubmit={handleUpdateSitePass} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="spatial-caption block mb-1 text-white/70 font-medium">
                      Nuova Passphrase Master
                    </label>
                    <input
                      type="password"
                      value={newSitePass}
                      onChange={(e) => setNewSitePass(e.target.value)}
                      placeholder="Minimo 6 caratteri..."
                      className="w-full px-4 py-2.5 rounded-xl bg-white/10 border border-white/15 text-white font-mono text-sm focus:outline-none focus:border-[#0A84FF]"
                    />
                  </div>
                  <div>
                    <label className="spatial-caption block mb-1 text-white/70 font-medium">
                      Conferma Passphrase
                    </label>
                    <input
                      type="password"
                      value={confirmSitePass}
                      onChange={(e) => setConfirmSitePass(e.target.value)}
                      placeholder="Ripeti la passphrase..."
                      className="w-full px-4 py-2.5 rounded-xl bg-white/10 border border-white/15 text-white font-mono text-sm focus:outline-none focus:border-[#0A84FF]"
                    />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
                  <button
                    type="submit"
                    disabled={updatingSitePass || !newSitePass || !confirmSitePass}
                    className="spatial-btn-primary flex-1 h-11 text-xs font-semibold flex items-center justify-center gap-2 shadow-lg disabled:opacity-40"
                  >
                    <KeyRound size={14} />
                    <span>{updatingSitePass ? 'Aggiornamento...' : 'Aggiorna Passphrase Master'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={lockTerminal}
                    className="spatial-btn-ghost h-11 px-4 text-xs font-semibold flex items-center justify-center gap-2 text-white/70 hover:text-white border border-white/10"
                    title="Blocca subito il terminale per testare la schermata stealth"
                  >
                    <Lock size={14} />
                    <span>Testa Blocco Stealth</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: Team ── */}
      {activeTab === 'staff' && (
        <div className="space-y-4">
          {/* Header Action Bar */}
          <div className="flex items-center justify-between gap-3 bg-white/5 p-4 rounded-2xl border border-white/10">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white uppercase tracking-wider">
                Membri dello Staff
              </h2>
              <p className="spatial-caption text-xs text-white/50">
                {staff.length} {staff.length === 1 ? 'operatore registrato' : 'operatori registrati'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddStaff(true)}
              className="spatial-btn-primary h-9 px-4 text-xs font-semibold flex items-center gap-1.5 shadow-md shrink-0"
            >
              <Plus size={15} />
              <span>Nuovo Membro</span>
            </button>
          </div>

          {/* Staff Cards List */}
          <div className="space-y-2.5">
            {staff.map((s) => {
              const isStaffAdmin = s.role === 'admin';
              const isStaffMember = s.role === 'staff';
              const roleBadgeColor = isStaffAdmin
                ? 'bg-[#FF9F0A]/15 text-[#FF9F0A] border-[#FF9F0A]/30'
                : isStaffMember
                ? 'bg-[#0A84FF]/15 text-[#0A84FF] border-[#0A84FF]/30'
                : 'bg-[#BF5AF2]/15 text-[#BF5AF2] border-[#BF5AF2]/30';

              return (
                <div
                  key={s.id}
                  className="spatial-panel p-3.5 sm:p-4 border border-white/10 hover:border-white/20 transition-all flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div
                      className={cn(
                        'w-10 h-10 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center font-bold text-base shrink-0 border shadow-sm',
                        isStaffAdmin
                          ? 'bg-[#FF9F0A]/20 border-[#FF9F0A]/40 text-[#FF9F0A]'
                          : isStaffMember
                          ? 'bg-[#0A84FF]/20 border-[#0A84FF]/40 text-[#0A84FF]'
                          : 'bg-[#BF5AF2]/20 border-[#BF5AF2]/40 text-[#BF5AF2]'
                      )}
                    >
                      {s.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm sm:text-base font-bold text-white uppercase tracking-tight">
                          {s.name}
                        </span>
                        <span
                          className={cn(
                            'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border',
                            roleBadgeColor
                          )}
                        >
                          {s.role}
                        </span>
                      </div>

                      {/* Stato PIN Crittografato */}
                      <div className="mt-1 flex items-center gap-2">
                        {s.has_pin ? (
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#30D158] bg-[#30D158]/10 border border-[#30D158]/25 px-2.5 py-0.5 rounded-full">
                            <KeyRound size={11} /> PIN attivo (crittografato)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-[11px] text-white/40 bg-white/5 border border-white/10 px-2.5 py-0.5 rounded-full">
                            <KeyRound size={11} /> Senza PIN
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions: Sleek & Compact */}
                  <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setEditingStaffRole({ ...s })}
                      className="h-8 w-8 sm:w-auto sm:px-3 rounded-full text-xs font-semibold bg-white/10 hover:bg-white/20 active:scale-95 text-white transition-all flex items-center justify-center gap-1.5 border border-white/10"
                      title={`Modifica ruolo di ${s.name}`}
                    >
                      <UserCheck size={14} className="text-[#0A84FF]" />
                      <span className="hidden sm:inline">Ruolo</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingStaff(s);
                        setNewPin('');
                        setConfirmPin('');
                        setPinError('');
                      }}
                      className="h-8 w-8 sm:w-auto sm:px-3 rounded-full text-xs font-semibold bg-white/10 hover:bg-white/20 active:scale-95 text-white transition-all flex items-center justify-center gap-1.5 border border-white/10"
                      title={`Imposta o modifica PIN di ${s.name}`}
                    >
                      <KeyRound size={14} className="text-[#FF9F0A]" />
                      <span className="hidden sm:inline">PIN</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmDeleteId(s.id);
                        setConfirmDeleteType('staff');
                        setConfirmDeleteLabel(s.name);
                      }}
                      className="w-8 h-8 rounded-full bg-[#FF453A]/15 hover:bg-[#FF453A]/25 border border-[#FF453A]/30 text-[#FF453A] flex items-center justify-center transition-all active:scale-95 shrink-0"
                      title={`Elimina ${s.name}`}
                      aria-label={`Elimina ${s.name}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
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
          {/* Header Action Bar */}
          <div className="flex items-center justify-between gap-3 bg-white/5 p-4 rounded-2xl border border-white/10">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white uppercase tracking-wider">
                Giacenze & Varianti
              </h2>
              <p className="spatial-caption text-xs text-white/50">
                {variants.length} combinazioni prodotto registrate
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddVariant(true)}
              className="spatial-btn-primary h-9 px-4 text-xs font-semibold flex items-center gap-1.5 shadow-md shrink-0"
            >
              <Plus size={15} />
              <span>Nuova Variante</span>
            </button>
          </div>

          {/* Search Bar for Variants */}
          {variants.length > 5 && (
            <div className="spatial-search w-full">
              <Search size={16} className="text-white/40 shrink-0" />
              <input
                type="search"
                placeholder="Filtra per modello o gusto..."
                value={variantSearch}
                onChange={(e) => setVariantSearch(e.target.value)}
                aria-label="Filtra varianti"
              />
              {variantSearch && (
                <button
                  type="button"
                  onClick={() => setVariantSearch('')}
                  className="text-white/40 hover:text-white"
                >
                  <X size={15} />
                </button>
              )}
            </div>
          )}

          {variants.length === 0 ? (
            <EmptyState
              title="Nessuna variante presente"
              subtitle="Crea la prima combinazione modello-gusto con il tasto sopra"
            />
          ) : (
            <div className="space-y-2.5">
              {variants
                .filter((v) => {
                  if (!variantSearch) return true;
                  const s = variantSearch.toLowerCase();
                  return (
                    v.model_name.toLowerCase().includes(s) ||
                    v.flavor_name.toLowerCase().includes(s)
                  );
                })
                .map((v) => {
                  const isOutOfStock = (v.qty || 0) <= 0;
                  const isLowStock = (v.qty || 0) > 0 && (v.qty || 0) <= 3;

                  return (
                    <div
                      key={v.id}
                      className={cn(
                        'spatial-panel p-3.5 sm:p-4 border border-white/10 hover:border-white/20 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3.5',
                        !v.active && 'opacity-50'
                      )}
                    >
                      {/* Left: Product Info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-white/50 bg-white/5 px-2 py-0.5 rounded-full border border-white/10 max-w-full">
                            {v.model_name}
                          </span>
                          {isOutOfStock ? (
                            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-[#FF453A]/15 text-[#FF453A] border border-[#FF453A]/30">
                              Esaurito (0 pz)
                            </span>
                          ) : isLowStock ? (
                            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-[#FF9F0A]/15 text-[#FF9F0A] border border-[#FF9F0A]/30">
                              {v.qty} pz rimasti
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-[#30D158]/15 text-[#30D158] border border-[#30D158]/30">
                              {v.qty} pz disponibili
                            </span>
                          )}
                          {!v.active && (
                            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-white/10 text-white/40 border border-white/10">
                              Disattivata
                            </span>
                          )}
                        </div>

                        <h3 className="text-sm sm:text-base font-bold text-white tracking-tight break-words">
                          {v.flavor_name}
                        </h3>

                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs font-semibold text-[#0A84FF]">
                            €{Number(v.default_price).toFixed(2)}
                          </span>
                          <span className="text-[11px] text-white/40">prezzo listino</span>
                        </div>
                      </div>

                      {/* Right: Controls & Stepper */}
                      <div className="flex items-center justify-between sm:justify-end gap-2.5 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/10 shrink-0">
                        {/* Stepper */}
                        <div className="flex items-center gap-1.5 bg-white/10 rounded-full p-1 border border-white/15">
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateQty(v.id, Math.max(0, (v.qty || 0) - 1))
                            }
                            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 active:scale-90 flex items-center justify-center text-white text-base font-bold transition-all"
                            aria-label="Diminuisci stock"
                          >
                            −
                          </button>
                          <span className="spatial-amount text-sm font-extrabold w-8 text-center text-white">
                            {v.qty || 0}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleUpdateQty(v.id, (v.qty || 0) + 1)}
                            className="w-7 h-7 rounded-full bg-[#0A84FF] hover:bg-[#0070E0] active:scale-90 flex items-center justify-center text-white text-base font-bold transition-all shadow-[0_0_8px_rgba(10,132,255,0.4)]"
                            aria-label="Aumenta stock"
                          >
                            +
                          </button>
                        </div>

                        {/* Modifica Prezzo */}
                        <button
                          type="button"
                          onClick={() => setEditingVariant({ ...v })}
                          className="h-8 px-3 rounded-full text-xs font-semibold bg-white/10 hover:bg-white/20 active:scale-95 text-white transition-all flex items-center gap-1.5 border border-white/10"
                          title="Modifica prezzo di vendita"
                        >
                          <Edit3 size={13} className="text-[#0A84FF]" />
                          <span>Prezzo</span>
                        </button>

                        {/* Elimina */}
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmDeleteId(v.id);
                            setConfirmDeleteType('variant');
                            setConfirmDeleteLabel(`${v.model_name} ${v.flavor_name}`);
                          }}
                          className="w-8 h-8 rounded-full bg-[#FF453A]/15 hover:bg-[#FF453A]/25 border border-[#FF453A]/30 text-[#FF453A] flex items-center justify-center transition-all active:scale-95 shrink-0"
                          title="Elimina variante"
                          aria-label="Elimina variante"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
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
                      className="w-full px-4 py-2.5 rounded-2xl bg-white/10 border border-white/15 text-white uppercase placeholder:normal-case text-sm focus:outline-none focus:border-[#0A84FF]"
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
                  <div className="pb-1 text-center">
                    <span className="text-xs text-white/60">
                      Modifica PIN per <strong className="text-white uppercase">{editingStaff.name}</strong>
                    </span>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="spatial-caption block text-center mb-1 text-white/60">
                        Nuovo Codice PIN (4-8 cifre)
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
                    Salva Nuovo PIN (Crittografato)
                  </button>
                  {editingStaff.has_pin && (
                    <button
                      type="button"
                      onClick={handleRemoveStaffPin}
                      className="w-full h-10 text-xs font-semibold text-[#FF453A] hover:bg-[#FF453A]/10 rounded-xl transition-all border border-[#FF453A]/20 cursor-pointer"
                    >
                      Rimuovi PIN (Accesso senza PIN)
                    </button>
                  )}
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
