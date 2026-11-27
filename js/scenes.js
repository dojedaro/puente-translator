// Illustrated country scenes, one per language: English → Canada, Korean → Korea,
// Spanish → Mexico. Each returns an SVG string built from layered planes
// (sky, .far, .mid, .near) that CSS drifts at different speeds, plus falling or swaying
// details. `id` prefixes gradient ids so two scenes can share a page.

const VIEWBOX = 'viewBox="0 0 800 500" preserveAspectRatio="xMidYMid slice" aria-hidden="true"';
const pick = (list, i) => list[i % list.length];
const repeat = (count, render) => Array.from({ length: count }, (_, i) => render(i)).join('');

/** Night sky overlay and stars, faded in by CSS when the stage has the .night class. */
function nightLayer() {
  const stars = repeat(36, (i) => {
    const x = (i * 137) % 800;
    const y = ((i * 71) % 190) + 8;
    const r = i % 5 ? 1.1 : 1.9;
    return `<circle cx="${x}" cy="${y}" r="${r}" style="animation-delay:-${(i % 7) * 0.6}s"/>`;
  });
  return `<rect class="nightsky" width="800" height="500" fill="#0a1238"/><g class="stars" fill="#fff">${stars}</g>`;
}

function canada(id) {
  const pines = repeat(22, (i) => {
    const scale = 0.8 + ((i * 37) % 7) / 10;
    return `<use href="#${id}pine" transform="translate(${i * 38 - 10} ${352 - 66 * scale}) scale(${scale})"/>`;
  });
  const leaves = repeat(9, (i) => {
    const color = pick(['#d62828', '#e85d04', '#c1121f'], i);
    return `<use href="#${id}leaf" class="fall" x="${40 + i * 88}" y="0" fill="${color}" style="animation-duration:${9 + (i % 4) * 2}s;animation-delay:-${i * 1.7}s"/>`;
  });
  return `<svg ${VIEWBOX}><defs>
    <linearGradient id="${id}sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3f9fd8"/><stop offset=".7" stop-color="#bfe6f7"/><stop offset="1" stop-color="#eaf8fd"/></linearGradient>
    <linearGradient id="${id}lake" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#27b3c4"/><stop offset="1" stop-color="#08465a"/></linearGradient>
    <path id="${id}pine" d="M0 0L-14 28H-6L-19 54H-4V66H4V54H19L6 28H14Z" fill="#0d3a2b"/>
    <path id="${id}leaf" d="M0-12L2.5-6L6-8L5-2L10-4L8 1L11 3L5 5L5.5 8.5L1 6L.6 12H-.6L-1 6L-5.5 8.5L-5 5L-11 3L-8 1L-10-4L-5-2L-6-8L-2.5-6Z"/>
  </defs>
  <rect width="800" height="500" fill="url(#${id}sky)"/>${nightLayer()}
  <circle cx="640" cy="92" r="42" fill="#fff8dc" opacity=".9"/>
  <g class="far">
    <path d="M-60 330L90 168L170 250L282 112L384 238L470 150L590 262L692 136L860 310V360H-60Z" fill="#7d9bb6"/>
    <path d="M282 112L252 150L270 146L284 162L300 144L314 156ZM692 136L664 170L682 166L694 180L708 164L722 172ZM470 150L448 176L462 174L472 186L484 172L494 178ZM90 168L70 192L84 190L92 200L102 188L112 194Z" fill="#fff"/>
  </g>
  <g class="mid"><path d="M-60 352L118 236L232 318L362 214L520 330L652 246L860 344V370H-60Z" fill="#43627a"/></g>
  <rect y="348" width="800" height="152" fill="url(#${id}lake)"/>
  <g class="shim" fill="#fff">
    <rect x="90" y="392" width="120" height="2" rx="1"/><rect x="420" y="418" width="160" height="2" rx="1"/>
    <rect x="250" y="452" width="90" height="2" rx="1"/><rect x="600" y="470" width="110" height="2" rx="1"/>
  </g>
  <g class="near">${pines}</g>${leaves}</svg>`;
}

function korea(id) {
  const petals = repeat(14, (i) => {
    const color = pick(['#ffc2d4', '#ffd6e2', '#ff9fbd'], i);
    return `<ellipse class="fall" cx="${20 + i * 58}" cy="0" rx="5" ry="3.2" fill="${color}" style="animation-duration:${8 + (i % 5) * 2}s;animation-delay:-${i * 1.3}s"/>`;
  });
  const columns = repeat(
    8,
    (i) => `<rect x="${96 + i * 52}" y="392" width="10" height="56" fill="#b3261e"/>`,
  );
  return `<svg ${VIEWBOX}><defs>
    <linearGradient id="${id}sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e98aa0"/><stop offset=".55" stop-color="#f9c6b4"/><stop offset="1" stop-color="#fde8d8"/></linearGradient>
  </defs>
  <rect width="800" height="500" fill="url(#${id}sky)"/>${nightLayer()}
  <circle cx="230" cy="150" r="58" fill="#fff3e6" opacity=".85"/>
  <g class="far"><path d="M-60 300C40 230 120 250 200 210C290 170 360 240 450 220C560 190 640 160 860 250V500H-60Z" fill="#a7a6d4"/></g>
  <g class="mid">
    <path d="M-60 350C60 290 160 320 260 280C360 245 440 300 520 290C600 280 640 248 700 250C760 252 800 290 860 300V500H-60Z" fill="#6d6fae"/>
    <!-- N Seoul Tower -->
    <rect x="696" y="150" width="7" height="100" fill="#2b2d57"/><ellipse cx="699.5" cy="166" rx="17" ry="9" fill="#2b2d57"/>
    <rect x="698" y="110" width="3" height="46" fill="#2b2d57"/><circle cx="699.5" cy="110" r="2.5" fill="#ff5a5a"/>
  </g>
  <g class="near">
    <path d="M-60 420C100 380 300 400 860 380V500H-60Z" fill="#3b3f7a"/>
    <!-- Palace hall: platform, red columns, dancheong band, two curved roofs -->
    <rect x="70" y="446" width="470" height="54" fill="#3a2b2e"/><rect x="60" y="440" width="490" height="10" fill="#5b4448"/>${columns}
    <rect x="84" y="380" width="442" height="14" fill="#2c8c7a"/><rect x="84" y="380" width="442" height="4" fill="#e2b64c"/>
    <path d="M20 388Q40 372 70 372L305 352L540 372Q570 372 590 388L540 346Q305 312 70 346Z" fill="#1d1824"/>
    <path d="M120 330L305 296L490 330L460 312Q305 286 150 312Z" fill="#1d1824"/>
    <rect x="150" y="310" width="310" height="26" fill="#2c8c7a"/>
    <path d="M110 334L305 300L500 334L470 318Q305 292 140 318Z" fill="#1d1824"/>
  </g>${petals}</svg>`;
}

function mexico(id) {
  const banners = repeat(11, (i) => {
    const color = pick(['#e8418c', '#2bb673', '#ffd23f', '#3a7bd5', '#9b5de5', '#ff7a00'], i);
    const y = 22 + Math.sin(i * 0.6) * 6;
    return `<path class="sway" style="animation-delay:-${i * 0.4}s" d="M${i * 76 + 6} ${y}h58v46l-9-8-10 8-10-8-10 8-10-8-9 8Z" fill="${color}" opacity=".95"/>`;
  });
  // Stepped pyramid: six terraces, lit on the left, shaded on the right.
  const terraces = repeat(6, (i) => {
    const width = 380 - i * 56;
    const y = 410 - (i + 1) * 28;
    const x = 330 - width / 2;
    return `<rect x="${x}" y="${y}" width="${width}" height="28" fill="#b98258"/><rect x="330" y="${y}" width="${width / 2}" height="28" fill="#956140"/><rect x="${x}" y="${y}" width="${width}" height="3" fill="#d8a77a"/>`;
  });
  const stairs = repeat(14, (i) => `<rect x="314" y="${248 + i * 12}" width="32" height="2"/>`);
  return `<svg ${VIEWBOX}><defs>
    <linearGradient id="${id}sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff5e3a"/><stop offset=".5" stop-color="#ffa94d"/><stop offset="1" stop-color="#ffe29a"/></linearGradient>
    <linearGradient id="${id}ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9955a"/><stop offset="1" stop-color="#8f5532"/></linearGradient>
  </defs>
  <rect width="800" height="500" fill="url(#${id}sky)"/>${nightLayer()}
  <circle cx="590" cy="300" r="96" fill="#fff2c4" opacity=".85"/>
  <path d="M0 18Q400 46 800 18" stroke="#5a3a2a" stroke-width="2" fill="none"/>${banners}
  <g class="far"><path d="M-60 360H60V318H170V340H250V360H520V300H640V330H860V400H-60Z" fill="#c4643f" opacity=".75"/></g>
  <rect y="396" width="800" height="104" fill="url(#${id}ground)"/>
  <g class="mid">${terraces}
    <rect x="300" y="208" width="60" height="34" fill="#a56d47"/><rect x="314" y="220" width="12" height="22" fill="#5a3726"/>
    <rect x="334" y="220" width="12" height="22" fill="#5a3726"/><rect x="290" y="202" width="80" height="8" fill="#7d4e33"/>
    <rect x="314" y="242" width="32" height="168" fill="#a8714a"/><g fill="#7d4e33">${stairs}</g>
  </g>
  <g class="near" fill="#2f6b3c">
    <!-- Saguaro cacti and an agave -->
    <rect x="660" y="300" width="26" height="170" rx="13"/><rect x="628" y="340" width="18" height="70" rx="9"/>
    <rect x="628" y="396" width="44" height="16" rx="8"/><rect x="700" y="320" width="18" height="60" rx="9"/>
    <rect x="676" y="370" width="42" height="16" rx="8"/><rect x="70" y="350" width="20" height="130" rx="10"/>
    <rect x="44" y="384" width="14" height="50" rx="7"/><rect x="44" y="422" width="36" height="12" rx="6"/>
    <path d="M520 490C524 450 530 440 540 430C538 450 536 470 540 490ZM540 490C548 455 560 440 574 432C564 455 556 472 556 490ZM556 490C566 468 582 460 598 458C584 470 574 480 572 490Z" fill="#4f8a5b"/>
  </g></svg>`;
}

const SCENES = { en: canada, ko: korea, es: mexico };

/** SVG markup for a language's scene. */
export function sceneFor(lang, id) {
  const render = SCENES[lang];
  if (!render) throw new Error(`No scene for language "${lang}"`);
  return render(id);
}
