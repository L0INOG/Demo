/**
 * Weapon configuration data types.
 * Loaded from data/weapons.json at startup.
 * Design follows report 01 §7 and report 02 §9.
 */

export type FireMode = 'semi' | 'burst' | 'auto';

export interface RecoilOffset {
  yaw: number;
  pitch: number;
}

export interface RecoilConfig {
  offsets: RecoilOffset[];
  recoverySpeed: number;
  recoveryDelay: number;
}

export interface SpreadConfig {
  base: number;
  perShot: number;
  max: number;
  recoveryPerSec: number;
}

export interface DamageFalloffStep {
  range: number;
  multiplier: number;
}

export interface DamageFalloffConfig {
  curve: 'linear' | 'exponential' | 'step';
  steps: DamageFalloffStep[];
  minDamagePercent: number;
}

export interface WeaponSoundConfig {
  shoot: string[];
  reload: string;
  empty: string;
}

export interface WeaponConfig {
  id: string;
  name: string;
  type: 'hitscan' | 'projectile';
  fireRate: number;        // RPM
  fireMode: FireMode;
  magSize: number;
  maxAmmo: number;
  reloadTime: number;      // seconds
  damage: number;
  range: { effective: number; max: number };
  spread: SpreadConfig;
  recoil: RecoilConfig;
  damageFalloff: DamageFalloffConfig;
  sounds: WeaponSoundConfig;
}

export interface WeaponsManifest {
  [key: string]: WeaponConfig;
}
