"use strict";
exports.id = 2638;
exports.ids = [2638];
exports.modules = {

/***/ 97888:
/***/ ((module) => {



module.exports = ini
ini.displayName = 'ini'
ini.aliases = []
function ini(Prism) {
  Prism.languages.ini = {
    comment: /^[ \t]*[;#].*$/m,
    selector: /^[ \t]*\[.*?\]/m,
    constant: /^[ \t]*[^\s=]+?(?=[ \t]*=)/m,
    'attr-value': {
      pattern: /=.*/,
      inside: {
        punctuation: /^[=]/
      }
    }
  }
}


/***/ })

};
;