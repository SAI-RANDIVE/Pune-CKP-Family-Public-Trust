/**
 * The translate function, kept apart from the dictionaries so that browser
 * code can use it without bundling both languages.
 */

const humanise = (key) => {
  const last = String(key).split('.').pop().replace(/_/g, ' ');
  return last.charAt(0).toUpperCase() + last.slice(1);
};

/**
 * Builds t(key, vars). An unknown key falls back to the fallback dictionary,
 * then to a readable form of the key, so a missing translation never shows as
 * a blank. "{name}" in a string is replaced by vars.name.
 */
export function makeT(dict, fallback = null) {
  return function t(key, vars) {
    let text = dict?.[key] ?? fallback?.[key] ?? humanise(key);
    if (vars) {
      for (const [name, value] of Object.entries(vars)) {
        text = text.split(`{${name}}`).join(String(value ?? ''));
      }
    }
    return text;
  };
}
