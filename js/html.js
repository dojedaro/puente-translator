// Small DOM-free helpers for building HTML strings safely.

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape text for use inside HTML content or a quoted attribute. */
export const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c]);

/** First `max` characters, counted by code point so emoji and Hangul are never split. */
export const truncate = (value, max) =>
  Array.from(String(value ?? ''))
    .slice(0, max)
    .join('');
