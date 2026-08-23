import { ArtStyle, ActionType, AnimationType } from './types';

export const ART_STYLES: ArtStyle[] = [
  'Pixel Art (8-bit)', 'Pixel Art (16-bit)', 'Pixel Art (HD)', 'Low Poly 3D',
  'Realistic 3D (PBR)', '2.5D Style', 'Flat Vector', 'Cartoon / Cel Shaded',
  'Digital Painting', 'Watercolor', 'Hand-drawn / Line Art', 'Voxel Art',
  'Retro Low-Res 3D (PS1)', 'Minimalist UI/UX', 'Gothic / Dark Fantasy',
  'Colorful Fantasy', 'Top-down', 'Chibi / SD', 'Stylized Realism', 'Pre-rendered Sprites',
  'Silhouette Art', 'Stylized / Soft Shading'
];

export const ACTIONS: ActionType[] = ['Idle', 'Walk', 'Attack', 'Jump', 'Static Object', 'T-Pose', 'Model Sheet'];

export const ANIMATION_ACTIONS = [
  'Walk Cycle',
  'Run Cycle',
  'Jump',
  'Jump Forward',
  'Jump Backward',
  'Melee Attack',
  'Firearm Attack',
  'Sword Attack',
  'Blunt Attack',
  'Hit / Take Damage',
  'Shot / Hurt',
  'Death / Die',
  'Pickup Item',
  'Custom Action',
  'Object Animation'
] as const;

export type AnimationActionType = typeof ANIMATION_ACTIONS[number];

export const ANIMATION_TYPES: AnimationType[] = [
  'Walk Cycle', 'Melee Attack', 'Firearm Attack', 'Sword Attack', 'Blunt Weapon Attack',
  'Magic Attack', 'Jump (Flip Forward)', 'Jump (Flip Backward)', 'Jump (Forward Displacement)',
  'Jump (Backward Displacement)', 'Jump (Vertical Low)', 'Jump (Vertical Mid)',
  'Jump (Vertical High)', 'Jump (Over Character)', 'Jump (Away from Character)',
  'Crouch', 'Prone (Face Down)', 'Supine (Face Up)', 'Ground Roll (Right)',
  'Ground Roll (Left)', 'Direct Hit', 'Body Shot', 'Injured', 'Death', 'Getting Up'
];
