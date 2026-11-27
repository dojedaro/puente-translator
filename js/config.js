// Static configuration: languages, language pairs, phrases and the scripted demo.
// Pure data, no DOM access, so it can be imported by Node tests.

/** @typedef {'ko' | 'en' | 'es'} Lang */
/** @typedef {'A' | 'B'} Side */

export const LANGS = Object.freeze({
  ko: {
    name: '한국어',
    english: 'Korean',
    place: '대한민국',
    speechTag: 'ko-KR',
    placeholder: '한국어로 입력하세요',
    keyboardMicHint: '탭한 다음 키보드 마이크로 말씀하세요',
    facesYou: '이쪽 화면을 보세요',
    speak: '말하기',
    send: '번역',
  },
  en: {
    name: 'English',
    english: 'English',
    place: 'Canada',
    speechTag: 'en-US',
    placeholder: 'Type in English',
    keyboardMicHint: 'Tap, then use the keyboard mic',
    facesYou: 'This side faces you',
    speak: 'Speak',
    send: 'Go',
  },
  es: {
    name: 'Español',
    english: 'Spanish',
    place: 'México',
    speechTag: 'es-MX',
    placeholder: 'Escribe en español',
    keyboardMicHint: 'Toque y use el micrófono del teclado',
    facesYou: 'Este lado es para usted',
    speak: 'Hablar',
    send: 'Traducir',
  },
});

/** Each pair lists the language on side A, then side B. */
export const PAIRS = Object.freeze({
  koen: ['ko', 'en'],
  esko: ['es', 'ko'],
});

export const QUICK_PHRASES = Object.freeze({
  ko: ['안녕하세요', '감사합니다', '다시 한번 말씀해 주시겠어요?', '얼마예요?'],
  en: ['Hello, nice to meet you', 'Thank you so much', 'Could you say that again?', 'How much is it?'],
  es: ['Hola, mucho gusto', 'Muchas gracias', '¿Me lo puede repetir?', '¿Cuánto cuesta?'],
});

/** Voice preferences per language, best first. Spanish prefers Mexico to match the scene. */
export const VOICE_PREFERENCES = Object.freeze({
  ko: ['ko-KR'],
  en: ['en-CA', 'en-US', 'en-GB'],
  es: ['es-MX', 'es-US', 'es-ES'],
});

/**
 * Scripted sample conversation, shown when Claude is not reachable (GitHub Pages, local file)
 * or when the viewer presses "Watch demo". `heardRegister` is the Korean speech level the
 * source line uses, so the demo exercises the same formality rules as live translation.
 */
export const DEMO_SCRIPT = Object.freeze({
  koen: [
    {
      side: 'A',
      source: '야, 오랜만이야! 여기 앉아.',
      translation: 'Hey, long time no see! Sit here.',
      heardRegister: 'informal',
      note: '반말 heard',
    },
    {
      side: 'B',
      source: 'Thanks! I just got back from Canada.',
      translation: '고마워! 나 캐나다에서 막 돌아왔어.',
      romanization: 'Gomawo! Na kaenadaeseo mak dorawasseo.',
      note: 'replied in 반말, matching them',
    },
    {
      side: 'A',
      source: '진짜? 캐나다 어땠어?',
      translation: 'Really? How was Canada?',
      heardRegister: 'informal',
      note: '반말 heard',
    },
  ],
  esko: [
    {
      side: 'A',
      source: 'Hola, ¿me puede recomendar un buen restaurante?',
      translation: '안녕하세요, 괜찮은 식당 하나 추천해 주실 수 있나요?',
      romanization: 'Annyeonghaseyo, gwaenchaneun sikdang hana chucheonhae jusil su innayo?',
      note: 'replied in 존댓말',
    },
    {
      side: 'B',
      source: '네, 저를 따라오세요. 근처에 맛있는 한식집이 있어요.',
      translation: 'Sí, sígame. Hay un restaurante coreano muy bueno aquí cerca.',
      heardRegister: 'formal',
      note: '존댓말 heard · replied in usted',
    },
  ],
});

/** @param {string} pair @param {Side} side @returns {Lang} */
export const langOf = (pair, side) => PAIRS[pair][side === 'A' ? 0 : 1];

/** @param {Side} side @returns {Side} */
export const otherSide = (side) => (side === 'A' ? 'B' : 'A');
