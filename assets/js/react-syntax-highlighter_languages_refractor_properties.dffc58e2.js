"use strict";
exports.id = 5559;
exports.ids = [5559];
exports.modules = {

/***/ 25549:
/***/ ((module) => {



module.exports = properties
properties.displayName = 'properties'
properties.aliases = []
function properties(Prism) {
  Prism.languages.properties = {
    comment: /^[ \t]*[#!].*$/m,
    'attr-value': {
      pattern: /(^[ \t]*(?:\\(?:\r\n|[\s\S])|[^\\\s:=])+?(?: *[=:] *| ))(?:\\(?:\r\n|[\s\S])|[^\\\r\n])+/m,
      lookbehind: true
    },
    'attr-name': /^[ \t]*(?:\\(?:\r\n|[\s\S])|[^\\\s:=])+?(?= *[=:] *| )/m,
    punctuation: /[=:]/
  }
}


/***/ })

};
;