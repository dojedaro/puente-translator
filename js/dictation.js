// Mic input through the artifact `dictation` capability.
// One controller per page: it owns "who is listening" so a failed start or stop can never
// leave the app stuck in a listening state.

/**
 * @param {object} dictation  the capability: start(), stop(), onPartial, onFinal, onState
 * @param {object} handlers
 * @param {(side: 'A'|'B', text: string) => void} handlers.onText   live words while listening
 * @param {(side: 'A'|'B', text: string) => void} handlers.onDone   final words after the mic closes
 * @param {(message: string) => void} handlers.onError
 */
export function createDictationController(dictation, { onText, onDone, onError }) {
  let side = null;
  let settled = '';

  const reset = () => {
    side = null;
    settled = '';
  };

  dictation.onPartial(({ text }) => {
    if (side) onText(side, `${settled} ${text}`.trim());
  });
  dictation.onFinal(({ text }) => {
    if (!side) return;
    settled = `${settled} ${text}`.trim();
    onText(side, settled);
  });
  dictation.onState(({ state }) => {
    // 'listening' while open; 'idle' (with a reason) when it closes. Anything else is transient.
    if (!side || (state !== 'idle' && state !== 'error')) return;
    const finishedSide = side;
    const words = settled;
    reset();
    if (state === 'error') onError('The mic stopped with an error. Try again or type.');
    else onDone(finishedSide, words);
  });

  const fail = (error) => {
    if (!side) return;
    reset();
    onError(
      error?.code === 'not_granted'
        ? 'Microphone was declined. You can still type.'
        : 'The mic did not start. Try again or type.',
    );
  };

  return {
    get listening() {
      return side;
    },
    /** Must be called straight from the click handler: the browser requires a user gesture. */
    start(nextSide) {
      side = nextSide;
      settled = '';
      let started;
      try {
        started = dictation.start();
      } catch (error) {
        fail(error);
        return false;
      }
      Promise.resolve(started).catch(fail);
      return true;
    },
    /** Close the mic. If the runtime refuses, give up on it locally so the UI is never stuck. */
    stop() {
      const stoppingSide = side;
      Promise.resolve()
        .then(() => dictation.stop())
        .catch(() => {
          if (side === stoppingSide && side) {
            const words = settled;
            reset();
            onDone(stoppingSide, words);
          }
        });
    },
  };
}
