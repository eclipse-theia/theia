/* From https://github.com/marijnh/browserkeymap
Copyright (C) 2016 by Marijn Haverbeke <marijnh@gmail.com> and others

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/
(function(mod) {
  if (typeof exports == "object" && typeof module == "object") { // CommonJS
    module.exports = mod()
    module.exports.default = module.exports // ES6 modules compatibility
  }
  else if (typeof define == "function" && define.amd) // AMD
    return define([], mod)
  else // Plain browser env
    (this || window).browserKeymap = mod()
})(function() {
  "use strict"

  var mac = typeof navigator != "undefined" ? /Mac/.test(navigator.platform)
          : typeof os != "undefined" ? os.platform() == "darwin" : false

  // :: Object<string>
  // A map from key codes to key names.
  var keyNames = {
    3: "Enter", 8: "Backspace", 9: "Tab", 13: "Enter", 16: "Shift", 17: "Ctrl", 18: "Alt",
    19: "Pause", 20: "CapsLock", 27: "Esc", 32: "Space", 33: "PageUp", 34: "PageDown", 35: "End",
    36: "Home", 37: "Left", 38: "Up", 39: "Right", 40: "Down", 44: "PrintScrn", 45: "Insert",
    46: "Delete", 59: ";", 61: "=", 91: "Mod", 92: "Mod", 93: "Mod",
    106: "*", 107: "=", 109: "-", 110: ".", 111: "/", 127: "Delete",
    173: "-", 186: ";", 187: "=", 188: ",", 189: "-", 190: ".", 191: "/", 192: "`", 219: "[", 220: "\\",
    221: "]", 222: "'", 63232: "Up", 63233: "Down", 63234: "Left", 63235: "Right", 63272: "Delete",
    63273: "Home", 63275: "End", 63276: "PageUp", 63277: "PageDown", 63302: "Insert"
  }

  // Number keys
  for (var i = 0; i < 10; i++) keyNames[i + 48] = keyNames[i + 96] = String(i)
  // Alphabetic keys
  for (var i = 65; i <= 90; i++) keyNames[i] = String.fromCharCode(i)
  // Function keys
  for (var i = 1; i <= 12; i++) keyNames[i + 111] = keyNames[i + 63235] = "F" + i

  // :: (KeyboardEvent) → ?string
  // Find a name for the given keydown event. If the keycode in the
  // event is not known, this will return `null`. Otherwise, it will
  // return a string like `"Shift-Cmd-Ctrl-Alt-Home"`. The parts before
  // the dashes give the modifiers (always in that order, if present),
  // and the last word gives the key name, which one of the names in
  // `keyNames`.
  //
  // The convention for keypress events is to use the pressed character
  // between single quotes. Due to limitations in the browser API,
  // keypress events can not have modifiers.
  function keyName(event) {
    if (event.type == "keypress") return "'" + String.fromCharCode(event.charCode) + "'"

    var base = keyNames[event.keyCode], name = base
    if (name == null || event.altGraphKey) return null

    if (event.altKey && base != "Alt") name = "Alt-" + name
    if (event.ctrlKey && base != "Ctrl") name = "Ctrl-" + name
    if (event.metaKey && base != "Cmd") name = "Cmd-" + name
    if (event.shiftKey && base != "Shift") name = "Shift-" + name
    return name
  }

  // :: (string) → bool
  // Test whether the given key name refers to a modifier key.
  function isModifierKey(name) {
    name = /[^-]*$/.exec(name)[0]
    return name == "Ctrl" || name == "Alt" || name == "Shift" || name == "Mod"
  }

  // :: (string) → string
  // Normalize a sloppy key name, which may have modifiers in the wrong
  // order or use shorthands for modifiers, to a properly formed key
  // name. Used to normalize names provided in keymaps.
  //
  // Note that the modifier `mod` is a shorthand for `Cmd` on Mac, and
  // `Ctrl` on other platforms.
  function normalizeKeyName(name) {
    var parts = name.split(/-(?!'?$)/), result = parts[parts.length - 1]
    var alt, ctrl, shift, cmd
    for (var i = 0; i < parts.length - 1; i++) {
      var mod = parts[i]
      if (/^(cmd|meta|m)$/i.test(mod)) cmd = true
      else if (/^a(lt)?$/i.test(mod)) alt = true
      else if (/^(c|ctrl|control)$/i.test(mod)) ctrl = true
      else if (/^s(hift)?$/i.test(mod)) shift = true
      else if (/^mod$/i.test(mod)) { if (mac) cmd = true; else ctrl = true }
      else throw new Error("Unrecognized modifier name: " + mod)
    }
    if (alt) result = "Alt-" + result
    if (ctrl) result = "Ctrl-" + result
    if (cmd) result = "Cmd-" + result
    if (shift) result = "Shift-" + result
    return result
  }

  function hasProp(obj, prop) {
    return Object.prototype.hasOwnProperty.call(obj, prop)
  }

  function unusedMulti(bindings, name) {
    for (var binding in bindings)
      if (binding.length > name && binding.indexOf(name) == 0 && binding.charAt(name.length) == " ")
        return false
    return true
  }

  function updateBindings(bindings, base) {
    var result = {}
    if (base) for (var prop in base) if (hasProp(base, prop)) result[prop] = base[prop]

    for (var keyname in bindings) if (hasProp(bindings, keyname)) {
      var keys = keyname.split(/ +(?!\'$)/).map(normalizeKeyName)
      var value = bindings[keyname]
      if (value == null) {
        for (var i = keys.length - 1; i >= 0; i--) {
          var name = keys.slice(0, i + 1).join(" ")
          var old = result[name]
          if (old == Keymap.unfinished && !unusedMulti(result, name))
            break
          else if (old)
            delete result[name]
        }
      } else {
        for (var i = 0; i < keys.length; i++) {
          var name = keys.slice(0, i + 1).join(" ")
          var val = i == keys.length - 1 ? value : Keymap.unfinished
          var prev = result[name]
          if (prev && (i < keys.length - 1 || prev == Keymap.unfinished) && prev != val)
            throw new Error("Inconsistent bindings for " + name)
          result[name] = val
        }
      }
    }
    return result
  }

  // :: (Object<T>) → Keymap<T>
  // A keymap binds a set of [key names](#keyName) to values.
  //
  // Construct a keymap using the given bindings, which should be an
  // object whose property names are [key names](#keyName) or
  // space-separated sequences of key names. In the second case, the
  // binding will be for a multi-stroke key combination.
  function Keymap(bindings, base) {
    this.bindings = updateBindings(bindings, base)
  }

  // :: (Object<?T>) → Keymap
  // Create a new keymap by adding bindings from the given object,
  // and removing the bindings that the object maps to null.
  Keymap.prototype.update = function(bindings) {
    return new Keymap(bindings, this.bindings)
  }

  // :: (string) → T
  // Looks up the given key or key sequence in this keymap. Returns
  // the value the key is bound to (which may be undefined if it is
  // not bound), or the value `Keymap.unfinished` if the key is a prefix of a
  // multi-key sequence that is bound by this keymap.
  Keymap.prototype.lookup = function(key) {
    return this.bindings[key]
  }

  Keymap.unfinished = {toString: function() { return "Keymap.unfinished" }}

  Keymap.keyName = keyName
  Keymap.isModifierKey = isModifierKey
  Keymap.normalizeKeyName = normalizeKeyName

  function ComputedKeymap(f) { this.f = f }
  ComputedKeymap.prototype.lookup = function(key, context) { return this.f(key, context) }
  // :: ((key: string, context: ?any) → T) → ComputedKeymap<T>
  // Construct a 'computed' keymap from a function which takes a key
  // name and returns a binding.
  Keymap.Computed = ComputedKeymap

  return Keymap
})
