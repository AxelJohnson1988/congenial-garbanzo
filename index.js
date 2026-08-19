let express = require('express');
let app = express();
let ejs = require('ejs');
const haikus = require('./haikus.json');
const port = process.env.PORT || 3000;

// Unicode Grade-1 Braille (English, uncontracted) mapping for basic ASCII
const BRAILLE_MAP = {
  ' ': '\u2800', a: '\u2801', b: '\u2803', c: '\u2809', d: '\u2819',
  e: '\u2811', f: '\u280b', g: '\u281b', h: '\u2813', i: '\u280a',
  j: '\u281a', k: '\u2805', l: '\u2807', m: '\u280d', n: '\u281d',
  o: '\u2815', p: '\u280f', q: '\u281f', r: '\u2817', s: '\u280e',
  t: '\u281e', u: '\u2825', v: '\u2827', w: '\u283a', x: '\u282d',
  y: '\u283d', z: '\u2835', ',': '\u2802', '.': '\u2832', '!': '\u2816',
  '?': '\u2826', '\'': '\u2804', '-': '\u2824', '\n': '\n',
};

function toBraille(text) {
  return text.toLowerCase().split('').map(ch => BRAILLE_MAP[ch] || ch).join('');
}

const haikusWithBraille = haikus.map(h => ({
  ...h,
  braille: toBraille(h.text),
}));

app.use(express.static('public'))
app.set('view engine', 'ejs');

app.get('/', (req, res) => {
  res.render('index', {haikus: haikusWithBraille});
});

app.listen(port);