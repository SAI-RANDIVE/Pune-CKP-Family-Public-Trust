/**
 * Rough Devanagari to Latin transliteration, used only to make search work
 * when a trustee types a name in Marathi while the register holds it in
 * English ("देशपांडे" should still find "Deshpande"). The result is fed to a
 * fuzzy (trigram) match, so it only needs to be close, not correct.
 */
const CONSONANTS = {
  क: 'k', ख: 'kh', ग: 'g', घ: 'gh', ङ: 'n', च: 'ch', छ: 'chh', ज: 'j', झ: 'jh', ञ: 'n',
  ट: 't', ठ: 'th', ड: 'd', ढ: 'dh', ण: 'n', त: 't', थ: 'th', द: 'd', ध: 'dh', न: 'n',
  प: 'p', फ: 'ph', ब: 'b', भ: 'bh', म: 'm', य: 'y', र: 'r', ल: 'l', व: 'v', श: 'sh',
  ष: 'sh', स: 's', ह: 'h', ळ: 'l', ऱ: 'r',
};
const VOWELS = { अ: 'a', आ: 'a', इ: 'i', ई: 'i', उ: 'u', ऊ: 'u', ऋ: 'ru', ए: 'e', ऐ: 'ai', ओ: 'o', औ: 'au', ऑ: 'o', ॲ: 'a' };
const MATRAS = { 'ा': 'a', 'ि': 'i', 'ी': 'i', 'ु': 'u', 'ू': 'u', 'ृ': 'ru', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ॉ': 'o', 'ॅ': 'a' };
const VIRAMA = '्';

export const hasDevanagari = (text) => /[ऀ-ॿ]/.test(String(text || ''));

export function devanagariToLatin(input) {
  const chars = Array.from(String(input || '').normalize('NFC'));
  let out = '';
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    const next = chars[i + 1];
    if (CONSONANTS[ch]) {
      out += CONSONANTS[ch];
      if (next === VIRAMA) { i += 1; continue; }
      if (next && MATRAS[next] !== undefined) { out += MATRAS[next]; i += 1; continue; }
      // Inherent "a", dropped at the end of a word as it is in speech.
      const endOfWord = !next || !(CONSONANTS[next] || next === 'ं' || next === 'ँ');
      if (!endOfWord) out += 'a';
    } else if (VOWELS[ch]) out += VOWELS[ch];
    else if (ch === 'ं' || ch === 'ँ') out += 'n';
    else if (ch === 'ः') out += 'h';
    else if (/[०-९]/.test(ch)) out += String(ch.charCodeAt(0) - 0x0966);
    else if (/[ऀ-ॿ]/.test(ch)) out += '';
    else out += ch;
  }
  return out;
}
