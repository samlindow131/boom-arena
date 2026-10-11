// Boom Arena data shared by the game (in the browser) and the online server (in Node), so both always use the
// same numbers. Loaded with a <script> tag before the game, and with require() by the server.
(function (root) {
  'use strict';
  const DIFF = { easy: { acc: -.15, react: .45, dmg: .8 }, normal: { acc: 0, react: 0, dmg: 1 }, hard: { acc: .08, react: -.12, dmg: 1.15 }, veteran: { acc: .16, react: -.22, dmg: 1.3 } };
  const WEAPONS = [
    { id: 'ar', model: 'ar', name: 'KR-30', cls: 'Assault Rifle', slot: 0, dmg: 24, hs: 1.5, rate: .088, mag: 30, reload: 2.0, reloadEmpty: 2.6, spread: .022, adsSpread: .003, pen: 0.35, pellets: 1, auto: true,
      kick: .028, vkick: .011, hkick: .006, range: [32, 70], minDmg: .72, move: 1, adsTime: .2, snd: 'ar', bot: { dmg: 11, rate: .2, burst: [3, 6], acc: .52, pref: [10, 26] } },
    { id: 'smg', model: 'smg', name: 'VX-9', cls: 'SMG', slot: 0, dmg: 17, hs: 1.4, rate: .068, mag: 32, reload: 1.8, reloadEmpty: 2.2, spread: .02, adsSpread: .006, pen: 0.22, pellets: 1, auto: true,
      kick: .022, vkick: .008, hkick: .008, range: [14, 32], minDmg: .6, move: 1.08, adsTime: .15, snd: 'smg', bot: { dmg: 8, rate: .14, burst: [4, 8], acc: .5, pref: [5, 14] } },
    { id: 'shotgun', model: 'shotgun', name: 'Breacher 12', cls: 'Shotgun', slot: 0, dmg: 14, hs: 1.3, rate: .95, mag: 6, reload: .48, shellReload: true, spread: .1, adsSpread: .075, pen: 0.15, pellets: 9, auto: false, pump: .55,
      kick: .12, vkick: .055, hkick: .01, range: [7, 22], minDmg: .25, move: 1, adsTime: .22, snd: 'shotgun', bot: { dmg: 38, rate: 1.05, burst: [1, 1], acc: .62, pref: [2, 7], maxRange: 16 } },
    { id: 'sniper', model: 'sniper', name: 'Longbow .338', cls: 'Sniper Rifle', slot: 0, dmg: 110, hs: 2, rate: 1.15, mag: 5, reload: 2.9, reloadEmpty: 3.4, spread: .09, adsSpread: 0, pen: 0.7, pellets: 1, auto: false, bolt: .95,
      kick: .15, vkick: .07, hkick: .01, range: [200, 300], minDmg: 1, move: .88, adsTime: .3, snd: 'sniper', bot: { dmg: 65, rate: 2.4, burst: [1, 1], acc: .55, pref: [18, 45], longAcc: true, aim: .7 } },
    { id: 'lmg', model: 'lmg', name: 'Juggernaut', cls: 'LMG', slot: 0, dmg: 26, hs: 1.4, rate: .1, mag: 100, reload: 5.2, reloadEmpty: 5.8, spread: .034, adsSpread: .005, pen: 0.55, pellets: 1, auto: true,
      kick: .034, vkick: .013, hkick: .009, range: [38, 75], minDmg: .75, move: .85, adsTime: .32, snd: 'lmg', bot: { dmg: 12, rate: .2, burst: [6, 12], acc: .45, pref: [10, 30] } },
    { id: 'pistol', model: 'pistol', name: 'P-9', cls: 'Pistol', slot: 1, dmg: 30, hs: 1.8, rate: .14, mag: 12, reload: 1.25, reloadEmpty: 1.55, spread: .008, adsSpread: .002, pen: 0.2, pellets: 1, auto: false,
      kick: .05, vkick: .018, hkick: .006, range: [14, 30], minDmg: .6, move: 1.1, adsTime: .12, snd: 'pistol', bot: { dmg: 12, rate: .3, burst: [1, 3], acc: .5, pref: [5, 16] } },
    { id: 'magnum', model: 'magnum', name: 'Magnum .44', cls: 'Revolver', slot: 1, dmg: 62, hs: 1.8, rate: .42, mag: 6, reload: 2.4, spread: .012, adsSpread: .002, pen: 0.35, pellets: 1, auto: false,
      kick: .12, vkick: .05, hkick: .012, range: [18, 40], minDmg: .65, move: 1.1, adsTime: .16, snd: 'magnum', bot: { dmg: 27, rate: .62, burst: [1, 2], acc: .52, pref: [7, 22] } },
    // new guns go on the end: online messages refer to guns by their place in this list
    { id: 'dmr', model: 'dmr', name: 'Ranger DMR', cls: 'Marksman Rifle', slot: 0, dmg: 46, hs: 2, rate: .19, mag: 15, reload: 2.3, reloadEmpty: 2.9, spread: .035, adsSpread: .0015, pen: 0.6, pellets: 1, auto: false,
      kick: .065, vkick: .03, hkick: .008, range: [45, 90], minDmg: .8, move: .93, adsTime: .26, snd: 'dmr', bot: { dmg: 22, rate: .5, burst: [1, 3], acc: .55, pref: [14, 34], longAcc: true, aim: .25 } },
  ];
  const EQUIP = {
    frag: { name: 'Frag', count: 2, slot: 'lethal', note: 'Hold to cook, release to throw. Bounces, then explodes.' },
    claymore: { name: 'Claymore', count: 2, slot: 'lethal', note: 'Tripwire mine. Blasts enemies who walk in front of it.' },
    flash: { name: 'Flashbang', count: 2, slot: 'tactical', note: 'Blinds and deafens anyone looking at it.' },
    smoke: { name: 'Smoke', count: 1, slot: 'tactical', note: 'A thick cloud enemies cannot see through.' },
  };
  const ATT_SLOTS = {
    pistol: { optic: ['iron', 'reflex'], muzzle: ['none', 'comp', 'supp'], under: ['none', 'laser'], mag: ['std', 'ext'] },
    magnum: { optic: ['iron', 'reflex'], under: ['none', 'laser'] },
    smg: { optic: ['builtin', 'acog'], muzzle: ['none', 'comp', 'supp'], under: ['none', 'grip', 'laser'], mag: ['std', 'ext'] },
    ar: { optic: ['builtin', 'acog'], muzzle: ['none', 'comp', 'supp'], under: ['none', 'grip', 'laser'], mag: ['std', 'ext'] },
    lmg: { optic: ['builtin', 'acog'], muzzle: ['none', 'comp', 'supp'], under: ['none', 'grip', 'laser'], mag: ['std', 'ext'] },
    shotgun: { optic: ['iron', 'reflex'], muzzle: ['none', 'supp'], under: ['none', 'laser'], mag: ['std', 'ext'] },
    sniper: { muzzle: ['none', 'supp'], under: ['none', 'laser'], mag: ['std', 'ext'] },
    dmr: { optic: ['builtin', 'acog'], muzzle: ['none', 'comp', 'supp'], under: ['none', 'grip', 'laser'], mag: ['std', 'ext'] },
  };
  const ATT_INFO = {
    iron: { name: 'Iron sights' }, builtin: { name: 'Stock sight' }, none: { name: 'None' }, std: { name: 'Standard' },
    reflex: { name: 'Reflex sight', unlock: 2, note: 'Red-dot sight for a cleaner sight picture' },
    acog: { name: '3× scope', unlock: 15, note: '3× magnified optic · slightly slower to aim', fx: { adsTime: 1.15 } },
    comp: { name: 'Compensator', unlock: 4, note: '−20% vertical, −10% horizontal recoil', fx: { vkick: .8, hkick: .9 } },
    supp: { name: 'Suppressor', unlock: 8, note: 'Quiet shots, bots only hear you up close · −10% range', fx: { range: .9 } },
    grip: { name: 'Vertical grip', unlock: 6, note: '−15% vertical, −25% horizontal recoil · slightly slower to aim', fx: { vkick: .85, hkick: .75, adsTime: 1.05 } },
    laser: { name: 'Tactical laser', unlock: 10, note: '−30% hip-fire spread · faster to aim', fx: { spread: .7, adsTime: .95 } },
    ext: { name: 'Extended mag', unlock: 12, note: '+50% ammo · slower reload', fx: { mag: 1.5, reload: 1.12, reloadEmpty: 1.12 } },
  };
  const BOTS = [['Rex',0xff4b3a],['Nova',0xb46cff],['Bolt',0xffd23a],['Viper',0x3aff7c],['Kiwi',0x2ee6d6],['Tank',0x5a8cff],['Ziggy',0xff8a2b]];
  const GREN = { fuse: 3.3, pin: .22, radius: 8, lethal: 3, maxDmg: 150 }, NADE_G = 20, NR = .045;
  const PLATE_TIME = 1.05;
  const WZ = { phases: [[40, 22, .7], [32, 20, .45], [26, 18, .25], [20, 15, .1], [12, 18, 0]], dmg: [5, 9, 14, 22, 34] };
  // kills in a row needed for each killstreak
  const STREAK_N = { uav: 3, cuav: 4, air: 5 };
  // bullet penetration: a gun's \`pen\` is the thickest wood or metal it can shoot through (house walls, fences,
  // crate sides); what comes out the other side keeps this share of its damage (less the thicker the cover)
  const PEN_SURF = { wood: .72, metal: .5 };
  // bump NET_VERSION whenever the game and server have to change together: anyone with an older copy of
  // the game open is asked to refresh instead of joining with mismatched rules
  const NET_VERSION = 4;
  // a fingerprint of a map's walls ([minX, minY, minZ, maxX, maxY, maxZ] per box), so the server can tell
  // when its copy (maps.json) no longer matches the game's maps
  function mapHash(list) { let h = 2166136261; for (const b of list) for (let i = 0; i < 6; i++) h = Math.imul(h ^ Math.round(b[i]*100), 16777619); return (h >>> 0).toString(36); }
  const SHARED = { DIFF, WEAPONS, EQUIP, ATT_SLOTS, ATT_INFO, BOTS, GREN, NADE_G, NR, PLATE_TIME, WZ, STREAK_N, PEN_SURF, NET_VERSION, mapHash };
  if (typeof module === 'object' && module.exports) module.exports = SHARED;
  else Object.assign(root, SHARED);
})(typeof globalThis !== 'undefined' ? globalThis : this);
