// Each player's own face: a photograph of him painted onto the library head he wears (tools/face_bake.py;
// sources and licences in assets/people/faces/SOURCES.md). `head` is the avatar whose head mesh the texture
// is laid out for, `map` the texture under assets/people, `skin` the painted face's own skin colour (sRGB) for
// tinting against, and `face` how his proportions differ from that head's, in Person.fitFace's measures.
// A player not listed keeps his type-matched head: no photograph of him passed inspection.
export const FACES = {
  Alcaraz: { head: 'heads/Male_Adult_10', map: 'faces/Alcaraz.jpg', skin: '#dd9d67', face: {faceW: -0.21, jawW: 0.26, faceL: 0.45, chinL: -0.06, noseL: 0.16, noseW: 0.45}, src: "Like tears in rain, CC BY-SA 4.0 (Wikimedia Commons)" },
  Sinner: { head: 'heads/Male_Adult_16', map: 'faces/local/Sinner.jpg', skin: '#d9a486', face: {faceW: -0.3, jawW: 0.05, faceL: 0.02, chinL: -0.22, noseL: 0.45, noseW: 0.05}, src: "supplied by the user; source and licence unknown", local: true },
  Djokovic: { head: 'heads/Sports_Male_02', map: 'faces/Djokovic.jpg', skin: '#df9a7e', face: {faceW: 0.3, jawW: 0.3, faceL: 0.45, chinL: 0.36, noseL: 0.45, noseW: 0.45}, src: "Andymiah, CC BY-SA 4.0 (Wikimedia Commons)" },
  Nadal: { head: 'heads/Male_Adult_02', map: 'faces/Nadal.jpg', skin: '#d29e7f', face: {faceW: -0.06, jawW: -0.23, faceL: -0.08, chinL: -0.39, noseL: -0.14, noseW: 0.18}, src: "Christopher Johnson from Tokyo, Japan, CC BY-SA 2.0 (Wikimedia Commons)" },
  Federer: { head: 'heads/Business_Male_01', map: 'faces/Federer.jpg', skin: '#d1967a', face: {faceW: 0.3, jawW: -0.23, faceL: 0.34, chinL: 0.16, noseL: 0.06, noseW: 0.23}, src: "Esther Lim, CC BY-SA 2.0 (Wikimedia Commons)" },
  Sampras: { head: 'heads/Business_Male_02', map: 'faces/Sampras.jpg', skin: '#dca681', face: {faceW: 0.23, jawW: -0.2, faceL: 0.37, chinL: 0.29, noseL: 0.08, noseW: 0.2}, src: "Craig ONeal, CC BY-SA 2.0 (Wikimedia Commons)" },
  Agassi: { head: 'heads/Sports_Male_04', map: 'faces/Agassi.jpg', skin: '#d5997c', face: {faceW: -0.17, jawW: 0.24, faceL: -0.2, chinL: -0.2, noseL: 0.1, noseW: 0.45}, src: "Kingkongphoto & www.celebrity-photos.com from Laurel Marylan, CC BY-SA 2.0 (Wikimedia Commons)" },
  Lendl: { head: 'heads/Business_Male_01', map: 'faces/Lendl.jpg', skin: '#d1967c', face: {faceW: 0.09, jawW: -0.02, faceL: 0.31, chinL: -0.29, noseL: 0.34, noseW: 0.17}, src: "Charlie Cowins, CC BY 2.0 (Wikimedia Commons)" },
  Borg: { head: 'heads/Male_Adult_06', map: 'faces/Borg.jpg', skin: '#d49d7f', face: {faceW: 0.3, jawW: -0.2, faceL: 0.37, chinL: 0.07, noseL: 0.04, noseW: 0.22}, src: "Roland Gerrits / Anefo, CC0 (Wikimedia Commons)" },
  McEnroe: { head: 'heads/Male_Adult_01', map: 'faces/McEnroe.jpg', skin: '#c8967c', face: {faceW: 0.15, jawW: -0.2, faceL: 0.3, chinL: 0.09, noseL: 0.3, noseW: 0.45}, src: "David Shankbone, CC BY-SA 3.0 (Wikimedia Commons)" },
  Murray: { head: 'heads/Male_Adult_06', map: 'faces/Murray.jpg', skin: '#d29c7e', face: {faceW: 0.0, jawW: -0.24, faceL: -0.04, chinL: -0.1, noseL: -0.22, noseW: -0.03}, src: "Brendan Dennis, CC BY-SA 4.0 (Wikimedia Commons)" },
  Wawrinka: { head: 'heads/Sports_Male_04', map: 'faces/Wawrinka.jpg', skin: '#d8997b', face: {faceW: 0.24, jawW: -0.13, faceL: 0.06, chinL: -0.45, noseL: -0.28, noseW: 0.15}, src: "Carine06, CC BY-SA 2.0 (Wikimedia Commons)" },
  'del Potro': { head: 'heads/Sports_Male_04', map: 'faces/DelPotro.jpg', skin: '#db9979', face: {faceW: -0.18, jawW: 0.14, faceL: 0.45, chinL: -0.17, noseL: -0.14, noseW: 0.14}, src: "si.robi, CC BY-SA 2.0 (Flickr)" },
  Kyrgios: { head: 'heads/Business_Male_01', map: 'faces/Kyrgios.jpg', skin: '#d1967b', face: {faceW: 0.3, jawW: -0.28, faceL: 0.13, chinL: -0.45, noseL: -0.38, noseW: -0.08}, src: "si.robi, CC BY-SA 2.0 (Flickr)" },
  Hewitt: { head: 'heads/Male_Adult_16', map: 'faces/Hewitt.jpg', skin: '#dba586', face: {faceW: 0.17, jawW: 0.03, faceL: 0.28, chinL: 0.04, noseL: 0.45, noseW: 0.07}, src: "si.robi, CC BY-SA 2.0 (Flickr)" },
  Zverev: { head: 'heads/Male_Adult_16', map: 'faces/Zverev.jpg', skin: '#daa587', face: {faceW: -0.07, jawW: -0.14, faceL: 0.3, chinL: -0.01, noseL: 0.17, noseW: 0.06}, src: "si.robi, CC BY-SA 2.0 (Flickr)" },
  Tsitsipas: { head: 'heads/Business_Male_02', map: 'faces/Tsitsipas.jpg', skin: '#e0ab89', face: {faceW: 0.1, jawW: -0.03, faceL: 0.45, chinL: 0.1, noseL: 0.05, noseW: -0.06}, src: "si.robi, CC BY-SA 2.0 (Flickr)" },
  Roddick: { head: 'heads/Business_Male_02', map: 'faces/Roddick.jpg', skin: '#dea884', face: {faceW: 0.2, jawW: -0.15, faceL: 0.34, chinL: 0.03, noseL: 0.14, noseW: 0.02}, src: "Carine06, CC BY-SA 2.0 (Flickr)" },
  Thiem: { head: 'heads/Male_Adult_06', map: 'faces/Thiem.jpg', skin: '#d49e7f', face: {faceW: 0.1, jawW: -0.21, faceL: 0.24, chinL: -0.45, noseL: -0.35, noseW: -0.0}, src: "si.robi, CC BY-SA 2.0 (Flickr)" },
  Medvedev: { head: 'heads/Sports_Male_02', map: 'faces/Medvedev.jpg', skin: '#e49f83', face: {faceW: 0.12, jawW: -0.15, faceL: 0.45, chinL: -0.19, noseL: 0.07, noseW: -0.03}, src: "si.robi, CC BY-SA 2.0 (Flickr)" },
  Monfils: { head: 'heads/Male_Adult_18', map: 'faces/Monfils.jpg', skin: '#6c3f2d', face: {faceW: 0.21, jawW: -0.21, faceL: 0.45, chinL: -0.45, noseL: 0.25, noseW: 0.12}, src: "si.robi, CC BY-SA 2.0 (Flickr)" },
  Kuerten: { head: 'heads/Male_Adult_06', map: 'faces/Kuerten.jpg', skin: '#d9a283', face: {faceW: 0.3, jawW: -0.28, faceL: 0.04, chinL: -0.18, noseL: -0.37, noseW: 0.05}, src: "Valter Campanato/ABr (Ag\u00eancia Brasil), CC BY 3.0 BR (Wikimedia Commons)" },
  Ivanisevic: { head: 'heads/Business_Male_01', map: 'faces/Ivanisevic.jpg', skin: '#d2977c', face: {faceW: 0.3, jawW: -0.33, faceL: 0.2, chinL: -0.07, noseL: 0.11, noseW: 0.19}, src: "Annie and Andrew, CC BY 2.0 (Flickr)" },
  Wilander: { head: 'heads/Sports_Male_02', map: 'faces/Wilander.jpg', skin: '#df9b80', face: {faceW: 0.02, jawW: -0.16, faceL: 0.3, chinL: 0.15, noseL: 0.2, noseW: 0.26}, src: "robbiesaurus, CC BY-SA 2.0 (Flickr)" },
  Becker: { head: 'heads/Male_Adult_16', map: 'faces/Becker.jpg', skin: '#d8a385', face: {faceW: -0.03, jawW: -0.02, faceL: -0.24, chinL: -0.29, noseL: 0.19, noseW: 0.02}, src: "FIBO Global Fitness, CC BY 2.0 (Flickr)" },
  Edberg: { head: 'heads/Male_Adult_16', map: 'faces/Edberg.jpg', skin: '#d8a483', face: {faceW: 0.12, jawW: -0.12, faceL: 0.45, chinL: -0.06, noseL: 0.45, noseW: 0.41}, src: "Robin Fritzson, CC BY 3.0 (Wikimedia Commons)" },
};
