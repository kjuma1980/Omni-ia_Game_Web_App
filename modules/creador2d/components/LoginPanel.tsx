import React, { useState } from 'react';
import { KeyRound, LogIn, UserPlus } from 'lucide-react';
import { getServices } from '../state/services';
import { useEditorStore } from '../state/editorStore';
import { Help } from './Help';

interface Props {
  onAuthenticated: () => void;
}

/**
 * Puerta de entrada al submodulo. El Creador 2D mantiene su propia identidad
 * porque escribe en su propia base de datos; no reutiliza ni toca el estado de
 * la aplicacion base.
 */
export const LoginPanel: React.FC<Props> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [identifier, setIdentifier] = useState('creador');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setAuth = useEditorStore((state) => state.setAuth);
  const pushToast = useEditorStore((state) => state.pushToast);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const { client } = getServices();
      const session =
        mode === 'login'
          ? await client.login(identifier, password)
          : await client.register(email, username, password);

      setAuth('authenticated', session.user.username);
      pushToast('success', `Sesion iniciada como ${session.user.username}`);
      onAuthenticated();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center justify-center h-full p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-md bg-slate-900/60 border border-slate-800 rounded-xl p-6 space-y-4 shadow-xl backdrop-blur-sm"
      >
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
          <KeyRound className="w-5 h-5 text-cyan-400" />
          <h3 className="text-lg font-bold text-cyan-400">Creador de Mundos 2D</h3>
        </div>

        <p className="text-[11px] text-slate-400 font-mono leading-relaxed">
          Este submodulo usa su propia base de datos PostgreSQL local
          (<span className="text-slate-300">Creador_2d</span>). Inicie sesion con las credenciales
          de la semilla o registre un usuario nuevo.
        </p>

        <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`flex-1 px-3 py-1.5 text-[10px] rounded uppercase font-bold transition-all ${
              mode === 'login' ? 'bg-cyan-700 text-white' : 'text-slate-500'
            }`}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => setMode('register')}
            className={`flex-1 px-3 py-1.5 text-[10px] rounded uppercase font-bold transition-all ${
              mode === 'register' ? 'bg-cyan-700 text-white' : 'text-slate-500'
            }`}
          >
            Registrarse
          </button>
        </div>

        {mode === 'login' ? (
          <div>
            <label className="block text-slate-400 text-xs mb-1 font-mono uppercase tracking-wider">
              Usuario o email
            </label>
            <input
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              autoComplete="username"
              className="w-full bg-black/50 border border-cyan-500/40 text-cyan-100 p-2 rounded outline-none text-sm font-mono focus:border-cyan-400"
            />
          </div>
        ) : (
          <>
            <div>
              <label className="block text-slate-400 text-xs mb-1 font-mono uppercase tracking-wider">
                Email
              </label>
              <Help id="c2dLoginEmail"><input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                className="w-full bg-black/50 border border-cyan-500/40 text-cyan-100 p-2 rounded outline-none text-sm font-mono focus:border-cyan-400"
              /></Help>
            </div>
            <div>
              <label className="block text-slate-400 text-xs mb-1 font-mono uppercase tracking-wider">
                Usuario
              </label>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                className="w-full bg-black/50 border border-cyan-500/40 text-cyan-100 p-2 rounded outline-none text-sm font-mono focus:border-cyan-400"
              />
            </div>
          </>
        )}

        <div>
          <label className="block text-slate-400 text-xs mb-1 font-mono uppercase tracking-wider">
            Clave
          </label>
          <Help id="c2dLoginPassword"><input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            className="w-full bg-black/50 border border-cyan-500/40 text-cyan-100 p-2 rounded outline-none text-sm font-mono focus:border-cyan-400"
          /></Help>
          {mode === 'register' && (
            <p className="text-[10px] text-slate-500 mt-1 font-mono">
              Minimo 10 caracteres, con mayuscula, minuscula y digito.
            </p>
          )}
        </div>

        {error && (
          <p className="text-[11px] text-red-400 font-mono bg-red-950/30 border border-red-900/50 rounded px-2 py-1.5">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 bg-cyan-700 hover:bg-cyan-600 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold uppercase tracking-wider py-2.5 rounded transition-all"
        >
          {mode === 'login' ? <LogIn className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
          {busy ? 'Conectando...' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
        </button>
      </form>
    </div>
  );
};
