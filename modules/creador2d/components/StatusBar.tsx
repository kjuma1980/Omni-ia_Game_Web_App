import React from 'react';
import { Activity, Boxes, Cpu, Radio, Users } from 'lucide-react';
import { useEditorStore } from '../state/editorStore';
import { getServices } from '../state/services';
import { describeCollision, pixelToTile, tileToChunk } from '../core/grid';

const CONNECTION_STYLE = {
  connecting: 'text-amber-400',
  online: 'text-emerald-400',
  offline: 'text-slate-500',
  error: 'text-red-400',
} as const;

const CONNECTION_LABEL = {
  connecting: 'conectando',
  online: 'en linea',
  offline: 'sin socket',
  error: 'error',
} as const;

export const StatusBar: React.FC = () => {
  const world = useEditorStore((state) => state.world);
  const camera = useEditorStore((state) => state.camera);
  const hover = useEditorStore((state) => state.hover);
  const connection = useEditorStore((state) => state.connection);
  const connectionDetail = useEditorStore((state) => state.connectionDetail);
  const presences = useEditorStore((state) => state.presences);
  const pendingOperations = useEditorStore((state) => state.pendingOperations);

  const services = getServices();
  const residentChunks = services.chunkStore.getResidentKeys().length;

  if (!world) {
    return null;
  }

  const cameraChunk = {
    cx: tileToChunk(pixelToTile(camera.x, world.tileSize), world.chunkSize),
    cy: tileToChunk(pixelToTile(camera.y, world.tileSize), world.chunkSize),
  };

  const collisionMask = hover ? services.chunkStore.collisionAt(hover.tileX, hover.tileY) : 0;
  const collisionFlags = describeCollision(collisionMask);
  const collaborators = Object.keys(presences).length;

  return (
    <div className="flex items-center gap-4 px-3 py-1.5 bg-slate-950/90 border-t border-slate-800 text-[10px] font-mono text-slate-500">
      <span className="flex items-center gap-1.5">
        <Boxes className="w-3 h-3 text-cyan-500" />
        chunks residentes <span className="text-slate-300">{residentChunks}/9</span>
      </span>

      <span className="flex items-center gap-1.5">
        <Cpu className="w-3 h-3 text-cyan-500" />
        chunk camara{' '}
        <span className="text-slate-300">
          {cameraChunk.cx}:{cameraChunk.cy}
        </span>
      </span>

      <span>
        tile{' '}
        <span className="text-slate-300">
          {hover ? `${hover.tileX}, ${hover.tileY}` : '—'}
        </span>
      </span>

      <span>
        colision{' '}
        <span className={collisionFlags.length > 0 ? 'text-amber-400' : 'text-slate-600'}>
          {collisionFlags.length > 0 ? collisionFlags.join('+') : 'libre'}
        </span>
      </span>

      <span className="ml-auto flex items-center gap-1.5">
        <Users className="w-3 h-3" />
        <span className="text-slate-300">{collaborators}</span> colaborador
        {collaborators === 1 ? '' : 'es'}
      </span>

      {pendingOperations > 0 && (
        <span className="flex items-center gap-1.5 text-amber-400">
          <Activity className="w-3 h-3 animate-pulse" />
          {pendingOperations} envio{pendingOperations === 1 ? '' : 's'} en curso
        </span>
      )}

      <span
        className={`flex items-center gap-1.5 ${CONNECTION_STYLE[connection]}`}
        title={connectionDetail ?? undefined}
      >
        <Radio className="w-3 h-3" />
        {CONNECTION_LABEL[connection]}
      </span>
    </div>
  );
};
