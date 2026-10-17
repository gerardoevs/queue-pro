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
import type { Service, Branch } from '@/types';
import {
  Tag,
  Plus,
  CheckCircle,
  XCircle,
  Edit2,
  Trash2,
  Loader2,
  X,
  Building2,
  Hash,
} from 'lucide-react';

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);

  // Form fields
  const [name, setName] = useState('');
  const [prefix, setPrefix] = useState('');
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Listen to services
  useEffect(() => {
    const unsubServices = onSnapshot(
      collection(db, 'services'),
      (snap) => {
        const list: Service[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
        setServices(list);
        setLoading(false);
      },
      (err) => {
        if (err.code !== 'permission-denied') console.error('Error listening to services:', err);
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

    return () => {
      unsubServices();
      unsubBranches();
    };
  }, []);

  const openCreateModal = () => {
    setEditingService(null);
    setName('');
    setPrefix('');
    // By default select all active branches
    setSelectedBranches(branches.filter((b) => b.active).map((b) => b.id));
    setActive(true);
    setError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (service: Service) => {
    setEditingService(service);
    setName(service.name);
    setPrefix(service.prefix);
    setSelectedBranches(service.branchIds || []);
    setActive(service.active);
    setError(null);
    setIsModalOpen(true);
  };

  const toggleBranchSelection = (branchId: string) => {
    if (selectedBranches.includes(branchId)) {
      setSelectedBranches(selectedBranches.filter((id) => id !== branchId));
    } else {
      setSelectedBranches([...selectedBranches, branchId]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (!prefix.trim()) {
      setError('El prefijo del ticket es obligatorio (ej. CAJ, ATC)');
      return;
    }
    if (selectedBranches.length === 0) {
      setError('Debe seleccionar al menos una sucursal para este servicio');
      return;
    }

    setSaving(true);
    setError(null);

    const cleanPrefix = prefix.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

    try {
      if (editingService) {
        await updateDoc(doc(db, 'services', editingService.id), {
          name: name.trim(),
          prefix: cleanPrefix,
          branchIds: selectedBranches,
          active,
        });
      } else {
        const newDocRef = doc(collection(db, 'services'));
        const newService: Service = {
          id: newDocRef.id,
          name: name.trim(),
          prefix: cleanPrefix,
          branchIds: selectedBranches,
          active,
          createdAt: new Date().toISOString(),
        };
        await setDoc(newDocRef, newService);
      }
      setIsModalOpen(false);
    } catch (err: any) {
      setError(err?.message || 'Error al guardar el servicio');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (service: Service) => {
    try {
      await updateDoc(doc(db, 'services', service.id), {
        active: !service.active,
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (serviceId: string) => {
    if (!confirm('¿Está seguro de eliminar este servicio? Los tickets históricos mantendrán su registro.')) return;
    try {
      await deleteDoc(doc(db, 'services', serviceId));
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-4 sm:pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Tag className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-400 shrink-0" />
            <span>Servicios y Trámites</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Define los tipos de atención disponibles en los tótems con sus prefijos correlativos (ej. CAJ-001).
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 transition w-full sm:w-auto cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Nuevo Servicio
        </button>
      </div>

      {/* Services Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mr-3" />
          <span>Cargando servicios...</span>
        </div>
      ) : services.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 sm:p-12 text-center">
          <Tag className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-200">No hay servicios configurados</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            Agrega servicios como Caja, Atención al Cliente o Asesoría para que aparezcan en los Kioskos táctiles.
          </p>
          <button
            onClick={openCreateModal}
            className="mt-4 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition cursor-pointer"
          >
            Crear Servicio
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {services.map((srv) => (
            <div
              key={srv.id}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col justify-between group hover:border-slate-700 transition"
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-violet-600/10 border border-violet-500/20 flex items-center justify-center text-violet-400 font-bold font-mono text-sm shrink-0">
                      {srv.prefix}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-slate-100 text-sm leading-tight truncate">{srv.name}</h3>
                      <span className="text-[11px] text-slate-400 block">
                        Prefijo:{' '}
                        <span className="font-mono text-indigo-400 font-semibold">{srv.prefix}-###</span>
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => toggleActive(srv)}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-medium border flex items-center gap-1 transition shrink-0 cursor-pointer ${
                      srv.active
                        ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    {srv.active ? (
                      <>
                        <CheckCircle className="w-3 h-3" /> Activo
                      </>
                    ) : (
                      <>
                        <XCircle className="w-3 h-3" /> Inactivo
                      </>
                    )}
                  </button>
                </div>

                {/* Branches badge list */}
                <div className="my-3 pt-2.5 border-t border-slate-800/80">
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-1.5">
                    <Building2 className="w-3 h-3 text-slate-500" />
                    <span>Disponible en:</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {srv.branchIds?.map((bId) => {
                      const branch = branches.find((b) => b.id === bId);
                      return (
                        <span
                          key={bId}
                          className="px-2 py-0.5 rounded-md bg-slate-800/70 border border-slate-700/60 text-[10px] text-slate-300 font-medium"
                        >
                          {branch ? branch.name : bId}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Card Footer */}
              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-end gap-2">
                <button
                  onClick={() => openEditModal(srv)}
                  className="p-2 rounded-lg text-slate-400 hover:text-indigo-400 hover:bg-slate-800 transition cursor-pointer"
                  title="Editar Servicio"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(srv.id)}
                  className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                  title="Eliminar Servicio"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-5 sm:p-6 shadow-2xl relative max-h-[92vh] overflow-y-auto">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-base font-semibold text-white mb-4">
              {editingService ? 'Editar Servicio' : 'Nuevo Servicio'}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Nombre del Servicio *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ej. Atención al Cliente"
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Prefijo de Ticket (2 a 5 letras/números) *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                    <Hash className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    maxLength={5}
                    value={prefix}
                    onChange={(e) => setPrefix(e.target.value.toUpperCase())}
                    placeholder="ej. ATC"
                    className="w-full pl-9 pr-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm font-mono font-bold text-slate-100 uppercase focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Ejemplo de correlativo generado: <span className="font-mono text-indigo-400 font-semibold">{prefix || 'XXX'}-001</span>
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Sucursales donde se ofrecerá *
                </label>
                {branches.length === 0 ? (
                  <p className="text-xs text-amber-400">
                    Primero debes registrar al menos una sucursal en el sistema.
                  </p>
                ) : (
                  <div className="max-h-36 overflow-y-auto space-y-1.5 p-2 bg-slate-950 rounded-xl border border-slate-800">
                    {branches.map((b) => (
                      <label
                        key={b.id}
                        className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-900 cursor-pointer text-xs text-slate-300"
                      >
                        <input
                          type="checkbox"
                          checked={selectedBranches.includes(b.id)}
                          onChange={() => toggleBranchSelection(b.id)}
                          className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-700 bg-slate-950"
                        />
                        <span>{b.name}</span>
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
                  <span className="text-xs text-slate-300">Servicio Activo para el Kiosko</span>
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
                  {editingService ? 'Guardar Cambios' : 'Crear Servicio'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
