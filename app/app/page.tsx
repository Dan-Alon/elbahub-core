'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../dashboard/lib/firebase';

const DAY_KEYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

const timeToMinutes = (timeStr: string) => {
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

const calculateAccruedVacations = (hireDateStr: string) => {
  if (!hireDateStr) return 0;
  const hireDate = new Date(hireDateStr);
  const today = new Date();
  let months = (today.getFullYear() - hireDate.getFullYear()) * 12 - hireDate.getMonth() + today.getMonth();
  if (today.getDate() < hireDate.getDate()) months--;
  return months <= 0 ? 0 : Math.min(12, months) * 4;
};

export default function StaffPwaPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [staffInitials, setStaffInitials] = useState<string>('');
  const [staffProfile, setStaffProfile] = useState<any>(null);
  const [activities, setActivities] = useState<any[]>([]);
  const [weekStartDate] = useState('2026-04-13');
  const [pwaTab, setPwaTab] = useState<'agenda' | 'cuadrante' | 'saldos'>('agenda');
  const [selectedDay, setSelectedDay] = useState(0);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push('/');
        return;
      }
      const userSnap = await getDoc(doc(db, 'users', user.uid));
      if (userSnap.exists()) {
        setStaffInitials(userSnap.data().staffInitials || '');
      }
      setLoading(false);
    });
    return () => unsubAuth();
  }, [router]);

  useEffect(() => {
    if (!staffInitials) return;

    const unsubStaff = onSnapshot(collection(db, 'staff'), (snap) => {
      const found = snap.docs.map(d => d.data()).find(s => s.initials === staffInitials);
      if (found) setStaffProfile(found);
    });

    const unsubActs = onSnapshot(collection(db, 'activities'), (snap) => {
      setActivities(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubStaff();
      unsubActs();
    };
  }, [staffInitials]);

  const weekDays = useMemo(() => {
    const start = new Date(weekStartDate);
    const names = ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO', 'DOMINGO'];
    const shorts = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return { idx: i, name: names[i], short: `${d.getDate()} ${shorts[i]}` };
    });
  }, [weekStartDate]);

  const myAgenda = useMemo(() => {
    return activities
      .filter(a => a.week === weekStartDate && a.dayIdx === selectedDay && a.staff?.includes(staffInitials))
      .sort((a, b) => timeToMinutes(a.time.split('-')[0]) - timeToMinutes(b.time.split('-')[0]));
  }, [activities, weekStartDate, selectedDay, staffInitials]);

  if (loading) {
    return (
      <div className="min-h-screen w-full bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#0052cc] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto min-h-screen bg-slate-50 flex flex-col shadow-xl relative pb-24 overflow-x-hidden">
      <header className="w-full bg-gradient-to-b from-[#0052cc] to-[#0042a3] text-white px-5 pt-[max(2rem,env(safe-area-inset-top))] pb-5 rounded-b-3xl border-b-4 border-[#f59e0b] flex justify-between items-center shrink-0">
        <div className="min-w-0 pr-2">
          <h1 className="text-2xl font-black italic tracking-tighter truncate">
            Elba<span className="font-light">App</span>
          </h1>
          <p className="text-xs font-medium opacity-90 mt-0.5 uppercase tracking-widest truncate">
            Hola, {staffProfile?.name || staffInitials || 'Equipo'}
          </p>
        </div>
        <button
          onClick={async () => { await signOut(auth); router.push('/'); }}
          className="shrink-0 text-xs bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-lg font-bold"
        >
          Salir
        </button>
      </header>

      <main className="flex-1 w-full min-w-0 p-4 space-y-4">
        {pwaTab === 'agenda' && (
          <div className="w-full min-w-0">
            <div className="flex gap-2 overflow-x-auto pb-4 -mx-4 px-4 no-scrollbar">
              {weekDays.map(d => (
                <button
                  key={d.idx}
                  onClick={() => setSelectedDay(d.idx)}
                  className={`flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold border transition-colors ${selectedDay === d.idx ? 'bg-[#0052cc] text-white border-[#0052cc]' : 'bg-white text-slate-500 border-slate-200'}`}
                >
                  {d.short.toUpperCase()}
                </button>
              ))}
            </div>

            {myAgenda.length === 0 ? (
              <div className="w-full text-center text-slate-400 font-medium mt-6 p-6 bg-white rounded-2xl border border-slate-100">
                Sin actividades asignadas para hoy.
              </div>
            ) : (
              <div className="w-full space-y-3">
                {myAgenda.map(act => (
                  <div key={act.id} className="w-full bg-white rounded-2xl p-4 shadow-sm border border-slate-100 border-l-4 border-l-[#f59e0b]">
                    <div className="text-[#0052cc] font-black text-sm font-mono mb-1">{act.time}</div>
                    <div className="font-bold text-slate-800 break-words">{act.title}</div>
                    <div className="text-xs text-slate-500 font-medium mt-2">📍 {act.zone}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {pwaTab === 'cuadrante' && (
          <div className="w-full">
            <h2 className="font-black text-slate-800 mb-4 uppercase text-sm tracking-widest">Mi Turno Semanal</h2>
            <div className="w-full bg-white rounded-2xl shadow-sm border border-slate-200 divide-y divide-slate-100">
              {DAY_KEYS.map((key, i) => {
                const val = staffProfile?.[key] || '-';
                const isOff = val.toLowerCase().includes('libre') || val.toLowerCase().includes('vacaciones');
                return (
                  <div key={key} className="flex justify-between p-4 items-center gap-2">
                    <span className="font-bold text-slate-400 text-xs shrink-0">{weekDays[i].name}</span>
                    <span className={`text-sm font-black text-right ${isOff ? 'text-[#10b981]' : 'text-slate-800 font-mono'}`}>
                      {val.replace(',', ' / ')}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {pwaTab === 'saldos' && staffProfile && (
          <div className="w-full space-y-4">
            <h2 className="font-black text-slate-800 uppercase text-sm tracking-widest">Mi Perfil HR</h2>
            <div className="w-full bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-xs text-slate-400 font-bold uppercase mb-1">Vacaciones Disponibles</div>
              <div className="text-3xl font-black text-[#0052cc]">
                {calculateAccruedVacations(staffProfile.hireDate) - (staffProfile.vacationsTaken || 0)}{' '}
                <span className="text-sm font-medium text-slate-400">días</span>
              </div>
            </div>
            <div className="w-full bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-xs text-slate-400 font-bold uppercase mb-1">Bolsa Horas Extra</div>
              <div className={`text-2xl font-black ${(staffProfile.extraHours || 0) >= 0 ? 'text-[#10b981]' : 'text-red-500'}`}>
                {(staffProfile.extraHours || 0) > 0 ? '+' : ''}{staffProfile.extraHours || 0} h
              </div>
            </div>
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white border-t border-slate-200 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] flex justify-around items-center z-50">
        <button onClick={() => setPwaTab('agenda')} className={`flex flex-col items-center gap-1 ${pwaTab === 'agenda' ? 'text-[#0052cc]' : 'text-slate-400'}`}>
          <span className="text-xl">📅</span><span className="text-[10px] font-bold">Agenda</span>
        </button>
        <button onClick={() => setPwaTab('cuadrante')} className={`flex flex-col items-center gap-1 ${pwaTab === 'cuadrante' ? 'text-[#0052cc]' : 'text-slate-400'}`}>
          <span className="text-xl">🏢</span><span className="text-[10px] font-bold">Turnos</span>
        </button>
        <button onClick={() => setPwaTab('saldos')} className={`flex flex-col items-center gap-1 ${pwaTab === 'saldos' ? 'text-[#0052cc]' : 'text-slate-400'}`}>
          <span className="text-xl">👤</span><span className="text-[10px] font-bold">Mi Perfil</span>
        </button>
      </nav>
    </div>
  );
}