import React, { useState } from 'react';
import { Lock, User, KeyRound } from 'lucide-react';

export const OMNI_LAUNCHER_AUTH_KEY = 'omni_launcher_auth_ok';

// Credenciales genéricas de aula. Gate educativo, NO es seguridad real:
// el usuario final no tiene acceso a la configuración del navegador, pero
// cualquiera con DevTools puede saltarlo. El propósito es evitar que los
// estudiantes entren sin supervisión del docente.
const LAUNCHER_USERNAME = 'omni-ia';
const LAUNCHER_PASSWORD = 'omni-ia';

interface LauncherLoginProps {
  onLogin: () => void;
}

const LauncherLogin: React.FC<LauncherLoginProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim().toLowerCase() === LAUNCHER_USERNAME && password === LAUNCHER_PASSWORD) {
      try {
        if (rememberMe) {
          localStorage.setItem(OMNI_LAUNCHER_AUTH_KEY, '1');
        } else {
          localStorage.removeItem(OMNI_LAUNCHER_AUTH_KEY);
        }
      } catch {
        // localStorage no disponible (modo privado): el login sigue funcionando por sesión
      }
      onLogin();
    } else {
      setError('Usuario o contraseña incorrectos');
    }
  };

  return (
    <div className="h-full flex flex-col items-center justify-center bg-slate-950 text-slate-200">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 rounded-full overflow-hidden border border-slate-700 shadow-lg mb-4">
            <img src="/logo.jpg" alt="Omni-IA Game" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-2xl font-bold tracking-wider text-center">
            OMNI-IA <span className="text-purple-400">GAME</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">Versión Educativa</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl space-y-4"
        >
          <div>
            <label className="block text-xs uppercase tracking-wider text-slate-400 mb-1.5">
              Usuario
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Usuario"
                autoFocus
                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider text-slate-400 mb-1.5">
              Contraseña
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="accent-purple-500 w-4 h-4"
            />
            Recordar este equipo
          </label>

          {error && (
            <p className="text-sm text-red-400 bg-red-950/40 border border-red-800 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-lg py-2.5 transition-colors"
          >
            <KeyRound className="w-4 h-4" />
            ENTRAR
          </button>
        </form>

        <p className="text-center text-xs text-slate-600 mt-6">
          Acceso educativo supervisado · Omni-IA Game
        </p>
      </div>
    </div>
  );
};

export default LauncherLogin;
