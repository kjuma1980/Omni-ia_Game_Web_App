import React, { useEffect, useRef, useState } from 'react';
import {
  Lock,
  User,
  Mail,
  KeyRound,
  LogIn,
  UserPlus,
  Loader2,
  CheckCircle2,
  Globe,
  MapPin,
  ChevronLeft,
  ChevronRight,
  Phone,
  CalendarDays,
  Home,
  Building2,
  Sparkles,
  Contact,
} from 'lucide-react';

export const OMNI_AUTH_TOKEN_KEY = 'omni_auth_token';
export const OMNI_AUTH_EMAIL_KEY = 'omni_auth_email';
export const OMNI_AUTH_REMEMBER_KEY = 'omni_auth_remember';
export const OMNI_AUTH_SERVER_URL_KEY = 'omni_auth_server_url';

const DEFAULT_AUTH_SERVER_URL = 'https://fenixdev.cloud';

export function getAuthServerUrl(): string {
  try {
    return localStorage.getItem(OMNI_AUTH_SERVER_URL_KEY) || DEFAULT_AUTH_SERVER_URL;
  } catch {
    return DEFAULT_AUTH_SERVER_URL;
  }
}

export function readStoredToken(): string | null {
  try {
    return (
      localStorage.getItem(OMNI_AUTH_TOKEN_KEY) ||
      sessionStorage.getItem(OMNI_AUTH_TOKEN_KEY)
    );
  } catch {
    return null;
  }
}

export function readStoredEmail(): string | null {
  try {
    return (
      localStorage.getItem(OMNI_AUTH_EMAIL_KEY) ||
      sessionStorage.getItem(OMNI_AUTH_EMAIL_KEY)
    );
  } catch {
    return null;
  }
}

export function clearStoredAuth() {
  try {
    localStorage.removeItem(OMNI_AUTH_TOKEN_KEY);
    localStorage.removeItem(OMNI_AUTH_EMAIL_KEY);
    localStorage.removeItem(OMNI_AUTH_REMEMBER_KEY);
    sessionStorage.removeItem(OMNI_AUTH_TOKEN_KEY);
    sessionStorage.removeItem(OMNI_AUTH_EMAIL_KEY);
    const invokeFn = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;
    if (invokeFn) {
      invokeFn('save_license_key', { licenseKey: '' }).catch(() => {});
    }
  } catch {
    // almacenamiento no disponible
  }
}

interface AuthScreenProps {
  onLogin: () => void;
  initialError?: string | null;
}

type Mode = 'login' | 'register';
type Step = 'form' | 'verify' | 'forgot_request' | 'forgot_confirm';

interface InterestAnswer {
  q: string;
  a: string | string[];
}

interface ProfileData {
  first_name: string;
  last_name: string;
  personal_email: string;
  edu_email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  country: string;
  birth_date: string;
  interests: InterestAnswer[];
}

interface WizardForm {
  first_name: string;
  last_name: string;
  personal_email: string;
  edu_email: string;
  phone: string;
  address: string;
  birth_date: string;
  country: string;
  state: string;
  city: string;
  answers: Record<string, string[]>;
}

type WizardStep = 1 | 2 | 3;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NAME_RE = /^[\p{L}][\p{L}\p{M} .'-]*$/u;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const INTEREST_QUESTIONS: { q: string; options: string[] }[] = [
  {
    q: '¿Qué área de la creación de videojuegos te interesa más?',
    options: ['Diseño de personajes', 'Mundos y escenarios', 'Animación', 'Audio y música', 'Narrativa y guion', 'Programación'],
  },
  {
    q: '¿Qué tipo de juegos te gustaría crear?',
    options: ['Aventura', 'Plataformas', 'RPG', 'Puzzle', 'Educativo'],
  },
  {
    q: '¿En qué plataforma jugarás o usarás tus creaciones?',
    options: ['PC', 'Celular', 'Consola', 'Web', 'VR'],
  },
  {
    q: '¿Cuánta experiencia tienes creando videojuegos?',
    options: ['Ninguna', 'Poca', 'Intermedia', 'Avanzada'],
  },
  {
    q: '¿Cómo prefieres aprender?',
    options: ['Videos', 'Tutoriales paso a paso', 'Proyectos guiados', 'Comunidad'],
  },
];

function calculateAge(birthDate: string): number | null {
  const m = DATE_RE.exec(birthDate);
  if (!m) return null;
  const parsed = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (
    parsed.getFullYear() !== Number(m[1]) ||
    parsed.getMonth() !== Number(m[2]) - 1 ||
    parsed.getDate() !== Number(m[3])
  ) {
    return null;
  }
  const now = new Date();
  let age = now.getFullYear() - parsed.getFullYear();
  const mm = now.getMonth() - parsed.getMonth();
  if (mm < 0 || (mm === 0 && now.getDate() < parsed.getDate())) age--;
  return Number.isNaN(age) ? null : age;
}

const emptyForm = (): WizardForm => ({
  first_name: '',
  last_name: '',
  personal_email: '',
  edu_email: '',
  phone: '',
  address: '',
  birth_date: '',
  country: '',
  state: '',
  city: '',
  answers: {},
});

function formFromProfile(profile?: ProfileData): WizardForm {
  const f = emptyForm();
  if (!profile) return f;
  f.first_name = profile.first_name || '';
  f.last_name = profile.last_name || '';
  f.personal_email = profile.personal_email || '';
  f.edu_email = profile.edu_email || '';
  f.phone = profile.phone || '';
  f.address = profile.address || '';
  f.birth_date = profile.birth_date || '';
  f.country = profile.country || '';
  f.state = profile.state || '';
  f.city = profile.city || '';
  for (const q of INTEREST_QUESTIONS) {
    const prev = (profile.interests || []).find((it) => it.q === q.q);
    if (prev) {
      f.answers[q.q] = Array.isArray(prev.a) ? prev.a : (prev.a ? [prev.a] : []);
    } else {
      f.answers[q.q] = [];
    }
  }
  return f;
}

async function authFetch(path: string, body: unknown, token?: string | null): Promise<{ ok: boolean; status?: number; error?: string; [k: string]: unknown }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const res = await fetch(`${getAuthServerUrl()}${path}`, {
      method: body === null ? 'GET' : 'POST',
      headers,
      body: body === null ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok !== false) return { ...data, status: res.status };
    return { ok: false, status: res.status, error: (data && (data.error as string)) || `Error del servidor (${res.status})` };
  } catch {
    return { ok: false, status: 0, error: 'No se pudo conectar con el servidor de cuentas.' };
  }
}

async function geoGet(path: string): Promise<{ ok: boolean; error?: string; [k: string]: unknown } | null> {
  try {
    const res = await fetch(`${getAuthServerUrl()}${path}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok !== false) return data;
    return null;
  } catch {
    return null;
  }
}

const AuthScreen: React.FC<AuthScreenProps> = ({ onLogin }) => {
  const [mode, setMode] = useState<Mode>('login');
  const [step, setStep] = useState<Step>('form');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [wizard, setWizard] = useState<WizardForm | null>(null);
  const [wstep, setWstep] = useState<WizardStep>(1);
  const [countries, setCountries] = useState<{ code: string; name: string }[]>([]);
  const [states, setStates] = useState<{ code: string; name: string }[]>([]);
  const [cityQ, setCityQ] = useState('');
  const [cityResults, setCityResults] = useState<string[]>([]);
  const [cityOpen, setCityOpen] = useState(false);
  const [wizardLoading, setWizardLoading] = useState(false);
  const [wizardError, setWizardError] = useState('');

  const onLoginRef = useRef(onLogin);
  onLoginRef.current = onLogin;

  useEffect(() => {
    const token = readStoredToken();
    if (!token) return;
    let cancelled = false;
    authFetch('/api/me', null, token).then((r) => {
      if (cancelled) return;
      if (r.ok) {
        const user = r.user as { completedRegistration?: boolean; profile?: ProfileData } | undefined;
        if (user && !user.completedRegistration) {
          enterWizard(formFromProfile(user.profile));
        } else {
          onLoginRef.current();
        }
      } else {
        // Preservar la sesión si "Recordar este equipo" estaba activado o si fue error de red/offline (status === 0)
        let isRemembered = false;
        try {
          isRemembered = localStorage.getItem(OMNI_AUTH_REMEMBER_KEY) === '1' || !!localStorage.getItem(OMNI_AUTH_TOKEN_KEY);
        } catch {
          // ignore
        }

        if (isRemembered || r.status === 0) {
          onLoginRef.current();
        } else {
          clearStoredAuth();
        }
      }
    });
    return () => {
      cancelled = true;
    };
    // Se ejecuta solo una vez al montar: el restante polling de App
    // re-renderiza AuthScreen, y depender de [onLogin] (que cambia en cada
    // render de App) provocaba que el wizard se reiniciara y borrara lo escrito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const storeSession = (token: string, userEmail: string) => {
    const store = rememberMe ? localStorage : sessionStorage;
    try {
      store.setItem(OMNI_AUTH_TOKEN_KEY, token);
      store.setItem(OMNI_AUTH_EMAIL_KEY, userEmail);
      if (rememberMe) localStorage.setItem(OMNI_AUTH_REMEMBER_KEY, '1');
    } catch {
      // almacenamiento no disponible: sesión solo en memoria
    }
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setStep('form');
    setError('');
    setSuccess('');
    setCode('');
    setConfirmPassword('');
  };

  const handleForgotRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    const em = email.trim().toLowerCase();
    if (!em || !EMAIL_RE.test(em)) {
      setError('Escribe un correo electrónico válido.');
      return;
    }
    setLoading(true);
    try {
      const res = await authFetch('/api/password-reset/request', { email: em });
      if (!res.ok) {
        setError(res.error || 'No se pudo enviar el código de recuperación.');
        return;
      }
      setSuccess('Si el correo existe, te hemos enviado un código de 6 dígitos.');
      setStep('forgot_confirm');
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    const em = email.trim().toLowerCase();
    const c = code.trim();
    if (!c || !/^\d{6}$/.test(c)) {
      setError('Ingresa el código numérico de 6 dígitos.');
      return;
    }
    if (!password || password.length < 6) {
      setError('La nueva contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setLoading(true);
    try {
      const res = await authFetch('/api/password-reset/confirm', {
        email: em,
        code: c,
        new_password: password,
      });
      if (!res.ok) {
        setError(res.error || 'Código incorrecto o expirado.');
        return;
      }
      setSuccess('¡Contraseña restablecida con éxito! Ya puedes iniciar sesión.');
      setTimeout(() => {
        setStep('form');
        setMode('login');
        setPassword('');
        setConfirmPassword('');
        setCode('');
        setSuccess('');
      }, 1800);
    } finally {
      setLoading(false);
    }
  };

  const enterWizard = (form: WizardForm) => {
    setWizard(form);
    setWstep(1);
    setWizardError('');
    setCityQ(form.city);
    setCityResults([]);
    loadCountries(form);
  };

  const exitWizard = () => {
    clearStoredAuth();
    setWizard(null);
    switchMode('login');
  };

  const loadCountries = async (form: WizardForm) => {
    const data = await geoGet('/api/geo/countries');
    if (data && Array.isArray(data.countries)) {
      const list = data.countries as { code: string; name: string }[];
      setCountries([...list].sort((a, b) => a.name.localeCompare(b.name)));
      if (form.country) loadStates(form.country);
    } else {
      setWizardError('No se pudo cargar la lista de países.');
    }
  };

  const loadStates = async (countryCode: string) => {
    setStates([]);
    setWizardLoading(true);
    try {
      const data = await geoGet(`/api/geo/states?country=${encodeURIComponent(countryCode)}`);
      if (data && Array.isArray(data.states)) {
        setStates([...(data.states as { code: string; name: string }[])].sort((a, b) => a.name.localeCompare(b.name)));
      } else {
        setWizardError('No se pudieron cargar los estados del país.');
      }
    } finally {
      setWizardLoading(false);
    }
  };

  const searchCities = async (q: string, country: string, state: string) => {
    setCityQ(q);
    updateField('city', q);
    if (q.trim().length < 2 || !country || !state) {
      setCityResults([]);
      return;
    }
    setCityOpen(true);
    const data = await geoGet(
      `/api/geo/cities?country=${encodeURIComponent(country)}&state=${encodeURIComponent(state)}&q=${encodeURIComponent(q.trim())}`
    );
    setCityResults(data && Array.isArray(data.cities) ? (data.cities as string[]).slice(0, 20) : []);
  };

  const pickCity = (c: string) => {
    setCityQ(c);
    setWizard((w) => (w ? { ...w, city: c } : w));
    setCityResults([]);
    setCityOpen(false);
  };

  const openCityList = async (country: string, state: string) => {
    if (!country || !state) return;
    setCityOpen(true);
    const data = await geoGet(
      `/api/geo/cities?country=${encodeURIComponent(country)}&state=${encodeURIComponent(state)}&q=${encodeURIComponent(cityQ.trim())}`
    );
    setCityResults(data && Array.isArray(data.cities) ? (data.cities as string[]).slice(0, 20) : []);
  };

  const onCountryChange = (code: string) => {
    setWizard((w) => (w ? { ...w, country: code, state: '', city: '' } : w));
    setCityResults([]);
    setCityQ('');
    setCityOpen(false);
    if (code) loadStates(code);
  };

  const onStateChange = (code: string) => {
    setWizard((w) => (w ? { ...w, state: code, city: '' } : w));
    setCityResults([]);
    setCityQ('');
    setCityOpen(false);
  };

  const updateField = (key: keyof WizardForm, value: string) => {
    setWizard((w) => (w ? { ...w, [key]: value } : w));
  };

  const toggleAnswer = (q: string, opt: string) => {
    setWizard((w) => {
      if (!w) return w;
      const current = w.answers[q] || [];
      const updated = current.includes(opt)
        ? current.filter((x) => x !== opt)
        : [...current, opt];
      return { ...w, answers: { ...w.answers, [q]: updated } };
    });
  };

  const validateStep1 = (f: WizardForm): string | null => {
    if (!f.first_name || f.first_name.length < 2 || !NAME_RE.test(f.first_name)) return 'Nombre inválido (mínimo 2 letras).';
    if (!f.last_name || f.last_name.length < 2 || !NAME_RE.test(f.last_name)) return 'Apellidos inválidos (mínimo 2 letras).';
    if (!EMAIL_RE.test(f.personal_email.trim())) return 'Correo personal no válido.';
    if (!EMAIL_RE.test(f.edu_email.trim())) return 'Correo educativo no válido.';
    const phone = f.phone.replace(/[^\d+]/g, '');
    if (phone.length < 7 || phone.length > 20) return 'Teléfono no válido (mínimo 7 dígitos).';
    if (f.address.trim().length < 5) return 'Dirección requerida.';
    const age = calculateAge(f.birth_date);
    if (age === null) return 'Fecha de nacimiento inválida (AAAA-MM-DD).';
    if (age < 13) return 'Debes tener al menos 13 años.';
    if (age > 120) return 'Fecha de nacimiento inválida.';
    return null;
  };

  const validateStep2 = (f: WizardForm): string | null => {
    if (!f.country) return 'Selecciona tu país.';
    if (!f.state) return 'Selecciona tu estado o departamento.';
    if (f.city.trim().length < 2) return 'Escribe tu ciudad.';
    return null;
  };

  const validateStep3 = (f: WizardForm): string | null => {
    const answered = INTEREST_QUESTIONS.filter((q) => (f.answers[q.q] || []).length > 0).length;
    if (answered < 3) return `Responde al menos 3 preguntas (llevas ${answered} de 5).`;
    return null;
  };

  const stepErrorList = (step: WizardStep, f: WizardForm): string[] => {
    const errs: string[] = [];
    if (step === 1) {
      if (!f.first_name || f.first_name.length < 2 || !NAME_RE.test(f.first_name)) errs.push('Nombre(s)');
      if (!f.last_name || f.last_name.length < 2 || !NAME_RE.test(f.last_name)) errs.push('Apellidos');
      if (!EMAIL_RE.test(f.personal_email.trim())) errs.push('Correo personal');
      if (!EMAIL_RE.test(f.edu_email.trim())) errs.push('Correo educativo');
      const phone = f.phone.replace(/[^\d+]/g, '');
      if (phone.length < 7 || phone.length > 20) errs.push('Teléfono');
      if (f.address.trim().length < 5) errs.push('Dirección');
      const age = calculateAge(f.birth_date);
      if (age === null || age < 13 || age > 120) errs.push('Fecha de nacimiento');
    } else if (step === 2) {
      if (!f.country) errs.push('País');
      if (!f.state) errs.push('Estado');
      if (f.city.trim().length < 2) errs.push('Ciudad');
    } else {
      const answered = INTEREST_QUESTIONS.filter((q) => (f.answers[q.q] || []).length > 0).length;
      if (answered < 3) errs.push(answered === 0 ? 'Responde 3 preguntas' : `Responde ${3 - answered} pregunta(s) más`);
    }
    return errs;
  };

  const nextStep = () => {
    if (!wizard) return;
    setWizardError('');
    if (wstep === 1) {
      const err = validateStep1(wizard);
      if (err) {
        setWizardError(err);
        return;
      }
    }
    if (wstep === 2) {
      const err = validateStep2(wizard);
      if (err) {
        setWizardError(err);
        return;
      }
    }
    setWstep((s) => Math.min(3, (s + 1) as WizardStep) as WizardStep);
  };

  const backStep = () => {
    setWizardError('');
    setWstep((s) => Math.max(1, s - 1) as WizardStep);
  };

  const submitWizard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wizard) return;
    setWizardError('');
    const err = validateStep3(wizard);
    if (err) {
      setWizardError(err);
      return;
    }
    const interests = INTEREST_QUESTIONS.map((q) => ({
      q: q.q,
      a: wizard.answers[q.q] || [],
    })).filter((it) => it.a.length > 0);
    setWizardLoading(true);
    try {
      const token = readStoredToken();
      const res = await authFetch(
        '/api/me/profile',
        {
          first_name: wizard.first_name,
          last_name: wizard.last_name,
          personal_email: wizard.personal_email,
          edu_email: wizard.edu_email,
          phone: wizard.phone,
          address: wizard.address,
          birth_date: wizard.birth_date,
          country: wizard.country,
          state: wizard.state,
          city: wizard.city,
          interests,
        },
        token
      );
      if (res.ok) {
        onLogin();
      } else {
        const fields = res.fields as Record<string, string> | undefined;
        setWizardError(
          fields ? Object.values(fields)[0] || res.error || 'Ocurrió un error inesperado.' : res.error || 'Ocurrió un error inesperado.'
        );
      }
    } finally {
      setWizardLoading(false);
    }
  };

  const completeAuth = async (token: string, userEmail: string) => {
    storeSession(token, userEmail);
    const me = await authFetch('/api/me', null, token);
    const user = me.ok ? (me.user as { role?: string; completedRegistration?: boolean; license?: string | null; profile?: ProfileData } | undefined) : undefined;
    
    if (user?.role === 'admin') {
      clearStoredAuth();
      setError('Las cuentas de administrador no tienen acceso a la app de estudiantes. Inicia sesión desde el Panel de Administración (/admin).');
      return;
    }

    // Sincronizar en disco la licencia exclusiva de ESTA cuenta:
    const invokeFn = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;
    if (invokeFn) {
      if (user?.license) {
        await invokeFn('save_license_key', { licenseKey: user.license }).catch(() => {});
      } else {
        await invokeFn('save_license_key', { licenseKey: '' }).catch(() => {});
      }
    }

    if (me.ok && user && !user.completedRegistration) {
      enterWizard(formFromProfile(user.profile));
    } else {
      onLogin();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const cleanEmail = email.trim().toLowerCase();
    if (!EMAIL_RE.test(cleanEmail)) {
      setError('Correo electrónico no válido.');
      return;
    }
    if (mode === 'register') {
      if (password.length < 8) {
        setError('La contraseña debe tener al menos 8 caracteres.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Las contraseñas no coinciden.');
        return;
      }
    } else if (!password) {
      setError('Escribe tu contraseña.');
      return;
    }

    setLoading(true);
    try {
      const res = await authFetch(mode === 'login' ? '/api/login' : '/api/register', {
        email: cleanEmail,
        password,
      });
      if (res.ok) {
        if (mode === 'login') {
          await completeAuth(res.token as string, cleanEmail);
        } else {
          setStep('verify');
          const devCode = res.dev_code as string | undefined;
          setSuccess(
            devCode
              ? `Modo pruebas (SMTP no configurado): tu código es ${devCode}. Pégalo abajo.`
              : `Se envió un correo a ${cleanEmail} con tu código de 6 dígitos. Pégalo abajo para activar tu cuenta.`,
          );
        }
      } else {
        setError(res.error || 'Ocurrió un error inesperado.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    const cleanEmail = email.trim().toLowerCase();
    if (!/^\d{6}$/.test(code.trim())) {
      setError('El código debe tener 6 dígitos.');
      return;
    }
    setLoading(true);
    try {
      const res = await authFetch('/api/verify', { email: cleanEmail, code: code.trim() });
      if (res.ok) {
        const loginRes = await authFetch('/api/login', { email: cleanEmail, password });
        if (loginRes.ok) {
          await completeAuth(loginRes.token as string, cleanEmail);
        } else {
          setSuccess('Cuenta activada. Ahora inicia sesión.');
          switchMode('login');
        }
      } else {
        setError(res.error || 'No se pudo verificar el código.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const res = await authFetch('/api/register', {
        email: email.trim().toLowerCase(),
        password,
      });
      if (res.ok) {
        const devCode = res.dev_code as string | undefined;
        setSuccess(
          devCode
            ? `Modo pruebas (SMTP no configurado): tu nuevo código es ${devCode}. Pégalo abajo.`
            : 'Se reenvió un nuevo código a tu correo. Pégalo abajo.',
        );
      } else {
        setError(res.error || 'No se pudo reenviar el código.');
      }
    } finally {
      setLoading(false);
    }
  };

  const inputCls =
    'w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-purple-500 placeholder-slate-500';
  const selectCls =
    'w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500';
  const labelCls = 'block text-xs uppercase tracking-wider text-slate-400 mb-1.5';

  const wizardTitles: Record<WizardStep, string> = {
    1: 'Datos personales',
    2: 'Tu ubicación',
    3: 'Tus intereses',
  };

  const renderWizard = () => {
    if (!wizard) return null;
    const answeredCount = INTEREST_QUESTIONS.filter((q) => (wizard.answers[q.q] || []).length > 0).length;
    const stepErrors = stepErrorList(wstep, wizard);
    const canContinue = stepErrors.length === 0;

    return (
      <form onSubmit={submitWizard} className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-100">Completa tu perfil</h2>
          <button
            type="button"
            onClick={exitWizard}
            className="text-xs text-slate-500 hover:text-red-400 transition-colors"
          >
            Cerrar sesión
          </button>
        </div>

        <div className="flex items-center gap-2">
          {([1, 2, 3] as WizardStep[]).map((s) => (
            <div key={s} className="flex-1">
              <div
                className={`h-1.5 rounded-full transition-colors ${
                  s <= wstep ? 'bg-purple-500' : 'bg-slate-700'
                }`}
              />
              <p className={`text-[10px] mt-1 uppercase tracking-wider ${s === wstep ? 'text-purple-300' : 'text-slate-500'}`}>
                {s === 1 ? 'Datos' : s === 2 ? 'Ubicación' : 'Intereses'}
              </p>
            </div>
          ))}
        </div>

        <h3 className="text-sm font-semibold text-purple-300 flex items-center gap-2">
          <Sparkles className="w-4 h-4" />
          Paso {wstep} de 3 · {wizardTitles[wstep]}
        </h3>

        {wstep === 1 && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Nombre(s)</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    value={wizard.first_name}
                    onChange={(e) => updateField('first_name', e.target.value)}
                    placeholder="Ana"
                    className={inputCls}
                  />
                </div>
              </div>
              <div>
                <label className={labelCls}>Apellidos</label>
                <div className="relative">
                  <Contact className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    value={wizard.last_name}
                    onChange={(e) => updateField('last_name', e.target.value)}
                    placeholder="García López"
                    className={inputCls}
                  />
                </div>
              </div>
            </div>

            <div>
              <label className={labelCls}>Correo personal</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="email"
                  value={wizard.personal_email}
                  onChange={(e) => updateField('personal_email', e.target.value)}
                  placeholder="ana@gmail.com"
                  className={inputCls}
                />
              </div>
            </div>

            <div>
              <label className={labelCls}>Correo educativo</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="email"
                  value={wizard.edu_email}
                  onChange={(e) => updateField('edu_email', e.target.value)}
                  placeholder="ana.garcia@escuela.edu"
                  className={inputCls}
                />
              </div>
            </div>

            <div>
              <label className={labelCls}>Teléfono</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="tel"
                  value={wizard.phone}
                  onChange={(e) => updateField('phone', e.target.value.replace(/[^\d+]/g, ''))}
                  placeholder="+52 55 1234 5678"
                  maxLength={20}
                  className={inputCls}
                />
              </div>
            </div>

            <div>
              <label className={labelCls}>Dirección</label>
              <div className="relative">
                <Home className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  value={wizard.address}
                  onChange={(e) => updateField('address', e.target.value)}
                  placeholder="Av. Universidad 123"
                  className={inputCls}
                />
              </div>
            </div>

            <div>
              <label className={labelCls}>Fecha de nacimiento</label>
              <div className="relative">
                <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="date"
                  value={wizard.birth_date}
                  onChange={(e) => updateField('birth_date', e.target.value)}
                  max={new Date().toISOString().slice(0, 10)}
                  className={inputCls}
                />
              </div>
              {wizard.birth_date && calculateAge(wizard.birth_date) !== null && (
                <p className="text-[10px] text-slate-500 mt-1">
                  Edad calculada: {calculateAge(wizard.birth_date)} años
                </p>
              )}
            </div>
          </div>
        )}

        {wstep === 2 && (
          <div className="space-y-3">
            <div>
              <label className={labelCls}>País</label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <select
                  value={wizard.country}
                  onChange={(e) => onCountryChange(e.target.value)}
                  className={selectCls}
                >
                  <option value="">Selecciona tu país…</option>
                  {countries.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className={labelCls}>Estado / Departamento</label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <select
                  value={wizard.state}
                  onChange={(e) => onStateChange(e.target.value)}
                  disabled={!wizard.country || wizardLoading}
                  className={selectCls}
                >
                  <option value="">
                    {!wizard.country ? 'Primero selecciona tu país…' : 'Selecciona tu estado…'}
                  </option>
                  {states.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className={labelCls}>Ciudad</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  value={cityQ}
                  onChange={(e) => searchCities(e.target.value, wizard.country, wizard.state)}
                  onFocus={() => openCityList(wizard.country, wizard.state)}
                  onBlur={() => {
                    setTimeout(() => setCityOpen(false), 150);
                  }}
                  placeholder={wizard.state ? 'Escribe tu ciudad…' : 'Selecciona primero estado y país'}
                  disabled={!wizard.state}
                  className={inputCls}
                />
                {cityOpen && cityResults.length > 0 && (
                  <div className="absolute z-20 left-0 right-0 top-full mt-1 max-h-52 overflow-y-auto bg-slate-800 border border-slate-600 rounded-lg shadow-xl">
                    {cityResults.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          pickCity(c);
                        }}
                        className="block w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-purple-600 hover:text-white transition-colors"
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {cityResults.length > 0 && (
                <p className="text-[10px] text-slate-500 mt-1">Sugerencias: {cityResults.slice(0, 5).join(' · ')}</p>
              )}
            </div>
          </div>
        )}

        {wstep === 3 && (
          <div className="space-y-4 max-h-64 overflow-y-auto pr-1">
            <p className="text-[11px] text-purple-300/80 bg-purple-950/20 border border-purple-900/40 rounded-lg px-3 py-1.5 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0" />
              <span>Puedes seleccionar todas las opciones que consideres pertinentes.</span>
            </p>
            {INTEREST_QUESTIONS.map((q, qi) => {
              const selectedList = wizard.answers[q.q] || [];
              return (
                <div key={q.q}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-slate-300 font-medium">
                      {qi + 1}. {q.q}
                    </p>
                    {selectedList.length > 0 && (
                      <span className="text-[10px] text-purple-400 font-mono bg-purple-950/60 px-1.5 py-0.5 rounded border border-purple-800/40">
                        {selectedList.length} seleccionada{selectedList.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {q.options.map((opt) => {
                      const active = selectedList.includes(opt);
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => toggleAnswer(q.q, opt)}
                          className={`text-xs px-3 py-1.5 rounded-full border transition-all flex items-center gap-1.5 ${
                            active
                              ? 'bg-purple-600 border-purple-400 text-white shadow-lg shadow-purple-900/30 font-medium'
                              : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:border-purple-500/70 hover:bg-slate-800'
                          }`}
                        >
                          {active && <CheckCircle2 className="w-3 h-3 text-purple-200 shrink-0" />}
                          <span>{opt}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            <p className="text-[10px] text-slate-500">
              Respondidas: {answeredCount} de {INTEREST_QUESTIONS.length} (mínimo 3).
            </p>
          </div>
        )}

        {wizardError && (
          <p className="text-sm text-red-400 bg-red-950/40 border border-red-800 rounded-lg px-3 py-2">{wizardError}</p>
        )}

        {!canContinue && !wizardError && (
          <p className="text-[11px] text-amber-400/90 bg-amber-950/30 border border-amber-800/50 rounded-lg px-3 py-2 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span>Falta completar: {stepErrors.join(' · ')}</span>
          </p>
        )}

        <div className="flex gap-2">
          {wstep > 1 && (
            <button
              type="button"
              onClick={backStep}
              className="flex items-center justify-center gap-1 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-semibold transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              VOLVER
            </button>
          )}
          {wstep < 3 ? (
            <button
              type="button"
              onClick={nextStep}
              disabled={!canContinue}
              className="flex-1 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-purple-600 text-white font-semibold rounded-lg py-2.5 transition-colors"
            >
              CONTINUAR
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={wizardLoading || !canContinue}
              className="flex-1 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-purple-600 text-white font-semibold rounded-lg py-2.5 transition-colors"
            >
              {wizardLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {wizardLoading ? 'Guardando…' : 'GUARDAR Y ENTRAR'}
            </button>
          )}
        </div>
      </form>
    );
  };

  return (
    <div className="h-full flex flex-col items-center justify-center bg-slate-950 text-slate-200">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <div className="w-20 h-20 rounded-full overflow-hidden border border-slate-700 shadow-lg mb-4">
            <img src="./logo.jpg" alt="Omni-IA Game" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-2xl font-bold tracking-wider text-center">
            OMNI-IA <span className="text-purple-400">GAME</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">Versión Educativa</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl">
          {wizard ? (
            renderWizard()
          ) : step === 'verify' ? (
            <form onSubmit={handleVerify} className="space-y-4">
              <h2 className="text-base font-semibold text-slate-100 text-center">Confirma tu cuenta</h2>
              <p className="text-xs text-slate-400 text-center leading-relaxed">
                Ingresa el código de 6 dígitos que enviamos a
                <span className="block font-semibold text-slate-200 mt-1">{email.trim().toLowerCase()}</span>
              </p>
              <div>
                <label className={labelCls}>Código de confirmación</label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    autoFocus
                    className={inputCls}
                  />
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-400 bg-red-950/40 border border-red-800 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
              {success && (
                <p className="text-sm text-green-400 bg-green-950/40 border border-green-800 rounded-lg px-3 py-2 flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                  {success}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-semibold rounded-lg py-2.5 transition-colors"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {loading ? 'Verificando...' : 'ACTIVAR CUENTA'}
              </button>
              <button
                type="button"
                onClick={handleResend}
                disabled={loading}
                className="w-full text-xs text-slate-400 hover:text-purple-400 disabled:opacity-50 transition-colors"
              >
                ¿No llegó el código? Reenviar
              </button>
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="w-full text-xs text-slate-500 hover:text-slate-300 transition-colors pt-2 border-t border-slate-800"
              >
                ← Volver al inicio de sesión
              </button>
            </form>
          ) : step === 'forgot_request' ? (
            <form onSubmit={handleForgotRequest} className="space-y-4">
              <div className="text-center">
                <div className="inline-flex p-3 bg-purple-600/20 text-purple-400 rounded-full mb-2">
                  <KeyRound className="w-6 h-6" />
                </div>
                <h2 className="text-base font-semibold text-slate-100">Recuperar Contraseña</h2>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Ingresa tu correo registrado y te enviaremos un código de seguridad para restablecerla.
                </p>
              </div>

              <div>
                <label className={labelCls}>Correo electrónico</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="estudiante@correo.com"
                    autoFocus
                    required
                    className={inputCls}
                  />
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-400 bg-red-950/40 border border-red-800 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
              {success && (
                <p className="text-sm text-green-400 bg-green-950/40 border border-green-800 rounded-lg px-3 py-2 flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                  {success}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-semibold rounded-lg py-2.5 transition-colors"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                {loading ? 'Enviando código...' : 'ENVIAR CÓDIGO'}
              </button>

              <button
                type="button"
                onClick={() => switchMode('login')}
                className="w-full text-xs text-slate-400 hover:text-purple-400 transition-colors pt-2 border-t border-slate-800"
              >
                ← Volver al inicio de sesión
              </button>
            </form>
          ) : step === 'forgot_confirm' ? (
            <form onSubmit={handleForgotConfirm} className="space-y-4">
              <div className="text-center">
                <div className="inline-flex p-3 bg-purple-600/20 text-purple-400 rounded-full mb-2">
                  <Lock className="w-6 h-6" />
                </div>
                <h2 className="text-base font-semibold text-slate-100">Nueva Contraseña</h2>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Ingresa el código enviado a <strong className="text-slate-200">{email}</strong> y tu nueva contraseña.
                </p>
              </div>

              <div>
                <label className={labelCls}>Código de seguridad (6 dígitos)</label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    autoFocus
                    required
                    className={inputCls}
                  />
                </div>
              </div>

              <div>
                <label className={labelCls}>Nueva contraseña</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    required
                    className={inputCls}
                  />
                </div>
              </div>

              <div>
                <label className={labelCls}>Confirmar nueva contraseña</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repite la contraseña"
                    required
                    className={inputCls}
                  />
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-400 bg-red-950/40 border border-red-800 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
              {success && (
                <p className="text-sm text-green-400 bg-green-950/40 border border-green-800 rounded-lg px-3 py-2 flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                  {success}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-semibold rounded-lg py-2.5 transition-colors"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {loading ? 'Restableciendo...' : 'RESTABLECER CONTRASEÑA'}
              </button>

              <button
                type="button"
                onClick={handleForgotRequest}
                disabled={loading}
                className="w-full text-xs text-slate-400 hover:text-purple-400 disabled:opacity-50 transition-colors"
              >
                ¿No llegó el código? Reenviar código
              </button>

              <button
                type="button"
                onClick={() => switchMode('login')}
                className="w-full text-xs text-slate-500 hover:text-slate-300 transition-colors pt-2 border-t border-slate-800"
              >
                ← Cancelar y volver al inicio de sesión
              </button>
            </form>
          ) : (
            <>
              <div className="flex rounded-lg overflow-hidden border border-slate-700 mb-5">
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className={`flex-1 py-2 text-xs font-semibold transition-colors ${
                    mode === 'login' ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  INICIAR SESIÓN
                </button>
                <button
                  type="button"
                  onClick={() => switchMode('register')}
                  className={`flex-1 py-2 text-xs font-semibold transition-colors ${
                    mode === 'register' ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  REGISTRARSE
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
                <div>
                  <label className={labelCls}>Correo electrónico</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="estudiante@correo.com"
                      autoFocus
                      autoComplete="off"
                      className={inputCls}
                    />
                  </div>
                </div>

                <div>
                  <label className={labelCls}>Contraseña</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      className={inputCls}
                    />
                  </div>
                </div>

                {mode === 'register' && (
                  <div>
                    <label className={labelCls}>Confirmar contraseña</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        autoComplete="new-password"
                        className={inputCls}
                      />
                    </div>
                  </div>
                )}

                {mode === 'login' && (
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="accent-purple-500 w-3.5 h-3.5"
                      />
                      Recordar este equipo
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setStep('forgot_request');
                        setError('');
                        setSuccess('');
                      }}
                      className="text-purple-400 hover:text-purple-300 transition-colors font-medium"
                    >
                      ¿Olvidaste tu contraseña?
                    </button>
                  </div>
                )}

                {error && (
                  <p className="text-sm text-red-400 bg-red-950/40 border border-red-800 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}
                {success && (
                  <p className="text-sm text-green-400 bg-green-950/40 border border-green-800 rounded-lg px-3 py-2 flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                    {success}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-semibold rounded-lg py-2.5 transition-colors"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : mode === 'login' ? (
                    <LogIn className="w-4 h-4" />
                  ) : (
                    <UserPlus className="w-4 h-4" />
                  )}
                  {loading
                    ? 'Procesando...'
                    : mode === 'login'
                    ? 'ENTRAR'
                    : 'CREAR CUENTA'}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-xs text-slate-600 mt-6">
          Acceso educativo supervisado · Omni-IA Game
        </p>
      </div>
    </div>
  );
};

export default AuthScreen;
