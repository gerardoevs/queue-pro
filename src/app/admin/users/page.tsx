'use client';

import React, { useState, useEffect } from 'react';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';
import { db, auth } from '@/lib/firebase/config';
import { createNewUserWithoutLosingSession } from '@/lib/firebase/secondary';
import type { UserProfile, UserRole, Branch, Counter } from '@/types';
import {
  Users,
  UserPlus,
  Shield,
  Monitor,
  Headphones,
  CheckCircle,
  XCircle,
  Building2,
  MonitorCheck,
  Loader2,
  X,
  AlertCircle,
  KeyRound,
  Mail,
  User,
  Pencil,
  Send,
  Check,
} from 'lucide-react';

export default function UsersManagementPage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [counters, setCounters] = useState<Counter[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('agent');
  const [branchId, setBranchId] = useState('');
  const [defaultCounterId, setDefaultCounterId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Password reset state
  const [sendingReset, setSendingReset] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    const unsubUsers = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        const list: UserProfile[] = [];
        snap.forEach((d) => list.push({ ...(d.data() as any), uid: d.id }));
        setUsers(list);
        setLoading(false);
      },
      (err) => {
        if (err.code !== 'permission-denied') console.error('Error listening to users:', err);
        setLoading(false);
      }
    );

    const unsubBranches = onSnapshot(
      collection(db, 'branches'),
      (snap) => {
        const list: Branch[] = [];
        snap.forEach((d) => list.push({ ...(d.data() as any), id: d.id }));
        setBranches(list);
      },
      (err) => {
        if (err.code !== 'permission-denied') console.error('Error listening to branches:', err);
      }
    );

    const unsubCounters = onSnapshot(
      collection(db, 'counters'),
      (snap) => {
        const list: Counter[] = [];
        snap.forEach((d) => list.push({ ...(d.data() as any), id: d.id }));
        setCounters(list);
      },
      (err) => {
        if (err.code !== 'permission-denied') console.error('Error listening to counters:', err);
      }
    );

    return () => {
      unsubUsers();
      unsubBranches();
      unsubCounters();
    };
  }, []);

  const getDefaultBranchId = () => {
    return branches.find((b) => b.active)?.id || branches[0]?.id || '';
  };

  const openCreateModal = () => {
    setEditingUser(null);
    setName('');
    setEmail('');
    setPassword('');
    setRole('agent');
    setBranchId(getDefaultBranchId());
    setDefaultCounterId('');
    setError(null);
    setResetSent(false);
    setIsModalOpen(true);
  };

  const openEditModal = (user: UserProfile) => {
    setEditingUser(user);
    setName(user.name || '');
    setEmail(user.email || '');
    setPassword('');
    setRole(user.role);

    const matchedBranch = branches.find(
      (b) => b.id === user.branchId || (user.branchId && b.name === user.branchId)
    );
    const initialBranchId = matchedBranch
      ? matchedBranch.id
      : user.role !== 'admin'
      ? getDefaultBranchId()
      : '';

    setBranchId(initialBranchId);

    const hasValidCounter = Boolean(
      user.defaultCounterId &&
        counters.some((c) => c.id === user.defaultCounterId && c.branchId === initialBranchId)
    );
    setDefaultCounterId(hasValidCounter ? user.defaultCounterId! : '');
    setError(null);
    setResetSent(false);
    setIsModalOpen(true);
  };

  const handleRoleChange = (newRole: UserRole) => {
    setRole(newRole);
    if (newRole !== 'admin') {
      const isValidCurrentBranch = Boolean(branchId && branches.some((b) => b.id === branchId));
      if (!isValidCurrentBranch) {
        setBranchId(getDefaultBranchId());
      }
    }
    if (newRole !== 'agent') {
      setDefaultCounterId('');
    }
  };

  const handleBranchChange = (newBranchId: string) => {
    setBranchId(newBranchId);
    setDefaultCounterId('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Por favor ingresa un nombre para el usuario.');
      return;
    }

    if (!editingUser) {
      if (!email.trim() || !password) {
        setError('Por favor complete todos los campos obligatorios.');
        return;
      }

      if (password.length < 6) {
        setError('La contraseña inicial debe tener al menos 6 caracteres.');
        return;
      }
    }

    const selectedBranch = branches.find((b) => b.id === branchId);

    if ((role === 'agent' || role === 'kiosk') && !selectedBranch) {
      setError('Es obligatorio asignar una sucursal válida para roles de Agente y Kiosko.');
      return;
    }

    const resolvedBranchId = selectedBranch ? selectedBranch.id : '';

    setSaving(true);
    try {
      if (editingUser) {
        // Update user profile in Firestore
        await setDoc(
          doc(db, 'users', editingUser.uid),
          {
            uid: editingUser.uid,
            name: name.trim(),
            role,
            branchId: resolvedBranchId,
            defaultCounterId: role === 'agent' ? defaultCounterId : '',
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      } else {
        // Create new user in Firebase Auth and Firestore
        await createNewUserWithoutLosingSession({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          role,
          branchId: resolvedBranchId,
          defaultCounterId: role === 'agent' ? defaultCounterId : '',
        });
      }

      setIsModalOpen(false);
    } catch (err: any) {
      console.error('Error saving user:', err);
      if (err.code === 'auth/email-already-in-use') {
        setError('El correo electrónico ya se encuentra registrado.');
      } else {
        setError(err.message || 'Error al procesar la solicitud.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSendPasswordReset = async () => {
    if (!editingUser?.email) return;
    setSendingReset(true);
    setError(null);
    try {
      await sendPasswordResetEmail(auth, editingUser.email);
      setResetSent(true);
      setTimeout(() => setResetSent(false), 5000);
    } catch (err: any) {
      console.error('Error sending reset email:', err);
      setError('No se pudo enviar el correo de recuperación: ' + (err.message || 'Error desconocido'));
    } finally {
      setSendingReset(false);
    }
  };

  const toggleUserActive = async (userProfile: UserProfile) => {
    try {
      await updateDoc(doc(db, 'users', userProfile.uid), {
        active: !userProfile.active,
      });
    } catch (err) {
      console.error('Error updating user status:', err);
    }
  };

  const getRoleBadge = (userRole: UserRole) => {
    switch (userRole) {
      case 'admin':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-purple-950/60 text-purple-300 border border-purple-500/30">
            <Shield className="w-3 h-3" />
            Administrador
          </span>
        );
      case 'agent':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-950/60 text-blue-300 border border-blue-500/30">
            <Headphones className="w-3 h-3" />
            Agente Ventanilla
          </span>
        );
      case 'kiosk':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-950/60 text-emerald-300 border border-emerald-500/30">
            <Monitor className="w-3 h-3" />
            Kiosko Táctil
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-4 sm:pb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Users className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-400 shrink-0" />
            <span>Gestión de Usuarios y Roles</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Administra, edita y crea cuentas de agentes, tótems táctiles y administradores.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 transition w-full sm:w-auto cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          Registrar Usuario
        </button>
      </div>

      {/* Users List (Mobile Cards + Desktop Table) */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mr-3" />
          <span>Cargando usuarios...</span>
        </div>
      ) : (
        <>
          {/* Mobile & Small Tablet Cards (< md) */}
          <div className="md:hidden grid grid-cols-1 sm:grid-cols-2 gap-4">
            {users.map((u) => {
              const branch = branches.find(
                (b) => b.id === u.branchId || (u.branchId && b.name === u.branchId)
              );
              const counter = counters.find((c) => c.id === u.defaultCounterId);
              return (
                <div
                  key={u.uid}
                  className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col justify-between gap-3"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-100 text-sm truncate">{u.name}</div>
                        <div className="text-[11px] text-slate-500 font-mono truncate">{u.email}</div>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border shrink-0 ${
                          u.active
                            ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30'
                            : 'bg-rose-950/40 text-rose-400 border-rose-500/30'
                        }`}
                      >
                        {u.active ? (
                          <>
                            <CheckCircle className="w-2.5 h-2.5" /> Activo
                          </>
                        ) : (
                          <>
                            <XCircle className="w-2.5 h-2.5" /> Inactivo
                          </>
                        )}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {getRoleBadge(u.role)}
                    </div>

                    <div className="space-y-1 text-xs text-slate-400 pt-2 border-t border-slate-800/80">
                      <div className="flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span className="text-slate-400">Sucursal:</span>
                        {branch ? (
                          <span className="text-slate-200 font-medium truncate">{branch.name}</span>
                        ) : u.role === 'admin' ? (
                          <span className="text-slate-500 italic">Acceso Global</span>
                        ) : (
                          <span className="text-amber-400">Sin sucursal</span>
                        )}
                      </div>

                      {u.role === 'agent' && (
                        <div className="flex items-center gap-1.5">
                          <MonitorCheck className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span className="text-slate-400">Ventanilla:</span>
                          {counter ? (
                            <span className="text-slate-200 font-medium truncate">{counter.name}</span>
                          ) : (
                            <span className="text-slate-500">Al iniciar sesión</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2.5 border-t border-slate-800/80">
                    <button
                      onClick={() => openEditModal(u)}
                      className="flex-1 py-2 px-3 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/80 transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Editar</span>
                    </button>
                    <button
                      onClick={() => toggleUserActive(u)}
                      className={`py-2 px-3 rounded-xl text-xs font-medium transition cursor-pointer border ${
                        u.active
                          ? 'text-rose-400 border-rose-500/20 hover:bg-rose-500/10'
                          : 'text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/10'
                      }`}
                    >
                      {u.active ? 'Desactivar' : 'Activar'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table (>= md) */}
          <div className="hidden md:block bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 uppercase tracking-wider font-semibold text-[10px]">
                  <tr>
                    <th className="py-3.5 px-4">Usuario</th>
                    <th className="py-3.5 px-4">Rol Asignado</th>
                    <th className="py-3.5 px-4">Sucursal</th>
                    <th className="py-3.5 px-4">Ventanilla Predeterminada</th>
                    <th className="py-3.5 px-4">Estado</th>
                    <th className="py-3.5 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {users.map((u) => {
                    const branch = branches.find(
                      (b) => b.id === u.branchId || (u.branchId && b.name === u.branchId)
                    );
                    const counter = counters.find((c) => c.id === u.defaultCounterId);
                    return (
                      <tr key={u.uid} className="hover:bg-slate-800/30 transition">
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-100 text-sm">{u.name}</div>
                          <div className="text-[11px] text-slate-500 font-mono">{u.email}</div>
                        </td>
                        <td className="py-3.5 px-4">{getRoleBadge(u.role)}</td>
                        <td className="py-3.5 px-4">
                          {branch ? (
                            <span className="flex items-center gap-1.5 text-slate-300">
                              <Building2 className="w-3.5 h-3.5 text-slate-500" />
                              {branch.name}
                            </span>
                          ) : u.role === 'admin' ? (
                            <span className="text-slate-500 italic">Acceso Global</span>
                          ) : (
                            <span className="text-amber-400">Sin sucursal</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          {counter ? (
                            <span className="flex items-center gap-1.5 text-slate-300">
                              <MonitorCheck className="w-3.5 h-3.5 text-slate-500" />
                              {counter.name}
                            </span>
                          ) : (
                            <span className="text-slate-500">--</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                              u.active
                                ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30'
                                : 'bg-rose-950/40 text-rose-400 border-rose-500/30'
                            }`}
                          >
                            {u.active ? (
                              <>
                                <CheckCircle className="w-2.5 h-2.5" /> Activo
                              </>
                            ) : (
                              <>
                                <XCircle className="w-2.5 h-2.5" /> Inactivo
                              </>
                            )}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => openEditModal(u)}
                              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/80 transition flex items-center gap-1.5 cursor-pointer"
                              title="Editar datos del usuario"
                            >
                              <Pencil className="w-3.5 h-3.5 text-indigo-400" />
                              <span>Editar</span>
                            </button>
                            <button
                              onClick={() => toggleUserActive(u)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer border ${
                                u.active
                                  ? 'text-rose-400 border-rose-500/20 hover:bg-rose-500/10'
                                  : 'text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/10'
                              }`}
                            >
                              {u.active ? 'Desactivar' : 'Activar'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Modal: Create & Edit User */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl sm:rounded-3xl w-full max-w-lg p-5 sm:p-6 shadow-2xl relative max-h-[92vh] overflow-y-auto">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-5 right-5 p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-white mb-1">
              {editingUser ? 'Editar Datos de Usuario' : 'Registrar Nuevo Usuario'}
            </h3>
            <p className="text-xs text-slate-400 mb-5">
              {editingUser
                ? 'Actualiza el nombre, rol asignado, sucursal u opciones de ventanilla.'
                : 'Crea la cuenta en Firebase Auth y asigna su rol sin cerrar la sesión del Administrador.'}
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Nombre Completo / Identificador *
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                      <User className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="ej. Juan Pérez (Agente) o Tótem Entrada 1"
                      className="w-full pl-9 pr-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div className={editingUser ? 'sm:col-span-2' : ''}>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Correo Electrónico {editingUser ? '(Identificador de Acceso)' : '*'}
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      type="email"
                      required={!editingUser}
                      disabled={Boolean(editingUser)}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="agente1@empresa.com"
                      className={`w-full pl-9 pr-3.5 py-2 border rounded-xl text-sm focus:outline-none ${
                        editingUser
                          ? 'bg-slate-950/60 border-slate-800 text-slate-400 cursor-not-allowed select-none'
                          : 'bg-slate-950 border-slate-700 text-slate-100 focus:ring-2 focus:ring-indigo-500'
                      }`}
                    />
                  </div>
                  {editingUser && (
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      El correo es la credencial principal de autenticación en Firebase.
                    </span>
                  )}
                </div>

                {!editingUser && (
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Contraseña Inicial *
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                        <KeyRound className="w-4 h-4" />
                      </div>
                      <input
                        type="password"
                        required
                        minLength={6}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Mínimo 6 caracteres"
                        className="w-full pl-9 pr-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Password Reset Action in Edit Mode */}
              {editingUser && (
                <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                      <KeyRound className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-200">
                        Restablecimiento de Contraseña
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Envía un enlace de cambio de contraseña al correo del usuario.
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleSendPasswordReset}
                    disabled={sendingReset || resetSent}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition shrink-0 cursor-pointer ${
                      resetSent
                        ? 'bg-emerald-950/80 border border-emerald-500/30 text-emerald-300'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20'
                    }`}
                  >
                    {sendingReset ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : resetSent ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>¡Correo Enviado!</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>Enviar Correo</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Role Selection */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-2">
                  Rol del Usuario *
                </label>
                <div className="grid grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleRoleChange('agent')}
                    className={`p-3 rounded-2xl border text-center transition flex flex-col items-center gap-1.5 cursor-pointer ${
                      role === 'agent'
                        ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-600/20'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <Headphones className="w-4 h-4" />
                    <span className="text-xs font-semibold">Agente</span>
                    <span className="text-[10px] opacity-80 leading-tight">Atención</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRoleChange('kiosk')}
                    className={`p-3 rounded-2xl border text-center transition flex flex-col items-center gap-1.5 cursor-pointer ${
                      role === 'kiosk'
                        ? 'bg-emerald-600 text-white border-emerald-500 shadow-lg shadow-emerald-600/20'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <Monitor className="w-4 h-4" />
                    <span className="text-xs font-semibold">Kiosko</span>
                    <span className="text-[10px] opacity-80 leading-tight">Tótem Táctil</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRoleChange('admin')}
                    className={`p-3 rounded-2xl border text-center transition flex flex-col items-center gap-1.5 cursor-pointer ${
                      role === 'admin'
                        ? 'bg-purple-600 text-white border-purple-500 shadow-lg shadow-purple-600/20'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <Shield className="w-4 h-4" />
                    <span className="text-xs font-semibold">Admin</span>
                    <span className="text-[10px] opacity-80 leading-tight">Total</span>
                  </button>
                </div>
              </div>

              {/* Branch Selection */}
              <div className="space-y-4 pt-1">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Sucursal Asignada {role !== 'admin' ? '*' : '(Opcional)'}
                  </label>
                  <select
                    value={branchId}
                    onChange={(e) => handleBranchChange(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">
                      {role === 'admin'
                        ? 'Acceso Global (Todas las sucursales)'
                        : '-- Seleccione la sucursal de operación --'}
                    </option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} {!b.active && '(Inactiva)'}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Default Counter for Agent */}
                {role === 'agent' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Ventanilla Predeterminada (Opcional)
                    </label>
                    <select
                      value={defaultCounterId}
                      onChange={(e) => setDefaultCounterId(e.target.value)}
                      className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">Ninguna (El agente la elegirá al iniciar)</option>
                      {counters
                        .filter((c) => !branchId || c.branchId === branchId)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                  </div>
                )}
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-medium transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs text-white font-medium shadow-md shadow-indigo-600/25 flex items-center gap-2 transition disabled:opacity-50 cursor-pointer"
                >
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {editingUser ? 'Guardar Cambios' : 'Crear Usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
