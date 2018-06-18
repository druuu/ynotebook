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
  if (d.lastWrapHeight == d.wrapper.clientHeight && d.lastWrapWidth == d.wrapper.clientWidth)
    { return }
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

CodeMirror$1.version = "5.38.0";

return CodeMirror$1;

})));

},{}],2:[function(require,module,exports){
CodeMirror = require('codemirror');

var total_cells = 200;
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
        "version":3},
        "matchBrackets":true,
        "autoCloseBrackets":true
    };


window.shared_elements = {};
for (var i=0; i<=total_cells; i++) {
    var output = document.createElement('div');
    var input_area = document.createElement('div');
    input_area.className = 'input_area';
    var codemirror = CodeMirror(input_area, cm_config); 
    window.shared_elements[i] = {'output': output, 'input_area': input_area, 'codemirror': codemirror};
}

},{"codemirror":1}]},{},[2])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvY29kZW1pcnJvci9saWIvY29kZW1pcnJvci5qcyIsInNyYy9wcmVkZWZpbmUuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2orU0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbigpe2Z1bmN0aW9uIHIoZSxuLHQpe2Z1bmN0aW9uIG8oaSxmKXtpZighbltpXSl7aWYoIWVbaV0pe3ZhciBjPVwiZnVuY3Rpb25cIj09dHlwZW9mIHJlcXVpcmUmJnJlcXVpcmU7aWYoIWYmJmMpcmV0dXJuIGMoaSwhMCk7aWYodSlyZXR1cm4gdShpLCEwKTt2YXIgYT1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK2krXCInXCIpO3Rocm93IGEuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixhfXZhciBwPW5baV09e2V4cG9ydHM6e319O2VbaV1bMF0uY2FsbChwLmV4cG9ydHMsZnVuY3Rpb24ocil7dmFyIG49ZVtpXVsxXVtyXTtyZXR1cm4gbyhufHxyKX0scCxwLmV4cG9ydHMscixlLG4sdCl9cmV0dXJuIG5baV0uZXhwb3J0c31mb3IodmFyIHU9XCJmdW5jdGlvblwiPT10eXBlb2YgcmVxdWlyZSYmcmVxdWlyZSxpPTA7aTx0Lmxlbmd0aDtpKyspbyh0W2ldKTtyZXR1cm4gb31yZXR1cm4gcn0pKCkiLCIvLyBDb2RlTWlycm9yLCBjb3B5cmlnaHQgKGMpIGJ5IE1hcmlqbiBIYXZlcmJla2UgYW5kIG90aGVyc1xuLy8gRGlzdHJpYnV0ZWQgdW5kZXIgYW4gTUlUIGxpY2Vuc2U6IGh0dHA6Ly9jb2RlbWlycm9yLm5ldC9MSUNFTlNFXG5cbi8vIFRoaXMgaXMgQ29kZU1pcnJvciAoaHR0cDovL2NvZGVtaXJyb3IubmV0KSwgYSBjb2RlIGVkaXRvclxuLy8gaW1wbGVtZW50ZWQgaW4gSmF2YVNjcmlwdCBvbiB0b3Agb2YgdGhlIGJyb3dzZXIncyBET00uXG4vL1xuLy8gWW91IGNhbiBmaW5kIHNvbWUgdGVjaG5pY2FsIGJhY2tncm91bmQgZm9yIHNvbWUgb2YgdGhlIGNvZGUgYmVsb3dcbi8vIGF0IGh0dHA6Ly9tYXJpam5oYXZlcmJla2UubmwvYmxvZy8jY20taW50ZXJuYWxzIC5cblxuKGZ1bmN0aW9uIChnbG9iYWwsIGZhY3RvcnkpIHtcblx0dHlwZW9mIGV4cG9ydHMgPT09ICdvYmplY3QnICYmIHR5cGVvZiBtb2R1bGUgIT09ICd1bmRlZmluZWQnID8gbW9kdWxlLmV4cG9ydHMgPSBmYWN0b3J5KCkgOlxuXHR0eXBlb2YgZGVmaW5lID09PSAnZnVuY3Rpb24nICYmIGRlZmluZS5hbWQgPyBkZWZpbmUoZmFjdG9yeSkgOlxuXHQoZ2xvYmFsLkNvZGVNaXJyb3IgPSBmYWN0b3J5KCkpO1xufSh0aGlzLCAoZnVuY3Rpb24gKCkgeyAndXNlIHN0cmljdCc7XG5cbi8vIEtsdWRnZXMgZm9yIGJ1Z3MgYW5kIGJlaGF2aW9yIGRpZmZlcmVuY2VzIHRoYXQgY2FuJ3QgYmUgZmVhdHVyZVxuLy8gZGV0ZWN0ZWQgYXJlIGVuYWJsZWQgYmFzZWQgb24gdXNlckFnZW50IGV0YyBzbmlmZmluZy5cbnZhciB1c2VyQWdlbnQgPSBuYXZpZ2F0b3IudXNlckFnZW50O1xudmFyIHBsYXRmb3JtID0gbmF2aWdhdG9yLnBsYXRmb3JtO1xuXG52YXIgZ2Vja28gPSAvZ2Vja29cXC9cXGQvaS50ZXN0KHVzZXJBZ2VudCk7XG52YXIgaWVfdXB0bzEwID0gL01TSUUgXFxkLy50ZXN0KHVzZXJBZ2VudCk7XG52YXIgaWVfMTF1cCA9IC9UcmlkZW50XFwvKD86WzctOV18XFxkezIsfSlcXC4uKnJ2OihcXGQrKS8uZXhlYyh1c2VyQWdlbnQpO1xudmFyIGVkZ2UgPSAvRWRnZVxcLyhcXGQrKS8uZXhlYyh1c2VyQWdlbnQpO1xudmFyIGllID0gaWVfdXB0bzEwIHx8IGllXzExdXAgfHwgZWRnZTtcbnZhciBpZV92ZXJzaW9uID0gaWUgJiYgKGllX3VwdG8xMCA/IGRvY3VtZW50LmRvY3VtZW50TW9kZSB8fCA2IDogKyhlZGdlIHx8IGllXzExdXApWzFdKTtcbnZhciB3ZWJraXQgPSAhZWRnZSAmJiAvV2ViS2l0XFwvLy50ZXN0KHVzZXJBZ2VudCk7XG52YXIgcXR3ZWJraXQgPSB3ZWJraXQgJiYgL1F0XFwvXFxkK1xcLlxcZCsvLnRlc3QodXNlckFnZW50KTtcbnZhciBjaHJvbWUgPSAhZWRnZSAmJiAvQ2hyb21lXFwvLy50ZXN0KHVzZXJBZ2VudCk7XG52YXIgcHJlc3RvID0gL09wZXJhXFwvLy50ZXN0KHVzZXJBZ2VudCk7XG52YXIgc2FmYXJpID0gL0FwcGxlIENvbXB1dGVyLy50ZXN0KG5hdmlnYXRvci52ZW5kb3IpO1xudmFyIG1hY19nZU1vdW50YWluTGlvbiA9IC9NYWMgT1MgWCAxXFxkXFxEKFs4LTldfFxcZFxcZClcXEQvLnRlc3QodXNlckFnZW50KTtcbnZhciBwaGFudG9tID0gL1BoYW50b21KUy8udGVzdCh1c2VyQWdlbnQpO1xuXG52YXIgaW9zID0gIWVkZ2UgJiYgL0FwcGxlV2ViS2l0Ly50ZXN0KHVzZXJBZ2VudCkgJiYgL01vYmlsZVxcL1xcdysvLnRlc3QodXNlckFnZW50KTtcbnZhciBhbmRyb2lkID0gL0FuZHJvaWQvLnRlc3QodXNlckFnZW50KTtcbi8vIFRoaXMgaXMgd29lZnVsbHkgaW5jb21wbGV0ZS4gU3VnZ2VzdGlvbnMgZm9yIGFsdGVybmF0aXZlIG1ldGhvZHMgd2VsY29tZS5cbnZhciBtb2JpbGUgPSBpb3MgfHwgYW5kcm9pZCB8fCAvd2ViT1N8QmxhY2tCZXJyeXxPcGVyYSBNaW5pfE9wZXJhIE1vYml8SUVNb2JpbGUvaS50ZXN0KHVzZXJBZ2VudCk7XG52YXIgbWFjID0gaW9zIHx8IC9NYWMvLnRlc3QocGxhdGZvcm0pO1xudmFyIGNocm9tZU9TID0gL1xcYkNyT1NcXGIvLnRlc3QodXNlckFnZW50KTtcbnZhciB3aW5kb3dzID0gL3dpbi9pLnRlc3QocGxhdGZvcm0pO1xuXG52YXIgcHJlc3RvX3ZlcnNpb24gPSBwcmVzdG8gJiYgdXNlckFnZW50Lm1hdGNoKC9WZXJzaW9uXFwvKFxcZCpcXC5cXGQqKS8pO1xuaWYgKHByZXN0b192ZXJzaW9uKSB7IHByZXN0b192ZXJzaW9uID0gTnVtYmVyKHByZXN0b192ZXJzaW9uWzFdKTsgfVxuaWYgKHByZXN0b192ZXJzaW9uICYmIHByZXN0b192ZXJzaW9uID49IDE1KSB7IHByZXN0byA9IGZhbHNlOyB3ZWJraXQgPSB0cnVlOyB9XG4vLyBTb21lIGJyb3dzZXJzIHVzZSB0aGUgd3JvbmcgZXZlbnQgcHJvcGVydGllcyB0byBzaWduYWwgY21kL2N0cmwgb24gT1MgWFxudmFyIGZsaXBDdHJsQ21kID0gbWFjICYmIChxdHdlYmtpdCB8fCBwcmVzdG8gJiYgKHByZXN0b192ZXJzaW9uID09IG51bGwgfHwgcHJlc3RvX3ZlcnNpb24gPCAxMi4xMSkpO1xudmFyIGNhcHR1cmVSaWdodENsaWNrID0gZ2Vja28gfHwgKGllICYmIGllX3ZlcnNpb24gPj0gOSk7XG5cbmZ1bmN0aW9uIGNsYXNzVGVzdChjbHMpIHsgcmV0dXJuIG5ldyBSZWdFeHAoXCIoXnxcXFxccylcIiArIGNscyArIFwiKD86JHxcXFxccylcXFxccypcIikgfVxuXG52YXIgcm1DbGFzcyA9IGZ1bmN0aW9uKG5vZGUsIGNscykge1xuICB2YXIgY3VycmVudCA9IG5vZGUuY2xhc3NOYW1lO1xuICB2YXIgbWF0Y2ggPSBjbGFzc1Rlc3QoY2xzKS5leGVjKGN1cnJlbnQpO1xuICBpZiAobWF0Y2gpIHtcbiAgICB2YXIgYWZ0ZXIgPSBjdXJyZW50LnNsaWNlKG1hdGNoLmluZGV4ICsgbWF0Y2hbMF0ubGVuZ3RoKTtcbiAgICBub2RlLmNsYXNzTmFtZSA9IGN1cnJlbnQuc2xpY2UoMCwgbWF0Y2guaW5kZXgpICsgKGFmdGVyID8gbWF0Y2hbMV0gKyBhZnRlciA6IFwiXCIpO1xuICB9XG59O1xuXG5mdW5jdGlvbiByZW1vdmVDaGlsZHJlbihlKSB7XG4gIGZvciAodmFyIGNvdW50ID0gZS5jaGlsZE5vZGVzLmxlbmd0aDsgY291bnQgPiAwOyAtLWNvdW50KVxuICAgIHsgZS5yZW1vdmVDaGlsZChlLmZpcnN0Q2hpbGQpOyB9XG4gIHJldHVybiBlXG59XG5cbmZ1bmN0aW9uIHJlbW92ZUNoaWxkcmVuQW5kQWRkKHBhcmVudCwgZSkge1xuICByZXR1cm4gcmVtb3ZlQ2hpbGRyZW4ocGFyZW50KS5hcHBlbmRDaGlsZChlKVxufVxuXG5mdW5jdGlvbiBlbHQodGFnLCBjb250ZW50LCBjbGFzc05hbWUsIHN0eWxlKSB7XG4gIHZhciBlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCh0YWcpO1xuICBpZiAoY2xhc3NOYW1lKSB7IGUuY2xhc3NOYW1lID0gY2xhc3NOYW1lOyB9XG4gIGlmIChzdHlsZSkgeyBlLnN0eWxlLmNzc1RleHQgPSBzdHlsZTsgfVxuICBpZiAodHlwZW9mIGNvbnRlbnQgPT0gXCJzdHJpbmdcIikgeyBlLmFwcGVuZENoaWxkKGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKGNvbnRlbnQpKTsgfVxuICBlbHNlIGlmIChjb250ZW50KSB7IGZvciAodmFyIGkgPSAwOyBpIDwgY29udGVudC5sZW5ndGg7ICsraSkgeyBlLmFwcGVuZENoaWxkKGNvbnRlbnRbaV0pOyB9IH1cbiAgcmV0dXJuIGVcbn1cbi8vIHdyYXBwZXIgZm9yIGVsdCwgd2hpY2ggcmVtb3ZlcyB0aGUgZWx0IGZyb20gdGhlIGFjY2Vzc2liaWxpdHkgdHJlZVxuZnVuY3Rpb24gZWx0UCh0YWcsIGNvbnRlbnQsIGNsYXNzTmFtZSwgc3R5bGUpIHtcbiAgdmFyIGUgPSBlbHQodGFnLCBjb250ZW50LCBjbGFzc05hbWUsIHN0eWxlKTtcbiAgZS5zZXRBdHRyaWJ1dGUoXCJyb2xlXCIsIFwicHJlc2VudGF0aW9uXCIpO1xuICByZXR1cm4gZVxufVxuXG52YXIgcmFuZ2U7XG5pZiAoZG9jdW1lbnQuY3JlYXRlUmFuZ2UpIHsgcmFuZ2UgPSBmdW5jdGlvbihub2RlLCBzdGFydCwgZW5kLCBlbmROb2RlKSB7XG4gIHZhciByID0gZG9jdW1lbnQuY3JlYXRlUmFuZ2UoKTtcbiAgci5zZXRFbmQoZW5kTm9kZSB8fCBub2RlLCBlbmQpO1xuICByLnNldFN0YXJ0KG5vZGUsIHN0YXJ0KTtcbiAgcmV0dXJuIHJcbn07IH1cbmVsc2UgeyByYW5nZSA9IGZ1bmN0aW9uKG5vZGUsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIHIgPSBkb2N1bWVudC5ib2R5LmNyZWF0ZVRleHRSYW5nZSgpO1xuICB0cnkgeyByLm1vdmVUb0VsZW1lbnRUZXh0KG5vZGUucGFyZW50Tm9kZSk7IH1cbiAgY2F0Y2goZSkgeyByZXR1cm4gciB9XG4gIHIuY29sbGFwc2UodHJ1ZSk7XG4gIHIubW92ZUVuZChcImNoYXJhY3RlclwiLCBlbmQpO1xuICByLm1vdmVTdGFydChcImNoYXJhY3RlclwiLCBzdGFydCk7XG4gIHJldHVybiByXG59OyB9XG5cbmZ1bmN0aW9uIGNvbnRhaW5zKHBhcmVudCwgY2hpbGQpIHtcbiAgaWYgKGNoaWxkLm5vZGVUeXBlID09IDMpIC8vIEFuZHJvaWQgYnJvd3NlciBhbHdheXMgcmV0dXJucyBmYWxzZSB3aGVuIGNoaWxkIGlzIGEgdGV4dG5vZGVcbiAgICB7IGNoaWxkID0gY2hpbGQucGFyZW50Tm9kZTsgfVxuICBpZiAocGFyZW50LmNvbnRhaW5zKVxuICAgIHsgcmV0dXJuIHBhcmVudC5jb250YWlucyhjaGlsZCkgfVxuICBkbyB7XG4gICAgaWYgKGNoaWxkLm5vZGVUeXBlID09IDExKSB7IGNoaWxkID0gY2hpbGQuaG9zdDsgfVxuICAgIGlmIChjaGlsZCA9PSBwYXJlbnQpIHsgcmV0dXJuIHRydWUgfVxuICB9IHdoaWxlIChjaGlsZCA9IGNoaWxkLnBhcmVudE5vZGUpXG59XG5cbmZ1bmN0aW9uIGFjdGl2ZUVsdCgpIHtcbiAgLy8gSUUgYW5kIEVkZ2UgbWF5IHRocm93IGFuIFwiVW5zcGVjaWZpZWQgRXJyb3JcIiB3aGVuIGFjY2Vzc2luZyBkb2N1bWVudC5hY3RpdmVFbGVtZW50LlxuICAvLyBJRSA8IDEwIHdpbGwgdGhyb3cgd2hlbiBhY2Nlc3NlZCB3aGlsZSB0aGUgcGFnZSBpcyBsb2FkaW5nIG9yIGluIGFuIGlmcmFtZS5cbiAgLy8gSUUgPiA5IGFuZCBFZGdlIHdpbGwgdGhyb3cgd2hlbiBhY2Nlc3NlZCBpbiBhbiBpZnJhbWUgaWYgZG9jdW1lbnQuYm9keSBpcyB1bmF2YWlsYWJsZS5cbiAgdmFyIGFjdGl2ZUVsZW1lbnQ7XG4gIHRyeSB7XG4gICAgYWN0aXZlRWxlbWVudCA9IGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQ7XG4gIH0gY2F0Y2goZSkge1xuICAgIGFjdGl2ZUVsZW1lbnQgPSBkb2N1bWVudC5ib2R5IHx8IG51bGw7XG4gIH1cbiAgd2hpbGUgKGFjdGl2ZUVsZW1lbnQgJiYgYWN0aXZlRWxlbWVudC5zaGFkb3dSb290ICYmIGFjdGl2ZUVsZW1lbnQuc2hhZG93Um9vdC5hY3RpdmVFbGVtZW50KVxuICAgIHsgYWN0aXZlRWxlbWVudCA9IGFjdGl2ZUVsZW1lbnQuc2hhZG93Um9vdC5hY3RpdmVFbGVtZW50OyB9XG4gIHJldHVybiBhY3RpdmVFbGVtZW50XG59XG5cbmZ1bmN0aW9uIGFkZENsYXNzKG5vZGUsIGNscykge1xuICB2YXIgY3VycmVudCA9IG5vZGUuY2xhc3NOYW1lO1xuICBpZiAoIWNsYXNzVGVzdChjbHMpLnRlc3QoY3VycmVudCkpIHsgbm9kZS5jbGFzc05hbWUgKz0gKGN1cnJlbnQgPyBcIiBcIiA6IFwiXCIpICsgY2xzOyB9XG59XG5mdW5jdGlvbiBqb2luQ2xhc3NlcyhhLCBiKSB7XG4gIHZhciBhcyA9IGEuc3BsaXQoXCIgXCIpO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGFzLmxlbmd0aDsgaSsrKVxuICAgIHsgaWYgKGFzW2ldICYmICFjbGFzc1Rlc3QoYXNbaV0pLnRlc3QoYikpIHsgYiArPSBcIiBcIiArIGFzW2ldOyB9IH1cbiAgcmV0dXJuIGJcbn1cblxudmFyIHNlbGVjdElucHV0ID0gZnVuY3Rpb24obm9kZSkgeyBub2RlLnNlbGVjdCgpOyB9O1xuaWYgKGlvcykgLy8gTW9iaWxlIFNhZmFyaSBhcHBhcmVudGx5IGhhcyBhIGJ1ZyB3aGVyZSBzZWxlY3QoKSBpcyBicm9rZW4uXG4gIHsgc2VsZWN0SW5wdXQgPSBmdW5jdGlvbihub2RlKSB7IG5vZGUuc2VsZWN0aW9uU3RhcnQgPSAwOyBub2RlLnNlbGVjdGlvbkVuZCA9IG5vZGUudmFsdWUubGVuZ3RoOyB9OyB9XG5lbHNlIGlmIChpZSkgLy8gU3VwcHJlc3MgbXlzdGVyaW91cyBJRTEwIGVycm9yc1xuICB7IHNlbGVjdElucHV0ID0gZnVuY3Rpb24obm9kZSkgeyB0cnkgeyBub2RlLnNlbGVjdCgpOyB9IGNhdGNoKF9lKSB7fSB9OyB9XG5cbmZ1bmN0aW9uIGJpbmQoZikge1xuICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XG4gIHJldHVybiBmdW5jdGlvbigpe3JldHVybiBmLmFwcGx5KG51bGwsIGFyZ3MpfVxufVxuXG5mdW5jdGlvbiBjb3B5T2JqKG9iaiwgdGFyZ2V0LCBvdmVyd3JpdGUpIHtcbiAgaWYgKCF0YXJnZXQpIHsgdGFyZ2V0ID0ge307IH1cbiAgZm9yICh2YXIgcHJvcCBpbiBvYmopXG4gICAgeyBpZiAob2JqLmhhc093blByb3BlcnR5KHByb3ApICYmIChvdmVyd3JpdGUgIT09IGZhbHNlIHx8ICF0YXJnZXQuaGFzT3duUHJvcGVydHkocHJvcCkpKVxuICAgICAgeyB0YXJnZXRbcHJvcF0gPSBvYmpbcHJvcF07IH0gfVxuICByZXR1cm4gdGFyZ2V0XG59XG5cbi8vIENvdW50cyB0aGUgY29sdW1uIG9mZnNldCBpbiBhIHN0cmluZywgdGFraW5nIHRhYnMgaW50byBhY2NvdW50LlxuLy8gVXNlZCBtb3N0bHkgdG8gZmluZCBpbmRlbnRhdGlvbi5cbmZ1bmN0aW9uIGNvdW50Q29sdW1uKHN0cmluZywgZW5kLCB0YWJTaXplLCBzdGFydEluZGV4LCBzdGFydFZhbHVlKSB7XG4gIGlmIChlbmQgPT0gbnVsbCkge1xuICAgIGVuZCA9IHN0cmluZy5zZWFyY2goL1teXFxzXFx1MDBhMF0vKTtcbiAgICBpZiAoZW5kID09IC0xKSB7IGVuZCA9IHN0cmluZy5sZW5ndGg7IH1cbiAgfVxuICBmb3IgKHZhciBpID0gc3RhcnRJbmRleCB8fCAwLCBuID0gc3RhcnRWYWx1ZSB8fCAwOzspIHtcbiAgICB2YXIgbmV4dFRhYiA9IHN0cmluZy5pbmRleE9mKFwiXFx0XCIsIGkpO1xuICAgIGlmIChuZXh0VGFiIDwgMCB8fCBuZXh0VGFiID49IGVuZClcbiAgICAgIHsgcmV0dXJuIG4gKyAoZW5kIC0gaSkgfVxuICAgIG4gKz0gbmV4dFRhYiAtIGk7XG4gICAgbiArPSB0YWJTaXplIC0gKG4gJSB0YWJTaXplKTtcbiAgICBpID0gbmV4dFRhYiArIDE7XG4gIH1cbn1cblxudmFyIERlbGF5ZWQgPSBmdW5jdGlvbigpIHt0aGlzLmlkID0gbnVsbDt9O1xuRGVsYXllZC5wcm90b3R5cGUuc2V0ID0gZnVuY3Rpb24gKG1zLCBmKSB7XG4gIGNsZWFyVGltZW91dCh0aGlzLmlkKTtcbiAgdGhpcy5pZCA9IHNldFRpbWVvdXQoZiwgbXMpO1xufTtcblxuZnVuY3Rpb24gaW5kZXhPZihhcnJheSwgZWx0KSB7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgYXJyYXkubGVuZ3RoOyArK2kpXG4gICAgeyBpZiAoYXJyYXlbaV0gPT0gZWx0KSB7IHJldHVybiBpIH0gfVxuICByZXR1cm4gLTFcbn1cblxuLy8gTnVtYmVyIG9mIHBpeGVscyBhZGRlZCB0byBzY3JvbGxlciBhbmQgc2l6ZXIgdG8gaGlkZSBzY3JvbGxiYXJcbnZhciBzY3JvbGxlckdhcCA9IDMwO1xuXG4vLyBSZXR1cm5lZCBvciB0aHJvd24gYnkgdmFyaW91cyBwcm90b2NvbHMgdG8gc2lnbmFsICdJJ20gbm90XG4vLyBoYW5kbGluZyB0aGlzJy5cbnZhciBQYXNzID0ge3RvU3RyaW5nOiBmdW5jdGlvbigpe3JldHVybiBcIkNvZGVNaXJyb3IuUGFzc1wifX07XG5cbi8vIFJldXNlZCBvcHRpb24gb2JqZWN0cyBmb3Igc2V0U2VsZWN0aW9uICYgZnJpZW5kc1xudmFyIHNlbF9kb250U2Nyb2xsID0ge3Njcm9sbDogZmFsc2V9O1xudmFyIHNlbF9tb3VzZSA9IHtvcmlnaW46IFwiKm1vdXNlXCJ9O1xudmFyIHNlbF9tb3ZlID0ge29yaWdpbjogXCIrbW92ZVwifTtcblxuLy8gVGhlIGludmVyc2Ugb2YgY291bnRDb2x1bW4gLS0gZmluZCB0aGUgb2Zmc2V0IHRoYXQgY29ycmVzcG9uZHMgdG9cbi8vIGEgcGFydGljdWxhciBjb2x1bW4uXG5mdW5jdGlvbiBmaW5kQ29sdW1uKHN0cmluZywgZ29hbCwgdGFiU2l6ZSkge1xuICBmb3IgKHZhciBwb3MgPSAwLCBjb2wgPSAwOzspIHtcbiAgICB2YXIgbmV4dFRhYiA9IHN0cmluZy5pbmRleE9mKFwiXFx0XCIsIHBvcyk7XG4gICAgaWYgKG5leHRUYWIgPT0gLTEpIHsgbmV4dFRhYiA9IHN0cmluZy5sZW5ndGg7IH1cbiAgICB2YXIgc2tpcHBlZCA9IG5leHRUYWIgLSBwb3M7XG4gICAgaWYgKG5leHRUYWIgPT0gc3RyaW5nLmxlbmd0aCB8fCBjb2wgKyBza2lwcGVkID49IGdvYWwpXG4gICAgICB7IHJldHVybiBwb3MgKyBNYXRoLm1pbihza2lwcGVkLCBnb2FsIC0gY29sKSB9XG4gICAgY29sICs9IG5leHRUYWIgLSBwb3M7XG4gICAgY29sICs9IHRhYlNpemUgLSAoY29sICUgdGFiU2l6ZSk7XG4gICAgcG9zID0gbmV4dFRhYiArIDE7XG4gICAgaWYgKGNvbCA+PSBnb2FsKSB7IHJldHVybiBwb3MgfVxuICB9XG59XG5cbnZhciBzcGFjZVN0cnMgPSBbXCJcIl07XG5mdW5jdGlvbiBzcGFjZVN0cihuKSB7XG4gIHdoaWxlIChzcGFjZVN0cnMubGVuZ3RoIDw9IG4pXG4gICAgeyBzcGFjZVN0cnMucHVzaChsc3Qoc3BhY2VTdHJzKSArIFwiIFwiKTsgfVxuICByZXR1cm4gc3BhY2VTdHJzW25dXG59XG5cbmZ1bmN0aW9uIGxzdChhcnIpIHsgcmV0dXJuIGFyclthcnIubGVuZ3RoLTFdIH1cblxuZnVuY3Rpb24gbWFwKGFycmF5LCBmKSB7XG4gIHZhciBvdXQgPSBbXTtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcnJheS5sZW5ndGg7IGkrKykgeyBvdXRbaV0gPSBmKGFycmF5W2ldLCBpKTsgfVxuICByZXR1cm4gb3V0XG59XG5cbmZ1bmN0aW9uIGluc2VydFNvcnRlZChhcnJheSwgdmFsdWUsIHNjb3JlKSB7XG4gIHZhciBwb3MgPSAwLCBwcmlvcml0eSA9IHNjb3JlKHZhbHVlKTtcbiAgd2hpbGUgKHBvcyA8IGFycmF5Lmxlbmd0aCAmJiBzY29yZShhcnJheVtwb3NdKSA8PSBwcmlvcml0eSkgeyBwb3MrKzsgfVxuICBhcnJheS5zcGxpY2UocG9zLCAwLCB2YWx1ZSk7XG59XG5cbmZ1bmN0aW9uIG5vdGhpbmcoKSB7fVxuXG5mdW5jdGlvbiBjcmVhdGVPYmooYmFzZSwgcHJvcHMpIHtcbiAgdmFyIGluc3Q7XG4gIGlmIChPYmplY3QuY3JlYXRlKSB7XG4gICAgaW5zdCA9IE9iamVjdC5jcmVhdGUoYmFzZSk7XG4gIH0gZWxzZSB7XG4gICAgbm90aGluZy5wcm90b3R5cGUgPSBiYXNlO1xuICAgIGluc3QgPSBuZXcgbm90aGluZygpO1xuICB9XG4gIGlmIChwcm9wcykgeyBjb3B5T2JqKHByb3BzLCBpbnN0KTsgfVxuICByZXR1cm4gaW5zdFxufVxuXG52YXIgbm9uQVNDSUlTaW5nbGVDYXNlV29yZENoYXIgPSAvW1xcdTAwZGZcXHUwNTg3XFx1MDU5MC1cXHUwNWY0XFx1MDYwMC1cXHUwNmZmXFx1MzA0MC1cXHUzMDlmXFx1MzBhMC1cXHUzMGZmXFx1MzQwMC1cXHU0ZGI1XFx1NGUwMC1cXHU5ZmNjXFx1YWMwMC1cXHVkN2FmXS87XG5mdW5jdGlvbiBpc1dvcmRDaGFyQmFzaWMoY2gpIHtcbiAgcmV0dXJuIC9cXHcvLnRlc3QoY2gpIHx8IGNoID4gXCJcXHg4MFwiICYmXG4gICAgKGNoLnRvVXBwZXJDYXNlKCkgIT0gY2gudG9Mb3dlckNhc2UoKSB8fCBub25BU0NJSVNpbmdsZUNhc2VXb3JkQ2hhci50ZXN0KGNoKSlcbn1cbmZ1bmN0aW9uIGlzV29yZENoYXIoY2gsIGhlbHBlcikge1xuICBpZiAoIWhlbHBlcikgeyByZXR1cm4gaXNXb3JkQ2hhckJhc2ljKGNoKSB9XG4gIGlmIChoZWxwZXIuc291cmNlLmluZGV4T2YoXCJcXFxcd1wiKSA+IC0xICYmIGlzV29yZENoYXJCYXNpYyhjaCkpIHsgcmV0dXJuIHRydWUgfVxuICByZXR1cm4gaGVscGVyLnRlc3QoY2gpXG59XG5cbmZ1bmN0aW9uIGlzRW1wdHkob2JqKSB7XG4gIGZvciAodmFyIG4gaW4gb2JqKSB7IGlmIChvYmouaGFzT3duUHJvcGVydHkobikgJiYgb2JqW25dKSB7IHJldHVybiBmYWxzZSB9IH1cbiAgcmV0dXJuIHRydWVcbn1cblxuLy8gRXh0ZW5kaW5nIHVuaWNvZGUgY2hhcmFjdGVycy4gQSBzZXJpZXMgb2YgYSBub24tZXh0ZW5kaW5nIGNoYXIgK1xuLy8gYW55IG51bWJlciBvZiBleHRlbmRpbmcgY2hhcnMgaXMgdHJlYXRlZCBhcyBhIHNpbmdsZSB1bml0IGFzIGZhclxuLy8gYXMgZWRpdGluZyBhbmQgbWVhc3VyaW5nIGlzIGNvbmNlcm5lZC4gVGhpcyBpcyBub3QgZnVsbHkgY29ycmVjdCxcbi8vIHNpbmNlIHNvbWUgc2NyaXB0cy9mb250cy9icm93c2VycyBhbHNvIHRyZWF0IG90aGVyIGNvbmZpZ3VyYXRpb25zXG4vLyBvZiBjb2RlIHBvaW50cyBhcyBhIGdyb3VwLlxudmFyIGV4dGVuZGluZ0NoYXJzID0gL1tcXHUwMzAwLVxcdTAzNmZcXHUwNDgzLVxcdTA0ODlcXHUwNTkxLVxcdTA1YmRcXHUwNWJmXFx1MDVjMVxcdTA1YzJcXHUwNWM0XFx1MDVjNVxcdTA1YzdcXHUwNjEwLVxcdTA2MWFcXHUwNjRiLVxcdTA2NWVcXHUwNjcwXFx1MDZkNi1cXHUwNmRjXFx1MDZkZS1cXHUwNmU0XFx1MDZlN1xcdTA2ZThcXHUwNmVhLVxcdTA2ZWRcXHUwNzExXFx1MDczMC1cXHUwNzRhXFx1MDdhNi1cXHUwN2IwXFx1MDdlYi1cXHUwN2YzXFx1MDgxNi1cXHUwODE5XFx1MDgxYi1cXHUwODIzXFx1MDgyNS1cXHUwODI3XFx1MDgyOS1cXHUwODJkXFx1MDkwMC1cXHUwOTAyXFx1MDkzY1xcdTA5NDEtXFx1MDk0OFxcdTA5NGRcXHUwOTUxLVxcdTA5NTVcXHUwOTYyXFx1MDk2M1xcdTA5ODFcXHUwOWJjXFx1MDliZVxcdTA5YzEtXFx1MDljNFxcdTA5Y2RcXHUwOWQ3XFx1MDllMlxcdTA5ZTNcXHUwYTAxXFx1MGEwMlxcdTBhM2NcXHUwYTQxXFx1MGE0MlxcdTBhNDdcXHUwYTQ4XFx1MGE0Yi1cXHUwYTRkXFx1MGE1MVxcdTBhNzBcXHUwYTcxXFx1MGE3NVxcdTBhODFcXHUwYTgyXFx1MGFiY1xcdTBhYzEtXFx1MGFjNVxcdTBhYzdcXHUwYWM4XFx1MGFjZFxcdTBhZTJcXHUwYWUzXFx1MGIwMVxcdTBiM2NcXHUwYjNlXFx1MGIzZlxcdTBiNDEtXFx1MGI0NFxcdTBiNGRcXHUwYjU2XFx1MGI1N1xcdTBiNjJcXHUwYjYzXFx1MGI4MlxcdTBiYmVcXHUwYmMwXFx1MGJjZFxcdTBiZDdcXHUwYzNlLVxcdTBjNDBcXHUwYzQ2LVxcdTBjNDhcXHUwYzRhLVxcdTBjNGRcXHUwYzU1XFx1MGM1NlxcdTBjNjJcXHUwYzYzXFx1MGNiY1xcdTBjYmZcXHUwY2MyXFx1MGNjNlxcdTBjY2NcXHUwY2NkXFx1MGNkNVxcdTBjZDZcXHUwY2UyXFx1MGNlM1xcdTBkM2VcXHUwZDQxLVxcdTBkNDRcXHUwZDRkXFx1MGQ1N1xcdTBkNjJcXHUwZDYzXFx1MGRjYVxcdTBkY2ZcXHUwZGQyLVxcdTBkZDRcXHUwZGQ2XFx1MGRkZlxcdTBlMzFcXHUwZTM0LVxcdTBlM2FcXHUwZTQ3LVxcdTBlNGVcXHUwZWIxXFx1MGViNC1cXHUwZWI5XFx1MGViYlxcdTBlYmNcXHUwZWM4LVxcdTBlY2RcXHUwZjE4XFx1MGYxOVxcdTBmMzVcXHUwZjM3XFx1MGYzOVxcdTBmNzEtXFx1MGY3ZVxcdTBmODAtXFx1MGY4NFxcdTBmODZcXHUwZjg3XFx1MGY5MC1cXHUwZjk3XFx1MGY5OS1cXHUwZmJjXFx1MGZjNlxcdTEwMmQtXFx1MTAzMFxcdTEwMzItXFx1MTAzN1xcdTEwMzlcXHUxMDNhXFx1MTAzZFxcdTEwM2VcXHUxMDU4XFx1MTA1OVxcdTEwNWUtXFx1MTA2MFxcdTEwNzEtXFx1MTA3NFxcdTEwODJcXHUxMDg1XFx1MTA4NlxcdTEwOGRcXHUxMDlkXFx1MTM1ZlxcdTE3MTItXFx1MTcxNFxcdTE3MzItXFx1MTczNFxcdTE3NTJcXHUxNzUzXFx1MTc3MlxcdTE3NzNcXHUxN2I3LVxcdTE3YmRcXHUxN2M2XFx1MTdjOS1cXHUxN2QzXFx1MTdkZFxcdTE4MGItXFx1MTgwZFxcdTE4YTlcXHUxOTIwLVxcdTE5MjJcXHUxOTI3XFx1MTkyOFxcdTE5MzJcXHUxOTM5LVxcdTE5M2JcXHUxYTE3XFx1MWExOFxcdTFhNTZcXHUxYTU4LVxcdTFhNWVcXHUxYTYwXFx1MWE2MlxcdTFhNjUtXFx1MWE2Y1xcdTFhNzMtXFx1MWE3Y1xcdTFhN2ZcXHUxYjAwLVxcdTFiMDNcXHUxYjM0XFx1MWIzNi1cXHUxYjNhXFx1MWIzY1xcdTFiNDJcXHUxYjZiLVxcdTFiNzNcXHUxYjgwXFx1MWI4MVxcdTFiYTItXFx1MWJhNVxcdTFiYThcXHUxYmE5XFx1MWMyYy1cXHUxYzMzXFx1MWMzNlxcdTFjMzdcXHUxY2QwLVxcdTFjZDJcXHUxY2Q0LVxcdTFjZTBcXHUxY2UyLVxcdTFjZThcXHUxY2VkXFx1MWRjMC1cXHUxZGU2XFx1MWRmZC1cXHUxZGZmXFx1MjAwY1xcdTIwMGRcXHUyMGQwLVxcdTIwZjBcXHUyY2VmLVxcdTJjZjFcXHUyZGUwLVxcdTJkZmZcXHUzMDJhLVxcdTMwMmZcXHUzMDk5XFx1MzA5YVxcdWE2NmYtXFx1YTY3MlxcdWE2N2NcXHVhNjdkXFx1YTZmMFxcdWE2ZjFcXHVhODAyXFx1YTgwNlxcdWE4MGJcXHVhODI1XFx1YTgyNlxcdWE4YzRcXHVhOGUwLVxcdWE4ZjFcXHVhOTI2LVxcdWE5MmRcXHVhOTQ3LVxcdWE5NTFcXHVhOTgwLVxcdWE5ODJcXHVhOWIzXFx1YTliNi1cXHVhOWI5XFx1YTliY1xcdWFhMjktXFx1YWEyZVxcdWFhMzFcXHVhYTMyXFx1YWEzNVxcdWFhMzZcXHVhYTQzXFx1YWE0Y1xcdWFhYjBcXHVhYWIyLVxcdWFhYjRcXHVhYWI3XFx1YWFiOFxcdWFhYmVcXHVhYWJmXFx1YWFjMVxcdWFiZTVcXHVhYmU4XFx1YWJlZFxcdWRjMDAtXFx1ZGZmZlxcdWZiMWVcXHVmZTAwLVxcdWZlMGZcXHVmZTIwLVxcdWZlMjZcXHVmZjllXFx1ZmY5Zl0vO1xuZnVuY3Rpb24gaXNFeHRlbmRpbmdDaGFyKGNoKSB7IHJldHVybiBjaC5jaGFyQ29kZUF0KDApID49IDc2OCAmJiBleHRlbmRpbmdDaGFycy50ZXN0KGNoKSB9XG5cbi8vIFJldHVybnMgYSBudW1iZXIgZnJvbSB0aGUgcmFuZ2UgW2AwYDsgYHN0ci5sZW5ndGhgXSB1bmxlc3MgYHBvc2AgaXMgb3V0c2lkZSB0aGF0IHJhbmdlLlxuZnVuY3Rpb24gc2tpcEV4dGVuZGluZ0NoYXJzKHN0ciwgcG9zLCBkaXIpIHtcbiAgd2hpbGUgKChkaXIgPCAwID8gcG9zID4gMCA6IHBvcyA8IHN0ci5sZW5ndGgpICYmIGlzRXh0ZW5kaW5nQ2hhcihzdHIuY2hhckF0KHBvcykpKSB7IHBvcyArPSBkaXI7IH1cbiAgcmV0dXJuIHBvc1xufVxuXG4vLyBSZXR1cm5zIHRoZSB2YWx1ZSBmcm9tIHRoZSByYW5nZSBbYGZyb21gOyBgdG9gXSB0aGF0IHNhdGlzZmllc1xuLy8gYHByZWRgIGFuZCBpcyBjbG9zZXN0IHRvIGBmcm9tYC4gQXNzdW1lcyB0aGF0IGF0IGxlYXN0IGB0b2Bcbi8vIHNhdGlzZmllcyBgcHJlZGAuIFN1cHBvcnRzIGBmcm9tYCBiZWluZyBncmVhdGVyIHRoYW4gYHRvYC5cbmZ1bmN0aW9uIGZpbmRGaXJzdChwcmVkLCBmcm9tLCB0bykge1xuICAvLyBBdCBhbnkgcG9pbnQgd2UgYXJlIGNlcnRhaW4gYHRvYCBzYXRpc2ZpZXMgYHByZWRgLCBkb24ndCBrbm93XG4gIC8vIHdoZXRoZXIgYGZyb21gIGRvZXMuXG4gIHZhciBkaXIgPSBmcm9tID4gdG8gPyAtMSA6IDE7XG4gIGZvciAoOzspIHtcbiAgICBpZiAoZnJvbSA9PSB0bykgeyByZXR1cm4gZnJvbSB9XG4gICAgdmFyIG1pZEYgPSAoZnJvbSArIHRvKSAvIDIsIG1pZCA9IGRpciA8IDAgPyBNYXRoLmNlaWwobWlkRikgOiBNYXRoLmZsb29yKG1pZEYpO1xuICAgIGlmIChtaWQgPT0gZnJvbSkgeyByZXR1cm4gcHJlZChtaWQpID8gZnJvbSA6IHRvIH1cbiAgICBpZiAocHJlZChtaWQpKSB7IHRvID0gbWlkOyB9XG4gICAgZWxzZSB7IGZyb20gPSBtaWQgKyBkaXI7IH1cbiAgfVxufVxuXG4vLyBUaGUgZGlzcGxheSBoYW5kbGVzIHRoZSBET00gaW50ZWdyYXRpb24sIGJvdGggZm9yIGlucHV0IHJlYWRpbmdcbi8vIGFuZCBjb250ZW50IGRyYXdpbmcuIEl0IGhvbGRzIHJlZmVyZW5jZXMgdG8gRE9NIG5vZGVzIGFuZFxuLy8gZGlzcGxheS1yZWxhdGVkIHN0YXRlLlxuXG5mdW5jdGlvbiBEaXNwbGF5KHBsYWNlLCBkb2MsIGlucHV0KSB7XG4gIHZhciBkID0gdGhpcztcbiAgdGhpcy5pbnB1dCA9IGlucHV0O1xuXG4gIC8vIENvdmVycyBib3R0b20tcmlnaHQgc3F1YXJlIHdoZW4gYm90aCBzY3JvbGxiYXJzIGFyZSBwcmVzZW50LlxuICBkLnNjcm9sbGJhckZpbGxlciA9IGVsdChcImRpdlwiLCBudWxsLCBcIkNvZGVNaXJyb3Itc2Nyb2xsYmFyLWZpbGxlclwiKTtcbiAgZC5zY3JvbGxiYXJGaWxsZXIuc2V0QXR0cmlidXRlKFwiY20tbm90LWNvbnRlbnRcIiwgXCJ0cnVlXCIpO1xuICAvLyBDb3ZlcnMgYm90dG9tIG9mIGd1dHRlciB3aGVuIGNvdmVyR3V0dGVyTmV4dFRvU2Nyb2xsYmFyIGlzIG9uXG4gIC8vIGFuZCBoIHNjcm9sbGJhciBpcyBwcmVzZW50LlxuICBkLmd1dHRlckZpbGxlciA9IGVsdChcImRpdlwiLCBudWxsLCBcIkNvZGVNaXJyb3ItZ3V0dGVyLWZpbGxlclwiKTtcbiAgZC5ndXR0ZXJGaWxsZXIuc2V0QXR0cmlidXRlKFwiY20tbm90LWNvbnRlbnRcIiwgXCJ0cnVlXCIpO1xuICAvLyBXaWxsIGNvbnRhaW4gdGhlIGFjdHVhbCBjb2RlLCBwb3NpdGlvbmVkIHRvIGNvdmVyIHRoZSB2aWV3cG9ydC5cbiAgZC5saW5lRGl2ID0gZWx0UChcImRpdlwiLCBudWxsLCBcIkNvZGVNaXJyb3ItY29kZVwiKTtcbiAgLy8gRWxlbWVudHMgYXJlIGFkZGVkIHRvIHRoZXNlIHRvIHJlcHJlc2VudCBzZWxlY3Rpb24gYW5kIGN1cnNvcnMuXG4gIGQuc2VsZWN0aW9uRGl2ID0gZWx0KFwiZGl2XCIsIG51bGwsIG51bGwsIFwicG9zaXRpb246IHJlbGF0aXZlOyB6LWluZGV4OiAxXCIpO1xuICBkLmN1cnNvckRpdiA9IGVsdChcImRpdlwiLCBudWxsLCBcIkNvZGVNaXJyb3ItY3Vyc29yc1wiKTtcbiAgLy8gQSB2aXNpYmlsaXR5OiBoaWRkZW4gZWxlbWVudCB1c2VkIHRvIGZpbmQgdGhlIHNpemUgb2YgdGhpbmdzLlxuICBkLm1lYXN1cmUgPSBlbHQoXCJkaXZcIiwgbnVsbCwgXCJDb2RlTWlycm9yLW1lYXN1cmVcIik7XG4gIC8vIFdoZW4gbGluZXMgb3V0c2lkZSBvZiB0aGUgdmlld3BvcnQgYXJlIG1lYXN1cmVkLCB0aGV5IGFyZSBkcmF3biBpbiB0aGlzLlxuICBkLmxpbmVNZWFzdXJlID0gZWx0KFwiZGl2XCIsIG51bGwsIFwiQ29kZU1pcnJvci1tZWFzdXJlXCIpO1xuICAvLyBXcmFwcyBldmVyeXRoaW5nIHRoYXQgbmVlZHMgdG8gZXhpc3QgaW5zaWRlIHRoZSB2ZXJ0aWNhbGx5LXBhZGRlZCBjb29yZGluYXRlIHN5c3RlbVxuICBkLmxpbmVTcGFjZSA9IGVsdFAoXCJkaXZcIiwgW2QubWVhc3VyZSwgZC5saW5lTWVhc3VyZSwgZC5zZWxlY3Rpb25EaXYsIGQuY3Vyc29yRGl2LCBkLmxpbmVEaXZdLFxuICAgICAgICAgICAgICAgICAgICBudWxsLCBcInBvc2l0aW9uOiByZWxhdGl2ZTsgb3V0bGluZTogbm9uZVwiKTtcbiAgdmFyIGxpbmVzID0gZWx0UChcImRpdlwiLCBbZC5saW5lU3BhY2VdLCBcIkNvZGVNaXJyb3ItbGluZXNcIik7XG4gIC8vIE1vdmVkIGFyb3VuZCBpdHMgcGFyZW50IHRvIGNvdmVyIHZpc2libGUgdmlldy5cbiAgZC5tb3ZlciA9IGVsdChcImRpdlwiLCBbbGluZXNdLCBudWxsLCBcInBvc2l0aW9uOiByZWxhdGl2ZVwiKTtcbiAgLy8gU2V0IHRvIHRoZSBoZWlnaHQgb2YgdGhlIGRvY3VtZW50LCBhbGxvd2luZyBzY3JvbGxpbmcuXG4gIGQuc2l6ZXIgPSBlbHQoXCJkaXZcIiwgW2QubW92ZXJdLCBcIkNvZGVNaXJyb3Itc2l6ZXJcIik7XG4gIGQuc2l6ZXJXaWR0aCA9IG51bGw7XG4gIC8vIEJlaGF2aW9yIG9mIGVsdHMgd2l0aCBvdmVyZmxvdzogYXV0byBhbmQgcGFkZGluZyBpc1xuICAvLyBpbmNvbnNpc3RlbnQgYWNyb3NzIGJyb3dzZXJzLiBUaGlzIGlzIHVzZWQgdG8gZW5zdXJlIHRoZVxuICAvLyBzY3JvbGxhYmxlIGFyZWEgaXMgYmlnIGVub3VnaC5cbiAgZC5oZWlnaHRGb3JjZXIgPSBlbHQoXCJkaXZcIiwgbnVsbCwgbnVsbCwgXCJwb3NpdGlvbjogYWJzb2x1dGU7IGhlaWdodDogXCIgKyBzY3JvbGxlckdhcCArIFwicHg7IHdpZHRoOiAxcHg7XCIpO1xuICAvLyBXaWxsIGNvbnRhaW4gdGhlIGd1dHRlcnMsIGlmIGFueS5cbiAgZC5ndXR0ZXJzID0gZWx0KFwiZGl2XCIsIG51bGwsIFwiQ29kZU1pcnJvci1ndXR0ZXJzXCIpO1xuICBkLmxpbmVHdXR0ZXIgPSBudWxsO1xuICAvLyBBY3R1YWwgc2Nyb2xsYWJsZSBlbGVtZW50LlxuICBkLnNjcm9sbGVyID0gZWx0KFwiZGl2XCIsIFtkLnNpemVyLCBkLmhlaWdodEZvcmNlciwgZC5ndXR0ZXJzXSwgXCJDb2RlTWlycm9yLXNjcm9sbFwiKTtcbiAgZC5zY3JvbGxlci5zZXRBdHRyaWJ1dGUoXCJ0YWJJbmRleFwiLCBcIi0xXCIpO1xuICAvLyBUaGUgZWxlbWVudCBpbiB3aGljaCB0aGUgZWRpdG9yIGxpdmVzLlxuICBkLndyYXBwZXIgPSBlbHQoXCJkaXZcIiwgW2Quc2Nyb2xsYmFyRmlsbGVyLCBkLmd1dHRlckZpbGxlciwgZC5zY3JvbGxlcl0sIFwiQ29kZU1pcnJvclwiKTtcblxuICAvLyBXb3JrIGFyb3VuZCBJRTcgei1pbmRleCBidWcgKG5vdCBwZXJmZWN0LCBoZW5jZSBJRTcgbm90IHJlYWxseSBiZWluZyBzdXBwb3J0ZWQpXG4gIGlmIChpZSAmJiBpZV92ZXJzaW9uIDwgOCkgeyBkLmd1dHRlcnMuc3R5bGUuekluZGV4ID0gLTE7IGQuc2Nyb2xsZXIuc3R5bGUucGFkZGluZ1JpZ2h0ID0gMDsgfVxuICBpZiAoIXdlYmtpdCAmJiAhKGdlY2tvICYmIG1vYmlsZSkpIHsgZC5zY3JvbGxlci5kcmFnZ2FibGUgPSB0cnVlOyB9XG5cbiAgaWYgKHBsYWNlKSB7XG4gICAgaWYgKHBsYWNlLmFwcGVuZENoaWxkKSB7IHBsYWNlLmFwcGVuZENoaWxkKGQud3JhcHBlcik7IH1cbiAgICBlbHNlIHsgcGxhY2UoZC53cmFwcGVyKTsgfVxuICB9XG5cbiAgLy8gQ3VycmVudCByZW5kZXJlZCByYW5nZSAobWF5IGJlIGJpZ2dlciB0aGFuIHRoZSB2aWV3IHdpbmRvdykuXG4gIGQudmlld0Zyb20gPSBkLnZpZXdUbyA9IGRvYy5maXJzdDtcbiAgZC5yZXBvcnRlZFZpZXdGcm9tID0gZC5yZXBvcnRlZFZpZXdUbyA9IGRvYy5maXJzdDtcbiAgLy8gSW5mb3JtYXRpb24gYWJvdXQgdGhlIHJlbmRlcmVkIGxpbmVzLlxuICBkLnZpZXcgPSBbXTtcbiAgZC5yZW5kZXJlZFZpZXcgPSBudWxsO1xuICAvLyBIb2xkcyBpbmZvIGFib3V0IGEgc2luZ2xlIHJlbmRlcmVkIGxpbmUgd2hlbiBpdCB3YXMgcmVuZGVyZWRcbiAgLy8gZm9yIG1lYXN1cmVtZW50LCB3aGlsZSBub3QgaW4gdmlldy5cbiAgZC5leHRlcm5hbE1lYXN1cmVkID0gbnVsbDtcbiAgLy8gRW1wdHkgc3BhY2UgKGluIHBpeGVscykgYWJvdmUgdGhlIHZpZXdcbiAgZC52aWV3T2Zmc2V0ID0gMDtcbiAgZC5sYXN0V3JhcEhlaWdodCA9IGQubGFzdFdyYXBXaWR0aCA9IDA7XG4gIGQudXBkYXRlTGluZU51bWJlcnMgPSBudWxsO1xuXG4gIGQubmF0aXZlQmFyV2lkdGggPSBkLmJhckhlaWdodCA9IGQuYmFyV2lkdGggPSAwO1xuICBkLnNjcm9sbGJhcnNDbGlwcGVkID0gZmFsc2U7XG5cbiAgLy8gVXNlZCB0byBvbmx5IHJlc2l6ZSB0aGUgbGluZSBudW1iZXIgZ3V0dGVyIHdoZW4gbmVjZXNzYXJ5ICh3aGVuXG4gIC8vIHRoZSBhbW91bnQgb2YgbGluZXMgY3Jvc3NlcyBhIGJvdW5kYXJ5IHRoYXQgbWFrZXMgaXRzIHdpZHRoIGNoYW5nZSlcbiAgZC5saW5lTnVtV2lkdGggPSBkLmxpbmVOdW1Jbm5lcldpZHRoID0gZC5saW5lTnVtQ2hhcnMgPSBudWxsO1xuICAvLyBTZXQgdG8gdHJ1ZSB3aGVuIGEgbm9uLWhvcml6b250YWwtc2Nyb2xsaW5nIGxpbmUgd2lkZ2V0IGlzXG4gIC8vIGFkZGVkLiBBcyBhbiBvcHRpbWl6YXRpb24sIGxpbmUgd2lkZ2V0IGFsaWduaW5nIGlzIHNraXBwZWQgd2hlblxuICAvLyB0aGlzIGlzIGZhbHNlLlxuICBkLmFsaWduV2lkZ2V0cyA9IGZhbHNlO1xuXG4gIGQuY2FjaGVkQ2hhcldpZHRoID0gZC5jYWNoZWRUZXh0SGVpZ2h0ID0gZC5jYWNoZWRQYWRkaW5nSCA9IG51bGw7XG5cbiAgLy8gVHJhY2tzIHRoZSBtYXhpbXVtIGxpbmUgbGVuZ3RoIHNvIHRoYXQgdGhlIGhvcml6b250YWwgc2Nyb2xsYmFyXG4gIC8vIGNhbiBiZSBrZXB0IHN0YXRpYyB3aGVuIHNjcm9sbGluZy5cbiAgZC5tYXhMaW5lID0gbnVsbDtcbiAgZC5tYXhMaW5lTGVuZ3RoID0gMDtcbiAgZC5tYXhMaW5lQ2hhbmdlZCA9IGZhbHNlO1xuXG4gIC8vIFVzZWQgZm9yIG1lYXN1cmluZyB3aGVlbCBzY3JvbGxpbmcgZ3JhbnVsYXJpdHlcbiAgZC53aGVlbERYID0gZC53aGVlbERZID0gZC53aGVlbFN0YXJ0WCA9IGQud2hlZWxTdGFydFkgPSBudWxsO1xuXG4gIC8vIFRydWUgd2hlbiBzaGlmdCBpcyBoZWxkIGRvd24uXG4gIGQuc2hpZnQgPSBmYWxzZTtcblxuICAvLyBVc2VkIHRvIHRyYWNrIHdoZXRoZXIgYW55dGhpbmcgaGFwcGVuZWQgc2luY2UgdGhlIGNvbnRleHQgbWVudVxuICAvLyB3YXMgb3BlbmVkLlxuICBkLnNlbEZvckNvbnRleHRNZW51ID0gbnVsbDtcblxuICBkLmFjdGl2ZVRvdWNoID0gbnVsbDtcblxuICBpbnB1dC5pbml0KGQpO1xufVxuXG4vLyBGaW5kIHRoZSBsaW5lIG9iamVjdCBjb3JyZXNwb25kaW5nIHRvIHRoZSBnaXZlbiBsaW5lIG51bWJlci5cbmZ1bmN0aW9uIGdldExpbmUoZG9jLCBuKSB7XG4gIG4gLT0gZG9jLmZpcnN0O1xuICBpZiAobiA8IDAgfHwgbiA+PSBkb2Muc2l6ZSkgeyB0aHJvdyBuZXcgRXJyb3IoXCJUaGVyZSBpcyBubyBsaW5lIFwiICsgKG4gKyBkb2MuZmlyc3QpICsgXCIgaW4gdGhlIGRvY3VtZW50LlwiKSB9XG4gIHZhciBjaHVuayA9IGRvYztcbiAgd2hpbGUgKCFjaHVuay5saW5lcykge1xuICAgIGZvciAodmFyIGkgPSAwOzsgKytpKSB7XG4gICAgICB2YXIgY2hpbGQgPSBjaHVuay5jaGlsZHJlbltpXSwgc3ogPSBjaGlsZC5jaHVua1NpemUoKTtcbiAgICAgIGlmIChuIDwgc3opIHsgY2h1bmsgPSBjaGlsZDsgYnJlYWsgfVxuICAgICAgbiAtPSBzejtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGNodW5rLmxpbmVzW25dXG59XG5cbi8vIEdldCB0aGUgcGFydCBvZiBhIGRvY3VtZW50IGJldHdlZW4gdHdvIHBvc2l0aW9ucywgYXMgYW4gYXJyYXkgb2Zcbi8vIHN0cmluZ3MuXG5mdW5jdGlvbiBnZXRCZXR3ZWVuKGRvYywgc3RhcnQsIGVuZCkge1xuICB2YXIgb3V0ID0gW10sIG4gPSBzdGFydC5saW5lO1xuICBkb2MuaXRlcihzdGFydC5saW5lLCBlbmQubGluZSArIDEsIGZ1bmN0aW9uIChsaW5lKSB7XG4gICAgdmFyIHRleHQgPSBsaW5lLnRleHQ7XG4gICAgaWYgKG4gPT0gZW5kLmxpbmUpIHsgdGV4dCA9IHRleHQuc2xpY2UoMCwgZW5kLmNoKTsgfVxuICAgIGlmIChuID09IHN0YXJ0LmxpbmUpIHsgdGV4dCA9IHRleHQuc2xpY2Uoc3RhcnQuY2gpOyB9XG4gICAgb3V0LnB1c2godGV4dCk7XG4gICAgKytuO1xuICB9KTtcbiAgcmV0dXJuIG91dFxufVxuLy8gR2V0IHRoZSBsaW5lcyBiZXR3ZWVuIGZyb20gYW5kIHRvLCBhcyBhcnJheSBvZiBzdHJpbmdzLlxuZnVuY3Rpb24gZ2V0TGluZXMoZG9jLCBmcm9tLCB0bykge1xuICB2YXIgb3V0ID0gW107XG4gIGRvYy5pdGVyKGZyb20sIHRvLCBmdW5jdGlvbiAobGluZSkgeyBvdXQucHVzaChsaW5lLnRleHQpOyB9KTsgLy8gaXRlciBhYm9ydHMgd2hlbiBjYWxsYmFjayByZXR1cm5zIHRydXRoeSB2YWx1ZVxuICByZXR1cm4gb3V0XG59XG5cbi8vIFVwZGF0ZSB0aGUgaGVpZ2h0IG9mIGEgbGluZSwgcHJvcGFnYXRpbmcgdGhlIGhlaWdodCBjaGFuZ2Vcbi8vIHVwd2FyZHMgdG8gcGFyZW50IG5vZGVzLlxuZnVuY3Rpb24gdXBkYXRlTGluZUhlaWdodChsaW5lLCBoZWlnaHQpIHtcbiAgdmFyIGRpZmYgPSBoZWlnaHQgLSBsaW5lLmhlaWdodDtcbiAgaWYgKGRpZmYpIHsgZm9yICh2YXIgbiA9IGxpbmU7IG47IG4gPSBuLnBhcmVudCkgeyBuLmhlaWdodCArPSBkaWZmOyB9IH1cbn1cblxuLy8gR2l2ZW4gYSBsaW5lIG9iamVjdCwgZmluZCBpdHMgbGluZSBudW1iZXIgYnkgd2Fsa2luZyB1cCB0aHJvdWdoXG4vLyBpdHMgcGFyZW50IGxpbmtzLlxuZnVuY3Rpb24gbGluZU5vKGxpbmUpIHtcbiAgaWYgKGxpbmUucGFyZW50ID09IG51bGwpIHsgcmV0dXJuIG51bGwgfVxuICB2YXIgY3VyID0gbGluZS5wYXJlbnQsIG5vID0gaW5kZXhPZihjdXIubGluZXMsIGxpbmUpO1xuICBmb3IgKHZhciBjaHVuayA9IGN1ci5wYXJlbnQ7IGNodW5rOyBjdXIgPSBjaHVuaywgY2h1bmsgPSBjaHVuay5wYXJlbnQpIHtcbiAgICBmb3IgKHZhciBpID0gMDs7ICsraSkge1xuICAgICAgaWYgKGNodW5rLmNoaWxkcmVuW2ldID09IGN1cikgeyBicmVhayB9XG4gICAgICBubyArPSBjaHVuay5jaGlsZHJlbltpXS5jaHVua1NpemUoKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIG5vICsgY3VyLmZpcnN0XG59XG5cbi8vIEZpbmQgdGhlIGxpbmUgYXQgdGhlIGdpdmVuIHZlcnRpY2FsIHBvc2l0aW9uLCB1c2luZyB0aGUgaGVpZ2h0XG4vLyBpbmZvcm1hdGlvbiBpbiB0aGUgZG9jdW1lbnQgdHJlZS5cbmZ1bmN0aW9uIGxpbmVBdEhlaWdodChjaHVuaywgaCkge1xuICB2YXIgbiA9IGNodW5rLmZpcnN0O1xuICBvdXRlcjogZG8ge1xuICAgIGZvciAodmFyIGkkMSA9IDA7IGkkMSA8IGNodW5rLmNoaWxkcmVuLmxlbmd0aDsgKytpJDEpIHtcbiAgICAgIHZhciBjaGlsZCA9IGNodW5rLmNoaWxkcmVuW2kkMV0sIGNoID0gY2hpbGQuaGVpZ2h0O1xuICAgICAgaWYgKGggPCBjaCkgeyBjaHVuayA9IGNoaWxkOyBjb250aW51ZSBvdXRlciB9XG4gICAgICBoIC09IGNoO1xuICAgICAgbiArPSBjaGlsZC5jaHVua1NpemUoKTtcbiAgICB9XG4gICAgcmV0dXJuIG5cbiAgfSB3aGlsZSAoIWNodW5rLmxpbmVzKVxuICB2YXIgaSA9IDA7XG4gIGZvciAoOyBpIDwgY2h1bmsubGluZXMubGVuZ3RoOyArK2kpIHtcbiAgICB2YXIgbGluZSA9IGNodW5rLmxpbmVzW2ldLCBsaCA9IGxpbmUuaGVpZ2h0O1xuICAgIGlmIChoIDwgbGgpIHsgYnJlYWsgfVxuICAgIGggLT0gbGg7XG4gIH1cbiAgcmV0dXJuIG4gKyBpXG59XG5cbmZ1bmN0aW9uIGlzTGluZShkb2MsIGwpIHtyZXR1cm4gbCA+PSBkb2MuZmlyc3QgJiYgbCA8IGRvYy5maXJzdCArIGRvYy5zaXplfVxuXG5mdW5jdGlvbiBsaW5lTnVtYmVyRm9yKG9wdGlvbnMsIGkpIHtcbiAgcmV0dXJuIFN0cmluZyhvcHRpb25zLmxpbmVOdW1iZXJGb3JtYXR0ZXIoaSArIG9wdGlvbnMuZmlyc3RMaW5lTnVtYmVyKSlcbn1cblxuLy8gQSBQb3MgaW5zdGFuY2UgcmVwcmVzZW50cyBhIHBvc2l0aW9uIHdpdGhpbiB0aGUgdGV4dC5cbmZ1bmN0aW9uIFBvcyhsaW5lLCBjaCwgc3RpY2t5KSB7XG4gIGlmICggc3RpY2t5ID09PSB2b2lkIDAgKSBzdGlja3kgPSBudWxsO1xuXG4gIGlmICghKHRoaXMgaW5zdGFuY2VvZiBQb3MpKSB7IHJldHVybiBuZXcgUG9zKGxpbmUsIGNoLCBzdGlja3kpIH1cbiAgdGhpcy5saW5lID0gbGluZTtcbiAgdGhpcy5jaCA9IGNoO1xuICB0aGlzLnN0aWNreSA9IHN0aWNreTtcbn1cblxuLy8gQ29tcGFyZSB0d28gcG9zaXRpb25zLCByZXR1cm4gMCBpZiB0aGV5IGFyZSB0aGUgc2FtZSwgYSBuZWdhdGl2ZVxuLy8gbnVtYmVyIHdoZW4gYSBpcyBsZXNzLCBhbmQgYSBwb3NpdGl2ZSBudW1iZXIgb3RoZXJ3aXNlLlxuZnVuY3Rpb24gY21wKGEsIGIpIHsgcmV0dXJuIGEubGluZSAtIGIubGluZSB8fCBhLmNoIC0gYi5jaCB9XG5cbmZ1bmN0aW9uIGVxdWFsQ3Vyc29yUG9zKGEsIGIpIHsgcmV0dXJuIGEuc3RpY2t5ID09IGIuc3RpY2t5ICYmIGNtcChhLCBiKSA9PSAwIH1cblxuZnVuY3Rpb24gY29weVBvcyh4KSB7cmV0dXJuIFBvcyh4LmxpbmUsIHguY2gpfVxuZnVuY3Rpb24gbWF4UG9zKGEsIGIpIHsgcmV0dXJuIGNtcChhLCBiKSA8IDAgPyBiIDogYSB9XG5mdW5jdGlvbiBtaW5Qb3MoYSwgYikgeyByZXR1cm4gY21wKGEsIGIpIDwgMCA/IGEgOiBiIH1cblxuLy8gTW9zdCBvZiB0aGUgZXh0ZXJuYWwgQVBJIGNsaXBzIGdpdmVuIHBvc2l0aW9ucyB0byBtYWtlIHN1cmUgdGhleVxuLy8gYWN0dWFsbHkgZXhpc3Qgd2l0aGluIHRoZSBkb2N1bWVudC5cbmZ1bmN0aW9uIGNsaXBMaW5lKGRvYywgbikge3JldHVybiBNYXRoLm1heChkb2MuZmlyc3QsIE1hdGgubWluKG4sIGRvYy5maXJzdCArIGRvYy5zaXplIC0gMSkpfVxuZnVuY3Rpb24gY2xpcFBvcyhkb2MsIHBvcykge1xuICBpZiAocG9zLmxpbmUgPCBkb2MuZmlyc3QpIHsgcmV0dXJuIFBvcyhkb2MuZmlyc3QsIDApIH1cbiAgdmFyIGxhc3QgPSBkb2MuZmlyc3QgKyBkb2Muc2l6ZSAtIDE7XG4gIGlmIChwb3MubGluZSA+IGxhc3QpIHsgcmV0dXJuIFBvcyhsYXN0LCBnZXRMaW5lKGRvYywgbGFzdCkudGV4dC5sZW5ndGgpIH1cbiAgcmV0dXJuIGNsaXBUb0xlbihwb3MsIGdldExpbmUoZG9jLCBwb3MubGluZSkudGV4dC5sZW5ndGgpXG59XG5mdW5jdGlvbiBjbGlwVG9MZW4ocG9zLCBsaW5lbGVuKSB7XG4gIHZhciBjaCA9IHBvcy5jaDtcbiAgaWYgKGNoID09IG51bGwgfHwgY2ggPiBsaW5lbGVuKSB7IHJldHVybiBQb3MocG9zLmxpbmUsIGxpbmVsZW4pIH1cbiAgZWxzZSBpZiAoY2ggPCAwKSB7IHJldHVybiBQb3MocG9zLmxpbmUsIDApIH1cbiAgZWxzZSB7IHJldHVybiBwb3MgfVxufVxuZnVuY3Rpb24gY2xpcFBvc0FycmF5KGRvYywgYXJyYXkpIHtcbiAgdmFyIG91dCA9IFtdO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGFycmF5Lmxlbmd0aDsgaSsrKSB7IG91dFtpXSA9IGNsaXBQb3MoZG9jLCBhcnJheVtpXSk7IH1cbiAgcmV0dXJuIG91dFxufVxuXG4vLyBPcHRpbWl6ZSBzb21lIGNvZGUgd2hlbiB0aGVzZSBmZWF0dXJlcyBhcmUgbm90IHVzZWQuXG52YXIgc2F3UmVhZE9ubHlTcGFucyA9IGZhbHNlO1xudmFyIHNhd0NvbGxhcHNlZFNwYW5zID0gZmFsc2U7XG5cbmZ1bmN0aW9uIHNlZVJlYWRPbmx5U3BhbnMoKSB7XG4gIHNhd1JlYWRPbmx5U3BhbnMgPSB0cnVlO1xufVxuXG5mdW5jdGlvbiBzZWVDb2xsYXBzZWRTcGFucygpIHtcbiAgc2F3Q29sbGFwc2VkU3BhbnMgPSB0cnVlO1xufVxuXG4vLyBURVhUTUFSS0VSIFNQQU5TXG5cbmZ1bmN0aW9uIE1hcmtlZFNwYW4obWFya2VyLCBmcm9tLCB0bykge1xuICB0aGlzLm1hcmtlciA9IG1hcmtlcjtcbiAgdGhpcy5mcm9tID0gZnJvbTsgdGhpcy50byA9IHRvO1xufVxuXG4vLyBTZWFyY2ggYW4gYXJyYXkgb2Ygc3BhbnMgZm9yIGEgc3BhbiBtYXRjaGluZyB0aGUgZ2l2ZW4gbWFya2VyLlxuZnVuY3Rpb24gZ2V0TWFya2VkU3BhbkZvcihzcGFucywgbWFya2VyKSB7XG4gIGlmIChzcGFucykgeyBmb3IgKHZhciBpID0gMDsgaSA8IHNwYW5zLmxlbmd0aDsgKytpKSB7XG4gICAgdmFyIHNwYW4gPSBzcGFuc1tpXTtcbiAgICBpZiAoc3Bhbi5tYXJrZXIgPT0gbWFya2VyKSB7IHJldHVybiBzcGFuIH1cbiAgfSB9XG59XG4vLyBSZW1vdmUgYSBzcGFuIGZyb20gYW4gYXJyYXksIHJldHVybmluZyB1bmRlZmluZWQgaWYgbm8gc3BhbnMgYXJlXG4vLyBsZWZ0ICh3ZSBkb24ndCBzdG9yZSBhcnJheXMgZm9yIGxpbmVzIHdpdGhvdXQgc3BhbnMpLlxuZnVuY3Rpb24gcmVtb3ZlTWFya2VkU3BhbihzcGFucywgc3Bhbikge1xuICB2YXIgcjtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBzcGFucy5sZW5ndGg7ICsraSlcbiAgICB7IGlmIChzcGFuc1tpXSAhPSBzcGFuKSB7IChyIHx8IChyID0gW10pKS5wdXNoKHNwYW5zW2ldKTsgfSB9XG4gIHJldHVybiByXG59XG4vLyBBZGQgYSBzcGFuIHRvIGEgbGluZS5cbmZ1bmN0aW9uIGFkZE1hcmtlZFNwYW4obGluZSwgc3Bhbikge1xuICBsaW5lLm1hcmtlZFNwYW5zID0gbGluZS5tYXJrZWRTcGFucyA/IGxpbmUubWFya2VkU3BhbnMuY29uY2F0KFtzcGFuXSkgOiBbc3Bhbl07XG4gIHNwYW4ubWFya2VyLmF0dGFjaExpbmUobGluZSk7XG59XG5cbi8vIFVzZWQgZm9yIHRoZSBhbGdvcml0aG0gdGhhdCBhZGp1c3RzIG1hcmtlcnMgZm9yIGEgY2hhbmdlIGluIHRoZVxuLy8gZG9jdW1lbnQuIFRoZXNlIGZ1bmN0aW9ucyBjdXQgYW4gYXJyYXkgb2Ygc3BhbnMgYXQgYSBnaXZlblxuLy8gY2hhcmFjdGVyIHBvc2l0aW9uLCByZXR1cm5pbmcgYW4gYXJyYXkgb2YgcmVtYWluaW5nIGNodW5rcyAob3Jcbi8vIHVuZGVmaW5lZCBpZiBub3RoaW5nIHJlbWFpbnMpLlxuZnVuY3Rpb24gbWFya2VkU3BhbnNCZWZvcmUob2xkLCBzdGFydENoLCBpc0luc2VydCkge1xuICB2YXIgbnc7XG4gIGlmIChvbGQpIHsgZm9yICh2YXIgaSA9IDA7IGkgPCBvbGQubGVuZ3RoOyArK2kpIHtcbiAgICB2YXIgc3BhbiA9IG9sZFtpXSwgbWFya2VyID0gc3Bhbi5tYXJrZXI7XG4gICAgdmFyIHN0YXJ0c0JlZm9yZSA9IHNwYW4uZnJvbSA9PSBudWxsIHx8IChtYXJrZXIuaW5jbHVzaXZlTGVmdCA/IHNwYW4uZnJvbSA8PSBzdGFydENoIDogc3Bhbi5mcm9tIDwgc3RhcnRDaCk7XG4gICAgaWYgKHN0YXJ0c0JlZm9yZSB8fCBzcGFuLmZyb20gPT0gc3RhcnRDaCAmJiBtYXJrZXIudHlwZSA9PSBcImJvb2ttYXJrXCIgJiYgKCFpc0luc2VydCB8fCAhc3Bhbi5tYXJrZXIuaW5zZXJ0TGVmdCkpIHtcbiAgICAgIHZhciBlbmRzQWZ0ZXIgPSBzcGFuLnRvID09IG51bGwgfHwgKG1hcmtlci5pbmNsdXNpdmVSaWdodCA/IHNwYW4udG8gPj0gc3RhcnRDaCA6IHNwYW4udG8gPiBzdGFydENoKTsobncgfHwgKG53ID0gW10pKS5wdXNoKG5ldyBNYXJrZWRTcGFuKG1hcmtlciwgc3Bhbi5mcm9tLCBlbmRzQWZ0ZXIgPyBudWxsIDogc3Bhbi50bykpO1xuICAgIH1cbiAgfSB9XG4gIHJldHVybiBud1xufVxuZnVuY3Rpb24gbWFya2VkU3BhbnNBZnRlcihvbGQsIGVuZENoLCBpc0luc2VydCkge1xuICB2YXIgbnc7XG4gIGlmIChvbGQpIHsgZm9yICh2YXIgaSA9IDA7IGkgPCBvbGQubGVuZ3RoOyArK2kpIHtcbiAgICB2YXIgc3BhbiA9IG9sZFtpXSwgbWFya2VyID0gc3Bhbi5tYXJrZXI7XG4gICAgdmFyIGVuZHNBZnRlciA9IHNwYW4udG8gPT0gbnVsbCB8fCAobWFya2VyLmluY2x1c2l2ZVJpZ2h0ID8gc3Bhbi50byA+PSBlbmRDaCA6IHNwYW4udG8gPiBlbmRDaCk7XG4gICAgaWYgKGVuZHNBZnRlciB8fCBzcGFuLmZyb20gPT0gZW5kQ2ggJiYgbWFya2VyLnR5cGUgPT0gXCJib29rbWFya1wiICYmICghaXNJbnNlcnQgfHwgc3Bhbi5tYXJrZXIuaW5zZXJ0TGVmdCkpIHtcbiAgICAgIHZhciBzdGFydHNCZWZvcmUgPSBzcGFuLmZyb20gPT0gbnVsbCB8fCAobWFya2VyLmluY2x1c2l2ZUxlZnQgPyBzcGFuLmZyb20gPD0gZW5kQ2ggOiBzcGFuLmZyb20gPCBlbmRDaCk7KG53IHx8IChudyA9IFtdKSkucHVzaChuZXcgTWFya2VkU3BhbihtYXJrZXIsIHN0YXJ0c0JlZm9yZSA/IG51bGwgOiBzcGFuLmZyb20gLSBlbmRDaCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3Bhbi50byA9PSBudWxsID8gbnVsbCA6IHNwYW4udG8gLSBlbmRDaCkpO1xuICAgIH1cbiAgfSB9XG4gIHJldHVybiBud1xufVxuXG4vLyBHaXZlbiBhIGNoYW5nZSBvYmplY3QsIGNvbXB1dGUgdGhlIG5ldyBzZXQgb2YgbWFya2VyIHNwYW5zIHRoYXRcbi8vIGNvdmVyIHRoZSBsaW5lIGluIHdoaWNoIHRoZSBjaGFuZ2UgdG9vayBwbGFjZS4gUmVtb3ZlcyBzcGFuc1xuLy8gZW50aXJlbHkgd2l0aGluIHRoZSBjaGFuZ2UsIHJlY29ubmVjdHMgc3BhbnMgYmVsb25naW5nIHRvIHRoZVxuLy8gc2FtZSBtYXJrZXIgdGhhdCBhcHBlYXIgb24gYm90aCBzaWRlcyBvZiB0aGUgY2hhbmdlLCBhbmQgY3V0cyBvZmZcbi8vIHNwYW5zIHBhcnRpYWxseSB3aXRoaW4gdGhlIGNoYW5nZS4gUmV0dXJucyBhbiBhcnJheSBvZiBzcGFuXG4vLyBhcnJheXMgd2l0aCBvbmUgZWxlbWVudCBmb3IgZWFjaCBsaW5lIGluIChhZnRlcikgdGhlIGNoYW5nZS5cbmZ1bmN0aW9uIHN0cmV0Y2hTcGFuc092ZXJDaGFuZ2UoZG9jLCBjaGFuZ2UpIHtcbiAgaWYgKGNoYW5nZS5mdWxsKSB7IHJldHVybiBudWxsIH1cbiAgdmFyIG9sZEZpcnN0ID0gaXNMaW5lKGRvYywgY2hhbmdlLmZyb20ubGluZSkgJiYgZ2V0TGluZShkb2MsIGNoYW5nZS5mcm9tLmxpbmUpLm1hcmtlZFNwYW5zO1xuICB2YXIgb2xkTGFzdCA9IGlzTGluZShkb2MsIGNoYW5nZS50by5saW5lKSAmJiBnZXRMaW5lKGRvYywgY2hhbmdlLnRvLmxpbmUpLm1hcmtlZFNwYW5zO1xuICBpZiAoIW9sZEZpcnN0ICYmICFvbGRMYXN0KSB7IHJldHVybiBudWxsIH1cblxuICB2YXIgc3RhcnRDaCA9IGNoYW5nZS5mcm9tLmNoLCBlbmRDaCA9IGNoYW5nZS50by5jaCwgaXNJbnNlcnQgPSBjbXAoY2hhbmdlLmZyb20sIGNoYW5nZS50bykgPT0gMDtcbiAgLy8gR2V0IHRoZSBzcGFucyB0aGF0ICdzdGljayBvdXQnIG9uIGJvdGggc2lkZXNcbiAgdmFyIGZpcnN0ID0gbWFya2VkU3BhbnNCZWZvcmUob2xkRmlyc3QsIHN0YXJ0Q2gsIGlzSW5zZXJ0KTtcbiAgdmFyIGxhc3QgPSBtYXJrZWRTcGFuc0FmdGVyKG9sZExhc3QsIGVuZENoLCBpc0luc2VydCk7XG5cbiAgLy8gTmV4dCwgbWVyZ2UgdGhvc2UgdHdvIGVuZHNcbiAgdmFyIHNhbWVMaW5lID0gY2hhbmdlLnRleHQubGVuZ3RoID09IDEsIG9mZnNldCA9IGxzdChjaGFuZ2UudGV4dCkubGVuZ3RoICsgKHNhbWVMaW5lID8gc3RhcnRDaCA6IDApO1xuICBpZiAoZmlyc3QpIHtcbiAgICAvLyBGaXggdXAgLnRvIHByb3BlcnRpZXMgb2YgZmlyc3RcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGZpcnN0Lmxlbmd0aDsgKytpKSB7XG4gICAgICB2YXIgc3BhbiA9IGZpcnN0W2ldO1xuICAgICAgaWYgKHNwYW4udG8gPT0gbnVsbCkge1xuICAgICAgICB2YXIgZm91bmQgPSBnZXRNYXJrZWRTcGFuRm9yKGxhc3QsIHNwYW4ubWFya2VyKTtcbiAgICAgICAgaWYgKCFmb3VuZCkgeyBzcGFuLnRvID0gc3RhcnRDaDsgfVxuICAgICAgICBlbHNlIGlmIChzYW1lTGluZSkgeyBzcGFuLnRvID0gZm91bmQudG8gPT0gbnVsbCA/IG51bGwgOiBmb3VuZC50byArIG9mZnNldDsgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuICBpZiAobGFzdCkge1xuICAgIC8vIEZpeCB1cCAuZnJvbSBpbiBsYXN0IChvciBtb3ZlIHRoZW0gaW50byBmaXJzdCBpbiBjYXNlIG9mIHNhbWVMaW5lKVxuICAgIGZvciAodmFyIGkkMSA9IDA7IGkkMSA8IGxhc3QubGVuZ3RoOyArK2kkMSkge1xuICAgICAgdmFyIHNwYW4kMSA9IGxhc3RbaSQxXTtcbiAgICAgIGlmIChzcGFuJDEudG8gIT0gbnVsbCkgeyBzcGFuJDEudG8gKz0gb2Zmc2V0OyB9XG4gICAgICBpZiAoc3BhbiQxLmZyb20gPT0gbnVsbCkge1xuICAgICAgICB2YXIgZm91bmQkMSA9IGdldE1hcmtlZFNwYW5Gb3IoZmlyc3QsIHNwYW4kMS5tYXJrZXIpO1xuICAgICAgICBpZiAoIWZvdW5kJDEpIHtcbiAgICAgICAgICBzcGFuJDEuZnJvbSA9IG9mZnNldDtcbiAgICAgICAgICBpZiAoc2FtZUxpbmUpIHsgKGZpcnN0IHx8IChmaXJzdCA9IFtdKSkucHVzaChzcGFuJDEpOyB9XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHNwYW4kMS5mcm9tICs9IG9mZnNldDtcbiAgICAgICAgaWYgKHNhbWVMaW5lKSB7IChmaXJzdCB8fCAoZmlyc3QgPSBbXSkpLnB1c2goc3BhbiQxKTsgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuICAvLyBNYWtlIHN1cmUgd2UgZGlkbid0IGNyZWF0ZSBhbnkgemVyby1sZW5ndGggc3BhbnNcbiAgaWYgKGZpcnN0KSB7IGZpcnN0ID0gY2xlYXJFbXB0eVNwYW5zKGZpcnN0KTsgfVxuICBpZiAobGFzdCAmJiBsYXN0ICE9IGZpcnN0KSB7IGxhc3QgPSBjbGVhckVtcHR5U3BhbnMobGFzdCk7IH1cblxuICB2YXIgbmV3TWFya2VycyA9IFtmaXJzdF07XG4gIGlmICghc2FtZUxpbmUpIHtcbiAgICAvLyBGaWxsIGdhcCB3aXRoIHdob2xlLWxpbmUtc3BhbnNcbiAgICB2YXIgZ2FwID0gY2hhbmdlLnRleHQubGVuZ3RoIC0gMiwgZ2FwTWFya2VycztcbiAgICBpZiAoZ2FwID4gMCAmJiBmaXJzdClcbiAgICAgIHsgZm9yICh2YXIgaSQyID0gMDsgaSQyIDwgZmlyc3QubGVuZ3RoOyArK2kkMilcbiAgICAgICAgeyBpZiAoZmlyc3RbaSQyXS50byA9PSBudWxsKVxuICAgICAgICAgIHsgKGdhcE1hcmtlcnMgfHwgKGdhcE1hcmtlcnMgPSBbXSkpLnB1c2gobmV3IE1hcmtlZFNwYW4oZmlyc3RbaSQyXS5tYXJrZXIsIG51bGwsIG51bGwpKTsgfSB9IH1cbiAgICBmb3IgKHZhciBpJDMgPSAwOyBpJDMgPCBnYXA7ICsraSQzKVxuICAgICAgeyBuZXdNYXJrZXJzLnB1c2goZ2FwTWFya2Vycyk7IH1cbiAgICBuZXdNYXJrZXJzLnB1c2gobGFzdCk7XG4gIH1cbiAgcmV0dXJuIG5ld01hcmtlcnNcbn1cblxuLy8gUmVtb3ZlIHNwYW5zIHRoYXQgYXJlIGVtcHR5IGFuZCBkb24ndCBoYXZlIGEgY2xlYXJXaGVuRW1wdHlcbi8vIG9wdGlvbiBvZiBmYWxzZS5cbmZ1bmN0aW9uIGNsZWFyRW1wdHlTcGFucyhzcGFucykge1xuICBmb3IgKHZhciBpID0gMDsgaSA8IHNwYW5zLmxlbmd0aDsgKytpKSB7XG4gICAgdmFyIHNwYW4gPSBzcGFuc1tpXTtcbiAgICBpZiAoc3Bhbi5mcm9tICE9IG51bGwgJiYgc3Bhbi5mcm9tID09IHNwYW4udG8gJiYgc3Bhbi5tYXJrZXIuY2xlYXJXaGVuRW1wdHkgIT09IGZhbHNlKVxuICAgICAgeyBzcGFucy5zcGxpY2UoaS0tLCAxKTsgfVxuICB9XG4gIGlmICghc3BhbnMubGVuZ3RoKSB7IHJldHVybiBudWxsIH1cbiAgcmV0dXJuIHNwYW5zXG59XG5cbi8vIFVzZWQgdG8gJ2NsaXAnIG91dCByZWFkT25seSByYW5nZXMgd2hlbiBtYWtpbmcgYSBjaGFuZ2UuXG5mdW5jdGlvbiByZW1vdmVSZWFkT25seVJhbmdlcyhkb2MsIGZyb20sIHRvKSB7XG4gIHZhciBtYXJrZXJzID0gbnVsbDtcbiAgZG9jLml0ZXIoZnJvbS5saW5lLCB0by5saW5lICsgMSwgZnVuY3Rpb24gKGxpbmUpIHtcbiAgICBpZiAobGluZS5tYXJrZWRTcGFucykgeyBmb3IgKHZhciBpID0gMDsgaSA8IGxpbmUubWFya2VkU3BhbnMubGVuZ3RoOyArK2kpIHtcbiAgICAgIHZhciBtYXJrID0gbGluZS5tYXJrZWRTcGFuc1tpXS5tYXJrZXI7XG4gICAgICBpZiAobWFyay5yZWFkT25seSAmJiAoIW1hcmtlcnMgfHwgaW5kZXhPZihtYXJrZXJzLCBtYXJrKSA9PSAtMSkpXG4gICAgICAgIHsgKG1hcmtlcnMgfHwgKG1hcmtlcnMgPSBbXSkpLnB1c2gobWFyayk7IH1cbiAgICB9IH1cbiAgfSk7XG4gIGlmICghbWFya2VycykgeyByZXR1cm4gbnVsbCB9XG4gIHZhciBwYXJ0cyA9IFt7ZnJvbTogZnJvbSwgdG86IHRvfV07XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbWFya2Vycy5sZW5ndGg7ICsraSkge1xuICAgIHZhciBtayA9IG1hcmtlcnNbaV0sIG0gPSBtay5maW5kKDApO1xuICAgIGZvciAodmFyIGogPSAwOyBqIDwgcGFydHMubGVuZ3RoOyArK2opIHtcbiAgICAgIHZhciBwID0gcGFydHNbal07XG4gICAgICBpZiAoY21wKHAudG8sIG0uZnJvbSkgPCAwIHx8IGNtcChwLmZyb20sIG0udG8pID4gMCkgeyBjb250aW51ZSB9XG4gICAgICB2YXIgbmV3UGFydHMgPSBbaiwgMV0sIGRmcm9tID0gY21wKHAuZnJvbSwgbS5mcm9tKSwgZHRvID0gY21wKHAudG8sIG0udG8pO1xuICAgICAgaWYgKGRmcm9tIDwgMCB8fCAhbWsuaW5jbHVzaXZlTGVmdCAmJiAhZGZyb20pXG4gICAgICAgIHsgbmV3UGFydHMucHVzaCh7ZnJvbTogcC5mcm9tLCB0bzogbS5mcm9tfSk7IH1cbiAgICAgIGlmIChkdG8gPiAwIHx8ICFtay5pbmNsdXNpdmVSaWdodCAmJiAhZHRvKVxuICAgICAgICB7IG5ld1BhcnRzLnB1c2goe2Zyb206IG0udG8sIHRvOiBwLnRvfSk7IH1cbiAgICAgIHBhcnRzLnNwbGljZS5hcHBseShwYXJ0cywgbmV3UGFydHMpO1xuICAgICAgaiArPSBuZXdQYXJ0cy5sZW5ndGggLSAzO1xuICAgIH1cbiAgfVxuICByZXR1cm4gcGFydHNcbn1cblxuLy8gQ29ubmVjdCBvciBkaXNjb25uZWN0IHNwYW5zIGZyb20gYSBsaW5lLlxuZnVuY3Rpb24gZGV0YWNoTWFya2VkU3BhbnMobGluZSkge1xuICB2YXIgc3BhbnMgPSBsaW5lLm1hcmtlZFNwYW5zO1xuICBpZiAoIXNwYW5zKSB7IHJldHVybiB9XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc3BhbnMubGVuZ3RoOyArK2kpXG4gICAgeyBzcGFuc1tpXS5tYXJrZXIuZGV0YWNoTGluZShsaW5lKTsgfVxuICBsaW5lLm1hcmtlZFNwYW5zID0gbnVsbDtcbn1cbmZ1bmN0aW9uIGF0dGFjaE1hcmtlZFNwYW5zKGxpbmUsIHNwYW5zKSB7XG4gIGlmICghc3BhbnMpIHsgcmV0dXJuIH1cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBzcGFucy5sZW5ndGg7ICsraSlcbiAgICB7IHNwYW5zW2ldLm1hcmtlci5hdHRhY2hMaW5lKGxpbmUpOyB9XG4gIGxpbmUubWFya2VkU3BhbnMgPSBzcGFucztcbn1cblxuLy8gSGVscGVycyB1c2VkIHdoZW4gY29tcHV0aW5nIHdoaWNoIG92ZXJsYXBwaW5nIGNvbGxhcHNlZCBzcGFuXG4vLyBjb3VudHMgYXMgdGhlIGxhcmdlciBvbmUuXG5mdW5jdGlvbiBleHRyYUxlZnQobWFya2VyKSB7IHJldHVybiBtYXJrZXIuaW5jbHVzaXZlTGVmdCA/IC0xIDogMCB9XG5mdW5jdGlvbiBleHRyYVJpZ2h0KG1hcmtlcikgeyByZXR1cm4gbWFya2VyLmluY2x1c2l2ZVJpZ2h0ID8gMSA6IDAgfVxuXG4vLyBSZXR1cm5zIGEgbnVtYmVyIGluZGljYXRpbmcgd2hpY2ggb2YgdHdvIG92ZXJsYXBwaW5nIGNvbGxhcHNlZFxuLy8gc3BhbnMgaXMgbGFyZ2VyIChhbmQgdGh1cyBpbmNsdWRlcyB0aGUgb3RoZXIpLiBGYWxscyBiYWNrIHRvXG4vLyBjb21wYXJpbmcgaWRzIHdoZW4gdGhlIHNwYW5zIGNvdmVyIGV4YWN0bHkgdGhlIHNhbWUgcmFuZ2UuXG5mdW5jdGlvbiBjb21wYXJlQ29sbGFwc2VkTWFya2VycyhhLCBiKSB7XG4gIHZhciBsZW5EaWZmID0gYS5saW5lcy5sZW5ndGggLSBiLmxpbmVzLmxlbmd0aDtcbiAgaWYgKGxlbkRpZmYgIT0gMCkgeyByZXR1cm4gbGVuRGlmZiB9XG4gIHZhciBhUG9zID0gYS5maW5kKCksIGJQb3MgPSBiLmZpbmQoKTtcbiAgdmFyIGZyb21DbXAgPSBjbXAoYVBvcy5mcm9tLCBiUG9zLmZyb20pIHx8IGV4dHJhTGVmdChhKSAtIGV4dHJhTGVmdChiKTtcbiAgaWYgKGZyb21DbXApIHsgcmV0dXJuIC1mcm9tQ21wIH1cbiAgdmFyIHRvQ21wID0gY21wKGFQb3MudG8sIGJQb3MudG8pIHx8IGV4dHJhUmlnaHQoYSkgLSBleHRyYVJpZ2h0KGIpO1xuICBpZiAodG9DbXApIHsgcmV0dXJuIHRvQ21wIH1cbiAgcmV0dXJuIGIuaWQgLSBhLmlkXG59XG5cbi8vIEZpbmQgb3V0IHdoZXRoZXIgYSBsaW5lIGVuZHMgb3Igc3RhcnRzIGluIGEgY29sbGFwc2VkIHNwYW4uIElmXG4vLyBzbywgcmV0dXJuIHRoZSBtYXJrZXIgZm9yIHRoYXQgc3Bhbi5cbmZ1bmN0aW9uIGNvbGxhcHNlZFNwYW5BdFNpZGUobGluZSwgc3RhcnQpIHtcbiAgdmFyIHNwcyA9IHNhd0NvbGxhcHNlZFNwYW5zICYmIGxpbmUubWFya2VkU3BhbnMsIGZvdW5kO1xuICBpZiAoc3BzKSB7IGZvciAodmFyIHNwID0gKHZvaWQgMCksIGkgPSAwOyBpIDwgc3BzLmxlbmd0aDsgKytpKSB7XG4gICAgc3AgPSBzcHNbaV07XG4gICAgaWYgKHNwLm1hcmtlci5jb2xsYXBzZWQgJiYgKHN0YXJ0ID8gc3AuZnJvbSA6IHNwLnRvKSA9PSBudWxsICYmXG4gICAgICAgICghZm91bmQgfHwgY29tcGFyZUNvbGxhcHNlZE1hcmtlcnMoZm91bmQsIHNwLm1hcmtlcikgPCAwKSlcbiAgICAgIHsgZm91bmQgPSBzcC5tYXJrZXI7IH1cbiAgfSB9XG4gIHJldHVybiBmb3VuZFxufVxuZnVuY3Rpb24gY29sbGFwc2VkU3BhbkF0U3RhcnQobGluZSkgeyByZXR1cm4gY29sbGFwc2VkU3BhbkF0U2lkZShsaW5lLCB0cnVlKSB9XG5mdW5jdGlvbiBjb2xsYXBzZWRTcGFuQXRFbmQobGluZSkgeyByZXR1cm4gY29sbGFwc2VkU3BhbkF0U2lkZShsaW5lLCBmYWxzZSkgfVxuXG5mdW5jdGlvbiBjb2xsYXBzZWRTcGFuQXJvdW5kKGxpbmUsIGNoKSB7XG4gIHZhciBzcHMgPSBzYXdDb2xsYXBzZWRTcGFucyAmJiBsaW5lLm1hcmtlZFNwYW5zLCBmb3VuZDtcbiAgaWYgKHNwcykgeyBmb3IgKHZhciBpID0gMDsgaSA8IHNwcy5sZW5ndGg7ICsraSkge1xuICAgIHZhciBzcCA9IHNwc1tpXTtcbiAgICBpZiAoc3AubWFya2VyLmNvbGxhcHNlZCAmJiAoc3AuZnJvbSA9PSBudWxsIHx8IHNwLmZyb20gPCBjaCkgJiYgKHNwLnRvID09IG51bGwgfHwgc3AudG8gPiBjaCkgJiZcbiAgICAgICAgKCFmb3VuZCB8fCBjb21wYXJlQ29sbGFwc2VkTWFya2Vycyhmb3VuZCwgc3AubWFya2VyKSA8IDApKSB7IGZvdW5kID0gc3AubWFya2VyOyB9XG4gIH0gfVxuICByZXR1cm4gZm91bmRcbn1cblxuLy8gVGVzdCB3aGV0aGVyIHRoZXJlIGV4aXN0cyBhIGNvbGxhcHNlZCBzcGFuIHRoYXQgcGFydGlhbGx5XG4vLyBvdmVybGFwcyAoY292ZXJzIHRoZSBzdGFydCBvciBlbmQsIGJ1dCBub3QgYm90aCkgb2YgYSBuZXcgc3Bhbi5cbi8vIFN1Y2ggb3ZlcmxhcCBpcyBub3QgYWxsb3dlZC5cbmZ1bmN0aW9uIGNvbmZsaWN0aW5nQ29sbGFwc2VkUmFuZ2UoZG9jLCBsaW5lTm8kJDEsIGZyb20sIHRvLCBtYXJrZXIpIHtcbiAgdmFyIGxpbmUgPSBnZXRMaW5lKGRvYywgbGluZU5vJCQxKTtcbiAgdmFyIHNwcyA9IHNhd0NvbGxhcHNlZFNwYW5zICYmIGxpbmUubWFya2VkU3BhbnM7XG4gIGlmIChzcHMpIHsgZm9yICh2YXIgaSA9IDA7IGkgPCBzcHMubGVuZ3RoOyArK2kpIHtcbiAgICB2YXIgc3AgPSBzcHNbaV07XG4gICAgaWYgKCFzcC5tYXJrZXIuY29sbGFwc2VkKSB7IGNvbnRpbnVlIH1cbiAgICB2YXIgZm91bmQgPSBzcC5tYXJrZXIuZmluZCgwKTtcbiAgICB2YXIgZnJvbUNtcCA9IGNtcChmb3VuZC5mcm9tLCBmcm9tKSB8fCBleHRyYUxlZnQoc3AubWFya2VyKSAtIGV4dHJhTGVmdChtYXJrZXIpO1xuICAgIHZhciB0b0NtcCA9IGNtcChmb3VuZC50bywgdG8pIHx8IGV4dHJhUmlnaHQoc3AubWFya2VyKSAtIGV4dHJhUmlnaHQobWFya2VyKTtcbiAgICBpZiAoZnJvbUNtcCA+PSAwICYmIHRvQ21wIDw9IDAgfHwgZnJvbUNtcCA8PSAwICYmIHRvQ21wID49IDApIHsgY29udGludWUgfVxuICAgIGlmIChmcm9tQ21wIDw9IDAgJiYgKHNwLm1hcmtlci5pbmNsdXNpdmVSaWdodCAmJiBtYXJrZXIuaW5jbHVzaXZlTGVmdCA/IGNtcChmb3VuZC50bywgZnJvbSkgPj0gMCA6IGNtcChmb3VuZC50bywgZnJvbSkgPiAwKSB8fFxuICAgICAgICBmcm9tQ21wID49IDAgJiYgKHNwLm1hcmtlci5pbmNsdXNpdmVSaWdodCAmJiBtYXJrZXIuaW5jbHVzaXZlTGVmdCA/IGNtcChmb3VuZC5mcm9tLCB0bykgPD0gMCA6IGNtcChmb3VuZC5mcm9tLCB0bykgPCAwKSlcbiAgICAgIHsgcmV0dXJuIHRydWUgfVxuICB9IH1cbn1cblxuLy8gQSB2aXN1YWwgbGluZSBpcyBhIGxpbmUgYXMgZHJhd24gb24gdGhlIHNjcmVlbi4gRm9sZGluZywgZm9yXG4vLyBleGFtcGxlLCBjYW4gY2F1c2UgbXVsdGlwbGUgbG9naWNhbCBsaW5lcyB0byBhcHBlYXIgb24gdGhlIHNhbWVcbi8vIHZpc3VhbCBsaW5lLiBUaGlzIGZpbmRzIHRoZSBzdGFydCBvZiB0aGUgdmlzdWFsIGxpbmUgdGhhdCB0aGVcbi8vIGdpdmVuIGxpbmUgaXMgcGFydCBvZiAodXN1YWxseSB0aGF0IGlzIHRoZSBsaW5lIGl0c2VsZikuXG5mdW5jdGlvbiB2aXN1YWxMaW5lKGxpbmUpIHtcbiAgdmFyIG1lcmdlZDtcbiAgd2hpbGUgKG1lcmdlZCA9IGNvbGxhcHNlZFNwYW5BdFN0YXJ0KGxpbmUpKVxuICAgIHsgbGluZSA9IG1lcmdlZC5maW5kKC0xLCB0cnVlKS5saW5lOyB9XG4gIHJldHVybiBsaW5lXG59XG5cbmZ1bmN0aW9uIHZpc3VhbExpbmVFbmQobGluZSkge1xuICB2YXIgbWVyZ2VkO1xuICB3aGlsZSAobWVyZ2VkID0gY29sbGFwc2VkU3BhbkF0RW5kKGxpbmUpKVxuICAgIHsgbGluZSA9IG1lcmdlZC5maW5kKDEsIHRydWUpLmxpbmU7IH1cbiAgcmV0dXJuIGxpbmVcbn1cblxuLy8gUmV0dXJucyBhbiBhcnJheSBvZiBsb2dpY2FsIGxpbmVzIHRoYXQgY29udGludWUgdGhlIHZpc3VhbCBsaW5lXG4vLyBzdGFydGVkIGJ5IHRoZSBhcmd1bWVudCwgb3IgdW5kZWZpbmVkIGlmIHRoZXJlIGFyZSBubyBzdWNoIGxpbmVzLlxuZnVuY3Rpb24gdmlzdWFsTGluZUNvbnRpbnVlZChsaW5lKSB7XG4gIHZhciBtZXJnZWQsIGxpbmVzO1xuICB3aGlsZSAobWVyZ2VkID0gY29sbGFwc2VkU3BhbkF0RW5kKGxpbmUpKSB7XG4gICAgbGluZSA9IG1lcmdlZC5maW5kKDEsIHRydWUpLmxpbmVcbiAgICA7KGxpbmVzIHx8IChsaW5lcyA9IFtdKSkucHVzaChsaW5lKTtcbiAgfVxuICByZXR1cm4gbGluZXNcbn1cblxuLy8gR2V0IHRoZSBsaW5lIG51bWJlciBvZiB0aGUgc3RhcnQgb2YgdGhlIHZpc3VhbCBsaW5lIHRoYXQgdGhlXG4vLyBnaXZlbiBsaW5lIG51bWJlciBpcyBwYXJ0IG9mLlxuZnVuY3Rpb24gdmlzdWFsTGluZU5vKGRvYywgbGluZU4pIHtcbiAgdmFyIGxpbmUgPSBnZXRMaW5lKGRvYywgbGluZU4pLCB2aXMgPSB2aXN1YWxMaW5lKGxpbmUpO1xuICBpZiAobGluZSA9PSB2aXMpIHsgcmV0dXJuIGxpbmVOIH1cbiAgcmV0dXJuIGxpbmVObyh2aXMpXG59XG5cbi8vIEdldCB0aGUgbGluZSBudW1iZXIgb2YgdGhlIHN0YXJ0IG9mIHRoZSBuZXh0IHZpc3VhbCBsaW5lIGFmdGVyXG4vLyB0aGUgZ2l2ZW4gbGluZS5cbmZ1bmN0aW9uIHZpc3VhbExpbmVFbmRObyhkb2MsIGxpbmVOKSB7XG4gIGlmIChsaW5lTiA+IGRvYy5sYXN0TGluZSgpKSB7IHJldHVybiBsaW5lTiB9XG4gIHZhciBsaW5lID0gZ2V0TGluZShkb2MsIGxpbmVOKSwgbWVyZ2VkO1xuICBpZiAoIWxpbmVJc0hpZGRlbihkb2MsIGxpbmUpKSB7IHJldHVybiBsaW5lTiB9XG4gIHdoaWxlIChtZXJnZWQgPSBjb2xsYXBzZWRTcGFuQXRFbmQobGluZSkpXG4gICAgeyBsaW5lID0gbWVyZ2VkLmZpbmQoMSwgdHJ1ZSkubGluZTsgfVxuICByZXR1cm4gbGluZU5vKGxpbmUpICsgMVxufVxuXG4vLyBDb21wdXRlIHdoZXRoZXIgYSBsaW5lIGlzIGhpZGRlbi4gTGluZXMgY291bnQgYXMgaGlkZGVuIHdoZW4gdGhleVxuLy8gYXJlIHBhcnQgb2YgYSB2aXN1YWwgbGluZSB0aGF0IHN0YXJ0cyB3aXRoIGFub3RoZXIgbGluZSwgb3Igd2hlblxuLy8gdGhleSBhcmUgZW50aXJlbHkgY292ZXJlZCBieSBjb2xsYXBzZWQsIG5vbi13aWRnZXQgc3Bhbi5cbmZ1bmN0aW9uIGxpbmVJc0hpZGRlbihkb2MsIGxpbmUpIHtcbiAgdmFyIHNwcyA9IHNhd0NvbGxhcHNlZFNwYW5zICYmIGxpbmUubWFya2VkU3BhbnM7XG4gIGlmIChzcHMpIHsgZm9yICh2YXIgc3AgPSAodm9pZCAwKSwgaSA9IDA7IGkgPCBzcHMubGVuZ3RoOyArK2kpIHtcbiAgICBzcCA9IHNwc1tpXTtcbiAgICBpZiAoIXNwLm1hcmtlci5jb2xsYXBzZWQpIHsgY29udGludWUgfVxuICAgIGlmIChzcC5mcm9tID09IG51bGwpIHsgcmV0dXJuIHRydWUgfVxuICAgIGlmIChzcC5tYXJrZXIud2lkZ2V0Tm9kZSkgeyBjb250aW51ZSB9XG4gICAgaWYgKHNwLmZyb20gPT0gMCAmJiBzcC5tYXJrZXIuaW5jbHVzaXZlTGVmdCAmJiBsaW5lSXNIaWRkZW5Jbm5lcihkb2MsIGxpbmUsIHNwKSlcbiAgICAgIHsgcmV0dXJuIHRydWUgfVxuICB9IH1cbn1cbmZ1bmN0aW9uIGxpbmVJc0hpZGRlbklubmVyKGRvYywgbGluZSwgc3Bhbikge1xuICBpZiAoc3Bhbi50byA9PSBudWxsKSB7XG4gICAgdmFyIGVuZCA9IHNwYW4ubWFya2VyLmZpbmQoMSwgdHJ1ZSk7XG4gICAgcmV0dXJuIGxpbmVJc0hpZGRlbklubmVyKGRvYywgZW5kLmxpbmUsIGdldE1hcmtlZFNwYW5Gb3IoZW5kLmxpbmUubWFya2VkU3BhbnMsIHNwYW4ubWFya2VyKSlcbiAgfVxuICBpZiAoc3Bhbi5tYXJrZXIuaW5jbHVzaXZlUmlnaHQgJiYgc3Bhbi50byA9PSBsaW5lLnRleHQubGVuZ3RoKVxuICAgIHsgcmV0dXJuIHRydWUgfVxuICBmb3IgKHZhciBzcCA9ICh2b2lkIDApLCBpID0gMDsgaSA8IGxpbmUubWFya2VkU3BhbnMubGVuZ3RoOyArK2kpIHtcbiAgICBzcCA9IGxpbmUubWFya2VkU3BhbnNbaV07XG4gICAgaWYgKHNwLm1hcmtlci5jb2xsYXBzZWQgJiYgIXNwLm1hcmtlci53aWRnZXROb2RlICYmIHNwLmZyb20gPT0gc3Bhbi50byAmJlxuICAgICAgICAoc3AudG8gPT0gbnVsbCB8fCBzcC50byAhPSBzcGFuLmZyb20pICYmXG4gICAgICAgIChzcC5tYXJrZXIuaW5jbHVzaXZlTGVmdCB8fCBzcGFuLm1hcmtlci5pbmNsdXNpdmVSaWdodCkgJiZcbiAgICAgICAgbGluZUlzSGlkZGVuSW5uZXIoZG9jLCBsaW5lLCBzcCkpIHsgcmV0dXJuIHRydWUgfVxuICB9XG59XG5cbi8vIEZpbmQgdGhlIGhlaWdodCBhYm92ZSB0aGUgZ2l2ZW4gbGluZS5cbmZ1bmN0aW9uIGhlaWdodEF0TGluZShsaW5lT2JqKSB7XG4gIGxpbmVPYmogPSB2aXN1YWxMaW5lKGxpbmVPYmopO1xuXG4gIHZhciBoID0gMCwgY2h1bmsgPSBsaW5lT2JqLnBhcmVudDtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBjaHVuay5saW5lcy5sZW5ndGg7ICsraSkge1xuICAgIHZhciBsaW5lID0gY2h1bmsubGluZXNbaV07XG4gICAgaWYgKGxpbmUgPT0gbGluZU9iaikgeyBicmVhayB9XG4gICAgZWxzZSB7IGggKz0gbGluZS5oZWlnaHQ7IH1cbiAgfVxuICBmb3IgKHZhciBwID0gY2h1bmsucGFyZW50OyBwOyBjaHVuayA9IHAsIHAgPSBjaHVuay5wYXJlbnQpIHtcbiAgICBmb3IgKHZhciBpJDEgPSAwOyBpJDEgPCBwLmNoaWxkcmVuLmxlbmd0aDsgKytpJDEpIHtcbiAgICAgIHZhciBjdXIgPSBwLmNoaWxkcmVuW2kkMV07XG4gICAgICBpZiAoY3VyID09IGNodW5rKSB7IGJyZWFrIH1cbiAgICAgIGVsc2UgeyBoICs9IGN1ci5oZWlnaHQ7IH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIGhcbn1cblxuLy8gQ29tcHV0ZSB0aGUgY2hhcmFjdGVyIGxlbmd0aCBvZiBhIGxpbmUsIHRha2luZyBpbnRvIGFjY291bnRcbi8vIGNvbGxhcHNlZCByYW5nZXMgKHNlZSBtYXJrVGV4dCkgdGhhdCBtaWdodCBoaWRlIHBhcnRzLCBhbmQgam9pblxuLy8gb3RoZXIgbGluZXMgb250byBpdC5cbmZ1bmN0aW9uIGxpbmVMZW5ndGgobGluZSkge1xuICBpZiAobGluZS5oZWlnaHQgPT0gMCkgeyByZXR1cm4gMCB9XG4gIHZhciBsZW4gPSBsaW5lLnRleHQubGVuZ3RoLCBtZXJnZWQsIGN1ciA9IGxpbmU7XG4gIHdoaWxlIChtZXJnZWQgPSBjb2xsYXBzZWRTcGFuQXRTdGFydChjdXIpKSB7XG4gICAgdmFyIGZvdW5kID0gbWVyZ2VkLmZpbmQoMCwgdHJ1ZSk7XG4gICAgY3VyID0gZm91bmQuZnJvbS5saW5lO1xuICAgIGxlbiArPSBmb3VuZC5mcm9tLmNoIC0gZm91bmQudG8uY2g7XG4gIH1cbiAgY3VyID0gbGluZTtcbiAgd2hpbGUgKG1lcmdlZCA9IGNvbGxhcHNlZFNwYW5BdEVuZChjdXIpKSB7XG4gICAgdmFyIGZvdW5kJDEgPSBtZXJnZWQuZmluZCgwLCB0cnVlKTtcbiAgICBsZW4gLT0gY3VyLnRleHQubGVuZ3RoIC0gZm91bmQkMS5mcm9tLmNoO1xuICAgIGN1ciA9IGZvdW5kJDEudG8ubGluZTtcbiAgICBsZW4gKz0gY3VyLnRleHQubGVuZ3RoIC0gZm91bmQkMS50by5jaDtcbiAgfVxuICByZXR1cm4gbGVuXG59XG5cbi8vIEZpbmQgdGhlIGxvbmdlc3QgbGluZSBpbiB0aGUgZG9jdW1lbnQuXG5mdW5jdGlvbiBmaW5kTWF4TGluZShjbSkge1xuICB2YXIgZCA9IGNtLmRpc3BsYXksIGRvYyA9IGNtLmRvYztcbiAgZC5tYXhMaW5lID0gZ2V0TGluZShkb2MsIGRvYy5maXJzdCk7XG4gIGQubWF4TGluZUxlbmd0aCA9IGxpbmVMZW5ndGgoZC5tYXhMaW5lKTtcbiAgZC5tYXhMaW5lQ2hhbmdlZCA9IHRydWU7XG4gIGRvYy5pdGVyKGZ1bmN0aW9uIChsaW5lKSB7XG4gICAgdmFyIGxlbiA9IGxpbmVMZW5ndGgobGluZSk7XG4gICAgaWYgKGxlbiA+IGQubWF4TGluZUxlbmd0aCkge1xuICAgICAgZC5tYXhMaW5lTGVuZ3RoID0gbGVuO1xuICAgICAgZC5tYXhMaW5lID0gbGluZTtcbiAgICB9XG4gIH0pO1xufVxuXG4vLyBCSURJIEhFTFBFUlNcblxuZnVuY3Rpb24gaXRlcmF0ZUJpZGlTZWN0aW9ucyhvcmRlciwgZnJvbSwgdG8sIGYpIHtcbiAgaWYgKCFvcmRlcikgeyByZXR1cm4gZihmcm9tLCB0bywgXCJsdHJcIiwgMCkgfVxuICB2YXIgZm91bmQgPSBmYWxzZTtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBvcmRlci5sZW5ndGg7ICsraSkge1xuICAgIHZhciBwYXJ0ID0gb3JkZXJbaV07XG4gICAgaWYgKHBhcnQuZnJvbSA8IHRvICYmIHBhcnQudG8gPiBmcm9tIHx8IGZyb20gPT0gdG8gJiYgcGFydC50byA9PSBmcm9tKSB7XG4gICAgICBmKE1hdGgubWF4KHBhcnQuZnJvbSwgZnJvbSksIE1hdGgubWluKHBhcnQudG8sIHRvKSwgcGFydC5sZXZlbCA9PSAxID8gXCJydGxcIiA6IFwibHRyXCIsIGkpO1xuICAgICAgZm91bmQgPSB0cnVlO1xuICAgIH1cbiAgfVxuICBpZiAoIWZvdW5kKSB7IGYoZnJvbSwgdG8sIFwibHRyXCIpOyB9XG59XG5cbnZhciBiaWRpT3RoZXIgPSBudWxsO1xuZnVuY3Rpb24gZ2V0QmlkaVBhcnRBdChvcmRlciwgY2gsIHN0aWNreSkge1xuICB2YXIgZm91bmQ7XG4gIGJpZGlPdGhlciA9IG51bGw7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgb3JkZXIubGVuZ3RoOyArK2kpIHtcbiAgICB2YXIgY3VyID0gb3JkZXJbaV07XG4gICAgaWYgKGN1ci5mcm9tIDwgY2ggJiYgY3VyLnRvID4gY2gpIHsgcmV0dXJuIGkgfVxuICAgIGlmIChjdXIudG8gPT0gY2gpIHtcbiAgICAgIGlmIChjdXIuZnJvbSAhPSBjdXIudG8gJiYgc3RpY2t5ID09IFwiYmVmb3JlXCIpIHsgZm91bmQgPSBpOyB9XG4gICAgICBlbHNlIHsgYmlkaU90aGVyID0gaTsgfVxuICAgIH1cbiAgICBpZiAoY3VyLmZyb20gPT0gY2gpIHtcbiAgICAgIGlmIChjdXIuZnJvbSAhPSBjdXIudG8gJiYgc3RpY2t5ICE9IFwiYmVmb3JlXCIpIHsgZm91bmQgPSBpOyB9XG4gICAgICBlbHNlIHsgYmlkaU90aGVyID0gaTsgfVxuICAgIH1cbiAgfVxuICByZXR1cm4gZm91bmQgIT0gbnVsbCA/IGZvdW5kIDogYmlkaU90aGVyXG59XG5cbi8vIEJpZGlyZWN0aW9uYWwgb3JkZXJpbmcgYWxnb3JpdGhtXG4vLyBTZWUgaHR0cDovL3VuaWNvZGUub3JnL3JlcG9ydHMvdHI5L3RyOS0xMy5odG1sIGZvciB0aGUgYWxnb3JpdGhtXG4vLyB0aGF0IHRoaXMgKHBhcnRpYWxseSkgaW1wbGVtZW50cy5cblxuLy8gT25lLWNoYXIgY29kZXMgdXNlZCBmb3IgY2hhcmFjdGVyIHR5cGVzOlxuLy8gTCAoTCk6ICAgTGVmdC10by1SaWdodFxuLy8gUiAoUik6ICAgUmlnaHQtdG8tTGVmdFxuLy8gciAoQUwpOiAgUmlnaHQtdG8tTGVmdCBBcmFiaWNcbi8vIDEgKEVOKTogIEV1cm9wZWFuIE51bWJlclxuLy8gKyAoRVMpOiAgRXVyb3BlYW4gTnVtYmVyIFNlcGFyYXRvclxuLy8gJSAoRVQpOiAgRXVyb3BlYW4gTnVtYmVyIFRlcm1pbmF0b3Jcbi8vIG4gKEFOKTogIEFyYWJpYyBOdW1iZXJcbi8vICwgKENTKTogIENvbW1vbiBOdW1iZXIgU2VwYXJhdG9yXG4vLyBtIChOU00pOiBOb24tU3BhY2luZyBNYXJrXG4vLyBiIChCTik6ICBCb3VuZGFyeSBOZXV0cmFsXG4vLyBzIChCKTogICBQYXJhZ3JhcGggU2VwYXJhdG9yXG4vLyB0IChTKTogICBTZWdtZW50IFNlcGFyYXRvclxuLy8gdyAoV1MpOiAgV2hpdGVzcGFjZVxuLy8gTiAoT04pOiAgT3RoZXIgTmV1dHJhbHNcblxuLy8gUmV0dXJucyBudWxsIGlmIGNoYXJhY3RlcnMgYXJlIG9yZGVyZWQgYXMgdGhleSBhcHBlYXJcbi8vIChsZWZ0LXRvLXJpZ2h0KSwgb3IgYW4gYXJyYXkgb2Ygc2VjdGlvbnMgKHtmcm9tLCB0bywgbGV2ZWx9XG4vLyBvYmplY3RzKSBpbiB0aGUgb3JkZXIgaW4gd2hpY2ggdGhleSBvY2N1ciB2aXN1YWxseS5cbnZhciBiaWRpT3JkZXJpbmcgPSAoZnVuY3Rpb24oKSB7XG4gIC8vIENoYXJhY3RlciB0eXBlcyBmb3IgY29kZXBvaW50cyAwIHRvIDB4ZmZcbiAgdmFyIGxvd1R5cGVzID0gXCJiYmJiYmJiYmJ0c3R3c2JiYmJiYmJiYmJiYmJic3NzdHdOTiUlJU5OTk5OTixOLE4xMTExMTExMTExTk5OTk5OTkxMTExMTExMTExMTExMTExMTExMTExMTExMTk5OTk5OTExMTExMTExMTExMTExMTExMTExMTExMTExOTk5OYmJiYmJic2JiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiLE4lJSUlTk5OTkxOTk5OTiUlMTFOTE5OTjFMTk5OTk5MTExMTExMTExMTExMTExMTExMTExMTE5MTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTlwiO1xuICAvLyBDaGFyYWN0ZXIgdHlwZXMgZm9yIGNvZGVwb2ludHMgMHg2MDAgdG8gMHg2ZjlcbiAgdmFyIGFyYWJpY1R5cGVzID0gXCJubm5ubm5OTnIlJXIsck5ObW1tbW1tbW1tbW1ycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJtbW1tbW1tbW1tbW1tbW1tbW1tbW1ubm5ubm5ubm5uJW5ucnJybXJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJybW1tbW1tbW5ObW1tbW1tcnJtbU5tbW1tcnIxMTExMTExMTExXCI7XG4gIGZ1bmN0aW9uIGNoYXJUeXBlKGNvZGUpIHtcbiAgICBpZiAoY29kZSA8PSAweGY3KSB7IHJldHVybiBsb3dUeXBlcy5jaGFyQXQoY29kZSkgfVxuICAgIGVsc2UgaWYgKDB4NTkwIDw9IGNvZGUgJiYgY29kZSA8PSAweDVmNCkgeyByZXR1cm4gXCJSXCIgfVxuICAgIGVsc2UgaWYgKDB4NjAwIDw9IGNvZGUgJiYgY29kZSA8PSAweDZmOSkgeyByZXR1cm4gYXJhYmljVHlwZXMuY2hhckF0KGNvZGUgLSAweDYwMCkgfVxuICAgIGVsc2UgaWYgKDB4NmVlIDw9IGNvZGUgJiYgY29kZSA8PSAweDhhYykgeyByZXR1cm4gXCJyXCIgfVxuICAgIGVsc2UgaWYgKDB4MjAwMCA8PSBjb2RlICYmIGNvZGUgPD0gMHgyMDBiKSB7IHJldHVybiBcIndcIiB9XG4gICAgZWxzZSBpZiAoY29kZSA9PSAweDIwMGMpIHsgcmV0dXJuIFwiYlwiIH1cbiAgICBlbHNlIHsgcmV0dXJuIFwiTFwiIH1cbiAgfVxuXG4gIHZhciBiaWRpUkUgPSAvW1xcdTA1OTAtXFx1MDVmNFxcdTA2MDAtXFx1MDZmZlxcdTA3MDAtXFx1MDhhY10vO1xuICB2YXIgaXNOZXV0cmFsID0gL1tzdHdOXS8sIGlzU3Ryb25nID0gL1tMUnJdLywgY291bnRzQXNMZWZ0ID0gL1tMYjFuXS8sIGNvdW50c0FzTnVtID0gL1sxbl0vO1xuXG4gIGZ1bmN0aW9uIEJpZGlTcGFuKGxldmVsLCBmcm9tLCB0bykge1xuICAgIHRoaXMubGV2ZWwgPSBsZXZlbDtcbiAgICB0aGlzLmZyb20gPSBmcm9tOyB0aGlzLnRvID0gdG87XG4gIH1cblxuICByZXR1cm4gZnVuY3Rpb24oc3RyLCBkaXJlY3Rpb24pIHtcbiAgICB2YXIgb3V0ZXJUeXBlID0gZGlyZWN0aW9uID09IFwibHRyXCIgPyBcIkxcIiA6IFwiUlwiO1xuXG4gICAgaWYgKHN0ci5sZW5ndGggPT0gMCB8fCBkaXJlY3Rpb24gPT0gXCJsdHJcIiAmJiAhYmlkaVJFLnRlc3Qoc3RyKSkgeyByZXR1cm4gZmFsc2UgfVxuICAgIHZhciBsZW4gPSBzdHIubGVuZ3RoLCB0eXBlcyA9IFtdO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuOyArK2kpXG4gICAgICB7IHR5cGVzLnB1c2goY2hhclR5cGUoc3RyLmNoYXJDb2RlQXQoaSkpKTsgfVxuXG4gICAgLy8gVzEuIEV4YW1pbmUgZWFjaCBub24tc3BhY2luZyBtYXJrIChOU00pIGluIHRoZSBsZXZlbCBydW4sIGFuZFxuICAgIC8vIGNoYW5nZSB0aGUgdHlwZSBvZiB0aGUgTlNNIHRvIHRoZSB0eXBlIG9mIHRoZSBwcmV2aW91c1xuICAgIC8vIGNoYXJhY3Rlci4gSWYgdGhlIE5TTSBpcyBhdCB0aGUgc3RhcnQgb2YgdGhlIGxldmVsIHJ1biwgaXQgd2lsbFxuICAgIC8vIGdldCB0aGUgdHlwZSBvZiBzb3IuXG4gICAgZm9yICh2YXIgaSQxID0gMCwgcHJldiA9IG91dGVyVHlwZTsgaSQxIDwgbGVuOyArK2kkMSkge1xuICAgICAgdmFyIHR5cGUgPSB0eXBlc1tpJDFdO1xuICAgICAgaWYgKHR5cGUgPT0gXCJtXCIpIHsgdHlwZXNbaSQxXSA9IHByZXY7IH1cbiAgICAgIGVsc2UgeyBwcmV2ID0gdHlwZTsgfVxuICAgIH1cblxuICAgIC8vIFcyLiBTZWFyY2ggYmFja3dhcmRzIGZyb20gZWFjaCBpbnN0YW5jZSBvZiBhIEV1cm9wZWFuIG51bWJlclxuICAgIC8vIHVudGlsIHRoZSBmaXJzdCBzdHJvbmcgdHlwZSAoUiwgTCwgQUwsIG9yIHNvcikgaXMgZm91bmQuIElmIGFuXG4gICAgLy8gQUwgaXMgZm91bmQsIGNoYW5nZSB0aGUgdHlwZSBvZiB0aGUgRXVyb3BlYW4gbnVtYmVyIHRvIEFyYWJpY1xuICAgIC8vIG51bWJlci5cbiAgICAvLyBXMy4gQ2hhbmdlIGFsbCBBTHMgdG8gUi5cbiAgICBmb3IgKHZhciBpJDIgPSAwLCBjdXIgPSBvdXRlclR5cGU7IGkkMiA8IGxlbjsgKytpJDIpIHtcbiAgICAgIHZhciB0eXBlJDEgPSB0eXBlc1tpJDJdO1xuICAgICAgaWYgKHR5cGUkMSA9PSBcIjFcIiAmJiBjdXIgPT0gXCJyXCIpIHsgdHlwZXNbaSQyXSA9IFwiblwiOyB9XG4gICAgICBlbHNlIGlmIChpc1N0cm9uZy50ZXN0KHR5cGUkMSkpIHsgY3VyID0gdHlwZSQxOyBpZiAodHlwZSQxID09IFwiclwiKSB7IHR5cGVzW2kkMl0gPSBcIlJcIjsgfSB9XG4gICAgfVxuXG4gICAgLy8gVzQuIEEgc2luZ2xlIEV1cm9wZWFuIHNlcGFyYXRvciBiZXR3ZWVuIHR3byBFdXJvcGVhbiBudW1iZXJzXG4gICAgLy8gY2hhbmdlcyB0byBhIEV1cm9wZWFuIG51bWJlci4gQSBzaW5nbGUgY29tbW9uIHNlcGFyYXRvciBiZXR3ZWVuXG4gICAgLy8gdHdvIG51bWJlcnMgb2YgdGhlIHNhbWUgdHlwZSBjaGFuZ2VzIHRvIHRoYXQgdHlwZS5cbiAgICBmb3IgKHZhciBpJDMgPSAxLCBwcmV2JDEgPSB0eXBlc1swXTsgaSQzIDwgbGVuIC0gMTsgKytpJDMpIHtcbiAgICAgIHZhciB0eXBlJDIgPSB0eXBlc1tpJDNdO1xuICAgICAgaWYgKHR5cGUkMiA9PSBcIitcIiAmJiBwcmV2JDEgPT0gXCIxXCIgJiYgdHlwZXNbaSQzKzFdID09IFwiMVwiKSB7IHR5cGVzW2kkM10gPSBcIjFcIjsgfVxuICAgICAgZWxzZSBpZiAodHlwZSQyID09IFwiLFwiICYmIHByZXYkMSA9PSB0eXBlc1tpJDMrMV0gJiZcbiAgICAgICAgICAgICAgIChwcmV2JDEgPT0gXCIxXCIgfHwgcHJldiQxID09IFwiblwiKSkgeyB0eXBlc1tpJDNdID0gcHJldiQxOyB9XG4gICAgICBwcmV2JDEgPSB0eXBlJDI7XG4gICAgfVxuXG4gICAgLy8gVzUuIEEgc2VxdWVuY2Ugb2YgRXVyb3BlYW4gdGVybWluYXRvcnMgYWRqYWNlbnQgdG8gRXVyb3BlYW5cbiAgICAvLyBudW1iZXJzIGNoYW5nZXMgdG8gYWxsIEV1cm9wZWFuIG51bWJlcnMuXG4gICAgLy8gVzYuIE90aGVyd2lzZSwgc2VwYXJhdG9ycyBhbmQgdGVybWluYXRvcnMgY2hhbmdlIHRvIE90aGVyXG4gICAgLy8gTmV1dHJhbC5cbiAgICBmb3IgKHZhciBpJDQgPSAwOyBpJDQgPCBsZW47ICsraSQ0KSB7XG4gICAgICB2YXIgdHlwZSQzID0gdHlwZXNbaSQ0XTtcbiAgICAgIGlmICh0eXBlJDMgPT0gXCIsXCIpIHsgdHlwZXNbaSQ0XSA9IFwiTlwiOyB9XG4gICAgICBlbHNlIGlmICh0eXBlJDMgPT0gXCIlXCIpIHtcbiAgICAgICAgdmFyIGVuZCA9ICh2b2lkIDApO1xuICAgICAgICBmb3IgKGVuZCA9IGkkNCArIDE7IGVuZCA8IGxlbiAmJiB0eXBlc1tlbmRdID09IFwiJVwiOyArK2VuZCkge31cbiAgICAgICAgdmFyIHJlcGxhY2UgPSAoaSQ0ICYmIHR5cGVzW2kkNC0xXSA9PSBcIiFcIikgfHwgKGVuZCA8IGxlbiAmJiB0eXBlc1tlbmRdID09IFwiMVwiKSA/IFwiMVwiIDogXCJOXCI7XG4gICAgICAgIGZvciAodmFyIGogPSBpJDQ7IGogPCBlbmQ7ICsraikgeyB0eXBlc1tqXSA9IHJlcGxhY2U7IH1cbiAgICAgICAgaSQ0ID0gZW5kIC0gMTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBXNy4gU2VhcmNoIGJhY2t3YXJkcyBmcm9tIGVhY2ggaW5zdGFuY2Ugb2YgYSBFdXJvcGVhbiBudW1iZXJcbiAgICAvLyB1bnRpbCB0aGUgZmlyc3Qgc3Ryb25nIHR5cGUgKFIsIEwsIG9yIHNvcikgaXMgZm91bmQuIElmIGFuIEwgaXNcbiAgICAvLyBmb3VuZCwgdGhlbiBjaGFuZ2UgdGhlIHR5cGUgb2YgdGhlIEV1cm9wZWFuIG51bWJlciB0byBMLlxuICAgIGZvciAodmFyIGkkNSA9IDAsIGN1ciQxID0gb3V0ZXJUeXBlOyBpJDUgPCBsZW47ICsraSQ1KSB7XG4gICAgICB2YXIgdHlwZSQ0ID0gdHlwZXNbaSQ1XTtcbiAgICAgIGlmIChjdXIkMSA9PSBcIkxcIiAmJiB0eXBlJDQgPT0gXCIxXCIpIHsgdHlwZXNbaSQ1XSA9IFwiTFwiOyB9XG4gICAgICBlbHNlIGlmIChpc1N0cm9uZy50ZXN0KHR5cGUkNCkpIHsgY3VyJDEgPSB0eXBlJDQ7IH1cbiAgICB9XG5cbiAgICAvLyBOMS4gQSBzZXF1ZW5jZSBvZiBuZXV0cmFscyB0YWtlcyB0aGUgZGlyZWN0aW9uIG9mIHRoZVxuICAgIC8vIHN1cnJvdW5kaW5nIHN0cm9uZyB0ZXh0IGlmIHRoZSB0ZXh0IG9uIGJvdGggc2lkZXMgaGFzIHRoZSBzYW1lXG4gICAgLy8gZGlyZWN0aW9uLiBFdXJvcGVhbiBhbmQgQXJhYmljIG51bWJlcnMgYWN0IGFzIGlmIHRoZXkgd2VyZSBSIGluXG4gICAgLy8gdGVybXMgb2YgdGhlaXIgaW5mbHVlbmNlIG9uIG5ldXRyYWxzLiBTdGFydC1vZi1sZXZlbC1ydW4gKHNvcilcbiAgICAvLyBhbmQgZW5kLW9mLWxldmVsLXJ1biAoZW9yKSBhcmUgdXNlZCBhdCBsZXZlbCBydW4gYm91bmRhcmllcy5cbiAgICAvLyBOMi4gQW55IHJlbWFpbmluZyBuZXV0cmFscyB0YWtlIHRoZSBlbWJlZGRpbmcgZGlyZWN0aW9uLlxuICAgIGZvciAodmFyIGkkNiA9IDA7IGkkNiA8IGxlbjsgKytpJDYpIHtcbiAgICAgIGlmIChpc05ldXRyYWwudGVzdCh0eXBlc1tpJDZdKSkge1xuICAgICAgICB2YXIgZW5kJDEgPSAodm9pZCAwKTtcbiAgICAgICAgZm9yIChlbmQkMSA9IGkkNiArIDE7IGVuZCQxIDwgbGVuICYmIGlzTmV1dHJhbC50ZXN0KHR5cGVzW2VuZCQxXSk7ICsrZW5kJDEpIHt9XG4gICAgICAgIHZhciBiZWZvcmUgPSAoaSQ2ID8gdHlwZXNbaSQ2LTFdIDogb3V0ZXJUeXBlKSA9PSBcIkxcIjtcbiAgICAgICAgdmFyIGFmdGVyID0gKGVuZCQxIDwgbGVuID8gdHlwZXNbZW5kJDFdIDogb3V0ZXJUeXBlKSA9PSBcIkxcIjtcbiAgICAgICAgdmFyIHJlcGxhY2UkMSA9IGJlZm9yZSA9PSBhZnRlciA/IChiZWZvcmUgPyBcIkxcIiA6IFwiUlwiKSA6IG91dGVyVHlwZTtcbiAgICAgICAgZm9yICh2YXIgaiQxID0gaSQ2OyBqJDEgPCBlbmQkMTsgKytqJDEpIHsgdHlwZXNbaiQxXSA9IHJlcGxhY2UkMTsgfVxuICAgICAgICBpJDYgPSBlbmQkMSAtIDE7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gSGVyZSB3ZSBkZXBhcnQgZnJvbSB0aGUgZG9jdW1lbnRlZCBhbGdvcml0aG0sIGluIG9yZGVyIHRvIGF2b2lkXG4gICAgLy8gYnVpbGRpbmcgdXAgYW4gYWN0dWFsIGxldmVscyBhcnJheS4gU2luY2UgdGhlcmUgYXJlIG9ubHkgdGhyZWVcbiAgICAvLyBsZXZlbHMgKDAsIDEsIDIpIGluIGFuIGltcGxlbWVudGF0aW9uIHRoYXQgZG9lc24ndCB0YWtlXG4gICAgLy8gZXhwbGljaXQgZW1iZWRkaW5nIGludG8gYWNjb3VudCwgd2UgY2FuIGJ1aWxkIHVwIHRoZSBvcmRlciBvblxuICAgIC8vIHRoZSBmbHksIHdpdGhvdXQgZm9sbG93aW5nIHRoZSBsZXZlbC1iYXNlZCBhbGdvcml0aG0uXG4gICAgdmFyIG9yZGVyID0gW10sIG07XG4gICAgZm9yICh2YXIgaSQ3ID0gMDsgaSQ3IDwgbGVuOykge1xuICAgICAgaWYgKGNvdW50c0FzTGVmdC50ZXN0KHR5cGVzW2kkN10pKSB7XG4gICAgICAgIHZhciBzdGFydCA9IGkkNztcbiAgICAgICAgZm9yICgrK2kkNzsgaSQ3IDwgbGVuICYmIGNvdW50c0FzTGVmdC50ZXN0KHR5cGVzW2kkN10pOyArK2kkNykge31cbiAgICAgICAgb3JkZXIucHVzaChuZXcgQmlkaVNwYW4oMCwgc3RhcnQsIGkkNykpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIHBvcyA9IGkkNywgYXQgPSBvcmRlci5sZW5ndGg7XG4gICAgICAgIGZvciAoKytpJDc7IGkkNyA8IGxlbiAmJiB0eXBlc1tpJDddICE9IFwiTFwiOyArK2kkNykge31cbiAgICAgICAgZm9yICh2YXIgaiQyID0gcG9zOyBqJDIgPCBpJDc7KSB7XG4gICAgICAgICAgaWYgKGNvdW50c0FzTnVtLnRlc3QodHlwZXNbaiQyXSkpIHtcbiAgICAgICAgICAgIGlmIChwb3MgPCBqJDIpIHsgb3JkZXIuc3BsaWNlKGF0LCAwLCBuZXcgQmlkaVNwYW4oMSwgcG9zLCBqJDIpKTsgfVxuICAgICAgICAgICAgdmFyIG5zdGFydCA9IGokMjtcbiAgICAgICAgICAgIGZvciAoKytqJDI7IGokMiA8IGkkNyAmJiBjb3VudHNBc051bS50ZXN0KHR5cGVzW2okMl0pOyArK2okMikge31cbiAgICAgICAgICAgIG9yZGVyLnNwbGljZShhdCwgMCwgbmV3IEJpZGlTcGFuKDIsIG5zdGFydCwgaiQyKSk7XG4gICAgICAgICAgICBwb3MgPSBqJDI7XG4gICAgICAgICAgfSBlbHNlIHsgKytqJDI7IH1cbiAgICAgICAgfVxuICAgICAgICBpZiAocG9zIDwgaSQ3KSB7IG9yZGVyLnNwbGljZShhdCwgMCwgbmV3IEJpZGlTcGFuKDEsIHBvcywgaSQ3KSk7IH1cbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKGRpcmVjdGlvbiA9PSBcImx0clwiKSB7XG4gICAgICBpZiAob3JkZXJbMF0ubGV2ZWwgPT0gMSAmJiAobSA9IHN0ci5tYXRjaCgvXlxccysvKSkpIHtcbiAgICAgICAgb3JkZXJbMF0uZnJvbSA9IG1bMF0ubGVuZ3RoO1xuICAgICAgICBvcmRlci51bnNoaWZ0KG5ldyBCaWRpU3BhbigwLCAwLCBtWzBdLmxlbmd0aCkpO1xuICAgICAgfVxuICAgICAgaWYgKGxzdChvcmRlcikubGV2ZWwgPT0gMSAmJiAobSA9IHN0ci5tYXRjaCgvXFxzKyQvKSkpIHtcbiAgICAgICAgbHN0KG9yZGVyKS50byAtPSBtWzBdLmxlbmd0aDtcbiAgICAgICAgb3JkZXIucHVzaChuZXcgQmlkaVNwYW4oMCwgbGVuIC0gbVswXS5sZW5ndGgsIGxlbikpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBkaXJlY3Rpb24gPT0gXCJydGxcIiA/IG9yZGVyLnJldmVyc2UoKSA6IG9yZGVyXG4gIH1cbn0pKCk7XG5cbi8vIEdldCB0aGUgYmlkaSBvcmRlcmluZyBmb3IgdGhlIGdpdmVuIGxpbmUgKGFuZCBjYWNoZSBpdCkuIFJldHVybnNcbi8vIGZhbHNlIGZvciBsaW5lcyB0aGF0IGFyZSBmdWxseSBsZWZ0LXRvLXJpZ2h0LCBhbmQgYW4gYXJyYXkgb2Zcbi8vIEJpZGlTcGFuIG9iamVjdHMgb3RoZXJ3aXNlLlxuZnVuY3Rpb24gZ2V0T3JkZXIobGluZSwgZGlyZWN0aW9uKSB7XG4gIHZhciBvcmRlciA9IGxpbmUub3JkZXI7XG4gIGlmIChvcmRlciA9PSBudWxsKSB7IG9yZGVyID0gbGluZS5vcmRlciA9IGJpZGlPcmRlcmluZyhsaW5lLnRleHQsIGRpcmVjdGlvbik7IH1cbiAgcmV0dXJuIG9yZGVyXG59XG5cbi8vIEVWRU5UIEhBTkRMSU5HXG5cbi8vIExpZ2h0d2VpZ2h0IGV2ZW50IGZyYW1ld29yay4gb24vb2ZmIGFsc28gd29yayBvbiBET00gbm9kZXMsXG4vLyByZWdpc3RlcmluZyBuYXRpdmUgRE9NIGhhbmRsZXJzLlxuXG52YXIgbm9IYW5kbGVycyA9IFtdO1xuXG52YXIgb24gPSBmdW5jdGlvbihlbWl0dGVyLCB0eXBlLCBmKSB7XG4gIGlmIChlbWl0dGVyLmFkZEV2ZW50TGlzdGVuZXIpIHtcbiAgICBlbWl0dGVyLmFkZEV2ZW50TGlzdGVuZXIodHlwZSwgZiwgZmFsc2UpO1xuICB9IGVsc2UgaWYgKGVtaXR0ZXIuYXR0YWNoRXZlbnQpIHtcbiAgICBlbWl0dGVyLmF0dGFjaEV2ZW50KFwib25cIiArIHR5cGUsIGYpO1xuICB9IGVsc2Uge1xuICAgIHZhciBtYXAkJDEgPSBlbWl0dGVyLl9oYW5kbGVycyB8fCAoZW1pdHRlci5faGFuZGxlcnMgPSB7fSk7XG4gICAgbWFwJCQxW3R5cGVdID0gKG1hcCQkMVt0eXBlXSB8fCBub0hhbmRsZXJzKS5jb25jYXQoZik7XG4gIH1cbn07XG5cbmZ1bmN0aW9uIGdldEhhbmRsZXJzKGVtaXR0ZXIsIHR5cGUpIHtcbiAgcmV0dXJuIGVtaXR0ZXIuX2hhbmRsZXJzICYmIGVtaXR0ZXIuX2hhbmRsZXJzW3R5cGVdIHx8IG5vSGFuZGxlcnNcbn1cblxuZnVuY3Rpb24gb2ZmKGVtaXR0ZXIsIHR5cGUsIGYpIHtcbiAgaWYgKGVtaXR0ZXIucmVtb3ZlRXZlbnRMaXN0ZW5lcikge1xuICAgIGVtaXR0ZXIucmVtb3ZlRXZlbnRMaXN0ZW5lcih0eXBlLCBmLCBmYWxzZSk7XG4gIH0gZWxzZSBpZiAoZW1pdHRlci5kZXRhY2hFdmVudCkge1xuICAgIGVtaXR0ZXIuZGV0YWNoRXZlbnQoXCJvblwiICsgdHlwZSwgZik7XG4gIH0gZWxzZSB7XG4gICAgdmFyIG1hcCQkMSA9IGVtaXR0ZXIuX2hhbmRsZXJzLCBhcnIgPSBtYXAkJDEgJiYgbWFwJCQxW3R5cGVdO1xuICAgIGlmIChhcnIpIHtcbiAgICAgIHZhciBpbmRleCA9IGluZGV4T2YoYXJyLCBmKTtcbiAgICAgIGlmIChpbmRleCA+IC0xKVxuICAgICAgICB7IG1hcCQkMVt0eXBlXSA9IGFyci5zbGljZSgwLCBpbmRleCkuY29uY2F0KGFyci5zbGljZShpbmRleCArIDEpKTsgfVxuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBzaWduYWwoZW1pdHRlciwgdHlwZSAvKiwgdmFsdWVzLi4uKi8pIHtcbiAgdmFyIGhhbmRsZXJzID0gZ2V0SGFuZGxlcnMoZW1pdHRlciwgdHlwZSk7XG4gIGlmICghaGFuZGxlcnMubGVuZ3RoKSB7IHJldHVybiB9XG4gIHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAyKTtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBoYW5kbGVycy5sZW5ndGg7ICsraSkgeyBoYW5kbGVyc1tpXS5hcHBseShudWxsLCBhcmdzKTsgfVxufVxuXG4vLyBUaGUgRE9NIGV2ZW50cyB0aGF0IENvZGVNaXJyb3IgaGFuZGxlcyBjYW4gYmUgb3ZlcnJpZGRlbiBieVxuLy8gcmVnaXN0ZXJpbmcgYSAobm9uLURPTSkgaGFuZGxlciBvbiB0aGUgZWRpdG9yIGZvciB0aGUgZXZlbnQgbmFtZSxcbi8vIGFuZCBwcmV2ZW50RGVmYXVsdC1pbmcgdGhlIGV2ZW50IGluIHRoYXQgaGFuZGxlci5cbmZ1bmN0aW9uIHNpZ25hbERPTUV2ZW50KGNtLCBlLCBvdmVycmlkZSkge1xuICBpZiAodHlwZW9mIGUgPT0gXCJzdHJpbmdcIilcbiAgICB7IGUgPSB7dHlwZTogZSwgcHJldmVudERlZmF1bHQ6IGZ1bmN0aW9uKCkgeyB0aGlzLmRlZmF1bHRQcmV2ZW50ZWQgPSB0cnVlOyB9fTsgfVxuICBzaWduYWwoY20sIG92ZXJyaWRlIHx8IGUudHlwZSwgY20sIGUpO1xuICByZXR1cm4gZV9kZWZhdWx0UHJldmVudGVkKGUpIHx8IGUuY29kZW1pcnJvcklnbm9yZVxufVxuXG5mdW5jdGlvbiBzaWduYWxDdXJzb3JBY3Rpdml0eShjbSkge1xuICB2YXIgYXJyID0gY20uX2hhbmRsZXJzICYmIGNtLl9oYW5kbGVycy5jdXJzb3JBY3Rpdml0eTtcbiAgaWYgKCFhcnIpIHsgcmV0dXJuIH1cbiAgdmFyIHNldCA9IGNtLmN1ck9wLmN1cnNvckFjdGl2aXR5SGFuZGxlcnMgfHwgKGNtLmN1ck9wLmN1cnNvckFjdGl2aXR5SGFuZGxlcnMgPSBbXSk7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgYXJyLmxlbmd0aDsgKytpKSB7IGlmIChpbmRleE9mKHNldCwgYXJyW2ldKSA9PSAtMSlcbiAgICB7IHNldC5wdXNoKGFycltpXSk7IH0gfVxufVxuXG5mdW5jdGlvbiBoYXNIYW5kbGVyKGVtaXR0ZXIsIHR5cGUpIHtcbiAgcmV0dXJuIGdldEhhbmRsZXJzKGVtaXR0ZXIsIHR5cGUpLmxlbmd0aCA+IDBcbn1cblxuLy8gQWRkIG9uIGFuZCBvZmYgbWV0aG9kcyB0byBhIGNvbnN0cnVjdG9yJ3MgcHJvdG90eXBlLCB0byBtYWtlXG4vLyByZWdpc3RlcmluZyBldmVudHMgb24gc3VjaCBvYmplY3RzIG1vcmUgY29udmVuaWVudC5cbmZ1bmN0aW9uIGV2ZW50TWl4aW4oY3Rvcikge1xuICBjdG9yLnByb3RvdHlwZS5vbiA9IGZ1bmN0aW9uKHR5cGUsIGYpIHtvbih0aGlzLCB0eXBlLCBmKTt9O1xuICBjdG9yLnByb3RvdHlwZS5vZmYgPSBmdW5jdGlvbih0eXBlLCBmKSB7b2ZmKHRoaXMsIHR5cGUsIGYpO307XG59XG5cbi8vIER1ZSB0byB0aGUgZmFjdCB0aGF0IHdlIHN0aWxsIHN1cHBvcnQganVyYXNzaWMgSUUgdmVyc2lvbnMsIHNvbWVcbi8vIGNvbXBhdGliaWxpdHkgd3JhcHBlcnMgYXJlIG5lZWRlZC5cblxuZnVuY3Rpb24gZV9wcmV2ZW50RGVmYXVsdChlKSB7XG4gIGlmIChlLnByZXZlbnREZWZhdWx0KSB7IGUucHJldmVudERlZmF1bHQoKTsgfVxuICBlbHNlIHsgZS5yZXR1cm5WYWx1ZSA9IGZhbHNlOyB9XG59XG5mdW5jdGlvbiBlX3N0b3BQcm9wYWdhdGlvbihlKSB7XG4gIGlmIChlLnN0b3BQcm9wYWdhdGlvbikgeyBlLnN0b3BQcm9wYWdhdGlvbigpOyB9XG4gIGVsc2UgeyBlLmNhbmNlbEJ1YmJsZSA9IHRydWU7IH1cbn1cbmZ1bmN0aW9uIGVfZGVmYXVsdFByZXZlbnRlZChlKSB7XG4gIHJldHVybiBlLmRlZmF1bHRQcmV2ZW50ZWQgIT0gbnVsbCA/IGUuZGVmYXVsdFByZXZlbnRlZCA6IGUucmV0dXJuVmFsdWUgPT0gZmFsc2Vcbn1cbmZ1bmN0aW9uIGVfc3RvcChlKSB7ZV9wcmV2ZW50RGVmYXVsdChlKTsgZV9zdG9wUHJvcGFnYXRpb24oZSk7fVxuXG5mdW5jdGlvbiBlX3RhcmdldChlKSB7cmV0dXJuIGUudGFyZ2V0IHx8IGUuc3JjRWxlbWVudH1cbmZ1bmN0aW9uIGVfYnV0dG9uKGUpIHtcbiAgdmFyIGIgPSBlLndoaWNoO1xuICBpZiAoYiA9PSBudWxsKSB7XG4gICAgaWYgKGUuYnV0dG9uICYgMSkgeyBiID0gMTsgfVxuICAgIGVsc2UgaWYgKGUuYnV0dG9uICYgMikgeyBiID0gMzsgfVxuICAgIGVsc2UgaWYgKGUuYnV0dG9uICYgNCkgeyBiID0gMjsgfVxuICB9XG4gIGlmIChtYWMgJiYgZS5jdHJsS2V5ICYmIGIgPT0gMSkgeyBiID0gMzsgfVxuICByZXR1cm4gYlxufVxuXG4vLyBEZXRlY3QgZHJhZy1hbmQtZHJvcFxudmFyIGRyYWdBbmREcm9wID0gZnVuY3Rpb24oKSB7XG4gIC8vIFRoZXJlIGlzICpzb21lKiBraW5kIG9mIGRyYWctYW5kLWRyb3Agc3VwcG9ydCBpbiBJRTYtOCwgYnV0IElcbiAgLy8gY291bGRuJ3QgZ2V0IGl0IHRvIHdvcmsgeWV0LlxuICBpZiAoaWUgJiYgaWVfdmVyc2lvbiA8IDkpIHsgcmV0dXJuIGZhbHNlIH1cbiAgdmFyIGRpdiA9IGVsdCgnZGl2Jyk7XG4gIHJldHVybiBcImRyYWdnYWJsZVwiIGluIGRpdiB8fCBcImRyYWdEcm9wXCIgaW4gZGl2XG59KCk7XG5cbnZhciB6d3NwU3VwcG9ydGVkO1xuZnVuY3Rpb24gemVyb1dpZHRoRWxlbWVudChtZWFzdXJlKSB7XG4gIGlmICh6d3NwU3VwcG9ydGVkID09IG51bGwpIHtcbiAgICB2YXIgdGVzdCA9IGVsdChcInNwYW5cIiwgXCJcXHUyMDBiXCIpO1xuICAgIHJlbW92ZUNoaWxkcmVuQW5kQWRkKG1lYXN1cmUsIGVsdChcInNwYW5cIiwgW3Rlc3QsIGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKFwieFwiKV0pKTtcbiAgICBpZiAobWVhc3VyZS5maXJzdENoaWxkLm9mZnNldEhlaWdodCAhPSAwKVxuICAgICAgeyB6d3NwU3VwcG9ydGVkID0gdGVzdC5vZmZzZXRXaWR0aCA8PSAxICYmIHRlc3Qub2Zmc2V0SGVpZ2h0ID4gMiAmJiAhKGllICYmIGllX3ZlcnNpb24gPCA4KTsgfVxuICB9XG4gIHZhciBub2RlID0gendzcFN1cHBvcnRlZCA/IGVsdChcInNwYW5cIiwgXCJcXHUyMDBiXCIpIDpcbiAgICBlbHQoXCJzcGFuXCIsIFwiXFx1MDBhMFwiLCBudWxsLCBcImRpc3BsYXk6IGlubGluZS1ibG9jazsgd2lkdGg6IDFweDsgbWFyZ2luLXJpZ2h0OiAtMXB4XCIpO1xuICBub2RlLnNldEF0dHJpYnV0ZShcImNtLXRleHRcIiwgXCJcIik7XG4gIHJldHVybiBub2RlXG59XG5cbi8vIEZlYXR1cmUtZGV0ZWN0IElFJ3MgY3J1bW15IGNsaWVudCByZWN0IHJlcG9ydGluZyBmb3IgYmlkaSB0ZXh0XG52YXIgYmFkQmlkaVJlY3RzO1xuZnVuY3Rpb24gaGFzQmFkQmlkaVJlY3RzKG1lYXN1cmUpIHtcbiAgaWYgKGJhZEJpZGlSZWN0cyAhPSBudWxsKSB7IHJldHVybiBiYWRCaWRpUmVjdHMgfVxuICB2YXIgdHh0ID0gcmVtb3ZlQ2hpbGRyZW5BbmRBZGQobWVhc3VyZSwgZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoXCJBXFx1MDYyZUFcIikpO1xuICB2YXIgcjAgPSByYW5nZSh0eHQsIDAsIDEpLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICB2YXIgcjEgPSByYW5nZSh0eHQsIDEsIDIpLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICByZW1vdmVDaGlsZHJlbihtZWFzdXJlKTtcbiAgaWYgKCFyMCB8fCByMC5sZWZ0ID09IHIwLnJpZ2h0KSB7IHJldHVybiBmYWxzZSB9IC8vIFNhZmFyaSByZXR1cm5zIG51bGwgaW4gc29tZSBjYXNlcyAoIzI3ODApXG4gIHJldHVybiBiYWRCaWRpUmVjdHMgPSAocjEucmlnaHQgLSByMC5yaWdodCA8IDMpXG59XG5cbi8vIFNlZSBpZiBcIlwiLnNwbGl0IGlzIHRoZSBicm9rZW4gSUUgdmVyc2lvbiwgaWYgc28sIHByb3ZpZGUgYW5cbi8vIGFsdGVybmF0aXZlIHdheSB0byBzcGxpdCBsaW5lcy5cbnZhciBzcGxpdExpbmVzQXV0byA9IFwiXFxuXFxuYlwiLnNwbGl0KC9cXG4vKS5sZW5ndGggIT0gMyA/IGZ1bmN0aW9uIChzdHJpbmcpIHtcbiAgdmFyIHBvcyA9IDAsIHJlc3VsdCA9IFtdLCBsID0gc3RyaW5nLmxlbmd0aDtcbiAgd2hpbGUgKHBvcyA8PSBsKSB7XG4gICAgdmFyIG5sID0gc3RyaW5nLmluZGV4T2YoXCJcXG5cIiwgcG9zKTtcbiAgICBpZiAobmwgPT0gLTEpIHsgbmwgPSBzdHJpbmcubGVuZ3RoOyB9XG4gICAgdmFyIGxpbmUgPSBzdHJpbmcuc2xpY2UocG9zLCBzdHJpbmcuY2hhckF0KG5sIC0gMSkgPT0gXCJcXHJcIiA/IG5sIC0gMSA6IG5sKTtcbiAgICB2YXIgcnQgPSBsaW5lLmluZGV4T2YoXCJcXHJcIik7XG4gICAgaWYgKHJ0ICE9IC0xKSB7XG4gICAgICByZXN1bHQucHVzaChsaW5lLnNsaWNlKDAsIHJ0KSk7XG4gICAgICBwb3MgKz0gcnQgKyAxO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXN1bHQucHVzaChsaW5lKTtcbiAgICAgIHBvcyA9IG5sICsgMTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHJlc3VsdFxufSA6IGZ1bmN0aW9uIChzdHJpbmcpIHsgcmV0dXJuIHN0cmluZy5zcGxpdCgvXFxyXFxuP3xcXG4vKTsgfTtcblxudmFyIGhhc1NlbGVjdGlvbiA9IHdpbmRvdy5nZXRTZWxlY3Rpb24gPyBmdW5jdGlvbiAodGUpIHtcbiAgdHJ5IHsgcmV0dXJuIHRlLnNlbGVjdGlvblN0YXJ0ICE9IHRlLnNlbGVjdGlvbkVuZCB9XG4gIGNhdGNoKGUpIHsgcmV0dXJuIGZhbHNlIH1cbn0gOiBmdW5jdGlvbiAodGUpIHtcbiAgdmFyIHJhbmdlJCQxO1xuICB0cnkge3JhbmdlJCQxID0gdGUub3duZXJEb2N1bWVudC5zZWxlY3Rpb24uY3JlYXRlUmFuZ2UoKTt9XG4gIGNhdGNoKGUpIHt9XG4gIGlmICghcmFuZ2UkJDEgfHwgcmFuZ2UkJDEucGFyZW50RWxlbWVudCgpICE9IHRlKSB7IHJldHVybiBmYWxzZSB9XG4gIHJldHVybiByYW5nZSQkMS5jb21wYXJlRW5kUG9pbnRzKFwiU3RhcnRUb0VuZFwiLCByYW5nZSQkMSkgIT0gMFxufTtcblxudmFyIGhhc0NvcHlFdmVudCA9IChmdW5jdGlvbiAoKSB7XG4gIHZhciBlID0gZWx0KFwiZGl2XCIpO1xuICBpZiAoXCJvbmNvcHlcIiBpbiBlKSB7IHJldHVybiB0cnVlIH1cbiAgZS5zZXRBdHRyaWJ1dGUoXCJvbmNvcHlcIiwgXCJyZXR1cm47XCIpO1xuICByZXR1cm4gdHlwZW9mIGUub25jb3B5ID09IFwiZnVuY3Rpb25cIlxufSkoKTtcblxudmFyIGJhZFpvb21lZFJlY3RzID0gbnVsbDtcbmZ1bmN0aW9uIGhhc0JhZFpvb21lZFJlY3RzKG1lYXN1cmUpIHtcbiAgaWYgKGJhZFpvb21lZFJlY3RzICE9IG51bGwpIHsgcmV0dXJuIGJhZFpvb21lZFJlY3RzIH1cbiAgdmFyIG5vZGUgPSByZW1vdmVDaGlsZHJlbkFuZEFkZChtZWFzdXJlLCBlbHQoXCJzcGFuXCIsIFwieFwiKSk7XG4gIHZhciBub3JtYWwgPSBub2RlLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICB2YXIgZnJvbVJhbmdlID0gcmFuZ2Uobm9kZSwgMCwgMSkuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gIHJldHVybiBiYWRab29tZWRSZWN0cyA9IE1hdGguYWJzKG5vcm1hbC5sZWZ0IC0gZnJvbVJhbmdlLmxlZnQpID4gMVxufVxuXG4vLyBLbm93biBtb2RlcywgYnkgbmFtZSBhbmQgYnkgTUlNRVxudmFyIG1vZGVzID0ge307XG52YXIgbWltZU1vZGVzID0ge307XG5cbi8vIEV4dHJhIGFyZ3VtZW50cyBhcmUgc3RvcmVkIGFzIHRoZSBtb2RlJ3MgZGVwZW5kZW5jaWVzLCB3aGljaCBpc1xuLy8gdXNlZCBieSAobGVnYWN5KSBtZWNoYW5pc21zIGxpa2UgbG9hZG1vZGUuanMgdG8gYXV0b21hdGljYWxseVxuLy8gbG9hZCBhIG1vZGUuIChQcmVmZXJyZWQgbWVjaGFuaXNtIGlzIHRoZSByZXF1aXJlL2RlZmluZSBjYWxscy4pXG5mdW5jdGlvbiBkZWZpbmVNb2RlKG5hbWUsIG1vZGUpIHtcbiAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPiAyKVxuICAgIHsgbW9kZS5kZXBlbmRlbmNpZXMgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDIpOyB9XG4gIG1vZGVzW25hbWVdID0gbW9kZTtcbn1cblxuZnVuY3Rpb24gZGVmaW5lTUlNRShtaW1lLCBzcGVjKSB7XG4gIG1pbWVNb2Rlc1ttaW1lXSA9IHNwZWM7XG59XG5cbi8vIEdpdmVuIGEgTUlNRSB0eXBlLCBhIHtuYW1lLCAuLi5vcHRpb25zfSBjb25maWcgb2JqZWN0LCBvciBhIG5hbWVcbi8vIHN0cmluZywgcmV0dXJuIGEgbW9kZSBjb25maWcgb2JqZWN0LlxuZnVuY3Rpb24gcmVzb2x2ZU1vZGUoc3BlYykge1xuICBpZiAodHlwZW9mIHNwZWMgPT0gXCJzdHJpbmdcIiAmJiBtaW1lTW9kZXMuaGFzT3duUHJvcGVydHkoc3BlYykpIHtcbiAgICBzcGVjID0gbWltZU1vZGVzW3NwZWNdO1xuICB9IGVsc2UgaWYgKHNwZWMgJiYgdHlwZW9mIHNwZWMubmFtZSA9PSBcInN0cmluZ1wiICYmIG1pbWVNb2Rlcy5oYXNPd25Qcm9wZXJ0eShzcGVjLm5hbWUpKSB7XG4gICAgdmFyIGZvdW5kID0gbWltZU1vZGVzW3NwZWMubmFtZV07XG4gICAgaWYgKHR5cGVvZiBmb3VuZCA9PSBcInN0cmluZ1wiKSB7IGZvdW5kID0ge25hbWU6IGZvdW5kfTsgfVxuICAgIHNwZWMgPSBjcmVhdGVPYmooZm91bmQsIHNwZWMpO1xuICAgIHNwZWMubmFtZSA9IGZvdW5kLm5hbWU7XG4gIH0gZWxzZSBpZiAodHlwZW9mIHNwZWMgPT0gXCJzdHJpbmdcIiAmJiAvXltcXHdcXC1dK1xcL1tcXHdcXC1dK1xcK3htbCQvLnRlc3Qoc3BlYykpIHtcbiAgICByZXR1cm4gcmVzb2x2ZU1vZGUoXCJhcHBsaWNhdGlvbi94bWxcIilcbiAgfSBlbHNlIGlmICh0eXBlb2Ygc3BlYyA9PSBcInN0cmluZ1wiICYmIC9eW1xcd1xcLV0rXFwvW1xcd1xcLV0rXFwranNvbiQvLnRlc3Qoc3BlYykpIHtcbiAgICByZXR1cm4gcmVzb2x2ZU1vZGUoXCJhcHBsaWNhdGlvbi9qc29uXCIpXG4gIH1cbiAgaWYgKHR5cGVvZiBzcGVjID09IFwic3RyaW5nXCIpIHsgcmV0dXJuIHtuYW1lOiBzcGVjfSB9XG4gIGVsc2UgeyByZXR1cm4gc3BlYyB8fCB7bmFtZTogXCJudWxsXCJ9IH1cbn1cblxuLy8gR2l2ZW4gYSBtb2RlIHNwZWMgKGFueXRoaW5nIHRoYXQgcmVzb2x2ZU1vZGUgYWNjZXB0cyksIGZpbmQgYW5kXG4vLyBpbml0aWFsaXplIGFuIGFjdHVhbCBtb2RlIG9iamVjdC5cbmZ1bmN0aW9uIGdldE1vZGUob3B0aW9ucywgc3BlYykge1xuICBzcGVjID0gcmVzb2x2ZU1vZGUoc3BlYyk7XG4gIHZhciBtZmFjdG9yeSA9IG1vZGVzW3NwZWMubmFtZV07XG4gIGlmICghbWZhY3RvcnkpIHsgcmV0dXJuIGdldE1vZGUob3B0aW9ucywgXCJ0ZXh0L3BsYWluXCIpIH1cbiAgdmFyIG1vZGVPYmogPSBtZmFjdG9yeShvcHRpb25zLCBzcGVjKTtcbiAgaWYgKG1vZGVFeHRlbnNpb25zLmhhc093blByb3BlcnR5KHNwZWMubmFtZSkpIHtcbiAgICB2YXIgZXh0cyA9IG1vZGVFeHRlbnNpb25zW3NwZWMubmFtZV07XG4gICAgZm9yICh2YXIgcHJvcCBpbiBleHRzKSB7XG4gICAgICBpZiAoIWV4dHMuaGFzT3duUHJvcGVydHkocHJvcCkpIHsgY29udGludWUgfVxuICAgICAgaWYgKG1vZGVPYmouaGFzT3duUHJvcGVydHkocHJvcCkpIHsgbW9kZU9ialtcIl9cIiArIHByb3BdID0gbW9kZU9ialtwcm9wXTsgfVxuICAgICAgbW9kZU9ialtwcm9wXSA9IGV4dHNbcHJvcF07XG4gICAgfVxuICB9XG4gIG1vZGVPYmoubmFtZSA9IHNwZWMubmFtZTtcbiAgaWYgKHNwZWMuaGVscGVyVHlwZSkgeyBtb2RlT2JqLmhlbHBlclR5cGUgPSBzcGVjLmhlbHBlclR5cGU7IH1cbiAgaWYgKHNwZWMubW9kZVByb3BzKSB7IGZvciAodmFyIHByb3AkMSBpbiBzcGVjLm1vZGVQcm9wcylcbiAgICB7IG1vZGVPYmpbcHJvcCQxXSA9IHNwZWMubW9kZVByb3BzW3Byb3AkMV07IH0gfVxuXG4gIHJldHVybiBtb2RlT2JqXG59XG5cbi8vIFRoaXMgY2FuIGJlIHVzZWQgdG8gYXR0YWNoIHByb3BlcnRpZXMgdG8gbW9kZSBvYmplY3RzIGZyb21cbi8vIG91dHNpZGUgdGhlIGFjdHVhbCBtb2RlIGRlZmluaXRpb24uXG52YXIgbW9kZUV4dGVuc2lvbnMgPSB7fTtcbmZ1bmN0aW9uIGV4dGVuZE1vZGUobW9kZSwgcHJvcGVydGllcykge1xuICB2YXIgZXh0cyA9IG1vZGVFeHRlbnNpb25zLmhhc093blByb3BlcnR5KG1vZGUpID8gbW9kZUV4dGVuc2lvbnNbbW9kZV0gOiAobW9kZUV4dGVuc2lvbnNbbW9kZV0gPSB7fSk7XG4gIGNvcHlPYmoocHJvcGVydGllcywgZXh0cyk7XG59XG5cbmZ1bmN0aW9uIGNvcHlTdGF0ZShtb2RlLCBzdGF0ZSkge1xuICBpZiAoc3RhdGUgPT09IHRydWUpIHsgcmV0dXJuIHN0YXRlIH1cbiAgaWYgKG1vZGUuY29weVN0YXRlKSB7IHJldHVybiBtb2RlLmNvcHlTdGF0ZShzdGF0ZSkgfVxuICB2YXIgbnN0YXRlID0ge307XG4gIGZvciAodmFyIG4gaW4gc3RhdGUpIHtcbiAgICB2YXIgdmFsID0gc3RhdGVbbl07XG4gICAgaWYgKHZhbCBpbnN0YW5jZW9mIEFycmF5KSB7IHZhbCA9IHZhbC5jb25jYXQoW10pOyB9XG4gICAgbnN0YXRlW25dID0gdmFsO1xuICB9XG4gIHJldHVybiBuc3RhdGVcbn1cblxuLy8gR2l2ZW4gYSBtb2RlIGFuZCBhIHN0YXRlIChmb3IgdGhhdCBtb2RlKSwgZmluZCB0aGUgaW5uZXIgbW9kZSBhbmRcbi8vIHN0YXRlIGF0IHRoZSBwb3NpdGlvbiB0aGF0IHRoZSBzdGF0ZSByZWZlcnMgdG8uXG5mdW5jdGlvbiBpbm5lck1vZGUobW9kZSwgc3RhdGUpIHtcbiAgdmFyIGluZm87XG4gIHdoaWxlIChtb2RlLmlubmVyTW9kZSkge1xuICAgIGluZm8gPSBtb2RlLmlubmVyTW9kZShzdGF0ZSk7XG4gICAgaWYgKCFpbmZvIHx8IGluZm8ubW9kZSA9PSBtb2RlKSB7IGJyZWFrIH1cbiAgICBzdGF0ZSA9IGluZm8uc3RhdGU7XG4gICAgbW9kZSA9IGluZm8ubW9kZTtcbiAgfVxuICByZXR1cm4gaW5mbyB8fCB7bW9kZTogbW9kZSwgc3RhdGU6IHN0YXRlfVxufVxuXG5mdW5jdGlvbiBzdGFydFN0YXRlKG1vZGUsIGExLCBhMikge1xuICByZXR1cm4gbW9kZS5zdGFydFN0YXRlID8gbW9kZS5zdGFydFN0YXRlKGExLCBhMikgOiB0cnVlXG59XG5cbi8vIFNUUklORyBTVFJFQU1cblxuLy8gRmVkIHRvIHRoZSBtb2RlIHBhcnNlcnMsIHByb3ZpZGVzIGhlbHBlciBmdW5jdGlvbnMgdG8gbWFrZVxuLy8gcGFyc2VycyBtb3JlIHN1Y2NpbmN0LlxuXG52YXIgU3RyaW5nU3RyZWFtID0gZnVuY3Rpb24oc3RyaW5nLCB0YWJTaXplLCBsaW5lT3JhY2xlKSB7XG4gIHRoaXMucG9zID0gdGhpcy5zdGFydCA9IDA7XG4gIHRoaXMuc3RyaW5nID0gc3RyaW5nO1xuICB0aGlzLnRhYlNpemUgPSB0YWJTaXplIHx8IDg7XG4gIHRoaXMubGFzdENvbHVtblBvcyA9IHRoaXMubGFzdENvbHVtblZhbHVlID0gMDtcbiAgdGhpcy5saW5lU3RhcnQgPSAwO1xuICB0aGlzLmxpbmVPcmFjbGUgPSBsaW5lT3JhY2xlO1xufTtcblxuU3RyaW5nU3RyZWFtLnByb3RvdHlwZS5lb2wgPSBmdW5jdGlvbiAoKSB7cmV0dXJuIHRoaXMucG9zID49IHRoaXMuc3RyaW5nLmxlbmd0aH07XG5TdHJpbmdTdHJlYW0ucHJvdG90eXBlLnNvbCA9IGZ1bmN0aW9uICgpIHtyZXR1cm4gdGhpcy5wb3MgPT0gdGhpcy5saW5lU3RhcnR9O1xuU3RyaW5nU3RyZWFtLnByb3RvdHlwZS5wZWVrID0gZnVuY3Rpb24gKCkge3JldHVybiB0aGlzLnN0cmluZy5jaGFyQXQodGhpcy5wb3MpIHx8IHVuZGVmaW5lZH07XG5TdHJpbmdTdHJlYW0ucHJvdG90eXBlLm5leHQgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLnBvcyA8IHRoaXMuc3RyaW5nLmxlbmd0aClcbiAgICB7IHJldHVybiB0aGlzLnN0cmluZy5jaGFyQXQodGhpcy5wb3MrKykgfVxufTtcblN0cmluZ1N0cmVhbS5wcm90b3R5cGUuZWF0ID0gZnVuY3Rpb24gKG1hdGNoKSB7XG4gIHZhciBjaCA9IHRoaXMuc3RyaW5nLmNoYXJBdCh0aGlzLnBvcyk7XG4gIHZhciBvaztcbiAgaWYgKHR5cGVvZiBtYXRjaCA9PSBcInN0cmluZ1wiKSB7IG9rID0gY2ggPT0gbWF0Y2g7IH1cbiAgZWxzZSB7IG9rID0gY2ggJiYgKG1hdGNoLnRlc3QgPyBtYXRjaC50ZXN0KGNoKSA6IG1hdGNoKGNoKSk7IH1cbiAgaWYgKG9rKSB7Kyt0aGlzLnBvczsgcmV0dXJuIGNofVxufTtcblN0cmluZ1N0cmVhbS5wcm90b3R5cGUuZWF0V2hpbGUgPSBmdW5jdGlvbiAobWF0Y2gpIHtcbiAgdmFyIHN0YXJ0ID0gdGhpcy5wb3M7XG4gIHdoaWxlICh0aGlzLmVhdChtYXRjaCkpe31cbiAgcmV0dXJuIHRoaXMucG9zID4gc3RhcnRcbn07XG5TdHJpbmdTdHJlYW0ucHJvdG90eXBlLmVhdFNwYWNlID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciB0aGlzJDEgPSB0aGlzO1xuXG4gIHZhciBzdGFydCA9IHRoaXMucG9zO1xuICB3aGlsZSAoL1tcXHNcXHUwMGEwXS8udGVzdCh0aGlzLnN0cmluZy5jaGFyQXQodGhpcy5wb3MpKSkgeyArK3RoaXMkMS5wb3M7IH1cbiAgcmV0dXJuIHRoaXMucG9zID4gc3RhcnRcbn07XG5TdHJpbmdTdHJlYW0ucHJvdG90eXBlLnNraXBUb0VuZCA9IGZ1bmN0aW9uICgpIHt0aGlzLnBvcyA9IHRoaXMuc3RyaW5nLmxlbmd0aDt9O1xuU3RyaW5nU3RyZWFtLnByb3RvdHlwZS5za2lwVG8gPSBmdW5jdGlvbiAoY2gpIHtcbiAgdmFyIGZvdW5kID0gdGhpcy5zdHJpbmcuaW5kZXhPZihjaCwgdGhpcy5wb3MpO1xuICBpZiAoZm91bmQgPiAtMSkge3RoaXMucG9zID0gZm91bmQ7IHJldHVybiB0cnVlfVxufTtcblN0cmluZ1N0cmVhbS5wcm90b3R5cGUuYmFja1VwID0gZnVuY3Rpb24gKG4pIHt0aGlzLnBvcyAtPSBuO307XG5TdHJpbmdTdHJlYW0ucHJvdG90eXBlLmNvbHVtbiA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMubGFzdENvbHVtblBvcyA8IHRoaXMuc3RhcnQpIHtcbiAgICB0aGlzLmxhc3RDb2x1bW5WYWx1ZSA9IGNvdW50Q29sdW1uKHRoaXMuc3RyaW5nLCB0aGlzLnN0YXJ0LCB0aGlzLnRhYlNpemUsIHRoaXMubGFzdENvbHVtblBvcywgdGhpcy5sYXN0Q29sdW1uVmFsdWUpO1xuICAgIHRoaXMubGFzdENvbHVtblBvcyA9IHRoaXMuc3RhcnQ7XG4gIH1cbiAgcmV0dXJuIHRoaXMubGFzdENvbHVtblZhbHVlIC0gKHRoaXMubGluZVN0YXJ0ID8gY291bnRDb2x1bW4odGhpcy5zdHJpbmcsIHRoaXMubGluZVN0YXJ0LCB0aGlzLnRhYlNpemUpIDogMClcbn07XG5TdHJpbmdTdHJlYW0ucHJvdG90eXBlLmluZGVudGF0aW9uID0gZnVuY3Rpb24gKCkge1xuICByZXR1cm4gY291bnRDb2x1bW4odGhpcy5zdHJpbmcsIG51bGwsIHRoaXMudGFiU2l6ZSkgLVxuICAgICh0aGlzLmxpbmVTdGFydCA/IGNvdW50Q29sdW1uKHRoaXMuc3RyaW5nLCB0aGlzLmxpbmVTdGFydCwgdGhpcy50YWJTaXplKSA6IDApXG59O1xuU3RyaW5nU3RyZWFtLnByb3RvdHlwZS5tYXRjaCA9IGZ1bmN0aW9uIChwYXR0ZXJuLCBjb25zdW1lLCBjYXNlSW5zZW5zaXRpdmUpIHtcbiAgaWYgKHR5cGVvZiBwYXR0ZXJuID09IFwic3RyaW5nXCIpIHtcbiAgICB2YXIgY2FzZWQgPSBmdW5jdGlvbiAoc3RyKSB7IHJldHVybiBjYXNlSW5zZW5zaXRpdmUgPyBzdHIudG9Mb3dlckNhc2UoKSA6IHN0cjsgfTtcbiAgICB2YXIgc3Vic3RyID0gdGhpcy5zdHJpbmcuc3Vic3RyKHRoaXMucG9zLCBwYXR0ZXJuLmxlbmd0aCk7XG4gICAgaWYgKGNhc2VkKHN1YnN0cikgPT0gY2FzZWQocGF0dGVybikpIHtcbiAgICAgIGlmIChjb25zdW1lICE9PSBmYWxzZSkgeyB0aGlzLnBvcyArPSBwYXR0ZXJuLmxlbmd0aDsgfVxuICAgICAgcmV0dXJuIHRydWVcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgdmFyIG1hdGNoID0gdGhpcy5zdHJpbmcuc2xpY2UodGhpcy5wb3MpLm1hdGNoKHBhdHRlcm4pO1xuICAgIGlmIChtYXRjaCAmJiBtYXRjaC5pbmRleCA+IDApIHsgcmV0dXJuIG51bGwgfVxuICAgIGlmIChtYXRjaCAmJiBjb25zdW1lICE9PSBmYWxzZSkgeyB0aGlzLnBvcyArPSBtYXRjaFswXS5sZW5ndGg7IH1cbiAgICByZXR1cm4gbWF0Y2hcbiAgfVxufTtcblN0cmluZ1N0cmVhbS5wcm90b3R5cGUuY3VycmVudCA9IGZ1bmN0aW9uICgpe3JldHVybiB0aGlzLnN0cmluZy5zbGljZSh0aGlzLnN0YXJ0LCB0aGlzLnBvcyl9O1xuU3RyaW5nU3RyZWFtLnByb3RvdHlwZS5oaWRlRmlyc3RDaGFycyA9IGZ1bmN0aW9uIChuLCBpbm5lcikge1xuICB0aGlzLmxpbmVTdGFydCArPSBuO1xuICB0cnkgeyByZXR1cm4gaW5uZXIoKSB9XG4gIGZpbmFsbHkgeyB0aGlzLmxpbmVTdGFydCAtPSBuOyB9XG59O1xuU3RyaW5nU3RyZWFtLnByb3RvdHlwZS5sb29rQWhlYWQgPSBmdW5jdGlvbiAobikge1xuICB2YXIgb3JhY2xlID0gdGhpcy5saW5lT3JhY2xlO1xuICByZXR1cm4gb3JhY2xlICYmIG9yYWNsZS5sb29rQWhlYWQobilcbn07XG5TdHJpbmdTdHJlYW0ucHJvdG90eXBlLmJhc2VUb2tlbiA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIG9yYWNsZSA9IHRoaXMubGluZU9yYWNsZTtcbiAgcmV0dXJuIG9yYWNsZSAmJiBvcmFjbGUuYmFzZVRva2VuKHRoaXMucG9zKVxufTtcblxudmFyIFNhdmVkQ29udGV4dCA9IGZ1bmN0aW9uKHN0YXRlLCBsb29rQWhlYWQpIHtcbiAgdGhpcy5zdGF0ZSA9IHN0YXRlO1xuICB0aGlzLmxvb2tBaGVhZCA9IGxvb2tBaGVhZDtcbn07XG5cbnZhciBDb250ZXh0ID0gZnVuY3Rpb24oZG9jLCBzdGF0ZSwgbGluZSwgbG9va0FoZWFkKSB7XG4gIHRoaXMuc3RhdGUgPSBzdGF0ZTtcbiAgdGhpcy5kb2MgPSBkb2M7XG4gIHRoaXMubGluZSA9IGxpbmU7XG4gIHRoaXMubWF4TG9va0FoZWFkID0gbG9va0FoZWFkIHx8IDA7XG4gIHRoaXMuYmFzZVRva2VucyA9IG51bGw7XG4gIHRoaXMuYmFzZVRva2VuUG9zID0gMTtcbn07XG5cbkNvbnRleHQucHJvdG90eXBlLmxvb2tBaGVhZCA9IGZ1bmN0aW9uIChuKSB7XG4gIHZhciBsaW5lID0gdGhpcy5kb2MuZ2V0TGluZSh0aGlzLmxpbmUgKyBuKTtcbiAgaWYgKGxpbmUgIT0gbnVsbCAmJiBuID4gdGhpcy5tYXhMb29rQWhlYWQpIHsgdGhpcy5tYXhMb29rQWhlYWQgPSBuOyB9XG4gIHJldHVybiBsaW5lXG59O1xuXG5Db250ZXh0LnByb3RvdHlwZS5iYXNlVG9rZW4gPSBmdW5jdGlvbiAobikge1xuICAgIHZhciB0aGlzJDEgPSB0aGlzO1xuXG4gIGlmICghdGhpcy5iYXNlVG9rZW5zKSB7IHJldHVybiBudWxsIH1cbiAgd2hpbGUgKHRoaXMuYmFzZVRva2Vuc1t0aGlzLmJhc2VUb2tlblBvc10gPD0gbilcbiAgICB7IHRoaXMkMS5iYXNlVG9rZW5Qb3MgKz0gMjsgfVxuICB2YXIgdHlwZSA9IHRoaXMuYmFzZVRva2Vuc1t0aGlzLmJhc2VUb2tlblBvcyArIDFdO1xuICByZXR1cm4ge3R5cGU6IHR5cGUgJiYgdHlwZS5yZXBsYWNlKC8oIHxeKW92ZXJsYXkgLiovLCBcIlwiKSxcbiAgICAgICAgICBzaXplOiB0aGlzLmJhc2VUb2tlbnNbdGhpcy5iYXNlVG9rZW5Qb3NdIC0gbn1cbn07XG5cbkNvbnRleHQucHJvdG90eXBlLm5leHRMaW5lID0gZnVuY3Rpb24gKCkge1xuICB0aGlzLmxpbmUrKztcbiAgaWYgKHRoaXMubWF4TG9va0FoZWFkID4gMCkgeyB0aGlzLm1heExvb2tBaGVhZC0tOyB9XG59O1xuXG5Db250ZXh0LmZyb21TYXZlZCA9IGZ1bmN0aW9uIChkb2MsIHNhdmVkLCBsaW5lKSB7XG4gIGlmIChzYXZlZCBpbnN0YW5jZW9mIFNhdmVkQ29udGV4dClcbiAgICB7IHJldHVybiBuZXcgQ29udGV4dChkb2MsIGNvcHlTdGF0ZShkb2MubW9kZSwgc2F2ZWQuc3RhdGUpLCBsaW5lLCBzYXZlZC5sb29rQWhlYWQpIH1cbiAgZWxzZVxuICAgIHsgcmV0dXJuIG5ldyBDb250ZXh0KGRvYywgY29weVN0YXRlKGRvYy5tb2RlLCBzYXZlZCksIGxpbmUpIH1cbn07XG5cbkNvbnRleHQucHJvdG90eXBlLnNhdmUgPSBmdW5jdGlvbiAoY29weSkge1xuICB2YXIgc3RhdGUgPSBjb3B5ICE9PSBmYWxzZSA/IGNvcHlTdGF0ZSh0aGlzLmRvYy5tb2RlLCB0aGlzLnN0YXRlKSA6IHRoaXMuc3RhdGU7XG4gIHJldHVybiB0aGlzLm1heExvb2tBaGVhZCA+IDAgPyBuZXcgU2F2ZWRDb250ZXh0KHN0YXRlLCB0aGlzLm1heExvb2tBaGVhZCkgOiBzdGF0ZVxufTtcblxuXG4vLyBDb21wdXRlIGEgc3R5bGUgYXJyYXkgKGFuIGFycmF5IHN0YXJ0aW5nIHdpdGggYSBtb2RlIGdlbmVyYXRpb25cbi8vIC0tIGZvciBpbnZhbGlkYXRpb24gLS0gZm9sbG93ZWQgYnkgcGFpcnMgb2YgZW5kIHBvc2l0aW9ucyBhbmRcbi8vIHN0eWxlIHN0cmluZ3MpLCB3aGljaCBpcyB1c2VkIHRvIGhpZ2hsaWdodCB0aGUgdG9rZW5zIG9uIHRoZVxuLy8gbGluZS5cbmZ1bmN0aW9uIGhpZ2hsaWdodExpbmUoY20sIGxpbmUsIGNvbnRleHQsIGZvcmNlVG9FbmQpIHtcbiAgLy8gQSBzdHlsZXMgYXJyYXkgYWx3YXlzIHN0YXJ0cyB3aXRoIGEgbnVtYmVyIGlkZW50aWZ5aW5nIHRoZVxuICAvLyBtb2RlL292ZXJsYXlzIHRoYXQgaXQgaXMgYmFzZWQgb24gKGZvciBlYXN5IGludmFsaWRhdGlvbikuXG4gIHZhciBzdCA9IFtjbS5zdGF0ZS5tb2RlR2VuXSwgbGluZUNsYXNzZXMgPSB7fTtcbiAgLy8gQ29tcHV0ZSB0aGUgYmFzZSBhcnJheSBvZiBzdHlsZXNcbiAgcnVuTW9kZShjbSwgbGluZS50ZXh0LCBjbS5kb2MubW9kZSwgY29udGV4dCwgZnVuY3Rpb24gKGVuZCwgc3R5bGUpIHsgcmV0dXJuIHN0LnB1c2goZW5kLCBzdHlsZSk7IH0sXG4gICAgICAgICAgbGluZUNsYXNzZXMsIGZvcmNlVG9FbmQpO1xuICB2YXIgc3RhdGUgPSBjb250ZXh0LnN0YXRlO1xuXG4gIC8vIFJ1biBvdmVybGF5cywgYWRqdXN0IHN0eWxlIGFycmF5LlxuICB2YXIgbG9vcCA9IGZ1bmN0aW9uICggbyApIHtcbiAgICBjb250ZXh0LmJhc2VUb2tlbnMgPSBzdDtcbiAgICB2YXIgb3ZlcmxheSA9IGNtLnN0YXRlLm92ZXJsYXlzW29dLCBpID0gMSwgYXQgPSAwO1xuICAgIGNvbnRleHQuc3RhdGUgPSB0cnVlO1xuICAgIHJ1bk1vZGUoY20sIGxpbmUudGV4dCwgb3ZlcmxheS5tb2RlLCBjb250ZXh0LCBmdW5jdGlvbiAoZW5kLCBzdHlsZSkge1xuICAgICAgdmFyIHN0YXJ0ID0gaTtcbiAgICAgIC8vIEVuc3VyZSB0aGVyZSdzIGEgdG9rZW4gZW5kIGF0IHRoZSBjdXJyZW50IHBvc2l0aW9uLCBhbmQgdGhhdCBpIHBvaW50cyBhdCBpdFxuICAgICAgd2hpbGUgKGF0IDwgZW5kKSB7XG4gICAgICAgIHZhciBpX2VuZCA9IHN0W2ldO1xuICAgICAgICBpZiAoaV9lbmQgPiBlbmQpXG4gICAgICAgICAgeyBzdC5zcGxpY2UoaSwgMSwgZW5kLCBzdFtpKzFdLCBpX2VuZCk7IH1cbiAgICAgICAgaSArPSAyO1xuICAgICAgICBhdCA9IE1hdGgubWluKGVuZCwgaV9lbmQpO1xuICAgICAgfVxuICAgICAgaWYgKCFzdHlsZSkgeyByZXR1cm4gfVxuICAgICAgaWYgKG92ZXJsYXkub3BhcXVlKSB7XG4gICAgICAgIHN0LnNwbGljZShzdGFydCwgaSAtIHN0YXJ0LCBlbmQsIFwib3ZlcmxheSBcIiArIHN0eWxlKTtcbiAgICAgICAgaSA9IHN0YXJ0ICsgMjtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGZvciAoOyBzdGFydCA8IGk7IHN0YXJ0ICs9IDIpIHtcbiAgICAgICAgICB2YXIgY3VyID0gc3Rbc3RhcnQrMV07XG4gICAgICAgICAgc3Rbc3RhcnQrMV0gPSAoY3VyID8gY3VyICsgXCIgXCIgOiBcIlwiKSArIFwib3ZlcmxheSBcIiArIHN0eWxlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSwgbGluZUNsYXNzZXMpO1xuICAgIGNvbnRleHQuc3RhdGUgPSBzdGF0ZTtcbiAgICBjb250ZXh0LmJhc2VUb2tlbnMgPSBudWxsO1xuICAgIGNvbnRleHQuYmFzZVRva2VuUG9zID0gMTtcbiAgfTtcblxuICBmb3IgKHZhciBvID0gMDsgbyA8IGNtLnN0YXRlLm92ZXJsYXlzLmxlbmd0aDsgKytvKSBsb29wKCBvICk7XG5cbiAgcmV0dXJuIHtzdHlsZXM6IHN0LCBjbGFzc2VzOiBsaW5lQ2xhc3Nlcy5iZ0NsYXNzIHx8IGxpbmVDbGFzc2VzLnRleHRDbGFzcyA/IGxpbmVDbGFzc2VzIDogbnVsbH1cbn1cblxuZnVuY3Rpb24gZ2V0TGluZVN0eWxlcyhjbSwgbGluZSwgdXBkYXRlRnJvbnRpZXIpIHtcbiAgaWYgKCFsaW5lLnN0eWxlcyB8fCBsaW5lLnN0eWxlc1swXSAhPSBjbS5zdGF0ZS5tb2RlR2VuKSB7XG4gICAgdmFyIGNvbnRleHQgPSBnZXRDb250ZXh0QmVmb3JlKGNtLCBsaW5lTm8obGluZSkpO1xuICAgIHZhciByZXNldFN0YXRlID0gbGluZS50ZXh0Lmxlbmd0aCA+IGNtLm9wdGlvbnMubWF4SGlnaGxpZ2h0TGVuZ3RoICYmIGNvcHlTdGF0ZShjbS5kb2MubW9kZSwgY29udGV4dC5zdGF0ZSk7XG4gICAgdmFyIHJlc3VsdCA9IGhpZ2hsaWdodExpbmUoY20sIGxpbmUsIGNvbnRleHQpO1xuICAgIGlmIChyZXNldFN0YXRlKSB7IGNvbnRleHQuc3RhdGUgPSByZXNldFN0YXRlOyB9XG4gICAgbGluZS5zdGF0ZUFmdGVyID0gY29udGV4dC5zYXZlKCFyZXNldFN0YXRlKTtcbiAgICBsaW5lLnN0eWxlcyA9IHJlc3VsdC5zdHlsZXM7XG4gICAgaWYgKHJlc3VsdC5jbGFzc2VzKSB7IGxpbmUuc3R5bGVDbGFzc2VzID0gcmVzdWx0LmNsYXNzZXM7IH1cbiAgICBlbHNlIGlmIChsaW5lLnN0eWxlQ2xhc3NlcykgeyBsaW5lLnN0eWxlQ2xhc3NlcyA9IG51bGw7IH1cbiAgICBpZiAodXBkYXRlRnJvbnRpZXIgPT09IGNtLmRvYy5oaWdobGlnaHRGcm9udGllcilcbiAgICAgIHsgY20uZG9jLm1vZGVGcm9udGllciA9IE1hdGgubWF4KGNtLmRvYy5tb2RlRnJvbnRpZXIsICsrY20uZG9jLmhpZ2hsaWdodEZyb250aWVyKTsgfVxuICB9XG4gIHJldHVybiBsaW5lLnN0eWxlc1xufVxuXG5mdW5jdGlvbiBnZXRDb250ZXh0QmVmb3JlKGNtLCBuLCBwcmVjaXNlKSB7XG4gIHZhciBkb2MgPSBjbS5kb2MsIGRpc3BsYXkgPSBjbS5kaXNwbGF5O1xuICBpZiAoIWRvYy5tb2RlLnN0YXJ0U3RhdGUpIHsgcmV0dXJuIG5ldyBDb250ZXh0KGRvYywgdHJ1ZSwgbikgfVxuICB2YXIgc3RhcnQgPSBmaW5kU3RhcnRMaW5lKGNtLCBuLCBwcmVjaXNlKTtcbiAgdmFyIHNhdmVkID0gc3RhcnQgPiBkb2MuZmlyc3QgJiYgZ2V0TGluZShkb2MsIHN0YXJ0IC0gMSkuc3RhdGVBZnRlcjtcbiAgdmFyIGNvbnRleHQgPSBzYXZlZCA/IENvbnRleHQuZnJvbVNhdmVkKGRvYywgc2F2ZWQsIHN0YXJ0KSA6IG5ldyBDb250ZXh0KGRvYywgc3RhcnRTdGF0ZShkb2MubW9kZSksIHN0YXJ0KTtcblxuICBkb2MuaXRlcihzdGFydCwgbiwgZnVuY3Rpb24gKGxpbmUpIHtcbiAgICBwcm9jZXNzTGluZShjbSwgbGluZS50ZXh0LCBjb250ZXh0KTtcbiAgICB2YXIgcG9zID0gY29udGV4dC5saW5lO1xuICAgIGxpbmUuc3RhdGVBZnRlciA9IHBvcyA9PSBuIC0gMSB8fCBwb3MgJSA1ID09IDAgfHwgcG9zID49IGRpc3BsYXkudmlld0Zyb20gJiYgcG9zIDwgZGlzcGxheS52aWV3VG8gPyBjb250ZXh0LnNhdmUoKSA6IG51bGw7XG4gICAgY29udGV4dC5uZXh0TGluZSgpO1xuICB9KTtcbiAgaWYgKHByZWNpc2UpIHsgZG9jLm1vZGVGcm9udGllciA9IGNvbnRleHQubGluZTsgfVxuICByZXR1cm4gY29udGV4dFxufVxuXG4vLyBMaWdodHdlaWdodCBmb3JtIG9mIGhpZ2hsaWdodCAtLSBwcm9jZWVkIG92ZXIgdGhpcyBsaW5lIGFuZFxuLy8gdXBkYXRlIHN0YXRlLCBidXQgZG9uJ3Qgc2F2ZSBhIHN0eWxlIGFycmF5LiBVc2VkIGZvciBsaW5lcyB0aGF0XG4vLyBhcmVuJ3QgY3VycmVudGx5IHZpc2libGUuXG5mdW5jdGlvbiBwcm9jZXNzTGluZShjbSwgdGV4dCwgY29udGV4dCwgc3RhcnRBdCkge1xuICB2YXIgbW9kZSA9IGNtLmRvYy5tb2RlO1xuICB2YXIgc3RyZWFtID0gbmV3IFN0cmluZ1N0cmVhbSh0ZXh0LCBjbS5vcHRpb25zLnRhYlNpemUsIGNvbnRleHQpO1xuICBzdHJlYW0uc3RhcnQgPSBzdHJlYW0ucG9zID0gc3RhcnRBdCB8fCAwO1xuICBpZiAodGV4dCA9PSBcIlwiKSB7IGNhbGxCbGFua0xpbmUobW9kZSwgY29udGV4dC5zdGF0ZSk7IH1cbiAgd2hpbGUgKCFzdHJlYW0uZW9sKCkpIHtcbiAgICByZWFkVG9rZW4obW9kZSwgc3RyZWFtLCBjb250ZXh0LnN0YXRlKTtcbiAgICBzdHJlYW0uc3RhcnQgPSBzdHJlYW0ucG9zO1xuICB9XG59XG5cbmZ1bmN0aW9uIGNhbGxCbGFua0xpbmUobW9kZSwgc3RhdGUpIHtcbiAgaWYgKG1vZGUuYmxhbmtMaW5lKSB7IHJldHVybiBtb2RlLmJsYW5rTGluZShzdGF0ZSkgfVxuICBpZiAoIW1vZGUuaW5uZXJNb2RlKSB7IHJldHVybiB9XG4gIHZhciBpbm5lciA9IGlubmVyTW9kZShtb2RlLCBzdGF0ZSk7XG4gIGlmIChpbm5lci5tb2RlLmJsYW5rTGluZSkgeyByZXR1cm4gaW5uZXIubW9kZS5ibGFua0xpbmUoaW5uZXIuc3RhdGUpIH1cbn1cblxuZnVuY3Rpb24gcmVhZFRva2VuKG1vZGUsIHN0cmVhbSwgc3RhdGUsIGlubmVyKSB7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgMTA7IGkrKykge1xuICAgIGlmIChpbm5lcikgeyBpbm5lclswXSA9IGlubmVyTW9kZShtb2RlLCBzdGF0ZSkubW9kZTsgfVxuICAgIHZhciBzdHlsZSA9IG1vZGUudG9rZW4oc3RyZWFtLCBzdGF0ZSk7XG4gICAgaWYgKHN0cmVhbS5wb3MgPiBzdHJlYW0uc3RhcnQpIHsgcmV0dXJuIHN0eWxlIH1cbiAgfVxuICB0aHJvdyBuZXcgRXJyb3IoXCJNb2RlIFwiICsgbW9kZS5uYW1lICsgXCIgZmFpbGVkIHRvIGFkdmFuY2Ugc3RyZWFtLlwiKVxufVxuXG52YXIgVG9rZW4gPSBmdW5jdGlvbihzdHJlYW0sIHR5cGUsIHN0YXRlKSB7XG4gIHRoaXMuc3RhcnQgPSBzdHJlYW0uc3RhcnQ7IHRoaXMuZW5kID0gc3RyZWFtLnBvcztcbiAgdGhpcy5zdHJpbmcgPSBzdHJlYW0uY3VycmVudCgpO1xuICB0aGlzLnR5cGUgPSB0eXBlIHx8IG51bGw7XG4gIHRoaXMuc3RhdGUgPSBzdGF0ZTtcbn07XG5cbi8vIFV0aWxpdHkgZm9yIGdldFRva2VuQXQgYW5kIGdldExpbmVUb2tlbnNcbmZ1bmN0aW9uIHRha2VUb2tlbihjbSwgcG9zLCBwcmVjaXNlLCBhc0FycmF5KSB7XG4gIHZhciBkb2MgPSBjbS5kb2MsIG1vZGUgPSBkb2MubW9kZSwgc3R5bGU7XG4gIHBvcyA9IGNsaXBQb3MoZG9jLCBwb3MpO1xuICB2YXIgbGluZSA9IGdldExpbmUoZG9jLCBwb3MubGluZSksIGNvbnRleHQgPSBnZXRDb250ZXh0QmVmb3JlKGNtLCBwb3MubGluZSwgcHJlY2lzZSk7XG4gIHZhciBzdHJlYW0gPSBuZXcgU3RyaW5nU3RyZWFtKGxpbmUudGV4dCwgY20ub3B0aW9ucy50YWJTaXplLCBjb250ZXh0KSwgdG9rZW5zO1xuICBpZiAoYXNBcnJheSkgeyB0b2tlbnMgPSBbXTsgfVxuICB3aGlsZSAoKGFzQXJyYXkgfHwgc3RyZWFtLnBvcyA8IHBvcy5jaCkgJiYgIXN0cmVhbS5lb2woKSkge1xuICAgIHN0cmVhbS5zdGFydCA9IHN0cmVhbS5wb3M7XG4gICAgc3R5bGUgPSByZWFkVG9rZW4obW9kZSwgc3RyZWFtLCBjb250ZXh0LnN0YXRlKTtcbiAgICBpZiAoYXNBcnJheSkgeyB0b2tlbnMucHVzaChuZXcgVG9rZW4oc3RyZWFtLCBzdHlsZSwgY29weVN0YXRlKGRvYy5tb2RlLCBjb250ZXh0LnN0YXRlKSkpOyB9XG4gIH1cbiAgcmV0dXJuIGFzQXJyYXkgPyB0b2tlbnMgOiBuZXcgVG9rZW4oc3RyZWFtLCBzdHlsZSwgY29udGV4dC5zdGF0ZSlcbn1cblxuZnVuY3Rpb24gZXh0cmFjdExpbmVDbGFzc2VzKHR5cGUsIG91dHB1dCkge1xuICBpZiAodHlwZSkgeyBmb3IgKDs7KSB7XG4gICAgdmFyIGxpbmVDbGFzcyA9IHR5cGUubWF0Y2goLyg/Ol58XFxzKylsaW5lLShiYWNrZ3JvdW5kLSk/KFxcUyspLyk7XG4gICAgaWYgKCFsaW5lQ2xhc3MpIHsgYnJlYWsgfVxuICAgIHR5cGUgPSB0eXBlLnNsaWNlKDAsIGxpbmVDbGFzcy5pbmRleCkgKyB0eXBlLnNsaWNlKGxpbmVDbGFzcy5pbmRleCArIGxpbmVDbGFzc1swXS5sZW5ndGgpO1xuICAgIHZhciBwcm9wID0gbGluZUNsYXNzWzFdID8gXCJiZ0NsYXNzXCIgOiBcInRleHRDbGFzc1wiO1xuICAgIGlmIChvdXRwdXRbcHJvcF0gPT0gbnVsbClcbiAgICAgIHsgb3V0cHV0W3Byb3BdID0gbGluZUNsYXNzWzJdOyB9XG4gICAgZWxzZSBpZiAoIShuZXcgUmVnRXhwKFwiKD86XnxcXHMpXCIgKyBsaW5lQ2xhc3NbMl0gKyBcIig/OiR8XFxzKVwiKSkudGVzdChvdXRwdXRbcHJvcF0pKVxuICAgICAgeyBvdXRwdXRbcHJvcF0gKz0gXCIgXCIgKyBsaW5lQ2xhc3NbMl07IH1cbiAgfSB9XG4gIHJldHVybiB0eXBlXG59XG5cbi8vIFJ1biB0aGUgZ2l2ZW4gbW9kZSdzIHBhcnNlciBvdmVyIGEgbGluZSwgY2FsbGluZyBmIGZvciBlYWNoIHRva2VuLlxuZnVuY3Rpb24gcnVuTW9kZShjbSwgdGV4dCwgbW9kZSwgY29udGV4dCwgZiwgbGluZUNsYXNzZXMsIGZvcmNlVG9FbmQpIHtcbiAgdmFyIGZsYXR0ZW5TcGFucyA9IG1vZGUuZmxhdHRlblNwYW5zO1xuICBpZiAoZmxhdHRlblNwYW5zID09IG51bGwpIHsgZmxhdHRlblNwYW5zID0gY20ub3B0aW9ucy5mbGF0dGVuU3BhbnM7IH1cbiAgdmFyIGN1clN0YXJ0ID0gMCwgY3VyU3R5bGUgPSBudWxsO1xuICB2YXIgc3RyZWFtID0gbmV3IFN0cmluZ1N0cmVhbSh0ZXh0LCBjbS5vcHRpb25zLnRhYlNpemUsIGNvbnRleHQpLCBzdHlsZTtcbiAgdmFyIGlubmVyID0gY20ub3B0aW9ucy5hZGRNb2RlQ2xhc3MgJiYgW251bGxdO1xuICBpZiAodGV4dCA9PSBcIlwiKSB7IGV4dHJhY3RMaW5lQ2xhc3NlcyhjYWxsQmxhbmtMaW5lKG1vZGUsIGNvbnRleHQuc3RhdGUpLCBsaW5lQ2xhc3Nlcyk7IH1cbiAgd2hpbGUgKCFzdHJlYW0uZW9sKCkpIHtcbiAgICBpZiAoc3RyZWFtLnBvcyA+IGNtLm9wdGlvbnMubWF4SGlnaGxpZ2h0TGVuZ3RoKSB7XG4gICAgICBmbGF0dGVuU3BhbnMgPSBmYWxzZTtcbiAgICAgIGlmIChmb3JjZVRvRW5kKSB7IHByb2Nlc3NMaW5lKGNtLCB0ZXh0LCBjb250ZXh0LCBzdHJlYW0ucG9zKTsgfVxuICAgICAgc3RyZWFtLnBvcyA9IHRleHQubGVuZ3RoO1xuICAgICAgc3R5bGUgPSBudWxsO1xuICAgIH0gZWxzZSB7XG4gICAgICBzdHlsZSA9IGV4dHJhY3RMaW5lQ2xhc3NlcyhyZWFkVG9rZW4obW9kZSwgc3RyZWFtLCBjb250ZXh0LnN0YXRlLCBpbm5lciksIGxpbmVDbGFzc2VzKTtcbiAgICB9XG4gICAgaWYgKGlubmVyKSB7XG4gICAgICB2YXIgbU5hbWUgPSBpbm5lclswXS5uYW1lO1xuICAgICAgaWYgKG1OYW1lKSB7IHN0eWxlID0gXCJtLVwiICsgKHN0eWxlID8gbU5hbWUgKyBcIiBcIiArIHN0eWxlIDogbU5hbWUpOyB9XG4gICAgfVxuICAgIGlmICghZmxhdHRlblNwYW5zIHx8IGN1clN0eWxlICE9IHN0eWxlKSB7XG4gICAgICB3aGlsZSAoY3VyU3RhcnQgPCBzdHJlYW0uc3RhcnQpIHtcbiAgICAgICAgY3VyU3RhcnQgPSBNYXRoLm1pbihzdHJlYW0uc3RhcnQsIGN1clN0YXJ0ICsgNTAwMCk7XG4gICAgICAgIGYoY3VyU3RhcnQsIGN1clN0eWxlKTtcbiAgICAgIH1cbiAgICAgIGN1clN0eWxlID0gc3R5bGU7XG4gICAgfVxuICAgIHN0cmVhbS5zdGFydCA9IHN0cmVhbS5wb3M7XG4gIH1cbiAgd2hpbGUgKGN1clN0YXJ0IDwgc3RyZWFtLnBvcykge1xuICAgIC8vIFdlYmtpdCBzZWVtcyB0byByZWZ1c2UgdG8gcmVuZGVyIHRleHQgbm9kZXMgbG9uZ2VyIHRoYW4gNTc0NDRcbiAgICAvLyBjaGFyYWN0ZXJzLCBhbmQgcmV0dXJucyBpbmFjY3VyYXRlIG1lYXN1cmVtZW50cyBpbiBub2Rlc1xuICAgIC8vIHN0YXJ0aW5nIGFyb3VuZCA1MDAwIGNoYXJzLlxuICAgIHZhciBwb3MgPSBNYXRoLm1pbihzdHJlYW0ucG9zLCBjdXJTdGFydCArIDUwMDApO1xuICAgIGYocG9zLCBjdXJTdHlsZSk7XG4gICAgY3VyU3RhcnQgPSBwb3M7XG4gIH1cbn1cblxuLy8gRmluZHMgdGhlIGxpbmUgdG8gc3RhcnQgd2l0aCB3aGVuIHN0YXJ0aW5nIGEgcGFyc2UuIFRyaWVzIHRvXG4vLyBmaW5kIGEgbGluZSB3aXRoIGEgc3RhdGVBZnRlciwgc28gdGhhdCBpdCBjYW4gc3RhcnQgd2l0aCBhXG4vLyB2YWxpZCBzdGF0ZS4gSWYgdGhhdCBmYWlscywgaXQgcmV0dXJucyB0aGUgbGluZSB3aXRoIHRoZVxuLy8gc21hbGxlc3QgaW5kZW50YXRpb24sIHdoaWNoIHRlbmRzIHRvIG5lZWQgdGhlIGxlYXN0IGNvbnRleHQgdG9cbi8vIHBhcnNlIGNvcnJlY3RseS5cbmZ1bmN0aW9uIGZpbmRTdGFydExpbmUoY20sIG4sIHByZWNpc2UpIHtcbiAgdmFyIG1pbmluZGVudCwgbWlubGluZSwgZG9jID0gY20uZG9jO1xuICB2YXIgbGltID0gcHJlY2lzZSA/IC0xIDogbiAtIChjbS5kb2MubW9kZS5pbm5lck1vZGUgPyAxMDAwIDogMTAwKTtcbiAgZm9yICh2YXIgc2VhcmNoID0gbjsgc2VhcmNoID4gbGltOyAtLXNlYXJjaCkge1xuICAgIGlmIChzZWFyY2ggPD0gZG9jLmZpcnN0KSB7IHJldHVybiBkb2MuZmlyc3QgfVxuICAgIHZhciBsaW5lID0gZ2V0TGluZShkb2MsIHNlYXJjaCAtIDEpLCBhZnRlciA9IGxpbmUuc3RhdGVBZnRlcjtcbiAgICBpZiAoYWZ0ZXIgJiYgKCFwcmVjaXNlIHx8IHNlYXJjaCArIChhZnRlciBpbnN0YW5jZW9mIFNhdmVkQ29udGV4dCA/IGFmdGVyLmxvb2tBaGVhZCA6IDApIDw9IGRvYy5tb2RlRnJvbnRpZXIpKVxuICAgICAgeyByZXR1cm4gc2VhcmNoIH1cbiAgICB2YXIgaW5kZW50ZWQgPSBjb3VudENvbHVtbihsaW5lLnRleHQsIG51bGwsIGNtLm9wdGlvbnMudGFiU2l6ZSk7XG4gICAgaWYgKG1pbmxpbmUgPT0gbnVsbCB8fCBtaW5pbmRlbnQgPiBpbmRlbnRlZCkge1xuICAgICAgbWlubGluZSA9IHNlYXJjaCAtIDE7XG4gICAgICBtaW5pbmRlbnQgPSBpbmRlbnRlZDtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIG1pbmxpbmVcbn1cblxuZnVuY3Rpb24gcmV0cmVhdEZyb250aWVyKGRvYywgbikge1xuICBkb2MubW9kZUZyb250aWVyID0gTWF0aC5taW4oZG9jLm1vZGVGcm9udGllciwgbik7XG4gIGlmIChkb2MuaGlnaGxpZ2h0RnJvbnRpZXIgPCBuIC0gMTApIHsgcmV0dXJuIH1cbiAgdmFyIHN0YXJ0ID0gZG9jLmZpcnN0O1xuICBmb3IgKHZhciBsaW5lID0gbiAtIDE7IGxpbmUgPiBzdGFydDsgbGluZS0tKSB7XG4gICAgdmFyIHNhdmVkID0gZ2V0TGluZShkb2MsIGxpbmUpLnN0YXRlQWZ0ZXI7XG4gICAgLy8gY2hhbmdlIGlzIG9uIDNcbiAgICAvLyBzdGF0ZSBvbiBsaW5lIDEgbG9va2VkIGFoZWFkIDIgLS0gc28gc2F3IDNcbiAgICAvLyB0ZXN0IDEgKyAyIDwgMyBzaG91bGQgY292ZXIgdGhpc1xuICAgIGlmIChzYXZlZCAmJiAoIShzYXZlZCBpbnN0YW5jZW9mIFNhdmVkQ29udGV4dCkgfHwgbGluZSArIHNhdmVkLmxvb2tBaGVhZCA8IG4pKSB7XG4gICAgICBzdGFydCA9IGxpbmUgKyAxO1xuICAgICAgYnJlYWtcbiAgICB9XG4gIH1cbiAgZG9jLmhpZ2hsaWdodEZyb250aWVyID0gTWF0aC5taW4oZG9jLmhpZ2hsaWdodEZyb250aWVyLCBzdGFydCk7XG59XG5cbi8vIExJTkUgREFUQSBTVFJVQ1RVUkVcblxuLy8gTGluZSBvYmplY3RzLiBUaGVzZSBob2xkIHN0YXRlIHJlbGF0ZWQgdG8gYSBsaW5lLCBpbmNsdWRpbmdcbi8vIGhpZ2hsaWdodGluZyBpbmZvICh0aGUgc3R5bGVzIGFycmF5KS5cbnZhciBMaW5lID0gZnVuY3Rpb24odGV4dCwgbWFya2VkU3BhbnMsIGVzdGltYXRlSGVpZ2h0KSB7XG4gIHRoaXMudGV4dCA9IHRleHQ7XG4gIGF0dGFjaE1hcmtlZFNwYW5zKHRoaXMsIG1hcmtlZFNwYW5zKTtcbiAgdGhpcy5oZWlnaHQgPSBlc3RpbWF0ZUhlaWdodCA/IGVzdGltYXRlSGVpZ2h0KHRoaXMpIDogMTtcbn07XG5cbkxpbmUucHJvdG90eXBlLmxpbmVObyA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuIGxpbmVObyh0aGlzKSB9O1xuZXZlbnRNaXhpbihMaW5lKTtcblxuLy8gQ2hhbmdlIHRoZSBjb250ZW50ICh0ZXh0LCBtYXJrZXJzKSBvZiBhIGxpbmUuIEF1dG9tYXRpY2FsbHlcbi8vIGludmFsaWRhdGVzIGNhY2hlZCBpbmZvcm1hdGlvbiBhbmQgdHJpZXMgdG8gcmUtZXN0aW1hdGUgdGhlXG4vLyBsaW5lJ3MgaGVpZ2h0LlxuZnVuY3Rpb24gdXBkYXRlTGluZShsaW5lLCB0ZXh0LCBtYXJrZWRTcGFucywgZXN0aW1hdGVIZWlnaHQpIHtcbiAgbGluZS50ZXh0ID0gdGV4dDtcbiAgaWYgKGxpbmUuc3RhdGVBZnRlcikgeyBsaW5lLnN0YXRlQWZ0ZXIgPSBudWxsOyB9XG4gIGlmIChsaW5lLnN0eWxlcykgeyBsaW5lLnN0eWxlcyA9IG51bGw7IH1cbiAgaWYgKGxpbmUub3JkZXIgIT0gbnVsbCkgeyBsaW5lLm9yZGVyID0gbnVsbDsgfVxuICBkZXRhY2hNYXJrZWRTcGFucyhsaW5lKTtcbiAgYXR0YWNoTWFya2VkU3BhbnMobGluZSwgbWFya2VkU3BhbnMpO1xuICB2YXIgZXN0SGVpZ2h0ID0gZXN0aW1hdGVIZWlnaHQgPyBlc3RpbWF0ZUhlaWdodChsaW5lKSA6IDE7XG4gIGlmIChlc3RIZWlnaHQgIT0gbGluZS5oZWlnaHQpIHsgdXBkYXRlTGluZUhlaWdodChsaW5lLCBlc3RIZWlnaHQpOyB9XG59XG5cbi8vIERldGFjaCBhIGxpbmUgZnJvbSB0aGUgZG9jdW1lbnQgdHJlZSBhbmQgaXRzIG1hcmtlcnMuXG5mdW5jdGlvbiBjbGVhblVwTGluZShsaW5lKSB7XG4gIGxpbmUucGFyZW50ID0gbnVsbDtcbiAgZGV0YWNoTWFya2VkU3BhbnMobGluZSk7XG59XG5cbi8vIENvbnZlcnQgYSBzdHlsZSBhcyByZXR1cm5lZCBieSBhIG1vZGUgKGVpdGhlciBudWxsLCBvciBhIHN0cmluZ1xuLy8gY29udGFpbmluZyBvbmUgb3IgbW9yZSBzdHlsZXMpIHRvIGEgQ1NTIHN0eWxlLiBUaGlzIGlzIGNhY2hlZCxcbi8vIGFuZCBhbHNvIGxvb2tzIGZvciBsaW5lLXdpZGUgc3R5bGVzLlxudmFyIHN0eWxlVG9DbGFzc0NhY2hlID0ge307XG52YXIgc3R5bGVUb0NsYXNzQ2FjaGVXaXRoTW9kZSA9IHt9O1xuZnVuY3Rpb24gaW50ZXJwcmV0VG9rZW5TdHlsZShzdHlsZSwgb3B0aW9ucykge1xuICBpZiAoIXN0eWxlIHx8IC9eXFxzKiQvLnRlc3Qoc3R5bGUpKSB7IHJldHVybiBudWxsIH1cbiAgdmFyIGNhY2hlID0gb3B0aW9ucy5hZGRNb2RlQ2xhc3MgPyBzdHlsZVRvQ2xhc3NDYWNoZVdpdGhNb2RlIDogc3R5bGVUb0NsYXNzQ2FjaGU7XG4gIHJldHVybiBjYWNoZVtzdHlsZV0gfHxcbiAgICAoY2FjaGVbc3R5bGVdID0gc3R5bGUucmVwbGFjZSgvXFxTKy9nLCBcImNtLSQmXCIpKVxufVxuXG4vLyBSZW5kZXIgdGhlIERPTSByZXByZXNlbnRhdGlvbiBvZiB0aGUgdGV4dCBvZiBhIGxpbmUuIEFsc28gYnVpbGRzXG4vLyB1cCBhICdsaW5lIG1hcCcsIHdoaWNoIHBvaW50cyBhdCB0aGUgRE9NIG5vZGVzIHRoYXQgcmVwcmVzZW50XG4vLyBzcGVjaWZpYyBzdHJldGNoZXMgb2YgdGV4dCwgYW5kIGlzIHVzZWQgYnkgdGhlIG1lYXN1cmluZyBjb2RlLlxuLy8gVGhlIHJldHVybmVkIG9iamVjdCBjb250YWlucyB0aGUgRE9NIG5vZGUsIHRoaXMgbWFwLCBhbmRcbi8vIGluZm9ybWF0aW9uIGFib3V0IGxpbmUtd2lkZSBzdHlsZXMgdGhhdCB3ZXJlIHNldCBieSB0aGUgbW9kZS5cbmZ1bmN0aW9uIGJ1aWxkTGluZUNvbnRlbnQoY20sIGxpbmVWaWV3KSB7XG4gIC8vIFRoZSBwYWRkaW5nLXJpZ2h0IGZvcmNlcyB0aGUgZWxlbWVudCB0byBoYXZlIGEgJ2JvcmRlcicsIHdoaWNoXG4gIC8vIGlzIG5lZWRlZCBvbiBXZWJraXQgdG8gYmUgYWJsZSB0byBnZXQgbGluZS1sZXZlbCBib3VuZGluZ1xuICAvLyByZWN0YW5nbGVzIGZvciBpdCAoaW4gbWVhc3VyZUNoYXIpLlxuICB2YXIgY29udGVudCA9IGVsdFAoXCJzcGFuXCIsIG51bGwsIG51bGwsIHdlYmtpdCA/IFwicGFkZGluZy1yaWdodDogLjFweFwiIDogbnVsbCk7XG4gIHZhciBidWlsZGVyID0ge3ByZTogZWx0UChcInByZVwiLCBbY29udGVudF0sIFwiQ29kZU1pcnJvci1saW5lXCIpLCBjb250ZW50OiBjb250ZW50LFxuICAgICAgICAgICAgICAgICBjb2w6IDAsIHBvczogMCwgY206IGNtLFxuICAgICAgICAgICAgICAgICB0cmFpbGluZ1NwYWNlOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgc3BsaXRTcGFjZXM6IChpZSB8fCB3ZWJraXQpICYmIGNtLmdldE9wdGlvbihcImxpbmVXcmFwcGluZ1wiKX07XG4gIGxpbmVWaWV3Lm1lYXN1cmUgPSB7fTtcblxuICAvLyBJdGVyYXRlIG92ZXIgdGhlIGxvZ2ljYWwgbGluZXMgdGhhdCBtYWtlIHVwIHRoaXMgdmlzdWFsIGxpbmUuXG4gIGZvciAodmFyIGkgPSAwOyBpIDw9IChsaW5lVmlldy5yZXN0ID8gbGluZVZpZXcucmVzdC5sZW5ndGggOiAwKTsgaSsrKSB7XG4gICAgdmFyIGxpbmUgPSBpID8gbGluZVZpZXcucmVzdFtpIC0gMV0gOiBsaW5lVmlldy5saW5lLCBvcmRlciA9ICh2b2lkIDApO1xuICAgIGJ1aWxkZXIucG9zID0gMDtcbiAgICBidWlsZGVyLmFkZFRva2VuID0gYnVpbGRUb2tlbjtcbiAgICAvLyBPcHRpb25hbGx5IHdpcmUgaW4gc29tZSBoYWNrcyBpbnRvIHRoZSB0b2tlbi1yZW5kZXJpbmdcbiAgICAvLyBhbGdvcml0aG0sIHRvIGRlYWwgd2l0aCBicm93c2VyIHF1aXJrcy5cbiAgICBpZiAoaGFzQmFkQmlkaVJlY3RzKGNtLmRpc3BsYXkubWVhc3VyZSkgJiYgKG9yZGVyID0gZ2V0T3JkZXIobGluZSwgY20uZG9jLmRpcmVjdGlvbikpKVxuICAgICAgeyBidWlsZGVyLmFkZFRva2VuID0gYnVpbGRUb2tlbkJhZEJpZGkoYnVpbGRlci5hZGRUb2tlbiwgb3JkZXIpOyB9XG4gICAgYnVpbGRlci5tYXAgPSBbXTtcbiAgICB2YXIgYWxsb3dGcm9udGllclVwZGF0ZSA9IGxpbmVWaWV3ICE9IGNtLmRpc3BsYXkuZXh0ZXJuYWxNZWFzdXJlZCAmJiBsaW5lTm8obGluZSk7XG4gICAgaW5zZXJ0TGluZUNvbnRlbnQobGluZSwgYnVpbGRlciwgZ2V0TGluZVN0eWxlcyhjbSwgbGluZSwgYWxsb3dGcm9udGllclVwZGF0ZSkpO1xuICAgIGlmIChsaW5lLnN0eWxlQ2xhc3Nlcykge1xuICAgICAgaWYgKGxpbmUuc3R5bGVDbGFzc2VzLmJnQ2xhc3MpXG4gICAgICAgIHsgYnVpbGRlci5iZ0NsYXNzID0gam9pbkNsYXNzZXMobGluZS5zdHlsZUNsYXNzZXMuYmdDbGFzcywgYnVpbGRlci5iZ0NsYXNzIHx8IFwiXCIpOyB9XG4gICAgICBpZiAobGluZS5zdHlsZUNsYXNzZXMudGV4dENsYXNzKVxuICAgICAgICB7IGJ1aWxkZXIudGV4dENsYXNzID0gam9pbkNsYXNzZXMobGluZS5zdHlsZUNsYXNzZXMudGV4dENsYXNzLCBidWlsZGVyLnRleHRDbGFzcyB8fCBcIlwiKTsgfVxuICAgIH1cblxuICAgIC8vIEVuc3VyZSBhdCBsZWFzdCBhIHNpbmdsZSBub2RlIGlzIHByZXNlbnQsIGZvciBtZWFzdXJpbmcuXG4gICAgaWYgKGJ1aWxkZXIubWFwLmxlbmd0aCA9PSAwKVxuICAgICAgeyBidWlsZGVyLm1hcC5wdXNoKDAsIDAsIGJ1aWxkZXIuY29udGVudC5hcHBlbmRDaGlsZCh6ZXJvV2lkdGhFbGVtZW50KGNtLmRpc3BsYXkubWVhc3VyZSkpKTsgfVxuXG4gICAgLy8gU3RvcmUgdGhlIG1hcCBhbmQgYSBjYWNoZSBvYmplY3QgZm9yIHRoZSBjdXJyZW50IGxvZ2ljYWwgbGluZVxuICAgIGlmIChpID09IDApIHtcbiAgICAgIGxpbmVWaWV3Lm1lYXN1cmUubWFwID0gYnVpbGRlci5tYXA7XG4gICAgICBsaW5lVmlldy5tZWFzdXJlLmNhY2hlID0ge307XG4gICAgfSBlbHNlIHtcbiAgICAgIChsaW5lVmlldy5tZWFzdXJlLm1hcHMgfHwgKGxpbmVWaWV3Lm1lYXN1cmUubWFwcyA9IFtdKSkucHVzaChidWlsZGVyLm1hcClcbiAgICAgIDsobGluZVZpZXcubWVhc3VyZS5jYWNoZXMgfHwgKGxpbmVWaWV3Lm1lYXN1cmUuY2FjaGVzID0gW10pKS5wdXNoKHt9KTtcbiAgICB9XG4gIH1cblxuICAvLyBTZWUgaXNzdWUgIzI5MDFcbiAgaWYgKHdlYmtpdCkge1xuICAgIHZhciBsYXN0ID0gYnVpbGRlci5jb250ZW50Lmxhc3RDaGlsZDtcbiAgICBpZiAoL1xcYmNtLXRhYlxcYi8udGVzdChsYXN0LmNsYXNzTmFtZSkgfHwgKGxhc3QucXVlcnlTZWxlY3RvciAmJiBsYXN0LnF1ZXJ5U2VsZWN0b3IoXCIuY20tdGFiXCIpKSlcbiAgICAgIHsgYnVpbGRlci5jb250ZW50LmNsYXNzTmFtZSA9IFwiY20tdGFiLXdyYXAtaGFja1wiOyB9XG4gIH1cblxuICBzaWduYWwoY20sIFwicmVuZGVyTGluZVwiLCBjbSwgbGluZVZpZXcubGluZSwgYnVpbGRlci5wcmUpO1xuICBpZiAoYnVpbGRlci5wcmUuY2xhc3NOYW1lKVxuICAgIHsgYnVpbGRlci50ZXh0Q2xhc3MgPSBqb2luQ2xhc3NlcyhidWlsZGVyLnByZS5jbGFzc05hbWUsIGJ1aWxkZXIudGV4dENsYXNzIHx8IFwiXCIpOyB9XG5cbiAgcmV0dXJuIGJ1aWxkZXJcbn1cblxuZnVuY3Rpb24gZGVmYXVsdFNwZWNpYWxDaGFyUGxhY2Vob2xkZXIoY2gpIHtcbiAgdmFyIHRva2VuID0gZWx0KFwic3BhblwiLCBcIlxcdTIwMjJcIiwgXCJjbS1pbnZhbGlkY2hhclwiKTtcbiAgdG9rZW4udGl0bGUgPSBcIlxcXFx1XCIgKyBjaC5jaGFyQ29kZUF0KDApLnRvU3RyaW5nKDE2KTtcbiAgdG9rZW4uc2V0QXR0cmlidXRlKFwiYXJpYS1sYWJlbFwiLCB0b2tlbi50aXRsZSk7XG4gIHJldHVybiB0b2tlblxufVxuXG4vLyBCdWlsZCB1cCB0aGUgRE9NIHJlcHJlc2VudGF0aW9uIGZvciBhIHNpbmdsZSB0b2tlbiwgYW5kIGFkZCBpdCB0b1xuLy8gdGhlIGxpbmUgbWFwLiBUYWtlcyBjYXJlIHRvIHJlbmRlciBzcGVjaWFsIGNoYXJhY3RlcnMgc2VwYXJhdGVseS5cbmZ1bmN0aW9uIGJ1aWxkVG9rZW4oYnVpbGRlciwgdGV4dCwgc3R5bGUsIHN0YXJ0U3R5bGUsIGVuZFN0eWxlLCB0aXRsZSwgY3NzKSB7XG4gIGlmICghdGV4dCkgeyByZXR1cm4gfVxuICB2YXIgZGlzcGxheVRleHQgPSBidWlsZGVyLnNwbGl0U3BhY2VzID8gc3BsaXRTcGFjZXModGV4dCwgYnVpbGRlci50cmFpbGluZ1NwYWNlKSA6IHRleHQ7XG4gIHZhciBzcGVjaWFsID0gYnVpbGRlci5jbS5zdGF0ZS5zcGVjaWFsQ2hhcnMsIG11c3RXcmFwID0gZmFsc2U7XG4gIHZhciBjb250ZW50O1xuICBpZiAoIXNwZWNpYWwudGVzdCh0ZXh0KSkge1xuICAgIGJ1aWxkZXIuY29sICs9IHRleHQubGVuZ3RoO1xuICAgIGNvbnRlbnQgPSBkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShkaXNwbGF5VGV4dCk7XG4gICAgYnVpbGRlci5tYXAucHVzaChidWlsZGVyLnBvcywgYnVpbGRlci5wb3MgKyB0ZXh0Lmxlbmd0aCwgY29udGVudCk7XG4gICAgaWYgKGllICYmIGllX3ZlcnNpb24gPCA5KSB7IG11c3RXcmFwID0gdHJ1ZTsgfVxuICAgIGJ1aWxkZXIucG9zICs9IHRleHQubGVuZ3RoO1xuICB9IGVsc2Uge1xuICAgIGNvbnRlbnQgPSBkb2N1bWVudC5jcmVhdGVEb2N1bWVudEZyYWdtZW50KCk7XG4gICAgdmFyIHBvcyA9IDA7XG4gICAgd2hpbGUgKHRydWUpIHtcbiAgICAgIHNwZWNpYWwubGFzdEluZGV4ID0gcG9zO1xuICAgICAgdmFyIG0gPSBzcGVjaWFsLmV4ZWModGV4dCk7XG4gICAgICB2YXIgc2tpcHBlZCA9IG0gPyBtLmluZGV4IC0gcG9zIDogdGV4dC5sZW5ndGggLSBwb3M7XG4gICAgICBpZiAoc2tpcHBlZCkge1xuICAgICAgICB2YXIgdHh0ID0gZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoZGlzcGxheVRleHQuc2xpY2UocG9zLCBwb3MgKyBza2lwcGVkKSk7XG4gICAgICAgIGlmIChpZSAmJiBpZV92ZXJzaW9uIDwgOSkgeyBjb250ZW50LmFwcGVuZENoaWxkKGVsdChcInNwYW5cIiwgW3R4dF0pKTsgfVxuICAgICAgICBlbHNlIHsgY29udGVudC5hcHBlbmRDaGlsZCh0eHQpOyB9XG4gICAgICAgIGJ1aWxkZXIubWFwLnB1c2goYnVpbGRlci5wb3MsIGJ1aWxkZXIucG9zICsgc2tpcHBlZCwgdHh0KTtcbiAgICAgICAgYnVpbGRlci5jb2wgKz0gc2tpcHBlZDtcbiAgICAgICAgYnVpbGRlci5wb3MgKz0gc2tpcHBlZDtcbiAgICAgIH1cbiAgICAgIGlmICghbSkgeyBicmVhayB9XG4gICAgICBwb3MgKz0gc2tpcHBlZCArIDE7XG4gICAgICB2YXIgdHh0JDEgPSAodm9pZCAwKTtcbiAgICAgIGlmIChtWzBdID09IFwiXFx0XCIpIHtcbiAgICAgICAgdmFyIHRhYlNpemUgPSBidWlsZGVyLmNtLm9wdGlvbnMudGFiU2l6ZSwgdGFiV2lkdGggPSB0YWJTaXplIC0gYnVpbGRlci5jb2wgJSB0YWJTaXplO1xuICAgICAgICB0eHQkMSA9IGNvbnRlbnQuYXBwZW5kQ2hpbGQoZWx0KFwic3BhblwiLCBzcGFjZVN0cih0YWJXaWR0aCksIFwiY20tdGFiXCIpKTtcbiAgICAgICAgdHh0JDEuc2V0QXR0cmlidXRlKFwicm9sZVwiLCBcInByZXNlbnRhdGlvblwiKTtcbiAgICAgICAgdHh0JDEuc2V0QXR0cmlidXRlKFwiY20tdGV4dFwiLCBcIlxcdFwiKTtcbiAgICAgICAgYnVpbGRlci5jb2wgKz0gdGFiV2lkdGg7XG4gICAgICB9IGVsc2UgaWYgKG1bMF0gPT0gXCJcXHJcIiB8fCBtWzBdID09IFwiXFxuXCIpIHtcbiAgICAgICAgdHh0JDEgPSBjb250ZW50LmFwcGVuZENoaWxkKGVsdChcInNwYW5cIiwgbVswXSA9PSBcIlxcclwiID8gXCJcXHUyNDBkXCIgOiBcIlxcdTI0MjRcIiwgXCJjbS1pbnZhbGlkY2hhclwiKSk7XG4gICAgICAgIHR4dCQxLnNldEF0dHJpYnV0ZShcImNtLXRleHRcIiwgbVswXSk7XG4gICAgICAgIGJ1aWxkZXIuY29sICs9IDE7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0eHQkMSA9IGJ1aWxkZXIuY20ub3B0aW9ucy5zcGVjaWFsQ2hhclBsYWNlaG9sZGVyKG1bMF0pO1xuICAgICAgICB0eHQkMS5zZXRBdHRyaWJ1dGUoXCJjbS10ZXh0XCIsIG1bMF0pO1xuICAgICAgICBpZiAoaWUgJiYgaWVfdmVyc2lvbiA8IDkpIHsgY29udGVudC5hcHBlbmRDaGlsZChlbHQoXCJzcGFuXCIsIFt0eHQkMV0pKTsgfVxuICAgICAgICBlbHNlIHsgY29udGVudC5hcHBlbmRDaGlsZCh0eHQkMSk7IH1cbiAgICAgICAgYnVpbGRlci5jb2wgKz0gMTtcbiAgICAgIH1cbiAgICAgIGJ1aWxkZXIubWFwLnB1c2goYnVpbGRlci5wb3MsIGJ1aWxkZXIucG9zICsgMSwgdHh0JDEpO1xuICAgICAgYnVpbGRlci5wb3MrKztcbiAgICB9XG4gIH1cbiAgYnVpbGRlci50cmFpbGluZ1NwYWNlID0gZGlzcGxheVRleHQuY2hhckNvZGVBdCh0ZXh0Lmxlbmd0aCAtIDEpID09IDMyO1xuICBpZiAoc3R5bGUgfHwgc3RhcnRTdHlsZSB8fCBlbmRTdHlsZSB8fCBtdXN0V3JhcCB8fCBjc3MpIHtcbiAgICB2YXIgZnVsbFN0eWxlID0gc3R5bGUgfHwgXCJcIjtcbiAgICBpZiAoc3RhcnRTdHlsZSkgeyBmdWxsU3R5bGUgKz0gc3RhcnRTdHlsZTsgfVxuICAgIGlmIChlbmRTdHlsZSkgeyBmdWxsU3R5bGUgKz0gZW5kU3R5bGU7IH1cbiAgICB2YXIgdG9rZW4gPSBlbHQoXCJzcGFuXCIsIFtjb250ZW50XSwgZnVsbFN0eWxlLCBjc3MpO1xuICAgIGlmICh0aXRsZSkgeyB0b2tlbi50aXRsZSA9IHRpdGxlOyB9XG4gICAgcmV0dXJuIGJ1aWxkZXIuY29udGVudC5hcHBlbmRDaGlsZCh0b2tlbilcbiAgfVxuICBidWlsZGVyLmNvbnRlbnQuYXBwZW5kQ2hpbGQoY29udGVudCk7XG59XG5cbmZ1bmN0aW9uIHNwbGl0U3BhY2VzKHRleHQsIHRyYWlsaW5nQmVmb3JlKSB7XG4gIGlmICh0ZXh0Lmxlbmd0aCA+IDEgJiYgIS8gIC8udGVzdCh0ZXh0KSkgeyByZXR1cm4gdGV4dCB9XG4gIHZhciBzcGFjZUJlZm9yZSA9IHRyYWlsaW5nQmVmb3JlLCByZXN1bHQgPSBcIlwiO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IHRleHQubGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgY2ggPSB0ZXh0LmNoYXJBdChpKTtcbiAgICBpZiAoY2ggPT0gXCIgXCIgJiYgc3BhY2VCZWZvcmUgJiYgKGkgPT0gdGV4dC5sZW5ndGggLSAxIHx8IHRleHQuY2hhckNvZGVBdChpICsgMSkgPT0gMzIpKVxuICAgICAgeyBjaCA9IFwiXFx1MDBhMFwiOyB9XG4gICAgcmVzdWx0ICs9IGNoO1xuICAgIHNwYWNlQmVmb3JlID0gY2ggPT0gXCIgXCI7XG4gIH1cbiAgcmV0dXJuIHJlc3VsdFxufVxuXG4vLyBXb3JrIGFyb3VuZCBub25zZW5zZSBkaW1lbnNpb25zIGJlaW5nIHJlcG9ydGVkIGZvciBzdHJldGNoZXMgb2Zcbi8vIHJpZ2h0LXRvLWxlZnQgdGV4dC5cbmZ1bmN0aW9uIGJ1aWxkVG9rZW5CYWRCaWRpKGlubmVyLCBvcmRlcikge1xuICByZXR1cm4gZnVuY3Rpb24gKGJ1aWxkZXIsIHRleHQsIHN0eWxlLCBzdGFydFN0eWxlLCBlbmRTdHlsZSwgdGl0bGUsIGNzcykge1xuICAgIHN0eWxlID0gc3R5bGUgPyBzdHlsZSArIFwiIGNtLWZvcmNlLWJvcmRlclwiIDogXCJjbS1mb3JjZS1ib3JkZXJcIjtcbiAgICB2YXIgc3RhcnQgPSBidWlsZGVyLnBvcywgZW5kID0gc3RhcnQgKyB0ZXh0Lmxlbmd0aDtcbiAgICBmb3IgKDs7KSB7XG4gICAgICAvLyBGaW5kIHRoZSBwYXJ0IHRoYXQgb3ZlcmxhcHMgd2l0aCB0aGUgc3RhcnQgb2YgdGhpcyB0ZXh0XG4gICAgICB2YXIgcGFydCA9ICh2b2lkIDApO1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBvcmRlci5sZW5ndGg7IGkrKykge1xuICAgICAgICBwYXJ0ID0gb3JkZXJbaV07XG4gICAgICAgIGlmIChwYXJ0LnRvID4gc3RhcnQgJiYgcGFydC5mcm9tIDw9IHN0YXJ0KSB7IGJyZWFrIH1cbiAgICAgIH1cbiAgICAgIGlmIChwYXJ0LnRvID49IGVuZCkgeyByZXR1cm4gaW5uZXIoYnVpbGRlciwgdGV4dCwgc3R5bGUsIHN0YXJ0U3R5bGUsIGVuZFN0eWxlLCB0aXRsZSwgY3NzKSB9XG4gICAgICBpbm5lcihidWlsZGVyLCB0ZXh0LnNsaWNlKDAsIHBhcnQudG8gLSBzdGFydCksIHN0eWxlLCBzdGFydFN0eWxlLCBudWxsLCB0aXRsZSwgY3NzKTtcbiAgICAgIHN0YXJ0U3R5bGUgPSBudWxsO1xuICAgICAgdGV4dCA9IHRleHQuc2xpY2UocGFydC50byAtIHN0YXJ0KTtcbiAgICAgIHN0YXJ0ID0gcGFydC50bztcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gYnVpbGRDb2xsYXBzZWRTcGFuKGJ1aWxkZXIsIHNpemUsIG1hcmtlciwgaWdub3JlV2lkZ2V0KSB7XG4gIHZhciB3aWRnZXQgPSAhaWdub3JlV2lkZ2V0ICYmIG1hcmtlci53aWRnZXROb2RlO1xuICBpZiAod2lkZ2V0KSB7IGJ1aWxkZXIubWFwLnB1c2goYnVpbGRlci5wb3MsIGJ1aWxkZXIucG9zICsgc2l6ZSwgd2lkZ2V0KTsgfVxuICBpZiAoIWlnbm9yZVdpZGdldCAmJiBidWlsZGVyLmNtLmRpc3BsYXkuaW5wdXQubmVlZHNDb250ZW50QXR0cmlidXRlKSB7XG4gICAgaWYgKCF3aWRnZXQpXG4gICAgICB7IHdpZGdldCA9IGJ1aWxkZXIuY29udGVudC5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKSk7IH1cbiAgICB3aWRnZXQuc2V0QXR0cmlidXRlKFwiY20tbWFya2VyXCIsIG1hcmtlci5pZCk7XG4gIH1cbiAgaWYgKHdpZGdldCkge1xuICAgIGJ1aWxkZXIuY20uZGlzcGxheS5pbnB1dC5zZXRVbmVkaXRhYmxlKHdpZGdldCk7XG4gICAgYnVpbGRlci5jb250ZW50LmFwcGVuZENoaWxkKHdpZGdldCk7XG4gIH1cbiAgYnVpbGRlci5wb3MgKz0gc2l6ZTtcbiAgYnVpbGRlci50cmFpbGluZ1NwYWNlID0gZmFsc2U7XG59XG5cbi8vIE91dHB1dHMgYSBudW1iZXIgb2Ygc3BhbnMgdG8gbWFrZSB1cCBhIGxpbmUsIHRha2luZyBoaWdobGlnaHRpbmdcbi8vIGFuZCBtYXJrZWQgdGV4dCBpbnRvIGFjY291bnQuXG5mdW5jdGlvbiBpbnNlcnRMaW5lQ29udGVudChsaW5lLCBidWlsZGVyLCBzdHlsZXMpIHtcbiAgdmFyIHNwYW5zID0gbGluZS5tYXJrZWRTcGFucywgYWxsVGV4dCA9IGxpbmUudGV4dCwgYXQgPSAwO1xuICBpZiAoIXNwYW5zKSB7XG4gICAgZm9yICh2YXIgaSQxID0gMTsgaSQxIDwgc3R5bGVzLmxlbmd0aDsgaSQxKz0yKVxuICAgICAgeyBidWlsZGVyLmFkZFRva2VuKGJ1aWxkZXIsIGFsbFRleHQuc2xpY2UoYXQsIGF0ID0gc3R5bGVzW2kkMV0pLCBpbnRlcnByZXRUb2tlblN0eWxlKHN0eWxlc1tpJDErMV0sIGJ1aWxkZXIuY20ub3B0aW9ucykpOyB9XG4gICAgcmV0dXJuXG4gIH1cblxuICB2YXIgbGVuID0gYWxsVGV4dC5sZW5ndGgsIHBvcyA9IDAsIGkgPSAxLCB0ZXh0ID0gXCJcIiwgc3R5bGUsIGNzcztcbiAgdmFyIG5leHRDaGFuZ2UgPSAwLCBzcGFuU3R5bGUsIHNwYW5FbmRTdHlsZSwgc3BhblN0YXJ0U3R5bGUsIHRpdGxlLCBjb2xsYXBzZWQ7XG4gIGZvciAoOzspIHtcbiAgICBpZiAobmV4dENoYW5nZSA9PSBwb3MpIHsgLy8gVXBkYXRlIGN1cnJlbnQgbWFya2VyIHNldFxuICAgICAgc3BhblN0eWxlID0gc3BhbkVuZFN0eWxlID0gc3BhblN0YXJ0U3R5bGUgPSB0aXRsZSA9IGNzcyA9IFwiXCI7XG4gICAgICBjb2xsYXBzZWQgPSBudWxsOyBuZXh0Q2hhbmdlID0gSW5maW5pdHk7XG4gICAgICB2YXIgZm91bmRCb29rbWFya3MgPSBbXSwgZW5kU3R5bGVzID0gKHZvaWQgMCk7XG4gICAgICBmb3IgKHZhciBqID0gMDsgaiA8IHNwYW5zLmxlbmd0aDsgKytqKSB7XG4gICAgICAgIHZhciBzcCA9IHNwYW5zW2pdLCBtID0gc3AubWFya2VyO1xuICAgICAgICBpZiAobS50eXBlID09IFwiYm9va21hcmtcIiAmJiBzcC5mcm9tID09IHBvcyAmJiBtLndpZGdldE5vZGUpIHtcbiAgICAgICAgICBmb3VuZEJvb2ttYXJrcy5wdXNoKG0pO1xuICAgICAgICB9IGVsc2UgaWYgKHNwLmZyb20gPD0gcG9zICYmIChzcC50byA9PSBudWxsIHx8IHNwLnRvID4gcG9zIHx8IG0uY29sbGFwc2VkICYmIHNwLnRvID09IHBvcyAmJiBzcC5mcm9tID09IHBvcykpIHtcbiAgICAgICAgICBpZiAoc3AudG8gIT0gbnVsbCAmJiBzcC50byAhPSBwb3MgJiYgbmV4dENoYW5nZSA+IHNwLnRvKSB7XG4gICAgICAgICAgICBuZXh0Q2hhbmdlID0gc3AudG87XG4gICAgICAgICAgICBzcGFuRW5kU3R5bGUgPSBcIlwiO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAobS5jbGFzc05hbWUpIHsgc3BhblN0eWxlICs9IFwiIFwiICsgbS5jbGFzc05hbWU7IH1cbiAgICAgICAgICBpZiAobS5jc3MpIHsgY3NzID0gKGNzcyA/IGNzcyArIFwiO1wiIDogXCJcIikgKyBtLmNzczsgfVxuICAgICAgICAgIGlmIChtLnN0YXJ0U3R5bGUgJiYgc3AuZnJvbSA9PSBwb3MpIHsgc3BhblN0YXJ0U3R5bGUgKz0gXCIgXCIgKyBtLnN0YXJ0U3R5bGU7IH1cbiAgICAgICAgICBpZiAobS5lbmRTdHlsZSAmJiBzcC50byA9PSBuZXh0Q2hhbmdlKSB7IChlbmRTdHlsZXMgfHwgKGVuZFN0eWxlcyA9IFtdKSkucHVzaChtLmVuZFN0eWxlLCBzcC50byk7IH1cbiAgICAgICAgICBpZiAobS50aXRsZSAmJiAhdGl0bGUpIHsgdGl0bGUgPSBtLnRpdGxlOyB9XG4gICAgICAgICAgaWYgKG0uY29sbGFwc2VkICYmICghY29sbGFwc2VkIHx8IGNvbXBhcmVDb2xsYXBzZWRNYXJrZXJzKGNvbGxhcHNlZC5tYXJrZXIsIG0pIDwgMCkpXG4gICAgICAgICAgICB7IGNvbGxhcHNlZCA9IHNwOyB9XG4gICAgICAgIH0gZWxzZSBpZiAoc3AuZnJvbSA+IHBvcyAmJiBuZXh0Q2hhbmdlID4gc3AuZnJvbSkge1xuICAgICAgICAgIG5leHRDaGFuZ2UgPSBzcC5mcm9tO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoZW5kU3R5bGVzKSB7IGZvciAodmFyIGokMSA9IDA7IGokMSA8IGVuZFN0eWxlcy5sZW5ndGg7IGokMSArPSAyKVxuICAgICAgICB7IGlmIChlbmRTdHlsZXNbaiQxICsgMV0gPT0gbmV4dENoYW5nZSkgeyBzcGFuRW5kU3R5bGUgKz0gXCIgXCIgKyBlbmRTdHlsZXNbaiQxXTsgfSB9IH1cblxuICAgICAgaWYgKCFjb2xsYXBzZWQgfHwgY29sbGFwc2VkLmZyb20gPT0gcG9zKSB7IGZvciAodmFyIGokMiA9IDA7IGokMiA8IGZvdW5kQm9va21hcmtzLmxlbmd0aDsgKytqJDIpXG4gICAgICAgIHsgYnVpbGRDb2xsYXBzZWRTcGFuKGJ1aWxkZXIsIDAsIGZvdW5kQm9va21hcmtzW2okMl0pOyB9IH1cbiAgICAgIGlmIChjb2xsYXBzZWQgJiYgKGNvbGxhcHNlZC5mcm9tIHx8IDApID09IHBvcykge1xuICAgICAgICBidWlsZENvbGxhcHNlZFNwYW4oYnVpbGRlciwgKGNvbGxhcHNlZC50byA9PSBudWxsID8gbGVuICsgMSA6IGNvbGxhcHNlZC50bykgLSBwb3MsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICBjb2xsYXBzZWQubWFya2VyLCBjb2xsYXBzZWQuZnJvbSA9PSBudWxsKTtcbiAgICAgICAgaWYgKGNvbGxhcHNlZC50byA9PSBudWxsKSB7IHJldHVybiB9XG4gICAgICAgIGlmIChjb2xsYXBzZWQudG8gPT0gcG9zKSB7IGNvbGxhcHNlZCA9IGZhbHNlOyB9XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChwb3MgPj0gbGVuKSB7IGJyZWFrIH1cblxuICAgIHZhciB1cHRvID0gTWF0aC5taW4obGVuLCBuZXh0Q2hhbmdlKTtcbiAgICB3aGlsZSAodHJ1ZSkge1xuICAgICAgaWYgKHRleHQpIHtcbiAgICAgICAgdmFyIGVuZCA9IHBvcyArIHRleHQubGVuZ3RoO1xuICAgICAgICBpZiAoIWNvbGxhcHNlZCkge1xuICAgICAgICAgIHZhciB0b2tlblRleHQgPSBlbmQgPiB1cHRvID8gdGV4dC5zbGljZSgwLCB1cHRvIC0gcG9zKSA6IHRleHQ7XG4gICAgICAgICAgYnVpbGRlci5hZGRUb2tlbihidWlsZGVyLCB0b2tlblRleHQsIHN0eWxlID8gc3R5bGUgKyBzcGFuU3R5bGUgOiBzcGFuU3R5bGUsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICBzcGFuU3RhcnRTdHlsZSwgcG9zICsgdG9rZW5UZXh0Lmxlbmd0aCA9PSBuZXh0Q2hhbmdlID8gc3BhbkVuZFN0eWxlIDogXCJcIiwgdGl0bGUsIGNzcyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGVuZCA+PSB1cHRvKSB7dGV4dCA9IHRleHQuc2xpY2UodXB0byAtIHBvcyk7IHBvcyA9IHVwdG87IGJyZWFrfVxuICAgICAgICBwb3MgPSBlbmQ7XG4gICAgICAgIHNwYW5TdGFydFN0eWxlID0gXCJcIjtcbiAgICAgIH1cbiAgICAgIHRleHQgPSBhbGxUZXh0LnNsaWNlKGF0LCBhdCA9IHN0eWxlc1tpKytdKTtcbiAgICAgIHN0eWxlID0gaW50ZXJwcmV0VG9rZW5TdHlsZShzdHlsZXNbaSsrXSwgYnVpbGRlci5jbS5vcHRpb25zKTtcbiAgICB9XG4gIH1cbn1cblxuXG4vLyBUaGVzZSBvYmplY3RzIGFyZSB1c2VkIHRvIHJlcHJlc2VudCB0aGUgdmlzaWJsZSAoY3VycmVudGx5IGRyYXduKVxuLy8gcGFydCBvZiB0aGUgZG9jdW1lbnQuIEEgTGluZVZpZXcgbWF5IGNvcnJlc3BvbmQgdG8gbXVsdGlwbGVcbi8vIGxvZ2ljYWwgbGluZXMsIGlmIHRob3NlIGFyZSBjb25uZWN0ZWQgYnkgY29sbGFwc2VkIHJhbmdlcy5cbmZ1bmN0aW9uIExpbmVWaWV3KGRvYywgbGluZSwgbGluZU4pIHtcbiAgLy8gVGhlIHN0YXJ0aW5nIGxpbmVcbiAgdGhpcy5saW5lID0gbGluZTtcbiAgLy8gQ29udGludWluZyBsaW5lcywgaWYgYW55XG4gIHRoaXMucmVzdCA9IHZpc3VhbExpbmVDb250aW51ZWQobGluZSk7XG4gIC8vIE51bWJlciBvZiBsb2dpY2FsIGxpbmVzIGluIHRoaXMgdmlzdWFsIGxpbmVcbiAgdGhpcy5zaXplID0gdGhpcy5yZXN0ID8gbGluZU5vKGxzdCh0aGlzLnJlc3QpKSAtIGxpbmVOICsgMSA6IDE7XG4gIHRoaXMubm9kZSA9IHRoaXMudGV4dCA9IG51bGw7XG4gIHRoaXMuaGlkZGVuID0gbGluZUlzSGlkZGVuKGRvYywgbGluZSk7XG59XG5cbi8vIENyZWF0ZSBhIHJhbmdlIG9mIExpbmVWaWV3IG9iamVjdHMgZm9yIHRoZSBnaXZlbiBsaW5lcy5cbmZ1bmN0aW9uIGJ1aWxkVmlld0FycmF5KGNtLCBmcm9tLCB0bykge1xuICB2YXIgYXJyYXkgPSBbXSwgbmV4dFBvcztcbiAgZm9yICh2YXIgcG9zID0gZnJvbTsgcG9zIDwgdG87IHBvcyA9IG5leHRQb3MpIHtcbiAgICB2YXIgdmlldyA9IG5ldyBMaW5lVmlldyhjbS5kb2MsIGdldExpbmUoY20uZG9jLCBwb3MpLCBwb3MpO1xuICAgIG5leHRQb3MgPSBwb3MgKyB2aWV3LnNpemU7XG4gICAgYXJyYXkucHVzaCh2aWV3KTtcbiAgfVxuICByZXR1cm4gYXJyYXlcbn1cblxudmFyIG9wZXJhdGlvbkdyb3VwID0gbnVsbDtcblxuZnVuY3Rpb24gcHVzaE9wZXJhdGlvbihvcCkge1xuICBpZiAob3BlcmF0aW9uR3JvdXApIHtcbiAgICBvcGVyYXRpb25Hcm91cC5vcHMucHVzaChvcCk7XG4gIH0gZWxzZSB7XG4gICAgb3Aub3duc0dyb3VwID0gb3BlcmF0aW9uR3JvdXAgPSB7XG4gICAgICBvcHM6IFtvcF0sXG4gICAgICBkZWxheWVkQ2FsbGJhY2tzOiBbXVxuICAgIH07XG4gIH1cbn1cblxuZnVuY3Rpb24gZmlyZUNhbGxiYWNrc0Zvck9wcyhncm91cCkge1xuICAvLyBDYWxscyBkZWxheWVkIGNhbGxiYWNrcyBhbmQgY3Vyc29yQWN0aXZpdHkgaGFuZGxlcnMgdW50aWwgbm9cbiAgLy8gbmV3IG9uZXMgYXBwZWFyXG4gIHZhciBjYWxsYmFja3MgPSBncm91cC5kZWxheWVkQ2FsbGJhY2tzLCBpID0gMDtcbiAgZG8ge1xuICAgIGZvciAoOyBpIDwgY2FsbGJhY2tzLmxlbmd0aDsgaSsrKVxuICAgICAgeyBjYWxsYmFja3NbaV0uY2FsbChudWxsKTsgfVxuICAgIGZvciAodmFyIGogPSAwOyBqIDwgZ3JvdXAub3BzLmxlbmd0aDsgaisrKSB7XG4gICAgICB2YXIgb3AgPSBncm91cC5vcHNbal07XG4gICAgICBpZiAob3AuY3Vyc29yQWN0aXZpdHlIYW5kbGVycylcbiAgICAgICAgeyB3aGlsZSAob3AuY3Vyc29yQWN0aXZpdHlDYWxsZWQgPCBvcC5jdXJzb3JBY3Rpdml0eUhhbmRsZXJzLmxlbmd0aClcbiAgICAgICAgICB7IG9wLmN1cnNvckFjdGl2aXR5SGFuZGxlcnNbb3AuY3Vyc29yQWN0aXZpdHlDYWxsZWQrK10uY2FsbChudWxsLCBvcC5jbSk7IH0gfVxuICAgIH1cbiAgfSB3aGlsZSAoaSA8IGNhbGxiYWNrcy5sZW5ndGgpXG59XG5cbmZ1bmN0aW9uIGZpbmlzaE9wZXJhdGlvbihvcCwgZW5kQ2IpIHtcbiAgdmFyIGdyb3VwID0gb3Aub3duc0dyb3VwO1xuICBpZiAoIWdyb3VwKSB7IHJldHVybiB9XG5cbiAgdHJ5IHsgZmlyZUNhbGxiYWNrc0Zvck9wcyhncm91cCk7IH1cbiAgZmluYWxseSB7XG4gICAgb3BlcmF0aW9uR3JvdXAgPSBudWxsO1xuICAgIGVuZENiKGdyb3VwKTtcbiAgfVxufVxuXG52YXIgb3JwaGFuRGVsYXllZENhbGxiYWNrcyA9IG51bGw7XG5cbi8vIE9mdGVuLCB3ZSB3YW50IHRvIHNpZ25hbCBldmVudHMgYXQgYSBwb2ludCB3aGVyZSB3ZSBhcmUgaW4gdGhlXG4vLyBtaWRkbGUgb2Ygc29tZSB3b3JrLCBidXQgZG9uJ3Qgd2FudCB0aGUgaGFuZGxlciB0byBzdGFydCBjYWxsaW5nXG4vLyBvdGhlciBtZXRob2RzIG9uIHRoZSBlZGl0b3IsIHdoaWNoIG1pZ2h0IGJlIGluIGFuIGluY29uc2lzdGVudFxuLy8gc3RhdGUgb3Igc2ltcGx5IG5vdCBleHBlY3QgYW55IG90aGVyIGV2ZW50cyB0byBoYXBwZW4uXG4vLyBzaWduYWxMYXRlciBsb29rcyB3aGV0aGVyIHRoZXJlIGFyZSBhbnkgaGFuZGxlcnMsIGFuZCBzY2hlZHVsZXNcbi8vIHRoZW0gdG8gYmUgZXhlY3V0ZWQgd2hlbiB0aGUgbGFzdCBvcGVyYXRpb24gZW5kcywgb3IsIGlmIG5vXG4vLyBvcGVyYXRpb24gaXMgYWN0aXZlLCB3aGVuIGEgdGltZW91dCBmaXJlcy5cbmZ1bmN0aW9uIHNpZ25hbExhdGVyKGVtaXR0ZXIsIHR5cGUgLyosIHZhbHVlcy4uLiovKSB7XG4gIHZhciBhcnIgPSBnZXRIYW5kbGVycyhlbWl0dGVyLCB0eXBlKTtcbiAgaWYgKCFhcnIubGVuZ3RoKSB7IHJldHVybiB9XG4gIHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAyKSwgbGlzdDtcbiAgaWYgKG9wZXJhdGlvbkdyb3VwKSB7XG4gICAgbGlzdCA9IG9wZXJhdGlvbkdyb3VwLmRlbGF5ZWRDYWxsYmFja3M7XG4gIH0gZWxzZSBpZiAob3JwaGFuRGVsYXllZENhbGxiYWNrcykge1xuICAgIGxpc3QgPSBvcnBoYW5EZWxheWVkQ2FsbGJhY2tzO1xuICB9IGVsc2Uge1xuICAgIGxpc3QgPSBvcnBoYW5EZWxheWVkQ2FsbGJhY2tzID0gW107XG4gICAgc2V0VGltZW91dChmaXJlT3JwaGFuRGVsYXllZCwgMCk7XG4gIH1cbiAgdmFyIGxvb3AgPSBmdW5jdGlvbiAoIGkgKSB7XG4gICAgbGlzdC5wdXNoKGZ1bmN0aW9uICgpIHsgcmV0dXJuIGFycltpXS5hcHBseShudWxsLCBhcmdzKTsgfSk7XG4gIH07XG5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcnIubGVuZ3RoOyArK2kpXG4gICAgbG9vcCggaSApO1xufVxuXG5mdW5jdGlvbiBmaXJlT3JwaGFuRGVsYXllZCgpIHtcbiAgdmFyIGRlbGF5ZWQgPSBvcnBoYW5EZWxheWVkQ2FsbGJhY2tzO1xuICBvcnBoYW5EZWxheWVkQ2FsbGJhY2tzID0gbnVsbDtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBkZWxheWVkLmxlbmd0aDsgKytpKSB7IGRlbGF5ZWRbaV0oKTsgfVxufVxuXG4vLyBXaGVuIGFuIGFzcGVjdCBvZiBhIGxpbmUgY2hhbmdlcywgYSBzdHJpbmcgaXMgYWRkZWQgdG9cbi8vIGxpbmVWaWV3LmNoYW5nZXMuIFRoaXMgdXBkYXRlcyB0aGUgcmVsZXZhbnQgcGFydCBvZiB0aGUgbGluZSdzXG4vLyBET00gc3RydWN0dXJlLlxuZnVuY3Rpb24gdXBkYXRlTGluZUZvckNoYW5nZXMoY20sIGxpbmVWaWV3LCBsaW5lTiwgZGltcykge1xuICBmb3IgKHZhciBqID0gMDsgaiA8IGxpbmVWaWV3LmNoYW5nZXMubGVuZ3RoOyBqKyspIHtcbiAgICB2YXIgdHlwZSA9IGxpbmVWaWV3LmNoYW5nZXNbal07XG4gICAgaWYgKHR5cGUgPT0gXCJ0ZXh0XCIpIHsgdXBkYXRlTGluZVRleHQoY20sIGxpbmVWaWV3KTsgfVxuICAgIGVsc2UgaWYgKHR5cGUgPT0gXCJndXR0ZXJcIikgeyB1cGRhdGVMaW5lR3V0dGVyKGNtLCBsaW5lVmlldywgbGluZU4sIGRpbXMpOyB9XG4gICAgZWxzZSBpZiAodHlwZSA9PSBcImNsYXNzXCIpIHsgdXBkYXRlTGluZUNsYXNzZXMoY20sIGxpbmVWaWV3KTsgfVxuICAgIGVsc2UgaWYgKHR5cGUgPT0gXCJ3aWRnZXRcIikgeyB1cGRhdGVMaW5lV2lkZ2V0cyhjbSwgbGluZVZpZXcsIGRpbXMpOyB9XG4gIH1cbiAgbGluZVZpZXcuY2hhbmdlcyA9IG51bGw7XG59XG5cbi8vIExpbmVzIHdpdGggZ3V0dGVyIGVsZW1lbnRzLCB3aWRnZXRzIG9yIGEgYmFja2dyb3VuZCBjbGFzcyBuZWVkIHRvXG4vLyBiZSB3cmFwcGVkLCBhbmQgaGF2ZSB0aGUgZXh0cmEgZWxlbWVudHMgYWRkZWQgdG8gdGhlIHdyYXBwZXIgZGl2XG5mdW5jdGlvbiBlbnN1cmVMaW5lV3JhcHBlZChsaW5lVmlldykge1xuICBpZiAobGluZVZpZXcubm9kZSA9PSBsaW5lVmlldy50ZXh0KSB7XG4gICAgbGluZVZpZXcubm9kZSA9IGVsdChcImRpdlwiLCBudWxsLCBudWxsLCBcInBvc2l0aW9uOiByZWxhdGl2ZVwiKTtcbiAgICBpZiAobGluZVZpZXcudGV4dC5wYXJlbnROb2RlKVxuICAgICAgeyBsaW5lVmlldy50ZXh0LnBhcmVudE5vZGUucmVwbGFjZUNoaWxkKGxpbmVWaWV3Lm5vZGUsIGxpbmVWaWV3LnRleHQpOyB9XG4gICAgbGluZVZpZXcubm9kZS5hcHBlbmRDaGlsZChsaW5lVmlldy50ZXh0KTtcbiAgICBpZiAoaWUgJiYgaWVfdmVyc2lvbiA8IDgpIHsgbGluZVZpZXcubm9kZS5zdHlsZS56SW5kZXggPSAyOyB9XG4gIH1cbiAgcmV0dXJuIGxpbmVWaWV3Lm5vZGVcbn1cblxuZnVuY3Rpb24gdXBkYXRlTGluZUJhY2tncm91bmQoY20sIGxpbmVWaWV3KSB7XG4gIHZhciBjbHMgPSBsaW5lVmlldy5iZ0NsYXNzID8gbGluZVZpZXcuYmdDbGFzcyArIFwiIFwiICsgKGxpbmVWaWV3LmxpbmUuYmdDbGFzcyB8fCBcIlwiKSA6IGxpbmVWaWV3LmxpbmUuYmdDbGFzcztcbiAgaWYgKGNscykgeyBjbHMgKz0gXCIgQ29kZU1pcnJvci1saW5lYmFja2dyb3VuZFwiOyB9XG4gIGlmIChsaW5lVmlldy5iYWNrZ3JvdW5kKSB7XG4gICAgaWYgKGNscykgeyBsaW5lVmlldy5iYWNrZ3JvdW5kLmNsYXNzTmFtZSA9IGNsczsgfVxuICAgIGVsc2UgeyBsaW5lVmlldy5iYWNrZ3JvdW5kLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQobGluZVZpZXcuYmFja2dyb3VuZCk7IGxpbmVWaWV3LmJhY2tncm91bmQgPSBudWxsOyB9XG4gIH0gZWxzZSBpZiAoY2xzKSB7XG4gICAgdmFyIHdyYXAgPSBlbnN1cmVMaW5lV3JhcHBlZChsaW5lVmlldyk7XG4gICAgbGluZVZpZXcuYmFja2dyb3VuZCA9IHdyYXAuaW5zZXJ0QmVmb3JlKGVsdChcImRpdlwiLCBudWxsLCBjbHMpLCB3cmFwLmZpcnN0Q2hpbGQpO1xuICAgIGNtLmRpc3BsYXkuaW5wdXQuc2V0VW5lZGl0YWJsZShsaW5lVmlldy5iYWNrZ3JvdW5kKTtcbiAgfVxufVxuXG4vLyBXcmFwcGVyIGFyb3VuZCBidWlsZExpbmVDb250ZW50IHdoaWNoIHdpbGwgcmV1c2UgdGhlIHN0cnVjdHVyZVxuLy8gaW4gZGlzcGxheS5leHRlcm5hbE1lYXN1cmVkIHdoZW4gcG9zc2libGUuXG5mdW5jdGlvbiBnZXRMaW5lQ29udGVudChjbSwgbGluZVZpZXcpIHtcbiAgdmFyIGV4dCA9IGNtLmRpc3BsYXkuZXh0ZXJuYWxNZWFzdXJlZDtcbiAgaWYgKGV4dCAmJiBleHQubGluZSA9PSBsaW5lVmlldy5saW5lKSB7XG4gICAgY20uZGlzcGxheS5leHRlcm5hbE1lYXN1cmVkID0gbnVsbDtcbiAgICBsaW5lVmlldy5tZWFzdXJlID0gZXh0Lm1lYXN1cmU7XG4gICAgcmV0dXJuIGV4dC5idWlsdFxuICB9XG4gIHJldHVybiBidWlsZExpbmVDb250ZW50KGNtLCBsaW5lVmlldylcbn1cblxuLy8gUmVkcmF3IHRoZSBsaW5lJ3MgdGV4dC4gSW50ZXJhY3RzIHdpdGggdGhlIGJhY2tncm91bmQgYW5kIHRleHRcbi8vIGNsYXNzZXMgYmVjYXVzZSB0aGUgbW9kZSBtYXkgb3V0cHV0IHRva2VucyB0aGF0IGluZmx1ZW5jZSB0aGVzZVxuLy8gY2xhc3Nlcy5cbmZ1bmN0aW9uIHVwZGF0ZUxpbmVUZXh0KGNtLCBsaW5lVmlldykge1xuICB2YXIgY2xzID0gbGluZVZpZXcudGV4dC5jbGFzc05hbWU7XG4gIHZhciBidWlsdCA9IGdldExpbmVDb250ZW50KGNtLCBsaW5lVmlldyk7XG4gIGlmIChsaW5lVmlldy50ZXh0ID09IGxpbmVWaWV3Lm5vZGUpIHsgbGluZVZpZXcubm9kZSA9IGJ1aWx0LnByZTsgfVxuICBsaW5lVmlldy50ZXh0LnBhcmVudE5vZGUucmVwbGFjZUNoaWxkKGJ1aWx0LnByZSwgbGluZVZpZXcudGV4dCk7XG4gIGxpbmVWaWV3LnRleHQgPSBidWlsdC5wcmU7XG4gIGlmIChidWlsdC5iZ0NsYXNzICE9IGxpbmVWaWV3LmJnQ2xhc3MgfHwgYnVpbHQudGV4dENsYXNzICE9IGxpbmVWaWV3LnRleHRDbGFzcykge1xuICAgIGxpbmVWaWV3LmJnQ2xhc3MgPSBidWlsdC5iZ0NsYXNzO1xuICAgIGxpbmVWaWV3LnRleHRDbGFzcyA9IGJ1aWx0LnRleHRDbGFzcztcbiAgICB1cGRhdGVMaW5lQ2xhc3NlcyhjbSwgbGluZVZpZXcpO1xuICB9IGVsc2UgaWYgKGNscykge1xuICAgIGxpbmVWaWV3LnRleHQuY2xhc3NOYW1lID0gY2xzO1xuICB9XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZUxpbmVDbGFzc2VzKGNtLCBsaW5lVmlldykge1xuICB1cGRhdGVMaW5lQmFja2dyb3VuZChjbSwgbGluZVZpZXcpO1xuICBpZiAobGluZVZpZXcubGluZS53cmFwQ2xhc3MpXG4gICAgeyBlbnN1cmVMaW5lV3JhcHBlZChsaW5lVmlldykuY2xhc3NOYW1lID0gbGluZVZpZXcubGluZS53cmFwQ2xhc3M7IH1cbiAgZWxzZSBpZiAobGluZVZpZXcubm9kZSAhPSBsaW5lVmlldy50ZXh0KVxuICAgIHsgbGluZVZpZXcubm9kZS5jbGFzc05hbWUgPSBcIlwiOyB9XG4gIHZhciB0ZXh0Q2xhc3MgPSBsaW5lVmlldy50ZXh0Q2xhc3MgPyBsaW5lVmlldy50ZXh0Q2xhc3MgKyBcIiBcIiArIChsaW5lVmlldy5saW5lLnRleHRDbGFzcyB8fCBcIlwiKSA6IGxpbmVWaWV3LmxpbmUudGV4dENsYXNzO1xuICBsaW5lVmlldy50ZXh0LmNsYXNzTmFtZSA9IHRleHRDbGFzcyB8fCBcIlwiO1xufVxuXG5mdW5jdGlvbiB1cGRhdGVMaW5lR3V0dGVyKGNtLCBsaW5lVmlldywgbGluZU4sIGRpbXMpIHtcbiAgaWYgKGxpbmVWaWV3Lmd1dHRlcikge1xuICAgIGxpbmVWaWV3Lm5vZGUucmVtb3ZlQ2hpbGQobGluZVZpZXcuZ3V0dGVyKTtcbiAgICBsaW5lVmlldy5ndXR0ZXIgPSBudWxsO1xuICB9XG4gIGlmIChsaW5lVmlldy5ndXR0ZXJCYWNrZ3JvdW5kKSB7XG4gICAgbGluZVZpZXcubm9kZS5yZW1vdmVDaGlsZChsaW5lVmlldy5ndXR0ZXJCYWNrZ3JvdW5kKTtcbiAgICBsaW5lVmlldy5ndXR0ZXJCYWNrZ3JvdW5kID0gbnVsbDtcbiAgfVxuICBpZiAobGluZVZpZXcubGluZS5ndXR0ZXJDbGFzcykge1xuICAgIHZhciB3cmFwID0gZW5zdXJlTGluZVdyYXBwZWQobGluZVZpZXcpO1xuICAgIGxpbmVWaWV3Lmd1dHRlckJhY2tncm91bmQgPSBlbHQoXCJkaXZcIiwgbnVsbCwgXCJDb2RlTWlycm9yLWd1dHRlci1iYWNrZ3JvdW5kIFwiICsgbGluZVZpZXcubGluZS5ndXR0ZXJDbGFzcyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIChcImxlZnQ6IFwiICsgKGNtLm9wdGlvbnMuZml4ZWRHdXR0ZXIgPyBkaW1zLmZpeGVkUG9zIDogLWRpbXMuZ3V0dGVyVG90YWxXaWR0aCkgKyBcInB4OyB3aWR0aDogXCIgKyAoZGltcy5ndXR0ZXJUb3RhbFdpZHRoKSArIFwicHhcIikpO1xuICAgIGNtLmRpc3BsYXkuaW5wdXQuc2V0VW5lZGl0YWJsZShsaW5lVmlldy5ndXR0ZXJCYWNrZ3JvdW5kKTtcbiAgICB3cmFwLmluc2VydEJlZm9yZShsaW5lVmlldy5ndXR0ZXJCYWNrZ3JvdW5kLCBsaW5lVmlldy50ZXh0KTtcbiAgfVxuICB2YXIgbWFya2VycyA9IGxpbmVWaWV3LmxpbmUuZ3V0dGVyTWFya2VycztcbiAgaWYgKGNtLm9wdGlvbnMubGluZU51bWJlcnMgfHwgbWFya2Vycykge1xuICAgIHZhciB3cmFwJDEgPSBlbnN1cmVMaW5lV3JhcHBlZChsaW5lVmlldyk7XG4gICAgdmFyIGd1dHRlcldyYXAgPSBsaW5lVmlldy5ndXR0ZXIgPSBlbHQoXCJkaXZcIiwgbnVsbCwgXCJDb2RlTWlycm9yLWd1dHRlci13cmFwcGVyXCIsIChcImxlZnQ6IFwiICsgKGNtLm9wdGlvbnMuZml4ZWRHdXR0ZXIgPyBkaW1zLmZpeGVkUG9zIDogLWRpbXMuZ3V0dGVyVG90YWxXaWR0aCkgKyBcInB4XCIpKTtcbiAgICBjbS5kaXNwbGF5LmlucHV0LnNldFVuZWRpdGFibGUoZ3V0dGVyV3JhcCk7XG4gICAgd3JhcCQxLmluc2VydEJlZm9yZShndXR0ZXJXcmFwLCBsaW5lVmlldy50ZXh0KTtcbiAgICBpZiAobGluZVZpZXcubGluZS5ndXR0ZXJDbGFzcylcbiAgICAgIHsgZ3V0dGVyV3JhcC5jbGFzc05hbWUgKz0gXCIgXCIgKyBsaW5lVmlldy5saW5lLmd1dHRlckNsYXNzOyB9XG4gICAgaWYgKGNtLm9wdGlvbnMubGluZU51bWJlcnMgJiYgKCFtYXJrZXJzIHx8ICFtYXJrZXJzW1wiQ29kZU1pcnJvci1saW5lbnVtYmVyc1wiXSkpXG4gICAgICB7IGxpbmVWaWV3LmxpbmVOdW1iZXIgPSBndXR0ZXJXcmFwLmFwcGVuZENoaWxkKFxuICAgICAgICBlbHQoXCJkaXZcIiwgbGluZU51bWJlckZvcihjbS5vcHRpb25zLCBsaW5lTiksXG4gICAgICAgICAgICBcIkNvZGVNaXJyb3ItbGluZW51bWJlciBDb2RlTWlycm9yLWd1dHRlci1lbHRcIixcbiAgICAgICAgICAgIChcImxlZnQ6IFwiICsgKGRpbXMuZ3V0dGVyTGVmdFtcIkNvZGVNaXJyb3ItbGluZW51bWJlcnNcIl0pICsgXCJweDsgd2lkdGg6IFwiICsgKGNtLmRpc3BsYXkubGluZU51bUlubmVyV2lkdGgpICsgXCJweFwiKSkpOyB9XG4gICAgaWYgKG1hcmtlcnMpIHsgZm9yICh2YXIgayA9IDA7IGsgPCBjbS5vcHRpb25zLmd1dHRlcnMubGVuZ3RoOyArK2spIHtcbiAgICAgIHZhciBpZCA9IGNtLm9wdGlvbnMuZ3V0dGVyc1trXSwgZm91bmQgPSBtYXJrZXJzLmhhc093blByb3BlcnR5KGlkKSAmJiBtYXJrZXJzW2lkXTtcbiAgICAgIGlmIChmb3VuZClcbiAgICAgICAgeyBndXR0ZXJXcmFwLmFwcGVuZENoaWxkKGVsdChcImRpdlwiLCBbZm91bmRdLCBcIkNvZGVNaXJyb3ItZ3V0dGVyLWVsdFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAoXCJsZWZ0OiBcIiArIChkaW1zLmd1dHRlckxlZnRbaWRdKSArIFwicHg7IHdpZHRoOiBcIiArIChkaW1zLmd1dHRlcldpZHRoW2lkXSkgKyBcInB4XCIpKSk7IH1cbiAgICB9IH1cbiAgfVxufVxuXG5mdW5jdGlvbiB1cGRhdGVMaW5lV2lkZ2V0cyhjbSwgbGluZVZpZXcsIGRpbXMpIHtcbiAgaWYgKGxpbmVWaWV3LmFsaWduYWJsZSkgeyBsaW5lVmlldy5hbGlnbmFibGUgPSBudWxsOyB9XG4gIGZvciAodmFyIG5vZGUgPSBsaW5lVmlldy5ub2RlLmZpcnN0Q2hpbGQsIG5leHQgPSAodm9pZCAwKTsgbm9kZTsgbm9kZSA9IG5leHQpIHtcbiAgICBuZXh0ID0gbm9kZS5uZXh0U2libGluZztcbiAgICBpZiAobm9kZS5jbGFzc05hbWUgPT0gXCJDb2RlTWlycm9yLWxpbmV3aWRnZXRcIilcbiAgICAgIHsgbGluZVZpZXcubm9kZS5yZW1vdmVDaGlsZChub2RlKTsgfVxuICB9XG4gIGluc2VydExpbmVXaWRnZXRzKGNtLCBsaW5lVmlldywgZGltcyk7XG59XG5cbi8vIEJ1aWxkIGEgbGluZSdzIERPTSByZXByZXNlbnRhdGlvbiBmcm9tIHNjcmF0Y2hcbmZ1bmN0aW9uIGJ1aWxkTGluZUVsZW1lbnQoY20sIGxpbmVWaWV3LCBsaW5lTiwgZGltcykge1xuICB2YXIgYnVpbHQgPSBnZXRMaW5lQ29udGVudChjbSwgbGluZVZpZXcpO1xuICBsaW5lVmlldy50ZXh0ID0gbGluZVZpZXcubm9kZSA9IGJ1aWx0LnByZTtcbiAgaWYgKGJ1aWx0LmJnQ2xhc3MpIHsgbGluZVZpZXcuYmdDbGFzcyA9IGJ1aWx0LmJnQ2xhc3M7IH1cbiAgaWYgKGJ1aWx0LnRleHRDbGFzcykgeyBsaW5lVmlldy50ZXh0Q2xhc3MgPSBidWlsdC50ZXh0Q2xhc3M7IH1cblxuICB1cGRhdGVMaW5lQ2xhc3NlcyhjbSwgbGluZVZpZXcpO1xuICB1cGRhdGVMaW5lR3V0dGVyKGNtLCBsaW5lVmlldywgbGluZU4sIGRpbXMpO1xuICBpbnNlcnRMaW5lV2lkZ2V0cyhjbSwgbGluZVZpZXcsIGRpbXMpO1xuICByZXR1cm4gbGluZVZpZXcubm9kZVxufVxuXG4vLyBBIGxpbmVWaWV3IG1heSBjb250YWluIG11bHRpcGxlIGxvZ2ljYWwgbGluZXMgKHdoZW4gbWVyZ2VkIGJ5XG4vLyBjb2xsYXBzZWQgc3BhbnMpLiBUaGUgd2lkZ2V0cyBmb3IgYWxsIG9mIHRoZW0gbmVlZCB0byBiZSBkcmF3bi5cbmZ1bmN0aW9uIGluc2VydExpbmVXaWRnZXRzKGNtLCBsaW5lVmlldywgZGltcykge1xuICBpbnNlcnRMaW5lV2lkZ2V0c0ZvcihjbSwgbGluZVZpZXcubGluZSwgbGluZVZpZXcsIGRpbXMsIHRydWUpO1xuICBpZiAobGluZVZpZXcucmVzdCkgeyBmb3IgKHZhciBpID0gMDsgaSA8IGxpbmVWaWV3LnJlc3QubGVuZ3RoOyBpKyspXG4gICAgeyBpbnNlcnRMaW5lV2lkZ2V0c0ZvcihjbSwgbGluZVZpZXcucmVzdFtpXSwgbGluZVZpZXcsIGRpbXMsIGZhbHNlKTsgfSB9XG59XG5cbmZ1bmN0aW9uIGluc2VydExpbmVXaWRnZXRzRm9yKGNtLCBsaW5lLCBsaW5lVmlldywgZGltcywgYWxsb3dBYm92ZSkge1xuICBpZiAoIWxpbmUud2lkZ2V0cykgeyByZXR1cm4gfVxuICB2YXIgd3JhcCA9IGVuc3VyZUxpbmVXcmFwcGVkKGxpbmVWaWV3KTtcbiAgZm9yICh2YXIgaSA9IDAsIHdzID0gbGluZS53aWRnZXRzOyBpIDwgd3MubGVuZ3RoOyArK2kpIHtcbiAgICB2YXIgd2lkZ2V0ID0gd3NbaV0sIG5vZGUgPSBlbHQoXCJkaXZcIiwgW3dpZGdldC5ub2RlXSwgXCJDb2RlTWlycm9yLWxpbmV3aWRnZXRcIik7XG4gICAgaWYgKCF3aWRnZXQuaGFuZGxlTW91c2VFdmVudHMpIHsgbm9kZS5zZXRBdHRyaWJ1dGUoXCJjbS1pZ25vcmUtZXZlbnRzXCIsIFwidHJ1ZVwiKTsgfVxuICAgIHBvc2l0aW9uTGluZVdpZGdldCh3aWRnZXQsIG5vZGUsIGxpbmVWaWV3LCBkaW1zKTtcbiAgICBjbS5kaXNwbGF5LmlucHV0LnNldFVuZWRpdGFibGUobm9kZSk7XG4gICAgaWYgKGFsbG93QWJvdmUgJiYgd2lkZ2V0LmFib3ZlKVxuICAgICAgeyB3cmFwLmluc2VydEJlZm9yZShub2RlLCBsaW5lVmlldy5ndXR0ZXIgfHwgbGluZVZpZXcudGV4dCk7IH1cbiAgICBlbHNlXG4gICAgICB7IHdyYXAuYXBwZW5kQ2hpbGQobm9kZSk7IH1cbiAgICBzaWduYWxMYXRlcih3aWRnZXQsIFwicmVkcmF3XCIpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHBvc2l0aW9uTGluZVdpZGdldCh3aWRnZXQsIG5vZGUsIGxpbmVWaWV3LCBkaW1zKSB7XG4gIGlmICh3aWRnZXQubm9IU2Nyb2xsKSB7XG4gICAgKGxpbmVWaWV3LmFsaWduYWJsZSB8fCAobGluZVZpZXcuYWxpZ25hYmxlID0gW10pKS5wdXNoKG5vZGUpO1xuICAgIHZhciB3aWR0aCA9IGRpbXMud3JhcHBlcldpZHRoO1xuICAgIG5vZGUuc3R5bGUubGVmdCA9IGRpbXMuZml4ZWRQb3MgKyBcInB4XCI7XG4gICAgaWYgKCF3aWRnZXQuY292ZXJHdXR0ZXIpIHtcbiAgICAgIHdpZHRoIC09IGRpbXMuZ3V0dGVyVG90YWxXaWR0aDtcbiAgICAgIG5vZGUuc3R5bGUucGFkZGluZ0xlZnQgPSBkaW1zLmd1dHRlclRvdGFsV2lkdGggKyBcInB4XCI7XG4gICAgfVxuICAgIG5vZGUuc3R5bGUud2lkdGggPSB3aWR0aCArIFwicHhcIjtcbiAgfVxuICBpZiAod2lkZ2V0LmNvdmVyR3V0dGVyKSB7XG4gICAgbm9kZS5zdHlsZS56SW5kZXggPSA1O1xuICAgIG5vZGUuc3R5bGUucG9zaXRpb24gPSBcInJlbGF0aXZlXCI7XG4gICAgaWYgKCF3aWRnZXQubm9IU2Nyb2xsKSB7IG5vZGUuc3R5bGUubWFyZ2luTGVmdCA9IC1kaW1zLmd1dHRlclRvdGFsV2lkdGggKyBcInB4XCI7IH1cbiAgfVxufVxuXG5mdW5jdGlvbiB3aWRnZXRIZWlnaHQod2lkZ2V0KSB7XG4gIGlmICh3aWRnZXQuaGVpZ2h0ICE9IG51bGwpIHsgcmV0dXJuIHdpZGdldC5oZWlnaHQgfVxuICB2YXIgY20gPSB3aWRnZXQuZG9jLmNtO1xuICBpZiAoIWNtKSB7IHJldHVybiAwIH1cbiAgaWYgKCFjb250YWlucyhkb2N1bWVudC5ib2R5LCB3aWRnZXQubm9kZSkpIHtcbiAgICB2YXIgcGFyZW50U3R5bGUgPSBcInBvc2l0aW9uOiByZWxhdGl2ZTtcIjtcbiAgICBpZiAod2lkZ2V0LmNvdmVyR3V0dGVyKVxuICAgICAgeyBwYXJlbnRTdHlsZSArPSBcIm1hcmdpbi1sZWZ0OiAtXCIgKyBjbS5kaXNwbGF5Lmd1dHRlcnMub2Zmc2V0V2lkdGggKyBcInB4O1wiOyB9XG4gICAgaWYgKHdpZGdldC5ub0hTY3JvbGwpXG4gICAgICB7IHBhcmVudFN0eWxlICs9IFwid2lkdGg6IFwiICsgY20uZGlzcGxheS53cmFwcGVyLmNsaWVudFdpZHRoICsgXCJweDtcIjsgfVxuICAgIHJlbW92ZUNoaWxkcmVuQW5kQWRkKGNtLmRpc3BsYXkubWVhc3VyZSwgZWx0KFwiZGl2XCIsIFt3aWRnZXQubm9kZV0sIG51bGwsIHBhcmVudFN0eWxlKSk7XG4gIH1cbiAgcmV0dXJuIHdpZGdldC5oZWlnaHQgPSB3aWRnZXQubm9kZS5wYXJlbnROb2RlLm9mZnNldEhlaWdodFxufVxuXG4vLyBSZXR1cm4gdHJ1ZSB3aGVuIHRoZSBnaXZlbiBtb3VzZSBldmVudCBoYXBwZW5lZCBpbiBhIHdpZGdldFxuZnVuY3Rpb24gZXZlbnRJbldpZGdldChkaXNwbGF5LCBlKSB7XG4gIGZvciAodmFyIG4gPSBlX3RhcmdldChlKTsgbiAhPSBkaXNwbGF5LndyYXBwZXI7IG4gPSBuLnBhcmVudE5vZGUpIHtcbiAgICBpZiAoIW4gfHwgKG4ubm9kZVR5cGUgPT0gMSAmJiBuLmdldEF0dHJpYnV0ZShcImNtLWlnbm9yZS1ldmVudHNcIikgPT0gXCJ0cnVlXCIpIHx8XG4gICAgICAgIChuLnBhcmVudE5vZGUgPT0gZGlzcGxheS5zaXplciAmJiBuICE9IGRpc3BsYXkubW92ZXIpKVxuICAgICAgeyByZXR1cm4gdHJ1ZSB9XG4gIH1cbn1cblxuLy8gUE9TSVRJT04gTUVBU1VSRU1FTlRcblxuZnVuY3Rpb24gcGFkZGluZ1RvcChkaXNwbGF5KSB7cmV0dXJuIGRpc3BsYXkubGluZVNwYWNlLm9mZnNldFRvcH1cbmZ1bmN0aW9uIHBhZGRpbmdWZXJ0KGRpc3BsYXkpIHtyZXR1cm4gZGlzcGxheS5tb3Zlci5vZmZzZXRIZWlnaHQgLSBkaXNwbGF5LmxpbmVTcGFjZS5vZmZzZXRIZWlnaHR9XG5mdW5jdGlvbiBwYWRkaW5nSChkaXNwbGF5KSB7XG4gIGlmIChkaXNwbGF5LmNhY2hlZFBhZGRpbmdIKSB7IHJldHVybiBkaXNwbGF5LmNhY2hlZFBhZGRpbmdIIH1cbiAgdmFyIGUgPSByZW1vdmVDaGlsZHJlbkFuZEFkZChkaXNwbGF5Lm1lYXN1cmUsIGVsdChcInByZVwiLCBcInhcIikpO1xuICB2YXIgc3R5bGUgPSB3aW5kb3cuZ2V0Q29tcHV0ZWRTdHlsZSA/IHdpbmRvdy5nZXRDb21wdXRlZFN0eWxlKGUpIDogZS5jdXJyZW50U3R5bGU7XG4gIHZhciBkYXRhID0ge2xlZnQ6IHBhcnNlSW50KHN0eWxlLnBhZGRpbmdMZWZ0KSwgcmlnaHQ6IHBhcnNlSW50KHN0eWxlLnBhZGRpbmdSaWdodCl9O1xuICBpZiAoIWlzTmFOKGRhdGEubGVmdCkgJiYgIWlzTmFOKGRhdGEucmlnaHQpKSB7IGRpc3BsYXkuY2FjaGVkUGFkZGluZ0ggPSBkYXRhOyB9XG4gIHJldHVybiBkYXRhXG59XG5cbmZ1bmN0aW9uIHNjcm9sbEdhcChjbSkgeyByZXR1cm4gc2Nyb2xsZXJHYXAgLSBjbS5kaXNwbGF5Lm5hdGl2ZUJhcldpZHRoIH1cbmZ1bmN0aW9uIGRpc3BsYXlXaWR0aChjbSkge1xuICByZXR1cm4gY20uZGlzcGxheS5zY3JvbGxlci5jbGllbnRXaWR0aCAtIHNjcm9sbEdhcChjbSkgLSBjbS5kaXNwbGF5LmJhcldpZHRoXG59XG5mdW5jdGlvbiBkaXNwbGF5SGVpZ2h0KGNtKSB7XG4gIHJldHVybiBjbS5kaXNwbGF5LnNjcm9sbGVyLmNsaWVudEhlaWdodCAtIHNjcm9sbEdhcChjbSkgLSBjbS5kaXNwbGF5LmJhckhlaWdodFxufVxuXG4vLyBFbnN1cmUgdGhlIGxpbmVWaWV3LndyYXBwaW5nLmhlaWdodHMgYXJyYXkgaXMgcG9wdWxhdGVkLiBUaGlzIGlzXG4vLyBhbiBhcnJheSBvZiBib3R0b20gb2Zmc2V0cyBmb3IgdGhlIGxpbmVzIHRoYXQgbWFrZSB1cCBhIGRyYXduXG4vLyBsaW5lLiBXaGVuIGxpbmVXcmFwcGluZyBpcyBvbiwgdGhlcmUgbWlnaHQgYmUgbW9yZSB0aGFuIG9uZVxuLy8gaGVpZ2h0LlxuZnVuY3Rpb24gZW5zdXJlTGluZUhlaWdodHMoY20sIGxpbmVWaWV3LCByZWN0KSB7XG4gIHZhciB3cmFwcGluZyA9IGNtLm9wdGlvbnMubGluZVdyYXBwaW5nO1xuICB2YXIgY3VyV2lkdGggPSB3cmFwcGluZyAmJiBkaXNwbGF5V2lkdGgoY20pO1xuICBpZiAoIWxpbmVWaWV3Lm1lYXN1cmUuaGVpZ2h0cyB8fCB3cmFwcGluZyAmJiBsaW5lVmlldy5tZWFzdXJlLndpZHRoICE9IGN1cldpZHRoKSB7XG4gICAgdmFyIGhlaWdodHMgPSBsaW5lVmlldy5tZWFzdXJlLmhlaWdodHMgPSBbXTtcbiAgICBpZiAod3JhcHBpbmcpIHtcbiAgICAgIGxpbmVWaWV3Lm1lYXN1cmUud2lkdGggPSBjdXJXaWR0aDtcbiAgICAgIHZhciByZWN0cyA9IGxpbmVWaWV3LnRleHQuZmlyc3RDaGlsZC5nZXRDbGllbnRSZWN0cygpO1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCByZWN0cy5sZW5ndGggLSAxOyBpKyspIHtcbiAgICAgICAgdmFyIGN1ciA9IHJlY3RzW2ldLCBuZXh0ID0gcmVjdHNbaSArIDFdO1xuICAgICAgICBpZiAoTWF0aC5hYnMoY3VyLmJvdHRvbSAtIG5leHQuYm90dG9tKSA+IDIpXG4gICAgICAgICAgeyBoZWlnaHRzLnB1c2goKGN1ci5ib3R0b20gKyBuZXh0LnRvcCkgLyAyIC0gcmVjdC50b3ApOyB9XG4gICAgICB9XG4gICAgfVxuICAgIGhlaWdodHMucHVzaChyZWN0LmJvdHRvbSAtIHJlY3QudG9wKTtcbiAgfVxufVxuXG4vLyBGaW5kIGEgbGluZSBtYXAgKG1hcHBpbmcgY2hhcmFjdGVyIG9mZnNldHMgdG8gdGV4dCBub2RlcykgYW5kIGFcbi8vIG1lYXN1cmVtZW50IGNhY2hlIGZvciB0aGUgZ2l2ZW4gbGluZSBudW1iZXIuIChBIGxpbmUgdmlldyBtaWdodFxuLy8gY29udGFpbiBtdWx0aXBsZSBsaW5lcyB3aGVuIGNvbGxhcHNlZCByYW5nZXMgYXJlIHByZXNlbnQuKVxuZnVuY3Rpb24gbWFwRnJvbUxpbmVWaWV3KGxpbmVWaWV3LCBsaW5lLCBsaW5lTikge1xuICBpZiAobGluZVZpZXcubGluZSA9PSBsaW5lKVxuICAgIHsgcmV0dXJuIHttYXA6IGxpbmVWaWV3Lm1lYXN1cmUubWFwLCBjYWNoZTogbGluZVZpZXcubWVhc3VyZS5jYWNoZX0gfVxuICBmb3IgKHZhciBpID0gMDsgaSA8IGxpbmVWaWV3LnJlc3QubGVuZ3RoOyBpKyspXG4gICAgeyBpZiAobGluZVZpZXcucmVzdFtpXSA9PSBsaW5lKVxuICAgICAgeyByZXR1cm4ge21hcDogbGluZVZpZXcubWVhc3VyZS5tYXBzW2ldLCBjYWNoZTogbGluZVZpZXcubWVhc3VyZS5jYWNoZXNbaV19IH0gfVxuICBmb3IgKHZhciBpJDEgPSAwOyBpJDEgPCBsaW5lVmlldy5yZXN0Lmxlbmd0aDsgaSQxKyspXG4gICAgeyBpZiAobGluZU5vKGxpbmVWaWV3LnJlc3RbaSQxXSkgPiBsaW5lTilcbiAgICAgIHsgcmV0dXJuIHttYXA6IGxpbmVWaWV3Lm1lYXN1cmUubWFwc1tpJDFdLCBjYWNoZTogbGluZVZpZXcubWVhc3VyZS5jYWNoZXNbaSQxXSwgYmVmb3JlOiB0cnVlfSB9IH1cbn1cblxuLy8gUmVuZGVyIGEgbGluZSBpbnRvIHRoZSBoaWRkZW4gbm9kZSBkaXNwbGF5LmV4dGVybmFsTWVhc3VyZWQuIFVzZWRcbi8vIHdoZW4gbWVhc3VyZW1lbnQgaXMgbmVlZGVkIGZvciBhIGxpbmUgdGhhdCdzIG5vdCBpbiB0aGUgdmlld3BvcnQuXG5mdW5jdGlvbiB1cGRhdGVFeHRlcm5hbE1lYXN1cmVtZW50KGNtLCBsaW5lKSB7XG4gIGxpbmUgPSB2aXN1YWxMaW5lKGxpbmUpO1xuICB2YXIgbGluZU4gPSBsaW5lTm8obGluZSk7XG4gIHZhciB2aWV3ID0gY20uZGlzcGxheS5leHRlcm5hbE1lYXN1cmVkID0gbmV3IExpbmVWaWV3KGNtLmRvYywgbGluZSwgbGluZU4pO1xuICB2aWV3LmxpbmVOID0gbGluZU47XG4gIHZhciBidWlsdCA9IHZpZXcuYnVpbHQgPSBidWlsZExpbmVDb250ZW50KGNtLCB2aWV3KTtcbiAgdmlldy50ZXh0ID0gYnVpbHQucHJlO1xuICByZW1vdmVDaGlsZHJlbkFuZEFkZChjbS5kaXNwbGF5LmxpbmVNZWFzdXJlLCBidWlsdC5wcmUpO1xuICByZXR1cm4gdmlld1xufVxuXG4vLyBHZXQgYSB7dG9wLCBib3R0b20sIGxlZnQsIHJpZ2h0fSBib3ggKGluIGxpbmUtbG9jYWwgY29vcmRpbmF0ZXMpXG4vLyBmb3IgYSBnaXZlbiBjaGFyYWN0ZXIuXG5mdW5jdGlvbiBtZWFzdXJlQ2hhcihjbSwgbGluZSwgY2gsIGJpYXMpIHtcbiAgcmV0dXJuIG1lYXN1cmVDaGFyUHJlcGFyZWQoY20sIHByZXBhcmVNZWFzdXJlRm9yTGluZShjbSwgbGluZSksIGNoLCBiaWFzKVxufVxuXG4vLyBGaW5kIGEgbGluZSB2aWV3IHRoYXQgY29ycmVzcG9uZHMgdG8gdGhlIGdpdmVuIGxpbmUgbnVtYmVyLlxuZnVuY3Rpb24gZmluZFZpZXdGb3JMaW5lKGNtLCBsaW5lTikge1xuICBpZiAobGluZU4gPj0gY20uZGlzcGxheS52aWV3RnJvbSAmJiBsaW5lTiA8IGNtLmRpc3BsYXkudmlld1RvKVxuICAgIHsgcmV0dXJuIGNtLmRpc3BsYXkudmlld1tmaW5kVmlld0luZGV4KGNtLCBsaW5lTildIH1cbiAgdmFyIGV4dCA9IGNtLmRpc3BsYXkuZXh0ZXJuYWxNZWFzdXJlZDtcbiAgaWYgKGV4dCAmJiBsaW5lTiA+PSBleHQubGluZU4gJiYgbGluZU4gPCBleHQubGluZU4gKyBleHQuc2l6ZSlcbiAgICB7IHJldHVybiBleHQgfVxufVxuXG4vLyBNZWFzdXJlbWVudCBjYW4gYmUgc3BsaXQgaW4gdHdvIHN0ZXBzLCB0aGUgc2V0LXVwIHdvcmsgdGhhdFxuLy8gYXBwbGllcyB0byB0aGUgd2hvbGUgbGluZSwgYW5kIHRoZSBtZWFzdXJlbWVudCBvZiB0aGUgYWN0dWFsXG4vLyBjaGFyYWN0ZXIuIEZ1bmN0aW9ucyBsaWtlIGNvb3Jkc0NoYXIsIHRoYXQgbmVlZCB0byBkbyBhIGxvdCBvZlxuLy8gbWVhc3VyZW1lbnRzIGluIGEgcm93LCBjYW4gdGh1cyBlbnN1cmUgdGhhdCB0aGUgc2V0LXVwIHdvcmsgaXNcbi8vIG9ubHkgZG9uZSBvbmNlLlxuZnVuY3Rpb24gcHJlcGFyZU1lYXN1cmVGb3JMaW5lKGNtLCBsaW5lKSB7XG4gIHZhciBsaW5lTiA9IGxpbmVObyhsaW5lKTtcbiAgdmFyIHZpZXcgPSBmaW5kVmlld0ZvckxpbmUoY20sIGxpbmVOKTtcbiAgaWYgKHZpZXcgJiYgIXZpZXcudGV4dCkge1xuICAgIHZpZXcgPSBudWxsO1xuICB9IGVsc2UgaWYgKHZpZXcgJiYgdmlldy5jaGFuZ2VzKSB7XG4gICAgdXBkYXRlTGluZUZvckNoYW5nZXMoY20sIHZpZXcsIGxpbmVOLCBnZXREaW1lbnNpb25zKGNtKSk7XG4gICAgY20uY3VyT3AuZm9yY2VVcGRhdGUgPSB0cnVlO1xuICB9XG4gIGlmICghdmlldylcbiAgICB7IHZpZXcgPSB1cGRhdGVFeHRlcm5hbE1lYXN1cmVtZW50KGNtLCBsaW5lKTsgfVxuXG4gIHZhciBpbmZvID0gbWFwRnJvbUxpbmVWaWV3KHZpZXcsIGxpbmUsIGxpbmVOKTtcbiAgcmV0dXJuIHtcbiAgICBsaW5lOiBsaW5lLCB2aWV3OiB2aWV3LCByZWN0OiBudWxsLFxuICAgIG1hcDogaW5mby5tYXAsIGNhY2hlOiBpbmZvLmNhY2hlLCBiZWZvcmU6IGluZm8uYmVmb3JlLFxuICAgIGhhc0hlaWdodHM6IGZhbHNlXG4gIH1cbn1cblxuLy8gR2l2ZW4gYSBwcmVwYXJlZCBtZWFzdXJlbWVudCBvYmplY3QsIG1lYXN1cmVzIHRoZSBwb3NpdGlvbiBvZiBhblxuLy8gYWN0dWFsIGNoYXJhY3RlciAob3IgZmV0Y2hlcyBpdCBmcm9tIHRoZSBjYWNoZSkuXG5mdW5jdGlvbiBtZWFzdXJlQ2hhclByZXBhcmVkKGNtLCBwcmVwYXJlZCwgY2gsIGJpYXMsIHZhckhlaWdodCkge1xuICBpZiAocHJlcGFyZWQuYmVmb3JlKSB7IGNoID0gLTE7IH1cbiAgdmFyIGtleSA9IGNoICsgKGJpYXMgfHwgXCJcIiksIGZvdW5kO1xuICBpZiAocHJlcGFyZWQuY2FjaGUuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuICAgIGZvdW5kID0gcHJlcGFyZWQuY2FjaGVba2V5XTtcbiAgfSBlbHNlIHtcbiAgICBpZiAoIXByZXBhcmVkLnJlY3QpXG4gICAgICB7IHByZXBhcmVkLnJlY3QgPSBwcmVwYXJlZC52aWV3LnRleHQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7IH1cbiAgICBpZiAoIXByZXBhcmVkLmhhc0hlaWdodHMpIHtcbiAgICAgIGVuc3VyZUxpbmVIZWlnaHRzKGNtLCBwcmVwYXJlZC52aWV3LCBwcmVwYXJlZC5yZWN0KTtcbiAgICAgIHByZXBhcmVkLmhhc0hlaWdodHMgPSB0cnVlO1xuICAgIH1cbiAgICBmb3VuZCA9IG1lYXN1cmVDaGFySW5uZXIoY20sIHByZXBhcmVkLCBjaCwgYmlhcyk7XG4gICAgaWYgKCFmb3VuZC5ib2d1cykgeyBwcmVwYXJlZC5jYWNoZVtrZXldID0gZm91bmQ7IH1cbiAgfVxuICByZXR1cm4ge2xlZnQ6IGZvdW5kLmxlZnQsIHJpZ2h0OiBmb3VuZC5yaWdodCxcbiAgICAgICAgICB0b3A6IHZhckhlaWdodCA/IGZvdW5kLnJ0b3AgOiBmb3VuZC50b3AsXG4gICAgICAgICAgYm90dG9tOiB2YXJIZWlnaHQgPyBmb3VuZC5yYm90dG9tIDogZm91bmQuYm90dG9tfVxufVxuXG52YXIgbnVsbFJlY3QgPSB7bGVmdDogMCwgcmlnaHQ6IDAsIHRvcDogMCwgYm90dG9tOiAwfTtcblxuZnVuY3Rpb24gbm9kZUFuZE9mZnNldEluTGluZU1hcChtYXAkJDEsIGNoLCBiaWFzKSB7XG4gIHZhciBub2RlLCBzdGFydCwgZW5kLCBjb2xsYXBzZSwgbVN0YXJ0LCBtRW5kO1xuICAvLyBGaXJzdCwgc2VhcmNoIHRoZSBsaW5lIG1hcCBmb3IgdGhlIHRleHQgbm9kZSBjb3JyZXNwb25kaW5nIHRvLFxuICAvLyBvciBjbG9zZXN0IHRvLCB0aGUgdGFyZ2V0IGNoYXJhY3Rlci5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBtYXAkJDEubGVuZ3RoOyBpICs9IDMpIHtcbiAgICBtU3RhcnQgPSBtYXAkJDFbaV07XG4gICAgbUVuZCA9IG1hcCQkMVtpICsgMV07XG4gICAgaWYgKGNoIDwgbVN0YXJ0KSB7XG4gICAgICBzdGFydCA9IDA7IGVuZCA9IDE7XG4gICAgICBjb2xsYXBzZSA9IFwibGVmdFwiO1xuICAgIH0gZWxzZSBpZiAoY2ggPCBtRW5kKSB7XG4gICAgICBzdGFydCA9IGNoIC0gbVN0YXJ0O1xuICAgICAgZW5kID0gc3RhcnQgKyAxO1xuICAgIH0gZWxzZSBpZiAoaSA9PSBtYXAkJDEubGVuZ3RoIC0gMyB8fCBjaCA9PSBtRW5kICYmIG1hcCQkMVtpICsgM10gPiBjaCkge1xuICAgICAgZW5kID0gbUVuZCAtIG1TdGFydDtcbiAgICAgIHN0YXJ0ID0gZW5kIC0gMTtcbiAgICAgIGlmIChjaCA+PSBtRW5kKSB7IGNvbGxhcHNlID0gXCJyaWdodFwiOyB9XG4gICAgfVxuICAgIGlmIChzdGFydCAhPSBudWxsKSB7XG4gICAgICBub2RlID0gbWFwJCQxW2kgKyAyXTtcbiAgICAgIGlmIChtU3RhcnQgPT0gbUVuZCAmJiBiaWFzID09IChub2RlLmluc2VydExlZnQgPyBcImxlZnRcIiA6IFwicmlnaHRcIikpXG4gICAgICAgIHsgY29sbGFwc2UgPSBiaWFzOyB9XG4gICAgICBpZiAoYmlhcyA9PSBcImxlZnRcIiAmJiBzdGFydCA9PSAwKVxuICAgICAgICB7IHdoaWxlIChpICYmIG1hcCQkMVtpIC0gMl0gPT0gbWFwJCQxW2kgLSAzXSAmJiBtYXAkJDFbaSAtIDFdLmluc2VydExlZnQpIHtcbiAgICAgICAgICBub2RlID0gbWFwJCQxWyhpIC09IDMpICsgMl07XG4gICAgICAgICAgY29sbGFwc2UgPSBcImxlZnRcIjtcbiAgICAgICAgfSB9XG4gICAgICBpZiAoYmlhcyA9PSBcInJpZ2h0XCIgJiYgc3RhcnQgPT0gbUVuZCAtIG1TdGFydClcbiAgICAgICAgeyB3aGlsZSAoaSA8IG1hcCQkMS5sZW5ndGggLSAzICYmIG1hcCQkMVtpICsgM10gPT0gbWFwJCQxW2kgKyA0XSAmJiAhbWFwJCQxW2kgKyA1XS5pbnNlcnRMZWZ0KSB7XG4gICAgICAgICAgbm9kZSA9IG1hcCQkMVsoaSArPSAzKSArIDJdO1xuICAgICAgICAgIGNvbGxhcHNlID0gXCJyaWdodFwiO1xuICAgICAgICB9IH1cbiAgICAgIGJyZWFrXG4gICAgfVxuICB9XG4gIHJldHVybiB7bm9kZTogbm9kZSwgc3RhcnQ6IHN0YXJ0LCBlbmQ6IGVuZCwgY29sbGFwc2U6IGNvbGxhcHNlLCBjb3ZlclN0YXJ0OiBtU3RhcnQsIGNvdmVyRW5kOiBtRW5kfVxufVxuXG5mdW5jdGlvbiBnZXRVc2VmdWxSZWN0KHJlY3RzLCBiaWFzKSB7XG4gIHZhciByZWN0ID0gbnVsbFJlY3Q7XG4gIGlmIChiaWFzID09IFwibGVmdFwiKSB7IGZvciAodmFyIGkgPSAwOyBpIDwgcmVjdHMubGVuZ3RoOyBpKyspIHtcbiAgICBpZiAoKHJlY3QgPSByZWN0c1tpXSkubGVmdCAhPSByZWN0LnJpZ2h0KSB7IGJyZWFrIH1cbiAgfSB9IGVsc2UgeyBmb3IgKHZhciBpJDEgPSByZWN0cy5sZW5ndGggLSAxOyBpJDEgPj0gMDsgaSQxLS0pIHtcbiAgICBpZiAoKHJlY3QgPSByZWN0c1tpJDFdKS5sZWZ0ICE9IHJlY3QucmlnaHQpIHsgYnJlYWsgfVxuICB9IH1cbiAgcmV0dXJuIHJlY3Rcbn1cblxuZnVuY3Rpb24gbWVhc3VyZUNoYXJJbm5lcihjbSwgcHJlcGFyZWQsIGNoLCBiaWFzKSB7XG4gIHZhciBwbGFjZSA9IG5vZGVBbmRPZmZzZXRJbkxpbmVNYXAocHJlcGFyZWQubWFwLCBjaCwgYmlhcyk7XG4gIHZhciBub2RlID0gcGxhY2Uubm9kZSwgc3RhcnQgPSBwbGFjZS5zdGFydCwgZW5kID0gcGxhY2UuZW5kLCBjb2xsYXBzZSA9IHBsYWNlLmNvbGxhcHNlO1xuXG4gIHZhciByZWN0O1xuICBpZiAobm9kZS5ub2RlVHlwZSA9PSAzKSB7IC8vIElmIGl0IGlzIGEgdGV4dCBub2RlLCB1c2UgYSByYW5nZSB0byByZXRyaWV2ZSB0aGUgY29vcmRpbmF0ZXMuXG4gICAgZm9yICh2YXIgaSQxID0gMDsgaSQxIDwgNDsgaSQxKyspIHsgLy8gUmV0cnkgYSBtYXhpbXVtIG9mIDQgdGltZXMgd2hlbiBub25zZW5zZSByZWN0YW5nbGVzIGFyZSByZXR1cm5lZFxuICAgICAgd2hpbGUgKHN0YXJ0ICYmIGlzRXh0ZW5kaW5nQ2hhcihwcmVwYXJlZC5saW5lLnRleHQuY2hhckF0KHBsYWNlLmNvdmVyU3RhcnQgKyBzdGFydCkpKSB7IC0tc3RhcnQ7IH1cbiAgICAgIHdoaWxlIChwbGFjZS5jb3ZlclN0YXJ0ICsgZW5kIDwgcGxhY2UuY292ZXJFbmQgJiYgaXNFeHRlbmRpbmdDaGFyKHByZXBhcmVkLmxpbmUudGV4dC5jaGFyQXQocGxhY2UuY292ZXJTdGFydCArIGVuZCkpKSB7ICsrZW5kOyB9XG4gICAgICBpZiAoaWUgJiYgaWVfdmVyc2lvbiA8IDkgJiYgc3RhcnQgPT0gMCAmJiBlbmQgPT0gcGxhY2UuY292ZXJFbmQgLSBwbGFjZS5jb3ZlclN0YXJ0KVxuICAgICAgICB7IHJlY3QgPSBub2RlLnBhcmVudE5vZGUuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7IH1cbiAgICAgIGVsc2VcbiAgICAgICAgeyByZWN0ID0gZ2V0VXNlZnVsUmVjdChyYW5nZShub2RlLCBzdGFydCwgZW5kKS5nZXRDbGllbnRSZWN0cygpLCBiaWFzKTsgfVxuICAgICAgaWYgKHJlY3QubGVmdCB8fCByZWN0LnJpZ2h0IHx8IHN0YXJ0ID09IDApIHsgYnJlYWsgfVxuICAgICAgZW5kID0gc3RhcnQ7XG4gICAgICBzdGFydCA9IHN0YXJ0IC0gMTtcbiAgICAgIGNvbGxhcHNlID0gXCJyaWdodFwiO1xuICAgIH1cbiAgICBpZiAoaWUgJiYgaWVfdmVyc2lvbiA8IDExKSB7IHJlY3QgPSBtYXliZVVwZGF0ZVJlY3RGb3Jab29taW5nKGNtLmRpc3BsYXkubWVhc3VyZSwgcmVjdCk7IH1cbiAgfSBlbHNlIHsgLy8gSWYgaXQgaXMgYSB3aWRnZXQsIHNpbXBseSBnZXQgdGhlIGJveCBmb3IgdGhlIHdob2xlIHdpZGdldC5cbiAgICBpZiAoc3RhcnQgPiAwKSB7IGNvbGxhcHNlID0gYmlhcyA9IFwicmlnaHRcIjsgfVxuICAgIHZhciByZWN0cztcbiAgICBpZiAoY20ub3B0aW9ucy5saW5lV3JhcHBpbmcgJiYgKHJlY3RzID0gbm9kZS5nZXRDbGllbnRSZWN0cygpKS5sZW5ndGggPiAxKVxuICAgICAgeyByZWN0ID0gcmVjdHNbYmlhcyA9PSBcInJpZ2h0XCIgPyByZWN0cy5sZW5ndGggLSAxIDogMF07IH1cbiAgICBlbHNlXG4gICAgICB7IHJlY3QgPSBub2RlLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpOyB9XG4gIH1cbiAgaWYgKGllICYmIGllX3ZlcnNpb24gPCA5ICYmICFzdGFydCAmJiAoIXJlY3QgfHwgIXJlY3QubGVmdCAmJiAhcmVjdC5yaWdodCkpIHtcbiAgICB2YXIgclNwYW4gPSBub2RlLnBhcmVudE5vZGUuZ2V0Q2xpZW50UmVjdHMoKVswXTtcbiAgICBpZiAoclNwYW4pXG4gICAgICB7IHJlY3QgPSB7bGVmdDogclNwYW4ubGVmdCwgcmlnaHQ6IHJTcGFuLmxlZnQgKyBjaGFyV2lkdGgoY20uZGlzcGxheSksIHRvcDogclNwYW4udG9wLCBib3R0b206IHJTcGFuLmJvdHRvbX07IH1cbiAgICBlbHNlXG4gICAgICB7IHJlY3QgPSBudWxsUmVjdDsgfVxuICB9XG5cbiAgdmFyIHJ0b3AgPSByZWN0LnRvcCAtIHByZXBhcmVkLnJlY3QudG9wLCByYm90ID0gcmVjdC5ib3R0b20gLSBwcmVwYXJlZC5yZWN0LnRvcDtcbiAgdmFyIG1pZCA9IChydG9wICsgcmJvdCkgLyAyO1xuICB2YXIgaGVpZ2h0cyA9IHByZXBhcmVkLnZpZXcubWVhc3VyZS5oZWlnaHRzO1xuICB2YXIgaSA9IDA7XG4gIGZvciAoOyBpIDwgaGVpZ2h0cy5sZW5ndGggLSAxOyBpKyspXG4gICAgeyBpZiAobWlkIDwgaGVpZ2h0c1tpXSkgeyBicmVhayB9IH1cbiAgdmFyIHRvcCA9IGkgPyBoZWlnaHRzW2kgLSAxXSA6IDAsIGJvdCA9IGhlaWdodHNbaV07XG4gIHZhciByZXN1bHQgPSB7bGVmdDogKGNvbGxhcHNlID09IFwicmlnaHRcIiA/IHJlY3QucmlnaHQgOiByZWN0LmxlZnQpIC0gcHJlcGFyZWQucmVjdC5sZWZ0LFxuICAgICAgICAgICAgICAgIHJpZ2h0OiAoY29sbGFwc2UgPT0gXCJsZWZ0XCIgPyByZWN0LmxlZnQgOiByZWN0LnJpZ2h0KSAtIHByZXBhcmVkLnJlY3QubGVmdCxcbiAgICAgICAgICAgICAgICB0b3A6IHRvcCwgYm90dG9tOiBib3R9O1xuICBpZiAoIXJlY3QubGVmdCAmJiAhcmVjdC5yaWdodCkgeyByZXN1bHQuYm9ndXMgPSB0cnVlOyB9XG4gIGlmICghY20ub3B0aW9ucy5zaW5nbGVDdXJzb3JIZWlnaHRQZXJMaW5lKSB7IHJlc3VsdC5ydG9wID0gcnRvcDsgcmVzdWx0LnJib3R0b20gPSByYm90OyB9XG5cbiAgcmV0dXJuIHJlc3VsdFxufVxuXG4vLyBXb3JrIGFyb3VuZCBwcm9ibGVtIHdpdGggYm91bmRpbmcgY2xpZW50IHJlY3RzIG9uIHJhbmdlcyBiZWluZ1xuLy8gcmV0dXJuZWQgaW5jb3JyZWN0bHkgd2hlbiB6b29tZWQgb24gSUUxMCBhbmQgYmVsb3cuXG5mdW5jdGlvbiBtYXliZVVwZGF0ZVJlY3RGb3Jab29taW5nKG1lYXN1cmUsIHJlY3QpIHtcbiAgaWYgKCF3aW5kb3cuc2NyZWVuIHx8IHNjcmVlbi5sb2dpY2FsWERQSSA9PSBudWxsIHx8XG4gICAgICBzY3JlZW4ubG9naWNhbFhEUEkgPT0gc2NyZWVuLmRldmljZVhEUEkgfHwgIWhhc0JhZFpvb21lZFJlY3RzKG1lYXN1cmUpKVxuICAgIHsgcmV0dXJuIHJlY3QgfVxuICB2YXIgc2NhbGVYID0gc2NyZWVuLmxvZ2ljYWxYRFBJIC8gc2NyZWVuLmRldmljZVhEUEk7XG4gIHZhciBzY2FsZVkgPSBzY3JlZW4ubG9naWNhbFlEUEkgLyBzY3JlZW4uZGV2aWNlWURQSTtcbiAgcmV0dXJuIHtsZWZ0OiByZWN0LmxlZnQgKiBzY2FsZVgsIHJpZ2h0OiByZWN0LnJpZ2h0ICogc2NhbGVYLFxuICAgICAgICAgIHRvcDogcmVjdC50b3AgKiBzY2FsZVksIGJvdHRvbTogcmVjdC5ib3R0b20gKiBzY2FsZVl9XG59XG5cbmZ1bmN0aW9uIGNsZWFyTGluZU1lYXN1cmVtZW50Q2FjaGVGb3IobGluZVZpZXcpIHtcbiAgaWYgKGxpbmVWaWV3Lm1lYXN1cmUpIHtcbiAgICBsaW5lVmlldy5tZWFzdXJlLmNhY2hlID0ge307XG4gICAgbGluZVZpZXcubWVhc3VyZS5oZWlnaHRzID0gbnVsbDtcbiAgICBpZiAobGluZVZpZXcucmVzdCkgeyBmb3IgKHZhciBpID0gMDsgaSA8IGxpbmVWaWV3LnJlc3QubGVuZ3RoOyBpKyspXG4gICAgICB7IGxpbmVWaWV3Lm1lYXN1cmUuY2FjaGVzW2ldID0ge307IH0gfVxuICB9XG59XG5cbmZ1bmN0aW9uIGNsZWFyTGluZU1lYXN1cmVtZW50Q2FjaGUoY20pIHtcbiAgY20uZGlzcGxheS5leHRlcm5hbE1lYXN1cmUgPSBudWxsO1xuICByZW1vdmVDaGlsZHJlbihjbS5kaXNwbGF5LmxpbmVNZWFzdXJlKTtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBjbS5kaXNwbGF5LnZpZXcubGVuZ3RoOyBpKyspXG4gICAgeyBjbGVhckxpbmVNZWFzdXJlbWVudENhY2hlRm9yKGNtLmRpc3BsYXkudmlld1tpXSk7IH1cbn1cblxuZnVuY3Rpb24gY2xlYXJDYWNoZXMoY20pIHtcbiAgY2xlYXJMaW5lTWVhc3VyZW1lbnRDYWNoZShjbSk7XG4gIGNtLmRpc3BsYXkuY2FjaGVkQ2hhcldpZHRoID0gY20uZGlzcGxheS5jYWNoZWRUZXh0SGVpZ2h0ID0gY20uZGlzcGxheS5jYWNoZWRQYWRkaW5nSCA9IG51bGw7XG4gIGlmICghY20ub3B0aW9ucy5saW5lV3JhcHBpbmcpIHsgY20uZGlzcGxheS5tYXhMaW5lQ2hhbmdlZCA9IHRydWU7IH1cbiAgY20uZGlzcGxheS5saW5lTnVtQ2hhcnMgPSBudWxsO1xufVxuXG5mdW5jdGlvbiBwYWdlU2Nyb2xsWCgpIHtcbiAgLy8gV29yayBhcm91bmQgaHR0cHM6Ly9idWdzLmNocm9taXVtLm9yZy9wL2Nocm9taXVtL2lzc3Vlcy9kZXRhaWw/aWQ9NDg5MjA2XG4gIC8vIHdoaWNoIGNhdXNlcyBwYWdlX09mZnNldCBhbmQgYm91bmRpbmcgY2xpZW50IHJlY3RzIHRvIHVzZVxuICAvLyBkaWZmZXJlbnQgcmVmZXJlbmNlIHZpZXdwb3J0cyBhbmQgaW52YWxpZGF0ZSBvdXIgY2FsY3VsYXRpb25zLlxuICBpZiAoY2hyb21lICYmIGFuZHJvaWQpIHsgcmV0dXJuIC0oZG9jdW1lbnQuYm9keS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKS5sZWZ0IC0gcGFyc2VJbnQoZ2V0Q29tcHV0ZWRTdHlsZShkb2N1bWVudC5ib2R5KS5tYXJnaW5MZWZ0KSkgfVxuICByZXR1cm4gd2luZG93LnBhZ2VYT2Zmc2V0IHx8IChkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQgfHwgZG9jdW1lbnQuYm9keSkuc2Nyb2xsTGVmdFxufVxuZnVuY3Rpb24gcGFnZVNjcm9sbFkoKSB7XG4gIGlmIChjaHJvbWUgJiYgYW5kcm9pZCkgeyByZXR1cm4gLShkb2N1bWVudC5ib2R5LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpLnRvcCAtIHBhcnNlSW50KGdldENvbXB1dGVkU3R5bGUoZG9jdW1lbnQuYm9keSkubWFyZ2luVG9wKSkgfVxuICByZXR1cm4gd2luZG93LnBhZ2VZT2Zmc2V0IHx8IChkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQgfHwgZG9jdW1lbnQuYm9keSkuc2Nyb2xsVG9wXG59XG5cbmZ1bmN0aW9uIHdpZGdldFRvcEhlaWdodChsaW5lT2JqKSB7XG4gIHZhciBoZWlnaHQgPSAwO1xuICBpZiAobGluZU9iai53aWRnZXRzKSB7IGZvciAodmFyIGkgPSAwOyBpIDwgbGluZU9iai53aWRnZXRzLmxlbmd0aDsgKytpKSB7IGlmIChsaW5lT2JqLndpZGdldHNbaV0uYWJvdmUpXG4gICAgeyBoZWlnaHQgKz0gd2lkZ2V0SGVpZ2h0KGxpbmVPYmoud2lkZ2V0c1tpXSk7IH0gfSB9XG4gIHJldHVybiBoZWlnaHRcbn1cblxuLy8gQ29udmVydHMgYSB7dG9wLCBib3R0b20sIGxlZnQsIHJpZ2h0fSBib3ggZnJvbSBsaW5lLWxvY2FsXG4vLyBjb29yZGluYXRlcyBpbnRvIGFub3RoZXIgY29vcmRpbmF0ZSBzeXN0ZW0uIENvbnRleHQgbWF5IGJlIG9uZSBvZlxuLy8gXCJsaW5lXCIsIFwiZGl2XCIgKGRpc3BsYXkubGluZURpdiksIFwibG9jYWxcIi4vbnVsbCAoZWRpdG9yKSwgXCJ3aW5kb3dcIixcbi8vIG9yIFwicGFnZVwiLlxuZnVuY3Rpb24gaW50b0Nvb3JkU3lzdGVtKGNtLCBsaW5lT2JqLCByZWN0LCBjb250ZXh0LCBpbmNsdWRlV2lkZ2V0cykge1xuICBpZiAoIWluY2x1ZGVXaWRnZXRzKSB7XG4gICAgdmFyIGhlaWdodCA9IHdpZGdldFRvcEhlaWdodChsaW5lT2JqKTtcbiAgICByZWN0LnRvcCArPSBoZWlnaHQ7IHJlY3QuYm90dG9tICs9IGhlaWdodDtcbiAgfVxuICBpZiAoY29udGV4dCA9PSBcImxpbmVcIikgeyByZXR1cm4gcmVjdCB9XG4gIGlmICghY29udGV4dCkgeyBjb250ZXh0ID0gXCJsb2NhbFwiOyB9XG4gIHZhciB5T2ZmID0gaGVpZ2h0QXRMaW5lKGxpbmVPYmopO1xuICBpZiAoY29udGV4dCA9PSBcImxvY2FsXCIpIHsgeU9mZiArPSBwYWRkaW5nVG9wKGNtLmRpc3BsYXkpOyB9XG4gIGVsc2UgeyB5T2ZmIC09IGNtLmRpc3BsYXkudmlld09mZnNldDsgfVxuICBpZiAoY29udGV4dCA9PSBcInBhZ2VcIiB8fCBjb250ZXh0ID09IFwid2luZG93XCIpIHtcbiAgICB2YXIgbE9mZiA9IGNtLmRpc3BsYXkubGluZVNwYWNlLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgIHlPZmYgKz0gbE9mZi50b3AgKyAoY29udGV4dCA9PSBcIndpbmRvd1wiID8gMCA6IHBhZ2VTY3JvbGxZKCkpO1xuICAgIHZhciB4T2ZmID0gbE9mZi5sZWZ0ICsgKGNvbnRleHQgPT0gXCJ3aW5kb3dcIiA/IDAgOiBwYWdlU2Nyb2xsWCgpKTtcbiAgICByZWN0LmxlZnQgKz0geE9mZjsgcmVjdC5yaWdodCArPSB4T2ZmO1xuICB9XG4gIHJlY3QudG9wICs9IHlPZmY7IHJlY3QuYm90dG9tICs9IHlPZmY7XG4gIHJldHVybiByZWN0XG59XG5cbi8vIENvdmVydHMgYSBib3ggZnJvbSBcImRpdlwiIGNvb3JkcyB0byBhbm90aGVyIGNvb3JkaW5hdGUgc3lzdGVtLlxuLy8gQ29udGV4dCBtYXkgYmUgXCJ3aW5kb3dcIiwgXCJwYWdlXCIsIFwiZGl2XCIsIG9yIFwibG9jYWxcIi4vbnVsbC5cbmZ1bmN0aW9uIGZyb21Db29yZFN5c3RlbShjbSwgY29vcmRzLCBjb250ZXh0KSB7XG4gIGlmIChjb250ZXh0ID09IFwiZGl2XCIpIHsgcmV0dXJuIGNvb3JkcyB9XG4gIHZhciBsZWZ0ID0gY29vcmRzLmxlZnQsIHRvcCA9IGNvb3Jkcy50b3A7XG4gIC8vIEZpcnN0IG1vdmUgaW50byBcInBhZ2VcIiBjb29yZGluYXRlIHN5c3RlbVxuICBpZiAoY29udGV4dCA9PSBcInBhZ2VcIikge1xuICAgIGxlZnQgLT0gcGFnZVNjcm9sbFgoKTtcbiAgICB0b3AgLT0gcGFnZVNjcm9sbFkoKTtcbiAgfSBlbHNlIGlmIChjb250ZXh0ID09IFwibG9jYWxcIiB8fCAhY29udGV4dCkge1xuICAgIHZhciBsb2NhbEJveCA9IGNtLmRpc3BsYXkuc2l6ZXIuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgbGVmdCArPSBsb2NhbEJveC5sZWZ0O1xuICAgIHRvcCArPSBsb2NhbEJveC50b3A7XG4gIH1cblxuICB2YXIgbGluZVNwYWNlQm94ID0gY20uZGlzcGxheS5saW5lU3BhY2UuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gIHJldHVybiB7bGVmdDogbGVmdCAtIGxpbmVTcGFjZUJveC5sZWZ0LCB0b3A6IHRvcCAtIGxpbmVTcGFjZUJveC50b3B9XG59XG5cbmZ1bmN0aW9uIGNoYXJDb29yZHMoY20sIHBvcywgY29udGV4dCwgbGluZU9iaiwgYmlhcykge1xuICBpZiAoIWxpbmVPYmopIHsgbGluZU9iaiA9IGdldExpbmUoY20uZG9jLCBwb3MubGluZSk7IH1cbiAgcmV0dXJuIGludG9Db29yZFN5c3RlbShjbSwgbGluZU9iaiwgbWVhc3VyZUNoYXIoY20sIGxpbmVPYmosIHBvcy5jaCwgYmlhcyksIGNvbnRleHQpXG59XG5cbi8vIFJldHVybnMgYSBib3ggZm9yIGEgZ2l2ZW4gY3Vyc29yIHBvc2l0aW9uLCB3aGljaCBtYXkgaGF2ZSBhblxuLy8gJ290aGVyJyBwcm9wZXJ0eSBjb250YWluaW5nIHRoZSBwb3NpdGlvbiBvZiB0aGUgc2Vjb25kYXJ5IGN1cnNvclxuLy8gb24gYSBiaWRpIGJvdW5kYXJ5LlxuLy8gQSBjdXJzb3IgUG9zKGxpbmUsIGNoYXIsIFwiYmVmb3JlXCIpIGlzIG9uIHRoZSBzYW1lIHZpc3VhbCBsaW5lIGFzIGBjaGFyIC0gMWBcbi8vIGFuZCBhZnRlciBgY2hhciAtIDFgIGluIHdyaXRpbmcgb3JkZXIgb2YgYGNoYXIgLSAxYFxuLy8gQSBjdXJzb3IgUG9zKGxpbmUsIGNoYXIsIFwiYWZ0ZXJcIikgaXMgb24gdGhlIHNhbWUgdmlzdWFsIGxpbmUgYXMgYGNoYXJgXG4vLyBhbmQgYmVmb3JlIGBjaGFyYCBpbiB3cml0aW5nIG9yZGVyIG9mIGBjaGFyYFxuLy8gRXhhbXBsZXMgKHVwcGVyLWNhc2UgbGV0dGVycyBhcmUgUlRMLCBsb3dlci1jYXNlIGFyZSBMVFIpOlxuLy8gICAgIFBvcygwLCAxLCAuLi4pXG4vLyAgICAgYmVmb3JlICAgYWZ0ZXJcbi8vIGFiICAgICBhfGIgICAgIGF8YlxuLy8gYUIgICAgIGF8QiAgICAgYUJ8XG4vLyBBYiAgICAgfEFiICAgICBBfGJcbi8vIEFCICAgICBCfEEgICAgIEJ8QVxuLy8gRXZlcnkgcG9zaXRpb24gYWZ0ZXIgdGhlIGxhc3QgY2hhcmFjdGVyIG9uIGEgbGluZSBpcyBjb25zaWRlcmVkIHRvIHN0aWNrXG4vLyB0byB0aGUgbGFzdCBjaGFyYWN0ZXIgb24gdGhlIGxpbmUuXG5mdW5jdGlvbiBjdXJzb3JDb29yZHMoY20sIHBvcywgY29udGV4dCwgbGluZU9iaiwgcHJlcGFyZWRNZWFzdXJlLCB2YXJIZWlnaHQpIHtcbiAgbGluZU9iaiA9IGxpbmVPYmogfHwgZ2V0TGluZShjbS5kb2MsIHBvcy5saW5lKTtcbiAgaWYgKCFwcmVwYXJlZE1lYXN1cmUpIHsgcHJlcGFyZWRNZWFzdXJlID0gcHJlcGFyZU1lYXN1cmVGb3JMaW5lKGNtLCBsaW5lT2JqKTsgfVxuICBmdW5jdGlvbiBnZXQoY2gsIHJpZ2h0KSB7XG4gICAgdmFyIG0gPSBtZWFzdXJlQ2hhclByZXBhcmVkKGNtLCBwcmVwYXJlZE1lYXN1cmUsIGNoLCByaWdodCA/IFwicmlnaHRcIiA6IFwibGVmdFwiLCB2YXJIZWlnaHQpO1xuICAgIGlmIChyaWdodCkgeyBtLmxlZnQgPSBtLnJpZ2h0OyB9IGVsc2UgeyBtLnJpZ2h0ID0gbS5sZWZ0OyB9XG4gICAgcmV0dXJuIGludG9Db29yZFN5c3RlbShjbSwgbGluZU9iaiwgbSwgY29udGV4dClcbiAgfVxuICB2YXIgb3JkZXIgPSBnZXRPcmRlcihsaW5lT2JqLCBjbS5kb2MuZGlyZWN0aW9uKSwgY2ggPSBwb3MuY2gsIHN0aWNreSA9IHBvcy5zdGlja3k7XG4gIGlmIChjaCA+PSBsaW5lT2JqLnRleHQubGVuZ3RoKSB7XG4gICAgY2ggPSBsaW5lT2JqLnRleHQubGVuZ3RoO1xuICAgIHN0aWNreSA9IFwiYmVmb3JlXCI7XG4gIH0gZWxzZSBpZiAoY2ggPD0gMCkge1xuICAgIGNoID0gMDtcbiAgICBzdGlja3kgPSBcImFmdGVyXCI7XG4gIH1cbiAgaWYgKCFvcmRlcikgeyByZXR1cm4gZ2V0KHN0aWNreSA9PSBcImJlZm9yZVwiID8gY2ggLSAxIDogY2gsIHN0aWNreSA9PSBcImJlZm9yZVwiKSB9XG5cbiAgZnVuY3Rpb24gZ2V0QmlkaShjaCwgcGFydFBvcywgaW52ZXJ0KSB7XG4gICAgdmFyIHBhcnQgPSBvcmRlcltwYXJ0UG9zXSwgcmlnaHQgPSBwYXJ0LmxldmVsID09IDE7XG4gICAgcmV0dXJuIGdldChpbnZlcnQgPyBjaCAtIDEgOiBjaCwgcmlnaHQgIT0gaW52ZXJ0KVxuICB9XG4gIHZhciBwYXJ0UG9zID0gZ2V0QmlkaVBhcnRBdChvcmRlciwgY2gsIHN0aWNreSk7XG4gIHZhciBvdGhlciA9IGJpZGlPdGhlcjtcbiAgdmFyIHZhbCA9IGdldEJpZGkoY2gsIHBhcnRQb3MsIHN0aWNreSA9PSBcImJlZm9yZVwiKTtcbiAgaWYgKG90aGVyICE9IG51bGwpIHsgdmFsLm90aGVyID0gZ2V0QmlkaShjaCwgb3RoZXIsIHN0aWNreSAhPSBcImJlZm9yZVwiKTsgfVxuICByZXR1cm4gdmFsXG59XG5cbi8vIFVzZWQgdG8gY2hlYXBseSBlc3RpbWF0ZSB0aGUgY29vcmRpbmF0ZXMgZm9yIGEgcG9zaXRpb24uIFVzZWQgZm9yXG4vLyBpbnRlcm1lZGlhdGUgc2Nyb2xsIHVwZGF0ZXMuXG5mdW5jdGlvbiBlc3RpbWF0ZUNvb3JkcyhjbSwgcG9zKSB7XG4gIHZhciBsZWZ0ID0gMDtcbiAgcG9zID0gY2xpcFBvcyhjbS5kb2MsIHBvcyk7XG4gIGlmICghY20ub3B0aW9ucy5saW5lV3JhcHBpbmcpIHsgbGVmdCA9IGNoYXJXaWR0aChjbS5kaXNwbGF5KSAqIHBvcy5jaDsgfVxuICB2YXIgbGluZU9iaiA9IGdldExpbmUoY20uZG9jLCBwb3MubGluZSk7XG4gIHZhciB0b3AgPSBoZWlnaHRBdExpbmUobGluZU9iaikgKyBwYWRkaW5nVG9wKGNtLmRpc3BsYXkpO1xuICByZXR1cm4ge2xlZnQ6IGxlZnQsIHJpZ2h0OiBsZWZ0LCB0b3A6IHRvcCwgYm90dG9tOiB0b3AgKyBsaW5lT2JqLmhlaWdodH1cbn1cblxuLy8gUG9zaXRpb25zIHJldHVybmVkIGJ5IGNvb3Jkc0NoYXIgY29udGFpbiBzb21lIGV4dHJhIGluZm9ybWF0aW9uLlxuLy8geFJlbCBpcyB0aGUgcmVsYXRpdmUgeCBwb3NpdGlvbiBvZiB0aGUgaW5wdXQgY29vcmRpbmF0ZXMgY29tcGFyZWRcbi8vIHRvIHRoZSBmb3VuZCBwb3NpdGlvbiAoc28geFJlbCA+IDAgbWVhbnMgdGhlIGNvb3JkaW5hdGVzIGFyZSB0b1xuLy8gdGhlIHJpZ2h0IG9mIHRoZSBjaGFyYWN0ZXIgcG9zaXRpb24sIGZvciBleGFtcGxlKS4gV2hlbiBvdXRzaWRlXG4vLyBpcyB0cnVlLCB0aGF0IG1lYW5zIHRoZSBjb29yZGluYXRlcyBsaWUgb3V0c2lkZSB0aGUgbGluZSdzXG4vLyB2ZXJ0aWNhbCByYW5nZS5cbmZ1bmN0aW9uIFBvc1dpdGhJbmZvKGxpbmUsIGNoLCBzdGlja3ksIG91dHNpZGUsIHhSZWwpIHtcbiAgdmFyIHBvcyA9IFBvcyhsaW5lLCBjaCwgc3RpY2t5KTtcbiAgcG9zLnhSZWwgPSB4UmVsO1xuICBpZiAob3V0c2lkZSkgeyBwb3Mub3V0c2lkZSA9IHRydWU7IH1cbiAgcmV0dXJuIHBvc1xufVxuXG4vLyBDb21wdXRlIHRoZSBjaGFyYWN0ZXIgcG9zaXRpb24gY2xvc2VzdCB0byB0aGUgZ2l2ZW4gY29vcmRpbmF0ZXMuXG4vLyBJbnB1dCBtdXN0IGJlIGxpbmVTcGFjZS1sb2NhbCAoXCJkaXZcIiBjb29yZGluYXRlIHN5c3RlbSkuXG5mdW5jdGlvbiBjb29yZHNDaGFyKGNtLCB4LCB5KSB7XG4gIHZhciBkb2MgPSBjbS5kb2M7XG4gIHkgKz0gY20uZGlzcGxheS52aWV3T2Zmc2V0O1xuICBpZiAoeSA8IDApIHsgcmV0dXJuIFBvc1dpdGhJbmZvKGRvYy5maXJzdCwgMCwgbnVsbCwgdHJ1ZSwgLTEpIH1cbiAgdmFyIGxpbmVOID0gbGluZUF0SGVpZ2h0KGRvYywgeSksIGxhc3QgPSBkb2MuZmlyc3QgKyBkb2Muc2l6ZSAtIDE7XG4gIGlmIChsaW5lTiA+IGxhc3QpXG4gICAgeyByZXR1cm4gUG9zV2l0aEluZm8oZG9jLmZpcnN0ICsgZG9jLnNpemUgLSAxLCBnZXRMaW5lKGRvYywgbGFzdCkudGV4dC5sZW5ndGgsIG51bGwsIHRydWUsIDEpIH1cbiAgaWYgKHggPCAwKSB7IHggPSAwOyB9XG5cbiAgdmFyIGxpbmVPYmogPSBnZXRMaW5lKGRvYywgbGluZU4pO1xuICBmb3IgKDs7KSB7XG4gICAgdmFyIGZvdW5kID0gY29vcmRzQ2hhcklubmVyKGNtLCBsaW5lT2JqLCBsaW5lTiwgeCwgeSk7XG4gICAgdmFyIGNvbGxhcHNlZCA9IGNvbGxhcHNlZFNwYW5Bcm91bmQobGluZU9iaiwgZm91bmQuY2ggKyAoZm91bmQueFJlbCA+IDAgPyAxIDogMCkpO1xuICAgIGlmICghY29sbGFwc2VkKSB7IHJldHVybiBmb3VuZCB9XG4gICAgdmFyIHJhbmdlRW5kID0gY29sbGFwc2VkLmZpbmQoMSk7XG4gICAgaWYgKHJhbmdlRW5kLmxpbmUgPT0gbGluZU4pIHsgcmV0dXJuIHJhbmdlRW5kIH1cbiAgICBsaW5lT2JqID0gZ2V0TGluZShkb2MsIGxpbmVOID0gcmFuZ2VFbmQubGluZSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gd3JhcHBlZExpbmVFeHRlbnQoY20sIGxpbmVPYmosIHByZXBhcmVkTWVhc3VyZSwgeSkge1xuICB5IC09IHdpZGdldFRvcEhlaWdodChsaW5lT2JqKTtcbiAgdmFyIGVuZCA9IGxpbmVPYmoudGV4dC5sZW5ndGg7XG4gIHZhciBiZWdpbiA9IGZpbmRGaXJzdChmdW5jdGlvbiAoY2gpIHsgcmV0dXJuIG1lYXN1cmVDaGFyUHJlcGFyZWQoY20sIHByZXBhcmVkTWVhc3VyZSwgY2ggLSAxKS5ib3R0b20gPD0geTsgfSwgZW5kLCAwKTtcbiAgZW5kID0gZmluZEZpcnN0KGZ1bmN0aW9uIChjaCkgeyByZXR1cm4gbWVhc3VyZUNoYXJQcmVwYXJlZChjbSwgcHJlcGFyZWRNZWFzdXJlLCBjaCkudG9wID4geTsgfSwgYmVnaW4sIGVuZCk7XG4gIHJldHVybiB7YmVnaW46IGJlZ2luLCBlbmQ6IGVuZH1cbn1cblxuZnVuY3Rpb24gd3JhcHBlZExpbmVFeHRlbnRDaGFyKGNtLCBsaW5lT2JqLCBwcmVwYXJlZE1lYXN1cmUsIHRhcmdldCkge1xuICBpZiAoIXByZXBhcmVkTWVhc3VyZSkgeyBwcmVwYXJlZE1lYXN1cmUgPSBwcmVwYXJlTWVhc3VyZUZvckxpbmUoY20sIGxpbmVPYmopOyB9XG4gIHZhciB0YXJnZXRUb3AgPSBpbnRvQ29vcmRTeXN0ZW0oY20sIGxpbmVPYmosIG1lYXN1cmVDaGFyUHJlcGFyZWQoY20sIHByZXBhcmVkTWVhc3VyZSwgdGFyZ2V0KSwgXCJsaW5lXCIpLnRvcDtcbiAgcmV0dXJuIHdyYXBwZWRMaW5lRXh0ZW50KGNtLCBsaW5lT2JqLCBwcmVwYXJlZE1lYXN1cmUsIHRhcmdldFRvcClcbn1cblxuLy8gUmV0dXJucyB0cnVlIGlmIHRoZSBnaXZlbiBzaWRlIG9mIGEgYm94IGlzIGFmdGVyIHRoZSBnaXZlblxuLy8gY29vcmRpbmF0ZXMsIGluIHRvcC10by1ib3R0b20sIGxlZnQtdG8tcmlnaHQgb3JkZXIuXG5mdW5jdGlvbiBib3hJc0FmdGVyKGJveCwgeCwgeSwgbGVmdCkge1xuICByZXR1cm4gYm94LmJvdHRvbSA8PSB5ID8gZmFsc2UgOiBib3gudG9wID4geSA/IHRydWUgOiAobGVmdCA/IGJveC5sZWZ0IDogYm94LnJpZ2h0KSA+IHhcbn1cblxuZnVuY3Rpb24gY29vcmRzQ2hhcklubmVyKGNtLCBsaW5lT2JqLCBsaW5lTm8kJDEsIHgsIHkpIHtcbiAgLy8gTW92ZSB5IGludG8gbGluZS1sb2NhbCBjb29yZGluYXRlIHNwYWNlXG4gIHkgLT0gaGVpZ2h0QXRMaW5lKGxpbmVPYmopO1xuICB2YXIgcHJlcGFyZWRNZWFzdXJlID0gcHJlcGFyZU1lYXN1cmVGb3JMaW5lKGNtLCBsaW5lT2JqKTtcbiAgLy8gV2hlbiBkaXJlY3RseSBjYWxsaW5nIGBtZWFzdXJlQ2hhclByZXBhcmVkYCwgd2UgaGF2ZSB0byBhZGp1c3RcbiAgLy8gZm9yIHRoZSB3aWRnZXRzIGF0IHRoaXMgbGluZS5cbiAgdmFyIHdpZGdldEhlaWdodCQkMSA9IHdpZGdldFRvcEhlaWdodChsaW5lT2JqKTtcbiAgdmFyIGJlZ2luID0gMCwgZW5kID0gbGluZU9iai50ZXh0Lmxlbmd0aCwgbHRyID0gdHJ1ZTtcblxuICB2YXIgb3JkZXIgPSBnZXRPcmRlcihsaW5lT2JqLCBjbS5kb2MuZGlyZWN0aW9uKTtcbiAgLy8gSWYgdGhlIGxpbmUgaXNuJ3QgcGxhaW4gbGVmdC10by1yaWdodCB0ZXh0LCBmaXJzdCBmaWd1cmUgb3V0XG4gIC8vIHdoaWNoIGJpZGkgc2VjdGlvbiB0aGUgY29vcmRpbmF0ZXMgZmFsbCBpbnRvLlxuICBpZiAob3JkZXIpIHtcbiAgICB2YXIgcGFydCA9IChjbS5vcHRpb25zLmxpbmVXcmFwcGluZyA/IGNvb3Jkc0JpZGlQYXJ0V3JhcHBlZCA6IGNvb3Jkc0JpZGlQYXJ0KVxuICAgICAgICAgICAgICAgICAoY20sIGxpbmVPYmosIGxpbmVObyQkMSwgcHJlcGFyZWRNZWFzdXJlLCBvcmRlciwgeCwgeSk7XG4gICAgbHRyID0gcGFydC5sZXZlbCAhPSAxO1xuICAgIC8vIFRoZSBhd2t3YXJkIC0xIG9mZnNldHMgYXJlIG5lZWRlZCBiZWNhdXNlIGZpbmRGaXJzdCAoY2FsbGVkXG4gICAgLy8gb24gdGhlc2UgYmVsb3cpIHdpbGwgdHJlYXQgaXRzIGZpcnN0IGJvdW5kIGFzIGluY2x1c2l2ZSxcbiAgICAvLyBzZWNvbmQgYXMgZXhjbHVzaXZlLCBidXQgd2Ugd2FudCB0byBhY3R1YWxseSBhZGRyZXNzIHRoZVxuICAgIC8vIGNoYXJhY3RlcnMgaW4gdGhlIHBhcnQncyByYW5nZVxuICAgIGJlZ2luID0gbHRyID8gcGFydC5mcm9tIDogcGFydC50byAtIDE7XG4gICAgZW5kID0gbHRyID8gcGFydC50byA6IHBhcnQuZnJvbSAtIDE7XG4gIH1cblxuICAvLyBBIGJpbmFyeSBzZWFyY2ggdG8gZmluZCB0aGUgZmlyc3QgY2hhcmFjdGVyIHdob3NlIGJvdW5kaW5nIGJveFxuICAvLyBzdGFydHMgYWZ0ZXIgdGhlIGNvb3JkaW5hdGVzLiBJZiB3ZSBydW4gYWNyb3NzIGFueSB3aG9zZSBib3ggd3JhcFxuICAvLyB0aGUgY29vcmRpbmF0ZXMsIHN0b3JlIHRoYXQuXG4gIHZhciBjaEFyb3VuZCA9IG51bGwsIGJveEFyb3VuZCA9IG51bGw7XG4gIHZhciBjaCA9IGZpbmRGaXJzdChmdW5jdGlvbiAoY2gpIHtcbiAgICB2YXIgYm94ID0gbWVhc3VyZUNoYXJQcmVwYXJlZChjbSwgcHJlcGFyZWRNZWFzdXJlLCBjaCk7XG4gICAgYm94LnRvcCArPSB3aWRnZXRIZWlnaHQkJDE7IGJveC5ib3R0b20gKz0gd2lkZ2V0SGVpZ2h0JCQxO1xuICAgIGlmICghYm94SXNBZnRlcihib3gsIHgsIHksIGZhbHNlKSkgeyByZXR1cm4gZmFsc2UgfVxuICAgIGlmIChib3gudG9wIDw9IHkgJiYgYm94LmxlZnQgPD0geCkge1xuICAgICAgY2hBcm91bmQgPSBjaDtcbiAgICAgIGJveEFyb3VuZCA9IGJveDtcbiAgICB9XG4gICAgcmV0dXJuIHRydWVcbiAgfSwgYmVnaW4sIGVuZCk7XG5cbiAgdmFyIGJhc2VYLCBzdGlja3ksIG91dHNpZGUgPSBmYWxzZTtcbiAgLy8gSWYgYSBib3ggYXJvdW5kIHRoZSBjb29yZGluYXRlcyB3YXMgZm91bmQsIHVzZSB0aGF0XG4gIGlmIChib3hBcm91bmQpIHtcbiAgICAvLyBEaXN0aW5ndWlzaCBjb29yZGluYXRlcyBuZWFyZXIgdG8gdGhlIGxlZnQgb3IgcmlnaHQgc2lkZSBvZiB0aGUgYm94XG4gICAgdmFyIGF0TGVmdCA9IHggLSBib3hBcm91bmQubGVmdCA8IGJveEFyb3VuZC5yaWdodCAtIHgsIGF0U3RhcnQgPSBhdExlZnQgPT0gbHRyO1xuICAgIGNoID0gY2hBcm91bmQgKyAoYXRTdGFydCA/IDAgOiAxKTtcbiAgICBzdGlja3kgPSBhdFN0YXJ0ID8gXCJhZnRlclwiIDogXCJiZWZvcmVcIjtcbiAgICBiYXNlWCA9IGF0TGVmdCA/IGJveEFyb3VuZC5sZWZ0IDogYm94QXJvdW5kLnJpZ2h0O1xuICB9IGVsc2Uge1xuICAgIC8vIChBZGp1c3QgZm9yIGV4dGVuZGVkIGJvdW5kLCBpZiBuZWNlc3NhcnkuKVxuICAgIGlmICghbHRyICYmIChjaCA9PSBlbmQgfHwgY2ggPT0gYmVnaW4pKSB7IGNoKys7IH1cbiAgICAvLyBUbyBkZXRlcm1pbmUgd2hpY2ggc2lkZSB0byBhc3NvY2lhdGUgd2l0aCwgZ2V0IHRoZSBib3ggdG8gdGhlXG4gICAgLy8gbGVmdCBvZiB0aGUgY2hhcmFjdGVyIGFuZCBjb21wYXJlIGl0J3MgdmVydGljYWwgcG9zaXRpb24gdG8gdGhlXG4gICAgLy8gY29vcmRpbmF0ZXNcbiAgICBzdGlja3kgPSBjaCA9PSAwID8gXCJhZnRlclwiIDogY2ggPT0gbGluZU9iai50ZXh0Lmxlbmd0aCA/IFwiYmVmb3JlXCIgOlxuICAgICAgKG1lYXN1cmVDaGFyUHJlcGFyZWQoY20sIHByZXBhcmVkTWVhc3VyZSwgY2ggLSAobHRyID8gMSA6IDApKS5ib3R0b20gKyB3aWRnZXRIZWlnaHQkJDEgPD0geSkgPT0gbHRyID9cbiAgICAgIFwiYWZ0ZXJcIiA6IFwiYmVmb3JlXCI7XG4gICAgLy8gTm93IGdldCBhY2N1cmF0ZSBjb29yZGluYXRlcyBmb3IgdGhpcyBwbGFjZSwgaW4gb3JkZXIgdG8gZ2V0IGFcbiAgICAvLyBiYXNlIFggcG9zaXRpb25cbiAgICB2YXIgY29vcmRzID0gY3Vyc29yQ29vcmRzKGNtLCBQb3MobGluZU5vJCQxLCBjaCwgc3RpY2t5KSwgXCJsaW5lXCIsIGxpbmVPYmosIHByZXBhcmVkTWVhc3VyZSk7XG4gICAgYmFzZVggPSBjb29yZHMubGVmdDtcbiAgICBvdXRzaWRlID0geSA8IGNvb3Jkcy50b3AgfHwgeSA+PSBjb29yZHMuYm90dG9tO1xuICB9XG5cbiAgY2ggPSBza2lwRXh0ZW5kaW5nQ2hhcnMobGluZU9iai50ZXh0LCBjaCwgMSk7XG4gIHJldHVybiBQb3NXaXRoSW5mbyhsaW5lTm8kJDEsIGNoLCBzdGlja3ksIG91dHNpZGUsIHggLSBiYXNlWClcbn1cblxuZnVuY3Rpb24gY29vcmRzQmlkaVBhcnQoY20sIGxpbmVPYmosIGxpbmVObyQkMSwgcHJlcGFyZWRNZWFzdXJlLCBvcmRlciwgeCwgeSkge1xuICAvLyBCaWRpIHBhcnRzIGFyZSBzb3J0ZWQgbGVmdC10by1yaWdodCwgYW5kIGluIGEgbm9uLWxpbmUtd3JhcHBpbmdcbiAgLy8gc2l0dWF0aW9uLCB3ZSBjYW4gdGFrZSB0aGlzIG9yZGVyaW5nIHRvIGNvcnJlc3BvbmQgdG8gdGhlIHZpc3VhbFxuICAvLyBvcmRlcmluZy4gVGhpcyBmaW5kcyB0aGUgZmlyc3QgcGFydCB3aG9zZSBlbmQgaXMgYWZ0ZXIgdGhlIGdpdmVuXG4gIC8vIGNvb3JkaW5hdGVzLlxuICB2YXIgaW5kZXggPSBmaW5kRmlyc3QoZnVuY3Rpb24gKGkpIHtcbiAgICB2YXIgcGFydCA9IG9yZGVyW2ldLCBsdHIgPSBwYXJ0LmxldmVsICE9IDE7XG4gICAgcmV0dXJuIGJveElzQWZ0ZXIoY3Vyc29yQ29vcmRzKGNtLCBQb3MobGluZU5vJCQxLCBsdHIgPyBwYXJ0LnRvIDogcGFydC5mcm9tLCBsdHIgPyBcImJlZm9yZVwiIDogXCJhZnRlclwiKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJsaW5lXCIsIGxpbmVPYmosIHByZXBhcmVkTWVhc3VyZSksIHgsIHksIHRydWUpXG4gIH0sIDAsIG9yZGVyLmxlbmd0aCAtIDEpO1xuICB2YXIgcGFydCA9IG9yZGVyW2luZGV4XTtcbiAgLy8gSWYgdGhpcyBpc24ndCB0aGUgZmlyc3QgcGFydCwgdGhlIHBhcnQncyBzdGFydCBpcyBhbHNvIGFmdGVyXG4gIC8vIHRoZSBjb29yZGluYXRlcywgYW5kIHRoZSBjb29yZGluYXRlcyBhcmVuJ3Qgb24gdGhlIHNhbWUgbGluZSBhc1xuICAvLyB0aGF0IHN0YXJ0LCBtb3ZlIG9uZSBwYXJ0IGJhY2suXG4gIGlmIChpbmRleCA+IDApIHtcbiAgICB2YXIgbHRyID0gcGFydC5sZXZlbCAhPSAxO1xuICAgIHZhciBzdGFydCA9IGN1cnNvckNvb3JkcyhjbSwgUG9zKGxpbmVObyQkMSwgbHRyID8gcGFydC5mcm9tIDogcGFydC50bywgbHRyID8gXCJhZnRlclwiIDogXCJiZWZvcmVcIiksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwibGluZVwiLCBsaW5lT2JqLCBwcmVwYXJlZE1lYXN1cmUpO1xuICAgIGlmIChib3hJc0FmdGVyKHN0YXJ0LCB4LCB5LCB0cnVlKSAmJiBzdGFydC50b3AgPiB5KVxuICAgICAgeyBwYXJ0ID0gb3JkZXJbaW5kZXggLSAxXTsgfVxuICB9XG4gIHJldHVybiBwYXJ0XG59XG5cbmZ1bmN0aW9uIGNvb3Jkc0JpZGlQYXJ0V3JhcHBlZChjbSwgbGluZU9iaiwgX2xpbmVObywgcHJlcGFyZWRNZWFzdXJlLCBvcmRlciwgeCwgeSkge1xuICAvLyBJbiBhIHdyYXBwZWQgbGluZSwgcnRsIHRleHQgb24gd3JhcHBpbmcgYm91bmRhcmllcyBjYW4gZG8gdGhpbmdzXG4gIC8vIHRoYXQgZG9uJ3QgY29ycmVzcG9uZCB0byB0aGUgb3JkZXJpbmcgaW4gb3VyIGBvcmRlcmAgYXJyYXkgYXRcbiAgLy8gYWxsLCBzbyBhIGJpbmFyeSBzZWFyY2ggZG9lc24ndCB3b3JrLCBhbmQgd2Ugd2FudCB0byByZXR1cm4gYVxuICAvLyBwYXJ0IHRoYXQgb25seSBzcGFucyBvbmUgbGluZSBzbyB0aGF0IHRoZSBiaW5hcnkgc2VhcmNoIGluXG4gIC8vIGNvb3Jkc0NoYXJJbm5lciBpcyBzYWZlLiBBcyBzdWNoLCB3ZSBmaXJzdCBmaW5kIHRoZSBleHRlbnQgb2YgdGhlXG4gIC8vIHdyYXBwZWQgbGluZSwgYW5kIHRoZW4gZG8gYSBmbGF0IHNlYXJjaCBpbiB3aGljaCB3ZSBkaXNjYXJkIGFueVxuICAvLyBzcGFucyB0aGF0IGFyZW4ndCBvbiB0aGUgbGluZS5cbiAgdmFyIHJlZiA9IHdyYXBwZWRMaW5lRXh0ZW50KGNtLCBsaW5lT2JqLCBwcmVwYXJlZE1lYXN1cmUsIHkpO1xuICB2YXIgYmVnaW4gPSByZWYuYmVnaW47XG4gIHZhciBlbmQgPSByZWYuZW5kO1xuICBpZiAoL1xccy8udGVzdChsaW5lT2JqLnRleHQuY2hhckF0KGVuZCAtIDEpKSkgeyBlbmQtLTsgfVxuICB2YXIgcGFydCA9IG51bGwsIGNsb3Nlc3REaXN0ID0gbnVsbDtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBvcmRlci5sZW5ndGg7IGkrKykge1xuICAgIHZhciBwID0gb3JkZXJbaV07XG4gICAgaWYgKHAuZnJvbSA+PSBlbmQgfHwgcC50byA8PSBiZWdpbikgeyBjb250aW51ZSB9XG4gICAgdmFyIGx0ciA9IHAubGV2ZWwgIT0gMTtcbiAgICB2YXIgZW5kWCA9IG1lYXN1cmVDaGFyUHJlcGFyZWQoY20sIHByZXBhcmVkTWVhc3VyZSwgbHRyID8gTWF0aC5taW4oZW5kLCBwLnRvKSAtIDEgOiBNYXRoLm1heChiZWdpbiwgcC5mcm9tKSkucmlnaHQ7XG4gICAgLy8gV2VpZ2ggYWdhaW5zdCBzcGFucyBlbmRpbmcgYmVmb3JlIHRoaXMsIHNvIHRoYXQgdGhleSBhcmUgb25seVxuICAgIC8vIHBpY2tlZCBpZiBub3RoaW5nIGVuZHMgYWZ0ZXJcbiAgICB2YXIgZGlzdCA9IGVuZFggPCB4ID8geCAtIGVuZFggKyAxZTkgOiBlbmRYIC0geDtcbiAgICBpZiAoIXBhcnQgfHwgY2xvc2VzdERpc3QgPiBkaXN0KSB7XG4gICAgICBwYXJ0ID0gcDtcbiAgICAgIGNsb3Nlc3REaXN0ID0gZGlzdDtcbiAgICB9XG4gIH1cbiAgaWYgKCFwYXJ0KSB7IHBhcnQgPSBvcmRlcltvcmRlci5sZW5ndGggLSAxXTsgfVxuICAvLyBDbGlwIHRoZSBwYXJ0IHRvIHRoZSB3cmFwcGVkIGxpbmUuXG4gIGlmIChwYXJ0LmZyb20gPCBiZWdpbikgeyBwYXJ0ID0ge2Zyb206IGJlZ2luLCB0bzogcGFydC50bywgbGV2ZWw6IHBhcnQubGV2ZWx9OyB9XG4gIGlmIChwYXJ0LnRvID4gZW5kKSB7IHBhcnQgPSB7ZnJvbTogcGFydC5mcm9tLCB0bzogZW5kLCBsZXZlbDogcGFydC5sZXZlbH07IH1cbiAgcmV0dXJuIHBhcnRcbn1cblxudmFyIG1lYXN1cmVUZXh0O1xuLy8gQ29tcHV0ZSB0aGUgZGVmYXVsdCB0ZXh0IGhlaWdodC5cbmZ1bmN0aW9uIHRleHRIZWlnaHQoZGlzcGxheSkge1xuICBpZiAoZGlzcGxheS5jYWNoZWRUZXh0SGVpZ2h0ICE9IG51bGwpIHsgcmV0dXJuIGRpc3BsYXkuY2FjaGVkVGV4dEhlaWdodCB9XG4gIGlmIChtZWFzdXJlVGV4dCA9PSBudWxsKSB7XG4gICAgbWVhc3VyZVRleHQgPSBlbHQoXCJwcmVcIik7XG4gICAgLy8gTWVhc3VyZSBhIGJ1bmNoIG9mIGxpbmVzLCBmb3IgYnJvd3NlcnMgdGhhdCBjb21wdXRlXG4gICAgLy8gZnJhY3Rpb25hbCBoZWlnaHRzLlxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgNDk7ICsraSkge1xuICAgICAgbWVhc3VyZVRleHQuYXBwZW5kQ2hpbGQoZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoXCJ4XCIpKTtcbiAgICAgIG1lYXN1cmVUZXh0LmFwcGVuZENoaWxkKGVsdChcImJyXCIpKTtcbiAgICB9XG4gICAgbWVhc3VyZVRleHQuYXBwZW5kQ2hpbGQoZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoXCJ4XCIpKTtcbiAgfVxuICByZW1vdmVDaGlsZHJlbkFuZEFkZChkaXNwbGF5Lm1lYXN1cmUsIG1lYXN1cmVUZXh0KTtcbiAgdmFyIGhlaWdodCA9IG1lYXN1cmVUZXh0Lm9mZnNldEhlaWdodCAvIDUwO1xuICBpZiAoaGVpZ2h0ID4gMykgeyBkaXNwbGF5LmNhY2hlZFRleHRIZWlnaHQgPSBoZWlnaHQ7IH1cbiAgcmVtb3ZlQ2hpbGRyZW4oZGlzcGxheS5tZWFzdXJlKTtcbiAgcmV0dXJuIGhlaWdodCB8fCAxXG59XG5cbi8vIENvbXB1dGUgdGhlIGRlZmF1bHQgY2hhcmFjdGVyIHdpZHRoLlxuZnVuY3Rpb24gY2hhcldpZHRoKGRpc3BsYXkpIHtcbiAgaWYgKGRpc3BsYXkuY2FjaGVkQ2hhcldpZHRoICE9IG51bGwpIHsgcmV0dXJuIGRpc3BsYXkuY2FjaGVkQ2hhcldpZHRoIH1cbiAgdmFyIGFuY2hvciA9IGVsdChcInNwYW5cIiwgXCJ4eHh4eHh4eHh4XCIpO1xuICB2YXIgcHJlID0gZWx0KFwicHJlXCIsIFthbmNob3JdKTtcbiAgcmVtb3ZlQ2hpbGRyZW5BbmRBZGQoZGlzcGxheS5tZWFzdXJlLCBwcmUpO1xuICB2YXIgcmVjdCA9IGFuY2hvci5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKSwgd2lkdGggPSAocmVjdC5yaWdodCAtIHJlY3QubGVmdCkgLyAxMDtcbiAgaWYgKHdpZHRoID4gMikgeyBkaXNwbGF5LmNhY2hlZENoYXJXaWR0aCA9IHdpZHRoOyB9XG4gIHJldHVybiB3aWR0aCB8fCAxMFxufVxuXG4vLyBEbyBhIGJ1bGstcmVhZCBvZiB0aGUgRE9NIHBvc2l0aW9ucyBhbmQgc2l6ZXMgbmVlZGVkIHRvIGRyYXcgdGhlXG4vLyB2aWV3LCBzbyB0aGF0IHdlIGRvbid0IGludGVybGVhdmUgcmVhZGluZyBhbmQgd3JpdGluZyB0byB0aGUgRE9NLlxuZnVuY3Rpb24gZ2V0RGltZW5zaW9ucyhjbSkge1xuICB2YXIgZCA9IGNtLmRpc3BsYXksIGxlZnQgPSB7fSwgd2lkdGggPSB7fTtcbiAgdmFyIGd1dHRlckxlZnQgPSBkLmd1dHRlcnMuY2xpZW50TGVmdDtcbiAgZm9yICh2YXIgbiA9IGQuZ3V0dGVycy5maXJzdENoaWxkLCBpID0gMDsgbjsgbiA9IG4ubmV4dFNpYmxpbmcsICsraSkge1xuICAgIGxlZnRbY20ub3B0aW9ucy5ndXR0ZXJzW2ldXSA9IG4ub2Zmc2V0TGVmdCArIG4uY2xpZW50TGVmdCArIGd1dHRlckxlZnQ7XG4gICAgd2lkdGhbY20ub3B0aW9ucy5ndXR0ZXJzW2ldXSA9IG4uY2xpZW50V2lkdGg7XG4gIH1cbiAgcmV0dXJuIHtmaXhlZFBvczogY29tcGVuc2F0ZUZvckhTY3JvbGwoZCksXG4gICAgICAgICAgZ3V0dGVyVG90YWxXaWR0aDogZC5ndXR0ZXJzLm9mZnNldFdpZHRoLFxuICAgICAgICAgIGd1dHRlckxlZnQ6IGxlZnQsXG4gICAgICAgICAgZ3V0dGVyV2lkdGg6IHdpZHRoLFxuICAgICAgICAgIHdyYXBwZXJXaWR0aDogZC53cmFwcGVyLmNsaWVudFdpZHRofVxufVxuXG4vLyBDb21wdXRlcyBkaXNwbGF5LnNjcm9sbGVyLnNjcm9sbExlZnQgKyBkaXNwbGF5Lmd1dHRlcnMub2Zmc2V0V2lkdGgsXG4vLyBidXQgdXNpbmcgZ2V0Qm91bmRpbmdDbGllbnRSZWN0IHRvIGdldCBhIHN1Yi1waXhlbC1hY2N1cmF0ZVxuLy8gcmVzdWx0LlxuZnVuY3Rpb24gY29tcGVuc2F0ZUZvckhTY3JvbGwoZGlzcGxheSkge1xuICByZXR1cm4gZGlzcGxheS5zY3JvbGxlci5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKS5sZWZ0IC0gZGlzcGxheS5zaXplci5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKS5sZWZ0XG59XG5cbi8vIFJldHVybnMgYSBmdW5jdGlvbiB0aGF0IGVzdGltYXRlcyB0aGUgaGVpZ2h0IG9mIGEgbGluZSwgdG8gdXNlIGFzXG4vLyBmaXJzdCBhcHByb3hpbWF0aW9uIHVudGlsIHRoZSBsaW5lIGJlY29tZXMgdmlzaWJsZSAoYW5kIGlzIHRodXNcbi8vIHByb3Blcmx5IG1lYXN1cmFibGUpLlxuZnVuY3Rpb24gZXN0aW1hdGVIZWlnaHQoY20pIHtcbiAgdmFyIHRoID0gdGV4dEhlaWdodChjbS5kaXNwbGF5KSwgd3JhcHBpbmcgPSBjbS5vcHRpb25zLmxpbmVXcmFwcGluZztcbiAgdmFyIHBlckxpbmUgPSB3cmFwcGluZyAmJiBNYXRoLm1heCg1LCBjbS5kaXNwbGF5LnNjcm9sbGVyLmNsaWVudFdpZHRoIC8gY2hhcldpZHRoKGNtLmRpc3BsYXkpIC0gMyk7XG4gIHJldHVybiBmdW5jdGlvbiAobGluZSkge1xuICAgIGlmIChsaW5lSXNIaWRkZW4oY20uZG9jLCBsaW5lKSkgeyByZXR1cm4gMCB9XG5cbiAgICB2YXIgd2lkZ2V0c0hlaWdodCA9IDA7XG4gICAgaWYgKGxpbmUud2lkZ2V0cykgeyBmb3IgKHZhciBpID0gMDsgaSA8IGxpbmUud2lkZ2V0cy5sZW5ndGg7IGkrKykge1xuICAgICAgaWYgKGxpbmUud2lkZ2V0c1tpXS5oZWlnaHQpIHsgd2lkZ2V0c0hlaWdodCArPSBsaW5lLndpZGdldHNbaV0uaGVpZ2h0OyB9XG4gICAgfSB9XG5cbiAgICBpZiAod3JhcHBpbmcpXG4gICAgICB7IHJldHVybiB3aWRnZXRzSGVpZ2h0ICsgKE1hdGguY2VpbChsaW5lLnRleHQubGVuZ3RoIC8gcGVyTGluZSkgfHwgMSkgKiB0aCB9XG4gICAgZWxzZVxuICAgICAgeyByZXR1cm4gd2lkZ2V0c0hlaWdodCArIHRoIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBlc3RpbWF0ZUxpbmVIZWlnaHRzKGNtKSB7XG4gIHZhciBkb2MgPSBjbS5kb2MsIGVzdCA9IGVzdGltYXRlSGVpZ2h0KGNtKTtcbiAgZG9jLml0ZXIoZnVuY3Rpb24gKGxpbmUpIHtcbiAgICB2YXIgZXN0SGVpZ2h0ID0gZXN0KGxpbmUpO1xuICAgIGlmIChlc3RIZWlnaHQgIT0gbGluZS5oZWlnaHQpIHsgdXBkYXRlTGluZUhlaWdodChsaW5lLCBlc3RIZWlnaHQpOyB9XG4gIH0pO1xufVxuXG4vLyBHaXZlbiBhIG1vdXNlIGV2ZW50LCBmaW5kIHRoZSBjb3JyZXNwb25kaW5nIHBvc2l0aW9uLiBJZiBsaWJlcmFsXG4vLyBpcyBmYWxzZSwgaXQgY2hlY2tzIHdoZXRoZXIgYSBndXR0ZXIgb3Igc2Nyb2xsYmFyIHdhcyBjbGlja2VkLFxuLy8gYW5kIHJldHVybnMgbnVsbCBpZiBpdCB3YXMuIGZvclJlY3QgaXMgdXNlZCBieSByZWN0YW5ndWxhclxuLy8gc2VsZWN0aW9ucywgYW5kIHRyaWVzIHRvIGVzdGltYXRlIGEgY2hhcmFjdGVyIHBvc2l0aW9uIGV2ZW4gZm9yXG4vLyBjb29yZGluYXRlcyBiZXlvbmQgdGhlIHJpZ2h0IG9mIHRoZSB0ZXh0LlxuZnVuY3Rpb24gcG9zRnJvbU1vdXNlKGNtLCBlLCBsaWJlcmFsLCBmb3JSZWN0KSB7XG4gIHZhciBkaXNwbGF5ID0gY20uZGlzcGxheTtcbiAgaWYgKCFsaWJlcmFsICYmIGVfdGFyZ2V0KGUpLmdldEF0dHJpYnV0ZShcImNtLW5vdC1jb250ZW50XCIpID09IFwidHJ1ZVwiKSB7IHJldHVybiBudWxsIH1cblxuICB2YXIgeCwgeSwgc3BhY2UgPSBkaXNwbGF5LmxpbmVTcGFjZS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgLy8gRmFpbHMgdW5wcmVkaWN0YWJseSBvbiBJRVs2N10gd2hlbiBtb3VzZSBpcyBkcmFnZ2VkIGFyb3VuZCBxdWlja2x5LlxuICB0cnkgeyB4ID0gZS5jbGllbnRYIC0gc3BhY2UubGVmdDsgeSA9IGUuY2xpZW50WSAtIHNwYWNlLnRvcDsgfVxuICBjYXRjaCAoZSkgeyByZXR1cm4gbnVsbCB9XG4gIHZhciBjb29yZHMgPSBjb29yZHNDaGFyKGNtLCB4LCB5KSwgbGluZTtcbiAgaWYgKGZvclJlY3QgJiYgY29vcmRzLnhSZWwgPT0gMSAmJiAobGluZSA9IGdldExpbmUoY20uZG9jLCBjb29yZHMubGluZSkudGV4dCkubGVuZ3RoID09IGNvb3Jkcy5jaCkge1xuICAgIHZhciBjb2xEaWZmID0gY291bnRDb2x1bW4obGluZSwgbGluZS5sZW5ndGgsIGNtLm9wdGlvbnMudGFiU2l6ZSkgLSBsaW5lLmxlbmd0aDtcbiAgICBjb29yZHMgPSBQb3MoY29vcmRzLmxpbmUsIE1hdGgubWF4KDAsIE1hdGgucm91bmQoKHggLSBwYWRkaW5nSChjbS5kaXNwbGF5KS5sZWZ0KSAvIGNoYXJXaWR0aChjbS5kaXNwbGF5KSkgLSBjb2xEaWZmKSk7XG4gIH1cbiAgcmV0dXJuIGNvb3Jkc1xufVxuXG4vLyBGaW5kIHRoZSB2aWV3IGVsZW1lbnQgY29ycmVzcG9uZGluZyB0byBhIGdpdmVuIGxpbmUuIFJldHVybiBudWxsXG4vLyB3aGVuIHRoZSBsaW5lIGlzbid0IHZpc2libGUuXG5mdW5jdGlvbiBmaW5kVmlld0luZGV4KGNtLCBuKSB7XG4gIGlmIChuID49IGNtLmRpc3BsYXkudmlld1RvKSB7IHJldHVybiBudWxsIH1cbiAgbiAtPSBjbS5kaXNwbGF5LnZpZXdGcm9tO1xuICBpZiAobiA8IDApIHsgcmV0dXJuIG51bGwgfVxuICB2YXIgdmlldyA9IGNtLmRpc3BsYXkudmlldztcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCB2aWV3Lmxlbmd0aDsgaSsrKSB7XG4gICAgbiAtPSB2aWV3W2ldLnNpemU7XG4gICAgaWYgKG4gPCAwKSB7IHJldHVybiBpIH1cbiAgfVxufVxuXG5mdW5jdGlvbiB1cGRhdGVTZWxlY3Rpb24oY20pIHtcbiAgY20uZGlzcGxheS5pbnB1dC5zaG93U2VsZWN0aW9uKGNtLmRpc3BsYXkuaW5wdXQucHJlcGFyZVNlbGVjdGlvbigpKTtcbn1cblxuZnVuY3Rpb24gcHJlcGFyZVNlbGVjdGlvbihjbSwgcHJpbWFyeSkge1xuICBpZiAoIHByaW1hcnkgPT09IHZvaWQgMCApIHByaW1hcnkgPSB0cnVlO1xuXG4gIHZhciBkb2MgPSBjbS5kb2MsIHJlc3VsdCA9IHt9O1xuICB2YXIgY3VyRnJhZ21lbnQgPSByZXN1bHQuY3Vyc29ycyA9IGRvY3VtZW50LmNyZWF0ZURvY3VtZW50RnJhZ21lbnQoKTtcbiAgdmFyIHNlbEZyYWdtZW50ID0gcmVzdWx0LnNlbGVjdGlvbiA9IGRvY3VtZW50LmNyZWF0ZURvY3VtZW50RnJhZ21lbnQoKTtcblxuICBmb3IgKHZhciBpID0gMDsgaSA8IGRvYy5zZWwucmFuZ2VzLmxlbmd0aDsgaSsrKSB7XG4gICAgaWYgKCFwcmltYXJ5ICYmIGkgPT0gZG9jLnNlbC5wcmltSW5kZXgpIHsgY29udGludWUgfVxuICAgIHZhciByYW5nZSQkMSA9IGRvYy5zZWwucmFuZ2VzW2ldO1xuICAgIGlmIChyYW5nZSQkMS5mcm9tKCkubGluZSA+PSBjbS5kaXNwbGF5LnZpZXdUbyB8fCByYW5nZSQkMS50bygpLmxpbmUgPCBjbS5kaXNwbGF5LnZpZXdGcm9tKSB7IGNvbnRpbnVlIH1cbiAgICB2YXIgY29sbGFwc2VkID0gcmFuZ2UkJDEuZW1wdHkoKTtcbiAgICBpZiAoY29sbGFwc2VkIHx8IGNtLm9wdGlvbnMuc2hvd0N1cnNvcldoZW5TZWxlY3RpbmcpXG4gICAgICB7IGRyYXdTZWxlY3Rpb25DdXJzb3IoY20sIHJhbmdlJCQxLmhlYWQsIGN1ckZyYWdtZW50KTsgfVxuICAgIGlmICghY29sbGFwc2VkKVxuICAgICAgeyBkcmF3U2VsZWN0aW9uUmFuZ2UoY20sIHJhbmdlJCQxLCBzZWxGcmFnbWVudCk7IH1cbiAgfVxuICByZXR1cm4gcmVzdWx0XG59XG5cbi8vIERyYXdzIGEgY3Vyc29yIGZvciB0aGUgZ2l2ZW4gcmFuZ2VcbmZ1bmN0aW9uIGRyYXdTZWxlY3Rpb25DdXJzb3IoY20sIGhlYWQsIG91dHB1dCkge1xuICB2YXIgcG9zID0gY3Vyc29yQ29vcmRzKGNtLCBoZWFkLCBcImRpdlwiLCBudWxsLCBudWxsLCAhY20ub3B0aW9ucy5zaW5nbGVDdXJzb3JIZWlnaHRQZXJMaW5lKTtcblxuICB2YXIgY3Vyc29yID0gb3V0cHV0LmFwcGVuZENoaWxkKGVsdChcImRpdlwiLCBcIlxcdTAwYTBcIiwgXCJDb2RlTWlycm9yLWN1cnNvclwiKSk7XG4gIGN1cnNvci5zdHlsZS5sZWZ0ID0gcG9zLmxlZnQgKyBcInB4XCI7XG4gIGN1cnNvci5zdHlsZS50b3AgPSBwb3MudG9wICsgXCJweFwiO1xuICBjdXJzb3Iuc3R5bGUuaGVpZ2h0ID0gTWF0aC5tYXgoMCwgcG9zLmJvdHRvbSAtIHBvcy50b3ApICogY20ub3B0aW9ucy5jdXJzb3JIZWlnaHQgKyBcInB4XCI7XG5cbiAgaWYgKHBvcy5vdGhlcikge1xuICAgIC8vIFNlY29uZGFyeSBjdXJzb3IsIHNob3duIHdoZW4gb24gYSAnanVtcCcgaW4gYmktZGlyZWN0aW9uYWwgdGV4dFxuICAgIHZhciBvdGhlckN1cnNvciA9IG91dHB1dC5hcHBlbmRDaGlsZChlbHQoXCJkaXZcIiwgXCJcXHUwMGEwXCIsIFwiQ29kZU1pcnJvci1jdXJzb3IgQ29kZU1pcnJvci1zZWNvbmRhcnljdXJzb3JcIikpO1xuICAgIG90aGVyQ3Vyc29yLnN0eWxlLmRpc3BsYXkgPSBcIlwiO1xuICAgIG90aGVyQ3Vyc29yLnN0eWxlLmxlZnQgPSBwb3Mub3RoZXIubGVmdCArIFwicHhcIjtcbiAgICBvdGhlckN1cnNvci5zdHlsZS50b3AgPSBwb3Mub3RoZXIudG9wICsgXCJweFwiO1xuICAgIG90aGVyQ3Vyc29yLnN0eWxlLmhlaWdodCA9IChwb3Mub3RoZXIuYm90dG9tIC0gcG9zLm90aGVyLnRvcCkgKiAuODUgKyBcInB4XCI7XG4gIH1cbn1cblxuZnVuY3Rpb24gY21wQ29vcmRzKGEsIGIpIHsgcmV0dXJuIGEudG9wIC0gYi50b3AgfHwgYS5sZWZ0IC0gYi5sZWZ0IH1cblxuLy8gRHJhd3MgdGhlIGdpdmVuIHJhbmdlIGFzIGEgaGlnaGxpZ2h0ZWQgc2VsZWN0aW9uXG5mdW5jdGlvbiBkcmF3U2VsZWN0aW9uUmFuZ2UoY20sIHJhbmdlJCQxLCBvdXRwdXQpIHtcbiAgdmFyIGRpc3BsYXkgPSBjbS5kaXNwbGF5LCBkb2MgPSBjbS5kb2M7XG4gIHZhciBmcmFnbWVudCA9IGRvY3VtZW50LmNyZWF0ZURvY3VtZW50RnJhZ21lbnQoKTtcbiAgdmFyIHBhZGRpbmcgPSBwYWRkaW5nSChjbS5kaXNwbGF5KSwgbGVmdFNpZGUgPSBwYWRkaW5nLmxlZnQ7XG4gIHZhciByaWdodFNpZGUgPSBNYXRoLm1heChkaXNwbGF5LnNpemVyV2lkdGgsIGRpc3BsYXlXaWR0aChjbSkgLSBkaXNwbGF5LnNpemVyLm9mZnNldExlZnQpIC0gcGFkZGluZy5yaWdodDtcbiAgdmFyIGRvY0xUUiA9IGRvYy5kaXJlY3Rpb24gPT0gXCJsdHJcIjtcblxuICBmdW5jdGlvbiBhZGQobGVmdCwgdG9wLCB3aWR0aCwgYm90dG9tKSB7XG4gICAgaWYgKHRvcCA8IDApIHsgdG9wID0gMDsgfVxuICAgIHRvcCA9IE1hdGgucm91bmQodG9wKTtcbiAgICBib3R0b20gPSBNYXRoLnJvdW5kKGJvdHRvbSk7XG4gICAgZnJhZ21lbnQuYXBwZW5kQ2hpbGQoZWx0KFwiZGl2XCIsIG51bGwsIFwiQ29kZU1pcnJvci1zZWxlY3RlZFwiLCAoXCJwb3NpdGlvbjogYWJzb2x1dGU7IGxlZnQ6IFwiICsgbGVmdCArIFwicHg7XFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0b3A6IFwiICsgdG9wICsgXCJweDsgd2lkdGg6IFwiICsgKHdpZHRoID09IG51bGwgPyByaWdodFNpZGUgLSBsZWZ0IDogd2lkdGgpICsgXCJweDtcXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIGhlaWdodDogXCIgKyAoYm90dG9tIC0gdG9wKSArIFwicHhcIikpKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGRyYXdGb3JMaW5lKGxpbmUsIGZyb21BcmcsIHRvQXJnKSB7XG4gICAgdmFyIGxpbmVPYmogPSBnZXRMaW5lKGRvYywgbGluZSk7XG4gICAgdmFyIGxpbmVMZW4gPSBsaW5lT2JqLnRleHQubGVuZ3RoO1xuICAgIHZhciBzdGFydCwgZW5kO1xuICAgIGZ1bmN0aW9uIGNvb3JkcyhjaCwgYmlhcykge1xuICAgICAgcmV0dXJuIGNoYXJDb29yZHMoY20sIFBvcyhsaW5lLCBjaCksIFwiZGl2XCIsIGxpbmVPYmosIGJpYXMpXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gd3JhcFgocG9zLCBkaXIsIHNpZGUpIHtcbiAgICAgIHZhciBleHRlbnQgPSB3cmFwcGVkTGluZUV4dGVudENoYXIoY20sIGxpbmVPYmosIG51bGwsIHBvcyk7XG4gICAgICB2YXIgcHJvcCA9IChkaXIgPT0gXCJsdHJcIikgPT0gKHNpZGUgPT0gXCJhZnRlclwiKSA/IFwibGVmdFwiIDogXCJyaWdodFwiO1xuICAgICAgdmFyIGNoID0gc2lkZSA9PSBcImFmdGVyXCIgPyBleHRlbnQuYmVnaW4gOiBleHRlbnQuZW5kIC0gKC9cXHMvLnRlc3QobGluZU9iai50ZXh0LmNoYXJBdChleHRlbnQuZW5kIC0gMSkpID8gMiA6IDEpO1xuICAgICAgcmV0dXJuIGNvb3JkcyhjaCwgcHJvcClbcHJvcF1cbiAgICB9XG5cbiAgICB2YXIgb3JkZXIgPSBnZXRPcmRlcihsaW5lT2JqLCBkb2MuZGlyZWN0aW9uKTtcbiAgICBpdGVyYXRlQmlkaVNlY3Rpb25zKG9yZGVyLCBmcm9tQXJnIHx8IDAsIHRvQXJnID09IG51bGwgPyBsaW5lTGVuIDogdG9BcmcsIGZ1bmN0aW9uIChmcm9tLCB0bywgZGlyLCBpKSB7XG4gICAgICB2YXIgbHRyID0gZGlyID09IFwibHRyXCI7XG4gICAgICB2YXIgZnJvbVBvcyA9IGNvb3Jkcyhmcm9tLCBsdHIgPyBcImxlZnRcIiA6IFwicmlnaHRcIik7XG4gICAgICB2YXIgdG9Qb3MgPSBjb29yZHModG8gLSAxLCBsdHIgPyBcInJpZ2h0XCIgOiBcImxlZnRcIik7XG5cbiAgICAgIHZhciBvcGVuU3RhcnQgPSBmcm9tQXJnID09IG51bGwgJiYgZnJvbSA9PSAwLCBvcGVuRW5kID0gdG9BcmcgPT0gbnVsbCAmJiB0byA9PSBsaW5lTGVuO1xuICAgICAgdmFyIGZpcnN0ID0gaSA9PSAwLCBsYXN0ID0gIW9yZGVyIHx8IGkgPT0gb3JkZXIubGVuZ3RoIC0gMTtcbiAgICAgIGlmICh0b1Bvcy50b3AgLSBmcm9tUG9zLnRvcCA8PSAzKSB7IC8vIFNpbmdsZSBsaW5lXG4gICAgICAgIHZhciBvcGVuTGVmdCA9IChkb2NMVFIgPyBvcGVuU3RhcnQgOiBvcGVuRW5kKSAmJiBmaXJzdDtcbiAgICAgICAgdmFyIG9wZW5SaWdodCA9IChkb2NMVFIgPyBvcGVuRW5kIDogb3BlblN0YXJ0KSAmJiBsYXN0O1xuICAgICAgICB2YXIgbGVmdCA9IG9wZW5MZWZ0ID8gbGVmdFNpZGUgOiAobHRyID8gZnJvbVBvcyA6IHRvUG9zKS5sZWZ0O1xuICAgICAgICB2YXIgcmlnaHQgPSBvcGVuUmlnaHQgPyByaWdodFNpZGUgOiAobHRyID8gdG9Qb3MgOiBmcm9tUG9zKS5yaWdodDtcbiAgICAgICAgYWRkKGxlZnQsIGZyb21Qb3MudG9wLCByaWdodCAtIGxlZnQsIGZyb21Qb3MuYm90dG9tKTtcbiAgICAgIH0gZWxzZSB7IC8vIE11bHRpcGxlIGxpbmVzXG4gICAgICAgIHZhciB0b3BMZWZ0LCB0b3BSaWdodCwgYm90TGVmdCwgYm90UmlnaHQ7XG4gICAgICAgIGlmIChsdHIpIHtcbiAgICAgICAgICB0b3BMZWZ0ID0gZG9jTFRSICYmIG9wZW5TdGFydCAmJiBmaXJzdCA/IGxlZnRTaWRlIDogZnJvbVBvcy5sZWZ0O1xuICAgICAgICAgIHRvcFJpZ2h0ID0gZG9jTFRSID8gcmlnaHRTaWRlIDogd3JhcFgoZnJvbSwgZGlyLCBcImJlZm9yZVwiKTtcbiAgICAgICAgICBib3RMZWZ0ID0gZG9jTFRSID8gbGVmdFNpZGUgOiB3cmFwWCh0bywgZGlyLCBcImFmdGVyXCIpO1xuICAgICAgICAgIGJvdFJpZ2h0ID0gZG9jTFRSICYmIG9wZW5FbmQgJiYgbGFzdCA/IHJpZ2h0U2lkZSA6IHRvUG9zLnJpZ2h0O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRvcExlZnQgPSAhZG9jTFRSID8gbGVmdFNpZGUgOiB3cmFwWChmcm9tLCBkaXIsIFwiYmVmb3JlXCIpO1xuICAgICAgICAgIHRvcFJpZ2h0ID0gIWRvY0xUUiAmJiBvcGVuU3RhcnQgJiYgZmlyc3QgPyByaWdodFNpZGUgOiBmcm9tUG9zLnJpZ2h0O1xuICAgICAgICAgIGJvdExlZnQgPSAhZG9jTFRSICYmIG9wZW5FbmQgJiYgbGFzdCA/IGxlZnRTaWRlIDogdG9Qb3MubGVmdDtcbiAgICAgICAgICBib3RSaWdodCA9ICFkb2NMVFIgPyByaWdodFNpZGUgOiB3cmFwWCh0bywgZGlyLCBcImFmdGVyXCIpO1xuICAgICAgICB9XG4gICAgICAgIGFkZCh0b3BMZWZ0LCBmcm9tUG9zLnRvcCwgdG9wUmlnaHQgLSB0b3BMZWZ0LCBmcm9tUG9zLmJvdHRvbSk7XG4gICAgICAgIGlmIChmcm9tUG9zLmJvdHRvbSA8IHRvUG9zLnRvcCkgeyBhZGQobGVmdFNpZGUsIGZyb21Qb3MuYm90dG9tLCBudWxsLCB0b1Bvcy50b3ApOyB9XG4gICAgICAgIGFkZChib3RMZWZ0LCB0b1Bvcy50b3AsIGJvdFJpZ2h0IC0gYm90TGVmdCwgdG9Qb3MuYm90dG9tKTtcbiAgICAgIH1cblxuICAgICAgaWYgKCFzdGFydCB8fCBjbXBDb29yZHMoZnJvbVBvcywgc3RhcnQpIDwgMCkgeyBzdGFydCA9IGZyb21Qb3M7IH1cbiAgICAgIGlmIChjbXBDb29yZHModG9Qb3MsIHN0YXJ0KSA8IDApIHsgc3RhcnQgPSB0b1BvczsgfVxuICAgICAgaWYgKCFlbmQgfHwgY21wQ29vcmRzKGZyb21Qb3MsIGVuZCkgPCAwKSB7IGVuZCA9IGZyb21Qb3M7IH1cbiAgICAgIGlmIChjbXBDb29yZHModG9Qb3MsIGVuZCkgPCAwKSB7IGVuZCA9IHRvUG9zOyB9XG4gICAgfSk7XG4gICAgcmV0dXJuIHtzdGFydDogc3RhcnQsIGVuZDogZW5kfVxuICB9XG5cbiAgdmFyIHNGcm9tID0gcmFuZ2UkJDEuZnJvbSgpLCBzVG8gPSByYW5nZSQkMS50bygpO1xuICBpZiAoc0Zyb20ubGluZSA9PSBzVG8ubGluZSkge1xuICAgIGRyYXdGb3JMaW5lKHNGcm9tLmxpbmUsIHNGcm9tLmNoLCBzVG8uY2gpO1xuICB9IGVsc2Uge1xuICAgIHZhciBmcm9tTGluZSA9IGdldExpbmUoZG9jLCBzRnJvbS5saW5lKSwgdG9MaW5lID0gZ2V0TGluZShkb2MsIHNUby5saW5lKTtcbiAgICB2YXIgc2luZ2xlVkxpbmUgPSB2aXN1YWxMaW5lKGZyb21MaW5lKSA9PSB2aXN1YWxMaW5lKHRvTGluZSk7XG4gICAgdmFyIGxlZnRFbmQgPSBkcmF3Rm9yTGluZShzRnJvbS5saW5lLCBzRnJvbS5jaCwgc2luZ2xlVkxpbmUgPyBmcm9tTGluZS50ZXh0Lmxlbmd0aCArIDEgOiBudWxsKS5lbmQ7XG4gICAgdmFyIHJpZ2h0U3RhcnQgPSBkcmF3Rm9yTGluZShzVG8ubGluZSwgc2luZ2xlVkxpbmUgPyAwIDogbnVsbCwgc1RvLmNoKS5zdGFydDtcbiAgICBpZiAoc2luZ2xlVkxpbmUpIHtcbiAgICAgIGlmIChsZWZ0RW5kLnRvcCA8IHJpZ2h0U3RhcnQudG9wIC0gMikge1xuICAgICAgICBhZGQobGVmdEVuZC5yaWdodCwgbGVmdEVuZC50b3AsIG51bGwsIGxlZnRFbmQuYm90dG9tKTtcbiAgICAgICAgYWRkKGxlZnRTaWRlLCByaWdodFN0YXJ0LnRvcCwgcmlnaHRTdGFydC5sZWZ0LCByaWdodFN0YXJ0LmJvdHRvbSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBhZGQobGVmdEVuZC5yaWdodCwgbGVmdEVuZC50b3AsIHJpZ2h0U3RhcnQubGVmdCAtIGxlZnRFbmQucmlnaHQsIGxlZnRFbmQuYm90dG9tKTtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKGxlZnRFbmQuYm90dG9tIDwgcmlnaHRTdGFydC50b3ApXG4gICAgICB7IGFkZChsZWZ0U2lkZSwgbGVmdEVuZC5ib3R0b20sIG51bGwsIHJpZ2h0U3RhcnQudG9wKTsgfVxuICB9XG5cbiAgb3V0cHV0LmFwcGVuZENoaWxkKGZyYWdtZW50KTtcbn1cblxuLy8gQ3Vyc29yLWJsaW5raW5nXG5mdW5jdGlvbiByZXN0YXJ0QmxpbmsoY20pIHtcbiAgaWYgKCFjbS5zdGF0ZS5mb2N1c2VkKSB7IHJldHVybiB9XG4gIHZhciBkaXNwbGF5ID0gY20uZGlzcGxheTtcbiAgY2xlYXJJbnRlcnZhbChkaXNwbGF5LmJsaW5rZXIpO1xuICB2YXIgb24gPSB0cnVlO1xuICBkaXNwbGF5LmN1cnNvckRpdi5zdHlsZS52aXNpYmlsaXR5ID0gXCJcIjtcbiAgaWYgKGNtLm9wdGlvbnMuY3Vyc29yQmxpbmtSYXRlID4gMClcbiAgICB7IGRpc3BsYXkuYmxpbmtlciA9IHNldEludGVydmFsKGZ1bmN0aW9uICgpIHsgcmV0dXJuIGRpc3BsYXkuY3Vyc29yRGl2LnN0eWxlLnZpc2liaWxpdHkgPSAob24gPSAhb24pID8gXCJcIiA6IFwiaGlkZGVuXCI7IH0sXG4gICAgICBjbS5vcHRpb25zLmN1cnNvckJsaW5rUmF0ZSk7IH1cbiAgZWxzZSBpZiAoY20ub3B0aW9ucy5jdXJzb3JCbGlua1JhdGUgPCAwKVxuICAgIHsgZGlzcGxheS5jdXJzb3JEaXYuc3R5bGUudmlzaWJpbGl0eSA9IFwiaGlkZGVuXCI7IH1cbn1cblxuZnVuY3Rpb24gZW5zdXJlRm9jdXMoY20pIHtcbiAgaWYgKCFjbS5zdGF0ZS5mb2N1c2VkKSB7IGNtLmRpc3BsYXkuaW5wdXQuZm9jdXMoKTsgb25Gb2N1cyhjbSk7IH1cbn1cblxuZnVuY3Rpb24gZGVsYXlCbHVyRXZlbnQoY20pIHtcbiAgY20uc3RhdGUuZGVsYXlpbmdCbHVyRXZlbnQgPSB0cnVlO1xuICBzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHsgaWYgKGNtLnN0YXRlLmRlbGF5aW5nQmx1ckV2ZW50KSB7XG4gICAgY20uc3RhdGUuZGVsYXlpbmdCbHVyRXZlbnQgPSBmYWxzZTtcbiAgICBvbkJsdXIoY20pO1xuICB9IH0sIDEwMCk7XG59XG5cbmZ1bmN0aW9uIG9uRm9jdXMoY20sIGUpIHtcbiAgaWYgKGNtLnN0YXRlLmRlbGF5aW5nQmx1ckV2ZW50KSB7IGNtLnN0YXRlLmRlbGF5aW5nQmx1ckV2ZW50ID0gZmFsc2U7IH1cblxuICBpZiAoY20ub3B0aW9ucy5yZWFkT25seSA9PSBcIm5vY3Vyc29yXCIpIHsgcmV0dXJuIH1cbiAgaWYgKCFjbS5zdGF0ZS5mb2N1c2VkKSB7XG4gICAgc2lnbmFsKGNtLCBcImZvY3VzXCIsIGNtLCBlKTtcbiAgICBjbS5zdGF0ZS5mb2N1c2VkID0gdHJ1ZTtcbiAgICBhZGRDbGFzcyhjbS5kaXNwbGF5LndyYXBwZXIsIFwiQ29kZU1pcnJvci1mb2N1c2VkXCIpO1xuICAgIC8vIFRoaXMgdGVzdCBwcmV2ZW50cyB0aGlzIGZyb20gZmlyaW5nIHdoZW4gYSBjb250ZXh0XG4gICAgLy8gbWVudSBpcyBjbG9zZWQgKHNpbmNlIHRoZSBpbnB1dCByZXNldCB3b3VsZCBraWxsIHRoZVxuICAgIC8vIHNlbGVjdC1hbGwgZGV0ZWN0aW9uIGhhY2spXG4gICAgaWYgKCFjbS5jdXJPcCAmJiBjbS5kaXNwbGF5LnNlbEZvckNvbnRleHRNZW51ICE9IGNtLmRvYy5zZWwpIHtcbiAgICAgIGNtLmRpc3BsYXkuaW5wdXQucmVzZXQoKTtcbiAgICAgIGlmICh3ZWJraXQpIHsgc2V0VGltZW91dChmdW5jdGlvbiAoKSB7IHJldHVybiBjbS5kaXNwbGF5LmlucHV0LnJlc2V0KHRydWUpOyB9LCAyMCk7IH0gLy8gSXNzdWUgIzE3MzBcbiAgICB9XG4gICAgY20uZGlzcGxheS5pbnB1dC5yZWNlaXZlZEZvY3VzKCk7XG4gIH1cbiAgcmVzdGFydEJsaW5rKGNtKTtcbn1cbmZ1bmN0aW9uIG9uQmx1cihjbSwgZSkge1xuICBpZiAoY20uc3RhdGUuZGVsYXlpbmdCbHVyRXZlbnQpIHsgcmV0dXJuIH1cblxuICBpZiAoY20uc3RhdGUuZm9jdXNlZCkge1xuICAgIHNpZ25hbChjbSwgXCJibHVyXCIsIGNtLCBlKTtcbiAgICBjbS5zdGF0ZS5mb2N1c2VkID0gZmFsc2U7XG4gICAgcm1DbGFzcyhjbS5kaXNwbGF5LndyYXBwZXIsIFwiQ29kZU1pcnJvci1mb2N1c2VkXCIpO1xuICB9XG4gIGNsZWFySW50ZXJ2YWwoY20uZGlzcGxheS5ibGlua2VyKTtcbiAgc2V0VGltZW91dChmdW5jdGlvbiAoKSB7IGlmICghY20uc3RhdGUuZm9jdXNlZCkgeyBjbS5kaXNwbGF5LnNoaWZ0ID0gZmFsc2U7IH0gfSwgMTUwKTtcbn1cblxuLy8gUmVhZCB0aGUgYWN0dWFsIGhlaWdodHMgb2YgdGhlIHJlbmRlcmVkIGxpbmVzLCBhbmQgdXBkYXRlIHRoZWlyXG4vLyBzdG9yZWQgaGVpZ2h0cyB0byBtYXRjaC5cbmZ1bmN0aW9uIHVwZGF0ZUhlaWdodHNJblZpZXdwb3J0KGNtKSB7XG4gIHZhciBkaXNwbGF5ID0gY20uZGlzcGxheTtcbiAgdmFyIHByZXZCb3R0b20gPSBkaXNwbGF5LmxpbmVEaXYub2Zmc2V0VG9wO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGRpc3BsYXkudmlldy5sZW5ndGg7IGkrKykge1xuICAgIHZhciBjdXIgPSBkaXNwbGF5LnZpZXdbaV0sIGhlaWdodCA9ICh2b2lkIDApO1xuICAgIGlmIChjdXIuaGlkZGVuKSB7IGNvbnRpbnVlIH1cbiAgICBpZiAoaWUgJiYgaWVfdmVyc2lvbiA8IDgpIHtcbiAgICAgIHZhciBib3QgPSBjdXIubm9kZS5vZmZzZXRUb3AgKyBjdXIubm9kZS5vZmZzZXRIZWlnaHQ7XG4gICAgICBoZWlnaHQgPSBib3QgLSBwcmV2Qm90dG9tO1xuICAgICAgcHJldkJvdHRvbSA9IGJvdDtcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIGJveCA9IGN1ci5ub2RlLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgICAgaGVpZ2h0ID0gYm94LmJvdHRvbSAtIGJveC50b3A7XG4gICAgfVxuICAgIHZhciBkaWZmID0gY3VyLmxpbmUuaGVpZ2h0IC0gaGVpZ2h0O1xuICAgIGlmIChoZWlnaHQgPCAyKSB7IGhlaWdodCA9IHRleHRIZWlnaHQoZGlzcGxheSk7IH1cbiAgICBpZiAoZGlmZiA+IC4wMDUgfHwgZGlmZiA8IC0uMDA1KSB7XG4gICAgICB1cGRhdGVMaW5lSGVpZ2h0KGN1ci5saW5lLCBoZWlnaHQpO1xuICAgICAgdXBkYXRlV2lkZ2V0SGVpZ2h0KGN1ci5saW5lKTtcbiAgICAgIGlmIChjdXIucmVzdCkgeyBmb3IgKHZhciBqID0gMDsgaiA8IGN1ci5yZXN0Lmxlbmd0aDsgaisrKVxuICAgICAgICB7IHVwZGF0ZVdpZGdldEhlaWdodChjdXIucmVzdFtqXSk7IH0gfVxuICAgIH1cbiAgfVxufVxuXG4vLyBSZWFkIGFuZCBzdG9yZSB0aGUgaGVpZ2h0IG9mIGxpbmUgd2lkZ2V0cyBhc3NvY2lhdGVkIHdpdGggdGhlXG4vLyBnaXZlbiBsaW5lLlxuZnVuY3Rpb24gdXBkYXRlV2lkZ2V0SGVpZ2h0KGxpbmUpIHtcbiAgaWYgKGxpbmUud2lkZ2V0cykgeyBmb3IgKHZhciBpID0gMDsgaSA8IGxpbmUud2lkZ2V0cy5sZW5ndGg7ICsraSkge1xuICAgIHZhciB3ID0gbGluZS53aWRnZXRzW2ldLCBwYXJlbnQgPSB3Lm5vZGUucGFyZW50Tm9kZTtcbiAgICBpZiAocGFyZW50KSB7IHcuaGVpZ2h0ID0gcGFyZW50Lm9mZnNldEhlaWdodDsgfVxuICB9IH1cbn1cblxuLy8gQ29tcHV0ZSB0aGUgbGluZXMgdGhhdCBhcmUgdmlzaWJsZSBpbiBhIGdpdmVuIHZpZXdwb3J0IChkZWZhdWx0c1xuLy8gdGhlIHRoZSBjdXJyZW50IHNjcm9sbCBwb3NpdGlvbikuIHZpZXdwb3J0IG1heSBjb250YWluIHRvcCxcbi8vIGhlaWdodCwgYW5kIGVuc3VyZSAoc2VlIG9wLnNjcm9sbFRvUG9zKSBwcm9wZXJ0aWVzLlxuZnVuY3Rpb24gdmlzaWJsZUxpbmVzKGRpc3BsYXksIGRvYywgdmlld3BvcnQpIHtcbiAgdmFyIHRvcCA9IHZpZXdwb3J0ICYmIHZpZXdwb3J0LnRvcCAhPSBudWxsID8gTWF0aC5tYXgoMCwgdmlld3BvcnQudG9wKSA6IGRpc3BsYXkuc2Nyb2xsZXIuc2Nyb2xsVG9wO1xuICB0b3AgPSBNYXRoLmZsb29yKHRvcCAtIHBhZGRpbmdUb3AoZGlzcGxheSkpO1xuICB2YXIgYm90dG9tID0gdmlld3BvcnQgJiYgdmlld3BvcnQuYm90dG9tICE9IG51bGwgPyB2aWV3cG9ydC5ib3R0b20gOiB0b3AgKyBkaXNwbGF5LndyYXBwZXIuY2xpZW50SGVpZ2h0O1xuXG4gIHZhciBmcm9tID0gbGluZUF0SGVpZ2h0KGRvYywgdG9wKSwgdG8gPSBsaW5lQXRIZWlnaHQoZG9jLCBib3R0b20pO1xuICAvLyBFbnN1cmUgaXMgYSB7ZnJvbToge2xpbmUsIGNofSwgdG86IHtsaW5lLCBjaH19IG9iamVjdCwgYW5kXG4gIC8vIGZvcmNlcyB0aG9zZSBsaW5lcyBpbnRvIHRoZSB2aWV3cG9ydCAoaWYgcG9zc2libGUpLlxuICBpZiAodmlld3BvcnQgJiYgdmlld3BvcnQuZW5zdXJlKSB7XG4gICAgdmFyIGVuc3VyZUZyb20gPSB2aWV3cG9ydC5lbnN1cmUuZnJvbS5saW5lLCBlbnN1cmVUbyA9IHZpZXdwb3J0LmVuc3VyZS50by5saW5lO1xuICAgIGlmIChlbnN1cmVGcm9tIDwgZnJvbSkge1xuICAgICAgZnJvbSA9IGVuc3VyZUZyb207XG4gICAgICB0byA9IGxpbmVBdEhlaWdodChkb2MsIGhlaWdodEF0TGluZShnZXRMaW5lKGRvYywgZW5zdXJlRnJvbSkpICsgZGlzcGxheS53cmFwcGVyLmNsaWVudEhlaWdodCk7XG4gICAgfSBlbHNlIGlmIChNYXRoLm1pbihlbnN1cmVUbywgZG9jLmxhc3RMaW5lKCkpID49IHRvKSB7XG4gICAgICBmcm9tID0gbGluZUF0SGVpZ2h0KGRvYywgaGVpZ2h0QXRMaW5lKGdldExpbmUoZG9jLCBlbnN1cmVUbykpIC0gZGlzcGxheS53cmFwcGVyLmNsaWVudEhlaWdodCk7XG4gICAgICB0byA9IGVuc3VyZVRvO1xuICAgIH1cbiAgfVxuICByZXR1cm4ge2Zyb206IGZyb20sIHRvOiBNYXRoLm1heCh0bywgZnJvbSArIDEpfVxufVxuXG4vLyBSZS1hbGlnbiBsaW5lIG51bWJlcnMgYW5kIGd1dHRlciBtYXJrcyB0byBjb21wZW5zYXRlIGZvclxuLy8gaG9yaXpvbnRhbCBzY3JvbGxpbmcuXG5mdW5jdGlvbiBhbGlnbkhvcml6b250YWxseShjbSkge1xuICB2YXIgZGlzcGxheSA9IGNtLmRpc3BsYXksIHZpZXcgPSBkaXNwbGF5LnZpZXc7XG4gIGlmICghZGlzcGxheS5hbGlnbldpZGdldHMgJiYgKCFkaXNwbGF5Lmd1dHRlcnMuZmlyc3RDaGlsZCB8fCAhY20ub3B0aW9ucy5maXhlZEd1dHRlcikpIHsgcmV0dXJuIH1cbiAgdmFyIGNvbXAgPSBjb21wZW5zYXRlRm9ySFNjcm9sbChkaXNwbGF5KSAtIGRpc3BsYXkuc2Nyb2xsZXIuc2Nyb2xsTGVmdCArIGNtLmRvYy5zY3JvbGxMZWZ0O1xuICB2YXIgZ3V0dGVyVyA9IGRpc3BsYXkuZ3V0dGVycy5vZmZzZXRXaWR0aCwgbGVmdCA9IGNvbXAgKyBcInB4XCI7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgdmlldy5sZW5ndGg7IGkrKykgeyBpZiAoIXZpZXdbaV0uaGlkZGVuKSB7XG4gICAgaWYgKGNtLm9wdGlvbnMuZml4ZWRHdXR0ZXIpIHtcbiAgICAgIGlmICh2aWV3W2ldLmd1dHRlcilcbiAgICAgICAgeyB2aWV3W2ldLmd1dHRlci5zdHlsZS5sZWZ0ID0gbGVmdDsgfVxuICAgICAgaWYgKHZpZXdbaV0uZ3V0dGVyQmFja2dyb3VuZClcbiAgICAgICAgeyB2aWV3W2ldLmd1dHRlckJhY2tncm91bmQuc3R5bGUubGVmdCA9IGxlZnQ7IH1cbiAgICB9XG4gICAgdmFyIGFsaWduID0gdmlld1tpXS5hbGlnbmFibGU7XG4gICAgaWYgKGFsaWduKSB7IGZvciAodmFyIGogPSAwOyBqIDwgYWxpZ24ubGVuZ3RoOyBqKyspXG4gICAgICB7IGFsaWduW2pdLnN0eWxlLmxlZnQgPSBsZWZ0OyB9IH1cbiAgfSB9XG4gIGlmIChjbS5vcHRpb25zLmZpeGVkR3V0dGVyKVxuICAgIHsgZGlzcGxheS5ndXR0ZXJzLnN0eWxlLmxlZnQgPSAoY29tcCArIGd1dHRlclcpICsgXCJweFwiOyB9XG59XG5cbi8vIFVzZWQgdG8gZW5zdXJlIHRoYXQgdGhlIGxpbmUgbnVtYmVyIGd1dHRlciBpcyBzdGlsbCB0aGUgcmlnaHRcbi8vIHNpemUgZm9yIHRoZSBjdXJyZW50IGRvY3VtZW50IHNpemUuIFJldHVybnMgdHJ1ZSB3aGVuIGFuIHVwZGF0ZVxuLy8gaXMgbmVlZGVkLlxuZnVuY3Rpb24gbWF5YmVVcGRhdGVMaW5lTnVtYmVyV2lkdGgoY20pIHtcbiAgaWYgKCFjbS5vcHRpb25zLmxpbmVOdW1iZXJzKSB7IHJldHVybiBmYWxzZSB9XG4gIHZhciBkb2MgPSBjbS5kb2MsIGxhc3QgPSBsaW5lTnVtYmVyRm9yKGNtLm9wdGlvbnMsIGRvYy5maXJzdCArIGRvYy5zaXplIC0gMSksIGRpc3BsYXkgPSBjbS5kaXNwbGF5O1xuICBpZiAobGFzdC5sZW5ndGggIT0gZGlzcGxheS5saW5lTnVtQ2hhcnMpIHtcbiAgICB2YXIgdGVzdCA9IGRpc3BsYXkubWVhc3VyZS5hcHBlbmRDaGlsZChlbHQoXCJkaXZcIiwgW2VsdChcImRpdlwiLCBsYXN0KV0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwiQ29kZU1pcnJvci1saW5lbnVtYmVyIENvZGVNaXJyb3ItZ3V0dGVyLWVsdFwiKSk7XG4gICAgdmFyIGlubmVyVyA9IHRlc3QuZmlyc3RDaGlsZC5vZmZzZXRXaWR0aCwgcGFkZGluZyA9IHRlc3Qub2Zmc2V0V2lkdGggLSBpbm5lclc7XG4gICAgZGlzcGxheS5saW5lR3V0dGVyLnN0eWxlLndpZHRoID0gXCJcIjtcbiAgICBkaXNwbGF5LmxpbmVOdW1Jbm5lcldpZHRoID0gTWF0aC5tYXgoaW5uZXJXLCBkaXNwbGF5LmxpbmVHdXR0ZXIub2Zmc2V0V2lkdGggLSBwYWRkaW5nKSArIDE7XG4gICAgZGlzcGxheS5saW5lTnVtV2lkdGggPSBkaXNwbGF5LmxpbmVOdW1Jbm5lcldpZHRoICsgcGFkZGluZztcbiAgICBkaXNwbGF5LmxpbmVOdW1DaGFycyA9IGRpc3BsYXkubGluZU51bUlubmVyV2lkdGggPyBsYXN0Lmxlbmd0aCA6IC0xO1xuICAgIGRpc3BsYXkubGluZUd1dHRlci5zdHlsZS53aWR0aCA9IGRpc3BsYXkubGluZU51bVdpZHRoICsgXCJweFwiO1xuICAgIHVwZGF0ZUd1dHRlclNwYWNlKGNtKTtcbiAgICByZXR1cm4gdHJ1ZVxuICB9XG4gIHJldHVybiBmYWxzZVxufVxuXG4vLyBTQ1JPTExJTkcgVEhJTkdTIElOVE8gVklFV1xuXG4vLyBJZiBhbiBlZGl0b3Igc2l0cyBvbiB0aGUgdG9wIG9yIGJvdHRvbSBvZiB0aGUgd2luZG93LCBwYXJ0aWFsbHlcbi8vIHNjcm9sbGVkIG91dCBvZiB2aWV3LCB0aGlzIGVuc3VyZXMgdGhhdCB0aGUgY3Vyc29yIGlzIHZpc2libGUuXG5mdW5jdGlvbiBtYXliZVNjcm9sbFdpbmRvdyhjbSwgcmVjdCkge1xuICBpZiAoc2lnbmFsRE9NRXZlbnQoY20sIFwic2Nyb2xsQ3Vyc29ySW50b1ZpZXdcIikpIHsgcmV0dXJuIH1cblxuICB2YXIgZGlzcGxheSA9IGNtLmRpc3BsYXksIGJveCA9IGRpc3BsYXkuc2l6ZXIuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCksIGRvU2Nyb2xsID0gbnVsbDtcbiAgaWYgKHJlY3QudG9wICsgYm94LnRvcCA8IDApIHsgZG9TY3JvbGwgPSB0cnVlOyB9XG4gIGVsc2UgaWYgKHJlY3QuYm90dG9tICsgYm94LnRvcCA+ICh3aW5kb3cuaW5uZXJIZWlnaHQgfHwgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LmNsaWVudEhlaWdodCkpIHsgZG9TY3JvbGwgPSBmYWxzZTsgfVxuICBpZiAoZG9TY3JvbGwgIT0gbnVsbCAmJiAhcGhhbnRvbSkge1xuICAgIHZhciBzY3JvbGxOb2RlID0gZWx0KFwiZGl2XCIsIFwiXFx1MjAwYlwiLCBudWxsLCAoXCJwb3NpdGlvbjogYWJzb2x1dGU7XFxuICAgICAgICAgICAgICAgICAgICAgICAgIHRvcDogXCIgKyAocmVjdC50b3AgLSBkaXNwbGF5LnZpZXdPZmZzZXQgLSBwYWRkaW5nVG9wKGNtLmRpc3BsYXkpKSArIFwicHg7XFxuICAgICAgICAgICAgICAgICAgICAgICAgIGhlaWdodDogXCIgKyAocmVjdC5ib3R0b20gLSByZWN0LnRvcCArIHNjcm9sbEdhcChjbSkgKyBkaXNwbGF5LmJhckhlaWdodCkgKyBcInB4O1xcbiAgICAgICAgICAgICAgICAgICAgICAgICBsZWZ0OiBcIiArIChyZWN0LmxlZnQpICsgXCJweDsgd2lkdGg6IFwiICsgKE1hdGgubWF4KDIsIHJlY3QucmlnaHQgLSByZWN0LmxlZnQpKSArIFwicHg7XCIpKTtcbiAgICBjbS5kaXNwbGF5LmxpbmVTcGFjZS5hcHBlbmRDaGlsZChzY3JvbGxOb2RlKTtcbiAgICBzY3JvbGxOb2RlLnNjcm9sbEludG9WaWV3KGRvU2Nyb2xsKTtcbiAgICBjbS5kaXNwbGF5LmxpbmVTcGFjZS5yZW1vdmVDaGlsZChzY3JvbGxOb2RlKTtcbiAgfVxufVxuXG4vLyBTY3JvbGwgYSBnaXZlbiBwb3NpdGlvbiBpbnRvIHZpZXcgKGltbWVkaWF0ZWx5KSwgdmVyaWZ5aW5nIHRoYXRcbi8vIGl0IGFjdHVhbGx5IGJlY2FtZSB2aXNpYmxlIChhcyBsaW5lIGhlaWdodHMgYXJlIGFjY3VyYXRlbHlcbi8vIG1lYXN1cmVkLCB0aGUgcG9zaXRpb24gb2Ygc29tZXRoaW5nIG1heSAnZHJpZnQnIGR1cmluZyBkcmF3aW5nKS5cbmZ1bmN0aW9uIHNjcm9sbFBvc0ludG9WaWV3KGNtLCBwb3MsIGVuZCwgbWFyZ2luKSB7XG4gIGlmIChtYXJnaW4gPT0gbnVsbCkgeyBtYXJnaW4gPSAwOyB9XG4gIHZhciByZWN0O1xuICBpZiAoIWNtLm9wdGlvbnMubGluZVdyYXBwaW5nICYmIHBvcyA9PSBlbmQpIHtcbiAgICAvLyBTZXQgcG9zIGFuZCBlbmQgdG8gdGhlIGN1cnNvciBwb3NpdGlvbnMgYXJvdW5kIHRoZSBjaGFyYWN0ZXIgcG9zIHN0aWNrcyB0b1xuICAgIC8vIElmIHBvcy5zdGlja3kgPT0gXCJiZWZvcmVcIiwgdGhhdCBpcyBhcm91bmQgcG9zLmNoIC0gMSwgb3RoZXJ3aXNlIGFyb3VuZCBwb3MuY2hcbiAgICAvLyBJZiBwb3MgPT0gUG9zKF8sIDAsIFwiYmVmb3JlXCIpLCBwb3MgYW5kIGVuZCBhcmUgdW5jaGFuZ2VkXG4gICAgcG9zID0gcG9zLmNoID8gUG9zKHBvcy5saW5lLCBwb3Muc3RpY2t5ID09IFwiYmVmb3JlXCIgPyBwb3MuY2ggLSAxIDogcG9zLmNoLCBcImFmdGVyXCIpIDogcG9zO1xuICAgIGVuZCA9IHBvcy5zdGlja3kgPT0gXCJiZWZvcmVcIiA/IFBvcyhwb3MubGluZSwgcG9zLmNoICsgMSwgXCJiZWZvcmVcIikgOiBwb3M7XG4gIH1cbiAgZm9yICh2YXIgbGltaXQgPSAwOyBsaW1pdCA8IDU7IGxpbWl0KyspIHtcbiAgICB2YXIgY2hhbmdlZCA9IGZhbHNlO1xuICAgIHZhciBjb29yZHMgPSBjdXJzb3JDb29yZHMoY20sIHBvcyk7XG4gICAgdmFyIGVuZENvb3JkcyA9ICFlbmQgfHwgZW5kID09IHBvcyA/IGNvb3JkcyA6IGN1cnNvckNvb3JkcyhjbSwgZW5kKTtcbiAgICByZWN0ID0ge2xlZnQ6IE1hdGgubWluKGNvb3Jkcy5sZWZ0LCBlbmRDb29yZHMubGVmdCksXG4gICAgICAgICAgICB0b3A6IE1hdGgubWluKGNvb3Jkcy50b3AsIGVuZENvb3Jkcy50b3ApIC0gbWFyZ2luLFxuICAgICAgICAgICAgcmlnaHQ6IE1hdGgubWF4KGNvb3Jkcy5sZWZ0LCBlbmRDb29yZHMubGVmdCksXG4gICAgICAgICAgICBib3R0b206IE1hdGgubWF4KGNvb3Jkcy5ib3R0b20sIGVuZENvb3Jkcy5ib3R0b20pICsgbWFyZ2lufTtcbiAgICB2YXIgc2Nyb2xsUG9zID0gY2FsY3VsYXRlU2Nyb2xsUG9zKGNtLCByZWN0KTtcbiAgICB2YXIgc3RhcnRUb3AgPSBjbS5kb2Muc2Nyb2xsVG9wLCBzdGFydExlZnQgPSBjbS5kb2Muc2Nyb2xsTGVmdDtcbiAgICBpZiAoc2Nyb2xsUG9zLnNjcm9sbFRvcCAhPSBudWxsKSB7XG4gICAgICB1cGRhdGVTY3JvbGxUb3AoY20sIHNjcm9sbFBvcy5zY3JvbGxUb3ApO1xuICAgICAgaWYgKE1hdGguYWJzKGNtLmRvYy5zY3JvbGxUb3AgLSBzdGFydFRvcCkgPiAxKSB7IGNoYW5nZWQgPSB0cnVlOyB9XG4gICAgfVxuICAgIGlmIChzY3JvbGxQb3Muc2Nyb2xsTGVmdCAhPSBudWxsKSB7XG4gICAgICBzZXRTY3JvbGxMZWZ0KGNtLCBzY3JvbGxQb3Muc2Nyb2xsTGVmdCk7XG4gICAgICBpZiAoTWF0aC5hYnMoY20uZG9jLnNjcm9sbExlZnQgLSBzdGFydExlZnQpID4gMSkgeyBjaGFuZ2VkID0gdHJ1ZTsgfVxuICAgIH1cbiAgICBpZiAoIWNoYW5nZWQpIHsgYnJlYWsgfVxuICB9XG4gIHJldHVybiByZWN0XG59XG5cbi8vIFNjcm9sbCBhIGdpdmVuIHNldCBvZiBjb29yZGluYXRlcyBpbnRvIHZpZXcgKGltbWVkaWF0ZWx5KS5cbmZ1bmN0aW9uIHNjcm9sbEludG9WaWV3KGNtLCByZWN0KSB7XG4gIHZhciBzY3JvbGxQb3MgPSBjYWxjdWxhdGVTY3JvbGxQb3MoY20sIHJlY3QpO1xuICBpZiAoc2Nyb2xsUG9zLnNjcm9sbFRvcCAhPSBudWxsKSB7IHVwZGF0ZVNjcm9sbFRvcChjbSwgc2Nyb2xsUG9zLnNjcm9sbFRvcCk7IH1cbiAgaWYgKHNjcm9sbFBvcy5zY3JvbGxMZWZ0ICE9IG51bGwpIHsgc2V0U2Nyb2xsTGVmdChjbSwgc2Nyb2xsUG9zLnNjcm9sbExlZnQpOyB9XG59XG5cbi8vIENhbGN1bGF0ZSBhIG5ldyBzY3JvbGwgcG9zaXRpb24gbmVlZGVkIHRvIHNjcm9sbCB0aGUgZ2l2ZW5cbi8vIHJlY3RhbmdsZSBpbnRvIHZpZXcuIFJldHVybnMgYW4gb2JqZWN0IHdpdGggc2Nyb2xsVG9wIGFuZFxuLy8gc2Nyb2xsTGVmdCBwcm9wZXJ0aWVzLiBXaGVuIHRoZXNlIGFyZSB1bmRlZmluZWQsIHRoZVxuLy8gdmVydGljYWwvaG9yaXpvbnRhbCBwb3NpdGlvbiBkb2VzIG5vdCBuZWVkIHRvIGJlIGFkanVzdGVkLlxuZnVuY3Rpb24gY2FsY3VsYXRlU2Nyb2xsUG9zKGNtLCByZWN0KSB7XG4gIHZhciBkaXNwbGF5ID0gY20uZGlzcGxheSwgc25hcE1hcmdpbiA9IHRleHRIZWlnaHQoY20uZGlzcGxheSk7XG4gIGlmIChyZWN0LnRvcCA8IDApIHsgcmVjdC50b3AgPSAwOyB9XG4gIHZhciBzY3JlZW50b3AgPSBjbS5jdXJPcCAmJiBjbS5jdXJPcC5zY3JvbGxUb3AgIT0gbnVsbCA/IGNtLmN1ck9wLnNjcm9sbFRvcCA6IGRpc3BsYXkuc2Nyb2xsZXIuc2Nyb2xsVG9wO1xuICB2YXIgc2NyZWVuID0gZGlzcGxheUhlaWdodChjbSksIHJlc3VsdCA9IHt9O1xuICBpZiAocmVjdC5ib3R0b20gLSByZWN0LnRvcCA+IHNjcmVlbikgeyByZWN0LmJvdHRvbSA9IHJlY3QudG9wICsgc2NyZWVuOyB9XG4gIHZhciBkb2NCb3R0b20gPSBjbS5kb2MuaGVpZ2h0ICsgcGFkZGluZ1ZlcnQoZGlzcGxheSk7XG4gIHZhciBhdFRvcCA9IHJlY3QudG9wIDwgc25hcE1hcmdpbiwgYXRCb3R0b20gPSByZWN0LmJvdHRvbSA+IGRvY0JvdHRvbSAtIHNuYXBNYXJnaW47XG4gIGlmIChyZWN0LnRvcCA8IHNjcmVlbnRvcCkge1xuICAgIHJlc3VsdC5zY3JvbGxUb3AgPSBhdFRvcCA/IDAgOiByZWN0LnRvcDtcbiAgfSBlbHNlIGlmIChyZWN0LmJvdHRvbSA+IHNjcmVlbnRvcCArIHNjcmVlbikge1xuICAgIHZhciBuZXdUb3AgPSBNYXRoLm1pbihyZWN0LnRvcCwgKGF0Qm90dG9tID8gZG9jQm90dG9tIDogcmVjdC5ib3R0b20pIC0gc2NyZWVuKTtcbiAgICBpZiAobmV3VG9wICE9IHNjcmVlbnRvcCkgeyByZXN1bHQuc2Nyb2xsVG9wID0gbmV3VG9wOyB9XG4gIH1cblxuICB2YXIgc2NyZWVubGVmdCA9IGNtLmN1ck9wICYmIGNtLmN1ck9wLnNjcm9sbExlZnQgIT0gbnVsbCA/IGNtLmN1ck9wLnNjcm9sbExlZnQgOiBkaXNwbGF5LnNjcm9sbGVyLnNjcm9sbExlZnQ7XG4gIHZhciBzY3JlZW53ID0gZGlzcGxheVdpZHRoKGNtKSAtIChjbS5vcHRpb25zLmZpeGVkR3V0dGVyID8gZGlzcGxheS5ndXR0ZXJzLm9mZnNldFdpZHRoIDogMCk7XG4gIHZhciB0b29XaWRlID0gcmVjdC5yaWdodCAtIHJlY3QubGVmdCA+IHNjcmVlbnc7XG4gIGlmICh0b29XaWRlKSB7IHJlY3QucmlnaHQgPSByZWN0LmxlZnQgKyBzY3JlZW53OyB9XG4gIGlmIChyZWN0LmxlZnQgPCAxMClcbiAgICB7IHJlc3VsdC5zY3JvbGxMZWZ0ID0gMDsgfVxuICBlbHNlIGlmIChyZWN0LmxlZnQgPCBzY3JlZW5sZWZ0KVxuICAgIHsgcmVzdWx0LnNjcm9sbExlZnQgPSBNYXRoLm1heCgwLCByZWN0LmxlZnQgLSAodG9vV2lkZSA/IDAgOiAxMCkpOyB9XG4gIGVsc2UgaWYgKHJlY3QucmlnaHQgPiBzY3JlZW53ICsgc2NyZWVubGVmdCAtIDMpXG4gICAgeyByZXN1bHQuc2Nyb2xsTGVmdCA9IHJlY3QucmlnaHQgKyAodG9vV2lkZSA/IDAgOiAxMCkgLSBzY3JlZW53OyB9XG4gIHJldHVybiByZXN1bHRcbn1cblxuLy8gU3RvcmUgYSByZWxhdGl2ZSBhZGp1c3RtZW50IHRvIHRoZSBzY3JvbGwgcG9zaXRpb24gaW4gdGhlIGN1cnJlbnRcbi8vIG9wZXJhdGlvbiAodG8gYmUgYXBwbGllZCB3aGVuIHRoZSBvcGVyYXRpb24gZmluaXNoZXMpLlxuZnVuY3Rpb24gYWRkVG9TY3JvbGxUb3AoY20sIHRvcCkge1xuICBpZiAodG9wID09IG51bGwpIHsgcmV0dXJuIH1cbiAgcmVzb2x2ZVNjcm9sbFRvUG9zKGNtKTtcbiAgY20uY3VyT3Auc2Nyb2xsVG9wID0gKGNtLmN1ck9wLnNjcm9sbFRvcCA9PSBudWxsID8gY20uZG9jLnNjcm9sbFRvcCA6IGNtLmN1ck9wLnNjcm9sbFRvcCkgKyB0b3A7XG59XG5cbi8vIE1ha2Ugc3VyZSB0aGF0IGF0IHRoZSBlbmQgb2YgdGhlIG9wZXJhdGlvbiB0aGUgY3VycmVudCBjdXJzb3IgaXNcbi8vIHNob3duLlxuZnVuY3Rpb24gZW5zdXJlQ3Vyc29yVmlzaWJsZShjbSkge1xuICByZXNvbHZlU2Nyb2xsVG9Qb3MoY20pO1xuICB2YXIgY3VyID0gY20uZ2V0Q3Vyc29yKCk7XG4gIGNtLmN1ck9wLnNjcm9sbFRvUG9zID0ge2Zyb206IGN1ciwgdG86IGN1ciwgbWFyZ2luOiBjbS5vcHRpb25zLmN1cnNvclNjcm9sbE1hcmdpbn07XG59XG5cbmZ1bmN0aW9uIHNjcm9sbFRvQ29vcmRzKGNtLCB4LCB5KSB7XG4gIGlmICh4ICE9IG51bGwgfHwgeSAhPSBudWxsKSB7IHJlc29sdmVTY3JvbGxUb1BvcyhjbSk7IH1cbiAgaWYgKHggIT0gbnVsbCkgeyBjbS5jdXJPcC5zY3JvbGxMZWZ0ID0geDsgfVxuICBpZiAoeSAhPSBudWxsKSB7IGNtLmN1ck9wLnNjcm9sbFRvcCA9IHk7IH1cbn1cblxuZnVuY3Rpb24gc2Nyb2xsVG9SYW5nZShjbSwgcmFuZ2UkJDEpIHtcbiAgcmVzb2x2ZVNjcm9sbFRvUG9zKGNtKTtcbiAgY20uY3VyT3Auc2Nyb2xsVG9Qb3MgPSByYW5nZSQkMTtcbn1cblxuLy8gV2hlbiBhbiBvcGVyYXRpb24gaGFzIGl0cyBzY3JvbGxUb1BvcyBwcm9wZXJ0eSBzZXQsIGFuZCBhbm90aGVyXG4vLyBzY3JvbGwgYWN0aW9uIGlzIGFwcGxpZWQgYmVmb3JlIHRoZSBlbmQgb2YgdGhlIG9wZXJhdGlvbiwgdGhpc1xuLy8gJ3NpbXVsYXRlcycgc2Nyb2xsaW5nIHRoYXQgcG9zaXRpb24gaW50byB2aWV3IGluIGEgY2hlYXAgd2F5LCBzb1xuLy8gdGhhdCB0aGUgZWZmZWN0IG9mIGludGVybWVkaWF0ZSBzY3JvbGwgY29tbWFuZHMgaXMgbm90IGlnbm9yZWQuXG5mdW5jdGlvbiByZXNvbHZlU2Nyb2xsVG9Qb3MoY20pIHtcbiAgdmFyIHJhbmdlJCQxID0gY20uY3VyT3Auc2Nyb2xsVG9Qb3M7XG4gIGlmIChyYW5nZSQkMSkge1xuICAgIGNtLmN1ck9wLnNjcm9sbFRvUG9zID0gbnVsbDtcbiAgICB2YXIgZnJvbSA9IGVzdGltYXRlQ29vcmRzKGNtLCByYW5nZSQkMS5mcm9tKSwgdG8gPSBlc3RpbWF0ZUNvb3JkcyhjbSwgcmFuZ2UkJDEudG8pO1xuICAgIHNjcm9sbFRvQ29vcmRzUmFuZ2UoY20sIGZyb20sIHRvLCByYW5nZSQkMS5tYXJnaW4pO1xuICB9XG59XG5cbmZ1bmN0aW9uIHNjcm9sbFRvQ29vcmRzUmFuZ2UoY20sIGZyb20sIHRvLCBtYXJnaW4pIHtcbiAgdmFyIHNQb3MgPSBjYWxjdWxhdGVTY3JvbGxQb3MoY20sIHtcbiAgICBsZWZ0OiBNYXRoLm1pbihmcm9tLmxlZnQsIHRvLmxlZnQpLFxuICAgIHRvcDogTWF0aC5taW4oZnJvbS50b3AsIHRvLnRvcCkgLSBtYXJnaW4sXG4gICAgcmlnaHQ6IE1hdGgubWF4KGZyb20ucmlnaHQsIHRvLnJpZ2h0KSxcbiAgICBib3R0b206IE1hdGgubWF4KGZyb20uYm90dG9tLCB0by5ib3R0b20pICsgbWFyZ2luXG4gIH0pO1xuICBzY3JvbGxUb0Nvb3JkcyhjbSwgc1Bvcy5zY3JvbGxMZWZ0LCBzUG9zLnNjcm9sbFRvcCk7XG59XG5cbi8vIFN5bmMgdGhlIHNjcm9sbGFibGUgYXJlYSBhbmQgc2Nyb2xsYmFycywgZW5zdXJlIHRoZSB2aWV3cG9ydFxuLy8gY292ZXJzIHRoZSB2aXNpYmxlIGFyZWEuXG5mdW5jdGlvbiB1cGRhdGVTY3JvbGxUb3AoY20sIHZhbCkge1xuICBpZiAoTWF0aC5hYnMoY20uZG9jLnNjcm9sbFRvcCAtIHZhbCkgPCAyKSB7IHJldHVybiB9XG4gIGlmICghZ2Vja28pIHsgdXBkYXRlRGlzcGxheVNpbXBsZShjbSwge3RvcDogdmFsfSk7IH1cbiAgc2V0U2Nyb2xsVG9wKGNtLCB2YWwsIHRydWUpO1xuICBpZiAoZ2Vja28pIHsgdXBkYXRlRGlzcGxheVNpbXBsZShjbSk7IH1cbiAgc3RhcnRXb3JrZXIoY20sIDEwMCk7XG59XG5cbmZ1bmN0aW9uIHNldFNjcm9sbFRvcChjbSwgdmFsLCBmb3JjZVNjcm9sbCkge1xuICB2YWwgPSBNYXRoLm1pbihjbS5kaXNwbGF5LnNjcm9sbGVyLnNjcm9sbEhlaWdodCAtIGNtLmRpc3BsYXkuc2Nyb2xsZXIuY2xpZW50SGVpZ2h0LCB2YWwpO1xuICBpZiAoY20uZGlzcGxheS5zY3JvbGxlci5zY3JvbGxUb3AgPT0gdmFsICYmICFmb3JjZVNjcm9sbCkgeyByZXR1cm4gfVxuICBjbS5kb2Muc2Nyb2xsVG9wID0gdmFsO1xuICBjbS5kaXNwbGF5LnNjcm9sbGJhcnMuc2V0U2Nyb2xsVG9wKHZhbCk7XG4gIGlmIChjbS5kaXNwbGF5LnNjcm9sbGVyLnNjcm9sbFRvcCAhPSB2YWwpIHsgY20uZGlzcGxheS5zY3JvbGxlci5zY3JvbGxUb3AgPSB2YWw7IH1cbn1cblxuLy8gU3luYyBzY3JvbGxlciBhbmQgc2Nyb2xsYmFyLCBlbnN1cmUgdGhlIGd1dHRlciBlbGVtZW50cyBhcmVcbi8vIGFsaWduZWQuXG5mdW5jdGlvbiBzZXRTY3JvbGxMZWZ0KGNtLCB2YWwsIGlzU2Nyb2xsZXIsIGZvcmNlU2Nyb2xsKSB7XG4gIHZhbCA9IE1hdGgubWluKHZhbCwgY20uZGlzcGxheS5zY3JvbGxlci5zY3JvbGxXaWR0aCAtIGNtLmRpc3BsYXkuc2Nyb2xsZXIuY2xpZW50V2lkdGgpO1xuICBpZiAoKGlzU2Nyb2xsZXIgPyB2YWwgPT0gY20uZG9jLnNjcm9sbExlZnQgOiBNYXRoLmFicyhjbS5kb2Muc2Nyb2xsTGVmdCAtIHZhbCkgPCAyKSAmJiAhZm9yY2VTY3JvbGwpIHsgcmV0dXJuIH1cbiAgY20uZG9jLnNjcm9sbExlZnQgPSB2YWw7XG4gIGFsaWduSG9yaXpvbnRhbGx5KGNtKTtcbiAgaWYgKGNtLmRpc3BsYXkuc2Nyb2xsZXIuc2Nyb2xsTGVmdCAhPSB2YWwpIHsgY20uZGlzcGxheS5zY3JvbGxlci5zY3JvbGxMZWZ0ID0gdmFsOyB9XG4gIGNtLmRpc3BsYXkuc2Nyb2xsYmFycy5zZXRTY3JvbGxMZWZ0KHZhbCk7XG59XG5cbi8vIFNDUk9MTEJBUlNcblxuLy8gUHJlcGFyZSBET00gcmVhZHMgbmVlZGVkIHRvIHVwZGF0ZSB0aGUgc2Nyb2xsYmFycy4gRG9uZSBpbiBvbmVcbi8vIHNob3QgdG8gbWluaW1pemUgdXBkYXRlL21lYXN1cmUgcm91bmR0cmlwcy5cbmZ1bmN0aW9uIG1lYXN1cmVGb3JTY3JvbGxiYXJzKGNtKSB7XG4gIHZhciBkID0gY20uZGlzcGxheSwgZ3V0dGVyVyA9IGQuZ3V0dGVycy5vZmZzZXRXaWR0aDtcbiAgdmFyIGRvY0ggPSBNYXRoLnJvdW5kKGNtLmRvYy5oZWlnaHQgKyBwYWRkaW5nVmVydChjbS5kaXNwbGF5KSk7XG4gIHJldHVybiB7XG4gICAgY2xpZW50SGVpZ2h0OiBkLnNjcm9sbGVyLmNsaWVudEhlaWdodCxcbiAgICB2aWV3SGVpZ2h0OiBkLndyYXBwZXIuY2xpZW50SGVpZ2h0LFxuICAgIHNjcm9sbFdpZHRoOiBkLnNjcm9sbGVyLnNjcm9sbFdpZHRoLCBjbGllbnRXaWR0aDogZC5zY3JvbGxlci5jbGllbnRXaWR0aCxcbiAgICB2aWV3V2lkdGg6IGQud3JhcHBlci5jbGllbnRXaWR0aCxcbiAgICBiYXJMZWZ0OiBjbS5vcHRpb25zLmZpeGVkR3V0dGVyID8gZ3V0dGVyVyA6IDAsXG4gICAgZG9jSGVpZ2h0OiBkb2NILFxuICAgIHNjcm9sbEhlaWdodDogZG9jSCArIHNjcm9sbEdhcChjbSkgKyBkLmJhckhlaWdodCxcbiAgICBuYXRpdmVCYXJXaWR0aDogZC5uYXRpdmVCYXJXaWR0aCxcbiAgICBndXR0ZXJXaWR0aDogZ3V0dGVyV1xuICB9XG59XG5cbnZhciBOYXRpdmVTY3JvbGxiYXJzID0gZnVuY3Rpb24ocGxhY2UsIHNjcm9sbCwgY20pIHtcbiAgdGhpcy5jbSA9IGNtO1xuICB2YXIgdmVydCA9IHRoaXMudmVydCA9IGVsdChcImRpdlwiLCBbZWx0KFwiZGl2XCIsIG51bGwsIG51bGwsIFwibWluLXdpZHRoOiAxcHhcIildLCBcIkNvZGVNaXJyb3ItdnNjcm9sbGJhclwiKTtcbiAgdmFyIGhvcml6ID0gdGhpcy5ob3JpeiA9IGVsdChcImRpdlwiLCBbZWx0KFwiZGl2XCIsIG51bGwsIG51bGwsIFwiaGVpZ2h0OiAxMDAlOyBtaW4taGVpZ2h0OiAxcHhcIildLCBcIkNvZGVNaXJyb3ItaHNjcm9sbGJhclwiKTtcbiAgdmVydC50YWJJbmRleCA9IGhvcml6LnRhYkluZGV4ID0gLTE7XG4gIHBsYWNlKHZlcnQpOyBwbGFjZShob3Jpeik7XG5cbiAgb24odmVydCwgXCJzY3JvbGxcIiwgZnVuY3Rpb24gKCkge1xuICAgIGlmICh2ZXJ0LmNsaWVudEhlaWdodCkgeyBzY3JvbGwodmVydC5zY3JvbGxUb3AsIFwidmVydGljYWxcIik7IH1cbiAgfSk7XG4gIG9uKGhvcml6LCBcInNjcm9sbFwiLCBmdW5jdGlvbiAoKSB7XG4gICAgaWYgKGhvcml6LmNsaWVudFdpZHRoKSB7IHNjcm9sbChob3Jpei5zY3JvbGxMZWZ0LCBcImhvcml6b250YWxcIik7IH1cbiAgfSk7XG5cbiAgdGhpcy5jaGVja2VkWmVyb1dpZHRoID0gZmFsc2U7XG4gIC8vIE5lZWQgdG8gc2V0IGEgbWluaW11bSB3aWR0aCB0byBzZWUgdGhlIHNjcm9sbGJhciBvbiBJRTcgKGJ1dCBtdXN0IG5vdCBzZXQgaXQgb24gSUU4KS5cbiAgaWYgKGllICYmIGllX3ZlcnNpb24gPCA4KSB7IHRoaXMuaG9yaXouc3R5bGUubWluSGVpZ2h0ID0gdGhpcy52ZXJ0LnN0eWxlLm1pbldpZHRoID0gXCIxOHB4XCI7IH1cbn07XG5cbk5hdGl2ZVNjcm9sbGJhcnMucHJvdG90eXBlLnVwZGF0ZSA9IGZ1bmN0aW9uIChtZWFzdXJlKSB7XG4gIHZhciBuZWVkc0ggPSBtZWFzdXJlLnNjcm9sbFdpZHRoID4gbWVhc3VyZS5jbGllbnRXaWR0aCArIDE7XG4gIHZhciBuZWVkc1YgPSBtZWFzdXJlLnNjcm9sbEhlaWdodCA+IG1lYXN1cmUuY2xpZW50SGVpZ2h0ICsgMTtcbiAgdmFyIHNXaWR0aCA9IG1lYXN1cmUubmF0aXZlQmFyV2lkdGg7XG5cbiAgaWYgKG5lZWRzVikge1xuICAgIHRoaXMudmVydC5zdHlsZS5kaXNwbGF5ID0gXCJibG9ja1wiO1xuICAgIHRoaXMudmVydC5zdHlsZS5ib3R0b20gPSBuZWVkc0ggPyBzV2lkdGggKyBcInB4XCIgOiBcIjBcIjtcbiAgICB2YXIgdG90YWxIZWlnaHQgPSBtZWFzdXJlLnZpZXdIZWlnaHQgLSAobmVlZHNIID8gc1dpZHRoIDogMCk7XG4gICAgLy8gQSBidWcgaW4gSUU4IGNhbiBjYXVzZSB0aGlzIHZhbHVlIHRvIGJlIG5lZ2F0aXZlLCBzbyBndWFyZCBpdC5cbiAgICB0aGlzLnZlcnQuZmlyc3RDaGlsZC5zdHlsZS5oZWlnaHQgPVxuICAgICAgTWF0aC5tYXgoMCwgbWVhc3VyZS5zY3JvbGxIZWlnaHQgLSBtZWFzdXJlLmNsaWVudEhlaWdodCArIHRvdGFsSGVpZ2h0KSArIFwicHhcIjtcbiAgfSBlbHNlIHtcbiAgICB0aGlzLnZlcnQuc3R5bGUuZGlzcGxheSA9IFwiXCI7XG4gICAgdGhpcy52ZXJ0LmZpcnN0Q2hpbGQuc3R5bGUuaGVpZ2h0ID0gXCIwXCI7XG4gIH1cblxuICBpZiAobmVlZHNIKSB7XG4gICAgdGhpcy5ob3Jpei5zdHlsZS5kaXNwbGF5ID0gXCJibG9ja1wiO1xuICAgIHRoaXMuaG9yaXouc3R5bGUucmlnaHQgPSBuZWVkc1YgPyBzV2lkdGggKyBcInB4XCIgOiBcIjBcIjtcbiAgICB0aGlzLmhvcml6LnN0eWxlLmxlZnQgPSBtZWFzdXJlLmJhckxlZnQgKyBcInB4XCI7XG4gICAgdmFyIHRvdGFsV2lkdGggPSBtZWFzdXJlLnZpZXdXaWR0aCAtIG1lYXN1cmUuYmFyTGVmdCAtIChuZWVkc1YgPyBzV2lkdGggOiAwKTtcbiAgICB0aGlzLmhvcml6LmZpcnN0Q2hpbGQuc3R5bGUud2lkdGggPVxuICAgICAgTWF0aC5tYXgoMCwgbWVhc3VyZS5zY3JvbGxXaWR0aCAtIG1lYXN1cmUuY2xpZW50V2lkdGggKyB0b3RhbFdpZHRoKSArIFwicHhcIjtcbiAgfSBlbHNlIHtcbiAgICB0aGlzLmhvcml6LnN0eWxlLmRpc3BsYXkgPSBcIlwiO1xuICAgIHRoaXMuaG9yaXouZmlyc3RDaGlsZC5zdHlsZS53aWR0aCA9IFwiMFwiO1xuICB9XG5cbiAgaWYgKCF0aGlzLmNoZWNrZWRaZXJvV2lkdGggJiYgbWVhc3VyZS5jbGllbnRIZWlnaHQgPiAwKSB7XG4gICAgaWYgKHNXaWR0aCA9PSAwKSB7IHRoaXMuemVyb1dpZHRoSGFjaygpOyB9XG4gICAgdGhpcy5jaGVja2VkWmVyb1dpZHRoID0gdHJ1ZTtcbiAgfVxuXG4gIHJldHVybiB7cmlnaHQ6IG5lZWRzViA/IHNXaWR0aCA6IDAsIGJvdHRvbTogbmVlZHNIID8gc1dpZHRoIDogMH1cbn07XG5cbk5hdGl2ZVNjcm9sbGJhcnMucHJvdG90eXBlLnNldFNjcm9sbExlZnQgPSBmdW5jdGlvbiAocG9zKSB7XG4gIGlmICh0aGlzLmhvcml6LnNjcm9sbExlZnQgIT0gcG9zKSB7IHRoaXMuaG9yaXouc2Nyb2xsTGVmdCA9IHBvczsgfVxuICBpZiAodGhpcy5kaXNhYmxlSG9yaXopIHsgdGhpcy5lbmFibGVaZXJvV2lkdGhCYXIodGhpcy5ob3JpeiwgdGhpcy5kaXNhYmxlSG9yaXosIFwiaG9yaXpcIik7IH1cbn07XG5cbk5hdGl2ZVNjcm9sbGJhcnMucHJvdG90eXBlLnNldFNjcm9sbFRvcCA9IGZ1bmN0aW9uIChwb3MpIHtcbiAgaWYgKHRoaXMudmVydC5zY3JvbGxUb3AgIT0gcG9zKSB7IHRoaXMudmVydC5zY3JvbGxUb3AgPSBwb3M7IH1cbiAgaWYgKHRoaXMuZGlzYWJsZVZlcnQpIHsgdGhpcy5lbmFibGVaZXJvV2lkdGhCYXIodGhpcy52ZXJ0LCB0aGlzLmRpc2FibGVWZXJ0LCBcInZlcnRcIik7IH1cbn07XG5cbk5hdGl2ZVNjcm9sbGJhcnMucHJvdG90eXBlLnplcm9XaWR0aEhhY2sgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciB3ID0gbWFjICYmICFtYWNfZ2VNb3VudGFpbkxpb24gPyBcIjEycHhcIiA6IFwiMThweFwiO1xuICB0aGlzLmhvcml6LnN0eWxlLmhlaWdodCA9IHRoaXMudmVydC5zdHlsZS53aWR0aCA9IHc7XG4gIHRoaXMuaG9yaXouc3R5bGUucG9pbnRlckV2ZW50cyA9IHRoaXMudmVydC5zdHlsZS5wb2ludGVyRXZlbnRzID0gXCJub25lXCI7XG4gIHRoaXMuZGlzYWJsZUhvcml6ID0gbmV3IERlbGF5ZWQ7XG4gIHRoaXMuZGlzYWJsZVZlcnQgPSBuZXcgRGVsYXllZDtcbn07XG5cbk5hdGl2ZVNjcm9sbGJhcnMucHJvdG90eXBlLmVuYWJsZVplcm9XaWR0aEJhciA9IGZ1bmN0aW9uIChiYXIsIGRlbGF5LCB0eXBlKSB7XG4gIGJhci5zdHlsZS5wb2ludGVyRXZlbnRzID0gXCJhdXRvXCI7XG4gIGZ1bmN0aW9uIG1heWJlRGlzYWJsZSgpIHtcbiAgICAvLyBUbyBmaW5kIG91dCB3aGV0aGVyIHRoZSBzY3JvbGxiYXIgaXMgc3RpbGwgdmlzaWJsZSwgd2VcbiAgICAvLyBjaGVjayB3aGV0aGVyIHRoZSBlbGVtZW50IHVuZGVyIHRoZSBwaXhlbCBpbiB0aGUgYm90dG9tXG4gICAgLy8gcmlnaHQgY29ybmVyIG9mIHRoZSBzY3JvbGxiYXIgYm94IGlzIHRoZSBzY3JvbGxiYXIgYm94XG4gICAgLy8gaXRzZWxmICh3aGVuIHRoZSBiYXIgaXMgc3RpbGwgdmlzaWJsZSkgb3IgaXRzIGZpbGxlciBjaGlsZFxuICAgIC8vICh3aGVuIHRoZSBiYXIgaXMgaGlkZGVuKS4gSWYgaXQgaXMgc3RpbGwgdmlzaWJsZSwgd2Uga2VlcFxuICAgIC8vIGl0IGVuYWJsZWQsIGlmIGl0J3MgaGlkZGVuLCB3ZSBkaXNhYmxlIHBvaW50ZXIgZXZlbnRzLlxuICAgIHZhciBib3ggPSBiYXIuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgdmFyIGVsdCQkMSA9IHR5cGUgPT0gXCJ2ZXJ0XCIgPyBkb2N1bWVudC5lbGVtZW50RnJvbVBvaW50KGJveC5yaWdodCAtIDEsIChib3gudG9wICsgYm94LmJvdHRvbSkgLyAyKVxuICAgICAgICA6IGRvY3VtZW50LmVsZW1lbnRGcm9tUG9pbnQoKGJveC5yaWdodCArIGJveC5sZWZ0KSAvIDIsIGJveC5ib3R0b20gLSAxKTtcbiAgICBpZiAoZWx0JCQxICE9IGJhcikgeyBiYXIuc3R5bGUucG9pbnRlckV2ZW50cyA9IFwibm9uZVwiOyB9XG4gICAgZWxzZSB7IGRlbGF5LnNldCgxMDAwLCBtYXliZURpc2FibGUpOyB9XG4gIH1cbiAgZGVsYXkuc2V0KDEwMDAsIG1heWJlRGlzYWJsZSk7XG59O1xuXG5OYXRpdmVTY3JvbGxiYXJzLnByb3RvdHlwZS5jbGVhciA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIHBhcmVudCA9IHRoaXMuaG9yaXoucGFyZW50Tm9kZTtcbiAgcGFyZW50LnJlbW92ZUNoaWxkKHRoaXMuaG9yaXopO1xuICBwYXJlbnQucmVtb3ZlQ2hpbGQodGhpcy52ZXJ0KTtcbn07XG5cbnZhciBOdWxsU2Nyb2xsYmFycyA9IGZ1bmN0aW9uICgpIHt9O1xuXG5OdWxsU2Nyb2xsYmFycy5wcm90b3R5cGUudXBkYXRlID0gZnVuY3Rpb24gKCkgeyByZXR1cm4ge2JvdHRvbTogMCwgcmlnaHQ6IDB9IH07XG5OdWxsU2Nyb2xsYmFycy5wcm90b3R5cGUuc2V0U2Nyb2xsTGVmdCA9IGZ1bmN0aW9uICgpIHt9O1xuTnVsbFNjcm9sbGJhcnMucHJvdG90eXBlLnNldFNjcm9sbFRvcCA9IGZ1bmN0aW9uICgpIHt9O1xuTnVsbFNjcm9sbGJhcnMucHJvdG90eXBlLmNsZWFyID0gZnVuY3Rpb24gKCkge307XG5cbmZ1bmN0aW9uIHVwZGF0ZVNjcm9sbGJhcnMoY20sIG1lYXN1cmUpIHtcbiAgaWYgKCFtZWFzdXJlKSB7IG1lYXN1cmUgPSBtZWFzdXJlRm9yU2Nyb2xsYmFycyhjbSk7IH1cbiAgdmFyIHN0YXJ0V2lkdGggPSBjbS5kaXNwbGF5LmJhcldpZHRoLCBzdGFydEhlaWdodCA9IGNtLmRpc3BsYXkuYmFySGVpZ2h0O1xuICB1cGRhdGVTY3JvbGxiYXJzSW5uZXIoY20sIG1lYXN1cmUpO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IDQgJiYgc3RhcnRXaWR0aCAhPSBjbS5kaXNwbGF5LmJhcldpZHRoIHx8IHN0YXJ0SGVpZ2h0ICE9IGNtLmRpc3BsYXkuYmFySGVpZ2h0OyBpKyspIHtcbiAgICBpZiAoc3RhcnRXaWR0aCAhPSBjbS5kaXNwbGF5LmJhcldpZHRoICYmIGNtLm9wdGlvbnMubGluZVdyYXBwaW5nKVxuICAgICAgeyB1cGRhdGVIZWlnaHRzSW5WaWV3cG9ydChjbSk7IH1cbiAgICB1cGRhdGVTY3JvbGxiYXJzSW5uZXIoY20sIG1lYXN1cmVGb3JTY3JvbGxiYXJzKGNtKSk7XG4gICAgc3RhcnRXaWR0aCA9IGNtLmRpc3BsYXkuYmFyV2lkdGg7IHN0YXJ0SGVpZ2h0ID0gY20uZGlzcGxheS5iYXJIZWlnaHQ7XG4gIH1cbn1cblxuLy8gUmUtc3luY2hyb25pemUgdGhlIGZha2Ugc2Nyb2xsYmFycyB3aXRoIHRoZSBhY3R1YWwgc2l6ZSBvZiB0aGVcbi8vIGNvbnRlbnQuXG5mdW5jdGlvbiB1cGRhdGVTY3JvbGxiYXJzSW5uZXIoY20sIG1lYXN1cmUpIHtcbiAgdmFyIGQgPSBjbS5kaXNwbGF5O1xuICB2YXIgc2l6ZXMgPSBkLnNjcm9sbGJhcnMudXBkYXRlKG1lYXN1cmUpO1xuXG4gIGQuc2l6ZXIuc3R5bGUucGFkZGluZ1JpZ2h0ID0gKGQuYmFyV2lkdGggPSBzaXplcy5yaWdodCkgKyBcInB4XCI7XG4gIGQuc2l6ZXIuc3R5bGUucGFkZGluZ0JvdHRvbSA9IChkLmJhckhlaWdodCA9IHNpemVzLmJvdHRvbSkgKyBcInB4XCI7XG4gIGQuaGVpZ2h0Rm9yY2VyLnN0eWxlLmJvcmRlckJvdHRvbSA9IHNpemVzLmJvdHRvbSArIFwicHggc29saWQgdHJhbnNwYXJlbnRcIjtcblxuICBpZiAoc2l6ZXMucmlnaHQgJiYgc2l6ZXMuYm90dG9tKSB7XG4gICAgZC5zY3JvbGxiYXJGaWxsZXIuc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjtcbiAgICBkLnNjcm9sbGJhckZpbGxlci5zdHlsZS5oZWlnaHQgPSBzaXplcy5ib3R0b20gKyBcInB4XCI7XG4gICAgZC5zY3JvbGxiYXJGaWxsZXIuc3R5bGUud2lkdGggPSBzaXplcy5yaWdodCArIFwicHhcIjtcbiAgfSBlbHNlIHsgZC5zY3JvbGxiYXJGaWxsZXIuc3R5bGUuZGlzcGxheSA9IFwiXCI7IH1cbiAgaWYgKHNpemVzLmJvdHRvbSAmJiBjbS5vcHRpb25zLmNvdmVyR3V0dGVyTmV4dFRvU2Nyb2xsYmFyICYmIGNtLm9wdGlvbnMuZml4ZWRHdXR0ZXIpIHtcbiAgICBkLmd1dHRlckZpbGxlci5zdHlsZS5kaXNwbGF5ID0gXCJibG9ja1wiO1xuICAgIGQuZ3V0dGVyRmlsbGVyLnN0eWxlLmhlaWdodCA9IHNpemVzLmJvdHRvbSArIFwicHhcIjtcbiAgICBkLmd1dHRlckZpbGxlci5zdHlsZS53aWR0aCA9IG1lYXN1cmUuZ3V0dGVyV2lkdGggKyBcInB4XCI7XG4gIH0gZWxzZSB7IGQuZ3V0dGVyRmlsbGVyLnN0eWxlLmRpc3BsYXkgPSBcIlwiOyB9XG59XG5cbnZhciBzY3JvbGxiYXJNb2RlbCA9IHtcIm5hdGl2ZVwiOiBOYXRpdmVTY3JvbGxiYXJzLCBcIm51bGxcIjogTnVsbFNjcm9sbGJhcnN9O1xuXG5mdW5jdGlvbiBpbml0U2Nyb2xsYmFycyhjbSkge1xuICBpZiAoY20uZGlzcGxheS5zY3JvbGxiYXJzKSB7XG4gICAgY20uZGlzcGxheS5zY3JvbGxiYXJzLmNsZWFyKCk7XG4gICAgaWYgKGNtLmRpc3BsYXkuc2Nyb2xsYmFycy5hZGRDbGFzcylcbiAgICAgIHsgcm1DbGFzcyhjbS5kaXNwbGF5LndyYXBwZXIsIGNtLmRpc3BsYXkuc2Nyb2xsYmFycy5hZGRDbGFzcyk7IH1cbiAgfVxuXG4gIGNtLmRpc3BsYXkuc2Nyb2xsYmFycyA9IG5ldyBzY3JvbGxiYXJNb2RlbFtjbS5vcHRpb25zLnNjcm9sbGJhclN0eWxlXShmdW5jdGlvbiAobm9kZSkge1xuICAgIGNtLmRpc3BsYXkud3JhcHBlci5pbnNlcnRCZWZvcmUobm9kZSwgY20uZGlzcGxheS5zY3JvbGxiYXJGaWxsZXIpO1xuICAgIC8vIFByZXZlbnQgY2xpY2tzIGluIHRoZSBzY3JvbGxiYXJzIGZyb20ga2lsbGluZyBmb2N1c1xuICAgIG9uKG5vZGUsIFwibW91c2Vkb3duXCIsIGZ1bmN0aW9uICgpIHtcbiAgICAgIGlmIChjbS5zdGF0ZS5mb2N1c2VkKSB7IHNldFRpbWVvdXQoZnVuY3Rpb24gKCkgeyByZXR1cm4gY20uZGlzcGxheS5pbnB1dC5mb2N1cygpOyB9LCAwKTsgfVxuICAgIH0pO1xuICAgIG5vZGUuc2V0QXR0cmlidXRlKFwiY20tbm90LWNvbnRlbnRcIiwgXCJ0cnVlXCIpO1xuICB9LCBmdW5jdGlvbiAocG9zLCBheGlzKSB7XG4gICAgaWYgKGF4aXMgPT0gXCJob3Jpem9udGFsXCIpIHsgc2V0U2Nyb2xsTGVmdChjbSwgcG9zKTsgfVxuICAgIGVsc2UgeyB1cGRhdGVTY3JvbGxUb3AoY20sIHBvcyk7IH1cbiAgfSwgY20pO1xuICBpZiAoY20uZGlzcGxheS5zY3JvbGxiYXJzLmFkZENsYXNzKVxuICAgIHsgYWRkQ2xhc3MoY20uZGlzcGxheS53cmFwcGVyLCBjbS5kaXNwbGF5LnNjcm9sbGJhcnMuYWRkQ2xhc3MpOyB9XG59XG5cbi8vIE9wZXJhdGlvbnMgYXJlIHVzZWQgdG8gd3JhcCBhIHNlcmllcyBvZiBjaGFuZ2VzIHRvIHRoZSBlZGl0b3Jcbi8vIHN0YXRlIGluIHN1Y2ggYSB3YXkgdGhhdCBlYWNoIGNoYW5nZSB3b24ndCBoYXZlIHRvIHVwZGF0ZSB0aGVcbi8vIGN1cnNvciBhbmQgZGlzcGxheSAod2hpY2ggd291bGQgYmUgYXdrd2FyZCwgc2xvdywgYW5kXG4vLyBlcnJvci1wcm9uZSkuIEluc3RlYWQsIGRpc3BsYXkgdXBkYXRlcyBhcmUgYmF0Y2hlZCBhbmQgdGhlbiBhbGxcbi8vIGNvbWJpbmVkIGFuZCBleGVjdXRlZCBhdCBvbmNlLlxuXG52YXIgbmV4dE9wSWQgPSAwO1xuLy8gU3RhcnQgYSBuZXcgb3BlcmF0aW9uLlxuZnVuY3Rpb24gc3RhcnRPcGVyYXRpb24oY20pIHtcbiAgY20uY3VyT3AgPSB7XG4gICAgY206IGNtLFxuICAgIHZpZXdDaGFuZ2VkOiBmYWxzZSwgICAgICAvLyBGbGFnIHRoYXQgaW5kaWNhdGVzIHRoYXQgbGluZXMgbWlnaHQgbmVlZCB0byBiZSByZWRyYXduXG4gICAgc3RhcnRIZWlnaHQ6IGNtLmRvYy5oZWlnaHQsIC8vIFVzZWQgdG8gZGV0ZWN0IG5lZWQgdG8gdXBkYXRlIHNjcm9sbGJhclxuICAgIGZvcmNlVXBkYXRlOiBmYWxzZSwgICAgICAvLyBVc2VkIHRvIGZvcmNlIGEgcmVkcmF3XG4gICAgdXBkYXRlSW5wdXQ6IG51bGwsICAgICAgIC8vIFdoZXRoZXIgdG8gcmVzZXQgdGhlIGlucHV0IHRleHRhcmVhXG4gICAgdHlwaW5nOiBmYWxzZSwgICAgICAgICAgIC8vIFdoZXRoZXIgdGhpcyByZXNldCBzaG91bGQgYmUgY2FyZWZ1bCB0byBsZWF2ZSBleGlzdGluZyB0ZXh0IChmb3IgY29tcG9zaXRpbmcpXG4gICAgY2hhbmdlT2JqczogbnVsbCwgICAgICAgIC8vIEFjY3VtdWxhdGVkIGNoYW5nZXMsIGZvciBmaXJpbmcgY2hhbmdlIGV2ZW50c1xuICAgIGN1cnNvckFjdGl2aXR5SGFuZGxlcnM6IG51bGwsIC8vIFNldCBvZiBoYW5kbGVycyB0byBmaXJlIGN1cnNvckFjdGl2aXR5IG9uXG4gICAgY3Vyc29yQWN0aXZpdHlDYWxsZWQ6IDAsIC8vIFRyYWNrcyB3aGljaCBjdXJzb3JBY3Rpdml0eSBoYW5kbGVycyBoYXZlIGJlZW4gY2FsbGVkIGFscmVhZHlcbiAgICBzZWxlY3Rpb25DaGFuZ2VkOiBmYWxzZSwgLy8gV2hldGhlciB0aGUgc2VsZWN0aW9uIG5lZWRzIHRvIGJlIHJlZHJhd25cbiAgICB1cGRhdGVNYXhMaW5lOiBmYWxzZSwgICAgLy8gU2V0IHdoZW4gdGhlIHdpZGVzdCBsaW5lIG5lZWRzIHRvIGJlIGRldGVybWluZWQgYW5ld1xuICAgIHNjcm9sbExlZnQ6IG51bGwsIHNjcm9sbFRvcDogbnVsbCwgLy8gSW50ZXJtZWRpYXRlIHNjcm9sbCBwb3NpdGlvbiwgbm90IHB1c2hlZCB0byBET00geWV0XG4gICAgc2Nyb2xsVG9Qb3M6IG51bGwsICAgICAgIC8vIFVzZWQgdG8gc2Nyb2xsIHRvIGEgc3BlY2lmaWMgcG9zaXRpb25cbiAgICBmb2N1czogZmFsc2UsXG4gICAgaWQ6ICsrbmV4dE9wSWQgICAgICAgICAgIC8vIFVuaXF1ZSBJRFxuICB9O1xuICBwdXNoT3BlcmF0aW9uKGNtLmN1ck9wKTtcbn1cblxuLy8gRmluaXNoIGFuIG9wZXJhdGlvbiwgdXBkYXRpbmcgdGhlIGRpc3BsYXkgYW5kIHNpZ25hbGxpbmcgZGVsYXllZCBldmVudHNcbmZ1bmN0aW9uIGVuZE9wZXJhdGlvbihjbSkge1xuICB2YXIgb3AgPSBjbS5jdXJPcDtcbiAgZmluaXNoT3BlcmF0aW9uKG9wLCBmdW5jdGlvbiAoZ3JvdXApIHtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGdyb3VwLm9wcy5sZW5ndGg7IGkrKylcbiAgICAgIHsgZ3JvdXAub3BzW2ldLmNtLmN1ck9wID0gbnVsbDsgfVxuICAgIGVuZE9wZXJhdGlvbnMoZ3JvdXApO1xuICB9KTtcbn1cblxuLy8gVGhlIERPTSB1cGRhdGVzIGRvbmUgd2hlbiBhbiBvcGVyYXRpb24gZmluaXNoZXMgYXJlIGJhdGNoZWQgc29cbi8vIHRoYXQgdGhlIG1pbmltdW0gbnVtYmVyIG9mIHJlbGF5b3V0cyBhcmUgcmVxdWlyZWQuXG5mdW5jdGlvbiBlbmRPcGVyYXRpb25zKGdyb3VwKSB7XG4gIHZhciBvcHMgPSBncm91cC5vcHM7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgb3BzLmxlbmd0aDsgaSsrKSAvLyBSZWFkIERPTVxuICAgIHsgZW5kT3BlcmF0aW9uX1IxKG9wc1tpXSk7IH1cbiAgZm9yICh2YXIgaSQxID0gMDsgaSQxIDwgb3BzLmxlbmd0aDsgaSQxKyspIC8vIFdyaXRlIERPTSAobWF5YmUpXG4gICAgeyBlbmRPcGVyYXRpb25fVzEob3BzW2kkMV0pOyB9XG4gIGZvciAodmFyIGkkMiA9IDA7IGkkMiA8IG9wcy5sZW5ndGg7IGkkMisrKSAvLyBSZWFkIERPTVxuICAgIHsgZW5kT3BlcmF0aW9uX1IyKG9wc1tpJDJdKTsgfVxuICBmb3IgKHZhciBpJDMgPSAwOyBpJDMgPCBvcHMubGVuZ3RoOyBpJDMrKykgLy8gV3JpdGUgRE9NIChtYXliZSlcbiAgICB7IGVuZE9wZXJhdGlvbl9XMihvcHNbaSQzXSk7IH1cbiAgZm9yICh2YXIgaSQ0ID0gMDsgaSQ0IDwgb3BzLmxlbmd0aDsgaSQ0KyspIC8vIFJlYWQgRE9NXG4gICAgeyBlbmRPcGVyYXRpb25fZmluaXNoKG9wc1tpJDRdKTsgfVxufVxuXG5mdW5jdGlvbiBlbmRPcGVyYXRpb25fUjEob3ApIHtcbiAgdmFyIGNtID0gb3AuY20sIGRpc3BsYXkgPSBjbS5kaXNwbGF5O1xuICBtYXliZUNsaXBTY3JvbGxiYXJzKGNtKTtcbiAgaWYgKG9wLnVwZGF0ZU1heExpbmUpIHsgZmluZE1heExpbmUoY20pOyB9XG5cbiAgb3AubXVzdFVwZGF0ZSA9IG9wLnZpZXdDaGFuZ2VkIHx8IG9wLmZvcmNlVXBkYXRlIHx8IG9wLnNjcm9sbFRvcCAhPSBudWxsIHx8XG4gICAgb3Auc2Nyb2xsVG9Qb3MgJiYgKG9wLnNjcm9sbFRvUG9zLmZyb20ubGluZSA8IGRpc3BsYXkudmlld0Zyb20gfHxcbiAgICAgICAgICAgICAgICAgICAgICAgb3Auc2Nyb2xsVG9Qb3MudG8ubGluZSA+PSBkaXNwbGF5LnZpZXdUbykgfHxcbiAgICBkaXNwbGF5Lm1heExpbmVDaGFuZ2VkICYmIGNtLm9wdGlvbnMubGluZVdyYXBwaW5nO1xuICBvcC51cGRhdGUgPSBvcC5tdXN0VXBkYXRlICYmXG4gICAgbmV3IERpc3BsYXlVcGRhdGUoY20sIG9wLm11c3RVcGRhdGUgJiYge3RvcDogb3Auc2Nyb2xsVG9wLCBlbnN1cmU6IG9wLnNjcm9sbFRvUG9zfSwgb3AuZm9yY2VVcGRhdGUpO1xufVxuXG5mdW5jdGlvbiBlbmRPcGVyYXRpb25fVzEob3ApIHtcbiAgb3AudXBkYXRlZERpc3BsYXkgPSBvcC5tdXN0VXBkYXRlICYmIHVwZGF0ZURpc3BsYXlJZk5lZWRlZChvcC5jbSwgb3AudXBkYXRlKTtcbn1cblxuZnVuY3Rpb24gZW5kT3BlcmF0aW9uX1IyKG9wKSB7XG4gIHZhciBjbSA9IG9wLmNtLCBkaXNwbGF5ID0gY20uZGlzcGxheTtcbiAgaWYgKG9wLnVwZGF0ZWREaXNwbGF5KSB7IHVwZGF0ZUhlaWdodHNJblZpZXdwb3J0KGNtKTsgfVxuXG4gIG9wLmJhck1lYXN1cmUgPSBtZWFzdXJlRm9yU2Nyb2xsYmFycyhjbSk7XG5cbiAgLy8gSWYgdGhlIG1heCBsaW5lIGNoYW5nZWQgc2luY2UgaXQgd2FzIGxhc3QgbWVhc3VyZWQsIG1lYXN1cmUgaXQsXG4gIC8vIGFuZCBlbnN1cmUgdGhlIGRvY3VtZW50J3Mgd2lkdGggbWF0Y2hlcyBpdC5cbiAgLy8gdXBkYXRlRGlzcGxheV9XMiB3aWxsIHVzZSB0aGVzZSBwcm9wZXJ0aWVzIHRvIGRvIHRoZSBhY3R1YWwgcmVzaXppbmdcbiAgaWYgKGRpc3BsYXkubWF4TGluZUNoYW5nZWQgJiYgIWNtLm9wdGlvbnMubGluZVdyYXBwaW5nKSB7XG4gICAgb3AuYWRqdXN0V2lkdGhUbyA9IG1lYXN1cmVDaGFyKGNtLCBkaXNwbGF5Lm1heExpbmUsIGRpc3BsYXkubWF4TGluZS50ZXh0Lmxlbmd0aCkubGVmdCArIDM7XG4gICAgY20uZGlzcGxheS5zaXplcldpZHRoID0gb3AuYWRqdXN0V2lkdGhUbztcbiAgICBvcC5iYXJNZWFzdXJlLnNjcm9sbFdpZHRoID1cbiAgICAgIE1hdGgubWF4KGRpc3BsYXkuc2Nyb2xsZXIuY2xpZW50V2lkdGgsIGRpc3BsYXkuc2l6ZXIub2Zmc2V0TGVmdCArIG9wLmFkanVzdFdpZHRoVG8gKyBzY3JvbGxHYXAoY20pICsgY20uZGlzcGxheS5iYXJXaWR0aCk7XG4gICAgb3AubWF4U2Nyb2xsTGVmdCA9IE1hdGgubWF4KDAsIGRpc3BsYXkuc2l6ZXIub2Zmc2V0TGVmdCArIG9wLmFkanVzdFdpZHRoVG8gLSBkaXNwbGF5V2lkdGgoY20pKTtcbiAgfVxuXG4gIGlmIChvcC51cGRhdGVkRGlzcGxheSB8fCBvcC5zZWxlY3Rpb25DaGFuZ2VkKVxuICAgIHsgb3AucHJlcGFyZWRTZWxlY3Rpb24gPSBkaXNwbGF5LmlucHV0LnByZXBhcmVTZWxlY3Rpb24oKTsgfVxufVxuXG5mdW5jdGlvbiBlbmRPcGVyYXRpb25fVzIob3ApIHtcbiAgdmFyIGNtID0gb3AuY207XG5cbiAgaWYgKG9wLmFkanVzdFdpZHRoVG8gIT0gbnVsbCkge1xuICAgIGNtLmRpc3BsYXkuc2l6ZXIuc3R5bGUubWluV2lkdGggPSBvcC5hZGp1c3RXaWR0aFRvICsgXCJweFwiO1xuICAgIGlmIChvcC5tYXhTY3JvbGxMZWZ0IDwgY20uZG9jLnNjcm9sbExlZnQpXG4gICAgICB7IHNldFNjcm9sbExlZnQoY20sIE1hdGgubWluKGNtLmRpc3BsYXkuc2Nyb2xsZXIuc2Nyb2xsTGVmdCwgb3AubWF4U2Nyb2xsTGVmdCksIHRydWUpOyB9XG4gICAgY20uZGlzcGxheS5tYXhMaW5lQ2hhbmdlZCA9IGZhbHNlO1xuICB9XG5cbiAgdmFyIHRha2VGb2N1cyA9IG9wLmZvY3VzICYmIG9wLmZvY3VzID09IGFjdGl2ZUVsdCgpO1xuICBpZiAob3AucHJlcGFyZWRTZWxlY3Rpb24pXG4gICAgeyBjbS5kaXNwbGF5LmlucHV0LnNob3dTZWxlY3Rpb24ob3AucHJlcGFyZWRTZWxlY3Rpb24sIHRha2VGb2N1cyk7IH1cbiAgaWYgKG9wLnVwZGF0ZWREaXNwbGF5IHx8IG9wLnN0YXJ0SGVpZ2h0ICE9IGNtLmRvYy5oZWlnaHQpXG4gICAgeyB1cGRhdGVTY3JvbGxiYXJzKGNtLCBvcC5iYXJNZWFzdXJlKTsgfVxuICBpZiAob3AudXBkYXRlZERpc3BsYXkpXG4gICAgeyBzZXREb2N1bWVudEhlaWdodChjbSwgb3AuYmFyTWVhc3VyZSk7IH1cblxuICBpZiAob3Auc2VsZWN0aW9uQ2hhbmdlZCkgeyByZXN0YXJ0QmxpbmsoY20pOyB9XG5cbiAgaWYgKGNtLnN0YXRlLmZvY3VzZWQgJiYgb3AudXBkYXRlSW5wdXQpXG4gICAgeyBjbS5kaXNwbGF5LmlucHV0LnJlc2V0KG9wLnR5cGluZyk7IH1cbiAgaWYgKHRha2VGb2N1cykgeyBlbnN1cmVGb2N1cyhvcC5jbSk7IH1cbn1cblxuZnVuY3Rpb24gZW5kT3BlcmF0aW9uX2ZpbmlzaChvcCkge1xuICB2YXIgY20gPSBvcC5jbSwgZGlzcGxheSA9IGNtLmRpc3BsYXksIGRvYyA9IGNtLmRvYztcblxuICBpZiAob3AudXBkYXRlZERpc3BsYXkpIHsgcG9zdFVwZGF0ZURpc3BsYXkoY20sIG9wLnVwZGF0ZSk7IH1cblxuICAvLyBBYm9ydCBtb3VzZSB3aGVlbCBkZWx0YSBtZWFzdXJlbWVudCwgd2hlbiBzY3JvbGxpbmcgZXhwbGljaXRseVxuICBpZiAoZGlzcGxheS53aGVlbFN0YXJ0WCAhPSBudWxsICYmIChvcC5zY3JvbGxUb3AgIT0gbnVsbCB8fCBvcC5zY3JvbGxMZWZ0ICE9IG51bGwgfHwgb3Auc2Nyb2xsVG9Qb3MpKVxuICAgIHsgZGlzcGxheS53aGVlbFN0YXJ0WCA9IGRpc3BsYXkud2hlZWxTdGFydFkgPSBudWxsOyB9XG5cbiAgLy8gUHJvcGFnYXRlIHRoZSBzY3JvbGwgcG9zaXRpb24gdG8gdGhlIGFjdHVhbCBET00gc2Nyb2xsZXJcbiAgaWYgKG9wLnNjcm9sbFRvcCAhPSBudWxsKSB7IHNldFNjcm9sbFRvcChjbSwgb3Auc2Nyb2xsVG9wLCBvcC5mb3JjZVNjcm9sbCk7IH1cblxuICBpZiAob3Auc2Nyb2xsTGVmdCAhPSBudWxsKSB7IHNldFNjcm9sbExlZnQoY20sIG9wLnNjcm9sbExlZnQsIHRydWUsIHRydWUpOyB9XG4gIC8vIElmIHdlIG5lZWQgdG8gc2Nyb2xsIGEgc3BlY2lmaWMgcG9zaXRpb24gaW50byB2aWV3LCBkbyBzby5cbiAgaWYgKG9wLnNjcm9sbFRvUG9zKSB7XG4gICAgdmFyIHJlY3QgPSBzY3JvbGxQb3NJbnRvVmlldyhjbSwgY2xpcFBvcyhkb2MsIG9wLnNjcm9sbFRvUG9zLmZyb20pLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY2xpcFBvcyhkb2MsIG9wLnNjcm9sbFRvUG9zLnRvKSwgb3Auc2Nyb2xsVG9Qb3MubWFyZ2luKTtcbiAgICBtYXliZVNjcm9sbFdpbmRvdyhjbSwgcmVjdCk7XG4gIH1cblxuICAvLyBGaXJlIGV2ZW50cyBmb3IgbWFya2VycyB0aGF0IGFyZSBoaWRkZW4vdW5pZGRlbiBieSBlZGl0aW5nIG9yXG4gIC8vIHVuZG9pbmdcbiAgdmFyIGhpZGRlbiA9IG9wLm1heWJlSGlkZGVuTWFya2VycywgdW5oaWRkZW4gPSBvcC5tYXliZVVuaGlkZGVuTWFya2VycztcbiAgaWYgKGhpZGRlbikgeyBmb3IgKHZhciBpID0gMDsgaSA8IGhpZGRlbi5sZW5ndGg7ICsraSlcbiAgICB7IGlmICghaGlkZGVuW2ldLmxpbmVzLmxlbmd0aCkgeyBzaWduYWwoaGlkZGVuW2ldLCBcImhpZGVcIik7IH0gfSB9XG4gIGlmICh1bmhpZGRlbikgeyBmb3IgKHZhciBpJDEgPSAwOyBpJDEgPCB1bmhpZGRlbi5sZW5ndGg7ICsraSQxKVxuICAgIHsgaWYgKHVuaGlkZGVuW2kkMV0ubGluZXMubGVuZ3RoKSB7IHNpZ25hbCh1bmhpZGRlbltpJDFdLCBcInVuaGlkZVwiKTsgfSB9IH1cblxuICBpZiAoZGlzcGxheS53cmFwcGVyLm9mZnNldEhlaWdodClcbiAgICB7IGRvYy5zY3JvbGxUb3AgPSBjbS5kaXNwbGF5LnNjcm9sbGVyLnNjcm9sbFRvcDsgfVxuXG4gIC8vIEZpcmUgY2hhbmdlIGV2ZW50cywgYW5kIGRlbGF5ZWQgZXZlbnQgaGFuZGxlcnNcbiAgaWYgKG9wLmNoYW5nZU9ianMpXG4gICAgeyBzaWduYWwoY20sIFwiY2hhbmdlc1wiLCBjbSwgb3AuY2hhbmdlT2Jqcyk7IH1cbiAgaWYgKG9wLnVwZGF0ZSlcbiAgICB7IG9wLnVwZGF0ZS5maW5pc2goKTsgfVxufVxuXG4vLyBSdW4gdGhlIGdpdmVuIGZ1bmN0aW9uIGluIGFuIG9wZXJhdGlvblxuZnVuY3Rpb24gcnVuSW5PcChjbSwgZikge1xuICBpZiAoY20uY3VyT3ApIHsgcmV0dXJuIGYoKSB9XG4gIHN0YXJ0T3BlcmF0aW9uKGNtKTtcbiAgdHJ5IHsgcmV0dXJuIGYoKSB9XG4gIGZpbmFsbHkgeyBlbmRPcGVyYXRpb24oY20pOyB9XG59XG4vLyBXcmFwcyBhIGZ1bmN0aW9uIGluIGFuIG9wZXJhdGlvbi4gUmV0dXJucyB0aGUgd3JhcHBlZCBmdW5jdGlvbi5cbmZ1bmN0aW9uIG9wZXJhdGlvbihjbSwgZikge1xuICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgaWYgKGNtLmN1ck9wKSB7IHJldHVybiBmLmFwcGx5KGNtLCBhcmd1bWVudHMpIH1cbiAgICBzdGFydE9wZXJhdGlvbihjbSk7XG4gICAgdHJ5IHsgcmV0dXJuIGYuYXBwbHkoY20sIGFyZ3VtZW50cykgfVxuICAgIGZpbmFsbHkgeyBlbmRPcGVyYXRpb24oY20pOyB9XG4gIH1cbn1cbi8vIFVzZWQgdG8gYWRkIG1ldGhvZHMgdG8gZWRpdG9yIGFuZCBkb2MgaW5zdGFuY2VzLCB3cmFwcGluZyB0aGVtIGluXG4vLyBvcGVyYXRpb25zLlxuZnVuY3Rpb24gbWV0aG9kT3AoZikge1xuICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgaWYgKHRoaXMuY3VyT3ApIHsgcmV0dXJuIGYuYXBwbHkodGhpcywgYXJndW1lbnRzKSB9XG4gICAgc3RhcnRPcGVyYXRpb24odGhpcyk7XG4gICAgdHJ5IHsgcmV0dXJuIGYuYXBwbHkodGhpcywgYXJndW1lbnRzKSB9XG4gICAgZmluYWxseSB7IGVuZE9wZXJhdGlvbih0aGlzKTsgfVxuICB9XG59XG5mdW5jdGlvbiBkb2NNZXRob2RPcChmKSB7XG4gIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICB2YXIgY20gPSB0aGlzLmNtO1xuICAgIGlmICghY20gfHwgY20uY3VyT3ApIHsgcmV0dXJuIGYuYXBwbHkodGhpcywgYXJndW1lbnRzKSB9XG4gICAgc3RhcnRPcGVyYXRpb24oY20pO1xuICAgIHRyeSB7IHJldHVybiBmLmFwcGx5KHRoaXMsIGFyZ3VtZW50cykgfVxuICAgIGZpbmFsbHkgeyBlbmRPcGVyYXRpb24oY20pOyB9XG4gIH1cbn1cblxuLy8gVXBkYXRlcyB0aGUgZGlzcGxheS52aWV3IGRhdGEgc3RydWN0dXJlIGZvciBhIGdpdmVuIGNoYW5nZSB0byB0aGVcbi8vIGRvY3VtZW50LiBGcm9tIGFuZCB0byBhcmUgaW4gcHJlLWNoYW5nZSBjb29yZGluYXRlcy4gTGVuZGlmZiBpc1xuLy8gdGhlIGFtb3VudCBvZiBsaW5lcyBhZGRlZCBvciBzdWJ0cmFjdGVkIGJ5IHRoZSBjaGFuZ2UuIFRoaXMgaXNcbi8vIHVzZWQgZm9yIGNoYW5nZXMgdGhhdCBzcGFuIG11bHRpcGxlIGxpbmVzLCBvciBjaGFuZ2UgdGhlIHdheVxuLy8gbGluZXMgYXJlIGRpdmlkZWQgaW50byB2aXN1YWwgbGluZXMuIHJlZ0xpbmVDaGFuZ2UgKGJlbG93KVxuLy8gcmVnaXN0ZXJzIHNpbmdsZS1saW5lIGNoYW5nZXMuXG5mdW5jdGlvbiByZWdDaGFuZ2UoY20sIGZyb20sIHRvLCBsZW5kaWZmKSB7XG4gIGlmIChmcm9tID09IG51bGwpIHsgZnJvbSA9IGNtLmRvYy5maXJzdDsgfVxuICBpZiAodG8gPT0gbnVsbCkgeyB0byA9IGNtLmRvYy5maXJzdCArIGNtLmRvYy5zaXplOyB9XG4gIGlmICghbGVuZGlmZikgeyBsZW5kaWZmID0gMDsgfVxuXG4gIHZhciBkaXNwbGF5ID0gY20uZGlzcGxheTtcbiAgaWYgKGxlbmRpZmYgJiYgdG8gPCBkaXNwbGF5LnZpZXdUbyAmJlxuICAgICAgKGRpc3BsYXkudXBkYXRlTGluZU51bWJlcnMgPT0gbnVsbCB8fCBkaXNwbGF5LnVwZGF0ZUxpbmVOdW1iZXJzID4gZnJvbSkpXG4gICAgeyBkaXNwbGF5LnVwZGF0ZUxpbmVOdW1iZXJzID0gZnJvbTsgfVxuXG4gIGNtLmN1ck9wLnZpZXdDaGFuZ2VkID0gdHJ1ZTtcblxuICBpZiAoZnJvbSA+PSBkaXNwbGF5LnZpZXdUbykgeyAvLyBDaGFuZ2UgYWZ0ZXJcbiAgICBpZiAoc2F3Q29sbGFwc2VkU3BhbnMgJiYgdmlzdWFsTGluZU5vKGNtLmRvYywgZnJvbSkgPCBkaXNwbGF5LnZpZXdUbylcbiAgICAgIHsgcmVzZXRWaWV3KGNtKTsgfVxuICB9IGVsc2UgaWYgKHRvIDw9IGRpc3BsYXkudmlld0Zyb20pIHsgLy8gQ2hhbmdlIGJlZm9yZVxuICAgIGlmIChzYXdDb2xsYXBzZWRTcGFucyAmJiB2aXN1YWxMaW5lRW5kTm8oY20uZG9jLCB0byArIGxlbmRpZmYpID4gZGlzcGxheS52aWV3RnJvbSkge1xuICAgICAgcmVzZXRWaWV3KGNtKTtcbiAgICB9IGVsc2Uge1xuICAgICAgZGlzcGxheS52aWV3RnJvbSArPSBsZW5kaWZmO1xuICAgICAgZGlzcGxheS52aWV3VG8gKz0gbGVuZGlmZjtcbiAgICB9XG4gIH0gZWxzZSBpZiAoZnJvbSA8PSBkaXNwbGF5LnZpZXdGcm9tICYmIHRvID49IGRpc3BsYXkudmlld1RvKSB7IC8vIEZ1bGwgb3ZlcmxhcFxuICAgIHJlc2V0VmlldyhjbSk7XG4gIH0gZWxzZSBpZiAoZnJvbSA8PSBkaXNwbGF5LnZpZXdGcm9tKSB7IC8vIFRvcCBvdmVybGFwXG4gICAgdmFyIGN1dCA9IHZpZXdDdXR0aW5nUG9pbnQoY20sIHRvLCB0byArIGxlbmRpZmYsIDEpO1xuICAgIGlmIChjdXQpIHtcbiAgICAgIGRpc3BsYXkudmlldyA9IGRpc3BsYXkudmlldy5zbGljZShjdXQuaW5kZXgpO1xuICAgICAgZGlzcGxheS52aWV3RnJvbSA9IGN1dC5saW5lTjtcbiAgICAgIGRpc3BsYXkudmlld1RvICs9IGxlbmRpZmY7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJlc2V0VmlldyhjbSk7XG4gICAgfVxuICB9IGVsc2UgaWYgKHRvID49IGRpc3BsYXkudmlld1RvKSB7IC8vIEJvdHRvbSBvdmVybGFwXG4gICAgdmFyIGN1dCQxID0gdmlld0N1dHRpbmdQb2ludChjbSwgZnJvbSwgZnJvbSwgLTEpO1xuICAgIGlmIChjdXQkMSkge1xuICAgICAgZGlzcGxheS52aWV3ID0gZGlzcGxheS52aWV3LnNsaWNlKDAsIGN1dCQxLmluZGV4KTtcbiAgICAgIGRpc3BsYXkudmlld1RvID0gY3V0JDEubGluZU47XG4gICAgfSBlbHNlIHtcbiAgICAgIHJlc2V0VmlldyhjbSk7XG4gICAgfVxuICB9IGVsc2UgeyAvLyBHYXAgaW4gdGhlIG1pZGRsZVxuICAgIHZhciBjdXRUb3AgPSB2aWV3Q3V0dGluZ1BvaW50KGNtLCBmcm9tLCBmcm9tLCAtMSk7XG4gICAgdmFyIGN1dEJvdCA9IHZpZXdDdXR0aW5nUG9pbnQoY20sIHRvLCB0byArIGxlbmRpZmYsIDEpO1xuICAgIGlmIChjdXRUb3AgJiYgY3V0Qm90KSB7XG4gICAgICBkaXNwbGF5LnZpZXcgPSBkaXNwbGF5LnZpZXcuc2xpY2UoMCwgY3V0VG9wLmluZGV4KVxuICAgICAgICAuY29uY2F0KGJ1aWxkVmlld0FycmF5KGNtLCBjdXRUb3AubGluZU4sIGN1dEJvdC5saW5lTikpXG4gICAgICAgIC5jb25jYXQoZGlzcGxheS52aWV3LnNsaWNlKGN1dEJvdC5pbmRleCkpO1xuICAgICAgZGlzcGxheS52aWV3VG8gKz0gbGVuZGlmZjtcbiAgICB9IGVsc2Uge1xuICAgICAgcmVzZXRWaWV3KGNtKTtcbiAgICB9XG4gIH1cblxuICB2YXIgZXh0ID0gZGlzcGxheS5leHRlcm5hbE1lYXN1cmVkO1xuICBpZiAoZXh0KSB7XG4gICAgaWYgKHRvIDwgZXh0LmxpbmVOKVxuICAgICAgeyBleHQubGluZU4gKz0gbGVuZGlmZjsgfVxuICAgIGVsc2UgaWYgKGZyb20gPCBleHQubGluZU4gKyBleHQuc2l6ZSlcbiAgICAgIHsgZGlzcGxheS5leHRlcm5hbE1lYXN1cmVkID0gbnVsbDsgfVxuICB9XG59XG5cbi8vIFJlZ2lzdGVyIGEgY2hhbmdlIHRvIGEgc2luZ2xlIGxpbmUuIFR5cGUgbXVzdCBiZSBvbmUgb2YgXCJ0ZXh0XCIsXG4vLyBcImd1dHRlclwiLCBcImNsYXNzXCIsIFwid2lkZ2V0XCJcbmZ1bmN0aW9uIHJlZ0xpbmVDaGFuZ2UoY20sIGxpbmUsIHR5cGUpIHtcbiAgY20uY3VyT3Audmlld0NoYW5nZWQgPSB0cnVlO1xuICB2YXIgZGlzcGxheSA9IGNtLmRpc3BsYXksIGV4dCA9IGNtLmRpc3BsYXkuZXh0ZXJuYWxNZWFzdXJlZDtcbiAgaWYgKGV4dCAmJiBsaW5lID49IGV4dC5saW5lTiAmJiBsaW5lIDwgZXh0LmxpbmVOICsgZXh0LnNpemUpXG4gICAgeyBkaXNwbGF5LmV4dGVybmFsTWVhc3VyZWQgPSBudWxsOyB9XG5cbiAgaWYgKGxpbmUgPCBkaXNwbGF5LnZpZXdGcm9tIHx8IGxpbmUgPj0gZGlzcGxheS52aWV3VG8pIHsgcmV0dXJuIH1cbiAgdmFyIGxpbmVWaWV3ID0gZGlzcGxheS52aWV3W2ZpbmRWaWV3SW5kZXgoY20sIGxpbmUpXTtcbiAgaWYgKGxpbmVWaWV3Lm5vZGUgPT0gbnVsbCkgeyByZXR1cm4gfVxuICB2YXIgYXJyID0gbGluZVZpZXcuY2hhbmdlcyB8fCAobGluZVZpZXcuY2hhbmdlcyA9IFtdKTtcbiAgaWYgKGluZGV4T2YoYXJyLCB0eXBlKSA9PSAtMSkgeyBhcnIucHVzaCh0eXBlKTsgfVxufVxuXG4vLyBDbGVhciB0aGUgdmlldy5cbmZ1bmN0aW9uIHJlc2V0VmlldyhjbSkge1xuICBjbS5kaXNwbGF5LnZpZXdGcm9tID0gY20uZGlzcGxheS52aWV3VG8gPSBjbS5kb2MuZmlyc3Q7XG4gIGNtLmRpc3BsYXkudmlldyA9IFtdO1xuICBjbS5kaXNwbGF5LnZpZXdPZmZzZXQgPSAwO1xufVxuXG5mdW5jdGlvbiB2aWV3Q3V0dGluZ1BvaW50KGNtLCBvbGROLCBuZXdOLCBkaXIpIHtcbiAgdmFyIGluZGV4ID0gZmluZFZpZXdJbmRleChjbSwgb2xkTiksIGRpZmYsIHZpZXcgPSBjbS5kaXNwbGF5LnZpZXc7XG4gIGlmICghc2F3Q29sbGFwc2VkU3BhbnMgfHwgbmV3TiA9PSBjbS5kb2MuZmlyc3QgKyBjbS5kb2Muc2l6ZSlcbiAgICB7IHJldHVybiB7aW5kZXg6IGluZGV4LCBsaW5lTjogbmV3Tn0gfVxuICB2YXIgbiA9IGNtLmRpc3BsYXkudmlld0Zyb207XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgaW5kZXg7IGkrKylcbiAgICB7IG4gKz0gdmlld1tpXS5zaXplOyB9XG4gIGlmIChuICE9IG9sZE4pIHtcbiAgICBpZiAoZGlyID4gMCkge1xuICAgICAgaWYgKGluZGV4ID09IHZpZXcubGVuZ3RoIC0gMSkgeyByZXR1cm4gbnVsbCB9XG4gICAgICBkaWZmID0gKG4gKyB2aWV3W2luZGV4XS5zaXplKSAtIG9sZE47XG4gICAgICBpbmRleCsrO1xuICAgIH0gZWxzZSB7XG4gICAgICBkaWZmID0gbiAtIG9sZE47XG4gICAgfVxuICAgIG9sZE4gKz0gZGlmZjsgbmV3TiArPSBkaWZmO1xuICB9XG4gIHdoaWxlICh2aXN1YWxMaW5lTm8oY20uZG9jLCBuZXdOKSAhPSBuZXdOKSB7XG4gICAgaWYgKGluZGV4ID09IChkaXIgPCAwID8gMCA6IHZpZXcubGVuZ3RoIC0gMSkpIHsgcmV0dXJuIG51bGwgfVxuICAgIG5ld04gKz0gZGlyICogdmlld1tpbmRleCAtIChkaXIgPCAwID8gMSA6IDApXS5zaXplO1xuICAgIGluZGV4ICs9IGRpcjtcbiAgfVxuICByZXR1cm4ge2luZGV4OiBpbmRleCwgbGluZU46IG5ld059XG59XG5cbi8vIEZvcmNlIHRoZSB2aWV3IHRvIGNvdmVyIGEgZ2l2ZW4gcmFuZ2UsIGFkZGluZyBlbXB0eSB2aWV3IGVsZW1lbnRcbi8vIG9yIGNsaXBwaW5nIG9mZiBleGlzdGluZyBvbmVzIGFzIG5lZWRlZC5cbmZ1bmN0aW9uIGFkanVzdFZpZXcoY20sIGZyb20sIHRvKSB7XG4gIHZhciBkaXNwbGF5ID0gY20uZGlzcGxheSwgdmlldyA9IGRpc3BsYXkudmlldztcbiAgaWYgKHZpZXcubGVuZ3RoID09IDAgfHwgZnJvbSA+PSBkaXNwbGF5LnZpZXdUbyB8fCB0byA8PSBkaXNwbGF5LnZpZXdGcm9tKSB7XG4gICAgZGlzcGxheS52aWV3ID0gYnVpbGRWaWV3QXJyYXkoY20sIGZyb20sIHRvKTtcbiAgICBkaXNwbGF5LnZpZXdGcm9tID0gZnJvbTtcbiAgfSBlbHNlIHtcbiAgICBpZiAoZGlzcGxheS52aWV3RnJvbSA+IGZyb20pXG4gICAgICB7IGRpc3BsYXkudmlldyA9IGJ1aWxkVmlld0FycmF5KGNtLCBmcm9tLCBkaXNwbGF5LnZpZXdGcm9tKS5jb25jYXQoZGlzcGxheS52aWV3KTsgfVxuICAgIGVsc2UgaWYgKGRpc3BsYXkudmlld0Zyb20gPCBmcm9tKVxuICAgICAgeyBkaXNwbGF5LnZpZXcgPSBkaXNwbGF5LnZpZXcuc2xpY2UoZmluZFZpZXdJbmRleChjbSwgZnJvbSkpOyB9XG4gICAgZGlzcGxheS52aWV3RnJvbSA9IGZyb207XG4gICAgaWYgKGRpc3BsYXkudmlld1RvIDwgdG8pXG4gICAgICB7IGRpc3BsYXkudmlldyA9IGRpc3BsYXkudmlldy5jb25jYXQoYnVpbGRWaWV3QXJyYXkoY20sIGRpc3BsYXkudmlld1RvLCB0bykpOyB9XG4gICAgZWxzZSBpZiAoZGlzcGxheS52aWV3VG8gPiB0bylcbiAgICAgIHsgZGlzcGxheS52aWV3ID0gZGlzcGxheS52aWV3LnNsaWNlKDAsIGZpbmRWaWV3SW5kZXgoY20sIHRvKSk7IH1cbiAgfVxuICBkaXNwbGF5LnZpZXdUbyA9IHRvO1xufVxuXG4vLyBDb3VudCB0aGUgbnVtYmVyIG9mIGxpbmVzIGluIHRoZSB2aWV3IHdob3NlIERPTSByZXByZXNlbnRhdGlvbiBpc1xuLy8gb3V0IG9mIGRhdGUgKG9yIG5vbmV4aXN0ZW50KS5cbmZ1bmN0aW9uIGNvdW50RGlydHlWaWV3KGNtKSB7XG4gIHZhciB2aWV3ID0gY20uZGlzcGxheS52aWV3LCBkaXJ0eSA9IDA7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgdmlldy5sZW5ndGg7IGkrKykge1xuICAgIHZhciBsaW5lVmlldyA9IHZpZXdbaV07XG4gICAgaWYgKCFsaW5lVmlldy5oaWRkZW4gJiYgKCFsaW5lVmlldy5ub2RlIHx8IGxpbmVWaWV3LmNoYW5nZXMpKSB7ICsrZGlydHk7IH1cbiAgfVxuICByZXR1cm4gZGlydHlcbn1cblxuLy8gSElHSExJR0hUIFdPUktFUlxuXG5mdW5jdGlvbiBzdGFydFdvcmtlcihjbSwgdGltZSkge1xuICBpZiAoY20uZG9jLmhpZ2hsaWdodEZyb250aWVyIDwgY20uZGlzcGxheS52aWV3VG8pXG4gICAgeyBjbS5zdGF0ZS5oaWdobGlnaHQuc2V0KHRpbWUsIGJpbmQoaGlnaGxpZ2h0V29ya2VyLCBjbSkpOyB9XG59XG5cbmZ1bmN0aW9uIGhpZ2hsaWdodFdvcmtlcihjbSkge1xuICB2YXIgZG9jID0gY20uZG9jO1xuICBpZiAoZG9jLmhpZ2hsaWdodEZyb250aWVyID49IGNtLmRpc3BsYXkudmlld1RvKSB7IHJldHVybiB9XG4gIHZhciBlbmQgPSArbmV3IERhdGUgKyBjbS5vcHRpb25zLndvcmtUaW1lO1xuICB2YXIgY29udGV4dCA9IGdldENvbnRleHRCZWZvcmUoY20sIGRvYy5oaWdobGlnaHRGcm9udGllcik7XG4gIHZhciBjaGFuZ2VkTGluZXMgPSBbXTtcblxuICBkb2MuaXRlcihjb250ZXh0LmxpbmUsIE1hdGgubWluKGRvYy5maXJzdCArIGRvYy5zaXplLCBjbS5kaXNwbGF5LnZpZXdUbyArIDUwMCksIGZ1bmN0aW9uIChsaW5lKSB7XG4gICAgaWYgKGNvbnRleHQubGluZSA+PSBjbS5kaXNwbGF5LnZpZXdGcm9tKSB7IC8vIFZpc2libGVcbiAgICAgIHZhciBvbGRTdHlsZXMgPSBsaW5lLnN0eWxlcztcbiAgICAgIHZhciByZXNldFN0YXRlID0gbGluZS50ZXh0Lmxlbmd0aCA+IGNtLm9wdGlvbnMubWF4SGlnaGxpZ2h0TGVuZ3RoID8gY29weVN0YXRlKGRvYy5tb2RlLCBjb250ZXh0LnN0YXRlKSA6IG51bGw7XG4gICAgICB2YXIgaGlnaGxpZ2h0ZWQgPSBoaWdobGlnaHRMaW5lKGNtLCBsaW5lLCBjb250ZXh0LCB0cnVlKTtcbiAgICAgIGlmIChyZXNldFN0YXRlKSB7IGNvbnRleHQuc3RhdGUgPSByZXNldFN0YXRlOyB9XG4gICAgICBsaW5lLnN0eWxlcyA9IGhpZ2hsaWdodGVkLnN0eWxlcztcbiAgICAgIHZhciBvbGRDbHMgPSBsaW5lLnN0eWxlQ2xhc3NlcywgbmV3Q2xzID0gaGlnaGxpZ2h0ZWQuY2xhc3NlcztcbiAgICAgIGlmIChuZXdDbHMpIHsgbGluZS5zdHlsZUNsYXNzZXMgPSBuZXdDbHM7IH1cbiAgICAgIGVsc2UgaWYgKG9sZENscykgeyBsaW5lLnN0eWxlQ2xhc3NlcyA9IG51bGw7IH1cbiAgICAgIHZhciBpc2NoYW5nZSA9ICFvbGRTdHlsZXMgfHwgb2xkU3R5bGVzLmxlbmd0aCAhPSBsaW5lLnN0eWxlcy5sZW5ndGggfHxcbiAgICAgICAgb2xkQ2xzICE9IG5ld0NscyAmJiAoIW9sZENscyB8fCAhbmV3Q2xzIHx8IG9sZENscy5iZ0NsYXNzICE9IG5ld0Nscy5iZ0NsYXNzIHx8IG9sZENscy50ZXh0Q2xhc3MgIT0gbmV3Q2xzLnRleHRDbGFzcyk7XG4gICAgICBmb3IgKHZhciBpID0gMDsgIWlzY2hhbmdlICYmIGkgPCBvbGRTdHlsZXMubGVuZ3RoOyArK2kpIHsgaXNjaGFuZ2UgPSBvbGRTdHlsZXNbaV0gIT0gbGluZS5zdHlsZXNbaV07IH1cbiAgICAgIGlmIChpc2NoYW5nZSkgeyBjaGFuZ2VkTGluZXMucHVzaChjb250ZXh0LmxpbmUpOyB9XG4gICAgICBsaW5lLnN0YXRlQWZ0ZXIgPSBjb250ZXh0LnNhdmUoKTtcbiAgICAgIGNvbnRleHQubmV4dExpbmUoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKGxpbmUudGV4dC5sZW5ndGggPD0gY20ub3B0aW9ucy5tYXhIaWdobGlnaHRMZW5ndGgpXG4gICAgICAgIHsgcHJvY2Vzc0xpbmUoY20sIGxpbmUudGV4dCwgY29udGV4dCk7IH1cbiAgICAgIGxpbmUuc3RhdGVBZnRlciA9IGNvbnRleHQubGluZSAlIDUgPT0gMCA/IGNvbnRleHQuc2F2ZSgpIDogbnVsbDtcbiAgICAgIGNvbnRleHQubmV4dExpbmUoKTtcbiAgICB9XG4gICAgaWYgKCtuZXcgRGF0ZSA+IGVuZCkge1xuICAgICAgc3RhcnRXb3JrZXIoY20sIGNtLm9wdGlvbnMud29ya0RlbGF5KTtcbiAgICAgIHJldHVybiB0cnVlXG4gICAgfVxuICB9KTtcbiAgZG9jLmhpZ2hsaWdodEZyb250aWVyID0gY29udGV4dC5saW5lO1xuICBkb2MubW9kZUZyb250aWVyID0gTWF0aC5tYXgoZG9jLm1vZGVGcm9udGllciwgY29udGV4dC5saW5lKTtcbiAgaWYgKGNoYW5nZWRMaW5lcy5sZW5ndGgpIHsgcnVuSW5PcChjbSwgZnVuY3Rpb24gKCkge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY2hhbmdlZExpbmVzLmxlbmd0aDsgaSsrKVxuICAgICAgeyByZWdMaW5lQ2hhbmdlKGNtLCBjaGFuZ2VkTGluZXNbaV0sIFwidGV4dFwiKTsgfVxuICB9KTsgfVxufVxuXG4vLyBESVNQTEFZIERSQVdJTkdcblxudmFyIERpc3BsYXlVcGRhdGUgPSBmdW5jdGlvbihjbSwgdmlld3BvcnQsIGZvcmNlKSB7XG4gIHZhciBkaXNwbGF5ID0gY20uZGlzcGxheTtcblxuICB0aGlzLnZpZXdwb3J0ID0gdmlld3BvcnQ7XG4gIC8vIFN0b3JlIHNvbWUgdmFsdWVzIHRoYXQgd2UnbGwgbmVlZCBsYXRlciAoYnV0IGRvbid0IHdhbnQgdG8gZm9yY2UgYSByZWxheW91dCBmb3IpXG4gIHRoaXMudmlzaWJsZSA9IHZpc2libGVMaW5lcyhkaXNwbGF5LCBjbS5kb2MsIHZpZXdwb3J0KTtcbiAgdGhpcy5lZGl0b3JJc0hpZGRlbiA9ICFkaXNwbGF5LndyYXBwZXIub2Zmc2V0V2lkdGg7XG4gIHRoaXMud3JhcHBlckhlaWdodCA9IGRpc3BsYXkud3JhcHBlci5jbGllbnRIZWlnaHQ7XG4gIHRoaXMud3JhcHBlcldpZHRoID0gZGlzcGxheS53cmFwcGVyLmNsaWVudFdpZHRoO1xuICB0aGlzLm9sZERpc3BsYXlXaWR0aCA9IGRpc3BsYXlXaWR0aChjbSk7XG4gIHRoaXMuZm9yY2UgPSBmb3JjZTtcbiAgdGhpcy5kaW1zID0gZ2V0RGltZW5zaW9ucyhjbSk7XG4gIHRoaXMuZXZlbnRzID0gW107XG59O1xuXG5EaXNwbGF5VXBkYXRlLnByb3RvdHlwZS5zaWduYWwgPSBmdW5jdGlvbiAoZW1pdHRlciwgdHlwZSkge1xuICBpZiAoaGFzSGFuZGxlcihlbWl0dGVyLCB0eXBlKSlcbiAgICB7IHRoaXMuZXZlbnRzLnB1c2goYXJndW1lbnRzKTsgfVxufTtcbkRpc3BsYXlVcGRhdGUucHJvdG90eXBlLmZpbmlzaCA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgdGhpcyQxID0gdGhpcztcblxuICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMuZXZlbnRzLmxlbmd0aDsgaSsrKVxuICAgIHsgc2lnbmFsLmFwcGx5KG51bGwsIHRoaXMkMS5ldmVudHNbaV0pOyB9XG59O1xuXG5mdW5jdGlvbiBtYXliZUNsaXBTY3JvbGxiYXJzKGNtKSB7XG4gIHZhciBkaXNwbGF5ID0gY20uZGlzcGxheTtcbiAgaWYgKCFkaXNwbGF5LnNjcm9sbGJhcnNDbGlwcGVkICYmIGRpc3BsYXkuc2Nyb2xsZXIub2Zmc2V0V2lkdGgpIHtcbiAgICBkaXNwbGF5Lm5hdGl2ZUJhcldpZHRoID0gZGlzcGxheS5zY3JvbGxlci5vZmZzZXRXaWR0aCAtIGRpc3BsYXkuc2Nyb2xsZXIuY2xpZW50V2lkdGg7XG4gICAgZGlzcGxheS5oZWlnaHRGb3JjZXIuc3R5bGUuaGVpZ2h0ID0gc2Nyb2xsR2FwKGNtKSArIFwicHhcIjtcbiAgICBkaXNwbGF5LnNpemVyLnN0eWxlLm1hcmdpbkJvdHRvbSA9IC1kaXNwbGF5Lm5hdGl2ZUJhcldpZHRoICsgXCJweFwiO1xuICAgIGRpc3BsYXkuc2l6ZXIuc3R5bGUuYm9yZGVyUmlnaHRXaWR0aCA9IHNjcm9sbEdhcChjbSkgKyBcInB4XCI7XG4gICAgZGlzcGxheS5zY3JvbGxiYXJzQ2xpcHBlZCA9IHRydWU7XG4gIH1cbn1cblxuZnVuY3Rpb24gc2VsZWN0aW9uU25hcHNob3QoY20pIHtcbiAgaWYgKGNtLmhhc0ZvY3VzKCkpIHsgcmV0dXJuIG51bGwgfVxuICB2YXIgYWN0aXZlID0gYWN0aXZlRWx0KCk7XG4gIGlmICghYWN0aXZlIHx8ICFjb250YWlucyhjbS5kaXNwbGF5LmxpbmVEaXYsIGFjdGl2ZSkpIHsgcmV0dXJuIG51bGwgfVxuICB2YXIgcmVzdWx0ID0ge2FjdGl2ZUVsdDogYWN0aXZlfTtcbiAgaWYgKHdpbmRvdy5nZXRTZWxlY3Rpb24pIHtcbiAgICB2YXIgc2VsID0gd2luZG93LmdldFNlbGVjdGlvbigpO1xuICAgIGlmIChzZWwuYW5jaG9yTm9kZSAmJiBzZWwuZXh0ZW5kICYmIGNvbnRhaW5zKGNtLmRpc3BsYXkubGluZURpdiwgc2VsLmFuY2hvck5vZGUpKSB7XG4gICAgICByZXN1bHQuYW5jaG9yTm9kZSA9IHNlbC5hbmNob3JOb2RlO1xuICAgICAgcmVzdWx0LmFuY2hvck9mZnNldCA9IHNlbC5hbmNob3JPZmZzZXQ7XG4gICAgICByZXN1bHQuZm9jdXNOb2RlID0gc2VsLmZvY3VzTm9kZTtcbiAgICAgIHJlc3VsdC5mb2N1c09mZnNldCA9IHNlbC5mb2N1c09mZnNldDtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHJlc3VsdFxufVxuXG5mdW5jdGlvbiByZXN0b3JlU2VsZWN0aW9uKHNuYXBzaG90KSB7XG4gIGlmICghc25hcHNob3QgfHwgIXNuYXBzaG90LmFjdGl2ZUVsdCB8fCBzbmFwc2hvdC5hY3RpdmVFbHQgPT0gYWN0aXZlRWx0KCkpIHsgcmV0dXJuIH1cbiAgc25hcHNob3QuYWN0aXZlRWx0LmZvY3VzKCk7XG4gIGlmIChzbmFwc2hvdC5hbmNob3JOb2RlICYmIGNvbnRhaW5zKGRvY3VtZW50LmJvZHksIHNuYXBzaG90LmFuY2hvck5vZGUpICYmIGNvbnRhaW5zKGRvY3VtZW50LmJvZHksIHNuYXBzaG90LmZvY3VzTm9kZSkpIHtcbiAgICB2YXIgc2VsID0gd2luZG93LmdldFNlbGVjdGlvbigpLCByYW5nZSQkMSA9IGRvY3VtZW50LmNyZWF0ZVJhbmdlKCk7XG4gICAgcmFuZ2UkJDEuc2V0RW5kKHNuYXBzaG90LmFuY2hvck5vZGUsIHNuYXBzaG90LmFuY2hvck9mZnNldCk7XG4gICAgcmFuZ2UkJDEuY29sbGFwc2UoZmFsc2UpO1xuICAgIHNlbC5yZW1vdmVBbGxSYW5nZXMoKTtcbiAgICBzZWwuYWRkUmFuZ2UocmFuZ2UkJDEpO1xuICAgIHNlbC5leHRlbmQoc25hcHNob3QuZm9jdXNOb2RlLCBzbmFwc2hvdC5mb2N1c09mZnNldCk7XG4gIH1cbn1cblxuLy8gRG9lcyB0aGUgYWN0dWFsIHVwZGF0aW5nIG9mIHRoZSBsaW5lIGRpc3BsYXkuIEJhaWxzIG91dFxuLy8gKHJldHVybmluZyBmYWxzZSkgd2hlbiB0aGVyZSBpcyBub3RoaW5nIHRvIGJlIGRvbmUgYW5kIGZvcmNlZCBpc1xuLy8gZmFsc2UuXG5mdW5jdGlvbiB1cGRhdGVEaXNwbGF5SWZOZWVkZWQoY20sIHVwZGF0ZSkge1xuICB2YXIgZGlzcGxheSA9IGNtLmRpc3BsYXksIGRvYyA9IGNtLmRvYztcblxuICBpZiAodXBkYXRlLmVkaXRvcklzSGlkZGVuKSB7XG4gICAgcmVzZXRWaWV3KGNtKTtcbiAgICByZXR1cm4gZmFsc2VcbiAgfVxuXG4gIC8vIEJhaWwgb3V0IGlmIHRoZSB2aXNpYmxlIGFyZWEgaXMgYWxyZWFkeSByZW5kZXJlZCBhbmQgbm90aGluZyBjaGFuZ2VkLlxuICBpZiAoIXVwZGF0ZS5mb3JjZSAmJlxuICAgICAgdXBkYXRlLnZpc2libGUuZnJvbSA+PSBkaXNwbGF5LnZpZXdGcm9tICYmIHVwZGF0ZS52aXNpYmxlLnRvIDw9IGRpc3BsYXkudmlld1RvICYmXG4gICAgICAoZGlzcGxheS51cGRhdGVMaW5lTnVtYmVycyA9PSBudWxsIHx8IGRpc3BsYXkudXBkYXRlTGluZU51bWJlcnMgPj0gZGlzcGxheS52aWV3VG8pICYmXG4gICAgICBkaXNwbGF5LnJlbmRlcmVkVmlldyA9PSBkaXNwbGF5LnZpZXcgJiYgY291bnREaXJ0eVZpZXcoY20pID09IDApXG4gICAgeyByZXR1cm4gZmFsc2UgfVxuXG4gIGlmIChtYXliZVVwZGF0ZUxpbmVOdW1iZXJXaWR0aChjbSkpIHtcbiAgICByZXNldFZpZXcoY20pO1xuICAgIHVwZGF0ZS5kaW1zID0gZ2V0RGltZW5zaW9ucyhjbSk7XG4gIH1cblxuICAvLyBDb21wdXRlIGEgc3VpdGFibGUgbmV3IHZpZXdwb3J0IChmcm9tICYgdG8pXG4gIHZhciBlbmQgPSBkb2MuZmlyc3QgKyBkb2Muc2l6ZTtcbiAgdmFyIGZyb20gPSBNYXRoLm1heCh1cGRhdGUudmlzaWJsZS5mcm9tIC0gY20ub3B0aW9ucy52aWV3cG9ydE1hcmdpbiwgZG9jLmZpcnN0KTtcbiAgdmFyIHRvID0gTWF0aC5taW4oZW5kLCB1cGRhdGUudmlzaWJsZS50byArIGNtLm9wdGlvbnMudmlld3BvcnRNYXJnaW4pO1xuICBpZiAoZGlzcGxheS52aWV3RnJvbSA8IGZyb20gJiYgZnJvbSAtIGRpc3BsYXkudmlld0Zyb20gPCAyMCkgeyBmcm9tID0gTWF0aC5tYXgoZG9jLmZpcnN0LCBkaXNwbGF5LnZpZXdGcm9tKTsgfVxuICBpZiAoZGlzcGxheS52aWV3VG8gPiB0byAmJiBkaXNwbGF5LnZpZXdUbyAtIHRvIDwgMjApIHsgdG8gPSBNYXRoLm1pbihlbmQsIGRpc3BsYXkudmlld1RvKTsgfVxuICBpZiAoc2F3Q29sbGFwc2VkU3BhbnMpIHtcbiAgICBmcm9tID0gdmlzdWFsTGluZU5vKGNtLmRvYywgZnJvbSk7XG4gICAgdG8gPSB2aXN1YWxMaW5lRW5kTm8oY20uZG9jLCB0byk7XG4gIH1cblxuICB2YXIgZGlmZmVyZW50ID0gZnJvbSAhPSBkaXNwbGF5LnZpZXdGcm9tIHx8IHRvICE9IGRpc3BsYXkudmlld1RvIHx8XG4gICAgZGlzcGxheS5sYXN0V3JhcEhlaWdodCAhPSB1cGRhdGUud3JhcHBlckhlaWdodCB8fCBkaXNwbGF5Lmxhc3RXcmFwV2lkdGggIT0gdXBkYXRlLndyYXBwZXJXaWR0aDtcbiAgYWRqdXN0VmlldyhjbSwgZnJvbSwgdG8pO1xuXG4gIGRpc3BsYXkudmlld09mZnNldCA9IGhlaWdodEF0TGluZShnZXRMaW5lKGNtLmRvYywgZGlzcGxheS52aWV3RnJvbSkpO1xuICAvLyBQb3NpdGlvbiB0aGUgbW92ZXIgZGl2IHRvIGFsaWduIHdpdGggdGhlIGN1cnJlbnQgc2Nyb2xsIHBvc2l0aW9uXG4gIGNtLmRpc3BsYXkubW92ZXIuc3R5bGUudG9wID0gZGlzcGxheS52aWV3T2Zmc2V0ICsgXCJweFwiO1xuXG4gIHZhciB0b1VwZGF0ZSA9IGNvdW50RGlydHlWaWV3KGNtKTtcbiAgaWYgKCFkaWZmZXJlbnQgJiYgdG9VcGRhdGUgPT0gMCAmJiAhdXBkYXRlLmZvcmNlICYmIGRpc3BsYXkucmVuZGVyZWRWaWV3ID09IGRpc3BsYXkudmlldyAmJlxuICAgICAgKGRpc3BsYXkudXBkYXRlTGluZU51bWJlcnMgPT0gbnVsbCB8fCBkaXNwbGF5LnVwZGF0ZUxpbmVOdW1iZXJzID49IGRpc3BsYXkudmlld1RvKSlcbiAgICB7IHJldHVybiBmYWxzZSB9XG5cbiAgLy8gRm9yIGJpZyBjaGFuZ2VzLCB3ZSBoaWRlIHRoZSBlbmNsb3NpbmcgZWxlbWVudCBkdXJpbmcgdGhlXG4gIC8vIHVwZGF0ZSwgc2luY2UgdGhhdCBzcGVlZHMgdXAgdGhlIG9wZXJhdGlvbnMgb24gbW9zdCBicm93c2Vycy5cbiAgdmFyIHNlbFNuYXBzaG90ID0gc2VsZWN0aW9uU25hcHNob3QoY20pO1xuICBpZiAodG9VcGRhdGUgPiA0KSB7IGRpc3BsYXkubGluZURpdi5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7IH1cbiAgcGF0Y2hEaXNwbGF5KGNtLCBkaXNwbGF5LnVwZGF0ZUxpbmVOdW1iZXJzLCB1cGRhdGUuZGltcyk7XG4gIGlmICh0b1VwZGF0ZSA+IDQpIHsgZGlzcGxheS5saW5lRGl2LnN0eWxlLmRpc3BsYXkgPSBcIlwiOyB9XG4gIGRpc3BsYXkucmVuZGVyZWRWaWV3ID0gZGlzcGxheS52aWV3O1xuICAvLyBUaGVyZSBtaWdodCBoYXZlIGJlZW4gYSB3aWRnZXQgd2l0aCBhIGZvY3VzZWQgZWxlbWVudCB0aGF0IGdvdFxuICAvLyBoaWRkZW4gb3IgdXBkYXRlZCwgaWYgc28gcmUtZm9jdXMgaXQuXG4gIHJlc3RvcmVTZWxlY3Rpb24oc2VsU25hcHNob3QpO1xuXG4gIC8vIFByZXZlbnQgc2VsZWN0aW9uIGFuZCBjdXJzb3JzIGZyb20gaW50ZXJmZXJpbmcgd2l0aCB0aGUgc2Nyb2xsXG4gIC8vIHdpZHRoIGFuZCBoZWlnaHQuXG4gIHJlbW92ZUNoaWxkcmVuKGRpc3BsYXkuY3Vyc29yRGl2KTtcbiAgcmVtb3ZlQ2hpbGRyZW4oZGlzcGxheS5zZWxlY3Rpb25EaXYpO1xuICBkaXNwbGF5Lmd1dHRlcnMuc3R5bGUuaGVpZ2h0ID0gZGlzcGxheS5zaXplci5zdHlsZS5taW5IZWlnaHQgPSAwO1xuXG4gIGlmIChkaWZmZXJlbnQpIHtcbiAgICBkaXNwbGF5Lmxhc3RXcmFwSGVpZ2h0ID0gdXBkYXRlLndyYXBwZXJIZWlnaHQ7XG4gICAgZGlzcGxheS5sYXN0V3JhcFdpZHRoID0gdXBkYXRlLndyYXBwZXJXaWR0aDtcbiAgICBzdGFydFdvcmtlcihjbSwgNDAwKTtcbiAgfVxuXG4gIGRpc3BsYXkudXBkYXRlTGluZU51bWJlcnMgPSBudWxsO1xuXG4gIHJldHVybiB0cnVlXG59XG5cbmZ1bmN0aW9uIHBvc3RVcGRhdGVEaXNwbGF5KGNtLCB1cGRhdGUpIHtcbiAgdmFyIHZpZXdwb3J0ID0gdXBkYXRlLnZpZXdwb3J0O1xuXG4gIGZvciAodmFyIGZpcnN0ID0gdHJ1ZTs7IGZpcnN0ID0gZmFsc2UpIHtcbiAgICBpZiAoIWZpcnN0IHx8ICFjbS5vcHRpb25zLmxpbmVXcmFwcGluZyB8fCB1cGRhdGUub2xkRGlzcGxheVdpZHRoID09IGRpc3BsYXlXaWR0aChjbSkpIHtcbiAgICAgIC8vIENsaXAgZm9yY2VkIHZpZXdwb3J0IHRvIGFjdHVhbCBzY3JvbGxhYmxlIGFyZWEuXG4gICAgICBpZiAodmlld3BvcnQgJiYgdmlld3BvcnQudG9wICE9IG51bGwpXG4gICAgICAgIHsgdmlld3BvcnQgPSB7dG9wOiBNYXRoLm1pbihjbS5kb2MuaGVpZ2h0ICsgcGFkZGluZ1ZlcnQoY20uZGlzcGxheSkgLSBkaXNwbGF5SGVpZ2h0KGNtKSwgdmlld3BvcnQudG9wKX07IH1cbiAgICAgIC8vIFVwZGF0ZWQgbGluZSBoZWlnaHRzIG1pZ2h0IHJlc3VsdCBpbiB0aGUgZHJhd24gYXJlYSBub3RcbiAgICAgIC8vIGFjdHVhbGx5IGNvdmVyaW5nIHRoZSB2aWV3cG9ydC4gS2VlcCBsb29waW5nIHVudGlsIGl0IGRvZXMuXG4gICAgICB1cGRhdGUudmlzaWJsZSA9IHZpc2libGVMaW5lcyhjbS5kaXNwbGF5LCBjbS5kb2MsIHZpZXdwb3J0KTtcbiAgICAgIGlmICh1cGRhdGUudmlzaWJsZS5mcm9tID49IGNtLmRpc3BsYXkudmlld0Zyb20gJiYgdXBkYXRlLnZpc2libGUudG8gPD0gY20uZGlzcGxheS52aWV3VG8pXG4gICAgICAgIHsgYnJlYWsgfVxuICAgIH1cbiAgICBpZiAoIXVwZGF0ZURpc3BsYXlJZk5lZWRlZChjbSwgdXBkYXRlKSkgeyBicmVhayB9XG4gICAgdXBkYXRlSGVpZ2h0c0luVmlld3BvcnQoY20pO1xuICAgIHZhciBiYXJNZWFzdXJlID0gbWVhc3VyZUZvclNjcm9sbGJhcnMoY20pO1xuICAgIHVwZGF0ZVNlbGVjdGlvbihjbSk7XG4gICAgdXBkYXRlU2Nyb2xsYmFycyhjbSwgYmFyTWVhc3VyZSk7XG4gICAgc2V0RG9jdW1lbnRIZWlnaHQoY20sIGJhck1lYXN1cmUpO1xuICAgIHVwZGF0ZS5mb3JjZSA9IGZhbHNlO1xuICB9XG5cbiAgdXBkYXRlLnNpZ25hbChjbSwgXCJ1cGRhdGVcIiwgY20pO1xuICBpZiAoY20uZGlzcGxheS52aWV3RnJvbSAhPSBjbS5kaXNwbGF5LnJlcG9ydGVkVmlld0Zyb20gfHwgY20uZGlzcGxheS52aWV3VG8gIT0gY20uZGlzcGxheS5yZXBvcnRlZFZpZXdUbykge1xuICAgIHVwZGF0ZS5zaWduYWwoY20sIFwidmlld3BvcnRDaGFuZ2VcIiwgY20sIGNtLmRpc3BsYXkudmlld0Zyb20sIGNtLmRpc3BsYXkudmlld1RvKTtcbiAgICBjbS5kaXNwbGF5LnJlcG9ydGVkVmlld0Zyb20gPSBjbS5kaXNwbGF5LnZpZXdGcm9tOyBjbS5kaXNwbGF5LnJlcG9ydGVkVmlld1RvID0gY20uZGlzcGxheS52aWV3VG87XG4gIH1cbn1cblxuZnVuY3Rpb24gdXBkYXRlRGlzcGxheVNpbXBsZShjbSwgdmlld3BvcnQpIHtcbiAgdmFyIHVwZGF0ZSA9IG5ldyBEaXNwbGF5VXBkYXRlKGNtLCB2aWV3cG9ydCk7XG4gIGlmICh1cGRhdGVEaXNwbGF5SWZOZWVkZWQoY20sIHVwZGF0ZSkpIHtcbiAgICB1cGRhdGVIZWlnaHRzSW5WaWV3cG9ydChjbSk7XG4gICAgcG9zdFVwZGF0ZURpc3BsYXkoY20sIHVwZGF0ZSk7XG4gICAgdmFyIGJhck1lYXN1cmUgPSBtZWFzdXJlRm9yU2Nyb2xsYmFycyhjbSk7XG4gICAgdXBkYXRlU2VsZWN0aW9uKGNtKTtcbiAgICB1cGRhdGVTY3JvbGxiYXJzKGNtLCBiYXJNZWFzdXJlKTtcbiAgICBzZXREb2N1bWVudEhlaWdodChjbSwgYmFyTWVhc3VyZSk7XG4gICAgdXBkYXRlLmZpbmlzaCgpO1xuICB9XG59XG5cbi8vIFN5bmMgdGhlIGFjdHVhbCBkaXNwbGF5IERPTSBzdHJ1Y3R1cmUgd2l0aCBkaXNwbGF5LnZpZXcsIHJlbW92aW5nXG4vLyBub2RlcyBmb3IgbGluZXMgdGhhdCBhcmUgbm8gbG9uZ2VyIGluIHZpZXcsIGFuZCBjcmVhdGluZyB0aGUgb25lc1xuLy8gdGhhdCBhcmUgbm90IHRoZXJlIHlldCwgYW5kIHVwZGF0aW5nIHRoZSBvbmVzIHRoYXQgYXJlIG91dCBvZlxuLy8gZGF0ZS5cbmZ1bmN0aW9uIHBhdGNoRGlzcGxheShjbSwgdXBkYXRlTnVtYmVyc0Zyb20sIGRpbXMpIHtcbiAgdmFyIGRpc3BsYXkgPSBjbS5kaXNwbGF5LCBsaW5lTnVtYmVycyA9IGNtLm9wdGlvbnMubGluZU51bWJlcnM7XG4gIHZhciBjb250YWluZXIgPSBkaXNwbGF5LmxpbmVEaXYsIGN1ciA9IGNvbnRhaW5lci5maXJzdENoaWxkO1xuXG4gIGZ1bmN0aW9uIHJtKG5vZGUpIHtcbiAgICB2YXIgbmV4dCA9IG5vZGUubmV4dFNpYmxpbmc7XG4gICAgLy8gV29ya3MgYXJvdW5kIGEgdGhyb3ctc2Nyb2xsIGJ1ZyBpbiBPUyBYIFdlYmtpdFxuICAgIGlmICh3ZWJraXQgJiYgbWFjICYmIGNtLmRpc3BsYXkuY3VycmVudFdoZWVsVGFyZ2V0ID09IG5vZGUpXG4gICAgICB7IG5vZGUuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiOyB9XG4gICAgZWxzZVxuICAgICAgeyBub2RlLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQobm9kZSk7IH1cbiAgICByZXR1cm4gbmV4dFxuICB9XG5cbiAgdmFyIHZpZXcgPSBkaXNwbGF5LnZpZXcsIGxpbmVOID0gZGlzcGxheS52aWV3RnJvbTtcbiAgLy8gTG9vcCBvdmVyIHRoZSBlbGVtZW50cyBpbiB0aGUgdmlldywgc3luY2luZyBjdXIgKHRoZSBET00gbm9kZXNcbiAgLy8gaW4gZGlzcGxheS5saW5lRGl2KSB3aXRoIHRoZSB2aWV3IGFzIHdlIGdvLlxuICBmb3IgKHZhciBpID0gMDsgaSA8IHZpZXcubGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgbGluZVZpZXcgPSB2aWV3W2ldO1xuICAgIGlmIChsaW5lVmlldy5oaWRkZW4pIHtcbiAgICB9IGVsc2UgaWYgKCFsaW5lVmlldy5ub2RlIHx8IGxpbmVWaWV3Lm5vZGUucGFyZW50Tm9kZSAhPSBjb250YWluZXIpIHsgLy8gTm90IGRyYXduIHlldFxuICAgICAgdmFyIG5vZGUgPSBidWlsZExpbmVFbGVtZW50KGNtLCBsaW5lVmlldywgbGluZU4sIGRpbXMpO1xuICAgICAgY29udGFpbmVyLmluc2VydEJlZm9yZShub2RlLCBjdXIpO1xuICAgIH0gZWxzZSB7IC8vIEFscmVhZHkgZHJhd25cbiAgICAgIHdoaWxlIChjdXIgIT0gbGluZVZpZXcubm9kZSkgeyBjdXIgPSBybShjdXIpOyB9XG4gICAgICB2YXIgdXBkYXRlTnVtYmVyID0gbGluZU51bWJlcnMgJiYgdXBkYXRlTnVtYmVyc0Zyb20gIT0gbnVsbCAmJlxuICAgICAgICB1cGRhdGVOdW1iZXJzRnJvbSA8PSBsaW5lTiAmJiBsaW5lVmlldy5saW5lTnVtYmVyO1xuICAgICAgaWYgKGxpbmVWaWV3LmNoYW5nZXMpIHtcbiAgICAgICAgaWYgKGluZGV4T2YobGluZVZpZXcuY2hhbmdlcywgXCJndXR0ZXJcIikgPiAtMSkgeyB1cGRhdGVOdW1iZXIgPSBmYWxzZTsgfVxuICAgICAgICB1cGRhdGVMaW5lRm9yQ2hhbmdlcyhjbSwgbGluZVZpZXcsIGxpbmVOLCBkaW1zKTtcbiAgICAgIH1cbiAgICAgIGlmICh1cGRhdGVOdW1iZXIpIHtcbiAgICAgICAgcmVtb3ZlQ2hpbGRyZW4obGluZVZpZXcubGluZU51bWJlcik7XG4gICAgICAgIGxpbmVWaWV3LmxpbmVOdW1iZXIuYXBwZW5kQ2hpbGQoZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUobGluZU51bWJlckZvcihjbS5vcHRpb25zLCBsaW5lTikpKTtcbiAgICAgIH1cbiAgICAgIGN1ciA9IGxpbmVWaWV3Lm5vZGUubmV4dFNpYmxpbmc7XG4gICAgfVxuICAgIGxpbmVOICs9IGxpbmVWaWV3LnNpemU7XG4gIH1cbiAgd2hpbGUgKGN1cikgeyBjdXIgPSBybShjdXIpOyB9XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZUd1dHRlclNwYWNlKGNtKSB7XG4gIHZhciB3aWR0aCA9IGNtLmRpc3BsYXkuZ3V0dGVycy5vZmZzZXRXaWR0aDtcbiAgY20uZGlzcGxheS5zaXplci5zdHlsZS5tYXJnaW5MZWZ0ID0gd2lkdGggKyBcInB4XCI7XG59XG5cbmZ1bmN0aW9uIHNldERvY3VtZW50SGVpZ2h0KGNtLCBtZWFzdXJlKSB7XG4gIGNtLmRpc3BsYXkuc2l6ZXIuc3R5bGUubWluSGVpZ2h0ID0gbWVhc3VyZS5kb2NIZWlnaHQgKyBcInB4XCI7XG4gIGNtLmRpc3BsYXkuaGVpZ2h0Rm9yY2VyLnN0eWxlLnRvcCA9IG1lYXN1cmUuZG9jSGVpZ2h0ICsgXCJweFwiO1xuICBjbS5kaXNwbGF5Lmd1dHRlcnMuc3R5bGUuaGVpZ2h0ID0gKG1lYXN1cmUuZG9jSGVpZ2h0ICsgY20uZGlzcGxheS5iYXJIZWlnaHQgKyBzY3JvbGxHYXAoY20pKSArIFwicHhcIjtcbn1cblxuLy8gUmVidWlsZCB0aGUgZ3V0dGVyIGVsZW1lbnRzLCBlbnN1cmUgdGhlIG1hcmdpbiB0byB0aGUgbGVmdCBvZiB0aGVcbi8vIGNvZGUgbWF0Y2hlcyB0aGVpciB3aWR0aC5cbmZ1bmN0aW9uIHVwZGF0ZUd1dHRlcnMoY20pIHtcbiAgdmFyIGd1dHRlcnMgPSBjbS5kaXNwbGF5Lmd1dHRlcnMsIHNwZWNzID0gY20ub3B0aW9ucy5ndXR0ZXJzO1xuICByZW1vdmVDaGlsZHJlbihndXR0ZXJzKTtcbiAgdmFyIGkgPSAwO1xuICBmb3IgKDsgaSA8IHNwZWNzLmxlbmd0aDsgKytpKSB7XG4gICAgdmFyIGd1dHRlckNsYXNzID0gc3BlY3NbaV07XG4gICAgdmFyIGdFbHQgPSBndXR0ZXJzLmFwcGVuZENoaWxkKGVsdChcImRpdlwiLCBudWxsLCBcIkNvZGVNaXJyb3ItZ3V0dGVyIFwiICsgZ3V0dGVyQ2xhc3MpKTtcbiAgICBpZiAoZ3V0dGVyQ2xhc3MgPT0gXCJDb2RlTWlycm9yLWxpbmVudW1iZXJzXCIpIHtcbiAgICAgIGNtLmRpc3BsYXkubGluZUd1dHRlciA9IGdFbHQ7XG4gICAgICBnRWx0LnN0eWxlLndpZHRoID0gKGNtLmRpc3BsYXkubGluZU51bVdpZHRoIHx8IDEpICsgXCJweFwiO1xuICAgIH1cbiAgfVxuICBndXR0ZXJzLnN0eWxlLmRpc3BsYXkgPSBpID8gXCJcIiA6IFwibm9uZVwiO1xuICB1cGRhdGVHdXR0ZXJTcGFjZShjbSk7XG59XG5cbi8vIE1ha2Ugc3VyZSB0aGUgZ3V0dGVycyBvcHRpb25zIGNvbnRhaW5zIHRoZSBlbGVtZW50XG4vLyBcIkNvZGVNaXJyb3ItbGluZW51bWJlcnNcIiB3aGVuIHRoZSBsaW5lTnVtYmVycyBvcHRpb24gaXMgdHJ1ZS5cbmZ1bmN0aW9uIHNldEd1dHRlcnNGb3JMaW5lTnVtYmVycyhvcHRpb25zKSB7XG4gIHZhciBmb3VuZCA9IGluZGV4T2Yob3B0aW9ucy5ndXR0ZXJzLCBcIkNvZGVNaXJyb3ItbGluZW51bWJlcnNcIik7XG4gIGlmIChmb3VuZCA9PSAtMSAmJiBvcHRpb25zLmxpbmVOdW1iZXJzKSB7XG4gICAgb3B0aW9ucy5ndXR0ZXJzID0gb3B0aW9ucy5ndXR0ZXJzLmNvbmNhdChbXCJDb2RlTWlycm9yLWxpbmVudW1iZXJzXCJdKTtcbiAgfSBlbHNlIGlmIChmb3VuZCA+IC0xICYmICFvcHRpb25zLmxpbmVOdW1iZXJzKSB7XG4gICAgb3B0aW9ucy5ndXR0ZXJzID0gb3B0aW9ucy5ndXR0ZXJzLnNsaWNlKDApO1xuICAgIG9wdGlvbnMuZ3V0dGVycy5zcGxpY2UoZm91bmQsIDEpO1xuICB9XG59XG5cbi8vIFNpbmNlIHRoZSBkZWx0YSB2YWx1ZXMgcmVwb3J0ZWQgb24gbW91c2Ugd2hlZWwgZXZlbnRzIGFyZVxuLy8gdW5zdGFuZGFyZGl6ZWQgYmV0d2VlbiBicm93c2VycyBhbmQgZXZlbiBicm93c2VyIHZlcnNpb25zLCBhbmRcbi8vIGdlbmVyYWxseSBob3JyaWJseSB1bnByZWRpY3RhYmxlLCB0aGlzIGNvZGUgc3RhcnRzIGJ5IG1lYXN1cmluZ1xuLy8gdGhlIHNjcm9sbCBlZmZlY3QgdGhhdCB0aGUgZmlyc3QgZmV3IG1vdXNlIHdoZWVsIGV2ZW50cyBoYXZlLFxuLy8gYW5kLCBmcm9tIHRoYXQsIGRldGVjdHMgdGhlIHdheSBpdCBjYW4gY29udmVydCBkZWx0YXMgdG8gcGl4ZWxcbi8vIG9mZnNldHMgYWZ0ZXJ3YXJkcy5cbi8vXG4vLyBUaGUgcmVhc29uIHdlIHdhbnQgdG8ga25vdyB0aGUgYW1vdW50IGEgd2hlZWwgZXZlbnQgd2lsbCBzY3JvbGxcbi8vIGlzIHRoYXQgaXQgZ2l2ZXMgdXMgYSBjaGFuY2UgdG8gdXBkYXRlIHRoZSBkaXNwbGF5IGJlZm9yZSB0aGVcbi8vIGFjdHVhbCBzY3JvbGxpbmcgaGFwcGVucywgcmVkdWNpbmcgZmxpY2tlcmluZy5cblxudmFyIHdoZWVsU2FtcGxlcyA9IDA7XG52YXIgd2hlZWxQaXhlbHNQZXJVbml0ID0gbnVsbDtcbi8vIEZpbGwgaW4gYSBicm93c2VyLWRldGVjdGVkIHN0YXJ0aW5nIHZhbHVlIG9uIGJyb3dzZXJzIHdoZXJlIHdlXG4vLyBrbm93IG9uZS4gVGhlc2UgZG9uJ3QgaGF2ZSB0byBiZSBhY2N1cmF0ZSAtLSB0aGUgcmVzdWx0IG9mIHRoZW1cbi8vIGJlaW5nIHdyb25nIHdvdWxkIGp1c3QgYmUgYSBzbGlnaHQgZmxpY2tlciBvbiB0aGUgZmlyc3Qgd2hlZWxcbi8vIHNjcm9sbCAoaWYgaXQgaXMgbGFyZ2UgZW5vdWdoKS5cbmlmIChpZSkgeyB3aGVlbFBpeGVsc1BlclVuaXQgPSAtLjUzOyB9XG5lbHNlIGlmIChnZWNrbykgeyB3aGVlbFBpeGVsc1BlclVuaXQgPSAxNTsgfVxuZWxzZSBpZiAoY2hyb21lKSB7IHdoZWVsUGl4ZWxzUGVyVW5pdCA9IC0uNzsgfVxuZWxzZSBpZiAoc2FmYXJpKSB7IHdoZWVsUGl4ZWxzUGVyVW5pdCA9IC0xLzM7IH1cblxuZnVuY3Rpb24gd2hlZWxFdmVudERlbHRhKGUpIHtcbiAgdmFyIGR4ID0gZS53aGVlbERlbHRhWCwgZHkgPSBlLndoZWVsRGVsdGFZO1xuICBpZiAoZHggPT0gbnVsbCAmJiBlLmRldGFpbCAmJiBlLmF4aXMgPT0gZS5IT1JJWk9OVEFMX0FYSVMpIHsgZHggPSBlLmRldGFpbDsgfVxuICBpZiAoZHkgPT0gbnVsbCAmJiBlLmRldGFpbCAmJiBlLmF4aXMgPT0gZS5WRVJUSUNBTF9BWElTKSB7IGR5ID0gZS5kZXRhaWw7IH1cbiAgZWxzZSBpZiAoZHkgPT0gbnVsbCkgeyBkeSA9IGUud2hlZWxEZWx0YTsgfVxuICByZXR1cm4ge3g6IGR4LCB5OiBkeX1cbn1cbmZ1bmN0aW9uIHdoZWVsRXZlbnRQaXhlbHMoZSkge1xuICB2YXIgZGVsdGEgPSB3aGVlbEV2ZW50RGVsdGEoZSk7XG4gIGRlbHRhLnggKj0gd2hlZWxQaXhlbHNQZXJVbml0O1xuICBkZWx0YS55ICo9IHdoZWVsUGl4ZWxzUGVyVW5pdDtcbiAgcmV0dXJuIGRlbHRhXG59XG5cbmZ1bmN0aW9uIG9uU2Nyb2xsV2hlZWwoY20sIGUpIHtcbiAgdmFyIGRlbHRhID0gd2hlZWxFdmVudERlbHRhKGUpLCBkeCA9IGRlbHRhLngsIGR5ID0gZGVsdGEueTtcblxuICB2YXIgZGlzcGxheSA9IGNtLmRpc3BsYXksIHNjcm9sbCA9IGRpc3BsYXkuc2Nyb2xsZXI7XG4gIC8vIFF1aXQgaWYgdGhlcmUncyBub3RoaW5nIHRvIHNjcm9sbCBoZXJlXG4gIHZhciBjYW5TY3JvbGxYID0gc2Nyb2xsLnNjcm9sbFdpZHRoID4gc2Nyb2xsLmNsaWVudFdpZHRoO1xuICB2YXIgY2FuU2Nyb2xsWSA9IHNjcm9sbC5zY3JvbGxIZWlnaHQgPiBzY3JvbGwuY2xpZW50SGVpZ2h0O1xuICBpZiAoIShkeCAmJiBjYW5TY3JvbGxYIHx8IGR5ICYmIGNhblNjcm9sbFkpKSB7IHJldHVybiB9XG5cbiAgLy8gV2Via2l0IGJyb3dzZXJzIG9uIE9TIFggYWJvcnQgbW9tZW50dW0gc2Nyb2xscyB3aGVuIHRoZSB0YXJnZXRcbiAgLy8gb2YgdGhlIHNjcm9sbCBldmVudCBpcyByZW1vdmVkIGZyb20gdGhlIHNjcm9sbGFibGUgZWxlbWVudC5cbiAgLy8gVGhpcyBoYWNrIChzZWUgcmVsYXRlZCBjb2RlIGluIHBhdGNoRGlzcGxheSkgbWFrZXMgc3VyZSB0aGVcbiAgLy8gZWxlbWVudCBpcyBrZXB0IGFyb3VuZC5cbiAgaWYgKGR5ICYmIG1hYyAmJiB3ZWJraXQpIHtcbiAgICBvdXRlcjogZm9yICh2YXIgY3VyID0gZS50YXJnZXQsIHZpZXcgPSBkaXNwbGF5LnZpZXc7IGN1ciAhPSBzY3JvbGw7IGN1ciA9IGN1ci5wYXJlbnROb2RlKSB7XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHZpZXcubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKHZpZXdbaV0ubm9kZSA9PSBjdXIpIHtcbiAgICAgICAgICBjbS5kaXNwbGF5LmN1cnJlbnRXaGVlbFRhcmdldCA9IGN1cjtcbiAgICAgICAgICBicmVhayBvdXRlclxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gT24gc29tZSBicm93c2VycywgaG9yaXpvbnRhbCBzY3JvbGxpbmcgd2lsbCBjYXVzZSByZWRyYXdzIHRvXG4gIC8vIGhhcHBlbiBiZWZvcmUgdGhlIGd1dHRlciBoYXMgYmVlbiByZWFsaWduZWQsIGNhdXNpbmcgaXQgdG9cbiAgLy8gd3JpZ2dsZSBhcm91bmQgaW4gYSBtb3N0IHVuc2VlbWx5IHdheS4gV2hlbiB3ZSBoYXZlIGFuXG4gIC8vIGVzdGltYXRlZCBwaXhlbHMvZGVsdGEgdmFsdWUsIHdlIGp1c3QgaGFuZGxlIGhvcml6b250YWxcbiAgLy8gc2Nyb2xsaW5nIGVudGlyZWx5IGhlcmUuIEl0J2xsIGJlIHNsaWdodGx5IG9mZiBmcm9tIG5hdGl2ZSwgYnV0XG4gIC8vIGJldHRlciB0aGFuIGdsaXRjaGluZyBvdXQuXG4gIGlmIChkeCAmJiAhZ2Vja28gJiYgIXByZXN0byAmJiB3aGVlbFBpeGVsc1BlclVuaXQgIT0gbnVsbCkge1xuICAgIGlmIChkeSAmJiBjYW5TY3JvbGxZKVxuICAgICAgeyB1cGRhdGVTY3JvbGxUb3AoY20sIE1hdGgubWF4KDAsIHNjcm9sbC5zY3JvbGxUb3AgKyBkeSAqIHdoZWVsUGl4ZWxzUGVyVW5pdCkpOyB9XG4gICAgc2V0U2Nyb2xsTGVmdChjbSwgTWF0aC5tYXgoMCwgc2Nyb2xsLnNjcm9sbExlZnQgKyBkeCAqIHdoZWVsUGl4ZWxzUGVyVW5pdCkpO1xuICAgIC8vIE9ubHkgcHJldmVudCBkZWZhdWx0IHNjcm9sbGluZyBpZiB2ZXJ0aWNhbCBzY3JvbGxpbmcgaXNcbiAgICAvLyBhY3R1YWxseSBwb3NzaWJsZS4gT3RoZXJ3aXNlLCBpdCBjYXVzZXMgdmVydGljYWwgc2Nyb2xsXG4gICAgLy8gaml0dGVyIG9uIE9TWCB0cmFja3BhZHMgd2hlbiBkZWx0YVggaXMgc21hbGwgYW5kIGRlbHRhWVxuICAgIC8vIGlzIGxhcmdlIChpc3N1ZSAjMzU3OSlcbiAgICBpZiAoIWR5IHx8IChkeSAmJiBjYW5TY3JvbGxZKSlcbiAgICAgIHsgZV9wcmV2ZW50RGVmYXVsdChlKTsgfVxuICAgIGRpc3BsYXkud2hlZWxTdGFydFggPSBudWxsOyAvLyBBYm9ydCBtZWFzdXJlbWVudCwgaWYgaW4gcHJvZ3Jlc3NcbiAgICByZXR1cm5cbiAgfVxuXG4gIC8vICdQcm9qZWN0JyB0aGUgdmlzaWJsZSB2aWV3cG9ydCB0byBjb3ZlciB0aGUgYXJlYSB0aGF0IGlzIGJlaW5nXG4gIC8vIHNjcm9sbGVkIGludG8gdmlldyAoaWYgd2Uga25vdyBlbm91Z2ggdG8gZXN0aW1hdGUgaXQpLlxuICBpZiAoZHkgJiYgd2hlZWxQaXhlbHNQZXJVbml0ICE9IG51bGwpIHtcbiAgICB2YXIgcGl4ZWxzID0gZHkgKiB3aGVlbFBpeGVsc1BlclVuaXQ7XG4gICAgdmFyIHRvcCA9IGNtLmRvYy5zY3JvbGxUb3AsIGJvdCA9IHRvcCArIGRpc3BsYXkud3JhcHBlci5jbGllbnRIZWlnaHQ7XG4gICAgaWYgKHBpeGVscyA8IDApIHsgdG9wID0gTWF0aC5tYXgoMCwgdG9wICsgcGl4ZWxzIC0gNTApOyB9XG4gICAgZWxzZSB7IGJvdCA9IE1hdGgubWluKGNtLmRvYy5oZWlnaHQsIGJvdCArIHBpeGVscyArIDUwKTsgfVxuICAgIHVwZGF0ZURpc3BsYXlTaW1wbGUoY20sIHt0b3A6IHRvcCwgYm90dG9tOiBib3R9KTtcbiAgfVxuXG4gIGlmICh3aGVlbFNhbXBsZXMgPCAyMCkge1xuICAgIGlmIChkaXNwbGF5LndoZWVsU3RhcnRYID09IG51bGwpIHtcbiAgICAgIGRpc3BsYXkud2hlZWxTdGFydFggPSBzY3JvbGwuc2Nyb2xsTGVmdDsgZGlzcGxheS53aGVlbFN0YXJ0WSA9IHNjcm9sbC5zY3JvbGxUb3A7XG4gICAgICBkaXNwbGF5LndoZWVsRFggPSBkeDsgZGlzcGxheS53aGVlbERZID0gZHk7XG4gICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKGRpc3BsYXkud2hlZWxTdGFydFggPT0gbnVsbCkgeyByZXR1cm4gfVxuICAgICAgICB2YXIgbW92ZWRYID0gc2Nyb2xsLnNjcm9sbExlZnQgLSBkaXNwbGF5LndoZWVsU3RhcnRYO1xuICAgICAgICB2YXIgbW92ZWRZID0gc2Nyb2xsLnNjcm9sbFRvcCAtIGRpc3BsYXkud2hlZWxTdGFydFk7XG4gICAgICAgIHZhciBzYW1wbGUgPSAobW92ZWRZICYmIGRpc3BsYXkud2hlZWxEWSAmJiBtb3ZlZFkgLyBkaXNwbGF5LndoZWVsRFkpIHx8XG4gICAgICAgICAgKG1vdmVkWCAmJiBkaXNwbGF5LndoZWVsRFggJiYgbW92ZWRYIC8gZGlzcGxheS53aGVlbERYKTtcbiAgICAgICAgZGlzcGxheS53aGVlbFN0YXJ0WCA9IGRpc3BsYXkud2hlZWxTdGFydFkgPSBudWxsO1xuICAgICAgICBpZiAoIXNhbXBsZSkgeyByZXR1cm4gfVxuICAgICAgICB3aGVlbFBpeGVsc1BlclVuaXQgPSAod2hlZWxQaXhlbHNQZXJVbml0ICogd2hlZWxTYW1wbGVzICsgc2FtcGxlKSAvICh3aGVlbFNhbXBsZXMgKyAxKTtcbiAgICAgICAgKyt3aGVlbFNhbXBsZXM7XG4gICAgICB9LCAyMDApO1xuICAgIH0gZWxzZSB7XG4gICAgICBkaXNwbGF5LndoZWVsRFggKz0gZHg7IGRpc3BsYXkud2hlZWxEWSArPSBkeTtcbiAgICB9XG4gIH1cbn1cblxuLy8gU2VsZWN0aW9uIG9iamVjdHMgYXJlIGltbXV0YWJsZS4gQSBuZXcgb25lIGlzIGNyZWF0ZWQgZXZlcnkgdGltZVxuLy8gdGhlIHNlbGVjdGlvbiBjaGFuZ2VzLiBBIHNlbGVjdGlvbiBpcyBvbmUgb3IgbW9yZSBub24tb3ZlcmxhcHBpbmdcbi8vIChhbmQgbm9uLXRvdWNoaW5nKSByYW5nZXMsIHNvcnRlZCwgYW5kIGFuIGludGVnZXIgdGhhdCBpbmRpY2F0ZXNcbi8vIHdoaWNoIG9uZSBpcyB0aGUgcHJpbWFyeSBzZWxlY3Rpb24gKHRoZSBvbmUgdGhhdCdzIHNjcm9sbGVkIGludG9cbi8vIHZpZXcsIHRoYXQgZ2V0Q3Vyc29yIHJldHVybnMsIGV0YykuXG52YXIgU2VsZWN0aW9uID0gZnVuY3Rpb24ocmFuZ2VzLCBwcmltSW5kZXgpIHtcbiAgdGhpcy5yYW5nZXMgPSByYW5nZXM7XG4gIHRoaXMucHJpbUluZGV4ID0gcHJpbUluZGV4O1xufTtcblxuU2VsZWN0aW9uLnByb3RvdHlwZS5wcmltYXJ5ID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gdGhpcy5yYW5nZXNbdGhpcy5wcmltSW5kZXhdIH07XG5cblNlbGVjdGlvbi5wcm90b3R5cGUuZXF1YWxzID0gZnVuY3Rpb24gKG90aGVyKSB7XG4gICAgdmFyIHRoaXMkMSA9IHRoaXM7XG5cbiAgaWYgKG90aGVyID09IHRoaXMpIHsgcmV0dXJuIHRydWUgfVxuICBpZiAob3RoZXIucHJpbUluZGV4ICE9IHRoaXMucHJpbUluZGV4IHx8IG90aGVyLnJhbmdlcy5sZW5ndGggIT0gdGhpcy5yYW5nZXMubGVuZ3RoKSB7IHJldHVybiBmYWxzZSB9XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5yYW5nZXMubGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgaGVyZSA9IHRoaXMkMS5yYW5nZXNbaV0sIHRoZXJlID0gb3RoZXIucmFuZ2VzW2ldO1xuICAgIGlmICghZXF1YWxDdXJzb3JQb3MoaGVyZS5hbmNob3IsIHRoZXJlLmFuY2hvcikgfHwgIWVxdWFsQ3Vyc29yUG9zKGhlcmUuaGVhZCwgdGhlcmUuaGVhZCkpIHsgcmV0dXJuIGZhbHNlIH1cbiAgfVxuICByZXR1cm4gdHJ1ZVxufTtcblxuU2VsZWN0aW9uLnByb3RvdHlwZS5kZWVwQ29weSA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgdGhpcyQxID0gdGhpcztcblxuICB2YXIgb3V0ID0gW107XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5yYW5nZXMubGVuZ3RoOyBpKyspXG4gICAgeyBvdXRbaV0gPSBuZXcgUmFuZ2UoY29weVBvcyh0aGlzJDEucmFuZ2VzW2ldLmFuY2hvciksIGNvcHlQb3ModGhpcyQxLnJhbmdlc1tpXS5oZWFkKSk7IH1cbiAgcmV0dXJuIG5ldyBTZWxlY3Rpb24ob3V0LCB0aGlzLnByaW1JbmRleClcbn07XG5cblNlbGVjdGlvbi5wcm90b3R5cGUuc29tZXRoaW5nU2VsZWN0ZWQgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHRoaXMkMSA9IHRoaXM7XG5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLnJhbmdlcy5sZW5ndGg7IGkrKylcbiAgICB7IGlmICghdGhpcyQxLnJhbmdlc1tpXS5lbXB0eSgpKSB7IHJldHVybiB0cnVlIH0gfVxuICByZXR1cm4gZmFsc2Vcbn07XG5cblNlbGVjdGlvbi5wcm90b3R5cGUuY29udGFpbnMgPSBmdW5jdGlvbiAocG9zLCBlbmQpIHtcbiAgICB2YXIgdGhpcyQxID0gdGhpcztcblxuICBpZiAoIWVuZCkgeyBlbmQgPSBwb3M7IH1cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLnJhbmdlcy5sZW5ndGg7IGkrKykge1xuICAgIHZhciByYW5nZSA9IHRoaXMkMS5yYW5nZXNbaV07XG4gICAgaWYgKGNtcChlbmQsIHJhbmdlLmZyb20oKSkgPj0gMCAmJiBjbXAocG9zLCByYW5nZS50bygpKSA8PSAwKVxuICAgICAgeyByZXR1cm4gaSB9XG4gIH1cbiAgcmV0dXJuIC0xXG59O1xuXG52YXIgUmFuZ2UgPSBmdW5jdGlvbihhbmNob3IsIGhlYWQpIHtcbiAgdGhpcy5hbmNob3IgPSBhbmNob3I7IHRoaXMuaGVhZCA9IGhlYWQ7XG59O1xuXG5SYW5nZS5wcm90b3R5cGUuZnJvbSA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuIG1pblBvcyh0aGlzLmFuY2hvciwgdGhpcy5oZWFkKSB9O1xuUmFuZ2UucHJvdG90eXBlLnRvID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gbWF4UG9zKHRoaXMuYW5jaG9yLCB0aGlzLmhlYWQpIH07XG5SYW5nZS5wcm90b3R5cGUuZW1wdHkgPSBmdW5jdGlvbiAoKSB7IHJldHVybiB0aGlzLmhlYWQubGluZSA9PSB0aGlzLmFuY2hvci5saW5lICYmIHRoaXMuaGVhZC5jaCA9PSB0aGlzLmFuY2hvci5jaCB9O1xuXG4vLyBUYWtlIGFuIHVuc29ydGVkLCBwb3RlbnRpYWxseSBvdmVybGFwcGluZyBzZXQgb2YgcmFuZ2VzLCBhbmRcbi8vIGJ1aWxkIGEgc2VsZWN0aW9uIG91dCBvZiBpdC4gJ0NvbnN1bWVzJyByYW5nZXMgYXJyYXkgKG1vZGlmeWluZ1xuLy8gaXQpLlxuZnVuY3Rpb24gbm9ybWFsaXplU2VsZWN0aW9uKHJhbmdlcywgcHJpbUluZGV4KSB7XG4gIHZhciBwcmltID0gcmFuZ2VzW3ByaW1JbmRleF07XG4gIHJhbmdlcy5zb3J0KGZ1bmN0aW9uIChhLCBiKSB7IHJldHVybiBjbXAoYS5mcm9tKCksIGIuZnJvbSgpKTsgfSk7XG4gIHByaW1JbmRleCA9IGluZGV4T2YocmFuZ2VzLCBwcmltKTtcbiAgZm9yICh2YXIgaSA9IDE7IGkgPCByYW5nZXMubGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgY3VyID0gcmFuZ2VzW2ldLCBwcmV2ID0gcmFuZ2VzW2kgLSAxXTtcbiAgICBpZiAoY21wKHByZXYudG8oKSwgY3VyLmZyb20oKSkgPj0gMCkge1xuICAgICAgdmFyIGZyb20gPSBtaW5Qb3MocHJldi5mcm9tKCksIGN1ci5mcm9tKCkpLCB0byA9IG1heFBvcyhwcmV2LnRvKCksIGN1ci50bygpKTtcbiAgICAgIHZhciBpbnYgPSBwcmV2LmVtcHR5KCkgPyBjdXIuZnJvbSgpID09IGN1ci5oZWFkIDogcHJldi5mcm9tKCkgPT0gcHJldi5oZWFkO1xuICAgICAgaWYgKGkgPD0gcHJpbUluZGV4KSB7IC0tcHJpbUluZGV4OyB9XG4gICAgICByYW5nZXMuc3BsaWNlKC0taSwgMiwgbmV3IFJhbmdlKGludiA/IHRvIDogZnJvbSwgaW52ID8gZnJvbSA6IHRvKSk7XG4gICAgfVxuICB9XG4gIHJldHVybiBuZXcgU2VsZWN0aW9uKHJhbmdlcywgcHJpbUluZGV4KVxufVxuXG5mdW5jdGlvbiBzaW1wbGVTZWxlY3Rpb24oYW5jaG9yLCBoZWFkKSB7XG4gIHJldHVybiBuZXcgU2VsZWN0aW9uKFtuZXcgUmFuZ2UoYW5jaG9yLCBoZWFkIHx8IGFuY2hvcildLCAwKVxufVxuXG4vLyBDb21wdXRlIHRoZSBwb3NpdGlvbiBvZiB0aGUgZW5kIG9mIGEgY2hhbmdlIChpdHMgJ3RvJyBwcm9wZXJ0eVxuLy8gcmVmZXJzIHRvIHRoZSBwcmUtY2hhbmdlIGVuZCkuXG5mdW5jdGlvbiBjaGFuZ2VFbmQoY2hhbmdlKSB7XG4gIGlmICghY2hhbmdlLnRleHQpIHsgcmV0dXJuIGNoYW5nZS50byB9XG4gIHJldHVybiBQb3MoY2hhbmdlLmZyb20ubGluZSArIGNoYW5nZS50ZXh0Lmxlbmd0aCAtIDEsXG4gICAgICAgICAgICAgbHN0KGNoYW5nZS50ZXh0KS5sZW5ndGggKyAoY2hhbmdlLnRleHQubGVuZ3RoID09IDEgPyBjaGFuZ2UuZnJvbS5jaCA6IDApKVxufVxuXG4vLyBBZGp1c3QgYSBwb3NpdGlvbiB0byByZWZlciB0byB0aGUgcG9zdC1jaGFuZ2UgcG9zaXRpb24gb2YgdGhlXG4vLyBzYW1lIHRleHQsIG9yIHRoZSBlbmQgb2YgdGhlIGNoYW5nZSBpZiB0aGUgY2hhbmdlIGNvdmVycyBpdC5cbmZ1bmN0aW9uIGFkanVzdEZvckNoYW5nZShwb3MsIGNoYW5nZSkge1xuICBpZiAoY21wKHBvcywgY2hhbmdlLmZyb20pIDwgMCkgeyByZXR1cm4gcG9zIH1cbiAgaWYgKGNtcChwb3MsIGNoYW5nZS50bykgPD0gMCkgeyByZXR1cm4gY2hhbmdlRW5kKGNoYW5nZSkgfVxuXG4gIHZhciBsaW5lID0gcG9zLmxpbmUgKyBjaGFuZ2UudGV4dC5sZW5ndGggLSAoY2hhbmdlLnRvLmxpbmUgLSBjaGFuZ2UuZnJvbS5saW5lKSAtIDEsIGNoID0gcG9zLmNoO1xuICBpZiAocG9zLmxpbmUgPT0gY2hhbmdlLnRvLmxpbmUpIHsgY2ggKz0gY2hhbmdlRW5kKGNoYW5nZSkuY2ggLSBjaGFuZ2UudG8uY2g7IH1cbiAgcmV0dXJuIFBvcyhsaW5lLCBjaClcbn1cblxuZnVuY3Rpb24gY29tcHV0ZVNlbEFmdGVyQ2hhbmdlKGRvYywgY2hhbmdlKSB7XG4gIHZhciBvdXQgPSBbXTtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBkb2Muc2VsLnJhbmdlcy5sZW5ndGg7IGkrKykge1xuICAgIHZhciByYW5nZSA9IGRvYy5zZWwucmFuZ2VzW2ldO1xuICAgIG91dC5wdXNoKG5ldyBSYW5nZShhZGp1c3RGb3JDaGFuZ2UocmFuZ2UuYW5jaG9yLCBjaGFuZ2UpLFxuICAgICAgICAgICAgICAgICAgICAgICBhZGp1c3RGb3JDaGFuZ2UocmFuZ2UuaGVhZCwgY2hhbmdlKSkpO1xuICB9XG4gIHJldHVybiBub3JtYWxpemVTZWxlY3Rpb24ob3V0LCBkb2Muc2VsLnByaW1JbmRleClcbn1cblxuZnVuY3Rpb24gb2Zmc2V0UG9zKHBvcywgb2xkLCBudykge1xuICBpZiAocG9zLmxpbmUgPT0gb2xkLmxpbmUpXG4gICAgeyByZXR1cm4gUG9zKG53LmxpbmUsIHBvcy5jaCAtIG9sZC5jaCArIG53LmNoKSB9XG4gIGVsc2VcbiAgICB7IHJldHVybiBQb3MobncubGluZSArIChwb3MubGluZSAtIG9sZC5saW5lKSwgcG9zLmNoKSB9XG59XG5cbi8vIFVzZWQgYnkgcmVwbGFjZVNlbGVjdGlvbnMgdG8gYWxsb3cgbW92aW5nIHRoZSBzZWxlY3Rpb24gdG8gdGhlXG4vLyBzdGFydCBvciBhcm91bmQgdGhlIHJlcGxhY2VkIHRlc3QuIEhpbnQgbWF5IGJlIFwic3RhcnRcIiBvciBcImFyb3VuZFwiLlxuZnVuY3Rpb24gY29tcHV0ZVJlcGxhY2VkU2VsKGRvYywgY2hhbmdlcywgaGludCkge1xuICB2YXIgb3V0ID0gW107XG4gIHZhciBvbGRQcmV2ID0gUG9zKGRvYy5maXJzdCwgMCksIG5ld1ByZXYgPSBvbGRQcmV2O1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGNoYW5nZXMubGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgY2hhbmdlID0gY2hhbmdlc1tpXTtcbiAgICB2YXIgZnJvbSA9IG9mZnNldFBvcyhjaGFuZ2UuZnJvbSwgb2xkUHJldiwgbmV3UHJldik7XG4gICAgdmFyIHRvID0gb2Zmc2V0UG9zKGNoYW5nZUVuZChjaGFuZ2UpLCBvbGRQcmV2LCBuZXdQcmV2KTtcbiAgICBvbGRQcmV2ID0gY2hhbmdlLnRvO1xuICAgIG5ld1ByZXYgPSB0bztcbiAgICBpZiAoaGludCA9PSBcImFyb3VuZFwiKSB7XG4gICAgICB2YXIgcmFuZ2UgPSBkb2Muc2VsLnJhbmdlc1tpXSwgaW52ID0gY21wKHJhbmdlLmhlYWQsIHJhbmdlLmFuY2hvcikgPCAwO1xuICAgICAgb3V0W2ldID0gbmV3IFJhbmdlKGludiA/IHRvIDogZnJvbSwgaW52ID8gZnJvbSA6IHRvKTtcbiAgICB9IGVsc2Uge1xuICAgICAgb3V0W2ldID0gbmV3IFJhbmdlKGZyb20sIGZyb20pO1xuICAgIH1cbiAgfVxuICByZXR1cm4gbmV3IFNlbGVjdGlvbihvdXQsIGRvYy5zZWwucHJpbUluZGV4KVxufVxuXG4vLyBVc2VkIHRvIGdldCB0aGUgZWRpdG9yIGludG8gYSBjb25zaXN0ZW50IHN0YXRlIGFnYWluIHdoZW4gb3B0aW9ucyBjaGFuZ2UuXG5cbmZ1bmN0aW9uIGxvYWRNb2RlKGNtKSB7XG4gIGNtLmRvYy5tb2RlID0gZ2V0TW9kZShjbS5vcHRpb25zLCBjbS5kb2MubW9kZU9wdGlvbik7XG4gIHJlc2V0TW9kZVN0YXRlKGNtKTtcbn1cblxuZnVuY3Rpb24gcmVzZXRNb2RlU3RhdGUoY20pIHtcbiAgY20uZG9jLml0ZXIoZnVuY3Rpb24gKGxpbmUpIHtcbiAgICBpZiAobGluZS5zdGF0ZUFmdGVyKSB7IGxpbmUuc3RhdGVBZnRlciA9IG51bGw7IH1cbiAgICBpZiAobGluZS5zdHlsZXMpIHsgbGluZS5zdHlsZXMgPSBudWxsOyB9XG4gIH0pO1xuICBjbS5kb2MubW9kZUZyb250aWVyID0gY20uZG9jLmhpZ2hsaWdodEZyb250aWVyID0gY20uZG9jLmZpcnN0O1xuICBzdGFydFdvcmtlcihjbSwgMTAwKTtcbiAgY20uc3RhdGUubW9kZUdlbisrO1xuICBpZiAoY20uY3VyT3ApIHsgcmVnQ2hhbmdlKGNtKTsgfVxufVxuXG4vLyBET0NVTUVOVCBEQVRBIFNUUlVDVFVSRVxuXG4vLyBCeSBkZWZhdWx0LCB1cGRhdGVzIHRoYXQgc3RhcnQgYW5kIGVuZCBhdCB0aGUgYmVnaW5uaW5nIG9mIGEgbGluZVxuLy8gYXJlIHRyZWF0ZWQgc3BlY2lhbGx5LCBpbiBvcmRlciB0byBtYWtlIHRoZSBhc3NvY2lhdGlvbiBvZiBsaW5lXG4vLyB3aWRnZXRzIGFuZCBtYXJrZXIgZWxlbWVudHMgd2l0aCB0aGUgdGV4dCBiZWhhdmUgbW9yZSBpbnR1aXRpdmUuXG5mdW5jdGlvbiBpc1dob2xlTGluZVVwZGF0ZShkb2MsIGNoYW5nZSkge1xuICByZXR1cm4gY2hhbmdlLmZyb20uY2ggPT0gMCAmJiBjaGFuZ2UudG8uY2ggPT0gMCAmJiBsc3QoY2hhbmdlLnRleHQpID09IFwiXCIgJiZcbiAgICAoIWRvYy5jbSB8fCBkb2MuY20ub3B0aW9ucy53aG9sZUxpbmVVcGRhdGVCZWZvcmUpXG59XG5cbi8vIFBlcmZvcm0gYSBjaGFuZ2Ugb24gdGhlIGRvY3VtZW50IGRhdGEgc3RydWN0dXJlLlxuZnVuY3Rpb24gdXBkYXRlRG9jKGRvYywgY2hhbmdlLCBtYXJrZWRTcGFucywgZXN0aW1hdGVIZWlnaHQkJDEpIHtcbiAgZnVuY3Rpb24gc3BhbnNGb3Iobikge3JldHVybiBtYXJrZWRTcGFucyA/IG1hcmtlZFNwYW5zW25dIDogbnVsbH1cbiAgZnVuY3Rpb24gdXBkYXRlKGxpbmUsIHRleHQsIHNwYW5zKSB7XG4gICAgdXBkYXRlTGluZShsaW5lLCB0ZXh0LCBzcGFucywgZXN0aW1hdGVIZWlnaHQkJDEpO1xuICAgIHNpZ25hbExhdGVyKGxpbmUsIFwiY2hhbmdlXCIsIGxpbmUsIGNoYW5nZSk7XG4gIH1cbiAgZnVuY3Rpb24gbGluZXNGb3Ioc3RhcnQsIGVuZCkge1xuICAgIHZhciByZXN1bHQgPSBbXTtcbiAgICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPCBlbmQ7ICsraSlcbiAgICAgIHsgcmVzdWx0LnB1c2gobmV3IExpbmUodGV4dFtpXSwgc3BhbnNGb3IoaSksIGVzdGltYXRlSGVpZ2h0JCQxKSk7IH1cbiAgICByZXR1cm4gcmVzdWx0XG4gIH1cblxuICB2YXIgZnJvbSA9IGNoYW5nZS5mcm9tLCB0byA9IGNoYW5nZS50bywgdGV4dCA9IGNoYW5nZS50ZXh0O1xuICB2YXIgZmlyc3RMaW5lID0gZ2V0TGluZShkb2MsIGZyb20ubGluZSksIGxhc3RMaW5lID0gZ2V0TGluZShkb2MsIHRvLmxpbmUpO1xuICB2YXIgbGFzdFRleHQgPSBsc3QodGV4dCksIGxhc3RTcGFucyA9IHNwYW5zRm9yKHRleHQubGVuZ3RoIC0gMSksIG5saW5lcyA9IHRvLmxpbmUgLSBmcm9tLmxpbmU7XG5cbiAgLy8gQWRqdXN0IHRoZSBsaW5lIHN0cnVjdHVyZVxuICBpZiAoY2hhbmdlLmZ1bGwpIHtcbiAgICBkb2MuaW5zZXJ0KDAsIGxpbmVzRm9yKDAsIHRleHQubGVuZ3RoKSk7XG4gICAgZG9jLnJlbW92ZSh0ZXh0Lmxlbmd0aCwgZG9jLnNpemUgLSB0ZXh0Lmxlbmd0aCk7XG4gIH0gZWxzZSBpZiAoaXNXaG9sZUxpbmVVcGRhdGUoZG9jLCBjaGFuZ2UpKSB7XG4gICAgLy8gVGhpcyBpcyBhIHdob2xlLWxpbmUgcmVwbGFjZS4gVHJlYXRlZCBzcGVjaWFsbHkgdG8gbWFrZVxuICAgIC8vIHN1cmUgbGluZSBvYmplY3RzIG1vdmUgdGhlIHdheSB0aGV5IGFyZSBzdXBwb3NlZCB0by5cbiAgICB2YXIgYWRkZWQgPSBsaW5lc0ZvcigwLCB0ZXh0Lmxlbmd0aCAtIDEpO1xuICAgIHVwZGF0ZShsYXN0TGluZSwgbGFzdExpbmUudGV4dCwgbGFzdFNwYW5zKTtcbiAgICBpZiAobmxpbmVzKSB7IGRvYy5yZW1vdmUoZnJvbS5saW5lLCBubGluZXMpOyB9XG4gICAgaWYgKGFkZGVkLmxlbmd0aCkgeyBkb2MuaW5zZXJ0KGZyb20ubGluZSwgYWRkZWQpOyB9XG4gIH0gZWxzZSBpZiAoZmlyc3RMaW5lID09IGxhc3RMaW5lKSB7XG4gICAgaWYgKHRleHQubGVuZ3RoID09IDEpIHtcbiAgICAgIHVwZGF0ZShmaXJzdExpbmUsIGZpcnN0TGluZS50ZXh0LnNsaWNlKDAsIGZyb20uY2gpICsgbGFzdFRleHQgKyBmaXJzdExpbmUudGV4dC5zbGljZSh0by5jaCksIGxhc3RTcGFucyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciBhZGRlZCQxID0gbGluZXNGb3IoMSwgdGV4dC5sZW5ndGggLSAxKTtcbiAgICAgIGFkZGVkJDEucHVzaChuZXcgTGluZShsYXN0VGV4dCArIGZpcnN0TGluZS50ZXh0LnNsaWNlKHRvLmNoKSwgbGFzdFNwYW5zLCBlc3RpbWF0ZUhlaWdodCQkMSkpO1xuICAgICAgdXBkYXRlKGZpcnN0TGluZSwgZmlyc3RMaW5lLnRleHQuc2xpY2UoMCwgZnJvbS5jaCkgKyB0ZXh0WzBdLCBzcGFuc0ZvcigwKSk7XG4gICAgICBkb2MuaW5zZXJ0KGZyb20ubGluZSArIDEsIGFkZGVkJDEpO1xuICAgIH1cbiAgfSBlbHNlIGlmICh0ZXh0Lmxlbmd0aCA9PSAxKSB7XG4gICAgdXBkYXRlKGZpcnN0TGluZSwgZmlyc3RMaW5lLnRleHQuc2xpY2UoMCwgZnJvbS5jaCkgKyB0ZXh0WzBdICsgbGFzdExpbmUudGV4dC5zbGljZSh0by5jaCksIHNwYW5zRm9yKDApKTtcbiAgICBkb2MucmVtb3ZlKGZyb20ubGluZSArIDEsIG5saW5lcyk7XG4gIH0gZWxzZSB7XG4gICAgdXBkYXRlKGZpcnN0TGluZSwgZmlyc3RMaW5lLnRleHQuc2xpY2UoMCwgZnJvbS5jaCkgKyB0ZXh0WzBdLCBzcGFuc0ZvcigwKSk7XG4gICAgdXBkYXRlKGxhc3RMaW5lLCBsYXN0VGV4dCArIGxhc3RMaW5lLnRleHQuc2xpY2UodG8uY2gpLCBsYXN0U3BhbnMpO1xuICAgIHZhciBhZGRlZCQyID0gbGluZXNGb3IoMSwgdGV4dC5sZW5ndGggLSAxKTtcbiAgICBpZiAobmxpbmVzID4gMSkgeyBkb2MucmVtb3ZlKGZyb20ubGluZSArIDEsIG5saW5lcyAtIDEpOyB9XG4gICAgZG9jLmluc2VydChmcm9tLmxpbmUgKyAxLCBhZGRlZCQyKTtcbiAgfVxuXG4gIHNpZ25hbExhdGVyKGRvYywgXCJjaGFuZ2VcIiwgZG9jLCBjaGFuZ2UpO1xufVxuXG4vLyBDYWxsIGYgZm9yIGFsbCBsaW5rZWQgZG9jdW1lbnRzLlxuZnVuY3Rpb24gbGlua2VkRG9jcyhkb2MsIGYsIHNoYXJlZEhpc3RPbmx5KSB7XG4gIGZ1bmN0aW9uIHByb3BhZ2F0ZShkb2MsIHNraXAsIHNoYXJlZEhpc3QpIHtcbiAgICBpZiAoZG9jLmxpbmtlZCkgeyBmb3IgKHZhciBpID0gMDsgaSA8IGRvYy5saW5rZWQubGVuZ3RoOyArK2kpIHtcbiAgICAgIHZhciByZWwgPSBkb2MubGlua2VkW2ldO1xuICAgICAgaWYgKHJlbC5kb2MgPT0gc2tpcCkgeyBjb250aW51ZSB9XG4gICAgICB2YXIgc2hhcmVkID0gc2hhcmVkSGlzdCAmJiByZWwuc2hhcmVkSGlzdDtcbiAgICAgIGlmIChzaGFyZWRIaXN0T25seSAmJiAhc2hhcmVkKSB7IGNvbnRpbnVlIH1cbiAgICAgIGYocmVsLmRvYywgc2hhcmVkKTtcbiAgICAgIHByb3BhZ2F0ZShyZWwuZG9jLCBkb2MsIHNoYXJlZCk7XG4gICAgfSB9XG4gIH1cbiAgcHJvcGFnYXRlKGRvYywgbnVsbCwgdHJ1ZSk7XG59XG5cbi8vIEF0dGFjaCBhIGRvY3VtZW50IHRvIGFuIGVkaXRvci5cbmZ1bmN0aW9uIGF0dGFjaERvYyhjbSwgZG9jKSB7XG4gIGlmIChkb2MuY20pIHsgdGhyb3cgbmV3IEVycm9yKFwiVGhpcyBkb2N1bWVudCBpcyBhbHJlYWR5IGluIHVzZS5cIikgfVxuICBjbS5kb2MgPSBkb2M7XG4gIGRvYy5jbSA9IGNtO1xuICBlc3RpbWF0ZUxpbmVIZWlnaHRzKGNtKTtcbiAgbG9hZE1vZGUoY20pO1xuICBzZXREaXJlY3Rpb25DbGFzcyhjbSk7XG4gIGlmICghY20ub3B0aW9ucy5saW5lV3JhcHBpbmcpIHsgZmluZE1heExpbmUoY20pOyB9XG4gIGNtLm9wdGlvbnMubW9kZSA9IGRvYy5tb2RlT3B0aW9uO1xuICByZWdDaGFuZ2UoY20pO1xufVxuXG5mdW5jdGlvbiBzZXREaXJlY3Rpb25DbGFzcyhjbSkge1xuICAoY20uZG9jLmRpcmVjdGlvbiA9PSBcInJ0bFwiID8gYWRkQ2xhc3MgOiBybUNsYXNzKShjbS5kaXNwbGF5LmxpbmVEaXYsIFwiQ29kZU1pcnJvci1ydGxcIik7XG59XG5cbmZ1bmN0aW9uIGRpcmVjdGlvbkNoYW5nZWQoY20pIHtcbiAgcnVuSW5PcChjbSwgZnVuY3Rpb24gKCkge1xuICAgIHNldERpcmVjdGlvbkNsYXNzKGNtKTtcbiAgICByZWdDaGFuZ2UoY20pO1xuICB9KTtcbn1cblxuZnVuY3Rpb24gSGlzdG9yeShzdGFydEdlbikge1xuICAvLyBBcnJheXMgb2YgY2hhbmdlIGV2ZW50cyBhbmQgc2VsZWN0aW9ucy4gRG9pbmcgc29tZXRoaW5nIGFkZHMgYW5cbiAgLy8gZXZlbnQgdG8gZG9uZSBhbmQgY2xlYXJzIHVuZG8uIFVuZG9pbmcgbW92ZXMgZXZlbnRzIGZyb20gZG9uZVxuICAvLyB0byB1bmRvbmUsIHJlZG9pbmcgbW92ZXMgdGhlbSBpbiB0aGUgb3RoZXIgZGlyZWN0aW9uLlxuICB0aGlzLmRvbmUgPSBbXTsgdGhpcy51bmRvbmUgPSBbXTtcbiAgdGhpcy51bmRvRGVwdGggPSBJbmZpbml0eTtcbiAgLy8gVXNlZCB0byB0cmFjayB3aGVuIGNoYW5nZXMgY2FuIGJlIG1lcmdlZCBpbnRvIGEgc2luZ2xlIHVuZG9cbiAgLy8gZXZlbnRcbiAgdGhpcy5sYXN0TW9kVGltZSA9IHRoaXMubGFzdFNlbFRpbWUgPSAwO1xuICB0aGlzLmxhc3RPcCA9IHRoaXMubGFzdFNlbE9wID0gbnVsbDtcbiAgdGhpcy5sYXN0T3JpZ2luID0gdGhpcy5sYXN0U2VsT3JpZ2luID0gbnVsbDtcbiAgLy8gVXNlZCBieSB0aGUgaXNDbGVhbigpIG1ldGhvZFxuICB0aGlzLmdlbmVyYXRpb24gPSB0aGlzLm1heEdlbmVyYXRpb24gPSBzdGFydEdlbiB8fCAxO1xufVxuXG4vLyBDcmVhdGUgYSBoaXN0b3J5IGNoYW5nZSBldmVudCBmcm9tIGFuIHVwZGF0ZURvYy1zdHlsZSBjaGFuZ2Vcbi8vIG9iamVjdC5cbmZ1bmN0aW9uIGhpc3RvcnlDaGFuZ2VGcm9tQ2hhbmdlKGRvYywgY2hhbmdlKSB7XG4gIHZhciBoaXN0Q2hhbmdlID0ge2Zyb206IGNvcHlQb3MoY2hhbmdlLmZyb20pLCB0bzogY2hhbmdlRW5kKGNoYW5nZSksIHRleHQ6IGdldEJldHdlZW4oZG9jLCBjaGFuZ2UuZnJvbSwgY2hhbmdlLnRvKX07XG4gIGF0dGFjaExvY2FsU3BhbnMoZG9jLCBoaXN0Q2hhbmdlLCBjaGFuZ2UuZnJvbS5saW5lLCBjaGFuZ2UudG8ubGluZSArIDEpO1xuICBsaW5rZWREb2NzKGRvYywgZnVuY3Rpb24gKGRvYykgeyByZXR1cm4gYXR0YWNoTG9jYWxTcGFucyhkb2MsIGhpc3RDaGFuZ2UsIGNoYW5nZS5mcm9tLmxpbmUsIGNoYW5nZS50by5saW5lICsgMSk7IH0sIHRydWUpO1xuICByZXR1cm4gaGlzdENoYW5nZVxufVxuXG4vLyBQb3AgYWxsIHNlbGVjdGlvbiBldmVudHMgb2ZmIHRoZSBlbmQgb2YgYSBoaXN0b3J5IGFycmF5LiBTdG9wIGF0XG4vLyBhIGNoYW5nZSBldmVudC5cbmZ1bmN0aW9uIGNsZWFyU2VsZWN0aW9uRXZlbnRzKGFycmF5KSB7XG4gIHdoaWxlIChhcnJheS5sZW5ndGgpIHtcbiAgICB2YXIgbGFzdCA9IGxzdChhcnJheSk7XG4gICAgaWYgKGxhc3QucmFuZ2VzKSB7IGFycmF5LnBvcCgpOyB9XG4gICAgZWxzZSB7IGJyZWFrIH1cbiAgfVxufVxuXG4vLyBGaW5kIHRoZSB0b3AgY2hhbmdlIGV2ZW50IGluIHRoZSBoaXN0b3J5LiBQb3Agb2ZmIHNlbGVjdGlvblxuLy8gZXZlbnRzIHRoYXQgYXJlIGluIHRoZSB3YXkuXG5mdW5jdGlvbiBsYXN0Q2hhbmdlRXZlbnQoaGlzdCwgZm9yY2UpIHtcbiAgaWYgKGZvcmNlKSB7XG4gICAgY2xlYXJTZWxlY3Rpb25FdmVudHMoaGlzdC5kb25lKTtcbiAgICByZXR1cm4gbHN0KGhpc3QuZG9uZSlcbiAgfSBlbHNlIGlmIChoaXN0LmRvbmUubGVuZ3RoICYmICFsc3QoaGlzdC5kb25lKS5yYW5nZXMpIHtcbiAgICByZXR1cm4gbHN0KGhpc3QuZG9uZSlcbiAgfSBlbHNlIGlmIChoaXN0LmRvbmUubGVuZ3RoID4gMSAmJiAhaGlzdC5kb25lW2hpc3QuZG9uZS5sZW5ndGggLSAyXS5yYW5nZXMpIHtcbiAgICBoaXN0LmRvbmUucG9wKCk7XG4gICAgcmV0dXJuIGxzdChoaXN0LmRvbmUpXG4gIH1cbn1cblxuLy8gUmVnaXN0ZXIgYSBjaGFuZ2UgaW4gdGhlIGhpc3RvcnkuIE1lcmdlcyBjaGFuZ2VzIHRoYXQgYXJlIHdpdGhpblxuLy8gYSBzaW5nbGUgb3BlcmF0aW9uLCBvciBhcmUgY2xvc2UgdG9nZXRoZXIgd2l0aCBhbiBvcmlnaW4gdGhhdFxuLy8gYWxsb3dzIG1lcmdpbmcgKHN0YXJ0aW5nIHdpdGggXCIrXCIpIGludG8gYSBzaW5nbGUgZXZlbnQuXG5mdW5jdGlvbiBhZGRDaGFuZ2VUb0hpc3RvcnkoZG9jLCBjaGFuZ2UsIHNlbEFmdGVyLCBvcElkKSB7XG4gIHZhciBoaXN0ID0gZG9jLmhpc3Rvcnk7XG4gIGhpc3QudW5kb25lLmxlbmd0aCA9IDA7XG4gIHZhciB0aW1lID0gK25ldyBEYXRlLCBjdXI7XG4gIHZhciBsYXN0O1xuXG4gIGlmICgoaGlzdC5sYXN0T3AgPT0gb3BJZCB8fFxuICAgICAgIGhpc3QubGFzdE9yaWdpbiA9PSBjaGFuZ2Uub3JpZ2luICYmIGNoYW5nZS5vcmlnaW4gJiZcbiAgICAgICAoKGNoYW5nZS5vcmlnaW4uY2hhckF0KDApID09IFwiK1wiICYmIGhpc3QubGFzdE1vZFRpbWUgPiB0aW1lIC0gKGRvYy5jbSA/IGRvYy5jbS5vcHRpb25zLmhpc3RvcnlFdmVudERlbGF5IDogNTAwKSkgfHxcbiAgICAgICAgY2hhbmdlLm9yaWdpbi5jaGFyQXQoMCkgPT0gXCIqXCIpKSAmJlxuICAgICAgKGN1ciA9IGxhc3RDaGFuZ2VFdmVudChoaXN0LCBoaXN0Lmxhc3RPcCA9PSBvcElkKSkpIHtcbiAgICAvLyBNZXJnZSB0aGlzIGNoYW5nZSBpbnRvIHRoZSBsYXN0IGV2ZW50XG4gICAgbGFzdCA9IGxzdChjdXIuY2hhbmdlcyk7XG4gICAgaWYgKGNtcChjaGFuZ2UuZnJvbSwgY2hhbmdlLnRvKSA9PSAwICYmIGNtcChjaGFuZ2UuZnJvbSwgbGFzdC50bykgPT0gMCkge1xuICAgICAgLy8gT3B0aW1pemVkIGNhc2UgZm9yIHNpbXBsZSBpbnNlcnRpb24gLS0gZG9uJ3Qgd2FudCB0byBhZGRcbiAgICAgIC8vIG5ldyBjaGFuZ2VzZXRzIGZvciBldmVyeSBjaGFyYWN0ZXIgdHlwZWRcbiAgICAgIGxhc3QudG8gPSBjaGFuZ2VFbmQoY2hhbmdlKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gQWRkIG5ldyBzdWItZXZlbnRcbiAgICAgIGN1ci5jaGFuZ2VzLnB1c2goaGlzdG9yeUNoYW5nZUZyb21DaGFuZ2UoZG9jLCBjaGFuZ2UpKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgLy8gQ2FuIG5vdCBiZSBtZXJnZWQsIHN0YXJ0IGEgbmV3IGV2ZW50LlxuICAgIHZhciBiZWZvcmUgPSBsc3QoaGlzdC5kb25lKTtcbiAgICBpZiAoIWJlZm9yZSB8fCAhYmVmb3JlLnJhbmdlcylcbiAgICAgIHsgcHVzaFNlbGVjdGlvblRvSGlzdG9yeShkb2Muc2VsLCBoaXN0LmRvbmUpOyB9XG4gICAgY3VyID0ge2NoYW5nZXM6IFtoaXN0b3J5Q2hhbmdlRnJvbUNoYW5nZShkb2MsIGNoYW5nZSldLFxuICAgICAgICAgICBnZW5lcmF0aW9uOiBoaXN0LmdlbmVyYXRpb259O1xuICAgIGhpc3QuZG9uZS5wdXNoKGN1cik7XG4gICAgd2hpbGUgKGhpc3QuZG9uZS5sZW5ndGggPiBoaXN0LnVuZG9EZXB0aCkge1xuICAgICAgaGlzdC5kb25lLnNoaWZ0KCk7XG4gICAgICBpZiAoIWhpc3QuZG9uZVswXS5yYW5nZXMpIHsgaGlzdC5kb25lLnNoaWZ0KCk7IH1cbiAgICB9XG4gIH1cbiAgaGlzdC5kb25lLnB1c2goc2VsQWZ0ZXIpO1xuICBoaXN0LmdlbmVyYXRpb24gPSArK2hpc3QubWF4R2VuZXJhdGlvbjtcbiAgaGlzdC5sYXN0TW9kVGltZSA9IGhpc3QubGFzdFNlbFRpbWUgPSB0aW1lO1xuICBoaXN0Lmxhc3RPcCA9IGhpc3QubGFzdFNlbE9wID0gb3BJZDtcbiAgaGlzdC5sYXN0T3JpZ2luID0gaGlzdC5sYXN0U2VsT3JpZ2luID0gY2hhbmdlLm9yaWdpbjtcblxuICBpZiAoIWxhc3QpIHsgc2lnbmFsKGRvYywgXCJoaXN0b3J5QWRkZWRcIik7IH1cbn1cblxuZnVuY3Rpb24gc2VsZWN0aW9uRXZlbnRDYW5CZU1lcmdlZChkb2MsIG9yaWdpbiwgcHJldiwgc2VsKSB7XG4gIHZhciBjaCA9IG9yaWdpbi5jaGFyQXQoMCk7XG4gIHJldHVybiBjaCA9PSBcIipcIiB8fFxuICAgIGNoID09IFwiK1wiICYmXG4gICAgcHJldi5yYW5nZXMubGVuZ3RoID09IHNlbC5yYW5nZXMubGVuZ3RoICYmXG4gICAgcHJldi5zb21ldGhpbmdTZWxlY3RlZCgpID09IHNlbC5zb21ldGhpbmdTZWxlY3RlZCgpICYmXG4gICAgbmV3IERhdGUgLSBkb2MuaGlzdG9yeS5sYXN0U2VsVGltZSA8PSAoZG9jLmNtID8gZG9jLmNtLm9wdGlvbnMuaGlzdG9yeUV2ZW50RGVsYXkgOiA1MDApXG59XG5cbi8vIENhbGxlZCB3aGVuZXZlciB0aGUgc2VsZWN0aW9uIGNoYW5nZXMsIHNldHMgdGhlIG5ldyBzZWxlY3Rpb24gYXNcbi8vIHRoZSBwZW5kaW5nIHNlbGVjdGlvbiBpbiB0aGUgaGlzdG9yeSwgYW5kIHB1c2hlcyB0aGUgb2xkIHBlbmRpbmdcbi8vIHNlbGVjdGlvbiBpbnRvIHRoZSAnZG9uZScgYXJyYXkgd2hlbiBpdCB3YXMgc2lnbmlmaWNhbnRseVxuLy8gZGlmZmVyZW50IChpbiBudW1iZXIgb2Ygc2VsZWN0ZWQgcmFuZ2VzLCBlbXB0aW5lc3MsIG9yIHRpbWUpLlxuZnVuY3Rpb24gYWRkU2VsZWN0aW9uVG9IaXN0b3J5KGRvYywgc2VsLCBvcElkLCBvcHRpb25zKSB7XG4gIHZhciBoaXN0ID0gZG9jLmhpc3RvcnksIG9yaWdpbiA9IG9wdGlvbnMgJiYgb3B0aW9ucy5vcmlnaW47XG5cbiAgLy8gQSBuZXcgZXZlbnQgaXMgc3RhcnRlZCB3aGVuIHRoZSBwcmV2aW91cyBvcmlnaW4gZG9lcyBub3QgbWF0Y2hcbiAgLy8gdGhlIGN1cnJlbnQsIG9yIHRoZSBvcmlnaW5zIGRvbid0IGFsbG93IG1hdGNoaW5nLiBPcmlnaW5zXG4gIC8vIHN0YXJ0aW5nIHdpdGggKiBhcmUgYWx3YXlzIG1lcmdlZCwgdGhvc2Ugc3RhcnRpbmcgd2l0aCArIGFyZVxuICAvLyBtZXJnZWQgd2hlbiBzaW1pbGFyIGFuZCBjbG9zZSB0b2dldGhlciBpbiB0aW1lLlxuICBpZiAob3BJZCA9PSBoaXN0Lmxhc3RTZWxPcCB8fFxuICAgICAgKG9yaWdpbiAmJiBoaXN0Lmxhc3RTZWxPcmlnaW4gPT0gb3JpZ2luICYmXG4gICAgICAgKGhpc3QubGFzdE1vZFRpbWUgPT0gaGlzdC5sYXN0U2VsVGltZSAmJiBoaXN0Lmxhc3RPcmlnaW4gPT0gb3JpZ2luIHx8XG4gICAgICAgIHNlbGVjdGlvbkV2ZW50Q2FuQmVNZXJnZWQoZG9jLCBvcmlnaW4sIGxzdChoaXN0LmRvbmUpLCBzZWwpKSkpXG4gICAgeyBoaXN0LmRvbmVbaGlzdC5kb25lLmxlbmd0aCAtIDFdID0gc2VsOyB9XG4gIGVsc2VcbiAgICB7IHB1c2hTZWxlY3Rpb25Ub0hpc3Rvcnkoc2VsLCBoaXN0LmRvbmUpOyB9XG5cbiAgaGlzdC5sYXN0U2VsVGltZSA9ICtuZXcgRGF0ZTtcbiAgaGlzdC5sYXN0U2VsT3JpZ2luID0gb3JpZ2luO1xuICBoaXN0Lmxhc3RTZWxPcCA9IG9wSWQ7XG4gIGlmIChvcHRpb25zICYmIG9wdGlvbnMuY2xlYXJSZWRvICE9PSBmYWxzZSlcbiAgICB7IGNsZWFyU2VsZWN0aW9uRXZlbnRzKGhpc3QudW5kb25lKTsgfVxufVxuXG5mdW5jdGlvbiBwdXNoU2VsZWN0aW9uVG9IaXN0b3J5KHNlbCwgZGVzdCkge1xuICB2YXIgdG9wID0gbHN0KGRlc3QpO1xuICBpZiAoISh0b3AgJiYgdG9wLnJhbmdlcyAmJiB0b3AuZXF1YWxzKHNlbCkpKVxuICAgIHsgZGVzdC5wdXNoKHNlbCk7IH1cbn1cblxuLy8gVXNlZCB0byBzdG9yZSBtYXJrZWQgc3BhbiBpbmZvcm1hdGlvbiBpbiB0aGUgaGlzdG9yeS5cbmZ1bmN0aW9uIGF0dGFjaExvY2FsU3BhbnMoZG9jLCBjaGFuZ2UsIGZyb20sIHRvKSB7XG4gIHZhciBleGlzdGluZyA9IGNoYW5nZVtcInNwYW5zX1wiICsgZG9jLmlkXSwgbiA9IDA7XG4gIGRvYy5pdGVyKE1hdGgubWF4KGRvYy5maXJzdCwgZnJvbSksIE1hdGgubWluKGRvYy5maXJzdCArIGRvYy5zaXplLCB0byksIGZ1bmN0aW9uIChsaW5lKSB7XG4gICAgaWYgKGxpbmUubWFya2VkU3BhbnMpXG4gICAgICB7IChleGlzdGluZyB8fCAoZXhpc3RpbmcgPSBjaGFuZ2VbXCJzcGFuc19cIiArIGRvYy5pZF0gPSB7fSkpW25dID0gbGluZS5tYXJrZWRTcGFuczsgfVxuICAgICsrbjtcbiAgfSk7XG59XG5cbi8vIFdoZW4gdW4vcmUtZG9pbmcgcmVzdG9yZXMgdGV4dCBjb250YWluaW5nIG1hcmtlZCBzcGFucywgdGhvc2Vcbi8vIHRoYXQgaGF2ZSBiZWVuIGV4cGxpY2l0bHkgY2xlYXJlZCBzaG91bGQgbm90IGJlIHJlc3RvcmVkLlxuZnVuY3Rpb24gcmVtb3ZlQ2xlYXJlZFNwYW5zKHNwYW5zKSB7XG4gIGlmICghc3BhbnMpIHsgcmV0dXJuIG51bGwgfVxuICB2YXIgb3V0O1xuICBmb3IgKHZhciBpID0gMDsgaSA8IHNwYW5zLmxlbmd0aDsgKytpKSB7XG4gICAgaWYgKHNwYW5zW2ldLm1hcmtlci5leHBsaWNpdGx5Q2xlYXJlZCkgeyBpZiAoIW91dCkgeyBvdXQgPSBzcGFucy5zbGljZSgwLCBpKTsgfSB9XG4gICAgZWxzZSBpZiAob3V0KSB7IG91dC5wdXNoKHNwYW5zW2ldKTsgfVxuICB9XG4gIHJldHVybiAhb3V0ID8gc3BhbnMgOiBvdXQubGVuZ3RoID8gb3V0IDogbnVsbFxufVxuXG4vLyBSZXRyaWV2ZSBhbmQgZmlsdGVyIHRoZSBvbGQgbWFya2VkIHNwYW5zIHN0b3JlZCBpbiBhIGNoYW5nZSBldmVudC5cbmZ1bmN0aW9uIGdldE9sZFNwYW5zKGRvYywgY2hhbmdlKSB7XG4gIHZhciBmb3VuZCA9IGNoYW5nZVtcInNwYW5zX1wiICsgZG9jLmlkXTtcbiAgaWYgKCFmb3VuZCkgeyByZXR1cm4gbnVsbCB9XG4gIHZhciBudyA9IFtdO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGNoYW5nZS50ZXh0Lmxlbmd0aDsgKytpKVxuICAgIHsgbncucHVzaChyZW1vdmVDbGVhcmVkU3BhbnMoZm91bmRbaV0pKTsgfVxuICByZXR1cm4gbndcbn1cblxuLy8gVXNlZCBmb3IgdW4vcmUtZG9pbmcgY2hhbmdlcyBmcm9tIHRoZSBoaXN0b3J5LiBDb21iaW5lcyB0aGVcbi8vIHJlc3VsdCBvZiBjb21wdXRpbmcgdGhlIGV4aXN0aW5nIHNwYW5zIHdpdGggdGhlIHNldCBvZiBzcGFucyB0aGF0XG4vLyBleGlzdGVkIGluIHRoZSBoaXN0b3J5IChzbyB0aGF0IGRlbGV0aW5nIGFyb3VuZCBhIHNwYW4gYW5kIHRoZW5cbi8vIHVuZG9pbmcgYnJpbmdzIGJhY2sgdGhlIHNwYW4pLlxuZnVuY3Rpb24gbWVyZ2VPbGRTcGFucyhkb2MsIGNoYW5nZSkge1xuICB2YXIgb2xkID0gZ2V0T2xkU3BhbnMoZG9jLCBjaGFuZ2UpO1xuICB2YXIgc3RyZXRjaGVkID0gc3RyZXRjaFNwYW5zT3ZlckNoYW5nZShkb2MsIGNoYW5nZSk7XG4gIGlmICghb2xkKSB7IHJldHVybiBzdHJldGNoZWQgfVxuICBpZiAoIXN0cmV0Y2hlZCkgeyByZXR1cm4gb2xkIH1cblxuICBmb3IgKHZhciBpID0gMDsgaSA8IG9sZC5sZW5ndGg7ICsraSkge1xuICAgIHZhciBvbGRDdXIgPSBvbGRbaV0sIHN0cmV0Y2hDdXIgPSBzdHJldGNoZWRbaV07XG4gICAgaWYgKG9sZEN1ciAmJiBzdHJldGNoQ3VyKSB7XG4gICAgICBzcGFuczogZm9yICh2YXIgaiA9IDA7IGogPCBzdHJldGNoQ3VyLmxlbmd0aDsgKytqKSB7XG4gICAgICAgIHZhciBzcGFuID0gc3RyZXRjaEN1cltqXTtcbiAgICAgICAgZm9yICh2YXIgayA9IDA7IGsgPCBvbGRDdXIubGVuZ3RoOyArK2spXG4gICAgICAgICAgeyBpZiAob2xkQ3VyW2tdLm1hcmtlciA9PSBzcGFuLm1hcmtlcikgeyBjb250aW51ZSBzcGFucyB9IH1cbiAgICAgICAgb2xkQ3VyLnB1c2goc3Bhbik7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmIChzdHJldGNoQ3VyKSB7XG4gICAgICBvbGRbaV0gPSBzdHJldGNoQ3VyO1xuICAgIH1cbiAgfVxuICByZXR1cm4gb2xkXG59XG5cbi8vIFVzZWQgYm90aCB0byBwcm92aWRlIGEgSlNPTi1zYWZlIG9iamVjdCBpbiAuZ2V0SGlzdG9yeSwgYW5kLCB3aGVuXG4vLyBkZXRhY2hpbmcgYSBkb2N1bWVudCwgdG8gc3BsaXQgdGhlIGhpc3RvcnkgaW4gdHdvXG5mdW5jdGlvbiBjb3B5SGlzdG9yeUFycmF5KGV2ZW50cywgbmV3R3JvdXAsIGluc3RhbnRpYXRlU2VsKSB7XG4gIHZhciBjb3B5ID0gW107XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgZXZlbnRzLmxlbmd0aDsgKytpKSB7XG4gICAgdmFyIGV2ZW50ID0gZXZlbnRzW2ldO1xuICAgIGlmIChldmVudC5yYW5nZXMpIHtcbiAgICAgIGNvcHkucHVzaChpbnN0YW50aWF0ZVNlbCA/IFNlbGVjdGlvbi5wcm90b3R5cGUuZGVlcENvcHkuY2FsbChldmVudCkgOiBldmVudCk7XG4gICAgICBjb250aW51ZVxuICAgIH1cbiAgICB2YXIgY2hhbmdlcyA9IGV2ZW50LmNoYW5nZXMsIG5ld0NoYW5nZXMgPSBbXTtcbiAgICBjb3B5LnB1c2goe2NoYW5nZXM6IG5ld0NoYW5nZXN9KTtcbiAgICBmb3IgKHZhciBqID0gMDsgaiA8IGNoYW5nZXMubGVuZ3RoOyArK2opIHtcbiAgICAgIHZhciBjaGFuZ2UgPSBjaGFuZ2VzW2pdLCBtID0gKHZvaWQgMCk7XG4gICAgICBuZXdDaGFuZ2VzLnB1c2goe2Zyb206IGNoYW5nZS5mcm9tLCB0bzogY2hhbmdlLnRvLCB0ZXh0OiBjaGFuZ2UudGV4dH0pO1xuICAgICAgaWYgKG5ld0dyb3VwKSB7IGZvciAodmFyIHByb3AgaW4gY2hhbmdlKSB7IGlmIChtID0gcHJvcC5tYXRjaCgvXnNwYW5zXyhcXGQrKSQvKSkge1xuICAgICAgICBpZiAoaW5kZXhPZihuZXdHcm91cCwgTnVtYmVyKG1bMV0pKSA+IC0xKSB7XG4gICAgICAgICAgbHN0KG5ld0NoYW5nZXMpW3Byb3BdID0gY2hhbmdlW3Byb3BdO1xuICAgICAgICAgIGRlbGV0ZSBjaGFuZ2VbcHJvcF07XG4gICAgICAgIH1cbiAgICAgIH0gfSB9XG4gICAgfVxuICB9XG4gIHJldHVybiBjb3B5XG59XG5cbi8vIFRoZSAnc2Nyb2xsJyBwYXJhbWV0ZXIgZ2l2ZW4gdG8gbWFueSBvZiB0aGVzZSBpbmRpY2F0ZWQgd2hldGhlclxuLy8gdGhlIG5ldyBjdXJzb3IgcG9zaXRpb24gc2hvdWxkIGJlIHNjcm9sbGVkIGludG8gdmlldyBhZnRlclxuLy8gbW9kaWZ5aW5nIHRoZSBzZWxlY3Rpb24uXG5cbi8vIElmIHNoaWZ0IGlzIGhlbGQgb3IgdGhlIGV4dGVuZCBmbGFnIGlzIHNldCwgZXh0ZW5kcyBhIHJhbmdlIHRvXG4vLyBpbmNsdWRlIGEgZ2l2ZW4gcG9zaXRpb24gKGFuZCBvcHRpb25hbGx5IGEgc2Vjb25kIHBvc2l0aW9uKS5cbi8vIE90aGVyd2lzZSwgc2ltcGx5IHJldHVybnMgdGhlIHJhbmdlIGJldHdlZW4gdGhlIGdpdmVuIHBvc2l0aW9ucy5cbi8vIFVzZWQgZm9yIGN1cnNvciBtb3Rpb24gYW5kIHN1Y2guXG5mdW5jdGlvbiBleHRlbmRSYW5nZShyYW5nZSwgaGVhZCwgb3RoZXIsIGV4dGVuZCkge1xuICBpZiAoZXh0ZW5kKSB7XG4gICAgdmFyIGFuY2hvciA9IHJhbmdlLmFuY2hvcjtcbiAgICBpZiAob3RoZXIpIHtcbiAgICAgIHZhciBwb3NCZWZvcmUgPSBjbXAoaGVhZCwgYW5jaG9yKSA8IDA7XG4gICAgICBpZiAocG9zQmVmb3JlICE9IChjbXAob3RoZXIsIGFuY2hvcikgPCAwKSkge1xuICAgICAgICBhbmNob3IgPSBoZWFkO1xuICAgICAgICBoZWFkID0gb3RoZXI7XG4gICAgICB9IGVsc2UgaWYgKHBvc0JlZm9yZSAhPSAoY21wKGhlYWQsIG90aGVyKSA8IDApKSB7XG4gICAgICAgIGhlYWQgPSBvdGhlcjtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG5ldyBSYW5nZShhbmNob3IsIGhlYWQpXG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIG5ldyBSYW5nZShvdGhlciB8fCBoZWFkLCBoZWFkKVxuICB9XG59XG5cbi8vIEV4dGVuZCB0aGUgcHJpbWFyeSBzZWxlY3Rpb24gcmFuZ2UsIGRpc2NhcmQgdGhlIHJlc3QuXG5mdW5jdGlvbiBleHRlbmRTZWxlY3Rpb24oZG9jLCBoZWFkLCBvdGhlciwgb3B0aW9ucywgZXh0ZW5kKSB7XG4gIGlmIChleHRlbmQgPT0gbnVsbCkgeyBleHRlbmQgPSBkb2MuY20gJiYgKGRvYy5jbS5kaXNwbGF5LnNoaWZ0IHx8IGRvYy5leHRlbmQpOyB9XG4gIHNldFNlbGVjdGlvbihkb2MsIG5ldyBTZWxlY3Rpb24oW2V4dGVuZFJhbmdlKGRvYy5zZWwucHJpbWFyeSgpLCBoZWFkLCBvdGhlciwgZXh0ZW5kKV0sIDApLCBvcHRpb25zKTtcbn1cblxuLy8gRXh0ZW5kIGFsbCBzZWxlY3Rpb25zIChwb3MgaXMgYW4gYXJyYXkgb2Ygc2VsZWN0aW9ucyB3aXRoIGxlbmd0aFxuLy8gZXF1YWwgdGhlIG51bWJlciBvZiBzZWxlY3Rpb25zKVxuZnVuY3Rpb24gZXh0ZW5kU2VsZWN0aW9ucyhkb2MsIGhlYWRzLCBvcHRpb25zKSB7XG4gIHZhciBvdXQgPSBbXTtcbiAgdmFyIGV4dGVuZCA9IGRvYy5jbSAmJiAoZG9jLmNtLmRpc3BsYXkuc2hpZnQgfHwgZG9jLmV4dGVuZCk7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgZG9jLnNlbC5yYW5nZXMubGVuZ3RoOyBpKyspXG4gICAgeyBvdXRbaV0gPSBleHRlbmRSYW5nZShkb2Muc2VsLnJhbmdlc1tpXSwgaGVhZHNbaV0sIG51bGwsIGV4dGVuZCk7IH1cbiAgdmFyIG5ld1NlbCA9IG5vcm1hbGl6ZVNlbGVjdGlvbihvdXQsIGRvYy5zZWwucHJpbUluZGV4KTtcbiAgc2V0U2VsZWN0aW9uKGRvYywgbmV3U2VsLCBvcHRpb25zKTtcbn1cblxuLy8gVXBkYXRlcyBhIHNpbmdsZSByYW5nZSBpbiB0aGUgc2VsZWN0aW9uLlxuZnVuY3Rpb24gcmVwbGFjZU9uZVNlbGVjdGlvbihkb2MsIGksIHJhbmdlLCBvcHRpb25zKSB7XG4gIHZhciByYW5nZXMgPSBkb2Muc2VsLnJhbmdlcy5zbGljZSgwKTtcbiAgcmFuZ2VzW2ldID0gcmFuZ2U7XG4gIHNldFNlbGVjdGlvbihkb2MsIG5vcm1hbGl6ZVNlbGVjdGlvbihyYW5nZXMsIGRvYy5zZWwucHJpbUluZGV4KSwgb3B0aW9ucyk7XG59XG5cbi8vIFJlc2V0IHRoZSBzZWxlY3Rpb24gdG8gYSBzaW5nbGUgcmFuZ2UuXG5mdW5jdGlvbiBzZXRTaW1wbGVTZWxlY3Rpb24oZG9jLCBhbmNob3IsIGhlYWQsIG9wdGlvbnMpIHtcbiAgc2V0U2VsZWN0aW9uKGRvYywgc2ltcGxlU2VsZWN0aW9uKGFuY2hvciwgaGVhZCksIG9wdGlvbnMpO1xufVxuXG4vLyBHaXZlIGJlZm9yZVNlbGVjdGlvbkNoYW5nZSBoYW5kbGVycyBhIGNoYW5nZSB0byBpbmZsdWVuY2UgYVxuLy8gc2VsZWN0aW9uIHVwZGF0ZS5cbmZ1bmN0aW9uIGZpbHRlclNlbGVjdGlvbkNoYW5nZShkb2MsIHNlbCwgb3B0aW9ucykge1xuICB2YXIgb2JqID0ge1xuICAgIHJhbmdlczogc2VsLnJhbmdlcyxcbiAgICB1cGRhdGU6IGZ1bmN0aW9uKHJhbmdlcykge1xuICAgICAgdmFyIHRoaXMkMSA9IHRoaXM7XG5cbiAgICAgIHRoaXMucmFuZ2VzID0gW107XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHJhbmdlcy5sZW5ndGg7IGkrKylcbiAgICAgICAgeyB0aGlzJDEucmFuZ2VzW2ldID0gbmV3IFJhbmdlKGNsaXBQb3MoZG9jLCByYW5nZXNbaV0uYW5jaG9yKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY2xpcFBvcyhkb2MsIHJhbmdlc1tpXS5oZWFkKSk7IH1cbiAgICB9LFxuICAgIG9yaWdpbjogb3B0aW9ucyAmJiBvcHRpb25zLm9yaWdpblxuICB9O1xuICBzaWduYWwoZG9jLCBcImJlZm9yZVNlbGVjdGlvbkNoYW5nZVwiLCBkb2MsIG9iaik7XG4gIGlmIChkb2MuY20pIHsgc2lnbmFsKGRvYy5jbSwgXCJiZWZvcmVTZWxlY3Rpb25DaGFuZ2VcIiwgZG9jLmNtLCBvYmopOyB9XG4gIGlmIChvYmoucmFuZ2VzICE9IHNlbC5yYW5nZXMpIHsgcmV0dXJuIG5vcm1hbGl6ZVNlbGVjdGlvbihvYmoucmFuZ2VzLCBvYmoucmFuZ2VzLmxlbmd0aCAtIDEpIH1cbiAgZWxzZSB7IHJldHVybiBzZWwgfVxufVxuXG5mdW5jdGlvbiBzZXRTZWxlY3Rpb25SZXBsYWNlSGlzdG9yeShkb2MsIHNlbCwgb3B0aW9ucykge1xuICB2YXIgZG9uZSA9IGRvYy5oaXN0b3J5LmRvbmUsIGxhc3QgPSBsc3QoZG9uZSk7XG4gIGlmIChsYXN0ICYmIGxhc3QucmFuZ2VzKSB7XG4gICAgZG9uZVtkb25lLmxlbmd0aCAtIDFdID0gc2VsO1xuICAgIHNldFNlbGVjdGlvbk5vVW5kbyhkb2MsIHNlbCwgb3B0aW9ucyk7XG4gIH0gZWxzZSB7XG4gICAgc2V0U2VsZWN0aW9uKGRvYywgc2VsLCBvcHRpb25zKTtcbiAgfVxufVxuXG4vLyBTZXQgYSBuZXcgc2VsZWN0aW9uLlxuZnVuY3Rpb24gc2V0U2VsZWN0aW9uKGRvYywgc2VsLCBvcHRpb25zKSB7XG4gIHNldFNlbGVjdGlvbk5vVW5kbyhkb2MsIHNlbCwgb3B0aW9ucyk7XG4gIGFkZFNlbGVjdGlvblRvSGlzdG9yeShkb2MsIGRvYy5zZWwsIGRvYy5jbSA/IGRvYy5jbS5jdXJPcC5pZCA6IE5hTiwgb3B0aW9ucyk7XG59XG5cbmZ1bmN0aW9uIHNldFNlbGVjdGlvbk5vVW5kbyhkb2MsIHNlbCwgb3B0aW9ucykge1xuICBpZiAoaGFzSGFuZGxlcihkb2MsIFwiYmVmb3JlU2VsZWN0aW9uQ2hhbmdlXCIpIHx8IGRvYy5jbSAmJiBoYXNIYW5kbGVyKGRvYy5jbSwgXCJiZWZvcmVTZWxlY3Rpb25DaGFuZ2VcIikpXG4gICAgeyBzZWwgPSBmaWx0ZXJTZWxlY3Rpb25DaGFuZ2UoZG9jLCBzZWwsIG9wdGlvbnMpOyB9XG5cbiAgdmFyIGJpYXMgPSBvcHRpb25zICYmIG9wdGlvbnMuYmlhcyB8fFxuICAgIChjbXAoc2VsLnByaW1hcnkoKS5oZWFkLCBkb2Muc2VsLnByaW1hcnkoKS5oZWFkKSA8IDAgPyAtMSA6IDEpO1xuICBzZXRTZWxlY3Rpb25Jbm5lcihkb2MsIHNraXBBdG9taWNJblNlbGVjdGlvbihkb2MsIHNlbCwgYmlhcywgdHJ1ZSkpO1xuXG4gIGlmICghKG9wdGlvbnMgJiYgb3B0aW9ucy5zY3JvbGwgPT09IGZhbHNlKSAmJiBkb2MuY20pXG4gICAgeyBlbnN1cmVDdXJzb3JWaXNpYmxlKGRvYy5jbSk7IH1cbn1cblxuZnVuY3Rpb24gc2V0U2VsZWN0aW9uSW5uZXIoZG9jLCBzZWwpIHtcbiAgaWYgKHNlbC5lcXVhbHMoZG9jLnNlbCkpIHsgcmV0dXJuIH1cblxuICBkb2Muc2VsID0gc2VsO1xuXG4gIGlmIChkb2MuY20pIHtcbiAgICBkb2MuY20uY3VyT3AudXBkYXRlSW5wdXQgPSBkb2MuY20uY3VyT3Auc2VsZWN0aW9uQ2hhbmdlZCA9IHRydWU7XG4gICAgc2lnbmFsQ3Vyc29yQWN0aXZpdHkoZG9jLmNtKTtcbiAgfVxuICBzaWduYWxMYXRlcihkb2MsIFwiY3Vyc29yQWN0aXZpdHlcIiwgZG9jKTtcbn1cblxuLy8gVmVyaWZ5IHRoYXQgdGhlIHNlbGVjdGlvbiBkb2VzIG5vdCBwYXJ0aWFsbHkgc2VsZWN0IGFueSBhdG9taWNcbi8vIG1hcmtlZCByYW5nZXMuXG5mdW5jdGlvbiByZUNoZWNrU2VsZWN0aW9uKGRvYykge1xuICBzZXRTZWxlY3Rpb25Jbm5lcihkb2MsIHNraXBBdG9taWNJblNlbGVjdGlvbihkb2MsIGRvYy5zZWwsIG51bGwsIGZhbHNlKSk7XG59XG5cbi8vIFJldHVybiBhIHNlbGVjdGlvbiB0aGF0IGRvZXMgbm90IHBhcnRpYWxseSBzZWxlY3QgYW55IGF0b21pY1xuLy8gcmFuZ2VzLlxuZnVuY3Rpb24gc2tpcEF0b21pY0luU2VsZWN0aW9uKGRvYywgc2VsLCBiaWFzLCBtYXlDbGVhcikge1xuICB2YXIgb3V0O1xuICBmb3IgKHZhciBpID0gMDsgaSA8IHNlbC5yYW5nZXMubGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgcmFuZ2UgPSBzZWwucmFuZ2VzW2ldO1xuICAgIHZhciBvbGQgPSBzZWwucmFuZ2VzLmxlbmd0aCA9PSBkb2Muc2VsLnJhbmdlcy5sZW5ndGggJiYgZG9jLnNlbC5yYW5nZXNbaV07XG4gICAgdmFyIG5ld0FuY2hvciA9IHNraXBBdG9taWMoZG9jLCByYW5nZS5hbmNob3IsIG9sZCAmJiBvbGQuYW5jaG9yLCBiaWFzLCBtYXlDbGVhcik7XG4gICAgdmFyIG5ld0hlYWQgPSBza2lwQXRvbWljKGRvYywgcmFuZ2UuaGVhZCwgb2xkICYmIG9sZC5oZWFkLCBiaWFzLCBtYXlDbGVhcik7XG4gICAgaWYgKG91dCB8fCBuZXdBbmNob3IgIT0gcmFuZ2UuYW5jaG9yIHx8IG5ld0hlYWQgIT0gcmFuZ2UuaGVhZCkge1xuICAgICAgaWYgKCFvdXQpIHsgb3V0ID0gc2VsLnJhbmdlcy5zbGljZSgwLCBpKTsgfVxuICAgICAgb3V0W2ldID0gbmV3IFJhbmdlKG5ld0FuY2hvciwgbmV3SGVhZCk7XG4gICAgfVxuICB9XG4gIHJldHVybiBvdXQgPyBub3JtYWxpemVTZWxlY3Rpb24ob3V0LCBzZWwucHJpbUluZGV4KSA6IHNlbFxufVxuXG5mdW5jdGlvbiBza2lwQXRvbWljSW5uZXIoZG9jLCBwb3MsIG9sZFBvcywgZGlyLCBtYXlDbGVhcikge1xuICB2YXIgbGluZSA9IGdldExpbmUoZG9jLCBwb3MubGluZSk7XG4gIGlmIChsaW5lLm1hcmtlZFNwYW5zKSB7IGZvciAodmFyIGkgPSAwOyBpIDwgbGluZS5tYXJrZWRTcGFucy5sZW5ndGg7ICsraSkge1xuICAgIHZhciBzcCA9IGxpbmUubWFya2VkU3BhbnNbaV0sIG0gPSBzcC5tYXJrZXI7XG4gICAgaWYgKChzcC5mcm9tID09IG51bGwgfHwgKG0uaW5jbHVzaXZlTGVmdCA/IHNwLmZyb20gPD0gcG9zLmNoIDogc3AuZnJvbSA8IHBvcy5jaCkpICYmXG4gICAgICAgIChzcC50byA9PSBudWxsIHx8IChtLmluY2x1c2l2ZVJpZ2h0ID8gc3AudG8gPj0gcG9zLmNoIDogc3AudG8gPiBwb3MuY2gpKSkge1xuICAgICAgaWYgKG1heUNsZWFyKSB7XG4gICAgICAgIHNpZ25hbChtLCBcImJlZm9yZUN1cnNvckVudGVyXCIpO1xuICAgICAgICBpZiAobS5leHBsaWNpdGx5Q2xlYXJlZCkge1xuICAgICAgICAgIGlmICghbGluZS5tYXJrZWRTcGFucykgeyBicmVhayB9XG4gICAgICAgICAgZWxzZSB7LS1pOyBjb250aW51ZX1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKCFtLmF0b21pYykgeyBjb250aW51ZSB9XG5cbiAgICAgIGlmIChvbGRQb3MpIHtcbiAgICAgICAgdmFyIG5lYXIgPSBtLmZpbmQoZGlyIDwgMCA/IDEgOiAtMSksIGRpZmYgPSAodm9pZCAwKTtcbiAgICAgICAgaWYgKGRpciA8IDAgPyBtLmluY2x1c2l2ZVJpZ2h0IDogbS5pbmNsdXNpdmVMZWZ0KVxuICAgICAgICAgIHsgbmVhciA9IG1vdmVQb3MoZG9jLCBuZWFyLCAtZGlyLCBuZWFyICYmIG5lYXIubGluZSA9PSBwb3MubGluZSA/IGxpbmUgOiBudWxsKTsgfVxuICAgICAgICBpZiAobmVhciAmJiBuZWFyLmxpbmUgPT0gcG9zLmxpbmUgJiYgKGRpZmYgPSBjbXAobmVhciwgb2xkUG9zKSkgJiYgKGRpciA8IDAgPyBkaWZmIDwgMCA6IGRpZmYgPiAwKSlcbiAgICAgICAgICB7IHJldHVybiBza2lwQXRvbWljSW5uZXIoZG9jLCBuZWFyLCBwb3MsIGRpciwgbWF5Q2xlYXIpIH1cbiAgICAgIH1cblxuICAgICAgdmFyIGZhciA9IG0uZmluZChkaXIgPCAwID8gLTEgOiAxKTtcbiAgICAgIGlmIChkaXIgPCAwID8gbS5pbmNsdXNpdmVMZWZ0IDogbS5pbmNsdXNpdmVSaWdodClcbiAgICAgICAgeyBmYXIgPSBtb3ZlUG9zKGRvYywgZmFyLCBkaXIsIGZhci5saW5lID09IHBvcy5saW5lID8gbGluZSA6IG51bGwpOyB9XG4gICAgICByZXR1cm4gZmFyID8gc2tpcEF0b21pY0lubmVyKGRvYywgZmFyLCBwb3MsIGRpciwgbWF5Q2xlYXIpIDogbnVsbFxuICAgIH1cbiAgfSB9XG4gIHJldHVybiBwb3Ncbn1cblxuLy8gRW5zdXJlIGEgZ2l2ZW4gcG9zaXRpb24gaXMgbm90IGluc2lkZSBhbiBhdG9taWMgcmFuZ2UuXG5mdW5jdGlvbiBza2lwQXRvbWljKGRvYywgcG9zLCBvbGRQb3MsIGJpYXMsIG1heUNsZWFyKSB7XG4gIHZhciBkaXIgPSBiaWFzIHx8IDE7XG4gIHZhciBmb3VuZCA9IHNraXBBdG9taWNJbm5lcihkb2MsIHBvcywgb2xkUG9zLCBkaXIsIG1heUNsZWFyKSB8fFxuICAgICAgKCFtYXlDbGVhciAmJiBza2lwQXRvbWljSW5uZXIoZG9jLCBwb3MsIG9sZFBvcywgZGlyLCB0cnVlKSkgfHxcbiAgICAgIHNraXBBdG9taWNJbm5lcihkb2MsIHBvcywgb2xkUG9zLCAtZGlyLCBtYXlDbGVhcikgfHxcbiAgICAgICghbWF5Q2xlYXIgJiYgc2tpcEF0b21pY0lubmVyKGRvYywgcG9zLCBvbGRQb3MsIC1kaXIsIHRydWUpKTtcbiAgaWYgKCFmb3VuZCkge1xuICAgIGRvYy5jYW50RWRpdCA9IHRydWU7XG4gICAgcmV0dXJuIFBvcyhkb2MuZmlyc3QsIDApXG4gIH1cbiAgcmV0dXJuIGZvdW5kXG59XG5cbmZ1bmN0aW9uIG1vdmVQb3MoZG9jLCBwb3MsIGRpciwgbGluZSkge1xuICBpZiAoZGlyIDwgMCAmJiBwb3MuY2ggPT0gMCkge1xuICAgIGlmIChwb3MubGluZSA+IGRvYy5maXJzdCkgeyByZXR1cm4gY2xpcFBvcyhkb2MsIFBvcyhwb3MubGluZSAtIDEpKSB9XG4gICAgZWxzZSB7IHJldHVybiBudWxsIH1cbiAgfSBlbHNlIGlmIChkaXIgPiAwICYmIHBvcy5jaCA9PSAobGluZSB8fCBnZXRMaW5lKGRvYywgcG9zLmxpbmUpKS50ZXh0Lmxlbmd0aCkge1xuICAgIGlmIChwb3MubGluZSA8IGRvYy5maXJzdCArIGRvYy5zaXplIC0gMSkgeyByZXR1cm4gUG9zKHBvcy5saW5lICsgMSwgMCkgfVxuICAgIGVsc2UgeyByZXR1cm4gbnVsbCB9XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIG5ldyBQb3MocG9zLmxpbmUsIHBvcy5jaCArIGRpcilcbiAgfVxufVxuXG5mdW5jdGlvbiBzZWxlY3RBbGwoY20pIHtcbiAgY20uc2V0U2VsZWN0aW9uKFBvcyhjbS5maXJzdExpbmUoKSwgMCksIFBvcyhjbS5sYXN0TGluZSgpKSwgc2VsX2RvbnRTY3JvbGwpO1xufVxuXG4vLyBVUERBVElOR1xuXG4vLyBBbGxvdyBcImJlZm9yZUNoYW5nZVwiIGV2ZW50IGhhbmRsZXJzIHRvIGluZmx1ZW5jZSBhIGNoYW5nZVxuZnVuY3Rpb24gZmlsdGVyQ2hhbmdlKGRvYywgY2hhbmdlLCB1cGRhdGUpIHtcbiAgdmFyIG9iaiA9IHtcbiAgICBjYW5jZWxlZDogZmFsc2UsXG4gICAgZnJvbTogY2hhbmdlLmZyb20sXG4gICAgdG86IGNoYW5nZS50byxcbiAgICB0ZXh0OiBjaGFuZ2UudGV4dCxcbiAgICBvcmlnaW46IGNoYW5nZS5vcmlnaW4sXG4gICAgY2FuY2VsOiBmdW5jdGlvbiAoKSB7IHJldHVybiBvYmouY2FuY2VsZWQgPSB0cnVlOyB9XG4gIH07XG4gIGlmICh1cGRhdGUpIHsgb2JqLnVwZGF0ZSA9IGZ1bmN0aW9uIChmcm9tLCB0bywgdGV4dCwgb3JpZ2luKSB7XG4gICAgaWYgKGZyb20pIHsgb2JqLmZyb20gPSBjbGlwUG9zKGRvYywgZnJvbSk7IH1cbiAgICBpZiAodG8pIHsgb2JqLnRvID0gY2xpcFBvcyhkb2MsIHRvKTsgfVxuICAgIGlmICh0ZXh0KSB7IG9iai50ZXh0ID0gdGV4dDsgfVxuICAgIGlmIChvcmlnaW4gIT09IHVuZGVmaW5lZCkgeyBvYmoub3JpZ2luID0gb3JpZ2luOyB9XG4gIH07IH1cbiAgc2lnbmFsKGRvYywgXCJiZWZvcmVDaGFuZ2VcIiwgZG9jLCBvYmopO1xuICBpZiAoZG9jLmNtKSB7IHNpZ25hbChkb2MuY20sIFwiYmVmb3JlQ2hhbmdlXCIsIGRvYy5jbSwgb2JqKTsgfVxuXG4gIGlmIChvYmouY2FuY2VsZWQpIHsgcmV0dXJuIG51bGwgfVxuICByZXR1cm4ge2Zyb206IG9iai5mcm9tLCB0bzogb2JqLnRvLCB0ZXh0OiBvYmoudGV4dCwgb3JpZ2luOiBvYmoub3JpZ2lufVxufVxuXG4vLyBBcHBseSBhIGNoYW5nZSB0byBhIGRvY3VtZW50LCBhbmQgYWRkIGl0IHRvIHRoZSBkb2N1bWVudCdzXG4vLyBoaXN0b3J5LCBhbmQgcHJvcGFnYXRpbmcgaXQgdG8gYWxsIGxpbmtlZCBkb2N1bWVudHMuXG5mdW5jdGlvbiBtYWtlQ2hhbmdlKGRvYywgY2hhbmdlLCBpZ25vcmVSZWFkT25seSkge1xuICBpZiAoZG9jLmNtKSB7XG4gICAgaWYgKCFkb2MuY20uY3VyT3ApIHsgcmV0dXJuIG9wZXJhdGlvbihkb2MuY20sIG1ha2VDaGFuZ2UpKGRvYywgY2hhbmdlLCBpZ25vcmVSZWFkT25seSkgfVxuICAgIGlmIChkb2MuY20uc3RhdGUuc3VwcHJlc3NFZGl0cykgeyByZXR1cm4gfVxuICB9XG5cbiAgaWYgKGhhc0hhbmRsZXIoZG9jLCBcImJlZm9yZUNoYW5nZVwiKSB8fCBkb2MuY20gJiYgaGFzSGFuZGxlcihkb2MuY20sIFwiYmVmb3JlQ2hhbmdlXCIpKSB7XG4gICAgY2hhbmdlID0gZmlsdGVyQ2hhbmdlKGRvYywgY2hhbmdlLCB0cnVlKTtcbiAgICBpZiAoIWNoYW5nZSkgeyByZXR1cm4gfVxuICB9XG5cbiAgLy8gUG9zc2libHkgc3BsaXQgb3Igc3VwcHJlc3MgdGhlIHVwZGF0ZSBiYXNlZCBvbiB0aGUgcHJlc2VuY2VcbiAgLy8gb2YgcmVhZC1vbmx5IHNwYW5zIGluIGl0cyByYW5nZS5cbiAgdmFyIHNwbGl0ID0gc2F3UmVhZE9ubHlTcGFucyAmJiAhaWdub3JlUmVhZE9ubHkgJiYgcmVtb3ZlUmVhZE9ubHlSYW5nZXMoZG9jLCBjaGFuZ2UuZnJvbSwgY2hhbmdlLnRvKTtcbiAgaWYgKHNwbGl0KSB7XG4gICAgZm9yICh2YXIgaSA9IHNwbGl0Lmxlbmd0aCAtIDE7IGkgPj0gMDsgLS1pKVxuICAgICAgeyBtYWtlQ2hhbmdlSW5uZXIoZG9jLCB7ZnJvbTogc3BsaXRbaV0uZnJvbSwgdG86IHNwbGl0W2ldLnRvLCB0ZXh0OiBpID8gW1wiXCJdIDogY2hhbmdlLnRleHQsIG9yaWdpbjogY2hhbmdlLm9yaWdpbn0pOyB9XG4gIH0gZWxzZSB7XG4gICAgbWFrZUNoYW5nZUlubmVyKGRvYywgY2hhbmdlKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBtYWtlQ2hhbmdlSW5uZXIoZG9jLCBjaGFuZ2UpIHtcbiAgaWYgKGNoYW5nZS50ZXh0Lmxlbmd0aCA9PSAxICYmIGNoYW5nZS50ZXh0WzBdID09IFwiXCIgJiYgY21wKGNoYW5nZS5mcm9tLCBjaGFuZ2UudG8pID09IDApIHsgcmV0dXJuIH1cbiAgdmFyIHNlbEFmdGVyID0gY29tcHV0ZVNlbEFmdGVyQ2hhbmdlKGRvYywgY2hhbmdlKTtcbiAgYWRkQ2hhbmdlVG9IaXN0b3J5KGRvYywgY2hhbmdlLCBzZWxBZnRlciwgZG9jLmNtID8gZG9jLmNtLmN1ck9wLmlkIDogTmFOKTtcblxuICBtYWtlQ2hhbmdlU2luZ2xlRG9jKGRvYywgY2hhbmdlLCBzZWxBZnRlciwgc3RyZXRjaFNwYW5zT3ZlckNoYW5nZShkb2MsIGNoYW5nZSkpO1xuICB2YXIgcmViYXNlZCA9IFtdO1xuXG4gIGxpbmtlZERvY3MoZG9jLCBmdW5jdGlvbiAoZG9jLCBzaGFyZWRIaXN0KSB7XG4gICAgaWYgKCFzaGFyZWRIaXN0ICYmIGluZGV4T2YocmViYXNlZCwgZG9jLmhpc3RvcnkpID09IC0xKSB7XG4gICAgICByZWJhc2VIaXN0KGRvYy5oaXN0b3J5LCBjaGFuZ2UpO1xuICAgICAgcmViYXNlZC5wdXNoKGRvYy5oaXN0b3J5KTtcbiAgICB9XG4gICAgbWFrZUNoYW5nZVNpbmdsZURvYyhkb2MsIGNoYW5nZSwgbnVsbCwgc3RyZXRjaFNwYW5zT3ZlckNoYW5nZShkb2MsIGNoYW5nZSkpO1xuICB9KTtcbn1cblxuLy8gUmV2ZXJ0IGEgY2hhbmdlIHN0b3JlZCBpbiBhIGRvY3VtZW50J3MgaGlzdG9yeS5cbmZ1bmN0aW9uIG1ha2VDaGFuZ2VGcm9tSGlzdG9yeShkb2MsIHR5cGUsIGFsbG93U2VsZWN0aW9uT25seSkge1xuICB2YXIgc3VwcHJlc3MgPSBkb2MuY20gJiYgZG9jLmNtLnN0YXRlLnN1cHByZXNzRWRpdHM7XG4gIGlmIChzdXBwcmVzcyAmJiAhYWxsb3dTZWxlY3Rpb25Pbmx5KSB7IHJldHVybiB9XG5cbiAgdmFyIGhpc3QgPSBkb2MuaGlzdG9yeSwgZXZlbnQsIHNlbEFmdGVyID0gZG9jLnNlbDtcbiAgdmFyIHNvdXJjZSA9IHR5cGUgPT0gXCJ1bmRvXCIgPyBoaXN0LmRvbmUgOiBoaXN0LnVuZG9uZSwgZGVzdCA9IHR5cGUgPT0gXCJ1bmRvXCIgPyBoaXN0LnVuZG9uZSA6IGhpc3QuZG9uZTtcblxuICAvLyBWZXJpZnkgdGhhdCB0aGVyZSBpcyBhIHVzZWFibGUgZXZlbnQgKHNvIHRoYXQgY3RybC16IHdvbid0XG4gIC8vIG5lZWRsZXNzbHkgY2xlYXIgc2VsZWN0aW9uIGV2ZW50cylcbiAgdmFyIGkgPSAwO1xuICBmb3IgKDsgaSA8IHNvdXJjZS5sZW5ndGg7IGkrKykge1xuICAgIGV2ZW50ID0gc291cmNlW2ldO1xuICAgIGlmIChhbGxvd1NlbGVjdGlvbk9ubHkgPyBldmVudC5yYW5nZXMgJiYgIWV2ZW50LmVxdWFscyhkb2Muc2VsKSA6ICFldmVudC5yYW5nZXMpXG4gICAgICB7IGJyZWFrIH1cbiAgfVxuICBpZiAoaSA9PSBzb3VyY2UubGVuZ3RoKSB7IHJldHVybiB9XG4gIGhpc3QubGFzdE9yaWdpbiA9IGhpc3QubGFzdFNlbE9yaWdpbiA9IG51bGw7XG5cbiAgZm9yICg7Oykge1xuICAgIGV2ZW50ID0gc291cmNlLnBvcCgpO1xuICAgIGlmIChldmVudC5yYW5nZXMpIHtcbiAgICAgIHB1c2hTZWxlY3Rpb25Ub0hpc3RvcnkoZXZlbnQsIGRlc3QpO1xuICAgICAgaWYgKGFsbG93U2VsZWN0aW9uT25seSAmJiAhZXZlbnQuZXF1YWxzKGRvYy5zZWwpKSB7XG4gICAgICAgIHNldFNlbGVjdGlvbihkb2MsIGV2ZW50LCB7Y2xlYXJSZWRvOiBmYWxzZX0pO1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICAgIHNlbEFmdGVyID0gZXZlbnQ7XG4gICAgfSBlbHNlIGlmIChzdXBwcmVzcykge1xuICAgICAgc291cmNlLnB1c2goZXZlbnQpO1xuICAgICAgcmV0dXJuXG4gICAgfSBlbHNlIHsgYnJlYWsgfVxuICB9XG5cbiAgLy8gQnVpbGQgdXAgYSByZXZlcnNlIGNoYW5nZSBvYmplY3QgdG8gYWRkIHRvIHRoZSBvcHBvc2l0ZSBoaXN0b3J5XG4gIC8vIHN0YWNrIChyZWRvIHdoZW4gdW5kb2luZywgYW5kIHZpY2UgdmVyc2EpLlxuICB2YXIgYW50aUNoYW5nZXMgPSBbXTtcbiAgcHVzaFNlbGVjdGlvblRvSGlzdG9yeShzZWxBZnRlciwgZGVzdCk7XG4gIGRlc3QucHVzaCh7Y2hhbmdlczogYW50aUNoYW5nZXMsIGdlbmVyYXRpb246IGhpc3QuZ2VuZXJhdGlvbn0pO1xuICBoaXN0LmdlbmVyYXRpb24gPSBldmVudC5nZW5lcmF0aW9uIHx8ICsraGlzdC5tYXhHZW5lcmF0aW9uO1xuXG4gIHZhciBmaWx0ZXIgPSBoYXNIYW5kbGVyKGRvYywgXCJiZWZvcmVDaGFuZ2VcIikgfHwgZG9jLmNtICYmIGhhc0hhbmRsZXIoZG9jLmNtLCBcImJlZm9yZUNoYW5nZVwiKTtcblxuICB2YXIgbG9vcCA9IGZ1bmN0aW9uICggaSApIHtcbiAgICB2YXIgY2hhbmdlID0gZXZlbnQuY2hhbmdlc1tpXTtcbiAgICBjaGFuZ2Uub3JpZ2luID0gdHlwZTtcbiAgICBpZiAoZmlsdGVyICYmICFmaWx0ZXJDaGFuZ2UoZG9jLCBjaGFuZ2UsIGZhbHNlKSkge1xuICAgICAgc291cmNlLmxlbmd0aCA9IDA7XG4gICAgICByZXR1cm4ge31cbiAgICB9XG5cbiAgICBhbnRpQ2hhbmdlcy5wdXNoKGhpc3RvcnlDaGFuZ2VGcm9tQ2hhbmdlKGRvYywgY2hhbmdlKSk7XG5cbiAgICB2YXIgYWZ0ZXIgPSBpID8gY29tcHV0ZVNlbEFmdGVyQ2hhbmdlKGRvYywgY2hhbmdlKSA6IGxzdChzb3VyY2UpO1xuICAgIG1ha2VDaGFuZ2VTaW5nbGVEb2MoZG9jLCBjaGFuZ2UsIGFmdGVyLCBtZXJnZU9sZFNwYW5zKGRvYywgY2hhbmdlKSk7XG4gICAgaWYgKCFpICYmIGRvYy5jbSkgeyBkb2MuY20uc2Nyb2xsSW50b1ZpZXcoe2Zyb206IGNoYW5nZS5mcm9tLCB0bzogY2hhbmdlRW5kKGNoYW5nZSl9KTsgfVxuICAgIHZhciByZWJhc2VkID0gW107XG5cbiAgICAvLyBQcm9wYWdhdGUgdG8gdGhlIGxpbmtlZCBkb2N1bWVudHNcbiAgICBsaW5rZWREb2NzKGRvYywgZnVuY3Rpb24gKGRvYywgc2hhcmVkSGlzdCkge1xuICAgICAgaWYgKCFzaGFyZWRIaXN0ICYmIGluZGV4T2YocmViYXNlZCwgZG9jLmhpc3RvcnkpID09IC0xKSB7XG4gICAgICAgIHJlYmFzZUhpc3QoZG9jLmhpc3RvcnksIGNoYW5nZSk7XG4gICAgICAgIHJlYmFzZWQucHVzaChkb2MuaGlzdG9yeSk7XG4gICAgICB9XG4gICAgICBtYWtlQ2hhbmdlU2luZ2xlRG9jKGRvYywgY2hhbmdlLCBudWxsLCBtZXJnZU9sZFNwYW5zKGRvYywgY2hhbmdlKSk7XG4gICAgfSk7XG4gIH07XG5cbiAgZm9yICh2YXIgaSQxID0gZXZlbnQuY2hhbmdlcy5sZW5ndGggLSAxOyBpJDEgPj0gMDsgLS1pJDEpIHtcbiAgICB2YXIgcmV0dXJuZWQgPSBsb29wKCBpJDEgKTtcblxuICAgIGlmICggcmV0dXJuZWQgKSByZXR1cm4gcmV0dXJuZWQudjtcbiAgfVxufVxuXG4vLyBTdWItdmlld3MgbmVlZCB0aGVpciBsaW5lIG51bWJlcnMgc2hpZnRlZCB3aGVuIHRleHQgaXMgYWRkZWRcbi8vIGFib3ZlIG9yIGJlbG93IHRoZW0gaW4gdGhlIHBhcmVudCBkb2N1bWVudC5cbmZ1bmN0aW9uIHNoaWZ0RG9jKGRvYywgZGlzdGFuY2UpIHtcbiAgaWYgKGRpc3RhbmNlID09IDApIHsgcmV0dXJuIH1cbiAgZG9jLmZpcnN0ICs9IGRpc3RhbmNlO1xuICBkb2Muc2VsID0gbmV3IFNlbGVjdGlvbihtYXAoZG9jLnNlbC5yYW5nZXMsIGZ1bmN0aW9uIChyYW5nZSkgeyByZXR1cm4gbmV3IFJhbmdlKFxuICAgIFBvcyhyYW5nZS5hbmNob3IubGluZSArIGRpc3RhbmNlLCByYW5nZS5hbmNob3IuY2gpLFxuICAgIFBvcyhyYW5nZS5oZWFkLmxpbmUgKyBkaXN0YW5jZSwgcmFuZ2UuaGVhZC5jaClcbiAgKTsgfSksIGRvYy5zZWwucHJpbUluZGV4KTtcbiAgaWYgKGRvYy5jbSkge1xuICAgIHJlZ0NoYW5nZShkb2MuY20sIGRvYy5maXJzdCwgZG9jLmZpcnN0IC0gZGlzdGFuY2UsIGRpc3RhbmNlKTtcbiAgICBmb3IgKHZhciBkID0gZG9jLmNtLmRpc3BsYXksIGwgPSBkLnZpZXdGcm9tOyBsIDwgZC52aWV3VG87IGwrKylcbiAgICAgIHsgcmVnTGluZUNoYW5nZShkb2MuY20sIGwsIFwiZ3V0dGVyXCIpOyB9XG4gIH1cbn1cblxuLy8gTW9yZSBsb3dlci1sZXZlbCBjaGFuZ2UgZnVuY3Rpb24sIGhhbmRsaW5nIG9ubHkgYSBzaW5nbGUgZG9jdW1lbnRcbi8vIChub3QgbGlua2VkIG9uZXMpLlxuZnVuY3Rpb24gbWFrZUNoYW5nZVNpbmdsZURvYyhkb2MsIGNoYW5nZSwgc2VsQWZ0ZXIsIHNwYW5zKSB7XG4gIGlmIChkb2MuY20gJiYgIWRvYy5jbS5jdXJPcClcbiAgICB7IHJldHVybiBvcGVyYXRpb24oZG9jLmNtLCBtYWtlQ2hhbmdlU2luZ2xlRG9jKShkb2MsIGNoYW5nZSwgc2VsQWZ0ZXIsIHNwYW5zKSB9XG5cbiAgaWYgKGNoYW5nZS50by5saW5lIDwgZG9jLmZpcnN0KSB7XG4gICAgc2hpZnREb2MoZG9jLCBjaGFuZ2UudGV4dC5sZW5ndGggLSAxIC0gKGNoYW5nZS50by5saW5lIC0gY2hhbmdlLmZyb20ubGluZSkpO1xuICAgIHJldHVyblxuICB9XG4gIGlmIChjaGFuZ2UuZnJvbS5saW5lID4gZG9jLmxhc3RMaW5lKCkpIHsgcmV0dXJuIH1cblxuICAvLyBDbGlwIHRoZSBjaGFuZ2UgdG8gdGhlIHNpemUgb2YgdGhpcyBkb2NcbiAgaWYgKGNoYW5nZS5mcm9tLmxpbmUgPCBkb2MuZmlyc3QpIHtcbiAgICB2YXIgc2hpZnQgPSBjaGFuZ2UudGV4dC5sZW5ndGggLSAxIC0gKGRvYy5maXJzdCAtIGNoYW5nZS5mcm9tLmxpbmUpO1xuICAgIHNoaWZ0RG9jKGRvYywgc2hpZnQpO1xuICAgIGNoYW5nZSA9IHtmcm9tOiBQb3MoZG9jLmZpcnN0LCAwKSwgdG86IFBvcyhjaGFuZ2UudG8ubGluZSArIHNoaWZ0LCBjaGFuZ2UudG8uY2gpLFxuICAgICAgICAgICAgICB0ZXh0OiBbbHN0KGNoYW5nZS50ZXh0KV0sIG9yaWdpbjogY2hhbmdlLm9yaWdpbn07XG4gIH1cbiAgdmFyIGxhc3QgPSBkb2MubGFzdExpbmUoKTtcbiAgaWYgKGNoYW5nZS50by5saW5lID4gbGFzdCkge1xuICAgIGNoYW5nZSA9IHtmcm9tOiBjaGFuZ2UuZnJvbSwgdG86IFBvcyhsYXN0LCBnZXRMaW5lKGRvYywgbGFzdCkudGV4dC5sZW5ndGgpLFxuICAgICAgICAgICAgICB0ZXh0OiBbY2hhbmdlLnRleHRbMF1dLCBvcmlnaW46IGNoYW5nZS5vcmlnaW59O1xuICB9XG5cbiAgY2hhbmdlLnJlbW92ZWQgPSBnZXRCZXR3ZWVuKGRvYywgY2hhbmdlLmZyb20sIGNoYW5nZS50byk7XG5cbiAgaWYgKCFzZWxBZnRlcikgeyBzZWxBZnRlciA9IGNvbXB1dGVTZWxBZnRlckNoYW5nZShkb2MsIGNoYW5nZSk7IH1cbiAgaWYgKGRvYy5jbSkgeyBtYWtlQ2hhbmdlU2luZ2xlRG9jSW5FZGl0b3IoZG9jLmNtLCBjaGFuZ2UsIHNwYW5zKTsgfVxuICBlbHNlIHsgdXBkYXRlRG9jKGRvYywgY2hhbmdlLCBzcGFucyk7IH1cbiAgc2V0U2VsZWN0aW9uTm9VbmRvKGRvYywgc2VsQWZ0ZXIsIHNlbF9kb250U2Nyb2xsKTtcbn1cblxuLy8gSGFuZGxlIHRoZSBpbnRlcmFjdGlvbiBvZiBhIGNoYW5nZSB0byBhIGRvY3VtZW50IHdpdGggdGhlIGVkaXRvclxuLy8gdGhhdCB0aGlzIGRvY3VtZW50IGlzIHBhcnQgb2YuXG5mdW5jdGlvbiBtYWtlQ2hhbmdlU2luZ2xlRG9jSW5FZGl0b3IoY20sIGNoYW5nZSwgc3BhbnMpIHtcbiAgdmFyIGRvYyA9IGNtLmRvYywgZGlzcGxheSA9IGNtLmRpc3BsYXksIGZyb20gPSBjaGFuZ2UuZnJvbSwgdG8gPSBjaGFuZ2UudG87XG5cbiAgdmFyIHJlY29tcHV0ZU1heExlbmd0aCA9IGZhbHNlLCBjaGVja1dpZHRoU3RhcnQgPSBmcm9tLmxpbmU7XG4gIGlmICghY20ub3B0aW9ucy5saW5lV3JhcHBpbmcpIHtcbiAgICBjaGVja1dpZHRoU3RhcnQgPSBsaW5lTm8odmlzdWFsTGluZShnZXRMaW5lKGRvYywgZnJvbS5saW5lKSkpO1xuICAgIGRvYy5pdGVyKGNoZWNrV2lkdGhTdGFydCwgdG8ubGluZSArIDEsIGZ1bmN0aW9uIChsaW5lKSB7XG4gICAgICBpZiAobGluZSA9PSBkaXNwbGF5Lm1heExpbmUpIHtcbiAgICAgICAgcmVjb21wdXRlTWF4TGVuZ3RoID0gdHJ1ZTtcbiAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIGlmIChkb2Muc2VsLmNvbnRhaW5zKGNoYW5nZS5mcm9tLCBjaGFuZ2UudG8pID4gLTEpXG4gICAgeyBzaWduYWxDdXJzb3JBY3Rpdml0eShjbSk7IH1cblxuICB1cGRhdGVEb2MoZG9jLCBjaGFuZ2UsIHNwYW5zLCBlc3RpbWF0ZUhlaWdodChjbSkpO1xuXG4gIGlmICghY20ub3B0aW9ucy5saW5lV3JhcHBpbmcpIHtcbiAgICBkb2MuaXRlcihjaGVja1dpZHRoU3RhcnQsIGZyb20ubGluZSArIGNoYW5nZS50ZXh0Lmxlbmd0aCwgZnVuY3Rpb24gKGxpbmUpIHtcbiAgICAgIHZhciBsZW4gPSBsaW5lTGVuZ3RoKGxpbmUpO1xuICAgICAgaWYgKGxlbiA+IGRpc3BsYXkubWF4TGluZUxlbmd0aCkge1xuICAgICAgICBkaXNwbGF5Lm1heExpbmUgPSBsaW5lO1xuICAgICAgICBkaXNwbGF5Lm1heExpbmVMZW5ndGggPSBsZW47XG4gICAgICAgIGRpc3BsYXkubWF4TGluZUNoYW5nZWQgPSB0cnVlO1xuICAgICAgICByZWNvbXB1dGVNYXhMZW5ndGggPSBmYWxzZTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICBpZiAocmVjb21wdXRlTWF4TGVuZ3RoKSB7IGNtLmN1ck9wLnVwZGF0ZU1heExpbmUgPSB0cnVlOyB9XG4gIH1cblxuICByZXRyZWF0RnJvbnRpZXIoZG9jLCBmcm9tLmxpbmUpO1xuICBzdGFydFdvcmtlcihjbSwgNDAwKTtcblxuICB2YXIgbGVuZGlmZiA9IGNoYW5nZS50ZXh0Lmxlbmd0aCAtICh0by5saW5lIC0gZnJvbS5saW5lKSAtIDE7XG4gIC8vIFJlbWVtYmVyIHRoYXQgdGhlc2UgbGluZXMgY2hhbmdlZCwgZm9yIHVwZGF0aW5nIHRoZSBkaXNwbGF5XG4gIGlmIChjaGFuZ2UuZnVsbClcbiAgICB7IHJlZ0NoYW5nZShjbSk7IH1cbiAgZWxzZSBpZiAoZnJvbS5saW5lID09IHRvLmxpbmUgJiYgY2hhbmdlLnRleHQubGVuZ3RoID09IDEgJiYgIWlzV2hvbGVMaW5lVXBkYXRlKGNtLmRvYywgY2hhbmdlKSlcbiAgICB7IHJlZ0xpbmVDaGFuZ2UoY20sIGZyb20ubGluZSwgXCJ0ZXh0XCIpOyB9XG4gIGVsc2VcbiAgICB7IHJlZ0NoYW5nZShjbSwgZnJvbS5saW5lLCB0by5saW5lICsgMSwgbGVuZGlmZik7IH1cblxuICB2YXIgY2hhbmdlc0hhbmRsZXIgPSBoYXNIYW5kbGVyKGNtLCBcImNoYW5nZXNcIiksIGNoYW5nZUhhbmRsZXIgPSBoYXNIYW5kbGVyKGNtLCBcImNoYW5nZVwiKTtcbiAgaWYgKGNoYW5nZUhhbmRsZXIgfHwgY2hhbmdlc0hhbmRsZXIpIHtcbiAgICB2YXIgb2JqID0ge1xuICAgICAgZnJvbTogZnJvbSwgdG86IHRvLFxuICAgICAgdGV4dDogY2hhbmdlLnRleHQsXG4gICAgICByZW1vdmVkOiBjaGFuZ2UucmVtb3ZlZCxcbiAgICAgIG9yaWdpbjogY2hhbmdlLm9yaWdpblxuICAgIH07XG4gICAgaWYgKGNoYW5nZUhhbmRsZXIpIHsgc2lnbmFsTGF0ZXIoY20sIFwiY2hhbmdlXCIsIGNtLCBvYmopOyB9XG4gICAgaWYgKGNoYW5nZXNIYW5kbGVyKSB7IChjbS5jdXJPcC5jaGFuZ2VPYmpzIHx8IChjbS5jdXJPcC5jaGFuZ2VPYmpzID0gW10pKS5wdXNoKG9iaik7IH1cbiAgfVxuICBjbS5kaXNwbGF5LnNlbEZvckNvbnRleHRNZW51ID0gbnVsbDtcbn1cblxuZnVuY3Rpb24gcmVwbGFjZVJhbmdlKGRvYywgY29kZSwgZnJvbSwgdG8sIG9yaWdpbikge1xuICBpZiAoIXRvKSB7IHRvID0gZnJvbTsgfVxuICBpZiAoY21wKHRvLCBmcm9tKSA8IDApIHsgdmFyIGFzc2lnbjtcbiAgICAoYXNzaWduID0gW3RvLCBmcm9tXSwgZnJvbSA9IGFzc2lnblswXSwgdG8gPSBhc3NpZ25bMV0pOyB9XG4gIGlmICh0eXBlb2YgY29kZSA9PSBcInN0cmluZ1wiKSB7IGNvZGUgPSBkb2Muc3BsaXRMaW5lcyhjb2RlKTsgfVxuICBtYWtlQ2hhbmdlKGRvYywge2Zyb206IGZyb20sIHRvOiB0bywgdGV4dDogY29kZSwgb3JpZ2luOiBvcmlnaW59KTtcbn1cblxuLy8gUmViYXNpbmcvcmVzZXR0aW5nIGhpc3RvcnkgdG8gZGVhbCB3aXRoIGV4dGVybmFsbHktc291cmNlZCBjaGFuZ2VzXG5cbmZ1bmN0aW9uIHJlYmFzZUhpc3RTZWxTaW5nbGUocG9zLCBmcm9tLCB0bywgZGlmZikge1xuICBpZiAodG8gPCBwb3MubGluZSkge1xuICAgIHBvcy5saW5lICs9IGRpZmY7XG4gIH0gZWxzZSBpZiAoZnJvbSA8IHBvcy5saW5lKSB7XG4gICAgcG9zLmxpbmUgPSBmcm9tO1xuICAgIHBvcy5jaCA9IDA7XG4gIH1cbn1cblxuLy8gVHJpZXMgdG8gcmViYXNlIGFuIGFycmF5IG9mIGhpc3RvcnkgZXZlbnRzIGdpdmVuIGEgY2hhbmdlIGluIHRoZVxuLy8gZG9jdW1lbnQuIElmIHRoZSBjaGFuZ2UgdG91Y2hlcyB0aGUgc2FtZSBsaW5lcyBhcyB0aGUgZXZlbnQsIHRoZVxuLy8gZXZlbnQsIGFuZCBldmVyeXRoaW5nICdiZWhpbmQnIGl0LCBpcyBkaXNjYXJkZWQuIElmIHRoZSBjaGFuZ2UgaXNcbi8vIGJlZm9yZSB0aGUgZXZlbnQsIHRoZSBldmVudCdzIHBvc2l0aW9ucyBhcmUgdXBkYXRlZC4gVXNlcyBhXG4vLyBjb3B5LW9uLXdyaXRlIHNjaGVtZSBmb3IgdGhlIHBvc2l0aW9ucywgdG8gYXZvaWQgaGF2aW5nIHRvXG4vLyByZWFsbG9jYXRlIHRoZW0gYWxsIG9uIGV2ZXJ5IHJlYmFzZSwgYnV0IGFsc28gYXZvaWQgcHJvYmxlbXMgd2l0aFxuLy8gc2hhcmVkIHBvc2l0aW9uIG9iamVjdHMgYmVpbmcgdW5zYWZlbHkgdXBkYXRlZC5cbmZ1bmN0aW9uIHJlYmFzZUhpc3RBcnJheShhcnJheSwgZnJvbSwgdG8sIGRpZmYpIHtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcnJheS5sZW5ndGg7ICsraSkge1xuICAgIHZhciBzdWIgPSBhcnJheVtpXSwgb2sgPSB0cnVlO1xuICAgIGlmIChzdWIucmFuZ2VzKSB7XG4gICAgICBpZiAoIXN1Yi5jb3BpZWQpIHsgc3ViID0gYXJyYXlbaV0gPSBzdWIuZGVlcENvcHkoKTsgc3ViLmNvcGllZCA9IHRydWU7IH1cbiAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgc3ViLnJhbmdlcy5sZW5ndGg7IGorKykge1xuICAgICAgICByZWJhc2VIaXN0U2VsU2luZ2xlKHN1Yi5yYW5nZXNbal0uYW5jaG9yLCBmcm9tLCB0bywgZGlmZik7XG4gICAgICAgIHJlYmFzZUhpc3RTZWxTaW5nbGUoc3ViLnJhbmdlc1tqXS5oZWFkLCBmcm9tLCB0bywgZGlmZik7XG4gICAgICB9XG4gICAgICBjb250aW51ZVxuICAgIH1cbiAgICBmb3IgKHZhciBqJDEgPSAwOyBqJDEgPCBzdWIuY2hhbmdlcy5sZW5ndGg7ICsraiQxKSB7XG4gICAgICB2YXIgY3VyID0gc3ViLmNoYW5nZXNbaiQxXTtcbiAgICAgIGlmICh0byA8IGN1ci5mcm9tLmxpbmUpIHtcbiAgICAgICAgY3VyLmZyb20gPSBQb3MoY3VyLmZyb20ubGluZSArIGRpZmYsIGN1ci5mcm9tLmNoKTtcbiAgICAgICAgY3VyLnRvID0gUG9zKGN1ci50by5saW5lICsgZGlmZiwgY3VyLnRvLmNoKTtcbiAgICAgIH0gZWxzZSBpZiAoZnJvbSA8PSBjdXIudG8ubGluZSkge1xuICAgICAgICBvayA9IGZhbHNlO1xuICAgICAgICBicmVha1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAoIW9rKSB7XG4gICAgICBhcnJheS5zcGxpY2UoMCwgaSArIDEpO1xuICAgICAgaSA9IDA7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIHJlYmFzZUhpc3QoaGlzdCwgY2hhbmdlKSB7XG4gIHZhciBmcm9tID0gY2hhbmdlLmZyb20ubGluZSwgdG8gPSBjaGFuZ2UudG8ubGluZSwgZGlmZiA9IGNoYW5nZS50ZXh0Lmxlbmd0aCAtICh0byAtIGZyb20pIC0gMTtcbiAgcmViYXNlSGlzdEFycmF5KGhpc3QuZG9uZSwgZnJvbSwgdG8sIGRpZmYpO1xuICByZWJhc2VIaXN0QXJyYXkoaGlzdC51bmRvbmUsIGZyb20sIHRvLCBkaWZmKTtcbn1cblxuLy8gVXRpbGl0eSBmb3IgYXBwbHlpbmcgYSBjaGFuZ2UgdG8gYSBsaW5lIGJ5IGhhbmRsZSBvciBudW1iZXIsXG4vLyByZXR1cm5pbmcgdGhlIG51bWJlciBhbmQgb3B0aW9uYWxseSByZWdpc3RlcmluZyB0aGUgbGluZSBhc1xuLy8gY2hhbmdlZC5cbmZ1bmN0aW9uIGNoYW5nZUxpbmUoZG9jLCBoYW5kbGUsIGNoYW5nZVR5cGUsIG9wKSB7XG4gIHZhciBubyA9IGhhbmRsZSwgbGluZSA9IGhhbmRsZTtcbiAgaWYgKHR5cGVvZiBoYW5kbGUgPT0gXCJudW1iZXJcIikgeyBsaW5lID0gZ2V0TGluZShkb2MsIGNsaXBMaW5lKGRvYywgaGFuZGxlKSk7IH1cbiAgZWxzZSB7IG5vID0gbGluZU5vKGhhbmRsZSk7IH1cbiAgaWYgKG5vID09IG51bGwpIHsgcmV0dXJuIG51bGwgfVxuICBpZiAob3AobGluZSwgbm8pICYmIGRvYy5jbSkgeyByZWdMaW5lQ2hhbmdlKGRvYy5jbSwgbm8sIGNoYW5nZVR5cGUpOyB9XG4gIHJldHVybiBsaW5lXG59XG5cbi8vIFRoZSBkb2N1bWVudCBpcyByZXByZXNlbnRlZCBhcyBhIEJUcmVlIGNvbnNpc3Rpbmcgb2YgbGVhdmVzLCB3aXRoXG4vLyBjaHVuayBvZiBsaW5lcyBpbiB0aGVtLCBhbmQgYnJhbmNoZXMsIHdpdGggdXAgdG8gdGVuIGxlYXZlcyBvclxuLy8gb3RoZXIgYnJhbmNoIG5vZGVzIGJlbG93IHRoZW0uIFRoZSB0b3Agbm9kZSBpcyBhbHdheXMgYSBicmFuY2hcbi8vIG5vZGUsIGFuZCBpcyB0aGUgZG9jdW1lbnQgb2JqZWN0IGl0c2VsZiAobWVhbmluZyBpdCBoYXNcbi8vIGFkZGl0aW9uYWwgbWV0aG9kcyBhbmQgcHJvcGVydGllcykuXG4vL1xuLy8gQWxsIG5vZGVzIGhhdmUgcGFyZW50IGxpbmtzLiBUaGUgdHJlZSBpcyB1c2VkIGJvdGggdG8gZ28gZnJvbVxuLy8gbGluZSBudW1iZXJzIHRvIGxpbmUgb2JqZWN0cywgYW5kIHRvIGdvIGZyb20gb2JqZWN0cyB0byBudW1iZXJzLlxuLy8gSXQgYWxzbyBpbmRleGVzIGJ5IGhlaWdodCwgYW5kIGlzIHVzZWQgdG8gY29udmVydCBiZXR3ZWVuIGhlaWdodFxuLy8gYW5kIGxpbmUgb2JqZWN0LCBhbmQgdG8gZmluZCB0aGUgdG90YWwgaGVpZ2h0IG9mIHRoZSBkb2N1bWVudC5cbi8vXG4vLyBTZWUgYWxzbyBodHRwOi8vbWFyaWpuaGF2ZXJiZWtlLm5sL2Jsb2cvY29kZW1pcnJvci1saW5lLXRyZWUuaHRtbFxuXG5mdW5jdGlvbiBMZWFmQ2h1bmsobGluZXMpIHtcbiAgdmFyIHRoaXMkMSA9IHRoaXM7XG5cbiAgdGhpcy5saW5lcyA9IGxpbmVzO1xuICB0aGlzLnBhcmVudCA9IG51bGw7XG4gIHZhciBoZWlnaHQgPSAwO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGxpbmVzLmxlbmd0aDsgKytpKSB7XG4gICAgbGluZXNbaV0ucGFyZW50ID0gdGhpcyQxO1xuICAgIGhlaWdodCArPSBsaW5lc1tpXS5oZWlnaHQ7XG4gIH1cbiAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG59XG5cbkxlYWZDaHVuay5wcm90b3R5cGUgPSB7XG4gIGNodW5rU2l6ZTogZnVuY3Rpb24oKSB7IHJldHVybiB0aGlzLmxpbmVzLmxlbmd0aCB9LFxuXG4gIC8vIFJlbW92ZSB0aGUgbiBsaW5lcyBhdCBvZmZzZXQgJ2F0Jy5cbiAgcmVtb3ZlSW5uZXI6IGZ1bmN0aW9uKGF0LCBuKSB7XG4gICAgdmFyIHRoaXMkMSA9IHRoaXM7XG5cbiAgICBmb3IgKHZhciBpID0gYXQsIGUgPSBhdCArIG47IGkgPCBlOyArK2kpIHtcbiAgICAgIHZhciBsaW5lID0gdGhpcyQxLmxpbmVzW2ldO1xuICAgICAgdGhpcyQxLmhlaWdodCAtPSBsaW5lLmhlaWdodDtcbiAgICAgIGNsZWFuVXBMaW5lKGxpbmUpO1xuICAgICAgc2lnbmFsTGF0ZXIobGluZSwgXCJkZWxldGVcIik7XG4gICAgfVxuICAgIHRoaXMubGluZXMuc3BsaWNlKGF0LCBuKTtcbiAgfSxcblxuICAvLyBIZWxwZXIgdXNlZCB0byBjb2xsYXBzZSBhIHNtYWxsIGJyYW5jaCBpbnRvIGEgc2luZ2xlIGxlYWYuXG4gIGNvbGxhcHNlOiBmdW5jdGlvbihsaW5lcykge1xuICAgIGxpbmVzLnB1c2guYXBwbHkobGluZXMsIHRoaXMubGluZXMpO1xuICB9LFxuXG4gIC8vIEluc2VydCB0aGUgZ2l2ZW4gYXJyYXkgb2YgbGluZXMgYXQgb2Zmc2V0ICdhdCcsIGNvdW50IHRoZW0gYXNcbiAgLy8gaGF2aW5nIHRoZSBnaXZlbiBoZWlnaHQuXG4gIGluc2VydElubmVyOiBmdW5jdGlvbihhdCwgbGluZXMsIGhlaWdodCkge1xuICAgIHZhciB0aGlzJDEgPSB0aGlzO1xuXG4gICAgdGhpcy5oZWlnaHQgKz0gaGVpZ2h0O1xuICAgIHRoaXMubGluZXMgPSB0aGlzLmxpbmVzLnNsaWNlKDAsIGF0KS5jb25jYXQobGluZXMpLmNvbmNhdCh0aGlzLmxpbmVzLnNsaWNlKGF0KSk7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsaW5lcy5sZW5ndGg7ICsraSkgeyBsaW5lc1tpXS5wYXJlbnQgPSB0aGlzJDE7IH1cbiAgfSxcblxuICAvLyBVc2VkIHRvIGl0ZXJhdGUgb3ZlciBhIHBhcnQgb2YgdGhlIHRyZWUuXG4gIGl0ZXJOOiBmdW5jdGlvbihhdCwgbiwgb3ApIHtcbiAgICB2YXIgdGhpcyQxID0gdGhpcztcblxuICAgIGZvciAodmFyIGUgPSBhdCArIG47IGF0IDwgZTsgKythdClcbiAgICAgIHsgaWYgKG9wKHRoaXMkMS5saW5lc1thdF0pKSB7IHJldHVybiB0cnVlIH0gfVxuICB9XG59O1xuXG5mdW5jdGlvbiBCcmFuY2hDaHVuayhjaGlsZHJlbikge1xuICB2YXIgdGhpcyQxID0gdGhpcztcblxuICB0aGlzLmNoaWxkcmVuID0gY2hpbGRyZW47XG4gIHZhciBzaXplID0gMCwgaGVpZ2h0ID0gMDtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBjaGlsZHJlbi5sZW5ndGg7ICsraSkge1xuICAgIHZhciBjaCA9IGNoaWxkcmVuW2ldO1xuICAgIHNpemUgKz0gY2guY2h1bmtTaXplKCk7IGhlaWdodCArPSBjaC5oZWlnaHQ7XG4gICAgY2gucGFyZW50ID0gdGhpcyQxO1xuICB9XG4gIHRoaXMuc2l6ZSA9IHNpemU7XG4gIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xuICB0aGlzLnBhcmVudCA9IG51bGw7XG59XG5cbkJyYW5jaENodW5rLnByb3RvdHlwZSA9IHtcbiAgY2h1bmtTaXplOiBmdW5jdGlvbigpIHsgcmV0dXJuIHRoaXMuc2l6ZSB9LFxuXG4gIHJlbW92ZUlubmVyOiBmdW5jdGlvbihhdCwgbikge1xuICAgIHZhciB0aGlzJDEgPSB0aGlzO1xuXG4gICAgdGhpcy5zaXplIC09IG47XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLmNoaWxkcmVuLmxlbmd0aDsgKytpKSB7XG4gICAgICB2YXIgY2hpbGQgPSB0aGlzJDEuY2hpbGRyZW5baV0sIHN6ID0gY2hpbGQuY2h1bmtTaXplKCk7XG4gICAgICBpZiAoYXQgPCBzeikge1xuICAgICAgICB2YXIgcm0gPSBNYXRoLm1pbihuLCBzeiAtIGF0KSwgb2xkSGVpZ2h0ID0gY2hpbGQuaGVpZ2h0O1xuICAgICAgICBjaGlsZC5yZW1vdmVJbm5lcihhdCwgcm0pO1xuICAgICAgICB0aGlzJDEuaGVpZ2h0IC09IG9sZEhlaWdodCAtIGNoaWxkLmhlaWdodDtcbiAgICAgICAgaWYgKHN6ID09IHJtKSB7IHRoaXMkMS5jaGlsZHJlbi5zcGxpY2UoaS0tLCAxKTsgY2hpbGQucGFyZW50ID0gbnVsbDsgfVxuICAgICAgICBpZiAoKG4gLT0gcm0pID09IDApIHsgYnJlYWsgfVxuICAgICAgICBhdCA9IDA7XG4gICAgICB9IGVsc2UgeyBhdCAtPSBzejsgfVxuICAgIH1cbiAgICAvLyBJZiB0aGUgcmVzdWx0IGlzIHNtYWxsZXIgdGhhbiAyNSBsaW5lcywgZW5zdXJlIHRoYXQgaXQgaXMgYVxuICAgIC8vIHNpbmdsZSBsZWFmIG5vZGUuXG4gICAgaWYgKHRoaXMuc2l6ZSAtIG4gPCAyNSAmJlxuICAgICAgICAodGhpcy5jaGlsZHJlbi5sZW5ndGggPiAxIHx8ICEodGhpcy5jaGlsZHJlblswXSBpbnN0YW5jZW9mIExlYWZDaHVuaykpKSB7XG4gICAgICB2YXIgbGluZXMgPSBbXTtcbiAgICAgIHRoaXMuY29sbGFwc2UobGluZXMpO1xuICAgICAgdGhpcy5jaGlsZHJlbiA9IFtuZXcgTGVhZkNodW5rKGxpbmVzKV07XG4gICAgICB0aGlzLmNoaWxkcmVuWzBdLnBhcmVudCA9IHRoaXM7XG4gICAgfVxuICB9LFxuXG4gIGNvbGxhcHNlOiBmdW5jdGlvbihsaW5lcykge1xuICAgIHZhciB0aGlzJDEgPSB0aGlzO1xuXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLmNoaWxkcmVuLmxlbmd0aDsgKytpKSB7IHRoaXMkMS5jaGlsZHJlbltpXS5jb2xsYXBzZShsaW5lcyk7IH1cbiAgfSxcblxuICBpbnNlcnRJbm5lcjogZnVuY3Rpb24oYXQsIGxpbmVzLCBoZWlnaHQpIHtcbiAgICB2YXIgdGhpcyQxID0gdGhpcztcblxuICAgIHRoaXMuc2l6ZSArPSBsaW5lcy5sZW5ndGg7XG4gICAgdGhpcy5oZWlnaHQgKz0gaGVpZ2h0O1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5jaGlsZHJlbi5sZW5ndGg7ICsraSkge1xuICAgICAgdmFyIGNoaWxkID0gdGhpcyQxLmNoaWxkcmVuW2ldLCBzeiA9IGNoaWxkLmNodW5rU2l6ZSgpO1xuICAgICAgaWYgKGF0IDw9IHN6KSB7XG4gICAgICAgIGNoaWxkLmluc2VydElubmVyKGF0LCBsaW5lcywgaGVpZ2h0KTtcbiAgICAgICAgaWYgKGNoaWxkLmxpbmVzICYmIGNoaWxkLmxpbmVzLmxlbmd0aCA+IDUwKSB7XG4gICAgICAgICAgLy8gVG8gYXZvaWQgbWVtb3J5IHRocmFzaGluZyB3aGVuIGNoaWxkLmxpbmVzIGlzIGh1Z2UgKGUuZy4gZmlyc3QgdmlldyBvZiBhIGxhcmdlIGZpbGUpLCBpdCdzIG5ldmVyIHNwbGljZWQuXG4gICAgICAgICAgLy8gSW5zdGVhZCwgc21hbGwgc2xpY2VzIGFyZSB0YWtlbi4gVGhleSdyZSB0YWtlbiBpbiBvcmRlciBiZWNhdXNlIHNlcXVlbnRpYWwgbWVtb3J5IGFjY2Vzc2VzIGFyZSBmYXN0ZXN0LlxuICAgICAgICAgIHZhciByZW1haW5pbmcgPSBjaGlsZC5saW5lcy5sZW5ndGggJSAyNSArIDI1O1xuICAgICAgICAgIGZvciAodmFyIHBvcyA9IHJlbWFpbmluZzsgcG9zIDwgY2hpbGQubGluZXMubGVuZ3RoOykge1xuICAgICAgICAgICAgdmFyIGxlYWYgPSBuZXcgTGVhZkNodW5rKGNoaWxkLmxpbmVzLnNsaWNlKHBvcywgcG9zICs9IDI1KSk7XG4gICAgICAgICAgICBjaGlsZC5oZWlnaHQgLT0gbGVhZi5oZWlnaHQ7XG4gICAgICAgICAgICB0aGlzJDEuY2hpbGRyZW4uc3BsaWNlKCsraSwgMCwgbGVhZik7XG4gICAgICAgICAgICBsZWFmLnBhcmVudCA9IHRoaXMkMTtcbiAgICAgICAgICB9XG4gICAgICAgICAgY2hpbGQubGluZXMgPSBjaGlsZC5saW5lcy5zbGljZSgwLCByZW1haW5pbmcpO1xuICAgICAgICAgIHRoaXMkMS5tYXliZVNwaWxsKCk7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWtcbiAgICAgIH1cbiAgICAgIGF0IC09IHN6O1xuICAgIH1cbiAgfSxcblxuICAvLyBXaGVuIGEgbm9kZSBoYXMgZ3Jvd24sIGNoZWNrIHdoZXRoZXIgaXQgc2hvdWxkIGJlIHNwbGl0LlxuICBtYXliZVNwaWxsOiBmdW5jdGlvbigpIHtcbiAgICBpZiAodGhpcy5jaGlsZHJlbi5sZW5ndGggPD0gMTApIHsgcmV0dXJuIH1cbiAgICB2YXIgbWUgPSB0aGlzO1xuICAgIGRvIHtcbiAgICAgIHZhciBzcGlsbGVkID0gbWUuY2hpbGRyZW4uc3BsaWNlKG1lLmNoaWxkcmVuLmxlbmd0aCAtIDUsIDUpO1xuICAgICAgdmFyIHNpYmxpbmcgPSBuZXcgQnJhbmNoQ2h1bmsoc3BpbGxlZCk7XG4gICAgICBpZiAoIW1lLnBhcmVudCkgeyAvLyBCZWNvbWUgdGhlIHBhcmVudCBub2RlXG4gICAgICAgIHZhciBjb3B5ID0gbmV3IEJyYW5jaENodW5rKG1lLmNoaWxkcmVuKTtcbiAgICAgICAgY29weS5wYXJlbnQgPSBtZTtcbiAgICAgICAgbWUuY2hpbGRyZW4gPSBbY29weSwgc2libGluZ107XG4gICAgICAgIG1lID0gY29weTtcbiAgICAgfSBlbHNlIHtcbiAgICAgICAgbWUuc2l6ZSAtPSBzaWJsaW5nLnNpemU7XG4gICAgICAgIG1lLmhlaWdodCAtPSBzaWJsaW5nLmhlaWdodDtcbiAgICAgICAgdmFyIG15SW5kZXggPSBpbmRleE9mKG1lLnBhcmVudC5jaGlsZHJlbiwgbWUpO1xuICAgICAgICBtZS5wYXJlbnQuY2hpbGRyZW4uc3BsaWNlKG15SW5kZXggKyAxLCAwLCBzaWJsaW5nKTtcbiAgICAgIH1cbiAgICAgIHNpYmxpbmcucGFyZW50ID0gbWUucGFyZW50O1xuICAgIH0gd2hpbGUgKG1lLmNoaWxkcmVuLmxlbmd0aCA+IDEwKVxuICAgIG1lLnBhcmVudC5tYXliZVNwaWxsKCk7XG4gIH0sXG5cbiAgaXRlck46IGZ1bmN0aW9uKGF0LCBuLCBvcCkge1xuICAgIHZhciB0aGlzJDEgPSB0aGlzO1xuXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLmNoaWxkcmVuLmxlbmd0aDsgKytpKSB7XG4gICAgICB2YXIgY2hpbGQgPSB0aGlzJDEuY2hpbGRyZW5baV0sIHN6ID0gY2hpbGQuY2h1bmtTaXplKCk7XG4gICAgICBpZiAoYXQgPCBzeikge1xuICAgICAgICB2YXIgdXNlZCA9IE1hdGgubWluKG4sIHN6IC0gYXQpO1xuICAgICAgICBpZiAoY2hpbGQuaXRlck4oYXQsIHVzZWQsIG9wKSkgeyByZXR1cm4gdHJ1ZSB9XG4gICAgICAgIGlmICgobiAtPSB1c2VkKSA9PSAwKSB7IGJyZWFrIH1cbiAgICAgICAgYXQgPSAwO1xuICAgICAgfSBlbHNlIHsgYXQgLT0gc3o7IH1cbiAgICB9XG4gIH1cbn07XG5cbi8vIExpbmUgd2lkZ2V0cyBhcmUgYmxvY2sgZWxlbWVudHMgZGlzcGxheWVkIGFib3ZlIG9yIGJlbG93IGEgbGluZS5cblxudmFyIExpbmVXaWRnZXQgPSBmdW5jdGlvbihkb2MsIG5vZGUsIG9wdGlvbnMpIHtcbiAgdmFyIHRoaXMkMSA9IHRoaXM7XG5cbiAgaWYgKG9wdGlvbnMpIHsgZm9yICh2YXIgb3B0IGluIG9wdGlvbnMpIHsgaWYgKG9wdGlvbnMuaGFzT3duUHJvcGVydHkob3B0KSlcbiAgICB7IHRoaXMkMVtvcHRdID0gb3B0aW9uc1tvcHRdOyB9IH0gfVxuICB0aGlzLmRvYyA9IGRvYztcbiAgdGhpcy5ub2RlID0gbm9kZTtcbn07XG5cbkxpbmVXaWRnZXQucHJvdG90eXBlLmNsZWFyID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciB0aGlzJDEgPSB0aGlzO1xuXG4gIHZhciBjbSA9IHRoaXMuZG9jLmNtLCB3cyA9IHRoaXMubGluZS53aWRnZXRzLCBsaW5lID0gdGhpcy5saW5lLCBubyA9IGxpbmVObyhsaW5lKTtcbiAgaWYgKG5vID09IG51bGwgfHwgIXdzKSB7IHJldHVybiB9XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgd3MubGVuZ3RoOyArK2kpIHsgaWYgKHdzW2ldID09IHRoaXMkMSkgeyB3cy5zcGxpY2UoaS0tLCAxKTsgfSB9XG4gIGlmICghd3MubGVuZ3RoKSB7IGxpbmUud2lkZ2V0cyA9IG51bGw7IH1cbiAgdmFyIGhlaWdodCA9IHdpZGdldEhlaWdodCh0aGlzKTtcbiAgdXBkYXRlTGluZUhlaWdodChsaW5lLCBNYXRoLm1heCgwLCBsaW5lLmhlaWdodCAtIGhlaWdodCkpO1xuICBpZiAoY20pIHtcbiAgICBydW5Jbk9wKGNtLCBmdW5jdGlvbiAoKSB7XG4gICAgICBhZGp1c3RTY3JvbGxXaGVuQWJvdmVWaXNpYmxlKGNtLCBsaW5lLCAtaGVpZ2h0KTtcbiAgICAgIHJlZ0xpbmVDaGFuZ2UoY20sIG5vLCBcIndpZGdldFwiKTtcbiAgICB9KTtcbiAgICBzaWduYWxMYXRlcihjbSwgXCJsaW5lV2lkZ2V0Q2xlYXJlZFwiLCBjbSwgdGhpcywgbm8pO1xuICB9XG59O1xuXG5MaW5lV2lkZ2V0LnByb3RvdHlwZS5jaGFuZ2VkID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciB0aGlzJDEgPSB0aGlzO1xuXG4gIHZhciBvbGRIID0gdGhpcy5oZWlnaHQsIGNtID0gdGhpcy5kb2MuY20sIGxpbmUgPSB0aGlzLmxpbmU7XG4gIHRoaXMuaGVpZ2h0ID0gbnVsbDtcbiAgdmFyIGRpZmYgPSB3aWRnZXRIZWlnaHQodGhpcykgLSBvbGRIO1xuICBpZiAoIWRpZmYpIHsgcmV0dXJuIH1cbiAgdXBkYXRlTGluZUhlaWdodChsaW5lLCBsaW5lLmhlaWdodCArIGRpZmYpO1xuICBpZiAoY20pIHtcbiAgICBydW5Jbk9wKGNtLCBmdW5jdGlvbiAoKSB7XG4gICAgICBjbS5jdXJPcC5mb3JjZVVwZGF0ZSA9IHRydWU7XG4gICAgICBhZGp1c3RTY3JvbGxXaGVuQWJvdmVWaXNpYmxlKGNtLCBsaW5lLCBkaWZmKTtcbiAgICAgIHNpZ25hbExhdGVyKGNtLCBcImxpbmVXaWRnZXRDaGFuZ2VkXCIsIGNtLCB0aGlzJDEsIGxpbmVObyhsaW5lKSk7XG4gICAgfSk7XG4gIH1cbn07XG5ldmVudE1peGluKExpbmVXaWRnZXQpO1xuXG5mdW5jdGlvbiBhZGp1c3RTY3JvbGxXaGVuQWJvdmVWaXNpYmxlKGNtLCBsaW5lLCBkaWZmKSB7XG4gIGlmIChoZWlnaHRBdExpbmUobGluZSkgPCAoKGNtLmN1ck9wICYmIGNtLmN1ck9wLnNjcm9sbFRvcCkgfHwgY20uZG9jLnNjcm9sbFRvcCkpXG4gICAgeyBhZGRUb1Njcm9sbFRvcChjbSwgZGlmZik7IH1cbn1cblxuZnVuY3Rpb24gYWRkTGluZVdpZGdldChkb2MsIGhhbmRsZSwgbm9kZSwgb3B0aW9ucykge1xuICB2YXIgd2lkZ2V0ID0gbmV3IExpbmVXaWRnZXQoZG9jLCBub2RlLCBvcHRpb25zKTtcbiAgdmFyIGNtID0gZG9jLmNtO1xuICBpZiAoY20gJiYgd2lkZ2V0Lm5vSFNjcm9sbCkgeyBjbS5kaXNwbGF5LmFsaWduV2lkZ2V0cyA9IHRydWU7IH1cbiAgY2hhbmdlTGluZShkb2MsIGhhbmRsZSwgXCJ3aWRnZXRcIiwgZnVuY3Rpb24gKGxpbmUpIHtcbiAgICB2YXIgd2lkZ2V0cyA9IGxpbmUud2lkZ2V0cyB8fCAobGluZS53aWRnZXRzID0gW10pO1xuICAgIGlmICh3aWRnZXQuaW5zZXJ0QXQgPT0gbnVsbCkgeyB3aWRnZXRzLnB1c2god2lkZ2V0KTsgfVxuICAgIGVsc2UgeyB3aWRnZXRzLnNwbGljZShNYXRoLm1pbih3aWRnZXRzLmxlbmd0aCAtIDEsIE1hdGgubWF4KDAsIHdpZGdldC5pbnNlcnRBdCkpLCAwLCB3aWRnZXQpOyB9XG4gICAgd2lkZ2V0LmxpbmUgPSBsaW5lO1xuICAgIGlmIChjbSAmJiAhbGluZUlzSGlkZGVuKGRvYywgbGluZSkpIHtcbiAgICAgIHZhciBhYm92ZVZpc2libGUgPSBoZWlnaHRBdExpbmUobGluZSkgPCBkb2Muc2Nyb2xsVG9wO1xuICAgICAgdXBkYXRlTGluZUhlaWdodChsaW5lLCBsaW5lLmhlaWdodCArIHdpZGdldEhlaWdodCh3aWRnZXQpKTtcbiAgICAgIGlmIChhYm92ZVZpc2libGUpIHsgYWRkVG9TY3JvbGxUb3AoY20sIHdpZGdldC5oZWlnaHQpOyB9XG4gICAgICBjbS5jdXJPcC5mb3JjZVVwZGF0ZSA9IHRydWU7XG4gICAgfVxuICAgIHJldHVybiB0cnVlXG4gIH0pO1xuICBpZiAoY20pIHsgc2lnbmFsTGF0ZXIoY20sIFwibGluZVdpZGdldEFkZGVkXCIsIGNtLCB3aWRnZXQsIHR5cGVvZiBoYW5kbGUgPT0gXCJudW1iZXJcIiA/IGhhbmRsZSA6IGxpbmVObyhoYW5kbGUpKTsgfVxuICByZXR1cm4gd2lkZ2V0XG59XG5cbi8vIFRFWFRNQVJLRVJTXG5cbi8vIENyZWF0ZWQgd2l0aCBtYXJrVGV4dCBhbmQgc2V0Qm9va21hcmsgbWV0aG9kcy4gQSBUZXh0TWFya2VyIGlzIGFcbi8vIGhhbmRsZSB0aGF0IGNhbiBiZSB1c2VkIHRvIGNsZWFyIG9yIGZpbmQgYSBtYXJrZWQgcG9zaXRpb24gaW4gdGhlXG4vLyBkb2N1bWVudC4gTGluZSBvYmplY3RzIGhvbGQgYXJyYXlzIChtYXJrZWRTcGFucykgY29udGFpbmluZ1xuLy8ge2Zyb20sIHRvLCBtYXJrZXJ9IG9iamVjdCBwb2ludGluZyB0byBzdWNoIG1hcmtlciBvYmplY3RzLCBhbmRcbi8vIGluZGljYXRpbmcgdGhhdCBzdWNoIGEgbWFya2VyIGlzIHByZXNlbnQgb24gdGhhdCBsaW5lLiBNdWx0aXBsZVxuLy8gbGluZXMgbWF5IHBvaW50IHRvIHRoZSBzYW1lIG1hcmtlciB3aGVuIGl0IHNwYW5zIGFjcm9zcyBsaW5lcy5cbi8vIFRoZSBzcGFucyB3aWxsIGhhdmUgbnVsbCBmb3IgdGhlaXIgZnJvbS90byBwcm9wZXJ0aWVzIHdoZW4gdGhlXG4vLyBtYXJrZXIgY29udGludWVzIGJleW9uZCB0aGUgc3RhcnQvZW5kIG9mIHRoZSBsaW5lLiBNYXJrZXJzIGhhdmVcbi8vIGxpbmtzIGJhY2sgdG8gdGhlIGxpbmVzIHRoZXkgY3VycmVudGx5IHRvdWNoLlxuXG4vLyBDb2xsYXBzZWQgbWFya2VycyBoYXZlIHVuaXF1ZSBpZHMsIGluIG9yZGVyIHRvIGJlIGFibGUgdG8gb3JkZXJcbi8vIHRoZW0sIHdoaWNoIGlzIG5lZWRlZCBmb3IgdW5pcXVlbHkgZGV0ZXJtaW5pbmcgYW4gb3V0ZXIgbWFya2VyXG4vLyB3aGVuIHRoZXkgb3ZlcmxhcCAodGhleSBtYXkgbmVzdCwgYnV0IG5vdCBwYXJ0aWFsbHkgb3ZlcmxhcCkuXG52YXIgbmV4dE1hcmtlcklkID0gMDtcblxudmFyIFRleHRNYXJrZXIgPSBmdW5jdGlvbihkb2MsIHR5cGUpIHtcbiAgdGhpcy5saW5lcyA9IFtdO1xuICB0aGlzLnR5cGUgPSB0eXBlO1xuICB0aGlzLmRvYyA9IGRvYztcbiAgdGhpcy5pZCA9ICsrbmV4dE1hcmtlcklkO1xufTtcblxuLy8gQ2xlYXIgdGhlIG1hcmtlci5cblRleHRNYXJrZXIucHJvdG90eXBlLmNsZWFyID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciB0aGlzJDEgPSB0aGlzO1xuXG4gIGlmICh0aGlzLmV4cGxpY2l0bHlDbGVhcmVkKSB7IHJldHVybiB9XG4gIHZhciBjbSA9IHRoaXMuZG9jLmNtLCB3aXRoT3AgPSBjbSAmJiAhY20uY3VyT3A7XG4gIGlmICh3aXRoT3ApIHsgc3RhcnRPcGVyYXRpb24oY20pOyB9XG4gIGlmIChoYXNIYW5kbGVyKHRoaXMsIFwiY2xlYXJcIikpIHtcbiAgICB2YXIgZm91bmQgPSB0aGlzLmZpbmQoKTtcbiAgICBpZiAoZm91bmQpIHsgc2lnbmFsTGF0ZXIodGhpcywgXCJjbGVhclwiLCBmb3VuZC5mcm9tLCBmb3VuZC50byk7IH1cbiAgfVxuICB2YXIgbWluID0gbnVsbCwgbWF4ID0gbnVsbDtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLmxpbmVzLmxlbmd0aDsgKytpKSB7XG4gICAgdmFyIGxpbmUgPSB0aGlzJDEubGluZXNbaV07XG4gICAgdmFyIHNwYW4gPSBnZXRNYXJrZWRTcGFuRm9yKGxpbmUubWFya2VkU3BhbnMsIHRoaXMkMSk7XG4gICAgaWYgKGNtICYmICF0aGlzJDEuY29sbGFwc2VkKSB7IHJlZ0xpbmVDaGFuZ2UoY20sIGxpbmVObyhsaW5lKSwgXCJ0ZXh0XCIpOyB9XG4gICAgZWxzZSBpZiAoY20pIHtcbiAgICAgIGlmIChzcGFuLnRvICE9IG51bGwpIHsgbWF4ID0gbGluZU5vKGxpbmUpOyB9XG4gICAgICBpZiAoc3Bhbi5mcm9tICE9IG51bGwpIHsgbWluID0gbGluZU5vKGxpbmUpOyB9XG4gICAgfVxuICAgIGxpbmUubWFya2VkU3BhbnMgPSByZW1vdmVNYXJrZWRTcGFuKGxpbmUubWFya2VkU3BhbnMsIHNwYW4pO1xuICAgIGlmIChzcGFuLmZyb20gPT0gbnVsbCAmJiB0aGlzJDEuY29sbGFwc2VkICYmICFsaW5lSXNIaWRkZW4odGhpcyQxLmRvYywgbGluZSkgJiYgY20pXG4gICAgICB7IHVwZGF0ZUxpbmVIZWlnaHQobGluZSwgdGV4dEhlaWdodChjbS5kaXNwbGF5KSk7IH1cbiAgfVxuICBpZiAoY20gJiYgdGhpcy5jb2xsYXBzZWQgJiYgIWNtLm9wdGlvbnMubGluZVdyYXBwaW5nKSB7IGZvciAodmFyIGkkMSA9IDA7IGkkMSA8IHRoaXMubGluZXMubGVuZ3RoOyArK2kkMSkge1xuICAgIHZhciB2aXN1YWwgPSB2aXN1YWxMaW5lKHRoaXMkMS5saW5lc1tpJDFdKSwgbGVuID0gbGluZUxlbmd0aCh2aXN1YWwpO1xuICAgIGlmIChsZW4gPiBjbS5kaXNwbGF5Lm1heExpbmVMZW5ndGgpIHtcbiAgICAgIGNtLmRpc3BsYXkubWF4TGluZSA9IHZpc3VhbDtcbiAgICAgIGNtLmRpc3BsYXkubWF4TGluZUxlbmd0aCA9IGxlbjtcbiAgICAgIGNtLmRpc3BsYXkubWF4TGluZUNoYW5nZWQgPSB0cnVlO1xuICAgIH1cbiAgfSB9XG5cbiAgaWYgKG1pbiAhPSBudWxsICYmIGNtICYmIHRoaXMuY29sbGFwc2VkKSB7IHJlZ0NoYW5nZShjbSwgbWluLCBtYXggKyAxKTsgfVxuICB0aGlzLmxpbmVzLmxlbmd0aCA9IDA7XG4gIHRoaXMuZXhwbGljaXRseUNsZWFyZWQgPSB0cnVlO1xuICBpZiAodGhpcy5hdG9taWMgJiYgdGhpcy5kb2MuY2FudEVkaXQpIHtcbiAgICB0aGlzLmRvYy5jYW50RWRpdCA9IGZhbHNlO1xuICAgIGlmIChjbSkgeyByZUNoZWNrU2VsZWN0aW9uKGNtLmRvYyk7IH1cbiAgfVxuICBpZiAoY20pIHsgc2lnbmFsTGF0ZXIoY20sIFwibWFya2VyQ2xlYXJlZFwiLCBjbSwgdGhpcywgbWluLCBtYXgpOyB9XG4gIGlmICh3aXRoT3ApIHsgZW5kT3BlcmF0aW9uKGNtKTsgfVxuICBpZiAodGhpcy5wYXJlbnQpIHsgdGhpcy5wYXJlbnQuY2xlYXIoKTsgfVxufTtcblxuLy8gRmluZCB0aGUgcG9zaXRpb24gb2YgdGhlIG1hcmtlciBpbiB0aGUgZG9jdW1lbnQuIFJldHVybnMgYSB7ZnJvbSxcbi8vIHRvfSBvYmplY3QgYnkgZGVmYXVsdC4gU2lkZSBjYW4gYmUgcGFzc2VkIHRvIGdldCBhIHNwZWNpZmljIHNpZGVcbi8vIC0tIDAgKGJvdGgpLCAtMSAobGVmdCksIG9yIDEgKHJpZ2h0KS4gV2hlbiBsaW5lT2JqIGlzIHRydWUsIHRoZVxuLy8gUG9zIG9iamVjdHMgcmV0dXJuZWQgY29udGFpbiBhIGxpbmUgb2JqZWN0LCByYXRoZXIgdGhhbiBhIGxpbmVcbi8vIG51bWJlciAodXNlZCB0byBwcmV2ZW50IGxvb2tpbmcgdXAgdGhlIHNhbWUgbGluZSB0d2ljZSkuXG5UZXh0TWFya2VyLnByb3RvdHlwZS5maW5kID0gZnVuY3Rpb24gKHNpZGUsIGxpbmVPYmopIHtcbiAgICB2YXIgdGhpcyQxID0gdGhpcztcblxuICBpZiAoc2lkZSA9PSBudWxsICYmIHRoaXMudHlwZSA9PSBcImJvb2ttYXJrXCIpIHsgc2lkZSA9IDE7IH1cbiAgdmFyIGZyb20sIHRvO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMubGluZXMubGVuZ3RoOyArK2kpIHtcbiAgICB2YXIgbGluZSA9IHRoaXMkMS5saW5lc1tpXTtcbiAgICB2YXIgc3BhbiA9IGdldE1hcmtlZFNwYW5Gb3IobGluZS5tYXJrZWRTcGFucywgdGhpcyQxKTtcbiAgICBpZiAoc3Bhbi5mcm9tICE9IG51bGwpIHtcbiAgICAgIGZyb20gPSBQb3MobGluZU9iaiA/IGxpbmUgOiBsaW5lTm8obGluZSksIHNwYW4uZnJvbSk7XG4gICAgICBpZiAoc2lkZSA9PSAtMSkgeyByZXR1cm4gZnJvbSB9XG4gICAgfVxuICAgIGlmIChzcGFuLnRvICE9IG51bGwpIHtcbiAgICAgIHRvID0gUG9zKGxpbmVPYmogPyBsaW5lIDogbGluZU5vKGxpbmUpLCBzcGFuLnRvKTtcbiAgICAgIGlmIChzaWRlID09IDEpIHsgcmV0dXJuIHRvIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIGZyb20gJiYge2Zyb206IGZyb20sIHRvOiB0b31cbn07XG5cbi8vIFNpZ25hbHMgdGhhdCB0aGUgbWFya2VyJ3Mgd2lkZ2V0IGNoYW5nZWQsIGFuZCBzdXJyb3VuZGluZyBsYXlvdXRcbi8vIHNob3VsZCBiZSByZWNvbXB1dGVkLlxuVGV4dE1hcmtlci5wcm90b3R5cGUuY2hhbmdlZCA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgdGhpcyQxID0gdGhpcztcblxuICB2YXIgcG9zID0gdGhpcy5maW5kKC0xLCB0cnVlKSwgd2lkZ2V0ID0gdGhpcywgY20gPSB0aGlzLmRvYy5jbTtcbiAgaWYgKCFwb3MgfHwgIWNtKSB7IHJldHVybiB9XG4gIHJ1bkluT3AoY20sIGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgbGluZSA9IHBvcy5saW5lLCBsaW5lTiA9IGxpbmVObyhwb3MubGluZSk7XG4gICAgdmFyIHZpZXcgPSBmaW5kVmlld0ZvckxpbmUoY20sIGxpbmVOKTtcbiAgICBpZiAodmlldykge1xuICAgICAgY2xlYXJMaW5lTWVhc3VyZW1lbnRDYWNoZUZvcih2aWV3KTtcbiAgICAgIGNtLmN1ck9wLnNlbGVjdGlvbkNoYW5nZWQgPSBjbS5jdXJPcC5mb3JjZVVwZGF0ZSA9IHRydWU7XG4gICAgfVxuICAgIGNtLmN1ck9wLnVwZGF0ZU1heExpbmUgPSB0cnVlO1xuICAgIGlmICghbGluZUlzSGlkZGVuKHdpZGdldC5kb2MsIGxpbmUpICYmIHdpZGdldC5oZWlnaHQgIT0gbnVsbCkge1xuICAgICAgdmFyIG9sZEhlaWdodCA9IHdpZGdldC5oZWlnaHQ7XG4gICAgICB3aWRnZXQuaGVpZ2h0ID0gbnVsbDtcbiAgICAgIHZhciBkSGVpZ2h0ID0gd2lkZ2V0SGVpZ2h0KHdpZGdldCkgLSBvbGRIZWlnaHQ7XG4gICAgICBpZiAoZEhlaWdodClcbiAgICAgICAgeyB1cGRhdGVMaW5lSGVpZ2h0KGxpbmUsIGxpbmUuaGVpZ2h0ICsgZEhlaWdodCk7IH1cbiAgICB9XG4gICAgc2lnbmFsTGF0ZXIoY20sIFwibWFya2VyQ2hhbmdlZFwiLCBjbSwgdGhpcyQxKTtcbiAgfSk7XG59O1xuXG5UZXh0TWFya2VyLnByb3RvdHlwZS5hdHRhY2hMaW5lID0gZnVuY3Rpb24gKGxpbmUpIHtcbiAgaWYgKCF0aGlzLmxpbmVzLmxlbmd0aCAmJiB0aGlzLmRvYy5jbSkge1xuICAgIHZhciBvcCA9IHRoaXMuZG9jLmNtLmN1ck9wO1xuICAgIGlmICghb3AubWF5YmVIaWRkZW5NYXJrZXJzIHx8IGluZGV4T2Yob3AubWF5YmVIaWRkZW5NYXJrZXJzLCB0aGlzKSA9PSAtMSlcbiAgICAgIHsgKG9wLm1heWJlVW5oaWRkZW5NYXJrZXJzIHx8IChvcC5tYXliZVVuaGlkZGVuTWFya2VycyA9IFtdKSkucHVzaCh0aGlzKTsgfVxuICB9XG4gIHRoaXMubGluZXMucHVzaChsaW5lKTtcbn07XG5cblRleHRNYXJrZXIucHJvdG90eXBlLmRldGFjaExpbmUgPSBmdW5jdGlvbiAobGluZSkge1xuICB0aGlzLmxpbmVzLnNwbGljZShpbmRleE9mKHRoaXMubGluZXMsIGxpbmUpLCAxKTtcbiAgaWYgKCF0aGlzLmxpbmVzLmxlbmd0aCAmJiB0aGlzLmRvYy5jbSkge1xuICAgIHZhciBvcCA9IHRoaXMuZG9jLmNtLmN1ck9wOyhvcC5tYXliZUhpZGRlbk1hcmtlcnMgfHwgKG9wLm1heWJlSGlkZGVuTWFya2VycyA9IFtdKSkucHVzaCh0aGlzKTtcbiAgfVxufTtcbmV2ZW50TWl4aW4oVGV4dE1hcmtlcik7XG5cbi8vIENyZWF0ZSBhIG1hcmtlciwgd2lyZSBpdCB1cCB0byB0aGUgcmlnaHQgbGluZXMsIGFuZFxuZnVuY3Rpb24gbWFya1RleHQoZG9jLCBmcm9tLCB0bywgb3B0aW9ucywgdHlwZSkge1xuICAvLyBTaGFyZWQgbWFya2VycyAoYWNyb3NzIGxpbmtlZCBkb2N1bWVudHMpIGFyZSBoYW5kbGVkIHNlcGFyYXRlbHlcbiAgLy8gKG1hcmtUZXh0U2hhcmVkIHdpbGwgY2FsbCBvdXQgdG8gdGhpcyBhZ2Fpbiwgb25jZSBwZXJcbiAgLy8gZG9jdW1lbnQpLlxuICBpZiAob3B0aW9ucyAmJiBvcHRpb25zLnNoYXJlZCkgeyByZXR1cm4gbWFya1RleHRTaGFyZWQoZG9jLCBmcm9tLCB0bywgb3B0aW9ucywgdHlwZSkgfVxuICAvLyBFbnN1cmUgd2UgYXJlIGluIGFuIG9wZXJhdGlvbi5cbiAgaWYgKGRvYy5jbSAmJiAhZG9jLmNtLmN1ck9wKSB7IHJldHVybiBvcGVyYXRpb24oZG9jLmNtLCBtYXJrVGV4dCkoZG9jLCBmcm9tLCB0bywgb3B0aW9ucywgdHlwZSkgfVxuXG4gIHZhciBtYXJrZXIgPSBuZXcgVGV4dE1hcmtlcihkb2MsIHR5cGUpLCBkaWZmID0gY21wKGZyb20sIHRvKTtcbiAgaWYgKG9wdGlvbnMpIHsgY29weU9iaihvcHRpb25zLCBtYXJrZXIsIGZhbHNlKTsgfVxuICAvLyBEb24ndCBjb25uZWN0IGVtcHR5IG1hcmtlcnMgdW5sZXNzIGNsZWFyV2hlbkVtcHR5IGlzIGZhbHNlXG4gIGlmIChkaWZmID4gMCB8fCBkaWZmID09IDAgJiYgbWFya2VyLmNsZWFyV2hlbkVtcHR5ICE9PSBmYWxzZSlcbiAgICB7IHJldHVybiBtYXJrZXIgfVxuICBpZiAobWFya2VyLnJlcGxhY2VkV2l0aCkge1xuICAgIC8vIFNob3dpbmcgdXAgYXMgYSB3aWRnZXQgaW1wbGllcyBjb2xsYXBzZWQgKHdpZGdldCByZXBsYWNlcyB0ZXh0KVxuICAgIG1hcmtlci5jb2xsYXBzZWQgPSB0cnVlO1xuICAgIG1hcmtlci53aWRnZXROb2RlID0gZWx0UChcInNwYW5cIiwgW21hcmtlci5yZXBsYWNlZFdpdGhdLCBcIkNvZGVNaXJyb3Itd2lkZ2V0XCIpO1xuICAgIGlmICghb3B0aW9ucy5oYW5kbGVNb3VzZUV2ZW50cykgeyBtYXJrZXIud2lkZ2V0Tm9kZS5zZXRBdHRyaWJ1dGUoXCJjbS1pZ25vcmUtZXZlbnRzXCIsIFwidHJ1ZVwiKTsgfVxuICAgIGlmIChvcHRpb25zLmluc2VydExlZnQpIHsgbWFya2VyLndpZGdldE5vZGUuaW5zZXJ0TGVmdCA9IHRydWU7IH1cbiAgfVxuICBpZiAobWFya2VyLmNvbGxhcHNlZCkge1xuICAgIGlmIChjb25mbGljdGluZ0NvbGxhcHNlZFJhbmdlKGRvYywgZnJvbS5saW5lLCBmcm9tLCB0bywgbWFya2VyKSB8fFxuICAgICAgICBmcm9tLmxpbmUgIT0gdG8ubGluZSAmJiBjb25mbGljdGluZ0NvbGxhcHNlZFJhbmdlKGRvYywgdG8ubGluZSwgZnJvbSwgdG8sIG1hcmtlcikpXG4gICAgICB7IHRocm93IG5ldyBFcnJvcihcIkluc2VydGluZyBjb2xsYXBzZWQgbWFya2VyIHBhcnRpYWxseSBvdmVybGFwcGluZyBhbiBleGlzdGluZyBvbmVcIikgfVxuICAgIHNlZUNvbGxhcHNlZFNwYW5zKCk7XG4gIH1cblxuICBpZiAobWFya2VyLmFkZFRvSGlzdG9yeSlcbiAgICB7IGFkZENoYW5nZVRvSGlzdG9yeShkb2MsIHtmcm9tOiBmcm9tLCB0bzogdG8sIG9yaWdpbjogXCJtYXJrVGV4dFwifSwgZG9jLnNlbCwgTmFOKTsgfVxuXG4gIHZhciBjdXJMaW5lID0gZnJvbS5saW5lLCBjbSA9IGRvYy5jbSwgdXBkYXRlTWF4TGluZTtcbiAgZG9jLml0ZXIoY3VyTGluZSwgdG8ubGluZSArIDEsIGZ1bmN0aW9uIChsaW5lKSB7XG4gICAgaWYgKGNtICYmIG1hcmtlci5jb2xsYXBzZWQgJiYgIWNtLm9wdGlvbnMubGluZVdyYXBwaW5nICYmIHZpc3VhbExpbmUobGluZSkgPT0gY20uZGlzcGxheS5tYXhMaW5lKVxuICAgICAgeyB1cGRhdGVNYXhMaW5lID0gdHJ1ZTsgfVxuICAgIGlmIChtYXJrZXIuY29sbGFwc2VkICYmIGN1ckxpbmUgIT0gZnJvbS5saW5lKSB7IHVwZGF0ZUxpbmVIZWlnaHQobGluZSwgMCk7IH1cbiAgICBhZGRNYXJrZWRTcGFuKGxpbmUsIG5ldyBNYXJrZWRTcGFuKG1hcmtlcixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGN1ckxpbmUgPT0gZnJvbS5saW5lID8gZnJvbS5jaCA6IG51bGwsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjdXJMaW5lID09IHRvLmxpbmUgPyB0by5jaCA6IG51bGwpKTtcbiAgICArK2N1ckxpbmU7XG4gIH0pO1xuICAvLyBsaW5lSXNIaWRkZW4gZGVwZW5kcyBvbiB0aGUgcHJlc2VuY2Ugb2YgdGhlIHNwYW5zLCBzbyBuZWVkcyBhIHNlY29uZCBwYXNzXG4gIGlmIChtYXJrZXIuY29sbGFwc2VkKSB7IGRvYy5pdGVyKGZyb20ubGluZSwgdG8ubGluZSArIDEsIGZ1bmN0aW9uIChsaW5lKSB7XG4gICAgaWYgKGxpbmVJc0hpZGRlbihkb2MsIGxpbmUpKSB7IHVwZGF0ZUxpbmVIZWlnaHQobGluZSwgMCk7IH1cbiAgfSk7IH1cblxuICBpZiAobWFya2VyLmNsZWFyT25FbnRlcikgeyBvbihtYXJrZXIsIFwiYmVmb3JlQ3Vyc29yRW50ZXJcIiwgZnVuY3Rpb24gKCkgeyByZXR1cm4gbWFya2VyLmNsZWFyKCk7IH0pOyB9XG5cbiAgaWYgKG1hcmtlci5yZWFkT25seSkge1xuICAgIHNlZVJlYWRPbmx5U3BhbnMoKTtcbiAgICBpZiAoZG9jLmhpc3RvcnkuZG9uZS5sZW5ndGggfHwgZG9jLmhpc3RvcnkudW5kb25lLmxlbmd0aClcbiAgICAgIHsgZG9jLmNsZWFySGlzdG9yeSgpOyB9XG4gIH1cbiAgaWYgKG1hcmtlci5jb2xsYXBzZWQpIHtcbiAgICBtYXJrZXIuaWQgPSArK25leHRNYXJrZXJJZDtcbiAgICBtYXJrZXIuYXRvbWljID0gdHJ1ZTtcbiAgfVxuICBpZiAoY20pIHtcbiAgICAvLyBTeW5jIGVkaXRvciBzdGF0ZVxuICAgIGlmICh1cGRhdGVNYXhMaW5lKSB7IGNtLmN1ck9wLnVwZGF0ZU1heExpbmUgPSB0cnVlOyB9XG4gICAgaWYgKG1hcmtlci5jb2xsYXBzZWQpXG4gICAgICB7IHJlZ0NoYW5nZShjbSwgZnJvbS5saW5lLCB0by5saW5lICsgMSk7IH1cbiAgICBlbHNlIGlmIChtYXJrZXIuY2xhc3NOYW1lIHx8IG1hcmtlci50aXRsZSB8fCBtYXJrZXIuc3RhcnRTdHlsZSB8fCBtYXJrZXIuZW5kU3R5bGUgfHwgbWFya2VyLmNzcylcbiAgICAgIHsgZm9yICh2YXIgaSA9IGZyb20ubGluZTsgaSA8PSB0by5saW5lOyBpKyspIHsgcmVnTGluZUNoYW5nZShjbSwgaSwgXCJ0ZXh0XCIpOyB9IH1cbiAgICBpZiAobWFya2VyLmF0b21pYykgeyByZUNoZWNrU2VsZWN0aW9uKGNtLmRvYyk7IH1cbiAgICBzaWduYWxMYXRlcihjbSwgXCJtYXJrZXJBZGRlZFwiLCBjbSwgbWFya2VyKTtcbiAgfVxuICByZXR1cm4gbWFya2VyXG59XG5cbi8vIFNIQVJFRCBURVhUTUFSS0VSU1xuXG4vLyBBIHNoYXJlZCBtYXJrZXIgc3BhbnMgbXVsdGlwbGUgbGlua2VkIGRvY3VtZW50cy4gSXQgaXNcbi8vIGltcGxlbWVudGVkIGFzIGEgbWV0YS1tYXJrZXItb2JqZWN0IGNvbnRyb2xsaW5nIG11bHRpcGxlIG5vcm1hbFxuLy8gbWFya2Vycy5cbnZhciBTaGFyZWRUZXh0TWFya2VyID0gZnVuY3Rpb24obWFya2VycywgcHJpbWFyeSkge1xuICB2YXIgdGhpcyQxID0gdGhpcztcblxuICB0aGlzLm1hcmtlcnMgPSBtYXJrZXJzO1xuICB0aGlzLnByaW1hcnkgPSBwcmltYXJ5O1xuICBmb3IgKHZhciBpID0gMDsgaSA8IG1hcmtlcnMubGVuZ3RoOyArK2kpXG4gICAgeyBtYXJrZXJzW2ldLnBhcmVudCA9IHRoaXMkMTsgfVxufTtcblxuU2hhcmVkVGV4dE1hcmtlci5wcm90b3R5cGUuY2xlYXIgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHRoaXMkMSA9IHRoaXM7XG5cbiAgaWYgKHRoaXMuZXhwbGljaXRseUNsZWFyZWQpIHsgcmV0dXJuIH1cbiAgdGhpcy5leHBsaWNpdGx5Q2xlYXJlZCA9IHRydWU7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5tYXJrZXJzLmxlbmd0aDsgKytpKVxuICAgIHsgdGhpcyQxLm1hcmtlcnNbaV0uY2xlYXIoKTsgfVxuICBzaWduYWxMYXRlcih0aGlzLCBcImNsZWFyXCIpO1xufTtcblxuU2hhcmVkVGV4dE1hcmtlci5wcm90b3R5cGUuZmluZCA9IGZ1bmN0aW9uIChzaWRlLCBsaW5lT2JqKSB7XG4gIHJldHVybiB0aGlzLnByaW1hcnkuZmluZChzaWRlLCBsaW5lT2JqKVxufTtcbmV2ZW50TWl4aW4oU2hhcmVkVGV4dE1hcmtlcik7XG5cbmZ1bmN0aW9uIG1hcmtUZXh0U2hhcmVkKGRvYywgZnJvbSwgdG8sIG9wdGlvbnMsIHR5cGUpIHtcbiAgb3B0aW9ucyA9IGNvcHlPYmoob3B0aW9ucyk7XG4gIG9wdGlvbnMuc2hhcmVkID0gZmFsc2U7XG4gIHZhciBtYXJrZXJzID0gW21hcmtUZXh0KGRvYywgZnJvbSwgdG8sIG9wdGlvbnMsIHR5cGUpXSwgcHJpbWFyeSA9IG1hcmtlcnNbMF07XG4gIHZhciB3aWRnZXQgPSBvcHRpb25zLndpZGdldE5vZGU7XG4gIGxpbmtlZERvY3MoZG9jLCBmdW5jdGlvbiAoZG9jKSB7XG4gICAgaWYgKHdpZGdldCkgeyBvcHRpb25zLndpZGdldE5vZGUgPSB3aWRnZXQuY2xvbmVOb2RlKHRydWUpOyB9XG4gICAgbWFya2Vycy5wdXNoKG1hcmtUZXh0KGRvYywgY2xpcFBvcyhkb2MsIGZyb20pLCBjbGlwUG9zKGRvYywgdG8pLCBvcHRpb25zLCB0eXBlKSk7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBkb2MubGlua2VkLmxlbmd0aDsgKytpKVxuICAgICAgeyBpZiAoZG9jLmxpbmtlZFtpXS5pc1BhcmVudCkgeyByZXR1cm4gfSB9XG4gICAgcHJpbWFyeSA9IGxzdChtYXJrZXJzKTtcbiAgfSk7XG4gIHJldHVybiBuZXcgU2hhcmVkVGV4dE1hcmtlcihtYXJrZXJzLCBwcmltYXJ5KVxufVxuXG5mdW5jdGlvbiBmaW5kU2hhcmVkTWFya2Vycyhkb2MpIHtcbiAgcmV0dXJuIGRvYy5maW5kTWFya3MoUG9zKGRvYy5maXJzdCwgMCksIGRvYy5jbGlwUG9zKFBvcyhkb2MubGFzdExpbmUoKSkpLCBmdW5jdGlvbiAobSkgeyByZXR1cm4gbS5wYXJlbnQ7IH0pXG59XG5cbmZ1bmN0aW9uIGNvcHlTaGFyZWRNYXJrZXJzKGRvYywgbWFya2Vycykge1xuICBmb3IgKHZhciBpID0gMDsgaSA8IG1hcmtlcnMubGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgbWFya2VyID0gbWFya2Vyc1tpXSwgcG9zID0gbWFya2VyLmZpbmQoKTtcbiAgICB2YXIgbUZyb20gPSBkb2MuY2xpcFBvcyhwb3MuZnJvbSksIG1UbyA9IGRvYy5jbGlwUG9zKHBvcy50byk7XG4gICAgaWYgKGNtcChtRnJvbSwgbVRvKSkge1xuICAgICAgdmFyIHN1Yk1hcmsgPSBtYXJrVGV4dChkb2MsIG1Gcm9tLCBtVG8sIG1hcmtlci5wcmltYXJ5LCBtYXJrZXIucHJpbWFyeS50eXBlKTtcbiAgICAgIG1hcmtlci5tYXJrZXJzLnB1c2goc3ViTWFyayk7XG4gICAgICBzdWJNYXJrLnBhcmVudCA9IG1hcmtlcjtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gZGV0YWNoU2hhcmVkTWFya2VycyhtYXJrZXJzKSB7XG4gIHZhciBsb29wID0gZnVuY3Rpb24gKCBpICkge1xuICAgIHZhciBtYXJrZXIgPSBtYXJrZXJzW2ldLCBsaW5rZWQgPSBbbWFya2VyLnByaW1hcnkuZG9jXTtcbiAgICBsaW5rZWREb2NzKG1hcmtlci5wcmltYXJ5LmRvYywgZnVuY3Rpb24gKGQpIHsgcmV0dXJuIGxpbmtlZC5wdXNoKGQpOyB9KTtcbiAgICBmb3IgKHZhciBqID0gMDsgaiA8IG1hcmtlci5tYXJrZXJzLmxlbmd0aDsgaisrKSB7XG4gICAgICB2YXIgc3ViTWFya2VyID0gbWFya2VyLm1hcmtlcnNbal07XG4gICAgICBpZiAoaW5kZXhPZihsaW5rZWQsIHN1Yk1hcmtlci5kb2MpID09IC0xKSB7XG4gICAgICAgIHN1Yk1hcmtlci5wYXJlbnQgPSBudWxsO1xuICAgICAgICBtYXJrZXIubWFya2Vycy5zcGxpY2Uoai0tLCAxKTtcbiAgICAgIH1cbiAgICB9XG4gIH07XG5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBtYXJrZXJzLmxlbmd0aDsgaSsrKSBsb29wKCBpICk7XG59XG5cbnZhciBuZXh0RG9jSWQgPSAwO1xudmFyIERvYyA9IGZ1bmN0aW9uKHRleHQsIG1vZGUsIGZpcnN0TGluZSwgbGluZVNlcCwgZGlyZWN0aW9uKSB7XG4gIGlmICghKHRoaXMgaW5zdGFuY2VvZiBEb2MpKSB7IHJldHVybiBuZXcgRG9jKHRleHQsIG1vZGUsIGZpcnN0TGluZSwgbGluZVNlcCwgZGlyZWN0aW9uKSB9XG4gIGlmIChmaXJzdExpbmUgPT0gbnVsbCkgeyBmaXJzdExpbmUgPSAwOyB9XG5cbiAgQnJhbmNoQ2h1bmsuY2FsbCh0aGlzLCBbbmV3IExlYWZDaHVuayhbbmV3IExpbmUoXCJcIiwgbnVsbCldKV0pO1xuICB0aGlzLmZpcnN0ID0gZmlyc3RMaW5lO1xuICB0aGlzLnNjcm9sbFRvcCA9IHRoaXMuc2Nyb2xsTGVmdCA9IDA7XG4gIHRoaXMuY2FudEVkaXQgPSBmYWxzZTtcbiAgdGhpcy5jbGVhbkdlbmVyYXRpb24gPSAxO1xuICB0aGlzLm1vZGVGcm9udGllciA9IHRoaXMuaGlnaGxpZ2h0RnJvbnRpZXIgPSBmaXJzdExpbmU7XG4gIHZhciBzdGFydCA9IFBvcyhmaXJzdExpbmUsIDApO1xuICB0aGlzLnNlbCA9IHNpbXBsZVNlbGVjdGlvbihzdGFydCk7XG4gIHRoaXMuaGlzdG9yeSA9IG5ldyBIaXN0b3J5KG51bGwpO1xuICB0aGlzLmlkID0gKytuZXh0RG9jSWQ7XG4gIHRoaXMubW9kZU9wdGlvbiA9IG1vZGU7XG4gIHRoaXMubGluZVNlcCA9IGxpbmVTZXA7XG4gIHRoaXMuZGlyZWN0aW9uID0gKGRpcmVjdGlvbiA9PSBcInJ0bFwiKSA/IFwicnRsXCIgOiBcImx0clwiO1xuICB0aGlzLmV4dGVuZCA9IGZhbHNlO1xuXG4gIGlmICh0eXBlb2YgdGV4dCA9PSBcInN0cmluZ1wiKSB7IHRleHQgPSB0aGlzLnNwbGl0TGluZXModGV4dCk7IH1cbiAgdXBkYXRlRG9jKHRoaXMsIHtmcm9tOiBzdGFydCwgdG86IHN0YXJ0LCB0ZXh0OiB0ZXh0fSk7XG4gIHNldFNlbGVjdGlvbih0aGlzLCBzaW1wbGVTZWxlY3Rpb24oc3RhcnQpLCBzZWxfZG9udFNjcm9sbCk7XG59O1xuXG5Eb2MucHJvdG90eXBlID0gY3JlYXRlT2JqKEJyYW5jaENodW5rLnByb3RvdHlwZSwge1xuICBjb25zdHJ1Y3RvcjogRG9jLFxuICAvLyBJdGVyYXRlIG92ZXIgdGhlIGRvY3VtZW50LiBTdXBwb3J0cyB0d28gZm9ybXMgLS0gd2l0aCBvbmx5IG9uZVxuICAvLyBhcmd1bWVudCwgaXQgY2FsbHMgdGhhdCBmb3IgZWFjaCBsaW5lIGluIHRoZSBkb2N1bWVudC4gV2l0aFxuICAvLyB0aHJlZSwgaXQgaXRlcmF0ZXMgb3ZlciB0aGUgcmFuZ2UgZ2l2ZW4gYnkgdGhlIGZpcnN0IHR3byAod2l0aFxuICAvLyB0aGUgc2Vjb25kIGJlaW5nIG5vbi1pbmNsdXNpdmUpLlxuICBpdGVyOiBmdW5jdGlvbihmcm9tLCB0bywgb3ApIHtcbiAgICBpZiAob3ApIHsgdGhpcy5pdGVyTihmcm9tIC0gdGhpcy5maXJzdCwgdG8gLSBmcm9tLCBvcCk7IH1cbiAgICBlbHNlIHsgdGhpcy5pdGVyTih0aGlzLmZpcnN0LCB0aGlzLmZpcnN0ICsgdGhpcy5zaXplLCBmcm9tKTsgfVxuICB9LFxuXG4gIC8vIE5vbi1wdWJsaWMgaW50ZXJmYWNlIGZvciBhZGRpbmcgYW5kIHJlbW92aW5nIGxpbmVzLlxuICBpbnNlcnQ6IGZ1bmN0aW9uKGF0LCBsaW5lcykge1xuICAgIHZhciBoZWlnaHQgPSAwO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGluZXMubGVuZ3RoOyArK2kpIHsgaGVpZ2h0ICs9IGxpbmVzW2ldLmhlaWdodDsgfVxuICAgIHRoaXMuaW5zZXJ0SW5uZXIoYXQgLSB0aGlzLmZpcnN0LCBsaW5lcywgaGVpZ2h0KTtcbiAgfSxcbiAgcmVtb3ZlOiBmdW5jdGlvbihhdCwgbikgeyB0aGlzLnJlbW92ZUlubmVyKGF0IC0gdGhpcy5maXJzdCwgbik7IH0sXG5cbiAgLy8gRnJvbSBoZXJlLCB0aGUgbWV0aG9kcyBhcmUgcGFydCBvZiB0aGUgcHVibGljIGludGVyZmFjZS4gTW9zdFxuICAvLyBhcmUgYWxzbyBhdmFpbGFibGUgZnJvbSBDb2RlTWlycm9yIChlZGl0b3IpIGluc3RhbmNlcy5cblxuICBnZXRWYWx1ZTogZnVuY3Rpb24obGluZVNlcCkge1xuICAgIHZhciBsaW5lcyA9IGdldExpbmVzKHRoaXMsIHRoaXMuZmlyc3QsIHRoaXMuZmlyc3QgKyB0aGlzLnNpemUpO1xuICAgIGlmIChsaW5lU2VwID09PSBmYWxzZSkgeyByZXR1cm4gbGluZXMgfVxuICAgIHJldHVybiBsaW5lcy5qb2luKGxpbmVTZXAgfHwgdGhpcy5saW5lU2VwYXJhdG9yKCkpXG4gIH0sXG4gIHNldFZhbHVlOiBkb2NNZXRob2RPcChmdW5jdGlvbihjb2RlKSB7XG4gICAgdmFyIHRvcCA9IFBvcyh0aGlzLmZpcnN0LCAwKSwgbGFzdCA9IHRoaXMuZmlyc3QgKyB0aGlzLnNpemUgLSAxO1xuICAgIG1ha2VDaGFuZ2UodGhpcywge2Zyb206IHRvcCwgdG86IFBvcyhsYXN0LCBnZXRMaW5lKHRoaXMsIGxhc3QpLnRleHQubGVuZ3RoKSxcbiAgICAgICAgICAgICAgICAgICAgICB0ZXh0OiB0aGlzLnNwbGl0TGluZXMoY29kZSksIG9yaWdpbjogXCJzZXRWYWx1ZVwiLCBmdWxsOiB0cnVlfSwgdHJ1ZSk7XG4gICAgaWYgKHRoaXMuY20pIHsgc2Nyb2xsVG9Db29yZHModGhpcy5jbSwgMCwgMCk7IH1cbiAgICBzZXRTZWxlY3Rpb24odGhpcywgc2ltcGxlU2VsZWN0aW9uKHRvcCksIHNlbF9kb250U2Nyb2xsKTtcbiAgfSksXG4gIHJlcGxhY2VSYW5nZTogZnVuY3Rpb24oY29kZSwgZnJvbSwgdG8sIG9yaWdpbikge1xuICAgIGZyb20gPSBjbGlwUG9zKHRoaXMsIGZyb20pO1xuICAgIHRvID0gdG8gPyBjbGlwUG9zKHRoaXMsIHRvKSA6IGZyb207XG4gICAgcmVwbGFjZVJhbmdlKHRoaXMsIGNvZGUsIGZyb20sIHRvLCBvcmlnaW4pO1xuICB9LFxuICBnZXRSYW5nZTogZnVuY3Rpb24oZnJvbSwgdG8sIGxpbmVTZXApIHtcbiAgICB2YXIgbGluZXMgPSBnZXRCZXR3ZWVuKHRoaXMsIGNsaXBQb3ModGhpcywgZnJvbSksIGNsaXBQb3ModGhpcywgdG8pKTtcbiAgICBpZiAobGluZVNlcCA9PT0gZmFsc2UpIHsgcmV0dXJuIGxpbmVzIH1cbiAgICByZXR1cm4gbGluZXMuam9pbihsaW5lU2VwIHx8IHRoaXMubGluZVNlcGFyYXRvcigpKVxuICB9LFxuXG4gIGdldExpbmU6IGZ1bmN0aW9uKGxpbmUpIHt2YXIgbCA9IHRoaXMuZ2V0TGluZUhhbmRsZShsaW5lKTsgcmV0dXJuIGwgJiYgbC50ZXh0fSxcblxuICBnZXRMaW5lSGFuZGxlOiBmdW5jdGlvbihsaW5lKSB7aWYgKGlzTGluZSh0aGlzLCBsaW5lKSkgeyByZXR1cm4gZ2V0TGluZSh0aGlzLCBsaW5lKSB9fSxcbiAgZ2V0TGluZU51bWJlcjogZnVuY3Rpb24obGluZSkge3JldHVybiBsaW5lTm8obGluZSl9LFxuXG4gIGdldExpbmVIYW5kbGVWaXN1YWxTdGFydDogZnVuY3Rpb24obGluZSkge1xuICAgIGlmICh0eXBlb2YgbGluZSA9PSBcIm51bWJlclwiKSB7IGxpbmUgPSBnZXRMaW5lKHRoaXMsIGxpbmUpOyB9XG4gICAgcmV0dXJuIHZpc3VhbExpbmUobGluZSlcbiAgfSxcblxuICBsaW5lQ291bnQ6IGZ1bmN0aW9uKCkge3JldHVybiB0aGlzLnNpemV9LFxuICBmaXJzdExpbmU6IGZ1bmN0aW9uKCkge3JldHVybiB0aGlzLmZpcnN0fSxcbiAgbGFzdExpbmU6IGZ1bmN0aW9uKCkge3JldHVybiB0aGlzLmZpcnN0ICsgdGhpcy5zaXplIC0gMX0sXG5cbiAgY2xpcFBvczogZnVuY3Rpb24ocG9zKSB7cmV0dXJuIGNsaXBQb3ModGhpcywgcG9zKX0sXG5cbiAgZ2V0Q3Vyc29yOiBmdW5jdGlvbihzdGFydCkge1xuICAgIHZhciByYW5nZSQkMSA9IHRoaXMuc2VsLnByaW1hcnkoKSwgcG9zO1xuICAgIGlmIChzdGFydCA9PSBudWxsIHx8IHN0YXJ0ID09IFwiaGVhZFwiKSB7IHBvcyA9IHJhbmdlJCQxLmhlYWQ7IH1cbiAgICBlbHNlIGlmIChzdGFydCA9PSBcImFuY2hvclwiKSB7IHBvcyA9IHJhbmdlJCQxLmFuY2hvcjsgfVxuICAgIGVsc2UgaWYgKHN0YXJ0ID09IFwiZW5kXCIgfHwgc3RhcnQgPT0gXCJ0b1wiIHx8IHN0YXJ0ID09PSBmYWxzZSkgeyBwb3MgPSByYW5nZSQkMS50bygpOyB9XG4gICAgZWxzZSB7IHBvcyA9IHJhbmdlJCQxLmZyb20oKTsgfVxuICAgIHJldHVybiBwb3NcbiAgfSxcbiAgbGlzdFNlbGVjdGlvbnM6IGZ1bmN0aW9uKCkgeyByZXR1cm4gdGhpcy5zZWwucmFuZ2VzIH0sXG4gIHNvbWV0aGluZ1NlbGVjdGVkOiBmdW5jdGlvbigpIHtyZXR1cm4gdGhpcy5zZWwuc29tZXRoaW5nU2VsZWN0ZWQoKX0sXG5cbiAgc2V0Q3Vyc29yOiBkb2NNZXRob2RPcChmdW5jdGlvbihsaW5lLCBjaCwgb3B0aW9ucykge1xuICAgIHNldFNpbXBsZVNlbGVjdGlvbih0aGlzLCBjbGlwUG9zKHRoaXMsIHR5cGVvZiBsaW5lID09IFwibnVtYmVyXCIgPyBQb3MobGluZSwgY2ggfHwgMCkgOiBsaW5lKSwgbnVsbCwgb3B0aW9ucyk7XG4gIH0pLFxuICBzZXRTZWxlY3Rpb246IGRvY01ldGhvZE9wKGZ1bmN0aW9uKGFuY2hvciwgaGVhZCwgb3B0aW9ucykge1xuICAgIHNldFNpbXBsZVNlbGVjdGlvbih0aGlzLCBjbGlwUG9zKHRoaXMsIGFuY2hvciksIGNsaXBQb3ModGhpcywgaGVhZCB8fCBhbmNob3IpLCBvcHRpb25zKTtcbiAgfSksXG4gIGV4dGVuZFNlbGVjdGlvbjogZG9jTWV0aG9kT3AoZnVuY3Rpb24oaGVhZCwgb3RoZXIsIG9wdGlvbnMpIHtcbiAgICBleHRlbmRTZWxlY3Rpb24odGhpcywgY2xpcFBvcyh0aGlzLCBoZWFkKSwgb3RoZXIgJiYgY2xpcFBvcyh0aGlzLCBvdGhlciksIG9wdGlvbnMpO1xuICB9KSxcbiAgZXh0ZW5kU2VsZWN0aW9uczogZG9jTWV0aG9kT3AoZnVuY3Rpb24oaGVhZHMsIG9wdGlvbnMpIHtcbiAgICBleHRlbmRTZWxlY3Rpb25zKHRoaXMsIGNsaXBQb3NBcnJheSh0aGlzLCBoZWFkcyksIG9wdGlvbnMpO1xuICB9KSxcbiAgZXh0ZW5kU2VsZWN0aW9uc0J5OiBkb2NNZXRob2RPcChmdW5jdGlvbihmLCBvcHRpb25zKSB7XG4gICAgdmFyIGhlYWRzID0gbWFwKHRoaXMuc2VsLnJhbmdlcywgZik7XG4gICAgZXh0ZW5kU2VsZWN0aW9ucyh0aGlzLCBjbGlwUG9zQXJyYXkodGhpcywgaGVhZHMpLCBvcHRpb25zKTtcbiAgfSksXG4gIHNldFNlbGVjdGlvbnM6IGRvY01ldGhvZE9wKGZ1bmN0aW9uKHJhbmdlcywgcHJpbWFyeSwgb3B0aW9ucykge1xuICAgIHZhciB0aGlzJDEgPSB0aGlzO1xuXG4gICAgaWYgKCFyYW5nZXMubGVuZ3RoKSB7IHJldHVybiB9XG4gICAgdmFyIG91dCA9IFtdO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcmFuZ2VzLmxlbmd0aDsgaSsrKVxuICAgICAgeyBvdXRbaV0gPSBuZXcgUmFuZ2UoY2xpcFBvcyh0aGlzJDEsIHJhbmdlc1tpXS5hbmNob3IpLFxuICAgICAgICAgICAgICAgICAgICAgICAgIGNsaXBQb3ModGhpcyQxLCByYW5nZXNbaV0uaGVhZCkpOyB9XG4gICAgaWYgKHByaW1hcnkgPT0gbnVsbCkgeyBwcmltYXJ5ID0gTWF0aC5taW4ocmFuZ2VzLmxlbmd0aCAtIDEsIHRoaXMuc2VsLnByaW1JbmRleCk7IH1cbiAgICBzZXRTZWxlY3Rpb24odGhpcywgbm9ybWFsaXplU2VsZWN0aW9uKG91dCwgcHJpbWFyeSksIG9wdGlvbnMpO1xuICB9KSxcbiAgYWRkU2VsZWN0aW9uOiBkb2NNZXRob2RPcChmdW5jdGlvbihhbmNob3IsIGhlYWQsIG9wdGlvbnMpIHtcbiAgICB2YXIgcmFuZ2VzID0gdGhpcy5zZWwucmFuZ2VzLnNsaWNlKDApO1xuICAgIHJhbmdlcy5wdXNoKG5ldyBSYW5nZShjbGlwUG9zKHRoaXMsIGFuY2hvciksIGNsaXBQb3ModGhpcywgaGVhZCB8fCBhbmNob3IpKSk7XG4gICAgc2V0U2VsZWN0aW9uKHRoaXMsIG5vcm1hbGl6ZVNlbGVjdGlvbihyYW5nZXMsIHJhbmdlcy5sZW5ndGggLSAxKSwgb3B0aW9ucyk7XG4gIH0pLFxuXG4gIGdldFNlbGVjdGlvbjogZnVuY3Rpb24obGluZVNlcCkge1xuICAgIHZhciB0aGlzJDEgPSB0aGlzO1xuXG4gICAgdmFyIHJhbmdlcyA9IHRoaXMuc2VsLnJhbmdlcywgbGluZXM7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCByYW5nZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciBzZWwgPSBnZXRCZXR3ZWVuKHRoaXMkMSwgcmFuZ2VzW2ldLmZyb20oKSwgcmFuZ2VzW2ldLnRvKCkpO1xuICAgICAgbGluZXMgPSBsaW5lcyA/IGxpbmVzLmNvbmNhdChzZWwpIDogc2VsO1xuICAgIH1cbiAgICBpZiAobGluZVNlcCA9PT0gZmFsc2UpIHsgcmV0dXJuIGxpbmVzIH1cbiAgICBlbHNlIHsgcmV0dXJuIGxpbmVzLmpvaW4obGluZVNlcCB8fCB0aGlzLmxpbmVTZXBhcmF0b3IoKSkgfVxuICB9LFxuICBnZXRTZWxlY3Rpb25zOiBmdW5jdGlvbihsaW5lU2VwKSB7XG4gICAgdmFyIHRoaXMkMSA9IHRoaXM7XG5cbiAgICB2YXIgcGFydHMgPSBbXSwgcmFuZ2VzID0gdGhpcy5zZWwucmFuZ2VzO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcmFuZ2VzLmxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIgc2VsID0gZ2V0QmV0d2Vlbih0aGlzJDEsIHJhbmdlc1tpXS5mcm9tKCksIHJhbmdlc1tpXS50bygpKTtcbiAgICAgIGlmIChsaW5lU2VwICE9PSBmYWxzZSkgeyBzZWwgPSBzZWwuam9pbihsaW5lU2VwIHx8IHRoaXMkMS5saW5lU2VwYXJhdG9yKCkpOyB9XG4gICAgICBwYXJ0c1tpXSA9IHNlbDtcbiAgICB9XG4gICAgcmV0dXJuIHBhcnRzXG4gIH0sXG4gIHJlcGxhY2VTZWxlY3Rpb246IGZ1bmN0aW9uKGNvZGUsIGNvbGxhcHNlLCBvcmlnaW4pIHtcbiAgICB2YXIgZHVwID0gW107XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLnNlbC5yYW5nZXMubGVuZ3RoOyBpKyspXG4gICAgICB7IGR1cFtpXSA9IGNvZGU7IH1cbiAgICB0aGlzLnJlcGxhY2VTZWxlY3Rpb25zKGR1cCwgY29sbGFwc2UsIG9yaWdpbiB8fCBcIitpbnB1dFwiKTtcbiAgfSxcbiAgcmVwbGFjZVNlbGVjdGlvbnM6IGRvY01ldGhvZE9wKGZ1bmN0aW9uKGNvZGUsIGNvbGxhcHNlLCBvcmlnaW4pIHtcbiAgICB2YXIgdGhpcyQxID0gdGhpcztcblxuICAgIHZhciBjaGFuZ2VzID0gW10sIHNlbCA9IHRoaXMuc2VsO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgc2VsLnJhbmdlcy5sZW5ndGg7IGkrKykge1xuICAgICAgdmFyIHJhbmdlJCQxID0gc2VsLnJhbmdlc1tpXTtcbiAgICAgIGNoYW5nZXNbaV0gPSB7ZnJvbTogcmFuZ2UkJDEuZnJvbSgpLCB0bzogcmFuZ2UkJDEudG8oKSwgdGV4dDogdGhpcyQxLnNwbGl0TGluZXMoY29kZVtpXSksIG9yaWdpbjogb3JpZ2lufTtcbiAgICB9XG4gICAgdmFyIG5ld1NlbCA9IGNvbGxhcHNlICYmIGNvbGxhcHNlICE9IFwiZW5kXCIgJiYgY29tcHV0ZVJlcGxhY2VkU2VsKHRoaXMsIGNoYW5nZXMsIGNvbGxhcHNlKTtcbiAgICBmb3IgKHZhciBpJDEgPSBjaGFuZ2VzLmxlbmd0aCAtIDE7IGkkMSA+PSAwOyBpJDEtLSlcbiAgICAgIHsgbWFrZUNoYW5nZSh0aGlzJDEsIGNoYW5nZXNbaSQxXSk7IH1cbiAgICBpZiAobmV3U2VsKSB7IHNldFNlbGVjdGlvblJlcGxhY2VIaXN0b3J5KHRoaXMsIG5ld1NlbCk7IH1cbiAgICBlbHNlIGlmICh0aGlzLmNtKSB7IGVuc3VyZUN1cnNvclZpc2libGUodGhpcy5jbSk7IH1cbiAgfSksXG4gIHVuZG86IGRvY01ldGhvZE9wKGZ1bmN0aW9uKCkge21ha2VDaGFuZ2VGcm9tSGlzdG9yeSh0aGlzLCBcInVuZG9cIik7fSksXG4gIHJlZG86IGRvY01ldGhvZE9wKGZ1bmN0aW9uKCkge21ha2VDaGFuZ2VGcm9tSGlzdG9yeSh0aGlzLCBcInJlZG9cIik7fSksXG4gIHVuZG9TZWxlY3Rpb246IGRvY01ldGhvZE9wKGZ1bmN0aW9uKCkge21ha2VDaGFuZ2VGcm9tSGlzdG9yeSh0aGlzLCBcInVuZG9cIiwgdHJ1ZSk7fSksXG4gIHJlZG9TZWxlY3Rpb246IGRvY01ldGhvZE9wKGZ1bmN0aW9uKCkge21ha2VDaGFuZ2VGcm9tSGlzdG9yeSh0aGlzLCBcInJlZG9cIiwgdHJ1ZSk7fSksXG5cbiAgc2V0RXh0ZW5kaW5nOiBmdW5jdGlvbih2YWwpIHt0aGlzLmV4dGVuZCA9IHZhbDt9LFxuICBnZXRFeHRlbmRpbmc6IGZ1bmN0aW9uKCkge3JldHVybiB0aGlzLmV4dGVuZH0sXG5cbiAgaGlzdG9yeVNpemU6IGZ1bmN0aW9uKCkge1xuICAgIHZhciBoaXN0ID0gdGhpcy5oaXN0b3J5LCBkb25lID0gMCwgdW5kb25lID0gMDtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGhpc3QuZG9uZS5sZW5ndGg7IGkrKykgeyBpZiAoIWhpc3QuZG9uZVtpXS5yYW5nZXMpIHsgKytkb25lOyB9IH1cbiAgICBmb3IgKHZhciBpJDEgPSAwOyBpJDEgPCBoaXN0LnVuZG9uZS5sZW5ndGg7IGkkMSsrKSB7IGlmICghaGlzdC51bmRvbmVbaSQxXS5yYW5nZXMpIHsgKyt1bmRvbmU7IH0gfVxuICAgIHJldHVybiB7dW5kbzogZG9uZSwgcmVkbzogdW5kb25lfVxuICB9LFxuICBjbGVhckhpc3Rvcnk6IGZ1bmN0aW9uKCkge3RoaXMuaGlzdG9yeSA9IG5ldyBIaXN0b3J5KHRoaXMuaGlzdG9yeS5tYXhHZW5lcmF0aW9uKTt9LFxuXG4gIG1hcmtDbGVhbjogZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5jbGVhbkdlbmVyYXRpb24gPSB0aGlzLmNoYW5nZUdlbmVyYXRpb24odHJ1ZSk7XG4gIH0sXG4gIGNoYW5nZUdlbmVyYXRpb246IGZ1bmN0aW9uKGZvcmNlU3BsaXQpIHtcbiAgICBpZiAoZm9yY2VTcGxpdClcbiAgICAgIHsgdGhpcy5oaXN0b3J5Lmxhc3RPcCA9IHRoaXMuaGlzdG9yeS5sYXN0U2VsT3AgPSB0aGlzLmhpc3RvcnkubGFzdE9yaWdpbiA9IG51bGw7IH1cbiAgICByZXR1cm4gdGhpcy5oaXN0b3J5LmdlbmVyYXRpb25cbiAgfSxcbiAgaXNDbGVhbjogZnVuY3Rpb24gKGdlbikge1xuICAgIHJldHVybiB0aGlzLmhpc3RvcnkuZ2VuZXJhdGlvbiA9PSAoZ2VuIHx8IHRoaXMuY2xlYW5HZW5lcmF0aW9uKVxuICB9LFxuXG4gIGdldEhpc3Rvcnk6IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB7ZG9uZTogY29weUhpc3RvcnlBcnJheSh0aGlzLmhpc3RvcnkuZG9uZSksXG4gICAgICAgICAgICB1bmRvbmU6IGNvcHlIaXN0b3J5QXJyYXkodGhpcy5oaXN0b3J5LnVuZG9uZSl9XG4gIH0sXG4gIHNldEhpc3Rvcnk6IGZ1bmN0aW9uKGhpc3REYXRhKSB7XG4gICAgdmFyIGhpc3QgPSB0aGlzLmhpc3RvcnkgPSBuZXcgSGlzdG9yeSh0aGlzLmhpc3RvcnkubWF4R2VuZXJhdGlvbik7XG4gICAgaGlzdC5kb25lID0gY29weUhpc3RvcnlBcnJheShoaXN0RGF0YS5kb25lLnNsaWNlKDApLCBudWxsLCB0cnVlKTtcbiAgICBoaXN0LnVuZG9uZSA9IGNvcHlIaXN0b3J5QXJyYXkoaGlzdERhdGEudW5kb25lLnNsaWNlKDApLCBudWxsLCB0cnVlKTtcbiAgfSxcblxuICBzZXRHdXR0ZXJNYXJrZXI6IGRvY01ldGhvZE9wKGZ1bmN0aW9uKGxpbmUsIGd1dHRlcklELCB2YWx1ZSkge1xuICAgIHJldHVybiBjaGFuZ2VMaW5lKHRoaXMsIGxpbmUsIFwiZ3V0dGVyXCIsIGZ1bmN0aW9uIChsaW5lKSB7XG4gICAgICB2YXIgbWFya2VycyA9IGxpbmUuZ3V0dGVyTWFya2VycyB8fCAobGluZS5ndXR0ZXJNYXJrZXJzID0ge30pO1xuICAgICAgbWFya2Vyc1tndXR0ZXJJRF0gPSB2YWx1ZTtcbiAgICAgIGlmICghdmFsdWUgJiYgaXNFbXB0eShtYXJrZXJzKSkgeyBsaW5lLmd1dHRlck1hcmtlcnMgPSBudWxsOyB9XG4gICAgICByZXR1cm4gdHJ1ZVxuICAgIH0pXG4gIH0pLFxuXG4gIGNsZWFyR3V0dGVyOiBkb2NNZXRob2RPcChmdW5jdGlvbihndXR0ZXJJRCkge1xuICAgIHZhciB0aGlzJDEgPSB0aGlzO1xuXG4gICAgdGhpcy5pdGVyKGZ1bmN0aW9uIChsaW5lKSB7XG4gICAgICBpZiAobGluZS5ndXR0ZXJNYXJrZXJzICYmIGxpbmUuZ3V0dGVyTWFya2Vyc1tndXR0ZXJJRF0pIHtcbiAgICAgICAgY2hhbmdlTGluZSh0aGlzJDEsIGxpbmUsIFwiZ3V0dGVyXCIsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBsaW5lLmd1dHRlck1hcmtlcnNbZ3V0dGVySURdID0gbnVsbDtcbiAgICAgICAgICBpZiAoaXNFbXB0eShsaW5lLmd1dHRlck1hcmtlcnMpKSB7IGxpbmUuZ3V0dGVyTWFya2VycyA9IG51bGw7IH1cbiAgICAgICAgICByZXR1cm4gdHJ1ZVxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfSksXG5cbiAgbGluZUluZm86IGZ1bmN0aW9uKGxpbmUpIHtcbiAgICB2YXIgbjtcbiAgICBpZiAodHlwZW9mIGxpbmUgPT0gXCJudW1iZXJcIikge1xuICAgICAgaWYgKCFpc0xpbmUodGhpcywgbGluZSkpIHsgcmV0dXJuIG51bGwgfVxuICAgICAgbiA9IGxpbmU7XG4gICAgICBsaW5lID0gZ2V0TGluZSh0aGlzLCBsaW5lKTtcbiAgICAgIGlmICghbGluZSkgeyByZXR1cm4gbnVsbCB9XG4gICAgfSBlbHNlIHtcbiAgICAgIG4gPSBsaW5lTm8obGluZSk7XG4gICAgICBpZiAobiA9PSBudWxsKSB7IHJldHVybiBudWxsIH1cbiAgICB9XG4gICAgcmV0dXJuIHtsaW5lOiBuLCBoYW5kbGU6IGxpbmUsIHRleHQ6IGxpbmUudGV4dCwgZ3V0dGVyTWFya2VyczogbGluZS5ndXR0ZXJNYXJrZXJzLFxuICAgICAgICAgICAgdGV4dENsYXNzOiBsaW5lLnRleHRDbGFzcywgYmdDbGFzczogbGluZS5iZ0NsYXNzLCB3cmFwQ2xhc3M6IGxpbmUud3JhcENsYXNzLFxuICAgICAgICAgICAgd2lkZ2V0czogbGluZS53aWRnZXRzfVxuICB9LFxuXG4gIGFkZExpbmVDbGFzczogZG9jTWV0aG9kT3AoZnVuY3Rpb24oaGFuZGxlLCB3aGVyZSwgY2xzKSB7XG4gICAgcmV0dXJuIGNoYW5nZUxpbmUodGhpcywgaGFuZGxlLCB3aGVyZSA9PSBcImd1dHRlclwiID8gXCJndXR0ZXJcIiA6IFwiY2xhc3NcIiwgZnVuY3Rpb24gKGxpbmUpIHtcbiAgICAgIHZhciBwcm9wID0gd2hlcmUgPT0gXCJ0ZXh0XCIgPyBcInRleHRDbGFzc1wiXG4gICAgICAgICAgICAgICA6IHdoZXJlID09IFwiYmFja2dyb3VuZFwiID8gXCJiZ0NsYXNzXCJcbiAgICAgICAgICAgICAgIDogd2hlcmUgPT0gXCJndXR0ZXJcIiA/IFwiZ3V0dGVyQ2xhc3NcIiA6IFwid3JhcENsYXNzXCI7XG4gICAgICBpZiAoIWxpbmVbcHJvcF0pIHsgbGluZVtwcm9wXSA9IGNsczsgfVxuICAgICAgZWxzZSBpZiAoY2xhc3NUZXN0KGNscykudGVzdChsaW5lW3Byb3BdKSkgeyByZXR1cm4gZmFsc2UgfVxuICAgICAgZWxzZSB7IGxpbmVbcHJvcF0gKz0gXCIgXCIgKyBjbHM7IH1cbiAgICAgIHJldHVybiB0cnVlXG4gICAgfSlcbiAgfSksXG4gIHJlbW92ZUxpbmVDbGFzczogZG9jTWV0aG9kT3AoZnVuY3Rpb24oaGFuZGxlLCB3aGVyZSwgY2xzKSB7XG4gICAgcmV0dXJuIGNoYW5nZUxpbmUodGhpcywgaGFuZGxlLCB3aGVyZSA9PSBcImd1dHRlclwiID8gXCJndXR0ZXJcIiA6IFwiY2xhc3NcIiwgZnVuY3Rpb24gKGxpbmUpIHtcbiAgICAgIHZhciBwcm9wID0gd2hlcmUgPT0gXCJ0ZXh0XCIgPyBcInRleHRDbGFzc1wiXG4gICAgICAgICAgICAgICA6IHdoZXJlID09IFwiYmFja2dyb3VuZFwiID8gXCJiZ0NsYXNzXCJcbiAgICAgICAgICAgICAgIDogd2hlcmUgPT0gXCJndXR0ZXJcIiA/IFwiZ3V0dGVyQ2xhc3NcIiA6IFwid3JhcENsYXNzXCI7XG4gICAgICB2YXIgY3VyID0gbGluZVtwcm9wXTtcbiAgICAgIGlmICghY3VyKSB7IHJldHVybiBmYWxzZSB9XG4gICAgICBlbHNlIGlmIChjbHMgPT0gbnVsbCkgeyBsaW5lW3Byb3BdID0gbnVsbDsgfVxuICAgICAgZWxzZSB7XG4gICAgICAgIHZhciBmb3VuZCA9IGN1ci5tYXRjaChjbGFzc1Rlc3QoY2xzKSk7XG4gICAgICAgIGlmICghZm91bmQpIHsgcmV0dXJuIGZhbHNlIH1cbiAgICAgICAgdmFyIGVuZCA9IGZvdW5kLmluZGV4ICsgZm91bmRbMF0ubGVuZ3RoO1xuICAgICAgICBsaW5lW3Byb3BdID0gY3VyLnNsaWNlKDAsIGZvdW5kLmluZGV4KSArICghZm91bmQuaW5kZXggfHwgZW5kID09IGN1ci5sZW5ndGggPyBcIlwiIDogXCIgXCIpICsgY3VyLnNsaWNlKGVuZCkgfHwgbnVsbDtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0cnVlXG4gICAgfSlcbiAgfSksXG5cbiAgYWRkTGluZVdpZGdldDogZG9jTWV0aG9kT3AoZnVuY3Rpb24oaGFuZGxlLCBub2RlLCBvcHRpb25zKSB7XG4gICAgcmV0dXJuIGFkZExpbmVXaWRnZXQodGhpcywgaGFuZGxlLCBub2RlLCBvcHRpb25zKVxuICB9KSxcbiAgcmVtb3ZlTGluZVdpZGdldDogZnVuY3Rpb24od2lkZ2V0KSB7IHdpZGdldC5jbGVhcigpOyB9LFxuXG4gIG1hcmtUZXh0OiBmdW5jdGlvbihmcm9tLCB0bywgb3B0aW9ucykge1xuICAgIHJldHVybiBtYXJrVGV4dCh0aGlzLCBjbGlwUG9zKHRoaXMsIGZyb20pLCBjbGlwUG9zKHRoaXMsIHRvKSwgb3B0aW9ucywgb3B0aW9ucyAmJiBvcHRpb25zLnR5cGUgfHwgXCJyYW5nZVwiKVxuICB9LFxuICBzZXRCb29rbWFyazogZnVuY3Rpb24ocG9zLCBvcHRpb25zKSB7XG4gICAgdmFyIHJlYWxPcHRzID0ge3JlcGxhY2VkV2l0aDogb3B0aW9ucyAmJiAob3B0aW9ucy5ub2RlVHlwZSA9PSBudWxsID8gb3B0aW9ucy53aWRnZXQgOiBvcHRpb25zKSxcbiAgICAgICAgICAgICAgICAgICAgaW5zZXJ0TGVmdDogb3B0aW9ucyAmJiBvcHRpb25zLmluc2VydExlZnQsXG4gICAgICAgICAgICAgICAgICAgIGNsZWFyV2hlbkVtcHR5OiBmYWxzZSwgc2hhcmVkOiBvcHRpb25zICYmIG9wdGlvbnMuc2hhcmVkLFxuICAgICAgICAgICAgICAgICAgICBoYW5kbGVNb3VzZUV2ZW50czogb3B0aW9ucyAmJiBvcHRpb25zLmhhbmRsZU1vdXNlRXZlbnRzfTtcbiAgICBwb3MgPSBjbGlwUG9zKHRoaXMsIHBvcyk7XG4gICAgcmV0dXJuIG1hcmtUZXh0KHRoaXMsIHBvcywgcG9zLCByZWFsT3B0cywgXCJib29rbWFya1wiKVxuICB9LFxuICBmaW5kTWFya3NBdDogZnVuY3Rpb24ocG9zKSB7XG4gICAgcG9zID0gY2xpcFBvcyh0aGlzLCBwb3MpO1xuICAgIHZhciBtYXJrZXJzID0gW10sIHNwYW5zID0gZ2V0TGluZSh0aGlzLCBwb3MubGluZSkubWFya2VkU3BhbnM7XG4gICAgaWYgKHNwYW5zKSB7IGZvciAodmFyIGkgPSAwOyBpIDwgc3BhbnMubGVuZ3RoOyArK2kpIHtcbiAgICAgIHZhciBzcGFuID0gc3BhbnNbaV07XG4gICAgICBpZiAoKHNwYW4uZnJvbSA9PSBudWxsIHx8IHNwYW4uZnJvbSA8PSBwb3MuY2gpICYmXG4gICAgICAgICAgKHNwYW4udG8gPT0gbnVsbCB8fCBzcGFuLnRvID49IHBvcy5jaCkpXG4gICAgICAgIHsgbWFya2Vycy5wdXNoKHNwYW4ubWFya2VyLnBhcmVudCB8fCBzcGFuLm1hcmtlcik7IH1cbiAgICB9IH1cbiAgICByZXR1cm4gbWFya2Vyc1xuICB9LFxuICBmaW5kTWFya3M6IGZ1bmN0aW9uKGZyb20sIHRvLCBmaWx0ZXIpIHtcbiAgICBmcm9tID0gY2xpcFBvcyh0aGlzLCBmcm9tKTsgdG8gPSBjbGlwUG9zKHRoaXMsIHRvKTtcbiAgICB2YXIgZm91bmQgPSBbXSwgbGluZU5vJCQxID0gZnJvbS5saW5lO1xuICAgIHRoaXMuaXRlcihmcm9tLmxpbmUsIHRvLmxpbmUgKyAxLCBmdW5jdGlvbiAobGluZSkge1xuICAgICAgdmFyIHNwYW5zID0gbGluZS5tYXJrZWRTcGFucztcbiAgICAgIGlmIChzcGFucykgeyBmb3IgKHZhciBpID0gMDsgaSA8IHNwYW5zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhciBzcGFuID0gc3BhbnNbaV07XG4gICAgICAgIGlmICghKHNwYW4udG8gIT0gbnVsbCAmJiBsaW5lTm8kJDEgPT0gZnJvbS5saW5lICYmIGZyb20uY2ggPj0gc3Bhbi50byB8fFxuICAgICAgICAgICAgICBzcGFuLmZyb20gPT0gbnVsbCAmJiBsaW5lTm8kJDEgIT0gZnJvbS5saW5lIHx8XG4gICAgICAgICAgICAgIHNwYW4uZnJvbSAhPSBudWxsICYmIGxpbmVObyQkMSA9PSB0by5saW5lICYmIHNwYW4uZnJvbSA+PSB0by5jaCkgJiZcbiAgICAgICAgICAgICghZmlsdGVyIHx8IGZpbHRlcihzcGFuLm1hcmtlcikpKVxuICAgICAgICAgIHsgZm91bmQucHVzaChzcGFuLm1hcmtlci5wYXJlbnQgfHwgc3Bhbi5tYXJrZXIpOyB9XG4gICAgICB9IH1cbiAgICAgICsrbGluZU5vJCQxO1xuICAgIH0pO1xuICAgIHJldHVybiBmb3VuZFxuICB9LFxuICBnZXRBbGxNYXJrczogZnVuY3Rpb24oKSB7XG4gICAgdmFyIG1hcmtlcnMgPSBbXTtcbiAgICB0aGlzLml0ZXIoZnVuY3Rpb24gKGxpbmUpIHtcbiAgICAgIHZhciBzcHMgPSBsaW5lLm1hcmtlZFNwYW5zO1xuICAgICAgaWYgKHNwcykgeyBmb3IgKHZhciBpID0gMDsgaSA8IHNwcy5sZW5ndGg7ICsraSlcbiAgICAgICAgeyBpZiAoc3BzW2ldLmZyb20gIT0gbnVsbCkgeyBtYXJrZXJzLnB1c2goc3BzW2ldLm1hcmtlcik7IH0gfSB9XG4gICAgfSk7XG4gICAgcmV0dXJuIG1hcmtlcnNcbiAgfSxcblxuICBwb3NGcm9tSW5kZXg6IGZ1bmN0aW9uKG9mZikge1xuICAgIHZhciBjaCwgbGluZU5vJCQxID0gdGhpcy5maXJzdCwgc2VwU2l6ZSA9IHRoaXMubGluZVNlcGFyYXRvcigpLmxlbmd0aDtcbiAgICB0aGlzLml0ZXIoZnVuY3Rpb24gKGxpbmUpIHtcbiAgICAgIHZhciBzeiA9IGxpbmUudGV4dC5sZW5ndGggKyBzZXBTaXplO1xuICAgICAgaWYgKHN6ID4gb2ZmKSB7IGNoID0gb2ZmOyByZXR1cm4gdHJ1ZSB9XG4gICAgICBvZmYgLT0gc3o7XG4gICAgICArK2xpbmVObyQkMTtcbiAgICB9KTtcbiAgICByZXR1cm4gY2xpcFBvcyh0aGlzLCBQb3MobGluZU5vJCQxLCBjaCkpXG4gIH0sXG4gIGluZGV4RnJvbVBvczogZnVuY3Rpb24gKGNvb3Jkcykge1xuICAgIGNvb3JkcyA9IGNsaXBQb3ModGhpcywgY29vcmRzKTtcbiAgICB2YXIgaW5kZXggPSBjb29yZHMuY2g7XG4gICAgaWYgKGNvb3Jkcy5saW5lIDwgdGhpcy5maXJzdCB8fCBjb29yZHMuY2ggPCAwKSB7IHJldHVybiAwIH1cbiAgICB2YXIgc2VwU2l6ZSA9IHRoaXMubGluZVNlcGFyYXRvcigpLmxlbmd0aDtcbiAgICB0aGlzLml0ZXIodGhpcy5maXJzdCwgY29vcmRzLmxpbmUsIGZ1bmN0aW9uIChsaW5lKSB7IC8vIGl0ZXIgYWJvcnRzIHdoZW4gY2FsbGJhY2sgcmV0dXJucyBhIHRydXRoeSB2YWx1ZVxuICAgICAgaW5kZXggKz0gbGluZS50ZXh0Lmxlbmd0aCArIHNlcFNpemU7XG4gICAgfSk7XG4gICAgcmV0dXJuIGluZGV4XG4gIH0sXG5cbiAgY29weTogZnVuY3Rpb24oY29weUhpc3RvcnkpIHtcbiAgICB2YXIgZG9jID0gbmV3IERvYyhnZXRMaW5lcyh0aGlzLCB0aGlzLmZpcnN0LCB0aGlzLmZpcnN0ICsgdGhpcy5zaXplKSxcbiAgICAgICAgICAgICAgICAgICAgICB0aGlzLm1vZGVPcHRpb24sIHRoaXMuZmlyc3QsIHRoaXMubGluZVNlcCwgdGhpcy5kaXJlY3Rpb24pO1xuICAgIGRvYy5zY3JvbGxUb3AgPSB0aGlzLnNjcm9sbFRvcDsgZG9jLnNjcm9sbExlZnQgPSB0aGlzLnNjcm9sbExlZnQ7XG4gICAgZG9jLnNlbCA9IHRoaXMuc2VsO1xuICAgIGRvYy5leHRlbmQgPSBmYWxzZTtcbiAgICBpZiAoY29weUhpc3RvcnkpIHtcbiAgICAgIGRvYy5oaXN0b3J5LnVuZG9EZXB0aCA9IHRoaXMuaGlzdG9yeS51bmRvRGVwdGg7XG4gICAgICBkb2Muc2V0SGlzdG9yeSh0aGlzLmdldEhpc3RvcnkoKSk7XG4gICAgfVxuICAgIHJldHVybiBkb2NcbiAgfSxcblxuICBsaW5rZWREb2M6IGZ1bmN0aW9uKG9wdGlvbnMpIHtcbiAgICBpZiAoIW9wdGlvbnMpIHsgb3B0aW9ucyA9IHt9OyB9XG4gICAgdmFyIGZyb20gPSB0aGlzLmZpcnN0LCB0byA9IHRoaXMuZmlyc3QgKyB0aGlzLnNpemU7XG4gICAgaWYgKG9wdGlvbnMuZnJvbSAhPSBudWxsICYmIG9wdGlvbnMuZnJvbSA+IGZyb20pIHsgZnJvbSA9IG9wdGlvbnMuZnJvbTsgfVxuICAgIGlmIChvcHRpb25zLnRvICE9IG51bGwgJiYgb3B0aW9ucy50byA8IHRvKSB7IHRvID0gb3B0aW9ucy50bzsgfVxuICAgIHZhciBjb3B5ID0gbmV3IERvYyhnZXRMaW5lcyh0aGlzLCBmcm9tLCB0byksIG9wdGlvbnMubW9kZSB8fCB0aGlzLm1vZGVPcHRpb24sIGZyb20sIHRoaXMubGluZVNlcCwgdGhpcy5kaXJlY3Rpb24pO1xuICAgIGlmIChvcHRpb25zLnNoYXJlZEhpc3QpIHsgY29weS5oaXN0b3J5ID0gdGhpcy5oaXN0b3J5XG4gICAgOyB9KHRoaXMubGlua2VkIHx8ICh0aGlzLmxpbmtlZCA9IFtdKSkucHVzaCh7ZG9jOiBjb3B5LCBzaGFyZWRIaXN0OiBvcHRpb25zLnNoYXJlZEhpc3R9KTtcbiAgICBjb3B5LmxpbmtlZCA9IFt7ZG9jOiB0aGlzLCBpc1BhcmVudDogdHJ1ZSwgc2hhcmVkSGlzdDogb3B0aW9ucy5zaGFyZWRIaXN0fV07XG4gICAgY29weVNoYXJlZE1hcmtlcnMoY29weSwgZmluZFNoYXJlZE1hcmtlcnModGhpcykpO1xuICAgIHJldHVybiBjb3B5XG4gIH0sXG4gIHVubGlua0RvYzogZnVuY3Rpb24ob3RoZXIpIHtcbiAgICB2YXIgdGhpcyQxID0gdGhpcztcblxuICAgIGlmIChvdGhlciBpbnN0YW5jZW9mIENvZGVNaXJyb3IkMSkgeyBvdGhlciA9IG90aGVyLmRvYzsgfVxuICAgIGlmICh0aGlzLmxpbmtlZCkgeyBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMubGlua2VkLmxlbmd0aDsgKytpKSB7XG4gICAgICB2YXIgbGluayA9IHRoaXMkMS5saW5rZWRbaV07XG4gICAgICBpZiAobGluay5kb2MgIT0gb3RoZXIpIHsgY29udGludWUgfVxuICAgICAgdGhpcyQxLmxpbmtlZC5zcGxpY2UoaSwgMSk7XG4gICAgICBvdGhlci51bmxpbmtEb2ModGhpcyQxKTtcbiAgICAgIGRldGFjaFNoYXJlZE1hcmtlcnMoZmluZFNoYXJlZE1hcmtlcnModGhpcyQxKSk7XG4gICAgICBicmVha1xuICAgIH0gfVxuICAgIC8vIElmIHRoZSBoaXN0b3JpZXMgd2VyZSBzaGFyZWQsIHNwbGl0IHRoZW0gYWdhaW5cbiAgICBpZiAob3RoZXIuaGlzdG9yeSA9PSB0aGlzLmhpc3RvcnkpIHtcbiAgICAgIHZhciBzcGxpdElkcyA9IFtvdGhlci5pZF07XG4gICAgICBsaW5rZWREb2NzKG90aGVyLCBmdW5jdGlvbiAoZG9jKSB7IHJldHVybiBzcGxpdElkcy5wdXNoKGRvYy5pZCk7IH0sIHRydWUpO1xuICAgICAgb3RoZXIuaGlzdG9yeSA9IG5ldyBIaXN0b3J5KG51bGwpO1xuICAgICAgb3RoZXIuaGlzdG9yeS5kb25lID0gY29weUhpc3RvcnlBcnJheSh0aGlzLmhpc3RvcnkuZG9uZSwgc3BsaXRJZHMpO1xuICAgICAgb3RoZXIuaGlzdG9yeS51bmRvbmUgPSBjb3B5SGlzdG9yeUFycmF5KHRoaXMuaGlzdG9yeS51bmRvbmUsIHNwbGl0SWRzKTtcbiAgICB9XG4gIH0sXG4gIGl0ZXJMaW5rZWREb2NzOiBmdW5jdGlvbihmKSB7bGlua2VkRG9jcyh0aGlzLCBmKTt9LFxuXG4gIGdldE1vZGU6IGZ1bmN0aW9uKCkge3JldHVybiB0aGlzLm1vZGV9LFxuICBnZXRFZGl0b3I6IGZ1bmN0aW9uKCkge3JldHVybiB0aGlzLmNtfSxcblxuICBzcGxpdExpbmVzOiBmdW5jdGlvbihzdHIpIHtcbiAgICBpZiAodGhpcy5saW5lU2VwKSB7IHJldHVybiBzdHIuc3BsaXQodGhpcy5saW5lU2VwKSB9XG4gICAgcmV0dXJuIHNwbGl0TGluZXNBdXRvKHN0cilcbiAgfSxcbiAgbGluZVNlcGFyYXRvcjogZnVuY3Rpb24oKSB7IHJldHVybiB0aGlzLmxpbmVTZXAgfHwgXCJcXG5cIiB9LFxuXG4gIHNldERpcmVjdGlvbjogZG9jTWV0aG9kT3AoZnVuY3Rpb24gKGRpcikge1xuICAgIGlmIChkaXIgIT0gXCJydGxcIikgeyBkaXIgPSBcImx0clwiOyB9XG4gICAgaWYgKGRpciA9PSB0aGlzLmRpcmVjdGlvbikgeyByZXR1cm4gfVxuICAgIHRoaXMuZGlyZWN0aW9uID0gZGlyO1xuICAgIHRoaXMuaXRlcihmdW5jdGlvbiAobGluZSkgeyByZXR1cm4gbGluZS5vcmRlciA9IG51bGw7IH0pO1xuICAgIGlmICh0aGlzLmNtKSB7IGRpcmVjdGlvbkNoYW5nZWQodGhpcy5jbSk7IH1cbiAgfSlcbn0pO1xuXG4vLyBQdWJsaWMgYWxpYXMuXG5Eb2MucHJvdG90eXBlLmVhY2hMaW5lID0gRG9jLnByb3RvdHlwZS5pdGVyO1xuXG4vLyBLbHVkZ2UgdG8gd29yayBhcm91bmQgc3RyYW5nZSBJRSBiZWhhdmlvciB3aGVyZSBpdCdsbCBzb21ldGltZXNcbi8vIHJlLWZpcmUgYSBzZXJpZXMgb2YgZHJhZy1yZWxhdGVkIGV2ZW50cyByaWdodCBhZnRlciB0aGUgZHJvcCAoIzE1NTEpXG52YXIgbGFzdERyb3AgPSAwO1xuXG5mdW5jdGlvbiBvbkRyb3AoZSkge1xuICB2YXIgY20gPSB0aGlzO1xuICBjbGVhckRyYWdDdXJzb3IoY20pO1xuICBpZiAoc2lnbmFsRE9NRXZlbnQoY20sIGUpIHx8IGV2ZW50SW5XaWRnZXQoY20uZGlzcGxheSwgZSkpXG4gICAgeyByZXR1cm4gfVxuICBlX3ByZXZlbnREZWZhdWx0KGUpO1xuICBpZiAoaWUpIHsgbGFzdERyb3AgPSArbmV3IERhdGU7IH1cbiAgdmFyIHBvcyA9IHBvc0Zyb21Nb3VzZShjbSwgZSwgdHJ1ZSksIGZpbGVzID0gZS5kYXRhVHJhbnNmZXIuZmlsZXM7XG4gIGlmICghcG9zIHx8IGNtLmlzUmVhZE9ubHkoKSkgeyByZXR1cm4gfVxuICAvLyBNaWdodCBiZSBhIGZpbGUgZHJvcCwgaW4gd2hpY2ggY2FzZSB3ZSBzaW1wbHkgZXh0cmFjdCB0aGUgdGV4dFxuICAvLyBhbmQgaW5zZXJ0IGl0LlxuICBpZiAoZmlsZXMgJiYgZmlsZXMubGVuZ3RoICYmIHdpbmRvdy5GaWxlUmVhZGVyICYmIHdpbmRvdy5GaWxlKSB7XG4gICAgdmFyIG4gPSBmaWxlcy5sZW5ndGgsIHRleHQgPSBBcnJheShuKSwgcmVhZCA9IDA7XG4gICAgdmFyIGxvYWRGaWxlID0gZnVuY3Rpb24gKGZpbGUsIGkpIHtcbiAgICAgIGlmIChjbS5vcHRpb25zLmFsbG93RHJvcEZpbGVUeXBlcyAmJlxuICAgICAgICAgIGluZGV4T2YoY20ub3B0aW9ucy5hbGxvd0Ryb3BGaWxlVHlwZXMsIGZpbGUudHlwZSkgPT0gLTEpXG4gICAgICAgIHsgcmV0dXJuIH1cblxuICAgICAgdmFyIHJlYWRlciA9IG5ldyBGaWxlUmVhZGVyO1xuICAgICAgcmVhZGVyLm9ubG9hZCA9IG9wZXJhdGlvbihjbSwgZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgY29udGVudCA9IHJlYWRlci5yZXN1bHQ7XG4gICAgICAgIGlmICgvW1xceDAwLVxceDA4XFx4MGUtXFx4MWZdezJ9Ly50ZXN0KGNvbnRlbnQpKSB7IGNvbnRlbnQgPSBcIlwiOyB9XG4gICAgICAgIHRleHRbaV0gPSBjb250ZW50O1xuICAgICAgICBpZiAoKytyZWFkID09IG4pIHtcbiAgICAgICAgICBwb3MgPSBjbGlwUG9zKGNtLmRvYywgcG9zKTtcbiAgICAgICAgICB2YXIgY2hhbmdlID0ge2Zyb206IHBvcywgdG86IHBvcyxcbiAgICAgICAgICAgICAgICAgICAgICAgIHRleHQ6IGNtLmRvYy5zcGxpdExpbmVzKHRleHQuam9pbihjbS5kb2MubGluZVNlcGFyYXRvcigpKSksXG4gICAgICAgICAgICAgICAgICAgICAgICBvcmlnaW46IFwicGFzdGVcIn07XG4gICAgICAgICAgbWFrZUNoYW5nZShjbS5kb2MsIGNoYW5nZSk7XG4gICAgICAgICAgc2V0U2VsZWN0aW9uUmVwbGFjZUhpc3RvcnkoY20uZG9jLCBzaW1wbGVTZWxlY3Rpb24ocG9zLCBjaGFuZ2VFbmQoY2hhbmdlKSkpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIHJlYWRlci5yZWFkQXNUZXh0KGZpbGUpO1xuICAgIH07XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBuOyArK2kpIHsgbG9hZEZpbGUoZmlsZXNbaV0sIGkpOyB9XG4gIH0gZWxzZSB7IC8vIE5vcm1hbCBkcm9wXG4gICAgLy8gRG9uJ3QgZG8gYSByZXBsYWNlIGlmIHRoZSBkcm9wIGhhcHBlbmVkIGluc2lkZSBvZiB0aGUgc2VsZWN0ZWQgdGV4dC5cbiAgICBpZiAoY20uc3RhdGUuZHJhZ2dpbmdUZXh0ICYmIGNtLmRvYy5zZWwuY29udGFpbnMocG9zKSA+IC0xKSB7XG4gICAgICBjbS5zdGF0ZS5kcmFnZ2luZ1RleHQoZSk7XG4gICAgICAvLyBFbnN1cmUgdGhlIGVkaXRvciBpcyByZS1mb2N1c2VkXG4gICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHsgcmV0dXJuIGNtLmRpc3BsYXkuaW5wdXQuZm9jdXMoKTsgfSwgMjApO1xuICAgICAgcmV0dXJuXG4gICAgfVxuICAgIHRyeSB7XG4gICAgICB2YXIgdGV4dCQxID0gZS5kYXRhVHJhbnNmZXIuZ2V0RGF0YShcIlRleHRcIik7XG4gICAgICBpZiAodGV4dCQxKSB7XG4gICAgICAgIHZhciBzZWxlY3RlZDtcbiAgICAgICAgaWYgKGNtLnN0YXRlLmRyYWdnaW5nVGV4dCAmJiAhY20uc3RhdGUuZHJhZ2dpbmdUZXh0LmNvcHkpXG4gICAgICAgICAgeyBzZWxlY3RlZCA9IGNtLmxpc3RTZWxlY3Rpb25zKCk7IH1cbiAgICAgICAgc2V0U2VsZWN0aW9uTm9VbmRvKGNtLmRvYywgc2ltcGxlU2VsZWN0aW9uKHBvcywgcG9zKSk7XG4gICAgICAgIGlmIChzZWxlY3RlZCkgeyBmb3IgKHZhciBpJDEgPSAwOyBpJDEgPCBzZWxlY3RlZC5sZW5ndGg7ICsraSQxKVxuICAgICAgICAgIHsgcmVwbGFjZVJhbmdlKGNtLmRvYywgXCJcIiwgc2VsZWN0ZWRbaSQxXS5hbmNob3IsIHNlbGVjdGVkW2kkMV0uaGVhZCwgXCJkcmFnXCIpOyB9IH1cbiAgICAgICAgY20ucmVwbGFjZVNlbGVjdGlvbih0ZXh0JDEsIFwiYXJvdW5kXCIsIFwicGFzdGVcIik7XG4gICAgICAgIGNtLmRpc3BsYXkuaW5wdXQuZm9jdXMoKTtcbiAgICAgIH1cbiAgICB9XG4gICAgY2F0Y2goZSl7fVxuICB9XG59XG5cbmZ1bmN0aW9uIG9uRHJhZ1N0YXJ0KGNtLCBlKSB7XG4gIGlmIChpZSAmJiAoIWNtLnN0YXRlLmRyYWdnaW5nVGV4dCB8fCArbmV3IERhdGUgLSBsYXN0RHJvcCA8IDEwMCkpIHsgZV9zdG9wKGUpOyByZXR1cm4gfVxuICBpZiAoc2lnbmFsRE9NRXZlbnQoY20sIGUpIHx8IGV2ZW50SW5XaWRnZXQoY20uZGlzcGxheSwgZSkpIHsgcmV0dXJuIH1cblxuICBlLmRhdGFUcmFuc2Zlci5zZXREYXRhKFwiVGV4dFwiLCBjbS5nZXRTZWxlY3Rpb24oKSk7XG4gIGUuZGF0YVRyYW5zZmVyLmVmZmVjdEFsbG93ZWQgPSBcImNvcHlNb3ZlXCI7XG5cbiAgLy8gVXNlIGR1bW15IGltYWdlIGluc3RlYWQgb2YgZGVmYXVsdCBicm93c2VycyBpbWFnZS5cbiAgLy8gUmVjZW50IFNhZmFyaSAofjYuMC4yKSBoYXZlIGEgdGVuZGVuY3kgdG8gc2VnZmF1bHQgd2hlbiB0aGlzIGhhcHBlbnMsIHNvIHdlIGRvbid0IGRvIGl0IHRoZXJlLlxuICBpZiAoZS5kYXRhVHJhbnNmZXIuc2V0RHJhZ0ltYWdlICYmICFzYWZhcmkpIHtcbiAgICB2YXIgaW1nID0gZWx0KFwiaW1nXCIsIG51bGwsIG51bGwsIFwicG9zaXRpb246IGZpeGVkOyBsZWZ0OiAwOyB0b3A6IDA7XCIpO1xuICAgIGltZy5zcmMgPSBcImRhdGE6aW1hZ2UvZ2lmO2Jhc2U2NCxSMGxHT0RsaEFRQUJBQUFBQUNINUJBRUtBQUVBTEFBQUFBQUJBQUVBQUFJQ1RBRUFPdz09XCI7XG4gICAgaWYgKHByZXN0bykge1xuICAgICAgaW1nLndpZHRoID0gaW1nLmhlaWdodCA9IDE7XG4gICAgICBjbS5kaXNwbGF5LndyYXBwZXIuYXBwZW5kQ2hpbGQoaW1nKTtcbiAgICAgIC8vIEZvcmNlIGEgcmVsYXlvdXQsIG9yIE9wZXJhIHdvbid0IHVzZSBvdXIgaW1hZ2UgZm9yIHNvbWUgb2JzY3VyZSByZWFzb25cbiAgICAgIGltZy5fdG9wID0gaW1nLm9mZnNldFRvcDtcbiAgICB9XG4gICAgZS5kYXRhVHJhbnNmZXIuc2V0RHJhZ0ltYWdlKGltZywgMCwgMCk7XG4gICAgaWYgKHByZXN0bykgeyBpbWcucGFyZW50Tm9kZS5yZW1vdmVDaGlsZChpbWcpOyB9XG4gIH1cbn1cblxuZnVuY3Rpb24gb25EcmFnT3ZlcihjbSwgZSkge1xuICB2YXIgcG9zID0gcG9zRnJvbU1vdXNlKGNtLCBlKTtcbiAgaWYgKCFwb3MpIHsgcmV0dXJuIH1cbiAgdmFyIGZyYWcgPSBkb2N1bWVudC5jcmVhdGVEb2N1bWVudEZyYWdtZW50KCk7XG4gIGRyYXdTZWxlY3Rpb25DdXJzb3IoY20sIHBvcywgZnJhZyk7XG4gIGlmICghY20uZGlzcGxheS5kcmFnQ3Vyc29yKSB7XG4gICAgY20uZGlzcGxheS5kcmFnQ3Vyc29yID0gZWx0KFwiZGl2XCIsIG51bGwsIFwiQ29kZU1pcnJvci1jdXJzb3JzIENvZGVNaXJyb3ItZHJhZ2N1cnNvcnNcIik7XG4gICAgY20uZGlzcGxheS5saW5lU3BhY2UuaW5zZXJ0QmVmb3JlKGNtLmRpc3BsYXkuZHJhZ0N1cnNvciwgY20uZGlzcGxheS5jdXJzb3JEaXYpO1xuICB9XG4gIHJlbW92ZUNoaWxkcmVuQW5kQWRkKGNtLmRpc3BsYXkuZHJhZ0N1cnNvciwgZnJhZyk7XG59XG5cbmZ1bmN0aW9uIGNsZWFyRHJhZ0N1cnNvcihjbSkge1xuICBpZiAoY20uZGlzcGxheS5kcmFnQ3Vyc29yKSB7XG4gICAgY20uZGlzcGxheS5saW5lU3BhY2UucmVtb3ZlQ2hpbGQoY20uZGlzcGxheS5kcmFnQ3Vyc29yKTtcbiAgICBjbS5kaXNwbGF5LmRyYWdDdXJzb3IgPSBudWxsO1xuICB9XG59XG5cbi8vIFRoZXNlIG11c3QgYmUgaGFuZGxlZCBjYXJlZnVsbHksIGJlY2F1c2UgbmFpdmVseSByZWdpc3RlcmluZyBhXG4vLyBoYW5kbGVyIGZvciBlYWNoIGVkaXRvciB3aWxsIGNhdXNlIHRoZSBlZGl0b3JzIHRvIG5ldmVyIGJlXG4vLyBnYXJiYWdlIGNvbGxlY3RlZC5cblxuZnVuY3Rpb24gZm9yRWFjaENvZGVNaXJyb3IoZikge1xuICBpZiAoIWRvY3VtZW50LmdldEVsZW1lbnRzQnlDbGFzc05hbWUpIHsgcmV0dXJuIH1cbiAgdmFyIGJ5Q2xhc3MgPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5Q2xhc3NOYW1lKFwiQ29kZU1pcnJvclwiKTtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBieUNsYXNzLmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIGNtID0gYnlDbGFzc1tpXS5Db2RlTWlycm9yO1xuICAgIGlmIChjbSkgeyBmKGNtKTsgfVxuICB9XG59XG5cbnZhciBnbG9iYWxzUmVnaXN0ZXJlZCA9IGZhbHNlO1xuZnVuY3Rpb24gZW5zdXJlR2xvYmFsSGFuZGxlcnMoKSB7XG4gIGlmIChnbG9iYWxzUmVnaXN0ZXJlZCkgeyByZXR1cm4gfVxuICByZWdpc3Rlckdsb2JhbEhhbmRsZXJzKCk7XG4gIGdsb2JhbHNSZWdpc3RlcmVkID0gdHJ1ZTtcbn1cbmZ1bmN0aW9uIHJlZ2lzdGVyR2xvYmFsSGFuZGxlcnMoKSB7XG4gIC8vIFdoZW4gdGhlIHdpbmRvdyByZXNpemVzLCB3ZSBuZWVkIHRvIHJlZnJlc2ggYWN0aXZlIGVkaXRvcnMuXG4gIHZhciByZXNpemVUaW1lcjtcbiAgb24od2luZG93LCBcInJlc2l6ZVwiLCBmdW5jdGlvbiAoKSB7XG4gICAgaWYgKHJlc2l6ZVRpbWVyID09IG51bGwpIHsgcmVzaXplVGltZXIgPSBzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgIHJlc2l6ZVRpbWVyID0gbnVsbDtcbiAgICAgIGZvckVhY2hDb2RlTWlycm9yKG9uUmVzaXplKTtcbiAgICB9LCAxMDApOyB9XG4gIH0pO1xuICAvLyBXaGVuIHRoZSB3aW5kb3cgbG9zZXMgZm9jdXMsIHdlIHdhbnQgdG8gc2hvdyB0aGUgZWRpdG9yIGFzIGJsdXJyZWRcbiAgb24od2luZG93LCBcImJsdXJcIiwgZnVuY3Rpb24gKCkgeyByZXR1cm4gZm9yRWFjaENvZGVNaXJyb3Iob25CbHVyKTsgfSk7XG59XG4vLyBDYWxsZWQgd2hlbiB0aGUgd2luZG93IHJlc2l6ZXNcbmZ1bmN0aW9uIG9uUmVzaXplKGNtKSB7XG4gIHZhciBkID0gY20uZGlzcGxheTtcbiAgaWYgKGQubGFzdFdyYXBIZWlnaHQgPT0gZC53cmFwcGVyLmNsaWVudEhlaWdodCAmJiBkLmxhc3RXcmFwV2lkdGggPT0gZC53cmFwcGVyLmNsaWVudFdpZHRoKVxuICAgIHsgcmV0dXJuIH1cbiAgLy8gTWlnaHQgYmUgYSB0ZXh0IHNjYWxpbmcgb3BlcmF0aW9uLCBjbGVhciBzaXplIGNhY2hlcy5cbiAgZC5jYWNoZWRDaGFyV2lkdGggPSBkLmNhY2hlZFRleHRIZWlnaHQgPSBkLmNhY2hlZFBhZGRpbmdIID0gbnVsbDtcbiAgZC5zY3JvbGxiYXJzQ2xpcHBlZCA9IGZhbHNlO1xuICBjbS5zZXRTaXplKCk7XG59XG5cbnZhciBrZXlOYW1lcyA9IHtcbiAgMzogXCJQYXVzZVwiLCA4OiBcIkJhY2tzcGFjZVwiLCA5OiBcIlRhYlwiLCAxMzogXCJFbnRlclwiLCAxNjogXCJTaGlmdFwiLCAxNzogXCJDdHJsXCIsIDE4OiBcIkFsdFwiLFxuICAxOTogXCJQYXVzZVwiLCAyMDogXCJDYXBzTG9ja1wiLCAyNzogXCJFc2NcIiwgMzI6IFwiU3BhY2VcIiwgMzM6IFwiUGFnZVVwXCIsIDM0OiBcIlBhZ2VEb3duXCIsIDM1OiBcIkVuZFwiLFxuICAzNjogXCJIb21lXCIsIDM3OiBcIkxlZnRcIiwgMzg6IFwiVXBcIiwgMzk6IFwiUmlnaHRcIiwgNDA6IFwiRG93blwiLCA0NDogXCJQcmludFNjcm5cIiwgNDU6IFwiSW5zZXJ0XCIsXG4gIDQ2OiBcIkRlbGV0ZVwiLCA1OTogXCI7XCIsIDYxOiBcIj1cIiwgOTE6IFwiTW9kXCIsIDkyOiBcIk1vZFwiLCA5MzogXCJNb2RcIixcbiAgMTA2OiBcIipcIiwgMTA3OiBcIj1cIiwgMTA5OiBcIi1cIiwgMTEwOiBcIi5cIiwgMTExOiBcIi9cIiwgMTI3OiBcIkRlbGV0ZVwiLCAxNDU6IFwiU2Nyb2xsTG9ja1wiLFxuICAxNzM6IFwiLVwiLCAxODY6IFwiO1wiLCAxODc6IFwiPVwiLCAxODg6IFwiLFwiLCAxODk6IFwiLVwiLCAxOTA6IFwiLlwiLCAxOTE6IFwiL1wiLCAxOTI6IFwiYFwiLCAyMTk6IFwiW1wiLCAyMjA6IFwiXFxcXFwiLFxuICAyMjE6IFwiXVwiLCAyMjI6IFwiJ1wiLCA2MzIzMjogXCJVcFwiLCA2MzIzMzogXCJEb3duXCIsIDYzMjM0OiBcIkxlZnRcIiwgNjMyMzU6IFwiUmlnaHRcIiwgNjMyNzI6IFwiRGVsZXRlXCIsXG4gIDYzMjczOiBcIkhvbWVcIiwgNjMyNzU6IFwiRW5kXCIsIDYzMjc2OiBcIlBhZ2VVcFwiLCA2MzI3NzogXCJQYWdlRG93blwiLCA2MzMwMjogXCJJbnNlcnRcIlxufTtcblxuLy8gTnVtYmVyIGtleXNcbmZvciAodmFyIGkgPSAwOyBpIDwgMTA7IGkrKykgeyBrZXlOYW1lc1tpICsgNDhdID0ga2V5TmFtZXNbaSArIDk2XSA9IFN0cmluZyhpKTsgfVxuLy8gQWxwaGFiZXRpYyBrZXlzXG5mb3IgKHZhciBpJDEgPSA2NTsgaSQxIDw9IDkwOyBpJDErKykgeyBrZXlOYW1lc1tpJDFdID0gU3RyaW5nLmZyb21DaGFyQ29kZShpJDEpOyB9XG4vLyBGdW5jdGlvbiBrZXlzXG5mb3IgKHZhciBpJDIgPSAxOyBpJDIgPD0gMTI7IGkkMisrKSB7IGtleU5hbWVzW2kkMiArIDExMV0gPSBrZXlOYW1lc1tpJDIgKyA2MzIzNV0gPSBcIkZcIiArIGkkMjsgfVxuXG52YXIga2V5TWFwID0ge307XG5cbmtleU1hcC5iYXNpYyA9IHtcbiAgXCJMZWZ0XCI6IFwiZ29DaGFyTGVmdFwiLCBcIlJpZ2h0XCI6IFwiZ29DaGFyUmlnaHRcIiwgXCJVcFwiOiBcImdvTGluZVVwXCIsIFwiRG93blwiOiBcImdvTGluZURvd25cIixcbiAgXCJFbmRcIjogXCJnb0xpbmVFbmRcIiwgXCJIb21lXCI6IFwiZ29MaW5lU3RhcnRTbWFydFwiLCBcIlBhZ2VVcFwiOiBcImdvUGFnZVVwXCIsIFwiUGFnZURvd25cIjogXCJnb1BhZ2VEb3duXCIsXG4gIFwiRGVsZXRlXCI6IFwiZGVsQ2hhckFmdGVyXCIsIFwiQmFja3NwYWNlXCI6IFwiZGVsQ2hhckJlZm9yZVwiLCBcIlNoaWZ0LUJhY2tzcGFjZVwiOiBcImRlbENoYXJCZWZvcmVcIixcbiAgXCJUYWJcIjogXCJkZWZhdWx0VGFiXCIsIFwiU2hpZnQtVGFiXCI6IFwiaW5kZW50QXV0b1wiLFxuICBcIkVudGVyXCI6IFwibmV3bGluZUFuZEluZGVudFwiLCBcIkluc2VydFwiOiBcInRvZ2dsZU92ZXJ3cml0ZVwiLFxuICBcIkVzY1wiOiBcInNpbmdsZVNlbGVjdGlvblwiXG59O1xuLy8gTm90ZSB0aGF0IHRoZSBzYXZlIGFuZCBmaW5kLXJlbGF0ZWQgY29tbWFuZHMgYXJlbid0IGRlZmluZWQgYnlcbi8vIGRlZmF1bHQuIFVzZXIgY29kZSBvciBhZGRvbnMgY2FuIGRlZmluZSB0aGVtLiBVbmtub3duIGNvbW1hbmRzXG4vLyBhcmUgc2ltcGx5IGlnbm9yZWQuXG5rZXlNYXAucGNEZWZhdWx0ID0ge1xuICBcIkN0cmwtQVwiOiBcInNlbGVjdEFsbFwiLCBcIkN0cmwtRFwiOiBcImRlbGV0ZUxpbmVcIiwgXCJDdHJsLVpcIjogXCJ1bmRvXCIsIFwiU2hpZnQtQ3RybC1aXCI6IFwicmVkb1wiLCBcIkN0cmwtWVwiOiBcInJlZG9cIixcbiAgXCJDdHJsLUhvbWVcIjogXCJnb0RvY1N0YXJ0XCIsIFwiQ3RybC1FbmRcIjogXCJnb0RvY0VuZFwiLCBcIkN0cmwtVXBcIjogXCJnb0xpbmVVcFwiLCBcIkN0cmwtRG93blwiOiBcImdvTGluZURvd25cIixcbiAgXCJDdHJsLUxlZnRcIjogXCJnb0dyb3VwTGVmdFwiLCBcIkN0cmwtUmlnaHRcIjogXCJnb0dyb3VwUmlnaHRcIiwgXCJBbHQtTGVmdFwiOiBcImdvTGluZVN0YXJ0XCIsIFwiQWx0LVJpZ2h0XCI6IFwiZ29MaW5lRW5kXCIsXG4gIFwiQ3RybC1CYWNrc3BhY2VcIjogXCJkZWxHcm91cEJlZm9yZVwiLCBcIkN0cmwtRGVsZXRlXCI6IFwiZGVsR3JvdXBBZnRlclwiLCBcIkN0cmwtU1wiOiBcInNhdmVcIiwgXCJDdHJsLUZcIjogXCJmaW5kXCIsXG4gIFwiQ3RybC1HXCI6IFwiZmluZE5leHRcIiwgXCJTaGlmdC1DdHJsLUdcIjogXCJmaW5kUHJldlwiLCBcIlNoaWZ0LUN0cmwtRlwiOiBcInJlcGxhY2VcIiwgXCJTaGlmdC1DdHJsLVJcIjogXCJyZXBsYWNlQWxsXCIsXG4gIFwiQ3RybC1bXCI6IFwiaW5kZW50TGVzc1wiLCBcIkN0cmwtXVwiOiBcImluZGVudE1vcmVcIixcbiAgXCJDdHJsLVVcIjogXCJ1bmRvU2VsZWN0aW9uXCIsIFwiU2hpZnQtQ3RybC1VXCI6IFwicmVkb1NlbGVjdGlvblwiLCBcIkFsdC1VXCI6IFwicmVkb1NlbGVjdGlvblwiLFxuICBmYWxsdGhyb3VnaDogXCJiYXNpY1wiXG59O1xuLy8gVmVyeSBiYXNpYyByZWFkbGluZS9lbWFjcy1zdHlsZSBiaW5kaW5ncywgd2hpY2ggYXJlIHN0YW5kYXJkIG9uIE1hYy5cbmtleU1hcC5lbWFjc3kgPSB7XG4gIFwiQ3RybC1GXCI6IFwiZ29DaGFyUmlnaHRcIiwgXCJDdHJsLUJcIjogXCJnb0NoYXJMZWZ0XCIsIFwiQ3RybC1QXCI6IFwiZ29MaW5lVXBcIiwgXCJDdHJsLU5cIjogXCJnb0xpbmVEb3duXCIsXG4gIFwiQWx0LUZcIjogXCJnb1dvcmRSaWdodFwiLCBcIkFsdC1CXCI6IFwiZ29Xb3JkTGVmdFwiLCBcIkN0cmwtQVwiOiBcImdvTGluZVN0YXJ0XCIsIFwiQ3RybC1FXCI6IFwiZ29MaW5lRW5kXCIsXG4gIFwiQ3RybC1WXCI6IFwiZ29QYWdlRG93blwiLCBcIlNoaWZ0LUN0cmwtVlwiOiBcImdvUGFnZVVwXCIsIFwiQ3RybC1EXCI6IFwiZGVsQ2hhckFmdGVyXCIsIFwiQ3RybC1IXCI6IFwiZGVsQ2hhckJlZm9yZVwiLFxuICBcIkFsdC1EXCI6IFwiZGVsV29yZEFmdGVyXCIsIFwiQWx0LUJhY2tzcGFjZVwiOiBcImRlbFdvcmRCZWZvcmVcIiwgXCJDdHJsLUtcIjogXCJraWxsTGluZVwiLCBcIkN0cmwtVFwiOiBcInRyYW5zcG9zZUNoYXJzXCIsXG4gIFwiQ3RybC1PXCI6IFwib3BlbkxpbmVcIlxufTtcbmtleU1hcC5tYWNEZWZhdWx0ID0ge1xuICBcIkNtZC1BXCI6IFwic2VsZWN0QWxsXCIsIFwiQ21kLURcIjogXCJkZWxldGVMaW5lXCIsIFwiQ21kLVpcIjogXCJ1bmRvXCIsIFwiU2hpZnQtQ21kLVpcIjogXCJyZWRvXCIsIFwiQ21kLVlcIjogXCJyZWRvXCIsXG4gIFwiQ21kLUhvbWVcIjogXCJnb0RvY1N0YXJ0XCIsIFwiQ21kLVVwXCI6IFwiZ29Eb2NTdGFydFwiLCBcIkNtZC1FbmRcIjogXCJnb0RvY0VuZFwiLCBcIkNtZC1Eb3duXCI6IFwiZ29Eb2NFbmRcIiwgXCJBbHQtTGVmdFwiOiBcImdvR3JvdXBMZWZ0XCIsXG4gIFwiQWx0LVJpZ2h0XCI6IFwiZ29Hcm91cFJpZ2h0XCIsIFwiQ21kLUxlZnRcIjogXCJnb0xpbmVMZWZ0XCIsIFwiQ21kLVJpZ2h0XCI6IFwiZ29MaW5lUmlnaHRcIiwgXCJBbHQtQmFja3NwYWNlXCI6IFwiZGVsR3JvdXBCZWZvcmVcIixcbiAgXCJDdHJsLUFsdC1CYWNrc3BhY2VcIjogXCJkZWxHcm91cEFmdGVyXCIsIFwiQWx0LURlbGV0ZVwiOiBcImRlbEdyb3VwQWZ0ZXJcIiwgXCJDbWQtU1wiOiBcInNhdmVcIiwgXCJDbWQtRlwiOiBcImZpbmRcIixcbiAgXCJDbWQtR1wiOiBcImZpbmROZXh0XCIsIFwiU2hpZnQtQ21kLUdcIjogXCJmaW5kUHJldlwiLCBcIkNtZC1BbHQtRlwiOiBcInJlcGxhY2VcIiwgXCJTaGlmdC1DbWQtQWx0LUZcIjogXCJyZXBsYWNlQWxsXCIsXG4gIFwiQ21kLVtcIjogXCJpbmRlbnRMZXNzXCIsIFwiQ21kLV1cIjogXCJpbmRlbnRNb3JlXCIsIFwiQ21kLUJhY2tzcGFjZVwiOiBcImRlbFdyYXBwZWRMaW5lTGVmdFwiLCBcIkNtZC1EZWxldGVcIjogXCJkZWxXcmFwcGVkTGluZVJpZ2h0XCIsXG4gIFwiQ21kLVVcIjogXCJ1bmRvU2VsZWN0aW9uXCIsIFwiU2hpZnQtQ21kLVVcIjogXCJyZWRvU2VsZWN0aW9uXCIsIFwiQ3RybC1VcFwiOiBcImdvRG9jU3RhcnRcIiwgXCJDdHJsLURvd25cIjogXCJnb0RvY0VuZFwiLFxuICBmYWxsdGhyb3VnaDogW1wiYmFzaWNcIiwgXCJlbWFjc3lcIl1cbn07XG5rZXlNYXBbXCJkZWZhdWx0XCJdID0gbWFjID8ga2V5TWFwLm1hY0RlZmF1bHQgOiBrZXlNYXAucGNEZWZhdWx0O1xuXG4vLyBLRVlNQVAgRElTUEFUQ0hcblxuZnVuY3Rpb24gbm9ybWFsaXplS2V5TmFtZShuYW1lKSB7XG4gIHZhciBwYXJ0cyA9IG5hbWUuc3BsaXQoLy0oPyEkKS8pO1xuICBuYW1lID0gcGFydHNbcGFydHMubGVuZ3RoIC0gMV07XG4gIHZhciBhbHQsIGN0cmwsIHNoaWZ0LCBjbWQ7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgcGFydHMubGVuZ3RoIC0gMTsgaSsrKSB7XG4gICAgdmFyIG1vZCA9IHBhcnRzW2ldO1xuICAgIGlmICgvXihjbWR8bWV0YXxtKSQvaS50ZXN0KG1vZCkpIHsgY21kID0gdHJ1ZTsgfVxuICAgIGVsc2UgaWYgKC9eYShsdCk/JC9pLnRlc3QobW9kKSkgeyBhbHQgPSB0cnVlOyB9XG4gICAgZWxzZSBpZiAoL14oY3xjdHJsfGNvbnRyb2wpJC9pLnRlc3QobW9kKSkgeyBjdHJsID0gdHJ1ZTsgfVxuICAgIGVsc2UgaWYgKC9ecyhoaWZ0KT8kL2kudGVzdChtb2QpKSB7IHNoaWZ0ID0gdHJ1ZTsgfVxuICAgIGVsc2UgeyB0aHJvdyBuZXcgRXJyb3IoXCJVbnJlY29nbml6ZWQgbW9kaWZpZXIgbmFtZTogXCIgKyBtb2QpIH1cbiAgfVxuICBpZiAoYWx0KSB7IG5hbWUgPSBcIkFsdC1cIiArIG5hbWU7IH1cbiAgaWYgKGN0cmwpIHsgbmFtZSA9IFwiQ3RybC1cIiArIG5hbWU7IH1cbiAgaWYgKGNtZCkgeyBuYW1lID0gXCJDbWQtXCIgKyBuYW1lOyB9XG4gIGlmIChzaGlmdCkgeyBuYW1lID0gXCJTaGlmdC1cIiArIG5hbWU7IH1cbiAgcmV0dXJuIG5hbWVcbn1cblxuLy8gVGhpcyBpcyBhIGtsdWRnZSB0byBrZWVwIGtleW1hcHMgbW9zdGx5IHdvcmtpbmcgYXMgcmF3IG9iamVjdHNcbi8vIChiYWNrd2FyZHMgY29tcGF0aWJpbGl0eSkgd2hpbGUgYXQgdGhlIHNhbWUgdGltZSBzdXBwb3J0IGZlYXR1cmVzXG4vLyBsaWtlIG5vcm1hbGl6YXRpb24gYW5kIG11bHRpLXN0cm9rZSBrZXkgYmluZGluZ3MuIEl0IGNvbXBpbGVzIGFcbi8vIG5ldyBub3JtYWxpemVkIGtleW1hcCwgYW5kIHRoZW4gdXBkYXRlcyB0aGUgb2xkIG9iamVjdCB0byByZWZsZWN0XG4vLyB0aGlzLlxuZnVuY3Rpb24gbm9ybWFsaXplS2V5TWFwKGtleW1hcCkge1xuICB2YXIgY29weSA9IHt9O1xuICBmb3IgKHZhciBrZXluYW1lIGluIGtleW1hcCkgeyBpZiAoa2V5bWFwLmhhc093blByb3BlcnR5KGtleW5hbWUpKSB7XG4gICAgdmFyIHZhbHVlID0ga2V5bWFwW2tleW5hbWVdO1xuICAgIGlmICgvXihuYW1lfGZhbGx0aHJvdWdofChkZXxhdCl0YWNoKSQvLnRlc3Qoa2V5bmFtZSkpIHsgY29udGludWUgfVxuICAgIGlmICh2YWx1ZSA9PSBcIi4uLlwiKSB7IGRlbGV0ZSBrZXltYXBba2V5bmFtZV07IGNvbnRpbnVlIH1cblxuICAgIHZhciBrZXlzID0gbWFwKGtleW5hbWUuc3BsaXQoXCIgXCIpLCBub3JtYWxpemVLZXlOYW1lKTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGtleXMubGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciB2YWwgPSAodm9pZCAwKSwgbmFtZSA9ICh2b2lkIDApO1xuICAgICAgaWYgKGkgPT0ga2V5cy5sZW5ndGggLSAxKSB7XG4gICAgICAgIG5hbWUgPSBrZXlzLmpvaW4oXCIgXCIpO1xuICAgICAgICB2YWwgPSB2YWx1ZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG5hbWUgPSBrZXlzLnNsaWNlKDAsIGkgKyAxKS5qb2luKFwiIFwiKTtcbiAgICAgICAgdmFsID0gXCIuLi5cIjtcbiAgICAgIH1cbiAgICAgIHZhciBwcmV2ID0gY29weVtuYW1lXTtcbiAgICAgIGlmICghcHJldikgeyBjb3B5W25hbWVdID0gdmFsOyB9XG4gICAgICBlbHNlIGlmIChwcmV2ICE9IHZhbCkgeyB0aHJvdyBuZXcgRXJyb3IoXCJJbmNvbnNpc3RlbnQgYmluZGluZ3MgZm9yIFwiICsgbmFtZSkgfVxuICAgIH1cbiAgICBkZWxldGUga2V5bWFwW2tleW5hbWVdO1xuICB9IH1cbiAgZm9yICh2YXIgcHJvcCBpbiBjb3B5KSB7IGtleW1hcFtwcm9wXSA9IGNvcHlbcHJvcF07IH1cbiAgcmV0dXJuIGtleW1hcFxufVxuXG5mdW5jdGlvbiBsb29rdXBLZXkoa2V5LCBtYXAkJDEsIGhhbmRsZSwgY29udGV4dCkge1xuICBtYXAkJDEgPSBnZXRLZXlNYXAobWFwJCQxKTtcbiAgdmFyIGZvdW5kID0gbWFwJCQxLmNhbGwgPyBtYXAkJDEuY2FsbChrZXksIGNvbnRleHQpIDogbWFwJCQxW2tleV07XG4gIGlmIChmb3VuZCA9PT0gZmFsc2UpIHsgcmV0dXJuIFwibm90aGluZ1wiIH1cbiAgaWYgKGZvdW5kID09PSBcIi4uLlwiKSB7IHJldHVybiBcIm11bHRpXCIgfVxuICBpZiAoZm91bmQgIT0gbnVsbCAmJiBoYW5kbGUoZm91bmQpKSB7IHJldHVybiBcImhhbmRsZWRcIiB9XG5cbiAgaWYgKG1hcCQkMS5mYWxsdGhyb3VnaCkge1xuICAgIGlmIChPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwobWFwJCQxLmZhbGx0aHJvdWdoKSAhPSBcIltvYmplY3QgQXJyYXldXCIpXG4gICAgICB7IHJldHVybiBsb29rdXBLZXkoa2V5LCBtYXAkJDEuZmFsbHRocm91Z2gsIGhhbmRsZSwgY29udGV4dCkgfVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbWFwJCQxLmZhbGx0aHJvdWdoLmxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIgcmVzdWx0ID0gbG9va3VwS2V5KGtleSwgbWFwJCQxLmZhbGx0aHJvdWdoW2ldLCBoYW5kbGUsIGNvbnRleHQpO1xuICAgICAgaWYgKHJlc3VsdCkgeyByZXR1cm4gcmVzdWx0IH1cbiAgICB9XG4gIH1cbn1cblxuLy8gTW9kaWZpZXIga2V5IHByZXNzZXMgZG9uJ3QgY291bnQgYXMgJ3JlYWwnIGtleSBwcmVzc2VzIGZvciB0aGVcbi8vIHB1cnBvc2Ugb2Yga2V5bWFwIGZhbGx0aHJvdWdoLlxuZnVuY3Rpb24gaXNNb2RpZmllcktleSh2YWx1ZSkge1xuICB2YXIgbmFtZSA9IHR5cGVvZiB2YWx1ZSA9PSBcInN0cmluZ1wiID8gdmFsdWUgOiBrZXlOYW1lc1t2YWx1ZS5rZXlDb2RlXTtcbiAgcmV0dXJuIG5hbWUgPT0gXCJDdHJsXCIgfHwgbmFtZSA9PSBcIkFsdFwiIHx8IG5hbWUgPT0gXCJTaGlmdFwiIHx8IG5hbWUgPT0gXCJNb2RcIlxufVxuXG5mdW5jdGlvbiBhZGRNb2RpZmllck5hbWVzKG5hbWUsIGV2ZW50LCBub1NoaWZ0KSB7XG4gIHZhciBiYXNlID0gbmFtZTtcbiAgaWYgKGV2ZW50LmFsdEtleSAmJiBiYXNlICE9IFwiQWx0XCIpIHsgbmFtZSA9IFwiQWx0LVwiICsgbmFtZTsgfVxuICBpZiAoKGZsaXBDdHJsQ21kID8gZXZlbnQubWV0YUtleSA6IGV2ZW50LmN0cmxLZXkpICYmIGJhc2UgIT0gXCJDdHJsXCIpIHsgbmFtZSA9IFwiQ3RybC1cIiArIG5hbWU7IH1cbiAgaWYgKChmbGlwQ3RybENtZCA/IGV2ZW50LmN0cmxLZXkgOiBldmVudC5tZXRhS2V5KSAmJiBiYXNlICE9IFwiQ21kXCIpIHsgbmFtZSA9IFwiQ21kLVwiICsgbmFtZTsgfVxuICBpZiAoIW5vU2hpZnQgJiYgZXZlbnQuc2hpZnRLZXkgJiYgYmFzZSAhPSBcIlNoaWZ0XCIpIHsgbmFtZSA9IFwiU2hpZnQtXCIgKyBuYW1lOyB9XG4gIHJldHVybiBuYW1lXG59XG5cbi8vIExvb2sgdXAgdGhlIG5hbWUgb2YgYSBrZXkgYXMgaW5kaWNhdGVkIGJ5IGFuIGV2ZW50IG9iamVjdC5cbmZ1bmN0aW9uIGtleU5hbWUoZXZlbnQsIG5vU2hpZnQpIHtcbiAgaWYgKHByZXN0byAmJiBldmVudC5rZXlDb2RlID09IDM0ICYmIGV2ZW50W1wiY2hhclwiXSkgeyByZXR1cm4gZmFsc2UgfVxuICB2YXIgbmFtZSA9IGtleU5hbWVzW2V2ZW50LmtleUNvZGVdO1xuICBpZiAobmFtZSA9PSBudWxsIHx8IGV2ZW50LmFsdEdyYXBoS2V5KSB7IHJldHVybiBmYWxzZSB9XG4gIC8vIEN0cmwtU2Nyb2xsTG9jayBoYXMga2V5Q29kZSAzLCBzYW1lIGFzIEN0cmwtUGF1c2UsXG4gIC8vIHNvIHdlJ2xsIHVzZSBldmVudC5jb2RlIHdoZW4gYXZhaWxhYmxlIChDaHJvbWUgNDgrLCBGRiAzOCssIFNhZmFyaSAxMC4xKylcbiAgaWYgKGV2ZW50LmtleUNvZGUgPT0gMyAmJiBldmVudC5jb2RlKSB7IG5hbWUgPSBldmVudC5jb2RlOyB9XG4gIHJldHVybiBhZGRNb2RpZmllck5hbWVzKG5hbWUsIGV2ZW50LCBub1NoaWZ0KVxufVxuXG5mdW5jdGlvbiBnZXRLZXlNYXAodmFsKSB7XG4gIHJldHVybiB0eXBlb2YgdmFsID09IFwic3RyaW5nXCIgPyBrZXlNYXBbdmFsXSA6IHZhbFxufVxuXG4vLyBIZWxwZXIgZm9yIGRlbGV0aW5nIHRleHQgbmVhciB0aGUgc2VsZWN0aW9uKHMpLCB1c2VkIHRvIGltcGxlbWVudFxuLy8gYmFja3NwYWNlLCBkZWxldGUsIGFuZCBzaW1pbGFyIGZ1bmN0aW9uYWxpdHkuXG5mdW5jdGlvbiBkZWxldGVOZWFyU2VsZWN0aW9uKGNtLCBjb21wdXRlKSB7XG4gIHZhciByYW5nZXMgPSBjbS5kb2Muc2VsLnJhbmdlcywga2lsbCA9IFtdO1xuICAvLyBCdWlsZCB1cCBhIHNldCBvZiByYW5nZXMgdG8ga2lsbCBmaXJzdCwgbWVyZ2luZyBvdmVybGFwcGluZ1xuICAvLyByYW5nZXMuXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgcmFuZ2VzLmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIHRvS2lsbCA9IGNvbXB1dGUocmFuZ2VzW2ldKTtcbiAgICB3aGlsZSAoa2lsbC5sZW5ndGggJiYgY21wKHRvS2lsbC5mcm9tLCBsc3Qoa2lsbCkudG8pIDw9IDApIHtcbiAgICAgIHZhciByZXBsYWNlZCA9IGtpbGwucG9wKCk7XG4gICAgICBpZiAoY21wKHJlcGxhY2VkLmZyb20sIHRvS2lsbC5mcm9tKSA8IDApIHtcbiAgICAgICAgdG9LaWxsLmZyb20gPSByZXBsYWNlZC5mcm9tO1xuICAgICAgICBicmVha1xuICAgICAgfVxuICAgIH1cbiAgICBraWxsLnB1c2godG9LaWxsKTtcbiAgfVxuICAvLyBOZXh0LCByZW1vdmUgdGhvc2UgYWN0dWFsIHJhbmdlcy5cbiAgcnVuSW5PcChjbSwgZnVuY3Rpb24gKCkge1xuICAgIGZvciAodmFyIGkgPSBraWxsLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKVxuICAgICAgeyByZXBsYWNlUmFuZ2UoY20uZG9jLCBcIlwiLCBraWxsW2ldLmZyb20sIGtpbGxbaV0udG8sIFwiK2RlbGV0ZVwiKTsgfVxuICAgIGVuc3VyZUN1cnNvclZpc2libGUoY20pO1xuICB9KTtcbn1cblxuZnVuY3Rpb24gbW92ZUNoYXJMb2dpY2FsbHkobGluZSwgY2gsIGRpcikge1xuICB2YXIgdGFyZ2V0ID0gc2tpcEV4dGVuZGluZ0NoYXJzKGxpbmUudGV4dCwgY2ggKyBkaXIsIGRpcik7XG4gIHJldHVybiB0YXJnZXQgPCAwIHx8IHRhcmdldCA+IGxpbmUudGV4dC5sZW5ndGggPyBudWxsIDogdGFyZ2V0XG59XG5cbmZ1bmN0aW9uIG1vdmVMb2dpY2FsbHkobGluZSwgc3RhcnQsIGRpcikge1xuICB2YXIgY2ggPSBtb3ZlQ2hhckxvZ2ljYWxseShsaW5lLCBzdGFydC5jaCwgZGlyKTtcbiAgcmV0dXJuIGNoID09IG51bGwgPyBudWxsIDogbmV3IFBvcyhzdGFydC5saW5lLCBjaCwgZGlyIDwgMCA/IFwiYWZ0ZXJcIiA6IFwiYmVmb3JlXCIpXG59XG5cbmZ1bmN0aW9uIGVuZE9mTGluZSh2aXN1YWxseSwgY20sIGxpbmVPYmosIGxpbmVObywgZGlyKSB7XG4gIGlmICh2aXN1YWxseSkge1xuICAgIHZhciBvcmRlciA9IGdldE9yZGVyKGxpbmVPYmosIGNtLmRvYy5kaXJlY3Rpb24pO1xuICAgIGlmIChvcmRlcikge1xuICAgICAgdmFyIHBhcnQgPSBkaXIgPCAwID8gbHN0KG9yZGVyKSA6IG9yZGVyWzBdO1xuICAgICAgdmFyIG1vdmVJblN0b3JhZ2VPcmRlciA9IChkaXIgPCAwKSA9PSAocGFydC5sZXZlbCA9PSAxKTtcbiAgICAgIHZhciBzdGlja3kgPSBtb3ZlSW5TdG9yYWdlT3JkZXIgPyBcImFmdGVyXCIgOiBcImJlZm9yZVwiO1xuICAgICAgdmFyIGNoO1xuICAgICAgLy8gV2l0aCBhIHdyYXBwZWQgcnRsIGNodW5rIChwb3NzaWJseSBzcGFubmluZyBtdWx0aXBsZSBiaWRpIHBhcnRzKSxcbiAgICAgIC8vIGl0IGNvdWxkIGJlIHRoYXQgdGhlIGxhc3QgYmlkaSBwYXJ0IGlzIG5vdCBvbiB0aGUgbGFzdCB2aXN1YWwgbGluZSxcbiAgICAgIC8vIHNpbmNlIHZpc3VhbCBsaW5lcyBjb250YWluIGNvbnRlbnQgb3JkZXItY29uc2VjdXRpdmUgY2h1bmtzLlxuICAgICAgLy8gVGh1cywgaW4gcnRsLCB3ZSBhcmUgbG9va2luZyBmb3IgdGhlIGZpcnN0IChjb250ZW50LW9yZGVyKSBjaGFyYWN0ZXJcbiAgICAgIC8vIGluIHRoZSBydGwgY2h1bmsgdGhhdCBpcyBvbiB0aGUgbGFzdCBsaW5lICh0aGF0IGlzLCB0aGUgc2FtZSBsaW5lXG4gICAgICAvLyBhcyB0aGUgbGFzdCAoY29udGVudC1vcmRlcikgY2hhcmFjdGVyKS5cbiAgICAgIGlmIChwYXJ0LmxldmVsID4gMCB8fCBjbS5kb2MuZGlyZWN0aW9uID09IFwicnRsXCIpIHtcbiAgICAgICAgdmFyIHByZXAgPSBwcmVwYXJlTWVhc3VyZUZvckxpbmUoY20sIGxpbmVPYmopO1xuICAgICAgICBjaCA9IGRpciA8IDAgPyBsaW5lT2JqLnRleHQubGVuZ3RoIC0gMSA6IDA7XG4gICAgICAgIHZhciB0YXJnZXRUb3AgPSBtZWFzdXJlQ2hhclByZXBhcmVkKGNtLCBwcmVwLCBjaCkudG9wO1xuICAgICAgICBjaCA9IGZpbmRGaXJzdChmdW5jdGlvbiAoY2gpIHsgcmV0dXJuIG1lYXN1cmVDaGFyUHJlcGFyZWQoY20sIHByZXAsIGNoKS50b3AgPT0gdGFyZ2V0VG9wOyB9LCAoZGlyIDwgMCkgPT0gKHBhcnQubGV2ZWwgPT0gMSkgPyBwYXJ0LmZyb20gOiBwYXJ0LnRvIC0gMSwgY2gpO1xuICAgICAgICBpZiAoc3RpY2t5ID09IFwiYmVmb3JlXCIpIHsgY2ggPSBtb3ZlQ2hhckxvZ2ljYWxseShsaW5lT2JqLCBjaCwgMSk7IH1cbiAgICAgIH0gZWxzZSB7IGNoID0gZGlyIDwgMCA/IHBhcnQudG8gOiBwYXJ0LmZyb207IH1cbiAgICAgIHJldHVybiBuZXcgUG9zKGxpbmVObywgY2gsIHN0aWNreSlcbiAgICB9XG4gIH1cbiAgcmV0dXJuIG5ldyBQb3MobGluZU5vLCBkaXIgPCAwID8gbGluZU9iai50ZXh0Lmxlbmd0aCA6IDAsIGRpciA8IDAgPyBcImJlZm9yZVwiIDogXCJhZnRlclwiKVxufVxuXG5mdW5jdGlvbiBtb3ZlVmlzdWFsbHkoY20sIGxpbmUsIHN0YXJ0LCBkaXIpIHtcbiAgdmFyIGJpZGkgPSBnZXRPcmRlcihsaW5lLCBjbS5kb2MuZGlyZWN0aW9uKTtcbiAgaWYgKCFiaWRpKSB7IHJldHVybiBtb3ZlTG9naWNhbGx5KGxpbmUsIHN0YXJ0LCBkaXIpIH1cbiAgaWYgKHN0YXJ0LmNoID49IGxpbmUudGV4dC5sZW5ndGgpIHtcbiAgICBzdGFydC5jaCA9IGxpbmUudGV4dC5sZW5ndGg7XG4gICAgc3RhcnQuc3RpY2t5ID0gXCJiZWZvcmVcIjtcbiAgfSBlbHNlIGlmIChzdGFydC5jaCA8PSAwKSB7XG4gICAgc3RhcnQuY2ggPSAwO1xuICAgIHN0YXJ0LnN0aWNreSA9IFwiYWZ0ZXJcIjtcbiAgfVxuICB2YXIgcGFydFBvcyA9IGdldEJpZGlQYXJ0QXQoYmlkaSwgc3RhcnQuY2gsIHN0YXJ0LnN0aWNreSksIHBhcnQgPSBiaWRpW3BhcnRQb3NdO1xuICBpZiAoY20uZG9jLmRpcmVjdGlvbiA9PSBcImx0clwiICYmIHBhcnQubGV2ZWwgJSAyID09IDAgJiYgKGRpciA+IDAgPyBwYXJ0LnRvID4gc3RhcnQuY2ggOiBwYXJ0LmZyb20gPCBzdGFydC5jaCkpIHtcbiAgICAvLyBDYXNlIDE6IFdlIG1vdmUgd2l0aGluIGFuIGx0ciBwYXJ0IGluIGFuIGx0ciBlZGl0b3IuIEV2ZW4gd2l0aCB3cmFwcGVkIGxpbmVzLFxuICAgIC8vIG5vdGhpbmcgaW50ZXJlc3RpbmcgaGFwcGVucy5cbiAgICByZXR1cm4gbW92ZUxvZ2ljYWxseShsaW5lLCBzdGFydCwgZGlyKVxuICB9XG5cbiAgdmFyIG12ID0gZnVuY3Rpb24gKHBvcywgZGlyKSB7IHJldHVybiBtb3ZlQ2hhckxvZ2ljYWxseShsaW5lLCBwb3MgaW5zdGFuY2VvZiBQb3MgPyBwb3MuY2ggOiBwb3MsIGRpcik7IH07XG4gIHZhciBwcmVwO1xuICB2YXIgZ2V0V3JhcHBlZExpbmVFeHRlbnQgPSBmdW5jdGlvbiAoY2gpIHtcbiAgICBpZiAoIWNtLm9wdGlvbnMubGluZVdyYXBwaW5nKSB7IHJldHVybiB7YmVnaW46IDAsIGVuZDogbGluZS50ZXh0Lmxlbmd0aH0gfVxuICAgIHByZXAgPSBwcmVwIHx8IHByZXBhcmVNZWFzdXJlRm9yTGluZShjbSwgbGluZSk7XG4gICAgcmV0dXJuIHdyYXBwZWRMaW5lRXh0ZW50Q2hhcihjbSwgbGluZSwgcHJlcCwgY2gpXG4gIH07XG4gIHZhciB3cmFwcGVkTGluZUV4dGVudCA9IGdldFdyYXBwZWRMaW5lRXh0ZW50KHN0YXJ0LnN0aWNreSA9PSBcImJlZm9yZVwiID8gbXYoc3RhcnQsIC0xKSA6IHN0YXJ0LmNoKTtcblxuICBpZiAoY20uZG9jLmRpcmVjdGlvbiA9PSBcInJ0bFwiIHx8IHBhcnQubGV2ZWwgPT0gMSkge1xuICAgIHZhciBtb3ZlSW5TdG9yYWdlT3JkZXIgPSAocGFydC5sZXZlbCA9PSAxKSA9PSAoZGlyIDwgMCk7XG4gICAgdmFyIGNoID0gbXYoc3RhcnQsIG1vdmVJblN0b3JhZ2VPcmRlciA/IDEgOiAtMSk7XG4gICAgaWYgKGNoICE9IG51bGwgJiYgKCFtb3ZlSW5TdG9yYWdlT3JkZXIgPyBjaCA+PSBwYXJ0LmZyb20gJiYgY2ggPj0gd3JhcHBlZExpbmVFeHRlbnQuYmVnaW4gOiBjaCA8PSBwYXJ0LnRvICYmIGNoIDw9IHdyYXBwZWRMaW5lRXh0ZW50LmVuZCkpIHtcbiAgICAgIC8vIENhc2UgMjogV2UgbW92ZSB3aXRoaW4gYW4gcnRsIHBhcnQgb3IgaW4gYW4gcnRsIGVkaXRvciBvbiB0aGUgc2FtZSB2aXN1YWwgbGluZVxuICAgICAgdmFyIHN0aWNreSA9IG1vdmVJblN0b3JhZ2VPcmRlciA/IFwiYmVmb3JlXCIgOiBcImFmdGVyXCI7XG4gICAgICByZXR1cm4gbmV3IFBvcyhzdGFydC5saW5lLCBjaCwgc3RpY2t5KVxuICAgIH1cbiAgfVxuXG4gIC8vIENhc2UgMzogQ291bGQgbm90IG1vdmUgd2l0aGluIHRoaXMgYmlkaSBwYXJ0IGluIHRoaXMgdmlzdWFsIGxpbmUsIHNvIGxlYXZlXG4gIC8vIHRoZSBjdXJyZW50IGJpZGkgcGFydFxuXG4gIHZhciBzZWFyY2hJblZpc3VhbExpbmUgPSBmdW5jdGlvbiAocGFydFBvcywgZGlyLCB3cmFwcGVkTGluZUV4dGVudCkge1xuICAgIHZhciBnZXRSZXMgPSBmdW5jdGlvbiAoY2gsIG1vdmVJblN0b3JhZ2VPcmRlcikgeyByZXR1cm4gbW92ZUluU3RvcmFnZU9yZGVyXG4gICAgICA/IG5ldyBQb3Moc3RhcnQubGluZSwgbXYoY2gsIDEpLCBcImJlZm9yZVwiKVxuICAgICAgOiBuZXcgUG9zKHN0YXJ0LmxpbmUsIGNoLCBcImFmdGVyXCIpOyB9O1xuXG4gICAgZm9yICg7IHBhcnRQb3MgPj0gMCAmJiBwYXJ0UG9zIDwgYmlkaS5sZW5ndGg7IHBhcnRQb3MgKz0gZGlyKSB7XG4gICAgICB2YXIgcGFydCA9IGJpZGlbcGFydFBvc107XG4gICAgICB2YXIgbW92ZUluU3RvcmFnZU9yZGVyID0gKGRpciA+IDApID09IChwYXJ0LmxldmVsICE9IDEpO1xuICAgICAgdmFyIGNoID0gbW92ZUluU3RvcmFnZU9yZGVyID8gd3JhcHBlZExpbmVFeHRlbnQuYmVnaW4gOiBtdih3cmFwcGVkTGluZUV4dGVudC5lbmQsIC0xKTtcbiAgICAgIGlmIChwYXJ0LmZyb20gPD0gY2ggJiYgY2ggPCBwYXJ0LnRvKSB7IHJldHVybiBnZXRSZXMoY2gsIG1vdmVJblN0b3JhZ2VPcmRlcikgfVxuICAgICAgY2ggPSBtb3ZlSW5TdG9yYWdlT3JkZXIgPyBwYXJ0LmZyb20gOiBtdihwYXJ0LnRvLCAtMSk7XG4gICAgICBpZiAod3JhcHBlZExpbmVFeHRlbnQuYmVnaW4gPD0gY2ggJiYgY2ggPCB3cmFwcGVkTGluZUV4dGVudC5lbmQpIHsgcmV0dXJuIGdldFJlcyhjaCwgbW92ZUluU3RvcmFnZU9yZGVyKSB9XG4gICAgfVxuICB9O1xuXG4gIC8vIENhc2UgM2E6IExvb2sgZm9yIG90aGVyIGJpZGkgcGFydHMgb24gdGhlIHNhbWUgdmlzdWFsIGxpbmVcbiAgdmFyIHJlcyA9IHNlYXJjaEluVmlzdWFsTGluZShwYXJ0UG9zICsgZGlyLCBkaXIsIHdyYXBwZWRMaW5lRXh0ZW50KTtcbiAgaWYgKHJlcykgeyByZXR1cm4gcmVzIH1cblxuICAvLyBDYXNlIDNiOiBMb29rIGZvciBvdGhlciBiaWRpIHBhcnRzIG9uIHRoZSBuZXh0IHZpc3VhbCBsaW5lXG4gIHZhciBuZXh0Q2ggPSBkaXIgPiAwID8gd3JhcHBlZExpbmVFeHRlbnQuZW5kIDogbXYod3JhcHBlZExpbmVFeHRlbnQuYmVnaW4sIC0xKTtcbiAgaWYgKG5leHRDaCAhPSBudWxsICYmICEoZGlyID4gMCAmJiBuZXh0Q2ggPT0gbGluZS50ZXh0Lmxlbmd0aCkpIHtcbiAgICByZXMgPSBzZWFyY2hJblZpc3VhbExpbmUoZGlyID4gMCA/IDAgOiBiaWRpLmxlbmd0aCAtIDEsIGRpciwgZ2V0V3JhcHBlZExpbmVFeHRlbnQobmV4dENoKSk7XG4gICAgaWYgKHJlcykgeyByZXR1cm4gcmVzIH1cbiAgfVxuXG4gIC8vIENhc2UgNDogTm93aGVyZSB0byBtb3ZlXG4gIHJldHVybiBudWxsXG59XG5cbi8vIENvbW1hbmRzIGFyZSBwYXJhbWV0ZXItbGVzcyBhY3Rpb25zIHRoYXQgY2FuIGJlIHBlcmZvcm1lZCBvbiBhblxuLy8gZWRpdG9yLCBtb3N0bHkgdXNlZCBmb3Iga2V5YmluZGluZ3MuXG52YXIgY29tbWFuZHMgPSB7XG4gIHNlbGVjdEFsbDogc2VsZWN0QWxsLFxuICBzaW5nbGVTZWxlY3Rpb246IGZ1bmN0aW9uIChjbSkgeyByZXR1cm4gY20uc2V0U2VsZWN0aW9uKGNtLmdldEN1cnNvcihcImFuY2hvclwiKSwgY20uZ2V0Q3Vyc29yKFwiaGVhZFwiKSwgc2VsX2RvbnRTY3JvbGwpOyB9LFxuICBraWxsTGluZTogZnVuY3Rpb24gKGNtKSB7IHJldHVybiBkZWxldGVOZWFyU2VsZWN0aW9uKGNtLCBmdW5jdGlvbiAocmFuZ2UpIHtcbiAgICBpZiAocmFuZ2UuZW1wdHkoKSkge1xuICAgICAgdmFyIGxlbiA9IGdldExpbmUoY20uZG9jLCByYW5nZS5oZWFkLmxpbmUpLnRleHQubGVuZ3RoO1xuICAgICAgaWYgKHJhbmdlLmhlYWQuY2ggPT0gbGVuICYmIHJhbmdlLmhlYWQubGluZSA8IGNtLmxhc3RMaW5lKCkpXG4gICAgICAgIHsgcmV0dXJuIHtmcm9tOiByYW5nZS5oZWFkLCB0bzogUG9zKHJhbmdlLmhlYWQubGluZSArIDEsIDApfSB9XG4gICAgICBlbHNlXG4gICAgICAgIHsgcmV0dXJuIHtmcm9tOiByYW5nZS5oZWFkLCB0bzogUG9zKHJhbmdlLmhlYWQubGluZSwgbGVuKX0gfVxuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4ge2Zyb206IHJhbmdlLmZyb20oKSwgdG86IHJhbmdlLnRvKCl9XG4gICAgfVxuICB9KTsgfSxcbiAgZGVsZXRlTGluZTogZnVuY3Rpb24gKGNtKSB7IHJldHVybiBkZWxldGVOZWFyU2VsZWN0aW9uKGNtLCBmdW5jdGlvbiAocmFuZ2UpIHsgcmV0dXJuICh7XG4gICAgZnJvbTogUG9zKHJhbmdlLmZyb20oKS5saW5lLCAwKSxcbiAgICB0bzogY2xpcFBvcyhjbS5kb2MsIFBvcyhyYW5nZS50bygpLmxpbmUgKyAxLCAwKSlcbiAgfSk7IH0pOyB9LFxuICBkZWxMaW5lTGVmdDogZnVuY3Rpb24gKGNtKSB7IHJldHVybiBkZWxldGVOZWFyU2VsZWN0aW9uKGNtLCBmdW5jdGlvbiAocmFuZ2UpIHsgcmV0dXJuICh7XG4gICAgZnJvbTogUG9zKHJhbmdlLmZyb20oKS5saW5lLCAwKSwgdG86IHJhbmdlLmZyb20oKVxuICB9KTsgfSk7IH0sXG4gIGRlbFdyYXBwZWRMaW5lTGVmdDogZnVuY3Rpb24gKGNtKSB7IHJldHVybiBkZWxldGVOZWFyU2VsZWN0aW9uKGNtLCBmdW5jdGlvbiAocmFuZ2UpIHtcbiAgICB2YXIgdG9wID0gY20uY2hhckNvb3JkcyhyYW5nZS5oZWFkLCBcImRpdlwiKS50b3AgKyA1O1xuICAgIHZhciBsZWZ0UG9zID0gY20uY29vcmRzQ2hhcih7bGVmdDogMCwgdG9wOiB0b3B9LCBcImRpdlwiKTtcbiAgICByZXR1cm4ge2Zyb206IGxlZnRQb3MsIHRvOiByYW5nZS5mcm9tKCl9XG4gIH0pOyB9LFxuICBkZWxXcmFwcGVkTGluZVJpZ2h0OiBmdW5jdGlvbiAoY20pIHsgcmV0dXJuIGRlbGV0ZU5lYXJTZWxlY3Rpb24oY20sIGZ1bmN0aW9uIChyYW5nZSkge1xuICAgIHZhciB0b3AgPSBjbS5jaGFyQ29vcmRzKHJhbmdlLmhlYWQsIFwiZGl2XCIpLnRvcCArIDU7XG4gICAgdmFyIHJpZ2h0UG9zID0gY20uY29vcmRzQ2hhcih7bGVmdDogY20uZGlzcGxheS5saW5lRGl2Lm9mZnNldFdpZHRoICsgMTAwLCB0b3A6IHRvcH0sIFwiZGl2XCIpO1xuICAgIHJldHVybiB7ZnJvbTogcmFuZ2UuZnJvbSgpLCB0bzogcmlnaHRQb3MgfVxuICB9KTsgfSxcbiAgdW5kbzogZnVuY3Rpb24gKGNtKSB7IHJldHVybiBjbS51bmRvKCk7IH0sXG4gIHJlZG86IGZ1bmN0aW9uIChjbSkgeyByZXR1cm4gY20ucmVkbygpOyB9LFxuICB1bmRvU2VsZWN0aW9uOiBmdW5jdGlvbiAoY20pIHsgcmV0dXJuIGNtLnVuZG9TZWxlY3Rpb24oKTsgfSxcbiAgcmVkb1NlbGVjdGlvbjogZnVuY3Rpb24gKGNtKSB7IHJldHVybiBjbS5yZWRvU2VsZWN0aW9uKCk7IH0sXG4gIGdvRG9jU3RhcnQ6IGZ1bmN0aW9uIChjbSkgeyByZXR1cm4gY20uZXh0ZW5kU2VsZWN0aW9uKFBvcyhjbS5maXJzdExpbmUoKSwgMCkpOyB9LFxuICBnb0RvY0VuZDogZnVuY3Rpb24gKGNtKSB7IHJldHVybiBjbS5leHRlbmRTZWxlY3Rpb24oUG9zKGNtLmxhc3RMaW5lKCkpKTsgfSxcbiAgZ29MaW5lU3RhcnQ6IGZ1bmN0aW9uIChjbSkgeyByZXR1cm4gY20uZXh0ZW5kU2VsZWN0aW9uc0J5KGZ1bmN0aW9uIChyYW5nZSkgeyByZXR1cm4gbGluZVN0YXJ0KGNtLCByYW5nZS5oZWFkLmxpbmUpOyB9LFxuICAgIHtvcmlnaW46IFwiK21vdmVcIiwgYmlhczogMX1cbiAgKTsgfSxcbiAgZ29MaW5lU3RhcnRTbWFydDogZnVuY3Rpb24gKGNtKSB7IHJldHVybiBjbS5leHRlbmRTZWxlY3Rpb25zQnkoZnVuY3Rpb24gKHJhbmdlKSB7IHJldHVybiBsaW5lU3RhcnRTbWFydChjbSwgcmFuZ2UuaGVhZCk7IH0sXG4gICAge29yaWdpbjogXCIrbW92ZVwiLCBiaWFzOiAxfVxuICApOyB9LFxuICBnb0xpbmVFbmQ6IGZ1bmN0aW9uIChjbSkgeyByZXR1cm4gY20uZXh0ZW5kU2VsZWN0aW9uc0J5KGZ1bmN0aW9uIChyYW5nZSkgeyByZXR1cm4gbGluZUVuZChjbSwgcmFuZ2UuaGVhZC5saW5lKTsgfSxcbiAgICB7b3JpZ2luOiBcIittb3ZlXCIsIGJpYXM6IC0xfVxuICApOyB9LFxuICBnb0xpbmVSaWdodDogZnVuY3Rpb24gKGNtKSB7IHJldHVybiBjbS5leHRlbmRTZWxlY3Rpb25zQnkoZnVuY3Rpb24gKHJhbmdlKSB7XG4gICAgdmFyIHRvcCA9IGNtLmN1cnNvckNvb3JkcyhyYW5nZS5oZWFkLCBcImRpdlwiKS50b3AgKyA1O1xuICAgIHJldHVybiBjbS5jb29yZHNDaGFyKHtsZWZ0OiBjbS5kaXNwbGF5LmxpbmVEaXYub2Zmc2V0V2lkdGggKyAxMDAsIHRvcDogdG9wfSwgXCJkaXZcIilcbiAgfSwgc2VsX21vdmUpOyB9LFxuICBnb0xpbmVMZWZ0OiBmdW5jdGlvbiAoY20pIHsgcmV0dXJuIGNtLmV4dGVuZFNlbGVjdGlvbnNCeShmdW5jdGlvbiAocmFuZ2UpIHtcbiAgICB2YXIgdG9wID0gY20uY3Vyc29yQ29vcmRzKHJhbmdlLmhlYWQsIFwiZGl2XCIpLnRvcCArIDU7XG4gICAgcmV0dXJuIGNtLmNvb3Jkc0NoYXIoe2xlZnQ6IDAsIHRvcDogdG9wfSwgXCJkaXZcIilcbiAgfSwgc2VsX21vdmUpOyB9LFxuICBnb0xpbmVMZWZ0U21hcnQ6IGZ1bmN0aW9uIChjbSkgeyByZXR1cm4gY20uZXh0ZW5kU2VsZWN0aW9uc0J5KGZ1bmN0aW9uIChyYW5nZSkge1xuICAgIHZhciB0b3AgPSBjbS5jdXJzb3JDb29yZHMocmFuZ2UuaGVhZCwgXCJkaXZcIikudG9wICsgNTtcbiAgICB2YXIgcG9zID0gY20uY29vcmRzQ2hhcih7bGVmdDogMCwgdG9wOiB0b3B9LCBcImRpdlwiKTtcbiAgICBpZiAocG9zLmNoIDwgY20uZ2V0TGluZShwb3MubGluZSkuc2VhcmNoKC9cXFMvKSkgeyByZXR1cm4gbGluZVN0YXJ0U21hcnQoY20sIHJhbmdlLmhlYWQpIH1cbiAgICByZXR1cm4gcG9zXG4gIH0sIHNlbF9tb3ZlKTsgfSxcbiAgZ29MaW5lVXA6IGZ1bmN0aW9uIChjbSkgeyByZXR1cm4gY20ubW92ZVYoLTEsIFwibGluZVwiKTsgfSxcbiAgZ29MaW5lRG93bjogZnVuY3Rpb24gKGNtKSB7IHJldHVybiBjbS5tb3ZlVigxLCBcImxpbmVcIik7IH0sXG4gIGdvUGFnZVVwOiBmdW5jdGlvbiAoY20pIHsgcmV0dXJuIGNtLm1vdmVWKC0xLCBcInBhZ2VcIik7IH0sXG4gIGdvUGFnZURvd246IGZ1bmN0aW9uIChjbSkgeyByZXR1cm4gY20ubW92ZVYoMSwgXCJwYWdlXCIpOyB9LFxuICBnb0NoYXJMZWZ0OiBmdW5jdGlvbiAoY20pIHsgcmV0dXJuIGNtLm1vdmVIKC0xLCBcImNoYXJcIik7IH0sXG4gIGdvQ2hhclJpZ2h0OiBmdW5jdGlvbiAoY20pIHsgcmV0dXJuIGNtLm1vdmVIKDEsIFwiY2hhclwiKTsgfSxcbiAgZ29Db2x1bW5MZWZ0OiBmdW5jdGlvbiAoY20pIHsgcmV0dXJuIGNtLm1vdmVIKC0xLCBcImNvbHVtblwiKTsgfSxcbiAgZ29Db2x1bW5SaWdodDogZnVuY3Rpb24gKGNtKSB7IHJldHVybiBjbS5tb3ZlSCgxLCBcImNvbHVtblwiKTsgfSxcbiAgZ29Xb3JkTGVmdDogZnVuY3Rpb24gKGNtKSB7IHJldHVybiBjbS5tb3ZlSCgtMSwgXCJ3b3JkXCIpOyB9LFxuICBnb0dyb3VwUmlnaHQ6IGZ1bmN0aW9uIChjbSkgeyByZXR1cm4gY20ubW92ZUgoMSwgXCJncm91cFwiKTsgfSxcbiAgZ29Hcm91cExlZnQ6IGZ1bmN0aW9uIChjbSkgeyByZXR1cm4gY20ubW92ZUgoLTEsIFwiZ3JvdXBcIik7IH0sXG4gIGdvV29yZFJpZ2h0OiBmdW5jdGlvbiAoY20pIHsgcmV0dXJuIGNtLm1vdmVIKDEsIFwid29yZFwiKTsgfSxcbiAgZGVsQ2hhckJlZm9yZTogZnVuY3Rpb24gKGNtKSB7IHJldHVybiBjbS5kZWxldGVIKC0xLCBcImNoYXJcIik7IH0sXG4gIGRlbENoYXJBZnRlcjogZnVuY3Rpb24gKGNtKSB7IHJldHVybiBjbS5kZWxldGVIKDEsIFwiY2hhclwiKTsgfSxcbiAgZGVsV29yZEJlZm9yZTogZnVuY3Rpb24gKGNtKSB7IHJldHVybiBjbS5kZWxldGVIKC0xLCBcIndvcmRcIik7IH0sXG4gIGRlbFdvcmRBZnRlcjogZnVuY3Rpb24gKGNtKSB7IHJldHVybiBjbS5kZWxldGVIKDEsIFwid29yZFwiKTsgfSxcbiAgZGVsR3JvdXBCZWZvcmU6IGZ1bmN0aW9uIChjbSkgeyByZXR1cm4gY20uZGVsZXRlSCgtMSwgXCJncm91cFwiKTsgfSxcbiAgZGVsR3JvdXBBZnRlcjogZnVuY3Rpb24gKGNtKSB7IHJldHVybiBjbS5kZWxldGVIKDEsIFwiZ3JvdXBcIik7IH0sXG4gIGluZGVudEF1dG86IGZ1bmN0aW9uIChjbSkgeyByZXR1cm4gY20uaW5kZW50U2VsZWN0aW9uKFwic21hcnRcIik7IH0sXG4gIGluZGVudE1vcmU6IGZ1bmN0aW9uIChjbSkgeyByZXR1cm4gY20uaW5kZW50U2VsZWN0aW9uKFwiYWRkXCIpOyB9LFxuICBpbmRlbnRMZXNzOiBmdW5jdGlvbiAoY20pIHsgcmV0dXJuIGNtLmluZGVudFNlbGVjdGlvbihcInN1YnRyYWN0XCIpOyB9LFxuICBpbnNlcnRUYWI6IGZ1bmN0aW9uIChjbSkgeyByZXR1cm4gY20ucmVwbGFjZVNlbGVjdGlvbihcIlxcdFwiKTsgfSxcbiAgaW5zZXJ0U29mdFRhYjogZnVuY3Rpb24gKGNtKSB7XG4gICAgdmFyIHNwYWNlcyA9IFtdLCByYW5nZXMgPSBjbS5saXN0U2VsZWN0aW9ucygpLCB0YWJTaXplID0gY20ub3B0aW9ucy50YWJTaXplO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcmFuZ2VzLmxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIgcG9zID0gcmFuZ2VzW2ldLmZyb20oKTtcbiAgICAgIHZhciBjb2wgPSBjb3VudENvbHVtbihjbS5nZXRMaW5lKHBvcy5saW5lKSwgcG9zLmNoLCB0YWJTaXplKTtcbiAgICAgIHNwYWNlcy5wdXNoKHNwYWNlU3RyKHRhYlNpemUgLSBjb2wgJSB0YWJTaXplKSk7XG4gICAgfVxuICAgIGNtLnJlcGxhY2VTZWxlY3Rpb25zKHNwYWNlcyk7XG4gIH0sXG4gIGRlZmF1bHRUYWI6IGZ1bmN0aW9uIChjbSkge1xuICAgIGlmIChjbS5zb21ldGhpbmdTZWxlY3RlZCgpKSB7IGNtLmluZGVudFNlbGVjdGlvbihcImFkZFwiKTsgfVxuICAgIGVsc2UgeyBjbS5leGVjQ29tbWFuZChcImluc2VydFRhYlwiKTsgfVxuICB9LFxuICAvLyBTd2FwIHRoZSB0d28gY2hhcnMgbGVmdCBhbmQgcmlnaHQgb2YgZWFjaCBzZWxlY3Rpb24ncyBoZWFkLlxuICAvLyBNb3ZlIGN1cnNvciBiZWhpbmQgdGhlIHR3byBzd2FwcGVkIGNoYXJhY3RlcnMgYWZ0ZXJ3YXJkcy5cbiAgLy9cbiAgLy8gRG9lc24ndCBjb25zaWRlciBsaW5lIGZlZWRzIGEgY2hhcmFjdGVyLlxuICAvLyBEb2Vzbid0IHNjYW4gbW9yZSB0aGFuIG9uZSBsaW5lIGFib3ZlIHRvIGZpbmQgYSBjaGFyYWN0ZXIuXG4gIC8vIERvZXNuJ3QgZG8gYW55dGhpbmcgb24gYW4gZW1wdHkgbGluZS5cbiAgLy8gRG9lc24ndCBkbyBhbnl0aGluZyB3aXRoIG5vbi1lbXB0eSBzZWxlY3Rpb25zLlxuICB0cmFuc3Bvc2VDaGFyczogZnVuY3Rpb24gKGNtKSB7IHJldHVybiBydW5Jbk9wKGNtLCBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHJhbmdlcyA9IGNtLmxpc3RTZWxlY3Rpb25zKCksIG5ld1NlbCA9IFtdO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcmFuZ2VzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBpZiAoIXJhbmdlc1tpXS5lbXB0eSgpKSB7IGNvbnRpbnVlIH1cbiAgICAgIHZhciBjdXIgPSByYW5nZXNbaV0uaGVhZCwgbGluZSA9IGdldExpbmUoY20uZG9jLCBjdXIubGluZSkudGV4dDtcbiAgICAgIGlmIChsaW5lKSB7XG4gICAgICAgIGlmIChjdXIuY2ggPT0gbGluZS5sZW5ndGgpIHsgY3VyID0gbmV3IFBvcyhjdXIubGluZSwgY3VyLmNoIC0gMSk7IH1cbiAgICAgICAgaWYgKGN1ci5jaCA+IDApIHtcbiAgICAgICAgICBjdXIgPSBuZXcgUG9zKGN1ci5saW5lLCBjdXIuY2ggKyAxKTtcbiAgICAgICAgICBjbS5yZXBsYWNlUmFuZ2UobGluZS5jaGFyQXQoY3VyLmNoIC0gMSkgKyBsaW5lLmNoYXJBdChjdXIuY2ggLSAyKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgUG9zKGN1ci5saW5lLCBjdXIuY2ggLSAyKSwgY3VyLCBcIit0cmFuc3Bvc2VcIik7XG4gICAgICAgIH0gZWxzZSBpZiAoY3VyLmxpbmUgPiBjbS5kb2MuZmlyc3QpIHtcbiAgICAgICAgICB2YXIgcHJldiA9IGdldExpbmUoY20uZG9jLCBjdXIubGluZSAtIDEpLnRleHQ7XG4gICAgICAgICAgaWYgKHByZXYpIHtcbiAgICAgICAgICAgIGN1ciA9IG5ldyBQb3MoY3VyLmxpbmUsIDEpO1xuICAgICAgICAgICAgY20ucmVwbGFjZVJhbmdlKGxpbmUuY2hhckF0KDApICsgY20uZG9jLmxpbmVTZXBhcmF0b3IoKSArXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJldi5jaGFyQXQocHJldi5sZW5ndGggLSAxKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBQb3MoY3VyLmxpbmUgLSAxLCBwcmV2Lmxlbmd0aCAtIDEpLCBjdXIsIFwiK3RyYW5zcG9zZVwiKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIG5ld1NlbC5wdXNoKG5ldyBSYW5nZShjdXIsIGN1cikpO1xuICAgIH1cbiAgICBjbS5zZXRTZWxlY3Rpb25zKG5ld1NlbCk7XG4gIH0pOyB9LFxuICBuZXdsaW5lQW5kSW5kZW50OiBmdW5jdGlvbiAoY20pIHsgcmV0dXJuIHJ1bkluT3AoY20sIGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgc2VscyA9IGNtLmxpc3RTZWxlY3Rpb25zKCk7XG4gICAgZm9yICh2YXIgaSA9IHNlbHMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pXG4gICAgICB7IGNtLnJlcGxhY2VSYW5nZShjbS5kb2MubGluZVNlcGFyYXRvcigpLCBzZWxzW2ldLmFuY2hvciwgc2Vsc1tpXS5oZWFkLCBcIitpbnB1dFwiKTsgfVxuICAgIHNlbHMgPSBjbS5saXN0U2VsZWN0aW9ucygpO1xuICAgIGZvciAodmFyIGkkMSA9IDA7IGkkMSA8IHNlbHMubGVuZ3RoOyBpJDErKylcbiAgICAgIHsgY20uaW5kZW50TGluZShzZWxzW2kkMV0uZnJvbSgpLmxpbmUsIG51bGwsIHRydWUpOyB9XG4gICAgZW5zdXJlQ3Vyc29yVmlzaWJsZShjbSk7XG4gIH0pOyB9LFxuICBvcGVuTGluZTogZnVuY3Rpb24gKGNtKSB7IHJldHVybiBjbS5yZXBsYWNlU2VsZWN0aW9uKFwiXFxuXCIsIFwic3RhcnRcIik7IH0sXG4gIHRvZ2dsZU92ZXJ3cml0ZTogZnVuY3Rpb24gKGNtKSB7IHJldHVybiBjbS50b2dnbGVPdmVyd3JpdGUoKTsgfVxufTtcblxuXG5mdW5jdGlvbiBsaW5lU3RhcnQoY20sIGxpbmVOKSB7XG4gIHZhciBsaW5lID0gZ2V0TGluZShjbS5kb2MsIGxpbmVOKTtcbiAgdmFyIHZpc3VhbCA9IHZpc3VhbExpbmUobGluZSk7XG4gIGlmICh2aXN1YWwgIT0gbGluZSkgeyBsaW5lTiA9IGxpbmVObyh2aXN1YWwpOyB9XG4gIHJldHVybiBlbmRPZkxpbmUodHJ1ZSwgY20sIHZpc3VhbCwgbGluZU4sIDEpXG59XG5mdW5jdGlvbiBsaW5lRW5kKGNtLCBsaW5lTikge1xuICB2YXIgbGluZSA9IGdldExpbmUoY20uZG9jLCBsaW5lTik7XG4gIHZhciB2aXN1YWwgPSB2aXN1YWxMaW5lRW5kKGxpbmUpO1xuICBpZiAodmlzdWFsICE9IGxpbmUpIHsgbGluZU4gPSBsaW5lTm8odmlzdWFsKTsgfVxuICByZXR1cm4gZW5kT2ZMaW5lKHRydWUsIGNtLCBsaW5lLCBsaW5lTiwgLTEpXG59XG5mdW5jdGlvbiBsaW5lU3RhcnRTbWFydChjbSwgcG9zKSB7XG4gIHZhciBzdGFydCA9IGxpbmVTdGFydChjbSwgcG9zLmxpbmUpO1xuICB2YXIgbGluZSA9IGdldExpbmUoY20uZG9jLCBzdGFydC5saW5lKTtcbiAgdmFyIG9yZGVyID0gZ2V0T3JkZXIobGluZSwgY20uZG9jLmRpcmVjdGlvbik7XG4gIGlmICghb3JkZXIgfHwgb3JkZXJbMF0ubGV2ZWwgPT0gMCkge1xuICAgIHZhciBmaXJzdE5vbldTID0gTWF0aC5tYXgoMCwgbGluZS50ZXh0LnNlYXJjaCgvXFxTLykpO1xuICAgIHZhciBpbldTID0gcG9zLmxpbmUgPT0gc3RhcnQubGluZSAmJiBwb3MuY2ggPD0gZmlyc3ROb25XUyAmJiBwb3MuY2g7XG4gICAgcmV0dXJuIFBvcyhzdGFydC5saW5lLCBpbldTID8gMCA6IGZpcnN0Tm9uV1MsIHN0YXJ0LnN0aWNreSlcbiAgfVxuICByZXR1cm4gc3RhcnRcbn1cblxuLy8gUnVuIGEgaGFuZGxlciB0aGF0IHdhcyBib3VuZCB0byBhIGtleS5cbmZ1bmN0aW9uIGRvSGFuZGxlQmluZGluZyhjbSwgYm91bmQsIGRyb3BTaGlmdCkge1xuICBpZiAodHlwZW9mIGJvdW5kID09IFwic3RyaW5nXCIpIHtcbiAgICBib3VuZCA9IGNvbW1hbmRzW2JvdW5kXTtcbiAgICBpZiAoIWJvdW5kKSB7IHJldHVybiBmYWxzZSB9XG4gIH1cbiAgLy8gRW5zdXJlIHByZXZpb3VzIGlucHV0IGhhcyBiZWVuIHJlYWQsIHNvIHRoYXQgdGhlIGhhbmRsZXIgc2VlcyBhXG4gIC8vIGNvbnNpc3RlbnQgdmlldyBvZiB0aGUgZG9jdW1lbnRcbiAgY20uZGlzcGxheS5pbnB1dC5lbnN1cmVQb2xsZWQoKTtcbiAgdmFyIHByZXZTaGlmdCA9IGNtLmRpc3BsYXkuc2hpZnQsIGRvbmUgPSBmYWxzZTtcbiAgdHJ5IHtcbiAgICBpZiAoY20uaXNSZWFkT25seSgpKSB7IGNtLnN0YXRlLnN1cHByZXNzRWRpdHMgPSB0cnVlOyB9XG4gICAgaWYgKGRyb3BTaGlmdCkgeyBjbS5kaXNwbGF5LnNoaWZ0ID0gZmFsc2U7IH1cbiAgICBkb25lID0gYm91bmQoY20pICE9IFBhc3M7XG4gIH0gZmluYWxseSB7XG4gICAgY20uZGlzcGxheS5zaGlmdCA9IHByZXZTaGlmdDtcbiAgICBjbS5zdGF0ZS5zdXBwcmVzc0VkaXRzID0gZmFsc2U7XG4gIH1cbiAgcmV0dXJuIGRvbmVcbn1cblxuZnVuY3Rpb24gbG9va3VwS2V5Rm9yRWRpdG9yKGNtLCBuYW1lLCBoYW5kbGUpIHtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBjbS5zdGF0ZS5rZXlNYXBzLmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIHJlc3VsdCA9IGxvb2t1cEtleShuYW1lLCBjbS5zdGF0ZS5rZXlNYXBzW2ldLCBoYW5kbGUsIGNtKTtcbiAgICBpZiAocmVzdWx0KSB7IHJldHVybiByZXN1bHQgfVxuICB9XG4gIHJldHVybiAoY20ub3B0aW9ucy5leHRyYUtleXMgJiYgbG9va3VwS2V5KG5hbWUsIGNtLm9wdGlvbnMuZXh0cmFLZXlzLCBoYW5kbGUsIGNtKSlcbiAgICB8fCBsb29rdXBLZXkobmFtZSwgY20ub3B0aW9ucy5rZXlNYXAsIGhhbmRsZSwgY20pXG59XG5cbi8vIE5vdGUgdGhhdCwgZGVzcGl0ZSB0aGUgbmFtZSwgdGhpcyBmdW5jdGlvbiBpcyBhbHNvIHVzZWQgdG8gY2hlY2tcbi8vIGZvciBib3VuZCBtb3VzZSBjbGlja3MuXG5cbnZhciBzdG9wU2VxID0gbmV3IERlbGF5ZWQ7XG5cbmZ1bmN0aW9uIGRpc3BhdGNoS2V5KGNtLCBuYW1lLCBlLCBoYW5kbGUpIHtcbiAgdmFyIHNlcSA9IGNtLnN0YXRlLmtleVNlcTtcbiAgaWYgKHNlcSkge1xuICAgIGlmIChpc01vZGlmaWVyS2V5KG5hbWUpKSB7IHJldHVybiBcImhhbmRsZWRcIiB9XG4gICAgaWYgKC9cXCckLy50ZXN0KG5hbWUpKVxuICAgICAgeyBjbS5zdGF0ZS5rZXlTZXEgPSBudWxsOyB9XG4gICAgZWxzZVxuICAgICAgeyBzdG9wU2VxLnNldCg1MCwgZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAoY20uc3RhdGUua2V5U2VxID09IHNlcSkge1xuICAgICAgICAgIGNtLnN0YXRlLmtleVNlcSA9IG51bGw7XG4gICAgICAgICAgY20uZGlzcGxheS5pbnB1dC5yZXNldCgpO1xuICAgICAgICB9XG4gICAgICB9KTsgfVxuICAgIGlmIChkaXNwYXRjaEtleUlubmVyKGNtLCBzZXEgKyBcIiBcIiArIG5hbWUsIGUsIGhhbmRsZSkpIHsgcmV0dXJuIHRydWUgfVxuICB9XG4gIHJldHVybiBkaXNwYXRjaEtleUlubmVyKGNtLCBuYW1lLCBlLCBoYW5kbGUpXG59XG5cbmZ1bmN0aW9uIGRpc3BhdGNoS2V5SW5uZXIoY20sIG5hbWUsIGUsIGhhbmRsZSkge1xuICB2YXIgcmVzdWx0ID0gbG9va3VwS2V5Rm9yRWRpdG9yKGNtLCBuYW1lLCBoYW5kbGUpO1xuXG4gIGlmIChyZXN1bHQgPT0gXCJtdWx0aVwiKVxuICAgIHsgY20uc3RhdGUua2V5U2VxID0gbmFtZTsgfVxuICBpZiAocmVzdWx0ID09IFwiaGFuZGxlZFwiKVxuICAgIHsgc2lnbmFsTGF0ZXIoY20sIFwia2V5SGFuZGxlZFwiLCBjbSwgbmFtZSwgZSk7IH1cblxuICBpZiAocmVzdWx0ID09IFwiaGFuZGxlZFwiIHx8IHJlc3VsdCA9PSBcIm11bHRpXCIpIHtcbiAgICBlX3ByZXZlbnREZWZhdWx0KGUpO1xuICAgIHJlc3RhcnRCbGluayhjbSk7XG4gIH1cblxuICByZXR1cm4gISFyZXN1bHRcbn1cblxuLy8gSGFuZGxlIGEga2V5IGZyb20gdGhlIGtleWRvd24gZXZlbnQuXG5mdW5jdGlvbiBoYW5kbGVLZXlCaW5kaW5nKGNtLCBlKSB7XG4gIHZhciBuYW1lID0ga2V5TmFtZShlLCB0cnVlKTtcbiAgaWYgKCFuYW1lKSB7IHJldHVybiBmYWxzZSB9XG5cbiAgaWYgKGUuc2hpZnRLZXkgJiYgIWNtLnN0YXRlLmtleVNlcSkge1xuICAgIC8vIEZpcnN0IHRyeSB0byByZXNvbHZlIGZ1bGwgbmFtZSAoaW5jbHVkaW5nICdTaGlmdC0nKS4gRmFpbGluZ1xuICAgIC8vIHRoYXQsIHNlZSBpZiB0aGVyZSBpcyBhIGN1cnNvci1tb3Rpb24gY29tbWFuZCAoc3RhcnRpbmcgd2l0aFxuICAgIC8vICdnbycpIGJvdW5kIHRvIHRoZSBrZXluYW1lIHdpdGhvdXQgJ1NoaWZ0LScuXG4gICAgcmV0dXJuIGRpc3BhdGNoS2V5KGNtLCBcIlNoaWZ0LVwiICsgbmFtZSwgZSwgZnVuY3Rpb24gKGIpIHsgcmV0dXJuIGRvSGFuZGxlQmluZGluZyhjbSwgYiwgdHJ1ZSk7IH0pXG4gICAgICAgIHx8IGRpc3BhdGNoS2V5KGNtLCBuYW1lLCBlLCBmdW5jdGlvbiAoYikge1xuICAgICAgICAgICAgIGlmICh0eXBlb2YgYiA9PSBcInN0cmluZ1wiID8gL15nb1tBLVpdLy50ZXN0KGIpIDogYi5tb3Rpb24pXG4gICAgICAgICAgICAgICB7IHJldHVybiBkb0hhbmRsZUJpbmRpbmcoY20sIGIpIH1cbiAgICAgICAgICAgfSlcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gZGlzcGF0Y2hLZXkoY20sIG5hbWUsIGUsIGZ1bmN0aW9uIChiKSB7IHJldHVybiBkb0hhbmRsZUJpbmRpbmcoY20sIGIpOyB9KVxuICB9XG59XG5cbi8vIEhhbmRsZSBhIGtleSBmcm9tIHRoZSBrZXlwcmVzcyBldmVudFxuZnVuY3Rpb24gaGFuZGxlQ2hhckJpbmRpbmcoY20sIGUsIGNoKSB7XG4gIHJldHVybiBkaXNwYXRjaEtleShjbSwgXCInXCIgKyBjaCArIFwiJ1wiLCBlLCBmdW5jdGlvbiAoYikgeyByZXR1cm4gZG9IYW5kbGVCaW5kaW5nKGNtLCBiLCB0cnVlKTsgfSlcbn1cblxudmFyIGxhc3RTdG9wcGVkS2V5ID0gbnVsbDtcbmZ1bmN0aW9uIG9uS2V5RG93bihlKSB7XG4gIHZhciBjbSA9IHRoaXM7XG4gIGNtLmN1ck9wLmZvY3VzID0gYWN0aXZlRWx0KCk7XG4gIGlmIChzaWduYWxET01FdmVudChjbSwgZSkpIHsgcmV0dXJuIH1cbiAgLy8gSUUgZG9lcyBzdHJhbmdlIHRoaW5ncyB3aXRoIGVzY2FwZS5cbiAgaWYgKGllICYmIGllX3ZlcnNpb24gPCAxMSAmJiBlLmtleUNvZGUgPT0gMjcpIHsgZS5yZXR1cm5WYWx1ZSA9IGZhbHNlOyB9XG4gIHZhciBjb2RlID0gZS5rZXlDb2RlO1xuICBjbS5kaXNwbGF5LnNoaWZ0ID0gY29kZSA9PSAxNiB8fCBlLnNoaWZ0S2V5O1xuICB2YXIgaGFuZGxlZCA9IGhhbmRsZUtleUJpbmRpbmcoY20sIGUpO1xuICBpZiAocHJlc3RvKSB7XG4gICAgbGFzdFN0b3BwZWRLZXkgPSBoYW5kbGVkID8gY29kZSA6IG51bGw7XG4gICAgLy8gT3BlcmEgaGFzIG5vIGN1dCBldmVudC4uLiB3ZSB0cnkgdG8gYXQgbGVhc3QgY2F0Y2ggdGhlIGtleSBjb21ib1xuICAgIGlmICghaGFuZGxlZCAmJiBjb2RlID09IDg4ICYmICFoYXNDb3B5RXZlbnQgJiYgKG1hYyA/IGUubWV0YUtleSA6IGUuY3RybEtleSkpXG4gICAgICB7IGNtLnJlcGxhY2VTZWxlY3Rpb24oXCJcIiwgbnVsbCwgXCJjdXRcIik7IH1cbiAgfVxuXG4gIC8vIFR1cm4gbW91c2UgaW50byBjcm9zc2hhaXIgd2hlbiBBbHQgaXMgaGVsZCBvbiBNYWMuXG4gIGlmIChjb2RlID09IDE4ICYmICEvXFxiQ29kZU1pcnJvci1jcm9zc2hhaXJcXGIvLnRlc3QoY20uZGlzcGxheS5saW5lRGl2LmNsYXNzTmFtZSkpXG4gICAgeyBzaG93Q3Jvc3NIYWlyKGNtKTsgfVxufVxuXG5mdW5jdGlvbiBzaG93Q3Jvc3NIYWlyKGNtKSB7XG4gIHZhciBsaW5lRGl2ID0gY20uZGlzcGxheS5saW5lRGl2O1xuICBhZGRDbGFzcyhsaW5lRGl2LCBcIkNvZGVNaXJyb3ItY3Jvc3NoYWlyXCIpO1xuXG4gIGZ1bmN0aW9uIHVwKGUpIHtcbiAgICBpZiAoZS5rZXlDb2RlID09IDE4IHx8ICFlLmFsdEtleSkge1xuICAgICAgcm1DbGFzcyhsaW5lRGl2LCBcIkNvZGVNaXJyb3ItY3Jvc3NoYWlyXCIpO1xuICAgICAgb2ZmKGRvY3VtZW50LCBcImtleXVwXCIsIHVwKTtcbiAgICAgIG9mZihkb2N1bWVudCwgXCJtb3VzZW92ZXJcIiwgdXApO1xuICAgIH1cbiAgfVxuICBvbihkb2N1bWVudCwgXCJrZXl1cFwiLCB1cCk7XG4gIG9uKGRvY3VtZW50LCBcIm1vdXNlb3ZlclwiLCB1cCk7XG59XG5cbmZ1bmN0aW9uIG9uS2V5VXAoZSkge1xuICBpZiAoZS5rZXlDb2RlID09IDE2KSB7IHRoaXMuZG9jLnNlbC5zaGlmdCA9IGZhbHNlOyB9XG4gIHNpZ25hbERPTUV2ZW50KHRoaXMsIGUpO1xufVxuXG5mdW5jdGlvbiBvbktleVByZXNzKGUpIHtcbiAgdmFyIGNtID0gdGhpcztcbiAgaWYgKGV2ZW50SW5XaWRnZXQoY20uZGlzcGxheSwgZSkgfHwgc2lnbmFsRE9NRXZlbnQoY20sIGUpIHx8IGUuY3RybEtleSAmJiAhZS5hbHRLZXkgfHwgbWFjICYmIGUubWV0YUtleSkgeyByZXR1cm4gfVxuICB2YXIga2V5Q29kZSA9IGUua2V5Q29kZSwgY2hhckNvZGUgPSBlLmNoYXJDb2RlO1xuICBpZiAocHJlc3RvICYmIGtleUNvZGUgPT0gbGFzdFN0b3BwZWRLZXkpIHtsYXN0U3RvcHBlZEtleSA9IG51bGw7IGVfcHJldmVudERlZmF1bHQoZSk7IHJldHVybn1cbiAgaWYgKChwcmVzdG8gJiYgKCFlLndoaWNoIHx8IGUud2hpY2ggPCAxMCkpICYmIGhhbmRsZUtleUJpbmRpbmcoY20sIGUpKSB7IHJldHVybiB9XG4gIHZhciBjaCA9IFN0cmluZy5mcm9tQ2hhckNvZGUoY2hhckNvZGUgPT0gbnVsbCA/IGtleUNvZGUgOiBjaGFyQ29kZSk7XG4gIC8vIFNvbWUgYnJvd3NlcnMgZmlyZSBrZXlwcmVzcyBldmVudHMgZm9yIGJhY2tzcGFjZVxuICBpZiAoY2ggPT0gXCJcXHgwOFwiKSB7IHJldHVybiB9XG4gIGlmIChoYW5kbGVDaGFyQmluZGluZyhjbSwgZSwgY2gpKSB7IHJldHVybiB9XG4gIGNtLmRpc3BsYXkuaW5wdXQub25LZXlQcmVzcyhlKTtcbn1cblxudmFyIERPVUJMRUNMSUNLX0RFTEFZID0gNDAwO1xuXG52YXIgUGFzdENsaWNrID0gZnVuY3Rpb24odGltZSwgcG9zLCBidXR0b24pIHtcbiAgdGhpcy50aW1lID0gdGltZTtcbiAgdGhpcy5wb3MgPSBwb3M7XG4gIHRoaXMuYnV0dG9uID0gYnV0dG9uO1xufTtcblxuUGFzdENsaWNrLnByb3RvdHlwZS5jb21wYXJlID0gZnVuY3Rpb24gKHRpbWUsIHBvcywgYnV0dG9uKSB7XG4gIHJldHVybiB0aGlzLnRpbWUgKyBET1VCTEVDTElDS19ERUxBWSA+IHRpbWUgJiZcbiAgICBjbXAocG9zLCB0aGlzLnBvcykgPT0gMCAmJiBidXR0b24gPT0gdGhpcy5idXR0b25cbn07XG5cbnZhciBsYXN0Q2xpY2s7XG52YXIgbGFzdERvdWJsZUNsaWNrO1xuZnVuY3Rpb24gY2xpY2tSZXBlYXQocG9zLCBidXR0b24pIHtcbiAgdmFyIG5vdyA9ICtuZXcgRGF0ZTtcbiAgaWYgKGxhc3REb3VibGVDbGljayAmJiBsYXN0RG91YmxlQ2xpY2suY29tcGFyZShub3csIHBvcywgYnV0dG9uKSkge1xuICAgIGxhc3RDbGljayA9IGxhc3REb3VibGVDbGljayA9IG51bGw7XG4gICAgcmV0dXJuIFwidHJpcGxlXCJcbiAgfSBlbHNlIGlmIChsYXN0Q2xpY2sgJiYgbGFzdENsaWNrLmNvbXBhcmUobm93LCBwb3MsIGJ1dHRvbikpIHtcbiAgICBsYXN0RG91YmxlQ2xpY2sgPSBuZXcgUGFzdENsaWNrKG5vdywgcG9zLCBidXR0b24pO1xuICAgIGxhc3RDbGljayA9IG51bGw7XG4gICAgcmV0dXJuIFwiZG91YmxlXCJcbiAgfSBlbHNlIHtcbiAgICBsYXN0Q2xpY2sgPSBuZXcgUGFzdENsaWNrKG5vdywgcG9zLCBidXR0b24pO1xuICAgIGxhc3REb3VibGVDbGljayA9IG51bGw7XG4gICAgcmV0dXJuIFwic2luZ2xlXCJcbiAgfVxufVxuXG4vLyBBIG1vdXNlIGRvd24gY2FuIGJlIGEgc2luZ2xlIGNsaWNrLCBkb3VibGUgY2xpY2ssIHRyaXBsZSBjbGljayxcbi8vIHN0YXJ0IG9mIHNlbGVjdGlvbiBkcmFnLCBzdGFydCBvZiB0ZXh0IGRyYWcsIG5ldyBjdXJzb3Jcbi8vIChjdHJsLWNsaWNrKSwgcmVjdGFuZ2xlIGRyYWcgKGFsdC1kcmFnKSwgb3IgeHdpblxuLy8gbWlkZGxlLWNsaWNrLXBhc3RlLiBPciBpdCBtaWdodCBiZSBhIGNsaWNrIG9uIHNvbWV0aGluZyB3ZSBzaG91bGRcbi8vIG5vdCBpbnRlcmZlcmUgd2l0aCwgc3VjaCBhcyBhIHNjcm9sbGJhciBvciB3aWRnZXQuXG5mdW5jdGlvbiBvbk1vdXNlRG93bihlKSB7XG4gIHZhciBjbSA9IHRoaXMsIGRpc3BsYXkgPSBjbS5kaXNwbGF5O1xuICBpZiAoc2lnbmFsRE9NRXZlbnQoY20sIGUpIHx8IGRpc3BsYXkuYWN0aXZlVG91Y2ggJiYgZGlzcGxheS5pbnB1dC5zdXBwb3J0c1RvdWNoKCkpIHsgcmV0dXJuIH1cbiAgZGlzcGxheS5pbnB1dC5lbnN1cmVQb2xsZWQoKTtcbiAgZGlzcGxheS5zaGlmdCA9IGUuc2hpZnRLZXk7XG5cbiAgaWYgKGV2ZW50SW5XaWRnZXQoZGlzcGxheSwgZSkpIHtcbiAgICBpZiAoIXdlYmtpdCkge1xuICAgICAgLy8gQnJpZWZseSB0dXJuIG9mZiBkcmFnZ2FiaWxpdHksIHRvIGFsbG93IHdpZGdldHMgdG8gZG9cbiAgICAgIC8vIG5vcm1hbCBkcmFnZ2luZyB0aGluZ3MuXG4gICAgICBkaXNwbGF5LnNjcm9sbGVyLmRyYWdnYWJsZSA9IGZhbHNlO1xuICAgICAgc2V0VGltZW91dChmdW5jdGlvbiAoKSB7IHJldHVybiBkaXNwbGF5LnNjcm9sbGVyLmRyYWdnYWJsZSA9IHRydWU7IH0sIDEwMCk7XG4gICAgfVxuICAgIHJldHVyblxuICB9XG4gIGlmIChjbGlja0luR3V0dGVyKGNtLCBlKSkgeyByZXR1cm4gfVxuICB2YXIgcG9zID0gcG9zRnJvbU1vdXNlKGNtLCBlKSwgYnV0dG9uID0gZV9idXR0b24oZSksIHJlcGVhdCA9IHBvcyA/IGNsaWNrUmVwZWF0KHBvcywgYnV0dG9uKSA6IFwic2luZ2xlXCI7XG4gIHdpbmRvdy5mb2N1cygpO1xuXG4gIC8vICMzMjYxOiBtYWtlIHN1cmUsIHRoYXQgd2UncmUgbm90IHN0YXJ0aW5nIGEgc2Vjb25kIHNlbGVjdGlvblxuICBpZiAoYnV0dG9uID09IDEgJiYgY20uc3RhdGUuc2VsZWN0aW5nVGV4dClcbiAgICB7IGNtLnN0YXRlLnNlbGVjdGluZ1RleHQoZSk7IH1cblxuICBpZiAocG9zICYmIGhhbmRsZU1hcHBlZEJ1dHRvbihjbSwgYnV0dG9uLCBwb3MsIHJlcGVhdCwgZSkpIHsgcmV0dXJuIH1cblxuICBpZiAoYnV0dG9uID09IDEpIHtcbiAgICBpZiAocG9zKSB7IGxlZnRCdXR0b25Eb3duKGNtLCBwb3MsIHJlcGVhdCwgZSk7IH1cbiAgICBlbHNlIGlmIChlX3RhcmdldChlKSA9PSBkaXNwbGF5LnNjcm9sbGVyKSB7IGVfcHJldmVudERlZmF1bHQoZSk7IH1cbiAgfSBlbHNlIGlmIChidXR0b24gPT0gMikge1xuICAgIGlmIChwb3MpIHsgZXh0ZW5kU2VsZWN0aW9uKGNtLmRvYywgcG9zKTsgfVxuICAgIHNldFRpbWVvdXQoZnVuY3Rpb24gKCkgeyByZXR1cm4gZGlzcGxheS5pbnB1dC5mb2N1cygpOyB9LCAyMCk7XG4gIH0gZWxzZSBpZiAoYnV0dG9uID09IDMpIHtcbiAgICBpZiAoY2FwdHVyZVJpZ2h0Q2xpY2spIHsgb25Db250ZXh0TWVudShjbSwgZSk7IH1cbiAgICBlbHNlIHsgZGVsYXlCbHVyRXZlbnQoY20pOyB9XG4gIH1cbn1cblxuZnVuY3Rpb24gaGFuZGxlTWFwcGVkQnV0dG9uKGNtLCBidXR0b24sIHBvcywgcmVwZWF0LCBldmVudCkge1xuICB2YXIgbmFtZSA9IFwiQ2xpY2tcIjtcbiAgaWYgKHJlcGVhdCA9PSBcImRvdWJsZVwiKSB7IG5hbWUgPSBcIkRvdWJsZVwiICsgbmFtZTsgfVxuICBlbHNlIGlmIChyZXBlYXQgPT0gXCJ0cmlwbGVcIikgeyBuYW1lID0gXCJUcmlwbGVcIiArIG5hbWU7IH1cbiAgbmFtZSA9IChidXR0b24gPT0gMSA/IFwiTGVmdFwiIDogYnV0dG9uID09IDIgPyBcIk1pZGRsZVwiIDogXCJSaWdodFwiKSArIG5hbWU7XG5cbiAgcmV0dXJuIGRpc3BhdGNoS2V5KGNtLCAgYWRkTW9kaWZpZXJOYW1lcyhuYW1lLCBldmVudCksIGV2ZW50LCBmdW5jdGlvbiAoYm91bmQpIHtcbiAgICBpZiAodHlwZW9mIGJvdW5kID09IFwic3RyaW5nXCIpIHsgYm91bmQgPSBjb21tYW5kc1tib3VuZF07IH1cbiAgICBpZiAoIWJvdW5kKSB7IHJldHVybiBmYWxzZSB9XG4gICAgdmFyIGRvbmUgPSBmYWxzZTtcbiAgICB0cnkge1xuICAgICAgaWYgKGNtLmlzUmVhZE9ubHkoKSkgeyBjbS5zdGF0ZS5zdXBwcmVzc0VkaXRzID0gdHJ1ZTsgfVxuICAgICAgZG9uZSA9IGJvdW5kKGNtLCBwb3MpICE9IFBhc3M7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIGNtLnN0YXRlLnN1cHByZXNzRWRpdHMgPSBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIGRvbmVcbiAgfSlcbn1cblxuZnVuY3Rpb24gY29uZmlndXJlTW91c2UoY20sIHJlcGVhdCwgZXZlbnQpIHtcbiAgdmFyIG9wdGlvbiA9IGNtLmdldE9wdGlvbihcImNvbmZpZ3VyZU1vdXNlXCIpO1xuICB2YXIgdmFsdWUgPSBvcHRpb24gPyBvcHRpb24oY20sIHJlcGVhdCwgZXZlbnQpIDoge307XG4gIGlmICh2YWx1ZS51bml0ID09IG51bGwpIHtcbiAgICB2YXIgcmVjdCA9IGNocm9tZU9TID8gZXZlbnQuc2hpZnRLZXkgJiYgZXZlbnQubWV0YUtleSA6IGV2ZW50LmFsdEtleTtcbiAgICB2YWx1ZS51bml0ID0gcmVjdCA/IFwicmVjdGFuZ2xlXCIgOiByZXBlYXQgPT0gXCJzaW5nbGVcIiA/IFwiY2hhclwiIDogcmVwZWF0ID09IFwiZG91YmxlXCIgPyBcIndvcmRcIiA6IFwibGluZVwiO1xuICB9XG4gIGlmICh2YWx1ZS5leHRlbmQgPT0gbnVsbCB8fCBjbS5kb2MuZXh0ZW5kKSB7IHZhbHVlLmV4dGVuZCA9IGNtLmRvYy5leHRlbmQgfHwgZXZlbnQuc2hpZnRLZXk7IH1cbiAgaWYgKHZhbHVlLmFkZE5ldyA9PSBudWxsKSB7IHZhbHVlLmFkZE5ldyA9IG1hYyA/IGV2ZW50Lm1ldGFLZXkgOiBldmVudC5jdHJsS2V5OyB9XG4gIGlmICh2YWx1ZS5tb3ZlT25EcmFnID09IG51bGwpIHsgdmFsdWUubW92ZU9uRHJhZyA9ICEobWFjID8gZXZlbnQuYWx0S2V5IDogZXZlbnQuY3RybEtleSk7IH1cbiAgcmV0dXJuIHZhbHVlXG59XG5cbmZ1bmN0aW9uIGxlZnRCdXR0b25Eb3duKGNtLCBwb3MsIHJlcGVhdCwgZXZlbnQpIHtcbiAgaWYgKGllKSB7IHNldFRpbWVvdXQoYmluZChlbnN1cmVGb2N1cywgY20pLCAwKTsgfVxuICBlbHNlIHsgY20uY3VyT3AuZm9jdXMgPSBhY3RpdmVFbHQoKTsgfVxuXG4gIHZhciBiZWhhdmlvciA9IGNvbmZpZ3VyZU1vdXNlKGNtLCByZXBlYXQsIGV2ZW50KTtcblxuICB2YXIgc2VsID0gY20uZG9jLnNlbCwgY29udGFpbmVkO1xuICBpZiAoY20ub3B0aW9ucy5kcmFnRHJvcCAmJiBkcmFnQW5kRHJvcCAmJiAhY20uaXNSZWFkT25seSgpICYmXG4gICAgICByZXBlYXQgPT0gXCJzaW5nbGVcIiAmJiAoY29udGFpbmVkID0gc2VsLmNvbnRhaW5zKHBvcykpID4gLTEgJiZcbiAgICAgIChjbXAoKGNvbnRhaW5lZCA9IHNlbC5yYW5nZXNbY29udGFpbmVkXSkuZnJvbSgpLCBwb3MpIDwgMCB8fCBwb3MueFJlbCA+IDApICYmXG4gICAgICAoY21wKGNvbnRhaW5lZC50bygpLCBwb3MpID4gMCB8fCBwb3MueFJlbCA8IDApKVxuICAgIHsgbGVmdEJ1dHRvblN0YXJ0RHJhZyhjbSwgZXZlbnQsIHBvcywgYmVoYXZpb3IpOyB9XG4gIGVsc2VcbiAgICB7IGxlZnRCdXR0b25TZWxlY3QoY20sIGV2ZW50LCBwb3MsIGJlaGF2aW9yKTsgfVxufVxuXG4vLyBTdGFydCBhIHRleHQgZHJhZy4gV2hlbiBpdCBlbmRzLCBzZWUgaWYgYW55IGRyYWdnaW5nIGFjdHVhbGx5XG4vLyBoYXBwZW4sIGFuZCB0cmVhdCBhcyBhIGNsaWNrIGlmIGl0IGRpZG4ndC5cbmZ1bmN0aW9uIGxlZnRCdXR0b25TdGFydERyYWcoY20sIGV2ZW50LCBwb3MsIGJlaGF2aW9yKSB7XG4gIHZhciBkaXNwbGF5ID0gY20uZGlzcGxheSwgbW92ZWQgPSBmYWxzZTtcbiAgdmFyIGRyYWdFbmQgPSBvcGVyYXRpb24oY20sIGZ1bmN0aW9uIChlKSB7XG4gICAgaWYgKHdlYmtpdCkgeyBkaXNwbGF5LnNjcm9sbGVyLmRyYWdnYWJsZSA9IGZhbHNlOyB9XG4gICAgY20uc3RhdGUuZHJhZ2dpbmdUZXh0ID0gZmFsc2U7XG4gICAgb2ZmKGRpc3BsYXkud3JhcHBlci5vd25lckRvY3VtZW50LCBcIm1vdXNldXBcIiwgZHJhZ0VuZCk7XG4gICAgb2ZmKGRpc3BsYXkud3JhcHBlci5vd25lckRvY3VtZW50LCBcIm1vdXNlbW92ZVwiLCBtb3VzZU1vdmUpO1xuICAgIG9mZihkaXNwbGF5LnNjcm9sbGVyLCBcImRyYWdzdGFydFwiLCBkcmFnU3RhcnQpO1xuICAgIG9mZihkaXNwbGF5LnNjcm9sbGVyLCBcImRyb3BcIiwgZHJhZ0VuZCk7XG4gICAgaWYgKCFtb3ZlZCkge1xuICAgICAgZV9wcmV2ZW50RGVmYXVsdChlKTtcbiAgICAgIGlmICghYmVoYXZpb3IuYWRkTmV3KVxuICAgICAgICB7IGV4dGVuZFNlbGVjdGlvbihjbS5kb2MsIHBvcywgbnVsbCwgbnVsbCwgYmVoYXZpb3IuZXh0ZW5kKTsgfVxuICAgICAgLy8gV29yayBhcm91bmQgdW5leHBsYWluYWJsZSBmb2N1cyBwcm9ibGVtIGluIElFOSAoIzIxMjcpIGFuZCBDaHJvbWUgKCMzMDgxKVxuICAgICAgaWYgKHdlYmtpdCB8fCBpZSAmJiBpZV92ZXJzaW9uID09IDkpXG4gICAgICAgIHsgc2V0VGltZW91dChmdW5jdGlvbiAoKSB7ZGlzcGxheS53cmFwcGVyLm93bmVyRG9jdW1lbnQuYm9keS5mb2N1cygpOyBkaXNwbGF5LmlucHV0LmZvY3VzKCk7fSwgMjApOyB9XG4gICAgICBlbHNlXG4gICAgICAgIHsgZGlzcGxheS5pbnB1dC5mb2N1cygpOyB9XG4gICAgfVxuICB9KTtcbiAgdmFyIG1vdXNlTW92ZSA9IGZ1bmN0aW9uKGUyKSB7XG4gICAgbW92ZWQgPSBtb3ZlZCB8fCBNYXRoLmFicyhldmVudC5jbGllbnRYIC0gZTIuY2xpZW50WCkgKyBNYXRoLmFicyhldmVudC5jbGllbnRZIC0gZTIuY2xpZW50WSkgPj0gMTA7XG4gIH07XG4gIHZhciBkcmFnU3RhcnQgPSBmdW5jdGlvbiAoKSB7IHJldHVybiBtb3ZlZCA9IHRydWU7IH07XG4gIC8vIExldCB0aGUgZHJhZyBoYW5kbGVyIGhhbmRsZSB0aGlzLlxuICBpZiAod2Via2l0KSB7IGRpc3BsYXkuc2Nyb2xsZXIuZHJhZ2dhYmxlID0gdHJ1ZTsgfVxuICBjbS5zdGF0ZS5kcmFnZ2luZ1RleHQgPSBkcmFnRW5kO1xuICBkcmFnRW5kLmNvcHkgPSAhYmVoYXZpb3IubW92ZU9uRHJhZztcbiAgLy8gSUUncyBhcHByb2FjaCB0byBkcmFnZ2FibGVcbiAgaWYgKGRpc3BsYXkuc2Nyb2xsZXIuZHJhZ0Ryb3ApIHsgZGlzcGxheS5zY3JvbGxlci5kcmFnRHJvcCgpOyB9XG4gIG9uKGRpc3BsYXkud3JhcHBlci5vd25lckRvY3VtZW50LCBcIm1vdXNldXBcIiwgZHJhZ0VuZCk7XG4gIG9uKGRpc3BsYXkud3JhcHBlci5vd25lckRvY3VtZW50LCBcIm1vdXNlbW92ZVwiLCBtb3VzZU1vdmUpO1xuICBvbihkaXNwbGF5LnNjcm9sbGVyLCBcImRyYWdzdGFydFwiLCBkcmFnU3RhcnQpO1xuICBvbihkaXNwbGF5LnNjcm9sbGVyLCBcImRyb3BcIiwgZHJhZ0VuZCk7XG5cbiAgZGVsYXlCbHVyRXZlbnQoY20pO1xuICBzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHsgcmV0dXJuIGRpc3BsYXkuaW5wdXQuZm9jdXMoKTsgfSwgMjApO1xufVxuXG5mdW5jdGlvbiByYW5nZUZvclVuaXQoY20sIHBvcywgdW5pdCkge1xuICBpZiAodW5pdCA9PSBcImNoYXJcIikgeyByZXR1cm4gbmV3IFJhbmdlKHBvcywgcG9zKSB9XG4gIGlmICh1bml0ID09IFwid29yZFwiKSB7IHJldHVybiBjbS5maW5kV29yZEF0KHBvcykgfVxuICBpZiAodW5pdCA9PSBcImxpbmVcIikgeyByZXR1cm4gbmV3IFJhbmdlKFBvcyhwb3MubGluZSwgMCksIGNsaXBQb3MoY20uZG9jLCBQb3MocG9zLmxpbmUgKyAxLCAwKSkpIH1cbiAgdmFyIHJlc3VsdCA9IHVuaXQoY20sIHBvcyk7XG4gIHJldHVybiBuZXcgUmFuZ2UocmVzdWx0LmZyb20sIHJlc3VsdC50bylcbn1cblxuLy8gTm9ybWFsIHNlbGVjdGlvbiwgYXMgb3Bwb3NlZCB0byB0ZXh0IGRyYWdnaW5nLlxuZnVuY3Rpb24gbGVmdEJ1dHRvblNlbGVjdChjbSwgZXZlbnQsIHN0YXJ0LCBiZWhhdmlvcikge1xuICB2YXIgZGlzcGxheSA9IGNtLmRpc3BsYXksIGRvYyA9IGNtLmRvYztcbiAgZV9wcmV2ZW50RGVmYXVsdChldmVudCk7XG5cbiAgdmFyIG91clJhbmdlLCBvdXJJbmRleCwgc3RhcnRTZWwgPSBkb2Muc2VsLCByYW5nZXMgPSBzdGFydFNlbC5yYW5nZXM7XG4gIGlmIChiZWhhdmlvci5hZGROZXcgJiYgIWJlaGF2aW9yLmV4dGVuZCkge1xuICAgIG91ckluZGV4ID0gZG9jLnNlbC5jb250YWlucyhzdGFydCk7XG4gICAgaWYgKG91ckluZGV4ID4gLTEpXG4gICAgICB7IG91clJhbmdlID0gcmFuZ2VzW291ckluZGV4XTsgfVxuICAgIGVsc2VcbiAgICAgIHsgb3VyUmFuZ2UgPSBuZXcgUmFuZ2Uoc3RhcnQsIHN0YXJ0KTsgfVxuICB9IGVsc2Uge1xuICAgIG91clJhbmdlID0gZG9jLnNlbC5wcmltYXJ5KCk7XG4gICAgb3VySW5kZXggPSBkb2Muc2VsLnByaW1JbmRleDtcbiAgfVxuXG4gIGlmIChiZWhhdmlvci51bml0ID09IFwicmVjdGFuZ2xlXCIpIHtcbiAgICBpZiAoIWJlaGF2aW9yLmFkZE5ldykgeyBvdXJSYW5nZSA9IG5ldyBSYW5nZShzdGFydCwgc3RhcnQpOyB9XG4gICAgc3RhcnQgPSBwb3NGcm9tTW91c2UoY20sIGV2ZW50LCB0cnVlLCB0cnVlKTtcbiAgICBvdXJJbmRleCA9IC0xO1xuICB9IGVsc2Uge1xuICAgIHZhciByYW5nZSQkMSA9IHJhbmdlRm9yVW5pdChjbSwgc3RhcnQsIGJlaGF2aW9yLnVuaXQpO1xuICAgIGlmIChiZWhhdmlvci5leHRlbmQpXG4gICAgICB7IG91clJhbmdlID0gZXh0ZW5kUmFuZ2Uob3VyUmFuZ2UsIHJhbmdlJCQxLmFuY2hvciwgcmFuZ2UkJDEuaGVhZCwgYmVoYXZpb3IuZXh0ZW5kKTsgfVxuICAgIGVsc2VcbiAgICAgIHsgb3VyUmFuZ2UgPSByYW5nZSQkMTsgfVxuICB9XG5cbiAgaWYgKCFiZWhhdmlvci5hZGROZXcpIHtcbiAgICBvdXJJbmRleCA9IDA7XG4gICAgc2V0U2VsZWN0aW9uKGRvYywgbmV3IFNlbGVjdGlvbihbb3VyUmFuZ2VdLCAwKSwgc2VsX21vdXNlKTtcbiAgICBzdGFydFNlbCA9IGRvYy5zZWw7XG4gIH0gZWxzZSBpZiAob3VySW5kZXggPT0gLTEpIHtcbiAgICBvdXJJbmRleCA9IHJhbmdlcy5sZW5ndGg7XG4gICAgc2V0U2VsZWN0aW9uKGRvYywgbm9ybWFsaXplU2VsZWN0aW9uKHJhbmdlcy5jb25jYXQoW291clJhbmdlXSksIG91ckluZGV4KSxcbiAgICAgICAgICAgICAgICAge3Njcm9sbDogZmFsc2UsIG9yaWdpbjogXCIqbW91c2VcIn0pO1xuICB9IGVsc2UgaWYgKHJhbmdlcy5sZW5ndGggPiAxICYmIHJhbmdlc1tvdXJJbmRleF0uZW1wdHkoKSAmJiBiZWhhdmlvci51bml0ID09IFwiY2hhclwiICYmICFiZWhhdmlvci5leHRlbmQpIHtcbiAgICBzZXRTZWxlY3Rpb24oZG9jLCBub3JtYWxpemVTZWxlY3Rpb24ocmFuZ2VzLnNsaWNlKDAsIG91ckluZGV4KS5jb25jYXQocmFuZ2VzLnNsaWNlKG91ckluZGV4ICsgMSkpLCAwKSxcbiAgICAgICAgICAgICAgICAge3Njcm9sbDogZmFsc2UsIG9yaWdpbjogXCIqbW91c2VcIn0pO1xuICAgIHN0YXJ0U2VsID0gZG9jLnNlbDtcbiAgfSBlbHNlIHtcbiAgICByZXBsYWNlT25lU2VsZWN0aW9uKGRvYywgb3VySW5kZXgsIG91clJhbmdlLCBzZWxfbW91c2UpO1xuICB9XG5cbiAgdmFyIGxhc3RQb3MgPSBzdGFydDtcbiAgZnVuY3Rpb24gZXh0ZW5kVG8ocG9zKSB7XG4gICAgaWYgKGNtcChsYXN0UG9zLCBwb3MpID09IDApIHsgcmV0dXJuIH1cbiAgICBsYXN0UG9zID0gcG9zO1xuXG4gICAgaWYgKGJlaGF2aW9yLnVuaXQgPT0gXCJyZWN0YW5nbGVcIikge1xuICAgICAgdmFyIHJhbmdlcyA9IFtdLCB0YWJTaXplID0gY20ub3B0aW9ucy50YWJTaXplO1xuICAgICAgdmFyIHN0YXJ0Q29sID0gY291bnRDb2x1bW4oZ2V0TGluZShkb2MsIHN0YXJ0LmxpbmUpLnRleHQsIHN0YXJ0LmNoLCB0YWJTaXplKTtcbiAgICAgIHZhciBwb3NDb2wgPSBjb3VudENvbHVtbihnZXRMaW5lKGRvYywgcG9zLmxpbmUpLnRleHQsIHBvcy5jaCwgdGFiU2l6ZSk7XG4gICAgICB2YXIgbGVmdCA9IE1hdGgubWluKHN0YXJ0Q29sLCBwb3NDb2wpLCByaWdodCA9IE1hdGgubWF4KHN0YXJ0Q29sLCBwb3NDb2wpO1xuICAgICAgZm9yICh2YXIgbGluZSA9IE1hdGgubWluKHN0YXJ0LmxpbmUsIHBvcy5saW5lKSwgZW5kID0gTWF0aC5taW4oY20ubGFzdExpbmUoKSwgTWF0aC5tYXgoc3RhcnQubGluZSwgcG9zLmxpbmUpKTtcbiAgICAgICAgICAgbGluZSA8PSBlbmQ7IGxpbmUrKykge1xuICAgICAgICB2YXIgdGV4dCA9IGdldExpbmUoZG9jLCBsaW5lKS50ZXh0LCBsZWZ0UG9zID0gZmluZENvbHVtbih0ZXh0LCBsZWZ0LCB0YWJTaXplKTtcbiAgICAgICAgaWYgKGxlZnQgPT0gcmlnaHQpXG4gICAgICAgICAgeyByYW5nZXMucHVzaChuZXcgUmFuZ2UoUG9zKGxpbmUsIGxlZnRQb3MpLCBQb3MobGluZSwgbGVmdFBvcykpKTsgfVxuICAgICAgICBlbHNlIGlmICh0ZXh0Lmxlbmd0aCA+IGxlZnRQb3MpXG4gICAgICAgICAgeyByYW5nZXMucHVzaChuZXcgUmFuZ2UoUG9zKGxpbmUsIGxlZnRQb3MpLCBQb3MobGluZSwgZmluZENvbHVtbih0ZXh0LCByaWdodCwgdGFiU2l6ZSkpKSk7IH1cbiAgICAgIH1cbiAgICAgIGlmICghcmFuZ2VzLmxlbmd0aCkgeyByYW5nZXMucHVzaChuZXcgUmFuZ2Uoc3RhcnQsIHN0YXJ0KSk7IH1cbiAgICAgIHNldFNlbGVjdGlvbihkb2MsIG5vcm1hbGl6ZVNlbGVjdGlvbihzdGFydFNlbC5yYW5nZXMuc2xpY2UoMCwgb3VySW5kZXgpLmNvbmNhdChyYW5nZXMpLCBvdXJJbmRleCksXG4gICAgICAgICAgICAgICAgICAge29yaWdpbjogXCIqbW91c2VcIiwgc2Nyb2xsOiBmYWxzZX0pO1xuICAgICAgY20uc2Nyb2xsSW50b1ZpZXcocG9zKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIG9sZFJhbmdlID0gb3VyUmFuZ2U7XG4gICAgICB2YXIgcmFuZ2UkJDEgPSByYW5nZUZvclVuaXQoY20sIHBvcywgYmVoYXZpb3IudW5pdCk7XG4gICAgICB2YXIgYW5jaG9yID0gb2xkUmFuZ2UuYW5jaG9yLCBoZWFkO1xuICAgICAgaWYgKGNtcChyYW5nZSQkMS5hbmNob3IsIGFuY2hvcikgPiAwKSB7XG4gICAgICAgIGhlYWQgPSByYW5nZSQkMS5oZWFkO1xuICAgICAgICBhbmNob3IgPSBtaW5Qb3Mob2xkUmFuZ2UuZnJvbSgpLCByYW5nZSQkMS5hbmNob3IpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaGVhZCA9IHJhbmdlJCQxLmFuY2hvcjtcbiAgICAgICAgYW5jaG9yID0gbWF4UG9zKG9sZFJhbmdlLnRvKCksIHJhbmdlJCQxLmhlYWQpO1xuICAgICAgfVxuICAgICAgdmFyIHJhbmdlcyQxID0gc3RhcnRTZWwucmFuZ2VzLnNsaWNlKDApO1xuICAgICAgcmFuZ2VzJDFbb3VySW5kZXhdID0gYmlkaVNpbXBsaWZ5KGNtLCBuZXcgUmFuZ2UoY2xpcFBvcyhkb2MsIGFuY2hvciksIGhlYWQpKTtcbiAgICAgIHNldFNlbGVjdGlvbihkb2MsIG5vcm1hbGl6ZVNlbGVjdGlvbihyYW5nZXMkMSwgb3VySW5kZXgpLCBzZWxfbW91c2UpO1xuICAgIH1cbiAgfVxuXG4gIHZhciBlZGl0b3JTaXplID0gZGlzcGxheS53cmFwcGVyLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAvLyBVc2VkIHRvIGVuc3VyZSB0aW1lb3V0IHJlLXRyaWVzIGRvbid0IGZpcmUgd2hlbiBhbm90aGVyIGV4dGVuZFxuICAvLyBoYXBwZW5lZCBpbiB0aGUgbWVhbnRpbWUgKGNsZWFyVGltZW91dCBpc24ndCByZWxpYWJsZSAtLSBhdFxuICAvLyBsZWFzdCBvbiBDaHJvbWUsIHRoZSB0aW1lb3V0cyBzdGlsbCBoYXBwZW4gZXZlbiB3aGVuIGNsZWFyZWQsXG4gIC8vIGlmIHRoZSBjbGVhciBoYXBwZW5zIGFmdGVyIHRoZWlyIHNjaGVkdWxlZCBmaXJpbmcgdGltZSkuXG4gIHZhciBjb3VudGVyID0gMDtcblxuICBmdW5jdGlvbiBleHRlbmQoZSkge1xuICAgIHZhciBjdXJDb3VudCA9ICsrY291bnRlcjtcbiAgICB2YXIgY3VyID0gcG9zRnJvbU1vdXNlKGNtLCBlLCB0cnVlLCBiZWhhdmlvci51bml0ID09IFwicmVjdGFuZ2xlXCIpO1xuICAgIGlmICghY3VyKSB7IHJldHVybiB9XG4gICAgaWYgKGNtcChjdXIsIGxhc3RQb3MpICE9IDApIHtcbiAgICAgIGNtLmN1ck9wLmZvY3VzID0gYWN0aXZlRWx0KCk7XG4gICAgICBleHRlbmRUbyhjdXIpO1xuICAgICAgdmFyIHZpc2libGUgPSB2aXNpYmxlTGluZXMoZGlzcGxheSwgZG9jKTtcbiAgICAgIGlmIChjdXIubGluZSA+PSB2aXNpYmxlLnRvIHx8IGN1ci5saW5lIDwgdmlzaWJsZS5mcm9tKVxuICAgICAgICB7IHNldFRpbWVvdXQob3BlcmF0aW9uKGNtLCBmdW5jdGlvbiAoKSB7aWYgKGNvdW50ZXIgPT0gY3VyQ291bnQpIHsgZXh0ZW5kKGUpOyB9fSksIDE1MCk7IH1cbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIG91dHNpZGUgPSBlLmNsaWVudFkgPCBlZGl0b3JTaXplLnRvcCA/IC0yMCA6IGUuY2xpZW50WSA+IGVkaXRvclNpemUuYm90dG9tID8gMjAgOiAwO1xuICAgICAgaWYgKG91dHNpZGUpIHsgc2V0VGltZW91dChvcGVyYXRpb24oY20sIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKGNvdW50ZXIgIT0gY3VyQ291bnQpIHsgcmV0dXJuIH1cbiAgICAgICAgZGlzcGxheS5zY3JvbGxlci5zY3JvbGxUb3AgKz0gb3V0c2lkZTtcbiAgICAgICAgZXh0ZW5kKGUpO1xuICAgICAgfSksIDUwKTsgfVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGRvbmUoZSkge1xuICAgIGNtLnN0YXRlLnNlbGVjdGluZ1RleHQgPSBmYWxzZTtcbiAgICBjb3VudGVyID0gSW5maW5pdHk7XG4gICAgZV9wcmV2ZW50RGVmYXVsdChlKTtcbiAgICBkaXNwbGF5LmlucHV0LmZvY3VzKCk7XG4gICAgb2ZmKGRpc3BsYXkud3JhcHBlci5vd25lckRvY3VtZW50LCBcIm1vdXNlbW92ZVwiLCBtb3ZlKTtcbiAgICBvZmYoZGlzcGxheS53cmFwcGVyLm93bmVyRG9jdW1lbnQsIFwibW91c2V1cFwiLCB1cCk7XG4gICAgZG9jLmhpc3RvcnkubGFzdFNlbE9yaWdpbiA9IG51bGw7XG4gIH1cblxuICB2YXIgbW92ZSA9IG9wZXJhdGlvbihjbSwgZnVuY3Rpb24gKGUpIHtcbiAgICBpZiAoZS5idXR0b25zID09PSAwIHx8ICFlX2J1dHRvbihlKSkgeyBkb25lKGUpOyB9XG4gICAgZWxzZSB7IGV4dGVuZChlKTsgfVxuICB9KTtcbiAgdmFyIHVwID0gb3BlcmF0aW9uKGNtLCBkb25lKTtcbiAgY20uc3RhdGUuc2VsZWN0aW5nVGV4dCA9IHVwO1xuICBvbihkaXNwbGF5LndyYXBwZXIub3duZXJEb2N1bWVudCwgXCJtb3VzZW1vdmVcIiwgbW92ZSk7XG4gIG9uKGRpc3BsYXkud3JhcHBlci5vd25lckRvY3VtZW50LCBcIm1vdXNldXBcIiwgdXApO1xufVxuXG4vLyBVc2VkIHdoZW4gbW91c2Utc2VsZWN0aW5nIHRvIGFkanVzdCB0aGUgYW5jaG9yIHRvIHRoZSBwcm9wZXIgc2lkZVxuLy8gb2YgYSBiaWRpIGp1bXAgZGVwZW5kaW5nIG9uIHRoZSB2aXN1YWwgcG9zaXRpb24gb2YgdGhlIGhlYWQuXG5mdW5jdGlvbiBiaWRpU2ltcGxpZnkoY20sIHJhbmdlJCQxKSB7XG4gIHZhciBhbmNob3IgPSByYW5nZSQkMS5hbmNob3I7XG4gIHZhciBoZWFkID0gcmFuZ2UkJDEuaGVhZDtcbiAgdmFyIGFuY2hvckxpbmUgPSBnZXRMaW5lKGNtLmRvYywgYW5jaG9yLmxpbmUpO1xuICBpZiAoY21wKGFuY2hvciwgaGVhZCkgPT0gMCAmJiBhbmNob3Iuc3RpY2t5ID09IGhlYWQuc3RpY2t5KSB7IHJldHVybiByYW5nZSQkMSB9XG4gIHZhciBvcmRlciA9IGdldE9yZGVyKGFuY2hvckxpbmUpO1xuICBpZiAoIW9yZGVyKSB7IHJldHVybiByYW5nZSQkMSB9XG4gIHZhciBpbmRleCA9IGdldEJpZGlQYXJ0QXQob3JkZXIsIGFuY2hvci5jaCwgYW5jaG9yLnN0aWNreSksIHBhcnQgPSBvcmRlcltpbmRleF07XG4gIGlmIChwYXJ0LmZyb20gIT0gYW5jaG9yLmNoICYmIHBhcnQudG8gIT0gYW5jaG9yLmNoKSB7IHJldHVybiByYW5nZSQkMSB9XG4gIHZhciBib3VuZGFyeSA9IGluZGV4ICsgKChwYXJ0LmZyb20gPT0gYW5jaG9yLmNoKSA9PSAocGFydC5sZXZlbCAhPSAxKSA/IDAgOiAxKTtcbiAgaWYgKGJvdW5kYXJ5ID09IDAgfHwgYm91bmRhcnkgPT0gb3JkZXIubGVuZ3RoKSB7IHJldHVybiByYW5nZSQkMSB9XG5cbiAgLy8gQ29tcHV0ZSB0aGUgcmVsYXRpdmUgdmlzdWFsIHBvc2l0aW9uIG9mIHRoZSBoZWFkIGNvbXBhcmVkIHRvIHRoZVxuICAvLyBhbmNob3IgKDwwIGlzIHRvIHRoZSBsZWZ0LCA+MCB0byB0aGUgcmlnaHQpXG4gIHZhciBsZWZ0U2lkZTtcbiAgaWYgKGhlYWQubGluZSAhPSBhbmNob3IubGluZSkge1xuICAgIGxlZnRTaWRlID0gKGhlYWQubGluZSAtIGFuY2hvci5saW5lKSAqIChjbS5kb2MuZGlyZWN0aW9uID09IFwibHRyXCIgPyAxIDogLTEpID4gMDtcbiAgfSBlbHNlIHtcbiAgICB2YXIgaGVhZEluZGV4ID0gZ2V0QmlkaVBhcnRBdChvcmRlciwgaGVhZC5jaCwgaGVhZC5zdGlja3kpO1xuICAgIHZhciBkaXIgPSBoZWFkSW5kZXggLSBpbmRleCB8fCAoaGVhZC5jaCAtIGFuY2hvci5jaCkgKiAocGFydC5sZXZlbCA9PSAxID8gLTEgOiAxKTtcbiAgICBpZiAoaGVhZEluZGV4ID09IGJvdW5kYXJ5IC0gMSB8fCBoZWFkSW5kZXggPT0gYm91bmRhcnkpXG4gICAgICB7IGxlZnRTaWRlID0gZGlyIDwgMDsgfVxuICAgIGVsc2VcbiAgICAgIHsgbGVmdFNpZGUgPSBkaXIgPiAwOyB9XG4gIH1cblxuICB2YXIgdXNlUGFydCA9IG9yZGVyW2JvdW5kYXJ5ICsgKGxlZnRTaWRlID8gLTEgOiAwKV07XG4gIHZhciBmcm9tID0gbGVmdFNpZGUgPT0gKHVzZVBhcnQubGV2ZWwgPT0gMSk7XG4gIHZhciBjaCA9IGZyb20gPyB1c2VQYXJ0LmZyb20gOiB1c2VQYXJ0LnRvLCBzdGlja3kgPSBmcm9tID8gXCJhZnRlclwiIDogXCJiZWZvcmVcIjtcbiAgcmV0dXJuIGFuY2hvci5jaCA9PSBjaCAmJiBhbmNob3Iuc3RpY2t5ID09IHN0aWNreSA/IHJhbmdlJCQxIDogbmV3IFJhbmdlKG5ldyBQb3MoYW5jaG9yLmxpbmUsIGNoLCBzdGlja3kpLCBoZWFkKVxufVxuXG5cbi8vIERldGVybWluZXMgd2hldGhlciBhbiBldmVudCBoYXBwZW5lZCBpbiB0aGUgZ3V0dGVyLCBhbmQgZmlyZXMgdGhlXG4vLyBoYW5kbGVycyBmb3IgdGhlIGNvcnJlc3BvbmRpbmcgZXZlbnQuXG5mdW5jdGlvbiBndXR0ZXJFdmVudChjbSwgZSwgdHlwZSwgcHJldmVudCkge1xuICB2YXIgbVgsIG1ZO1xuICBpZiAoZS50b3VjaGVzKSB7XG4gICAgbVggPSBlLnRvdWNoZXNbMF0uY2xpZW50WDtcbiAgICBtWSA9IGUudG91Y2hlc1swXS5jbGllbnRZO1xuICB9IGVsc2Uge1xuICAgIHRyeSB7IG1YID0gZS5jbGllbnRYOyBtWSA9IGUuY2xpZW50WTsgfVxuICAgIGNhdGNoKGUpIHsgcmV0dXJuIGZhbHNlIH1cbiAgfVxuICBpZiAobVggPj0gTWF0aC5mbG9vcihjbS5kaXNwbGF5Lmd1dHRlcnMuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCkucmlnaHQpKSB7IHJldHVybiBmYWxzZSB9XG4gIGlmIChwcmV2ZW50KSB7IGVfcHJldmVudERlZmF1bHQoZSk7IH1cblxuICB2YXIgZGlzcGxheSA9IGNtLmRpc3BsYXk7XG4gIHZhciBsaW5lQm94ID0gZGlzcGxheS5saW5lRGl2LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXG4gIGlmIChtWSA+IGxpbmVCb3guYm90dG9tIHx8ICFoYXNIYW5kbGVyKGNtLCB0eXBlKSkgeyByZXR1cm4gZV9kZWZhdWx0UHJldmVudGVkKGUpIH1cbiAgbVkgLT0gbGluZUJveC50b3AgLSBkaXNwbGF5LnZpZXdPZmZzZXQ7XG5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBjbS5vcHRpb25zLmd1dHRlcnMubGVuZ3RoOyArK2kpIHtcbiAgICB2YXIgZyA9IGRpc3BsYXkuZ3V0dGVycy5jaGlsZE5vZGVzW2ldO1xuICAgIGlmIChnICYmIGcuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCkucmlnaHQgPj0gbVgpIHtcbiAgICAgIHZhciBsaW5lID0gbGluZUF0SGVpZ2h0KGNtLmRvYywgbVkpO1xuICAgICAgdmFyIGd1dHRlciA9IGNtLm9wdGlvbnMuZ3V0dGVyc1tpXTtcbiAgICAgIHNpZ25hbChjbSwgdHlwZSwgY20sIGxpbmUsIGd1dHRlciwgZSk7XG4gICAgICByZXR1cm4gZV9kZWZhdWx0UHJldmVudGVkKGUpXG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGNsaWNrSW5HdXR0ZXIoY20sIGUpIHtcbiAgcmV0dXJuIGd1dHRlckV2ZW50KGNtLCBlLCBcImd1dHRlckNsaWNrXCIsIHRydWUpXG59XG5cbi8vIENPTlRFWFQgTUVOVSBIQU5ETElOR1xuXG4vLyBUbyBtYWtlIHRoZSBjb250ZXh0IG1lbnUgd29yaywgd2UgbmVlZCB0byBicmllZmx5IHVuaGlkZSB0aGVcbi8vIHRleHRhcmVhIChtYWtpbmcgaXQgYXMgdW5vYnRydXNpdmUgYXMgcG9zc2libGUpIHRvIGxldCB0aGVcbi8vIHJpZ2h0LWNsaWNrIHRha2UgZWZmZWN0IG9uIGl0LlxuZnVuY3Rpb24gb25Db250ZXh0TWVudShjbSwgZSkge1xuICBpZiAoZXZlbnRJbldpZGdldChjbS5kaXNwbGF5LCBlKSB8fCBjb250ZXh0TWVudUluR3V0dGVyKGNtLCBlKSkgeyByZXR1cm4gfVxuICBpZiAoc2lnbmFsRE9NRXZlbnQoY20sIGUsIFwiY29udGV4dG1lbnVcIikpIHsgcmV0dXJuIH1cbiAgY20uZGlzcGxheS5pbnB1dC5vbkNvbnRleHRNZW51KGUpO1xufVxuXG5mdW5jdGlvbiBjb250ZXh0TWVudUluR3V0dGVyKGNtLCBlKSB7XG4gIGlmICghaGFzSGFuZGxlcihjbSwgXCJndXR0ZXJDb250ZXh0TWVudVwiKSkgeyByZXR1cm4gZmFsc2UgfVxuICByZXR1cm4gZ3V0dGVyRXZlbnQoY20sIGUsIFwiZ3V0dGVyQ29udGV4dE1lbnVcIiwgZmFsc2UpXG59XG5cbmZ1bmN0aW9uIHRoZW1lQ2hhbmdlZChjbSkge1xuICBjbS5kaXNwbGF5LndyYXBwZXIuY2xhc3NOYW1lID0gY20uZGlzcGxheS53cmFwcGVyLmNsYXNzTmFtZS5yZXBsYWNlKC9cXHMqY20tcy1cXFMrL2csIFwiXCIpICtcbiAgICBjbS5vcHRpb25zLnRoZW1lLnJlcGxhY2UoLyhefFxccylcXHMqL2csIFwiIGNtLXMtXCIpO1xuICBjbGVhckNhY2hlcyhjbSk7XG59XG5cbnZhciBJbml0ID0ge3RvU3RyaW5nOiBmdW5jdGlvbigpe3JldHVybiBcIkNvZGVNaXJyb3IuSW5pdFwifX07XG5cbnZhciBkZWZhdWx0cyA9IHt9O1xudmFyIG9wdGlvbkhhbmRsZXJzID0ge307XG5cbmZ1bmN0aW9uIGRlZmluZU9wdGlvbnMoQ29kZU1pcnJvcikge1xuICB2YXIgb3B0aW9uSGFuZGxlcnMgPSBDb2RlTWlycm9yLm9wdGlvbkhhbmRsZXJzO1xuXG4gIGZ1bmN0aW9uIG9wdGlvbihuYW1lLCBkZWZsdCwgaGFuZGxlLCBub3RPbkluaXQpIHtcbiAgICBDb2RlTWlycm9yLmRlZmF1bHRzW25hbWVdID0gZGVmbHQ7XG4gICAgaWYgKGhhbmRsZSkgeyBvcHRpb25IYW5kbGVyc1tuYW1lXSA9XG4gICAgICBub3RPbkluaXQgPyBmdW5jdGlvbiAoY20sIHZhbCwgb2xkKSB7aWYgKG9sZCAhPSBJbml0KSB7IGhhbmRsZShjbSwgdmFsLCBvbGQpOyB9fSA6IGhhbmRsZTsgfVxuICB9XG5cbiAgQ29kZU1pcnJvci5kZWZpbmVPcHRpb24gPSBvcHRpb247XG5cbiAgLy8gUGFzc2VkIHRvIG9wdGlvbiBoYW5kbGVycyB3aGVuIHRoZXJlIGlzIG5vIG9sZCB2YWx1ZS5cbiAgQ29kZU1pcnJvci5Jbml0ID0gSW5pdDtcblxuICAvLyBUaGVzZSB0d28gYXJlLCBvbiBpbml0LCBjYWxsZWQgZnJvbSB0aGUgY29uc3RydWN0b3IgYmVjYXVzZSB0aGV5XG4gIC8vIGhhdmUgdG8gYmUgaW5pdGlhbGl6ZWQgYmVmb3JlIHRoZSBlZGl0b3IgY2FuIHN0YXJ0IGF0IGFsbC5cbiAgb3B0aW9uKFwidmFsdWVcIiwgXCJcIiwgZnVuY3Rpb24gKGNtLCB2YWwpIHsgcmV0dXJuIGNtLnNldFZhbHVlKHZhbCk7IH0sIHRydWUpO1xuICBvcHRpb24oXCJtb2RlXCIsIG51bGwsIGZ1bmN0aW9uIChjbSwgdmFsKSB7XG4gICAgY20uZG9jLm1vZGVPcHRpb24gPSB2YWw7XG4gICAgbG9hZE1vZGUoY20pO1xuICB9LCB0cnVlKTtcblxuICBvcHRpb24oXCJpbmRlbnRVbml0XCIsIDIsIGxvYWRNb2RlLCB0cnVlKTtcbiAgb3B0aW9uKFwiaW5kZW50V2l0aFRhYnNcIiwgZmFsc2UpO1xuICBvcHRpb24oXCJzbWFydEluZGVudFwiLCB0cnVlKTtcbiAgb3B0aW9uKFwidGFiU2l6ZVwiLCA0LCBmdW5jdGlvbiAoY20pIHtcbiAgICByZXNldE1vZGVTdGF0ZShjbSk7XG4gICAgY2xlYXJDYWNoZXMoY20pO1xuICAgIHJlZ0NoYW5nZShjbSk7XG4gIH0sIHRydWUpO1xuXG4gIG9wdGlvbihcImxpbmVTZXBhcmF0b3JcIiwgbnVsbCwgZnVuY3Rpb24gKGNtLCB2YWwpIHtcbiAgICBjbS5kb2MubGluZVNlcCA9IHZhbDtcbiAgICBpZiAoIXZhbCkgeyByZXR1cm4gfVxuICAgIHZhciBuZXdCcmVha3MgPSBbXSwgbGluZU5vID0gY20uZG9jLmZpcnN0O1xuICAgIGNtLmRvYy5pdGVyKGZ1bmN0aW9uIChsaW5lKSB7XG4gICAgICBmb3IgKHZhciBwb3MgPSAwOzspIHtcbiAgICAgICAgdmFyIGZvdW5kID0gbGluZS50ZXh0LmluZGV4T2YodmFsLCBwb3MpO1xuICAgICAgICBpZiAoZm91bmQgPT0gLTEpIHsgYnJlYWsgfVxuICAgICAgICBwb3MgPSBmb3VuZCArIHZhbC5sZW5ndGg7XG4gICAgICAgIG5ld0JyZWFrcy5wdXNoKFBvcyhsaW5lTm8sIGZvdW5kKSk7XG4gICAgICB9XG4gICAgICBsaW5lTm8rKztcbiAgICB9KTtcbiAgICBmb3IgKHZhciBpID0gbmV3QnJlYWtzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKVxuICAgICAgeyByZXBsYWNlUmFuZ2UoY20uZG9jLCB2YWwsIG5ld0JyZWFrc1tpXSwgUG9zKG5ld0JyZWFrc1tpXS5saW5lLCBuZXdCcmVha3NbaV0uY2ggKyB2YWwubGVuZ3RoKSk7IH1cbiAgfSk7XG4gIG9wdGlvbihcInNwZWNpYWxDaGFyc1wiLCAvW1xcdTAwMDAtXFx1MDAxZlxcdTAwN2YtXFx1MDA5ZlxcdTAwYWRcXHUwNjFjXFx1MjAwYi1cXHUyMDBmXFx1MjAyOFxcdTIwMjlcXHVmZWZmXS9nLCBmdW5jdGlvbiAoY20sIHZhbCwgb2xkKSB7XG4gICAgY20uc3RhdGUuc3BlY2lhbENoYXJzID0gbmV3IFJlZ0V4cCh2YWwuc291cmNlICsgKHZhbC50ZXN0KFwiXFx0XCIpID8gXCJcIiA6IFwifFxcdFwiKSwgXCJnXCIpO1xuICAgIGlmIChvbGQgIT0gSW5pdCkgeyBjbS5yZWZyZXNoKCk7IH1cbiAgfSk7XG4gIG9wdGlvbihcInNwZWNpYWxDaGFyUGxhY2Vob2xkZXJcIiwgZGVmYXVsdFNwZWNpYWxDaGFyUGxhY2Vob2xkZXIsIGZ1bmN0aW9uIChjbSkgeyByZXR1cm4gY20ucmVmcmVzaCgpOyB9LCB0cnVlKTtcbiAgb3B0aW9uKFwiZWxlY3RyaWNDaGFyc1wiLCB0cnVlKTtcbiAgb3B0aW9uKFwiaW5wdXRTdHlsZVwiLCBtb2JpbGUgPyBcImNvbnRlbnRlZGl0YWJsZVwiIDogXCJ0ZXh0YXJlYVwiLCBmdW5jdGlvbiAoKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiaW5wdXRTdHlsZSBjYW4gbm90ICh5ZXQpIGJlIGNoYW5nZWQgaW4gYSBydW5uaW5nIGVkaXRvclwiKSAvLyBGSVhNRVxuICB9LCB0cnVlKTtcbiAgb3B0aW9uKFwic3BlbGxjaGVja1wiLCBmYWxzZSwgZnVuY3Rpb24gKGNtLCB2YWwpIHsgcmV0dXJuIGNtLmdldElucHV0RmllbGQoKS5zcGVsbGNoZWNrID0gdmFsOyB9LCB0cnVlKTtcbiAgb3B0aW9uKFwicnRsTW92ZVZpc3VhbGx5XCIsICF3aW5kb3dzKTtcbiAgb3B0aW9uKFwid2hvbGVMaW5lVXBkYXRlQmVmb3JlXCIsIHRydWUpO1xuXG4gIG9wdGlvbihcInRoZW1lXCIsIFwiZGVmYXVsdFwiLCBmdW5jdGlvbiAoY20pIHtcbiAgICB0aGVtZUNoYW5nZWQoY20pO1xuICAgIGd1dHRlcnNDaGFuZ2VkKGNtKTtcbiAgfSwgdHJ1ZSk7XG4gIG9wdGlvbihcImtleU1hcFwiLCBcImRlZmF1bHRcIiwgZnVuY3Rpb24gKGNtLCB2YWwsIG9sZCkge1xuICAgIHZhciBuZXh0ID0gZ2V0S2V5TWFwKHZhbCk7XG4gICAgdmFyIHByZXYgPSBvbGQgIT0gSW5pdCAmJiBnZXRLZXlNYXAob2xkKTtcbiAgICBpZiAocHJldiAmJiBwcmV2LmRldGFjaCkgeyBwcmV2LmRldGFjaChjbSwgbmV4dCk7IH1cbiAgICBpZiAobmV4dC5hdHRhY2gpIHsgbmV4dC5hdHRhY2goY20sIHByZXYgfHwgbnVsbCk7IH1cbiAgfSk7XG4gIG9wdGlvbihcImV4dHJhS2V5c1wiLCBudWxsKTtcbiAgb3B0aW9uKFwiY29uZmlndXJlTW91c2VcIiwgbnVsbCk7XG5cbiAgb3B0aW9uKFwibGluZVdyYXBwaW5nXCIsIGZhbHNlLCB3cmFwcGluZ0NoYW5nZWQsIHRydWUpO1xuICBvcHRpb24oXCJndXR0ZXJzXCIsIFtdLCBmdW5jdGlvbiAoY20pIHtcbiAgICBzZXRHdXR0ZXJzRm9yTGluZU51bWJlcnMoY20ub3B0aW9ucyk7XG4gICAgZ3V0dGVyc0NoYW5nZWQoY20pO1xuICB9LCB0cnVlKTtcbiAgb3B0aW9uKFwiZml4ZWRHdXR0ZXJcIiwgdHJ1ZSwgZnVuY3Rpb24gKGNtLCB2YWwpIHtcbiAgICBjbS5kaXNwbGF5Lmd1dHRlcnMuc3R5bGUubGVmdCA9IHZhbCA/IGNvbXBlbnNhdGVGb3JIU2Nyb2xsKGNtLmRpc3BsYXkpICsgXCJweFwiIDogXCIwXCI7XG4gICAgY20ucmVmcmVzaCgpO1xuICB9LCB0cnVlKTtcbiAgb3B0aW9uKFwiY292ZXJHdXR0ZXJOZXh0VG9TY3JvbGxiYXJcIiwgZmFsc2UsIGZ1bmN0aW9uIChjbSkgeyByZXR1cm4gdXBkYXRlU2Nyb2xsYmFycyhjbSk7IH0sIHRydWUpO1xuICBvcHRpb24oXCJzY3JvbGxiYXJTdHlsZVwiLCBcIm5hdGl2ZVwiLCBmdW5jdGlvbiAoY20pIHtcbiAgICBpbml0U2Nyb2xsYmFycyhjbSk7XG4gICAgdXBkYXRlU2Nyb2xsYmFycyhjbSk7XG4gICAgY20uZGlzcGxheS5zY3JvbGxiYXJzLnNldFNjcm9sbFRvcChjbS5kb2Muc2Nyb2xsVG9wKTtcbiAgICBjbS5kaXNwbGF5LnNjcm9sbGJhcnMuc2V0U2Nyb2xsTGVmdChjbS5kb2Muc2Nyb2xsTGVmdCk7XG4gIH0sIHRydWUpO1xuICBvcHRpb24oXCJsaW5lTnVtYmVyc1wiLCBmYWxzZSwgZnVuY3Rpb24gKGNtKSB7XG4gICAgc2V0R3V0dGVyc0ZvckxpbmVOdW1iZXJzKGNtLm9wdGlvbnMpO1xuICAgIGd1dHRlcnNDaGFuZ2VkKGNtKTtcbiAgfSwgdHJ1ZSk7XG4gIG9wdGlvbihcImZpcnN0TGluZU51bWJlclwiLCAxLCBndXR0ZXJzQ2hhbmdlZCwgdHJ1ZSk7XG4gIG9wdGlvbihcImxpbmVOdW1iZXJGb3JtYXR0ZXJcIiwgZnVuY3Rpb24gKGludGVnZXIpIHsgcmV0dXJuIGludGVnZXI7IH0sIGd1dHRlcnNDaGFuZ2VkLCB0cnVlKTtcbiAgb3B0aW9uKFwic2hvd0N1cnNvcldoZW5TZWxlY3RpbmdcIiwgZmFsc2UsIHVwZGF0ZVNlbGVjdGlvbiwgdHJ1ZSk7XG5cbiAgb3B0aW9uKFwicmVzZXRTZWxlY3Rpb25PbkNvbnRleHRNZW51XCIsIHRydWUpO1xuICBvcHRpb24oXCJsaW5lV2lzZUNvcHlDdXRcIiwgdHJ1ZSk7XG4gIG9wdGlvbihcInBhc3RlTGluZXNQZXJTZWxlY3Rpb25cIiwgdHJ1ZSk7XG5cbiAgb3B0aW9uKFwicmVhZE9ubHlcIiwgZmFsc2UsIGZ1bmN0aW9uIChjbSwgdmFsKSB7XG4gICAgaWYgKHZhbCA9PSBcIm5vY3Vyc29yXCIpIHtcbiAgICAgIG9uQmx1cihjbSk7XG4gICAgICBjbS5kaXNwbGF5LmlucHV0LmJsdXIoKTtcbiAgICB9XG4gICAgY20uZGlzcGxheS5pbnB1dC5yZWFkT25seUNoYW5nZWQodmFsKTtcbiAgfSk7XG4gIG9wdGlvbihcImRpc2FibGVJbnB1dFwiLCBmYWxzZSwgZnVuY3Rpb24gKGNtLCB2YWwpIHtpZiAoIXZhbCkgeyBjbS5kaXNwbGF5LmlucHV0LnJlc2V0KCk7IH19LCB0cnVlKTtcbiAgb3B0aW9uKFwiZHJhZ0Ryb3BcIiwgdHJ1ZSwgZHJhZ0Ryb3BDaGFuZ2VkKTtcbiAgb3B0aW9uKFwiYWxsb3dEcm9wRmlsZVR5cGVzXCIsIG51bGwpO1xuXG4gIG9wdGlvbihcImN1cnNvckJsaW5rUmF0ZVwiLCA1MzApO1xuICBvcHRpb24oXCJjdXJzb3JTY3JvbGxNYXJnaW5cIiwgMCk7XG4gIG9wdGlvbihcImN1cnNvckhlaWdodFwiLCAxLCB1cGRhdGVTZWxlY3Rpb24sIHRydWUpO1xuICBvcHRpb24oXCJzaW5nbGVDdXJzb3JIZWlnaHRQZXJMaW5lXCIsIHRydWUsIHVwZGF0ZVNlbGVjdGlvbiwgdHJ1ZSk7XG4gIG9wdGlvbihcIndvcmtUaW1lXCIsIDEwMCk7XG4gIG9wdGlvbihcIndvcmtEZWxheVwiLCAxMDApO1xuICBvcHRpb24oXCJmbGF0dGVuU3BhbnNcIiwgdHJ1ZSwgcmVzZXRNb2RlU3RhdGUsIHRydWUpO1xuICBvcHRpb24oXCJhZGRNb2RlQ2xhc3NcIiwgZmFsc2UsIHJlc2V0TW9kZVN0YXRlLCB0cnVlKTtcbiAgb3B0aW9uKFwicG9sbEludGVydmFsXCIsIDEwMCk7XG4gIG9wdGlvbihcInVuZG9EZXB0aFwiLCAyMDAsIGZ1bmN0aW9uIChjbSwgdmFsKSB7IHJldHVybiBjbS5kb2MuaGlzdG9yeS51bmRvRGVwdGggPSB2YWw7IH0pO1xuICBvcHRpb24oXCJoaXN0b3J5RXZlbnREZWxheVwiLCAxMjUwKTtcbiAgb3B0aW9uKFwidmlld3BvcnRNYXJnaW5cIiwgMTAsIGZ1bmN0aW9uIChjbSkgeyByZXR1cm4gY20ucmVmcmVzaCgpOyB9LCB0cnVlKTtcbiAgb3B0aW9uKFwibWF4SGlnaGxpZ2h0TGVuZ3RoXCIsIDEwMDAwLCByZXNldE1vZGVTdGF0ZSwgdHJ1ZSk7XG4gIG9wdGlvbihcIm1vdmVJbnB1dFdpdGhDdXJzb3JcIiwgdHJ1ZSwgZnVuY3Rpb24gKGNtLCB2YWwpIHtcbiAgICBpZiAoIXZhbCkgeyBjbS5kaXNwbGF5LmlucHV0LnJlc2V0UG9zaXRpb24oKTsgfVxuICB9KTtcblxuICBvcHRpb24oXCJ0YWJpbmRleFwiLCBudWxsLCBmdW5jdGlvbiAoY20sIHZhbCkgeyByZXR1cm4gY20uZGlzcGxheS5pbnB1dC5nZXRGaWVsZCgpLnRhYkluZGV4ID0gdmFsIHx8IFwiXCI7IH0pO1xuICBvcHRpb24oXCJhdXRvZm9jdXNcIiwgbnVsbCk7XG4gIG9wdGlvbihcImRpcmVjdGlvblwiLCBcImx0clwiLCBmdW5jdGlvbiAoY20sIHZhbCkgeyByZXR1cm4gY20uZG9jLnNldERpcmVjdGlvbih2YWwpOyB9LCB0cnVlKTtcbn1cblxuZnVuY3Rpb24gZ3V0dGVyc0NoYW5nZWQoY20pIHtcbiAgdXBkYXRlR3V0dGVycyhjbSk7XG4gIHJlZ0NoYW5nZShjbSk7XG4gIGFsaWduSG9yaXpvbnRhbGx5KGNtKTtcbn1cblxuZnVuY3Rpb24gZHJhZ0Ryb3BDaGFuZ2VkKGNtLCB2YWx1ZSwgb2xkKSB7XG4gIHZhciB3YXNPbiA9IG9sZCAmJiBvbGQgIT0gSW5pdDtcbiAgaWYgKCF2YWx1ZSAhPSAhd2FzT24pIHtcbiAgICB2YXIgZnVuY3MgPSBjbS5kaXNwbGF5LmRyYWdGdW5jdGlvbnM7XG4gICAgdmFyIHRvZ2dsZSA9IHZhbHVlID8gb24gOiBvZmY7XG4gICAgdG9nZ2xlKGNtLmRpc3BsYXkuc2Nyb2xsZXIsIFwiZHJhZ3N0YXJ0XCIsIGZ1bmNzLnN0YXJ0KTtcbiAgICB0b2dnbGUoY20uZGlzcGxheS5zY3JvbGxlciwgXCJkcmFnZW50ZXJcIiwgZnVuY3MuZW50ZXIpO1xuICAgIHRvZ2dsZShjbS5kaXNwbGF5LnNjcm9sbGVyLCBcImRyYWdvdmVyXCIsIGZ1bmNzLm92ZXIpO1xuICAgIHRvZ2dsZShjbS5kaXNwbGF5LnNjcm9sbGVyLCBcImRyYWdsZWF2ZVwiLCBmdW5jcy5sZWF2ZSk7XG4gICAgdG9nZ2xlKGNtLmRpc3BsYXkuc2Nyb2xsZXIsIFwiZHJvcFwiLCBmdW5jcy5kcm9wKTtcbiAgfVxufVxuXG5mdW5jdGlvbiB3cmFwcGluZ0NoYW5nZWQoY20pIHtcbiAgaWYgKGNtLm9wdGlvbnMubGluZVdyYXBwaW5nKSB7XG4gICAgYWRkQ2xhc3MoY20uZGlzcGxheS53cmFwcGVyLCBcIkNvZGVNaXJyb3Itd3JhcFwiKTtcbiAgICBjbS5kaXNwbGF5LnNpemVyLnN0eWxlLm1pbldpZHRoID0gXCJcIjtcbiAgICBjbS5kaXNwbGF5LnNpemVyV2lkdGggPSBudWxsO1xuICB9IGVsc2Uge1xuICAgIHJtQ2xhc3MoY20uZGlzcGxheS53cmFwcGVyLCBcIkNvZGVNaXJyb3Itd3JhcFwiKTtcbiAgICBmaW5kTWF4TGluZShjbSk7XG4gIH1cbiAgZXN0aW1hdGVMaW5lSGVpZ2h0cyhjbSk7XG4gIHJlZ0NoYW5nZShjbSk7XG4gIGNsZWFyQ2FjaGVzKGNtKTtcbiAgc2V0VGltZW91dChmdW5jdGlvbiAoKSB7IHJldHVybiB1cGRhdGVTY3JvbGxiYXJzKGNtKTsgfSwgMTAwKTtcbn1cblxuLy8gQSBDb2RlTWlycm9yIGluc3RhbmNlIHJlcHJlc2VudHMgYW4gZWRpdG9yLiBUaGlzIGlzIHRoZSBvYmplY3Rcbi8vIHRoYXQgdXNlciBjb2RlIGlzIHVzdWFsbHkgZGVhbGluZyB3aXRoLlxuXG5mdW5jdGlvbiBDb2RlTWlycm9yJDEocGxhY2UsIG9wdGlvbnMpIHtcbiAgdmFyIHRoaXMkMSA9IHRoaXM7XG5cbiAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIENvZGVNaXJyb3IkMSkpIHsgcmV0dXJuIG5ldyBDb2RlTWlycm9yJDEocGxhY2UsIG9wdGlvbnMpIH1cblxuICB0aGlzLm9wdGlvbnMgPSBvcHRpb25zID0gb3B0aW9ucyA/IGNvcHlPYmoob3B0aW9ucykgOiB7fTtcbiAgLy8gRGV0ZXJtaW5lIGVmZmVjdGl2ZSBvcHRpb25zIGJhc2VkIG9uIGdpdmVuIHZhbHVlcyBhbmQgZGVmYXVsdHMuXG4gIGNvcHlPYmooZGVmYXVsdHMsIG9wdGlvbnMsIGZhbHNlKTtcbiAgc2V0R3V0dGVyc0ZvckxpbmVOdW1iZXJzKG9wdGlvbnMpO1xuXG4gIHZhciBkb2MgPSBvcHRpb25zLnZhbHVlO1xuICBpZiAodHlwZW9mIGRvYyA9PSBcInN0cmluZ1wiKSB7IGRvYyA9IG5ldyBEb2MoZG9jLCBvcHRpb25zLm1vZGUsIG51bGwsIG9wdGlvbnMubGluZVNlcGFyYXRvciwgb3B0aW9ucy5kaXJlY3Rpb24pOyB9XG4gIHRoaXMuZG9jID0gZG9jO1xuXG4gIHZhciBpbnB1dCA9IG5ldyBDb2RlTWlycm9yJDEuaW5wdXRTdHlsZXNbb3B0aW9ucy5pbnB1dFN0eWxlXSh0aGlzKTtcbiAgdmFyIGRpc3BsYXkgPSB0aGlzLmRpc3BsYXkgPSBuZXcgRGlzcGxheShwbGFjZSwgZG9jLCBpbnB1dCk7XG4gIGRpc3BsYXkud3JhcHBlci5Db2RlTWlycm9yID0gdGhpcztcbiAgdXBkYXRlR3V0dGVycyh0aGlzKTtcbiAgdGhlbWVDaGFuZ2VkKHRoaXMpO1xuICBpZiAob3B0aW9ucy5saW5lV3JhcHBpbmcpXG4gICAgeyB0aGlzLmRpc3BsYXkud3JhcHBlci5jbGFzc05hbWUgKz0gXCIgQ29kZU1pcnJvci13cmFwXCI7IH1cbiAgaW5pdFNjcm9sbGJhcnModGhpcyk7XG5cbiAgdGhpcy5zdGF0ZSA9IHtcbiAgICBrZXlNYXBzOiBbXSwgIC8vIHN0b3JlcyBtYXBzIGFkZGVkIGJ5IGFkZEtleU1hcFxuICAgIG92ZXJsYXlzOiBbXSwgLy8gaGlnaGxpZ2h0aW5nIG92ZXJsYXlzLCBhcyBhZGRlZCBieSBhZGRPdmVybGF5XG4gICAgbW9kZUdlbjogMCwgICAvLyBidW1wZWQgd2hlbiBtb2RlL292ZXJsYXkgY2hhbmdlcywgdXNlZCB0byBpbnZhbGlkYXRlIGhpZ2hsaWdodGluZyBpbmZvXG4gICAgb3ZlcndyaXRlOiBmYWxzZSxcbiAgICBkZWxheWluZ0JsdXJFdmVudDogZmFsc2UsXG4gICAgZm9jdXNlZDogZmFsc2UsXG4gICAgc3VwcHJlc3NFZGl0czogZmFsc2UsIC8vIHVzZWQgdG8gZGlzYWJsZSBlZGl0aW5nIGR1cmluZyBrZXkgaGFuZGxlcnMgd2hlbiBpbiByZWFkT25seSBtb2RlXG4gICAgcGFzdGVJbmNvbWluZzogZmFsc2UsIGN1dEluY29taW5nOiBmYWxzZSwgLy8gaGVscCByZWNvZ25pemUgcGFzdGUvY3V0IGVkaXRzIGluIGlucHV0LnBvbGxcbiAgICBzZWxlY3RpbmdUZXh0OiBmYWxzZSxcbiAgICBkcmFnZ2luZ1RleHQ6IGZhbHNlLFxuICAgIGhpZ2hsaWdodDogbmV3IERlbGF5ZWQoKSwgLy8gc3RvcmVzIGhpZ2hsaWdodCB3b3JrZXIgdGltZW91dFxuICAgIGtleVNlcTogbnVsbCwgIC8vIFVuZmluaXNoZWQga2V5IHNlcXVlbmNlXG4gICAgc3BlY2lhbENoYXJzOiBudWxsXG4gIH07XG5cbiAgaWYgKG9wdGlvbnMuYXV0b2ZvY3VzICYmICFtb2JpbGUpIHsgZGlzcGxheS5pbnB1dC5mb2N1cygpOyB9XG5cbiAgLy8gT3ZlcnJpZGUgbWFnaWMgdGV4dGFyZWEgY29udGVudCByZXN0b3JlIHRoYXQgSUUgc29tZXRpbWVzIGRvZXNcbiAgLy8gb24gb3VyIGhpZGRlbiB0ZXh0YXJlYSBvbiByZWxvYWRcbiAgaWYgKGllICYmIGllX3ZlcnNpb24gPCAxMSkgeyBzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHsgcmV0dXJuIHRoaXMkMS5kaXNwbGF5LmlucHV0LnJlc2V0KHRydWUpOyB9LCAyMCk7IH1cblxuICByZWdpc3RlckV2ZW50SGFuZGxlcnModGhpcyk7XG4gIGVuc3VyZUdsb2JhbEhhbmRsZXJzKCk7XG5cbiAgc3RhcnRPcGVyYXRpb24odGhpcyk7XG4gIHRoaXMuY3VyT3AuZm9yY2VVcGRhdGUgPSB0cnVlO1xuICBhdHRhY2hEb2ModGhpcywgZG9jKTtcblxuICBpZiAoKG9wdGlvbnMuYXV0b2ZvY3VzICYmICFtb2JpbGUpIHx8IHRoaXMuaGFzRm9jdXMoKSlcbiAgICB7IHNldFRpbWVvdXQoYmluZChvbkZvY3VzLCB0aGlzKSwgMjApOyB9XG4gIGVsc2VcbiAgICB7IG9uQmx1cih0aGlzKTsgfVxuXG4gIGZvciAodmFyIG9wdCBpbiBvcHRpb25IYW5kbGVycykgeyBpZiAob3B0aW9uSGFuZGxlcnMuaGFzT3duUHJvcGVydHkob3B0KSlcbiAgICB7IG9wdGlvbkhhbmRsZXJzW29wdF0odGhpcyQxLCBvcHRpb25zW29wdF0sIEluaXQpOyB9IH1cbiAgbWF5YmVVcGRhdGVMaW5lTnVtYmVyV2lkdGgodGhpcyk7XG4gIGlmIChvcHRpb25zLmZpbmlzaEluaXQpIHsgb3B0aW9ucy5maW5pc2hJbml0KHRoaXMpOyB9XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgaW5pdEhvb2tzLmxlbmd0aDsgKytpKSB7IGluaXRIb29rc1tpXSh0aGlzJDEpOyB9XG4gIGVuZE9wZXJhdGlvbih0aGlzKTtcbiAgLy8gU3VwcHJlc3Mgb3B0aW1pemVsZWdpYmlsaXR5IGluIFdlYmtpdCwgc2luY2UgaXQgYnJlYWtzIHRleHRcbiAgLy8gbWVhc3VyaW5nIG9uIGxpbmUgd3JhcHBpbmcgYm91bmRhcmllcy5cbiAgaWYgKHdlYmtpdCAmJiBvcHRpb25zLmxpbmVXcmFwcGluZyAmJlxuICAgICAgZ2V0Q29tcHV0ZWRTdHlsZShkaXNwbGF5LmxpbmVEaXYpLnRleHRSZW5kZXJpbmcgPT0gXCJvcHRpbWl6ZWxlZ2liaWxpdHlcIilcbiAgICB7IGRpc3BsYXkubGluZURpdi5zdHlsZS50ZXh0UmVuZGVyaW5nID0gXCJhdXRvXCI7IH1cbn1cblxuLy8gVGhlIGRlZmF1bHQgY29uZmlndXJhdGlvbiBvcHRpb25zLlxuQ29kZU1pcnJvciQxLmRlZmF1bHRzID0gZGVmYXVsdHM7XG4vLyBGdW5jdGlvbnMgdG8gcnVuIHdoZW4gb3B0aW9ucyBhcmUgY2hhbmdlZC5cbkNvZGVNaXJyb3IkMS5vcHRpb25IYW5kbGVycyA9IG9wdGlvbkhhbmRsZXJzO1xuXG4vLyBBdHRhY2ggdGhlIG5lY2Vzc2FyeSBldmVudCBoYW5kbGVycyB3aGVuIGluaXRpYWxpemluZyB0aGUgZWRpdG9yXG5mdW5jdGlvbiByZWdpc3RlckV2ZW50SGFuZGxlcnMoY20pIHtcbiAgdmFyIGQgPSBjbS5kaXNwbGF5O1xuICBvbihkLnNjcm9sbGVyLCBcIm1vdXNlZG93blwiLCBvcGVyYXRpb24oY20sIG9uTW91c2VEb3duKSk7XG4gIC8vIE9sZGVyIElFJ3Mgd2lsbCBub3QgZmlyZSBhIHNlY29uZCBtb3VzZWRvd24gZm9yIGEgZG91YmxlIGNsaWNrXG4gIGlmIChpZSAmJiBpZV92ZXJzaW9uIDwgMTEpXG4gICAgeyBvbihkLnNjcm9sbGVyLCBcImRibGNsaWNrXCIsIG9wZXJhdGlvbihjbSwgZnVuY3Rpb24gKGUpIHtcbiAgICAgIGlmIChzaWduYWxET01FdmVudChjbSwgZSkpIHsgcmV0dXJuIH1cbiAgICAgIHZhciBwb3MgPSBwb3NGcm9tTW91c2UoY20sIGUpO1xuICAgICAgaWYgKCFwb3MgfHwgY2xpY2tJbkd1dHRlcihjbSwgZSkgfHwgZXZlbnRJbldpZGdldChjbS5kaXNwbGF5LCBlKSkgeyByZXR1cm4gfVxuICAgICAgZV9wcmV2ZW50RGVmYXVsdChlKTtcbiAgICAgIHZhciB3b3JkID0gY20uZmluZFdvcmRBdChwb3MpO1xuICAgICAgZXh0ZW5kU2VsZWN0aW9uKGNtLmRvYywgd29yZC5hbmNob3IsIHdvcmQuaGVhZCk7XG4gICAgfSkpOyB9XG4gIGVsc2VcbiAgICB7IG9uKGQuc2Nyb2xsZXIsIFwiZGJsY2xpY2tcIiwgZnVuY3Rpb24gKGUpIHsgcmV0dXJuIHNpZ25hbERPTUV2ZW50KGNtLCBlKSB8fCBlX3ByZXZlbnREZWZhdWx0KGUpOyB9KTsgfVxuICAvLyBTb21lIGJyb3dzZXJzIGZpcmUgY29udGV4dG1lbnUgKmFmdGVyKiBvcGVuaW5nIHRoZSBtZW51LCBhdFxuICAvLyB3aGljaCBwb2ludCB3ZSBjYW4ndCBtZXNzIHdpdGggaXQgYW55bW9yZS4gQ29udGV4dCBtZW51IGlzXG4gIC8vIGhhbmRsZWQgaW4gb25Nb3VzZURvd24gZm9yIHRoZXNlIGJyb3dzZXJzLlxuICBpZiAoIWNhcHR1cmVSaWdodENsaWNrKSB7IG9uKGQuc2Nyb2xsZXIsIFwiY29udGV4dG1lbnVcIiwgZnVuY3Rpb24gKGUpIHsgcmV0dXJuIG9uQ29udGV4dE1lbnUoY20sIGUpOyB9KTsgfVxuXG4gIC8vIFVzZWQgdG8gc3VwcHJlc3MgbW91c2UgZXZlbnQgaGFuZGxpbmcgd2hlbiBhIHRvdWNoIGhhcHBlbnNcbiAgdmFyIHRvdWNoRmluaXNoZWQsIHByZXZUb3VjaCA9IHtlbmQ6IDB9O1xuICBmdW5jdGlvbiBmaW5pc2hUb3VjaCgpIHtcbiAgICBpZiAoZC5hY3RpdmVUb3VjaCkge1xuICAgICAgdG91Y2hGaW5pc2hlZCA9IHNldFRpbWVvdXQoZnVuY3Rpb24gKCkgeyByZXR1cm4gZC5hY3RpdmVUb3VjaCA9IG51bGw7IH0sIDEwMDApO1xuICAgICAgcHJldlRvdWNoID0gZC5hY3RpdmVUb3VjaDtcbiAgICAgIHByZXZUb3VjaC5lbmQgPSArbmV3IERhdGU7XG4gICAgfVxuICB9XG4gIGZ1bmN0aW9uIGlzTW91c2VMaWtlVG91Y2hFdmVudChlKSB7XG4gICAgaWYgKGUudG91Y2hlcy5sZW5ndGggIT0gMSkgeyByZXR1cm4gZmFsc2UgfVxuICAgIHZhciB0b3VjaCA9IGUudG91Y2hlc1swXTtcbiAgICByZXR1cm4gdG91Y2gucmFkaXVzWCA8PSAxICYmIHRvdWNoLnJhZGl1c1kgPD0gMVxuICB9XG4gIGZ1bmN0aW9uIGZhckF3YXkodG91Y2gsIG90aGVyKSB7XG4gICAgaWYgKG90aGVyLmxlZnQgPT0gbnVsbCkgeyByZXR1cm4gdHJ1ZSB9XG4gICAgdmFyIGR4ID0gb3RoZXIubGVmdCAtIHRvdWNoLmxlZnQsIGR5ID0gb3RoZXIudG9wIC0gdG91Y2gudG9wO1xuICAgIHJldHVybiBkeCAqIGR4ICsgZHkgKiBkeSA+IDIwICogMjBcbiAgfVxuICBvbihkLnNjcm9sbGVyLCBcInRvdWNoc3RhcnRcIiwgZnVuY3Rpb24gKGUpIHtcbiAgICBpZiAoIXNpZ25hbERPTUV2ZW50KGNtLCBlKSAmJiAhaXNNb3VzZUxpa2VUb3VjaEV2ZW50KGUpICYmICFjbGlja0luR3V0dGVyKGNtLCBlKSkge1xuICAgICAgZC5pbnB1dC5lbnN1cmVQb2xsZWQoKTtcbiAgICAgIGNsZWFyVGltZW91dCh0b3VjaEZpbmlzaGVkKTtcbiAgICAgIHZhciBub3cgPSArbmV3IERhdGU7XG4gICAgICBkLmFjdGl2ZVRvdWNoID0ge3N0YXJ0OiBub3csIG1vdmVkOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgICAgcHJldjogbm93IC0gcHJldlRvdWNoLmVuZCA8PSAzMDAgPyBwcmV2VG91Y2ggOiBudWxsfTtcbiAgICAgIGlmIChlLnRvdWNoZXMubGVuZ3RoID09IDEpIHtcbiAgICAgICAgZC5hY3RpdmVUb3VjaC5sZWZ0ID0gZS50b3VjaGVzWzBdLnBhZ2VYO1xuICAgICAgICBkLmFjdGl2ZVRvdWNoLnRvcCA9IGUudG91Y2hlc1swXS5wYWdlWTtcbiAgICAgIH1cbiAgICB9XG4gIH0pO1xuICBvbihkLnNjcm9sbGVyLCBcInRvdWNobW92ZVwiLCBmdW5jdGlvbiAoKSB7XG4gICAgaWYgKGQuYWN0aXZlVG91Y2gpIHsgZC5hY3RpdmVUb3VjaC5tb3ZlZCA9IHRydWU7IH1cbiAgfSk7XG4gIG9uKGQuc2Nyb2xsZXIsIFwidG91Y2hlbmRcIiwgZnVuY3Rpb24gKGUpIHtcbiAgICB2YXIgdG91Y2ggPSBkLmFjdGl2ZVRvdWNoO1xuICAgIGlmICh0b3VjaCAmJiAhZXZlbnRJbldpZGdldChkLCBlKSAmJiB0b3VjaC5sZWZ0ICE9IG51bGwgJiZcbiAgICAgICAgIXRvdWNoLm1vdmVkICYmIG5ldyBEYXRlIC0gdG91Y2guc3RhcnQgPCAzMDApIHtcbiAgICAgIHZhciBwb3MgPSBjbS5jb29yZHNDaGFyKGQuYWN0aXZlVG91Y2gsIFwicGFnZVwiKSwgcmFuZ2U7XG4gICAgICBpZiAoIXRvdWNoLnByZXYgfHwgZmFyQXdheSh0b3VjaCwgdG91Y2gucHJldikpIC8vIFNpbmdsZSB0YXBcbiAgICAgICAgeyByYW5nZSA9IG5ldyBSYW5nZShwb3MsIHBvcyk7IH1cbiAgICAgIGVsc2UgaWYgKCF0b3VjaC5wcmV2LnByZXYgfHwgZmFyQXdheSh0b3VjaCwgdG91Y2gucHJldi5wcmV2KSkgLy8gRG91YmxlIHRhcFxuICAgICAgICB7IHJhbmdlID0gY20uZmluZFdvcmRBdChwb3MpOyB9XG4gICAgICBlbHNlIC8vIFRyaXBsZSB0YXBcbiAgICAgICAgeyByYW5nZSA9IG5ldyBSYW5nZShQb3MocG9zLmxpbmUsIDApLCBjbGlwUG9zKGNtLmRvYywgUG9zKHBvcy5saW5lICsgMSwgMCkpKTsgfVxuICAgICAgY20uc2V0U2VsZWN0aW9uKHJhbmdlLmFuY2hvciwgcmFuZ2UuaGVhZCk7XG4gICAgICBjbS5mb2N1cygpO1xuICAgICAgZV9wcmV2ZW50RGVmYXVsdChlKTtcbiAgICB9XG4gICAgZmluaXNoVG91Y2goKTtcbiAgfSk7XG4gIG9uKGQuc2Nyb2xsZXIsIFwidG91Y2hjYW5jZWxcIiwgZmluaXNoVG91Y2gpO1xuXG4gIC8vIFN5bmMgc2Nyb2xsaW5nIGJldHdlZW4gZmFrZSBzY3JvbGxiYXJzIGFuZCByZWFsIHNjcm9sbGFibGVcbiAgLy8gYXJlYSwgZW5zdXJlIHZpZXdwb3J0IGlzIHVwZGF0ZWQgd2hlbiBzY3JvbGxpbmcuXG4gIG9uKGQuc2Nyb2xsZXIsIFwic2Nyb2xsXCIsIGZ1bmN0aW9uICgpIHtcbiAgICBpZiAoZC5zY3JvbGxlci5jbGllbnRIZWlnaHQpIHtcbiAgICAgIHVwZGF0ZVNjcm9sbFRvcChjbSwgZC5zY3JvbGxlci5zY3JvbGxUb3ApO1xuICAgICAgc2V0U2Nyb2xsTGVmdChjbSwgZC5zY3JvbGxlci5zY3JvbGxMZWZ0LCB0cnVlKTtcbiAgICAgIHNpZ25hbChjbSwgXCJzY3JvbGxcIiwgY20pO1xuICAgIH1cbiAgfSk7XG5cbiAgLy8gTGlzdGVuIHRvIHdoZWVsIGV2ZW50cyBpbiBvcmRlciB0byB0cnkgYW5kIHVwZGF0ZSB0aGUgdmlld3BvcnQgb24gdGltZS5cbiAgb24oZC5zY3JvbGxlciwgXCJtb3VzZXdoZWVsXCIsIGZ1bmN0aW9uIChlKSB7IHJldHVybiBvblNjcm9sbFdoZWVsKGNtLCBlKTsgfSk7XG4gIG9uKGQuc2Nyb2xsZXIsIFwiRE9NTW91c2VTY3JvbGxcIiwgZnVuY3Rpb24gKGUpIHsgcmV0dXJuIG9uU2Nyb2xsV2hlZWwoY20sIGUpOyB9KTtcblxuICAvLyBQcmV2ZW50IHdyYXBwZXIgZnJvbSBldmVyIHNjcm9sbGluZ1xuICBvbihkLndyYXBwZXIsIFwic2Nyb2xsXCIsIGZ1bmN0aW9uICgpIHsgcmV0dXJuIGQud3JhcHBlci5zY3JvbGxUb3AgPSBkLndyYXBwZXIuc2Nyb2xsTGVmdCA9IDA7IH0pO1xuXG4gIGQuZHJhZ0Z1bmN0aW9ucyA9IHtcbiAgICBlbnRlcjogZnVuY3Rpb24gKGUpIHtpZiAoIXNpZ25hbERPTUV2ZW50KGNtLCBlKSkgeyBlX3N0b3AoZSk7IH19LFxuICAgIG92ZXI6IGZ1bmN0aW9uIChlKSB7aWYgKCFzaWduYWxET01FdmVudChjbSwgZSkpIHsgb25EcmFnT3ZlcihjbSwgZSk7IGVfc3RvcChlKTsgfX0sXG4gICAgc3RhcnQ6IGZ1bmN0aW9uIChlKSB7IHJldHVybiBvbkRyYWdTdGFydChjbSwgZSk7IH0sXG4gICAgZHJvcDogb3BlcmF0aW9uKGNtLCBvbkRyb3ApLFxuICAgIGxlYXZlOiBmdW5jdGlvbiAoZSkge2lmICghc2lnbmFsRE9NRXZlbnQoY20sIGUpKSB7IGNsZWFyRHJhZ0N1cnNvcihjbSk7IH19XG4gIH07XG5cbiAgdmFyIGlucCA9IGQuaW5wdXQuZ2V0RmllbGQoKTtcbiAgb24oaW5wLCBcImtleXVwXCIsIGZ1bmN0aW9uIChlKSB7IHJldHVybiBvbktleVVwLmNhbGwoY20sIGUpOyB9KTtcbiAgb24oaW5wLCBcImtleWRvd25cIiwgb3BlcmF0aW9uKGNtLCBvbktleURvd24pKTtcbiAgb24oaW5wLCBcImtleXByZXNzXCIsIG9wZXJhdGlvbihjbSwgb25LZXlQcmVzcykpO1xuICBvbihpbnAsIFwiZm9jdXNcIiwgZnVuY3Rpb24gKGUpIHsgcmV0dXJuIG9uRm9jdXMoY20sIGUpOyB9KTtcbiAgb24oaW5wLCBcImJsdXJcIiwgZnVuY3Rpb24gKGUpIHsgcmV0dXJuIG9uQmx1cihjbSwgZSk7IH0pO1xufVxuXG52YXIgaW5pdEhvb2tzID0gW107XG5Db2RlTWlycm9yJDEuZGVmaW5lSW5pdEhvb2sgPSBmdW5jdGlvbiAoZikgeyByZXR1cm4gaW5pdEhvb2tzLnB1c2goZik7IH07XG5cbi8vIEluZGVudCB0aGUgZ2l2ZW4gbGluZS4gVGhlIGhvdyBwYXJhbWV0ZXIgY2FuIGJlIFwic21hcnRcIixcbi8vIFwiYWRkXCIvbnVsbCwgXCJzdWJ0cmFjdFwiLCBvciBcInByZXZcIi4gV2hlbiBhZ2dyZXNzaXZlIGlzIGZhbHNlXG4vLyAodHlwaWNhbGx5IHNldCB0byB0cnVlIGZvciBmb3JjZWQgc2luZ2xlLWxpbmUgaW5kZW50cyksIGVtcHR5XG4vLyBsaW5lcyBhcmUgbm90IGluZGVudGVkLCBhbmQgcGxhY2VzIHdoZXJlIHRoZSBtb2RlIHJldHVybnMgUGFzc1xuLy8gYXJlIGxlZnQgYWxvbmUuXG5mdW5jdGlvbiBpbmRlbnRMaW5lKGNtLCBuLCBob3csIGFnZ3Jlc3NpdmUpIHtcbiAgdmFyIGRvYyA9IGNtLmRvYywgc3RhdGU7XG4gIGlmIChob3cgPT0gbnVsbCkgeyBob3cgPSBcImFkZFwiOyB9XG4gIGlmIChob3cgPT0gXCJzbWFydFwiKSB7XG4gICAgLy8gRmFsbCBiYWNrIHRvIFwicHJldlwiIHdoZW4gdGhlIG1vZGUgZG9lc24ndCBoYXZlIGFuIGluZGVudGF0aW9uXG4gICAgLy8gbWV0aG9kLlxuICAgIGlmICghZG9jLm1vZGUuaW5kZW50KSB7IGhvdyA9IFwicHJldlwiOyB9XG4gICAgZWxzZSB7IHN0YXRlID0gZ2V0Q29udGV4dEJlZm9yZShjbSwgbikuc3RhdGU7IH1cbiAgfVxuXG4gIHZhciB0YWJTaXplID0gY20ub3B0aW9ucy50YWJTaXplO1xuICB2YXIgbGluZSA9IGdldExpbmUoZG9jLCBuKSwgY3VyU3BhY2UgPSBjb3VudENvbHVtbihsaW5lLnRleHQsIG51bGwsIHRhYlNpemUpO1xuICBpZiAobGluZS5zdGF0ZUFmdGVyKSB7IGxpbmUuc3RhdGVBZnRlciA9IG51bGw7IH1cbiAgdmFyIGN1clNwYWNlU3RyaW5nID0gbGluZS50ZXh0Lm1hdGNoKC9eXFxzKi8pWzBdLCBpbmRlbnRhdGlvbjtcbiAgaWYgKCFhZ2dyZXNzaXZlICYmICEvXFxTLy50ZXN0KGxpbmUudGV4dCkpIHtcbiAgICBpbmRlbnRhdGlvbiA9IDA7XG4gICAgaG93ID0gXCJub3RcIjtcbiAgfSBlbHNlIGlmIChob3cgPT0gXCJzbWFydFwiKSB7XG4gICAgaW5kZW50YXRpb24gPSBkb2MubW9kZS5pbmRlbnQoc3RhdGUsIGxpbmUudGV4dC5zbGljZShjdXJTcGFjZVN0cmluZy5sZW5ndGgpLCBsaW5lLnRleHQpO1xuICAgIGlmIChpbmRlbnRhdGlvbiA9PSBQYXNzIHx8IGluZGVudGF0aW9uID4gMTUwKSB7XG4gICAgICBpZiAoIWFnZ3Jlc3NpdmUpIHsgcmV0dXJuIH1cbiAgICAgIGhvdyA9IFwicHJldlwiO1xuICAgIH1cbiAgfVxuICBpZiAoaG93ID09IFwicHJldlwiKSB7XG4gICAgaWYgKG4gPiBkb2MuZmlyc3QpIHsgaW5kZW50YXRpb24gPSBjb3VudENvbHVtbihnZXRMaW5lKGRvYywgbi0xKS50ZXh0LCBudWxsLCB0YWJTaXplKTsgfVxuICAgIGVsc2UgeyBpbmRlbnRhdGlvbiA9IDA7IH1cbiAgfSBlbHNlIGlmIChob3cgPT0gXCJhZGRcIikge1xuICAgIGluZGVudGF0aW9uID0gY3VyU3BhY2UgKyBjbS5vcHRpb25zLmluZGVudFVuaXQ7XG4gIH0gZWxzZSBpZiAoaG93ID09IFwic3VidHJhY3RcIikge1xuICAgIGluZGVudGF0aW9uID0gY3VyU3BhY2UgLSBjbS5vcHRpb25zLmluZGVudFVuaXQ7XG4gIH0gZWxzZSBpZiAodHlwZW9mIGhvdyA9PSBcIm51bWJlclwiKSB7XG4gICAgaW5kZW50YXRpb24gPSBjdXJTcGFjZSArIGhvdztcbiAgfVxuICBpbmRlbnRhdGlvbiA9IE1hdGgubWF4KDAsIGluZGVudGF0aW9uKTtcblxuICB2YXIgaW5kZW50U3RyaW5nID0gXCJcIiwgcG9zID0gMDtcbiAgaWYgKGNtLm9wdGlvbnMuaW5kZW50V2l0aFRhYnMpXG4gICAgeyBmb3IgKHZhciBpID0gTWF0aC5mbG9vcihpbmRlbnRhdGlvbiAvIHRhYlNpemUpOyBpOyAtLWkpIHtwb3MgKz0gdGFiU2l6ZTsgaW5kZW50U3RyaW5nICs9IFwiXFx0XCI7fSB9XG4gIGlmIChwb3MgPCBpbmRlbnRhdGlvbikgeyBpbmRlbnRTdHJpbmcgKz0gc3BhY2VTdHIoaW5kZW50YXRpb24gLSBwb3MpOyB9XG5cbiAgaWYgKGluZGVudFN0cmluZyAhPSBjdXJTcGFjZVN0cmluZykge1xuICAgIHJlcGxhY2VSYW5nZShkb2MsIGluZGVudFN0cmluZywgUG9zKG4sIDApLCBQb3MobiwgY3VyU3BhY2VTdHJpbmcubGVuZ3RoKSwgXCIraW5wdXRcIik7XG4gICAgbGluZS5zdGF0ZUFmdGVyID0gbnVsbDtcbiAgICByZXR1cm4gdHJ1ZVxuICB9IGVsc2Uge1xuICAgIC8vIEVuc3VyZSB0aGF0LCBpZiB0aGUgY3Vyc29yIHdhcyBpbiB0aGUgd2hpdGVzcGFjZSBhdCB0aGUgc3RhcnRcbiAgICAvLyBvZiB0aGUgbGluZSwgaXQgaXMgbW92ZWQgdG8gdGhlIGVuZCBvZiB0aGF0IHNwYWNlLlxuICAgIGZvciAodmFyIGkkMSA9IDA7IGkkMSA8IGRvYy5zZWwucmFuZ2VzLmxlbmd0aDsgaSQxKyspIHtcbiAgICAgIHZhciByYW5nZSA9IGRvYy5zZWwucmFuZ2VzW2kkMV07XG4gICAgICBpZiAocmFuZ2UuaGVhZC5saW5lID09IG4gJiYgcmFuZ2UuaGVhZC5jaCA8IGN1clNwYWNlU3RyaW5nLmxlbmd0aCkge1xuICAgICAgICB2YXIgcG9zJDEgPSBQb3MobiwgY3VyU3BhY2VTdHJpbmcubGVuZ3RoKTtcbiAgICAgICAgcmVwbGFjZU9uZVNlbGVjdGlvbihkb2MsIGkkMSwgbmV3IFJhbmdlKHBvcyQxLCBwb3MkMSkpO1xuICAgICAgICBicmVha1xuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG4vLyBUaGlzIHdpbGwgYmUgc2V0IHRvIGEge2xpbmVXaXNlOiBib29sLCB0ZXh0OiBbc3RyaW5nXX0gb2JqZWN0LCBzb1xuLy8gdGhhdCwgd2hlbiBwYXN0aW5nLCB3ZSBrbm93IHdoYXQga2luZCBvZiBzZWxlY3Rpb25zIHRoZSBjb3BpZWRcbi8vIHRleHQgd2FzIG1hZGUgb3V0IG9mLlxudmFyIGxhc3RDb3BpZWQgPSBudWxsO1xuXG5mdW5jdGlvbiBzZXRMYXN0Q29waWVkKG5ld0xhc3RDb3BpZWQpIHtcbiAgbGFzdENvcGllZCA9IG5ld0xhc3RDb3BpZWQ7XG59XG5cbmZ1bmN0aW9uIGFwcGx5VGV4dElucHV0KGNtLCBpbnNlcnRlZCwgZGVsZXRlZCwgc2VsLCBvcmlnaW4pIHtcbiAgdmFyIGRvYyA9IGNtLmRvYztcbiAgY20uZGlzcGxheS5zaGlmdCA9IGZhbHNlO1xuICBpZiAoIXNlbCkgeyBzZWwgPSBkb2Muc2VsOyB9XG5cbiAgdmFyIHBhc3RlID0gY20uc3RhdGUucGFzdGVJbmNvbWluZyB8fCBvcmlnaW4gPT0gXCJwYXN0ZVwiO1xuICB2YXIgdGV4dExpbmVzID0gc3BsaXRMaW5lc0F1dG8oaW5zZXJ0ZWQpLCBtdWx0aVBhc3RlID0gbnVsbDtcbiAgLy8gV2hlbiBwYXN0aW5nIE4gbGluZXMgaW50byBOIHNlbGVjdGlvbnMsIGluc2VydCBvbmUgbGluZSBwZXIgc2VsZWN0aW9uXG4gIGlmIChwYXN0ZSAmJiBzZWwucmFuZ2VzLmxlbmd0aCA+IDEpIHtcbiAgICBpZiAobGFzdENvcGllZCAmJiBsYXN0Q29waWVkLnRleHQuam9pbihcIlxcblwiKSA9PSBpbnNlcnRlZCkge1xuICAgICAgaWYgKHNlbC5yYW5nZXMubGVuZ3RoICUgbGFzdENvcGllZC50ZXh0Lmxlbmd0aCA9PSAwKSB7XG4gICAgICAgIG11bHRpUGFzdGUgPSBbXTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsYXN0Q29waWVkLnRleHQubGVuZ3RoOyBpKyspXG4gICAgICAgICAgeyBtdWx0aVBhc3RlLnB1c2goZG9jLnNwbGl0TGluZXMobGFzdENvcGllZC50ZXh0W2ldKSk7IH1cbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKHRleHRMaW5lcy5sZW5ndGggPT0gc2VsLnJhbmdlcy5sZW5ndGggJiYgY20ub3B0aW9ucy5wYXN0ZUxpbmVzUGVyU2VsZWN0aW9uKSB7XG4gICAgICBtdWx0aVBhc3RlID0gbWFwKHRleHRMaW5lcywgZnVuY3Rpb24gKGwpIHsgcmV0dXJuIFtsXTsgfSk7XG4gICAgfVxuICB9XG5cbiAgdmFyIHVwZGF0ZUlucHV0O1xuICAvLyBOb3JtYWwgYmVoYXZpb3IgaXMgdG8gaW5zZXJ0IHRoZSBuZXcgdGV4dCBpbnRvIGV2ZXJ5IHNlbGVjdGlvblxuICBmb3IgKHZhciBpJDEgPSBzZWwucmFuZ2VzLmxlbmd0aCAtIDE7IGkkMSA+PSAwOyBpJDEtLSkge1xuICAgIHZhciByYW5nZSQkMSA9IHNlbC5yYW5nZXNbaSQxXTtcbiAgICB2YXIgZnJvbSA9IHJhbmdlJCQxLmZyb20oKSwgdG8gPSByYW5nZSQkMS50bygpO1xuICAgIGlmIChyYW5nZSQkMS5lbXB0eSgpKSB7XG4gICAgICBpZiAoZGVsZXRlZCAmJiBkZWxldGVkID4gMCkgLy8gSGFuZGxlIGRlbGV0aW9uXG4gICAgICAgIHsgZnJvbSA9IFBvcyhmcm9tLmxpbmUsIGZyb20uY2ggLSBkZWxldGVkKTsgfVxuICAgICAgZWxzZSBpZiAoY20uc3RhdGUub3ZlcndyaXRlICYmICFwYXN0ZSkgLy8gSGFuZGxlIG92ZXJ3cml0ZVxuICAgICAgICB7IHRvID0gUG9zKHRvLmxpbmUsIE1hdGgubWluKGdldExpbmUoZG9jLCB0by5saW5lKS50ZXh0Lmxlbmd0aCwgdG8uY2ggKyBsc3QodGV4dExpbmVzKS5sZW5ndGgpKTsgfVxuICAgICAgZWxzZSBpZiAobGFzdENvcGllZCAmJiBsYXN0Q29waWVkLmxpbmVXaXNlICYmIGxhc3RDb3BpZWQudGV4dC5qb2luKFwiXFxuXCIpID09IGluc2VydGVkKVxuICAgICAgICB7IGZyb20gPSB0byA9IFBvcyhmcm9tLmxpbmUsIDApOyB9XG4gICAgfVxuICAgIHVwZGF0ZUlucHV0ID0gY20uY3VyT3AudXBkYXRlSW5wdXQ7XG4gICAgdmFyIGNoYW5nZUV2ZW50ID0ge2Zyb206IGZyb20sIHRvOiB0bywgdGV4dDogbXVsdGlQYXN0ZSA/IG11bHRpUGFzdGVbaSQxICUgbXVsdGlQYXN0ZS5sZW5ndGhdIDogdGV4dExpbmVzLFxuICAgICAgICAgICAgICAgICAgICAgICBvcmlnaW46IG9yaWdpbiB8fCAocGFzdGUgPyBcInBhc3RlXCIgOiBjbS5zdGF0ZS5jdXRJbmNvbWluZyA/IFwiY3V0XCIgOiBcIitpbnB1dFwiKX07XG4gICAgbWFrZUNoYW5nZShjbS5kb2MsIGNoYW5nZUV2ZW50KTtcbiAgICBzaWduYWxMYXRlcihjbSwgXCJpbnB1dFJlYWRcIiwgY20sIGNoYW5nZUV2ZW50KTtcbiAgfVxuICBpZiAoaW5zZXJ0ZWQgJiYgIXBhc3RlKVxuICAgIHsgdHJpZ2dlckVsZWN0cmljKGNtLCBpbnNlcnRlZCk7IH1cblxuICBlbnN1cmVDdXJzb3JWaXNpYmxlKGNtKTtcbiAgY20uY3VyT3AudXBkYXRlSW5wdXQgPSB1cGRhdGVJbnB1dDtcbiAgY20uY3VyT3AudHlwaW5nID0gdHJ1ZTtcbiAgY20uc3RhdGUucGFzdGVJbmNvbWluZyA9IGNtLnN0YXRlLmN1dEluY29taW5nID0gZmFsc2U7XG59XG5cbmZ1bmN0aW9uIGhhbmRsZVBhc3RlKGUsIGNtKSB7XG4gIHZhciBwYXN0ZWQgPSBlLmNsaXBib2FyZERhdGEgJiYgZS5jbGlwYm9hcmREYXRhLmdldERhdGEoXCJUZXh0XCIpO1xuICBpZiAocGFzdGVkKSB7XG4gICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGlmICghY20uaXNSZWFkT25seSgpICYmICFjbS5vcHRpb25zLmRpc2FibGVJbnB1dClcbiAgICAgIHsgcnVuSW5PcChjbSwgZnVuY3Rpb24gKCkgeyByZXR1cm4gYXBwbHlUZXh0SW5wdXQoY20sIHBhc3RlZCwgMCwgbnVsbCwgXCJwYXN0ZVwiKTsgfSk7IH1cbiAgICByZXR1cm4gdHJ1ZVxuICB9XG59XG5cbmZ1bmN0aW9uIHRyaWdnZXJFbGVjdHJpYyhjbSwgaW5zZXJ0ZWQpIHtcbiAgLy8gV2hlbiBhbiAnZWxlY3RyaWMnIGNoYXJhY3RlciBpcyBpbnNlcnRlZCwgaW1tZWRpYXRlbHkgdHJpZ2dlciBhIHJlaW5kZW50XG4gIGlmICghY20ub3B0aW9ucy5lbGVjdHJpY0NoYXJzIHx8ICFjbS5vcHRpb25zLnNtYXJ0SW5kZW50KSB7IHJldHVybiB9XG4gIHZhciBzZWwgPSBjbS5kb2Muc2VsO1xuXG4gIGZvciAodmFyIGkgPSBzZWwucmFuZ2VzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgdmFyIHJhbmdlJCQxID0gc2VsLnJhbmdlc1tpXTtcbiAgICBpZiAocmFuZ2UkJDEuaGVhZC5jaCA+IDEwMCB8fCAoaSAmJiBzZWwucmFuZ2VzW2kgLSAxXS5oZWFkLmxpbmUgPT0gcmFuZ2UkJDEuaGVhZC5saW5lKSkgeyBjb250aW51ZSB9XG4gICAgdmFyIG1vZGUgPSBjbS5nZXRNb2RlQXQocmFuZ2UkJDEuaGVhZCk7XG4gICAgdmFyIGluZGVudGVkID0gZmFsc2U7XG4gICAgaWYgKG1vZGUuZWxlY3RyaWNDaGFycykge1xuICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBtb2RlLmVsZWN0cmljQ2hhcnMubGVuZ3RoOyBqKyspXG4gICAgICAgIHsgaWYgKGluc2VydGVkLmluZGV4T2YobW9kZS5lbGVjdHJpY0NoYXJzLmNoYXJBdChqKSkgPiAtMSkge1xuICAgICAgICAgIGluZGVudGVkID0gaW5kZW50TGluZShjbSwgcmFuZ2UkJDEuaGVhZC5saW5lLCBcInNtYXJ0XCIpO1xuICAgICAgICAgIGJyZWFrXG4gICAgICAgIH0gfVxuICAgIH0gZWxzZSBpZiAobW9kZS5lbGVjdHJpY0lucHV0KSB7XG4gICAgICBpZiAobW9kZS5lbGVjdHJpY0lucHV0LnRlc3QoZ2V0TGluZShjbS5kb2MsIHJhbmdlJCQxLmhlYWQubGluZSkudGV4dC5zbGljZSgwLCByYW5nZSQkMS5oZWFkLmNoKSkpXG4gICAgICAgIHsgaW5kZW50ZWQgPSBpbmRlbnRMaW5lKGNtLCByYW5nZSQkMS5oZWFkLmxpbmUsIFwic21hcnRcIik7IH1cbiAgICB9XG4gICAgaWYgKGluZGVudGVkKSB7IHNpZ25hbExhdGVyKGNtLCBcImVsZWN0cmljSW5wdXRcIiwgY20sIHJhbmdlJCQxLmhlYWQubGluZSk7IH1cbiAgfVxufVxuXG5mdW5jdGlvbiBjb3B5YWJsZVJhbmdlcyhjbSkge1xuICB2YXIgdGV4dCA9IFtdLCByYW5nZXMgPSBbXTtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBjbS5kb2Muc2VsLnJhbmdlcy5sZW5ndGg7IGkrKykge1xuICAgIHZhciBsaW5lID0gY20uZG9jLnNlbC5yYW5nZXNbaV0uaGVhZC5saW5lO1xuICAgIHZhciBsaW5lUmFuZ2UgPSB7YW5jaG9yOiBQb3MobGluZSwgMCksIGhlYWQ6IFBvcyhsaW5lICsgMSwgMCl9O1xuICAgIHJhbmdlcy5wdXNoKGxpbmVSYW5nZSk7XG4gICAgdGV4dC5wdXNoKGNtLmdldFJhbmdlKGxpbmVSYW5nZS5hbmNob3IsIGxpbmVSYW5nZS5oZWFkKSk7XG4gIH1cbiAgcmV0dXJuIHt0ZXh0OiB0ZXh0LCByYW5nZXM6IHJhbmdlc31cbn1cblxuZnVuY3Rpb24gZGlzYWJsZUJyb3dzZXJNYWdpYyhmaWVsZCwgc3BlbGxjaGVjaykge1xuICBmaWVsZC5zZXRBdHRyaWJ1dGUoXCJhdXRvY29ycmVjdFwiLCBcIm9mZlwiKTtcbiAgZmllbGQuc2V0QXR0cmlidXRlKFwiYXV0b2NhcGl0YWxpemVcIiwgXCJvZmZcIik7XG4gIGZpZWxkLnNldEF0dHJpYnV0ZShcInNwZWxsY2hlY2tcIiwgISFzcGVsbGNoZWNrKTtcbn1cblxuZnVuY3Rpb24gaGlkZGVuVGV4dGFyZWEoKSB7XG4gIHZhciB0ZSA9IGVsdChcInRleHRhcmVhXCIsIG51bGwsIG51bGwsIFwicG9zaXRpb246IGFic29sdXRlOyBib3R0b206IC0xZW07IHBhZGRpbmc6IDA7IHdpZHRoOiAxcHg7IGhlaWdodDogMWVtOyBvdXRsaW5lOiBub25lXCIpO1xuICB2YXIgZGl2ID0gZWx0KFwiZGl2XCIsIFt0ZV0sIG51bGwsIFwib3ZlcmZsb3c6IGhpZGRlbjsgcG9zaXRpb246IHJlbGF0aXZlOyB3aWR0aDogM3B4OyBoZWlnaHQ6IDBweDtcIik7XG4gIC8vIFRoZSB0ZXh0YXJlYSBpcyBrZXB0IHBvc2l0aW9uZWQgbmVhciB0aGUgY3Vyc29yIHRvIHByZXZlbnQgdGhlXG4gIC8vIGZhY3QgdGhhdCBpdCdsbCBiZSBzY3JvbGxlZCBpbnRvIHZpZXcgb24gaW5wdXQgZnJvbSBzY3JvbGxpbmdcbiAgLy8gb3VyIGZha2UgY3Vyc29yIG91dCBvZiB2aWV3LiBPbiB3ZWJraXQsIHdoZW4gd3JhcD1vZmYsIHBhc3RlIGlzXG4gIC8vIHZlcnkgc2xvdy4gU28gbWFrZSB0aGUgYXJlYSB3aWRlIGluc3RlYWQuXG4gIGlmICh3ZWJraXQpIHsgdGUuc3R5bGUud2lkdGggPSBcIjEwMDBweFwiOyB9XG4gIGVsc2UgeyB0ZS5zZXRBdHRyaWJ1dGUoXCJ3cmFwXCIsIFwib2ZmXCIpOyB9XG4gIC8vIElmIGJvcmRlcjogMDsgLS0gaU9TIGZhaWxzIHRvIG9wZW4ga2V5Ym9hcmQgKGlzc3VlICMxMjg3KVxuICBpZiAoaW9zKSB7IHRlLnN0eWxlLmJvcmRlciA9IFwiMXB4IHNvbGlkIGJsYWNrXCI7IH1cbiAgZGlzYWJsZUJyb3dzZXJNYWdpYyh0ZSk7XG4gIHJldHVybiBkaXZcbn1cblxuLy8gVGhlIHB1YmxpY2x5IHZpc2libGUgQVBJLiBOb3RlIHRoYXQgbWV0aG9kT3AoZikgbWVhbnNcbi8vICd3cmFwIGYgaW4gYW4gb3BlcmF0aW9uLCBwZXJmb3JtZWQgb24gaXRzIGB0aGlzYCBwYXJhbWV0ZXInLlxuXG4vLyBUaGlzIGlzIG5vdCB0aGUgY29tcGxldGUgc2V0IG9mIGVkaXRvciBtZXRob2RzLiBNb3N0IG9mIHRoZVxuLy8gbWV0aG9kcyBkZWZpbmVkIG9uIHRoZSBEb2MgdHlwZSBhcmUgYWxzbyBpbmplY3RlZCBpbnRvXG4vLyBDb2RlTWlycm9yLnByb3RvdHlwZSwgZm9yIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5IGFuZFxuLy8gY29udmVuaWVuY2UuXG5cbnZhciBhZGRFZGl0b3JNZXRob2RzID0gZnVuY3Rpb24oQ29kZU1pcnJvcikge1xuICB2YXIgb3B0aW9uSGFuZGxlcnMgPSBDb2RlTWlycm9yLm9wdGlvbkhhbmRsZXJzO1xuXG4gIHZhciBoZWxwZXJzID0gQ29kZU1pcnJvci5oZWxwZXJzID0ge307XG5cbiAgQ29kZU1pcnJvci5wcm90b3R5cGUgPSB7XG4gICAgY29uc3RydWN0b3I6IENvZGVNaXJyb3IsXG4gICAgZm9jdXM6IGZ1bmN0aW9uKCl7d2luZG93LmZvY3VzKCk7IHRoaXMuZGlzcGxheS5pbnB1dC5mb2N1cygpO30sXG5cbiAgICBzZXRPcHRpb246IGZ1bmN0aW9uKG9wdGlvbiwgdmFsdWUpIHtcbiAgICAgIHZhciBvcHRpb25zID0gdGhpcy5vcHRpb25zLCBvbGQgPSBvcHRpb25zW29wdGlvbl07XG4gICAgICBpZiAob3B0aW9uc1tvcHRpb25dID09IHZhbHVlICYmIG9wdGlvbiAhPSBcIm1vZGVcIikgeyByZXR1cm4gfVxuICAgICAgb3B0aW9uc1tvcHRpb25dID0gdmFsdWU7XG4gICAgICBpZiAob3B0aW9uSGFuZGxlcnMuaGFzT3duUHJvcGVydHkob3B0aW9uKSlcbiAgICAgICAgeyBvcGVyYXRpb24odGhpcywgb3B0aW9uSGFuZGxlcnNbb3B0aW9uXSkodGhpcywgdmFsdWUsIG9sZCk7IH1cbiAgICAgIHNpZ25hbCh0aGlzLCBcIm9wdGlvbkNoYW5nZVwiLCB0aGlzLCBvcHRpb24pO1xuICAgIH0sXG5cbiAgICBnZXRPcHRpb246IGZ1bmN0aW9uKG9wdGlvbikge3JldHVybiB0aGlzLm9wdGlvbnNbb3B0aW9uXX0sXG4gICAgZ2V0RG9jOiBmdW5jdGlvbigpIHtyZXR1cm4gdGhpcy5kb2N9LFxuXG4gICAgYWRkS2V5TWFwOiBmdW5jdGlvbihtYXAkJDEsIGJvdHRvbSkge1xuICAgICAgdGhpcy5zdGF0ZS5rZXlNYXBzW2JvdHRvbSA/IFwicHVzaFwiIDogXCJ1bnNoaWZ0XCJdKGdldEtleU1hcChtYXAkJDEpKTtcbiAgICB9LFxuICAgIHJlbW92ZUtleU1hcDogZnVuY3Rpb24obWFwJCQxKSB7XG4gICAgICB2YXIgbWFwcyA9IHRoaXMuc3RhdGUua2V5TWFwcztcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbWFwcy5sZW5ndGg7ICsraSlcbiAgICAgICAgeyBpZiAobWFwc1tpXSA9PSBtYXAkJDEgfHwgbWFwc1tpXS5uYW1lID09IG1hcCQkMSkge1xuICAgICAgICAgIG1hcHMuc3BsaWNlKGksIDEpO1xuICAgICAgICAgIHJldHVybiB0cnVlXG4gICAgICAgIH0gfVxuICAgIH0sXG5cbiAgICBhZGRPdmVybGF5OiBtZXRob2RPcChmdW5jdGlvbihzcGVjLCBvcHRpb25zKSB7XG4gICAgICB2YXIgbW9kZSA9IHNwZWMudG9rZW4gPyBzcGVjIDogQ29kZU1pcnJvci5nZXRNb2RlKHRoaXMub3B0aW9ucywgc3BlYyk7XG4gICAgICBpZiAobW9kZS5zdGFydFN0YXRlKSB7IHRocm93IG5ldyBFcnJvcihcIk92ZXJsYXlzIG1heSBub3QgYmUgc3RhdGVmdWwuXCIpIH1cbiAgICAgIGluc2VydFNvcnRlZCh0aGlzLnN0YXRlLm92ZXJsYXlzLFxuICAgICAgICAgICAgICAgICAgIHttb2RlOiBtb2RlLCBtb2RlU3BlYzogc3BlYywgb3BhcXVlOiBvcHRpb25zICYmIG9wdGlvbnMub3BhcXVlLFxuICAgICAgICAgICAgICAgICAgICBwcmlvcml0eTogKG9wdGlvbnMgJiYgb3B0aW9ucy5wcmlvcml0eSkgfHwgMH0sXG4gICAgICAgICAgICAgICAgICAgZnVuY3Rpb24gKG92ZXJsYXkpIHsgcmV0dXJuIG92ZXJsYXkucHJpb3JpdHk7IH0pO1xuICAgICAgdGhpcy5zdGF0ZS5tb2RlR2VuKys7XG4gICAgICByZWdDaGFuZ2UodGhpcyk7XG4gICAgfSksXG4gICAgcmVtb3ZlT3ZlcmxheTogbWV0aG9kT3AoZnVuY3Rpb24oc3BlYykge1xuICAgICAgdmFyIHRoaXMkMSA9IHRoaXM7XG5cbiAgICAgIHZhciBvdmVybGF5cyA9IHRoaXMuc3RhdGUub3ZlcmxheXM7XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG92ZXJsYXlzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgIHZhciBjdXIgPSBvdmVybGF5c1tpXS5tb2RlU3BlYztcbiAgICAgICAgaWYgKGN1ciA9PSBzcGVjIHx8IHR5cGVvZiBzcGVjID09IFwic3RyaW5nXCIgJiYgY3VyLm5hbWUgPT0gc3BlYykge1xuICAgICAgICAgIG92ZXJsYXlzLnNwbGljZShpLCAxKTtcbiAgICAgICAgICB0aGlzJDEuc3RhdGUubW9kZUdlbisrO1xuICAgICAgICAgIHJlZ0NoYW5nZSh0aGlzJDEpO1xuICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSksXG5cbiAgICBpbmRlbnRMaW5lOiBtZXRob2RPcChmdW5jdGlvbihuLCBkaXIsIGFnZ3Jlc3NpdmUpIHtcbiAgICAgIGlmICh0eXBlb2YgZGlyICE9IFwic3RyaW5nXCIgJiYgdHlwZW9mIGRpciAhPSBcIm51bWJlclwiKSB7XG4gICAgICAgIGlmIChkaXIgPT0gbnVsbCkgeyBkaXIgPSB0aGlzLm9wdGlvbnMuc21hcnRJbmRlbnQgPyBcInNtYXJ0XCIgOiBcInByZXZcIjsgfVxuICAgICAgICBlbHNlIHsgZGlyID0gZGlyID8gXCJhZGRcIiA6IFwic3VidHJhY3RcIjsgfVxuICAgICAgfVxuICAgICAgaWYgKGlzTGluZSh0aGlzLmRvYywgbikpIHsgaW5kZW50TGluZSh0aGlzLCBuLCBkaXIsIGFnZ3Jlc3NpdmUpOyB9XG4gICAgfSksXG4gICAgaW5kZW50U2VsZWN0aW9uOiBtZXRob2RPcChmdW5jdGlvbihob3cpIHtcbiAgICAgIHZhciB0aGlzJDEgPSB0aGlzO1xuXG4gICAgICB2YXIgcmFuZ2VzID0gdGhpcy5kb2Muc2VsLnJhbmdlcywgZW5kID0gLTE7XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHJhbmdlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICB2YXIgcmFuZ2UkJDEgPSByYW5nZXNbaV07XG4gICAgICAgIGlmICghcmFuZ2UkJDEuZW1wdHkoKSkge1xuICAgICAgICAgIHZhciBmcm9tID0gcmFuZ2UkJDEuZnJvbSgpLCB0byA9IHJhbmdlJCQxLnRvKCk7XG4gICAgICAgICAgdmFyIHN0YXJ0ID0gTWF0aC5tYXgoZW5kLCBmcm9tLmxpbmUpO1xuICAgICAgICAgIGVuZCA9IE1hdGgubWluKHRoaXMkMS5sYXN0TGluZSgpLCB0by5saW5lIC0gKHRvLmNoID8gMCA6IDEpKSArIDE7XG4gICAgICAgICAgZm9yICh2YXIgaiA9IHN0YXJ0OyBqIDwgZW5kOyArK2opXG4gICAgICAgICAgICB7IGluZGVudExpbmUodGhpcyQxLCBqLCBob3cpOyB9XG4gICAgICAgICAgdmFyIG5ld1JhbmdlcyA9IHRoaXMkMS5kb2Muc2VsLnJhbmdlcztcbiAgICAgICAgICBpZiAoZnJvbS5jaCA9PSAwICYmIHJhbmdlcy5sZW5ndGggPT0gbmV3UmFuZ2VzLmxlbmd0aCAmJiBuZXdSYW5nZXNbaV0uZnJvbSgpLmNoID4gMClcbiAgICAgICAgICAgIHsgcmVwbGFjZU9uZVNlbGVjdGlvbih0aGlzJDEuZG9jLCBpLCBuZXcgUmFuZ2UoZnJvbSwgbmV3UmFuZ2VzW2ldLnRvKCkpLCBzZWxfZG9udFNjcm9sbCk7IH1cbiAgICAgICAgfSBlbHNlIGlmIChyYW5nZSQkMS5oZWFkLmxpbmUgPiBlbmQpIHtcbiAgICAgICAgICBpbmRlbnRMaW5lKHRoaXMkMSwgcmFuZ2UkJDEuaGVhZC5saW5lLCBob3csIHRydWUpO1xuICAgICAgICAgIGVuZCA9IHJhbmdlJCQxLmhlYWQubGluZTtcbiAgICAgICAgICBpZiAoaSA9PSB0aGlzJDEuZG9jLnNlbC5wcmltSW5kZXgpIHsgZW5zdXJlQ3Vyc29yVmlzaWJsZSh0aGlzJDEpOyB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KSxcblxuICAgIC8vIEZldGNoIHRoZSBwYXJzZXIgdG9rZW4gZm9yIGEgZ2l2ZW4gY2hhcmFjdGVyLiBVc2VmdWwgZm9yIGhhY2tzXG4gICAgLy8gdGhhdCB3YW50IHRvIGluc3BlY3QgdGhlIG1vZGUgc3RhdGUgKHNheSwgZm9yIGNvbXBsZXRpb24pLlxuICAgIGdldFRva2VuQXQ6IGZ1bmN0aW9uKHBvcywgcHJlY2lzZSkge1xuICAgICAgcmV0dXJuIHRha2VUb2tlbih0aGlzLCBwb3MsIHByZWNpc2UpXG4gICAgfSxcblxuICAgIGdldExpbmVUb2tlbnM6IGZ1bmN0aW9uKGxpbmUsIHByZWNpc2UpIHtcbiAgICAgIHJldHVybiB0YWtlVG9rZW4odGhpcywgUG9zKGxpbmUpLCBwcmVjaXNlLCB0cnVlKVxuICAgIH0sXG5cbiAgICBnZXRUb2tlblR5cGVBdDogZnVuY3Rpb24ocG9zKSB7XG4gICAgICBwb3MgPSBjbGlwUG9zKHRoaXMuZG9jLCBwb3MpO1xuICAgICAgdmFyIHN0eWxlcyA9IGdldExpbmVTdHlsZXModGhpcywgZ2V0TGluZSh0aGlzLmRvYywgcG9zLmxpbmUpKTtcbiAgICAgIHZhciBiZWZvcmUgPSAwLCBhZnRlciA9IChzdHlsZXMubGVuZ3RoIC0gMSkgLyAyLCBjaCA9IHBvcy5jaDtcbiAgICAgIHZhciB0eXBlO1xuICAgICAgaWYgKGNoID09IDApIHsgdHlwZSA9IHN0eWxlc1syXTsgfVxuICAgICAgZWxzZSB7IGZvciAoOzspIHtcbiAgICAgICAgdmFyIG1pZCA9IChiZWZvcmUgKyBhZnRlcikgPj4gMTtcbiAgICAgICAgaWYgKChtaWQgPyBzdHlsZXNbbWlkICogMiAtIDFdIDogMCkgPj0gY2gpIHsgYWZ0ZXIgPSBtaWQ7IH1cbiAgICAgICAgZWxzZSBpZiAoc3R5bGVzW21pZCAqIDIgKyAxXSA8IGNoKSB7IGJlZm9yZSA9IG1pZCArIDE7IH1cbiAgICAgICAgZWxzZSB7IHR5cGUgPSBzdHlsZXNbbWlkICogMiArIDJdOyBicmVhayB9XG4gICAgICB9IH1cbiAgICAgIHZhciBjdXQgPSB0eXBlID8gdHlwZS5pbmRleE9mKFwib3ZlcmxheSBcIikgOiAtMTtcbiAgICAgIHJldHVybiBjdXQgPCAwID8gdHlwZSA6IGN1dCA9PSAwID8gbnVsbCA6IHR5cGUuc2xpY2UoMCwgY3V0IC0gMSlcbiAgICB9LFxuXG4gICAgZ2V0TW9kZUF0OiBmdW5jdGlvbihwb3MpIHtcbiAgICAgIHZhciBtb2RlID0gdGhpcy5kb2MubW9kZTtcbiAgICAgIGlmICghbW9kZS5pbm5lck1vZGUpIHsgcmV0dXJuIG1vZGUgfVxuICAgICAgcmV0dXJuIENvZGVNaXJyb3IuaW5uZXJNb2RlKG1vZGUsIHRoaXMuZ2V0VG9rZW5BdChwb3MpLnN0YXRlKS5tb2RlXG4gICAgfSxcblxuICAgIGdldEhlbHBlcjogZnVuY3Rpb24ocG9zLCB0eXBlKSB7XG4gICAgICByZXR1cm4gdGhpcy5nZXRIZWxwZXJzKHBvcywgdHlwZSlbMF1cbiAgICB9LFxuXG4gICAgZ2V0SGVscGVyczogZnVuY3Rpb24ocG9zLCB0eXBlKSB7XG4gICAgICB2YXIgdGhpcyQxID0gdGhpcztcblxuICAgICAgdmFyIGZvdW5kID0gW107XG4gICAgICBpZiAoIWhlbHBlcnMuaGFzT3duUHJvcGVydHkodHlwZSkpIHsgcmV0dXJuIGZvdW5kIH1cbiAgICAgIHZhciBoZWxwID0gaGVscGVyc1t0eXBlXSwgbW9kZSA9IHRoaXMuZ2V0TW9kZUF0KHBvcyk7XG4gICAgICBpZiAodHlwZW9mIG1vZGVbdHlwZV0gPT0gXCJzdHJpbmdcIikge1xuICAgICAgICBpZiAoaGVscFttb2RlW3R5cGVdXSkgeyBmb3VuZC5wdXNoKGhlbHBbbW9kZVt0eXBlXV0pOyB9XG4gICAgICB9IGVsc2UgaWYgKG1vZGVbdHlwZV0pIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBtb2RlW3R5cGVdLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgdmFyIHZhbCA9IGhlbHBbbW9kZVt0eXBlXVtpXV07XG4gICAgICAgICAgaWYgKHZhbCkgeyBmb3VuZC5wdXNoKHZhbCk7IH1cbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChtb2RlLmhlbHBlclR5cGUgJiYgaGVscFttb2RlLmhlbHBlclR5cGVdKSB7XG4gICAgICAgIGZvdW5kLnB1c2goaGVscFttb2RlLmhlbHBlclR5cGVdKTtcbiAgICAgIH0gZWxzZSBpZiAoaGVscFttb2RlLm5hbWVdKSB7XG4gICAgICAgIGZvdW5kLnB1c2goaGVscFttb2RlLm5hbWVdKTtcbiAgICAgIH1cbiAgICAgIGZvciAodmFyIGkkMSA9IDA7IGkkMSA8IGhlbHAuX2dsb2JhbC5sZW5ndGg7IGkkMSsrKSB7XG4gICAgICAgIHZhciBjdXIgPSBoZWxwLl9nbG9iYWxbaSQxXTtcbiAgICAgICAgaWYgKGN1ci5wcmVkKG1vZGUsIHRoaXMkMSkgJiYgaW5kZXhPZihmb3VuZCwgY3VyLnZhbCkgPT0gLTEpXG4gICAgICAgICAgeyBmb3VuZC5wdXNoKGN1ci52YWwpOyB9XG4gICAgICB9XG4gICAgICByZXR1cm4gZm91bmRcbiAgICB9LFxuXG4gICAgZ2V0U3RhdGVBZnRlcjogZnVuY3Rpb24obGluZSwgcHJlY2lzZSkge1xuICAgICAgdmFyIGRvYyA9IHRoaXMuZG9jO1xuICAgICAgbGluZSA9IGNsaXBMaW5lKGRvYywgbGluZSA9PSBudWxsID8gZG9jLmZpcnN0ICsgZG9jLnNpemUgLSAxOiBsaW5lKTtcbiAgICAgIHJldHVybiBnZXRDb250ZXh0QmVmb3JlKHRoaXMsIGxpbmUgKyAxLCBwcmVjaXNlKS5zdGF0ZVxuICAgIH0sXG5cbiAgICBjdXJzb3JDb29yZHM6IGZ1bmN0aW9uKHN0YXJ0LCBtb2RlKSB7XG4gICAgICB2YXIgcG9zLCByYW5nZSQkMSA9IHRoaXMuZG9jLnNlbC5wcmltYXJ5KCk7XG4gICAgICBpZiAoc3RhcnQgPT0gbnVsbCkgeyBwb3MgPSByYW5nZSQkMS5oZWFkOyB9XG4gICAgICBlbHNlIGlmICh0eXBlb2Ygc3RhcnQgPT0gXCJvYmplY3RcIikgeyBwb3MgPSBjbGlwUG9zKHRoaXMuZG9jLCBzdGFydCk7IH1cbiAgICAgIGVsc2UgeyBwb3MgPSBzdGFydCA/IHJhbmdlJCQxLmZyb20oKSA6IHJhbmdlJCQxLnRvKCk7IH1cbiAgICAgIHJldHVybiBjdXJzb3JDb29yZHModGhpcywgcG9zLCBtb2RlIHx8IFwicGFnZVwiKVxuICAgIH0sXG5cbiAgICBjaGFyQ29vcmRzOiBmdW5jdGlvbihwb3MsIG1vZGUpIHtcbiAgICAgIHJldHVybiBjaGFyQ29vcmRzKHRoaXMsIGNsaXBQb3ModGhpcy5kb2MsIHBvcyksIG1vZGUgfHwgXCJwYWdlXCIpXG4gICAgfSxcblxuICAgIGNvb3Jkc0NoYXI6IGZ1bmN0aW9uKGNvb3JkcywgbW9kZSkge1xuICAgICAgY29vcmRzID0gZnJvbUNvb3JkU3lzdGVtKHRoaXMsIGNvb3JkcywgbW9kZSB8fCBcInBhZ2VcIik7XG4gICAgICByZXR1cm4gY29vcmRzQ2hhcih0aGlzLCBjb29yZHMubGVmdCwgY29vcmRzLnRvcClcbiAgICB9LFxuXG4gICAgbGluZUF0SGVpZ2h0OiBmdW5jdGlvbihoZWlnaHQsIG1vZGUpIHtcbiAgICAgIGhlaWdodCA9IGZyb21Db29yZFN5c3RlbSh0aGlzLCB7dG9wOiBoZWlnaHQsIGxlZnQ6IDB9LCBtb2RlIHx8IFwicGFnZVwiKS50b3A7XG4gICAgICByZXR1cm4gbGluZUF0SGVpZ2h0KHRoaXMuZG9jLCBoZWlnaHQgKyB0aGlzLmRpc3BsYXkudmlld09mZnNldClcbiAgICB9LFxuICAgIGhlaWdodEF0TGluZTogZnVuY3Rpb24obGluZSwgbW9kZSwgaW5jbHVkZVdpZGdldHMpIHtcbiAgICAgIHZhciBlbmQgPSBmYWxzZSwgbGluZU9iajtcbiAgICAgIGlmICh0eXBlb2YgbGluZSA9PSBcIm51bWJlclwiKSB7XG4gICAgICAgIHZhciBsYXN0ID0gdGhpcy5kb2MuZmlyc3QgKyB0aGlzLmRvYy5zaXplIC0gMTtcbiAgICAgICAgaWYgKGxpbmUgPCB0aGlzLmRvYy5maXJzdCkgeyBsaW5lID0gdGhpcy5kb2MuZmlyc3Q7IH1cbiAgICAgICAgZWxzZSBpZiAobGluZSA+IGxhc3QpIHsgbGluZSA9IGxhc3Q7IGVuZCA9IHRydWU7IH1cbiAgICAgICAgbGluZU9iaiA9IGdldExpbmUodGhpcy5kb2MsIGxpbmUpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbGluZU9iaiA9IGxpbmU7XG4gICAgICB9XG4gICAgICByZXR1cm4gaW50b0Nvb3JkU3lzdGVtKHRoaXMsIGxpbmVPYmosIHt0b3A6IDAsIGxlZnQ6IDB9LCBtb2RlIHx8IFwicGFnZVwiLCBpbmNsdWRlV2lkZ2V0cyB8fCBlbmQpLnRvcCArXG4gICAgICAgIChlbmQgPyB0aGlzLmRvYy5oZWlnaHQgLSBoZWlnaHRBdExpbmUobGluZU9iaikgOiAwKVxuICAgIH0sXG5cbiAgICBkZWZhdWx0VGV4dEhlaWdodDogZnVuY3Rpb24oKSB7IHJldHVybiB0ZXh0SGVpZ2h0KHRoaXMuZGlzcGxheSkgfSxcbiAgICBkZWZhdWx0Q2hhcldpZHRoOiBmdW5jdGlvbigpIHsgcmV0dXJuIGNoYXJXaWR0aCh0aGlzLmRpc3BsYXkpIH0sXG5cbiAgICBnZXRWaWV3cG9ydDogZnVuY3Rpb24oKSB7IHJldHVybiB7ZnJvbTogdGhpcy5kaXNwbGF5LnZpZXdGcm9tLCB0bzogdGhpcy5kaXNwbGF5LnZpZXdUb319LFxuXG4gICAgYWRkV2lkZ2V0OiBmdW5jdGlvbihwb3MsIG5vZGUsIHNjcm9sbCwgdmVydCwgaG9yaXopIHtcbiAgICAgIHZhciBkaXNwbGF5ID0gdGhpcy5kaXNwbGF5O1xuICAgICAgcG9zID0gY3Vyc29yQ29vcmRzKHRoaXMsIGNsaXBQb3ModGhpcy5kb2MsIHBvcykpO1xuICAgICAgdmFyIHRvcCA9IHBvcy5ib3R0b20sIGxlZnQgPSBwb3MubGVmdDtcbiAgICAgIG5vZGUuc3R5bGUucG9zaXRpb24gPSBcImFic29sdXRlXCI7XG4gICAgICBub2RlLnNldEF0dHJpYnV0ZShcImNtLWlnbm9yZS1ldmVudHNcIiwgXCJ0cnVlXCIpO1xuICAgICAgdGhpcy5kaXNwbGF5LmlucHV0LnNldFVuZWRpdGFibGUobm9kZSk7XG4gICAgICBkaXNwbGF5LnNpemVyLmFwcGVuZENoaWxkKG5vZGUpO1xuICAgICAgaWYgKHZlcnQgPT0gXCJvdmVyXCIpIHtcbiAgICAgICAgdG9wID0gcG9zLnRvcDtcbiAgICAgIH0gZWxzZSBpZiAodmVydCA9PSBcImFib3ZlXCIgfHwgdmVydCA9PSBcIm5lYXJcIikge1xuICAgICAgICB2YXIgdnNwYWNlID0gTWF0aC5tYXgoZGlzcGxheS53cmFwcGVyLmNsaWVudEhlaWdodCwgdGhpcy5kb2MuaGVpZ2h0KSxcbiAgICAgICAgaHNwYWNlID0gTWF0aC5tYXgoZGlzcGxheS5zaXplci5jbGllbnRXaWR0aCwgZGlzcGxheS5saW5lU3BhY2UuY2xpZW50V2lkdGgpO1xuICAgICAgICAvLyBEZWZhdWx0IHRvIHBvc2l0aW9uaW5nIGFib3ZlIChpZiBzcGVjaWZpZWQgYW5kIHBvc3NpYmxlKTsgb3RoZXJ3aXNlIGRlZmF1bHQgdG8gcG9zaXRpb25pbmcgYmVsb3dcbiAgICAgICAgaWYgKCh2ZXJ0ID09ICdhYm92ZScgfHwgcG9zLmJvdHRvbSArIG5vZGUub2Zmc2V0SGVpZ2h0ID4gdnNwYWNlKSAmJiBwb3MudG9wID4gbm9kZS5vZmZzZXRIZWlnaHQpXG4gICAgICAgICAgeyB0b3AgPSBwb3MudG9wIC0gbm9kZS5vZmZzZXRIZWlnaHQ7IH1cbiAgICAgICAgZWxzZSBpZiAocG9zLmJvdHRvbSArIG5vZGUub2Zmc2V0SGVpZ2h0IDw9IHZzcGFjZSlcbiAgICAgICAgICB7IHRvcCA9IHBvcy5ib3R0b207IH1cbiAgICAgICAgaWYgKGxlZnQgKyBub2RlLm9mZnNldFdpZHRoID4gaHNwYWNlKVxuICAgICAgICAgIHsgbGVmdCA9IGhzcGFjZSAtIG5vZGUub2Zmc2V0V2lkdGg7IH1cbiAgICAgIH1cbiAgICAgIG5vZGUuc3R5bGUudG9wID0gdG9wICsgXCJweFwiO1xuICAgICAgbm9kZS5zdHlsZS5sZWZ0ID0gbm9kZS5zdHlsZS5yaWdodCA9IFwiXCI7XG4gICAgICBpZiAoaG9yaXogPT0gXCJyaWdodFwiKSB7XG4gICAgICAgIGxlZnQgPSBkaXNwbGF5LnNpemVyLmNsaWVudFdpZHRoIC0gbm9kZS5vZmZzZXRXaWR0aDtcbiAgICAgICAgbm9kZS5zdHlsZS5yaWdodCA9IFwiMHB4XCI7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAoaG9yaXogPT0gXCJsZWZ0XCIpIHsgbGVmdCA9IDA7IH1cbiAgICAgICAgZWxzZSBpZiAoaG9yaXogPT0gXCJtaWRkbGVcIikgeyBsZWZ0ID0gKGRpc3BsYXkuc2l6ZXIuY2xpZW50V2lkdGggLSBub2RlLm9mZnNldFdpZHRoKSAvIDI7IH1cbiAgICAgICAgbm9kZS5zdHlsZS5sZWZ0ID0gbGVmdCArIFwicHhcIjtcbiAgICAgIH1cbiAgICAgIGlmIChzY3JvbGwpXG4gICAgICAgIHsgc2Nyb2xsSW50b1ZpZXcodGhpcywge2xlZnQ6IGxlZnQsIHRvcDogdG9wLCByaWdodDogbGVmdCArIG5vZGUub2Zmc2V0V2lkdGgsIGJvdHRvbTogdG9wICsgbm9kZS5vZmZzZXRIZWlnaHR9KTsgfVxuICAgIH0sXG5cbiAgICB0cmlnZ2VyT25LZXlEb3duOiBtZXRob2RPcChvbktleURvd24pLFxuICAgIHRyaWdnZXJPbktleVByZXNzOiBtZXRob2RPcChvbktleVByZXNzKSxcbiAgICB0cmlnZ2VyT25LZXlVcDogb25LZXlVcCxcbiAgICB0cmlnZ2VyT25Nb3VzZURvd246IG1ldGhvZE9wKG9uTW91c2VEb3duKSxcblxuICAgIGV4ZWNDb21tYW5kOiBmdW5jdGlvbihjbWQpIHtcbiAgICAgIGlmIChjb21tYW5kcy5oYXNPd25Qcm9wZXJ0eShjbWQpKVxuICAgICAgICB7IHJldHVybiBjb21tYW5kc1tjbWRdLmNhbGwobnVsbCwgdGhpcykgfVxuICAgIH0sXG5cbiAgICB0cmlnZ2VyRWxlY3RyaWM6IG1ldGhvZE9wKGZ1bmN0aW9uKHRleHQpIHsgdHJpZ2dlckVsZWN0cmljKHRoaXMsIHRleHQpOyB9KSxcblxuICAgIGZpbmRQb3NIOiBmdW5jdGlvbihmcm9tLCBhbW91bnQsIHVuaXQsIHZpc3VhbGx5KSB7XG4gICAgICB2YXIgdGhpcyQxID0gdGhpcztcblxuICAgICAgdmFyIGRpciA9IDE7XG4gICAgICBpZiAoYW1vdW50IDwgMCkgeyBkaXIgPSAtMTsgYW1vdW50ID0gLWFtb3VudDsgfVxuICAgICAgdmFyIGN1ciA9IGNsaXBQb3ModGhpcy5kb2MsIGZyb20pO1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhbW91bnQ7ICsraSkge1xuICAgICAgICBjdXIgPSBmaW5kUG9zSCh0aGlzJDEuZG9jLCBjdXIsIGRpciwgdW5pdCwgdmlzdWFsbHkpO1xuICAgICAgICBpZiAoY3VyLmhpdFNpZGUpIHsgYnJlYWsgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIGN1clxuICAgIH0sXG5cbiAgICBtb3ZlSDogbWV0aG9kT3AoZnVuY3Rpb24oZGlyLCB1bml0KSB7XG4gICAgICB2YXIgdGhpcyQxID0gdGhpcztcblxuICAgICAgdGhpcy5leHRlbmRTZWxlY3Rpb25zQnkoZnVuY3Rpb24gKHJhbmdlJCQxKSB7XG4gICAgICAgIGlmICh0aGlzJDEuZGlzcGxheS5zaGlmdCB8fCB0aGlzJDEuZG9jLmV4dGVuZCB8fCByYW5nZSQkMS5lbXB0eSgpKVxuICAgICAgICAgIHsgcmV0dXJuIGZpbmRQb3NIKHRoaXMkMS5kb2MsIHJhbmdlJCQxLmhlYWQsIGRpciwgdW5pdCwgdGhpcyQxLm9wdGlvbnMucnRsTW92ZVZpc3VhbGx5KSB9XG4gICAgICAgIGVsc2VcbiAgICAgICAgICB7IHJldHVybiBkaXIgPCAwID8gcmFuZ2UkJDEuZnJvbSgpIDogcmFuZ2UkJDEudG8oKSB9XG4gICAgICB9LCBzZWxfbW92ZSk7XG4gICAgfSksXG5cbiAgICBkZWxldGVIOiBtZXRob2RPcChmdW5jdGlvbihkaXIsIHVuaXQpIHtcbiAgICAgIHZhciBzZWwgPSB0aGlzLmRvYy5zZWwsIGRvYyA9IHRoaXMuZG9jO1xuICAgICAgaWYgKHNlbC5zb21ldGhpbmdTZWxlY3RlZCgpKVxuICAgICAgICB7IGRvYy5yZXBsYWNlU2VsZWN0aW9uKFwiXCIsIG51bGwsIFwiK2RlbGV0ZVwiKTsgfVxuICAgICAgZWxzZVxuICAgICAgICB7IGRlbGV0ZU5lYXJTZWxlY3Rpb24odGhpcywgZnVuY3Rpb24gKHJhbmdlJCQxKSB7XG4gICAgICAgICAgdmFyIG90aGVyID0gZmluZFBvc0goZG9jLCByYW5nZSQkMS5oZWFkLCBkaXIsIHVuaXQsIGZhbHNlKTtcbiAgICAgICAgICByZXR1cm4gZGlyIDwgMCA/IHtmcm9tOiBvdGhlciwgdG86IHJhbmdlJCQxLmhlYWR9IDoge2Zyb206IHJhbmdlJCQxLmhlYWQsIHRvOiBvdGhlcn1cbiAgICAgICAgfSk7IH1cbiAgICB9KSxcblxuICAgIGZpbmRQb3NWOiBmdW5jdGlvbihmcm9tLCBhbW91bnQsIHVuaXQsIGdvYWxDb2x1bW4pIHtcbiAgICAgIHZhciB0aGlzJDEgPSB0aGlzO1xuXG4gICAgICB2YXIgZGlyID0gMSwgeCA9IGdvYWxDb2x1bW47XG4gICAgICBpZiAoYW1vdW50IDwgMCkgeyBkaXIgPSAtMTsgYW1vdW50ID0gLWFtb3VudDsgfVxuICAgICAgdmFyIGN1ciA9IGNsaXBQb3ModGhpcy5kb2MsIGZyb20pO1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhbW91bnQ7ICsraSkge1xuICAgICAgICB2YXIgY29vcmRzID0gY3Vyc29yQ29vcmRzKHRoaXMkMSwgY3VyLCBcImRpdlwiKTtcbiAgICAgICAgaWYgKHggPT0gbnVsbCkgeyB4ID0gY29vcmRzLmxlZnQ7IH1cbiAgICAgICAgZWxzZSB7IGNvb3Jkcy5sZWZ0ID0geDsgfVxuICAgICAgICBjdXIgPSBmaW5kUG9zVih0aGlzJDEsIGNvb3JkcywgZGlyLCB1bml0KTtcbiAgICAgICAgaWYgKGN1ci5oaXRTaWRlKSB7IGJyZWFrIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiBjdXJcbiAgICB9LFxuXG4gICAgbW92ZVY6IG1ldGhvZE9wKGZ1bmN0aW9uKGRpciwgdW5pdCkge1xuICAgICAgdmFyIHRoaXMkMSA9IHRoaXM7XG5cbiAgICAgIHZhciBkb2MgPSB0aGlzLmRvYywgZ29hbHMgPSBbXTtcbiAgICAgIHZhciBjb2xsYXBzZSA9ICF0aGlzLmRpc3BsYXkuc2hpZnQgJiYgIWRvYy5leHRlbmQgJiYgZG9jLnNlbC5zb21ldGhpbmdTZWxlY3RlZCgpO1xuICAgICAgZG9jLmV4dGVuZFNlbGVjdGlvbnNCeShmdW5jdGlvbiAocmFuZ2UkJDEpIHtcbiAgICAgICAgaWYgKGNvbGxhcHNlKVxuICAgICAgICAgIHsgcmV0dXJuIGRpciA8IDAgPyByYW5nZSQkMS5mcm9tKCkgOiByYW5nZSQkMS50bygpIH1cbiAgICAgICAgdmFyIGhlYWRQb3MgPSBjdXJzb3JDb29yZHModGhpcyQxLCByYW5nZSQkMS5oZWFkLCBcImRpdlwiKTtcbiAgICAgICAgaWYgKHJhbmdlJCQxLmdvYWxDb2x1bW4gIT0gbnVsbCkgeyBoZWFkUG9zLmxlZnQgPSByYW5nZSQkMS5nb2FsQ29sdW1uOyB9XG4gICAgICAgIGdvYWxzLnB1c2goaGVhZFBvcy5sZWZ0KTtcbiAgICAgICAgdmFyIHBvcyA9IGZpbmRQb3NWKHRoaXMkMSwgaGVhZFBvcywgZGlyLCB1bml0KTtcbiAgICAgICAgaWYgKHVuaXQgPT0gXCJwYWdlXCIgJiYgcmFuZ2UkJDEgPT0gZG9jLnNlbC5wcmltYXJ5KCkpXG4gICAgICAgICAgeyBhZGRUb1Njcm9sbFRvcCh0aGlzJDEsIGNoYXJDb29yZHModGhpcyQxLCBwb3MsIFwiZGl2XCIpLnRvcCAtIGhlYWRQb3MudG9wKTsgfVxuICAgICAgICByZXR1cm4gcG9zXG4gICAgICB9LCBzZWxfbW92ZSk7XG4gICAgICBpZiAoZ29hbHMubGVuZ3RoKSB7IGZvciAodmFyIGkgPSAwOyBpIDwgZG9jLnNlbC5yYW5nZXMubGVuZ3RoOyBpKyspXG4gICAgICAgIHsgZG9jLnNlbC5yYW5nZXNbaV0uZ29hbENvbHVtbiA9IGdvYWxzW2ldOyB9IH1cbiAgICB9KSxcblxuICAgIC8vIEZpbmQgdGhlIHdvcmQgYXQgdGhlIGdpdmVuIHBvc2l0aW9uIChhcyByZXR1cm5lZCBieSBjb29yZHNDaGFyKS5cbiAgICBmaW5kV29yZEF0OiBmdW5jdGlvbihwb3MpIHtcbiAgICAgIHZhciBkb2MgPSB0aGlzLmRvYywgbGluZSA9IGdldExpbmUoZG9jLCBwb3MubGluZSkudGV4dDtcbiAgICAgIHZhciBzdGFydCA9IHBvcy5jaCwgZW5kID0gcG9zLmNoO1xuICAgICAgaWYgKGxpbmUpIHtcbiAgICAgICAgdmFyIGhlbHBlciA9IHRoaXMuZ2V0SGVscGVyKHBvcywgXCJ3b3JkQ2hhcnNcIik7XG4gICAgICAgIGlmICgocG9zLnN0aWNreSA9PSBcImJlZm9yZVwiIHx8IGVuZCA9PSBsaW5lLmxlbmd0aCkgJiYgc3RhcnQpIHsgLS1zdGFydDsgfSBlbHNlIHsgKytlbmQ7IH1cbiAgICAgICAgdmFyIHN0YXJ0Q2hhciA9IGxpbmUuY2hhckF0KHN0YXJ0KTtcbiAgICAgICAgdmFyIGNoZWNrID0gaXNXb3JkQ2hhcihzdGFydENoYXIsIGhlbHBlcilcbiAgICAgICAgICA/IGZ1bmN0aW9uIChjaCkgeyByZXR1cm4gaXNXb3JkQ2hhcihjaCwgaGVscGVyKTsgfVxuICAgICAgICAgIDogL1xccy8udGVzdChzdGFydENoYXIpID8gZnVuY3Rpb24gKGNoKSB7IHJldHVybiAvXFxzLy50ZXN0KGNoKTsgfVxuICAgICAgICAgIDogZnVuY3Rpb24gKGNoKSB7IHJldHVybiAoIS9cXHMvLnRlc3QoY2gpICYmICFpc1dvcmRDaGFyKGNoKSk7IH07XG4gICAgICAgIHdoaWxlIChzdGFydCA+IDAgJiYgY2hlY2sobGluZS5jaGFyQXQoc3RhcnQgLSAxKSkpIHsgLS1zdGFydDsgfVxuICAgICAgICB3aGlsZSAoZW5kIDwgbGluZS5sZW5ndGggJiYgY2hlY2sobGluZS5jaGFyQXQoZW5kKSkpIHsgKytlbmQ7IH1cbiAgICAgIH1cbiAgICAgIHJldHVybiBuZXcgUmFuZ2UoUG9zKHBvcy5saW5lLCBzdGFydCksIFBvcyhwb3MubGluZSwgZW5kKSlcbiAgICB9LFxuXG4gICAgdG9nZ2xlT3ZlcndyaXRlOiBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgaWYgKHZhbHVlICE9IG51bGwgJiYgdmFsdWUgPT0gdGhpcy5zdGF0ZS5vdmVyd3JpdGUpIHsgcmV0dXJuIH1cbiAgICAgIGlmICh0aGlzLnN0YXRlLm92ZXJ3cml0ZSA9ICF0aGlzLnN0YXRlLm92ZXJ3cml0ZSlcbiAgICAgICAgeyBhZGRDbGFzcyh0aGlzLmRpc3BsYXkuY3Vyc29yRGl2LCBcIkNvZGVNaXJyb3Itb3ZlcndyaXRlXCIpOyB9XG4gICAgICBlbHNlXG4gICAgICAgIHsgcm1DbGFzcyh0aGlzLmRpc3BsYXkuY3Vyc29yRGl2LCBcIkNvZGVNaXJyb3Itb3ZlcndyaXRlXCIpOyB9XG5cbiAgICAgIHNpZ25hbCh0aGlzLCBcIm92ZXJ3cml0ZVRvZ2dsZVwiLCB0aGlzLCB0aGlzLnN0YXRlLm92ZXJ3cml0ZSk7XG4gICAgfSxcbiAgICBoYXNGb2N1czogZnVuY3Rpb24oKSB7IHJldHVybiB0aGlzLmRpc3BsYXkuaW5wdXQuZ2V0RmllbGQoKSA9PSBhY3RpdmVFbHQoKSB9LFxuICAgIGlzUmVhZE9ubHk6IGZ1bmN0aW9uKCkgeyByZXR1cm4gISEodGhpcy5vcHRpb25zLnJlYWRPbmx5IHx8IHRoaXMuZG9jLmNhbnRFZGl0KSB9LFxuXG4gICAgc2Nyb2xsVG86IG1ldGhvZE9wKGZ1bmN0aW9uICh4LCB5KSB7IHNjcm9sbFRvQ29vcmRzKHRoaXMsIHgsIHkpOyB9KSxcbiAgICBnZXRTY3JvbGxJbmZvOiBmdW5jdGlvbigpIHtcbiAgICAgIHZhciBzY3JvbGxlciA9IHRoaXMuZGlzcGxheS5zY3JvbGxlcjtcbiAgICAgIHJldHVybiB7bGVmdDogc2Nyb2xsZXIuc2Nyb2xsTGVmdCwgdG9wOiBzY3JvbGxlci5zY3JvbGxUb3AsXG4gICAgICAgICAgICAgIGhlaWdodDogc2Nyb2xsZXIuc2Nyb2xsSGVpZ2h0IC0gc2Nyb2xsR2FwKHRoaXMpIC0gdGhpcy5kaXNwbGF5LmJhckhlaWdodCxcbiAgICAgICAgICAgICAgd2lkdGg6IHNjcm9sbGVyLnNjcm9sbFdpZHRoIC0gc2Nyb2xsR2FwKHRoaXMpIC0gdGhpcy5kaXNwbGF5LmJhcldpZHRoLFxuICAgICAgICAgICAgICBjbGllbnRIZWlnaHQ6IGRpc3BsYXlIZWlnaHQodGhpcyksIGNsaWVudFdpZHRoOiBkaXNwbGF5V2lkdGgodGhpcyl9XG4gICAgfSxcblxuICAgIHNjcm9sbEludG9WaWV3OiBtZXRob2RPcChmdW5jdGlvbihyYW5nZSQkMSwgbWFyZ2luKSB7XG4gICAgICBpZiAocmFuZ2UkJDEgPT0gbnVsbCkge1xuICAgICAgICByYW5nZSQkMSA9IHtmcm9tOiB0aGlzLmRvYy5zZWwucHJpbWFyeSgpLmhlYWQsIHRvOiBudWxsfTtcbiAgICAgICAgaWYgKG1hcmdpbiA9PSBudWxsKSB7IG1hcmdpbiA9IHRoaXMub3B0aW9ucy5jdXJzb3JTY3JvbGxNYXJnaW47IH1cbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIHJhbmdlJCQxID09IFwibnVtYmVyXCIpIHtcbiAgICAgICAgcmFuZ2UkJDEgPSB7ZnJvbTogUG9zKHJhbmdlJCQxLCAwKSwgdG86IG51bGx9O1xuICAgICAgfSBlbHNlIGlmIChyYW5nZSQkMS5mcm9tID09IG51bGwpIHtcbiAgICAgICAgcmFuZ2UkJDEgPSB7ZnJvbTogcmFuZ2UkJDEsIHRvOiBudWxsfTtcbiAgICAgIH1cbiAgICAgIGlmICghcmFuZ2UkJDEudG8pIHsgcmFuZ2UkJDEudG8gPSByYW5nZSQkMS5mcm9tOyB9XG4gICAgICByYW5nZSQkMS5tYXJnaW4gPSBtYXJnaW4gfHwgMDtcblxuICAgICAgaWYgKHJhbmdlJCQxLmZyb20ubGluZSAhPSBudWxsKSB7XG4gICAgICAgIHNjcm9sbFRvUmFuZ2UodGhpcywgcmFuZ2UkJDEpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc2Nyb2xsVG9Db29yZHNSYW5nZSh0aGlzLCByYW5nZSQkMS5mcm9tLCByYW5nZSQkMS50bywgcmFuZ2UkJDEubWFyZ2luKTtcbiAgICAgIH1cbiAgICB9KSxcblxuICAgIHNldFNpemU6IG1ldGhvZE9wKGZ1bmN0aW9uKHdpZHRoLCBoZWlnaHQpIHtcbiAgICAgIHZhciB0aGlzJDEgPSB0aGlzO1xuXG4gICAgICB2YXIgaW50ZXJwcmV0ID0gZnVuY3Rpb24gKHZhbCkgeyByZXR1cm4gdHlwZW9mIHZhbCA9PSBcIm51bWJlclwiIHx8IC9eXFxkKyQvLnRlc3QoU3RyaW5nKHZhbCkpID8gdmFsICsgXCJweFwiIDogdmFsOyB9O1xuICAgICAgaWYgKHdpZHRoICE9IG51bGwpIHsgdGhpcy5kaXNwbGF5LndyYXBwZXIuc3R5bGUud2lkdGggPSBpbnRlcnByZXQod2lkdGgpOyB9XG4gICAgICBpZiAoaGVpZ2h0ICE9IG51bGwpIHsgdGhpcy5kaXNwbGF5LndyYXBwZXIuc3R5bGUuaGVpZ2h0ID0gaW50ZXJwcmV0KGhlaWdodCk7IH1cbiAgICAgIGlmICh0aGlzLm9wdGlvbnMubGluZVdyYXBwaW5nKSB7IGNsZWFyTGluZU1lYXN1cmVtZW50Q2FjaGUodGhpcyk7IH1cbiAgICAgIHZhciBsaW5lTm8kJDEgPSB0aGlzLmRpc3BsYXkudmlld0Zyb207XG4gICAgICB0aGlzLmRvYy5pdGVyKGxpbmVObyQkMSwgdGhpcy5kaXNwbGF5LnZpZXdUbywgZnVuY3Rpb24gKGxpbmUpIHtcbiAgICAgICAgaWYgKGxpbmUud2lkZ2V0cykgeyBmb3IgKHZhciBpID0gMDsgaSA8IGxpbmUud2lkZ2V0cy5sZW5ndGg7IGkrKylcbiAgICAgICAgICB7IGlmIChsaW5lLndpZGdldHNbaV0ubm9IU2Nyb2xsKSB7IHJlZ0xpbmVDaGFuZ2UodGhpcyQxLCBsaW5lTm8kJDEsIFwid2lkZ2V0XCIpOyBicmVhayB9IH0gfVxuICAgICAgICArK2xpbmVObyQkMTtcbiAgICAgIH0pO1xuICAgICAgdGhpcy5jdXJPcC5mb3JjZVVwZGF0ZSA9IHRydWU7XG4gICAgICBzaWduYWwodGhpcywgXCJyZWZyZXNoXCIsIHRoaXMpO1xuICAgIH0pLFxuXG4gICAgb3BlcmF0aW9uOiBmdW5jdGlvbihmKXtyZXR1cm4gcnVuSW5PcCh0aGlzLCBmKX0sXG4gICAgc3RhcnRPcGVyYXRpb246IGZ1bmN0aW9uKCl7cmV0dXJuIHN0YXJ0T3BlcmF0aW9uKHRoaXMpfSxcbiAgICBlbmRPcGVyYXRpb246IGZ1bmN0aW9uKCl7cmV0dXJuIGVuZE9wZXJhdGlvbih0aGlzKX0sXG5cbiAgICByZWZyZXNoOiBtZXRob2RPcChmdW5jdGlvbigpIHtcbiAgICAgIHZhciBvbGRIZWlnaHQgPSB0aGlzLmRpc3BsYXkuY2FjaGVkVGV4dEhlaWdodDtcbiAgICAgIHJlZ0NoYW5nZSh0aGlzKTtcbiAgICAgIHRoaXMuY3VyT3AuZm9yY2VVcGRhdGUgPSB0cnVlO1xuICAgICAgY2xlYXJDYWNoZXModGhpcyk7XG4gICAgICBzY3JvbGxUb0Nvb3Jkcyh0aGlzLCB0aGlzLmRvYy5zY3JvbGxMZWZ0LCB0aGlzLmRvYy5zY3JvbGxUb3ApO1xuICAgICAgdXBkYXRlR3V0dGVyU3BhY2UodGhpcyk7XG4gICAgICBpZiAob2xkSGVpZ2h0ID09IG51bGwgfHwgTWF0aC5hYnMob2xkSGVpZ2h0IC0gdGV4dEhlaWdodCh0aGlzLmRpc3BsYXkpKSA+IC41KVxuICAgICAgICB7IGVzdGltYXRlTGluZUhlaWdodHModGhpcyk7IH1cbiAgICAgIHNpZ25hbCh0aGlzLCBcInJlZnJlc2hcIiwgdGhpcyk7XG4gICAgfSksXG5cbiAgICBzd2FwRG9jOiBtZXRob2RPcChmdW5jdGlvbihkb2MpIHtcbiAgICAgIHZhciBvbGQgPSB0aGlzLmRvYztcbiAgICAgIG9sZC5jbSA9IG51bGw7XG4gICAgICBhdHRhY2hEb2ModGhpcywgZG9jKTtcbiAgICAgIGNsZWFyQ2FjaGVzKHRoaXMpO1xuICAgICAgdGhpcy5kaXNwbGF5LmlucHV0LnJlc2V0KCk7XG4gICAgICBzY3JvbGxUb0Nvb3Jkcyh0aGlzLCBkb2Muc2Nyb2xsTGVmdCwgZG9jLnNjcm9sbFRvcCk7XG4gICAgICB0aGlzLmN1ck9wLmZvcmNlU2Nyb2xsID0gdHJ1ZTtcbiAgICAgIHNpZ25hbExhdGVyKHRoaXMsIFwic3dhcERvY1wiLCB0aGlzLCBvbGQpO1xuICAgICAgcmV0dXJuIG9sZFxuICAgIH0pLFxuXG4gICAgZ2V0SW5wdXRGaWVsZDogZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5kaXNwbGF5LmlucHV0LmdldEZpZWxkKCl9LFxuICAgIGdldFdyYXBwZXJFbGVtZW50OiBmdW5jdGlvbigpe3JldHVybiB0aGlzLmRpc3BsYXkud3JhcHBlcn0sXG4gICAgZ2V0U2Nyb2xsZXJFbGVtZW50OiBmdW5jdGlvbigpe3JldHVybiB0aGlzLmRpc3BsYXkuc2Nyb2xsZXJ9LFxuICAgIGdldEd1dHRlckVsZW1lbnQ6IGZ1bmN0aW9uKCl7cmV0dXJuIHRoaXMuZGlzcGxheS5ndXR0ZXJzfVxuICB9O1xuICBldmVudE1peGluKENvZGVNaXJyb3IpO1xuXG4gIENvZGVNaXJyb3IucmVnaXN0ZXJIZWxwZXIgPSBmdW5jdGlvbih0eXBlLCBuYW1lLCB2YWx1ZSkge1xuICAgIGlmICghaGVscGVycy5oYXNPd25Qcm9wZXJ0eSh0eXBlKSkgeyBoZWxwZXJzW3R5cGVdID0gQ29kZU1pcnJvclt0eXBlXSA9IHtfZ2xvYmFsOiBbXX07IH1cbiAgICBoZWxwZXJzW3R5cGVdW25hbWVdID0gdmFsdWU7XG4gIH07XG4gIENvZGVNaXJyb3IucmVnaXN0ZXJHbG9iYWxIZWxwZXIgPSBmdW5jdGlvbih0eXBlLCBuYW1lLCBwcmVkaWNhdGUsIHZhbHVlKSB7XG4gICAgQ29kZU1pcnJvci5yZWdpc3RlckhlbHBlcih0eXBlLCBuYW1lLCB2YWx1ZSk7XG4gICAgaGVscGVyc1t0eXBlXS5fZ2xvYmFsLnB1c2goe3ByZWQ6IHByZWRpY2F0ZSwgdmFsOiB2YWx1ZX0pO1xuICB9O1xufTtcblxuLy8gVXNlZCBmb3IgaG9yaXpvbnRhbCByZWxhdGl2ZSBtb3Rpb24uIERpciBpcyAtMSBvciAxIChsZWZ0IG9yXG4vLyByaWdodCksIHVuaXQgY2FuIGJlIFwiY2hhclwiLCBcImNvbHVtblwiIChsaWtlIGNoYXIsIGJ1dCBkb2Vzbid0XG4vLyBjcm9zcyBsaW5lIGJvdW5kYXJpZXMpLCBcIndvcmRcIiAoYWNyb3NzIG5leHQgd29yZCksIG9yIFwiZ3JvdXBcIiAodG9cbi8vIHRoZSBzdGFydCBvZiBuZXh0IGdyb3VwIG9mIHdvcmQgb3Igbm9uLXdvcmQtbm9uLXdoaXRlc3BhY2Vcbi8vIGNoYXJzKS4gVGhlIHZpc3VhbGx5IHBhcmFtIGNvbnRyb2xzIHdoZXRoZXIsIGluIHJpZ2h0LXRvLWxlZnRcbi8vIHRleHQsIGRpcmVjdGlvbiAxIG1lYW5zIHRvIG1vdmUgdG93YXJkcyB0aGUgbmV4dCBpbmRleCBpbiB0aGVcbi8vIHN0cmluZywgb3IgdG93YXJkcyB0aGUgY2hhcmFjdGVyIHRvIHRoZSByaWdodCBvZiB0aGUgY3VycmVudFxuLy8gcG9zaXRpb24uIFRoZSByZXN1bHRpbmcgcG9zaXRpb24gd2lsbCBoYXZlIGEgaGl0U2lkZT10cnVlXG4vLyBwcm9wZXJ0eSBpZiBpdCByZWFjaGVkIHRoZSBlbmQgb2YgdGhlIGRvY3VtZW50LlxuZnVuY3Rpb24gZmluZFBvc0goZG9jLCBwb3MsIGRpciwgdW5pdCwgdmlzdWFsbHkpIHtcbiAgdmFyIG9sZFBvcyA9IHBvcztcbiAgdmFyIG9yaWdEaXIgPSBkaXI7XG4gIHZhciBsaW5lT2JqID0gZ2V0TGluZShkb2MsIHBvcy5saW5lKTtcbiAgZnVuY3Rpb24gZmluZE5leHRMaW5lKCkge1xuICAgIHZhciBsID0gcG9zLmxpbmUgKyBkaXI7XG4gICAgaWYgKGwgPCBkb2MuZmlyc3QgfHwgbCA+PSBkb2MuZmlyc3QgKyBkb2Muc2l6ZSkgeyByZXR1cm4gZmFsc2UgfVxuICAgIHBvcyA9IG5ldyBQb3MobCwgcG9zLmNoLCBwb3Muc3RpY2t5KTtcbiAgICByZXR1cm4gbGluZU9iaiA9IGdldExpbmUoZG9jLCBsKVxuICB9XG4gIGZ1bmN0aW9uIG1vdmVPbmNlKGJvdW5kVG9MaW5lKSB7XG4gICAgdmFyIG5leHQ7XG4gICAgaWYgKHZpc3VhbGx5KSB7XG4gICAgICBuZXh0ID0gbW92ZVZpc3VhbGx5KGRvYy5jbSwgbGluZU9iaiwgcG9zLCBkaXIpO1xuICAgIH0gZWxzZSB7XG4gICAgICBuZXh0ID0gbW92ZUxvZ2ljYWxseShsaW5lT2JqLCBwb3MsIGRpcik7XG4gICAgfVxuICAgIGlmIChuZXh0ID09IG51bGwpIHtcbiAgICAgIGlmICghYm91bmRUb0xpbmUgJiYgZmluZE5leHRMaW5lKCkpXG4gICAgICAgIHsgcG9zID0gZW5kT2ZMaW5lKHZpc3VhbGx5LCBkb2MuY20sIGxpbmVPYmosIHBvcy5saW5lLCBkaXIpOyB9XG4gICAgICBlbHNlXG4gICAgICAgIHsgcmV0dXJuIGZhbHNlIH1cbiAgICB9IGVsc2Uge1xuICAgICAgcG9zID0gbmV4dDtcbiAgICB9XG4gICAgcmV0dXJuIHRydWVcbiAgfVxuXG4gIGlmICh1bml0ID09IFwiY2hhclwiKSB7XG4gICAgbW92ZU9uY2UoKTtcbiAgfSBlbHNlIGlmICh1bml0ID09IFwiY29sdW1uXCIpIHtcbiAgICBtb3ZlT25jZSh0cnVlKTtcbiAgfSBlbHNlIGlmICh1bml0ID09IFwid29yZFwiIHx8IHVuaXQgPT0gXCJncm91cFwiKSB7XG4gICAgdmFyIHNhd1R5cGUgPSBudWxsLCBncm91cCA9IHVuaXQgPT0gXCJncm91cFwiO1xuICAgIHZhciBoZWxwZXIgPSBkb2MuY20gJiYgZG9jLmNtLmdldEhlbHBlcihwb3MsIFwid29yZENoYXJzXCIpO1xuICAgIGZvciAodmFyIGZpcnN0ID0gdHJ1ZTs7IGZpcnN0ID0gZmFsc2UpIHtcbiAgICAgIGlmIChkaXIgPCAwICYmICFtb3ZlT25jZSghZmlyc3QpKSB7IGJyZWFrIH1cbiAgICAgIHZhciBjdXIgPSBsaW5lT2JqLnRleHQuY2hhckF0KHBvcy5jaCkgfHwgXCJcXG5cIjtcbiAgICAgIHZhciB0eXBlID0gaXNXb3JkQ2hhcihjdXIsIGhlbHBlcikgPyBcIndcIlxuICAgICAgICA6IGdyb3VwICYmIGN1ciA9PSBcIlxcblwiID8gXCJuXCJcbiAgICAgICAgOiAhZ3JvdXAgfHwgL1xccy8udGVzdChjdXIpID8gbnVsbFxuICAgICAgICA6IFwicFwiO1xuICAgICAgaWYgKGdyb3VwICYmICFmaXJzdCAmJiAhdHlwZSkgeyB0eXBlID0gXCJzXCI7IH1cbiAgICAgIGlmIChzYXdUeXBlICYmIHNhd1R5cGUgIT0gdHlwZSkge1xuICAgICAgICBpZiAoZGlyIDwgMCkge2RpciA9IDE7IG1vdmVPbmNlKCk7IHBvcy5zdGlja3kgPSBcImFmdGVyXCI7fVxuICAgICAgICBicmVha1xuICAgICAgfVxuXG4gICAgICBpZiAodHlwZSkgeyBzYXdUeXBlID0gdHlwZTsgfVxuICAgICAgaWYgKGRpciA+IDAgJiYgIW1vdmVPbmNlKCFmaXJzdCkpIHsgYnJlYWsgfVxuICAgIH1cbiAgfVxuICB2YXIgcmVzdWx0ID0gc2tpcEF0b21pYyhkb2MsIHBvcywgb2xkUG9zLCBvcmlnRGlyLCB0cnVlKTtcbiAgaWYgKGVxdWFsQ3Vyc29yUG9zKG9sZFBvcywgcmVzdWx0KSkgeyByZXN1bHQuaGl0U2lkZSA9IHRydWU7IH1cbiAgcmV0dXJuIHJlc3VsdFxufVxuXG4vLyBGb3IgcmVsYXRpdmUgdmVydGljYWwgbW92ZW1lbnQuIERpciBtYXkgYmUgLTEgb3IgMS4gVW5pdCBjYW4gYmVcbi8vIFwicGFnZVwiIG9yIFwibGluZVwiLiBUaGUgcmVzdWx0aW5nIHBvc2l0aW9uIHdpbGwgaGF2ZSBhIGhpdFNpZGU9dHJ1ZVxuLy8gcHJvcGVydHkgaWYgaXQgcmVhY2hlZCB0aGUgZW5kIG9mIHRoZSBkb2N1bWVudC5cbmZ1bmN0aW9uIGZpbmRQb3NWKGNtLCBwb3MsIGRpciwgdW5pdCkge1xuICB2YXIgZG9jID0gY20uZG9jLCB4ID0gcG9zLmxlZnQsIHk7XG4gIGlmICh1bml0ID09IFwicGFnZVwiKSB7XG4gICAgdmFyIHBhZ2VTaXplID0gTWF0aC5taW4oY20uZGlzcGxheS53cmFwcGVyLmNsaWVudEhlaWdodCwgd2luZG93LmlubmVySGVpZ2h0IHx8IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5jbGllbnRIZWlnaHQpO1xuICAgIHZhciBtb3ZlQW1vdW50ID0gTWF0aC5tYXgocGFnZVNpemUgLSAuNSAqIHRleHRIZWlnaHQoY20uZGlzcGxheSksIDMpO1xuICAgIHkgPSAoZGlyID4gMCA/IHBvcy5ib3R0b20gOiBwb3MudG9wKSArIGRpciAqIG1vdmVBbW91bnQ7XG5cbiAgfSBlbHNlIGlmICh1bml0ID09IFwibGluZVwiKSB7XG4gICAgeSA9IGRpciA+IDAgPyBwb3MuYm90dG9tICsgMyA6IHBvcy50b3AgLSAzO1xuICB9XG4gIHZhciB0YXJnZXQ7XG4gIGZvciAoOzspIHtcbiAgICB0YXJnZXQgPSBjb29yZHNDaGFyKGNtLCB4LCB5KTtcbiAgICBpZiAoIXRhcmdldC5vdXRzaWRlKSB7IGJyZWFrIH1cbiAgICBpZiAoZGlyIDwgMCA/IHkgPD0gMCA6IHkgPj0gZG9jLmhlaWdodCkgeyB0YXJnZXQuaGl0U2lkZSA9IHRydWU7IGJyZWFrIH1cbiAgICB5ICs9IGRpciAqIDU7XG4gIH1cbiAgcmV0dXJuIHRhcmdldFxufVxuXG4vLyBDT05URU5URURJVEFCTEUgSU5QVVQgU1RZTEVcblxudmFyIENvbnRlbnRFZGl0YWJsZUlucHV0ID0gZnVuY3Rpb24oY20pIHtcbiAgdGhpcy5jbSA9IGNtO1xuICB0aGlzLmxhc3RBbmNob3JOb2RlID0gdGhpcy5sYXN0QW5jaG9yT2Zmc2V0ID0gdGhpcy5sYXN0Rm9jdXNOb2RlID0gdGhpcy5sYXN0Rm9jdXNPZmZzZXQgPSBudWxsO1xuICB0aGlzLnBvbGxpbmcgPSBuZXcgRGVsYXllZCgpO1xuICB0aGlzLmNvbXBvc2luZyA9IG51bGw7XG4gIHRoaXMuZ3JhY2VQZXJpb2QgPSBmYWxzZTtcbiAgdGhpcy5yZWFkRE9NVGltZW91dCA9IG51bGw7XG59O1xuXG5Db250ZW50RWRpdGFibGVJbnB1dC5wcm90b3R5cGUuaW5pdCA9IGZ1bmN0aW9uIChkaXNwbGF5KSB7XG4gICAgdmFyIHRoaXMkMSA9IHRoaXM7XG5cbiAgdmFyIGlucHV0ID0gdGhpcywgY20gPSBpbnB1dC5jbTtcbiAgdmFyIGRpdiA9IGlucHV0LmRpdiA9IGRpc3BsYXkubGluZURpdjtcbiAgZGlzYWJsZUJyb3dzZXJNYWdpYyhkaXYsIGNtLm9wdGlvbnMuc3BlbGxjaGVjayk7XG5cbiAgb24oZGl2LCBcInBhc3RlXCIsIGZ1bmN0aW9uIChlKSB7XG4gICAgaWYgKHNpZ25hbERPTUV2ZW50KGNtLCBlKSB8fCBoYW5kbGVQYXN0ZShlLCBjbSkpIHsgcmV0dXJuIH1cbiAgICAvLyBJRSBkb2Vzbid0IGZpcmUgaW5wdXQgZXZlbnRzLCBzbyB3ZSBzY2hlZHVsZSBhIHJlYWQgZm9yIHRoZSBwYXN0ZWQgY29udGVudCBpbiB0aGlzIHdheVxuICAgIGlmIChpZV92ZXJzaW9uIDw9IDExKSB7IHNldFRpbWVvdXQob3BlcmF0aW9uKGNtLCBmdW5jdGlvbiAoKSB7IHJldHVybiB0aGlzJDEudXBkYXRlRnJvbURPTSgpOyB9KSwgMjApOyB9XG4gIH0pO1xuXG4gIG9uKGRpdiwgXCJjb21wb3NpdGlvbnN0YXJ0XCIsIGZ1bmN0aW9uIChlKSB7XG4gICAgdGhpcyQxLmNvbXBvc2luZyA9IHtkYXRhOiBlLmRhdGEsIGRvbmU6IGZhbHNlfTtcbiAgfSk7XG4gIG9uKGRpdiwgXCJjb21wb3NpdGlvbnVwZGF0ZVwiLCBmdW5jdGlvbiAoZSkge1xuICAgIGlmICghdGhpcyQxLmNvbXBvc2luZykgeyB0aGlzJDEuY29tcG9zaW5nID0ge2RhdGE6IGUuZGF0YSwgZG9uZTogZmFsc2V9OyB9XG4gIH0pO1xuICBvbihkaXYsIFwiY29tcG9zaXRpb25lbmRcIiwgZnVuY3Rpb24gKGUpIHtcbiAgICBpZiAodGhpcyQxLmNvbXBvc2luZykge1xuICAgICAgaWYgKGUuZGF0YSAhPSB0aGlzJDEuY29tcG9zaW5nLmRhdGEpIHsgdGhpcyQxLnJlYWRGcm9tRE9NU29vbigpOyB9XG4gICAgICB0aGlzJDEuY29tcG9zaW5nLmRvbmUgPSB0cnVlO1xuICAgIH1cbiAgfSk7XG5cbiAgb24oZGl2LCBcInRvdWNoc3RhcnRcIiwgZnVuY3Rpb24gKCkgeyByZXR1cm4gaW5wdXQuZm9yY2VDb21wb3NpdGlvbkVuZCgpOyB9KTtcblxuICBvbihkaXYsIFwiaW5wdXRcIiwgZnVuY3Rpb24gKCkge1xuICAgIGlmICghdGhpcyQxLmNvbXBvc2luZykgeyB0aGlzJDEucmVhZEZyb21ET01Tb29uKCk7IH1cbiAgfSk7XG5cbiAgZnVuY3Rpb24gb25Db3B5Q3V0KGUpIHtcbiAgICBpZiAoc2lnbmFsRE9NRXZlbnQoY20sIGUpKSB7IHJldHVybiB9XG4gICAgaWYgKGNtLnNvbWV0aGluZ1NlbGVjdGVkKCkpIHtcbiAgICAgIHNldExhc3RDb3BpZWQoe2xpbmVXaXNlOiBmYWxzZSwgdGV4dDogY20uZ2V0U2VsZWN0aW9ucygpfSk7XG4gICAgICBpZiAoZS50eXBlID09IFwiY3V0XCIpIHsgY20ucmVwbGFjZVNlbGVjdGlvbihcIlwiLCBudWxsLCBcImN1dFwiKTsgfVxuICAgIH0gZWxzZSBpZiAoIWNtLm9wdGlvbnMubGluZVdpc2VDb3B5Q3V0KSB7XG4gICAgICByZXR1cm5cbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIHJhbmdlcyA9IGNvcHlhYmxlUmFuZ2VzKGNtKTtcbiAgICAgIHNldExhc3RDb3BpZWQoe2xpbmVXaXNlOiB0cnVlLCB0ZXh0OiByYW5nZXMudGV4dH0pO1xuICAgICAgaWYgKGUudHlwZSA9PSBcImN1dFwiKSB7XG4gICAgICAgIGNtLm9wZXJhdGlvbihmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgY20uc2V0U2VsZWN0aW9ucyhyYW5nZXMucmFuZ2VzLCAwLCBzZWxfZG9udFNjcm9sbCk7XG4gICAgICAgICAgY20ucmVwbGFjZVNlbGVjdGlvbihcIlwiLCBudWxsLCBcImN1dFwiKTtcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChlLmNsaXBib2FyZERhdGEpIHtcbiAgICAgIGUuY2xpcGJvYXJkRGF0YS5jbGVhckRhdGEoKTtcbiAgICAgIHZhciBjb250ZW50ID0gbGFzdENvcGllZC50ZXh0LmpvaW4oXCJcXG5cIik7XG4gICAgICAvLyBpT1MgZXhwb3NlcyB0aGUgY2xpcGJvYXJkIEFQSSwgYnV0IHNlZW1zIHRvIGRpc2NhcmQgY29udGVudCBpbnNlcnRlZCBpbnRvIGl0XG4gICAgICBlLmNsaXBib2FyZERhdGEuc2V0RGF0YShcIlRleHRcIiwgY29udGVudCk7XG4gICAgICBpZiAoZS5jbGlwYm9hcmREYXRhLmdldERhdGEoXCJUZXh0XCIpID09IGNvbnRlbnQpIHtcbiAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICB9XG4gICAgLy8gT2xkLWZhc2hpb25lZCBicmllZmx5LWZvY3VzLWEtdGV4dGFyZWEgaGFja1xuICAgIHZhciBrbHVkZ2UgPSBoaWRkZW5UZXh0YXJlYSgpLCB0ZSA9IGtsdWRnZS5maXJzdENoaWxkO1xuICAgIGNtLmRpc3BsYXkubGluZVNwYWNlLmluc2VydEJlZm9yZShrbHVkZ2UsIGNtLmRpc3BsYXkubGluZVNwYWNlLmZpcnN0Q2hpbGQpO1xuICAgIHRlLnZhbHVlID0gbGFzdENvcGllZC50ZXh0LmpvaW4oXCJcXG5cIik7XG4gICAgdmFyIGhhZEZvY3VzID0gZG9jdW1lbnQuYWN0aXZlRWxlbWVudDtcbiAgICBzZWxlY3RJbnB1dCh0ZSk7XG4gICAgc2V0VGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICBjbS5kaXNwbGF5LmxpbmVTcGFjZS5yZW1vdmVDaGlsZChrbHVkZ2UpO1xuICAgICAgaGFkRm9jdXMuZm9jdXMoKTtcbiAgICAgIGlmIChoYWRGb2N1cyA9PSBkaXYpIHsgaW5wdXQuc2hvd1ByaW1hcnlTZWxlY3Rpb24oKTsgfVxuICAgIH0sIDUwKTtcbiAgfVxuICBvbihkaXYsIFwiY29weVwiLCBvbkNvcHlDdXQpO1xuICBvbihkaXYsIFwiY3V0XCIsIG9uQ29weUN1dCk7XG59O1xuXG5Db250ZW50RWRpdGFibGVJbnB1dC5wcm90b3R5cGUucHJlcGFyZVNlbGVjdGlvbiA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIHJlc3VsdCA9IHByZXBhcmVTZWxlY3Rpb24odGhpcy5jbSwgZmFsc2UpO1xuICByZXN1bHQuZm9jdXMgPSB0aGlzLmNtLnN0YXRlLmZvY3VzZWQ7XG4gIHJldHVybiByZXN1bHRcbn07XG5cbkNvbnRlbnRFZGl0YWJsZUlucHV0LnByb3RvdHlwZS5zaG93U2VsZWN0aW9uID0gZnVuY3Rpb24gKGluZm8sIHRha2VGb2N1cykge1xuICBpZiAoIWluZm8gfHwgIXRoaXMuY20uZGlzcGxheS52aWV3Lmxlbmd0aCkgeyByZXR1cm4gfVxuICBpZiAoaW5mby5mb2N1cyB8fCB0YWtlRm9jdXMpIHsgdGhpcy5zaG93UHJpbWFyeVNlbGVjdGlvbigpOyB9XG4gIHRoaXMuc2hvd011bHRpcGxlU2VsZWN0aW9ucyhpbmZvKTtcbn07XG5cbkNvbnRlbnRFZGl0YWJsZUlucHV0LnByb3RvdHlwZS5nZXRTZWxlY3Rpb24gPSBmdW5jdGlvbiAoKSB7XG4gIHJldHVybiB0aGlzLmNtLmRpc3BsYXkud3JhcHBlci5vd25lckRvY3VtZW50LmdldFNlbGVjdGlvbigpXG59O1xuXG5Db250ZW50RWRpdGFibGVJbnB1dC5wcm90b3R5cGUuc2hvd1ByaW1hcnlTZWxlY3Rpb24gPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBzZWwgPSB0aGlzLmdldFNlbGVjdGlvbigpLCBjbSA9IHRoaXMuY20sIHByaW0gPSBjbS5kb2Muc2VsLnByaW1hcnkoKTtcbiAgdmFyIGZyb20gPSBwcmltLmZyb20oKSwgdG8gPSBwcmltLnRvKCk7XG5cbiAgaWYgKGNtLmRpc3BsYXkudmlld1RvID09IGNtLmRpc3BsYXkudmlld0Zyb20gfHwgZnJvbS5saW5lID49IGNtLmRpc3BsYXkudmlld1RvIHx8IHRvLmxpbmUgPCBjbS5kaXNwbGF5LnZpZXdGcm9tKSB7XG4gICAgc2VsLnJlbW92ZUFsbFJhbmdlcygpO1xuICAgIHJldHVyblxuICB9XG5cbiAgdmFyIGN1ckFuY2hvciA9IGRvbVRvUG9zKGNtLCBzZWwuYW5jaG9yTm9kZSwgc2VsLmFuY2hvck9mZnNldCk7XG4gIHZhciBjdXJGb2N1cyA9IGRvbVRvUG9zKGNtLCBzZWwuZm9jdXNOb2RlLCBzZWwuZm9jdXNPZmZzZXQpO1xuICBpZiAoY3VyQW5jaG9yICYmICFjdXJBbmNob3IuYmFkICYmIGN1ckZvY3VzICYmICFjdXJGb2N1cy5iYWQgJiZcbiAgICAgIGNtcChtaW5Qb3MoY3VyQW5jaG9yLCBjdXJGb2N1cyksIGZyb20pID09IDAgJiZcbiAgICAgIGNtcChtYXhQb3MoY3VyQW5jaG9yLCBjdXJGb2N1cyksIHRvKSA9PSAwKVxuICAgIHsgcmV0dXJuIH1cblxuICB2YXIgdmlldyA9IGNtLmRpc3BsYXkudmlldztcbiAgdmFyIHN0YXJ0ID0gKGZyb20ubGluZSA+PSBjbS5kaXNwbGF5LnZpZXdGcm9tICYmIHBvc1RvRE9NKGNtLCBmcm9tKSkgfHxcbiAgICAgIHtub2RlOiB2aWV3WzBdLm1lYXN1cmUubWFwWzJdLCBvZmZzZXQ6IDB9O1xuICB2YXIgZW5kID0gdG8ubGluZSA8IGNtLmRpc3BsYXkudmlld1RvICYmIHBvc1RvRE9NKGNtLCB0byk7XG4gIGlmICghZW5kKSB7XG4gICAgdmFyIG1lYXN1cmUgPSB2aWV3W3ZpZXcubGVuZ3RoIC0gMV0ubWVhc3VyZTtcbiAgICB2YXIgbWFwJCQxID0gbWVhc3VyZS5tYXBzID8gbWVhc3VyZS5tYXBzW21lYXN1cmUubWFwcy5sZW5ndGggLSAxXSA6IG1lYXN1cmUubWFwO1xuICAgIGVuZCA9IHtub2RlOiBtYXAkJDFbbWFwJCQxLmxlbmd0aCAtIDFdLCBvZmZzZXQ6IG1hcCQkMVttYXAkJDEubGVuZ3RoIC0gMl0gLSBtYXAkJDFbbWFwJCQxLmxlbmd0aCAtIDNdfTtcbiAgfVxuXG4gIGlmICghc3RhcnQgfHwgIWVuZCkge1xuICAgIHNlbC5yZW1vdmVBbGxSYW5nZXMoKTtcbiAgICByZXR1cm5cbiAgfVxuXG4gIHZhciBvbGQgPSBzZWwucmFuZ2VDb3VudCAmJiBzZWwuZ2V0UmFuZ2VBdCgwKSwgcm5nO1xuICB0cnkgeyBybmcgPSByYW5nZShzdGFydC5ub2RlLCBzdGFydC5vZmZzZXQsIGVuZC5vZmZzZXQsIGVuZC5ub2RlKTsgfVxuICBjYXRjaChlKSB7fSAvLyBPdXIgbW9kZWwgb2YgdGhlIERPTSBtaWdodCBiZSBvdXRkYXRlZCwgaW4gd2hpY2ggY2FzZSB0aGUgcmFuZ2Ugd2UgdHJ5IHRvIHNldCBjYW4gYmUgaW1wb3NzaWJsZVxuICBpZiAocm5nKSB7XG4gICAgaWYgKCFnZWNrbyAmJiBjbS5zdGF0ZS5mb2N1c2VkKSB7XG4gICAgICBzZWwuY29sbGFwc2Uoc3RhcnQubm9kZSwgc3RhcnQub2Zmc2V0KTtcbiAgICAgIGlmICghcm5nLmNvbGxhcHNlZCkge1xuICAgICAgICBzZWwucmVtb3ZlQWxsUmFuZ2VzKCk7XG4gICAgICAgIHNlbC5hZGRSYW5nZShybmcpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBzZWwucmVtb3ZlQWxsUmFuZ2VzKCk7XG4gICAgICBzZWwuYWRkUmFuZ2Uocm5nKTtcbiAgICB9XG4gICAgaWYgKG9sZCAmJiBzZWwuYW5jaG9yTm9kZSA9PSBudWxsKSB7IHNlbC5hZGRSYW5nZShvbGQpOyB9XG4gICAgZWxzZSBpZiAoZ2Vja28pIHsgdGhpcy5zdGFydEdyYWNlUGVyaW9kKCk7IH1cbiAgfVxuICB0aGlzLnJlbWVtYmVyU2VsZWN0aW9uKCk7XG59O1xuXG5Db250ZW50RWRpdGFibGVJbnB1dC5wcm90b3R5cGUuc3RhcnRHcmFjZVBlcmlvZCA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgdGhpcyQxID0gdGhpcztcblxuICBjbGVhclRpbWVvdXQodGhpcy5ncmFjZVBlcmlvZCk7XG4gIHRoaXMuZ3JhY2VQZXJpb2QgPSBzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzJDEuZ3JhY2VQZXJpb2QgPSBmYWxzZTtcbiAgICBpZiAodGhpcyQxLnNlbGVjdGlvbkNoYW5nZWQoKSlcbiAgICAgIHsgdGhpcyQxLmNtLm9wZXJhdGlvbihmdW5jdGlvbiAoKSB7IHJldHVybiB0aGlzJDEuY20uY3VyT3Auc2VsZWN0aW9uQ2hhbmdlZCA9IHRydWU7IH0pOyB9XG4gIH0sIDIwKTtcbn07XG5cbkNvbnRlbnRFZGl0YWJsZUlucHV0LnByb3RvdHlwZS5zaG93TXVsdGlwbGVTZWxlY3Rpb25zID0gZnVuY3Rpb24gKGluZm8pIHtcbiAgcmVtb3ZlQ2hpbGRyZW5BbmRBZGQodGhpcy5jbS5kaXNwbGF5LmN1cnNvckRpdiwgaW5mby5jdXJzb3JzKTtcbiAgcmVtb3ZlQ2hpbGRyZW5BbmRBZGQodGhpcy5jbS5kaXNwbGF5LnNlbGVjdGlvbkRpdiwgaW5mby5zZWxlY3Rpb24pO1xufTtcblxuQ29udGVudEVkaXRhYmxlSW5wdXQucHJvdG90eXBlLnJlbWVtYmVyU2VsZWN0aW9uID0gZnVuY3Rpb24gKCkge1xuICB2YXIgc2VsID0gdGhpcy5nZXRTZWxlY3Rpb24oKTtcbiAgdGhpcy5sYXN0QW5jaG9yTm9kZSA9IHNlbC5hbmNob3JOb2RlOyB0aGlzLmxhc3RBbmNob3JPZmZzZXQgPSBzZWwuYW5jaG9yT2Zmc2V0O1xuICB0aGlzLmxhc3RGb2N1c05vZGUgPSBzZWwuZm9jdXNOb2RlOyB0aGlzLmxhc3RGb2N1c09mZnNldCA9IHNlbC5mb2N1c09mZnNldDtcbn07XG5cbkNvbnRlbnRFZGl0YWJsZUlucHV0LnByb3RvdHlwZS5zZWxlY3Rpb25JbkVkaXRvciA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIHNlbCA9IHRoaXMuZ2V0U2VsZWN0aW9uKCk7XG4gIGlmICghc2VsLnJhbmdlQ291bnQpIHsgcmV0dXJuIGZhbHNlIH1cbiAgdmFyIG5vZGUgPSBzZWwuZ2V0UmFuZ2VBdCgwKS5jb21tb25BbmNlc3RvckNvbnRhaW5lcjtcbiAgcmV0dXJuIGNvbnRhaW5zKHRoaXMuZGl2LCBub2RlKVxufTtcblxuQ29udGVudEVkaXRhYmxlSW5wdXQucHJvdG90eXBlLmZvY3VzID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5jbS5vcHRpb25zLnJlYWRPbmx5ICE9IFwibm9jdXJzb3JcIikge1xuICAgIGlmICghdGhpcy5zZWxlY3Rpb25JbkVkaXRvcigpKVxuICAgICAgeyB0aGlzLnNob3dTZWxlY3Rpb24odGhpcy5wcmVwYXJlU2VsZWN0aW9uKCksIHRydWUpOyB9XG4gICAgdGhpcy5kaXYuZm9jdXMoKTtcbiAgfVxufTtcbkNvbnRlbnRFZGl0YWJsZUlucHV0LnByb3RvdHlwZS5ibHVyID0gZnVuY3Rpb24gKCkgeyB0aGlzLmRpdi5ibHVyKCk7IH07XG5Db250ZW50RWRpdGFibGVJbnB1dC5wcm90b3R5cGUuZ2V0RmllbGQgPSBmdW5jdGlvbiAoKSB7IHJldHVybiB0aGlzLmRpdiB9O1xuXG5Db250ZW50RWRpdGFibGVJbnB1dC5wcm90b3R5cGUuc3VwcG9ydHNUb3VjaCA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuIHRydWUgfTtcblxuQ29udGVudEVkaXRhYmxlSW5wdXQucHJvdG90eXBlLnJlY2VpdmVkRm9jdXMgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBpbnB1dCA9IHRoaXM7XG4gIGlmICh0aGlzLnNlbGVjdGlvbkluRWRpdG9yKCkpXG4gICAgeyB0aGlzLnBvbGxTZWxlY3Rpb24oKTsgfVxuICBlbHNlXG4gICAgeyBydW5Jbk9wKHRoaXMuY20sIGZ1bmN0aW9uICgpIHsgcmV0dXJuIGlucHV0LmNtLmN1ck9wLnNlbGVjdGlvbkNoYW5nZWQgPSB0cnVlOyB9KTsgfVxuXG4gIGZ1bmN0aW9uIHBvbGwoKSB7XG4gICAgaWYgKGlucHV0LmNtLnN0YXRlLmZvY3VzZWQpIHtcbiAgICAgIGlucHV0LnBvbGxTZWxlY3Rpb24oKTtcbiAgICAgIGlucHV0LnBvbGxpbmcuc2V0KGlucHV0LmNtLm9wdGlvbnMucG9sbEludGVydmFsLCBwb2xsKTtcbiAgICB9XG4gIH1cbiAgdGhpcy5wb2xsaW5nLnNldCh0aGlzLmNtLm9wdGlvbnMucG9sbEludGVydmFsLCBwb2xsKTtcbn07XG5cbkNvbnRlbnRFZGl0YWJsZUlucHV0LnByb3RvdHlwZS5zZWxlY3Rpb25DaGFuZ2VkID0gZnVuY3Rpb24gKCkge1xuICB2YXIgc2VsID0gdGhpcy5nZXRTZWxlY3Rpb24oKTtcbiAgcmV0dXJuIHNlbC5hbmNob3JOb2RlICE9IHRoaXMubGFzdEFuY2hvck5vZGUgfHwgc2VsLmFuY2hvck9mZnNldCAhPSB0aGlzLmxhc3RBbmNob3JPZmZzZXQgfHxcbiAgICBzZWwuZm9jdXNOb2RlICE9IHRoaXMubGFzdEZvY3VzTm9kZSB8fCBzZWwuZm9jdXNPZmZzZXQgIT0gdGhpcy5sYXN0Rm9jdXNPZmZzZXRcbn07XG5cbkNvbnRlbnRFZGl0YWJsZUlucHV0LnByb3RvdHlwZS5wb2xsU2VsZWN0aW9uID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5yZWFkRE9NVGltZW91dCAhPSBudWxsIHx8IHRoaXMuZ3JhY2VQZXJpb2QgfHwgIXRoaXMuc2VsZWN0aW9uQ2hhbmdlZCgpKSB7IHJldHVybiB9XG4gIHZhciBzZWwgPSB0aGlzLmdldFNlbGVjdGlvbigpLCBjbSA9IHRoaXMuY207XG4gIC8vIE9uIEFuZHJvaWQgQ2hyb21lICh2ZXJzaW9uIDU2LCBhdCBsZWFzdCksIGJhY2tzcGFjaW5nIGludG8gYW5cbiAgLy8gdW5lZGl0YWJsZSBibG9jayBlbGVtZW50IHdpbGwgcHV0IHRoZSBjdXJzb3IgaW4gdGhhdCBlbGVtZW50LFxuICAvLyBhbmQgdGhlbiwgYmVjYXVzZSBpdCdzIG5vdCBlZGl0YWJsZSwgaGlkZSB0aGUgdmlydHVhbCBrZXlib2FyZC5cbiAgLy8gQmVjYXVzZSBBbmRyb2lkIGRvZXNuJ3QgYWxsb3cgdXMgdG8gYWN0dWFsbHkgZGV0ZWN0IGJhY2tzcGFjZVxuICAvLyBwcmVzc2VzIGluIGEgc2FuZSB3YXksIHRoaXMgY29kZSBjaGVja3MgZm9yIHdoZW4gdGhhdCBoYXBwZW5zXG4gIC8vIGFuZCBzaW11bGF0ZXMgYSBiYWNrc3BhY2UgcHJlc3MgaW4gdGhpcyBjYXNlLlxuICBpZiAoYW5kcm9pZCAmJiBjaHJvbWUgJiYgdGhpcy5jbS5vcHRpb25zLmd1dHRlcnMubGVuZ3RoICYmIGlzSW5HdXR0ZXIoc2VsLmFuY2hvck5vZGUpKSB7XG4gICAgdGhpcy5jbS50cmlnZ2VyT25LZXlEb3duKHt0eXBlOiBcImtleWRvd25cIiwga2V5Q29kZTogOCwgcHJldmVudERlZmF1bHQ6IE1hdGguYWJzfSk7XG4gICAgdGhpcy5ibHVyKCk7XG4gICAgdGhpcy5mb2N1cygpO1xuICAgIHJldHVyblxuICB9XG4gIGlmICh0aGlzLmNvbXBvc2luZykgeyByZXR1cm4gfVxuICB0aGlzLnJlbWVtYmVyU2VsZWN0aW9uKCk7XG4gIHZhciBhbmNob3IgPSBkb21Ub1BvcyhjbSwgc2VsLmFuY2hvck5vZGUsIHNlbC5hbmNob3JPZmZzZXQpO1xuICB2YXIgaGVhZCA9IGRvbVRvUG9zKGNtLCBzZWwuZm9jdXNOb2RlLCBzZWwuZm9jdXNPZmZzZXQpO1xuICBpZiAoYW5jaG9yICYmIGhlYWQpIHsgcnVuSW5PcChjbSwgZnVuY3Rpb24gKCkge1xuICAgIHNldFNlbGVjdGlvbihjbS5kb2MsIHNpbXBsZVNlbGVjdGlvbihhbmNob3IsIGhlYWQpLCBzZWxfZG9udFNjcm9sbCk7XG4gICAgaWYgKGFuY2hvci5iYWQgfHwgaGVhZC5iYWQpIHsgY20uY3VyT3Auc2VsZWN0aW9uQ2hhbmdlZCA9IHRydWU7IH1cbiAgfSk7IH1cbn07XG5cbkNvbnRlbnRFZGl0YWJsZUlucHV0LnByb3RvdHlwZS5wb2xsQ29udGVudCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMucmVhZERPTVRpbWVvdXQgIT0gbnVsbCkge1xuICAgIGNsZWFyVGltZW91dCh0aGlzLnJlYWRET01UaW1lb3V0KTtcbiAgICB0aGlzLnJlYWRET01UaW1lb3V0ID0gbnVsbDtcbiAgfVxuXG4gIHZhciBjbSA9IHRoaXMuY20sIGRpc3BsYXkgPSBjbS5kaXNwbGF5LCBzZWwgPSBjbS5kb2Muc2VsLnByaW1hcnkoKTtcbiAgdmFyIGZyb20gPSBzZWwuZnJvbSgpLCB0byA9IHNlbC50bygpO1xuICBpZiAoZnJvbS5jaCA9PSAwICYmIGZyb20ubGluZSA+IGNtLmZpcnN0TGluZSgpKVxuICAgIHsgZnJvbSA9IFBvcyhmcm9tLmxpbmUgLSAxLCBnZXRMaW5lKGNtLmRvYywgZnJvbS5saW5lIC0gMSkubGVuZ3RoKTsgfVxuICBpZiAodG8uY2ggPT0gZ2V0TGluZShjbS5kb2MsIHRvLmxpbmUpLnRleHQubGVuZ3RoICYmIHRvLmxpbmUgPCBjbS5sYXN0TGluZSgpKVxuICAgIHsgdG8gPSBQb3ModG8ubGluZSArIDEsIDApOyB9XG4gIGlmIChmcm9tLmxpbmUgPCBkaXNwbGF5LnZpZXdGcm9tIHx8IHRvLmxpbmUgPiBkaXNwbGF5LnZpZXdUbyAtIDEpIHsgcmV0dXJuIGZhbHNlIH1cblxuICB2YXIgZnJvbUluZGV4LCBmcm9tTGluZSwgZnJvbU5vZGU7XG4gIGlmIChmcm9tLmxpbmUgPT0gZGlzcGxheS52aWV3RnJvbSB8fCAoZnJvbUluZGV4ID0gZmluZFZpZXdJbmRleChjbSwgZnJvbS5saW5lKSkgPT0gMCkge1xuICAgIGZyb21MaW5lID0gbGluZU5vKGRpc3BsYXkudmlld1swXS5saW5lKTtcbiAgICBmcm9tTm9kZSA9IGRpc3BsYXkudmlld1swXS5ub2RlO1xuICB9IGVsc2Uge1xuICAgIGZyb21MaW5lID0gbGluZU5vKGRpc3BsYXkudmlld1tmcm9tSW5kZXhdLmxpbmUpO1xuICAgIGZyb21Ob2RlID0gZGlzcGxheS52aWV3W2Zyb21JbmRleCAtIDFdLm5vZGUubmV4dFNpYmxpbmc7XG4gIH1cbiAgdmFyIHRvSW5kZXggPSBmaW5kVmlld0luZGV4KGNtLCB0by5saW5lKTtcbiAgdmFyIHRvTGluZSwgdG9Ob2RlO1xuICBpZiAodG9JbmRleCA9PSBkaXNwbGF5LnZpZXcubGVuZ3RoIC0gMSkge1xuICAgIHRvTGluZSA9IGRpc3BsYXkudmlld1RvIC0gMTtcbiAgICB0b05vZGUgPSBkaXNwbGF5LmxpbmVEaXYubGFzdENoaWxkO1xuICB9IGVsc2Uge1xuICAgIHRvTGluZSA9IGxpbmVObyhkaXNwbGF5LnZpZXdbdG9JbmRleCArIDFdLmxpbmUpIC0gMTtcbiAgICB0b05vZGUgPSBkaXNwbGF5LnZpZXdbdG9JbmRleCArIDFdLm5vZGUucHJldmlvdXNTaWJsaW5nO1xuICB9XG5cbiAgaWYgKCFmcm9tTm9kZSkgeyByZXR1cm4gZmFsc2UgfVxuICB2YXIgbmV3VGV4dCA9IGNtLmRvYy5zcGxpdExpbmVzKGRvbVRleHRCZXR3ZWVuKGNtLCBmcm9tTm9kZSwgdG9Ob2RlLCBmcm9tTGluZSwgdG9MaW5lKSk7XG4gIHZhciBvbGRUZXh0ID0gZ2V0QmV0d2VlbihjbS5kb2MsIFBvcyhmcm9tTGluZSwgMCksIFBvcyh0b0xpbmUsIGdldExpbmUoY20uZG9jLCB0b0xpbmUpLnRleHQubGVuZ3RoKSk7XG4gIHdoaWxlIChuZXdUZXh0Lmxlbmd0aCA+IDEgJiYgb2xkVGV4dC5sZW5ndGggPiAxKSB7XG4gICAgaWYgKGxzdChuZXdUZXh0KSA9PSBsc3Qob2xkVGV4dCkpIHsgbmV3VGV4dC5wb3AoKTsgb2xkVGV4dC5wb3AoKTsgdG9MaW5lLS07IH1cbiAgICBlbHNlIGlmIChuZXdUZXh0WzBdID09IG9sZFRleHRbMF0pIHsgbmV3VGV4dC5zaGlmdCgpOyBvbGRUZXh0LnNoaWZ0KCk7IGZyb21MaW5lKys7IH1cbiAgICBlbHNlIHsgYnJlYWsgfVxuICB9XG5cbiAgdmFyIGN1dEZyb250ID0gMCwgY3V0RW5kID0gMDtcbiAgdmFyIG5ld1RvcCA9IG5ld1RleHRbMF0sIG9sZFRvcCA9IG9sZFRleHRbMF0sIG1heEN1dEZyb250ID0gTWF0aC5taW4obmV3VG9wLmxlbmd0aCwgb2xkVG9wLmxlbmd0aCk7XG4gIHdoaWxlIChjdXRGcm9udCA8IG1heEN1dEZyb250ICYmIG5ld1RvcC5jaGFyQ29kZUF0KGN1dEZyb250KSA9PSBvbGRUb3AuY2hhckNvZGVBdChjdXRGcm9udCkpXG4gICAgeyArK2N1dEZyb250OyB9XG4gIHZhciBuZXdCb3QgPSBsc3QobmV3VGV4dCksIG9sZEJvdCA9IGxzdChvbGRUZXh0KTtcbiAgdmFyIG1heEN1dEVuZCA9IE1hdGgubWluKG5ld0JvdC5sZW5ndGggLSAobmV3VGV4dC5sZW5ndGggPT0gMSA/IGN1dEZyb250IDogMCksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICBvbGRCb3QubGVuZ3RoIC0gKG9sZFRleHQubGVuZ3RoID09IDEgPyBjdXRGcm9udCA6IDApKTtcbiAgd2hpbGUgKGN1dEVuZCA8IG1heEN1dEVuZCAmJlxuICAgICAgICAgbmV3Qm90LmNoYXJDb2RlQXQobmV3Qm90Lmxlbmd0aCAtIGN1dEVuZCAtIDEpID09IG9sZEJvdC5jaGFyQ29kZUF0KG9sZEJvdC5sZW5ndGggLSBjdXRFbmQgLSAxKSlcbiAgICB7ICsrY3V0RW5kOyB9XG4gIC8vIFRyeSB0byBtb3ZlIHN0YXJ0IG9mIGNoYW5nZSB0byBzdGFydCBvZiBzZWxlY3Rpb24gaWYgYW1iaWd1b3VzXG4gIGlmIChuZXdUZXh0Lmxlbmd0aCA9PSAxICYmIG9sZFRleHQubGVuZ3RoID09IDEgJiYgZnJvbUxpbmUgPT0gZnJvbS5saW5lKSB7XG4gICAgd2hpbGUgKGN1dEZyb250ICYmIGN1dEZyb250ID4gZnJvbS5jaCAmJlxuICAgICAgICAgICBuZXdCb3QuY2hhckNvZGVBdChuZXdCb3QubGVuZ3RoIC0gY3V0RW5kIC0gMSkgPT0gb2xkQm90LmNoYXJDb2RlQXQob2xkQm90Lmxlbmd0aCAtIGN1dEVuZCAtIDEpKSB7XG4gICAgICBjdXRGcm9udC0tO1xuICAgICAgY3V0RW5kKys7XG4gICAgfVxuICB9XG5cbiAgbmV3VGV4dFtuZXdUZXh0Lmxlbmd0aCAtIDFdID0gbmV3Qm90LnNsaWNlKDAsIG5ld0JvdC5sZW5ndGggLSBjdXRFbmQpLnJlcGxhY2UoL15cXHUyMDBiKy8sIFwiXCIpO1xuICBuZXdUZXh0WzBdID0gbmV3VGV4dFswXS5zbGljZShjdXRGcm9udCkucmVwbGFjZSgvXFx1MjAwYiskLywgXCJcIik7XG5cbiAgdmFyIGNoRnJvbSA9IFBvcyhmcm9tTGluZSwgY3V0RnJvbnQpO1xuICB2YXIgY2hUbyA9IFBvcyh0b0xpbmUsIG9sZFRleHQubGVuZ3RoID8gbHN0KG9sZFRleHQpLmxlbmd0aCAtIGN1dEVuZCA6IDApO1xuICBpZiAobmV3VGV4dC5sZW5ndGggPiAxIHx8IG5ld1RleHRbMF0gfHwgY21wKGNoRnJvbSwgY2hUbykpIHtcbiAgICByZXBsYWNlUmFuZ2UoY20uZG9jLCBuZXdUZXh0LCBjaEZyb20sIGNoVG8sIFwiK2lucHV0XCIpO1xuICAgIHJldHVybiB0cnVlXG4gIH1cbn07XG5cbkNvbnRlbnRFZGl0YWJsZUlucHV0LnByb3RvdHlwZS5lbnN1cmVQb2xsZWQgPSBmdW5jdGlvbiAoKSB7XG4gIHRoaXMuZm9yY2VDb21wb3NpdGlvbkVuZCgpO1xufTtcbkNvbnRlbnRFZGl0YWJsZUlucHV0LnByb3RvdHlwZS5yZXNldCA9IGZ1bmN0aW9uICgpIHtcbiAgdGhpcy5mb3JjZUNvbXBvc2l0aW9uRW5kKCk7XG59O1xuQ29udGVudEVkaXRhYmxlSW5wdXQucHJvdG90eXBlLmZvcmNlQ29tcG9zaXRpb25FbmQgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghdGhpcy5jb21wb3NpbmcpIHsgcmV0dXJuIH1cbiAgY2xlYXJUaW1lb3V0KHRoaXMucmVhZERPTVRpbWVvdXQpO1xuICB0aGlzLmNvbXBvc2luZyA9IG51bGw7XG4gIHRoaXMudXBkYXRlRnJvbURPTSgpO1xuICB0aGlzLmRpdi5ibHVyKCk7XG4gIHRoaXMuZGl2LmZvY3VzKCk7XG59O1xuQ29udGVudEVkaXRhYmxlSW5wdXQucHJvdG90eXBlLnJlYWRGcm9tRE9NU29vbiA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgdGhpcyQxID0gdGhpcztcblxuICBpZiAodGhpcy5yZWFkRE9NVGltZW91dCAhPSBudWxsKSB7IHJldHVybiB9XG4gIHRoaXMucmVhZERPTVRpbWVvdXQgPSBzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzJDEucmVhZERPTVRpbWVvdXQgPSBudWxsO1xuICAgIGlmICh0aGlzJDEuY29tcG9zaW5nKSB7XG4gICAgICBpZiAodGhpcyQxLmNvbXBvc2luZy5kb25lKSB7IHRoaXMkMS5jb21wb3NpbmcgPSBudWxsOyB9XG4gICAgICBlbHNlIHsgcmV0dXJuIH1cbiAgICB9XG4gICAgdGhpcyQxLnVwZGF0ZUZyb21ET00oKTtcbiAgfSwgODApO1xufTtcblxuQ29udGVudEVkaXRhYmxlSW5wdXQucHJvdG90eXBlLnVwZGF0ZUZyb21ET00gPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHRoaXMkMSA9IHRoaXM7XG5cbiAgaWYgKHRoaXMuY20uaXNSZWFkT25seSgpIHx8ICF0aGlzLnBvbGxDb250ZW50KCkpXG4gICAgeyBydW5Jbk9wKHRoaXMuY20sIGZ1bmN0aW9uICgpIHsgcmV0dXJuIHJlZ0NoYW5nZSh0aGlzJDEuY20pOyB9KTsgfVxufTtcblxuQ29udGVudEVkaXRhYmxlSW5wdXQucHJvdG90eXBlLnNldFVuZWRpdGFibGUgPSBmdW5jdGlvbiAobm9kZSkge1xuICBub2RlLmNvbnRlbnRFZGl0YWJsZSA9IFwiZmFsc2VcIjtcbn07XG5cbkNvbnRlbnRFZGl0YWJsZUlucHV0LnByb3RvdHlwZS5vbktleVByZXNzID0gZnVuY3Rpb24gKGUpIHtcbiAgaWYgKGUuY2hhckNvZGUgPT0gMCB8fCB0aGlzLmNvbXBvc2luZykgeyByZXR1cm4gfVxuICBlLnByZXZlbnREZWZhdWx0KCk7XG4gIGlmICghdGhpcy5jbS5pc1JlYWRPbmx5KCkpXG4gICAgeyBvcGVyYXRpb24odGhpcy5jbSwgYXBwbHlUZXh0SW5wdXQpKHRoaXMuY20sIFN0cmluZy5mcm9tQ2hhckNvZGUoZS5jaGFyQ29kZSA9PSBudWxsID8gZS5rZXlDb2RlIDogZS5jaGFyQ29kZSksIDApOyB9XG59O1xuXG5Db250ZW50RWRpdGFibGVJbnB1dC5wcm90b3R5cGUucmVhZE9ubHlDaGFuZ2VkID0gZnVuY3Rpb24gKHZhbCkge1xuICB0aGlzLmRpdi5jb250ZW50RWRpdGFibGUgPSBTdHJpbmcodmFsICE9IFwibm9jdXJzb3JcIik7XG59O1xuXG5Db250ZW50RWRpdGFibGVJbnB1dC5wcm90b3R5cGUub25Db250ZXh0TWVudSA9IGZ1bmN0aW9uICgpIHt9O1xuQ29udGVudEVkaXRhYmxlSW5wdXQucHJvdG90eXBlLnJlc2V0UG9zaXRpb24gPSBmdW5jdGlvbiAoKSB7fTtcblxuQ29udGVudEVkaXRhYmxlSW5wdXQucHJvdG90eXBlLm5lZWRzQ29udGVudEF0dHJpYnV0ZSA9IHRydWU7XG5cbmZ1bmN0aW9uIHBvc1RvRE9NKGNtLCBwb3MpIHtcbiAgdmFyIHZpZXcgPSBmaW5kVmlld0ZvckxpbmUoY20sIHBvcy5saW5lKTtcbiAgaWYgKCF2aWV3IHx8IHZpZXcuaGlkZGVuKSB7IHJldHVybiBudWxsIH1cbiAgdmFyIGxpbmUgPSBnZXRMaW5lKGNtLmRvYywgcG9zLmxpbmUpO1xuICB2YXIgaW5mbyA9IG1hcEZyb21MaW5lVmlldyh2aWV3LCBsaW5lLCBwb3MubGluZSk7XG5cbiAgdmFyIG9yZGVyID0gZ2V0T3JkZXIobGluZSwgY20uZG9jLmRpcmVjdGlvbiksIHNpZGUgPSBcImxlZnRcIjtcbiAgaWYgKG9yZGVyKSB7XG4gICAgdmFyIHBhcnRQb3MgPSBnZXRCaWRpUGFydEF0KG9yZGVyLCBwb3MuY2gpO1xuICAgIHNpZGUgPSBwYXJ0UG9zICUgMiA/IFwicmlnaHRcIiA6IFwibGVmdFwiO1xuICB9XG4gIHZhciByZXN1bHQgPSBub2RlQW5kT2Zmc2V0SW5MaW5lTWFwKGluZm8ubWFwLCBwb3MuY2gsIHNpZGUpO1xuICByZXN1bHQub2Zmc2V0ID0gcmVzdWx0LmNvbGxhcHNlID09IFwicmlnaHRcIiA/IHJlc3VsdC5lbmQgOiByZXN1bHQuc3RhcnQ7XG4gIHJldHVybiByZXN1bHRcbn1cblxuZnVuY3Rpb24gaXNJbkd1dHRlcihub2RlKSB7XG4gIGZvciAodmFyIHNjYW4gPSBub2RlOyBzY2FuOyBzY2FuID0gc2Nhbi5wYXJlbnROb2RlKVxuICAgIHsgaWYgKC9Db2RlTWlycm9yLWd1dHRlci13cmFwcGVyLy50ZXN0KHNjYW4uY2xhc3NOYW1lKSkgeyByZXR1cm4gdHJ1ZSB9IH1cbiAgcmV0dXJuIGZhbHNlXG59XG5cbmZ1bmN0aW9uIGJhZFBvcyhwb3MsIGJhZCkgeyBpZiAoYmFkKSB7IHBvcy5iYWQgPSB0cnVlOyB9IHJldHVybiBwb3MgfVxuXG5mdW5jdGlvbiBkb21UZXh0QmV0d2VlbihjbSwgZnJvbSwgdG8sIGZyb21MaW5lLCB0b0xpbmUpIHtcbiAgdmFyIHRleHQgPSBcIlwiLCBjbG9zaW5nID0gZmFsc2UsIGxpbmVTZXAgPSBjbS5kb2MubGluZVNlcGFyYXRvcigpLCBleHRyYUxpbmVicmVhayA9IGZhbHNlO1xuICBmdW5jdGlvbiByZWNvZ25pemVNYXJrZXIoaWQpIHsgcmV0dXJuIGZ1bmN0aW9uIChtYXJrZXIpIHsgcmV0dXJuIG1hcmtlci5pZCA9PSBpZDsgfSB9XG4gIGZ1bmN0aW9uIGNsb3NlKCkge1xuICAgIGlmIChjbG9zaW5nKSB7XG4gICAgICB0ZXh0ICs9IGxpbmVTZXA7XG4gICAgICBpZiAoZXh0cmFMaW5lYnJlYWspIHsgdGV4dCArPSBsaW5lU2VwOyB9XG4gICAgICBjbG9zaW5nID0gZXh0cmFMaW5lYnJlYWsgPSBmYWxzZTtcbiAgICB9XG4gIH1cbiAgZnVuY3Rpb24gYWRkVGV4dChzdHIpIHtcbiAgICBpZiAoc3RyKSB7XG4gICAgICBjbG9zZSgpO1xuICAgICAgdGV4dCArPSBzdHI7XG4gICAgfVxuICB9XG4gIGZ1bmN0aW9uIHdhbGsobm9kZSkge1xuICAgIGlmIChub2RlLm5vZGVUeXBlID09IDEpIHtcbiAgICAgIHZhciBjbVRleHQgPSBub2RlLmdldEF0dHJpYnV0ZShcImNtLXRleHRcIik7XG4gICAgICBpZiAoY21UZXh0KSB7XG4gICAgICAgIGFkZFRleHQoY21UZXh0KTtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG4gICAgICB2YXIgbWFya2VySUQgPSBub2RlLmdldEF0dHJpYnV0ZShcImNtLW1hcmtlclwiKSwgcmFuZ2UkJDE7XG4gICAgICBpZiAobWFya2VySUQpIHtcbiAgICAgICAgdmFyIGZvdW5kID0gY20uZmluZE1hcmtzKFBvcyhmcm9tTGluZSwgMCksIFBvcyh0b0xpbmUgKyAxLCAwKSwgcmVjb2duaXplTWFya2VyKCttYXJrZXJJRCkpO1xuICAgICAgICBpZiAoZm91bmQubGVuZ3RoICYmIChyYW5nZSQkMSA9IGZvdW5kWzBdLmZpbmQoMCkpKVxuICAgICAgICAgIHsgYWRkVGV4dChnZXRCZXR3ZWVuKGNtLmRvYywgcmFuZ2UkJDEuZnJvbSwgcmFuZ2UkJDEudG8pLmpvaW4obGluZVNlcCkpOyB9XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgICAgaWYgKG5vZGUuZ2V0QXR0cmlidXRlKFwiY29udGVudGVkaXRhYmxlXCIpID09IFwiZmFsc2VcIikgeyByZXR1cm4gfVxuICAgICAgdmFyIGlzQmxvY2sgPSAvXihwcmV8ZGl2fHB8bGl8dGFibGV8YnIpJC9pLnRlc3Qobm9kZS5ub2RlTmFtZSk7XG4gICAgICBpZiAoIS9eYnIkL2kudGVzdChub2RlLm5vZGVOYW1lKSAmJiBub2RlLnRleHRDb250ZW50Lmxlbmd0aCA9PSAwKSB7IHJldHVybiB9XG5cbiAgICAgIGlmIChpc0Jsb2NrKSB7IGNsb3NlKCk7IH1cbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbm9kZS5jaGlsZE5vZGVzLmxlbmd0aDsgaSsrKVxuICAgICAgICB7IHdhbGsobm9kZS5jaGlsZE5vZGVzW2ldKTsgfVxuXG4gICAgICBpZiAoL14ocHJlfHApJC9pLnRlc3Qobm9kZS5ub2RlTmFtZSkpIHsgZXh0cmFMaW5lYnJlYWsgPSB0cnVlOyB9XG4gICAgICBpZiAoaXNCbG9jaykgeyBjbG9zaW5nID0gdHJ1ZTsgfVxuICAgIH0gZWxzZSBpZiAobm9kZS5ub2RlVHlwZSA9PSAzKSB7XG4gICAgICBhZGRUZXh0KG5vZGUubm9kZVZhbHVlLnJlcGxhY2UoL1xcdTIwMGIvZywgXCJcIikucmVwbGFjZSgvXFx1MDBhMC9nLCBcIiBcIikpO1xuICAgIH1cbiAgfVxuICBmb3IgKDs7KSB7XG4gICAgd2Fsayhmcm9tKTtcbiAgICBpZiAoZnJvbSA9PSB0bykgeyBicmVhayB9XG4gICAgZnJvbSA9IGZyb20ubmV4dFNpYmxpbmc7XG4gICAgZXh0cmFMaW5lYnJlYWsgPSBmYWxzZTtcbiAgfVxuICByZXR1cm4gdGV4dFxufVxuXG5mdW5jdGlvbiBkb21Ub1BvcyhjbSwgbm9kZSwgb2Zmc2V0KSB7XG4gIHZhciBsaW5lTm9kZTtcbiAgaWYgKG5vZGUgPT0gY20uZGlzcGxheS5saW5lRGl2KSB7XG4gICAgbGluZU5vZGUgPSBjbS5kaXNwbGF5LmxpbmVEaXYuY2hpbGROb2Rlc1tvZmZzZXRdO1xuICAgIGlmICghbGluZU5vZGUpIHsgcmV0dXJuIGJhZFBvcyhjbS5jbGlwUG9zKFBvcyhjbS5kaXNwbGF5LnZpZXdUbyAtIDEpKSwgdHJ1ZSkgfVxuICAgIG5vZGUgPSBudWxsOyBvZmZzZXQgPSAwO1xuICB9IGVsc2Uge1xuICAgIGZvciAobGluZU5vZGUgPSBub2RlOzsgbGluZU5vZGUgPSBsaW5lTm9kZS5wYXJlbnROb2RlKSB7XG4gICAgICBpZiAoIWxpbmVOb2RlIHx8IGxpbmVOb2RlID09IGNtLmRpc3BsYXkubGluZURpdikgeyByZXR1cm4gbnVsbCB9XG4gICAgICBpZiAobGluZU5vZGUucGFyZW50Tm9kZSAmJiBsaW5lTm9kZS5wYXJlbnROb2RlID09IGNtLmRpc3BsYXkubGluZURpdikgeyBicmVhayB9XG4gICAgfVxuICB9XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgY20uZGlzcGxheS52aWV3Lmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIGxpbmVWaWV3ID0gY20uZGlzcGxheS52aWV3W2ldO1xuICAgIGlmIChsaW5lVmlldy5ub2RlID09IGxpbmVOb2RlKVxuICAgICAgeyByZXR1cm4gbG9jYXRlTm9kZUluTGluZVZpZXcobGluZVZpZXcsIG5vZGUsIG9mZnNldCkgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGxvY2F0ZU5vZGVJbkxpbmVWaWV3KGxpbmVWaWV3LCBub2RlLCBvZmZzZXQpIHtcbiAgdmFyIHdyYXBwZXIgPSBsaW5lVmlldy50ZXh0LmZpcnN0Q2hpbGQsIGJhZCA9IGZhbHNlO1xuICBpZiAoIW5vZGUgfHwgIWNvbnRhaW5zKHdyYXBwZXIsIG5vZGUpKSB7IHJldHVybiBiYWRQb3MoUG9zKGxpbmVObyhsaW5lVmlldy5saW5lKSwgMCksIHRydWUpIH1cbiAgaWYgKG5vZGUgPT0gd3JhcHBlcikge1xuICAgIGJhZCA9IHRydWU7XG4gICAgbm9kZSA9IHdyYXBwZXIuY2hpbGROb2Rlc1tvZmZzZXRdO1xuICAgIG9mZnNldCA9IDA7XG4gICAgaWYgKCFub2RlKSB7XG4gICAgICB2YXIgbGluZSA9IGxpbmVWaWV3LnJlc3QgPyBsc3QobGluZVZpZXcucmVzdCkgOiBsaW5lVmlldy5saW5lO1xuICAgICAgcmV0dXJuIGJhZFBvcyhQb3MobGluZU5vKGxpbmUpLCBsaW5lLnRleHQubGVuZ3RoKSwgYmFkKVxuICAgIH1cbiAgfVxuXG4gIHZhciB0ZXh0Tm9kZSA9IG5vZGUubm9kZVR5cGUgPT0gMyA/IG5vZGUgOiBudWxsLCB0b3BOb2RlID0gbm9kZTtcbiAgaWYgKCF0ZXh0Tm9kZSAmJiBub2RlLmNoaWxkTm9kZXMubGVuZ3RoID09IDEgJiYgbm9kZS5maXJzdENoaWxkLm5vZGVUeXBlID09IDMpIHtcbiAgICB0ZXh0Tm9kZSA9IG5vZGUuZmlyc3RDaGlsZDtcbiAgICBpZiAob2Zmc2V0KSB7IG9mZnNldCA9IHRleHROb2RlLm5vZGVWYWx1ZS5sZW5ndGg7IH1cbiAgfVxuICB3aGlsZSAodG9wTm9kZS5wYXJlbnROb2RlICE9IHdyYXBwZXIpIHsgdG9wTm9kZSA9IHRvcE5vZGUucGFyZW50Tm9kZTsgfVxuICB2YXIgbWVhc3VyZSA9IGxpbmVWaWV3Lm1lYXN1cmUsIG1hcHMgPSBtZWFzdXJlLm1hcHM7XG5cbiAgZnVuY3Rpb24gZmluZCh0ZXh0Tm9kZSwgdG9wTm9kZSwgb2Zmc2V0KSB7XG4gICAgZm9yICh2YXIgaSA9IC0xOyBpIDwgKG1hcHMgPyBtYXBzLmxlbmd0aCA6IDApOyBpKyspIHtcbiAgICAgIHZhciBtYXAkJDEgPSBpIDwgMCA/IG1lYXN1cmUubWFwIDogbWFwc1tpXTtcbiAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgbWFwJCQxLmxlbmd0aDsgaiArPSAzKSB7XG4gICAgICAgIHZhciBjdXJOb2RlID0gbWFwJCQxW2ogKyAyXTtcbiAgICAgICAgaWYgKGN1ck5vZGUgPT0gdGV4dE5vZGUgfHwgY3VyTm9kZSA9PSB0b3BOb2RlKSB7XG4gICAgICAgICAgdmFyIGxpbmUgPSBsaW5lTm8oaSA8IDAgPyBsaW5lVmlldy5saW5lIDogbGluZVZpZXcucmVzdFtpXSk7XG4gICAgICAgICAgdmFyIGNoID0gbWFwJCQxW2pdICsgb2Zmc2V0O1xuICAgICAgICAgIGlmIChvZmZzZXQgPCAwIHx8IGN1ck5vZGUgIT0gdGV4dE5vZGUpIHsgY2ggPSBtYXAkJDFbaiArIChvZmZzZXQgPyAxIDogMCldOyB9XG4gICAgICAgICAgcmV0dXJuIFBvcyhsaW5lLCBjaClcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuICB2YXIgZm91bmQgPSBmaW5kKHRleHROb2RlLCB0b3BOb2RlLCBvZmZzZXQpO1xuICBpZiAoZm91bmQpIHsgcmV0dXJuIGJhZFBvcyhmb3VuZCwgYmFkKSB9XG5cbiAgLy8gRklYTUUgdGhpcyBpcyBhbGwgcmVhbGx5IHNoYWt5LiBtaWdodCBoYW5kbGUgdGhlIGZldyBjYXNlcyBpdCBuZWVkcyB0byBoYW5kbGUsIGJ1dCBsaWtlbHkgdG8gY2F1c2UgcHJvYmxlbXNcbiAgZm9yICh2YXIgYWZ0ZXIgPSB0b3BOb2RlLm5leHRTaWJsaW5nLCBkaXN0ID0gdGV4dE5vZGUgPyB0ZXh0Tm9kZS5ub2RlVmFsdWUubGVuZ3RoIC0gb2Zmc2V0IDogMDsgYWZ0ZXI7IGFmdGVyID0gYWZ0ZXIubmV4dFNpYmxpbmcpIHtcbiAgICBmb3VuZCA9IGZpbmQoYWZ0ZXIsIGFmdGVyLmZpcnN0Q2hpbGQsIDApO1xuICAgIGlmIChmb3VuZClcbiAgICAgIHsgcmV0dXJuIGJhZFBvcyhQb3MoZm91bmQubGluZSwgZm91bmQuY2ggLSBkaXN0KSwgYmFkKSB9XG4gICAgZWxzZVxuICAgICAgeyBkaXN0ICs9IGFmdGVyLnRleHRDb250ZW50Lmxlbmd0aDsgfVxuICB9XG4gIGZvciAodmFyIGJlZm9yZSA9IHRvcE5vZGUucHJldmlvdXNTaWJsaW5nLCBkaXN0JDEgPSBvZmZzZXQ7IGJlZm9yZTsgYmVmb3JlID0gYmVmb3JlLnByZXZpb3VzU2libGluZykge1xuICAgIGZvdW5kID0gZmluZChiZWZvcmUsIGJlZm9yZS5maXJzdENoaWxkLCAtMSk7XG4gICAgaWYgKGZvdW5kKVxuICAgICAgeyByZXR1cm4gYmFkUG9zKFBvcyhmb3VuZC5saW5lLCBmb3VuZC5jaCArIGRpc3QkMSksIGJhZCkgfVxuICAgIGVsc2VcbiAgICAgIHsgZGlzdCQxICs9IGJlZm9yZS50ZXh0Q29udGVudC5sZW5ndGg7IH1cbiAgfVxufVxuXG4vLyBURVhUQVJFQSBJTlBVVCBTVFlMRVxuXG52YXIgVGV4dGFyZWFJbnB1dCA9IGZ1bmN0aW9uKGNtKSB7XG4gIHRoaXMuY20gPSBjbTtcbiAgLy8gU2VlIGlucHV0LnBvbGwgYW5kIGlucHV0LnJlc2V0XG4gIHRoaXMucHJldklucHV0ID0gXCJcIjtcblxuICAvLyBGbGFnIHRoYXQgaW5kaWNhdGVzIHdoZXRoZXIgd2UgZXhwZWN0IGlucHV0IHRvIGFwcGVhciByZWFsIHNvb25cbiAgLy8gbm93IChhZnRlciBzb21lIGV2ZW50IGxpa2UgJ2tleXByZXNzJyBvciAnaW5wdXQnKSBhbmQgYXJlXG4gIC8vIHBvbGxpbmcgaW50ZW5zaXZlbHkuXG4gIHRoaXMucG9sbGluZ0Zhc3QgPSBmYWxzZTtcbiAgLy8gU2VsZi1yZXNldHRpbmcgdGltZW91dCBmb3IgdGhlIHBvbGxlclxuICB0aGlzLnBvbGxpbmcgPSBuZXcgRGVsYXllZCgpO1xuICAvLyBVc2VkIHRvIHdvcmsgYXJvdW5kIElFIGlzc3VlIHdpdGggc2VsZWN0aW9uIGJlaW5nIGZvcmdvdHRlbiB3aGVuIGZvY3VzIG1vdmVzIGF3YXkgZnJvbSB0ZXh0YXJlYVxuICB0aGlzLmhhc1NlbGVjdGlvbiA9IGZhbHNlO1xuICB0aGlzLmNvbXBvc2luZyA9IG51bGw7XG59O1xuXG5UZXh0YXJlYUlucHV0LnByb3RvdHlwZS5pbml0ID0gZnVuY3Rpb24gKGRpc3BsYXkpIHtcbiAgICB2YXIgdGhpcyQxID0gdGhpcztcblxuICB2YXIgaW5wdXQgPSB0aGlzLCBjbSA9IHRoaXMuY207XG4gIHRoaXMuY3JlYXRlRmllbGQoZGlzcGxheSk7XG4gIHZhciB0ZSA9IHRoaXMudGV4dGFyZWE7XG5cbiAgZGlzcGxheS53cmFwcGVyLmluc2VydEJlZm9yZSh0aGlzLndyYXBwZXIsIGRpc3BsYXkud3JhcHBlci5maXJzdENoaWxkKTtcblxuICAvLyBOZWVkZWQgdG8gaGlkZSBiaWcgYmx1ZSBibGlua2luZyBjdXJzb3Igb24gTW9iaWxlIFNhZmFyaSAoZG9lc24ndCBzZWVtIHRvIHdvcmsgaW4gaU9TIDggYW55bW9yZSlcbiAgaWYgKGlvcykgeyB0ZS5zdHlsZS53aWR0aCA9IFwiMHB4XCI7IH1cblxuICBvbih0ZSwgXCJpbnB1dFwiLCBmdW5jdGlvbiAoKSB7XG4gICAgaWYgKGllICYmIGllX3ZlcnNpb24gPj0gOSAmJiB0aGlzJDEuaGFzU2VsZWN0aW9uKSB7IHRoaXMkMS5oYXNTZWxlY3Rpb24gPSBudWxsOyB9XG4gICAgaW5wdXQucG9sbCgpO1xuICB9KTtcblxuICBvbih0ZSwgXCJwYXN0ZVwiLCBmdW5jdGlvbiAoZSkge1xuICAgIGlmIChzaWduYWxET01FdmVudChjbSwgZSkgfHwgaGFuZGxlUGFzdGUoZSwgY20pKSB7IHJldHVybiB9XG5cbiAgICBjbS5zdGF0ZS5wYXN0ZUluY29taW5nID0gdHJ1ZTtcbiAgICBpbnB1dC5mYXN0UG9sbCgpO1xuICB9KTtcblxuICBmdW5jdGlvbiBwcmVwYXJlQ29weUN1dChlKSB7XG4gICAgaWYgKHNpZ25hbERPTUV2ZW50KGNtLCBlKSkgeyByZXR1cm4gfVxuICAgIGlmIChjbS5zb21ldGhpbmdTZWxlY3RlZCgpKSB7XG4gICAgICBzZXRMYXN0Q29waWVkKHtsaW5lV2lzZTogZmFsc2UsIHRleHQ6IGNtLmdldFNlbGVjdGlvbnMoKX0pO1xuICAgIH0gZWxzZSBpZiAoIWNtLm9wdGlvbnMubGluZVdpc2VDb3B5Q3V0KSB7XG4gICAgICByZXR1cm5cbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIHJhbmdlcyA9IGNvcHlhYmxlUmFuZ2VzKGNtKTtcbiAgICAgIHNldExhc3RDb3BpZWQoe2xpbmVXaXNlOiB0cnVlLCB0ZXh0OiByYW5nZXMudGV4dH0pO1xuICAgICAgaWYgKGUudHlwZSA9PSBcImN1dFwiKSB7XG4gICAgICAgIGNtLnNldFNlbGVjdGlvbnMocmFuZ2VzLnJhbmdlcywgbnVsbCwgc2VsX2RvbnRTY3JvbGwpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaW5wdXQucHJldklucHV0ID0gXCJcIjtcbiAgICAgICAgdGUudmFsdWUgPSByYW5nZXMudGV4dC5qb2luKFwiXFxuXCIpO1xuICAgICAgICBzZWxlY3RJbnB1dCh0ZSk7XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChlLnR5cGUgPT0gXCJjdXRcIikgeyBjbS5zdGF0ZS5jdXRJbmNvbWluZyA9IHRydWU7IH1cbiAgfVxuICBvbih0ZSwgXCJjdXRcIiwgcHJlcGFyZUNvcHlDdXQpO1xuICBvbih0ZSwgXCJjb3B5XCIsIHByZXBhcmVDb3B5Q3V0KTtcblxuICBvbihkaXNwbGF5LnNjcm9sbGVyLCBcInBhc3RlXCIsIGZ1bmN0aW9uIChlKSB7XG4gICAgaWYgKGV2ZW50SW5XaWRnZXQoZGlzcGxheSwgZSkgfHwgc2lnbmFsRE9NRXZlbnQoY20sIGUpKSB7IHJldHVybiB9XG4gICAgY20uc3RhdGUucGFzdGVJbmNvbWluZyA9IHRydWU7XG4gICAgaW5wdXQuZm9jdXMoKTtcbiAgfSk7XG5cbiAgLy8gUHJldmVudCBub3JtYWwgc2VsZWN0aW9uIGluIHRoZSBlZGl0b3IgKHdlIGhhbmRsZSBvdXIgb3duKVxuICBvbihkaXNwbGF5LmxpbmVTcGFjZSwgXCJzZWxlY3RzdGFydFwiLCBmdW5jdGlvbiAoZSkge1xuICAgIGlmICghZXZlbnRJbldpZGdldChkaXNwbGF5LCBlKSkgeyBlX3ByZXZlbnREZWZhdWx0KGUpOyB9XG4gIH0pO1xuXG4gIG9uKHRlLCBcImNvbXBvc2l0aW9uc3RhcnRcIiwgZnVuY3Rpb24gKCkge1xuICAgIHZhciBzdGFydCA9IGNtLmdldEN1cnNvcihcImZyb21cIik7XG4gICAgaWYgKGlucHV0LmNvbXBvc2luZykgeyBpbnB1dC5jb21wb3NpbmcucmFuZ2UuY2xlYXIoKTsgfVxuICAgIGlucHV0LmNvbXBvc2luZyA9IHtcbiAgICAgIHN0YXJ0OiBzdGFydCxcbiAgICAgIHJhbmdlOiBjbS5tYXJrVGV4dChzdGFydCwgY20uZ2V0Q3Vyc29yKFwidG9cIiksIHtjbGFzc05hbWU6IFwiQ29kZU1pcnJvci1jb21wb3NpbmdcIn0pXG4gICAgfTtcbiAgfSk7XG4gIG9uKHRlLCBcImNvbXBvc2l0aW9uZW5kXCIsIGZ1bmN0aW9uICgpIHtcbiAgICBpZiAoaW5wdXQuY29tcG9zaW5nKSB7XG4gICAgICBpbnB1dC5wb2xsKCk7XG4gICAgICBpbnB1dC5jb21wb3NpbmcucmFuZ2UuY2xlYXIoKTtcbiAgICAgIGlucHV0LmNvbXBvc2luZyA9IG51bGw7XG4gICAgfVxuICB9KTtcbn07XG5cblRleHRhcmVhSW5wdXQucHJvdG90eXBlLmNyZWF0ZUZpZWxkID0gZnVuY3Rpb24gKF9kaXNwbGF5KSB7XG4gIC8vIFdyYXBzIGFuZCBoaWRlcyBpbnB1dCB0ZXh0YXJlYVxuICB0aGlzLndyYXBwZXIgPSBoaWRkZW5UZXh0YXJlYSgpO1xuICAvLyBUaGUgc2VtaWhpZGRlbiB0ZXh0YXJlYSB0aGF0IGlzIGZvY3VzZWQgd2hlbiB0aGUgZWRpdG9yIGlzXG4gIC8vIGZvY3VzZWQsIGFuZCByZWNlaXZlcyBpbnB1dC5cbiAgdGhpcy50ZXh0YXJlYSA9IHRoaXMud3JhcHBlci5maXJzdENoaWxkO1xufTtcblxuVGV4dGFyZWFJbnB1dC5wcm90b3R5cGUucHJlcGFyZVNlbGVjdGlvbiA9IGZ1bmN0aW9uICgpIHtcbiAgLy8gUmVkcmF3IHRoZSBzZWxlY3Rpb24gYW5kL29yIGN1cnNvclxuICB2YXIgY20gPSB0aGlzLmNtLCBkaXNwbGF5ID0gY20uZGlzcGxheSwgZG9jID0gY20uZG9jO1xuICB2YXIgcmVzdWx0ID0gcHJlcGFyZVNlbGVjdGlvbihjbSk7XG5cbiAgLy8gTW92ZSB0aGUgaGlkZGVuIHRleHRhcmVhIG5lYXIgdGhlIGN1cnNvciB0byBwcmV2ZW50IHNjcm9sbGluZyBhcnRpZmFjdHNcbiAgaWYgKGNtLm9wdGlvbnMubW92ZUlucHV0V2l0aEN1cnNvcikge1xuICAgIHZhciBoZWFkUG9zID0gY3Vyc29yQ29vcmRzKGNtLCBkb2Muc2VsLnByaW1hcnkoKS5oZWFkLCBcImRpdlwiKTtcbiAgICB2YXIgd3JhcE9mZiA9IGRpc3BsYXkud3JhcHBlci5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKSwgbGluZU9mZiA9IGRpc3BsYXkubGluZURpdi5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICByZXN1bHQudGVUb3AgPSBNYXRoLm1heCgwLCBNYXRoLm1pbihkaXNwbGF5LndyYXBwZXIuY2xpZW50SGVpZ2h0IC0gMTAsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaGVhZFBvcy50b3AgKyBsaW5lT2ZmLnRvcCAtIHdyYXBPZmYudG9wKSk7XG4gICAgcmVzdWx0LnRlTGVmdCA9IE1hdGgubWF4KDAsIE1hdGgubWluKGRpc3BsYXkud3JhcHBlci5jbGllbnRXaWR0aCAtIDEwLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBoZWFkUG9zLmxlZnQgKyBsaW5lT2ZmLmxlZnQgLSB3cmFwT2ZmLmxlZnQpKTtcbiAgfVxuXG4gIHJldHVybiByZXN1bHRcbn07XG5cblRleHRhcmVhSW5wdXQucHJvdG90eXBlLnNob3dTZWxlY3Rpb24gPSBmdW5jdGlvbiAoZHJhd24pIHtcbiAgdmFyIGNtID0gdGhpcy5jbSwgZGlzcGxheSA9IGNtLmRpc3BsYXk7XG4gIHJlbW92ZUNoaWxkcmVuQW5kQWRkKGRpc3BsYXkuY3Vyc29yRGl2LCBkcmF3bi5jdXJzb3JzKTtcbiAgcmVtb3ZlQ2hpbGRyZW5BbmRBZGQoZGlzcGxheS5zZWxlY3Rpb25EaXYsIGRyYXduLnNlbGVjdGlvbik7XG4gIGlmIChkcmF3bi50ZVRvcCAhPSBudWxsKSB7XG4gICAgdGhpcy53cmFwcGVyLnN0eWxlLnRvcCA9IGRyYXduLnRlVG9wICsgXCJweFwiO1xuICAgIHRoaXMud3JhcHBlci5zdHlsZS5sZWZ0ID0gZHJhd24udGVMZWZ0ICsgXCJweFwiO1xuICB9XG59O1xuXG4vLyBSZXNldCB0aGUgaW5wdXQgdG8gY29ycmVzcG9uZCB0byB0aGUgc2VsZWN0aW9uIChvciB0byBiZSBlbXB0eSxcbi8vIHdoZW4gbm90IHR5cGluZyBhbmQgbm90aGluZyBpcyBzZWxlY3RlZClcblRleHRhcmVhSW5wdXQucHJvdG90eXBlLnJlc2V0ID0gZnVuY3Rpb24gKHR5cGluZykge1xuICBpZiAodGhpcy5jb250ZXh0TWVudVBlbmRpbmcgfHwgdGhpcy5jb21wb3NpbmcpIHsgcmV0dXJuIH1cbiAgdmFyIGNtID0gdGhpcy5jbTtcbiAgaWYgKGNtLnNvbWV0aGluZ1NlbGVjdGVkKCkpIHtcbiAgICB0aGlzLnByZXZJbnB1dCA9IFwiXCI7XG4gICAgdmFyIGNvbnRlbnQgPSBjbS5nZXRTZWxlY3Rpb24oKTtcbiAgICB0aGlzLnRleHRhcmVhLnZhbHVlID0gY29udGVudDtcbiAgICBpZiAoY20uc3RhdGUuZm9jdXNlZCkgeyBzZWxlY3RJbnB1dCh0aGlzLnRleHRhcmVhKTsgfVxuICAgIGlmIChpZSAmJiBpZV92ZXJzaW9uID49IDkpIHsgdGhpcy5oYXNTZWxlY3Rpb24gPSBjb250ZW50OyB9XG4gIH0gZWxzZSBpZiAoIXR5cGluZykge1xuICAgIHRoaXMucHJldklucHV0ID0gdGhpcy50ZXh0YXJlYS52YWx1ZSA9IFwiXCI7XG4gICAgaWYgKGllICYmIGllX3ZlcnNpb24gPj0gOSkgeyB0aGlzLmhhc1NlbGVjdGlvbiA9IG51bGw7IH1cbiAgfVxufTtcblxuVGV4dGFyZWFJbnB1dC5wcm90b3R5cGUuZ2V0RmllbGQgPSBmdW5jdGlvbiAoKSB7IHJldHVybiB0aGlzLnRleHRhcmVhIH07XG5cblRleHRhcmVhSW5wdXQucHJvdG90eXBlLnN1cHBvcnRzVG91Y2ggPSBmdW5jdGlvbiAoKSB7IHJldHVybiBmYWxzZSB9O1xuXG5UZXh0YXJlYUlucHV0LnByb3RvdHlwZS5mb2N1cyA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuY20ub3B0aW9ucy5yZWFkT25seSAhPSBcIm5vY3Vyc29yXCIgJiYgKCFtb2JpbGUgfHwgYWN0aXZlRWx0KCkgIT0gdGhpcy50ZXh0YXJlYSkpIHtcbiAgICB0cnkgeyB0aGlzLnRleHRhcmVhLmZvY3VzKCk7IH1cbiAgICBjYXRjaCAoZSkge30gLy8gSUU4IHdpbGwgdGhyb3cgaWYgdGhlIHRleHRhcmVhIGlzIGRpc3BsYXk6IG5vbmUgb3Igbm90IGluIERPTVxuICB9XG59O1xuXG5UZXh0YXJlYUlucHV0LnByb3RvdHlwZS5ibHVyID0gZnVuY3Rpb24gKCkgeyB0aGlzLnRleHRhcmVhLmJsdXIoKTsgfTtcblxuVGV4dGFyZWFJbnB1dC5wcm90b3R5cGUucmVzZXRQb3NpdGlvbiA9IGZ1bmN0aW9uICgpIHtcbiAgdGhpcy53cmFwcGVyLnN0eWxlLnRvcCA9IHRoaXMud3JhcHBlci5zdHlsZS5sZWZ0ID0gMDtcbn07XG5cblRleHRhcmVhSW5wdXQucHJvdG90eXBlLnJlY2VpdmVkRm9jdXMgPSBmdW5jdGlvbiAoKSB7IHRoaXMuc2xvd1BvbGwoKTsgfTtcblxuLy8gUG9sbCBmb3IgaW5wdXQgY2hhbmdlcywgdXNpbmcgdGhlIG5vcm1hbCByYXRlIG9mIHBvbGxpbmcuIFRoaXNcbi8vIHJ1bnMgYXMgbG9uZyBhcyB0aGUgZWRpdG9yIGlzIGZvY3VzZWQuXG5UZXh0YXJlYUlucHV0LnByb3RvdHlwZS5zbG93UG9sbCA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgdGhpcyQxID0gdGhpcztcblxuICBpZiAodGhpcy5wb2xsaW5nRmFzdCkgeyByZXR1cm4gfVxuICB0aGlzLnBvbGxpbmcuc2V0KHRoaXMuY20ub3B0aW9ucy5wb2xsSW50ZXJ2YWwsIGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzJDEucG9sbCgpO1xuICAgIGlmICh0aGlzJDEuY20uc3RhdGUuZm9jdXNlZCkgeyB0aGlzJDEuc2xvd1BvbGwoKTsgfVxuICB9KTtcbn07XG5cbi8vIFdoZW4gYW4gZXZlbnQgaGFzIGp1c3QgY29tZSBpbiB0aGF0IGlzIGxpa2VseSB0byBhZGQgb3IgY2hhbmdlXG4vLyBzb21ldGhpbmcgaW4gdGhlIGlucHV0IHRleHRhcmVhLCB3ZSBwb2xsIGZhc3RlciwgdG8gZW5zdXJlIHRoYXRcbi8vIHRoZSBjaGFuZ2UgYXBwZWFycyBvbiB0aGUgc2NyZWVuIHF1aWNrbHkuXG5UZXh0YXJlYUlucHV0LnByb3RvdHlwZS5mYXN0UG9sbCA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIG1pc3NlZCA9IGZhbHNlLCBpbnB1dCA9IHRoaXM7XG4gIGlucHV0LnBvbGxpbmdGYXN0ID0gdHJ1ZTtcbiAgZnVuY3Rpb24gcCgpIHtcbiAgICB2YXIgY2hhbmdlZCA9IGlucHV0LnBvbGwoKTtcbiAgICBpZiAoIWNoYW5nZWQgJiYgIW1pc3NlZCkge21pc3NlZCA9IHRydWU7IGlucHV0LnBvbGxpbmcuc2V0KDYwLCBwKTt9XG4gICAgZWxzZSB7aW5wdXQucG9sbGluZ0Zhc3QgPSBmYWxzZTsgaW5wdXQuc2xvd1BvbGwoKTt9XG4gIH1cbiAgaW5wdXQucG9sbGluZy5zZXQoMjAsIHApO1xufTtcblxuLy8gUmVhZCBpbnB1dCBmcm9tIHRoZSB0ZXh0YXJlYSwgYW5kIHVwZGF0ZSB0aGUgZG9jdW1lbnQgdG8gbWF0Y2guXG4vLyBXaGVuIHNvbWV0aGluZyBpcyBzZWxlY3RlZCwgaXQgaXMgcHJlc2VudCBpbiB0aGUgdGV4dGFyZWEsIGFuZFxuLy8gc2VsZWN0ZWQgKHVubGVzcyBpdCBpcyBodWdlLCBpbiB3aGljaCBjYXNlIGEgcGxhY2Vob2xkZXIgaXNcbi8vIHVzZWQpLiBXaGVuIG5vdGhpbmcgaXMgc2VsZWN0ZWQsIHRoZSBjdXJzb3Igc2l0cyBhZnRlciBwcmV2aW91c2x5XG4vLyBzZWVuIHRleHQgKGNhbiBiZSBlbXB0eSksIHdoaWNoIGlzIHN0b3JlZCBpbiBwcmV2SW5wdXQgKHdlIG11c3Rcbi8vIG5vdCByZXNldCB0aGUgdGV4dGFyZWEgd2hlbiB0eXBpbmcsIGJlY2F1c2UgdGhhdCBicmVha3MgSU1FKS5cblRleHRhcmVhSW5wdXQucHJvdG90eXBlLnBvbGwgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHRoaXMkMSA9IHRoaXM7XG5cbiAgdmFyIGNtID0gdGhpcy5jbSwgaW5wdXQgPSB0aGlzLnRleHRhcmVhLCBwcmV2SW5wdXQgPSB0aGlzLnByZXZJbnB1dDtcbiAgLy8gU2luY2UgdGhpcyBpcyBjYWxsZWQgYSAqbG90KiwgdHJ5IHRvIGJhaWwgb3V0IGFzIGNoZWFwbHkgYXNcbiAgLy8gcG9zc2libGUgd2hlbiBpdCBpcyBjbGVhciB0aGF0IG5vdGhpbmcgaGFwcGVuZWQuIGhhc1NlbGVjdGlvblxuICAvLyB3aWxsIGJlIHRoZSBjYXNlIHdoZW4gdGhlcmUgaXMgYSBsb3Qgb2YgdGV4dCBpbiB0aGUgdGV4dGFyZWEsXG4gIC8vIGluIHdoaWNoIGNhc2UgcmVhZGluZyBpdHMgdmFsdWUgd291bGQgYmUgZXhwZW5zaXZlLlxuICBpZiAodGhpcy5jb250ZXh0TWVudVBlbmRpbmcgfHwgIWNtLnN0YXRlLmZvY3VzZWQgfHxcbiAgICAgIChoYXNTZWxlY3Rpb24oaW5wdXQpICYmICFwcmV2SW5wdXQgJiYgIXRoaXMuY29tcG9zaW5nKSB8fFxuICAgICAgY20uaXNSZWFkT25seSgpIHx8IGNtLm9wdGlvbnMuZGlzYWJsZUlucHV0IHx8IGNtLnN0YXRlLmtleVNlcSlcbiAgICB7IHJldHVybiBmYWxzZSB9XG5cbiAgdmFyIHRleHQgPSBpbnB1dC52YWx1ZTtcbiAgLy8gSWYgbm90aGluZyBjaGFuZ2VkLCBiYWlsLlxuICBpZiAodGV4dCA9PSBwcmV2SW5wdXQgJiYgIWNtLnNvbWV0aGluZ1NlbGVjdGVkKCkpIHsgcmV0dXJuIGZhbHNlIH1cbiAgLy8gV29yayBhcm91bmQgbm9uc2Vuc2ljYWwgc2VsZWN0aW9uIHJlc2V0dGluZyBpbiBJRTkvMTAsIGFuZFxuICAvLyBpbmV4cGxpY2FibGUgYXBwZWFyYW5jZSBvZiBwcml2YXRlIGFyZWEgdW5pY29kZSBjaGFyYWN0ZXJzIG9uXG4gIC8vIHNvbWUga2V5IGNvbWJvcyBpbiBNYWMgKCMyNjg5KS5cbiAgaWYgKGllICYmIGllX3ZlcnNpb24gPj0gOSAmJiB0aGlzLmhhc1NlbGVjdGlvbiA9PT0gdGV4dCB8fFxuICAgICAgbWFjICYmIC9bXFx1ZjcwMC1cXHVmN2ZmXS8udGVzdCh0ZXh0KSkge1xuICAgIGNtLmRpc3BsYXkuaW5wdXQucmVzZXQoKTtcbiAgICByZXR1cm4gZmFsc2VcbiAgfVxuXG4gIGlmIChjbS5kb2Muc2VsID09IGNtLmRpc3BsYXkuc2VsRm9yQ29udGV4dE1lbnUpIHtcbiAgICB2YXIgZmlyc3QgPSB0ZXh0LmNoYXJDb2RlQXQoMCk7XG4gICAgaWYgKGZpcnN0ID09IDB4MjAwYiAmJiAhcHJldklucHV0KSB7IHByZXZJbnB1dCA9IFwiXFx1MjAwYlwiOyB9XG4gICAgaWYgKGZpcnN0ID09IDB4MjFkYSkgeyB0aGlzLnJlc2V0KCk7IHJldHVybiB0aGlzLmNtLmV4ZWNDb21tYW5kKFwidW5kb1wiKSB9XG4gIH1cbiAgLy8gRmluZCB0aGUgcGFydCBvZiB0aGUgaW5wdXQgdGhhdCBpcyBhY3R1YWxseSBuZXdcbiAgdmFyIHNhbWUgPSAwLCBsID0gTWF0aC5taW4ocHJldklucHV0Lmxlbmd0aCwgdGV4dC5sZW5ndGgpO1xuICB3aGlsZSAoc2FtZSA8IGwgJiYgcHJldklucHV0LmNoYXJDb2RlQXQoc2FtZSkgPT0gdGV4dC5jaGFyQ29kZUF0KHNhbWUpKSB7ICsrc2FtZTsgfVxuXG4gIHJ1bkluT3AoY20sIGZ1bmN0aW9uICgpIHtcbiAgICBhcHBseVRleHRJbnB1dChjbSwgdGV4dC5zbGljZShzYW1lKSwgcHJldklucHV0Lmxlbmd0aCAtIHNhbWUsXG4gICAgICAgICAgICAgICAgICAgbnVsbCwgdGhpcyQxLmNvbXBvc2luZyA/IFwiKmNvbXBvc2VcIiA6IG51bGwpO1xuXG4gICAgLy8gRG9uJ3QgbGVhdmUgbG9uZyB0ZXh0IGluIHRoZSB0ZXh0YXJlYSwgc2luY2UgaXQgbWFrZXMgZnVydGhlciBwb2xsaW5nIHNsb3dcbiAgICBpZiAodGV4dC5sZW5ndGggPiAxMDAwIHx8IHRleHQuaW5kZXhPZihcIlxcblwiKSA+IC0xKSB7IGlucHV0LnZhbHVlID0gdGhpcyQxLnByZXZJbnB1dCA9IFwiXCI7IH1cbiAgICBlbHNlIHsgdGhpcyQxLnByZXZJbnB1dCA9IHRleHQ7IH1cblxuICAgIGlmICh0aGlzJDEuY29tcG9zaW5nKSB7XG4gICAgICB0aGlzJDEuY29tcG9zaW5nLnJhbmdlLmNsZWFyKCk7XG4gICAgICB0aGlzJDEuY29tcG9zaW5nLnJhbmdlID0gY20ubWFya1RleHQodGhpcyQxLmNvbXBvc2luZy5zdGFydCwgY20uZ2V0Q3Vyc29yKFwidG9cIiksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHtjbGFzc05hbWU6IFwiQ29kZU1pcnJvci1jb21wb3NpbmdcIn0pO1xuICAgIH1cbiAgfSk7XG4gIHJldHVybiB0cnVlXG59O1xuXG5UZXh0YXJlYUlucHV0LnByb3RvdHlwZS5lbnN1cmVQb2xsZWQgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLnBvbGxpbmdGYXN0ICYmIHRoaXMucG9sbCgpKSB7IHRoaXMucG9sbGluZ0Zhc3QgPSBmYWxzZTsgfVxufTtcblxuVGV4dGFyZWFJbnB1dC5wcm90b3R5cGUub25LZXlQcmVzcyA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKGllICYmIGllX3ZlcnNpb24gPj0gOSkgeyB0aGlzLmhhc1NlbGVjdGlvbiA9IG51bGw7IH1cbiAgdGhpcy5mYXN0UG9sbCgpO1xufTtcblxuVGV4dGFyZWFJbnB1dC5wcm90b3R5cGUub25Db250ZXh0TWVudSA9IGZ1bmN0aW9uIChlKSB7XG4gIHZhciBpbnB1dCA9IHRoaXMsIGNtID0gaW5wdXQuY20sIGRpc3BsYXkgPSBjbS5kaXNwbGF5LCB0ZSA9IGlucHV0LnRleHRhcmVhO1xuICB2YXIgcG9zID0gcG9zRnJvbU1vdXNlKGNtLCBlKSwgc2Nyb2xsUG9zID0gZGlzcGxheS5zY3JvbGxlci5zY3JvbGxUb3A7XG4gIGlmICghcG9zIHx8IHByZXN0bykgeyByZXR1cm4gfSAvLyBPcGVyYSBpcyBkaWZmaWN1bHQuXG5cbiAgLy8gUmVzZXQgdGhlIGN1cnJlbnQgdGV4dCBzZWxlY3Rpb24gb25seSBpZiB0aGUgY2xpY2sgaXMgZG9uZSBvdXRzaWRlIG9mIHRoZSBzZWxlY3Rpb25cbiAgLy8gYW5kICdyZXNldFNlbGVjdGlvbk9uQ29udGV4dE1lbnUnIG9wdGlvbiBpcyB0cnVlLlxuICB2YXIgcmVzZXQgPSBjbS5vcHRpb25zLnJlc2V0U2VsZWN0aW9uT25Db250ZXh0TWVudTtcbiAgaWYgKHJlc2V0ICYmIGNtLmRvYy5zZWwuY29udGFpbnMocG9zKSA9PSAtMSlcbiAgICB7IG9wZXJhdGlvbihjbSwgc2V0U2VsZWN0aW9uKShjbS5kb2MsIHNpbXBsZVNlbGVjdGlvbihwb3MpLCBzZWxfZG9udFNjcm9sbCk7IH1cblxuICB2YXIgb2xkQ1NTID0gdGUuc3R5bGUuY3NzVGV4dCwgb2xkV3JhcHBlckNTUyA9IGlucHV0LndyYXBwZXIuc3R5bGUuY3NzVGV4dDtcbiAgaW5wdXQud3JhcHBlci5zdHlsZS5jc3NUZXh0ID0gXCJwb3NpdGlvbjogYWJzb2x1dGVcIjtcbiAgdmFyIHdyYXBwZXJCb3ggPSBpbnB1dC53cmFwcGVyLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICB0ZS5zdHlsZS5jc3NUZXh0ID0gXCJwb3NpdGlvbjogYWJzb2x1dGU7IHdpZHRoOiAzMHB4OyBoZWlnaHQ6IDMwcHg7XFxuICAgICAgdG9wOiBcIiArIChlLmNsaWVudFkgLSB3cmFwcGVyQm94LnRvcCAtIDUpICsgXCJweDsgbGVmdDogXCIgKyAoZS5jbGllbnRYIC0gd3JhcHBlckJveC5sZWZ0IC0gNSkgKyBcInB4O1xcbiAgICAgIHotaW5kZXg6IDEwMDA7IGJhY2tncm91bmQ6IFwiICsgKGllID8gXCJyZ2JhKDI1NSwgMjU1LCAyNTUsIC4wNSlcIiA6IFwidHJhbnNwYXJlbnRcIikgKyBcIjtcXG4gICAgICBvdXRsaW5lOiBub25lOyBib3JkZXItd2lkdGg6IDA7IG91dGxpbmU6IG5vbmU7IG92ZXJmbG93OiBoaWRkZW47IG9wYWNpdHk6IC4wNTsgZmlsdGVyOiBhbHBoYShvcGFjaXR5PTUpO1wiO1xuICB2YXIgb2xkU2Nyb2xsWTtcbiAgaWYgKHdlYmtpdCkgeyBvbGRTY3JvbGxZID0gd2luZG93LnNjcm9sbFk7IH0gLy8gV29yayBhcm91bmQgQ2hyb21lIGlzc3VlICgjMjcxMilcbiAgZGlzcGxheS5pbnB1dC5mb2N1cygpO1xuICBpZiAod2Via2l0KSB7IHdpbmRvdy5zY3JvbGxUbyhudWxsLCBvbGRTY3JvbGxZKTsgfVxuICBkaXNwbGF5LmlucHV0LnJlc2V0KCk7XG4gIC8vIEFkZHMgXCJTZWxlY3QgYWxsXCIgdG8gY29udGV4dCBtZW51IGluIEZGXG4gIGlmICghY20uc29tZXRoaW5nU2VsZWN0ZWQoKSkgeyB0ZS52YWx1ZSA9IGlucHV0LnByZXZJbnB1dCA9IFwiIFwiOyB9XG4gIGlucHV0LmNvbnRleHRNZW51UGVuZGluZyA9IHRydWU7XG4gIGRpc3BsYXkuc2VsRm9yQ29udGV4dE1lbnUgPSBjbS5kb2Muc2VsO1xuICBjbGVhclRpbWVvdXQoZGlzcGxheS5kZXRlY3RpbmdTZWxlY3RBbGwpO1xuXG4gIC8vIFNlbGVjdC1hbGwgd2lsbCBiZSBncmV5ZWQgb3V0IGlmIHRoZXJlJ3Mgbm90aGluZyB0byBzZWxlY3QsIHNvXG4gIC8vIHRoaXMgYWRkcyBhIHplcm8td2lkdGggc3BhY2Ugc28gdGhhdCB3ZSBjYW4gbGF0ZXIgY2hlY2sgd2hldGhlclxuICAvLyBpdCBnb3Qgc2VsZWN0ZWQuXG4gIGZ1bmN0aW9uIHByZXBhcmVTZWxlY3RBbGxIYWNrKCkge1xuICAgIGlmICh0ZS5zZWxlY3Rpb25TdGFydCAhPSBudWxsKSB7XG4gICAgICB2YXIgc2VsZWN0ZWQgPSBjbS5zb21ldGhpbmdTZWxlY3RlZCgpO1xuICAgICAgdmFyIGV4dHZhbCA9IFwiXFx1MjAwYlwiICsgKHNlbGVjdGVkID8gdGUudmFsdWUgOiBcIlwiKTtcbiAgICAgIHRlLnZhbHVlID0gXCJcXHUyMWRhXCI7IC8vIFVzZWQgdG8gY2F0Y2ggY29udGV4dC1tZW51IHVuZG9cbiAgICAgIHRlLnZhbHVlID0gZXh0dmFsO1xuICAgICAgaW5wdXQucHJldklucHV0ID0gc2VsZWN0ZWQgPyBcIlwiIDogXCJcXHUyMDBiXCI7XG4gICAgICB0ZS5zZWxlY3Rpb25TdGFydCA9IDE7IHRlLnNlbGVjdGlvbkVuZCA9IGV4dHZhbC5sZW5ndGg7XG4gICAgICAvLyBSZS1zZXQgdGhpcywgaW4gY2FzZSBzb21lIG90aGVyIGhhbmRsZXIgdG91Y2hlZCB0aGVcbiAgICAgIC8vIHNlbGVjdGlvbiBpbiB0aGUgbWVhbnRpbWUuXG4gICAgICBkaXNwbGF5LnNlbEZvckNvbnRleHRNZW51ID0gY20uZG9jLnNlbDtcbiAgICB9XG4gIH1cbiAgZnVuY3Rpb24gcmVoaWRlKCkge1xuICAgIGlucHV0LmNvbnRleHRNZW51UGVuZGluZyA9IGZhbHNlO1xuICAgIGlucHV0LndyYXBwZXIuc3R5bGUuY3NzVGV4dCA9IG9sZFdyYXBwZXJDU1M7XG4gICAgdGUuc3R5bGUuY3NzVGV4dCA9IG9sZENTUztcbiAgICBpZiAoaWUgJiYgaWVfdmVyc2lvbiA8IDkpIHsgZGlzcGxheS5zY3JvbGxiYXJzLnNldFNjcm9sbFRvcChkaXNwbGF5LnNjcm9sbGVyLnNjcm9sbFRvcCA9IHNjcm9sbFBvcyk7IH1cblxuICAgIC8vIFRyeSB0byBkZXRlY3QgdGhlIHVzZXIgY2hvb3Npbmcgc2VsZWN0LWFsbFxuICAgIGlmICh0ZS5zZWxlY3Rpb25TdGFydCAhPSBudWxsKSB7XG4gICAgICBpZiAoIWllIHx8IChpZSAmJiBpZV92ZXJzaW9uIDwgOSkpIHsgcHJlcGFyZVNlbGVjdEFsbEhhY2soKTsgfVxuICAgICAgdmFyIGkgPSAwLCBwb2xsID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAoZGlzcGxheS5zZWxGb3JDb250ZXh0TWVudSA9PSBjbS5kb2Muc2VsICYmIHRlLnNlbGVjdGlvblN0YXJ0ID09IDAgJiZcbiAgICAgICAgICAgIHRlLnNlbGVjdGlvbkVuZCA+IDAgJiYgaW5wdXQucHJldklucHV0ID09IFwiXFx1MjAwYlwiKSB7XG4gICAgICAgICAgb3BlcmF0aW9uKGNtLCBzZWxlY3RBbGwpKGNtKTtcbiAgICAgICAgfSBlbHNlIGlmIChpKysgPCAxMCkge1xuICAgICAgICAgIGRpc3BsYXkuZGV0ZWN0aW5nU2VsZWN0QWxsID0gc2V0VGltZW91dChwb2xsLCA1MDApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGRpc3BsYXkuc2VsRm9yQ29udGV4dE1lbnUgPSBudWxsO1xuICAgICAgICAgIGRpc3BsYXkuaW5wdXQucmVzZXQoKTtcbiAgICAgICAgfVxuICAgICAgfTtcbiAgICAgIGRpc3BsYXkuZGV0ZWN0aW5nU2VsZWN0QWxsID0gc2V0VGltZW91dChwb2xsLCAyMDApO1xuICAgIH1cbiAgfVxuXG4gIGlmIChpZSAmJiBpZV92ZXJzaW9uID49IDkpIHsgcHJlcGFyZVNlbGVjdEFsbEhhY2soKTsgfVxuICBpZiAoY2FwdHVyZVJpZ2h0Q2xpY2spIHtcbiAgICBlX3N0b3AoZSk7XG4gICAgdmFyIG1vdXNldXAgPSBmdW5jdGlvbiAoKSB7XG4gICAgICBvZmYod2luZG93LCBcIm1vdXNldXBcIiwgbW91c2V1cCk7XG4gICAgICBzZXRUaW1lb3V0KHJlaGlkZSwgMjApO1xuICAgIH07XG4gICAgb24od2luZG93LCBcIm1vdXNldXBcIiwgbW91c2V1cCk7XG4gIH0gZWxzZSB7XG4gICAgc2V0VGltZW91dChyZWhpZGUsIDUwKTtcbiAgfVxufTtcblxuVGV4dGFyZWFJbnB1dC5wcm90b3R5cGUucmVhZE9ubHlDaGFuZ2VkID0gZnVuY3Rpb24gKHZhbCkge1xuICBpZiAoIXZhbCkgeyB0aGlzLnJlc2V0KCk7IH1cbiAgdGhpcy50ZXh0YXJlYS5kaXNhYmxlZCA9IHZhbCA9PSBcIm5vY3Vyc29yXCI7XG59O1xuXG5UZXh0YXJlYUlucHV0LnByb3RvdHlwZS5zZXRVbmVkaXRhYmxlID0gZnVuY3Rpb24gKCkge307XG5cblRleHRhcmVhSW5wdXQucHJvdG90eXBlLm5lZWRzQ29udGVudEF0dHJpYnV0ZSA9IGZhbHNlO1xuXG5mdW5jdGlvbiBmcm9tVGV4dEFyZWEodGV4dGFyZWEsIG9wdGlvbnMpIHtcbiAgb3B0aW9ucyA9IG9wdGlvbnMgPyBjb3B5T2JqKG9wdGlvbnMpIDoge307XG4gIG9wdGlvbnMudmFsdWUgPSB0ZXh0YXJlYS52YWx1ZTtcbiAgaWYgKCFvcHRpb25zLnRhYmluZGV4ICYmIHRleHRhcmVhLnRhYkluZGV4KVxuICAgIHsgb3B0aW9ucy50YWJpbmRleCA9IHRleHRhcmVhLnRhYkluZGV4OyB9XG4gIGlmICghb3B0aW9ucy5wbGFjZWhvbGRlciAmJiB0ZXh0YXJlYS5wbGFjZWhvbGRlcilcbiAgICB7IG9wdGlvbnMucGxhY2Vob2xkZXIgPSB0ZXh0YXJlYS5wbGFjZWhvbGRlcjsgfVxuICAvLyBTZXQgYXV0b2ZvY3VzIHRvIHRydWUgaWYgdGhpcyB0ZXh0YXJlYSBpcyBmb2N1c2VkLCBvciBpZiBpdCBoYXNcbiAgLy8gYXV0b2ZvY3VzIGFuZCBubyBvdGhlciBlbGVtZW50IGlzIGZvY3VzZWQuXG4gIGlmIChvcHRpb25zLmF1dG9mb2N1cyA9PSBudWxsKSB7XG4gICAgdmFyIGhhc0ZvY3VzID0gYWN0aXZlRWx0KCk7XG4gICAgb3B0aW9ucy5hdXRvZm9jdXMgPSBoYXNGb2N1cyA9PSB0ZXh0YXJlYSB8fFxuICAgICAgdGV4dGFyZWEuZ2V0QXR0cmlidXRlKFwiYXV0b2ZvY3VzXCIpICE9IG51bGwgJiYgaGFzRm9jdXMgPT0gZG9jdW1lbnQuYm9keTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHNhdmUoKSB7dGV4dGFyZWEudmFsdWUgPSBjbS5nZXRWYWx1ZSgpO31cblxuICB2YXIgcmVhbFN1Ym1pdDtcbiAgaWYgKHRleHRhcmVhLmZvcm0pIHtcbiAgICBvbih0ZXh0YXJlYS5mb3JtLCBcInN1Ym1pdFwiLCBzYXZlKTtcbiAgICAvLyBEZXBsb3JhYmxlIGhhY2sgdG8gbWFrZSB0aGUgc3VibWl0IG1ldGhvZCBkbyB0aGUgcmlnaHQgdGhpbmcuXG4gICAgaWYgKCFvcHRpb25zLmxlYXZlU3VibWl0TWV0aG9kQWxvbmUpIHtcbiAgICAgIHZhciBmb3JtID0gdGV4dGFyZWEuZm9ybTtcbiAgICAgIHJlYWxTdWJtaXQgPSBmb3JtLnN1Ym1pdDtcbiAgICAgIHRyeSB7XG4gICAgICAgIHZhciB3cmFwcGVkU3VibWl0ID0gZm9ybS5zdWJtaXQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgc2F2ZSgpO1xuICAgICAgICAgIGZvcm0uc3VibWl0ID0gcmVhbFN1Ym1pdDtcbiAgICAgICAgICBmb3JtLnN1Ym1pdCgpO1xuICAgICAgICAgIGZvcm0uc3VibWl0ID0gd3JhcHBlZFN1Ym1pdDtcbiAgICAgICAgfTtcbiAgICAgIH0gY2F0Y2goZSkge31cbiAgICB9XG4gIH1cblxuICBvcHRpb25zLmZpbmlzaEluaXQgPSBmdW5jdGlvbiAoY20pIHtcbiAgICBjbS5zYXZlID0gc2F2ZTtcbiAgICBjbS5nZXRUZXh0QXJlYSA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuIHRleHRhcmVhOyB9O1xuICAgIGNtLnRvVGV4dEFyZWEgPSBmdW5jdGlvbiAoKSB7XG4gICAgICBjbS50b1RleHRBcmVhID0gaXNOYU47IC8vIFByZXZlbnQgdGhpcyBmcm9tIGJlaW5nIHJhbiB0d2ljZVxuICAgICAgc2F2ZSgpO1xuICAgICAgdGV4dGFyZWEucGFyZW50Tm9kZS5yZW1vdmVDaGlsZChjbS5nZXRXcmFwcGVyRWxlbWVudCgpKTtcbiAgICAgIHRleHRhcmVhLnN0eWxlLmRpc3BsYXkgPSBcIlwiO1xuICAgICAgaWYgKHRleHRhcmVhLmZvcm0pIHtcbiAgICAgICAgb2ZmKHRleHRhcmVhLmZvcm0sIFwic3VibWl0XCIsIHNhdmUpO1xuICAgICAgICBpZiAodHlwZW9mIHRleHRhcmVhLmZvcm0uc3VibWl0ID09IFwiZnVuY3Rpb25cIilcbiAgICAgICAgICB7IHRleHRhcmVhLmZvcm0uc3VibWl0ID0gcmVhbFN1Ym1pdDsgfVxuICAgICAgfVxuICAgIH07XG4gIH07XG5cbiAgdGV4dGFyZWEuc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuICB2YXIgY20gPSBDb2RlTWlycm9yJDEoZnVuY3Rpb24gKG5vZGUpIHsgcmV0dXJuIHRleHRhcmVhLnBhcmVudE5vZGUuaW5zZXJ0QmVmb3JlKG5vZGUsIHRleHRhcmVhLm5leHRTaWJsaW5nKTsgfSxcbiAgICBvcHRpb25zKTtcbiAgcmV0dXJuIGNtXG59XG5cbmZ1bmN0aW9uIGFkZExlZ2FjeVByb3BzKENvZGVNaXJyb3IpIHtcbiAgQ29kZU1pcnJvci5vZmYgPSBvZmY7XG4gIENvZGVNaXJyb3Iub24gPSBvbjtcbiAgQ29kZU1pcnJvci53aGVlbEV2ZW50UGl4ZWxzID0gd2hlZWxFdmVudFBpeGVscztcbiAgQ29kZU1pcnJvci5Eb2MgPSBEb2M7XG4gIENvZGVNaXJyb3Iuc3BsaXRMaW5lcyA9IHNwbGl0TGluZXNBdXRvO1xuICBDb2RlTWlycm9yLmNvdW50Q29sdW1uID0gY291bnRDb2x1bW47XG4gIENvZGVNaXJyb3IuZmluZENvbHVtbiA9IGZpbmRDb2x1bW47XG4gIENvZGVNaXJyb3IuaXNXb3JkQ2hhciA9IGlzV29yZENoYXJCYXNpYztcbiAgQ29kZU1pcnJvci5QYXNzID0gUGFzcztcbiAgQ29kZU1pcnJvci5zaWduYWwgPSBzaWduYWw7XG4gIENvZGVNaXJyb3IuTGluZSA9IExpbmU7XG4gIENvZGVNaXJyb3IuY2hhbmdlRW5kID0gY2hhbmdlRW5kO1xuICBDb2RlTWlycm9yLnNjcm9sbGJhck1vZGVsID0gc2Nyb2xsYmFyTW9kZWw7XG4gIENvZGVNaXJyb3IuUG9zID0gUG9zO1xuICBDb2RlTWlycm9yLmNtcFBvcyA9IGNtcDtcbiAgQ29kZU1pcnJvci5tb2RlcyA9IG1vZGVzO1xuICBDb2RlTWlycm9yLm1pbWVNb2RlcyA9IG1pbWVNb2RlcztcbiAgQ29kZU1pcnJvci5yZXNvbHZlTW9kZSA9IHJlc29sdmVNb2RlO1xuICBDb2RlTWlycm9yLmdldE1vZGUgPSBnZXRNb2RlO1xuICBDb2RlTWlycm9yLm1vZGVFeHRlbnNpb25zID0gbW9kZUV4dGVuc2lvbnM7XG4gIENvZGVNaXJyb3IuZXh0ZW5kTW9kZSA9IGV4dGVuZE1vZGU7XG4gIENvZGVNaXJyb3IuY29weVN0YXRlID0gY29weVN0YXRlO1xuICBDb2RlTWlycm9yLnN0YXJ0U3RhdGUgPSBzdGFydFN0YXRlO1xuICBDb2RlTWlycm9yLmlubmVyTW9kZSA9IGlubmVyTW9kZTtcbiAgQ29kZU1pcnJvci5jb21tYW5kcyA9IGNvbW1hbmRzO1xuICBDb2RlTWlycm9yLmtleU1hcCA9IGtleU1hcDtcbiAgQ29kZU1pcnJvci5rZXlOYW1lID0ga2V5TmFtZTtcbiAgQ29kZU1pcnJvci5pc01vZGlmaWVyS2V5ID0gaXNNb2RpZmllcktleTtcbiAgQ29kZU1pcnJvci5sb29rdXBLZXkgPSBsb29rdXBLZXk7XG4gIENvZGVNaXJyb3Iubm9ybWFsaXplS2V5TWFwID0gbm9ybWFsaXplS2V5TWFwO1xuICBDb2RlTWlycm9yLlN0cmluZ1N0cmVhbSA9IFN0cmluZ1N0cmVhbTtcbiAgQ29kZU1pcnJvci5TaGFyZWRUZXh0TWFya2VyID0gU2hhcmVkVGV4dE1hcmtlcjtcbiAgQ29kZU1pcnJvci5UZXh0TWFya2VyID0gVGV4dE1hcmtlcjtcbiAgQ29kZU1pcnJvci5MaW5lV2lkZ2V0ID0gTGluZVdpZGdldDtcbiAgQ29kZU1pcnJvci5lX3ByZXZlbnREZWZhdWx0ID0gZV9wcmV2ZW50RGVmYXVsdDtcbiAgQ29kZU1pcnJvci5lX3N0b3BQcm9wYWdhdGlvbiA9IGVfc3RvcFByb3BhZ2F0aW9uO1xuICBDb2RlTWlycm9yLmVfc3RvcCA9IGVfc3RvcDtcbiAgQ29kZU1pcnJvci5hZGRDbGFzcyA9IGFkZENsYXNzO1xuICBDb2RlTWlycm9yLmNvbnRhaW5zID0gY29udGFpbnM7XG4gIENvZGVNaXJyb3Iucm1DbGFzcyA9IHJtQ2xhc3M7XG4gIENvZGVNaXJyb3Iua2V5TmFtZXMgPSBrZXlOYW1lcztcbn1cblxuLy8gRURJVE9SIENPTlNUUlVDVE9SXG5cbmRlZmluZU9wdGlvbnMoQ29kZU1pcnJvciQxKTtcblxuYWRkRWRpdG9yTWV0aG9kcyhDb2RlTWlycm9yJDEpO1xuXG4vLyBTZXQgdXAgbWV0aG9kcyBvbiBDb2RlTWlycm9yJ3MgcHJvdG90eXBlIHRvIHJlZGlyZWN0IHRvIHRoZSBlZGl0b3IncyBkb2N1bWVudC5cbnZhciBkb250RGVsZWdhdGUgPSBcIml0ZXIgaW5zZXJ0IHJlbW92ZSBjb3B5IGdldEVkaXRvciBjb25zdHJ1Y3RvclwiLnNwbGl0KFwiIFwiKTtcbmZvciAodmFyIHByb3AgaW4gRG9jLnByb3RvdHlwZSkgeyBpZiAoRG9jLnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eShwcm9wKSAmJiBpbmRleE9mKGRvbnREZWxlZ2F0ZSwgcHJvcCkgPCAwKVxuICB7IENvZGVNaXJyb3IkMS5wcm90b3R5cGVbcHJvcF0gPSAoZnVuY3Rpb24obWV0aG9kKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge3JldHVybiBtZXRob2QuYXBwbHkodGhpcy5kb2MsIGFyZ3VtZW50cyl9XG4gIH0pKERvYy5wcm90b3R5cGVbcHJvcF0pOyB9IH1cblxuZXZlbnRNaXhpbihEb2MpO1xuXG4vLyBJTlBVVCBIQU5ETElOR1xuXG5Db2RlTWlycm9yJDEuaW5wdXRTdHlsZXMgPSB7XCJ0ZXh0YXJlYVwiOiBUZXh0YXJlYUlucHV0LCBcImNvbnRlbnRlZGl0YWJsZVwiOiBDb250ZW50RWRpdGFibGVJbnB1dH07XG5cbi8vIE1PREUgREVGSU5JVElPTiBBTkQgUVVFUllJTkdcblxuLy8gRXh0cmEgYXJndW1lbnRzIGFyZSBzdG9yZWQgYXMgdGhlIG1vZGUncyBkZXBlbmRlbmNpZXMsIHdoaWNoIGlzXG4vLyB1c2VkIGJ5IChsZWdhY3kpIG1lY2hhbmlzbXMgbGlrZSBsb2FkbW9kZS5qcyB0byBhdXRvbWF0aWNhbGx5XG4vLyBsb2FkIGEgbW9kZS4gKFByZWZlcnJlZCBtZWNoYW5pc20gaXMgdGhlIHJlcXVpcmUvZGVmaW5lIGNhbGxzLilcbkNvZGVNaXJyb3IkMS5kZWZpbmVNb2RlID0gZnVuY3Rpb24obmFtZS8qLCBtb2RlLCDigKYqLykge1xuICBpZiAoIUNvZGVNaXJyb3IkMS5kZWZhdWx0cy5tb2RlICYmIG5hbWUgIT0gXCJudWxsXCIpIHsgQ29kZU1pcnJvciQxLmRlZmF1bHRzLm1vZGUgPSBuYW1lOyB9XG4gIGRlZmluZU1vZGUuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbn07XG5cbkNvZGVNaXJyb3IkMS5kZWZpbmVNSU1FID0gZGVmaW5lTUlNRTtcblxuLy8gTWluaW1hbCBkZWZhdWx0IG1vZGUuXG5Db2RlTWlycm9yJDEuZGVmaW5lTW9kZShcIm51bGxcIiwgZnVuY3Rpb24gKCkgeyByZXR1cm4gKHt0b2tlbjogZnVuY3Rpb24gKHN0cmVhbSkgeyByZXR1cm4gc3RyZWFtLnNraXBUb0VuZCgpOyB9fSk7IH0pO1xuQ29kZU1pcnJvciQxLmRlZmluZU1JTUUoXCJ0ZXh0L3BsYWluXCIsIFwibnVsbFwiKTtcblxuLy8gRVhURU5TSU9OU1xuXG5Db2RlTWlycm9yJDEuZGVmaW5lRXh0ZW5zaW9uID0gZnVuY3Rpb24gKG5hbWUsIGZ1bmMpIHtcbiAgQ29kZU1pcnJvciQxLnByb3RvdHlwZVtuYW1lXSA9IGZ1bmM7XG59O1xuQ29kZU1pcnJvciQxLmRlZmluZURvY0V4dGVuc2lvbiA9IGZ1bmN0aW9uIChuYW1lLCBmdW5jKSB7XG4gIERvYy5wcm90b3R5cGVbbmFtZV0gPSBmdW5jO1xufTtcblxuQ29kZU1pcnJvciQxLmZyb21UZXh0QXJlYSA9IGZyb21UZXh0QXJlYTtcblxuYWRkTGVnYWN5UHJvcHMoQ29kZU1pcnJvciQxKTtcblxuQ29kZU1pcnJvciQxLnZlcnNpb24gPSBcIjUuMzguMFwiO1xuXG5yZXR1cm4gQ29kZU1pcnJvciQxO1xuXG59KSkpO1xuIiwiQ29kZU1pcnJvciA9IHJlcXVpcmUoJ2NvZGVtaXJyb3InKTtcblxudmFyIHRvdGFsX2NlbGxzID0gMjAwO1xudmFyIGNtX2NvbmZpZyA9IHtcbiAgICBcImluZGVudFVuaXRcIjo0LFxuICAgIFwicmVhZE9ubHlcIjpmYWxzZSxcbiAgICBcInRoZW1lXCI6XCJpcHl0aG9uXCIsXG4gICAgXCJleHRyYUtleXNcIjp7XG4gICAgICAgIFwiQ21kLVJpZ2h0XCI6XCJnb0xpbmVSaWdodFwiLFxuICAgICAgICBcIkVuZFwiOlwiZ29MaW5lUmlnaHRcIixcbiAgICAgICAgXCJDbWQtTGVmdFwiOlwiZ29MaW5lTGVmdFwiLFxuICAgICAgICBcIlRhYlwiOlwiaW5kZW50TW9yZVwiLFxuICAgICAgICBcIlNoaWZ0LVRhYlwiOlwiaW5kZW50TGVzc1wiLFxuICAgICAgICBcIkNtZC0vXCI6XCJ0b2dnbGVDb21tZW50XCIsXG4gICAgICAgIFwiQ3RybC0vXCI6XCJ0b2dnbGVDb21tZW50XCIsXG4gICAgICAgIFwiQmFja3NwYWNlXCI6XCJkZWxTcGFjZVRvUHJldlRhYlN0b3BcIlxuICAgICAgICB9LFxuICAgIFwibW9kZVwiOntcbiAgICAgICAgXCJuYW1lXCI6XCJpcHl0aG9uXCIsXG4gICAgICAgIFwidmVyc2lvblwiOjN9LFxuICAgICAgICBcIm1hdGNoQnJhY2tldHNcIjp0cnVlLFxuICAgICAgICBcImF1dG9DbG9zZUJyYWNrZXRzXCI6dHJ1ZVxuICAgIH07XG5cblxud2luZG93LnNoYXJlZF9lbGVtZW50cyA9IHt9O1xuZm9yICh2YXIgaT0wOyBpPD10b3RhbF9jZWxsczsgaSsrKSB7XG4gICAgdmFyIG91dHB1dCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIHZhciBpbnB1dF9hcmVhID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgaW5wdXRfYXJlYS5jbGFzc05hbWUgPSAnaW5wdXRfYXJlYSc7XG4gICAgdmFyIGNvZGVtaXJyb3IgPSBDb2RlTWlycm9yKGlucHV0X2FyZWEsIGNtX2NvbmZpZyk7IFxuICAgIHdpbmRvdy5zaGFyZWRfZWxlbWVudHNbaV0gPSB7J291dHB1dCc6IG91dHB1dCwgJ2lucHV0X2FyZWEnOiBpbnB1dF9hcmVhLCAnY29kZW1pcnJvcic6IGNvZGVtaXJyb3J9O1xufVxuIl19
