// Mainline spell profiles from area-active-batch-01, hero-targeted-batch-02 and hero-spells-batch-03.
const baseHeroSpells = {
  A236: { range: 800, autoRange: 800, mana: [50, 60, 70, 80, 90, 100], cooldown: [15, 14, 13, 12, 11, 10], damage: [300, 600, 900, 1200, 1500, 1800], cast: .4 },
  A237: { range: 800, autoRange: 800, mana: [100, 120, 140, 160, 180, 200], cooldown: [15, 14, 13, 12, 11, 10], damage: [1], cast: .4 },
  A238: { range: 800, autoRange: 800, mana: [50, 100, 150, 200, 250, 300], cooldown: [20, 18, 16, 14, 12, 10], damage: [100], cast: .4 },
  A233: { range: 750, autoRange: 800, mana: [25, 50, 75, 100, 125, 150], cooldown: [20, 18, 16, 14, 12, 10], damage: [0], cast: .5 },
  A234: { range: 900, autoRange: 800, mana: [100, 120, 140, 160, 180, 200], cooldown: [13], damage: [0], cast: .5 },
  A214: { range: 1200, autoRange: 1000, mana: [0], cooldown: [12], damage: [0], cast: .5 },
  A215: { range: 0, autoRange: 0, mana: [100, 120, 140, 160, 180, 200], cooldown: [10], damage: [0], cast: .5 },
  A178: { range: 0, autoRange: 500, mana: [20, 30, 40, 50, 60, 70], cooldown: [15, 14, 13, 12, 11, 10], damage: [0], cast: .01 },
  A179: { range: 0, autoRange: 0, mana: [50, 60, 70, 80, 90, 100], cooldown: [20], damage: [0], cast: .01 },
  A180: { range: 1200, autoRange: 900, mana: [20, 30, 40, 50, 70, 90], cooldown: [8, 7, 6, 5, 4, 3], damage: [0], cast: .01, recovery: .3 },
  A181: { range: 0, autoRange: 450, mana: [35, 40, 45, 50, 55, 60], cooldown: [2.5], damage: [0], cast: .4 },
  A182: { range: 0, autoRange: 0, mana: [20, 30, 40, 50, 60, 70], cooldown: [2], damage: [0], cast: .4 },
  A167: { range: 0, autoRange: 0, mana: [10, 20, 40, 60, 80, 100], cooldown: [30], damage: [0], cast: .4 },
  A169: { range: 0, autoRange: 0, mana: [20, 30, 40, 50, 60, 70], cooldown: [40, 37, 34, 31, 28, 25], damage: [0], cast: 0, recovery: 0 },
  A108: { range: 800, autoRange: 650, mana: [30, 60, 95, 140, 170, 210], cooldown: [15, 14, 13, 11, 10, 9], damage: [0], cast: .4 },
  A110: { range: 0, autoRange: 0, mana: [20, 30, 40, 50, 60, 70], cooldown: [40, 37, 34, 31, 28, 25], damage: [0], cast: 0, recovery: 0 },
  A073: { range: 800, autoRange: 700, mana: [100, 110, 120, 130, 140, 150], cooldown: [15, 14, 13, 12, 11, 10], damage: [0], cast: .53 },
  A074: { range: 800, autoRange: 800, mana: [100, 110, 120, 130, 140, 150], cooldown: [15, 14, 13, 12, 11, 10],
    damage: [600, 700, 800, 900, 1000, 1100], cast: .53 },
  A075: { range: 0, autoRange: 600, mana: [20, 50, 80, 110, 140, 170], cooldown: [0], damage: [0], cast: .53, recovery: 0 },
  A117: { range: 600, autoRange: 500, mana: [0], cooldown: [15], damage: [0], cast: .3 },
  A122: { range: 900, autoRange: 850, mana: [50, 60, 70, 80, 90, 100], cooldown: [9],
    damage: [1200, 1400, 1600, 1800, 2000, 2200], cast: .3, recovery: .2 },
  A173: { range: 600, autoRange: 500, mana: [50, 60, 70, 80, 90, 100], cooldown: [12], damage: [0], cast: .5 },
  A174: { range: 700, autoRange: 600, mana: [50, 70, 90, 120, 150, 180], cooldown: [15, 14, 13, 12, 11, 10], damage: [0], cast: .5 },
  A175: { range: 1000, autoRange: 800, mana: [50, 80, 110, 140, 170, 200], cooldown: [25], damage: [10], cast: .5, recovery: 1 },
  A008: { range: 600, autoRange: 600, mana: [30, 50, 70, 90, 110, 130], cooldown: [10],
    damage: [300, 600, 900, 1200, 1500, 1800], cast: .5, recovery: 0 },
  A010: { range: 0, autoRange: 0, mana: [30, 40, 50, 60, 70, 80], cooldown: [30], damage: [0], cast: 0, recovery: 0 },
  A001: { range: 0, autoRange: 700, mana: [20, 50, 80, 110, 140, 170], cooldown: [18, 16, 14, 12, 10, 8],
    damage: [10], cast: .67, recovery: .6 },
  A024: { range: 0, autoRange: 0, mana: [10, 20, 30, 40, 50, 60], cooldown: [15], damage: [0], cast: 0, recovery: 0 },
  A031: { range: 0, autoRange: 0, mana: [20, 40, 60, 90, 130, 180], cooldown: [8, 8, 7, 6, 5, 4],
    damage: [260, 480, 700, 920, 1040, 1260], cast: .5 },
  A155: { range: 900, autoRange: 800, mana: [60, 65, 70, 75, 80, 85], cooldown: [6, 5.5, 5, 4.5, 4, 3], damage: [0], cast: .5 },
  A156: { range: 800, autoRange: 700, mana: [50, 60, 70, 80, 90, 100], cooldown: [17, 15, 13, 11, 9, 7], damage: [0], cast: .5 },
  A157: { range: 800, autoRange: 700, mana: [200], cooldown: [20], damage: [0], cast: .5 },
  A161: { range: 900, autoRange: 850, mana: [0], cooldown: [12, 11, 10, 9, 8, 7], damage: [10], cast: .3, recovery: .51 },
  A162: { range: 1300, autoRange: 1000, mana: [30, 50, 70, 90, 110, 130], cooldown: [15, 14, 13, 12, 11, 10],
    damage: [1.5, 1.9, 2.3, 2.7, 3.1, 3.5], cast: .3, recovery: .51 },
  A163: { range: 0, autoRange: 0, mana: [40, 70, 100, 130, 160, 200], cooldown: [12], damage: [0], cast: .3, recovery: .51 },
  A223: { range: 1000, autoRange: 800, mana: [30, 40, 50, 60, 70, 80], cooldown: [9, 8, 7, 6, 5, 4],
    damage: [500, 1000, 1500, 2000, 2500, 3000], cast: 0, recovery: 0 },
  A224: { range: 1000, autoRange: 1000, mana: [15, 30, 45, 60, 75, 90], cooldown: [15, 14, 13, 12, 11, 10],
    damage: [300, 600, 900, 1200, 1500, 1800], cast: 0, recovery: 0 },
  A204: { range: 0, autoRange: 0, mana: [20, 30, 40, 50, 60, 70], cooldown: [10],
    damage: [1, 1.4, 1.8, 2.2, 2.6, 3], cast: 0 },
  A205: { range: 850, autoRange: 800, mana: [30, 40, 50, 60, 70, 80], cooldown: [12],
    damage: [15, 18, 21, 24, 27, 30], cast: 0, recovery: .5 },
  A206: { range: 0, autoRange: 0, mana: [40, 50, 60, 70, 80, 90], cooldown: [20],
    damage: [400, 500, 600, 700, 800, 900], cast: 0 },
  A189: { range: 800, autoRange: 700, mana: [90, 140, 190, 240, 290, 340],
    cooldown: [12], damage: [1500, 2000, 3750, 4500, 5250, 6000], cast: .3 },
  A190: { range: 9999, autoRange: 9999, mana: [0], cooldown: [14, 13, 12, 11, 10, 9],
    damage: [150, 200, 250, 300, 350, 400], cast: .3 },
  A191: { range: 900, autoRange: 700, mana: [100, 120, 140, 160, 180, 200],
    cooldown: [15, 14, 13, 12, 11, 10], damage: [3000, 5000, 7000, 9000, 11000, 13000], cast: .3 },
  A186: { range: 800, autoRange: 800, mana: [20, 30, 40, 50, 60, 70], cooldown: [11, 10, 9, 8, 7, 6],
    damage: [300, 700, 1100, 1500, 1900, 2500], cast: .4 },
  A187: { range: 9999, autoRange: 0, mana: [40, 45, 50, 55, 60, 65], cooldown: [9], damage: [0], cast: .4 },
  A188: { range: 0, autoRange: 500, mana: [75, 100, 125, 150, 175, 200], cooldown: [21, 20, 19, 18, 17, 16],
    damage: [300, 600, 900, 1200, 1500, 1800], cast: .4 },
  A192: { range: 1000, autoRange: 1000, mana: [20, 35, 50, 65, 80, 100], cooldown: [8],
    damage: [1000, 1800, 2600, 3400, 4200, 5000], cast: .3 },
  A194: { range: 0, autoRange: 0, mana: [20, 40, 60, 80, 100, 120], cooldown: [35], damage: [0], cast: .3 },
  A217: { range: 1000, autoRange: 1000, mana: [30, 60, 90, 120, 150, 180], cooldown: [12, 11, 10, 9, 8, 7],
    damage: [500, 1000, 1500, 2000, 2500, 3000], cast: .5 },
  A221: { range: 0, autoRange: 600, mana: [25, 30, 35, 40, 50, 60], cooldown: [9, 8, 7, 6, 5, 4], damage: [0], cast: .5 },
  A222: { range: 0, autoRange: 600, mana: [25, 50, 75, 100, 125, 150], cooldown: [20, 18, 16, 14, 12, 10],
    damage: [1000, 2000, 3000, 4000, 5000, 6000], cast: .5 },
  A195: { range: 0, autoRange: 0, mana: [25, 30, 35, 40, 45, 50], cooldown: [8], damage: [200, 300, 400, 500, 600, 700], cast: .01 },
  A196: { range: 0, autoRange: 0, mana: [30, 35, 40, 45, 50, 60], cooldown: [10, 9, 8, 7, 6, 5], damage: [0], cast: 0, recovery: 0 },
  A197: { range: 9999, autoRange: 800, mana: [30, 40, 50, 60, 70, 80], cooldown: [15], damage: [1000, 1200, 1400, 1600, 1800, 2000], cast: .01 },
  A198: { range: 1000, autoRange: 1000, mana: [0], cooldown: [15], damage: [0], cast: .5 },
  A199: { range: 1000, autoRange: 0, mana: [90, 120, 150, 180, 210, 240], cooldown: [10],
    damage: [300, 500, 900, 1200, 1500, 1800], cast: .5 },
  A200: { range: 750, autoRange: 700, mana: [75, 120, 165, 210, 255, 300], cooldown: [20, 19, 18, 17, 16, 15],
    damage: [0], cast: .5 },
  A201: { range: 800, autoRange: 750, mana: [50, 80, 110, 140, 170, 200], cooldown: [15, 14, 13, 12, 11, 10],
    damage: [600, 800, 1000, 1200, 1400, 1600], cast: .5 },
  A202: { range: 1000, autoRange: 0, mana: [70, 90, 110, 130, 150, 170], cooldown: [10],
    damage: [400, 600, 800, 1000, 1200, 1400], cast: .5 },
  A203: { range: 800, autoRange: 800, mana: [20, 50, 70, 90, 110, 130], cooldown: [18, 16, 14, 12, 10, 8],
    damage: [0], cast: .5 },
  A207: { range: 700, autoRange: 650, mana: [40, 60, 80, 100, 120, 140], cooldown: [8],
    damage: [200, 600, 1000, 1400, 1800, 2200], cast: .3 },
  A208: { range: 800, autoRange: 750, mana: [60, 90, 120, 150, 180, 210], cooldown: [12],
    damage: [.10, .12, .14, .16, .18, .20], cast: .3 },
  A209: { range: 0, autoRange: 0, mana: [50, 70, 90, 110, 130, 150], cooldown: [25, 24, 23, 22, 21, 20],
    damage: [0], cast: .3, recovery: 1.07 },
  A132: { range: 1000, autoRange: 800, mana: [30, 40, 60, 80, 100, 120], cooldown: [12, 11, 10, 9, 8, 7], damage: [0], cast: .5 },
  A133: { range: 9999, autoRange: 0, mana: [20, 30, 40, 50, 60, 70], cooldown: [14, 13, 12, 11, 10, 9], damage: [0], cast: .5 },
  A134: { range: 800, autoRange: 700, mana: [0], cooldown: [110, 100, 90, 80, 70, 55], damage: [0], cast: .5 },
  A080: { range: 1200, autoRange: 800, mana: [15, 30, 45, 60, 75, 90],
    cooldown: [16, 15, 14, 13, 12, 11], damage: [300, 600, 900, 1200, 1500, 1800], cast: .5 },
  A082: { range: 1000, autoRange: 800, mana: [40, 55, 70, 85, 100, 120],
    cooldown: [17, 16, 15, 14, 13, 12], damage: [1000, 2000, 3000, 4000, 5000, 6000], cast: .5, recovery: .5 },
  A085: { range: 800, autoRange: 700, mana: [100, 140, 180, 220, 260, 300],
    cooldown: [16], damage: [0], cast: .53 },
  A089: { range: 900, autoRange: 700, mana: [50, 60, 70, 80, 90, 100],
    cooldown: [12, 11, 10, 9, 8, 7], damage: [1000, 1200, 1400, 1600, 1800, 2000], cast: .3 },
  A091: { range: 1300, autoRange: 1300, mana: [10, 15, 20, 25, 30, 40],
    cooldown: [10, 9, 8, 7, 6, 5], damage: [0], cast: .3 },
  A101: { range: 800, autoRange: 700, mana: [30, 60, 90, 120, 150, 180],
    cooldown: [10, 9, 8, 7, 6, 5], damage: [600, 1000, 1400, 1800, 2200, 2600], cast: .3 },
  A102: { range: 800, autoRange: 750, mana: [20, 30, 40, 50, 60, 70],
    cooldown: [13, 12, 11, 10, 9, 8], damage: [0], cast: .3 },
  A103: { range: 800, autoRange: 700, mana: [0], cooldown: [12], damage: [100, 200, 300, 400, 500, 600], cast: .3 },
  A176: { range: 800, autoRange: 700, mana: [0], cooldown: [12], damage: [100, 200, 300, 400, 500, 600], cast: .3 },
  A064: { range: 800, autoRange: 750, mana: [20, 40, 60, 80, 100, 120],
    cooldown: [9, 8, 7, 6, 5, 4], damage: [300, 700, 1100, 1500, 1900, 2500], cast: .3 },
  A065: { range: 850, autoRange: 0, mana: [45, 60, 75, 90, 105, 130], cooldown: [10],
    damage: [100, 200, 300, 400, 500, 600], cast: .3 },
  A066: { range: 0, autoRange: 800, mana: [120, 150, 180, 210, 240, 270], cooldown: [20],
    damage: [0], cast: .3, recovery: .5 },
  A164: { range: 1200, autoRange: 1100, mana: [30, 35, 40, 45, 50, 55], cooldown: [40, 36, 32, 28, 24, 20], damage: [0] },
  A160: { range: 800, autoRange: 800, mana: [50, 60, 70, 80, 90, 100], cooldown: [20, 18, 16, 14, 12, 10], damage: [0], cast: .3 },
  A165: { range: 500, autoRange: 500, mana: [140, 160, 180, 200, 220, 240], cooldown: [16], damage: [0] },
  A166: { range: 800, autoRange: 700, mana: [170, 190, 210, 230, 250, 270], cooldown: [17, 16, 15, 14, 13, 12],
    damage: [2000, 2500, 3000, 3500, 4000, 5000] },
  T300: { range: 9999, autoRange: 0, mana: [0], cooldown: [22, 21, 20, 19], damage: [0] },
  T301: { range: 0, autoRange: 550, mana: [45, 60, 75, 90], cooldown: [7], damage: [300, 500, 800, 1300] },
  T302: { range: 600, autoRange: 700, mana: [200, 300, 400, 500], cooldown: [9], damage: [0] },
  T303: { range: 900, autoRange: 800, mana: [80, 100, 120, 140], cooldown: [12], damage: [0] },
  T310: { range: 0, autoRange: 0, mana: [50, 70, 90, 110], cooldown: [12, 11, 10, 9], damage: [300, 600, 900, 1200] },
  T311: { range: 1000, autoRange: 0, mana: [40, 70, 100, 130], cooldown: [12], damage: [0] },
  T312: { range: 2500, autoRange: 0, mana: [30, 40, 50, 60], cooldown: [25, 20, 15, 10], damage: [0] },
  T313: { range: 1000, autoRange: 700, mana: [30, 40, 50, 60], cooldown: [13, 12, 11, 10], damage: [0] },
  T314: { range: 750, autoRange: 650, mana: [10, 9, 8, 7], cooldown: [12, 10, 8, 3], damage: [0] },
  T315: { range: 750, autoRange: 600, mana: [10, 30, 50, 70], cooldown: [12, 11, 10, 9], damage: [0] },
  T317: { range: 1000, autoRange: 1000, mana: [0], cooldown: [30], damage: [0] },
  T318: { range: 1000, autoRange: 0, mana: [100, 120, 140, 160], cooldown: [10], damage: [300, 600, 900, 1200] },
  T319: { range: 1300, autoRange: 0, mana: [10, 15, 20, 25], cooldown: [10, 9, 8, 7], damage: [0] },
  T321: { range: 1000, autoRange: 0, mana: [50], cooldown: [10, 9, 8, 7], damage: [0] },
  T322: { range: 0, autoRange: 0, mana: [50], cooldown: [5], damage: [0] },
  T323: { range: 850, autoRange: 800, mana: [45, 60, 75, 90], cooldown: [10], damage: [100, 200, 300, 400] },
  T324: { range: 0, autoRange: 0, mana: [20, 40, 60, 90], cooldown: [8, 8, 7, 7], damage: [260, 480, 700, 920] },
  T326: { range: 0, autoRange: 0, mana: [20, 40, 60, 80], cooldown: [30], damage: [0] },
  T327: { range: 500, autoRange: 0, mana: [70, 80, 90, 100], cooldown: [8], damage: [500, 1500, 2500, 3500] },
  T328: { range: 1200, autoRange: 1200, mana: [120], cooldown: [12], damage: [1000, 2000, 3000, 4000] },
  T329: { range: 1200, autoRange: 0, mana: [30, 35, 40, 45, 50, 55], cooldown: [40, 36, 32, 28, 24, 20], damage: [0] },
  A016: { range: 0, autoRange: 900, mana: [50, 70, 90, 130, 180, 240], cooldown: [24, 22, 20, 18, 16, 14], damage: [122, 273, 332, 501, 686, 880] },
  A017: { range: 0, autoRange: 600, mana: [30, 50, 80, 130, 220, 320], cooldown: [10, 9, 8, 7, 5, 3], damage: [212, 356, 402, 654, 809, 985] },
  A231: { range: 600, autoRange: 600, mana: [20, 30, 40, 50, 60, 70], cooldown: [8], damage: [0], cast: 0, recovery: 0 },
  A232: { range: 800, autoRange: 800, mana: [25, 50, 75, 100, 125, 150], cooldown: [18, 17, 16, 15, 14, 13], damage: [0], cast: 0, recovery: 0 },
  A028: { range: 800, autoRange: 800, cast: .7, mana: [20, 30, 40, 50, 60, 70],
    cooldown: [12, 11, 10, 9, 8, 6], damage: [300, 500, 700, 900, 1100, 1400] },
  A029: { range: 800, autoRange: 700, cast: .7, mana: [30, 60, 90, 130, 180, 240],
    cooldown: [10, 9, 8, 7, 6, 4], damage: [500, 1000, 1500, 2000, 2500, 3000] },
  A125: { range: 0, autoRange: 0, mana: [50], cooldown: [30], damage: [0] },
  A126: { range: 0, autoRange: 0, mana: [10, 15, 20, 25, 30, 40], cooldown: [17, 16, 15, 14, 13, 12],
    damage: [0], cast: 0, recovery: 0 },
  A127: { range: 0, autoRange: 0, mana: [0], cooldown: [5], damage: [0] },
  A104: { range: 1000, autoRange: 900, mana: [20, 40, 70, 100, 140, 180], cooldown: [3.5, 3, 2.5, 2, 1.5, 1], damage: [200, 400, 600, 800, 1000, 1300], cast: .4 },
  A106: { range: 100000, autoRange: 900, mana: [100], cooldown: [15], damage: [1000], cast: .4 },
  A107: { range: 100000, autoRange: 800, mana: [70, 140, 210, 280, 350, 420], cooldown: [16], damage: [4000, 5500, 7000, 8500, 10000, 11500], cast: .4 },
  A111: { range: 800, autoRange: 0, mana: [0], cooldown: [10], damage: [0] },
  A113: { range: 999999, autoRange: 0, mana: [30, 40, 50, 60, 70, 80], cooldown: [30, 26, 22, 18, 14, 10], damage: [0] },
  A046: { range: 0, autoRange: 650, mana: [30, 60, 100, 150, 210, 300], cooldown: [4], damage: [0] },
  A049: { range: 0, autoRange: 0, mana: [50, 80, 110, 140, 180, 220], cooldown: [30], damage: [0] },
  A050: { range: 999999, autoRange: 0, mana: [10, 20, 30, 40, 50, 60], cooldown: [15, 13, 11, 9, 7, 5], damage: [0] },
  A051: { range: 2000, autoRange: 1800, mana: [35, 60, 85, 110, 145, 180], cooldown: [15],
    damage: [300, 600, 900, 1200, 1500, 1800] },
  A054: { range: 0, autoRange: 750, mana: [20, 35, 50, 65, 80, 100], cooldown: [15, 14, 13, 12, 11, 10],
    damage: [440, 560, 680, 800, 920, 1150], cast: .3 },
  A055: { range: 600, autoRange: 550, mana: [15, 30, 45, 60, 75, 90], cooldown: [7], damage: [200, 300, 400, 500, 600, 700] },
  A056: { range: 650, autoRange: 650, mana: [0, 0, 0, 0, 0, 0], cooldown: [5], damage: [0] },
  A057: { range: 600, autoRange: 550, mana: [10, 20, 30, 40, 50, 60], cooldown: [20, 18, 16, 14, 12, 10], damage: [0] },
  A061: { range: 800, autoRange: 750, mana: [20, 25, 30, 35, 40, 50], cooldown: [15, 14, 13, 12, 11, 10],
    damage: [500, 700, 900, 1100, 1300, 1500], cast: .3, recovery: 1 },
  A063: { range: 0, autoRange: 0, mana: [50, 60, 70, 80, 100, 120], cooldown: [18], damage: [0] },
  A076: { range: 800, autoRange: 800, mana: [30, 40, 50, 60, 70, 80], cooldown: [8], damage: [10] },
  A079: { range: 800, autoRange: 600, mana: [50, 60, 70, 80, 90, 100], cooldown: [20], damage: [0] },
  A058: { range: 800, autoRange: 750, mana: [50, 60, 70, 80, 90, 100], cooldown: [12, 11, 10, 9, 8, 7], damage: [1500, 1800, 2100, 2400, 2700, 3000] },
  A059: { range: 1000, autoRange: 0, mana: [50], cooldown: [10, 9, 8, 7, 6, 5], damage: [0] },
  A037: { range: 0, autoRange: 600, mana: [0], cooldown: [10, 9, 8, 7, 6, 5], damage: [0], cast: 0, recovery: 0 },
  A034: { range: 800, autoRange: 700, mana: [0], cooldown: [13], damage: [0] },
  A019: { range: 900, autoRange: 600, mana: [20, 40, 80, 120, 170, 200], cooldown: [3], damage: [500, 1000, 1500, 2000, 2500, 3000] },
  A020: { range: 1500, autoRange: 700, mana: [150, 200, 250, 300, 350, 450], cooldown: [18, 16, 14, 12, 10, 8], damage: [3000, 6000, 9000, 12000, 15000, 18000] },
  A043: { range: 0, autoRange: 500, mana: [0], cooldown: [10], damage: [0], cast: 0, recovery: 0 },
  A045: { range: 500, autoRange: 500, mana: [30, 50, 70, 90, 110, 130], cooldown: [12, 12, 11, 11, 10, 9],
    damage: [0], cast: .3, recovery: .3 },
  A042: { range: 1000, autoRange: 1000, mana: [0, 0, 0, 0, 0, 0], cooldown: [120], damage: [10_000_000] },
  A041: { range: 1200, autoRange: 1200, mana: [30, 40, 50, 60, 70, 80], cooldown: [12], damage: [0] },
  A170: { range: 800, autoRange: 900, mana: [10, 30, 50, 70, 90, 110], cooldown: [10], damage: [600, 900, 1200, 1500, 1800, 2200] },
  A172: { range: 1200, autoRange: 900, mana: [40, 80, 120, 160, 200, 240], cooldown: [12], damage: [500, 900, 1300, 1700, 2100, 2500] },
  A094: { range: 800, autoRange: 700, mana: [100, 115, 130, 145, 160, 175], cooldown: [18], damage: [0] },
  A093: { range: 600, autoRange: 550, mana: [20, 40, 60, 80, 100, 120], cooldown: [17, 16, 15, 14, 13, 12], damage: [100, 200, 300, 400, 500, 600] },
  A151: { range: 1000, autoRange: 850, mana: [20, 20, 40, 40, 60, 70], cooldown: [15], damage: [500, 1000, 1500, 2000, 2500, 3000] },
  A092: { range: 700, autoRange: 650, mana: [50, 70, 90, 110, 130, 150], cooldown: [7], damage: [530, 800, 1150, 1640, 2150, 2800] },
  A171: { range: 1500, autoRange: 900, mana: [30, 50, 70, 90, 110, 130], cooldown: [13, 12, 11, 10, 9, 8], damage: [1000, 1100, 1200, 1300, 1400, 1500] },
  A152: { range: 1000, autoRange: 1000, mana: [20, 35, 50, 65, 80, 95], cooldown: [14, 13, 12, 11, 10, 9], damage: [500, 1000, 1500, 2000, 2500, 3000] },
} as const;
export const heroSpells = { ...baseHeroSpells, A119: baseHeroSpells.A061, A128: baseHeroSpells.A061, A118: baseHeroSpells.A063,
  A130: baseHeroSpells.A049, A218: baseHeroSpells.A217, A239: baseHeroSpells.A010 };
export type HeroSpell = keyof typeof heroSpells;
export const heroAutoCastOrder: readonly HeroSpell[] = [
  "A236", "A237", "A238",
  "A233", "A234",
  "A214", "A215",
  "A217", "A221", "A222",
  "A224", "A223",
  "A178", "A179", "A180",
  "A181", "A182",
  "A167", "A169",
  "A110", "A108",
  "A073", "A074", "A075",
  "A117",
  "A010", "A239", "A008",
  "A001", "A016", "A017", "A133", "A132", "A134", "A160", "A161", "A163", "A162", "A157", "A156", "A155",
  "A186", "A188", "A187", "A191", "A189", "A190", "A192", "A194", "A195", "A196", "A197",
  "A201", "A203", "A204", "A205", "A206", "A207", "A208", "A209", "A202",
  "A170", "A172", "A173", "A175", "A174", "A019", "A020", "A024", "A028", "A029", "A031", "A034", "A037", "A054", "A055", "A056", "A057", "A058", "A061", "A119", "A128", "A063", "A118", "A066", "A064", "A042", "A041", "A043", "A045", "A046", "A049", "A130", "A051", "A094", "A092", "A093", "A106", "A126", "A171", "A107", "A104", "A151", "A152", "A076", "A079", "A080", "A082", "A085", "A089", "A102", "A101", "A103", "A176", "A122", "A164", "A165", "A166", "A198", "A199", "A200", "A231", "A232", "T300", "T302", "T303", "T310", "T326", "T327", "T328", "T311", "T313", "T314", "T315", "T301", "T317", "T318", "T322", "T323", "T324",
];
export type AccuracySkill = "A071" | "A184" | "A211";
export type WispOverload = "A112" | "A142" | "A143";
export type CastableHeroSkill = HeroSpell | AccuracySkill | WispOverload | "A068" | "A149";

export function isWispOverload(id: string): id is WispOverload {
  return id === "A112" || id === "A142" || id === "A143";
}

export function wispOverload(templateId: string): WispOverload {
  return templateId === "G057" ? "A142" : templateId === "G058" ? "A143" : "A112";
}

export function accuracySkill(templateId: string): AccuracySkill {
  return templateId === "G066" ? "A184" : templateId === "G073" ? "A211" : "A071";
}

export function isAccuracySkill(skillId: string): skillId is AccuracySkill {
  return skillId === "A071" || skillId === "A184" || skillId === "A211";
}

export function heroSpellTargetMode(skillId: CastableHeroSkill) {
  if (skillId === "A238") return "unit";
  if (skillId === "A215") return "self";
  if (skillId === "A178" || skillId === "A179") return "self";
  if (skillId === "A181" || skillId === "A182" || skillId === "A204" || skillId === "A206") return "self";
  if (skillId === "A173" || skillId === "A224") return "unit";
  if (skillId === "A122") return "unit";
  if (skillId === "A110" || skillId === "A167" || skillId === "A169") return "self";
  if (skillId === "A103" || skillId === "A176") return "unit";
  if (skillId === "A073") return "unit";
  if (skillId === "A075") return "self";
  if (skillId === "A117") return "unit";
  if (skillId === "A089" || skillId === "A091") return "unit";
  if (skillId === "A010" || skillId === "A239") return "self";
  if (skillId === "A160") return "unit";
  if (skillId === "A155" || skillId === "A156" || skillId === "A157") return "unit";
  if (skillId === "A161") return "unit";
  if (skillId === "A163") return "self";
  if (skillId === "A187" || skillId === "A190") return "ally";
  if (skillId === "A188") return "self";
  if (skillId === "A192") return "unit";
  if (skillId === "A194") return "self";
  if (skillId === "A217" || skillId === "A218") return "unit";
  if (skillId === "A221" || skillId === "A222") return "self";
  if (skillId === "A195" || skillId === "A196") return "self";
  if (skillId === "A207") return "unit";
  if (skillId === "A202") return "ally";
  if (skillId === "A209") return "self";
  if (skillId === "A133") return "ally";
  if (skillId === "A134") return "unit";
  if (skillId === "A066") return "self";
  if (skillId === "T301" || skillId === "T310" || skillId === "T311" || skillId === "T322" || skillId === "T324" || skillId === "T326" || skillId === "T327") return "self";
  if (skillId === "A001" || skillId === "A024" || skillId === "A031") return "self";
  if (skillId === "A046" || skillId === "A049" || skillId === "A130" || skillId === "A054" || skillId === "A063" || skillId === "A118" || skillId === "A043" || skillId === "A016" || skillId === "A017" || skillId === "A037" || skillId === "A125" || skillId === "A126" || skillId === "A127") return "self";
  if (skillId === "A111" || skillId === "A059" || skillId === "A199" || skillId === "T300" || skillId === "T318" || skillId === "T321") return "ally";
  if (isWispOverload(skillId) || isAccuracySkill(skillId) || skillId === "A041" || skillId === "A231" || skillId === "A232" || skillId === "A165" || skillId === "A107" || skillId === "A055" || skillId === "A056" || skillId === "A068" || skillId === "A149") return "self";
  if (skillId === "A051" || skillId === "A045" || skillId === "A020" || skillId === "A058" || skillId === "A034" || skillId === "A042" || skillId === "A057" || skillId === "A164" || skillId === "A166" || skillId === "A198" || skillId === "A200" || skillId === "T329" || skillId === "T302" || skillId === "T303" || skillId === "T314" || skillId === "T317" || skillId === "T328" || skillId === "T319" || skillId === "A104" || skillId === "A092" || skillId === "A093" || skillId === "A151") return "unit";
  return "point";
}

export function isCastableHeroSkill(skillId: string): skillId is CastableHeroSkill {
  return isWispOverload(skillId) || isAccuracySkill(skillId) || skillId === "A068" || skillId === "A149" || Object.hasOwn(heroSpells, skillId);
}

export type SpellSweep = {
  towerId: number;
  order?: number;
  sourceId?: number;
  startedUs?: number;
  name: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
  speed: number;
  range: number;
  radiusStart: number;
  radiusEnd: number;
  amount: number;
  traveled: number;
  hit: number[];
  slow?: number;
  lightCarrier?: "q001" | "q062" | "q064";
  aim?: { x: number; y: number };
  targets?: string[];
  budget?: number;
  tide?: { rank: number; excludeId?: number };
};
