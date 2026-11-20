// Career win–loss at each event, tour-level main draw, on the surface the game plays it on. Source: Jeff Sackmann /
// Tennis Abstract, tennis_atp atp_matches_YYYY.csv, CC BY-NC-SA 4.0. His repository is no longer public (November 2026):
// 1968-2024 from a full copy of it (github.com/ivanposinovec/ATP), 2025-26 from a later copy kept up to date in the same
// match layout (github.com/LuckyLoser91/TennisCourtLog, through mid-November 2026). Rebuilt with tools/event_wl.py, which
// reproduces the earlier table exactly for the eight players whose careers lie inside the old dataset (Borg's Barcelona
// differs by one match); Alcaraz, Sinner and Djokovic gained their 2025-26 results.
// [wins, losses]. Walkovers are not counted; retirements and defaults are. Davis Cup, Olympics and team events are
// not counted. The data starts in 1968, so Laver's records are Open era only.
// Which editions count, event by event (judgement calls):
//   ao   hard-court Australian Opens only, 1988 on (grass until 1987).
//   us   hard-court US Opens only, 1978 on (grass until 1974, clay 1975-77).
//   can, cin  hard-court editions only, 1979 on (clay before).
//   was  hard-court editions only, 1987 on (clay until 1986).
//   aca  hard-court editions only, 2014 on (clay 2001-13).
//   mad  clay Masters only, 2009 on (the indoor hard 2002-08 editions are not counted).
//   rio  the Rio Open, clay, 2014 on.
//   iw   includes the event's earlier desert homes (Tucson 1974-75, Palm Springs 1976-78, Rancho Mirage 1979-80,
//        La Quinta 1981-86): Connors 30-4, Lendl 12-3, Laver 10-4, Borg 5-3 of their totals come from those.
//   mia  includes Key Biscayne and the first two editions (Delray Beach 1985, Boca West 1986): Lendl 10-1, Connors 5-1.
//   ham  the German Open at Rothenbaum in both its Masters (1990-2008) and 500 years.
//   que  Queen's Club from 1968 (listed as "London" that year).
//   tok  the Japan Open on hard (1983 on); the separate indoor carpet Tokyo event is not counted. The 2018-19 Japan
//        Opens were played indoors, still on hard, and are counted (Djokovic's 5-0 is 2019).
//   bei  China Open, 2004 on.   sha  Shanghai Masters, 2009 on.
//   rot, bas, vie, par  indoor throughout; their indoor carpet editions count as the same court, as for Paris
//        (Bercy era 1986 on, carpet until 2006, and the 2025 La Défense edition).
//   fin  every indoor season-ending championship (Masters, Masters Cup, Tour Finals, both 1986 editions). Not counted:
//        Kooyong 1974 (outdoor grass) and Houston 2003-04 (outdoor hard), which leaves out Federer 10-0, Agassi 3-2,
//        Borg 1-2.
//   dal  the Dallas Open (indoor hard, 2022 on); none of the players here has played it, so there are no entries. The WCT
//        Finals held in Dallas (1971-89) were a different event and are not counted.
export const EVENT_WL = {
  Alcaraz: { ao: [18, 4], rot: [5, 0], doh: [7, 1], rio: [9, 2], aca: [0, 1], iw: [24, 4], mia: [14, 5], mc: [9, 2], bar: [15, 2], mad: [15, 2], rom: [7, 1], ham: [4, 1], rg: [25, 3], que: [11, 1], wim: [24, 3], can: [2, 2], cin: [12, 4], us: [28, 4], tok: [10, 0], bei: [8, 1], sha: [6, 3], bas: [3, 1], vie: [8, 1], par: [9, 5], fin: [7, 5] },
  Sinner: { ao: [27, 5], rot: [10, 2], doh: [2, 1], dub: [4, 2], iw: [17, 3], mia: [25, 3], mc: [15, 4], bar: [5, 1], mad: [12, 2], rom: [20, 6], rg: [23, 7], hal: [8, 2], que: [0, 1], wim: [27, 4], was: [5, 0], can: [7, 3], cin: [12, 4], us: [23, 6], bei: [14, 1], sha: [9, 2], vie: [17, 4], par: [6, 2], fin: [15, 2] },
  Djokovic: { ao: [104, 11], rot: [7, 3], doh: [15, 3], dub: [46, 8], aca: [2, 1], iw: [53, 12], mia: [49, 8], mc: [39, 16], bar: [0, 2], mad: [24, 7], rom: [68, 13], ham: [6, 3], rg: [103, 18], hal: [4, 1], que: [10, 4], wim: [107, 14], can: [37, 7], cin: [45, 13], us: [95, 16], tok: [5, 0], bei: [34, 0], sha: [43, 8], bas: [13, 3], vie: [8, 2], par: [51, 10], fin: [50, 18] },
  Nadal: { ao: [77, 16], rot: [5, 2], doh: [23, 7], rio: [10, 2], dub: [10, 3], aca: [15, 2], iw: [59, 11], mia: [40, 12], mc: [73, 6], bar: [67, 5], mad: [46, 10], rom: [70, 9], ham: [16, 2], rg: [112, 4], hal: [1, 3], que: [13, 5], wim: [58, 12], was: [1, 1], can: [38, 8], cin: [22, 12], us: [67, 12], tok: [9, 1], bei: [25, 5], sha: [16, 8], bas: [6, 4], par: [22, 7], fin: [21, 18] },
  Federer: { ao: [102, 15], rot: [28, 6], doh: [27, 4], dub: [53, 6], iw: [66, 13], mia: [56, 14], mc: [30, 13], bar: [0, 1], mun: [5, 0], mad: [20, 5], rom: [34, 16], ham: [32, 5], rg: [73, 17], hal: [69, 8], que: [0, 1], wim: [105, 14], was: [0, 1], can: [35, 10], cin: [47, 10], us: [89, 14], tok: [5, 0], sha: [23, 6], bas: [75, 9], vie: [18, 3], par: [23, 11], fin: [49, 17] },
  Sampras: { ao: [45, 9], rot: [2, 0], doh: [0, 1], iw: [31, 12], mia: [42, 10], mc: [1, 4], bar: [0, 1], mun: [0, 1], rom: [18, 10], ham: [5, 5], rg: [24, 13], hal: [1, 1], que: [28, 10], wim: [63, 7], can: [15, 7], cin: [38, 11], us: [71, 9], tok: [15, 0], bas: [5, 1], vie: [5, 0], par: [24, 7], fin: [35, 14] },
  Agassi: { ao: [48, 5], dub: [4, 2], iw: [37, 16], mia: [61, 13], mc: [2, 4], bar: [4, 3], mun: [4, 1], rom: [24, 10], ham: [5, 5], rg: [51, 16], hal: [0, 1], que: [4, 4], wim: [46, 13], was: [44, 12], can: [38, 11], cin: [31, 10], us: [79, 19], tok: [7, 3], bas: [9, 3], vie: [5, 0], par: [14, 4], fin: [19, 18] },
  Lendl: { ao: [32, 5], rot: [12, 3], dub: [2, 1], iw: [12, 3], mia: [24, 4], mc: [18, 6], bar: [28, 6], mun: [8, 1], rom: [24, 6], ham: [17, 6], rg: [53, 12], que: [15, 5], wim: [48, 14], was: [8, 3], can: [57, 9], cin: [17, 6], us: [73, 13], tok: [14, 5], bas: [15, 3], vie: [9, 2], par: [1, 2], fin: [39, 10] },
  Borg: { rot: [10, 1], iw: [5, 3], mc: [24, 8], bar: [20, 2], mun: [0, 1], rom: [15, 1], ham: [2, 1], rg: [49, 2], wim: [51, 4], was: [0, 1], can: [11, 1], us: [22, 4], bas: [11, 2], fin: [15, 4] },
  McEnroe: { ao: [11, 3], rot: [11, 4], iw: [2, 2], mia: [2, 1], mc: [2, 1], mun: [0, 1], rom: [4, 1], ham: [1, 1], rg: [25, 10], que: [42, 4], wim: [59, 11], was: [2, 3], can: [39, 12], cin: [16, 5], us: [62, 11], tok: [10, 2], bas: [13, 2], vie: [2, 1], par: [9, 6], fin: [19, 11] },
  Connors: { rot: [20, 2], iw: [34, 6], mia: [21, 7], mc: [5, 2], mun: [0, 1], rom: [3, 3], ham: [10, 3], rg: [40, 13], hal: [2, 1], que: [37, 6], wim: [84, 18], was: [8, 1], can: [19, 7], cin: [29, 7], us: [67, 11], tok: [5, 3], bas: [9, 4], vie: [0, 1], par: [1, 1], fin: [18, 17] },
  Laver: { rot: [2, 1], iw: [10, 4], bar: [8, 3], rom: [5, 0], rg: [13, 1], que: [15, 4], wim: [22, 3], fin: [4, 1] },
  Murray: { ao: [51, 16], rot: [11, 6], doh: [25, 6], dub: [18, 6], aca: [3, 1], iw: [31, 16], mia: [31, 12], mc: [15, 10], bar: [5, 5], mun: [4, 0], mad: [20, 8], rom: [14, 11], ham: [3, 3], rg: [39, 12], que: [32, 10], wim: [61, 13], was: [8, 4], can: [28, 7], cin: [35, 15], us: [49, 16], tok: [8, 2], bei: [12, 4], sha: [23, 5], bas: [4, 3], vie: [9, 1], par: [21, 12], fin: [16, 11] },
  Wawrinka: { ao: [45, 19], rot: [13, 7], doh: [8, 7], rio: [0, 1], dub: [6, 4], aca: [4, 2], iw: [27, 13], mia: [9, 10], mc: [22, 15], bar: [12, 7], mun: [0, 1], mad: [16, 11], rom: [25, 17], ham: [1, 4], rg: [46, 20], hal: [0, 2], que: [7, 8], wim: [23, 19], was: [0, 2], can: [16, 13], cin: [19, 14], us: [46, 17], tok: [10, 4], bei: [1, 2], sha: [13, 12], bas: [17, 18], vie: [6, 5], par: [17, 16], fin: [7, 8] },
  Zverev: { ao: [36, 11], rot: [4, 6], doh: [0, 1], rio: [2, 1], dub: [3, 2], aca: [15, 6], iw: [17, 10], mia: [23, 11], mc: [17, 10], bar: [3, 3], mun: [23, 9], mad: [30, 7], rom: [29, 8], ham: [17, 7], rg: [45, 10], hal: [24, 10], wim: [22, 10], was: [16, 2], can: [16, 7], cin: [18, 10], us: [35, 10], tok: [0, 1], bei: [16, 7], sha: [17, 8], bas: [3, 3], vie: [17, 5], par: [20, 8], fin: [19, 12] },
  Thiem: { ao: [19, 10], rot: [4, 3], doh: [4, 3], rio: [10, 4], dub: [0, 2], aca: [9, 2], iw: [13, 6], mia: [7, 6], mc: [7, 7], bar: [13, 4], mun: [7, 4], mad: [17, 7], rom: [9, 7], ham: [6, 3], rg: [28, 10], hal: [4, 5], que: [0, 1], wim: [5, 7], was: [1, 1], can: [2, 6], cin: [3, 5], us: [23, 9], tok: [0, 2], bei: [5, 2], sha: [4, 5], bas: [1, 2], vie: [16, 12], par: [8, 7], fin: [9, 10] },
  Medvedev: { ao: [31, 10], rot: [11, 6], doh: [7, 2], dub: [15, 4], aca: [3, 1], iw: [25, 9], mia: [19, 7], mc: [10, 7], bar: [4, 1], mad: [10, 7], rom: [13, 6], ham: [1, 2], rg: [10, 10], hal: [13, 6], que: [6, 3], wim: [20, 8], was: [10, 4], can: [14, 8], cin: [16, 9], us: [36, 9], tok: [5, 1], bei: [13, 4], sha: [18, 6], bas: [3, 1], vie: [15, 4], par: [12, 8], fin: [12, 11] },
  Tsitsipas: { ao: [25, 9], rot: [12, 8], doh: [4, 3], dub: [15, 4], aca: [9, 3], iw: [9, 8], mia: [11, 8], mc: [22, 5], bar: [22, 7], mun: [0, 1], mad: [15, 8], rom: [17, 9], ham: [5, 2], rg: [28, 10], hal: [5, 5], que: [2, 1], wim: [10, 9], was: [6, 3], can: [9, 8], cin: [14, 9], us: [10, 9], tok: [3, 4], bei: [4, 2], sha: [12, 6], bas: [7, 3], vie: [6, 4], par: [11, 7], fin: [6, 8] },
  'del Potro': { ao: [19, 9], rot: [11, 2], dub: [6, 3], aca: [6, 1], iw: [24, 7], mia: [19, 10], mc: [1, 2], mun: [4, 2], mad: [11, 5], rom: [11, 7], rg: [22, 9], que: [6, 4], wim: [21, 9], was: [15, 2], can: [7, 6], cin: [13, 6], us: [35, 9], tok: [11, 5], bei: [4, 2], sha: [8, 5], bas: [22, 5], vie: [8, 1], par: [9, 6], fin: [7, 8] },
  Roddick: { ao: [38, 11], doh: [5, 2], dub: [5, 0], iw: [28, 10], mia: [33, 11], mc: [2, 2], mad: [1, 2], rom: [14, 8], ham: [3, 3], rg: [9, 10], que: [32, 7], wim: [41, 12], was: [30, 6], can: [25, 7], cin: [29, 10], us: [43, 12], tok: [5, 2], bei: [4, 2], sha: [4, 3], bas: [12, 5], vie: [3, 1], par: [14, 8], fin: [3, 8] },
  Kyrgios: { ao: [17, 10], dub: [3, 1], aca: [8, 2], iw: [7, 5], mia: [16, 6], bar: [0, 1], mad: [7, 4], rom: [3, 3], rg: [5, 5], hal: [3, 1], que: [4, 5], wim: [20, 8], was: [12, 2], can: [8, 8], cin: [10, 6], us: [12, 9], tok: [9, 2], bei: [4, 1], sha: [2, 4] },
  Monfils: { ao: [37, 20], rot: [22, 8], doh: [26, 8], rio: [2, 1], dub: [8, 6], aca: [1, 1], iw: [23, 16], mia: [18, 13], mc: [16, 13], bar: [3, 3], mun: [1, 4], mad: [13, 11], rom: [5, 9], ham: [4, 6], rg: [40, 18], hal: [8, 7], que: [5, 5], wim: [20, 14], was: [14, 5], can: [25, 14], cin: [16, 13], us: [34, 18], tok: [10, 4], bei: [0, 3], sha: [11, 7], vie: [17, 9], par: [16, 10], fin: [0, 2] },
  Becker: { ao: [23, 6], rot: [7, 2], doh: [6, 1], dub: [3, 1], iw: [19, 5], mia: [9, 7], mc: [21, 12], bar: [1, 3], mun: [4, 4], rom: [15, 6], ham: [16, 12], rg: [26, 9], hal: [3, 2], que: [36, 7], wim: [71, 12], was: [3, 1], can: [9, 2], cin: [19, 5], us: [37, 10], tok: [4, 2], bas: [9, 3], vie: [6, 1], par: [29, 7], fin: [36, 13] },
  Edberg: { ao: [41, 8], rot: [16, 4], doh: [13, 2], dub: [0, 1], iw: [22, 8], mia: [32, 10], mc: [12, 8], mun: [7, 4], rom: [7, 3], ham: [8, 4], rg: [30, 13], que: [33, 11], wim: [49, 12], was: [9, 1], can: [11, 5], cin: [45, 11], us: [43, 12], tok: [27, 2], bas: [31, 7], vie: [5, 2], par: [18, 6], fin: [18, 14] },
  Ivanisevic: { ao: [19, 11], rot: [12, 9], doh: [13, 7], dub: [8, 5], iw: [9, 13], mia: [19, 13], mc: [8, 11], bar: [3, 5], mun: [4, 6], rom: [20, 12], ham: [12, 9], rg: [21, 12], que: [15, 12], wim: [49, 14], can: [4, 6], cin: [9, 7], us: [21, 13], bas: [9, 5], vie: [16, 5], par: [12, 8], fin: [8, 10] },
  Wilander: { ao: [19, 5], rot: [3, 4], iw: [7, 6], mia: [26, 7], mc: [26, 6], bar: [27, 3], rom: [23, 8], ham: [13, 5], rg: [47, 9], que: [3, 3], wim: [25, 10], was: [2, 1], can: [6, 3], cin: [36, 7], us: [36, 11], bas: [4, 2], par: [0, 2], fin: [9, 10] },
  Kuerten: { ao: [7, 8], dub: [2, 1], iw: [14, 8], mia: [11, 9], mc: [14, 7], bar: [3, 4], mun: [1, 2], rom: [20, 6], ham: [16, 7], rg: [36, 8], wim: [7, 5], can: [9, 7], cin: [16, 6], us: [15, 9], tok: [2, 1], bas: [0, 1], vie: [1, 2], par: [6, 6], fin: [5, 6] },
  Hewitt: { ao: [32, 20], rot: [5, 1], iw: [30, 13], mia: [17, 13], mc: [2, 3], bar: [4, 2], mun: [2, 2], mad: [0, 1], rom: [9, 6], ham: [18, 6], rg: [28, 14], hal: [7, 1], que: [41, 12], wim: [41, 16], was: [11, 7], can: [8, 10], cin: [28, 11], us: [47, 14], tok: [15, 4], bei: [1, 1], sha: [1, 3], bas: [3, 1], vie: [0, 1], par: [8, 4], fin: [10, 3] },
};
