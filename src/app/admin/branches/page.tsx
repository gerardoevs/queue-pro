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
import type { Branch } from '@/types';
import {
  Building2,
  Plus,
  MapPin,
  Phone,
  CheckCircle,
  XCircle,
  Edit2,
  Trash2,
  Loader2,
  X,
} from 'lucide-react';

export default function BranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);

  // Form fields
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'branches'),
      (snapshot) => {
        const list: Branch[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ ...(docSnap.data() as any), id: docSnap.id });
        });
        setBranches(list);
        setLoading(false);
      },
      (err) => {
        if (err.code !== 'permission-denied') {
          console.error('Error fetching branches:', err);
        }
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const openCreateModal = () => {
    setEditingBranch(null);
    setName('');
    setAddress('');
    setPhone('');
    setActive(true);
    setIsModalOpen(true);
  };

  const openEditModal = (branch: Branch) => {
    setEditingBranch(branch);
    setName(branch.name);
    setAddress(branch.address);
    setPhone(branch.phone || '');
    setActive(branch.active);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);

    try {
      if (editingBranch) {
        await updateDoc(doc(db, 'branches', editingBranch.id), {
          name: name.trim(),
          address: address.trim(),
          phone: phone.trim(),
          active,
        });
      } else {
        const newDocRef = doc(collection(db, 'branches'));
        const newBranch: Branch = {
          id: newDocRef.id,
          name: name.trim(),
          address: address.trim(),
          phone: phone.trim(),
          active,
          createdAt: new Date().toISOString(),
        };
        await setDoc(newDocRef, newBranch);
      }
      setIsModalOpen(false);
    } catch (err) {
      console.error('Error saving branch:', err);
    } finally {
      setSaving(false);
    }
  };

  const toggleBranchActive = async (branch: Branch) => {
    try {
      await updateDoc(doc(db, 'branches', branch.id), {
        active: !branch.active,
      });
    } catch (err) {
      console.error('Error toggling branch active:', err);
    }
  };

  const handleDelete = async (branchId: string) => {
    if (!confirm('¿Está seguro de eliminar esta sucursal?')) return;
    try {
      await deleteDoc(doc(db, 'branches', branchId));
    } catch (err) {
      console.error('Error deleting branch:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Building2 className="w-6 h-6 text-indigo-400" />
            Gestión de Sucursales
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Administra las sedes físicas donde operan los tótems y ventanillas de atención.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 transition self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Nueva Sucursal
        </button>
      </div>

      {/* Branches List */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mr-3" />
          <span>Cargando sucursales...</span>
        </div>
      ) : branches.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">
          <Building2 className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-200">No hay sucursales registradas</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            Crea la primera sucursal para poder asociar servicios, ventanillas y tótems de turno.
          </p>
          <button
            onClick={openCreateModal}
            className="mt-4 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition"
          >
            Crear Sucursal
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {branches.map((b) => (
            <div
              key={b.id}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between group hover:border-slate-700 transition"
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                      <Building2 className="w-4.5 h-4.5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-100 text-sm">{b.name}</h3>
                      <span className="text-[10px] font-mono text-slate-500">ID: {b.id}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleBranchActive(b)}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-medium border flex items-center gap-1 transition ${
                      b.active
                        ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    {b.active ? (
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

                <div className="space-y-1.5 text-xs text-slate-400 my-3">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span className="truncate">{b.address || 'Sin dirección registrada'}</span>
                  </div>
                  {b.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span>{b.phone}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Card Footer Actions */}
              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-end gap-2">
                <button
                  onClick={() => openEditModal(b)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-400 hover:bg-slate-800 transition"
                  title="Editar Sucursal"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(b.id)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
                  title="Eliminar Sucursal"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
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
              {editingBranch ? 'Editar Sucursal' : 'Nueva Sucursal'}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Nombre de Sucursal *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ej. Sucursal Norte"
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Dirección
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="ej. Av. Las Américas 450"
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Teléfono
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="ej. +1 (555) 0192"
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-700 bg-slate-950"
                  />
                  <span className="text-xs text-slate-300">Sucursal Activa para Operación</span>
                </label>
              </div>

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
                  {editingBranch ? 'Guardar Cambios' : 'Crear Sucursal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
