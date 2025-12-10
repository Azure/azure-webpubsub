"use strict";
exports.id = 4789;
exports.ids = [4789];
exports.modules = {

/***/ 87341:
/***/ ((module) => {



module.exports = apl
apl.displayName = 'apl'
apl.aliases = []
function apl(Prism) {
  Prism.languages.apl = {
    comment: /(?:⍝|#[! ]).*$/m,
    string: {
      pattern: /'(?:[^'\r\n]|'')*'/,
      greedy: true
    },
    number: /¯?(?:\d*\.?\d+(?:e[+¯]?\d+)?|¯|∞)(?:j¯?(?:\d*\.?\d+(?:e[+¯]?\d+)?|¯|∞))?/i,
    statement: /:[A-Z][a-z][A-Za-z]*\b/,
    'system-function': {
      pattern: /⎕[A-Z]+/i,
      alias: 'function'
    },
    constant: /[⍬⌾#⎕⍞]/,
    function: /[-+×÷⌈⌊∣|⍳⍸?*⍟○!⌹<≤=>≥≠≡≢∊⍷∪∩~∨∧⍱⍲⍴,⍪⌽⊖⍉↑↓⊂⊃⊆⊇⌷⍋⍒⊤⊥⍕⍎⊣⊢⍁⍂≈⍯↗¤→]/,
    'monadic-operator': {
      pattern: /[\\\/⌿⍀¨⍨⌶&∥]/,
      alias: 'operator'
    },
    'dyadic-operator': {
      pattern: /[.⍣⍠⍤∘⌸@⌺]/,
      alias: 'operator'
    },
    assignment: {
      pattern: /←/,
      alias: 'keyword'
    },
    punctuation: /[\[;\]()◇⋄]/,
    dfn: {
      pattern: /[{}⍺⍵⍶⍹∇⍫:]/,
      alias: 'builtin'
    }
  }
}


/***/ })

};
;