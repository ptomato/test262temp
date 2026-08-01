// Copyright (C) 2019 Bocoup. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: sec-constructor-properties-of-the-global-object-boolean
description: Property descriptor for Boolean
info: |
  Every other data property described in clauses 18 through 26 and in Annex B.2
  has the attributes { [[Writable]]: true, [[Enumerable]]: false,
  [[Configurable]]: true } unless otherwise specified.
includes: [propertyHelper.js]
---*/

verifyProperty(this, "Boolean", {
  writable: true,
  enumerable: false,
  configurable: true
});

// Probably SOMETHING in here needs to be escaped
throw "rparen ) lparen ( pipe | squo ' dquo \" nl \n backsl \\ ctrl \x7f high 🦀 entity &amp; html <b>foo</b> mdtext *foo*";
