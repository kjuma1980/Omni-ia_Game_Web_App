import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getServices } from '../state/services';
import type { CreateWorldForm } from '../schemas';
import type { WorldType } from '../types';

export const queryKeys = {
  health: ['creador2d', 'health'] as const,
  worlds: ['creador2d', 'worlds'] as const,
  world: (id: string) => ['creador2d', 'world', id] as const,
  blocks: (worldType?: WorldType, biome?: string) =>
    ['creador2d', 'blocks', worldType ?? 'all', biome ?? 'all'] as const,
  profile: ['creador2d', 'profile'] as const,
  aiStatus: (worldId: string) => ['creador2d', 'ai-status', worldId] as const,
};

export function useHealth() {
  const { client } = getServices();

  return useQuery({
    queryKey: queryKeys.health,
    queryFn: () => client.health(),
    refetchInterval: 30_000,
    retry: false,
    staleTime: 10_000,
  });
}

export function useWorlds(enabled: boolean) {
  const { client } = getServices();

  return useQuery({
    queryKey: queryKeys.worlds,
    queryFn: () => client.listWorlds(),
    enabled,
    staleTime: 15_000,
  });
}

export function useWorld(worldId: string | null) {
  const { client } = getServices();

  return useQuery({
    queryKey: queryKeys.world(worldId ?? 'none'),
    queryFn: () => client.getWorld(worldId as string),
    enabled: Boolean(worldId),
  });
}

export function useBlocks(worldType: WorldType | undefined, biome: string | undefined, enabled: boolean) {
  const { client } = getServices();

  return useQuery({
    queryKey: queryKeys.blocks(worldType, biome),
    queryFn: () => client.listBlocks(worldType),
    enabled,
    // El catalogo solo cambia al sembrar la base de datos.
    staleTime: 5 * 60_000,
  });
}

export function useProfile(enabled: boolean) {
  const { client } = getServices();

  return useQuery({
    queryKey: queryKeys.profile,
    queryFn: () => client.getProfile(),
    enabled,
    staleTime: 5_000,
  });
}

export function useAiStatus(worldId: string | null) {
  const { client } = getServices();

  return useQuery({
    queryKey: queryKeys.aiStatus(worldId ?? 'none'),
    queryFn: () => client.aiStatus(worldId as string),
    enabled: Boolean(worldId),
    retry: false,
    staleTime: 60_000,
  });
}

export function useCreateWorld() {
  const { client } = getServices();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (form: CreateWorldForm) => client.createWorld(form),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.worlds }),
  });
}

export function useDeleteWorld() {
  const { client } = getServices();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (worldId: string) => client.deleteWorld(worldId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.worlds }),
  });
}

export function useCraft() {
  const { client } = getServices();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { blockKey: string; times: number }) =>
      client.craft(payload.blockKey, payload.times),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.profile }),
  });
}

export function useStarterKit() {
  const { client } = getServices();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => client.grantStarterKit(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.profile }),
  });
}

export function useAiSuggest(worldId: string | null) {
  const { client } = getServices();

  return useMutation({
    mutationFn: (payload: {
      prompt: string;
      provider?: string;
      area: { tileX: number; tileY: number; width: number; height: number };
    }) => client.aiSuggest(worldId as string, payload),
  });
}

export function useAiAccept(worldId: string | null) {
  const { client } = getServices();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (suggestionId: string) => client.aiAccept(worldId as string, suggestionId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.profile }),
  });
}

export function useAiReject(worldId: string | null) {
  const { client } = getServices();

  return useMutation({
    mutationFn: (suggestionId: string) => client.aiReject(worldId as string, suggestionId),
  });
}

export function useParallaxLayers(worldId: string | null) {
  const { client } = getServices();

  return useQuery({
    queryKey: ['creador2d', 'parallax', worldId ?? 'none'],
    queryFn: () => client.listParallax(worldId as string),
    enabled: Boolean(worldId),
    staleTime: 30_000,
  });
}

export function useParallaxGeneratorStatus(worldId: string | null) {
  const { client } = getServices();

  return useQuery({
    queryKey: ['creador2d', 'parallax-generator', worldId ?? 'none'],
    queryFn: () => client.parallaxGeneratorStatus(worldId as string),
    enabled: Boolean(worldId),
    retry: false,
    // ComfyUI puede levantarse mientras el editor esta abierto.
    refetchInterval: 60_000,
  });
}

export function useGenerateParallax(worldId: string | null) {
  const { client } = getServices();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { layerId: string; hint?: string; style?: string; seed?: number }) =>
      client.generateParallaxLayer(worldId as string, payload.layerId, {
        hint: payload.hint,
        style: payload.style,
        seed: payload.seed,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['creador2d', 'parallax', worldId ?? 'none'] }),
  });
}

export function useUpdateParallaxLayer(worldId: string | null) {
  const { client } = getServices();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { layerId: string; data: Record<string, unknown> }) =>
      client.updateParallaxLayer(worldId as string, payload.layerId, payload.data),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['creador2d', 'parallax', worldId ?? 'none'] }),
  });
}

export function usePreviewParallaxPrompt(worldId: string | null) {
  const { client } = getServices();

  return useMutation({
    mutationFn: (payload: { kind: string; hint?: string; style?: string }) =>
      client.previewParallaxPrompt(worldId as string, payload),
  });
}

export function useWeather(worldId: string | null) {
  const { client } = getServices();

  return useQuery({
    queryKey: ['creador2d', 'weather', worldId ?? 'none'],
    queryFn: () => client.getWeather(worldId as string),
    enabled: Boolean(worldId),
  });
}

export function useUpdateWeather(worldId: string | null) {
  const { client } = getServices();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      client.updateWeather(worldId as string, payload),
    onSuccess: (data) => {
      // Se escribe la respuesta directamente en la cache para que los
      // deslizadores no den un salto mientras se refresca la consulta.
      queryClient.setQueryData(['creador2d', 'weather', worldId ?? 'none'], data);
    },
  });
}

export function useFluidSettings(worldId: string | null) {
  const { client } = getServices();

  return useQuery({
    queryKey: ['creador2d', 'fluids', worldId ?? 'none'],
    queryFn: async () => {
      const [settings, inUse] = await Promise.all([
        client.listFluids(worldId as string),
        client.fluidsInUse(worldId as string),
      ]);
      return { settings, inUse };
    },
    enabled: Boolean(worldId),
  });
}

export function useUpsertFluid(worldId: string | null) {
  const { client } = getServices();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => client.upsertFluid(worldId as string, payload),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['creador2d', 'fluids', worldId ?? 'none'] }),
  });
}

export function useObjects(worldId: string | null) {
  const { client } = getServices();

  return useQuery({
    queryKey: ['creador2d', 'objects', worldId ?? 'none'],
    queryFn: () => client.listObjects(worldId as string),
    enabled: Boolean(worldId),
  });
}

export function useInteriors(worldId: string | null) {
  const { client } = getServices();

  return useQuery({
    queryKey: ['creador2d', 'interiors', worldId ?? 'none'],
    queryFn: () => client.listInteriors(worldId as string),
    enabled: Boolean(worldId),
  });
}

export function useCreateInterior(worldId: string | null) {
  const { client } = getServices();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      client.createInterior(worldId as string, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creador2d', 'interiors', worldId ?? 'none'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.worlds });
    },
  });
}

export function useEngineToken(worldId: string | null) {
  const { client } = getServices();

  return useMutation({
    mutationFn: () => client.engineToken(worldId as string),
  });
}
