// The "character file" shape. Players will later upload one of these
// (or read it from the Startng character API) to bring a character into the game.
export interface CharacterSpec {
  name: string;
  attacks: {
    light: string;
    heavy: string;
    special: string;
  };
  colors: {
    cloak: number;
    cape: number;
    eyes: number;
    metal: number;
    blade: number;
    leather: number;
  };
}

export const HOODED_SWORDSMAN: CharacterSpec = {
  name: 'The Hooded Swordsman',
  attacks: {
    light: 'Greatsword slash',
    heavy: 'Repeating crossbow: three bolts in quick succession',
    special: 'Arm cannon: the crossbow opens and fires',
  },
  colors: {
    cloak: 0x17181c,
    cape: 0x111215,
    eyes: 0xff2414,
    metal: 0x34373d,
    blade: 0x2a2d32,
    leather: 0x2a1d13,
  },
};
