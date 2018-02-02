// Imported to DomTerm from https://chromium.googlesource.com/apps/libapps/

// Copyright (c) 2014 The Chromium OS Authors. All rights reserved.
// Use of lib.wc source code is governed by a BSD-style license that can be
// found in the LICENSE file.

//'use strict';

/**
 * This JavaScript library is ported from the wcwidth.js module of node.js.
 * The original implementation can be found at:
 * https://npmjs.org/package/wcwidth.js
 */

/**
 * JavaScript porting of Markus Kuhn's wcwidth() implementation
 *
 * The following explanation comes from the original C implementation:
 *
 * This is an implementation of wcwidth() and wcswidth() (defined in
 * IEEE Std 1002.1-2001) for Unicode.
 *
 * http://www.opengroup.org/onlinepubs/007904975/functions/wcwidth.html
 * http://www.opengroup.org/onlinepubs/007904975/functions/wcswidth.html
 *
 * In fixed-width output devices, Latin characters all occupy a single
 * "cell" position of equal width, whereas ideographic CJK characters
 * occupy two such cells. Interoperability between terminal-line
 * applications and (teletype-style) character terminals using the
 * UTF-8 encoding requires agreement on which character should advance
 * the cursor by how many cell positions. No established formal
 * standards exist at present on which Unicode character shall occupy
 * how many cell positions on character terminals. These routines are
 * a first attempt of defining such behavior based on simple rules
 * applied to data provided by the Unicode Consortium.
 *
 * For some graphical characters, the Unicode standard explicitly
 * defines a character-cell width via the definition of the East Asian
 * FullWidth (F), Wide (W), Half-width (H), and Narrow (Na) classes.
 * In all these cases, there is no ambiguity about which width a
 * terminal shall use. For characters in the East Asian Ambiguous (A)
 * class, the width choice depends purely on a preference of backward
 * compatibility with either historic CJK or Western practice.
 * Choosing single-width for these characters is easy to justify as
 * the appropriate long-term solution, as the CJK practice of
 * displaying these characters as double-width comes from historic
 * implementation simplicity (8-bit encoded characters were displayed
 * single-width and 16-bit ones double-width, even for Greek,
 * Cyrillic, etc.) and not any typographic considerations.
 *
 * Much less clear is the choice of width for the Not East Asian
 * (Neutral) class. Existing practice does not dictate a width for any
 * of these characters. It would nevertheless make sense
 * typographically to allocate two character cells to characters such
 * as for instance EM SPACE or VOLUME INTEGRAL, which cannot be
 * represented adequately with a single-width glyph. The following
 * routines at present merely assign a single-cell width to all
 * neutral characters, in the interest of simplicity. This is not
 * entirely satisfactory and should be reconsidered before
 * establishing a formal standard in lib.wc area. At the moment, the
 * decision which Not East Asian (Neutral) characters should be
 * represented by double-width glyphs cannot yet be answered by
 * applying a simple rule from the Unicode database content. Setting
 * up a proper standard for the behavior of UTF-8 character terminals
 * will require a careful analysis not only of each Unicode character,
 * but also of each presentation form, something the author of these
 * routines has avoided to do so far.
 *
 * http://www.unicode.org/unicode/reports/tr11/
 *
 * Markus Kuhn -- 2007-05-26 (Unicode 5.0)
 *
 * Permission to use, copy, modify, and distribute lib.wc software
 * for any purpose and without fee is hereby granted. The author
 * disclaims all warranties with regard to lib.wc software.
 *
 * Latest version: http://www.cl.cam.ac.uk/~mgk25/ucs/wcwidth.c
 */

/**
 * The following function defines the column width of an ISO 10646 character
 * as follows:
 *
 *  - The null character (U+0000) has a column width of 0.
 *  - Other C0/C1 control characters and DEL will lead to a return value of -1.
 *  - Non-spacing and enclosing combining characters (general category code Mn
 *    or Me in the Unicode database) have a column width of 0.
 *  - SOFT HYPHEN (U+00AD) has a column width of 1.
 *  - Other format characters (general category code Cf in the Unicode database)
 *    and ZERO WIDTH SPACE (U+200B) have a column width of 0.
 *  - Hangul Jamo medial vowels and final consonants (U+1160-U+11FF) have a
 *    column width of 0.
 *  - Spacing characters in the East Asian Wide (W) or East Asian Full-width (F)
 *    category as defined in Unicode Technical Report #11 have a column width of
 *    2.
 *  - East Asian Ambigous characters are taken into account if
 *    regardCjkAmbiguous flag is enabled. They have a column width of 2.
 *  - All remaining characters (including all printable ISO 8859-1 and WGL4
 *    characters, Unicode control characters, etc.) have a column width of 1.
 *
 * This implementation assumes that characters are encoded in ISO 10646.
 */

/* *
 * This library relies on the use of codePointAt, which is not supported in
 * all browsers. Polyfil if not.  See
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/codePointAt#Polyfill
 * /
if (!String.prototype.codePointAt) {
  (function() {
    'use strict'; // needed to support `apply`/`call` with `undefined`/`null`
    var codePointAt = function(position) {
      if (this == null) {
        throw TypeError();
      }
      var string = String(this);
      var size = string.length;
      // `ToInteger`
      var index = position ? Number(position) : 0;
      if (index != index) { // better `isNaN`
        index = 0;
      }
      // Account for out-of-bounds indices:
      if (index < 0 || index >= size) {
        return undefined;
      }
      // Get the first code unit
      var first = string.charCodeAt(index);
      var second;
      if ( // check if it’s the start of a surrogate pair
        first >= 0xD800 && first <= 0xDBFF && // high surrogate
        size > index + 1 // there is a next code unit
      ) {
        second = string.charCodeAt(index + 1);
        if (second >= 0xDC00 && second <= 0xDFFF) { // low surrogate
          // http://mathiasbynens.be/notes/javascript-encoding#surrogate-formulae
          return (first - 0xD800) * 0x400 + second - 0xDC00 + 0x10000;
        }
      }
      return first;
    };
    if (Object.defineProperty) {
      Object.defineProperty(String.prototype, 'codePointAt', {
        'value': codePointAt,
        'configurable': true,
        'writable': true
      });
    } else {
      String.prototype.codePointAt = codePointAt;
    }
  }());
}
*/

/** @constructor */

function WcWidth() {

    // Width of a nul character.
    this.nulWidth = 0;

    // Width of a control charater.
    this.controlWidth = 0;

    // Flag whether to consider East Asian Ambiguous characters.
    this.regardCjkAmbiguous = false;

    // Width of an East Asian Ambiguous character.
    this.cjkAmbiguousWidth = 2;
};

// Should East Asian Ambiguous character character be consider wide?
// The context (if non-null) is a Node this character is/will be in.
WcWidth.prototype.ambiguousCharsAreWide = function(context) {
    return this.regardCjkAmbiguous;
}

// Sorted list of non-overlapping intervals of non-spacing characters
// generated by "uniset +cat=Me +cat=Mn +cat=Cf -00AD +1160-11FF +200B c"
WcWidth._combining = [
    [ 0x0300, 0x036F ], [ 0x0483, 0x0486 ], [ 0x0488, 0x0489 ],
    [ 0x0591, 0x05BD ], [ 0x05BF, 0x05BF ], [ 0x05C1, 0x05C2 ],
    [ 0x05C4, 0x05C5 ], [ 0x05C7, 0x05C7 ], [ 0x0600, 0x0603 ],
    [ 0x0610, 0x0615 ], [ 0x064B, 0x065E ], [ 0x0670, 0x0670 ],
    [ 0x06D6, 0x06E4 ], [ 0x06E7, 0x06E8 ], [ 0x06EA, 0x06ED ],
    [ 0x070F, 0x070F ], [ 0x0711, 0x0711 ], [ 0x0730, 0x074A ],
    [ 0x07A6, 0x07B0 ], [ 0x07EB, 0x07F3 ], [ 0x0901, 0x0902 ],
    [ 0x093C, 0x093C ], [ 0x0941, 0x0948 ], [ 0x094D, 0x094D ],
    [ 0x0951, 0x0954 ], [ 0x0962, 0x0963 ], [ 0x0981, 0x0981 ],
    [ 0x09BC, 0x09BC ], [ 0x09C1, 0x09C4 ], [ 0x09CD, 0x09CD ],
    [ 0x09E2, 0x09E3 ], [ 0x0A01, 0x0A02 ], [ 0x0A3C, 0x0A3C ],
    [ 0x0A41, 0x0A42 ], [ 0x0A47, 0x0A48 ], [ 0x0A4B, 0x0A4D ],
    [ 0x0A70, 0x0A71 ], [ 0x0A81, 0x0A82 ], [ 0x0ABC, 0x0ABC ],
    [ 0x0AC1, 0x0AC5 ], [ 0x0AC7, 0x0AC8 ], [ 0x0ACD, 0x0ACD ],
    [ 0x0AE2, 0x0AE3 ], [ 0x0B01, 0x0B01 ], [ 0x0B3C, 0x0B3C ],
    [ 0x0B3F, 0x0B3F ], [ 0x0B41, 0x0B43 ], [ 0x0B4D, 0x0B4D ],
    [ 0x0B56, 0x0B56 ], [ 0x0B82, 0x0B82 ], [ 0x0BC0, 0x0BC0 ],
    [ 0x0BCD, 0x0BCD ], [ 0x0C3E, 0x0C40 ], [ 0x0C46, 0x0C48 ],
    [ 0x0C4A, 0x0C4D ], [ 0x0C55, 0x0C56 ], [ 0x0CBC, 0x0CBC ],
    [ 0x0CBF, 0x0CBF ], [ 0x0CC6, 0x0CC6 ], [ 0x0CCC, 0x0CCD ],
    [ 0x0CE2, 0x0CE3 ], [ 0x0D41, 0x0D43 ], [ 0x0D4D, 0x0D4D ],
    [ 0x0DCA, 0x0DCA ], [ 0x0DD2, 0x0DD4 ], [ 0x0DD6, 0x0DD6 ],
    [ 0x0E31, 0x0E31 ], [ 0x0E34, 0x0E3A ], [ 0x0E47, 0x0E4E ],
    [ 0x0EB1, 0x0EB1 ], [ 0x0EB4, 0x0EB9 ], [ 0x0EBB, 0x0EBC ],
    [ 0x0EC8, 0x0ECD ], [ 0x0F18, 0x0F19 ], [ 0x0F35, 0x0F35 ],
    [ 0x0F37, 0x0F37 ], [ 0x0F39, 0x0F39 ], [ 0x0F71, 0x0F7E ],
    [ 0x0F80, 0x0F84 ], [ 0x0F86, 0x0F87 ], [ 0x0F90, 0x0F97 ],
    [ 0x0F99, 0x0FBC ], [ 0x0FC6, 0x0FC6 ], [ 0x102D, 0x1030 ],
    [ 0x1032, 0x1032 ], [ 0x1036, 0x1037 ], [ 0x1039, 0x1039 ],
    [ 0x1058, 0x1059 ], [ 0x1160, 0x11FF ], [ 0x135F, 0x135F ],
    [ 0x1712, 0x1714 ], [ 0x1732, 0x1734 ], [ 0x1752, 0x1753 ],
    [ 0x1772, 0x1773 ], [ 0x17B4, 0x17B5 ], [ 0x17B7, 0x17BD ],
    [ 0x17C6, 0x17C6 ], [ 0x17C9, 0x17D3 ], [ 0x17DD, 0x17DD ],
    [ 0x180B, 0x180D ], [ 0x18A9, 0x18A9 ], [ 0x1920, 0x1922 ],
    [ 0x1927, 0x1928 ], [ 0x1932, 0x1932 ], [ 0x1939, 0x193B ],
    [ 0x1A17, 0x1A18 ], [ 0x1B00, 0x1B03 ], [ 0x1B34, 0x1B34 ],
    [ 0x1B36, 0x1B3A ], [ 0x1B3C, 0x1B3C ], [ 0x1B42, 0x1B42 ],
    [ 0x1B6B, 0x1B73 ], [ 0x1DC0, 0x1DCA ], [ 0x1DFE, 0x1DFF ],
    [ 0x200B, 0x200F ], [ 0x202A, 0x202E ], [ 0x2060, 0x2063 ],
    [ 0x206A, 0x206F ], [ 0x20D0, 0x20EF ], [ 0x302A, 0x302F ],
    [ 0x3099, 0x309A ], [ 0xA806, 0xA806 ], [ 0xA80B, 0xA80B ],
    [ 0xA825, 0xA826 ], [ 0xFB1E, 0xFB1E ], [ 0xFE00, 0xFE0F ],
    [ 0xFE20, 0xFE23 ], [ 0xFEFF, 0xFEFF ], [ 0xFFF9, 0xFFFB ],
    [ 0x10A01, 0x10A03 ], [ 0x10A05, 0x10A06 ], [ 0x10A0C, 0x10A0F ],
    [ 0x10A38, 0x10A3A ], [ 0x10A3F, 0x10A3F ], [ 0x1D167, 0x1D169 ],
    [ 0x1D173, 0x1D182 ], [ 0x1D185, 0x1D18B ], [ 0x1D1AA, 0x1D1AD ],
    [ 0x1D242, 0x1D244 ], [ 0xE0001, 0xE0001 ], [ 0xE0020, 0xE007F ],
    [ 0xE0100, 0xE01EF ]
];

// Sorted list of non-overlapping intervals of East Asian Ambiguous characters
// generated by "uniset +WIDTH-A -cat=Me -cat=Mn -cat=Cf c"
WcWidth._ambiguous = [
    [ 0x00A1, 0x00A1 ], [ 0x00A4, 0x00A4 ], [ 0x00A7, 0x00A8 ],
    [ 0x00AA, 0x00AA ], [ 0x00AE, 0x00AE ], [ 0x00B0, 0x00B4 ],
    [ 0x00B6, 0x00BA ], [ 0x00BC, 0x00BF ], [ 0x00C6, 0x00C6 ],
    [ 0x00D0, 0x00D0 ], [ 0x00D7, 0x00D8 ], [ 0x00DE, 0x00E1 ],
    [ 0x00E6, 0x00E6 ], [ 0x00E8, 0x00EA ], [ 0x00EC, 0x00ED ],
    [ 0x00F0, 0x00F0 ], [ 0x00F2, 0x00F3 ], [ 0x00F7, 0x00FA ],
    [ 0x00FC, 0x00FC ], [ 0x00FE, 0x00FE ], [ 0x0101, 0x0101 ],
    [ 0x0111, 0x0111 ], [ 0x0113, 0x0113 ], [ 0x011B, 0x011B ],
    [ 0x0126, 0x0127 ], [ 0x012B, 0x012B ], [ 0x0131, 0x0133 ],
    [ 0x0138, 0x0138 ], [ 0x013F, 0x0142 ], [ 0x0144, 0x0144 ],
    [ 0x0148, 0x014B ], [ 0x014D, 0x014D ], [ 0x0152, 0x0153 ],
    [ 0x0166, 0x0167 ], [ 0x016B, 0x016B ], [ 0x01CE, 0x01CE ],
    [ 0x01D0, 0x01D0 ], [ 0x01D2, 0x01D2 ], [ 0x01D4, 0x01D4 ],
    [ 0x01D6, 0x01D6 ], [ 0x01D8, 0x01D8 ], [ 0x01DA, 0x01DA ],
    [ 0x01DC, 0x01DC ], [ 0x0251, 0x0251 ], [ 0x0261, 0x0261 ],
    [ 0x02C4, 0x02C4 ], [ 0x02C7, 0x02C7 ], [ 0x02C9, 0x02CB ],
    [ 0x02CD, 0x02CD ], [ 0x02D0, 0x02D0 ], [ 0x02D8, 0x02DB ],
    [ 0x02DD, 0x02DD ], [ 0x02DF, 0x02DF ], [ 0x0391, 0x03A1 ],
    [ 0x03A3, 0x03A9 ], [ 0x03B1, 0x03C1 ], [ 0x03C3, 0x03C9 ],
    [ 0x0401, 0x0401 ], [ 0x0410, 0x044F ], [ 0x0451, 0x0451 ],
    [ 0x2010, 0x2010 ], [ 0x2013, 0x2016 ], [ 0x2018, 0x2019 ],
    [ 0x201C, 0x201D ], [ 0x2020, 0x2022 ], [ 0x2024, 0x2027 ],
    [ 0x2030, 0x2030 ], [ 0x2032, 0x2033 ], [ 0x2035, 0x2035 ],
    [ 0x203B, 0x203B ], [ 0x203E, 0x203E ], [ 0x2074, 0x2074 ],
    [ 0x207F, 0x207F ], [ 0x2081, 0x2084 ], [ 0x20AC, 0x20AC ],
    [ 0x2103, 0x2103 ], [ 0x2105, 0x2105 ], [ 0x2109, 0x2109 ],
    [ 0x2113, 0x2113 ], [ 0x2116, 0x2116 ], [ 0x2121, 0x2122 ],
    [ 0x2126, 0x2126 ], [ 0x212B, 0x212B ], [ 0x2153, 0x2154 ],
    [ 0x215B, 0x215E ], [ 0x2160, 0x216B ], [ 0x2170, 0x2179 ],
    [ 0x2190, 0x2199 ], [ 0x21B8, 0x21B9 ], [ 0x21D2, 0x21D2 ],
    [ 0x21D4, 0x21D4 ], [ 0x21E7, 0x21E7 ], [ 0x2200, 0x2200 ],
    [ 0x2202, 0x2203 ], [ 0x2207, 0x2208 ], [ 0x220B, 0x220B ],
    [ 0x220F, 0x220F ], [ 0x2211, 0x2211 ], [ 0x2215, 0x2215 ],
    [ 0x221A, 0x221A ], [ 0x221D, 0x2220 ], [ 0x2223, 0x2223 ],
    [ 0x2225, 0x2225 ], [ 0x2227, 0x222C ], [ 0x222E, 0x222E ],
    [ 0x2234, 0x2237 ], [ 0x223C, 0x223D ], [ 0x2248, 0x2248 ],
    [ 0x224C, 0x224C ], [ 0x2252, 0x2252 ], [ 0x2260, 0x2261 ],
    [ 0x2264, 0x2267 ], [ 0x226A, 0x226B ], [ 0x226E, 0x226F ],
    [ 0x2282, 0x2283 ], [ 0x2286, 0x2287 ], [ 0x2295, 0x2295 ],
    [ 0x2299, 0x2299 ], [ 0x22A5, 0x22A5 ], [ 0x22BF, 0x22BF ],
    [ 0x2312, 0x2312 ], [ 0x2460, 0x24E9 ], [ 0x24EB, 0x254B ],
    [ 0x2550, 0x2573 ], [ 0x2580, 0x258F ], [ 0x2592, 0x2595 ],
    [ 0x25A0, 0x25A1 ], [ 0x25A3, 0x25A9 ], [ 0x25B2, 0x25B3 ],
    [ 0x25B6, 0x25B7 ], [ 0x25BC, 0x25BD ], [ 0x25C0, 0x25C1 ],
    [ 0x25C6, 0x25C8 ], [ 0x25CB, 0x25CB ], [ 0x25CE, 0x25D1 ],
    [ 0x25E2, 0x25E5 ], [ 0x25EF, 0x25EF ], [ 0x2605, 0x2606 ],
    [ 0x2609, 0x2609 ], [ 0x260E, 0x260F ], [ 0x2614, 0x2615 ],
    [ 0x261C, 0x261C ], [ 0x261E, 0x261E ], [ 0x2640, 0x2640 ],
    [ 0x2642, 0x2642 ], [ 0x2660, 0x2661 ], [ 0x2663, 0x2665 ],
    [ 0x2667, 0x266A ], [ 0x266C, 0x266D ], [ 0x266F, 0x266F ],
    [ 0x273D, 0x273D ], [ 0x2776, 0x277F ], [ 0xE000, 0xF8FF ],
    [ 0xFFFD, 0xFFFD ], [ 0xF0000, 0xFFFFD ], [ 0x100000, 0x10FFFD ]
];

WcWidth._wideEastAsian = [
    0x1100, 0x115f,
    0x231a, 0x231b,
    0x2329, 0x232a,
    0x23e9, 0x23ec,
    0x23f0, 0x23f0,
    0x23f3, 0x23f3,
    0x25fd, 0x25fe,
    0x2614, 0x2615,
    0x2648, 0x2653,
    0x267f, 0x267f,
    0x2693, 0x2693,
    0x26a1, 0x26a1,
    0x26aa, 0x26ab,
    0x26bd, 0x26be,
    0x26c4, 0x26c5,
    0x26ce, 0x26ce,
    0x26d4, 0x26d4,
    0x26ea, 0x26ea,
    0x26f2, 0x26f3,
    0x26f5, 0x26f5,
    0x26fa, 0x26fa,
    0x26fd, 0x26fd,
    0x2705, 0x2705,
    0x270a, 0x270b,
    0x2728, 0x2728,
    0x274c, 0x274c,
    0x274e, 0x274e,
    0x2753, 0x2755,
    0x2757, 0x2757,
    0x2795, 0x2797,
    0x27b0, 0x27b0,
    0x27bf, 0x27bf,
    0x2b1b, 0x2b1c,
    0x2b50, 0x2b50,
    0x2b55, 0x2b55,
    0x2e80, 0x2e99,
    0x2e9b, 0x2ef3,
    0x2f00, 0x2fd5,
    0x2ff0, 0x2ffb,
    0x3000, 0x303e,
    0x3041, 0x3096,
    0x3099, 0x30ff,
    0x3105, 0x312d,
    0x3131, 0x318e,
    0x3190, 0x31ba,
    0x31c0, 0x31e3,
    0x31f0, 0x321e,
    0x3220, 0x3247,
    0x3250, 0x32fe,
    0x3300, 0x4dbf,
    0x4e00, 0xa48c,
    0xa490, 0xa4c6,
    0xa960, 0xa97c,
    0xac00, 0xd7a3,
    0xf900, 0xfaff,
    0xfe10, 0xfe19,
    0xfe30, 0xfe52,
    0xfe54, 0xfe66,
    0xfe68, 0xfe6b,
    0xff01, 0xff60,
    0xffe0, 0xffe6,
    0x16fe0, 0x16fe0,
    0x17000, 0x187ec,
    0x18800, 0x18af2,
    0x1b000, 0x1b001,
    0x1f004, 0x1f004,
    0x1f0cf, 0x1f0cf,
    0x1f18e, 0x1f18e,
    0x1f191, 0x1f19a,
    0x1f200, 0x1f202,
    0x1f210, 0x1f23b,
    0x1f240, 0x1f248,
    0x1f250, 0x1f251,
    0x1f300, 0x1f320,
    0x1f32d, 0x1f335,
    0x1f337, 0x1f37c,
    0x1f37e, 0x1f393,
    0x1f3a0, 0x1f3ca,
    0x1f3cf, 0x1f3d3,
    0x1f3e0, 0x1f3f0,
    0x1f3f4, 0x1f3f4,
    0x1f3f8, 0x1f43e,
    0x1f440, 0x1f440,
    0x1f442, 0x1f4fc,
    0x1f4ff, 0x1f53d,
    0x1f54b, 0x1f54e,
    0x1f550, 0x1f567,
    0x1f57a, 0x1f57a,
    0x1f595, 0x1f596,
    0x1f5a4, 0x1f5a4,
    0x1f5fb, 0x1f64f,
    0x1f680, 0x1f6c5,
    0x1f6cc, 0x1f6cc,
    0x1f6d0, 0x1f6d2,
    0x1f6eb, 0x1f6ec,
    0x1f6f4, 0x1f6f6,
    0x1f910, 0x1f91e,
    0x1f920, 0x1f927,
    0x1f930, 0x1f930,
    0x1f933, 0x1f93e,
    0x1f940, 0x1f94b,
    0x1f950, 0x1f95e,
    0x1f980, 0x1f991,
    0x1f9c0, 0x1f9c0,
    0x20000, 0x2fffd,
    0x30000, 0x3fffd
];

/**
 * Binary search to check if the given unicode character is a space character.
 *
 * @param {interger} ucs A unicode character code.
 *
 * @return {boolean} True if the given character is a space character; false
 *     otherwise.
 */
WcWidth.isSpace = function(ucs) {
  // Auxiliary function for binary search in interval table.
  var combining = WcWidth._combining;
  var min = 0, max = combining.length - 1;
  var mid;

  if (ucs < combining[0][0] || ucs > combining[max][1])
    return false;
  while (max >= min) {
    mid = Math.floor((min + max) / 2);
    if (ucs > combining[mid][1]) {
      min = mid + 1;
    } else if (ucs < combining[mid][0]) {
      max = mid - 1;
    } else {
      return true;
    }
  }

  return false;
};

WcWidth.isWideEastAsian = function(ucs) {
    var table = WcWidth._wideEastAsian;
    var min = 0, max = (table.length >> 1) - 1;
    var mid;

    if (ucs < table[0] || ucs > table[2 * max + 1])
        return false;
    while (max >= min) {
        mid = Math.floor((min + max) / 2);
        if (ucs > table[2*mid+1]) {
            min = mid + 1;
        } else if (ucs < table[2*mid]) {
            max = mid - 1;
        } else {
            return true;
        }
    }
    return false;
};

/**
 * Auxiliary function for checking if the given unicode character is a East
 * Asian Ambiguous character.
 *
 * @param {interger} ucs A unicode character code.
 *
 * @return {boolean} True if the given character is a East Asian Ambiguous
 * character.
 */
WcWidth.prototype.isCjkAmbiguous = function(ucs) {
  var ambiguous = WcWidth._ambiguous;
  var min = 0, max = ambiguous.length - 1;
  var mid;

  if (ucs < ambiguous[0][0] || ucs > ambiguous[max][1])
    return false;
  while (max >= min) {
    mid = Math.floor((min + max) / 2);
    if (ucs > ambiguous[mid][1]) {
      min = mid + 1;
    } else if (ucs < ambiguous[mid][0]) {
      max = mid - 1;
    } else {
      return true;
    }
  }

  return false;
};

/**
 * Determine the column width of the given character.
 *
 * @param {integer} ucs A unicode character code.
 *
 * @return {integer} The column width of the given character.
 */
WcWidth.prototype.wcwidth = function(ucs) {
  if (this.regardCjkAmbiguous) {
    return this.charWidthRegardAmbiguous(ucs);
  } else {
    return this.charWidthDisregardAmbiguous(ucs);
  }
};
WcWidth.prototype.wcwidthInContext = function(ucs, context) {
  if (this.ambiguousCharsAreWide(context))
    return this.charWidthRegardAmbiguous(ucs);
  else
    return this.charWidthDisregardAmbiguous(ucs);
};

/**
 * Determine the column width of the given character without considering East
 * Asian Ambiguous characters.
 *
 * @param {integer} ucs A unicode character code.
 *
 * @return {integer} The column width of the given character.
 */
WcWidth.prototype.charWidthDisregardAmbiguous = function(ucs) {
  // Test for 8-bit control characters.
  if (ucs < 32 || (ucs >= 0x7f && ucs < 0xa0))
      return ucs == 0 ? this.nulWidth : this.controlWidth;

  // Optimize for ASCII characters.
  if (ucs < 0x7f)
    return 1;

  // Binary search in table of non-spacing characters.
  if (WcWidth.isSpace(ucs))
    return 0;

  // If we arrive here, ucs is not a combining or C0/C1 control character.
  return WcWidth.isWideEastAsian(ucs) ? 2 : 1;
};

/**
 * Determine the column width of the given character considering East Asian
 * Ambiguous characters.
 *
 * @param {integer} ucs A unicode character code.
 *
 * @return {integer} The column width of the given character.
 */
WcWidth.prototype.charWidthRegardAmbiguous = function(ucs) {
  if (this.isCjkAmbiguous(ucs))
    return this.cjkAmbiguousWidth;

  return this.charWidthDisregardAmbiguous(ucs);
};

/**
 * Determine the column width of the given string.
 *
 * @param {string} str A string.
 *
 * @return {integer} The column width of the given string.
 */
WcWidth.prototype.strWidth = function(str) {
  var width, rv = 0;

  for (var i = 0; i < str.length;) {
    var codePoint = str.codePointAt(i);
    width = this.wcwidth(codePoint);
    if (width < 0)
      return -1;
    rv += width;
    i += (codePoint <= 0xffff) ? 1 : 2;
  }

  return rv;
};
WcWidth.prototype.strWidthInContext = function(str, context) {
  var preferWide = this.ambiguousCharsAreWide(context);

  var width, rv = 0;
  for (var i = 0; i < str.length;) {
    var codePoint = str.codePointAt(i);
    width = preferWide ? this.charWidthRegardAmbiguous(codePoint)
          : this.charWidthDisregardAmbiguous(codePoint);
    if (width < 0)
      return -1;
    rv += width;
    i += (codePoint <= 0xffff) ? 1 : 2;
  }

  return rv;
};

/**
 * Get the substring at the given column offset of the given column width.
 *
 * @param {string} str The string to get substring from.
 * @param {integer} start The starting column offset to get substring.
 * @param {integer} opt_width The column width of the substring.
 *
 * @return {string} The substring.
 */
WcWidth.prototype.substr = function(str, start, opt_width) {
  var startIndex, endIndex, width;

  for (startIndex = 0, width = 0; startIndex < str.length; startIndex++) {
    width += this.wcwidth(str.charCodeAt(startIndex));
    if (width > start)
      break;
  }

  if (opt_width != undefined) {
    for (endIndex = startIndex, width = 0;
         endIndex < str.length && width < opt_width; endIndex++)
        width += this.wcwidth(str.charCodeAt(endIndex));
    if (width > opt_width)
      endIndex--;
    return str.substring(startIndex, endIndex);
  }

  return str.substr(startIndex);
};

/**
 * Get substring at the given start and end column offset.
 *
 * @param {string} str The string to get substring from.
 * @param {integer} start The starting column offset.
 * @param {integer} end The ending column offset.
 *
 * @return {string} The substring.
 */
WcWidth.prototype.substring = function(str, start, end) {
  return this.substr(str, start, end - start);
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = WcWidth;
}
