(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
// CodeMirror, copyright (c) by Marijn Haverbeke and others
// Distributed under an MIT license: http://codemirror.net/LICENSE

// This is CodeMirror (http://codemirror.net), a code editor
// implemented in JavaScript on top of the browser's DOM.
//
// You can find some technical background for some of the code below
// at http://marijnhaverbeke.nl/blog/#cm-internals .

(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
	typeof define === 'function' && define.amd ? define(factory) :
	(global.CodeMirror = factory());
}(this, (function () { 'use strict';

// Kludges for bugs and behavior differences that can't be feature
// detected are enabled based on userAgent etc sniffing.
var userAgent = navigator.userAgent;
var platform = navigator.platform;

var gecko = /gecko\/\d/i.test(userAgent);
var ie_upto10 = /MSIE \d/.test(userAgent);
var ie_11up = /Trident\/(?:[7-9]|\d{2,})\..*rv:(\d+)/.exec(userAgent);
var edge = /Edge\/(\d+)/.exec(userAgent);
var ie = ie_upto10 || ie_11up || edge;
var ie_version = ie && (ie_upto10 ? document.documentMode || 6 : +(edge || ie_11up)[1]);
var webkit = !edge && /WebKit\//.test(userAgent);
var qtwebkit = webkit && /Qt\/\d+\.\d+/.test(userAgent);
var chrome = !edge && /Chrome\//.test(userAgent);
var presto = /Opera\//.test(userAgent);
var safari = /Apple Computer/.test(navigator.vendor);
var mac_geMountainLion = /Mac OS X 1\d\D([8-9]|\d\d)\D/.test(userAgent);
var phantom = /PhantomJS/.test(userAgent);

var ios = !edge && /AppleWebKit/.test(userAgent) && /Mobile\/\w+/.test(userAgent);
var android = /Android/.test(userAgent);
// This is woefully incomplete. Suggestions for alternative methods welcome.
var mobile = ios || android || /webOS|BlackBerry|Opera Mini|Opera Mobi|IEMobile/i.test(userAgent);
var mac = ios || /Mac/.test(platform);
var chromeOS = /\bCrOS\b/.test(userAgent);
var windows = /win/i.test(platform);

var presto_version = presto && userAgent.match(/Version\/(\d*\.\d*)/);
if (presto_version) { presto_version = Number(presto_version[1]); }
if (presto_version && presto_version >= 15) { presto = false; webkit = true; }
// Some browsers use the wrong event properties to signal cmd/ctrl on OS X
var flipCtrlCmd = mac && (qtwebkit || presto && (presto_version == null || presto_version < 12.11));
var captureRightClick = gecko || (ie && ie_version >= 9);

function classTest(cls) { return new RegExp("(^|\\s)" + cls + "(?:$|\\s)\\s*") }

var rmClass = function(node, cls) {
  var current = node.className;
  var match = classTest(cls).exec(current);
  if (match) {
    var after = current.slice(match.index + match[0].length);
    node.className = current.slice(0, match.index) + (after ? match[1] + after : "");
  }
};

function removeChildren(e) {
  for (var count = e.childNodes.length; count > 0; --count)
    { e.removeChild(e.firstChild); }
  return e
}

function removeChildrenAndAdd(parent, e) {
  return removeChildren(parent).appendChild(e)
}

function elt(tag, content, className, style) {
  var e = document.createElement(tag);
  if (className) { e.className = className; }
  if (style) { e.style.cssText = style; }
  if (typeof content == "string") { e.appendChild(document.createTextNode(content)); }
  else if (content) { for (var i = 0; i < content.length; ++i) { e.appendChild(content[i]); } }
  return e
}
// wrapper for elt, which removes the elt from the accessibility tree
function eltP(tag, content, className, style) {
  var e = elt(tag, content, className, style);
  e.setAttribute("role", "presentation");
  return e
}

var range;
if (document.createRange) { range = function(node, start, end, endNode) {
  var r = document.createRange();
  r.setEnd(endNode || node, end);
  r.setStart(node, start);
  return r
}; }
else { range = function(node, start, end) {
  var r = document.body.createTextRange();
  try { r.moveToElementText(node.parentNode); }
  catch(e) { return r }
  r.collapse(true);
  r.moveEnd("character", end);
  r.moveStart("character", start);
  return r
}; }

function contains(parent, child) {
  if (child.nodeType == 3) // Android browser always returns false when child is a textnode
    { child = child.parentNode; }
  if (parent.contains)
    { return parent.contains(child) }
  do {
    if (child.nodeType == 11) { child = child.host; }
    if (child == parent) { return true }
  } while (child = child.parentNode)
}

function activeElt() {
  // IE and Edge may throw an "Unspecified Error" when accessing document.activeElement.
  // IE < 10 will throw when accessed while the page is loading or in an iframe.
  // IE > 9 and Edge will throw when accessed in an iframe if document.body is unavailable.
  var activeElement;
  try {
    activeElement = document.activeElement;
  } catch(e) {
    activeElement = document.body || null;
  }
  while (activeElement && activeElement.shadowRoot && activeElement.shadowRoot.activeElement)
    { activeElement = activeElement.shadowRoot.activeElement; }
  return activeElement
}

function addClass(node, cls) {
  var current = node.className;
  if (!classTest(cls).test(current)) { node.className += (current ? " " : "") + cls; }
}
function joinClasses(a, b) {
  var as = a.split(" ");
  for (var i = 0; i < as.length; i++)
    { if (as[i] && !classTest(as[i]).test(b)) { b += " " + as[i]; } }
  return b
}

var selectInput = function(node) { node.select(); };
if (ios) // Mobile Safari apparently has a bug where select() is broken.
  { selectInput = function(node) { node.selectionStart = 0; node.selectionEnd = node.value.length; }; }
else if (ie) // Suppress mysterious IE10 errors
  { selectInput = function(node) { try { node.select(); } catch(_e) {} }; }

function bind(f) {
  var args = Array.prototype.slice.call(arguments, 1);
  return function(){return f.apply(null, args)}
}

function copyObj(obj, target, overwrite) {
  if (!target) { target = {}; }
  for (var prop in obj)
    { if (obj.hasOwnProperty(prop) && (overwrite !== false || !target.hasOwnProperty(prop)))
      { target[prop] = obj[prop]; } }
  return target
}

// Counts the column offset in a string, taking tabs into account.
// Used mostly to find indentation.
function countColumn(string, end, tabSize, startIndex, startValue) {
  if (end == null) {
    end = string.search(/[^\s\u00a0]/);
    if (end == -1) { end = string.length; }
  }
  for (var i = startIndex || 0, n = startValue || 0;;) {
    var nextTab = string.indexOf("\t", i);
    if (nextTab < 0 || nextTab >= end)
      { return n + (end - i) }
    n += nextTab - i;
    n += tabSize - (n % tabSize);
    i = nextTab + 1;
  }
}

var Delayed = function() {this.id = null;};
Delayed.prototype.set = function (ms, f) {
  clearTimeout(this.id);
  this.id = setTimeout(f, ms);
};

function indexOf(array, elt) {
  for (var i = 0; i < array.length; ++i)
    { if (array[i] == elt) { return i } }
  return -1
}

// Number of pixels added to scroller and sizer to hide scrollbar
var scrollerGap = 30;

// Returned or thrown by various protocols to signal 'I'm not
// handling this'.
var Pass = {toString: function(){return "CodeMirror.Pass"}};

// Reused option objects for setSelection & friends
var sel_dontScroll = {scroll: false};
var sel_mouse = {origin: "*mouse"};
var sel_move = {origin: "+move"};

// The inverse of countColumn -- find the offset that corresponds to
// a particular column.
function findColumn(string, goal, tabSize) {
  for (var pos = 0, col = 0;;) {
    var nextTab = string.indexOf("\t", pos);
    if (nextTab == -1) { nextTab = string.length; }
    var skipped = nextTab - pos;
    if (nextTab == string.length || col + skipped >= goal)
      { return pos + Math.min(skipped, goal - col) }
    col += nextTab - pos;
    col += tabSize - (col % tabSize);
    pos = nextTab + 1;
    if (col >= goal) { return pos }
  }
}

var spaceStrs = [""];
function spaceStr(n) {
  while (spaceStrs.length <= n)
    { spaceStrs.push(lst(spaceStrs) + " "); }
  return spaceStrs[n]
}

function lst(arr) { return arr[arr.length-1] }

function map(array, f) {
  var out = [];
  for (var i = 0; i < array.length; i++) { out[i] = f(array[i], i); }
  return out
}

function insertSorted(array, value, score) {
  var pos = 0, priority = score(value);
  while (pos < array.length && score(array[pos]) <= priority) { pos++; }
  array.splice(pos, 0, value);
}

function nothing() {}

function createObj(base, props) {
  var inst;
  if (Object.create) {
    inst = Object.create(base);
  } else {
    nothing.prototype = base;
    inst = new nothing();
  }
  if (props) { copyObj(props, inst); }
  return inst
}

var nonASCIISingleCaseWordChar = /[\u00df\u0587\u0590-\u05f4\u0600-\u06ff\u3040-\u309f\u30a0-\u30ff\u3400-\u4db5\u4e00-\u9fcc\uac00-\ud7af]/;
function isWordCharBasic(ch) {
  return /\w/.test(ch) || ch > "\x80" &&
    (ch.toUpperCase() != ch.toLowerCase() || nonASCIISingleCaseWordChar.test(ch))
}
function isWordChar(ch, helper) {
  if (!helper) { return isWordCharBasic(ch) }
  if (helper.source.indexOf("\\w") > -1 && isWordCharBasic(ch)) { return true }
  return helper.test(ch)
}

function isEmpty(obj) {
  for (var n in obj) { if (obj.hasOwnProperty(n) && obj[n]) { return false } }
  return true
}

// Extending unicode characters. A series of a non-extending char +
// any number of extending chars is treated as a single unit as far
// as editing and measuring is concerned. This is not fully correct,
// since some scripts/fonts/browsers also treat other configurations
// of code points as a group.
var extendingChars = /[\u0300-\u036f\u0483-\u0489\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7\u0610-\u061a\u064b-\u065e\u0670\u06d6-\u06dc\u06de-\u06e4\u06e7\u06e8\u06ea-\u06ed\u0711\u0730-\u074a\u07a6-\u07b0\u07eb-\u07f3\u0816-\u0819\u081b-\u0823\u0825-\u0827\u0829-\u082d\u0900-\u0902\u093c\u0941-\u0948\u094d\u0951-\u0955\u0962\u0963\u0981\u09bc\u09be\u09c1-\u09c4\u09cd\u09d7\u09e2\u09e3\u0a01\u0a02\u0a3c\u0a41\u0a42\u0a47\u0a48\u0a4b-\u0a4d\u0a51\u0a70\u0a71\u0a75\u0a81\u0a82\u0abc\u0ac1-\u0ac5\u0ac7\u0ac8\u0acd\u0ae2\u0ae3\u0b01\u0b3c\u0b3e\u0b3f\u0b41-\u0b44\u0b4d\u0b56\u0b57\u0b62\u0b63\u0b82\u0bbe\u0bc0\u0bcd\u0bd7\u0c3e-\u0c40\u0c46-\u0c48\u0c4a-\u0c4d\u0c55\u0c56\u0c62\u0c63\u0cbc\u0cbf\u0cc2\u0cc6\u0ccc\u0ccd\u0cd5\u0cd6\u0ce2\u0ce3\u0d3e\u0d41-\u0d44\u0d4d\u0d57\u0d62\u0d63\u0dca\u0dcf\u0dd2-\u0dd4\u0dd6\u0ddf\u0e31\u0e34-\u0e3a\u0e47-\u0e4e\u0eb1\u0eb4-\u0eb9\u0ebb\u0ebc\u0ec8-\u0ecd\u0f18\u0f19\u0f35\u0f37\u0f39\u0f71-\u0f7e\u0f80-\u0f84\u0f86\u0f87\u0f90-\u0f97\u0f99-\u0fbc\u0fc6\u102d-\u1030\u1032-\u1037\u1039\u103a\u103d\u103e\u1058\u1059\u105e-\u1060\u1071-\u1074\u1082\u1085\u1086\u108d\u109d\u135f\u1712-\u1714\u1732-\u1734\u1752\u1753\u1772\u1773\u17b7-\u17bd\u17c6\u17c9-\u17d3\u17dd\u180b-\u180d\u18a9\u1920-\u1922\u1927\u1928\u1932\u1939-\u193b\u1a17\u1a18\u1a56\u1a58-\u1a5e\u1a60\u1a62\u1a65-\u1a6c\u1a73-\u1a7c\u1a7f\u1b00-\u1b03\u1b34\u1b36-\u1b3a\u1b3c\u1b42\u1b6b-\u1b73\u1b80\u1b81\u1ba2-\u1ba5\u1ba8\u1ba9\u1c2c-\u1c33\u1c36\u1c37\u1cd0-\u1cd2\u1cd4-\u1ce0\u1ce2-\u1ce8\u1ced\u1dc0-\u1de6\u1dfd-\u1dff\u200c\u200d\u20d0-\u20f0\u2cef-\u2cf1\u2de0-\u2dff\u302a-\u302f\u3099\u309a\ua66f-\ua672\ua67c\ua67d\ua6f0\ua6f1\ua802\ua806\ua80b\ua825\ua826\ua8c4\ua8e0-\ua8f1\ua926-\ua92d\ua947-\ua951\ua980-\ua982\ua9b3\ua9b6-\ua9b9\ua9bc\uaa29-\uaa2e\uaa31\uaa32\uaa35\uaa36\uaa43\uaa4c\uaab0\uaab2-\uaab4\uaab7\uaab8\uaabe\uaabf\uaac1\uabe5\uabe8\uabed\udc00-\udfff\ufb1e\ufe00-\ufe0f\ufe20-\ufe26\uff9e\uff9f]/;
function isExtendingChar(ch) { return ch.charCodeAt(0) >= 768 && extendingChars.test(ch) }

// Returns a number from the range [`0`; `str.length`] unless `pos` is outside that range.
function skipExtendingChars(str, pos, dir) {
  while ((dir < 0 ? pos > 0 : pos < str.length) && isExtendingChar(str.charAt(pos))) { pos += dir; }
  return pos
}

// Returns the value from the range [`from`; `to`] that satisfies
// `pred` and is closest to `from`. Assumes that at least `to`
// satisfies `pred`. Supports `from` being greater than `to`.
function findFirst(pred, from, to) {
  // At any point we are certain `to` satisfies `pred`, don't know
  // whether `from` does.
  var dir = from > to ? -1 : 1;
  for (;;) {
    if (from == to) { return from }
    var midF = (from + to) / 2, mid = dir < 0 ? Math.ceil(midF) : Math.floor(midF);
    if (mid == from) { return pred(mid) ? from : to }
    if (pred(mid)) { to = mid; }
    else { from = mid + dir; }
  }
}

// The display handles the DOM integration, both for input reading
// and content drawing. It holds references to DOM nodes and
// display-related state.

function Display(place, doc, input) {
  var d = this;
  this.input = input;

  // Covers bottom-right square when both scrollbars are present.
  d.scrollbarFiller = elt("div", null, "CodeMirror-scrollbar-filler");
  d.scrollbarFiller.setAttribute("cm-not-content", "true");
  // Covers bottom of gutter when coverGutterNextToScrollbar is on
  // and h scrollbar is present.
  d.gutterFiller = elt("div", null, "CodeMirror-gutter-filler");
  d.gutterFiller.setAttribute("cm-not-content", "true");
  // Will contain the actual code, positioned to cover the viewport.
  d.lineDiv = eltP("div", null, "CodeMirror-code");
  // Elements are added to these to represent selection and cursors.
  d.selectionDiv = elt("div", null, null, "position: relative; z-index: 1");
  d.cursorDiv = elt("div", null, "CodeMirror-cursors");
  // A visibility: hidden element used to find the size of things.
  d.measure = elt("div", null, "CodeMirror-measure");
  // When lines outside of the viewport are measured, they are drawn in this.
  d.lineMeasure = elt("div", null, "CodeMirror-measure");
  // Wraps everything that needs to exist inside the vertically-padded coordinate system
  d.lineSpace = eltP("div", [d.measure, d.lineMeasure, d.selectionDiv, d.cursorDiv, d.lineDiv],
                    null, "position: relative; outline: none");
  var lines = eltP("div", [d.lineSpace], "CodeMirror-lines");
  // Moved around its parent to cover visible view.
  d.mover = elt("div", [lines], null, "position: relative");
  // Set to the height of the document, allowing scrolling.
  d.sizer = elt("div", [d.mover], "CodeMirror-sizer");
  d.sizerWidth = null;
  // Behavior of elts with overflow: auto and padding is
  // inconsistent across browsers. This is used to ensure the
  // scrollable area is big enough.
  d.heightForcer = elt("div", null, null, "position: absolute; height: " + scrollerGap + "px; width: 1px;");
  // Will contain the gutters, if any.
  d.gutters = elt("div", null, "CodeMirror-gutters");
  d.lineGutter = null;
  // Actual scrollable element.
  d.scroller = elt("div", [d.sizer, d.heightForcer, d.gutters], "CodeMirror-scroll");
  d.scroller.setAttribute("tabIndex", "-1");
  // The element in which the editor lives.
  d.wrapper = elt("div", [d.scrollbarFiller, d.gutterFiller, d.scroller], "CodeMirror");

  // Work around IE7 z-index bug (not perfect, hence IE7 not really being supported)
  if (ie && ie_version < 8) { d.gutters.style.zIndex = -1; d.scroller.style.paddingRight = 0; }
  if (!webkit && !(gecko && mobile)) { d.scroller.draggable = true; }

  if (place) {
    if (place.appendChild) { place.appendChild(d.wrapper); }
    else { place(d.wrapper); }
  }

  // Current rendered range (may be bigger than the view window).
  d.viewFrom = d.viewTo = doc.first;
  d.reportedViewFrom = d.reportedViewTo = doc.first;
  // Information about the rendered lines.
  d.view = [];
  d.renderedView = null;
  // Holds info about a single rendered line when it was rendered
  // for measurement, while not in view.
  d.externalMeasured = null;
  // Empty space (in pixels) above the view
  d.viewOffset = 0;
  d.lastWrapHeight = d.lastWrapWidth = 0;
  d.updateLineNumbers = null;

  d.nativeBarWidth = d.barHeight = d.barWidth = 0;
  d.scrollbarsClipped = false;

  // Used to only resize the line number gutter when necessary (when
  // the amount of lines crosses a boundary that makes its width change)
  d.lineNumWidth = d.lineNumInnerWidth = d.lineNumChars = null;
  // Set to true when a non-horizontal-scrolling line widget is
  // added. As an optimization, line widget aligning is skipped when
  // this is false.
  d.alignWidgets = false;

  d.cachedCharWidth = d.cachedTextHeight = d.cachedPaddingH = null;

  // Tracks the maximum line length so that the horizontal scrollbar
  // can be kept static when scrolling.
  d.maxLine = null;
  d.maxLineLength = 0;
  d.maxLineChanged = false;

  // Used for measuring wheel scrolling granularity
  d.wheelDX = d.wheelDY = d.wheelStartX = d.wheelStartY = null;

  // True when shift is held down.
  d.shift = false;

  // Used to track whether anything happened since the context menu
  // was opened.
  d.selForContextMenu = null;

  d.activeTouch = null;

  input.init(d);
}

// Find the line object corresponding to the given line number.
function getLine(doc, n) {
  n -= doc.first;
  if (n < 0 || n >= doc.size) { throw new Error("There is no line " + (n + doc.first) + " in the document.") }
  var chunk = doc;
  while (!chunk.lines) {
    for (var i = 0;; ++i) {
      var child = chunk.children[i], sz = child.chunkSize();
      if (n < sz) { chunk = child; break }
      n -= sz;
    }
  }
  return chunk.lines[n]
}

// Get the part of a document between two positions, as an array of
// strings.
function getBetween(doc, start, end) {
  var out = [], n = start.line;
  doc.iter(start.line, end.line + 1, function (line) {
    var text = line.text;
    if (n == end.line) { text = text.slice(0, end.ch); }
    if (n == start.line) { text = text.slice(start.ch); }
    out.push(text);
    ++n;
  });
  return out
}
// Get the lines between from and to, as array of strings.
function getLines(doc, from, to) {
  var out = [];
  doc.iter(from, to, function (line) { out.push(line.text); }); // iter aborts when callback returns truthy value
  return out
}

// Update the height of a line, propagating the height change
// upwards to parent nodes.
function updateLineHeight(line, height) {
  var diff = height - line.height;
  if (diff) { for (var n = line; n; n = n.parent) { n.height += diff; } }
}

// Given a line object, find its line number by walking up through
// its parent links.
function lineNo(line) {
  if (line.parent == null) { return null }
  var cur = line.parent, no = indexOf(cur.lines, line);
  for (var chunk = cur.parent; chunk; cur = chunk, chunk = chunk.parent) {
    for (var i = 0;; ++i) {
      if (chunk.children[i] == cur) { break }
      no += chunk.children[i].chunkSize();
    }
  }
  return no + cur.first
}

// Find the line at the given vertical position, using the height
// information in the document tree.
function lineAtHeight(chunk, h) {
  var n = chunk.first;
  outer: do {
    for (var i$1 = 0; i$1 < chunk.children.length; ++i$1) {
      var child = chunk.children[i$1], ch = child.height;
      if (h < ch) { chunk = child; continue outer }
      h -= ch;
      n += child.chunkSize();
    }
    return n
  } while (!chunk.lines)
  var i = 0;
  for (; i < chunk.lines.length; ++i) {
    var line = chunk.lines[i], lh = line.height;
    if (h < lh) { break }
    h -= lh;
  }
  return n + i
}

function isLine(doc, l) {return l >= doc.first && l < doc.first + doc.size}

function lineNumberFor(options, i) {
  return String(options.lineNumberFormatter(i + options.firstLineNumber))
}

// A Pos instance represents a position within the text.
function Pos(line, ch, sticky) {
  if ( sticky === void 0 ) sticky = null;

  if (!(this instanceof Pos)) { return new Pos(line, ch, sticky) }
  this.line = line;
  this.ch = ch;
  this.sticky = sticky;
}

// Compare two positions, return 0 if they are the same, a negative
// number when a is less, and a positive number otherwise.
function cmp(a, b) { return a.line - b.line || a.ch - b.ch }

function equalCursorPos(a, b) { return a.sticky == b.sticky && cmp(a, b) == 0 }

function copyPos(x) {return Pos(x.line, x.ch)}
function maxPos(a, b) { return cmp(a, b) < 0 ? b : a }
function minPos(a, b) { return cmp(a, b) < 0 ? a : b }

// Most of the external API clips given positions to make sure they
// actually exist within the document.
function clipLine(doc, n) {return Math.max(doc.first, Math.min(n, doc.first + doc.size - 1))}
function clipPos(doc, pos) {
  if (pos.line < doc.first) { return Pos(doc.first, 0) }
  var last = doc.first + doc.size - 1;
  if (pos.line > last) { return Pos(last, getLine(doc, last).text.length) }
  return clipToLen(pos, getLine(doc, pos.line).text.length)
}
function clipToLen(pos, linelen) {
  var ch = pos.ch;
  if (ch == null || ch > linelen) { return Pos(pos.line, linelen) }
  else if (ch < 0) { return Pos(pos.line, 0) }
  else { return pos }
}
function clipPosArray(doc, array) {
  var out = [];
  for (var i = 0; i < array.length; i++) { out[i] = clipPos(doc, array[i]); }
  return out
}

// Optimize some code when these features are not used.
var sawReadOnlySpans = false;
var sawCollapsedSpans = false;

function seeReadOnlySpans() {
  sawReadOnlySpans = true;
}

function seeCollapsedSpans() {
  sawCollapsedSpans = true;
}

// TEXTMARKER SPANS

function MarkedSpan(marker, from, to) {
  this.marker = marker;
  this.from = from; this.to = to;
}

// Search an array of spans for a span matching the given marker.
function getMarkedSpanFor(spans, marker) {
  if (spans) { for (var i = 0; i < spans.length; ++i) {
    var span = spans[i];
    if (span.marker == marker) { return span }
  } }
}
// Remove a span from an array, returning undefined if no spans are
// left (we don't store arrays for lines without spans).
function removeMarkedSpan(spans, span) {
  var r;
  for (var i = 0; i < spans.length; ++i)
    { if (spans[i] != span) { (r || (r = [])).push(spans[i]); } }
  return r
}
// Add a span to a line.
function addMarkedSpan(line, span) {
  line.markedSpans = line.markedSpans ? line.markedSpans.concat([span]) : [span];
  span.marker.attachLine(line);
}

// Used for the algorithm that adjusts markers for a change in the
// document. These functions cut an array of spans at a given
// character position, returning an array of remaining chunks (or
// undefined if nothing remains).
function markedSpansBefore(old, startCh, isInsert) {
  var nw;
  if (old) { for (var i = 0; i < old.length; ++i) {
    var span = old[i], marker = span.marker;
    var startsBefore = span.from == null || (marker.inclusiveLeft ? span.from <= startCh : span.from < startCh);
    if (startsBefore || span.from == startCh && marker.type == "bookmark" && (!isInsert || !span.marker.insertLeft)) {
      var endsAfter = span.to == null || (marker.inclusiveRight ? span.to >= startCh : span.to > startCh);(nw || (nw = [])).push(new MarkedSpan(marker, span.from, endsAfter ? null : span.to));
    }
  } }
  return nw
}
function markedSpansAfter(old, endCh, isInsert) {
  var nw;
  if (old) { for (var i = 0; i < old.length; ++i) {
    var span = old[i], marker = span.marker;
    var endsAfter = span.to == null || (marker.inclusiveRight ? span.to >= endCh : span.to > endCh);
    if (endsAfter || span.from == endCh && marker.type == "bookmark" && (!isInsert || span.marker.insertLeft)) {
      var startsBefore = span.from == null || (marker.inclusiveLeft ? span.from <= endCh : span.from < endCh);(nw || (nw = [])).push(new MarkedSpan(marker, startsBefore ? null : span.from - endCh,
                                            span.to == null ? null : span.to - endCh));
    }
  } }
  return nw
}

// Given a change object, compute the new set of marker spans that
// cover the line in which the change took place. Removes spans
// entirely within the change, reconnects spans belonging to the
// same marker that appear on both sides of the change, and cuts off
// spans partially within the change. Returns an array of span
// arrays with one element for each line in (after) the change.
function stretchSpansOverChange(doc, change) {
  if (change.full) { return null }
  var oldFirst = isLine(doc, change.from.line) && getLine(doc, change.from.line).markedSpans;
  var oldLast = isLine(doc, change.to.line) && getLine(doc, change.to.line).markedSpans;
  if (!oldFirst && !oldLast) { return null }

  var startCh = change.from.ch, endCh = change.to.ch, isInsert = cmp(change.from, change.to) == 0;
  // Get the spans that 'stick out' on both sides
  var first = markedSpansBefore(oldFirst, startCh, isInsert);
  var last = markedSpansAfter(oldLast, endCh, isInsert);

  // Next, merge those two ends
  var sameLine = change.text.length == 1, offset = lst(change.text).length + (sameLine ? startCh : 0);
  if (first) {
    // Fix up .to properties of first
    for (var i = 0; i < first.length; ++i) {
      var span = first[i];
      if (span.to == null) {
        var found = getMarkedSpanFor(last, span.marker);
        if (!found) { span.to = startCh; }
        else if (sameLine) { span.to = found.to == null ? null : found.to + offset; }
      }
    }
  }
  if (last) {
    // Fix up .from in last (or move them into first in case of sameLine)
    for (var i$1 = 0; i$1 < last.length; ++i$1) {
      var span$1 = last[i$1];
      if (span$1.to != null) { span$1.to += offset; }
      if (span$1.from == null) {
        var found$1 = getMarkedSpanFor(first, span$1.marker);
        if (!found$1) {
          span$1.from = offset;
          if (sameLine) { (first || (first = [])).push(span$1); }
        }
      } else {
        span$1.from += offset;
        if (sameLine) { (first || (first = [])).push(span$1); }
      }
    }
  }
  // Make sure we didn't create any zero-length spans
  if (first) { first = clearEmptySpans(first); }
  if (last && last != first) { last = clearEmptySpans(last); }

  var newMarkers = [first];
  if (!sameLine) {
    // Fill gap with whole-line-spans
    var gap = change.text.length - 2, gapMarkers;
    if (gap > 0 && first)
      { for (var i$2 = 0; i$2 < first.length; ++i$2)
        { if (first[i$2].to == null)
          { (gapMarkers || (gapMarkers = [])).push(new MarkedSpan(first[i$2].marker, null, null)); } } }
    for (var i$3 = 0; i$3 < gap; ++i$3)
      { newMarkers.push(gapMarkers); }
    newMarkers.push(last);
  }
  return newMarkers
}

// Remove spans that are empty and don't have a clearWhenEmpty
// option of false.
function clearEmptySpans(spans) {
  for (var i = 0; i < spans.length; ++i) {
    var span = spans[i];
    if (span.from != null && span.from == span.to && span.marker.clearWhenEmpty !== false)
      { spans.splice(i--, 1); }
  }
  if (!spans.length) { return null }
  return spans
}

// Used to 'clip' out readOnly ranges when making a change.
function removeReadOnlyRanges(doc, from, to) {
  var markers = null;
  doc.iter(from.line, to.line + 1, function (line) {
    if (line.markedSpans) { for (var i = 0; i < line.markedSpans.length; ++i) {
      var mark = line.markedSpans[i].marker;
      if (mark.readOnly && (!markers || indexOf(markers, mark) == -1))
        { (markers || (markers = [])).push(mark); }
    } }
  });
  if (!markers) { return null }
  var parts = [{from: from, to: to}];
  for (var i = 0; i < markers.length; ++i) {
    var mk = markers[i], m = mk.find(0);
    for (var j = 0; j < parts.length; ++j) {
      var p = parts[j];
      if (cmp(p.to, m.from) < 0 || cmp(p.from, m.to) > 0) { continue }
      var newParts = [j, 1], dfrom = cmp(p.from, m.from), dto = cmp(p.to, m.to);
      if (dfrom < 0 || !mk.inclusiveLeft && !dfrom)
        { newParts.push({from: p.from, to: m.from}); }
      if (dto > 0 || !mk.inclusiveRight && !dto)
        { newParts.push({from: m.to, to: p.to}); }
      parts.splice.apply(parts, newParts);
      j += newParts.length - 3;
    }
  }
  return parts
}

// Connect or disconnect spans from a line.
function detachMarkedSpans(line) {
  var spans = line.markedSpans;
  if (!spans) { return }
  for (var i = 0; i < spans.length; ++i)
    { spans[i].marker.detachLine(line); }
  line.markedSpans = null;
}
function attachMarkedSpans(line, spans) {
  if (!spans) { return }
  for (var i = 0; i < spans.length; ++i)
    { spans[i].marker.attachLine(line); }
  line.markedSpans = spans;
}

// Helpers used when computing which overlapping collapsed span
// counts as the larger one.
function extraLeft(marker) { return marker.inclusiveLeft ? -1 : 0 }
function extraRight(marker) { return marker.inclusiveRight ? 1 : 0 }

// Returns a number indicating which of two overlapping collapsed
// spans is larger (and thus includes the other). Falls back to
// comparing ids when the spans cover exactly the same range.
function compareCollapsedMarkers(a, b) {
  var lenDiff = a.lines.length - b.lines.length;
  if (lenDiff != 0) { return lenDiff }
  var aPos = a.find(), bPos = b.find();
  var fromCmp = cmp(aPos.from, bPos.from) || extraLeft(a) - extraLeft(b);
  if (fromCmp) { return -fromCmp }
  var toCmp = cmp(aPos.to, bPos.to) || extraRight(a) - extraRight(b);
  if (toCmp) { return toCmp }
  return b.id - a.id
}

// Find out whether a line ends or starts in a collapsed span. If
// so, return the marker for that span.
function collapsedSpanAtSide(line, start) {
  var sps = sawCollapsedSpans && line.markedSpans, found;
  if (sps) { for (var sp = (void 0), i = 0; i < sps.length; ++i) {
    sp = sps[i];
    if (sp.marker.collapsed && (start ? sp.from : sp.to) == null &&
        (!found || compareCollapsedMarkers(found, sp.marker) < 0))
      { found = sp.marker; }
  } }
  return found
}
function collapsedSpanAtStart(line) { return collapsedSpanAtSide(line, true) }
function collapsedSpanAtEnd(line) { return collapsedSpanAtSide(line, false) }

function collapsedSpanAround(line, ch) {
  var sps = sawCollapsedSpans && line.markedSpans, found;
  if (sps) { for (var i = 0; i < sps.length; ++i) {
    var sp = sps[i];
    if (sp.marker.collapsed && (sp.from == null || sp.from < ch) && (sp.to == null || sp.to > ch) &&
        (!found || compareCollapsedMarkers(found, sp.marker) < 0)) { found = sp.marker; }
  } }
  return found
}

// Test whether there exists a collapsed span that partially
// overlaps (covers the start or end, but not both) of a new span.
// Such overlap is not allowed.
function conflictingCollapsedRange(doc, lineNo$$1, from, to, marker) {
  var line = getLine(doc, lineNo$$1);
  var sps = sawCollapsedSpans && line.markedSpans;
  if (sps) { for (var i = 0; i < sps.length; ++i) {
    var sp = sps[i];
    if (!sp.marker.collapsed) { continue }
    var found = sp.marker.find(0);
    var fromCmp = cmp(found.from, from) || extraLeft(sp.marker) - extraLeft(marker);
    var toCmp = cmp(found.to, to) || extraRight(sp.marker) - extraRight(marker);
    if (fromCmp >= 0 && toCmp <= 0 || fromCmp <= 0 && toCmp >= 0) { continue }
    if (fromCmp <= 0 && (sp.marker.inclusiveRight && marker.inclusiveLeft ? cmp(found.to, from) >= 0 : cmp(found.to, from) > 0) ||
        fromCmp >= 0 && (sp.marker.inclusiveRight && marker.inclusiveLeft ? cmp(found.from, to) <= 0 : cmp(found.from, to) < 0))
      { return true }
  } }
}

// A visual line is a line as drawn on the screen. Folding, for
// example, can cause multiple logical lines to appear on the same
// visual line. This finds the start of the visual line that the
// given line is part of (usually that is the line itself).
function visualLine(line) {
  var merged;
  while (merged = collapsedSpanAtStart(line))
    { line = merged.find(-1, true).line; }
  return line
}

function visualLineEnd(line) {
  var merged;
  while (merged = collapsedSpanAtEnd(line))
    { line = merged.find(1, true).line; }
  return line
}

// Returns an array of logical lines that continue the visual line
// started by the argument, or undefined if there are no such lines.
function visualLineContinued(line) {
  var merged, lines;
  while (merged = collapsedSpanAtEnd(line)) {
    line = merged.find(1, true).line
    ;(lines || (lines = [])).push(line);
  }
  return lines
}

// Get the line number of the start of the visual line that the
// given line number is part of.
function visualLineNo(doc, lineN) {
  var line = getLine(doc, lineN), vis = visualLine(line);
  if (line == vis) { return lineN }
  return lineNo(vis)
}

// Get the line number of the start of the next visual line after
// the given line.
function visualLineEndNo(doc, lineN) {
  if (lineN > doc.lastLine()) { return lineN }
  var line = getLine(doc, lineN), merged;
  if (!lineIsHidden(doc, line)) { return lineN }
  while (merged = collapsedSpanAtEnd(line))
    { line = merged.find(1, true).line; }
  return lineNo(line) + 1
}

// Compute whether a line is hidden. Lines count as hidden when they
// are part of a visual line that starts with another line, or when
// they are entirely covered by collapsed, non-widget span.
function lineIsHidden(doc, line) {
  var sps = sawCollapsedSpans && line.markedSpans;
  if (sps) { for (var sp = (void 0), i = 0; i < sps.length; ++i) {
    sp = sps[i];
    if (!sp.marker.collapsed) { continue }
    if (sp.from == null) { return true }
    if (sp.marker.widgetNode) { continue }
    if (sp.from == 0 && sp.marker.inclusiveLeft && lineIsHiddenInner(doc, line, sp))
      { return true }
  } }
}
function lineIsHiddenInner(doc, line, span) {
  if (span.to == null) {
    var end = span.marker.find(1, true);
    return lineIsHiddenInner(doc, end.line, getMarkedSpanFor(end.line.markedSpans, span.marker))
  }
  if (span.marker.inclusiveRight && span.to == line.text.length)
    { return true }
  for (var sp = (void 0), i = 0; i < line.markedSpans.length; ++i) {
    sp = line.markedSpans[i];
    if (sp.marker.collapsed && !sp.marker.widgetNode && sp.from == span.to &&
        (sp.to == null || sp.to != span.from) &&
        (sp.marker.inclusiveLeft || span.marker.inclusiveRight) &&
        lineIsHiddenInner(doc, line, sp)) { return true }
  }
}

// Find the height above the given line.
function heightAtLine(lineObj) {
  lineObj = visualLine(lineObj);

  var h = 0, chunk = lineObj.parent;
  for (var i = 0; i < chunk.lines.length; ++i) {
    var line = chunk.lines[i];
    if (line == lineObj) { break }
    else { h += line.height; }
  }
  for (var p = chunk.parent; p; chunk = p, p = chunk.parent) {
    for (var i$1 = 0; i$1 < p.children.length; ++i$1) {
      var cur = p.children[i$1];
      if (cur == chunk) { break }
      else { h += cur.height; }
    }
  }
  return h
}

// Compute the character length of a line, taking into account
// collapsed ranges (see markText) that might hide parts, and join
// other lines onto it.
function lineLength(line) {
  if (line.height == 0) { return 0 }
  var len = line.text.length, merged, cur = line;
  while (merged = collapsedSpanAtStart(cur)) {
    var found = merged.find(0, true);
    cur = found.from.line;
    len += found.from.ch - found.to.ch;
  }
  cur = line;
  while (merged = collapsedSpanAtEnd(cur)) {
    var found$1 = merged.find(0, true);
    len -= cur.text.length - found$1.from.ch;
    cur = found$1.to.line;
    len += cur.text.length - found$1.to.ch;
  }
  return len
}

// Find the longest line in the document.
function findMaxLine(cm) {
  var d = cm.display, doc = cm.doc;
  d.maxLine = getLine(doc, doc.first);
  d.maxLineLength = lineLength(d.maxLine);
  d.maxLineChanged = true;
  doc.iter(function (line) {
    var len = lineLength(line);
    if (len > d.maxLineLength) {
      d.maxLineLength = len;
      d.maxLine = line;
    }
  });
}

// BIDI HELPERS

function iterateBidiSections(order, from, to, f) {
  if (!order) { return f(from, to, "ltr", 0) }
  var found = false;
  for (var i = 0; i < order.length; ++i) {
    var part = order[i];
    if (part.from < to && part.to > from || from == to && part.to == from) {
      f(Math.max(part.from, from), Math.min(part.to, to), part.level == 1 ? "rtl" : "ltr", i);
      found = true;
    }
  }
  if (!found) { f(from, to, "ltr"); }
}

var bidiOther = null;
function getBidiPartAt(order, ch, sticky) {
  var found;
  bidiOther = null;
  for (var i = 0; i < order.length; ++i) {
    var cur = order[i];
    if (cur.from < ch && cur.to > ch) { return i }
    if (cur.to == ch) {
      if (cur.from != cur.to && sticky == "before") { found = i; }
      else { bidiOther = i; }
    }
    if (cur.from == ch) {
      if (cur.from != cur.to && sticky != "before") { found = i; }
      else { bidiOther = i; }
    }
  }
  return found != null ? found : bidiOther
}

// Bidirectional ordering algorithm
// See http://unicode.org/reports/tr9/tr9-13.html for the algorithm
// that this (partially) implements.

// One-char codes used for character types:
// L (L):   Left-to-Right
// R (R):   Right-to-Left
// r (AL):  Right-to-Left Arabic
// 1 (EN):  European Number
// + (ES):  European Number Separator
// % (ET):  European Number Terminator
// n (AN):  Arabic Number
// , (CS):  Common Number Separator
// m (NSM): Non-Spacing Mark
// b (BN):  Boundary Neutral
// s (B):   Paragraph Separator
// t (S):   Segment Separator
// w (WS):  Whitespace
// N (ON):  Other Neutrals

// Returns null if characters are ordered as they appear
// (left-to-right), or an array of sections ({from, to, level}
// objects) in the order in which they occur visually.
var bidiOrdering = (function() {
  // Character types for codepoints 0 to 0xff
  var lowTypes = "bbbbbbbbbtstwsbbbbbbbbbbbbbbssstwNN%%%NNNNNN,N,N1111111111NNNNNNNLLLLLLLLLLLLLLLLLLLLLLLLLLNNNNNNLLLLLLLLLLLLLLLLLLLLLLLLLLNNNNbbbbbbsbbbbbbbbbbbbbbbbbbbbbbbbbb,N%%%%NNNNLNNNNN%%11NLNNN1LNNNNNLLLLLLLLLLLLLLLLLLLLLLLNLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLN";
  // Character types for codepoints 0x600 to 0x6f9
  var arabicTypes = "nnnnnnNNr%%r,rNNmmmmmmmmmmmrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrmmmmmmmmmmmmmmmmmmmmmnnnnnnnnnn%nnrrrmrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrmmmmmmmnNmmmmmmrrmmNmmmmrr1111111111";
  function charType(code) {
    if (code <= 0xf7) { return lowTypes.charAt(code) }
    else if (0x590 <= code && code <= 0x5f4) { return "R" }
    else if (0x600 <= code && code <= 0x6f9) { return arabicTypes.charAt(code - 0x600) }
    else if (0x6ee <= code && code <= 0x8ac) { return "r" }
    else if (0x2000 <= code && code <= 0x200b) { return "w" }
    else if (code == 0x200c) { return "b" }
    else { return "L" }
  }

  var bidiRE = /[\u0590-\u05f4\u0600-\u06ff\u0700-\u08ac]/;
  var isNeutral = /[stwN]/, isStrong = /[LRr]/, countsAsLeft = /[Lb1n]/, countsAsNum = /[1n]/;

  function BidiSpan(level, from, to) {
    this.level = level;
    this.from = from; this.to = to;
  }

  return function(str, direction) {
    var outerType = direction == "ltr" ? "L" : "R";

    if (str.length == 0 || direction == "ltr" && !bidiRE.test(str)) { return false }
    var len = str.length, types = [];
    for (var i = 0; i < len; ++i)
      { types.push(charType(str.charCodeAt(i))); }

    // W1. Examine each non-spacing mark (NSM) in the level run, and
    // change the type of the NSM to the type of the previous
    // character. If the NSM is at the start of the level run, it will
    // get the type of sor.
    for (var i$1 = 0, prev = outerType; i$1 < len; ++i$1) {
      var type = types[i$1];
      if (type == "m") { types[i$1] = prev; }
      else { prev = type; }
    }

    // W2. Search backwards from each instance of a European number
    // until the first strong type (R, L, AL, or sor) is found. If an
    // AL is found, change the type of the European number to Arabic
    // number.
    // W3. Change all ALs to R.
    for (var i$2 = 0, cur = outerType; i$2 < len; ++i$2) {
      var type$1 = types[i$2];
      if (type$1 == "1" && cur == "r") { types[i$2] = "n"; }
      else if (isStrong.test(type$1)) { cur = type$1; if (type$1 == "r") { types[i$2] = "R"; } }
    }

    // W4. A single European separator between two European numbers
    // changes to a European number. A single common separator between
    // two numbers of the same type changes to that type.
    for (var i$3 = 1, prev$1 = types[0]; i$3 < len - 1; ++i$3) {
      var type$2 = types[i$3];
      if (type$2 == "+" && prev$1 == "1" && types[i$3+1] == "1") { types[i$3] = "1"; }
      else if (type$2 == "," && prev$1 == types[i$3+1] &&
               (prev$1 == "1" || prev$1 == "n")) { types[i$3] = prev$1; }
      prev$1 = type$2;
    }

    // W5. A sequence of European terminators adjacent to European
    // numbers changes to all European numbers.
    // W6. Otherwise, separators and terminators change to Other
    // Neutral.
    for (var i$4 = 0; i$4 < len; ++i$4) {
      var type$3 = types[i$4];
      if (type$3 == ",") { types[i$4] = "N"; }
      else if (type$3 == "%") {
        var end = (void 0);
        for (end = i$4 + 1; end < len && types[end] == "%"; ++end) {}
        var replace = (i$4 && types[i$4-1] == "!") || (end < len && types[end] == "1") ? "1" : "N";
        for (var j = i$4; j < end; ++j) { types[j] = replace; }
        i$4 = end - 1;
      }
    }

    // W7. Search backwards from each instance of a European number
    // until the first strong type (R, L, or sor) is found. If an L is
    // found, then change the type of the European number to L.
    for (var i$5 = 0, cur$1 = outerType; i$5 < len; ++i$5) {
      var type$4 = types[i$5];
      if (cur$1 == "L" && type$4 == "1") { types[i$5] = "L"; }
      else if (isStrong.test(type$4)) { cur$1 = type$4; }
    }

    // N1. A sequence of neutrals takes the direction of the
    // surrounding strong text if the text on both sides has the same
    // direction. European and Arabic numbers act as if they were R in
    // terms of their influence on neutrals. Start-of-level-run (sor)
    // and end-of-level-run (eor) are used at level run boundaries.
    // N2. Any remaining neutrals take the embedding direction.
    for (var i$6 = 0; i$6 < len; ++i$6) {
      if (isNeutral.test(types[i$6])) {
        var end$1 = (void 0);
        for (end$1 = i$6 + 1; end$1 < len && isNeutral.test(types[end$1]); ++end$1) {}
        var before = (i$6 ? types[i$6-1] : outerType) == "L";
        var after = (end$1 < len ? types[end$1] : outerType) == "L";
        var replace$1 = before == after ? (before ? "L" : "R") : outerType;
        for (var j$1 = i$6; j$1 < end$1; ++j$1) { types[j$1] = replace$1; }
        i$6 = end$1 - 1;
      }
    }

    // Here we depart from the documented algorithm, in order to avoid
    // building up an actual levels array. Since there are only three
    // levels (0, 1, 2) in an implementation that doesn't take
    // explicit embedding into account, we can build up the order on
    // the fly, without following the level-based algorithm.
    var order = [], m;
    for (var i$7 = 0; i$7 < len;) {
      if (countsAsLeft.test(types[i$7])) {
        var start = i$7;
        for (++i$7; i$7 < len && countsAsLeft.test(types[i$7]); ++i$7) {}
        order.push(new BidiSpan(0, start, i$7));
      } else {
        var pos = i$7, at = order.length;
        for (++i$7; i$7 < len && types[i$7] != "L"; ++i$7) {}
        for (var j$2 = pos; j$2 < i$7;) {
          if (countsAsNum.test(types[j$2])) {
            if (pos < j$2) { order.splice(at, 0, new BidiSpan(1, pos, j$2)); }
            var nstart = j$2;
            for (++j$2; j$2 < i$7 && countsAsNum.test(types[j$2]); ++j$2) {}
            order.splice(at, 0, new BidiSpan(2, nstart, j$2));
            pos = j$2;
          } else { ++j$2; }
        }
        if (pos < i$7) { order.splice(at, 0, new BidiSpan(1, pos, i$7)); }
      }
    }
    if (direction == "ltr") {
      if (order[0].level == 1 && (m = str.match(/^\s+/))) {
        order[0].from = m[0].length;
        order.unshift(new BidiSpan(0, 0, m[0].length));
      }
      if (lst(order).level == 1 && (m = str.match(/\s+$/))) {
        lst(order).to -= m[0].length;
        order.push(new BidiSpan(0, len - m[0].length, len));
      }
    }

    return direction == "rtl" ? order.reverse() : order
  }
})();

// Get the bidi ordering for the given line (and cache it). Returns
// false for lines that are fully left-to-right, and an array of
// BidiSpan objects otherwise.
function getOrder(line, direction) {
  var order = line.order;
  if (order == null) { order = line.order = bidiOrdering(line.text, direction); }
  return order
}

// EVENT HANDLING

// Lightweight event framework. on/off also work on DOM nodes,
// registering native DOM handlers.

var noHandlers = [];

var on = function(emitter, type, f) {
  if (emitter.addEventListener) {
    emitter.addEventListener(type, f, false);
  } else if (emitter.attachEvent) {
    emitter.attachEvent("on" + type, f);
  } else {
    var map$$1 = emitter._handlers || (emitter._handlers = {});
    map$$1[type] = (map$$1[type] || noHandlers).concat(f);
  }
};

function getHandlers(emitter, type) {
  return emitter._handlers && emitter._handlers[type] || noHandlers
}

function off(emitter, type, f) {
  if (emitter.removeEventListener) {
    emitter.removeEventListener(type, f, false);
  } else if (emitter.detachEvent) {
    emitter.detachEvent("on" + type, f);
  } else {
    var map$$1 = emitter._handlers, arr = map$$1 && map$$1[type];
    if (arr) {
      var index = indexOf(arr, f);
      if (index > -1)
        { map$$1[type] = arr.slice(0, index).concat(arr.slice(index + 1)); }
    }
  }
}

function signal(emitter, type /*, values...*/) {
  var handlers = getHandlers(emitter, type);
  if (!handlers.length) { return }
  var args = Array.prototype.slice.call(arguments, 2);
  for (var i = 0; i < handlers.length; ++i) { handlers[i].apply(null, args); }
}

// The DOM events that CodeMirror handles can be overridden by
// registering a (non-DOM) handler on the editor for the event name,
// and preventDefault-ing the event in that handler.
function signalDOMEvent(cm, e, override) {
  if (typeof e == "string")
    { e = {type: e, preventDefault: function() { this.defaultPrevented = true; }}; }
  signal(cm, override || e.type, cm, e);
  return e_defaultPrevented(e) || e.codemirrorIgnore
}

function signalCursorActivity(cm) {
  var arr = cm._handlers && cm._handlers.cursorActivity;
  if (!arr) { return }
  var set = cm.curOp.cursorActivityHandlers || (cm.curOp.cursorActivityHandlers = []);
  for (var i = 0; i < arr.length; ++i) { if (indexOf(set, arr[i]) == -1)
    { set.push(arr[i]); } }
}

function hasHandler(emitter, type) {
  return getHandlers(emitter, type).length > 0
}

// Add on and off methods to a constructor's prototype, to make
// registering events on such objects more convenient.
function eventMixin(ctor) {
  ctor.prototype.on = function(type, f) {on(this, type, f);};
  ctor.prototype.off = function(type, f) {off(this, type, f);};
}

// Due to the fact that we still support jurassic IE versions, some
// compatibility wrappers are needed.

function e_preventDefault(e) {
  if (e.preventDefault) { e.preventDefault(); }
  else { e.returnValue = false; }
}
function e_stopPropagation(e) {
  if (e.stopPropagation) { e.stopPropagation(); }
  else { e.cancelBubble = true; }
}
function e_defaultPrevented(e) {
  return e.defaultPrevented != null ? e.defaultPrevented : e.returnValue == false
}
function e_stop(e) {e_preventDefault(e); e_stopPropagation(e);}

function e_target(e) {return e.target || e.srcElement}
function e_button(e) {
  var b = e.which;
  if (b == null) {
    if (e.button & 1) { b = 1; }
    else if (e.button & 2) { b = 3; }
    else if (e.button & 4) { b = 2; }
  }
  if (mac && e.ctrlKey && b == 1) { b = 3; }
  return b
}

// Detect drag-and-drop
var dragAndDrop = function() {
  // There is *some* kind of drag-and-drop support in IE6-8, but I
  // couldn't get it to work yet.
  if (ie && ie_version < 9) { return false }
  var div = elt('div');
  return "draggable" in div || "dragDrop" in div
}();

var zwspSupported;
function zeroWidthElement(measure) {
  if (zwspSupported == null) {
    var test = elt("span", "\u200b");
    removeChildrenAndAdd(measure, elt("span", [test, document.createTextNode("x")]));
    if (measure.firstChild.offsetHeight != 0)
      { zwspSupported = test.offsetWidth <= 1 && test.offsetHeight > 2 && !(ie && ie_version < 8); }
  }
  var node = zwspSupported ? elt("span", "\u200b") :
    elt("span", "\u00a0", null, "display: inline-block; width: 1px; margin-right: -1px");
  node.setAttribute("cm-text", "");
  return node
}

// Feature-detect IE's crummy client rect reporting for bidi text
var badBidiRects;
function hasBadBidiRects(measure) {
  if (badBidiRects != null) { return badBidiRects }
  var txt = removeChildrenAndAdd(measure, document.createTextNode("A\u062eA"));
  var r0 = range(txt, 0, 1).getBoundingClientRect();
  var r1 = range(txt, 1, 2).getBoundingClientRect();
  removeChildren(measure);
  if (!r0 || r0.left == r0.right) { return false } // Safari returns null in some cases (#2780)
  return badBidiRects = (r1.right - r0.right < 3)
}

// See if "".split is the broken IE version, if so, provide an
// alternative way to split lines.
var splitLinesAuto = "\n\nb".split(/\n/).length != 3 ? function (string) {
  var pos = 0, result = [], l = string.length;
  while (pos <= l) {
    var nl = string.indexOf("\n", pos);
    if (nl == -1) { nl = string.length; }
    var line = string.slice(pos, string.charAt(nl - 1) == "\r" ? nl - 1 : nl);
    var rt = line.indexOf("\r");
    if (rt != -1) {
      result.push(line.slice(0, rt));
      pos += rt + 1;
    } else {
      result.push(line);
      pos = nl + 1;
    }
  }
  return result
} : function (string) { return string.split(/\r\n?|\n/); };

var hasSelection = window.getSelection ? function (te) {
  try { return te.selectionStart != te.selectionEnd }
  catch(e) { return false }
} : function (te) {
  var range$$1;
  try {range$$1 = te.ownerDocument.selection.createRange();}
  catch(e) {}
  if (!range$$1 || range$$1.parentElement() != te) { return false }
  return range$$1.compareEndPoints("StartToEnd", range$$1) != 0
};

var hasCopyEvent = (function () {
  var e = elt("div");
  if ("oncopy" in e) { return true }
  e.setAttribute("oncopy", "return;");
  return typeof e.oncopy == "function"
})();

var badZoomedRects = null;
function hasBadZoomedRects(measure) {
  if (badZoomedRects != null) { return badZoomedRects }
  var node = removeChildrenAndAdd(measure, elt("span", "x"));
  var normal = node.getBoundingClientRect();
  var fromRange = range(node, 0, 1).getBoundingClientRect();
  return badZoomedRects = Math.abs(normal.left - fromRange.left) > 1
}

// Known modes, by name and by MIME
var modes = {};
var mimeModes = {};

// Extra arguments are stored as the mode's dependencies, which is
// used by (legacy) mechanisms like loadmode.js to automatically
// load a mode. (Preferred mechanism is the require/define calls.)
function defineMode(name, mode) {
  if (arguments.length > 2)
    { mode.dependencies = Array.prototype.slice.call(arguments, 2); }
  modes[name] = mode;
}

function defineMIME(mime, spec) {
  mimeModes[mime] = spec;
}

// Given a MIME type, a {name, ...options} config object, or a name
// string, return a mode config object.
function resolveMode(spec) {
  if (typeof spec == "string" && mimeModes.hasOwnProperty(spec)) {
    spec = mimeModes[spec];
  } else if (spec && typeof spec.name == "string" && mimeModes.hasOwnProperty(spec.name)) {
    var found = mimeModes[spec.name];
    if (typeof found == "string") { found = {name: found}; }
    spec = createObj(found, spec);
    spec.name = found.name;
  } else if (typeof spec == "string" && /^[\w\-]+\/[\w\-]+\+xml$/.test(spec)) {
    return resolveMode("application/xml")
  } else if (typeof spec == "string" && /^[\w\-]+\/[\w\-]+\+json$/.test(spec)) {
    return resolveMode("application/json")
  }
  if (typeof spec == "string") { return {name: spec} }
  else { return spec || {name: "null"} }
}

// Given a mode spec (anything that resolveMode accepts), find and
// initialize an actual mode object.
function getMode(options, spec) {
  spec = resolveMode(spec);
  var mfactory = modes[spec.name];
  if (!mfactory) { return getMode(options, "text/plain") }
  var modeObj = mfactory(options, spec);
  if (modeExtensions.hasOwnProperty(spec.name)) {
    var exts = modeExtensions[spec.name];
    for (var prop in exts) {
      if (!exts.hasOwnProperty(prop)) { continue }
      if (modeObj.hasOwnProperty(prop)) { modeObj["_" + prop] = modeObj[prop]; }
      modeObj[prop] = exts[prop];
    }
  }
  modeObj.name = spec.name;
  if (spec.helperType) { modeObj.helperType = spec.helperType; }
  if (spec.modeProps) { for (var prop$1 in spec.modeProps)
    { modeObj[prop$1] = spec.modeProps[prop$1]; } }

  return modeObj
}

// This can be used to attach properties to mode objects from
// outside the actual mode definition.
var modeExtensions = {};
function extendMode(mode, properties) {
  var exts = modeExtensions.hasOwnProperty(mode) ? modeExtensions[mode] : (modeExtensions[mode] = {});
  copyObj(properties, exts);
}

function copyState(mode, state) {
  if (state === true) { return state }
  if (mode.copyState) { return mode.copyState(state) }
  var nstate = {};
  for (var n in state) {
    var val = state[n];
    if (val instanceof Array) { val = val.concat([]); }
    nstate[n] = val;
  }
  return nstate
}

// Given a mode and a state (for that mode), find the inner mode and
// state at the position that the state refers to.
function innerMode(mode, state) {
  var info;
  while (mode.innerMode) {
    info = mode.innerMode(state);
    if (!info || info.mode == mode) { break }
    state = info.state;
    mode = info.mode;
  }
  return info || {mode: mode, state: state}
}

function startState(mode, a1, a2) {
  return mode.startState ? mode.startState(a1, a2) : true
}

// STRING STREAM

// Fed to the mode parsers, provides helper functions to make
// parsers more succinct.

var StringStream = function(string, tabSize, lineOracle) {
  this.pos = this.start = 0;
  this.string = string;
  this.tabSize = tabSize || 8;
  this.lastColumnPos = this.lastColumnValue = 0;
  this.lineStart = 0;
  this.lineOracle = lineOracle;
};

StringStream.prototype.eol = function () {return this.pos >= this.string.length};
StringStream.prototype.sol = function () {return this.pos == this.lineStart};
StringStream.prototype.peek = function () {return this.string.charAt(this.pos) || undefined};
StringStream.prototype.next = function () {
  if (this.pos < this.string.length)
    { return this.string.charAt(this.pos++) }
};
StringStream.prototype.eat = function (match) {
  var ch = this.string.charAt(this.pos);
  var ok;
  if (typeof match == "string") { ok = ch == match; }
  else { ok = ch && (match.test ? match.test(ch) : match(ch)); }
  if (ok) {++this.pos; return ch}
};
StringStream.prototype.eatWhile = function (match) {
  var start = this.pos;
  while (this.eat(match)){}
  return this.pos > start
};
StringStream.prototype.eatSpace = function () {
    var this$1 = this;

  var start = this.pos;
  while (/[\s\u00a0]/.test(this.string.charAt(this.pos))) { ++this$1.pos; }
  return this.pos > start
};
StringStream.prototype.skipToEnd = function () {this.pos = this.string.length;};
StringStream.prototype.skipTo = function (ch) {
  var found = this.string.indexOf(ch, this.pos);
  if (found > -1) {this.pos = found; return true}
};
StringStream.prototype.backUp = function (n) {this.pos -= n;};
StringStream.prototype.column = function () {
  if (this.lastColumnPos < this.start) {
    this.lastColumnValue = countColumn(this.string, this.start, this.tabSize, this.lastColumnPos, this.lastColumnValue);
    this.lastColumnPos = this.start;
  }
  return this.lastColumnValue - (this.lineStart ? countColumn(this.string, this.lineStart, this.tabSize) : 0)
};
StringStream.prototype.indentation = function () {
  return countColumn(this.string, null, this.tabSize) -
    (this.lineStart ? countColumn(this.string, this.lineStart, this.tabSize) : 0)
};
StringStream.prototype.match = function (pattern, consume, caseInsensitive) {
  if (typeof pattern == "string") {
    var cased = function (str) { return caseInsensitive ? str.toLowerCase() : str; };
    var substr = this.string.substr(this.pos, pattern.length);
    if (cased(substr) == cased(pattern)) {
      if (consume !== false) { this.pos += pattern.length; }
      return true
    }
  } else {
    var match = this.string.slice(this.pos).match(pattern);
    if (match && match.index > 0) { return null }
    if (match && consume !== false) { this.pos += match[0].length; }
    return match
  }
};
StringStream.prototype.current = function (){return this.string.slice(this.start, this.pos)};
StringStream.prototype.hideFirstChars = function (n, inner) {
  this.lineStart += n;
  try { return inner() }
  finally { this.lineStart -= n; }
};
StringStream.prototype.lookAhead = function (n) {
  var oracle = this.lineOracle;
  return oracle && oracle.lookAhead(n)
};
StringStream.prototype.baseToken = function () {
  var oracle = this.lineOracle;
  return oracle && oracle.baseToken(this.pos)
};

var SavedContext = function(state, lookAhead) {
  this.state = state;
  this.lookAhead = lookAhead;
};

var Context = function(doc, state, line, lookAhead) {
  this.state = state;
  this.doc = doc;
  this.line = line;
  this.maxLookAhead = lookAhead || 0;
  this.baseTokens = null;
  this.baseTokenPos = 1;
};

Context.prototype.lookAhead = function (n) {
  var line = this.doc.getLine(this.line + n);
  if (line != null && n > this.maxLookAhead) { this.maxLookAhead = n; }
  return line
};

Context.prototype.baseToken = function (n) {
    var this$1 = this;

  if (!this.baseTokens) { return null }
  while (this.baseTokens[this.baseTokenPos] <= n)
    { this$1.baseTokenPos += 2; }
  var type = this.baseTokens[this.baseTokenPos + 1];
  return {type: type && type.replace(/( |^)overlay .*/, ""),
          size: this.baseTokens[this.baseTokenPos] - n}
};

Context.prototype.nextLine = function () {
  this.line++;
  if (this.maxLookAhead > 0) { this.maxLookAhead--; }
};

Context.fromSaved = function (doc, saved, line) {
  if (saved instanceof SavedContext)
    { return new Context(doc, copyState(doc.mode, saved.state), line, saved.lookAhead) }
  else
    { return new Context(doc, copyState(doc.mode, saved), line) }
};

Context.prototype.save = function (copy) {
  var state = copy !== false ? copyState(this.doc.mode, this.state) : this.state;
  return this.maxLookAhead > 0 ? new SavedContext(state, this.maxLookAhead) : state
};


// Compute a style array (an array starting with a mode generation
// -- for invalidation -- followed by pairs of end positions and
// style strings), which is used to highlight the tokens on the
// line.
function highlightLine(cm, line, context, forceToEnd) {
  // A styles array always starts with a number identifying the
  // mode/overlays that it is based on (for easy invalidation).
  var st = [cm.state.modeGen], lineClasses = {};
  // Compute the base array of styles
  runMode(cm, line.text, cm.doc.mode, context, function (end, style) { return st.push(end, style); },
          lineClasses, forceToEnd);
  var state = context.state;

  // Run overlays, adjust style array.
  var loop = function ( o ) {
    context.baseTokens = st;
    var overlay = cm.state.overlays[o], i = 1, at = 0;
    context.state = true;
    runMode(cm, line.text, overlay.mode, context, function (end, style) {
      var start = i;
      // Ensure there's a token end at the current position, and that i points at it
      while (at < end) {
        var i_end = st[i];
        if (i_end > end)
          { st.splice(i, 1, end, st[i+1], i_end); }
        i += 2;
        at = Math.min(end, i_end);
      }
      if (!style) { return }
      if (overlay.opaque) {
        st.splice(start, i - start, end, "overlay " + style);
        i = start + 2;
      } else {
        for (; start < i; start += 2) {
          var cur = st[start+1];
          st[start+1] = (cur ? cur + " " : "") + "overlay " + style;
        }
      }
    }, lineClasses);
    context.state = state;
    context.baseTokens = null;
    context.baseTokenPos = 1;
  };

  for (var o = 0; o < cm.state.overlays.length; ++o) loop( o );

  return {styles: st, classes: lineClasses.bgClass || lineClasses.textClass ? lineClasses : null}
}

function getLineStyles(cm, line, updateFrontier) {
  if (!line.styles || line.styles[0] != cm.state.modeGen) {
    var context = getContextBefore(cm, lineNo(line));
    var resetState = line.text.length > cm.options.maxHighlightLength && copyState(cm.doc.mode, context.state);
    var result = highlightLine(cm, line, context);
    if (resetState) { context.state = resetState; }
    line.stateAfter = context.save(!resetState);
    line.styles = result.styles;
    if (result.classes) { line.styleClasses = result.classes; }
    else if (line.styleClasses) { line.styleClasses = null; }
    if (updateFrontier === cm.doc.highlightFrontier)
      { cm.doc.modeFrontier = Math.max(cm.doc.modeFrontier, ++cm.doc.highlightFrontier); }
  }
  return line.styles
}

function getContextBefore(cm, n, precise) {
  var doc = cm.doc, display = cm.display;
  if (!doc.mode.startState) { return new Context(doc, true, n) }
  var start = findStartLine(cm, n, precise);
  var saved = start > doc.first && getLine(doc, start - 1).stateAfter;
  var context = saved ? Context.fromSaved(doc, saved, start) : new Context(doc, startState(doc.mode), start);

  doc.iter(start, n, function (line) {
    processLine(cm, line.text, context);
    var pos = context.line;
    line.stateAfter = pos == n - 1 || pos % 5 == 0 || pos >= display.viewFrom && pos < display.viewTo ? context.save() : null;
    context.nextLine();
  });
  if (precise) { doc.modeFrontier = context.line; }
  return context
}

// Lightweight form of highlight -- proceed over this line and
// update state, but don't save a style array. Used for lines that
// aren't currently visible.
function processLine(cm, text, context, startAt) {
  var mode = cm.doc.mode;
  var stream = new StringStream(text, cm.options.tabSize, context);
  stream.start = stream.pos = startAt || 0;
  if (text == "") { callBlankLine(mode, context.state); }
  while (!stream.eol()) {
    readToken(mode, stream, context.state);
    stream.start = stream.pos;
  }
}

function callBlankLine(mode, state) {
  if (mode.blankLine) { return mode.blankLine(state) }
  if (!mode.innerMode) { return }
  var inner = innerMode(mode, state);
  if (inner.mode.blankLine) { return inner.mode.blankLine(inner.state) }
}

function readToken(mode, stream, state, inner) {
  for (var i = 0; i < 10; i++) {
    if (inner) { inner[0] = innerMode(mode, state).mode; }
    var style = mode.token(stream, state);
    if (stream.pos > stream.start) { return style }
  }
  throw new Error("Mode " + mode.name + " failed to advance stream.")
}

var Token = function(stream, type, state) {
  this.start = stream.start; this.end = stream.pos;
  this.string = stream.current();
  this.type = type || null;
  this.state = state;
};

// Utility for getTokenAt and getLineTokens
function takeToken(cm, pos, precise, asArray) {
  var doc = cm.doc, mode = doc.mode, style;
  pos = clipPos(doc, pos);
  var line = getLine(doc, pos.line), context = getContextBefore(cm, pos.line, precise);
  var stream = new StringStream(line.text, cm.options.tabSize, context), tokens;
  if (asArray) { tokens = []; }
  while ((asArray || stream.pos < pos.ch) && !stream.eol()) {
    stream.start = stream.pos;
    style = readToken(mode, stream, context.state);
    if (asArray) { tokens.push(new Token(stream, style, copyState(doc.mode, context.state))); }
  }
  return asArray ? tokens : new Token(stream, style, context.state)
}

function extractLineClasses(type, output) {
  if (type) { for (;;) {
    var lineClass = type.match(/(?:^|\s+)line-(background-)?(\S+)/);
    if (!lineClass) { break }
    type = type.slice(0, lineClass.index) + type.slice(lineClass.index + lineClass[0].length);
    var prop = lineClass[1] ? "bgClass" : "textClass";
    if (output[prop] == null)
      { output[prop] = lineClass[2]; }
    else if (!(new RegExp("(?:^|\s)" + lineClass[2] + "(?:$|\s)")).test(output[prop]))
      { output[prop] += " " + lineClass[2]; }
  } }
  return type
}

// Run the given mode's parser over a line, calling f for each token.
function runMode(cm, text, mode, context, f, lineClasses, forceToEnd) {
  var flattenSpans = mode.flattenSpans;
  if (flattenSpans == null) { flattenSpans = cm.options.flattenSpans; }
  var curStart = 0, curStyle = null;
  var stream = new StringStream(text, cm.options.tabSize, context), style;
  var inner = cm.options.addModeClass && [null];
  if (text == "") { extractLineClasses(callBlankLine(mode, context.state), lineClasses); }
  while (!stream.eol()) {
    if (stream.pos > cm.options.maxHighlightLength) {
      flattenSpans = false;
      if (forceToEnd) { processLine(cm, text, context, stream.pos); }
      stream.pos = text.length;
      style = null;
    } else {
      style = extractLineClasses(readToken(mode, stream, context.state, inner), lineClasses);
    }
    if (inner) {
      var mName = inner[0].name;
      if (mName) { style = "m-" + (style ? mName + " " + style : mName); }
    }
    if (!flattenSpans || curStyle != style) {
      while (curStart < stream.start) {
        curStart = Math.min(stream.start, curStart + 5000);
        f(curStart, curStyle);
      }
      curStyle = style;
    }
    stream.start = stream.pos;
  }
  while (curStart < stream.pos) {
    // Webkit seems to refuse to render text nodes longer than 57444
    // characters, and returns inaccurate measurements in nodes
    // starting around 5000 chars.
    var pos = Math.min(stream.pos, curStart + 5000);
    f(pos, curStyle);
    curStart = pos;
  }
}

// Finds the line to start with when starting a parse. Tries to
// find a line with a stateAfter, so that it can start with a
// valid state. If that fails, it returns the line with the
// smallest indentation, which tends to need the least context to
// parse correctly.
function findStartLine(cm, n, precise) {
  var minindent, minline, doc = cm.doc;
  var lim = precise ? -1 : n - (cm.doc.mode.innerMode ? 1000 : 100);
  for (var search = n; search > lim; --search) {
    if (search <= doc.first) { return doc.first }
    var line = getLine(doc, search - 1), after = line.stateAfter;
    if (after && (!precise || search + (after instanceof SavedContext ? after.lookAhead : 0) <= doc.modeFrontier))
      { return search }
    var indented = countColumn(line.text, null, cm.options.tabSize);
    if (minline == null || minindent > indented) {
      minline = search - 1;
      minindent = indented;
    }
  }
  return minline
}

function retreatFrontier(doc, n) {
  doc.modeFrontier = Math.min(doc.modeFrontier, n);
  if (doc.highlightFrontier < n - 10) { return }
  var start = doc.first;
  for (var line = n - 1; line > start; line--) {
    var saved = getLine(doc, line).stateAfter;
    // change is on 3
    // state on line 1 looked ahead 2 -- so saw 3
    // test 1 + 2 < 3 should cover this
    if (saved && (!(saved instanceof SavedContext) || line + saved.lookAhead < n)) {
      start = line + 1;
      break
    }
  }
  doc.highlightFrontier = Math.min(doc.highlightFrontier, start);
}

// LINE DATA STRUCTURE

// Line objects. These hold state related to a line, including
// highlighting info (the styles array).
var Line = function(text, markedSpans, estimateHeight) {
  this.text = text;
  attachMarkedSpans(this, markedSpans);
  this.height = estimateHeight ? estimateHeight(this) : 1;
};

Line.prototype.lineNo = function () { return lineNo(this) };
eventMixin(Line);

// Change the content (text, markers) of a line. Automatically
// invalidates cached information and tries to re-estimate the
// line's height.
function updateLine(line, text, markedSpans, estimateHeight) {
  line.text = text;
  if (line.stateAfter) { line.stateAfter = null; }
  if (line.styles) { line.styles = null; }
  if (line.order != null) { line.order = null; }
  detachMarkedSpans(line);
  attachMarkedSpans(line, markedSpans);
  var estHeight = estimateHeight ? estimateHeight(line) : 1;
  if (estHeight != line.height) { updateLineHeight(line, estHeight); }
}

// Detach a line from the document tree and its markers.
function cleanUpLine(line) {
  line.parent = null;
  detachMarkedSpans(line);
}

// Convert a style as returned by a mode (either null, or a string
// containing one or more styles) to a CSS style. This is cached,
// and also looks for line-wide styles.
var styleToClassCache = {};
var styleToClassCacheWithMode = {};
function interpretTokenStyle(style, options) {
  if (!style || /^\s*$/.test(style)) { return null }
  var cache = options.addModeClass ? styleToClassCacheWithMode : styleToClassCache;
  return cache[style] ||
    (cache[style] = style.replace(/\S+/g, "cm-$&"))
}

// Render the DOM representation of the text of a line. Also builds
// up a 'line map', which points at the DOM nodes that represent
// specific stretches of text, and is used by the measuring code.
// The returned object contains the DOM node, this map, and
// information about line-wide styles that were set by the mode.
function buildLineContent(cm, lineView) {
  // The padding-right forces the element to have a 'border', which
  // is needed on Webkit to be able to get line-level bounding
  // rectangles for it (in measureChar).
  var content = eltP("span", null, null, webkit ? "padding-right: .1px" : null);
  var builder = {pre: eltP("pre", [content], "CodeMirror-line"), content: content,
                 col: 0, pos: 0, cm: cm,
                 trailingSpace: false,
                 splitSpaces: (ie || webkit) && cm.getOption("lineWrapping")};
  lineView.measure = {};

  // Iterate over the logical lines that make up this visual line.
  for (var i = 0; i <= (lineView.rest ? lineView.rest.length : 0); i++) {
    var line = i ? lineView.rest[i - 1] : lineView.line, order = (void 0);
    builder.pos = 0;
    builder.addToken = buildToken;
    // Optionally wire in some hacks into the token-rendering
    // algorithm, to deal with browser quirks.
    if (hasBadBidiRects(cm.display.measure) && (order = getOrder(line, cm.doc.direction)))
      { builder.addToken = buildTokenBadBidi(builder.addToken, order); }
    builder.map = [];
    var allowFrontierUpdate = lineView != cm.display.externalMeasured && lineNo(line);
    insertLineContent(line, builder, getLineStyles(cm, line, allowFrontierUpdate));
    if (line.styleClasses) {
      if (line.styleClasses.bgClass)
        { builder.bgClass = joinClasses(line.styleClasses.bgClass, builder.bgClass || ""); }
      if (line.styleClasses.textClass)
        { builder.textClass = joinClasses(line.styleClasses.textClass, builder.textClass || ""); }
    }

    // Ensure at least a single node is present, for measuring.
    if (builder.map.length == 0)
      { builder.map.push(0, 0, builder.content.appendChild(zeroWidthElement(cm.display.measure))); }

    // Store the map and a cache object for the current logical line
    if (i == 0) {
      lineView.measure.map = builder.map;
      lineView.measure.cache = {};
    } else {
      (lineView.measure.maps || (lineView.measure.maps = [])).push(builder.map)
      ;(lineView.measure.caches || (lineView.measure.caches = [])).push({});
    }
  }

  // See issue #2901
  if (webkit) {
    var last = builder.content.lastChild;
    if (/\bcm-tab\b/.test(last.className) || (last.querySelector && last.querySelector(".cm-tab")))
      { builder.content.className = "cm-tab-wrap-hack"; }
  }

  signal(cm, "renderLine", cm, lineView.line, builder.pre);
  if (builder.pre.className)
    { builder.textClass = joinClasses(builder.pre.className, builder.textClass || ""); }

  return builder
}

function defaultSpecialCharPlaceholder(ch) {
  var token = elt("span", "\u2022", "cm-invalidchar");
  token.title = "\\u" + ch.charCodeAt(0).toString(16);
  token.setAttribute("aria-label", token.title);
  return token
}

// Build up the DOM representation for a single token, and add it to
// the line map. Takes care to render special characters separately.
function buildToken(builder, text, style, startStyle, endStyle, title, css) {
  if (!text) { return }
  var displayText = builder.splitSpaces ? splitSpaces(text, builder.trailingSpace) : text;
  var special = builder.cm.state.specialChars, mustWrap = false;
  var content;
  if (!special.test(text)) {
    builder.col += text.length;
    content = document.createTextNode(displayText);
    builder.map.push(builder.pos, builder.pos + text.length, content);
    if (ie && ie_version < 9) { mustWrap = true; }
    builder.pos += text.length;
  } else {
    content = document.createDocumentFragment();
    var pos = 0;
    while (true) {
      special.lastIndex = pos;
      var m = special.exec(text);
      var skipped = m ? m.index - pos : text.length - pos;
      if (skipped) {
        var txt = document.createTextNode(displayText.slice(pos, pos + skipped));
        if (ie && ie_version < 9) { content.appendChild(elt("span", [txt])); }
        else { content.appendChild(txt); }
        builder.map.push(builder.pos, builder.pos + skipped, txt);
        builder.col += skipped;
        builder.pos += skipped;
      }
      if (!m) { break }
      pos += skipped + 1;
      var txt$1 = (void 0);
      if (m[0] == "\t") {
        var tabSize = builder.cm.options.tabSize, tabWidth = tabSize - builder.col % tabSize;
        txt$1 = content.appendChild(elt("span", spaceStr(tabWidth), "cm-tab"));
        txt$1.setAttribute("role", "presentation");
        txt$1.setAttribute("cm-text", "\t");
        builder.col += tabWidth;
      } else if (m[0] == "\r" || m[0] == "\n") {
        txt$1 = content.appendChild(elt("span", m[0] == "\r" ? "\u240d" : "\u2424", "cm-invalidchar"));
        txt$1.setAttribute("cm-text", m[0]);
        builder.col += 1;
      } else {
        txt$1 = builder.cm.options.specialCharPlaceholder(m[0]);
        txt$1.setAttribute("cm-text", m[0]);
        if (ie && ie_version < 9) { content.appendChild(elt("span", [txt$1])); }
        else { content.appendChild(txt$1); }
        builder.col += 1;
      }
      builder.map.push(builder.pos, builder.pos + 1, txt$1);
      builder.pos++;
    }
  }
  builder.trailingSpace = displayText.charCodeAt(text.length - 1) == 32;
  if (style || startStyle || endStyle || mustWrap || css) {
    var fullStyle = style || "";
    if (startStyle) { fullStyle += startStyle; }
    if (endStyle) { fullStyle += endStyle; }
    var token = elt("span", [content], fullStyle, css);
    if (title) { token.title = title; }
    return builder.content.appendChild(token)
  }
  builder.content.appendChild(content);
}

function splitSpaces(text, trailingBefore) {
  if (text.length > 1 && !/  /.test(text)) { return text }
  var spaceBefore = trailingBefore, result = "";
  for (var i = 0; i < text.length; i++) {
    var ch = text.charAt(i);
    if (ch == " " && spaceBefore && (i == text.length - 1 || text.charCodeAt(i + 1) == 32))
      { ch = "\u00a0"; }
    result += ch;
    spaceBefore = ch == " ";
  }
  return result
}

// Work around nonsense dimensions being reported for stretches of
// right-to-left text.
function buildTokenBadBidi(inner, order) {
  return function (builder, text, style, startStyle, endStyle, title, css) {
    style = style ? style + " cm-force-border" : "cm-force-border";
    var start = builder.pos, end = start + text.length;
    for (;;) {
      // Find the part that overlaps with the start of this text
      var part = (void 0);
      for (var i = 0; i < order.length; i++) {
        part = order[i];
        if (part.to > start && part.from <= start) { break }
      }
      if (part.to >= end) { return inner(builder, text, style, startStyle, endStyle, title, css) }
      inner(builder, text.slice(0, part.to - start), style, startStyle, null, title, css);
      startStyle = null;
      text = text.slice(part.to - start);
      start = part.to;
    }
  }
}

function buildCollapsedSpan(builder, size, marker, ignoreWidget) {
  var widget = !ignoreWidget && marker.widgetNode;
  if (widget) { builder.map.push(builder.pos, builder.pos + size, widget); }
  if (!ignoreWidget && builder.cm.display.input.needsContentAttribute) {
    if (!widget)
      { widget = builder.content.appendChild(document.createElement("span")); }
    widget.setAttribute("cm-marker", marker.id);
  }
  if (widget) {
    builder.cm.display.input.setUneditable(widget);
    builder.content.appendChild(widget);
  }
  builder.pos += size;
  builder.trailingSpace = false;
}

// Outputs a number of spans to make up a line, taking highlighting
// and marked text into account.
function insertLineContent(line, builder, styles) {
  var spans = line.markedSpans, allText = line.text, at = 0;
  if (!spans) {
    for (var i$1 = 1; i$1 < styles.length; i$1+=2)
      { builder.addToken(builder, allText.slice(at, at = styles[i$1]), interpretTokenStyle(styles[i$1+1], builder.cm.options)); }
    return
  }

  var len = allText.length, pos = 0, i = 1, text = "", style, css;
  var nextChange = 0, spanStyle, spanEndStyle, spanStartStyle, title, collapsed;
  for (;;) {
    if (nextChange == pos) { // Update current marker set
      spanStyle = spanEndStyle = spanStartStyle = title = css = "";
      collapsed = null; nextChange = Infinity;
      var foundBookmarks = [], endStyles = (void 0);
      for (var j = 0; j < spans.length; ++j) {
        var sp = spans[j], m = sp.marker;
        if (m.type == "bookmark" && sp.from == pos && m.widgetNode) {
          foundBookmarks.push(m);
        } else if (sp.from <= pos && (sp.to == null || sp.to > pos || m.collapsed && sp.to == pos && sp.from == pos)) {
          if (sp.to != null && sp.to != pos && nextChange > sp.to) {
            nextChange = sp.to;
            spanEndStyle = "";
          }
          if (m.className) { spanStyle += " " + m.className; }
          if (m.css) { css = (css ? css + ";" : "") + m.css; }
          if (m.startStyle && sp.from == pos) { spanStartStyle += " " + m.startStyle; }
          if (m.endStyle && sp.to == nextChange) { (endStyles || (endStyles = [])).push(m.endStyle, sp.to); }
          if (m.title && !title) { title = m.title; }
          if (m.collapsed && (!collapsed || compareCollapsedMarkers(collapsed.marker, m) < 0))
            { collapsed = sp; }
        } else if (sp.from > pos && nextChange > sp.from) {
          nextChange = sp.from;
        }
      }
      if (endStyles) { for (var j$1 = 0; j$1 < endStyles.length; j$1 += 2)
        { if (endStyles[j$1 + 1] == nextChange) { spanEndStyle += " " + endStyles[j$1]; } } }

      if (!collapsed || collapsed.from == pos) { for (var j$2 = 0; j$2 < foundBookmarks.length; ++j$2)
        { buildCollapsedSpan(builder, 0, foundBookmarks[j$2]); } }
      if (collapsed && (collapsed.from || 0) == pos) {
        buildCollapsedSpan(builder, (collapsed.to == null ? len + 1 : collapsed.to) - pos,
                           collapsed.marker, collapsed.from == null);
        if (collapsed.to == null) { return }
        if (collapsed.to == pos) { collapsed = false; }
      }
    }
    if (pos >= len) { break }

    var upto = Math.min(len, nextChange);
    while (true) {
      if (text) {
        var end = pos + text.length;
        if (!collapsed) {
          var tokenText = end > upto ? text.slice(0, upto - pos) : text;
          builder.addToken(builder, tokenText, style ? style + spanStyle : spanStyle,
                           spanStartStyle, pos + tokenText.length == nextChange ? spanEndStyle : "", title, css);
        }
        if (end >= upto) {text = text.slice(upto - pos); pos = upto; break}
        pos = end;
        spanStartStyle = "";
      }
      text = allText.slice(at, at = styles[i++]);
      style = interpretTokenStyle(styles[i++], builder.cm.options);
    }
  }
}


// These objects are used to represent the visible (currently drawn)
// part of the document. A LineView may correspond to multiple
// logical lines, if those are connected by collapsed ranges.
function LineView(doc, line, lineN) {
  // The starting line
  this.line = line;
  // Continuing lines, if any
  this.rest = visualLineContinued(line);
  // Number of logical lines in this visual line
  this.size = this.rest ? lineNo(lst(this.rest)) - lineN + 1 : 1;
  this.node = this.text = null;
  this.hidden = lineIsHidden(doc, line);
}

// Create a range of LineView objects for the given lines.
function buildViewArray(cm, from, to) {
  var array = [], nextPos;
  for (var pos = from; pos < to; pos = nextPos) {
    var view = new LineView(cm.doc, getLine(cm.doc, pos), pos);
    nextPos = pos + view.size;
    array.push(view);
  }
  return array
}

var operationGroup = null;

function pushOperation(op) {
  if (operationGroup) {
    operationGroup.ops.push(op);
  } else {
    op.ownsGroup = operationGroup = {
      ops: [op],
      delayedCallbacks: []
    };
  }
}

function fireCallbacksForOps(group) {
  // Calls delayed callbacks and cursorActivity handlers until no
  // new ones appear
  var callbacks = group.delayedCallbacks, i = 0;
  do {
    for (; i < callbacks.length; i++)
      { callbacks[i].call(null); }
    for (var j = 0; j < group.ops.length; j++) {
      var op = group.ops[j];
      if (op.cursorActivityHandlers)
        { while (op.cursorActivityCalled < op.cursorActivityHandlers.length)
          { op.cursorActivityHandlers[op.cursorActivityCalled++].call(null, op.cm); } }
    }
  } while (i < callbacks.length)
}

function finishOperation(op, endCb) {
  var group = op.ownsGroup;
  if (!group) { return }

  try { fireCallbacksForOps(group); }
  finally {
    operationGroup = null;
    endCb(group);
  }
}

var orphanDelayedCallbacks = null;

// Often, we want to signal events at a point where we are in the
// middle of some work, but don't want the handler to start calling
// other methods on the editor, which might be in an inconsistent
// state or simply not expect any other events to happen.
// signalLater looks whether there are any handlers, and schedules
// them to be executed when the last operation ends, or, if no
// operation is active, when a timeout fires.
function signalLater(emitter, type /*, values...*/) {
  var arr = getHandlers(emitter, type);
  if (!arr.length) { return }
  var args = Array.prototype.slice.call(arguments, 2), list;
  if (operationGroup) {
    list = operationGroup.delayedCallbacks;
  } else if (orphanDelayedCallbacks) {
    list = orphanDelayedCallbacks;
  } else {
    list = orphanDelayedCallbacks = [];
    setTimeout(fireOrphanDelayed, 0);
  }
  var loop = function ( i ) {
    list.push(function () { return arr[i].apply(null, args); });
  };

  for (var i = 0; i < arr.length; ++i)
    loop( i );
}

function fireOrphanDelayed() {
  var delayed = orphanDelayedCallbacks;
  orphanDelayedCallbacks = null;
  for (var i = 0; i < delayed.length; ++i) { delayed[i](); }
}

// When an aspect of a line changes, a string is added to
// lineView.changes. This updates the relevant part of the line's
// DOM structure.
function updateLineForChanges(cm, lineView, lineN, dims) {
  for (var j = 0; j < lineView.changes.length; j++) {
    var type = lineView.changes[j];
    if (type == "text") { updateLineText(cm, lineView); }
    else if (type == "gutter") { updateLineGutter(cm, lineView, lineN, dims); }
    else if (type == "class") { updateLineClasses(cm, lineView); }
    else if (type == "widget") { updateLineWidgets(cm, lineView, dims); }
  }
  lineView.changes = null;
}

// Lines with gutter elements, widgets or a background class need to
// be wrapped, and have the extra elements added to the wrapper div
function ensureLineWrapped(lineView) {
  if (lineView.node == lineView.text) {
    lineView.node = elt("div", null, null, "position: relative");
    if (lineView.text.parentNode)
      { lineView.text.parentNode.replaceChild(lineView.node, lineView.text); }
    lineView.node.appendChild(lineView.text);
    if (ie && ie_version < 8) { lineView.node.style.zIndex = 2; }
  }
  return lineView.node
}

function updateLineBackground(cm, lineView) {
  var cls = lineView.bgClass ? lineView.bgClass + " " + (lineView.line.bgClass || "") : lineView.line.bgClass;
  if (cls) { cls += " CodeMirror-linebackground"; }
  if (lineView.background) {
    if (cls) { lineView.background.className = cls; }
    else { lineView.background.parentNode.removeChild(lineView.background); lineView.background = null; }
  } else if (cls) {
    var wrap = ensureLineWrapped(lineView);
    lineView.background = wrap.insertBefore(elt("div", null, cls), wrap.firstChild);
    cm.display.input.setUneditable(lineView.background);
  }
}

// Wrapper around buildLineContent which will reuse the structure
// in display.externalMeasured when possible.
function getLineContent(cm, lineView) {
  var ext = cm.display.externalMeasured;
  if (ext && ext.line == lineView.line) {
    cm.display.externalMeasured = null;
    lineView.measure = ext.measure;
    return ext.built
  }
  return buildLineContent(cm, lineView)
}

// Redraw the line's text. Interacts with the background and text
// classes because the mode may output tokens that influence these
// classes.
function updateLineText(cm, lineView) {
  var cls = lineView.text.className;
  var built = getLineContent(cm, lineView);
  if (lineView.text == lineView.node) { lineView.node = built.pre; }
  lineView.text.parentNode.replaceChild(built.pre, lineView.text);
  lineView.text = built.pre;
  if (built.bgClass != lineView.bgClass || built.textClass != lineView.textClass) {
    lineView.bgClass = built.bgClass;
    lineView.textClass = built.textClass;
    updateLineClasses(cm, lineView);
  } else if (cls) {
    lineView.text.className = cls;
  }
}

function updateLineClasses(cm, lineView) {
  updateLineBackground(cm, lineView);
  if (lineView.line.wrapClass)
    { ensureLineWrapped(lineView).className = lineView.line.wrapClass; }
  else if (lineView.node != lineView.text)
    { lineView.node.className = ""; }
  var textClass = lineView.textClass ? lineView.textClass + " " + (lineView.line.textClass || "") : lineView.line.textClass;
  lineView.text.className = textClass || "";
}

function updateLineGutter(cm, lineView, lineN, dims) {
  if (lineView.gutter) {
    lineView.node.removeChild(lineView.gutter);
    lineView.gutter = null;
  }
  if (lineView.gutterBackground) {
    lineView.node.removeChild(lineView.gutterBackground);
    lineView.gutterBackground = null;
  }
  if (lineView.line.gutterClass) {
    var wrap = ensureLineWrapped(lineView);
    lineView.gutterBackground = elt("div", null, "CodeMirror-gutter-background " + lineView.line.gutterClass,
                                    ("left: " + (cm.options.fixedGutter ? dims.fixedPos : -dims.gutterTotalWidth) + "px; width: " + (dims.gutterTotalWidth) + "px"));
    cm.display.input.setUneditable(lineView.gutterBackground);
    wrap.insertBefore(lineView.gutterBackground, lineView.text);
  }
  var markers = lineView.line.gutterMarkers;
  if (cm.options.lineNumbers || markers) {
    var wrap$1 = ensureLineWrapped(lineView);
    var gutterWrap = lineView.gutter = elt("div", null, "CodeMirror-gutter-wrapper", ("left: " + (cm.options.fixedGutter ? dims.fixedPos : -dims.gutterTotalWidth) + "px"));
    cm.display.input.setUneditable(gutterWrap);
    wrap$1.insertBefore(gutterWrap, lineView.text);
    if (lineView.line.gutterClass)
      { gutterWrap.className += " " + lineView.line.gutterClass; }
    if (cm.options.lineNumbers && (!markers || !markers["CodeMirror-linenumbers"]))
      { lineView.lineNumber = gutterWrap.appendChild(
        elt("div", lineNumberFor(cm.options, lineN),
            "CodeMirror-linenumber CodeMirror-gutter-elt",
            ("left: " + (dims.gutterLeft["CodeMirror-linenumbers"]) + "px; width: " + (cm.display.lineNumInnerWidth) + "px"))); }
    if (markers) { for (var k = 0; k < cm.options.gutters.length; ++k) {
      var id = cm.options.gutters[k], found = markers.hasOwnProperty(id) && markers[id];
      if (found)
        { gutterWrap.appendChild(elt("div", [found], "CodeMirror-gutter-elt",
                                   ("left: " + (dims.gutterLeft[id]) + "px; width: " + (dims.gutterWidth[id]) + "px"))); }
    } }
  }
}

function updateLineWidgets(cm, lineView, dims) {
  if (lineView.alignable) { lineView.alignable = null; }
  for (var node = lineView.node.firstChild, next = (void 0); node; node = next) {
    next = node.nextSibling;
    if (node.className == "CodeMirror-linewidget")
      { lineView.node.removeChild(node); }
  }
  insertLineWidgets(cm, lineView, dims);
}

// Build a line's DOM representation from scratch
function buildLineElement(cm, lineView, lineN, dims) {
  var built = getLineContent(cm, lineView);
  lineView.text = lineView.node = built.pre;
  if (built.bgClass) { lineView.bgClass = built.bgClass; }
  if (built.textClass) { lineView.textClass = built.textClass; }

  updateLineClasses(cm, lineView);
  updateLineGutter(cm, lineView, lineN, dims);
  insertLineWidgets(cm, lineView, dims);
  return lineView.node
}

// A lineView may contain multiple logical lines (when merged by
// collapsed spans). The widgets for all of them need to be drawn.
function insertLineWidgets(cm, lineView, dims) {
  insertLineWidgetsFor(cm, lineView.line, lineView, dims, true);
  if (lineView.rest) { for (var i = 0; i < lineView.rest.length; i++)
    { insertLineWidgetsFor(cm, lineView.rest[i], lineView, dims, false); } }
}

function insertLineWidgetsFor(cm, line, lineView, dims, allowAbove) {
  if (!line.widgets) { return }
  var wrap = ensureLineWrapped(lineView);
  for (var i = 0, ws = line.widgets; i < ws.length; ++i) {
    var widget = ws[i], node = elt("div", [widget.node], "CodeMirror-linewidget");
    if (!widget.handleMouseEvents) { node.setAttribute("cm-ignore-events", "true"); }
    positionLineWidget(widget, node, lineView, dims);
    cm.display.input.setUneditable(node);
    if (allowAbove && widget.above)
      { wrap.insertBefore(node, lineView.gutter || lineView.text); }
    else
      { wrap.appendChild(node); }
    signalLater(widget, "redraw");
  }
}

function positionLineWidget(widget, node, lineView, dims) {
  if (widget.noHScroll) {
    (lineView.alignable || (lineView.alignable = [])).push(node);
    var width = dims.wrapperWidth;
    node.style.left = dims.fixedPos + "px";
    if (!widget.coverGutter) {
      width -= dims.gutterTotalWidth;
      node.style.paddingLeft = dims.gutterTotalWidth + "px";
    }
    node.style.width = width + "px";
  }
  if (widget.coverGutter) {
    node.style.zIndex = 5;
    node.style.position = "relative";
    if (!widget.noHScroll) { node.style.marginLeft = -dims.gutterTotalWidth + "px"; }
  }
}

function widgetHeight(widget) {
  if (widget.height != null) { return widget.height }
  var cm = widget.doc.cm;
  if (!cm) { return 0 }
  if (!contains(document.body, widget.node)) {
    var parentStyle = "position: relative;";
    if (widget.coverGutter)
      { parentStyle += "margin-left: -" + cm.display.gutters.offsetWidth + "px;"; }
    if (widget.noHScroll)
      { parentStyle += "width: " + cm.display.wrapper.clientWidth + "px;"; }
    removeChildrenAndAdd(cm.display.measure, elt("div", [widget.node], null, parentStyle));
  }
  return widget.height = widget.node.parentNode.offsetHeight
}

// Return true when the given mouse event happened in a widget
function eventInWidget(display, e) {
  for (var n = e_target(e); n != display.wrapper; n = n.parentNode) {
    if (!n || (n.nodeType == 1 && n.getAttribute("cm-ignore-events") == "true") ||
        (n.parentNode == display.sizer && n != display.mover))
      { return true }
  }
}

// POSITION MEASUREMENT

function paddingTop(display) {return display.lineSpace.offsetTop}
function paddingVert(display) {return display.mover.offsetHeight - display.lineSpace.offsetHeight}
function paddingH(display) {
  if (display.cachedPaddingH) { return display.cachedPaddingH }
  var e = removeChildrenAndAdd(display.measure, elt("pre", "x"));
  var style = window.getComputedStyle ? window.getComputedStyle(e) : e.currentStyle;
  var data = {left: parseInt(style.paddingLeft), right: parseInt(style.paddingRight)};
  if (!isNaN(data.left) && !isNaN(data.right)) { display.cachedPaddingH = data; }
  return data
}

function scrollGap(cm) { return scrollerGap - cm.display.nativeBarWidth }
function displayWidth(cm) {
  return cm.display.scroller.clientWidth - scrollGap(cm) - cm.display.barWidth
}
function displayHeight(cm) {
  return cm.display.scroller.clientHeight - scrollGap(cm) - cm.display.barHeight
}

// Ensure the lineView.wrapping.heights array is populated. This is
// an array of bottom offsets for the lines that make up a drawn
// line. When lineWrapping is on, there might be more than one
// height.
function ensureLineHeights(cm, lineView, rect) {
  var wrapping = cm.options.lineWrapping;
  var curWidth = wrapping && displayWidth(cm);
  if (!lineView.measure.heights || wrapping && lineView.measure.width != curWidth) {
    var heights = lineView.measure.heights = [];
    if (wrapping) {
      lineView.measure.width = curWidth;
      var rects = lineView.text.firstChild.getClientRects();
      for (var i = 0; i < rects.length - 1; i++) {
        var cur = rects[i], next = rects[i + 1];
        if (Math.abs(cur.bottom - next.bottom) > 2)
          { heights.push((cur.bottom + next.top) / 2 - rect.top); }
      }
    }
    heights.push(rect.bottom - rect.top);
  }
}

// Find a line map (mapping character offsets to text nodes) and a
// measurement cache for the given line number. (A line view might
// contain multiple lines when collapsed ranges are present.)
function mapFromLineView(lineView, line, lineN) {
  if (lineView.line == line)
    { return {map: lineView.measure.map, cache: lineView.measure.cache} }
  for (var i = 0; i < lineView.rest.length; i++)
    { if (lineView.rest[i] == line)
      { return {map: lineView.measure.maps[i], cache: lineView.measure.caches[i]} } }
  for (var i$1 = 0; i$1 < lineView.rest.length; i$1++)
    { if (lineNo(lineView.rest[i$1]) > lineN)
      { return {map: lineView.measure.maps[i$1], cache: lineView.measure.caches[i$1], before: true} } }
}

// Render a line into the hidden node display.externalMeasured. Used
// when measurement is needed for a line that's not in the viewport.
function updateExternalMeasurement(cm, line) {
  line = visualLine(line);
  var lineN = lineNo(line);
  var view = cm.display.externalMeasured = new LineView(cm.doc, line, lineN);
  view.lineN = lineN;
  var built = view.built = buildLineContent(cm, view);
  view.text = built.pre;
  removeChildrenAndAdd(cm.display.lineMeasure, built.pre);
  return view
}

// Get a {top, bottom, left, right} box (in line-local coordinates)
// for a given character.
function measureChar(cm, line, ch, bias) {
  return measureCharPrepared(cm, prepareMeasureForLine(cm, line), ch, bias)
}

// Find a line view that corresponds to the given line number.
function findViewForLine(cm, lineN) {
  if (lineN >= cm.display.viewFrom && lineN < cm.display.viewTo)
    { return cm.display.view[findViewIndex(cm, lineN)] }
  var ext = cm.display.externalMeasured;
  if (ext && lineN >= ext.lineN && lineN < ext.lineN + ext.size)
    { return ext }
}

// Measurement can be split in two steps, the set-up work that
// applies to the whole line, and the measurement of the actual
// character. Functions like coordsChar, that need to do a lot of
// measurements in a row, can thus ensure that the set-up work is
// only done once.
function prepareMeasureForLine(cm, line) {
  var lineN = lineNo(line);
  var view = findViewForLine(cm, lineN);
  if (view && !view.text) {
    view = null;
  } else if (view && view.changes) {
    updateLineForChanges(cm, view, lineN, getDimensions(cm));
    cm.curOp.forceUpdate = true;
  }
  if (!view)
    { view = updateExternalMeasurement(cm, line); }

  var info = mapFromLineView(view, line, lineN);
  return {
    line: line, view: view, rect: null,
    map: info.map, cache: info.cache, before: info.before,
    hasHeights: false
  }
}

// Given a prepared measurement object, measures the position of an
// actual character (or fetches it from the cache).
function measureCharPrepared(cm, prepared, ch, bias, varHeight) {
  if (prepared.before) { ch = -1; }
  var key = ch + (bias || ""), found;
  if (prepared.cache.hasOwnProperty(key)) {
    found = prepared.cache[key];
  } else {
    if (!prepared.rect)
      { prepared.rect = prepared.view.text.getBoundingClientRect(); }
    if (!prepared.hasHeights) {
      ensureLineHeights(cm, prepared.view, prepared.rect);
      prepared.hasHeights = true;
    }
    found = measureCharInner(cm, prepared, ch, bias);
    if (!found.bogus) { prepared.cache[key] = found; }
  }
  return {left: found.left, right: found.right,
          top: varHeight ? found.rtop : found.top,
          bottom: varHeight ? found.rbottom : found.bottom}
}

var nullRect = {left: 0, right: 0, top: 0, bottom: 0};

function nodeAndOffsetInLineMap(map$$1, ch, bias) {
  var node, start, end, collapse, mStart, mEnd;
  // First, search the line map for the text node corresponding to,
  // or closest to, the target character.
  for (var i = 0; i < map$$1.length; i += 3) {
    mStart = map$$1[i];
    mEnd = map$$1[i + 1];
    if (ch < mStart) {
      start = 0; end = 1;
      collapse = "left";
    } else if (ch < mEnd) {
      start = ch - mStart;
      end = start + 1;
    } else if (i == map$$1.length - 3 || ch == mEnd && map$$1[i + 3] > ch) {
      end = mEnd - mStart;
      start = end - 1;
      if (ch >= mEnd) { collapse = "right"; }
    }
    if (start != null) {
      node = map$$1[i + 2];
      if (mStart == mEnd && bias == (node.insertLeft ? "left" : "right"))
        { collapse = bias; }
      if (bias == "left" && start == 0)
        { while (i && map$$1[i - 2] == map$$1[i - 3] && map$$1[i - 1].insertLeft) {
          node = map$$1[(i -= 3) + 2];
          collapse = "left";
        } }
      if (bias == "right" && start == mEnd - mStart)
        { while (i < map$$1.length - 3 && map$$1[i + 3] == map$$1[i + 4] && !map$$1[i + 5].insertLeft) {
          node = map$$1[(i += 3) + 2];
          collapse = "right";
        } }
      break
    }
  }
  return {node: node, start: start, end: end, collapse: collapse, coverStart: mStart, coverEnd: mEnd}
}

function getUsefulRect(rects, bias) {
  var rect = nullRect;
  if (bias == "left") { for (var i = 0; i < rects.length; i++) {
    if ((rect = rects[i]).left != rect.right) { break }
  } } else { for (var i$1 = rects.length - 1; i$1 >= 0; i$1--) {
    if ((rect = rects[i$1]).left != rect.right) { break }
  } }
  return rect
}

function measureCharInner(cm, prepared, ch, bias) {
  var place = nodeAndOffsetInLineMap(prepared.map, ch, bias);
  var node = place.node, start = place.start, end = place.end, collapse = place.collapse;

  var rect;
  if (node.nodeType == 3) { // If it is a text node, use a range to retrieve the coordinates.
    for (var i$1 = 0; i$1 < 4; i$1++) { // Retry a maximum of 4 times when nonsense rectangles are returned
      while (start && isExtendingChar(prepared.line.text.charAt(place.coverStart + start))) { --start; }
      while (place.coverStart + end < place.coverEnd && isExtendingChar(prepared.line.text.charAt(place.coverStart + end))) { ++end; }
      if (ie && ie_version < 9 && start == 0 && end == place.coverEnd - place.coverStart)
        { rect = node.parentNode.getBoundingClientRect(); }
      else
        { rect = getUsefulRect(range(node, start, end).getClientRects(), bias); }
      if (rect.left || rect.right || start == 0) { break }
      end = start;
      start = start - 1;
      collapse = "right";
    }
    if (ie && ie_version < 11) { rect = maybeUpdateRectForZooming(cm.display.measure, rect); }
  } else { // If it is a widget, simply get the box for the whole widget.
    if (start > 0) { collapse = bias = "right"; }
    var rects;
    if (cm.options.lineWrapping && (rects = node.getClientRects()).length > 1)
      { rect = rects[bias == "right" ? rects.length - 1 : 0]; }
    else
      { rect = node.getBoundingClientRect(); }
  }
  if (ie && ie_version < 9 && !start && (!rect || !rect.left && !rect.right)) {
    var rSpan = node.parentNode.getClientRects()[0];
    if (rSpan)
      { rect = {left: rSpan.left, right: rSpan.left + charWidth(cm.display), top: rSpan.top, bottom: rSpan.bottom}; }
    else
      { rect = nullRect; }
  }

  var rtop = rect.top - prepared.rect.top, rbot = rect.bottom - prepared.rect.top;
  var mid = (rtop + rbot) / 2;
  var heights = prepared.view.measure.heights;
  var i = 0;
  for (; i < heights.length - 1; i++)
    { if (mid < heights[i]) { break } }
  var top = i ? heights[i - 1] : 0, bot = heights[i];
  var result = {left: (collapse == "right" ? rect.right : rect.left) - prepared.rect.left,
                right: (collapse == "left" ? rect.left : rect.right) - prepared.rect.left,
                top: top, bottom: bot};
  if (!rect.left && !rect.right) { result.bogus = true; }
  if (!cm.options.singleCursorHeightPerLine) { result.rtop = rtop; result.rbottom = rbot; }

  return result
}

// Work around problem with bounding client rects on ranges being
// returned incorrectly when zoomed on IE10 and below.
function maybeUpdateRectForZooming(measure, rect) {
  if (!window.screen || screen.logicalXDPI == null ||
      screen.logicalXDPI == screen.deviceXDPI || !hasBadZoomedRects(measure))
    { return rect }
  var scaleX = screen.logicalXDPI / screen.deviceXDPI;
  var scaleY = screen.logicalYDPI / screen.deviceYDPI;
  return {left: rect.left * scaleX, right: rect.right * scaleX,
          top: rect.top * scaleY, bottom: rect.bottom * scaleY}
}

function clearLineMeasurementCacheFor(lineView) {
  if (lineView.measure) {
    lineView.measure.cache = {};
    lineView.measure.heights = null;
    if (lineView.rest) { for (var i = 0; i < lineView.rest.length; i++)
      { lineView.measure.caches[i] = {}; } }
  }
}

function clearLineMeasurementCache(cm) {
  cm.display.externalMeasure = null;
  removeChildren(cm.display.lineMeasure);
  for (var i = 0; i < cm.display.view.length; i++)
    { clearLineMeasurementCacheFor(cm.display.view[i]); }
}

function clearCaches(cm) {
  clearLineMeasurementCache(cm);
  cm.display.cachedCharWidth = cm.display.cachedTextHeight = cm.display.cachedPaddingH = null;
  if (!cm.options.lineWrapping) { cm.display.maxLineChanged = true; }
  cm.display.lineNumChars = null;
}

function pageScrollX() {
  // Work around https://bugs.chromium.org/p/chromium/issues/detail?id=489206
  // which causes page_Offset and bounding client rects to use
  // different reference viewports and invalidate our calculations.
  if (chrome && android) { return -(document.body.getBoundingClientRect().left - parseInt(getComputedStyle(document.body).marginLeft)) }
  return window.pageXOffset || (document.documentElement || document.body).scrollLeft
}
function pageScrollY() {
  if (chrome && android) { return -(document.body.getBoundingClientRect().top - parseInt(getComputedStyle(document.body).marginTop)) }
  return window.pageYOffset || (document.documentElement || document.body).scrollTop
}

function widgetTopHeight(lineObj) {
  var height = 0;
  if (lineObj.widgets) { for (var i = 0; i < lineObj.widgets.length; ++i) { if (lineObj.widgets[i].above)
    { height += widgetHeight(lineObj.widgets[i]); } } }
  return height
}

// Converts a {top, bottom, left, right} box from line-local
// coordinates into another coordinate system. Context may be one of
// "line", "div" (display.lineDiv), "local"./null (editor), "window",
// or "page".
function intoCoordSystem(cm, lineObj, rect, context, includeWidgets) {
  if (!includeWidgets) {
    var height = widgetTopHeight(lineObj);
    rect.top += height; rect.bottom += height;
  }
  if (context == "line") { return rect }
  if (!context) { context = "local"; }
  var yOff = heightAtLine(lineObj);
  if (context == "local") { yOff += paddingTop(cm.display); }
  else { yOff -= cm.display.viewOffset; }
  if (context == "page" || context == "window") {
    var lOff = cm.display.lineSpace.getBoundingClientRect();
    yOff += lOff.top + (context == "window" ? 0 : pageScrollY());
    var xOff = lOff.left + (context == "window" ? 0 : pageScrollX());
    rect.left += xOff; rect.right += xOff;
  }
  rect.top += yOff; rect.bottom += yOff;
  return rect
}

// Coverts a box from "div" coords to another coordinate system.
// Context may be "window", "page", "div", or "local"./null.
function fromCoordSystem(cm, coords, context) {
  if (context == "div") { return coords }
  var left = coords.left, top = coords.top;
  // First move into "page" coordinate system
  if (context == "page") {
    left -= pageScrollX();
    top -= pageScrollY();
  } else if (context == "local" || !context) {
    var localBox = cm.display.sizer.getBoundingClientRect();
    left += localBox.left;
    top += localBox.top;
  }

  var lineSpaceBox = cm.display.lineSpace.getBoundingClientRect();
  return {left: left - lineSpaceBox.left, top: top - lineSpaceBox.top}
}

function charCoords(cm, pos, context, lineObj, bias) {
  if (!lineObj) { lineObj = getLine(cm.doc, pos.line); }
  return intoCoordSystem(cm, lineObj, measureChar(cm, lineObj, pos.ch, bias), context)
}

// Returns a box for a given cursor position, which may have an
// 'other' property containing the position of the secondary cursor
// on a bidi boundary.
// A cursor Pos(line, char, "before") is on the same visual line as `char - 1`
// and after `char - 1` in writing order of `char - 1`
// A cursor Pos(line, char, "after") is on the same visual line as `char`
// and before `char` in writing order of `char`
// Examples (upper-case letters are RTL, lower-case are LTR):
//     Pos(0, 1, ...)
//     before   after
// ab     a|b     a|b
// aB     a|B     aB|
// Ab     |Ab     A|b
// AB     B|A     B|A
// Every position after the last character on a line is considered to stick
// to the last character on the line.
function cursorCoords(cm, pos, context, lineObj, preparedMeasure, varHeight) {
  lineObj = lineObj || getLine(cm.doc, pos.line);
  if (!preparedMeasure) { preparedMeasure = prepareMeasureForLine(cm, lineObj); }
  function get(ch, right) {
    var m = measureCharPrepared(cm, preparedMeasure, ch, right ? "right" : "left", varHeight);
    if (right) { m.left = m.right; } else { m.right = m.left; }
    return intoCoordSystem(cm, lineObj, m, context)
  }
  var order = getOrder(lineObj, cm.doc.direction), ch = pos.ch, sticky = pos.sticky;
  if (ch >= lineObj.text.length) {
    ch = lineObj.text.length;
    sticky = "before";
  } else if (ch <= 0) {
    ch = 0;
    sticky = "after";
  }
  if (!order) { return get(sticky == "before" ? ch - 1 : ch, sticky == "before") }

  function getBidi(ch, partPos, invert) {
    var part = order[partPos], right = part.level == 1;
    return get(invert ? ch - 1 : ch, right != invert)
  }
  var partPos = getBidiPartAt(order, ch, sticky);
  var other = bidiOther;
  var val = getBidi(ch, partPos, sticky == "before");
  if (other != null) { val.other = getBidi(ch, other, sticky != "before"); }
  return val
}

// Used to cheaply estimate the coordinates for a position. Used for
// intermediate scroll updates.
function estimateCoords(cm, pos) {
  var left = 0;
  pos = clipPos(cm.doc, pos);
  if (!cm.options.lineWrapping) { left = charWidth(cm.display) * pos.ch; }
  var lineObj = getLine(cm.doc, pos.line);
  var top = heightAtLine(lineObj) + paddingTop(cm.display);
  return {left: left, right: left, top: top, bottom: top + lineObj.height}
}

// Positions returned by coordsChar contain some extra information.
// xRel is the relative x position of the input coordinates compared
// to the found position (so xRel > 0 means the coordinates are to
// the right of the character position, for example). When outside
// is true, that means the coordinates lie outside the line's
// vertical range.
function PosWithInfo(line, ch, sticky, outside, xRel) {
  var pos = Pos(line, ch, sticky);
  pos.xRel = xRel;
  if (outside) { pos.outside = true; }
  return pos
}

// Compute the character position closest to the given coordinates.
// Input must be lineSpace-local ("div" coordinate system).
function coordsChar(cm, x, y) {
  var doc = cm.doc;
  y += cm.display.viewOffset;
  if (y < 0) { return PosWithInfo(doc.first, 0, null, true, -1) }
  var lineN = lineAtHeight(doc, y), last = doc.first + doc.size - 1;
  if (lineN > last)
    { return PosWithInfo(doc.first + doc.size - 1, getLine(doc, last).text.length, null, true, 1) }
  if (x < 0) { x = 0; }

  var lineObj = getLine(doc, lineN);
  for (;;) {
    var found = coordsCharInner(cm, lineObj, lineN, x, y);
    var collapsed = collapsedSpanAround(lineObj, found.ch + (found.xRel > 0 ? 1 : 0));
    if (!collapsed) { return found }
    var rangeEnd = collapsed.find(1);
    if (rangeEnd.line == lineN) { return rangeEnd }
    lineObj = getLine(doc, lineN = rangeEnd.line);
  }
}

function wrappedLineExtent(cm, lineObj, preparedMeasure, y) {
  y -= widgetTopHeight(lineObj);
  var end = lineObj.text.length;
  var begin = findFirst(function (ch) { return measureCharPrepared(cm, preparedMeasure, ch - 1).bottom <= y; }, end, 0);
  end = findFirst(function (ch) { return measureCharPrepared(cm, preparedMeasure, ch).top > y; }, begin, end);
  return {begin: begin, end: end}
}

function wrappedLineExtentChar(cm, lineObj, preparedMeasure, target) {
  if (!preparedMeasure) { preparedMeasure = prepareMeasureForLine(cm, lineObj); }
  var targetTop = intoCoordSystem(cm, lineObj, measureCharPrepared(cm, preparedMeasure, target), "line").top;
  return wrappedLineExtent(cm, lineObj, preparedMeasure, targetTop)
}

// Returns true if the given side of a box is after the given
// coordinates, in top-to-bottom, left-to-right order.
function boxIsAfter(box, x, y, left) {
  return box.bottom <= y ? false : box.top > y ? true : (left ? box.left : box.right) > x
}

function coordsCharInner(cm, lineObj, lineNo$$1, x, y) {
  // Move y into line-local coordinate space
  y -= heightAtLine(lineObj);
  var preparedMeasure = prepareMeasureForLine(cm, lineObj);
  // When directly calling `measureCharPrepared`, we have to adjust
  // for the widgets at this line.
  var widgetHeight$$1 = widgetTopHeight(lineObj);
  var begin = 0, end = lineObj.text.length, ltr = true;

  var order = getOrder(lineObj, cm.doc.direction);
  // If the line isn't plain left-to-right text, first figure out
  // which bidi section the coordinates fall into.
  if (order) {
    var part = (cm.options.lineWrapping ? coordsBidiPartWrapped : coordsBidiPart)
                 (cm, lineObj, lineNo$$1, preparedMeasure, order, x, y);
    ltr = part.level != 1;
    // The awkward -1 offsets are needed because findFirst (called
    // on these below) will treat its first bound as inclusive,
    // second as exclusive, but we want to actually address the
    // characters in the part's range
    begin = ltr ? part.from : part.to - 1;
    end = ltr ? part.to : part.from - 1;
  }

  // A binary search to find the first character whose bounding box
  // starts after the coordinates. If we run across any whose box wrap
  // the coordinates, store that.
  var chAround = null, boxAround = null;
  var ch = findFirst(function (ch) {
    var box = measureCharPrepared(cm, preparedMeasure, ch);
    box.top += widgetHeight$$1; box.bottom += widgetHeight$$1;
    if (!boxIsAfter(box, x, y, false)) { return false }
    if (box.top <= y && box.left <= x) {
      chAround = ch;
      boxAround = box;
    }
    return true
  }, begin, end);

  var baseX, sticky, outside = false;
  // If a box around the coordinates was found, use that
  if (boxAround) {
    // Distinguish coordinates nearer to the left or right side of the box
    var atLeft = x - boxAround.left < boxAround.right - x, atStart = atLeft == ltr;
    ch = chAround + (atStart ? 0 : 1);
    sticky = atStart ? "after" : "before";
    baseX = atLeft ? boxAround.left : boxAround.right;
  } else {
    // (Adjust for extended bound, if necessary.)
    if (!ltr && (ch == end || ch == begin)) { ch++; }
    // To determine which side to associate with, get the box to the
    // left of the character and compare it's vertical position to the
    // coordinates
    sticky = ch == 0 ? "after" : ch == lineObj.text.length ? "before" :
      (measureCharPrepared(cm, preparedMeasure, ch - (ltr ? 1 : 0)).bottom + widgetHeight$$1 <= y) == ltr ?
      "after" : "before";
    // Now get accurate coordinates for this place, in order to get a
    // base X position
    var coords = cursorCoords(cm, Pos(lineNo$$1, ch, sticky), "line", lineObj, preparedMeasure);
    baseX = coords.left;
    outside = y < coords.top || y >= coords.bottom;
  }

  ch = skipExtendingChars(lineObj.text, ch, 1);
  return PosWithInfo(lineNo$$1, ch, sticky, outside, x - baseX)
}

function coordsBidiPart(cm, lineObj, lineNo$$1, preparedMeasure, order, x, y) {
  // Bidi parts are sorted left-to-right, and in a non-line-wrapping
  // situation, we can take this ordering to correspond to the visual
  // ordering. This finds the first part whose end is after the given
  // coordinates.
  var index = findFirst(function (i) {
    var part = order[i], ltr = part.level != 1;
    return boxIsAfter(cursorCoords(cm, Pos(lineNo$$1, ltr ? part.to : part.from, ltr ? "before" : "after"),
                                   "line", lineObj, preparedMeasure), x, y, true)
  }, 0, order.length - 1);
  var part = order[index];
  // If this isn't the first part, the part's start is also after
  // the coordinates, and the coordinates aren't on the same line as
  // that start, move one part back.
  if (index > 0) {
    var ltr = part.level != 1;
    var start = cursorCoords(cm, Pos(lineNo$$1, ltr ? part.from : part.to, ltr ? "after" : "before"),
                             "line", lineObj, preparedMeasure);
    if (boxIsAfter(start, x, y, true) && start.top > y)
      { part = order[index - 1]; }
  }
  return part
}

function coordsBidiPartWrapped(cm, lineObj, _lineNo, preparedMeasure, order, x, y) {
  // In a wrapped line, rtl text on wrapping boundaries can do things
  // that don't correspond to the ordering in our `order` array at
  // all, so a binary search doesn't work, and we want to return a
  // part that only spans one line so that the binary search in
  // coordsCharInner is safe. As such, we first find the extent of the
  // wrapped line, and then do a flat search in which we discard any
  // spans that aren't on the line.
  var ref = wrappedLineExtent(cm, lineObj, preparedMeasure, y);
  var begin = ref.begin;
  var end = ref.end;
  if (/\s/.test(lineObj.text.charAt(end - 1))) { end--; }
  var part = null, closestDist = null;
  for (var i = 0; i < order.length; i++) {
    var p = order[i];
    if (p.from >= end || p.to <= begin) { continue }
    var ltr = p.level != 1;
    var endX = measureCharPrepared(cm, preparedMeasure, ltr ? Math.min(end, p.to) - 1 : Math.max(begin, p.from)).right;
    // Weigh against spans ending before this, so that they are only
    // picked if nothing ends after
    var dist = endX < x ? x - endX + 1e9 : endX - x;
    if (!part || closestDist > dist) {
      part = p;
      closestDist = dist;
    }
  }
  if (!part) { part = order[order.length - 1]; }
  // Clip the part to the wrapped line.
  if (part.from < begin) { part = {from: begin, to: part.to, level: part.level}; }
  if (part.to > end) { part = {from: part.from, to: end, level: part.level}; }
  return part
}

var measureText;
// Compute the default text height.
function textHeight(display) {
  if (display.cachedTextHeight != null) { return display.cachedTextHeight }
  if (measureText == null) {
    measureText = elt("pre");
    // Measure a bunch of lines, for browsers that compute
    // fractional heights.
    for (var i = 0; i < 49; ++i) {
      measureText.appendChild(document.createTextNode("x"));
      measureText.appendChild(elt("br"));
    }
    measureText.appendChild(document.createTextNode("x"));
  }
  removeChildrenAndAdd(display.measure, measureText);
  var height = measureText.offsetHeight / 50;
  if (height > 3) { display.cachedTextHeight = height; }
  removeChildren(display.measure);
  return height || 1
}

// Compute the default character width.
function charWidth(display) {
  if (display.cachedCharWidth != null) { return display.cachedCharWidth }
  var anchor = elt("span", "xxxxxxxxxx");
  var pre = elt("pre", [anchor]);
  removeChildrenAndAdd(display.measure, pre);
  var rect = anchor.getBoundingClientRect(), width = (rect.right - rect.left) / 10;
  if (width > 2) { display.cachedCharWidth = width; }
  return width || 10
}

// Do a bulk-read of the DOM positions and sizes needed to draw the
// view, so that we don't interleave reading and writing to the DOM.
function getDimensions(cm) {
  var d = cm.display, left = {}, width = {};
  var gutterLeft = d.gutters.clientLeft;
  for (var n = d.gutters.firstChild, i = 0; n; n = n.nextSibling, ++i) {
    left[cm.options.gutters[i]] = n.offsetLeft + n.clientLeft + gutterLeft;
    width[cm.options.gutters[i]] = n.clientWidth;
  }
  return {fixedPos: compensateForHScroll(d),
          gutterTotalWidth: d.gutters.offsetWidth,
          gutterLeft: left,
          gutterWidth: width,
          wrapperWidth: d.wrapper.clientWidth}
}

// Computes display.scroller.scrollLeft + display.gutters.offsetWidth,
// but using getBoundingClientRect to get a sub-pixel-accurate
// result.
function compensateForHScroll(display) {
  return display.scroller.getBoundingClientRect().left - display.sizer.getBoundingClientRect().left
}

// Returns a function that estimates the height of a line, to use as
// first approximation until the line becomes visible (and is thus
// properly measurable).
function estimateHeight(cm) {
  var th = textHeight(cm.display), wrapping = cm.options.lineWrapping;
  var perLine = wrapping && Math.max(5, cm.display.scroller.clientWidth / charWidth(cm.display) - 3);
  return function (line) {
    if (lineIsHidden(cm.doc, line)) { return 0 }

    var widgetsHeight = 0;
    if (line.widgets) { for (var i = 0; i < line.widgets.length; i++) {
      if (line.widgets[i].height) { widgetsHeight += line.widgets[i].height; }
    } }

    if (wrapping)
      { return widgetsHeight + (Math.ceil(line.text.length / perLine) || 1) * th }
    else
      { return widgetsHeight + th }
  }
}

function estimateLineHeights(cm) {
  var doc = cm.doc, est = estimateHeight(cm);
  doc.iter(function (line) {
    var estHeight = est(line);
    if (estHeight != line.height) { updateLineHeight(line, estHeight); }
  });
}

// Given a mouse event, find the corresponding position. If liberal
// is false, it checks whether a gutter or scrollbar was clicked,
// and returns null if it was. forRect is used by rectangular
// selections, and tries to estimate a character position even for
// coordinates beyond the right of the text.
function posFromMouse(cm, e, liberal, forRect) {
  var display = cm.display;
  if (!liberal && e_target(e).getAttribute("cm-not-content") == "true") { return null }

  var x, y, space = display.lineSpace.getBoundingClientRect();
  // Fails unpredictably on IE[67] when mouse is dragged around quickly.
  try { x = e.clientX - space.left; y = e.clientY - space.top; }
  catch (e) { return null }
  var coords = coordsChar(cm, x, y), line;
  if (forRect && coords.xRel == 1 && (line = getLine(cm.doc, coords.line).text).length == coords.ch) {
    var colDiff = countColumn(line, line.length, cm.options.tabSize) - line.length;
    coords = Pos(coords.line, Math.max(0, Math.round((x - paddingH(cm.display).left) / charWidth(cm.display)) - colDiff));
  }
  return coords
}

// Find the view element corresponding to a given line. Return null
// when the line isn't visible.
function findViewIndex(cm, n) {
  if (n >= cm.display.viewTo) { return null }
  n -= cm.display.viewFrom;
  if (n < 0) { return null }
  var view = cm.display.view;
  for (var i = 0; i < view.length; i++) {
    n -= view[i].size;
    if (n < 0) { return i }
  }
}

function updateSelection(cm) {
  cm.display.input.showSelection(cm.display.input.prepareSelection());
}

function prepareSelection(cm, primary) {
  if ( primary === void 0 ) primary = true;

  var doc = cm.doc, result = {};
  var curFragment = result.cursors = document.createDocumentFragment();
  var selFragment = result.selection = document.createDocumentFragment();

  for (var i = 0; i < doc.sel.ranges.length; i++) {
    if (!primary && i == doc.sel.primIndex) { continue }
    var range$$1 = doc.sel.ranges[i];
    if (range$$1.from().line >= cm.display.viewTo || range$$1.to().line < cm.display.viewFrom) { continue }
    var collapsed = range$$1.empty();
    if (collapsed || cm.options.showCursorWhenSelecting)
      { drawSelectionCursor(cm, range$$1.head, curFragment); }
    if (!collapsed)
      { drawSelectionRange(cm, range$$1, selFragment); }
  }
  return result
}

// Draws a cursor for the given range
function drawSelectionCursor(cm, head, output) {
  var pos = cursorCoords(cm, head, "div", null, null, !cm.options.singleCursorHeightPerLine);

  var cursor = output.appendChild(elt("div", "\u00a0", "CodeMirror-cursor"));
  cursor.style.left = pos.left + "px";
  cursor.style.top = pos.top + "px";
  cursor.style.height = Math.max(0, pos.bottom - pos.top) * cm.options.cursorHeight + "px";

  if (pos.other) {
    // Secondary cursor, shown when on a 'jump' in bi-directional text
    var otherCursor = output.appendChild(elt("div", "\u00a0", "CodeMirror-cursor CodeMirror-secondarycursor"));
    otherCursor.style.display = "";
    otherCursor.style.left = pos.other.left + "px";
    otherCursor.style.top = pos.other.top + "px";
    otherCursor.style.height = (pos.other.bottom - pos.other.top) * .85 + "px";
  }
}

function cmpCoords(a, b) { return a.top - b.top || a.left - b.left }

// Draws the given range as a highlighted selection
function drawSelectionRange(cm, range$$1, output) {
  var display = cm.display, doc = cm.doc;
  var fragment = document.createDocumentFragment();
  var padding = paddingH(cm.display), leftSide = padding.left;
  var rightSide = Math.max(display.sizerWidth, displayWidth(cm) - display.sizer.offsetLeft) - padding.right;
  var docLTR = doc.direction == "ltr";

  function add(left, top, width, bottom) {
    if (top < 0) { top = 0; }
    top = Math.round(top);
    bottom = Math.round(bottom);
    fragment.appendChild(elt("div", null, "CodeMirror-selected", ("position: absolute; left: " + left + "px;\n                             top: " + top + "px; width: " + (width == null ? rightSide - left : width) + "px;\n                             height: " + (bottom - top) + "px")));
  }

  function drawForLine(line, fromArg, toArg) {
    var lineObj = getLine(doc, line);
    var lineLen = lineObj.text.length;
    var start, end;
    function coords(ch, bias) {
      return charCoords(cm, Pos(line, ch), "div", lineObj, bias)
    }

    function wrapX(pos, dir, side) {
      var extent = wrappedLineExtentChar(cm, lineObj, null, pos);
      var prop = (dir == "ltr") == (side == "after") ? "left" : "right";
      var ch = side == "after" ? extent.begin : extent.end - (/\s/.test(lineObj.text.charAt(extent.end - 1)) ? 2 : 1);
      return coords(ch, prop)[prop]
    }

    var order = getOrder(lineObj, doc.direction);
    iterateBidiSections(order, fromArg || 0, toArg == null ? lineLen : toArg, function (from, to, dir, i) {
      var ltr = dir == "ltr";
      var fromPos = coords(from, ltr ? "left" : "right");
      var toPos = coords(to - 1, ltr ? "right" : "left");

      var openStart = fromArg == null && from == 0, openEnd = toArg == null && to == lineLen;
      var first = i == 0, last = !order || i == order.length - 1;
      if (toPos.top - fromPos.top <= 3) { // Single line
        var openLeft = (docLTR ? openStart : openEnd) && first;
        var openRight = (docLTR ? openEnd : openStart) && last;
        var left = openLeft ? leftSide : (ltr ? fromPos : toPos).left;
        var right = openRight ? rightSide : (ltr ? toPos : fromPos).right;
        add(left, fromPos.top, right - left, fromPos.bottom);
      } else { // Multiple lines
        var topLeft, topRight, botLeft, botRight;
        if (ltr) {
          topLeft = docLTR && openStart && first ? leftSide : fromPos.left;
          topRight = docLTR ? rightSide : wrapX(from, dir, "before");
          botLeft = docLTR ? leftSide : wrapX(to, dir, "after");
          botRight = docLTR && openEnd && last ? rightSide : toPos.right;
        } else {
          topLeft = !docLTR ? leftSide : wrapX(from, dir, "before");
          topRight = !docLTR && openStart && first ? rightSide : fromPos.right;
          botLeft = !docLTR && openEnd && last ? leftSide : toPos.left;
          botRight = !docLTR ? rightSide : wrapX(to, dir, "after");
        }
        add(topLeft, fromPos.top, topRight - topLeft, fromPos.bottom);
        if (fromPos.bottom < toPos.top) { add(leftSide, fromPos.bottom, null, toPos.top); }
        add(botLeft, toPos.top, botRight - botLeft, toPos.bottom);
      }

      if (!start || cmpCoords(fromPos, start) < 0) { start = fromPos; }
      if (cmpCoords(toPos, start) < 0) { start = toPos; }
      if (!end || cmpCoords(fromPos, end) < 0) { end = fromPos; }
      if (cmpCoords(toPos, end) < 0) { end = toPos; }
    });
    return {start: start, end: end}
  }

  var sFrom = range$$1.from(), sTo = range$$1.to();
  if (sFrom.line == sTo.line) {
    drawForLine(sFrom.line, sFrom.ch, sTo.ch);
  } else {
    var fromLine = getLine(doc, sFrom.line), toLine = getLine(doc, sTo.line);
    var singleVLine = visualLine(fromLine) == visualLine(toLine);
    var leftEnd = drawForLine(sFrom.line, sFrom.ch, singleVLine ? fromLine.text.length + 1 : null).end;
    var rightStart = drawForLine(sTo.line, singleVLine ? 0 : null, sTo.ch).start;
    if (singleVLine) {
      if (leftEnd.top < rightStart.top - 2) {
        add(leftEnd.right, leftEnd.top, null, leftEnd.bottom);
        add(leftSide, rightStart.top, rightStart.left, rightStart.bottom);
      } else {
        add(leftEnd.right, leftEnd.top, rightStart.left - leftEnd.right, leftEnd.bottom);
      }
    }
    if (leftEnd.bottom < rightStart.top)
      { add(leftSide, leftEnd.bottom, null, rightStart.top); }
  }

  output.appendChild(fragment);
}

// Cursor-blinking
function restartBlink(cm) {
  if (!cm.state.focused) { return }
  var display = cm.display;
  clearInterval(display.blinker);
  var on = true;
  display.cursorDiv.style.visibility = "";
  if (cm.options.cursorBlinkRate > 0)
    { display.blinker = setInterval(function () { return display.cursorDiv.style.visibility = (on = !on) ? "" : "hidden"; },
      cm.options.cursorBlinkRate); }
  else if (cm.options.cursorBlinkRate < 0)
    { display.cursorDiv.style.visibility = "hidden"; }
}

function ensureFocus(cm) {
  if (!cm.state.focused) { cm.display.input.focus(); onFocus(cm); }
}

function delayBlurEvent(cm) {
  cm.state.delayingBlurEvent = true;
  setTimeout(function () { if (cm.state.delayingBlurEvent) {
    cm.state.delayingBlurEvent = false;
    onBlur(cm);
  } }, 100);
}

function onFocus(cm, e) {
  if (cm.state.delayingBlurEvent) { cm.state.delayingBlurEvent = false; }

  if (cm.options.readOnly == "nocursor") { return }
  if (!cm.state.focused) {
    signal(cm, "focus", cm, e);
    cm.state.focused = true;
    addClass(cm.display.wrapper, "CodeMirror-focused");
    // This test prevents this from firing when a context
    // menu is closed (since the input reset would kill the
    // select-all detection hack)
    if (!cm.curOp && cm.display.selForContextMenu != cm.doc.sel) {
      cm.display.input.reset();
      if (webkit) { setTimeout(function () { return cm.display.input.reset(true); }, 20); } // Issue #1730
    }
    cm.display.input.receivedFocus();
  }
  restartBlink(cm);
}
function onBlur(cm, e) {
  if (cm.state.delayingBlurEvent) { return }

  if (cm.state.focused) {
    signal(cm, "blur", cm, e);
    cm.state.focused = false;
    rmClass(cm.display.wrapper, "CodeMirror-focused");
  }
  clearInterval(cm.display.blinker);
  setTimeout(function () { if (!cm.state.focused) { cm.display.shift = false; } }, 150);
}

// Read the actual heights of the rendered lines, and update their
// stored heights to match.
function updateHeightsInViewport(cm) {
  var display = cm.display;
  var prevBottom = display.lineDiv.offsetTop;
  for (var i = 0; i < display.view.length; i++) {
    var cur = display.view[i], height = (void 0);
    if (cur.hidden) { continue }
    if (ie && ie_version < 8) {
      var bot = cur.node.offsetTop + cur.node.offsetHeight;
      height = bot - prevBottom;
      prevBottom = bot;
    } else {
      var box = cur.node.getBoundingClientRect();
      height = box.bottom - box.top;
    }
    var diff = cur.line.height - height;
    if (height < 2) { height = textHeight(display); }
    if (diff > .005 || diff < -.005) {
      updateLineHeight(cur.line, height);
      updateWidgetHeight(cur.line);
      if (cur.rest) { for (var j = 0; j < cur.rest.length; j++)
        { updateWidgetHeight(cur.rest[j]); } }
    }
  }
}

// Read and store the height of line widgets associated with the
// given line.
function updateWidgetHeight(line) {
  if (line.widgets) { for (var i = 0; i < line.widgets.length; ++i) {
    var w = line.widgets[i], parent = w.node.parentNode;
    if (parent) { w.height = parent.offsetHeight; }
  } }
}

// Compute the lines that are visible in a given viewport (defaults
// the the current scroll position). viewport may contain top,
// height, and ensure (see op.scrollToPos) properties.
function visibleLines(display, doc, viewport) {
  var top = viewport && viewport.top != null ? Math.max(0, viewport.top) : display.scroller.scrollTop;
  top = Math.floor(top - paddingTop(display));
  var bottom = viewport && viewport.bottom != null ? viewport.bottom : top + display.wrapper.clientHeight;

  var from = lineAtHeight(doc, top), to = lineAtHeight(doc, bottom);
  // Ensure is a {from: {line, ch}, to: {line, ch}} object, and
  // forces those lines into the viewport (if possible).
  if (viewport && viewport.ensure) {
    var ensureFrom = viewport.ensure.from.line, ensureTo = viewport.ensure.to.line;
    if (ensureFrom < from) {
      from = ensureFrom;
      to = lineAtHeight(doc, heightAtLine(getLine(doc, ensureFrom)) + display.wrapper.clientHeight);
    } else if (Math.min(ensureTo, doc.lastLine()) >= to) {
      from = lineAtHeight(doc, heightAtLine(getLine(doc, ensureTo)) - display.wrapper.clientHeight);
      to = ensureTo;
    }
  }
  return {from: from, to: Math.max(to, from + 1)}
}

// Re-align line numbers and gutter marks to compensate for
// horizontal scrolling.
function alignHorizontally(cm) {
  var display = cm.display, view = display.view;
  if (!display.alignWidgets && (!display.gutters.firstChild || !cm.options.fixedGutter)) { return }
  var comp = compensateForHScroll(display) - display.scroller.scrollLeft + cm.doc.scrollLeft;
  var gutterW = display.gutters.offsetWidth, left = comp + "px";
  for (var i = 0; i < view.length; i++) { if (!view[i].hidden) {
    if (cm.options.fixedGutter) {
      if (view[i].gutter)
        { view[i].gutter.style.left = left; }
      if (view[i].gutterBackground)
        { view[i].gutterBackground.style.left = left; }
    }
    var align = view[i].alignable;
    if (align) { for (var j = 0; j < align.length; j++)
      { align[j].style.left = left; } }
  } }
  if (cm.options.fixedGutter)
    { display.gutters.style.left = (comp + gutterW) + "px"; }
}

// Used to ensure that the line number gutter is still the right
// size for the current document size. Returns true when an update
// is needed.
function maybeUpdateLineNumberWidth(cm) {
  if (!cm.options.lineNumbers) { return false }
  var doc = cm.doc, last = lineNumberFor(cm.options, doc.first + doc.size - 1), display = cm.display;
  if (last.length != display.lineNumChars) {
    var test = display.measure.appendChild(elt("div", [elt("div", last)],
                                               "CodeMirror-linenumber CodeMirror-gutter-elt"));
    var innerW = test.firstChild.offsetWidth, padding = test.offsetWidth - innerW;
    display.lineGutter.style.width = "";
    display.lineNumInnerWidth = Math.max(innerW, display.lineGutter.offsetWidth - padding) + 1;
    display.lineNumWidth = display.lineNumInnerWidth + padding;
    display.lineNumChars = display.lineNumInnerWidth ? last.length : -1;
    display.lineGutter.style.width = display.lineNumWidth + "px";
    updateGutterSpace(cm);
    return true
  }
  return false
}

// SCROLLING THINGS INTO VIEW

// If an editor sits on the top or bottom of the window, partially
// scrolled out of view, this ensures that the cursor is visible.
function maybeScrollWindow(cm, rect) {
  if (signalDOMEvent(cm, "scrollCursorIntoView")) { return }

  var display = cm.display, box = display.sizer.getBoundingClientRect(), doScroll = null;
  if (rect.top + box.top < 0) { doScroll = true; }
  else if (rect.bottom + box.top > (window.innerHeight || document.documentElement.clientHeight)) { doScroll = false; }
  if (doScroll != null && !phantom) {
    var scrollNode = elt("div", "\u200b", null, ("position: absolute;\n                         top: " + (rect.top - display.viewOffset - paddingTop(cm.display)) + "px;\n                         height: " + (rect.bottom - rect.top + scrollGap(cm) + display.barHeight) + "px;\n                         left: " + (rect.left) + "px; width: " + (Math.max(2, rect.right - rect.left)) + "px;"));
    cm.display.lineSpace.appendChild(scrollNode);
    scrollNode.scrollIntoView(doScroll);
    cm.display.lineSpace.removeChild(scrollNode);
  }
}

// Scroll a given position into view (immediately), verifying that
// it actually became visible (as line heights are accurately
// measured, the position of something may 'drift' during drawing).
function scrollPosIntoView(cm, pos, end, margin) {
  if (margin == null) { margin = 0; }
  var rect;
  if (!cm.options.lineWrapping && pos == end) {
    // Set pos and end to the cursor positions around the character pos sticks to
    // If pos.sticky == "before", that is around pos.ch - 1, otherwise around pos.ch
    // If pos == Pos(_, 0, "before"), pos and end are unchanged
    pos = pos.ch ? Pos(pos.line, pos.sticky == "before" ? pos.ch - 1 : pos.ch, "after") : pos;
    end = pos.sticky == "before" ? Pos(pos.line, pos.ch + 1, "before") : pos;
  }
  for (var limit = 0; limit < 5; limit++) {
    var changed = false;
    var coords = cursorCoords(cm, pos);
    var endCoords = !end || end == pos ? coords : cursorCoords(cm, end);
    rect = {left: Math.min(coords.left, endCoords.left),
            top: Math.min(coords.top, endCoords.top) - margin,
            right: Math.max(coords.left, endCoords.left),
            bottom: Math.max(coords.bottom, endCoords.bottom) + margin};
    var scrollPos = calculateScrollPos(cm, rect);
    var startTop = cm.doc.scrollTop, startLeft = cm.doc.scrollLeft;
    if (scrollPos.scrollTop != null) {
      updateScrollTop(cm, scrollPos.scrollTop);
      if (Math.abs(cm.doc.scrollTop - startTop) > 1) { changed = true; }
    }
    if (scrollPos.scrollLeft != null) {
      setScrollLeft(cm, scrollPos.scrollLeft);
      if (Math.abs(cm.doc.scrollLeft - startLeft) > 1) { changed = true; }
    }
    if (!changed) { break }
  }
  return rect
}

// Scroll a given set of coordinates into view (immediately).
function scrollIntoView(cm, rect) {
  var scrollPos = calculateScrollPos(cm, rect);
  if (scrollPos.scrollTop != null) { updateScrollTop(cm, scrollPos.scrollTop); }
  if (scrollPos.scrollLeft != null) { setScrollLeft(cm, scrollPos.scrollLeft); }
}

// Calculate a new scroll position needed to scroll the given
// rectangle into view. Returns an object with scrollTop and
// scrollLeft properties. When these are undefined, the
// vertical/horizontal position does not need to be adjusted.
function calculateScrollPos(cm, rect) {
  var display = cm.display, snapMargin = textHeight(cm.display);
  if (rect.top < 0) { rect.top = 0; }
  var screentop = cm.curOp && cm.curOp.scrollTop != null ? cm.curOp.scrollTop : display.scroller.scrollTop;
  var screen = displayHeight(cm), result = {};
  if (rect.bottom - rect.top > screen) { rect.bottom = rect.top + screen; }
  var docBottom = cm.doc.height + paddingVert(display);
  var atTop = rect.top < snapMargin, atBottom = rect.bottom > docBottom - snapMargin;
  if (rect.top < screentop) {
    result.scrollTop = atTop ? 0 : rect.top;
  } else if (rect.bottom > screentop + screen) {
    var newTop = Math.min(rect.top, (atBottom ? docBottom : rect.bottom) - screen);
    if (newTop != screentop) { result.scrollTop = newTop; }
  }

  var screenleft = cm.curOp && cm.curOp.scrollLeft != null ? cm.curOp.scrollLeft : display.scroller.scrollLeft;
  var screenw = displayWidth(cm) - (cm.options.fixedGutter ? display.gutters.offsetWidth : 0);
  var tooWide = rect.right - rect.left > screenw;
  if (tooWide) { rect.right = rect.left + screenw; }
  if (rect.left < 10)
    { result.scrollLeft = 0; }
  else if (rect.left < screenleft)
    { result.scrollLeft = Math.max(0, rect.left - (tooWide ? 0 : 10)); }
  else if (rect.right > screenw + screenleft - 3)
    { result.scrollLeft = rect.right + (tooWide ? 0 : 10) - screenw; }
  return result
}

// Store a relative adjustment to the scroll position in the current
// operation (to be applied when the operation finishes).
function addToScrollTop(cm, top) {
  if (top == null) { return }
  resolveScrollToPos(cm);
  cm.curOp.scrollTop = (cm.curOp.scrollTop == null ? cm.doc.scrollTop : cm.curOp.scrollTop) + top;
}

// Make sure that at the end of the operation the current cursor is
// shown.
function ensureCursorVisible(cm) {
  resolveScrollToPos(cm);
  var cur = cm.getCursor();
  cm.curOp.scrollToPos = {from: cur, to: cur, margin: cm.options.cursorScrollMargin};
}

function scrollToCoords(cm, x, y) {
  if (x != null || y != null) { resolveScrollToPos(cm); }
  if (x != null) { cm.curOp.scrollLeft = x; }
  if (y != null) { cm.curOp.scrollTop = y; }
}

function scrollToRange(cm, range$$1) {
  resolveScrollToPos(cm);
  cm.curOp.scrollToPos = range$$1;
}

// When an operation has its scrollToPos property set, and another
// scroll action is applied before the end of the operation, this
// 'simulates' scrolling that position into view in a cheap way, so
// that the effect of intermediate scroll commands is not ignored.
function resolveScrollToPos(cm) {
  var range$$1 = cm.curOp.scrollToPos;
  if (range$$1) {
    cm.curOp.scrollToPos = null;
    var from = estimateCoords(cm, range$$1.from), to = estimateCoords(cm, range$$1.to);
    scrollToCoordsRange(cm, from, to, range$$1.margin);
  }
}

function scrollToCoordsRange(cm, from, to, margin) {
  var sPos = calculateScrollPos(cm, {
    left: Math.min(from.left, to.left),
    top: Math.min(from.top, to.top) - margin,
    right: Math.max(from.right, to.right),
    bottom: Math.max(from.bottom, to.bottom) + margin
  });
  scrollToCoords(cm, sPos.scrollLeft, sPos.scrollTop);
}

// Sync the scrollable area and scrollbars, ensure the viewport
// covers the visible area.
function updateScrollTop(cm, val) {
  if (Math.abs(cm.doc.scrollTop - val) < 2) { return }
  if (!gecko) { updateDisplaySimple(cm, {top: val}); }
  setScrollTop(cm, val, true);
  if (gecko) { updateDisplaySimple(cm); }
  startWorker(cm, 100);
}

function setScrollTop(cm, val, forceScroll) {
  val = Math.min(cm.display.scroller.scrollHeight - cm.display.scroller.clientHeight, val);
  if (cm.display.scroller.scrollTop == val && !forceScroll) { return }
  cm.doc.scrollTop = val;
  cm.display.scrollbars.setScrollTop(val);
  if (cm.display.scroller.scrollTop != val) { cm.display.scroller.scrollTop = val; }
}

// Sync scroller and scrollbar, ensure the gutter elements are
// aligned.
function setScrollLeft(cm, val, isScroller, forceScroll) {
  val = Math.min(val, cm.display.scroller.scrollWidth - cm.display.scroller.clientWidth);
  if ((isScroller ? val == cm.doc.scrollLeft : Math.abs(cm.doc.scrollLeft - val) < 2) && !forceScroll) { return }
  cm.doc.scrollLeft = val;
  alignHorizontally(cm);
  if (cm.display.scroller.scrollLeft != val) { cm.display.scroller.scrollLeft = val; }
  cm.display.scrollbars.setScrollLeft(val);
}

// SCROLLBARS

// Prepare DOM reads needed to update the scrollbars. Done in one
// shot to minimize update/measure roundtrips.
function measureForScrollbars(cm) {
  var d = cm.display, gutterW = d.gutters.offsetWidth;
  var docH = Math.round(cm.doc.height + paddingVert(cm.display));
  return {
    clientHeight: d.scroller.clientHeight,
    viewHeight: d.wrapper.clientHeight,
    scrollWidth: d.scroller.scrollWidth, clientWidth: d.scroller.clientWidth,
    viewWidth: d.wrapper.clientWidth,
    barLeft: cm.options.fixedGutter ? gutterW : 0,
    docHeight: docH,
    scrollHeight: docH + scrollGap(cm) + d.barHeight,
    nativeBarWidth: d.nativeBarWidth,
    gutterWidth: gutterW
  }
}

var NativeScrollbars = function(place, scroll, cm) {
  this.cm = cm;
  var vert = this.vert = elt("div", [elt("div", null, null, "min-width: 1px")], "CodeMirror-vscrollbar");
  var horiz = this.horiz = elt("div", [elt("div", null, null, "height: 100%; min-height: 1px")], "CodeMirror-hscrollbar");
  vert.tabIndex = horiz.tabIndex = -1;
  place(vert); place(horiz);

  on(vert, "scroll", function () {
    if (vert.clientHeight) { scroll(vert.scrollTop, "vertical"); }
  });
  on(horiz, "scroll", function () {
    if (horiz.clientWidth) { scroll(horiz.scrollLeft, "horizontal"); }
  });

  this.checkedZeroWidth = false;
  // Need to set a minimum width to see the scrollbar on IE7 (but must not set it on IE8).
  if (ie && ie_version < 8) { this.horiz.style.minHeight = this.vert.style.minWidth = "18px"; }
};

NativeScrollbars.prototype.update = function (measure) {
  var needsH = measure.scrollWidth > measure.clientWidth + 1;
  var needsV = measure.scrollHeight > measure.clientHeight + 1;
  var sWidth = measure.nativeBarWidth;

  if (needsV) {
    this.vert.style.display = "block";
    this.vert.style.bottom = needsH ? sWidth + "px" : "0";
    var totalHeight = measure.viewHeight - (needsH ? sWidth : 0);
    // A bug in IE8 can cause this value to be negative, so guard it.
    this.vert.firstChild.style.height =
      Math.max(0, measure.scrollHeight - measure.clientHeight + totalHeight) + "px";
  } else {
    this.vert.style.display = "";
    this.vert.firstChild.style.height = "0";
  }

  if (needsH) {
    this.horiz.style.display = "block";
    this.horiz.style.right = needsV ? sWidth + "px" : "0";
    this.horiz.style.left = measure.barLeft + "px";
    var totalWidth = measure.viewWidth - measure.barLeft - (needsV ? sWidth : 0);
    this.horiz.firstChild.style.width =
      Math.max(0, measure.scrollWidth - measure.clientWidth + totalWidth) + "px";
  } else {
    this.horiz.style.display = "";
    this.horiz.firstChild.style.width = "0";
  }

  if (!this.checkedZeroWidth && measure.clientHeight > 0) {
    if (sWidth == 0) { this.zeroWidthHack(); }
    this.checkedZeroWidth = true;
  }

  return {right: needsV ? sWidth : 0, bottom: needsH ? sWidth : 0}
};

NativeScrollbars.prototype.setScrollLeft = function (pos) {
  if (this.horiz.scrollLeft != pos) { this.horiz.scrollLeft = pos; }
  if (this.disableHoriz) { this.enableZeroWidthBar(this.horiz, this.disableHoriz, "horiz"); }
};

NativeScrollbars.prototype.setScrollTop = function (pos) {
  if (this.vert.scrollTop != pos) { this.vert.scrollTop = pos; }
  if (this.disableVert) { this.enableZeroWidthBar(this.vert, this.disableVert, "vert"); }
};

NativeScrollbars.prototype.zeroWidthHack = function () {
  var w = mac && !mac_geMountainLion ? "12px" : "18px";
  this.horiz.style.height = this.vert.style.width = w;
  this.horiz.style.pointerEvents = this.vert.style.pointerEvents = "none";
  this.disableHoriz = new Delayed;
  this.disableVert = new Delayed;
};

NativeScrollbars.prototype.enableZeroWidthBar = function (bar, delay, type) {
  bar.style.pointerEvents = "auto";
  function maybeDisable() {
    // To find out whether the scrollbar is still visible, we
    // check whether the element under the pixel in the bottom
    // right corner of the scrollbar box is the scrollbar box
    // itself (when the bar is still visible) or its filler child
    // (when the bar is hidden). If it is still visible, we keep
    // it enabled, if it's hidden, we disable pointer events.
    var box = bar.getBoundingClientRect();
    var elt$$1 = type == "vert" ? document.elementFromPoint(box.right - 1, (box.top + box.bottom) / 2)
        : document.elementFromPoint((box.right + box.left) / 2, box.bottom - 1);
    if (elt$$1 != bar) { bar.style.pointerEvents = "none"; }
    else { delay.set(1000, maybeDisable); }
  }
  delay.set(1000, maybeDisable);
};

NativeScrollbars.prototype.clear = function () {
  var parent = this.horiz.parentNode;
  parent.removeChild(this.horiz);
  parent.removeChild(this.vert);
};

var NullScrollbars = function () {};

NullScrollbars.prototype.update = function () { return {bottom: 0, right: 0} };
NullScrollbars.prototype.setScrollLeft = function () {};
NullScrollbars.prototype.setScrollTop = function () {};
NullScrollbars.prototype.clear = function () {};

function updateScrollbars(cm, measure) {
  if (!measure) { measure = measureForScrollbars(cm); }
  var startWidth = cm.display.barWidth, startHeight = cm.display.barHeight;
  updateScrollbarsInner(cm, measure);
  for (var i = 0; i < 4 && startWidth != cm.display.barWidth || startHeight != cm.display.barHeight; i++) {
    if (startWidth != cm.display.barWidth && cm.options.lineWrapping)
      { updateHeightsInViewport(cm); }
    updateScrollbarsInner(cm, measureForScrollbars(cm));
    startWidth = cm.display.barWidth; startHeight = cm.display.barHeight;
  }
}

// Re-synchronize the fake scrollbars with the actual size of the
// content.
function updateScrollbarsInner(cm, measure) {
  var d = cm.display;
  var sizes = d.scrollbars.update(measure);

  d.sizer.style.paddingRight = (d.barWidth = sizes.right) + "px";
  d.sizer.style.paddingBottom = (d.barHeight = sizes.bottom) + "px";
  d.heightForcer.style.borderBottom = sizes.bottom + "px solid transparent";

  if (sizes.right && sizes.bottom) {
    d.scrollbarFiller.style.display = "block";
    d.scrollbarFiller.style.height = sizes.bottom + "px";
    d.scrollbarFiller.style.width = sizes.right + "px";
  } else { d.scrollbarFiller.style.display = ""; }
  if (sizes.bottom && cm.options.coverGutterNextToScrollbar && cm.options.fixedGutter) {
    d.gutterFiller.style.display = "block";
    d.gutterFiller.style.height = sizes.bottom + "px";
    d.gutterFiller.style.width = measure.gutterWidth + "px";
  } else { d.gutterFiller.style.display = ""; }
}

var scrollbarModel = {"native": NativeScrollbars, "null": NullScrollbars};

function initScrollbars(cm) {
  if (cm.display.scrollbars) {
    cm.display.scrollbars.clear();
    if (cm.display.scrollbars.addClass)
      { rmClass(cm.display.wrapper, cm.display.scrollbars.addClass); }
  }

  cm.display.scrollbars = new scrollbarModel[cm.options.scrollbarStyle](function (node) {
    cm.display.wrapper.insertBefore(node, cm.display.scrollbarFiller);
    // Prevent clicks in the scrollbars from killing focus
    on(node, "mousedown", function () {
      if (cm.state.focused) { setTimeout(function () { return cm.display.input.focus(); }, 0); }
    });
    node.setAttribute("cm-not-content", "true");
  }, function (pos, axis) {
    if (axis == "horizontal") { setScrollLeft(cm, pos); }
    else { updateScrollTop(cm, pos); }
  }, cm);
  if (cm.display.scrollbars.addClass)
    { addClass(cm.display.wrapper, cm.display.scrollbars.addClass); }
}

// Operations are used to wrap a series of changes to the editor
// state in such a way that each change won't have to update the
// cursor and display (which would be awkward, slow, and
// error-prone). Instead, display updates are batched and then all
// combined and executed at once.

var nextOpId = 0;
// Start a new operation.
function startOperation(cm) {
  cm.curOp = {
    cm: cm,
    viewChanged: false,      // Flag that indicates that lines might need to be redrawn
    startHeight: cm.doc.height, // Used to detect need to update scrollbar
    forceUpdate: false,      // Used to force a redraw
    updateInput: null,       // Whether to reset the input textarea
    typing: false,           // Whether this reset should be careful to leave existing text (for compositing)
    changeObjs: null,        // Accumulated changes, for firing change events
    cursorActivityHandlers: null, // Set of handlers to fire cursorActivity on
    cursorActivityCalled: 0, // Tracks which cursorActivity handlers have been called already
    selectionChanged: false, // Whether the selection needs to be redrawn
    updateMaxLine: false,    // Set when the widest line needs to be determined anew
    scrollLeft: null, scrollTop: null, // Intermediate scroll position, not pushed to DOM yet
    scrollToPos: null,       // Used to scroll to a specific position
    focus: false,
    id: ++nextOpId           // Unique ID
  };
  pushOperation(cm.curOp);
}

// Finish an operation, updating the display and signalling delayed events
function endOperation(cm) {
  var op = cm.curOp;
  finishOperation(op, function (group) {
    for (var i = 0; i < group.ops.length; i++)
      { group.ops[i].cm.curOp = null; }
    endOperations(group);
  });
}

// The DOM updates done when an operation finishes are batched so
// that the minimum number of relayouts are required.
function endOperations(group) {
  var ops = group.ops;
  for (var i = 0; i < ops.length; i++) // Read DOM
    { endOperation_R1(ops[i]); }
  for (var i$1 = 0; i$1 < ops.length; i$1++) // Write DOM (maybe)
    { endOperation_W1(ops[i$1]); }
  for (var i$2 = 0; i$2 < ops.length; i$2++) // Read DOM
    { endOperation_R2(ops[i$2]); }
  for (var i$3 = 0; i$3 < ops.length; i$3++) // Write DOM (maybe)
    { endOperation_W2(ops[i$3]); }
  for (var i$4 = 0; i$4 < ops.length; i$4++) // Read DOM
    { endOperation_finish(ops[i$4]); }
}

function endOperation_R1(op) {
  var cm = op.cm, display = cm.display;
  maybeClipScrollbars(cm);
  if (op.updateMaxLine) { findMaxLine(cm); }

  op.mustUpdate = op.viewChanged || op.forceUpdate || op.scrollTop != null ||
    op.scrollToPos && (op.scrollToPos.from.line < display.viewFrom ||
                       op.scrollToPos.to.line >= display.viewTo) ||
    display.maxLineChanged && cm.options.lineWrapping;
  op.update = op.mustUpdate &&
    new DisplayUpdate(cm, op.mustUpdate && {top: op.scrollTop, ensure: op.scrollToPos}, op.forceUpdate);
}

function endOperation_W1(op) {
  op.updatedDisplay = op.mustUpdate && updateDisplayIfNeeded(op.cm, op.update);
}

function endOperation_R2(op) {
  var cm = op.cm, display = cm.display;
  if (op.updatedDisplay) { updateHeightsInViewport(cm); }

  op.barMeasure = measureForScrollbars(cm);

  // If the max line changed since it was last measured, measure it,
  // and ensure the document's width matches it.
  // updateDisplay_W2 will use these properties to do the actual resizing
  if (display.maxLineChanged && !cm.options.lineWrapping) {
    op.adjustWidthTo = measureChar(cm, display.maxLine, display.maxLine.text.length).left + 3;
    cm.display.sizerWidth = op.adjustWidthTo;
    op.barMeasure.scrollWidth =
      Math.max(display.scroller.clientWidth, display.sizer.offsetLeft + op.adjustWidthTo + scrollGap(cm) + cm.display.barWidth);
    op.maxScrollLeft = Math.max(0, display.sizer.offsetLeft + op.adjustWidthTo - displayWidth(cm));
  }

  if (op.updatedDisplay || op.selectionChanged)
    { op.preparedSelection = display.input.prepareSelection(); }
}

function endOperation_W2(op) {
  var cm = op.cm;

  if (op.adjustWidthTo != null) {
    cm.display.sizer.style.minWidth = op.adjustWidthTo + "px";
    if (op.maxScrollLeft < cm.doc.scrollLeft)
      { setScrollLeft(cm, Math.min(cm.display.scroller.scrollLeft, op.maxScrollLeft), true); }
    cm.display.maxLineChanged = false;
  }

  var takeFocus = op.focus && op.focus == activeElt();
  if (op.preparedSelection)
    { cm.display.input.showSelection(op.preparedSelection, takeFocus); }
  if (op.updatedDisplay || op.startHeight != cm.doc.height)
    { updateScrollbars(cm, op.barMeasure); }
  if (op.updatedDisplay)
    { setDocumentHeight(cm, op.barMeasure); }

  if (op.selectionChanged) { restartBlink(cm); }

  if (cm.state.focused && op.updateInput)
    { cm.display.input.reset(op.typing); }
  if (takeFocus) { ensureFocus(op.cm); }
}

function endOperation_finish(op) {
  var cm = op.cm, display = cm.display, doc = cm.doc;

  if (op.updatedDisplay) { postUpdateDisplay(cm, op.update); }

  // Abort mouse wheel delta measurement, when scrolling explicitly
  if (display.wheelStartX != null && (op.scrollTop != null || op.scrollLeft != null || op.scrollToPos))
    { display.wheelStartX = display.wheelStartY = null; }

  // Propagate the scroll position to the actual DOM scroller
  if (op.scrollTop != null) { setScrollTop(cm, op.scrollTop, op.forceScroll); }

  if (op.scrollLeft != null) { setScrollLeft(cm, op.scrollLeft, true, true); }
  // If we need to scroll a specific position into view, do so.
  if (op.scrollToPos) {
    var rect = scrollPosIntoView(cm, clipPos(doc, op.scrollToPos.from),
                                 clipPos(doc, op.scrollToPos.to), op.scrollToPos.margin);
    maybeScrollWindow(cm, rect);
  }

  // Fire events for markers that are hidden/unidden by editing or
  // undoing
  var hidden = op.maybeHiddenMarkers, unhidden = op.maybeUnhiddenMarkers;
  if (hidden) { for (var i = 0; i < hidden.length; ++i)
    { if (!hidden[i].lines.length) { signal(hidden[i], "hide"); } } }
  if (unhidden) { for (var i$1 = 0; i$1 < unhidden.length; ++i$1)
    { if (unhidden[i$1].lines.length) { signal(unhidden[i$1], "unhide"); } } }

  if (display.wrapper.offsetHeight)
    { doc.scrollTop = cm.display.scroller.scrollTop; }

  // Fire change events, and delayed event handlers
  if (op.changeObjs)
    { signal(cm, "changes", cm, op.changeObjs); }
  if (op.update)
    { op.update.finish(); }
}

// Run the given function in an operation
function runInOp(cm, f) {
  if (cm.curOp) { return f() }
  startOperation(cm);
  try { return f() }
  finally { endOperation(cm); }
}
// Wraps a function in an operation. Returns the wrapped function.
function operation(cm, f) {
  return function() {
    if (cm.curOp) { return f.apply(cm, arguments) }
    startOperation(cm);
    try { return f.apply(cm, arguments) }
    finally { endOperation(cm); }
  }
}
// Used to add methods to editor and doc instances, wrapping them in
// operations.
function methodOp(f) {
  return function() {
    if (this.curOp) { return f.apply(this, arguments) }
    startOperation(this);
    try { return f.apply(this, arguments) }
    finally { endOperation(this); }
  }
}
function docMethodOp(f) {
  return function() {
    var cm = this.cm;
    if (!cm || cm.curOp) { return f.apply(this, arguments) }
    startOperation(cm);
    try { return f.apply(this, arguments) }
    finally { endOperation(cm); }
  }
}

// Updates the display.view data structure for a given change to the
// document. From and to are in pre-change coordinates. Lendiff is
// the amount of lines added or subtracted by the change. This is
// used for changes that span multiple lines, or change the way
// lines are divided into visual lines. regLineChange (below)
// registers single-line changes.
function regChange(cm, from, to, lendiff) {
  if (from == null) { from = cm.doc.first; }
  if (to == null) { to = cm.doc.first + cm.doc.size; }
  if (!lendiff) { lendiff = 0; }

  var display = cm.display;
  if (lendiff && to < display.viewTo &&
      (display.updateLineNumbers == null || display.updateLineNumbers > from))
    { display.updateLineNumbers = from; }

  cm.curOp.viewChanged = true;

  if (from >= display.viewTo) { // Change after
    if (sawCollapsedSpans && visualLineNo(cm.doc, from) < display.viewTo)
      { resetView(cm); }
  } else if (to <= display.viewFrom) { // Change before
    if (sawCollapsedSpans && visualLineEndNo(cm.doc, to + lendiff) > display.viewFrom) {
      resetView(cm);
    } else {
      display.viewFrom += lendiff;
      display.viewTo += lendiff;
    }
  } else if (from <= display.viewFrom && to >= display.viewTo) { // Full overlap
    resetView(cm);
  } else if (from <= display.viewFrom) { // Top overlap
    var cut = viewCuttingPoint(cm, to, to + lendiff, 1);
    if (cut) {
      display.view = display.view.slice(cut.index);
      display.viewFrom = cut.lineN;
      display.viewTo += lendiff;
    } else {
      resetView(cm);
    }
  } else if (to >= display.viewTo) { // Bottom overlap
    var cut$1 = viewCuttingPoint(cm, from, from, -1);
    if (cut$1) {
      display.view = display.view.slice(0, cut$1.index);
      display.viewTo = cut$1.lineN;
    } else {
      resetView(cm);
    }
  } else { // Gap in the middle
    var cutTop = viewCuttingPoint(cm, from, from, -1);
    var cutBot = viewCuttingPoint(cm, to, to + lendiff, 1);
    if (cutTop && cutBot) {
      display.view = display.view.slice(0, cutTop.index)
        .concat(buildViewArray(cm, cutTop.lineN, cutBot.lineN))
        .concat(display.view.slice(cutBot.index));
      display.viewTo += lendiff;
    } else {
      resetView(cm);
    }
  }

  var ext = display.externalMeasured;
  if (ext) {
    if (to < ext.lineN)
      { ext.lineN += lendiff; }
    else if (from < ext.lineN + ext.size)
      { display.externalMeasured = null; }
  }
}

// Register a change to a single line. Type must be one of "text",
// "gutter", "class", "widget"
function regLineChange(cm, line, type) {
  cm.curOp.viewChanged = true;
  var display = cm.display, ext = cm.display.externalMeasured;
  if (ext && line >= ext.lineN && line < ext.lineN + ext.size)
    { display.externalMeasured = null; }

  if (line < display.viewFrom || line >= display.viewTo) { return }
  var lineView = display.view[findViewIndex(cm, line)];
  if (lineView.node == null) { return }
  var arr = lineView.changes || (lineView.changes = []);
  if (indexOf(arr, type) == -1) { arr.push(type); }
}

// Clear the view.
function resetView(cm) {
  cm.display.viewFrom = cm.display.viewTo = cm.doc.first;
  cm.display.view = [];
  cm.display.viewOffset = 0;
}

function viewCuttingPoint(cm, oldN, newN, dir) {
  var index = findViewIndex(cm, oldN), diff, view = cm.display.view;
  if (!sawCollapsedSpans || newN == cm.doc.first + cm.doc.size)
    { return {index: index, lineN: newN} }
  var n = cm.display.viewFrom;
  for (var i = 0; i < index; i++)
    { n += view[i].size; }
  if (n != oldN) {
    if (dir > 0) {
      if (index == view.length - 1) { return null }
      diff = (n + view[index].size) - oldN;
      index++;
    } else {
      diff = n - oldN;
    }
    oldN += diff; newN += diff;
  }
  while (visualLineNo(cm.doc, newN) != newN) {
    if (index == (dir < 0 ? 0 : view.length - 1)) { return null }
    newN += dir * view[index - (dir < 0 ? 1 : 0)].size;
    index += dir;
  }
  return {index: index, lineN: newN}
}

// Force the view to cover a given range, adding empty view element
// or clipping off existing ones as needed.
function adjustView(cm, from, to) {
  var display = cm.display, view = display.view;
  if (view.length == 0 || from >= display.viewTo || to <= display.viewFrom) {
    display.view = buildViewArray(cm, from, to);
    display.viewFrom = from;
  } else {
    if (display.viewFrom > from)
      { display.view = buildViewArray(cm, from, display.viewFrom).concat(display.view); }
    else if (display.viewFrom < from)
      { display.view = display.view.slice(findViewIndex(cm, from)); }
    display.viewFrom = from;
    if (display.viewTo < to)
      { display.view = display.view.concat(buildViewArray(cm, display.viewTo, to)); }
    else if (display.viewTo > to)
      { display.view = display.view.slice(0, findViewIndex(cm, to)); }
  }
  display.viewTo = to;
}

// Count the number of lines in the view whose DOM representation is
// out of date (or nonexistent).
function countDirtyView(cm) {
  var view = cm.display.view, dirty = 0;
  for (var i = 0; i < view.length; i++) {
    var lineView = view[i];
    if (!lineView.hidden && (!lineView.node || lineView.changes)) { ++dirty; }
  }
  return dirty
}

// HIGHLIGHT WORKER

function startWorker(cm, time) {
  if (cm.doc.highlightFrontier < cm.display.viewTo)
    { cm.state.highlight.set(time, bind(highlightWorker, cm)); }
}

function highlightWorker(cm) {
  var doc = cm.doc;
  if (doc.highlightFrontier >= cm.display.viewTo) { return }
  var end = +new Date + cm.options.workTime;
  var context = getContextBefore(cm, doc.highlightFrontier);
  var changedLines = [];

  doc.iter(context.line, Math.min(doc.first + doc.size, cm.display.viewTo + 500), function (line) {
    if (context.line >= cm.display.viewFrom) { // Visible
      var oldStyles = line.styles;
      var resetState = line.text.length > cm.options.maxHighlightLength ? copyState(doc.mode, context.state) : null;
      var highlighted = highlightLine(cm, line, context, true);
      if (resetState) { context.state = resetState; }
      line.styles = highlighted.styles;
      var oldCls = line.styleClasses, newCls = highlighted.classes;
      if (newCls) { line.styleClasses = newCls; }
      else if (oldCls) { line.styleClasses = null; }
      var ischange = !oldStyles || oldStyles.length != line.styles.length ||
        oldCls != newCls && (!oldCls || !newCls || oldCls.bgClass != newCls.bgClass || oldCls.textClass != newCls.textClass);
      for (var i = 0; !ischange && i < oldStyles.length; ++i) { ischange = oldStyles[i] != line.styles[i]; }
      if (ischange) { changedLines.push(context.line); }
      line.stateAfter = context.save();
      context.nextLine();
    } else {
      if (line.text.length <= cm.options.maxHighlightLength)
        { processLine(cm, line.text, context); }
      line.stateAfter = context.line % 5 == 0 ? context.save() : null;
      context.nextLine();
    }
    if (+new Date > end) {
      startWorker(cm, cm.options.workDelay);
      return true
    }
  });
  doc.highlightFrontier = context.line;
  doc.modeFrontier = Math.max(doc.modeFrontier, context.line);
  if (changedLines.length) { runInOp(cm, function () {
    for (var i = 0; i < changedLines.length; i++)
      { regLineChange(cm, changedLines[i], "text"); }
  }); }
}

// DISPLAY DRAWING

var DisplayUpdate = function(cm, viewport, force) {
  var display = cm.display;

  this.viewport = viewport;
  // Store some values that we'll need later (but don't want to force a relayout for)
  this.visible = visibleLines(display, cm.doc, viewport);
  this.editorIsHidden = !display.wrapper.offsetWidth;
  this.wrapperHeight = display.wrapper.clientHeight;
  this.wrapperWidth = display.wrapper.clientWidth;
  this.oldDisplayWidth = displayWidth(cm);
  this.force = force;
  this.dims = getDimensions(cm);
  this.events = [];
};

DisplayUpdate.prototype.signal = function (emitter, type) {
  if (hasHandler(emitter, type))
    { this.events.push(arguments); }
};
DisplayUpdate.prototype.finish = function () {
    var this$1 = this;

  for (var i = 0; i < this.events.length; i++)
    { signal.apply(null, this$1.events[i]); }
};

function maybeClipScrollbars(cm) {
  var display = cm.display;
  if (!display.scrollbarsClipped && display.scroller.offsetWidth) {
    display.nativeBarWidth = display.scroller.offsetWidth - display.scroller.clientWidth;
    display.heightForcer.style.height = scrollGap(cm) + "px";
    display.sizer.style.marginBottom = -display.nativeBarWidth + "px";
    display.sizer.style.borderRightWidth = scrollGap(cm) + "px";
    display.scrollbarsClipped = true;
  }
}

function selectionSnapshot(cm) {
  if (cm.hasFocus()) { return null }
  var active = activeElt();
  if (!active || !contains(cm.display.lineDiv, active)) { return null }
  var result = {activeElt: active};
  if (window.getSelection) {
    var sel = window.getSelection();
    if (sel.anchorNode && sel.extend && contains(cm.display.lineDiv, sel.anchorNode)) {
      result.anchorNode = sel.anchorNode;
      result.anchorOffset = sel.anchorOffset;
      result.focusNode = sel.focusNode;
      result.focusOffset = sel.focusOffset;
    }
  }
  return result
}

function restoreSelection(snapshot) {
  if (!snapshot || !snapshot.activeElt || snapshot.activeElt == activeElt()) { return }
  snapshot.activeElt.focus();
  if (snapshot.anchorNode && contains(document.body, snapshot.anchorNode) && contains(document.body, snapshot.focusNode)) {
    var sel = window.getSelection(), range$$1 = document.createRange();
    range$$1.setEnd(snapshot.anchorNode, snapshot.anchorOffset);
    range$$1.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range$$1);
    sel.extend(snapshot.focusNode, snapshot.focusOffset);
  }
}

// Does the actual updating of the line display. Bails out
// (returning false) when there is nothing to be done and forced is
// false.
function updateDisplayIfNeeded(cm, update) {
  var display = cm.display, doc = cm.doc;

  if (update.editorIsHidden) {
    resetView(cm);
    return false
  }

  // Bail out if the visible area is already rendered and nothing changed.
  if (!update.force &&
      update.visible.from >= display.viewFrom && update.visible.to <= display.viewTo &&
      (display.updateLineNumbers == null || display.updateLineNumbers >= display.viewTo) &&
      display.renderedView == display.view && countDirtyView(cm) == 0)
    { return false }

  if (maybeUpdateLineNumberWidth(cm)) {
    resetView(cm);
    update.dims = getDimensions(cm);
  }

  // Compute a suitable new viewport (from & to)
  var end = doc.first + doc.size;
  var from = Math.max(update.visible.from - cm.options.viewportMargin, doc.first);
  var to = Math.min(end, update.visible.to + cm.options.viewportMargin);
  if (display.viewFrom < from && from - display.viewFrom < 20) { from = Math.max(doc.first, display.viewFrom); }
  if (display.viewTo > to && display.viewTo - to < 20) { to = Math.min(end, display.viewTo); }
  if (sawCollapsedSpans) {
    from = visualLineNo(cm.doc, from);
    to = visualLineEndNo(cm.doc, to);
  }

  var different = from != display.viewFrom || to != display.viewTo ||
    display.lastWrapHeight != update.wrapperHeight || display.lastWrapWidth != update.wrapperWidth;
  adjustView(cm, from, to);

  display.viewOffset = heightAtLine(getLine(cm.doc, display.viewFrom));
  // Position the mover div to align with the current scroll position
  cm.display.mover.style.top = display.viewOffset + "px";

  var toUpdate = countDirtyView(cm);
  if (!different && toUpdate == 0 && !update.force && display.renderedView == display.view &&
      (display.updateLineNumbers == null || display.updateLineNumbers >= display.viewTo))
    { return false }

  // For big changes, we hide the enclosing element during the
  // update, since that speeds up the operations on most browsers.
  var selSnapshot = selectionSnapshot(cm);
  if (toUpdate > 4) { display.lineDiv.style.display = "none"; }
  patchDisplay(cm, display.updateLineNumbers, update.dims);
  if (toUpdate > 4) { display.lineDiv.style.display = ""; }
  display.renderedView = display.view;
  // There might have been a widget with a focused element that got
  // hidden or updated, if so re-focus it.
  restoreSelection(selSnapshot);

  // Prevent selection and cursors from interfering with the scroll
  // width and height.
  removeChildren(display.cursorDiv);
  removeChildren(display.selectionDiv);
  display.gutters.style.height = display.sizer.style.minHeight = 0;

  if (different) {
    display.lastWrapHeight = update.wrapperHeight;
    display.lastWrapWidth = update.wrapperWidth;
    startWorker(cm, 400);
  }

  display.updateLineNumbers = null;

  return true
}

function postUpdateDisplay(cm, update) {
  var viewport = update.viewport;

  for (var first = true;; first = false) {
    if (!first || !cm.options.lineWrapping || update.oldDisplayWidth == displayWidth(cm)) {
      // Clip forced viewport to actual scrollable area.
      if (viewport && viewport.top != null)
        { viewport = {top: Math.min(cm.doc.height + paddingVert(cm.display) - displayHeight(cm), viewport.top)}; }
      // Updated line heights might result in the drawn area not
      // actually covering the viewport. Keep looping until it does.
      update.visible = visibleLines(cm.display, cm.doc, viewport);
      if (update.visible.from >= cm.display.viewFrom && update.visible.to <= cm.display.viewTo)
        { break }
    }
    if (!updateDisplayIfNeeded(cm, update)) { break }
    updateHeightsInViewport(cm);
    var barMeasure = measureForScrollbars(cm);
    updateSelection(cm);
    updateScrollbars(cm, barMeasure);
    setDocumentHeight(cm, barMeasure);
    update.force = false;
  }

  update.signal(cm, "update", cm);
  if (cm.display.viewFrom != cm.display.reportedViewFrom || cm.display.viewTo != cm.display.reportedViewTo) {
    update.signal(cm, "viewportChange", cm, cm.display.viewFrom, cm.display.viewTo);
    cm.display.reportedViewFrom = cm.display.viewFrom; cm.display.reportedViewTo = cm.display.viewTo;
  }
}

function updateDisplaySimple(cm, viewport) {
  var update = new DisplayUpdate(cm, viewport);
  if (updateDisplayIfNeeded(cm, update)) {
    updateHeightsInViewport(cm);
    postUpdateDisplay(cm, update);
    var barMeasure = measureForScrollbars(cm);
    updateSelection(cm);
    updateScrollbars(cm, barMeasure);
    setDocumentHeight(cm, barMeasure);
    update.finish();
  }
}

// Sync the actual display DOM structure with display.view, removing
// nodes for lines that are no longer in view, and creating the ones
// that are not there yet, and updating the ones that are out of
// date.
function patchDisplay(cm, updateNumbersFrom, dims) {
  var display = cm.display, lineNumbers = cm.options.lineNumbers;
  var container = display.lineDiv, cur = container.firstChild;

  function rm(node) {
    var next = node.nextSibling;
    // Works around a throw-scroll bug in OS X Webkit
    if (webkit && mac && cm.display.currentWheelTarget == node)
      { node.style.display = "none"; }
    else
      { node.parentNode.removeChild(node); }
    return next
  }

  var view = display.view, lineN = display.viewFrom;
  // Loop over the elements in the view, syncing cur (the DOM nodes
  // in display.lineDiv) with the view as we go.
  for (var i = 0; i < view.length; i++) {
    var lineView = view[i];
    if (lineView.hidden) {
    } else if (!lineView.node || lineView.node.parentNode != container) { // Not drawn yet
      var node = buildLineElement(cm, lineView, lineN, dims);
      container.insertBefore(node, cur);
    } else { // Already drawn
      while (cur != lineView.node) { cur = rm(cur); }
      var updateNumber = lineNumbers && updateNumbersFrom != null &&
        updateNumbersFrom <= lineN && lineView.lineNumber;
      if (lineView.changes) {
        if (indexOf(lineView.changes, "gutter") > -1) { updateNumber = false; }
        updateLineForChanges(cm, lineView, lineN, dims);
      }
      if (updateNumber) {
        removeChildren(lineView.lineNumber);
        lineView.lineNumber.appendChild(document.createTextNode(lineNumberFor(cm.options, lineN)));
      }
      cur = lineView.node.nextSibling;
    }
    lineN += lineView.size;
  }
  while (cur) { cur = rm(cur); }
}

function updateGutterSpace(cm) {
  var width = cm.display.gutters.offsetWidth;
  cm.display.sizer.style.marginLeft = width + "px";
}

function setDocumentHeight(cm, measure) {
  cm.display.sizer.style.minHeight = measure.docHeight + "px";
  cm.display.heightForcer.style.top = measure.docHeight + "px";
  cm.display.gutters.style.height = (measure.docHeight + cm.display.barHeight + scrollGap(cm)) + "px";
}

// Rebuild the gutter elements, ensure the margin to the left of the
// code matches their width.
function updateGutters(cm) {
  var gutters = cm.display.gutters, specs = cm.options.gutters;
  removeChildren(gutters);
  var i = 0;
  for (; i < specs.length; ++i) {
    var gutterClass = specs[i];
    var gElt = gutters.appendChild(elt("div", null, "CodeMirror-gutter " + gutterClass));
    if (gutterClass == "CodeMirror-linenumbers") {
      cm.display.lineGutter = gElt;
      gElt.style.width = (cm.display.lineNumWidth || 1) + "px";
    }
  }
  gutters.style.display = i ? "" : "none";
  updateGutterSpace(cm);
}

// Make sure the gutters options contains the element
// "CodeMirror-linenumbers" when the lineNumbers option is true.
function setGuttersForLineNumbers(options) {
  var found = indexOf(options.gutters, "CodeMirror-linenumbers");
  if (found == -1 && options.lineNumbers) {
    options.gutters = options.gutters.concat(["CodeMirror-linenumbers"]);
  } else if (found > -1 && !options.lineNumbers) {
    options.gutters = options.gutters.slice(0);
    options.gutters.splice(found, 1);
  }
}

// Since the delta values reported on mouse wheel events are
// unstandardized between browsers and even browser versions, and
// generally horribly unpredictable, this code starts by measuring
// the scroll effect that the first few mouse wheel events have,
// and, from that, detects the way it can convert deltas to pixel
// offsets afterwards.
//
// The reason we want to know the amount a wheel event will scroll
// is that it gives us a chance to update the display before the
// actual scrolling happens, reducing flickering.

var wheelSamples = 0;
var wheelPixelsPerUnit = null;
// Fill in a browser-detected starting value on browsers where we
// know one. These don't have to be accurate -- the result of them
// being wrong would just be a slight flicker on the first wheel
// scroll (if it is large enough).
if (ie) { wheelPixelsPerUnit = -.53; }
else if (gecko) { wheelPixelsPerUnit = 15; }
else if (chrome) { wheelPixelsPerUnit = -.7; }
else if (safari) { wheelPixelsPerUnit = -1/3; }

function wheelEventDelta(e) {
  var dx = e.wheelDeltaX, dy = e.wheelDeltaY;
  if (dx == null && e.detail && e.axis == e.HORIZONTAL_AXIS) { dx = e.detail; }
  if (dy == null && e.detail && e.axis == e.VERTICAL_AXIS) { dy = e.detail; }
  else if (dy == null) { dy = e.wheelDelta; }
  return {x: dx, y: dy}
}
function wheelEventPixels(e) {
  var delta = wheelEventDelta(e);
  delta.x *= wheelPixelsPerUnit;
  delta.y *= wheelPixelsPerUnit;
  return delta
}

function onScrollWheel(cm, e) {
  var delta = wheelEventDelta(e), dx = delta.x, dy = delta.y;

  var display = cm.display, scroll = display.scroller;
  // Quit if there's nothing to scroll here
  var canScrollX = scroll.scrollWidth > scroll.clientWidth;
  var canScrollY = scroll.scrollHeight > scroll.clientHeight;
  if (!(dx && canScrollX || dy && canScrollY)) { return }

  // Webkit browsers on OS X abort momentum scrolls when the target
  // of the scroll event is removed from the scrollable element.
  // This hack (see related code in patchDisplay) makes sure the
  // element is kept around.
  if (dy && mac && webkit) {
    outer: for (var cur = e.target, view = display.view; cur != scroll; cur = cur.parentNode) {
      for (var i = 0; i < view.length; i++) {
        if (view[i].node == cur) {
          cm.display.currentWheelTarget = cur;
          break outer
        }
      }
    }
  }

  // On some browsers, horizontal scrolling will cause redraws to
  // happen before the gutter has been realigned, causing it to
  // wriggle around in a most unseemly way. When we have an
  // estimated pixels/delta value, we just handle horizontal
  // scrolling entirely here. It'll be slightly off from native, but
  // better than glitching out.
  if (dx && !gecko && !presto && wheelPixelsPerUnit != null) {
    if (dy && canScrollY)
      { updateScrollTop(cm, Math.max(0, scroll.scrollTop + dy * wheelPixelsPerUnit)); }
    setScrollLeft(cm, Math.max(0, scroll.scrollLeft + dx * wheelPixelsPerUnit));
    // Only prevent default scrolling if vertical scrolling is
    // actually possible. Otherwise, it causes vertical scroll
    // jitter on OSX trackpads when deltaX is small and deltaY
    // is large (issue #3579)
    if (!dy || (dy && canScrollY))
      { e_preventDefault(e); }
    display.wheelStartX = null; // Abort measurement, if in progress
    return
  }

  // 'Project' the visible viewport to cover the area that is being
  // scrolled into view (if we know enough to estimate it).
  if (dy && wheelPixelsPerUnit != null) {
    var pixels = dy * wheelPixelsPerUnit;
    var top = cm.doc.scrollTop, bot = top + display.wrapper.clientHeight;
    if (pixels < 0) { top = Math.max(0, top + pixels - 50); }
    else { bot = Math.min(cm.doc.height, bot + pixels + 50); }
    updateDisplaySimple(cm, {top: top, bottom: bot});
  }

  if (wheelSamples < 20) {
    if (display.wheelStartX == null) {
      display.wheelStartX = scroll.scrollLeft; display.wheelStartY = scroll.scrollTop;
      display.wheelDX = dx; display.wheelDY = dy;
      setTimeout(function () {
        if (display.wheelStartX == null) { return }
        var movedX = scroll.scrollLeft - display.wheelStartX;
        var movedY = scroll.scrollTop - display.wheelStartY;
        var sample = (movedY && display.wheelDY && movedY / display.wheelDY) ||
          (movedX && display.wheelDX && movedX / display.wheelDX);
        display.wheelStartX = display.wheelStartY = null;
        if (!sample) { return }
        wheelPixelsPerUnit = (wheelPixelsPerUnit * wheelSamples + sample) / (wheelSamples + 1);
        ++wheelSamples;
      }, 200);
    } else {
      display.wheelDX += dx; display.wheelDY += dy;
    }
  }
}

// Selection objects are immutable. A new one is created every time
// the selection changes. A selection is one or more non-overlapping
// (and non-touching) ranges, sorted, and an integer that indicates
// which one is the primary selection (the one that's scrolled into
// view, that getCursor returns, etc).
var Selection = function(ranges, primIndex) {
  this.ranges = ranges;
  this.primIndex = primIndex;
};

Selection.prototype.primary = function () { return this.ranges[this.primIndex] };

Selection.prototype.equals = function (other) {
    var this$1 = this;

  if (other == this) { return true }
  if (other.primIndex != this.primIndex || other.ranges.length != this.ranges.length) { return false }
  for (var i = 0; i < this.ranges.length; i++) {
    var here = this$1.ranges[i], there = other.ranges[i];
    if (!equalCursorPos(here.anchor, there.anchor) || !equalCursorPos(here.head, there.head)) { return false }
  }
  return true
};

Selection.prototype.deepCopy = function () {
    var this$1 = this;

  var out = [];
  for (var i = 0; i < this.ranges.length; i++)
    { out[i] = new Range(copyPos(this$1.ranges[i].anchor), copyPos(this$1.ranges[i].head)); }
  return new Selection(out, this.primIndex)
};

Selection.prototype.somethingSelected = function () {
    var this$1 = this;

  for (var i = 0; i < this.ranges.length; i++)
    { if (!this$1.ranges[i].empty()) { return true } }
  return false
};

Selection.prototype.contains = function (pos, end) {
    var this$1 = this;

  if (!end) { end = pos; }
  for (var i = 0; i < this.ranges.length; i++) {
    var range = this$1.ranges[i];
    if (cmp(end, range.from()) >= 0 && cmp(pos, range.to()) <= 0)
      { return i }
  }
  return -1
};

var Range = function(anchor, head) {
  this.anchor = anchor; this.head = head;
};

Range.prototype.from = function () { return minPos(this.anchor, this.head) };
Range.prototype.to = function () { return maxPos(this.anchor, this.head) };
Range.prototype.empty = function () { return this.head.line == this.anchor.line && this.head.ch == this.anchor.ch };

// Take an unsorted, potentially overlapping set of ranges, and
// build a selection out of it. 'Consumes' ranges array (modifying
// it).
function normalizeSelection(ranges, primIndex) {
  var prim = ranges[primIndex];
  ranges.sort(function (a, b) { return cmp(a.from(), b.from()); });
  primIndex = indexOf(ranges, prim);
  for (var i = 1; i < ranges.length; i++) {
    var cur = ranges[i], prev = ranges[i - 1];
    if (cmp(prev.to(), cur.from()) >= 0) {
      var from = minPos(prev.from(), cur.from()), to = maxPos(prev.to(), cur.to());
      var inv = prev.empty() ? cur.from() == cur.head : prev.from() == prev.head;
      if (i <= primIndex) { --primIndex; }
      ranges.splice(--i, 2, new Range(inv ? to : from, inv ? from : to));
    }
  }
  return new Selection(ranges, primIndex)
}

function simpleSelection(anchor, head) {
  return new Selection([new Range(anchor, head || anchor)], 0)
}

// Compute the position of the end of a change (its 'to' property
// refers to the pre-change end).
function changeEnd(change) {
  if (!change.text) { return change.to }
  return Pos(change.from.line + change.text.length - 1,
             lst(change.text).length + (change.text.length == 1 ? change.from.ch : 0))
}

// Adjust a position to refer to the post-change position of the
// same text, or the end of the change if the change covers it.
function adjustForChange(pos, change) {
  if (cmp(pos, change.from) < 0) { return pos }
  if (cmp(pos, change.to) <= 0) { return changeEnd(change) }

  var line = pos.line + change.text.length - (change.to.line - change.from.line) - 1, ch = pos.ch;
  if (pos.line == change.to.line) { ch += changeEnd(change).ch - change.to.ch; }
  return Pos(line, ch)
}

function computeSelAfterChange(doc, change) {
  var out = [];
  for (var i = 0; i < doc.sel.ranges.length; i++) {
    var range = doc.sel.ranges[i];
    out.push(new Range(adjustForChange(range.anchor, change),
                       adjustForChange(range.head, change)));
  }
  return normalizeSelection(out, doc.sel.primIndex)
}

function offsetPos(pos, old, nw) {
  if (pos.line == old.line)
    { return Pos(nw.line, pos.ch - old.ch + nw.ch) }
  else
    { return Pos(nw.line + (pos.line - old.line), pos.ch) }
}

// Used by replaceSelections to allow moving the selection to the
// start or around the replaced test. Hint may be "start" or "around".
function computeReplacedSel(doc, changes, hint) {
  var out = [];
  var oldPrev = Pos(doc.first, 0), newPrev = oldPrev;
  for (var i = 0; i < changes.length; i++) {
    var change = changes[i];
    var from = offsetPos(change.from, oldPrev, newPrev);
    var to = offsetPos(changeEnd(change), oldPrev, newPrev);
    oldPrev = change.to;
    newPrev = to;
    if (hint == "around") {
      var range = doc.sel.ranges[i], inv = cmp(range.head, range.anchor) < 0;
      out[i] = new Range(inv ? to : from, inv ? from : to);
    } else {
      out[i] = new Range(from, from);
    }
  }
  return new Selection(out, doc.sel.primIndex)
}

// Used to get the editor into a consistent state again when options change.

function loadMode(cm) {
  cm.doc.mode = getMode(cm.options, cm.doc.modeOption);
  resetModeState(cm);
}

function resetModeState(cm) {
  cm.doc.iter(function (line) {
    if (line.stateAfter) { line.stateAfter = null; }
    if (line.styles) { line.styles = null; }
  });
  cm.doc.modeFrontier = cm.doc.highlightFrontier = cm.doc.first;
  startWorker(cm, 100);
  cm.state.modeGen++;
  if (cm.curOp) { regChange(cm); }
}

// DOCUMENT DATA STRUCTURE

// By default, updates that start and end at the beginning of a line
// are treated specially, in order to make the association of line
// widgets and marker elements with the text behave more intuitive.
function isWholeLineUpdate(doc, change) {
  return change.from.ch == 0 && change.to.ch == 0 && lst(change.text) == "" &&
    (!doc.cm || doc.cm.options.wholeLineUpdateBefore)
}

// Perform a change on the document data structure.
function updateDoc(doc, change, markedSpans, estimateHeight$$1) {
  function spansFor(n) {return markedSpans ? markedSpans[n] : null}
  function update(line, text, spans) {
    updateLine(line, text, spans, estimateHeight$$1);
    signalLater(line, "change", line, change);
  }
  function linesFor(start, end) {
    var result = [];
    for (var i = start; i < end; ++i)
      { result.push(new Line(text[i], spansFor(i), estimateHeight$$1)); }
    return result
  }

  var from = change.from, to = change.to, text = change.text;
  var firstLine = getLine(doc, from.line), lastLine = getLine(doc, to.line);
  var lastText = lst(text), lastSpans = spansFor(text.length - 1), nlines = to.line - from.line;

  // Adjust the line structure
  if (change.full) {
    doc.insert(0, linesFor(0, text.length));
    doc.remove(text.length, doc.size - text.length);
  } else if (isWholeLineUpdate(doc, change)) {
    // This is a whole-line replace. Treated specially to make
    // sure line objects move the way they are supposed to.
    var added = linesFor(0, text.length - 1);
    update(lastLine, lastLine.text, lastSpans);
    if (nlines) { doc.remove(from.line, nlines); }
    if (added.length) { doc.insert(from.line, added); }
  } else if (firstLine == lastLine) {
    if (text.length == 1) {
      update(firstLine, firstLine.text.slice(0, from.ch) + lastText + firstLine.text.slice(to.ch), lastSpans);
    } else {
      var added$1 = linesFor(1, text.length - 1);
      added$1.push(new Line(lastText + firstLine.text.slice(to.ch), lastSpans, estimateHeight$$1));
      update(firstLine, firstLine.text.slice(0, from.ch) + text[0], spansFor(0));
      doc.insert(from.line + 1, added$1);
    }
  } else if (text.length == 1) {
    update(firstLine, firstLine.text.slice(0, from.ch) + text[0] + lastLine.text.slice(to.ch), spansFor(0));
    doc.remove(from.line + 1, nlines);
  } else {
    update(firstLine, firstLine.text.slice(0, from.ch) + text[0], spansFor(0));
    update(lastLine, lastText + lastLine.text.slice(to.ch), lastSpans);
    var added$2 = linesFor(1, text.length - 1);
    if (nlines > 1) { doc.remove(from.line + 1, nlines - 1); }
    doc.insert(from.line + 1, added$2);
  }

  signalLater(doc, "change", doc, change);
}

// Call f for all linked documents.
function linkedDocs(doc, f, sharedHistOnly) {
  function propagate(doc, skip, sharedHist) {
    if (doc.linked) { for (var i = 0; i < doc.linked.length; ++i) {
      var rel = doc.linked[i];
      if (rel.doc == skip) { continue }
      var shared = sharedHist && rel.sharedHist;
      if (sharedHistOnly && !shared) { continue }
      f(rel.doc, shared);
      propagate(rel.doc, doc, shared);
    } }
  }
  propagate(doc, null, true);
}

// Attach a document to an editor.
function attachDoc(cm, doc) {
  if (doc.cm) { throw new Error("This document is already in use.") }
  cm.doc = doc;
  doc.cm = cm;
  estimateLineHeights(cm);
  loadMode(cm);
  setDirectionClass(cm);
  if (!cm.options.lineWrapping) { findMaxLine(cm); }
  cm.options.mode = doc.modeOption;
  regChange(cm);
}

function setDirectionClass(cm) {
  (cm.doc.direction == "rtl" ? addClass : rmClass)(cm.display.lineDiv, "CodeMirror-rtl");
}

function directionChanged(cm) {
  runInOp(cm, function () {
    setDirectionClass(cm);
    regChange(cm);
  });
}

function History(startGen) {
  // Arrays of change events and selections. Doing something adds an
  // event to done and clears undo. Undoing moves events from done
  // to undone, redoing moves them in the other direction.
  this.done = []; this.undone = [];
  this.undoDepth = Infinity;
  // Used to track when changes can be merged into a single undo
  // event
  this.lastModTime = this.lastSelTime = 0;
  this.lastOp = this.lastSelOp = null;
  this.lastOrigin = this.lastSelOrigin = null;
  // Used by the isClean() method
  this.generation = this.maxGeneration = startGen || 1;
}

// Create a history change event from an updateDoc-style change
// object.
function historyChangeFromChange(doc, change) {
  var histChange = {from: copyPos(change.from), to: changeEnd(change), text: getBetween(doc, change.from, change.to)};
  attachLocalSpans(doc, histChange, change.from.line, change.to.line + 1);
  linkedDocs(doc, function (doc) { return attachLocalSpans(doc, histChange, change.from.line, change.to.line + 1); }, true);
  return histChange
}

// Pop all selection events off the end of a history array. Stop at
// a change event.
function clearSelectionEvents(array) {
  while (array.length) {
    var last = lst(array);
    if (last.ranges) { array.pop(); }
    else { break }
  }
}

// Find the top change event in the history. Pop off selection
// events that are in the way.
function lastChangeEvent(hist, force) {
  if (force) {
    clearSelectionEvents(hist.done);
    return lst(hist.done)
  } else if (hist.done.length && !lst(hist.done).ranges) {
    return lst(hist.done)
  } else if (hist.done.length > 1 && !hist.done[hist.done.length - 2].ranges) {
    hist.done.pop();
    return lst(hist.done)
  }
}

// Register a change in the history. Merges changes that are within
// a single operation, or are close together with an origin that
// allows merging (starting with "+") into a single event.
function addChangeToHistory(doc, change, selAfter, opId) {
  var hist = doc.history;
  hist.undone.length = 0;
  var time = +new Date, cur;
  var last;

  if ((hist.lastOp == opId ||
       hist.lastOrigin == change.origin && change.origin &&
       ((change.origin.charAt(0) == "+" && hist.lastModTime > time - (doc.cm ? doc.cm.options.historyEventDelay : 500)) ||
        change.origin.charAt(0) == "*")) &&
      (cur = lastChangeEvent(hist, hist.lastOp == opId))) {
    // Merge this change into the last event
    last = lst(cur.changes);
    if (cmp(change.from, change.to) == 0 && cmp(change.from, last.to) == 0) {
      // Optimized case for simple insertion -- don't want to add
      // new changesets for every character typed
      last.to = changeEnd(change);
    } else {
      // Add new sub-event
      cur.changes.push(historyChangeFromChange(doc, change));
    }
  } else {
    // Can not be merged, start a new event.
    var before = lst(hist.done);
    if (!before || !before.ranges)
      { pushSelectionToHistory(doc.sel, hist.done); }
    cur = {changes: [historyChangeFromChange(doc, change)],
           generation: hist.generation};
    hist.done.push(cur);
    while (hist.done.length > hist.undoDepth) {
      hist.done.shift();
      if (!hist.done[0].ranges) { hist.done.shift(); }
    }
  }
  hist.done.push(selAfter);
  hist.generation = ++hist.maxGeneration;
  hist.lastModTime = hist.lastSelTime = time;
  hist.lastOp = hist.lastSelOp = opId;
  hist.lastOrigin = hist.lastSelOrigin = change.origin;

  if (!last) { signal(doc, "historyAdded"); }
}

function selectionEventCanBeMerged(doc, origin, prev, sel) {
  var ch = origin.charAt(0);
  return ch == "*" ||
    ch == "+" &&
    prev.ranges.length == sel.ranges.length &&
    prev.somethingSelected() == sel.somethingSelected() &&
    new Date - doc.history.lastSelTime <= (doc.cm ? doc.cm.options.historyEventDelay : 500)
}

// Called whenever the selection changes, sets the new selection as
// the pending selection in the history, and pushes the old pending
// selection into the 'done' array when it was significantly
// different (in number of selected ranges, emptiness, or time).
function addSelectionToHistory(doc, sel, opId, options) {
  var hist = doc.history, origin = options && options.origin;

  // A new event is started when the previous origin does not match
  // the current, or the origins don't allow matching. Origins
  // starting with * are always merged, those starting with + are
  // merged when similar and close together in time.
  if (opId == hist.lastSelOp ||
      (origin && hist.lastSelOrigin == origin &&
       (hist.lastModTime == hist.lastSelTime && hist.lastOrigin == origin ||
        selectionEventCanBeMerged(doc, origin, lst(hist.done), sel))))
    { hist.done[hist.done.length - 1] = sel; }
  else
    { pushSelectionToHistory(sel, hist.done); }

  hist.lastSelTime = +new Date;
  hist.lastSelOrigin = origin;
  hist.lastSelOp = opId;
  if (options && options.clearRedo !== false)
    { clearSelectionEvents(hist.undone); }
}

function pushSelectionToHistory(sel, dest) {
  var top = lst(dest);
  if (!(top && top.ranges && top.equals(sel)))
    { dest.push(sel); }
}

// Used to store marked span information in the history.
function attachLocalSpans(doc, change, from, to) {
  var existing = change["spans_" + doc.id], n = 0;
  doc.iter(Math.max(doc.first, from), Math.min(doc.first + doc.size, to), function (line) {
    if (line.markedSpans)
      { (existing || (existing = change["spans_" + doc.id] = {}))[n] = line.markedSpans; }
    ++n;
  });
}

// When un/re-doing restores text containing marked spans, those
// that have been explicitly cleared should not be restored.
function removeClearedSpans(spans) {
  if (!spans) { return null }
  var out;
  for (var i = 0; i < spans.length; ++i) {
    if (spans[i].marker.explicitlyCleared) { if (!out) { out = spans.slice(0, i); } }
    else if (out) { out.push(spans[i]); }
  }
  return !out ? spans : out.length ? out : null
}

// Retrieve and filter the old marked spans stored in a change event.
function getOldSpans(doc, change) {
  var found = change["spans_" + doc.id];
  if (!found) { return null }
  var nw = [];
  for (var i = 0; i < change.text.length; ++i)
    { nw.push(removeClearedSpans(found[i])); }
  return nw
}

// Used for un/re-doing changes from the history. Combines the
// result of computing the existing spans with the set of spans that
// existed in the history (so that deleting around a span and then
// undoing brings back the span).
function mergeOldSpans(doc, change) {
  var old = getOldSpans(doc, change);
  var stretched = stretchSpansOverChange(doc, change);
  if (!old) { return stretched }
  if (!stretched) { return old }

  for (var i = 0; i < old.length; ++i) {
    var oldCur = old[i], stretchCur = stretched[i];
    if (oldCur && stretchCur) {
      spans: for (var j = 0; j < stretchCur.length; ++j) {
        var span = stretchCur[j];
        for (var k = 0; k < oldCur.length; ++k)
          { if (oldCur[k].marker == span.marker) { continue spans } }
        oldCur.push(span);
      }
    } else if (stretchCur) {
      old[i] = stretchCur;
    }
  }
  return old
}

// Used both to provide a JSON-safe object in .getHistory, and, when
// detaching a document, to split the history in two
function copyHistoryArray(events, newGroup, instantiateSel) {
  var copy = [];
  for (var i = 0; i < events.length; ++i) {
    var event = events[i];
    if (event.ranges) {
      copy.push(instantiateSel ? Selection.prototype.deepCopy.call(event) : event);
      continue
    }
    var changes = event.changes, newChanges = [];
    copy.push({changes: newChanges});
    for (var j = 0; j < changes.length; ++j) {
      var change = changes[j], m = (void 0);
      newChanges.push({from: change.from, to: change.to, text: change.text});
      if (newGroup) { for (var prop in change) { if (m = prop.match(/^spans_(\d+)$/)) {
        if (indexOf(newGroup, Number(m[1])) > -1) {
          lst(newChanges)[prop] = change[prop];
          delete change[prop];
        }
      } } }
    }
  }
  return copy
}

// The 'scroll' parameter given to many of these indicated whether
// the new cursor position should be scrolled into view after
// modifying the selection.

// If shift is held or the extend flag is set, extends a range to
// include a given position (and optionally a second position).
// Otherwise, simply returns the range between the given positions.
// Used for cursor motion and such.
function extendRange(range, head, other, extend) {
  if (extend) {
    var anchor = range.anchor;
    if (other) {
      var posBefore = cmp(head, anchor) < 0;
      if (posBefore != (cmp(other, anchor) < 0)) {
        anchor = head;
        head = other;
      } else if (posBefore != (cmp(head, other) < 0)) {
        head = other;
      }
    }
    return new Range(anchor, head)
  } else {
    return new Range(other || head, head)
  }
}

// Extend the primary selection range, discard the rest.
function extendSelection(doc, head, other, options, extend) {
  if (extend == null) { extend = doc.cm && (doc.cm.display.shift || doc.extend); }
  setSelection(doc, new Selection([extendRange(doc.sel.primary(), head, other, extend)], 0), options);
}

// Extend all selections (pos is an array of selections with length
// equal the number of selections)
function extendSelections(doc, heads, options) {
  var out = [];
  var extend = doc.cm && (doc.cm.display.shift || doc.extend);
  for (var i = 0; i < doc.sel.ranges.length; i++)
    { out[i] = extendRange(doc.sel.ranges[i], heads[i], null, extend); }
  var newSel = normalizeSelection(out, doc.sel.primIndex);
  setSelection(doc, newSel, options);
}

// Updates a single range in the selection.
function replaceOneSelection(doc, i, range, options) {
  var ranges = doc.sel.ranges.slice(0);
  ranges[i] = range;
  setSelection(doc, normalizeSelection(ranges, doc.sel.primIndex), options);
}

// Reset the selection to a single range.
function setSimpleSelection(doc, anchor, head, options) {
  setSelection(doc, simpleSelection(anchor, head), options);
}

// Give beforeSelectionChange handlers a change to influence a
// selection update.
function filterSelectionChange(doc, sel, options) {
  var obj = {
    ranges: sel.ranges,
    update: function(ranges) {
      var this$1 = this;

      this.ranges = [];
      for (var i = 0; i < ranges.length; i++)
        { this$1.ranges[i] = new Range(clipPos(doc, ranges[i].anchor),
                                   clipPos(doc, ranges[i].head)); }
    },
    origin: options && options.origin
  };
  signal(doc, "beforeSelectionChange", doc, obj);
  if (doc.cm) { signal(doc.cm, "beforeSelectionChange", doc.cm, obj); }
  if (obj.ranges != sel.ranges) { return normalizeSelection(obj.ranges, obj.ranges.length - 1) }
  else { return sel }
}

function setSelectionReplaceHistory(doc, sel, options) {
  var done = doc.history.done, last = lst(done);
  if (last && last.ranges) {
    done[done.length - 1] = sel;
    setSelectionNoUndo(doc, sel, options);
  } else {
    setSelection(doc, sel, options);
  }
}

// Set a new selection.
function setSelection(doc, sel, options) {
  setSelectionNoUndo(doc, sel, options);
  addSelectionToHistory(doc, doc.sel, doc.cm ? doc.cm.curOp.id : NaN, options);
}

function setSelectionNoUndo(doc, sel, options) {
  if (hasHandler(doc, "beforeSelectionChange") || doc.cm && hasHandler(doc.cm, "beforeSelectionChange"))
    { sel = filterSelectionChange(doc, sel, options); }

  var bias = options && options.bias ||
    (cmp(sel.primary().head, doc.sel.primary().head) < 0 ? -1 : 1);
  setSelectionInner(doc, skipAtomicInSelection(doc, sel, bias, true));

  if (!(options && options.scroll === false) && doc.cm)
    { ensureCursorVisible(doc.cm); }
}

function setSelectionInner(doc, sel) {
  if (sel.equals(doc.sel)) { return }

  doc.sel = sel;

  if (doc.cm) {
    doc.cm.curOp.updateInput = doc.cm.curOp.selectionChanged = true;
    signalCursorActivity(doc.cm);
  }
  signalLater(doc, "cursorActivity", doc);
}

// Verify that the selection does not partially select any atomic
// marked ranges.
function reCheckSelection(doc) {
  setSelectionInner(doc, skipAtomicInSelection(doc, doc.sel, null, false));
}

// Return a selection that does not partially select any atomic
// ranges.
function skipAtomicInSelection(doc, sel, bias, mayClear) {
  var out;
  for (var i = 0; i < sel.ranges.length; i++) {
    var range = sel.ranges[i];
    var old = sel.ranges.length == doc.sel.ranges.length && doc.sel.ranges[i];
    var newAnchor = skipAtomic(doc, range.anchor, old && old.anchor, bias, mayClear);
    var newHead = skipAtomic(doc, range.head, old && old.head, bias, mayClear);
    if (out || newAnchor != range.anchor || newHead != range.head) {
      if (!out) { out = sel.ranges.slice(0, i); }
      out[i] = new Range(newAnchor, newHead);
    }
  }
  return out ? normalizeSelection(out, sel.primIndex) : sel
}

function skipAtomicInner(doc, pos, oldPos, dir, mayClear) {
  var line = getLine(doc, pos.line);
  if (line.markedSpans) { for (var i = 0; i < line.markedSpans.length; ++i) {
    var sp = line.markedSpans[i], m = sp.marker;
    if ((sp.from == null || (m.inclusiveLeft ? sp.from <= pos.ch : sp.from < pos.ch)) &&
        (sp.to == null || (m.inclusiveRight ? sp.to >= pos.ch : sp.to > pos.ch))) {
      if (mayClear) {
        signal(m, "beforeCursorEnter");
        if (m.explicitlyCleared) {
          if (!line.markedSpans) { break }
          else {--i; continue}
        }
      }
      if (!m.atomic) { continue }

      if (oldPos) {
        var near = m.find(dir < 0 ? 1 : -1), diff = (void 0);
        if (dir < 0 ? m.inclusiveRight : m.inclusiveLeft)
          { near = movePos(doc, near, -dir, near && near.line == pos.line ? line : null); }
        if (near && near.line == pos.line && (diff = cmp(near, oldPos)) && (dir < 0 ? diff < 0 : diff > 0))
          { return skipAtomicInner(doc, near, pos, dir, mayClear) }
      }

      var far = m.find(dir < 0 ? -1 : 1);
      if (dir < 0 ? m.inclusiveLeft : m.inclusiveRight)
        { far = movePos(doc, far, dir, far.line == pos.line ? line : null); }
      return far ? skipAtomicInner(doc, far, pos, dir, mayClear) : null
    }
  } }
  return pos
}

// Ensure a given position is not inside an atomic range.
function skipAtomic(doc, pos, oldPos, bias, mayClear) {
  var dir = bias || 1;
  var found = skipAtomicInner(doc, pos, oldPos, dir, mayClear) ||
      (!mayClear && skipAtomicInner(doc, pos, oldPos, dir, true)) ||
      skipAtomicInner(doc, pos, oldPos, -dir, mayClear) ||
      (!mayClear && skipAtomicInner(doc, pos, oldPos, -dir, true));
  if (!found) {
    doc.cantEdit = true;
    return Pos(doc.first, 0)
  }
  return found
}

function movePos(doc, pos, dir, line) {
  if (dir < 0 && pos.ch == 0) {
    if (pos.line > doc.first) { return clipPos(doc, Pos(pos.line - 1)) }
    else { return null }
  } else if (dir > 0 && pos.ch == (line || getLine(doc, pos.line)).text.length) {
    if (pos.line < doc.first + doc.size - 1) { return Pos(pos.line + 1, 0) }
    else { return null }
  } else {
    return new Pos(pos.line, pos.ch + dir)
  }
}

function selectAll(cm) {
  cm.setSelection(Pos(cm.firstLine(), 0), Pos(cm.lastLine()), sel_dontScroll);
}

// UPDATING

// Allow "beforeChange" event handlers to influence a change
function filterChange(doc, change, update) {
  var obj = {
    canceled: false,
    from: change.from,
    to: change.to,
    text: change.text,
    origin: change.origin,
    cancel: function () { return obj.canceled = true; }
  };
  if (update) { obj.update = function (from, to, text, origin) {
    if (from) { obj.from = clipPos(doc, from); }
    if (to) { obj.to = clipPos(doc, to); }
    if (text) { obj.text = text; }
    if (origin !== undefined) { obj.origin = origin; }
  }; }
  signal(doc, "beforeChange", doc, obj);
  if (doc.cm) { signal(doc.cm, "beforeChange", doc.cm, obj); }

  if (obj.canceled) { return null }
  return {from: obj.from, to: obj.to, text: obj.text, origin: obj.origin}
}

// Apply a change to a document, and add it to the document's
// history, and propagating it to all linked documents.
function makeChange(doc, change, ignoreReadOnly) {
  if (doc.cm) {
    if (!doc.cm.curOp) { return operation(doc.cm, makeChange)(doc, change, ignoreReadOnly) }
    if (doc.cm.state.suppressEdits) { return }
  }

  if (hasHandler(doc, "beforeChange") || doc.cm && hasHandler(doc.cm, "beforeChange")) {
    change = filterChange(doc, change, true);
    if (!change) { return }
  }

  // Possibly split or suppress the update based on the presence
  // of read-only spans in its range.
  var split = sawReadOnlySpans && !ignoreReadOnly && removeReadOnlyRanges(doc, change.from, change.to);
  if (split) {
    for (var i = split.length - 1; i >= 0; --i)
      { makeChangeInner(doc, {from: split[i].from, to: split[i].to, text: i ? [""] : change.text, origin: change.origin}); }
  } else {
    makeChangeInner(doc, change);
  }
}

function makeChangeInner(doc, change) {
  if (change.text.length == 1 && change.text[0] == "" && cmp(change.from, change.to) == 0) { return }
  var selAfter = computeSelAfterChange(doc, change);
  addChangeToHistory(doc, change, selAfter, doc.cm ? doc.cm.curOp.id : NaN);

  makeChangeSingleDoc(doc, change, selAfter, stretchSpansOverChange(doc, change));
  var rebased = [];

  linkedDocs(doc, function (doc, sharedHist) {
    if (!sharedHist && indexOf(rebased, doc.history) == -1) {
      rebaseHist(doc.history, change);
      rebased.push(doc.history);
    }
    makeChangeSingleDoc(doc, change, null, stretchSpansOverChange(doc, change));
  });
}

// Revert a change stored in a document's history.
function makeChangeFromHistory(doc, type, allowSelectionOnly) {
  var suppress = doc.cm && doc.cm.state.suppressEdits;
  if (suppress && !allowSelectionOnly) { return }

  var hist = doc.history, event, selAfter = doc.sel;
  var source = type == "undo" ? hist.done : hist.undone, dest = type == "undo" ? hist.undone : hist.done;

  // Verify that there is a useable event (so that ctrl-z won't
  // needlessly clear selection events)
  var i = 0;
  for (; i < source.length; i++) {
    event = source[i];
    if (allowSelectionOnly ? event.ranges && !event.equals(doc.sel) : !event.ranges)
      { break }
  }
  if (i == source.length) { return }
  hist.lastOrigin = hist.lastSelOrigin = null;

  for (;;) {
    event = source.pop();
    if (event.ranges) {
      pushSelectionToHistory(event, dest);
      if (allowSelectionOnly && !event.equals(doc.sel)) {
        setSelection(doc, event, {clearRedo: false});
        return
      }
      selAfter = event;
    } else if (suppress) {
      source.push(event);
      return
    } else { break }
  }

  // Build up a reverse change object to add to the opposite history
  // stack (redo when undoing, and vice versa).
  var antiChanges = [];
  pushSelectionToHistory(selAfter, dest);
  dest.push({changes: antiChanges, generation: hist.generation});
  hist.generation = event.generation || ++hist.maxGeneration;

  var filter = hasHandler(doc, "beforeChange") || doc.cm && hasHandler(doc.cm, "beforeChange");

  var loop = function ( i ) {
    var change = event.changes[i];
    change.origin = type;
    if (filter && !filterChange(doc, change, false)) {
      source.length = 0;
      return {}
    }

    antiChanges.push(historyChangeFromChange(doc, change));

    var after = i ? computeSelAfterChange(doc, change) : lst(source);
    makeChangeSingleDoc(doc, change, after, mergeOldSpans(doc, change));
    if (!i && doc.cm) { doc.cm.scrollIntoView({from: change.from, to: changeEnd(change)}); }
    var rebased = [];

    // Propagate to the linked documents
    linkedDocs(doc, function (doc, sharedHist) {
      if (!sharedHist && indexOf(rebased, doc.history) == -1) {
        rebaseHist(doc.history, change);
        rebased.push(doc.history);
      }
      makeChangeSingleDoc(doc, change, null, mergeOldSpans(doc, change));
    });
  };

  for (var i$1 = event.changes.length - 1; i$1 >= 0; --i$1) {
    var returned = loop( i$1 );

    if ( returned ) return returned.v;
  }
}

// Sub-views need their line numbers shifted when text is added
// above or below them in the parent document.
function shiftDoc(doc, distance) {
  if (distance == 0) { return }
  doc.first += distance;
  doc.sel = new Selection(map(doc.sel.ranges, function (range) { return new Range(
    Pos(range.anchor.line + distance, range.anchor.ch),
    Pos(range.head.line + distance, range.head.ch)
  ); }), doc.sel.primIndex);
  if (doc.cm) {
    regChange(doc.cm, doc.first, doc.first - distance, distance);
    for (var d = doc.cm.display, l = d.viewFrom; l < d.viewTo; l++)
      { regLineChange(doc.cm, l, "gutter"); }
  }
}

// More lower-level change function, handling only a single document
// (not linked ones).
function makeChangeSingleDoc(doc, change, selAfter, spans) {
  if (doc.cm && !doc.cm.curOp)
    { return operation(doc.cm, makeChangeSingleDoc)(doc, change, selAfter, spans) }

  if (change.to.line < doc.first) {
    shiftDoc(doc, change.text.length - 1 - (change.to.line - change.from.line));
    return
  }
  if (change.from.line > doc.lastLine()) { return }

  // Clip the change to the size of this doc
  if (change.from.line < doc.first) {
    var shift = change.text.length - 1 - (doc.first - change.from.line);
    shiftDoc(doc, shift);
    change = {from: Pos(doc.first, 0), to: Pos(change.to.line + shift, change.to.ch),
              text: [lst(change.text)], origin: change.origin};
  }
  var last = doc.lastLine();
  if (change.to.line > last) {
    change = {from: change.from, to: Pos(last, getLine(doc, last).text.length),
              text: [change.text[0]], origin: change.origin};
  }

  change.removed = getBetween(doc, change.from, change.to);

  if (!selAfter) { selAfter = computeSelAfterChange(doc, change); }
  if (doc.cm) { makeChangeSingleDocInEditor(doc.cm, change, spans); }
  else { updateDoc(doc, change, spans); }
  setSelectionNoUndo(doc, selAfter, sel_dontScroll);
}

// Handle the interaction of a change to a document with the editor
// that this document is part of.
function makeChangeSingleDocInEditor(cm, change, spans) {
  var doc = cm.doc, display = cm.display, from = change.from, to = change.to;

  var recomputeMaxLength = false, checkWidthStart = from.line;
  if (!cm.options.lineWrapping) {
    checkWidthStart = lineNo(visualLine(getLine(doc, from.line)));
    doc.iter(checkWidthStart, to.line + 1, function (line) {
      if (line == display.maxLine) {
        recomputeMaxLength = true;
        return true
      }
    });
  }

  if (doc.sel.contains(change.from, change.to) > -1)
    { signalCursorActivity(cm); }

  updateDoc(doc, change, spans, estimateHeight(cm));

  if (!cm.options.lineWrapping) {
    doc.iter(checkWidthStart, from.line + change.text.length, function (line) {
      var len = lineLength(line);
      if (len > display.maxLineLength) {
        display.maxLine = line;
        display.maxLineLength = len;
        display.maxLineChanged = true;
        recomputeMaxLength = false;
      }
    });
    if (recomputeMaxLength) { cm.curOp.updateMaxLine = true; }
  }

  retreatFrontier(doc, from.line);
  startWorker(cm, 400);

  var lendiff = change.text.length - (to.line - from.line) - 1;
  // Remember that these lines changed, for updating the display
  if (change.full)
    { regChange(cm); }
  else if (from.line == to.line && change.text.length == 1 && !isWholeLineUpdate(cm.doc, change))
    { regLineChange(cm, from.line, "text"); }
  else
    { regChange(cm, from.line, to.line + 1, lendiff); }

  var changesHandler = hasHandler(cm, "changes"), changeHandler = hasHandler(cm, "change");
  if (changeHandler || changesHandler) {
    var obj = {
      from: from, to: to,
      text: change.text,
      removed: change.removed,
      origin: change.origin
    };
    if (changeHandler) { signalLater(cm, "change", cm, obj); }
    if (changesHandler) { (cm.curOp.changeObjs || (cm.curOp.changeObjs = [])).push(obj); }
  }
  cm.display.selForContextMenu = null;
}

function replaceRange(doc, code, from, to, origin) {
  if (!to) { to = from; }
  if (cmp(to, from) < 0) { var assign;
    (assign = [to, from], from = assign[0], to = assign[1]); }
  if (typeof code == "string") { code = doc.splitLines(code); }
  makeChange(doc, {from: from, to: to, text: code, origin: origin});
}

// Rebasing/resetting history to deal with externally-sourced changes

function rebaseHistSelSingle(pos, from, to, diff) {
  if (to < pos.line) {
    pos.line += diff;
  } else if (from < pos.line) {
    pos.line = from;
    pos.ch = 0;
  }
}

// Tries to rebase an array of history events given a change in the
// document. If the change touches the same lines as the event, the
// event, and everything 'behind' it, is discarded. If the change is
// before the event, the event's positions are updated. Uses a
// copy-on-write scheme for the positions, to avoid having to
// reallocate them all on every rebase, but also avoid problems with
// shared position objects being unsafely updated.
function rebaseHistArray(array, from, to, diff) {
  for (var i = 0; i < array.length; ++i) {
    var sub = array[i], ok = true;
    if (sub.ranges) {
      if (!sub.copied) { sub = array[i] = sub.deepCopy(); sub.copied = true; }
      for (var j = 0; j < sub.ranges.length; j++) {
        rebaseHistSelSingle(sub.ranges[j].anchor, from, to, diff);
        rebaseHistSelSingle(sub.ranges[j].head, from, to, diff);
      }
      continue
    }
    for (var j$1 = 0; j$1 < sub.changes.length; ++j$1) {
      var cur = sub.changes[j$1];
      if (to < cur.from.line) {
        cur.from = Pos(cur.from.line + diff, cur.from.ch);
        cur.to = Pos(cur.to.line + diff, cur.to.ch);
      } else if (from <= cur.to.line) {
        ok = false;
        break
      }
    }
    if (!ok) {
      array.splice(0, i + 1);
      i = 0;
    }
  }
}

function rebaseHist(hist, change) {
  var from = change.from.line, to = change.to.line, diff = change.text.length - (to - from) - 1;
  rebaseHistArray(hist.done, from, to, diff);
  rebaseHistArray(hist.undone, from, to, diff);
}

// Utility for applying a change to a line by handle or number,
// returning the number and optionally registering the line as
// changed.
function changeLine(doc, handle, changeType, op) {
  var no = handle, line = handle;
  if (typeof handle == "number") { line = getLine(doc, clipLine(doc, handle)); }
  else { no = lineNo(handle); }
  if (no == null) { return null }
  if (op(line, no) && doc.cm) { regLineChange(doc.cm, no, changeType); }
  return line
}

// The document is represented as a BTree consisting of leaves, with
// chunk of lines in them, and branches, with up to ten leaves or
// other branch nodes below them. The top node is always a branch
// node, and is the document object itself (meaning it has
// additional methods and properties).
//
// All nodes have parent links. The tree is used both to go from
// line numbers to line objects, and to go from objects to numbers.
// It also indexes by height, and is used to convert between height
// and line object, and to find the total height of the document.
//
// See also http://marijnhaverbeke.nl/blog/codemirror-line-tree.html

function LeafChunk(lines) {
  var this$1 = this;

  this.lines = lines;
  this.parent = null;
  var height = 0;
  for (var i = 0; i < lines.length; ++i) {
    lines[i].parent = this$1;
    height += lines[i].height;
  }
  this.height = height;
}

LeafChunk.prototype = {
  chunkSize: function() { return this.lines.length },

  // Remove the n lines at offset 'at'.
  removeInner: function(at, n) {
    var this$1 = this;

    for (var i = at, e = at + n; i < e; ++i) {
      var line = this$1.lines[i];
      this$1.height -= line.height;
      cleanUpLine(line);
      signalLater(line, "delete");
    }
    this.lines.splice(at, n);
  },

  // Helper used to collapse a small branch into a single leaf.
  collapse: function(lines) {
    lines.push.apply(lines, this.lines);
  },

  // Insert the given array of lines at offset 'at', count them as
  // having the given height.
  insertInner: function(at, lines, height) {
    var this$1 = this;

    this.height += height;
    this.lines = this.lines.slice(0, at).concat(lines).concat(this.lines.slice(at));
    for (var i = 0; i < lines.length; ++i) { lines[i].parent = this$1; }
  },

  // Used to iterate over a part of the tree.
  iterN: function(at, n, op) {
    var this$1 = this;

    for (var e = at + n; at < e; ++at)
      { if (op(this$1.lines[at])) { return true } }
  }
};

function BranchChunk(children) {
  var this$1 = this;

  this.children = children;
  var size = 0, height = 0;
  for (var i = 0; i < children.length; ++i) {
    var ch = children[i];
    size += ch.chunkSize(); height += ch.height;
    ch.parent = this$1;
  }
  this.size = size;
  this.height = height;
  this.parent = null;
}

BranchChunk.prototype = {
  chunkSize: function() { return this.size },

  removeInner: function(at, n) {
    var this$1 = this;

    this.size -= n;
    for (var i = 0; i < this.children.length; ++i) {
      var child = this$1.children[i], sz = child.chunkSize();
      if (at < sz) {
        var rm = Math.min(n, sz - at), oldHeight = child.height;
        child.removeInner(at, rm);
        this$1.height -= oldHeight - child.height;
        if (sz == rm) { this$1.children.splice(i--, 1); child.parent = null; }
        if ((n -= rm) == 0) { break }
        at = 0;
      } else { at -= sz; }
    }
    // If the result is smaller than 25 lines, ensure that it is a
    // single leaf node.
    if (this.size - n < 25 &&
        (this.children.length > 1 || !(this.children[0] instanceof LeafChunk))) {
      var lines = [];
      this.collapse(lines);
      this.children = [new LeafChunk(lines)];
      this.children[0].parent = this;
    }
  },

  collapse: function(lines) {
    var this$1 = this;

    for (var i = 0; i < this.children.length; ++i) { this$1.children[i].collapse(lines); }
  },

  insertInner: function(at, lines, height) {
    var this$1 = this;

    this.size += lines.length;
    this.height += height;
    for (var i = 0; i < this.children.length; ++i) {
      var child = this$1.children[i], sz = child.chunkSize();
      if (at <= sz) {
        child.insertInner(at, lines, height);
        if (child.lines && child.lines.length > 50) {
          // To avoid memory thrashing when child.lines is huge (e.g. first view of a large file), it's never spliced.
          // Instead, small slices are taken. They're taken in order because sequential memory accesses are fastest.
          var remaining = child.lines.length % 25 + 25;
          for (var pos = remaining; pos < child.lines.length;) {
            var leaf = new LeafChunk(child.lines.slice(pos, pos += 25));
            child.height -= leaf.height;
            this$1.children.splice(++i, 0, leaf);
            leaf.parent = this$1;
          }
          child.lines = child.lines.slice(0, remaining);
          this$1.maybeSpill();
        }
        break
      }
      at -= sz;
    }
  },

  // When a node has grown, check whether it should be split.
  maybeSpill: function() {
    if (this.children.length <= 10) { return }
    var me = this;
    do {
      var spilled = me.children.splice(me.children.length - 5, 5);
      var sibling = new BranchChunk(spilled);
      if (!me.parent) { // Become the parent node
        var copy = new BranchChunk(me.children);
        copy.parent = me;
        me.children = [copy, sibling];
        me = copy;
     } else {
        me.size -= sibling.size;
        me.height -= sibling.height;
        var myIndex = indexOf(me.parent.children, me);
        me.parent.children.splice(myIndex + 1, 0, sibling);
      }
      sibling.parent = me.parent;
    } while (me.children.length > 10)
    me.parent.maybeSpill();
  },

  iterN: function(at, n, op) {
    var this$1 = this;

    for (var i = 0; i < this.children.length; ++i) {
      var child = this$1.children[i], sz = child.chunkSize();
      if (at < sz) {
        var used = Math.min(n, sz - at);
        if (child.iterN(at, used, op)) { return true }
        if ((n -= used) == 0) { break }
        at = 0;
      } else { at -= sz; }
    }
  }
};

// Line widgets are block elements displayed above or below a line.

var LineWidget = function(doc, node, options) {
  var this$1 = this;

  if (options) { for (var opt in options) { if (options.hasOwnProperty(opt))
    { this$1[opt] = options[opt]; } } }
  this.doc = doc;
  this.node = node;
};

LineWidget.prototype.clear = function () {
    var this$1 = this;

  var cm = this.doc.cm, ws = this.line.widgets, line = this.line, no = lineNo(line);
  if (no == null || !ws) { return }
  for (var i = 0; i < ws.length; ++i) { if (ws[i] == this$1) { ws.splice(i--, 1); } }
  if (!ws.length) { line.widgets = null; }
  var height = widgetHeight(this);
  updateLineHeight(line, Math.max(0, line.height - height));
  if (cm) {
    runInOp(cm, function () {
      adjustScrollWhenAboveVisible(cm, line, -height);
      regLineChange(cm, no, "widget");
    });
    signalLater(cm, "lineWidgetCleared", cm, this, no);
  }
};

LineWidget.prototype.changed = function () {
    var this$1 = this;

  var oldH = this.height, cm = this.doc.cm, line = this.line;
  this.height = null;
  var diff = widgetHeight(this) - oldH;
  if (!diff) { return }
  updateLineHeight(line, line.height + diff);
  if (cm) {
    runInOp(cm, function () {
      cm.curOp.forceUpdate = true;
      adjustScrollWhenAboveVisible(cm, line, diff);
      signalLater(cm, "lineWidgetChanged", cm, this$1, lineNo(line));
    });
  }
};
eventMixin(LineWidget);

function adjustScrollWhenAboveVisible(cm, line, diff) {
  if (heightAtLine(line) < ((cm.curOp && cm.curOp.scrollTop) || cm.doc.scrollTop))
    { addToScrollTop(cm, diff); }
}

function addLineWidget(doc, handle, node, options) {
  var widget = new LineWidget(doc, node, options);
  var cm = doc.cm;
  if (cm && widget.noHScroll) { cm.display.alignWidgets = true; }
  changeLine(doc, handle, "widget", function (line) {
    var widgets = line.widgets || (line.widgets = []);
    if (widget.insertAt == null) { widgets.push(widget); }
    else { widgets.splice(Math.min(widgets.length - 1, Math.max(0, widget.insertAt)), 0, widget); }
    widget.line = line;
    if (cm && !lineIsHidden(doc, line)) {
      var aboveVisible = heightAtLine(line) < doc.scrollTop;
      updateLineHeight(line, line.height + widgetHeight(widget));
      if (aboveVisible) { addToScrollTop(cm, widget.height); }
      cm.curOp.forceUpdate = true;
    }
    return true
  });
  if (cm) { signalLater(cm, "lineWidgetAdded", cm, widget, typeof handle == "number" ? handle : lineNo(handle)); }
  return widget
}

// TEXTMARKERS

// Created with markText and setBookmark methods. A TextMarker is a
// handle that can be used to clear or find a marked position in the
// document. Line objects hold arrays (markedSpans) containing
// {from, to, marker} object pointing to such marker objects, and
// indicating that such a marker is present on that line. Multiple
// lines may point to the same marker when it spans across lines.
// The spans will have null for their from/to properties when the
// marker continues beyond the start/end of the line. Markers have
// links back to the lines they currently touch.

// Collapsed markers have unique ids, in order to be able to order
// them, which is needed for uniquely determining an outer marker
// when they overlap (they may nest, but not partially overlap).
var nextMarkerId = 0;

var TextMarker = function(doc, type) {
  this.lines = [];
  this.type = type;
  this.doc = doc;
  this.id = ++nextMarkerId;
};

// Clear the marker.
TextMarker.prototype.clear = function () {
    var this$1 = this;

  if (this.explicitlyCleared) { return }
  var cm = this.doc.cm, withOp = cm && !cm.curOp;
  if (withOp) { startOperation(cm); }
  if (hasHandler(this, "clear")) {
    var found = this.find();
    if (found) { signalLater(this, "clear", found.from, found.to); }
  }
  var min = null, max = null;
  for (var i = 0; i < this.lines.length; ++i) {
    var line = this$1.lines[i];
    var span = getMarkedSpanFor(line.markedSpans, this$1);
    if (cm && !this$1.collapsed) { regLineChange(cm, lineNo(line), "text"); }
    else if (cm) {
      if (span.to != null) { max = lineNo(line); }
      if (span.from != null) { min = lineNo(line); }
    }
    line.markedSpans = removeMarkedSpan(line.markedSpans, span);
    if (span.from == null && this$1.collapsed && !lineIsHidden(this$1.doc, line) && cm)
      { updateLineHeight(line, textHeight(cm.display)); }
  }
  if (cm && this.collapsed && !cm.options.lineWrapping) { for (var i$1 = 0; i$1 < this.lines.length; ++i$1) {
    var visual = visualLine(this$1.lines[i$1]), len = lineLength(visual);
    if (len > cm.display.maxLineLength) {
      cm.display.maxLine = visual;
      cm.display.maxLineLength = len;
      cm.display.maxLineChanged = true;
    }
  } }

  if (min != null && cm && this.collapsed) { regChange(cm, min, max + 1); }
  this.lines.length = 0;
  this.explicitlyCleared = true;
  if (this.atomic && this.doc.cantEdit) {
    this.doc.cantEdit = false;
    if (cm) { reCheckSelection(cm.doc); }
  }
  if (cm) { signalLater(cm, "markerCleared", cm, this, min, max); }
  if (withOp) { endOperation(cm); }
  if (this.parent) { this.parent.clear(); }
};

// Find the position of the marker in the document. Returns a {from,
// to} object by default. Side can be passed to get a specific side
// -- 0 (both), -1 (left), or 1 (right). When lineObj is true, the
// Pos objects returned contain a line object, rather than a line
// number (used to prevent looking up the same line twice).
TextMarker.prototype.find = function (side, lineObj) {
    var this$1 = this;

  if (side == null && this.type == "bookmark") { side = 1; }
  var from, to;
  for (var i = 0; i < this.lines.length; ++i) {
    var line = this$1.lines[i];
    var span = getMarkedSpanFor(line.markedSpans, this$1);
    if (span.from != null) {
      from = Pos(lineObj ? line : lineNo(line), span.from);
      if (side == -1) { return from }
    }
    if (span.to != null) {
      to = Pos(lineObj ? line : lineNo(line), span.to);
      if (side == 1) { return to }
    }
  }
  return from && {from: from, to: to}
};

// Signals that the marker's widget changed, and surrounding layout
// should be recomputed.
TextMarker.prototype.changed = function () {
    var this$1 = this;

  var pos = this.find(-1, true), widget = this, cm = this.doc.cm;
  if (!pos || !cm) { return }
  runInOp(cm, function () {
    var line = pos.line, lineN = lineNo(pos.line);
    var view = findViewForLine(cm, lineN);
    if (view) {
      clearLineMeasurementCacheFor(view);
      cm.curOp.selectionChanged = cm.curOp.forceUpdate = true;
    }
    cm.curOp.updateMaxLine = true;
    if (!lineIsHidden(widget.doc, line) && widget.height != null) {
      var oldHeight = widget.height;
      widget.height = null;
      var dHeight = widgetHeight(widget) - oldHeight;
      if (dHeight)
        { updateLineHeight(line, line.height + dHeight); }
    }
    signalLater(cm, "markerChanged", cm, this$1);
  });
};

TextMarker.prototype.attachLine = function (line) {
  if (!this.lines.length && this.doc.cm) {
    var op = this.doc.cm.curOp;
    if (!op.maybeHiddenMarkers || indexOf(op.maybeHiddenMarkers, this) == -1)
      { (op.maybeUnhiddenMarkers || (op.maybeUnhiddenMarkers = [])).push(this); }
  }
  this.lines.push(line);
};

TextMarker.prototype.detachLine = function (line) {
  this.lines.splice(indexOf(this.lines, line), 1);
  if (!this.lines.length && this.doc.cm) {
    var op = this.doc.cm.curOp;(op.maybeHiddenMarkers || (op.maybeHiddenMarkers = [])).push(this);
  }
};
eventMixin(TextMarker);

// Create a marker, wire it up to the right lines, and
function markText(doc, from, to, options, type) {
  // Shared markers (across linked documents) are handled separately
  // (markTextShared will call out to this again, once per
  // document).
  if (options && options.shared) { return markTextShared(doc, from, to, options, type) }
  // Ensure we are in an operation.
  if (doc.cm && !doc.cm.curOp) { return operation(doc.cm, markText)(doc, from, to, options, type) }

  var marker = new TextMarker(doc, type), diff = cmp(from, to);
  if (options) { copyObj(options, marker, false); }
  // Don't connect empty markers unless clearWhenEmpty is false
  if (diff > 0 || diff == 0 && marker.clearWhenEmpty !== false)
    { return marker }
  if (marker.replacedWith) {
    // Showing up as a widget implies collapsed (widget replaces text)
    marker.collapsed = true;
    marker.widgetNode = eltP("span", [marker.replacedWith], "CodeMirror-widget");
    if (!options.handleMouseEvents) { marker.widgetNode.setAttribute("cm-ignore-events", "true"); }
    if (options.insertLeft) { marker.widgetNode.insertLeft = true; }
  }
  if (marker.collapsed) {
    if (conflictingCollapsedRange(doc, from.line, from, to, marker) ||
        from.line != to.line && conflictingCollapsedRange(doc, to.line, from, to, marker))
      { throw new Error("Inserting collapsed marker partially overlapping an existing one") }
    seeCollapsedSpans();
  }

  if (marker.addToHistory)
    { addChangeToHistory(doc, {from: from, to: to, origin: "markText"}, doc.sel, NaN); }

  var curLine = from.line, cm = doc.cm, updateMaxLine;
  doc.iter(curLine, to.line + 1, function (line) {
    if (cm && marker.collapsed && !cm.options.lineWrapping && visualLine(line) == cm.display.maxLine)
      { updateMaxLine = true; }
    if (marker.collapsed && curLine != from.line) { updateLineHeight(line, 0); }
    addMarkedSpan(line, new MarkedSpan(marker,
                                       curLine == from.line ? from.ch : null,
                                       curLine == to.line ? to.ch : null));
    ++curLine;
  });
  // lineIsHidden depends on the presence of the spans, so needs a second pass
  if (marker.collapsed) { doc.iter(from.line, to.line + 1, function (line) {
    if (lineIsHidden(doc, line)) { updateLineHeight(line, 0); }
  }); }

  if (marker.clearOnEnter) { on(marker, "beforeCursorEnter", function () { return marker.clear(); }); }

  if (marker.readOnly) {
    seeReadOnlySpans();
    if (doc.history.done.length || doc.history.undone.length)
      { doc.clearHistory(); }
  }
  if (marker.collapsed) {
    marker.id = ++nextMarkerId;
    marker.atomic = true;
  }
  if (cm) {
    // Sync editor state
    if (updateMaxLine) { cm.curOp.updateMaxLine = true; }
    if (marker.collapsed)
      { regChange(cm, from.line, to.line + 1); }
    else if (marker.className || marker.title || marker.startStyle || marker.endStyle || marker.css)
      { for (var i = from.line; i <= to.line; i++) { regLineChange(cm, i, "text"); } }
    if (marker.atomic) { reCheckSelection(cm.doc); }
    signalLater(cm, "markerAdded", cm, marker);
  }
  return marker
}

// SHARED TEXTMARKERS

// A shared marker spans multiple linked documents. It is
// implemented as a meta-marker-object controlling multiple normal
// markers.
var SharedTextMarker = function(markers, primary) {
  var this$1 = this;

  this.markers = markers;
  this.primary = primary;
  for (var i = 0; i < markers.length; ++i)
    { markers[i].parent = this$1; }
};

SharedTextMarker.prototype.clear = function () {
    var this$1 = this;

  if (this.explicitlyCleared) { return }
  this.explicitlyCleared = true;
  for (var i = 0; i < this.markers.length; ++i)
    { this$1.markers[i].clear(); }
  signalLater(this, "clear");
};

SharedTextMarker.prototype.find = function (side, lineObj) {
  return this.primary.find(side, lineObj)
};
eventMixin(SharedTextMarker);

function markTextShared(doc, from, to, options, type) {
  options = copyObj(options);
  options.shared = false;
  var markers = [markText(doc, from, to, options, type)], primary = markers[0];
  var widget = options.widgetNode;
  linkedDocs(doc, function (doc) {
    if (widget) { options.widgetNode = widget.cloneNode(true); }
    markers.push(markText(doc, clipPos(doc, from), clipPos(doc, to), options, type));
    for (var i = 0; i < doc.linked.length; ++i)
      { if (doc.linked[i].isParent) { return } }
    primary = lst(markers);
  });
  return new SharedTextMarker(markers, primary)
}

function findSharedMarkers(doc) {
  return doc.findMarks(Pos(doc.first, 0), doc.clipPos(Pos(doc.lastLine())), function (m) { return m.parent; })
}

function copySharedMarkers(doc, markers) {
  for (var i = 0; i < markers.length; i++) {
    var marker = markers[i], pos = marker.find();
    var mFrom = doc.clipPos(pos.from), mTo = doc.clipPos(pos.to);
    if (cmp(mFrom, mTo)) {
      var subMark = markText(doc, mFrom, mTo, marker.primary, marker.primary.type);
      marker.markers.push(subMark);
      subMark.parent = marker;
    }
  }
}

function detachSharedMarkers(markers) {
  var loop = function ( i ) {
    var marker = markers[i], linked = [marker.primary.doc];
    linkedDocs(marker.primary.doc, function (d) { return linked.push(d); });
    for (var j = 0; j < marker.markers.length; j++) {
      var subMarker = marker.markers[j];
      if (indexOf(linked, subMarker.doc) == -1) {
        subMarker.parent = null;
        marker.markers.splice(j--, 1);
      }
    }
  };

  for (var i = 0; i < markers.length; i++) loop( i );
}

var nextDocId = 0;
var Doc = function(text, mode, firstLine, lineSep, direction) {
  if (!(this instanceof Doc)) { return new Doc(text, mode, firstLine, lineSep, direction) }
  if (firstLine == null) { firstLine = 0; }

  BranchChunk.call(this, [new LeafChunk([new Line("", null)])]);
  this.first = firstLine;
  this.scrollTop = this.scrollLeft = 0;
  this.cantEdit = false;
  this.cleanGeneration = 1;
  this.modeFrontier = this.highlightFrontier = firstLine;
  var start = Pos(firstLine, 0);
  this.sel = simpleSelection(start);
  this.history = new History(null);
  this.id = ++nextDocId;
  this.modeOption = mode;
  this.lineSep = lineSep;
  this.direction = (direction == "rtl") ? "rtl" : "ltr";
  this.extend = false;

  if (typeof text == "string") { text = this.splitLines(text); }
  updateDoc(this, {from: start, to: start, text: text});
  setSelection(this, simpleSelection(start), sel_dontScroll);
};

Doc.prototype = createObj(BranchChunk.prototype, {
  constructor: Doc,
  // Iterate over the document. Supports two forms -- with only one
  // argument, it calls that for each line in the document. With
  // three, it iterates over the range given by the first two (with
  // the second being non-inclusive).
  iter: function(from, to, op) {
    if (op) { this.iterN(from - this.first, to - from, op); }
    else { this.iterN(this.first, this.first + this.size, from); }
  },

  // Non-public interface for adding and removing lines.
  insert: function(at, lines) {
    var height = 0;
    for (var i = 0; i < lines.length; ++i) { height += lines[i].height; }
    this.insertInner(at - this.first, lines, height);
  },
  remove: function(at, n) { this.removeInner(at - this.first, n); },

  // From here, the methods are part of the public interface. Most
  // are also available from CodeMirror (editor) instances.

  getValue: function(lineSep) {
    var lines = getLines(this, this.first, this.first + this.size);
    if (lineSep === false) { return lines }
    return lines.join(lineSep || this.lineSeparator())
  },
  setValue: docMethodOp(function(code) {
    var top = Pos(this.first, 0), last = this.first + this.size - 1;
    makeChange(this, {from: top, to: Pos(last, getLine(this, last).text.length),
                      text: this.splitLines(code), origin: "setValue", full: true}, true);
    if (this.cm) { scrollToCoords(this.cm, 0, 0); }
    setSelection(this, simpleSelection(top), sel_dontScroll);
  }),
  replaceRange: function(code, from, to, origin) {
    from = clipPos(this, from);
    to = to ? clipPos(this, to) : from;
    replaceRange(this, code, from, to, origin);
  },
  getRange: function(from, to, lineSep) {
    var lines = getBetween(this, clipPos(this, from), clipPos(this, to));
    if (lineSep === false) { return lines }
    return lines.join(lineSep || this.lineSeparator())
  },

  getLine: function(line) {var l = this.getLineHandle(line); return l && l.text},

  getLineHandle: function(line) {if (isLine(this, line)) { return getLine(this, line) }},
  getLineNumber: function(line) {return lineNo(line)},

  getLineHandleVisualStart: function(line) {
    if (typeof line == "number") { line = getLine(this, line); }
    return visualLine(line)
  },

  lineCount: function() {return this.size},
  firstLine: function() {return this.first},
  lastLine: function() {return this.first + this.size - 1},

  clipPos: function(pos) {return clipPos(this, pos)},

  getCursor: function(start) {
    var range$$1 = this.sel.primary(), pos;
    if (start == null || start == "head") { pos = range$$1.head; }
    else if (start == "anchor") { pos = range$$1.anchor; }
    else if (start == "end" || start == "to" || start === false) { pos = range$$1.to(); }
    else { pos = range$$1.from(); }
    return pos
  },
  listSelections: function() { return this.sel.ranges },
  somethingSelected: function() {return this.sel.somethingSelected()},

  setCursor: docMethodOp(function(line, ch, options) {
    setSimpleSelection(this, clipPos(this, typeof line == "number" ? Pos(line, ch || 0) : line), null, options);
  }),
  setSelection: docMethodOp(function(anchor, head, options) {
    setSimpleSelection(this, clipPos(this, anchor), clipPos(this, head || anchor), options);
  }),
  extendSelection: docMethodOp(function(head, other, options) {
    extendSelection(this, clipPos(this, head), other && clipPos(this, other), options);
  }),
  extendSelections: docMethodOp(function(heads, options) {
    extendSelections(this, clipPosArray(this, heads), options);
  }),
  extendSelectionsBy: docMethodOp(function(f, options) {
    var heads = map(this.sel.ranges, f);
    extendSelections(this, clipPosArray(this, heads), options);
  }),
  setSelections: docMethodOp(function(ranges, primary, options) {
    var this$1 = this;

    if (!ranges.length) { return }
    var out = [];
    for (var i = 0; i < ranges.length; i++)
      { out[i] = new Range(clipPos(this$1, ranges[i].anchor),
                         clipPos(this$1, ranges[i].head)); }
    if (primary == null) { primary = Math.min(ranges.length - 1, this.sel.primIndex); }
    setSelection(this, normalizeSelection(out, primary), options);
  }),
  addSelection: docMethodOp(function(anchor, head, options) {
    var ranges = this.sel.ranges.slice(0);
    ranges.push(new Range(clipPos(this, anchor), clipPos(this, head || anchor)));
    setSelection(this, normalizeSelection(ranges, ranges.length - 1), options);
  }),

  getSelection: function(lineSep) {
    var this$1 = this;

    var ranges = this.sel.ranges, lines;
    for (var i = 0; i < ranges.length; i++) {
      var sel = getBetween(this$1, ranges[i].from(), ranges[i].to());
      lines = lines ? lines.concat(sel) : sel;
    }
    if (lineSep === false) { return lines }
    else { return lines.join(lineSep || this.lineSeparator()) }
  },
  getSelections: function(lineSep) {
    var this$1 = this;

    var parts = [], ranges = this.sel.ranges;
    for (var i = 0; i < ranges.length; i++) {
      var sel = getBetween(this$1, ranges[i].from(), ranges[i].to());
      if (lineSep !== false) { sel = sel.join(lineSep || this$1.lineSeparator()); }
      parts[i] = sel;
    }
    return parts
  },
  replaceSelection: function(code, collapse, origin) {
    var dup = [];
    for (var i = 0; i < this.sel.ranges.length; i++)
      { dup[i] = code; }
    this.replaceSelections(dup, collapse, origin || "+input");
  },
  replaceSelections: docMethodOp(function(code, collapse, origin) {
    var this$1 = this;

    var changes = [], sel = this.sel;
    for (var i = 0; i < sel.ranges.length; i++) {
      var range$$1 = sel.ranges[i];
      changes[i] = {from: range$$1.from(), to: range$$1.to(), text: this$1.splitLines(code[i]), origin: origin};
    }
    var newSel = collapse && collapse != "end" && computeReplacedSel(this, changes, collapse);
    for (var i$1 = changes.length - 1; i$1 >= 0; i$1--)
      { makeChange(this$1, changes[i$1]); }
    if (newSel) { setSelectionReplaceHistory(this, newSel); }
    else if (this.cm) { ensureCursorVisible(this.cm); }
  }),
  undo: docMethodOp(function() {makeChangeFromHistory(this, "undo");}),
  redo: docMethodOp(function() {makeChangeFromHistory(this, "redo");}),
  undoSelection: docMethodOp(function() {makeChangeFromHistory(this, "undo", true);}),
  redoSelection: docMethodOp(function() {makeChangeFromHistory(this, "redo", true);}),

  setExtending: function(val) {this.extend = val;},
  getExtending: function() {return this.extend},

  historySize: function() {
    var hist = this.history, done = 0, undone = 0;
    for (var i = 0; i < hist.done.length; i++) { if (!hist.done[i].ranges) { ++done; } }
    for (var i$1 = 0; i$1 < hist.undone.length; i$1++) { if (!hist.undone[i$1].ranges) { ++undone; } }
    return {undo: done, redo: undone}
  },
  clearHistory: function() {this.history = new History(this.history.maxGeneration);},

  markClean: function() {
    this.cleanGeneration = this.changeGeneration(true);
  },
  changeGeneration: function(forceSplit) {
    if (forceSplit)
      { this.history.lastOp = this.history.lastSelOp = this.history.lastOrigin = null; }
    return this.history.generation
  },
  isClean: function (gen) {
    return this.history.generation == (gen || this.cleanGeneration)
  },

  getHistory: function() {
    return {done: copyHistoryArray(this.history.done),
            undone: copyHistoryArray(this.history.undone)}
  },
  setHistory: function(histData) {
    var hist = this.history = new History(this.history.maxGeneration);
    hist.done = copyHistoryArray(histData.done.slice(0), null, true);
    hist.undone = copyHistoryArray(histData.undone.slice(0), null, true);
  },

  setGutterMarker: docMethodOp(function(line, gutterID, value) {
    return changeLine(this, line, "gutter", function (line) {
      var markers = line.gutterMarkers || (line.gutterMarkers = {});
      markers[gutterID] = value;
      if (!value && isEmpty(markers)) { line.gutterMarkers = null; }
      return true
    })
  }),

  clearGutter: docMethodOp(function(gutterID) {
    var this$1 = this;

    this.iter(function (line) {
      if (line.gutterMarkers && line.gutterMarkers[gutterID]) {
        changeLine(this$1, line, "gutter", function () {
          line.gutterMarkers[gutterID] = null;
          if (isEmpty(line.gutterMarkers)) { line.gutterMarkers = null; }
          return true
        });
      }
    });
  }),

  lineInfo: function(line) {
    var n;
    if (typeof line == "number") {
      if (!isLine(this, line)) { return null }
      n = line;
      line = getLine(this, line);
      if (!line) { return null }
    } else {
      n = lineNo(line);
      if (n == null) { return null }
    }
    return {line: n, handle: line, text: line.text, gutterMarkers: line.gutterMarkers,
            textClass: line.textClass, bgClass: line.bgClass, wrapClass: line.wrapClass,
            widgets: line.widgets}
  },

  addLineClass: docMethodOp(function(handle, where, cls) {
    return changeLine(this, handle, where == "gutter" ? "gutter" : "class", function (line) {
      var prop = where == "text" ? "textClass"
               : where == "background" ? "bgClass"
               : where == "gutter" ? "gutterClass" : "wrapClass";
      if (!line[prop]) { line[prop] = cls; }
      else if (classTest(cls).test(line[prop])) { return false }
      else { line[prop] += " " + cls; }
      return true
    })
  }),
  removeLineClass: docMethodOp(function(handle, where, cls) {
    return changeLine(this, handle, where == "gutter" ? "gutter" : "class", function (line) {
      var prop = where == "text" ? "textClass"
               : where == "background" ? "bgClass"
               : where == "gutter" ? "gutterClass" : "wrapClass";
      var cur = line[prop];
      if (!cur) { return false }
      else if (cls == null) { line[prop] = null; }
      else {
        var found = cur.match(classTest(cls));
        if (!found) { return false }
        var end = found.index + found[0].length;
        line[prop] = cur.slice(0, found.index) + (!found.index || end == cur.length ? "" : " ") + cur.slice(end) || null;
      }
      return true
    })
  }),

  addLineWidget: docMethodOp(function(handle, node, options) {
    return addLineWidget(this, handle, node, options)
  }),
  removeLineWidget: function(widget) { widget.clear(); },

  markText: function(from, to, options) {
    return markText(this, clipPos(this, from), clipPos(this, to), options, options && options.type || "range")
  },
  setBookmark: function(pos, options) {
    var realOpts = {replacedWith: options && (options.nodeType == null ? options.widget : options),
                    insertLeft: options && options.insertLeft,
                    clearWhenEmpty: false, shared: options && options.shared,
                    handleMouseEvents: options && options.handleMouseEvents};
    pos = clipPos(this, pos);
    return markText(this, pos, pos, realOpts, "bookmark")
  },
  findMarksAt: function(pos) {
    pos = clipPos(this, pos);
    var markers = [], spans = getLine(this, pos.line).markedSpans;
    if (spans) { for (var i = 0; i < spans.length; ++i) {
      var span = spans[i];
      if ((span.from == null || span.from <= pos.ch) &&
          (span.to == null || span.to >= pos.ch))
        { markers.push(span.marker.parent || span.marker); }
    } }
    return markers
  },
  findMarks: function(from, to, filter) {
    from = clipPos(this, from); to = clipPos(this, to);
    var found = [], lineNo$$1 = from.line;
    this.iter(from.line, to.line + 1, function (line) {
      var spans = line.markedSpans;
      if (spans) { for (var i = 0; i < spans.length; i++) {
        var span = spans[i];
        if (!(span.to != null && lineNo$$1 == from.line && from.ch >= span.to ||
              span.from == null && lineNo$$1 != from.line ||
              span.from != null && lineNo$$1 == to.line && span.from >= to.ch) &&
            (!filter || filter(span.marker)))
          { found.push(span.marker.parent || span.marker); }
      } }
      ++lineNo$$1;
    });
    return found
  },
  getAllMarks: function() {
    var markers = [];
    this.iter(function (line) {
      var sps = line.markedSpans;
      if (sps) { for (var i = 0; i < sps.length; ++i)
        { if (sps[i].from != null) { markers.push(sps[i].marker); } } }
    });
    return markers
  },

  posFromIndex: function(off) {
    var ch, lineNo$$1 = this.first, sepSize = this.lineSeparator().length;
    this.iter(function (line) {
      var sz = line.text.length + sepSize;
      if (sz > off) { ch = off; return true }
      off -= sz;
      ++lineNo$$1;
    });
    return clipPos(this, Pos(lineNo$$1, ch))
  },
  indexFromPos: function (coords) {
    coords = clipPos(this, coords);
    var index = coords.ch;
    if (coords.line < this.first || coords.ch < 0) { return 0 }
    var sepSize = this.lineSeparator().length;
    this.iter(this.first, coords.line, function (line) { // iter aborts when callback returns a truthy value
      index += line.text.length + sepSize;
    });
    return index
  },

  copy: function(copyHistory) {
    var doc = new Doc(getLines(this, this.first, this.first + this.size),
                      this.modeOption, this.first, this.lineSep, this.direction);
    doc.scrollTop = this.scrollTop; doc.scrollLeft = this.scrollLeft;
    doc.sel = this.sel;
    doc.extend = false;
    if (copyHistory) {
      doc.history.undoDepth = this.history.undoDepth;
      doc.setHistory(this.getHistory());
    }
    return doc
  },

  linkedDoc: function(options) {
    if (!options) { options = {}; }
    var from = this.first, to = this.first + this.size;
    if (options.from != null && options.from > from) { from = options.from; }
    if (options.to != null && options.to < to) { to = options.to; }
    var copy = new Doc(getLines(this, from, to), options.mode || this.modeOption, from, this.lineSep, this.direction);
    if (options.sharedHist) { copy.history = this.history
    ; }(this.linked || (this.linked = [])).push({doc: copy, sharedHist: options.sharedHist});
    copy.linked = [{doc: this, isParent: true, sharedHist: options.sharedHist}];
    copySharedMarkers(copy, findSharedMarkers(this));
    return copy
  },
  unlinkDoc: function(other) {
    var this$1 = this;

    if (other instanceof CodeMirror$1) { other = other.doc; }
    if (this.linked) { for (var i = 0; i < this.linked.length; ++i) {
      var link = this$1.linked[i];
      if (link.doc != other) { continue }
      this$1.linked.splice(i, 1);
      other.unlinkDoc(this$1);
      detachSharedMarkers(findSharedMarkers(this$1));
      break
    } }
    // If the histories were shared, split them again
    if (other.history == this.history) {
      var splitIds = [other.id];
      linkedDocs(other, function (doc) { return splitIds.push(doc.id); }, true);
      other.history = new History(null);
      other.history.done = copyHistoryArray(this.history.done, splitIds);
      other.history.undone = copyHistoryArray(this.history.undone, splitIds);
    }
  },
  iterLinkedDocs: function(f) {linkedDocs(this, f);},

  getMode: function() {return this.mode},
  getEditor: function() {return this.cm},

  splitLines: function(str) {
    if (this.lineSep) { return str.split(this.lineSep) }
    return splitLinesAuto(str)
  },
  lineSeparator: function() { return this.lineSep || "\n" },

  setDirection: docMethodOp(function (dir) {
    if (dir != "rtl") { dir = "ltr"; }
    if (dir == this.direction) { return }
    this.direction = dir;
    this.iter(function (line) { return line.order = null; });
    if (this.cm) { directionChanged(this.cm); }
  })
});

// Public alias.
Doc.prototype.eachLine = Doc.prototype.iter;

// Kludge to work around strange IE behavior where it'll sometimes
// re-fire a series of drag-related events right after the drop (#1551)
var lastDrop = 0;

function onDrop(e) {
  var cm = this;
  clearDragCursor(cm);
  if (signalDOMEvent(cm, e) || eventInWidget(cm.display, e))
    { return }
  e_preventDefault(e);
  if (ie) { lastDrop = +new Date; }
  var pos = posFromMouse(cm, e, true), files = e.dataTransfer.files;
  if (!pos || cm.isReadOnly()) { return }
  // Might be a file drop, in which case we simply extract the text
  // and insert it.
  if (files && files.length && window.FileReader && window.File) {
    var n = files.length, text = Array(n), read = 0;
    var loadFile = function (file, i) {
      if (cm.options.allowDropFileTypes &&
          indexOf(cm.options.allowDropFileTypes, file.type) == -1)
        { return }

      var reader = new FileReader;
      reader.onload = operation(cm, function () {
        var content = reader.result;
        if (/[\x00-\x08\x0e-\x1f]{2}/.test(content)) { content = ""; }
        text[i] = content;
        if (++read == n) {
          pos = clipPos(cm.doc, pos);
          var change = {from: pos, to: pos,
                        text: cm.doc.splitLines(text.join(cm.doc.lineSeparator())),
                        origin: "paste"};
          makeChange(cm.doc, change);
          setSelectionReplaceHistory(cm.doc, simpleSelection(pos, changeEnd(change)));
        }
      });
      reader.readAsText(file);
    };
    for (var i = 0; i < n; ++i) { loadFile(files[i], i); }
  } else { // Normal drop
    // Don't do a replace if the drop happened inside of the selected text.
    if (cm.state.draggingText && cm.doc.sel.contains(pos) > -1) {
      cm.state.draggingText(e);
      // Ensure the editor is re-focused
      setTimeout(function () { return cm.display.input.focus(); }, 20);
      return
    }
    try {
      var text$1 = e.dataTransfer.getData("Text");
      if (text$1) {
        var selected;
        if (cm.state.draggingText && !cm.state.draggingText.copy)
          { selected = cm.listSelections(); }
        setSelectionNoUndo(cm.doc, simpleSelection(pos, pos));
        if (selected) { for (var i$1 = 0; i$1 < selected.length; ++i$1)
          { replaceRange(cm.doc, "", selected[i$1].anchor, selected[i$1].head, "drag"); } }
        cm.replaceSelection(text$1, "around", "paste");
        cm.display.input.focus();
      }
    }
    catch(e){}
  }
}

function onDragStart(cm, e) {
  if (ie && (!cm.state.draggingText || +new Date - lastDrop < 100)) { e_stop(e); return }
  if (signalDOMEvent(cm, e) || eventInWidget(cm.display, e)) { return }

  e.dataTransfer.setData("Text", cm.getSelection());
  e.dataTransfer.effectAllowed = "copyMove";

  // Use dummy image instead of default browsers image.
  // Recent Safari (~6.0.2) have a tendency to segfault when this happens, so we don't do it there.
  if (e.dataTransfer.setDragImage && !safari) {
    var img = elt("img", null, null, "position: fixed; left: 0; top: 0;");
    img.src = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
    if (presto) {
      img.width = img.height = 1;
      cm.display.wrapper.appendChild(img);
      // Force a relayout, or Opera won't use our image for some obscure reason
      img._top = img.offsetTop;
    }
    e.dataTransfer.setDragImage(img, 0, 0);
    if (presto) { img.parentNode.removeChild(img); }
  }
}

function onDragOver(cm, e) {
  var pos = posFromMouse(cm, e);
  if (!pos) { return }
  var frag = document.createDocumentFragment();
  drawSelectionCursor(cm, pos, frag);
  if (!cm.display.dragCursor) {
    cm.display.dragCursor = elt("div", null, "CodeMirror-cursors CodeMirror-dragcursors");
    cm.display.lineSpace.insertBefore(cm.display.dragCursor, cm.display.cursorDiv);
  }
  removeChildrenAndAdd(cm.display.dragCursor, frag);
}

function clearDragCursor(cm) {
  if (cm.display.dragCursor) {
    cm.display.lineSpace.removeChild(cm.display.dragCursor);
    cm.display.dragCursor = null;
  }
}

// These must be handled carefully, because naively registering a
// handler for each editor will cause the editors to never be
// garbage collected.

function forEachCodeMirror(f) {
  if (!document.getElementsByClassName) { return }
  var byClass = document.getElementsByClassName("CodeMirror");
  for (var i = 0; i < byClass.length; i++) {
    var cm = byClass[i].CodeMirror;
    if (cm) { f(cm); }
  }
}

var globalsRegistered = false;
function ensureGlobalHandlers() {
  if (globalsRegistered) { return }
  registerGlobalHandlers();
  globalsRegistered = true;
}
function registerGlobalHandlers() {
  // When the window resizes, we need to refresh active editors.
  var resizeTimer;
  on(window, "resize", function () {
    if (resizeTimer == null) { resizeTimer = setTimeout(function () {
      resizeTimer = null;
      forEachCodeMirror(onResize);
    }, 100); }
  });
  // When the window loses focus, we want to show the editor as blurred
  on(window, "blur", function () { return forEachCodeMirror(onBlur); });
}
// Called when the window resizes
function onResize(cm) {
  var d = cm.display;
  // Might be a text scaling operation, clear size caches.
  d.cachedCharWidth = d.cachedTextHeight = d.cachedPaddingH = null;
  d.scrollbarsClipped = false;
  cm.setSize();
}

var keyNames = {
  3: "Pause", 8: "Backspace", 9: "Tab", 13: "Enter", 16: "Shift", 17: "Ctrl", 18: "Alt",
  19: "Pause", 20: "CapsLock", 27: "Esc", 32: "Space", 33: "PageUp", 34: "PageDown", 35: "End",
  36: "Home", 37: "Left", 38: "Up", 39: "Right", 40: "Down", 44: "PrintScrn", 45: "Insert",
  46: "Delete", 59: ";", 61: "=", 91: "Mod", 92: "Mod", 93: "Mod",
  106: "*", 107: "=", 109: "-", 110: ".", 111: "/", 127: "Delete", 145: "ScrollLock",
  173: "-", 186: ";", 187: "=", 188: ",", 189: "-", 190: ".", 191: "/", 192: "`", 219: "[", 220: "\\",
  221: "]", 222: "'", 63232: "Up", 63233: "Down", 63234: "Left", 63235: "Right", 63272: "Delete",
  63273: "Home", 63275: "End", 63276: "PageUp", 63277: "PageDown", 63302: "Insert"
};

// Number keys
for (var i = 0; i < 10; i++) { keyNames[i + 48] = keyNames[i + 96] = String(i); }
// Alphabetic keys
for (var i$1 = 65; i$1 <= 90; i$1++) { keyNames[i$1] = String.fromCharCode(i$1); }
// Function keys
for (var i$2 = 1; i$2 <= 12; i$2++) { keyNames[i$2 + 111] = keyNames[i$2 + 63235] = "F" + i$2; }

var keyMap = {};

keyMap.basic = {
  "Left": "goCharLeft", "Right": "goCharRight", "Up": "goLineUp", "Down": "goLineDown",
  "End": "goLineEnd", "Home": "goLineStartSmart", "PageUp": "goPageUp", "PageDown": "goPageDown",
  "Delete": "delCharAfter", "Backspace": "delCharBefore", "Shift-Backspace": "delCharBefore",
  "Tab": "defaultTab", "Shift-Tab": "indentAuto",
  "Enter": "newlineAndIndent", "Insert": "toggleOverwrite",
  "Esc": "singleSelection"
};
// Note that the save and find-related commands aren't defined by
// default. User code or addons can define them. Unknown commands
// are simply ignored.
keyMap.pcDefault = {
  "Ctrl-A": "selectAll", "Ctrl-D": "deleteLine", "Ctrl-Z": "undo", "Shift-Ctrl-Z": "redo", "Ctrl-Y": "redo",
  "Ctrl-Home": "goDocStart", "Ctrl-End": "goDocEnd", "Ctrl-Up": "goLineUp", "Ctrl-Down": "goLineDown",
  "Ctrl-Left": "goGroupLeft", "Ctrl-Right": "goGroupRight", "Alt-Left": "goLineStart", "Alt-Right": "goLineEnd",
  "Ctrl-Backspace": "delGroupBefore", "Ctrl-Delete": "delGroupAfter", "Ctrl-S": "save", "Ctrl-F": "find",
  "Ctrl-G": "findNext", "Shift-Ctrl-G": "findPrev", "Shift-Ctrl-F": "replace", "Shift-Ctrl-R": "replaceAll",
  "Ctrl-[": "indentLess", "Ctrl-]": "indentMore",
  "Ctrl-U": "undoSelection", "Shift-Ctrl-U": "redoSelection", "Alt-U": "redoSelection",
  fallthrough: "basic"
};
// Very basic readline/emacs-style bindings, which are standard on Mac.
keyMap.emacsy = {
  "Ctrl-F": "goCharRight", "Ctrl-B": "goCharLeft", "Ctrl-P": "goLineUp", "Ctrl-N": "goLineDown",
  "Alt-F": "goWordRight", "Alt-B": "goWordLeft", "Ctrl-A": "goLineStart", "Ctrl-E": "goLineEnd",
  "Ctrl-V": "goPageDown", "Shift-Ctrl-V": "goPageUp", "Ctrl-D": "delCharAfter", "Ctrl-H": "delCharBefore",
  "Alt-D": "delWordAfter", "Alt-Backspace": "delWordBefore", "Ctrl-K": "killLine", "Ctrl-T": "transposeChars",
  "Ctrl-O": "openLine"
};
keyMap.macDefault = {
  "Cmd-A": "selectAll", "Cmd-D": "deleteLine", "Cmd-Z": "undo", "Shift-Cmd-Z": "redo", "Cmd-Y": "redo",
  "Cmd-Home": "goDocStart", "Cmd-Up": "goDocStart", "Cmd-End": "goDocEnd", "Cmd-Down": "goDocEnd", "Alt-Left": "goGroupLeft",
  "Alt-Right": "goGroupRight", "Cmd-Left": "goLineLeft", "Cmd-Right": "goLineRight", "Alt-Backspace": "delGroupBefore",
  "Ctrl-Alt-Backspace": "delGroupAfter", "Alt-Delete": "delGroupAfter", "Cmd-S": "save", "Cmd-F": "find",
  "Cmd-G": "findNext", "Shift-Cmd-G": "findPrev", "Cmd-Alt-F": "replace", "Shift-Cmd-Alt-F": "replaceAll",
  "Cmd-[": "indentLess", "Cmd-]": "indentMore", "Cmd-Backspace": "delWrappedLineLeft", "Cmd-Delete": "delWrappedLineRight",
  "Cmd-U": "undoSelection", "Shift-Cmd-U": "redoSelection", "Ctrl-Up": "goDocStart", "Ctrl-Down": "goDocEnd",
  fallthrough: ["basic", "emacsy"]
};
keyMap["default"] = mac ? keyMap.macDefault : keyMap.pcDefault;

// KEYMAP DISPATCH

function normalizeKeyName(name) {
  var parts = name.split(/-(?!$)/);
  name = parts[parts.length - 1];
  var alt, ctrl, shift, cmd;
  for (var i = 0; i < parts.length - 1; i++) {
    var mod = parts[i];
    if (/^(cmd|meta|m)$/i.test(mod)) { cmd = true; }
    else if (/^a(lt)?$/i.test(mod)) { alt = true; }
    else if (/^(c|ctrl|control)$/i.test(mod)) { ctrl = true; }
    else if (/^s(hift)?$/i.test(mod)) { shift = true; }
    else { throw new Error("Unrecognized modifier name: " + mod) }
  }
  if (alt) { name = "Alt-" + name; }
  if (ctrl) { name = "Ctrl-" + name; }
  if (cmd) { name = "Cmd-" + name; }
  if (shift) { name = "Shift-" + name; }
  return name
}

// This is a kludge to keep keymaps mostly working as raw objects
// (backwards compatibility) while at the same time support features
// like normalization and multi-stroke key bindings. It compiles a
// new normalized keymap, and then updates the old object to reflect
// this.
function normalizeKeyMap(keymap) {
  var copy = {};
  for (var keyname in keymap) { if (keymap.hasOwnProperty(keyname)) {
    var value = keymap[keyname];
    if (/^(name|fallthrough|(de|at)tach)$/.test(keyname)) { continue }
    if (value == "...") { delete keymap[keyname]; continue }

    var keys = map(keyname.split(" "), normalizeKeyName);
    for (var i = 0; i < keys.length; i++) {
      var val = (void 0), name = (void 0);
      if (i == keys.length - 1) {
        name = keys.join(" ");
        val = value;
      } else {
        name = keys.slice(0, i + 1).join(" ");
        val = "...";
      }
      var prev = copy[name];
      if (!prev) { copy[name] = val; }
      else if (prev != val) { throw new Error("Inconsistent bindings for " + name) }
    }
    delete keymap[keyname];
  } }
  for (var prop in copy) { keymap[prop] = copy[prop]; }
  return keymap
}

function lookupKey(key, map$$1, handle, context) {
  map$$1 = getKeyMap(map$$1);
  var found = map$$1.call ? map$$1.call(key, context) : map$$1[key];
  if (found === false) { return "nothing" }
  if (found === "...") { return "multi" }
  if (found != null && handle(found)) { return "handled" }

  if (map$$1.fallthrough) {
    if (Object.prototype.toString.call(map$$1.fallthrough) != "[object Array]")
      { return lookupKey(key, map$$1.fallthrough, handle, context) }
    for (var i = 0; i < map$$1.fallthrough.length; i++) {
      var result = lookupKey(key, map$$1.fallthrough[i], handle, context);
      if (result) { return result }
    }
  }
}

// Modifier key presses don't count as 'real' key presses for the
// purpose of keymap fallthrough.
function isModifierKey(value) {
  var name = typeof value == "string" ? value : keyNames[value.keyCode];
  return name == "Ctrl" || name == "Alt" || name == "Shift" || name == "Mod"
}

function addModifierNames(name, event, noShift) {
  var base = name;
  if (event.altKey && base != "Alt") { name = "Alt-" + name; }
  if ((flipCtrlCmd ? event.metaKey : event.ctrlKey) && base != "Ctrl") { name = "Ctrl-" + name; }
  if ((flipCtrlCmd ? event.ctrlKey : event.metaKey) && base != "Cmd") { name = "Cmd-" + name; }
  if (!noShift && event.shiftKey && base != "Shift") { name = "Shift-" + name; }
  return name
}

// Look up the name of a key as indicated by an event object.
function keyName(event, noShift) {
  if (presto && event.keyCode == 34 && event["char"]) { return false }
  var name = keyNames[event.keyCode];
  if (name == null || event.altGraphKey) { return false }
  // Ctrl-ScrollLock has keyCode 3, same as Ctrl-Pause,
  // so we'll use event.code when available (Chrome 48+, FF 38+, Safari 10.1+)
  if (event.keyCode == 3 && event.code) { name = event.code; }
  return addModifierNames(name, event, noShift)
}

function getKeyMap(val) {
  return typeof val == "string" ? keyMap[val] : val
}

// Helper for deleting text near the selection(s), used to implement
// backspace, delete, and similar functionality.
function deleteNearSelection(cm, compute) {
  var ranges = cm.doc.sel.ranges, kill = [];
  // Build up a set of ranges to kill first, merging overlapping
  // ranges.
  for (var i = 0; i < ranges.length; i++) {
    var toKill = compute(ranges[i]);
    while (kill.length && cmp(toKill.from, lst(kill).to) <= 0) {
      var replaced = kill.pop();
      if (cmp(replaced.from, toKill.from) < 0) {
        toKill.from = replaced.from;
        break
      }
    }
    kill.push(toKill);
  }
  // Next, remove those actual ranges.
  runInOp(cm, function () {
    for (var i = kill.length - 1; i >= 0; i--)
      { replaceRange(cm.doc, "", kill[i].from, kill[i].to, "+delete"); }
    ensureCursorVisible(cm);
  });
}

function moveCharLogically(line, ch, dir) {
  var target = skipExtendingChars(line.text, ch + dir, dir);
  return target < 0 || target > line.text.length ? null : target
}

function moveLogically(line, start, dir) {
  var ch = moveCharLogically(line, start.ch, dir);
  return ch == null ? null : new Pos(start.line, ch, dir < 0 ? "after" : "before")
}

function endOfLine(visually, cm, lineObj, lineNo, dir) {
  if (visually) {
    var order = getOrder(lineObj, cm.doc.direction);
    if (order) {
      var part = dir < 0 ? lst(order) : order[0];
      var moveInStorageOrder = (dir < 0) == (part.level == 1);
      var sticky = moveInStorageOrder ? "after" : "before";
      var ch;
      // With a wrapped rtl chunk (possibly spanning multiple bidi parts),
      // it could be that the last bidi part is not on the last visual line,
      // since visual lines contain content order-consecutive chunks.
      // Thus, in rtl, we are looking for the first (content-order) character
      // in the rtl chunk that is on the last line (that is, the same line
      // as the last (content-order) character).
      if (part.level > 0 || cm.doc.direction == "rtl") {
        var prep = prepareMeasureForLine(cm, lineObj);
        ch = dir < 0 ? lineObj.text.length - 1 : 0;
        var targetTop = measureCharPrepared(cm, prep, ch).top;
        ch = findFirst(function (ch) { return measureCharPrepared(cm, prep, ch).top == targetTop; }, (dir < 0) == (part.level == 1) ? part.from : part.to - 1, ch);
        if (sticky == "before") { ch = moveCharLogically(lineObj, ch, 1); }
      } else { ch = dir < 0 ? part.to : part.from; }
      return new Pos(lineNo, ch, sticky)
    }
  }
  return new Pos(lineNo, dir < 0 ? lineObj.text.length : 0, dir < 0 ? "before" : "after")
}

function moveVisually(cm, line, start, dir) {
  var bidi = getOrder(line, cm.doc.direction);
  if (!bidi) { return moveLogically(line, start, dir) }
  if (start.ch >= line.text.length) {
    start.ch = line.text.length;
    start.sticky = "before";
  } else if (start.ch <= 0) {
    start.ch = 0;
    start.sticky = "after";
  }
  var partPos = getBidiPartAt(bidi, start.ch, start.sticky), part = bidi[partPos];
  if (cm.doc.direction == "ltr" && part.level % 2 == 0 && (dir > 0 ? part.to > start.ch : part.from < start.ch)) {
    // Case 1: We move within an ltr part in an ltr editor. Even with wrapped lines,
    // nothing interesting happens.
    return moveLogically(line, start, dir)
  }

  var mv = function (pos, dir) { return moveCharLogically(line, pos instanceof Pos ? pos.ch : pos, dir); };
  var prep;
  var getWrappedLineExtent = function (ch) {
    if (!cm.options.lineWrapping) { return {begin: 0, end: line.text.length} }
    prep = prep || prepareMeasureForLine(cm, line);
    return wrappedLineExtentChar(cm, line, prep, ch)
  };
  var wrappedLineExtent = getWrappedLineExtent(start.sticky == "before" ? mv(start, -1) : start.ch);

  if (cm.doc.direction == "rtl" || part.level == 1) {
    var moveInStorageOrder = (part.level == 1) == (dir < 0);
    var ch = mv(start, moveInStorageOrder ? 1 : -1);
    if (ch != null && (!moveInStorageOrder ? ch >= part.from && ch >= wrappedLineExtent.begin : ch <= part.to && ch <= wrappedLineExtent.end)) {
      // Case 2: We move within an rtl part or in an rtl editor on the same visual line
      var sticky = moveInStorageOrder ? "before" : "after";
      return new Pos(start.line, ch, sticky)
    }
  }

  // Case 3: Could not move within this bidi part in this visual line, so leave
  // the current bidi part

  var searchInVisualLine = function (partPos, dir, wrappedLineExtent) {
    var getRes = function (ch, moveInStorageOrder) { return moveInStorageOrder
      ? new Pos(start.line, mv(ch, 1), "before")
      : new Pos(start.line, ch, "after"); };

    for (; partPos >= 0 && partPos < bidi.length; partPos += dir) {
      var part = bidi[partPos];
      var moveInStorageOrder = (dir > 0) == (part.level != 1);
      var ch = moveInStorageOrder ? wrappedLineExtent.begin : mv(wrappedLineExtent.end, -1);
      if (part.from <= ch && ch < part.to) { return getRes(ch, moveInStorageOrder) }
      ch = moveInStorageOrder ? part.from : mv(part.to, -1);
      if (wrappedLineExtent.begin <= ch && ch < wrappedLineExtent.end) { return getRes(ch, moveInStorageOrder) }
    }
  };

  // Case 3a: Look for other bidi parts on the same visual line
  var res = searchInVisualLine(partPos + dir, dir, wrappedLineExtent);
  if (res) { return res }

  // Case 3b: Look for other bidi parts on the next visual line
  var nextCh = dir > 0 ? wrappedLineExtent.end : mv(wrappedLineExtent.begin, -1);
  if (nextCh != null && !(dir > 0 && nextCh == line.text.length)) {
    res = searchInVisualLine(dir > 0 ? 0 : bidi.length - 1, dir, getWrappedLineExtent(nextCh));
    if (res) { return res }
  }

  // Case 4: Nowhere to move
  return null
}

// Commands are parameter-less actions that can be performed on an
// editor, mostly used for keybindings.
var commands = {
  selectAll: selectAll,
  singleSelection: function (cm) { return cm.setSelection(cm.getCursor("anchor"), cm.getCursor("head"), sel_dontScroll); },
  killLine: function (cm) { return deleteNearSelection(cm, function (range) {
    if (range.empty()) {
      var len = getLine(cm.doc, range.head.line).text.length;
      if (range.head.ch == len && range.head.line < cm.lastLine())
        { return {from: range.head, to: Pos(range.head.line + 1, 0)} }
      else
        { return {from: range.head, to: Pos(range.head.line, len)} }
    } else {
      return {from: range.from(), to: range.to()}
    }
  }); },
  deleteLine: function (cm) { return deleteNearSelection(cm, function (range) { return ({
    from: Pos(range.from().line, 0),
    to: clipPos(cm.doc, Pos(range.to().line + 1, 0))
  }); }); },
  delLineLeft: function (cm) { return deleteNearSelection(cm, function (range) { return ({
    from: Pos(range.from().line, 0), to: range.from()
  }); }); },
  delWrappedLineLeft: function (cm) { return deleteNearSelection(cm, function (range) {
    var top = cm.charCoords(range.head, "div").top + 5;
    var leftPos = cm.coordsChar({left: 0, top: top}, "div");
    return {from: leftPos, to: range.from()}
  }); },
  delWrappedLineRight: function (cm) { return deleteNearSelection(cm, function (range) {
    var top = cm.charCoords(range.head, "div").top + 5;
    var rightPos = cm.coordsChar({left: cm.display.lineDiv.offsetWidth + 100, top: top}, "div");
    return {from: range.from(), to: rightPos }
  }); },
  undo: function (cm) { return cm.undo(); },
  redo: function (cm) { return cm.redo(); },
  undoSelection: function (cm) { return cm.undoSelection(); },
  redoSelection: function (cm) { return cm.redoSelection(); },
  goDocStart: function (cm) { return cm.extendSelection(Pos(cm.firstLine(), 0)); },
  goDocEnd: function (cm) { return cm.extendSelection(Pos(cm.lastLine())); },
  goLineStart: function (cm) { return cm.extendSelectionsBy(function (range) { return lineStart(cm, range.head.line); },
    {origin: "+move", bias: 1}
  ); },
  goLineStartSmart: function (cm) { return cm.extendSelectionsBy(function (range) { return lineStartSmart(cm, range.head); },
    {origin: "+move", bias: 1}
  ); },
  goLineEnd: function (cm) { return cm.extendSelectionsBy(function (range) { return lineEnd(cm, range.head.line); },
    {origin: "+move", bias: -1}
  ); },
  goLineRight: function (cm) { return cm.extendSelectionsBy(function (range) {
    var top = cm.cursorCoords(range.head, "div").top + 5;
    return cm.coordsChar({left: cm.display.lineDiv.offsetWidth + 100, top: top}, "div")
  }, sel_move); },
  goLineLeft: function (cm) { return cm.extendSelectionsBy(function (range) {
    var top = cm.cursorCoords(range.head, "div").top + 5;
    return cm.coordsChar({left: 0, top: top}, "div")
  }, sel_move); },
  goLineLeftSmart: function (cm) { return cm.extendSelectionsBy(function (range) {
    var top = cm.cursorCoords(range.head, "div").top + 5;
    var pos = cm.coordsChar({left: 0, top: top}, "div");
    if (pos.ch < cm.getLine(pos.line).search(/\S/)) { return lineStartSmart(cm, range.head) }
    return pos
  }, sel_move); },
  goLineUp: function (cm) { return cm.moveV(-1, "line"); },
  goLineDown: function (cm) { return cm.moveV(1, "line"); },
  goPageUp: function (cm) { return cm.moveV(-1, "page"); },
  goPageDown: function (cm) { return cm.moveV(1, "page"); },
  goCharLeft: function (cm) { return cm.moveH(-1, "char"); },
  goCharRight: function (cm) { return cm.moveH(1, "char"); },
  goColumnLeft: function (cm) { return cm.moveH(-1, "column"); },
  goColumnRight: function (cm) { return cm.moveH(1, "column"); },
  goWordLeft: function (cm) { return cm.moveH(-1, "word"); },
  goGroupRight: function (cm) { return cm.moveH(1, "group"); },
  goGroupLeft: function (cm) { return cm.moveH(-1, "group"); },
  goWordRight: function (cm) { return cm.moveH(1, "word"); },
  delCharBefore: function (cm) { return cm.deleteH(-1, "char"); },
  delCharAfter: function (cm) { return cm.deleteH(1, "char"); },
  delWordBefore: function (cm) { return cm.deleteH(-1, "word"); },
  delWordAfter: function (cm) { return cm.deleteH(1, "word"); },
  delGroupBefore: function (cm) { return cm.deleteH(-1, "group"); },
  delGroupAfter: function (cm) { return cm.deleteH(1, "group"); },
  indentAuto: function (cm) { return cm.indentSelection("smart"); },
  indentMore: function (cm) { return cm.indentSelection("add"); },
  indentLess: function (cm) { return cm.indentSelection("subtract"); },
  insertTab: function (cm) { return cm.replaceSelection("\t"); },
  insertSoftTab: function (cm) {
    var spaces = [], ranges = cm.listSelections(), tabSize = cm.options.tabSize;
    for (var i = 0; i < ranges.length; i++) {
      var pos = ranges[i].from();
      var col = countColumn(cm.getLine(pos.line), pos.ch, tabSize);
      spaces.push(spaceStr(tabSize - col % tabSize));
    }
    cm.replaceSelections(spaces);
  },
  defaultTab: function (cm) {
    if (cm.somethingSelected()) { cm.indentSelection("add"); }
    else { cm.execCommand("insertTab"); }
  },
  // Swap the two chars left and right of each selection's head.
  // Move cursor behind the two swapped characters afterwards.
  //
  // Doesn't consider line feeds a character.
  // Doesn't scan more than one line above to find a character.
  // Doesn't do anything on an empty line.
  // Doesn't do anything with non-empty selections.
  transposeChars: function (cm) { return runInOp(cm, function () {
    var ranges = cm.listSelections(), newSel = [];
    for (var i = 0; i < ranges.length; i++) {
      if (!ranges[i].empty()) { continue }
      var cur = ranges[i].head, line = getLine(cm.doc, cur.line).text;
      if (line) {
        if (cur.ch == line.length) { cur = new Pos(cur.line, cur.ch - 1); }
        if (cur.ch > 0) {
          cur = new Pos(cur.line, cur.ch + 1);
          cm.replaceRange(line.charAt(cur.ch - 1) + line.charAt(cur.ch - 2),
                          Pos(cur.line, cur.ch - 2), cur, "+transpose");
        } else if (cur.line > cm.doc.first) {
          var prev = getLine(cm.doc, cur.line - 1).text;
          if (prev) {
            cur = new Pos(cur.line, 1);
            cm.replaceRange(line.charAt(0) + cm.doc.lineSeparator() +
                            prev.charAt(prev.length - 1),
                            Pos(cur.line - 1, prev.length - 1), cur, "+transpose");
          }
        }
      }
      newSel.push(new Range(cur, cur));
    }
    cm.setSelections(newSel);
  }); },
  newlineAndIndent: function (cm) { return runInOp(cm, function () {
    var sels = cm.listSelections();
    for (var i = sels.length - 1; i >= 0; i--)
      { cm.replaceRange(cm.doc.lineSeparator(), sels[i].anchor, sels[i].head, "+input"); }
    sels = cm.listSelections();
    for (var i$1 = 0; i$1 < sels.length; i$1++)
      { cm.indentLine(sels[i$1].from().line, null, true); }
    ensureCursorVisible(cm);
  }); },
  openLine: function (cm) { return cm.replaceSelection("\n", "start"); },
  toggleOverwrite: function (cm) { return cm.toggleOverwrite(); }
};


function lineStart(cm, lineN) {
  var line = getLine(cm.doc, lineN);
  var visual = visualLine(line);
  if (visual != line) { lineN = lineNo(visual); }
  return endOfLine(true, cm, visual, lineN, 1)
}
function lineEnd(cm, lineN) {
  var line = getLine(cm.doc, lineN);
  var visual = visualLineEnd(line);
  if (visual != line) { lineN = lineNo(visual); }
  return endOfLine(true, cm, line, lineN, -1)
}
function lineStartSmart(cm, pos) {
  var start = lineStart(cm, pos.line);
  var line = getLine(cm.doc, start.line);
  var order = getOrder(line, cm.doc.direction);
  if (!order || order[0].level == 0) {
    var firstNonWS = Math.max(0, line.text.search(/\S/));
    var inWS = pos.line == start.line && pos.ch <= firstNonWS && pos.ch;
    return Pos(start.line, inWS ? 0 : firstNonWS, start.sticky)
  }
  return start
}

// Run a handler that was bound to a key.
function doHandleBinding(cm, bound, dropShift) {
  if (typeof bound == "string") {
    bound = commands[bound];
    if (!bound) { return false }
  }
  // Ensure previous input has been read, so that the handler sees a
  // consistent view of the document
  cm.display.input.ensurePolled();
  var prevShift = cm.display.shift, done = false;
  try {
    if (cm.isReadOnly()) { cm.state.suppressEdits = true; }
    if (dropShift) { cm.display.shift = false; }
    done = bound(cm) != Pass;
  } finally {
    cm.display.shift = prevShift;
    cm.state.suppressEdits = false;
  }
  return done
}

function lookupKeyForEditor(cm, name, handle) {
  for (var i = 0; i < cm.state.keyMaps.length; i++) {
    var result = lookupKey(name, cm.state.keyMaps[i], handle, cm);
    if (result) { return result }
  }
  return (cm.options.extraKeys && lookupKey(name, cm.options.extraKeys, handle, cm))
    || lookupKey(name, cm.options.keyMap, handle, cm)
}

// Note that, despite the name, this function is also used to check
// for bound mouse clicks.

var stopSeq = new Delayed;

function dispatchKey(cm, name, e, handle) {
  var seq = cm.state.keySeq;
  if (seq) {
    if (isModifierKey(name)) { return "handled" }
    if (/\'$/.test(name))
      { cm.state.keySeq = null; }
    else
      { stopSeq.set(50, function () {
        if (cm.state.keySeq == seq) {
          cm.state.keySeq = null;
          cm.display.input.reset();
        }
      }); }
    if (dispatchKeyInner(cm, seq + " " + name, e, handle)) { return true }
  }
  return dispatchKeyInner(cm, name, e, handle)
}

function dispatchKeyInner(cm, name, e, handle) {
  var result = lookupKeyForEditor(cm, name, handle);

  if (result == "multi")
    { cm.state.keySeq = name; }
  if (result == "handled")
    { signalLater(cm, "keyHandled", cm, name, e); }

  if (result == "handled" || result == "multi") {
    e_preventDefault(e);
    restartBlink(cm);
  }

  return !!result
}

// Handle a key from the keydown event.
function handleKeyBinding(cm, e) {
  var name = keyName(e, true);
  if (!name) { return false }

  if (e.shiftKey && !cm.state.keySeq) {
    // First try to resolve full name (including 'Shift-'). Failing
    // that, see if there is a cursor-motion command (starting with
    // 'go') bound to the keyname without 'Shift-'.
    return dispatchKey(cm, "Shift-" + name, e, function (b) { return doHandleBinding(cm, b, true); })
        || dispatchKey(cm, name, e, function (b) {
             if (typeof b == "string" ? /^go[A-Z]/.test(b) : b.motion)
               { return doHandleBinding(cm, b) }
           })
  } else {
    return dispatchKey(cm, name, e, function (b) { return doHandleBinding(cm, b); })
  }
}

// Handle a key from the keypress event
function handleCharBinding(cm, e, ch) {
  return dispatchKey(cm, "'" + ch + "'", e, function (b) { return doHandleBinding(cm, b, true); })
}

var lastStoppedKey = null;
function onKeyDown(e) {
  var cm = this;
  cm.curOp.focus = activeElt();
  if (signalDOMEvent(cm, e)) { return }
  // IE does strange things with escape.
  if (ie && ie_version < 11 && e.keyCode == 27) { e.returnValue = false; }
  var code = e.keyCode;
  cm.display.shift = code == 16 || e.shiftKey;
  var handled = handleKeyBinding(cm, e);
  if (presto) {
    lastStoppedKey = handled ? code : null;
    // Opera has no cut event... we try to at least catch the key combo
    if (!handled && code == 88 && !hasCopyEvent && (mac ? e.metaKey : e.ctrlKey))
      { cm.replaceSelection("", null, "cut"); }
  }

  // Turn mouse into crosshair when Alt is held on Mac.
  if (code == 18 && !/\bCodeMirror-crosshair\b/.test(cm.display.lineDiv.className))
    { showCrossHair(cm); }
}

function showCrossHair(cm) {
  var lineDiv = cm.display.lineDiv;
  addClass(lineDiv, "CodeMirror-crosshair");

  function up(e) {
    if (e.keyCode == 18 || !e.altKey) {
      rmClass(lineDiv, "CodeMirror-crosshair");
      off(document, "keyup", up);
      off(document, "mouseover", up);
    }
  }
  on(document, "keyup", up);
  on(document, "mouseover", up);
}

function onKeyUp(e) {
  if (e.keyCode == 16) { this.doc.sel.shift = false; }
  signalDOMEvent(this, e);
}

function onKeyPress(e) {
  var cm = this;
  if (eventInWidget(cm.display, e) || signalDOMEvent(cm, e) || e.ctrlKey && !e.altKey || mac && e.metaKey) { return }
  var keyCode = e.keyCode, charCode = e.charCode;
  if (presto && keyCode == lastStoppedKey) {lastStoppedKey = null; e_preventDefault(e); return}
  if ((presto && (!e.which || e.which < 10)) && handleKeyBinding(cm, e)) { return }
  var ch = String.fromCharCode(charCode == null ? keyCode : charCode);
  // Some browsers fire keypress events for backspace
  if (ch == "\x08") { return }
  if (handleCharBinding(cm, e, ch)) { return }
  cm.display.input.onKeyPress(e);
}

var DOUBLECLICK_DELAY = 400;

var PastClick = function(time, pos, button) {
  this.time = time;
  this.pos = pos;
  this.button = button;
};

PastClick.prototype.compare = function (time, pos, button) {
  return this.time + DOUBLECLICK_DELAY > time &&
    cmp(pos, this.pos) == 0 && button == this.button
};

var lastClick;
var lastDoubleClick;
function clickRepeat(pos, button) {
  var now = +new Date;
  if (lastDoubleClick && lastDoubleClick.compare(now, pos, button)) {
    lastClick = lastDoubleClick = null;
    return "triple"
  } else if (lastClick && lastClick.compare(now, pos, button)) {
    lastDoubleClick = new PastClick(now, pos, button);
    lastClick = null;
    return "double"
  } else {
    lastClick = new PastClick(now, pos, button);
    lastDoubleClick = null;
    return "single"
  }
}

// A mouse down can be a single click, double click, triple click,
// start of selection drag, start of text drag, new cursor
// (ctrl-click), rectangle drag (alt-drag), or xwin
// middle-click-paste. Or it might be a click on something we should
// not interfere with, such as a scrollbar or widget.
function onMouseDown(e) {
  var cm = this, display = cm.display;
  if (signalDOMEvent(cm, e) || display.activeTouch && display.input.supportsTouch()) { return }
  display.input.ensurePolled();
  display.shift = e.shiftKey;

  if (eventInWidget(display, e)) {
    if (!webkit) {
      // Briefly turn off draggability, to allow widgets to do
      // normal dragging things.
      display.scroller.draggable = false;
      setTimeout(function () { return display.scroller.draggable = true; }, 100);
    }
    return
  }
  if (clickInGutter(cm, e)) { return }
  var pos = posFromMouse(cm, e), button = e_button(e), repeat = pos ? clickRepeat(pos, button) : "single";
  window.focus();

  // #3261: make sure, that we're not starting a second selection
  if (button == 1 && cm.state.selectingText)
    { cm.state.selectingText(e); }

  if (pos && handleMappedButton(cm, button, pos, repeat, e)) { return }

  if (button == 1) {
    if (pos) { leftButtonDown(cm, pos, repeat, e); }
    else if (e_target(e) == display.scroller) { e_preventDefault(e); }
  } else if (button == 2) {
    if (pos) { extendSelection(cm.doc, pos); }
    setTimeout(function () { return display.input.focus(); }, 20);
  } else if (button == 3) {
    if (captureRightClick) { onContextMenu(cm, e); }
    else { delayBlurEvent(cm); }
  }
}

function handleMappedButton(cm, button, pos, repeat, event) {
  var name = "Click";
  if (repeat == "double") { name = "Double" + name; }
  else if (repeat == "triple") { name = "Triple" + name; }
  name = (button == 1 ? "Left" : button == 2 ? "Middle" : "Right") + name;

  return dispatchKey(cm,  addModifierNames(name, event), event, function (bound) {
    if (typeof bound == "string") { bound = commands[bound]; }
    if (!bound) { return false }
    var done = false;
    try {
      if (cm.isReadOnly()) { cm.state.suppressEdits = true; }
      done = bound(cm, pos) != Pass;
    } finally {
      cm.state.suppressEdits = false;
    }
    return done
  })
}

function configureMouse(cm, repeat, event) {
  var option = cm.getOption("configureMouse");
  var value = option ? option(cm, repeat, event) : {};
  if (value.unit == null) {
    var rect = chromeOS ? event.shiftKey && event.metaKey : event.altKey;
    value.unit = rect ? "rectangle" : repeat == "single" ? "char" : repeat == "double" ? "word" : "line";
  }
  if (value.extend == null || cm.doc.extend) { value.extend = cm.doc.extend || event.shiftKey; }
  if (value.addNew == null) { value.addNew = mac ? event.metaKey : event.ctrlKey; }
  if (value.moveOnDrag == null) { value.moveOnDrag = !(mac ? event.altKey : event.ctrlKey); }
  return value
}

function leftButtonDown(cm, pos, repeat, event) {
  if (ie) { setTimeout(bind(ensureFocus, cm), 0); }
  else { cm.curOp.focus = activeElt(); }

  var behavior = configureMouse(cm, repeat, event);

  var sel = cm.doc.sel, contained;
  if (cm.options.dragDrop && dragAndDrop && !cm.isReadOnly() &&
      repeat == "single" && (contained = sel.contains(pos)) > -1 &&
      (cmp((contained = sel.ranges[contained]).from(), pos) < 0 || pos.xRel > 0) &&
      (cmp(contained.to(), pos) > 0 || pos.xRel < 0))
    { leftButtonStartDrag(cm, event, pos, behavior); }
  else
    { leftButtonSelect(cm, event, pos, behavior); }
}

// Start a text drag. When it ends, see if any dragging actually
// happen, and treat as a click if it didn't.
function leftButtonStartDrag(cm, event, pos, behavior) {
  var display = cm.display, moved = false;
  var dragEnd = operation(cm, function (e) {
    if (webkit) { display.scroller.draggable = false; }
    cm.state.draggingText = false;
    off(display.wrapper.ownerDocument, "mouseup", dragEnd);
    off(display.wrapper.ownerDocument, "mousemove", mouseMove);
    off(display.scroller, "dragstart", dragStart);
    off(display.scroller, "drop", dragEnd);
    if (!moved) {
      e_preventDefault(e);
      if (!behavior.addNew)
        { extendSelection(cm.doc, pos, null, null, behavior.extend); }
      // Work around unexplainable focus problem in IE9 (#2127) and Chrome (#3081)
      if (webkit || ie && ie_version == 9)
        { setTimeout(function () {display.wrapper.ownerDocument.body.focus(); display.input.focus();}, 20); }
      else
        { display.input.focus(); }
    }
  });
  var mouseMove = function(e2) {
    moved = moved || Math.abs(event.clientX - e2.clientX) + Math.abs(event.clientY - e2.clientY) >= 10;
  };
  var dragStart = function () { return moved = true; };
  // Let the drag handler handle this.
  if (webkit) { display.scroller.draggable = true; }
  cm.state.draggingText = dragEnd;
  dragEnd.copy = !behavior.moveOnDrag;
  // IE's approach to draggable
  if (display.scroller.dragDrop) { display.scroller.dragDrop(); }
  on(display.wrapper.ownerDocument, "mouseup", dragEnd);
  on(display.wrapper.ownerDocument, "mousemove", mouseMove);
  on(display.scroller, "dragstart", dragStart);
  on(display.scroller, "drop", dragEnd);

  delayBlurEvent(cm);
  setTimeout(function () { return display.input.focus(); }, 20);
}

function rangeForUnit(cm, pos, unit) {
  if (unit == "char") { return new Range(pos, pos) }
  if (unit == "word") { return cm.findWordAt(pos) }
  if (unit == "line") { return new Range(Pos(pos.line, 0), clipPos(cm.doc, Pos(pos.line + 1, 0))) }
  var result = unit(cm, pos);
  return new Range(result.from, result.to)
}

// Normal selection, as opposed to text dragging.
function leftButtonSelect(cm, event, start, behavior) {
  var display = cm.display, doc = cm.doc;
  e_preventDefault(event);

  var ourRange, ourIndex, startSel = doc.sel, ranges = startSel.ranges;
  if (behavior.addNew && !behavior.extend) {
    ourIndex = doc.sel.contains(start);
    if (ourIndex > -1)
      { ourRange = ranges[ourIndex]; }
    else
      { ourRange = new Range(start, start); }
  } else {
    ourRange = doc.sel.primary();
    ourIndex = doc.sel.primIndex;
  }

  if (behavior.unit == "rectangle") {
    if (!behavior.addNew) { ourRange = new Range(start, start); }
    start = posFromMouse(cm, event, true, true);
    ourIndex = -1;
  } else {
    var range$$1 = rangeForUnit(cm, start, behavior.unit);
    if (behavior.extend)
      { ourRange = extendRange(ourRange, range$$1.anchor, range$$1.head, behavior.extend); }
    else
      { ourRange = range$$1; }
  }

  if (!behavior.addNew) {
    ourIndex = 0;
    setSelection(doc, new Selection([ourRange], 0), sel_mouse);
    startSel = doc.sel;
  } else if (ourIndex == -1) {
    ourIndex = ranges.length;
    setSelection(doc, normalizeSelection(ranges.concat([ourRange]), ourIndex),
                 {scroll: false, origin: "*mouse"});
  } else if (ranges.length > 1 && ranges[ourIndex].empty() && behavior.unit == "char" && !behavior.extend) {
    setSelection(doc, normalizeSelection(ranges.slice(0, ourIndex).concat(ranges.slice(ourIndex + 1)), 0),
                 {scroll: false, origin: "*mouse"});
    startSel = doc.sel;
  } else {
    replaceOneSelection(doc, ourIndex, ourRange, sel_mouse);
  }

  var lastPos = start;
  function extendTo(pos) {
    if (cmp(lastPos, pos) == 0) { return }
    lastPos = pos;

    if (behavior.unit == "rectangle") {
      var ranges = [], tabSize = cm.options.tabSize;
      var startCol = countColumn(getLine(doc, start.line).text, start.ch, tabSize);
      var posCol = countColumn(getLine(doc, pos.line).text, pos.ch, tabSize);
      var left = Math.min(startCol, posCol), right = Math.max(startCol, posCol);
      for (var line = Math.min(start.line, pos.line), end = Math.min(cm.lastLine(), Math.max(start.line, pos.line));
           line <= end; line++) {
        var text = getLine(doc, line).text, leftPos = findColumn(text, left, tabSize);
        if (left == right)
          { ranges.push(new Range(Pos(line, leftPos), Pos(line, leftPos))); }
        else if (text.length > leftPos)
          { ranges.push(new Range(Pos(line, leftPos), Pos(line, findColumn(text, right, tabSize)))); }
      }
      if (!ranges.length) { ranges.push(new Range(start, start)); }
      setSelection(doc, normalizeSelection(startSel.ranges.slice(0, ourIndex).concat(ranges), ourIndex),
                   {origin: "*mouse", scroll: false});
      cm.scrollIntoView(pos);
    } else {
      var oldRange = ourRange;
      var range$$1 = rangeForUnit(cm, pos, behavior.unit);
      var anchor = oldRange.anchor, head;
      if (cmp(range$$1.anchor, anchor) > 0) {
        head = range$$1.head;
        anchor = minPos(oldRange.from(), range$$1.anchor);
      } else {
        head = range$$1.anchor;
        anchor = maxPos(oldRange.to(), range$$1.head);
      }
      var ranges$1 = startSel.ranges.slice(0);
      ranges$1[ourIndex] = bidiSimplify(cm, new Range(clipPos(doc, anchor), head));
      setSelection(doc, normalizeSelection(ranges$1, ourIndex), sel_mouse);
    }
  }

  var editorSize = display.wrapper.getBoundingClientRect();
  // Used to ensure timeout re-tries don't fire when another extend
  // happened in the meantime (clearTimeout isn't reliable -- at
  // least on Chrome, the timeouts still happen even when cleared,
  // if the clear happens after their scheduled firing time).
  var counter = 0;

  function extend(e) {
    var curCount = ++counter;
    var cur = posFromMouse(cm, e, true, behavior.unit == "rectangle");
    if (!cur) { return }
    if (cmp(cur, lastPos) != 0) {
      cm.curOp.focus = activeElt();
      extendTo(cur);
      var visible = visibleLines(display, doc);
      if (cur.line >= visible.to || cur.line < visible.from)
        { setTimeout(operation(cm, function () {if (counter == curCount) { extend(e); }}), 150); }
    } else {
      var outside = e.clientY < editorSize.top ? -20 : e.clientY > editorSize.bottom ? 20 : 0;
      if (outside) { setTimeout(operation(cm, function () {
        if (counter != curCount) { return }
        display.scroller.scrollTop += outside;
        extend(e);
      }), 50); }
    }
  }

  function done(e) {
    cm.state.selectingText = false;
    counter = Infinity;
    e_preventDefault(e);
    display.input.focus();
    off(display.wrapper.ownerDocument, "mousemove", move);
    off(display.wrapper.ownerDocument, "mouseup", up);
    doc.history.lastSelOrigin = null;
  }

  var move = operation(cm, function (e) {
    if (e.buttons === 0 || !e_button(e)) { done(e); }
    else { extend(e); }
  });
  var up = operation(cm, done);
  cm.state.selectingText = up;
  on(display.wrapper.ownerDocument, "mousemove", move);
  on(display.wrapper.ownerDocument, "mouseup", up);
}

// Used when mouse-selecting to adjust the anchor to the proper side
// of a bidi jump depending on the visual position of the head.
function bidiSimplify(cm, range$$1) {
  var anchor = range$$1.anchor;
  var head = range$$1.head;
  var anchorLine = getLine(cm.doc, anchor.line);
  if (cmp(anchor, head) == 0 && anchor.sticky == head.sticky) { return range$$1 }
  var order = getOrder(anchorLine);
  if (!order) { return range$$1 }
  var index = getBidiPartAt(order, anchor.ch, anchor.sticky), part = order[index];
  if (part.from != anchor.ch && part.to != anchor.ch) { return range$$1 }
  var boundary = index + ((part.from == anchor.ch) == (part.level != 1) ? 0 : 1);
  if (boundary == 0 || boundary == order.length) { return range$$1 }

  // Compute the relative visual position of the head compared to the
  // anchor (<0 is to the left, >0 to the right)
  var leftSide;
  if (head.line != anchor.line) {
    leftSide = (head.line - anchor.line) * (cm.doc.direction == "ltr" ? 1 : -1) > 0;
  } else {
    var headIndex = getBidiPartAt(order, head.ch, head.sticky);
    var dir = headIndex - index || (head.ch - anchor.ch) * (part.level == 1 ? -1 : 1);
    if (headIndex == boundary - 1 || headIndex == boundary)
      { leftSide = dir < 0; }
    else
      { leftSide = dir > 0; }
  }

  var usePart = order[boundary + (leftSide ? -1 : 0)];
  var from = leftSide == (usePart.level == 1);
  var ch = from ? usePart.from : usePart.to, sticky = from ? "after" : "before";
  return anchor.ch == ch && anchor.sticky == sticky ? range$$1 : new Range(new Pos(anchor.line, ch, sticky), head)
}


// Determines whether an event happened in the gutter, and fires the
// handlers for the corresponding event.
function gutterEvent(cm, e, type, prevent) {
  var mX, mY;
  if (e.touches) {
    mX = e.touches[0].clientX;
    mY = e.touches[0].clientY;
  } else {
    try { mX = e.clientX; mY = e.clientY; }
    catch(e) { return false }
  }
  if (mX >= Math.floor(cm.display.gutters.getBoundingClientRect().right)) { return false }
  if (prevent) { e_preventDefault(e); }

  var display = cm.display;
  var lineBox = display.lineDiv.getBoundingClientRect();

  if (mY > lineBox.bottom || !hasHandler(cm, type)) { return e_defaultPrevented(e) }
  mY -= lineBox.top - display.viewOffset;

  for (var i = 0; i < cm.options.gutters.length; ++i) {
    var g = display.gutters.childNodes[i];
    if (g && g.getBoundingClientRect().right >= mX) {
      var line = lineAtHeight(cm.doc, mY);
      var gutter = cm.options.gutters[i];
      signal(cm, type, cm, line, gutter, e);
      return e_defaultPrevented(e)
    }
  }
}

function clickInGutter(cm, e) {
  return gutterEvent(cm, e, "gutterClick", true)
}

// CONTEXT MENU HANDLING

// To make the context menu work, we need to briefly unhide the
// textarea (making it as unobtrusive as possible) to let the
// right-click take effect on it.
function onContextMenu(cm, e) {
  if (eventInWidget(cm.display, e) || contextMenuInGutter(cm, e)) { return }
  if (signalDOMEvent(cm, e, "contextmenu")) { return }
  cm.display.input.onContextMenu(e);
}

function contextMenuInGutter(cm, e) {
  if (!hasHandler(cm, "gutterContextMenu")) { return false }
  return gutterEvent(cm, e, "gutterContextMenu", false)
}

function themeChanged(cm) {
  cm.display.wrapper.className = cm.display.wrapper.className.replace(/\s*cm-s-\S+/g, "") +
    cm.options.theme.replace(/(^|\s)\s*/g, " cm-s-");
  clearCaches(cm);
}

var Init = {toString: function(){return "CodeMirror.Init"}};

var defaults = {};
var optionHandlers = {};

function defineOptions(CodeMirror) {
  var optionHandlers = CodeMirror.optionHandlers;

  function option(name, deflt, handle, notOnInit) {
    CodeMirror.defaults[name] = deflt;
    if (handle) { optionHandlers[name] =
      notOnInit ? function (cm, val, old) {if (old != Init) { handle(cm, val, old); }} : handle; }
  }

  CodeMirror.defineOption = option;

  // Passed to option handlers when there is no old value.
  CodeMirror.Init = Init;

  // These two are, on init, called from the constructor because they
  // have to be initialized before the editor can start at all.
  option("value", "", function (cm, val) { return cm.setValue(val); }, true);
  option("mode", null, function (cm, val) {
    cm.doc.modeOption = val;
    loadMode(cm);
  }, true);

  option("indentUnit", 2, loadMode, true);
  option("indentWithTabs", false);
  option("smartIndent", true);
  option("tabSize", 4, function (cm) {
    resetModeState(cm);
    clearCaches(cm);
    regChange(cm);
  }, true);

  option("lineSeparator", null, function (cm, val) {
    cm.doc.lineSep = val;
    if (!val) { return }
    var newBreaks = [], lineNo = cm.doc.first;
    cm.doc.iter(function (line) {
      for (var pos = 0;;) {
        var found = line.text.indexOf(val, pos);
        if (found == -1) { break }
        pos = found + val.length;
        newBreaks.push(Pos(lineNo, found));
      }
      lineNo++;
    });
    for (var i = newBreaks.length - 1; i >= 0; i--)
      { replaceRange(cm.doc, val, newBreaks[i], Pos(newBreaks[i].line, newBreaks[i].ch + val.length)); }
  });
  option("specialChars", /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u200b-\u200f\u2028\u2029\ufeff]/g, function (cm, val, old) {
    cm.state.specialChars = new RegExp(val.source + (val.test("\t") ? "" : "|\t"), "g");
    if (old != Init) { cm.refresh(); }
  });
  option("specialCharPlaceholder", defaultSpecialCharPlaceholder, function (cm) { return cm.refresh(); }, true);
  option("electricChars", true);
  option("inputStyle", mobile ? "contenteditable" : "textarea", function () {
    throw new Error("inputStyle can not (yet) be changed in a running editor") // FIXME
  }, true);
  option("spellcheck", false, function (cm, val) { return cm.getInputField().spellcheck = val; }, true);
  option("rtlMoveVisually", !windows);
  option("wholeLineUpdateBefore", true);

  option("theme", "default", function (cm) {
    themeChanged(cm);
    guttersChanged(cm);
  }, true);
  option("keyMap", "default", function (cm, val, old) {
    var next = getKeyMap(val);
    var prev = old != Init && getKeyMap(old);
    if (prev && prev.detach) { prev.detach(cm, next); }
    if (next.attach) { next.attach(cm, prev || null); }
  });
  option("extraKeys", null);
  option("configureMouse", null);

  option("lineWrapping", false, wrappingChanged, true);
  option("gutters", [], function (cm) {
    setGuttersForLineNumbers(cm.options);
    guttersChanged(cm);
  }, true);
  option("fixedGutter", true, function (cm, val) {
    cm.display.gutters.style.left = val ? compensateForHScroll(cm.display) + "px" : "0";
    cm.refresh();
  }, true);
  option("coverGutterNextToScrollbar", false, function (cm) { return updateScrollbars(cm); }, true);
  option("scrollbarStyle", "native", function (cm) {
    initScrollbars(cm);
    updateScrollbars(cm);
    cm.display.scrollbars.setScrollTop(cm.doc.scrollTop);
    cm.display.scrollbars.setScrollLeft(cm.doc.scrollLeft);
  }, true);
  option("lineNumbers", false, function (cm) {
    setGuttersForLineNumbers(cm.options);
    guttersChanged(cm);
  }, true);
  option("firstLineNumber", 1, guttersChanged, true);
  option("lineNumberFormatter", function (integer) { return integer; }, guttersChanged, true);
  option("showCursorWhenSelecting", false, updateSelection, true);

  option("resetSelectionOnContextMenu", true);
  option("lineWiseCopyCut", true);
  option("pasteLinesPerSelection", true);

  option("readOnly", false, function (cm, val) {
    if (val == "nocursor") {
      onBlur(cm);
      cm.display.input.blur();
    }
    cm.display.input.readOnlyChanged(val);
  });
  option("disableInput", false, function (cm, val) {if (!val) { cm.display.input.reset(); }}, true);
  option("dragDrop", true, dragDropChanged);
  option("allowDropFileTypes", null);

  option("cursorBlinkRate", 530);
  option("cursorScrollMargin", 0);
  option("cursorHeight", 1, updateSelection, true);
  option("singleCursorHeightPerLine", true, updateSelection, true);
  option("workTime", 100);
  option("workDelay", 100);
  option("flattenSpans", true, resetModeState, true);
  option("addModeClass", false, resetModeState, true);
  option("pollInterval", 100);
  option("undoDepth", 200, function (cm, val) { return cm.doc.history.undoDepth = val; });
  option("historyEventDelay", 1250);
  option("viewportMargin", 10, function (cm) { return cm.refresh(); }, true);
  option("maxHighlightLength", 10000, resetModeState, true);
  option("moveInputWithCursor", true, function (cm, val) {
    if (!val) { cm.display.input.resetPosition(); }
  });

  option("tabindex", null, function (cm, val) { return cm.display.input.getField().tabIndex = val || ""; });
  option("autofocus", null);
  option("direction", "ltr", function (cm, val) { return cm.doc.setDirection(val); }, true);
}

function guttersChanged(cm) {
  updateGutters(cm);
  regChange(cm);
  alignHorizontally(cm);
}

function dragDropChanged(cm, value, old) {
  var wasOn = old && old != Init;
  if (!value != !wasOn) {
    var funcs = cm.display.dragFunctions;
    var toggle = value ? on : off;
    toggle(cm.display.scroller, "dragstart", funcs.start);
    toggle(cm.display.scroller, "dragenter", funcs.enter);
    toggle(cm.display.scroller, "dragover", funcs.over);
    toggle(cm.display.scroller, "dragleave", funcs.leave);
    toggle(cm.display.scroller, "drop", funcs.drop);
  }
}

function wrappingChanged(cm) {
  if (cm.options.lineWrapping) {
    addClass(cm.display.wrapper, "CodeMirror-wrap");
    cm.display.sizer.style.minWidth = "";
    cm.display.sizerWidth = null;
  } else {
    rmClass(cm.display.wrapper, "CodeMirror-wrap");
    findMaxLine(cm);
  }
  estimateLineHeights(cm);
  regChange(cm);
  clearCaches(cm);
  setTimeout(function () { return updateScrollbars(cm); }, 100);
}

// A CodeMirror instance represents an editor. This is the object
// that user code is usually dealing with.

function CodeMirror$1(place, options) {
  var this$1 = this;

  if (!(this instanceof CodeMirror$1)) { return new CodeMirror$1(place, options) }

  this.options = options = options ? copyObj(options) : {};
  // Determine effective options based on given values and defaults.
  copyObj(defaults, options, false);
  setGuttersForLineNumbers(options);

  var doc = options.value;
  if (typeof doc == "string") { doc = new Doc(doc, options.mode, null, options.lineSeparator, options.direction); }
  this.doc = doc;

  var input = new CodeMirror$1.inputStyles[options.inputStyle](this);
  var display = this.display = new Display(place, doc, input);
  display.wrapper.CodeMirror = this;
  updateGutters(this);
  themeChanged(this);
  if (options.lineWrapping)
    { this.display.wrapper.className += " CodeMirror-wrap"; }
  initScrollbars(this);

  this.state = {
    keyMaps: [],  // stores maps added by addKeyMap
    overlays: [], // highlighting overlays, as added by addOverlay
    modeGen: 0,   // bumped when mode/overlay changes, used to invalidate highlighting info
    overwrite: false,
    delayingBlurEvent: false,
    focused: false,
    suppressEdits: false, // used to disable editing during key handlers when in readOnly mode
    pasteIncoming: false, cutIncoming: false, // help recognize paste/cut edits in input.poll
    selectingText: false,
    draggingText: false,
    highlight: new Delayed(), // stores highlight worker timeout
    keySeq: null,  // Unfinished key sequence
    specialChars: null
  };

  if (options.autofocus && !mobile) { display.input.focus(); }

  // Override magic textarea content restore that IE sometimes does
  // on our hidden textarea on reload
  if (ie && ie_version < 11) { setTimeout(function () { return this$1.display.input.reset(true); }, 20); }

  registerEventHandlers(this);
  ensureGlobalHandlers();

  startOperation(this);
  this.curOp.forceUpdate = true;
  attachDoc(this, doc);

  if ((options.autofocus && !mobile) || this.hasFocus())
    { setTimeout(bind(onFocus, this), 20); }
  else
    { onBlur(this); }

  for (var opt in optionHandlers) { if (optionHandlers.hasOwnProperty(opt))
    { optionHandlers[opt](this$1, options[opt], Init); } }
  maybeUpdateLineNumberWidth(this);
  if (options.finishInit) { options.finishInit(this); }
  for (var i = 0; i < initHooks.length; ++i) { initHooks[i](this$1); }
  endOperation(this);
  // Suppress optimizelegibility in Webkit, since it breaks text
  // measuring on line wrapping boundaries.
  if (webkit && options.lineWrapping &&
      getComputedStyle(display.lineDiv).textRendering == "optimizelegibility")
    { display.lineDiv.style.textRendering = "auto"; }
}

// The default configuration options.
CodeMirror$1.defaults = defaults;
// Functions to run when options are changed.
CodeMirror$1.optionHandlers = optionHandlers;

// Attach the necessary event handlers when initializing the editor
function registerEventHandlers(cm) {
  var d = cm.display;
  on(d.scroller, "mousedown", operation(cm, onMouseDown));
  // Older IE's will not fire a second mousedown for a double click
  if (ie && ie_version < 11)
    { on(d.scroller, "dblclick", operation(cm, function (e) {
      if (signalDOMEvent(cm, e)) { return }
      var pos = posFromMouse(cm, e);
      if (!pos || clickInGutter(cm, e) || eventInWidget(cm.display, e)) { return }
      e_preventDefault(e);
      var word = cm.findWordAt(pos);
      extendSelection(cm.doc, word.anchor, word.head);
    })); }
  else
    { on(d.scroller, "dblclick", function (e) { return signalDOMEvent(cm, e) || e_preventDefault(e); }); }
  // Some browsers fire contextmenu *after* opening the menu, at
  // which point we can't mess with it anymore. Context menu is
  // handled in onMouseDown for these browsers.
  if (!captureRightClick) { on(d.scroller, "contextmenu", function (e) { return onContextMenu(cm, e); }); }

  // Used to suppress mouse event handling when a touch happens
  var touchFinished, prevTouch = {end: 0};
  function finishTouch() {
    if (d.activeTouch) {
      touchFinished = setTimeout(function () { return d.activeTouch = null; }, 1000);
      prevTouch = d.activeTouch;
      prevTouch.end = +new Date;
    }
  }
  function isMouseLikeTouchEvent(e) {
    if (e.touches.length != 1) { return false }
    var touch = e.touches[0];
    return touch.radiusX <= 1 && touch.radiusY <= 1
  }
  function farAway(touch, other) {
    if (other.left == null) { return true }
    var dx = other.left - touch.left, dy = other.top - touch.top;
    return dx * dx + dy * dy > 20 * 20
  }
  on(d.scroller, "touchstart", function (e) {
    if (!signalDOMEvent(cm, e) && !isMouseLikeTouchEvent(e) && !clickInGutter(cm, e)) {
      d.input.ensurePolled();
      clearTimeout(touchFinished);
      var now = +new Date;
      d.activeTouch = {start: now, moved: false,
                       prev: now - prevTouch.end <= 300 ? prevTouch : null};
      if (e.touches.length == 1) {
        d.activeTouch.left = e.touches[0].pageX;
        d.activeTouch.top = e.touches[0].pageY;
      }
    }
  });
  on(d.scroller, "touchmove", function () {
    if (d.activeTouch) { d.activeTouch.moved = true; }
  });
  on(d.scroller, "touchend", function (e) {
    var touch = d.activeTouch;
    if (touch && !eventInWidget(d, e) && touch.left != null &&
        !touch.moved && new Date - touch.start < 300) {
      var pos = cm.coordsChar(d.activeTouch, "page"), range;
      if (!touch.prev || farAway(touch, touch.prev)) // Single tap
        { range = new Range(pos, pos); }
      else if (!touch.prev.prev || farAway(touch, touch.prev.prev)) // Double tap
        { range = cm.findWordAt(pos); }
      else // Triple tap
        { range = new Range(Pos(pos.line, 0), clipPos(cm.doc, Pos(pos.line + 1, 0))); }
      cm.setSelection(range.anchor, range.head);
      cm.focus();
      e_preventDefault(e);
    }
    finishTouch();
  });
  on(d.scroller, "touchcancel", finishTouch);

  // Sync scrolling between fake scrollbars and real scrollable
  // area, ensure viewport is updated when scrolling.
  on(d.scroller, "scroll", function () {
    if (d.scroller.clientHeight) {
      updateScrollTop(cm, d.scroller.scrollTop);
      setScrollLeft(cm, d.scroller.scrollLeft, true);
      signal(cm, "scroll", cm);
    }
  });

  // Listen to wheel events in order to try and update the viewport on time.
  on(d.scroller, "mousewheel", function (e) { return onScrollWheel(cm, e); });
  on(d.scroller, "DOMMouseScroll", function (e) { return onScrollWheel(cm, e); });

  // Prevent wrapper from ever scrolling
  on(d.wrapper, "scroll", function () { return d.wrapper.scrollTop = d.wrapper.scrollLeft = 0; });

  d.dragFunctions = {
    enter: function (e) {if (!signalDOMEvent(cm, e)) { e_stop(e); }},
    over: function (e) {if (!signalDOMEvent(cm, e)) { onDragOver(cm, e); e_stop(e); }},
    start: function (e) { return onDragStart(cm, e); },
    drop: operation(cm, onDrop),
    leave: function (e) {if (!signalDOMEvent(cm, e)) { clearDragCursor(cm); }}
  };

  var inp = d.input.getField();
  on(inp, "keyup", function (e) { return onKeyUp.call(cm, e); });
  on(inp, "keydown", operation(cm, onKeyDown));
  on(inp, "keypress", operation(cm, onKeyPress));
  on(inp, "focus", function (e) { return onFocus(cm, e); });
  on(inp, "blur", function (e) { return onBlur(cm, e); });
}

var initHooks = [];
CodeMirror$1.defineInitHook = function (f) { return initHooks.push(f); };

// Indent the given line. The how parameter can be "smart",
// "add"/null, "subtract", or "prev". When aggressive is false
// (typically set to true for forced single-line indents), empty
// lines are not indented, and places where the mode returns Pass
// are left alone.
function indentLine(cm, n, how, aggressive) {
  var doc = cm.doc, state;
  if (how == null) { how = "add"; }
  if (how == "smart") {
    // Fall back to "prev" when the mode doesn't have an indentation
    // method.
    if (!doc.mode.indent) { how = "prev"; }
    else { state = getContextBefore(cm, n).state; }
  }

  var tabSize = cm.options.tabSize;
  var line = getLine(doc, n), curSpace = countColumn(line.text, null, tabSize);
  if (line.stateAfter) { line.stateAfter = null; }
  var curSpaceString = line.text.match(/^\s*/)[0], indentation;
  if (!aggressive && !/\S/.test(line.text)) {
    indentation = 0;
    how = "not";
  } else if (how == "smart") {
    indentation = doc.mode.indent(state, line.text.slice(curSpaceString.length), line.text);
    if (indentation == Pass || indentation > 150) {
      if (!aggressive) { return }
      how = "prev";
    }
  }
  if (how == "prev") {
    if (n > doc.first) { indentation = countColumn(getLine(doc, n-1).text, null, tabSize); }
    else { indentation = 0; }
  } else if (how == "add") {
    indentation = curSpace + cm.options.indentUnit;
  } else if (how == "subtract") {
    indentation = curSpace - cm.options.indentUnit;
  } else if (typeof how == "number") {
    indentation = curSpace + how;
  }
  indentation = Math.max(0, indentation);

  var indentString = "", pos = 0;
  if (cm.options.indentWithTabs)
    { for (var i = Math.floor(indentation / tabSize); i; --i) {pos += tabSize; indentString += "\t";} }
  if (pos < indentation) { indentString += spaceStr(indentation - pos); }

  if (indentString != curSpaceString) {
    replaceRange(doc, indentString, Pos(n, 0), Pos(n, curSpaceString.length), "+input");
    line.stateAfter = null;
    return true
  } else {
    // Ensure that, if the cursor was in the whitespace at the start
    // of the line, it is moved to the end of that space.
    for (var i$1 = 0; i$1 < doc.sel.ranges.length; i$1++) {
      var range = doc.sel.ranges[i$1];
      if (range.head.line == n && range.head.ch < curSpaceString.length) {
        var pos$1 = Pos(n, curSpaceString.length);
        replaceOneSelection(doc, i$1, new Range(pos$1, pos$1));
        break
      }
    }
  }
}

// This will be set to a {lineWise: bool, text: [string]} object, so
// that, when pasting, we know what kind of selections the copied
// text was made out of.
var lastCopied = null;

function setLastCopied(newLastCopied) {
  lastCopied = newLastCopied;
}

function applyTextInput(cm, inserted, deleted, sel, origin) {
  var doc = cm.doc;
  cm.display.shift = false;
  if (!sel) { sel = doc.sel; }

  var paste = cm.state.pasteIncoming || origin == "paste";
  var textLines = splitLinesAuto(inserted), multiPaste = null;
  // When pasting N lines into N selections, insert one line per selection
  if (paste && sel.ranges.length > 1) {
    if (lastCopied && lastCopied.text.join("\n") == inserted) {
      if (sel.ranges.length % lastCopied.text.length == 0) {
        multiPaste = [];
        for (var i = 0; i < lastCopied.text.length; i++)
          { multiPaste.push(doc.splitLines(lastCopied.text[i])); }
      }
    } else if (textLines.length == sel.ranges.length && cm.options.pasteLinesPerSelection) {
      multiPaste = map(textLines, function (l) { return [l]; });
    }
  }

  var updateInput;
  // Normal behavior is to insert the new text into every selection
  for (var i$1 = sel.ranges.length - 1; i$1 >= 0; i$1--) {
    var range$$1 = sel.ranges[i$1];
    var from = range$$1.from(), to = range$$1.to();
    if (range$$1.empty()) {
      if (deleted && deleted > 0) // Handle deletion
        { from = Pos(from.line, from.ch - deleted); }
      else if (cm.state.overwrite && !paste) // Handle overwrite
        { to = Pos(to.line, Math.min(getLine(doc, to.line).text.length, to.ch + lst(textLines).length)); }
      else if (lastCopied && lastCopied.lineWise && lastCopied.text.join("\n") == inserted)
        { from = to = Pos(from.line, 0); }
    }
    updateInput = cm.curOp.updateInput;
    var changeEvent = {from: from, to: to, text: multiPaste ? multiPaste[i$1 % multiPaste.length] : textLines,
                       origin: origin || (paste ? "paste" : cm.state.cutIncoming ? "cut" : "+input")};
    makeChange(cm.doc, changeEvent);
    signalLater(cm, "inputRead", cm, changeEvent);
  }
  if (inserted && !paste)
    { triggerElectric(cm, inserted); }

  ensureCursorVisible(cm);
  cm.curOp.updateInput = updateInput;
  cm.curOp.typing = true;
  cm.state.pasteIncoming = cm.state.cutIncoming = false;
}

function handlePaste(e, cm) {
  var pasted = e.clipboardData && e.clipboardData.getData("Text");
  if (pasted) {
    e.preventDefault();
    if (!cm.isReadOnly() && !cm.options.disableInput)
      { runInOp(cm, function () { return applyTextInput(cm, pasted, 0, null, "paste"); }); }
    return true
  }
}

function triggerElectric(cm, inserted) {
  // When an 'electric' character is inserted, immediately trigger a reindent
  if (!cm.options.electricChars || !cm.options.smartIndent) { return }
  var sel = cm.doc.sel;

  for (var i = sel.ranges.length - 1; i >= 0; i--) {
    var range$$1 = sel.ranges[i];
    if (range$$1.head.ch > 100 || (i && sel.ranges[i - 1].head.line == range$$1.head.line)) { continue }
    var mode = cm.getModeAt(range$$1.head);
    var indented = false;
    if (mode.electricChars) {
      for (var j = 0; j < mode.electricChars.length; j++)
        { if (inserted.indexOf(mode.electricChars.charAt(j)) > -1) {
          indented = indentLine(cm, range$$1.head.line, "smart");
          break
        } }
    } else if (mode.electricInput) {
      if (mode.electricInput.test(getLine(cm.doc, range$$1.head.line).text.slice(0, range$$1.head.ch)))
        { indented = indentLine(cm, range$$1.head.line, "smart"); }
    }
    if (indented) { signalLater(cm, "electricInput", cm, range$$1.head.line); }
  }
}

function copyableRanges(cm) {
  var text = [], ranges = [];
  for (var i = 0; i < cm.doc.sel.ranges.length; i++) {
    var line = cm.doc.sel.ranges[i].head.line;
    var lineRange = {anchor: Pos(line, 0), head: Pos(line + 1, 0)};
    ranges.push(lineRange);
    text.push(cm.getRange(lineRange.anchor, lineRange.head));
  }
  return {text: text, ranges: ranges}
}

function disableBrowserMagic(field, spellcheck) {
  field.setAttribute("autocorrect", "off");
  field.setAttribute("autocapitalize", "off");
  field.setAttribute("spellcheck", !!spellcheck);
}

function hiddenTextarea() {
  var te = elt("textarea", null, null, "position: absolute; bottom: -1em; padding: 0; width: 1px; height: 1em; outline: none");
  var div = elt("div", [te], null, "overflow: hidden; position: relative; width: 3px; height: 0px;");
  // The textarea is kept positioned near the cursor to prevent the
  // fact that it'll be scrolled into view on input from scrolling
  // our fake cursor out of view. On webkit, when wrap=off, paste is
  // very slow. So make the area wide instead.
  if (webkit) { te.style.width = "1000px"; }
  else { te.setAttribute("wrap", "off"); }
  // If border: 0; -- iOS fails to open keyboard (issue #1287)
  if (ios) { te.style.border = "1px solid black"; }
  disableBrowserMagic(te);
  return div
}

// The publicly visible API. Note that methodOp(f) means
// 'wrap f in an operation, performed on its `this` parameter'.

// This is not the complete set of editor methods. Most of the
// methods defined on the Doc type are also injected into
// CodeMirror.prototype, for backwards compatibility and
// convenience.

var addEditorMethods = function(CodeMirror) {
  var optionHandlers = CodeMirror.optionHandlers;

  var helpers = CodeMirror.helpers = {};

  CodeMirror.prototype = {
    constructor: CodeMirror,
    focus: function(){window.focus(); this.display.input.focus();},

    setOption: function(option, value) {
      var options = this.options, old = options[option];
      if (options[option] == value && option != "mode") { return }
      options[option] = value;
      if (optionHandlers.hasOwnProperty(option))
        { operation(this, optionHandlers[option])(this, value, old); }
      signal(this, "optionChange", this, option);
    },

    getOption: function(option) {return this.options[option]},
    getDoc: function() {return this.doc},

    addKeyMap: function(map$$1, bottom) {
      this.state.keyMaps[bottom ? "push" : "unshift"](getKeyMap(map$$1));
    },
    removeKeyMap: function(map$$1) {
      var maps = this.state.keyMaps;
      for (var i = 0; i < maps.length; ++i)
        { if (maps[i] == map$$1 || maps[i].name == map$$1) {
          maps.splice(i, 1);
          return true
        } }
    },

    addOverlay: methodOp(function(spec, options) {
      var mode = spec.token ? spec : CodeMirror.getMode(this.options, spec);
      if (mode.startState) { throw new Error("Overlays may not be stateful.") }
      insertSorted(this.state.overlays,
                   {mode: mode, modeSpec: spec, opaque: options && options.opaque,
                    priority: (options && options.priority) || 0},
                   function (overlay) { return overlay.priority; });
      this.state.modeGen++;
      regChange(this);
    }),
    removeOverlay: methodOp(function(spec) {
      var this$1 = this;

      var overlays = this.state.overlays;
      for (var i = 0; i < overlays.length; ++i) {
        var cur = overlays[i].modeSpec;
        if (cur == spec || typeof spec == "string" && cur.name == spec) {
          overlays.splice(i, 1);
          this$1.state.modeGen++;
          regChange(this$1);
          return
        }
      }
    }),

    indentLine: methodOp(function(n, dir, aggressive) {
      if (typeof dir != "string" && typeof dir != "number") {
        if (dir == null) { dir = this.options.smartIndent ? "smart" : "prev"; }
        else { dir = dir ? "add" : "subtract"; }
      }
      if (isLine(this.doc, n)) { indentLine(this, n, dir, aggressive); }
    }),
    indentSelection: methodOp(function(how) {
      var this$1 = this;

      var ranges = this.doc.sel.ranges, end = -1;
      for (var i = 0; i < ranges.length; i++) {
        var range$$1 = ranges[i];
        if (!range$$1.empty()) {
          var from = range$$1.from(), to = range$$1.to();
          var start = Math.max(end, from.line);
          end = Math.min(this$1.lastLine(), to.line - (to.ch ? 0 : 1)) + 1;
          for (var j = start; j < end; ++j)
            { indentLine(this$1, j, how); }
          var newRanges = this$1.doc.sel.ranges;
          if (from.ch == 0 && ranges.length == newRanges.length && newRanges[i].from().ch > 0)
            { replaceOneSelection(this$1.doc, i, new Range(from, newRanges[i].to()), sel_dontScroll); }
        } else if (range$$1.head.line > end) {
          indentLine(this$1, range$$1.head.line, how, true);
          end = range$$1.head.line;
          if (i == this$1.doc.sel.primIndex) { ensureCursorVisible(this$1); }
        }
      }
    }),

    // Fetch the parser token for a given character. Useful for hacks
    // that want to inspect the mode state (say, for completion).
    getTokenAt: function(pos, precise) {
      return takeToken(this, pos, precise)
    },

    getLineTokens: function(line, precise) {
      return takeToken(this, Pos(line), precise, true)
    },

    getTokenTypeAt: function(pos) {
      pos = clipPos(this.doc, pos);
      var styles = getLineStyles(this, getLine(this.doc, pos.line));
      var before = 0, after = (styles.length - 1) / 2, ch = pos.ch;
      var type;
      if (ch == 0) { type = styles[2]; }
      else { for (;;) {
        var mid = (before + after) >> 1;
        if ((mid ? styles[mid * 2 - 1] : 0) >= ch) { after = mid; }
        else if (styles[mid * 2 + 1] < ch) { before = mid + 1; }
        else { type = styles[mid * 2 + 2]; break }
      } }
      var cut = type ? type.indexOf("overlay ") : -1;
      return cut < 0 ? type : cut == 0 ? null : type.slice(0, cut - 1)
    },

    getModeAt: function(pos) {
      var mode = this.doc.mode;
      if (!mode.innerMode) { return mode }
      return CodeMirror.innerMode(mode, this.getTokenAt(pos).state).mode
    },

    getHelper: function(pos, type) {
      return this.getHelpers(pos, type)[0]
    },

    getHelpers: function(pos, type) {
      var this$1 = this;

      var found = [];
      if (!helpers.hasOwnProperty(type)) { return found }
      var help = helpers[type], mode = this.getModeAt(pos);
      if (typeof mode[type] == "string") {
        if (help[mode[type]]) { found.push(help[mode[type]]); }
      } else if (mode[type]) {
        for (var i = 0; i < mode[type].length; i++) {
          var val = help[mode[type][i]];
          if (val) { found.push(val); }
        }
      } else if (mode.helperType && help[mode.helperType]) {
        found.push(help[mode.helperType]);
      } else if (help[mode.name]) {
        found.push(help[mode.name]);
      }
      for (var i$1 = 0; i$1 < help._global.length; i$1++) {
        var cur = help._global[i$1];
        if (cur.pred(mode, this$1) && indexOf(found, cur.val) == -1)
          { found.push(cur.val); }
      }
      return found
    },

    getStateAfter: function(line, precise) {
      var doc = this.doc;
      line = clipLine(doc, line == null ? doc.first + doc.size - 1: line);
      return getContextBefore(this, line + 1, precise).state
    },

    cursorCoords: function(start, mode) {
      var pos, range$$1 = this.doc.sel.primary();
      if (start == null) { pos = range$$1.head; }
      else if (typeof start == "object") { pos = clipPos(this.doc, start); }
      else { pos = start ? range$$1.from() : range$$1.to(); }
      return cursorCoords(this, pos, mode || "page")
    },

    charCoords: function(pos, mode) {
      return charCoords(this, clipPos(this.doc, pos), mode || "page")
    },

    coordsChar: function(coords, mode) {
      coords = fromCoordSystem(this, coords, mode || "page");
      return coordsChar(this, coords.left, coords.top)
    },

    lineAtHeight: function(height, mode) {
      height = fromCoordSystem(this, {top: height, left: 0}, mode || "page").top;
      return lineAtHeight(this.doc, height + this.display.viewOffset)
    },
    heightAtLine: function(line, mode, includeWidgets) {
      var end = false, lineObj;
      if (typeof line == "number") {
        var last = this.doc.first + this.doc.size - 1;
        if (line < this.doc.first) { line = this.doc.first; }
        else if (line > last) { line = last; end = true; }
        lineObj = getLine(this.doc, line);
      } else {
        lineObj = line;
      }
      return intoCoordSystem(this, lineObj, {top: 0, left: 0}, mode || "page", includeWidgets || end).top +
        (end ? this.doc.height - heightAtLine(lineObj) : 0)
    },

    defaultTextHeight: function() { return textHeight(this.display) },
    defaultCharWidth: function() { return charWidth(this.display) },

    getViewport: function() { return {from: this.display.viewFrom, to: this.display.viewTo}},

    addWidget: function(pos, node, scroll, vert, horiz) {
      var display = this.display;
      pos = cursorCoords(this, clipPos(this.doc, pos));
      var top = pos.bottom, left = pos.left;
      node.style.position = "absolute";
      node.setAttribute("cm-ignore-events", "true");
      this.display.input.setUneditable(node);
      display.sizer.appendChild(node);
      if (vert == "over") {
        top = pos.top;
      } else if (vert == "above" || vert == "near") {
        var vspace = Math.max(display.wrapper.clientHeight, this.doc.height),
        hspace = Math.max(display.sizer.clientWidth, display.lineSpace.clientWidth);
        // Default to positioning above (if specified and possible); otherwise default to positioning below
        if ((vert == 'above' || pos.bottom + node.offsetHeight > vspace) && pos.top > node.offsetHeight)
          { top = pos.top - node.offsetHeight; }
        else if (pos.bottom + node.offsetHeight <= vspace)
          { top = pos.bottom; }
        if (left + node.offsetWidth > hspace)
          { left = hspace - node.offsetWidth; }
      }
      node.style.top = top + "px";
      node.style.left = node.style.right = "";
      if (horiz == "right") {
        left = display.sizer.clientWidth - node.offsetWidth;
        node.style.right = "0px";
      } else {
        if (horiz == "left") { left = 0; }
        else if (horiz == "middle") { left = (display.sizer.clientWidth - node.offsetWidth) / 2; }
        node.style.left = left + "px";
      }
      if (scroll)
        { scrollIntoView(this, {left: left, top: top, right: left + node.offsetWidth, bottom: top + node.offsetHeight}); }
    },

    triggerOnKeyDown: methodOp(onKeyDown),
    triggerOnKeyPress: methodOp(onKeyPress),
    triggerOnKeyUp: onKeyUp,
    triggerOnMouseDown: methodOp(onMouseDown),

    execCommand: function(cmd) {
      if (commands.hasOwnProperty(cmd))
        { return commands[cmd].call(null, this) }
    },

    triggerElectric: methodOp(function(text) { triggerElectric(this, text); }),

    findPosH: function(from, amount, unit, visually) {
      var this$1 = this;

      var dir = 1;
      if (amount < 0) { dir = -1; amount = -amount; }
      var cur = clipPos(this.doc, from);
      for (var i = 0; i < amount; ++i) {
        cur = findPosH(this$1.doc, cur, dir, unit, visually);
        if (cur.hitSide) { break }
      }
      return cur
    },

    moveH: methodOp(function(dir, unit) {
      var this$1 = this;

      this.extendSelectionsBy(function (range$$1) {
        if (this$1.display.shift || this$1.doc.extend || range$$1.empty())
          { return findPosH(this$1.doc, range$$1.head, dir, unit, this$1.options.rtlMoveVisually) }
        else
          { return dir < 0 ? range$$1.from() : range$$1.to() }
      }, sel_move);
    }),

    deleteH: methodOp(function(dir, unit) {
      var sel = this.doc.sel, doc = this.doc;
      if (sel.somethingSelected())
        { doc.replaceSelection("", null, "+delete"); }
      else
        { deleteNearSelection(this, function (range$$1) {
          var other = findPosH(doc, range$$1.head, dir, unit, false);
          return dir < 0 ? {from: other, to: range$$1.head} : {from: range$$1.head, to: other}
        }); }
    }),

    findPosV: function(from, amount, unit, goalColumn) {
      var this$1 = this;

      var dir = 1, x = goalColumn;
      if (amount < 0) { dir = -1; amount = -amount; }
      var cur = clipPos(this.doc, from);
      for (var i = 0; i < amount; ++i) {
        var coords = cursorCoords(this$1, cur, "div");
        if (x == null) { x = coords.left; }
        else { coords.left = x; }
        cur = findPosV(this$1, coords, dir, unit);
        if (cur.hitSide) { break }
      }
      return cur
    },

    moveV: methodOp(function(dir, unit) {
      var this$1 = this;

      var doc = this.doc, goals = [];
      var collapse = !this.display.shift && !doc.extend && doc.sel.somethingSelected();
      doc.extendSelectionsBy(function (range$$1) {
        if (collapse)
          { return dir < 0 ? range$$1.from() : range$$1.to() }
        var headPos = cursorCoords(this$1, range$$1.head, "div");
        if (range$$1.goalColumn != null) { headPos.left = range$$1.goalColumn; }
        goals.push(headPos.left);
        var pos = findPosV(this$1, headPos, dir, unit);
        if (unit == "page" && range$$1 == doc.sel.primary())
          { addToScrollTop(this$1, charCoords(this$1, pos, "div").top - headPos.top); }
        return pos
      }, sel_move);
      if (goals.length) { for (var i = 0; i < doc.sel.ranges.length; i++)
        { doc.sel.ranges[i].goalColumn = goals[i]; } }
    }),

    // Find the word at the given position (as returned by coordsChar).
    findWordAt: function(pos) {
      var doc = this.doc, line = getLine(doc, pos.line).text;
      var start = pos.ch, end = pos.ch;
      if (line) {
        var helper = this.getHelper(pos, "wordChars");
        if ((pos.sticky == "before" || end == line.length) && start) { --start; } else { ++end; }
        var startChar = line.charAt(start);
        var check = isWordChar(startChar, helper)
          ? function (ch) { return isWordChar(ch, helper); }
          : /\s/.test(startChar) ? function (ch) { return /\s/.test(ch); }
          : function (ch) { return (!/\s/.test(ch) && !isWordChar(ch)); };
        while (start > 0 && check(line.charAt(start - 1))) { --start; }
        while (end < line.length && check(line.charAt(end))) { ++end; }
      }
      return new Range(Pos(pos.line, start), Pos(pos.line, end))
    },

    toggleOverwrite: function(value) {
      if (value != null && value == this.state.overwrite) { return }
      if (this.state.overwrite = !this.state.overwrite)
        { addClass(this.display.cursorDiv, "CodeMirror-overwrite"); }
      else
        { rmClass(this.display.cursorDiv, "CodeMirror-overwrite"); }

      signal(this, "overwriteToggle", this, this.state.overwrite);
    },
    hasFocus: function() { return this.display.input.getField() == activeElt() },
    isReadOnly: function() { return !!(this.options.readOnly || this.doc.cantEdit) },

    scrollTo: methodOp(function (x, y) { scrollToCoords(this, x, y); }),
    getScrollInfo: function() {
      var scroller = this.display.scroller;
      return {left: scroller.scrollLeft, top: scroller.scrollTop,
              height: scroller.scrollHeight - scrollGap(this) - this.display.barHeight,
              width: scroller.scrollWidth - scrollGap(this) - this.display.barWidth,
              clientHeight: displayHeight(this), clientWidth: displayWidth(this)}
    },

    scrollIntoView: methodOp(function(range$$1, margin) {
      if (range$$1 == null) {
        range$$1 = {from: this.doc.sel.primary().head, to: null};
        if (margin == null) { margin = this.options.cursorScrollMargin; }
      } else if (typeof range$$1 == "number") {
        range$$1 = {from: Pos(range$$1, 0), to: null};
      } else if (range$$1.from == null) {
        range$$1 = {from: range$$1, to: null};
      }
      if (!range$$1.to) { range$$1.to = range$$1.from; }
      range$$1.margin = margin || 0;

      if (range$$1.from.line != null) {
        scrollToRange(this, range$$1);
      } else {
        scrollToCoordsRange(this, range$$1.from, range$$1.to, range$$1.margin);
      }
    }),

    setSize: methodOp(function(width, height) {
      var this$1 = this;

      var interpret = function (val) { return typeof val == "number" || /^\d+$/.test(String(val)) ? val + "px" : val; };
      if (width != null) { this.display.wrapper.style.width = interpret(width); }
      if (height != null) { this.display.wrapper.style.height = interpret(height); }
      if (this.options.lineWrapping) { clearLineMeasurementCache(this); }
      var lineNo$$1 = this.display.viewFrom;
      this.doc.iter(lineNo$$1, this.display.viewTo, function (line) {
        if (line.widgets) { for (var i = 0; i < line.widgets.length; i++)
          { if (line.widgets[i].noHScroll) { regLineChange(this$1, lineNo$$1, "widget"); break } } }
        ++lineNo$$1;
      });
      this.curOp.forceUpdate = true;
      signal(this, "refresh", this);
    }),

    operation: function(f){return runInOp(this, f)},
    startOperation: function(){return startOperation(this)},
    endOperation: function(){return endOperation(this)},

    refresh: methodOp(function() {
      var oldHeight = this.display.cachedTextHeight;
      regChange(this);
      this.curOp.forceUpdate = true;
      clearCaches(this);
      scrollToCoords(this, this.doc.scrollLeft, this.doc.scrollTop);
      updateGutterSpace(this);
      if (oldHeight == null || Math.abs(oldHeight - textHeight(this.display)) > .5)
        { estimateLineHeights(this); }
      signal(this, "refresh", this);
    }),

    swapDoc: methodOp(function(doc) {
      var old = this.doc;
      old.cm = null;
      attachDoc(this, doc);
      clearCaches(this);
      this.display.input.reset();
      scrollToCoords(this, doc.scrollLeft, doc.scrollTop);
      this.curOp.forceScroll = true;
      signalLater(this, "swapDoc", this, old);
      return old
    }),

    getInputField: function(){return this.display.input.getField()},
    getWrapperElement: function(){return this.display.wrapper},
    getScrollerElement: function(){return this.display.scroller},
    getGutterElement: function(){return this.display.gutters}
  };
  eventMixin(CodeMirror);

  CodeMirror.registerHelper = function(type, name, value) {
    if (!helpers.hasOwnProperty(type)) { helpers[type] = CodeMirror[type] = {_global: []}; }
    helpers[type][name] = value;
  };
  CodeMirror.registerGlobalHelper = function(type, name, predicate, value) {
    CodeMirror.registerHelper(type, name, value);
    helpers[type]._global.push({pred: predicate, val: value});
  };
};

// Used for horizontal relative motion. Dir is -1 or 1 (left or
// right), unit can be "char", "column" (like char, but doesn't
// cross line boundaries), "word" (across next word), or "group" (to
// the start of next group of word or non-word-non-whitespace
// chars). The visually param controls whether, in right-to-left
// text, direction 1 means to move towards the next index in the
// string, or towards the character to the right of the current
// position. The resulting position will have a hitSide=true
// property if it reached the end of the document.
function findPosH(doc, pos, dir, unit, visually) {
  var oldPos = pos;
  var origDir = dir;
  var lineObj = getLine(doc, pos.line);
  function findNextLine() {
    var l = pos.line + dir;
    if (l < doc.first || l >= doc.first + doc.size) { return false }
    pos = new Pos(l, pos.ch, pos.sticky);
    return lineObj = getLine(doc, l)
  }
  function moveOnce(boundToLine) {
    var next;
    if (visually) {
      next = moveVisually(doc.cm, lineObj, pos, dir);
    } else {
      next = moveLogically(lineObj, pos, dir);
    }
    if (next == null) {
      if (!boundToLine && findNextLine())
        { pos = endOfLine(visually, doc.cm, lineObj, pos.line, dir); }
      else
        { return false }
    } else {
      pos = next;
    }
    return true
  }

  if (unit == "char") {
    moveOnce();
  } else if (unit == "column") {
    moveOnce(true);
  } else if (unit == "word" || unit == "group") {
    var sawType = null, group = unit == "group";
    var helper = doc.cm && doc.cm.getHelper(pos, "wordChars");
    for (var first = true;; first = false) {
      if (dir < 0 && !moveOnce(!first)) { break }
      var cur = lineObj.text.charAt(pos.ch) || "\n";
      var type = isWordChar(cur, helper) ? "w"
        : group && cur == "\n" ? "n"
        : !group || /\s/.test(cur) ? null
        : "p";
      if (group && !first && !type) { type = "s"; }
      if (sawType && sawType != type) {
        if (dir < 0) {dir = 1; moveOnce(); pos.sticky = "after";}
        break
      }

      if (type) { sawType = type; }
      if (dir > 0 && !moveOnce(!first)) { break }
    }
  }
  var result = skipAtomic(doc, pos, oldPos, origDir, true);
  if (equalCursorPos(oldPos, result)) { result.hitSide = true; }
  return result
}

// For relative vertical movement. Dir may be -1 or 1. Unit can be
// "page" or "line". The resulting position will have a hitSide=true
// property if it reached the end of the document.
function findPosV(cm, pos, dir, unit) {
  var doc = cm.doc, x = pos.left, y;
  if (unit == "page") {
    var pageSize = Math.min(cm.display.wrapper.clientHeight, window.innerHeight || document.documentElement.clientHeight);
    var moveAmount = Math.max(pageSize - .5 * textHeight(cm.display), 3);
    y = (dir > 0 ? pos.bottom : pos.top) + dir * moveAmount;

  } else if (unit == "line") {
    y = dir > 0 ? pos.bottom + 3 : pos.top - 3;
  }
  var target;
  for (;;) {
    target = coordsChar(cm, x, y);
    if (!target.outside) { break }
    if (dir < 0 ? y <= 0 : y >= doc.height) { target.hitSide = true; break }
    y += dir * 5;
  }
  return target
}

// CONTENTEDITABLE INPUT STYLE

var ContentEditableInput = function(cm) {
  this.cm = cm;
  this.lastAnchorNode = this.lastAnchorOffset = this.lastFocusNode = this.lastFocusOffset = null;
  this.polling = new Delayed();
  this.composing = null;
  this.gracePeriod = false;
  this.readDOMTimeout = null;
};

ContentEditableInput.prototype.init = function (display) {
    var this$1 = this;

  var input = this, cm = input.cm;
  var div = input.div = display.lineDiv;
  disableBrowserMagic(div, cm.options.spellcheck);

  on(div, "paste", function (e) {
    if (signalDOMEvent(cm, e) || handlePaste(e, cm)) { return }
    // IE doesn't fire input events, so we schedule a read for the pasted content in this way
    if (ie_version <= 11) { setTimeout(operation(cm, function () { return this$1.updateFromDOM(); }), 20); }
  });

  on(div, "compositionstart", function (e) {
    this$1.composing = {data: e.data, done: false};
  });
  on(div, "compositionupdate", function (e) {
    if (!this$1.composing) { this$1.composing = {data: e.data, done: false}; }
  });
  on(div, "compositionend", function (e) {
    if (this$1.composing) {
      if (e.data != this$1.composing.data) { this$1.readFromDOMSoon(); }
      this$1.composing.done = true;
    }
  });

  on(div, "touchstart", function () { return input.forceCompositionEnd(); });

  on(div, "input", function () {
    if (!this$1.composing) { this$1.readFromDOMSoon(); }
  });

  function onCopyCut(e) {
    if (signalDOMEvent(cm, e)) { return }
    if (cm.somethingSelected()) {
      setLastCopied({lineWise: false, text: cm.getSelections()});
      if (e.type == "cut") { cm.replaceSelection("", null, "cut"); }
    } else if (!cm.options.lineWiseCopyCut) {
      return
    } else {
      var ranges = copyableRanges(cm);
      setLastCopied({lineWise: true, text: ranges.text});
      if (e.type == "cut") {
        cm.operation(function () {
          cm.setSelections(ranges.ranges, 0, sel_dontScroll);
          cm.replaceSelection("", null, "cut");
        });
      }
    }
    if (e.clipboardData) {
      e.clipboardData.clearData();
      var content = lastCopied.text.join("\n");
      // iOS exposes the clipboard API, but seems to discard content inserted into it
      e.clipboardData.setData("Text", content);
      if (e.clipboardData.getData("Text") == content) {
        e.preventDefault();
        return
      }
    }
    // Old-fashioned briefly-focus-a-textarea hack
    var kludge = hiddenTextarea(), te = kludge.firstChild;
    cm.display.lineSpace.insertBefore(kludge, cm.display.lineSpace.firstChild);
    te.value = lastCopied.text.join("\n");
    var hadFocus = document.activeElement;
    selectInput(te);
    setTimeout(function () {
      cm.display.lineSpace.removeChild(kludge);
      hadFocus.focus();
      if (hadFocus == div) { input.showPrimarySelection(); }
    }, 50);
  }
  on(div, "copy", onCopyCut);
  on(div, "cut", onCopyCut);
};

ContentEditableInput.prototype.prepareSelection = function () {
  var result = prepareSelection(this.cm, false);
  result.focus = this.cm.state.focused;
  return result
};

ContentEditableInput.prototype.showSelection = function (info, takeFocus) {
  if (!info || !this.cm.display.view.length) { return }
  if (info.focus || takeFocus) { this.showPrimarySelection(); }
  this.showMultipleSelections(info);
};

ContentEditableInput.prototype.getSelection = function () {
  return this.cm.display.wrapper.ownerDocument.getSelection()
};

ContentEditableInput.prototype.showPrimarySelection = function () {
  var sel = this.getSelection(), cm = this.cm, prim = cm.doc.sel.primary();
  var from = prim.from(), to = prim.to();

  if (cm.display.viewTo == cm.display.viewFrom || from.line >= cm.display.viewTo || to.line < cm.display.viewFrom) {
    sel.removeAllRanges();
    return
  }

  var curAnchor = domToPos(cm, sel.anchorNode, sel.anchorOffset);
  var curFocus = domToPos(cm, sel.focusNode, sel.focusOffset);
  if (curAnchor && !curAnchor.bad && curFocus && !curFocus.bad &&
      cmp(minPos(curAnchor, curFocus), from) == 0 &&
      cmp(maxPos(curAnchor, curFocus), to) == 0)
    { return }

  var view = cm.display.view;
  var start = (from.line >= cm.display.viewFrom && posToDOM(cm, from)) ||
      {node: view[0].measure.map[2], offset: 0};
  var end = to.line < cm.display.viewTo && posToDOM(cm, to);
  if (!end) {
    var measure = view[view.length - 1].measure;
    var map$$1 = measure.maps ? measure.maps[measure.maps.length - 1] : measure.map;
    end = {node: map$$1[map$$1.length - 1], offset: map$$1[map$$1.length - 2] - map$$1[map$$1.length - 3]};
  }

  if (!start || !end) {
    sel.removeAllRanges();
    return
  }

  var old = sel.rangeCount && sel.getRangeAt(0), rng;
  try { rng = range(start.node, start.offset, end.offset, end.node); }
  catch(e) {} // Our model of the DOM might be outdated, in which case the range we try to set can be impossible
  if (rng) {
    if (!gecko && cm.state.focused) {
      sel.collapse(start.node, start.offset);
      if (!rng.collapsed) {
        sel.removeAllRanges();
        sel.addRange(rng);
      }
    } else {
      sel.removeAllRanges();
      sel.addRange(rng);
    }
    if (old && sel.anchorNode == null) { sel.addRange(old); }
    else if (gecko) { this.startGracePeriod(); }
  }
  this.rememberSelection();
};

ContentEditableInput.prototype.startGracePeriod = function () {
    var this$1 = this;

  clearTimeout(this.gracePeriod);
  this.gracePeriod = setTimeout(function () {
    this$1.gracePeriod = false;
    if (this$1.selectionChanged())
      { this$1.cm.operation(function () { return this$1.cm.curOp.selectionChanged = true; }); }
  }, 20);
};

ContentEditableInput.prototype.showMultipleSelections = function (info) {
  removeChildrenAndAdd(this.cm.display.cursorDiv, info.cursors);
  removeChildrenAndAdd(this.cm.display.selectionDiv, info.selection);
};

ContentEditableInput.prototype.rememberSelection = function () {
  var sel = this.getSelection();
  this.lastAnchorNode = sel.anchorNode; this.lastAnchorOffset = sel.anchorOffset;
  this.lastFocusNode = sel.focusNode; this.lastFocusOffset = sel.focusOffset;
};

ContentEditableInput.prototype.selectionInEditor = function () {
  var sel = this.getSelection();
  if (!sel.rangeCount) { return false }
  var node = sel.getRangeAt(0).commonAncestorContainer;
  return contains(this.div, node)
};

ContentEditableInput.prototype.focus = function () {
  if (this.cm.options.readOnly != "nocursor") {
    if (!this.selectionInEditor())
      { this.showSelection(this.prepareSelection(), true); }
    this.div.focus();
  }
};
ContentEditableInput.prototype.blur = function () { this.div.blur(); };
ContentEditableInput.prototype.getField = function () { return this.div };

ContentEditableInput.prototype.supportsTouch = function () { return true };

ContentEditableInput.prototype.receivedFocus = function () {
  var input = this;
  if (this.selectionInEditor())
    { this.pollSelection(); }
  else
    { runInOp(this.cm, function () { return input.cm.curOp.selectionChanged = true; }); }

  function poll() {
    if (input.cm.state.focused) {
      input.pollSelection();
      input.polling.set(input.cm.options.pollInterval, poll);
    }
  }
  this.polling.set(this.cm.options.pollInterval, poll);
};

ContentEditableInput.prototype.selectionChanged = function () {
  var sel = this.getSelection();
  return sel.anchorNode != this.lastAnchorNode || sel.anchorOffset != this.lastAnchorOffset ||
    sel.focusNode != this.lastFocusNode || sel.focusOffset != this.lastFocusOffset
};

ContentEditableInput.prototype.pollSelection = function () {
  if (this.readDOMTimeout != null || this.gracePeriod || !this.selectionChanged()) { return }
  var sel = this.getSelection(), cm = this.cm;
  // On Android Chrome (version 56, at least), backspacing into an
  // uneditable block element will put the cursor in that element,
  // and then, because it's not editable, hide the virtual keyboard.
  // Because Android doesn't allow us to actually detect backspace
  // presses in a sane way, this code checks for when that happens
  // and simulates a backspace press in this case.
  if (android && chrome && this.cm.options.gutters.length && isInGutter(sel.anchorNode)) {
    this.cm.triggerOnKeyDown({type: "keydown", keyCode: 8, preventDefault: Math.abs});
    this.blur();
    this.focus();
    return
  }
  if (this.composing) { return }
  this.rememberSelection();
  var anchor = domToPos(cm, sel.anchorNode, sel.anchorOffset);
  var head = domToPos(cm, sel.focusNode, sel.focusOffset);
  if (anchor && head) { runInOp(cm, function () {
    setSelection(cm.doc, simpleSelection(anchor, head), sel_dontScroll);
    if (anchor.bad || head.bad) { cm.curOp.selectionChanged = true; }
  }); }
};

ContentEditableInput.prototype.pollContent = function () {
  if (this.readDOMTimeout != null) {
    clearTimeout(this.readDOMTimeout);
    this.readDOMTimeout = null;
  }

  var cm = this.cm, display = cm.display, sel = cm.doc.sel.primary();
  var from = sel.from(), to = sel.to();
  if (from.ch == 0 && from.line > cm.firstLine())
    { from = Pos(from.line - 1, getLine(cm.doc, from.line - 1).length); }
  if (to.ch == getLine(cm.doc, to.line).text.length && to.line < cm.lastLine())
    { to = Pos(to.line + 1, 0); }
  if (from.line < display.viewFrom || to.line > display.viewTo - 1) { return false }

  var fromIndex, fromLine, fromNode;
  if (from.line == display.viewFrom || (fromIndex = findViewIndex(cm, from.line)) == 0) {
    fromLine = lineNo(display.view[0].line);
    fromNode = display.view[0].node;
  } else {
    fromLine = lineNo(display.view[fromIndex].line);
    fromNode = display.view[fromIndex - 1].node.nextSibling;
  }
  var toIndex = findViewIndex(cm, to.line);
  var toLine, toNode;
  if (toIndex == display.view.length - 1) {
    toLine = display.viewTo - 1;
    toNode = display.lineDiv.lastChild;
  } else {
    toLine = lineNo(display.view[toIndex + 1].line) - 1;
    toNode = display.view[toIndex + 1].node.previousSibling;
  }

  if (!fromNode) { return false }
  var newText = cm.doc.splitLines(domTextBetween(cm, fromNode, toNode, fromLine, toLine));
  var oldText = getBetween(cm.doc, Pos(fromLine, 0), Pos(toLine, getLine(cm.doc, toLine).text.length));
  while (newText.length > 1 && oldText.length > 1) {
    if (lst(newText) == lst(oldText)) { newText.pop(); oldText.pop(); toLine--; }
    else if (newText[0] == oldText[0]) { newText.shift(); oldText.shift(); fromLine++; }
    else { break }
  }

  var cutFront = 0, cutEnd = 0;
  var newTop = newText[0], oldTop = oldText[0], maxCutFront = Math.min(newTop.length, oldTop.length);
  while (cutFront < maxCutFront && newTop.charCodeAt(cutFront) == oldTop.charCodeAt(cutFront))
    { ++cutFront; }
  var newBot = lst(newText), oldBot = lst(oldText);
  var maxCutEnd = Math.min(newBot.length - (newText.length == 1 ? cutFront : 0),
                           oldBot.length - (oldText.length == 1 ? cutFront : 0));
  while (cutEnd < maxCutEnd &&
         newBot.charCodeAt(newBot.length - cutEnd - 1) == oldBot.charCodeAt(oldBot.length - cutEnd - 1))
    { ++cutEnd; }
  // Try to move start of change to start of selection if ambiguous
  if (newText.length == 1 && oldText.length == 1 && fromLine == from.line) {
    while (cutFront && cutFront > from.ch &&
           newBot.charCodeAt(newBot.length - cutEnd - 1) == oldBot.charCodeAt(oldBot.length - cutEnd - 1)) {
      cutFront--;
      cutEnd++;
    }
  }

  newText[newText.length - 1] = newBot.slice(0, newBot.length - cutEnd).replace(/^\u200b+/, "");
  newText[0] = newText[0].slice(cutFront).replace(/\u200b+$/, "");

  var chFrom = Pos(fromLine, cutFront);
  var chTo = Pos(toLine, oldText.length ? lst(oldText).length - cutEnd : 0);
  if (newText.length > 1 || newText[0] || cmp(chFrom, chTo)) {
    replaceRange(cm.doc, newText, chFrom, chTo, "+input");
    return true
  }
};

ContentEditableInput.prototype.ensurePolled = function () {
  this.forceCompositionEnd();
};
ContentEditableInput.prototype.reset = function () {
  this.forceCompositionEnd();
};
ContentEditableInput.prototype.forceCompositionEnd = function () {
  if (!this.composing) { return }
  clearTimeout(this.readDOMTimeout);
  this.composing = null;
  this.updateFromDOM();
  this.div.blur();
  this.div.focus();
};
ContentEditableInput.prototype.readFromDOMSoon = function () {
    var this$1 = this;

  if (this.readDOMTimeout != null) { return }
  this.readDOMTimeout = setTimeout(function () {
    this$1.readDOMTimeout = null;
    if (this$1.composing) {
      if (this$1.composing.done) { this$1.composing = null; }
      else { return }
    }
    this$1.updateFromDOM();
  }, 80);
};

ContentEditableInput.prototype.updateFromDOM = function () {
    var this$1 = this;

  if (this.cm.isReadOnly() || !this.pollContent())
    { runInOp(this.cm, function () { return regChange(this$1.cm); }); }
};

ContentEditableInput.prototype.setUneditable = function (node) {
  node.contentEditable = "false";
};

ContentEditableInput.prototype.onKeyPress = function (e) {
  if (e.charCode == 0 || this.composing) { return }
  e.preventDefault();
  if (!this.cm.isReadOnly())
    { operation(this.cm, applyTextInput)(this.cm, String.fromCharCode(e.charCode == null ? e.keyCode : e.charCode), 0); }
};

ContentEditableInput.prototype.readOnlyChanged = function (val) {
  this.div.contentEditable = String(val != "nocursor");
};

ContentEditableInput.prototype.onContextMenu = function () {};
ContentEditableInput.prototype.resetPosition = function () {};

ContentEditableInput.prototype.needsContentAttribute = true;

function posToDOM(cm, pos) {
  var view = findViewForLine(cm, pos.line);
  if (!view || view.hidden) { return null }
  var line = getLine(cm.doc, pos.line);
  var info = mapFromLineView(view, line, pos.line);

  var order = getOrder(line, cm.doc.direction), side = "left";
  if (order) {
    var partPos = getBidiPartAt(order, pos.ch);
    side = partPos % 2 ? "right" : "left";
  }
  var result = nodeAndOffsetInLineMap(info.map, pos.ch, side);
  result.offset = result.collapse == "right" ? result.end : result.start;
  return result
}

function isInGutter(node) {
  for (var scan = node; scan; scan = scan.parentNode)
    { if (/CodeMirror-gutter-wrapper/.test(scan.className)) { return true } }
  return false
}

function badPos(pos, bad) { if (bad) { pos.bad = true; } return pos }

function domTextBetween(cm, from, to, fromLine, toLine) {
  var text = "", closing = false, lineSep = cm.doc.lineSeparator(), extraLinebreak = false;
  function recognizeMarker(id) { return function (marker) { return marker.id == id; } }
  function close() {
    if (closing) {
      text += lineSep;
      if (extraLinebreak) { text += lineSep; }
      closing = extraLinebreak = false;
    }
  }
  function addText(str) {
    if (str) {
      close();
      text += str;
    }
  }
  function walk(node) {
    if (node.nodeType == 1) {
      var cmText = node.getAttribute("cm-text");
      if (cmText) {
        addText(cmText);
        return
      }
      var markerID = node.getAttribute("cm-marker"), range$$1;
      if (markerID) {
        var found = cm.findMarks(Pos(fromLine, 0), Pos(toLine + 1, 0), recognizeMarker(+markerID));
        if (found.length && (range$$1 = found[0].find(0)))
          { addText(getBetween(cm.doc, range$$1.from, range$$1.to).join(lineSep)); }
        return
      }
      if (node.getAttribute("contenteditable") == "false") { return }
      var isBlock = /^(pre|div|p|li|table|br)$/i.test(node.nodeName);
      if (!/^br$/i.test(node.nodeName) && node.textContent.length == 0) { return }

      if (isBlock) { close(); }
      for (var i = 0; i < node.childNodes.length; i++)
        { walk(node.childNodes[i]); }

      if (/^(pre|p)$/i.test(node.nodeName)) { extraLinebreak = true; }
      if (isBlock) { closing = true; }
    } else if (node.nodeType == 3) {
      addText(node.nodeValue.replace(/\u200b/g, "").replace(/\u00a0/g, " "));
    }
  }
  for (;;) {
    walk(from);
    if (from == to) { break }
    from = from.nextSibling;
    extraLinebreak = false;
  }
  return text
}

function domToPos(cm, node, offset) {
  var lineNode;
  if (node == cm.display.lineDiv) {
    lineNode = cm.display.lineDiv.childNodes[offset];
    if (!lineNode) { return badPos(cm.clipPos(Pos(cm.display.viewTo - 1)), true) }
    node = null; offset = 0;
  } else {
    for (lineNode = node;; lineNode = lineNode.parentNode) {
      if (!lineNode || lineNode == cm.display.lineDiv) { return null }
      if (lineNode.parentNode && lineNode.parentNode == cm.display.lineDiv) { break }
    }
  }
  for (var i = 0; i < cm.display.view.length; i++) {
    var lineView = cm.display.view[i];
    if (lineView.node == lineNode)
      { return locateNodeInLineView(lineView, node, offset) }
  }
}

function locateNodeInLineView(lineView, node, offset) {
  var wrapper = lineView.text.firstChild, bad = false;
  if (!node || !contains(wrapper, node)) { return badPos(Pos(lineNo(lineView.line), 0), true) }
  if (node == wrapper) {
    bad = true;
    node = wrapper.childNodes[offset];
    offset = 0;
    if (!node) {
      var line = lineView.rest ? lst(lineView.rest) : lineView.line;
      return badPos(Pos(lineNo(line), line.text.length), bad)
    }
  }

  var textNode = node.nodeType == 3 ? node : null, topNode = node;
  if (!textNode && node.childNodes.length == 1 && node.firstChild.nodeType == 3) {
    textNode = node.firstChild;
    if (offset) { offset = textNode.nodeValue.length; }
  }
  while (topNode.parentNode != wrapper) { topNode = topNode.parentNode; }
  var measure = lineView.measure, maps = measure.maps;

  function find(textNode, topNode, offset) {
    for (var i = -1; i < (maps ? maps.length : 0); i++) {
      var map$$1 = i < 0 ? measure.map : maps[i];
      for (var j = 0; j < map$$1.length; j += 3) {
        var curNode = map$$1[j + 2];
        if (curNode == textNode || curNode == topNode) {
          var line = lineNo(i < 0 ? lineView.line : lineView.rest[i]);
          var ch = map$$1[j] + offset;
          if (offset < 0 || curNode != textNode) { ch = map$$1[j + (offset ? 1 : 0)]; }
          return Pos(line, ch)
        }
      }
    }
  }
  var found = find(textNode, topNode, offset);
  if (found) { return badPos(found, bad) }

  // FIXME this is all really shaky. might handle the few cases it needs to handle, but likely to cause problems
  for (var after = topNode.nextSibling, dist = textNode ? textNode.nodeValue.length - offset : 0; after; after = after.nextSibling) {
    found = find(after, after.firstChild, 0);
    if (found)
      { return badPos(Pos(found.line, found.ch - dist), bad) }
    else
      { dist += after.textContent.length; }
  }
  for (var before = topNode.previousSibling, dist$1 = offset; before; before = before.previousSibling) {
    found = find(before, before.firstChild, -1);
    if (found)
      { return badPos(Pos(found.line, found.ch + dist$1), bad) }
    else
      { dist$1 += before.textContent.length; }
  }
}

// TEXTAREA INPUT STYLE

var TextareaInput = function(cm) {
  this.cm = cm;
  // See input.poll and input.reset
  this.prevInput = "";

  // Flag that indicates whether we expect input to appear real soon
  // now (after some event like 'keypress' or 'input') and are
  // polling intensively.
  this.pollingFast = false;
  // Self-resetting timeout for the poller
  this.polling = new Delayed();
  // Used to work around IE issue with selection being forgotten when focus moves away from textarea
  this.hasSelection = false;
  this.composing = null;
};

TextareaInput.prototype.init = function (display) {
    var this$1 = this;

  var input = this, cm = this.cm;
  this.createField(display);
  var te = this.textarea;

  display.wrapper.insertBefore(this.wrapper, display.wrapper.firstChild);

  // Needed to hide big blue blinking cursor on Mobile Safari (doesn't seem to work in iOS 8 anymore)
  if (ios) { te.style.width = "0px"; }

  on(te, "input", function () {
    if (ie && ie_version >= 9 && this$1.hasSelection) { this$1.hasSelection = null; }
    input.poll();
  });

  on(te, "paste", function (e) {
    if (signalDOMEvent(cm, e) || handlePaste(e, cm)) { return }

    cm.state.pasteIncoming = true;
    input.fastPoll();
  });

  function prepareCopyCut(e) {
    if (signalDOMEvent(cm, e)) { return }
    if (cm.somethingSelected()) {
      setLastCopied({lineWise: false, text: cm.getSelections()});
    } else if (!cm.options.lineWiseCopyCut) {
      return
    } else {
      var ranges = copyableRanges(cm);
      setLastCopied({lineWise: true, text: ranges.text});
      if (e.type == "cut") {
        cm.setSelections(ranges.ranges, null, sel_dontScroll);
      } else {
        input.prevInput = "";
        te.value = ranges.text.join("\n");
        selectInput(te);
      }
    }
    if (e.type == "cut") { cm.state.cutIncoming = true; }
  }
  on(te, "cut", prepareCopyCut);
  on(te, "copy", prepareCopyCut);

  on(display.scroller, "paste", function (e) {
    if (eventInWidget(display, e) || signalDOMEvent(cm, e)) { return }
    cm.state.pasteIncoming = true;
    input.focus();
  });

  // Prevent normal selection in the editor (we handle our own)
  on(display.lineSpace, "selectstart", function (e) {
    if (!eventInWidget(display, e)) { e_preventDefault(e); }
  });

  on(te, "compositionstart", function () {
    var start = cm.getCursor("from");
    if (input.composing) { input.composing.range.clear(); }
    input.composing = {
      start: start,
      range: cm.markText(start, cm.getCursor("to"), {className: "CodeMirror-composing"})
    };
  });
  on(te, "compositionend", function () {
    if (input.composing) {
      input.poll();
      input.composing.range.clear();
      input.composing = null;
    }
  });
};

TextareaInput.prototype.createField = function (_display) {
  // Wraps and hides input textarea
  this.wrapper = hiddenTextarea();
  // The semihidden textarea that is focused when the editor is
  // focused, and receives input.
  this.textarea = this.wrapper.firstChild;
};

TextareaInput.prototype.prepareSelection = function () {
  // Redraw the selection and/or cursor
  var cm = this.cm, display = cm.display, doc = cm.doc;
  var result = prepareSelection(cm);

  // Move the hidden textarea near the cursor to prevent scrolling artifacts
  if (cm.options.moveInputWithCursor) {
    var headPos = cursorCoords(cm, doc.sel.primary().head, "div");
    var wrapOff = display.wrapper.getBoundingClientRect(), lineOff = display.lineDiv.getBoundingClientRect();
    result.teTop = Math.max(0, Math.min(display.wrapper.clientHeight - 10,
                                        headPos.top + lineOff.top - wrapOff.top));
    result.teLeft = Math.max(0, Math.min(display.wrapper.clientWidth - 10,
                                         headPos.left + lineOff.left - wrapOff.left));
  }

  return result
};

TextareaInput.prototype.showSelection = function (drawn) {
  var cm = this.cm, display = cm.display;
  removeChildrenAndAdd(display.cursorDiv, drawn.cursors);
  removeChildrenAndAdd(display.selectionDiv, drawn.selection);
  if (drawn.teTop != null) {
    this.wrapper.style.top = drawn.teTop + "px";
    this.wrapper.style.left = drawn.teLeft + "px";
  }
};

// Reset the input to correspond to the selection (or to be empty,
// when not typing and nothing is selected)
TextareaInput.prototype.reset = function (typing) {
  if (this.contextMenuPending || this.composing) { return }
  var cm = this.cm;
  if (cm.somethingSelected()) {
    this.prevInput = "";
    var content = cm.getSelection();
    this.textarea.value = content;
    if (cm.state.focused) { selectInput(this.textarea); }
    if (ie && ie_version >= 9) { this.hasSelection = content; }
  } else if (!typing) {
    this.prevInput = this.textarea.value = "";
    if (ie && ie_version >= 9) { this.hasSelection = null; }
  }
};

TextareaInput.prototype.getField = function () { return this.textarea };

TextareaInput.prototype.supportsTouch = function () { return false };

TextareaInput.prototype.focus = function () {
  if (this.cm.options.readOnly != "nocursor" && (!mobile || activeElt() != this.textarea)) {
    try { this.textarea.focus(); }
    catch (e) {} // IE8 will throw if the textarea is display: none or not in DOM
  }
};

TextareaInput.prototype.blur = function () { this.textarea.blur(); };

TextareaInput.prototype.resetPosition = function () {
  this.wrapper.style.top = this.wrapper.style.left = 0;
};

TextareaInput.prototype.receivedFocus = function () { this.slowPoll(); };

// Poll for input changes, using the normal rate of polling. This
// runs as long as the editor is focused.
TextareaInput.prototype.slowPoll = function () {
    var this$1 = this;

  if (this.pollingFast) { return }
  this.polling.set(this.cm.options.pollInterval, function () {
    this$1.poll();
    if (this$1.cm.state.focused) { this$1.slowPoll(); }
  });
};

// When an event has just come in that is likely to add or change
// something in the input textarea, we poll faster, to ensure that
// the change appears on the screen quickly.
TextareaInput.prototype.fastPoll = function () {
  var missed = false, input = this;
  input.pollingFast = true;
  function p() {
    var changed = input.poll();
    if (!changed && !missed) {missed = true; input.polling.set(60, p);}
    else {input.pollingFast = false; input.slowPoll();}
  }
  input.polling.set(20, p);
};

// Read input from the textarea, and update the document to match.
// When something is selected, it is present in the textarea, and
// selected (unless it is huge, in which case a placeholder is
// used). When nothing is selected, the cursor sits after previously
// seen text (can be empty), which is stored in prevInput (we must
// not reset the textarea when typing, because that breaks IME).
TextareaInput.prototype.poll = function () {
    var this$1 = this;

  var cm = this.cm, input = this.textarea, prevInput = this.prevInput;
  // Since this is called a *lot*, try to bail out as cheaply as
  // possible when it is clear that nothing happened. hasSelection
  // will be the case when there is a lot of text in the textarea,
  // in which case reading its value would be expensive.
  if (this.contextMenuPending || !cm.state.focused ||
      (hasSelection(input) && !prevInput && !this.composing) ||
      cm.isReadOnly() || cm.options.disableInput || cm.state.keySeq)
    { return false }

  var text = input.value;
  // If nothing changed, bail.
  if (text == prevInput && !cm.somethingSelected()) { return false }
  // Work around nonsensical selection resetting in IE9/10, and
  // inexplicable appearance of private area unicode characters on
  // some key combos in Mac (#2689).
  if (ie && ie_version >= 9 && this.hasSelection === text ||
      mac && /[\uf700-\uf7ff]/.test(text)) {
    cm.display.input.reset();
    return false
  }

  if (cm.doc.sel == cm.display.selForContextMenu) {
    var first = text.charCodeAt(0);
    if (first == 0x200b && !prevInput) { prevInput = "\u200b"; }
    if (first == 0x21da) { this.reset(); return this.cm.execCommand("undo") }
  }
  // Find the part of the input that is actually new
  var same = 0, l = Math.min(prevInput.length, text.length);
  while (same < l && prevInput.charCodeAt(same) == text.charCodeAt(same)) { ++same; }

  runInOp(cm, function () {
    applyTextInput(cm, text.slice(same), prevInput.length - same,
                   null, this$1.composing ? "*compose" : null);

    // Don't leave long text in the textarea, since it makes further polling slow
    if (text.length > 1000 || text.indexOf("\n") > -1) { input.value = this$1.prevInput = ""; }
    else { this$1.prevInput = text; }

    if (this$1.composing) {
      this$1.composing.range.clear();
      this$1.composing.range = cm.markText(this$1.composing.start, cm.getCursor("to"),
                                         {className: "CodeMirror-composing"});
    }
  });
  return true
};

TextareaInput.prototype.ensurePolled = function () {
  if (this.pollingFast && this.poll()) { this.pollingFast = false; }
};

TextareaInput.prototype.onKeyPress = function () {
  if (ie && ie_version >= 9) { this.hasSelection = null; }
  this.fastPoll();
};

TextareaInput.prototype.onContextMenu = function (e) {
  var input = this, cm = input.cm, display = cm.display, te = input.textarea;
  var pos = posFromMouse(cm, e), scrollPos = display.scroller.scrollTop;
  if (!pos || presto) { return } // Opera is difficult.

  // Reset the current text selection only if the click is done outside of the selection
  // and 'resetSelectionOnContextMenu' option is true.
  var reset = cm.options.resetSelectionOnContextMenu;
  if (reset && cm.doc.sel.contains(pos) == -1)
    { operation(cm, setSelection)(cm.doc, simpleSelection(pos), sel_dontScroll); }

  var oldCSS = te.style.cssText, oldWrapperCSS = input.wrapper.style.cssText;
  input.wrapper.style.cssText = "position: absolute";
  var wrapperBox = input.wrapper.getBoundingClientRect();
  te.style.cssText = "position: absolute; width: 30px; height: 30px;\n      top: " + (e.clientY - wrapperBox.top - 5) + "px; left: " + (e.clientX - wrapperBox.left - 5) + "px;\n      z-index: 1000; background: " + (ie ? "rgba(255, 255, 255, .05)" : "transparent") + ";\n      outline: none; border-width: 0; outline: none; overflow: hidden; opacity: .05; filter: alpha(opacity=5);";
  var oldScrollY;
  if (webkit) { oldScrollY = window.scrollY; } // Work around Chrome issue (#2712)
  display.input.focus();
  if (webkit) { window.scrollTo(null, oldScrollY); }
  display.input.reset();
  // Adds "Select all" to context menu in FF
  if (!cm.somethingSelected()) { te.value = input.prevInput = " "; }
  input.contextMenuPending = true;
  display.selForContextMenu = cm.doc.sel;
  clearTimeout(display.detectingSelectAll);

  // Select-all will be greyed out if there's nothing to select, so
  // this adds a zero-width space so that we can later check whether
  // it got selected.
  function prepareSelectAllHack() {
    if (te.selectionStart != null) {
      var selected = cm.somethingSelected();
      var extval = "\u200b" + (selected ? te.value : "");
      te.value = "\u21da"; // Used to catch context-menu undo
      te.value = extval;
      input.prevInput = selected ? "" : "\u200b";
      te.selectionStart = 1; te.selectionEnd = extval.length;
      // Re-set this, in case some other handler touched the
      // selection in the meantime.
      display.selForContextMenu = cm.doc.sel;
    }
  }
  function rehide() {
    input.contextMenuPending = false;
    input.wrapper.style.cssText = oldWrapperCSS;
    te.style.cssText = oldCSS;
    if (ie && ie_version < 9) { display.scrollbars.setScrollTop(display.scroller.scrollTop = scrollPos); }

    // Try to detect the user choosing select-all
    if (te.selectionStart != null) {
      if (!ie || (ie && ie_version < 9)) { prepareSelectAllHack(); }
      var i = 0, poll = function () {
        if (display.selForContextMenu == cm.doc.sel && te.selectionStart == 0 &&
            te.selectionEnd > 0 && input.prevInput == "\u200b") {
          operation(cm, selectAll)(cm);
        } else if (i++ < 10) {
          display.detectingSelectAll = setTimeout(poll, 500);
        } else {
          display.selForContextMenu = null;
          display.input.reset();
        }
      };
      display.detectingSelectAll = setTimeout(poll, 200);
    }
  }

  if (ie && ie_version >= 9) { prepareSelectAllHack(); }
  if (captureRightClick) {
    e_stop(e);
    var mouseup = function () {
      off(window, "mouseup", mouseup);
      setTimeout(rehide, 20);
    };
    on(window, "mouseup", mouseup);
  } else {
    setTimeout(rehide, 50);
  }
};

TextareaInput.prototype.readOnlyChanged = function (val) {
  if (!val) { this.reset(); }
  this.textarea.disabled = val == "nocursor";
};

TextareaInput.prototype.setUneditable = function () {};

TextareaInput.prototype.needsContentAttribute = false;

function fromTextArea(textarea, options) {
  options = options ? copyObj(options) : {};
  options.value = textarea.value;
  if (!options.tabindex && textarea.tabIndex)
    { options.tabindex = textarea.tabIndex; }
  if (!options.placeholder && textarea.placeholder)
    { options.placeholder = textarea.placeholder; }
  // Set autofocus to true if this textarea is focused, or if it has
  // autofocus and no other element is focused.
  if (options.autofocus == null) {
    var hasFocus = activeElt();
    options.autofocus = hasFocus == textarea ||
      textarea.getAttribute("autofocus") != null && hasFocus == document.body;
  }

  function save() {textarea.value = cm.getValue();}

  var realSubmit;
  if (textarea.form) {
    on(textarea.form, "submit", save);
    // Deplorable hack to make the submit method do the right thing.
    if (!options.leaveSubmitMethodAlone) {
      var form = textarea.form;
      realSubmit = form.submit;
      try {
        var wrappedSubmit = form.submit = function () {
          save();
          form.submit = realSubmit;
          form.submit();
          form.submit = wrappedSubmit;
        };
      } catch(e) {}
    }
  }

  options.finishInit = function (cm) {
    cm.save = save;
    cm.getTextArea = function () { return textarea; };
    cm.toTextArea = function () {
      cm.toTextArea = isNaN; // Prevent this from being ran twice
      save();
      textarea.parentNode.removeChild(cm.getWrapperElement());
      textarea.style.display = "";
      if (textarea.form) {
        off(textarea.form, "submit", save);
        if (typeof textarea.form.submit == "function")
          { textarea.form.submit = realSubmit; }
      }
    };
  };

  textarea.style.display = "none";
  var cm = CodeMirror$1(function (node) { return textarea.parentNode.insertBefore(node, textarea.nextSibling); },
    options);
  return cm
}

function addLegacyProps(CodeMirror) {
  CodeMirror.off = off;
  CodeMirror.on = on;
  CodeMirror.wheelEventPixels = wheelEventPixels;
  CodeMirror.Doc = Doc;
  CodeMirror.splitLines = splitLinesAuto;
  CodeMirror.countColumn = countColumn;
  CodeMirror.findColumn = findColumn;
  CodeMirror.isWordChar = isWordCharBasic;
  CodeMirror.Pass = Pass;
  CodeMirror.signal = signal;
  CodeMirror.Line = Line;
  CodeMirror.changeEnd = changeEnd;
  CodeMirror.scrollbarModel = scrollbarModel;
  CodeMirror.Pos = Pos;
  CodeMirror.cmpPos = cmp;
  CodeMirror.modes = modes;
  CodeMirror.mimeModes = mimeModes;
  CodeMirror.resolveMode = resolveMode;
  CodeMirror.getMode = getMode;
  CodeMirror.modeExtensions = modeExtensions;
  CodeMirror.extendMode = extendMode;
  CodeMirror.copyState = copyState;
  CodeMirror.startState = startState;
  CodeMirror.innerMode = innerMode;
  CodeMirror.commands = commands;
  CodeMirror.keyMap = keyMap;
  CodeMirror.keyName = keyName;
  CodeMirror.isModifierKey = isModifierKey;
  CodeMirror.lookupKey = lookupKey;
  CodeMirror.normalizeKeyMap = normalizeKeyMap;
  CodeMirror.StringStream = StringStream;
  CodeMirror.SharedTextMarker = SharedTextMarker;
  CodeMirror.TextMarker = TextMarker;
  CodeMirror.LineWidget = LineWidget;
  CodeMirror.e_preventDefault = e_preventDefault;
  CodeMirror.e_stopPropagation = e_stopPropagation;
  CodeMirror.e_stop = e_stop;
  CodeMirror.addClass = addClass;
  CodeMirror.contains = contains;
  CodeMirror.rmClass = rmClass;
  CodeMirror.keyNames = keyNames;
}

// EDITOR CONSTRUCTOR

defineOptions(CodeMirror$1);

addEditorMethods(CodeMirror$1);

// Set up methods on CodeMirror's prototype to redirect to the editor's document.
var dontDelegate = "iter insert remove copy getEditor constructor".split(" ");
for (var prop in Doc.prototype) { if (Doc.prototype.hasOwnProperty(prop) && indexOf(dontDelegate, prop) < 0)
  { CodeMirror$1.prototype[prop] = (function(method) {
    return function() {return method.apply(this.doc, arguments)}
  })(Doc.prototype[prop]); } }

eventMixin(Doc);

// INPUT HANDLING

CodeMirror$1.inputStyles = {"textarea": TextareaInput, "contenteditable": ContentEditableInput};

// MODE DEFINITION AND QUERYING

// Extra arguments are stored as the mode's dependencies, which is
// used by (legacy) mechanisms like loadmode.js to automatically
// load a mode. (Preferred mechanism is the require/define calls.)
CodeMirror$1.defineMode = function(name/*, mode, …*/) {
  if (!CodeMirror$1.defaults.mode && name != "null") { CodeMirror$1.defaults.mode = name; }
  defineMode.apply(this, arguments);
};

CodeMirror$1.defineMIME = defineMIME;

// Minimal default mode.
CodeMirror$1.defineMode("null", function () { return ({token: function (stream) { return stream.skipToEnd(); }}); });
CodeMirror$1.defineMIME("text/plain", "null");

// EXTENSIONS

CodeMirror$1.defineExtension = function (name, func) {
  CodeMirror$1.prototype[name] = func;
};
CodeMirror$1.defineDocExtension = function (name, func) {
  Doc.prototype[name] = func;
};

CodeMirror$1.fromTextArea = fromTextArea;

addLegacyProps(CodeMirror$1);

CodeMirror$1.version = "5.39.0";

return CodeMirror$1;

})));

},{}],2:[function(require,module,exports){
CodeMirror = require('codemirror');

var total_cells = 100;
//var total_code_cells = 100;
//var total_markdown_cells = 100;
var cm_config = {
    "indentUnit":4,
    "readOnly":false,
    "theme":"ipython",
    "extraKeys":{
        "Cmd-Right":"goLineRight",
        "End":"goLineRight",
        "Cmd-Left":"goLineLeft",
        "Tab":"indentMore",
        "Shift-Tab":"indentLess",
        "Cmd-/":"toggleComment",
        "Ctrl-/":"toggleComment",
        "Backspace":"delSpaceToPrevTabStop"
    },
    "mode":{
        "name":"ipython",
        "version":3
    },
    "matchBrackets":true,
    "autoCloseBrackets":true
};

var cm_config2 = {
    "indentUnit": 4,
    "readOnly": false,
    "theme": "default",
    "extraKeys": {
        "Cmd-Right": "goLineRight",
        "End": "goLineRight",
        "Cmd-Left": "goLineLeft",
        "Tab": "indentMore",
        "Shift-Tab": "indentLess",
        "Cmd-/": "toggleComment",
        "Ctrl-/": "toggleComment"
    },
    "mode": "ipythongfm",
    "lineWrapping": true
};


window.shared_elements = {};
for (var i=0; i<total_cells; i++) {
    var output = document.createElement('div');
    var input_area = document.createElement('div');
    input_area.className = 'input_area';
    //var codemirror = CodeMirror(input_area, cm_config); 
    var codemirror = CodeMirror(input_area); 
    window.shared_elements[i] = {
        'output': output,
        'input_area': input_area,
        'codemirror': codemirror,
    };
}

window.shared_elements_available = true;

//for (var i=total_code_cells; i<total_code_cells+total_markdown_cells; i++) {
//    var input_area = document.createElement('div');
//    input_area.className = 'input_area';
//    var codemirror = CodeMirror(input_area, cm_config2); 
//    window.shared_elements[i] = {
//        'input_area': input_area,
//        'codemirror': codemirror
//    };
//}

},{"codemirror":1}]},{},[2])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvY29kZW1pcnJvci9saWIvY29kZW1pcnJvci5qcyIsInNyYy9wcmVkZWZpbmUuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDLzlTQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24oKXtmdW5jdGlvbiByKGUsbix0KXtmdW5jdGlvbiBvKGksZil7aWYoIW5baV0pe2lmKCFlW2ldKXt2YXIgYz1cImZ1bmN0aW9uXCI9PXR5cGVvZiByZXF1aXJlJiZyZXF1aXJlO2lmKCFmJiZjKXJldHVybiBjKGksITApO2lmKHUpcmV0dXJuIHUoaSwhMCk7dmFyIGE9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitpK1wiJ1wiKTt0aHJvdyBhLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsYX12YXIgcD1uW2ldPXtleHBvcnRzOnt9fTtlW2ldWzBdLmNhbGwocC5leHBvcnRzLGZ1bmN0aW9uKHIpe3ZhciBuPWVbaV1bMV1bcl07cmV0dXJuIG8obnx8cil9LHAscC5leHBvcnRzLHIsZSxuLHQpfXJldHVybiBuW2ldLmV4cG9ydHN9Zm9yKHZhciB1PVwiZnVuY3Rpb25cIj09dHlwZW9mIHJlcXVpcmUmJnJlcXVpcmUsaT0wO2k8dC5sZW5ndGg7aSsrKW8odFtpXSk7cmV0dXJuIG99cmV0dXJuIHJ9KSgpIiwiLy8gQ29kZU1pcnJvciwgY29weXJpZ2h0IChjKSBieSBNYXJpam4gSGF2ZXJiZWtlIGFuZCBvdGhlcnNcbi8vIERpc3RyaWJ1dGVkIHVuZGVyIGFuIE1JVCBsaWNlbnNlOiBodHRwOi8vY29kZW1pcnJvci5uZXQvTElDRU5TRVxuXG4vLyBUaGlzIGlzIENvZGVNaXJyb3IgKGh0dHA6Ly9jb2RlbWlycm9yLm5ldCksIGEgY29kZSBlZGl0b3Jcbi8vIGltcGxlbWVudGVkIGluIEphdmFTY3JpcHQgb24gdG9wIG9mIHRoZSBicm93c2VyJ3MgRE9NLlxuLy9cbi8vIFlvdSBjYW4gZmluZCBzb21lIHRlY2huaWNhbCBiYWNrZ3JvdW5kIGZvciBzb21lIG9mIHRoZSBjb2RlIGJlbG93XG4vLyBhdCBodHRwOi8vbWFyaWpuaGF2ZXJiZWtlLm5sL2Jsb2cvI2NtLWludGVybmFscyAuXG5cbihmdW5jdGlvbiAoZ2xvYmFsLCBmYWN0b3J5KSB7XG5cdHR5cGVvZiBleHBvcnRzID09PSAnb2JqZWN0JyAmJiB0eXBlb2YgbW9kdWxlICE9PSAndW5kZWZpbmVkJyA/IG1vZHVsZS5leHBvcnRzID0gZmFjdG9yeSgpIDpcblx0dHlwZW9mIGRlZmluZSA9PT0gJ2Z1bmN0aW9uJyAmJiBkZWZpbmUuYW1kID8gZGVmaW5lKGZhY3RvcnkpIDpcblx0KGdsb2JhbC5Db2RlTWlycm9yID0gZmFjdG9yeSgpKTtcbn0odGhpcywgKGZ1bmN0aW9uICgpIHsgJ3VzZSBzdHJpY3QnO1xuXG4vLyBLbHVkZ2VzIGZvciBidWdzIGFuZCBiZWhhdmlvciBkaWZmZXJlbmNlcyB0aGF0IGNhbid0IGJlIGZlYXR1cmVcbi8vIGRldGVjdGVkIGFyZSBlbmFibGVkIGJhc2VkIG9uIHVzZXJBZ2VudCBldGMgc25pZmZpbmcuXG52YXIgdXNlckFnZW50ID0gbmF2aWdhdG9yLnVzZXJBZ2VudDtcbnZhciBwbGF0Zm9ybSA9IG5hdmlnYXRvci5wbGF0Zm9ybTtcblxudmFyIGdlY2tvID0gL2dlY2tvXFwvXFxkL2kudGVzdCh1c2VyQWdlbnQpO1xudmFyIGllX3VwdG8xMCA9IC9NU0lFIFxcZC8udGVzdCh1c2VyQWdlbnQpO1xudmFyIGllXzExdXAgPSAvVHJpZGVudFxcLyg/Ols3LTldfFxcZHsyLH0pXFwuLipydjooXFxkKykvLmV4ZWModXNlckFnZW50KTtcbnZhciBlZGdlID0gL0VkZ2VcXC8oXFxkKykvLmV4ZWModXNlckFnZW50KTtcbnZhciBpZSA9IGllX3VwdG8xMCB8fCBpZV8xMXVwIHx8IGVkZ2U7XG52YXIgaWVfdmVyc2lvbiA9IGllICYmIChpZV91cHRvMTAgPyBkb2N1bWVudC5kb2N1bWVudE1vZGUgfHwgNiA6ICsoZWRnZSB8fCBpZV8xMXVwKVsxXSk7XG52YXIgd2Via2l0ID0gIWVkZ2UgJiYgL1dlYktpdFxcLy8udGVzdCh1c2VyQWdlbnQpO1xudmFyIHF0d2Via2l0ID0gd2Via2l0ICYmIC9RdFxcL1xcZCtcXC5cXGQrLy50ZXN0KHVzZXJBZ2VudCk7XG52YXIgY2hyb21lID0gIWVkZ2UgJiYgL0Nocm9tZVxcLy8udGVzdCh1c2VyQWdlbnQpO1xudmFyIHByZXN0byA9IC9PcGVyYVxcLy8udGVzdCh1c2VyQWdlbnQpO1xudmFyIHNhZmFyaSA9IC9BcHBsZSBDb21wdXRlci8udGVzdChuYXZpZ2F0b3IudmVuZG9yKTtcbnZhciBtYWNfZ2VNb3VudGFpbkxpb24gPSAvTWFjIE9TIFggMVxcZFxcRChbOC05XXxcXGRcXGQpXFxELy50ZXN0KHVzZXJBZ2VudCk7XG52YXIgcGhhbnRvbSA9IC9QaGFudG9tSlMvLnRlc3QodXNlckFnZW50KTtcblxudmFyIGlvcyA9ICFlZGdlICYmIC9BcHBsZVdlYktpdC8udGVzdCh1c2VyQWdlbnQpICYmIC9Nb2JpbGVcXC9cXHcrLy50ZXN0KHVzZXJBZ2VudCk7XG52YXIgYW5kcm9pZCA9IC9BbmRyb2lkLy50ZXN0KHVzZXJBZ2VudCk7XG4vLyBUaGlzIGlzIHdvZWZ1bGx5IGluY29tcGxldGUuIFN1Z2dlc3Rpb25zIGZvciBhbHRlcm5hdGl2ZSBtZXRob2RzIHdlbGNvbWUuXG52YXIgbW9iaWxlID0gaW9zIHx8IGFuZHJvaWQgfHwgL3dlYk9TfEJsYWNrQmVycnl8T3BlcmEgTWluaXxPcGVyYSBNb2JpfElFTW9iaWxlL2kudGVzdCh1c2VyQWdlbnQpO1xudmFyIG1hYyA9IGlvcyB8fCAvTWFjLy50ZXN0KHBsYXRmb3JtKTtcbnZhciBjaHJvbWVPUyA9IC9cXGJDck9TXFxiLy50ZXN0KHVzZXJBZ2VudCk7XG52YXIgd2luZG93cyA9IC93aW4vaS50ZXN0KHBsYXRmb3JtKTtcblxudmFyIHByZXN0b192ZXJzaW9uID0gcHJlc3RvICYmIHVzZXJBZ2VudC5tYXRjaCgvVmVyc2lvblxcLyhcXGQqXFwuXFxkKikvKTtcbmlmIChwcmVzdG9fdmVyc2lvbikgeyBwcmVzdG9fdmVyc2lvbiA9IE51bWJlcihwcmVzdG9fdmVyc2lvblsxXSk7IH1cbmlmIChwcmVzdG9fdmVyc2lvbiAmJiBwcmVzdG9fdmVyc2lvbiA+PSAxNSkgeyBwcmVzdG8gPSBmYWxzZTsgd2Via2l0ID0gdHJ1ZTsgfVxuLy8gU29tZSBicm93c2VycyB1c2UgdGhlIHdyb25nIGV2ZW50IHByb3BlcnRpZXMgdG8gc2lnbmFsIGNtZC9jdHJsIG9uIE9TIFhcbnZhciBmbGlwQ3RybENtZCA9IG1hYyAmJiAocXR3ZWJraXQgfHwgcHJlc3RvICYmIChwcmVzdG9fdmVyc2lvbiA9PSBudWxsIHx8IHByZXN0b192ZXJzaW9uIDwgMTIuMTEpKTtcbnZhciBjYXB0dXJlUmlnaHRDbGljayA9IGdlY2tvIHx8IChpZSAmJiBpZV92ZXJzaW9uID49IDkpO1xuXG5mdW5jdGlvbiBjbGFzc1Rlc3QoY2xzKSB7IHJldHVybiBuZXcgUmVnRXhwKFwiKF58XFxcXHMpXCIgKyBjbHMgKyBcIig/OiR8XFxcXHMpXFxcXHMqXCIpIH1cblxudmFyIHJtQ2xhc3MgPSBmdW5jdGlvbihub2RlLCBjbHMpIHtcbiAgdmFyIGN1cnJlbnQgPSBub2RlLmNsYXNzTmFtZTtcbiAgdmFyIG1hdGNoID0gY2xhc3NUZXN0KGNscykuZXhlYyhjdXJyZW50KTtcbiAgaWYgKG1hdGNoKSB7XG4gICAgdmFyIGFmdGVyID0gY3VycmVudC5zbGljZShtYXRjaC5pbmRleCArIG1hdGNoWzBdLmxlbmd0aCk7XG4gICAgbm9kZS5jbGFzc05hbWUgPSBjdXJyZW50LnNsaWNlKDAsIG1hdGNoLmluZGV4KSArIChhZnRlciA/IG1hdGNoWzFdICsgYWZ0ZXIgOiBcIlwiKTtcbiAgfVxufTtcblxuZnVuY3Rpb24gcmVtb3ZlQ2hpbGRyZW4oZSkge1xuICBmb3IgKHZhciBjb3VudCA9IGUuY2hpbGROb2Rlcy5sZW5ndGg7IGNvdW50ID4gMDsgLS1jb3VudClcbiAgICB7IGUucmVtb3ZlQ2hpbGQoZS5maXJzdENoaWxkKTsgfVxuICByZXR1cm4gZVxufVxuXG5mdW5jdGlvbiByZW1vdmVDaGlsZHJlbkFuZEFkZChwYXJlbnQsIGUpIHtcbiAgcmV0dXJuIHJlbW92ZUNoaWxkcmVuKHBhcmVudCkuYXBwZW5kQ2hpbGQoZSlcbn1cblxuZnVuY3Rpb24gZWx0KHRhZywgY29udGVudCwgY2xhc3NOYW1lLCBzdHlsZSkge1xuICB2YXIgZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQodGFnKTtcbiAgaWYgKGNsYXNzTmFtZSkgeyBlLmNsYXNzTmFtZSA9IGNsYXNzTmFtZTsgfVxuICBpZiAoc3R5bGUpIHsgZS5zdHlsZS5jc3NUZXh0ID0gc3R5bGU7IH1cbiAgaWYgKHR5cGVvZiBjb250ZW50ID09IFwic3RyaW5nXCIpIHsgZS5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShjb250ZW50KSk7IH1cbiAgZWxzZSBpZiAoY29udGVudCkgeyBmb3IgKHZhciBpID0gMDsgaSA8IGNvbnRlbnQubGVuZ3RoOyArK2kpIHsgZS5hcHBlbmRDaGlsZChjb250ZW50W2ldKTsgfSB9XG4gIHJldHVybiBlXG59XG4vLyB3cmFwcGVyIGZvciBlbHQsIHdoaWNoIHJlbW92ZXMgdGhlIGVsdCBmcm9tIHRoZSBhY2Nlc3NpYmlsaXR5IHRyZWVcbmZ1bmN0aW9uIGVsdFAodGFnLCBjb250ZW50LCBjbGFzc05hbWUsIHN0eWxlKSB7XG4gIHZhciBlID0gZWx0KHRhZywgY29udGVudCwgY2xhc3NOYW1lLCBzdHlsZSk7XG4gIGUuc2V0QXR0cmlidXRlKFwicm9sZVwiLCBcInByZXNlbnRhdGlvblwiKTtcbiAgcmV0dXJuIGVcbn1cblxudmFyIHJhbmdlO1xuaWYgKGRvY3VtZW50LmNyZWF0ZVJhbmdlKSB7IHJhbmdlID0gZnVuY3Rpb24obm9kZSwgc3RhcnQsIGVuZCwgZW5kTm9kZSkge1xuICB2YXIgciA9IGRvY3VtZW50LmNyZWF0ZVJhbmdlKCk7XG4gIHIuc2V0RW5kKGVuZE5vZGUgfHwgbm9kZSwgZW5kKTtcbiAgci5zZXRTdGFydChub2RlLCBzdGFydCk7XG4gIHJldHVybiByXG59OyB9XG5lbHNlIHsgcmFuZ2UgPSBmdW5jdGlvbihub2RlLCBzdGFydCwgZW5kKSB7XG4gIHZhciByID0gZG9jdW1lbnQuYm9keS5jcmVhdGVUZXh0UmFuZ2UoKTtcbiAgdHJ5IHsgci5tb3ZlVG9FbGVtZW50VGV4dChub2RlLnBhcmVudE5vZGUpOyB9XG4gIGNhdGNoKGUpIHsgcmV0dXJuIHIgfVxuICByLmNvbGxhcHNlKHRydWUpO1xuICByLm1vdmVFbmQoXCJjaGFyYWN0ZXJcIiwgZW5kKTtcbiAgci5tb3ZlU3RhcnQoXCJjaGFyYWN0ZXJcIiwgc3RhcnQpO1xuICByZXR1cm4gclxufTsgfVxuXG5mdW5jdGlvbiBjb250YWlucyhwYXJlbnQsIGNoaWxkKSB7XG4gIGlmIChjaGlsZC5ub2RlVHlwZSA9PSAzKSAvLyBBbmRyb2lkIGJyb3dzZXIgYWx3YXlzIHJldHVybnMgZmFsc2Ugd2hlbiBjaGlsZCBpcyBhIHRleHRub2RlXG4gICAgeyBjaGlsZCA9IGNoaWxkLnBhcmVudE5vZGU7IH1cbiAgaWYgKHBhcmVudC5jb250YWlucylcbiAgICB7IHJldHVybiBwYXJlbnQuY29udGFpbnMoY2hpbGQpIH1cbiAgZG8ge1xuICAgIGlmIChjaGlsZC5ub2RlVHlwZSA9PSAxMSkgeyBjaGlsZCA9IGNoaWxkLmhvc3Q7IH1cbiAgICBpZiAoY2hpbGQgPT0gcGFyZW50KSB7IHJldHVybiB0cnVlIH1cbiAgfSB3aGlsZSAoY2hpbGQgPSBjaGlsZC5wYXJlbnROb2RlKVxufVxuXG5mdW5jdGlvbiBhY3RpdmVFbHQoKSB7XG4gIC8vIElFIGFuZCBFZGdlIG1heSB0aHJvdyBhbiBcIlVuc3BlY2lmaWVkIEVycm9yXCIgd2hlbiBhY2Nlc3NpbmcgZG9jdW1lbnQuYWN0aXZlRWxlbWVudC5cbiAgLy8gSUUgPCAxMCB3aWxsIHRocm93IHdoZW4gYWNjZXNzZWQgd2hpbGUgdGhlIHBhZ2UgaXMgbG9hZGluZyBvciBpbiBhbiBpZnJhbWUuXG4gIC8vIElFID4gOSBhbmQgRWRnZSB3aWxsIHRocm93IHdoZW4gYWNjZXNzZWQgaW4gYW4gaWZyYW1lIGlmIGRvY3VtZW50LmJvZHkgaXMgdW5hdmFpbGFibGUuXG4gIHZhciBhY3RpdmVFbGVtZW50O1xuICB0cnkge1xuICAgIGFjdGl2ZUVsZW1lbnQgPSBkb2N1bWVudC5hY3RpdmVFbGVtZW50O1xuICB9IGNhdGNoKGUpIHtcbiAgICBhY3RpdmVFbGVtZW50ID0gZG9jdW1lbnQuYm9keSB8fCBudWxsO1xuICB9XG4gIHdoaWxlIChhY3RpdmVFbGVtZW50ICYmIGFjdGl2ZUVsZW1lbnQuc2hhZG93Um9vdCAmJiBhY3RpdmVFbGVtZW50LnNoYWRvd1Jvb3QuYWN0aXZlRWxlbWVudClcbiAgICB7IGFjdGl2ZUVsZW1lbnQgPSBhY3RpdmVFbGVtZW50LnNoYWRvd1Jvb3QuYWN0aXZlRWxlbWVudDsgfVxuICByZXR1cm4gYWN0aXZlRWxlbWVudFxufVxuXG5mdW5jdGlvbiBhZGRDbGFzcyhub2RlLCBjbHMpIHtcbiAgdmFyIGN1cnJlbnQgPSBub2RlLmNsYXNzTmFtZTtcbiAgaWYgKCFjbGFzc1Rlc3QoY2xzKS50ZXN0KGN1cnJlbnQpKSB7IG5vZGUuY2xhc3NOYW1lICs9IChjdXJyZW50ID8gXCIgXCIgOiBcIlwiKSArIGNsczsgfVxufVxuZnVuY3Rpb24gam9pbkNsYXNzZXMoYSwgYikge1xuICB2YXIgYXMgPSBhLnNwbGl0KFwiIFwiKTtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcy5sZW5ndGg7IGkrKylcbiAgICB7IGlmIChhc1tpXSAmJiAhY2xhc3NUZXN0KGFzW2ldKS50ZXN0KGIpKSB7IGIgKz0gXCIgXCIgKyBhc1tpXTsgfSB9XG4gIHJldHVybiBiXG59XG5cbnZhciBzZWxlY3RJbnB1dCA9IGZ1bmN0aW9uKG5vZGUpIHsgbm9kZS5zZWxlY3QoKTsgfTtcbmlmIChpb3MpIC8vIE1vYmlsZSBTYWZhcmkgYXBwYXJlbnRseSBoYXMgYSBidWcgd2hlcmUgc2VsZWN0KCkgaXMgYnJva2VuLlxuICB7IHNlbGVjdElucHV0ID0gZnVuY3Rpb24obm9kZSkgeyBub2RlLnNlbGVjdGlvblN0YXJ0ID0gMDsgbm9kZS5zZWxlY3Rpb25FbmQgPSBub2RlLnZhbHVlLmxlbmd0aDsgfTsgfVxuZWxzZSBpZiAoaWUpIC8vIFN1cHByZXNzIG15c3RlcmlvdXMgSUUxMCBlcnJvcnNcbiAgeyBzZWxlY3RJbnB1dCA9IGZ1bmN0aW9uKG5vZGUpIHsgdHJ5IHsgbm9kZS5zZWxlY3QoKTsgfSBjYXRjaChfZSkge30gfTsgfVxuXG5mdW5jdGlvbiBiaW5kKGYpIHtcbiAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuICByZXR1cm4gZnVuY3Rpb24oKXtyZXR1cm4gZi5hcHBseShudWxsLCBhcmdzKX1cbn1cblxuZnVuY3Rpb24gY29weU9iaihvYmosIHRhcmdldCwgb3ZlcndyaXRlKSB7XG4gIGlmICghdGFyZ2V0KSB7IHRhcmdldCA9IHt9OyB9XG4gIGZvciAodmFyIHByb3AgaW4gb2JqKVxuICAgIHsgaWYgKG9iai5oYXNPd25Qcm9wZXJ0eShwcm9wKSAmJiAob3ZlcndyaXRlICE9PSBmYWxzZSB8fCAhdGFyZ2V0Lmhhc093blByb3BlcnR5KHByb3ApKSlcbiAgICAgIHsgdGFyZ2V0W3Byb3BdID0gb2JqW3Byb3BdOyB9IH1cbiAgcmV0dXJuIHRhcmdldFxufVxuXG4vLyBDb3VudHMgdGhlIGNvbHVtbiBvZmZzZXQgaW4gYSBzdHJpbmcsIHRha2luZyB0YWJzIGludG8gYWNjb3VudC5cbi8vIFVzZWQgbW9zdGx5IHRvIGZpbmQgaW5kZW50YXRpb24uXG5mdW5jdGlvbiBjb3VudENvbHVtbihzdHJpbmcsIGVuZCwgdGFiU2l6ZSwgc3RhcnRJbmRleCwgc3RhcnRWYWx1ZSkge1xuICBpZiAoZW5kID09IG51bGwpIHtcbiAgICBlbmQgPSBzdHJpbmcuc2VhcmNoKC9bXlxcc1xcdTAwYTBdLyk7XG4gICAgaWYgKGVuZCA9PSAtMSkgeyBlbmQgPSBzdHJpbmcubGVuZ3RoOyB9XG4gIH1cbiAgZm9yICh2YXIgaSA9IHN0YXJ0SW5kZXggfHwgMCwgbiA9IHN0YXJ0VmFsdWUgfHwgMDs7KSB7XG4gICAgdmFyIG5leHRUYWIgPSBzdHJpbmcuaW5kZXhPZihcIlxcdFwiLCBpKTtcbiAgICBpZiAobmV4dFRhYiA8IDAgfHwgbmV4dFRhYiA+PSBlbmQpXG4gICAgICB7IHJldHVybiBuICsgKGVuZCAtIGkpIH1cbiAgICBuICs9IG5leHRUYWIgLSBpO1xuICAgIG4gKz0gdGFiU2l6ZSAtIChuICUgdGFiU2l6ZSk7XG4gICAgaSA9IG5leHRUYWIgKyAxO1xuICB9XG59XG5cbnZhciBEZWxheWVkID0gZnVuY3Rpb24oKSB7dGhpcy5pZCA9IG51bGw7fTtcbkRlbGF5ZWQucHJvdG90eXBlLnNldCA9IGZ1bmN0aW9uIChtcywgZikge1xuICBjbGVhclRpbWVvdXQodGhpcy5pZCk7XG4gIHRoaXMuaWQgPSBzZXRUaW1lb3V0KGYsIG1zKTtcbn07XG5cbmZ1bmN0aW9uIGluZGV4T2YoYXJyYXksIGVsdCkge1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGFycmF5Lmxlbmd0aDsgKytpKVxuICAgIHsgaWYgKGFycmF5W2ldID09IGVsdCkgeyByZXR1cm4gaSB9IH1cbiAgcmV0dXJuIC0xXG59XG5cbi8vIE51bWJlciBvZiBwaXhlbHMgYWRkZWQgdG8gc2Nyb2xsZXIgYW5kIHNpemVyIHRvIGhpZGUgc2Nyb2xsYmFyXG52YXIgc2Nyb2xsZXJHYXAgPSAzMDtcblxuLy8gUmV0dXJuZWQgb3IgdGhyb3duIGJ5IHZhcmlvdXMgcHJvdG9jb2xzIHRvIHNpZ25hbCAnSSdtIG5vdFxuLy8gaGFuZGxpbmcgdGhpcycuXG52YXIgUGFzcyA9IHt0b1N0cmluZzogZnVuY3Rpb24oKXtyZXR1cm4gXCJDb2RlTWlycm9yLlBhc3NcIn19O1xuXG4vLyBSZXVzZWQgb3B0aW9uIG9iamVjdHMgZm9yIHNldFNlbGVjdGlvbiAmIGZyaWVuZHNcbnZhciBzZWxfZG9udFNjcm9sbCA9IHtzY3JvbGw6IGZhbHNlfTtcbnZhciBzZWxfbW91c2UgPSB7b3JpZ2luOiBcIiptb3VzZVwifTtcbnZhciBzZWxfbW92ZSA9IHtvcmlnaW46IFwiK21vdmVcIn07XG5cbi8vIFRoZSBpbnZlcnNlIG9mIGNvdW50Q29sdW1uIC0tIGZpbmQgdGhlIG9mZnNldCB0aGF0IGNvcnJlc3BvbmRzIHRvXG4vLyBhIHBhcnRpY3VsYXIgY29sdW1uLlxuZnVuY3Rpb24gZmluZENvbHVtbihzdHJpbmcsIGdvYWwsIHRhYlNpemUpIHtcbiAgZm9yICh2YXIgcG9zID0gMCwgY29sID0gMDs7KSB7XG4gICAgdmFyIG5leHRUYWIgPSBzdHJpbmcuaW5kZXhPZihcIlxcdFwiLCBwb3MpO1xuICAgIGlmIChuZXh0VGFiID09IC0xKSB7IG5leHRUYWIgPSBzdHJpbmcubGVuZ3RoOyB9XG4gICAgdmFyIHNraXBwZWQgPSBuZXh0VGFiIC0gcG9zO1xuICAgIGlmIChuZXh0VGFiID09IHN0cmluZy5sZW5ndGggfHwgY29sICsgc2tpcHBlZCA+PSBnb2FsKVxuICAgICAgeyByZXR1cm4gcG9zICsgTWF0aC5taW4oc2tpcHBlZCwgZ29hbCAtIGNvbCkgfVxuICAgIGNvbCArPSBuZXh0VGFiIC0gcG9zO1xuICAgIGNvbCArPSB0YWJTaXplIC0gKGNvbCAlIHRhYlNpemUpO1xuICAgIHBvcyA9IG5leHRUYWIgKyAxO1xuICAgIGlmIChjb2wgPj0gZ29hbCkgeyByZXR1cm4gcG9zIH1cbiAgfVxufVxuXG52YXIgc3BhY2VTdHJzID0gW1wiXCJdO1xuZnVuY3Rpb24gc3BhY2VTdHIobikge1xuICB3aGlsZSAoc3BhY2VTdHJzLmxlbmd0aCA8PSBuKVxuICAgIHsgc3BhY2VTdHJzLnB1c2gobHN0KHNwYWNlU3RycykgKyBcIiBcIik7IH1cbiAgcmV0dXJuIHNwYWNlU3Ryc1tuXVxufVxuXG5mdW5jdGlvbiBsc3QoYXJyKSB7IHJldHVybiBhcnJbYXJyLmxlbmd0aC0xXSB9XG5cbmZ1bmN0aW9uIG1hcChhcnJheSwgZikge1xuICB2YXIgb3V0ID0gW107XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgYXJyYXkubGVuZ3RoOyBpKyspIHsgb3V0W2ldID0gZihhcnJheVtpXSwgaSk7IH1cbiAgcmV0dXJuIG91dFxufVxuXG5mdW5jdGlvbiBpbnNlcnRTb3J0ZWQoYXJyYXksIHZhbHVlLCBzY29yZSkge1xuICB2YXIgcG9zID0gMCwgcHJpb3JpdHkgPSBzY29yZSh2YWx1ZSk7XG4gIHdoaWxlIChwb3MgPCBhcnJheS5sZW5ndGggJiYgc2NvcmUoYXJyYXlbcG9zXSkgPD0gcHJpb3JpdHkpIHsgcG9zKys7IH1cbiAgYXJyYXkuc3BsaWNlKHBvcywgMCwgdmFsdWUpO1xufVxuXG5mdW5jdGlvbiBub3RoaW5nKCkge31cblxuZnVuY3Rpb24gY3JlYXRlT2JqKGJhc2UsIHByb3BzKSB7XG4gIHZhciBpbnN0O1xuICBpZiAoT2JqZWN0LmNyZWF0ZSkge1xuICAgIGluc3QgPSBPYmplY3QuY3JlYXRlKGJhc2UpO1xuICB9IGVsc2Uge1xuICAgIG5vdGhpbmcucHJvdG90eXBlID0gYmFzZTtcbiAgICBpbnN0ID0gbmV3IG5vdGhpbmcoKTtcbiAgfVxuICBpZiAocHJvcHMpIHsgY29weU9iaihwcm9wcywgaW5zdCk7IH1cbiAgcmV0dXJuIGluc3Rcbn1cblxudmFyIG5vbkFTQ0lJU2luZ2xlQ2FzZVdvcmRDaGFyID0gL1tcXHUwMGRmXFx1MDU4N1xcdTA1OTAtXFx1MDVmNFxcdTA2MDAtXFx1MDZmZlxcdTMwNDAtXFx1MzA5ZlxcdTMwYTAtXFx1MzBmZlxcdTM0MDAtXFx1NGRiNVxcdTRlMDAtXFx1OWZjY1xcdWFjMDAtXFx1ZDdhZl0vO1xuZnVuY3Rpb24gaXNXb3JkQ2hhckJhc2ljKGNoKSB7XG4gIHJldHVybiAvXFx3Ly50ZXN0KGNoKSB8fCBjaCA+IFwiXFx4ODBcIiAmJlxuICAgIChjaC50b1VwcGVyQ2FzZSgpICE9IGNoLnRvTG93ZXJDYXNlKCkgfHwgbm9uQVNDSUlTaW5nbGVDYXNlV29yZENoYXIudGVzdChjaCkpXG59XG5mdW5jdGlvbiBpc1dvcmRDaGFyKGNoLCBoZWxwZXIpIHtcbiAgaWYgKCFoZWxwZXIpIHsgcmV0dXJuIGlzV29yZENoYXJCYXNpYyhjaCkgfVxuICBpZiAoaGVscGVyLnNvdXJjZS5pbmRleE9mKFwiXFxcXHdcIikgPiAtMSAmJiBpc1dvcmRDaGFyQmFzaWMoY2gpKSB7IHJldHVybiB0cnVlIH1cbiAgcmV0dXJuIGhlbHBlci50ZXN0KGNoKVxufVxuXG5mdW5jdGlvbiBpc0VtcHR5KG9iaikge1xuICBmb3IgKHZhciBuIGluIG9iaikgeyBpZiAob2JqLmhhc093blByb3BlcnR5KG4pICYmIG9ialtuXSkgeyByZXR1cm4gZmFsc2UgfSB9XG4gIHJldHVybiB0cnVlXG59XG5cbi8vIEV4dGVuZGluZyB1bmljb2RlIGNoYXJhY3RlcnMuIEEgc2VyaWVzIG9mIGEgbm9uLWV4dGVuZGluZyBjaGFyICtcbi8vIGFueSBudW1iZXIgb2YgZXh0ZW5kaW5nIGNoYXJzIGlzIHRyZWF0ZWQgYXMgYSBzaW5nbGUgdW5pdCBhcyBmYXJcbi8vIGFzIGVkaXRpbmcgYW5kIG1lYXN1cmluZyBpcyBjb25jZXJuZWQuIFRoaXMgaXMgbm90IGZ1bGx5IGNvcnJlY3QsXG4vLyBzaW5jZSBzb21lIHNjcmlwdHMvZm9udHMvYnJvd3NlcnMgYWxzbyB0cmVhdCBvdGhlciBjb25maWd1cmF0aW9uc1xuLy8gb2YgY29kZSBwb2ludHMgYXMgYSBncm91cC5cbnZhciBleHRlbmRpbmdDaGFycyA9IC9bXFx1MDMwMC1cXHUwMzZmXFx1MDQ4My1cXHUwNDg5XFx1MDU5MS1cXHUwNWJkXFx1MDViZlxcdTA1YzFcXHUwNWMyXFx1MDVjNFxcdTA1YzVcXHUwNWM3XFx1MDYxMC1cXHUwNjFhXFx1MDY0Yi1cXHUwNjVlXFx1MDY3MFxcdTA2ZDYtXFx1MDZkY1xcdTA2ZGUtXFx1MDZlNFxcdTA2ZTdcXHUwNmU4XFx1MDZlYS1cXHUwNmVkXFx1MDcxMVxcdTA3MzAtXFx1MDc0YVxcdTA3YTYtXFx1MDdiMFxcdTA3ZWItXFx1MDdmM1xcdTA4MTYtXFx1MDgxOVxcdTA4MWItXFx1MDgyM1xcdTA4MjUtXFx1MDgyN1xcdTA4MjktXFx1MDgyZFxcdTA5MDAtXFx1MDkwMlxcdTA5M2NcXHUwOTQxLVxcdTA5NDhcXHUwOTRkXFx1MDk1MS1cXHUwOTU1XFx1MDk2MlxcdTA5NjNcXHUwOTgxXFx1MDliY1xcdTA5YmVcXHUwOWMxLVxcdTA5YzRcXHUwOWNkXFx1MDlkN1xcdTA5ZTJcXHUwOWUzXFx1MGEwMVxcdTBhMDJcXHUwYTNjXFx1MGE0MVxcdTBhNDJcXHUwYTQ3XFx1MGE0OFxcdTBhNGItXFx1MGE0ZFxcdTBhNTFcXHUwYTcwXFx1MGE3MVxcdTBhNzVcXHUwYTgxXFx1MGE4MlxcdTBhYmNcXHUwYWMxLVxcdTBhYzVcXHUwYWM3XFx1MGFjOFxcdTBhY2RcXHUwYWUyXFx1MGFlM1xcdTBiMDFcXHUwYjNjXFx1MGIzZVxcdTBiM2ZcXHUwYjQxLVxcdTBiNDRcXHUwYjRkXFx1MGI1NlxcdTBiNTdcXHUwYjYyXFx1MGI2M1xcdTBiODJcXHUwYmJlXFx1MGJjMFxcdTBiY2RcXHUwYmQ3XFx1MGMzZS1cXHUwYzQwXFx1MGM0Ni1cXHUwYzQ4XFx1MGM0YS1cXHUwYzRkXFx1MGM1NVxcdTBjNTZcXHUwYzYyXFx1MGM2M1xcdTBjYmNcXHUwY2JmXFx1MGNjMlxcdTBjYzZcXHUwY2NjXFx1MGNjZFxcdTBjZDVcXHUwY2Q2XFx1MGNlMlxcdTBjZTNcXHUwZDNlXFx1MGQ0MS1cXHUwZDQ0XFx1MGQ0ZFxcdTBkNTdcXHUwZDYyXFx1MGQ2M1xcdTBkY2FcXHUwZGNmXFx1MGRkMi1cXHUwZGQ0XFx1MGRkNlxcdTBkZGZcXHUwZTMxXFx1MGUzNC1cXHUwZTNhXFx1MGU0Ny1cXHUwZTRlXFx1MGViMVxcdTBlYjQtXFx1MGViOVxcdTBlYmJcXHUwZWJjXFx1MGVjOC1cXHUwZWNkXFx1MGYxOFxcdTBmMTlcXHUwZjM1XFx1MGYzN1xcdTBmMzlcXHUwZjcxLVxcdTBmN2VcXHUwZjgwLVxcdTBmODRcXHUwZjg2XFx1MGY4N1xcdTBmOTAtXFx1MGY5N1xcdTBmOTktXFx1MGZiY1xcdTBmYzZcXHUxMDJkLVxcdTEwMzBcXHUxMDMyLVxcdTEwMzdcXHUxMDM5XFx1MTAzYVxcdTEwM2RcXHUxMDNlXFx1MTA1OFxcdTEwNTlcXHUxMDVlLVxcdTEwNjBcXHUxMDcxLVxcdTEwNzRcXHUxMDgyXFx1MTA4NVxcdTEwODZcXHUxMDhkXFx1MTA5ZFxcdTEzNWZcXHUxNzEyLVxcdTE3MTRcXHUxNzMyLVxcdTE3MzRcXHUxNzUyXFx1MTc1M1xcdTE3NzJcXHUxNzczXFx1MTdiNy1cXHUxN2JkXFx1MTdjNlxcdTE3YzktXFx1MTdkM1xcdTE3ZGRcXHUxODBiLVxcdTE4MGRcXHUxOGE5XFx1MTkyMC1cXHUxOTIyXFx1MTkyN1xcdTE5MjhcXHUxOTMyXFx1MTkzOS1cXHUxOTNiXFx1MWExN1xcdTFhMThcXHUxYTU2XFx1MWE1OC1cXHUxYTVlXFx1MWE2MFxcdTFhNjJcXHUxYTY1LVxcdTFhNmNcXHUxYTczLVxcdTFhN2NcXHUxYTdmXFx1MWIwMC1cXHUxYjAzXFx1MWIzNFxcdTFiMzYtXFx1MWIzYVxcdTFiM2NcXHUxYjQyXFx1MWI2Yi1cXHUxYjczXFx1MWI4MFxcdTFiODFcXHUxYmEyLVxcdTFiYTVcXHUxYmE4XFx1MWJhOVxcdTFjMmMtXFx1MWMzM1xcdTFjMzZcXHUxYzM3XFx1MWNkMC1cXHUxY2QyXFx1MWNkNC1cXHUxY2UwXFx1MWNlMi1cXHUxY2U4XFx1MWNlZFxcdTFkYzAtXFx1MWRlNlxcdTFkZmQtXFx1MWRmZlxcdTIwMGNcXHUyMDBkXFx1MjBkMC1cXHUyMGYwXFx1MmNlZi1cXHUyY2YxXFx1MmRlMC1cXHUyZGZmXFx1MzAyYS1cXHUzMDJmXFx1MzA5OVxcdTMwOWFcXHVhNjZmLVxcdWE2NzJcXHVhNjdjXFx1YTY3ZFxcdWE2ZjBcXHVhNmYxXFx1YTgwMlxcdWE4MDZcXHVhODBiXFx1YTgyNVxcdWE4MjZcXHVhOGM0XFx1YThlMC1cXHVhOGYxXFx1YTkyNi1cXHVhOTJkXFx1YTk0Ny1cXHVhOTUxXFx1YTk4MC1cXHVhOTgyXFx1YTliM1xcdWE5YjYtXFx1YTliOVxcdWE5YmNcXHVhYTI5LVxcdWFhMmVcXHVhYTMxXFx1YWEzMlxcdWFhMzVcXHVhYTM2XFx1YWE0M1xcdWFhNGNcXHVhYWIwXFx1YWFiMi1cXHVhYWI0XFx1YWFiN1xcdWFhYjhcXHVhYWJlXFx1YWFiZlxcdWFhYzFcXHVhYmU1XFx1YWJlOFxcdWFiZWRcXHVkYzAwLVxcdWRmZmZcXHVmYjFlXFx1ZmUwMC1cXHVmZTBmXFx1ZmUyMC1cXHVmZTI2XFx1ZmY5ZVxcdWZmOWZdLztcbmZ1bmN0aW9uIGlzRXh0ZW5kaW5nQ2hhcihjaCkgeyByZXR1cm4gY2guY2hhckNvZGVBdCgwKSA+PSA3NjggJiYgZXh0ZW5kaW5nQ2hhcnMudGVzdChjaCkgfVxuXG4vLyBSZXR1cm5zIGEgbnVtYmVyIGZyb20gdGhlIHJhbmdlIFtgMGA7IGBzdHIubGVuZ3RoYF0gdW5sZXNzIGBwb3NgIGlzIG91dHNpZGUgdGhhdCByYW5nZS5cbmZ1bmN0aW9uIHNraXBFeHRlbmRpbmdDaGFycyhzdHIsIHBvcywgZGlyKSB7XG4gIHdoaWxlICgoZGlyIDwgMCA/IHBvcyA+IDAgOiBwb3MgPCBzdHIubGVuZ3RoKSAmJiBpc0V4dGVuZGluZ0NoYXIoc3RyLmNoYXJBdChwb3MpKSkgeyBwb3MgKz0gZGlyOyB9XG4gIHJldHVybiBwb3Ncbn1cblxuLy8gUmV0dXJucyB0aGUgdmFsdWUgZnJvbSB0aGUgcmFuZ2UgW2Bmcm9tYDsgYHRvYF0gdGhhdCBzYXRpc2ZpZXNcbi8vIGBwcmVkYCBhbmQgaXMgY2xvc2VzdCB0byBgZnJvbWAuIEFzc3VtZXMgdGhhdCBhdCBsZWFzdCBgdG9gXG4vLyBzYXRpc2ZpZXMgYHByZWRgLiBTdXBwb3J0cyBgZnJvbWAgYmVpbmcgZ3JlYXRlciB0aGFuIGB0b2AuXG5mdW5jdGlvbiBmaW5kRmlyc3QocHJlZCwgZnJvbSwgdG8pIHtcbiAgLy8gQXQgYW55IHBvaW50IHdlIGFyZSBjZXJ0YWluIGB0b2Agc2F0aXNmaWVzIGBwcmVkYCwgZG9uJ3Qga25vd1xuICAvLyB3aGV0aGVyIGBmcm9tYCBkb2VzLlxuICB2YXIgZGlyID0gZnJvbSA+IHRvID8gLTEgOiAxO1xuICBmb3IgKDs7KSB7XG4gICAgaWYgKGZyb20gPT0gdG8pIHsgcmV0dXJuIGZyb20gfVxuICAgIHZhciBtaWRGID0gKGZyb20gKyB0bykgLyAyLCBtaWQgPSBkaXIgPCAwID8gTWF0aC5jZWlsKG1pZEYpIDogTWF0aC5mbG9vcihtaWRGKTtcbiAgICBpZiAobWlkID09IGZyb20pIHsgcmV0dXJuIHByZWQobWlkKSA/IGZyb20gOiB0byB9XG4gICAgaWYgKHByZWQobWlkKSkgeyB0byA9IG1pZDsgfVxuICAgIGVsc2UgeyBmcm9tID0gbWlkICsgZGlyOyB9XG4gIH1cbn1cblxuLy8gVGhlIGRpc3BsYXkgaGFuZGxlcyB0aGUgRE9NIGludGVncmF0aW9uLCBib3RoIGZvciBpbnB1dCByZWFkaW5nXG4vLyBhbmQgY29udGVudCBkcmF3aW5nLiBJdCBob2xkcyByZWZlcmVuY2VzIHRvIERPTSBub2RlcyBhbmRcbi8vIGRpc3BsYXktcmVsYXRlZCBzdGF0ZS5cblxuZnVuY3Rpb24gRGlzcGxheShwbGFjZSwgZG9jLCBpbnB1dCkge1xuICB2YXIgZCA9IHRoaXM7XG4gIHRoaXMuaW5wdXQgPSBpbnB1dDtcblxuICAvLyBDb3ZlcnMgYm90dG9tLXJpZ2h0IHNxdWFyZSB3aGVuIGJvdGggc2Nyb2xsYmFycyBhcmUgcHJlc2VudC5cbiAgZC5zY3JvbGxiYXJGaWxsZXIgPSBlbHQoXCJkaXZcIiwgbnVsbCwgXCJDb2RlTWlycm9yLXNjcm9sbGJhci1maWxsZXJcIik7XG4gIGQuc2Nyb2xsYmFyRmlsbGVyLnNldEF0dHJpYnV0ZShcImNtLW5vdC1jb250ZW50XCIsIFwidHJ1ZVwiKTtcbiAgLy8gQ292ZXJzIGJvdHRvbSBvZiBndXR0ZXIgd2hlbiBjb3Zlckd1dHRlck5leHRUb1Njcm9sbGJhciBpcyBvblxuICAvLyBhbmQgaCBzY3JvbGxiYXIgaXMgcHJlc2VudC5cbiAgZC5ndXR0ZXJGaWxsZXIgPSBlbHQoXCJkaXZcIiwgbnVsbCwgXCJDb2RlTWlycm9yLWd1dHRlci1maWxsZXJcIik7XG4gIGQuZ3V0dGVyRmlsbGVyLnNldEF0dHJpYnV0ZShcImNtLW5vdC1jb250ZW50XCIsIFwidHJ1ZVwiKTtcbiAgLy8gV2lsbCBjb250YWluIHRoZSBhY3R1YWwgY29kZSwgcG9zaXRpb25lZCB0byBjb3ZlciB0aGUgdmlld3BvcnQuXG4gIGQubGluZURpdiA9IGVsdFAoXCJkaXZcIiwgbnVsbCwgXCJDb2RlTWlycm9yLWNvZGVcIik7XG4gIC8vIEVsZW1lbnRzIGFyZSBhZGRlZCB0byB0aGVzZSB0byByZXByZXNlbnQgc2VsZWN0aW9uIGFuZCBjdXJzb3JzLlxuICBkLnNlbGVjdGlvbkRpdiA9IGVsdChcImRpdlwiLCBudWxsLCBudWxsLCBcInBvc2l0aW9uOiByZWxhdGl2ZTsgei1pbmRleDogMVwiKTtcbiAgZC5jdXJzb3JEaXYgPSBlbHQoXCJkaXZcIiwgbnVsbCwgXCJDb2RlTWlycm9yLWN1cnNvcnNcIik7XG4gIC8vIEEgdmlzaWJpbGl0eTogaGlkZGVuIGVsZW1lbnQgdXNlZCB0byBmaW5kIHRoZSBzaXplIG9mIHRoaW5ncy5cbiAgZC5tZWFzdXJlID0gZWx0KFwiZGl2XCIsIG51bGwsIFwiQ29kZU1pcnJvci1tZWFzdXJlXCIpO1xuICAvLyBXaGVuIGxpbmVzIG91dHNpZGUgb2YgdGhlIHZpZXdwb3J0IGFyZSBtZWFzdXJlZCwgdGhleSBhcmUgZHJhd24gaW4gdGhpcy5cbiAgZC5saW5lTWVhc3VyZSA9IGVsdChcImRpdlwiLCBudWxsLCBcIkNvZGVNaXJyb3ItbWVhc3VyZVwiKTtcbiAgLy8gV3JhcHMgZXZlcnl0aGluZyB0aGF0IG5lZWRzIHRvIGV4aXN0IGluc2lkZSB0aGUgdmVydGljYWxseS1wYWRkZWQgY29vcmRpbmF0ZSBzeXN0ZW1cbiAgZC5saW5lU3BhY2UgPSBlbHRQKFwiZGl2XCIsIFtkLm1lYXN1cmUsIGQubGluZU1lYXN1cmUsIGQuc2VsZWN0aW9uRGl2LCBkLmN1cnNvckRpdiwgZC5saW5lRGl2XSxcbiAgICAgICAgICAgICAgICAgICAgbnVsbCwgXCJwb3NpdGlvbjogcmVsYXRpdmU7IG91dGxpbmU6IG5vbmVcIik7XG4gIHZhciBsaW5lcyA9IGVsdFAoXCJkaXZcIiwgW2QubGluZVNwYWNlXSwgXCJDb2RlTWlycm9yLWxpbmVzXCIpO1xuICAvLyBNb3ZlZCBhcm91bmQgaXRzIHBhcmVudCB0byBjb3ZlciB2aXNpYmxlIHZpZXcuXG4gIGQubW92ZXIgPSBlbHQoXCJkaXZcIiwgW2xpbmVzXSwgbnVsbCwgXCJwb3NpdGlvbjogcmVsYXRpdmVcIik7XG4gIC8vIFNldCB0byB0aGUgaGVpZ2h0IG9mIHRoZSBkb2N1bWVudCwgYWxsb3dpbmcgc2Nyb2xsaW5nLlxuICBkLnNpemVyID0gZWx0KFwiZGl2XCIsIFtkLm1vdmVyXSwgXCJDb2RlTWlycm9yLXNpemVyXCIpO1xuICBkLnNpemVyV2lkdGggPSBudWxsO1xuICAvLyBCZWhhdmlvciBvZiBlbHRzIHdpdGggb3ZlcmZsb3c6IGF1dG8gYW5kIHBhZGRpbmcgaXNcbiAgLy8gaW5jb25zaXN0ZW50IGFjcm9zcyBicm93c2Vycy4gVGhpcyBpcyB1c2VkIHRvIGVuc3VyZSB0aGVcbiAgLy8gc2Nyb2xsYWJsZSBhcmVhIGlzIGJpZyBlbm91Z2guXG4gIGQuaGVpZ2h0Rm9yY2VyID0gZWx0KFwiZGl2XCIsIG51bGwsIG51bGwsIFwicG9zaXRpb246IGFic29sdXRlOyBoZWlnaHQ6IFwiICsgc2Nyb2xsZXJHYXAgKyBcInB4OyB3aWR0aDogMXB4O1wiKTtcbiAgLy8gV2lsbCBjb250YWluIHRoZSBndXR0ZXJzLCBpZiBhbnkuXG4gIGQuZ3V0dGVycyA9IGVsdChcImRpdlwiLCBudWxsLCBcIkNvZGVNaXJyb3ItZ3V0dGVyc1wiKTtcbiAgZC5saW5lR3V0dGVyID0gbnVsbDtcbiAgLy8gQWN0dWFsIHNjcm9sbGFibGUgZWxlbWVudC5cbiAgZC5zY3JvbGxlciA9IGVsdChcImRpdlwiLCBbZC5zaXplciwgZC5oZWlnaHRGb3JjZXIsIGQuZ3V0dGVyc10sIFwiQ29kZU1pcnJvci1zY3JvbGxcIik7XG4gIGQuc2Nyb2xsZXIuc2V0QXR0cmlidXRlKFwidGFiSW5kZXhcIiwgXCItMVwiKTtcbiAgLy8gVGhlIGVsZW1lbnQgaW4gd2hpY2ggdGhlIGVkaXRvciBsaXZlcy5cbiAgZC53cmFwcGVyID0gZWx0KFwiZGl2XCIsIFtkLnNjcm9sbGJhckZpbGxlciwgZC5ndXR0ZXJGaWxsZXIsIGQuc2Nyb2xsZXJdLCBcIkNvZGVNaXJyb3JcIik7XG5cbiAgLy8gV29yayBhcm91bmQgSUU3IHotaW5kZXggYnVnIChub3QgcGVyZmVjdCwgaGVuY2UgSUU3IG5vdCByZWFsbHkgYmVpbmcgc3VwcG9ydGVkKVxuICBpZiAoaWUgJiYgaWVfdmVyc2lvbiA8IDgpIHsgZC5ndXR0ZXJzLnN0eWxlLnpJbmRleCA9IC0xOyBkLnNjcm9sbGVyLnN0eWxlLnBhZGRpbmdSaWdodCA9IDA7IH1cbiAgaWYgKCF3ZWJraXQgJiYgIShnZWNrbyAmJiBtb2JpbGUpKSB7IGQuc2Nyb2xsZXIuZHJhZ2dhYmxlID0gdHJ1ZTsgfVxuXG4gIGlmIChwbGFjZSkge1xuICAgIGlmIChwbGFjZS5hcHBlbmRDaGlsZCkgeyBwbGFjZS5hcHBlbmRDaGlsZChkLndyYXBwZXIpOyB9XG4gICAgZWxzZSB7IHBsYWNlKGQud3JhcHBlcik7IH1cbiAgfVxuXG4gIC8vIEN1cnJlbnQgcmVuZGVyZWQgcmFuZ2UgKG1heSBiZSBiaWdnZXIgdGhhbiB0aGUgdmlldyB3aW5kb3cpLlxuICBkLnZpZXdGcm9tID0gZC52aWV3VG8gPSBkb2MuZmlyc3Q7XG4gIGQucmVwb3J0ZWRWaWV3RnJvbSA9IGQucmVwb3J0ZWRWaWV3VG8gPSBkb2MuZmlyc3Q7XG4gIC8vIEluZm9ybWF0aW9uIGFib3V0IHRoZSByZW5kZXJlZCBsaW5lcy5cbiAgZC52aWV3ID0gW107XG4gIGQucmVuZGVyZWRWaWV3ID0gbnVsbDtcbiAgLy8gSG9sZHMgaW5mbyBhYm91dCBhIHNpbmdsZSByZW5kZXJlZCBsaW5lIHdoZW4gaXQgd2FzIHJlbmRlcmVkXG4gIC8vIGZvciBtZWFzdXJlbWVudCwgd2hpbGUgbm90IGluIHZpZXcuXG4gIGQuZXh0ZXJuYWxNZWFzdXJlZCA9IG51bGw7XG4gIC8vIEVtcHR5IHNwYWNlIChpbiBwaXhlbHMpIGFib3ZlIHRoZSB2aWV3XG4gIGQudmlld09mZnNldCA9IDA7XG4gIGQubGFzdFdyYXBIZWlnaHQgPSBkLmxhc3RXcmFwV2lkdGggPSAwO1xuICBkLnVwZGF0ZUxpbmVOdW1iZXJzID0gbnVsbDtcblxuICBkLm5hdGl2ZUJhcldpZHRoID0gZC5iYXJIZWlnaHQgPSBkLmJhcldpZHRoID0gMDtcbiAgZC5zY3JvbGxiYXJzQ2xpcHBlZCA9IGZhbHNlO1xuXG4gIC8vIFVzZWQgdG8gb25seSByZXNpemUgdGhlIGxpbmUgbnVtYmVyIGd1dHRlciB3aGVuIG5lY2Vzc2FyeSAod2hlblxuICAvLyB0aGUgYW1vdW50IG9mIGxpbmVzIGNyb3NzZXMgYSBib3VuZGFyeSB0aGF0IG1ha2VzIGl0cyB3aWR0aCBjaGFuZ2UpXG4gIGQubGluZU51bVdpZHRoID0gZC5saW5lTnVtSW5uZXJXaWR0aCA9IGQubGluZU51bUNoYXJzID0gbnVsbDtcbiAgLy8gU2V0IHRvIHRydWUgd2hlbiBhIG5vbi1ob3Jpem9udGFsLXNjcm9sbGluZyBsaW5lIHdpZGdldCBpc1xuICAvLyBhZGRlZC4gQXMgYW4gb3B0aW1pemF0aW9uLCBsaW5lIHdpZGdldCBhbGlnbmluZyBpcyBza2lwcGVkIHdoZW5cbiAgLy8gdGhpcyBpcyBmYWxzZS5cbiAgZC5hbGlnbldpZGdldHMgPSBmYWxzZTtcblxuICBkLmNhY2hlZENoYXJXaWR0aCA9IGQuY2FjaGVkVGV4dEhlaWdodCA9IGQuY2FjaGVkUGFkZGluZ0ggPSBudWxsO1xuXG4gIC8vIFRyYWNrcyB0aGUgbWF4aW11bSBsaW5lIGxlbmd0aCBzbyB0aGF0IHRoZSBob3Jpem9udGFsIHNjcm9sbGJhclxuICAvLyBjYW4gYmUga2VwdCBzdGF0aWMgd2hlbiBzY3JvbGxpbmcuXG4gIGQubWF4TGluZSA9IG51bGw7XG4gIGQubWF4TGluZUxlbmd0aCA9IDA7XG4gIGQubWF4TGluZUNoYW5nZWQgPSBmYWxzZTtcblxuICAvLyBVc2VkIGZvciBtZWFzdXJpbmcgd2hlZWwgc2Nyb2xsaW5nIGdyYW51bGFyaXR5XG4gIGQud2hlZWxEWCA9IGQud2hlZWxEWSA9IGQud2hlZWxTdGFydFggPSBkLndoZWVsU3RhcnRZID0gbnVsbDtcblxuICAvLyBUcnVlIHdoZW4gc2hpZnQgaXMgaGVsZCBkb3duLlxuICBkLnNoaWZ0ID0gZmFsc2U7XG5cbiAgLy8gVXNlZCB0byB0cmFjayB3aGV0aGVyIGFueXRoaW5nIGhhcHBlbmVkIHNpbmNlIHRoZSBjb250ZXh0IG1lbnVcbiAgLy8gd2FzIG9wZW5lZC5cbiAgZC5zZWxGb3JDb250ZXh0TWVudSA9IG51bGw7XG5cbiAgZC5hY3RpdmVUb3VjaCA9IG51bGw7XG5cbiAgaW5wdXQuaW5pdChkKTtcbn1cblxuLy8gRmluZCB0aGUgbGluZSBvYmplY3QgY29ycmVzcG9uZGluZyB0byB0aGUgZ2l2ZW4gbGluZSBudW1iZXIuXG5mdW5jdGlvbiBnZXRMaW5lKGRvYywgbikge1xuICBuIC09IGRvYy5maXJzdDtcbiAgaWYgKG4gPCAwIHx8IG4gPj0gZG9jLnNpemUpIHsgdGhyb3cgbmV3IEVycm9yKFwiVGhlcmUgaXMgbm8gbGluZSBcIiArIChuICsgZG9jLmZpcnN0KSArIFwiIGluIHRoZSBkb2N1bWVudC5cIikgfVxuICB2YXIgY2h1bmsgPSBkb2M7XG4gIHdoaWxlICghY2h1bmsubGluZXMpIHtcbiAgICBmb3IgKHZhciBpID0gMDs7ICsraSkge1xuICAgICAgdmFyIGNoaWxkID0gY2h1bmsuY2hpbGRyZW5baV0sIHN6ID0gY2hpbGQuY2h1bmtTaXplKCk7XG4gICAgICBpZiAobiA8IHN6KSB7IGNodW5rID0gY2hpbGQ7IGJyZWFrIH1cbiAgICAgIG4gLT0gc3o7XG4gICAgfVxuICB9XG4gIHJldHVybiBjaHVuay5saW5lc1tuXVxufVxuXG4vLyBHZXQgdGhlIHBhcnQgb2YgYSBkb2N1bWVudCBiZXR3ZWVuIHR3byBwb3NpdGlvbnMsIGFzIGFuIGFycmF5IG9mXG4vLyBzdHJpbmdzLlxuZnVuY3Rpb24gZ2V0QmV0d2Vlbihkb2MsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIG91dCA9IFtdLCBuID0gc3RhcnQubGluZTtcbiAgZG9jLml0ZXIoc3RhcnQubGluZSwgZW5kLmxpbmUgKyAxLCBmdW5jdGlvbiAobGluZSkge1xuICAgIHZhciB0ZXh0ID0gbGluZS50ZXh0O1xuICAgIGlmIChuID09IGVuZC5saW5lKSB7IHRleHQgPSB0ZXh0LnNsaWNlKDAsIGVuZC5jaCk7IH1cbiAgICBpZiAobiA9PSBzdGFydC5saW5lKSB7IHRleHQgPSB0ZXh0LnNsaWNlKHN0YXJ0LmNoKTsgfVxuICAgIG91dC5wdXNoKHRleHQpO1xuICAgICsrbjtcbiAgfSk7XG4gIHJldHVybiBvdXRcbn1cbi8vIEdldCB0aGUgbGluZXMgYmV0d2VlbiBmcm9tIGFuZCB0bywgYXMgYXJyYXkgb2Ygc3RyaW5ncy5cbmZ1bmN0aW9uIGdldExpbmVzKGRvYywgZnJvbSwgdG8pIHtcbiAgdmFyIG91dCA9IFtdO1xuICBkb2MuaXRlcihmcm9tLCB0bywgZnVuY3Rpb24gKGxpbmUpIHsgb3V0LnB1c2gobGluZS50ZXh0KTsgfSk7IC8vIGl0ZXIgYWJvcnRzIHdoZW4gY2FsbGJhY2sgcmV0dXJucyB0cnV0aHkgdmFsdWVcbiAgcmV0dXJuIG91dFxufVxuXG4vLyBVcGRhdGUgdGhlIGhlaWdodCBvZiBhIGxpbmUsIHByb3BhZ2F0aW5nIHRoZSBoZWlnaHQgY2hhbmdlXG4vLyB1cHdhcmRzIHRvIHBhcmVudCBub2Rlcy5cbmZ1bmN0aW9uIHVwZGF0ZUxpbmVIZWlnaHQobGluZSwgaGVpZ2h0KSB7XG4gIHZhciBkaWZmID0gaGVpZ2h0IC0gbGluZS5oZWlnaHQ7XG4gIGlmIChkaWZmKSB7IGZvciAodmFyIG4gPSBsaW5lOyBuOyBuID0gbi5wYXJlbnQpIHsgbi5oZWlnaHQgKz0gZGlmZjsgfSB9XG59XG5cbi8vIEdpdmVuIGEgbGluZSBvYmplY3QsIGZpbmQgaXRzIGxpbmUgbnVtYmVyIGJ5IHdhbGtpbmcgdXAgdGhyb3VnaFxuLy8gaXRzIHBhcmVudCBsaW5rcy5cbmZ1bmN0aW9uIGxpbmVObyhsaW5lKSB7XG4gIGlmIChsaW5lLnBhcmVudCA9PSBudWxsKSB7IHJldHVybiBudWxsIH1cbiAgdmFyIGN1ciA9IGxpbmUucGFyZW50LCBubyA9IGluZGV4T2YoY3VyLmxpbmVzLCBsaW5lKTtcbiAgZm9yICh2YXIgY2h1bmsgPSBjdXIucGFyZW50OyBjaHVuazsgY3VyID0gY2h1bmssIGNodW5rID0gY2h1bmsucGFyZW50KSB7XG4gICAgZm9yICh2YXIgaSA9IDA7OyArK2kpIHtcbiAgICAgIGlmIChjaHVuay5jaGlsZHJlbltpXSA9PSBjdXIpIHsgYnJlYWsgfVxuICAgICAgbm8gKz0gY2h1bmsuY2hpbGRyZW5baV0uY2h1bmtTaXplKCk7XG4gICAgfVxuICB9XG4gIHJldHVybiBubyArIGN1ci5maXJzdFxufVxuXG4vLyBGaW5kIHRoZSBsaW5lIGF0IHRoZSBnaXZlbiB2ZXJ0aWNhbCBwb3NpdGlvbiwgdXNpbmcgdGhlIGhlaWdodFxuLy8gaW5mb3JtYXRpb24gaW4gdGhlIGRvY3VtZW50IHRyZWUuXG5mdW5jdGlvbiBsaW5lQXRIZWlnaHQoY2h1bmssIGgpIHtcbiAgdmFyIG4gPSBjaHVuay5maXJzdDtcbiAgb3V0ZXI6IGRvIHtcbiAgICBmb3IgKHZhciBpJDEgPSAwOyBpJDEgPCBjaHVuay5jaGlsZHJlbi5sZW5ndGg7ICsraSQxKSB7XG4gICAgICB2YXIgY2hpbGQgPSBjaHVuay5jaGlsZHJlbltpJDFdLCBjaCA9IGNoaWxkLmhlaWdodDtcbiAgICAgIGlmIChoIDwgY2gpIHsgY2h1bmsgPSBjaGlsZDsgY29udGludWUgb3V0ZXIgfVxuICAgICAgaCAtPSBjaDtcbiAgICAgIG4gKz0gY2hpbGQuY2h1bmtTaXplKCk7XG4gICAgfVxuICAgIHJldHVybiBuXG4gIH0gd2hpbGUgKCFjaHVuay5saW5lcylcbiAgdmFyIGkgPSAwO1xuICBmb3IgKDsgaSA8IGNodW5rLmxpbmVzLmxlbmd0aDsgKytpKSB7XG4gICAgdmFyIGxpbmUgPSBjaHVuay5saW5lc1tpXSwgbGggPSBsaW5lLmhlaWdodDtcbiAgICBpZiAoaCA8IGxoKSB7IGJyZWFrIH1cbiAgICBoIC09IGxoO1xuICB9XG4gIHJldHVybiBuICsgaVxufVxuXG5mdW5jdGlvbiBpc0xpbmUoZG9jLCBsKSB7cmV0dXJuIGwgPj0gZG9jLmZpcnN0ICYmIGwgPCBkb2MuZmlyc3QgKyBkb2Muc2l6ZX1cblxuZnVuY3Rpb24gbGluZU51bWJlckZvcihvcHRpb25zLCBpKSB7XG4gIHJldHVybiBTdHJpbmcob3B0aW9ucy5saW5lTnVtYmVyRm9ybWF0dGVyKGkgKyBvcHRpb25zLmZpcnN0TGluZU51bWJlcikpXG59XG5cbi8vIEEgUG9zIGluc3RhbmNlIHJlcHJlc2VudHMgYSBwb3NpdGlvbiB3aXRoaW4gdGhlIHRleHQuXG5mdW5jdGlvbiBQb3MobGluZSwgY2gsIHN0aWNreSkge1xuICBpZiAoIHN0aWNreSA9PT0gdm9pZCAwICkgc3RpY2t5ID0gbnVsbDtcblxuICBpZiAoISh0aGlzIGluc3RhbmNlb2YgUG9zKSkgeyByZXR1cm4gbmV3IFBvcyhsaW5lLCBjaCwgc3RpY2t5KSB9XG4gIHRoaXMubGluZSA9IGxpbmU7XG4gIHRoaXMuY2ggPSBjaDtcbiAgdGhpcy5zdGlja3kgPSBzdGlja3k7XG59XG5cbi8vIENvbXBhcmUgdHdvIHBvc2l0aW9ucywgcmV0dXJuIDAgaWYgdGhleSBhcmUgdGhlIHNhbWUsIGEgbmVnYXRpdmVcbi8vIG51bWJlciB3aGVuIGEgaXMgbGVzcywgYW5kIGEgcG9zaXRpdmUgbnVtYmVyIG90aGVyd2lzZS5cbmZ1bmN0aW9uIGNtcChhLCBiKSB7IHJldHVybiBhLmxpbmUgLSBiLmxpbmUgfHwgYS5jaCAtIGIuY2ggfVxuXG5mdW5jdGlvbiBlcXVhbEN1cnNvclBvcyhhLCBiKSB7IHJldHVybiBhLnN0aWNreSA9PSBiLnN0aWNreSAmJiBjbXAoYSwgYikgPT0gMCB9XG5cbmZ1bmN0aW9uIGNvcHlQb3MoeCkge3JldHVybiBQb3MoeC5saW5lLCB4LmNoKX1cbmZ1bmN0aW9uIG1heFBvcyhhLCBiKSB7IHJldHVybiBjbXAoYSwgYikgPCAwID8gYiA6IGEgfVxuZnVuY3Rpb24gbWluUG9zKGEsIGIpIHsgcmV0dXJuIGNtcChhLCBiKSA8IDAgPyBhIDogYiB9XG5cbi8vIE1vc3Qgb2YgdGhlIGV4dGVybmFsIEFQSSBjbGlwcyBnaXZlbiBwb3NpdGlvbnMgdG8gbWFrZSBzdXJlIHRoZXlcbi8vIGFjdHVhbGx5IGV4aXN0IHdpdGhpbiB0aGUgZG9jdW1lbnQuXG5mdW5jdGlvbiBjbGlwTGluZShkb2MsIG4pIHtyZXR1cm4gTWF0aC5tYXgoZG9jLmZpcnN0LCBNYXRoLm1pbihuLCBkb2MuZmlyc3QgKyBkb2Muc2l6ZSAtIDEpKX1cbmZ1bmN0aW9uIGNsaXBQb3MoZG9jLCBwb3MpIHtcbiAgaWYgKHBvcy5saW5lIDwgZG9jLmZpcnN0KSB7IHJldHVybiBQb3MoZG9jLmZpcnN0LCAwKSB9XG4gIHZhciBsYXN0ID0gZG9jLmZpcnN0ICsgZG9jLnNpemUgLSAxO1xuICBpZiAocG9zLmxpbmUgPiBsYXN0KSB7IHJldHVybiBQb3MobGFzdCwgZ2V0TGluZShkb2MsIGxhc3QpLnRleHQubGVuZ3RoKSB9XG4gIHJldHVybiBjbGlwVG9MZW4ocG9zLCBnZXRMaW5lKGRvYywgcG9zLmxpbmUpLnRleHQubGVuZ3RoKVxufVxuZnVuY3Rpb24gY2xpcFRvTGVuKHBvcywgbGluZWxlbikge1xuICB2YXIgY2ggPSBwb3MuY2g7XG4gIGlmIChjaCA9PSBudWxsIHx8IGNoID4gbGluZWxlbikgeyByZXR1cm4gUG9zKHBvcy5saW5lLCBsaW5lbGVuKSB9XG4gIGVsc2UgaWYgKGNoIDwgMCkgeyByZXR1cm4gUG9zKHBvcy5saW5lLCAwKSB9XG4gIGVsc2UgeyByZXR1cm4gcG9zIH1cbn1cbmZ1bmN0aW9uIGNsaXBQb3NBcnJheShkb2MsIGFycmF5KSB7XG4gIHZhciBvdXQgPSBbXTtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcnJheS5sZW5ndGg7IGkrKykgeyBvdXRbaV0gPSBjbGlwUG9zKGRvYywgYXJyYXlbaV0pOyB9XG4gIHJldHVybiBvdXRcbn1cblxuLy8gT3B0aW1pemUgc29tZSBjb2RlIHdoZW4gdGhlc2UgZmVhdHVyZXMgYXJlIG5vdCB1c2VkLlxudmFyIHNhd1JlYWRPbmx5U3BhbnMgPSBmYWxzZTtcbnZhciBzYXdDb2xsYXBzZWRTcGFucyA9IGZhbHNlO1xuXG5mdW5jdGlvbiBzZWVSZWFkT25seVNwYW5zKCkge1xuICBzYXdSZWFkT25seVNwYW5zID0gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gc2VlQ29sbGFwc2VkU3BhbnMoKSB7XG4gIHNhd0NvbGxhcHNlZFNwYW5zID0gdHJ1ZTtcbn1cblxuLy8gVEVYVE1BUktFUiBTUEFOU1xuXG5mdW5jdGlvbiBNYXJrZWRTcGFuKG1hcmtlciwgZnJvbSwgdG8pIHtcbiAgdGhpcy5tYXJrZXIgPSBtYXJrZXI7XG4gIHRoaXMuZnJvbSA9IGZyb207IHRoaXMudG8gPSB0bztcbn1cblxuLy8gU2VhcmNoIGFuIGFycmF5IG9mIHNwYW5zIGZvciBhIHNwYW4gbWF0Y2hpbmcgdGhlIGdpdmVuIG1hcmtlci5cbmZ1bmN0aW9uIGdldE1hcmtlZFNwYW5Gb3Ioc3BhbnMsIG1hcmtlcikge1xuICBpZiAoc3BhbnMpIHsgZm9yICh2YXIgaSA9IDA7IGkgPCBzcGFucy5sZW5ndGg7ICsraSkge1xuICAgIHZhciBzcGFuID0gc3BhbnNbaV07XG4gICAgaWYgKHNwYW4ubWFya2VyID09IG1hcmtlcikgeyByZXR1cm4gc3BhbiB9XG4gIH0gfVxufVxuLy8gUmVtb3ZlIGEgc3BhbiBmcm9tIGFuIGFycmF5LCByZXR1cm5pbmcgdW5kZWZpbmVkIGlmIG5vIHNwYW5zIGFyZVxuLy8gbGVmdCAod2UgZG9uJ3Qgc3RvcmUgYXJyYXlzIGZvciBsaW5lcyB3aXRob3V0IHNwYW5zKS5cbmZ1bmN0aW9uIHJlbW92ZU1hcmtlZFNwYW4oc3BhbnMsIHNwYW4pIHtcbiAgdmFyIHI7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc3BhbnMubGVuZ3RoOyArK2kpXG4gICAgeyBpZiAoc3BhbnNbaV0gIT0gc3BhbikgeyAociB8fCAociA9IFtdKSkucHVzaChzcGFuc1tpXSk7IH0gfVxuICByZXR1cm4gclxufVxuLy8gQWRkIGEgc3BhbiB0byBhIGxpbmUuXG5mdW5jdGlvbiBhZGRNYXJrZWRTcGFuKGxpbmUsIHNwYW4pIHtcbiAgbGluZS5tYXJrZWRTcGFucyA9IGxpbmUubWFya2VkU3BhbnMgPyBsaW5lLm1hcmtlZFNwYW5zLmNvbmNhdChbc3Bhbl0pIDogW3NwYW5dO1xuICBzcGFuLm1hcmtlci5hdHRhY2hMaW5lKGxpbmUpO1xufVxuXG4vLyBVc2VkIGZvciB0aGUgYWxnb3JpdGhtIHRoYXQgYWRqdXN0cyBtYXJrZXJzIGZvciBhIGNoYW5nZSBpbiB0aGVcbi8vIGRvY3VtZW50LiBUaGVzZSBmdW5jdGlvbnMgY3V0IGFuIGFycmF5IG9mIHNwYW5zIGF0IGEgZ2l2ZW5cbi8vIGNoYXJhY3RlciBwb3NpdGlvbiwgcmV0dXJuaW5nIGFuIGFycmF5IG9mIHJlbWFpbmluZyBjaHVua3MgKG9yXG4vLyB1bmRlZmluZWQgaWYgbm90aGluZyByZW1haW5zKS5cbmZ1bmN0aW9uIG1hcmtlZFNwYW5zQmVmb3JlKG9sZCwgc3RhcnRDaCwgaXNJbnNlcnQpIHtcbiAgdmFyIG53O1xuICBpZiAob2xkKSB7IGZvciAodmFyIGkgPSAwOyBpIDwgb2xkLmxlbmd0aDsgKytpKSB7XG4gICAgdmFyIHNwYW4gPSBvbGRbaV0sIG1hcmtlciA9IHNwYW4ubWFya2VyO1xuICAgIHZhciBzdGFydHNCZWZvcmUgPSBzcGFuLmZyb20gPT0gbnVsbCB8fCAobWFya2VyLmluY2x1c2l2ZUxlZnQgPyBzcGFuLmZyb20gPD0gc3RhcnRDaCA6IHNwYW4uZnJvbSA8IHN0YXJ0Q2gpO1xuICAgIGlmIChzdGFydHNCZWZvcmUgfHwgc3Bhbi5mcm9tID09IHN0YXJ0Q2ggJiYgbWFya2VyLnR5cGUgPT0gXCJib29rbWFya1wiICYmICghaXNJbnNlcnQgfHwgIXNwYW4ubWFya2VyLmluc2VydExlZnQpKSB7XG4gICAgICB2YXIgZW5kc0FmdGVyID0gc3Bhbi50byA9PSBudWxsIHx8IChtYXJrZXIuaW5jbHVzaXZlUmlnaHQgPyBzcGFuLnRvID49IHN0YXJ0Q2ggOiBzcGFuLnRvID4gc3RhcnRDaCk7KG53IHx8IChudyA9IFtdKSkucHVzaChuZXcgTWFya2VkU3BhbihtYXJrZXIsIHNwYW4uZnJvbSwgZW5kc0FmdGVyID8gbnVsbCA6IHNwYW4udG8pKTtcbiAgICB9XG4gIH0gfVxuICByZXR1cm4gbndcbn1cbmZ1bmN0aW9uIG1hcmtlZFNwYW5zQWZ0ZXIob2xkLCBlbmRDaCwgaXNJbnNlcnQpIHtcbiAgdmFyIG53O1xuICBpZiAob2xkKSB7IGZvciAodmFyIGkgPSAwOyBpIDwgb2xkLmxlbmd0aDsgKytpKSB7XG4gICAgdmFyIHNwYW4gPSBvbGRbaV0sIG1hcmtlciA9IHNwYW4ubWFya2VyO1xuICAgIHZhciBlbmRzQWZ0ZXIgPSBzcGFuLnRvID09IG51bGwgfHwgKG1hcmtlci5pbmNsdXNpdmVSaWdodCA/IHNwYW4udG8gPj0gZW5kQ2ggOiBzcGFuLnRvID4gZW5kQ2gpO1xuICAgIGlmIChlbmRzQWZ0ZXIgfHwgc3Bhbi5mcm9tID09IGVuZENoICYmIG1hcmtlci50eXBlID09IFwiYm9va21hcmtcIiAmJiAoIWlzSW5zZXJ0IHx8IHNwYW4ubWFya2VyLmluc2VydExlZnQpKSB7XG4gICAgICB2YXIgc3RhcnRzQmVmb3JlID0gc3Bhbi5mcm9tID09IG51bGwgfHwgKG1hcmtlci5pbmNsdXNpdmVMZWZ0ID8gc3Bhbi5mcm9tIDw9IGVuZENoIDogc3Bhbi5mcm9tIDwgZW5kQ2gpOyhudyB8fCAobncgPSBbXSkpLnB1c2gobmV3IE1hcmtlZFNwYW4obWFya2VyLCBzdGFydHNCZWZvcmUgPyBudWxsIDogc3Bhbi5mcm9tIC0gZW5kQ2gsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNwYW4udG8gPT0gbnVsbCA/IG51bGwgOiBzcGFuLnRvIC0gZW5kQ2gpKTtcbiAgICB9XG4gIH0gfVxuICByZXR1cm4gbndcbn1cblxuLy8gR2l2ZW4gYSBjaGFuZ2Ugb2JqZWN0LCBjb21wdXRlIHRoZSBuZXcgc2V0IG9mIG1hcmtlciBzcGFucyB0aGF0XG4vLyBjb3ZlciB0aGUgbGluZSBpbiB3aGljaCB0aGUgY2hhbmdlIHRvb2sgcGxhY2UuIFJlbW92ZXMgc3BhbnNcbi8vIGVudGlyZWx5IHdpdGhpbiB0aGUgY2hhbmdlLCByZWNvbm5lY3RzIHNwYW5zIGJlbG9uZ2luZyB0byB0aGVcbi8vIHNhbWUgbWFya2VyIHRoYXQgYXBwZWFyIG9uIGJvdGggc2lkZXMgb2YgdGhlIGNoYW5nZSwgYW5kIGN1dHMgb2ZmXG4vLyBzcGFucyBwYXJ0aWFsbHkgd2l0aGluIHRoZSBjaGFuZ2UuIFJldHVybnMgYW4gYXJyYXkgb2Ygc3BhblxuLy8gYXJyYXlzIHdpdGggb25lIGVsZW1lbnQgZm9yIGVhY2ggbGluZSBpbiAoYWZ0ZXIpIHRoZSBjaGFuZ2UuXG5mdW5jdGlvbiBzdHJldGNoU3BhbnNPdmVyQ2hhbmdlKGRvYywgY2hhbmdlKSB7XG4gIGlmIChjaGFuZ2UuZnVsbCkgeyByZXR1cm4gbnVsbCB9XG4gIHZhciBvbGRGaXJzdCA9IGlzTGluZShkb2MsIGNoYW5nZS5mcm9tLmxpbmUpICYmIGdldExpbmUoZG9jLCBjaGFuZ2UuZnJvbS5saW5lKS5tYXJrZWRTcGFucztcbiAgdmFyIG9sZExhc3QgPSBpc0xpbmUoZG9jLCBjaGFuZ2UudG8ubGluZSkgJiYgZ2V0TGluZShkb2MsIGNoYW5nZS50by5saW5lKS5tYXJrZWRTcGFucztcbiAgaWYgKCFvbGRGaXJzdCAmJiAhb2xkTGFzdCkgeyByZXR1cm4gbnVsbCB9XG5cbiAgdmFyIHN0YXJ0Q2ggPSBjaGFuZ2UuZnJvbS5jaCwgZW5kQ2ggPSBjaGFuZ2UudG8uY2gsIGlzSW5zZXJ0ID0gY21wKGNoYW5nZS5mcm9tLCBjaGFuZ2UudG8pID09IDA7XG4gIC8vIEdldCB0aGUgc3BhbnMgdGhhdCAnc3RpY2sgb3V0JyBvbiBib3RoIHNpZGVzXG4gIHZhciBmaXJzdCA9IG1hcmtlZFNwYW5zQmVmb3JlKG9sZEZpcnN0LCBzdGFydENoLCBpc0luc2VydCk7XG4gIHZhciBsYXN0ID0gbWFya2VkU3BhbnNBZnRlcihvbGRMYXN0LCBlbmRDaCwgaXNJbnNlcnQpO1xuXG4gIC8vIE5leHQsIG1lcmdlIHRob3NlIHR3byBlbmRzXG4gIHZhciBzYW1lTGluZSA9IGNoYW5nZS50ZXh0Lmxlbmd0aCA9PSAxLCBvZmZzZXQgPSBsc3QoY2hhbmdlLnRleHQpLmxlbmd0aCArIChzYW1lTGluZSA/IHN0YXJ0Q2ggOiAwKTtcbiAgaWYgKGZpcnN0KSB7XG4gICAgLy8gRml4IHVwIC50byBwcm9wZXJ0aWVzIG9mIGZpcnN0XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBmaXJzdC5sZW5ndGg7ICsraSkge1xuICAgICAgdmFyIHNwYW4gPSBmaXJzdFtpXTtcbiAgICAgIGlmIChzcGFuLnRvID09IG51bGwpIHtcbiAgICAgICAgdmFyIGZvdW5kID0gZ2V0TWFya2VkU3BhbkZvcihsYXN0LCBzcGFuLm1hcmtlcik7XG4gICAgICAgIGlmICghZm91bmQpIHsgc3Bhbi50byA9IHN0YXJ0Q2g7IH1cbiAgICAgICAgZWxzZSBpZiAoc2FtZUxpbmUpIHsgc3Bhbi50byA9IGZvdW5kLnRvID09IG51bGwgPyBudWxsIDogZm91bmQudG8gKyBvZmZzZXQ7IH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgaWYgKGxhc3QpIHtcbiAgICAvLyBGaXggdXAgLmZyb20gaW4gbGFzdCAob3IgbW92ZSB0aGVtIGludG8gZmlyc3QgaW4gY2FzZSBvZiBzYW1lTGluZSlcbiAgICBmb3IgKHZhciBpJDEgPSAwOyBpJDEgPCBsYXN0Lmxlbmd0aDsgKytpJDEpIHtcbiAgICAgIHZhciBzcGFuJDEgPSBsYXN0W2kkMV07XG4gICAgICBpZiAoc3BhbiQxLnRvICE9IG51bGwpIHsgc3BhbiQxLnRvICs9IG9mZnNldDsgfVxuICAgICAgaWYgKHNwYW4kMS5mcm9tID09IG51bGwpIHtcbiAgICAgICAgdmFyIGZvdW5kJDEgPSBnZXRNYXJrZWRTcGFuRm9yKGZpcnN0LCBzcGFuJDEubWFya2VyKTtcbiAgICAgICAgaWYgKCFmb3VuZCQxKSB7XG4gICAgICAgICAgc3BhbiQxLmZyb20gPSBvZmZzZXQ7XG4gICAgICAgICAgaWYgKHNhbWVMaW5lKSB7IChmaXJzdCB8fCAoZmlyc3QgPSBbXSkpLnB1c2goc3BhbiQxKTsgfVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzcGFuJDEuZnJvbSArPSBvZmZzZXQ7XG4gICAgICAgIGlmIChzYW1lTGluZSkgeyAoZmlyc3QgfHwgKGZpcnN0ID0gW10pKS5wdXNoKHNwYW4kMSk7IH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgLy8gTWFrZSBzdXJlIHdlIGRpZG4ndCBjcmVhdGUgYW55IHplcm8tbGVuZ3RoIHNwYW5zXG4gIGlmIChmaXJzdCkgeyBmaXJzdCA9IGNsZWFyRW1wdHlTcGFucyhmaXJzdCk7IH1cbiAgaWYgKGxhc3QgJiYgbGFzdCAhPSBmaXJzdCkgeyBsYXN0ID0gY2xlYXJFbXB0eVNwYW5zKGxhc3QpOyB9XG5cbiAgdmFyIG5ld01hcmtlcnMgPSBbZmlyc3RdO1xuICBpZiAoIXNhbWVMaW5lKSB7XG4gICAgLy8gRmlsbCBnYXAgd2l0aCB3aG9sZS1saW5lLXNwYW5zXG4gICAgdmFyIGdhcCA9IGNoYW5nZS50ZXh0Lmxlbmd0aCAtIDIsIGdhcE1hcmtlcnM7XG4gICAgaWYgKGdhcCA+IDAgJiYgZmlyc3QpXG4gICAgICB7IGZvciAodmFyIGkkMiA9IDA7IGkkMiA8IGZpcnN0Lmxlbmd0aDsgKytpJDIpXG4gICAgICAgIHsgaWYgKGZpcnN0W2kkMl0udG8gPT0gbnVsbClcbiAgICAgICAgICB7IChnYXBNYXJrZXJzIHx8IChnYXBNYXJrZXJzID0gW10pKS5wdXNoKG5ldyBNYXJrZWRTcGFuKGZpcnN0W2kkMl0ubWFya2VyLCBudWxsLCBudWxsKSk7IH0gfSB9XG4gICAgZm9yICh2YXIgaSQzID0gMDsgaSQzIDwgZ2FwOyArK2kkMylcbiAgICAgIHsgbmV3TWFya2Vycy5wdXNoKGdhcE1hcmtlcnMpOyB9XG4gICAgbmV3TWFya2Vycy5wdXNoKGxhc3QpO1xuICB9XG4gIHJldHVybiBuZXdNYXJrZXJzXG59XG5cbi8vIFJlbW92ZSBzcGFucyB0aGF0IGFyZSBlbXB0eSBhbmQgZG9uJ3QgaGF2ZSBhIGNsZWFyV2hlbkVtcHR5XG4vLyBvcHRpb24gb2YgZmFsc2UuXG5mdW5jdGlvbiBjbGVhckVtcHR5U3BhbnMoc3BhbnMpIHtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBzcGFucy5sZW5ndGg7ICsraSkge1xuICAgIHZhciBzcGFuID0gc3BhbnNbaV07XG4gICAgaWYgKHNwYW4uZnJvbSAhPSBudWxsICYmIHNwYW4uZnJvbSA9PSBzcGFuLnRvICYmIHNwYW4ubWFya2VyLmNsZWFyV2hlbkVtcHR5ICE9PSBmYWxzZSlcbiAgICAgIHsgc3BhbnMuc3BsaWNlKGktLSwgMSk7IH1cbiAgfVxuICBpZiAoIXNwYW5zLmxlbmd0aCkgeyByZXR1cm4gbnVsbCB9XG4gIHJldHVybiBzcGFuc1xufVxuXG4vLyBVc2VkIHRvICdjbGlwJyBvdXQgcmVhZE9ubHkgcmFuZ2VzIHdoZW4gbWFraW5nIGEgY2hhbmdlLlxuZnVuY3Rpb24gcmVtb3ZlUmVhZE9ubHlSYW5nZXMoZG9jLCBmcm9tLCB0bykge1xuICB2YXIgbWFya2VycyA9IG51bGw7XG4gIGRvYy5pdGVyKGZyb20ubGluZSwgdG8ubGluZSArIDEsIGZ1bmN0aW9uIChsaW5lKSB7XG4gICAgaWYgKGxpbmUubWFya2VkU3BhbnMpIHsgZm9yICh2YXIgaSA9IDA7IGkgPCBsaW5lLm1hcmtlZFNwYW5zLmxlbmd0aDsgKytpKSB7XG4gICAgICB2YXIgbWFyayA9IGxpbmUubWFya2VkU3BhbnNbaV0ubWFya2VyO1xuICAgICAgaWYgKG1hcmsucmVhZE9ubHkgJiYgKCFtYXJrZXJzIHx8IGluZGV4T2YobWFya2VycywgbWFyaykgPT0gLTEpKVxuICAgICAgICB7IChtYXJrZXJzIHx8IChtYXJrZXJzID0gW10pKS5wdXNoKG1hcmspOyB9XG4gICAgfSB9XG4gIH0pO1xuICBpZiAoIW1hcmtlcnMpIHsgcmV0dXJuIG51bGwgfVxuICB2YXIgcGFydHMgPSBbe2Zyb206IGZyb20sIHRvOiB0b31dO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IG1hcmtlcnMubGVuZ3RoOyArK2kpIHtcbiAgICB2YXIgbWsgPSBtYXJrZXJzW2ldLCBtID0gbWsuZmluZCgwKTtcbiAgICBmb3IgKHZhciBqID0gMDsgaiA8IHBhcnRzLmxlbmd0aDsgKytqKSB7XG4gICAgICB2YXIgcCA9IHBhcnRzW2pdO1xuICAgICAgaWYgKGNtcChwLnRvLCBtLmZyb20pIDwgMCB8fCBjbXAocC5mcm9tLCBtLnRvKSA+IDApIHsgY29udGludWUgfVxuICAgICAgdmFyIG5ld1BhcnRzID0gW2osIDFdLCBkZnJvbSA9IGNtcChwLmZyb20sIG0uZnJvbSksIGR0byA9IGNtcChwLnRvLCBtLnRvKTtcbiAgICAgIGlmIChkZnJvbSA8IDAgfHwgIW1rLmluY2x1c2l2ZUxlZnQgJiYgIWRmcm9tKVxuICAgICAgICB7IG5ld1BhcnRzLnB1c2goe2Zyb206IHAuZnJvbSwgdG86IG0uZnJvbX0pOyB9XG4gICAgICBpZiAoZHRvID4gMCB8fCAhbWsuaW5jbHVzaXZlUmlnaHQgJiYgIWR0bylcbiAgICAgICAgeyBuZXdQYXJ0cy5wdXNoKHtmcm9tOiBtLnRvLCB0bzogcC50b30pOyB9XG4gICAgICBwYXJ0cy5zcGxpY2UuYXBwbHkocGFydHMsIG5ld1BhcnRzKTtcbiAgICAgIGogKz0gbmV3UGFydHMubGVuZ3RoIC0gMztcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHBhcnRzXG59XG5cbi8vIENvbm5lY3Qgb3IgZGlzY29ubmVjdCBzcGFucyBmcm9tIGEgbGluZS5cbmZ1bmN0aW9uIGRldGFjaE1hcmtlZFNwYW5zKGxpbmUpIHtcbiAgdmFyIHNwYW5zID0gbGluZS5tYXJrZWRTcGFucztcbiAgaWYgKCFzcGFucykgeyByZXR1cm4gfVxuICBmb3IgKHZhciBpID0gMDsgaSA8IHNwYW5zLmxlbmd0aDsgKytpKVxuICAgIHsgc3BhbnNbaV0ubWFya2VyLmRldGFjaExpbmUobGluZSk7IH1cbiAgbGluZS5tYXJrZWRTcGFucyA9IG51bGw7XG59XG5mdW5jdGlvbiBhdHRhY2hNYXJrZWRTcGFucyhsaW5lLCBzcGFucykge1xuICBpZiAoIXNwYW5zKSB7IHJldHVybiB9XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc3BhbnMubGVuZ3RoOyArK2kpXG4gICAgeyBzcGFuc1tpXS5tYXJrZXIuYXR0YWNoTGluZShsaW5lKTsgfVxuICBsaW5lLm1hcmtlZFNwYW5zID0gc3BhbnM7XG59XG5cbi8vIEhlbHBlcnMgdXNlZCB3aGVuIGNvbXB1dGluZyB3aGljaCBvdmVybGFwcGluZyBjb2xsYXBzZWQgc3BhblxuLy8gY291bnRzIGFzIHRoZSBsYXJnZXIgb25lLlxuZnVuY3Rpb24gZXh0cmFMZWZ0KG1hcmtlcikgeyByZXR1cm4gbWFya2VyLmluY2x1c2l2ZUxlZnQgPyAtMSA6IDAgfVxuZnVuY3Rpb24gZXh0cmFSaWdodChtYXJrZXIpIHsgcmV0dXJuIG1hcmtlci5pbmNsdXNpdmVSaWdodCA/IDEgOiAwIH1cblxuLy8gUmV0dXJucyBhIG51bWJlciBpbmRpY2F0aW5nIHdoaWNoIG9mIHR3byBvdmVybGFwcGluZyBjb2xsYXBzZWRcbi8vIHNwYW5zIGlzIGxhcmdlciAoYW5kIHRodXMgaW5jbHVkZXMgdGhlIG90aGVyKS4gRmFsbHMgYmFjayB0b1xuLy8gY29tcGFyaW5nIGlkcyB3aGVuIHRoZSBzcGFucyBjb3ZlciBleGFjdGx5IHRoZSBzYW1lIHJhbmdlLlxuZnVuY3Rpb24gY29tcGFyZUNvbGxhcHNlZE1hcmtlcnMoYSwgYikge1xuICB2YXIgbGVuRGlmZiA9IGEubGluZXMubGVuZ3RoIC0gYi5saW5lcy5sZW5ndGg7XG4gIGlmIChsZW5EaWZmICE9IDApIHsgcmV0dXJuIGxlbkRpZmYgfVxuICB2YXIgYVBvcyA9IGEuZmluZCgpLCBiUG9zID0gYi5maW5kKCk7XG4gIHZhciBmcm9tQ21wID0gY21wKGFQb3MuZnJvbSwgYlBvcy5mcm9tKSB8fCBleHRyYUxlZnQoYSkgLSBleHRyYUxlZnQoYik7XG4gIGlmIChmcm9tQ21wKSB7IHJldHVybiAtZnJvbUNtcCB9XG4gIHZhciB0b0NtcCA9IGNtcChhUG9zLnRvLCBiUG9zLnRvKSB8fCBleHRyYVJpZ2h0KGEpIC0gZXh0cmFSaWdodChiKTtcbiAgaWYgKHRvQ21wKSB7IHJldHVybiB0b0NtcCB9XG4gIHJldHVybiBiLmlkIC0gYS5pZFxufVxuXG4vLyBGaW5kIG91dCB3aGV0aGVyIGEgbGluZSBlbmRzIG9yIHN0YXJ0cyBpbiBhIGNvbGxhcHNlZCBzcGFuLiBJZlxuLy8gc28sIHJldHVybiB0aGUgbWFya2VyIGZvciB0aGF0IHNwYW4uXG5mdW5jdGlvbiBjb2xsYXBzZWRTcGFuQXRTaWRlKGxpbmUsIHN0YXJ0KSB7XG4gIHZhciBzcHMgPSBzYXdDb2xsYXBzZWRTcGFucyAmJiBsaW5lLm1hcmtlZFNwYW5zLCBmb3VuZDtcbiAgaWYgKHNwcykgeyBmb3IgKHZhciBzcCA9ICh2b2lkIDApLCBpID0gMDsgaSA8IHNwcy5sZW5ndGg7ICsraSkge1xuICAgIHNwID0gc3BzW2ldO1xuICAgIGlmIChzcC5tYXJrZXIuY29sbGFwc2VkICYmIChzdGFydCA/IHNwLmZyb20gOiBzcC50bykgPT0gbnVsbCAmJlxuICAgICAgICAoIWZvdW5kIHx8IGNvbXBhcmVDb2xsYXBzZWRNYXJrZXJzKGZvdW5kLCBzcC5tYXJrZXIpIDwgMCkpXG4gICAgICB7IGZvdW5kID0gc3AubWFya2VyOyB9XG4gIH0gfVxuICByZXR1cm4gZm91bmRcbn1cbmZ1bmN0aW9uIGNvbGxhcHNlZFNwYW5BdFN0YXJ0KGxpbmUpIHsgcmV0dXJuIGNvbGxhcHNlZFNwYW5BdFNpZGUobGluZSwgdHJ1ZSkgfVxuZnVuY3Rpb24gY29sbGFwc2VkU3BhbkF0RW5kKGxpbmUpIHsgcmV0dXJuIGNvbGxhcHNlZFNwYW5BdFNpZGUobGluZSwgZmFsc2UpIH1cblxuZnVuY3Rpb24gY29sbGFwc2VkU3BhbkFyb3VuZChsaW5lLCBjaCkge1xuICB2YXIgc3BzID0gc2F3Q29sbGFwc2VkU3BhbnMgJiYgbGluZS5tYXJrZWRTcGFucywgZm91bmQ7XG4gIGlmIChzcHMpIHsgZm9yICh2YXIgaSA9IDA7IGkgPCBzcHMubGVuZ3RoOyArK2kpIHtcbiAgICB2YXIgc3AgPSBzcHNbaV07XG4gICAgaWYgKHNwLm1hcmtlci5jb2xsYXBzZWQgJiYgKHNwLmZyb20gPT0gbnVsbCB8fCBzcC5mcm9tIDwgY2gpICYmIChzcC50byA9PSBudWxsIHx8IHNwLnRvID4gY2gpICYmXG4gICAgICAgICghZm91bmQgfHwgY29tcGFyZUNvbGxhcHNlZE1hcmtlcnMoZm91bmQsIHNwLm1hcmtlcikgPCAwKSkgeyBmb3VuZCA9IHNwLm1hcmtlcjsgfVxuICB9IH1cbiAgcmV0dXJuIGZvdW5kXG59XG5cbi8vIFRlc3Qgd2hldGhlciB0aGVyZSBleGlzdHMgYSBjb2xsYXBzZWQgc3BhbiB0aGF0IHBhcnRpYWxseVxuLy8gb3ZlcmxhcHMgKGNvdmVycyB0aGUgc3RhcnQgb3IgZW5kLCBidXQgbm90IGJvdGgpIG9mIGEgbmV3IHNwYW4uXG4vLyBTdWNoIG92ZXJsYXAgaXMgbm90IGFsbG93ZWQuXG5mdW5jdGlvbiBjb25mbGljdGluZ0NvbGxhcHNlZFJhbmdlKGRvYywgbGluZU5vJCQxLCBmcm9tLCB0bywgbWFya2VyKSB7XG4gIHZhciBsaW5lID0gZ2V0TGluZShkb2MsIGxpbmVObyQkMSk7XG4gIHZhciBzcHMgPSBzYXdDb2xsYXBzZWRTcGFucyAmJiBsaW5lLm1hcmtlZFNwYW5zO1xuICBpZiAoc3BzKSB7IGZvciAodmFyIGkgPSAwOyBpIDwgc3BzLmxlbmd0aDsgKytpKSB7XG4gICAgdmFyIHNwID0gc3BzW2ldO1xuICAgIGlmICghc3AubWFya2VyLmNvbGxhcHNlZCkgeyBjb250aW51ZSB9XG4gICAgdmFyIGZvdW5kID0gc3AubWFya2VyLmZpbmQoMCk7XG4gICAgdmFyIGZyb21DbXAgPSBjbXAoZm91bmQuZnJvbSwgZnJvbSkgfHwgZXh0cmFMZWZ0KHNwLm1hcmtlcikgLSBleHRyYUxlZnQobWFya2VyKTtcbiAgICB2YXIgdG9DbXAgPSBjbXAoZm91bmQudG8sIHRvKSB8fCBleHRyYVJpZ2h0KHNwLm1hcmtlcikgLSBleHRyYVJpZ2h0KG1hcmtlcik7XG4gICAgaWYgKGZyb21DbXAgPj0gMCAmJiB0b0NtcCA8PSAwIHx8IGZyb21DbXAgPD0gMCAmJiB0b0NtcCA+PSAwKSB7IGNvbnRpbnVlIH1cbiAgICBpZiAoZnJvbUNtcCA8PSAwICYmIChzcC5tYXJrZXIuaW5jbHVzaXZlUmlnaHQgJiYgbWFya2VyLmluY2x1c2l2ZUxlZnQgPyBjbXAoZm91bmQudG8sIGZyb20pID49IDAgOiBjbXAoZm91bmQudG8sIGZyb20pID4gMCkgfHxcbiAgICAgICAgZnJvbUNtcCA+PSAwICYmIChzcC5tYXJrZXIuaW5jbHVzaXZlUmlnaHQgJiYgbWFya2VyLmluY2x1c2l2ZUxlZnQgPyBjbXAoZm91bmQuZnJvbSwgdG8pIDw9IDAgOiBjbXAoZm91bmQuZnJvbSwgdG8pIDwgMCkpXG4gICAgICB7IHJldHVybiB0cnVlIH1cbiAgfSB9XG59XG5cbi8vIEEgdmlzdWFsIGxpbmUgaXMgYSBsaW5lIGFzIGRyYXduIG9uIHRoZSBzY3JlZW4uIEZvbGRpbmcsIGZvclxuLy8gZXhhbXBsZSwgY2FuIGNhdXNlIG11bHRpcGxlIGxvZ2ljYWwgbGluZXMgdG8gYXBwZWFyIG9uIHRoZSBzYW1lXG4vLyB2aXN1YWwgbGluZS4gVGhpcyBmaW5kcyB0aGUgc3RhcnQgb2YgdGhlIHZpc3VhbCBsaW5lIHRoYXQgdGhlXG4vLyBnaXZlbiBsaW5lIGlzIHBhcnQgb2YgKHVzdWFsbHkgdGhhdCBpcyB0aGUgbGluZSBpdHNlbGYpLlxuZnVuY3Rpb24gdmlzdWFsTGluZShsaW5lKSB7XG4gIHZhciBtZXJnZWQ7XG4gIHdoaWxlIChtZXJnZWQgPSBjb2xsYXBzZWRTcGFuQXRTdGFydChsaW5lKSlcbiAgICB7IGxpbmUgPSBtZXJnZWQuZmluZCgtMSwgdHJ1ZSkubGluZTsgfVxuICByZXR1cm4gbGluZVxufVxuXG5mdW5jdGlvbiB2aXN1YWxMaW5lRW5kKGxpbmUpIHtcbiAgdmFyIG1lcmdlZDtcbiAgd2hpbGUgKG1lcmdlZCA9IGNvbGxhcHNlZFNwYW5BdEVuZChsaW5lKSlcbiAgICB7IGxpbmUgPSBtZXJnZWQuZmluZCgxLCB0cnVlKS5saW5lOyB9XG4gIHJldHVybiBsaW5lXG59XG5cbi8vIFJldHVybnMgYW4gYXJyYXkgb2YgbG9naWNhbCBsaW5lcyB0aGF0IGNvbnRpbnVlIHRoZSB2aXN1YWwgbGluZVxuLy8gc3RhcnRlZCBieSB0aGUgYXJndW1lbnQsIG9yIHVuZGVmaW5lZCBpZiB0aGVyZSBhcmUgbm8gc3VjaCBsaW5lcy5cbmZ1bmN0aW9uIHZpc3VhbExpbmVDb250aW51ZWQobGluZSkge1xuICB2YXIgbWVyZ2VkLCBsaW5lcztcbiAgd2hpbGUgKG1lcmdlZCA9IGNvbGxhcHNlZFNwYW5BdEVuZChsaW5lKSkge1xuICAgIGxpbmUgPSBtZXJnZWQuZmluZCgxLCB0cnVlKS5saW5lXG4gICAgOyhsaW5lcyB8fCAobGluZXMgPSBbXSkpLnB1c2gobGluZSk7XG4gIH1cbiAgcmV0dXJuIGxpbmVzXG59XG5cbi8vIEdldCB0aGUgbGluZSBudW1iZXIgb2YgdGhlIHN0YXJ0IG9mIHRoZSB2aXN1YWwgbGluZSB0aGF0IHRoZVxuLy8gZ2l2ZW4gbGluZSBudW1iZXIgaXMgcGFydCBvZi5cbmZ1bmN0aW9uIHZpc3VhbExpbmVObyhkb2MsIGxpbmVOKSB7XG4gIHZhciBsaW5lID0gZ2V0TGluZShkb2MsIGxpbmVOKSwgdmlzID0gdmlzdWFsTGluZShsaW5lKTtcbiAgaWYgKGxpbmUgPT0gdmlzKSB7IHJldHVybiBsaW5lTiB9XG4gIHJldHVybiBsaW5lTm8odmlzKVxufVxuXG4vLyBHZXQgdGhlIGxpbmUgbnVtYmVyIG9mIHRoZSBzdGFydCBvZiB0aGUgbmV4dCB2aXN1YWwgbGluZSBhZnRlclxuLy8gdGhlIGdpdmVuIGxpbmUuXG5mdW5jdGlvbiB2aXN1YWxMaW5lRW5kTm8oZG9jLCBsaW5lTikge1xuICBpZiAobGluZU4gPiBkb2MubGFzdExpbmUoKSkgeyByZXR1cm4gbGluZU4gfVxuICB2YXIgbGluZSA9IGdldExpbmUoZG9jLCBsaW5lTiksIG1lcmdlZDtcbiAgaWYgKCFsaW5lSXNIaWRkZW4oZG9jLCBsaW5lKSkgeyByZXR1cm4gbGluZU4gfVxuICB3aGlsZSAobWVyZ2VkID0gY29sbGFwc2VkU3BhbkF0RW5kKGxpbmUpKVxuICAgIHsgbGluZSA9IG1lcmdlZC5maW5kKDEsIHRydWUpLmxpbmU7IH1cbiAgcmV0dXJuIGxpbmVObyhsaW5lKSArIDFcbn1cblxuLy8gQ29tcHV0ZSB3aGV0aGVyIGEgbGluZSBpcyBoaWRkZW4uIExpbmVzIGNvdW50IGFzIGhpZGRlbiB3aGVuIHRoZXlcbi8vIGFyZSBwYXJ0IG9mIGEgdmlzdWFsIGxpbmUgdGhhdCBzdGFydHMgd2l0aCBhbm90aGVyIGxpbmUsIG9yIHdoZW5cbi8vIHRoZXkgYXJlIGVudGlyZWx5IGNvdmVyZWQgYnkgY29sbGFwc2VkLCBub24td2lkZ2V0IHNwYW4uXG5mdW5jdGlvbiBsaW5lSXNIaWRkZW4oZG9jLCBsaW5lKSB7XG4gIHZhciBzcHMgPSBzYXdDb2xsYXBzZWRTcGFucyAmJiBsaW5lLm1hcmtlZFNwYW5zO1xuICBpZiAoc3BzKSB7IGZvciAodmFyIHNwID0gKHZvaWQgMCksIGkgPSAwOyBpIDwgc3BzLmxlbmd0aDsgKytpKSB7XG4gICAgc3AgPSBzcHNbaV07XG4gICAgaWYgKCFzcC5tYXJrZXIuY29sbGFwc2VkKSB7IGNvbnRpbnVlIH1cbiAgICBpZiAoc3AuZnJvbSA9PSBudWxsKSB7IHJldHVybiB0cnVlIH1cbiAgICBpZiAoc3AubWFya2VyLndpZGdldE5vZGUpIHsgY29udGludWUgfVxuICAgIGlmIChzcC5mcm9tID09IDAgJiYgc3AubWFya2VyLmluY2x1c2l2ZUxlZnQgJiYgbGluZUlzSGlkZGVuSW5uZXIoZG9jLCBsaW5lLCBzcCkpXG4gICAgICB7IHJldHVybiB0cnVlIH1cbiAgfSB9XG59XG5mdW5jdGlvbiBsaW5lSXNIaWRkZW5Jbm5lcihkb2MsIGxpbmUsIHNwYW4pIHtcbiAgaWYgKHNwYW4udG8gPT0gbnVsbCkge1xuICAgIHZhciBlbmQgPSBzcGFuLm1hcmtlci5maW5kKDEsIHRydWUpO1xuICAgIHJldHVybiBsaW5lSXNIaWRkZW5Jbm5lcihkb2MsIGVuZC5saW5lLCBnZXRNYXJrZWRTcGFuRm9yKGVuZC5saW5lLm1hcmtlZFNwYW5zLCBzcGFuLm1hcmtlcikpXG4gIH1cbiAgaWYgKHNwYW4ubWFya2VyLmluY2x1c2l2ZVJpZ2h0ICYmIHNwYW4udG8gPT0gbGluZS50ZXh0Lmxlbmd0aClcbiAgICB7IHJldHVybiB0cnVlIH1cbiAgZm9yICh2YXIgc3AgPSAodm9pZCAwKSwgaSA9IDA7IGkgPCBsaW5lLm1hcmtlZFNwYW5zLmxlbmd0aDsgKytpKSB7XG4gICAgc3AgPSBsaW5lLm1hcmtlZFNwYW5zW2ldO1xuICAgIGlmIChzcC5tYXJrZXIuY29sbGFwc2VkICYmICFzcC5tYXJrZXIud2lkZ2V0Tm9kZSAmJiBzcC5mcm9tID09IHNwYW4udG8gJiZcbiAgICAgICAgKHNwLnRvID09IG51bGwgfHwgc3AudG8gIT0gc3Bhbi5mcm9tKSAmJlxuICAgICAgICAoc3AubWFya2VyLmluY2x1c2l2ZUxlZnQgfHwgc3Bhbi5tYXJrZXIuaW5jbHVzaXZlUmlnaHQpICYmXG4gICAgICAgIGxpbmVJc0hpZGRlbklubmVyKGRvYywgbGluZSwgc3ApKSB7IHJldHVybiB0cnVlIH1cbiAgfVxufVxuXG4vLyBGaW5kIHRoZSBoZWlnaHQgYWJvdmUgdGhlIGdpdmVuIGxpbmUuXG5mdW5jdGlvbiBoZWlnaHRBdExpbmUobGluZU9iaikge1xuICBsaW5lT2JqID0gdmlzdWFsTGluZShsaW5lT2JqKTtcblxuICB2YXIgaCA9IDAsIGNodW5rID0gbGluZU9iai5wYXJlbnQ7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgY2h1bmsubGluZXMubGVuZ3RoOyArK2kpIHtcbiAgICB2YXIgbGluZSA9IGNodW5rLmxpbmVzW2ldO1xuICAgIGlmIChsaW5lID09IGxpbmVPYmopIHsgYnJlYWsgfVxuICAgIGVsc2UgeyBoICs9IGxpbmUuaGVpZ2h0OyB9XG4gIH1cbiAgZm9yICh2YXIgcCA9IGNodW5rLnBhcmVudDsgcDsgY2h1bmsgPSBwLCBwID0gY2h1bmsucGFyZW50KSB7XG4gICAgZm9yICh2YXIgaSQxID0gMDsgaSQxIDwgcC5jaGlsZHJlbi5sZW5ndGg7ICsraSQxKSB7XG4gICAgICB2YXIgY3VyID0gcC5jaGlsZHJlbltpJDFdO1xuICAgICAgaWYgKGN1ciA9PSBjaHVuaykgeyBicmVhayB9XG4gICAgICBlbHNlIHsgaCArPSBjdXIuaGVpZ2h0OyB9XG4gICAgfVxuICB9XG4gIHJldHVybiBoXG59XG5cbi8vIENvbXB1dGUgdGhlIGNoYXJhY3RlciBsZW5ndGggb2YgYSBsaW5lLCB0YWtpbmcgaW50byBhY2NvdW50XG4vLyBjb2xsYXBzZWQgcmFuZ2VzIChzZWUgbWFya1RleHQpIHRoYXQgbWlnaHQgaGlkZSBwYXJ0cywgYW5kIGpvaW5cbi8vIG90aGVyIGxpbmVzIG9udG8gaXQuXG5mdW5jdGlvbiBsaW5lTGVuZ3RoKGxpbmUpIHtcbiAgaWYgKGxpbmUuaGVpZ2h0ID09IDApIHsgcmV0dXJuIDAgfVxuICB2YXIgbGVuID0gbGluZS50ZXh0Lmxlbmd0aCwgbWVyZ2VkLCBjdXIgPSBsaW5lO1xuICB3aGlsZSAobWVyZ2VkID0gY29sbGFwc2VkU3BhbkF0U3RhcnQoY3VyKSkge1xuICAgIHZhciBmb3VuZCA9IG1lcmdlZC5maW5kKDAsIHRydWUpO1xuICAgIGN1ciA9IGZvdW5kLmZyb20ubGluZTtcbiAgICBsZW4gKz0gZm91bmQuZnJvbS5jaCAtIGZvdW5kLnRvLmNoO1xuICB9XG4gIGN1ciA9IGxpbmU7XG4gIHdoaWxlIChtZXJnZWQgPSBjb2xsYXBzZWRTcGFuQXRFbmQoY3VyKSkge1xuICAgIHZhciBmb3VuZCQxID0gbWVyZ2VkLmZpbmQoMCwgdHJ1ZSk7XG4gICAgbGVuIC09IGN1ci50ZXh0Lmxlbmd0aCAtIGZvdW5kJDEuZnJvbS5jaDtcbiAgICBjdXIgPSBmb3VuZCQxLnRvLmxpbmU7XG4gICAgbGVuICs9IGN1ci50ZXh0Lmxlbmd0aCAtIGZvdW5kJDEudG8uY2g7XG4gIH1cbiAgcmV0dXJuIGxlblxufVxuXG4vLyBGaW5kIHRoZSBsb25nZXN0IGxpbmUgaW4gdGhlIGRvY3VtZW50LlxuZnVuY3Rpb24gZmluZE1heExpbmUoY20pIHtcbiAgdmFyIGQgPSBjbS5kaXNwbGF5LCBkb2MgPSBjbS5kb2M7XG4gIGQubWF4TGluZSA9IGdldExpbmUoZG9jLCBkb2MuZmlyc3QpO1xuICBkLm1heExpbmVMZW5ndGggPSBsaW5lTGVuZ3RoKGQubWF4TGluZSk7XG4gIGQubWF4TGluZUNoYW5nZWQgPSB0cnVlO1xuICBkb2MuaXRlcihmdW5jdGlvbiAobGluZSkge1xuICAgIHZhciBsZW4gPSBsaW5lTGVuZ3RoKGxpbmUpO1xuICAgIGlmIChsZW4gPiBkLm1heExpbmVMZW5ndGgpIHtcbiAgICAgIGQubWF4TGluZUxlbmd0aCA9IGxlbjtcbiAgICAgIGQubWF4TGluZSA9IGxpbmU7XG4gICAgfVxuICB9KTtcbn1cblxuLy8gQklESSBIRUxQRVJTXG5cbmZ1bmN0aW9uIGl0ZXJhdGVCaWRpU2VjdGlvbnMob3JkZXIsIGZyb20sIHRvLCBmKSB7XG4gIGlmICghb3JkZXIpIHsgcmV0dXJuIGYoZnJvbSwgdG8sIFwibHRyXCIsIDApIH1cbiAgdmFyIGZvdW5kID0gZmFsc2U7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgb3JkZXIubGVuZ3RoOyArK2kpIHtcbiAgICB2YXIgcGFydCA9IG9yZGVyW2ldO1xuICAgIGlmIChwYXJ0LmZyb20gPCB0byAmJiBwYXJ0LnRvID4gZnJvbSB8fCBmcm9tID09IHRvICYmIHBhcnQudG8gPT0gZnJvbSkge1xuICAgICAgZihNYXRoLm1heChwYXJ0LmZyb20sIGZyb20pLCBNYXRoLm1pbihwYXJ0LnRvLCB0byksIHBhcnQubGV2ZWwgPT0gMSA/IFwicnRsXCIgOiBcImx0clwiLCBpKTtcbiAgICAgIGZvdW5kID0gdHJ1ZTtcbiAgICB9XG4gIH1cbiAgaWYgKCFmb3VuZCkgeyBmKGZyb20sIHRvLCBcImx0clwiKTsgfVxufVxuXG52YXIgYmlkaU90aGVyID0gbnVsbDtcbmZ1bmN0aW9uIGdldEJpZGlQYXJ0QXQob3JkZXIsIGNoLCBzdGlja3kpIHtcbiAgdmFyIGZvdW5kO1xuICBiaWRpT3RoZXIgPSBudWxsO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IG9yZGVyLmxlbmd0aDsgKytpKSB7XG4gICAgdmFyIGN1ciA9IG9yZGVyW2ldO1xuICAgIGlmIChjdXIuZnJvbSA8IGNoICYmIGN1ci50byA+IGNoKSB7IHJldHVybiBpIH1cbiAgICBpZiAoY3VyLnRvID09IGNoKSB7XG4gICAgICBpZiAoY3VyLmZyb20gIT0gY3VyLnRvICYmIHN0aWNreSA9PSBcImJlZm9yZVwiKSB7IGZvdW5kID0gaTsgfVxuICAgICAgZWxzZSB7IGJpZGlPdGhlciA9IGk7IH1cbiAgICB9XG4gICAgaWYgKGN1ci5mcm9tID09IGNoKSB7XG4gICAgICBpZiAoY3VyLmZyb20gIT0gY3VyLnRvICYmIHN0aWNreSAhPSBcImJlZm9yZVwiKSB7IGZvdW5kID0gaTsgfVxuICAgICAgZWxzZSB7IGJpZGlPdGhlciA9IGk7IH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIGZvdW5kICE9IG51bGwgPyBmb3VuZCA6IGJpZGlPdGhlclxufVxuXG4vLyBCaWRpcmVjdGlvbmFsIG9yZGVyaW5nIGFsZ29yaXRobVxuLy8gU2VlIGh0dHA6Ly91bmljb2RlLm9yZy9yZXBvcnRzL3RyOS90cjktMTMuaHRtbCBmb3IgdGhlIGFsZ29yaXRobVxuLy8gdGhhdCB0aGlzIChwYXJ0aWFsbHkpIGltcGxlbWVudHMuXG5cbi8vIE9uZS1jaGFyIGNvZGVzIHVzZWQgZm9yIGNoYXJhY3RlciB0eXBlczpcbi8vIEwgKEwpOiAgIExlZnQtdG8tUmlnaHRcbi8vIFIgKFIpOiAgIFJpZ2h0LXRvLUxlZnRcbi8vIHIgKEFMKTogIFJpZ2h0LXRvLUxlZnQgQXJhYmljXG4vLyAxIChFTik6ICBFdXJvcGVhbiBOdW1iZXJcbi8vICsgKEVTKTogIEV1cm9wZWFuIE51bWJlciBTZXBhcmF0b3Jcbi8vICUgKEVUKTogIEV1cm9wZWFuIE51bWJlciBUZXJtaW5hdG9yXG4vLyBuIChBTik6ICBBcmFiaWMgTnVtYmVyXG4vLyAsIChDUyk6ICBDb21tb24gTnVtYmVyIFNlcGFyYXRvclxuLy8gbSAoTlNNKTogTm9uLVNwYWNpbmcgTWFya1xuLy8gYiAoQk4pOiAgQm91bmRhcnkgTmV1dHJhbFxuLy8gcyAoQik6ICAgUGFyYWdyYXBoIFNlcGFyYXRvclxuLy8gdCAoUyk6ICAgU2VnbWVudCBTZXBhcmF0b3Jcbi8vIHcgKFdTKTogIFdoaXRlc3BhY2Vcbi8vIE4gKE9OKTogIE90aGVyIE5ldXRyYWxzXG5cbi8vIFJldHVybnMgbnVsbCBpZiBjaGFyYWN0ZXJzIGFyZSBvcmRlcmVkIGFzIHRoZXkgYXBwZWFyXG4vLyAobGVmdC10by1yaWdodCksIG9yIGFuIGFycmF5IG9mIHNlY3Rpb25zICh7ZnJvbSwgdG8sIGxldmVsfVxuLy8gb2JqZWN0cykgaW4gdGhlIG9yZGVyIGluIHdoaWNoIHRoZXkgb2NjdXIgdmlzdWFsbHkuXG52YXIgYmlkaU9yZGVyaW5nID0gKGZ1bmN0aW9uKCkge1xuICAvLyBDaGFyYWN0ZXIgdHlwZXMgZm9yIGNvZGVwb2ludHMgMCB0byAweGZmXG4gIHZhciBsb3dUeXBlcyA9IFwiYmJiYmJiYmJidHN0d3NiYmJiYmJiYmJiYmJiYnNzc3R3Tk4lJSVOTk5OTk4sTixOMTExMTExMTExMU5OTk5OTk5MTExMTExMTExMTExMTExMTExMTExMTExMTE5OTk5OTkxMTExMTExMTExMTExMTExMTExMTExMTExMTk5OTmJiYmJiYnNiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYixOJSUlJU5OTk5MTk5OTk4lJTExTkxOTk4xTE5OTk5OTExMTExMTExMTExMTExMTExMTExMTExOTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTE5cIjtcbiAgLy8gQ2hhcmFjdGVyIHR5cGVzIGZvciBjb2RlcG9pbnRzIDB4NjAwIHRvIDB4NmY5XG4gIHZhciBhcmFiaWNUeXBlcyA9IFwibm5ubm5uTk5yJSVyLHJOTm1tbW1tbW1tbW1tcnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJybW1tbW1tbW1tbW1tbW1tbW1tbW1tbm5ubm5ubm5ubiVubnJycm1ycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycm1tbW1tbW1uTm1tbW1tbXJybW1ObW1tbXJyMTExMTExMTExMVwiO1xuICBmdW5jdGlvbiBjaGFyVHlwZShjb2RlKSB7XG4gICAgaWYgKGNvZGUgPD0gMHhmNykgeyByZXR1cm4gbG93VHlwZXMuY2hhckF0KGNvZGUpIH1cbiAgICBlbHNlIGlmICgweDU5MCA8PSBjb2RlICYmIGNvZGUgPD0gMHg1ZjQpIHsgcmV0dXJuIFwiUlwiIH1cbiAgICBlbHNlIGlmICgweDYwMCA8PSBjb2RlICYmIGNvZGUgPD0gMHg2ZjkpIHsgcmV0dXJuIGFyYWJpY1R5cGVzLmNoYXJBdChjb2RlIC0gMHg2MDApIH1cbiAgICBlbHNlIGlmICgweDZlZSA8PSBjb2RlICYmIGNvZGUgPD0gMHg4YWMpIHsgcmV0dXJuIFwiclwiIH1cbiAgICBlbHNlIGlmICgweDIwMDAgPD0gY29kZSAmJiBjb2RlIDw9IDB4MjAwYikgeyByZXR1cm4gXCJ3XCIgfVxuICAgIGVsc2UgaWYgKGNvZGUgPT0gMHgyMDBjKSB7IHJldHVybiBcImJcIiB9XG4gICAgZWxzZSB7IHJldHVybiBcIkxcIiB9XG4gIH1cblxuICB2YXIgYmlkaVJFID0gL1tcXHUwNTkwLVxcdTA1ZjRcXHUwNjAwLVxcdTA2ZmZcXHUwNzAwLVxcdTA4YWNdLztcbiAgdmFyIGlzTmV1dHJhbCA9IC9bc3R3Tl0vLCBpc1N0cm9uZyA9IC9bTFJyXS8sIGNvdW50c0FzTGVmdCA9IC9bTGIxbl0vLCBjb3VudHNBc051bSA9IC9bMW5dLztcblxuICBmdW5jdGlvbiBCaWRpU3BhbihsZXZlbCwgZnJvbSwgdG8pIHtcbiAgICB0aGlzLmxldmVsID0gbGV2ZWw7XG4gICAgdGhpcy5mcm9tID0gZnJvbTsgdGhpcy50byA9IHRvO1xuICB9XG5cbiAgcmV0dXJuIGZ1bmN0aW9uKHN0ciwgZGlyZWN0aW9uKSB7XG4gICAgdmFyIG91dGVyVHlwZSA9IGRpcmVjdGlvbiA9PSBcImx0clwiID8gXCJMXCIgOiBcIlJcIjtcblxuICAgIGlmIChzdHIubGVuZ3RoID09IDAgfHwgZGlyZWN0aW9uID09IFwibHRyXCIgJiYgIWJpZGlSRS50ZXN0KHN0cikpIHsgcmV0dXJuIGZhbHNlIH1cbiAgICB2YXIgbGVuID0gc3RyLmxlbmd0aCwgdHlwZXMgPSBbXTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbjsgKytpKVxuICAgICAgeyB0eXBlcy5wdXNoKGNoYXJUeXBlKHN0ci5jaGFyQ29kZUF0KGkpKSk7IH1cblxuICAgIC8vIFcxLiBFeGFtaW5lIGVhY2ggbm9uLXNwYWNpbmcgbWFyayAoTlNNKSBpbiB0aGUgbGV2ZWwgcnVuLCBhbmRcbiAgICAvLyBjaGFuZ2UgdGhlIHR5cGUgb2YgdGhlIE5TTSB0byB0aGUgdHlwZSBvZiB0aGUgcHJldmlvdXNcbiAgICAvLyBjaGFyYWN0ZXIuIElmIHRoZSBOU00gaXMgYXQgdGhlIHN0YXJ0IG9mIHRoZSBsZXZlbCBydW4sIGl0IHdpbGxcbiAgICAvLyBnZXQgdGhlIHR5cGUgb2Ygc29yLlxuICAgIGZvciAodmFyIGkkMSA9IDAsIHByZXYgPSBvdXRlclR5cGU7IGkkMSA8IGxlbjsgKytpJDEpIHtcbiAgICAgIHZhciB0eXBlID0gdHlwZXNbaSQxXTtcbiAgICAgIGlmICh0eXBlID09IFwibVwiKSB7IHR5cGVzW2kkMV0gPSBwcmV2OyB9XG4gICAgICBlbHNlIHsgcHJldiA9IHR5cGU7IH1cbiAgICB9XG5cbiAgICAvLyBXMi4gU2VhcmNoIGJhY2t3YXJkcyBmcm9tIGVhY2ggaW5zdGFuY2Ugb2YgYSBFdXJvcGVhbiBudW1iZXJcbiAgICAvLyB1bnRpbCB0aGUgZmlyc3Qgc3Ryb25nIHR5cGUgKFIsIEwsIEFMLCBvciBzb3IpIGlzIGZvdW5kLiBJZiBhblxuICAgIC8vIEFMIGlzIGZvdW5kLCBjaGFuZ2UgdGhlIHR5cGUgb2YgdGhlIEV1cm9wZWFuIG51bWJlciB0byBBcmFiaWNcbiAgICAvLyBudW1iZXIuXG4gICAgLy8gVzMuIENoYW5nZSBhbGwgQUxzIHRvIFIuXG4gICAgZm9yICh2YXIgaSQyID0gMCwgY3VyID0gb3V0ZXJUeXBlOyBpJDIgPCBsZW47ICsraSQyKSB7XG4gICAgICB2YXIgdHlwZSQxID0gdHlwZXNbaSQyXTtcbiAgICAgIGlmICh0eXBlJDEgPT0gXCIxXCIgJiYgY3VyID09IFwiclwiKSB7IHR5cGVzW2kkMl0gPSBcIm5cIjsgfVxuICAgICAgZWxzZSBpZiAoaXNTdHJvbmcudGVzdCh0eXBlJDEpKSB7IGN1ciA9IHR5cGUkMTsgaWYgKHR5cGUkMSA9PSBcInJcIikgeyB0eXBlc1tpJDJdID0gXCJSXCI7IH0gfVxuICAgIH1cblxuICAgIC8vIFc0LiBBIHNpbmdsZSBFdXJvcGVhbiBzZXBhcmF0b3IgYmV0d2VlbiB0d28gRXVyb3BlYW4gbnVtYmVyc1xuICAgIC8vIGNoYW5nZXMgdG8gYSBFdXJvcGVhbiBudW1iZXIuIEEgc2luZ2xlIGNvbW1vbiBzZXBhcmF0b3IgYmV0d2VlblxuICAgIC8vIHR3byBudW1iZXJzIG9mIHRoZSBzYW1lIHR5cGUgY2hhbmdlcyB0byB0aGF0IHR5cGUuXG4gICAgZm9yICh2YXIgaSQzID0gMSwgcHJldiQxID0gdHlwZXNbMF07IGkkMyA8IGxlbiAtIDE7ICsraSQzKSB7XG4gICAgICB2YXIgdHlwZSQyID0gdHlwZXNbaSQzXTtcbiAgICAgIGlmICh0eXBlJDIgPT0gXCIrXCIgJiYgcHJldiQxID09IFwiMVwiICYmIHR5cGVzW2kkMysxXSA9PSBcIjFcIikgeyB0eXBlc1tpJDNdID0gXCIxXCI7IH1cbiAgICAgIGVsc2UgaWYgKHR5cGUkMiA9PSBcIixcIiAmJiBwcmV2JDEgPT0gdHlwZXNbaSQzKzFdICYmXG4gICAgICAgICAgICAgICAocHJldiQxID09IFwiMVwiIHx8IHByZXYkMSA9PSBcIm5cIikpIHsgdHlwZXNbaSQzXSA9IHByZXYkMTsgfVxuICAgICAgcHJldiQxID0gdHlwZSQyO1xuICAgIH1cblxuICAgIC8vIFc1LiBBIHNlcXVlbmNlIG9mIEV1cm9wZWFuIHRlcm1pbmF0b3JzIGFkamFjZW50IHRvIEV1cm9wZWFuXG4gICAgLy8gbnVtYmVycyBjaGFuZ2VzIHRvIGFsbCBFdXJvcGVhbiBudW1iZXJzLlxuICAgIC8vIFc2LiBPdGhlcndpc2UsIHNlcGFyYXRvcnMgYW5kIHRlcm1pbmF0b3JzIGNoYW5nZSB0byBPdGhlclxuICAgIC8vIE5ldXRyYWwuXG4gICAgZm9yICh2YXIgaSQ0ID0gMDsgaSQ0IDwgbGVuOyArK2kkNCkge1xuICAgICAgdmFyIHR5cGUkMyA9IHR5cGVzW2kkNF07XG4gICAgICBpZiAodHlwZSQzID09IFwiLFwiKSB7IHR5cGVzW2kkNF0gPSBcIk5cIjsgfVxuICAgICAgZWxzZSBpZiAodHlwZSQzID09IFwiJVwiKSB7XG4gICAgICAgIHZhciBlbmQgPSAodm9pZCAwKTtcbiAgICAgICAgZm9yIChlbmQgPSBpJDQgKyAxOyBlbmQgPCBsZW4gJiYgdHlwZXNbZW5kXSA9PSBcIiVcIjsgKytlbmQpIHt9XG4gICAgICAgIHZhciByZXBsYWNlID0gKGkkNCAmJiB0eXBlc1tpJDQtMV0gPT0gXCIhXCIpIHx8IChlbmQgPCBsZW4gJiYgdHlwZXNbZW5kXSA9PSBcIjFcIikgPyBcIjFcIiA6IFwiTlwiO1xuICAgICAgICBmb3IgKHZhciBqID0gaSQ0OyBqIDwgZW5kOyArK2opIHsgdHlwZXNbal0gPSByZXBsYWNlOyB9XG4gICAgICAgIGkkNCA9IGVuZCAtIDE7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gVzcuIFNlYXJjaCBiYWNrd2FyZHMgZnJvbSBlYWNoIGluc3RhbmNlIG9mIGEgRXVyb3BlYW4gbnVtYmVyXG4gICAgLy8gdW50aWwgdGhlIGZpcnN0IHN0cm9uZyB0eXBlIChSLCBMLCBvciBzb3IpIGlzIGZvdW5kLiBJZiBhbiBMIGlzXG4gICAgLy8gZm91bmQsIHRoZW4gY2hhbmdlIHRoZSB0eXBlIG9mIHRoZSBFdXJvcGVhbiBudW1iZXIgdG8gTC5cbiAgICBmb3IgKHZhciBpJDUgPSAwLCBjdXIkMSA9IG91dGVyVHlwZTsgaSQ1IDwgbGVuOyArK2kkNSkge1xuICAgICAgdmFyIHR5cGUkNCA9IHR5cGVzW2kkNV07XG4gICAgICBpZiAoY3VyJDEgPT0gXCJMXCIgJiYgdHlwZSQ0ID09IFwiMVwiKSB7IHR5cGVzW2kkNV0gPSBcIkxcIjsgfVxuICAgICAgZWxzZSBpZiAoaXNTdHJvbmcudGVzdCh0eXBlJDQpKSB7IGN1ciQxID0gdHlwZSQ0OyB9XG4gICAgfVxuXG4gICAgLy8gTjEuIEEgc2VxdWVuY2Ugb2YgbmV1dHJhbHMgdGFrZXMgdGhlIGRpcmVjdGlvbiBvZiB0aGVcbiAgICAvLyBzdXJyb3VuZGluZyBzdHJvbmcgdGV4dCBpZiB0aGUgdGV4dCBvbiBib3RoIHNpZGVzIGhhcyB0aGUgc2FtZVxuICAgIC8vIGRpcmVjdGlvbi4gRXVyb3BlYW4gYW5kIEFyYWJpYyBudW1iZXJzIGFjdCBhcyBpZiB0aGV5IHdlcmUgUiBpblxuICAgIC8vIHRlcm1zIG9mIHRoZWlyIGluZmx1ZW5jZSBvbiBuZXV0cmFscy4gU3RhcnQtb2YtbGV2ZWwtcnVuIChzb3IpXG4gICAgLy8gYW5kIGVuZC1vZi1sZXZlbC1ydW4gKGVvcikgYXJlIHVzZWQgYXQgbGV2ZWwgcnVuIGJvdW5kYXJpZXMuXG4gICAgLy8gTjIuIEFueSByZW1haW5pbmcgbmV1dHJhbHMgdGFrZSB0aGUgZW1iZWRkaW5nIGRpcmVjdGlvbi5cbiAgICBmb3IgKHZhciBpJDYgPSAwOyBpJDYgPCBsZW47ICsraSQ2KSB7XG4gICAgICBpZiAoaXNOZXV0cmFsLnRlc3QodHlwZXNbaSQ2XSkpIHtcbiAgICAgICAgdmFyIGVuZCQxID0gKHZvaWQgMCk7XG4gICAgICAgIGZvciAoZW5kJDEgPSBpJDYgKyAxOyBlbmQkMSA8IGxlbiAmJiBpc05ldXRyYWwudGVzdCh0eXBlc1tlbmQkMV0pOyArK2VuZCQxKSB7fVxuICAgICAgICB2YXIgYmVmb3JlID0gKGkkNiA/IHR5cGVzW2kkNi0xXSA6IG91dGVyVHlwZSkgPT0gXCJMXCI7XG4gICAgICAgIHZhciBhZnRlciA9IChlbmQkMSA8IGxlbiA/IHR5cGVzW2VuZCQxXSA6IG91dGVyVHlwZSkgPT0gXCJMXCI7XG4gICAgICAgIHZhciByZXBsYWNlJDEgPSBiZWZvcmUgPT0gYWZ0ZXIgPyAoYmVmb3JlID8gXCJMXCIgOiBcIlJcIikgOiBvdXRlclR5cGU7XG4gICAgICAgIGZvciAodmFyIGokMSA9IGkkNjsgaiQxIDwgZW5kJDE7ICsraiQxKSB7IHR5cGVzW2okMV0gPSByZXBsYWNlJDE7IH1cbiAgICAgICAgaSQ2ID0gZW5kJDEgLSAxO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIEhlcmUgd2UgZGVwYXJ0IGZyb20gdGhlIGRvY3VtZW50ZWQgYWxnb3JpdGhtLCBpbiBvcmRlciB0byBhdm9pZFxuICAgIC8vIGJ1aWxkaW5nIHVwIGFuIGFjdHVhbCBsZXZlbHMgYXJyYXkuIFNpbmNlIHRoZXJlIGFyZSBvbmx5IHRocmVlXG4gICAgLy8gbGV2ZWxzICgwLCAxLCAyKSBpbiBhbiBpbXBsZW1lbnRhdGlvbiB0aGF0IGRvZXNuJ3QgdGFrZVxuICAgIC8vIGV4cGxpY2l0IGVtYmVkZGluZyBpbnRvIGFjY291bnQsIHdlIGNhbiBidWlsZCB1cCB0aGUgb3JkZXIgb25cbiAgICAvLyB0aGUgZmx5LCB3aXRob3V0IGZvbGxvd2luZyB0aGUgbGV2ZWwtYmFzZWQgYWxnb3JpdGhtLlxuICAgIHZhciBvcmRlciA9IFtdLCBtO1xuICAgIGZvciAodmFyIGkkNyA9IDA7IGkkNyA8IGxlbjspIHtcbiAgICAgIGlmIChjb3VudHNBc0xlZnQudGVzdCh0eXBlc1tpJDddKSkge1xuICAgICAgICB2YXIgc3RhcnQgPSBpJDc7XG4gICAgICAgIGZvciAoKytpJDc7IGkkNyA8IGxlbiAmJiBjb3VudHNBc0xlZnQudGVzdCh0eXBlc1tpJDddKTsgKytpJDcpIHt9XG4gICAgICAgIG9yZGVyLnB1c2gobmV3IEJpZGlTcGFuKDAsIHN0YXJ0LCBpJDcpKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBwb3MgPSBpJDcsIGF0ID0gb3JkZXIubGVuZ3RoO1xuICAgICAgICBmb3IgKCsraSQ3OyBpJDcgPCBsZW4gJiYgdHlwZXNbaSQ3XSAhPSBcIkxcIjsgKytpJDcpIHt9XG4gICAgICAgIGZvciAodmFyIGokMiA9IHBvczsgaiQyIDwgaSQ3Oykge1xuICAgICAgICAgIGlmIChjb3VudHNBc051bS50ZXN0KHR5cGVzW2okMl0pKSB7XG4gICAgICAgICAgICBpZiAocG9zIDwgaiQyKSB7IG9yZGVyLnNwbGljZShhdCwgMCwgbmV3IEJpZGlTcGFuKDEsIHBvcywgaiQyKSk7IH1cbiAgICAgICAgICAgIHZhciBuc3RhcnQgPSBqJDI7XG4gICAgICAgICAgICBmb3IgKCsraiQyOyBqJDIgPCBpJDcgJiYgY291bnRzQXNOdW0udGVzdCh0eXBlc1tqJDJdKTsgKytqJDIpIHt9XG4gICAgICAgICAgICBvcmRlci5zcGxpY2UoYXQsIDAsIG5ldyBCaWRpU3BhbigyLCBuc3RhcnQsIGokMikpO1xuICAgICAgICAgICAgcG9zID0gaiQyO1xuICAgICAgICAgIH0gZWxzZSB7ICsraiQyOyB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHBvcyA8IGkkNykgeyBvcmRlci5zcGxpY2UoYXQsIDAsIG5ldyBCaWRpU3BhbigxLCBwb3MsIGkkNykpOyB9XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChkaXJlY3Rpb24gPT0gXCJsdHJcIikge1xuICAgICAgaWYgKG9yZGVyWzBdLmxldmVsID09IDEgJiYgKG0gPSBzdHIubWF0Y2goL15cXHMrLykpKSB7XG4gICAgICAgIG9yZGVyWzBdLmZyb20gPSBtWzBdLmxlbmd0aDtcbiAgICAgICAgb3JkZXIudW5zaGlmdChuZXcgQmlkaVNwYW4oMCwgMCwgbVswXS5sZW5ndGgpKTtcbiAgICAgIH1cbiAgICAgIGlmIChsc3Qob3JkZXIpLmxldmVsID09IDEgJiYgKG0gPSBzdHIubWF0Y2goL1xccyskLykpKSB7XG4gICAgICAgIGxzdChvcmRlcikudG8gLT0gbVswXS5sZW5ndGg7XG4gICAgICAgIG9yZGVyLnB1c2gobmV3IEJpZGlTcGFuKDAsIGxlbiAtIG1bMF0ubGVuZ3RoLCBsZW4pKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gZGlyZWN0aW9uID09IFwicnRsXCIgPyBvcmRlci5yZXZlcnNlKCkgOiBvcmRlclxuICB9XG59KSgpO1xuXG4vLyBHZXQgdGhlIGJpZGkgb3JkZXJpbmcgZm9yIHRoZSBnaXZlbiBsaW5lIChhbmQgY2FjaGUgaXQpLiBSZXR1cm5zXG4vLyBmYWxzZSBmb3IgbGluZXMgdGhhdCBhcmUgZnVsbHkgbGVmdC10by1yaWdodCwgYW5kIGFuIGFycmF5IG9mXG4vLyBCaWRpU3BhbiBvYmplY3RzIG90aGVyd2lzZS5cbmZ1bmN0aW9uIGdldE9yZGVyKGxpbmUsIGRpcmVjdGlvbikge1xuICB2YXIgb3JkZXIgPSBsaW5lLm9yZGVyO1xuICBpZiAob3JkZXIgPT0gbnVsbCkgeyBvcmRlciA9IGxpbmUub3JkZXIgPSBiaWRpT3JkZXJpbmcobGluZS50ZXh0LCBkaXJlY3Rpb24pOyB9XG4gIHJldHVybiBvcmRlclxufVxuXG4vLyBFVkVOVCBIQU5ETElOR1xuXG4vLyBMaWdodHdlaWdodCBldmVudCBmcmFtZXdvcmsuIG9uL29mZiBhbHNvIHdvcmsgb24gRE9NIG5vZGVzLFxuLy8gcmVnaXN0ZXJpbmcgbmF0aXZlIERPTSBoYW5kbGVycy5cblxudmFyIG5vSGFuZGxlcnMgPSBbXTtcblxudmFyIG9uID0gZnVuY3Rpb24oZW1pdHRlciwgdHlwZSwgZikge1xuICBpZiAoZW1pdHRlci5hZGRFdmVudExpc3RlbmVyKSB7XG4gICAgZW1pdHRlci5hZGRFdmVudExpc3RlbmVyKHR5cGUsIGYsIGZhbHNlKTtcbiAgfSBlbHNlIGlmIChlbWl0dGVyLmF0dGFjaEV2ZW50KSB7XG4gICAgZW1pdHRlci5hdHRhY2hFdmVudChcIm9uXCIgKyB0eXBlLCBmKTtcbiAgfSBlbHNlIHtcbiAgICB2YXIgbWFwJCQxID0gZW1pdHRlci5faGFuZGxlcnMgfHwgKGVtaXR0ZXIuX2hhbmRsZXJzID0ge30pO1xuICAgIG1hcCQkMVt0eXBlXSA9IChtYXAkJDFbdHlwZV0gfHwgbm9IYW5kbGVycykuY29uY2F0KGYpO1xuICB9XG59O1xuXG5mdW5jdGlvbiBnZXRIYW5kbGVycyhlbWl0dGVyLCB0eXBlKSB7XG4gIHJldHVybiBlbWl0dGVyLl9oYW5kbGVycyAmJiBlbWl0dGVyLl9oYW5kbGVyc1t0eXBlXSB8fCBub0hhbmRsZXJzXG59XG5cbmZ1bmN0aW9uIG9mZihlbWl0dGVyLCB0eXBlLCBmKSB7XG4gIGlmIChlbWl0dGVyLnJlbW92ZUV2ZW50TGlzdGVuZXIpIHtcbiAgICBlbWl0dGVyLnJlbW92ZUV2ZW50TGlzdGVuZXIodHlwZSwgZiwgZmFsc2UpO1xuICB9IGVsc2UgaWYgKGVtaXR0ZXIuZGV0YWNoRXZlbnQpIHtcbiAgICBlbWl0dGVyLmRldGFjaEV2ZW50KFwib25cIiArIHR5cGUsIGYpO1xuICB9IGVsc2Uge1xuICAgIHZhciBtYXAkJDEgPSBlbWl0dGVyLl9oYW5kbGVycywgYXJyID0gbWFwJCQxICYmIG1hcCQkMVt0eXBlXTtcbiAgICBpZiAoYXJyKSB7XG4gICAgICB2YXIgaW5kZXggPSBpbmRleE9mKGFyciwgZik7XG4gICAgICBpZiAoaW5kZXggPiAtMSlcbiAgICAgICAgeyBtYXAkJDFbdHlwZV0gPSBhcnIuc2xpY2UoMCwgaW5kZXgpLmNvbmNhdChhcnIuc2xpY2UoaW5kZXggKyAxKSk7IH1cbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gc2lnbmFsKGVtaXR0ZXIsIHR5cGUgLyosIHZhbHVlcy4uLiovKSB7XG4gIHZhciBoYW5kbGVycyA9IGdldEhhbmRsZXJzKGVtaXR0ZXIsIHR5cGUpO1xuICBpZiAoIWhhbmRsZXJzLmxlbmd0aCkgeyByZXR1cm4gfVxuICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMik7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgaGFuZGxlcnMubGVuZ3RoOyArK2kpIHsgaGFuZGxlcnNbaV0uYXBwbHkobnVsbCwgYXJncyk7IH1cbn1cblxuLy8gVGhlIERPTSBldmVudHMgdGhhdCBDb2RlTWlycm9yIGhhbmRsZXMgY2FuIGJlIG92ZXJyaWRkZW4gYnlcbi8vIHJlZ2lzdGVyaW5nIGEgKG5vbi1ET00pIGhhbmRsZXIgb24gdGhlIGVkaXRvciBmb3IgdGhlIGV2ZW50IG5hbWUsXG4vLyBhbmQgcHJldmVudERlZmF1bHQtaW5nIHRoZSBldmVudCBpbiB0aGF0IGhhbmRsZXIuXG5mdW5jdGlvbiBzaWduYWxET01FdmVudChjbSwgZSwgb3ZlcnJpZGUpIHtcbiAgaWYgKHR5cGVvZiBlID09IFwic3RyaW5nXCIpXG4gICAgeyBlID0ge3R5cGU6IGUsIHByZXZlbnREZWZhdWx0OiBmdW5jdGlvbigpIHsgdGhpcy5kZWZhdWx0UHJldmVudGVkID0gdHJ1ZTsgfX07IH1cbiAgc2lnbmFsKGNtLCBvdmVycmlkZSB8fCBlLnR5cGUsIGNtLCBlKTtcbiAgcmV0dXJuIGVfZGVmYXVsdFByZXZlbnRlZChlKSB8fCBlLmNvZGVtaXJyb3JJZ25vcmVcbn1cblxuZnVuY3Rpb24gc2lnbmFsQ3Vyc29yQWN0aXZpdHkoY20pIHtcbiAgdmFyIGFyciA9IGNtLl9oYW5kbGVycyAmJiBjbS5faGFuZGxlcnMuY3Vyc29yQWN0aXZpdHk7XG4gIGlmICghYXJyKSB7IHJldHVybiB9XG4gIHZhciBzZXQgPSBjbS5jdXJPcC5jdXJzb3JBY3Rpdml0eUhhbmRsZXJzIHx8IChjbS5jdXJPcC5jdXJzb3JBY3Rpdml0eUhhbmRsZXJzID0gW10pO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGFyci5sZW5ndGg7ICsraSkgeyBpZiAoaW5kZXhPZihzZXQsIGFycltpXSkgPT0gLTEpXG4gICAgeyBzZXQucHVzaChhcnJbaV0pOyB9IH1cbn1cblxuZnVuY3Rpb24gaGFzSGFuZGxlcihlbWl0dGVyLCB0eXBlKSB7XG4gIHJldHVybiBnZXRIYW5kbGVycyhlbWl0dGVyLCB0eXBlKS5sZW5ndGggPiAwXG59XG5cbi8vIEFkZCBvbiBhbmQgb2ZmIG1ldGhvZHMgdG8gYSBjb25zdHJ1Y3RvcidzIHByb3RvdHlwZSwgdG8gbWFrZVxuLy8gcmVnaXN0ZXJpbmcgZXZlbnRzIG9uIHN1Y2ggb2JqZWN0cyBtb3JlIGNvbnZlbmllbnQuXG5mdW5jdGlvbiBldmVudE1peGluKGN0b3IpIHtcbiAgY3Rvci5wcm90b3R5cGUub24gPSBmdW5jdGlvbih0eXBlLCBmKSB7b24odGhpcywgdHlwZSwgZik7fTtcbiAgY3Rvci5wcm90b3R5cGUub2ZmID0gZnVuY3Rpb24odHlwZSwgZikge29mZih0aGlzLCB0eXBlLCBmKTt9O1xufVxuXG4vLyBEdWUgdG8gdGhlIGZhY3QgdGhhdCB3ZSBzdGlsbCBzdXBwb3J0IGp1cmFzc2ljIElFIHZlcnNpb25zLCBzb21lXG4vLyBjb21wYXRpYmlsaXR5IHdyYXBwZXJzIGFyZSBuZWVkZWQuXG5cbmZ1bmN0aW9uIGVfcHJldmVudERlZmF1bHQoZSkge1xuICBpZiAoZS5wcmV2ZW50RGVmYXVsdCkgeyBlLnByZXZlbnREZWZhdWx0KCk7IH1cbiAgZWxzZSB7IGUucmV0dXJuVmFsdWUgPSBmYWxzZTsgfVxufVxuZnVuY3Rpb24gZV9zdG9wUHJvcGFnYXRpb24oZSkge1xuICBpZiAoZS5zdG9wUHJvcGFnYXRpb24pIHsgZS5zdG9wUHJvcGFnYXRpb24oKTsgfVxuICBlbHNlIHsgZS5jYW5jZWxCdWJibGUgPSB0cnVlOyB9XG59XG5mdW5jdGlvbiBlX2RlZmF1bHRQcmV2ZW50ZWQoZSkge1xuICByZXR1cm4gZS5kZWZhdWx0UHJldmVudGVkICE9IG51bGwgPyBlLmRlZmF1bHRQcmV2ZW50ZWQgOiBlLnJldHVyblZhbHVlID09IGZhbHNlXG59XG5mdW5jdGlvbiBlX3N0b3AoZSkge2VfcHJldmVudERlZmF1bHQoZSk7IGVfc3RvcFByb3BhZ2F0aW9uKGUpO31cblxuZnVuY3Rpb24gZV90YXJnZXQoZSkge3JldHVybiBlLnRhcmdldCB8fCBlLnNyY0VsZW1lbnR9XG5mdW5jdGlvbiBlX2J1dHRvbihlKSB7XG4gIHZhciBiID0gZS53aGljaDtcbiAgaWYgKGIgPT0gbnVsbCkge1xuICAgIGlmIChlLmJ1dHRvbiAmIDEpIHsgYiA9IDE7IH1cbiAgICBlbHNlIGlmIChlLmJ1dHRvbiAmIDIpIHsgYiA9IDM7IH1cbiAgICBlbHNlIGlmIChlLmJ1dHRvbiAmIDQpIHsgYiA9IDI7IH1cbiAgfVxuICBpZiAobWFjICYmIGUuY3RybEtleSAmJiBiID09IDEpIHsgYiA9IDM7IH1cbiAgcmV0dXJuIGJcbn1cblxuLy8gRGV0ZWN0IGRyYWctYW5kLWRyb3BcbnZhciBkcmFnQW5kRHJvcCA9IGZ1bmN0aW9uKCkge1xuICAvLyBUaGVyZSBpcyAqc29tZSoga2luZCBvZiBkcmFnLWFuZC1kcm9wIHN1cHBvcnQgaW4gSUU2LTgsIGJ1dCBJXG4gIC8vIGNvdWxkbid0IGdldCBpdCB0byB3b3JrIHlldC5cbiAgaWYgKGllICYmIGllX3ZlcnNpb24gPCA5KSB7IHJldHVybiBmYWxzZSB9XG4gIHZhciBkaXYgPSBlbHQoJ2RpdicpO1xuICByZXR1cm4gXCJkcmFnZ2FibGVcIiBpbiBkaXYgfHwgXCJkcmFnRHJvcFwiIGluIGRpdlxufSgpO1xuXG52YXIgendzcFN1cHBvcnRlZDtcbmZ1bmN0aW9uIHplcm9XaWR0aEVsZW1lbnQobWVhc3VyZSkge1xuICBpZiAoendzcFN1cHBvcnRlZCA9PSBudWxsKSB7XG4gICAgdmFyIHRlc3QgPSBlbHQoXCJzcGFuXCIsIFwiXFx1MjAwYlwiKTtcbiAgICByZW1vdmVDaGlsZHJlbkFuZEFkZChtZWFzdXJlLCBlbHQoXCJzcGFuXCIsIFt0ZXN0LCBkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShcInhcIildKSk7XG4gICAgaWYgKG1lYXN1cmUuZmlyc3RDaGlsZC5vZmZzZXRIZWlnaHQgIT0gMClcbiAgICAgIHsgendzcFN1cHBvcnRlZCA9IHRlc3Qub2Zmc2V0V2lkdGggPD0gMSAmJiB0ZXN0Lm9mZnNldEhlaWdodCA+IDIgJiYgIShpZSAmJiBpZV92ZXJzaW9uIDwgOCk7IH1cbiAgfVxuICB2YXIgbm9kZSA9IHp3c3BTdXBwb3J0ZWQgPyBlbHQoXCJzcGFuXCIsIFwiXFx1MjAwYlwiKSA6XG4gICAgZWx0KFwic3BhblwiLCBcIlxcdTAwYTBcIiwgbnVsbCwgXCJkaXNwbGF5OiBpbmxpbmUtYmxvY2s7IHdpZHRoOiAxcHg7IG1hcmdpbi1yaWdodDogLTFweFwiKTtcbiAgbm9kZS5zZXRBdHRyaWJ1dGUoXCJjbS10ZXh0XCIsIFwiXCIpO1xuICByZXR1cm4gbm9kZVxufVxuXG4vLyBGZWF0dXJlLWRldGVjdCBJRSdzIGNydW1teSBjbGllbnQgcmVjdCByZXBvcnRpbmcgZm9yIGJpZGkgdGV4dFxudmFyIGJhZEJpZGlSZWN0cztcbmZ1bmN0aW9uIGhhc0JhZEJpZGlSZWN0cyhtZWFzdXJlKSB7XG4gIGlmIChiYWRCaWRpUmVjdHMgIT0gbnVsbCkgeyByZXR1cm4gYmFkQmlkaVJlY3RzIH1cbiAgdmFyIHR4dCA9IHJlbW92ZUNoaWxkcmVuQW5kQWRkKG1lYXN1cmUsIGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKFwiQVxcdTA2MmVBXCIpKTtcbiAgdmFyIHIwID0gcmFuZ2UodHh0LCAwLCAxKS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgdmFyIHIxID0gcmFuZ2UodHh0LCAxLCAyKS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgcmVtb3ZlQ2hpbGRyZW4obWVhc3VyZSk7XG4gIGlmICghcjAgfHwgcjAubGVmdCA9PSByMC5yaWdodCkgeyByZXR1cm4gZmFsc2UgfSAvLyBTYWZhcmkgcmV0dXJucyBudWxsIGluIHNvbWUgY2FzZXMgKCMyNzgwKVxuICByZXR1cm4gYmFkQmlkaVJlY3RzID0gKHIxLnJpZ2h0IC0gcjAucmlnaHQgPCAzKVxufVxuXG4vLyBTZWUgaWYgXCJcIi5zcGxpdCBpcyB0aGUgYnJva2VuIElFIHZlcnNpb24sIGlmIHNvLCBwcm92aWRlIGFuXG4vLyBhbHRlcm5hdGl2ZSB3YXkgdG8gc3BsaXQgbGluZXMuXG52YXIgc3BsaXRMaW5lc0F1dG8gPSBcIlxcblxcbmJcIi5zcGxpdCgvXFxuLykubGVuZ3RoICE9IDMgPyBmdW5jdGlvbiAoc3RyaW5nKSB7XG4gIHZhciBwb3MgPSAwLCByZXN1bHQgPSBbXSwgbCA9IHN0cmluZy5sZW5ndGg7XG4gIHdoaWxlIChwb3MgPD0gbCkge1xuICAgIHZhciBubCA9IHN0cmluZy5pbmRleE9mKFwiXFxuXCIsIHBvcyk7XG4gICAgaWYgKG5sID09IC0xKSB7IG5sID0gc3RyaW5nLmxlbmd0aDsgfVxuICAgIHZhciBsaW5lID0gc3RyaW5nLnNsaWNlKHBvcywgc3RyaW5nLmNoYXJBdChubCAtIDEpID09IFwiXFxyXCIgPyBubCAtIDEgOiBubCk7XG4gICAgdmFyIHJ0ID0gbGluZS5pbmRleE9mKFwiXFxyXCIpO1xuICAgIGlmIChydCAhPSAtMSkge1xuICAgICAgcmVzdWx0LnB1c2gobGluZS5zbGljZSgwLCBydCkpO1xuICAgICAgcG9zICs9IHJ0ICsgMTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmVzdWx0LnB1c2gobGluZSk7XG4gICAgICBwb3MgPSBubCArIDE7XG4gICAgfVxuICB9XG4gIHJldHVybiByZXN1bHRcbn0gOiBmdW5jdGlvbiAoc3RyaW5nKSB7IHJldHVybiBzdHJpbmcuc3BsaXQoL1xcclxcbj98XFxuLyk7IH07XG5cbnZhciBoYXNTZWxlY3Rpb24gPSB3aW5kb3cuZ2V0U2VsZWN0aW9uID8gZnVuY3Rpb24gKHRlKSB7XG4gIHRyeSB7IHJldHVybiB0ZS5zZWxlY3Rpb25TdGFydCAhPSB0ZS5zZWxlY3Rpb25FbmQgfVxuICBjYXRjaChlKSB7IHJldHVybiBmYWxzZSB9XG59IDogZnVuY3Rpb24gKHRlKSB7XG4gIHZhciByYW5nZSQkMTtcbiAgdHJ5IHtyYW5nZSQkMSA9IHRlLm93bmVyRG9jdW1lbnQuc2VsZWN0aW9uLmNyZWF0ZVJhbmdlKCk7fVxuICBjYXRjaChlKSB7fVxuICBpZiAoIXJhbmdlJCQxIHx8IHJhbmdlJCQxLnBhcmVudEVsZW1lbnQoKSAhPSB0ZSkgeyByZXR1cm4gZmFsc2UgfVxuICByZXR1cm4gcmFuZ2UkJDEuY29tcGFyZUVuZFBvaW50cyhcIlN0YXJ0VG9FbmRcIiwgcmFuZ2UkJDEpICE9IDBcbn07XG5cbnZhciBoYXNDb3B5RXZlbnQgPSAoZnVuY3Rpb24gKCkge1xuICB2YXIgZSA9IGVsdChcImRpdlwiKTtcbiAgaWYgKFwib25jb3B5XCIgaW4gZSkgeyByZXR1cm4gdHJ1ZSB9XG4gIGUuc2V0QXR0cmlidXRlKFwib25jb3B5XCIsIFwicmV0dXJuO1wiKTtcbiAgcmV0dXJuIHR5cGVvZiBlLm9uY29weSA9PSBcImZ1bmN0aW9uXCJcbn0pKCk7XG5cbnZhciBiYWRab29tZWRSZWN0cyA9IG51bGw7XG5mdW5jdGlvbiBoYXNCYWRab29tZWRSZWN0cyhtZWFzdXJlKSB7XG4gIGlmIChiYWRab29tZWRSZWN0cyAhPSBudWxsKSB7IHJldHVybiBiYWRab29tZWRSZWN0cyB9XG4gIHZhciBub2RlID0gcmVtb3ZlQ2hpbGRyZW5BbmRBZGQobWVhc3VyZSwgZWx0KFwic3BhblwiLCBcInhcIikpO1xuICB2YXIgbm9ybWFsID0gbm9kZS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgdmFyIGZyb21SYW5nZSA9IHJhbmdlKG5vZGUsIDAsIDEpLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICByZXR1cm4gYmFkWm9vbWVkUmVjdHMgPSBNYXRoLmFicyhub3JtYWwubGVmdCAtIGZyb21SYW5nZS5sZWZ0KSA+IDFcbn1cblxuLy8gS25vd24gbW9kZXMsIGJ5IG5hbWUgYW5kIGJ5IE1JTUVcbnZhciBtb2RlcyA9IHt9O1xudmFyIG1pbWVNb2RlcyA9IHt9O1xuXG4vLyBFeHRyYSBhcmd1bWVudHMgYXJlIHN0b3JlZCBhcyB0aGUgbW9kZSdzIGRlcGVuZGVuY2llcywgd2hpY2ggaXNcbi8vIHVzZWQgYnkgKGxlZ2FjeSkgbWVjaGFuaXNtcyBsaWtlIGxvYWRtb2RlLmpzIHRvIGF1dG9tYXRpY2FsbHlcbi8vIGxvYWQgYSBtb2RlLiAoUHJlZmVycmVkIG1lY2hhbmlzbSBpcyB0aGUgcmVxdWlyZS9kZWZpbmUgY2FsbHMuKVxuZnVuY3Rpb24gZGVmaW5lTW9kZShuYW1lLCBtb2RlKSB7XG4gIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMilcbiAgICB7IG1vZGUuZGVwZW5kZW5jaWVzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAyKTsgfVxuICBtb2Rlc1tuYW1lXSA9IG1vZGU7XG59XG5cbmZ1bmN0aW9uIGRlZmluZU1JTUUobWltZSwgc3BlYykge1xuICBtaW1lTW9kZXNbbWltZV0gPSBzcGVjO1xufVxuXG4vLyBHaXZlbiBhIE1JTUUgdHlwZSwgYSB7bmFtZSwgLi4ub3B0aW9uc30gY29uZmlnIG9iamVjdCwgb3IgYSBuYW1lXG4vLyBzdHJpbmcsIHJldHVybiBhIG1vZGUgY29uZmlnIG9iamVjdC5cbmZ1bmN0aW9uIHJlc29sdmVNb2RlKHNwZWMpIHtcbiAgaWYgKHR5cGVvZiBzcGVjID09IFwic3RyaW5nXCIgJiYgbWltZU1vZGVzLmhhc093blByb3BlcnR5KHNwZWMpKSB7XG4gICAgc3BlYyA9IG1pbWVNb2Rlc1tzcGVjXTtcbiAgfSBlbHNlIGlmIChzcGVjICYmIHR5cGVvZiBzcGVjLm5hbWUgPT0gXCJzdHJpbmdcIiAmJiBtaW1lTW9kZXMuaGFzT3duUHJvcGVydHkoc3BlYy5uYW1lKSkge1xuICAgIHZhciBmb3VuZCA9IG1pbWVNb2Rlc1tzcGVjLm5hbWVdO1xuICAgIGlmICh0eXBlb2YgZm91bmQgPT0gXCJzdHJpbmdcIikgeyBmb3VuZCA9IHtuYW1lOiBmb3VuZH07IH1cbiAgICBzcGVjID0gY3JlYXRlT2JqKGZvdW5kLCBzcGVjKTtcbiAgICBzcGVjLm5hbWUgPSBmb3VuZC5uYW1lO1xuICB9IGVsc2UgaWYgKHR5cGVvZiBzcGVjID09IFwic3RyaW5nXCIgJiYgL15bXFx3XFwtXStcXC9bXFx3XFwtXStcXCt4bWwkLy50ZXN0KHNwZWMpKSB7XG4gICAgcmV0dXJuIHJlc29sdmVNb2RlKFwiYXBwbGljYXRpb24veG1sXCIpXG4gIH0gZWxzZSBpZiAodHlwZW9mIHNwZWMgPT0gXCJzdHJpbmdcIiAmJiAvXltcXHdcXC1dK1xcL1tcXHdcXC1dK1xcK2pzb24kLy50ZXN0KHNwZWMpKSB7XG4gICAgcmV0dXJuIHJlc29sdmVNb2RlKFwiYXBwbGljYXRpb24vanNvblwiKVxuICB9XG4gIGlmICh0eXBlb2Ygc3BlYyA9PSBcInN0cmluZ1wiKSB7IHJldHVybiB7bmFtZTogc3BlY30gfVxuICBlbHNlIHsgcmV0dXJuIHNwZWMgfHwge25hbWU6IFwibnVsbFwifSB9XG59XG5cbi8vIEdpdmVuIGEgbW9kZSBzcGVjIChhbnl0aGluZyB0aGF0IHJlc29sdmVNb2RlIGFjY2VwdHMpLCBmaW5kIGFuZFxuLy8gaW5pdGlhbGl6ZSBhbiBhY3R1YWwgbW9kZSBvYmplY3QuXG5mdW5jdGlvbiBnZXRNb2RlKG9wdGlvbnMsIHNwZWMpIHtcbiAgc3BlYyA9IHJlc29sdmVNb2RlKHNwZWMpO1xuICB2YXIgbWZhY3RvcnkgPSBtb2Rlc1tzcGVjLm5hbWVdO1xuICBpZiAoIW1mYWN0b3J5KSB7IHJldHVybiBnZXRNb2RlKG9wdGlvbnMsIFwidGV4dC9wbGFpblwiKSB9XG4gIHZhciBtb2RlT2JqID0gbWZhY3Rvcnkob3B0aW9ucywgc3BlYyk7XG4gIGlmIChtb2RlRXh0ZW5zaW9ucy5oYXNPd25Qcm9wZXJ0eShzcGVjLm5hbWUpKSB7XG4gICAgdmFyIGV4dHMgPSBtb2RlRXh0ZW5zaW9uc1tzcGVjLm5hbWVdO1xuICAgIGZvciAodmFyIHByb3AgaW4gZXh0cykge1xuICAgICAgaWYgKCFleHRzLmhhc093blByb3BlcnR5KHByb3ApKSB7IGNvbnRpbnVlIH1cbiAgICAgIGlmIChtb2RlT2JqLmhhc093blByb3BlcnR5KHByb3ApKSB7IG1vZGVPYmpbXCJfXCIgKyBwcm9wXSA9IG1vZGVPYmpbcHJvcF07IH1cbiAgICAgIG1vZGVPYmpbcHJvcF0gPSBleHRzW3Byb3BdO1xuICAgIH1cbiAgfVxuICBtb2RlT2JqLm5hbWUgPSBzcGVjLm5hbWU7XG4gIGlmIChzcGVjLmhlbHBlclR5cGUpIHsgbW9kZU9iai5oZWxwZXJUeXBlID0gc3BlYy5oZWxwZXJUeXBlOyB9XG4gIGlmIChzcGVjLm1vZGVQcm9wcykgeyBmb3IgKHZhciBwcm9wJDEgaW4gc3BlYy5tb2RlUHJvcHMpXG4gICAgeyBtb2RlT2JqW3Byb3AkMV0gPSBzcGVjLm1vZGVQcm9wc1twcm9wJDFdOyB9IH1cblxuICByZXR1cm4gbW9kZU9ialxufVxuXG4vLyBUaGlzIGNhbiBiZSB1c2VkIHRvIGF0dGFjaCBwcm9wZXJ0aWVzIHRvIG1vZGUgb2JqZWN0cyBmcm9tXG4vLyBvdXRzaWRlIHRoZSBhY3R1YWwgbW9kZSBkZWZpbml0aW9uLlxudmFyIG1vZGVFeHRlbnNpb25zID0ge307XG5mdW5jdGlvbiBleHRlbmRNb2RlKG1vZGUsIHByb3BlcnRpZXMpIHtcbiAgdmFyIGV4dHMgPSBtb2RlRXh0ZW5zaW9ucy5oYXNPd25Qcm9wZXJ0eShtb2RlKSA/IG1vZGVFeHRlbnNpb25zW21vZGVdIDogKG1vZGVFeHRlbnNpb25zW21vZGVdID0ge30pO1xuICBjb3B5T2JqKHByb3BlcnRpZXMsIGV4dHMpO1xufVxuXG5mdW5jdGlvbiBjb3B5U3RhdGUobW9kZSwgc3RhdGUpIHtcbiAgaWYgKHN0YXRlID09PSB0cnVlKSB7IHJldHVybiBzdGF0ZSB9XG4gIGlmIChtb2RlLmNvcHlTdGF0ZSkgeyByZXR1cm4gbW9kZS5jb3B5U3RhdGUoc3RhdGUpIH1cbiAgdmFyIG5zdGF0ZSA9IHt9O1xuICBmb3IgKHZhciBuIGluIHN0YXRlKSB7XG4gICAgdmFyIHZhbCA9IHN0YXRlW25dO1xuICAgIGlmICh2YWwgaW5zdGFuY2VvZiBBcnJheSkgeyB2YWwgPSB2YWwuY29uY2F0KFtdKTsgfVxuICAgIG5zdGF0ZVtuXSA9IHZhbDtcbiAgfVxuICByZXR1cm4gbnN0YXRlXG59XG5cbi8vIEdpdmVuIGEgbW9kZSBhbmQgYSBzdGF0ZSAoZm9yIHRoYXQgbW9kZSksIGZpbmQgdGhlIGlubmVyIG1vZGUgYW5kXG4vLyBzdGF0ZSBhdCB0aGUgcG9zaXRpb24gdGhhdCB0aGUgc3RhdGUgcmVmZXJzIHRvLlxuZnVuY3Rpb24gaW5uZXJNb2RlKG1vZGUsIHN0YXRlKSB7XG4gIHZhciBpbmZvO1xuICB3aGlsZSAobW9kZS5pbm5lck1vZGUpIHtcbiAgICBpbmZvID0gbW9kZS5pbm5lck1vZGUoc3RhdGUpO1xuICAgIGlmICghaW5mbyB8fCBpbmZvLm1vZGUgPT0gbW9kZSkgeyBicmVhayB9XG4gICAgc3RhdGUgPSBpbmZvLnN0YXRlO1xuICAgIG1vZGUgPSBpbmZvLm1vZGU7XG4gIH1cbiAgcmV0dXJuIGluZm8gfHwge21vZGU6IG1vZGUsIHN0YXRlOiBzdGF0ZX1cbn1cblxuZnVuY3Rpb24gc3RhcnRTdGF0ZShtb2RlLCBhMSwgYTIpIHtcbiAgcmV0dXJuIG1vZGUuc3RhcnRTdGF0ZSA/IG1vZGUuc3RhcnRTdGF0ZShhMSwgYTIpIDogdHJ1ZVxufVxuXG4vLyBTVFJJTkcgU1RSRUFNXG5cbi8vIEZlZCB0byB0aGUgbW9kZSBwYXJzZXJzLCBwcm92aWRlcyBoZWxwZXIgZnVuY3Rpb25zIHRvIG1ha2Vcbi8vIHBhcnNlcnMgbW9yZSBzdWNjaW5jdC5cblxudmFyIFN0cmluZ1N0cmVhbSA9IGZ1bmN0aW9uKHN0cmluZywgdGFiU2l6ZSwgbGluZU9yYWNsZSkge1xuICB0aGlzLnBvcyA9IHRoaXMuc3RhcnQgPSAwO1xuICB0aGlzLnN0cmluZyA9IHN0cmluZztcbiAgdGhpcy50YWJTaXplID0gdGFiU2l6ZSB8fCA4O1xuICB0aGlzLmxhc3RDb2x1bW5Qb3MgPSB0aGlzLmxhc3RDb2x1bW5WYWx1ZSA9IDA7XG4gIHRoaXMubGluZVN0YXJ0ID0gMDtcbiAgdGhpcy5saW5lT3JhY2xlID0gbGluZU9yYWNsZTtcbn07XG5cblN0cmluZ1N0cmVhbS5wcm90b3R5cGUuZW9sID0gZnVuY3Rpb24gKCkge3JldHVybiB0aGlzLnBvcyA+PSB0aGlzLnN0cmluZy5sZW5ndGh9O1xuU3RyaW5nU3RyZWFtLnByb3RvdHlwZS5zb2wgPSBmdW5jdGlvbiAoKSB7cmV0dXJuIHRoaXMucG9zID09IHRoaXMubGluZVN0YXJ0fTtcblN0cmluZ1N0cmVhbS5wcm90b3R5cGUucGVlayA9IGZ1bmN0aW9uICgpIHtyZXR1cm4gdGhpcy5zdHJpbmcuY2hhckF0KHRoaXMucG9zKSB8fCB1bmRlZmluZWR9O1xuU3RyaW5nU3RyZWFtLnByb3RvdHlwZS5uZXh0ID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5wb3MgPCB0aGlzLnN0cmluZy5sZW5ndGgpXG4gICAgeyByZXR1cm4gdGhpcy5zdHJpbmcuY2hhckF0KHRoaXMucG9zKyspIH1cbn07XG5TdHJpbmdTdHJlYW0ucHJvdG90eXBlLmVhdCA9IGZ1bmN0aW9uIChtYXRjaCkge1xuICB2YXIgY2ggPSB0aGlzLnN0cmluZy5jaGFyQXQodGhpcy5wb3MpO1xuICB2YXIgb2s7XG4gIGlmICh0eXBlb2YgbWF0Y2ggPT0gXCJzdHJpbmdcIikgeyBvayA9IGNoID09IG1hdGNoOyB9XG4gIGVsc2UgeyBvayA9IGNoICYmIChtYXRjaC50ZXN0ID8gbWF0Y2gudGVzdChjaCkgOiBtYXRjaChjaCkpOyB9XG4gIGlmIChvaykgeysrdGhpcy5wb3M7IHJldHVybiBjaH1cbn07XG5TdHJpbmdTdHJlYW0ucHJvdG90eXBlLmVhdFdoaWxlID0gZnVuY3Rpb24gKG1hdGNoKSB7XG4gIHZhciBzdGFydCA9IHRoaXMucG9zO1xuICB3aGlsZSAodGhpcy5lYXQobWF0Y2gpKXt9XG4gIHJldHVybiB0aGlzLnBvcyA+IHN0YXJ0XG59O1xuU3RyaW5nU3RyZWFtLnByb3RvdHlwZS5lYXRTcGFjZSA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgdGhpcyQxID0gdGhpcztcblxuICB2YXIgc3RhcnQgPSB0aGlzLnBvcztcbiAgd2hpbGUgKC9bXFxzXFx1MDBhMF0vLnRlc3QodGhpcy5zdHJpbmcuY2hhckF0KHRoaXMucG9zKSkpIHsgKyt0aGlzJDEucG9zOyB9XG4gIHJldHVybiB0aGlzLnBvcyA+IHN0YXJ0XG59O1xuU3RyaW5nU3RyZWFtLnByb3RvdHlwZS5za2lwVG9FbmQgPSBmdW5jdGlvbiAoKSB7dGhpcy5wb3MgPSB0aGlzLnN0cmluZy5sZW5ndGg7fTtcblN0cmluZ1N0cmVhbS5wcm90b3R5cGUuc2tpcFRvID0gZnVuY3Rpb24gKGNoKSB7XG4gIHZhciBmb3VuZCA9IHRoaXMuc3RyaW5nLmluZGV4T2YoY2gsIHRoaXMucG9zKTtcbiAgaWYgKGZvdW5kID4gLTEpIHt0aGlzLnBvcyA9IGZvdW5kOyByZXR1cm4gdHJ1ZX1cbn07XG5TdHJpbmdTdHJlYW0ucHJvdG90eXBlLmJhY2tVcCA9IGZ1bmN0aW9uIChuKSB7dGhpcy5wb3MgLT0gbjt9O1xuU3RyaW5nU3RyZWFtLnByb3RvdHlwZS5jb2x1bW4gPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmxhc3RDb2x1bW5Qb3MgPCB0aGlzLnN0YXJ0KSB7XG4gICAgdGhpcy5sYXN0Q29sdW1uVmFsdWUgPSBjb3VudENvbHVtbih0aGlzLnN0cmluZywgdGhpcy5zdGFydCwgdGhpcy50YWJTaXplLCB0aGlzLmxhc3RDb2x1bW5Qb3MsIHRoaXMubGFzdENvbHVtblZhbHVlKTtcbiAgICB0aGlzLmxhc3RDb2x1bW5Qb3MgPSB0aGlzLnN0YXJ0O1xuICB9XG4gIHJldHVybiB0aGlzLmxhc3RDb2x1bW5WYWx1ZSAtICh0aGlzLmxpbmVTdGFydCA/IGNvdW50Q29sdW1uKHRoaXMuc3RyaW5nLCB0aGlzLmxpbmVTdGFydCwgdGhpcy50YWJTaXplKSA6IDApXG59O1xuU3RyaW5nU3RyZWFtLnByb3RvdHlwZS5pbmRlbnRhdGlvbiA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIGNvdW50Q29sdW1uKHRoaXMuc3RyaW5nLCBudWxsLCB0aGlzLnRhYlNpemUpIC1cbiAgICAodGhpcy5saW5lU3RhcnQgPyBjb3VudENvbHVtbih0aGlzLnN0cmluZywgdGhpcy5saW5lU3RhcnQsIHRoaXMudGFiU2l6ZSkgOiAwKVxufTtcblN0cmluZ1N0cmVhbS5wcm90b3R5cGUubWF0Y2ggPSBmdW5jdGlvbiAocGF0dGVybiwgY29uc3VtZSwgY2FzZUluc2Vuc2l0aXZlKSB7XG4gIGlmICh0eXBlb2YgcGF0dGVybiA9PSBcInN0cmluZ1wiKSB7XG4gICAgdmFyIGNhc2VkID0gZnVuY3Rpb24gKHN0cikgeyByZXR1cm4gY2FzZUluc2Vuc2l0aXZlID8gc3RyLnRvTG93ZXJDYXNlKCkgOiBzdHI7IH07XG4gICAgdmFyIHN1YnN0ciA9IHRoaXMuc3RyaW5nLnN1YnN0cih0aGlzLnBvcywgcGF0dGVybi5sZW5ndGgpO1xuICAgIGlmIChjYXNlZChzdWJzdHIpID09IGNhc2VkKHBhdHRlcm4pKSB7XG4gICAgICBpZiAoY29uc3VtZSAhPT0gZmFsc2UpIHsgdGhpcy5wb3MgKz0gcGF0dGVybi5sZW5ndGg7IH1cbiAgICAgIHJldHVybiB0cnVlXG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHZhciBtYXRjaCA9IHRoaXMuc3RyaW5nLnNsaWNlKHRoaXMucG9zKS5tYXRjaChwYXR0ZXJuKTtcbiAgICBpZiAobWF0Y2ggJiYgbWF0Y2guaW5kZXggPiAwKSB7IHJldHVybiBudWxsIH1cbiAgICBpZiAobWF0Y2ggJiYgY29uc3VtZSAhPT0gZmFsc2UpIHsgdGhpcy5wb3MgKz0gbWF0Y2hbMF0ubGVuZ3RoOyB9XG4gICAgcmV0dXJuIG1hdGNoXG4gIH1cbn07XG5TdHJpbmdTdHJlYW0ucHJvdG90eXBlLmN1cnJlbnQgPSBmdW5jdGlvbiAoKXtyZXR1cm4gdGhpcy5zdHJpbmcuc2xpY2UodGhpcy5zdGFydCwgdGhpcy5wb3MpfTtcblN0cmluZ1N0cmVhbS5wcm90b3R5cGUuaGlkZUZpcnN0Q2hhcnMgPSBmdW5jdGlvbiAobiwgaW5uZXIpIHtcbiAgdGhpcy5saW5lU3RhcnQgKz0gbjtcbiAgdHJ5IHsgcmV0dXJuIGlubmVyKCkgfVxuICBmaW5hbGx5IHsgdGhpcy5saW5lU3RhcnQgLT0gbjsgfVxufTtcblN0cmluZ1N0cmVhbS5wcm90b3R5cGUubG9va0FoZWFkID0gZnVuY3Rpb24gKG4pIHtcbiAgdmFyIG9yYWNsZSA9IHRoaXMubGluZU9yYWNsZTtcbiAgcmV0dXJuIG9yYWNsZSAmJiBvcmFjbGUubG9va0FoZWFkKG4pXG59O1xuU3RyaW5nU3RyZWFtLnByb3RvdHlwZS5iYXNlVG9rZW4gPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBvcmFjbGUgPSB0aGlzLmxpbmVPcmFjbGU7XG4gIHJldHVybiBvcmFjbGUgJiYgb3JhY2xlLmJhc2VUb2tlbih0aGlzLnBvcylcbn07XG5cbnZhciBTYXZlZENvbnRleHQgPSBmdW5jdGlvbihzdGF0ZSwgbG9va0FoZWFkKSB7XG4gIHRoaXMuc3RhdGUgPSBzdGF0ZTtcbiAgdGhpcy5sb29rQWhlYWQgPSBsb29rQWhlYWQ7XG59O1xuXG52YXIgQ29udGV4dCA9IGZ1bmN0aW9uKGRvYywgc3RhdGUsIGxpbmUsIGxvb2tBaGVhZCkge1xuICB0aGlzLnN0YXRlID0gc3RhdGU7XG4gIHRoaXMuZG9jID0gZG9jO1xuICB0aGlzLmxpbmUgPSBsaW5lO1xuICB0aGlzLm1heExvb2tBaGVhZCA9IGxvb2tBaGVhZCB8fCAwO1xuICB0aGlzLmJhc2VUb2tlbnMgPSBudWxsO1xuICB0aGlzLmJhc2VUb2tlblBvcyA9IDE7XG59O1xuXG5Db250ZXh0LnByb3RvdHlwZS5sb29rQWhlYWQgPSBmdW5jdGlvbiAobikge1xuICB2YXIgbGluZSA9IHRoaXMuZG9jLmdldExpbmUodGhpcy5saW5lICsgbik7XG4gIGlmIChsaW5lICE9IG51bGwgJiYgbiA+IHRoaXMubWF4TG9va0FoZWFkKSB7IHRoaXMubWF4TG9va0FoZWFkID0gbjsgfVxuICByZXR1cm4gbGluZVxufTtcblxuQ29udGV4dC5wcm90b3R5cGUuYmFzZVRva2VuID0gZnVuY3Rpb24gKG4pIHtcbiAgICB2YXIgdGhpcyQxID0gdGhpcztcblxuICBpZiAoIXRoaXMuYmFzZVRva2VucykgeyByZXR1cm4gbnVsbCB9XG4gIHdoaWxlICh0aGlzLmJhc2VUb2tlbnNbdGhpcy5iYXNlVG9rZW5Qb3NdIDw9IG4pXG4gICAgeyB0aGlzJDEuYmFzZVRva2VuUG9zICs9IDI7IH1cbiAgdmFyIHR5cGUgPSB0aGlzLmJhc2VUb2tlbnNbdGhpcy5iYXNlVG9rZW5Qb3MgKyAxXTtcbiAgcmV0dXJuIHt0eXBlOiB0eXBlICYmIHR5cGUucmVwbGFjZSgvKCB8XilvdmVybGF5IC4qLywgXCJcIiksXG4gICAgICAgICAgc2l6ZTogdGhpcy5iYXNlVG9rZW5zW3RoaXMuYmFzZVRva2VuUG9zXSAtIG59XG59O1xuXG5Db250ZXh0LnByb3RvdHlwZS5uZXh0TGluZSA9IGZ1bmN0aW9uICgpIHtcbiAgdGhpcy5saW5lKys7XG4gIGlmICh0aGlzLm1heExvb2tBaGVhZCA+IDApIHsgdGhpcy5tYXhMb29rQWhlYWQtLTsgfVxufTtcblxuQ29udGV4dC5mcm9tU2F2ZWQgPSBmdW5jdGlvbiAoZG9jLCBzYXZlZCwgbGluZSkge1xuICBpZiAoc2F2ZWQgaW5zdGFuY2VvZiBTYXZlZENvbnRleHQpXG4gICAgeyByZXR1cm4gbmV3IENvbnRleHQoZG9jLCBjb3B5U3RhdGUoZG9jLm1vZGUsIHNhdmVkLnN0YXRlKSwgbGluZSwgc2F2ZWQubG9va0FoZWFkKSB9XG4gIGVsc2VcbiAgICB7IHJldHVybiBuZXcgQ29udGV4dChkb2MsIGNvcHlTdGF0ZShkb2MubW9kZSwgc2F2ZWQpLCBsaW5lKSB9XG59O1xuXG5Db250ZXh0LnByb3RvdHlwZS5zYXZlID0gZnVuY3Rpb24gKGNvcHkpIHtcbiAgdmFyIHN0YXRlID0gY29weSAhPT0gZmFsc2UgPyBjb3B5U3RhdGUodGhpcy5kb2MubW9kZSwgdGhpcy5zdGF0ZSkgOiB0aGlzLnN0YXRlO1xuICByZXR1cm4gdGhpcy5tYXhMb29rQWhlYWQgPiAwID8gbmV3IFNhdmVkQ29udGV4dChzdGF0ZSwgdGhpcy5tYXhMb29rQWhlYWQpIDogc3RhdGVcbn07XG5cblxuLy8gQ29tcHV0ZSBhIHN0eWxlIGFycmF5IChhbiBhcnJheSBzdGFydGluZyB3aXRoIGEgbW9kZSBnZW5lcmF0aW9uXG4vLyAtLSBmb3IgaW52YWxpZGF0aW9uIC0tIGZvbGxvd2VkIGJ5IHBhaXJzIG9mIGVuZCBwb3NpdGlvbnMgYW5kXG4vLyBzdHlsZSBzdHJpbmdzKSwgd2hpY2ggaXMgdXNlZCB0byBoaWdobGlnaHQgdGhlIHRva2VucyBvbiB0aGVcbi8vIGxpbmUuXG5mdW5jdGlvbiBoaWdobGlnaHRMaW5lKGNtLCBsaW5lLCBjb250ZXh0LCBmb3JjZVRvRW5kKSB7XG4gIC8vIEEgc3R5bGVzIGFycmF5IGFsd2F5cyBzdGFydHMgd2l0aCBhIG51bWJlciBpZGVudGlmeWluZyB0aGVcbiAgLy8gbW9kZS9vdmVybGF5cyB0aGF0IGl0IGlzIGJhc2VkIG9uIChmb3IgZWFzeSBpbnZhbGlkYXRpb24pLlxuICB2YXIgc3QgPSBbY20uc3RhdGUubW9kZUdlbl0sIGxpbmVDbGFzc2VzID0ge307XG4gIC8vIENvbXB1dGUgdGhlIGJhc2UgYXJyYXkgb2Ygc3R5bGVzXG4gIHJ1bk1vZGUoY20sIGxpbmUudGV4dCwgY20uZG9jLm1vZGUsIGNvbnRleHQsIGZ1bmN0aW9uIChlbmQsIHN0eWxlKSB7IHJldHVybiBzdC5wdXNoKGVuZCwgc3R5bGUpOyB9LFxuICAgICAgICAgIGxpbmVDbGFzc2VzLCBmb3JjZVRvRW5kKTtcbiAgdmFyIHN0YXRlID0gY29udGV4dC5zdGF0ZTtcblxuICAvLyBSdW4gb3ZlcmxheXMsIGFkanVzdCBzdHlsZSBhcnJheS5cbiAgdmFyIGxvb3AgPSBmdW5jdGlvbiAoIG8gKSB7XG4gICAgY29udGV4dC5iYXNlVG9rZW5zID0gc3Q7XG4gICAgdmFyIG92ZXJsYXkgPSBjbS5zdGF0ZS5vdmVybGF5c1tvXSwgaSA9IDEsIGF0ID0gMDtcbiAgICBjb250ZXh0LnN0YXRlID0gdHJ1ZTtcbiAgICBydW5Nb2RlKGNtLCBsaW5lLnRleHQsIG92ZXJsYXkubW9kZSwgY29udGV4dCwgZnVuY3Rpb24gKGVuZCwgc3R5bGUpIHtcbiAgICAgIHZhciBzdGFydCA9IGk7XG4gICAgICAvLyBFbnN1cmUgdGhlcmUncyBhIHRva2VuIGVuZCBhdCB0aGUgY3VycmVudCBwb3NpdGlvbiwgYW5kIHRoYXQgaSBwb2ludHMgYXQgaXRcbiAgICAgIHdoaWxlIChhdCA8IGVuZCkge1xuICAgICAgICB2YXIgaV9lbmQgPSBzdFtpXTtcbiAgICAgICAgaWYgKGlfZW5kID4gZW5kKVxuICAgICAgICAgIHsgc3Quc3BsaWNlKGksIDEsIGVuZCwgc3RbaSsxXSwgaV9lbmQpOyB9XG4gICAgICAgIGkgKz0gMjtcbiAgICAgICAgYXQgPSBNYXRoLm1pbihlbmQsIGlfZW5kKTtcbiAgICAgIH1cbiAgICAgIGlmICghc3R5bGUpIHsgcmV0dXJuIH1cbiAgICAgIGlmIChvdmVybGF5Lm9wYXF1ZSkge1xuICAgICAgICBzdC5zcGxpY2Uoc3RhcnQsIGkgLSBzdGFydCwgZW5kLCBcIm92ZXJsYXkgXCIgKyBzdHlsZSk7XG4gICAgICAgIGkgPSBzdGFydCArIDI7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBmb3IgKDsgc3RhcnQgPCBpOyBzdGFydCArPSAyKSB7XG4gICAgICAgICAgdmFyIGN1ciA9IHN0W3N0YXJ0KzFdO1xuICAgICAgICAgIHN0W3N0YXJ0KzFdID0gKGN1ciA/IGN1ciArIFwiIFwiIDogXCJcIikgKyBcIm92ZXJsYXkgXCIgKyBzdHlsZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sIGxpbmVDbGFzc2VzKTtcbiAgICBjb250ZXh0LnN0YXRlID0gc3RhdGU7XG4gICAgY29udGV4dC5iYXNlVG9rZW5zID0gbnVsbDtcbiAgICBjb250ZXh0LmJhc2VUb2tlblBvcyA9IDE7XG4gIH07XG5cbiAgZm9yICh2YXIgbyA9IDA7IG8gPCBjbS5zdGF0ZS5vdmVybGF5cy5sZW5ndGg7ICsrbykgbG9vcCggbyApO1xuXG4gIHJldHVybiB7c3R5bGVzOiBzdCwgY2xhc3NlczogbGluZUNsYXNzZXMuYmdDbGFzcyB8fCBsaW5lQ2xhc3Nlcy50ZXh0Q2xhc3MgPyBsaW5lQ2xhc3NlcyA6IG51bGx9XG59XG5cbmZ1bmN0aW9uIGdldExpbmVTdHlsZXMoY20sIGxpbmUsIHVwZGF0ZUZyb250aWVyKSB7XG4gIGlmICghbGluZS5zdHlsZXMgfHwgbGluZS5zdHlsZXNbMF0gIT0gY20uc3RhdGUubW9kZUdlbikge1xuICAgIHZhciBjb250ZXh0ID0gZ2V0Q29udGV4dEJlZm9yZShjbSwgbGluZU5vKGxpbmUpKTtcbiAgICB2YXIgcmVzZXRTdGF0ZSA9IGxpbmUudGV4dC5sZW5ndGggPiBjbS5vcHRpb25zLm1heEhpZ2hsaWdodExlbmd0aCAmJiBjb3B5U3RhdGUoY20uZG9jLm1vZGUsIGNvbnRleHQuc3RhdGUpO1xuICAgIHZhciByZXN1bHQgPSBoaWdobGlnaHRMaW5lKGNtLCBsaW5lLCBjb250ZXh0KTtcbiAgICBpZiAocmVzZXRTdGF0ZSkgeyBjb250ZXh0LnN0YXRlID0gcmVzZXRTdGF0ZTsgfVxuICAgIGxpbmUuc3RhdGVBZnRlciA9IGNvbnRleHQuc2F2ZSghcmVzZXRTdGF0ZSk7XG4gICAgbGluZS5zdHlsZXMgPSByZXN1bHQuc3R5bGVzO1xuICAgIGlmIChyZXN1bHQuY2xhc3NlcykgeyBsaW5lLnN0eWxlQ2xhc3NlcyA9IHJlc3VsdC5jbGFzc2VzOyB9XG4gICAgZWxzZSBpZiAobGluZS5zdHlsZUNsYXNzZXMpIHsgbGluZS5zdHlsZUNsYXNzZXMgPSBudWxsOyB9XG4gICAgaWYgKHVwZGF0ZUZyb250aWVyID09PSBjbS5kb2MuaGlnaGxpZ2h0RnJvbnRpZXIpXG4gICAgICB7IGNtLmRvYy5tb2RlRnJvbnRpZXIgPSBNYXRoLm1heChjbS5kb2MubW9kZUZyb250aWVyLCArK2NtLmRvYy5oaWdobGlnaHRGcm9udGllcik7IH1cbiAgfVxuICByZXR1cm4gbGluZS5zdHlsZXNcbn1cblxuZnVuY3Rpb24gZ2V0Q29udGV4dEJlZm9yZShjbSwgbiwgcHJlY2lzZSkge1xuICB2YXIgZG9jID0gY20uZG9jLCBkaXNwbGF5ID0gY20uZGlzcGxheTtcbiAgaWYgKCFkb2MubW9kZS5zdGFydFN0YXRlKSB7IHJldHVybiBuZXcgQ29udGV4dChkb2MsIHRydWUsIG4pIH1cbiAgdmFyIHN0YXJ0ID0gZmluZFN0YXJ0TGluZShjbSwgbiwgcHJlY2lzZSk7XG4gIHZhciBzYXZlZCA9IHN0YXJ0ID4gZG9jLmZpcnN0ICYmIGdldExpbmUoZG9jLCBzdGFydCAtIDEpLnN0YXRlQWZ0ZXI7XG4gIHZhciBjb250ZXh0ID0gc2F2ZWQgPyBDb250ZXh0LmZyb21TYXZlZChkb2MsIHNhdmVkLCBzdGFydCkgOiBuZXcgQ29udGV4dChkb2MsIHN0YXJ0U3RhdGUoZG9jLm1vZGUpLCBzdGFydCk7XG5cbiAgZG9jLml0ZXIoc3RhcnQsIG4sIGZ1bmN0aW9uIChsaW5lKSB7XG4gICAgcHJvY2Vzc0xpbmUoY20sIGxpbmUudGV4dCwgY29udGV4dCk7XG4gICAgdmFyIHBvcyA9IGNvbnRleHQubGluZTtcbiAgICBsaW5lLnN0YXRlQWZ0ZXIgPSBwb3MgPT0gbiAtIDEgfHwgcG9zICUgNSA9PSAwIHx8IHBvcyA+PSBkaXNwbGF5LnZpZXdGcm9tICYmIHBvcyA8IGRpc3BsYXkudmlld1RvID8gY29udGV4dC5zYXZlKCkgOiBudWxsO1xuICAgIGNvbnRleHQubmV4dExpbmUoKTtcbiAgfSk7XG4gIGlmIChwcmVjaXNlKSB7IGRvYy5tb2RlRnJvbnRpZXIgPSBjb250ZXh0LmxpbmU7IH1cbiAgcmV0dXJuIGNvbnRleHRcbn1cblxuLy8gTGlnaHR3ZWlnaHQgZm9ybSBvZiBoaWdobGlnaHQgLS0gcHJvY2VlZCBvdmVyIHRoaXMgbGluZSBhbmRcbi8vIHVwZGF0ZSBzdGF0ZSwgYnV0IGRvbid0IHNhdmUgYSBzdHlsZSBhcnJheS4gVXNlZCBmb3IgbGluZXMgdGhhdFxuLy8gYXJlbid0IGN1cnJlbnRseSB2aXNpYmxlLlxuZnVuY3Rpb24gcHJvY2Vzc0xpbmUoY20sIHRleHQsIGNvbnRleHQsIHN0YXJ0QXQpIHtcbiAgdmFyIG1vZGUgPSBjbS5kb2MubW9kZTtcbiAgdmFyIHN0cmVhbSA9IG5ldyBTdHJpbmdTdHJlYW0odGV4dCwgY20ub3B0aW9ucy50YWJTaXplLCBjb250ZXh0KTtcbiAgc3RyZWFtLnN0YXJ0ID0gc3RyZWFtLnBvcyA9IHN0YXJ0QXQgfHwgMDtcbiAgaWYgKHRleHQgPT0gXCJcIikgeyBjYWxsQmxhbmtMaW5lKG1vZGUsIGNvbnRleHQuc3RhdGUpOyB9XG4gIHdoaWxlICghc3RyZWFtLmVvbCgpKSB7XG4gICAgcmVhZFRva2VuKG1vZGUsIHN0cmVhbSwgY29udGV4dC5zdGF0ZSk7XG4gICAgc3RyZWFtLnN0YXJ0ID0gc3RyZWFtLnBvcztcbiAgfVxufVxuXG5mdW5jdGlvbiBjYWxsQmxhbmtMaW5lKG1vZGUsIHN0YXRlKSB7XG4gIGlmIChtb2RlLmJsYW5rTGluZSkgeyByZXR1cm4gbW9kZS5ibGFua0xpbmUoc3RhdGUpIH1cbiAgaWYgKCFtb2RlLmlubmVyTW9kZSkgeyByZXR1cm4gfVxuICB2YXIgaW5uZXIgPSBpbm5lck1vZGUobW9kZSwgc3RhdGUpO1xuICBpZiAoaW5uZXIubW9kZS5ibGFua0xpbmUpIHsgcmV0dXJuIGlubmVyLm1vZGUuYmxhbmtMaW5lKGlubmVyLnN0YXRlKSB9XG59XG5cbmZ1bmN0aW9uIHJlYWRUb2tlbihtb2RlLCBzdHJlYW0sIHN0YXRlLCBpbm5lcikge1xuICBmb3IgKHZhciBpID0gMDsgaSA8IDEwOyBpKyspIHtcbiAgICBpZiAoaW5uZXIpIHsgaW5uZXJbMF0gPSBpbm5lck1vZGUobW9kZSwgc3RhdGUpLm1vZGU7IH1cbiAgICB2YXIgc3R5bGUgPSBtb2RlLnRva2VuKHN0cmVhbSwgc3RhdGUpO1xuICAgIGlmIChzdHJlYW0ucG9zID4gc3RyZWFtLnN0YXJ0KSB7IHJldHVybiBzdHlsZSB9XG4gIH1cbiAgdGhyb3cgbmV3IEVycm9yKFwiTW9kZSBcIiArIG1vZGUubmFtZSArIFwiIGZhaWxlZCB0byBhZHZhbmNlIHN0cmVhbS5cIilcbn1cblxudmFyIFRva2VuID0gZnVuY3Rpb24oc3RyZWFtLCB0eXBlLCBzdGF0ZSkge1xuICB0aGlzLnN0YXJ0ID0gc3RyZWFtLnN0YXJ0OyB0aGlzLmVuZCA9IHN0cmVhbS5wb3M7XG4gIHRoaXMuc3RyaW5nID0gc3RyZWFtLmN1cnJlbnQoKTtcbiAgdGhpcy50eXBlID0gdHlwZSB8fCBudWxsO1xuICB0aGlzLnN0YXRlID0gc3RhdGU7XG59O1xuXG4vLyBVdGlsaXR5IGZvciBnZXRUb2tlbkF0IGFuZCBnZXRMaW5lVG9rZW5zXG5mdW5jdGlvbiB0YWtlVG9rZW4oY20sIHBvcywgcHJlY2lzZSwgYXNBcnJheSkge1xuICB2YXIgZG9jID0gY20uZG9jLCBtb2RlID0gZG9jLm1vZGUsIHN0eWxlO1xuICBwb3MgPSBjbGlwUG9zKGRvYywgcG9zKTtcbiAgdmFyIGxpbmUgPSBnZXRMaW5lKGRvYywgcG9zLmxpbmUpLCBjb250ZXh0ID0gZ2V0Q29udGV4dEJlZm9yZShjbSwgcG9zLmxpbmUsIHByZWNpc2UpO1xuICB2YXIgc3RyZWFtID0gbmV3IFN0cmluZ1N0cmVhbShsaW5lLnRleHQsIGNtLm9wdGlvbnMudGFiU2l6ZSwgY29udGV4dCksIHRva2VucztcbiAgaWYgKGFzQXJyYXkpIHsgdG9rZW5zID0gW107IH1cbiAgd2hpbGUgKChhc0FycmF5IHx8IHN0cmVhbS5wb3MgPCBwb3MuY2gpICYmICFzdHJlYW0uZW9sKCkpIHtcbiAgICBzdHJlYW0uc3RhcnQgPSBzdHJlYW0ucG9zO1xuICAgIHN0eWxlID0gcmVhZFRva2VuKG1vZGUsIHN0cmVhbSwgY29udGV4dC5zdGF0ZSk7XG4gICAgaWYgKGFzQXJyYXkpIHsgdG9rZW5zLnB1c2gobmV3IFRva2VuKHN0cmVhbSwgc3R5bGUsIGNvcHlTdGF0ZShkb2MubW9kZSwgY29udGV4dC5zdGF0ZSkpKTsgfVxuICB9XG4gIHJldHVybiBhc0FycmF5ID8gdG9rZW5zIDogbmV3IFRva2VuKHN0cmVhbSwgc3R5bGUsIGNvbnRleHQuc3RhdGUpXG59XG5cbmZ1bmN0aW9uIGV4dHJhY3RMaW5lQ2xhc3Nlcyh0eXBlLCBvdXRwdXQpIHtcbiAgaWYgKHR5cGUpIHsgZm9yICg7Oykge1xuICAgIHZhciBsaW5lQ2xhc3MgPSB0eXBlLm1hdGNoKC8oPzpefFxccyspbGluZS0oYmFja2dyb3VuZC0pPyhcXFMrKS8pO1xuICAgIGlmICghbGluZUNsYXNzKSB7IGJyZWFrIH1cbiAgICB0eXBlID0gdHlwZS5zbGljZSgwLCBsaW5lQ2xhc3MuaW5kZXgpICsgdHlwZS5zbGljZShsaW5lQ2xhc3MuaW5kZXggKyBsaW5lQ2xhc3NbMF0ubGVuZ3RoKTtcbiAgICB2YXIgcHJvcCA9IGxpbmVDbGFzc1sxXSA/IFwiYmdDbGFzc1wiIDogXCJ0ZXh0Q2xhc3NcIjtcbiAgICBpZiAob3V0cHV0W3Byb3BdID09IG51bGwpXG4gICAgICB7IG91dHB1dFtwcm9wXSA9IGxpbmVDbGFzc1syXTsgfVxuICAgIGVsc2UgaWYgKCEobmV3IFJlZ0V4cChcIig/Ol58XFxzKVwiICsgbGluZUNsYXNzWzJdICsgXCIoPzokfFxccylcIikpLnRlc3Qob3V0cHV0W3Byb3BdKSlcbiAgICAgIHsgb3V0cHV0W3Byb3BdICs9IFwiIFwiICsgbGluZUNsYXNzWzJdOyB9XG4gIH0gfVxuICByZXR1cm4gdHlwZVxufVxuXG4vLyBSdW4gdGhlIGdpdmVuIG1vZGUncyBwYXJzZXIgb3ZlciBhIGxpbmUsIGNhbGxpbmcgZiBmb3IgZWFjaCB0b2tlbi5cbmZ1bmN0aW9uIHJ1bk1vZGUoY20sIHRleHQsIG1vZGUsIGNvbnRleHQsIGYsIGxpbmVDbGFzc2VzLCBmb3JjZVRvRW5kKSB7XG4gIHZhciBmbGF0dGVuU3BhbnMgPSBtb2RlLmZsYXR0ZW5TcGFucztcbiAgaWYgKGZsYXR0ZW5TcGFucyA9PSBudWxsKSB7IGZsYXR0ZW5TcGFucyA9IGNtLm9wdGlvbnMuZmxhdHRlblNwYW5zOyB9XG4gIHZhciBjdXJTdGFydCA9IDAsIGN1clN0eWxlID0gbnVsbDtcbiAgdmFyIHN0cmVhbSA9IG5ldyBTdHJpbmdTdHJlYW0odGV4dCwgY20ub3B0aW9ucy50YWJTaXplLCBjb250ZXh0KSwgc3R5bGU7XG4gIHZhciBpbm5lciA9IGNtLm9wdGlvbnMuYWRkTW9kZUNsYXNzICYmIFtudWxsXTtcbiAgaWYgKHRleHQgPT0gXCJcIikgeyBleHRyYWN0TGluZUNsYXNzZXMoY2FsbEJsYW5rTGluZShtb2RlLCBjb250ZXh0LnN0YXRlKSwgbGluZUNsYXNzZXMpOyB9XG4gIHdoaWxlICghc3RyZWFtLmVvbCgpKSB7XG4gICAgaWYgKHN0cmVhbS5wb3MgPiBjbS5vcHRpb25zLm1heEhpZ2hsaWdodExlbmd0aCkge1xuICAgICAgZmxhdHRlblNwYW5zID0gZmFsc2U7XG4gICAgICBpZiAoZm9yY2VUb0VuZCkgeyBwcm9jZXNzTGluZShjbSwgdGV4dCwgY29udGV4dCwgc3RyZWFtLnBvcyk7IH1cbiAgICAgIHN0cmVhbS5wb3MgPSB0ZXh0Lmxlbmd0aDtcbiAgICAgIHN0eWxlID0gbnVsbDtcbiAgICB9IGVsc2Uge1xuICAgICAgc3R5bGUgPSBleHRyYWN0TGluZUNsYXNzZXMocmVhZFRva2VuKG1vZGUsIHN0cmVhbSwgY29udGV4dC5zdGF0ZSwgaW5uZXIpLCBsaW5lQ2xhc3Nlcyk7XG4gICAgfVxuICAgIGlmIChpbm5lcikge1xuICAgICAgdmFyIG1OYW1lID0gaW5uZXJbMF0ubmFtZTtcbiAgICAgIGlmIChtTmFtZSkgeyBzdHlsZSA9IFwibS1cIiArIChzdHlsZSA/IG1OYW1lICsgXCIgXCIgKyBzdHlsZSA6IG1OYW1lKTsgfVxuICAgIH1cbiAgICBpZiAoIWZsYXR0ZW5TcGFucyB8fCBjdXJTdHlsZSAhPSBzdHlsZSkge1xuICAgICAgd2hpbGUgKGN1clN0YXJ0IDwgc3RyZWFtLnN0YXJ0KSB7XG4gICAgICAgIGN1clN0YXJ0ID0gTWF0aC5taW4oc3RyZWFtLnN0YXJ0LCBjdXJTdGFydCArIDUwMDApO1xuICAgICAgICBmKGN1clN0YXJ0LCBjdXJTdHlsZSk7XG4gICAgICB9XG4gICAgICBjdXJTdHlsZSA9IHN0eWxlO1xuICAgIH1cbiAgICBzdHJlYW0uc3RhcnQgPSBzdHJlYW0ucG9zO1xuICB9XG4gIHdoaWxlIChjdXJTdGFydCA8IHN0cmVhbS5wb3MpIHtcbiAgICAvLyBXZWJraXQgc2VlbXMgdG8gcmVmdXNlIHRvIHJlbmRlciB0ZXh0IG5vZGVzIGxvbmdlciB0aGFuIDU3NDQ0XG4gICAgLy8gY2hhcmFjdGVycywgYW5kIHJldHVybnMgaW5hY2N1cmF0ZSBtZWFzdXJlbWVudHMgaW4gbm9kZXNcbiAgICAvLyBzdGFydGluZyBhcm91bmQgNTAwMCBjaGFycy5cbiAgICB2YXIgcG9zID0gTWF0aC5taW4oc3RyZWFtLnBvcywgY3VyU3RhcnQgKyA1MDAwKTtcbiAgICBmKHBvcywgY3VyU3R5bGUpO1xuICAgIGN1clN0YXJ0ID0gcG9zO1xuICB9XG59XG5cbi8vIEZpbmRzIHRoZSBsaW5lIHRvIHN0YXJ0IHdpdGggd2hlbiBzdGFydGluZyBhIHBhcnNlLiBUcmllcyB0b1xuLy8gZmluZCBhIGxpbmUgd2l0aCBhIHN0YXRlQWZ0ZXIsIHNvIHRoYXQgaXQgY2FuIHN0YXJ0IHdpdGggYVxuLy8gdmFsaWQgc3RhdGUuIElmIHRoYXQgZmFpbHMsIGl0IHJldHVybnMgdGhlIGxpbmUgd2l0aCB0aGVcbi8vIHNtYWxsZXN0IGluZGVudGF0aW9uLCB3aGljaCB0ZW5kcyB0byBuZWVkIHRoZSBsZWFzdCBjb250ZXh0IHRvXG4vLyBwYXJzZSBjb3JyZWN0bHkuXG5mdW5jdGlvbiBmaW5kU3RhcnRMaW5lKGNtLCBuLCBwcmVjaXNlKSB7XG4gIHZhciBtaW5pbmRlbnQsIG1pbmxpbmUsIGRvYyA9IGNtLmRvYztcbiAgdmFyIGxpbSA9IHByZWNpc2UgPyAtMSA6IG4gLSAoY20uZG9jLm1vZGUuaW5uZXJNb2RlID8gMTAwMCA6IDEwMCk7XG4gIGZvciAodmFyIHNlYXJjaCA9IG47IHNlYXJjaCA+IGxpbTsgLS1zZWFyY2gpIHtcbiAgICBpZiAoc2VhcmNoIDw9IGRvYy5maXJzdCkgeyByZXR1cm4gZG9jLmZpcnN0IH1cbiAgICB2YXIgbGluZSA9IGdldExpbmUoZG9jLCBzZWFyY2ggLSAxKSwgYWZ0ZXIgPSBsaW5lLnN0YXRlQWZ0ZXI7XG4gICAgaWYgKGFmdGVyICYmICghcHJlY2lzZSB8fCBzZWFyY2ggKyAoYWZ0ZXIgaW5zdGFuY2VvZiBTYXZlZENvbnRleHQgPyBhZnRlci5sb29rQWhlYWQgOiAwKSA8PSBkb2MubW9kZUZyb250aWVyKSlcbiAgICAgIHsgcmV0dXJuIHNlYXJjaCB9XG4gICAgdmFyIGluZGVudGVkID0gY291bnRDb2x1bW4obGluZS50ZXh0LCBudWxsLCBjbS5vcHRpb25zLnRhYlNpemUpO1xuICAgIGlmIChtaW5saW5lID09IG51bGwgfHwgbWluaW5kZW50ID4gaW5kZW50ZWQpIHtcbiAgICAgIG1pbmxpbmUgPSBzZWFyY2ggLSAxO1xuICAgICAgbWluaW5kZW50ID0gaW5kZW50ZWQ7XG4gICAgfVxuICB9XG4gIHJldHVybiBtaW5saW5lXG59XG5cbmZ1bmN0aW9uIHJldHJlYXRGcm9udGllcihkb2MsIG4pIHtcbiAgZG9jLm1vZGVGcm9udGllciA9IE1hdGgubWluKGRvYy5tb2RlRnJvbnRpZXIsIG4pO1xuICBpZiAoZG9jLmhpZ2hsaWdodEZyb250aWVyIDwgbiAtIDEwKSB7IHJldHVybiB9XG4gIHZhciBzdGFydCA9IGRvYy5maXJzdDtcbiAgZm9yICh2YXIgbGluZSA9IG4gLSAxOyBsaW5lID4gc3RhcnQ7IGxpbmUtLSkge1xuICAgIHZhciBzYXZlZCA9IGdldExpbmUoZG9jLCBsaW5lKS5zdGF0ZUFmdGVyO1xuICAgIC8vIGNoYW5nZSBpcyBvbiAzXG4gICAgLy8gc3RhdGUgb24gbGluZSAxIGxvb2tlZCBhaGVhZCAyIC0tIHNvIHNhdyAzXG4gICAgLy8gdGVzdCAxICsgMiA8IDMgc2hvdWxkIGNvdmVyIHRoaXNcbiAgICBpZiAoc2F2ZWQgJiYgKCEoc2F2ZWQgaW5zdGFuY2VvZiBTYXZlZENvbnRleHQpIHx8IGxpbmUgKyBzYXZlZC5sb29rQWhlYWQgPCBuKSkge1xuICAgICAgc3RhcnQgPSBsaW5lICsgMTtcbiAgICAgIGJyZWFrXG4gICAgfVxuICB9XG4gIGRvYy5oaWdobGlnaHRGcm9udGllciA9IE1hdGgubWluKGRvYy5oaWdobGlnaHRGcm9udGllciwgc3RhcnQpO1xufVxuXG4vLyBMSU5FIERBVEEgU1RSVUNUVVJFXG5cbi8vIExpbmUgb2JqZWN0cy4gVGhlc2UgaG9sZCBzdGF0ZSByZWxhdGVkIHRvIGEgbGluZSwgaW5jbHVkaW5nXG4vLyBoaWdobGlnaHRpbmcgaW5mbyAodGhlIHN0eWxlcyBhcnJheSkuXG52YXIgTGluZSA9IGZ1bmN0aW9uKHRleHQsIG1hcmtlZFNwYW5zLCBlc3RpbWF0ZUhlaWdodCkge1xuICB0aGlzLnRleHQgPSB0ZXh0O1xuICBhdHRhY2hNYXJrZWRTcGFucyh0aGlzLCBtYXJrZWRTcGFucyk7XG4gIHRoaXMuaGVpZ2h0ID0gZXN0aW1hdGVIZWlnaHQgPyBlc3RpbWF0ZUhlaWdodCh0aGlzKSA6IDE7XG59O1xuXG5MaW5lLnByb3RvdHlwZS5saW5lTm8gPSBmdW5jdGlvbiAoKSB7IHJldHVybiBsaW5lTm8odGhpcykgfTtcbmV2ZW50TWl4aW4oTGluZSk7XG5cbi8vIENoYW5nZSB0aGUgY29udGVudCAodGV4dCwgbWFya2Vycykgb2YgYSBsaW5lLiBBdXRvbWF0aWNhbGx5XG4vLyBpbnZhbGlkYXRlcyBjYWNoZWQgaW5mb3JtYXRpb24gYW5kIHRyaWVzIHRvIHJlLWVzdGltYXRlIHRoZVxuLy8gbGluZSdzIGhlaWdodC5cbmZ1bmN0aW9uIHVwZGF0ZUxpbmUobGluZSwgdGV4dCwgbWFya2VkU3BhbnMsIGVzdGltYXRlSGVpZ2h0KSB7XG4gIGxpbmUudGV4dCA9IHRleHQ7XG4gIGlmIChsaW5lLnN0YXRlQWZ0ZXIpIHsgbGluZS5zdGF0ZUFmdGVyID0gbnVsbDsgfVxuICBpZiAobGluZS5zdHlsZXMpIHsgbGluZS5zdHlsZXMgPSBudWxsOyB9XG4gIGlmIChsaW5lLm9yZGVyICE9IG51bGwpIHsgbGluZS5vcmRlciA9IG51bGw7IH1cbiAgZGV0YWNoTWFya2VkU3BhbnMobGluZSk7XG4gIGF0dGFjaE1hcmtlZFNwYW5zKGxpbmUsIG1hcmtlZFNwYW5zKTtcbiAgdmFyIGVzdEhlaWdodCA9IGVzdGltYXRlSGVpZ2h0ID8gZXN0aW1hdGVIZWlnaHQobGluZSkgOiAxO1xuICBpZiAoZXN0SGVpZ2h0ICE9IGxpbmUuaGVpZ2h0KSB7IHVwZGF0ZUxpbmVIZWlnaHQobGluZSwgZXN0SGVpZ2h0KTsgfVxufVxuXG4vLyBEZXRhY2ggYSBsaW5lIGZyb20gdGhlIGRvY3VtZW50IHRyZWUgYW5kIGl0cyBtYXJrZXJzLlxuZnVuY3Rpb24gY2xlYW5VcExpbmUobGluZSkge1xuICBsaW5lLnBhcmVudCA9IG51bGw7XG4gIGRldGFjaE1hcmtlZFNwYW5zKGxpbmUpO1xufVxuXG4vLyBDb252ZXJ0IGEgc3R5bGUgYXMgcmV0dXJuZWQgYnkgYSBtb2RlIChlaXRoZXIgbnVsbCwgb3IgYSBzdHJpbmdcbi8vIGNvbnRhaW5pbmcgb25lIG9yIG1vcmUgc3R5bGVzKSB0byBhIENTUyBzdHlsZS4gVGhpcyBpcyBjYWNoZWQsXG4vLyBhbmQgYWxzbyBsb29rcyBmb3IgbGluZS13aWRlIHN0eWxlcy5cbnZhciBzdHlsZVRvQ2xhc3NDYWNoZSA9IHt9O1xudmFyIHN0eWxlVG9DbGFzc0NhY2hlV2l0aE1vZGUgPSB7fTtcbmZ1bmN0aW9uIGludGVycHJldFRva2VuU3R5bGUoc3R5bGUsIG9wdGlvbnMpIHtcbiAgaWYgKCFzdHlsZSB8fCAvXlxccyokLy50ZXN0KHN0eWxlKSkgeyByZXR1cm4gbnVsbCB9XG4gIHZhciBjYWNoZSA9IG9wdGlvbnMuYWRkTW9kZUNsYXNzID8gc3R5bGVUb0NsYXNzQ2FjaGVXaXRoTW9kZSA6IHN0eWxlVG9DbGFzc0NhY2hlO1xuICByZXR1cm4gY2FjaGVbc3R5bGVdIHx8XG4gICAgKGNhY2hlW3N0eWxlXSA9IHN0eWxlLnJlcGxhY2UoL1xcUysvZywgXCJjbS0kJlwiKSlcbn1cblxuLy8gUmVuZGVyIHRoZSBET00gcmVwcmVzZW50YXRpb24gb2YgdGhlIHRleHQgb2YgYSBsaW5lLiBBbHNvIGJ1aWxkc1xuLy8gdXAgYSAnbGluZSBtYXAnLCB3aGljaCBwb2ludHMgYXQgdGhlIERPTSBub2RlcyB0aGF0IHJlcHJlc2VudFxuLy8gc3BlY2lmaWMgc3RyZXRjaGVzIG9mIHRleHQsIGFuZCBpcyB1c2VkIGJ5IHRoZSBtZWFzdXJpbmcgY29kZS5cbi8vIFRoZSByZXR1cm5lZCBvYmplY3QgY29udGFpbnMgdGhlIERPTSBub2RlLCB0aGlzIG1hcCwgYW5kXG4vLyBpbmZvcm1hdGlvbiBhYm91dCBsaW5lLXdpZGUgc3R5bGVzIHRoYXQgd2VyZSBzZXQgYnkgdGhlIG1vZGUuXG5mdW5jdGlvbiBidWlsZExpbmVDb250ZW50KGNtLCBsaW5lVmlldykge1xuICAvLyBUaGUgcGFkZGluZy1yaWdodCBmb3JjZXMgdGhlIGVsZW1lbnQgdG8gaGF2ZSBhICdib3JkZXInLCB3aGljaFxuICAvLyBpcyBuZWVkZWQgb24gV2Via2l0IHRvIGJlIGFibGUgdG8gZ2V0IGxpbmUtbGV2ZWwgYm91bmRpbmdcbiAgLy8gcmVjdGFuZ2xlcyBmb3IgaXQgKGluIG1lYXN1cmVDaGFyKS5cbiAgdmFyIGNvbnRlbnQgPSBlbHRQKFwic3BhblwiLCBudWxsLCBudWxsLCB3ZWJraXQgPyBcInBhZGRpbmctcmlnaHQ6IC4xcHhcIiA6IG51bGwpO1xuICB2YXIgYnVpbGRlciA9IHtwcmU6IGVsdFAoXCJwcmVcIiwgW2NvbnRlbnRdLCBcIkNvZGVNaXJyb3ItbGluZVwiKSwgY29udGVudDogY29udGVudCxcbiAgICAgICAgICAgICAgICAgY29sOiAwLCBwb3M6IDAsIGNtOiBjbSxcbiAgICAgICAgICAgICAgICAgdHJhaWxpbmdTcGFjZTogZmFsc2UsXG4gICAgICAgICAgICAgICAgIHNwbGl0U3BhY2VzOiAoaWUgfHwgd2Via2l0KSAmJiBjbS5nZXRPcHRpb24oXCJsaW5lV3JhcHBpbmdcIil9O1xuICBsaW5lVmlldy5tZWFzdXJlID0ge307XG5cbiAgLy8gSXRlcmF0ZSBvdmVyIHRoZSBsb2dpY2FsIGxpbmVzIHRoYXQgbWFrZSB1cCB0aGlzIHZpc3VhbCBsaW5lLlxuICBmb3IgKHZhciBpID0gMDsgaSA8PSAobGluZVZpZXcucmVzdCA/IGxpbmVWaWV3LnJlc3QubGVuZ3RoIDogMCk7IGkrKykge1xuICAgIHZhciBsaW5lID0gaSA/IGxpbmVWaWV3LnJlc3RbaSAtIDFdIDogbGluZVZpZXcubGluZSwgb3JkZXIgPSAodm9pZCAwKTtcbiAgICBidWlsZGVyLnBvcyA9IDA7XG4gICAgYnVpbGRlci5hZGRUb2tlbiA9IGJ1aWxkVG9rZW47XG4gICAgLy8gT3B0aW9uYWxseSB3aXJlIGluIHNvbWUgaGFja3MgaW50byB0aGUgdG9rZW4tcmVuZGVyaW5nXG4gICAgLy8gYWxnb3JpdGhtLCB0byBkZWFsIHdpdGggYnJvd3NlciBxdWlya3MuXG4gICAgaWYgKGhhc0JhZEJpZGlSZWN0cyhjbS5kaXNwbGF5Lm1lYXN1cmUpICYmIChvcmRlciA9IGdldE9yZGVyKGxpbmUsIGNtLmRvYy5kaXJlY3Rpb24pKSlcbiAgICAgIHsgYnVpbGRlci5hZGRUb2tlbiA9IGJ1aWxkVG9rZW5CYWRCaWRpKGJ1aWxkZXIuYWRkVG9rZW4sIG9yZGVyKTsgfVxuICAgIGJ1aWxkZXIubWFwID0gW107XG4gICAgdmFyIGFsbG93RnJvbnRpZXJVcGRhdGUgPSBsaW5lVmlldyAhPSBjbS5kaXNwbGF5LmV4dGVybmFsTWVhc3VyZWQgJiYgbGluZU5vKGxpbmUpO1xuICAgIGluc2VydExpbmVDb250ZW50KGxpbmUsIGJ1aWxkZXIsIGdldExpbmVTdHlsZXMoY20sIGxpbmUsIGFsbG93RnJvbnRpZXJVcGRhdGUpKTtcbiAgICBpZiAobGluZS5zdHlsZUNsYXNzZXMpIHtcbiAgICAgIGlmIChsaW5lLnN0eWxlQ2xhc3Nlcy5iZ0NsYXNzKVxuICAgICAgICB7IGJ1aWxkZXIuYmdDbGFzcyA9IGpvaW5DbGFzc2VzKGxpbmUuc3R5bGVDbGFzc2VzLmJnQ2xhc3MsIGJ1aWxkZXIuYmdDbGFzcyB8fCBcIlwiKTsgfVxuICAgICAgaWYgKGxpbmUuc3R5bGVDbGFzc2VzLnRleHRDbGFzcylcbiAgICAgICAgeyBidWlsZGVyLnRleHRDbGFzcyA9IGpvaW5DbGFzc2VzKGxpbmUuc3R5bGVDbGFzc2VzLnRleHRDbGFzcywgYnVpbGRlci50ZXh0Q2xhc3MgfHwgXCJcIik7IH1cbiAgICB9XG5cbiAgICAvLyBFbnN1cmUgYXQgbGVhc3QgYSBzaW5nbGUgbm9kZSBpcyBwcmVzZW50LCBmb3IgbWVhc3VyaW5nLlxuICAgIGlmIChidWlsZGVyLm1hcC5sZW5ndGggPT0gMClcbiAgICAgIHsgYnVpbGRlci5tYXAucHVzaCgwLCAwLCBidWlsZGVyLmNvbnRlbnQuYXBwZW5kQ2hpbGQoemVyb1dpZHRoRWxlbWVudChjbS5kaXNwbGF5Lm1lYXN1cmUpKSk7IH1cblxuICAgIC8vIFN0b3JlIHRoZSBtYXAgYW5kIGEgY2FjaGUgb2JqZWN0IGZvciB0aGUgY3VycmVudCBsb2dpY2FsIGxpbmVcbiAgICBpZiAoaSA9PSAwKSB7XG4gICAgICBsaW5lVmlldy5tZWFzdXJlLm1hcCA9IGJ1aWxkZXIubWFwO1xuICAgICAgbGluZVZpZXcubWVhc3VyZS5jYWNoZSA9IHt9O1xuICAgIH0gZWxzZSB7XG4gICAgICAobGluZVZpZXcubWVhc3VyZS5tYXBzIHx8IChsaW5lVmlldy5tZWFzdXJlLm1hcHMgPSBbXSkpLnB1c2goYnVpbGRlci5tYXApXG4gICAgICA7KGxpbmVWaWV3Lm1lYXN1cmUuY2FjaGVzIHx8IChsaW5lVmlldy5tZWFzdXJlLmNhY2hlcyA9IFtdKSkucHVzaCh7fSk7XG4gICAgfVxuICB9XG5cbiAgLy8gU2VlIGlzc3VlICMyOTAxXG4gIGlmICh3ZWJraXQpIHtcbiAgICB2YXIgbGFzdCA9IGJ1aWxkZXIuY29udGVudC5sYXN0Q2hpbGQ7XG4gICAgaWYgKC9cXGJjbS10YWJcXGIvLnRlc3QobGFzdC5jbGFzc05hbWUpIHx8IChsYXN0LnF1ZXJ5U2VsZWN0b3IgJiYgbGFzdC5xdWVyeVNlbGVjdG9yKFwiLmNtLXRhYlwiKSkpXG4gICAgICB7IGJ1aWxkZXIuY29udGVudC5jbGFzc05hbWUgPSBcImNtLXRhYi13cmFwLWhhY2tcIjsgfVxuICB9XG5cbiAgc2lnbmFsKGNtLCBcInJlbmRlckxpbmVcIiwgY20sIGxpbmVWaWV3LmxpbmUsIGJ1aWxkZXIucHJlKTtcbiAgaWYgKGJ1aWxkZXIucHJlLmNsYXNzTmFtZSlcbiAgICB7IGJ1aWxkZXIudGV4dENsYXNzID0gam9pbkNsYXNzZXMoYnVpbGRlci5wcmUuY2xhc3NOYW1lLCBidWlsZGVyLnRleHRDbGFzcyB8fCBcIlwiKTsgfVxuXG4gIHJldHVybiBidWlsZGVyXG59XG5cbmZ1bmN0aW9uIGRlZmF1bHRTcGVjaWFsQ2hhclBsYWNlaG9sZGVyKGNoKSB7XG4gIHZhciB0b2tlbiA9IGVsdChcInNwYW5cIiwgXCJcXHUyMDIyXCIsIFwiY20taW52YWxpZGNoYXJcIik7XG4gIHRva2VuLnRpdGxlID0gXCJcXFxcdVwiICsgY2guY2hhckNvZGVBdCgwKS50b1N0cmluZygxNik7XG4gIHRva2VuLnNldEF0dHJpYnV0ZShcImFyaWEtbGFiZWxcIiwgdG9rZW4udGl0bGUpO1xuICByZXR1cm4gdG9rZW5cbn1cblxuLy8gQnVpbGQgdXAgdGhlIERPTSByZXByZXNlbnRhdGlvbiBmb3IgYSBzaW5nbGUgdG9rZW4sIGFuZCBhZGQgaXQgdG9cbi8vIHRoZSBsaW5lIG1hcC4gVGFrZXMgY2FyZSB0byByZW5kZXIgc3BlY2lhbCBjaGFyYWN0ZXJzIHNlcGFyYXRlbHkuXG5mdW5jdGlvbiBidWlsZFRva2VuKGJ1aWxkZXIsIHRleHQsIHN0eWxlLCBzdGFydFN0eWxlLCBlbmRTdHlsZSwgdGl0bGUsIGNzcykge1xuICBpZiAoIXRleHQpIHsgcmV0dXJuIH1cbiAgdmFyIGRpc3BsYXlUZXh0ID0gYnVpbGRlci5zcGxpdFNwYWNlcyA/IHNwbGl0U3BhY2VzKHRleHQsIGJ1aWxkZXIudHJhaWxpbmdTcGFjZSkgOiB0ZXh0O1xuICB2YXIgc3BlY2lhbCA9IGJ1aWxkZXIuY20uc3RhdGUuc3BlY2lhbENoYXJzLCBtdXN0V3JhcCA9IGZhbHNlO1xuICB2YXIgY29udGVudDtcbiAgaWYgKCFzcGVjaWFsLnRlc3QodGV4dCkpIHtcbiAgICBidWlsZGVyLmNvbCArPSB0ZXh0Lmxlbmd0aDtcbiAgICBjb250ZW50ID0gZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoZGlzcGxheVRleHQpO1xuICAgIGJ1aWxkZXIubWFwLnB1c2goYnVpbGRlci5wb3MsIGJ1aWxkZXIucG9zICsgdGV4dC5sZW5ndGgsIGNvbnRlbnQpO1xuICAgIGlmIChpZSAmJiBpZV92ZXJzaW9uIDwgOSkgeyBtdXN0V3JhcCA9IHRydWU7IH1cbiAgICBidWlsZGVyLnBvcyArPSB0ZXh0Lmxlbmd0aDtcbiAgfSBlbHNlIHtcbiAgICBjb250ZW50ID0gZG9jdW1lbnQuY3JlYXRlRG9jdW1lbnRGcmFnbWVudCgpO1xuICAgIHZhciBwb3MgPSAwO1xuICAgIHdoaWxlICh0cnVlKSB7XG4gICAgICBzcGVjaWFsLmxhc3RJbmRleCA9IHBvcztcbiAgICAgIHZhciBtID0gc3BlY2lhbC5leGVjKHRleHQpO1xuICAgICAgdmFyIHNraXBwZWQgPSBtID8gbS5pbmRleCAtIHBvcyA6IHRleHQubGVuZ3RoIC0gcG9zO1xuICAgICAgaWYgKHNraXBwZWQpIHtcbiAgICAgICAgdmFyIHR4dCA9IGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKGRpc3BsYXlUZXh0LnNsaWNlKHBvcywgcG9zICsgc2tpcHBlZCkpO1xuICAgICAgICBpZiAoaWUgJiYgaWVfdmVyc2lvbiA8IDkpIHsgY29udGVudC5hcHBlbmRDaGlsZChlbHQoXCJzcGFuXCIsIFt0eHRdKSk7IH1cbiAgICAgICAgZWxzZSB7IGNvbnRlbnQuYXBwZW5kQ2hpbGQodHh0KTsgfVxuICAgICAgICBidWlsZGVyLm1hcC5wdXNoKGJ1aWxkZXIucG9zLCBidWlsZGVyLnBvcyArIHNraXBwZWQsIHR4dCk7XG4gICAgICAgIGJ1aWxkZXIuY29sICs9IHNraXBwZWQ7XG4gICAgICAgIGJ1aWxkZXIucG9zICs9IHNraXBwZWQ7XG4gICAgICB9XG4gICAgICBpZiAoIW0pIHsgYnJlYWsgfVxuICAgICAgcG9zICs9IHNraXBwZWQgKyAxO1xuICAgICAgdmFyIHR4dCQxID0gKHZvaWQgMCk7XG4gICAgICBpZiAobVswXSA9PSBcIlxcdFwiKSB7XG4gICAgICAgIHZhciB0YWJTaXplID0gYnVpbGRlci5jbS5vcHRpb25zLnRhYlNpemUsIHRhYldpZHRoID0gdGFiU2l6ZSAtIGJ1aWxkZXIuY29sICUgdGFiU2l6ZTtcbiAgICAgICAgdHh0JDEgPSBjb250ZW50LmFwcGVuZENoaWxkKGVsdChcInNwYW5cIiwgc3BhY2VTdHIodGFiV2lkdGgpLCBcImNtLXRhYlwiKSk7XG4gICAgICAgIHR4dCQxLnNldEF0dHJpYnV0ZShcInJvbGVcIiwgXCJwcmVzZW50YXRpb25cIik7XG4gICAgICAgIHR4dCQxLnNldEF0dHJpYnV0ZShcImNtLXRleHRcIiwgXCJcXHRcIik7XG4gICAgICAgIGJ1aWxkZXIuY29sICs9IHRhYldpZHRoO1xuICAgICAgfSBlbHNlIGlmIChtWzBdID09IFwiXFxyXCIgfHwgbVswXSA9PSBcIlxcblwiKSB7XG4gICAgICAgIHR4dCQxID0gY29udGVudC5hcHBlbmRDaGlsZChlbHQoXCJzcGFuXCIsIG1bMF0gPT0gXCJcXHJcIiA/IFwiXFx1MjQwZFwiIDogXCJcXHUyNDI0XCIsIFwiY20taW52YWxpZGNoYXJcIikpO1xuICAgICAgICB0eHQkMS5zZXRBdHRyaWJ1dGUoXCJjbS10ZXh0XCIsIG1bMF0pO1xuICAgICAgICBidWlsZGVyLmNvbCArPSAxO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdHh0JDEgPSBidWlsZGVyLmNtLm9wdGlvbnMuc3BlY2lhbENoYXJQbGFjZWhvbGRlcihtWzBdKTtcbiAgICAgICAgdHh0JDEuc2V0QXR0cmlidXRlKFwiY20tdGV4dFwiLCBtWzBdKTtcbiAgICAgICAgaWYgKGllICYmIGllX3ZlcnNpb24gPCA5KSB7IGNvbnRlbnQuYXBwZW5kQ2hpbGQoZWx0KFwic3BhblwiLCBbdHh0JDFdKSk7IH1cbiAgICAgICAgZWxzZSB7IGNvbnRlbnQuYXBwZW5kQ2hpbGQodHh0JDEpOyB9XG4gICAgICAgIGJ1aWxkZXIuY29sICs9IDE7XG4gICAgICB9XG4gICAgICBidWlsZGVyLm1hcC5wdXNoKGJ1aWxkZXIucG9zLCBidWlsZGVyLnBvcyArIDEsIHR4dCQxKTtcbiAgICAgIGJ1aWxkZXIucG9zKys7XG4gICAgfVxuICB9XG4gIGJ1aWxkZXIudHJhaWxpbmdTcGFjZSA9IGRpc3BsYXlUZXh0LmNoYXJDb2RlQXQodGV4dC5sZW5ndGggLSAxKSA9PSAzMjtcbiAgaWYgKHN0eWxlIHx8IHN0YXJ0U3R5bGUgfHwgZW5kU3R5bGUgfHwgbXVzdFdyYXAgfHwgY3NzKSB7XG4gICAgdmFyIGZ1bGxTdHlsZSA9IHN0eWxlIHx8IFwiXCI7XG4gICAgaWYgKHN0YXJ0U3R5bGUpIHsgZnVsbFN0eWxlICs9IHN0YXJ0U3R5bGU7IH1cbiAgICBpZiAoZW5kU3R5bGUpIHsgZnVsbFN0eWxlICs9IGVuZFN0eWxlOyB9XG4gICAgdmFyIHRva2VuID0gZWx0KFwic3BhblwiLCBbY29udGVudF0sIGZ1bGxTdHlsZSwgY3NzKTtcbiAgICBpZiAodGl0bGUpIHsgdG9rZW4udGl0bGUgPSB0aXRsZTsgfVxuICAgIHJldHVybiBidWlsZGVyLmNvbnRlbnQuYXBwZW5kQ2hpbGQodG9rZW4pXG4gIH1cbiAgYnVpbGRlci5jb250ZW50LmFwcGVuZENoaWxkKGNvbnRlbnQpO1xufVxuXG5mdW5jdGlvbiBzcGxpdFNwYWNlcyh0ZXh0LCB0cmFpbGluZ0JlZm9yZSkge1xuICBpZiAodGV4dC5sZW5ndGggPiAxICYmICEvICAvLnRlc3QodGV4dCkpIHsgcmV0dXJuIHRleHQgfVxuICB2YXIgc3BhY2VCZWZvcmUgPSB0cmFpbGluZ0JlZm9yZSwgcmVzdWx0ID0gXCJcIjtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCB0ZXh0Lmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIGNoID0gdGV4dC5jaGFyQXQoaSk7XG4gICAgaWYgKGNoID09IFwiIFwiICYmIHNwYWNlQmVmb3JlICYmIChpID09IHRleHQubGVuZ3RoIC0gMSB8fCB0ZXh0LmNoYXJDb2RlQXQoaSArIDEpID09IDMyKSlcbiAgICAgIHsgY2ggPSBcIlxcdTAwYTBcIjsgfVxuICAgIHJlc3VsdCArPSBjaDtcbiAgICBzcGFjZUJlZm9yZSA9IGNoID09IFwiIFwiO1xuICB9XG4gIHJldHVybiByZXN1bHRcbn1cblxuLy8gV29yayBhcm91bmQgbm9uc2Vuc2UgZGltZW5zaW9ucyBiZWluZyByZXBvcnRlZCBmb3Igc3RyZXRjaGVzIG9mXG4vLyByaWdodC10by1sZWZ0IHRleHQuXG5mdW5jdGlvbiBidWlsZFRva2VuQmFkQmlkaShpbm5lciwgb3JkZXIpIHtcbiAgcmV0dXJuIGZ1bmN0aW9uIChidWlsZGVyLCB0ZXh0LCBzdHlsZSwgc3RhcnRTdHlsZSwgZW5kU3R5bGUsIHRpdGxlLCBjc3MpIHtcbiAgICBzdHlsZSA9IHN0eWxlID8gc3R5bGUgKyBcIiBjbS1mb3JjZS1ib3JkZXJcIiA6IFwiY20tZm9yY2UtYm9yZGVyXCI7XG4gICAgdmFyIHN0YXJ0ID0gYnVpbGRlci5wb3MsIGVuZCA9IHN0YXJ0ICsgdGV4dC5sZW5ndGg7XG4gICAgZm9yICg7Oykge1xuICAgICAgLy8gRmluZCB0aGUgcGFydCB0aGF0IG92ZXJsYXBzIHdpdGggdGhlIHN0YXJ0IG9mIHRoaXMgdGV4dFxuICAgICAgdmFyIHBhcnQgPSAodm9pZCAwKTtcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgb3JkZXIubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgcGFydCA9IG9yZGVyW2ldO1xuICAgICAgICBpZiAocGFydC50byA+IHN0YXJ0ICYmIHBhcnQuZnJvbSA8PSBzdGFydCkgeyBicmVhayB9XG4gICAgICB9XG4gICAgICBpZiAocGFydC50byA+PSBlbmQpIHsgcmV0dXJuIGlubmVyKGJ1aWxkZXIsIHRleHQsIHN0eWxlLCBzdGFydFN0eWxlLCBlbmRTdHlsZSwgdGl0bGUsIGNzcykgfVxuICAgICAgaW5uZXIoYnVpbGRlciwgdGV4dC5zbGljZSgwLCBwYXJ0LnRvIC0gc3RhcnQpLCBzdHlsZSwgc3RhcnRTdHlsZSwgbnVsbCwgdGl0bGUsIGNzcyk7XG4gICAgICBzdGFydFN0eWxlID0gbnVsbDtcbiAgICAgIHRleHQgPSB0ZXh0LnNsaWNlKHBhcnQudG8gLSBzdGFydCk7XG4gICAgICBzdGFydCA9IHBhcnQudG87XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGJ1aWxkQ29sbGFwc2VkU3BhbihidWlsZGVyLCBzaXplLCBtYXJrZXIsIGlnbm9yZVdpZGdldCkge1xuICB2YXIgd2lkZ2V0ID0gIWlnbm9yZVdpZGdldCAmJiBtYXJrZXIud2lkZ2V0Tm9kZTtcbiAgaWYgKHdpZGdldCkgeyBidWlsZGVyLm1hcC5wdXNoKGJ1aWxkZXIucG9zLCBidWlsZGVyLnBvcyArIHNpemUsIHdpZGdldCk7IH1cbiAgaWYgKCFpZ25vcmVXaWRnZXQgJiYgYnVpbGRlci5jbS5kaXNwbGF5LmlucHV0Lm5lZWRzQ29udGVudEF0dHJpYnV0ZSkge1xuICAgIGlmICghd2lkZ2V0KVxuICAgICAgeyB3aWRnZXQgPSBidWlsZGVyLmNvbnRlbnQuYXBwZW5kQ2hpbGQoZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIikpOyB9XG4gICAgd2lkZ2V0LnNldEF0dHJpYnV0ZShcImNtLW1hcmtlclwiLCBtYXJrZXIuaWQpO1xuICB9XG4gIGlmICh3aWRnZXQpIHtcbiAgICBidWlsZGVyLmNtLmRpc3BsYXkuaW5wdXQuc2V0VW5lZGl0YWJsZSh3aWRnZXQpO1xuICAgIGJ1aWxkZXIuY29udGVudC5hcHBlbmRDaGlsZCh3aWRnZXQpO1xuICB9XG4gIGJ1aWxkZXIucG9zICs9IHNpemU7XG4gIGJ1aWxkZXIudHJhaWxpbmdTcGFjZSA9IGZhbHNlO1xufVxuXG4vLyBPdXRwdXRzIGEgbnVtYmVyIG9mIHNwYW5zIHRvIG1ha2UgdXAgYSBsaW5lLCB0YWtpbmcgaGlnaGxpZ2h0aW5nXG4vLyBhbmQgbWFya2VkIHRleHQgaW50byBhY2NvdW50LlxuZnVuY3Rpb24gaW5zZXJ0TGluZUNvbnRlbnQobGluZSwgYnVpbGRlciwgc3R5bGVzKSB7XG4gIHZhciBzcGFucyA9IGxpbmUubWFya2VkU3BhbnMsIGFsbFRleHQgPSBsaW5lLnRleHQsIGF0ID0gMDtcbiAgaWYgKCFzcGFucykge1xuICAgIGZvciAodmFyIGkkMSA9IDE7IGkkMSA8IHN0eWxlcy5sZW5ndGg7IGkkMSs9MilcbiAgICAgIHsgYnVpbGRlci5hZGRUb2tlbihidWlsZGVyLCBhbGxUZXh0LnNsaWNlKGF0LCBhdCA9IHN0eWxlc1tpJDFdKSwgaW50ZXJwcmV0VG9rZW5TdHlsZShzdHlsZXNbaSQxKzFdLCBidWlsZGVyLmNtLm9wdGlvbnMpKTsgfVxuICAgIHJldHVyblxuICB9XG5cbiAgdmFyIGxlbiA9IGFsbFRleHQubGVuZ3RoLCBwb3MgPSAwLCBpID0gMSwgdGV4dCA9IFwiXCIsIHN0eWxlLCBjc3M7XG4gIHZhciBuZXh0Q2hhbmdlID0gMCwgc3BhblN0eWxlLCBzcGFuRW5kU3R5bGUsIHNwYW5TdGFydFN0eWxlLCB0aXRsZSwgY29sbGFwc2VkO1xuICBmb3IgKDs7KSB7XG4gICAgaWYgKG5leHRDaGFuZ2UgPT0gcG9zKSB7IC8vIFVwZGF0ZSBjdXJyZW50IG1hcmtlciBzZXRcbiAgICAgIHNwYW5TdHlsZSA9IHNwYW5FbmRTdHlsZSA9IHNwYW5TdGFydFN0eWxlID0gdGl0bGUgPSBjc3MgPSBcIlwiO1xuICAgICAgY29sbGFwc2VkID0gbnVsbDsgbmV4dENoYW5nZSA9IEluZmluaXR5O1xuICAgICAgdmFyIGZvdW5kQm9va21hcmtzID0gW10sIGVuZFN0eWxlcyA9ICh2b2lkIDApO1xuICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBzcGFucy5sZW5ndGg7ICsraikge1xuICAgICAgICB2YXIgc3AgPSBzcGFuc1tqXSwgbSA9IHNwLm1hcmtlcjtcbiAgICAgICAgaWYgKG0udHlwZSA9PSBcImJvb2ttYXJrXCIgJiYgc3AuZnJvbSA9PSBwb3MgJiYgbS53aWRnZXROb2RlKSB7XG4gICAgICAgICAgZm91bmRCb29rbWFya3MucHVzaChtKTtcbiAgICAgICAgfSBlbHNlIGlmIChzcC5mcm9tIDw9IHBvcyAmJiAoc3AudG8gPT0gbnVsbCB8fCBzcC50byA+IHBvcyB8fCBtLmNvbGxhcHNlZCAmJiBzcC50byA9PSBwb3MgJiYgc3AuZnJvbSA9PSBwb3MpKSB7XG4gICAgICAgICAgaWYgKHNwLnRvICE9IG51bGwgJiYgc3AudG8gIT0gcG9zICYmIG5leHRDaGFuZ2UgPiBzcC50bykge1xuICAgICAgICAgICAgbmV4dENoYW5nZSA9IHNwLnRvO1xuICAgICAgICAgICAgc3BhbkVuZFN0eWxlID0gXCJcIjtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKG0uY2xhc3NOYW1lKSB7IHNwYW5TdHlsZSArPSBcIiBcIiArIG0uY2xhc3NOYW1lOyB9XG4gICAgICAgICAgaWYgKG0uY3NzKSB7IGNzcyA9IChjc3MgPyBjc3MgKyBcIjtcIiA6IFwiXCIpICsgbS5jc3M7IH1cbiAgICAgICAgICBpZiAobS5zdGFydFN0eWxlICYmIHNwLmZyb20gPT0gcG9zKSB7IHNwYW5TdGFydFN0eWxlICs9IFwiIFwiICsgbS5zdGFydFN0eWxlOyB9XG4gICAgICAgICAgaWYgKG0uZW5kU3R5bGUgJiYgc3AudG8gPT0gbmV4dENoYW5nZSkgeyAoZW5kU3R5bGVzIHx8IChlbmRTdHlsZXMgPSBbXSkpLnB1c2gobS5lbmRTdHlsZSwgc3AudG8pOyB9XG4gICAgICAgICAgaWYgKG0udGl0bGUgJiYgIXRpdGxlKSB7IHRpdGxlID0gbS50aXRsZTsgfVxuICAgICAgICAgIGlmIChtLmNvbGxhcHNlZCAmJiAoIWNvbGxhcHNlZCB8fCBjb21wYXJlQ29sbGFwc2VkTWFya2Vycyhjb2xsYXBzZWQubWFya2VyLCBtKSA8IDApKVxuICAgICAgICAgICAgeyBjb2xsYXBzZWQgPSBzcDsgfVxuICAgICAgICB9IGVsc2UgaWYgKHNwLmZyb20gPiBwb3MgJiYgbmV4dENoYW5nZSA+IHNwLmZyb20pIHtcbiAgICAgICAgICBuZXh0Q2hhbmdlID0gc3AuZnJvbTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKGVuZFN0eWxlcykgeyBmb3IgKHZhciBqJDEgPSAwOyBqJDEgPCBlbmRTdHlsZXMubGVuZ3RoOyBqJDEgKz0gMilcbiAgICAgICAgeyBpZiAoZW5kU3R5bGVzW2okMSArIDFdID09IG5leHRDaGFuZ2UpIHsgc3BhbkVuZFN0eWxlICs9IFwiIFwiICsgZW5kU3R5bGVzW2okMV07IH0gfSB9XG5cbiAgICAgIGlmICghY29sbGFwc2VkIHx8IGNvbGxhcHNlZC5mcm9tID09IHBvcykgeyBmb3IgKHZhciBqJDIgPSAwOyBqJDIgPCBmb3VuZEJvb2ttYXJrcy5sZW5ndGg7ICsraiQyKVxuICAgICAgICB7IGJ1aWxkQ29sbGFwc2VkU3BhbihidWlsZGVyLCAwLCBmb3VuZEJvb2ttYXJrc1tqJDJdKTsgfSB9XG4gICAgICBpZiAoY29sbGFwc2VkICYmIChjb2xsYXBzZWQuZnJvbSB8fCAwKSA9PSBwb3MpIHtcbiAgICAgICAgYnVpbGRDb2xsYXBzZWRTcGFuKGJ1aWxkZXIsIChjb2xsYXBzZWQudG8gPT0gbnVsbCA/IGxlbiArIDEgOiBjb2xsYXBzZWQudG8pIC0gcG9zLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgY29sbGFwc2VkLm1hcmtlciwgY29sbGFwc2VkLmZyb20gPT0gbnVsbCk7XG4gICAgICAgIGlmIChjb2xsYXBzZWQudG8gPT0gbnVsbCkgeyByZXR1cm4gfVxuICAgICAgICBpZiAoY29sbGFwc2VkLnRvID09IHBvcykgeyBjb2xsYXBzZWQgPSBmYWxzZTsgfVxuICAgICAgfVxuICAgIH1cbiAgICBpZiAocG9zID49IGxlbikgeyBicmVhayB9XG5cbiAgICB2YXIgdXB0byA9IE1hdGgubWluKGxlbiwgbmV4dENoYW5nZSk7XG4gICAgd2hpbGUgKHRydWUpIHtcbiAgICAgIGlmICh0ZXh0KSB7XG4gICAgICAgIHZhciBlbmQgPSBwb3MgKyB0ZXh0Lmxlbmd0aDtcbiAgICAgICAgaWYgKCFjb2xsYXBzZWQpIHtcbiAgICAgICAgICB2YXIgdG9rZW5UZXh0ID0gZW5kID4gdXB0byA/IHRleHQuc2xpY2UoMCwgdXB0byAtIHBvcykgOiB0ZXh0O1xuICAgICAgICAgIGJ1aWxkZXIuYWRkVG9rZW4oYnVpbGRlciwgdG9rZW5UZXh0LCBzdHlsZSA/IHN0eWxlICsgc3BhblN0eWxlIDogc3BhblN0eWxlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgc3BhblN0YXJ0U3R5bGUsIHBvcyArIHRva2VuVGV4dC5sZW5ndGggPT0gbmV4dENoYW5nZSA/IHNwYW5FbmRTdHlsZSA6IFwiXCIsIHRpdGxlLCBjc3MpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChlbmQgPj0gdXB0bykge3RleHQgPSB0ZXh0LnNsaWNlKHVwdG8gLSBwb3MpOyBwb3MgPSB1cHRvOyBicmVha31cbiAgICAgICAgcG9zID0gZW5kO1xuICAgICAgICBzcGFuU3RhcnRTdHlsZSA9IFwiXCI7XG4gICAgICB9XG4gICAgICB0ZXh0ID0gYWxsVGV4dC5zbGljZShhdCwgYXQgPSBzdHlsZXNbaSsrXSk7XG4gICAgICBzdHlsZSA9IGludGVycHJldFRva2VuU3R5bGUoc3R5bGVzW2krK10sIGJ1aWxkZXIuY20ub3B0aW9ucyk7XG4gICAgfVxuICB9XG59XG5cblxuLy8gVGhlc2Ugb2JqZWN0cyBhcmUgdXNlZCB0byByZXByZXNlbnQgdGhlIHZpc2libGUgKGN1cnJlbnRseSBkcmF3bilcbi8vIHBhcnQgb2YgdGhlIGRvY3VtZW50LiBBIExpbmVWaWV3IG1heSBjb3JyZXNwb25kIHRvIG11bHRpcGxlXG4vLyBsb2dpY2FsIGxpbmVzLCBpZiB0aG9zZSBhcmUgY29ubmVjdGVkIGJ5IGNvbGxhcHNlZCByYW5nZXMuXG5mdW5jdGlvbiBMaW5lVmlldyhkb2MsIGxpbmUsIGxpbmVOKSB7XG4gIC8vIFRoZSBzdGFydGluZyBsaW5lXG4gIHRoaXMubGluZSA9IGxpbmU7XG4gIC8vIENvbnRpbnVpbmcgbGluZXMsIGlmIGFueVxuICB0aGlzLnJlc3QgPSB2aXN1YWxMaW5lQ29udGludWVkKGxpbmUpO1xuICAvLyBOdW1iZXIgb2YgbG9naWNhbCBsaW5lcyBpbiB0aGlzIHZpc3VhbCBsaW5lXG4gIHRoaXMuc2l6ZSA9IHRoaXMucmVzdCA/IGxpbmVObyhsc3QodGhpcy5yZXN0KSkgLSBsaW5lTiArIDEgOiAxO1xuICB0aGlzLm5vZGUgPSB0aGlzLnRleHQgPSBudWxsO1xuICB0aGlzLmhpZGRlbiA9IGxpbmVJc0hpZGRlbihkb2MsIGxpbmUpO1xufVxuXG4vLyBDcmVhdGUgYSByYW5nZSBvZiBMaW5lVmlldyBvYmplY3RzIGZvciB0aGUgZ2l2ZW4gbGluZXMuXG5mdW5jdGlvbiBidWlsZFZpZXdBcnJheShjbSwgZnJvbSwgdG8pIHtcbiAgdmFyIGFycmF5ID0gW10sIG5leHRQb3M7XG4gIGZvciAodmFyIHBvcyA9IGZyb207IHBvcyA8IHRvOyBwb3MgPSBuZXh0UG9zKSB7XG4gICAgdmFyIHZpZXcgPSBuZXcgTGluZVZpZXcoY20uZG9jLCBnZXRMaW5lKGNtLmRvYywgcG9zKSwgcG9zKTtcbiAgICBuZXh0UG9zID0gcG9zICsgdmlldy5zaXplO1xuICAgIGFycmF5LnB1c2godmlldyk7XG4gIH1cbiAgcmV0dXJuIGFycmF5XG59XG5cbnZhciBvcGVyYXRpb25Hcm91cCA9IG51bGw7XG5cbmZ1bmN0aW9uIHB1c2hPcGVyYXRpb24ob3ApIHtcbiAgaWYgKG9wZXJhdGlvbkdyb3VwKSB7XG4gICAgb3BlcmF0aW9uR3JvdXAub3BzLnB1c2gob3ApO1xuICB9IGVsc2Uge1xuICAgIG9wLm93bnNHcm91cCA9IG9wZXJhdGlvbkdyb3VwID0ge1xuICAgICAgb3BzOiBbb3BdLFxuICAgICAgZGVsYXllZENhbGxiYWNrczogW11cbiAgICB9O1xuICB9XG59XG5cbmZ1bmN0aW9uIGZpcmVDYWxsYmFja3NGb3JPcHMoZ3JvdXApIHtcbiAgLy8gQ2FsbHMgZGVsYXllZCBjYWxsYmFja3MgYW5kIGN1cnNvckFjdGl2aXR5IGhhbmRsZXJzIHVudGlsIG5vXG4gIC8vIG5ldyBvbmVzIGFwcGVhclxuICB2YXIgY2FsbGJhY2tzID0gZ3JvdXAuZGVsYXllZENhbGxiYWNrcywgaSA9IDA7XG4gIGRvIHtcbiAgICBmb3IgKDsgaSA8IGNhbGxiYWNrcy5sZW5ndGg7IGkrKylcbiAgICAgIHsgY2FsbGJhY2tzW2ldLmNhbGwobnVsbCk7IH1cbiAgICBmb3IgKHZhciBqID0gMDsgaiA8IGdyb3VwLm9wcy5sZW5ndGg7IGorKykge1xuICAgICAgdmFyIG9wID0gZ3JvdXAub3BzW2pdO1xuICAgICAgaWYgKG9wLmN1cnNvckFjdGl2aXR5SGFuZGxlcnMpXG4gICAgICAgIHsgd2hpbGUgKG9wLmN1cnNvckFjdGl2aXR5Q2FsbGVkIDwgb3AuY3Vyc29yQWN0aXZpdHlIYW5kbGVycy5sZW5ndGgpXG4gICAgICAgICAgeyBvcC5jdXJzb3JBY3Rpdml0eUhhbmRsZXJzW29wLmN1cnNvckFjdGl2aXR5Q2FsbGVkKytdLmNhbGwobnVsbCwgb3AuY20pOyB9IH1cbiAgICB9XG4gIH0gd2hpbGUgKGkgPCBjYWxsYmFja3MubGVuZ3RoKVxufVxuXG5mdW5jdGlvbiBmaW5pc2hPcGVyYXRpb24ob3AsIGVuZENiKSB7XG4gIHZhciBncm91cCA9IG9wLm93bnNHcm91cDtcbiAgaWYgKCFncm91cCkgeyByZXR1cm4gfVxuXG4gIHRyeSB7IGZpcmVDYWxsYmFja3NGb3JPcHMoZ3JvdXApOyB9XG4gIGZpbmFsbHkge1xuICAgIG9wZXJhdGlvbkdyb3VwID0gbnVsbDtcbiAgICBlbmRDYihncm91cCk7XG4gIH1cbn1cblxudmFyIG9ycGhhbkRlbGF5ZWRDYWxsYmFja3MgPSBudWxsO1xuXG4vLyBPZnRlbiwgd2Ugd2FudCB0byBzaWduYWwgZXZlbnRzIGF0IGEgcG9pbnQgd2hlcmUgd2UgYXJlIGluIHRoZVxuLy8gbWlkZGxlIG9mIHNvbWUgd29yaywgYnV0IGRvbid0IHdhbnQgdGhlIGhhbmRsZXIgdG8gc3RhcnQgY2FsbGluZ1xuLy8gb3RoZXIgbWV0aG9kcyBvbiB0aGUgZWRpdG9yLCB3aGljaCBtaWdodCBiZSBpbiBhbiBpbmNvbnNpc3RlbnRcbi8vIHN0YXRlIG9yIHNpbXBseSBub3QgZXhwZWN0IGFueSBvdGhlciBldmVudHMgdG8gaGFwcGVuLlxuLy8gc2lnbmFsTGF0ZXIgbG9va3Mgd2hldGhlciB0aGVyZSBhcmUgYW55IGhhbmRsZXJzLCBhbmQgc2NoZWR1bGVzXG4vLyB0aGVtIHRvIGJlIGV4ZWN1dGVkIHdoZW4gdGhlIGxhc3Qgb3BlcmF0aW9uIGVuZHMsIG9yLCBpZiBub1xuLy8gb3BlcmF0aW9uIGlzIGFjdGl2ZSwgd2hlbiBhIHRpbWVvdXQgZmlyZXMuXG5mdW5jdGlvbiBzaWduYWxMYXRlcihlbWl0dGVyLCB0eXBlIC8qLCB2YWx1ZXMuLi4qLykge1xuICB2YXIgYXJyID0gZ2V0SGFuZGxlcnMoZW1pdHRlciwgdHlwZSk7XG4gIGlmICghYXJyLmxlbmd0aCkgeyByZXR1cm4gfVxuICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMiksIGxpc3Q7XG4gIGlmIChvcGVyYXRpb25Hcm91cCkge1xuICAgIGxpc3QgPSBvcGVyYXRpb25Hcm91cC5kZWxheWVkQ2FsbGJhY2tzO1xuICB9IGVsc2UgaWYgKG9ycGhhbkRlbGF5ZWRDYWxsYmFja3MpIHtcbiAgICBsaXN0ID0gb3JwaGFuRGVsYXllZENhbGxiYWNrcztcbiAgfSBlbHNlIHtcbiAgICBsaXN0ID0gb3JwaGFuRGVsYXllZENhbGxiYWNrcyA9IFtdO1xuICAgIHNldFRpbWVvdXQoZmlyZU9ycGhhbkRlbGF5ZWQsIDApO1xuICB9XG4gIHZhciBsb29wID0gZnVuY3Rpb24gKCBpICkge1xuICAgIGxpc3QucHVzaChmdW5jdGlvbiAoKSB7IHJldHVybiBhcnJbaV0uYXBwbHkobnVsbCwgYXJncyk7IH0pO1xuICB9O1xuXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgYXJyLmxlbmd0aDsgKytpKVxuICAgIGxvb3AoIGkgKTtcbn1cblxuZnVuY3Rpb24gZmlyZU9ycGhhbkRlbGF5ZWQoKSB7XG4gIHZhciBkZWxheWVkID0gb3JwaGFuRGVsYXllZENhbGxiYWNrcztcbiAgb3JwaGFuRGVsYXllZENhbGxiYWNrcyA9IG51bGw7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgZGVsYXllZC5sZW5ndGg7ICsraSkgeyBkZWxheWVkW2ldKCk7IH1cbn1cblxuLy8gV2hlbiBhbiBhc3BlY3Qgb2YgYSBsaW5lIGNoYW5nZXMsIGEgc3RyaW5nIGlzIGFkZGVkIHRvXG4vLyBsaW5lVmlldy5jaGFuZ2VzLiBUaGlzIHVwZGF0ZXMgdGhlIHJlbGV2YW50IHBhcnQgb2YgdGhlIGxpbmUnc1xuLy8gRE9NIHN0cnVjdHVyZS5cbmZ1bmN0aW9uIHVwZGF0ZUxpbmVGb3JDaGFuZ2VzKGNtLCBsaW5lVmlldywgbGluZU4sIGRpbXMpIHtcbiAgZm9yICh2YXIgaiA9IDA7IGogPCBsaW5lVmlldy5jaGFuZ2VzLmxlbmd0aDsgaisrKSB7XG4gICAgdmFyIHR5cGUgPSBsaW5lVmlldy5jaGFuZ2VzW2pdO1xuICAgIGlmICh0eXBlID09IFwidGV4dFwiKSB7IHVwZGF0ZUxpbmVUZXh0KGNtLCBsaW5lVmlldyk7IH1cbiAgICBlbHNlIGlmICh0eXBlID09IFwiZ3V0dGVyXCIpIHsgdXBkYXRlTGluZUd1dHRlcihjbSwgbGluZVZpZXcsIGxpbmVOLCBkaW1zKTsgfVxuICAgIGVsc2UgaWYgKHR5cGUgPT0gXCJjbGFzc1wiKSB7IHVwZGF0ZUxpbmVDbGFzc2VzKGNtLCBsaW5lVmlldyk7IH1cbiAgICBlbHNlIGlmICh0eXBlID09IFwid2lkZ2V0XCIpIHsgdXBkYXRlTGluZVdpZGdldHMoY20sIGxpbmVWaWV3LCBkaW1zKTsgfVxuICB9XG4gIGxpbmVWaWV3LmNoYW5nZXMgPSBudWxsO1xufVxuXG4vLyBMaW5lcyB3aXRoIGd1dHRlciBlbGVtZW50cywgd2lkZ2V0cyBvciBhIGJhY2tncm91bmQgY2xhc3MgbmVlZCB0b1xuLy8gYmUgd3JhcHBlZCwgYW5kIGhhdmUgdGhlIGV4dHJhIGVsZW1lbnRzIGFkZGVkIHRvIHRoZSB3cmFwcGVyIGRpdlxuZnVuY3Rpb24gZW5zdXJlTGluZVdyYXBwZWQobGluZVZpZXcpIHtcbiAgaWYgKGxpbmVWaWV3Lm5vZGUgPT0gbGluZVZpZXcudGV4dCkge1xuICAgIGxpbmVWaWV3Lm5vZGUgPSBlbHQoXCJkaXZcIiwgbnVsbCwgbnVsbCwgXCJwb3NpdGlvbjogcmVsYXRpdmVcIik7XG4gICAgaWYgKGxpbmVWaWV3LnRleHQucGFyZW50Tm9kZSlcbiAgICAgIHsgbGluZVZpZXcudGV4dC5wYXJlbnROb2RlLnJlcGxhY2VDaGlsZChsaW5lVmlldy5ub2RlLCBsaW5lVmlldy50ZXh0KTsgfVxuICAgIGxpbmVWaWV3Lm5vZGUuYXBwZW5kQ2hpbGQobGluZVZpZXcudGV4dCk7XG4gICAgaWYgKGllICYmIGllX3ZlcnNpb24gPCA4KSB7IGxpbmVWaWV3Lm5vZGUuc3R5bGUuekluZGV4ID0gMjsgfVxuICB9XG4gIHJldHVybiBsaW5lVmlldy5ub2RlXG59XG5cbmZ1bmN0aW9uIHVwZGF0ZUxpbmVCYWNrZ3JvdW5kKGNtLCBsaW5lVmlldykge1xuICB2YXIgY2xzID0gbGluZVZpZXcuYmdDbGFzcyA/IGxpbmVWaWV3LmJnQ2xhc3MgKyBcIiBcIiArIChsaW5lVmlldy5saW5lLmJnQ2xhc3MgfHwgXCJcIikgOiBsaW5lVmlldy5saW5lLmJnQ2xhc3M7XG4gIGlmIChjbHMpIHsgY2xzICs9IFwiIENvZGVNaXJyb3ItbGluZWJhY2tncm91bmRcIjsgfVxuICBpZiAobGluZVZpZXcuYmFja2dyb3VuZCkge1xuICAgIGlmIChjbHMpIHsgbGluZVZpZXcuYmFja2dyb3VuZC5jbGFzc05hbWUgPSBjbHM7IH1cbiAgICBlbHNlIHsgbGluZVZpZXcuYmFja2dyb3VuZC5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKGxpbmVWaWV3LmJhY2tncm91bmQpOyBsaW5lVmlldy5iYWNrZ3JvdW5kID0gbnVsbDsgfVxuICB9IGVsc2UgaWYgKGNscykge1xuICAgIHZhciB3cmFwID0gZW5zdXJlTGluZVdyYXBwZWQobGluZVZpZXcpO1xuICAgIGxpbmVWaWV3LmJhY2tncm91bmQgPSB3cmFwLmluc2VydEJlZm9yZShlbHQoXCJkaXZcIiwgbnVsbCwgY2xzKSwgd3JhcC5maXJzdENoaWxkKTtcbiAgICBjbS5kaXNwbGF5LmlucHV0LnNldFVuZWRpdGFibGUobGluZVZpZXcuYmFja2dyb3VuZCk7XG4gIH1cbn1cblxuLy8gV3JhcHBlciBhcm91bmQgYnVpbGRMaW5lQ29udGVudCB3aGljaCB3aWxsIHJldXNlIHRoZSBzdHJ1Y3R1cmVcbi8vIGluIGRpc3BsYXkuZXh0ZXJuYWxNZWFzdXJlZCB3aGVuIHBvc3NpYmxlLlxuZnVuY3Rpb24gZ2V0TGluZUNvbnRlbnQoY20sIGxpbmVWaWV3KSB7XG4gIHZhciBleHQgPSBjbS5kaXNwbGF5LmV4dGVybmFsTWVhc3VyZWQ7XG4gIGlmIChleHQgJiYgZXh0LmxpbmUgPT0gbGluZVZpZXcubGluZSkge1xuICAgIGNtLmRpc3BsYXkuZXh0ZXJuYWxNZWFzdXJlZCA9IG51bGw7XG4gICAgbGluZVZpZXcubWVhc3VyZSA9IGV4dC5tZWFzdXJlO1xuICAgIHJldHVybiBleHQuYnVpbHRcbiAgfVxuICByZXR1cm4gYnVpbGRMaW5lQ29udGVudChjbSwgbGluZVZpZXcpXG59XG5cbi8vIFJlZHJhdyB0aGUgbGluZSdzIHRleHQuIEludGVyYWN0cyB3aXRoIHRoZSBiYWNrZ3JvdW5kIGFuZCB0ZXh0XG4vLyBjbGFzc2VzIGJlY2F1c2UgdGhlIG1vZGUgbWF5IG91dHB1dCB0b2tlbnMgdGhhdCBpbmZsdWVuY2UgdGhlc2Vcbi8vIGNsYXNzZXMuXG5mdW5jdGlvbiB1cGRhdGVMaW5lVGV4dChjbSwgbGluZVZpZXcpIHtcbiAgdmFyIGNscyA9IGxpbmVWaWV3LnRleHQuY2xhc3NOYW1lO1xuICB2YXIgYnVpbHQgPSBnZXRMaW5lQ29udGVudChjbSwgbGluZVZpZXcpO1xuICBpZiAobGluZVZpZXcudGV4dCA9PSBsaW5lVmlldy5ub2RlKSB7IGxpbmVWaWV3Lm5vZGUgPSBidWlsdC5wcmU7IH1cbiAgbGluZVZpZXcudGV4dC5wYXJlbnROb2RlLnJlcGxhY2VDaGlsZChidWlsdC5wcmUsIGxpbmVWaWV3LnRleHQpO1xuICBsaW5lVmlldy50ZXh0ID0gYnVpbHQucHJlO1xuICBpZiAoYnVpbHQuYmdDbGFzcyAhPSBsaW5lVmlldy5iZ0NsYXNzIHx8IGJ1aWx0LnRleHRDbGFzcyAhPSBsaW5lVmlldy50ZXh0Q2xhc3MpIHtcbiAgICBsaW5lVmlldy5iZ0NsYXNzID0gYnVpbHQuYmdDbGFzcztcbiAgICBsaW5lVmlldy50ZXh0Q2xhc3MgPSBidWlsdC50ZXh0Q2xhc3M7XG4gICAgdXBkYXRlTGluZUNsYXNzZXMoY20sIGxpbmVWaWV3KTtcbiAgfSBlbHNlIGlmIChjbHMpIHtcbiAgICBsaW5lVmlldy50ZXh0LmNsYXNzTmFtZSA9IGNscztcbiAgfVxufVxuXG5mdW5jdGlvbiB1cGRhdGVMaW5lQ2xhc3NlcyhjbSwgbGluZVZpZXcpIHtcbiAgdXBkYXRlTGluZUJhY2tncm91bmQoY20sIGxpbmVWaWV3KTtcbiAgaWYgKGxpbmVWaWV3LmxpbmUud3JhcENsYXNzKVxuICAgIHsgZW5zdXJlTGluZVdyYXBwZWQobGluZVZpZXcpLmNsYXNzTmFtZSA9IGxpbmVWaWV3LmxpbmUud3JhcENsYXNzOyB9XG4gIGVsc2UgaWYgKGxpbmVWaWV3Lm5vZGUgIT0gbGluZVZpZXcudGV4dClcbiAgICB7IGxpbmVWaWV3Lm5vZGUuY2xhc3NOYW1lID0gXCJcIjsgfVxuICB2YXIgdGV4dENsYXNzID0gbGluZVZpZXcudGV4dENsYXNzID8gbGluZVZpZXcudGV4dENsYXNzICsgXCIgXCIgKyAobGluZVZpZXcubGluZS50ZXh0Q2xhc3MgfHwgXCJcIikgOiBsaW5lVmlldy5saW5lLnRleHRDbGFzcztcbiAgbGluZVZpZXcudGV4dC5jbGFzc05hbWUgPSB0ZXh0Q2xhc3MgfHwgXCJcIjtcbn1cblxuZnVuY3Rpb24gdXBkYXRlTGluZUd1dHRlcihjbSwgbGluZVZpZXcsIGxpbmVOLCBkaW1zKSB7XG4gIGlmIChsaW5lVmlldy5ndXR0ZXIpIHtcbiAgICBsaW5lVmlldy5ub2RlLnJlbW92ZUNoaWxkKGxpbmVWaWV3Lmd1dHRlcik7XG4gICAgbGluZVZpZXcuZ3V0dGVyID0gbnVsbDtcbiAgfVxuICBpZiAobGluZVZpZXcuZ3V0dGVyQmFja2dyb3VuZCkge1xuICAgIGxpbmVWaWV3Lm5vZGUucmVtb3ZlQ2hpbGQobGluZVZpZXcuZ3V0dGVyQmFja2dyb3VuZCk7XG4gICAgbGluZVZpZXcuZ3V0dGVyQmFja2dyb3VuZCA9IG51bGw7XG4gIH1cbiAgaWYgKGxpbmVWaWV3LmxpbmUuZ3V0dGVyQ2xhc3MpIHtcbiAgICB2YXIgd3JhcCA9IGVuc3VyZUxpbmVXcmFwcGVkKGxpbmVWaWV3KTtcbiAgICBsaW5lVmlldy5ndXR0ZXJCYWNrZ3JvdW5kID0gZWx0KFwiZGl2XCIsIG51bGwsIFwiQ29kZU1pcnJvci1ndXR0ZXItYmFja2dyb3VuZCBcIiArIGxpbmVWaWV3LmxpbmUuZ3V0dGVyQ2xhc3MsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAoXCJsZWZ0OiBcIiArIChjbS5vcHRpb25zLmZpeGVkR3V0dGVyID8gZGltcy5maXhlZFBvcyA6IC1kaW1zLmd1dHRlclRvdGFsV2lkdGgpICsgXCJweDsgd2lkdGg6IFwiICsgKGRpbXMuZ3V0dGVyVG90YWxXaWR0aCkgKyBcInB4XCIpKTtcbiAgICBjbS5kaXNwbGF5LmlucHV0LnNldFVuZWRpdGFibGUobGluZVZpZXcuZ3V0dGVyQmFja2dyb3VuZCk7XG4gICAgd3JhcC5pbnNlcnRCZWZvcmUobGluZVZpZXcuZ3V0dGVyQmFja2dyb3VuZCwgbGluZVZpZXcudGV4dCk7XG4gIH1cbiAgdmFyIG1hcmtlcnMgPSBsaW5lVmlldy5saW5lLmd1dHRlck1hcmtlcnM7XG4gIGlmIChjbS5vcHRpb25zLmxpbmVOdW1iZXJzIHx8IG1hcmtlcnMpIHtcbiAgICB2YXIgd3JhcCQxID0gZW5zdXJlTGluZVdyYXBwZWQobGluZVZpZXcpO1xuICAgIHZhciBndXR0ZXJXcmFwID0gbGluZVZpZXcuZ3V0dGVyID0gZWx0KFwiZGl2XCIsIG51bGwsIFwiQ29kZU1pcnJvci1ndXR0ZXItd3JhcHBlclwiLCAoXCJsZWZ0OiBcIiArIChjbS5vcHRpb25zLmZpeGVkR3V0dGVyID8gZGltcy5maXhlZFBvcyA6IC1kaW1zLmd1dHRlclRvdGFsV2lkdGgpICsgXCJweFwiKSk7XG4gICAgY20uZGlzcGxheS5pbnB1dC5zZXRVbmVkaXRhYmxlKGd1dHRlcldyYXApO1xuICAgIHdyYXAkMS5pbnNlcnRCZWZvcmUoZ3V0dGVyV3JhcCwgbGluZVZpZXcudGV4dCk7XG4gICAgaWYgKGxpbmVWaWV3LmxpbmUuZ3V0dGVyQ2xhc3MpXG4gICAgICB7IGd1dHRlcldyYXAuY2xhc3NOYW1lICs9IFwiIFwiICsgbGluZVZpZXcubGluZS5ndXR0ZXJDbGFzczsgfVxuICAgIGlmIChjbS5vcHRpb25zLmxpbmVOdW1iZXJzICYmICghbWFya2VycyB8fCAhbWFya2Vyc1tcIkNvZGVNaXJyb3ItbGluZW51bWJlcnNcIl0pKVxuICAgICAgeyBsaW5lVmlldy5saW5lTnVtYmVyID0gZ3V0dGVyV3JhcC5hcHBlbmRDaGlsZChcbiAgICAgICAgZWx0KFwiZGl2XCIsIGxpbmVOdW1iZXJGb3IoY20ub3B0aW9ucywgbGluZU4pLFxuICAgICAgICAgICAgXCJDb2RlTWlycm9yLWxpbmVudW1iZXIgQ29kZU1pcnJvci1ndXR0ZXItZWx0XCIsXG4gICAgICAgICAgICAoXCJsZWZ0OiBcIiArIChkaW1zLmd1dHRlckxlZnRbXCJDb2RlTWlycm9yLWxpbmVudW1iZXJzXCJdKSArIFwicHg7IHdpZHRoOiBcIiArIChjbS5kaXNwbGF5LmxpbmVOdW1Jbm5lcldpZHRoKSArIFwicHhcIikpKTsgfVxuICAgIGlmIChtYXJrZXJzKSB7IGZvciAodmFyIGsgPSAwOyBrIDwgY20ub3B0aW9ucy5ndXR0ZXJzLmxlbmd0aDsgKytrKSB7XG4gICAgICB2YXIgaWQgPSBjbS5vcHRpb25zLmd1dHRlcnNba10sIGZvdW5kID0gbWFya2Vycy5oYXNPd25Qcm9wZXJ0eShpZCkgJiYgbWFya2Vyc1tpZF07XG4gICAgICBpZiAoZm91bmQpXG4gICAgICAgIHsgZ3V0dGVyV3JhcC5hcHBlbmRDaGlsZChlbHQoXCJkaXZcIiwgW2ZvdW5kXSwgXCJDb2RlTWlycm9yLWd1dHRlci1lbHRcIixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKFwibGVmdDogXCIgKyAoZGltcy5ndXR0ZXJMZWZ0W2lkXSkgKyBcInB4OyB3aWR0aDogXCIgKyAoZGltcy5ndXR0ZXJXaWR0aFtpZF0pICsgXCJweFwiKSkpOyB9XG4gICAgfSB9XG4gIH1cbn1cblxuZnVuY3Rpb24gdXBkYXRlTGluZVdpZGdldHMoY20sIGxpbmVWaWV3LCBkaW1zKSB7XG4gIGlmIChsaW5lVmlldy5hbGlnbmFibGUpIHsgbGluZVZpZXcuYWxpZ25hYmxlID0gbnVsbDsgfVxuICBmb3IgKHZhciBub2RlID0gbGluZVZpZXcubm9kZS5maXJzdENoaWxkLCBuZXh0ID0gKHZvaWQgMCk7IG5vZGU7IG5vZGUgPSBuZXh0KSB7XG4gICAgbmV4dCA9IG5vZGUubmV4dFNpYmxpbmc7XG4gICAgaWYgKG5vZGUuY2xhc3NOYW1lID09IFwiQ29kZU1pcnJvci1saW5ld2lkZ2V0XCIpXG4gICAgICB7IGxpbmVWaWV3Lm5vZGUucmVtb3ZlQ2hpbGQobm9kZSk7IH1cbiAgfVxuICBpbnNlcnRMaW5lV2lkZ2V0cyhjbSwgbGluZVZpZXcsIGRpbXMpO1xufVxuXG4vLyBCdWlsZCBhIGxpbmUncyBET00gcmVwcmVzZW50YXRpb24gZnJvbSBzY3JhdGNoXG5mdW5jdGlvbiBidWlsZExpbmVFbGVtZW50KGNtLCBsaW5lVmlldywgbGluZU4sIGRpbXMpIHtcbiAgdmFyIGJ1aWx0ID0gZ2V0TGluZUNvbnRlbnQoY20sIGxpbmVWaWV3KTtcbiAgbGluZVZpZXcudGV4dCA9IGxpbmVWaWV3Lm5vZGUgPSBidWlsdC5wcmU7XG4gIGlmIChidWlsdC5iZ0NsYXNzKSB7IGxpbmVWaWV3LmJnQ2xhc3MgPSBidWlsdC5iZ0NsYXNzOyB9XG4gIGlmIChidWlsdC50ZXh0Q2xhc3MpIHsgbGluZVZpZXcudGV4dENsYXNzID0gYnVpbHQudGV4dENsYXNzOyB9XG5cbiAgdXBkYXRlTGluZUNsYXNzZXMoY20sIGxpbmVWaWV3KTtcbiAgdXBkYXRlTGluZUd1dHRlcihjbSwgbGluZVZpZXcsIGxpbmVOLCBkaW1zKTtcbiAgaW5zZXJ0TGluZVdpZGdldHMoY20sIGxpbmVWaWV3LCBkaW1zKTtcbiAgcmV0dXJuIGxpbmVWaWV3Lm5vZGVcbn1cblxuLy8gQSBsaW5lVmlldyBtYXkgY29udGFpbiBtdWx0aXBsZSBsb2dpY2FsIGxpbmVzICh3aGVuIG1lcmdlZCBieVxuLy8gY29sbGFwc2VkIHNwYW5zKS4gVGhlIHdpZGdldHMgZm9yIGFsbCBvZiB0aGVtIG5lZWQgdG8gYmUgZHJhd24uXG5mdW5jdGlvbiBpbnNlcnRMaW5lV2lkZ2V0cyhjbSwgbGluZVZpZXcsIGRpbXMpIHtcbiAgaW5zZXJ0TGluZVdpZGdldHNGb3IoY20sIGxpbmVWaWV3LmxpbmUsIGxpbmVWaWV3LCBkaW1zLCB0cnVlKTtcbiAgaWYgKGxpbmVWaWV3LnJlc3QpIHsgZm9yICh2YXIgaSA9IDA7IGkgPCBsaW5lVmlldy5yZXN0Lmxlbmd0aDsgaSsrKVxuICAgIHsgaW5zZXJ0TGluZVdpZGdldHNGb3IoY20sIGxpbmVWaWV3LnJlc3RbaV0sIGxpbmVWaWV3LCBkaW1zLCBmYWxzZSk7IH0gfVxufVxuXG5mdW5jdGlvbiBpbnNlcnRMaW5lV2lkZ2V0c0ZvcihjbSwgbGluZSwgbGluZVZpZXcsIGRpbXMsIGFsbG93QWJvdmUpIHtcbiAgaWYgKCFsaW5lLndpZGdldHMpIHsgcmV0dXJuIH1cbiAgdmFyIHdyYXAgPSBlbnN1cmVMaW5lV3JhcHBlZChsaW5lVmlldyk7XG4gIGZvciAodmFyIGkgPSAwLCB3cyA9IGxpbmUud2lkZ2V0czsgaSA8IHdzLmxlbmd0aDsgKytpKSB7XG4gICAgdmFyIHdpZGdldCA9IHdzW2ldLCBub2RlID0gZWx0KFwiZGl2XCIsIFt3aWRnZXQubm9kZV0sIFwiQ29kZU1pcnJvci1saW5ld2lkZ2V0XCIpO1xuICAgIGlmICghd2lkZ2V0LmhhbmRsZU1vdXNlRXZlbnRzKSB7IG5vZGUuc2V0QXR0cmlidXRlKFwiY20taWdub3JlLWV2ZW50c1wiLCBcInRydWVcIik7IH1cbiAgICBwb3NpdGlvbkxpbmVXaWRnZXQod2lkZ2V0LCBub2RlLCBsaW5lVmlldywgZGltcyk7XG4gICAgY20uZGlzcGxheS5pbnB1dC5zZXRVbmVkaXRhYmxlKG5vZGUpO1xuICAgIGlmIChhbGxvd0Fib3ZlICYmIHdpZGdldC5hYm92ZSlcbiAgICAgIHsgd3JhcC5pbnNlcnRCZWZvcmUobm9kZSwgbGluZVZpZXcuZ3V0dGVyIHx8IGxpbmVWaWV3LnRleHQpOyB9XG4gICAgZWxzZVxuICAgICAgeyB3cmFwLmFwcGVuZENoaWxkKG5vZGUpOyB9XG4gICAgc2lnbmFsTGF0ZXIod2lkZ2V0LCBcInJlZHJhd1wiKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBwb3NpdGlvbkxpbmVXaWRnZXQod2lkZ2V0LCBub2RlLCBsaW5lVmlldywgZGltcykge1xuICBpZiAod2lkZ2V0Lm5vSFNjcm9sbCkge1xuICAgIChsaW5lVmlldy5hbGlnbmFibGUgfHwgKGxpbmVWaWV3LmFsaWduYWJsZSA9IFtdKSkucHVzaChub2RlKTtcbiAgICB2YXIgd2lkdGggPSBkaW1zLndyYXBwZXJXaWR0aDtcbiAgICBub2RlLnN0eWxlLmxlZnQgPSBkaW1zLmZpeGVkUG9zICsgXCJweFwiO1xuICAgIGlmICghd2lkZ2V0LmNvdmVyR3V0dGVyKSB7XG4gICAgICB3aWR0aCAtPSBkaW1zLmd1dHRlclRvdGFsV2lkdGg7XG4gICAgICBub2RlLnN0eWxlLnBhZGRpbmdMZWZ0ID0gZGltcy5ndXR0ZXJUb3RhbFdpZHRoICsgXCJweFwiO1xuICAgIH1cbiAgICBub2RlLnN0eWxlLndpZHRoID0gd2lkdGggKyBcInB4XCI7XG4gIH1cbiAgaWYgKHdpZGdldC5jb3Zlckd1dHRlcikge1xuICAgIG5vZGUuc3R5bGUuekluZGV4ID0gNTtcbiAgICBub2RlLnN0eWxlLnBvc2l0aW9uID0gXCJyZWxhdGl2ZVwiO1xuICAgIGlmICghd2lkZ2V0Lm5vSFNjcm9sbCkgeyBub2RlLnN0eWxlLm1hcmdpbkxlZnQgPSAtZGltcy5ndXR0ZXJUb3RhbFdpZHRoICsgXCJweFwiOyB9XG4gIH1cbn1cblxuZnVuY3Rpb24gd2lkZ2V0SGVpZ2h0KHdpZGdldCkge1xuICBpZiAod2lkZ2V0LmhlaWdodCAhPSBudWxsKSB7IHJldHVybiB3aWRnZXQuaGVpZ2h0IH1cbiAgdmFyIGNtID0gd2lkZ2V0LmRvYy5jbTtcbiAgaWYgKCFjbSkgeyByZXR1cm4gMCB9XG4gIGlmICghY29udGFpbnMoZG9jdW1lbnQuYm9keSwgd2lkZ2V0Lm5vZGUpKSB7XG4gICAgdmFyIHBhcmVudFN0eWxlID0gXCJwb3NpdGlvbjogcmVsYXRpdmU7XCI7XG4gICAgaWYgKHdpZGdldC5jb3Zlckd1dHRlcilcbiAgICAgIHsgcGFyZW50U3R5bGUgKz0gXCJtYXJnaW4tbGVmdDogLVwiICsgY20uZGlzcGxheS5ndXR0ZXJzLm9mZnNldFdpZHRoICsgXCJweDtcIjsgfVxuICAgIGlmICh3aWRnZXQubm9IU2Nyb2xsKVxuICAgICAgeyBwYXJlbnRTdHlsZSArPSBcIndpZHRoOiBcIiArIGNtLmRpc3BsYXkud3JhcHBlci5jbGllbnRXaWR0aCArIFwicHg7XCI7IH1cbiAgICByZW1vdmVDaGlsZHJlbkFuZEFkZChjbS5kaXNwbGF5Lm1lYXN1cmUsIGVsdChcImRpdlwiLCBbd2lkZ2V0Lm5vZGVdLCBudWxsLCBwYXJlbnRTdHlsZSkpO1xuICB9XG4gIHJldHVybiB3aWRnZXQuaGVpZ2h0ID0gd2lkZ2V0Lm5vZGUucGFyZW50Tm9kZS5vZmZzZXRIZWlnaHRcbn1cblxuLy8gUmV0dXJuIHRydWUgd2hlbiB0aGUgZ2l2ZW4gbW91c2UgZXZlbnQgaGFwcGVuZWQgaW4gYSB3aWRnZXRcbmZ1bmN0aW9uIGV2ZW50SW5XaWRnZXQoZGlzcGxheSwgZSkge1xuICBmb3IgKHZhciBuID0gZV90YXJnZXQoZSk7IG4gIT0gZGlzcGxheS53cmFwcGVyOyBuID0gbi5wYXJlbnROb2RlKSB7XG4gICAgaWYgKCFuIHx8IChuLm5vZGVUeXBlID09IDEgJiYgbi5nZXRBdHRyaWJ1dGUoXCJjbS1pZ25vcmUtZXZlbnRzXCIpID09IFwidHJ1ZVwiKSB8fFxuICAgICAgICAobi5wYXJlbnROb2RlID09IGRpc3BsYXkuc2l6ZXIgJiYgbiAhPSBkaXNwbGF5Lm1vdmVyKSlcbiAgICAgIHsgcmV0dXJuIHRydWUgfVxuICB9XG59XG5cbi8vIFBPU0lUSU9OIE1FQVNVUkVNRU5UXG5cbmZ1bmN0aW9uIHBhZGRpbmdUb3AoZGlzcGxheSkge3JldHVybiBkaXNwbGF5LmxpbmVTcGFjZS5vZmZzZXRUb3B9XG5mdW5jdGlvbiBwYWRkaW5nVmVydChkaXNwbGF5KSB7cmV0dXJuIGRpc3BsYXkubW92ZXIub2Zmc2V0SGVpZ2h0IC0gZGlzcGxheS5saW5lU3BhY2Uub2Zmc2V0SGVpZ2h0fVxuZnVuY3Rpb24gcGFkZGluZ0goZGlzcGxheSkge1xuICBpZiAoZGlzcGxheS5jYWNoZWRQYWRkaW5nSCkgeyByZXR1cm4gZGlzcGxheS5jYWNoZWRQYWRkaW5nSCB9XG4gIHZhciBlID0gcmVtb3ZlQ2hpbGRyZW5BbmRBZGQoZGlzcGxheS5tZWFzdXJlLCBlbHQoXCJwcmVcIiwgXCJ4XCIpKTtcbiAgdmFyIHN0eWxlID0gd2luZG93LmdldENvbXB1dGVkU3R5bGUgPyB3aW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZShlKSA6IGUuY3VycmVudFN0eWxlO1xuICB2YXIgZGF0YSA9IHtsZWZ0OiBwYXJzZUludChzdHlsZS5wYWRkaW5nTGVmdCksIHJpZ2h0OiBwYXJzZUludChzdHlsZS5wYWRkaW5nUmlnaHQpfTtcbiAgaWYgKCFpc05hTihkYXRhLmxlZnQpICYmICFpc05hTihkYXRhLnJpZ2h0KSkgeyBkaXNwbGF5LmNhY2hlZFBhZGRpbmdIID0gZGF0YTsgfVxuICByZXR1cm4gZGF0YVxufVxuXG5mdW5jdGlvbiBzY3JvbGxHYXAoY20pIHsgcmV0dXJuIHNjcm9sbGVyR2FwIC0gY20uZGlzcGxheS5uYXRpdmVCYXJXaWR0aCB9XG5mdW5jdGlvbiBkaXNwbGF5V2lkdGgoY20pIHtcbiAgcmV0dXJuIGNtLmRpc3BsYXkuc2Nyb2xsZXIuY2xpZW50V2lkdGggLSBzY3JvbGxHYXAoY20pIC0gY20uZGlzcGxheS5iYXJXaWR0aFxufVxuZnVuY3Rpb24gZGlzcGxheUhlaWdodChjbSkge1xuICByZXR1cm4gY20uZGlzcGxheS5zY3JvbGxlci5jbGllbnRIZWlnaHQgLSBzY3JvbGxHYXAoY20pIC0gY20uZGlzcGxheS5iYXJIZWlnaHRcbn1cblxuLy8gRW5zdXJlIHRoZSBsaW5lVmlldy53cmFwcGluZy5oZWlnaHRzIGFycmF5IGlzIHBvcHVsYXRlZC4gVGhpcyBpc1xuLy8gYW4gYXJyYXkgb2YgYm90dG9tIG9mZnNldHMgZm9yIHRoZSBsaW5lcyB0aGF0IG1ha2UgdXAgYSBkcmF3blxuLy8gbGluZS4gV2hlbiBsaW5lV3JhcHBpbmcgaXMgb24sIHRoZXJlIG1pZ2h0IGJlIG1vcmUgdGhhbiBvbmVcbi8vIGhlaWdodC5cbmZ1bmN0aW9uIGVuc3VyZUxpbmVIZWlnaHRzKGNtLCBsaW5lVmlldywgcmVjdCkge1xuICB2YXIgd3JhcHBpbmcgPSBjbS5vcHRpb25zLmxpbmVXcmFwcGluZztcbiAgdmFyIGN1cldpZHRoID0gd3JhcHBpbmcgJiYgZGlzcGxheVdpZHRoKGNtKTtcbiAgaWYgKCFsaW5lVmlldy5tZWFzdXJlLmhlaWdodHMgfHwgd3JhcHBpbmcgJiYgbGluZVZpZXcubWVhc3VyZS53aWR0aCAhPSBjdXJXaWR0aCkge1xuICAgIHZhciBoZWlnaHRzID0gbGluZVZpZXcubWVhc3VyZS5oZWlnaHRzID0gW107XG4gICAgaWYgKHdyYXBwaW5nKSB7XG4gICAgICBsaW5lVmlldy5tZWFzdXJlLndpZHRoID0gY3VyV2lkdGg7XG4gICAgICB2YXIgcmVjdHMgPSBsaW5lVmlldy50ZXh0LmZpcnN0Q2hpbGQuZ2V0Q2xpZW50UmVjdHMoKTtcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcmVjdHMubGVuZ3RoIC0gMTsgaSsrKSB7XG4gICAgICAgIHZhciBjdXIgPSByZWN0c1tpXSwgbmV4dCA9IHJlY3RzW2kgKyAxXTtcbiAgICAgICAgaWYgKE1hdGguYWJzKGN1ci5ib3R0b20gLSBuZXh0LmJvdHRvbSkgPiAyKVxuICAgICAgICAgIHsgaGVpZ2h0cy5wdXNoKChjdXIuYm90dG9tICsgbmV4dC50b3ApIC8gMiAtIHJlY3QudG9wKTsgfVxuICAgICAgfVxuICAgIH1cbiAgICBoZWlnaHRzLnB1c2gocmVjdC5ib3R0b20gLSByZWN0LnRvcCk7XG4gIH1cbn1cblxuLy8gRmluZCBhIGxpbmUgbWFwIChtYXBwaW5nIGNoYXJhY3RlciBvZmZzZXRzIHRvIHRleHQgbm9kZXMpIGFuZCBhXG4vLyBtZWFzdXJlbWVudCBjYWNoZSBmb3IgdGhlIGdpdmVuIGxpbmUgbnVtYmVyLiAoQSBsaW5lIHZpZXcgbWlnaHRcbi8vIGNvbnRhaW4gbXVsdGlwbGUgbGluZXMgd2hlbiBjb2xsYXBzZWQgcmFuZ2VzIGFyZSBwcmVzZW50LilcbmZ1bmN0aW9uIG1hcEZyb21MaW5lVmlldyhsaW5lVmlldywgbGluZSwgbGluZU4pIHtcbiAgaWYgKGxpbmVWaWV3LmxpbmUgPT0gbGluZSlcbiAgICB7IHJldHVybiB7bWFwOiBsaW5lVmlldy5tZWFzdXJlLm1hcCwgY2FjaGU6IGxpbmVWaWV3Lm1lYXN1cmUuY2FjaGV9IH1cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsaW5lVmlldy5yZXN0Lmxlbmd0aDsgaSsrKVxuICAgIHsgaWYgKGxpbmVWaWV3LnJlc3RbaV0gPT0gbGluZSlcbiAgICAgIHsgcmV0dXJuIHttYXA6IGxpbmVWaWV3Lm1lYXN1cmUubWFwc1tpXSwgY2FjaGU6IGxpbmVWaWV3Lm1lYXN1cmUuY2FjaGVzW2ldfSB9IH1cbiAgZm9yICh2YXIgaSQxID0gMDsgaSQxIDwgbGluZVZpZXcucmVzdC5sZW5ndGg7IGkkMSsrKVxuICAgIHsgaWYgKGxpbmVObyhsaW5lVmlldy5yZXN0W2kkMV0pID4gbGluZU4pXG4gICAgICB7IHJldHVybiB7bWFwOiBsaW5lVmlldy5tZWFzdXJlLm1hcHNbaSQxXSwgY2FjaGU6IGxpbmVWaWV3Lm1lYXN1cmUuY2FjaGVzW2kkMV0sIGJlZm9yZTogdHJ1ZX0gfSB9XG59XG5cbi8vIFJlbmRlciBhIGxpbmUgaW50byB0aGUgaGlkZGVuIG5vZGUgZGlzcGxheS5leHRlcm5hbE1lYXN1cmVkLiBVc2VkXG4vLyB3aGVuIG1lYXN1cmVtZW50IGlzIG5lZWRlZCBmb3IgYSBsaW5lIHRoYXQncyBub3QgaW4gdGhlIHZpZXdwb3J0LlxuZnVuY3Rpb24gdXBkYXRlRXh0ZXJuYWxNZWFzdXJlbWVudChjbSwgbGluZSkge1xuICBsaW5lID0gdmlzdWFsTGluZShsaW5lKTtcbiAgdmFyIGxpbmVOID0gbGluZU5vKGxpbmUpO1xuICB2YXIgdmlldyA9IGNtLmRpc3BsYXkuZXh0ZXJuYWxNZWFzdXJlZCA9IG5ldyBMaW5lVmlldyhjbS5kb2MsIGxpbmUsIGxpbmVOKTtcbiAgdmlldy5saW5lTiA9IGxpbmVOO1xuICB2YXIgYnVpbHQgPSB2aWV3LmJ1aWx0ID0gYnVpbGRMaW5lQ29udGVudChjbSwgdmlldyk7XG4gIHZpZXcudGV4dCA9IGJ1aWx0LnByZTtcbiAgcmVtb3ZlQ2hpbGRyZW5BbmRBZGQoY20uZGlzcGxheS5saW5lTWVhc3VyZSwgYnVpbHQucHJlKTtcbiAgcmV0dXJuIHZpZXdcbn1cblxuLy8gR2V0IGEge3RvcCwgYm90dG9tLCBsZWZ0LCByaWdodH0gYm94IChpbiBsaW5lLWxvY2FsIGNvb3JkaW5hdGVzKVxuLy8gZm9yIGEgZ2l2ZW4gY2hhcmFjdGVyLlxuZnVuY3Rpb24gbWVhc3VyZUNoYXIoY20sIGxpbmUsIGNoLCBiaWFzKSB7XG4gIHJldHVybiBtZWFzdXJlQ2hhclByZXBhcmVkKGNtLCBwcmVwYXJlTWVhc3VyZUZvckxpbmUoY20sIGxpbmUpLCBjaCwgYmlhcylcbn1cblxuLy8gRmluZCBhIGxpbmUgdmlldyB0aGF0IGNvcnJlc3BvbmRzIHRvIHRoZSBnaXZlbiBsaW5lIG51bWJlci5cbmZ1bmN0aW9uIGZpbmRWaWV3Rm9yTGluZShjbSwgbGluZU4pIHtcbiAgaWYgKGxpbmVOID49IGNtLmRpc3BsYXkudmlld0Zyb20gJiYgbGluZU4gPCBjbS5kaXNwbGF5LnZpZXdUbylcbiAgICB7IHJldHVybiBjbS5kaXNwbGF5LnZpZXdbZmluZFZpZXdJbmRleChjbSwgbGluZU4pXSB9XG4gIHZhciBleHQgPSBjbS5kaXNwbGF5LmV4dGVybmFsTWVhc3VyZWQ7XG4gIGlmIChleHQgJiYgbGluZU4gPj0gZXh0LmxpbmVOICYmIGxpbmVOIDwgZXh0LmxpbmVOICsgZXh0LnNpemUpXG4gICAgeyByZXR1cm4gZXh0IH1cbn1cblxuLy8gTWVhc3VyZW1lbnQgY2FuIGJlIHNwbGl0IGluIHR3byBzdGVwcywgdGhlIHNldC11cCB3b3JrIHRoYXRcbi8vIGFwcGxpZXMgdG8gdGhlIHdob2xlIGxpbmUsIGFuZCB0aGUgbWVhc3VyZW1lbnQgb2YgdGhlIGFjdHVhbFxuLy8gY2hhcmFjdGVyLiBGdW5jdGlvbnMgbGlrZSBjb29yZHNDaGFyLCB0aGF0IG5lZWQgdG8gZG8gYSBsb3Qgb2Zcbi8vIG1lYXN1cmVtZW50cyBpbiBhIHJvdywgY2FuIHRodXMgZW5zdXJlIHRoYXQgdGhlIHNldC11cCB3b3JrIGlzXG4vLyBvbmx5IGRvbmUgb25jZS5cbmZ1bmN0aW9uIHByZXBhcmVNZWFzdXJlRm9yTGluZShjbSwgbGluZSkge1xuICB2YXIgbGluZU4gPSBsaW5lTm8obGluZSk7XG4gIHZhciB2aWV3ID0gZmluZFZpZXdGb3JMaW5lKGNtLCBsaW5lTik7XG4gIGlmICh2aWV3ICYmICF2aWV3LnRleHQpIHtcbiAgICB2aWV3ID0gbnVsbDtcbiAgfSBlbHNlIGlmICh2aWV3ICYmIHZpZXcuY2hhbmdlcykge1xuICAgIHVwZGF0ZUxpbmVGb3JDaGFuZ2VzKGNtLCB2aWV3LCBsaW5lTiwgZ2V0RGltZW5zaW9ucyhjbSkpO1xuICAgIGNtLmN1ck9wLmZvcmNlVXBkYXRlID0gdHJ1ZTtcbiAgfVxuICBpZiAoIXZpZXcpXG4gICAgeyB2aWV3ID0gdXBkYXRlRXh0ZXJuYWxNZWFzdXJlbWVudChjbSwgbGluZSk7IH1cblxuICB2YXIgaW5mbyA9IG1hcEZyb21MaW5lVmlldyh2aWV3LCBsaW5lLCBsaW5lTik7XG4gIHJldHVybiB7XG4gICAgbGluZTogbGluZSwgdmlldzogdmlldywgcmVjdDogbnVsbCxcbiAgICBtYXA6IGluZm8ubWFwLCBjYWNoZTogaW5mby5jYWNoZSwgYmVmb3JlOiBpbmZvLmJlZm9yZSxcbiAgICBoYXNIZWlnaHRzOiBmYWxzZVxuICB9XG59XG5cbi8vIEdpdmVuIGEgcHJlcGFyZWQgbWVhc3VyZW1lbnQgb2JqZWN0LCBtZWFzdXJlcyB0aGUgcG9zaXRpb24gb2YgYW5cbi8vIGFjdHVhbCBjaGFyYWN0ZXIgKG9yIGZldGNoZXMgaXQgZnJvbSB0aGUgY2FjaGUpLlxuZnVuY3Rpb24gbWVhc3VyZUNoYXJQcmVwYXJlZChjbSwgcHJlcGFyZWQsIGNoLCBiaWFzLCB2YXJIZWlnaHQpIHtcbiAgaWYgKHByZXBhcmVkLmJlZm9yZSkgeyBjaCA9IC0xOyB9XG4gIHZhciBrZXkgPSBjaCArIChiaWFzIHx8IFwiXCIpLCBmb3VuZDtcbiAgaWYgKHByZXBhcmVkLmNhY2hlLmhhc093blByb3BlcnR5KGtleSkpIHtcbiAgICBmb3VuZCA9IHByZXBhcmVkLmNhY2hlW2tleV07XG4gIH0gZWxzZSB7XG4gICAgaWYgKCFwcmVwYXJlZC5yZWN0KVxuICAgICAgeyBwcmVwYXJlZC5yZWN0ID0gcHJlcGFyZWQudmlldy50ZXh0LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpOyB9XG4gICAgaWYgKCFwcmVwYXJlZC5oYXNIZWlnaHRzKSB7XG4gICAgICBlbnN1cmVMaW5lSGVpZ2h0cyhjbSwgcHJlcGFyZWQudmlldywgcHJlcGFyZWQucmVjdCk7XG4gICAgICBwcmVwYXJlZC5oYXNIZWlnaHRzID0gdHJ1ZTtcbiAgICB9XG4gICAgZm91bmQgPSBtZWFzdXJlQ2hhcklubmVyKGNtLCBwcmVwYXJlZCwgY2gsIGJpYXMpO1xuICAgIGlmICghZm91bmQuYm9ndXMpIHsgcHJlcGFyZWQuY2FjaGVba2V5XSA9IGZvdW5kOyB9XG4gIH1cbiAgcmV0dXJuIHtsZWZ0OiBmb3VuZC5sZWZ0LCByaWdodDogZm91bmQucmlnaHQsXG4gICAgICAgICAgdG9wOiB2YXJIZWlnaHQgPyBmb3VuZC5ydG9wIDogZm91bmQudG9wLFxuICAgICAgICAgIGJvdHRvbTogdmFySGVpZ2h0ID8gZm91bmQucmJvdHRvbSA6IGZvdW5kLmJvdHRvbX1cbn1cblxudmFyIG51bGxSZWN0ID0ge2xlZnQ6IDAsIHJpZ2h0OiAwLCB0b3A6IDAsIGJvdHRvbTogMH07XG5cbmZ1bmN0aW9uIG5vZGVBbmRPZmZzZXRJbkxpbmVNYXAobWFwJCQxLCBjaCwgYmlhcykge1xuICB2YXIgbm9kZSwgc3RhcnQsIGVuZCwgY29sbGFwc2UsIG1TdGFydCwgbUVuZDtcbiAgLy8gRmlyc3QsIHNlYXJjaCB0aGUgbGluZSBtYXAgZm9yIHRoZSB0ZXh0IG5vZGUgY29ycmVzcG9uZGluZyB0byxcbiAgLy8gb3IgY2xvc2VzdCB0bywgdGhlIHRhcmdldCBjaGFyYWN0ZXIuXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbWFwJCQxLmxlbmd0aDsgaSArPSAzKSB7XG4gICAgbVN0YXJ0ID0gbWFwJCQxW2ldO1xuICAgIG1FbmQgPSBtYXAkJDFbaSArIDFdO1xuICAgIGlmIChjaCA8IG1TdGFydCkge1xuICAgICAgc3RhcnQgPSAwOyBlbmQgPSAxO1xuICAgICAgY29sbGFwc2UgPSBcImxlZnRcIjtcbiAgICB9IGVsc2UgaWYgKGNoIDwgbUVuZCkge1xuICAgICAgc3RhcnQgPSBjaCAtIG1TdGFydDtcbiAgICAgIGVuZCA9IHN0YXJ0ICsgMTtcbiAgICB9IGVsc2UgaWYgKGkgPT0gbWFwJCQxLmxlbmd0aCAtIDMgfHwgY2ggPT0gbUVuZCAmJiBtYXAkJDFbaSArIDNdID4gY2gpIHtcbiAgICAgIGVuZCA9IG1FbmQgLSBtU3RhcnQ7XG4gICAgICBzdGFydCA9IGVuZCAtIDE7XG4gICAgICBpZiAoY2ggPj0gbUVuZCkgeyBjb2xsYXBzZSA9IFwicmlnaHRcIjsgfVxuICAgIH1cbiAgICBpZiAoc3RhcnQgIT0gbnVsbCkge1xuICAgICAgbm9kZSA9IG1hcCQkMVtpICsgMl07XG4gICAgICBpZiAobVN0YXJ0ID09IG1FbmQgJiYgYmlhcyA9PSAobm9kZS5pbnNlcnRMZWZ0ID8gXCJsZWZ0XCIgOiBcInJpZ2h0XCIpKVxuICAgICAgICB7IGNvbGxhcHNlID0gYmlhczsgfVxuICAgICAgaWYgKGJpYXMgPT0gXCJsZWZ0XCIgJiYgc3RhcnQgPT0gMClcbiAgICAgICAgeyB3aGlsZSAoaSAmJiBtYXAkJDFbaSAtIDJdID09IG1hcCQkMVtpIC0gM10gJiYgbWFwJCQxW2kgLSAxXS5pbnNlcnRMZWZ0KSB7XG4gICAgICAgICAgbm9kZSA9IG1hcCQkMVsoaSAtPSAzKSArIDJdO1xuICAgICAgICAgIGNvbGxhcHNlID0gXCJsZWZ0XCI7XG4gICAgICAgIH0gfVxuICAgICAgaWYgKGJpYXMgPT0gXCJyaWdodFwiICYmIHN0YXJ0ID09IG1FbmQgLSBtU3RhcnQpXG4gICAgICAgIHsgd2hpbGUgKGkgPCBtYXAkJDEubGVuZ3RoIC0gMyAmJiBtYXAkJDFbaSArIDNdID09IG1hcCQkMVtpICsgNF0gJiYgIW1hcCQkMVtpICsgNV0uaW5zZXJ0TGVmdCkge1xuICAgICAgICAgIG5vZGUgPSBtYXAkJDFbKGkgKz0gMykgKyAyXTtcbiAgICAgICAgICBjb2xsYXBzZSA9IFwicmlnaHRcIjtcbiAgICAgICAgfSB9XG4gICAgICBicmVha1xuICAgIH1cbiAgfVxuICByZXR1cm4ge25vZGU6IG5vZGUsIHN0YXJ0OiBzdGFydCwgZW5kOiBlbmQsIGNvbGxhcHNlOiBjb2xsYXBzZSwgY292ZXJTdGFydDogbVN0YXJ0LCBjb3ZlckVuZDogbUVuZH1cbn1cblxuZnVuY3Rpb24gZ2V0VXNlZnVsUmVjdChyZWN0cywgYmlhcykge1xuICB2YXIgcmVjdCA9IG51bGxSZWN0O1xuICBpZiAoYmlhcyA9PSBcImxlZnRcIikgeyBmb3IgKHZhciBpID0gMDsgaSA8IHJlY3RzLmxlbmd0aDsgaSsrKSB7XG4gICAgaWYgKChyZWN0ID0gcmVjdHNbaV0pLmxlZnQgIT0gcmVjdC5yaWdodCkgeyBicmVhayB9XG4gIH0gfSBlbHNlIHsgZm9yICh2YXIgaSQxID0gcmVjdHMubGVuZ3RoIC0gMTsgaSQxID49IDA7IGkkMS0tKSB7XG4gICAgaWYgKChyZWN0ID0gcmVjdHNbaSQxXSkubGVmdCAhPSByZWN0LnJpZ2h0KSB7IGJyZWFrIH1cbiAgfSB9XG4gIHJldHVybiByZWN0XG59XG5cbmZ1bmN0aW9uIG1lYXN1cmVDaGFySW5uZXIoY20sIHByZXBhcmVkLCBjaCwgYmlhcykge1xuICB2YXIgcGxhY2UgPSBub2RlQW5kT2Zmc2V0SW5MaW5lTWFwKHByZXBhcmVkLm1hcCwgY2gsIGJpYXMpO1xuICB2YXIgbm9kZSA9IHBsYWNlLm5vZGUsIHN0YXJ0ID0gcGxhY2Uuc3RhcnQsIGVuZCA9IHBsYWNlLmVuZCwgY29sbGFwc2UgPSBwbGFjZS5jb2xsYXBzZTtcblxuICB2YXIgcmVjdDtcbiAgaWYgKG5vZGUubm9kZVR5cGUgPT0gMykgeyAvLyBJZiBpdCBpcyBhIHRleHQgbm9kZSwgdXNlIGEgcmFuZ2UgdG8gcmV0cmlldmUgdGhlIGNvb3JkaW5hdGVzLlxuICAgIGZvciAodmFyIGkkMSA9IDA7IGkkMSA8IDQ7IGkkMSsrKSB7IC8vIFJldHJ5IGEgbWF4aW11bSBvZiA0IHRpbWVzIHdoZW4gbm9uc2Vuc2UgcmVjdGFuZ2xlcyBhcmUgcmV0dXJuZWRcbiAgICAgIHdoaWxlIChzdGFydCAmJiBpc0V4dGVuZGluZ0NoYXIocHJlcGFyZWQubGluZS50ZXh0LmNoYXJBdChwbGFjZS5jb3ZlclN0YXJ0ICsgc3RhcnQpKSkgeyAtLXN0YXJ0OyB9XG4gICAgICB3aGlsZSAocGxhY2UuY292ZXJTdGFydCArIGVuZCA8IHBsYWNlLmNvdmVyRW5kICYmIGlzRXh0ZW5kaW5nQ2hhcihwcmVwYXJlZC5saW5lLnRleHQuY2hhckF0KHBsYWNlLmNvdmVyU3RhcnQgKyBlbmQpKSkgeyArK2VuZDsgfVxuICAgICAgaWYgKGllICYmIGllX3ZlcnNpb24gPCA5ICYmIHN0YXJ0ID09IDAgJiYgZW5kID09IHBsYWNlLmNvdmVyRW5kIC0gcGxhY2UuY292ZXJTdGFydClcbiAgICAgICAgeyByZWN0ID0gbm9kZS5wYXJlbnROb2RlLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpOyB9XG4gICAgICBlbHNlXG4gICAgICAgIHsgcmVjdCA9IGdldFVzZWZ1bFJlY3QocmFuZ2Uobm9kZSwgc3RhcnQsIGVuZCkuZ2V0Q2xpZW50UmVjdHMoKSwgYmlhcyk7IH1cbiAgICAgIGlmIChyZWN0LmxlZnQgfHwgcmVjdC5yaWdodCB8fCBzdGFydCA9PSAwKSB7IGJyZWFrIH1cbiAgICAgIGVuZCA9IHN0YXJ0O1xuICAgICAgc3RhcnQgPSBzdGFydCAtIDE7XG4gICAgICBjb2xsYXBzZSA9IFwicmlnaHRcIjtcbiAgICB9XG4gICAgaWYgKGllICYmIGllX3ZlcnNpb24gPCAxMSkgeyByZWN0ID0gbWF5YmVVcGRhdGVSZWN0Rm9yWm9vbWluZyhjbS5kaXNwbGF5Lm1lYXN1cmUsIHJlY3QpOyB9XG4gIH0gZWxzZSB7IC8vIElmIGl0IGlzIGEgd2lkZ2V0LCBzaW1wbHkgZ2V0IHRoZSBib3ggZm9yIHRoZSB3aG9sZSB3aWRnZXQuXG4gICAgaWYgKHN0YXJ0ID4gMCkgeyBjb2xsYXBzZSA9IGJpYXMgPSBcInJpZ2h0XCI7IH1cbiAgICB2YXIgcmVjdHM7XG4gICAgaWYgKGNtLm9wdGlvbnMubGluZVdyYXBwaW5nICYmIChyZWN0cyA9IG5vZGUuZ2V0Q2xpZW50UmVjdHMoKSkubGVuZ3RoID4gMSlcbiAgICAgIHsgcmVjdCA9IHJlY3RzW2JpYXMgPT0gXCJyaWdodFwiID8gcmVjdHMubGVuZ3RoIC0gMSA6IDBdOyB9XG4gICAgZWxzZVxuICAgICAgeyByZWN0ID0gbm9kZS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTsgfVxuICB9XG4gIGlmIChpZSAmJiBpZV92ZXJzaW9uIDwgOSAmJiAhc3RhcnQgJiYgKCFyZWN0IHx8ICFyZWN0LmxlZnQgJiYgIXJlY3QucmlnaHQpKSB7XG4gICAgdmFyIHJTcGFuID0gbm9kZS5wYXJlbnROb2RlLmdldENsaWVudFJlY3RzKClbMF07XG4gICAgaWYgKHJTcGFuKVxuICAgICAgeyByZWN0ID0ge2xlZnQ6IHJTcGFuLmxlZnQsIHJpZ2h0OiByU3Bhbi5sZWZ0ICsgY2hhcldpZHRoKGNtLmRpc3BsYXkpLCB0b3A6IHJTcGFuLnRvcCwgYm90dG9tOiByU3Bhbi5ib3R0b219OyB9XG4gICAgZWxzZVxuICAgICAgeyByZWN0ID0gbnVsbFJlY3Q7IH1cbiAgfVxuXG4gIHZhciBydG9wID0gcmVjdC50b3AgLSBwcmVwYXJlZC5yZWN0LnRvcCwgcmJvdCA9IHJlY3QuYm90dG9tIC0gcHJlcGFyZWQucmVjdC50b3A7XG4gIHZhciBtaWQgPSAocnRvcCArIHJib3QpIC8gMjtcbiAgdmFyIGhlaWdodHMgPSBwcmVwYXJlZC52aWV3Lm1lYXN1cmUuaGVpZ2h0cztcbiAgdmFyIGkgPSAwO1xuICBmb3IgKDsgaSA8IGhlaWdodHMubGVuZ3RoIC0gMTsgaSsrKVxuICAgIHsgaWYgKG1pZCA8IGhlaWdodHNbaV0pIHsgYnJlYWsgfSB9XG4gIHZhciB0b3AgPSBpID8gaGVpZ2h0c1tpIC0gMV0gOiAwLCBib3QgPSBoZWlnaHRzW2ldO1xuICB2YXIgcmVzdWx0ID0ge2xlZnQ6IChjb2xsYXBzZSA9PSBcInJpZ2h0XCIgPyByZWN0LnJpZ2h0IDogcmVjdC5sZWZ0KSAtIHByZXBhcmVkLnJlY3QubGVmdCxcbiAgICAgICAgICAgICAgICByaWdodDogKGNvbGxhcHNlID09IFwibGVmdFwiID8gcmVjdC5sZWZ0IDogcmVjdC5yaWdodCkgLSBwcmVwYXJlZC5yZWN0LmxlZnQsXG4gICAgICAgICAgICAgICAgdG9wOiB0b3AsIGJvdHRvbTogYm90fTtcbiAgaWYgKCFyZWN0LmxlZnQgJiYgIXJlY3QucmlnaHQpIHsgcmVzdWx0LmJvZ3VzID0gdHJ1ZTsgfVxuICBpZiAoIWNtLm9wdGlvbnMuc2luZ2xlQ3Vyc29ySGVpZ2h0UGVyTGluZSkgeyByZXN1bHQucnRvcCA9IHJ0b3A7IHJlc3VsdC5yYm90dG9tID0gcmJvdDsgfVxuXG4gIHJldHVybiByZXN1bHRcbn1cblxuLy8gV29yayBhcm91bmQgcHJvYmxlbSB3aXRoIGJvdW5kaW5nIGNsaWVudCByZWN0cyBvbiByYW5nZXMgYmVpbmdcbi8vIHJldHVybmVkIGluY29ycmVjdGx5IHdoZW4gem9vbWVkIG9uIElFMTAgYW5kIGJlbG93LlxuZnVuY3Rpb24gbWF5YmVVcGRhdGVSZWN0Rm9yWm9vbWluZyhtZWFzdXJlLCByZWN0KSB7XG4gIGlmICghd2luZG93LnNjcmVlbiB8fCBzY3JlZW4ubG9naWNhbFhEUEkgPT0gbnVsbCB8fFxuICAgICAgc2NyZWVuLmxvZ2ljYWxYRFBJID09IHNjcmVlbi5kZXZpY2VYRFBJIHx8ICFoYXNCYWRab29tZWRSZWN0cyhtZWFzdXJlKSlcbiAgICB7IHJldHVybiByZWN0IH1cbiAgdmFyIHNjYWxlWCA9IHNjcmVlbi5sb2dpY2FsWERQSSAvIHNjcmVlbi5kZXZpY2VYRFBJO1xuICB2YXIgc2NhbGVZID0gc2NyZWVuLmxvZ2ljYWxZRFBJIC8gc2NyZWVuLmRldmljZVlEUEk7XG4gIHJldHVybiB7bGVmdDogcmVjdC5sZWZ0ICogc2NhbGVYLCByaWdodDogcmVjdC5yaWdodCAqIHNjYWxlWCxcbiAgICAgICAgICB0b3A6IHJlY3QudG9wICogc2NhbGVZLCBib3R0b206IHJlY3QuYm90dG9tICogc2NhbGVZfVxufVxuXG5mdW5jdGlvbiBjbGVhckxpbmVNZWFzdXJlbWVudENhY2hlRm9yKGxpbmVWaWV3KSB7XG4gIGlmIChsaW5lVmlldy5tZWFzdXJlKSB7XG4gICAgbGluZVZpZXcubWVhc3VyZS5jYWNoZSA9IHt9O1xuICAgIGxpbmVWaWV3Lm1lYXN1cmUuaGVpZ2h0cyA9IG51bGw7XG4gICAgaWYgKGxpbmVWaWV3LnJlc3QpIHsgZm9yICh2YXIgaSA9IDA7IGkgPCBsaW5lVmlldy5yZXN0Lmxlbmd0aDsgaSsrKVxuICAgICAgeyBsaW5lVmlldy5tZWFzdXJlLmNhY2hlc1tpXSA9IHt9OyB9IH1cbiAgfVxufVxuXG5mdW5jdGlvbiBjbGVhckxpbmVNZWFzdXJlbWVudENhY2hlKGNtKSB7XG4gIGNtLmRpc3BsYXkuZXh0ZXJuYWxNZWFzdXJlID0gbnVsbDtcbiAgcmVtb3ZlQ2hpbGRyZW4oY20uZGlzcGxheS5saW5lTWVhc3VyZSk7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgY20uZGlzcGxheS52aWV3Lmxlbmd0aDsgaSsrKVxuICAgIHsgY2xlYXJMaW5lTWVhc3VyZW1lbnRDYWNoZUZvcihjbS5kaXNwbGF5LnZpZXdbaV0pOyB9XG59XG5cbmZ1bmN0aW9uIGNsZWFyQ2FjaGVzKGNtKSB7XG4gIGNsZWFyTGluZU1lYXN1cmVtZW50Q2FjaGUoY20pO1xuICBjbS5kaXNwbGF5LmNhY2hlZENoYXJXaWR0aCA9IGNtLmRpc3BsYXkuY2FjaGVkVGV4dEhlaWdodCA9IGNtLmRpc3BsYXkuY2FjaGVkUGFkZGluZ0ggPSBudWxsO1xuICBpZiAoIWNtLm9wdGlvbnMubGluZVdyYXBwaW5nKSB7IGNtLmRpc3BsYXkubWF4TGluZUNoYW5nZWQgPSB0cnVlOyB9XG4gIGNtLmRpc3BsYXkubGluZU51bUNoYXJzID0gbnVsbDtcbn1cblxuZnVuY3Rpb24gcGFnZVNjcm9sbFgoKSB7XG4gIC8vIFdvcmsgYXJvdW5kIGh0dHBzOi8vYnVncy5jaHJvbWl1bS5vcmcvcC9jaHJvbWl1bS9pc3N1ZXMvZGV0YWlsP2lkPTQ4OTIwNlxuICAvLyB3aGljaCBjYXVzZXMgcGFnZV9PZmZzZXQgYW5kIGJvdW5kaW5nIGNsaWVudCByZWN0cyB0byB1c2VcbiAgLy8gZGlmZmVyZW50IHJlZmVyZW5jZSB2aWV3cG9ydHMgYW5kIGludmFsaWRhdGUgb3VyIGNhbGN1bGF0aW9ucy5cbiAgaWYgKGNocm9tZSAmJiBhbmRyb2lkKSB7IHJldHVybiAtKGRvY3VtZW50LmJvZHkuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCkubGVmdCAtIHBhcnNlSW50KGdldENvbXB1dGVkU3R5bGUoZG9jdW1lbnQuYm9keSkubWFyZ2luTGVmdCkpIH1cbiAgcmV0dXJuIHdpbmRvdy5wYWdlWE9mZnNldCB8fCAoZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50IHx8IGRvY3VtZW50LmJvZHkpLnNjcm9sbExlZnRcbn1cbmZ1bmN0aW9uIHBhZ2VTY3JvbGxZKCkge1xuICBpZiAoY2hyb21lICYmIGFuZHJvaWQpIHsgcmV0dXJuIC0oZG9jdW1lbnQuYm9keS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKS50b3AgLSBwYXJzZUludChnZXRDb21wdXRlZFN0eWxlKGRvY3VtZW50LmJvZHkpLm1hcmdpblRvcCkpIH1cbiAgcmV0dXJuIHdpbmRvdy5wYWdlWU9mZnNldCB8fCAoZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50IHx8IGRvY3VtZW50LmJvZHkpLnNjcm9sbFRvcFxufVxuXG5mdW5jdGlvbiB3aWRnZXRUb3BIZWlnaHQobGluZU9iaikge1xuICB2YXIgaGVpZ2h0ID0gMDtcbiAgaWYgKGxpbmVPYmoud2lkZ2V0cykgeyBmb3IgKHZhciBpID0gMDsgaSA8IGxpbmVPYmoud2lkZ2V0cy5sZW5ndGg7ICsraSkgeyBpZiAobGluZU9iai53aWRnZXRzW2ldLmFib3ZlKVxuICAgIHsgaGVpZ2h0ICs9IHdpZGdldEhlaWdodChsaW5lT2JqLndpZGdldHNbaV0pOyB9IH0gfVxuICByZXR1cm4gaGVpZ2h0XG59XG5cbi8vIENvbnZlcnRzIGEge3RvcCwgYm90dG9tLCBsZWZ0LCByaWdodH0gYm94IGZyb20gbGluZS1sb2NhbFxuLy8gY29vcmRpbmF0ZXMgaW50byBhbm90aGVyIGNvb3JkaW5hdGUgc3lzdGVtLiBDb250ZXh0IG1heSBiZSBvbmUgb2Zcbi8vIFwibGluZVwiLCBcImRpdlwiIChkaXNwbGF5LmxpbmVEaXYpLCBcImxvY2FsXCIuL251bGwgKGVkaXRvciksIFwid2luZG93XCIsXG4vLyBvciBcInBhZ2VcIi5cbmZ1bmN0aW9uIGludG9Db29yZFN5c3RlbShjbSwgbGluZU9iaiwgcmVjdCwgY29udGV4dCwgaW5jbHVkZVdpZGdldHMpIHtcbiAgaWYgKCFpbmNsdWRlV2lkZ2V0cykge1xuICAgIHZhciBoZWlnaHQgPSB3aWRnZXRUb3BIZWlnaHQobGluZU9iaik7XG4gICAgcmVjdC50b3AgKz0gaGVpZ2h0OyByZWN0LmJvdHRvbSArPSBoZWlnaHQ7XG4gIH1cbiAgaWYgKGNvbnRleHQgPT0gXCJsaW5lXCIpIHsgcmV0dXJuIHJlY3QgfVxuICBpZiAoIWNvbnRleHQpIHsgY29udGV4dCA9IFwibG9jYWxcIjsgfVxuICB2YXIgeU9mZiA9IGhlaWdodEF0TGluZShsaW5lT2JqKTtcbiAgaWYgKGNvbnRleHQgPT0gXCJsb2NhbFwiKSB7IHlPZmYgKz0gcGFkZGluZ1RvcChjbS5kaXNwbGF5KTsgfVxuICBlbHNlIHsgeU9mZiAtPSBjbS5kaXNwbGF5LnZpZXdPZmZzZXQ7IH1cbiAgaWYgKGNvbnRleHQgPT0gXCJwYWdlXCIgfHwgY29udGV4dCA9PSBcIndpbmRvd1wiKSB7XG4gICAgdmFyIGxPZmYgPSBjbS5kaXNwbGF5LmxpbmVTcGFjZS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICB5T2ZmICs9IGxPZmYudG9wICsgKGNvbnRleHQgPT0gXCJ3aW5kb3dcIiA/IDAgOiBwYWdlU2Nyb2xsWSgpKTtcbiAgICB2YXIgeE9mZiA9IGxPZmYubGVmdCArIChjb250ZXh0ID09IFwid2luZG93XCIgPyAwIDogcGFnZVNjcm9sbFgoKSk7XG4gICAgcmVjdC5sZWZ0ICs9IHhPZmY7IHJlY3QucmlnaHQgKz0geE9mZjtcbiAgfVxuICByZWN0LnRvcCArPSB5T2ZmOyByZWN0LmJvdHRvbSArPSB5T2ZmO1xuICByZXR1cm4gcmVjdFxufVxuXG4vLyBDb3ZlcnRzIGEgYm94IGZyb20gXCJkaXZcIiBjb29yZHMgdG8gYW5vdGhlciBjb29yZGluYXRlIHN5c3RlbS5cbi8vIENvbnRleHQgbWF5IGJlIFwid2luZG93XCIsIFwicGFnZVwiLCBcImRpdlwiLCBvciBcImxvY2FsXCIuL251bGwuXG5mdW5jdGlvbiBmcm9tQ29vcmRTeXN0ZW0oY20sIGNvb3JkcywgY29udGV4dCkge1xuICBpZiAoY29udGV4dCA9PSBcImRpdlwiKSB7IHJldHVybiBjb29yZHMgfVxuICB2YXIgbGVmdCA9IGNvb3Jkcy5sZWZ0LCB0b3AgPSBjb29yZHMudG9wO1xuICAvLyBGaXJzdCBtb3ZlIGludG8gXCJwYWdlXCIgY29vcmRpbmF0ZSBzeXN0ZW1cbiAgaWYgKGNvbnRleHQgPT0gXCJwYWdlXCIpIHtcbiAgICBsZWZ0IC09IHBhZ2VTY3JvbGxYKCk7XG4gICAgdG9wIC09IHBhZ2VTY3JvbGxZKCk7XG4gIH0gZWxzZSBpZiAoY29udGV4dCA9PSBcImxvY2FsXCIgfHwgIWNvbnRleHQpIHtcbiAgICB2YXIgbG9jYWxCb3ggPSBjbS5kaXNwbGF5LnNpemVyLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgIGxlZnQgKz0gbG9jYWxCb3gubGVmdDtcbiAgICB0b3AgKz0gbG9jYWxCb3gudG9wO1xuICB9XG5cbiAgdmFyIGxpbmVTcGFjZUJveCA9IGNtLmRpc3BsYXkubGluZVNwYWNlLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICByZXR1cm4ge2xlZnQ6IGxlZnQgLSBsaW5lU3BhY2VCb3gubGVmdCwgdG9wOiB0b3AgLSBsaW5lU3BhY2VCb3gudG9wfVxufVxuXG5mdW5jdGlvbiBjaGFyQ29vcmRzKGNtLCBwb3MsIGNvbnRleHQsIGxpbmVPYmosIGJpYXMpIHtcbiAgaWYgKCFsaW5lT2JqKSB7IGxpbmVPYmogPSBnZXRMaW5lKGNtLmRvYywgcG9zLmxpbmUpOyB9XG4gIHJldHVybiBpbnRvQ29vcmRTeXN0ZW0oY20sIGxpbmVPYmosIG1lYXN1cmVDaGFyKGNtLCBsaW5lT2JqLCBwb3MuY2gsIGJpYXMpLCBjb250ZXh0KVxufVxuXG4vLyBSZXR1cm5zIGEgYm94IGZvciBhIGdpdmVuIGN1cnNvciBwb3NpdGlvbiwgd2hpY2ggbWF5IGhhdmUgYW5cbi8vICdvdGhlcicgcHJvcGVydHkgY29udGFpbmluZyB0aGUgcG9zaXRpb24gb2YgdGhlIHNlY29uZGFyeSBjdXJzb3Jcbi8vIG9uIGEgYmlkaSBib3VuZGFyeS5cbi8vIEEgY3Vyc29yIFBvcyhsaW5lLCBjaGFyLCBcImJlZm9yZVwiKSBpcyBvbiB0aGUgc2FtZSB2aXN1YWwgbGluZSBhcyBgY2hhciAtIDFgXG4vLyBhbmQgYWZ0ZXIgYGNoYXIgLSAxYCBpbiB3cml0aW5nIG9yZGVyIG9mIGBjaGFyIC0gMWBcbi8vIEEgY3Vyc29yIFBvcyhsaW5lLCBjaGFyLCBcImFmdGVyXCIpIGlzIG9uIHRoZSBzYW1lIHZpc3VhbCBsaW5lIGFzIGBjaGFyYFxuLy8gYW5kIGJlZm9yZSBgY2hhcmAgaW4gd3JpdGluZyBvcmRlciBvZiBgY2hhcmBcbi8vIEV4YW1wbGVzICh1cHBlci1jYXNlIGxldHRlcnMgYXJlIFJUTCwgbG93ZXItY2FzZSBhcmUgTFRSKTpcbi8vICAgICBQb3MoMCwgMSwgLi4uKVxuLy8gICAgIGJlZm9yZSAgIGFmdGVyXG4vLyBhYiAgICAgYXxiICAgICBhfGJcbi8vIGFCICAgICBhfEIgICAgIGFCfFxuLy8gQWIgICAgIHxBYiAgICAgQXxiXG4vLyBBQiAgICAgQnxBICAgICBCfEFcbi8vIEV2ZXJ5IHBvc2l0aW9uIGFmdGVyIHRoZSBsYXN0IGNoYXJhY3RlciBvbiBhIGxpbmUgaXMgY29uc2lkZXJlZCB0byBzdGlja1xuLy8gdG8gdGhlIGxhc3QgY2hhcmFjdGVyIG9uIHRoZSBsaW5lLlxuZnVuY3Rpb24gY3Vyc29yQ29vcmRzKGNtLCBwb3MsIGNvbnRleHQsIGxpbmVPYmosIHByZXBhcmVkTWVhc3VyZSwgdmFySGVpZ2h0KSB7XG4gIGxpbmVPYmogPSBsaW5lT2JqIHx8IGdldExpbmUoY20uZG9jLCBwb3MubGluZSk7XG4gIGlmICghcHJlcGFyZWRNZWFzdXJlKSB7IHByZXBhcmVkTWVhc3VyZSA9IHByZXBhcmVNZWFzdXJlRm9yTGluZShjbSwgbGluZU9iaik7IH1cbiAgZnVuY3Rpb24gZ2V0KGNoLCByaWdodCkge1xuICAgIHZhciBtID0gbWVhc3VyZUNoYXJQcmVwYXJlZChjbSwgcHJlcGFyZWRNZWFzdXJlLCBjaCwgcmlnaHQgPyBcInJpZ2h0XCIgOiBcImxlZnRcIiwgdmFySGVpZ2h0KTtcbiAgICBpZiAocmlnaHQpIHsgbS5sZWZ0ID0gbS5yaWdodDsgfSBlbHNlIHsgbS5yaWdodCA9IG0ubGVmdDsgfVxuICAgIHJldHVybiBpbnRvQ29vcmRTeXN0ZW0oY20sIGxpbmVPYmosIG0sIGNvbnRleHQpXG4gIH1cbiAgdmFyIG9yZGVyID0gZ2V0T3JkZXIobGluZU9iaiwgY20uZG9jLmRpcmVjdGlvbiksIGNoID0gcG9zLmNoLCBzdGlja3kgPSBwb3Muc3RpY2t5O1xuICBpZiAoY2ggPj0gbGluZU9iai50ZXh0Lmxlbmd0aCkge1xuICAgIGNoID0gbGluZU9iai50ZXh0Lmxlbmd0aDtcbiAgICBzdGlja3kgPSBcImJlZm9yZVwiO1xuICB9IGVsc2UgaWYgKGNoIDw9IDApIHtcbiAgICBjaCA9IDA7XG4gICAgc3RpY2t5ID0gXCJhZnRlclwiO1xuICB9XG4gIGlmICghb3JkZXIpIHsgcmV0dXJuIGdldChzdGlja3kgPT0gXCJiZWZvcmVcIiA/IGNoIC0gMSA6IGNoLCBzdGlja3kgPT0gXCJiZWZvcmVcIikgfVxuXG4gIGZ1bmN0aW9uIGdldEJpZGkoY2gsIHBhcnRQb3MsIGludmVydCkge1xuICAgIHZhciBwYXJ0ID0gb3JkZXJbcGFydFBvc10sIHJpZ2h0ID0gcGFydC5sZXZlbCA9PSAxO1xuICAgIHJldHVybiBnZXQoaW52ZXJ0ID8gY2ggLSAxIDogY2gsIHJpZ2h0ICE9IGludmVydClcbiAgfVxuICB2YXIgcGFydFBvcyA9IGdldEJpZGlQYXJ0QXQob3JkZXIsIGNoLCBzdGlja3kpO1xuICB2YXIgb3RoZXIgPSBiaWRpT3RoZXI7XG4gIHZhciB2YWwgPSBnZXRCaWRpKGNoLCBwYXJ0UG9zLCBzdGlja3kgPT0gXCJiZWZvcmVcIik7XG4gIGlmIChvdGhlciAhPSBudWxsKSB7IHZhbC5vdGhlciA9IGdldEJpZGkoY2gsIG90aGVyLCBzdGlja3kgIT0gXCJiZWZvcmVcIik7IH1cbiAgcmV0dXJuIHZhbFxufVxuXG4vLyBVc2VkIHRvIGNoZWFwbHkgZXN0aW1hdGUgdGhlIGNvb3JkaW5hdGVzIGZvciBhIHBvc2l0aW9uLiBVc2VkIGZvclxuLy8gaW50ZXJtZWRpYXRlIHNjcm9sbCB1cGRhdGVzLlxuZnVuY3Rpb24gZXN0aW1hdGVDb29yZHMoY20sIHBvcykge1xuICB2YXIgbGVmdCA9IDA7XG4gIHBvcyA9IGNsaXBQb3MoY20uZG9jLCBwb3MpO1xuICBpZiAoIWNtLm9wdGlvbnMubGluZVdyYXBwaW5nKSB7IGxlZnQgPSBjaGFyV2lkdGgoY20uZGlzcGxheSkgKiBwb3MuY2g7IH1cbiAgdmFyIGxpbmVPYmogPSBnZXRMaW5lKGNtLmRvYywgcG9zLmxpbmUpO1xuICB2YXIgdG9wID0gaGVpZ2h0QXRMaW5lKGxpbmVPYmopICsgcGFkZGluZ1RvcChjbS5kaXNwbGF5KTtcbiAgcmV0dXJuIHtsZWZ0OiBsZWZ0LCByaWdodDogbGVmdCwgdG9wOiB0b3AsIGJvdHRvbTogdG9wICsgbGluZU9iai5oZWlnaHR9XG59XG5cbi8vIFBvc2l0aW9ucyByZXR1cm5lZCBieSBjb29yZHNDaGFyIGNvbnRhaW4gc29tZSBleHRyYSBpbmZvcm1hdGlvbi5cbi8vIHhSZWwgaXMgdGhlIHJlbGF0aXZlIHggcG9zaXRpb24gb2YgdGhlIGlucHV0IGNvb3JkaW5hdGVzIGNvbXBhcmVkXG4vLyB0byB0aGUgZm91bmQgcG9zaXRpb24gKHNvIHhSZWwgPiAwIG1lYW5zIHRoZSBjb29yZGluYXRlcyBhcmUgdG9cbi8vIHRoZSByaWdodCBvZiB0aGUgY2hhcmFjdGVyIHBvc2l0aW9uLCBmb3IgZXhhbXBsZSkuIFdoZW4gb3V0c2lkZVxuLy8gaXMgdHJ1ZSwgdGhhdCBtZWFucyB0aGUgY29vcmRpbmF0ZXMgbGllIG91dHNpZGUgdGhlIGxpbmUnc1xuLy8gdmVydGljYWwgcmFuZ2UuXG5mdW5jdGlvbiBQb3NXaXRoSW5mbyhsaW5lLCBjaCwgc3RpY2t5LCBvdXRzaWRlLCB4UmVsKSB7XG4gIHZhciBwb3MgPSBQb3MobGluZSwgY2gsIHN0aWNreSk7XG4gIHBvcy54UmVsID0geFJlbDtcbiAgaWYgKG91dHNpZGUpIHsgcG9zLm91dHNpZGUgPSB0cnVlOyB9XG4gIHJldHVybiBwb3Ncbn1cblxuLy8gQ29tcHV0ZSB0aGUgY2hhcmFjdGVyIHBvc2l0aW9uIGNsb3Nlc3QgdG8gdGhlIGdpdmVuIGNvb3JkaW5hdGVzLlxuLy8gSW5wdXQgbXVzdCBiZSBsaW5lU3BhY2UtbG9jYWwgKFwiZGl2XCIgY29vcmRpbmF0ZSBzeXN0ZW0pLlxuZnVuY3Rpb24gY29vcmRzQ2hhcihjbSwgeCwgeSkge1xuICB2YXIgZG9jID0gY20uZG9jO1xuICB5ICs9IGNtLmRpc3BsYXkudmlld09mZnNldDtcbiAgaWYgKHkgPCAwKSB7IHJldHVybiBQb3NXaXRoSW5mbyhkb2MuZmlyc3QsIDAsIG51bGwsIHRydWUsIC0xKSB9XG4gIHZhciBsaW5lTiA9IGxpbmVBdEhlaWdodChkb2MsIHkpLCBsYXN0ID0gZG9jLmZpcnN0ICsgZG9jLnNpemUgLSAxO1xuICBpZiAobGluZU4gPiBsYXN0KVxuICAgIHsgcmV0dXJuIFBvc1dpdGhJbmZvKGRvYy5maXJzdCArIGRvYy5zaXplIC0gMSwgZ2V0TGluZShkb2MsIGxhc3QpLnRleHQubGVuZ3RoLCBudWxsLCB0cnVlLCAxKSB9XG4gIGlmICh4IDwgMCkgeyB4ID0gMDsgfVxuXG4gIHZhciBsaW5lT2JqID0gZ2V0TGluZShkb2MsIGxpbmVOKTtcbiAgZm9yICg7Oykge1xuICAgIHZhciBmb3VuZCA9IGNvb3Jkc0NoYXJJbm5lcihjbSwgbGluZU9iaiwgbGluZU4sIHgsIHkpO1xuICAgIHZhciBjb2xsYXBzZWQgPSBjb2xsYXBzZWRTcGFuQXJvdW5kKGxpbmVPYmosIGZvdW5kLmNoICsgKGZvdW5kLnhSZWwgPiAwID8gMSA6IDApKTtcbiAgICBpZiAoIWNvbGxhcHNlZCkgeyByZXR1cm4gZm91bmQgfVxuICAgIHZhciByYW5nZUVuZCA9IGNvbGxhcHNlZC5maW5kKDEpO1xuICAgIGlmIChyYW5nZUVuZC5saW5lID09IGxpbmVOKSB7IHJldHVybiByYW5nZUVuZCB9XG4gICAgbGluZU9iaiA9IGdldExpbmUoZG9jLCBsaW5lTiA9IHJhbmdlRW5kLmxpbmUpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHdyYXBwZWRMaW5lRXh0ZW50KGNtLCBsaW5lT2JqLCBwcmVwYXJlZE1lYXN1cmUsIHkpIHtcbiAgeSAtPSB3aWRnZXRUb3BIZWlnaHQobGluZU9iaik7XG4gIHZhciBlbmQgPSBsaW5lT2JqLnRleHQubGVuZ3RoO1xuICB2YXIgYmVnaW4gPSBmaW5kRmlyc3QoZnVuY3Rpb24gKGNoKSB7IHJldHVybiBtZWFzdXJlQ2hhclByZXBhcmVkKGNtLCBwcmVwYXJlZE1lYXN1cmUsIGNoIC0gMSkuYm90dG9tIDw9IHk7IH0sIGVuZCwgMCk7XG4gIGVuZCA9IGZpbmRGaXJzdChmdW5jdGlvbiAoY2gpIHsgcmV0dXJuIG1lYXN1cmVDaGFyUHJlcGFyZWQoY20sIHByZXBhcmVkTWVhc3VyZSwgY2gpLnRvcCA+IHk7IH0sIGJlZ2luLCBlbmQpO1xuICByZXR1cm4ge2JlZ2luOiBiZWdpbiwgZW5kOiBlbmR9XG59XG5cbmZ1bmN0aW9uIHdyYXBwZWRMaW5lRXh0ZW50Q2hhcihjbSwgbGluZU9iaiwgcHJlcGFyZWRNZWFzdXJlLCB0YXJnZXQpIHtcbiAgaWYgKCFwcmVwYXJlZE1lYXN1cmUpIHsgcHJlcGFyZWRNZWFzdXJlID0gcHJlcGFyZU1lYXN1cmVGb3JMaW5lKGNtLCBsaW5lT2JqKTsgfVxuICB2YXIgdGFyZ2V0VG9wID0gaW50b0Nvb3JkU3lzdGVtKGNtLCBsaW5lT2JqLCBtZWFzdXJlQ2hhclByZXBhcmVkKGNtLCBwcmVwYXJlZE1lYXN1cmUsIHRhcmdldCksIFwibGluZVwiKS50b3A7XG4gIHJldHVybiB3cmFwcGVkTGluZUV4dGVudChjbSwgbGluZU9iaiwgcHJlcGFyZWRNZWFzdXJlLCB0YXJnZXRUb3ApXG59XG5cbi8vIFJldHVybnMgdHJ1ZSBpZiB0aGUgZ2l2ZW4gc2lkZSBvZiBhIGJveCBpcyBhZnRlciB0aGUgZ2l2ZW5cbi8vIGNvb3JkaW5hdGVzLCBpbiB0b3AtdG8tYm90dG9tLCBsZWZ0LXRvLXJpZ2h0IG9yZGVyLlxuZnVuY3Rpb24gYm94SXNBZnRlcihib3gsIHgsIHksIGxlZnQpIHtcbiAgcmV0dXJuIGJveC5ib3R0b20gPD0geSA/IGZhbHNlIDogYm94LnRvcCA+IHkgPyB0cnVlIDogKGxlZnQgPyBib3gubGVmdCA6IGJveC5yaWdodCkgPiB4XG59XG5cbmZ1bmN0aW9uIGNvb3Jkc0NoYXJJbm5lcihjbSwgbGluZU9iaiwgbGluZU5vJCQxLCB4LCB5KSB7XG4gIC8vIE1vdmUgeSBpbnRvIGxpbmUtbG9jYWwgY29vcmRpbmF0ZSBzcGFjZVxuICB5IC09IGhlaWdodEF0TGluZShsaW5lT2JqKTtcbiAgdmFyIHByZXBhcmVkTWVhc3VyZSA9IHByZXBhcmVNZWFzdXJlRm9yTGluZShjbSwgbGluZU9iaik7XG4gIC8vIFdoZW4gZGlyZWN0bHkgY2FsbGluZyBgbWVhc3VyZUNoYXJQcmVwYXJlZGAsIHdlIGhhdmUgdG8gYWRqdXN0XG4gIC8vIGZvciB0aGUgd2lkZ2V0cyBhdCB0aGlzIGxpbmUuXG4gIHZhciB3aWRnZXRIZWlnaHQkJDEgPSB3aWRnZXRUb3BIZWlnaHQobGluZU9iaik7XG4gIHZhciBiZWdpbiA9IDAsIGVuZCA9IGxpbmVPYmoudGV4dC5sZW5ndGgsIGx0ciA9IHRydWU7XG5cbiAgdmFyIG9yZGVyID0gZ2V0T3JkZXIobGluZU9iaiwgY20uZG9jLmRpcmVjdGlvbik7XG4gIC8vIElmIHRoZSBsaW5lIGlzbid0IHBsYWluIGxlZnQtdG8tcmlnaHQgdGV4dCwgZmlyc3QgZmlndXJlIG91dFxuICAvLyB3aGljaCBiaWRpIHNlY3Rpb24gdGhlIGNvb3JkaW5hdGVzIGZhbGwgaW50by5cbiAgaWYgKG9yZGVyKSB7XG4gICAgdmFyIHBhcnQgPSAoY20ub3B0aW9ucy5saW5lV3JhcHBpbmcgPyBjb29yZHNCaWRpUGFydFdyYXBwZWQgOiBjb29yZHNCaWRpUGFydClcbiAgICAgICAgICAgICAgICAgKGNtLCBsaW5lT2JqLCBsaW5lTm8kJDEsIHByZXBhcmVkTWVhc3VyZSwgb3JkZXIsIHgsIHkpO1xuICAgIGx0ciA9IHBhcnQubGV2ZWwgIT0gMTtcbiAgICAvLyBUaGUgYXdrd2FyZCAtMSBvZmZzZXRzIGFyZSBuZWVkZWQgYmVjYXVzZSBmaW5kRmlyc3QgKGNhbGxlZFxuICAgIC8vIG9uIHRoZXNlIGJlbG93KSB3aWxsIHRyZWF0IGl0cyBmaXJzdCBib3VuZCBhcyBpbmNsdXNpdmUsXG4gICAgLy8gc2Vjb25kIGFzIGV4Y2x1c2l2ZSwgYnV0IHdlIHdhbnQgdG8gYWN0dWFsbHkgYWRkcmVzcyB0aGVcbiAgICAvLyBjaGFyYWN0ZXJzIGluIHRoZSBwYXJ0J3MgcmFuZ2VcbiAgICBiZWdpbiA9IGx0ciA/IHBhcnQuZnJvbSA6IHBhcnQudG8gLSAxO1xuICAgIGVuZCA9IGx0ciA/IHBhcnQudG8gOiBwYXJ0LmZyb20gLSAxO1xuICB9XG5cbiAgLy8gQSBiaW5hcnkgc2VhcmNoIHRvIGZpbmQgdGhlIGZpcnN0IGNoYXJhY3RlciB3aG9zZSBib3VuZGluZyBib3hcbiAgLy8gc3RhcnRzIGFmdGVyIHRoZSBjb29yZGluYXRlcy4gSWYgd2UgcnVuIGFjcm9zcyBhbnkgd2hvc2UgYm94IHdyYXBcbiAgLy8gdGhlIGNvb3JkaW5hdGVzLCBzdG9yZSB0aGF0LlxuICB2YXIgY2hBcm91bmQgPSBudWxsLCBib3hBcm91bmQgPSBudWxsO1xuICB2YXIgY2ggPSBmaW5kRmlyc3QoZnVuY3Rpb24gKGNoKSB7XG4gICAgdmFyIGJveCA9IG1lYXN1cmVDaGFyUHJlcGFyZWQoY20sIHByZXBhcmVkTWVhc3VyZSwgY2gpO1xuICAgIGJveC50b3AgKz0gd2lkZ2V0SGVpZ2h0JCQxOyBib3guYm90dG9tICs9IHdpZGdldEhlaWdodCQkMTtcbiAgICBpZiAoIWJveElzQWZ0ZXIoYm94LCB4LCB5LCBmYWxzZSkpIHsgcmV0dXJuIGZhbHNlIH1cbiAgICBpZiAoYm94LnRvcCA8PSB5ICYmIGJveC5sZWZ0IDw9IHgpIHtcbiAgICAgIGNoQXJvdW5kID0gY2g7XG4gICAgICBib3hBcm91bmQgPSBib3g7XG4gICAgfVxuICAgIHJldHVybiB0cnVlXG4gIH0sIGJlZ2luLCBlbmQpO1xuXG4gIHZhciBiYXNlWCwgc3RpY2t5LCBvdXRzaWRlID0gZmFsc2U7XG4gIC8vIElmIGEgYm94IGFyb3VuZCB0aGUgY29vcmRpbmF0ZXMgd2FzIGZvdW5kLCB1c2UgdGhhdFxuICBpZiAoYm94QXJvdW5kKSB7XG4gICAgLy8gRGlzdGluZ3Vpc2ggY29vcmRpbmF0ZXMgbmVhcmVyIHRvIHRoZSBsZWZ0IG9yIHJpZ2h0IHNpZGUgb2YgdGhlIGJveFxuICAgIHZhciBhdExlZnQgPSB4IC0gYm94QXJvdW5kLmxlZnQgPCBib3hBcm91bmQucmlnaHQgLSB4LCBhdFN0YXJ0ID0gYXRMZWZ0ID09IGx0cjtcbiAgICBjaCA9IGNoQXJvdW5kICsgKGF0U3RhcnQgPyAwIDogMSk7XG4gICAgc3RpY2t5ID0gYXRTdGFydCA/IFwiYWZ0ZXJcIiA6IFwiYmVmb3JlXCI7XG4gICAgYmFzZVggPSBhdExlZnQgPyBib3hBcm91bmQubGVmdCA6IGJveEFyb3VuZC5yaWdodDtcbiAgfSBlbHNlIHtcbiAgICAvLyAoQWRqdXN0IGZvciBleHRlbmRlZCBib3VuZCwgaWYgbmVjZXNzYXJ5LilcbiAgICBpZiAoIWx0ciAmJiAoY2ggPT0gZW5kIHx8IGNoID09IGJlZ2luKSkgeyBjaCsrOyB9XG4gICAgLy8gVG8gZGV0ZXJtaW5lIHdoaWNoIHNpZGUgdG8gYXNzb2NpYXRlIHdpdGgsIGdldCB0aGUgYm94IHRvIHRoZVxuICAgIC8vIGxlZnQgb2YgdGhlIGNoYXJhY3RlciBhbmQgY29tcGFyZSBpdCdzIHZlcnRpY2FsIHBvc2l0aW9uIHRvIHRoZVxuICAgIC8vIGNvb3JkaW5hdGVzXG4gICAgc3RpY2t5ID0gY2ggPT0gMCA/IFwiYWZ0ZXJcIiA6IGNoID09IGxpbmVPYmoudGV4dC5sZW5ndGggPyBcImJlZm9yZVwiIDpcbiAgICAgIChtZWFzdXJlQ2hhclByZXBhcmVkKGNtLCBwcmVwYXJlZE1lYXN1cmUsIGNoIC0gKGx0ciA/IDEgOiAwKSkuYm90dG9tICsgd2lkZ2V0SGVpZ2h0JCQxIDw9IHkpID09IGx0ciA/XG4gICAgICBcImFmdGVyXCIgOiBcImJlZm9yZVwiO1xuICAgIC8vIE5vdyBnZXQgYWNjdXJhdGUgY29vcmRpbmF0ZXMgZm9yIHRoaXMgcGxhY2UsIGluIG9yZGVyIHRvIGdldCBhXG4gICAgLy8gYmFzZSBYIHBvc2l0aW9uXG4gICAgdmFyIGNvb3JkcyA9IGN1cnNvckNvb3JkcyhjbSwgUG9zKGxpbmVObyQkMSwgY2gsIHN0aWNreSksIFwibGluZVwiLCBsaW5lT2JqLCBwcmVwYXJlZE1lYXN1cmUpO1xuICAgIGJhc2VYID0gY29vcmRzLmxlZnQ7XG4gICAgb3V0c2lkZSA9IHkgPCBjb29yZHMudG9wIHx8IHkgPj0gY29vcmRzLmJvdHRvbTtcbiAgfVxuXG4gIGNoID0gc2tpcEV4dGVuZGluZ0NoYXJzKGxpbmVPYmoudGV4dCwgY2gsIDEpO1xuICByZXR1cm4gUG9zV2l0aEluZm8obGluZU5vJCQxLCBjaCwgc3RpY2t5LCBvdXRzaWRlLCB4IC0gYmFzZVgpXG59XG5cbmZ1bmN0aW9uIGNvb3Jkc0JpZGlQYXJ0KGNtLCBsaW5lT2JqLCBsaW5lTm8kJDEsIHByZXBhcmVkTWVhc3VyZSwgb3JkZXIsIHgsIHkpIHtcbiAgLy8gQmlkaSBwYXJ0cyBhcmUgc29ydGVkIGxlZnQtdG8tcmlnaHQsIGFuZCBpbiBhIG5vbi1saW5lLXdyYXBwaW5nXG4gIC8vIHNpdHVhdGlvbiwgd2UgY2FuIHRha2UgdGhpcyBvcmRlcmluZyB0byBjb3JyZXNwb25kIHRvIHRoZSB2aXN1YWxcbiAgLy8gb3JkZXJpbmcuIFRoaXMgZmluZHMgdGhlIGZpcnN0IHBhcnQgd2hvc2UgZW5kIGlzIGFmdGVyIHRoZSBnaXZlblxuICAvLyBjb29yZGluYXRlcy5cbiAgdmFyIGluZGV4ID0gZmluZEZpcnN0KGZ1bmN0aW9uIChpKSB7XG4gICAgdmFyIHBhcnQgPSBvcmRlcltpXSwgbHRyID0gcGFydC5sZXZlbCAhPSAxO1xuICAgIHJldHVybiBib3hJc0FmdGVyKGN1cnNvckNvb3JkcyhjbSwgUG9zKGxpbmVObyQkMSwgbHRyID8gcGFydC50byA6IHBhcnQuZnJvbSwgbHRyID8gXCJiZWZvcmVcIiA6IFwiYWZ0ZXJcIiksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwibGluZVwiLCBsaW5lT2JqLCBwcmVwYXJlZE1lYXN1cmUpLCB4LCB5LCB0cnVlKVxuICB9LCAwLCBvcmRlci5sZW5ndGggLSAxKTtcbiAgdmFyIHBhcnQgPSBvcmRlcltpbmRleF07XG4gIC8vIElmIHRoaXMgaXNuJ3QgdGhlIGZpcnN0IHBhcnQsIHRoZSBwYXJ0J3Mgc3RhcnQgaXMgYWxzbyBhZnRlclxuICAvLyB0aGUgY29vcmRpbmF0ZXMsIGFuZCB0aGUgY29vcmRpbmF0ZXMgYXJlbid0IG9uIHRoZSBzYW1lIGxpbmUgYXNcbiAgLy8gdGhhdCBzdGFydCwgbW92ZSBvbmUgcGFydCBiYWNrLlxuICBpZiAoaW5kZXggPiAwKSB7XG4gICAgdmFyIGx0ciA9IHBhcnQubGV2ZWwgIT0gMTtcbiAgICB2YXIgc3RhcnQgPSBjdXJzb3JDb29yZHMoY20sIFBvcyhsaW5lTm8kJDEsIGx0ciA/IHBhcnQuZnJvbSA6IHBhcnQudG8sIGx0ciA/IFwiYWZ0ZXJcIiA6IFwiYmVmb3JlXCIpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImxpbmVcIiwgbGluZU9iaiwgcHJlcGFyZWRNZWFzdXJlKTtcbiAgICBpZiAoYm94SXNBZnRlcihzdGFydCwgeCwgeSwgdHJ1ZSkgJiYgc3RhcnQudG9wID4geSlcbiAgICAgIHsgcGFydCA9IG9yZGVyW2luZGV4IC0gMV07IH1cbiAgfVxuICByZXR1cm4gcGFydFxufVxuXG5mdW5jdGlvbiBjb29yZHNCaWRpUGFydFdyYXBwZWQoY20sIGxpbmVPYmosIF9saW5lTm8sIHByZXBhcmVkTWVhc3VyZSwgb3JkZXIsIHgsIHkpIHtcbiAgLy8gSW4gYSB3cmFwcGVkIGxpbmUsIHJ0bCB0ZXh0IG9uIHdyYXBwaW5nIGJvdW5kYXJpZXMgY2FuIGRvIHRoaW5nc1xuICAvLyB0aGF0IGRvbid0IGNvcnJlc3BvbmQgdG8gdGhlIG9yZGVyaW5nIGluIG91ciBgb3JkZXJgIGFycmF5IGF0XG4gIC8vIGFsbCwgc28gYSBiaW5hcnkgc2VhcmNoIGRvZXNuJ3Qgd29yaywgYW5kIHdlIHdhbnQgdG8gcmV0dXJuIGFcbiAgLy8gcGFydCB0aGF0IG9ubHkgc3BhbnMgb25lIGxpbmUgc28gdGhhdCB0aGUgYmluYXJ5IHNlYXJjaCBpblxuICAvLyBjb29yZHNDaGFySW5uZXIgaXMgc2FmZS4gQXMgc3VjaCwgd2UgZmlyc3QgZmluZCB0aGUgZXh0ZW50IG9mIHRoZVxuICAvLyB3cmFwcGVkIGxpbmUsIGFuZCB0aGVuIGRvIGEgZmxhdCBzZWFyY2ggaW4gd2hpY2ggd2UgZGlzY2FyZCBhbnlcbiAgLy8gc3BhbnMgdGhhdCBhcmVuJ3Qgb24gdGhlIGxpbmUuXG4gIHZhciByZWYgPSB3cmFwcGVkTGluZUV4dGVudChjbSwgbGluZU9iaiwgcHJlcGFyZWRNZWFzdXJlLCB5KTtcbiAgdmFyIGJlZ2luID0gcmVmLmJlZ2luO1xuICB2YXIgZW5kID0gcmVmLmVuZDtcbiAgaWYgKC9cXHMvLnRlc3QobGluZU9iai50ZXh0LmNoYXJBdChlbmQgLSAxKSkpIHsgZW5kLS07IH1cbiAgdmFyIHBhcnQgPSBudWxsLCBjbG9zZXN0RGlzdCA9IG51bGw7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgb3JkZXIubGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgcCA9IG9yZGVyW2ldO1xuICAgIGlmIChwLmZyb20gPj0gZW5kIHx8IHAudG8gPD0gYmVnaW4pIHsgY29udGludWUgfVxuICAgIHZhciBsdHIgPSBwLmxldmVsICE9IDE7XG4gICAgdmFyIGVuZFggPSBtZWFzdXJlQ2hhclByZXBhcmVkKGNtLCBwcmVwYXJlZE1lYXN1cmUsIGx0ciA/IE1hdGgubWluKGVuZCwgcC50bykgLSAxIDogTWF0aC5tYXgoYmVnaW4sIHAuZnJvbSkpLnJpZ2h0O1xuICAgIC8vIFdlaWdoIGFnYWluc3Qgc3BhbnMgZW5kaW5nIGJlZm9yZSB0aGlzLCBzbyB0aGF0IHRoZXkgYXJlIG9ubHlcbiAgICAvLyBwaWNrZWQgaWYgbm90aGluZyBlbmRzIGFmdGVyXG4gICAgdmFyIGRpc3QgPSBlbmRYIDwgeCA/IHggLSBlbmRYICsgMWU5IDogZW5kWCAtIHg7XG4gICAgaWYgKCFwYXJ0IHx8IGNsb3Nlc3REaXN0ID4gZGlzdCkge1xuICAgICAgcGFydCA9IHA7XG4gICAgICBjbG9zZXN0RGlzdCA9IGRpc3Q7XG4gICAgfVxuICB9XG4gIGlmICghcGFydCkgeyBwYXJ0ID0gb3JkZXJbb3JkZXIubGVuZ3RoIC0gMV07IH1cbiAgLy8gQ2xpcCB0aGUgcGFydCB0byB0aGUgd3JhcHBlZCBsaW5lLlxuICBpZiAocGFydC5mcm9tIDwgYmVnaW4pIHsgcGFydCA9IHtmcm9tOiBiZWdpbiwgdG86IHBhcnQudG8sIGxldmVsOiBwYXJ0LmxldmVsfTsgfVxuICBpZiAocGFydC50byA+IGVuZCkgeyBwYXJ0ID0ge2Zyb206IHBhcnQuZnJvbSwgdG86IGVuZCwgbGV2ZWw6IHBhcnQubGV2ZWx9OyB9XG4gIHJldHVybiBwYXJ0XG59XG5cbnZhciBtZWFzdXJlVGV4dDtcbi8vIENvbXB1dGUgdGhlIGRlZmF1bHQgdGV4dCBoZWlnaHQuXG5mdW5jdGlvbiB0ZXh0SGVpZ2h0KGRpc3BsYXkpIHtcbiAgaWYgKGRpc3BsYXkuY2FjaGVkVGV4dEhlaWdodCAhPSBudWxsKSB7IHJldHVybiBkaXNwbGF5LmNhY2hlZFRleHRIZWlnaHQgfVxuICBpZiAobWVhc3VyZVRleHQgPT0gbnVsbCkge1xuICAgIG1lYXN1cmVUZXh0ID0gZWx0KFwicHJlXCIpO1xuICAgIC8vIE1lYXN1cmUgYSBidW5jaCBvZiBsaW5lcywgZm9yIGJyb3dzZXJzIHRoYXQgY29tcHV0ZVxuICAgIC8vIGZyYWN0aW9uYWwgaGVpZ2h0cy5cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IDQ5OyArK2kpIHtcbiAgICAgIG1lYXN1cmVUZXh0LmFwcGVuZENoaWxkKGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKFwieFwiKSk7XG4gICAgICBtZWFzdXJlVGV4dC5hcHBlbmRDaGlsZChlbHQoXCJiclwiKSk7XG4gICAgfVxuICAgIG1lYXN1cmVUZXh0LmFwcGVuZENoaWxkKGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKFwieFwiKSk7XG4gIH1cbiAgcmVtb3ZlQ2hpbGRyZW5BbmRBZGQoZGlzcGxheS5tZWFzdXJlLCBtZWFzdXJlVGV4dCk7XG4gIHZhciBoZWlnaHQgPSBtZWFzdXJlVGV4dC5vZmZzZXRIZWlnaHQgLyA1MDtcbiAgaWYgKGhlaWdodCA+IDMpIHsgZGlzcGxheS5jYWNoZWRUZXh0SGVpZ2h0ID0gaGVpZ2h0OyB9XG4gIHJlbW92ZUNoaWxkcmVuKGRpc3BsYXkubWVhc3VyZSk7XG4gIHJldHVybiBoZWlnaHQgfHwgMVxufVxuXG4vLyBDb21wdXRlIHRoZSBkZWZhdWx0IGNoYXJhY3RlciB3aWR0aC5cbmZ1bmN0aW9uIGNoYXJXaWR0aChkaXNwbGF5KSB7XG4gIGlmIChkaXNwbGF5LmNhY2hlZENoYXJXaWR0aCAhPSBudWxsKSB7IHJldHVybiBkaXNwbGF5LmNhY2hlZENoYXJXaWR0aCB9XG4gIHZhciBhbmNob3IgPSBlbHQoXCJzcGFuXCIsIFwieHh4eHh4eHh4eFwiKTtcbiAgdmFyIHByZSA9IGVsdChcInByZVwiLCBbYW5jaG9yXSk7XG4gIHJlbW92ZUNoaWxkcmVuQW5kQWRkKGRpc3BsYXkubWVhc3VyZSwgcHJlKTtcbiAgdmFyIHJlY3QgPSBhbmNob3IuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCksIHdpZHRoID0gKHJlY3QucmlnaHQgLSByZWN0LmxlZnQpIC8gMTA7XG4gIGlmICh3aWR0aCA+IDIpIHsgZGlzcGxheS5jYWNoZWRDaGFyV2lkdGggPSB3aWR0aDsgfVxuICByZXR1cm4gd2lkdGggfHwgMTBcbn1cblxuLy8gRG8gYSBidWxrLXJlYWQgb2YgdGhlIERPTSBwb3NpdGlvbnMgYW5kIHNpemVzIG5lZWRlZCB0byBkcmF3IHRoZVxuLy8gdmlldywgc28gdGhhdCB3ZSBkb24ndCBpbnRlcmxlYXZlIHJlYWRpbmcgYW5kIHdyaXRpbmcgdG8gdGhlIERPTS5cbmZ1bmN0aW9uIGdldERpbWVuc2lvbnMoY20pIHtcbiAgdmFyIGQgPSBjbS5kaXNwbGF5LCBsZWZ0ID0ge30sIHdpZHRoID0ge307XG4gIHZhciBndXR0ZXJMZWZ0ID0gZC5ndXR0ZXJzLmNsaWVudExlZnQ7XG4gIGZvciAodmFyIG4gPSBkLmd1dHRlcnMuZmlyc3RDaGlsZCwgaSA9IDA7IG47IG4gPSBuLm5leHRTaWJsaW5nLCArK2kpIHtcbiAgICBsZWZ0W2NtLm9wdGlvbnMuZ3V0dGVyc1tpXV0gPSBuLm9mZnNldExlZnQgKyBuLmNsaWVudExlZnQgKyBndXR0ZXJMZWZ0O1xuICAgIHdpZHRoW2NtLm9wdGlvbnMuZ3V0dGVyc1tpXV0gPSBuLmNsaWVudFdpZHRoO1xuICB9XG4gIHJldHVybiB7Zml4ZWRQb3M6IGNvbXBlbnNhdGVGb3JIU2Nyb2xsKGQpLFxuICAgICAgICAgIGd1dHRlclRvdGFsV2lkdGg6IGQuZ3V0dGVycy5vZmZzZXRXaWR0aCxcbiAgICAgICAgICBndXR0ZXJMZWZ0OiBsZWZ0LFxuICAgICAgICAgIGd1dHRlcldpZHRoOiB3aWR0aCxcbiAgICAgICAgICB3cmFwcGVyV2lkdGg6IGQud3JhcHBlci5jbGllbnRXaWR0aH1cbn1cblxuLy8gQ29tcHV0ZXMgZGlzcGxheS5zY3JvbGxlci5zY3JvbGxMZWZ0ICsgZGlzcGxheS5ndXR0ZXJzLm9mZnNldFdpZHRoLFxuLy8gYnV0IHVzaW5nIGdldEJvdW5kaW5nQ2xpZW50UmVjdCB0byBnZXQgYSBzdWItcGl4ZWwtYWNjdXJhdGVcbi8vIHJlc3VsdC5cbmZ1bmN0aW9uIGNvbXBlbnNhdGVGb3JIU2Nyb2xsKGRpc3BsYXkpIHtcbiAgcmV0dXJuIGRpc3BsYXkuc2Nyb2xsZXIuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCkubGVmdCAtIGRpc3BsYXkuc2l6ZXIuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCkubGVmdFxufVxuXG4vLyBSZXR1cm5zIGEgZnVuY3Rpb24gdGhhdCBlc3RpbWF0ZXMgdGhlIGhlaWdodCBvZiBhIGxpbmUsIHRvIHVzZSBhc1xuLy8gZmlyc3QgYXBwcm94aW1hdGlvbiB1bnRpbCB0aGUgbGluZSBiZWNvbWVzIHZpc2libGUgKGFuZCBpcyB0aHVzXG4vLyBwcm9wZXJseSBtZWFzdXJhYmxlKS5cbmZ1bmN0aW9uIGVzdGltYXRlSGVpZ2h0KGNtKSB7XG4gIHZhciB0aCA9IHRleHRIZWlnaHQoY20uZGlzcGxheSksIHdyYXBwaW5nID0gY20ub3B0aW9ucy5saW5lV3JhcHBpbmc7XG4gIHZhciBwZXJMaW5lID0gd3JhcHBpbmcgJiYgTWF0aC5tYXgoNSwgY20uZGlzcGxheS5zY3JvbGxlci5jbGllbnRXaWR0aCAvIGNoYXJXaWR0aChjbS5kaXNwbGF5KSAtIDMpO1xuICByZXR1cm4gZnVuY3Rpb24gKGxpbmUpIHtcbiAgICBpZiAobGluZUlzSGlkZGVuKGNtLmRvYywgbGluZSkpIHsgcmV0dXJuIDAgfVxuXG4gICAgdmFyIHdpZGdldHNIZWlnaHQgPSAwO1xuICAgIGlmIChsaW5lLndpZGdldHMpIHsgZm9yICh2YXIgaSA9IDA7IGkgPCBsaW5lLndpZGdldHMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGlmIChsaW5lLndpZGdldHNbaV0uaGVpZ2h0KSB7IHdpZGdldHNIZWlnaHQgKz0gbGluZS53aWRnZXRzW2ldLmhlaWdodDsgfVxuICAgIH0gfVxuXG4gICAgaWYgKHdyYXBwaW5nKVxuICAgICAgeyByZXR1cm4gd2lkZ2V0c0hlaWdodCArIChNYXRoLmNlaWwobGluZS50ZXh0Lmxlbmd0aCAvIHBlckxpbmUpIHx8IDEpICogdGggfVxuICAgIGVsc2VcbiAgICAgIHsgcmV0dXJuIHdpZGdldHNIZWlnaHQgKyB0aCB9XG4gIH1cbn1cblxuZnVuY3Rpb24gZXN0aW1hdGVMaW5lSGVpZ2h0cyhjbSkge1xuICB2YXIgZG9jID0gY20uZG9jLCBlc3QgPSBlc3RpbWF0ZUhlaWdodChjbSk7XG4gIGRvYy5pdGVyKGZ1bmN0aW9uIChsaW5lKSB7XG4gICAgdmFyIGVzdEhlaWdodCA9IGVzdChsaW5lKTtcbiAgICBpZiAoZXN0SGVpZ2h0ICE9IGxpbmUuaGVpZ2h0KSB7IHVwZGF0ZUxpbmVIZWlnaHQobGluZSwgZXN0SGVpZ2h0KTsgfVxuICB9KTtcbn1cblxuLy8gR2l2ZW4gYSBtb3VzZSBldmVudCwgZmluZCB0aGUgY29ycmVzcG9uZGluZyBwb3NpdGlvbi4gSWYgbGliZXJhbFxuLy8gaXMgZmFsc2UsIGl0IGNoZWNrcyB3aGV0aGVyIGEgZ3V0dGVyIG9yIHNjcm9sbGJhciB3YXMgY2xpY2tlZCxcbi8vIGFuZCByZXR1cm5zIG51bGwgaWYgaXQgd2FzLiBmb3JSZWN0IGlzIHVzZWQgYnkgcmVjdGFuZ3VsYXJcbi8vIHNlbGVjdGlvbnMsIGFuZCB0cmllcyB0byBlc3RpbWF0ZSBhIGNoYXJhY3RlciBwb3NpdGlvbiBldmVuIGZvclxuLy8gY29vcmRpbmF0ZXMgYmV5b25kIHRoZSByaWdodCBvZiB0aGUgdGV4dC5cbmZ1bmN0aW9uIHBvc0Zyb21Nb3VzZShjbSwgZSwgbGliZXJhbCwgZm9yUmVjdCkge1xuICB2YXIgZGlzcGxheSA9IGNtLmRpc3BsYXk7XG4gIGlmICghbGliZXJhbCAmJiBlX3RhcmdldChlKS5nZXRBdHRyaWJ1dGUoXCJjbS1ub3QtY29udGVudFwiKSA9PSBcInRydWVcIikgeyByZXR1cm4gbnVsbCB9XG5cbiAgdmFyIHgsIHksIHNwYWNlID0gZGlzcGxheS5saW5lU3BhY2UuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gIC8vIEZhaWxzIHVucHJlZGljdGFibHkgb24gSUVbNjddIHdoZW4gbW91c2UgaXMgZHJhZ2dlZCBhcm91bmQgcXVpY2tseS5cbiAgdHJ5IHsgeCA9IGUuY2xpZW50WCAtIHNwYWNlLmxlZnQ7IHkgPSBlLmNsaWVudFkgLSBzcGFjZS50b3A7IH1cbiAgY2F0Y2ggKGUpIHsgcmV0dXJuIG51bGwgfVxuICB2YXIgY29vcmRzID0gY29vcmRzQ2hhcihjbSwgeCwgeSksIGxpbmU7XG4gIGlmIChmb3JSZWN0ICYmIGNvb3Jkcy54UmVsID09IDEgJiYgKGxpbmUgPSBnZXRMaW5lKGNtLmRvYywgY29vcmRzLmxpbmUpLnRleHQpLmxlbmd0aCA9PSBjb29yZHMuY2gpIHtcbiAgICB2YXIgY29sRGlmZiA9IGNvdW50Q29sdW1uKGxpbmUsIGxpbmUubGVuZ3RoLCBjbS5vcHRpb25zLnRhYlNpemUpIC0gbGluZS5sZW5ndGg7XG4gICAgY29vcmRzID0gUG9zKGNvb3Jkcy5saW5lLCBNYXRoLm1heCgwLCBNYXRoLnJvdW5kKCh4IC0gcGFkZGluZ0goY20uZGlzcGxheSkubGVmdCkgLyBjaGFyV2lkdGgoY20uZGlzcGxheSkpIC0gY29sRGlmZikpO1xuICB9XG4gIHJldHVybiBjb29yZHNcbn1cblxuLy8gRmluZCB0aGUgdmlldyBlbGVtZW50IGNvcnJlc3BvbmRpbmcgdG8gYSBnaXZlbiBsaW5lLiBSZXR1cm4gbnVsbFxuLy8gd2hlbiB0aGUgbGluZSBpc24ndCB2aXNpYmxlLlxuZnVuY3Rpb24gZmluZFZpZXdJbmRleChjbSwgbikge1xuICBpZiAobiA+PSBjbS5kaXNwbGF5LnZpZXdUbykgeyByZXR1cm4gbnVsbCB9XG4gIG4gLT0gY20uZGlzcGxheS52aWV3RnJvbTtcbiAgaWYgKG4gPCAwKSB7IHJldHVybiBudWxsIH1cbiAgdmFyIHZpZXcgPSBjbS5kaXNwbGF5LnZpZXc7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgdmlldy5sZW5ndGg7IGkrKykge1xuICAgIG4gLT0gdmlld1tpXS5zaXplO1xuICAgIGlmIChuIDwgMCkgeyByZXR1cm4gaSB9XG4gIH1cbn1cblxuZnVuY3Rpb24gdXBkYXRlU2VsZWN0aW9uKGNtKSB7XG4gIGNtLmRpc3BsYXkuaW5wdXQuc2hvd1NlbGVjdGlvbihjbS5kaXNwbGF5LmlucHV0LnByZXBhcmVTZWxlY3Rpb24oKSk7XG59XG5cbmZ1bmN0aW9uIHByZXBhcmVTZWxlY3Rpb24oY20sIHByaW1hcnkpIHtcbiAgaWYgKCBwcmltYXJ5ID09PSB2b2lkIDAgKSBwcmltYXJ5ID0gdHJ1ZTtcblxuICB2YXIgZG9jID0gY20uZG9jLCByZXN1bHQgPSB7fTtcbiAgdmFyIGN1ckZyYWdtZW50ID0gcmVzdWx0LmN1cnNvcnMgPSBkb2N1bWVudC5jcmVhdGVEb2N1bWVudEZyYWdtZW50KCk7XG4gIHZhciBzZWxGcmFnbWVudCA9IHJlc3VsdC5zZWxlY3Rpb24gPSBkb2N1bWVudC5jcmVhdGVEb2N1bWVudEZyYWdtZW50KCk7XG5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBkb2Muc2VsLnJhbmdlcy5sZW5ndGg7IGkrKykge1xuICAgIGlmICghcHJpbWFyeSAmJiBpID09IGRvYy5zZWwucHJpbUluZGV4KSB7IGNvbnRpbnVlIH1cbiAgICB2YXIgcmFuZ2UkJDEgPSBkb2Muc2VsLnJhbmdlc1tpXTtcbiAgICBpZiAocmFuZ2UkJDEuZnJvbSgpLmxpbmUgPj0gY20uZGlzcGxheS52aWV3VG8gfHwgcmFuZ2UkJDEudG8oKS5saW5lIDwgY20uZGlzcGxheS52aWV3RnJvbSkgeyBjb250aW51ZSB9XG4gICAgdmFyIGNvbGxhcHNlZCA9IHJhbmdlJCQxLmVtcHR5KCk7XG4gICAgaWYgKGNvbGxhcHNlZCB8fCBjbS5vcHRpb25zLnNob3dDdXJzb3JXaGVuU2VsZWN0aW5nKVxuICAgICAgeyBkcmF3U2VsZWN0aW9uQ3Vyc29yKGNtLCByYW5nZSQkMS5oZWFkLCBjdXJGcmFnbWVudCk7IH1cbiAgICBpZiAoIWNvbGxhcHNlZClcbiAgICAgIHsgZHJhd1NlbGVjdGlvblJhbmdlKGNtLCByYW5nZSQkMSwgc2VsRnJhZ21lbnQpOyB9XG4gIH1cbiAgcmV0dXJuIHJlc3VsdFxufVxuXG4vLyBEcmF3cyBhIGN1cnNvciBmb3IgdGhlIGdpdmVuIHJhbmdlXG5mdW5jdGlvbiBkcmF3U2VsZWN0aW9uQ3Vyc29yKGNtLCBoZWFkLCBvdXRwdXQpIHtcbiAgdmFyIHBvcyA9IGN1cnNvckNvb3JkcyhjbSwgaGVhZCwgXCJkaXZcIiwgbnVsbCwgbnVsbCwgIWNtLm9wdGlvbnMuc2luZ2xlQ3Vyc29ySGVpZ2h0UGVyTGluZSk7XG5cbiAgdmFyIGN1cnNvciA9IG91dHB1dC5hcHBlbmRDaGlsZChlbHQoXCJkaXZcIiwgXCJcXHUwMGEwXCIsIFwiQ29kZU1pcnJvci1jdXJzb3JcIikpO1xuICBjdXJzb3Iuc3R5bGUubGVmdCA9IHBvcy5sZWZ0ICsgXCJweFwiO1xuICBjdXJzb3Iuc3R5bGUudG9wID0gcG9zLnRvcCArIFwicHhcIjtcbiAgY3Vyc29yLnN0eWxlLmhlaWdodCA9IE1hdGgubWF4KDAsIHBvcy5ib3R0b20gLSBwb3MudG9wKSAqIGNtLm9wdGlvbnMuY3Vyc29ySGVpZ2h0ICsgXCJweFwiO1xuXG4gIGlmIChwb3Mub3RoZXIpIHtcbiAgICAvLyBTZWNvbmRhcnkgY3Vyc29yLCBzaG93biB3aGVuIG9uIGEgJ2p1bXAnIGluIGJpLWRpcmVjdGlvbmFsIHRleHRcbiAgICB2YXIgb3RoZXJDdXJzb3IgPSBvdXRwdXQuYXBwZW5kQ2hpbGQoZWx0KFwiZGl2XCIsIFwiXFx1MDBhMFwiLCBcIkNvZGVNaXJyb3ItY3Vyc29yIENvZGVNaXJyb3Itc2Vjb25kYXJ5Y3Vyc29yXCIpKTtcbiAgICBvdGhlckN1cnNvci5zdHlsZS5kaXNwbGF5ID0gXCJcIjtcbiAgICBvdGhlckN1cnNvci5zdHlsZS5sZWZ0ID0gcG9zLm90aGVyLmxlZnQgKyBcInB4XCI7XG4gICAgb3RoZXJDdXJzb3Iuc3R5bGUudG9wID0gcG9zLm90aGVyLnRvcCArIFwicHhcIjtcbiAgICBvdGhlckN1cnNvci5zdHlsZS5oZWlnaHQgPSAocG9zLm90aGVyLmJvdHRvbSAtIHBvcy5vdGhlci50b3ApICogLjg1ICsgXCJweFwiO1xuICB9XG59XG5cbmZ1bmN0aW9uIGNtcENvb3JkcyhhLCBiKSB7IHJldHVybiBhLnRvcCAtIGIudG9wIHx8IGEubGVmdCAtIGIubGVmdCB9XG5cbi8vIERyYXdzIHRoZSBnaXZlbiByYW5nZSBhcyBhIGhpZ2hsaWdodGVkIHNlbGVjdGlvblxuZnVuY3Rpb24gZHJhd1NlbGVjdGlvblJhbmdlKGNtLCByYW5nZSQkMSwgb3V0cHV0KSB7XG4gIHZhciBkaXNwbGF5ID0gY20uZGlzcGxheSwgZG9jID0gY20uZG9jO1xuICB2YXIgZnJhZ21lbnQgPSBkb2N1bWVudC5jcmVhdGVEb2N1bWVudEZyYWdtZW50KCk7XG4gIHZhciBwYWRkaW5nID0gcGFkZGluZ0goY20uZGlzcGxheSksIGxlZnRTaWRlID0gcGFkZGluZy5sZWZ0O1xuICB2YXIgcmlnaHRTaWRlID0gTWF0aC5tYXgoZGlzcGxheS5zaXplcldpZHRoLCBkaXNwbGF5V2lkdGgoY20pIC0gZGlzcGxheS5zaXplci5vZmZzZXRMZWZ0KSAtIHBhZGRpbmcucmlnaHQ7XG4gIHZhciBkb2NMVFIgPSBkb2MuZGlyZWN0aW9uID09IFwibHRyXCI7XG5cbiAgZnVuY3Rpb24gYWRkKGxlZnQsIHRvcCwgd2lkdGgsIGJvdHRvbSkge1xuICAgIGlmICh0b3AgPCAwKSB7IHRvcCA9IDA7IH1cbiAgICB0b3AgPSBNYXRoLnJvdW5kKHRvcCk7XG4gICAgYm90dG9tID0gTWF0aC5yb3VuZChib3R0b20pO1xuICAgIGZyYWdtZW50LmFwcGVuZENoaWxkKGVsdChcImRpdlwiLCBudWxsLCBcIkNvZGVNaXJyb3Itc2VsZWN0ZWRcIiwgKFwicG9zaXRpb246IGFic29sdXRlOyBsZWZ0OiBcIiArIGxlZnQgKyBcInB4O1xcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdG9wOiBcIiArIHRvcCArIFwicHg7IHdpZHRoOiBcIiArICh3aWR0aCA9PSBudWxsID8gcmlnaHRTaWRlIC0gbGVmdCA6IHdpZHRoKSArIFwicHg7XFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICBoZWlnaHQ6IFwiICsgKGJvdHRvbSAtIHRvcCkgKyBcInB4XCIpKSk7XG4gIH1cblxuICBmdW5jdGlvbiBkcmF3Rm9yTGluZShsaW5lLCBmcm9tQXJnLCB0b0FyZykge1xuICAgIHZhciBsaW5lT2JqID0gZ2V0TGluZShkb2MsIGxpbmUpO1xuICAgIHZhciBsaW5lTGVuID0gbGluZU9iai50ZXh0Lmxlbmd0aDtcbiAgICB2YXIgc3RhcnQsIGVuZDtcbiAgICBmdW5jdGlvbiBjb29yZHMoY2gsIGJpYXMpIHtcbiAgICAgIHJldHVybiBjaGFyQ29vcmRzKGNtLCBQb3MobGluZSwgY2gpLCBcImRpdlwiLCBsaW5lT2JqLCBiaWFzKVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHdyYXBYKHBvcywgZGlyLCBzaWRlKSB7XG4gICAgICB2YXIgZXh0ZW50ID0gd3JhcHBlZExpbmVFeHRlbnRDaGFyKGNtLCBsaW5lT2JqLCBudWxsLCBwb3MpO1xuICAgICAgdmFyIHByb3AgPSAoZGlyID09IFwibHRyXCIpID09IChzaWRlID09IFwiYWZ0ZXJcIikgPyBcImxlZnRcIiA6IFwicmlnaHRcIjtcbiAgICAgIHZhciBjaCA9IHNpZGUgPT0gXCJhZnRlclwiID8gZXh0ZW50LmJlZ2luIDogZXh0ZW50LmVuZCAtICgvXFxzLy50ZXN0KGxpbmVPYmoudGV4dC5jaGFyQXQoZXh0ZW50LmVuZCAtIDEpKSA/IDIgOiAxKTtcbiAgICAgIHJldHVybiBjb29yZHMoY2gsIHByb3ApW3Byb3BdXG4gICAgfVxuXG4gICAgdmFyIG9yZGVyID0gZ2V0T3JkZXIobGluZU9iaiwgZG9jLmRpcmVjdGlvbik7XG4gICAgaXRlcmF0ZUJpZGlTZWN0aW9ucyhvcmRlciwgZnJvbUFyZyB8fCAwLCB0b0FyZyA9PSBudWxsID8gbGluZUxlbiA6IHRvQXJnLCBmdW5jdGlvbiAoZnJvbSwgdG8sIGRpciwgaSkge1xuICAgICAgdmFyIGx0ciA9IGRpciA9PSBcImx0clwiO1xuICAgICAgdmFyIGZyb21Qb3MgPSBjb29yZHMoZnJvbSwgbHRyID8gXCJsZWZ0XCIgOiBcInJpZ2h0XCIpO1xuICAgICAgdmFyIHRvUG9zID0gY29vcmRzKHRvIC0gMSwgbHRyID8gXCJyaWdodFwiIDogXCJsZWZ0XCIpO1xuXG4gICAgICB2YXIgb3BlblN0YXJ0ID0gZnJvbUFyZyA9PSBudWxsICYmIGZyb20gPT0gMCwgb3BlbkVuZCA9IHRvQXJnID09IG51bGwgJiYgdG8gPT0gbGluZUxlbjtcbiAgICAgIHZhciBmaXJzdCA9IGkgPT0gMCwgbGFzdCA9ICFvcmRlciB8fCBpID09IG9yZGVyLmxlbmd0aCAtIDE7XG4gICAgICBpZiAodG9Qb3MudG9wIC0gZnJvbVBvcy50b3AgPD0gMykgeyAvLyBTaW5nbGUgbGluZVxuICAgICAgICB2YXIgb3BlbkxlZnQgPSAoZG9jTFRSID8gb3BlblN0YXJ0IDogb3BlbkVuZCkgJiYgZmlyc3Q7XG4gICAgICAgIHZhciBvcGVuUmlnaHQgPSAoZG9jTFRSID8gb3BlbkVuZCA6IG9wZW5TdGFydCkgJiYgbGFzdDtcbiAgICAgICAgdmFyIGxlZnQgPSBvcGVuTGVmdCA/IGxlZnRTaWRlIDogKGx0ciA/IGZyb21Qb3MgOiB0b1BvcykubGVmdDtcbiAgICAgICAgdmFyIHJpZ2h0ID0gb3BlblJpZ2h0ID8gcmlnaHRTaWRlIDogKGx0ciA/IHRvUG9zIDogZnJvbVBvcykucmlnaHQ7XG4gICAgICAgIGFkZChsZWZ0LCBmcm9tUG9zLnRvcCwgcmlnaHQgLSBsZWZ0LCBmcm9tUG9zLmJvdHRvbSk7XG4gICAgICB9IGVsc2UgeyAvLyBNdWx0aXBsZSBsaW5lc1xuICAgICAgICB2YXIgdG9wTGVmdCwgdG9wUmlnaHQsIGJvdExlZnQsIGJvdFJpZ2h0O1xuICAgICAgICBpZiAobHRyKSB7XG4gICAgICAgICAgdG9wTGVmdCA9IGRvY0xUUiAmJiBvcGVuU3RhcnQgJiYgZmlyc3QgPyBsZWZ0U2lkZSA6IGZyb21Qb3MubGVmdDtcbiAgICAgICAgICB0b3BSaWdodCA9IGRvY0xUUiA/IHJpZ2h0U2lkZSA6IHdyYXBYKGZyb20sIGRpciwgXCJiZWZvcmVcIik7XG4gICAgICAgICAgYm90TGVmdCA9IGRvY0xUUiA/IGxlZnRTaWRlIDogd3JhcFgodG8sIGRpciwgXCJhZnRlclwiKTtcbiAgICAgICAgICBib3RSaWdodCA9IGRvY0xUUiAmJiBvcGVuRW5kICYmIGxhc3QgPyByaWdodFNpZGUgOiB0b1Bvcy5yaWdodDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0b3BMZWZ0ID0gIWRvY0xUUiA/IGxlZnRTaWRlIDogd3JhcFgoZnJvbSwgZGlyLCBcImJlZm9yZVwiKTtcbiAgICAgICAgICB0b3BSaWdodCA9ICFkb2NMVFIgJiYgb3BlblN0YXJ0ICYmIGZpcnN0ID8gcmlnaHRTaWRlIDogZnJvbVBvcy5yaWdodDtcbiAgICAgICAgICBib3RMZWZ0ID0gIWRvY0xUUiAmJiBvcGVuRW5kICYmIGxhc3QgPyBsZWZ0U2lkZSA6IHRvUG9zLmxlZnQ7XG4gICAgICAgICAgYm90UmlnaHQgPSAhZG9jTFRSID8gcmlnaHRTaWRlIDogd3JhcFgodG8sIGRpciwgXCJhZnRlclwiKTtcbiAgICAgICAgfVxuICAgICAgICBhZGQodG9wTGVmdCwgZnJvbVBvcy50b3AsIHRvcFJpZ2h0IC0gdG9wTGVmdCwgZnJvbVBvcy5ib3R0b20pO1xuICAgICAgICBpZiAoZnJvbVBvcy5ib3R0b20gPCB0b1Bvcy50b3ApIHsgYWRkKGxlZnRTaWRlLCBmcm9tUG9zLmJvdHRvbSwgbnVsbCwgdG9Qb3MudG9wKTsgfVxuICAgICAgICBhZGQoYm90TGVmdCwgdG9Qb3MudG9wLCBib3RSaWdodCAtIGJvdExlZnQsIHRvUG9zLmJvdHRvbSk7XG4gICAgICB9XG5cbiAgICAgIGlmICghc3RhcnQgfHwgY21wQ29vcmRzKGZyb21Qb3MsIHN0YXJ0KSA8IDApIHsgc3RhcnQgPSBmcm9tUG9zOyB9XG4gICAgICBpZiAoY21wQ29vcmRzKHRvUG9zLCBzdGFydCkgPCAwKSB7IHN0YXJ0ID0gdG9Qb3M7IH1cbiAgICAgIGlmICghZW5kIHx8IGNtcENvb3Jkcyhmcm9tUG9zLCBlbmQpIDwgMCkgeyBlbmQgPSBmcm9tUG9zOyB9XG4gICAgICBpZiAoY21wQ29vcmRzKHRvUG9zLCBlbmQpIDwgMCkgeyBlbmQgPSB0b1BvczsgfVxuICAgIH0pO1xuICAgIHJldHVybiB7c3RhcnQ6IHN0YXJ0LCBlbmQ6IGVuZH1cbiAgfVxuXG4gIHZhciBzRnJvbSA9IHJhbmdlJCQxLmZyb20oKSwgc1RvID0gcmFuZ2UkJDEudG8oKTtcbiAgaWYgKHNGcm9tLmxpbmUgPT0gc1RvLmxpbmUpIHtcbiAgICBkcmF3Rm9yTGluZShzRnJvbS5saW5lLCBzRnJvbS5jaCwgc1RvLmNoKTtcbiAgfSBlbHNlIHtcbiAgICB2YXIgZnJvbUxpbmUgPSBnZXRMaW5lKGRvYywgc0Zyb20ubGluZSksIHRvTGluZSA9IGdldExpbmUoZG9jLCBzVG8ubGluZSk7XG4gICAgdmFyIHNpbmdsZVZMaW5lID0gdmlzdWFsTGluZShmcm9tTGluZSkgPT0gdmlzdWFsTGluZSh0b0xpbmUpO1xuICAgIHZhciBsZWZ0RW5kID0gZHJhd0ZvckxpbmUoc0Zyb20ubGluZSwgc0Zyb20uY2gsIHNpbmdsZVZMaW5lID8gZnJvbUxpbmUudGV4dC5sZW5ndGggKyAxIDogbnVsbCkuZW5kO1xuICAgIHZhciByaWdodFN0YXJ0ID0gZHJhd0ZvckxpbmUoc1RvLmxpbmUsIHNpbmdsZVZMaW5lID8gMCA6IG51bGwsIHNUby5jaCkuc3RhcnQ7XG4gICAgaWYgKHNpbmdsZVZMaW5lKSB7XG4gICAgICBpZiAobGVmdEVuZC50b3AgPCByaWdodFN0YXJ0LnRvcCAtIDIpIHtcbiAgICAgICAgYWRkKGxlZnRFbmQucmlnaHQsIGxlZnRFbmQudG9wLCBudWxsLCBsZWZ0RW5kLmJvdHRvbSk7XG4gICAgICAgIGFkZChsZWZ0U2lkZSwgcmlnaHRTdGFydC50b3AsIHJpZ2h0U3RhcnQubGVmdCwgcmlnaHRTdGFydC5ib3R0b20pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYWRkKGxlZnRFbmQucmlnaHQsIGxlZnRFbmQudG9wLCByaWdodFN0YXJ0LmxlZnQgLSBsZWZ0RW5kLnJpZ2h0LCBsZWZ0RW5kLmJvdHRvbSk7XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChsZWZ0RW5kLmJvdHRvbSA8IHJpZ2h0U3RhcnQudG9wKVxuICAgICAgeyBhZGQobGVmdFNpZGUsIGxlZnRFbmQuYm90dG9tLCBudWxsLCByaWdodFN0YXJ0LnRvcCk7IH1cbiAgfVxuXG4gIG91dHB1dC5hcHBlbmRDaGlsZChmcmFnbWVudCk7XG59XG5cbi8vIEN1cnNvci1ibGlua2luZ1xuZnVuY3Rpb24gcmVzdGFydEJsaW5rKGNtKSB7XG4gIGlmICghY20uc3RhdGUuZm9jdXNlZCkgeyByZXR1cm4gfVxuICB2YXIgZGlzcGxheSA9IGNtLmRpc3BsYXk7XG4gIGNsZWFySW50ZXJ2YWwoZGlzcGxheS5ibGlua2VyKTtcbiAgdmFyIG9uID0gdHJ1ZTtcbiAgZGlzcGxheS5jdXJzb3JEaXYuc3R5bGUudmlzaWJpbGl0eSA9IFwiXCI7XG4gIGlmIChjbS5vcHRpb25zLmN1cnNvckJsaW5rUmF0ZSA+IDApXG4gICAgeyBkaXNwbGF5LmJsaW5rZXIgPSBzZXRJbnRlcnZhbChmdW5jdGlvbiAoKSB7IHJldHVybiBkaXNwbGF5LmN1cnNvckRpdi5zdHlsZS52aXNpYmlsaXR5ID0gKG9uID0gIW9uKSA/IFwiXCIgOiBcImhpZGRlblwiOyB9LFxuICAgICAgY20ub3B0aW9ucy5jdXJzb3JCbGlua1JhdGUpOyB9XG4gIGVsc2UgaWYgKGNtLm9wdGlvbnMuY3Vyc29yQmxpbmtSYXRlIDwgMClcbiAgICB7IGRpc3BsYXkuY3Vyc29yRGl2LnN0eWxlLnZpc2liaWxpdHkgPSBcImhpZGRlblwiOyB9XG59XG5cbmZ1bmN0aW9uIGVuc3VyZUZvY3VzKGNtKSB7XG4gIGlmICghY20uc3RhdGUuZm9jdXNlZCkgeyBjbS5kaXNwbGF5LmlucHV0LmZvY3VzKCk7IG9uRm9jdXMoY20pOyB9XG59XG5cbmZ1bmN0aW9uIGRlbGF5Qmx1ckV2ZW50KGNtKSB7XG4gIGNtLnN0YXRlLmRlbGF5aW5nQmx1ckV2ZW50ID0gdHJ1ZTtcbiAgc2V0VGltZW91dChmdW5jdGlvbiAoKSB7IGlmIChjbS5zdGF0ZS5kZWxheWluZ0JsdXJFdmVudCkge1xuICAgIGNtLnN0YXRlLmRlbGF5aW5nQmx1ckV2ZW50ID0gZmFsc2U7XG4gICAgb25CbHVyKGNtKTtcbiAgfSB9LCAxMDApO1xufVxuXG5mdW5jdGlvbiBvbkZvY3VzKGNtLCBlKSB7XG4gIGlmIChjbS5zdGF0ZS5kZWxheWluZ0JsdXJFdmVudCkgeyBjbS5zdGF0ZS5kZWxheWluZ0JsdXJFdmVudCA9IGZhbHNlOyB9XG5cbiAgaWYgKGNtLm9wdGlvbnMucmVhZE9ubHkgPT0gXCJub2N1cnNvclwiKSB7IHJldHVybiB9XG4gIGlmICghY20uc3RhdGUuZm9jdXNlZCkge1xuICAgIHNpZ25hbChjbSwgXCJmb2N1c1wiLCBjbSwgZSk7XG4gICAgY20uc3RhdGUuZm9jdXNlZCA9IHRydWU7XG4gICAgYWRkQ2xhc3MoY20uZGlzcGxheS53cmFwcGVyLCBcIkNvZGVNaXJyb3ItZm9jdXNlZFwiKTtcbiAgICAvLyBUaGlzIHRlc3QgcHJldmVudHMgdGhpcyBmcm9tIGZpcmluZyB3aGVuIGEgY29udGV4dFxuICAgIC8vIG1lbnUgaXMgY2xvc2VkIChzaW5jZSB0aGUgaW5wdXQgcmVzZXQgd291bGQga2lsbCB0aGVcbiAgICAvLyBzZWxlY3QtYWxsIGRldGVjdGlvbiBoYWNrKVxuICAgIGlmICghY20uY3VyT3AgJiYgY20uZGlzcGxheS5zZWxGb3JDb250ZXh0TWVudSAhPSBjbS5kb2Muc2VsKSB7XG4gICAgICBjbS5kaXNwbGF5LmlucHV0LnJlc2V0KCk7XG4gICAgICBpZiAod2Via2l0KSB7IHNldFRpbWVvdXQoZnVuY3Rpb24gKCkgeyByZXR1cm4gY20uZGlzcGxheS5pbnB1dC5yZXNldCh0cnVlKTsgfSwgMjApOyB9IC8vIElzc3VlICMxNzMwXG4gICAgfVxuICAgIGNtLmRpc3BsYXkuaW5wdXQucmVjZWl2ZWRGb2N1cygpO1xuICB9XG4gIHJlc3RhcnRCbGluayhjbSk7XG59XG5mdW5jdGlvbiBvbkJsdXIoY20sIGUpIHtcbiAgaWYgKGNtLnN0YXRlLmRlbGF5aW5nQmx1ckV2ZW50KSB7IHJldHVybiB9XG5cbiAgaWYgKGNtLnN0YXRlLmZvY3VzZWQpIHtcbiAgICBzaWduYWwoY20sIFwiYmx1clwiLCBjbSwgZSk7XG4gICAgY20uc3RhdGUuZm9jdXNlZCA9IGZhbHNlO1xuICAgIHJtQ2xhc3MoY20uZGlzcGxheS53cmFwcGVyLCBcIkNvZGVNaXJyb3ItZm9jdXNlZFwiKTtcbiAgfVxuICBjbGVhckludGVydmFsKGNtLmRpc3BsYXkuYmxpbmtlcik7XG4gIHNldFRpbWVvdXQoZnVuY3Rpb24gKCkgeyBpZiAoIWNtLnN0YXRlLmZvY3VzZWQpIHsgY20uZGlzcGxheS5zaGlmdCA9IGZhbHNlOyB9IH0sIDE1MCk7XG59XG5cbi8vIFJlYWQgdGhlIGFjdHVhbCBoZWlnaHRzIG9mIHRoZSByZW5kZXJlZCBsaW5lcywgYW5kIHVwZGF0ZSB0aGVpclxuLy8gc3RvcmVkIGhlaWdodHMgdG8gbWF0Y2guXG5mdW5jdGlvbiB1cGRhdGVIZWlnaHRzSW5WaWV3cG9ydChjbSkge1xuICB2YXIgZGlzcGxheSA9IGNtLmRpc3BsYXk7XG4gIHZhciBwcmV2Qm90dG9tID0gZGlzcGxheS5saW5lRGl2Lm9mZnNldFRvcDtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBkaXNwbGF5LnZpZXcubGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgY3VyID0gZGlzcGxheS52aWV3W2ldLCBoZWlnaHQgPSAodm9pZCAwKTtcbiAgICBpZiAoY3VyLmhpZGRlbikgeyBjb250aW51ZSB9XG4gICAgaWYgKGllICYmIGllX3ZlcnNpb24gPCA4KSB7XG4gICAgICB2YXIgYm90ID0gY3VyLm5vZGUub2Zmc2V0VG9wICsgY3VyLm5vZGUub2Zmc2V0SGVpZ2h0O1xuICAgICAgaGVpZ2h0ID0gYm90IC0gcHJldkJvdHRvbTtcbiAgICAgIHByZXZCb3R0b20gPSBib3Q7XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciBib3ggPSBjdXIubm9kZS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICAgIGhlaWdodCA9IGJveC5ib3R0b20gLSBib3gudG9wO1xuICAgIH1cbiAgICB2YXIgZGlmZiA9IGN1ci5saW5lLmhlaWdodCAtIGhlaWdodDtcbiAgICBpZiAoaGVpZ2h0IDwgMikgeyBoZWlnaHQgPSB0ZXh0SGVpZ2h0KGRpc3BsYXkpOyB9XG4gICAgaWYgKGRpZmYgPiAuMDA1IHx8IGRpZmYgPCAtLjAwNSkge1xuICAgICAgdXBkYXRlTGluZUhlaWdodChjdXIubGluZSwgaGVpZ2h0KTtcbiAgICAgIHVwZGF0ZVdpZGdldEhlaWdodChjdXIubGluZSk7XG4gICAgICBpZiAoY3VyLnJlc3QpIHsgZm9yICh2YXIgaiA9IDA7IGogPCBjdXIucmVzdC5sZW5ndGg7IGorKylcbiAgICAgICAgeyB1cGRhdGVXaWRnZXRIZWlnaHQoY3VyLnJlc3Rbal0pOyB9IH1cbiAgICB9XG4gIH1cbn1cblxuLy8gUmVhZCBhbmQgc3RvcmUgdGhlIGhlaWdodCBvZiBsaW5lIHdpZGdldHMgYXNzb2NpYXRlZCB3aXRoIHRoZVxuLy8gZ2l2ZW4gbGluZS5cbmZ1bmN0aW9uIHVwZGF0ZVdpZGdldEhlaWdodChsaW5lKSB7XG4gIGlmIChsaW5lLndpZGdldHMpIHsgZm9yICh2YXIgaSA9IDA7IGkgPCBsaW5lLndpZGdldHMubGVuZ3RoOyArK2kpIHtcbiAgICB2YXIgdyA9IGxpbmUud2lkZ2V0c1tpXSwgcGFyZW50ID0gdy5ub2RlLnBhcmVudE5vZGU7XG4gICAgaWYgKHBhcmVudCkgeyB3LmhlaWdodCA9IHBhcmVudC5vZmZzZXRIZWlnaHQ7IH1cbiAgfSB9XG59XG5cbi8vIENvbXB1dGUgdGhlIGxpbmVzIHRoYXQgYXJlIHZpc2libGUgaW4gYSBnaXZlbiB2aWV3cG9ydCAoZGVmYXVsdHNcbi8vIHRoZSB0aGUgY3VycmVudCBzY3JvbGwgcG9zaXRpb24pLiB2aWV3cG9ydCBtYXkgY29udGFpbiB0b3AsXG4vLyBoZWlnaHQsIGFuZCBlbnN1cmUgKHNlZSBvcC5zY3JvbGxUb1BvcykgcHJvcGVydGllcy5cbmZ1bmN0aW9uIHZpc2libGVMaW5lcyhkaXNwbGF5LCBkb2MsIHZpZXdwb3J0KSB7XG4gIHZhciB0b3AgPSB2aWV3cG9ydCAmJiB2aWV3cG9ydC50b3AgIT0gbnVsbCA/IE1hdGgubWF4KDAsIHZpZXdwb3J0LnRvcCkgOiBkaXNwbGF5LnNjcm9sbGVyLnNjcm9sbFRvcDtcbiAgdG9wID0gTWF0aC5mbG9vcih0b3AgLSBwYWRkaW5nVG9wKGRpc3BsYXkpKTtcbiAgdmFyIGJvdHRvbSA9IHZpZXdwb3J0ICYmIHZpZXdwb3J0LmJvdHRvbSAhPSBudWxsID8gdmlld3BvcnQuYm90dG9tIDogdG9wICsgZGlzcGxheS53cmFwcGVyLmNsaWVudEhlaWdodDtcblxuICB2YXIgZnJvbSA9IGxpbmVBdEhlaWdodChkb2MsIHRvcCksIHRvID0gbGluZUF0SGVpZ2h0KGRvYywgYm90dG9tKTtcbiAgLy8gRW5zdXJlIGlzIGEge2Zyb206IHtsaW5lLCBjaH0sIHRvOiB7bGluZSwgY2h9fSBvYmplY3QsIGFuZFxuICAvLyBmb3JjZXMgdGhvc2UgbGluZXMgaW50byB0aGUgdmlld3BvcnQgKGlmIHBvc3NpYmxlKS5cbiAgaWYgKHZpZXdwb3J0ICYmIHZpZXdwb3J0LmVuc3VyZSkge1xuICAgIHZhciBlbnN1cmVGcm9tID0gdmlld3BvcnQuZW5zdXJlLmZyb20ubGluZSwgZW5zdXJlVG8gPSB2aWV3cG9ydC5lbnN1cmUudG8ubGluZTtcbiAgICBpZiAoZW5zdXJlRnJvbSA8IGZyb20pIHtcbiAgICAgIGZyb20gPSBlbnN1cmVGcm9tO1xuICAgICAgdG8gPSBsaW5lQXRIZWlnaHQoZG9jLCBoZWlnaHRBdExpbmUoZ2V0TGluZShkb2MsIGVuc3VyZUZyb20pKSArIGRpc3BsYXkud3JhcHBlci5jbGllbnRIZWlnaHQpO1xuICAgIH0gZWxzZSBpZiAoTWF0aC5taW4oZW5zdXJlVG8sIGRvYy5sYXN0TGluZSgpKSA+PSB0bykge1xuICAgICAgZnJvbSA9IGxpbmVBdEhlaWdodChkb2MsIGhlaWdodEF0TGluZShnZXRMaW5lKGRvYywgZW5zdXJlVG8pKSAtIGRpc3BsYXkud3JhcHBlci5jbGllbnRIZWlnaHQpO1xuICAgICAgdG8gPSBlbnN1cmVUbztcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHtmcm9tOiBmcm9tLCB0bzogTWF0aC5tYXgodG8sIGZyb20gKyAxKX1cbn1cblxuLy8gUmUtYWxpZ24gbGluZSBudW1iZXJzIGFuZCBndXR0ZXIgbWFya3MgdG8gY29tcGVuc2F0ZSBmb3Jcbi8vIGhvcml6b250YWwgc2Nyb2xsaW5nLlxuZnVuY3Rpb24gYWxpZ25Ib3Jpem9udGFsbHkoY20pIHtcbiAgdmFyIGRpc3BsYXkgPSBjbS5kaXNwbGF5LCB2aWV3ID0gZGlzcGxheS52aWV3O1xuICBpZiAoIWRpc3BsYXkuYWxpZ25XaWRnZXRzICYmICghZGlzcGxheS5ndXR0ZXJzLmZpcnN0Q2hpbGQgfHwgIWNtLm9wdGlvbnMuZml4ZWRHdXR0ZXIpKSB7IHJldHVybiB9XG4gIHZhciBjb21wID0gY29tcGVuc2F0ZUZvckhTY3JvbGwoZGlzcGxheSkgLSBkaXNwbGF5LnNjcm9sbGVyLnNjcm9sbExlZnQgKyBjbS5kb2Muc2Nyb2xsTGVmdDtcbiAgdmFyIGd1dHRlclcgPSBkaXNwbGF5Lmd1dHRlcnMub2Zmc2V0V2lkdGgsIGxlZnQgPSBjb21wICsgXCJweFwiO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IHZpZXcubGVuZ3RoOyBpKyspIHsgaWYgKCF2aWV3W2ldLmhpZGRlbikge1xuICAgIGlmIChjbS5vcHRpb25zLmZpeGVkR3V0dGVyKSB7XG4gICAgICBpZiAodmlld1tpXS5ndXR0ZXIpXG4gICAgICAgIHsgdmlld1tpXS5ndXR0ZXIuc3R5bGUubGVmdCA9IGxlZnQ7IH1cbiAgICAgIGlmICh2aWV3W2ldLmd1dHRlckJhY2tncm91bmQpXG4gICAgICAgIHsgdmlld1tpXS5ndXR0ZXJCYWNrZ3JvdW5kLnN0eWxlLmxlZnQgPSBsZWZ0OyB9XG4gICAgfVxuICAgIHZhciBhbGlnbiA9IHZpZXdbaV0uYWxpZ25hYmxlO1xuICAgIGlmIChhbGlnbikgeyBmb3IgKHZhciBqID0gMDsgaiA8IGFsaWduLmxlbmd0aDsgaisrKVxuICAgICAgeyBhbGlnbltqXS5zdHlsZS5sZWZ0ID0gbGVmdDsgfSB9XG4gIH0gfVxuICBpZiAoY20ub3B0aW9ucy5maXhlZEd1dHRlcilcbiAgICB7IGRpc3BsYXkuZ3V0dGVycy5zdHlsZS5sZWZ0ID0gKGNvbXAgKyBndXR0ZXJXKSArIFwicHhcIjsgfVxufVxuXG4vLyBVc2VkIHRvIGVuc3VyZSB0aGF0IHRoZSBsaW5lIG51bWJlciBndXR0ZXIgaXMgc3RpbGwgdGhlIHJpZ2h0XG4vLyBzaXplIGZvciB0aGUgY3VycmVudCBkb2N1bWVudCBzaXplLiBSZXR1cm5zIHRydWUgd2hlbiBhbiB1cGRhdGVcbi8vIGlzIG5lZWRlZC5cbmZ1bmN0aW9uIG1heWJlVXBkYXRlTGluZU51bWJlcldpZHRoKGNtKSB7XG4gIGlmICghY20ub3B0aW9ucy5saW5lTnVtYmVycykgeyByZXR1cm4gZmFsc2UgfVxuICB2YXIgZG9jID0gY20uZG9jLCBsYXN0ID0gbGluZU51bWJlckZvcihjbS5vcHRpb25zLCBkb2MuZmlyc3QgKyBkb2Muc2l6ZSAtIDEpLCBkaXNwbGF5ID0gY20uZGlzcGxheTtcbiAgaWYgKGxhc3QubGVuZ3RoICE9IGRpc3BsYXkubGluZU51bUNoYXJzKSB7XG4gICAgdmFyIHRlc3QgPSBkaXNwbGF5Lm1lYXN1cmUuYXBwZW5kQ2hpbGQoZWx0KFwiZGl2XCIsIFtlbHQoXCJkaXZcIiwgbGFzdCldLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIkNvZGVNaXJyb3ItbGluZW51bWJlciBDb2RlTWlycm9yLWd1dHRlci1lbHRcIikpO1xuICAgIHZhciBpbm5lclcgPSB0ZXN0LmZpcnN0Q2hpbGQub2Zmc2V0V2lkdGgsIHBhZGRpbmcgPSB0ZXN0Lm9mZnNldFdpZHRoIC0gaW5uZXJXO1xuICAgIGRpc3BsYXkubGluZUd1dHRlci5zdHlsZS53aWR0aCA9IFwiXCI7XG4gICAgZGlzcGxheS5saW5lTnVtSW5uZXJXaWR0aCA9IE1hdGgubWF4KGlubmVyVywgZGlzcGxheS5saW5lR3V0dGVyLm9mZnNldFdpZHRoIC0gcGFkZGluZykgKyAxO1xuICAgIGRpc3BsYXkubGluZU51bVdpZHRoID0gZGlzcGxheS5saW5lTnVtSW5uZXJXaWR0aCArIHBhZGRpbmc7XG4gICAgZGlzcGxheS5saW5lTnVtQ2hhcnMgPSBkaXNwbGF5LmxpbmVOdW1Jbm5lcldpZHRoID8gbGFzdC5sZW5ndGggOiAtMTtcbiAgICBkaXNwbGF5LmxpbmVHdXR0ZXIuc3R5bGUud2lkdGggPSBkaXNwbGF5LmxpbmVOdW1XaWR0aCArIFwicHhcIjtcbiAgICB1cGRhdGVHdXR0ZXJTcGFjZShjbSk7XG4gICAgcmV0dXJuIHRydWVcbiAgfVxuICByZXR1cm4gZmFsc2Vcbn1cblxuLy8gU0NST0xMSU5HIFRISU5HUyBJTlRPIFZJRVdcblxuLy8gSWYgYW4gZWRpdG9yIHNpdHMgb24gdGhlIHRvcCBvciBib3R0b20gb2YgdGhlIHdpbmRvdywgcGFydGlhbGx5XG4vLyBzY3JvbGxlZCBvdXQgb2YgdmlldywgdGhpcyBlbnN1cmVzIHRoYXQgdGhlIGN1cnNvciBpcyB2aXNpYmxlLlxuZnVuY3Rpb24gbWF5YmVTY3JvbGxXaW5kb3coY20sIHJlY3QpIHtcbiAgaWYgKHNpZ25hbERPTUV2ZW50KGNtLCBcInNjcm9sbEN1cnNvckludG9WaWV3XCIpKSB7IHJldHVybiB9XG5cbiAgdmFyIGRpc3BsYXkgPSBjbS5kaXNwbGF5LCBib3ggPSBkaXNwbGF5LnNpemVyLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpLCBkb1Njcm9sbCA9IG51bGw7XG4gIGlmIChyZWN0LnRvcCArIGJveC50b3AgPCAwKSB7IGRvU2Nyb2xsID0gdHJ1ZTsgfVxuICBlbHNlIGlmIChyZWN0LmJvdHRvbSArIGJveC50b3AgPiAod2luZG93LmlubmVySGVpZ2h0IHx8IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5jbGllbnRIZWlnaHQpKSB7IGRvU2Nyb2xsID0gZmFsc2U7IH1cbiAgaWYgKGRvU2Nyb2xsICE9IG51bGwgJiYgIXBoYW50b20pIHtcbiAgICB2YXIgc2Nyb2xsTm9kZSA9IGVsdChcImRpdlwiLCBcIlxcdTIwMGJcIiwgbnVsbCwgKFwicG9zaXRpb246IGFic29sdXRlO1xcbiAgICAgICAgICAgICAgICAgICAgICAgICB0b3A6IFwiICsgKHJlY3QudG9wIC0gZGlzcGxheS52aWV3T2Zmc2V0IC0gcGFkZGluZ1RvcChjbS5kaXNwbGF5KSkgKyBcInB4O1xcbiAgICAgICAgICAgICAgICAgICAgICAgICBoZWlnaHQ6IFwiICsgKHJlY3QuYm90dG9tIC0gcmVjdC50b3AgKyBzY3JvbGxHYXAoY20pICsgZGlzcGxheS5iYXJIZWlnaHQpICsgXCJweDtcXG4gICAgICAgICAgICAgICAgICAgICAgICAgbGVmdDogXCIgKyAocmVjdC5sZWZ0KSArIFwicHg7IHdpZHRoOiBcIiArIChNYXRoLm1heCgyLCByZWN0LnJpZ2h0IC0gcmVjdC5sZWZ0KSkgKyBcInB4O1wiKSk7XG4gICAgY20uZGlzcGxheS5saW5lU3BhY2UuYXBwZW5kQ2hpbGQoc2Nyb2xsTm9kZSk7XG4gICAgc2Nyb2xsTm9kZS5zY3JvbGxJbnRvVmlldyhkb1Njcm9sbCk7XG4gICAgY20uZGlzcGxheS5saW5lU3BhY2UucmVtb3ZlQ2hpbGQoc2Nyb2xsTm9kZSk7XG4gIH1cbn1cblxuLy8gU2Nyb2xsIGEgZ2l2ZW4gcG9zaXRpb24gaW50byB2aWV3IChpbW1lZGlhdGVseSksIHZlcmlmeWluZyB0aGF0XG4vLyBpdCBhY3R1YWxseSBiZWNhbWUgdmlzaWJsZSAoYXMgbGluZSBoZWlnaHRzIGFyZSBhY2N1cmF0ZWx5XG4vLyBtZWFzdXJlZCwgdGhlIHBvc2l0aW9uIG9mIHNvbWV0aGluZyBtYXkgJ2RyaWZ0JyBkdXJpbmcgZHJhd2luZykuXG5mdW5jdGlvbiBzY3JvbGxQb3NJbnRvVmlldyhjbSwgcG9zLCBlbmQsIG1hcmdpbikge1xuICBpZiAobWFyZ2luID09IG51bGwpIHsgbWFyZ2luID0gMDsgfVxuICB2YXIgcmVjdDtcbiAgaWYgKCFjbS5vcHRpb25zLmxpbmVXcmFwcGluZyAmJiBwb3MgPT0gZW5kKSB7XG4gICAgLy8gU2V0IHBvcyBhbmQgZW5kIHRvIHRoZSBjdXJzb3IgcG9zaXRpb25zIGFyb3VuZCB0aGUgY2hhcmFjdGVyIHBvcyBzdGlja3MgdG9cbiAgICAvLyBJZiBwb3Muc3RpY2t5ID09IFwiYmVmb3JlXCIsIHRoYXQgaXMgYXJvdW5kIHBvcy5jaCAtIDEsIG90aGVyd2lzZSBhcm91bmQgcG9zLmNoXG4gICAgLy8gSWYgcG9zID09IFBvcyhfLCAwLCBcImJlZm9yZVwiKSwgcG9zIGFuZCBlbmQgYXJlIHVuY2hhbmdlZFxuICAgIHBvcyA9IHBvcy5jaCA/IFBvcyhwb3MubGluZSwgcG9zLnN0aWNreSA9PSBcImJlZm9yZVwiID8gcG9zLmNoIC0gMSA6IHBvcy5jaCwgXCJhZnRlclwiKSA6IHBvcztcbiAgICBlbmQgPSBwb3Muc3RpY2t5ID09IFwiYmVmb3JlXCIgPyBQb3MocG9zLmxpbmUsIHBvcy5jaCArIDEsIFwiYmVmb3JlXCIpIDogcG9zO1xuICB9XG4gIGZvciAodmFyIGxpbWl0ID0gMDsgbGltaXQgPCA1OyBsaW1pdCsrKSB7XG4gICAgdmFyIGNoYW5nZWQgPSBmYWxzZTtcbiAgICB2YXIgY29vcmRzID0gY3Vyc29yQ29vcmRzKGNtLCBwb3MpO1xuICAgIHZhciBlbmRDb29yZHMgPSAhZW5kIHx8IGVuZCA9PSBwb3MgPyBjb29yZHMgOiBjdXJzb3JDb29yZHMoY20sIGVuZCk7XG4gICAgcmVjdCA9IHtsZWZ0OiBNYXRoLm1pbihjb29yZHMubGVmdCwgZW5kQ29vcmRzLmxlZnQpLFxuICAgICAgICAgICAgdG9wOiBNYXRoLm1pbihjb29yZHMudG9wLCBlbmRDb29yZHMudG9wKSAtIG1hcmdpbixcbiAgICAgICAgICAgIHJpZ2h0OiBNYXRoLm1heChjb29yZHMubGVmdCwgZW5kQ29vcmRzLmxlZnQpLFxuICAgICAgICAgICAgYm90dG9tOiBNYXRoLm1heChjb29yZHMuYm90dG9tLCBlbmRDb29yZHMuYm90dG9tKSArIG1hcmdpbn07XG4gICAgdmFyIHNjcm9sbFBvcyA9IGNhbGN1bGF0ZVNjcm9sbFBvcyhjbSwgcmVjdCk7XG4gICAgdmFyIHN0YXJ0VG9wID0gY20uZG9jLnNjcm9sbFRvcCwgc3RhcnRMZWZ0ID0gY20uZG9jLnNjcm9sbExlZnQ7XG4gICAgaWYgKHNjcm9sbFBvcy5zY3JvbGxUb3AgIT0gbnVsbCkge1xuICAgICAgdXBkYXRlU2Nyb2xsVG9wKGNtLCBzY3JvbGxQb3Muc2Nyb2xsVG9wKTtcbiAgICAgIGlmIChNYXRoLmFicyhjbS5kb2Muc2Nyb2xsVG9wIC0gc3RhcnRUb3ApID4gMSkgeyBjaGFuZ2VkID0gdHJ1ZTsgfVxuICAgIH1cbiAgICBpZiAoc2Nyb2xsUG9zLnNjcm9sbExlZnQgIT0gbnVsbCkge1xuICAgICAgc2V0U2Nyb2xsTGVmdChjbSwgc2Nyb2xsUG9zLnNjcm9sbExlZnQpO1xuICAgICAgaWYgKE1hdGguYWJzKGNtLmRvYy5zY3JvbGxMZWZ0IC0gc3RhcnRMZWZ0KSA+IDEpIHsgY2hhbmdlZCA9IHRydWU7IH1cbiAgICB9XG4gICAgaWYgKCFjaGFuZ2VkKSB7IGJyZWFrIH1cbiAgfVxuICByZXR1cm4gcmVjdFxufVxuXG4vLyBTY3JvbGwgYSBnaXZlbiBzZXQgb2YgY29vcmRpbmF0ZXMgaW50byB2aWV3IChpbW1lZGlhdGVseSkuXG5mdW5jdGlvbiBzY3JvbGxJbnRvVmlldyhjbSwgcmVjdCkge1xuICB2YXIgc2Nyb2xsUG9zID0gY2FsY3VsYXRlU2Nyb2xsUG9zKGNtLCByZWN0KTtcbiAgaWYgKHNjcm9sbFBvcy5zY3JvbGxUb3AgIT0gbnVsbCkgeyB1cGRhdGVTY3JvbGxUb3AoY20sIHNjcm9sbFBvcy5zY3JvbGxUb3ApOyB9XG4gIGlmIChzY3JvbGxQb3Muc2Nyb2xsTGVmdCAhPSBudWxsKSB7IHNldFNjcm9sbExlZnQoY20sIHNjcm9sbFBvcy5zY3JvbGxMZWZ0KTsgfVxufVxuXG4vLyBDYWxjdWxhdGUgYSBuZXcgc2Nyb2xsIHBvc2l0aW9uIG5lZWRlZCB0byBzY3JvbGwgdGhlIGdpdmVuXG4vLyByZWN0YW5nbGUgaW50byB2aWV3LiBSZXR1cm5zIGFuIG9iamVjdCB3aXRoIHNjcm9sbFRvcCBhbmRcbi8vIHNjcm9sbExlZnQgcHJvcGVydGllcy4gV2hlbiB0aGVzZSBhcmUgdW5kZWZpbmVkLCB0aGVcbi8vIHZlcnRpY2FsL2hvcml6b250YWwgcG9zaXRpb24gZG9lcyBub3QgbmVlZCB0byBiZSBhZGp1c3RlZC5cbmZ1bmN0aW9uIGNhbGN1bGF0ZVNjcm9sbFBvcyhjbSwgcmVjdCkge1xuICB2YXIgZGlzcGxheSA9IGNtLmRpc3BsYXksIHNuYXBNYXJnaW4gPSB0ZXh0SGVpZ2h0KGNtLmRpc3BsYXkpO1xuICBpZiAocmVjdC50b3AgPCAwKSB7IHJlY3QudG9wID0gMDsgfVxuICB2YXIgc2NyZWVudG9wID0gY20uY3VyT3AgJiYgY20uY3VyT3Auc2Nyb2xsVG9wICE9IG51bGwgPyBjbS5jdXJPcC5zY3JvbGxUb3AgOiBkaXNwbGF5LnNjcm9sbGVyLnNjcm9sbFRvcDtcbiAgdmFyIHNjcmVlbiA9IGRpc3BsYXlIZWlnaHQoY20pLCByZXN1bHQgPSB7fTtcbiAgaWYgKHJlY3QuYm90dG9tIC0gcmVjdC50b3AgPiBzY3JlZW4pIHsgcmVjdC5ib3R0b20gPSByZWN0LnRvcCArIHNjcmVlbjsgfVxuICB2YXIgZG9jQm90dG9tID0gY20uZG9jLmhlaWdodCArIHBhZGRpbmdWZXJ0KGRpc3BsYXkpO1xuICB2YXIgYXRUb3AgPSByZWN0LnRvcCA8IHNuYXBNYXJnaW4sIGF0Qm90dG9tID0gcmVjdC5ib3R0b20gPiBkb2NCb3R0b20gLSBzbmFwTWFyZ2luO1xuICBpZiAocmVjdC50b3AgPCBzY3JlZW50b3ApIHtcbiAgICByZXN1bHQuc2Nyb2xsVG9wID0gYXRUb3AgPyAwIDogcmVjdC50b3A7XG4gIH0gZWxzZSBpZiAocmVjdC5ib3R0b20gPiBzY3JlZW50b3AgKyBzY3JlZW4pIHtcbiAgICB2YXIgbmV3VG9wID0gTWF0aC5taW4ocmVjdC50b3AsIChhdEJvdHRvbSA/IGRvY0JvdHRvbSA6IHJlY3QuYm90dG9tKSAtIHNjcmVlbik7XG4gICAgaWYgKG5ld1RvcCAhPSBzY3JlZW50b3ApIHsgcmVzdWx0LnNjcm9sbFRvcCA9IG5ld1RvcDsgfVxuICB9XG5cbiAgdmFyIHNjcmVlbmxlZnQgPSBjbS5jdXJPcCAmJiBjbS5jdXJPcC5zY3JvbGxMZWZ0ICE9IG51bGwgPyBjbS5jdXJPcC5zY3JvbGxMZWZ0IDogZGlzcGxheS5zY3JvbGxlci5zY3JvbGxMZWZ0O1xuICB2YXIgc2NyZWVudyA9IGRpc3BsYXlXaWR0aChjbSkgLSAoY20ub3B0aW9ucy5maXhlZEd1dHRlciA/IGRpc3BsYXkuZ3V0dGVycy5vZmZzZXRXaWR0aCA6IDApO1xuICB2YXIgdG9vV2lkZSA9IHJlY3QucmlnaHQgLSByZWN0LmxlZnQgPiBzY3JlZW53O1xuICBpZiAodG9vV2lkZSkgeyByZWN0LnJpZ2h0ID0gcmVjdC5sZWZ0ICsgc2NyZWVudzsgfVxuICBpZiAocmVjdC5sZWZ0IDwgMTApXG4gICAgeyByZXN1bHQuc2Nyb2xsTGVmdCA9IDA7IH1cbiAgZWxzZSBpZiAocmVjdC5sZWZ0IDwgc2NyZWVubGVmdClcbiAgICB7IHJlc3VsdC5zY3JvbGxMZWZ0ID0gTWF0aC5tYXgoMCwgcmVjdC5sZWZ0IC0gKHRvb1dpZGUgPyAwIDogMTApKTsgfVxuICBlbHNlIGlmIChyZWN0LnJpZ2h0ID4gc2NyZWVudyArIHNjcmVlbmxlZnQgLSAzKVxuICAgIHsgcmVzdWx0LnNjcm9sbExlZnQgPSByZWN0LnJpZ2h0ICsgKHRvb1dpZGUgPyAwIDogMTApIC0gc2NyZWVudzsgfVxuICByZXR1cm4gcmVzdWx0XG59XG5cbi8vIFN0b3JlIGEgcmVsYXRpdmUgYWRqdXN0bWVudCB0byB0aGUgc2Nyb2xsIHBvc2l0aW9uIGluIHRoZSBjdXJyZW50XG4vLyBvcGVyYXRpb24gKHRvIGJlIGFwcGxpZWQgd2hlbiB0aGUgb3BlcmF0aW9uIGZpbmlzaGVzKS5cbmZ1bmN0aW9uIGFkZFRvU2Nyb2xsVG9wKGNtLCB0b3ApIHtcbiAgaWYgKHRvcCA9PSBudWxsKSB7IHJldHVybiB9XG4gIHJlc29sdmVTY3JvbGxUb1BvcyhjbSk7XG4gIGNtLmN1ck9wLnNjcm9sbFRvcCA9IChjbS5jdXJPcC5zY3JvbGxUb3AgPT0gbnVsbCA/IGNtLmRvYy5zY3JvbGxUb3AgOiBjbS5jdXJPcC5zY3JvbGxUb3ApICsgdG9wO1xufVxuXG4vLyBNYWtlIHN1cmUgdGhhdCBhdCB0aGUgZW5kIG9mIHRoZSBvcGVyYXRpb24gdGhlIGN1cnJlbnQgY3Vyc29yIGlzXG4vLyBzaG93bi5cbmZ1bmN0aW9uIGVuc3VyZUN1cnNvclZpc2libGUoY20pIHtcbiAgcmVzb2x2ZVNjcm9sbFRvUG9zKGNtKTtcbiAgdmFyIGN1ciA9IGNtLmdldEN1cnNvcigpO1xuICBjbS5jdXJPcC5zY3JvbGxUb1BvcyA9IHtmcm9tOiBjdXIsIHRvOiBjdXIsIG1hcmdpbjogY20ub3B0aW9ucy5jdXJzb3JTY3JvbGxNYXJnaW59O1xufVxuXG5mdW5jdGlvbiBzY3JvbGxUb0Nvb3JkcyhjbSwgeCwgeSkge1xuICBpZiAoeCAhPSBudWxsIHx8IHkgIT0gbnVsbCkgeyByZXNvbHZlU2Nyb2xsVG9Qb3MoY20pOyB9XG4gIGlmICh4ICE9IG51bGwpIHsgY20uY3VyT3Auc2Nyb2xsTGVmdCA9IHg7IH1cbiAgaWYgKHkgIT0gbnVsbCkgeyBjbS5jdXJPcC5zY3JvbGxUb3AgPSB5OyB9XG59XG5cbmZ1bmN0aW9uIHNjcm9sbFRvUmFuZ2UoY20sIHJhbmdlJCQxKSB7XG4gIHJlc29sdmVTY3JvbGxUb1BvcyhjbSk7XG4gIGNtLmN1ck9wLnNjcm9sbFRvUG9zID0gcmFuZ2UkJDE7XG59XG5cbi8vIFdoZW4gYW4gb3BlcmF0aW9uIGhhcyBpdHMgc2Nyb2xsVG9Qb3MgcHJvcGVydHkgc2V0LCBhbmQgYW5vdGhlclxuLy8gc2Nyb2xsIGFjdGlvbiBpcyBhcHBsaWVkIGJlZm9yZSB0aGUgZW5kIG9mIHRoZSBvcGVyYXRpb24sIHRoaXNcbi8vICdzaW11bGF0ZXMnIHNjcm9sbGluZyB0aGF0IHBvc2l0aW9uIGludG8gdmlldyBpbiBhIGNoZWFwIHdheSwgc29cbi8vIHRoYXQgdGhlIGVmZmVjdCBvZiBpbnRlcm1lZGlhdGUgc2Nyb2xsIGNvbW1hbmRzIGlzIG5vdCBpZ25vcmVkLlxuZnVuY3Rpb24gcmVzb2x2ZVNjcm9sbFRvUG9zKGNtKSB7XG4gIHZhciByYW5nZSQkMSA9IGNtLmN1ck9wLnNjcm9sbFRvUG9zO1xuICBpZiAocmFuZ2UkJDEpIHtcbiAgICBjbS5jdXJPcC5zY3JvbGxUb1BvcyA9IG51bGw7XG4gICAgdmFyIGZyb20gPSBlc3RpbWF0ZUNvb3JkcyhjbSwgcmFuZ2UkJDEuZnJvbSksIHRvID0gZXN0aW1hdGVDb29yZHMoY20sIHJhbmdlJCQxLnRvKTtcbiAgICBzY3JvbGxUb0Nvb3Jkc1JhbmdlKGNtLCBmcm9tLCB0bywgcmFuZ2UkJDEubWFyZ2luKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBzY3JvbGxUb0Nvb3Jkc1JhbmdlKGNtLCBmcm9tLCB0bywgbWFyZ2luKSB7XG4gIHZhciBzUG9zID0gY2FsY3VsYXRlU2Nyb2xsUG9zKGNtLCB7XG4gICAgbGVmdDogTWF0aC5taW4oZnJvbS5sZWZ0LCB0by5sZWZ0KSxcbiAgICB0b3A6IE1hdGgubWluKGZyb20udG9wLCB0by50b3ApIC0gbWFyZ2luLFxuICAgIHJpZ2h0OiBNYXRoLm1heChmcm9tLnJpZ2h0LCB0by5yaWdodCksXG4gICAgYm90dG9tOiBNYXRoLm1heChmcm9tLmJvdHRvbSwgdG8uYm90dG9tKSArIG1hcmdpblxuICB9KTtcbiAgc2Nyb2xsVG9Db29yZHMoY20sIHNQb3Muc2Nyb2xsTGVmdCwgc1Bvcy5zY3JvbGxUb3ApO1xufVxuXG4vLyBTeW5jIHRoZSBzY3JvbGxhYmxlIGFyZWEgYW5kIHNjcm9sbGJhcnMsIGVuc3VyZSB0aGUgdmlld3BvcnRcbi8vIGNvdmVycyB0aGUgdmlzaWJsZSBhcmVhLlxuZnVuY3Rpb24gdXBkYXRlU2Nyb2xsVG9wKGNtLCB2YWwpIHtcbiAgaWYgKE1hdGguYWJzKGNtLmRvYy5zY3JvbGxUb3AgLSB2YWwpIDwgMikgeyByZXR1cm4gfVxuICBpZiAoIWdlY2tvKSB7IHVwZGF0ZURpc3BsYXlTaW1wbGUoY20sIHt0b3A6IHZhbH0pOyB9XG4gIHNldFNjcm9sbFRvcChjbSwgdmFsLCB0cnVlKTtcbiAgaWYgKGdlY2tvKSB7IHVwZGF0ZURpc3BsYXlTaW1wbGUoY20pOyB9XG4gIHN0YXJ0V29ya2VyKGNtLCAxMDApO1xufVxuXG5mdW5jdGlvbiBzZXRTY3JvbGxUb3AoY20sIHZhbCwgZm9yY2VTY3JvbGwpIHtcbiAgdmFsID0gTWF0aC5taW4oY20uZGlzcGxheS5zY3JvbGxlci5zY3JvbGxIZWlnaHQgLSBjbS5kaXNwbGF5LnNjcm9sbGVyLmNsaWVudEhlaWdodCwgdmFsKTtcbiAgaWYgKGNtLmRpc3BsYXkuc2Nyb2xsZXIuc2Nyb2xsVG9wID09IHZhbCAmJiAhZm9yY2VTY3JvbGwpIHsgcmV0dXJuIH1cbiAgY20uZG9jLnNjcm9sbFRvcCA9IHZhbDtcbiAgY20uZGlzcGxheS5zY3JvbGxiYXJzLnNldFNjcm9sbFRvcCh2YWwpO1xuICBpZiAoY20uZGlzcGxheS5zY3JvbGxlci5zY3JvbGxUb3AgIT0gdmFsKSB7IGNtLmRpc3BsYXkuc2Nyb2xsZXIuc2Nyb2xsVG9wID0gdmFsOyB9XG59XG5cbi8vIFN5bmMgc2Nyb2xsZXIgYW5kIHNjcm9sbGJhciwgZW5zdXJlIHRoZSBndXR0ZXIgZWxlbWVudHMgYXJlXG4vLyBhbGlnbmVkLlxuZnVuY3Rpb24gc2V0U2Nyb2xsTGVmdChjbSwgdmFsLCBpc1Njcm9sbGVyLCBmb3JjZVNjcm9sbCkge1xuICB2YWwgPSBNYXRoLm1pbih2YWwsIGNtLmRpc3BsYXkuc2Nyb2xsZXIuc2Nyb2xsV2lkdGggLSBjbS5kaXNwbGF5LnNjcm9sbGVyLmNsaWVudFdpZHRoKTtcbiAgaWYgKChpc1Njcm9sbGVyID8gdmFsID09IGNtLmRvYy5zY3JvbGxMZWZ0IDogTWF0aC5hYnMoY20uZG9jLnNjcm9sbExlZnQgLSB2YWwpIDwgMikgJiYgIWZvcmNlU2Nyb2xsKSB7IHJldHVybiB9XG4gIGNtLmRvYy5zY3JvbGxMZWZ0ID0gdmFsO1xuICBhbGlnbkhvcml6b250YWxseShjbSk7XG4gIGlmIChjbS5kaXNwbGF5LnNjcm9sbGVyLnNjcm9sbExlZnQgIT0gdmFsKSB7IGNtLmRpc3BsYXkuc2Nyb2xsZXIuc2Nyb2xsTGVmdCA9IHZhbDsgfVxuICBjbS5kaXNwbGF5LnNjcm9sbGJhcnMuc2V0U2Nyb2xsTGVmdCh2YWwpO1xufVxuXG4vLyBTQ1JPTExCQVJTXG5cbi8vIFByZXBhcmUgRE9NIHJlYWRzIG5lZWRlZCB0byB1cGRhdGUgdGhlIHNjcm9sbGJhcnMuIERvbmUgaW4gb25lXG4vLyBzaG90IHRvIG1pbmltaXplIHVwZGF0ZS9tZWFzdXJlIHJvdW5kdHJpcHMuXG5mdW5jdGlvbiBtZWFzdXJlRm9yU2Nyb2xsYmFycyhjbSkge1xuICB2YXIgZCA9IGNtLmRpc3BsYXksIGd1dHRlclcgPSBkLmd1dHRlcnMub2Zmc2V0V2lkdGg7XG4gIHZhciBkb2NIID0gTWF0aC5yb3VuZChjbS5kb2MuaGVpZ2h0ICsgcGFkZGluZ1ZlcnQoY20uZGlzcGxheSkpO1xuICByZXR1cm4ge1xuICAgIGNsaWVudEhlaWdodDogZC5zY3JvbGxlci5jbGllbnRIZWlnaHQsXG4gICAgdmlld0hlaWdodDogZC53cmFwcGVyLmNsaWVudEhlaWdodCxcbiAgICBzY3JvbGxXaWR0aDogZC5zY3JvbGxlci5zY3JvbGxXaWR0aCwgY2xpZW50V2lkdGg6IGQuc2Nyb2xsZXIuY2xpZW50V2lkdGgsXG4gICAgdmlld1dpZHRoOiBkLndyYXBwZXIuY2xpZW50V2lkdGgsXG4gICAgYmFyTGVmdDogY20ub3B0aW9ucy5maXhlZEd1dHRlciA/IGd1dHRlclcgOiAwLFxuICAgIGRvY0hlaWdodDogZG9jSCxcbiAgICBzY3JvbGxIZWlnaHQ6IGRvY0ggKyBzY3JvbGxHYXAoY20pICsgZC5iYXJIZWlnaHQsXG4gICAgbmF0aXZlQmFyV2lkdGg6IGQubmF0aXZlQmFyV2lkdGgsXG4gICAgZ3V0dGVyV2lkdGg6IGd1dHRlcldcbiAgfVxufVxuXG52YXIgTmF0aXZlU2Nyb2xsYmFycyA9IGZ1bmN0aW9uKHBsYWNlLCBzY3JvbGwsIGNtKSB7XG4gIHRoaXMuY20gPSBjbTtcbiAgdmFyIHZlcnQgPSB0aGlzLnZlcnQgPSBlbHQoXCJkaXZcIiwgW2VsdChcImRpdlwiLCBudWxsLCBudWxsLCBcIm1pbi13aWR0aDogMXB4XCIpXSwgXCJDb2RlTWlycm9yLXZzY3JvbGxiYXJcIik7XG4gIHZhciBob3JpeiA9IHRoaXMuaG9yaXogPSBlbHQoXCJkaXZcIiwgW2VsdChcImRpdlwiLCBudWxsLCBudWxsLCBcImhlaWdodDogMTAwJTsgbWluLWhlaWdodDogMXB4XCIpXSwgXCJDb2RlTWlycm9yLWhzY3JvbGxiYXJcIik7XG4gIHZlcnQudGFiSW5kZXggPSBob3Jpei50YWJJbmRleCA9IC0xO1xuICBwbGFjZSh2ZXJ0KTsgcGxhY2UoaG9yaXopO1xuXG4gIG9uKHZlcnQsIFwic2Nyb2xsXCIsIGZ1bmN0aW9uICgpIHtcbiAgICBpZiAodmVydC5jbGllbnRIZWlnaHQpIHsgc2Nyb2xsKHZlcnQuc2Nyb2xsVG9wLCBcInZlcnRpY2FsXCIpOyB9XG4gIH0pO1xuICBvbihob3JpeiwgXCJzY3JvbGxcIiwgZnVuY3Rpb24gKCkge1xuICAgIGlmIChob3Jpei5jbGllbnRXaWR0aCkgeyBzY3JvbGwoaG9yaXouc2Nyb2xsTGVmdCwgXCJob3Jpem9udGFsXCIpOyB9XG4gIH0pO1xuXG4gIHRoaXMuY2hlY2tlZFplcm9XaWR0aCA9IGZhbHNlO1xuICAvLyBOZWVkIHRvIHNldCBhIG1pbmltdW0gd2lkdGggdG8gc2VlIHRoZSBzY3JvbGxiYXIgb24gSUU3IChidXQgbXVzdCBub3Qgc2V0IGl0IG9uIElFOCkuXG4gIGlmIChpZSAmJiBpZV92ZXJzaW9uIDwgOCkgeyB0aGlzLmhvcml6LnN0eWxlLm1pbkhlaWdodCA9IHRoaXMudmVydC5zdHlsZS5taW5XaWR0aCA9IFwiMThweFwiOyB9XG59O1xuXG5OYXRpdmVTY3JvbGxiYXJzLnByb3RvdHlwZS51cGRhdGUgPSBmdW5jdGlvbiAobWVhc3VyZSkge1xuICB2YXIgbmVlZHNIID0gbWVhc3VyZS5zY3JvbGxXaWR0aCA+IG1lYXN1cmUuY2xpZW50V2lkdGggKyAxO1xuICB2YXIgbmVlZHNWID0gbWVhc3VyZS5zY3JvbGxIZWlnaHQgPiBtZWFzdXJlLmNsaWVudEhlaWdodCArIDE7XG4gIHZhciBzV2lkdGggPSBtZWFzdXJlLm5hdGl2ZUJhcldpZHRoO1xuXG4gIGlmIChuZWVkc1YpIHtcbiAgICB0aGlzLnZlcnQuc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcbiAgICB0aGlzLnZlcnQuc3R5bGUuYm90dG9tID0gbmVlZHNIID8gc1dpZHRoICsgXCJweFwiIDogXCIwXCI7XG4gICAgdmFyIHRvdGFsSGVpZ2h0ID0gbWVhc3VyZS52aWV3SGVpZ2h0IC0gKG5lZWRzSCA/IHNXaWR0aCA6IDApO1xuICAgIC8vIEEgYnVnIGluIElFOCBjYW4gY2F1c2UgdGhpcyB2YWx1ZSB0byBiZSBuZWdhdGl2ZSwgc28gZ3VhcmQgaXQuXG4gICAgdGhpcy52ZXJ0LmZpcnN0Q2hpbGQuc3R5bGUuaGVpZ2h0ID1cbiAgICAgIE1hdGgubWF4KDAsIG1lYXN1cmUuc2Nyb2xsSGVpZ2h0IC0gbWVhc3VyZS5jbGllbnRIZWlnaHQgKyB0b3RhbEhlaWdodCkgKyBcInB4XCI7XG4gIH0gZWxzZSB7XG4gICAgdGhpcy52ZXJ0LnN0eWxlLmRpc3BsYXkgPSBcIlwiO1xuICAgIHRoaXMudmVydC5maXJzdENoaWxkLnN0eWxlLmhlaWdodCA9IFwiMFwiO1xuICB9XG5cbiAgaWYgKG5lZWRzSCkge1xuICAgIHRoaXMuaG9yaXouc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcbiAgICB0aGlzLmhvcml6LnN0eWxlLnJpZ2h0ID0gbmVlZHNWID8gc1dpZHRoICsgXCJweFwiIDogXCIwXCI7XG4gICAgdGhpcy5ob3Jpei5zdHlsZS5sZWZ0ID0gbWVhc3VyZS5iYXJMZWZ0ICsgXCJweFwiO1xuICAgIHZhciB0b3RhbFdpZHRoID0gbWVhc3VyZS52aWV3V2lkdGggLSBtZWFzdXJlLmJhckxlZnQgLSAobmVlZHNWID8gc1dpZHRoIDogMCk7XG4gICAgdGhpcy5ob3Jpei5maXJzdENoaWxkLnN0eWxlLndpZHRoID1cbiAgICAgIE1hdGgubWF4KDAsIG1lYXN1cmUuc2Nyb2xsV2lkdGggLSBtZWFzdXJlLmNsaWVudFdpZHRoICsgdG90YWxXaWR0aCkgKyBcInB4XCI7XG4gIH0gZWxzZSB7XG4gICAgdGhpcy5ob3Jpei5zdHlsZS5kaXNwbGF5ID0gXCJcIjtcbiAgICB0aGlzLmhvcml6LmZpcnN0Q2hpbGQuc3R5bGUud2lkdGggPSBcIjBcIjtcbiAgfVxuXG4gIGlmICghdGhpcy5jaGVja2VkWmVyb1dpZHRoICYmIG1lYXN1cmUuY2xpZW50SGVpZ2h0ID4gMCkge1xuICAgIGlmIChzV2lkdGggPT0gMCkgeyB0aGlzLnplcm9XaWR0aEhhY2soKTsgfVxuICAgIHRoaXMuY2hlY2tlZFplcm9XaWR0aCA9IHRydWU7XG4gIH1cblxuICByZXR1cm4ge3JpZ2h0OiBuZWVkc1YgPyBzV2lkdGggOiAwLCBib3R0b206IG5lZWRzSCA/IHNXaWR0aCA6IDB9XG59O1xuXG5OYXRpdmVTY3JvbGxiYXJzLnByb3RvdHlwZS5zZXRTY3JvbGxMZWZ0ID0gZnVuY3Rpb24gKHBvcykge1xuICBpZiAodGhpcy5ob3Jpei5zY3JvbGxMZWZ0ICE9IHBvcykgeyB0aGlzLmhvcml6LnNjcm9sbExlZnQgPSBwb3M7IH1cbiAgaWYgKHRoaXMuZGlzYWJsZUhvcml6KSB7IHRoaXMuZW5hYmxlWmVyb1dpZHRoQmFyKHRoaXMuaG9yaXosIHRoaXMuZGlzYWJsZUhvcml6LCBcImhvcml6XCIpOyB9XG59O1xuXG5OYXRpdmVTY3JvbGxiYXJzLnByb3RvdHlwZS5zZXRTY3JvbGxUb3AgPSBmdW5jdGlvbiAocG9zKSB7XG4gIGlmICh0aGlzLnZlcnQuc2Nyb2xsVG9wICE9IHBvcykgeyB0aGlzLnZlcnQuc2Nyb2xsVG9wID0gcG9zOyB9XG4gIGlmICh0aGlzLmRpc2FibGVWZXJ0KSB7IHRoaXMuZW5hYmxlWmVyb1dpZHRoQmFyKHRoaXMudmVydCwgdGhpcy5kaXNhYmxlVmVydCwgXCJ2ZXJ0XCIpOyB9XG59O1xuXG5OYXRpdmVTY3JvbGxiYXJzLnByb3RvdHlwZS56ZXJvV2lkdGhIYWNrID0gZnVuY3Rpb24gKCkge1xuICB2YXIgdyA9IG1hYyAmJiAhbWFjX2dlTW91bnRhaW5MaW9uID8gXCIxMnB4XCIgOiBcIjE4cHhcIjtcbiAgdGhpcy5ob3Jpei5zdHlsZS5oZWlnaHQgPSB0aGlzLnZlcnQuc3R5bGUud2lkdGggPSB3O1xuICB0aGlzLmhvcml6LnN0eWxlLnBvaW50ZXJFdmVudHMgPSB0aGlzLnZlcnQuc3R5bGUucG9pbnRlckV2ZW50cyA9IFwibm9uZVwiO1xuICB0aGlzLmRpc2FibGVIb3JpeiA9IG5ldyBEZWxheWVkO1xuICB0aGlzLmRpc2FibGVWZXJ0ID0gbmV3IERlbGF5ZWQ7XG59O1xuXG5OYXRpdmVTY3JvbGxiYXJzLnByb3RvdHlwZS5lbmFibGVaZXJvV2lkdGhCYXIgPSBmdW5jdGlvbiAoYmFyLCBkZWxheSwgdHlwZSkge1xuICBiYXIuc3R5bGUucG9pbnRlckV2ZW50cyA9IFwiYXV0b1wiO1xuICBmdW5jdGlvbiBtYXliZURpc2FibGUoKSB7XG4gICAgLy8gVG8gZmluZCBvdXQgd2hldGhlciB0aGUgc2Nyb2xsYmFyIGlzIHN0aWxsIHZpc2libGUsIHdlXG4gICAgLy8gY2hlY2sgd2hldGhlciB0aGUgZWxlbWVudCB1bmRlciB0aGUgcGl4ZWwgaW4gdGhlIGJvdHRvbVxuICAgIC8vIHJpZ2h0IGNvcm5lciBvZiB0aGUgc2Nyb2xsYmFyIGJveCBpcyB0aGUgc2Nyb2xsYmFyIGJveFxuICAgIC8vIGl0c2VsZiAod2hlbiB0aGUgYmFyIGlzIHN0aWxsIHZpc2libGUpIG9yIGl0cyBmaWxsZXIgY2hpbGRcbiAgICAvLyAod2hlbiB0aGUgYmFyIGlzIGhpZGRlbikuIElmIGl0IGlzIHN0aWxsIHZpc2libGUsIHdlIGtlZXBcbiAgICAvLyBpdCBlbmFibGVkLCBpZiBpdCdzIGhpZGRlbiwgd2UgZGlzYWJsZSBwb2ludGVyIGV2ZW50cy5cbiAgICB2YXIgYm94ID0gYmFyLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgIHZhciBlbHQkJDEgPSB0eXBlID09IFwidmVydFwiID8gZG9jdW1lbnQuZWxlbWVudEZyb21Qb2ludChib3gucmlnaHQgLSAxLCAoYm94LnRvcCArIGJveC5ib3R0b20pIC8gMilcbiAgICAgICAgOiBkb2N1bWVudC5lbGVtZW50RnJvbVBvaW50KChib3gucmlnaHQgKyBib3gubGVmdCkgLyAyLCBib3guYm90dG9tIC0gMSk7XG4gICAgaWYgKGVsdCQkMSAhPSBiYXIpIHsgYmFyLnN0eWxlLnBvaW50ZXJFdmVudHMgPSBcIm5vbmVcIjsgfVxuICAgIGVsc2UgeyBkZWxheS5zZXQoMTAwMCwgbWF5YmVEaXNhYmxlKTsgfVxuICB9XG4gIGRlbGF5LnNldCgxMDAwLCBtYXliZURpc2FibGUpO1xufTtcblxuTmF0aXZlU2Nyb2xsYmFycy5wcm90b3R5cGUuY2xlYXIgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBwYXJlbnQgPSB0aGlzLmhvcml6LnBhcmVudE5vZGU7XG4gIHBhcmVudC5yZW1vdmVDaGlsZCh0aGlzLmhvcml6KTtcbiAgcGFyZW50LnJlbW92ZUNoaWxkKHRoaXMudmVydCk7XG59O1xuXG52YXIgTnVsbFNjcm9sbGJhcnMgPSBmdW5jdGlvbiAoKSB7fTtcblxuTnVsbFNjcm9sbGJhcnMucHJvdG90eXBlLnVwZGF0ZSA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuIHtib3R0b206IDAsIHJpZ2h0OiAwfSB9O1xuTnVsbFNjcm9sbGJhcnMucHJvdG90eXBlLnNldFNjcm9sbExlZnQgPSBmdW5jdGlvbiAoKSB7fTtcbk51bGxTY3JvbGxiYXJzLnByb3RvdHlwZS5zZXRTY3JvbGxUb3AgPSBmdW5jdGlvbiAoKSB7fTtcbk51bGxTY3JvbGxiYXJzLnByb3RvdHlwZS5jbGVhciA9IGZ1bmN0aW9uICgpIHt9O1xuXG5mdW5jdGlvbiB1cGRhdGVTY3JvbGxiYXJzKGNtLCBtZWFzdXJlKSB7XG4gIGlmICghbWVhc3VyZSkgeyBtZWFzdXJlID0gbWVhc3VyZUZvclNjcm9sbGJhcnMoY20pOyB9XG4gIHZhciBzdGFydFdpZHRoID0gY20uZGlzcGxheS5iYXJXaWR0aCwgc3RhcnRIZWlnaHQgPSBjbS5kaXNwbGF5LmJhckhlaWdodDtcbiAgdXBkYXRlU2Nyb2xsYmFyc0lubmVyKGNtLCBtZWFzdXJlKTtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCA0ICYmIHN0YXJ0V2lkdGggIT0gY20uZGlzcGxheS5iYXJXaWR0aCB8fCBzdGFydEhlaWdodCAhPSBjbS5kaXNwbGF5LmJhckhlaWdodDsgaSsrKSB7XG4gICAgaWYgKHN0YXJ0V2lkdGggIT0gY20uZGlzcGxheS5iYXJXaWR0aCAmJiBjbS5vcHRpb25zLmxpbmVXcmFwcGluZylcbiAgICAgIHsgdXBkYXRlSGVpZ2h0c0luVmlld3BvcnQoY20pOyB9XG4gICAgdXBkYXRlU2Nyb2xsYmFyc0lubmVyKGNtLCBtZWFzdXJlRm9yU2Nyb2xsYmFycyhjbSkpO1xuICAgIHN0YXJ0V2lkdGggPSBjbS5kaXNwbGF5LmJhcldpZHRoOyBzdGFydEhlaWdodCA9IGNtLmRpc3BsYXkuYmFySGVpZ2h0O1xuICB9XG59XG5cbi8vIFJlLXN5bmNocm9uaXplIHRoZSBmYWtlIHNjcm9sbGJhcnMgd2l0aCB0aGUgYWN0dWFsIHNpemUgb2YgdGhlXG4vLyBjb250ZW50LlxuZnVuY3Rpb24gdXBkYXRlU2Nyb2xsYmFyc0lubmVyKGNtLCBtZWFzdXJlKSB7XG4gIHZhciBkID0gY20uZGlzcGxheTtcbiAgdmFyIHNpemVzID0gZC5zY3JvbGxiYXJzLnVwZGF0ZShtZWFzdXJlKTtcblxuICBkLnNpemVyLnN0eWxlLnBhZGRpbmdSaWdodCA9IChkLmJhcldpZHRoID0gc2l6ZXMucmlnaHQpICsgXCJweFwiO1xuICBkLnNpemVyLnN0eWxlLnBhZGRpbmdCb3R0b20gPSAoZC5iYXJIZWlnaHQgPSBzaXplcy5ib3R0b20pICsgXCJweFwiO1xuICBkLmhlaWdodEZvcmNlci5zdHlsZS5ib3JkZXJCb3R0b20gPSBzaXplcy5ib3R0b20gKyBcInB4IHNvbGlkIHRyYW5zcGFyZW50XCI7XG5cbiAgaWYgKHNpemVzLnJpZ2h0ICYmIHNpemVzLmJvdHRvbSkge1xuICAgIGQuc2Nyb2xsYmFyRmlsbGVyLnN0eWxlLmRpc3BsYXkgPSBcImJsb2NrXCI7XG4gICAgZC5zY3JvbGxiYXJGaWxsZXIuc3R5bGUuaGVpZ2h0ID0gc2l6ZXMuYm90dG9tICsgXCJweFwiO1xuICAgIGQuc2Nyb2xsYmFyRmlsbGVyLnN0eWxlLndpZHRoID0gc2l6ZXMucmlnaHQgKyBcInB4XCI7XG4gIH0gZWxzZSB7IGQuc2Nyb2xsYmFyRmlsbGVyLnN0eWxlLmRpc3BsYXkgPSBcIlwiOyB9XG4gIGlmIChzaXplcy5ib3R0b20gJiYgY20ub3B0aW9ucy5jb3Zlckd1dHRlck5leHRUb1Njcm9sbGJhciAmJiBjbS5vcHRpb25zLmZpeGVkR3V0dGVyKSB7XG4gICAgZC5ndXR0ZXJGaWxsZXIuc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcbiAgICBkLmd1dHRlckZpbGxlci5zdHlsZS5oZWlnaHQgPSBzaXplcy5ib3R0b20gKyBcInB4XCI7XG4gICAgZC5ndXR0ZXJGaWxsZXIuc3R5bGUud2lkdGggPSBtZWFzdXJlLmd1dHRlcldpZHRoICsgXCJweFwiO1xuICB9IGVsc2UgeyBkLmd1dHRlckZpbGxlci5zdHlsZS5kaXNwbGF5ID0gXCJcIjsgfVxufVxuXG52YXIgc2Nyb2xsYmFyTW9kZWwgPSB7XCJuYXRpdmVcIjogTmF0aXZlU2Nyb2xsYmFycywgXCJudWxsXCI6IE51bGxTY3JvbGxiYXJzfTtcblxuZnVuY3Rpb24gaW5pdFNjcm9sbGJhcnMoY20pIHtcbiAgaWYgKGNtLmRpc3BsYXkuc2Nyb2xsYmFycykge1xuICAgIGNtLmRpc3BsYXkuc2Nyb2xsYmFycy5jbGVhcigpO1xuICAgIGlmIChjbS5kaXNwbGF5LnNjcm9sbGJhcnMuYWRkQ2xhc3MpXG4gICAgICB7IHJtQ2xhc3MoY20uZGlzcGxheS53cmFwcGVyLCBjbS5kaXNwbGF5LnNjcm9sbGJhcnMuYWRkQ2xhc3MpOyB9XG4gIH1cblxuICBjbS5kaXNwbGF5LnNjcm9sbGJhcnMgPSBuZXcgc2Nyb2xsYmFyTW9kZWxbY20ub3B0aW9ucy5zY3JvbGxiYXJTdHlsZV0oZnVuY3Rpb24gKG5vZGUpIHtcbiAgICBjbS5kaXNwbGF5LndyYXBwZXIuaW5zZXJ0QmVmb3JlKG5vZGUsIGNtLmRpc3BsYXkuc2Nyb2xsYmFyRmlsbGVyKTtcbiAgICAvLyBQcmV2ZW50IGNsaWNrcyBpbiB0aGUgc2Nyb2xsYmFycyBmcm9tIGtpbGxpbmcgZm9jdXNcbiAgICBvbihub2RlLCBcIm1vdXNlZG93blwiLCBmdW5jdGlvbiAoKSB7XG4gICAgICBpZiAoY20uc3RhdGUuZm9jdXNlZCkgeyBzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHsgcmV0dXJuIGNtLmRpc3BsYXkuaW5wdXQuZm9jdXMoKTsgfSwgMCk7IH1cbiAgICB9KTtcbiAgICBub2RlLnNldEF0dHJpYnV0ZShcImNtLW5vdC1jb250ZW50XCIsIFwidHJ1ZVwiKTtcbiAgfSwgZnVuY3Rpb24gKHBvcywgYXhpcykge1xuICAgIGlmIChheGlzID09IFwiaG9yaXpvbnRhbFwiKSB7IHNldFNjcm9sbExlZnQoY20sIHBvcyk7IH1cbiAgICBlbHNlIHsgdXBkYXRlU2Nyb2xsVG9wKGNtLCBwb3MpOyB9XG4gIH0sIGNtKTtcbiAgaWYgKGNtLmRpc3BsYXkuc2Nyb2xsYmFycy5hZGRDbGFzcylcbiAgICB7IGFkZENsYXNzKGNtLmRpc3BsYXkud3JhcHBlciwgY20uZGlzcGxheS5zY3JvbGxiYXJzLmFkZENsYXNzKTsgfVxufVxuXG4vLyBPcGVyYXRpb25zIGFyZSB1c2VkIHRvIHdyYXAgYSBzZXJpZXMgb2YgY2hhbmdlcyB0byB0aGUgZWRpdG9yXG4vLyBzdGF0ZSBpbiBzdWNoIGEgd2F5IHRoYXQgZWFjaCBjaGFuZ2Ugd29uJ3QgaGF2ZSB0byB1cGRhdGUgdGhlXG4vLyBjdXJzb3IgYW5kIGRpc3BsYXkgKHdoaWNoIHdvdWxkIGJlIGF3a3dhcmQsIHNsb3csIGFuZFxuLy8gZXJyb3ItcHJvbmUpLiBJbnN0ZWFkLCBkaXNwbGF5IHVwZGF0ZXMgYXJlIGJhdGNoZWQgYW5kIHRoZW4gYWxsXG4vLyBjb21iaW5lZCBhbmQgZXhlY3V0ZWQgYXQgb25jZS5cblxudmFyIG5leHRPcElkID0gMDtcbi8vIFN0YXJ0IGEgbmV3IG9wZXJhdGlvbi5cbmZ1bmN0aW9uIHN0YXJ0T3BlcmF0aW9uKGNtKSB7XG4gIGNtLmN1ck9wID0ge1xuICAgIGNtOiBjbSxcbiAgICB2aWV3Q2hhbmdlZDogZmFsc2UsICAgICAgLy8gRmxhZyB0aGF0IGluZGljYXRlcyB0aGF0IGxpbmVzIG1pZ2h0IG5lZWQgdG8gYmUgcmVkcmF3blxuICAgIHN0YXJ0SGVpZ2h0OiBjbS5kb2MuaGVpZ2h0LCAvLyBVc2VkIHRvIGRldGVjdCBuZWVkIHRvIHVwZGF0ZSBzY3JvbGxiYXJcbiAgICBmb3JjZVVwZGF0ZTogZmFsc2UsICAgICAgLy8gVXNlZCB0byBmb3JjZSBhIHJlZHJhd1xuICAgIHVwZGF0ZUlucHV0OiBudWxsLCAgICAgICAvLyBXaGV0aGVyIHRvIHJlc2V0IHRoZSBpbnB1dCB0ZXh0YXJlYVxuICAgIHR5cGluZzogZmFsc2UsICAgICAgICAgICAvLyBXaGV0aGVyIHRoaXMgcmVzZXQgc2hvdWxkIGJlIGNhcmVmdWwgdG8gbGVhdmUgZXhpc3RpbmcgdGV4dCAoZm9yIGNvbXBvc2l0aW5nKVxuICAgIGNoYW5nZU9ianM6IG51bGwsICAgICAgICAvLyBBY2N1bXVsYXRlZCBjaGFuZ2VzLCBmb3IgZmlyaW5nIGNoYW5nZSBldmVudHNcbiAgICBjdXJzb3JBY3Rpdml0eUhhbmRsZXJzOiBudWxsLCAvLyBTZXQgb2YgaGFuZGxlcnMgdG8gZmlyZSBjdXJzb3JBY3Rpdml0eSBvblxuICAgIGN1cnNvckFjdGl2aXR5Q2FsbGVkOiAwLCAvLyBUcmFja3Mgd2hpY2ggY3Vyc29yQWN0aXZpdHkgaGFuZGxlcnMgaGF2ZSBiZWVuIGNhbGxlZCBhbHJlYWR5XG4gICAgc2VsZWN0aW9uQ2hhbmdlZDogZmFsc2UsIC8vIFdoZXRoZXIgdGhlIHNlbGVjdGlvbiBuZWVkcyB0byBiZSByZWRyYXduXG4gICAgdXBkYXRlTWF4TGluZTogZmFsc2UsICAgIC8vIFNldCB3aGVuIHRoZSB3aWRlc3QgbGluZSBuZWVkcyB0byBiZSBkZXRlcm1pbmVkIGFuZXdcbiAgICBzY3JvbGxMZWZ0OiBudWxsLCBzY3JvbGxUb3A6IG51bGwsIC8vIEludGVybWVkaWF0ZSBzY3JvbGwgcG9zaXRpb24sIG5vdCBwdXNoZWQgdG8gRE9NIHlldFxuICAgIHNjcm9sbFRvUG9zOiBudWxsLCAgICAgICAvLyBVc2VkIHRvIHNjcm9sbCB0byBhIHNwZWNpZmljIHBvc2l0aW9uXG4gICAgZm9jdXM6IGZhbHNlLFxuICAgIGlkOiArK25leHRPcElkICAgICAgICAgICAvLyBVbmlxdWUgSURcbiAgfTtcbiAgcHVzaE9wZXJhdGlvbihjbS5jdXJPcCk7XG59XG5cbi8vIEZpbmlzaCBhbiBvcGVyYXRpb24sIHVwZGF0aW5nIHRoZSBkaXNwbGF5IGFuZCBzaWduYWxsaW5nIGRlbGF5ZWQgZXZlbnRzXG5mdW5jdGlvbiBlbmRPcGVyYXRpb24oY20pIHtcbiAgdmFyIG9wID0gY20uY3VyT3A7XG4gIGZpbmlzaE9wZXJhdGlvbihvcCwgZnVuY3Rpb24gKGdyb3VwKSB7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBncm91cC5vcHMubGVuZ3RoOyBpKyspXG4gICAgICB7IGdyb3VwLm9wc1tpXS5jbS5jdXJPcCA9IG51bGw7IH1cbiAgICBlbmRPcGVyYXRpb25zKGdyb3VwKTtcbiAgfSk7XG59XG5cbi8vIFRoZSBET00gdXBkYXRlcyBkb25lIHdoZW4gYW4gb3BlcmF0aW9uIGZpbmlzaGVzIGFyZSBiYXRjaGVkIHNvXG4vLyB0aGF0IHRoZSBtaW5pbXVtIG51bWJlciBvZiByZWxheW91dHMgYXJlIHJlcXVpcmVkLlxuZnVuY3Rpb24gZW5kT3BlcmF0aW9ucyhncm91cCkge1xuICB2YXIgb3BzID0gZ3JvdXAub3BzO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IG9wcy5sZW5ndGg7IGkrKykgLy8gUmVhZCBET01cbiAgICB7IGVuZE9wZXJhdGlvbl9SMShvcHNbaV0pOyB9XG4gIGZvciAodmFyIGkkMSA9IDA7IGkkMSA8IG9wcy5sZW5ndGg7IGkkMSsrKSAvLyBXcml0ZSBET00gKG1heWJlKVxuICAgIHsgZW5kT3BlcmF0aW9uX1cxKG9wc1tpJDFdKTsgfVxuICBmb3IgKHZhciBpJDIgPSAwOyBpJDIgPCBvcHMubGVuZ3RoOyBpJDIrKykgLy8gUmVhZCBET01cbiAgICB7IGVuZE9wZXJhdGlvbl9SMihvcHNbaSQyXSk7IH1cbiAgZm9yICh2YXIgaSQzID0gMDsgaSQzIDwgb3BzLmxlbmd0aDsgaSQzKyspIC8vIFdyaXRlIERPTSAobWF5YmUpXG4gICAgeyBlbmRPcGVyYXRpb25fVzIob3BzW2kkM10pOyB9XG4gIGZvciAodmFyIGkkNCA9IDA7IGkkNCA8IG9wcy5sZW5ndGg7IGkkNCsrKSAvLyBSZWFkIERPTVxuICAgIHsgZW5kT3BlcmF0aW9uX2ZpbmlzaChvcHNbaSQ0XSk7IH1cbn1cblxuZnVuY3Rpb24gZW5kT3BlcmF0aW9uX1IxKG9wKSB7XG4gIHZhciBjbSA9IG9wLmNtLCBkaXNwbGF5ID0gY20uZGlzcGxheTtcbiAgbWF5YmVDbGlwU2Nyb2xsYmFycyhjbSk7XG4gIGlmIChvcC51cGRhdGVNYXhMaW5lKSB7IGZpbmRNYXhMaW5lKGNtKTsgfVxuXG4gIG9wLm11c3RVcGRhdGUgPSBvcC52aWV3Q2hhbmdlZCB8fCBvcC5mb3JjZVVwZGF0ZSB8fCBvcC5zY3JvbGxUb3AgIT0gbnVsbCB8fFxuICAgIG9wLnNjcm9sbFRvUG9zICYmIChvcC5zY3JvbGxUb1Bvcy5mcm9tLmxpbmUgPCBkaXNwbGF5LnZpZXdGcm9tIHx8XG4gICAgICAgICAgICAgICAgICAgICAgIG9wLnNjcm9sbFRvUG9zLnRvLmxpbmUgPj0gZGlzcGxheS52aWV3VG8pIHx8XG4gICAgZGlzcGxheS5tYXhMaW5lQ2hhbmdlZCAmJiBjbS5vcHRpb25zLmxpbmVXcmFwcGluZztcbiAgb3AudXBkYXRlID0gb3AubXVzdFVwZGF0ZSAmJlxuICAgIG5ldyBEaXNwbGF5VXBkYXRlKGNtLCBvcC5tdXN0VXBkYXRlICYmIHt0b3A6IG9wLnNjcm9sbFRvcCwgZW5zdXJlOiBvcC5zY3JvbGxUb1Bvc30sIG9wLmZvcmNlVXBkYXRlKTtcbn1cblxuZnVuY3Rpb24gZW5kT3BlcmF0aW9uX1cxKG9wKSB7XG4gIG9wLnVwZGF0ZWREaXNwbGF5ID0gb3AubXVzdFVwZGF0ZSAmJiB1cGRhdGVEaXNwbGF5SWZOZWVkZWQob3AuY20sIG9wLnVwZGF0ZSk7XG59XG5cbmZ1bmN0aW9uIGVuZE9wZXJhdGlvbl9SMihvcCkge1xuICB2YXIgY20gPSBvcC5jbSwgZGlzcGxheSA9IGNtLmRpc3BsYXk7XG4gIGlmIChvcC51cGRhdGVkRGlzcGxheSkgeyB1cGRhdGVIZWlnaHRzSW5WaWV3cG9ydChjbSk7IH1cblxuICBvcC5iYXJNZWFzdXJlID0gbWVhc3VyZUZvclNjcm9sbGJhcnMoY20pO1xuXG4gIC8vIElmIHRoZSBtYXggbGluZSBjaGFuZ2VkIHNpbmNlIGl0IHdhcyBsYXN0IG1lYXN1cmVkLCBtZWFzdXJlIGl0LFxuICAvLyBhbmQgZW5zdXJlIHRoZSBkb2N1bWVudCdzIHdpZHRoIG1hdGNoZXMgaXQuXG4gIC8vIHVwZGF0ZURpc3BsYXlfVzIgd2lsbCB1c2UgdGhlc2UgcHJvcGVydGllcyB0byBkbyB0aGUgYWN0dWFsIHJlc2l6aW5nXG4gIGlmIChkaXNwbGF5Lm1heExpbmVDaGFuZ2VkICYmICFjbS5vcHRpb25zLmxpbmVXcmFwcGluZykge1xuICAgIG9wLmFkanVzdFdpZHRoVG8gPSBtZWFzdXJlQ2hhcihjbSwgZGlzcGxheS5tYXhMaW5lLCBkaXNwbGF5Lm1heExpbmUudGV4dC5sZW5ndGgpLmxlZnQgKyAzO1xuICAgIGNtLmRpc3BsYXkuc2l6ZXJXaWR0aCA9IG9wLmFkanVzdFdpZHRoVG87XG4gICAgb3AuYmFyTWVhc3VyZS5zY3JvbGxXaWR0aCA9XG4gICAgICBNYXRoLm1heChkaXNwbGF5LnNjcm9sbGVyLmNsaWVudFdpZHRoLCBkaXNwbGF5LnNpemVyLm9mZnNldExlZnQgKyBvcC5hZGp1c3RXaWR0aFRvICsgc2Nyb2xsR2FwKGNtKSArIGNtLmRpc3BsYXkuYmFyV2lkdGgpO1xuICAgIG9wLm1heFNjcm9sbExlZnQgPSBNYXRoLm1heCgwLCBkaXNwbGF5LnNpemVyLm9mZnNldExlZnQgKyBvcC5hZGp1c3RXaWR0aFRvIC0gZGlzcGxheVdpZHRoKGNtKSk7XG4gIH1cblxuICBpZiAob3AudXBkYXRlZERpc3BsYXkgfHwgb3Auc2VsZWN0aW9uQ2hhbmdlZClcbiAgICB7IG9wLnByZXBhcmVkU2VsZWN0aW9uID0gZGlzcGxheS5pbnB1dC5wcmVwYXJlU2VsZWN0aW9uKCk7IH1cbn1cblxuZnVuY3Rpb24gZW5kT3BlcmF0aW9uX1cyKG9wKSB7XG4gIHZhciBjbSA9IG9wLmNtO1xuXG4gIGlmIChvcC5hZGp1c3RXaWR0aFRvICE9IG51bGwpIHtcbiAgICBjbS5kaXNwbGF5LnNpemVyLnN0eWxlLm1pbldpZHRoID0gb3AuYWRqdXN0V2lkdGhUbyArIFwicHhcIjtcbiAgICBpZiAob3AubWF4U2Nyb2xsTGVmdCA8IGNtLmRvYy5zY3JvbGxMZWZ0KVxuICAgICAgeyBzZXRTY3JvbGxMZWZ0KGNtLCBNYXRoLm1pbihjbS5kaXNwbGF5LnNjcm9sbGVyLnNjcm9sbExlZnQsIG9wLm1heFNjcm9sbExlZnQpLCB0cnVlKTsgfVxuICAgIGNtLmRpc3BsYXkubWF4TGluZUNoYW5nZWQgPSBmYWxzZTtcbiAgfVxuXG4gIHZhciB0YWtlRm9jdXMgPSBvcC5mb2N1cyAmJiBvcC5mb2N1cyA9PSBhY3RpdmVFbHQoKTtcbiAgaWYgKG9wLnByZXBhcmVkU2VsZWN0aW9uKVxuICAgIHsgY20uZGlzcGxheS5pbnB1dC5zaG93U2VsZWN0aW9uKG9wLnByZXBhcmVkU2VsZWN0aW9uLCB0YWtlRm9jdXMpOyB9XG4gIGlmIChvcC51cGRhdGVkRGlzcGxheSB8fCBvcC5zdGFydEhlaWdodCAhPSBjbS5kb2MuaGVpZ2h0KVxuICAgIHsgdXBkYXRlU2Nyb2xsYmFycyhjbSwgb3AuYmFyTWVhc3VyZSk7IH1cbiAgaWYgKG9wLnVwZGF0ZWREaXNwbGF5KVxuICAgIHsgc2V0RG9jdW1lbnRIZWlnaHQoY20sIG9wLmJhck1lYXN1cmUpOyB9XG5cbiAgaWYgKG9wLnNlbGVjdGlvbkNoYW5nZWQpIHsgcmVzdGFydEJsaW5rKGNtKTsgfVxuXG4gIGlmIChjbS5zdGF0ZS5mb2N1c2VkICYmIG9wLnVwZGF0ZUlucHV0KVxuICAgIHsgY20uZGlzcGxheS5pbnB1dC5yZXNldChvcC50eXBpbmcpOyB9XG4gIGlmICh0YWtlRm9jdXMpIHsgZW5zdXJlRm9jdXMob3AuY20pOyB9XG59XG5cbmZ1bmN0aW9uIGVuZE9wZXJhdGlvbl9maW5pc2gob3ApIHtcbiAgdmFyIGNtID0gb3AuY20sIGRpc3BsYXkgPSBjbS5kaXNwbGF5LCBkb2MgPSBjbS5kb2M7XG5cbiAgaWYgKG9wLnVwZGF0ZWREaXNwbGF5KSB7IHBvc3RVcGRhdGVEaXNwbGF5KGNtLCBvcC51cGRhdGUpOyB9XG5cbiAgLy8gQWJvcnQgbW91c2Ugd2hlZWwgZGVsdGEgbWVhc3VyZW1lbnQsIHdoZW4gc2Nyb2xsaW5nIGV4cGxpY2l0bHlcbiAgaWYgKGRpc3BsYXkud2hlZWxTdGFydFggIT0gbnVsbCAmJiAob3Auc2Nyb2xsVG9wICE9IG51bGwgfHwgb3Auc2Nyb2xsTGVmdCAhPSBudWxsIHx8IG9wLnNjcm9sbFRvUG9zKSlcbiAgICB7IGRpc3BsYXkud2hlZWxTdGFydFggPSBkaXNwbGF5LndoZWVsU3RhcnRZID0gbnVsbDsgfVxuXG4gIC8vIFByb3BhZ2F0ZSB0aGUgc2Nyb2xsIHBvc2l0aW9uIHRvIHRoZSBhY3R1YWwgRE9NIHNjcm9sbGVyXG4gIGlmIChvcC5zY3JvbGxUb3AgIT0gbnVsbCkgeyBzZXRTY3JvbGxUb3AoY20sIG9wLnNjcm9sbFRvcCwgb3AuZm9yY2VTY3JvbGwpOyB9XG5cbiAgaWYgKG9wLnNjcm9sbExlZnQgIT0gbnVsbCkgeyBzZXRTY3JvbGxMZWZ0KGNtLCBvcC5zY3JvbGxMZWZ0LCB0cnVlLCB0cnVlKTsgfVxuICAvLyBJZiB3ZSBuZWVkIHRvIHNjcm9sbCBhIHNwZWNpZmljIHBvc2l0aW9uIGludG8gdmlldywgZG8gc28uXG4gIGlmIChvcC5zY3JvbGxUb1Bvcykge1xuICAgIHZhciByZWN0ID0gc2Nyb2xsUG9zSW50b1ZpZXcoY20sIGNsaXBQb3MoZG9jLCBvcC5zY3JvbGxUb1Bvcy5mcm9tKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNsaXBQb3MoZG9jLCBvcC5zY3JvbGxUb1Bvcy50byksIG9wLnNjcm9sbFRvUG9zLm1hcmdpbik7XG4gICAgbWF5YmVTY3JvbGxXaW5kb3coY20sIHJlY3QpO1xuICB9XG5cbiAgLy8gRmlyZSBldmVudHMgZm9yIG1hcmtlcnMgdGhhdCBhcmUgaGlkZGVuL3VuaWRkZW4gYnkgZWRpdGluZyBvclxuICAvLyB1bmRvaW5nXG4gIHZhciBoaWRkZW4gPSBvcC5tYXliZUhpZGRlbk1hcmtlcnMsIHVuaGlkZGVuID0gb3AubWF5YmVVbmhpZGRlbk1hcmtlcnM7XG4gIGlmIChoaWRkZW4pIHsgZm9yICh2YXIgaSA9IDA7IGkgPCBoaWRkZW4ubGVuZ3RoOyArK2kpXG4gICAgeyBpZiAoIWhpZGRlbltpXS5saW5lcy5sZW5ndGgpIHsgc2lnbmFsKGhpZGRlbltpXSwgXCJoaWRlXCIpOyB9IH0gfVxuICBpZiAodW5oaWRkZW4pIHsgZm9yICh2YXIgaSQxID0gMDsgaSQxIDwgdW5oaWRkZW4ubGVuZ3RoOyArK2kkMSlcbiAgICB7IGlmICh1bmhpZGRlbltpJDFdLmxpbmVzLmxlbmd0aCkgeyBzaWduYWwodW5oaWRkZW5baSQxXSwgXCJ1bmhpZGVcIik7IH0gfSB9XG5cbiAgaWYgKGRpc3BsYXkud3JhcHBlci5vZmZzZXRIZWlnaHQpXG4gICAgeyBkb2Muc2Nyb2xsVG9wID0gY20uZGlzcGxheS5zY3JvbGxlci5zY3JvbGxUb3A7IH1cblxuICAvLyBGaXJlIGNoYW5nZSBldmVudHMsIGFuZCBkZWxheWVkIGV2ZW50IGhhbmRsZXJzXG4gIGlmIChvcC5jaGFuZ2VPYmpzKVxuICAgIHsgc2lnbmFsKGNtLCBcImNoYW5nZXNcIiwgY20sIG9wLmNoYW5nZU9ianMpOyB9XG4gIGlmIChvcC51cGRhdGUpXG4gICAgeyBvcC51cGRhdGUuZmluaXNoKCk7IH1cbn1cblxuLy8gUnVuIHRoZSBnaXZlbiBmdW5jdGlvbiBpbiBhbiBvcGVyYXRpb25cbmZ1bmN0aW9uIHJ1bkluT3AoY20sIGYpIHtcbiAgaWYgKGNtLmN1ck9wKSB7IHJldHVybiBmKCkgfVxuICBzdGFydE9wZXJhdGlvbihjbSk7XG4gIHRyeSB7IHJldHVybiBmKCkgfVxuICBmaW5hbGx5IHsgZW5kT3BlcmF0aW9uKGNtKTsgfVxufVxuLy8gV3JhcHMgYSBmdW5jdGlvbiBpbiBhbiBvcGVyYXRpb24uIFJldHVybnMgdGhlIHdyYXBwZWQgZnVuY3Rpb24uXG5mdW5jdGlvbiBvcGVyYXRpb24oY20sIGYpIHtcbiAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgIGlmIChjbS5jdXJPcCkgeyByZXR1cm4gZi5hcHBseShjbSwgYXJndW1lbnRzKSB9XG4gICAgc3RhcnRPcGVyYXRpb24oY20pO1xuICAgIHRyeSB7IHJldHVybiBmLmFwcGx5KGNtLCBhcmd1bWVudHMpIH1cbiAgICBmaW5hbGx5IHsgZW5kT3BlcmF0aW9uKGNtKTsgfVxuICB9XG59XG4vLyBVc2VkIHRvIGFkZCBtZXRob2RzIHRvIGVkaXRvciBhbmQgZG9jIGluc3RhbmNlcywgd3JhcHBpbmcgdGhlbSBpblxuLy8gb3BlcmF0aW9ucy5cbmZ1bmN0aW9uIG1ldGhvZE9wKGYpIHtcbiAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgIGlmICh0aGlzLmN1ck9wKSB7IHJldHVybiBmLmFwcGx5KHRoaXMsIGFyZ3VtZW50cykgfVxuICAgIHN0YXJ0T3BlcmF0aW9uKHRoaXMpO1xuICAgIHRyeSB7IHJldHVybiBmLmFwcGx5KHRoaXMsIGFyZ3VtZW50cykgfVxuICAgIGZpbmFsbHkgeyBlbmRPcGVyYXRpb24odGhpcyk7IH1cbiAgfVxufVxuZnVuY3Rpb24gZG9jTWV0aG9kT3AoZikge1xuICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgdmFyIGNtID0gdGhpcy5jbTtcbiAgICBpZiAoIWNtIHx8IGNtLmN1ck9wKSB7IHJldHVybiBmLmFwcGx5KHRoaXMsIGFyZ3VtZW50cykgfVxuICAgIHN0YXJ0T3BlcmF0aW9uKGNtKTtcbiAgICB0cnkgeyByZXR1cm4gZi5hcHBseSh0aGlzLCBhcmd1bWVudHMpIH1cbiAgICBmaW5hbGx5IHsgZW5kT3BlcmF0aW9uKGNtKTsgfVxuICB9XG59XG5cbi8vIFVwZGF0ZXMgdGhlIGRpc3BsYXkudmlldyBkYXRhIHN0cnVjdHVyZSBmb3IgYSBnaXZlbiBjaGFuZ2UgdG8gdGhlXG4vLyBkb2N1bWVudC4gRnJvbSBhbmQgdG8gYXJlIGluIHByZS1jaGFuZ2UgY29vcmRpbmF0ZXMuIExlbmRpZmYgaXNcbi8vIHRoZSBhbW91bnQgb2YgbGluZXMgYWRkZWQgb3Igc3VidHJhY3RlZCBieSB0aGUgY2hhbmdlLiBUaGlzIGlzXG4vLyB1c2VkIGZvciBjaGFuZ2VzIHRoYXQgc3BhbiBtdWx0aXBsZSBsaW5lcywgb3IgY2hhbmdlIHRoZSB3YXlcbi8vIGxpbmVzIGFyZSBkaXZpZGVkIGludG8gdmlzdWFsIGxpbmVzLiByZWdMaW5lQ2hhbmdlIChiZWxvdylcbi8vIHJlZ2lzdGVycyBzaW5nbGUtbGluZSBjaGFuZ2VzLlxuZnVuY3Rpb24gcmVnQ2hhbmdlKGNtLCBmcm9tLCB0bywgbGVuZGlmZikge1xuICBpZiAoZnJvbSA9PSBudWxsKSB7IGZyb20gPSBjbS5kb2MuZmlyc3Q7IH1cbiAgaWYgKHRvID09IG51bGwpIHsgdG8gPSBjbS5kb2MuZmlyc3QgKyBjbS5kb2Muc2l6ZTsgfVxuICBpZiAoIWxlbmRpZmYpIHsgbGVuZGlmZiA9IDA7IH1cblxuICB2YXIgZGlzcGxheSA9IGNtLmRpc3BsYXk7XG4gIGlmIChsZW5kaWZmICYmIHRvIDwgZGlzcGxheS52aWV3VG8gJiZcbiAgICAgIChkaXNwbGF5LnVwZGF0ZUxpbmVOdW1iZXJzID09IG51bGwgfHwgZGlzcGxheS51cGRhdGVMaW5lTnVtYmVycyA+IGZyb20pKVxuICAgIHsgZGlzcGxheS51cGRhdGVMaW5lTnVtYmVycyA9IGZyb207IH1cblxuICBjbS5jdXJPcC52aWV3Q2hhbmdlZCA9IHRydWU7XG5cbiAgaWYgKGZyb20gPj0gZGlzcGxheS52aWV3VG8pIHsgLy8gQ2hhbmdlIGFmdGVyXG4gICAgaWYgKHNhd0NvbGxhcHNlZFNwYW5zICYmIHZpc3VhbExpbmVObyhjbS5kb2MsIGZyb20pIDwgZGlzcGxheS52aWV3VG8pXG4gICAgICB7IHJlc2V0VmlldyhjbSk7IH1cbiAgfSBlbHNlIGlmICh0byA8PSBkaXNwbGF5LnZpZXdGcm9tKSB7IC8vIENoYW5nZSBiZWZvcmVcbiAgICBpZiAoc2F3Q29sbGFwc2VkU3BhbnMgJiYgdmlzdWFsTGluZUVuZE5vKGNtLmRvYywgdG8gKyBsZW5kaWZmKSA+IGRpc3BsYXkudmlld0Zyb20pIHtcbiAgICAgIHJlc2V0VmlldyhjbSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGRpc3BsYXkudmlld0Zyb20gKz0gbGVuZGlmZjtcbiAgICAgIGRpc3BsYXkudmlld1RvICs9IGxlbmRpZmY7XG4gICAgfVxuICB9IGVsc2UgaWYgKGZyb20gPD0gZGlzcGxheS52aWV3RnJvbSAmJiB0byA+PSBkaXNwbGF5LnZpZXdUbykgeyAvLyBGdWxsIG92ZXJsYXBcbiAgICByZXNldFZpZXcoY20pO1xuICB9IGVsc2UgaWYgKGZyb20gPD0gZGlzcGxheS52aWV3RnJvbSkgeyAvLyBUb3Agb3ZlcmxhcFxuICAgIHZhciBjdXQgPSB2aWV3Q3V0dGluZ1BvaW50KGNtLCB0bywgdG8gKyBsZW5kaWZmLCAxKTtcbiAgICBpZiAoY3V0KSB7XG4gICAgICBkaXNwbGF5LnZpZXcgPSBkaXNwbGF5LnZpZXcuc2xpY2UoY3V0LmluZGV4KTtcbiAgICAgIGRpc3BsYXkudmlld0Zyb20gPSBjdXQubGluZU47XG4gICAgICBkaXNwbGF5LnZpZXdUbyArPSBsZW5kaWZmO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXNldFZpZXcoY20pO1xuICAgIH1cbiAgfSBlbHNlIGlmICh0byA+PSBkaXNwbGF5LnZpZXdUbykgeyAvLyBCb3R0b20gb3ZlcmxhcFxuICAgIHZhciBjdXQkMSA9IHZpZXdDdXR0aW5nUG9pbnQoY20sIGZyb20sIGZyb20sIC0xKTtcbiAgICBpZiAoY3V0JDEpIHtcbiAgICAgIGRpc3BsYXkudmlldyA9IGRpc3BsYXkudmlldy5zbGljZSgwLCBjdXQkMS5pbmRleCk7XG4gICAgICBkaXNwbGF5LnZpZXdUbyA9IGN1dCQxLmxpbmVOO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXNldFZpZXcoY20pO1xuICAgIH1cbiAgfSBlbHNlIHsgLy8gR2FwIGluIHRoZSBtaWRkbGVcbiAgICB2YXIgY3V0VG9wID0gdmlld0N1dHRpbmdQb2ludChjbSwgZnJvbSwgZnJvbSwgLTEpO1xuICAgIHZhciBjdXRCb3QgPSB2aWV3Q3V0dGluZ1BvaW50KGNtLCB0bywgdG8gKyBsZW5kaWZmLCAxKTtcbiAgICBpZiAoY3V0VG9wICYmIGN1dEJvdCkge1xuICAgICAgZGlzcGxheS52aWV3ID0gZGlzcGxheS52aWV3LnNsaWNlKDAsIGN1dFRvcC5pbmRleClcbiAgICAgICAgLmNvbmNhdChidWlsZFZpZXdBcnJheShjbSwgY3V0VG9wLmxpbmVOLCBjdXRCb3QubGluZU4pKVxuICAgICAgICAuY29uY2F0KGRpc3BsYXkudmlldy5zbGljZShjdXRCb3QuaW5kZXgpKTtcbiAgICAgIGRpc3BsYXkudmlld1RvICs9IGxlbmRpZmY7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJlc2V0VmlldyhjbSk7XG4gICAgfVxuICB9XG5cbiAgdmFyIGV4dCA9IGRpc3BsYXkuZXh0ZXJuYWxNZWFzdXJlZDtcbiAgaWYgKGV4dCkge1xuICAgIGlmICh0byA8IGV4dC5saW5lTilcbiAgICAgIHsgZXh0LmxpbmVOICs9IGxlbmRpZmY7IH1cbiAgICBlbHNlIGlmIChmcm9tIDwgZXh0LmxpbmVOICsgZXh0LnNpemUpXG4gICAgICB7IGRpc3BsYXkuZXh0ZXJuYWxNZWFzdXJlZCA9IG51bGw7IH1cbiAgfVxufVxuXG4vLyBSZWdpc3RlciBhIGNoYW5nZSB0byBhIHNpbmdsZSBsaW5lLiBUeXBlIG11c3QgYmUgb25lIG9mIFwidGV4dFwiLFxuLy8gXCJndXR0ZXJcIiwgXCJjbGFzc1wiLCBcIndpZGdldFwiXG5mdW5jdGlvbiByZWdMaW5lQ2hhbmdlKGNtLCBsaW5lLCB0eXBlKSB7XG4gIGNtLmN1ck9wLnZpZXdDaGFuZ2VkID0gdHJ1ZTtcbiAgdmFyIGRpc3BsYXkgPSBjbS5kaXNwbGF5LCBleHQgPSBjbS5kaXNwbGF5LmV4dGVybmFsTWVhc3VyZWQ7XG4gIGlmIChleHQgJiYgbGluZSA+PSBleHQubGluZU4gJiYgbGluZSA8IGV4dC5saW5lTiArIGV4dC5zaXplKVxuICAgIHsgZGlzcGxheS5leHRlcm5hbE1lYXN1cmVkID0gbnVsbDsgfVxuXG4gIGlmIChsaW5lIDwgZGlzcGxheS52aWV3RnJvbSB8fCBsaW5lID49IGRpc3BsYXkudmlld1RvKSB7IHJldHVybiB9XG4gIHZhciBsaW5lVmlldyA9IGRpc3BsYXkudmlld1tmaW5kVmlld0luZGV4KGNtLCBsaW5lKV07XG4gIGlmIChsaW5lVmlldy5ub2RlID09IG51bGwpIHsgcmV0dXJuIH1cbiAgdmFyIGFyciA9IGxpbmVWaWV3LmNoYW5nZXMgfHwgKGxpbmVWaWV3LmNoYW5nZXMgPSBbXSk7XG4gIGlmIChpbmRleE9mKGFyciwgdHlwZSkgPT0gLTEpIHsgYXJyLnB1c2godHlwZSk7IH1cbn1cblxuLy8gQ2xlYXIgdGhlIHZpZXcuXG5mdW5jdGlvbiByZXNldFZpZXcoY20pIHtcbiAgY20uZGlzcGxheS52aWV3RnJvbSA9IGNtLmRpc3BsYXkudmlld1RvID0gY20uZG9jLmZpcnN0O1xuICBjbS5kaXNwbGF5LnZpZXcgPSBbXTtcbiAgY20uZGlzcGxheS52aWV3T2Zmc2V0ID0gMDtcbn1cblxuZnVuY3Rpb24gdmlld0N1dHRpbmdQb2ludChjbSwgb2xkTiwgbmV3TiwgZGlyKSB7XG4gIHZhciBpbmRleCA9IGZpbmRWaWV3SW5kZXgoY20sIG9sZE4pLCBkaWZmLCB2aWV3ID0gY20uZGlzcGxheS52aWV3O1xuICBpZiAoIXNhd0NvbGxhcHNlZFNwYW5zIHx8IG5ld04gPT0gY20uZG9jLmZpcnN0ICsgY20uZG9jLnNpemUpXG4gICAgeyByZXR1cm4ge2luZGV4OiBpbmRleCwgbGluZU46IG5ld059IH1cbiAgdmFyIG4gPSBjbS5kaXNwbGF5LnZpZXdGcm9tO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGluZGV4OyBpKyspXG4gICAgeyBuICs9IHZpZXdbaV0uc2l6ZTsgfVxuICBpZiAobiAhPSBvbGROKSB7XG4gICAgaWYgKGRpciA+IDApIHtcbiAgICAgIGlmIChpbmRleCA9PSB2aWV3Lmxlbmd0aCAtIDEpIHsgcmV0dXJuIG51bGwgfVxuICAgICAgZGlmZiA9IChuICsgdmlld1tpbmRleF0uc2l6ZSkgLSBvbGROO1xuICAgICAgaW5kZXgrKztcbiAgICB9IGVsc2Uge1xuICAgICAgZGlmZiA9IG4gLSBvbGROO1xuICAgIH1cbiAgICBvbGROICs9IGRpZmY7IG5ld04gKz0gZGlmZjtcbiAgfVxuICB3aGlsZSAodmlzdWFsTGluZU5vKGNtLmRvYywgbmV3TikgIT0gbmV3Tikge1xuICAgIGlmIChpbmRleCA9PSAoZGlyIDwgMCA/IDAgOiB2aWV3Lmxlbmd0aCAtIDEpKSB7IHJldHVybiBudWxsIH1cbiAgICBuZXdOICs9IGRpciAqIHZpZXdbaW5kZXggLSAoZGlyIDwgMCA/IDEgOiAwKV0uc2l6ZTtcbiAgICBpbmRleCArPSBkaXI7XG4gIH1cbiAgcmV0dXJuIHtpbmRleDogaW5kZXgsIGxpbmVOOiBuZXdOfVxufVxuXG4vLyBGb3JjZSB0aGUgdmlldyB0byBjb3ZlciBhIGdpdmVuIHJhbmdlLCBhZGRpbmcgZW1wdHkgdmlldyBlbGVtZW50XG4vLyBvciBjbGlwcGluZyBvZmYgZXhpc3Rpbmcgb25lcyBhcyBuZWVkZWQuXG5mdW5jdGlvbiBhZGp1c3RWaWV3KGNtLCBmcm9tLCB0bykge1xuICB2YXIgZGlzcGxheSA9IGNtLmRpc3BsYXksIHZpZXcgPSBkaXNwbGF5LnZpZXc7XG4gIGlmICh2aWV3Lmxlbmd0aCA9PSAwIHx8IGZyb20gPj0gZGlzcGxheS52aWV3VG8gfHwgdG8gPD0gZGlzcGxheS52aWV3RnJvbSkge1xuICAgIGRpc3BsYXkudmlldyA9IGJ1aWxkVmlld0FycmF5KGNtLCBmcm9tLCB0byk7XG4gICAgZGlzcGxheS52aWV3RnJvbSA9IGZyb207XG4gIH0gZWxzZSB7XG4gICAgaWYgKGRpc3BsYXkudmlld0Zyb20gPiBmcm9tKVxuICAgICAgeyBkaXNwbGF5LnZpZXcgPSBidWlsZFZpZXdBcnJheShjbSwgZnJvbSwgZGlzcGxheS52aWV3RnJvbSkuY29uY2F0KGRpc3BsYXkudmlldyk7IH1cbiAgICBlbHNlIGlmIChkaXNwbGF5LnZpZXdGcm9tIDwgZnJvbSlcbiAgICAgIHsgZGlzcGxheS52aWV3ID0gZGlzcGxheS52aWV3LnNsaWNlKGZpbmRWaWV3SW5kZXgoY20sIGZyb20pKTsgfVxuICAgIGRpc3BsYXkudmlld0Zyb20gPSBmcm9tO1xuICAgIGlmIChkaXNwbGF5LnZpZXdUbyA8IHRvKVxuICAgICAgeyBkaXNwbGF5LnZpZXcgPSBkaXNwbGF5LnZpZXcuY29uY2F0KGJ1aWxkVmlld0FycmF5KGNtLCBkaXNwbGF5LnZpZXdUbywgdG8pKTsgfVxuICAgIGVsc2UgaWYgKGRpc3BsYXkudmlld1RvID4gdG8pXG4gICAgICB7IGRpc3BsYXkudmlldyA9IGRpc3BsYXkudmlldy5zbGljZSgwLCBmaW5kVmlld0luZGV4KGNtLCB0bykpOyB9XG4gIH1cbiAgZGlzcGxheS52aWV3VG8gPSB0bztcbn1cblxuLy8gQ291bnQgdGhlIG51bWJlciBvZiBsaW5lcyBpbiB0aGUgdmlldyB3aG9zZSBET00gcmVwcmVzZW50YXRpb24gaXNcbi8vIG91dCBvZiBkYXRlIChvciBub25leGlzdGVudCkuXG5mdW5jdGlvbiBjb3VudERpcnR5VmlldyhjbSkge1xuICB2YXIgdmlldyA9IGNtLmRpc3BsYXkudmlldywgZGlydHkgPSAwO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IHZpZXcubGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgbGluZVZpZXcgPSB2aWV3W2ldO1xuICAgIGlmICghbGluZVZpZXcuaGlkZGVuICYmICghbGluZVZpZXcubm9kZSB8fCBsaW5lVmlldy5jaGFuZ2VzKSkgeyArK2RpcnR5OyB9XG4gIH1cbiAgcmV0dXJuIGRpcnR5XG59XG5cbi8vIEhJR0hMSUdIVCBXT1JLRVJcblxuZnVuY3Rpb24gc3RhcnRXb3JrZXIoY20sIHRpbWUpIHtcbiAgaWYgKGNtLmRvYy5oaWdobGlnaHRGcm9udGllciA8IGNtLmRpc3BsYXkudmlld1RvKVxuICAgIHsgY20uc3RhdGUuaGlnaGxpZ2h0LnNldCh0aW1lLCBiaW5kKGhpZ2hsaWdodFdvcmtlciwgY20pKTsgfVxufVxuXG5mdW5jdGlvbiBoaWdobGlnaHRXb3JrZXIoY20pIHtcbiAgdmFyIGRvYyA9IGNtLmRvYztcbiAgaWYgKGRvYy5oaWdobGlnaHRGcm9udGllciA+PSBjbS5kaXNwbGF5LnZpZXdUbykgeyByZXR1cm4gfVxuICB2YXIgZW5kID0gK25ldyBEYXRlICsgY20ub3B0aW9ucy53b3JrVGltZTtcbiAgdmFyIGNvbnRleHQgPSBnZXRDb250ZXh0QmVmb3JlKGNtLCBkb2MuaGlnaGxpZ2h0RnJvbnRpZXIpO1xuICB2YXIgY2hhbmdlZExpbmVzID0gW107XG5cbiAgZG9jLml0ZXIoY29udGV4dC5saW5lLCBNYXRoLm1pbihkb2MuZmlyc3QgKyBkb2Muc2l6ZSwgY20uZGlzcGxheS52aWV3VG8gKyA1MDApLCBmdW5jdGlvbiAobGluZSkge1xuICAgIGlmIChjb250ZXh0LmxpbmUgPj0gY20uZGlzcGxheS52aWV3RnJvbSkgeyAvLyBWaXNpYmxlXG4gICAgICB2YXIgb2xkU3R5bGVzID0gbGluZS5zdHlsZXM7XG4gICAgICB2YXIgcmVzZXRTdGF0ZSA9IGxpbmUudGV4dC5sZW5ndGggPiBjbS5vcHRpb25zLm1heEhpZ2hsaWdodExlbmd0aCA/IGNvcHlTdGF0ZShkb2MubW9kZSwgY29udGV4dC5zdGF0ZSkgOiBudWxsO1xuICAgICAgdmFyIGhpZ2hsaWdodGVkID0gaGlnaGxpZ2h0TGluZShjbSwgbGluZSwgY29udGV4dCwgdHJ1ZSk7XG4gICAgICBpZiAocmVzZXRTdGF0ZSkgeyBjb250ZXh0LnN0YXRlID0gcmVzZXRTdGF0ZTsgfVxuICAgICAgbGluZS5zdHlsZXMgPSBoaWdobGlnaHRlZC5zdHlsZXM7XG4gICAgICB2YXIgb2xkQ2xzID0gbGluZS5zdHlsZUNsYXNzZXMsIG5ld0NscyA9IGhpZ2hsaWdodGVkLmNsYXNzZXM7XG4gICAgICBpZiAobmV3Q2xzKSB7IGxpbmUuc3R5bGVDbGFzc2VzID0gbmV3Q2xzOyB9XG4gICAgICBlbHNlIGlmIChvbGRDbHMpIHsgbGluZS5zdHlsZUNsYXNzZXMgPSBudWxsOyB9XG4gICAgICB2YXIgaXNjaGFuZ2UgPSAhb2xkU3R5bGVzIHx8IG9sZFN0eWxlcy5sZW5ndGggIT0gbGluZS5zdHlsZXMubGVuZ3RoIHx8XG4gICAgICAgIG9sZENscyAhPSBuZXdDbHMgJiYgKCFvbGRDbHMgfHwgIW5ld0NscyB8fCBvbGRDbHMuYmdDbGFzcyAhPSBuZXdDbHMuYmdDbGFzcyB8fCBvbGRDbHMudGV4dENsYXNzICE9IG5ld0Nscy50ZXh0Q2xhc3MpO1xuICAgICAgZm9yICh2YXIgaSA9IDA7ICFpc2NoYW5nZSAmJiBpIDwgb2xkU3R5bGVzLmxlbmd0aDsgKytpKSB7IGlzY2hhbmdlID0gb2xkU3R5bGVzW2ldICE9IGxpbmUuc3R5bGVzW2ldOyB9XG4gICAgICBpZiAoaXNjaGFuZ2UpIHsgY2hhbmdlZExpbmVzLnB1c2goY29udGV4dC5saW5lKTsgfVxuICAgICAgbGluZS5zdGF0ZUFmdGVyID0gY29udGV4dC5zYXZlKCk7XG4gICAgICBjb250ZXh0Lm5leHRMaW5lKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmIChsaW5lLnRleHQubGVuZ3RoIDw9IGNtLm9wdGlvbnMubWF4SGlnaGxpZ2h0TGVuZ3RoKVxuICAgICAgICB7IHByb2Nlc3NMaW5lKGNtLCBsaW5lLnRleHQsIGNvbnRleHQpOyB9XG4gICAgICBsaW5lLnN0YXRlQWZ0ZXIgPSBjb250ZXh0LmxpbmUgJSA1ID09IDAgPyBjb250ZXh0LnNhdmUoKSA6IG51bGw7XG4gICAgICBjb250ZXh0Lm5leHRMaW5lKCk7XG4gICAgfVxuICAgIGlmICgrbmV3IERhdGUgPiBlbmQpIHtcbiAgICAgIHN0YXJ0V29ya2VyKGNtLCBjbS5vcHRpb25zLndvcmtEZWxheSk7XG4gICAgICByZXR1cm4gdHJ1ZVxuICAgIH1cbiAgfSk7XG4gIGRvYy5oaWdobGlnaHRGcm9udGllciA9IGNvbnRleHQubGluZTtcbiAgZG9jLm1vZGVGcm9udGllciA9IE1hdGgubWF4KGRvYy5tb2RlRnJvbnRpZXIsIGNvbnRleHQubGluZSk7XG4gIGlmIChjaGFuZ2VkTGluZXMubGVuZ3RoKSB7IHJ1bkluT3AoY20sIGZ1bmN0aW9uICgpIHtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGNoYW5nZWRMaW5lcy5sZW5ndGg7IGkrKylcbiAgICAgIHsgcmVnTGluZUNoYW5nZShjbSwgY2hhbmdlZExpbmVzW2ldLCBcInRleHRcIik7IH1cbiAgfSk7IH1cbn1cblxuLy8gRElTUExBWSBEUkFXSU5HXG5cbnZhciBEaXNwbGF5VXBkYXRlID0gZnVuY3Rpb24oY20sIHZpZXdwb3J0LCBmb3JjZSkge1xuICB2YXIgZGlzcGxheSA9IGNtLmRpc3BsYXk7XG5cbiAgdGhpcy52aWV3cG9ydCA9IHZpZXdwb3J0O1xuICAvLyBTdG9yZSBzb21lIHZhbHVlcyB0aGF0IHdlJ2xsIG5lZWQgbGF0ZXIgKGJ1dCBkb24ndCB3YW50IHRvIGZvcmNlIGEgcmVsYXlvdXQgZm9yKVxuICB0aGlzLnZpc2libGUgPSB2aXNpYmxlTGluZXMoZGlzcGxheSwgY20uZG9jLCB2aWV3cG9ydCk7XG4gIHRoaXMuZWRpdG9ySXNIaWRkZW4gPSAhZGlzcGxheS53cmFwcGVyLm9mZnNldFdpZHRoO1xuICB0aGlzLndyYXBwZXJIZWlnaHQgPSBkaXNwbGF5LndyYXBwZXIuY2xpZW50SGVpZ2h0O1xuICB0aGlzLndyYXBwZXJXaWR0aCA9IGRpc3BsYXkud3JhcHBlci5jbGllbnRXaWR0aDtcbiAgdGhpcy5vbGREaXNwbGF5V2lkdGggPSBkaXNwbGF5V2lkdGgoY20pO1xuICB0aGlzLmZvcmNlID0gZm9yY2U7XG4gIHRoaXMuZGltcyA9IGdldERpbWVuc2lvbnMoY20pO1xuICB0aGlzLmV2ZW50cyA9IFtdO1xufTtcblxuRGlzcGxheVVwZGF0ZS5wcm90b3R5cGUuc2lnbmFsID0gZnVuY3Rpb24gKGVtaXR0ZXIsIHR5cGUpIHtcbiAgaWYgKGhhc0hhbmRsZXIoZW1pdHRlciwgdHlwZSkpXG4gICAgeyB0aGlzLmV2ZW50cy5wdXNoKGFyZ3VtZW50cyk7IH1cbn07XG5EaXNwbGF5VXBkYXRlLnByb3RvdHlwZS5maW5pc2ggPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHRoaXMkMSA9IHRoaXM7XG5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLmV2ZW50cy5sZW5ndGg7IGkrKylcbiAgICB7IHNpZ25hbC5hcHBseShudWxsLCB0aGlzJDEuZXZlbnRzW2ldKTsgfVxufTtcblxuZnVuY3Rpb24gbWF5YmVDbGlwU2Nyb2xsYmFycyhjbSkge1xuICB2YXIgZGlzcGxheSA9IGNtLmRpc3BsYXk7XG4gIGlmICghZGlzcGxheS5zY3JvbGxiYXJzQ2xpcHBlZCAmJiBkaXNwbGF5LnNjcm9sbGVyLm9mZnNldFdpZHRoKSB7XG4gICAgZGlzcGxheS5uYXRpdmVCYXJXaWR0aCA9IGRpc3BsYXkuc2Nyb2xsZXIub2Zmc2V0V2lkdGggLSBkaXNwbGF5LnNjcm9sbGVyLmNsaWVudFdpZHRoO1xuICAgIGRpc3BsYXkuaGVpZ2h0Rm9yY2VyLnN0eWxlLmhlaWdodCA9IHNjcm9sbEdhcChjbSkgKyBcInB4XCI7XG4gICAgZGlzcGxheS5zaXplci5zdHlsZS5tYXJnaW5Cb3R0b20gPSAtZGlzcGxheS5uYXRpdmVCYXJXaWR0aCArIFwicHhcIjtcbiAgICBkaXNwbGF5LnNpemVyLnN0eWxlLmJvcmRlclJpZ2h0V2lkdGggPSBzY3JvbGxHYXAoY20pICsgXCJweFwiO1xuICAgIGRpc3BsYXkuc2Nyb2xsYmFyc0NsaXBwZWQgPSB0cnVlO1xuICB9XG59XG5cbmZ1bmN0aW9uIHNlbGVjdGlvblNuYXBzaG90KGNtKSB7XG4gIGlmIChjbS5oYXNGb2N1cygpKSB7IHJldHVybiBudWxsIH1cbiAgdmFyIGFjdGl2ZSA9IGFjdGl2ZUVsdCgpO1xuICBpZiAoIWFjdGl2ZSB8fCAhY29udGFpbnMoY20uZGlzcGxheS5saW5lRGl2LCBhY3RpdmUpKSB7IHJldHVybiBudWxsIH1cbiAgdmFyIHJlc3VsdCA9IHthY3RpdmVFbHQ6IGFjdGl2ZX07XG4gIGlmICh3aW5kb3cuZ2V0U2VsZWN0aW9uKSB7XG4gICAgdmFyIHNlbCA9IHdpbmRvdy5nZXRTZWxlY3Rpb24oKTtcbiAgICBpZiAoc2VsLmFuY2hvck5vZGUgJiYgc2VsLmV4dGVuZCAmJiBjb250YWlucyhjbS5kaXNwbGF5LmxpbmVEaXYsIHNlbC5hbmNob3JOb2RlKSkge1xuICAgICAgcmVzdWx0LmFuY2hvck5vZGUgPSBzZWwuYW5jaG9yTm9kZTtcbiAgICAgIHJlc3VsdC5hbmNob3JPZmZzZXQgPSBzZWwuYW5jaG9yT2Zmc2V0O1xuICAgICAgcmVzdWx0LmZvY3VzTm9kZSA9IHNlbC5mb2N1c05vZGU7XG4gICAgICByZXN1bHQuZm9jdXNPZmZzZXQgPSBzZWwuZm9jdXNPZmZzZXQ7XG4gICAgfVxuICB9XG4gIHJldHVybiByZXN1bHRcbn1cblxuZnVuY3Rpb24gcmVzdG9yZVNlbGVjdGlvbihzbmFwc2hvdCkge1xuICBpZiAoIXNuYXBzaG90IHx8ICFzbmFwc2hvdC5hY3RpdmVFbHQgfHwgc25hcHNob3QuYWN0aXZlRWx0ID09IGFjdGl2ZUVsdCgpKSB7IHJldHVybiB9XG4gIHNuYXBzaG90LmFjdGl2ZUVsdC5mb2N1cygpO1xuICBpZiAoc25hcHNob3QuYW5jaG9yTm9kZSAmJiBjb250YWlucyhkb2N1bWVudC5ib2R5LCBzbmFwc2hvdC5hbmNob3JOb2RlKSAmJiBjb250YWlucyhkb2N1bWVudC5ib2R5LCBzbmFwc2hvdC5mb2N1c05vZGUpKSB7XG4gICAgdmFyIHNlbCA9IHdpbmRvdy5nZXRTZWxlY3Rpb24oKSwgcmFuZ2UkJDEgPSBkb2N1bWVudC5jcmVhdGVSYW5nZSgpO1xuICAgIHJhbmdlJCQxLnNldEVuZChzbmFwc2hvdC5hbmNob3JOb2RlLCBzbmFwc2hvdC5hbmNob3JPZmZzZXQpO1xuICAgIHJhbmdlJCQxLmNvbGxhcHNlKGZhbHNlKTtcbiAgICBzZWwucmVtb3ZlQWxsUmFuZ2VzKCk7XG4gICAgc2VsLmFkZFJhbmdlKHJhbmdlJCQxKTtcbiAgICBzZWwuZXh0ZW5kKHNuYXBzaG90LmZvY3VzTm9kZSwgc25hcHNob3QuZm9jdXNPZmZzZXQpO1xuICB9XG59XG5cbi8vIERvZXMgdGhlIGFjdHVhbCB1cGRhdGluZyBvZiB0aGUgbGluZSBkaXNwbGF5LiBCYWlscyBvdXRcbi8vIChyZXR1cm5pbmcgZmFsc2UpIHdoZW4gdGhlcmUgaXMgbm90aGluZyB0byBiZSBkb25lIGFuZCBmb3JjZWQgaXNcbi8vIGZhbHNlLlxuZnVuY3Rpb24gdXBkYXRlRGlzcGxheUlmTmVlZGVkKGNtLCB1cGRhdGUpIHtcbiAgdmFyIGRpc3BsYXkgPSBjbS5kaXNwbGF5LCBkb2MgPSBjbS5kb2M7XG5cbiAgaWYgKHVwZGF0ZS5lZGl0b3JJc0hpZGRlbikge1xuICAgIHJlc2V0VmlldyhjbSk7XG4gICAgcmV0dXJuIGZhbHNlXG4gIH1cblxuICAvLyBCYWlsIG91dCBpZiB0aGUgdmlzaWJsZSBhcmVhIGlzIGFscmVhZHkgcmVuZGVyZWQgYW5kIG5vdGhpbmcgY2hhbmdlZC5cbiAgaWYgKCF1cGRhdGUuZm9yY2UgJiZcbiAgICAgIHVwZGF0ZS52aXNpYmxlLmZyb20gPj0gZGlzcGxheS52aWV3RnJvbSAmJiB1cGRhdGUudmlzaWJsZS50byA8PSBkaXNwbGF5LnZpZXdUbyAmJlxuICAgICAgKGRpc3BsYXkudXBkYXRlTGluZU51bWJlcnMgPT0gbnVsbCB8fCBkaXNwbGF5LnVwZGF0ZUxpbmVOdW1iZXJzID49IGRpc3BsYXkudmlld1RvKSAmJlxuICAgICAgZGlzcGxheS5yZW5kZXJlZFZpZXcgPT0gZGlzcGxheS52aWV3ICYmIGNvdW50RGlydHlWaWV3KGNtKSA9PSAwKVxuICAgIHsgcmV0dXJuIGZhbHNlIH1cblxuICBpZiAobWF5YmVVcGRhdGVMaW5lTnVtYmVyV2lkdGgoY20pKSB7XG4gICAgcmVzZXRWaWV3KGNtKTtcbiAgICB1cGRhdGUuZGltcyA9IGdldERpbWVuc2lvbnMoY20pO1xuICB9XG5cbiAgLy8gQ29tcHV0ZSBhIHN1aXRhYmxlIG5ldyB2aWV3cG9ydCAoZnJvbSAmIHRvKVxuICB2YXIgZW5kID0gZG9jLmZpcnN0ICsgZG9jLnNpemU7XG4gIHZhciBmcm9tID0gTWF0aC5tYXgodXBkYXRlLnZpc2libGUuZnJvbSAtIGNtLm9wdGlvbnMudmlld3BvcnRNYXJnaW4sIGRvYy5maXJzdCk7XG4gIHZhciB0byA9IE1hdGgubWluKGVuZCwgdXBkYXRlLnZpc2libGUudG8gKyBjbS5vcHRpb25zLnZpZXdwb3J0TWFyZ2luKTtcbiAgaWYgKGRpc3BsYXkudmlld0Zyb20gPCBmcm9tICYmIGZyb20gLSBkaXNwbGF5LnZpZXdGcm9tIDwgMjApIHsgZnJvbSA9IE1hdGgubWF4KGRvYy5maXJzdCwgZGlzcGxheS52aWV3RnJvbSk7IH1cbiAgaWYgKGRpc3BsYXkudmlld1RvID4gdG8gJiYgZGlzcGxheS52aWV3VG8gLSB0byA8IDIwKSB7IHRvID0gTWF0aC5taW4oZW5kLCBkaXNwbGF5LnZpZXdUbyk7IH1cbiAgaWYgKHNhd0NvbGxhcHNlZFNwYW5zKSB7XG4gICAgZnJvbSA9IHZpc3VhbExpbmVObyhjbS5kb2MsIGZyb20pO1xuICAgIHRvID0gdmlzdWFsTGluZUVuZE5vKGNtLmRvYywgdG8pO1xuICB9XG5cbiAgdmFyIGRpZmZlcmVudCA9IGZyb20gIT0gZGlzcGxheS52aWV3RnJvbSB8fCB0byAhPSBkaXNwbGF5LnZpZXdUbyB8fFxuICAgIGRpc3BsYXkubGFzdFdyYXBIZWlnaHQgIT0gdXBkYXRlLndyYXBwZXJIZWlnaHQgfHwgZGlzcGxheS5sYXN0V3JhcFdpZHRoICE9IHVwZGF0ZS53cmFwcGVyV2lkdGg7XG4gIGFkanVzdFZpZXcoY20sIGZyb20sIHRvKTtcblxuICBkaXNwbGF5LnZpZXdPZmZzZXQgPSBoZWlnaHRBdExpbmUoZ2V0TGluZShjbS5kb2MsIGRpc3BsYXkudmlld0Zyb20pKTtcbiAgLy8gUG9zaXRpb24gdGhlIG1vdmVyIGRpdiB0byBhbGlnbiB3aXRoIHRoZSBjdXJyZW50IHNjcm9sbCBwb3NpdGlvblxuICBjbS5kaXNwbGF5Lm1vdmVyLnN0eWxlLnRvcCA9IGRpc3BsYXkudmlld09mZnNldCArIFwicHhcIjtcblxuICB2YXIgdG9VcGRhdGUgPSBjb3VudERpcnR5VmlldyhjbSk7XG4gIGlmICghZGlmZmVyZW50ICYmIHRvVXBkYXRlID09IDAgJiYgIXVwZGF0ZS5mb3JjZSAmJiBkaXNwbGF5LnJlbmRlcmVkVmlldyA9PSBkaXNwbGF5LnZpZXcgJiZcbiAgICAgIChkaXNwbGF5LnVwZGF0ZUxpbmVOdW1iZXJzID09IG51bGwgfHwgZGlzcGxheS51cGRhdGVMaW5lTnVtYmVycyA+PSBkaXNwbGF5LnZpZXdUbykpXG4gICAgeyByZXR1cm4gZmFsc2UgfVxuXG4gIC8vIEZvciBiaWcgY2hhbmdlcywgd2UgaGlkZSB0aGUgZW5jbG9zaW5nIGVsZW1lbnQgZHVyaW5nIHRoZVxuICAvLyB1cGRhdGUsIHNpbmNlIHRoYXQgc3BlZWRzIHVwIHRoZSBvcGVyYXRpb25zIG9uIG1vc3QgYnJvd3NlcnMuXG4gIHZhciBzZWxTbmFwc2hvdCA9IHNlbGVjdGlvblNuYXBzaG90KGNtKTtcbiAgaWYgKHRvVXBkYXRlID4gNCkgeyBkaXNwbGF5LmxpbmVEaXYuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiOyB9XG4gIHBhdGNoRGlzcGxheShjbSwgZGlzcGxheS51cGRhdGVMaW5lTnVtYmVycywgdXBkYXRlLmRpbXMpO1xuICBpZiAodG9VcGRhdGUgPiA0KSB7IGRpc3BsYXkubGluZURpdi5zdHlsZS5kaXNwbGF5ID0gXCJcIjsgfVxuICBkaXNwbGF5LnJlbmRlcmVkVmlldyA9IGRpc3BsYXkudmlldztcbiAgLy8gVGhlcmUgbWlnaHQgaGF2ZSBiZWVuIGEgd2lkZ2V0IHdpdGggYSBmb2N1c2VkIGVsZW1lbnQgdGhhdCBnb3RcbiAgLy8gaGlkZGVuIG9yIHVwZGF0ZWQsIGlmIHNvIHJlLWZvY3VzIGl0LlxuICByZXN0b3JlU2VsZWN0aW9uKHNlbFNuYXBzaG90KTtcblxuICAvLyBQcmV2ZW50IHNlbGVjdGlvbiBhbmQgY3Vyc29ycyBmcm9tIGludGVyZmVyaW5nIHdpdGggdGhlIHNjcm9sbFxuICAvLyB3aWR0aCBhbmQgaGVpZ2h0LlxuICByZW1vdmVDaGlsZHJlbihkaXNwbGF5LmN1cnNvckRpdik7XG4gIHJlbW92ZUNoaWxkcmVuKGRpc3BsYXkuc2VsZWN0aW9uRGl2KTtcbiAgZGlzcGxheS5ndXR0ZXJzLnN0eWxlLmhlaWdodCA9IGRpc3BsYXkuc2l6ZXIuc3R5bGUubWluSGVpZ2h0ID0gMDtcblxuICBpZiAoZGlmZmVyZW50KSB7XG4gICAgZGlzcGxheS5sYXN0V3JhcEhlaWdodCA9IHVwZGF0ZS53cmFwcGVySGVpZ2h0O1xuICAgIGRpc3BsYXkubGFzdFdyYXBXaWR0aCA9IHVwZGF0ZS53cmFwcGVyV2lkdGg7XG4gICAgc3RhcnRXb3JrZXIoY20sIDQwMCk7XG4gIH1cblxuICBkaXNwbGF5LnVwZGF0ZUxpbmVOdW1iZXJzID0gbnVsbDtcblxuICByZXR1cm4gdHJ1ZVxufVxuXG5mdW5jdGlvbiBwb3N0VXBkYXRlRGlzcGxheShjbSwgdXBkYXRlKSB7XG4gIHZhciB2aWV3cG9ydCA9IHVwZGF0ZS52aWV3cG9ydDtcblxuICBmb3IgKHZhciBmaXJzdCA9IHRydWU7OyBmaXJzdCA9IGZhbHNlKSB7XG4gICAgaWYgKCFmaXJzdCB8fCAhY20ub3B0aW9ucy5saW5lV3JhcHBpbmcgfHwgdXBkYXRlLm9sZERpc3BsYXlXaWR0aCA9PSBkaXNwbGF5V2lkdGgoY20pKSB7XG4gICAgICAvLyBDbGlwIGZvcmNlZCB2aWV3cG9ydCB0byBhY3R1YWwgc2Nyb2xsYWJsZSBhcmVhLlxuICAgICAgaWYgKHZpZXdwb3J0ICYmIHZpZXdwb3J0LnRvcCAhPSBudWxsKVxuICAgICAgICB7IHZpZXdwb3J0ID0ge3RvcDogTWF0aC5taW4oY20uZG9jLmhlaWdodCArIHBhZGRpbmdWZXJ0KGNtLmRpc3BsYXkpIC0gZGlzcGxheUhlaWdodChjbSksIHZpZXdwb3J0LnRvcCl9OyB9XG4gICAgICAvLyBVcGRhdGVkIGxpbmUgaGVpZ2h0cyBtaWdodCByZXN1bHQgaW4gdGhlIGRyYXduIGFyZWEgbm90XG4gICAgICAvLyBhY3R1YWxseSBjb3ZlcmluZyB0aGUgdmlld3BvcnQuIEtlZXAgbG9vcGluZyB1bnRpbCBpdCBkb2VzLlxuICAgICAgdXBkYXRlLnZpc2libGUgPSB2aXNpYmxlTGluZXMoY20uZGlzcGxheSwgY20uZG9jLCB2aWV3cG9ydCk7XG4gICAgICBpZiAodXBkYXRlLnZpc2libGUuZnJvbSA+PSBjbS5kaXNwbGF5LnZpZXdGcm9tICYmIHVwZGF0ZS52aXNpYmxlLnRvIDw9IGNtLmRpc3BsYXkudmlld1RvKVxuICAgICAgICB7IGJyZWFrIH1cbiAgICB9XG4gICAgaWYgKCF1cGRhdGVEaXNwbGF5SWZOZWVkZWQoY20sIHVwZGF0ZSkpIHsgYnJlYWsgfVxuICAgIHVwZGF0ZUhlaWdodHNJblZpZXdwb3J0KGNtKTtcbiAgICB2YXIgYmFyTWVhc3VyZSA9IG1lYXN1cmVGb3JTY3JvbGxiYXJzKGNtKTtcbiAgICB1cGRhdGVTZWxlY3Rpb24oY20pO1xuICAgIHVwZGF0ZVNjcm9sbGJhcnMoY20sIGJhck1lYXN1cmUpO1xuICAgIHNldERvY3VtZW50SGVpZ2h0KGNtLCBiYXJNZWFzdXJlKTtcbiAgICB1cGRhdGUuZm9yY2UgPSBmYWxzZTtcbiAgfVxuXG4gIHVwZGF0ZS5zaWduYWwoY20sIFwidXBkYXRlXCIsIGNtKTtcbiAgaWYgKGNtLmRpc3BsYXkudmlld0Zyb20gIT0gY20uZGlzcGxheS5yZXBvcnRlZFZpZXdGcm9tIHx8IGNtLmRpc3BsYXkudmlld1RvICE9IGNtLmRpc3BsYXkucmVwb3J0ZWRWaWV3VG8pIHtcbiAgICB1cGRhdGUuc2lnbmFsKGNtLCBcInZpZXdwb3J0Q2hhbmdlXCIsIGNtLCBjbS5kaXNwbGF5LnZpZXdGcm9tLCBjbS5kaXNwbGF5LnZpZXdUbyk7XG4gICAgY20uZGlzcGxheS5yZXBvcnRlZFZpZXdGcm9tID0gY20uZGlzcGxheS52aWV3RnJvbTsgY20uZGlzcGxheS5yZXBvcnRlZFZpZXdUbyA9IGNtLmRpc3BsYXkudmlld1RvO1xuICB9XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZURpc3BsYXlTaW1wbGUoY20sIHZpZXdwb3J0KSB7XG4gIHZhciB1cGRhdGUgPSBuZXcgRGlzcGxheVVwZGF0ZShjbSwgdmlld3BvcnQpO1xuICBpZiAodXBkYXRlRGlzcGxheUlmTmVlZGVkKGNtLCB1cGRhdGUpKSB7XG4gICAgdXBkYXRlSGVpZ2h0c0luVmlld3BvcnQoY20pO1xuICAgIHBvc3RVcGRhdGVEaXNwbGF5KGNtLCB1cGRhdGUpO1xuICAgIHZhciBiYXJNZWFzdXJlID0gbWVhc3VyZUZvclNjcm9sbGJhcnMoY20pO1xuICAgIHVwZGF0ZVNlbGVjdGlvbihjbSk7XG4gICAgdXBkYXRlU2Nyb2xsYmFycyhjbSwgYmFyTWVhc3VyZSk7XG4gICAgc2V0RG9jdW1lbnRIZWlnaHQoY20sIGJhck1lYXN1cmUpO1xuICAgIHVwZGF0ZS5maW5pc2goKTtcbiAgfVxufVxuXG4vLyBTeW5jIHRoZSBhY3R1YWwgZGlzcGxheSBET00gc3RydWN0dXJlIHdpdGggZGlzcGxheS52aWV3LCByZW1vdmluZ1xuLy8gbm9kZXMgZm9yIGxpbmVzIHRoYXQgYXJlIG5vIGxvbmdlciBpbiB2aWV3LCBhbmQgY3JlYXRpbmcgdGhlIG9uZXNcbi8vIHRoYXQgYXJlIG5vdCB0aGVyZSB5ZXQsIGFuZCB1cGRhdGluZyB0aGUgb25lcyB0aGF0IGFyZSBvdXQgb2Zcbi8vIGRhdGUuXG5mdW5jdGlvbiBwYXRjaERpc3BsYXkoY20sIHVwZGF0ZU51bWJlcnNGcm9tLCBkaW1zKSB7XG4gIHZhciBkaXNwbGF5ID0gY20uZGlzcGxheSwgbGluZU51bWJlcnMgPSBjbS5vcHRpb25zLmxpbmVOdW1iZXJzO1xuICB2YXIgY29udGFpbmVyID0gZGlzcGxheS5saW5lRGl2LCBjdXIgPSBjb250YWluZXIuZmlyc3RDaGlsZDtcblxuICBmdW5jdGlvbiBybShub2RlKSB7XG4gICAgdmFyIG5leHQgPSBub2RlLm5leHRTaWJsaW5nO1xuICAgIC8vIFdvcmtzIGFyb3VuZCBhIHRocm93LXNjcm9sbCBidWcgaW4gT1MgWCBXZWJraXRcbiAgICBpZiAod2Via2l0ICYmIG1hYyAmJiBjbS5kaXNwbGF5LmN1cnJlbnRXaGVlbFRhcmdldCA9PSBub2RlKVxuICAgICAgeyBub2RlLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjsgfVxuICAgIGVsc2VcbiAgICAgIHsgbm9kZS5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKG5vZGUpOyB9XG4gICAgcmV0dXJuIG5leHRcbiAgfVxuXG4gIHZhciB2aWV3ID0gZGlzcGxheS52aWV3LCBsaW5lTiA9IGRpc3BsYXkudmlld0Zyb207XG4gIC8vIExvb3Agb3ZlciB0aGUgZWxlbWVudHMgaW4gdGhlIHZpZXcsIHN5bmNpbmcgY3VyICh0aGUgRE9NIG5vZGVzXG4gIC8vIGluIGRpc3BsYXkubGluZURpdikgd2l0aCB0aGUgdmlldyBhcyB3ZSBnby5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCB2aWV3Lmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIGxpbmVWaWV3ID0gdmlld1tpXTtcbiAgICBpZiAobGluZVZpZXcuaGlkZGVuKSB7XG4gICAgfSBlbHNlIGlmICghbGluZVZpZXcubm9kZSB8fCBsaW5lVmlldy5ub2RlLnBhcmVudE5vZGUgIT0gY29udGFpbmVyKSB7IC8vIE5vdCBkcmF3biB5ZXRcbiAgICAgIHZhciBub2RlID0gYnVpbGRMaW5lRWxlbWVudChjbSwgbGluZVZpZXcsIGxpbmVOLCBkaW1zKTtcbiAgICAgIGNvbnRhaW5lci5pbnNlcnRCZWZvcmUobm9kZSwgY3VyKTtcbiAgICB9IGVsc2UgeyAvLyBBbHJlYWR5IGRyYXduXG4gICAgICB3aGlsZSAoY3VyICE9IGxpbmVWaWV3Lm5vZGUpIHsgY3VyID0gcm0oY3VyKTsgfVxuICAgICAgdmFyIHVwZGF0ZU51bWJlciA9IGxpbmVOdW1iZXJzICYmIHVwZGF0ZU51bWJlcnNGcm9tICE9IG51bGwgJiZcbiAgICAgICAgdXBkYXRlTnVtYmVyc0Zyb20gPD0gbGluZU4gJiYgbGluZVZpZXcubGluZU51bWJlcjtcbiAgICAgIGlmIChsaW5lVmlldy5jaGFuZ2VzKSB7XG4gICAgICAgIGlmIChpbmRleE9mKGxpbmVWaWV3LmNoYW5nZXMsIFwiZ3V0dGVyXCIpID4gLTEpIHsgdXBkYXRlTnVtYmVyID0gZmFsc2U7IH1cbiAgICAgICAgdXBkYXRlTGluZUZvckNoYW5nZXMoY20sIGxpbmVWaWV3LCBsaW5lTiwgZGltcyk7XG4gICAgICB9XG4gICAgICBpZiAodXBkYXRlTnVtYmVyKSB7XG4gICAgICAgIHJlbW92ZUNoaWxkcmVuKGxpbmVWaWV3LmxpbmVOdW1iZXIpO1xuICAgICAgICBsaW5lVmlldy5saW5lTnVtYmVyLmFwcGVuZENoaWxkKGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKGxpbmVOdW1iZXJGb3IoY20ub3B0aW9ucywgbGluZU4pKSk7XG4gICAgICB9XG4gICAgICBjdXIgPSBsaW5lVmlldy5ub2RlLm5leHRTaWJsaW5nO1xuICAgIH1cbiAgICBsaW5lTiArPSBsaW5lVmlldy5zaXplO1xuICB9XG4gIHdoaWxlIChjdXIpIHsgY3VyID0gcm0oY3VyKTsgfVxufVxuXG5mdW5jdGlvbiB1cGRhdGVHdXR0ZXJTcGFjZShjbSkge1xuICB2YXIgd2lkdGggPSBjbS5kaXNwbGF5Lmd1dHRlcnMub2Zmc2V0V2lkdGg7XG4gIGNtLmRpc3BsYXkuc2l6ZXIuc3R5bGUubWFyZ2luTGVmdCA9IHdpZHRoICsgXCJweFwiO1xufVxuXG5mdW5jdGlvbiBzZXREb2N1bWVudEhlaWdodChjbSwgbWVhc3VyZSkge1xuICBjbS5kaXNwbGF5LnNpemVyLnN0eWxlLm1pbkhlaWdodCA9IG1lYXN1cmUuZG9jSGVpZ2h0ICsgXCJweFwiO1xuICBjbS5kaXNwbGF5LmhlaWdodEZvcmNlci5zdHlsZS50b3AgPSBtZWFzdXJlLmRvY0hlaWdodCArIFwicHhcIjtcbiAgY20uZGlzcGxheS5ndXR0ZXJzLnN0eWxlLmhlaWdodCA9IChtZWFzdXJlLmRvY0hlaWdodCArIGNtLmRpc3BsYXkuYmFySGVpZ2h0ICsgc2Nyb2xsR2FwKGNtKSkgKyBcInB4XCI7XG59XG5cbi8vIFJlYnVpbGQgdGhlIGd1dHRlciBlbGVtZW50cywgZW5zdXJlIHRoZSBtYXJnaW4gdG8gdGhlIGxlZnQgb2YgdGhlXG4vLyBjb2RlIG1hdGNoZXMgdGhlaXIgd2lkdGguXG5mdW5jdGlvbiB1cGRhdGVHdXR0ZXJzKGNtKSB7XG4gIHZhciBndXR0ZXJzID0gY20uZGlzcGxheS5ndXR0ZXJzLCBzcGVjcyA9IGNtLm9wdGlvbnMuZ3V0dGVycztcbiAgcmVtb3ZlQ2hpbGRyZW4oZ3V0dGVycyk7XG4gIHZhciBpID0gMDtcbiAgZm9yICg7IGkgPCBzcGVjcy5sZW5ndGg7ICsraSkge1xuICAgIHZhciBndXR0ZXJDbGFzcyA9IHNwZWNzW2ldO1xuICAgIHZhciBnRWx0ID0gZ3V0dGVycy5hcHBlbmRDaGlsZChlbHQoXCJkaXZcIiwgbnVsbCwgXCJDb2RlTWlycm9yLWd1dHRlciBcIiArIGd1dHRlckNsYXNzKSk7XG4gICAgaWYgKGd1dHRlckNsYXNzID09IFwiQ29kZU1pcnJvci1saW5lbnVtYmVyc1wiKSB7XG4gICAgICBjbS5kaXNwbGF5LmxpbmVHdXR0ZXIgPSBnRWx0O1xuICAgICAgZ0VsdC5zdHlsZS53aWR0aCA9IChjbS5kaXNwbGF5LmxpbmVOdW1XaWR0aCB8fCAxKSArIFwicHhcIjtcbiAgICB9XG4gIH1cbiAgZ3V0dGVycy5zdHlsZS5kaXNwbGF5ID0gaSA/IFwiXCIgOiBcIm5vbmVcIjtcbiAgdXBkYXRlR3V0dGVyU3BhY2UoY20pO1xufVxuXG4vLyBNYWtlIHN1cmUgdGhlIGd1dHRlcnMgb3B0aW9ucyBjb250YWlucyB0aGUgZWxlbWVudFxuLy8gXCJDb2RlTWlycm9yLWxpbmVudW1iZXJzXCIgd2hlbiB0aGUgbGluZU51bWJlcnMgb3B0aW9uIGlzIHRydWUuXG5mdW5jdGlvbiBzZXRHdXR0ZXJzRm9yTGluZU51bWJlcnMob3B0aW9ucykge1xuICB2YXIgZm91bmQgPSBpbmRleE9mKG9wdGlvbnMuZ3V0dGVycywgXCJDb2RlTWlycm9yLWxpbmVudW1iZXJzXCIpO1xuICBpZiAoZm91bmQgPT0gLTEgJiYgb3B0aW9ucy5saW5lTnVtYmVycykge1xuICAgIG9wdGlvbnMuZ3V0dGVycyA9IG9wdGlvbnMuZ3V0dGVycy5jb25jYXQoW1wiQ29kZU1pcnJvci1saW5lbnVtYmVyc1wiXSk7XG4gIH0gZWxzZSBpZiAoZm91bmQgPiAtMSAmJiAhb3B0aW9ucy5saW5lTnVtYmVycykge1xuICAgIG9wdGlvbnMuZ3V0dGVycyA9IG9wdGlvbnMuZ3V0dGVycy5zbGljZSgwKTtcbiAgICBvcHRpb25zLmd1dHRlcnMuc3BsaWNlKGZvdW5kLCAxKTtcbiAgfVxufVxuXG4vLyBTaW5jZSB0aGUgZGVsdGEgdmFsdWVzIHJlcG9ydGVkIG9uIG1vdXNlIHdoZWVsIGV2ZW50cyBhcmVcbi8vIHVuc3RhbmRhcmRpemVkIGJldHdlZW4gYnJvd3NlcnMgYW5kIGV2ZW4gYnJvd3NlciB2ZXJzaW9ucywgYW5kXG4vLyBnZW5lcmFsbHkgaG9ycmlibHkgdW5wcmVkaWN0YWJsZSwgdGhpcyBjb2RlIHN0YXJ0cyBieSBtZWFzdXJpbmdcbi8vIHRoZSBzY3JvbGwgZWZmZWN0IHRoYXQgdGhlIGZpcnN0IGZldyBtb3VzZSB3aGVlbCBldmVudHMgaGF2ZSxcbi8vIGFuZCwgZnJvbSB0aGF0LCBkZXRlY3RzIHRoZSB3YXkgaXQgY2FuIGNvbnZlcnQgZGVsdGFzIHRvIHBpeGVsXG4vLyBvZmZzZXRzIGFmdGVyd2FyZHMuXG4vL1xuLy8gVGhlIHJlYXNvbiB3ZSB3YW50IHRvIGtub3cgdGhlIGFtb3VudCBhIHdoZWVsIGV2ZW50IHdpbGwgc2Nyb2xsXG4vLyBpcyB0aGF0IGl0IGdpdmVzIHVzIGEgY2hhbmNlIHRvIHVwZGF0ZSB0aGUgZGlzcGxheSBiZWZvcmUgdGhlXG4vLyBhY3R1YWwgc2Nyb2xsaW5nIGhhcHBlbnMsIHJlZHVjaW5nIGZsaWNrZXJpbmcuXG5cbnZhciB3aGVlbFNhbXBsZXMgPSAwO1xudmFyIHdoZWVsUGl4ZWxzUGVyVW5pdCA9IG51bGw7XG4vLyBGaWxsIGluIGEgYnJvd3Nlci1kZXRlY3RlZCBzdGFydGluZyB2YWx1ZSBvbiBicm93c2VycyB3aGVyZSB3ZVxuLy8ga25vdyBvbmUuIFRoZXNlIGRvbid0IGhhdmUgdG8gYmUgYWNjdXJhdGUgLS0gdGhlIHJlc3VsdCBvZiB0aGVtXG4vLyBiZWluZyB3cm9uZyB3b3VsZCBqdXN0IGJlIGEgc2xpZ2h0IGZsaWNrZXIgb24gdGhlIGZpcnN0IHdoZWVsXG4vLyBzY3JvbGwgKGlmIGl0IGlzIGxhcmdlIGVub3VnaCkuXG5pZiAoaWUpIHsgd2hlZWxQaXhlbHNQZXJVbml0ID0gLS41MzsgfVxuZWxzZSBpZiAoZ2Vja28pIHsgd2hlZWxQaXhlbHNQZXJVbml0ID0gMTU7IH1cbmVsc2UgaWYgKGNocm9tZSkgeyB3aGVlbFBpeGVsc1BlclVuaXQgPSAtLjc7IH1cbmVsc2UgaWYgKHNhZmFyaSkgeyB3aGVlbFBpeGVsc1BlclVuaXQgPSAtMS8zOyB9XG5cbmZ1bmN0aW9uIHdoZWVsRXZlbnREZWx0YShlKSB7XG4gIHZhciBkeCA9IGUud2hlZWxEZWx0YVgsIGR5ID0gZS53aGVlbERlbHRhWTtcbiAgaWYgKGR4ID09IG51bGwgJiYgZS5kZXRhaWwgJiYgZS5heGlzID09IGUuSE9SSVpPTlRBTF9BWElTKSB7IGR4ID0gZS5kZXRhaWw7IH1cbiAgaWYgKGR5ID09IG51bGwgJiYgZS5kZXRhaWwgJiYgZS5heGlzID09IGUuVkVSVElDQUxfQVhJUykgeyBkeSA9IGUuZGV0YWlsOyB9XG4gIGVsc2UgaWYgKGR5ID09IG51bGwpIHsgZHkgPSBlLndoZWVsRGVsdGE7IH1cbiAgcmV0dXJuIHt4OiBkeCwgeTogZHl9XG59XG5mdW5jdGlvbiB3aGVlbEV2ZW50UGl4ZWxzKGUpIHtcbiAgdmFyIGRlbHRhID0gd2hlZWxFdmVudERlbHRhKGUpO1xuICBkZWx0YS54ICo9IHdoZWVsUGl4ZWxzUGVyVW5pdDtcbiAgZGVsdGEueSAqPSB3aGVlbFBpeGVsc1BlclVuaXQ7XG4gIHJldHVybiBkZWx0YVxufVxuXG5mdW5jdGlvbiBvblNjcm9sbFdoZWVsKGNtLCBlKSB7XG4gIHZhciBkZWx0YSA9IHdoZWVsRXZlbnREZWx0YShlKSwgZHggPSBkZWx0YS54LCBkeSA9IGRlbHRhLnk7XG5cbiAgdmFyIGRpc3BsYXkgPSBjbS5kaXNwbGF5LCBzY3JvbGwgPSBkaXNwbGF5LnNjcm9sbGVyO1xuICAvLyBRdWl0IGlmIHRoZXJlJ3Mgbm90aGluZyB0byBzY3JvbGwgaGVyZVxuICB2YXIgY2FuU2Nyb2xsWCA9IHNjcm9sbC5zY3JvbGxXaWR0aCA+IHNjcm9sbC5jbGllbnRXaWR0aDtcbiAgdmFyIGNhblNjcm9sbFkgPSBzY3JvbGwuc2Nyb2xsSGVpZ2h0ID4gc2Nyb2xsLmNsaWVudEhlaWdodDtcbiAgaWYgKCEoZHggJiYgY2FuU2Nyb2xsWCB8fCBkeSAmJiBjYW5TY3JvbGxZKSkgeyByZXR1cm4gfVxuXG4gIC8vIFdlYmtpdCBicm93c2VycyBvbiBPUyBYIGFib3J0IG1vbWVudHVtIHNjcm9sbHMgd2hlbiB0aGUgdGFyZ2V0XG4gIC8vIG9mIHRoZSBzY3JvbGwgZXZlbnQgaXMgcmVtb3ZlZCBmcm9tIHRoZSBzY3JvbGxhYmxlIGVsZW1lbnQuXG4gIC8vIFRoaXMgaGFjayAoc2VlIHJlbGF0ZWQgY29kZSBpbiBwYXRjaERpc3BsYXkpIG1ha2VzIHN1cmUgdGhlXG4gIC8vIGVsZW1lbnQgaXMga2VwdCBhcm91bmQuXG4gIGlmIChkeSAmJiBtYWMgJiYgd2Via2l0KSB7XG4gICAgb3V0ZXI6IGZvciAodmFyIGN1ciA9IGUudGFyZ2V0LCB2aWV3ID0gZGlzcGxheS52aWV3OyBjdXIgIT0gc2Nyb2xsOyBjdXIgPSBjdXIucGFyZW50Tm9kZSkge1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB2aWV3Lmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmICh2aWV3W2ldLm5vZGUgPT0gY3VyKSB7XG4gICAgICAgICAgY20uZGlzcGxheS5jdXJyZW50V2hlZWxUYXJnZXQgPSBjdXI7XG4gICAgICAgICAgYnJlYWsgb3V0ZXJcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIE9uIHNvbWUgYnJvd3NlcnMsIGhvcml6b250YWwgc2Nyb2xsaW5nIHdpbGwgY2F1c2UgcmVkcmF3cyB0b1xuICAvLyBoYXBwZW4gYmVmb3JlIHRoZSBndXR0ZXIgaGFzIGJlZW4gcmVhbGlnbmVkLCBjYXVzaW5nIGl0IHRvXG4gIC8vIHdyaWdnbGUgYXJvdW5kIGluIGEgbW9zdCB1bnNlZW1seSB3YXkuIFdoZW4gd2UgaGF2ZSBhblxuICAvLyBlc3RpbWF0ZWQgcGl4ZWxzL2RlbHRhIHZhbHVlLCB3ZSBqdXN0IGhhbmRsZSBob3Jpem9udGFsXG4gIC8vIHNjcm9sbGluZyBlbnRpcmVseSBoZXJlLiBJdCdsbCBiZSBzbGlnaHRseSBvZmYgZnJvbSBuYXRpdmUsIGJ1dFxuICAvLyBiZXR0ZXIgdGhhbiBnbGl0Y2hpbmcgb3V0LlxuICBpZiAoZHggJiYgIWdlY2tvICYmICFwcmVzdG8gJiYgd2hlZWxQaXhlbHNQZXJVbml0ICE9IG51bGwpIHtcbiAgICBpZiAoZHkgJiYgY2FuU2Nyb2xsWSlcbiAgICAgIHsgdXBkYXRlU2Nyb2xsVG9wKGNtLCBNYXRoLm1heCgwLCBzY3JvbGwuc2Nyb2xsVG9wICsgZHkgKiB3aGVlbFBpeGVsc1BlclVuaXQpKTsgfVxuICAgIHNldFNjcm9sbExlZnQoY20sIE1hdGgubWF4KDAsIHNjcm9sbC5zY3JvbGxMZWZ0ICsgZHggKiB3aGVlbFBpeGVsc1BlclVuaXQpKTtcbiAgICAvLyBPbmx5IHByZXZlbnQgZGVmYXVsdCBzY3JvbGxpbmcgaWYgdmVydGljYWwgc2Nyb2xsaW5nIGlzXG4gICAgLy8gYWN0dWFsbHkgcG9zc2libGUuIE90aGVyd2lzZSwgaXQgY2F1c2VzIHZlcnRpY2FsIHNjcm9sbFxuICAgIC8vIGppdHRlciBvbiBPU1ggdHJhY2twYWRzIHdoZW4gZGVsdGFYIGlzIHNtYWxsIGFuZCBkZWx0YVlcbiAgICAvLyBpcyBsYXJnZSAoaXNzdWUgIzM1NzkpXG4gICAgaWYgKCFkeSB8fCAoZHkgJiYgY2FuU2Nyb2xsWSkpXG4gICAgICB7IGVfcHJldmVudERlZmF1bHQoZSk7IH1cbiAgICBkaXNwbGF5LndoZWVsU3RhcnRYID0gbnVsbDsgLy8gQWJvcnQgbWVhc3VyZW1lbnQsIGlmIGluIHByb2dyZXNzXG4gICAgcmV0dXJuXG4gIH1cblxuICAvLyAnUHJvamVjdCcgdGhlIHZpc2libGUgdmlld3BvcnQgdG8gY292ZXIgdGhlIGFyZWEgdGhhdCBpcyBiZWluZ1xuICAvLyBzY3JvbGxlZCBpbnRvIHZpZXcgKGlmIHdlIGtub3cgZW5vdWdoIHRvIGVzdGltYXRlIGl0KS5cbiAgaWYgKGR5ICYmIHdoZWVsUGl4ZWxzUGVyVW5pdCAhPSBudWxsKSB7XG4gICAgdmFyIHBpeGVscyA9IGR5ICogd2hlZWxQaXhlbHNQZXJVbml0O1xuICAgIHZhciB0b3AgPSBjbS5kb2Muc2Nyb2xsVG9wLCBib3QgPSB0b3AgKyBkaXNwbGF5LndyYXBwZXIuY2xpZW50SGVpZ2h0O1xuICAgIGlmIChwaXhlbHMgPCAwKSB7IHRvcCA9IE1hdGgubWF4KDAsIHRvcCArIHBpeGVscyAtIDUwKTsgfVxuICAgIGVsc2UgeyBib3QgPSBNYXRoLm1pbihjbS5kb2MuaGVpZ2h0LCBib3QgKyBwaXhlbHMgKyA1MCk7IH1cbiAgICB1cGRhdGVEaXNwbGF5U2ltcGxlKGNtLCB7dG9wOiB0b3AsIGJvdHRvbTogYm90fSk7XG4gIH1cblxuICBpZiAod2hlZWxTYW1wbGVzIDwgMjApIHtcbiAgICBpZiAoZGlzcGxheS53aGVlbFN0YXJ0WCA9PSBudWxsKSB7XG4gICAgICBkaXNwbGF5LndoZWVsU3RhcnRYID0gc2Nyb2xsLnNjcm9sbExlZnQ7IGRpc3BsYXkud2hlZWxTdGFydFkgPSBzY3JvbGwuc2Nyb2xsVG9wO1xuICAgICAgZGlzcGxheS53aGVlbERYID0gZHg7IGRpc3BsYXkud2hlZWxEWSA9IGR5O1xuICAgICAgc2V0VGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmIChkaXNwbGF5LndoZWVsU3RhcnRYID09IG51bGwpIHsgcmV0dXJuIH1cbiAgICAgICAgdmFyIG1vdmVkWCA9IHNjcm9sbC5zY3JvbGxMZWZ0IC0gZGlzcGxheS53aGVlbFN0YXJ0WDtcbiAgICAgICAgdmFyIG1vdmVkWSA9IHNjcm9sbC5zY3JvbGxUb3AgLSBkaXNwbGF5LndoZWVsU3RhcnRZO1xuICAgICAgICB2YXIgc2FtcGxlID0gKG1vdmVkWSAmJiBkaXNwbGF5LndoZWVsRFkgJiYgbW92ZWRZIC8gZGlzcGxheS53aGVlbERZKSB8fFxuICAgICAgICAgIChtb3ZlZFggJiYgZGlzcGxheS53aGVlbERYICYmIG1vdmVkWCAvIGRpc3BsYXkud2hlZWxEWCk7XG4gICAgICAgIGRpc3BsYXkud2hlZWxTdGFydFggPSBkaXNwbGF5LndoZWVsU3RhcnRZID0gbnVsbDtcbiAgICAgICAgaWYgKCFzYW1wbGUpIHsgcmV0dXJuIH1cbiAgICAgICAgd2hlZWxQaXhlbHNQZXJVbml0ID0gKHdoZWVsUGl4ZWxzUGVyVW5pdCAqIHdoZWVsU2FtcGxlcyArIHNhbXBsZSkgLyAod2hlZWxTYW1wbGVzICsgMSk7XG4gICAgICAgICsrd2hlZWxTYW1wbGVzO1xuICAgICAgfSwgMjAwKTtcbiAgICB9IGVsc2Uge1xuICAgICAgZGlzcGxheS53aGVlbERYICs9IGR4OyBkaXNwbGF5LndoZWVsRFkgKz0gZHk7XG4gICAgfVxuICB9XG59XG5cbi8vIFNlbGVjdGlvbiBvYmplY3RzIGFyZSBpbW11dGFibGUuIEEgbmV3IG9uZSBpcyBjcmVhdGVkIGV2ZXJ5IHRpbWVcbi8vIHRoZSBzZWxlY3Rpb24gY2hhbmdlcy4gQSBzZWxlY3Rpb24gaXMgb25lIG9yIG1vcmUgbm9uLW92ZXJsYXBwaW5nXG4vLyAoYW5kIG5vbi10b3VjaGluZykgcmFuZ2VzLCBzb3J0ZWQsIGFuZCBhbiBpbnRlZ2VyIHRoYXQgaW5kaWNhdGVzXG4vLyB3aGljaCBvbmUgaXMgdGhlIHByaW1hcnkgc2VsZWN0aW9uICh0aGUgb25lIHRoYXQncyBzY3JvbGxlZCBpbnRvXG4vLyB2aWV3LCB0aGF0IGdldEN1cnNvciByZXR1cm5zLCBldGMpLlxudmFyIFNlbGVjdGlvbiA9IGZ1bmN0aW9uKHJhbmdlcywgcHJpbUluZGV4KSB7XG4gIHRoaXMucmFuZ2VzID0gcmFuZ2VzO1xuICB0aGlzLnByaW1JbmRleCA9IHByaW1JbmRleDtcbn07XG5cblNlbGVjdGlvbi5wcm90b3R5cGUucHJpbWFyeSA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuIHRoaXMucmFuZ2VzW3RoaXMucHJpbUluZGV4XSB9O1xuXG5TZWxlY3Rpb24ucHJvdG90eXBlLmVxdWFscyA9IGZ1bmN0aW9uIChvdGhlcikge1xuICAgIHZhciB0aGlzJDEgPSB0aGlzO1xuXG4gIGlmIChvdGhlciA9PSB0aGlzKSB7IHJldHVybiB0cnVlIH1cbiAgaWYgKG90aGVyLnByaW1JbmRleCAhPSB0aGlzLnByaW1JbmRleCB8fCBvdGhlci5yYW5nZXMubGVuZ3RoICE9IHRoaXMucmFuZ2VzLmxlbmd0aCkgeyByZXR1cm4gZmFsc2UgfVxuICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMucmFuZ2VzLmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIGhlcmUgPSB0aGlzJDEucmFuZ2VzW2ldLCB0aGVyZSA9IG90aGVyLnJhbmdlc1tpXTtcbiAgICBpZiAoIWVxdWFsQ3Vyc29yUG9zKGhlcmUuYW5jaG9yLCB0aGVyZS5hbmNob3IpIHx8ICFlcXVhbEN1cnNvclBvcyhoZXJlLmhlYWQsIHRoZXJlLmhlYWQpKSB7IHJldHVybiBmYWxzZSB9XG4gIH1cbiAgcmV0dXJuIHRydWVcbn07XG5cblNlbGVjdGlvbi5wcm90b3R5cGUuZGVlcENvcHkgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHRoaXMkMSA9IHRoaXM7XG5cbiAgdmFyIG91dCA9IFtdO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMucmFuZ2VzLmxlbmd0aDsgaSsrKVxuICAgIHsgb3V0W2ldID0gbmV3IFJhbmdlKGNvcHlQb3ModGhpcyQxLnJhbmdlc1tpXS5hbmNob3IpLCBjb3B5UG9zKHRoaXMkMS5yYW5nZXNbaV0uaGVhZCkpOyB9XG4gIHJldHVybiBuZXcgU2VsZWN0aW9uKG91dCwgdGhpcy5wcmltSW5kZXgpXG59O1xuXG5TZWxlY3Rpb24ucHJvdG90eXBlLnNvbWV0aGluZ1NlbGVjdGVkID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciB0aGlzJDEgPSB0aGlzO1xuXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5yYW5nZXMubGVuZ3RoOyBpKyspXG4gICAgeyBpZiAoIXRoaXMkMS5yYW5nZXNbaV0uZW1wdHkoKSkgeyByZXR1cm4gdHJ1ZSB9IH1cbiAgcmV0dXJuIGZhbHNlXG59O1xuXG5TZWxlY3Rpb24ucHJvdG90eXBlLmNvbnRhaW5zID0gZnVuY3Rpb24gKHBvcywgZW5kKSB7XG4gICAgdmFyIHRoaXMkMSA9IHRoaXM7XG5cbiAgaWYgKCFlbmQpIHsgZW5kID0gcG9zOyB9XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5yYW5nZXMubGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgcmFuZ2UgPSB0aGlzJDEucmFuZ2VzW2ldO1xuICAgIGlmIChjbXAoZW5kLCByYW5nZS5mcm9tKCkpID49IDAgJiYgY21wKHBvcywgcmFuZ2UudG8oKSkgPD0gMClcbiAgICAgIHsgcmV0dXJuIGkgfVxuICB9XG4gIHJldHVybiAtMVxufTtcblxudmFyIFJhbmdlID0gZnVuY3Rpb24oYW5jaG9yLCBoZWFkKSB7XG4gIHRoaXMuYW5jaG9yID0gYW5jaG9yOyB0aGlzLmhlYWQgPSBoZWFkO1xufTtcblxuUmFuZ2UucHJvdG90eXBlLmZyb20gPSBmdW5jdGlvbiAoKSB7IHJldHVybiBtaW5Qb3ModGhpcy5hbmNob3IsIHRoaXMuaGVhZCkgfTtcblJhbmdlLnByb3RvdHlwZS50byA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuIG1heFBvcyh0aGlzLmFuY2hvciwgdGhpcy5oZWFkKSB9O1xuUmFuZ2UucHJvdG90eXBlLmVtcHR5ID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gdGhpcy5oZWFkLmxpbmUgPT0gdGhpcy5hbmNob3IubGluZSAmJiB0aGlzLmhlYWQuY2ggPT0gdGhpcy5hbmNob3IuY2ggfTtcblxuLy8gVGFrZSBhbiB1bnNvcnRlZCwgcG90ZW50aWFsbHkgb3ZlcmxhcHBpbmcgc2V0IG9mIHJhbmdlcywgYW5kXG4vLyBidWlsZCBhIHNlbGVjdGlvbiBvdXQgb2YgaXQuICdDb25zdW1lcycgcmFuZ2VzIGFycmF5IChtb2RpZnlpbmdcbi8vIGl0KS5cbmZ1bmN0aW9uIG5vcm1hbGl6ZVNlbGVjdGlvbihyYW5nZXMsIHByaW1JbmRleCkge1xuICB2YXIgcHJpbSA9IHJhbmdlc1twcmltSW5kZXhdO1xuICByYW5nZXMuc29ydChmdW5jdGlvbiAoYSwgYikgeyByZXR1cm4gY21wKGEuZnJvbSgpLCBiLmZyb20oKSk7IH0pO1xuICBwcmltSW5kZXggPSBpbmRleE9mKHJhbmdlcywgcHJpbSk7XG4gIGZvciAodmFyIGkgPSAxOyBpIDwgcmFuZ2VzLmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIGN1ciA9IHJhbmdlc1tpXSwgcHJldiA9IHJhbmdlc1tpIC0gMV07XG4gICAgaWYgKGNtcChwcmV2LnRvKCksIGN1ci5mcm9tKCkpID49IDApIHtcbiAgICAgIHZhciBmcm9tID0gbWluUG9zKHByZXYuZnJvbSgpLCBjdXIuZnJvbSgpKSwgdG8gPSBtYXhQb3MocHJldi50bygpLCBjdXIudG8oKSk7XG4gICAgICB2YXIgaW52ID0gcHJldi5lbXB0eSgpID8gY3VyLmZyb20oKSA9PSBjdXIuaGVhZCA6IHByZXYuZnJvbSgpID09IHByZXYuaGVhZDtcbiAgICAgIGlmIChpIDw9IHByaW1JbmRleCkgeyAtLXByaW1JbmRleDsgfVxuICAgICAgcmFuZ2VzLnNwbGljZSgtLWksIDIsIG5ldyBSYW5nZShpbnYgPyB0byA6IGZyb20sIGludiA/IGZyb20gOiB0bykpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gbmV3IFNlbGVjdGlvbihyYW5nZXMsIHByaW1JbmRleClcbn1cblxuZnVuY3Rpb24gc2ltcGxlU2VsZWN0aW9uKGFuY2hvciwgaGVhZCkge1xuICByZXR1cm4gbmV3IFNlbGVjdGlvbihbbmV3IFJhbmdlKGFuY2hvciwgaGVhZCB8fCBhbmNob3IpXSwgMClcbn1cblxuLy8gQ29tcHV0ZSB0aGUgcG9zaXRpb24gb2YgdGhlIGVuZCBvZiBhIGNoYW5nZSAoaXRzICd0bycgcHJvcGVydHlcbi8vIHJlZmVycyB0byB0aGUgcHJlLWNoYW5nZSBlbmQpLlxuZnVuY3Rpb24gY2hhbmdlRW5kKGNoYW5nZSkge1xuICBpZiAoIWNoYW5nZS50ZXh0KSB7IHJldHVybiBjaGFuZ2UudG8gfVxuICByZXR1cm4gUG9zKGNoYW5nZS5mcm9tLmxpbmUgKyBjaGFuZ2UudGV4dC5sZW5ndGggLSAxLFxuICAgICAgICAgICAgIGxzdChjaGFuZ2UudGV4dCkubGVuZ3RoICsgKGNoYW5nZS50ZXh0Lmxlbmd0aCA9PSAxID8gY2hhbmdlLmZyb20uY2ggOiAwKSlcbn1cblxuLy8gQWRqdXN0IGEgcG9zaXRpb24gdG8gcmVmZXIgdG8gdGhlIHBvc3QtY2hhbmdlIHBvc2l0aW9uIG9mIHRoZVxuLy8gc2FtZSB0ZXh0LCBvciB0aGUgZW5kIG9mIHRoZSBjaGFuZ2UgaWYgdGhlIGNoYW5nZSBjb3ZlcnMgaXQuXG5mdW5jdGlvbiBhZGp1c3RGb3JDaGFuZ2UocG9zLCBjaGFuZ2UpIHtcbiAgaWYgKGNtcChwb3MsIGNoYW5nZS5mcm9tKSA8IDApIHsgcmV0dXJuIHBvcyB9XG4gIGlmIChjbXAocG9zLCBjaGFuZ2UudG8pIDw9IDApIHsgcmV0dXJuIGNoYW5nZUVuZChjaGFuZ2UpIH1cblxuICB2YXIgbGluZSA9IHBvcy5saW5lICsgY2hhbmdlLnRleHQubGVuZ3RoIC0gKGNoYW5nZS50by5saW5lIC0gY2hhbmdlLmZyb20ubGluZSkgLSAxLCBjaCA9IHBvcy5jaDtcbiAgaWYgKHBvcy5saW5lID09IGNoYW5nZS50by5saW5lKSB7IGNoICs9IGNoYW5nZUVuZChjaGFuZ2UpLmNoIC0gY2hhbmdlLnRvLmNoOyB9XG4gIHJldHVybiBQb3MobGluZSwgY2gpXG59XG5cbmZ1bmN0aW9uIGNvbXB1dGVTZWxBZnRlckNoYW5nZShkb2MsIGNoYW5nZSkge1xuICB2YXIgb3V0ID0gW107XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgZG9jLnNlbC5yYW5nZXMubGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgcmFuZ2UgPSBkb2Muc2VsLnJhbmdlc1tpXTtcbiAgICBvdXQucHVzaChuZXcgUmFuZ2UoYWRqdXN0Rm9yQ2hhbmdlKHJhbmdlLmFuY2hvciwgY2hhbmdlKSxcbiAgICAgICAgICAgICAgICAgICAgICAgYWRqdXN0Rm9yQ2hhbmdlKHJhbmdlLmhlYWQsIGNoYW5nZSkpKTtcbiAgfVxuICByZXR1cm4gbm9ybWFsaXplU2VsZWN0aW9uKG91dCwgZG9jLnNlbC5wcmltSW5kZXgpXG59XG5cbmZ1bmN0aW9uIG9mZnNldFBvcyhwb3MsIG9sZCwgbncpIHtcbiAgaWYgKHBvcy5saW5lID09IG9sZC5saW5lKVxuICAgIHsgcmV0dXJuIFBvcyhudy5saW5lLCBwb3MuY2ggLSBvbGQuY2ggKyBudy5jaCkgfVxuICBlbHNlXG4gICAgeyByZXR1cm4gUG9zKG53LmxpbmUgKyAocG9zLmxpbmUgLSBvbGQubGluZSksIHBvcy5jaCkgfVxufVxuXG4vLyBVc2VkIGJ5IHJlcGxhY2VTZWxlY3Rpb25zIHRvIGFsbG93IG1vdmluZyB0aGUgc2VsZWN0aW9uIHRvIHRoZVxuLy8gc3RhcnQgb3IgYXJvdW5kIHRoZSByZXBsYWNlZCB0ZXN0LiBIaW50IG1heSBiZSBcInN0YXJ0XCIgb3IgXCJhcm91bmRcIi5cbmZ1bmN0aW9uIGNvbXB1dGVSZXBsYWNlZFNlbChkb2MsIGNoYW5nZXMsIGhpbnQpIHtcbiAgdmFyIG91dCA9IFtdO1xuICB2YXIgb2xkUHJldiA9IFBvcyhkb2MuZmlyc3QsIDApLCBuZXdQcmV2ID0gb2xkUHJldjtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBjaGFuZ2VzLmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIGNoYW5nZSA9IGNoYW5nZXNbaV07XG4gICAgdmFyIGZyb20gPSBvZmZzZXRQb3MoY2hhbmdlLmZyb20sIG9sZFByZXYsIG5ld1ByZXYpO1xuICAgIHZhciB0byA9IG9mZnNldFBvcyhjaGFuZ2VFbmQoY2hhbmdlKSwgb2xkUHJldiwgbmV3UHJldik7XG4gICAgb2xkUHJldiA9IGNoYW5nZS50bztcbiAgICBuZXdQcmV2ID0gdG87XG4gICAgaWYgKGhpbnQgPT0gXCJhcm91bmRcIikge1xuICAgICAgdmFyIHJhbmdlID0gZG9jLnNlbC5yYW5nZXNbaV0sIGludiA9IGNtcChyYW5nZS5oZWFkLCByYW5nZS5hbmNob3IpIDwgMDtcbiAgICAgIG91dFtpXSA9IG5ldyBSYW5nZShpbnYgPyB0byA6IGZyb20sIGludiA/IGZyb20gOiB0byk7XG4gICAgfSBlbHNlIHtcbiAgICAgIG91dFtpXSA9IG5ldyBSYW5nZShmcm9tLCBmcm9tKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIG5ldyBTZWxlY3Rpb24ob3V0LCBkb2Muc2VsLnByaW1JbmRleClcbn1cblxuLy8gVXNlZCB0byBnZXQgdGhlIGVkaXRvciBpbnRvIGEgY29uc2lzdGVudCBzdGF0ZSBhZ2FpbiB3aGVuIG9wdGlvbnMgY2hhbmdlLlxuXG5mdW5jdGlvbiBsb2FkTW9kZShjbSkge1xuICBjbS5kb2MubW9kZSA9IGdldE1vZGUoY20ub3B0aW9ucywgY20uZG9jLm1vZGVPcHRpb24pO1xuICByZXNldE1vZGVTdGF0ZShjbSk7XG59XG5cbmZ1bmN0aW9uIHJlc2V0TW9kZVN0YXRlKGNtKSB7XG4gIGNtLmRvYy5pdGVyKGZ1bmN0aW9uIChsaW5lKSB7XG4gICAgaWYgKGxpbmUuc3RhdGVBZnRlcikgeyBsaW5lLnN0YXRlQWZ0ZXIgPSBudWxsOyB9XG4gICAgaWYgKGxpbmUuc3R5bGVzKSB7IGxpbmUuc3R5bGVzID0gbnVsbDsgfVxuICB9KTtcbiAgY20uZG9jLm1vZGVGcm9udGllciA9IGNtLmRvYy5oaWdobGlnaHRGcm9udGllciA9IGNtLmRvYy5maXJzdDtcbiAgc3RhcnRXb3JrZXIoY20sIDEwMCk7XG4gIGNtLnN0YXRlLm1vZGVHZW4rKztcbiAgaWYgKGNtLmN1ck9wKSB7IHJlZ0NoYW5nZShjbSk7IH1cbn1cblxuLy8gRE9DVU1FTlQgREFUQSBTVFJVQ1RVUkVcblxuLy8gQnkgZGVmYXVsdCwgdXBkYXRlcyB0aGF0IHN0YXJ0IGFuZCBlbmQgYXQgdGhlIGJlZ2lubmluZyBvZiBhIGxpbmVcbi8vIGFyZSB0cmVhdGVkIHNwZWNpYWxseSwgaW4gb3JkZXIgdG8gbWFrZSB0aGUgYXNzb2NpYXRpb24gb2YgbGluZVxuLy8gd2lkZ2V0cyBhbmQgbWFya2VyIGVsZW1lbnRzIHdpdGggdGhlIHRleHQgYmVoYXZlIG1vcmUgaW50dWl0aXZlLlxuZnVuY3Rpb24gaXNXaG9sZUxpbmVVcGRhdGUoZG9jLCBjaGFuZ2UpIHtcbiAgcmV0dXJuIGNoYW5nZS5mcm9tLmNoID09IDAgJiYgY2hhbmdlLnRvLmNoID09IDAgJiYgbHN0KGNoYW5nZS50ZXh0KSA9PSBcIlwiICYmXG4gICAgKCFkb2MuY20gfHwgZG9jLmNtLm9wdGlvbnMud2hvbGVMaW5lVXBkYXRlQmVmb3JlKVxufVxuXG4vLyBQZXJmb3JtIGEgY2hhbmdlIG9uIHRoZSBkb2N1bWVudCBkYXRhIHN0cnVjdHVyZS5cbmZ1bmN0aW9uIHVwZGF0ZURvYyhkb2MsIGNoYW5nZSwgbWFya2VkU3BhbnMsIGVzdGltYXRlSGVpZ2h0JCQxKSB7XG4gIGZ1bmN0aW9uIHNwYW5zRm9yKG4pIHtyZXR1cm4gbWFya2VkU3BhbnMgPyBtYXJrZWRTcGFuc1tuXSA6IG51bGx9XG4gIGZ1bmN0aW9uIHVwZGF0ZShsaW5lLCB0ZXh0LCBzcGFucykge1xuICAgIHVwZGF0ZUxpbmUobGluZSwgdGV4dCwgc3BhbnMsIGVzdGltYXRlSGVpZ2h0JCQxKTtcbiAgICBzaWduYWxMYXRlcihsaW5lLCBcImNoYW5nZVwiLCBsaW5lLCBjaGFuZ2UpO1xuICB9XG4gIGZ1bmN0aW9uIGxpbmVzRm9yKHN0YXJ0LCBlbmQpIHtcbiAgICB2YXIgcmVzdWx0ID0gW107XG4gICAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDwgZW5kOyArK2kpXG4gICAgICB7IHJlc3VsdC5wdXNoKG5ldyBMaW5lKHRleHRbaV0sIHNwYW5zRm9yKGkpLCBlc3RpbWF0ZUhlaWdodCQkMSkpOyB9XG4gICAgcmV0dXJuIHJlc3VsdFxuICB9XG5cbiAgdmFyIGZyb20gPSBjaGFuZ2UuZnJvbSwgdG8gPSBjaGFuZ2UudG8sIHRleHQgPSBjaGFuZ2UudGV4dDtcbiAgdmFyIGZpcnN0TGluZSA9IGdldExpbmUoZG9jLCBmcm9tLmxpbmUpLCBsYXN0TGluZSA9IGdldExpbmUoZG9jLCB0by5saW5lKTtcbiAgdmFyIGxhc3RUZXh0ID0gbHN0KHRleHQpLCBsYXN0U3BhbnMgPSBzcGFuc0Zvcih0ZXh0Lmxlbmd0aCAtIDEpLCBubGluZXMgPSB0by5saW5lIC0gZnJvbS5saW5lO1xuXG4gIC8vIEFkanVzdCB0aGUgbGluZSBzdHJ1Y3R1cmVcbiAgaWYgKGNoYW5nZS5mdWxsKSB7XG4gICAgZG9jLmluc2VydCgwLCBsaW5lc0ZvcigwLCB0ZXh0Lmxlbmd0aCkpO1xuICAgIGRvYy5yZW1vdmUodGV4dC5sZW5ndGgsIGRvYy5zaXplIC0gdGV4dC5sZW5ndGgpO1xuICB9IGVsc2UgaWYgKGlzV2hvbGVMaW5lVXBkYXRlKGRvYywgY2hhbmdlKSkge1xuICAgIC8vIFRoaXMgaXMgYSB3aG9sZS1saW5lIHJlcGxhY2UuIFRyZWF0ZWQgc3BlY2lhbGx5IHRvIG1ha2VcbiAgICAvLyBzdXJlIGxpbmUgb2JqZWN0cyBtb3ZlIHRoZSB3YXkgdGhleSBhcmUgc3VwcG9zZWQgdG8uXG4gICAgdmFyIGFkZGVkID0gbGluZXNGb3IoMCwgdGV4dC5sZW5ndGggLSAxKTtcbiAgICB1cGRhdGUobGFzdExpbmUsIGxhc3RMaW5lLnRleHQsIGxhc3RTcGFucyk7XG4gICAgaWYgKG5saW5lcykgeyBkb2MucmVtb3ZlKGZyb20ubGluZSwgbmxpbmVzKTsgfVxuICAgIGlmIChhZGRlZC5sZW5ndGgpIHsgZG9jLmluc2VydChmcm9tLmxpbmUsIGFkZGVkKTsgfVxuICB9IGVsc2UgaWYgKGZpcnN0TGluZSA9PSBsYXN0TGluZSkge1xuICAgIGlmICh0ZXh0Lmxlbmd0aCA9PSAxKSB7XG4gICAgICB1cGRhdGUoZmlyc3RMaW5lLCBmaXJzdExpbmUudGV4dC5zbGljZSgwLCBmcm9tLmNoKSArIGxhc3RUZXh0ICsgZmlyc3RMaW5lLnRleHQuc2xpY2UodG8uY2gpLCBsYXN0U3BhbnMpO1xuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgYWRkZWQkMSA9IGxpbmVzRm9yKDEsIHRleHQubGVuZ3RoIC0gMSk7XG4gICAgICBhZGRlZCQxLnB1c2gobmV3IExpbmUobGFzdFRleHQgKyBmaXJzdExpbmUudGV4dC5zbGljZSh0by5jaCksIGxhc3RTcGFucywgZXN0aW1hdGVIZWlnaHQkJDEpKTtcbiAgICAgIHVwZGF0ZShmaXJzdExpbmUsIGZpcnN0TGluZS50ZXh0LnNsaWNlKDAsIGZyb20uY2gpICsgdGV4dFswXSwgc3BhbnNGb3IoMCkpO1xuICAgICAgZG9jLmluc2VydChmcm9tLmxpbmUgKyAxLCBhZGRlZCQxKTtcbiAgICB9XG4gIH0gZWxzZSBpZiAodGV4dC5sZW5ndGggPT0gMSkge1xuICAgIHVwZGF0ZShmaXJzdExpbmUsIGZpcnN0TGluZS50ZXh0LnNsaWNlKDAsIGZyb20uY2gpICsgdGV4dFswXSArIGxhc3RMaW5lLnRleHQuc2xpY2UodG8uY2gpLCBzcGFuc0ZvcigwKSk7XG4gICAgZG9jLnJlbW92ZShmcm9tLmxpbmUgKyAxLCBubGluZXMpO1xuICB9IGVsc2Uge1xuICAgIHVwZGF0ZShmaXJzdExpbmUsIGZpcnN0TGluZS50ZXh0LnNsaWNlKDAsIGZyb20uY2gpICsgdGV4dFswXSwgc3BhbnNGb3IoMCkpO1xuICAgIHVwZGF0ZShsYXN0TGluZSwgbGFzdFRleHQgKyBsYXN0TGluZS50ZXh0LnNsaWNlKHRvLmNoKSwgbGFzdFNwYW5zKTtcbiAgICB2YXIgYWRkZWQkMiA9IGxpbmVzRm9yKDEsIHRleHQubGVuZ3RoIC0gMSk7XG4gICAgaWYgKG5saW5lcyA+IDEpIHsgZG9jLnJlbW92ZShmcm9tLmxpbmUgKyAxLCBubGluZXMgLSAxKTsgfVxuICAgIGRvYy5pbnNlcnQoZnJvbS5saW5lICsgMSwgYWRkZWQkMik7XG4gIH1cblxuICBzaWduYWxMYXRlcihkb2MsIFwiY2hhbmdlXCIsIGRvYywgY2hhbmdlKTtcbn1cblxuLy8gQ2FsbCBmIGZvciBhbGwgbGlua2VkIGRvY3VtZW50cy5cbmZ1bmN0aW9uIGxpbmtlZERvY3MoZG9jLCBmLCBzaGFyZWRIaXN0T25seSkge1xuICBmdW5jdGlvbiBwcm9wYWdhdGUoZG9jLCBza2lwLCBzaGFyZWRIaXN0KSB7XG4gICAgaWYgKGRvYy5saW5rZWQpIHsgZm9yICh2YXIgaSA9IDA7IGkgPCBkb2MubGlua2VkLmxlbmd0aDsgKytpKSB7XG4gICAgICB2YXIgcmVsID0gZG9jLmxpbmtlZFtpXTtcbiAgICAgIGlmIChyZWwuZG9jID09IHNraXApIHsgY29udGludWUgfVxuICAgICAgdmFyIHNoYXJlZCA9IHNoYXJlZEhpc3QgJiYgcmVsLnNoYXJlZEhpc3Q7XG4gICAgICBpZiAoc2hhcmVkSGlzdE9ubHkgJiYgIXNoYXJlZCkgeyBjb250aW51ZSB9XG4gICAgICBmKHJlbC5kb2MsIHNoYXJlZCk7XG4gICAgICBwcm9wYWdhdGUocmVsLmRvYywgZG9jLCBzaGFyZWQpO1xuICAgIH0gfVxuICB9XG4gIHByb3BhZ2F0ZShkb2MsIG51bGwsIHRydWUpO1xufVxuXG4vLyBBdHRhY2ggYSBkb2N1bWVudCB0byBhbiBlZGl0b3IuXG5mdW5jdGlvbiBhdHRhY2hEb2MoY20sIGRvYykge1xuICBpZiAoZG9jLmNtKSB7IHRocm93IG5ldyBFcnJvcihcIlRoaXMgZG9jdW1lbnQgaXMgYWxyZWFkeSBpbiB1c2UuXCIpIH1cbiAgY20uZG9jID0gZG9jO1xuICBkb2MuY20gPSBjbTtcbiAgZXN0aW1hdGVMaW5lSGVpZ2h0cyhjbSk7XG4gIGxvYWRNb2RlKGNtKTtcbiAgc2V0RGlyZWN0aW9uQ2xhc3MoY20pO1xuICBpZiAoIWNtLm9wdGlvbnMubGluZVdyYXBwaW5nKSB7IGZpbmRNYXhMaW5lKGNtKTsgfVxuICBjbS5vcHRpb25zLm1vZGUgPSBkb2MubW9kZU9wdGlvbjtcbiAgcmVnQ2hhbmdlKGNtKTtcbn1cblxuZnVuY3Rpb24gc2V0RGlyZWN0aW9uQ2xhc3MoY20pIHtcbiAgKGNtLmRvYy5kaXJlY3Rpb24gPT0gXCJydGxcIiA/IGFkZENsYXNzIDogcm1DbGFzcykoY20uZGlzcGxheS5saW5lRGl2LCBcIkNvZGVNaXJyb3ItcnRsXCIpO1xufVxuXG5mdW5jdGlvbiBkaXJlY3Rpb25DaGFuZ2VkKGNtKSB7XG4gIHJ1bkluT3AoY20sIGZ1bmN0aW9uICgpIHtcbiAgICBzZXREaXJlY3Rpb25DbGFzcyhjbSk7XG4gICAgcmVnQ2hhbmdlKGNtKTtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIEhpc3Rvcnkoc3RhcnRHZW4pIHtcbiAgLy8gQXJyYXlzIG9mIGNoYW5nZSBldmVudHMgYW5kIHNlbGVjdGlvbnMuIERvaW5nIHNvbWV0aGluZyBhZGRzIGFuXG4gIC8vIGV2ZW50IHRvIGRvbmUgYW5kIGNsZWFycyB1bmRvLiBVbmRvaW5nIG1vdmVzIGV2ZW50cyBmcm9tIGRvbmVcbiAgLy8gdG8gdW5kb25lLCByZWRvaW5nIG1vdmVzIHRoZW0gaW4gdGhlIG90aGVyIGRpcmVjdGlvbi5cbiAgdGhpcy5kb25lID0gW107IHRoaXMudW5kb25lID0gW107XG4gIHRoaXMudW5kb0RlcHRoID0gSW5maW5pdHk7XG4gIC8vIFVzZWQgdG8gdHJhY2sgd2hlbiBjaGFuZ2VzIGNhbiBiZSBtZXJnZWQgaW50byBhIHNpbmdsZSB1bmRvXG4gIC8vIGV2ZW50XG4gIHRoaXMubGFzdE1vZFRpbWUgPSB0aGlzLmxhc3RTZWxUaW1lID0gMDtcbiAgdGhpcy5sYXN0T3AgPSB0aGlzLmxhc3RTZWxPcCA9IG51bGw7XG4gIHRoaXMubGFzdE9yaWdpbiA9IHRoaXMubGFzdFNlbE9yaWdpbiA9IG51bGw7XG4gIC8vIFVzZWQgYnkgdGhlIGlzQ2xlYW4oKSBtZXRob2RcbiAgdGhpcy5nZW5lcmF0aW9uID0gdGhpcy5tYXhHZW5lcmF0aW9uID0gc3RhcnRHZW4gfHwgMTtcbn1cblxuLy8gQ3JlYXRlIGEgaGlzdG9yeSBjaGFuZ2UgZXZlbnQgZnJvbSBhbiB1cGRhdGVEb2Mtc3R5bGUgY2hhbmdlXG4vLyBvYmplY3QuXG5mdW5jdGlvbiBoaXN0b3J5Q2hhbmdlRnJvbUNoYW5nZShkb2MsIGNoYW5nZSkge1xuICB2YXIgaGlzdENoYW5nZSA9IHtmcm9tOiBjb3B5UG9zKGNoYW5nZS5mcm9tKSwgdG86IGNoYW5nZUVuZChjaGFuZ2UpLCB0ZXh0OiBnZXRCZXR3ZWVuKGRvYywgY2hhbmdlLmZyb20sIGNoYW5nZS50byl9O1xuICBhdHRhY2hMb2NhbFNwYW5zKGRvYywgaGlzdENoYW5nZSwgY2hhbmdlLmZyb20ubGluZSwgY2hhbmdlLnRvLmxpbmUgKyAxKTtcbiAgbGlua2VkRG9jcyhkb2MsIGZ1bmN0aW9uIChkb2MpIHsgcmV0dXJuIGF0dGFjaExvY2FsU3BhbnMoZG9jLCBoaXN0Q2hhbmdlLCBjaGFuZ2UuZnJvbS5saW5lLCBjaGFuZ2UudG8ubGluZSArIDEpOyB9LCB0cnVlKTtcbiAgcmV0dXJuIGhpc3RDaGFuZ2Vcbn1cblxuLy8gUG9wIGFsbCBzZWxlY3Rpb24gZXZlbnRzIG9mZiB0aGUgZW5kIG9mIGEgaGlzdG9yeSBhcnJheS4gU3RvcCBhdFxuLy8gYSBjaGFuZ2UgZXZlbnQuXG5mdW5jdGlvbiBjbGVhclNlbGVjdGlvbkV2ZW50cyhhcnJheSkge1xuICB3aGlsZSAoYXJyYXkubGVuZ3RoKSB7XG4gICAgdmFyIGxhc3QgPSBsc3QoYXJyYXkpO1xuICAgIGlmIChsYXN0LnJhbmdlcykgeyBhcnJheS5wb3AoKTsgfVxuICAgIGVsc2UgeyBicmVhayB9XG4gIH1cbn1cblxuLy8gRmluZCB0aGUgdG9wIGNoYW5nZSBldmVudCBpbiB0aGUgaGlzdG9yeS4gUG9wIG9mZiBzZWxlY3Rpb25cbi8vIGV2ZW50cyB0aGF0IGFyZSBpbiB0aGUgd2F5LlxuZnVuY3Rpb24gbGFzdENoYW5nZUV2ZW50KGhpc3QsIGZvcmNlKSB7XG4gIGlmIChmb3JjZSkge1xuICAgIGNsZWFyU2VsZWN0aW9uRXZlbnRzKGhpc3QuZG9uZSk7XG4gICAgcmV0dXJuIGxzdChoaXN0LmRvbmUpXG4gIH0gZWxzZSBpZiAoaGlzdC5kb25lLmxlbmd0aCAmJiAhbHN0KGhpc3QuZG9uZSkucmFuZ2VzKSB7XG4gICAgcmV0dXJuIGxzdChoaXN0LmRvbmUpXG4gIH0gZWxzZSBpZiAoaGlzdC5kb25lLmxlbmd0aCA+IDEgJiYgIWhpc3QuZG9uZVtoaXN0LmRvbmUubGVuZ3RoIC0gMl0ucmFuZ2VzKSB7XG4gICAgaGlzdC5kb25lLnBvcCgpO1xuICAgIHJldHVybiBsc3QoaGlzdC5kb25lKVxuICB9XG59XG5cbi8vIFJlZ2lzdGVyIGEgY2hhbmdlIGluIHRoZSBoaXN0b3J5LiBNZXJnZXMgY2hhbmdlcyB0aGF0IGFyZSB3aXRoaW5cbi8vIGEgc2luZ2xlIG9wZXJhdGlvbiwgb3IgYXJlIGNsb3NlIHRvZ2V0aGVyIHdpdGggYW4gb3JpZ2luIHRoYXRcbi8vIGFsbG93cyBtZXJnaW5nIChzdGFydGluZyB3aXRoIFwiK1wiKSBpbnRvIGEgc2luZ2xlIGV2ZW50LlxuZnVuY3Rpb24gYWRkQ2hhbmdlVG9IaXN0b3J5KGRvYywgY2hhbmdlLCBzZWxBZnRlciwgb3BJZCkge1xuICB2YXIgaGlzdCA9IGRvYy5oaXN0b3J5O1xuICBoaXN0LnVuZG9uZS5sZW5ndGggPSAwO1xuICB2YXIgdGltZSA9ICtuZXcgRGF0ZSwgY3VyO1xuICB2YXIgbGFzdDtcblxuICBpZiAoKGhpc3QubGFzdE9wID09IG9wSWQgfHxcbiAgICAgICBoaXN0Lmxhc3RPcmlnaW4gPT0gY2hhbmdlLm9yaWdpbiAmJiBjaGFuZ2Uub3JpZ2luICYmXG4gICAgICAgKChjaGFuZ2Uub3JpZ2luLmNoYXJBdCgwKSA9PSBcIitcIiAmJiBoaXN0Lmxhc3RNb2RUaW1lID4gdGltZSAtIChkb2MuY20gPyBkb2MuY20ub3B0aW9ucy5oaXN0b3J5RXZlbnREZWxheSA6IDUwMCkpIHx8XG4gICAgICAgIGNoYW5nZS5vcmlnaW4uY2hhckF0KDApID09IFwiKlwiKSkgJiZcbiAgICAgIChjdXIgPSBsYXN0Q2hhbmdlRXZlbnQoaGlzdCwgaGlzdC5sYXN0T3AgPT0gb3BJZCkpKSB7XG4gICAgLy8gTWVyZ2UgdGhpcyBjaGFuZ2UgaW50byB0aGUgbGFzdCBldmVudFxuICAgIGxhc3QgPSBsc3QoY3VyLmNoYW5nZXMpO1xuICAgIGlmIChjbXAoY2hhbmdlLmZyb20sIGNoYW5nZS50bykgPT0gMCAmJiBjbXAoY2hhbmdlLmZyb20sIGxhc3QudG8pID09IDApIHtcbiAgICAgIC8vIE9wdGltaXplZCBjYXNlIGZvciBzaW1wbGUgaW5zZXJ0aW9uIC0tIGRvbid0IHdhbnQgdG8gYWRkXG4gICAgICAvLyBuZXcgY2hhbmdlc2V0cyBmb3IgZXZlcnkgY2hhcmFjdGVyIHR5cGVkXG4gICAgICBsYXN0LnRvID0gY2hhbmdlRW5kKGNoYW5nZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIEFkZCBuZXcgc3ViLWV2ZW50XG4gICAgICBjdXIuY2hhbmdlcy5wdXNoKGhpc3RvcnlDaGFuZ2VGcm9tQ2hhbmdlKGRvYywgY2hhbmdlKSk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIC8vIENhbiBub3QgYmUgbWVyZ2VkLCBzdGFydCBhIG5ldyBldmVudC5cbiAgICB2YXIgYmVmb3JlID0gbHN0KGhpc3QuZG9uZSk7XG4gICAgaWYgKCFiZWZvcmUgfHwgIWJlZm9yZS5yYW5nZXMpXG4gICAgICB7IHB1c2hTZWxlY3Rpb25Ub0hpc3RvcnkoZG9jLnNlbCwgaGlzdC5kb25lKTsgfVxuICAgIGN1ciA9IHtjaGFuZ2VzOiBbaGlzdG9yeUNoYW5nZUZyb21DaGFuZ2UoZG9jLCBjaGFuZ2UpXSxcbiAgICAgICAgICAgZ2VuZXJhdGlvbjogaGlzdC5nZW5lcmF0aW9ufTtcbiAgICBoaXN0LmRvbmUucHVzaChjdXIpO1xuICAgIHdoaWxlIChoaXN0LmRvbmUubGVuZ3RoID4gaGlzdC51bmRvRGVwdGgpIHtcbiAgICAgIGhpc3QuZG9uZS5zaGlmdCgpO1xuICAgICAgaWYgKCFoaXN0LmRvbmVbMF0ucmFuZ2VzKSB7IGhpc3QuZG9uZS5zaGlmdCgpOyB9XG4gICAgfVxuICB9XG4gIGhpc3QuZG9uZS5wdXNoKHNlbEFmdGVyKTtcbiAgaGlzdC5nZW5lcmF0aW9uID0gKytoaXN0Lm1heEdlbmVyYXRpb247XG4gIGhpc3QubGFzdE1vZFRpbWUgPSBoaXN0Lmxhc3RTZWxUaW1lID0gdGltZTtcbiAgaGlzdC5sYXN0T3AgPSBoaXN0Lmxhc3RTZWxPcCA9IG9wSWQ7XG4gIGhpc3QubGFzdE9yaWdpbiA9IGhpc3QubGFzdFNlbE9yaWdpbiA9IGNoYW5nZS5vcmlnaW47XG5cbiAgaWYgKCFsYXN0KSB7IHNpZ25hbChkb2MsIFwiaGlzdG9yeUFkZGVkXCIpOyB9XG59XG5cbmZ1bmN0aW9uIHNlbGVjdGlvbkV2ZW50Q2FuQmVNZXJnZWQoZG9jLCBvcmlnaW4sIHByZXYsIHNlbCkge1xuICB2YXIgY2ggPSBvcmlnaW4uY2hhckF0KDApO1xuICByZXR1cm4gY2ggPT0gXCIqXCIgfHxcbiAgICBjaCA9PSBcIitcIiAmJlxuICAgIHByZXYucmFuZ2VzLmxlbmd0aCA9PSBzZWwucmFuZ2VzLmxlbmd0aCAmJlxuICAgIHByZXYuc29tZXRoaW5nU2VsZWN0ZWQoKSA9PSBzZWwuc29tZXRoaW5nU2VsZWN0ZWQoKSAmJlxuICAgIG5ldyBEYXRlIC0gZG9jLmhpc3RvcnkubGFzdFNlbFRpbWUgPD0gKGRvYy5jbSA/IGRvYy5jbS5vcHRpb25zLmhpc3RvcnlFdmVudERlbGF5IDogNTAwKVxufVxuXG4vLyBDYWxsZWQgd2hlbmV2ZXIgdGhlIHNlbGVjdGlvbiBjaGFuZ2VzLCBzZXRzIHRoZSBuZXcgc2VsZWN0aW9uIGFzXG4vLyB0aGUgcGVuZGluZyBzZWxlY3Rpb24gaW4gdGhlIGhpc3RvcnksIGFuZCBwdXNoZXMgdGhlIG9sZCBwZW5kaW5nXG4vLyBzZWxlY3Rpb24gaW50byB0aGUgJ2RvbmUnIGFycmF5IHdoZW4gaXQgd2FzIHNpZ25pZmljYW50bHlcbi8vIGRpZmZlcmVudCAoaW4gbnVtYmVyIG9mIHNlbGVjdGVkIHJhbmdlcywgZW1wdGluZXNzLCBvciB0aW1lKS5cbmZ1bmN0aW9uIGFkZFNlbGVjdGlvblRvSGlzdG9yeShkb2MsIHNlbCwgb3BJZCwgb3B0aW9ucykge1xuICB2YXIgaGlzdCA9IGRvYy5oaXN0b3J5LCBvcmlnaW4gPSBvcHRpb25zICYmIG9wdGlvbnMub3JpZ2luO1xuXG4gIC8vIEEgbmV3IGV2ZW50IGlzIHN0YXJ0ZWQgd2hlbiB0aGUgcHJldmlvdXMgb3JpZ2luIGRvZXMgbm90IG1hdGNoXG4gIC8vIHRoZSBjdXJyZW50LCBvciB0aGUgb3JpZ2lucyBkb24ndCBhbGxvdyBtYXRjaGluZy4gT3JpZ2luc1xuICAvLyBzdGFydGluZyB3aXRoICogYXJlIGFsd2F5cyBtZXJnZWQsIHRob3NlIHN0YXJ0aW5nIHdpdGggKyBhcmVcbiAgLy8gbWVyZ2VkIHdoZW4gc2ltaWxhciBhbmQgY2xvc2UgdG9nZXRoZXIgaW4gdGltZS5cbiAgaWYgKG9wSWQgPT0gaGlzdC5sYXN0U2VsT3AgfHxcbiAgICAgIChvcmlnaW4gJiYgaGlzdC5sYXN0U2VsT3JpZ2luID09IG9yaWdpbiAmJlxuICAgICAgIChoaXN0Lmxhc3RNb2RUaW1lID09IGhpc3QubGFzdFNlbFRpbWUgJiYgaGlzdC5sYXN0T3JpZ2luID09IG9yaWdpbiB8fFxuICAgICAgICBzZWxlY3Rpb25FdmVudENhbkJlTWVyZ2VkKGRvYywgb3JpZ2luLCBsc3QoaGlzdC5kb25lKSwgc2VsKSkpKVxuICAgIHsgaGlzdC5kb25lW2hpc3QuZG9uZS5sZW5ndGggLSAxXSA9IHNlbDsgfVxuICBlbHNlXG4gICAgeyBwdXNoU2VsZWN0aW9uVG9IaXN0b3J5KHNlbCwgaGlzdC5kb25lKTsgfVxuXG4gIGhpc3QubGFzdFNlbFRpbWUgPSArbmV3IERhdGU7XG4gIGhpc3QubGFzdFNlbE9yaWdpbiA9IG9yaWdpbjtcbiAgaGlzdC5sYXN0U2VsT3AgPSBvcElkO1xuICBpZiAob3B0aW9ucyAmJiBvcHRpb25zLmNsZWFyUmVkbyAhPT0gZmFsc2UpXG4gICAgeyBjbGVhclNlbGVjdGlvbkV2ZW50cyhoaXN0LnVuZG9uZSk7IH1cbn1cblxuZnVuY3Rpb24gcHVzaFNlbGVjdGlvblRvSGlzdG9yeShzZWwsIGRlc3QpIHtcbiAgdmFyIHRvcCA9IGxzdChkZXN0KTtcbiAgaWYgKCEodG9wICYmIHRvcC5yYW5nZXMgJiYgdG9wLmVxdWFscyhzZWwpKSlcbiAgICB7IGRlc3QucHVzaChzZWwpOyB9XG59XG5cbi8vIFVzZWQgdG8gc3RvcmUgbWFya2VkIHNwYW4gaW5mb3JtYXRpb24gaW4gdGhlIGhpc3RvcnkuXG5mdW5jdGlvbiBhdHRhY2hMb2NhbFNwYW5zKGRvYywgY2hhbmdlLCBmcm9tLCB0bykge1xuICB2YXIgZXhpc3RpbmcgPSBjaGFuZ2VbXCJzcGFuc19cIiArIGRvYy5pZF0sIG4gPSAwO1xuICBkb2MuaXRlcihNYXRoLm1heChkb2MuZmlyc3QsIGZyb20pLCBNYXRoLm1pbihkb2MuZmlyc3QgKyBkb2Muc2l6ZSwgdG8pLCBmdW5jdGlvbiAobGluZSkge1xuICAgIGlmIChsaW5lLm1hcmtlZFNwYW5zKVxuICAgICAgeyAoZXhpc3RpbmcgfHwgKGV4aXN0aW5nID0gY2hhbmdlW1wic3BhbnNfXCIgKyBkb2MuaWRdID0ge30pKVtuXSA9IGxpbmUubWFya2VkU3BhbnM7IH1cbiAgICArK247XG4gIH0pO1xufVxuXG4vLyBXaGVuIHVuL3JlLWRvaW5nIHJlc3RvcmVzIHRleHQgY29udGFpbmluZyBtYXJrZWQgc3BhbnMsIHRob3NlXG4vLyB0aGF0IGhhdmUgYmVlbiBleHBsaWNpdGx5IGNsZWFyZWQgc2hvdWxkIG5vdCBiZSByZXN0b3JlZC5cbmZ1bmN0aW9uIHJlbW92ZUNsZWFyZWRTcGFucyhzcGFucykge1xuICBpZiAoIXNwYW5zKSB7IHJldHVybiBudWxsIH1cbiAgdmFyIG91dDtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBzcGFucy5sZW5ndGg7ICsraSkge1xuICAgIGlmIChzcGFuc1tpXS5tYXJrZXIuZXhwbGljaXRseUNsZWFyZWQpIHsgaWYgKCFvdXQpIHsgb3V0ID0gc3BhbnMuc2xpY2UoMCwgaSk7IH0gfVxuICAgIGVsc2UgaWYgKG91dCkgeyBvdXQucHVzaChzcGFuc1tpXSk7IH1cbiAgfVxuICByZXR1cm4gIW91dCA/IHNwYW5zIDogb3V0Lmxlbmd0aCA/IG91dCA6IG51bGxcbn1cblxuLy8gUmV0cmlldmUgYW5kIGZpbHRlciB0aGUgb2xkIG1hcmtlZCBzcGFucyBzdG9yZWQgaW4gYSBjaGFuZ2UgZXZlbnQuXG5mdW5jdGlvbiBnZXRPbGRTcGFucyhkb2MsIGNoYW5nZSkge1xuICB2YXIgZm91bmQgPSBjaGFuZ2VbXCJzcGFuc19cIiArIGRvYy5pZF07XG4gIGlmICghZm91bmQpIHsgcmV0dXJuIG51bGwgfVxuICB2YXIgbncgPSBbXTtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBjaGFuZ2UudGV4dC5sZW5ndGg7ICsraSlcbiAgICB7IG53LnB1c2gocmVtb3ZlQ2xlYXJlZFNwYW5zKGZvdW5kW2ldKSk7IH1cbiAgcmV0dXJuIG53XG59XG5cbi8vIFVzZWQgZm9yIHVuL3JlLWRvaW5nIGNoYW5nZXMgZnJvbSB0aGUgaGlzdG9yeS4gQ29tYmluZXMgdGhlXG4vLyByZXN1bHQgb2YgY29tcHV0aW5nIHRoZSBleGlzdGluZyBzcGFucyB3aXRoIHRoZSBzZXQgb2Ygc3BhbnMgdGhhdFxuLy8gZXhpc3RlZCBpbiB0aGUgaGlzdG9yeSAoc28gdGhhdCBkZWxldGluZyBhcm91bmQgYSBzcGFuIGFuZCB0aGVuXG4vLyB1bmRvaW5nIGJyaW5ncyBiYWNrIHRoZSBzcGFuKS5cbmZ1bmN0aW9uIG1lcmdlT2xkU3BhbnMoZG9jLCBjaGFuZ2UpIHtcbiAgdmFyIG9sZCA9IGdldE9sZFNwYW5zKGRvYywgY2hhbmdlKTtcbiAgdmFyIHN0cmV0Y2hlZCA9IHN0cmV0Y2hTcGFuc092ZXJDaGFuZ2UoZG9jLCBjaGFuZ2UpO1xuICBpZiAoIW9sZCkgeyByZXR1cm4gc3RyZXRjaGVkIH1cbiAgaWYgKCFzdHJldGNoZWQpIHsgcmV0dXJuIG9sZCB9XG5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBvbGQubGVuZ3RoOyArK2kpIHtcbiAgICB2YXIgb2xkQ3VyID0gb2xkW2ldLCBzdHJldGNoQ3VyID0gc3RyZXRjaGVkW2ldO1xuICAgIGlmIChvbGRDdXIgJiYgc3RyZXRjaEN1cikge1xuICAgICAgc3BhbnM6IGZvciAodmFyIGogPSAwOyBqIDwgc3RyZXRjaEN1ci5sZW5ndGg7ICsraikge1xuICAgICAgICB2YXIgc3BhbiA9IHN0cmV0Y2hDdXJbal07XG4gICAgICAgIGZvciAodmFyIGsgPSAwOyBrIDwgb2xkQ3VyLmxlbmd0aDsgKytrKVxuICAgICAgICAgIHsgaWYgKG9sZEN1cltrXS5tYXJrZXIgPT0gc3Bhbi5tYXJrZXIpIHsgY29udGludWUgc3BhbnMgfSB9XG4gICAgICAgIG9sZEN1ci5wdXNoKHNwYW4pO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoc3RyZXRjaEN1cikge1xuICAgICAgb2xkW2ldID0gc3RyZXRjaEN1cjtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIG9sZFxufVxuXG4vLyBVc2VkIGJvdGggdG8gcHJvdmlkZSBhIEpTT04tc2FmZSBvYmplY3QgaW4gLmdldEhpc3RvcnksIGFuZCwgd2hlblxuLy8gZGV0YWNoaW5nIGEgZG9jdW1lbnQsIHRvIHNwbGl0IHRoZSBoaXN0b3J5IGluIHR3b1xuZnVuY3Rpb24gY29weUhpc3RvcnlBcnJheShldmVudHMsIG5ld0dyb3VwLCBpbnN0YW50aWF0ZVNlbCkge1xuICB2YXIgY29weSA9IFtdO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGV2ZW50cy5sZW5ndGg7ICsraSkge1xuICAgIHZhciBldmVudCA9IGV2ZW50c1tpXTtcbiAgICBpZiAoZXZlbnQucmFuZ2VzKSB7XG4gICAgICBjb3B5LnB1c2goaW5zdGFudGlhdGVTZWwgPyBTZWxlY3Rpb24ucHJvdG90eXBlLmRlZXBDb3B5LmNhbGwoZXZlbnQpIDogZXZlbnQpO1xuICAgICAgY29udGludWVcbiAgICB9XG4gICAgdmFyIGNoYW5nZXMgPSBldmVudC5jaGFuZ2VzLCBuZXdDaGFuZ2VzID0gW107XG4gICAgY29weS5wdXNoKHtjaGFuZ2VzOiBuZXdDaGFuZ2VzfSk7XG4gICAgZm9yICh2YXIgaiA9IDA7IGogPCBjaGFuZ2VzLmxlbmd0aDsgKytqKSB7XG4gICAgICB2YXIgY2hhbmdlID0gY2hhbmdlc1tqXSwgbSA9ICh2b2lkIDApO1xuICAgICAgbmV3Q2hhbmdlcy5wdXNoKHtmcm9tOiBjaGFuZ2UuZnJvbSwgdG86IGNoYW5nZS50bywgdGV4dDogY2hhbmdlLnRleHR9KTtcbiAgICAgIGlmIChuZXdHcm91cCkgeyBmb3IgKHZhciBwcm9wIGluIGNoYW5nZSkgeyBpZiAobSA9IHByb3AubWF0Y2goL15zcGFuc18oXFxkKykkLykpIHtcbiAgICAgICAgaWYgKGluZGV4T2YobmV3R3JvdXAsIE51bWJlcihtWzFdKSkgPiAtMSkge1xuICAgICAgICAgIGxzdChuZXdDaGFuZ2VzKVtwcm9wXSA9IGNoYW5nZVtwcm9wXTtcbiAgICAgICAgICBkZWxldGUgY2hhbmdlW3Byb3BdO1xuICAgICAgICB9XG4gICAgICB9IH0gfVxuICAgIH1cbiAgfVxuICByZXR1cm4gY29weVxufVxuXG4vLyBUaGUgJ3Njcm9sbCcgcGFyYW1ldGVyIGdpdmVuIHRvIG1hbnkgb2YgdGhlc2UgaW5kaWNhdGVkIHdoZXRoZXJcbi8vIHRoZSBuZXcgY3Vyc29yIHBvc2l0aW9uIHNob3VsZCBiZSBzY3JvbGxlZCBpbnRvIHZpZXcgYWZ0ZXJcbi8vIG1vZGlmeWluZyB0aGUgc2VsZWN0aW9uLlxuXG4vLyBJZiBzaGlmdCBpcyBoZWxkIG9yIHRoZSBleHRlbmQgZmxhZyBpcyBzZXQsIGV4dGVuZHMgYSByYW5nZSB0b1xuLy8gaW5jbHVkZSBhIGdpdmVuIHBvc2l0aW9uIChhbmQgb3B0aW9uYWxseSBhIHNlY29uZCBwb3NpdGlvbikuXG4vLyBPdGhlcndpc2UsIHNpbXBseSByZXR1cm5zIHRoZSByYW5nZSBiZXR3ZWVuIHRoZSBnaXZlbiBwb3NpdGlvbnMuXG4vLyBVc2VkIGZvciBjdXJzb3IgbW90aW9uIGFuZCBzdWNoLlxuZnVuY3Rpb24gZXh0ZW5kUmFuZ2UocmFuZ2UsIGhlYWQsIG90aGVyLCBleHRlbmQpIHtcbiAgaWYgKGV4dGVuZCkge1xuICAgIHZhciBhbmNob3IgPSByYW5nZS5hbmNob3I7XG4gICAgaWYgKG90aGVyKSB7XG4gICAgICB2YXIgcG9zQmVmb3JlID0gY21wKGhlYWQsIGFuY2hvcikgPCAwO1xuICAgICAgaWYgKHBvc0JlZm9yZSAhPSAoY21wKG90aGVyLCBhbmNob3IpIDwgMCkpIHtcbiAgICAgICAgYW5jaG9yID0gaGVhZDtcbiAgICAgICAgaGVhZCA9IG90aGVyO1xuICAgICAgfSBlbHNlIGlmIChwb3NCZWZvcmUgIT0gKGNtcChoZWFkLCBvdGhlcikgPCAwKSkge1xuICAgICAgICBoZWFkID0gb3RoZXI7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBuZXcgUmFuZ2UoYW5jaG9yLCBoZWFkKVxuICB9IGVsc2Uge1xuICAgIHJldHVybiBuZXcgUmFuZ2Uob3RoZXIgfHwgaGVhZCwgaGVhZClcbiAgfVxufVxuXG4vLyBFeHRlbmQgdGhlIHByaW1hcnkgc2VsZWN0aW9uIHJhbmdlLCBkaXNjYXJkIHRoZSByZXN0LlxuZnVuY3Rpb24gZXh0ZW5kU2VsZWN0aW9uKGRvYywgaGVhZCwgb3RoZXIsIG9wdGlvbnMsIGV4dGVuZCkge1xuICBpZiAoZXh0ZW5kID09IG51bGwpIHsgZXh0ZW5kID0gZG9jLmNtICYmIChkb2MuY20uZGlzcGxheS5zaGlmdCB8fCBkb2MuZXh0ZW5kKTsgfVxuICBzZXRTZWxlY3Rpb24oZG9jLCBuZXcgU2VsZWN0aW9uKFtleHRlbmRSYW5nZShkb2Muc2VsLnByaW1hcnkoKSwgaGVhZCwgb3RoZXIsIGV4dGVuZCldLCAwKSwgb3B0aW9ucyk7XG59XG5cbi8vIEV4dGVuZCBhbGwgc2VsZWN0aW9ucyAocG9zIGlzIGFuIGFycmF5IG9mIHNlbGVjdGlvbnMgd2l0aCBsZW5ndGhcbi8vIGVxdWFsIHRoZSBudW1iZXIgb2Ygc2VsZWN0aW9ucylcbmZ1bmN0aW9uIGV4dGVuZFNlbGVjdGlvbnMoZG9jLCBoZWFkcywgb3B0aW9ucykge1xuICB2YXIgb3V0ID0gW107XG4gIHZhciBleHRlbmQgPSBkb2MuY20gJiYgKGRvYy5jbS5kaXNwbGF5LnNoaWZ0IHx8IGRvYy5leHRlbmQpO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGRvYy5zZWwucmFuZ2VzLmxlbmd0aDsgaSsrKVxuICAgIHsgb3V0W2ldID0gZXh0ZW5kUmFuZ2UoZG9jLnNlbC5yYW5nZXNbaV0sIGhlYWRzW2ldLCBudWxsLCBleHRlbmQpOyB9XG4gIHZhciBuZXdTZWwgPSBub3JtYWxpemVTZWxlY3Rpb24ob3V0LCBkb2Muc2VsLnByaW1JbmRleCk7XG4gIHNldFNlbGVjdGlvbihkb2MsIG5ld1NlbCwgb3B0aW9ucyk7XG59XG5cbi8vIFVwZGF0ZXMgYSBzaW5nbGUgcmFuZ2UgaW4gdGhlIHNlbGVjdGlvbi5cbmZ1bmN0aW9uIHJlcGxhY2VPbmVTZWxlY3Rpb24oZG9jLCBpLCByYW5nZSwgb3B0aW9ucykge1xuICB2YXIgcmFuZ2VzID0gZG9jLnNlbC5yYW5nZXMuc2xpY2UoMCk7XG4gIHJhbmdlc1tpXSA9IHJhbmdlO1xuICBzZXRTZWxlY3Rpb24oZG9jLCBub3JtYWxpemVTZWxlY3Rpb24ocmFuZ2VzLCBkb2Muc2VsLnByaW1JbmRleCksIG9wdGlvbnMpO1xufVxuXG4vLyBSZXNldCB0aGUgc2VsZWN0aW9uIHRvIGEgc2luZ2xlIHJhbmdlLlxuZnVuY3Rpb24gc2V0U2ltcGxlU2VsZWN0aW9uKGRvYywgYW5jaG9yLCBoZWFkLCBvcHRpb25zKSB7XG4gIHNldFNlbGVjdGlvbihkb2MsIHNpbXBsZVNlbGVjdGlvbihhbmNob3IsIGhlYWQpLCBvcHRpb25zKTtcbn1cblxuLy8gR2l2ZSBiZWZvcmVTZWxlY3Rpb25DaGFuZ2UgaGFuZGxlcnMgYSBjaGFuZ2UgdG8gaW5mbHVlbmNlIGFcbi8vIHNlbGVjdGlvbiB1cGRhdGUuXG5mdW5jdGlvbiBmaWx0ZXJTZWxlY3Rpb25DaGFuZ2UoZG9jLCBzZWwsIG9wdGlvbnMpIHtcbiAgdmFyIG9iaiA9IHtcbiAgICByYW5nZXM6IHNlbC5yYW5nZXMsXG4gICAgdXBkYXRlOiBmdW5jdGlvbihyYW5nZXMpIHtcbiAgICAgIHZhciB0aGlzJDEgPSB0aGlzO1xuXG4gICAgICB0aGlzLnJhbmdlcyA9IFtdO1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCByYW5nZXMubGVuZ3RoOyBpKyspXG4gICAgICAgIHsgdGhpcyQxLnJhbmdlc1tpXSA9IG5ldyBSYW5nZShjbGlwUG9zKGRvYywgcmFuZ2VzW2ldLmFuY2hvciksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNsaXBQb3MoZG9jLCByYW5nZXNbaV0uaGVhZCkpOyB9XG4gICAgfSxcbiAgICBvcmlnaW46IG9wdGlvbnMgJiYgb3B0aW9ucy5vcmlnaW5cbiAgfTtcbiAgc2lnbmFsKGRvYywgXCJiZWZvcmVTZWxlY3Rpb25DaGFuZ2VcIiwgZG9jLCBvYmopO1xuICBpZiAoZG9jLmNtKSB7IHNpZ25hbChkb2MuY20sIFwiYmVmb3JlU2VsZWN0aW9uQ2hhbmdlXCIsIGRvYy5jbSwgb2JqKTsgfVxuICBpZiAob2JqLnJhbmdlcyAhPSBzZWwucmFuZ2VzKSB7IHJldHVybiBub3JtYWxpemVTZWxlY3Rpb24ob2JqLnJhbmdlcywgb2JqLnJhbmdlcy5sZW5ndGggLSAxKSB9XG4gIGVsc2UgeyByZXR1cm4gc2VsIH1cbn1cblxuZnVuY3Rpb24gc2V0U2VsZWN0aW9uUmVwbGFjZUhpc3RvcnkoZG9jLCBzZWwsIG9wdGlvbnMpIHtcbiAgdmFyIGRvbmUgPSBkb2MuaGlzdG9yeS5kb25lLCBsYXN0ID0gbHN0KGRvbmUpO1xuICBpZiAobGFzdCAmJiBsYXN0LnJhbmdlcykge1xuICAgIGRvbmVbZG9uZS5sZW5ndGggLSAxXSA9IHNlbDtcbiAgICBzZXRTZWxlY3Rpb25Ob1VuZG8oZG9jLCBzZWwsIG9wdGlvbnMpO1xuICB9IGVsc2Uge1xuICAgIHNldFNlbGVjdGlvbihkb2MsIHNlbCwgb3B0aW9ucyk7XG4gIH1cbn1cblxuLy8gU2V0IGEgbmV3IHNlbGVjdGlvbi5cbmZ1bmN0aW9uIHNldFNlbGVjdGlvbihkb2MsIHNlbCwgb3B0aW9ucykge1xuICBzZXRTZWxlY3Rpb25Ob1VuZG8oZG9jLCBzZWwsIG9wdGlvbnMpO1xuICBhZGRTZWxlY3Rpb25Ub0hpc3RvcnkoZG9jLCBkb2Muc2VsLCBkb2MuY20gPyBkb2MuY20uY3VyT3AuaWQgOiBOYU4sIG9wdGlvbnMpO1xufVxuXG5mdW5jdGlvbiBzZXRTZWxlY3Rpb25Ob1VuZG8oZG9jLCBzZWwsIG9wdGlvbnMpIHtcbiAgaWYgKGhhc0hhbmRsZXIoZG9jLCBcImJlZm9yZVNlbGVjdGlvbkNoYW5nZVwiKSB8fCBkb2MuY20gJiYgaGFzSGFuZGxlcihkb2MuY20sIFwiYmVmb3JlU2VsZWN0aW9uQ2hhbmdlXCIpKVxuICAgIHsgc2VsID0gZmlsdGVyU2VsZWN0aW9uQ2hhbmdlKGRvYywgc2VsLCBvcHRpb25zKTsgfVxuXG4gIHZhciBiaWFzID0gb3B0aW9ucyAmJiBvcHRpb25zLmJpYXMgfHxcbiAgICAoY21wKHNlbC5wcmltYXJ5KCkuaGVhZCwgZG9jLnNlbC5wcmltYXJ5KCkuaGVhZCkgPCAwID8gLTEgOiAxKTtcbiAgc2V0U2VsZWN0aW9uSW5uZXIoZG9jLCBza2lwQXRvbWljSW5TZWxlY3Rpb24oZG9jLCBzZWwsIGJpYXMsIHRydWUpKTtcblxuICBpZiAoIShvcHRpb25zICYmIG9wdGlvbnMuc2Nyb2xsID09PSBmYWxzZSkgJiYgZG9jLmNtKVxuICAgIHsgZW5zdXJlQ3Vyc29yVmlzaWJsZShkb2MuY20pOyB9XG59XG5cbmZ1bmN0aW9uIHNldFNlbGVjdGlvbklubmVyKGRvYywgc2VsKSB7XG4gIGlmIChzZWwuZXF1YWxzKGRvYy5zZWwpKSB7IHJldHVybiB9XG5cbiAgZG9jLnNlbCA9IHNlbDtcblxuICBpZiAoZG9jLmNtKSB7XG4gICAgZG9jLmNtLmN1ck9wLnVwZGF0ZUlucHV0ID0gZG9jLmNtLmN1ck9wLnNlbGVjdGlvbkNoYW5nZWQgPSB0cnVlO1xuICAgIHNpZ25hbEN1cnNvckFjdGl2aXR5KGRvYy5jbSk7XG4gIH1cbiAgc2lnbmFsTGF0ZXIoZG9jLCBcImN1cnNvckFjdGl2aXR5XCIsIGRvYyk7XG59XG5cbi8vIFZlcmlmeSB0aGF0IHRoZSBzZWxlY3Rpb24gZG9lcyBub3QgcGFydGlhbGx5IHNlbGVjdCBhbnkgYXRvbWljXG4vLyBtYXJrZWQgcmFuZ2VzLlxuZnVuY3Rpb24gcmVDaGVja1NlbGVjdGlvbihkb2MpIHtcbiAgc2V0U2VsZWN0aW9uSW5uZXIoZG9jLCBza2lwQXRvbWljSW5TZWxlY3Rpb24oZG9jLCBkb2Muc2VsLCBudWxsLCBmYWxzZSkpO1xufVxuXG4vLyBSZXR1cm4gYSBzZWxlY3Rpb24gdGhhdCBkb2VzIG5vdCBwYXJ0aWFsbHkgc2VsZWN0IGFueSBhdG9taWNcbi8vIHJhbmdlcy5cbmZ1bmN0aW9uIHNraXBBdG9taWNJblNlbGVjdGlvbihkb2MsIHNlbCwgYmlhcywgbWF5Q2xlYXIpIHtcbiAgdmFyIG91dDtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBzZWwucmFuZ2VzLmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIHJhbmdlID0gc2VsLnJhbmdlc1tpXTtcbiAgICB2YXIgb2xkID0gc2VsLnJhbmdlcy5sZW5ndGggPT0gZG9jLnNlbC5yYW5nZXMubGVuZ3RoICYmIGRvYy5zZWwucmFuZ2VzW2ldO1xuICAgIHZhciBuZXdBbmNob3IgPSBza2lwQXRvbWljKGRvYywgcmFuZ2UuYW5jaG9yLCBvbGQgJiYgb2xkLmFuY2hvciwgYmlhcywgbWF5Q2xlYXIpO1xuICAgIHZhciBuZXdIZWFkID0gc2tpcEF0b21pYyhkb2MsIHJhbmdlLmhlYWQsIG9sZCAmJiBvbGQuaGVhZCwgYmlhcywgbWF5Q2xlYXIpO1xuICAgIGlmIChvdXQgfHwgbmV3QW5jaG9yICE9IHJhbmdlLmFuY2hvciB8fCBuZXdIZWFkICE9IHJhbmdlLmhlYWQpIHtcbiAgICAgIGlmICghb3V0KSB7IG91dCA9IHNlbC5yYW5nZXMuc2xpY2UoMCwgaSk7IH1cbiAgICAgIG91dFtpXSA9IG5ldyBSYW5nZShuZXdBbmNob3IsIG5ld0hlYWQpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gb3V0ID8gbm9ybWFsaXplU2VsZWN0aW9uKG91dCwgc2VsLnByaW1JbmRleCkgOiBzZWxcbn1cblxuZnVuY3Rpb24gc2tpcEF0b21pY0lubmVyKGRvYywgcG9zLCBvbGRQb3MsIGRpciwgbWF5Q2xlYXIpIHtcbiAgdmFyIGxpbmUgPSBnZXRMaW5lKGRvYywgcG9zLmxpbmUpO1xuICBpZiAobGluZS5tYXJrZWRTcGFucykgeyBmb3IgKHZhciBpID0gMDsgaSA8IGxpbmUubWFya2VkU3BhbnMubGVuZ3RoOyArK2kpIHtcbiAgICB2YXIgc3AgPSBsaW5lLm1hcmtlZFNwYW5zW2ldLCBtID0gc3AubWFya2VyO1xuICAgIGlmICgoc3AuZnJvbSA9PSBudWxsIHx8IChtLmluY2x1c2l2ZUxlZnQgPyBzcC5mcm9tIDw9IHBvcy5jaCA6IHNwLmZyb20gPCBwb3MuY2gpKSAmJlxuICAgICAgICAoc3AudG8gPT0gbnVsbCB8fCAobS5pbmNsdXNpdmVSaWdodCA/IHNwLnRvID49IHBvcy5jaCA6IHNwLnRvID4gcG9zLmNoKSkpIHtcbiAgICAgIGlmIChtYXlDbGVhcikge1xuICAgICAgICBzaWduYWwobSwgXCJiZWZvcmVDdXJzb3JFbnRlclwiKTtcbiAgICAgICAgaWYgKG0uZXhwbGljaXRseUNsZWFyZWQpIHtcbiAgICAgICAgICBpZiAoIWxpbmUubWFya2VkU3BhbnMpIHsgYnJlYWsgfVxuICAgICAgICAgIGVsc2Ugey0taTsgY29udGludWV9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmICghbS5hdG9taWMpIHsgY29udGludWUgfVxuXG4gICAgICBpZiAob2xkUG9zKSB7XG4gICAgICAgIHZhciBuZWFyID0gbS5maW5kKGRpciA8IDAgPyAxIDogLTEpLCBkaWZmID0gKHZvaWQgMCk7XG4gICAgICAgIGlmIChkaXIgPCAwID8gbS5pbmNsdXNpdmVSaWdodCA6IG0uaW5jbHVzaXZlTGVmdClcbiAgICAgICAgICB7IG5lYXIgPSBtb3ZlUG9zKGRvYywgbmVhciwgLWRpciwgbmVhciAmJiBuZWFyLmxpbmUgPT0gcG9zLmxpbmUgPyBsaW5lIDogbnVsbCk7IH1cbiAgICAgICAgaWYgKG5lYXIgJiYgbmVhci5saW5lID09IHBvcy5saW5lICYmIChkaWZmID0gY21wKG5lYXIsIG9sZFBvcykpICYmIChkaXIgPCAwID8gZGlmZiA8IDAgOiBkaWZmID4gMCkpXG4gICAgICAgICAgeyByZXR1cm4gc2tpcEF0b21pY0lubmVyKGRvYywgbmVhciwgcG9zLCBkaXIsIG1heUNsZWFyKSB9XG4gICAgICB9XG5cbiAgICAgIHZhciBmYXIgPSBtLmZpbmQoZGlyIDwgMCA/IC0xIDogMSk7XG4gICAgICBpZiAoZGlyIDwgMCA/IG0uaW5jbHVzaXZlTGVmdCA6IG0uaW5jbHVzaXZlUmlnaHQpXG4gICAgICAgIHsgZmFyID0gbW92ZVBvcyhkb2MsIGZhciwgZGlyLCBmYXIubGluZSA9PSBwb3MubGluZSA/IGxpbmUgOiBudWxsKTsgfVxuICAgICAgcmV0dXJuIGZhciA/IHNraXBBdG9taWNJbm5lcihkb2MsIGZhciwgcG9zLCBkaXIsIG1heUNsZWFyKSA6IG51bGxcbiAgICB9XG4gIH0gfVxuICByZXR1cm4gcG9zXG59XG5cbi8vIEVuc3VyZSBhIGdpdmVuIHBvc2l0aW9uIGlzIG5vdCBpbnNpZGUgYW4gYXRvbWljIHJhbmdlLlxuZnVuY3Rpb24gc2tpcEF0b21pYyhkb2MsIHBvcywgb2xkUG9zLCBiaWFzLCBtYXlDbGVhcikge1xuICB2YXIgZGlyID0gYmlhcyB8fCAxO1xuICB2YXIgZm91bmQgPSBza2lwQXRvbWljSW5uZXIoZG9jLCBwb3MsIG9sZFBvcywgZGlyLCBtYXlDbGVhcikgfHxcbiAgICAgICghbWF5Q2xlYXIgJiYgc2tpcEF0b21pY0lubmVyKGRvYywgcG9zLCBvbGRQb3MsIGRpciwgdHJ1ZSkpIHx8XG4gICAgICBza2lwQXRvbWljSW5uZXIoZG9jLCBwb3MsIG9sZFBvcywgLWRpciwgbWF5Q2xlYXIpIHx8XG4gICAgICAoIW1heUNsZWFyICYmIHNraXBBdG9taWNJbm5lcihkb2MsIHBvcywgb2xkUG9zLCAtZGlyLCB0cnVlKSk7XG4gIGlmICghZm91bmQpIHtcbiAgICBkb2MuY2FudEVkaXQgPSB0cnVlO1xuICAgIHJldHVybiBQb3MoZG9jLmZpcnN0LCAwKVxuICB9XG4gIHJldHVybiBmb3VuZFxufVxuXG5mdW5jdGlvbiBtb3ZlUG9zKGRvYywgcG9zLCBkaXIsIGxpbmUpIHtcbiAgaWYgKGRpciA8IDAgJiYgcG9zLmNoID09IDApIHtcbiAgICBpZiAocG9zLmxpbmUgPiBkb2MuZmlyc3QpIHsgcmV0dXJuIGNsaXBQb3MoZG9jLCBQb3MocG9zLmxpbmUgLSAxKSkgfVxuICAgIGVsc2UgeyByZXR1cm4gbnVsbCB9XG4gIH0gZWxzZSBpZiAoZGlyID4gMCAmJiBwb3MuY2ggPT0gKGxpbmUgfHwgZ2V0TGluZShkb2MsIHBvcy5saW5lKSkudGV4dC5sZW5ndGgpIHtcbiAgICBpZiAocG9zLmxpbmUgPCBkb2MuZmlyc3QgKyBkb2Muc2l6ZSAtIDEpIHsgcmV0dXJuIFBvcyhwb3MubGluZSArIDEsIDApIH1cbiAgICBlbHNlIHsgcmV0dXJuIG51bGwgfVxuICB9IGVsc2Uge1xuICAgIHJldHVybiBuZXcgUG9zKHBvcy5saW5lLCBwb3MuY2ggKyBkaXIpXG4gIH1cbn1cblxuZnVuY3Rpb24gc2VsZWN0QWxsKGNtKSB7XG4gIGNtLnNldFNlbGVjdGlvbihQb3MoY20uZmlyc3RMaW5lKCksIDApLCBQb3MoY20ubGFzdExpbmUoKSksIHNlbF9kb250U2Nyb2xsKTtcbn1cblxuLy8gVVBEQVRJTkdcblxuLy8gQWxsb3cgXCJiZWZvcmVDaGFuZ2VcIiBldmVudCBoYW5kbGVycyB0byBpbmZsdWVuY2UgYSBjaGFuZ2VcbmZ1bmN0aW9uIGZpbHRlckNoYW5nZShkb2MsIGNoYW5nZSwgdXBkYXRlKSB7XG4gIHZhciBvYmogPSB7XG4gICAgY2FuY2VsZWQ6IGZhbHNlLFxuICAgIGZyb206IGNoYW5nZS5mcm9tLFxuICAgIHRvOiBjaGFuZ2UudG8sXG4gICAgdGV4dDogY2hhbmdlLnRleHQsXG4gICAgb3JpZ2luOiBjaGFuZ2Uub3JpZ2luLFxuICAgIGNhbmNlbDogZnVuY3Rpb24gKCkgeyByZXR1cm4gb2JqLmNhbmNlbGVkID0gdHJ1ZTsgfVxuICB9O1xuICBpZiAodXBkYXRlKSB7IG9iai51cGRhdGUgPSBmdW5jdGlvbiAoZnJvbSwgdG8sIHRleHQsIG9yaWdpbikge1xuICAgIGlmIChmcm9tKSB7IG9iai5mcm9tID0gY2xpcFBvcyhkb2MsIGZyb20pOyB9XG4gICAgaWYgKHRvKSB7IG9iai50byA9IGNsaXBQb3MoZG9jLCB0byk7IH1cbiAgICBpZiAodGV4dCkgeyBvYmoudGV4dCA9IHRleHQ7IH1cbiAgICBpZiAob3JpZ2luICE9PSB1bmRlZmluZWQpIHsgb2JqLm9yaWdpbiA9IG9yaWdpbjsgfVxuICB9OyB9XG4gIHNpZ25hbChkb2MsIFwiYmVmb3JlQ2hhbmdlXCIsIGRvYywgb2JqKTtcbiAgaWYgKGRvYy5jbSkgeyBzaWduYWwoZG9jLmNtLCBcImJlZm9yZUNoYW5nZVwiLCBkb2MuY20sIG9iaik7IH1cblxuICBpZiAob2JqLmNhbmNlbGVkKSB7IHJldHVybiBudWxsIH1cbiAgcmV0dXJuIHtmcm9tOiBvYmouZnJvbSwgdG86IG9iai50bywgdGV4dDogb2JqLnRleHQsIG9yaWdpbjogb2JqLm9yaWdpbn1cbn1cblxuLy8gQXBwbHkgYSBjaGFuZ2UgdG8gYSBkb2N1bWVudCwgYW5kIGFkZCBpdCB0byB0aGUgZG9jdW1lbnQnc1xuLy8gaGlzdG9yeSwgYW5kIHByb3BhZ2F0aW5nIGl0IHRvIGFsbCBsaW5rZWQgZG9jdW1lbnRzLlxuZnVuY3Rpb24gbWFrZUNoYW5nZShkb2MsIGNoYW5nZSwgaWdub3JlUmVhZE9ubHkpIHtcbiAgaWYgKGRvYy5jbSkge1xuICAgIGlmICghZG9jLmNtLmN1ck9wKSB7IHJldHVybiBvcGVyYXRpb24oZG9jLmNtLCBtYWtlQ2hhbmdlKShkb2MsIGNoYW5nZSwgaWdub3JlUmVhZE9ubHkpIH1cbiAgICBpZiAoZG9jLmNtLnN0YXRlLnN1cHByZXNzRWRpdHMpIHsgcmV0dXJuIH1cbiAgfVxuXG4gIGlmIChoYXNIYW5kbGVyKGRvYywgXCJiZWZvcmVDaGFuZ2VcIikgfHwgZG9jLmNtICYmIGhhc0hhbmRsZXIoZG9jLmNtLCBcImJlZm9yZUNoYW5nZVwiKSkge1xuICAgIGNoYW5nZSA9IGZpbHRlckNoYW5nZShkb2MsIGNoYW5nZSwgdHJ1ZSk7XG4gICAgaWYgKCFjaGFuZ2UpIHsgcmV0dXJuIH1cbiAgfVxuXG4gIC8vIFBvc3NpYmx5IHNwbGl0IG9yIHN1cHByZXNzIHRoZSB1cGRhdGUgYmFzZWQgb24gdGhlIHByZXNlbmNlXG4gIC8vIG9mIHJlYWQtb25seSBzcGFucyBpbiBpdHMgcmFuZ2UuXG4gIHZhciBzcGxpdCA9IHNhd1JlYWRPbmx5U3BhbnMgJiYgIWlnbm9yZVJlYWRPbmx5ICYmIHJlbW92ZVJlYWRPbmx5UmFuZ2VzKGRvYywgY2hhbmdlLmZyb20sIGNoYW5nZS50byk7XG4gIGlmIChzcGxpdCkge1xuICAgIGZvciAodmFyIGkgPSBzcGxpdC5sZW5ndGggLSAxOyBpID49IDA7IC0taSlcbiAgICAgIHsgbWFrZUNoYW5nZUlubmVyKGRvYywge2Zyb206IHNwbGl0W2ldLmZyb20sIHRvOiBzcGxpdFtpXS50bywgdGV4dDogaSA/IFtcIlwiXSA6IGNoYW5nZS50ZXh0LCBvcmlnaW46IGNoYW5nZS5vcmlnaW59KTsgfVxuICB9IGVsc2Uge1xuICAgIG1ha2VDaGFuZ2VJbm5lcihkb2MsIGNoYW5nZSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gbWFrZUNoYW5nZUlubmVyKGRvYywgY2hhbmdlKSB7XG4gIGlmIChjaGFuZ2UudGV4dC5sZW5ndGggPT0gMSAmJiBjaGFuZ2UudGV4dFswXSA9PSBcIlwiICYmIGNtcChjaGFuZ2UuZnJvbSwgY2hhbmdlLnRvKSA9PSAwKSB7IHJldHVybiB9XG4gIHZhciBzZWxBZnRlciA9IGNvbXB1dGVTZWxBZnRlckNoYW5nZShkb2MsIGNoYW5nZSk7XG4gIGFkZENoYW5nZVRvSGlzdG9yeShkb2MsIGNoYW5nZSwgc2VsQWZ0ZXIsIGRvYy5jbSA/IGRvYy5jbS5jdXJPcC5pZCA6IE5hTik7XG5cbiAgbWFrZUNoYW5nZVNpbmdsZURvYyhkb2MsIGNoYW5nZSwgc2VsQWZ0ZXIsIHN0cmV0Y2hTcGFuc092ZXJDaGFuZ2UoZG9jLCBjaGFuZ2UpKTtcbiAgdmFyIHJlYmFzZWQgPSBbXTtcblxuICBsaW5rZWREb2NzKGRvYywgZnVuY3Rpb24gKGRvYywgc2hhcmVkSGlzdCkge1xuICAgIGlmICghc2hhcmVkSGlzdCAmJiBpbmRleE9mKHJlYmFzZWQsIGRvYy5oaXN0b3J5KSA9PSAtMSkge1xuICAgICAgcmViYXNlSGlzdChkb2MuaGlzdG9yeSwgY2hhbmdlKTtcbiAgICAgIHJlYmFzZWQucHVzaChkb2MuaGlzdG9yeSk7XG4gICAgfVxuICAgIG1ha2VDaGFuZ2VTaW5nbGVEb2MoZG9jLCBjaGFuZ2UsIG51bGwsIHN0cmV0Y2hTcGFuc092ZXJDaGFuZ2UoZG9jLCBjaGFuZ2UpKTtcbiAgfSk7XG59XG5cbi8vIFJldmVydCBhIGNoYW5nZSBzdG9yZWQgaW4gYSBkb2N1bWVudCdzIGhpc3RvcnkuXG5mdW5jdGlvbiBtYWtlQ2hhbmdlRnJvbUhpc3RvcnkoZG9jLCB0eXBlLCBhbGxvd1NlbGVjdGlvbk9ubHkpIHtcbiAgdmFyIHN1cHByZXNzID0gZG9jLmNtICYmIGRvYy5jbS5zdGF0ZS5zdXBwcmVzc0VkaXRzO1xuICBpZiAoc3VwcHJlc3MgJiYgIWFsbG93U2VsZWN0aW9uT25seSkgeyByZXR1cm4gfVxuXG4gIHZhciBoaXN0ID0gZG9jLmhpc3RvcnksIGV2ZW50LCBzZWxBZnRlciA9IGRvYy5zZWw7XG4gIHZhciBzb3VyY2UgPSB0eXBlID09IFwidW5kb1wiID8gaGlzdC5kb25lIDogaGlzdC51bmRvbmUsIGRlc3QgPSB0eXBlID09IFwidW5kb1wiID8gaGlzdC51bmRvbmUgOiBoaXN0LmRvbmU7XG5cbiAgLy8gVmVyaWZ5IHRoYXQgdGhlcmUgaXMgYSB1c2VhYmxlIGV2ZW50IChzbyB0aGF0IGN0cmwteiB3b24ndFxuICAvLyBuZWVkbGVzc2x5IGNsZWFyIHNlbGVjdGlvbiBldmVudHMpXG4gIHZhciBpID0gMDtcbiAgZm9yICg7IGkgPCBzb3VyY2UubGVuZ3RoOyBpKyspIHtcbiAgICBldmVudCA9IHNvdXJjZVtpXTtcbiAgICBpZiAoYWxsb3dTZWxlY3Rpb25Pbmx5ID8gZXZlbnQucmFuZ2VzICYmICFldmVudC5lcXVhbHMoZG9jLnNlbCkgOiAhZXZlbnQucmFuZ2VzKVxuICAgICAgeyBicmVhayB9XG4gIH1cbiAgaWYgKGkgPT0gc291cmNlLmxlbmd0aCkgeyByZXR1cm4gfVxuICBoaXN0Lmxhc3RPcmlnaW4gPSBoaXN0Lmxhc3RTZWxPcmlnaW4gPSBudWxsO1xuXG4gIGZvciAoOzspIHtcbiAgICBldmVudCA9IHNvdXJjZS5wb3AoKTtcbiAgICBpZiAoZXZlbnQucmFuZ2VzKSB7XG4gICAgICBwdXNoU2VsZWN0aW9uVG9IaXN0b3J5KGV2ZW50LCBkZXN0KTtcbiAgICAgIGlmIChhbGxvd1NlbGVjdGlvbk9ubHkgJiYgIWV2ZW50LmVxdWFscyhkb2Muc2VsKSkge1xuICAgICAgICBzZXRTZWxlY3Rpb24oZG9jLCBldmVudCwge2NsZWFyUmVkbzogZmFsc2V9KTtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG4gICAgICBzZWxBZnRlciA9IGV2ZW50O1xuICAgIH0gZWxzZSBpZiAoc3VwcHJlc3MpIHtcbiAgICAgIHNvdXJjZS5wdXNoKGV2ZW50KTtcbiAgICAgIHJldHVyblxuICAgIH0gZWxzZSB7IGJyZWFrIH1cbiAgfVxuXG4gIC8vIEJ1aWxkIHVwIGEgcmV2ZXJzZSBjaGFuZ2Ugb2JqZWN0IHRvIGFkZCB0byB0aGUgb3Bwb3NpdGUgaGlzdG9yeVxuICAvLyBzdGFjayAocmVkbyB3aGVuIHVuZG9pbmcsIGFuZCB2aWNlIHZlcnNhKS5cbiAgdmFyIGFudGlDaGFuZ2VzID0gW107XG4gIHB1c2hTZWxlY3Rpb25Ub0hpc3Rvcnkoc2VsQWZ0ZXIsIGRlc3QpO1xuICBkZXN0LnB1c2goe2NoYW5nZXM6IGFudGlDaGFuZ2VzLCBnZW5lcmF0aW9uOiBoaXN0LmdlbmVyYXRpb259KTtcbiAgaGlzdC5nZW5lcmF0aW9uID0gZXZlbnQuZ2VuZXJhdGlvbiB8fCArK2hpc3QubWF4R2VuZXJhdGlvbjtcblxuICB2YXIgZmlsdGVyID0gaGFzSGFuZGxlcihkb2MsIFwiYmVmb3JlQ2hhbmdlXCIpIHx8IGRvYy5jbSAmJiBoYXNIYW5kbGVyKGRvYy5jbSwgXCJiZWZvcmVDaGFuZ2VcIik7XG5cbiAgdmFyIGxvb3AgPSBmdW5jdGlvbiAoIGkgKSB7XG4gICAgdmFyIGNoYW5nZSA9IGV2ZW50LmNoYW5nZXNbaV07XG4gICAgY2hhbmdlLm9yaWdpbiA9IHR5cGU7XG4gICAgaWYgKGZpbHRlciAmJiAhZmlsdGVyQ2hhbmdlKGRvYywgY2hhbmdlLCBmYWxzZSkpIHtcbiAgICAgIHNvdXJjZS5sZW5ndGggPSAwO1xuICAgICAgcmV0dXJuIHt9XG4gICAgfVxuXG4gICAgYW50aUNoYW5nZXMucHVzaChoaXN0b3J5Q2hhbmdlRnJvbUNoYW5nZShkb2MsIGNoYW5nZSkpO1xuXG4gICAgdmFyIGFmdGVyID0gaSA/IGNvbXB1dGVTZWxBZnRlckNoYW5nZShkb2MsIGNoYW5nZSkgOiBsc3Qoc291cmNlKTtcbiAgICBtYWtlQ2hhbmdlU2luZ2xlRG9jKGRvYywgY2hhbmdlLCBhZnRlciwgbWVyZ2VPbGRTcGFucyhkb2MsIGNoYW5nZSkpO1xuICAgIGlmICghaSAmJiBkb2MuY20pIHsgZG9jLmNtLnNjcm9sbEludG9WaWV3KHtmcm9tOiBjaGFuZ2UuZnJvbSwgdG86IGNoYW5nZUVuZChjaGFuZ2UpfSk7IH1cbiAgICB2YXIgcmViYXNlZCA9IFtdO1xuXG4gICAgLy8gUHJvcGFnYXRlIHRvIHRoZSBsaW5rZWQgZG9jdW1lbnRzXG4gICAgbGlua2VkRG9jcyhkb2MsIGZ1bmN0aW9uIChkb2MsIHNoYXJlZEhpc3QpIHtcbiAgICAgIGlmICghc2hhcmVkSGlzdCAmJiBpbmRleE9mKHJlYmFzZWQsIGRvYy5oaXN0b3J5KSA9PSAtMSkge1xuICAgICAgICByZWJhc2VIaXN0KGRvYy5oaXN0b3J5LCBjaGFuZ2UpO1xuICAgICAgICByZWJhc2VkLnB1c2goZG9jLmhpc3RvcnkpO1xuICAgICAgfVxuICAgICAgbWFrZUNoYW5nZVNpbmdsZURvYyhkb2MsIGNoYW5nZSwgbnVsbCwgbWVyZ2VPbGRTcGFucyhkb2MsIGNoYW5nZSkpO1xuICAgIH0pO1xuICB9O1xuXG4gIGZvciAodmFyIGkkMSA9IGV2ZW50LmNoYW5nZXMubGVuZ3RoIC0gMTsgaSQxID49IDA7IC0taSQxKSB7XG4gICAgdmFyIHJldHVybmVkID0gbG9vcCggaSQxICk7XG5cbiAgICBpZiAoIHJldHVybmVkICkgcmV0dXJuIHJldHVybmVkLnY7XG4gIH1cbn1cblxuLy8gU3ViLXZpZXdzIG5lZWQgdGhlaXIgbGluZSBudW1iZXJzIHNoaWZ0ZWQgd2hlbiB0ZXh0IGlzIGFkZGVkXG4vLyBhYm92ZSBvciBiZWxvdyB0aGVtIGluIHRoZSBwYXJlbnQgZG9jdW1lbnQuXG5mdW5jdGlvbiBzaGlmdERvYyhkb2MsIGRpc3RhbmNlKSB7XG4gIGlmIChkaXN0YW5jZSA9PSAwKSB7IHJldHVybiB9XG4gIGRvYy5maXJzdCArPSBkaXN0YW5jZTtcbiAgZG9jLnNlbCA9IG5ldyBTZWxlY3Rpb24obWFwKGRvYy5zZWwucmFuZ2VzLCBmdW5jdGlvbiAocmFuZ2UpIHsgcmV0dXJuIG5ldyBSYW5nZShcbiAgICBQb3MocmFuZ2UuYW5jaG9yLmxpbmUgKyBkaXN0YW5jZSwgcmFuZ2UuYW5jaG9yLmNoKSxcbiAgICBQb3MocmFuZ2UuaGVhZC5saW5lICsgZGlzdGFuY2UsIHJhbmdlLmhlYWQuY2gpXG4gICk7IH0pLCBkb2Muc2VsLnByaW1JbmRleCk7XG4gIGlmIChkb2MuY20pIHtcbiAgICByZWdDaGFuZ2UoZG9jLmNtLCBkb2MuZmlyc3QsIGRvYy5maXJzdCAtIGRpc3RhbmNlLCBkaXN0YW5jZSk7XG4gICAgZm9yICh2YXIgZCA9IGRvYy5jbS5kaXNwbGF5LCBsID0gZC52aWV3RnJvbTsgbCA8IGQudmlld1RvOyBsKyspXG4gICAgICB7IHJlZ0xpbmVDaGFuZ2UoZG9jLmNtLCBsLCBcImd1dHRlclwiKTsgfVxuICB9XG59XG5cbi8vIE1vcmUgbG93ZXItbGV2ZWwgY2hhbmdlIGZ1bmN0aW9uLCBoYW5kbGluZyBvbmx5IGEgc2luZ2xlIGRvY3VtZW50XG4vLyAobm90IGxpbmtlZCBvbmVzKS5cbmZ1bmN0aW9uIG1ha2VDaGFuZ2VTaW5nbGVEb2MoZG9jLCBjaGFuZ2UsIHNlbEFmdGVyLCBzcGFucykge1xuICBpZiAoZG9jLmNtICYmICFkb2MuY20uY3VyT3ApXG4gICAgeyByZXR1cm4gb3BlcmF0aW9uKGRvYy5jbSwgbWFrZUNoYW5nZVNpbmdsZURvYykoZG9jLCBjaGFuZ2UsIHNlbEFmdGVyLCBzcGFucykgfVxuXG4gIGlmIChjaGFuZ2UudG8ubGluZSA8IGRvYy5maXJzdCkge1xuICAgIHNoaWZ0RG9jKGRvYywgY2hhbmdlLnRleHQubGVuZ3RoIC0gMSAtIChjaGFuZ2UudG8ubGluZSAtIGNoYW5nZS5mcm9tLmxpbmUpKTtcbiAgICByZXR1cm5cbiAgfVxuICBpZiAoY2hhbmdlLmZyb20ubGluZSA+IGRvYy5sYXN0TGluZSgpKSB7IHJldHVybiB9XG5cbiAgLy8gQ2xpcCB0aGUgY2hhbmdlIHRvIHRoZSBzaXplIG9mIHRoaXMgZG9jXG4gIGlmIChjaGFuZ2UuZnJvbS5saW5lIDwgZG9jLmZpcnN0KSB7XG4gICAgdmFyIHNoaWZ0ID0gY2hhbmdlLnRleHQubGVuZ3RoIC0gMSAtIChkb2MuZmlyc3QgLSBjaGFuZ2UuZnJvbS5saW5lKTtcbiAgICBzaGlmdERvYyhkb2MsIHNoaWZ0KTtcbiAgICBjaGFuZ2UgPSB7ZnJvbTogUG9zKGRvYy5maXJzdCwgMCksIHRvOiBQb3MoY2hhbmdlLnRvLmxpbmUgKyBzaGlmdCwgY2hhbmdlLnRvLmNoKSxcbiAgICAgICAgICAgICAgdGV4dDogW2xzdChjaGFuZ2UudGV4dCldLCBvcmlnaW46IGNoYW5nZS5vcmlnaW59O1xuICB9XG4gIHZhciBsYXN0ID0gZG9jLmxhc3RMaW5lKCk7XG4gIGlmIChjaGFuZ2UudG8ubGluZSA+IGxhc3QpIHtcbiAgICBjaGFuZ2UgPSB7ZnJvbTogY2hhbmdlLmZyb20sIHRvOiBQb3MobGFzdCwgZ2V0TGluZShkb2MsIGxhc3QpLnRleHQubGVuZ3RoKSxcbiAgICAgICAgICAgICAgdGV4dDogW2NoYW5nZS50ZXh0WzBdXSwgb3JpZ2luOiBjaGFuZ2Uub3JpZ2lufTtcbiAgfVxuXG4gIGNoYW5nZS5yZW1vdmVkID0gZ2V0QmV0d2Vlbihkb2MsIGNoYW5nZS5mcm9tLCBjaGFuZ2UudG8pO1xuXG4gIGlmICghc2VsQWZ0ZXIpIHsgc2VsQWZ0ZXIgPSBjb21wdXRlU2VsQWZ0ZXJDaGFuZ2UoZG9jLCBjaGFuZ2UpOyB9XG4gIGlmIChkb2MuY20pIHsgbWFrZUNoYW5nZVNpbmdsZURvY0luRWRpdG9yKGRvYy5jbSwgY2hhbmdlLCBzcGFucyk7IH1cbiAgZWxzZSB7IHVwZGF0ZURvYyhkb2MsIGNoYW5nZSwgc3BhbnMpOyB9XG4gIHNldFNlbGVjdGlvbk5vVW5kbyhkb2MsIHNlbEFmdGVyLCBzZWxfZG9udFNjcm9sbCk7XG59XG5cbi8vIEhhbmRsZSB0aGUgaW50ZXJhY3Rpb24gb2YgYSBjaGFuZ2UgdG8gYSBkb2N1bWVudCB3aXRoIHRoZSBlZGl0b3Jcbi8vIHRoYXQgdGhpcyBkb2N1bWVudCBpcyBwYXJ0IG9mLlxuZnVuY3Rpb24gbWFrZUNoYW5nZVNpbmdsZURvY0luRWRpdG9yKGNtLCBjaGFuZ2UsIHNwYW5zKSB7XG4gIHZhciBkb2MgPSBjbS5kb2MsIGRpc3BsYXkgPSBjbS5kaXNwbGF5LCBmcm9tID0gY2hhbmdlLmZyb20sIHRvID0gY2hhbmdlLnRvO1xuXG4gIHZhciByZWNvbXB1dGVNYXhMZW5ndGggPSBmYWxzZSwgY2hlY2tXaWR0aFN0YXJ0ID0gZnJvbS5saW5lO1xuICBpZiAoIWNtLm9wdGlvbnMubGluZVdyYXBwaW5nKSB7XG4gICAgY2hlY2tXaWR0aFN0YXJ0ID0gbGluZU5vKHZpc3VhbExpbmUoZ2V0TGluZShkb2MsIGZyb20ubGluZSkpKTtcbiAgICBkb2MuaXRlcihjaGVja1dpZHRoU3RhcnQsIHRvLmxpbmUgKyAxLCBmdW5jdGlvbiAobGluZSkge1xuICAgICAgaWYgKGxpbmUgPT0gZGlzcGxheS5tYXhMaW5lKSB7XG4gICAgICAgIHJlY29tcHV0ZU1heExlbmd0aCA9IHRydWU7XG4gICAgICAgIHJldHVybiB0cnVlXG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICBpZiAoZG9jLnNlbC5jb250YWlucyhjaGFuZ2UuZnJvbSwgY2hhbmdlLnRvKSA+IC0xKVxuICAgIHsgc2lnbmFsQ3Vyc29yQWN0aXZpdHkoY20pOyB9XG5cbiAgdXBkYXRlRG9jKGRvYywgY2hhbmdlLCBzcGFucywgZXN0aW1hdGVIZWlnaHQoY20pKTtcblxuICBpZiAoIWNtLm9wdGlvbnMubGluZVdyYXBwaW5nKSB7XG4gICAgZG9jLml0ZXIoY2hlY2tXaWR0aFN0YXJ0LCBmcm9tLmxpbmUgKyBjaGFuZ2UudGV4dC5sZW5ndGgsIGZ1bmN0aW9uIChsaW5lKSB7XG4gICAgICB2YXIgbGVuID0gbGluZUxlbmd0aChsaW5lKTtcbiAgICAgIGlmIChsZW4gPiBkaXNwbGF5Lm1heExpbmVMZW5ndGgpIHtcbiAgICAgICAgZGlzcGxheS5tYXhMaW5lID0gbGluZTtcbiAgICAgICAgZGlzcGxheS5tYXhMaW5lTGVuZ3RoID0gbGVuO1xuICAgICAgICBkaXNwbGF5Lm1heExpbmVDaGFuZ2VkID0gdHJ1ZTtcbiAgICAgICAgcmVjb21wdXRlTWF4TGVuZ3RoID0gZmFsc2U7XG4gICAgICB9XG4gICAgfSk7XG4gICAgaWYgKHJlY29tcHV0ZU1heExlbmd0aCkgeyBjbS5jdXJPcC51cGRhdGVNYXhMaW5lID0gdHJ1ZTsgfVxuICB9XG5cbiAgcmV0cmVhdEZyb250aWVyKGRvYywgZnJvbS5saW5lKTtcbiAgc3RhcnRXb3JrZXIoY20sIDQwMCk7XG5cbiAgdmFyIGxlbmRpZmYgPSBjaGFuZ2UudGV4dC5sZW5ndGggLSAodG8ubGluZSAtIGZyb20ubGluZSkgLSAxO1xuICAvLyBSZW1lbWJlciB0aGF0IHRoZXNlIGxpbmVzIGNoYW5nZWQsIGZvciB1cGRhdGluZyB0aGUgZGlzcGxheVxuICBpZiAoY2hhbmdlLmZ1bGwpXG4gICAgeyByZWdDaGFuZ2UoY20pOyB9XG4gIGVsc2UgaWYgKGZyb20ubGluZSA9PSB0by5saW5lICYmIGNoYW5nZS50ZXh0Lmxlbmd0aCA9PSAxICYmICFpc1dob2xlTGluZVVwZGF0ZShjbS5kb2MsIGNoYW5nZSkpXG4gICAgeyByZWdMaW5lQ2hhbmdlKGNtLCBmcm9tLmxpbmUsIFwidGV4dFwiKTsgfVxuICBlbHNlXG4gICAgeyByZWdDaGFuZ2UoY20sIGZyb20ubGluZSwgdG8ubGluZSArIDEsIGxlbmRpZmYpOyB9XG5cbiAgdmFyIGNoYW5nZXNIYW5kbGVyID0gaGFzSGFuZGxlcihjbSwgXCJjaGFuZ2VzXCIpLCBjaGFuZ2VIYW5kbGVyID0gaGFzSGFuZGxlcihjbSwgXCJjaGFuZ2VcIik7XG4gIGlmIChjaGFuZ2VIYW5kbGVyIHx8IGNoYW5nZXNIYW5kbGVyKSB7XG4gICAgdmFyIG9iaiA9IHtcbiAgICAgIGZyb206IGZyb20sIHRvOiB0byxcbiAgICAgIHRleHQ6IGNoYW5nZS50ZXh0LFxuICAgICAgcmVtb3ZlZDogY2hhbmdlLnJlbW92ZWQsXG4gICAgICBvcmlnaW46IGNoYW5nZS5vcmlnaW5cbiAgICB9O1xuICAgIGlmIChjaGFuZ2VIYW5kbGVyKSB7IHNpZ25hbExhdGVyKGNtLCBcImNoYW5nZVwiLCBjbSwgb2JqKTsgfVxuICAgIGlmIChjaGFuZ2VzSGFuZGxlcikgeyAoY20uY3VyT3AuY2hhbmdlT2JqcyB8fCAoY20uY3VyT3AuY2hhbmdlT2JqcyA9IFtdKSkucHVzaChvYmopOyB9XG4gIH1cbiAgY20uZGlzcGxheS5zZWxGb3JDb250ZXh0TWVudSA9IG51bGw7XG59XG5cbmZ1bmN0aW9uIHJlcGxhY2VSYW5nZShkb2MsIGNvZGUsIGZyb20sIHRvLCBvcmlnaW4pIHtcbiAgaWYgKCF0bykgeyB0byA9IGZyb207IH1cbiAgaWYgKGNtcCh0bywgZnJvbSkgPCAwKSB7IHZhciBhc3NpZ247XG4gICAgKGFzc2lnbiA9IFt0bywgZnJvbV0sIGZyb20gPSBhc3NpZ25bMF0sIHRvID0gYXNzaWduWzFdKTsgfVxuICBpZiAodHlwZW9mIGNvZGUgPT0gXCJzdHJpbmdcIikgeyBjb2RlID0gZG9jLnNwbGl0TGluZXMoY29kZSk7IH1cbiAgbWFrZUNoYW5nZShkb2MsIHtmcm9tOiBmcm9tLCB0bzogdG8sIHRleHQ6IGNvZGUsIG9yaWdpbjogb3JpZ2lufSk7XG59XG5cbi8vIFJlYmFzaW5nL3Jlc2V0dGluZyBoaXN0b3J5IHRvIGRlYWwgd2l0aCBleHRlcm5hbGx5LXNvdXJjZWQgY2hhbmdlc1xuXG5mdW5jdGlvbiByZWJhc2VIaXN0U2VsU2luZ2xlKHBvcywgZnJvbSwgdG8sIGRpZmYpIHtcbiAgaWYgKHRvIDwgcG9zLmxpbmUpIHtcbiAgICBwb3MubGluZSArPSBkaWZmO1xuICB9IGVsc2UgaWYgKGZyb20gPCBwb3MubGluZSkge1xuICAgIHBvcy5saW5lID0gZnJvbTtcbiAgICBwb3MuY2ggPSAwO1xuICB9XG59XG5cbi8vIFRyaWVzIHRvIHJlYmFzZSBhbiBhcnJheSBvZiBoaXN0b3J5IGV2ZW50cyBnaXZlbiBhIGNoYW5nZSBpbiB0aGVcbi8vIGRvY3VtZW50LiBJZiB0aGUgY2hhbmdlIHRvdWNoZXMgdGhlIHNhbWUgbGluZXMgYXMgdGhlIGV2ZW50LCB0aGVcbi8vIGV2ZW50LCBhbmQgZXZlcnl0aGluZyAnYmVoaW5kJyBpdCwgaXMgZGlzY2FyZGVkLiBJZiB0aGUgY2hhbmdlIGlzXG4vLyBiZWZvcmUgdGhlIGV2ZW50LCB0aGUgZXZlbnQncyBwb3NpdGlvbnMgYXJlIHVwZGF0ZWQuIFVzZXMgYVxuLy8gY29weS1vbi13cml0ZSBzY2hlbWUgZm9yIHRoZSBwb3NpdGlvbnMsIHRvIGF2b2lkIGhhdmluZyB0b1xuLy8gcmVhbGxvY2F0ZSB0aGVtIGFsbCBvbiBldmVyeSByZWJhc2UsIGJ1dCBhbHNvIGF2b2lkIHByb2JsZW1zIHdpdGhcbi8vIHNoYXJlZCBwb3NpdGlvbiBvYmplY3RzIGJlaW5nIHVuc2FmZWx5IHVwZGF0ZWQuXG5mdW5jdGlvbiByZWJhc2VIaXN0QXJyYXkoYXJyYXksIGZyb20sIHRvLCBkaWZmKSB7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgYXJyYXkubGVuZ3RoOyArK2kpIHtcbiAgICB2YXIgc3ViID0gYXJyYXlbaV0sIG9rID0gdHJ1ZTtcbiAgICBpZiAoc3ViLnJhbmdlcykge1xuICAgICAgaWYgKCFzdWIuY29waWVkKSB7IHN1YiA9IGFycmF5W2ldID0gc3ViLmRlZXBDb3B5KCk7IHN1Yi5jb3BpZWQgPSB0cnVlOyB9XG4gICAgICBmb3IgKHZhciBqID0gMDsgaiA8IHN1Yi5yYW5nZXMubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgcmViYXNlSGlzdFNlbFNpbmdsZShzdWIucmFuZ2VzW2pdLmFuY2hvciwgZnJvbSwgdG8sIGRpZmYpO1xuICAgICAgICByZWJhc2VIaXN0U2VsU2luZ2xlKHN1Yi5yYW5nZXNbal0uaGVhZCwgZnJvbSwgdG8sIGRpZmYpO1xuICAgICAgfVxuICAgICAgY29udGludWVcbiAgICB9XG4gICAgZm9yICh2YXIgaiQxID0gMDsgaiQxIDwgc3ViLmNoYW5nZXMubGVuZ3RoOyArK2okMSkge1xuICAgICAgdmFyIGN1ciA9IHN1Yi5jaGFuZ2VzW2okMV07XG4gICAgICBpZiAodG8gPCBjdXIuZnJvbS5saW5lKSB7XG4gICAgICAgIGN1ci5mcm9tID0gUG9zKGN1ci5mcm9tLmxpbmUgKyBkaWZmLCBjdXIuZnJvbS5jaCk7XG4gICAgICAgIGN1ci50byA9IFBvcyhjdXIudG8ubGluZSArIGRpZmYsIGN1ci50by5jaCk7XG4gICAgICB9IGVsc2UgaWYgKGZyb20gPD0gY3VyLnRvLmxpbmUpIHtcbiAgICAgICAgb2sgPSBmYWxzZTtcbiAgICAgICAgYnJlYWtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKCFvaykge1xuICAgICAgYXJyYXkuc3BsaWNlKDAsIGkgKyAxKTtcbiAgICAgIGkgPSAwO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiByZWJhc2VIaXN0KGhpc3QsIGNoYW5nZSkge1xuICB2YXIgZnJvbSA9IGNoYW5nZS5mcm9tLmxpbmUsIHRvID0gY2hhbmdlLnRvLmxpbmUsIGRpZmYgPSBjaGFuZ2UudGV4dC5sZW5ndGggLSAodG8gLSBmcm9tKSAtIDE7XG4gIHJlYmFzZUhpc3RBcnJheShoaXN0LmRvbmUsIGZyb20sIHRvLCBkaWZmKTtcbiAgcmViYXNlSGlzdEFycmF5KGhpc3QudW5kb25lLCBmcm9tLCB0bywgZGlmZik7XG59XG5cbi8vIFV0aWxpdHkgZm9yIGFwcGx5aW5nIGEgY2hhbmdlIHRvIGEgbGluZSBieSBoYW5kbGUgb3IgbnVtYmVyLFxuLy8gcmV0dXJuaW5nIHRoZSBudW1iZXIgYW5kIG9wdGlvbmFsbHkgcmVnaXN0ZXJpbmcgdGhlIGxpbmUgYXNcbi8vIGNoYW5nZWQuXG5mdW5jdGlvbiBjaGFuZ2VMaW5lKGRvYywgaGFuZGxlLCBjaGFuZ2VUeXBlLCBvcCkge1xuICB2YXIgbm8gPSBoYW5kbGUsIGxpbmUgPSBoYW5kbGU7XG4gIGlmICh0eXBlb2YgaGFuZGxlID09IFwibnVtYmVyXCIpIHsgbGluZSA9IGdldExpbmUoZG9jLCBjbGlwTGluZShkb2MsIGhhbmRsZSkpOyB9XG4gIGVsc2UgeyBubyA9IGxpbmVObyhoYW5kbGUpOyB9XG4gIGlmIChubyA9PSBudWxsKSB7IHJldHVybiBudWxsIH1cbiAgaWYgKG9wKGxpbmUsIG5vKSAmJiBkb2MuY20pIHsgcmVnTGluZUNoYW5nZShkb2MuY20sIG5vLCBjaGFuZ2VUeXBlKTsgfVxuICByZXR1cm4gbGluZVxufVxuXG4vLyBUaGUgZG9jdW1lbnQgaXMgcmVwcmVzZW50ZWQgYXMgYSBCVHJlZSBjb25zaXN0aW5nIG9mIGxlYXZlcywgd2l0aFxuLy8gY2h1bmsgb2YgbGluZXMgaW4gdGhlbSwgYW5kIGJyYW5jaGVzLCB3aXRoIHVwIHRvIHRlbiBsZWF2ZXMgb3Jcbi8vIG90aGVyIGJyYW5jaCBub2RlcyBiZWxvdyB0aGVtLiBUaGUgdG9wIG5vZGUgaXMgYWx3YXlzIGEgYnJhbmNoXG4vLyBub2RlLCBhbmQgaXMgdGhlIGRvY3VtZW50IG9iamVjdCBpdHNlbGYgKG1lYW5pbmcgaXQgaGFzXG4vLyBhZGRpdGlvbmFsIG1ldGhvZHMgYW5kIHByb3BlcnRpZXMpLlxuLy9cbi8vIEFsbCBub2RlcyBoYXZlIHBhcmVudCBsaW5rcy4gVGhlIHRyZWUgaXMgdXNlZCBib3RoIHRvIGdvIGZyb21cbi8vIGxpbmUgbnVtYmVycyB0byBsaW5lIG9iamVjdHMsIGFuZCB0byBnbyBmcm9tIG9iamVjdHMgdG8gbnVtYmVycy5cbi8vIEl0IGFsc28gaW5kZXhlcyBieSBoZWlnaHQsIGFuZCBpcyB1c2VkIHRvIGNvbnZlcnQgYmV0d2VlbiBoZWlnaHRcbi8vIGFuZCBsaW5lIG9iamVjdCwgYW5kIHRvIGZpbmQgdGhlIHRvdGFsIGhlaWdodCBvZiB0aGUgZG9jdW1lbnQuXG4vL1xuLy8gU2VlIGFsc28gaHR0cDovL21hcmlqbmhhdmVyYmVrZS5ubC9ibG9nL2NvZGVtaXJyb3ItbGluZS10cmVlLmh0bWxcblxuZnVuY3Rpb24gTGVhZkNodW5rKGxpbmVzKSB7XG4gIHZhciB0aGlzJDEgPSB0aGlzO1xuXG4gIHRoaXMubGluZXMgPSBsaW5lcztcbiAgdGhpcy5wYXJlbnQgPSBudWxsO1xuICB2YXIgaGVpZ2h0ID0gMDtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsaW5lcy5sZW5ndGg7ICsraSkge1xuICAgIGxpbmVzW2ldLnBhcmVudCA9IHRoaXMkMTtcbiAgICBoZWlnaHQgKz0gbGluZXNbaV0uaGVpZ2h0O1xuICB9XG4gIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xufVxuXG5MZWFmQ2h1bmsucHJvdG90eXBlID0ge1xuICBjaHVua1NpemU6IGZ1bmN0aW9uKCkgeyByZXR1cm4gdGhpcy5saW5lcy5sZW5ndGggfSxcblxuICAvLyBSZW1vdmUgdGhlIG4gbGluZXMgYXQgb2Zmc2V0ICdhdCcuXG4gIHJlbW92ZUlubmVyOiBmdW5jdGlvbihhdCwgbikge1xuICAgIHZhciB0aGlzJDEgPSB0aGlzO1xuXG4gICAgZm9yICh2YXIgaSA9IGF0LCBlID0gYXQgKyBuOyBpIDwgZTsgKytpKSB7XG4gICAgICB2YXIgbGluZSA9IHRoaXMkMS5saW5lc1tpXTtcbiAgICAgIHRoaXMkMS5oZWlnaHQgLT0gbGluZS5oZWlnaHQ7XG4gICAgICBjbGVhblVwTGluZShsaW5lKTtcbiAgICAgIHNpZ25hbExhdGVyKGxpbmUsIFwiZGVsZXRlXCIpO1xuICAgIH1cbiAgICB0aGlzLmxpbmVzLnNwbGljZShhdCwgbik7XG4gIH0sXG5cbiAgLy8gSGVscGVyIHVzZWQgdG8gY29sbGFwc2UgYSBzbWFsbCBicmFuY2ggaW50byBhIHNpbmdsZSBsZWFmLlxuICBjb2xsYXBzZTogZnVuY3Rpb24obGluZXMpIHtcbiAgICBsaW5lcy5wdXNoLmFwcGx5KGxpbmVzLCB0aGlzLmxpbmVzKTtcbiAgfSxcblxuICAvLyBJbnNlcnQgdGhlIGdpdmVuIGFycmF5IG9mIGxpbmVzIGF0IG9mZnNldCAnYXQnLCBjb3VudCB0aGVtIGFzXG4gIC8vIGhhdmluZyB0aGUgZ2l2ZW4gaGVpZ2h0LlxuICBpbnNlcnRJbm5lcjogZnVuY3Rpb24oYXQsIGxpbmVzLCBoZWlnaHQpIHtcbiAgICB2YXIgdGhpcyQxID0gdGhpcztcblxuICAgIHRoaXMuaGVpZ2h0ICs9IGhlaWdodDtcbiAgICB0aGlzLmxpbmVzID0gdGhpcy5saW5lcy5zbGljZSgwLCBhdCkuY29uY2F0KGxpbmVzKS5jb25jYXQodGhpcy5saW5lcy5zbGljZShhdCkpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGluZXMubGVuZ3RoOyArK2kpIHsgbGluZXNbaV0ucGFyZW50ID0gdGhpcyQxOyB9XG4gIH0sXG5cbiAgLy8gVXNlZCB0byBpdGVyYXRlIG92ZXIgYSBwYXJ0IG9mIHRoZSB0cmVlLlxuICBpdGVyTjogZnVuY3Rpb24oYXQsIG4sIG9wKSB7XG4gICAgdmFyIHRoaXMkMSA9IHRoaXM7XG5cbiAgICBmb3IgKHZhciBlID0gYXQgKyBuOyBhdCA8IGU7ICsrYXQpXG4gICAgICB7IGlmIChvcCh0aGlzJDEubGluZXNbYXRdKSkgeyByZXR1cm4gdHJ1ZSB9IH1cbiAgfVxufTtcblxuZnVuY3Rpb24gQnJhbmNoQ2h1bmsoY2hpbGRyZW4pIHtcbiAgdmFyIHRoaXMkMSA9IHRoaXM7XG5cbiAgdGhpcy5jaGlsZHJlbiA9IGNoaWxkcmVuO1xuICB2YXIgc2l6ZSA9IDAsIGhlaWdodCA9IDA7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgY2hpbGRyZW4ubGVuZ3RoOyArK2kpIHtcbiAgICB2YXIgY2ggPSBjaGlsZHJlbltpXTtcbiAgICBzaXplICs9IGNoLmNodW5rU2l6ZSgpOyBoZWlnaHQgKz0gY2guaGVpZ2h0O1xuICAgIGNoLnBhcmVudCA9IHRoaXMkMTtcbiAgfVxuICB0aGlzLnNpemUgPSBzaXplO1xuICB0aGlzLmhlaWdodCA9IGhlaWdodDtcbiAgdGhpcy5wYXJlbnQgPSBudWxsO1xufVxuXG5CcmFuY2hDaHVuay5wcm90b3R5cGUgPSB7XG4gIGNodW5rU2l6ZTogZnVuY3Rpb24oKSB7IHJldHVybiB0aGlzLnNpemUgfSxcblxuICByZW1vdmVJbm5lcjogZnVuY3Rpb24oYXQsIG4pIHtcbiAgICB2YXIgdGhpcyQxID0gdGhpcztcblxuICAgIHRoaXMuc2l6ZSAtPSBuO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5jaGlsZHJlbi5sZW5ndGg7ICsraSkge1xuICAgICAgdmFyIGNoaWxkID0gdGhpcyQxLmNoaWxkcmVuW2ldLCBzeiA9IGNoaWxkLmNodW5rU2l6ZSgpO1xuICAgICAgaWYgKGF0IDwgc3opIHtcbiAgICAgICAgdmFyIHJtID0gTWF0aC5taW4obiwgc3ogLSBhdCksIG9sZEhlaWdodCA9IGNoaWxkLmhlaWdodDtcbiAgICAgICAgY2hpbGQucmVtb3ZlSW5uZXIoYXQsIHJtKTtcbiAgICAgICAgdGhpcyQxLmhlaWdodCAtPSBvbGRIZWlnaHQgLSBjaGlsZC5oZWlnaHQ7XG4gICAgICAgIGlmIChzeiA9PSBybSkgeyB0aGlzJDEuY2hpbGRyZW4uc3BsaWNlKGktLSwgMSk7IGNoaWxkLnBhcmVudCA9IG51bGw7IH1cbiAgICAgICAgaWYgKChuIC09IHJtKSA9PSAwKSB7IGJyZWFrIH1cbiAgICAgICAgYXQgPSAwO1xuICAgICAgfSBlbHNlIHsgYXQgLT0gc3o7IH1cbiAgICB9XG4gICAgLy8gSWYgdGhlIHJlc3VsdCBpcyBzbWFsbGVyIHRoYW4gMjUgbGluZXMsIGVuc3VyZSB0aGF0IGl0IGlzIGFcbiAgICAvLyBzaW5nbGUgbGVhZiBub2RlLlxuICAgIGlmICh0aGlzLnNpemUgLSBuIDwgMjUgJiZcbiAgICAgICAgKHRoaXMuY2hpbGRyZW4ubGVuZ3RoID4gMSB8fCAhKHRoaXMuY2hpbGRyZW5bMF0gaW5zdGFuY2VvZiBMZWFmQ2h1bmspKSkge1xuICAgICAgdmFyIGxpbmVzID0gW107XG4gICAgICB0aGlzLmNvbGxhcHNlKGxpbmVzKTtcbiAgICAgIHRoaXMuY2hpbGRyZW4gPSBbbmV3IExlYWZDaHVuayhsaW5lcyldO1xuICAgICAgdGhpcy5jaGlsZHJlblswXS5wYXJlbnQgPSB0aGlzO1xuICAgIH1cbiAgfSxcblxuICBjb2xsYXBzZTogZnVuY3Rpb24obGluZXMpIHtcbiAgICB2YXIgdGhpcyQxID0gdGhpcztcblxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5jaGlsZHJlbi5sZW5ndGg7ICsraSkgeyB0aGlzJDEuY2hpbGRyZW5baV0uY29sbGFwc2UobGluZXMpOyB9XG4gIH0sXG5cbiAgaW5zZXJ0SW5uZXI6IGZ1bmN0aW9uKGF0LCBsaW5lcywgaGVpZ2h0KSB7XG4gICAgdmFyIHRoaXMkMSA9IHRoaXM7XG5cbiAgICB0aGlzLnNpemUgKz0gbGluZXMubGVuZ3RoO1xuICAgIHRoaXMuaGVpZ2h0ICs9IGhlaWdodDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMuY2hpbGRyZW4ubGVuZ3RoOyArK2kpIHtcbiAgICAgIHZhciBjaGlsZCA9IHRoaXMkMS5jaGlsZHJlbltpXSwgc3ogPSBjaGlsZC5jaHVua1NpemUoKTtcbiAgICAgIGlmIChhdCA8PSBzeikge1xuICAgICAgICBjaGlsZC5pbnNlcnRJbm5lcihhdCwgbGluZXMsIGhlaWdodCk7XG4gICAgICAgIGlmIChjaGlsZC5saW5lcyAmJiBjaGlsZC5saW5lcy5sZW5ndGggPiA1MCkge1xuICAgICAgICAgIC8vIFRvIGF2b2lkIG1lbW9yeSB0aHJhc2hpbmcgd2hlbiBjaGlsZC5saW5lcyBpcyBodWdlIChlLmcuIGZpcnN0IHZpZXcgb2YgYSBsYXJnZSBmaWxlKSwgaXQncyBuZXZlciBzcGxpY2VkLlxuICAgICAgICAgIC8vIEluc3RlYWQsIHNtYWxsIHNsaWNlcyBhcmUgdGFrZW4uIFRoZXkncmUgdGFrZW4gaW4gb3JkZXIgYmVjYXVzZSBzZXF1ZW50aWFsIG1lbW9yeSBhY2Nlc3NlcyBhcmUgZmFzdGVzdC5cbiAgICAgICAgICB2YXIgcmVtYWluaW5nID0gY2hpbGQubGluZXMubGVuZ3RoICUgMjUgKyAyNTtcbiAgICAgICAgICBmb3IgKHZhciBwb3MgPSByZW1haW5pbmc7IHBvcyA8IGNoaWxkLmxpbmVzLmxlbmd0aDspIHtcbiAgICAgICAgICAgIHZhciBsZWFmID0gbmV3IExlYWZDaHVuayhjaGlsZC5saW5lcy5zbGljZShwb3MsIHBvcyArPSAyNSkpO1xuICAgICAgICAgICAgY2hpbGQuaGVpZ2h0IC09IGxlYWYuaGVpZ2h0O1xuICAgICAgICAgICAgdGhpcyQxLmNoaWxkcmVuLnNwbGljZSgrK2ksIDAsIGxlYWYpO1xuICAgICAgICAgICAgbGVhZi5wYXJlbnQgPSB0aGlzJDE7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNoaWxkLmxpbmVzID0gY2hpbGQubGluZXMuc2xpY2UoMCwgcmVtYWluaW5nKTtcbiAgICAgICAgICB0aGlzJDEubWF5YmVTcGlsbCgpO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrXG4gICAgICB9XG4gICAgICBhdCAtPSBzejtcbiAgICB9XG4gIH0sXG5cbiAgLy8gV2hlbiBhIG5vZGUgaGFzIGdyb3duLCBjaGVjayB3aGV0aGVyIGl0IHNob3VsZCBiZSBzcGxpdC5cbiAgbWF5YmVTcGlsbDogZnVuY3Rpb24oKSB7XG4gICAgaWYgKHRoaXMuY2hpbGRyZW4ubGVuZ3RoIDw9IDEwKSB7IHJldHVybiB9XG4gICAgdmFyIG1lID0gdGhpcztcbiAgICBkbyB7XG4gICAgICB2YXIgc3BpbGxlZCA9IG1lLmNoaWxkcmVuLnNwbGljZShtZS5jaGlsZHJlbi5sZW5ndGggLSA1LCA1KTtcbiAgICAgIHZhciBzaWJsaW5nID0gbmV3IEJyYW5jaENodW5rKHNwaWxsZWQpO1xuICAgICAgaWYgKCFtZS5wYXJlbnQpIHsgLy8gQmVjb21lIHRoZSBwYXJlbnQgbm9kZVxuICAgICAgICB2YXIgY29weSA9IG5ldyBCcmFuY2hDaHVuayhtZS5jaGlsZHJlbik7XG4gICAgICAgIGNvcHkucGFyZW50ID0gbWU7XG4gICAgICAgIG1lLmNoaWxkcmVuID0gW2NvcHksIHNpYmxpbmddO1xuICAgICAgICBtZSA9IGNvcHk7XG4gICAgIH0gZWxzZSB7XG4gICAgICAgIG1lLnNpemUgLT0gc2libGluZy5zaXplO1xuICAgICAgICBtZS5oZWlnaHQgLT0gc2libGluZy5oZWlnaHQ7XG4gICAgICAgIHZhciBteUluZGV4ID0gaW5kZXhPZihtZS5wYXJlbnQuY2hpbGRyZW4sIG1lKTtcbiAgICAgICAgbWUucGFyZW50LmNoaWxkcmVuLnNwbGljZShteUluZGV4ICsgMSwgMCwgc2libGluZyk7XG4gICAgICB9XG4gICAgICBzaWJsaW5nLnBhcmVudCA9IG1lLnBhcmVudDtcbiAgICB9IHdoaWxlIChtZS5jaGlsZHJlbi5sZW5ndGggPiAxMClcbiAgICBtZS5wYXJlbnQubWF5YmVTcGlsbCgpO1xuICB9LFxuXG4gIGl0ZXJOOiBmdW5jdGlvbihhdCwgbiwgb3ApIHtcbiAgICB2YXIgdGhpcyQxID0gdGhpcztcblxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5jaGlsZHJlbi5sZW5ndGg7ICsraSkge1xuICAgICAgdmFyIGNoaWxkID0gdGhpcyQxLmNoaWxkcmVuW2ldLCBzeiA9IGNoaWxkLmNodW5rU2l6ZSgpO1xuICAgICAgaWYgKGF0IDwgc3opIHtcbiAgICAgICAgdmFyIHVzZWQgPSBNYXRoLm1pbihuLCBzeiAtIGF0KTtcbiAgICAgICAgaWYgKGNoaWxkLml0ZXJOKGF0LCB1c2VkLCBvcCkpIHsgcmV0dXJuIHRydWUgfVxuICAgICAgICBpZiAoKG4gLT0gdXNlZCkgPT0gMCkgeyBicmVhayB9XG4gICAgICAgIGF0ID0gMDtcbiAgICAgIH0gZWxzZSB7IGF0IC09IHN6OyB9XG4gICAgfVxuICB9XG59O1xuXG4vLyBMaW5lIHdpZGdldHMgYXJlIGJsb2NrIGVsZW1lbnRzIGRpc3BsYXllZCBhYm92ZSBvciBiZWxvdyBhIGxpbmUuXG5cbnZhciBMaW5lV2lkZ2V0ID0gZnVuY3Rpb24oZG9jLCBub2RlLCBvcHRpb25zKSB7XG4gIHZhciB0aGlzJDEgPSB0aGlzO1xuXG4gIGlmIChvcHRpb25zKSB7IGZvciAodmFyIG9wdCBpbiBvcHRpb25zKSB7IGlmIChvcHRpb25zLmhhc093blByb3BlcnR5KG9wdCkpXG4gICAgeyB0aGlzJDFbb3B0XSA9IG9wdGlvbnNbb3B0XTsgfSB9IH1cbiAgdGhpcy5kb2MgPSBkb2M7XG4gIHRoaXMubm9kZSA9IG5vZGU7XG59O1xuXG5MaW5lV2lkZ2V0LnByb3RvdHlwZS5jbGVhciA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgdGhpcyQxID0gdGhpcztcblxuICB2YXIgY20gPSB0aGlzLmRvYy5jbSwgd3MgPSB0aGlzLmxpbmUud2lkZ2V0cywgbGluZSA9IHRoaXMubGluZSwgbm8gPSBsaW5lTm8obGluZSk7XG4gIGlmIChubyA9PSBudWxsIHx8ICF3cykgeyByZXR1cm4gfVxuICBmb3IgKHZhciBpID0gMDsgaSA8IHdzLmxlbmd0aDsgKytpKSB7IGlmICh3c1tpXSA9PSB0aGlzJDEpIHsgd3Muc3BsaWNlKGktLSwgMSk7IH0gfVxuICBpZiAoIXdzLmxlbmd0aCkgeyBsaW5lLndpZGdldHMgPSBudWxsOyB9XG4gIHZhciBoZWlnaHQgPSB3aWRnZXRIZWlnaHQodGhpcyk7XG4gIHVwZGF0ZUxpbmVIZWlnaHQobGluZSwgTWF0aC5tYXgoMCwgbGluZS5oZWlnaHQgLSBoZWlnaHQpKTtcbiAgaWYgKGNtKSB7XG4gICAgcnVuSW5PcChjbSwgZnVuY3Rpb24gKCkge1xuICAgICAgYWRqdXN0U2Nyb2xsV2hlbkFib3ZlVmlzaWJsZShjbSwgbGluZSwgLWhlaWdodCk7XG4gICAgICByZWdMaW5lQ2hhbmdlKGNtLCBubywgXCJ3aWRnZXRcIik7XG4gICAgfSk7XG4gICAgc2lnbmFsTGF0ZXIoY20sIFwibGluZVdpZGdldENsZWFyZWRcIiwgY20sIHRoaXMsIG5vKTtcbiAgfVxufTtcblxuTGluZVdpZGdldC5wcm90b3R5cGUuY2hhbmdlZCA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgdGhpcyQxID0gdGhpcztcblxuICB2YXIgb2xkSCA9IHRoaXMuaGVpZ2h0LCBjbSA9IHRoaXMuZG9jLmNtLCBsaW5lID0gdGhpcy5saW5lO1xuICB0aGlzLmhlaWdodCA9IG51bGw7XG4gIHZhciBkaWZmID0gd2lkZ2V0SGVpZ2h0KHRoaXMpIC0gb2xkSDtcbiAgaWYgKCFkaWZmKSB7IHJldHVybiB9XG4gIHVwZGF0ZUxpbmVIZWlnaHQobGluZSwgbGluZS5oZWlnaHQgKyBkaWZmKTtcbiAgaWYgKGNtKSB7XG4gICAgcnVuSW5PcChjbSwgZnVuY3Rpb24gKCkge1xuICAgICAgY20uY3VyT3AuZm9yY2VVcGRhdGUgPSB0cnVlO1xuICAgICAgYWRqdXN0U2Nyb2xsV2hlbkFib3ZlVmlzaWJsZShjbSwgbGluZSwgZGlmZik7XG4gICAgICBzaWduYWxMYXRlcihjbSwgXCJsaW5lV2lkZ2V0Q2hhbmdlZFwiLCBjbSwgdGhpcyQxLCBsaW5lTm8obGluZSkpO1xuICAgIH0pO1xuICB9XG59O1xuZXZlbnRNaXhpbihMaW5lV2lkZ2V0KTtcblxuZnVuY3Rpb24gYWRqdXN0U2Nyb2xsV2hlbkFib3ZlVmlzaWJsZShjbSwgbGluZSwgZGlmZikge1xuICBpZiAoaGVpZ2h0QXRMaW5lKGxpbmUpIDwgKChjbS5jdXJPcCAmJiBjbS5jdXJPcC5zY3JvbGxUb3ApIHx8IGNtLmRvYy5zY3JvbGxUb3ApKVxuICAgIHsgYWRkVG9TY3JvbGxUb3AoY20sIGRpZmYpOyB9XG59XG5cbmZ1bmN0aW9uIGFkZExpbmVXaWRnZXQoZG9jLCBoYW5kbGUsIG5vZGUsIG9wdGlvbnMpIHtcbiAgdmFyIHdpZGdldCA9IG5ldyBMaW5lV2lkZ2V0KGRvYywgbm9kZSwgb3B0aW9ucyk7XG4gIHZhciBjbSA9IGRvYy5jbTtcbiAgaWYgKGNtICYmIHdpZGdldC5ub0hTY3JvbGwpIHsgY20uZGlzcGxheS5hbGlnbldpZGdldHMgPSB0cnVlOyB9XG4gIGNoYW5nZUxpbmUoZG9jLCBoYW5kbGUsIFwid2lkZ2V0XCIsIGZ1bmN0aW9uIChsaW5lKSB7XG4gICAgdmFyIHdpZGdldHMgPSBsaW5lLndpZGdldHMgfHwgKGxpbmUud2lkZ2V0cyA9IFtdKTtcbiAgICBpZiAod2lkZ2V0Lmluc2VydEF0ID09IG51bGwpIHsgd2lkZ2V0cy5wdXNoKHdpZGdldCk7IH1cbiAgICBlbHNlIHsgd2lkZ2V0cy5zcGxpY2UoTWF0aC5taW4od2lkZ2V0cy5sZW5ndGggLSAxLCBNYXRoLm1heCgwLCB3aWRnZXQuaW5zZXJ0QXQpKSwgMCwgd2lkZ2V0KTsgfVxuICAgIHdpZGdldC5saW5lID0gbGluZTtcbiAgICBpZiAoY20gJiYgIWxpbmVJc0hpZGRlbihkb2MsIGxpbmUpKSB7XG4gICAgICB2YXIgYWJvdmVWaXNpYmxlID0gaGVpZ2h0QXRMaW5lKGxpbmUpIDwgZG9jLnNjcm9sbFRvcDtcbiAgICAgIHVwZGF0ZUxpbmVIZWlnaHQobGluZSwgbGluZS5oZWlnaHQgKyB3aWRnZXRIZWlnaHQod2lkZ2V0KSk7XG4gICAgICBpZiAoYWJvdmVWaXNpYmxlKSB7IGFkZFRvU2Nyb2xsVG9wKGNtLCB3aWRnZXQuaGVpZ2h0KTsgfVxuICAgICAgY20uY3VyT3AuZm9yY2VVcGRhdGUgPSB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gdHJ1ZVxuICB9KTtcbiAgaWYgKGNtKSB7IHNpZ25hbExhdGVyKGNtLCBcImxpbmVXaWRnZXRBZGRlZFwiLCBjbSwgd2lkZ2V0LCB0eXBlb2YgaGFuZGxlID09IFwibnVtYmVyXCIgPyBoYW5kbGUgOiBsaW5lTm8oaGFuZGxlKSk7IH1cbiAgcmV0dXJuIHdpZGdldFxufVxuXG4vLyBURVhUTUFSS0VSU1xuXG4vLyBDcmVhdGVkIHdpdGggbWFya1RleHQgYW5kIHNldEJvb2ttYXJrIG1ldGhvZHMuIEEgVGV4dE1hcmtlciBpcyBhXG4vLyBoYW5kbGUgdGhhdCBjYW4gYmUgdXNlZCB0byBjbGVhciBvciBmaW5kIGEgbWFya2VkIHBvc2l0aW9uIGluIHRoZVxuLy8gZG9jdW1lbnQuIExpbmUgb2JqZWN0cyBob2xkIGFycmF5cyAobWFya2VkU3BhbnMpIGNvbnRhaW5pbmdcbi8vIHtmcm9tLCB0bywgbWFya2VyfSBvYmplY3QgcG9pbnRpbmcgdG8gc3VjaCBtYXJrZXIgb2JqZWN0cywgYW5kXG4vLyBpbmRpY2F0aW5nIHRoYXQgc3VjaCBhIG1hcmtlciBpcyBwcmVzZW50IG9uIHRoYXQgbGluZS4gTXVsdGlwbGVcbi8vIGxpbmVzIG1heSBwb2ludCB0byB0aGUgc2FtZSBtYXJrZXIgd2hlbiBpdCBzcGFucyBhY3Jvc3MgbGluZXMuXG4vLyBUaGUgc3BhbnMgd2lsbCBoYXZlIG51bGwgZm9yIHRoZWlyIGZyb20vdG8gcHJvcGVydGllcyB3aGVuIHRoZVxuLy8gbWFya2VyIGNvbnRpbnVlcyBiZXlvbmQgdGhlIHN0YXJ0L2VuZCBvZiB0aGUgbGluZS4gTWFya2VycyBoYXZlXG4vLyBsaW5rcyBiYWNrIHRvIHRoZSBsaW5lcyB0aGV5IGN1cnJlbnRseSB0b3VjaC5cblxuLy8gQ29sbGFwc2VkIG1hcmtlcnMgaGF2ZSB1bmlxdWUgaWRzLCBpbiBvcmRlciB0byBiZSBhYmxlIHRvIG9yZGVyXG4vLyB0aGVtLCB3aGljaCBpcyBuZWVkZWQgZm9yIHVuaXF1ZWx5IGRldGVybWluaW5nIGFuIG91dGVyIG1hcmtlclxuLy8gd2hlbiB0aGV5IG92ZXJsYXAgKHRoZXkgbWF5IG5lc3QsIGJ1dCBub3QgcGFydGlhbGx5IG92ZXJsYXApLlxudmFyIG5leHRNYXJrZXJJZCA9IDA7XG5cbnZhciBUZXh0TWFya2VyID0gZnVuY3Rpb24oZG9jLCB0eXBlKSB7XG4gIHRoaXMubGluZXMgPSBbXTtcbiAgdGhpcy50eXBlID0gdHlwZTtcbiAgdGhpcy5kb2MgPSBkb2M7XG4gIHRoaXMuaWQgPSArK25leHRNYXJrZXJJZDtcbn07XG5cbi8vIENsZWFyIHRoZSBtYXJrZXIuXG5UZXh0TWFya2VyLnByb3RvdHlwZS5jbGVhciA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgdGhpcyQxID0gdGhpcztcblxuICBpZiAodGhpcy5leHBsaWNpdGx5Q2xlYXJlZCkgeyByZXR1cm4gfVxuICB2YXIgY20gPSB0aGlzLmRvYy5jbSwgd2l0aE9wID0gY20gJiYgIWNtLmN1ck9wO1xuICBpZiAod2l0aE9wKSB7IHN0YXJ0T3BlcmF0aW9uKGNtKTsgfVxuICBpZiAoaGFzSGFuZGxlcih0aGlzLCBcImNsZWFyXCIpKSB7XG4gICAgdmFyIGZvdW5kID0gdGhpcy5maW5kKCk7XG4gICAgaWYgKGZvdW5kKSB7IHNpZ25hbExhdGVyKHRoaXMsIFwiY2xlYXJcIiwgZm91bmQuZnJvbSwgZm91bmQudG8pOyB9XG4gIH1cbiAgdmFyIG1pbiA9IG51bGwsIG1heCA9IG51bGw7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5saW5lcy5sZW5ndGg7ICsraSkge1xuICAgIHZhciBsaW5lID0gdGhpcyQxLmxpbmVzW2ldO1xuICAgIHZhciBzcGFuID0gZ2V0TWFya2VkU3BhbkZvcihsaW5lLm1hcmtlZFNwYW5zLCB0aGlzJDEpO1xuICAgIGlmIChjbSAmJiAhdGhpcyQxLmNvbGxhcHNlZCkgeyByZWdMaW5lQ2hhbmdlKGNtLCBsaW5lTm8obGluZSksIFwidGV4dFwiKTsgfVxuICAgIGVsc2UgaWYgKGNtKSB7XG4gICAgICBpZiAoc3Bhbi50byAhPSBudWxsKSB7IG1heCA9IGxpbmVObyhsaW5lKTsgfVxuICAgICAgaWYgKHNwYW4uZnJvbSAhPSBudWxsKSB7IG1pbiA9IGxpbmVObyhsaW5lKTsgfVxuICAgIH1cbiAgICBsaW5lLm1hcmtlZFNwYW5zID0gcmVtb3ZlTWFya2VkU3BhbihsaW5lLm1hcmtlZFNwYW5zLCBzcGFuKTtcbiAgICBpZiAoc3Bhbi5mcm9tID09IG51bGwgJiYgdGhpcyQxLmNvbGxhcHNlZCAmJiAhbGluZUlzSGlkZGVuKHRoaXMkMS5kb2MsIGxpbmUpICYmIGNtKVxuICAgICAgeyB1cGRhdGVMaW5lSGVpZ2h0KGxpbmUsIHRleHRIZWlnaHQoY20uZGlzcGxheSkpOyB9XG4gIH1cbiAgaWYgKGNtICYmIHRoaXMuY29sbGFwc2VkICYmICFjbS5vcHRpb25zLmxpbmVXcmFwcGluZykgeyBmb3IgKHZhciBpJDEgPSAwOyBpJDEgPCB0aGlzLmxpbmVzLmxlbmd0aDsgKytpJDEpIHtcbiAgICB2YXIgdmlzdWFsID0gdmlzdWFsTGluZSh0aGlzJDEubGluZXNbaSQxXSksIGxlbiA9IGxpbmVMZW5ndGgodmlzdWFsKTtcbiAgICBpZiAobGVuID4gY20uZGlzcGxheS5tYXhMaW5lTGVuZ3RoKSB7XG4gICAgICBjbS5kaXNwbGF5Lm1heExpbmUgPSB2aXN1YWw7XG4gICAgICBjbS5kaXNwbGF5Lm1heExpbmVMZW5ndGggPSBsZW47XG4gICAgICBjbS5kaXNwbGF5Lm1heExpbmVDaGFuZ2VkID0gdHJ1ZTtcbiAgICB9XG4gIH0gfVxuXG4gIGlmIChtaW4gIT0gbnVsbCAmJiBjbSAmJiB0aGlzLmNvbGxhcHNlZCkgeyByZWdDaGFuZ2UoY20sIG1pbiwgbWF4ICsgMSk7IH1cbiAgdGhpcy5saW5lcy5sZW5ndGggPSAwO1xuICB0aGlzLmV4cGxpY2l0bHlDbGVhcmVkID0gdHJ1ZTtcbiAgaWYgKHRoaXMuYXRvbWljICYmIHRoaXMuZG9jLmNhbnRFZGl0KSB7XG4gICAgdGhpcy5kb2MuY2FudEVkaXQgPSBmYWxzZTtcbiAgICBpZiAoY20pIHsgcmVDaGVja1NlbGVjdGlvbihjbS5kb2MpOyB9XG4gIH1cbiAgaWYgKGNtKSB7IHNpZ25hbExhdGVyKGNtLCBcIm1hcmtlckNsZWFyZWRcIiwgY20sIHRoaXMsIG1pbiwgbWF4KTsgfVxuICBpZiAod2l0aE9wKSB7IGVuZE9wZXJhdGlvbihjbSk7IH1cbiAgaWYgKHRoaXMucGFyZW50KSB7IHRoaXMucGFyZW50LmNsZWFyKCk7IH1cbn07XG5cbi8vIEZpbmQgdGhlIHBvc2l0aW9uIG9mIHRoZSBtYXJrZXIgaW4gdGhlIGRvY3VtZW50LiBSZXR1cm5zIGEge2Zyb20sXG4vLyB0b30gb2JqZWN0IGJ5IGRlZmF1bHQuIFNpZGUgY2FuIGJlIHBhc3NlZCB0byBnZXQgYSBzcGVjaWZpYyBzaWRlXG4vLyAtLSAwIChib3RoKSwgLTEgKGxlZnQpLCBvciAxIChyaWdodCkuIFdoZW4gbGluZU9iaiBpcyB0cnVlLCB0aGVcbi8vIFBvcyBvYmplY3RzIHJldHVybmVkIGNvbnRhaW4gYSBsaW5lIG9iamVjdCwgcmF0aGVyIHRoYW4gYSBsaW5lXG4vLyBudW1iZXIgKHVzZWQgdG8gcHJldmVudCBsb29raW5nIHVwIHRoZSBzYW1lIGxpbmUgdHdpY2UpLlxuVGV4dE1hcmtlci5wcm90b3R5cGUuZmluZCA9IGZ1bmN0aW9uIChzaWRlLCBsaW5lT2JqKSB7XG4gICAgdmFyIHRoaXMkMSA9IHRoaXM7XG5cbiAgaWYgKHNpZGUgPT0gbnVsbCAmJiB0aGlzLnR5cGUgPT0gXCJib29rbWFya1wiKSB7IHNpZGUgPSAxOyB9XG4gIHZhciBmcm9tLCB0bztcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLmxpbmVzLmxlbmd0aDsgKytpKSB7XG4gICAgdmFyIGxpbmUgPSB0aGlzJDEubGluZXNbaV07XG4gICAgdmFyIHNwYW4gPSBnZXRNYXJrZWRTcGFuRm9yKGxpbmUubWFya2VkU3BhbnMsIHRoaXMkMSk7XG4gICAgaWYgKHNwYW4uZnJvbSAhPSBudWxsKSB7XG4gICAgICBmcm9tID0gUG9zKGxpbmVPYmogPyBsaW5lIDogbGluZU5vKGxpbmUpLCBzcGFuLmZyb20pO1xuICAgICAgaWYgKHNpZGUgPT0gLTEpIHsgcmV0dXJuIGZyb20gfVxuICAgIH1cbiAgICBpZiAoc3Bhbi50byAhPSBudWxsKSB7XG4gICAgICB0byA9IFBvcyhsaW5lT2JqID8gbGluZSA6IGxpbmVObyhsaW5lKSwgc3Bhbi50byk7XG4gICAgICBpZiAoc2lkZSA9PSAxKSB7IHJldHVybiB0byB9XG4gICAgfVxuICB9XG4gIHJldHVybiBmcm9tICYmIHtmcm9tOiBmcm9tLCB0bzogdG99XG59O1xuXG4vLyBTaWduYWxzIHRoYXQgdGhlIG1hcmtlcidzIHdpZGdldCBjaGFuZ2VkLCBhbmQgc3Vycm91bmRpbmcgbGF5b3V0XG4vLyBzaG91bGQgYmUgcmVjb21wdXRlZC5cblRleHRNYXJrZXIucHJvdG90eXBlLmNoYW5nZWQgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHRoaXMkMSA9IHRoaXM7XG5cbiAgdmFyIHBvcyA9IHRoaXMuZmluZCgtMSwgdHJ1ZSksIHdpZGdldCA9IHRoaXMsIGNtID0gdGhpcy5kb2MuY207XG4gIGlmICghcG9zIHx8ICFjbSkgeyByZXR1cm4gfVxuICBydW5Jbk9wKGNtLCBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIGxpbmUgPSBwb3MubGluZSwgbGluZU4gPSBsaW5lTm8ocG9zLmxpbmUpO1xuICAgIHZhciB2aWV3ID0gZmluZFZpZXdGb3JMaW5lKGNtLCBsaW5lTik7XG4gICAgaWYgKHZpZXcpIHtcbiAgICAgIGNsZWFyTGluZU1lYXN1cmVtZW50Q2FjaGVGb3Iodmlldyk7XG4gICAgICBjbS5jdXJPcC5zZWxlY3Rpb25DaGFuZ2VkID0gY20uY3VyT3AuZm9yY2VVcGRhdGUgPSB0cnVlO1xuICAgIH1cbiAgICBjbS5jdXJPcC51cGRhdGVNYXhMaW5lID0gdHJ1ZTtcbiAgICBpZiAoIWxpbmVJc0hpZGRlbih3aWRnZXQuZG9jLCBsaW5lKSAmJiB3aWRnZXQuaGVpZ2h0ICE9IG51bGwpIHtcbiAgICAgIHZhciBvbGRIZWlnaHQgPSB3aWRnZXQuaGVpZ2h0O1xuICAgICAgd2lkZ2V0LmhlaWdodCA9IG51bGw7XG4gICAgICB2YXIgZEhlaWdodCA9IHdpZGdldEhlaWdodCh3aWRnZXQpIC0gb2xkSGVpZ2h0O1xuICAgICAgaWYgKGRIZWlnaHQpXG4gICAgICAgIHsgdXBkYXRlTGluZUhlaWdodChsaW5lLCBsaW5lLmhlaWdodCArIGRIZWlnaHQpOyB9XG4gICAgfVxuICAgIHNpZ25hbExhdGVyKGNtLCBcIm1hcmtlckNoYW5nZWRcIiwgY20sIHRoaXMkMSk7XG4gIH0pO1xufTtcblxuVGV4dE1hcmtlci5wcm90b3R5cGUuYXR0YWNoTGluZSA9IGZ1bmN0aW9uIChsaW5lKSB7XG4gIGlmICghdGhpcy5saW5lcy5sZW5ndGggJiYgdGhpcy5kb2MuY20pIHtcbiAgICB2YXIgb3AgPSB0aGlzLmRvYy5jbS5jdXJPcDtcbiAgICBpZiAoIW9wLm1heWJlSGlkZGVuTWFya2VycyB8fCBpbmRleE9mKG9wLm1heWJlSGlkZGVuTWFya2VycywgdGhpcykgPT0gLTEpXG4gICAgICB7IChvcC5tYXliZVVuaGlkZGVuTWFya2VycyB8fCAob3AubWF5YmVVbmhpZGRlbk1hcmtlcnMgPSBbXSkpLnB1c2godGhpcyk7IH1cbiAgfVxuICB0aGlzLmxpbmVzLnB1c2gobGluZSk7XG59O1xuXG5UZXh0TWFya2VyLnByb3RvdHlwZS5kZXRhY2hMaW5lID0gZnVuY3Rpb24gKGxpbmUpIHtcbiAgdGhpcy5saW5lcy5zcGxpY2UoaW5kZXhPZih0aGlzLmxpbmVzLCBsaW5lKSwgMSk7XG4gIGlmICghdGhpcy5saW5lcy5sZW5ndGggJiYgdGhpcy5kb2MuY20pIHtcbiAgICB2YXIgb3AgPSB0aGlzLmRvYy5jbS5jdXJPcDsob3AubWF5YmVIaWRkZW5NYXJrZXJzIHx8IChvcC5tYXliZUhpZGRlbk1hcmtlcnMgPSBbXSkpLnB1c2godGhpcyk7XG4gIH1cbn07XG5ldmVudE1peGluKFRleHRNYXJrZXIpO1xuXG4vLyBDcmVhdGUgYSBtYXJrZXIsIHdpcmUgaXQgdXAgdG8gdGhlIHJpZ2h0IGxpbmVzLCBhbmRcbmZ1bmN0aW9uIG1hcmtUZXh0KGRvYywgZnJvbSwgdG8sIG9wdGlvbnMsIHR5cGUpIHtcbiAgLy8gU2hhcmVkIG1hcmtlcnMgKGFjcm9zcyBsaW5rZWQgZG9jdW1lbnRzKSBhcmUgaGFuZGxlZCBzZXBhcmF0ZWx5XG4gIC8vIChtYXJrVGV4dFNoYXJlZCB3aWxsIGNhbGwgb3V0IHRvIHRoaXMgYWdhaW4sIG9uY2UgcGVyXG4gIC8vIGRvY3VtZW50KS5cbiAgaWYgKG9wdGlvbnMgJiYgb3B0aW9ucy5zaGFyZWQpIHsgcmV0dXJuIG1hcmtUZXh0U2hhcmVkKGRvYywgZnJvbSwgdG8sIG9wdGlvbnMsIHR5cGUpIH1cbiAgLy8gRW5zdXJlIHdlIGFyZSBpbiBhbiBvcGVyYXRpb24uXG4gIGlmIChkb2MuY20gJiYgIWRvYy5jbS5jdXJPcCkgeyByZXR1cm4gb3BlcmF0aW9uKGRvYy5jbSwgbWFya1RleHQpKGRvYywgZnJvbSwgdG8sIG9wdGlvbnMsIHR5cGUpIH1cblxuICB2YXIgbWFya2VyID0gbmV3IFRleHRNYXJrZXIoZG9jLCB0eXBlKSwgZGlmZiA9IGNtcChmcm9tLCB0byk7XG4gIGlmIChvcHRpb25zKSB7IGNvcHlPYmoob3B0aW9ucywgbWFya2VyLCBmYWxzZSk7IH1cbiAgLy8gRG9uJ3QgY29ubmVjdCBlbXB0eSBtYXJrZXJzIHVubGVzcyBjbGVhcldoZW5FbXB0eSBpcyBmYWxzZVxuICBpZiAoZGlmZiA+IDAgfHwgZGlmZiA9PSAwICYmIG1hcmtlci5jbGVhcldoZW5FbXB0eSAhPT0gZmFsc2UpXG4gICAgeyByZXR1cm4gbWFya2VyIH1cbiAgaWYgKG1hcmtlci5yZXBsYWNlZFdpdGgpIHtcbiAgICAvLyBTaG93aW5nIHVwIGFzIGEgd2lkZ2V0IGltcGxpZXMgY29sbGFwc2VkICh3aWRnZXQgcmVwbGFjZXMgdGV4dClcbiAgICBtYXJrZXIuY29sbGFwc2VkID0gdHJ1ZTtcbiAgICBtYXJrZXIud2lkZ2V0Tm9kZSA9IGVsdFAoXCJzcGFuXCIsIFttYXJrZXIucmVwbGFjZWRXaXRoXSwgXCJDb2RlTWlycm9yLXdpZGdldFwiKTtcbiAgICBpZiAoIW9wdGlvbnMuaGFuZGxlTW91c2VFdmVudHMpIHsgbWFya2VyLndpZGdldE5vZGUuc2V0QXR0cmlidXRlKFwiY20taWdub3JlLWV2ZW50c1wiLCBcInRydWVcIik7IH1cbiAgICBpZiAob3B0aW9ucy5pbnNlcnRMZWZ0KSB7IG1hcmtlci53aWRnZXROb2RlLmluc2VydExlZnQgPSB0cnVlOyB9XG4gIH1cbiAgaWYgKG1hcmtlci5jb2xsYXBzZWQpIHtcbiAgICBpZiAoY29uZmxpY3RpbmdDb2xsYXBzZWRSYW5nZShkb2MsIGZyb20ubGluZSwgZnJvbSwgdG8sIG1hcmtlcikgfHxcbiAgICAgICAgZnJvbS5saW5lICE9IHRvLmxpbmUgJiYgY29uZmxpY3RpbmdDb2xsYXBzZWRSYW5nZShkb2MsIHRvLmxpbmUsIGZyb20sIHRvLCBtYXJrZXIpKVxuICAgICAgeyB0aHJvdyBuZXcgRXJyb3IoXCJJbnNlcnRpbmcgY29sbGFwc2VkIG1hcmtlciBwYXJ0aWFsbHkgb3ZlcmxhcHBpbmcgYW4gZXhpc3Rpbmcgb25lXCIpIH1cbiAgICBzZWVDb2xsYXBzZWRTcGFucygpO1xuICB9XG5cbiAgaWYgKG1hcmtlci5hZGRUb0hpc3RvcnkpXG4gICAgeyBhZGRDaGFuZ2VUb0hpc3RvcnkoZG9jLCB7ZnJvbTogZnJvbSwgdG86IHRvLCBvcmlnaW46IFwibWFya1RleHRcIn0sIGRvYy5zZWwsIE5hTik7IH1cblxuICB2YXIgY3VyTGluZSA9IGZyb20ubGluZSwgY20gPSBkb2MuY20sIHVwZGF0ZU1heExpbmU7XG4gIGRvYy5pdGVyKGN1ckxpbmUsIHRvLmxpbmUgKyAxLCBmdW5jdGlvbiAobGluZSkge1xuICAgIGlmIChjbSAmJiBtYXJrZXIuY29sbGFwc2VkICYmICFjbS5vcHRpb25zLmxpbmVXcmFwcGluZyAmJiB2aXN1YWxMaW5lKGxpbmUpID09IGNtLmRpc3BsYXkubWF4TGluZSlcbiAgICAgIHsgdXBkYXRlTWF4TGluZSA9IHRydWU7IH1cbiAgICBpZiAobWFya2VyLmNvbGxhcHNlZCAmJiBjdXJMaW5lICE9IGZyb20ubGluZSkgeyB1cGRhdGVMaW5lSGVpZ2h0KGxpbmUsIDApOyB9XG4gICAgYWRkTWFya2VkU3BhbihsaW5lLCBuZXcgTWFya2VkU3BhbihtYXJrZXIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjdXJMaW5lID09IGZyb20ubGluZSA/IGZyb20uY2ggOiBudWxsLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY3VyTGluZSA9PSB0by5saW5lID8gdG8uY2ggOiBudWxsKSk7XG4gICAgKytjdXJMaW5lO1xuICB9KTtcbiAgLy8gbGluZUlzSGlkZGVuIGRlcGVuZHMgb24gdGhlIHByZXNlbmNlIG9mIHRoZSBzcGFucywgc28gbmVlZHMgYSBzZWNvbmQgcGFzc1xuICBpZiAobWFya2VyLmNvbGxhcHNlZCkgeyBkb2MuaXRlcihmcm9tLmxpbmUsIHRvLmxpbmUgKyAxLCBmdW5jdGlvbiAobGluZSkge1xuICAgIGlmIChsaW5lSXNIaWRkZW4oZG9jLCBsaW5lKSkgeyB1cGRhdGVMaW5lSGVpZ2h0KGxpbmUsIDApOyB9XG4gIH0pOyB9XG5cbiAgaWYgKG1hcmtlci5jbGVhck9uRW50ZXIpIHsgb24obWFya2VyLCBcImJlZm9yZUN1cnNvckVudGVyXCIsIGZ1bmN0aW9uICgpIHsgcmV0dXJuIG1hcmtlci5jbGVhcigpOyB9KTsgfVxuXG4gIGlmIChtYXJrZXIucmVhZE9ubHkpIHtcbiAgICBzZWVSZWFkT25seVNwYW5zKCk7XG4gICAgaWYgKGRvYy5oaXN0b3J5LmRvbmUubGVuZ3RoIHx8IGRvYy5oaXN0b3J5LnVuZG9uZS5sZW5ndGgpXG4gICAgICB7IGRvYy5jbGVhckhpc3RvcnkoKTsgfVxuICB9XG4gIGlmIChtYXJrZXIuY29sbGFwc2VkKSB7XG4gICAgbWFya2VyLmlkID0gKytuZXh0TWFya2VySWQ7XG4gICAgbWFya2VyLmF0b21pYyA9IHRydWU7XG4gIH1cbiAgaWYgKGNtKSB7XG4gICAgLy8gU3luYyBlZGl0b3Igc3RhdGVcbiAgICBpZiAodXBkYXRlTWF4TGluZSkgeyBjbS5jdXJPcC51cGRhdGVNYXhMaW5lID0gdHJ1ZTsgfVxuICAgIGlmIChtYXJrZXIuY29sbGFwc2VkKVxuICAgICAgeyByZWdDaGFuZ2UoY20sIGZyb20ubGluZSwgdG8ubGluZSArIDEpOyB9XG4gICAgZWxzZSBpZiAobWFya2VyLmNsYXNzTmFtZSB8fCBtYXJrZXIudGl0bGUgfHwgbWFya2VyLnN0YXJ0U3R5bGUgfHwgbWFya2VyLmVuZFN0eWxlIHx8IG1hcmtlci5jc3MpXG4gICAgICB7IGZvciAodmFyIGkgPSBmcm9tLmxpbmU7IGkgPD0gdG8ubGluZTsgaSsrKSB7IHJlZ0xpbmVDaGFuZ2UoY20sIGksIFwidGV4dFwiKTsgfSB9XG4gICAgaWYgKG1hcmtlci5hdG9taWMpIHsgcmVDaGVja1NlbGVjdGlvbihjbS5kb2MpOyB9XG4gICAgc2lnbmFsTGF0ZXIoY20sIFwibWFya2VyQWRkZWRcIiwgY20sIG1hcmtlcik7XG4gIH1cbiAgcmV0dXJuIG1hcmtlclxufVxuXG4vLyBTSEFSRUQgVEVYVE1BUktFUlNcblxuLy8gQSBzaGFyZWQgbWFya2VyIHNwYW5zIG11bHRpcGxlIGxpbmtlZCBkb2N1bWVudHMuIEl0IGlzXG4vLyBpbXBsZW1lbnRlZCBhcyBhIG1ldGEtbWFya2VyLW9iamVjdCBjb250cm9sbGluZyBtdWx0aXBsZSBub3JtYWxcbi8vIG1hcmtlcnMuXG52YXIgU2hhcmVkVGV4dE1hcmtlciA9IGZ1bmN0aW9uKG1hcmtlcnMsIHByaW1hcnkpIHtcbiAgdmFyIHRoaXMkMSA9IHRoaXM7XG5cbiAgdGhpcy5tYXJrZXJzID0gbWFya2VycztcbiAgdGhpcy5wcmltYXJ5ID0gcHJpbWFyeTtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBtYXJrZXJzLmxlbmd0aDsgKytpKVxuICAgIHsgbWFya2Vyc1tpXS5wYXJlbnQgPSB0aGlzJDE7IH1cbn07XG5cblNoYXJlZFRleHRNYXJrZXIucHJvdG90eXBlLmNsZWFyID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciB0aGlzJDEgPSB0aGlzO1xuXG4gIGlmICh0aGlzLmV4cGxpY2l0bHlDbGVhcmVkKSB7IHJldHVybiB9XG4gIHRoaXMuZXhwbGljaXRseUNsZWFyZWQgPSB0cnVlO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMubWFya2Vycy5sZW5ndGg7ICsraSlcbiAgICB7IHRoaXMkMS5tYXJrZXJzW2ldLmNsZWFyKCk7IH1cbiAgc2lnbmFsTGF0ZXIodGhpcywgXCJjbGVhclwiKTtcbn07XG5cblNoYXJlZFRleHRNYXJrZXIucHJvdG90eXBlLmZpbmQgPSBmdW5jdGlvbiAoc2lkZSwgbGluZU9iaikge1xuICByZXR1cm4gdGhpcy5wcmltYXJ5LmZpbmQoc2lkZSwgbGluZU9iailcbn07XG5ldmVudE1peGluKFNoYXJlZFRleHRNYXJrZXIpO1xuXG5mdW5jdGlvbiBtYXJrVGV4dFNoYXJlZChkb2MsIGZyb20sIHRvLCBvcHRpb25zLCB0eXBlKSB7XG4gIG9wdGlvbnMgPSBjb3B5T2JqKG9wdGlvbnMpO1xuICBvcHRpb25zLnNoYXJlZCA9IGZhbHNlO1xuICB2YXIgbWFya2VycyA9IFttYXJrVGV4dChkb2MsIGZyb20sIHRvLCBvcHRpb25zLCB0eXBlKV0sIHByaW1hcnkgPSBtYXJrZXJzWzBdO1xuICB2YXIgd2lkZ2V0ID0gb3B0aW9ucy53aWRnZXROb2RlO1xuICBsaW5rZWREb2NzKGRvYywgZnVuY3Rpb24gKGRvYykge1xuICAgIGlmICh3aWRnZXQpIHsgb3B0aW9ucy53aWRnZXROb2RlID0gd2lkZ2V0LmNsb25lTm9kZSh0cnVlKTsgfVxuICAgIG1hcmtlcnMucHVzaChtYXJrVGV4dChkb2MsIGNsaXBQb3MoZG9jLCBmcm9tKSwgY2xpcFBvcyhkb2MsIHRvKSwgb3B0aW9ucywgdHlwZSkpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZG9jLmxpbmtlZC5sZW5ndGg7ICsraSlcbiAgICAgIHsgaWYgKGRvYy5saW5rZWRbaV0uaXNQYXJlbnQpIHsgcmV0dXJuIH0gfVxuICAgIHByaW1hcnkgPSBsc3QobWFya2Vycyk7XG4gIH0pO1xuICByZXR1cm4gbmV3IFNoYXJlZFRleHRNYXJrZXIobWFya2VycywgcHJpbWFyeSlcbn1cblxuZnVuY3Rpb24gZmluZFNoYXJlZE1hcmtlcnMoZG9jKSB7XG4gIHJldHVybiBkb2MuZmluZE1hcmtzKFBvcyhkb2MuZmlyc3QsIDApLCBkb2MuY2xpcFBvcyhQb3MoZG9jLmxhc3RMaW5lKCkpKSwgZnVuY3Rpb24gKG0pIHsgcmV0dXJuIG0ucGFyZW50OyB9KVxufVxuXG5mdW5jdGlvbiBjb3B5U2hhcmVkTWFya2Vycyhkb2MsIG1hcmtlcnMpIHtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBtYXJrZXJzLmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIG1hcmtlciA9IG1hcmtlcnNbaV0sIHBvcyA9IG1hcmtlci5maW5kKCk7XG4gICAgdmFyIG1Gcm9tID0gZG9jLmNsaXBQb3MocG9zLmZyb20pLCBtVG8gPSBkb2MuY2xpcFBvcyhwb3MudG8pO1xuICAgIGlmIChjbXAobUZyb20sIG1UbykpIHtcbiAgICAgIHZhciBzdWJNYXJrID0gbWFya1RleHQoZG9jLCBtRnJvbSwgbVRvLCBtYXJrZXIucHJpbWFyeSwgbWFya2VyLnByaW1hcnkudHlwZSk7XG4gICAgICBtYXJrZXIubWFya2Vycy5wdXNoKHN1Yk1hcmspO1xuICAgICAgc3ViTWFyay5wYXJlbnQgPSBtYXJrZXI7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGRldGFjaFNoYXJlZE1hcmtlcnMobWFya2Vycykge1xuICB2YXIgbG9vcCA9IGZ1bmN0aW9uICggaSApIHtcbiAgICB2YXIgbWFya2VyID0gbWFya2Vyc1tpXSwgbGlua2VkID0gW21hcmtlci5wcmltYXJ5LmRvY107XG4gICAgbGlua2VkRG9jcyhtYXJrZXIucHJpbWFyeS5kb2MsIGZ1bmN0aW9uIChkKSB7IHJldHVybiBsaW5rZWQucHVzaChkKTsgfSk7XG4gICAgZm9yICh2YXIgaiA9IDA7IGogPCBtYXJrZXIubWFya2Vycy5sZW5ndGg7IGorKykge1xuICAgICAgdmFyIHN1Yk1hcmtlciA9IG1hcmtlci5tYXJrZXJzW2pdO1xuICAgICAgaWYgKGluZGV4T2YobGlua2VkLCBzdWJNYXJrZXIuZG9jKSA9PSAtMSkge1xuICAgICAgICBzdWJNYXJrZXIucGFyZW50ID0gbnVsbDtcbiAgICAgICAgbWFya2VyLm1hcmtlcnMuc3BsaWNlKGotLSwgMSk7XG4gICAgICB9XG4gICAgfVxuICB9O1xuXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbWFya2Vycy5sZW5ndGg7IGkrKykgbG9vcCggaSApO1xufVxuXG52YXIgbmV4dERvY0lkID0gMDtcbnZhciBEb2MgPSBmdW5jdGlvbih0ZXh0LCBtb2RlLCBmaXJzdExpbmUsIGxpbmVTZXAsIGRpcmVjdGlvbikge1xuICBpZiAoISh0aGlzIGluc3RhbmNlb2YgRG9jKSkgeyByZXR1cm4gbmV3IERvYyh0ZXh0LCBtb2RlLCBmaXJzdExpbmUsIGxpbmVTZXAsIGRpcmVjdGlvbikgfVxuICBpZiAoZmlyc3RMaW5lID09IG51bGwpIHsgZmlyc3RMaW5lID0gMDsgfVxuXG4gIEJyYW5jaENodW5rLmNhbGwodGhpcywgW25ldyBMZWFmQ2h1bmsoW25ldyBMaW5lKFwiXCIsIG51bGwpXSldKTtcbiAgdGhpcy5maXJzdCA9IGZpcnN0TGluZTtcbiAgdGhpcy5zY3JvbGxUb3AgPSB0aGlzLnNjcm9sbExlZnQgPSAwO1xuICB0aGlzLmNhbnRFZGl0ID0gZmFsc2U7XG4gIHRoaXMuY2xlYW5HZW5lcmF0aW9uID0gMTtcbiAgdGhpcy5tb2RlRnJvbnRpZXIgPSB0aGlzLmhpZ2hsaWdodEZyb250aWVyID0gZmlyc3RMaW5lO1xuICB2YXIgc3RhcnQgPSBQb3MoZmlyc3RMaW5lLCAwKTtcbiAgdGhpcy5zZWwgPSBzaW1wbGVTZWxlY3Rpb24oc3RhcnQpO1xuICB0aGlzLmhpc3RvcnkgPSBuZXcgSGlzdG9yeShudWxsKTtcbiAgdGhpcy5pZCA9ICsrbmV4dERvY0lkO1xuICB0aGlzLm1vZGVPcHRpb24gPSBtb2RlO1xuICB0aGlzLmxpbmVTZXAgPSBsaW5lU2VwO1xuICB0aGlzLmRpcmVjdGlvbiA9IChkaXJlY3Rpb24gPT0gXCJydGxcIikgPyBcInJ0bFwiIDogXCJsdHJcIjtcbiAgdGhpcy5leHRlbmQgPSBmYWxzZTtcblxuICBpZiAodHlwZW9mIHRleHQgPT0gXCJzdHJpbmdcIikgeyB0ZXh0ID0gdGhpcy5zcGxpdExpbmVzKHRleHQpOyB9XG4gIHVwZGF0ZURvYyh0aGlzLCB7ZnJvbTogc3RhcnQsIHRvOiBzdGFydCwgdGV4dDogdGV4dH0pO1xuICBzZXRTZWxlY3Rpb24odGhpcywgc2ltcGxlU2VsZWN0aW9uKHN0YXJ0KSwgc2VsX2RvbnRTY3JvbGwpO1xufTtcblxuRG9jLnByb3RvdHlwZSA9IGNyZWF0ZU9iaihCcmFuY2hDaHVuay5wcm90b3R5cGUsIHtcbiAgY29uc3RydWN0b3I6IERvYyxcbiAgLy8gSXRlcmF0ZSBvdmVyIHRoZSBkb2N1bWVudC4gU3VwcG9ydHMgdHdvIGZvcm1zIC0tIHdpdGggb25seSBvbmVcbiAgLy8gYXJndW1lbnQsIGl0IGNhbGxzIHRoYXQgZm9yIGVhY2ggbGluZSBpbiB0aGUgZG9jdW1lbnQuIFdpdGhcbiAgLy8gdGhyZWUsIGl0IGl0ZXJhdGVzIG92ZXIgdGhlIHJhbmdlIGdpdmVuIGJ5IHRoZSBmaXJzdCB0d28gKHdpdGhcbiAgLy8gdGhlIHNlY29uZCBiZWluZyBub24taW5jbHVzaXZlKS5cbiAgaXRlcjogZnVuY3Rpb24oZnJvbSwgdG8sIG9wKSB7XG4gICAgaWYgKG9wKSB7IHRoaXMuaXRlck4oZnJvbSAtIHRoaXMuZmlyc3QsIHRvIC0gZnJvbSwgb3ApOyB9XG4gICAgZWxzZSB7IHRoaXMuaXRlck4odGhpcy5maXJzdCwgdGhpcy5maXJzdCArIHRoaXMuc2l6ZSwgZnJvbSk7IH1cbiAgfSxcblxuICAvLyBOb24tcHVibGljIGludGVyZmFjZSBmb3IgYWRkaW5nIGFuZCByZW1vdmluZyBsaW5lcy5cbiAgaW5zZXJ0OiBmdW5jdGlvbihhdCwgbGluZXMpIHtcbiAgICB2YXIgaGVpZ2h0ID0gMDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxpbmVzLmxlbmd0aDsgKytpKSB7IGhlaWdodCArPSBsaW5lc1tpXS5oZWlnaHQ7IH1cbiAgICB0aGlzLmluc2VydElubmVyKGF0IC0gdGhpcy5maXJzdCwgbGluZXMsIGhlaWdodCk7XG4gIH0sXG4gIHJlbW92ZTogZnVuY3Rpb24oYXQsIG4pIHsgdGhpcy5yZW1vdmVJbm5lcihhdCAtIHRoaXMuZmlyc3QsIG4pOyB9LFxuXG4gIC8vIEZyb20gaGVyZSwgdGhlIG1ldGhvZHMgYXJlIHBhcnQgb2YgdGhlIHB1YmxpYyBpbnRlcmZhY2UuIE1vc3RcbiAgLy8gYXJlIGFsc28gYXZhaWxhYmxlIGZyb20gQ29kZU1pcnJvciAoZWRpdG9yKSBpbnN0YW5jZXMuXG5cbiAgZ2V0VmFsdWU6IGZ1bmN0aW9uKGxpbmVTZXApIHtcbiAgICB2YXIgbGluZXMgPSBnZXRMaW5lcyh0aGlzLCB0aGlzLmZpcnN0LCB0aGlzLmZpcnN0ICsgdGhpcy5zaXplKTtcbiAgICBpZiAobGluZVNlcCA9PT0gZmFsc2UpIHsgcmV0dXJuIGxpbmVzIH1cbiAgICByZXR1cm4gbGluZXMuam9pbihsaW5lU2VwIHx8IHRoaXMubGluZVNlcGFyYXRvcigpKVxuICB9LFxuICBzZXRWYWx1ZTogZG9jTWV0aG9kT3AoZnVuY3Rpb24oY29kZSkge1xuICAgIHZhciB0b3AgPSBQb3ModGhpcy5maXJzdCwgMCksIGxhc3QgPSB0aGlzLmZpcnN0ICsgdGhpcy5zaXplIC0gMTtcbiAgICBtYWtlQ2hhbmdlKHRoaXMsIHtmcm9tOiB0b3AsIHRvOiBQb3MobGFzdCwgZ2V0TGluZSh0aGlzLCBsYXN0KS50ZXh0Lmxlbmd0aCksXG4gICAgICAgICAgICAgICAgICAgICAgdGV4dDogdGhpcy5zcGxpdExpbmVzKGNvZGUpLCBvcmlnaW46IFwic2V0VmFsdWVcIiwgZnVsbDogdHJ1ZX0sIHRydWUpO1xuICAgIGlmICh0aGlzLmNtKSB7IHNjcm9sbFRvQ29vcmRzKHRoaXMuY20sIDAsIDApOyB9XG4gICAgc2V0U2VsZWN0aW9uKHRoaXMsIHNpbXBsZVNlbGVjdGlvbih0b3ApLCBzZWxfZG9udFNjcm9sbCk7XG4gIH0pLFxuICByZXBsYWNlUmFuZ2U6IGZ1bmN0aW9uKGNvZGUsIGZyb20sIHRvLCBvcmlnaW4pIHtcbiAgICBmcm9tID0gY2xpcFBvcyh0aGlzLCBmcm9tKTtcbiAgICB0byA9IHRvID8gY2xpcFBvcyh0aGlzLCB0bykgOiBmcm9tO1xuICAgIHJlcGxhY2VSYW5nZSh0aGlzLCBjb2RlLCBmcm9tLCB0bywgb3JpZ2luKTtcbiAgfSxcbiAgZ2V0UmFuZ2U6IGZ1bmN0aW9uKGZyb20sIHRvLCBsaW5lU2VwKSB7XG4gICAgdmFyIGxpbmVzID0gZ2V0QmV0d2Vlbih0aGlzLCBjbGlwUG9zKHRoaXMsIGZyb20pLCBjbGlwUG9zKHRoaXMsIHRvKSk7XG4gICAgaWYgKGxpbmVTZXAgPT09IGZhbHNlKSB7IHJldHVybiBsaW5lcyB9XG4gICAgcmV0dXJuIGxpbmVzLmpvaW4obGluZVNlcCB8fCB0aGlzLmxpbmVTZXBhcmF0b3IoKSlcbiAgfSxcblxuICBnZXRMaW5lOiBmdW5jdGlvbihsaW5lKSB7dmFyIGwgPSB0aGlzLmdldExpbmVIYW5kbGUobGluZSk7IHJldHVybiBsICYmIGwudGV4dH0sXG5cbiAgZ2V0TGluZUhhbmRsZTogZnVuY3Rpb24obGluZSkge2lmIChpc0xpbmUodGhpcywgbGluZSkpIHsgcmV0dXJuIGdldExpbmUodGhpcywgbGluZSkgfX0sXG4gIGdldExpbmVOdW1iZXI6IGZ1bmN0aW9uKGxpbmUpIHtyZXR1cm4gbGluZU5vKGxpbmUpfSxcblxuICBnZXRMaW5lSGFuZGxlVmlzdWFsU3RhcnQ6IGZ1bmN0aW9uKGxpbmUpIHtcbiAgICBpZiAodHlwZW9mIGxpbmUgPT0gXCJudW1iZXJcIikgeyBsaW5lID0gZ2V0TGluZSh0aGlzLCBsaW5lKTsgfVxuICAgIHJldHVybiB2aXN1YWxMaW5lKGxpbmUpXG4gIH0sXG5cbiAgbGluZUNvdW50OiBmdW5jdGlvbigpIHtyZXR1cm4gdGhpcy5zaXplfSxcbiAgZmlyc3RMaW5lOiBmdW5jdGlvbigpIHtyZXR1cm4gdGhpcy5maXJzdH0sXG4gIGxhc3RMaW5lOiBmdW5jdGlvbigpIHtyZXR1cm4gdGhpcy5maXJzdCArIHRoaXMuc2l6ZSAtIDF9LFxuXG4gIGNsaXBQb3M6IGZ1bmN0aW9uKHBvcykge3JldHVybiBjbGlwUG9zKHRoaXMsIHBvcyl9LFxuXG4gIGdldEN1cnNvcjogZnVuY3Rpb24oc3RhcnQpIHtcbiAgICB2YXIgcmFuZ2UkJDEgPSB0aGlzLnNlbC5wcmltYXJ5KCksIHBvcztcbiAgICBpZiAoc3RhcnQgPT0gbnVsbCB8fCBzdGFydCA9PSBcImhlYWRcIikgeyBwb3MgPSByYW5nZSQkMS5oZWFkOyB9XG4gICAgZWxzZSBpZiAoc3RhcnQgPT0gXCJhbmNob3JcIikgeyBwb3MgPSByYW5nZSQkMS5hbmNob3I7IH1cbiAgICBlbHNlIGlmIChzdGFydCA9PSBcImVuZFwiIHx8IHN0YXJ0ID09IFwidG9cIiB8fCBzdGFydCA9PT0gZmFsc2UpIHsgcG9zID0gcmFuZ2UkJDEudG8oKTsgfVxuICAgIGVsc2UgeyBwb3MgPSByYW5nZSQkMS5mcm9tKCk7IH1cbiAgICByZXR1cm4gcG9zXG4gIH0sXG4gIGxpc3RTZWxlY3Rpb25zOiBmdW5jdGlvbigpIHsgcmV0dXJuIHRoaXMuc2VsLnJhbmdlcyB9LFxuICBzb21ldGhpbmdTZWxlY3RlZDogZnVuY3Rpb24oKSB7cmV0dXJuIHRoaXMuc2VsLnNvbWV0aGluZ1NlbGVjdGVkKCl9LFxuXG4gIHNldEN1cnNvcjogZG9jTWV0aG9kT3AoZnVuY3Rpb24obGluZSwgY2gsIG9wdGlvbnMpIHtcbiAgICBzZXRTaW1wbGVTZWxlY3Rpb24odGhpcywgY2xpcFBvcyh0aGlzLCB0eXBlb2YgbGluZSA9PSBcIm51bWJlclwiID8gUG9zKGxpbmUsIGNoIHx8IDApIDogbGluZSksIG51bGwsIG9wdGlvbnMpO1xuICB9KSxcbiAgc2V0U2VsZWN0aW9uOiBkb2NNZXRob2RPcChmdW5jdGlvbihhbmNob3IsIGhlYWQsIG9wdGlvbnMpIHtcbiAgICBzZXRTaW1wbGVTZWxlY3Rpb24odGhpcywgY2xpcFBvcyh0aGlzLCBhbmNob3IpLCBjbGlwUG9zKHRoaXMsIGhlYWQgfHwgYW5jaG9yKSwgb3B0aW9ucyk7XG4gIH0pLFxuICBleHRlbmRTZWxlY3Rpb246IGRvY01ldGhvZE9wKGZ1bmN0aW9uKGhlYWQsIG90aGVyLCBvcHRpb25zKSB7XG4gICAgZXh0ZW5kU2VsZWN0aW9uKHRoaXMsIGNsaXBQb3ModGhpcywgaGVhZCksIG90aGVyICYmIGNsaXBQb3ModGhpcywgb3RoZXIpLCBvcHRpb25zKTtcbiAgfSksXG4gIGV4dGVuZFNlbGVjdGlvbnM6IGRvY01ldGhvZE9wKGZ1bmN0aW9uKGhlYWRzLCBvcHRpb25zKSB7XG4gICAgZXh0ZW5kU2VsZWN0aW9ucyh0aGlzLCBjbGlwUG9zQXJyYXkodGhpcywgaGVhZHMpLCBvcHRpb25zKTtcbiAgfSksXG4gIGV4dGVuZFNlbGVjdGlvbnNCeTogZG9jTWV0aG9kT3AoZnVuY3Rpb24oZiwgb3B0aW9ucykge1xuICAgIHZhciBoZWFkcyA9IG1hcCh0aGlzLnNlbC5yYW5nZXMsIGYpO1xuICAgIGV4dGVuZFNlbGVjdGlvbnModGhpcywgY2xpcFBvc0FycmF5KHRoaXMsIGhlYWRzKSwgb3B0aW9ucyk7XG4gIH0pLFxuICBzZXRTZWxlY3Rpb25zOiBkb2NNZXRob2RPcChmdW5jdGlvbihyYW5nZXMsIHByaW1hcnksIG9wdGlvbnMpIHtcbiAgICB2YXIgdGhpcyQxID0gdGhpcztcblxuICAgIGlmICghcmFuZ2VzLmxlbmd0aCkgeyByZXR1cm4gfVxuICAgIHZhciBvdXQgPSBbXTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHJhbmdlcy5sZW5ndGg7IGkrKylcbiAgICAgIHsgb3V0W2ldID0gbmV3IFJhbmdlKGNsaXBQb3ModGhpcyQxLCByYW5nZXNbaV0uYW5jaG9yKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICBjbGlwUG9zKHRoaXMkMSwgcmFuZ2VzW2ldLmhlYWQpKTsgfVxuICAgIGlmIChwcmltYXJ5ID09IG51bGwpIHsgcHJpbWFyeSA9IE1hdGgubWluKHJhbmdlcy5sZW5ndGggLSAxLCB0aGlzLnNlbC5wcmltSW5kZXgpOyB9XG4gICAgc2V0U2VsZWN0aW9uKHRoaXMsIG5vcm1hbGl6ZVNlbGVjdGlvbihvdXQsIHByaW1hcnkpLCBvcHRpb25zKTtcbiAgfSksXG4gIGFkZFNlbGVjdGlvbjogZG9jTWV0aG9kT3AoZnVuY3Rpb24oYW5jaG9yLCBoZWFkLCBvcHRpb25zKSB7XG4gICAgdmFyIHJhbmdlcyA9IHRoaXMuc2VsLnJhbmdlcy5zbGljZSgwKTtcbiAgICByYW5nZXMucHVzaChuZXcgUmFuZ2UoY2xpcFBvcyh0aGlzLCBhbmNob3IpLCBjbGlwUG9zKHRoaXMsIGhlYWQgfHwgYW5jaG9yKSkpO1xuICAgIHNldFNlbGVjdGlvbih0aGlzLCBub3JtYWxpemVTZWxlY3Rpb24ocmFuZ2VzLCByYW5nZXMubGVuZ3RoIC0gMSksIG9wdGlvbnMpO1xuICB9KSxcblxuICBnZXRTZWxlY3Rpb246IGZ1bmN0aW9uKGxpbmVTZXApIHtcbiAgICB2YXIgdGhpcyQxID0gdGhpcztcblxuICAgIHZhciByYW5nZXMgPSB0aGlzLnNlbC5yYW5nZXMsIGxpbmVzO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcmFuZ2VzLmxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIgc2VsID0gZ2V0QmV0d2Vlbih0aGlzJDEsIHJhbmdlc1tpXS5mcm9tKCksIHJhbmdlc1tpXS50bygpKTtcbiAgICAgIGxpbmVzID0gbGluZXMgPyBsaW5lcy5jb25jYXQoc2VsKSA6IHNlbDtcbiAgICB9XG4gICAgaWYgKGxpbmVTZXAgPT09IGZhbHNlKSB7IHJldHVybiBsaW5lcyB9XG4gICAgZWxzZSB7IHJldHVybiBsaW5lcy5qb2luKGxpbmVTZXAgfHwgdGhpcy5saW5lU2VwYXJhdG9yKCkpIH1cbiAgfSxcbiAgZ2V0U2VsZWN0aW9uczogZnVuY3Rpb24obGluZVNlcCkge1xuICAgIHZhciB0aGlzJDEgPSB0aGlzO1xuXG4gICAgdmFyIHBhcnRzID0gW10sIHJhbmdlcyA9IHRoaXMuc2VsLnJhbmdlcztcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHJhbmdlcy5sZW5ndGg7IGkrKykge1xuICAgICAgdmFyIHNlbCA9IGdldEJldHdlZW4odGhpcyQxLCByYW5nZXNbaV0uZnJvbSgpLCByYW5nZXNbaV0udG8oKSk7XG4gICAgICBpZiAobGluZVNlcCAhPT0gZmFsc2UpIHsgc2VsID0gc2VsLmpvaW4obGluZVNlcCB8fCB0aGlzJDEubGluZVNlcGFyYXRvcigpKTsgfVxuICAgICAgcGFydHNbaV0gPSBzZWw7XG4gICAgfVxuICAgIHJldHVybiBwYXJ0c1xuICB9LFxuICByZXBsYWNlU2VsZWN0aW9uOiBmdW5jdGlvbihjb2RlLCBjb2xsYXBzZSwgb3JpZ2luKSB7XG4gICAgdmFyIGR1cCA9IFtdO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5zZWwucmFuZ2VzLmxlbmd0aDsgaSsrKVxuICAgICAgeyBkdXBbaV0gPSBjb2RlOyB9XG4gICAgdGhpcy5yZXBsYWNlU2VsZWN0aW9ucyhkdXAsIGNvbGxhcHNlLCBvcmlnaW4gfHwgXCIraW5wdXRcIik7XG4gIH0sXG4gIHJlcGxhY2VTZWxlY3Rpb25zOiBkb2NNZXRob2RPcChmdW5jdGlvbihjb2RlLCBjb2xsYXBzZSwgb3JpZ2luKSB7XG4gICAgdmFyIHRoaXMkMSA9IHRoaXM7XG5cbiAgICB2YXIgY2hhbmdlcyA9IFtdLCBzZWwgPSB0aGlzLnNlbDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHNlbC5yYW5nZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciByYW5nZSQkMSA9IHNlbC5yYW5nZXNbaV07XG4gICAgICBjaGFuZ2VzW2ldID0ge2Zyb206IHJhbmdlJCQxLmZyb20oKSwgdG86IHJhbmdlJCQxLnRvKCksIHRleHQ6IHRoaXMkMS5zcGxpdExpbmVzKGNvZGVbaV0pLCBvcmlnaW46IG9yaWdpbn07XG4gICAgfVxuICAgIHZhciBuZXdTZWwgPSBjb2xsYXBzZSAmJiBjb2xsYXBzZSAhPSBcImVuZFwiICYmIGNvbXB1dGVSZXBsYWNlZFNlbCh0aGlzLCBjaGFuZ2VzLCBjb2xsYXBzZSk7XG4gICAgZm9yICh2YXIgaSQxID0gY2hhbmdlcy5sZW5ndGggLSAxOyBpJDEgPj0gMDsgaSQxLS0pXG4gICAgICB7IG1ha2VDaGFuZ2UodGhpcyQxLCBjaGFuZ2VzW2kkMV0pOyB9XG4gICAgaWYgKG5ld1NlbCkgeyBzZXRTZWxlY3Rpb25SZXBsYWNlSGlzdG9yeSh0aGlzLCBuZXdTZWwpOyB9XG4gICAgZWxzZSBpZiAodGhpcy5jbSkgeyBlbnN1cmVDdXJzb3JWaXNpYmxlKHRoaXMuY20pOyB9XG4gIH0pLFxuICB1bmRvOiBkb2NNZXRob2RPcChmdW5jdGlvbigpIHttYWtlQ2hhbmdlRnJvbUhpc3RvcnkodGhpcywgXCJ1bmRvXCIpO30pLFxuICByZWRvOiBkb2NNZXRob2RPcChmdW5jdGlvbigpIHttYWtlQ2hhbmdlRnJvbUhpc3RvcnkodGhpcywgXCJyZWRvXCIpO30pLFxuICB1bmRvU2VsZWN0aW9uOiBkb2NNZXRob2RPcChmdW5jdGlvbigpIHttYWtlQ2hhbmdlRnJvbUhpc3RvcnkodGhpcywgXCJ1bmRvXCIsIHRydWUpO30pLFxuICByZWRvU2VsZWN0aW9uOiBkb2NNZXRob2RPcChmdW5jdGlvbigpIHttYWtlQ2hhbmdlRnJvbUhpc3RvcnkodGhpcywgXCJyZWRvXCIsIHRydWUpO30pLFxuXG4gIHNldEV4dGVuZGluZzogZnVuY3Rpb24odmFsKSB7dGhpcy5leHRlbmQgPSB2YWw7fSxcbiAgZ2V0RXh0ZW5kaW5nOiBmdW5jdGlvbigpIHtyZXR1cm4gdGhpcy5leHRlbmR9LFxuXG4gIGhpc3RvcnlTaXplOiBmdW5jdGlvbigpIHtcbiAgICB2YXIgaGlzdCA9IHRoaXMuaGlzdG9yeSwgZG9uZSA9IDAsIHVuZG9uZSA9IDA7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBoaXN0LmRvbmUubGVuZ3RoOyBpKyspIHsgaWYgKCFoaXN0LmRvbmVbaV0ucmFuZ2VzKSB7ICsrZG9uZTsgfSB9XG4gICAgZm9yICh2YXIgaSQxID0gMDsgaSQxIDwgaGlzdC51bmRvbmUubGVuZ3RoOyBpJDErKykgeyBpZiAoIWhpc3QudW5kb25lW2kkMV0ucmFuZ2VzKSB7ICsrdW5kb25lOyB9IH1cbiAgICByZXR1cm4ge3VuZG86IGRvbmUsIHJlZG86IHVuZG9uZX1cbiAgfSxcbiAgY2xlYXJIaXN0b3J5OiBmdW5jdGlvbigpIHt0aGlzLmhpc3RvcnkgPSBuZXcgSGlzdG9yeSh0aGlzLmhpc3RvcnkubWF4R2VuZXJhdGlvbik7fSxcblxuICBtYXJrQ2xlYW46IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuY2xlYW5HZW5lcmF0aW9uID0gdGhpcy5jaGFuZ2VHZW5lcmF0aW9uKHRydWUpO1xuICB9LFxuICBjaGFuZ2VHZW5lcmF0aW9uOiBmdW5jdGlvbihmb3JjZVNwbGl0KSB7XG4gICAgaWYgKGZvcmNlU3BsaXQpXG4gICAgICB7IHRoaXMuaGlzdG9yeS5sYXN0T3AgPSB0aGlzLmhpc3RvcnkubGFzdFNlbE9wID0gdGhpcy5oaXN0b3J5Lmxhc3RPcmlnaW4gPSBudWxsOyB9XG4gICAgcmV0dXJuIHRoaXMuaGlzdG9yeS5nZW5lcmF0aW9uXG4gIH0sXG4gIGlzQ2xlYW46IGZ1bmN0aW9uIChnZW4pIHtcbiAgICByZXR1cm4gdGhpcy5oaXN0b3J5LmdlbmVyYXRpb24gPT0gKGdlbiB8fCB0aGlzLmNsZWFuR2VuZXJhdGlvbilcbiAgfSxcblxuICBnZXRIaXN0b3J5OiBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4ge2RvbmU6IGNvcHlIaXN0b3J5QXJyYXkodGhpcy5oaXN0b3J5LmRvbmUpLFxuICAgICAgICAgICAgdW5kb25lOiBjb3B5SGlzdG9yeUFycmF5KHRoaXMuaGlzdG9yeS51bmRvbmUpfVxuICB9LFxuICBzZXRIaXN0b3J5OiBmdW5jdGlvbihoaXN0RGF0YSkge1xuICAgIHZhciBoaXN0ID0gdGhpcy5oaXN0b3J5ID0gbmV3IEhpc3RvcnkodGhpcy5oaXN0b3J5Lm1heEdlbmVyYXRpb24pO1xuICAgIGhpc3QuZG9uZSA9IGNvcHlIaXN0b3J5QXJyYXkoaGlzdERhdGEuZG9uZS5zbGljZSgwKSwgbnVsbCwgdHJ1ZSk7XG4gICAgaGlzdC51bmRvbmUgPSBjb3B5SGlzdG9yeUFycmF5KGhpc3REYXRhLnVuZG9uZS5zbGljZSgwKSwgbnVsbCwgdHJ1ZSk7XG4gIH0sXG5cbiAgc2V0R3V0dGVyTWFya2VyOiBkb2NNZXRob2RPcChmdW5jdGlvbihsaW5lLCBndXR0ZXJJRCwgdmFsdWUpIHtcbiAgICByZXR1cm4gY2hhbmdlTGluZSh0aGlzLCBsaW5lLCBcImd1dHRlclwiLCBmdW5jdGlvbiAobGluZSkge1xuICAgICAgdmFyIG1hcmtlcnMgPSBsaW5lLmd1dHRlck1hcmtlcnMgfHwgKGxpbmUuZ3V0dGVyTWFya2VycyA9IHt9KTtcbiAgICAgIG1hcmtlcnNbZ3V0dGVySURdID0gdmFsdWU7XG4gICAgICBpZiAoIXZhbHVlICYmIGlzRW1wdHkobWFya2VycykpIHsgbGluZS5ndXR0ZXJNYXJrZXJzID0gbnVsbDsgfVxuICAgICAgcmV0dXJuIHRydWVcbiAgICB9KVxuICB9KSxcblxuICBjbGVhckd1dHRlcjogZG9jTWV0aG9kT3AoZnVuY3Rpb24oZ3V0dGVySUQpIHtcbiAgICB2YXIgdGhpcyQxID0gdGhpcztcblxuICAgIHRoaXMuaXRlcihmdW5jdGlvbiAobGluZSkge1xuICAgICAgaWYgKGxpbmUuZ3V0dGVyTWFya2VycyAmJiBsaW5lLmd1dHRlck1hcmtlcnNbZ3V0dGVySURdKSB7XG4gICAgICAgIGNoYW5nZUxpbmUodGhpcyQxLCBsaW5lLCBcImd1dHRlclwiLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgbGluZS5ndXR0ZXJNYXJrZXJzW2d1dHRlcklEXSA9IG51bGw7XG4gICAgICAgICAgaWYgKGlzRW1wdHkobGluZS5ndXR0ZXJNYXJrZXJzKSkgeyBsaW5lLmd1dHRlck1hcmtlcnMgPSBudWxsOyB9XG4gICAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfSk7XG4gIH0pLFxuXG4gIGxpbmVJbmZvOiBmdW5jdGlvbihsaW5lKSB7XG4gICAgdmFyIG47XG4gICAgaWYgKHR5cGVvZiBsaW5lID09IFwibnVtYmVyXCIpIHtcbiAgICAgIGlmICghaXNMaW5lKHRoaXMsIGxpbmUpKSB7IHJldHVybiBudWxsIH1cbiAgICAgIG4gPSBsaW5lO1xuICAgICAgbGluZSA9IGdldExpbmUodGhpcywgbGluZSk7XG4gICAgICBpZiAoIWxpbmUpIHsgcmV0dXJuIG51bGwgfVxuICAgIH0gZWxzZSB7XG4gICAgICBuID0gbGluZU5vKGxpbmUpO1xuICAgICAgaWYgKG4gPT0gbnVsbCkgeyByZXR1cm4gbnVsbCB9XG4gICAgfVxuICAgIHJldHVybiB7bGluZTogbiwgaGFuZGxlOiBsaW5lLCB0ZXh0OiBsaW5lLnRleHQsIGd1dHRlck1hcmtlcnM6IGxpbmUuZ3V0dGVyTWFya2VycyxcbiAgICAgICAgICAgIHRleHRDbGFzczogbGluZS50ZXh0Q2xhc3MsIGJnQ2xhc3M6IGxpbmUuYmdDbGFzcywgd3JhcENsYXNzOiBsaW5lLndyYXBDbGFzcyxcbiAgICAgICAgICAgIHdpZGdldHM6IGxpbmUud2lkZ2V0c31cbiAgfSxcblxuICBhZGRMaW5lQ2xhc3M6IGRvY01ldGhvZE9wKGZ1bmN0aW9uKGhhbmRsZSwgd2hlcmUsIGNscykge1xuICAgIHJldHVybiBjaGFuZ2VMaW5lKHRoaXMsIGhhbmRsZSwgd2hlcmUgPT0gXCJndXR0ZXJcIiA/IFwiZ3V0dGVyXCIgOiBcImNsYXNzXCIsIGZ1bmN0aW9uIChsaW5lKSB7XG4gICAgICB2YXIgcHJvcCA9IHdoZXJlID09IFwidGV4dFwiID8gXCJ0ZXh0Q2xhc3NcIlxuICAgICAgICAgICAgICAgOiB3aGVyZSA9PSBcImJhY2tncm91bmRcIiA/IFwiYmdDbGFzc1wiXG4gICAgICAgICAgICAgICA6IHdoZXJlID09IFwiZ3V0dGVyXCIgPyBcImd1dHRlckNsYXNzXCIgOiBcIndyYXBDbGFzc1wiO1xuICAgICAgaWYgKCFsaW5lW3Byb3BdKSB7IGxpbmVbcHJvcF0gPSBjbHM7IH1cbiAgICAgIGVsc2UgaWYgKGNsYXNzVGVzdChjbHMpLnRlc3QobGluZVtwcm9wXSkpIHsgcmV0dXJuIGZhbHNlIH1cbiAgICAgIGVsc2UgeyBsaW5lW3Byb3BdICs9IFwiIFwiICsgY2xzOyB9XG4gICAgICByZXR1cm4gdHJ1ZVxuICAgIH0pXG4gIH0pLFxuICByZW1vdmVMaW5lQ2xhc3M6IGRvY01ldGhvZE9wKGZ1bmN0aW9uKGhhbmRsZSwgd2hlcmUsIGNscykge1xuICAgIHJldHVybiBjaGFuZ2VMaW5lKHRoaXMsIGhhbmRsZSwgd2hlcmUgPT0gXCJndXR0ZXJcIiA/IFwiZ3V0dGVyXCIgOiBcImNsYXNzXCIsIGZ1bmN0aW9uIChsaW5lKSB7XG4gICAgICB2YXIgcHJvcCA9IHdoZXJlID09IFwidGV4dFwiID8gXCJ0ZXh0Q2xhc3NcIlxuICAgICAgICAgICAgICAgOiB3aGVyZSA9PSBcImJhY2tncm91bmRcIiA/IFwiYmdDbGFzc1wiXG4gICAgICAgICAgICAgICA6IHdoZXJlID09IFwiZ3V0dGVyXCIgPyBcImd1dHRlckNsYXNzXCIgOiBcIndyYXBDbGFzc1wiO1xuICAgICAgdmFyIGN1ciA9IGxpbmVbcHJvcF07XG4gICAgICBpZiAoIWN1cikgeyByZXR1cm4gZmFsc2UgfVxuICAgICAgZWxzZSBpZiAoY2xzID09IG51bGwpIHsgbGluZVtwcm9wXSA9IG51bGw7IH1cbiAgICAgIGVsc2Uge1xuICAgICAgICB2YXIgZm91bmQgPSBjdXIubWF0Y2goY2xhc3NUZXN0KGNscykpO1xuICAgICAgICBpZiAoIWZvdW5kKSB7IHJldHVybiBmYWxzZSB9XG4gICAgICAgIHZhciBlbmQgPSBmb3VuZC5pbmRleCArIGZvdW5kWzBdLmxlbmd0aDtcbiAgICAgICAgbGluZVtwcm9wXSA9IGN1ci5zbGljZSgwLCBmb3VuZC5pbmRleCkgKyAoIWZvdW5kLmluZGV4IHx8IGVuZCA9PSBjdXIubGVuZ3RoID8gXCJcIiA6IFwiIFwiKSArIGN1ci5zbGljZShlbmQpIHx8IG51bGw7XG4gICAgICB9XG4gICAgICByZXR1cm4gdHJ1ZVxuICAgIH0pXG4gIH0pLFxuXG4gIGFkZExpbmVXaWRnZXQ6IGRvY01ldGhvZE9wKGZ1bmN0aW9uKGhhbmRsZSwgbm9kZSwgb3B0aW9ucykge1xuICAgIHJldHVybiBhZGRMaW5lV2lkZ2V0KHRoaXMsIGhhbmRsZSwgbm9kZSwgb3B0aW9ucylcbiAgfSksXG4gIHJlbW92ZUxpbmVXaWRnZXQ6IGZ1bmN0aW9uKHdpZGdldCkgeyB3aWRnZXQuY2xlYXIoKTsgfSxcblxuICBtYXJrVGV4dDogZnVuY3Rpb24oZnJvbSwgdG8sIG9wdGlvbnMpIHtcbiAgICByZXR1cm4gbWFya1RleHQodGhpcywgY2xpcFBvcyh0aGlzLCBmcm9tKSwgY2xpcFBvcyh0aGlzLCB0byksIG9wdGlvbnMsIG9wdGlvbnMgJiYgb3B0aW9ucy50eXBlIHx8IFwicmFuZ2VcIilcbiAgfSxcbiAgc2V0Qm9va21hcms6IGZ1bmN0aW9uKHBvcywgb3B0aW9ucykge1xuICAgIHZhciByZWFsT3B0cyA9IHtyZXBsYWNlZFdpdGg6IG9wdGlvbnMgJiYgKG9wdGlvbnMubm9kZVR5cGUgPT0gbnVsbCA/IG9wdGlvbnMud2lkZ2V0IDogb3B0aW9ucyksXG4gICAgICAgICAgICAgICAgICAgIGluc2VydExlZnQ6IG9wdGlvbnMgJiYgb3B0aW9ucy5pbnNlcnRMZWZ0LFxuICAgICAgICAgICAgICAgICAgICBjbGVhcldoZW5FbXB0eTogZmFsc2UsIHNoYXJlZDogb3B0aW9ucyAmJiBvcHRpb25zLnNoYXJlZCxcbiAgICAgICAgICAgICAgICAgICAgaGFuZGxlTW91c2VFdmVudHM6IG9wdGlvbnMgJiYgb3B0aW9ucy5oYW5kbGVNb3VzZUV2ZW50c307XG4gICAgcG9zID0gY2xpcFBvcyh0aGlzLCBwb3MpO1xuICAgIHJldHVybiBtYXJrVGV4dCh0aGlzLCBwb3MsIHBvcywgcmVhbE9wdHMsIFwiYm9va21hcmtcIilcbiAgfSxcbiAgZmluZE1hcmtzQXQ6IGZ1bmN0aW9uKHBvcykge1xuICAgIHBvcyA9IGNsaXBQb3ModGhpcywgcG9zKTtcbiAgICB2YXIgbWFya2VycyA9IFtdLCBzcGFucyA9IGdldExpbmUodGhpcywgcG9zLmxpbmUpLm1hcmtlZFNwYW5zO1xuICAgIGlmIChzcGFucykgeyBmb3IgKHZhciBpID0gMDsgaSA8IHNwYW5zLmxlbmd0aDsgKytpKSB7XG4gICAgICB2YXIgc3BhbiA9IHNwYW5zW2ldO1xuICAgICAgaWYgKChzcGFuLmZyb20gPT0gbnVsbCB8fCBzcGFuLmZyb20gPD0gcG9zLmNoKSAmJlxuICAgICAgICAgIChzcGFuLnRvID09IG51bGwgfHwgc3Bhbi50byA+PSBwb3MuY2gpKVxuICAgICAgICB7IG1hcmtlcnMucHVzaChzcGFuLm1hcmtlci5wYXJlbnQgfHwgc3Bhbi5tYXJrZXIpOyB9XG4gICAgfSB9XG4gICAgcmV0dXJuIG1hcmtlcnNcbiAgfSxcbiAgZmluZE1hcmtzOiBmdW5jdGlvbihmcm9tLCB0bywgZmlsdGVyKSB7XG4gICAgZnJvbSA9IGNsaXBQb3ModGhpcywgZnJvbSk7IHRvID0gY2xpcFBvcyh0aGlzLCB0byk7XG4gICAgdmFyIGZvdW5kID0gW10sIGxpbmVObyQkMSA9IGZyb20ubGluZTtcbiAgICB0aGlzLml0ZXIoZnJvbS5saW5lLCB0by5saW5lICsgMSwgZnVuY3Rpb24gKGxpbmUpIHtcbiAgICAgIHZhciBzcGFucyA9IGxpbmUubWFya2VkU3BhbnM7XG4gICAgICBpZiAoc3BhbnMpIHsgZm9yICh2YXIgaSA9IDA7IGkgPCBzcGFucy5sZW5ndGg7IGkrKykge1xuICAgICAgICB2YXIgc3BhbiA9IHNwYW5zW2ldO1xuICAgICAgICBpZiAoIShzcGFuLnRvICE9IG51bGwgJiYgbGluZU5vJCQxID09IGZyb20ubGluZSAmJiBmcm9tLmNoID49IHNwYW4udG8gfHxcbiAgICAgICAgICAgICAgc3Bhbi5mcm9tID09IG51bGwgJiYgbGluZU5vJCQxICE9IGZyb20ubGluZSB8fFxuICAgICAgICAgICAgICBzcGFuLmZyb20gIT0gbnVsbCAmJiBsaW5lTm8kJDEgPT0gdG8ubGluZSAmJiBzcGFuLmZyb20gPj0gdG8uY2gpICYmXG4gICAgICAgICAgICAoIWZpbHRlciB8fCBmaWx0ZXIoc3Bhbi5tYXJrZXIpKSlcbiAgICAgICAgICB7IGZvdW5kLnB1c2goc3Bhbi5tYXJrZXIucGFyZW50IHx8IHNwYW4ubWFya2VyKTsgfVxuICAgICAgfSB9XG4gICAgICArK2xpbmVObyQkMTtcbiAgICB9KTtcbiAgICByZXR1cm4gZm91bmRcbiAgfSxcbiAgZ2V0QWxsTWFya3M6IGZ1bmN0aW9uKCkge1xuICAgIHZhciBtYXJrZXJzID0gW107XG4gICAgdGhpcy5pdGVyKGZ1bmN0aW9uIChsaW5lKSB7XG4gICAgICB2YXIgc3BzID0gbGluZS5tYXJrZWRTcGFucztcbiAgICAgIGlmIChzcHMpIHsgZm9yICh2YXIgaSA9IDA7IGkgPCBzcHMubGVuZ3RoOyArK2kpXG4gICAgICAgIHsgaWYgKHNwc1tpXS5mcm9tICE9IG51bGwpIHsgbWFya2Vycy5wdXNoKHNwc1tpXS5tYXJrZXIpOyB9IH0gfVxuICAgIH0pO1xuICAgIHJldHVybiBtYXJrZXJzXG4gIH0sXG5cbiAgcG9zRnJvbUluZGV4OiBmdW5jdGlvbihvZmYpIHtcbiAgICB2YXIgY2gsIGxpbmVObyQkMSA9IHRoaXMuZmlyc3QsIHNlcFNpemUgPSB0aGlzLmxpbmVTZXBhcmF0b3IoKS5sZW5ndGg7XG4gICAgdGhpcy5pdGVyKGZ1bmN0aW9uIChsaW5lKSB7XG4gICAgICB2YXIgc3ogPSBsaW5lLnRleHQubGVuZ3RoICsgc2VwU2l6ZTtcbiAgICAgIGlmIChzeiA+IG9mZikgeyBjaCA9IG9mZjsgcmV0dXJuIHRydWUgfVxuICAgICAgb2ZmIC09IHN6O1xuICAgICAgKytsaW5lTm8kJDE7XG4gICAgfSk7XG4gICAgcmV0dXJuIGNsaXBQb3ModGhpcywgUG9zKGxpbmVObyQkMSwgY2gpKVxuICB9LFxuICBpbmRleEZyb21Qb3M6IGZ1bmN0aW9uIChjb29yZHMpIHtcbiAgICBjb29yZHMgPSBjbGlwUG9zKHRoaXMsIGNvb3Jkcyk7XG4gICAgdmFyIGluZGV4ID0gY29vcmRzLmNoO1xuICAgIGlmIChjb29yZHMubGluZSA8IHRoaXMuZmlyc3QgfHwgY29vcmRzLmNoIDwgMCkgeyByZXR1cm4gMCB9XG4gICAgdmFyIHNlcFNpemUgPSB0aGlzLmxpbmVTZXBhcmF0b3IoKS5sZW5ndGg7XG4gICAgdGhpcy5pdGVyKHRoaXMuZmlyc3QsIGNvb3Jkcy5saW5lLCBmdW5jdGlvbiAobGluZSkgeyAvLyBpdGVyIGFib3J0cyB3aGVuIGNhbGxiYWNrIHJldHVybnMgYSB0cnV0aHkgdmFsdWVcbiAgICAgIGluZGV4ICs9IGxpbmUudGV4dC5sZW5ndGggKyBzZXBTaXplO1xuICAgIH0pO1xuICAgIHJldHVybiBpbmRleFxuICB9LFxuXG4gIGNvcHk6IGZ1bmN0aW9uKGNvcHlIaXN0b3J5KSB7XG4gICAgdmFyIGRvYyA9IG5ldyBEb2MoZ2V0TGluZXModGhpcywgdGhpcy5maXJzdCwgdGhpcy5maXJzdCArIHRoaXMuc2l6ZSksXG4gICAgICAgICAgICAgICAgICAgICAgdGhpcy5tb2RlT3B0aW9uLCB0aGlzLmZpcnN0LCB0aGlzLmxpbmVTZXAsIHRoaXMuZGlyZWN0aW9uKTtcbiAgICBkb2Muc2Nyb2xsVG9wID0gdGhpcy5zY3JvbGxUb3A7IGRvYy5zY3JvbGxMZWZ0ID0gdGhpcy5zY3JvbGxMZWZ0O1xuICAgIGRvYy5zZWwgPSB0aGlzLnNlbDtcbiAgICBkb2MuZXh0ZW5kID0gZmFsc2U7XG4gICAgaWYgKGNvcHlIaXN0b3J5KSB7XG4gICAgICBkb2MuaGlzdG9yeS51bmRvRGVwdGggPSB0aGlzLmhpc3RvcnkudW5kb0RlcHRoO1xuICAgICAgZG9jLnNldEhpc3RvcnkodGhpcy5nZXRIaXN0b3J5KCkpO1xuICAgIH1cbiAgICByZXR1cm4gZG9jXG4gIH0sXG5cbiAgbGlua2VkRG9jOiBmdW5jdGlvbihvcHRpb25zKSB7XG4gICAgaWYgKCFvcHRpb25zKSB7IG9wdGlvbnMgPSB7fTsgfVxuICAgIHZhciBmcm9tID0gdGhpcy5maXJzdCwgdG8gPSB0aGlzLmZpcnN0ICsgdGhpcy5zaXplO1xuICAgIGlmIChvcHRpb25zLmZyb20gIT0gbnVsbCAmJiBvcHRpb25zLmZyb20gPiBmcm9tKSB7IGZyb20gPSBvcHRpb25zLmZyb207IH1cbiAgICBpZiAob3B0aW9ucy50byAhPSBudWxsICYmIG9wdGlvbnMudG8gPCB0bykgeyB0byA9IG9wdGlvbnMudG87IH1cbiAgICB2YXIgY29weSA9IG5ldyBEb2MoZ2V0TGluZXModGhpcywgZnJvbSwgdG8pLCBvcHRpb25zLm1vZGUgfHwgdGhpcy5tb2RlT3B0aW9uLCBmcm9tLCB0aGlzLmxpbmVTZXAsIHRoaXMuZGlyZWN0aW9uKTtcbiAgICBpZiAob3B0aW9ucy5zaGFyZWRIaXN0KSB7IGNvcHkuaGlzdG9yeSA9IHRoaXMuaGlzdG9yeVxuICAgIDsgfSh0aGlzLmxpbmtlZCB8fCAodGhpcy5saW5rZWQgPSBbXSkpLnB1c2goe2RvYzogY29weSwgc2hhcmVkSGlzdDogb3B0aW9ucy5zaGFyZWRIaXN0fSk7XG4gICAgY29weS5saW5rZWQgPSBbe2RvYzogdGhpcywgaXNQYXJlbnQ6IHRydWUsIHNoYXJlZEhpc3Q6IG9wdGlvbnMuc2hhcmVkSGlzdH1dO1xuICAgIGNvcHlTaGFyZWRNYXJrZXJzKGNvcHksIGZpbmRTaGFyZWRNYXJrZXJzKHRoaXMpKTtcbiAgICByZXR1cm4gY29weVxuICB9LFxuICB1bmxpbmtEb2M6IGZ1bmN0aW9uKG90aGVyKSB7XG4gICAgdmFyIHRoaXMkMSA9IHRoaXM7XG5cbiAgICBpZiAob3RoZXIgaW5zdGFuY2VvZiBDb2RlTWlycm9yJDEpIHsgb3RoZXIgPSBvdGhlci5kb2M7IH1cbiAgICBpZiAodGhpcy5saW5rZWQpIHsgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLmxpbmtlZC5sZW5ndGg7ICsraSkge1xuICAgICAgdmFyIGxpbmsgPSB0aGlzJDEubGlua2VkW2ldO1xuICAgICAgaWYgKGxpbmsuZG9jICE9IG90aGVyKSB7IGNvbnRpbnVlIH1cbiAgICAgIHRoaXMkMS5saW5rZWQuc3BsaWNlKGksIDEpO1xuICAgICAgb3RoZXIudW5saW5rRG9jKHRoaXMkMSk7XG4gICAgICBkZXRhY2hTaGFyZWRNYXJrZXJzKGZpbmRTaGFyZWRNYXJrZXJzKHRoaXMkMSkpO1xuICAgICAgYnJlYWtcbiAgICB9IH1cbiAgICAvLyBJZiB0aGUgaGlzdG9yaWVzIHdlcmUgc2hhcmVkLCBzcGxpdCB0aGVtIGFnYWluXG4gICAgaWYgKG90aGVyLmhpc3RvcnkgPT0gdGhpcy5oaXN0b3J5KSB7XG4gICAgICB2YXIgc3BsaXRJZHMgPSBbb3RoZXIuaWRdO1xuICAgICAgbGlua2VkRG9jcyhvdGhlciwgZnVuY3Rpb24gKGRvYykgeyByZXR1cm4gc3BsaXRJZHMucHVzaChkb2MuaWQpOyB9LCB0cnVlKTtcbiAgICAgIG90aGVyLmhpc3RvcnkgPSBuZXcgSGlzdG9yeShudWxsKTtcbiAgICAgIG90aGVyLmhpc3RvcnkuZG9uZSA9IGNvcHlIaXN0b3J5QXJyYXkodGhpcy5oaXN0b3J5LmRvbmUsIHNwbGl0SWRzKTtcbiAgICAgIG90aGVyLmhpc3RvcnkudW5kb25lID0gY29weUhpc3RvcnlBcnJheSh0aGlzLmhpc3RvcnkudW5kb25lLCBzcGxpdElkcyk7XG4gICAgfVxuICB9LFxuICBpdGVyTGlua2VkRG9jczogZnVuY3Rpb24oZikge2xpbmtlZERvY3ModGhpcywgZik7fSxcblxuICBnZXRNb2RlOiBmdW5jdGlvbigpIHtyZXR1cm4gdGhpcy5tb2RlfSxcbiAgZ2V0RWRpdG9yOiBmdW5jdGlvbigpIHtyZXR1cm4gdGhpcy5jbX0sXG5cbiAgc3BsaXRMaW5lczogZnVuY3Rpb24oc3RyKSB7XG4gICAgaWYgKHRoaXMubGluZVNlcCkgeyByZXR1cm4gc3RyLnNwbGl0KHRoaXMubGluZVNlcCkgfVxuICAgIHJldHVybiBzcGxpdExpbmVzQXV0byhzdHIpXG4gIH0sXG4gIGxpbmVTZXBhcmF0b3I6IGZ1bmN0aW9uKCkgeyByZXR1cm4gdGhpcy5saW5lU2VwIHx8IFwiXFxuXCIgfSxcblxuICBzZXREaXJlY3Rpb246IGRvY01ldGhvZE9wKGZ1bmN0aW9uIChkaXIpIHtcbiAgICBpZiAoZGlyICE9IFwicnRsXCIpIHsgZGlyID0gXCJsdHJcIjsgfVxuICAgIGlmIChkaXIgPT0gdGhpcy5kaXJlY3Rpb24pIHsgcmV0dXJuIH1cbiAgICB0aGlzLmRpcmVjdGlvbiA9IGRpcjtcbiAgICB0aGlzLml0ZXIoZnVuY3Rpb24gKGxpbmUpIHsgcmV0dXJuIGxpbmUub3JkZXIgPSBudWxsOyB9KTtcbiAgICBpZiAodGhpcy5jbSkgeyBkaXJlY3Rpb25DaGFuZ2VkKHRoaXMuY20pOyB9XG4gIH0pXG59KTtcblxuLy8gUHVibGljIGFsaWFzLlxuRG9jLnByb3RvdHlwZS5lYWNoTGluZSA9IERvYy5wcm90b3R5cGUuaXRlcjtcblxuLy8gS2x1ZGdlIHRvIHdvcmsgYXJvdW5kIHN0cmFuZ2UgSUUgYmVoYXZpb3Igd2hlcmUgaXQnbGwgc29tZXRpbWVzXG4vLyByZS1maXJlIGEgc2VyaWVzIG9mIGRyYWctcmVsYXRlZCBldmVudHMgcmlnaHQgYWZ0ZXIgdGhlIGRyb3AgKCMxNTUxKVxudmFyIGxhc3REcm9wID0gMDtcblxuZnVuY3Rpb24gb25Ecm9wKGUpIHtcbiAgdmFyIGNtID0gdGhpcztcbiAgY2xlYXJEcmFnQ3Vyc29yKGNtKTtcbiAgaWYgKHNpZ25hbERPTUV2ZW50KGNtLCBlKSB8fCBldmVudEluV2lkZ2V0KGNtLmRpc3BsYXksIGUpKVxuICAgIHsgcmV0dXJuIH1cbiAgZV9wcmV2ZW50RGVmYXVsdChlKTtcbiAgaWYgKGllKSB7IGxhc3REcm9wID0gK25ldyBEYXRlOyB9XG4gIHZhciBwb3MgPSBwb3NGcm9tTW91c2UoY20sIGUsIHRydWUpLCBmaWxlcyA9IGUuZGF0YVRyYW5zZmVyLmZpbGVzO1xuICBpZiAoIXBvcyB8fCBjbS5pc1JlYWRPbmx5KCkpIHsgcmV0dXJuIH1cbiAgLy8gTWlnaHQgYmUgYSBmaWxlIGRyb3AsIGluIHdoaWNoIGNhc2Ugd2Ugc2ltcGx5IGV4dHJhY3QgdGhlIHRleHRcbiAgLy8gYW5kIGluc2VydCBpdC5cbiAgaWYgKGZpbGVzICYmIGZpbGVzLmxlbmd0aCAmJiB3aW5kb3cuRmlsZVJlYWRlciAmJiB3aW5kb3cuRmlsZSkge1xuICAgIHZhciBuID0gZmlsZXMubGVuZ3RoLCB0ZXh0ID0gQXJyYXkobiksIHJlYWQgPSAwO1xuICAgIHZhciBsb2FkRmlsZSA9IGZ1bmN0aW9uIChmaWxlLCBpKSB7XG4gICAgICBpZiAoY20ub3B0aW9ucy5hbGxvd0Ryb3BGaWxlVHlwZXMgJiZcbiAgICAgICAgICBpbmRleE9mKGNtLm9wdGlvbnMuYWxsb3dEcm9wRmlsZVR5cGVzLCBmaWxlLnR5cGUpID09IC0xKVxuICAgICAgICB7IHJldHVybiB9XG5cbiAgICAgIHZhciByZWFkZXIgPSBuZXcgRmlsZVJlYWRlcjtcbiAgICAgIHJlYWRlci5vbmxvYWQgPSBvcGVyYXRpb24oY20sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGNvbnRlbnQgPSByZWFkZXIucmVzdWx0O1xuICAgICAgICBpZiAoL1tcXHgwMC1cXHgwOFxceDBlLVxceDFmXXsyfS8udGVzdChjb250ZW50KSkgeyBjb250ZW50ID0gXCJcIjsgfVxuICAgICAgICB0ZXh0W2ldID0gY29udGVudDtcbiAgICAgICAgaWYgKCsrcmVhZCA9PSBuKSB7XG4gICAgICAgICAgcG9zID0gY2xpcFBvcyhjbS5kb2MsIHBvcyk7XG4gICAgICAgICAgdmFyIGNoYW5nZSA9IHtmcm9tOiBwb3MsIHRvOiBwb3MsXG4gICAgICAgICAgICAgICAgICAgICAgICB0ZXh0OiBjbS5kb2Muc3BsaXRMaW5lcyh0ZXh0LmpvaW4oY20uZG9jLmxpbmVTZXBhcmF0b3IoKSkpLFxuICAgICAgICAgICAgICAgICAgICAgICAgb3JpZ2luOiBcInBhc3RlXCJ9O1xuICAgICAgICAgIG1ha2VDaGFuZ2UoY20uZG9jLCBjaGFuZ2UpO1xuICAgICAgICAgIHNldFNlbGVjdGlvblJlcGxhY2VIaXN0b3J5KGNtLmRvYywgc2ltcGxlU2VsZWN0aW9uKHBvcywgY2hhbmdlRW5kKGNoYW5nZSkpKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICByZWFkZXIucmVhZEFzVGV4dChmaWxlKTtcbiAgICB9O1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbjsgKytpKSB7IGxvYWRGaWxlKGZpbGVzW2ldLCBpKTsgfVxuICB9IGVsc2UgeyAvLyBOb3JtYWwgZHJvcFxuICAgIC8vIERvbid0IGRvIGEgcmVwbGFjZSBpZiB0aGUgZHJvcCBoYXBwZW5lZCBpbnNpZGUgb2YgdGhlIHNlbGVjdGVkIHRleHQuXG4gICAgaWYgKGNtLnN0YXRlLmRyYWdnaW5nVGV4dCAmJiBjbS5kb2Muc2VsLmNvbnRhaW5zKHBvcykgPiAtMSkge1xuICAgICAgY20uc3RhdGUuZHJhZ2dpbmdUZXh0KGUpO1xuICAgICAgLy8gRW5zdXJlIHRoZSBlZGl0b3IgaXMgcmUtZm9jdXNlZFxuICAgICAgc2V0VGltZW91dChmdW5jdGlvbiAoKSB7IHJldHVybiBjbS5kaXNwbGF5LmlucHV0LmZvY3VzKCk7IH0sIDIwKTtcbiAgICAgIHJldHVyblxuICAgIH1cbiAgICB0cnkge1xuICAgICAgdmFyIHRleHQkMSA9IGUuZGF0YVRyYW5zZmVyLmdldERhdGEoXCJUZXh0XCIpO1xuICAgICAgaWYgKHRleHQkMSkge1xuICAgICAgICB2YXIgc2VsZWN0ZWQ7XG4gICAgICAgIGlmIChjbS5zdGF0ZS5kcmFnZ2luZ1RleHQgJiYgIWNtLnN0YXRlLmRyYWdnaW5nVGV4dC5jb3B5KVxuICAgICAgICAgIHsgc2VsZWN0ZWQgPSBjbS5saXN0U2VsZWN0aW9ucygpOyB9XG4gICAgICAgIHNldFNlbGVjdGlvbk5vVW5kbyhjbS5kb2MsIHNpbXBsZVNlbGVjdGlvbihwb3MsIHBvcykpO1xuICAgICAgICBpZiAoc2VsZWN0ZWQpIHsgZm9yICh2YXIgaSQxID0gMDsgaSQxIDwgc2VsZWN0ZWQubGVuZ3RoOyArK2kkMSlcbiAgICAgICAgICB7IHJlcGxhY2VSYW5nZShjbS5kb2MsIFwiXCIsIHNlbGVjdGVkW2kkMV0uYW5jaG9yLCBzZWxlY3RlZFtpJDFdLmhlYWQsIFwiZHJhZ1wiKTsgfSB9XG4gICAgICAgIGNtLnJlcGxhY2VTZWxlY3Rpb24odGV4dCQxLCBcImFyb3VuZFwiLCBcInBhc3RlXCIpO1xuICAgICAgICBjbS5kaXNwbGF5LmlucHV0LmZvY3VzKCk7XG4gICAgICB9XG4gICAgfVxuICAgIGNhdGNoKGUpe31cbiAgfVxufVxuXG5mdW5jdGlvbiBvbkRyYWdTdGFydChjbSwgZSkge1xuICBpZiAoaWUgJiYgKCFjbS5zdGF0ZS5kcmFnZ2luZ1RleHQgfHwgK25ldyBEYXRlIC0gbGFzdERyb3AgPCAxMDApKSB7IGVfc3RvcChlKTsgcmV0dXJuIH1cbiAgaWYgKHNpZ25hbERPTUV2ZW50KGNtLCBlKSB8fCBldmVudEluV2lkZ2V0KGNtLmRpc3BsYXksIGUpKSB7IHJldHVybiB9XG5cbiAgZS5kYXRhVHJhbnNmZXIuc2V0RGF0YShcIlRleHRcIiwgY20uZ2V0U2VsZWN0aW9uKCkpO1xuICBlLmRhdGFUcmFuc2Zlci5lZmZlY3RBbGxvd2VkID0gXCJjb3B5TW92ZVwiO1xuXG4gIC8vIFVzZSBkdW1teSBpbWFnZSBpbnN0ZWFkIG9mIGRlZmF1bHQgYnJvd3NlcnMgaW1hZ2UuXG4gIC8vIFJlY2VudCBTYWZhcmkgKH42LjAuMikgaGF2ZSBhIHRlbmRlbmN5IHRvIHNlZ2ZhdWx0IHdoZW4gdGhpcyBoYXBwZW5zLCBzbyB3ZSBkb24ndCBkbyBpdCB0aGVyZS5cbiAgaWYgKGUuZGF0YVRyYW5zZmVyLnNldERyYWdJbWFnZSAmJiAhc2FmYXJpKSB7XG4gICAgdmFyIGltZyA9IGVsdChcImltZ1wiLCBudWxsLCBudWxsLCBcInBvc2l0aW9uOiBmaXhlZDsgbGVmdDogMDsgdG9wOiAwO1wiKTtcbiAgICBpbWcuc3JjID0gXCJkYXRhOmltYWdlL2dpZjtiYXNlNjQsUjBsR09EbGhBUUFCQUFBQUFDSDVCQUVLQUFFQUxBQUFBQUFCQUFFQUFBSUNUQUVBT3c9PVwiO1xuICAgIGlmIChwcmVzdG8pIHtcbiAgICAgIGltZy53aWR0aCA9IGltZy5oZWlnaHQgPSAxO1xuICAgICAgY20uZGlzcGxheS53cmFwcGVyLmFwcGVuZENoaWxkKGltZyk7XG4gICAgICAvLyBGb3JjZSBhIHJlbGF5b3V0LCBvciBPcGVyYSB3b24ndCB1c2Ugb3VyIGltYWdlIGZvciBzb21lIG9ic2N1cmUgcmVhc29uXG4gICAgICBpbWcuX3RvcCA9IGltZy5vZmZzZXRUb3A7XG4gICAgfVxuICAgIGUuZGF0YVRyYW5zZmVyLnNldERyYWdJbWFnZShpbWcsIDAsIDApO1xuICAgIGlmIChwcmVzdG8pIHsgaW1nLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQoaW1nKTsgfVxuICB9XG59XG5cbmZ1bmN0aW9uIG9uRHJhZ092ZXIoY20sIGUpIHtcbiAgdmFyIHBvcyA9IHBvc0Zyb21Nb3VzZShjbSwgZSk7XG4gIGlmICghcG9zKSB7IHJldHVybiB9XG4gIHZhciBmcmFnID0gZG9jdW1lbnQuY3JlYXRlRG9jdW1lbnRGcmFnbWVudCgpO1xuICBkcmF3U2VsZWN0aW9uQ3Vyc29yKGNtLCBwb3MsIGZyYWcpO1xuICBpZiAoIWNtLmRpc3BsYXkuZHJhZ0N1cnNvcikge1xuICAgIGNtLmRpc3BsYXkuZHJhZ0N1cnNvciA9IGVsdChcImRpdlwiLCBudWxsLCBcIkNvZGVNaXJyb3ItY3Vyc29ycyBDb2RlTWlycm9yLWRyYWdjdXJzb3JzXCIpO1xuICAgIGNtLmRpc3BsYXkubGluZVNwYWNlLmluc2VydEJlZm9yZShjbS5kaXNwbGF5LmRyYWdDdXJzb3IsIGNtLmRpc3BsYXkuY3Vyc29yRGl2KTtcbiAgfVxuICByZW1vdmVDaGlsZHJlbkFuZEFkZChjbS5kaXNwbGF5LmRyYWdDdXJzb3IsIGZyYWcpO1xufVxuXG5mdW5jdGlvbiBjbGVhckRyYWdDdXJzb3IoY20pIHtcbiAgaWYgKGNtLmRpc3BsYXkuZHJhZ0N1cnNvcikge1xuICAgIGNtLmRpc3BsYXkubGluZVNwYWNlLnJlbW92ZUNoaWxkKGNtLmRpc3BsYXkuZHJhZ0N1cnNvcik7XG4gICAgY20uZGlzcGxheS5kcmFnQ3Vyc29yID0gbnVsbDtcbiAgfVxufVxuXG4vLyBUaGVzZSBtdXN0IGJlIGhhbmRsZWQgY2FyZWZ1bGx5LCBiZWNhdXNlIG5haXZlbHkgcmVnaXN0ZXJpbmcgYVxuLy8gaGFuZGxlciBmb3IgZWFjaCBlZGl0b3Igd2lsbCBjYXVzZSB0aGUgZWRpdG9ycyB0byBuZXZlciBiZVxuLy8gZ2FyYmFnZSBjb2xsZWN0ZWQuXG5cbmZ1bmN0aW9uIGZvckVhY2hDb2RlTWlycm9yKGYpIHtcbiAgaWYgKCFkb2N1bWVudC5nZXRFbGVtZW50c0J5Q2xhc3NOYW1lKSB7IHJldHVybiB9XG4gIHZhciBieUNsYXNzID0gZG9jdW1lbnQuZ2V0RWxlbWVudHNCeUNsYXNzTmFtZShcIkNvZGVNaXJyb3JcIik7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgYnlDbGFzcy5sZW5ndGg7IGkrKykge1xuICAgIHZhciBjbSA9IGJ5Q2xhc3NbaV0uQ29kZU1pcnJvcjtcbiAgICBpZiAoY20pIHsgZihjbSk7IH1cbiAgfVxufVxuXG52YXIgZ2xvYmFsc1JlZ2lzdGVyZWQgPSBmYWxzZTtcbmZ1bmN0aW9uIGVuc3VyZUdsb2JhbEhhbmRsZXJzKCkge1xuICBpZiAoZ2xvYmFsc1JlZ2lzdGVyZWQpIHsgcmV0dXJuIH1cbiAgcmVnaXN0ZXJHbG9iYWxIYW5kbGVycygpO1xuICBnbG9iYWxzUmVnaXN0ZXJlZCA9IHRydWU7XG59XG5mdW5jdGlvbiByZWdpc3Rlckdsb2JhbEhhbmRsZXJzKCkge1xuICAvLyBXaGVuIHRoZSB3aW5kb3cgcmVzaXplcywgd2UgbmVlZCB0byByZWZyZXNoIGFjdGl2ZSBlZGl0b3JzLlxuICB2YXIgcmVzaXplVGltZXI7XG4gIG9uKHdpbmRvdywgXCJyZXNpemVcIiwgZnVuY3Rpb24gKCkge1xuICAgIGlmIChyZXNpemVUaW1lciA9PSBudWxsKSB7IHJlc2l6ZVRpbWVyID0gc2V0VGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICByZXNpemVUaW1lciA9IG51bGw7XG4gICAgICBmb3JFYWNoQ29kZU1pcnJvcihvblJlc2l6ZSk7XG4gICAgfSwgMTAwKTsgfVxuICB9KTtcbiAgLy8gV2hlbiB0aGUgd2luZG93IGxvc2VzIGZvY3VzLCB3ZSB3YW50IHRvIHNob3cgdGhlIGVkaXRvciBhcyBibHVycmVkXG4gIG9uKHdpbmRvdywgXCJibHVyXCIsIGZ1bmN0aW9uICgpIHsgcmV0dXJuIGZvckVhY2hDb2RlTWlycm9yKG9uQmx1cik7IH0pO1xufVxuLy8gQ2FsbGVkIHdoZW4gdGhlIHdpbmRvdyByZXNpemVzXG5mdW5jdGlvbiBvblJlc2l6ZShjbSkge1xuICB2YXIgZCA9IGNtLmRpc3BsYXk7XG4gIC8vIE1pZ2h0IGJlIGEgdGV4dCBzY2FsaW5nIG9wZXJhdGlvbiwgY2xlYXIgc2l6ZSBjYWNoZXMuXG4gIGQuY2FjaGVkQ2hhcldpZHRoID0gZC5jYWNoZWRUZXh0SGVpZ2h0ID0gZC5jYWNoZWRQYWRkaW5nSCA9IG51bGw7XG4gIGQuc2Nyb2xsYmFyc0NsaXBwZWQgPSBmYWxzZTtcbiAgY20uc2V0U2l6ZSgpO1xufVxuXG52YXIga2V5TmFtZXMgPSB7XG4gIDM6IFwiUGF1c2VcIiwgODogXCJCYWNrc3BhY2VcIiwgOTogXCJUYWJcIiwgMTM6IFwiRW50ZXJcIiwgMTY6IFwiU2hpZnRcIiwgMTc6IFwiQ3RybFwiLCAxODogXCJBbHRcIixcbiAgMTk6IFwiUGF1c2VcIiwgMjA6IFwiQ2Fwc0xvY2tcIiwgMjc6IFwiRXNjXCIsIDMyOiBcIlNwYWNlXCIsIDMzOiBcIlBhZ2VVcFwiLCAzNDogXCJQYWdlRG93blwiLCAzNTogXCJFbmRcIixcbiAgMzY6IFwiSG9tZVwiLCAzNzogXCJMZWZ0XCIsIDM4OiBcIlVwXCIsIDM5OiBcIlJpZ2h0XCIsIDQwOiBcIkRvd25cIiwgNDQ6IFwiUHJpbnRTY3JuXCIsIDQ1OiBcIkluc2VydFwiLFxuICA0NjogXCJEZWxldGVcIiwgNTk6IFwiO1wiLCA2MTogXCI9XCIsIDkxOiBcIk1vZFwiLCA5MjogXCJNb2RcIiwgOTM6IFwiTW9kXCIsXG4gIDEwNjogXCIqXCIsIDEwNzogXCI9XCIsIDEwOTogXCItXCIsIDExMDogXCIuXCIsIDExMTogXCIvXCIsIDEyNzogXCJEZWxldGVcIiwgMTQ1OiBcIlNjcm9sbExvY2tcIixcbiAgMTczOiBcIi1cIiwgMTg2OiBcIjtcIiwgMTg3OiBcIj1cIiwgMTg4OiBcIixcIiwgMTg5OiBcIi1cIiwgMTkwOiBcIi5cIiwgMTkxOiBcIi9cIiwgMTkyOiBcImBcIiwgMjE5OiBcIltcIiwgMjIwOiBcIlxcXFxcIixcbiAgMjIxOiBcIl1cIiwgMjIyOiBcIidcIiwgNjMyMzI6IFwiVXBcIiwgNjMyMzM6IFwiRG93blwiLCA2MzIzNDogXCJMZWZ0XCIsIDYzMjM1OiBcIlJpZ2h0XCIsIDYzMjcyOiBcIkRlbGV0ZVwiLFxuICA2MzI3MzogXCJIb21lXCIsIDYzMjc1OiBcIkVuZFwiLCA2MzI3NjogXCJQYWdlVXBcIiwgNjMyNzc6IFwiUGFnZURvd25cIiwgNjMzMDI6IFwiSW5zZXJ0XCJcbn07XG5cbi8vIE51bWJlciBrZXlzXG5mb3IgKHZhciBpID0gMDsgaSA8IDEwOyBpKyspIHsga2V5TmFtZXNbaSArIDQ4XSA9IGtleU5hbWVzW2kgKyA5Nl0gPSBTdHJpbmcoaSk7IH1cbi8vIEFscGhhYmV0aWMga2V5c1xuZm9yICh2YXIgaSQxID0gNjU7IGkkMSA8PSA5MDsgaSQxKyspIHsga2V5TmFtZXNbaSQxXSA9IFN0cmluZy5mcm9tQ2hhckNvZGUoaSQxKTsgfVxuLy8gRnVuY3Rpb24ga2V5c1xuZm9yICh2YXIgaSQyID0gMTsgaSQyIDw9IDEyOyBpJDIrKykgeyBrZXlOYW1lc1tpJDIgKyAxMTFdID0ga2V5TmFtZXNbaSQyICsgNjMyMzVdID0gXCJGXCIgKyBpJDI7IH1cblxudmFyIGtleU1hcCA9IHt9O1xuXG5rZXlNYXAuYmFzaWMgPSB7XG4gIFwiTGVmdFwiOiBcImdvQ2hhckxlZnRcIiwgXCJSaWdodFwiOiBcImdvQ2hhclJpZ2h0XCIsIFwiVXBcIjogXCJnb0xpbmVVcFwiLCBcIkRvd25cIjogXCJnb0xpbmVEb3duXCIsXG4gIFwiRW5kXCI6IFwiZ29MaW5lRW5kXCIsIFwiSG9tZVwiOiBcImdvTGluZVN0YXJ0U21hcnRcIiwgXCJQYWdlVXBcIjogXCJnb1BhZ2VVcFwiLCBcIlBhZ2VEb3duXCI6IFwiZ29QYWdlRG93blwiLFxuICBcIkRlbGV0ZVwiOiBcImRlbENoYXJBZnRlclwiLCBcIkJhY2tzcGFjZVwiOiBcImRlbENoYXJCZWZvcmVcIiwgXCJTaGlmdC1CYWNrc3BhY2VcIjogXCJkZWxDaGFyQmVmb3JlXCIsXG4gIFwiVGFiXCI6IFwiZGVmYXVsdFRhYlwiLCBcIlNoaWZ0LVRhYlwiOiBcImluZGVudEF1dG9cIixcbiAgXCJFbnRlclwiOiBcIm5ld2xpbmVBbmRJbmRlbnRcIiwgXCJJbnNlcnRcIjogXCJ0b2dnbGVPdmVyd3JpdGVcIixcbiAgXCJFc2NcIjogXCJzaW5nbGVTZWxlY3Rpb25cIlxufTtcbi8vIE5vdGUgdGhhdCB0aGUgc2F2ZSBhbmQgZmluZC1yZWxhdGVkIGNvbW1hbmRzIGFyZW4ndCBkZWZpbmVkIGJ5XG4vLyBkZWZhdWx0LiBVc2VyIGNvZGUgb3IgYWRkb25zIGNhbiBkZWZpbmUgdGhlbS4gVW5rbm93biBjb21tYW5kc1xuLy8gYXJlIHNpbXBseSBpZ25vcmVkLlxua2V5TWFwLnBjRGVmYXVsdCA9IHtcbiAgXCJDdHJsLUFcIjogXCJzZWxlY3RBbGxcIiwgXCJDdHJsLURcIjogXCJkZWxldGVMaW5lXCIsIFwiQ3RybC1aXCI6IFwidW5kb1wiLCBcIlNoaWZ0LUN0cmwtWlwiOiBcInJlZG9cIiwgXCJDdHJsLVlcIjogXCJyZWRvXCIsXG4gIFwiQ3RybC1Ib21lXCI6IFwiZ29Eb2NTdGFydFwiLCBcIkN0cmwtRW5kXCI6IFwiZ29Eb2NFbmRcIiwgXCJDdHJsLVVwXCI6IFwiZ29MaW5lVXBcIiwgXCJDdHJsLURvd25cIjogXCJnb0xpbmVEb3duXCIsXG4gIFwiQ3RybC1MZWZ0XCI6IFwiZ29Hcm91cExlZnRcIiwgXCJDdHJsLVJpZ2h0XCI6IFwiZ29Hcm91cFJpZ2h0XCIsIFwiQWx0LUxlZnRcIjogXCJnb0xpbmVTdGFydFwiLCBcIkFsdC1SaWdodFwiOiBcImdvTGluZUVuZFwiLFxuICBcIkN0cmwtQmFja3NwYWNlXCI6IFwiZGVsR3JvdXBCZWZvcmVcIiwgXCJDdHJsLURlbGV0ZVwiOiBcImRlbEdyb3VwQWZ0ZXJcIiwgXCJDdHJsLVNcIjogXCJzYXZlXCIsIFwiQ3RybC1GXCI6IFwiZmluZFwiLFxuICBcIkN0cmwtR1wiOiBcImZpbmROZXh0XCIsIFwiU2hpZnQtQ3RybC1HXCI6IFwiZmluZFByZXZcIiwgXCJTaGlmdC1DdHJsLUZcIjogXCJyZXBsYWNlXCIsIFwiU2hpZnQtQ3RybC1SXCI6IFwicmVwbGFjZUFsbFwiLFxuICBcIkN0cmwtW1wiOiBcImluZGVudExlc3NcIiwgXCJDdHJsLV1cIjogXCJpbmRlbnRNb3JlXCIsXG4gIFwiQ3RybC1VXCI6IFwidW5kb1NlbGVjdGlvblwiLCBcIlNoaWZ0LUN0cmwtVVwiOiBcInJlZG9TZWxlY3Rpb25cIiwgXCJBbHQtVVwiOiBcInJlZG9TZWxlY3Rpb25cIixcbiAgZmFsbHRocm91Z2g6IFwiYmFzaWNcIlxufTtcbi8vIFZlcnkgYmFzaWMgcmVhZGxpbmUvZW1hY3Mtc3R5bGUgYmluZGluZ3MsIHdoaWNoIGFyZSBzdGFuZGFyZCBvbiBNYWMuXG5rZXlNYXAuZW1hY3N5ID0ge1xuICBcIkN0cmwtRlwiOiBcImdvQ2hhclJpZ2h0XCIsIFwiQ3RybC1CXCI6IFwiZ29DaGFyTGVmdFwiLCBcIkN0cmwtUFwiOiBcImdvTGluZVVwXCIsIFwiQ3RybC1OXCI6IFwiZ29MaW5lRG93blwiLFxuICBcIkFsdC1GXCI6IFwiZ29Xb3JkUmlnaHRcIiwgXCJBbHQtQlwiOiBcImdvV29yZExlZnRcIiwgXCJDdHJsLUFcIjogXCJnb0xpbmVTdGFydFwiLCBcIkN0cmwtRVwiOiBcImdvTGluZUVuZFwiLFxuICBcIkN0cmwtVlwiOiBcImdvUGFnZURvd25cIiwgXCJTaGlmdC1DdHJsLVZcIjogXCJnb1BhZ2VVcFwiLCBcIkN0cmwtRFwiOiBcImRlbENoYXJBZnRlclwiLCBcIkN0cmwtSFwiOiBcImRlbENoYXJCZWZvcmVcIixcbiAgXCJBbHQtRFwiOiBcImRlbFdvcmRBZnRlclwiLCBcIkFsdC1CYWNrc3BhY2VcIjogXCJkZWxXb3JkQmVmb3JlXCIsIFwiQ3RybC1LXCI6IFwia2lsbExpbmVcIiwgXCJDdHJsLVRcIjogXCJ0cmFuc3Bvc2VDaGFyc1wiLFxuICBcIkN0cmwtT1wiOiBcIm9wZW5MaW5lXCJcbn07XG5rZXlNYXAubWFjRGVmYXVsdCA9IHtcbiAgXCJDbWQtQVwiOiBcInNlbGVjdEFsbFwiLCBcIkNtZC1EXCI6IFwiZGVsZXRlTGluZVwiLCBcIkNtZC1aXCI6IFwidW5kb1wiLCBcIlNoaWZ0LUNtZC1aXCI6IFwicmVkb1wiLCBcIkNtZC1ZXCI6IFwicmVkb1wiLFxuICBcIkNtZC1Ib21lXCI6IFwiZ29Eb2NTdGFydFwiLCBcIkNtZC1VcFwiOiBcImdvRG9jU3RhcnRcIiwgXCJDbWQtRW5kXCI6IFwiZ29Eb2NFbmRcIiwgXCJDbWQtRG93blwiOiBcImdvRG9jRW5kXCIsIFwiQWx0LUxlZnRcIjogXCJnb0dyb3VwTGVmdFwiLFxuICBcIkFsdC1SaWdodFwiOiBcImdvR3JvdXBSaWdodFwiLCBcIkNtZC1MZWZ0XCI6IFwiZ29MaW5lTGVmdFwiLCBcIkNtZC1SaWdodFwiOiBcImdvTGluZVJpZ2h0XCIsIFwiQWx0LUJhY2tzcGFjZVwiOiBcImRlbEdyb3VwQmVmb3JlXCIsXG4gIFwiQ3RybC1BbHQtQmFja3NwYWNlXCI6IFwiZGVsR3JvdXBBZnRlclwiLCBcIkFsdC1EZWxldGVcIjogXCJkZWxHcm91cEFmdGVyXCIsIFwiQ21kLVNcIjogXCJzYXZlXCIsIFwiQ21kLUZcIjogXCJmaW5kXCIsXG4gIFwiQ21kLUdcIjogXCJmaW5kTmV4dFwiLCBcIlNoaWZ0LUNtZC1HXCI6IFwiZmluZFByZXZcIiwgXCJDbWQtQWx0LUZcIjogXCJyZXBsYWNlXCIsIFwiU2hpZnQtQ21kLUFsdC1GXCI6IFwicmVwbGFjZUFsbFwiLFxuICBcIkNtZC1bXCI6IFwiaW5kZW50TGVzc1wiLCBcIkNtZC1dXCI6IFwiaW5kZW50TW9yZVwiLCBcIkNtZC1CYWNrc3BhY2VcIjogXCJkZWxXcmFwcGVkTGluZUxlZnRcIiwgXCJDbWQtRGVsZXRlXCI6IFwiZGVsV3JhcHBlZExpbmVSaWdodFwiLFxuICBcIkNtZC1VXCI6IFwidW5kb1NlbGVjdGlvblwiLCBcIlNoaWZ0LUNtZC1VXCI6IFwicmVkb1NlbGVjdGlvblwiLCBcIkN0cmwtVXBcIjogXCJnb0RvY1N0YXJ0XCIsIFwiQ3RybC1Eb3duXCI6IFwiZ29Eb2NFbmRcIixcbiAgZmFsbHRocm91Z2g6IFtcImJhc2ljXCIsIFwiZW1hY3N5XCJdXG59O1xua2V5TWFwW1wiZGVmYXVsdFwiXSA9IG1hYyA/IGtleU1hcC5tYWNEZWZhdWx0IDoga2V5TWFwLnBjRGVmYXVsdDtcblxuLy8gS0VZTUFQIERJU1BBVENIXG5cbmZ1bmN0aW9uIG5vcm1hbGl6ZUtleU5hbWUobmFtZSkge1xuICB2YXIgcGFydHMgPSBuYW1lLnNwbGl0KC8tKD8hJCkvKTtcbiAgbmFtZSA9IHBhcnRzW3BhcnRzLmxlbmd0aCAtIDFdO1xuICB2YXIgYWx0LCBjdHJsLCBzaGlmdCwgY21kO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IHBhcnRzLmxlbmd0aCAtIDE7IGkrKykge1xuICAgIHZhciBtb2QgPSBwYXJ0c1tpXTtcbiAgICBpZiAoL14oY21kfG1ldGF8bSkkL2kudGVzdChtb2QpKSB7IGNtZCA9IHRydWU7IH1cbiAgICBlbHNlIGlmICgvXmEobHQpPyQvaS50ZXN0KG1vZCkpIHsgYWx0ID0gdHJ1ZTsgfVxuICAgIGVsc2UgaWYgKC9eKGN8Y3RybHxjb250cm9sKSQvaS50ZXN0KG1vZCkpIHsgY3RybCA9IHRydWU7IH1cbiAgICBlbHNlIGlmICgvXnMoaGlmdCk/JC9pLnRlc3QobW9kKSkgeyBzaGlmdCA9IHRydWU7IH1cbiAgICBlbHNlIHsgdGhyb3cgbmV3IEVycm9yKFwiVW5yZWNvZ25pemVkIG1vZGlmaWVyIG5hbWU6IFwiICsgbW9kKSB9XG4gIH1cbiAgaWYgKGFsdCkgeyBuYW1lID0gXCJBbHQtXCIgKyBuYW1lOyB9XG4gIGlmIChjdHJsKSB7IG5hbWUgPSBcIkN0cmwtXCIgKyBuYW1lOyB9XG4gIGlmIChjbWQpIHsgbmFtZSA9IFwiQ21kLVwiICsgbmFtZTsgfVxuICBpZiAoc2hpZnQpIHsgbmFtZSA9IFwiU2hpZnQtXCIgKyBuYW1lOyB9XG4gIHJldHVybiBuYW1lXG59XG5cbi8vIFRoaXMgaXMgYSBrbHVkZ2UgdG8ga2VlcCBrZXltYXBzIG1vc3RseSB3b3JraW5nIGFzIHJhdyBvYmplY3RzXG4vLyAoYmFja3dhcmRzIGNvbXBhdGliaWxpdHkpIHdoaWxlIGF0IHRoZSBzYW1lIHRpbWUgc3VwcG9ydCBmZWF0dXJlc1xuLy8gbGlrZSBub3JtYWxpemF0aW9uIGFuZCBtdWx0aS1zdHJva2Uga2V5IGJpbmRpbmdzLiBJdCBjb21waWxlcyBhXG4vLyBuZXcgbm9ybWFsaXplZCBrZXltYXAsIGFuZCB0aGVuIHVwZGF0ZXMgdGhlIG9sZCBvYmplY3QgdG8gcmVmbGVjdFxuLy8gdGhpcy5cbmZ1bmN0aW9uIG5vcm1hbGl6ZUtleU1hcChrZXltYXApIHtcbiAgdmFyIGNvcHkgPSB7fTtcbiAgZm9yICh2YXIga2V5bmFtZSBpbiBrZXltYXApIHsgaWYgKGtleW1hcC5oYXNPd25Qcm9wZXJ0eShrZXluYW1lKSkge1xuICAgIHZhciB2YWx1ZSA9IGtleW1hcFtrZXluYW1lXTtcbiAgICBpZiAoL14obmFtZXxmYWxsdGhyb3VnaHwoZGV8YXQpdGFjaCkkLy50ZXN0KGtleW5hbWUpKSB7IGNvbnRpbnVlIH1cbiAgICBpZiAodmFsdWUgPT0gXCIuLi5cIikgeyBkZWxldGUga2V5bWFwW2tleW5hbWVdOyBjb250aW51ZSB9XG5cbiAgICB2YXIga2V5cyA9IG1hcChrZXluYW1lLnNwbGl0KFwiIFwiKSwgbm9ybWFsaXplS2V5TmFtZSk7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBrZXlzLmxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIgdmFsID0gKHZvaWQgMCksIG5hbWUgPSAodm9pZCAwKTtcbiAgICAgIGlmIChpID09IGtleXMubGVuZ3RoIC0gMSkge1xuICAgICAgICBuYW1lID0ga2V5cy5qb2luKFwiIFwiKTtcbiAgICAgICAgdmFsID0gdmFsdWU7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBuYW1lID0ga2V5cy5zbGljZSgwLCBpICsgMSkuam9pbihcIiBcIik7XG4gICAgICAgIHZhbCA9IFwiLi4uXCI7XG4gICAgICB9XG4gICAgICB2YXIgcHJldiA9IGNvcHlbbmFtZV07XG4gICAgICBpZiAoIXByZXYpIHsgY29weVtuYW1lXSA9IHZhbDsgfVxuICAgICAgZWxzZSBpZiAocHJldiAhPSB2YWwpIHsgdGhyb3cgbmV3IEVycm9yKFwiSW5jb25zaXN0ZW50IGJpbmRpbmdzIGZvciBcIiArIG5hbWUpIH1cbiAgICB9XG4gICAgZGVsZXRlIGtleW1hcFtrZXluYW1lXTtcbiAgfSB9XG4gIGZvciAodmFyIHByb3AgaW4gY29weSkgeyBrZXltYXBbcHJvcF0gPSBjb3B5W3Byb3BdOyB9XG4gIHJldHVybiBrZXltYXBcbn1cblxuZnVuY3Rpb24gbG9va3VwS2V5KGtleSwgbWFwJCQxLCBoYW5kbGUsIGNvbnRleHQpIHtcbiAgbWFwJCQxID0gZ2V0S2V5TWFwKG1hcCQkMSk7XG4gIHZhciBmb3VuZCA9IG1hcCQkMS5jYWxsID8gbWFwJCQxLmNhbGwoa2V5LCBjb250ZXh0KSA6IG1hcCQkMVtrZXldO1xuICBpZiAoZm91bmQgPT09IGZhbHNlKSB7IHJldHVybiBcIm5vdGhpbmdcIiB9XG4gIGlmIChmb3VuZCA9PT0gXCIuLi5cIikgeyByZXR1cm4gXCJtdWx0aVwiIH1cbiAgaWYgKGZvdW5kICE9IG51bGwgJiYgaGFuZGxlKGZvdW5kKSkgeyByZXR1cm4gXCJoYW5kbGVkXCIgfVxuXG4gIGlmIChtYXAkJDEuZmFsbHRocm91Z2gpIHtcbiAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKG1hcCQkMS5mYWxsdGhyb3VnaCkgIT0gXCJbb2JqZWN0IEFycmF5XVwiKVxuICAgICAgeyByZXR1cm4gbG9va3VwS2V5KGtleSwgbWFwJCQxLmZhbGx0aHJvdWdoLCBoYW5kbGUsIGNvbnRleHQpIH1cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IG1hcCQkMS5mYWxsdGhyb3VnaC5sZW5ndGg7IGkrKykge1xuICAgICAgdmFyIHJlc3VsdCA9IGxvb2t1cEtleShrZXksIG1hcCQkMS5mYWxsdGhyb3VnaFtpXSwgaGFuZGxlLCBjb250ZXh0KTtcbiAgICAgIGlmIChyZXN1bHQpIHsgcmV0dXJuIHJlc3VsdCB9XG4gICAgfVxuICB9XG59XG5cbi8vIE1vZGlmaWVyIGtleSBwcmVzc2VzIGRvbid0IGNvdW50IGFzICdyZWFsJyBrZXkgcHJlc3NlcyBmb3IgdGhlXG4vLyBwdXJwb3NlIG9mIGtleW1hcCBmYWxsdGhyb3VnaC5cbmZ1bmN0aW9uIGlzTW9kaWZpZXJLZXkodmFsdWUpIHtcbiAgdmFyIG5hbWUgPSB0eXBlb2YgdmFsdWUgPT0gXCJzdHJpbmdcIiA/IHZhbHVlIDoga2V5TmFtZXNbdmFsdWUua2V5Q29kZV07XG4gIHJldHVybiBuYW1lID09IFwiQ3RybFwiIHx8IG5hbWUgPT0gXCJBbHRcIiB8fCBuYW1lID09IFwiU2hpZnRcIiB8fCBuYW1lID09IFwiTW9kXCJcbn1cblxuZnVuY3Rpb24gYWRkTW9kaWZpZXJOYW1lcyhuYW1lLCBldmVudCwgbm9TaGlmdCkge1xuICB2YXIgYmFzZSA9IG5hbWU7XG4gIGlmIChldmVudC5hbHRLZXkgJiYgYmFzZSAhPSBcIkFsdFwiKSB7IG5hbWUgPSBcIkFsdC1cIiArIG5hbWU7IH1cbiAgaWYgKChmbGlwQ3RybENtZCA/IGV2ZW50Lm1ldGFLZXkgOiBldmVudC5jdHJsS2V5KSAmJiBiYXNlICE9IFwiQ3RybFwiKSB7IG5hbWUgPSBcIkN0cmwtXCIgKyBuYW1lOyB9XG4gIGlmICgoZmxpcEN0cmxDbWQgPyBldmVudC5jdHJsS2V5IDogZXZlbnQubWV0YUtleSkgJiYgYmFzZSAhPSBcIkNtZFwiKSB7IG5hbWUgPSBcIkNtZC1cIiArIG5hbWU7IH1cbiAgaWYgKCFub1NoaWZ0ICYmIGV2ZW50LnNoaWZ0S2V5ICYmIGJhc2UgIT0gXCJTaGlmdFwiKSB7IG5hbWUgPSBcIlNoaWZ0LVwiICsgbmFtZTsgfVxuICByZXR1cm4gbmFtZVxufVxuXG4vLyBMb29rIHVwIHRoZSBuYW1lIG9mIGEga2V5IGFzIGluZGljYXRlZCBieSBhbiBldmVudCBvYmplY3QuXG5mdW5jdGlvbiBrZXlOYW1lKGV2ZW50LCBub1NoaWZ0KSB7XG4gIGlmIChwcmVzdG8gJiYgZXZlbnQua2V5Q29kZSA9PSAzNCAmJiBldmVudFtcImNoYXJcIl0pIHsgcmV0dXJuIGZhbHNlIH1cbiAgdmFyIG5hbWUgPSBrZXlOYW1lc1tldmVudC5rZXlDb2RlXTtcbiAgaWYgKG5hbWUgPT0gbnVsbCB8fCBldmVudC5hbHRHcmFwaEtleSkgeyByZXR1cm4gZmFsc2UgfVxuICAvLyBDdHJsLVNjcm9sbExvY2sgaGFzIGtleUNvZGUgMywgc2FtZSBhcyBDdHJsLVBhdXNlLFxuICAvLyBzbyB3ZSdsbCB1c2UgZXZlbnQuY29kZSB3aGVuIGF2YWlsYWJsZSAoQ2hyb21lIDQ4KywgRkYgMzgrLCBTYWZhcmkgMTAuMSspXG4gIGlmIChldmVudC5rZXlDb2RlID09IDMgJiYgZXZlbnQuY29kZSkgeyBuYW1lID0gZXZlbnQuY29kZTsgfVxuICByZXR1cm4gYWRkTW9kaWZpZXJOYW1lcyhuYW1lLCBldmVudCwgbm9TaGlmdClcbn1cblxuZnVuY3Rpb24gZ2V0S2V5TWFwKHZhbCkge1xuICByZXR1cm4gdHlwZW9mIHZhbCA9PSBcInN0cmluZ1wiID8ga2V5TWFwW3ZhbF0gOiB2YWxcbn1cblxuLy8gSGVscGVyIGZvciBkZWxldGluZyB0ZXh0IG5lYXIgdGhlIHNlbGVjdGlvbihzKSwgdXNlZCB0byBpbXBsZW1lbnRcbi8vIGJhY2tzcGFjZSwgZGVsZXRlLCBhbmQgc2ltaWxhciBmdW5jdGlvbmFsaXR5LlxuZnVuY3Rpb24gZGVsZXRlTmVhclNlbGVjdGlvbihjbSwgY29tcHV0ZSkge1xuICB2YXIgcmFuZ2VzID0gY20uZG9jLnNlbC5yYW5nZXMsIGtpbGwgPSBbXTtcbiAgLy8gQnVpbGQgdXAgYSBzZXQgb2YgcmFuZ2VzIHRvIGtpbGwgZmlyc3QsIG1lcmdpbmcgb3ZlcmxhcHBpbmdcbiAgLy8gcmFuZ2VzLlxuICBmb3IgKHZhciBpID0gMDsgaSA8IHJhbmdlcy5sZW5ndGg7IGkrKykge1xuICAgIHZhciB0b0tpbGwgPSBjb21wdXRlKHJhbmdlc1tpXSk7XG4gICAgd2hpbGUgKGtpbGwubGVuZ3RoICYmIGNtcCh0b0tpbGwuZnJvbSwgbHN0KGtpbGwpLnRvKSA8PSAwKSB7XG4gICAgICB2YXIgcmVwbGFjZWQgPSBraWxsLnBvcCgpO1xuICAgICAgaWYgKGNtcChyZXBsYWNlZC5mcm9tLCB0b0tpbGwuZnJvbSkgPCAwKSB7XG4gICAgICAgIHRvS2lsbC5mcm9tID0gcmVwbGFjZWQuZnJvbTtcbiAgICAgICAgYnJlYWtcbiAgICAgIH1cbiAgICB9XG4gICAga2lsbC5wdXNoKHRvS2lsbCk7XG4gIH1cbiAgLy8gTmV4dCwgcmVtb3ZlIHRob3NlIGFjdHVhbCByYW5nZXMuXG4gIHJ1bkluT3AoY20sIGZ1bmN0aW9uICgpIHtcbiAgICBmb3IgKHZhciBpID0ga2lsbC5sZW5ndGggLSAxOyBpID49IDA7IGktLSlcbiAgICAgIHsgcmVwbGFjZVJhbmdlKGNtLmRvYywgXCJcIiwga2lsbFtpXS5mcm9tLCBraWxsW2ldLnRvLCBcIitkZWxldGVcIik7IH1cbiAgICBlbnN1cmVDdXJzb3JWaXNpYmxlKGNtKTtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIG1vdmVDaGFyTG9naWNhbGx5KGxpbmUsIGNoLCBkaXIpIHtcbiAgdmFyIHRhcmdldCA9IHNraXBFeHRlbmRpbmdDaGFycyhsaW5lLnRleHQsIGNoICsgZGlyLCBkaXIpO1xuICByZXR1cm4gdGFyZ2V0IDwgMCB8fCB0YXJnZXQgPiBsaW5lLnRleHQubGVuZ3RoID8gbnVsbCA6IHRhcmdldFxufVxuXG5mdW5jdGlvbiBtb3ZlTG9naWNhbGx5KGxpbmUsIHN0YXJ0LCBkaXIpIHtcbiAgdmFyIGNoID0gbW92ZUNoYXJMb2dpY2FsbHkobGluZSwgc3RhcnQuY2gsIGRpcik7XG4gIHJldHVybiBjaCA9PSBudWxsID8gbnVsbCA6IG5ldyBQb3Moc3RhcnQubGluZSwgY2gsIGRpciA8IDAgPyBcImFmdGVyXCIgOiBcImJlZm9yZVwiKVxufVxuXG5mdW5jdGlvbiBlbmRPZkxpbmUodmlzdWFsbHksIGNtLCBsaW5lT2JqLCBsaW5lTm8sIGRpcikge1xuICBpZiAodmlzdWFsbHkpIHtcbiAgICB2YXIgb3JkZXIgPSBnZXRPcmRlcihsaW5lT2JqLCBjbS5kb2MuZGlyZWN0aW9uKTtcbiAgICBpZiAob3JkZXIpIHtcbiAgICAgIHZhciBwYXJ0ID0gZGlyIDwgMCA/IGxzdChvcmRlcikgOiBvcmRlclswXTtcbiAgICAgIHZhciBtb3ZlSW5TdG9yYWdlT3JkZXIgPSAoZGlyIDwgMCkgPT0gKHBhcnQubGV2ZWwgPT0gMSk7XG4gICAgICB2YXIgc3RpY2t5ID0gbW92ZUluU3RvcmFnZU9yZGVyID8gXCJhZnRlclwiIDogXCJiZWZvcmVcIjtcbiAgICAgIHZhciBjaDtcbiAgICAgIC8vIFdpdGggYSB3cmFwcGVkIHJ0bCBjaHVuayAocG9zc2libHkgc3Bhbm5pbmcgbXVsdGlwbGUgYmlkaSBwYXJ0cyksXG4gICAgICAvLyBpdCBjb3VsZCBiZSB0aGF0IHRoZSBsYXN0IGJpZGkgcGFydCBpcyBub3Qgb24gdGhlIGxhc3QgdmlzdWFsIGxpbmUsXG4gICAgICAvLyBzaW5jZSB2aXN1YWwgbGluZXMgY29udGFpbiBjb250ZW50IG9yZGVyLWNvbnNlY3V0aXZlIGNodW5rcy5cbiAgICAgIC8vIFRodXMsIGluIHJ0bCwgd2UgYXJlIGxvb2tpbmcgZm9yIHRoZSBmaXJzdCAoY29udGVudC1vcmRlcikgY2hhcmFjdGVyXG4gICAgICAvLyBpbiB0aGUgcnRsIGNodW5rIHRoYXQgaXMgb24gdGhlIGxhc3QgbGluZSAodGhhdCBpcywgdGhlIHNhbWUgbGluZVxuICAgICAgLy8gYXMgdGhlIGxhc3QgKGNvbnRlbnQtb3JkZXIpIGNoYXJhY3RlcikuXG4gICAgICBpZiAocGFydC5sZXZlbCA+IDAgfHwgY20uZG9jLmRpcmVjdGlvbiA9PSBcInJ0bFwiKSB7XG4gICAgICAgIHZhciBwcmVwID0gcHJlcGFyZU1lYXN1cmVGb3JMaW5lKGNtLCBsaW5lT2JqKTtcbiAgICAgICAgY2ggPSBkaXIgPCAwID8gbGluZU9iai50ZXh0Lmxlbmd0aCAtIDEgOiAwO1xuICAgICAgICB2YXIgdGFyZ2V0VG9wID0gbWVhc3VyZUNoYXJQcmVwYXJlZChjbSwgcHJlcCwgY2gpLnRvcDtcbiAgICAgICAgY2ggPSBmaW5kRmlyc3QoZnVuY3Rpb24gKGNoKSB7IHJldHVybiBtZWFzdXJlQ2hhclByZXBhcmVkKGNtLCBwcmVwLCBjaCkudG9wID09IHRhcmdldFRvcDsgfSwgKGRpciA8IDApID09IChwYXJ0LmxldmVsID09IDEpID8gcGFydC5mcm9tIDogcGFydC50byAtIDEsIGNoKTtcbiAgICAgICAgaWYgKHN0aWNreSA9PSBcImJlZm9yZVwiKSB7IGNoID0gbW92ZUNoYXJMb2dpY2FsbHkobGluZU9iaiwgY2gsIDEpOyB9XG4gICAgICB9IGVsc2UgeyBjaCA9IGRpciA8IDAgPyBwYXJ0LnRvIDogcGFydC5mcm9tOyB9XG4gICAgICByZXR1cm4gbmV3IFBvcyhsaW5lTm8sIGNoLCBzdGlja3kpXG4gICAgfVxuICB9XG4gIHJldHVybiBuZXcgUG9zKGxpbmVObywgZGlyIDwgMCA/IGxpbmVPYmoudGV4dC5sZW5ndGggOiAwLCBkaXIgPCAwID8gXCJiZWZvcmVcIiA6IFwiYWZ0ZXJcIilcbn1cblxuZnVuY3Rpb24gbW92ZVZpc3VhbGx5KGNtLCBsaW5lLCBzdGFydCwgZGlyKSB7XG4gIHZhciBiaWRpID0gZ2V0T3JkZXIobGluZSwgY20uZG9jLmRpcmVjdGlvbik7XG4gIGlmICghYmlkaSkgeyByZXR1cm4gbW92ZUxvZ2ljYWxseShsaW5lLCBzdGFydCwgZGlyKSB9XG4gIGlmIChzdGFydC5jaCA+PSBsaW5lLnRleHQubGVuZ3RoKSB7XG4gICAgc3RhcnQuY2ggPSBsaW5lLnRleHQubGVuZ3RoO1xuICAgIHN0YXJ0LnN0aWNreSA9IFwiYmVmb3JlXCI7XG4gIH0gZWxzZSBpZiAoc3RhcnQuY2ggPD0gMCkge1xuICAgIHN0YXJ0LmNoID0gMDtcbiAgICBzdGFydC5zdGlja3kgPSBcImFmdGVyXCI7XG4gIH1cbiAgdmFyIHBhcnRQb3MgPSBnZXRCaWRpUGFydEF0KGJpZGksIHN0YXJ0LmNoLCBzdGFydC5zdGlja3kpLCBwYXJ0ID0gYmlkaVtwYXJ0UG9zXTtcbiAgaWYgKGNtLmRvYy5kaXJlY3Rpb24gPT0gXCJsdHJcIiAmJiBwYXJ0LmxldmVsICUgMiA9PSAwICYmIChkaXIgPiAwID8gcGFydC50byA+IHN0YXJ0LmNoIDogcGFydC5mcm9tIDwgc3RhcnQuY2gpKSB7XG4gICAgLy8gQ2FzZSAxOiBXZSBtb3ZlIHdpdGhpbiBhbiBsdHIgcGFydCBpbiBhbiBsdHIgZWRpdG9yLiBFdmVuIHdpdGggd3JhcHBlZCBsaW5lcyxcbiAgICAvLyBub3RoaW5nIGludGVyZXN0aW5nIGhhcHBlbnMuXG4gICAgcmV0dXJuIG1vdmVMb2dpY2FsbHkobGluZSwgc3RhcnQsIGRpcilcbiAgfVxuXG4gIHZhciBtdiA9IGZ1bmN0aW9uIChwb3MsIGRpcikgeyByZXR1cm4gbW92ZUNoYXJMb2dpY2FsbHkobGluZSwgcG9zIGluc3RhbmNlb2YgUG9zID8gcG9zLmNoIDogcG9zLCBkaXIpOyB9O1xuICB2YXIgcHJlcDtcbiAgdmFyIGdldFdyYXBwZWRMaW5lRXh0ZW50ID0gZnVuY3Rpb24gKGNoKSB7XG4gICAgaWYgKCFjbS5vcHRpb25zLmxpbmVXcmFwcGluZykgeyByZXR1cm4ge2JlZ2luOiAwLCBlbmQ6IGxpbmUudGV4dC5sZW5ndGh9IH1cbiAgICBwcmVwID0gcHJlcCB8fCBwcmVwYXJlTWVhc3VyZUZvckxpbmUoY20sIGxpbmUpO1xuICAgIHJldHVybiB3cmFwcGVkTGluZUV4dGVudENoYXIoY20sIGxpbmUsIHByZXAsIGNoKVxuICB9O1xuICB2YXIgd3JhcHBlZExpbmVFeHRlbnQgPSBnZXRXcmFwcGVkTGluZUV4dGVudChzdGFydC5zdGlja3kgPT0gXCJiZWZvcmVcIiA/IG12KHN0YXJ0LCAtMSkgOiBzdGFydC5jaCk7XG5cbiAgaWYgKGNtLmRvYy5kaXJlY3Rpb24gPT0gXCJydGxcIiB8fCBwYXJ0LmxldmVsID09IDEpIHtcbiAgICB2YXIgbW92ZUluU3RvcmFnZU9yZGVyID0gKHBhcnQubGV2ZWwgPT0gMSkgPT0gKGRpciA8IDApO1xuICAgIHZhciBjaCA9IG12KHN0YXJ0LCBtb3ZlSW5TdG9yYWdlT3JkZXIgPyAxIDogLTEpO1xuICAgIGlmIChjaCAhPSBudWxsICYmICghbW92ZUluU3RvcmFnZU9yZGVyID8gY2ggPj0gcGFydC5mcm9tICYmIGNoID49IHdyYXBwZWRMaW5lRXh0ZW50LmJlZ2luIDogY2ggPD0gcGFydC50byAmJiBjaCA8PSB3cmFwcGVkTGluZUV4dGVudC5lbmQpKSB7XG4gICAgICAvLyBDYXNlIDI6IFdlIG1vdmUgd2l0aGluIGFuIHJ0bCBwYXJ0IG9yIGluIGFuIHJ0bCBlZGl0b3Igb24gdGhlIHNhbWUgdmlzdWFsIGxpbmVcbiAgICAgIHZhciBzdGlja3kgPSBtb3ZlSW5TdG9yYWdlT3JkZXIgPyBcImJlZm9yZVwiIDogXCJhZnRlclwiO1xuICAgICAgcmV0dXJuIG5ldyBQb3Moc3RhcnQubGluZSwgY2gsIHN0aWNreSlcbiAgICB9XG4gIH1cblxuICAvLyBDYXNlIDM6IENvdWxkIG5vdCBtb3ZlIHdpdGhpbiB0aGlzIGJpZGkgcGFydCBpbiB0aGlzIHZpc3VhbCBsaW5lLCBzbyBsZWF2ZVxuICAvLyB0aGUgY3VycmVudCBiaWRpIHBhcnRcblxuICB2YXIgc2VhcmNoSW5WaXN1YWxMaW5lID0gZnVuY3Rpb24gKHBhcnRQb3MsIGRpciwgd3JhcHBlZExpbmVFeHRlbnQpIHtcbiAgICB2YXIgZ2V0UmVzID0gZnVuY3Rpb24gKGNoLCBtb3ZlSW5TdG9yYWdlT3JkZXIpIHsgcmV0dXJuIG1vdmVJblN0b3JhZ2VPcmRlclxuICAgICAgPyBuZXcgUG9zKHN0YXJ0LmxpbmUsIG12KGNoLCAxKSwgXCJiZWZvcmVcIilcbiAgICAgIDogbmV3IFBvcyhzdGFydC5saW5lLCBjaCwgXCJhZnRlclwiKTsgfTtcblxuICAgIGZvciAoOyBwYXJ0UG9zID49IDAgJiYgcGFydFBvcyA8IGJpZGkubGVuZ3RoOyBwYXJ0UG9zICs9IGRpcikge1xuICAgICAgdmFyIHBhcnQgPSBiaWRpW3BhcnRQb3NdO1xuICAgICAgdmFyIG1vdmVJblN0b3JhZ2VPcmRlciA9IChkaXIgPiAwKSA9PSAocGFydC5sZXZlbCAhPSAxKTtcbiAgICAgIHZhciBjaCA9IG1vdmVJblN0b3JhZ2VPcmRlciA/IHdyYXBwZWRMaW5lRXh0ZW50LmJlZ2luIDogbXYod3JhcHBlZExpbmVFeHRlbnQuZW5kLCAtMSk7XG4gICAgICBpZiAocGFydC5mcm9tIDw9IGNoICYmIGNoIDwgcGFydC50bykgeyByZXR1cm4gZ2V0UmVzKGNoLCBtb3ZlSW5TdG9yYWdlT3JkZXIpIH1cbiAgICAgIGNoID0gbW92ZUluU3RvcmFnZU9yZGVyID8gcGFydC5mcm9tIDogbXYocGFydC50bywgLTEpO1xuICAgICAgaWYgKHdyYXBwZWRMaW5lRXh0ZW50LmJlZ2luIDw9IGNoICYmIGNoIDwgd3JhcHBlZExpbmVFeHRlbnQuZW5kKSB7IHJldHVybiBnZXRSZXMoY2gsIG1vdmVJblN0b3JhZ2VPcmRlcikgfVxuICAgIH1cbiAgfTtcblxuICAvLyBDYXNlIDNhOiBMb29rIGZvciBvdGhlciBiaWRpIHBhcnRzIG9uIHRoZSBzYW1lIHZpc3VhbCBsaW5lXG4gIHZhciByZXMgPSBzZWFyY2hJblZpc3VhbExpbmUocGFydFBvcyArIGRpciwgZGlyLCB3cmFwcGVkTGluZUV4dGVudCk7XG4gIGlmIChyZXMpIHsgcmV0dXJuIHJlcyB9XG5cbiAgLy8gQ2FzZSAzYjogTG9vayBmb3Igb3RoZXIgYmlkaSBwYXJ0cyBvbiB0aGUgbmV4dCB2aXN1YWwgbGluZVxuICB2YXIgbmV4dENoID0gZGlyID4gMCA/IHdyYXBwZWRMaW5lRXh0ZW50LmVuZCA6IG12KHdyYXBwZWRMaW5lRXh0ZW50LmJlZ2luLCAtMSk7XG4gIGlmIChuZXh0Q2ggIT0gbnVsbCAmJiAhKGRpciA+IDAgJiYgbmV4dENoID09IGxpbmUudGV4dC5sZW5ndGgpKSB7XG4gICAgcmVzID0gc2VhcmNoSW5WaXN1YWxMaW5lKGRpciA+IDAgPyAwIDogYmlkaS5sZW5ndGggLSAxLCBkaXIsIGdldFdyYXBwZWRMaW5lRXh0ZW50KG5leHRDaCkpO1xuICAgIGlmIChyZXMpIHsgcmV0dXJuIHJlcyB9XG4gIH1cblxuICAvLyBDYXNlIDQ6IE5vd2hlcmUgdG8gbW92ZVxuICByZXR1cm4gbnVsbFxufVxuXG4vLyBDb21tYW5kcyBhcmUgcGFyYW1ldGVyLWxlc3MgYWN0aW9ucyB0aGF0IGNhbiBiZSBwZXJmb3JtZWQgb24gYW5cbi8vIGVkaXRvciwgbW9zdGx5IHVzZWQgZm9yIGtleWJpbmRpbmdzLlxudmFyIGNvbW1hbmRzID0ge1xuICBzZWxlY3RBbGw6IHNlbGVjdEFsbCxcbiAgc2luZ2xlU2VsZWN0aW9uOiBmdW5jdGlvbiAoY20pIHsgcmV0dXJuIGNtLnNldFNlbGVjdGlvbihjbS5nZXRDdXJzb3IoXCJhbmNob3JcIiksIGNtLmdldEN1cnNvcihcImhlYWRcIiksIHNlbF9kb250U2Nyb2xsKTsgfSxcbiAga2lsbExpbmU6IGZ1bmN0aW9uIChjbSkgeyByZXR1cm4gZGVsZXRlTmVhclNlbGVjdGlvbihjbSwgZnVuY3Rpb24gKHJhbmdlKSB7XG4gICAgaWYgKHJhbmdlLmVtcHR5KCkpIHtcbiAgICAgIHZhciBsZW4gPSBnZXRMaW5lKGNtLmRvYywgcmFuZ2UuaGVhZC5saW5lKS50ZXh0Lmxlbmd0aDtcbiAgICAgIGlmIChyYW5nZS5oZWFkLmNoID09IGxlbiAmJiByYW5nZS5oZWFkLmxpbmUgPCBjbS5sYXN0TGluZSgpKVxuICAgICAgICB7IHJldHVybiB7ZnJvbTogcmFuZ2UuaGVhZCwgdG86IFBvcyhyYW5nZS5oZWFkLmxpbmUgKyAxLCAwKX0gfVxuICAgICAgZWxzZVxuICAgICAgICB7IHJldHVybiB7ZnJvbTogcmFuZ2UuaGVhZCwgdG86IFBvcyhyYW5nZS5oZWFkLmxpbmUsIGxlbil9IH1cbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIHtmcm9tOiByYW5nZS5mcm9tKCksIHRvOiByYW5nZS50bygpfVxuICAgIH1cbiAgfSk7IH0sXG4gIGRlbGV0ZUxpbmU6IGZ1bmN0aW9uIChjbSkgeyByZXR1cm4gZGVsZXRlTmVhclNlbGVjdGlvbihjbSwgZnVuY3Rpb24gKHJhbmdlKSB7IHJldHVybiAoe1xuICAgIGZyb206IFBvcyhyYW5nZS5mcm9tKCkubGluZSwgMCksXG4gICAgdG86IGNsaXBQb3MoY20uZG9jLCBQb3MocmFuZ2UudG8oKS5saW5lICsgMSwgMCkpXG4gIH0pOyB9KTsgfSxcbiAgZGVsTGluZUxlZnQ6IGZ1bmN0aW9uIChjbSkgeyByZXR1cm4gZGVsZXRlTmVhclNlbGVjdGlvbihjbSwgZnVuY3Rpb24gKHJhbmdlKSB7IHJldHVybiAoe1xuICAgIGZyb206IFBvcyhyYW5nZS5mcm9tKCkubGluZSwgMCksIHRvOiByYW5nZS5mcm9tKClcbiAgfSk7IH0pOyB9LFxuICBkZWxXcmFwcGVkTGluZUxlZnQ6IGZ1bmN0aW9uIChjbSkgeyByZXR1cm4gZGVsZXRlTmVhclNlbGVjdGlvbihjbSwgZnVuY3Rpb24gKHJhbmdlKSB7XG4gICAgdmFyIHRvcCA9IGNtLmNoYXJDb29yZHMocmFuZ2UuaGVhZCwgXCJkaXZcIikudG9wICsgNTtcbiAgICB2YXIgbGVmdFBvcyA9IGNtLmNvb3Jkc0NoYXIoe2xlZnQ6IDAsIHRvcDogdG9wfSwgXCJkaXZcIik7XG4gICAgcmV0dXJuIHtmcm9tOiBsZWZ0UG9zLCB0bzogcmFuZ2UuZnJvbSgpfVxuICB9KTsgfSxcbiAgZGVsV3JhcHBlZExpbmVSaWdodDogZnVuY3Rpb24gKGNtKSB7IHJldHVybiBkZWxldGVOZWFyU2VsZWN0aW9uKGNtLCBmdW5jdGlvbiAocmFuZ2UpIHtcbiAgICB2YXIgdG9wID0gY20uY2hhckNvb3JkcyhyYW5nZS5oZWFkLCBcImRpdlwiKS50b3AgKyA1O1xuICAgIHZhciByaWdodFBvcyA9IGNtLmNvb3Jkc0NoYXIoe2xlZnQ6IGNtLmRpc3BsYXkubGluZURpdi5vZmZzZXRXaWR0aCArIDEwMCwgdG9wOiB0b3B9LCBcImRpdlwiKTtcbiAgICByZXR1cm4ge2Zyb206IHJhbmdlLmZyb20oKSwgdG86IHJpZ2h0UG9zIH1cbiAgfSk7IH0sXG4gIHVuZG86IGZ1bmN0aW9uIChjbSkgeyByZXR1cm4gY20udW5kbygpOyB9LFxuICByZWRvOiBmdW5jdGlvbiAoY20pIHsgcmV0dXJuIGNtLnJlZG8oKTsgfSxcbiAgdW5kb1NlbGVjdGlvbjogZnVuY3Rpb24gKGNtKSB7IHJldHVybiBjbS51bmRvU2VsZWN0aW9uKCk7IH0sXG4gIHJlZG9TZWxlY3Rpb246IGZ1bmN0aW9uIChjbSkgeyByZXR1cm4gY20ucmVkb1NlbGVjdGlvbigpOyB9LFxuICBnb0RvY1N0YXJ0OiBmdW5jdGlvbiAoY20pIHsgcmV0dXJuIGNtLmV4dGVuZFNlbGVjdGlvbihQb3MoY20uZmlyc3RMaW5lKCksIDApKTsgfSxcbiAgZ29Eb2NFbmQ6IGZ1bmN0aW9uIChjbSkgeyByZXR1cm4gY20uZXh0ZW5kU2VsZWN0aW9uKFBvcyhjbS5sYXN0TGluZSgpKSk7IH0sXG4gIGdvTGluZVN0YXJ0OiBmdW5jdGlvbiAoY20pIHsgcmV0dXJuIGNtLmV4dGVuZFNlbGVjdGlvbnNCeShmdW5jdGlvbiAocmFuZ2UpIHsgcmV0dXJuIGxpbmVTdGFydChjbSwgcmFuZ2UuaGVhZC5saW5lKTsgfSxcbiAgICB7b3JpZ2luOiBcIittb3ZlXCIsIGJpYXM6IDF9XG4gICk7IH0sXG4gIGdvTGluZVN0YXJ0U21hcnQ6IGZ1bmN0aW9uIChjbSkgeyByZXR1cm4gY20uZXh0ZW5kU2VsZWN0aW9uc0J5KGZ1bmN0aW9uIChyYW5nZSkgeyByZXR1cm4gbGluZVN0YXJ0U21hcnQoY20sIHJhbmdlLmhlYWQpOyB9LFxuICAgIHtvcmlnaW46IFwiK21vdmVcIiwgYmlhczogMX1cbiAgKTsgfSxcbiAgZ29MaW5lRW5kOiBmdW5jdGlvbiAoY20pIHsgcmV0dXJuIGNtLmV4dGVuZFNlbGVjdGlvbnNCeShmdW5jdGlvbiAocmFuZ2UpIHsgcmV0dXJuIGxpbmVFbmQoY20sIHJhbmdlLmhlYWQubGluZSk7IH0sXG4gICAge29yaWdpbjogXCIrbW92ZVwiLCBiaWFzOiAtMX1cbiAgKTsgfSxcbiAgZ29MaW5lUmlnaHQ6IGZ1bmN0aW9uIChjbSkgeyByZXR1cm4gY20uZXh0ZW5kU2VsZWN0aW9uc0J5KGZ1bmN0aW9uIChyYW5nZSkge1xuICAgIHZhciB0b3AgPSBjbS5jdXJzb3JDb29yZHMocmFuZ2UuaGVhZCwgXCJkaXZcIikudG9wICsgNTtcbiAgICByZXR1cm4gY20uY29vcmRzQ2hhcih7bGVmdDogY20uZGlzcGxheS5saW5lRGl2Lm9mZnNldFdpZHRoICsgMTAwLCB0b3A6IHRvcH0sIFwiZGl2XCIpXG4gIH0sIHNlbF9tb3ZlKTsgfSxcbiAgZ29MaW5lTGVmdDogZnVuY3Rpb24gKGNtKSB7IHJldHVybiBjbS5leHRlbmRTZWxlY3Rpb25zQnkoZnVuY3Rpb24gKHJhbmdlKSB7XG4gICAgdmFyIHRvcCA9IGNtLmN1cnNvckNvb3JkcyhyYW5nZS5oZWFkLCBcImRpdlwiKS50b3AgKyA1O1xuICAgIHJldHVybiBjbS5jb29yZHNDaGFyKHtsZWZ0OiAwLCB0b3A6IHRvcH0sIFwiZGl2XCIpXG4gIH0sIHNlbF9tb3ZlKTsgfSxcbiAgZ29MaW5lTGVmdFNtYXJ0OiBmdW5jdGlvbiAoY20pIHsgcmV0dXJuIGNtLmV4dGVuZFNlbGVjdGlvbnNCeShmdW5jdGlvbiAocmFuZ2UpIHtcbiAgICB2YXIgdG9wID0gY20uY3Vyc29yQ29vcmRzKHJhbmdlLmhlYWQsIFwiZGl2XCIpLnRvcCArIDU7XG4gICAgdmFyIHBvcyA9IGNtLmNvb3Jkc0NoYXIoe2xlZnQ6IDAsIHRvcDogdG9wfSwgXCJkaXZcIik7XG4gICAgaWYgKHBvcy5jaCA8IGNtLmdldExpbmUocG9zLmxpbmUpLnNlYXJjaCgvXFxTLykpIHsgcmV0dXJuIGxpbmVTdGFydFNtYXJ0KGNtLCByYW5nZS5oZWFkKSB9XG4gICAgcmV0dXJuIHBvc1xuICB9LCBzZWxfbW92ZSk7IH0sXG4gIGdvTGluZVVwOiBmdW5jdGlvbiAoY20pIHsgcmV0dXJuIGNtLm1vdmVWKC0xLCBcImxpbmVcIik7IH0sXG4gIGdvTGluZURvd246IGZ1bmN0aW9uIChjbSkgeyByZXR1cm4gY20ubW92ZVYoMSwgXCJsaW5lXCIpOyB9LFxuICBnb1BhZ2VVcDogZnVuY3Rpb24gKGNtKSB7IHJldHVybiBjbS5tb3ZlVigtMSwgXCJwYWdlXCIpOyB9LFxuICBnb1BhZ2VEb3duOiBmdW5jdGlvbiAoY20pIHsgcmV0dXJuIGNtLm1vdmVWKDEsIFwicGFnZVwiKTsgfSxcbiAgZ29DaGFyTGVmdDogZnVuY3Rpb24gKGNtKSB7IHJldHVybiBjbS5tb3ZlSCgtMSwgXCJjaGFyXCIpOyB9LFxuICBnb0NoYXJSaWdodDogZnVuY3Rpb24gKGNtKSB7IHJldHVybiBjbS5tb3ZlSCgxLCBcImNoYXJcIik7IH0sXG4gIGdvQ29sdW1uTGVmdDogZnVuY3Rpb24gKGNtKSB7IHJldHVybiBjbS5tb3ZlSCgtMSwgXCJjb2x1bW5cIik7IH0sXG4gIGdvQ29sdW1uUmlnaHQ6IGZ1bmN0aW9uIChjbSkgeyByZXR1cm4gY20ubW92ZUgoMSwgXCJjb2x1bW5cIik7IH0sXG4gIGdvV29yZExlZnQ6IGZ1bmN0aW9uIChjbSkgeyByZXR1cm4gY20ubW92ZUgoLTEsIFwid29yZFwiKTsgfSxcbiAgZ29Hcm91cFJpZ2h0OiBmdW5jdGlvbiAoY20pIHsgcmV0dXJuIGNtLm1vdmVIKDEsIFwiZ3JvdXBcIik7IH0sXG4gIGdvR3JvdXBMZWZ0OiBmdW5jdGlvbiAoY20pIHsgcmV0dXJuIGNtLm1vdmVIKC0xLCBcImdyb3VwXCIpOyB9LFxuICBnb1dvcmRSaWdodDogZnVuY3Rpb24gKGNtKSB7IHJldHVybiBjbS5tb3ZlSCgxLCBcIndvcmRcIik7IH0sXG4gIGRlbENoYXJCZWZvcmU6IGZ1bmN0aW9uIChjbSkgeyByZXR1cm4gY20uZGVsZXRlSCgtMSwgXCJjaGFyXCIpOyB9LFxuICBkZWxDaGFyQWZ0ZXI6IGZ1bmN0aW9uIChjbSkgeyByZXR1cm4gY20uZGVsZXRlSCgxLCBcImNoYXJcIik7IH0sXG4gIGRlbFdvcmRCZWZvcmU6IGZ1bmN0aW9uIChjbSkgeyByZXR1cm4gY20uZGVsZXRlSCgtMSwgXCJ3b3JkXCIpOyB9LFxuICBkZWxXb3JkQWZ0ZXI6IGZ1bmN0aW9uIChjbSkgeyByZXR1cm4gY20uZGVsZXRlSCgxLCBcIndvcmRcIik7IH0sXG4gIGRlbEdyb3VwQmVmb3JlOiBmdW5jdGlvbiAoY20pIHsgcmV0dXJuIGNtLmRlbGV0ZUgoLTEsIFwiZ3JvdXBcIik7IH0sXG4gIGRlbEdyb3VwQWZ0ZXI6IGZ1bmN0aW9uIChjbSkgeyByZXR1cm4gY20uZGVsZXRlSCgxLCBcImdyb3VwXCIpOyB9LFxuICBpbmRlbnRBdXRvOiBmdW5jdGlvbiAoY20pIHsgcmV0dXJuIGNtLmluZGVudFNlbGVjdGlvbihcInNtYXJ0XCIpOyB9LFxuICBpbmRlbnRNb3JlOiBmdW5jdGlvbiAoY20pIHsgcmV0dXJuIGNtLmluZGVudFNlbGVjdGlvbihcImFkZFwiKTsgfSxcbiAgaW5kZW50TGVzczogZnVuY3Rpb24gKGNtKSB7IHJldHVybiBjbS5pbmRlbnRTZWxlY3Rpb24oXCJzdWJ0cmFjdFwiKTsgfSxcbiAgaW5zZXJ0VGFiOiBmdW5jdGlvbiAoY20pIHsgcmV0dXJuIGNtLnJlcGxhY2VTZWxlY3Rpb24oXCJcXHRcIik7IH0sXG4gIGluc2VydFNvZnRUYWI6IGZ1bmN0aW9uIChjbSkge1xuICAgIHZhciBzcGFjZXMgPSBbXSwgcmFuZ2VzID0gY20ubGlzdFNlbGVjdGlvbnMoKSwgdGFiU2l6ZSA9IGNtLm9wdGlvbnMudGFiU2l6ZTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHJhbmdlcy5sZW5ndGg7IGkrKykge1xuICAgICAgdmFyIHBvcyA9IHJhbmdlc1tpXS5mcm9tKCk7XG4gICAgICB2YXIgY29sID0gY291bnRDb2x1bW4oY20uZ2V0TGluZShwb3MubGluZSksIHBvcy5jaCwgdGFiU2l6ZSk7XG4gICAgICBzcGFjZXMucHVzaChzcGFjZVN0cih0YWJTaXplIC0gY29sICUgdGFiU2l6ZSkpO1xuICAgIH1cbiAgICBjbS5yZXBsYWNlU2VsZWN0aW9ucyhzcGFjZXMpO1xuICB9LFxuICBkZWZhdWx0VGFiOiBmdW5jdGlvbiAoY20pIHtcbiAgICBpZiAoY20uc29tZXRoaW5nU2VsZWN0ZWQoKSkgeyBjbS5pbmRlbnRTZWxlY3Rpb24oXCJhZGRcIik7IH1cbiAgICBlbHNlIHsgY20uZXhlY0NvbW1hbmQoXCJpbnNlcnRUYWJcIik7IH1cbiAgfSxcbiAgLy8gU3dhcCB0aGUgdHdvIGNoYXJzIGxlZnQgYW5kIHJpZ2h0IG9mIGVhY2ggc2VsZWN0aW9uJ3MgaGVhZC5cbiAgLy8gTW92ZSBjdXJzb3IgYmVoaW5kIHRoZSB0d28gc3dhcHBlZCBjaGFyYWN0ZXJzIGFmdGVyd2FyZHMuXG4gIC8vXG4gIC8vIERvZXNuJ3QgY29uc2lkZXIgbGluZSBmZWVkcyBhIGNoYXJhY3Rlci5cbiAgLy8gRG9lc24ndCBzY2FuIG1vcmUgdGhhbiBvbmUgbGluZSBhYm92ZSB0byBmaW5kIGEgY2hhcmFjdGVyLlxuICAvLyBEb2Vzbid0IGRvIGFueXRoaW5nIG9uIGFuIGVtcHR5IGxpbmUuXG4gIC8vIERvZXNuJ3QgZG8gYW55dGhpbmcgd2l0aCBub24tZW1wdHkgc2VsZWN0aW9ucy5cbiAgdHJhbnNwb3NlQ2hhcnM6IGZ1bmN0aW9uIChjbSkgeyByZXR1cm4gcnVuSW5PcChjbSwgZnVuY3Rpb24gKCkge1xuICAgIHZhciByYW5nZXMgPSBjbS5saXN0U2VsZWN0aW9ucygpLCBuZXdTZWwgPSBbXTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHJhbmdlcy5sZW5ndGg7IGkrKykge1xuICAgICAgaWYgKCFyYW5nZXNbaV0uZW1wdHkoKSkgeyBjb250aW51ZSB9XG4gICAgICB2YXIgY3VyID0gcmFuZ2VzW2ldLmhlYWQsIGxpbmUgPSBnZXRMaW5lKGNtLmRvYywgY3VyLmxpbmUpLnRleHQ7XG4gICAgICBpZiAobGluZSkge1xuICAgICAgICBpZiAoY3VyLmNoID09IGxpbmUubGVuZ3RoKSB7IGN1ciA9IG5ldyBQb3MoY3VyLmxpbmUsIGN1ci5jaCAtIDEpOyB9XG4gICAgICAgIGlmIChjdXIuY2ggPiAwKSB7XG4gICAgICAgICAgY3VyID0gbmV3IFBvcyhjdXIubGluZSwgY3VyLmNoICsgMSk7XG4gICAgICAgICAgY20ucmVwbGFjZVJhbmdlKGxpbmUuY2hhckF0KGN1ci5jaCAtIDEpICsgbGluZS5jaGFyQXQoY3VyLmNoIC0gMiksXG4gICAgICAgICAgICAgICAgICAgICAgICAgIFBvcyhjdXIubGluZSwgY3VyLmNoIC0gMiksIGN1ciwgXCIrdHJhbnNwb3NlXCIpO1xuICAgICAgICB9IGVsc2UgaWYgKGN1ci5saW5lID4gY20uZG9jLmZpcnN0KSB7XG4gICAgICAgICAgdmFyIHByZXYgPSBnZXRMaW5lKGNtLmRvYywgY3VyLmxpbmUgLSAxKS50ZXh0O1xuICAgICAgICAgIGlmIChwcmV2KSB7XG4gICAgICAgICAgICBjdXIgPSBuZXcgUG9zKGN1ci5saW5lLCAxKTtcbiAgICAgICAgICAgIGNtLnJlcGxhY2VSYW5nZShsaW5lLmNoYXJBdCgwKSArIGNtLmRvYy5saW5lU2VwYXJhdG9yKCkgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByZXYuY2hhckF0KHByZXYubGVuZ3RoIC0gMSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgUG9zKGN1ci5saW5lIC0gMSwgcHJldi5sZW5ndGggLSAxKSwgY3VyLCBcIit0cmFuc3Bvc2VcIik7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBuZXdTZWwucHVzaChuZXcgUmFuZ2UoY3VyLCBjdXIpKTtcbiAgICB9XG4gICAgY20uc2V0U2VsZWN0aW9ucyhuZXdTZWwpO1xuICB9KTsgfSxcbiAgbmV3bGluZUFuZEluZGVudDogZnVuY3Rpb24gKGNtKSB7IHJldHVybiBydW5Jbk9wKGNtLCBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHNlbHMgPSBjbS5saXN0U2VsZWN0aW9ucygpO1xuICAgIGZvciAodmFyIGkgPSBzZWxzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKVxuICAgICAgeyBjbS5yZXBsYWNlUmFuZ2UoY20uZG9jLmxpbmVTZXBhcmF0b3IoKSwgc2Vsc1tpXS5hbmNob3IsIHNlbHNbaV0uaGVhZCwgXCIraW5wdXRcIik7IH1cbiAgICBzZWxzID0gY20ubGlzdFNlbGVjdGlvbnMoKTtcbiAgICBmb3IgKHZhciBpJDEgPSAwOyBpJDEgPCBzZWxzLmxlbmd0aDsgaSQxKyspXG4gICAgICB7IGNtLmluZGVudExpbmUoc2Vsc1tpJDFdLmZyb20oKS5saW5lLCBudWxsLCB0cnVlKTsgfVxuICAgIGVuc3VyZUN1cnNvclZpc2libGUoY20pO1xuICB9KTsgfSxcbiAgb3BlbkxpbmU6IGZ1bmN0aW9uIChjbSkgeyByZXR1cm4gY20ucmVwbGFjZVNlbGVjdGlvbihcIlxcblwiLCBcInN0YXJ0XCIpOyB9LFxuICB0b2dnbGVPdmVyd3JpdGU6IGZ1bmN0aW9uIChjbSkgeyByZXR1cm4gY20udG9nZ2xlT3ZlcndyaXRlKCk7IH1cbn07XG5cblxuZnVuY3Rpb24gbGluZVN0YXJ0KGNtLCBsaW5lTikge1xuICB2YXIgbGluZSA9IGdldExpbmUoY20uZG9jLCBsaW5lTik7XG4gIHZhciB2aXN1YWwgPSB2aXN1YWxMaW5lKGxpbmUpO1xuICBpZiAodmlzdWFsICE9IGxpbmUpIHsgbGluZU4gPSBsaW5lTm8odmlzdWFsKTsgfVxuICByZXR1cm4gZW5kT2ZMaW5lKHRydWUsIGNtLCB2aXN1YWwsIGxpbmVOLCAxKVxufVxuZnVuY3Rpb24gbGluZUVuZChjbSwgbGluZU4pIHtcbiAgdmFyIGxpbmUgPSBnZXRMaW5lKGNtLmRvYywgbGluZU4pO1xuICB2YXIgdmlzdWFsID0gdmlzdWFsTGluZUVuZChsaW5lKTtcbiAgaWYgKHZpc3VhbCAhPSBsaW5lKSB7IGxpbmVOID0gbGluZU5vKHZpc3VhbCk7IH1cbiAgcmV0dXJuIGVuZE9mTGluZSh0cnVlLCBjbSwgbGluZSwgbGluZU4sIC0xKVxufVxuZnVuY3Rpb24gbGluZVN0YXJ0U21hcnQoY20sIHBvcykge1xuICB2YXIgc3RhcnQgPSBsaW5lU3RhcnQoY20sIHBvcy5saW5lKTtcbiAgdmFyIGxpbmUgPSBnZXRMaW5lKGNtLmRvYywgc3RhcnQubGluZSk7XG4gIHZhciBvcmRlciA9IGdldE9yZGVyKGxpbmUsIGNtLmRvYy5kaXJlY3Rpb24pO1xuICBpZiAoIW9yZGVyIHx8IG9yZGVyWzBdLmxldmVsID09IDApIHtcbiAgICB2YXIgZmlyc3ROb25XUyA9IE1hdGgubWF4KDAsIGxpbmUudGV4dC5zZWFyY2goL1xcUy8pKTtcbiAgICB2YXIgaW5XUyA9IHBvcy5saW5lID09IHN0YXJ0LmxpbmUgJiYgcG9zLmNoIDw9IGZpcnN0Tm9uV1MgJiYgcG9zLmNoO1xuICAgIHJldHVybiBQb3Moc3RhcnQubGluZSwgaW5XUyA/IDAgOiBmaXJzdE5vbldTLCBzdGFydC5zdGlja3kpXG4gIH1cbiAgcmV0dXJuIHN0YXJ0XG59XG5cbi8vIFJ1biBhIGhhbmRsZXIgdGhhdCB3YXMgYm91bmQgdG8gYSBrZXkuXG5mdW5jdGlvbiBkb0hhbmRsZUJpbmRpbmcoY20sIGJvdW5kLCBkcm9wU2hpZnQpIHtcbiAgaWYgKHR5cGVvZiBib3VuZCA9PSBcInN0cmluZ1wiKSB7XG4gICAgYm91bmQgPSBjb21tYW5kc1tib3VuZF07XG4gICAgaWYgKCFib3VuZCkgeyByZXR1cm4gZmFsc2UgfVxuICB9XG4gIC8vIEVuc3VyZSBwcmV2aW91cyBpbnB1dCBoYXMgYmVlbiByZWFkLCBzbyB0aGF0IHRoZSBoYW5kbGVyIHNlZXMgYVxuICAvLyBjb25zaXN0ZW50IHZpZXcgb2YgdGhlIGRvY3VtZW50XG4gIGNtLmRpc3BsYXkuaW5wdXQuZW5zdXJlUG9sbGVkKCk7XG4gIHZhciBwcmV2U2hpZnQgPSBjbS5kaXNwbGF5LnNoaWZ0LCBkb25lID0gZmFsc2U7XG4gIHRyeSB7XG4gICAgaWYgKGNtLmlzUmVhZE9ubHkoKSkgeyBjbS5zdGF0ZS5zdXBwcmVzc0VkaXRzID0gdHJ1ZTsgfVxuICAgIGlmIChkcm9wU2hpZnQpIHsgY20uZGlzcGxheS5zaGlmdCA9IGZhbHNlOyB9XG4gICAgZG9uZSA9IGJvdW5kKGNtKSAhPSBQYXNzO1xuICB9IGZpbmFsbHkge1xuICAgIGNtLmRpc3BsYXkuc2hpZnQgPSBwcmV2U2hpZnQ7XG4gICAgY20uc3RhdGUuc3VwcHJlc3NFZGl0cyA9IGZhbHNlO1xuICB9XG4gIHJldHVybiBkb25lXG59XG5cbmZ1bmN0aW9uIGxvb2t1cEtleUZvckVkaXRvcihjbSwgbmFtZSwgaGFuZGxlKSB7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgY20uc3RhdGUua2V5TWFwcy5sZW5ndGg7IGkrKykge1xuICAgIHZhciByZXN1bHQgPSBsb29rdXBLZXkobmFtZSwgY20uc3RhdGUua2V5TWFwc1tpXSwgaGFuZGxlLCBjbSk7XG4gICAgaWYgKHJlc3VsdCkgeyByZXR1cm4gcmVzdWx0IH1cbiAgfVxuICByZXR1cm4gKGNtLm9wdGlvbnMuZXh0cmFLZXlzICYmIGxvb2t1cEtleShuYW1lLCBjbS5vcHRpb25zLmV4dHJhS2V5cywgaGFuZGxlLCBjbSkpXG4gICAgfHwgbG9va3VwS2V5KG5hbWUsIGNtLm9wdGlvbnMua2V5TWFwLCBoYW5kbGUsIGNtKVxufVxuXG4vLyBOb3RlIHRoYXQsIGRlc3BpdGUgdGhlIG5hbWUsIHRoaXMgZnVuY3Rpb24gaXMgYWxzbyB1c2VkIHRvIGNoZWNrXG4vLyBmb3IgYm91bmQgbW91c2UgY2xpY2tzLlxuXG52YXIgc3RvcFNlcSA9IG5ldyBEZWxheWVkO1xuXG5mdW5jdGlvbiBkaXNwYXRjaEtleShjbSwgbmFtZSwgZSwgaGFuZGxlKSB7XG4gIHZhciBzZXEgPSBjbS5zdGF0ZS5rZXlTZXE7XG4gIGlmIChzZXEpIHtcbiAgICBpZiAoaXNNb2RpZmllcktleShuYW1lKSkgeyByZXR1cm4gXCJoYW5kbGVkXCIgfVxuICAgIGlmICgvXFwnJC8udGVzdChuYW1lKSlcbiAgICAgIHsgY20uc3RhdGUua2V5U2VxID0gbnVsbDsgfVxuICAgIGVsc2VcbiAgICAgIHsgc3RvcFNlcS5zZXQoNTAsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKGNtLnN0YXRlLmtleVNlcSA9PSBzZXEpIHtcbiAgICAgICAgICBjbS5zdGF0ZS5rZXlTZXEgPSBudWxsO1xuICAgICAgICAgIGNtLmRpc3BsYXkuaW5wdXQucmVzZXQoKTtcbiAgICAgICAgfVxuICAgICAgfSk7IH1cbiAgICBpZiAoZGlzcGF0Y2hLZXlJbm5lcihjbSwgc2VxICsgXCIgXCIgKyBuYW1lLCBlLCBoYW5kbGUpKSB7IHJldHVybiB0cnVlIH1cbiAgfVxuICByZXR1cm4gZGlzcGF0Y2hLZXlJbm5lcihjbSwgbmFtZSwgZSwgaGFuZGxlKVxufVxuXG5mdW5jdGlvbiBkaXNwYXRjaEtleUlubmVyKGNtLCBuYW1lLCBlLCBoYW5kbGUpIHtcbiAgdmFyIHJlc3VsdCA9IGxvb2t1cEtleUZvckVkaXRvcihjbSwgbmFtZSwgaGFuZGxlKTtcblxuICBpZiAocmVzdWx0ID09IFwibXVsdGlcIilcbiAgICB7IGNtLnN0YXRlLmtleVNlcSA9IG5hbWU7IH1cbiAgaWYgKHJlc3VsdCA9PSBcImhhbmRsZWRcIilcbiAgICB7IHNpZ25hbExhdGVyKGNtLCBcImtleUhhbmRsZWRcIiwgY20sIG5hbWUsIGUpOyB9XG5cbiAgaWYgKHJlc3VsdCA9PSBcImhhbmRsZWRcIiB8fCByZXN1bHQgPT0gXCJtdWx0aVwiKSB7XG4gICAgZV9wcmV2ZW50RGVmYXVsdChlKTtcbiAgICByZXN0YXJ0QmxpbmsoY20pO1xuICB9XG5cbiAgcmV0dXJuICEhcmVzdWx0XG59XG5cbi8vIEhhbmRsZSBhIGtleSBmcm9tIHRoZSBrZXlkb3duIGV2ZW50LlxuZnVuY3Rpb24gaGFuZGxlS2V5QmluZGluZyhjbSwgZSkge1xuICB2YXIgbmFtZSA9IGtleU5hbWUoZSwgdHJ1ZSk7XG4gIGlmICghbmFtZSkgeyByZXR1cm4gZmFsc2UgfVxuXG4gIGlmIChlLnNoaWZ0S2V5ICYmICFjbS5zdGF0ZS5rZXlTZXEpIHtcbiAgICAvLyBGaXJzdCB0cnkgdG8gcmVzb2x2ZSBmdWxsIG5hbWUgKGluY2x1ZGluZyAnU2hpZnQtJykuIEZhaWxpbmdcbiAgICAvLyB0aGF0LCBzZWUgaWYgdGhlcmUgaXMgYSBjdXJzb3ItbW90aW9uIGNvbW1hbmQgKHN0YXJ0aW5nIHdpdGhcbiAgICAvLyAnZ28nKSBib3VuZCB0byB0aGUga2V5bmFtZSB3aXRob3V0ICdTaGlmdC0nLlxuICAgIHJldHVybiBkaXNwYXRjaEtleShjbSwgXCJTaGlmdC1cIiArIG5hbWUsIGUsIGZ1bmN0aW9uIChiKSB7IHJldHVybiBkb0hhbmRsZUJpbmRpbmcoY20sIGIsIHRydWUpOyB9KVxuICAgICAgICB8fCBkaXNwYXRjaEtleShjbSwgbmFtZSwgZSwgZnVuY3Rpb24gKGIpIHtcbiAgICAgICAgICAgICBpZiAodHlwZW9mIGIgPT0gXCJzdHJpbmdcIiA/IC9eZ29bQS1aXS8udGVzdChiKSA6IGIubW90aW9uKVxuICAgICAgICAgICAgICAgeyByZXR1cm4gZG9IYW5kbGVCaW5kaW5nKGNtLCBiKSB9XG4gICAgICAgICAgIH0pXG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIGRpc3BhdGNoS2V5KGNtLCBuYW1lLCBlLCBmdW5jdGlvbiAoYikgeyByZXR1cm4gZG9IYW5kbGVCaW5kaW5nKGNtLCBiKTsgfSlcbiAgfVxufVxuXG4vLyBIYW5kbGUgYSBrZXkgZnJvbSB0aGUga2V5cHJlc3MgZXZlbnRcbmZ1bmN0aW9uIGhhbmRsZUNoYXJCaW5kaW5nKGNtLCBlLCBjaCkge1xuICByZXR1cm4gZGlzcGF0Y2hLZXkoY20sIFwiJ1wiICsgY2ggKyBcIidcIiwgZSwgZnVuY3Rpb24gKGIpIHsgcmV0dXJuIGRvSGFuZGxlQmluZGluZyhjbSwgYiwgdHJ1ZSk7IH0pXG59XG5cbnZhciBsYXN0U3RvcHBlZEtleSA9IG51bGw7XG5mdW5jdGlvbiBvbktleURvd24oZSkge1xuICB2YXIgY20gPSB0aGlzO1xuICBjbS5jdXJPcC5mb2N1cyA9IGFjdGl2ZUVsdCgpO1xuICBpZiAoc2lnbmFsRE9NRXZlbnQoY20sIGUpKSB7IHJldHVybiB9XG4gIC8vIElFIGRvZXMgc3RyYW5nZSB0aGluZ3Mgd2l0aCBlc2NhcGUuXG4gIGlmIChpZSAmJiBpZV92ZXJzaW9uIDwgMTEgJiYgZS5rZXlDb2RlID09IDI3KSB7IGUucmV0dXJuVmFsdWUgPSBmYWxzZTsgfVxuICB2YXIgY29kZSA9IGUua2V5Q29kZTtcbiAgY20uZGlzcGxheS5zaGlmdCA9IGNvZGUgPT0gMTYgfHwgZS5zaGlmdEtleTtcbiAgdmFyIGhhbmRsZWQgPSBoYW5kbGVLZXlCaW5kaW5nKGNtLCBlKTtcbiAgaWYgKHByZXN0bykge1xuICAgIGxhc3RTdG9wcGVkS2V5ID0gaGFuZGxlZCA/IGNvZGUgOiBudWxsO1xuICAgIC8vIE9wZXJhIGhhcyBubyBjdXQgZXZlbnQuLi4gd2UgdHJ5IHRvIGF0IGxlYXN0IGNhdGNoIHRoZSBrZXkgY29tYm9cbiAgICBpZiAoIWhhbmRsZWQgJiYgY29kZSA9PSA4OCAmJiAhaGFzQ29weUV2ZW50ICYmIChtYWMgPyBlLm1ldGFLZXkgOiBlLmN0cmxLZXkpKVxuICAgICAgeyBjbS5yZXBsYWNlU2VsZWN0aW9uKFwiXCIsIG51bGwsIFwiY3V0XCIpOyB9XG4gIH1cblxuICAvLyBUdXJuIG1vdXNlIGludG8gY3Jvc3NoYWlyIHdoZW4gQWx0IGlzIGhlbGQgb24gTWFjLlxuICBpZiAoY29kZSA9PSAxOCAmJiAhL1xcYkNvZGVNaXJyb3ItY3Jvc3NoYWlyXFxiLy50ZXN0KGNtLmRpc3BsYXkubGluZURpdi5jbGFzc05hbWUpKVxuICAgIHsgc2hvd0Nyb3NzSGFpcihjbSk7IH1cbn1cblxuZnVuY3Rpb24gc2hvd0Nyb3NzSGFpcihjbSkge1xuICB2YXIgbGluZURpdiA9IGNtLmRpc3BsYXkubGluZURpdjtcbiAgYWRkQ2xhc3MobGluZURpdiwgXCJDb2RlTWlycm9yLWNyb3NzaGFpclwiKTtcblxuICBmdW5jdGlvbiB1cChlKSB7XG4gICAgaWYgKGUua2V5Q29kZSA9PSAxOCB8fCAhZS5hbHRLZXkpIHtcbiAgICAgIHJtQ2xhc3MobGluZURpdiwgXCJDb2RlTWlycm9yLWNyb3NzaGFpclwiKTtcbiAgICAgIG9mZihkb2N1bWVudCwgXCJrZXl1cFwiLCB1cCk7XG4gICAgICBvZmYoZG9jdW1lbnQsIFwibW91c2VvdmVyXCIsIHVwKTtcbiAgICB9XG4gIH1cbiAgb24oZG9jdW1lbnQsIFwia2V5dXBcIiwgdXApO1xuICBvbihkb2N1bWVudCwgXCJtb3VzZW92ZXJcIiwgdXApO1xufVxuXG5mdW5jdGlvbiBvbktleVVwKGUpIHtcbiAgaWYgKGUua2V5Q29kZSA9PSAxNikgeyB0aGlzLmRvYy5zZWwuc2hpZnQgPSBmYWxzZTsgfVxuICBzaWduYWxET01FdmVudCh0aGlzLCBlKTtcbn1cblxuZnVuY3Rpb24gb25LZXlQcmVzcyhlKSB7XG4gIHZhciBjbSA9IHRoaXM7XG4gIGlmIChldmVudEluV2lkZ2V0KGNtLmRpc3BsYXksIGUpIHx8IHNpZ25hbERPTUV2ZW50KGNtLCBlKSB8fCBlLmN0cmxLZXkgJiYgIWUuYWx0S2V5IHx8IG1hYyAmJiBlLm1ldGFLZXkpIHsgcmV0dXJuIH1cbiAgdmFyIGtleUNvZGUgPSBlLmtleUNvZGUsIGNoYXJDb2RlID0gZS5jaGFyQ29kZTtcbiAgaWYgKHByZXN0byAmJiBrZXlDb2RlID09IGxhc3RTdG9wcGVkS2V5KSB7bGFzdFN0b3BwZWRLZXkgPSBudWxsOyBlX3ByZXZlbnREZWZhdWx0KGUpOyByZXR1cm59XG4gIGlmICgocHJlc3RvICYmICghZS53aGljaCB8fCBlLndoaWNoIDwgMTApKSAmJiBoYW5kbGVLZXlCaW5kaW5nKGNtLCBlKSkgeyByZXR1cm4gfVxuICB2YXIgY2ggPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGNoYXJDb2RlID09IG51bGwgPyBrZXlDb2RlIDogY2hhckNvZGUpO1xuICAvLyBTb21lIGJyb3dzZXJzIGZpcmUga2V5cHJlc3MgZXZlbnRzIGZvciBiYWNrc3BhY2VcbiAgaWYgKGNoID09IFwiXFx4MDhcIikgeyByZXR1cm4gfVxuICBpZiAoaGFuZGxlQ2hhckJpbmRpbmcoY20sIGUsIGNoKSkgeyByZXR1cm4gfVxuICBjbS5kaXNwbGF5LmlucHV0Lm9uS2V5UHJlc3MoZSk7XG59XG5cbnZhciBET1VCTEVDTElDS19ERUxBWSA9IDQwMDtcblxudmFyIFBhc3RDbGljayA9IGZ1bmN0aW9uKHRpbWUsIHBvcywgYnV0dG9uKSB7XG4gIHRoaXMudGltZSA9IHRpbWU7XG4gIHRoaXMucG9zID0gcG9zO1xuICB0aGlzLmJ1dHRvbiA9IGJ1dHRvbjtcbn07XG5cblBhc3RDbGljay5wcm90b3R5cGUuY29tcGFyZSA9IGZ1bmN0aW9uICh0aW1lLCBwb3MsIGJ1dHRvbikge1xuICByZXR1cm4gdGhpcy50aW1lICsgRE9VQkxFQ0xJQ0tfREVMQVkgPiB0aW1lICYmXG4gICAgY21wKHBvcywgdGhpcy5wb3MpID09IDAgJiYgYnV0dG9uID09IHRoaXMuYnV0dG9uXG59O1xuXG52YXIgbGFzdENsaWNrO1xudmFyIGxhc3REb3VibGVDbGljaztcbmZ1bmN0aW9uIGNsaWNrUmVwZWF0KHBvcywgYnV0dG9uKSB7XG4gIHZhciBub3cgPSArbmV3IERhdGU7XG4gIGlmIChsYXN0RG91YmxlQ2xpY2sgJiYgbGFzdERvdWJsZUNsaWNrLmNvbXBhcmUobm93LCBwb3MsIGJ1dHRvbikpIHtcbiAgICBsYXN0Q2xpY2sgPSBsYXN0RG91YmxlQ2xpY2sgPSBudWxsO1xuICAgIHJldHVybiBcInRyaXBsZVwiXG4gIH0gZWxzZSBpZiAobGFzdENsaWNrICYmIGxhc3RDbGljay5jb21wYXJlKG5vdywgcG9zLCBidXR0b24pKSB7XG4gICAgbGFzdERvdWJsZUNsaWNrID0gbmV3IFBhc3RDbGljayhub3csIHBvcywgYnV0dG9uKTtcbiAgICBsYXN0Q2xpY2sgPSBudWxsO1xuICAgIHJldHVybiBcImRvdWJsZVwiXG4gIH0gZWxzZSB7XG4gICAgbGFzdENsaWNrID0gbmV3IFBhc3RDbGljayhub3csIHBvcywgYnV0dG9uKTtcbiAgICBsYXN0RG91YmxlQ2xpY2sgPSBudWxsO1xuICAgIHJldHVybiBcInNpbmdsZVwiXG4gIH1cbn1cblxuLy8gQSBtb3VzZSBkb3duIGNhbiBiZSBhIHNpbmdsZSBjbGljaywgZG91YmxlIGNsaWNrLCB0cmlwbGUgY2xpY2ssXG4vLyBzdGFydCBvZiBzZWxlY3Rpb24gZHJhZywgc3RhcnQgb2YgdGV4dCBkcmFnLCBuZXcgY3Vyc29yXG4vLyAoY3RybC1jbGljayksIHJlY3RhbmdsZSBkcmFnIChhbHQtZHJhZyksIG9yIHh3aW5cbi8vIG1pZGRsZS1jbGljay1wYXN0ZS4gT3IgaXQgbWlnaHQgYmUgYSBjbGljayBvbiBzb21ldGhpbmcgd2Ugc2hvdWxkXG4vLyBub3QgaW50ZXJmZXJlIHdpdGgsIHN1Y2ggYXMgYSBzY3JvbGxiYXIgb3Igd2lkZ2V0LlxuZnVuY3Rpb24gb25Nb3VzZURvd24oZSkge1xuICB2YXIgY20gPSB0aGlzLCBkaXNwbGF5ID0gY20uZGlzcGxheTtcbiAgaWYgKHNpZ25hbERPTUV2ZW50KGNtLCBlKSB8fCBkaXNwbGF5LmFjdGl2ZVRvdWNoICYmIGRpc3BsYXkuaW5wdXQuc3VwcG9ydHNUb3VjaCgpKSB7IHJldHVybiB9XG4gIGRpc3BsYXkuaW5wdXQuZW5zdXJlUG9sbGVkKCk7XG4gIGRpc3BsYXkuc2hpZnQgPSBlLnNoaWZ0S2V5O1xuXG4gIGlmIChldmVudEluV2lkZ2V0KGRpc3BsYXksIGUpKSB7XG4gICAgaWYgKCF3ZWJraXQpIHtcbiAgICAgIC8vIEJyaWVmbHkgdHVybiBvZmYgZHJhZ2dhYmlsaXR5LCB0byBhbGxvdyB3aWRnZXRzIHRvIGRvXG4gICAgICAvLyBub3JtYWwgZHJhZ2dpbmcgdGhpbmdzLlxuICAgICAgZGlzcGxheS5zY3JvbGxlci5kcmFnZ2FibGUgPSBmYWxzZTtcbiAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24gKCkgeyByZXR1cm4gZGlzcGxheS5zY3JvbGxlci5kcmFnZ2FibGUgPSB0cnVlOyB9LCAxMDApO1xuICAgIH1cbiAgICByZXR1cm5cbiAgfVxuICBpZiAoY2xpY2tJbkd1dHRlcihjbSwgZSkpIHsgcmV0dXJuIH1cbiAgdmFyIHBvcyA9IHBvc0Zyb21Nb3VzZShjbSwgZSksIGJ1dHRvbiA9IGVfYnV0dG9uKGUpLCByZXBlYXQgPSBwb3MgPyBjbGlja1JlcGVhdChwb3MsIGJ1dHRvbikgOiBcInNpbmdsZVwiO1xuICB3aW5kb3cuZm9jdXMoKTtcblxuICAvLyAjMzI2MTogbWFrZSBzdXJlLCB0aGF0IHdlJ3JlIG5vdCBzdGFydGluZyBhIHNlY29uZCBzZWxlY3Rpb25cbiAgaWYgKGJ1dHRvbiA9PSAxICYmIGNtLnN0YXRlLnNlbGVjdGluZ1RleHQpXG4gICAgeyBjbS5zdGF0ZS5zZWxlY3RpbmdUZXh0KGUpOyB9XG5cbiAgaWYgKHBvcyAmJiBoYW5kbGVNYXBwZWRCdXR0b24oY20sIGJ1dHRvbiwgcG9zLCByZXBlYXQsIGUpKSB7IHJldHVybiB9XG5cbiAgaWYgKGJ1dHRvbiA9PSAxKSB7XG4gICAgaWYgKHBvcykgeyBsZWZ0QnV0dG9uRG93bihjbSwgcG9zLCByZXBlYXQsIGUpOyB9XG4gICAgZWxzZSBpZiAoZV90YXJnZXQoZSkgPT0gZGlzcGxheS5zY3JvbGxlcikgeyBlX3ByZXZlbnREZWZhdWx0KGUpOyB9XG4gIH0gZWxzZSBpZiAoYnV0dG9uID09IDIpIHtcbiAgICBpZiAocG9zKSB7IGV4dGVuZFNlbGVjdGlvbihjbS5kb2MsIHBvcyk7IH1cbiAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHsgcmV0dXJuIGRpc3BsYXkuaW5wdXQuZm9jdXMoKTsgfSwgMjApO1xuICB9IGVsc2UgaWYgKGJ1dHRvbiA9PSAzKSB7XG4gICAgaWYgKGNhcHR1cmVSaWdodENsaWNrKSB7IG9uQ29udGV4dE1lbnUoY20sIGUpOyB9XG4gICAgZWxzZSB7IGRlbGF5Qmx1ckV2ZW50KGNtKTsgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGhhbmRsZU1hcHBlZEJ1dHRvbihjbSwgYnV0dG9uLCBwb3MsIHJlcGVhdCwgZXZlbnQpIHtcbiAgdmFyIG5hbWUgPSBcIkNsaWNrXCI7XG4gIGlmIChyZXBlYXQgPT0gXCJkb3VibGVcIikgeyBuYW1lID0gXCJEb3VibGVcIiArIG5hbWU7IH1cbiAgZWxzZSBpZiAocmVwZWF0ID09IFwidHJpcGxlXCIpIHsgbmFtZSA9IFwiVHJpcGxlXCIgKyBuYW1lOyB9XG4gIG5hbWUgPSAoYnV0dG9uID09IDEgPyBcIkxlZnRcIiA6IGJ1dHRvbiA9PSAyID8gXCJNaWRkbGVcIiA6IFwiUmlnaHRcIikgKyBuYW1lO1xuXG4gIHJldHVybiBkaXNwYXRjaEtleShjbSwgIGFkZE1vZGlmaWVyTmFtZXMobmFtZSwgZXZlbnQpLCBldmVudCwgZnVuY3Rpb24gKGJvdW5kKSB7XG4gICAgaWYgKHR5cGVvZiBib3VuZCA9PSBcInN0cmluZ1wiKSB7IGJvdW5kID0gY29tbWFuZHNbYm91bmRdOyB9XG4gICAgaWYgKCFib3VuZCkgeyByZXR1cm4gZmFsc2UgfVxuICAgIHZhciBkb25lID0gZmFsc2U7XG4gICAgdHJ5IHtcbiAgICAgIGlmIChjbS5pc1JlYWRPbmx5KCkpIHsgY20uc3RhdGUuc3VwcHJlc3NFZGl0cyA9IHRydWU7IH1cbiAgICAgIGRvbmUgPSBib3VuZChjbSwgcG9zKSAhPSBQYXNzO1xuICAgIH0gZmluYWxseSB7XG4gICAgICBjbS5zdGF0ZS5zdXBwcmVzc0VkaXRzID0gZmFsc2U7XG4gICAgfVxuICAgIHJldHVybiBkb25lXG4gIH0pXG59XG5cbmZ1bmN0aW9uIGNvbmZpZ3VyZU1vdXNlKGNtLCByZXBlYXQsIGV2ZW50KSB7XG4gIHZhciBvcHRpb24gPSBjbS5nZXRPcHRpb24oXCJjb25maWd1cmVNb3VzZVwiKTtcbiAgdmFyIHZhbHVlID0gb3B0aW9uID8gb3B0aW9uKGNtLCByZXBlYXQsIGV2ZW50KSA6IHt9O1xuICBpZiAodmFsdWUudW5pdCA9PSBudWxsKSB7XG4gICAgdmFyIHJlY3QgPSBjaHJvbWVPUyA/IGV2ZW50LnNoaWZ0S2V5ICYmIGV2ZW50Lm1ldGFLZXkgOiBldmVudC5hbHRLZXk7XG4gICAgdmFsdWUudW5pdCA9IHJlY3QgPyBcInJlY3RhbmdsZVwiIDogcmVwZWF0ID09IFwic2luZ2xlXCIgPyBcImNoYXJcIiA6IHJlcGVhdCA9PSBcImRvdWJsZVwiID8gXCJ3b3JkXCIgOiBcImxpbmVcIjtcbiAgfVxuICBpZiAodmFsdWUuZXh0ZW5kID09IG51bGwgfHwgY20uZG9jLmV4dGVuZCkgeyB2YWx1ZS5leHRlbmQgPSBjbS5kb2MuZXh0ZW5kIHx8IGV2ZW50LnNoaWZ0S2V5OyB9XG4gIGlmICh2YWx1ZS5hZGROZXcgPT0gbnVsbCkgeyB2YWx1ZS5hZGROZXcgPSBtYWMgPyBldmVudC5tZXRhS2V5IDogZXZlbnQuY3RybEtleTsgfVxuICBpZiAodmFsdWUubW92ZU9uRHJhZyA9PSBudWxsKSB7IHZhbHVlLm1vdmVPbkRyYWcgPSAhKG1hYyA/IGV2ZW50LmFsdEtleSA6IGV2ZW50LmN0cmxLZXkpOyB9XG4gIHJldHVybiB2YWx1ZVxufVxuXG5mdW5jdGlvbiBsZWZ0QnV0dG9uRG93bihjbSwgcG9zLCByZXBlYXQsIGV2ZW50KSB7XG4gIGlmIChpZSkgeyBzZXRUaW1lb3V0KGJpbmQoZW5zdXJlRm9jdXMsIGNtKSwgMCk7IH1cbiAgZWxzZSB7IGNtLmN1ck9wLmZvY3VzID0gYWN0aXZlRWx0KCk7IH1cblxuICB2YXIgYmVoYXZpb3IgPSBjb25maWd1cmVNb3VzZShjbSwgcmVwZWF0LCBldmVudCk7XG5cbiAgdmFyIHNlbCA9IGNtLmRvYy5zZWwsIGNvbnRhaW5lZDtcbiAgaWYgKGNtLm9wdGlvbnMuZHJhZ0Ryb3AgJiYgZHJhZ0FuZERyb3AgJiYgIWNtLmlzUmVhZE9ubHkoKSAmJlxuICAgICAgcmVwZWF0ID09IFwic2luZ2xlXCIgJiYgKGNvbnRhaW5lZCA9IHNlbC5jb250YWlucyhwb3MpKSA+IC0xICYmXG4gICAgICAoY21wKChjb250YWluZWQgPSBzZWwucmFuZ2VzW2NvbnRhaW5lZF0pLmZyb20oKSwgcG9zKSA8IDAgfHwgcG9zLnhSZWwgPiAwKSAmJlxuICAgICAgKGNtcChjb250YWluZWQudG8oKSwgcG9zKSA+IDAgfHwgcG9zLnhSZWwgPCAwKSlcbiAgICB7IGxlZnRCdXR0b25TdGFydERyYWcoY20sIGV2ZW50LCBwb3MsIGJlaGF2aW9yKTsgfVxuICBlbHNlXG4gICAgeyBsZWZ0QnV0dG9uU2VsZWN0KGNtLCBldmVudCwgcG9zLCBiZWhhdmlvcik7IH1cbn1cblxuLy8gU3RhcnQgYSB0ZXh0IGRyYWcuIFdoZW4gaXQgZW5kcywgc2VlIGlmIGFueSBkcmFnZ2luZyBhY3R1YWxseVxuLy8gaGFwcGVuLCBhbmQgdHJlYXQgYXMgYSBjbGljayBpZiBpdCBkaWRuJ3QuXG5mdW5jdGlvbiBsZWZ0QnV0dG9uU3RhcnREcmFnKGNtLCBldmVudCwgcG9zLCBiZWhhdmlvcikge1xuICB2YXIgZGlzcGxheSA9IGNtLmRpc3BsYXksIG1vdmVkID0gZmFsc2U7XG4gIHZhciBkcmFnRW5kID0gb3BlcmF0aW9uKGNtLCBmdW5jdGlvbiAoZSkge1xuICAgIGlmICh3ZWJraXQpIHsgZGlzcGxheS5zY3JvbGxlci5kcmFnZ2FibGUgPSBmYWxzZTsgfVxuICAgIGNtLnN0YXRlLmRyYWdnaW5nVGV4dCA9IGZhbHNlO1xuICAgIG9mZihkaXNwbGF5LndyYXBwZXIub3duZXJEb2N1bWVudCwgXCJtb3VzZXVwXCIsIGRyYWdFbmQpO1xuICAgIG9mZihkaXNwbGF5LndyYXBwZXIub3duZXJEb2N1bWVudCwgXCJtb3VzZW1vdmVcIiwgbW91c2VNb3ZlKTtcbiAgICBvZmYoZGlzcGxheS5zY3JvbGxlciwgXCJkcmFnc3RhcnRcIiwgZHJhZ1N0YXJ0KTtcbiAgICBvZmYoZGlzcGxheS5zY3JvbGxlciwgXCJkcm9wXCIsIGRyYWdFbmQpO1xuICAgIGlmICghbW92ZWQpIHtcbiAgICAgIGVfcHJldmVudERlZmF1bHQoZSk7XG4gICAgICBpZiAoIWJlaGF2aW9yLmFkZE5ldylcbiAgICAgICAgeyBleHRlbmRTZWxlY3Rpb24oY20uZG9jLCBwb3MsIG51bGwsIG51bGwsIGJlaGF2aW9yLmV4dGVuZCk7IH1cbiAgICAgIC8vIFdvcmsgYXJvdW5kIHVuZXhwbGFpbmFibGUgZm9jdXMgcHJvYmxlbSBpbiBJRTkgKCMyMTI3KSBhbmQgQ2hyb21lICgjMzA4MSlcbiAgICAgIGlmICh3ZWJraXQgfHwgaWUgJiYgaWVfdmVyc2lvbiA9PSA5KVxuICAgICAgICB7IHNldFRpbWVvdXQoZnVuY3Rpb24gKCkge2Rpc3BsYXkud3JhcHBlci5vd25lckRvY3VtZW50LmJvZHkuZm9jdXMoKTsgZGlzcGxheS5pbnB1dC5mb2N1cygpO30sIDIwKTsgfVxuICAgICAgZWxzZVxuICAgICAgICB7IGRpc3BsYXkuaW5wdXQuZm9jdXMoKTsgfVxuICAgIH1cbiAgfSk7XG4gIHZhciBtb3VzZU1vdmUgPSBmdW5jdGlvbihlMikge1xuICAgIG1vdmVkID0gbW92ZWQgfHwgTWF0aC5hYnMoZXZlbnQuY2xpZW50WCAtIGUyLmNsaWVudFgpICsgTWF0aC5hYnMoZXZlbnQuY2xpZW50WSAtIGUyLmNsaWVudFkpID49IDEwO1xuICB9O1xuICB2YXIgZHJhZ1N0YXJ0ID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gbW92ZWQgPSB0cnVlOyB9O1xuICAvLyBMZXQgdGhlIGRyYWcgaGFuZGxlciBoYW5kbGUgdGhpcy5cbiAgaWYgKHdlYmtpdCkgeyBkaXNwbGF5LnNjcm9sbGVyLmRyYWdnYWJsZSA9IHRydWU7IH1cbiAgY20uc3RhdGUuZHJhZ2dpbmdUZXh0ID0gZHJhZ0VuZDtcbiAgZHJhZ0VuZC5jb3B5ID0gIWJlaGF2aW9yLm1vdmVPbkRyYWc7XG4gIC8vIElFJ3MgYXBwcm9hY2ggdG8gZHJhZ2dhYmxlXG4gIGlmIChkaXNwbGF5LnNjcm9sbGVyLmRyYWdEcm9wKSB7IGRpc3BsYXkuc2Nyb2xsZXIuZHJhZ0Ryb3AoKTsgfVxuICBvbihkaXNwbGF5LndyYXBwZXIub3duZXJEb2N1bWVudCwgXCJtb3VzZXVwXCIsIGRyYWdFbmQpO1xuICBvbihkaXNwbGF5LndyYXBwZXIub3duZXJEb2N1bWVudCwgXCJtb3VzZW1vdmVcIiwgbW91c2VNb3ZlKTtcbiAgb24oZGlzcGxheS5zY3JvbGxlciwgXCJkcmFnc3RhcnRcIiwgZHJhZ1N0YXJ0KTtcbiAgb24oZGlzcGxheS5zY3JvbGxlciwgXCJkcm9wXCIsIGRyYWdFbmQpO1xuXG4gIGRlbGF5Qmx1ckV2ZW50KGNtKTtcbiAgc2V0VGltZW91dChmdW5jdGlvbiAoKSB7IHJldHVybiBkaXNwbGF5LmlucHV0LmZvY3VzKCk7IH0sIDIwKTtcbn1cblxuZnVuY3Rpb24gcmFuZ2VGb3JVbml0KGNtLCBwb3MsIHVuaXQpIHtcbiAgaWYgKHVuaXQgPT0gXCJjaGFyXCIpIHsgcmV0dXJuIG5ldyBSYW5nZShwb3MsIHBvcykgfVxuICBpZiAodW5pdCA9PSBcIndvcmRcIikgeyByZXR1cm4gY20uZmluZFdvcmRBdChwb3MpIH1cbiAgaWYgKHVuaXQgPT0gXCJsaW5lXCIpIHsgcmV0dXJuIG5ldyBSYW5nZShQb3MocG9zLmxpbmUsIDApLCBjbGlwUG9zKGNtLmRvYywgUG9zKHBvcy5saW5lICsgMSwgMCkpKSB9XG4gIHZhciByZXN1bHQgPSB1bml0KGNtLCBwb3MpO1xuICByZXR1cm4gbmV3IFJhbmdlKHJlc3VsdC5mcm9tLCByZXN1bHQudG8pXG59XG5cbi8vIE5vcm1hbCBzZWxlY3Rpb24sIGFzIG9wcG9zZWQgdG8gdGV4dCBkcmFnZ2luZy5cbmZ1bmN0aW9uIGxlZnRCdXR0b25TZWxlY3QoY20sIGV2ZW50LCBzdGFydCwgYmVoYXZpb3IpIHtcbiAgdmFyIGRpc3BsYXkgPSBjbS5kaXNwbGF5LCBkb2MgPSBjbS5kb2M7XG4gIGVfcHJldmVudERlZmF1bHQoZXZlbnQpO1xuXG4gIHZhciBvdXJSYW5nZSwgb3VySW5kZXgsIHN0YXJ0U2VsID0gZG9jLnNlbCwgcmFuZ2VzID0gc3RhcnRTZWwucmFuZ2VzO1xuICBpZiAoYmVoYXZpb3IuYWRkTmV3ICYmICFiZWhhdmlvci5leHRlbmQpIHtcbiAgICBvdXJJbmRleCA9IGRvYy5zZWwuY29udGFpbnMoc3RhcnQpO1xuICAgIGlmIChvdXJJbmRleCA+IC0xKVxuICAgICAgeyBvdXJSYW5nZSA9IHJhbmdlc1tvdXJJbmRleF07IH1cbiAgICBlbHNlXG4gICAgICB7IG91clJhbmdlID0gbmV3IFJhbmdlKHN0YXJ0LCBzdGFydCk7IH1cbiAgfSBlbHNlIHtcbiAgICBvdXJSYW5nZSA9IGRvYy5zZWwucHJpbWFyeSgpO1xuICAgIG91ckluZGV4ID0gZG9jLnNlbC5wcmltSW5kZXg7XG4gIH1cblxuICBpZiAoYmVoYXZpb3IudW5pdCA9PSBcInJlY3RhbmdsZVwiKSB7XG4gICAgaWYgKCFiZWhhdmlvci5hZGROZXcpIHsgb3VyUmFuZ2UgPSBuZXcgUmFuZ2Uoc3RhcnQsIHN0YXJ0KTsgfVxuICAgIHN0YXJ0ID0gcG9zRnJvbU1vdXNlKGNtLCBldmVudCwgdHJ1ZSwgdHJ1ZSk7XG4gICAgb3VySW5kZXggPSAtMTtcbiAgfSBlbHNlIHtcbiAgICB2YXIgcmFuZ2UkJDEgPSByYW5nZUZvclVuaXQoY20sIHN0YXJ0LCBiZWhhdmlvci51bml0KTtcbiAgICBpZiAoYmVoYXZpb3IuZXh0ZW5kKVxuICAgICAgeyBvdXJSYW5nZSA9IGV4dGVuZFJhbmdlKG91clJhbmdlLCByYW5nZSQkMS5hbmNob3IsIHJhbmdlJCQxLmhlYWQsIGJlaGF2aW9yLmV4dGVuZCk7IH1cbiAgICBlbHNlXG4gICAgICB7IG91clJhbmdlID0gcmFuZ2UkJDE7IH1cbiAgfVxuXG4gIGlmICghYmVoYXZpb3IuYWRkTmV3KSB7XG4gICAgb3VySW5kZXggPSAwO1xuICAgIHNldFNlbGVjdGlvbihkb2MsIG5ldyBTZWxlY3Rpb24oW291clJhbmdlXSwgMCksIHNlbF9tb3VzZSk7XG4gICAgc3RhcnRTZWwgPSBkb2Muc2VsO1xuICB9IGVsc2UgaWYgKG91ckluZGV4ID09IC0xKSB7XG4gICAgb3VySW5kZXggPSByYW5nZXMubGVuZ3RoO1xuICAgIHNldFNlbGVjdGlvbihkb2MsIG5vcm1hbGl6ZVNlbGVjdGlvbihyYW5nZXMuY29uY2F0KFtvdXJSYW5nZV0pLCBvdXJJbmRleCksXG4gICAgICAgICAgICAgICAgIHtzY3JvbGw6IGZhbHNlLCBvcmlnaW46IFwiKm1vdXNlXCJ9KTtcbiAgfSBlbHNlIGlmIChyYW5nZXMubGVuZ3RoID4gMSAmJiByYW5nZXNbb3VySW5kZXhdLmVtcHR5KCkgJiYgYmVoYXZpb3IudW5pdCA9PSBcImNoYXJcIiAmJiAhYmVoYXZpb3IuZXh0ZW5kKSB7XG4gICAgc2V0U2VsZWN0aW9uKGRvYywgbm9ybWFsaXplU2VsZWN0aW9uKHJhbmdlcy5zbGljZSgwLCBvdXJJbmRleCkuY29uY2F0KHJhbmdlcy5zbGljZShvdXJJbmRleCArIDEpKSwgMCksXG4gICAgICAgICAgICAgICAgIHtzY3JvbGw6IGZhbHNlLCBvcmlnaW46IFwiKm1vdXNlXCJ9KTtcbiAgICBzdGFydFNlbCA9IGRvYy5zZWw7XG4gIH0gZWxzZSB7XG4gICAgcmVwbGFjZU9uZVNlbGVjdGlvbihkb2MsIG91ckluZGV4LCBvdXJSYW5nZSwgc2VsX21vdXNlKTtcbiAgfVxuXG4gIHZhciBsYXN0UG9zID0gc3RhcnQ7XG4gIGZ1bmN0aW9uIGV4dGVuZFRvKHBvcykge1xuICAgIGlmIChjbXAobGFzdFBvcywgcG9zKSA9PSAwKSB7IHJldHVybiB9XG4gICAgbGFzdFBvcyA9IHBvcztcblxuICAgIGlmIChiZWhhdmlvci51bml0ID09IFwicmVjdGFuZ2xlXCIpIHtcbiAgICAgIHZhciByYW5nZXMgPSBbXSwgdGFiU2l6ZSA9IGNtLm9wdGlvbnMudGFiU2l6ZTtcbiAgICAgIHZhciBzdGFydENvbCA9IGNvdW50Q29sdW1uKGdldExpbmUoZG9jLCBzdGFydC5saW5lKS50ZXh0LCBzdGFydC5jaCwgdGFiU2l6ZSk7XG4gICAgICB2YXIgcG9zQ29sID0gY291bnRDb2x1bW4oZ2V0TGluZShkb2MsIHBvcy5saW5lKS50ZXh0LCBwb3MuY2gsIHRhYlNpemUpO1xuICAgICAgdmFyIGxlZnQgPSBNYXRoLm1pbihzdGFydENvbCwgcG9zQ29sKSwgcmlnaHQgPSBNYXRoLm1heChzdGFydENvbCwgcG9zQ29sKTtcbiAgICAgIGZvciAodmFyIGxpbmUgPSBNYXRoLm1pbihzdGFydC5saW5lLCBwb3MubGluZSksIGVuZCA9IE1hdGgubWluKGNtLmxhc3RMaW5lKCksIE1hdGgubWF4KHN0YXJ0LmxpbmUsIHBvcy5saW5lKSk7XG4gICAgICAgICAgIGxpbmUgPD0gZW5kOyBsaW5lKyspIHtcbiAgICAgICAgdmFyIHRleHQgPSBnZXRMaW5lKGRvYywgbGluZSkudGV4dCwgbGVmdFBvcyA9IGZpbmRDb2x1bW4odGV4dCwgbGVmdCwgdGFiU2l6ZSk7XG4gICAgICAgIGlmIChsZWZ0ID09IHJpZ2h0KVxuICAgICAgICAgIHsgcmFuZ2VzLnB1c2gobmV3IFJhbmdlKFBvcyhsaW5lLCBsZWZ0UG9zKSwgUG9zKGxpbmUsIGxlZnRQb3MpKSk7IH1cbiAgICAgICAgZWxzZSBpZiAodGV4dC5sZW5ndGggPiBsZWZ0UG9zKVxuICAgICAgICAgIHsgcmFuZ2VzLnB1c2gobmV3IFJhbmdlKFBvcyhsaW5lLCBsZWZ0UG9zKSwgUG9zKGxpbmUsIGZpbmRDb2x1bW4odGV4dCwgcmlnaHQsIHRhYlNpemUpKSkpOyB9XG4gICAgICB9XG4gICAgICBpZiAoIXJhbmdlcy5sZW5ndGgpIHsgcmFuZ2VzLnB1c2gobmV3IFJhbmdlKHN0YXJ0LCBzdGFydCkpOyB9XG4gICAgICBzZXRTZWxlY3Rpb24oZG9jLCBub3JtYWxpemVTZWxlY3Rpb24oc3RhcnRTZWwucmFuZ2VzLnNsaWNlKDAsIG91ckluZGV4KS5jb25jYXQocmFuZ2VzKSwgb3VySW5kZXgpLFxuICAgICAgICAgICAgICAgICAgIHtvcmlnaW46IFwiKm1vdXNlXCIsIHNjcm9sbDogZmFsc2V9KTtcbiAgICAgIGNtLnNjcm9sbEludG9WaWV3KHBvcyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciBvbGRSYW5nZSA9IG91clJhbmdlO1xuICAgICAgdmFyIHJhbmdlJCQxID0gcmFuZ2VGb3JVbml0KGNtLCBwb3MsIGJlaGF2aW9yLnVuaXQpO1xuICAgICAgdmFyIGFuY2hvciA9IG9sZFJhbmdlLmFuY2hvciwgaGVhZDtcbiAgICAgIGlmIChjbXAocmFuZ2UkJDEuYW5jaG9yLCBhbmNob3IpID4gMCkge1xuICAgICAgICBoZWFkID0gcmFuZ2UkJDEuaGVhZDtcbiAgICAgICAgYW5jaG9yID0gbWluUG9zKG9sZFJhbmdlLmZyb20oKSwgcmFuZ2UkJDEuYW5jaG9yKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGhlYWQgPSByYW5nZSQkMS5hbmNob3I7XG4gICAgICAgIGFuY2hvciA9IG1heFBvcyhvbGRSYW5nZS50bygpLCByYW5nZSQkMS5oZWFkKTtcbiAgICAgIH1cbiAgICAgIHZhciByYW5nZXMkMSA9IHN0YXJ0U2VsLnJhbmdlcy5zbGljZSgwKTtcbiAgICAgIHJhbmdlcyQxW291ckluZGV4XSA9IGJpZGlTaW1wbGlmeShjbSwgbmV3IFJhbmdlKGNsaXBQb3MoZG9jLCBhbmNob3IpLCBoZWFkKSk7XG4gICAgICBzZXRTZWxlY3Rpb24oZG9jLCBub3JtYWxpemVTZWxlY3Rpb24ocmFuZ2VzJDEsIG91ckluZGV4KSwgc2VsX21vdXNlKTtcbiAgICB9XG4gIH1cblxuICB2YXIgZWRpdG9yU2l6ZSA9IGRpc3BsYXkud3JhcHBlci5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgLy8gVXNlZCB0byBlbnN1cmUgdGltZW91dCByZS10cmllcyBkb24ndCBmaXJlIHdoZW4gYW5vdGhlciBleHRlbmRcbiAgLy8gaGFwcGVuZWQgaW4gdGhlIG1lYW50aW1lIChjbGVhclRpbWVvdXQgaXNuJ3QgcmVsaWFibGUgLS0gYXRcbiAgLy8gbGVhc3Qgb24gQ2hyb21lLCB0aGUgdGltZW91dHMgc3RpbGwgaGFwcGVuIGV2ZW4gd2hlbiBjbGVhcmVkLFxuICAvLyBpZiB0aGUgY2xlYXIgaGFwcGVucyBhZnRlciB0aGVpciBzY2hlZHVsZWQgZmlyaW5nIHRpbWUpLlxuICB2YXIgY291bnRlciA9IDA7XG5cbiAgZnVuY3Rpb24gZXh0ZW5kKGUpIHtcbiAgICB2YXIgY3VyQ291bnQgPSArK2NvdW50ZXI7XG4gICAgdmFyIGN1ciA9IHBvc0Zyb21Nb3VzZShjbSwgZSwgdHJ1ZSwgYmVoYXZpb3IudW5pdCA9PSBcInJlY3RhbmdsZVwiKTtcbiAgICBpZiAoIWN1cikgeyByZXR1cm4gfVxuICAgIGlmIChjbXAoY3VyLCBsYXN0UG9zKSAhPSAwKSB7XG4gICAgICBjbS5jdXJPcC5mb2N1cyA9IGFjdGl2ZUVsdCgpO1xuICAgICAgZXh0ZW5kVG8oY3VyKTtcbiAgICAgIHZhciB2aXNpYmxlID0gdmlzaWJsZUxpbmVzKGRpc3BsYXksIGRvYyk7XG4gICAgICBpZiAoY3VyLmxpbmUgPj0gdmlzaWJsZS50byB8fCBjdXIubGluZSA8IHZpc2libGUuZnJvbSlcbiAgICAgICAgeyBzZXRUaW1lb3V0KG9wZXJhdGlvbihjbSwgZnVuY3Rpb24gKCkge2lmIChjb3VudGVyID09IGN1ckNvdW50KSB7IGV4dGVuZChlKTsgfX0pLCAxNTApOyB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciBvdXRzaWRlID0gZS5jbGllbnRZIDwgZWRpdG9yU2l6ZS50b3AgPyAtMjAgOiBlLmNsaWVudFkgPiBlZGl0b3JTaXplLmJvdHRvbSA/IDIwIDogMDtcbiAgICAgIGlmIChvdXRzaWRlKSB7IHNldFRpbWVvdXQob3BlcmF0aW9uKGNtLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmIChjb3VudGVyICE9IGN1ckNvdW50KSB7IHJldHVybiB9XG4gICAgICAgIGRpc3BsYXkuc2Nyb2xsZXIuc2Nyb2xsVG9wICs9IG91dHNpZGU7XG4gICAgICAgIGV4dGVuZChlKTtcbiAgICAgIH0pLCA1MCk7IH1cbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBkb25lKGUpIHtcbiAgICBjbS5zdGF0ZS5zZWxlY3RpbmdUZXh0ID0gZmFsc2U7XG4gICAgY291bnRlciA9IEluZmluaXR5O1xuICAgIGVfcHJldmVudERlZmF1bHQoZSk7XG4gICAgZGlzcGxheS5pbnB1dC5mb2N1cygpO1xuICAgIG9mZihkaXNwbGF5LndyYXBwZXIub3duZXJEb2N1bWVudCwgXCJtb3VzZW1vdmVcIiwgbW92ZSk7XG4gICAgb2ZmKGRpc3BsYXkud3JhcHBlci5vd25lckRvY3VtZW50LCBcIm1vdXNldXBcIiwgdXApO1xuICAgIGRvYy5oaXN0b3J5Lmxhc3RTZWxPcmlnaW4gPSBudWxsO1xuICB9XG5cbiAgdmFyIG1vdmUgPSBvcGVyYXRpb24oY20sIGZ1bmN0aW9uIChlKSB7XG4gICAgaWYgKGUuYnV0dG9ucyA9PT0gMCB8fCAhZV9idXR0b24oZSkpIHsgZG9uZShlKTsgfVxuICAgIGVsc2UgeyBleHRlbmQoZSk7IH1cbiAgfSk7XG4gIHZhciB1cCA9IG9wZXJhdGlvbihjbSwgZG9uZSk7XG4gIGNtLnN0YXRlLnNlbGVjdGluZ1RleHQgPSB1cDtcbiAgb24oZGlzcGxheS53cmFwcGVyLm93bmVyRG9jdW1lbnQsIFwibW91c2Vtb3ZlXCIsIG1vdmUpO1xuICBvbihkaXNwbGF5LndyYXBwZXIub3duZXJEb2N1bWVudCwgXCJtb3VzZXVwXCIsIHVwKTtcbn1cblxuLy8gVXNlZCB3aGVuIG1vdXNlLXNlbGVjdGluZyB0byBhZGp1c3QgdGhlIGFuY2hvciB0byB0aGUgcHJvcGVyIHNpZGVcbi8vIG9mIGEgYmlkaSBqdW1wIGRlcGVuZGluZyBvbiB0aGUgdmlzdWFsIHBvc2l0aW9uIG9mIHRoZSBoZWFkLlxuZnVuY3Rpb24gYmlkaVNpbXBsaWZ5KGNtLCByYW5nZSQkMSkge1xuICB2YXIgYW5jaG9yID0gcmFuZ2UkJDEuYW5jaG9yO1xuICB2YXIgaGVhZCA9IHJhbmdlJCQxLmhlYWQ7XG4gIHZhciBhbmNob3JMaW5lID0gZ2V0TGluZShjbS5kb2MsIGFuY2hvci5saW5lKTtcbiAgaWYgKGNtcChhbmNob3IsIGhlYWQpID09IDAgJiYgYW5jaG9yLnN0aWNreSA9PSBoZWFkLnN0aWNreSkgeyByZXR1cm4gcmFuZ2UkJDEgfVxuICB2YXIgb3JkZXIgPSBnZXRPcmRlcihhbmNob3JMaW5lKTtcbiAgaWYgKCFvcmRlcikgeyByZXR1cm4gcmFuZ2UkJDEgfVxuICB2YXIgaW5kZXggPSBnZXRCaWRpUGFydEF0KG9yZGVyLCBhbmNob3IuY2gsIGFuY2hvci5zdGlja3kpLCBwYXJ0ID0gb3JkZXJbaW5kZXhdO1xuICBpZiAocGFydC5mcm9tICE9IGFuY2hvci5jaCAmJiBwYXJ0LnRvICE9IGFuY2hvci5jaCkgeyByZXR1cm4gcmFuZ2UkJDEgfVxuICB2YXIgYm91bmRhcnkgPSBpbmRleCArICgocGFydC5mcm9tID09IGFuY2hvci5jaCkgPT0gKHBhcnQubGV2ZWwgIT0gMSkgPyAwIDogMSk7XG4gIGlmIChib3VuZGFyeSA9PSAwIHx8IGJvdW5kYXJ5ID09IG9yZGVyLmxlbmd0aCkgeyByZXR1cm4gcmFuZ2UkJDEgfVxuXG4gIC8vIENvbXB1dGUgdGhlIHJlbGF0aXZlIHZpc3VhbCBwb3NpdGlvbiBvZiB0aGUgaGVhZCBjb21wYXJlZCB0byB0aGVcbiAgLy8gYW5jaG9yICg8MCBpcyB0byB0aGUgbGVmdCwgPjAgdG8gdGhlIHJpZ2h0KVxuICB2YXIgbGVmdFNpZGU7XG4gIGlmIChoZWFkLmxpbmUgIT0gYW5jaG9yLmxpbmUpIHtcbiAgICBsZWZ0U2lkZSA9IChoZWFkLmxpbmUgLSBhbmNob3IubGluZSkgKiAoY20uZG9jLmRpcmVjdGlvbiA9PSBcImx0clwiID8gMSA6IC0xKSA+IDA7XG4gIH0gZWxzZSB7XG4gICAgdmFyIGhlYWRJbmRleCA9IGdldEJpZGlQYXJ0QXQob3JkZXIsIGhlYWQuY2gsIGhlYWQuc3RpY2t5KTtcbiAgICB2YXIgZGlyID0gaGVhZEluZGV4IC0gaW5kZXggfHwgKGhlYWQuY2ggLSBhbmNob3IuY2gpICogKHBhcnQubGV2ZWwgPT0gMSA/IC0xIDogMSk7XG4gICAgaWYgKGhlYWRJbmRleCA9PSBib3VuZGFyeSAtIDEgfHwgaGVhZEluZGV4ID09IGJvdW5kYXJ5KVxuICAgICAgeyBsZWZ0U2lkZSA9IGRpciA8IDA7IH1cbiAgICBlbHNlXG4gICAgICB7IGxlZnRTaWRlID0gZGlyID4gMDsgfVxuICB9XG5cbiAgdmFyIHVzZVBhcnQgPSBvcmRlcltib3VuZGFyeSArIChsZWZ0U2lkZSA/IC0xIDogMCldO1xuICB2YXIgZnJvbSA9IGxlZnRTaWRlID09ICh1c2VQYXJ0LmxldmVsID09IDEpO1xuICB2YXIgY2ggPSBmcm9tID8gdXNlUGFydC5mcm9tIDogdXNlUGFydC50bywgc3RpY2t5ID0gZnJvbSA/IFwiYWZ0ZXJcIiA6IFwiYmVmb3JlXCI7XG4gIHJldHVybiBhbmNob3IuY2ggPT0gY2ggJiYgYW5jaG9yLnN0aWNreSA9PSBzdGlja3kgPyByYW5nZSQkMSA6IG5ldyBSYW5nZShuZXcgUG9zKGFuY2hvci5saW5lLCBjaCwgc3RpY2t5KSwgaGVhZClcbn1cblxuXG4vLyBEZXRlcm1pbmVzIHdoZXRoZXIgYW4gZXZlbnQgaGFwcGVuZWQgaW4gdGhlIGd1dHRlciwgYW5kIGZpcmVzIHRoZVxuLy8gaGFuZGxlcnMgZm9yIHRoZSBjb3JyZXNwb25kaW5nIGV2ZW50LlxuZnVuY3Rpb24gZ3V0dGVyRXZlbnQoY20sIGUsIHR5cGUsIHByZXZlbnQpIHtcbiAgdmFyIG1YLCBtWTtcbiAgaWYgKGUudG91Y2hlcykge1xuICAgIG1YID0gZS50b3VjaGVzWzBdLmNsaWVudFg7XG4gICAgbVkgPSBlLnRvdWNoZXNbMF0uY2xpZW50WTtcbiAgfSBlbHNlIHtcbiAgICB0cnkgeyBtWCA9IGUuY2xpZW50WDsgbVkgPSBlLmNsaWVudFk7IH1cbiAgICBjYXRjaChlKSB7IHJldHVybiBmYWxzZSB9XG4gIH1cbiAgaWYgKG1YID49IE1hdGguZmxvb3IoY20uZGlzcGxheS5ndXR0ZXJzLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpLnJpZ2h0KSkgeyByZXR1cm4gZmFsc2UgfVxuICBpZiAocHJldmVudCkgeyBlX3ByZXZlbnREZWZhdWx0KGUpOyB9XG5cbiAgdmFyIGRpc3BsYXkgPSBjbS5kaXNwbGF5O1xuICB2YXIgbGluZUJveCA9IGRpc3BsYXkubGluZURpdi5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblxuICBpZiAobVkgPiBsaW5lQm94LmJvdHRvbSB8fCAhaGFzSGFuZGxlcihjbSwgdHlwZSkpIHsgcmV0dXJuIGVfZGVmYXVsdFByZXZlbnRlZChlKSB9XG4gIG1ZIC09IGxpbmVCb3gudG9wIC0gZGlzcGxheS52aWV3T2Zmc2V0O1xuXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgY20ub3B0aW9ucy5ndXR0ZXJzLmxlbmd0aDsgKytpKSB7XG4gICAgdmFyIGcgPSBkaXNwbGF5Lmd1dHRlcnMuY2hpbGROb2Rlc1tpXTtcbiAgICBpZiAoZyAmJiBnLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpLnJpZ2h0ID49IG1YKSB7XG4gICAgICB2YXIgbGluZSA9IGxpbmVBdEhlaWdodChjbS5kb2MsIG1ZKTtcbiAgICAgIHZhciBndXR0ZXIgPSBjbS5vcHRpb25zLmd1dHRlcnNbaV07XG4gICAgICBzaWduYWwoY20sIHR5cGUsIGNtLCBsaW5lLCBndXR0ZXIsIGUpO1xuICAgICAgcmV0dXJuIGVfZGVmYXVsdFByZXZlbnRlZChlKVxuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBjbGlja0luR3V0dGVyKGNtLCBlKSB7XG4gIHJldHVybiBndXR0ZXJFdmVudChjbSwgZSwgXCJndXR0ZXJDbGlja1wiLCB0cnVlKVxufVxuXG4vLyBDT05URVhUIE1FTlUgSEFORExJTkdcblxuLy8gVG8gbWFrZSB0aGUgY29udGV4dCBtZW51IHdvcmssIHdlIG5lZWQgdG8gYnJpZWZseSB1bmhpZGUgdGhlXG4vLyB0ZXh0YXJlYSAobWFraW5nIGl0IGFzIHVub2J0cnVzaXZlIGFzIHBvc3NpYmxlKSB0byBsZXQgdGhlXG4vLyByaWdodC1jbGljayB0YWtlIGVmZmVjdCBvbiBpdC5cbmZ1bmN0aW9uIG9uQ29udGV4dE1lbnUoY20sIGUpIHtcbiAgaWYgKGV2ZW50SW5XaWRnZXQoY20uZGlzcGxheSwgZSkgfHwgY29udGV4dE1lbnVJbkd1dHRlcihjbSwgZSkpIHsgcmV0dXJuIH1cbiAgaWYgKHNpZ25hbERPTUV2ZW50KGNtLCBlLCBcImNvbnRleHRtZW51XCIpKSB7IHJldHVybiB9XG4gIGNtLmRpc3BsYXkuaW5wdXQub25Db250ZXh0TWVudShlKTtcbn1cblxuZnVuY3Rpb24gY29udGV4dE1lbnVJbkd1dHRlcihjbSwgZSkge1xuICBpZiAoIWhhc0hhbmRsZXIoY20sIFwiZ3V0dGVyQ29udGV4dE1lbnVcIikpIHsgcmV0dXJuIGZhbHNlIH1cbiAgcmV0dXJuIGd1dHRlckV2ZW50KGNtLCBlLCBcImd1dHRlckNvbnRleHRNZW51XCIsIGZhbHNlKVxufVxuXG5mdW5jdGlvbiB0aGVtZUNoYW5nZWQoY20pIHtcbiAgY20uZGlzcGxheS53cmFwcGVyLmNsYXNzTmFtZSA9IGNtLmRpc3BsYXkud3JhcHBlci5jbGFzc05hbWUucmVwbGFjZSgvXFxzKmNtLXMtXFxTKy9nLCBcIlwiKSArXG4gICAgY20ub3B0aW9ucy50aGVtZS5yZXBsYWNlKC8oXnxcXHMpXFxzKi9nLCBcIiBjbS1zLVwiKTtcbiAgY2xlYXJDYWNoZXMoY20pO1xufVxuXG52YXIgSW5pdCA9IHt0b1N0cmluZzogZnVuY3Rpb24oKXtyZXR1cm4gXCJDb2RlTWlycm9yLkluaXRcIn19O1xuXG52YXIgZGVmYXVsdHMgPSB7fTtcbnZhciBvcHRpb25IYW5kbGVycyA9IHt9O1xuXG5mdW5jdGlvbiBkZWZpbmVPcHRpb25zKENvZGVNaXJyb3IpIHtcbiAgdmFyIG9wdGlvbkhhbmRsZXJzID0gQ29kZU1pcnJvci5vcHRpb25IYW5kbGVycztcblxuICBmdW5jdGlvbiBvcHRpb24obmFtZSwgZGVmbHQsIGhhbmRsZSwgbm90T25Jbml0KSB7XG4gICAgQ29kZU1pcnJvci5kZWZhdWx0c1tuYW1lXSA9IGRlZmx0O1xuICAgIGlmIChoYW5kbGUpIHsgb3B0aW9uSGFuZGxlcnNbbmFtZV0gPVxuICAgICAgbm90T25Jbml0ID8gZnVuY3Rpb24gKGNtLCB2YWwsIG9sZCkge2lmIChvbGQgIT0gSW5pdCkgeyBoYW5kbGUoY20sIHZhbCwgb2xkKTsgfX0gOiBoYW5kbGU7IH1cbiAgfVxuXG4gIENvZGVNaXJyb3IuZGVmaW5lT3B0aW9uID0gb3B0aW9uO1xuXG4gIC8vIFBhc3NlZCB0byBvcHRpb24gaGFuZGxlcnMgd2hlbiB0aGVyZSBpcyBubyBvbGQgdmFsdWUuXG4gIENvZGVNaXJyb3IuSW5pdCA9IEluaXQ7XG5cbiAgLy8gVGhlc2UgdHdvIGFyZSwgb24gaW5pdCwgY2FsbGVkIGZyb20gdGhlIGNvbnN0cnVjdG9yIGJlY2F1c2UgdGhleVxuICAvLyBoYXZlIHRvIGJlIGluaXRpYWxpemVkIGJlZm9yZSB0aGUgZWRpdG9yIGNhbiBzdGFydCBhdCBhbGwuXG4gIG9wdGlvbihcInZhbHVlXCIsIFwiXCIsIGZ1bmN0aW9uIChjbSwgdmFsKSB7IHJldHVybiBjbS5zZXRWYWx1ZSh2YWwpOyB9LCB0cnVlKTtcbiAgb3B0aW9uKFwibW9kZVwiLCBudWxsLCBmdW5jdGlvbiAoY20sIHZhbCkge1xuICAgIGNtLmRvYy5tb2RlT3B0aW9uID0gdmFsO1xuICAgIGxvYWRNb2RlKGNtKTtcbiAgfSwgdHJ1ZSk7XG5cbiAgb3B0aW9uKFwiaW5kZW50VW5pdFwiLCAyLCBsb2FkTW9kZSwgdHJ1ZSk7XG4gIG9wdGlvbihcImluZGVudFdpdGhUYWJzXCIsIGZhbHNlKTtcbiAgb3B0aW9uKFwic21hcnRJbmRlbnRcIiwgdHJ1ZSk7XG4gIG9wdGlvbihcInRhYlNpemVcIiwgNCwgZnVuY3Rpb24gKGNtKSB7XG4gICAgcmVzZXRNb2RlU3RhdGUoY20pO1xuICAgIGNsZWFyQ2FjaGVzKGNtKTtcbiAgICByZWdDaGFuZ2UoY20pO1xuICB9LCB0cnVlKTtcblxuICBvcHRpb24oXCJsaW5lU2VwYXJhdG9yXCIsIG51bGwsIGZ1bmN0aW9uIChjbSwgdmFsKSB7XG4gICAgY20uZG9jLmxpbmVTZXAgPSB2YWw7XG4gICAgaWYgKCF2YWwpIHsgcmV0dXJuIH1cbiAgICB2YXIgbmV3QnJlYWtzID0gW10sIGxpbmVObyA9IGNtLmRvYy5maXJzdDtcbiAgICBjbS5kb2MuaXRlcihmdW5jdGlvbiAobGluZSkge1xuICAgICAgZm9yICh2YXIgcG9zID0gMDs7KSB7XG4gICAgICAgIHZhciBmb3VuZCA9IGxpbmUudGV4dC5pbmRleE9mKHZhbCwgcG9zKTtcbiAgICAgICAgaWYgKGZvdW5kID09IC0xKSB7IGJyZWFrIH1cbiAgICAgICAgcG9zID0gZm91bmQgKyB2YWwubGVuZ3RoO1xuICAgICAgICBuZXdCcmVha3MucHVzaChQb3MobGluZU5vLCBmb3VuZCkpO1xuICAgICAgfVxuICAgICAgbGluZU5vKys7XG4gICAgfSk7XG4gICAgZm9yICh2YXIgaSA9IG5ld0JyZWFrcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSlcbiAgICAgIHsgcmVwbGFjZVJhbmdlKGNtLmRvYywgdmFsLCBuZXdCcmVha3NbaV0sIFBvcyhuZXdCcmVha3NbaV0ubGluZSwgbmV3QnJlYWtzW2ldLmNoICsgdmFsLmxlbmd0aCkpOyB9XG4gIH0pO1xuICBvcHRpb24oXCJzcGVjaWFsQ2hhcnNcIiwgL1tcXHUwMDAwLVxcdTAwMWZcXHUwMDdmLVxcdTAwOWZcXHUwMGFkXFx1MDYxY1xcdTIwMGItXFx1MjAwZlxcdTIwMjhcXHUyMDI5XFx1ZmVmZl0vZywgZnVuY3Rpb24gKGNtLCB2YWwsIG9sZCkge1xuICAgIGNtLnN0YXRlLnNwZWNpYWxDaGFycyA9IG5ldyBSZWdFeHAodmFsLnNvdXJjZSArICh2YWwudGVzdChcIlxcdFwiKSA/IFwiXCIgOiBcInxcXHRcIiksIFwiZ1wiKTtcbiAgICBpZiAob2xkICE9IEluaXQpIHsgY20ucmVmcmVzaCgpOyB9XG4gIH0pO1xuICBvcHRpb24oXCJzcGVjaWFsQ2hhclBsYWNlaG9sZGVyXCIsIGRlZmF1bHRTcGVjaWFsQ2hhclBsYWNlaG9sZGVyLCBmdW5jdGlvbiAoY20pIHsgcmV0dXJuIGNtLnJlZnJlc2goKTsgfSwgdHJ1ZSk7XG4gIG9wdGlvbihcImVsZWN0cmljQ2hhcnNcIiwgdHJ1ZSk7XG4gIG9wdGlvbihcImlucHV0U3R5bGVcIiwgbW9iaWxlID8gXCJjb250ZW50ZWRpdGFibGVcIiA6IFwidGV4dGFyZWFcIiwgZnVuY3Rpb24gKCkge1xuICAgIHRocm93IG5ldyBFcnJvcihcImlucHV0U3R5bGUgY2FuIG5vdCAoeWV0KSBiZSBjaGFuZ2VkIGluIGEgcnVubmluZyBlZGl0b3JcIikgLy8gRklYTUVcbiAgfSwgdHJ1ZSk7XG4gIG9wdGlvbihcInNwZWxsY2hlY2tcIiwgZmFsc2UsIGZ1bmN0aW9uIChjbSwgdmFsKSB7IHJldHVybiBjbS5nZXRJbnB1dEZpZWxkKCkuc3BlbGxjaGVjayA9IHZhbDsgfSwgdHJ1ZSk7XG4gIG9wdGlvbihcInJ0bE1vdmVWaXN1YWxseVwiLCAhd2luZG93cyk7XG4gIG9wdGlvbihcIndob2xlTGluZVVwZGF0ZUJlZm9yZVwiLCB0cnVlKTtcblxuICBvcHRpb24oXCJ0aGVtZVwiLCBcImRlZmF1bHRcIiwgZnVuY3Rpb24gKGNtKSB7XG4gICAgdGhlbWVDaGFuZ2VkKGNtKTtcbiAgICBndXR0ZXJzQ2hhbmdlZChjbSk7XG4gIH0sIHRydWUpO1xuICBvcHRpb24oXCJrZXlNYXBcIiwgXCJkZWZhdWx0XCIsIGZ1bmN0aW9uIChjbSwgdmFsLCBvbGQpIHtcbiAgICB2YXIgbmV4dCA9IGdldEtleU1hcCh2YWwpO1xuICAgIHZhciBwcmV2ID0gb2xkICE9IEluaXQgJiYgZ2V0S2V5TWFwKG9sZCk7XG4gICAgaWYgKHByZXYgJiYgcHJldi5kZXRhY2gpIHsgcHJldi5kZXRhY2goY20sIG5leHQpOyB9XG4gICAgaWYgKG5leHQuYXR0YWNoKSB7IG5leHQuYXR0YWNoKGNtLCBwcmV2IHx8IG51bGwpOyB9XG4gIH0pO1xuICBvcHRpb24oXCJleHRyYUtleXNcIiwgbnVsbCk7XG4gIG9wdGlvbihcImNvbmZpZ3VyZU1vdXNlXCIsIG51bGwpO1xuXG4gIG9wdGlvbihcImxpbmVXcmFwcGluZ1wiLCBmYWxzZSwgd3JhcHBpbmdDaGFuZ2VkLCB0cnVlKTtcbiAgb3B0aW9uKFwiZ3V0dGVyc1wiLCBbXSwgZnVuY3Rpb24gKGNtKSB7XG4gICAgc2V0R3V0dGVyc0ZvckxpbmVOdW1iZXJzKGNtLm9wdGlvbnMpO1xuICAgIGd1dHRlcnNDaGFuZ2VkKGNtKTtcbiAgfSwgdHJ1ZSk7XG4gIG9wdGlvbihcImZpeGVkR3V0dGVyXCIsIHRydWUsIGZ1bmN0aW9uIChjbSwgdmFsKSB7XG4gICAgY20uZGlzcGxheS5ndXR0ZXJzLnN0eWxlLmxlZnQgPSB2YWwgPyBjb21wZW5zYXRlRm9ySFNjcm9sbChjbS5kaXNwbGF5KSArIFwicHhcIiA6IFwiMFwiO1xuICAgIGNtLnJlZnJlc2goKTtcbiAgfSwgdHJ1ZSk7XG4gIG9wdGlvbihcImNvdmVyR3V0dGVyTmV4dFRvU2Nyb2xsYmFyXCIsIGZhbHNlLCBmdW5jdGlvbiAoY20pIHsgcmV0dXJuIHVwZGF0ZVNjcm9sbGJhcnMoY20pOyB9LCB0cnVlKTtcbiAgb3B0aW9uKFwic2Nyb2xsYmFyU3R5bGVcIiwgXCJuYXRpdmVcIiwgZnVuY3Rpb24gKGNtKSB7XG4gICAgaW5pdFNjcm9sbGJhcnMoY20pO1xuICAgIHVwZGF0ZVNjcm9sbGJhcnMoY20pO1xuICAgIGNtLmRpc3BsYXkuc2Nyb2xsYmFycy5zZXRTY3JvbGxUb3AoY20uZG9jLnNjcm9sbFRvcCk7XG4gICAgY20uZGlzcGxheS5zY3JvbGxiYXJzLnNldFNjcm9sbExlZnQoY20uZG9jLnNjcm9sbExlZnQpO1xuICB9LCB0cnVlKTtcbiAgb3B0aW9uKFwibGluZU51bWJlcnNcIiwgZmFsc2UsIGZ1bmN0aW9uIChjbSkge1xuICAgIHNldEd1dHRlcnNGb3JMaW5lTnVtYmVycyhjbS5vcHRpb25zKTtcbiAgICBndXR0ZXJzQ2hhbmdlZChjbSk7XG4gIH0sIHRydWUpO1xuICBvcHRpb24oXCJmaXJzdExpbmVOdW1iZXJcIiwgMSwgZ3V0dGVyc0NoYW5nZWQsIHRydWUpO1xuICBvcHRpb24oXCJsaW5lTnVtYmVyRm9ybWF0dGVyXCIsIGZ1bmN0aW9uIChpbnRlZ2VyKSB7IHJldHVybiBpbnRlZ2VyOyB9LCBndXR0ZXJzQ2hhbmdlZCwgdHJ1ZSk7XG4gIG9wdGlvbihcInNob3dDdXJzb3JXaGVuU2VsZWN0aW5nXCIsIGZhbHNlLCB1cGRhdGVTZWxlY3Rpb24sIHRydWUpO1xuXG4gIG9wdGlvbihcInJlc2V0U2VsZWN0aW9uT25Db250ZXh0TWVudVwiLCB0cnVlKTtcbiAgb3B0aW9uKFwibGluZVdpc2VDb3B5Q3V0XCIsIHRydWUpO1xuICBvcHRpb24oXCJwYXN0ZUxpbmVzUGVyU2VsZWN0aW9uXCIsIHRydWUpO1xuXG4gIG9wdGlvbihcInJlYWRPbmx5XCIsIGZhbHNlLCBmdW5jdGlvbiAoY20sIHZhbCkge1xuICAgIGlmICh2YWwgPT0gXCJub2N1cnNvclwiKSB7XG4gICAgICBvbkJsdXIoY20pO1xuICAgICAgY20uZGlzcGxheS5pbnB1dC5ibHVyKCk7XG4gICAgfVxuICAgIGNtLmRpc3BsYXkuaW5wdXQucmVhZE9ubHlDaGFuZ2VkKHZhbCk7XG4gIH0pO1xuICBvcHRpb24oXCJkaXNhYmxlSW5wdXRcIiwgZmFsc2UsIGZ1bmN0aW9uIChjbSwgdmFsKSB7aWYgKCF2YWwpIHsgY20uZGlzcGxheS5pbnB1dC5yZXNldCgpOyB9fSwgdHJ1ZSk7XG4gIG9wdGlvbihcImRyYWdEcm9wXCIsIHRydWUsIGRyYWdEcm9wQ2hhbmdlZCk7XG4gIG9wdGlvbihcImFsbG93RHJvcEZpbGVUeXBlc1wiLCBudWxsKTtcblxuICBvcHRpb24oXCJjdXJzb3JCbGlua1JhdGVcIiwgNTMwKTtcbiAgb3B0aW9uKFwiY3Vyc29yU2Nyb2xsTWFyZ2luXCIsIDApO1xuICBvcHRpb24oXCJjdXJzb3JIZWlnaHRcIiwgMSwgdXBkYXRlU2VsZWN0aW9uLCB0cnVlKTtcbiAgb3B0aW9uKFwic2luZ2xlQ3Vyc29ySGVpZ2h0UGVyTGluZVwiLCB0cnVlLCB1cGRhdGVTZWxlY3Rpb24sIHRydWUpO1xuICBvcHRpb24oXCJ3b3JrVGltZVwiLCAxMDApO1xuICBvcHRpb24oXCJ3b3JrRGVsYXlcIiwgMTAwKTtcbiAgb3B0aW9uKFwiZmxhdHRlblNwYW5zXCIsIHRydWUsIHJlc2V0TW9kZVN0YXRlLCB0cnVlKTtcbiAgb3B0aW9uKFwiYWRkTW9kZUNsYXNzXCIsIGZhbHNlLCByZXNldE1vZGVTdGF0ZSwgdHJ1ZSk7XG4gIG9wdGlvbihcInBvbGxJbnRlcnZhbFwiLCAxMDApO1xuICBvcHRpb24oXCJ1bmRvRGVwdGhcIiwgMjAwLCBmdW5jdGlvbiAoY20sIHZhbCkgeyByZXR1cm4gY20uZG9jLmhpc3RvcnkudW5kb0RlcHRoID0gdmFsOyB9KTtcbiAgb3B0aW9uKFwiaGlzdG9yeUV2ZW50RGVsYXlcIiwgMTI1MCk7XG4gIG9wdGlvbihcInZpZXdwb3J0TWFyZ2luXCIsIDEwLCBmdW5jdGlvbiAoY20pIHsgcmV0dXJuIGNtLnJlZnJlc2goKTsgfSwgdHJ1ZSk7XG4gIG9wdGlvbihcIm1heEhpZ2hsaWdodExlbmd0aFwiLCAxMDAwMCwgcmVzZXRNb2RlU3RhdGUsIHRydWUpO1xuICBvcHRpb24oXCJtb3ZlSW5wdXRXaXRoQ3Vyc29yXCIsIHRydWUsIGZ1bmN0aW9uIChjbSwgdmFsKSB7XG4gICAgaWYgKCF2YWwpIHsgY20uZGlzcGxheS5pbnB1dC5yZXNldFBvc2l0aW9uKCk7IH1cbiAgfSk7XG5cbiAgb3B0aW9uKFwidGFiaW5kZXhcIiwgbnVsbCwgZnVuY3Rpb24gKGNtLCB2YWwpIHsgcmV0dXJuIGNtLmRpc3BsYXkuaW5wdXQuZ2V0RmllbGQoKS50YWJJbmRleCA9IHZhbCB8fCBcIlwiOyB9KTtcbiAgb3B0aW9uKFwiYXV0b2ZvY3VzXCIsIG51bGwpO1xuICBvcHRpb24oXCJkaXJlY3Rpb25cIiwgXCJsdHJcIiwgZnVuY3Rpb24gKGNtLCB2YWwpIHsgcmV0dXJuIGNtLmRvYy5zZXREaXJlY3Rpb24odmFsKTsgfSwgdHJ1ZSk7XG59XG5cbmZ1bmN0aW9uIGd1dHRlcnNDaGFuZ2VkKGNtKSB7XG4gIHVwZGF0ZUd1dHRlcnMoY20pO1xuICByZWdDaGFuZ2UoY20pO1xuICBhbGlnbkhvcml6b250YWxseShjbSk7XG59XG5cbmZ1bmN0aW9uIGRyYWdEcm9wQ2hhbmdlZChjbSwgdmFsdWUsIG9sZCkge1xuICB2YXIgd2FzT24gPSBvbGQgJiYgb2xkICE9IEluaXQ7XG4gIGlmICghdmFsdWUgIT0gIXdhc09uKSB7XG4gICAgdmFyIGZ1bmNzID0gY20uZGlzcGxheS5kcmFnRnVuY3Rpb25zO1xuICAgIHZhciB0b2dnbGUgPSB2YWx1ZSA/IG9uIDogb2ZmO1xuICAgIHRvZ2dsZShjbS5kaXNwbGF5LnNjcm9sbGVyLCBcImRyYWdzdGFydFwiLCBmdW5jcy5zdGFydCk7XG4gICAgdG9nZ2xlKGNtLmRpc3BsYXkuc2Nyb2xsZXIsIFwiZHJhZ2VudGVyXCIsIGZ1bmNzLmVudGVyKTtcbiAgICB0b2dnbGUoY20uZGlzcGxheS5zY3JvbGxlciwgXCJkcmFnb3ZlclwiLCBmdW5jcy5vdmVyKTtcbiAgICB0b2dnbGUoY20uZGlzcGxheS5zY3JvbGxlciwgXCJkcmFnbGVhdmVcIiwgZnVuY3MubGVhdmUpO1xuICAgIHRvZ2dsZShjbS5kaXNwbGF5LnNjcm9sbGVyLCBcImRyb3BcIiwgZnVuY3MuZHJvcCk7XG4gIH1cbn1cblxuZnVuY3Rpb24gd3JhcHBpbmdDaGFuZ2VkKGNtKSB7XG4gIGlmIChjbS5vcHRpb25zLmxpbmVXcmFwcGluZykge1xuICAgIGFkZENsYXNzKGNtLmRpc3BsYXkud3JhcHBlciwgXCJDb2RlTWlycm9yLXdyYXBcIik7XG4gICAgY20uZGlzcGxheS5zaXplci5zdHlsZS5taW5XaWR0aCA9IFwiXCI7XG4gICAgY20uZGlzcGxheS5zaXplcldpZHRoID0gbnVsbDtcbiAgfSBlbHNlIHtcbiAgICBybUNsYXNzKGNtLmRpc3BsYXkud3JhcHBlciwgXCJDb2RlTWlycm9yLXdyYXBcIik7XG4gICAgZmluZE1heExpbmUoY20pO1xuICB9XG4gIGVzdGltYXRlTGluZUhlaWdodHMoY20pO1xuICByZWdDaGFuZ2UoY20pO1xuICBjbGVhckNhY2hlcyhjbSk7XG4gIHNldFRpbWVvdXQoZnVuY3Rpb24gKCkgeyByZXR1cm4gdXBkYXRlU2Nyb2xsYmFycyhjbSk7IH0sIDEwMCk7XG59XG5cbi8vIEEgQ29kZU1pcnJvciBpbnN0YW5jZSByZXByZXNlbnRzIGFuIGVkaXRvci4gVGhpcyBpcyB0aGUgb2JqZWN0XG4vLyB0aGF0IHVzZXIgY29kZSBpcyB1c3VhbGx5IGRlYWxpbmcgd2l0aC5cblxuZnVuY3Rpb24gQ29kZU1pcnJvciQxKHBsYWNlLCBvcHRpb25zKSB7XG4gIHZhciB0aGlzJDEgPSB0aGlzO1xuXG4gIGlmICghKHRoaXMgaW5zdGFuY2VvZiBDb2RlTWlycm9yJDEpKSB7IHJldHVybiBuZXcgQ29kZU1pcnJvciQxKHBsYWNlLCBvcHRpb25zKSB9XG5cbiAgdGhpcy5vcHRpb25zID0gb3B0aW9ucyA9IG9wdGlvbnMgPyBjb3B5T2JqKG9wdGlvbnMpIDoge307XG4gIC8vIERldGVybWluZSBlZmZlY3RpdmUgb3B0aW9ucyBiYXNlZCBvbiBnaXZlbiB2YWx1ZXMgYW5kIGRlZmF1bHRzLlxuICBjb3B5T2JqKGRlZmF1bHRzLCBvcHRpb25zLCBmYWxzZSk7XG4gIHNldEd1dHRlcnNGb3JMaW5lTnVtYmVycyhvcHRpb25zKTtcblxuICB2YXIgZG9jID0gb3B0aW9ucy52YWx1ZTtcbiAgaWYgKHR5cGVvZiBkb2MgPT0gXCJzdHJpbmdcIikgeyBkb2MgPSBuZXcgRG9jKGRvYywgb3B0aW9ucy5tb2RlLCBudWxsLCBvcHRpb25zLmxpbmVTZXBhcmF0b3IsIG9wdGlvbnMuZGlyZWN0aW9uKTsgfVxuICB0aGlzLmRvYyA9IGRvYztcblxuICB2YXIgaW5wdXQgPSBuZXcgQ29kZU1pcnJvciQxLmlucHV0U3R5bGVzW29wdGlvbnMuaW5wdXRTdHlsZV0odGhpcyk7XG4gIHZhciBkaXNwbGF5ID0gdGhpcy5kaXNwbGF5ID0gbmV3IERpc3BsYXkocGxhY2UsIGRvYywgaW5wdXQpO1xuICBkaXNwbGF5LndyYXBwZXIuQ29kZU1pcnJvciA9IHRoaXM7XG4gIHVwZGF0ZUd1dHRlcnModGhpcyk7XG4gIHRoZW1lQ2hhbmdlZCh0aGlzKTtcbiAgaWYgKG9wdGlvbnMubGluZVdyYXBwaW5nKVxuICAgIHsgdGhpcy5kaXNwbGF5LndyYXBwZXIuY2xhc3NOYW1lICs9IFwiIENvZGVNaXJyb3Itd3JhcFwiOyB9XG4gIGluaXRTY3JvbGxiYXJzKHRoaXMpO1xuXG4gIHRoaXMuc3RhdGUgPSB7XG4gICAga2V5TWFwczogW10sICAvLyBzdG9yZXMgbWFwcyBhZGRlZCBieSBhZGRLZXlNYXBcbiAgICBvdmVybGF5czogW10sIC8vIGhpZ2hsaWdodGluZyBvdmVybGF5cywgYXMgYWRkZWQgYnkgYWRkT3ZlcmxheVxuICAgIG1vZGVHZW46IDAsICAgLy8gYnVtcGVkIHdoZW4gbW9kZS9vdmVybGF5IGNoYW5nZXMsIHVzZWQgdG8gaW52YWxpZGF0ZSBoaWdobGlnaHRpbmcgaW5mb1xuICAgIG92ZXJ3cml0ZTogZmFsc2UsXG4gICAgZGVsYXlpbmdCbHVyRXZlbnQ6IGZhbHNlLFxuICAgIGZvY3VzZWQ6IGZhbHNlLFxuICAgIHN1cHByZXNzRWRpdHM6IGZhbHNlLCAvLyB1c2VkIHRvIGRpc2FibGUgZWRpdGluZyBkdXJpbmcga2V5IGhhbmRsZXJzIHdoZW4gaW4gcmVhZE9ubHkgbW9kZVxuICAgIHBhc3RlSW5jb21pbmc6IGZhbHNlLCBjdXRJbmNvbWluZzogZmFsc2UsIC8vIGhlbHAgcmVjb2duaXplIHBhc3RlL2N1dCBlZGl0cyBpbiBpbnB1dC5wb2xsXG4gICAgc2VsZWN0aW5nVGV4dDogZmFsc2UsXG4gICAgZHJhZ2dpbmdUZXh0OiBmYWxzZSxcbiAgICBoaWdobGlnaHQ6IG5ldyBEZWxheWVkKCksIC8vIHN0b3JlcyBoaWdobGlnaHQgd29ya2VyIHRpbWVvdXRcbiAgICBrZXlTZXE6IG51bGwsICAvLyBVbmZpbmlzaGVkIGtleSBzZXF1ZW5jZVxuICAgIHNwZWNpYWxDaGFyczogbnVsbFxuICB9O1xuXG4gIGlmIChvcHRpb25zLmF1dG9mb2N1cyAmJiAhbW9iaWxlKSB7IGRpc3BsYXkuaW5wdXQuZm9jdXMoKTsgfVxuXG4gIC8vIE92ZXJyaWRlIG1hZ2ljIHRleHRhcmVhIGNvbnRlbnQgcmVzdG9yZSB0aGF0IElFIHNvbWV0aW1lcyBkb2VzXG4gIC8vIG9uIG91ciBoaWRkZW4gdGV4dGFyZWEgb24gcmVsb2FkXG4gIGlmIChpZSAmJiBpZV92ZXJzaW9uIDwgMTEpIHsgc2V0VGltZW91dChmdW5jdGlvbiAoKSB7IHJldHVybiB0aGlzJDEuZGlzcGxheS5pbnB1dC5yZXNldCh0cnVlKTsgfSwgMjApOyB9XG5cbiAgcmVnaXN0ZXJFdmVudEhhbmRsZXJzKHRoaXMpO1xuICBlbnN1cmVHbG9iYWxIYW5kbGVycygpO1xuXG4gIHN0YXJ0T3BlcmF0aW9uKHRoaXMpO1xuICB0aGlzLmN1ck9wLmZvcmNlVXBkYXRlID0gdHJ1ZTtcbiAgYXR0YWNoRG9jKHRoaXMsIGRvYyk7XG5cbiAgaWYgKChvcHRpb25zLmF1dG9mb2N1cyAmJiAhbW9iaWxlKSB8fCB0aGlzLmhhc0ZvY3VzKCkpXG4gICAgeyBzZXRUaW1lb3V0KGJpbmQob25Gb2N1cywgdGhpcyksIDIwKTsgfVxuICBlbHNlXG4gICAgeyBvbkJsdXIodGhpcyk7IH1cblxuICBmb3IgKHZhciBvcHQgaW4gb3B0aW9uSGFuZGxlcnMpIHsgaWYgKG9wdGlvbkhhbmRsZXJzLmhhc093blByb3BlcnR5KG9wdCkpXG4gICAgeyBvcHRpb25IYW5kbGVyc1tvcHRdKHRoaXMkMSwgb3B0aW9uc1tvcHRdLCBJbml0KTsgfSB9XG4gIG1heWJlVXBkYXRlTGluZU51bWJlcldpZHRoKHRoaXMpO1xuICBpZiAob3B0aW9ucy5maW5pc2hJbml0KSB7IG9wdGlvbnMuZmluaXNoSW5pdCh0aGlzKTsgfVxuICBmb3IgKHZhciBpID0gMDsgaSA8IGluaXRIb29rcy5sZW5ndGg7ICsraSkgeyBpbml0SG9va3NbaV0odGhpcyQxKTsgfVxuICBlbmRPcGVyYXRpb24odGhpcyk7XG4gIC8vIFN1cHByZXNzIG9wdGltaXplbGVnaWJpbGl0eSBpbiBXZWJraXQsIHNpbmNlIGl0IGJyZWFrcyB0ZXh0XG4gIC8vIG1lYXN1cmluZyBvbiBsaW5lIHdyYXBwaW5nIGJvdW5kYXJpZXMuXG4gIGlmICh3ZWJraXQgJiYgb3B0aW9ucy5saW5lV3JhcHBpbmcgJiZcbiAgICAgIGdldENvbXB1dGVkU3R5bGUoZGlzcGxheS5saW5lRGl2KS50ZXh0UmVuZGVyaW5nID09IFwib3B0aW1pemVsZWdpYmlsaXR5XCIpXG4gICAgeyBkaXNwbGF5LmxpbmVEaXYuc3R5bGUudGV4dFJlbmRlcmluZyA9IFwiYXV0b1wiOyB9XG59XG5cbi8vIFRoZSBkZWZhdWx0IGNvbmZpZ3VyYXRpb24gb3B0aW9ucy5cbkNvZGVNaXJyb3IkMS5kZWZhdWx0cyA9IGRlZmF1bHRzO1xuLy8gRnVuY3Rpb25zIHRvIHJ1biB3aGVuIG9wdGlvbnMgYXJlIGNoYW5nZWQuXG5Db2RlTWlycm9yJDEub3B0aW9uSGFuZGxlcnMgPSBvcHRpb25IYW5kbGVycztcblxuLy8gQXR0YWNoIHRoZSBuZWNlc3NhcnkgZXZlbnQgaGFuZGxlcnMgd2hlbiBpbml0aWFsaXppbmcgdGhlIGVkaXRvclxuZnVuY3Rpb24gcmVnaXN0ZXJFdmVudEhhbmRsZXJzKGNtKSB7XG4gIHZhciBkID0gY20uZGlzcGxheTtcbiAgb24oZC5zY3JvbGxlciwgXCJtb3VzZWRvd25cIiwgb3BlcmF0aW9uKGNtLCBvbk1vdXNlRG93bikpO1xuICAvLyBPbGRlciBJRSdzIHdpbGwgbm90IGZpcmUgYSBzZWNvbmQgbW91c2Vkb3duIGZvciBhIGRvdWJsZSBjbGlja1xuICBpZiAoaWUgJiYgaWVfdmVyc2lvbiA8IDExKVxuICAgIHsgb24oZC5zY3JvbGxlciwgXCJkYmxjbGlja1wiLCBvcGVyYXRpb24oY20sIGZ1bmN0aW9uIChlKSB7XG4gICAgICBpZiAoc2lnbmFsRE9NRXZlbnQoY20sIGUpKSB7IHJldHVybiB9XG4gICAgICB2YXIgcG9zID0gcG9zRnJvbU1vdXNlKGNtLCBlKTtcbiAgICAgIGlmICghcG9zIHx8IGNsaWNrSW5HdXR0ZXIoY20sIGUpIHx8IGV2ZW50SW5XaWRnZXQoY20uZGlzcGxheSwgZSkpIHsgcmV0dXJuIH1cbiAgICAgIGVfcHJldmVudERlZmF1bHQoZSk7XG4gICAgICB2YXIgd29yZCA9IGNtLmZpbmRXb3JkQXQocG9zKTtcbiAgICAgIGV4dGVuZFNlbGVjdGlvbihjbS5kb2MsIHdvcmQuYW5jaG9yLCB3b3JkLmhlYWQpO1xuICAgIH0pKTsgfVxuICBlbHNlXG4gICAgeyBvbihkLnNjcm9sbGVyLCBcImRibGNsaWNrXCIsIGZ1bmN0aW9uIChlKSB7IHJldHVybiBzaWduYWxET01FdmVudChjbSwgZSkgfHwgZV9wcmV2ZW50RGVmYXVsdChlKTsgfSk7IH1cbiAgLy8gU29tZSBicm93c2VycyBmaXJlIGNvbnRleHRtZW51ICphZnRlciogb3BlbmluZyB0aGUgbWVudSwgYXRcbiAgLy8gd2hpY2ggcG9pbnQgd2UgY2FuJ3QgbWVzcyB3aXRoIGl0IGFueW1vcmUuIENvbnRleHQgbWVudSBpc1xuICAvLyBoYW5kbGVkIGluIG9uTW91c2VEb3duIGZvciB0aGVzZSBicm93c2Vycy5cbiAgaWYgKCFjYXB0dXJlUmlnaHRDbGljaykgeyBvbihkLnNjcm9sbGVyLCBcImNvbnRleHRtZW51XCIsIGZ1bmN0aW9uIChlKSB7IHJldHVybiBvbkNvbnRleHRNZW51KGNtLCBlKTsgfSk7IH1cblxuICAvLyBVc2VkIHRvIHN1cHByZXNzIG1vdXNlIGV2ZW50IGhhbmRsaW5nIHdoZW4gYSB0b3VjaCBoYXBwZW5zXG4gIHZhciB0b3VjaEZpbmlzaGVkLCBwcmV2VG91Y2ggPSB7ZW5kOiAwfTtcbiAgZnVuY3Rpb24gZmluaXNoVG91Y2goKSB7XG4gICAgaWYgKGQuYWN0aXZlVG91Y2gpIHtcbiAgICAgIHRvdWNoRmluaXNoZWQgPSBzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHsgcmV0dXJuIGQuYWN0aXZlVG91Y2ggPSBudWxsOyB9LCAxMDAwKTtcbiAgICAgIHByZXZUb3VjaCA9IGQuYWN0aXZlVG91Y2g7XG4gICAgICBwcmV2VG91Y2guZW5kID0gK25ldyBEYXRlO1xuICAgIH1cbiAgfVxuICBmdW5jdGlvbiBpc01vdXNlTGlrZVRvdWNoRXZlbnQoZSkge1xuICAgIGlmIChlLnRvdWNoZXMubGVuZ3RoICE9IDEpIHsgcmV0dXJuIGZhbHNlIH1cbiAgICB2YXIgdG91Y2ggPSBlLnRvdWNoZXNbMF07XG4gICAgcmV0dXJuIHRvdWNoLnJhZGl1c1ggPD0gMSAmJiB0b3VjaC5yYWRpdXNZIDw9IDFcbiAgfVxuICBmdW5jdGlvbiBmYXJBd2F5KHRvdWNoLCBvdGhlcikge1xuICAgIGlmIChvdGhlci5sZWZ0ID09IG51bGwpIHsgcmV0dXJuIHRydWUgfVxuICAgIHZhciBkeCA9IG90aGVyLmxlZnQgLSB0b3VjaC5sZWZ0LCBkeSA9IG90aGVyLnRvcCAtIHRvdWNoLnRvcDtcbiAgICByZXR1cm4gZHggKiBkeCArIGR5ICogZHkgPiAyMCAqIDIwXG4gIH1cbiAgb24oZC5zY3JvbGxlciwgXCJ0b3VjaHN0YXJ0XCIsIGZ1bmN0aW9uIChlKSB7XG4gICAgaWYgKCFzaWduYWxET01FdmVudChjbSwgZSkgJiYgIWlzTW91c2VMaWtlVG91Y2hFdmVudChlKSAmJiAhY2xpY2tJbkd1dHRlcihjbSwgZSkpIHtcbiAgICAgIGQuaW5wdXQuZW5zdXJlUG9sbGVkKCk7XG4gICAgICBjbGVhclRpbWVvdXQodG91Y2hGaW5pc2hlZCk7XG4gICAgICB2YXIgbm93ID0gK25ldyBEYXRlO1xuICAgICAgZC5hY3RpdmVUb3VjaCA9IHtzdGFydDogbm93LCBtb3ZlZDogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgICAgIHByZXY6IG5vdyAtIHByZXZUb3VjaC5lbmQgPD0gMzAwID8gcHJldlRvdWNoIDogbnVsbH07XG4gICAgICBpZiAoZS50b3VjaGVzLmxlbmd0aCA9PSAxKSB7XG4gICAgICAgIGQuYWN0aXZlVG91Y2gubGVmdCA9IGUudG91Y2hlc1swXS5wYWdlWDtcbiAgICAgICAgZC5hY3RpdmVUb3VjaC50b3AgPSBlLnRvdWNoZXNbMF0ucGFnZVk7XG4gICAgICB9XG4gICAgfVxuICB9KTtcbiAgb24oZC5zY3JvbGxlciwgXCJ0b3VjaG1vdmVcIiwgZnVuY3Rpb24gKCkge1xuICAgIGlmIChkLmFjdGl2ZVRvdWNoKSB7IGQuYWN0aXZlVG91Y2gubW92ZWQgPSB0cnVlOyB9XG4gIH0pO1xuICBvbihkLnNjcm9sbGVyLCBcInRvdWNoZW5kXCIsIGZ1bmN0aW9uIChlKSB7XG4gICAgdmFyIHRvdWNoID0gZC5hY3RpdmVUb3VjaDtcbiAgICBpZiAodG91Y2ggJiYgIWV2ZW50SW5XaWRnZXQoZCwgZSkgJiYgdG91Y2gubGVmdCAhPSBudWxsICYmXG4gICAgICAgICF0b3VjaC5tb3ZlZCAmJiBuZXcgRGF0ZSAtIHRvdWNoLnN0YXJ0IDwgMzAwKSB7XG4gICAgICB2YXIgcG9zID0gY20uY29vcmRzQ2hhcihkLmFjdGl2ZVRvdWNoLCBcInBhZ2VcIiksIHJhbmdlO1xuICAgICAgaWYgKCF0b3VjaC5wcmV2IHx8IGZhckF3YXkodG91Y2gsIHRvdWNoLnByZXYpKSAvLyBTaW5nbGUgdGFwXG4gICAgICAgIHsgcmFuZ2UgPSBuZXcgUmFuZ2UocG9zLCBwb3MpOyB9XG4gICAgICBlbHNlIGlmICghdG91Y2gucHJldi5wcmV2IHx8IGZhckF3YXkodG91Y2gsIHRvdWNoLnByZXYucHJldikpIC8vIERvdWJsZSB0YXBcbiAgICAgICAgeyByYW5nZSA9IGNtLmZpbmRXb3JkQXQocG9zKTsgfVxuICAgICAgZWxzZSAvLyBUcmlwbGUgdGFwXG4gICAgICAgIHsgcmFuZ2UgPSBuZXcgUmFuZ2UoUG9zKHBvcy5saW5lLCAwKSwgY2xpcFBvcyhjbS5kb2MsIFBvcyhwb3MubGluZSArIDEsIDApKSk7IH1cbiAgICAgIGNtLnNldFNlbGVjdGlvbihyYW5nZS5hbmNob3IsIHJhbmdlLmhlYWQpO1xuICAgICAgY20uZm9jdXMoKTtcbiAgICAgIGVfcHJldmVudERlZmF1bHQoZSk7XG4gICAgfVxuICAgIGZpbmlzaFRvdWNoKCk7XG4gIH0pO1xuICBvbihkLnNjcm9sbGVyLCBcInRvdWNoY2FuY2VsXCIsIGZpbmlzaFRvdWNoKTtcblxuICAvLyBTeW5jIHNjcm9sbGluZyBiZXR3ZWVuIGZha2Ugc2Nyb2xsYmFycyBhbmQgcmVhbCBzY3JvbGxhYmxlXG4gIC8vIGFyZWEsIGVuc3VyZSB2aWV3cG9ydCBpcyB1cGRhdGVkIHdoZW4gc2Nyb2xsaW5nLlxuICBvbihkLnNjcm9sbGVyLCBcInNjcm9sbFwiLCBmdW5jdGlvbiAoKSB7XG4gICAgaWYgKGQuc2Nyb2xsZXIuY2xpZW50SGVpZ2h0KSB7XG4gICAgICB1cGRhdGVTY3JvbGxUb3AoY20sIGQuc2Nyb2xsZXIuc2Nyb2xsVG9wKTtcbiAgICAgIHNldFNjcm9sbExlZnQoY20sIGQuc2Nyb2xsZXIuc2Nyb2xsTGVmdCwgdHJ1ZSk7XG4gICAgICBzaWduYWwoY20sIFwic2Nyb2xsXCIsIGNtKTtcbiAgICB9XG4gIH0pO1xuXG4gIC8vIExpc3RlbiB0byB3aGVlbCBldmVudHMgaW4gb3JkZXIgdG8gdHJ5IGFuZCB1cGRhdGUgdGhlIHZpZXdwb3J0IG9uIHRpbWUuXG4gIG9uKGQuc2Nyb2xsZXIsIFwibW91c2V3aGVlbFwiLCBmdW5jdGlvbiAoZSkgeyByZXR1cm4gb25TY3JvbGxXaGVlbChjbSwgZSk7IH0pO1xuICBvbihkLnNjcm9sbGVyLCBcIkRPTU1vdXNlU2Nyb2xsXCIsIGZ1bmN0aW9uIChlKSB7IHJldHVybiBvblNjcm9sbFdoZWVsKGNtLCBlKTsgfSk7XG5cbiAgLy8gUHJldmVudCB3cmFwcGVyIGZyb20gZXZlciBzY3JvbGxpbmdcbiAgb24oZC53cmFwcGVyLCBcInNjcm9sbFwiLCBmdW5jdGlvbiAoKSB7IHJldHVybiBkLndyYXBwZXIuc2Nyb2xsVG9wID0gZC53cmFwcGVyLnNjcm9sbExlZnQgPSAwOyB9KTtcblxuICBkLmRyYWdGdW5jdGlvbnMgPSB7XG4gICAgZW50ZXI6IGZ1bmN0aW9uIChlKSB7aWYgKCFzaWduYWxET01FdmVudChjbSwgZSkpIHsgZV9zdG9wKGUpOyB9fSxcbiAgICBvdmVyOiBmdW5jdGlvbiAoZSkge2lmICghc2lnbmFsRE9NRXZlbnQoY20sIGUpKSB7IG9uRHJhZ092ZXIoY20sIGUpOyBlX3N0b3AoZSk7IH19LFxuICAgIHN0YXJ0OiBmdW5jdGlvbiAoZSkgeyByZXR1cm4gb25EcmFnU3RhcnQoY20sIGUpOyB9LFxuICAgIGRyb3A6IG9wZXJhdGlvbihjbSwgb25Ecm9wKSxcbiAgICBsZWF2ZTogZnVuY3Rpb24gKGUpIHtpZiAoIXNpZ25hbERPTUV2ZW50KGNtLCBlKSkgeyBjbGVhckRyYWdDdXJzb3IoY20pOyB9fVxuICB9O1xuXG4gIHZhciBpbnAgPSBkLmlucHV0LmdldEZpZWxkKCk7XG4gIG9uKGlucCwgXCJrZXl1cFwiLCBmdW5jdGlvbiAoZSkgeyByZXR1cm4gb25LZXlVcC5jYWxsKGNtLCBlKTsgfSk7XG4gIG9uKGlucCwgXCJrZXlkb3duXCIsIG9wZXJhdGlvbihjbSwgb25LZXlEb3duKSk7XG4gIG9uKGlucCwgXCJrZXlwcmVzc1wiLCBvcGVyYXRpb24oY20sIG9uS2V5UHJlc3MpKTtcbiAgb24oaW5wLCBcImZvY3VzXCIsIGZ1bmN0aW9uIChlKSB7IHJldHVybiBvbkZvY3VzKGNtLCBlKTsgfSk7XG4gIG9uKGlucCwgXCJibHVyXCIsIGZ1bmN0aW9uIChlKSB7IHJldHVybiBvbkJsdXIoY20sIGUpOyB9KTtcbn1cblxudmFyIGluaXRIb29rcyA9IFtdO1xuQ29kZU1pcnJvciQxLmRlZmluZUluaXRIb29rID0gZnVuY3Rpb24gKGYpIHsgcmV0dXJuIGluaXRIb29rcy5wdXNoKGYpOyB9O1xuXG4vLyBJbmRlbnQgdGhlIGdpdmVuIGxpbmUuIFRoZSBob3cgcGFyYW1ldGVyIGNhbiBiZSBcInNtYXJ0XCIsXG4vLyBcImFkZFwiL251bGwsIFwic3VidHJhY3RcIiwgb3IgXCJwcmV2XCIuIFdoZW4gYWdncmVzc2l2ZSBpcyBmYWxzZVxuLy8gKHR5cGljYWxseSBzZXQgdG8gdHJ1ZSBmb3IgZm9yY2VkIHNpbmdsZS1saW5lIGluZGVudHMpLCBlbXB0eVxuLy8gbGluZXMgYXJlIG5vdCBpbmRlbnRlZCwgYW5kIHBsYWNlcyB3aGVyZSB0aGUgbW9kZSByZXR1cm5zIFBhc3Ncbi8vIGFyZSBsZWZ0IGFsb25lLlxuZnVuY3Rpb24gaW5kZW50TGluZShjbSwgbiwgaG93LCBhZ2dyZXNzaXZlKSB7XG4gIHZhciBkb2MgPSBjbS5kb2MsIHN0YXRlO1xuICBpZiAoaG93ID09IG51bGwpIHsgaG93ID0gXCJhZGRcIjsgfVxuICBpZiAoaG93ID09IFwic21hcnRcIikge1xuICAgIC8vIEZhbGwgYmFjayB0byBcInByZXZcIiB3aGVuIHRoZSBtb2RlIGRvZXNuJ3QgaGF2ZSBhbiBpbmRlbnRhdGlvblxuICAgIC8vIG1ldGhvZC5cbiAgICBpZiAoIWRvYy5tb2RlLmluZGVudCkgeyBob3cgPSBcInByZXZcIjsgfVxuICAgIGVsc2UgeyBzdGF0ZSA9IGdldENvbnRleHRCZWZvcmUoY20sIG4pLnN0YXRlOyB9XG4gIH1cblxuICB2YXIgdGFiU2l6ZSA9IGNtLm9wdGlvbnMudGFiU2l6ZTtcbiAgdmFyIGxpbmUgPSBnZXRMaW5lKGRvYywgbiksIGN1clNwYWNlID0gY291bnRDb2x1bW4obGluZS50ZXh0LCBudWxsLCB0YWJTaXplKTtcbiAgaWYgKGxpbmUuc3RhdGVBZnRlcikgeyBsaW5lLnN0YXRlQWZ0ZXIgPSBudWxsOyB9XG4gIHZhciBjdXJTcGFjZVN0cmluZyA9IGxpbmUudGV4dC5tYXRjaCgvXlxccyovKVswXSwgaW5kZW50YXRpb247XG4gIGlmICghYWdncmVzc2l2ZSAmJiAhL1xcUy8udGVzdChsaW5lLnRleHQpKSB7XG4gICAgaW5kZW50YXRpb24gPSAwO1xuICAgIGhvdyA9IFwibm90XCI7XG4gIH0gZWxzZSBpZiAoaG93ID09IFwic21hcnRcIikge1xuICAgIGluZGVudGF0aW9uID0gZG9jLm1vZGUuaW5kZW50KHN0YXRlLCBsaW5lLnRleHQuc2xpY2UoY3VyU3BhY2VTdHJpbmcubGVuZ3RoKSwgbGluZS50ZXh0KTtcbiAgICBpZiAoaW5kZW50YXRpb24gPT0gUGFzcyB8fCBpbmRlbnRhdGlvbiA+IDE1MCkge1xuICAgICAgaWYgKCFhZ2dyZXNzaXZlKSB7IHJldHVybiB9XG4gICAgICBob3cgPSBcInByZXZcIjtcbiAgICB9XG4gIH1cbiAgaWYgKGhvdyA9PSBcInByZXZcIikge1xuICAgIGlmIChuID4gZG9jLmZpcnN0KSB7IGluZGVudGF0aW9uID0gY291bnRDb2x1bW4oZ2V0TGluZShkb2MsIG4tMSkudGV4dCwgbnVsbCwgdGFiU2l6ZSk7IH1cbiAgICBlbHNlIHsgaW5kZW50YXRpb24gPSAwOyB9XG4gIH0gZWxzZSBpZiAoaG93ID09IFwiYWRkXCIpIHtcbiAgICBpbmRlbnRhdGlvbiA9IGN1clNwYWNlICsgY20ub3B0aW9ucy5pbmRlbnRVbml0O1xuICB9IGVsc2UgaWYgKGhvdyA9PSBcInN1YnRyYWN0XCIpIHtcbiAgICBpbmRlbnRhdGlvbiA9IGN1clNwYWNlIC0gY20ub3B0aW9ucy5pbmRlbnRVbml0O1xuICB9IGVsc2UgaWYgKHR5cGVvZiBob3cgPT0gXCJudW1iZXJcIikge1xuICAgIGluZGVudGF0aW9uID0gY3VyU3BhY2UgKyBob3c7XG4gIH1cbiAgaW5kZW50YXRpb24gPSBNYXRoLm1heCgwLCBpbmRlbnRhdGlvbik7XG5cbiAgdmFyIGluZGVudFN0cmluZyA9IFwiXCIsIHBvcyA9IDA7XG4gIGlmIChjbS5vcHRpb25zLmluZGVudFdpdGhUYWJzKVxuICAgIHsgZm9yICh2YXIgaSA9IE1hdGguZmxvb3IoaW5kZW50YXRpb24gLyB0YWJTaXplKTsgaTsgLS1pKSB7cG9zICs9IHRhYlNpemU7IGluZGVudFN0cmluZyArPSBcIlxcdFwiO30gfVxuICBpZiAocG9zIDwgaW5kZW50YXRpb24pIHsgaW5kZW50U3RyaW5nICs9IHNwYWNlU3RyKGluZGVudGF0aW9uIC0gcG9zKTsgfVxuXG4gIGlmIChpbmRlbnRTdHJpbmcgIT0gY3VyU3BhY2VTdHJpbmcpIHtcbiAgICByZXBsYWNlUmFuZ2UoZG9jLCBpbmRlbnRTdHJpbmcsIFBvcyhuLCAwKSwgUG9zKG4sIGN1clNwYWNlU3RyaW5nLmxlbmd0aCksIFwiK2lucHV0XCIpO1xuICAgIGxpbmUuc3RhdGVBZnRlciA9IG51bGw7XG4gICAgcmV0dXJuIHRydWVcbiAgfSBlbHNlIHtcbiAgICAvLyBFbnN1cmUgdGhhdCwgaWYgdGhlIGN1cnNvciB3YXMgaW4gdGhlIHdoaXRlc3BhY2UgYXQgdGhlIHN0YXJ0XG4gICAgLy8gb2YgdGhlIGxpbmUsIGl0IGlzIG1vdmVkIHRvIHRoZSBlbmQgb2YgdGhhdCBzcGFjZS5cbiAgICBmb3IgKHZhciBpJDEgPSAwOyBpJDEgPCBkb2Muc2VsLnJhbmdlcy5sZW5ndGg7IGkkMSsrKSB7XG4gICAgICB2YXIgcmFuZ2UgPSBkb2Muc2VsLnJhbmdlc1tpJDFdO1xuICAgICAgaWYgKHJhbmdlLmhlYWQubGluZSA9PSBuICYmIHJhbmdlLmhlYWQuY2ggPCBjdXJTcGFjZVN0cmluZy5sZW5ndGgpIHtcbiAgICAgICAgdmFyIHBvcyQxID0gUG9zKG4sIGN1clNwYWNlU3RyaW5nLmxlbmd0aCk7XG4gICAgICAgIHJlcGxhY2VPbmVTZWxlY3Rpb24oZG9jLCBpJDEsIG5ldyBSYW5nZShwb3MkMSwgcG9zJDEpKTtcbiAgICAgICAgYnJlYWtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cblxuLy8gVGhpcyB3aWxsIGJlIHNldCB0byBhIHtsaW5lV2lzZTogYm9vbCwgdGV4dDogW3N0cmluZ119IG9iamVjdCwgc29cbi8vIHRoYXQsIHdoZW4gcGFzdGluZywgd2Uga25vdyB3aGF0IGtpbmQgb2Ygc2VsZWN0aW9ucyB0aGUgY29waWVkXG4vLyB0ZXh0IHdhcyBtYWRlIG91dCBvZi5cbnZhciBsYXN0Q29waWVkID0gbnVsbDtcblxuZnVuY3Rpb24gc2V0TGFzdENvcGllZChuZXdMYXN0Q29waWVkKSB7XG4gIGxhc3RDb3BpZWQgPSBuZXdMYXN0Q29waWVkO1xufVxuXG5mdW5jdGlvbiBhcHBseVRleHRJbnB1dChjbSwgaW5zZXJ0ZWQsIGRlbGV0ZWQsIHNlbCwgb3JpZ2luKSB7XG4gIHZhciBkb2MgPSBjbS5kb2M7XG4gIGNtLmRpc3BsYXkuc2hpZnQgPSBmYWxzZTtcbiAgaWYgKCFzZWwpIHsgc2VsID0gZG9jLnNlbDsgfVxuXG4gIHZhciBwYXN0ZSA9IGNtLnN0YXRlLnBhc3RlSW5jb21pbmcgfHwgb3JpZ2luID09IFwicGFzdGVcIjtcbiAgdmFyIHRleHRMaW5lcyA9IHNwbGl0TGluZXNBdXRvKGluc2VydGVkKSwgbXVsdGlQYXN0ZSA9IG51bGw7XG4gIC8vIFdoZW4gcGFzdGluZyBOIGxpbmVzIGludG8gTiBzZWxlY3Rpb25zLCBpbnNlcnQgb25lIGxpbmUgcGVyIHNlbGVjdGlvblxuICBpZiAocGFzdGUgJiYgc2VsLnJhbmdlcy5sZW5ndGggPiAxKSB7XG4gICAgaWYgKGxhc3RDb3BpZWQgJiYgbGFzdENvcGllZC50ZXh0LmpvaW4oXCJcXG5cIikgPT0gaW5zZXJ0ZWQpIHtcbiAgICAgIGlmIChzZWwucmFuZ2VzLmxlbmd0aCAlIGxhc3RDb3BpZWQudGV4dC5sZW5ndGggPT0gMCkge1xuICAgICAgICBtdWx0aVBhc3RlID0gW107XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGFzdENvcGllZC50ZXh0Lmxlbmd0aDsgaSsrKVxuICAgICAgICAgIHsgbXVsdGlQYXN0ZS5wdXNoKGRvYy5zcGxpdExpbmVzKGxhc3RDb3BpZWQudGV4dFtpXSkpOyB9XG4gICAgICB9XG4gICAgfSBlbHNlIGlmICh0ZXh0TGluZXMubGVuZ3RoID09IHNlbC5yYW5nZXMubGVuZ3RoICYmIGNtLm9wdGlvbnMucGFzdGVMaW5lc1BlclNlbGVjdGlvbikge1xuICAgICAgbXVsdGlQYXN0ZSA9IG1hcCh0ZXh0TGluZXMsIGZ1bmN0aW9uIChsKSB7IHJldHVybiBbbF07IH0pO1xuICAgIH1cbiAgfVxuXG4gIHZhciB1cGRhdGVJbnB1dDtcbiAgLy8gTm9ybWFsIGJlaGF2aW9yIGlzIHRvIGluc2VydCB0aGUgbmV3IHRleHQgaW50byBldmVyeSBzZWxlY3Rpb25cbiAgZm9yICh2YXIgaSQxID0gc2VsLnJhbmdlcy5sZW5ndGggLSAxOyBpJDEgPj0gMDsgaSQxLS0pIHtcbiAgICB2YXIgcmFuZ2UkJDEgPSBzZWwucmFuZ2VzW2kkMV07XG4gICAgdmFyIGZyb20gPSByYW5nZSQkMS5mcm9tKCksIHRvID0gcmFuZ2UkJDEudG8oKTtcbiAgICBpZiAocmFuZ2UkJDEuZW1wdHkoKSkge1xuICAgICAgaWYgKGRlbGV0ZWQgJiYgZGVsZXRlZCA+IDApIC8vIEhhbmRsZSBkZWxldGlvblxuICAgICAgICB7IGZyb20gPSBQb3MoZnJvbS5saW5lLCBmcm9tLmNoIC0gZGVsZXRlZCk7IH1cbiAgICAgIGVsc2UgaWYgKGNtLnN0YXRlLm92ZXJ3cml0ZSAmJiAhcGFzdGUpIC8vIEhhbmRsZSBvdmVyd3JpdGVcbiAgICAgICAgeyB0byA9IFBvcyh0by5saW5lLCBNYXRoLm1pbihnZXRMaW5lKGRvYywgdG8ubGluZSkudGV4dC5sZW5ndGgsIHRvLmNoICsgbHN0KHRleHRMaW5lcykubGVuZ3RoKSk7IH1cbiAgICAgIGVsc2UgaWYgKGxhc3RDb3BpZWQgJiYgbGFzdENvcGllZC5saW5lV2lzZSAmJiBsYXN0Q29waWVkLnRleHQuam9pbihcIlxcblwiKSA9PSBpbnNlcnRlZClcbiAgICAgICAgeyBmcm9tID0gdG8gPSBQb3MoZnJvbS5saW5lLCAwKTsgfVxuICAgIH1cbiAgICB1cGRhdGVJbnB1dCA9IGNtLmN1ck9wLnVwZGF0ZUlucHV0O1xuICAgIHZhciBjaGFuZ2VFdmVudCA9IHtmcm9tOiBmcm9tLCB0bzogdG8sIHRleHQ6IG11bHRpUGFzdGUgPyBtdWx0aVBhc3RlW2kkMSAlIG11bHRpUGFzdGUubGVuZ3RoXSA6IHRleHRMaW5lcyxcbiAgICAgICAgICAgICAgICAgICAgICAgb3JpZ2luOiBvcmlnaW4gfHwgKHBhc3RlID8gXCJwYXN0ZVwiIDogY20uc3RhdGUuY3V0SW5jb21pbmcgPyBcImN1dFwiIDogXCIraW5wdXRcIil9O1xuICAgIG1ha2VDaGFuZ2UoY20uZG9jLCBjaGFuZ2VFdmVudCk7XG4gICAgc2lnbmFsTGF0ZXIoY20sIFwiaW5wdXRSZWFkXCIsIGNtLCBjaGFuZ2VFdmVudCk7XG4gIH1cbiAgaWYgKGluc2VydGVkICYmICFwYXN0ZSlcbiAgICB7IHRyaWdnZXJFbGVjdHJpYyhjbSwgaW5zZXJ0ZWQpOyB9XG5cbiAgZW5zdXJlQ3Vyc29yVmlzaWJsZShjbSk7XG4gIGNtLmN1ck9wLnVwZGF0ZUlucHV0ID0gdXBkYXRlSW5wdXQ7XG4gIGNtLmN1ck9wLnR5cGluZyA9IHRydWU7XG4gIGNtLnN0YXRlLnBhc3RlSW5jb21pbmcgPSBjbS5zdGF0ZS5jdXRJbmNvbWluZyA9IGZhbHNlO1xufVxuXG5mdW5jdGlvbiBoYW5kbGVQYXN0ZShlLCBjbSkge1xuICB2YXIgcGFzdGVkID0gZS5jbGlwYm9hcmREYXRhICYmIGUuY2xpcGJvYXJkRGF0YS5nZXREYXRhKFwiVGV4dFwiKTtcbiAgaWYgKHBhc3RlZCkge1xuICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICBpZiAoIWNtLmlzUmVhZE9ubHkoKSAmJiAhY20ub3B0aW9ucy5kaXNhYmxlSW5wdXQpXG4gICAgICB7IHJ1bkluT3AoY20sIGZ1bmN0aW9uICgpIHsgcmV0dXJuIGFwcGx5VGV4dElucHV0KGNtLCBwYXN0ZWQsIDAsIG51bGwsIFwicGFzdGVcIik7IH0pOyB9XG4gICAgcmV0dXJuIHRydWVcbiAgfVxufVxuXG5mdW5jdGlvbiB0cmlnZ2VyRWxlY3RyaWMoY20sIGluc2VydGVkKSB7XG4gIC8vIFdoZW4gYW4gJ2VsZWN0cmljJyBjaGFyYWN0ZXIgaXMgaW5zZXJ0ZWQsIGltbWVkaWF0ZWx5IHRyaWdnZXIgYSByZWluZGVudFxuICBpZiAoIWNtLm9wdGlvbnMuZWxlY3RyaWNDaGFycyB8fCAhY20ub3B0aW9ucy5zbWFydEluZGVudCkgeyByZXR1cm4gfVxuICB2YXIgc2VsID0gY20uZG9jLnNlbDtcblxuICBmb3IgKHZhciBpID0gc2VsLnJhbmdlcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgIHZhciByYW5nZSQkMSA9IHNlbC5yYW5nZXNbaV07XG4gICAgaWYgKHJhbmdlJCQxLmhlYWQuY2ggPiAxMDAgfHwgKGkgJiYgc2VsLnJhbmdlc1tpIC0gMV0uaGVhZC5saW5lID09IHJhbmdlJCQxLmhlYWQubGluZSkpIHsgY29udGludWUgfVxuICAgIHZhciBtb2RlID0gY20uZ2V0TW9kZUF0KHJhbmdlJCQxLmhlYWQpO1xuICAgIHZhciBpbmRlbnRlZCA9IGZhbHNlO1xuICAgIGlmIChtb2RlLmVsZWN0cmljQ2hhcnMpIHtcbiAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgbW9kZS5lbGVjdHJpY0NoYXJzLmxlbmd0aDsgaisrKVxuICAgICAgICB7IGlmIChpbnNlcnRlZC5pbmRleE9mKG1vZGUuZWxlY3RyaWNDaGFycy5jaGFyQXQoaikpID4gLTEpIHtcbiAgICAgICAgICBpbmRlbnRlZCA9IGluZGVudExpbmUoY20sIHJhbmdlJCQxLmhlYWQubGluZSwgXCJzbWFydFwiKTtcbiAgICAgICAgICBicmVha1xuICAgICAgICB9IH1cbiAgICB9IGVsc2UgaWYgKG1vZGUuZWxlY3RyaWNJbnB1dCkge1xuICAgICAgaWYgKG1vZGUuZWxlY3RyaWNJbnB1dC50ZXN0KGdldExpbmUoY20uZG9jLCByYW5nZSQkMS5oZWFkLmxpbmUpLnRleHQuc2xpY2UoMCwgcmFuZ2UkJDEuaGVhZC5jaCkpKVxuICAgICAgICB7IGluZGVudGVkID0gaW5kZW50TGluZShjbSwgcmFuZ2UkJDEuaGVhZC5saW5lLCBcInNtYXJ0XCIpOyB9XG4gICAgfVxuICAgIGlmIChpbmRlbnRlZCkgeyBzaWduYWxMYXRlcihjbSwgXCJlbGVjdHJpY0lucHV0XCIsIGNtLCByYW5nZSQkMS5oZWFkLmxpbmUpOyB9XG4gIH1cbn1cblxuZnVuY3Rpb24gY29weWFibGVSYW5nZXMoY20pIHtcbiAgdmFyIHRleHQgPSBbXSwgcmFuZ2VzID0gW107XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgY20uZG9jLnNlbC5yYW5nZXMubGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgbGluZSA9IGNtLmRvYy5zZWwucmFuZ2VzW2ldLmhlYWQubGluZTtcbiAgICB2YXIgbGluZVJhbmdlID0ge2FuY2hvcjogUG9zKGxpbmUsIDApLCBoZWFkOiBQb3MobGluZSArIDEsIDApfTtcbiAgICByYW5nZXMucHVzaChsaW5lUmFuZ2UpO1xuICAgIHRleHQucHVzaChjbS5nZXRSYW5nZShsaW5lUmFuZ2UuYW5jaG9yLCBsaW5lUmFuZ2UuaGVhZCkpO1xuICB9XG4gIHJldHVybiB7dGV4dDogdGV4dCwgcmFuZ2VzOiByYW5nZXN9XG59XG5cbmZ1bmN0aW9uIGRpc2FibGVCcm93c2VyTWFnaWMoZmllbGQsIHNwZWxsY2hlY2spIHtcbiAgZmllbGQuc2V0QXR0cmlidXRlKFwiYXV0b2NvcnJlY3RcIiwgXCJvZmZcIik7XG4gIGZpZWxkLnNldEF0dHJpYnV0ZShcImF1dG9jYXBpdGFsaXplXCIsIFwib2ZmXCIpO1xuICBmaWVsZC5zZXRBdHRyaWJ1dGUoXCJzcGVsbGNoZWNrXCIsICEhc3BlbGxjaGVjayk7XG59XG5cbmZ1bmN0aW9uIGhpZGRlblRleHRhcmVhKCkge1xuICB2YXIgdGUgPSBlbHQoXCJ0ZXh0YXJlYVwiLCBudWxsLCBudWxsLCBcInBvc2l0aW9uOiBhYnNvbHV0ZTsgYm90dG9tOiAtMWVtOyBwYWRkaW5nOiAwOyB3aWR0aDogMXB4OyBoZWlnaHQ6IDFlbTsgb3V0bGluZTogbm9uZVwiKTtcbiAgdmFyIGRpdiA9IGVsdChcImRpdlwiLCBbdGVdLCBudWxsLCBcIm92ZXJmbG93OiBoaWRkZW47IHBvc2l0aW9uOiByZWxhdGl2ZTsgd2lkdGg6IDNweDsgaGVpZ2h0OiAwcHg7XCIpO1xuICAvLyBUaGUgdGV4dGFyZWEgaXMga2VwdCBwb3NpdGlvbmVkIG5lYXIgdGhlIGN1cnNvciB0byBwcmV2ZW50IHRoZVxuICAvLyBmYWN0IHRoYXQgaXQnbGwgYmUgc2Nyb2xsZWQgaW50byB2aWV3IG9uIGlucHV0IGZyb20gc2Nyb2xsaW5nXG4gIC8vIG91ciBmYWtlIGN1cnNvciBvdXQgb2Ygdmlldy4gT24gd2Via2l0LCB3aGVuIHdyYXA9b2ZmLCBwYXN0ZSBpc1xuICAvLyB2ZXJ5IHNsb3cuIFNvIG1ha2UgdGhlIGFyZWEgd2lkZSBpbnN0ZWFkLlxuICBpZiAod2Via2l0KSB7IHRlLnN0eWxlLndpZHRoID0gXCIxMDAwcHhcIjsgfVxuICBlbHNlIHsgdGUuc2V0QXR0cmlidXRlKFwid3JhcFwiLCBcIm9mZlwiKTsgfVxuICAvLyBJZiBib3JkZXI6IDA7IC0tIGlPUyBmYWlscyB0byBvcGVuIGtleWJvYXJkIChpc3N1ZSAjMTI4NylcbiAgaWYgKGlvcykgeyB0ZS5zdHlsZS5ib3JkZXIgPSBcIjFweCBzb2xpZCBibGFja1wiOyB9XG4gIGRpc2FibGVCcm93c2VyTWFnaWModGUpO1xuICByZXR1cm4gZGl2XG59XG5cbi8vIFRoZSBwdWJsaWNseSB2aXNpYmxlIEFQSS4gTm90ZSB0aGF0IG1ldGhvZE9wKGYpIG1lYW5zXG4vLyAnd3JhcCBmIGluIGFuIG9wZXJhdGlvbiwgcGVyZm9ybWVkIG9uIGl0cyBgdGhpc2AgcGFyYW1ldGVyJy5cblxuLy8gVGhpcyBpcyBub3QgdGhlIGNvbXBsZXRlIHNldCBvZiBlZGl0b3IgbWV0aG9kcy4gTW9zdCBvZiB0aGVcbi8vIG1ldGhvZHMgZGVmaW5lZCBvbiB0aGUgRG9jIHR5cGUgYXJlIGFsc28gaW5qZWN0ZWQgaW50b1xuLy8gQ29kZU1pcnJvci5wcm90b3R5cGUsIGZvciBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eSBhbmRcbi8vIGNvbnZlbmllbmNlLlxuXG52YXIgYWRkRWRpdG9yTWV0aG9kcyA9IGZ1bmN0aW9uKENvZGVNaXJyb3IpIHtcbiAgdmFyIG9wdGlvbkhhbmRsZXJzID0gQ29kZU1pcnJvci5vcHRpb25IYW5kbGVycztcblxuICB2YXIgaGVscGVycyA9IENvZGVNaXJyb3IuaGVscGVycyA9IHt9O1xuXG4gIENvZGVNaXJyb3IucHJvdG90eXBlID0ge1xuICAgIGNvbnN0cnVjdG9yOiBDb2RlTWlycm9yLFxuICAgIGZvY3VzOiBmdW5jdGlvbigpe3dpbmRvdy5mb2N1cygpOyB0aGlzLmRpc3BsYXkuaW5wdXQuZm9jdXMoKTt9LFxuXG4gICAgc2V0T3B0aW9uOiBmdW5jdGlvbihvcHRpb24sIHZhbHVlKSB7XG4gICAgICB2YXIgb3B0aW9ucyA9IHRoaXMub3B0aW9ucywgb2xkID0gb3B0aW9uc1tvcHRpb25dO1xuICAgICAgaWYgKG9wdGlvbnNbb3B0aW9uXSA9PSB2YWx1ZSAmJiBvcHRpb24gIT0gXCJtb2RlXCIpIHsgcmV0dXJuIH1cbiAgICAgIG9wdGlvbnNbb3B0aW9uXSA9IHZhbHVlO1xuICAgICAgaWYgKG9wdGlvbkhhbmRsZXJzLmhhc093blByb3BlcnR5KG9wdGlvbikpXG4gICAgICAgIHsgb3BlcmF0aW9uKHRoaXMsIG9wdGlvbkhhbmRsZXJzW29wdGlvbl0pKHRoaXMsIHZhbHVlLCBvbGQpOyB9XG4gICAgICBzaWduYWwodGhpcywgXCJvcHRpb25DaGFuZ2VcIiwgdGhpcywgb3B0aW9uKTtcbiAgICB9LFxuXG4gICAgZ2V0T3B0aW9uOiBmdW5jdGlvbihvcHRpb24pIHtyZXR1cm4gdGhpcy5vcHRpb25zW29wdGlvbl19LFxuICAgIGdldERvYzogZnVuY3Rpb24oKSB7cmV0dXJuIHRoaXMuZG9jfSxcblxuICAgIGFkZEtleU1hcDogZnVuY3Rpb24obWFwJCQxLCBib3R0b20pIHtcbiAgICAgIHRoaXMuc3RhdGUua2V5TWFwc1tib3R0b20gPyBcInB1c2hcIiA6IFwidW5zaGlmdFwiXShnZXRLZXlNYXAobWFwJCQxKSk7XG4gICAgfSxcbiAgICByZW1vdmVLZXlNYXA6IGZ1bmN0aW9uKG1hcCQkMSkge1xuICAgICAgdmFyIG1hcHMgPSB0aGlzLnN0YXRlLmtleU1hcHM7XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG1hcHMubGVuZ3RoOyArK2kpXG4gICAgICAgIHsgaWYgKG1hcHNbaV0gPT0gbWFwJCQxIHx8IG1hcHNbaV0ubmFtZSA9PSBtYXAkJDEpIHtcbiAgICAgICAgICBtYXBzLnNwbGljZShpLCAxKTtcbiAgICAgICAgICByZXR1cm4gdHJ1ZVxuICAgICAgICB9IH1cbiAgICB9LFxuXG4gICAgYWRkT3ZlcmxheTogbWV0aG9kT3AoZnVuY3Rpb24oc3BlYywgb3B0aW9ucykge1xuICAgICAgdmFyIG1vZGUgPSBzcGVjLnRva2VuID8gc3BlYyA6IENvZGVNaXJyb3IuZ2V0TW9kZSh0aGlzLm9wdGlvbnMsIHNwZWMpO1xuICAgICAgaWYgKG1vZGUuc3RhcnRTdGF0ZSkgeyB0aHJvdyBuZXcgRXJyb3IoXCJPdmVybGF5cyBtYXkgbm90IGJlIHN0YXRlZnVsLlwiKSB9XG4gICAgICBpbnNlcnRTb3J0ZWQodGhpcy5zdGF0ZS5vdmVybGF5cyxcbiAgICAgICAgICAgICAgICAgICB7bW9kZTogbW9kZSwgbW9kZVNwZWM6IHNwZWMsIG9wYXF1ZTogb3B0aW9ucyAmJiBvcHRpb25zLm9wYXF1ZSxcbiAgICAgICAgICAgICAgICAgICAgcHJpb3JpdHk6IChvcHRpb25zICYmIG9wdGlvbnMucHJpb3JpdHkpIHx8IDB9LFxuICAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uIChvdmVybGF5KSB7IHJldHVybiBvdmVybGF5LnByaW9yaXR5OyB9KTtcbiAgICAgIHRoaXMuc3RhdGUubW9kZUdlbisrO1xuICAgICAgcmVnQ2hhbmdlKHRoaXMpO1xuICAgIH0pLFxuICAgIHJlbW92ZU92ZXJsYXk6IG1ldGhvZE9wKGZ1bmN0aW9uKHNwZWMpIHtcbiAgICAgIHZhciB0aGlzJDEgPSB0aGlzO1xuXG4gICAgICB2YXIgb3ZlcmxheXMgPSB0aGlzLnN0YXRlLm92ZXJsYXlzO1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBvdmVybGF5cy5sZW5ndGg7ICsraSkge1xuICAgICAgICB2YXIgY3VyID0gb3ZlcmxheXNbaV0ubW9kZVNwZWM7XG4gICAgICAgIGlmIChjdXIgPT0gc3BlYyB8fCB0eXBlb2Ygc3BlYyA9PSBcInN0cmluZ1wiICYmIGN1ci5uYW1lID09IHNwZWMpIHtcbiAgICAgICAgICBvdmVybGF5cy5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgdGhpcyQxLnN0YXRlLm1vZGVHZW4rKztcbiAgICAgICAgICByZWdDaGFuZ2UodGhpcyQxKTtcbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pLFxuXG4gICAgaW5kZW50TGluZTogbWV0aG9kT3AoZnVuY3Rpb24obiwgZGlyLCBhZ2dyZXNzaXZlKSB7XG4gICAgICBpZiAodHlwZW9mIGRpciAhPSBcInN0cmluZ1wiICYmIHR5cGVvZiBkaXIgIT0gXCJudW1iZXJcIikge1xuICAgICAgICBpZiAoZGlyID09IG51bGwpIHsgZGlyID0gdGhpcy5vcHRpb25zLnNtYXJ0SW5kZW50ID8gXCJzbWFydFwiIDogXCJwcmV2XCI7IH1cbiAgICAgICAgZWxzZSB7IGRpciA9IGRpciA/IFwiYWRkXCIgOiBcInN1YnRyYWN0XCI7IH1cbiAgICAgIH1cbiAgICAgIGlmIChpc0xpbmUodGhpcy5kb2MsIG4pKSB7IGluZGVudExpbmUodGhpcywgbiwgZGlyLCBhZ2dyZXNzaXZlKTsgfVxuICAgIH0pLFxuICAgIGluZGVudFNlbGVjdGlvbjogbWV0aG9kT3AoZnVuY3Rpb24oaG93KSB7XG4gICAgICB2YXIgdGhpcyQxID0gdGhpcztcblxuICAgICAgdmFyIHJhbmdlcyA9IHRoaXMuZG9jLnNlbC5yYW5nZXMsIGVuZCA9IC0xO1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCByYW5nZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFyIHJhbmdlJCQxID0gcmFuZ2VzW2ldO1xuICAgICAgICBpZiAoIXJhbmdlJCQxLmVtcHR5KCkpIHtcbiAgICAgICAgICB2YXIgZnJvbSA9IHJhbmdlJCQxLmZyb20oKSwgdG8gPSByYW5nZSQkMS50bygpO1xuICAgICAgICAgIHZhciBzdGFydCA9IE1hdGgubWF4KGVuZCwgZnJvbS5saW5lKTtcbiAgICAgICAgICBlbmQgPSBNYXRoLm1pbih0aGlzJDEubGFzdExpbmUoKSwgdG8ubGluZSAtICh0by5jaCA/IDAgOiAxKSkgKyAxO1xuICAgICAgICAgIGZvciAodmFyIGogPSBzdGFydDsgaiA8IGVuZDsgKytqKVxuICAgICAgICAgICAgeyBpbmRlbnRMaW5lKHRoaXMkMSwgaiwgaG93KTsgfVxuICAgICAgICAgIHZhciBuZXdSYW5nZXMgPSB0aGlzJDEuZG9jLnNlbC5yYW5nZXM7XG4gICAgICAgICAgaWYgKGZyb20uY2ggPT0gMCAmJiByYW5nZXMubGVuZ3RoID09IG5ld1Jhbmdlcy5sZW5ndGggJiYgbmV3UmFuZ2VzW2ldLmZyb20oKS5jaCA+IDApXG4gICAgICAgICAgICB7IHJlcGxhY2VPbmVTZWxlY3Rpb24odGhpcyQxLmRvYywgaSwgbmV3IFJhbmdlKGZyb20sIG5ld1Jhbmdlc1tpXS50bygpKSwgc2VsX2RvbnRTY3JvbGwpOyB9XG4gICAgICAgIH0gZWxzZSBpZiAocmFuZ2UkJDEuaGVhZC5saW5lID4gZW5kKSB7XG4gICAgICAgICAgaW5kZW50TGluZSh0aGlzJDEsIHJhbmdlJCQxLmhlYWQubGluZSwgaG93LCB0cnVlKTtcbiAgICAgICAgICBlbmQgPSByYW5nZSQkMS5oZWFkLmxpbmU7XG4gICAgICAgICAgaWYgKGkgPT0gdGhpcyQxLmRvYy5zZWwucHJpbUluZGV4KSB7IGVuc3VyZUN1cnNvclZpc2libGUodGhpcyQxKTsgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSksXG5cbiAgICAvLyBGZXRjaCB0aGUgcGFyc2VyIHRva2VuIGZvciBhIGdpdmVuIGNoYXJhY3Rlci4gVXNlZnVsIGZvciBoYWNrc1xuICAgIC8vIHRoYXQgd2FudCB0byBpbnNwZWN0IHRoZSBtb2RlIHN0YXRlIChzYXksIGZvciBjb21wbGV0aW9uKS5cbiAgICBnZXRUb2tlbkF0OiBmdW5jdGlvbihwb3MsIHByZWNpc2UpIHtcbiAgICAgIHJldHVybiB0YWtlVG9rZW4odGhpcywgcG9zLCBwcmVjaXNlKVxuICAgIH0sXG5cbiAgICBnZXRMaW5lVG9rZW5zOiBmdW5jdGlvbihsaW5lLCBwcmVjaXNlKSB7XG4gICAgICByZXR1cm4gdGFrZVRva2VuKHRoaXMsIFBvcyhsaW5lKSwgcHJlY2lzZSwgdHJ1ZSlcbiAgICB9LFxuXG4gICAgZ2V0VG9rZW5UeXBlQXQ6IGZ1bmN0aW9uKHBvcykge1xuICAgICAgcG9zID0gY2xpcFBvcyh0aGlzLmRvYywgcG9zKTtcbiAgICAgIHZhciBzdHlsZXMgPSBnZXRMaW5lU3R5bGVzKHRoaXMsIGdldExpbmUodGhpcy5kb2MsIHBvcy5saW5lKSk7XG4gICAgICB2YXIgYmVmb3JlID0gMCwgYWZ0ZXIgPSAoc3R5bGVzLmxlbmd0aCAtIDEpIC8gMiwgY2ggPSBwb3MuY2g7XG4gICAgICB2YXIgdHlwZTtcbiAgICAgIGlmIChjaCA9PSAwKSB7IHR5cGUgPSBzdHlsZXNbMl07IH1cbiAgICAgIGVsc2UgeyBmb3IgKDs7KSB7XG4gICAgICAgIHZhciBtaWQgPSAoYmVmb3JlICsgYWZ0ZXIpID4+IDE7XG4gICAgICAgIGlmICgobWlkID8gc3R5bGVzW21pZCAqIDIgLSAxXSA6IDApID49IGNoKSB7IGFmdGVyID0gbWlkOyB9XG4gICAgICAgIGVsc2UgaWYgKHN0eWxlc1ttaWQgKiAyICsgMV0gPCBjaCkgeyBiZWZvcmUgPSBtaWQgKyAxOyB9XG4gICAgICAgIGVsc2UgeyB0eXBlID0gc3R5bGVzW21pZCAqIDIgKyAyXTsgYnJlYWsgfVxuICAgICAgfSB9XG4gICAgICB2YXIgY3V0ID0gdHlwZSA/IHR5cGUuaW5kZXhPZihcIm92ZXJsYXkgXCIpIDogLTE7XG4gICAgICByZXR1cm4gY3V0IDwgMCA/IHR5cGUgOiBjdXQgPT0gMCA/IG51bGwgOiB0eXBlLnNsaWNlKDAsIGN1dCAtIDEpXG4gICAgfSxcblxuICAgIGdldE1vZGVBdDogZnVuY3Rpb24ocG9zKSB7XG4gICAgICB2YXIgbW9kZSA9IHRoaXMuZG9jLm1vZGU7XG4gICAgICBpZiAoIW1vZGUuaW5uZXJNb2RlKSB7IHJldHVybiBtb2RlIH1cbiAgICAgIHJldHVybiBDb2RlTWlycm9yLmlubmVyTW9kZShtb2RlLCB0aGlzLmdldFRva2VuQXQocG9zKS5zdGF0ZSkubW9kZVxuICAgIH0sXG5cbiAgICBnZXRIZWxwZXI6IGZ1bmN0aW9uKHBvcywgdHlwZSkge1xuICAgICAgcmV0dXJuIHRoaXMuZ2V0SGVscGVycyhwb3MsIHR5cGUpWzBdXG4gICAgfSxcblxuICAgIGdldEhlbHBlcnM6IGZ1bmN0aW9uKHBvcywgdHlwZSkge1xuICAgICAgdmFyIHRoaXMkMSA9IHRoaXM7XG5cbiAgICAgIHZhciBmb3VuZCA9IFtdO1xuICAgICAgaWYgKCFoZWxwZXJzLmhhc093blByb3BlcnR5KHR5cGUpKSB7IHJldHVybiBmb3VuZCB9XG4gICAgICB2YXIgaGVscCA9IGhlbHBlcnNbdHlwZV0sIG1vZGUgPSB0aGlzLmdldE1vZGVBdChwb3MpO1xuICAgICAgaWYgKHR5cGVvZiBtb2RlW3R5cGVdID09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgaWYgKGhlbHBbbW9kZVt0eXBlXV0pIHsgZm91bmQucHVzaChoZWxwW21vZGVbdHlwZV1dKTsgfVxuICAgICAgfSBlbHNlIGlmIChtb2RlW3R5cGVdKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbW9kZVt0eXBlXS5sZW5ndGg7IGkrKykge1xuICAgICAgICAgIHZhciB2YWwgPSBoZWxwW21vZGVbdHlwZV1baV1dO1xuICAgICAgICAgIGlmICh2YWwpIHsgZm91bmQucHVzaCh2YWwpOyB9XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAobW9kZS5oZWxwZXJUeXBlICYmIGhlbHBbbW9kZS5oZWxwZXJUeXBlXSkge1xuICAgICAgICBmb3VuZC5wdXNoKGhlbHBbbW9kZS5oZWxwZXJUeXBlXSk7XG4gICAgICB9IGVsc2UgaWYgKGhlbHBbbW9kZS5uYW1lXSkge1xuICAgICAgICBmb3VuZC5wdXNoKGhlbHBbbW9kZS5uYW1lXSk7XG4gICAgICB9XG4gICAgICBmb3IgKHZhciBpJDEgPSAwOyBpJDEgPCBoZWxwLl9nbG9iYWwubGVuZ3RoOyBpJDErKykge1xuICAgICAgICB2YXIgY3VyID0gaGVscC5fZ2xvYmFsW2kkMV07XG4gICAgICAgIGlmIChjdXIucHJlZChtb2RlLCB0aGlzJDEpICYmIGluZGV4T2YoZm91bmQsIGN1ci52YWwpID09IC0xKVxuICAgICAgICAgIHsgZm91bmQucHVzaChjdXIudmFsKTsgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIGZvdW5kXG4gICAgfSxcblxuICAgIGdldFN0YXRlQWZ0ZXI6IGZ1bmN0aW9uKGxpbmUsIHByZWNpc2UpIHtcbiAgICAgIHZhciBkb2MgPSB0aGlzLmRvYztcbiAgICAgIGxpbmUgPSBjbGlwTGluZShkb2MsIGxpbmUgPT0gbnVsbCA/IGRvYy5maXJzdCArIGRvYy5zaXplIC0gMTogbGluZSk7XG4gICAgICByZXR1cm4gZ2V0Q29udGV4dEJlZm9yZSh0aGlzLCBsaW5lICsgMSwgcHJlY2lzZSkuc3RhdGVcbiAgICB9LFxuXG4gICAgY3Vyc29yQ29vcmRzOiBmdW5jdGlvbihzdGFydCwgbW9kZSkge1xuICAgICAgdmFyIHBvcywgcmFuZ2UkJDEgPSB0aGlzLmRvYy5zZWwucHJpbWFyeSgpO1xuICAgICAgaWYgKHN0YXJ0ID09IG51bGwpIHsgcG9zID0gcmFuZ2UkJDEuaGVhZDsgfVxuICAgICAgZWxzZSBpZiAodHlwZW9mIHN0YXJ0ID09IFwib2JqZWN0XCIpIHsgcG9zID0gY2xpcFBvcyh0aGlzLmRvYywgc3RhcnQpOyB9XG4gICAgICBlbHNlIHsgcG9zID0gc3RhcnQgPyByYW5nZSQkMS5mcm9tKCkgOiByYW5nZSQkMS50bygpOyB9XG4gICAgICByZXR1cm4gY3Vyc29yQ29vcmRzKHRoaXMsIHBvcywgbW9kZSB8fCBcInBhZ2VcIilcbiAgICB9LFxuXG4gICAgY2hhckNvb3JkczogZnVuY3Rpb24ocG9zLCBtb2RlKSB7XG4gICAgICByZXR1cm4gY2hhckNvb3Jkcyh0aGlzLCBjbGlwUG9zKHRoaXMuZG9jLCBwb3MpLCBtb2RlIHx8IFwicGFnZVwiKVxuICAgIH0sXG5cbiAgICBjb29yZHNDaGFyOiBmdW5jdGlvbihjb29yZHMsIG1vZGUpIHtcbiAgICAgIGNvb3JkcyA9IGZyb21Db29yZFN5c3RlbSh0aGlzLCBjb29yZHMsIG1vZGUgfHwgXCJwYWdlXCIpO1xuICAgICAgcmV0dXJuIGNvb3Jkc0NoYXIodGhpcywgY29vcmRzLmxlZnQsIGNvb3Jkcy50b3ApXG4gICAgfSxcblxuICAgIGxpbmVBdEhlaWdodDogZnVuY3Rpb24oaGVpZ2h0LCBtb2RlKSB7XG4gICAgICBoZWlnaHQgPSBmcm9tQ29vcmRTeXN0ZW0odGhpcywge3RvcDogaGVpZ2h0LCBsZWZ0OiAwfSwgbW9kZSB8fCBcInBhZ2VcIikudG9wO1xuICAgICAgcmV0dXJuIGxpbmVBdEhlaWdodCh0aGlzLmRvYywgaGVpZ2h0ICsgdGhpcy5kaXNwbGF5LnZpZXdPZmZzZXQpXG4gICAgfSxcbiAgICBoZWlnaHRBdExpbmU6IGZ1bmN0aW9uKGxpbmUsIG1vZGUsIGluY2x1ZGVXaWRnZXRzKSB7XG4gICAgICB2YXIgZW5kID0gZmFsc2UsIGxpbmVPYmo7XG4gICAgICBpZiAodHlwZW9mIGxpbmUgPT0gXCJudW1iZXJcIikge1xuICAgICAgICB2YXIgbGFzdCA9IHRoaXMuZG9jLmZpcnN0ICsgdGhpcy5kb2Muc2l6ZSAtIDE7XG4gICAgICAgIGlmIChsaW5lIDwgdGhpcy5kb2MuZmlyc3QpIHsgbGluZSA9IHRoaXMuZG9jLmZpcnN0OyB9XG4gICAgICAgIGVsc2UgaWYgKGxpbmUgPiBsYXN0KSB7IGxpbmUgPSBsYXN0OyBlbmQgPSB0cnVlOyB9XG4gICAgICAgIGxpbmVPYmogPSBnZXRMaW5lKHRoaXMuZG9jLCBsaW5lKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxpbmVPYmogPSBsaW5lO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGludG9Db29yZFN5c3RlbSh0aGlzLCBsaW5lT2JqLCB7dG9wOiAwLCBsZWZ0OiAwfSwgbW9kZSB8fCBcInBhZ2VcIiwgaW5jbHVkZVdpZGdldHMgfHwgZW5kKS50b3AgK1xuICAgICAgICAoZW5kID8gdGhpcy5kb2MuaGVpZ2h0IC0gaGVpZ2h0QXRMaW5lKGxpbmVPYmopIDogMClcbiAgICB9LFxuXG4gICAgZGVmYXVsdFRleHRIZWlnaHQ6IGZ1bmN0aW9uKCkgeyByZXR1cm4gdGV4dEhlaWdodCh0aGlzLmRpc3BsYXkpIH0sXG4gICAgZGVmYXVsdENoYXJXaWR0aDogZnVuY3Rpb24oKSB7IHJldHVybiBjaGFyV2lkdGgodGhpcy5kaXNwbGF5KSB9LFxuXG4gICAgZ2V0Vmlld3BvcnQ6IGZ1bmN0aW9uKCkgeyByZXR1cm4ge2Zyb206IHRoaXMuZGlzcGxheS52aWV3RnJvbSwgdG86IHRoaXMuZGlzcGxheS52aWV3VG99fSxcblxuICAgIGFkZFdpZGdldDogZnVuY3Rpb24ocG9zLCBub2RlLCBzY3JvbGwsIHZlcnQsIGhvcml6KSB7XG4gICAgICB2YXIgZGlzcGxheSA9IHRoaXMuZGlzcGxheTtcbiAgICAgIHBvcyA9IGN1cnNvckNvb3Jkcyh0aGlzLCBjbGlwUG9zKHRoaXMuZG9jLCBwb3MpKTtcbiAgICAgIHZhciB0b3AgPSBwb3MuYm90dG9tLCBsZWZ0ID0gcG9zLmxlZnQ7XG4gICAgICBub2RlLnN0eWxlLnBvc2l0aW9uID0gXCJhYnNvbHV0ZVwiO1xuICAgICAgbm9kZS5zZXRBdHRyaWJ1dGUoXCJjbS1pZ25vcmUtZXZlbnRzXCIsIFwidHJ1ZVwiKTtcbiAgICAgIHRoaXMuZGlzcGxheS5pbnB1dC5zZXRVbmVkaXRhYmxlKG5vZGUpO1xuICAgICAgZGlzcGxheS5zaXplci5hcHBlbmRDaGlsZChub2RlKTtcbiAgICAgIGlmICh2ZXJ0ID09IFwib3ZlclwiKSB7XG4gICAgICAgIHRvcCA9IHBvcy50b3A7XG4gICAgICB9IGVsc2UgaWYgKHZlcnQgPT0gXCJhYm92ZVwiIHx8IHZlcnQgPT0gXCJuZWFyXCIpIHtcbiAgICAgICAgdmFyIHZzcGFjZSA9IE1hdGgubWF4KGRpc3BsYXkud3JhcHBlci5jbGllbnRIZWlnaHQsIHRoaXMuZG9jLmhlaWdodCksXG4gICAgICAgIGhzcGFjZSA9IE1hdGgubWF4KGRpc3BsYXkuc2l6ZXIuY2xpZW50V2lkdGgsIGRpc3BsYXkubGluZVNwYWNlLmNsaWVudFdpZHRoKTtcbiAgICAgICAgLy8gRGVmYXVsdCB0byBwb3NpdGlvbmluZyBhYm92ZSAoaWYgc3BlY2lmaWVkIGFuZCBwb3NzaWJsZSk7IG90aGVyd2lzZSBkZWZhdWx0IHRvIHBvc2l0aW9uaW5nIGJlbG93XG4gICAgICAgIGlmICgodmVydCA9PSAnYWJvdmUnIHx8IHBvcy5ib3R0b20gKyBub2RlLm9mZnNldEhlaWdodCA+IHZzcGFjZSkgJiYgcG9zLnRvcCA+IG5vZGUub2Zmc2V0SGVpZ2h0KVxuICAgICAgICAgIHsgdG9wID0gcG9zLnRvcCAtIG5vZGUub2Zmc2V0SGVpZ2h0OyB9XG4gICAgICAgIGVsc2UgaWYgKHBvcy5ib3R0b20gKyBub2RlLm9mZnNldEhlaWdodCA8PSB2c3BhY2UpXG4gICAgICAgICAgeyB0b3AgPSBwb3MuYm90dG9tOyB9XG4gICAgICAgIGlmIChsZWZ0ICsgbm9kZS5vZmZzZXRXaWR0aCA+IGhzcGFjZSlcbiAgICAgICAgICB7IGxlZnQgPSBoc3BhY2UgLSBub2RlLm9mZnNldFdpZHRoOyB9XG4gICAgICB9XG4gICAgICBub2RlLnN0eWxlLnRvcCA9IHRvcCArIFwicHhcIjtcbiAgICAgIG5vZGUuc3R5bGUubGVmdCA9IG5vZGUuc3R5bGUucmlnaHQgPSBcIlwiO1xuICAgICAgaWYgKGhvcml6ID09IFwicmlnaHRcIikge1xuICAgICAgICBsZWZ0ID0gZGlzcGxheS5zaXplci5jbGllbnRXaWR0aCAtIG5vZGUub2Zmc2V0V2lkdGg7XG4gICAgICAgIG5vZGUuc3R5bGUucmlnaHQgPSBcIjBweFwiO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKGhvcml6ID09IFwibGVmdFwiKSB7IGxlZnQgPSAwOyB9XG4gICAgICAgIGVsc2UgaWYgKGhvcml6ID09IFwibWlkZGxlXCIpIHsgbGVmdCA9IChkaXNwbGF5LnNpemVyLmNsaWVudFdpZHRoIC0gbm9kZS5vZmZzZXRXaWR0aCkgLyAyOyB9XG4gICAgICAgIG5vZGUuc3R5bGUubGVmdCA9IGxlZnQgKyBcInB4XCI7XG4gICAgICB9XG4gICAgICBpZiAoc2Nyb2xsKVxuICAgICAgICB7IHNjcm9sbEludG9WaWV3KHRoaXMsIHtsZWZ0OiBsZWZ0LCB0b3A6IHRvcCwgcmlnaHQ6IGxlZnQgKyBub2RlLm9mZnNldFdpZHRoLCBib3R0b206IHRvcCArIG5vZGUub2Zmc2V0SGVpZ2h0fSk7IH1cbiAgICB9LFxuXG4gICAgdHJpZ2dlck9uS2V5RG93bjogbWV0aG9kT3Aob25LZXlEb3duKSxcbiAgICB0cmlnZ2VyT25LZXlQcmVzczogbWV0aG9kT3Aob25LZXlQcmVzcyksXG4gICAgdHJpZ2dlck9uS2V5VXA6IG9uS2V5VXAsXG4gICAgdHJpZ2dlck9uTW91c2VEb3duOiBtZXRob2RPcChvbk1vdXNlRG93biksXG5cbiAgICBleGVjQ29tbWFuZDogZnVuY3Rpb24oY21kKSB7XG4gICAgICBpZiAoY29tbWFuZHMuaGFzT3duUHJvcGVydHkoY21kKSlcbiAgICAgICAgeyByZXR1cm4gY29tbWFuZHNbY21kXS5jYWxsKG51bGwsIHRoaXMpIH1cbiAgICB9LFxuXG4gICAgdHJpZ2dlckVsZWN0cmljOiBtZXRob2RPcChmdW5jdGlvbih0ZXh0KSB7IHRyaWdnZXJFbGVjdHJpYyh0aGlzLCB0ZXh0KTsgfSksXG5cbiAgICBmaW5kUG9zSDogZnVuY3Rpb24oZnJvbSwgYW1vdW50LCB1bml0LCB2aXN1YWxseSkge1xuICAgICAgdmFyIHRoaXMkMSA9IHRoaXM7XG5cbiAgICAgIHZhciBkaXIgPSAxO1xuICAgICAgaWYgKGFtb3VudCA8IDApIHsgZGlyID0gLTE7IGFtb3VudCA9IC1hbW91bnQ7IH1cbiAgICAgIHZhciBjdXIgPSBjbGlwUG9zKHRoaXMuZG9jLCBmcm9tKTtcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYW1vdW50OyArK2kpIHtcbiAgICAgICAgY3VyID0gZmluZFBvc0godGhpcyQxLmRvYywgY3VyLCBkaXIsIHVuaXQsIHZpc3VhbGx5KTtcbiAgICAgICAgaWYgKGN1ci5oaXRTaWRlKSB7IGJyZWFrIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiBjdXJcbiAgICB9LFxuXG4gICAgbW92ZUg6IG1ldGhvZE9wKGZ1bmN0aW9uKGRpciwgdW5pdCkge1xuICAgICAgdmFyIHRoaXMkMSA9IHRoaXM7XG5cbiAgICAgIHRoaXMuZXh0ZW5kU2VsZWN0aW9uc0J5KGZ1bmN0aW9uIChyYW5nZSQkMSkge1xuICAgICAgICBpZiAodGhpcyQxLmRpc3BsYXkuc2hpZnQgfHwgdGhpcyQxLmRvYy5leHRlbmQgfHwgcmFuZ2UkJDEuZW1wdHkoKSlcbiAgICAgICAgICB7IHJldHVybiBmaW5kUG9zSCh0aGlzJDEuZG9jLCByYW5nZSQkMS5oZWFkLCBkaXIsIHVuaXQsIHRoaXMkMS5vcHRpb25zLnJ0bE1vdmVWaXN1YWxseSkgfVxuICAgICAgICBlbHNlXG4gICAgICAgICAgeyByZXR1cm4gZGlyIDwgMCA/IHJhbmdlJCQxLmZyb20oKSA6IHJhbmdlJCQxLnRvKCkgfVxuICAgICAgfSwgc2VsX21vdmUpO1xuICAgIH0pLFxuXG4gICAgZGVsZXRlSDogbWV0aG9kT3AoZnVuY3Rpb24oZGlyLCB1bml0KSB7XG4gICAgICB2YXIgc2VsID0gdGhpcy5kb2Muc2VsLCBkb2MgPSB0aGlzLmRvYztcbiAgICAgIGlmIChzZWwuc29tZXRoaW5nU2VsZWN0ZWQoKSlcbiAgICAgICAgeyBkb2MucmVwbGFjZVNlbGVjdGlvbihcIlwiLCBudWxsLCBcIitkZWxldGVcIik7IH1cbiAgICAgIGVsc2VcbiAgICAgICAgeyBkZWxldGVOZWFyU2VsZWN0aW9uKHRoaXMsIGZ1bmN0aW9uIChyYW5nZSQkMSkge1xuICAgICAgICAgIHZhciBvdGhlciA9IGZpbmRQb3NIKGRvYywgcmFuZ2UkJDEuaGVhZCwgZGlyLCB1bml0LCBmYWxzZSk7XG4gICAgICAgICAgcmV0dXJuIGRpciA8IDAgPyB7ZnJvbTogb3RoZXIsIHRvOiByYW5nZSQkMS5oZWFkfSA6IHtmcm9tOiByYW5nZSQkMS5oZWFkLCB0bzogb3RoZXJ9XG4gICAgICAgIH0pOyB9XG4gICAgfSksXG5cbiAgICBmaW5kUG9zVjogZnVuY3Rpb24oZnJvbSwgYW1vdW50LCB1bml0LCBnb2FsQ29sdW1uKSB7XG4gICAgICB2YXIgdGhpcyQxID0gdGhpcztcblxuICAgICAgdmFyIGRpciA9IDEsIHggPSBnb2FsQ29sdW1uO1xuICAgICAgaWYgKGFtb3VudCA8IDApIHsgZGlyID0gLTE7IGFtb3VudCA9IC1hbW91bnQ7IH1cbiAgICAgIHZhciBjdXIgPSBjbGlwUG9zKHRoaXMuZG9jLCBmcm9tKTtcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYW1vdW50OyArK2kpIHtcbiAgICAgICAgdmFyIGNvb3JkcyA9IGN1cnNvckNvb3Jkcyh0aGlzJDEsIGN1ciwgXCJkaXZcIik7XG4gICAgICAgIGlmICh4ID09IG51bGwpIHsgeCA9IGNvb3Jkcy5sZWZ0OyB9XG4gICAgICAgIGVsc2UgeyBjb29yZHMubGVmdCA9IHg7IH1cbiAgICAgICAgY3VyID0gZmluZFBvc1YodGhpcyQxLCBjb29yZHMsIGRpciwgdW5pdCk7XG4gICAgICAgIGlmIChjdXIuaGl0U2lkZSkgeyBicmVhayB9XG4gICAgICB9XG4gICAgICByZXR1cm4gY3VyXG4gICAgfSxcblxuICAgIG1vdmVWOiBtZXRob2RPcChmdW5jdGlvbihkaXIsIHVuaXQpIHtcbiAgICAgIHZhciB0aGlzJDEgPSB0aGlzO1xuXG4gICAgICB2YXIgZG9jID0gdGhpcy5kb2MsIGdvYWxzID0gW107XG4gICAgICB2YXIgY29sbGFwc2UgPSAhdGhpcy5kaXNwbGF5LnNoaWZ0ICYmICFkb2MuZXh0ZW5kICYmIGRvYy5zZWwuc29tZXRoaW5nU2VsZWN0ZWQoKTtcbiAgICAgIGRvYy5leHRlbmRTZWxlY3Rpb25zQnkoZnVuY3Rpb24gKHJhbmdlJCQxKSB7XG4gICAgICAgIGlmIChjb2xsYXBzZSlcbiAgICAgICAgICB7IHJldHVybiBkaXIgPCAwID8gcmFuZ2UkJDEuZnJvbSgpIDogcmFuZ2UkJDEudG8oKSB9XG4gICAgICAgIHZhciBoZWFkUG9zID0gY3Vyc29yQ29vcmRzKHRoaXMkMSwgcmFuZ2UkJDEuaGVhZCwgXCJkaXZcIik7XG4gICAgICAgIGlmIChyYW5nZSQkMS5nb2FsQ29sdW1uICE9IG51bGwpIHsgaGVhZFBvcy5sZWZ0ID0gcmFuZ2UkJDEuZ29hbENvbHVtbjsgfVxuICAgICAgICBnb2Fscy5wdXNoKGhlYWRQb3MubGVmdCk7XG4gICAgICAgIHZhciBwb3MgPSBmaW5kUG9zVih0aGlzJDEsIGhlYWRQb3MsIGRpciwgdW5pdCk7XG4gICAgICAgIGlmICh1bml0ID09IFwicGFnZVwiICYmIHJhbmdlJCQxID09IGRvYy5zZWwucHJpbWFyeSgpKVxuICAgICAgICAgIHsgYWRkVG9TY3JvbGxUb3AodGhpcyQxLCBjaGFyQ29vcmRzKHRoaXMkMSwgcG9zLCBcImRpdlwiKS50b3AgLSBoZWFkUG9zLnRvcCk7IH1cbiAgICAgICAgcmV0dXJuIHBvc1xuICAgICAgfSwgc2VsX21vdmUpO1xuICAgICAgaWYgKGdvYWxzLmxlbmd0aCkgeyBmb3IgKHZhciBpID0gMDsgaSA8IGRvYy5zZWwucmFuZ2VzLmxlbmd0aDsgaSsrKVxuICAgICAgICB7IGRvYy5zZWwucmFuZ2VzW2ldLmdvYWxDb2x1bW4gPSBnb2Fsc1tpXTsgfSB9XG4gICAgfSksXG5cbiAgICAvLyBGaW5kIHRoZSB3b3JkIGF0IHRoZSBnaXZlbiBwb3NpdGlvbiAoYXMgcmV0dXJuZWQgYnkgY29vcmRzQ2hhcikuXG4gICAgZmluZFdvcmRBdDogZnVuY3Rpb24ocG9zKSB7XG4gICAgICB2YXIgZG9jID0gdGhpcy5kb2MsIGxpbmUgPSBnZXRMaW5lKGRvYywgcG9zLmxpbmUpLnRleHQ7XG4gICAgICB2YXIgc3RhcnQgPSBwb3MuY2gsIGVuZCA9IHBvcy5jaDtcbiAgICAgIGlmIChsaW5lKSB7XG4gICAgICAgIHZhciBoZWxwZXIgPSB0aGlzLmdldEhlbHBlcihwb3MsIFwid29yZENoYXJzXCIpO1xuICAgICAgICBpZiAoKHBvcy5zdGlja3kgPT0gXCJiZWZvcmVcIiB8fCBlbmQgPT0gbGluZS5sZW5ndGgpICYmIHN0YXJ0KSB7IC0tc3RhcnQ7IH0gZWxzZSB7ICsrZW5kOyB9XG4gICAgICAgIHZhciBzdGFydENoYXIgPSBsaW5lLmNoYXJBdChzdGFydCk7XG4gICAgICAgIHZhciBjaGVjayA9IGlzV29yZENoYXIoc3RhcnRDaGFyLCBoZWxwZXIpXG4gICAgICAgICAgPyBmdW5jdGlvbiAoY2gpIHsgcmV0dXJuIGlzV29yZENoYXIoY2gsIGhlbHBlcik7IH1cbiAgICAgICAgICA6IC9cXHMvLnRlc3Qoc3RhcnRDaGFyKSA/IGZ1bmN0aW9uIChjaCkgeyByZXR1cm4gL1xccy8udGVzdChjaCk7IH1cbiAgICAgICAgICA6IGZ1bmN0aW9uIChjaCkgeyByZXR1cm4gKCEvXFxzLy50ZXN0KGNoKSAmJiAhaXNXb3JkQ2hhcihjaCkpOyB9O1xuICAgICAgICB3aGlsZSAoc3RhcnQgPiAwICYmIGNoZWNrKGxpbmUuY2hhckF0KHN0YXJ0IC0gMSkpKSB7IC0tc3RhcnQ7IH1cbiAgICAgICAgd2hpbGUgKGVuZCA8IGxpbmUubGVuZ3RoICYmIGNoZWNrKGxpbmUuY2hhckF0KGVuZCkpKSB7ICsrZW5kOyB9XG4gICAgICB9XG4gICAgICByZXR1cm4gbmV3IFJhbmdlKFBvcyhwb3MubGluZSwgc3RhcnQpLCBQb3MocG9zLmxpbmUsIGVuZCkpXG4gICAgfSxcblxuICAgIHRvZ2dsZU92ZXJ3cml0ZTogZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgIGlmICh2YWx1ZSAhPSBudWxsICYmIHZhbHVlID09IHRoaXMuc3RhdGUub3ZlcndyaXRlKSB7IHJldHVybiB9XG4gICAgICBpZiAodGhpcy5zdGF0ZS5vdmVyd3JpdGUgPSAhdGhpcy5zdGF0ZS5vdmVyd3JpdGUpXG4gICAgICAgIHsgYWRkQ2xhc3ModGhpcy5kaXNwbGF5LmN1cnNvckRpdiwgXCJDb2RlTWlycm9yLW92ZXJ3cml0ZVwiKTsgfVxuICAgICAgZWxzZVxuICAgICAgICB7IHJtQ2xhc3ModGhpcy5kaXNwbGF5LmN1cnNvckRpdiwgXCJDb2RlTWlycm9yLW92ZXJ3cml0ZVwiKTsgfVxuXG4gICAgICBzaWduYWwodGhpcywgXCJvdmVyd3JpdGVUb2dnbGVcIiwgdGhpcywgdGhpcy5zdGF0ZS5vdmVyd3JpdGUpO1xuICAgIH0sXG4gICAgaGFzRm9jdXM6IGZ1bmN0aW9uKCkgeyByZXR1cm4gdGhpcy5kaXNwbGF5LmlucHV0LmdldEZpZWxkKCkgPT0gYWN0aXZlRWx0KCkgfSxcbiAgICBpc1JlYWRPbmx5OiBmdW5jdGlvbigpIHsgcmV0dXJuICEhKHRoaXMub3B0aW9ucy5yZWFkT25seSB8fCB0aGlzLmRvYy5jYW50RWRpdCkgfSxcblxuICAgIHNjcm9sbFRvOiBtZXRob2RPcChmdW5jdGlvbiAoeCwgeSkgeyBzY3JvbGxUb0Nvb3Jkcyh0aGlzLCB4LCB5KTsgfSksXG4gICAgZ2V0U2Nyb2xsSW5mbzogZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgc2Nyb2xsZXIgPSB0aGlzLmRpc3BsYXkuc2Nyb2xsZXI7XG4gICAgICByZXR1cm4ge2xlZnQ6IHNjcm9sbGVyLnNjcm9sbExlZnQsIHRvcDogc2Nyb2xsZXIuc2Nyb2xsVG9wLFxuICAgICAgICAgICAgICBoZWlnaHQ6IHNjcm9sbGVyLnNjcm9sbEhlaWdodCAtIHNjcm9sbEdhcCh0aGlzKSAtIHRoaXMuZGlzcGxheS5iYXJIZWlnaHQsXG4gICAgICAgICAgICAgIHdpZHRoOiBzY3JvbGxlci5zY3JvbGxXaWR0aCAtIHNjcm9sbEdhcCh0aGlzKSAtIHRoaXMuZGlzcGxheS5iYXJXaWR0aCxcbiAgICAgICAgICAgICAgY2xpZW50SGVpZ2h0OiBkaXNwbGF5SGVpZ2h0KHRoaXMpLCBjbGllbnRXaWR0aDogZGlzcGxheVdpZHRoKHRoaXMpfVxuICAgIH0sXG5cbiAgICBzY3JvbGxJbnRvVmlldzogbWV0aG9kT3AoZnVuY3Rpb24ocmFuZ2UkJDEsIG1hcmdpbikge1xuICAgICAgaWYgKHJhbmdlJCQxID09IG51bGwpIHtcbiAgICAgICAgcmFuZ2UkJDEgPSB7ZnJvbTogdGhpcy5kb2Muc2VsLnByaW1hcnkoKS5oZWFkLCB0bzogbnVsbH07XG4gICAgICAgIGlmIChtYXJnaW4gPT0gbnVsbCkgeyBtYXJnaW4gPSB0aGlzLm9wdGlvbnMuY3Vyc29yU2Nyb2xsTWFyZ2luOyB9XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiByYW5nZSQkMSA9PSBcIm51bWJlclwiKSB7XG4gICAgICAgIHJhbmdlJCQxID0ge2Zyb206IFBvcyhyYW5nZSQkMSwgMCksIHRvOiBudWxsfTtcbiAgICAgIH0gZWxzZSBpZiAocmFuZ2UkJDEuZnJvbSA9PSBudWxsKSB7XG4gICAgICAgIHJhbmdlJCQxID0ge2Zyb206IHJhbmdlJCQxLCB0bzogbnVsbH07XG4gICAgICB9XG4gICAgICBpZiAoIXJhbmdlJCQxLnRvKSB7IHJhbmdlJCQxLnRvID0gcmFuZ2UkJDEuZnJvbTsgfVxuICAgICAgcmFuZ2UkJDEubWFyZ2luID0gbWFyZ2luIHx8IDA7XG5cbiAgICAgIGlmIChyYW5nZSQkMS5mcm9tLmxpbmUgIT0gbnVsbCkge1xuICAgICAgICBzY3JvbGxUb1JhbmdlKHRoaXMsIHJhbmdlJCQxKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHNjcm9sbFRvQ29vcmRzUmFuZ2UodGhpcywgcmFuZ2UkJDEuZnJvbSwgcmFuZ2UkJDEudG8sIHJhbmdlJCQxLm1hcmdpbik7XG4gICAgICB9XG4gICAgfSksXG5cbiAgICBzZXRTaXplOiBtZXRob2RPcChmdW5jdGlvbih3aWR0aCwgaGVpZ2h0KSB7XG4gICAgICB2YXIgdGhpcyQxID0gdGhpcztcblxuICAgICAgdmFyIGludGVycHJldCA9IGZ1bmN0aW9uICh2YWwpIHsgcmV0dXJuIHR5cGVvZiB2YWwgPT0gXCJudW1iZXJcIiB8fCAvXlxcZCskLy50ZXN0KFN0cmluZyh2YWwpKSA/IHZhbCArIFwicHhcIiA6IHZhbDsgfTtcbiAgICAgIGlmICh3aWR0aCAhPSBudWxsKSB7IHRoaXMuZGlzcGxheS53cmFwcGVyLnN0eWxlLndpZHRoID0gaW50ZXJwcmV0KHdpZHRoKTsgfVxuICAgICAgaWYgKGhlaWdodCAhPSBudWxsKSB7IHRoaXMuZGlzcGxheS53cmFwcGVyLnN0eWxlLmhlaWdodCA9IGludGVycHJldChoZWlnaHQpOyB9XG4gICAgICBpZiAodGhpcy5vcHRpb25zLmxpbmVXcmFwcGluZykgeyBjbGVhckxpbmVNZWFzdXJlbWVudENhY2hlKHRoaXMpOyB9XG4gICAgICB2YXIgbGluZU5vJCQxID0gdGhpcy5kaXNwbGF5LnZpZXdGcm9tO1xuICAgICAgdGhpcy5kb2MuaXRlcihsaW5lTm8kJDEsIHRoaXMuZGlzcGxheS52aWV3VG8sIGZ1bmN0aW9uIChsaW5lKSB7XG4gICAgICAgIGlmIChsaW5lLndpZGdldHMpIHsgZm9yICh2YXIgaSA9IDA7IGkgPCBsaW5lLndpZGdldHMubGVuZ3RoOyBpKyspXG4gICAgICAgICAgeyBpZiAobGluZS53aWRnZXRzW2ldLm5vSFNjcm9sbCkgeyByZWdMaW5lQ2hhbmdlKHRoaXMkMSwgbGluZU5vJCQxLCBcIndpZGdldFwiKTsgYnJlYWsgfSB9IH1cbiAgICAgICAgKytsaW5lTm8kJDE7XG4gICAgICB9KTtcbiAgICAgIHRoaXMuY3VyT3AuZm9yY2VVcGRhdGUgPSB0cnVlO1xuICAgICAgc2lnbmFsKHRoaXMsIFwicmVmcmVzaFwiLCB0aGlzKTtcbiAgICB9KSxcblxuICAgIG9wZXJhdGlvbjogZnVuY3Rpb24oZil7cmV0dXJuIHJ1bkluT3AodGhpcywgZil9LFxuICAgIHN0YXJ0T3BlcmF0aW9uOiBmdW5jdGlvbigpe3JldHVybiBzdGFydE9wZXJhdGlvbih0aGlzKX0sXG4gICAgZW5kT3BlcmF0aW9uOiBmdW5jdGlvbigpe3JldHVybiBlbmRPcGVyYXRpb24odGhpcyl9LFxuXG4gICAgcmVmcmVzaDogbWV0aG9kT3AoZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgb2xkSGVpZ2h0ID0gdGhpcy5kaXNwbGF5LmNhY2hlZFRleHRIZWlnaHQ7XG4gICAgICByZWdDaGFuZ2UodGhpcyk7XG4gICAgICB0aGlzLmN1ck9wLmZvcmNlVXBkYXRlID0gdHJ1ZTtcbiAgICAgIGNsZWFyQ2FjaGVzKHRoaXMpO1xuICAgICAgc2Nyb2xsVG9Db29yZHModGhpcywgdGhpcy5kb2Muc2Nyb2xsTGVmdCwgdGhpcy5kb2Muc2Nyb2xsVG9wKTtcbiAgICAgIHVwZGF0ZUd1dHRlclNwYWNlKHRoaXMpO1xuICAgICAgaWYgKG9sZEhlaWdodCA9PSBudWxsIHx8IE1hdGguYWJzKG9sZEhlaWdodCAtIHRleHRIZWlnaHQodGhpcy5kaXNwbGF5KSkgPiAuNSlcbiAgICAgICAgeyBlc3RpbWF0ZUxpbmVIZWlnaHRzKHRoaXMpOyB9XG4gICAgICBzaWduYWwodGhpcywgXCJyZWZyZXNoXCIsIHRoaXMpO1xuICAgIH0pLFxuXG4gICAgc3dhcERvYzogbWV0aG9kT3AoZnVuY3Rpb24oZG9jKSB7XG4gICAgICB2YXIgb2xkID0gdGhpcy5kb2M7XG4gICAgICBvbGQuY20gPSBudWxsO1xuICAgICAgYXR0YWNoRG9jKHRoaXMsIGRvYyk7XG4gICAgICBjbGVhckNhY2hlcyh0aGlzKTtcbiAgICAgIHRoaXMuZGlzcGxheS5pbnB1dC5yZXNldCgpO1xuICAgICAgc2Nyb2xsVG9Db29yZHModGhpcywgZG9jLnNjcm9sbExlZnQsIGRvYy5zY3JvbGxUb3ApO1xuICAgICAgdGhpcy5jdXJPcC5mb3JjZVNjcm9sbCA9IHRydWU7XG4gICAgICBzaWduYWxMYXRlcih0aGlzLCBcInN3YXBEb2NcIiwgdGhpcywgb2xkKTtcbiAgICAgIHJldHVybiBvbGRcbiAgICB9KSxcblxuICAgIGdldElucHV0RmllbGQ6IGZ1bmN0aW9uKCl7cmV0dXJuIHRoaXMuZGlzcGxheS5pbnB1dC5nZXRGaWVsZCgpfSxcbiAgICBnZXRXcmFwcGVyRWxlbWVudDogZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5kaXNwbGF5LndyYXBwZXJ9LFxuICAgIGdldFNjcm9sbGVyRWxlbWVudDogZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5kaXNwbGF5LnNjcm9sbGVyfSxcbiAgICBnZXRHdXR0ZXJFbGVtZW50OiBmdW5jdGlvbigpe3JldHVybiB0aGlzLmRpc3BsYXkuZ3V0dGVyc31cbiAgfTtcbiAgZXZlbnRNaXhpbihDb2RlTWlycm9yKTtcblxuICBDb2RlTWlycm9yLnJlZ2lzdGVySGVscGVyID0gZnVuY3Rpb24odHlwZSwgbmFtZSwgdmFsdWUpIHtcbiAgICBpZiAoIWhlbHBlcnMuaGFzT3duUHJvcGVydHkodHlwZSkpIHsgaGVscGVyc1t0eXBlXSA9IENvZGVNaXJyb3JbdHlwZV0gPSB7X2dsb2JhbDogW119OyB9XG4gICAgaGVscGVyc1t0eXBlXVtuYW1lXSA9IHZhbHVlO1xuICB9O1xuICBDb2RlTWlycm9yLnJlZ2lzdGVyR2xvYmFsSGVscGVyID0gZnVuY3Rpb24odHlwZSwgbmFtZSwgcHJlZGljYXRlLCB2YWx1ZSkge1xuICAgIENvZGVNaXJyb3IucmVnaXN0ZXJIZWxwZXIodHlwZSwgbmFtZSwgdmFsdWUpO1xuICAgIGhlbHBlcnNbdHlwZV0uX2dsb2JhbC5wdXNoKHtwcmVkOiBwcmVkaWNhdGUsIHZhbDogdmFsdWV9KTtcbiAgfTtcbn07XG5cbi8vIFVzZWQgZm9yIGhvcml6b250YWwgcmVsYXRpdmUgbW90aW9uLiBEaXIgaXMgLTEgb3IgMSAobGVmdCBvclxuLy8gcmlnaHQpLCB1bml0IGNhbiBiZSBcImNoYXJcIiwgXCJjb2x1bW5cIiAobGlrZSBjaGFyLCBidXQgZG9lc24ndFxuLy8gY3Jvc3MgbGluZSBib3VuZGFyaWVzKSwgXCJ3b3JkXCIgKGFjcm9zcyBuZXh0IHdvcmQpLCBvciBcImdyb3VwXCIgKHRvXG4vLyB0aGUgc3RhcnQgb2YgbmV4dCBncm91cCBvZiB3b3JkIG9yIG5vbi13b3JkLW5vbi13aGl0ZXNwYWNlXG4vLyBjaGFycykuIFRoZSB2aXN1YWxseSBwYXJhbSBjb250cm9scyB3aGV0aGVyLCBpbiByaWdodC10by1sZWZ0XG4vLyB0ZXh0LCBkaXJlY3Rpb24gMSBtZWFucyB0byBtb3ZlIHRvd2FyZHMgdGhlIG5leHQgaW5kZXggaW4gdGhlXG4vLyBzdHJpbmcsIG9yIHRvd2FyZHMgdGhlIGNoYXJhY3RlciB0byB0aGUgcmlnaHQgb2YgdGhlIGN1cnJlbnRcbi8vIHBvc2l0aW9uLiBUaGUgcmVzdWx0aW5nIHBvc2l0aW9uIHdpbGwgaGF2ZSBhIGhpdFNpZGU9dHJ1ZVxuLy8gcHJvcGVydHkgaWYgaXQgcmVhY2hlZCB0aGUgZW5kIG9mIHRoZSBkb2N1bWVudC5cbmZ1bmN0aW9uIGZpbmRQb3NIKGRvYywgcG9zLCBkaXIsIHVuaXQsIHZpc3VhbGx5KSB7XG4gIHZhciBvbGRQb3MgPSBwb3M7XG4gIHZhciBvcmlnRGlyID0gZGlyO1xuICB2YXIgbGluZU9iaiA9IGdldExpbmUoZG9jLCBwb3MubGluZSk7XG4gIGZ1bmN0aW9uIGZpbmROZXh0TGluZSgpIHtcbiAgICB2YXIgbCA9IHBvcy5saW5lICsgZGlyO1xuICAgIGlmIChsIDwgZG9jLmZpcnN0IHx8IGwgPj0gZG9jLmZpcnN0ICsgZG9jLnNpemUpIHsgcmV0dXJuIGZhbHNlIH1cbiAgICBwb3MgPSBuZXcgUG9zKGwsIHBvcy5jaCwgcG9zLnN0aWNreSk7XG4gICAgcmV0dXJuIGxpbmVPYmogPSBnZXRMaW5lKGRvYywgbClcbiAgfVxuICBmdW5jdGlvbiBtb3ZlT25jZShib3VuZFRvTGluZSkge1xuICAgIHZhciBuZXh0O1xuICAgIGlmICh2aXN1YWxseSkge1xuICAgICAgbmV4dCA9IG1vdmVWaXN1YWxseShkb2MuY20sIGxpbmVPYmosIHBvcywgZGlyKTtcbiAgICB9IGVsc2Uge1xuICAgICAgbmV4dCA9IG1vdmVMb2dpY2FsbHkobGluZU9iaiwgcG9zLCBkaXIpO1xuICAgIH1cbiAgICBpZiAobmV4dCA9PSBudWxsKSB7XG4gICAgICBpZiAoIWJvdW5kVG9MaW5lICYmIGZpbmROZXh0TGluZSgpKVxuICAgICAgICB7IHBvcyA9IGVuZE9mTGluZSh2aXN1YWxseSwgZG9jLmNtLCBsaW5lT2JqLCBwb3MubGluZSwgZGlyKTsgfVxuICAgICAgZWxzZVxuICAgICAgICB7IHJldHVybiBmYWxzZSB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHBvcyA9IG5leHQ7XG4gICAgfVxuICAgIHJldHVybiB0cnVlXG4gIH1cblxuICBpZiAodW5pdCA9PSBcImNoYXJcIikge1xuICAgIG1vdmVPbmNlKCk7XG4gIH0gZWxzZSBpZiAodW5pdCA9PSBcImNvbHVtblwiKSB7XG4gICAgbW92ZU9uY2UodHJ1ZSk7XG4gIH0gZWxzZSBpZiAodW5pdCA9PSBcIndvcmRcIiB8fCB1bml0ID09IFwiZ3JvdXBcIikge1xuICAgIHZhciBzYXdUeXBlID0gbnVsbCwgZ3JvdXAgPSB1bml0ID09IFwiZ3JvdXBcIjtcbiAgICB2YXIgaGVscGVyID0gZG9jLmNtICYmIGRvYy5jbS5nZXRIZWxwZXIocG9zLCBcIndvcmRDaGFyc1wiKTtcbiAgICBmb3IgKHZhciBmaXJzdCA9IHRydWU7OyBmaXJzdCA9IGZhbHNlKSB7XG4gICAgICBpZiAoZGlyIDwgMCAmJiAhbW92ZU9uY2UoIWZpcnN0KSkgeyBicmVhayB9XG4gICAgICB2YXIgY3VyID0gbGluZU9iai50ZXh0LmNoYXJBdChwb3MuY2gpIHx8IFwiXFxuXCI7XG4gICAgICB2YXIgdHlwZSA9IGlzV29yZENoYXIoY3VyLCBoZWxwZXIpID8gXCJ3XCJcbiAgICAgICAgOiBncm91cCAmJiBjdXIgPT0gXCJcXG5cIiA/IFwiblwiXG4gICAgICAgIDogIWdyb3VwIHx8IC9cXHMvLnRlc3QoY3VyKSA/IG51bGxcbiAgICAgICAgOiBcInBcIjtcbiAgICAgIGlmIChncm91cCAmJiAhZmlyc3QgJiYgIXR5cGUpIHsgdHlwZSA9IFwic1wiOyB9XG4gICAgICBpZiAoc2F3VHlwZSAmJiBzYXdUeXBlICE9IHR5cGUpIHtcbiAgICAgICAgaWYgKGRpciA8IDApIHtkaXIgPSAxOyBtb3ZlT25jZSgpOyBwb3Muc3RpY2t5ID0gXCJhZnRlclwiO31cbiAgICAgICAgYnJlYWtcbiAgICAgIH1cblxuICAgICAgaWYgKHR5cGUpIHsgc2F3VHlwZSA9IHR5cGU7IH1cbiAgICAgIGlmIChkaXIgPiAwICYmICFtb3ZlT25jZSghZmlyc3QpKSB7IGJyZWFrIH1cbiAgICB9XG4gIH1cbiAgdmFyIHJlc3VsdCA9IHNraXBBdG9taWMoZG9jLCBwb3MsIG9sZFBvcywgb3JpZ0RpciwgdHJ1ZSk7XG4gIGlmIChlcXVhbEN1cnNvclBvcyhvbGRQb3MsIHJlc3VsdCkpIHsgcmVzdWx0LmhpdFNpZGUgPSB0cnVlOyB9XG4gIHJldHVybiByZXN1bHRcbn1cblxuLy8gRm9yIHJlbGF0aXZlIHZlcnRpY2FsIG1vdmVtZW50LiBEaXIgbWF5IGJlIC0xIG9yIDEuIFVuaXQgY2FuIGJlXG4vLyBcInBhZ2VcIiBvciBcImxpbmVcIi4gVGhlIHJlc3VsdGluZyBwb3NpdGlvbiB3aWxsIGhhdmUgYSBoaXRTaWRlPXRydWVcbi8vIHByb3BlcnR5IGlmIGl0IHJlYWNoZWQgdGhlIGVuZCBvZiB0aGUgZG9jdW1lbnQuXG5mdW5jdGlvbiBmaW5kUG9zVihjbSwgcG9zLCBkaXIsIHVuaXQpIHtcbiAgdmFyIGRvYyA9IGNtLmRvYywgeCA9IHBvcy5sZWZ0LCB5O1xuICBpZiAodW5pdCA9PSBcInBhZ2VcIikge1xuICAgIHZhciBwYWdlU2l6ZSA9IE1hdGgubWluKGNtLmRpc3BsYXkud3JhcHBlci5jbGllbnRIZWlnaHQsIHdpbmRvdy5pbm5lckhlaWdodCB8fCBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuY2xpZW50SGVpZ2h0KTtcbiAgICB2YXIgbW92ZUFtb3VudCA9IE1hdGgubWF4KHBhZ2VTaXplIC0gLjUgKiB0ZXh0SGVpZ2h0KGNtLmRpc3BsYXkpLCAzKTtcbiAgICB5ID0gKGRpciA+IDAgPyBwb3MuYm90dG9tIDogcG9zLnRvcCkgKyBkaXIgKiBtb3ZlQW1vdW50O1xuXG4gIH0gZWxzZSBpZiAodW5pdCA9PSBcImxpbmVcIikge1xuICAgIHkgPSBkaXIgPiAwID8gcG9zLmJvdHRvbSArIDMgOiBwb3MudG9wIC0gMztcbiAgfVxuICB2YXIgdGFyZ2V0O1xuICBmb3IgKDs7KSB7XG4gICAgdGFyZ2V0ID0gY29vcmRzQ2hhcihjbSwgeCwgeSk7XG4gICAgaWYgKCF0YXJnZXQub3V0c2lkZSkgeyBicmVhayB9XG4gICAgaWYgKGRpciA8IDAgPyB5IDw9IDAgOiB5ID49IGRvYy5oZWlnaHQpIHsgdGFyZ2V0LmhpdFNpZGUgPSB0cnVlOyBicmVhayB9XG4gICAgeSArPSBkaXIgKiA1O1xuICB9XG4gIHJldHVybiB0YXJnZXRcbn1cblxuLy8gQ09OVEVOVEVESVRBQkxFIElOUFVUIFNUWUxFXG5cbnZhciBDb250ZW50RWRpdGFibGVJbnB1dCA9IGZ1bmN0aW9uKGNtKSB7XG4gIHRoaXMuY20gPSBjbTtcbiAgdGhpcy5sYXN0QW5jaG9yTm9kZSA9IHRoaXMubGFzdEFuY2hvck9mZnNldCA9IHRoaXMubGFzdEZvY3VzTm9kZSA9IHRoaXMubGFzdEZvY3VzT2Zmc2V0ID0gbnVsbDtcbiAgdGhpcy5wb2xsaW5nID0gbmV3IERlbGF5ZWQoKTtcbiAgdGhpcy5jb21wb3NpbmcgPSBudWxsO1xuICB0aGlzLmdyYWNlUGVyaW9kID0gZmFsc2U7XG4gIHRoaXMucmVhZERPTVRpbWVvdXQgPSBudWxsO1xufTtcblxuQ29udGVudEVkaXRhYmxlSW5wdXQucHJvdG90eXBlLmluaXQgPSBmdW5jdGlvbiAoZGlzcGxheSkge1xuICAgIHZhciB0aGlzJDEgPSB0aGlzO1xuXG4gIHZhciBpbnB1dCA9IHRoaXMsIGNtID0gaW5wdXQuY207XG4gIHZhciBkaXYgPSBpbnB1dC5kaXYgPSBkaXNwbGF5LmxpbmVEaXY7XG4gIGRpc2FibGVCcm93c2VyTWFnaWMoZGl2LCBjbS5vcHRpb25zLnNwZWxsY2hlY2spO1xuXG4gIG9uKGRpdiwgXCJwYXN0ZVwiLCBmdW5jdGlvbiAoZSkge1xuICAgIGlmIChzaWduYWxET01FdmVudChjbSwgZSkgfHwgaGFuZGxlUGFzdGUoZSwgY20pKSB7IHJldHVybiB9XG4gICAgLy8gSUUgZG9lc24ndCBmaXJlIGlucHV0IGV2ZW50cywgc28gd2Ugc2NoZWR1bGUgYSByZWFkIGZvciB0aGUgcGFzdGVkIGNvbnRlbnQgaW4gdGhpcyB3YXlcbiAgICBpZiAoaWVfdmVyc2lvbiA8PSAxMSkgeyBzZXRUaW1lb3V0KG9wZXJhdGlvbihjbSwgZnVuY3Rpb24gKCkgeyByZXR1cm4gdGhpcyQxLnVwZGF0ZUZyb21ET00oKTsgfSksIDIwKTsgfVxuICB9KTtcblxuICBvbihkaXYsIFwiY29tcG9zaXRpb25zdGFydFwiLCBmdW5jdGlvbiAoZSkge1xuICAgIHRoaXMkMS5jb21wb3NpbmcgPSB7ZGF0YTogZS5kYXRhLCBkb25lOiBmYWxzZX07XG4gIH0pO1xuICBvbihkaXYsIFwiY29tcG9zaXRpb251cGRhdGVcIiwgZnVuY3Rpb24gKGUpIHtcbiAgICBpZiAoIXRoaXMkMS5jb21wb3NpbmcpIHsgdGhpcyQxLmNvbXBvc2luZyA9IHtkYXRhOiBlLmRhdGEsIGRvbmU6IGZhbHNlfTsgfVxuICB9KTtcbiAgb24oZGl2LCBcImNvbXBvc2l0aW9uZW5kXCIsIGZ1bmN0aW9uIChlKSB7XG4gICAgaWYgKHRoaXMkMS5jb21wb3NpbmcpIHtcbiAgICAgIGlmIChlLmRhdGEgIT0gdGhpcyQxLmNvbXBvc2luZy5kYXRhKSB7IHRoaXMkMS5yZWFkRnJvbURPTVNvb24oKTsgfVxuICAgICAgdGhpcyQxLmNvbXBvc2luZy5kb25lID0gdHJ1ZTtcbiAgICB9XG4gIH0pO1xuXG4gIG9uKGRpdiwgXCJ0b3VjaHN0YXJ0XCIsIGZ1bmN0aW9uICgpIHsgcmV0dXJuIGlucHV0LmZvcmNlQ29tcG9zaXRpb25FbmQoKTsgfSk7XG5cbiAgb24oZGl2LCBcImlucHV0XCIsIGZ1bmN0aW9uICgpIHtcbiAgICBpZiAoIXRoaXMkMS5jb21wb3NpbmcpIHsgdGhpcyQxLnJlYWRGcm9tRE9NU29vbigpOyB9XG4gIH0pO1xuXG4gIGZ1bmN0aW9uIG9uQ29weUN1dChlKSB7XG4gICAgaWYgKHNpZ25hbERPTUV2ZW50KGNtLCBlKSkgeyByZXR1cm4gfVxuICAgIGlmIChjbS5zb21ldGhpbmdTZWxlY3RlZCgpKSB7XG4gICAgICBzZXRMYXN0Q29waWVkKHtsaW5lV2lzZTogZmFsc2UsIHRleHQ6IGNtLmdldFNlbGVjdGlvbnMoKX0pO1xuICAgICAgaWYgKGUudHlwZSA9PSBcImN1dFwiKSB7IGNtLnJlcGxhY2VTZWxlY3Rpb24oXCJcIiwgbnVsbCwgXCJjdXRcIik7IH1cbiAgICB9IGVsc2UgaWYgKCFjbS5vcHRpb25zLmxpbmVXaXNlQ29weUN1dCkge1xuICAgICAgcmV0dXJuXG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciByYW5nZXMgPSBjb3B5YWJsZVJhbmdlcyhjbSk7XG4gICAgICBzZXRMYXN0Q29waWVkKHtsaW5lV2lzZTogdHJ1ZSwgdGV4dDogcmFuZ2VzLnRleHR9KTtcbiAgICAgIGlmIChlLnR5cGUgPT0gXCJjdXRcIikge1xuICAgICAgICBjbS5vcGVyYXRpb24oZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGNtLnNldFNlbGVjdGlvbnMocmFuZ2VzLnJhbmdlcywgMCwgc2VsX2RvbnRTY3JvbGwpO1xuICAgICAgICAgIGNtLnJlcGxhY2VTZWxlY3Rpb24oXCJcIiwgbnVsbCwgXCJjdXRcIik7XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAoZS5jbGlwYm9hcmREYXRhKSB7XG4gICAgICBlLmNsaXBib2FyZERhdGEuY2xlYXJEYXRhKCk7XG4gICAgICB2YXIgY29udGVudCA9IGxhc3RDb3BpZWQudGV4dC5qb2luKFwiXFxuXCIpO1xuICAgICAgLy8gaU9TIGV4cG9zZXMgdGhlIGNsaXBib2FyZCBBUEksIGJ1dCBzZWVtcyB0byBkaXNjYXJkIGNvbnRlbnQgaW5zZXJ0ZWQgaW50byBpdFxuICAgICAgZS5jbGlwYm9hcmREYXRhLnNldERhdGEoXCJUZXh0XCIsIGNvbnRlbnQpO1xuICAgICAgaWYgKGUuY2xpcGJvYXJkRGF0YS5nZXREYXRhKFwiVGV4dFwiKSA9PSBjb250ZW50KSB7XG4gICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG4gICAgfVxuICAgIC8vIE9sZC1mYXNoaW9uZWQgYnJpZWZseS1mb2N1cy1hLXRleHRhcmVhIGhhY2tcbiAgICB2YXIga2x1ZGdlID0gaGlkZGVuVGV4dGFyZWEoKSwgdGUgPSBrbHVkZ2UuZmlyc3RDaGlsZDtcbiAgICBjbS5kaXNwbGF5LmxpbmVTcGFjZS5pbnNlcnRCZWZvcmUoa2x1ZGdlLCBjbS5kaXNwbGF5LmxpbmVTcGFjZS5maXJzdENoaWxkKTtcbiAgICB0ZS52YWx1ZSA9IGxhc3RDb3BpZWQudGV4dC5qb2luKFwiXFxuXCIpO1xuICAgIHZhciBoYWRGb2N1cyA9IGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQ7XG4gICAgc2VsZWN0SW5wdXQodGUpO1xuICAgIHNldFRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgY20uZGlzcGxheS5saW5lU3BhY2UucmVtb3ZlQ2hpbGQoa2x1ZGdlKTtcbiAgICAgIGhhZEZvY3VzLmZvY3VzKCk7XG4gICAgICBpZiAoaGFkRm9jdXMgPT0gZGl2KSB7IGlucHV0LnNob3dQcmltYXJ5U2VsZWN0aW9uKCk7IH1cbiAgICB9LCA1MCk7XG4gIH1cbiAgb24oZGl2LCBcImNvcHlcIiwgb25Db3B5Q3V0KTtcbiAgb24oZGl2LCBcImN1dFwiLCBvbkNvcHlDdXQpO1xufTtcblxuQ29udGVudEVkaXRhYmxlSW5wdXQucHJvdG90eXBlLnByZXBhcmVTZWxlY3Rpb24gPSBmdW5jdGlvbiAoKSB7XG4gIHZhciByZXN1bHQgPSBwcmVwYXJlU2VsZWN0aW9uKHRoaXMuY20sIGZhbHNlKTtcbiAgcmVzdWx0LmZvY3VzID0gdGhpcy5jbS5zdGF0ZS5mb2N1c2VkO1xuICByZXR1cm4gcmVzdWx0XG59O1xuXG5Db250ZW50RWRpdGFibGVJbnB1dC5wcm90b3R5cGUuc2hvd1NlbGVjdGlvbiA9IGZ1bmN0aW9uIChpbmZvLCB0YWtlRm9jdXMpIHtcbiAgaWYgKCFpbmZvIHx8ICF0aGlzLmNtLmRpc3BsYXkudmlldy5sZW5ndGgpIHsgcmV0dXJuIH1cbiAgaWYgKGluZm8uZm9jdXMgfHwgdGFrZUZvY3VzKSB7IHRoaXMuc2hvd1ByaW1hcnlTZWxlY3Rpb24oKTsgfVxuICB0aGlzLnNob3dNdWx0aXBsZVNlbGVjdGlvbnMoaW5mbyk7XG59O1xuXG5Db250ZW50RWRpdGFibGVJbnB1dC5wcm90b3R5cGUuZ2V0U2VsZWN0aW9uID0gZnVuY3Rpb24gKCkge1xuICByZXR1cm4gdGhpcy5jbS5kaXNwbGF5LndyYXBwZXIub3duZXJEb2N1bWVudC5nZXRTZWxlY3Rpb24oKVxufTtcblxuQ29udGVudEVkaXRhYmxlSW5wdXQucHJvdG90eXBlLnNob3dQcmltYXJ5U2VsZWN0aW9uID0gZnVuY3Rpb24gKCkge1xuICB2YXIgc2VsID0gdGhpcy5nZXRTZWxlY3Rpb24oKSwgY20gPSB0aGlzLmNtLCBwcmltID0gY20uZG9jLnNlbC5wcmltYXJ5KCk7XG4gIHZhciBmcm9tID0gcHJpbS5mcm9tKCksIHRvID0gcHJpbS50bygpO1xuXG4gIGlmIChjbS5kaXNwbGF5LnZpZXdUbyA9PSBjbS5kaXNwbGF5LnZpZXdGcm9tIHx8IGZyb20ubGluZSA+PSBjbS5kaXNwbGF5LnZpZXdUbyB8fCB0by5saW5lIDwgY20uZGlzcGxheS52aWV3RnJvbSkge1xuICAgIHNlbC5yZW1vdmVBbGxSYW5nZXMoKTtcbiAgICByZXR1cm5cbiAgfVxuXG4gIHZhciBjdXJBbmNob3IgPSBkb21Ub1BvcyhjbSwgc2VsLmFuY2hvck5vZGUsIHNlbC5hbmNob3JPZmZzZXQpO1xuICB2YXIgY3VyRm9jdXMgPSBkb21Ub1BvcyhjbSwgc2VsLmZvY3VzTm9kZSwgc2VsLmZvY3VzT2Zmc2V0KTtcbiAgaWYgKGN1ckFuY2hvciAmJiAhY3VyQW5jaG9yLmJhZCAmJiBjdXJGb2N1cyAmJiAhY3VyRm9jdXMuYmFkICYmXG4gICAgICBjbXAobWluUG9zKGN1ckFuY2hvciwgY3VyRm9jdXMpLCBmcm9tKSA9PSAwICYmXG4gICAgICBjbXAobWF4UG9zKGN1ckFuY2hvciwgY3VyRm9jdXMpLCB0bykgPT0gMClcbiAgICB7IHJldHVybiB9XG5cbiAgdmFyIHZpZXcgPSBjbS5kaXNwbGF5LnZpZXc7XG4gIHZhciBzdGFydCA9IChmcm9tLmxpbmUgPj0gY20uZGlzcGxheS52aWV3RnJvbSAmJiBwb3NUb0RPTShjbSwgZnJvbSkpIHx8XG4gICAgICB7bm9kZTogdmlld1swXS5tZWFzdXJlLm1hcFsyXSwgb2Zmc2V0OiAwfTtcbiAgdmFyIGVuZCA9IHRvLmxpbmUgPCBjbS5kaXNwbGF5LnZpZXdUbyAmJiBwb3NUb0RPTShjbSwgdG8pO1xuICBpZiAoIWVuZCkge1xuICAgIHZhciBtZWFzdXJlID0gdmlld1t2aWV3Lmxlbmd0aCAtIDFdLm1lYXN1cmU7XG4gICAgdmFyIG1hcCQkMSA9IG1lYXN1cmUubWFwcyA/IG1lYXN1cmUubWFwc1ttZWFzdXJlLm1hcHMubGVuZ3RoIC0gMV0gOiBtZWFzdXJlLm1hcDtcbiAgICBlbmQgPSB7bm9kZTogbWFwJCQxW21hcCQkMS5sZW5ndGggLSAxXSwgb2Zmc2V0OiBtYXAkJDFbbWFwJCQxLmxlbmd0aCAtIDJdIC0gbWFwJCQxW21hcCQkMS5sZW5ndGggLSAzXX07XG4gIH1cblxuICBpZiAoIXN0YXJ0IHx8ICFlbmQpIHtcbiAgICBzZWwucmVtb3ZlQWxsUmFuZ2VzKCk7XG4gICAgcmV0dXJuXG4gIH1cblxuICB2YXIgb2xkID0gc2VsLnJhbmdlQ291bnQgJiYgc2VsLmdldFJhbmdlQXQoMCksIHJuZztcbiAgdHJ5IHsgcm5nID0gcmFuZ2Uoc3RhcnQubm9kZSwgc3RhcnQub2Zmc2V0LCBlbmQub2Zmc2V0LCBlbmQubm9kZSk7IH1cbiAgY2F0Y2goZSkge30gLy8gT3VyIG1vZGVsIG9mIHRoZSBET00gbWlnaHQgYmUgb3V0ZGF0ZWQsIGluIHdoaWNoIGNhc2UgdGhlIHJhbmdlIHdlIHRyeSB0byBzZXQgY2FuIGJlIGltcG9zc2libGVcbiAgaWYgKHJuZykge1xuICAgIGlmICghZ2Vja28gJiYgY20uc3RhdGUuZm9jdXNlZCkge1xuICAgICAgc2VsLmNvbGxhcHNlKHN0YXJ0Lm5vZGUsIHN0YXJ0Lm9mZnNldCk7XG4gICAgICBpZiAoIXJuZy5jb2xsYXBzZWQpIHtcbiAgICAgICAgc2VsLnJlbW92ZUFsbFJhbmdlcygpO1xuICAgICAgICBzZWwuYWRkUmFuZ2Uocm5nKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgc2VsLnJlbW92ZUFsbFJhbmdlcygpO1xuICAgICAgc2VsLmFkZFJhbmdlKHJuZyk7XG4gICAgfVxuICAgIGlmIChvbGQgJiYgc2VsLmFuY2hvck5vZGUgPT0gbnVsbCkgeyBzZWwuYWRkUmFuZ2Uob2xkKTsgfVxuICAgIGVsc2UgaWYgKGdlY2tvKSB7IHRoaXMuc3RhcnRHcmFjZVBlcmlvZCgpOyB9XG4gIH1cbiAgdGhpcy5yZW1lbWJlclNlbGVjdGlvbigpO1xufTtcblxuQ29udGVudEVkaXRhYmxlSW5wdXQucHJvdG90eXBlLnN0YXJ0R3JhY2VQZXJpb2QgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHRoaXMkMSA9IHRoaXM7XG5cbiAgY2xlYXJUaW1lb3V0KHRoaXMuZ3JhY2VQZXJpb2QpO1xuICB0aGlzLmdyYWNlUGVyaW9kID0gc2V0VGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgdGhpcyQxLmdyYWNlUGVyaW9kID0gZmFsc2U7XG4gICAgaWYgKHRoaXMkMS5zZWxlY3Rpb25DaGFuZ2VkKCkpXG4gICAgICB7IHRoaXMkMS5jbS5vcGVyYXRpb24oZnVuY3Rpb24gKCkgeyByZXR1cm4gdGhpcyQxLmNtLmN1ck9wLnNlbGVjdGlvbkNoYW5nZWQgPSB0cnVlOyB9KTsgfVxuICB9LCAyMCk7XG59O1xuXG5Db250ZW50RWRpdGFibGVJbnB1dC5wcm90b3R5cGUuc2hvd011bHRpcGxlU2VsZWN0aW9ucyA9IGZ1bmN0aW9uIChpbmZvKSB7XG4gIHJlbW92ZUNoaWxkcmVuQW5kQWRkKHRoaXMuY20uZGlzcGxheS5jdXJzb3JEaXYsIGluZm8uY3Vyc29ycyk7XG4gIHJlbW92ZUNoaWxkcmVuQW5kQWRkKHRoaXMuY20uZGlzcGxheS5zZWxlY3Rpb25EaXYsIGluZm8uc2VsZWN0aW9uKTtcbn07XG5cbkNvbnRlbnRFZGl0YWJsZUlucHV0LnByb3RvdHlwZS5yZW1lbWJlclNlbGVjdGlvbiA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIHNlbCA9IHRoaXMuZ2V0U2VsZWN0aW9uKCk7XG4gIHRoaXMubGFzdEFuY2hvck5vZGUgPSBzZWwuYW5jaG9yTm9kZTsgdGhpcy5sYXN0QW5jaG9yT2Zmc2V0ID0gc2VsLmFuY2hvck9mZnNldDtcbiAgdGhpcy5sYXN0Rm9jdXNOb2RlID0gc2VsLmZvY3VzTm9kZTsgdGhpcy5sYXN0Rm9jdXNPZmZzZXQgPSBzZWwuZm9jdXNPZmZzZXQ7XG59O1xuXG5Db250ZW50RWRpdGFibGVJbnB1dC5wcm90b3R5cGUuc2VsZWN0aW9uSW5FZGl0b3IgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBzZWwgPSB0aGlzLmdldFNlbGVjdGlvbigpO1xuICBpZiAoIXNlbC5yYW5nZUNvdW50KSB7IHJldHVybiBmYWxzZSB9XG4gIHZhciBub2RlID0gc2VsLmdldFJhbmdlQXQoMCkuY29tbW9uQW5jZXN0b3JDb250YWluZXI7XG4gIHJldHVybiBjb250YWlucyh0aGlzLmRpdiwgbm9kZSlcbn07XG5cbkNvbnRlbnRFZGl0YWJsZUlucHV0LnByb3RvdHlwZS5mb2N1cyA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuY20ub3B0aW9ucy5yZWFkT25seSAhPSBcIm5vY3Vyc29yXCIpIHtcbiAgICBpZiAoIXRoaXMuc2VsZWN0aW9uSW5FZGl0b3IoKSlcbiAgICAgIHsgdGhpcy5zaG93U2VsZWN0aW9uKHRoaXMucHJlcGFyZVNlbGVjdGlvbigpLCB0cnVlKTsgfVxuICAgIHRoaXMuZGl2LmZvY3VzKCk7XG4gIH1cbn07XG5Db250ZW50RWRpdGFibGVJbnB1dC5wcm90b3R5cGUuYmx1ciA9IGZ1bmN0aW9uICgpIHsgdGhpcy5kaXYuYmx1cigpOyB9O1xuQ29udGVudEVkaXRhYmxlSW5wdXQucHJvdG90eXBlLmdldEZpZWxkID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gdGhpcy5kaXYgfTtcblxuQ29udGVudEVkaXRhYmxlSW5wdXQucHJvdG90eXBlLnN1cHBvcnRzVG91Y2ggPSBmdW5jdGlvbiAoKSB7IHJldHVybiB0cnVlIH07XG5cbkNvbnRlbnRFZGl0YWJsZUlucHV0LnByb3RvdHlwZS5yZWNlaXZlZEZvY3VzID0gZnVuY3Rpb24gKCkge1xuICB2YXIgaW5wdXQgPSB0aGlzO1xuICBpZiAodGhpcy5zZWxlY3Rpb25JbkVkaXRvcigpKVxuICAgIHsgdGhpcy5wb2xsU2VsZWN0aW9uKCk7IH1cbiAgZWxzZVxuICAgIHsgcnVuSW5PcCh0aGlzLmNtLCBmdW5jdGlvbiAoKSB7IHJldHVybiBpbnB1dC5jbS5jdXJPcC5zZWxlY3Rpb25DaGFuZ2VkID0gdHJ1ZTsgfSk7IH1cblxuICBmdW5jdGlvbiBwb2xsKCkge1xuICAgIGlmIChpbnB1dC5jbS5zdGF0ZS5mb2N1c2VkKSB7XG4gICAgICBpbnB1dC5wb2xsU2VsZWN0aW9uKCk7XG4gICAgICBpbnB1dC5wb2xsaW5nLnNldChpbnB1dC5jbS5vcHRpb25zLnBvbGxJbnRlcnZhbCwgcG9sbCk7XG4gICAgfVxuICB9XG4gIHRoaXMucG9sbGluZy5zZXQodGhpcy5jbS5vcHRpb25zLnBvbGxJbnRlcnZhbCwgcG9sbCk7XG59O1xuXG5Db250ZW50RWRpdGFibGVJbnB1dC5wcm90b3R5cGUuc2VsZWN0aW9uQ2hhbmdlZCA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIHNlbCA9IHRoaXMuZ2V0U2VsZWN0aW9uKCk7XG4gIHJldHVybiBzZWwuYW5jaG9yTm9kZSAhPSB0aGlzLmxhc3RBbmNob3JOb2RlIHx8IHNlbC5hbmNob3JPZmZzZXQgIT0gdGhpcy5sYXN0QW5jaG9yT2Zmc2V0IHx8XG4gICAgc2VsLmZvY3VzTm9kZSAhPSB0aGlzLmxhc3RGb2N1c05vZGUgfHwgc2VsLmZvY3VzT2Zmc2V0ICE9IHRoaXMubGFzdEZvY3VzT2Zmc2V0XG59O1xuXG5Db250ZW50RWRpdGFibGVJbnB1dC5wcm90b3R5cGUucG9sbFNlbGVjdGlvbiA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMucmVhZERPTVRpbWVvdXQgIT0gbnVsbCB8fCB0aGlzLmdyYWNlUGVyaW9kIHx8ICF0aGlzLnNlbGVjdGlvbkNoYW5nZWQoKSkgeyByZXR1cm4gfVxuICB2YXIgc2VsID0gdGhpcy5nZXRTZWxlY3Rpb24oKSwgY20gPSB0aGlzLmNtO1xuICAvLyBPbiBBbmRyb2lkIENocm9tZSAodmVyc2lvbiA1NiwgYXQgbGVhc3QpLCBiYWNrc3BhY2luZyBpbnRvIGFuXG4gIC8vIHVuZWRpdGFibGUgYmxvY2sgZWxlbWVudCB3aWxsIHB1dCB0aGUgY3Vyc29yIGluIHRoYXQgZWxlbWVudCxcbiAgLy8gYW5kIHRoZW4sIGJlY2F1c2UgaXQncyBub3QgZWRpdGFibGUsIGhpZGUgdGhlIHZpcnR1YWwga2V5Ym9hcmQuXG4gIC8vIEJlY2F1c2UgQW5kcm9pZCBkb2Vzbid0IGFsbG93IHVzIHRvIGFjdHVhbGx5IGRldGVjdCBiYWNrc3BhY2VcbiAgLy8gcHJlc3NlcyBpbiBhIHNhbmUgd2F5LCB0aGlzIGNvZGUgY2hlY2tzIGZvciB3aGVuIHRoYXQgaGFwcGVuc1xuICAvLyBhbmQgc2ltdWxhdGVzIGEgYmFja3NwYWNlIHByZXNzIGluIHRoaXMgY2FzZS5cbiAgaWYgKGFuZHJvaWQgJiYgY2hyb21lICYmIHRoaXMuY20ub3B0aW9ucy5ndXR0ZXJzLmxlbmd0aCAmJiBpc0luR3V0dGVyKHNlbC5hbmNob3JOb2RlKSkge1xuICAgIHRoaXMuY20udHJpZ2dlck9uS2V5RG93bih7dHlwZTogXCJrZXlkb3duXCIsIGtleUNvZGU6IDgsIHByZXZlbnREZWZhdWx0OiBNYXRoLmFic30pO1xuICAgIHRoaXMuYmx1cigpO1xuICAgIHRoaXMuZm9jdXMoKTtcbiAgICByZXR1cm5cbiAgfVxuICBpZiAodGhpcy5jb21wb3NpbmcpIHsgcmV0dXJuIH1cbiAgdGhpcy5yZW1lbWJlclNlbGVjdGlvbigpO1xuICB2YXIgYW5jaG9yID0gZG9tVG9Qb3MoY20sIHNlbC5hbmNob3JOb2RlLCBzZWwuYW5jaG9yT2Zmc2V0KTtcbiAgdmFyIGhlYWQgPSBkb21Ub1BvcyhjbSwgc2VsLmZvY3VzTm9kZSwgc2VsLmZvY3VzT2Zmc2V0KTtcbiAgaWYgKGFuY2hvciAmJiBoZWFkKSB7IHJ1bkluT3AoY20sIGZ1bmN0aW9uICgpIHtcbiAgICBzZXRTZWxlY3Rpb24oY20uZG9jLCBzaW1wbGVTZWxlY3Rpb24oYW5jaG9yLCBoZWFkKSwgc2VsX2RvbnRTY3JvbGwpO1xuICAgIGlmIChhbmNob3IuYmFkIHx8IGhlYWQuYmFkKSB7IGNtLmN1ck9wLnNlbGVjdGlvbkNoYW5nZWQgPSB0cnVlOyB9XG4gIH0pOyB9XG59O1xuXG5Db250ZW50RWRpdGFibGVJbnB1dC5wcm90b3R5cGUucG9sbENvbnRlbnQgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLnJlYWRET01UaW1lb3V0ICE9IG51bGwpIHtcbiAgICBjbGVhclRpbWVvdXQodGhpcy5yZWFkRE9NVGltZW91dCk7XG4gICAgdGhpcy5yZWFkRE9NVGltZW91dCA9IG51bGw7XG4gIH1cblxuICB2YXIgY20gPSB0aGlzLmNtLCBkaXNwbGF5ID0gY20uZGlzcGxheSwgc2VsID0gY20uZG9jLnNlbC5wcmltYXJ5KCk7XG4gIHZhciBmcm9tID0gc2VsLmZyb20oKSwgdG8gPSBzZWwudG8oKTtcbiAgaWYgKGZyb20uY2ggPT0gMCAmJiBmcm9tLmxpbmUgPiBjbS5maXJzdExpbmUoKSlcbiAgICB7IGZyb20gPSBQb3MoZnJvbS5saW5lIC0gMSwgZ2V0TGluZShjbS5kb2MsIGZyb20ubGluZSAtIDEpLmxlbmd0aCk7IH1cbiAgaWYgKHRvLmNoID09IGdldExpbmUoY20uZG9jLCB0by5saW5lKS50ZXh0Lmxlbmd0aCAmJiB0by5saW5lIDwgY20ubGFzdExpbmUoKSlcbiAgICB7IHRvID0gUG9zKHRvLmxpbmUgKyAxLCAwKTsgfVxuICBpZiAoZnJvbS5saW5lIDwgZGlzcGxheS52aWV3RnJvbSB8fCB0by5saW5lID4gZGlzcGxheS52aWV3VG8gLSAxKSB7IHJldHVybiBmYWxzZSB9XG5cbiAgdmFyIGZyb21JbmRleCwgZnJvbUxpbmUsIGZyb21Ob2RlO1xuICBpZiAoZnJvbS5saW5lID09IGRpc3BsYXkudmlld0Zyb20gfHwgKGZyb21JbmRleCA9IGZpbmRWaWV3SW5kZXgoY20sIGZyb20ubGluZSkpID09IDApIHtcbiAgICBmcm9tTGluZSA9IGxpbmVObyhkaXNwbGF5LnZpZXdbMF0ubGluZSk7XG4gICAgZnJvbU5vZGUgPSBkaXNwbGF5LnZpZXdbMF0ubm9kZTtcbiAgfSBlbHNlIHtcbiAgICBmcm9tTGluZSA9IGxpbmVObyhkaXNwbGF5LnZpZXdbZnJvbUluZGV4XS5saW5lKTtcbiAgICBmcm9tTm9kZSA9IGRpc3BsYXkudmlld1tmcm9tSW5kZXggLSAxXS5ub2RlLm5leHRTaWJsaW5nO1xuICB9XG4gIHZhciB0b0luZGV4ID0gZmluZFZpZXdJbmRleChjbSwgdG8ubGluZSk7XG4gIHZhciB0b0xpbmUsIHRvTm9kZTtcbiAgaWYgKHRvSW5kZXggPT0gZGlzcGxheS52aWV3Lmxlbmd0aCAtIDEpIHtcbiAgICB0b0xpbmUgPSBkaXNwbGF5LnZpZXdUbyAtIDE7XG4gICAgdG9Ob2RlID0gZGlzcGxheS5saW5lRGl2Lmxhc3RDaGlsZDtcbiAgfSBlbHNlIHtcbiAgICB0b0xpbmUgPSBsaW5lTm8oZGlzcGxheS52aWV3W3RvSW5kZXggKyAxXS5saW5lKSAtIDE7XG4gICAgdG9Ob2RlID0gZGlzcGxheS52aWV3W3RvSW5kZXggKyAxXS5ub2RlLnByZXZpb3VzU2libGluZztcbiAgfVxuXG4gIGlmICghZnJvbU5vZGUpIHsgcmV0dXJuIGZhbHNlIH1cbiAgdmFyIG5ld1RleHQgPSBjbS5kb2Muc3BsaXRMaW5lcyhkb21UZXh0QmV0d2VlbihjbSwgZnJvbU5vZGUsIHRvTm9kZSwgZnJvbUxpbmUsIHRvTGluZSkpO1xuICB2YXIgb2xkVGV4dCA9IGdldEJldHdlZW4oY20uZG9jLCBQb3MoZnJvbUxpbmUsIDApLCBQb3ModG9MaW5lLCBnZXRMaW5lKGNtLmRvYywgdG9MaW5lKS50ZXh0Lmxlbmd0aCkpO1xuICB3aGlsZSAobmV3VGV4dC5sZW5ndGggPiAxICYmIG9sZFRleHQubGVuZ3RoID4gMSkge1xuICAgIGlmIChsc3QobmV3VGV4dCkgPT0gbHN0KG9sZFRleHQpKSB7IG5ld1RleHQucG9wKCk7IG9sZFRleHQucG9wKCk7IHRvTGluZS0tOyB9XG4gICAgZWxzZSBpZiAobmV3VGV4dFswXSA9PSBvbGRUZXh0WzBdKSB7IG5ld1RleHQuc2hpZnQoKTsgb2xkVGV4dC5zaGlmdCgpOyBmcm9tTGluZSsrOyB9XG4gICAgZWxzZSB7IGJyZWFrIH1cbiAgfVxuXG4gIHZhciBjdXRGcm9udCA9IDAsIGN1dEVuZCA9IDA7XG4gIHZhciBuZXdUb3AgPSBuZXdUZXh0WzBdLCBvbGRUb3AgPSBvbGRUZXh0WzBdLCBtYXhDdXRGcm9udCA9IE1hdGgubWluKG5ld1RvcC5sZW5ndGgsIG9sZFRvcC5sZW5ndGgpO1xuICB3aGlsZSAoY3V0RnJvbnQgPCBtYXhDdXRGcm9udCAmJiBuZXdUb3AuY2hhckNvZGVBdChjdXRGcm9udCkgPT0gb2xkVG9wLmNoYXJDb2RlQXQoY3V0RnJvbnQpKVxuICAgIHsgKytjdXRGcm9udDsgfVxuICB2YXIgbmV3Qm90ID0gbHN0KG5ld1RleHQpLCBvbGRCb3QgPSBsc3Qob2xkVGV4dCk7XG4gIHZhciBtYXhDdXRFbmQgPSBNYXRoLm1pbihuZXdCb3QubGVuZ3RoIC0gKG5ld1RleHQubGVuZ3RoID09IDEgPyBjdXRGcm9udCA6IDApLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgb2xkQm90Lmxlbmd0aCAtIChvbGRUZXh0Lmxlbmd0aCA9PSAxID8gY3V0RnJvbnQgOiAwKSk7XG4gIHdoaWxlIChjdXRFbmQgPCBtYXhDdXRFbmQgJiZcbiAgICAgICAgIG5ld0JvdC5jaGFyQ29kZUF0KG5ld0JvdC5sZW5ndGggLSBjdXRFbmQgLSAxKSA9PSBvbGRCb3QuY2hhckNvZGVBdChvbGRCb3QubGVuZ3RoIC0gY3V0RW5kIC0gMSkpXG4gICAgeyArK2N1dEVuZDsgfVxuICAvLyBUcnkgdG8gbW92ZSBzdGFydCBvZiBjaGFuZ2UgdG8gc3RhcnQgb2Ygc2VsZWN0aW9uIGlmIGFtYmlndW91c1xuICBpZiAobmV3VGV4dC5sZW5ndGggPT0gMSAmJiBvbGRUZXh0Lmxlbmd0aCA9PSAxICYmIGZyb21MaW5lID09IGZyb20ubGluZSkge1xuICAgIHdoaWxlIChjdXRGcm9udCAmJiBjdXRGcm9udCA+IGZyb20uY2ggJiZcbiAgICAgICAgICAgbmV3Qm90LmNoYXJDb2RlQXQobmV3Qm90Lmxlbmd0aCAtIGN1dEVuZCAtIDEpID09IG9sZEJvdC5jaGFyQ29kZUF0KG9sZEJvdC5sZW5ndGggLSBjdXRFbmQgLSAxKSkge1xuICAgICAgY3V0RnJvbnQtLTtcbiAgICAgIGN1dEVuZCsrO1xuICAgIH1cbiAgfVxuXG4gIG5ld1RleHRbbmV3VGV4dC5sZW5ndGggLSAxXSA9IG5ld0JvdC5zbGljZSgwLCBuZXdCb3QubGVuZ3RoIC0gY3V0RW5kKS5yZXBsYWNlKC9eXFx1MjAwYisvLCBcIlwiKTtcbiAgbmV3VGV4dFswXSA9IG5ld1RleHRbMF0uc2xpY2UoY3V0RnJvbnQpLnJlcGxhY2UoL1xcdTIwMGIrJC8sIFwiXCIpO1xuXG4gIHZhciBjaEZyb20gPSBQb3MoZnJvbUxpbmUsIGN1dEZyb250KTtcbiAgdmFyIGNoVG8gPSBQb3ModG9MaW5lLCBvbGRUZXh0Lmxlbmd0aCA/IGxzdChvbGRUZXh0KS5sZW5ndGggLSBjdXRFbmQgOiAwKTtcbiAgaWYgKG5ld1RleHQubGVuZ3RoID4gMSB8fCBuZXdUZXh0WzBdIHx8IGNtcChjaEZyb20sIGNoVG8pKSB7XG4gICAgcmVwbGFjZVJhbmdlKGNtLmRvYywgbmV3VGV4dCwgY2hGcm9tLCBjaFRvLCBcIitpbnB1dFwiKTtcbiAgICByZXR1cm4gdHJ1ZVxuICB9XG59O1xuXG5Db250ZW50RWRpdGFibGVJbnB1dC5wcm90b3R5cGUuZW5zdXJlUG9sbGVkID0gZnVuY3Rpb24gKCkge1xuICB0aGlzLmZvcmNlQ29tcG9zaXRpb25FbmQoKTtcbn07XG5Db250ZW50RWRpdGFibGVJbnB1dC5wcm90b3R5cGUucmVzZXQgPSBmdW5jdGlvbiAoKSB7XG4gIHRoaXMuZm9yY2VDb21wb3NpdGlvbkVuZCgpO1xufTtcbkNvbnRlbnRFZGl0YWJsZUlucHV0LnByb3RvdHlwZS5mb3JjZUNvbXBvc2l0aW9uRW5kID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMuY29tcG9zaW5nKSB7IHJldHVybiB9XG4gIGNsZWFyVGltZW91dCh0aGlzLnJlYWRET01UaW1lb3V0KTtcbiAgdGhpcy5jb21wb3NpbmcgPSBudWxsO1xuICB0aGlzLnVwZGF0ZUZyb21ET00oKTtcbiAgdGhpcy5kaXYuYmx1cigpO1xuICB0aGlzLmRpdi5mb2N1cygpO1xufTtcbkNvbnRlbnRFZGl0YWJsZUlucHV0LnByb3RvdHlwZS5yZWFkRnJvbURPTVNvb24gPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHRoaXMkMSA9IHRoaXM7XG5cbiAgaWYgKHRoaXMucmVhZERPTVRpbWVvdXQgIT0gbnVsbCkgeyByZXR1cm4gfVxuICB0aGlzLnJlYWRET01UaW1lb3V0ID0gc2V0VGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgdGhpcyQxLnJlYWRET01UaW1lb3V0ID0gbnVsbDtcbiAgICBpZiAodGhpcyQxLmNvbXBvc2luZykge1xuICAgICAgaWYgKHRoaXMkMS5jb21wb3NpbmcuZG9uZSkgeyB0aGlzJDEuY29tcG9zaW5nID0gbnVsbDsgfVxuICAgICAgZWxzZSB7IHJldHVybiB9XG4gICAgfVxuICAgIHRoaXMkMS51cGRhdGVGcm9tRE9NKCk7XG4gIH0sIDgwKTtcbn07XG5cbkNvbnRlbnRFZGl0YWJsZUlucHV0LnByb3RvdHlwZS51cGRhdGVGcm9tRE9NID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciB0aGlzJDEgPSB0aGlzO1xuXG4gIGlmICh0aGlzLmNtLmlzUmVhZE9ubHkoKSB8fCAhdGhpcy5wb2xsQ29udGVudCgpKVxuICAgIHsgcnVuSW5PcCh0aGlzLmNtLCBmdW5jdGlvbiAoKSB7IHJldHVybiByZWdDaGFuZ2UodGhpcyQxLmNtKTsgfSk7IH1cbn07XG5cbkNvbnRlbnRFZGl0YWJsZUlucHV0LnByb3RvdHlwZS5zZXRVbmVkaXRhYmxlID0gZnVuY3Rpb24gKG5vZGUpIHtcbiAgbm9kZS5jb250ZW50RWRpdGFibGUgPSBcImZhbHNlXCI7XG59O1xuXG5Db250ZW50RWRpdGFibGVJbnB1dC5wcm90b3R5cGUub25LZXlQcmVzcyA9IGZ1bmN0aW9uIChlKSB7XG4gIGlmIChlLmNoYXJDb2RlID09IDAgfHwgdGhpcy5jb21wb3NpbmcpIHsgcmV0dXJuIH1cbiAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICBpZiAoIXRoaXMuY20uaXNSZWFkT25seSgpKVxuICAgIHsgb3BlcmF0aW9uKHRoaXMuY20sIGFwcGx5VGV4dElucHV0KSh0aGlzLmNtLCBTdHJpbmcuZnJvbUNoYXJDb2RlKGUuY2hhckNvZGUgPT0gbnVsbCA/IGUua2V5Q29kZSA6IGUuY2hhckNvZGUpLCAwKTsgfVxufTtcblxuQ29udGVudEVkaXRhYmxlSW5wdXQucHJvdG90eXBlLnJlYWRPbmx5Q2hhbmdlZCA9IGZ1bmN0aW9uICh2YWwpIHtcbiAgdGhpcy5kaXYuY29udGVudEVkaXRhYmxlID0gU3RyaW5nKHZhbCAhPSBcIm5vY3Vyc29yXCIpO1xufTtcblxuQ29udGVudEVkaXRhYmxlSW5wdXQucHJvdG90eXBlLm9uQ29udGV4dE1lbnUgPSBmdW5jdGlvbiAoKSB7fTtcbkNvbnRlbnRFZGl0YWJsZUlucHV0LnByb3RvdHlwZS5yZXNldFBvc2l0aW9uID0gZnVuY3Rpb24gKCkge307XG5cbkNvbnRlbnRFZGl0YWJsZUlucHV0LnByb3RvdHlwZS5uZWVkc0NvbnRlbnRBdHRyaWJ1dGUgPSB0cnVlO1xuXG5mdW5jdGlvbiBwb3NUb0RPTShjbSwgcG9zKSB7XG4gIHZhciB2aWV3ID0gZmluZFZpZXdGb3JMaW5lKGNtLCBwb3MubGluZSk7XG4gIGlmICghdmlldyB8fCB2aWV3LmhpZGRlbikgeyByZXR1cm4gbnVsbCB9XG4gIHZhciBsaW5lID0gZ2V0TGluZShjbS5kb2MsIHBvcy5saW5lKTtcbiAgdmFyIGluZm8gPSBtYXBGcm9tTGluZVZpZXcodmlldywgbGluZSwgcG9zLmxpbmUpO1xuXG4gIHZhciBvcmRlciA9IGdldE9yZGVyKGxpbmUsIGNtLmRvYy5kaXJlY3Rpb24pLCBzaWRlID0gXCJsZWZ0XCI7XG4gIGlmIChvcmRlcikge1xuICAgIHZhciBwYXJ0UG9zID0gZ2V0QmlkaVBhcnRBdChvcmRlciwgcG9zLmNoKTtcbiAgICBzaWRlID0gcGFydFBvcyAlIDIgPyBcInJpZ2h0XCIgOiBcImxlZnRcIjtcbiAgfVxuICB2YXIgcmVzdWx0ID0gbm9kZUFuZE9mZnNldEluTGluZU1hcChpbmZvLm1hcCwgcG9zLmNoLCBzaWRlKTtcbiAgcmVzdWx0Lm9mZnNldCA9IHJlc3VsdC5jb2xsYXBzZSA9PSBcInJpZ2h0XCIgPyByZXN1bHQuZW5kIDogcmVzdWx0LnN0YXJ0O1xuICByZXR1cm4gcmVzdWx0XG59XG5cbmZ1bmN0aW9uIGlzSW5HdXR0ZXIobm9kZSkge1xuICBmb3IgKHZhciBzY2FuID0gbm9kZTsgc2Nhbjsgc2NhbiA9IHNjYW4ucGFyZW50Tm9kZSlcbiAgICB7IGlmICgvQ29kZU1pcnJvci1ndXR0ZXItd3JhcHBlci8udGVzdChzY2FuLmNsYXNzTmFtZSkpIHsgcmV0dXJuIHRydWUgfSB9XG4gIHJldHVybiBmYWxzZVxufVxuXG5mdW5jdGlvbiBiYWRQb3MocG9zLCBiYWQpIHsgaWYgKGJhZCkgeyBwb3MuYmFkID0gdHJ1ZTsgfSByZXR1cm4gcG9zIH1cblxuZnVuY3Rpb24gZG9tVGV4dEJldHdlZW4oY20sIGZyb20sIHRvLCBmcm9tTGluZSwgdG9MaW5lKSB7XG4gIHZhciB0ZXh0ID0gXCJcIiwgY2xvc2luZyA9IGZhbHNlLCBsaW5lU2VwID0gY20uZG9jLmxpbmVTZXBhcmF0b3IoKSwgZXh0cmFMaW5lYnJlYWsgPSBmYWxzZTtcbiAgZnVuY3Rpb24gcmVjb2duaXplTWFya2VyKGlkKSB7IHJldHVybiBmdW5jdGlvbiAobWFya2VyKSB7IHJldHVybiBtYXJrZXIuaWQgPT0gaWQ7IH0gfVxuICBmdW5jdGlvbiBjbG9zZSgpIHtcbiAgICBpZiAoY2xvc2luZykge1xuICAgICAgdGV4dCArPSBsaW5lU2VwO1xuICAgICAgaWYgKGV4dHJhTGluZWJyZWFrKSB7IHRleHQgKz0gbGluZVNlcDsgfVxuICAgICAgY2xvc2luZyA9IGV4dHJhTGluZWJyZWFrID0gZmFsc2U7XG4gICAgfVxuICB9XG4gIGZ1bmN0aW9uIGFkZFRleHQoc3RyKSB7XG4gICAgaWYgKHN0cikge1xuICAgICAgY2xvc2UoKTtcbiAgICAgIHRleHQgKz0gc3RyO1xuICAgIH1cbiAgfVxuICBmdW5jdGlvbiB3YWxrKG5vZGUpIHtcbiAgICBpZiAobm9kZS5ub2RlVHlwZSA9PSAxKSB7XG4gICAgICB2YXIgY21UZXh0ID0gbm9kZS5nZXRBdHRyaWJ1dGUoXCJjbS10ZXh0XCIpO1xuICAgICAgaWYgKGNtVGV4dCkge1xuICAgICAgICBhZGRUZXh0KGNtVGV4dCk7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgICAgdmFyIG1hcmtlcklEID0gbm9kZS5nZXRBdHRyaWJ1dGUoXCJjbS1tYXJrZXJcIiksIHJhbmdlJCQxO1xuICAgICAgaWYgKG1hcmtlcklEKSB7XG4gICAgICAgIHZhciBmb3VuZCA9IGNtLmZpbmRNYXJrcyhQb3MoZnJvbUxpbmUsIDApLCBQb3ModG9MaW5lICsgMSwgMCksIHJlY29nbml6ZU1hcmtlcigrbWFya2VySUQpKTtcbiAgICAgICAgaWYgKGZvdW5kLmxlbmd0aCAmJiAocmFuZ2UkJDEgPSBmb3VuZFswXS5maW5kKDApKSlcbiAgICAgICAgICB7IGFkZFRleHQoZ2V0QmV0d2VlbihjbS5kb2MsIHJhbmdlJCQxLmZyb20sIHJhbmdlJCQxLnRvKS5qb2luKGxpbmVTZXApKTsgfVxuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICAgIGlmIChub2RlLmdldEF0dHJpYnV0ZShcImNvbnRlbnRlZGl0YWJsZVwiKSA9PSBcImZhbHNlXCIpIHsgcmV0dXJuIH1cbiAgICAgIHZhciBpc0Jsb2NrID0gL14ocHJlfGRpdnxwfGxpfHRhYmxlfGJyKSQvaS50ZXN0KG5vZGUubm9kZU5hbWUpO1xuICAgICAgaWYgKCEvXmJyJC9pLnRlc3Qobm9kZS5ub2RlTmFtZSkgJiYgbm9kZS50ZXh0Q29udGVudC5sZW5ndGggPT0gMCkgeyByZXR1cm4gfVxuXG4gICAgICBpZiAoaXNCbG9jaykgeyBjbG9zZSgpOyB9XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG5vZGUuY2hpbGROb2Rlcy5sZW5ndGg7IGkrKylcbiAgICAgICAgeyB3YWxrKG5vZGUuY2hpbGROb2Rlc1tpXSk7IH1cblxuICAgICAgaWYgKC9eKHByZXxwKSQvaS50ZXN0KG5vZGUubm9kZU5hbWUpKSB7IGV4dHJhTGluZWJyZWFrID0gdHJ1ZTsgfVxuICAgICAgaWYgKGlzQmxvY2spIHsgY2xvc2luZyA9IHRydWU7IH1cbiAgICB9IGVsc2UgaWYgKG5vZGUubm9kZVR5cGUgPT0gMykge1xuICAgICAgYWRkVGV4dChub2RlLm5vZGVWYWx1ZS5yZXBsYWNlKC9cXHUyMDBiL2csIFwiXCIpLnJlcGxhY2UoL1xcdTAwYTAvZywgXCIgXCIpKTtcbiAgICB9XG4gIH1cbiAgZm9yICg7Oykge1xuICAgIHdhbGsoZnJvbSk7XG4gICAgaWYgKGZyb20gPT0gdG8pIHsgYnJlYWsgfVxuICAgIGZyb20gPSBmcm9tLm5leHRTaWJsaW5nO1xuICAgIGV4dHJhTGluZWJyZWFrID0gZmFsc2U7XG4gIH1cbiAgcmV0dXJuIHRleHRcbn1cblxuZnVuY3Rpb24gZG9tVG9Qb3MoY20sIG5vZGUsIG9mZnNldCkge1xuICB2YXIgbGluZU5vZGU7XG4gIGlmIChub2RlID09IGNtLmRpc3BsYXkubGluZURpdikge1xuICAgIGxpbmVOb2RlID0gY20uZGlzcGxheS5saW5lRGl2LmNoaWxkTm9kZXNbb2Zmc2V0XTtcbiAgICBpZiAoIWxpbmVOb2RlKSB7IHJldHVybiBiYWRQb3MoY20uY2xpcFBvcyhQb3MoY20uZGlzcGxheS52aWV3VG8gLSAxKSksIHRydWUpIH1cbiAgICBub2RlID0gbnVsbDsgb2Zmc2V0ID0gMDtcbiAgfSBlbHNlIHtcbiAgICBmb3IgKGxpbmVOb2RlID0gbm9kZTs7IGxpbmVOb2RlID0gbGluZU5vZGUucGFyZW50Tm9kZSkge1xuICAgICAgaWYgKCFsaW5lTm9kZSB8fCBsaW5lTm9kZSA9PSBjbS5kaXNwbGF5LmxpbmVEaXYpIHsgcmV0dXJuIG51bGwgfVxuICAgICAgaWYgKGxpbmVOb2RlLnBhcmVudE5vZGUgJiYgbGluZU5vZGUucGFyZW50Tm9kZSA9PSBjbS5kaXNwbGF5LmxpbmVEaXYpIHsgYnJlYWsgfVxuICAgIH1cbiAgfVxuICBmb3IgKHZhciBpID0gMDsgaSA8IGNtLmRpc3BsYXkudmlldy5sZW5ndGg7IGkrKykge1xuICAgIHZhciBsaW5lVmlldyA9IGNtLmRpc3BsYXkudmlld1tpXTtcbiAgICBpZiAobGluZVZpZXcubm9kZSA9PSBsaW5lTm9kZSlcbiAgICAgIHsgcmV0dXJuIGxvY2F0ZU5vZGVJbkxpbmVWaWV3KGxpbmVWaWV3LCBub2RlLCBvZmZzZXQpIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBsb2NhdGVOb2RlSW5MaW5lVmlldyhsaW5lVmlldywgbm9kZSwgb2Zmc2V0KSB7XG4gIHZhciB3cmFwcGVyID0gbGluZVZpZXcudGV4dC5maXJzdENoaWxkLCBiYWQgPSBmYWxzZTtcbiAgaWYgKCFub2RlIHx8ICFjb250YWlucyh3cmFwcGVyLCBub2RlKSkgeyByZXR1cm4gYmFkUG9zKFBvcyhsaW5lTm8obGluZVZpZXcubGluZSksIDApLCB0cnVlKSB9XG4gIGlmIChub2RlID09IHdyYXBwZXIpIHtcbiAgICBiYWQgPSB0cnVlO1xuICAgIG5vZGUgPSB3cmFwcGVyLmNoaWxkTm9kZXNbb2Zmc2V0XTtcbiAgICBvZmZzZXQgPSAwO1xuICAgIGlmICghbm9kZSkge1xuICAgICAgdmFyIGxpbmUgPSBsaW5lVmlldy5yZXN0ID8gbHN0KGxpbmVWaWV3LnJlc3QpIDogbGluZVZpZXcubGluZTtcbiAgICAgIHJldHVybiBiYWRQb3MoUG9zKGxpbmVObyhsaW5lKSwgbGluZS50ZXh0Lmxlbmd0aCksIGJhZClcbiAgICB9XG4gIH1cblxuICB2YXIgdGV4dE5vZGUgPSBub2RlLm5vZGVUeXBlID09IDMgPyBub2RlIDogbnVsbCwgdG9wTm9kZSA9IG5vZGU7XG4gIGlmICghdGV4dE5vZGUgJiYgbm9kZS5jaGlsZE5vZGVzLmxlbmd0aCA9PSAxICYmIG5vZGUuZmlyc3RDaGlsZC5ub2RlVHlwZSA9PSAzKSB7XG4gICAgdGV4dE5vZGUgPSBub2RlLmZpcnN0Q2hpbGQ7XG4gICAgaWYgKG9mZnNldCkgeyBvZmZzZXQgPSB0ZXh0Tm9kZS5ub2RlVmFsdWUubGVuZ3RoOyB9XG4gIH1cbiAgd2hpbGUgKHRvcE5vZGUucGFyZW50Tm9kZSAhPSB3cmFwcGVyKSB7IHRvcE5vZGUgPSB0b3BOb2RlLnBhcmVudE5vZGU7IH1cbiAgdmFyIG1lYXN1cmUgPSBsaW5lVmlldy5tZWFzdXJlLCBtYXBzID0gbWVhc3VyZS5tYXBzO1xuXG4gIGZ1bmN0aW9uIGZpbmQodGV4dE5vZGUsIHRvcE5vZGUsIG9mZnNldCkge1xuICAgIGZvciAodmFyIGkgPSAtMTsgaSA8IChtYXBzID8gbWFwcy5sZW5ndGggOiAwKTsgaSsrKSB7XG4gICAgICB2YXIgbWFwJCQxID0gaSA8IDAgPyBtZWFzdXJlLm1hcCA6IG1hcHNbaV07XG4gICAgICBmb3IgKHZhciBqID0gMDsgaiA8IG1hcCQkMS5sZW5ndGg7IGogKz0gMykge1xuICAgICAgICB2YXIgY3VyTm9kZSA9IG1hcCQkMVtqICsgMl07XG4gICAgICAgIGlmIChjdXJOb2RlID09IHRleHROb2RlIHx8IGN1ck5vZGUgPT0gdG9wTm9kZSkge1xuICAgICAgICAgIHZhciBsaW5lID0gbGluZU5vKGkgPCAwID8gbGluZVZpZXcubGluZSA6IGxpbmVWaWV3LnJlc3RbaV0pO1xuICAgICAgICAgIHZhciBjaCA9IG1hcCQkMVtqXSArIG9mZnNldDtcbiAgICAgICAgICBpZiAob2Zmc2V0IDwgMCB8fCBjdXJOb2RlICE9IHRleHROb2RlKSB7IGNoID0gbWFwJCQxW2ogKyAob2Zmc2V0ID8gMSA6IDApXTsgfVxuICAgICAgICAgIHJldHVybiBQb3MobGluZSwgY2gpXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgdmFyIGZvdW5kID0gZmluZCh0ZXh0Tm9kZSwgdG9wTm9kZSwgb2Zmc2V0KTtcbiAgaWYgKGZvdW5kKSB7IHJldHVybiBiYWRQb3MoZm91bmQsIGJhZCkgfVxuXG4gIC8vIEZJWE1FIHRoaXMgaXMgYWxsIHJlYWxseSBzaGFreS4gbWlnaHQgaGFuZGxlIHRoZSBmZXcgY2FzZXMgaXQgbmVlZHMgdG8gaGFuZGxlLCBidXQgbGlrZWx5IHRvIGNhdXNlIHByb2JsZW1zXG4gIGZvciAodmFyIGFmdGVyID0gdG9wTm9kZS5uZXh0U2libGluZywgZGlzdCA9IHRleHROb2RlID8gdGV4dE5vZGUubm9kZVZhbHVlLmxlbmd0aCAtIG9mZnNldCA6IDA7IGFmdGVyOyBhZnRlciA9IGFmdGVyLm5leHRTaWJsaW5nKSB7XG4gICAgZm91bmQgPSBmaW5kKGFmdGVyLCBhZnRlci5maXJzdENoaWxkLCAwKTtcbiAgICBpZiAoZm91bmQpXG4gICAgICB7IHJldHVybiBiYWRQb3MoUG9zKGZvdW5kLmxpbmUsIGZvdW5kLmNoIC0gZGlzdCksIGJhZCkgfVxuICAgIGVsc2VcbiAgICAgIHsgZGlzdCArPSBhZnRlci50ZXh0Q29udGVudC5sZW5ndGg7IH1cbiAgfVxuICBmb3IgKHZhciBiZWZvcmUgPSB0b3BOb2RlLnByZXZpb3VzU2libGluZywgZGlzdCQxID0gb2Zmc2V0OyBiZWZvcmU7IGJlZm9yZSA9IGJlZm9yZS5wcmV2aW91c1NpYmxpbmcpIHtcbiAgICBmb3VuZCA9IGZpbmQoYmVmb3JlLCBiZWZvcmUuZmlyc3RDaGlsZCwgLTEpO1xuICAgIGlmIChmb3VuZClcbiAgICAgIHsgcmV0dXJuIGJhZFBvcyhQb3MoZm91bmQubGluZSwgZm91bmQuY2ggKyBkaXN0JDEpLCBiYWQpIH1cbiAgICBlbHNlXG4gICAgICB7IGRpc3QkMSArPSBiZWZvcmUudGV4dENvbnRlbnQubGVuZ3RoOyB9XG4gIH1cbn1cblxuLy8gVEVYVEFSRUEgSU5QVVQgU1RZTEVcblxudmFyIFRleHRhcmVhSW5wdXQgPSBmdW5jdGlvbihjbSkge1xuICB0aGlzLmNtID0gY207XG4gIC8vIFNlZSBpbnB1dC5wb2xsIGFuZCBpbnB1dC5yZXNldFxuICB0aGlzLnByZXZJbnB1dCA9IFwiXCI7XG5cbiAgLy8gRmxhZyB0aGF0IGluZGljYXRlcyB3aGV0aGVyIHdlIGV4cGVjdCBpbnB1dCB0byBhcHBlYXIgcmVhbCBzb29uXG4gIC8vIG5vdyAoYWZ0ZXIgc29tZSBldmVudCBsaWtlICdrZXlwcmVzcycgb3IgJ2lucHV0JykgYW5kIGFyZVxuICAvLyBwb2xsaW5nIGludGVuc2l2ZWx5LlxuICB0aGlzLnBvbGxpbmdGYXN0ID0gZmFsc2U7XG4gIC8vIFNlbGYtcmVzZXR0aW5nIHRpbWVvdXQgZm9yIHRoZSBwb2xsZXJcbiAgdGhpcy5wb2xsaW5nID0gbmV3IERlbGF5ZWQoKTtcbiAgLy8gVXNlZCB0byB3b3JrIGFyb3VuZCBJRSBpc3N1ZSB3aXRoIHNlbGVjdGlvbiBiZWluZyBmb3Jnb3R0ZW4gd2hlbiBmb2N1cyBtb3ZlcyBhd2F5IGZyb20gdGV4dGFyZWFcbiAgdGhpcy5oYXNTZWxlY3Rpb24gPSBmYWxzZTtcbiAgdGhpcy5jb21wb3NpbmcgPSBudWxsO1xufTtcblxuVGV4dGFyZWFJbnB1dC5wcm90b3R5cGUuaW5pdCA9IGZ1bmN0aW9uIChkaXNwbGF5KSB7XG4gICAgdmFyIHRoaXMkMSA9IHRoaXM7XG5cbiAgdmFyIGlucHV0ID0gdGhpcywgY20gPSB0aGlzLmNtO1xuICB0aGlzLmNyZWF0ZUZpZWxkKGRpc3BsYXkpO1xuICB2YXIgdGUgPSB0aGlzLnRleHRhcmVhO1xuXG4gIGRpc3BsYXkud3JhcHBlci5pbnNlcnRCZWZvcmUodGhpcy53cmFwcGVyLCBkaXNwbGF5LndyYXBwZXIuZmlyc3RDaGlsZCk7XG5cbiAgLy8gTmVlZGVkIHRvIGhpZGUgYmlnIGJsdWUgYmxpbmtpbmcgY3Vyc29yIG9uIE1vYmlsZSBTYWZhcmkgKGRvZXNuJ3Qgc2VlbSB0byB3b3JrIGluIGlPUyA4IGFueW1vcmUpXG4gIGlmIChpb3MpIHsgdGUuc3R5bGUud2lkdGggPSBcIjBweFwiOyB9XG5cbiAgb24odGUsIFwiaW5wdXRcIiwgZnVuY3Rpb24gKCkge1xuICAgIGlmIChpZSAmJiBpZV92ZXJzaW9uID49IDkgJiYgdGhpcyQxLmhhc1NlbGVjdGlvbikgeyB0aGlzJDEuaGFzU2VsZWN0aW9uID0gbnVsbDsgfVxuICAgIGlucHV0LnBvbGwoKTtcbiAgfSk7XG5cbiAgb24odGUsIFwicGFzdGVcIiwgZnVuY3Rpb24gKGUpIHtcbiAgICBpZiAoc2lnbmFsRE9NRXZlbnQoY20sIGUpIHx8IGhhbmRsZVBhc3RlKGUsIGNtKSkgeyByZXR1cm4gfVxuXG4gICAgY20uc3RhdGUucGFzdGVJbmNvbWluZyA9IHRydWU7XG4gICAgaW5wdXQuZmFzdFBvbGwoKTtcbiAgfSk7XG5cbiAgZnVuY3Rpb24gcHJlcGFyZUNvcHlDdXQoZSkge1xuICAgIGlmIChzaWduYWxET01FdmVudChjbSwgZSkpIHsgcmV0dXJuIH1cbiAgICBpZiAoY20uc29tZXRoaW5nU2VsZWN0ZWQoKSkge1xuICAgICAgc2V0TGFzdENvcGllZCh7bGluZVdpc2U6IGZhbHNlLCB0ZXh0OiBjbS5nZXRTZWxlY3Rpb25zKCl9KTtcbiAgICB9IGVsc2UgaWYgKCFjbS5vcHRpb25zLmxpbmVXaXNlQ29weUN1dCkge1xuICAgICAgcmV0dXJuXG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciByYW5nZXMgPSBjb3B5YWJsZVJhbmdlcyhjbSk7XG4gICAgICBzZXRMYXN0Q29waWVkKHtsaW5lV2lzZTogdHJ1ZSwgdGV4dDogcmFuZ2VzLnRleHR9KTtcbiAgICAgIGlmIChlLnR5cGUgPT0gXCJjdXRcIikge1xuICAgICAgICBjbS5zZXRTZWxlY3Rpb25zKHJhbmdlcy5yYW5nZXMsIG51bGwsIHNlbF9kb250U2Nyb2xsKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlucHV0LnByZXZJbnB1dCA9IFwiXCI7XG4gICAgICAgIHRlLnZhbHVlID0gcmFuZ2VzLnRleHQuam9pbihcIlxcblwiKTtcbiAgICAgICAgc2VsZWN0SW5wdXQodGUpO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAoZS50eXBlID09IFwiY3V0XCIpIHsgY20uc3RhdGUuY3V0SW5jb21pbmcgPSB0cnVlOyB9XG4gIH1cbiAgb24odGUsIFwiY3V0XCIsIHByZXBhcmVDb3B5Q3V0KTtcbiAgb24odGUsIFwiY29weVwiLCBwcmVwYXJlQ29weUN1dCk7XG5cbiAgb24oZGlzcGxheS5zY3JvbGxlciwgXCJwYXN0ZVwiLCBmdW5jdGlvbiAoZSkge1xuICAgIGlmIChldmVudEluV2lkZ2V0KGRpc3BsYXksIGUpIHx8IHNpZ25hbERPTUV2ZW50KGNtLCBlKSkgeyByZXR1cm4gfVxuICAgIGNtLnN0YXRlLnBhc3RlSW5jb21pbmcgPSB0cnVlO1xuICAgIGlucHV0LmZvY3VzKCk7XG4gIH0pO1xuXG4gIC8vIFByZXZlbnQgbm9ybWFsIHNlbGVjdGlvbiBpbiB0aGUgZWRpdG9yICh3ZSBoYW5kbGUgb3VyIG93bilcbiAgb24oZGlzcGxheS5saW5lU3BhY2UsIFwic2VsZWN0c3RhcnRcIiwgZnVuY3Rpb24gKGUpIHtcbiAgICBpZiAoIWV2ZW50SW5XaWRnZXQoZGlzcGxheSwgZSkpIHsgZV9wcmV2ZW50RGVmYXVsdChlKTsgfVxuICB9KTtcblxuICBvbih0ZSwgXCJjb21wb3NpdGlvbnN0YXJ0XCIsIGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgc3RhcnQgPSBjbS5nZXRDdXJzb3IoXCJmcm9tXCIpO1xuICAgIGlmIChpbnB1dC5jb21wb3NpbmcpIHsgaW5wdXQuY29tcG9zaW5nLnJhbmdlLmNsZWFyKCk7IH1cbiAgICBpbnB1dC5jb21wb3NpbmcgPSB7XG4gICAgICBzdGFydDogc3RhcnQsXG4gICAgICByYW5nZTogY20ubWFya1RleHQoc3RhcnQsIGNtLmdldEN1cnNvcihcInRvXCIpLCB7Y2xhc3NOYW1lOiBcIkNvZGVNaXJyb3ItY29tcG9zaW5nXCJ9KVxuICAgIH07XG4gIH0pO1xuICBvbih0ZSwgXCJjb21wb3NpdGlvbmVuZFwiLCBmdW5jdGlvbiAoKSB7XG4gICAgaWYgKGlucHV0LmNvbXBvc2luZykge1xuICAgICAgaW5wdXQucG9sbCgpO1xuICAgICAgaW5wdXQuY29tcG9zaW5nLnJhbmdlLmNsZWFyKCk7XG4gICAgICBpbnB1dC5jb21wb3NpbmcgPSBudWxsO1xuICAgIH1cbiAgfSk7XG59O1xuXG5UZXh0YXJlYUlucHV0LnByb3RvdHlwZS5jcmVhdGVGaWVsZCA9IGZ1bmN0aW9uIChfZGlzcGxheSkge1xuICAvLyBXcmFwcyBhbmQgaGlkZXMgaW5wdXQgdGV4dGFyZWFcbiAgdGhpcy53cmFwcGVyID0gaGlkZGVuVGV4dGFyZWEoKTtcbiAgLy8gVGhlIHNlbWloaWRkZW4gdGV4dGFyZWEgdGhhdCBpcyBmb2N1c2VkIHdoZW4gdGhlIGVkaXRvciBpc1xuICAvLyBmb2N1c2VkLCBhbmQgcmVjZWl2ZXMgaW5wdXQuXG4gIHRoaXMudGV4dGFyZWEgPSB0aGlzLndyYXBwZXIuZmlyc3RDaGlsZDtcbn07XG5cblRleHRhcmVhSW5wdXQucHJvdG90eXBlLnByZXBhcmVTZWxlY3Rpb24gPSBmdW5jdGlvbiAoKSB7XG4gIC8vIFJlZHJhdyB0aGUgc2VsZWN0aW9uIGFuZC9vciBjdXJzb3JcbiAgdmFyIGNtID0gdGhpcy5jbSwgZGlzcGxheSA9IGNtLmRpc3BsYXksIGRvYyA9IGNtLmRvYztcbiAgdmFyIHJlc3VsdCA9IHByZXBhcmVTZWxlY3Rpb24oY20pO1xuXG4gIC8vIE1vdmUgdGhlIGhpZGRlbiB0ZXh0YXJlYSBuZWFyIHRoZSBjdXJzb3IgdG8gcHJldmVudCBzY3JvbGxpbmcgYXJ0aWZhY3RzXG4gIGlmIChjbS5vcHRpb25zLm1vdmVJbnB1dFdpdGhDdXJzb3IpIHtcbiAgICB2YXIgaGVhZFBvcyA9IGN1cnNvckNvb3JkcyhjbSwgZG9jLnNlbC5wcmltYXJ5KCkuaGVhZCwgXCJkaXZcIik7XG4gICAgdmFyIHdyYXBPZmYgPSBkaXNwbGF5LndyYXBwZXIuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCksIGxpbmVPZmYgPSBkaXNwbGF5LmxpbmVEaXYuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgcmVzdWx0LnRlVG9wID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oZGlzcGxheS53cmFwcGVyLmNsaWVudEhlaWdodCAtIDEwLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGhlYWRQb3MudG9wICsgbGluZU9mZi50b3AgLSB3cmFwT2ZmLnRvcCkpO1xuICAgIHJlc3VsdC50ZUxlZnQgPSBNYXRoLm1heCgwLCBNYXRoLm1pbihkaXNwbGF5LndyYXBwZXIuY2xpZW50V2lkdGggLSAxMCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaGVhZFBvcy5sZWZ0ICsgbGluZU9mZi5sZWZ0IC0gd3JhcE9mZi5sZWZ0KSk7XG4gIH1cblxuICByZXR1cm4gcmVzdWx0XG59O1xuXG5UZXh0YXJlYUlucHV0LnByb3RvdHlwZS5zaG93U2VsZWN0aW9uID0gZnVuY3Rpb24gKGRyYXduKSB7XG4gIHZhciBjbSA9IHRoaXMuY20sIGRpc3BsYXkgPSBjbS5kaXNwbGF5O1xuICByZW1vdmVDaGlsZHJlbkFuZEFkZChkaXNwbGF5LmN1cnNvckRpdiwgZHJhd24uY3Vyc29ycyk7XG4gIHJlbW92ZUNoaWxkcmVuQW5kQWRkKGRpc3BsYXkuc2VsZWN0aW9uRGl2LCBkcmF3bi5zZWxlY3Rpb24pO1xuICBpZiAoZHJhd24udGVUb3AgIT0gbnVsbCkge1xuICAgIHRoaXMud3JhcHBlci5zdHlsZS50b3AgPSBkcmF3bi50ZVRvcCArIFwicHhcIjtcbiAgICB0aGlzLndyYXBwZXIuc3R5bGUubGVmdCA9IGRyYXduLnRlTGVmdCArIFwicHhcIjtcbiAgfVxufTtcblxuLy8gUmVzZXQgdGhlIGlucHV0IHRvIGNvcnJlc3BvbmQgdG8gdGhlIHNlbGVjdGlvbiAob3IgdG8gYmUgZW1wdHksXG4vLyB3aGVuIG5vdCB0eXBpbmcgYW5kIG5vdGhpbmcgaXMgc2VsZWN0ZWQpXG5UZXh0YXJlYUlucHV0LnByb3RvdHlwZS5yZXNldCA9IGZ1bmN0aW9uICh0eXBpbmcpIHtcbiAgaWYgKHRoaXMuY29udGV4dE1lbnVQZW5kaW5nIHx8IHRoaXMuY29tcG9zaW5nKSB7IHJldHVybiB9XG4gIHZhciBjbSA9IHRoaXMuY207XG4gIGlmIChjbS5zb21ldGhpbmdTZWxlY3RlZCgpKSB7XG4gICAgdGhpcy5wcmV2SW5wdXQgPSBcIlwiO1xuICAgIHZhciBjb250ZW50ID0gY20uZ2V0U2VsZWN0aW9uKCk7XG4gICAgdGhpcy50ZXh0YXJlYS52YWx1ZSA9IGNvbnRlbnQ7XG4gICAgaWYgKGNtLnN0YXRlLmZvY3VzZWQpIHsgc2VsZWN0SW5wdXQodGhpcy50ZXh0YXJlYSk7IH1cbiAgICBpZiAoaWUgJiYgaWVfdmVyc2lvbiA+PSA5KSB7IHRoaXMuaGFzU2VsZWN0aW9uID0gY29udGVudDsgfVxuICB9IGVsc2UgaWYgKCF0eXBpbmcpIHtcbiAgICB0aGlzLnByZXZJbnB1dCA9IHRoaXMudGV4dGFyZWEudmFsdWUgPSBcIlwiO1xuICAgIGlmIChpZSAmJiBpZV92ZXJzaW9uID49IDkpIHsgdGhpcy5oYXNTZWxlY3Rpb24gPSBudWxsOyB9XG4gIH1cbn07XG5cblRleHRhcmVhSW5wdXQucHJvdG90eXBlLmdldEZpZWxkID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gdGhpcy50ZXh0YXJlYSB9O1xuXG5UZXh0YXJlYUlucHV0LnByb3RvdHlwZS5zdXBwb3J0c1RvdWNoID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gZmFsc2UgfTtcblxuVGV4dGFyZWFJbnB1dC5wcm90b3R5cGUuZm9jdXMgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmNtLm9wdGlvbnMucmVhZE9ubHkgIT0gXCJub2N1cnNvclwiICYmICghbW9iaWxlIHx8IGFjdGl2ZUVsdCgpICE9IHRoaXMudGV4dGFyZWEpKSB7XG4gICAgdHJ5IHsgdGhpcy50ZXh0YXJlYS5mb2N1cygpOyB9XG4gICAgY2F0Y2ggKGUpIHt9IC8vIElFOCB3aWxsIHRocm93IGlmIHRoZSB0ZXh0YXJlYSBpcyBkaXNwbGF5OiBub25lIG9yIG5vdCBpbiBET01cbiAgfVxufTtcblxuVGV4dGFyZWFJbnB1dC5wcm90b3R5cGUuYmx1ciA9IGZ1bmN0aW9uICgpIHsgdGhpcy50ZXh0YXJlYS5ibHVyKCk7IH07XG5cblRleHRhcmVhSW5wdXQucHJvdG90eXBlLnJlc2V0UG9zaXRpb24gPSBmdW5jdGlvbiAoKSB7XG4gIHRoaXMud3JhcHBlci5zdHlsZS50b3AgPSB0aGlzLndyYXBwZXIuc3R5bGUubGVmdCA9IDA7XG59O1xuXG5UZXh0YXJlYUlucHV0LnByb3RvdHlwZS5yZWNlaXZlZEZvY3VzID0gZnVuY3Rpb24gKCkgeyB0aGlzLnNsb3dQb2xsKCk7IH07XG5cbi8vIFBvbGwgZm9yIGlucHV0IGNoYW5nZXMsIHVzaW5nIHRoZSBub3JtYWwgcmF0ZSBvZiBwb2xsaW5nLiBUaGlzXG4vLyBydW5zIGFzIGxvbmcgYXMgdGhlIGVkaXRvciBpcyBmb2N1c2VkLlxuVGV4dGFyZWFJbnB1dC5wcm90b3R5cGUuc2xvd1BvbGwgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHRoaXMkMSA9IHRoaXM7XG5cbiAgaWYgKHRoaXMucG9sbGluZ0Zhc3QpIHsgcmV0dXJuIH1cbiAgdGhpcy5wb2xsaW5nLnNldCh0aGlzLmNtLm9wdGlvbnMucG9sbEludGVydmFsLCBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcyQxLnBvbGwoKTtcbiAgICBpZiAodGhpcyQxLmNtLnN0YXRlLmZvY3VzZWQpIHsgdGhpcyQxLnNsb3dQb2xsKCk7IH1cbiAgfSk7XG59O1xuXG4vLyBXaGVuIGFuIGV2ZW50IGhhcyBqdXN0IGNvbWUgaW4gdGhhdCBpcyBsaWtlbHkgdG8gYWRkIG9yIGNoYW5nZVxuLy8gc29tZXRoaW5nIGluIHRoZSBpbnB1dCB0ZXh0YXJlYSwgd2UgcG9sbCBmYXN0ZXIsIHRvIGVuc3VyZSB0aGF0XG4vLyB0aGUgY2hhbmdlIGFwcGVhcnMgb24gdGhlIHNjcmVlbiBxdWlja2x5LlxuVGV4dGFyZWFJbnB1dC5wcm90b3R5cGUuZmFzdFBvbGwgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBtaXNzZWQgPSBmYWxzZSwgaW5wdXQgPSB0aGlzO1xuICBpbnB1dC5wb2xsaW5nRmFzdCA9IHRydWU7XG4gIGZ1bmN0aW9uIHAoKSB7XG4gICAgdmFyIGNoYW5nZWQgPSBpbnB1dC5wb2xsKCk7XG4gICAgaWYgKCFjaGFuZ2VkICYmICFtaXNzZWQpIHttaXNzZWQgPSB0cnVlOyBpbnB1dC5wb2xsaW5nLnNldCg2MCwgcCk7fVxuICAgIGVsc2Uge2lucHV0LnBvbGxpbmdGYXN0ID0gZmFsc2U7IGlucHV0LnNsb3dQb2xsKCk7fVxuICB9XG4gIGlucHV0LnBvbGxpbmcuc2V0KDIwLCBwKTtcbn07XG5cbi8vIFJlYWQgaW5wdXQgZnJvbSB0aGUgdGV4dGFyZWEsIGFuZCB1cGRhdGUgdGhlIGRvY3VtZW50IHRvIG1hdGNoLlxuLy8gV2hlbiBzb21ldGhpbmcgaXMgc2VsZWN0ZWQsIGl0IGlzIHByZXNlbnQgaW4gdGhlIHRleHRhcmVhLCBhbmRcbi8vIHNlbGVjdGVkICh1bmxlc3MgaXQgaXMgaHVnZSwgaW4gd2hpY2ggY2FzZSBhIHBsYWNlaG9sZGVyIGlzXG4vLyB1c2VkKS4gV2hlbiBub3RoaW5nIGlzIHNlbGVjdGVkLCB0aGUgY3Vyc29yIHNpdHMgYWZ0ZXIgcHJldmlvdXNseVxuLy8gc2VlbiB0ZXh0IChjYW4gYmUgZW1wdHkpLCB3aGljaCBpcyBzdG9yZWQgaW4gcHJldklucHV0ICh3ZSBtdXN0XG4vLyBub3QgcmVzZXQgdGhlIHRleHRhcmVhIHdoZW4gdHlwaW5nLCBiZWNhdXNlIHRoYXQgYnJlYWtzIElNRSkuXG5UZXh0YXJlYUlucHV0LnByb3RvdHlwZS5wb2xsID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciB0aGlzJDEgPSB0aGlzO1xuXG4gIHZhciBjbSA9IHRoaXMuY20sIGlucHV0ID0gdGhpcy50ZXh0YXJlYSwgcHJldklucHV0ID0gdGhpcy5wcmV2SW5wdXQ7XG4gIC8vIFNpbmNlIHRoaXMgaXMgY2FsbGVkIGEgKmxvdCosIHRyeSB0byBiYWlsIG91dCBhcyBjaGVhcGx5IGFzXG4gIC8vIHBvc3NpYmxlIHdoZW4gaXQgaXMgY2xlYXIgdGhhdCBub3RoaW5nIGhhcHBlbmVkLiBoYXNTZWxlY3Rpb25cbiAgLy8gd2lsbCBiZSB0aGUgY2FzZSB3aGVuIHRoZXJlIGlzIGEgbG90IG9mIHRleHQgaW4gdGhlIHRleHRhcmVhLFxuICAvLyBpbiB3aGljaCBjYXNlIHJlYWRpbmcgaXRzIHZhbHVlIHdvdWxkIGJlIGV4cGVuc2l2ZS5cbiAgaWYgKHRoaXMuY29udGV4dE1lbnVQZW5kaW5nIHx8ICFjbS5zdGF0ZS5mb2N1c2VkIHx8XG4gICAgICAoaGFzU2VsZWN0aW9uKGlucHV0KSAmJiAhcHJldklucHV0ICYmICF0aGlzLmNvbXBvc2luZykgfHxcbiAgICAgIGNtLmlzUmVhZE9ubHkoKSB8fCBjbS5vcHRpb25zLmRpc2FibGVJbnB1dCB8fCBjbS5zdGF0ZS5rZXlTZXEpXG4gICAgeyByZXR1cm4gZmFsc2UgfVxuXG4gIHZhciB0ZXh0ID0gaW5wdXQudmFsdWU7XG4gIC8vIElmIG5vdGhpbmcgY2hhbmdlZCwgYmFpbC5cbiAgaWYgKHRleHQgPT0gcHJldklucHV0ICYmICFjbS5zb21ldGhpbmdTZWxlY3RlZCgpKSB7IHJldHVybiBmYWxzZSB9XG4gIC8vIFdvcmsgYXJvdW5kIG5vbnNlbnNpY2FsIHNlbGVjdGlvbiByZXNldHRpbmcgaW4gSUU5LzEwLCBhbmRcbiAgLy8gaW5leHBsaWNhYmxlIGFwcGVhcmFuY2Ugb2YgcHJpdmF0ZSBhcmVhIHVuaWNvZGUgY2hhcmFjdGVycyBvblxuICAvLyBzb21lIGtleSBjb21ib3MgaW4gTWFjICgjMjY4OSkuXG4gIGlmIChpZSAmJiBpZV92ZXJzaW9uID49IDkgJiYgdGhpcy5oYXNTZWxlY3Rpb24gPT09IHRleHQgfHxcbiAgICAgIG1hYyAmJiAvW1xcdWY3MDAtXFx1ZjdmZl0vLnRlc3QodGV4dCkpIHtcbiAgICBjbS5kaXNwbGF5LmlucHV0LnJlc2V0KCk7XG4gICAgcmV0dXJuIGZhbHNlXG4gIH1cblxuICBpZiAoY20uZG9jLnNlbCA9PSBjbS5kaXNwbGF5LnNlbEZvckNvbnRleHRNZW51KSB7XG4gICAgdmFyIGZpcnN0ID0gdGV4dC5jaGFyQ29kZUF0KDApO1xuICAgIGlmIChmaXJzdCA9PSAweDIwMGIgJiYgIXByZXZJbnB1dCkgeyBwcmV2SW5wdXQgPSBcIlxcdTIwMGJcIjsgfVxuICAgIGlmIChmaXJzdCA9PSAweDIxZGEpIHsgdGhpcy5yZXNldCgpOyByZXR1cm4gdGhpcy5jbS5leGVjQ29tbWFuZChcInVuZG9cIikgfVxuICB9XG4gIC8vIEZpbmQgdGhlIHBhcnQgb2YgdGhlIGlucHV0IHRoYXQgaXMgYWN0dWFsbHkgbmV3XG4gIHZhciBzYW1lID0gMCwgbCA9IE1hdGgubWluKHByZXZJbnB1dC5sZW5ndGgsIHRleHQubGVuZ3RoKTtcbiAgd2hpbGUgKHNhbWUgPCBsICYmIHByZXZJbnB1dC5jaGFyQ29kZUF0KHNhbWUpID09IHRleHQuY2hhckNvZGVBdChzYW1lKSkgeyArK3NhbWU7IH1cblxuICBydW5Jbk9wKGNtLCBmdW5jdGlvbiAoKSB7XG4gICAgYXBwbHlUZXh0SW5wdXQoY20sIHRleHQuc2xpY2Uoc2FtZSksIHByZXZJbnB1dC5sZW5ndGggLSBzYW1lLFxuICAgICAgICAgICAgICAgICAgIG51bGwsIHRoaXMkMS5jb21wb3NpbmcgPyBcIipjb21wb3NlXCIgOiBudWxsKTtcblxuICAgIC8vIERvbid0IGxlYXZlIGxvbmcgdGV4dCBpbiB0aGUgdGV4dGFyZWEsIHNpbmNlIGl0IG1ha2VzIGZ1cnRoZXIgcG9sbGluZyBzbG93XG4gICAgaWYgKHRleHQubGVuZ3RoID4gMTAwMCB8fCB0ZXh0LmluZGV4T2YoXCJcXG5cIikgPiAtMSkgeyBpbnB1dC52YWx1ZSA9IHRoaXMkMS5wcmV2SW5wdXQgPSBcIlwiOyB9XG4gICAgZWxzZSB7IHRoaXMkMS5wcmV2SW5wdXQgPSB0ZXh0OyB9XG5cbiAgICBpZiAodGhpcyQxLmNvbXBvc2luZykge1xuICAgICAgdGhpcyQxLmNvbXBvc2luZy5yYW5nZS5jbGVhcigpO1xuICAgICAgdGhpcyQxLmNvbXBvc2luZy5yYW5nZSA9IGNtLm1hcmtUZXh0KHRoaXMkMS5jb21wb3Npbmcuc3RhcnQsIGNtLmdldEN1cnNvcihcInRvXCIpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB7Y2xhc3NOYW1lOiBcIkNvZGVNaXJyb3ItY29tcG9zaW5nXCJ9KTtcbiAgICB9XG4gIH0pO1xuICByZXR1cm4gdHJ1ZVxufTtcblxuVGV4dGFyZWFJbnB1dC5wcm90b3R5cGUuZW5zdXJlUG9sbGVkID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5wb2xsaW5nRmFzdCAmJiB0aGlzLnBvbGwoKSkgeyB0aGlzLnBvbGxpbmdGYXN0ID0gZmFsc2U7IH1cbn07XG5cblRleHRhcmVhSW5wdXQucHJvdG90eXBlLm9uS2V5UHJlc3MgPSBmdW5jdGlvbiAoKSB7XG4gIGlmIChpZSAmJiBpZV92ZXJzaW9uID49IDkpIHsgdGhpcy5oYXNTZWxlY3Rpb24gPSBudWxsOyB9XG4gIHRoaXMuZmFzdFBvbGwoKTtcbn07XG5cblRleHRhcmVhSW5wdXQucHJvdG90eXBlLm9uQ29udGV4dE1lbnUgPSBmdW5jdGlvbiAoZSkge1xuICB2YXIgaW5wdXQgPSB0aGlzLCBjbSA9IGlucHV0LmNtLCBkaXNwbGF5ID0gY20uZGlzcGxheSwgdGUgPSBpbnB1dC50ZXh0YXJlYTtcbiAgdmFyIHBvcyA9IHBvc0Zyb21Nb3VzZShjbSwgZSksIHNjcm9sbFBvcyA9IGRpc3BsYXkuc2Nyb2xsZXIuc2Nyb2xsVG9wO1xuICBpZiAoIXBvcyB8fCBwcmVzdG8pIHsgcmV0dXJuIH0gLy8gT3BlcmEgaXMgZGlmZmljdWx0LlxuXG4gIC8vIFJlc2V0IHRoZSBjdXJyZW50IHRleHQgc2VsZWN0aW9uIG9ubHkgaWYgdGhlIGNsaWNrIGlzIGRvbmUgb3V0c2lkZSBvZiB0aGUgc2VsZWN0aW9uXG4gIC8vIGFuZCAncmVzZXRTZWxlY3Rpb25PbkNvbnRleHRNZW51JyBvcHRpb24gaXMgdHJ1ZS5cbiAgdmFyIHJlc2V0ID0gY20ub3B0aW9ucy5yZXNldFNlbGVjdGlvbk9uQ29udGV4dE1lbnU7XG4gIGlmIChyZXNldCAmJiBjbS5kb2Muc2VsLmNvbnRhaW5zKHBvcykgPT0gLTEpXG4gICAgeyBvcGVyYXRpb24oY20sIHNldFNlbGVjdGlvbikoY20uZG9jLCBzaW1wbGVTZWxlY3Rpb24ocG9zKSwgc2VsX2RvbnRTY3JvbGwpOyB9XG5cbiAgdmFyIG9sZENTUyA9IHRlLnN0eWxlLmNzc1RleHQsIG9sZFdyYXBwZXJDU1MgPSBpbnB1dC53cmFwcGVyLnN0eWxlLmNzc1RleHQ7XG4gIGlucHV0LndyYXBwZXIuc3R5bGUuY3NzVGV4dCA9IFwicG9zaXRpb246IGFic29sdXRlXCI7XG4gIHZhciB3cmFwcGVyQm94ID0gaW5wdXQud3JhcHBlci5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgdGUuc3R5bGUuY3NzVGV4dCA9IFwicG9zaXRpb246IGFic29sdXRlOyB3aWR0aDogMzBweDsgaGVpZ2h0OiAzMHB4O1xcbiAgICAgIHRvcDogXCIgKyAoZS5jbGllbnRZIC0gd3JhcHBlckJveC50b3AgLSA1KSArIFwicHg7IGxlZnQ6IFwiICsgKGUuY2xpZW50WCAtIHdyYXBwZXJCb3gubGVmdCAtIDUpICsgXCJweDtcXG4gICAgICB6LWluZGV4OiAxMDAwOyBiYWNrZ3JvdW5kOiBcIiArIChpZSA/IFwicmdiYSgyNTUsIDI1NSwgMjU1LCAuMDUpXCIgOiBcInRyYW5zcGFyZW50XCIpICsgXCI7XFxuICAgICAgb3V0bGluZTogbm9uZTsgYm9yZGVyLXdpZHRoOiAwOyBvdXRsaW5lOiBub25lOyBvdmVyZmxvdzogaGlkZGVuOyBvcGFjaXR5OiAuMDU7IGZpbHRlcjogYWxwaGEob3BhY2l0eT01KTtcIjtcbiAgdmFyIG9sZFNjcm9sbFk7XG4gIGlmICh3ZWJraXQpIHsgb2xkU2Nyb2xsWSA9IHdpbmRvdy5zY3JvbGxZOyB9IC8vIFdvcmsgYXJvdW5kIENocm9tZSBpc3N1ZSAoIzI3MTIpXG4gIGRpc3BsYXkuaW5wdXQuZm9jdXMoKTtcbiAgaWYgKHdlYmtpdCkgeyB3aW5kb3cuc2Nyb2xsVG8obnVsbCwgb2xkU2Nyb2xsWSk7IH1cbiAgZGlzcGxheS5pbnB1dC5yZXNldCgpO1xuICAvLyBBZGRzIFwiU2VsZWN0IGFsbFwiIHRvIGNvbnRleHQgbWVudSBpbiBGRlxuICBpZiAoIWNtLnNvbWV0aGluZ1NlbGVjdGVkKCkpIHsgdGUudmFsdWUgPSBpbnB1dC5wcmV2SW5wdXQgPSBcIiBcIjsgfVxuICBpbnB1dC5jb250ZXh0TWVudVBlbmRpbmcgPSB0cnVlO1xuICBkaXNwbGF5LnNlbEZvckNvbnRleHRNZW51ID0gY20uZG9jLnNlbDtcbiAgY2xlYXJUaW1lb3V0KGRpc3BsYXkuZGV0ZWN0aW5nU2VsZWN0QWxsKTtcblxuICAvLyBTZWxlY3QtYWxsIHdpbGwgYmUgZ3JleWVkIG91dCBpZiB0aGVyZSdzIG5vdGhpbmcgdG8gc2VsZWN0LCBzb1xuICAvLyB0aGlzIGFkZHMgYSB6ZXJvLXdpZHRoIHNwYWNlIHNvIHRoYXQgd2UgY2FuIGxhdGVyIGNoZWNrIHdoZXRoZXJcbiAgLy8gaXQgZ290IHNlbGVjdGVkLlxuICBmdW5jdGlvbiBwcmVwYXJlU2VsZWN0QWxsSGFjaygpIHtcbiAgICBpZiAodGUuc2VsZWN0aW9uU3RhcnQgIT0gbnVsbCkge1xuICAgICAgdmFyIHNlbGVjdGVkID0gY20uc29tZXRoaW5nU2VsZWN0ZWQoKTtcbiAgICAgIHZhciBleHR2YWwgPSBcIlxcdTIwMGJcIiArIChzZWxlY3RlZCA/IHRlLnZhbHVlIDogXCJcIik7XG4gICAgICB0ZS52YWx1ZSA9IFwiXFx1MjFkYVwiOyAvLyBVc2VkIHRvIGNhdGNoIGNvbnRleHQtbWVudSB1bmRvXG4gICAgICB0ZS52YWx1ZSA9IGV4dHZhbDtcbiAgICAgIGlucHV0LnByZXZJbnB1dCA9IHNlbGVjdGVkID8gXCJcIiA6IFwiXFx1MjAwYlwiO1xuICAgICAgdGUuc2VsZWN0aW9uU3RhcnQgPSAxOyB0ZS5zZWxlY3Rpb25FbmQgPSBleHR2YWwubGVuZ3RoO1xuICAgICAgLy8gUmUtc2V0IHRoaXMsIGluIGNhc2Ugc29tZSBvdGhlciBoYW5kbGVyIHRvdWNoZWQgdGhlXG4gICAgICAvLyBzZWxlY3Rpb24gaW4gdGhlIG1lYW50aW1lLlxuICAgICAgZGlzcGxheS5zZWxGb3JDb250ZXh0TWVudSA9IGNtLmRvYy5zZWw7XG4gICAgfVxuICB9XG4gIGZ1bmN0aW9uIHJlaGlkZSgpIHtcbiAgICBpbnB1dC5jb250ZXh0TWVudVBlbmRpbmcgPSBmYWxzZTtcbiAgICBpbnB1dC53cmFwcGVyLnN0eWxlLmNzc1RleHQgPSBvbGRXcmFwcGVyQ1NTO1xuICAgIHRlLnN0eWxlLmNzc1RleHQgPSBvbGRDU1M7XG4gICAgaWYgKGllICYmIGllX3ZlcnNpb24gPCA5KSB7IGRpc3BsYXkuc2Nyb2xsYmFycy5zZXRTY3JvbGxUb3AoZGlzcGxheS5zY3JvbGxlci5zY3JvbGxUb3AgPSBzY3JvbGxQb3MpOyB9XG5cbiAgICAvLyBUcnkgdG8gZGV0ZWN0IHRoZSB1c2VyIGNob29zaW5nIHNlbGVjdC1hbGxcbiAgICBpZiAodGUuc2VsZWN0aW9uU3RhcnQgIT0gbnVsbCkge1xuICAgICAgaWYgKCFpZSB8fCAoaWUgJiYgaWVfdmVyc2lvbiA8IDkpKSB7IHByZXBhcmVTZWxlY3RBbGxIYWNrKCk7IH1cbiAgICAgIHZhciBpID0gMCwgcG9sbCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKGRpc3BsYXkuc2VsRm9yQ29udGV4dE1lbnUgPT0gY20uZG9jLnNlbCAmJiB0ZS5zZWxlY3Rpb25TdGFydCA9PSAwICYmXG4gICAgICAgICAgICB0ZS5zZWxlY3Rpb25FbmQgPiAwICYmIGlucHV0LnByZXZJbnB1dCA9PSBcIlxcdTIwMGJcIikge1xuICAgICAgICAgIG9wZXJhdGlvbihjbSwgc2VsZWN0QWxsKShjbSk7XG4gICAgICAgIH0gZWxzZSBpZiAoaSsrIDwgMTApIHtcbiAgICAgICAgICBkaXNwbGF5LmRldGVjdGluZ1NlbGVjdEFsbCA9IHNldFRpbWVvdXQocG9sbCwgNTAwKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBkaXNwbGF5LnNlbEZvckNvbnRleHRNZW51ID0gbnVsbDtcbiAgICAgICAgICBkaXNwbGF5LmlucHV0LnJlc2V0KCk7XG4gICAgICAgIH1cbiAgICAgIH07XG4gICAgICBkaXNwbGF5LmRldGVjdGluZ1NlbGVjdEFsbCA9IHNldFRpbWVvdXQocG9sbCwgMjAwKTtcbiAgICB9XG4gIH1cblxuICBpZiAoaWUgJiYgaWVfdmVyc2lvbiA+PSA5KSB7IHByZXBhcmVTZWxlY3RBbGxIYWNrKCk7IH1cbiAgaWYgKGNhcHR1cmVSaWdodENsaWNrKSB7XG4gICAgZV9zdG9wKGUpO1xuICAgIHZhciBtb3VzZXVwID0gZnVuY3Rpb24gKCkge1xuICAgICAgb2ZmKHdpbmRvdywgXCJtb3VzZXVwXCIsIG1vdXNldXApO1xuICAgICAgc2V0VGltZW91dChyZWhpZGUsIDIwKTtcbiAgICB9O1xuICAgIG9uKHdpbmRvdywgXCJtb3VzZXVwXCIsIG1vdXNldXApO1xuICB9IGVsc2Uge1xuICAgIHNldFRpbWVvdXQocmVoaWRlLCA1MCk7XG4gIH1cbn07XG5cblRleHRhcmVhSW5wdXQucHJvdG90eXBlLnJlYWRPbmx5Q2hhbmdlZCA9IGZ1bmN0aW9uICh2YWwpIHtcbiAgaWYgKCF2YWwpIHsgdGhpcy5yZXNldCgpOyB9XG4gIHRoaXMudGV4dGFyZWEuZGlzYWJsZWQgPSB2YWwgPT0gXCJub2N1cnNvclwiO1xufTtcblxuVGV4dGFyZWFJbnB1dC5wcm90b3R5cGUuc2V0VW5lZGl0YWJsZSA9IGZ1bmN0aW9uICgpIHt9O1xuXG5UZXh0YXJlYUlucHV0LnByb3RvdHlwZS5uZWVkc0NvbnRlbnRBdHRyaWJ1dGUgPSBmYWxzZTtcblxuZnVuY3Rpb24gZnJvbVRleHRBcmVhKHRleHRhcmVhLCBvcHRpb25zKSB7XG4gIG9wdGlvbnMgPSBvcHRpb25zID8gY29weU9iaihvcHRpb25zKSA6IHt9O1xuICBvcHRpb25zLnZhbHVlID0gdGV4dGFyZWEudmFsdWU7XG4gIGlmICghb3B0aW9ucy50YWJpbmRleCAmJiB0ZXh0YXJlYS50YWJJbmRleClcbiAgICB7IG9wdGlvbnMudGFiaW5kZXggPSB0ZXh0YXJlYS50YWJJbmRleDsgfVxuICBpZiAoIW9wdGlvbnMucGxhY2Vob2xkZXIgJiYgdGV4dGFyZWEucGxhY2Vob2xkZXIpXG4gICAgeyBvcHRpb25zLnBsYWNlaG9sZGVyID0gdGV4dGFyZWEucGxhY2Vob2xkZXI7IH1cbiAgLy8gU2V0IGF1dG9mb2N1cyB0byB0cnVlIGlmIHRoaXMgdGV4dGFyZWEgaXMgZm9jdXNlZCwgb3IgaWYgaXQgaGFzXG4gIC8vIGF1dG9mb2N1cyBhbmQgbm8gb3RoZXIgZWxlbWVudCBpcyBmb2N1c2VkLlxuICBpZiAob3B0aW9ucy5hdXRvZm9jdXMgPT0gbnVsbCkge1xuICAgIHZhciBoYXNGb2N1cyA9IGFjdGl2ZUVsdCgpO1xuICAgIG9wdGlvbnMuYXV0b2ZvY3VzID0gaGFzRm9jdXMgPT0gdGV4dGFyZWEgfHxcbiAgICAgIHRleHRhcmVhLmdldEF0dHJpYnV0ZShcImF1dG9mb2N1c1wiKSAhPSBudWxsICYmIGhhc0ZvY3VzID09IGRvY3VtZW50LmJvZHk7XG4gIH1cblxuICBmdW5jdGlvbiBzYXZlKCkge3RleHRhcmVhLnZhbHVlID0gY20uZ2V0VmFsdWUoKTt9XG5cbiAgdmFyIHJlYWxTdWJtaXQ7XG4gIGlmICh0ZXh0YXJlYS5mb3JtKSB7XG4gICAgb24odGV4dGFyZWEuZm9ybSwgXCJzdWJtaXRcIiwgc2F2ZSk7XG4gICAgLy8gRGVwbG9yYWJsZSBoYWNrIHRvIG1ha2UgdGhlIHN1Ym1pdCBtZXRob2QgZG8gdGhlIHJpZ2h0IHRoaW5nLlxuICAgIGlmICghb3B0aW9ucy5sZWF2ZVN1Ym1pdE1ldGhvZEFsb25lKSB7XG4gICAgICB2YXIgZm9ybSA9IHRleHRhcmVhLmZvcm07XG4gICAgICByZWFsU3VibWl0ID0gZm9ybS5zdWJtaXQ7XG4gICAgICB0cnkge1xuICAgICAgICB2YXIgd3JhcHBlZFN1Ym1pdCA9IGZvcm0uc3VibWl0ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgIHNhdmUoKTtcbiAgICAgICAgICBmb3JtLnN1Ym1pdCA9IHJlYWxTdWJtaXQ7XG4gICAgICAgICAgZm9ybS5zdWJtaXQoKTtcbiAgICAgICAgICBmb3JtLnN1Ym1pdCA9IHdyYXBwZWRTdWJtaXQ7XG4gICAgICAgIH07XG4gICAgICB9IGNhdGNoKGUpIHt9XG4gICAgfVxuICB9XG5cbiAgb3B0aW9ucy5maW5pc2hJbml0ID0gZnVuY3Rpb24gKGNtKSB7XG4gICAgY20uc2F2ZSA9IHNhdmU7XG4gICAgY20uZ2V0VGV4dEFyZWEgPSBmdW5jdGlvbiAoKSB7IHJldHVybiB0ZXh0YXJlYTsgfTtcbiAgICBjbS50b1RleHRBcmVhID0gZnVuY3Rpb24gKCkge1xuICAgICAgY20udG9UZXh0QXJlYSA9IGlzTmFOOyAvLyBQcmV2ZW50IHRoaXMgZnJvbSBiZWluZyByYW4gdHdpY2VcbiAgICAgIHNhdmUoKTtcbiAgICAgIHRleHRhcmVhLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQoY20uZ2V0V3JhcHBlckVsZW1lbnQoKSk7XG4gICAgICB0ZXh0YXJlYS5zdHlsZS5kaXNwbGF5ID0gXCJcIjtcbiAgICAgIGlmICh0ZXh0YXJlYS5mb3JtKSB7XG4gICAgICAgIG9mZih0ZXh0YXJlYS5mb3JtLCBcInN1Ym1pdFwiLCBzYXZlKTtcbiAgICAgICAgaWYgKHR5cGVvZiB0ZXh0YXJlYS5mb3JtLnN1Ym1pdCA9PSBcImZ1bmN0aW9uXCIpXG4gICAgICAgICAgeyB0ZXh0YXJlYS5mb3JtLnN1Ym1pdCA9IHJlYWxTdWJtaXQ7IH1cbiAgICAgIH1cbiAgICB9O1xuICB9O1xuXG4gIHRleHRhcmVhLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgdmFyIGNtID0gQ29kZU1pcnJvciQxKGZ1bmN0aW9uIChub2RlKSB7IHJldHVybiB0ZXh0YXJlYS5wYXJlbnROb2RlLmluc2VydEJlZm9yZShub2RlLCB0ZXh0YXJlYS5uZXh0U2libGluZyk7IH0sXG4gICAgb3B0aW9ucyk7XG4gIHJldHVybiBjbVxufVxuXG5mdW5jdGlvbiBhZGRMZWdhY3lQcm9wcyhDb2RlTWlycm9yKSB7XG4gIENvZGVNaXJyb3Iub2ZmID0gb2ZmO1xuICBDb2RlTWlycm9yLm9uID0gb247XG4gIENvZGVNaXJyb3Iud2hlZWxFdmVudFBpeGVscyA9IHdoZWVsRXZlbnRQaXhlbHM7XG4gIENvZGVNaXJyb3IuRG9jID0gRG9jO1xuICBDb2RlTWlycm9yLnNwbGl0TGluZXMgPSBzcGxpdExpbmVzQXV0bztcbiAgQ29kZU1pcnJvci5jb3VudENvbHVtbiA9IGNvdW50Q29sdW1uO1xuICBDb2RlTWlycm9yLmZpbmRDb2x1bW4gPSBmaW5kQ29sdW1uO1xuICBDb2RlTWlycm9yLmlzV29yZENoYXIgPSBpc1dvcmRDaGFyQmFzaWM7XG4gIENvZGVNaXJyb3IuUGFzcyA9IFBhc3M7XG4gIENvZGVNaXJyb3Iuc2lnbmFsID0gc2lnbmFsO1xuICBDb2RlTWlycm9yLkxpbmUgPSBMaW5lO1xuICBDb2RlTWlycm9yLmNoYW5nZUVuZCA9IGNoYW5nZUVuZDtcbiAgQ29kZU1pcnJvci5zY3JvbGxiYXJNb2RlbCA9IHNjcm9sbGJhck1vZGVsO1xuICBDb2RlTWlycm9yLlBvcyA9IFBvcztcbiAgQ29kZU1pcnJvci5jbXBQb3MgPSBjbXA7XG4gIENvZGVNaXJyb3IubW9kZXMgPSBtb2RlcztcbiAgQ29kZU1pcnJvci5taW1lTW9kZXMgPSBtaW1lTW9kZXM7XG4gIENvZGVNaXJyb3IucmVzb2x2ZU1vZGUgPSByZXNvbHZlTW9kZTtcbiAgQ29kZU1pcnJvci5nZXRNb2RlID0gZ2V0TW9kZTtcbiAgQ29kZU1pcnJvci5tb2RlRXh0ZW5zaW9ucyA9IG1vZGVFeHRlbnNpb25zO1xuICBDb2RlTWlycm9yLmV4dGVuZE1vZGUgPSBleHRlbmRNb2RlO1xuICBDb2RlTWlycm9yLmNvcHlTdGF0ZSA9IGNvcHlTdGF0ZTtcbiAgQ29kZU1pcnJvci5zdGFydFN0YXRlID0gc3RhcnRTdGF0ZTtcbiAgQ29kZU1pcnJvci5pbm5lck1vZGUgPSBpbm5lck1vZGU7XG4gIENvZGVNaXJyb3IuY29tbWFuZHMgPSBjb21tYW5kcztcbiAgQ29kZU1pcnJvci5rZXlNYXAgPSBrZXlNYXA7XG4gIENvZGVNaXJyb3Iua2V5TmFtZSA9IGtleU5hbWU7XG4gIENvZGVNaXJyb3IuaXNNb2RpZmllcktleSA9IGlzTW9kaWZpZXJLZXk7XG4gIENvZGVNaXJyb3IubG9va3VwS2V5ID0gbG9va3VwS2V5O1xuICBDb2RlTWlycm9yLm5vcm1hbGl6ZUtleU1hcCA9IG5vcm1hbGl6ZUtleU1hcDtcbiAgQ29kZU1pcnJvci5TdHJpbmdTdHJlYW0gPSBTdHJpbmdTdHJlYW07XG4gIENvZGVNaXJyb3IuU2hhcmVkVGV4dE1hcmtlciA9IFNoYXJlZFRleHRNYXJrZXI7XG4gIENvZGVNaXJyb3IuVGV4dE1hcmtlciA9IFRleHRNYXJrZXI7XG4gIENvZGVNaXJyb3IuTGluZVdpZGdldCA9IExpbmVXaWRnZXQ7XG4gIENvZGVNaXJyb3IuZV9wcmV2ZW50RGVmYXVsdCA9IGVfcHJldmVudERlZmF1bHQ7XG4gIENvZGVNaXJyb3IuZV9zdG9wUHJvcGFnYXRpb24gPSBlX3N0b3BQcm9wYWdhdGlvbjtcbiAgQ29kZU1pcnJvci5lX3N0b3AgPSBlX3N0b3A7XG4gIENvZGVNaXJyb3IuYWRkQ2xhc3MgPSBhZGRDbGFzcztcbiAgQ29kZU1pcnJvci5jb250YWlucyA9IGNvbnRhaW5zO1xuICBDb2RlTWlycm9yLnJtQ2xhc3MgPSBybUNsYXNzO1xuICBDb2RlTWlycm9yLmtleU5hbWVzID0ga2V5TmFtZXM7XG59XG5cbi8vIEVESVRPUiBDT05TVFJVQ1RPUlxuXG5kZWZpbmVPcHRpb25zKENvZGVNaXJyb3IkMSk7XG5cbmFkZEVkaXRvck1ldGhvZHMoQ29kZU1pcnJvciQxKTtcblxuLy8gU2V0IHVwIG1ldGhvZHMgb24gQ29kZU1pcnJvcidzIHByb3RvdHlwZSB0byByZWRpcmVjdCB0byB0aGUgZWRpdG9yJ3MgZG9jdW1lbnQuXG52YXIgZG9udERlbGVnYXRlID0gXCJpdGVyIGluc2VydCByZW1vdmUgY29weSBnZXRFZGl0b3IgY29uc3RydWN0b3JcIi5zcGxpdChcIiBcIik7XG5mb3IgKHZhciBwcm9wIGluIERvYy5wcm90b3R5cGUpIHsgaWYgKERvYy5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkocHJvcCkgJiYgaW5kZXhPZihkb250RGVsZWdhdGUsIHByb3ApIDwgMClcbiAgeyBDb2RlTWlycm9yJDEucHJvdG90eXBlW3Byb3BdID0gKGZ1bmN0aW9uKG1ldGhvZCkge1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtyZXR1cm4gbWV0aG9kLmFwcGx5KHRoaXMuZG9jLCBhcmd1bWVudHMpfVxuICB9KShEb2MucHJvdG90eXBlW3Byb3BdKTsgfSB9XG5cbmV2ZW50TWl4aW4oRG9jKTtcblxuLy8gSU5QVVQgSEFORExJTkdcblxuQ29kZU1pcnJvciQxLmlucHV0U3R5bGVzID0ge1widGV4dGFyZWFcIjogVGV4dGFyZWFJbnB1dCwgXCJjb250ZW50ZWRpdGFibGVcIjogQ29udGVudEVkaXRhYmxlSW5wdXR9O1xuXG4vLyBNT0RFIERFRklOSVRJT04gQU5EIFFVRVJZSU5HXG5cbi8vIEV4dHJhIGFyZ3VtZW50cyBhcmUgc3RvcmVkIGFzIHRoZSBtb2RlJ3MgZGVwZW5kZW5jaWVzLCB3aGljaCBpc1xuLy8gdXNlZCBieSAobGVnYWN5KSBtZWNoYW5pc21zIGxpa2UgbG9hZG1vZGUuanMgdG8gYXV0b21hdGljYWxseVxuLy8gbG9hZCBhIG1vZGUuIChQcmVmZXJyZWQgbWVjaGFuaXNtIGlzIHRoZSByZXF1aXJlL2RlZmluZSBjYWxscy4pXG5Db2RlTWlycm9yJDEuZGVmaW5lTW9kZSA9IGZ1bmN0aW9uKG5hbWUvKiwgbW9kZSwg4oCmKi8pIHtcbiAgaWYgKCFDb2RlTWlycm9yJDEuZGVmYXVsdHMubW9kZSAmJiBuYW1lICE9IFwibnVsbFwiKSB7IENvZGVNaXJyb3IkMS5kZWZhdWx0cy5tb2RlID0gbmFtZTsgfVxuICBkZWZpbmVNb2RlLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG59O1xuXG5Db2RlTWlycm9yJDEuZGVmaW5lTUlNRSA9IGRlZmluZU1JTUU7XG5cbi8vIE1pbmltYWwgZGVmYXVsdCBtb2RlLlxuQ29kZU1pcnJvciQxLmRlZmluZU1vZGUoXCJudWxsXCIsIGZ1bmN0aW9uICgpIHsgcmV0dXJuICh7dG9rZW46IGZ1bmN0aW9uIChzdHJlYW0pIHsgcmV0dXJuIHN0cmVhbS5za2lwVG9FbmQoKTsgfX0pOyB9KTtcbkNvZGVNaXJyb3IkMS5kZWZpbmVNSU1FKFwidGV4dC9wbGFpblwiLCBcIm51bGxcIik7XG5cbi8vIEVYVEVOU0lPTlNcblxuQ29kZU1pcnJvciQxLmRlZmluZUV4dGVuc2lvbiA9IGZ1bmN0aW9uIChuYW1lLCBmdW5jKSB7XG4gIENvZGVNaXJyb3IkMS5wcm90b3R5cGVbbmFtZV0gPSBmdW5jO1xufTtcbkNvZGVNaXJyb3IkMS5kZWZpbmVEb2NFeHRlbnNpb24gPSBmdW5jdGlvbiAobmFtZSwgZnVuYykge1xuICBEb2MucHJvdG90eXBlW25hbWVdID0gZnVuYztcbn07XG5cbkNvZGVNaXJyb3IkMS5mcm9tVGV4dEFyZWEgPSBmcm9tVGV4dEFyZWE7XG5cbmFkZExlZ2FjeVByb3BzKENvZGVNaXJyb3IkMSk7XG5cbkNvZGVNaXJyb3IkMS52ZXJzaW9uID0gXCI1LjM5LjBcIjtcblxucmV0dXJuIENvZGVNaXJyb3IkMTtcblxufSkpKTtcbiIsIkNvZGVNaXJyb3IgPSByZXF1aXJlKCdjb2RlbWlycm9yJyk7XG5cbnZhciB0b3RhbF9jZWxscyA9IDEwMDtcbi8vdmFyIHRvdGFsX2NvZGVfY2VsbHMgPSAxMDA7XG4vL3ZhciB0b3RhbF9tYXJrZG93bl9jZWxscyA9IDEwMDtcbnZhciBjbV9jb25maWcgPSB7XG4gICAgXCJpbmRlbnRVbml0XCI6NCxcbiAgICBcInJlYWRPbmx5XCI6ZmFsc2UsXG4gICAgXCJ0aGVtZVwiOlwiaXB5dGhvblwiLFxuICAgIFwiZXh0cmFLZXlzXCI6e1xuICAgICAgICBcIkNtZC1SaWdodFwiOlwiZ29MaW5lUmlnaHRcIixcbiAgICAgICAgXCJFbmRcIjpcImdvTGluZVJpZ2h0XCIsXG4gICAgICAgIFwiQ21kLUxlZnRcIjpcImdvTGluZUxlZnRcIixcbiAgICAgICAgXCJUYWJcIjpcImluZGVudE1vcmVcIixcbiAgICAgICAgXCJTaGlmdC1UYWJcIjpcImluZGVudExlc3NcIixcbiAgICAgICAgXCJDbWQtL1wiOlwidG9nZ2xlQ29tbWVudFwiLFxuICAgICAgICBcIkN0cmwtL1wiOlwidG9nZ2xlQ29tbWVudFwiLFxuICAgICAgICBcIkJhY2tzcGFjZVwiOlwiZGVsU3BhY2VUb1ByZXZUYWJTdG9wXCJcbiAgICB9LFxuICAgIFwibW9kZVwiOntcbiAgICAgICAgXCJuYW1lXCI6XCJpcHl0aG9uXCIsXG4gICAgICAgIFwidmVyc2lvblwiOjNcbiAgICB9LFxuICAgIFwibWF0Y2hCcmFja2V0c1wiOnRydWUsXG4gICAgXCJhdXRvQ2xvc2VCcmFja2V0c1wiOnRydWVcbn07XG5cbnZhciBjbV9jb25maWcyID0ge1xuICAgIFwiaW5kZW50VW5pdFwiOiA0LFxuICAgIFwicmVhZE9ubHlcIjogZmFsc2UsXG4gICAgXCJ0aGVtZVwiOiBcImRlZmF1bHRcIixcbiAgICBcImV4dHJhS2V5c1wiOiB7XG4gICAgICAgIFwiQ21kLVJpZ2h0XCI6IFwiZ29MaW5lUmlnaHRcIixcbiAgICAgICAgXCJFbmRcIjogXCJnb0xpbmVSaWdodFwiLFxuICAgICAgICBcIkNtZC1MZWZ0XCI6IFwiZ29MaW5lTGVmdFwiLFxuICAgICAgICBcIlRhYlwiOiBcImluZGVudE1vcmVcIixcbiAgICAgICAgXCJTaGlmdC1UYWJcIjogXCJpbmRlbnRMZXNzXCIsXG4gICAgICAgIFwiQ21kLS9cIjogXCJ0b2dnbGVDb21tZW50XCIsXG4gICAgICAgIFwiQ3RybC0vXCI6IFwidG9nZ2xlQ29tbWVudFwiXG4gICAgfSxcbiAgICBcIm1vZGVcIjogXCJpcHl0aG9uZ2ZtXCIsXG4gICAgXCJsaW5lV3JhcHBpbmdcIjogdHJ1ZVxufTtcblxuXG53aW5kb3cuc2hhcmVkX2VsZW1lbnRzID0ge307XG5mb3IgKHZhciBpPTA7IGk8dG90YWxfY2VsbHM7IGkrKykge1xuICAgIHZhciBvdXRwdXQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICB2YXIgaW5wdXRfYXJlYSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIGlucHV0X2FyZWEuY2xhc3NOYW1lID0gJ2lucHV0X2FyZWEnO1xuICAgIC8vdmFyIGNvZGVtaXJyb3IgPSBDb2RlTWlycm9yKGlucHV0X2FyZWEsIGNtX2NvbmZpZyk7IFxuICAgIHZhciBjb2RlbWlycm9yID0gQ29kZU1pcnJvcihpbnB1dF9hcmVhKTsgXG4gICAgd2luZG93LnNoYXJlZF9lbGVtZW50c1tpXSA9IHtcbiAgICAgICAgJ291dHB1dCc6IG91dHB1dCxcbiAgICAgICAgJ2lucHV0X2FyZWEnOiBpbnB1dF9hcmVhLFxuICAgICAgICAnY29kZW1pcnJvcic6IGNvZGVtaXJyb3IsXG4gICAgfTtcbn1cblxud2luZG93LnNoYXJlZF9lbGVtZW50c19hdmFpbGFibGUgPSB0cnVlO1xuXG4vL2ZvciAodmFyIGk9dG90YWxfY29kZV9jZWxsczsgaTx0b3RhbF9jb2RlX2NlbGxzK3RvdGFsX21hcmtkb3duX2NlbGxzOyBpKyspIHtcbi8vICAgIHZhciBpbnB1dF9hcmVhID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4vLyAgICBpbnB1dF9hcmVhLmNsYXNzTmFtZSA9ICdpbnB1dF9hcmVhJztcbi8vICAgIHZhciBjb2RlbWlycm9yID0gQ29kZU1pcnJvcihpbnB1dF9hcmVhLCBjbV9jb25maWcyKTsgXG4vLyAgICB3aW5kb3cuc2hhcmVkX2VsZW1lbnRzW2ldID0ge1xuLy8gICAgICAgICdpbnB1dF9hcmVhJzogaW5wdXRfYXJlYSxcbi8vICAgICAgICAnY29kZW1pcnJvcic6IGNvZGVtaXJyb3Jcbi8vICAgIH07XG4vL31cbiJdfQ==
