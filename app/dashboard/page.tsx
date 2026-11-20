'use client';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, setDoc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { db, auth } from './lib/firebase';
import React, { useState, useMemo, useEffect } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend);

// --- DATOS INICIALES ENRIQUECIDOS (Fecha alta, vacaciones, extras) ---
const initialStaffData = [
  { id: "G.O", name: "Daniel Mendizabal", initials: "Dan", phone: "", email: "", hireDate: "2025-10-01", vacationsTaken: 5, extraHours: 12.5, L: "10:30-18:30", M: "10:30-18:30", X: "10:30-18:30", J: "10:30-18:30", V: "10:30-18:30", S: "Libre", D: "Libre" },
  { id: "Anim1", name: "Raquel Escolano", initials: "Reichel", phone: "", email: "", hireDate: "2026-03-15", vacationsTaken: 0, extraHours: 0, L: "Libre", M: "Libre", X: "10:30-18:30", J: "10:30-18:30", V: "10:30-18:30", S: "10:30-18:30", D: "10:30-18:30" },
  { id: "Anim2", name: "Marta Benavente", initials: "Martu", phone: "", email: "", hireDate: "2026-01-01", vacationsTaken: 10, extraHours: -4, L: "10:00-18:00", M: "10:00-18:00", X: "10:00-18:00", J: "10:00-18:00", V: "10:00-18:00", S: "Libre", D: "Libre" },
  { id: "Anim3", name: "Ana Lidia Diaz", initials: "Lana", phone: "", email: "", hireDate: "2026-05-01", vacationsTaken: 2, extraHours: 0, L: "Libre", M: "Libre", X: "10:30-18:30", J: "10:30-18:30", V: "10:30-18:30", S: "10:30-18:30", D: "10:30-18:30" },
  { id: "Anim4", name: "Alba Romero", initials: "Alba", phone: "", email: "", hireDate: "2026-06-01", vacationsTaken: 0, extraHours: 0, L: "Libre", M: "Libre", X: "10:30-18:30", J: "10:30-18:30", V: "10:30-18:30", S: "10:30-18:30", D: "10:30-18:30" },
  { id: "Anim5", name: "Syria Suma", initials: "Syria", phone: "", email: "", hireDate: "2026-02-01", vacationsTaken: 12, extraHours: 8, L: "10:30-18:30", M: "10:30-18:30", X: "10:30-18:30", J: "10:30-18:30", V: "10:30-18:30", S: "Libre", D: "Libre" },
  { id: "Anim6", name: "Riccardo Sarappa", initials: "Ricky", phone: "", email: "", hireDate: "2026-01-15", vacationsTaken: 15, extraHours: 2, L: "10:30-18:30", M: "10:30-18:30", X: "10:30-18:30", J: "10:30-18:30", V: "10:30-18:30", S: "Libre", D: "Libre" },
  { id: "Anim7", name: "Anim7", initials: "A7", phone: "", email: "", hireDate: "2026-01-01", vacationsTaken: 0, extraHours: 0, L: "Recup.", M: "Recup.", X: "Recup.", J: "Recup.", V: "Recup.", S: "Recup.", D: "Recup." },
  { id: "Anim8", name: "Anim8", initials: "A8", phone: "", email: "", hireDate: "2026-01-01", vacationsTaken: 0, extraHours: 0, L: "Baja", M: "Baja", X: "Baja", J: "Baja", V: "Baja", S: "Baja", D: "Baja" }
];

const initialZones = ['Mini Club', 'Palapa', 'Solo Adultos', 'Gym', 'Bodega', 'West End', 'Bow'];

const initialActivities = [
  { id: 1, week: '2026-04-13', dayIdx: 0, time: "10:00-10:30", title: "Apertura Programa", zone: "Happy Minds", staff: ["Martu", "Syria"] },
  { id: 2, week: '2026-04-13', dayIdx: 0, time: "10:30-13:15", title: "Barcy Hands & Creators", zone: "Happy Minds", staff: ["Martu", "Syria"] },
  { id: 3, week: '2026-04-13', dayIdx: 0, time: "11:00-11:45", title: "Zumba", zone: "Plaza", staff: ["Dan", "Ricky"] },
  { id: 4, week: '2026-04-13', dayIdx: 1, time: "11:00-11:45", title: "SUP yoga", zone: "Marella Pool", staff: ["Dan"] },
];

// --- MAPEO DÍA INDEX → CLAVE ---
const DAY_KEYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

// --- FUNCIONES CORE: TIEMPOS Y SOLAPAMIENTOS MATEMÁTICOS ---
const timeToMinutes = (timeStr: string) => {
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

const doTimesOverlap = (t1: string, t2: string) => {
  if (!t1 || !t2) return false;
  const [start1, end1] = t1.split('-').map(timeToMinutes);
  const [start2, end2] = t2.split('-').map(timeToMinutes);
  return start1 < end2 && end1 > start2; // Verdadera colisión de franjas
};

const isStaffAvailable = (staff: typeof initialStaffData[0], dayIdx: number): boolean => {
  const dayKey = DAY_KEYS[dayIdx] as keyof typeof staff;
  const val = (staff[dayKey] as string)?.toLowerCase() || '';
  return (
    !val.includes('libre') &&
    !val.includes('vacaciones') &&
    !val.includes('baja') &&
    !val.includes('festivo') &&
    !val.includes('recup')
  );
};

// --- FUNCIÓN DE CÁLCULO DE HORAS ---
const calcHours = (timeStr: string) => {
  const str = timeStr?.toLowerCase() || '';
  if (
    !str ||
    str.includes('libre') ||
    str.includes('baja') ||
    str.includes('recup') ||
    str.includes('vacaciones') ||
    str.includes('festivo')
  ) return 0;

  const shifts = str.split(',');
  let total = 0;
  for (const shift of shifts) {
    const parts = shift.trim().split('-');
    if (parts.length === 2) {
      const [h1, m1] = parts[0].split(':').map(Number);
      const [h2, m2] = parts[1].split(':').map(Number);
      if (!isNaN(h1) && !isNaN(h2)) {
        total += ((h2 * 60 + m2) - (h1 * 60 + m1)) / 60;
      }
    }
  }
  return total;
};

// --- CÁLCULO DE VACACIONES (4 días/mes desde fecha de alta) ---
const calculateAccruedVacations = (hireDateStr: string) => {
  if (!hireDateStr) return 0;
  const hireDate = new Date(hireDateStr);
  const today = new Date(); // Simulamos la fecha actual
  
  let months = (today.getFullYear() - hireDate.getFullYear()) * 12;
  months -= hireDate.getMonth();
  months += today.getMonth();
  
  // Si aún no ha cumplido el mes en el día exacto, restamos 1
  if (today.getDate() < hireDate.getDate()) {
    months--;
  }
  
  if (months <= 0) return 0;
  
  // Limitamos a un año de generación (12 meses * 4 días = 48 días)
  const accrued = Math.min(12, months) * 4; 
  return accrued;
};

// --- GENERADOR DE HORAS ---
const generateTimeOptions = () => {
  const times = [];
  for (let h = 7; h <= 23; h++) {
    for (let m = 0; m < 60; m += 15) {
      times.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
    }
  }
  return times;
};

export default function Dashboard() {
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('agenda'); // Por defecto en Creador de Programa
  const [logoError, setLogoError] = useState(false);

  // ESTADOS GLOBALES
  const [weekStartDate, setWeekStartDate] = useState('2026-04-13');
  const [staffData, setStaffData] = useState(initialStaffData as any[]);
  const [zones, setZones] = useState(initialZones);
  const [activitiesDB, setActivitiesDB] = useState(initialActivities as any[]);

  // Estados UI
  const [currentPreviewStaff, setCurrentPreviewStaff] = useState('Dan');
  const [selectedDayIdx, setSelectedDayIdx] = useState(0);
  const [agendaFilterZone, setAgendaFilterZone] = useState('Todas'); // Nuevo filtro
  
  // Estados PWA Móvil
  const [pwaTab, setPwaTab] = useState('agenda'); // agenda | cuadrante | saldos
  const [pwaSelectedDay, setPwaSelectedDay] = useState(0);

  // --- ESTADOS DEL MODAL HR ---
  const [shiftModal, setShiftModal] = useState({ isOpen: false, staffId: '', firebaseId: '', dayKey: '', staffName: '', dayName: '' });
  const [modalType, setModalType] = useState('Trabajo');
  const [modalShifts, setModalShifts] = useState([{ start: '10:00', end: '18:00' }]);

  // --- ESTADO PARA NUEVA ACTIVIDAD ---
  const timeOptions = useMemo(generateTimeOptions, []);
  const [newActStart, setNewActStart] = useState('10:00');
  const [newActEnd, setNewActEnd] = useState('11:00');
  const [newActTitle, setNewActTitle] = useState('');
  const [newActZone, setNewActZone] = useState(zones[0]);
  const [newActStaff, setNewActStaff] = useState<string[]>([]);

  // --- PROTECCIÓN DE RUTA Y ROL (FIREBASE AUTH + RBAC) ---
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push('/');
        return;
      }
      const userSnap = await getDoc(doc(db, 'users', user.uid));
      const role = userSnap.exists() ? userSnap.data().role : 'staff';
      if (role !== 'admin') {
        router.push('/app');
        return;
      }
      setUserEmail(user.email);
      setAuthLoading(false);
    });
    return () => unsubAuth();
  }, [router]);

  // --- Sincronización en tiempo real con Firestore ---
  useEffect(() => {
    const unsubStaff = onSnapshot(collection(db, 'staff'), (snapshot) => {
      if (snapshot.empty) {
        initialStaffData.forEach(async (member) => {
          await setDoc(doc(db, 'staff', member.id), member);
        });
      } else {
        setStaffData(snapshot.docs.map(doc => ({ firebaseId: doc.id, ...doc.data() })));
      }
    });

    const unsubActs = onSnapshot(collection(db, 'activities'), (snapshot) => {
      if (snapshot.empty) {
        initialActivities.forEach(async (act) => {
          await addDoc(collection(db, 'activities'), act);
        });
      } else {
        setActivitiesDB(snapshot.docs.map(doc => ({ firebaseId: doc.id, ...doc.data() })));
      }
    });

    return () => {
      unsubStaff();
      unsubActs();
    };
  }, []);

  // --- LÓGICA DE CALENDARIO DINÁMICO ---
  const weekDays = useMemo(() => {
    const start = new Date(weekStartDate);
    const days = [];
    const nameDays = ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO', 'DOMINGO'];
    const shortDays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push({
        idx: i,
        dateNum: d.getDate(),
        name: nameDays[i],
        short: `${d.getDate()} ${shortDays[i]}`,
        fullLabel: `${d.getDate()} ${nameDays[i]}`
      });
    }
    return days;
  }, [weekStartDate]);

  // --- MOTOR DE SOLAPAMIENTO AVANZADO ---
  const computedNewActTime = `${newActStart}-${newActEnd}`;
  
  // Calcula quién está ocupado exactamente a esta hora y en qué
  const busyStaffDetails = useMemo(() => {
    const busy: { initials: string, title: string, zone: string, time: string }[] = [];
    const currentDayActs = activitiesDB.filter(a => a.week === weekStartDate && a.dayIdx === selectedDayIdx);
    
    currentDayActs.forEach(act => {
      // Usamos el cálculo matemático de minutos para ver si cruzan
      if (doTimesOverlap(act.time, computedNewActTime)) {
        act.staff.forEach((s: string) => {
          if (!busy.some(b => b.initials === s)) {
            busy.push({ initials: s, title: act.title, zone: act.zone, time: act.time });
          }
        });
      }
    });
    return busy;
  }, [activitiesDB, weekStartDate, selectedDayIdx, computedNewActTime]);

  // Si alguien seleccionado entra en conflicto al cambiar la hora, lo deseleccionamos automáticamente
  useEffect(() => {
    const busyInitials = busyStaffDetails.map(b => b.initials);
    if (newActStaff.some(s => busyInitials.includes(s))) {
       setNewActStaff(prev => prev.filter(s => !busyInitials.includes(s)));
    }
  }, [busyStaffDetails, newActStart, newActEnd]);

  // --- FUNCIONES CORE FIREBASE ---
  const handleAddActivity = async () => {
    if (!newActTitle || newActStaff.length === 0) return alert('Pon un título y asigna al menos un animador.');
    if (timeToMinutes(newActStart) >= timeToMinutes(newActEnd)) return alert('La hora de inicio debe ser anterior a la de fin.');
    
    await addDoc(collection(db, 'activities'), { 
      week: weekStartDate,
      dayIdx: selectedDayIdx, 
      time: computedNewActTime,
      title: newActTitle,
      zone: newActZone,
      staff: newActStaff
    });
    setNewActTitle('');
    setNewActStaff([]);
  };

  const deleteActivity = async (firebaseId: string) => {
    if(firebaseId) await deleteDoc(doc(db, 'activities', firebaseId));
  };

  const duplicateActivity = async (act: any) => {
    const { firebaseId, ...actData } = act;
    await addDoc(collection(db, 'activities'), actData);
  };

  const updateShift = async (firebaseId: string, day: string, value: string) => {
    if(firebaseId) await updateDoc(doc(db, 'staff', firebaseId), { [day]: value });
  };
  
  const updateStaffData = async (firebaseId: string, field: string, value: any) => {
    if(firebaseId) await updateDoc(doc(db, 'staff', firebaseId), { [field]: value });
  };

  const handleAddStaff = async () => {
    const initials = prompt("Iniciales del nuevo empleado (Ej. 'Juan'):");
    if (!initials) return;
    
    const newStaff = { 
      id: initials, 
      name: "Nuevo Empleado", 
      initials: initials, 
      phone: "", 
      email: "", 
      hireDate: new Date().toISOString().split('T')[0],
      vacationsTaken: 0,
      extraHours: 0,
      L: "Libre", M: "Libre", X: "Libre", J: "Libre", V: "Libre", S: "Libre", D: "Libre" 
    };
    await addDoc(collection(db, 'staff'), newStaff);
  };

  const handleAddZone = () => {
    const z = prompt("Nombre de la nueva zona:");
    if (z) setZones([...zones, z]);
  };

  const currentWeekActivities = activitiesDB.filter(a => a.week === weekStartDate);
  
  const clonePreviousWeek = () => {
    const currentStart = new Date(weekStartDate);
    currentStart.setDate(currentStart.getDate() - 7);
    const prevWeekStr = currentStart.toISOString().split('T')[0];

    const prevWeekActs = activitiesDB.filter(a => a.week === prevWeekStr);
    if(prevWeekActs.length === 0) {
      alert('⚠️ No hay actividades guardadas en la semana anterior para copiar.');
      return;
    }

    prevWeekActs.forEach(async (act) => {
      const { firebaseId, ...actData } = act;
      await addDoc(collection(db, 'activities'), { ...actData, week: weekStartDate });
    });
  };

  // --- LÓGICA DEL MODAL HR ---
  const openShiftModal = (staff: any, dayKey: string, dayName: string) => {
    const val = staff[dayKey] as string;
    let type = 'Trabajo';
    let shifts = [{ start: '10:00', end: '18:00' }];

    const lowerVal = val?.toLowerCase() || '';
    if (lowerVal.includes('libre')) type = 'Libre';
    else if (lowerVal.includes('vacaciones')) type = 'Vacaciones';
    else if (lowerVal.includes('festivo')) type = 'Festivo';
    else if (lowerVal.includes('baja')) type = 'Baja';
    else if (lowerVal.includes('recup')) type = 'Recup.';
    else if (val) {
      shifts = val.split(',').map(s => {
        const [st, en] = s.trim().split('-');
        return { start: st || '', end: en || '' };
      });
    }

    setModalType(type);
    setModalShifts(shifts.length > 0 ? shifts : [{ start: '10:00', end: '18:00' }]);
    setShiftModal({ isOpen: true, staffId: staff.id, firebaseId: staff.firebaseId, dayKey, staffName: staff.name, dayName });
  };

  const saveShiftModal = async () => {
    let finalValue = '';
    if (modalType === 'Trabajo') {
      finalValue = modalShifts
        .filter(s => s.start && s.end)
        .map(s => `${s.start}-${s.end}`)
        .join(', ');
      if (!finalValue) finalValue = "Libre";
    } else {
      finalValue = modalType;
    }

    await updateShift(shiftModal.firebaseId, shiftModal.dayKey, finalValue);
    setShiftModal({ ...shiftModal, isOpen: false });
  };

  // Filtros de visualización
  const actividadesDelDia = currentWeekActivities
    .filter(a => a.dayIdx === selectedDayIdx && (agendaFilterZone === 'Todas' || a.zone === agendaFilterZone))
    .sort((a,b) => timeToMinutes(a.time.split('-')[0]) - timeToMinutes(b.time.split('-')[0]));
  
  // Datos para PWA
  const activeStaffData = staffData.find(s => s.initials === currentPreviewStaff);
  const previewAgenda = currentWeekActivities
    .filter(act => act.dayIdx === pwaSelectedDay && act.staff.includes(currentPreviewStaff))
    .sort((a,b) => timeToMinutes(a.time.split('-')[0]) - timeToMinutes(b.time.split('-')[0]));

  // --- ESTADÍSTICAS (SEMANALES GLOBALES) ---
  const statsData = useMemo(() => {
    let trabajando = 0, libres = 0, vacaciones = 0, festivos = 0, bajas = 0, recuperacion = 0;
    staffData.forEach(staff => {
      DAY_KEYS.forEach(day => {
        const estado = (staff[day as keyof typeof staff] as string).toLowerCase();
        if (estado.includes('libre')) libres++;
        else if (estado.includes('vacaciones')) vacaciones++;
        else if (estado.includes('festivo')) festivos++;
        else if (estado.includes('baja')) bajas++;
        else if (estado.includes('recup')) recuperacion++;
        else if (estado) trabajando++;
      });
    });
    return [trabajando, libres, vacaciones, festivos, bajas, recuperacion];
  }, [staffData]);

  const availableCount = staffData.filter(s => isStaffAvailable(s, selectedDayIdx)).length;
  const unavailableCount = staffData.length - availableCount;
  const busyCount = busyStaffDetails.length;

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#0052cc] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-20">
      
      {/* CSS PARA EXPORTACIÓN PDF PERFECTA */}
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 5mm; }
          body, html { background-color: white !important; width: 100% !important; margin: 0 !important; padding: 0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          main { max-width: 100% !important; width: 100% !important; margin: 0 !important; padding: 0 !important; }
          .print-area { width: 100% !important; margin: 0 !important; padding: 0 !important; }
          /* Romper el scroll horizontal para que la tabla use todo el papel */
          .overflow-x-auto { overflow: visible !important; }
          /* Ajuste de escala automático */
          table { width: 100% !important; max-width: 100% !important; font-size: 10px !important; }
          th, td { padding: 2px !important; text-align: center; }
          /* Asegurar que los botones mantienen color y ocupan todo el ancho de la celda en PDF */
          td button { font-size: 10px !important; padding: 4px !important; width: 100% !important; }
          .print-shadow-none { box-shadow: none !important; border: none !important; }
        }
      `}</style>

      {/* --- HEADER ELBA HOTELS & RESORTS --- */}
      <header className="bg-white shadow-sm sticky top-0 z-50 border-b-4 border-[#0052cc] no-print">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              {!logoError ? (
                <img
                  src="/elba-logo.png"
                  alt="Elba Logo"
                  className="h-10 w-auto object-contain hidden sm:block"
                  onError={() => setLogoError(true)}
                />
              ) : (
                <div className="h-10 w-10 bg-gradient-to-tr from-[#0052cc] to-[#3b82f6] text-white rounded-xl items-center justify-center text-xl font-black shadow-md hidden sm:flex">E</div>
              )}
              <div className="h-8 w-px bg-slate-200 hidden sm:block"></div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight uppercase leading-none">
                  Elba<span className="text-[#0052cc] font-normal">Hub</span>
                </h1>
                <p className="text-[10px] sm:text-xs text-[#f59e0b] font-bold tracking-widest uppercase mt-0.5">
                  Hotels & Resorts
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 sm:gap-4">
              <input
                type="date"
                value={weekStartDate}
                onChange={(e) => setWeekStartDate(e.target.value)}
                className="text-xs sm:text-sm font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0052cc] cursor-pointer transition-colors"
                title="Seleccionar inicio de semana (Lunes)"
              />
              <div className="hidden md:flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-200" title={userEmail || ''}>
                <div className="w-2 h-2 rounded-full bg-[#10b981] animate-pulse"></div>
                <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Admin (Jefe)</span>
              </div>
              <button
                onClick={async () => {
                  if (confirm('¿Seguro que quieres cerrar sesión?')) {
                    await signOut(auth);
                    router.push('/');
                  }
                }}
                className="text-slate-400 hover:text-red-600 transition-colors p-2 rounded-lg hover:bg-red-50"
                title="Cerrar Sesión"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>

          <nav className="flex overflow-x-auto gap-6 mt-4 no-scrollbar">
            {[
              { id: 'config', label: '⚙️ Configuración' },
              { id: 'agenda', label: '📅 Creador de Programa' },
              { id: 'equipo', label: '👥 Asignación Turnos (HR)' },
              { id: 'fichas', label: '🗂️ Fichas y Saldos (HR)' },
              { id: 'preview', label: '📱 Vista App Empleado' },
              { id: 'resumen', label: '📊 Estadísticas' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`pb-3 text-sm uppercase font-bold tracking-wide whitespace-nowrap transition-colors border-b-2 ${activeTab === tab.id
                    ? 'border-[#0052cc] text-[#0052cc]'
                    : 'border-transparent text-slate-400 hover:text-slate-700'
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in relative">

        {/* =========================================
            PESTAÑA 1: CONFIGURACIÓN
        ========================================= */}
        {activeTab === 'config' && (
          <div className="space-y-8 no-print">
            <div className="mb-6">
              <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tight">Configuración del Entorno</h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-bold text-slate-800">Equipo de Animación</h3>
                  <button onClick={handleAddStaff} className="text-sm bg-[#0052cc] text-white px-4 py-2 rounded-lg font-bold hover:bg-[#003d99] transition-colors">+ Añadir</button>
                </div>
                <div className="space-y-4">
                  {staffData.map((staff, idx) => (
                    <div key={staff.firebaseId || staff.id || Math.random()} className="flex gap-4 items-start group bg-slate-50/50 p-3 rounded-xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100 relative">
                      
                      {/* Círculo Iniciales */}
                      <div className="pt-1">
                        <input
                          type="text"
                          value={staff.initials}
                          onChange={(e) => updateStaffData(staff.firebaseId, 'initials', e.target.value)}
                          className="w-12 h-12 rounded-full bg-white border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-500 text-center focus:outline-none focus:border-[#0052cc] transition-all"
                          maxLength={6}
                        />
                      </div>
                      
                      {/* Datos del Empleado (Nombre, Teléfono, Email) */}
                      <div className="flex-1 flex flex-col gap-2">
                        <input
                          type="text"
                          value={staff.name}
                          placeholder="Nombre completo"
                          onChange={(e) => updateStaffData(staff.firebaseId, 'name', e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-800 focus:outline-none focus:border-[#0052cc]"
                        />
                        
                        <div className="flex flex-col sm:flex-row gap-2">
                          <div className="relative flex-1">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 text-slate-400 text-[10px]">📞</span>
                            <input type="tel" value={staff.phone || ''} placeholder="Teléfono" onChange={(e) => updateStaffData(staff.firebaseId, 'phone', e.target.value)} className="w-full bg-white border border-slate-200 rounded-md pl-7 pr-3 py-1.5 text-xs font-medium focus:outline-none focus:border-[#0052cc]" />
                          </div>
                          <div className="relative flex-1">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 text-slate-400 text-[10px]">✉️</span>
                            <input type="email" value={staff.email || ''} placeholder="Correo electrónico" onChange={(e) => updateStaffData(staff.firebaseId, 'email', e.target.value)} className="w-full bg-white border border-slate-200 rounded-md pl-7 pr-3 py-1.5 text-xs font-medium focus:outline-none focus:border-[#0052cc]" />
                          </div>
                        </div>
                      </div>

                      {/* Botón Borrar */}
                      <button onClick={async () => { if (confirm(`¿Eliminar a ${staff.name}?`)) await deleteDoc(doc(db, 'staff', staff.firebaseId)); }} className="text-red-400 hover:bg-red-50 p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity mt-1">
                        🗑️
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-bold text-slate-800">Zonas del Resort</h3>
                  <button onClick={handleAddZone} className="text-sm bg-[#0052cc] text-white px-4 py-2 rounded-lg font-bold hover:bg-[#003d99] transition-colors">+ Añadir</button>
                </div>
                <div className="space-y-3">
                  {zones.map((zone, idx) => (
                    <div key={idx} className="flex gap-3 items-center group">
                      <span className="text-slate-400">📍</span>
                      <input type="text" value={zone} onChange={(e) => { const n = [...zones]; n[idx] = e.target.value; setZones(n); }} className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:border-[#0052cc]" />
                      <button onClick={() => { if (confirm(`¿Borrar la zona: ${zone}?`)) setZones(zones.filter((_, i) => i !== idx)); }} className="text-red-400 hover:bg-red-50 p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">🗑️</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =========================================
            PESTAÑA 2: CREADOR DE PROGRAMAS 
        ========================================= */}
        {activeTab === 'agenda' && (
          <div className="space-y-6 no-print">
            <div className="flex gap-2 overflow-x-auto pb-4 no-scrollbar">
              {weekDays.map((day) => (
                <button
                  key={day.idx}
                  onClick={() => {
                    setSelectedDayIdx(day.idx);
                    // ESCUDO PROTECTOR DE DÍA
                    setNewActStaff(prev => prev.filter(initials => {
                      const s = staffData.find(st => st.initials === initials);
                      return s ? isStaffAvailable(s, day.idx) : false;
                    }));
                  }}
                  className={`flex-shrink-0 px-6 py-3 rounded-2xl font-bold transition-all border ${selectedDayIdx === day.idx ? 'bg-[#0052cc] border-[#0052cc] text-white shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:border-[#0052cc]'}`}
                >
                  <div className="text-xs uppercase opacity-80">{day.name}</div>
                  <div className="text-xl">{day.dateNum}</div>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 h-fit sticky top-24">
                <h3 className="text-lg font-black text-slate-900 uppercase mb-4">Nueva Actividad</h3>

                <div className="space-y-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <select value={newActStart} onChange={e => setNewActStart(e.target.value)} className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-3 font-mono font-bold text-slate-700 focus:border-[#0052cc] focus:outline-none">
                        {timeOptions.map(t => <option key={`start-${t}`} value={t}>{t}</option>)}
                      </select>
                      <span className="text-slate-400 font-bold">-</span>
                      <select value={newActEnd} onChange={e => setNewActEnd(e.target.value)} className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-3 font-mono font-bold text-slate-700 focus:border-[#0052cc] focus:outline-none">
                        {timeOptions.map(t => <option key={`end-${t}`} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>

                  <input type="text" value={newActTitle} onChange={e => setNewActTitle(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-semibold text-slate-700 focus:outline-none focus:border-[#0052cc]" placeholder="Ej. AquaGym" />
                  
                  <select value={newActZone} onChange={e => setNewActZone(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 font-medium focus:outline-none focus:border-[#0052cc]">
                    {zones.map(z => <option key={z} value={z}>{z}</option>)}
                  </select>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Asignar Equipo</label>
                    <div className="flex items-center gap-2 text-[10px] text-slate-500 font-medium bg-slate-50 rounded-lg px-3 py-2 mb-3 border border-slate-100">
                      <span className="text-base">ℹ️</span>
                      <span>
                        <span className="text-green-600 font-bold">{availableCount - busyCount} libres</span>
                        {busyCount > 0 && <> · <span className="text-orange-500 font-bold">{busyCount} ocupados</span></>}
                        {unavailableCount > 0 && <> · <span className="text-slate-400 font-bold">{unavailableCount} descansan</span></>}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {staffData.map(staff => {
                        const available = isStaffAvailable(staff, selectedDayIdx);
                        const isSelected = newActStaff.includes(staff.initials);
                        const busyInfo = busyStaffDetails.find(b => b.initials === staff.initials);
                        const isBusy = !!busyInfo;
                        
                        let tooltip = staff.name;
                        if (!available) tooltip += ` (No trabaja hoy)`;
                        else if (isBusy) tooltip += ` -> ⚠️ Ocupado en: ${busyInfo.title} (${busyInfo.time})`;

                        let btnClass = "";
                        if (!available) btnClass = "bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed line-through opacity-60";
                        else if (isBusy) btnClass = "bg-orange-50 text-orange-600 border-orange-200 cursor-not-allowed border";
                        else if (isSelected) btnClass = "bg-[#0052cc] text-white border-[#0052cc] shadow-sm";
                        else btnClass = "bg-white text-slate-600 border-slate-200 border hover:border-[#0052cc] hover:text-[#0052cc]";

                        return (
                          <button
                            key={staff.firebaseId || staff.id || Math.random()}
                            disabled={!available || isBusy}
                            onClick={() => {
                              if (!available || isBusy) return;
                              setNewActStaff(isSelected ? newActStaff.filter(s => s !== staff.initials) : [...newActStaff, staff.initials]);
                            }}
                            title={tooltip}
                            className={`relative px-3 py-1.5 rounded-full text-xs font-bold transition-all ${btnClass}`}
                          >
                            {staff.initials}
                            {isBusy && <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-orange-500 text-white rounded-full flex items-center justify-center text-[8px] font-black leading-none">!</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {busyStaffDetails.length > 0 && (
                    <div className="bg-orange-50 text-orange-700 text-xs font-medium p-3 rounded-xl border border-orange-100">
                      ⚠️ Algunos miembros están bloqueados porque coinciden con otra actividad.
                    </div>
                  )}

                  <button onClick={handleAddActivity} className="w-full bg-[#0052cc] text-white font-black uppercase tracking-widest py-3 rounded-xl mt-4 hover:bg-[#003d99] shadow-md">
                    Guardar Actividad
                  </button>
                </div>
              </div>

              <div className="lg:col-span-2 space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-xl font-black text-slate-800 uppercase">Programa del {weekDays[selectedDayIdx].fullLabel}</h3>
                  <div className="flex gap-2">
                    <select value={agendaFilterZone} onChange={e => setAgendaFilterZone(e.target.value)} className="text-xs font-bold bg-white border border-slate-200 text-slate-600 py-1.5 px-3 rounded-lg focus:outline-none focus:border-[#0052cc]">
                      <option value="Todas">Todas las zonas</option>
                      {zones.map(z => <option key={z} value={z}>{z}</option>)}
                    </select>
                    <button onClick={clonePreviousWeek} className="text-xs bg-[#f59e0b] text-white font-bold px-3 py-1.5 rounded-lg shadow-sm hover:bg-[#d97706] transition-colors">
                      🔄 Clonar Semana
                    </button>
                  </div>
                </div>

                {actividadesDelDia.length === 0 ? (
                  <div className="bg-white rounded-3xl border-2 border-dashed border-slate-200 p-12 text-center text-slate-400 font-medium">
                    No hay actividades programadas.
                  </div>
                ) : (
                  actividadesDelDia.map(act => (
                    <div key={act.firebaseId || act.id || Math.random()} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 flex items-center gap-5 hover:border-[#0052cc] transition-colors group">
                      <div className="w-auto min-w-[100px] text-center flex-shrink-0">
                        <span className="bg-slate-50 text-[#0052cc] font-black text-sm px-3 py-1.5 rounded-lg border border-slate-100 font-mono whitespace-nowrap">
                          {act.time}
                        </span>
                      </div>
                      <div className="flex-1">
                        <h4 className="text-lg font-bold text-slate-900">{act.title}</h4>
                        <p className="text-sm text-slate-500 flex items-center gap-1 font-medium mt-1">📍 {act.zone}</p>
                      </div>
                      <div className="flex gap-1 flex-wrap justify-end items-center">
                        <span className="text-[10px] text-slate-400 font-bold uppercase mr-2">{act.staff.length} Asignados</span>
                        {act.staff.map((s: string, index: number) => <span key={`${s}-${index}`} className="bg-slate-100 text-slate-600 text-xs font-bold px-2 py-1 rounded-md">{s}</span>)}
                      </div>
                      <div className="flex flex-col sm:flex-row gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => duplicateActivity(act)} className="text-slate-300 hover:text-[#0052cc] p-2 bg-slate-50 rounded-lg" title="Duplicar">📋</button>
                        <button onClick={() => deleteActivity(act.firebaseId)} className="text-slate-300 hover:text-red-500 p-2 bg-slate-50 rounded-lg" title="Borrar">🗑️</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* =========================================
            PESTAÑA 3: ASIGNACIÓN DE TURNOS
        ========================================= */}
        {activeTab === 'equipo' && (
          <div className="space-y-6 relative print-area">
            <div className="flex justify-between items-end mb-6 no-print">
              <div>
                <h2 className="text-2xl font-black text-slate-900 uppercase">Control de Turnos (HR)</h2>
                <p className="text-slate-600 font-medium">Límites legales: Máx 40h semanales. Clic para editar el turno.</p>
              </div>
              <button onClick={() => window.print()} className="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg font-bold text-sm shadow-sm hover:bg-slate-50">🖨️ Exportar PDF</button>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden print-shadow-none">
              {/* Header visible solo al imprimir */}
              <div className="p-4 hidden print:block text-center border-b border-slate-200 mb-4">
                <h1 className="text-2xl font-black uppercase tracking-widest text-[#0052cc]">Elba Corralejo - PIA </h1>
                <p className="font-bold text-slate-500">Semana del: {weekStartDate}</p>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-slate-600">
                  <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-4 font-black">Perfil</th>
                      {weekDays.map(d => <th key={d.idx} className="px-2 py-4 text-center">{d.short}</th>)}
                      <th className="px-4 py-4 text-center font-black text-[#0052cc]">TOTAL</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {staffData.map(row => {
                      const totalHoras = ['L', 'M', 'X', 'J', 'V', 'S', 'D'].reduce((acc, day) => acc + calcHours(row[day as keyof typeof row] as string), 0);
                      const isOvertime = totalHoras > 40;

                      return (
                        <tr key={row.firebaseId || row.id || Math.random()} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 font-bold text-slate-900 whitespace-nowrap">
                            {row.name} <span className="text-xs font-normal text-slate-400">({row.initials})</span>
                          </td>
                          {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(day => {
                            const val = row[day as keyof typeof row] as string;
                            const lowerVal = val?.toLowerCase() || '';

                            let colorClass = 'font-mono text-slate-800'; 
                            if (lowerVal.includes('libre')) colorClass = 'bg-slate-100 text-slate-500 font-bold uppercase tracking-wider';
                            else if (lowerVal.includes('vacaciones')) colorClass = 'bg-amber-50 text-amber-600 font-bold uppercase tracking-wider';
                            else if (lowerVal.includes('festivo')) colorClass = 'bg-purple-50 text-purple-600 font-bold uppercase tracking-wider';
                            else if (lowerVal.includes('baja')) colorClass = 'bg-red-50 text-red-600 font-bold uppercase tracking-wider';
                            else if (lowerVal.includes('recup')) colorClass = 'bg-emerald-50 text-emerald-600 font-bold uppercase tracking-wider';

                            return (
                              <td key={day} className="px-1 py-2">
                                <button
                                  onClick={() => openShiftModal(row, day, weekDays.find(w => w.name.startsWith(day === 'X' ? 'MIÉ' : day === 'S' ? 'SÁB' : day === 'D' ? 'DOM' : day === 'J' ? 'JUE' : day === 'V' ? 'VIE' : day === 'L' ? 'LUN' : 'MAR'))?.fullLabel || '')}
                                  className={`w-full text-center rounded py-2 px-2 text-xs transition-all outline-none border border-transparent hover:border-[#0052cc] hover:bg-[#0052cc]/5 whitespace-nowrap ${colorClass}`}
                                >
                                  {val ? val.replace(',', ' / ') : '-'}
                                </button>
                              </td>
                            );
                          })}
                          <td className="px-4 py-3 text-center">
                            <span className={`font-black text-sm px-2 py-1 rounded ${isOvertime ? 'bg-red-50 text-red-600' : 'text-[#0052cc]'}`}>
                              {totalHoras}h {isOvertime && '⚠️'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* --- MODAL DE EDICIÓN DE TURNO --- */}
            {shiftModal.isOpen && (
              <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex justify-center items-center z-[10000] p-4 no-print">
                <div className="bg-white rounded-2xl shadow-xl max-w-md w-full border border-slate-200 overflow-hidden">
                  <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex justify-between items-center">
                    <div>
                      <h3 className="font-black text-slate-800 uppercase tracking-wide">Editar Turno</h3>
                      <p className="text-xs text-slate-500 font-medium">{shiftModal.staffName} &bull; {shiftModal.dayName}</p>
                    </div>
                    <button onClick={() => setShiftModal({ ...shiftModal, isOpen: false })} className="text-slate-400 hover:text-slate-700 text-2xl leading-none">&times;</button>
                  </div>

                  <div className="p-6 space-y-6">
                    <select value={modalType} onChange={(e) => setModalType(e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg p-3 text-slate-700 font-bold focus:border-[#0052cc] outline-none shadow-sm">
                      <option value="Trabajo">🏢 Trabajando (En Turno)</option>
                      <option value="Libre">🌴 Día Libre</option>
                      <option value="Vacaciones">🏖️ Vacaciones</option>
                      <option value="Festivo">🎉 Festivo Compensado</option>
                      <option value="Baja">🤒 Baja Médica</option>
                      <option value="Recup.">♻️ Recuperación (Horas)</option>
                    </select>

                    {modalType === 'Trabajo' && (
                      <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
                        {modalShifts.map((shift, i) => (
                          <div key={i} className="flex gap-2 items-center">
                            <input type="time" value={shift.start} onChange={(e) => { const n = [...modalShifts]; n[i].start = e.target.value; setModalShifts(n); }} className="flex-1 bg-white border border-slate-200 rounded-lg p-2 font-mono text-sm focus:outline-none focus:border-[#0052cc]" />
                            <span className="text-slate-400 font-bold">-</span>
                            <input type="time" value={shift.end} onChange={(e) => { const n = [...modalShifts]; n[i].end = e.target.value; setModalShifts(n); }} className="flex-1 bg-white border border-slate-200 rounded-lg p-2 font-mono text-sm focus:outline-none focus:border-[#0052cc]" />
                            {modalShifts.length > 1 && <button onClick={() => setModalShifts(modalShifts.filter((_, idx) => idx !== i))} className="p-2 text-red-400 hover:bg-red-50 rounded-lg">🗑️</button>}
                          </div>
                        ))}
                        <button onClick={() => setModalShifts([...modalShifts, { start: '16:00', end: '20:00' }])} className="w-full text-xs font-bold text-[#0052cc] bg-white border border-slate-200 hover:border-[#0052cc] py-2 rounded-lg transition-colors mt-2 shadow-sm">
                          + Añadir Turno Partido
                        </button>
                      </div>
                    )}

                    <div className="flex gap-3 pt-2">
                      <button onClick={() => setShiftModal({ ...shiftModal, isOpen: false })} className="flex-1 px-4 py-2.5 text-slate-600 font-bold hover:bg-slate-100 border border-transparent rounded-lg">Cancelar</button>
                      <button onClick={saveShiftModal} className="flex-1 px-4 py-2.5 bg-[#0052cc] text-white font-black uppercase tracking-wide rounded-lg hover:bg-[#003d99] shadow-sm">Guardar</button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* =========================================
            NUEVA PESTAÑA: FICHAS Y SALDOS HR
        ========================================= */}
        {activeTab === 'fichas' && (
          <div className="space-y-6 no-print">
            <div className="flex justify-between items-end mb-6">
              <div>
                <h2 className="text-2xl font-black text-slate-900 uppercase">Fichas de Personal & Saldos</h2>
                <p className="text-slate-600 font-medium">Control anual de vacaciones y banco de horas extra.</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden p-6">
              <table className="w-full text-left">
                <thead className="text-xs text-slate-500 uppercase border-b border-slate-200">
                  <tr>
                    <th className="pb-4">Empleado</th>
                    <th className="pb-4 text-center">Alta Empresa</th>
                    <th className="pb-4 text-center">Vac. Generadas</th>
                    <th className="pb-4 text-center">Vac. Consumidas</th>
                    <th className="pb-4 text-center">Horas Extra</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {staffData.map(staff => {
                    const generadas = calculateAccruedVacations(staff.hireDate);
                    const restantes = generadas - (staff.vacationsTaken || 0);

                    return (
                      <tr key={staff.firebaseId || staff.id || Math.random()} className="hover:bg-slate-50">
                        <td className="py-4 font-bold text-slate-800">{staff.name}</td>
                        <td className="py-4 text-center">
                          <input 
                            type="date" 
                            value={staff.hireDate || ''} 
                            onChange={(e) => updateStaffData(staff.firebaseId, 'hireDate', e.target.value)} 
                            className="text-sm bg-slate-50 border border-slate-200 px-2 py-1 rounded outline-none focus:border-[#0052cc] font-mono"
                          />
                        </td>
                        <td className="py-4 text-center">
                          <span className="font-black text-[#0052cc] bg-blue-50 px-3 py-1 rounded-full">{generadas} d</span>
                        </td>
                        <td className="py-4 text-center">
                          <input 
                            type="number" 
                            value={staff.vacationsTaken || 0} 
                            onChange={(e) => updateStaffData(staff.firebaseId, 'vacationsTaken', Number(e.target.value))} 
                            className="w-16 text-center text-sm font-bold bg-white border border-slate-200 px-2 py-1 rounded outline-none"
                            min={0}
                          />
                          <div className="text-[10px] mt-1 text-slate-400 font-medium">
                            Quedan: <span className={restantes < 0 ? 'text-red-500 font-bold' : 'text-green-600 font-bold'}>{restantes} d</span>
                          </div>
                        </td>
                        <td className="py-4 text-center">
                          <input 
                            type="number" 
                            step="0.5"
                            value={staff.extraHours || 0} 
                            onChange={(e) => updateStaffData(staff.firebaseId, 'extraHours', Number(e.target.value))} 
                            className={`w-20 text-center text-sm font-bold bg-white border px-2 py-1 rounded outline-none ${staff.extraHours > 0 ? 'text-green-600 border-green-200' : staff.extraHours < 0 ? 'text-red-600 border-red-200' : 'border-slate-200'}`}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* =========================================
            PESTAÑA 4: VISTA APP EMPLEADO (ACTUALIZADA)
        ========================================= */}
        {activeTab === 'preview' && (
          <div className="flex flex-col items-center no-print">
            <div className="mb-6 text-center">
              <h2 className="text-2xl font-black text-slate-900 uppercase">Simulador PWA Móvil</h2>
              <p className="text-slate-600 font-medium">Navega por la app real del animador.</p>
            </div>

            <select
              value={currentPreviewStaff}
              onChange={(e) => setCurrentPreviewStaff(e.target.value)}
              className="mb-8 bg-white border border-slate-200 text-slate-700 font-bold rounded-lg p-3 outline-none focus:border-[#0052cc] shadow-sm"
            >
              {staffData.map(s => <option key={s.firebaseId || s.id || Math.random()} value={s.initials}>Login como: {s.name}</option>)}
            </select>

            {/* Chasis Móvil */}
            <div className="w-[375px] h-[750px] bg-slate-50 rounded-[3rem] shadow-2xl border-[12px] border-slate-800 overflow-hidden flex flex-col relative">
              <div className="absolute top-0 inset-x-0 h-6 bg-slate-800 rounded-b-3xl w-40 mx-auto z-20"></div>

              <div className="bg-gradient-to-b from-[#0052cc] to-[#0042a3] text-white px-6 pt-12 pb-6 rounded-b-3xl shadow-sm z-10 border-b-4 border-[#f59e0b]">
                <h1 className="text-2xl font-black italic tracking-tighter">Elba<span className="font-light">App</span></h1>
                <p className="text-xs font-medium opacity-90 mt-1 uppercase tracking-widest">Hola, {currentPreviewStaff}</p>
              </div>

              {/* CONTENIDO DESLIZABLE */}
              <div className="flex-1 overflow-y-auto p-4 pb-24 space-y-4">
                
                {/* VISTA 1: AGENDA DIARIA */}
                {pwaTab === 'agenda' && (
                  <div>
                    {/* Selector de Días Horizontal */}
                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-4">
                      {weekDays.map(d => (
                        <button 
                          key={d.idx} 
                          onClick={() => setPwaSelectedDay(d.idx)} 
                          className={`flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold border transition-colors ${pwaSelectedDay === d.idx ? 'bg-[#0052cc] text-white border-[#0052cc]' : 'bg-white text-slate-500 border-slate-200'}`}
                        >
                          {d.short.toUpperCase()}
                        </button>
                      ))}
                    </div>

                    {previewAgenda.length === 0 ? (
                      <div className="text-center text-slate-400 font-medium mt-10 p-6 bg-white rounded-2xl border border-slate-100 shadow-sm">Hoy tienes el día libre. Disfruta!.</div>
                    ) : (
                      <div className="space-y-3">
                        {previewAgenda.map(act => (
                          <div key={act.firebaseId || act.id || Math.random()} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 border-l-4 border-l-[#f59e0b]">
                            <div className="text-[#0052cc] font-black text-sm font-mono mb-1">{act.time}</div>
                            <div className="font-bold text-slate-800">{act.title}</div>
                            <div className="text-xs text-slate-500 font-medium mt-2">📍 {act.zone}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* VISTA 2: CUADRANTE SEMANAL */}
                {pwaTab === 'cuadrante' && (
                  <div>
                    <h3 className="font-black text-slate-800 mb-4 uppercase text-sm tracking-widest">Mi Turno Semanal</h3>
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden divide-y divide-slate-100">
                      {DAY_KEYS.map((key, i) => {
                        const val = activeStaffData ? activeStaffData[key as keyof typeof activeStaffData] as string : '';
                        const isSpecial = val && (val.toLowerCase().includes('libre') || val.toLowerCase().includes('vacaciones'));
                        return (
                          <div key={key} className="flex justify-between p-4 items-center">
                            <span className="font-bold text-slate-400 text-xs">{weekDays[i].name}</span>
                            <span className={`text-sm font-black ${isSpecial ? 'text-[#10b981]' : 'text-slate-800 font-mono'}`}>{val ? val.replace(',',' / ') : '-'}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* VISTA 3: SALDOS Y PERFIL */}
                {pwaTab === 'saldos' && activeStaffData && (
                  <div className="space-y-4">
                    <h3 className="font-black text-slate-800 mb-2 uppercase text-sm tracking-widest">Mi Perfil HR</h3>
                    
                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                      <div className="text-xs text-slate-400 font-bold uppercase mb-1">Vacaciones Anuales</div>
                      <div className="text-3xl font-black text-[#0052cc]">
                        {calculateAccruedVacations(activeStaffData.hireDate) - (activeStaffData.vacationsTaken || 0)} <span className="text-sm font-medium text-slate-400">días disponibles</span>
                      </div>
                      {/* Barra de progreso */}
                      <div className="w-full bg-slate-100 h-2 rounded-full mt-3 overflow-hidden">
                        <div className="bg-[#f59e0b] h-full" style={{width: `${((activeStaffData.vacationsTaken || 0) / Math.max(1, calculateAccruedVacations(activeStaffData.hireDate))) * 100}%`}}></div>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-2 font-medium flex justify-between">
                        <span>Generados: {calculateAccruedVacations(activeStaffData.hireDate)}</span>
                        <span>Disfrutados: {activeStaffData.vacationsTaken || 0}</span>
                      </div>
                    </div>

                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                      <div className="text-xs text-slate-400 font-bold uppercase mb-1">Bolsa Horas Extra</div>
                      <div className={`text-2xl font-black ${(activeStaffData.extraHours || 0) > 0 ? 'text-[#10b981]' : (activeStaffData.extraHours || 0) < 0 ? 'text-red-500' : 'text-slate-800'}`}>
                        {(activeStaffData.extraHours || 0) > 0 ? '+' : ''}{activeStaffData.extraHours || 0} <span className="text-sm font-medium text-slate-400">horas</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* BOTTOM NAVIGATION BAR */}
              <div className="absolute bottom-0 w-full bg-white border-t border-slate-200 p-4 rounded-b-[2.5rem] flex justify-around items-center shadow-[0_-10px_40px_rgba(0,0,0,0.05)]">
                <button onClick={()=>setPwaTab('agenda')} className={`flex flex-col items-center gap-1 ${pwaTab === 'agenda' ? 'text-[#0052cc]' : 'text-slate-400'}`}>
                  <span className="text-xl">📅</span><span className="text-[10px] font-bold">Agenda</span>
                </button>
                <button onClick={()=>setPwaTab('cuadrante')} className={`flex flex-col items-center gap-1 ${pwaTab === 'cuadrante' ? 'text-[#0052cc]' : 'text-slate-400'}`}>
                  <span className="text-xl">🏢</span><span className="text-[10px] font-bold">Turnos</span>
                </button>
                <button onClick={()=>setPwaTab('saldos')} className={`flex flex-col items-center gap-1 ${pwaTab === 'saldos' ? 'text-[#0052cc]' : 'text-slate-400'}`}>
                  <span className="text-xl">👤</span><span className="text-[10px] font-bold">Mi Perfil</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* =========================================
            PESTAÑA 5: ESTADÍSTICAS
        ========================================= */}
        {activeTab === 'resumen' && (
          <div className="max-w-2xl mx-auto text-center no-print">
            <h2 className="text-2xl font-black text-slate-900 uppercase mb-8">Estado de la Plantilla Semanal</h2>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
              <div className="relative w-full h-80 mx-auto">
                <Doughnut
                  data={{
                    labels: ['Trabajando (En Turno)', 'Días Libres', 'Vacaciones', 'Festivos Compensados', 'Bajas Médicas', 'Recuperación (Horas)'],
                    datasets: [{
                      data: statsData,
                      backgroundColor: [
                        '#0052cc', // Trabajando (Elba Blue)
                        '#94a3b8', // Días Libres (Gris Neutro)
                        '#f59e0b', // Vacaciones (Sunset Gold)
                        '#8b5cf6', // Festivos (Morado)
                        '#ef4444', // Bajas Médicas (Rojo/Coral)
                        '#10b981'  // Recuperación (Verde)
                      ],
                      borderWidth: 2,
                      borderColor: '#ffffff'
                    }]
                  }}
                  options={{
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { position: 'bottom' }
                    }
                  }}
                />
              </div>
              <p className="text-xs text-slate-400 mt-6 border-t border-slate-100 pt-6">
- El estado refleja el recuento de turnos de Lunes a Domingo para toda la plantilla en la semana actual.
              </p>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}