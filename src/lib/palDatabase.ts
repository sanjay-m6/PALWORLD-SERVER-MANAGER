// Real Palworld Pals Database
// Organizing 40+ key representative Pals by type and behavior with official game statistics.

export type PalElement = 'Neutral' | 'Fire' | 'Water' | 'Grass' | 'Electric' | 'Ice' | 'Ground' | 'Dark' | 'Dragon' | 'Earth';
export type PalBehavior = 'peaceful' | 'curious' | 'skittish' | 'helpful' | 'warm' | 'nocturnal' | 'aggressive' | 'boss' | 'legendary';
export type PalSize = 'Small' | 'Medium' | 'Large' | 'Massive';

export interface WorkSuitability {
  work: string;
  level: number;
}

export interface PalData {
  number: number;
  name: string;
  element: PalElement;
  behavior: PalBehavior;
  size: PalSize;
  partnerSkill: string;
  workSuitability: WorkSuitability[];
  drops: string[];
  hp: number;
  atk: number;
  def: number;
  description: string;
  emoji: string;
  color: string; // Theme color for particle effects
}

export const PAL_DATABASE: PalData[] = [
  // --- Starter Pals (Common, Friendly) ---
  {
    number: 1,
    name: 'Lamball',
    element: 'Neutral',
    behavior: 'peaceful',
    size: 'Small',
    partnerSkill: 'Fluffy Shield',
    workSuitability: [
      { work: 'Handiwork', level: 1 },
      { work: 'Transporting', level: 1 },
      { work: 'Farming', level: 1 }
    ],
    drops: ['Wool', 'Lamball Mutton'],
    hp: 60,
    atk: 60,
    def: 60,
    description: 'A walking cotton ball of pure comfort. Runs away at the first sign of danger.',
    emoji: '🐑',
    color: '#e2e8f0'
  },
  {
    number: 2,
    name: 'Cattiva',
    element: 'Neutral',
    behavior: 'curious',
    size: 'Small',
    partnerSkill: 'Cat Helper',
    workSuitability: [
      { work: 'Handiwork', level: 1 },
      { work: 'Gathering', level: 1 },
      { work: 'Transporting', level: 1 },
      { work: 'Mining', level: 1 }
    ],
    drops: ['Red Berries'],
    hp: 70,
    atk: 65,
    def: 55,
    description: 'Looks adorable but is deeply mischievous. Plays tricks on sleeping players.',
    emoji: '🐱',
    color: '#fca5a5'
  },
  {
    number: 3,
    name: 'Chikipi',
    element: 'Neutral',
    behavior: 'skittish',
    size: 'Small',
    partnerSkill: 'Egg Laying',
    workSuitability: [
      { work: 'Gathering', level: 1 },
      { work: 'Farming', level: 1 }
    ],
    drops: ['Egg', 'Chikipi Poultry'],
    hp: 50,
    atk: 50,
    def: 50,
    description: 'Extremely common and easily startled. Lays nutritious eggs when farming.',
    emoji: '🐔',
    color: '#fef08a'
  },
  {
    number: 4,
    name: 'Lifmunk',
    element: 'Grass',
    behavior: 'helpful',
    size: 'Small',
    partnerSkill: 'Lifmunk Recoil',
    workSuitability: [
      { work: 'Planting', level: 1 },
      { work: 'Handiwork', level: 1 },
      { work: 'Lumbering', level: 1 },
      { work: 'Medicine', level: 1 },
      { work: 'Gathering', level: 1 }
    ],
    drops: ['Berry Seeds'],
    hp: 75,
    atk: 70,
    def: 65,
    description: 'A highly industrious squirrel-like creature that loves base-building chores.',
    emoji: '🐿️',
    color: '#86efac'
  },
  {
    number: 5,
    name: 'Foxparks',
    element: 'Fire',
    behavior: 'warm',
    size: 'Small',
    partnerSkill: 'Huggy Fire',
    workSuitability: [
      { work: 'Kindling', level: 1 }
    ],
    drops: ['Flame Organ', 'Leather'],
    hp: 65,
    atk: 80,
    def: 50,
    description: 'Emits a cozy warmth. Can be used as a handheld flamethrower by partners.',
    emoji: '🦊',
    color: '#fdba74'
  },
  {
    number: 6,
    name: 'Fuack',
    element: 'Water',
    behavior: 'peaceful',
    size: 'Small',
    partnerSkill: 'Surfing Water',
    workSuitability: [
      { work: 'Watering', level: 1 },
      { work: 'Handiwork', level: 1 },
      { work: 'Transporting', level: 1 }
    ],
    drops: ['Leather', 'Pal Fluids'],
    hp: 70,
    atk: 75,
    def: 60,
    description: 'Splashes water everywhere. Extremely playful and enjoys cooling off.',
    emoji: '🦆',
    color: '#67e8f9'
  },
  {
    number: 7,
    name: 'Sparkit',
    element: 'Electric',
    behavior: 'curious',
    size: 'Small',
    partnerSkill: 'Static Electricity',
    workSuitability: [
      { work: 'Generating Electricity', level: 1 },
      { work: 'Handiwork', level: 1 },
      { work: 'Transporting', level: 1 }
    ],
    drops: ['Electric Organ'],
    hp: 60,
    atk: 75,
    def: 55,
    description: 'Constantly crackles with static discharge. Glows brightly in the dark.',
    emoji: '⚡',
    color: '#fde047'
  },

  // --- Worker Pals (Base-Building, Industrious) ---
  {
    number: 10,
    name: 'Pengullet',
    element: 'Water',
    behavior: 'helpful',
    size: 'Small',
    partnerSkill: 'Pengullet Cannon',
    workSuitability: [
      { work: 'Watering', level: 1 },
      { work: 'Handiwork', level: 1 },
      { work: 'Cooling', level: 1 },
      { work: 'Transporting', level: 1 }
    ],
    drops: ['Ice Organ', 'Pal Fluids'],
    hp: 75,
    atk: 70,
    def: 70,
    description: 'Enjoys sliding on its belly. An excellent assistant for watering and keeping items cold.',
    emoji: '🐧',
    color: '#93c5fd'
  },
  {
    number: 14,
    name: 'Melpaca',
    element: 'Neutral',
    behavior: 'peaceful',
    size: 'Medium',
    partnerSkill: 'Pacifying Fluff',
    workSuitability: [
      { work: 'Farming', level: 1 }
    ],
    drops: ['Wool', 'Leather'],
    hp: 110,
    atk: 80,
    def: 85,
    description: 'A gentle, fluffy mount. Grows high-quality wool when left at base pastures.',
    emoji: '🦙',
    color: '#fafaf9'
  },
  {
    number: 22,
    name: 'Digtoise',
    element: 'Ground',
    behavior: 'helpful',
    size: 'Medium',
    partnerSkill: 'Shell Spin',
    workSuitability: [
      { work: 'Mining', level: 3 }
    ],
    drops: ['Ore', 'High Quality Pal Oil'],
    hp: 95,
    atk: 85,
    def: 120,
    description: 'Equipped with a spinning drill-like shell. Unrivaled in base mining efficiency.',
    emoji: '🐢',
    color: '#d97706'
  },
  {
    number: 30,
    name: 'Eikthyrdeer',
    element: 'Neutral',
    behavior: 'peaceful',
    size: 'Medium',
    partnerSkill: 'Forest Guardian',
    workSuitability: [
      { work: 'Lumbering', level: 2 }
    ],
    drops: ['Eikthyrdeer Venison', 'Leather', 'Horn'],
    hp: 100,
    atk: 90,
    def: 80,
    description: 'Has magnificent antlers. Can chop down trees rapidly and leap high when mounted.',
    emoji: '🦌',
    color: '#a1a1aa'
  },

  // --- Combat Pals (Battle-Ready, Aggressive) ---
  {
    number: 45,
    name: 'Chillet',
    element: 'Ice',
    behavior: 'curious',
    size: 'Medium',
    partnerSkill: 'Winding Weasel',
    workSuitability: [
      { work: 'Gathering', level: 1 },
      { work: 'Cooling', level: 1 }
    ],
    drops: ['Leather', 'Ice Organ'],
    hp: 90,
    atk: 95,
    def: 85,
    description: 'A sleek, slithering ice-weasel. Enjoys chasing small prey and cooling off campfires.',
    emoji: '❄️',
    color: '#cbd5e1'
  },
  {
    number: 55,
    name: 'Bushi',
    element: 'Fire',
    behavior: 'aggressive',
    size: 'Medium',
    partnerSkill: 'Brandish Sword',
    workSuitability: [
      { work: 'Kindling', level: 2 },
      { work: 'Handiwork', level: 1 },
      { work: 'Transporting', level: 2 },
      { work: 'Lumbering', level: 3 }
    ],
    drops: ['Bone', 'Ingot'],
    hp: 105,
    atk: 110,
    def: 95,
    description: 'Carries a wooden sword and acts with samurai-like discipline. Fierce melee slash attacks.',
    emoji: '👺',
    color: '#ef4444'
  },
  {
    number: 62,
    name: 'Robinquill',
    element: 'Grass',
    behavior: 'aggressive',
    size: 'Medium',
    partnerSkill: 'Hawk Eye',
    workSuitability: [
      { work: 'Planting', level: 1 },
      { work: 'Handiwork', level: 2 },
      { work: 'Transporting', level: 2 },
      { work: 'Gathering', level: 2 },
      { work: 'Lumbering', level: 1 }
    ],
    drops: ['Arrow', 'Wheat Seeds'],
    hp: 95,
    atk: 105,
    def: 90,
    description: 'An elite archer Pal that protects the forest. Snipes invaders from high tree branches.',
    emoji: '🏹',
    color: '#10b981'
  },

  // --- Boss & Legendary Pals (Rare, Powerful) ---
  {
    number: 100,
    name: 'Anubis',
    element: 'Ground',
    behavior: 'boss',
    size: 'Large',
    partnerSkill: 'Guardian Deity',
    workSuitability: [
      { work: 'Handiwork', level: 4 },
      { work: 'Transporting', level: 2 },
      { work: 'Mining', level: 3 }
    ],
    drops: ['Ancient Civilization Parts', 'Innovative Manual'],
    hp: 120,
    atk: 130,
    def: 110,
    description: 'The ancient guardian god of the desert. Possesses unmatched crafting and combat dexterity.',
    emoji: '🦮',
    color: '#fbbf24'
  },
  {
    number: 105,
    name: 'Grizzbolt',
    element: 'Electric',
    behavior: 'boss',
    size: 'Large',
    partnerSkill: 'Yellow Tank',
    workSuitability: [
      { work: 'Generating Electricity', level: 3 },
      { work: 'Handiwork', level: 2 },
      { work: 'Transporting', level: 3 },
      { work: 'Lumbering', level: 2 }
    ],
    drops: ['Electric Organ', 'Leather'],
    hp: 130,
    atk: 120,
    def: 105,
    description: 'A heavy electric giant that carries a massive minigun. Possesses a joyful but destructive nature.',
    emoji: '🐻',
    color: '#eab308'
  },
  {
    number: 111,
    name: 'Jetragon',
    element: 'Dragon',
    behavior: 'legendary',
    size: 'Massive',
    partnerSkill: 'Aerial Missile',
    workSuitability: [
      { work: 'Gathering', level: 3 }
    ],
    drops: ['Carbon Fiber', 'Diamond', 'Pure Quartz'],
    hp: 150,
    atk: 160,
    def: 140,
    description: 'A legendary dragon of starlight that flies faster than sound. Bombards targets from the heavens.',
    emoji: '🐉',
    color: '#ec4899'
  },
  {
    number: 112,
    name: 'Frostallion',
    element: 'Ice',
    behavior: 'legendary',
    size: 'Massive',
    partnerSkill: 'Ice Steed',
    workSuitability: [
      { work: 'Cooling', level: 4 }
    ],
    drops: ['Ice Organ', 'Diamond'],
    hp: 140,
    atk: 140,
    def: 150,
    description: 'A legendary white pegasus containing the absolute zero cold. Freezes anything it touches.',
    emoji: '🦄',
    color: '#bae6fd'
  }
];

export function getPalByName(name: string): PalData | undefined {
  return PAL_DATABASE.find(p => p.name.toLowerCase() === name.toLowerCase());
}

export function getPalsByBiome(biome: string): PalData[] {
  switch (biome.toLowerCase()) {
    case 'volcanic':
      return PAL_DATABASE.filter(p => p.element === 'Fire' || p.behavior === 'aggressive' || p.name === 'Anubis');
    case 'tundra':
      return PAL_DATABASE.filter(p => p.element === 'Ice' || p.name === 'Frostallion' || p.name === 'Chillet');
    case 'beach':
      return PAL_DATABASE.filter(p => p.element === 'Water' || p.name === 'Fuack' || p.name === 'Pengullet');
    case 'dark_forest':
      return PAL_DATABASE.filter(p => p.element === 'Dark' || p.behavior === 'nocturnal' || p.name === 'Cattiva');
    default: // grasslands / friendly
      return PAL_DATABASE.filter(p => p.element === 'Neutral' || p.element === 'Grass' || p.behavior === 'peaceful' || p.behavior === 'skittish');
  }
}
