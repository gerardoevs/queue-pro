'use client';

import React, { useState, useEffect } from 'react';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { Counter, Branch, Service } from '@/types';
import {
  MonitorCheck,
  Plus,
  CheckCircle,
  XCircle,
  Edit2,
  Trash2,
  Loader2,
  X,
  Building2,
  Tag,
} from 'lucide-react';

export default function CountersPage() {
  const [counters, setCounters] = useState<Counter[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCounter, setEditingCounter] = useState<Counter | null>(null);

  // Form fields
  const [name, setName] = useState('');
  const [branchId, setBranchId] = useState('');
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubCounters = onSnapshot(
      collection(db, 'counters'),
      (snap) => {
        const list: Counter[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
        setCounters(list);
        setLoading(false);
      },
      (err) => {
        if (err.code !== 'permission-denied') console.error('Error listening to counters:', err);
        setLoading(false);
      }
    );

    const unsubBranches = onSnapshot(
      collection(db, 'branches'),
      (snap) => {
        const list: Branch[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
        setBranches(list);
      },
      (err) => {
        if (err.code !== 'permission-denied') console.error('Error listening to branches:', err);
      }
    );

    const unsubServices = onSnapshot(
      collection(db, 'services'),
      (snap) => {
        const list: Service[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
        setServices(list);
      },
      (err) => {
        if (err.code !== 'permission-denied') console.error('Error listening to services:', err);
      }
    );

    return () => {
      unsubCounters();
      unsubBranches();
      unsubServices();
    };
  }, []);

  const openCreateModal = () => {
    setEditingCounter(null);
    setName('');
    const firstBranch = branches.find((b) => b.active)?.id || branches[0]?.id || '';
    setBranchId(firstBranch);
    // Select all services available for this branch
    const available = services.filter((s) => s.branchIds?.includes(firstBranch)).map((s) => s.id);
    setSelectedServices(available);
    setActive(true);
    setError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (counter: Counter) => {
    setEditingCounter(counter);
    setName(counter.name);
    setBranchId(counter.branchId);
    setSelectedServices(counter.serviceIds || []);
    setActive(counter.active);
    setError(null);
    setIsModalOpen(true);
  };

  const handleBranchChange = (newBranchId: string) => {
    setBranchId(newBranchId);
    // Keep only services applicable to this branch
    const available = services.filter((s) => s.branchIds?.includes(newBranchId)).map((s) => s.id);
    setSelectedServices(available);
  };

  const toggleService = (srvId: string) => {
    if (selectedServices.includes(srvId)) {
      setSelectedServices(selectedServices.filter((id) => id !== srvId));
    } else {
      setSelectedServices([...selectedServices, srvId]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (!branchId) {
      setError('Debe seleccionar una sucursal.');
      return;
    }
    if (selectedServices.length === 0) {
      setError('Debe seleccionar al menos un servicio que atienda esta ventanilla.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (editingCounter) {
        await updateDoc(doc(db, 'counters', editingCounter.id), {
          name: name.trim(),
          branchId,
          serviceIds: selectedServices,
          active,
        });
      } else {
        const newDocRef = doc(collection(db, 'counters'));
        const newCounter: Counter = {
          id: newDocRef.id,
          name: name.trim(),
          branchId,
          serviceIds: selectedServices,
          active,
          createdAt: new Date().toISOString(),
        };
        await setDoc(newDocRef, newCounter);
      }
      setIsModalOpen(false);
    } catch (err: any) {
      setError(err?.message || 'Error al guardar la ventanilla');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (counter: Counter) => {
    try {
      await updateDoc(doc(db, 'counters', counter.id), {
        active: !counter.active,
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (counterId: string) => {
    if (!confirm('¿Está seguro de eliminar esta ventanilla?')) return;
    try {
      await deleteDoc(doc(db, 'counters', counterId));
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <MonitorCheck className="w-6 h-6 text-indigo-400" />
            Ventanillas y Puestos de Atención
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Configura los escritorios físicos de atención, sucursal a la que pertenecen y los trámites habilitados.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 transition self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Nueva Ventanilla
        </button>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mr-3" />
          <span>Cargando ventanillas...</span>
        </div>
      ) : counters.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">
          <MonitorCheck className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-200">No hay ventanillas configuradas</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            Crea ventanillas como "Ventanilla 1", "Módulo VIP" para que los agentes puedan iniciar sesión y llamar turnos.
          </p>
          <button
            onClick={openCreateModal}
            className="mt-4 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition"
          >
            Crear Ventanilla
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {counters.map((c) => {
            const branch = branches.find((b) => b.id === c.branchId);
            return (
              <div
                key={c.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between group hover:border-slate-700 transition"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-emerald-600/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                        <MonitorCheck className="w-4.5 h-4.5" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-100 text-sm leading-tight">{c.name}</h3>
                        <span className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <Building2 className="w-3 h-3 text-slate-500" />
                          {branch?.name || 'Sucursal desconocida'}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => toggleActive(c)}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-medium border flex items-center gap-1 transition ${
                        c.active
                          ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {c.active ? (
                        <>
                          <CheckCircle className="w-3 h-3" /> Activa
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3 h-3" /> Inactiva
                        </>
                      )}
                    </button>
                  </div>

                  {/* Services tags */}
                  <div className="my-3 pt-2.5 border-t border-slate-800/80">
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-1.5">
                      <Tag className="w-3 h-3 text-slate-500" />
                      <span>Servicios habilitados ({c.serviceIds?.length || 0}):</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {c.serviceIds?.map((sId) => {
                        const srv = services.find((s) => s.id === sId);
                        return (
                          <span
                            key={sId}
                            className="px-2 py-0.5 rounded-md bg-indigo-950/50 border border-indigo-500/30 text-[10px] text-indigo-300 font-medium"
                          >
                            {srv ? srv.name : sId}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-end gap-2">
                  <button
                    onClick={() => openEditModal(c)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-400 hover:bg-slate-800 transition"
                    title="Editar Ventanilla"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(c.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
                    title="Eliminar Ventanilla"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-base font-semibold text-white mb-4">
              {editingCounter ? 'Editar Ventanilla' : 'Nueva Ventanilla'}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Nombre de Ventanilla o Puesto *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ej. Ventanilla 1 (Atención Rápida)"
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Sucursal de Ubicación *
                </label>
                <select
                  value={branchId}
                  onChange={(e) => handleBranchChange(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="" disabled>
                    Seleccione una sucursal
                  </option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} {!b.active && '(Inactiva)'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Servicios que puede atender esta ventanilla *
                </label>
                {services.length === 0 ? (
                  <p className="text-xs text-amber-400">
                    No hay servicios configurados en el sistema.
                  </p>
                ) : (
                  <div className="max-h-36 overflow-y-auto space-y-1.5 p-2 bg-slate-950 rounded-xl border border-slate-800">
                    {services
                      .filter((s) => !branchId || s.branchIds?.includes(branchId))
                      .map((s) => (
                        <label
                          key={s.id}
                          className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-900 cursor-pointer text-xs text-slate-300"
                        >
                          <input
                            type="checkbox"
                            checked={selectedServices.includes(s.id)}
                            onChange={() => toggleService(s.id)}
                            className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-700 bg-slate-950"
                          />
                          <span className="font-mono text-indigo-400 font-bold">[{s.prefix}]</span>
                          <span>{s.name}</span>
                        </label>
                      ))}
                  </div>
                )}
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-700 bg-slate-950"
                  />
                  <span className="text-xs text-slate-300">Ventanilla Habilitada para Atención</span>
                </label>
              </div>

              {error && (
                <div className="p-2.5 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-medium transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs text-white font-medium shadow-md shadow-indigo-600/25 flex items-center gap-2 transition disabled:opacity-50"
                >
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {editingCounter ? 'Guardar Cambios' : 'Crear Ventanilla'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
