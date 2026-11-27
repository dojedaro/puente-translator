import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeKorean,
  describeTurn,
  koreanRegisterOf,
  koreanReplyRegister,
  parseRegister,
  registerStatus,
  resolveHeardRegister,
} from '../../js/formality.js';

test('auto mode follows the Korean speaker, defaulting to 존댓말', () => {
  assert.equal(koreanReplyRegister('auto', null), 'formal');
  assert.equal(koreanReplyRegister('auto', 'informal'), 'informal');
  assert.equal(koreanReplyRegister('auto', 'formal'), 'formal');
});

test('a manual setting overrides what was heard', () => {
  assert.equal(koreanReplyRegister('formal', 'informal'), 'formal');
  assert.equal(koreanReplyRegister('casual', 'formal'), 'informal');
});

test('parseRegister only accepts the two known values', () => {
  for (const junk of ['', 'formal|informal', null, undefined, 3, 'FORMAL']) {
    assert.equal(parseRegister(junk), null);
  }
});

test('analyzeKorean: common polite and casual endings', () => {
  const cases = {
    '처음 뵙겠습니다. 만나서 반갑습니다.': 'formal',
    '이 버스 시청 가죠?': 'formal',
    '갑시다!': 'formal',
    '오늘 날씨 좋네요': 'formal',
    '내일 갈 거지?': 'informal',
    '같이 점심 먹을래?': 'informal',
    '빨리 와!': 'informal',
  };
  for (const [text, expected] of Object.entries(cases)) assert.equal(koreanRegisterOf(text), expected, text);
});

test('analyzeKorean: endings that fool a naive rule', () => {
  // -니까 is polite only after ㅂ (합니까); otherwise it is a casual connective ending.
  assert.equal(koreanRegisterOf('지금 바쁘니까.'), 'informal');
  assert.equal(koreanRegisterOf('내가 말했다니까!'), 'informal');
  assert.equal(koreanRegisterOf('어디 가십니까?'), 'formal');
  // -시다 is polite only as ㅂ시다 (갑시다), not in a dictionary form like 마시다.
  assert.equal(koreanRegisterOf('물을 마시다.'), 'informal');
});

test('analyzeKorean: ignores acknowledgements, parentheticals and trailing non-Korean', () => {
  assert.equal(koreanRegisterOf('네. 저쪽에 있어요.'), 'formal');
  assert.equal(koreanRegisterOf('7시에 만나요 (내일)'), 'formal');
  assert.equal(koreanRegisterOf('감사합니다 OK'), 'formal');
  assert.equal(koreanRegisterOf('감사합니다!!! 😊'), 'formal');
  assert.equal(koreanRegisterOf('오늘은 3.5도예요.'), 'formal');
  assert.equal(koreanRegisterOf('Hello there'), null);
  assert.equal(koreanRegisterOf(''), null);
});

test('analyzeKorean: mixed levels and written 해라체 are flagged', () => {
  assert.equal(koreanRegisterOf('고마워요! 내일 봐.'), 'mixed');
  assert.equal(analyzeKorean('나는 학생이다. 한국어를 공부한다.').plainStyle, true);
  assert.equal(analyzeKorean('나 학생이야. 한국어 공부해.').plainStyle, false);
  // Found by the first eval run: -자 ("let's") is everyday spoken 반말, not written style.
  assert.equal(analyzeKorean('내일 일곱 시에 만나자.').plainStyle, false);
  assert.equal(analyzeKorean('뭐 하냐?').plainStyle, false);
  assert.equal(
    analyzeKorean('이거 진짜 맛있다!').plainStyle,
    false,
    'an exclamation in -다 is normal speech',
  );
});

test('the heard register trusts clear endings over the model label', () => {
  assert.equal(resolveHeardRegister('formal', '야, 밥 먹었어?'), 'informal');
  assert.equal(resolveHeardRegister('informal', '네'), 'informal', 'endings cannot decide: keep the model');
  assert.equal(resolveHeardRegister(null, '고마워요! 내일 봐.'), null);
});

test('registerStatus explains the current rule', () => {
  assert.equal(registerStatus('auto', null), 'Auto · 존댓말 until they speak');
  assert.equal(registerStatus('auto', 'informal'), 'Auto · they speak 반말, so replies use 반말');
  assert.equal(registerStatus('formal', 'informal'), 'Always 존댓말');
});

test('describeTurn reports the level the Korean reply actually used', () => {
  const base = { from: 'en', to: 'ko', heard: null, requested: 'informal' };
  assert.equal(describeTurn({ ...base, translation: '고마워!' }), 'replied in 반말');
  assert.equal(describeTurn({ ...base, translation: '감사합니다!' }), 'asked for 반말, reply used 존댓말');
  assert.equal(
    describeTurn({ ...base, translation: '고마워요! 내일 봐.' }),
    'asked for 반말, reply mixes levels',
  );
});

test('describeTurn for Korean → Spanish says what was asked for, not what was produced', () => {
  assert.equal(
    describeTurn({
      from: 'ko',
      to: 'es',
      heard: 'informal',
      requested: 'informal',
      translation: '¿De dónde eres?',
    }),
    '반말 heard · asked for tú',
  );
});
