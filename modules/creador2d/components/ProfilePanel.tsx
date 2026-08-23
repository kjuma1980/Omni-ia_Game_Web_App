import React from 'react';
import { Award, Gift, Trophy } from 'lucide-react';
import { useStarterKit } from '../api/hooks';
import { useEditorStore } from '../state/editorStore';
import type { PlayerProfile } from '../types';

interface Props {
  profile: PlayerProfile | undefined;
  isLoading: boolean;
  onRefresh: () => void;
}

/**
 * Progresion del creador.
 *
 * Todos los valores que se muestran aqui los calcula el backend a partir de las
 * celdas realmente escritas en la base de datos. Ni el cliente ni la IA pueden
 * reclamar puntos, experiencia, inventario o logros por su cuenta.
 */
export const ProfilePanel: React.FC<Props> = ({ profile, isLoading, onRefresh }) => {
  const starterKit = useStarterKit();
  const pushToast = useEditorStore((state) => state.pushToast);

  const claim = async () => {
    try {
      const result = await starterKit.mutateAsync();
      pushToast('success', `Kit inicial entregado: ${result.granted} tipos de bloque`);
      onRefresh();
    } catch (error) {
      pushToast('error', (error as Error).message);
    }
  };

  if (isLoading || !profile) {
    return (
      <div className="px-3 py-3 text-[10px] font-mono text-slate-500 border-t border-slate-800">
        Cargando progresion...
      </div>
    );
  }

  const currentLevelFloor = Math.pow(profile.level - 1, 2) * 100;
  const span = Math.max(1, profile.nextLevelAt - currentLevelFloor);
  const progress = Math.min(
    100,
    Math.max(0, ((profile.experience - currentLevelFloor) / span) * 100),
  );

  return (
    <div className="border-t border-slate-800">
      <h4 className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5 px-3 py-2 border-b border-slate-800/60">
        <Trophy className="w-3.5 h-3.5" /> Progresion
      </h4>

      <div className="p-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-100">Nivel {profile.level}</span>
          <span className="text-[10px] font-mono text-slate-400">{profile.points} pts</span>
        </div>

        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-amber-600 to-amber-400 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-[9px] font-mono text-slate-500">
          {profile.experience} / {profile.nextLevelAt} XP
        </p>

        {profile.inventory.length === 0 ? (
          <button
            type="button"
            onClick={claim}
            disabled={starterKit.isPending}
            className="w-full flex items-center justify-center gap-1.5 bg-amber-800/50 hover:bg-amber-700/60 disabled:bg-slate-900 text-amber-100 text-[10px] font-bold uppercase tracking-wider py-1.5 rounded transition"
          >
            <Gift className="w-3 h-3" /> Reclamar kit inicial
          </button>
        ) : (
          <p className="text-[9px] font-mono text-slate-500">
            Inventario: {profile.inventory.length} tipos ·{' '}
            {profile.inventory.reduce((total, item) => total + item.quantity, 0)} unidades
          </p>
        )}

        {profile.achievements.length > 0 && (
          <div className="pt-1.5 border-t border-slate-800/70 space-y-1">
            {profile.achievements.slice(0, 4).map((achievement) => (
              <div key={achievement.key} className="flex items-start gap-1.5">
                <Award className="w-3 h-3 text-amber-400 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-slate-200 truncate">
                    {achievement.name}
                  </p>
                  <p className="text-[9px] font-mono text-slate-500 leading-snug">
                    {achievement.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
