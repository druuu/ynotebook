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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvY29kZW1pcnJvci9saWIvY29kZW1pcnJvci5qcyIsInNyYy9wcmVkZWZpbmUuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2orU0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uKCl7ZnVuY3Rpb24gcihlLG4sdCl7ZnVuY3Rpb24gbyhpLGYpe2lmKCFuW2ldKXtpZighZVtpXSl7dmFyIGM9XCJmdW5jdGlvblwiPT10eXBlb2YgcmVxdWlyZSYmcmVxdWlyZTtpZighZiYmYylyZXR1cm4gYyhpLCEwKTtpZih1KXJldHVybiB1KGksITApO3ZhciBhPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIraStcIidcIik7dGhyb3cgYS5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGF9dmFyIHA9bltpXT17ZXhwb3J0czp7fX07ZVtpXVswXS5jYWxsKHAuZXhwb3J0cyxmdW5jdGlvbihyKXt2YXIgbj1lW2ldWzFdW3JdO3JldHVybiBvKG58fHIpfSxwLHAuZXhwb3J0cyxyLGUsbix0KX1yZXR1cm4gbltpXS5leHBvcnRzfWZvcih2YXIgdT1cImZ1bmN0aW9uXCI9PXR5cGVvZiByZXF1aXJlJiZyZXF1aXJlLGk9MDtpPHQubGVuZ3RoO2krKylvKHRbaV0pO3JldHVybiBvfXJldHVybiByfSkoKSIsIi8vIENvZGVNaXJyb3IsIGNvcHlyaWdodCAoYykgYnkgTWFyaWpuIEhhdmVyYmVrZSBhbmQgb3RoZXJzXG4vLyBEaXN0cmlidXRlZCB1bmRlciBhbiBNSVQgbGljZW5zZTogaHR0cDovL2NvZGVtaXJyb3IubmV0L0xJQ0VOU0VcblxuLy8gVGhpcyBpcyBDb2RlTWlycm9yIChodHRwOi8vY29kZW1pcnJvci5uZXQpLCBhIGNvZGUgZWRpdG9yXG4vLyBpbXBsZW1lbnRlZCBpbiBKYXZhU2NyaXB0IG9uIHRvcCBvZiB0aGUgYnJvd3NlcidzIERPTS5cbi8vXG4vLyBZb3UgY2FuIGZpbmQgc29tZSB0ZWNobmljYWwgYmFja2dyb3VuZCBmb3Igc29tZSBvZiB0aGUgY29kZSBiZWxvd1xuLy8gYXQgaHR0cDovL21hcmlqbmhhdmVyYmVrZS5ubC9ibG9nLyNjbS1pbnRlcm5hbHMgLlxuXG4oZnVuY3Rpb24gKGdsb2JhbCwgZmFjdG9yeSkge1xuXHR0eXBlb2YgZXhwb3J0cyA9PT0gJ29iamVjdCcgJiYgdHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcgPyBtb2R1bGUuZXhwb3J0cyA9IGZhY3RvcnkoKSA6XG5cdHR5cGVvZiBkZWZpbmUgPT09ICdmdW5jdGlvbicgJiYgZGVmaW5lLmFtZCA/IGRlZmluZShmYWN0b3J5KSA6XG5cdChnbG9iYWwuQ29kZU1pcnJvciA9IGZhY3RvcnkoKSk7XG59KHRoaXMsIChmdW5jdGlvbiAoKSB7ICd1c2Ugc3RyaWN0JztcblxuLy8gS2x1ZGdlcyBmb3IgYnVncyBhbmQgYmVoYXZpb3IgZGlmZmVyZW5jZXMgdGhhdCBjYW4ndCBiZSBmZWF0dXJlXG4vLyBkZXRlY3RlZCBhcmUgZW5hYmxlZCBiYXNlZCBvbiB1c2VyQWdlbnQgZXRjIHNuaWZmaW5nLlxudmFyIHVzZXJBZ2VudCA9IG5hdmlnYXRvci51c2VyQWdlbnQ7XG52YXIgcGxhdGZvcm0gPSBuYXZpZ2F0b3IucGxhdGZvcm07XG5cbnZhciBnZWNrbyA9IC9nZWNrb1xcL1xcZC9pLnRlc3QodXNlckFnZW50KTtcbnZhciBpZV91cHRvMTAgPSAvTVNJRSBcXGQvLnRlc3QodXNlckFnZW50KTtcbnZhciBpZV8xMXVwID0gL1RyaWRlbnRcXC8oPzpbNy05XXxcXGR7Mix9KVxcLi4qcnY6KFxcZCspLy5leGVjKHVzZXJBZ2VudCk7XG52YXIgZWRnZSA9IC9FZGdlXFwvKFxcZCspLy5leGVjKHVzZXJBZ2VudCk7XG52YXIgaWUgPSBpZV91cHRvMTAgfHwgaWVfMTF1cCB8fCBlZGdlO1xudmFyIGllX3ZlcnNpb24gPSBpZSAmJiAoaWVfdXB0bzEwID8gZG9jdW1lbnQuZG9jdW1lbnRNb2RlIHx8IDYgOiArKGVkZ2UgfHwgaWVfMTF1cClbMV0pO1xudmFyIHdlYmtpdCA9ICFlZGdlICYmIC9XZWJLaXRcXC8vLnRlc3QodXNlckFnZW50KTtcbnZhciBxdHdlYmtpdCA9IHdlYmtpdCAmJiAvUXRcXC9cXGQrXFwuXFxkKy8udGVzdCh1c2VyQWdlbnQpO1xudmFyIGNocm9tZSA9ICFlZGdlICYmIC9DaHJvbWVcXC8vLnRlc3QodXNlckFnZW50KTtcbnZhciBwcmVzdG8gPSAvT3BlcmFcXC8vLnRlc3QodXNlckFnZW50KTtcbnZhciBzYWZhcmkgPSAvQXBwbGUgQ29tcHV0ZXIvLnRlc3QobmF2aWdhdG9yLnZlbmRvcik7XG52YXIgbWFjX2dlTW91bnRhaW5MaW9uID0gL01hYyBPUyBYIDFcXGRcXEQoWzgtOV18XFxkXFxkKVxcRC8udGVzdCh1c2VyQWdlbnQpO1xudmFyIHBoYW50b20gPSAvUGhhbnRvbUpTLy50ZXN0KHVzZXJBZ2VudCk7XG5cbnZhciBpb3MgPSAhZWRnZSAmJiAvQXBwbGVXZWJLaXQvLnRlc3QodXNlckFnZW50KSAmJiAvTW9iaWxlXFwvXFx3Ky8udGVzdCh1c2VyQWdlbnQpO1xudmFyIGFuZHJvaWQgPSAvQW5kcm9pZC8udGVzdCh1c2VyQWdlbnQpO1xuLy8gVGhpcyBpcyB3b2VmdWxseSBpbmNvbXBsZXRlLiBTdWdnZXN0aW9ucyBmb3IgYWx0ZXJuYXRpdmUgbWV0aG9kcyB3ZWxjb21lLlxudmFyIG1vYmlsZSA9IGlvcyB8fCBhbmRyb2lkIHx8IC93ZWJPU3xCbGFja0JlcnJ5fE9wZXJhIE1pbml8T3BlcmEgTW9iaXxJRU1vYmlsZS9pLnRlc3QodXNlckFnZW50KTtcbnZhciBtYWMgPSBpb3MgfHwgL01hYy8udGVzdChwbGF0Zm9ybSk7XG52YXIgY2hyb21lT1MgPSAvXFxiQ3JPU1xcYi8udGVzdCh1c2VyQWdlbnQpO1xudmFyIHdpbmRvd3MgPSAvd2luL2kudGVzdChwbGF0Zm9ybSk7XG5cbnZhciBwcmVzdG9fdmVyc2lvbiA9IHByZXN0byAmJiB1c2VyQWdlbnQubWF0Y2goL1ZlcnNpb25cXC8oXFxkKlxcLlxcZCopLyk7XG5pZiAocHJlc3RvX3ZlcnNpb24pIHsgcHJlc3RvX3ZlcnNpb24gPSBOdW1iZXIocHJlc3RvX3ZlcnNpb25bMV0pOyB9XG5pZiAocHJlc3RvX3ZlcnNpb24gJiYgcHJlc3RvX3ZlcnNpb24gPj0gMTUpIHsgcHJlc3RvID0gZmFsc2U7IHdlYmtpdCA9IHRydWU7IH1cbi8vIFNvbWUgYnJvd3NlcnMgdXNlIHRoZSB3cm9uZyBldmVudCBwcm9wZXJ0aWVzIHRvIHNpZ25hbCBjbWQvY3RybCBvbiBPUyBYXG52YXIgZmxpcEN0cmxDbWQgPSBtYWMgJiYgKHF0d2Via2l0IHx8IHByZXN0byAmJiAocHJlc3RvX3ZlcnNpb24gPT0gbnVsbCB8fCBwcmVzdG9fdmVyc2lvbiA8IDEyLjExKSk7XG52YXIgY2FwdHVyZVJpZ2h0Q2xpY2sgPSBnZWNrbyB8fCAoaWUgJiYgaWVfdmVyc2lvbiA+PSA5KTtcblxuZnVuY3Rpb24gY2xhc3NUZXN0KGNscykgeyByZXR1cm4gbmV3IFJlZ0V4cChcIihefFxcXFxzKVwiICsgY2xzICsgXCIoPzokfFxcXFxzKVxcXFxzKlwiKSB9XG5cbnZhciBybUNsYXNzID0gZnVuY3Rpb24obm9kZSwgY2xzKSB7XG4gIHZhciBjdXJyZW50ID0gbm9kZS5jbGFzc05hbWU7XG4gIHZhciBtYXRjaCA9IGNsYXNzVGVzdChjbHMpLmV4ZWMoY3VycmVudCk7XG4gIGlmIChtYXRjaCkge1xuICAgIHZhciBhZnRlciA9IGN1cnJlbnQuc2xpY2UobWF0Y2guaW5kZXggKyBtYXRjaFswXS5sZW5ndGgpO1xuICAgIG5vZGUuY2xhc3NOYW1lID0gY3VycmVudC5zbGljZSgwLCBtYXRjaC5pbmRleCkgKyAoYWZ0ZXIgPyBtYXRjaFsxXSArIGFmdGVyIDogXCJcIik7XG4gIH1cbn07XG5cbmZ1bmN0aW9uIHJlbW92ZUNoaWxkcmVuKGUpIHtcbiAgZm9yICh2YXIgY291bnQgPSBlLmNoaWxkTm9kZXMubGVuZ3RoOyBjb3VudCA+IDA7IC0tY291bnQpXG4gICAgeyBlLnJlbW92ZUNoaWxkKGUuZmlyc3RDaGlsZCk7IH1cbiAgcmV0dXJuIGVcbn1cblxuZnVuY3Rpb24gcmVtb3ZlQ2hpbGRyZW5BbmRBZGQocGFyZW50LCBlKSB7XG4gIHJldHVybiByZW1vdmVDaGlsZHJlbihwYXJlbnQpLmFwcGVuZENoaWxkKGUpXG59XG5cbmZ1bmN0aW9uIGVsdCh0YWcsIGNvbnRlbnQsIGNsYXNzTmFtZSwgc3R5bGUpIHtcbiAgdmFyIGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KHRhZyk7XG4gIGlmIChjbGFzc05hbWUpIHsgZS5jbGFzc05hbWUgPSBjbGFzc05hbWU7IH1cbiAgaWYgKHN0eWxlKSB7IGUuc3R5bGUuY3NzVGV4dCA9IHN0eWxlOyB9XG4gIGlmICh0eXBlb2YgY29udGVudCA9PSBcInN0cmluZ1wiKSB7IGUuYXBwZW5kQ2hpbGQoZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoY29udGVudCkpOyB9XG4gIGVsc2UgaWYgKGNvbnRlbnQpIHsgZm9yICh2YXIgaSA9IDA7IGkgPCBjb250ZW50Lmxlbmd0aDsgKytpKSB7IGUuYXBwZW5kQ2hpbGQoY29udGVudFtpXSk7IH0gfVxuICByZXR1cm4gZVxufVxuLy8gd3JhcHBlciBmb3IgZWx0LCB3aGljaCByZW1vdmVzIHRoZSBlbHQgZnJvbSB0aGUgYWNjZXNzaWJpbGl0eSB0cmVlXG5mdW5jdGlvbiBlbHRQKHRhZywgY29udGVudCwgY2xhc3NOYW1lLCBzdHlsZSkge1xuICB2YXIgZSA9IGVsdCh0YWcsIGNvbnRlbnQsIGNsYXNzTmFtZSwgc3R5bGUpO1xuICBlLnNldEF0dHJpYnV0ZShcInJvbGVcIiwgXCJwcmVzZW50YXRpb25cIik7XG4gIHJldHVybiBlXG59XG5cbnZhciByYW5nZTtcbmlmIChkb2N1bWVudC5jcmVhdGVSYW5nZSkgeyByYW5nZSA9IGZ1bmN0aW9uKG5vZGUsIHN0YXJ0LCBlbmQsIGVuZE5vZGUpIHtcbiAgdmFyIHIgPSBkb2N1bWVudC5jcmVhdGVSYW5nZSgpO1xuICByLnNldEVuZChlbmROb2RlIHx8IG5vZGUsIGVuZCk7XG4gIHIuc2V0U3RhcnQobm9kZSwgc3RhcnQpO1xuICByZXR1cm4gclxufTsgfVxuZWxzZSB7IHJhbmdlID0gZnVuY3Rpb24obm9kZSwgc3RhcnQsIGVuZCkge1xuICB2YXIgciA9IGRvY3VtZW50LmJvZHkuY3JlYXRlVGV4dFJhbmdlKCk7XG4gIHRyeSB7IHIubW92ZVRvRWxlbWVudFRleHQobm9kZS5wYXJlbnROb2RlKTsgfVxuICBjYXRjaChlKSB7IHJldHVybiByIH1cbiAgci5jb2xsYXBzZSh0cnVlKTtcbiAgci5tb3ZlRW5kKFwiY2hhcmFjdGVyXCIsIGVuZCk7XG4gIHIubW92ZVN0YXJ0KFwiY2hhcmFjdGVyXCIsIHN0YXJ0KTtcbiAgcmV0dXJuIHJcbn07IH1cblxuZnVuY3Rpb24gY29udGFpbnMocGFyZW50LCBjaGlsZCkge1xuICBpZiAoY2hpbGQubm9kZVR5cGUgPT0gMykgLy8gQW5kcm9pZCBicm93c2VyIGFsd2F5cyByZXR1cm5zIGZhbHNlIHdoZW4gY2hpbGQgaXMgYSB0ZXh0bm9kZVxuICAgIHsgY2hpbGQgPSBjaGlsZC5wYXJlbnROb2RlOyB9XG4gIGlmIChwYXJlbnQuY29udGFpbnMpXG4gICAgeyByZXR1cm4gcGFyZW50LmNvbnRhaW5zKGNoaWxkKSB9XG4gIGRvIHtcbiAgICBpZiAoY2hpbGQubm9kZVR5cGUgPT0gMTEpIHsgY2hpbGQgPSBjaGlsZC5ob3N0OyB9XG4gICAgaWYgKGNoaWxkID09IHBhcmVudCkgeyByZXR1cm4gdHJ1ZSB9XG4gIH0gd2hpbGUgKGNoaWxkID0gY2hpbGQucGFyZW50Tm9kZSlcbn1cblxuZnVuY3Rpb24gYWN0aXZlRWx0KCkge1xuICAvLyBJRSBhbmQgRWRnZSBtYXkgdGhyb3cgYW4gXCJVbnNwZWNpZmllZCBFcnJvclwiIHdoZW4gYWNjZXNzaW5nIGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQuXG4gIC8vIElFIDwgMTAgd2lsbCB0aHJvdyB3aGVuIGFjY2Vzc2VkIHdoaWxlIHRoZSBwYWdlIGlzIGxvYWRpbmcgb3IgaW4gYW4gaWZyYW1lLlxuICAvLyBJRSA+IDkgYW5kIEVkZ2Ugd2lsbCB0aHJvdyB3aGVuIGFjY2Vzc2VkIGluIGFuIGlmcmFtZSBpZiBkb2N1bWVudC5ib2R5IGlzIHVuYXZhaWxhYmxlLlxuICB2YXIgYWN0aXZlRWxlbWVudDtcbiAgdHJ5IHtcbiAgICBhY3RpdmVFbGVtZW50ID0gZG9jdW1lbnQuYWN0aXZlRWxlbWVudDtcbiAgfSBjYXRjaChlKSB7XG4gICAgYWN0aXZlRWxlbWVudCA9IGRvY3VtZW50LmJvZHkgfHwgbnVsbDtcbiAgfVxuICB3aGlsZSAoYWN0aXZlRWxlbWVudCAmJiBhY3RpdmVFbGVtZW50LnNoYWRvd1Jvb3QgJiYgYWN0aXZlRWxlbWVudC5zaGFkb3dSb290LmFjdGl2ZUVsZW1lbnQpXG4gICAgeyBhY3RpdmVFbGVtZW50ID0gYWN0aXZlRWxlbWVudC5zaGFkb3dSb290LmFjdGl2ZUVsZW1lbnQ7IH1cbiAgcmV0dXJuIGFjdGl2ZUVsZW1lbnRcbn1cblxuZnVuY3Rpb24gYWRkQ2xhc3Mobm9kZSwgY2xzKSB7XG4gIHZhciBjdXJyZW50ID0gbm9kZS5jbGFzc05hbWU7XG4gIGlmICghY2xhc3NUZXN0KGNscykudGVzdChjdXJyZW50KSkgeyBub2RlLmNsYXNzTmFtZSArPSAoY3VycmVudCA/IFwiIFwiIDogXCJcIikgKyBjbHM7IH1cbn1cbmZ1bmN0aW9uIGpvaW5DbGFzc2VzKGEsIGIpIHtcbiAgdmFyIGFzID0gYS5zcGxpdChcIiBcIik7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgYXMubGVuZ3RoOyBpKyspXG4gICAgeyBpZiAoYXNbaV0gJiYgIWNsYXNzVGVzdChhc1tpXSkudGVzdChiKSkgeyBiICs9IFwiIFwiICsgYXNbaV07IH0gfVxuICByZXR1cm4gYlxufVxuXG52YXIgc2VsZWN0SW5wdXQgPSBmdW5jdGlvbihub2RlKSB7IG5vZGUuc2VsZWN0KCk7IH07XG5pZiAoaW9zKSAvLyBNb2JpbGUgU2FmYXJpIGFwcGFyZW50bHkgaGFzIGEgYnVnIHdoZXJlIHNlbGVjdCgpIGlzIGJyb2tlbi5cbiAgeyBzZWxlY3RJbnB1dCA9IGZ1bmN0aW9uKG5vZGUpIHsgbm9kZS5zZWxlY3Rpb25TdGFydCA9IDA7IG5vZGUuc2VsZWN0aW9uRW5kID0gbm9kZS52YWx1ZS5sZW5ndGg7IH07IH1cbmVsc2UgaWYgKGllKSAvLyBTdXBwcmVzcyBteXN0ZXJpb3VzIElFMTAgZXJyb3JzXG4gIHsgc2VsZWN0SW5wdXQgPSBmdW5jdGlvbihub2RlKSB7IHRyeSB7IG5vZGUuc2VsZWN0KCk7IH0gY2F0Y2goX2UpIHt9IH07IH1cblxuZnVuY3Rpb24gYmluZChmKSB7XG4gIHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcbiAgcmV0dXJuIGZ1bmN0aW9uKCl7cmV0dXJuIGYuYXBwbHkobnVsbCwgYXJncyl9XG59XG5cbmZ1bmN0aW9uIGNvcHlPYmoob2JqLCB0YXJnZXQsIG92ZXJ3cml0ZSkge1xuICBpZiAoIXRhcmdldCkgeyB0YXJnZXQgPSB7fTsgfVxuICBmb3IgKHZhciBwcm9wIGluIG9iailcbiAgICB7IGlmIChvYmouaGFzT3duUHJvcGVydHkocHJvcCkgJiYgKG92ZXJ3cml0ZSAhPT0gZmFsc2UgfHwgIXRhcmdldC5oYXNPd25Qcm9wZXJ0eShwcm9wKSkpXG4gICAgICB7IHRhcmdldFtwcm9wXSA9IG9ialtwcm9wXTsgfSB9XG4gIHJldHVybiB0YXJnZXRcbn1cblxuLy8gQ291bnRzIHRoZSBjb2x1bW4gb2Zmc2V0IGluIGEgc3RyaW5nLCB0YWtpbmcgdGFicyBpbnRvIGFjY291bnQuXG4vLyBVc2VkIG1vc3RseSB0byBmaW5kIGluZGVudGF0aW9uLlxuZnVuY3Rpb24gY291bnRDb2x1bW4oc3RyaW5nLCBlbmQsIHRhYlNpemUsIHN0YXJ0SW5kZXgsIHN0YXJ0VmFsdWUpIHtcbiAgaWYgKGVuZCA9PSBudWxsKSB7XG4gICAgZW5kID0gc3RyaW5nLnNlYXJjaCgvW15cXHNcXHUwMGEwXS8pO1xuICAgIGlmIChlbmQgPT0gLTEpIHsgZW5kID0gc3RyaW5nLmxlbmd0aDsgfVxuICB9XG4gIGZvciAodmFyIGkgPSBzdGFydEluZGV4IHx8IDAsIG4gPSBzdGFydFZhbHVlIHx8IDA7Oykge1xuICAgIHZhciBuZXh0VGFiID0gc3RyaW5nLmluZGV4T2YoXCJcXHRcIiwgaSk7XG4gICAgaWYgKG5leHRUYWIgPCAwIHx8IG5leHRUYWIgPj0gZW5kKVxuICAgICAgeyByZXR1cm4gbiArIChlbmQgLSBpKSB9XG4gICAgbiArPSBuZXh0VGFiIC0gaTtcbiAgICBuICs9IHRhYlNpemUgLSAobiAlIHRhYlNpemUpO1xuICAgIGkgPSBuZXh0VGFiICsgMTtcbiAgfVxufVxuXG52YXIgRGVsYXllZCA9IGZ1bmN0aW9uKCkge3RoaXMuaWQgPSBudWxsO307XG5EZWxheWVkLnByb3RvdHlwZS5zZXQgPSBmdW5jdGlvbiAobXMsIGYpIHtcbiAgY2xlYXJUaW1lb3V0KHRoaXMuaWQpO1xuICB0aGlzLmlkID0gc2V0VGltZW91dChmLCBtcyk7XG59O1xuXG5mdW5jdGlvbiBpbmRleE9mKGFycmF5LCBlbHQpIHtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcnJheS5sZW5ndGg7ICsraSlcbiAgICB7IGlmIChhcnJheVtpXSA9PSBlbHQpIHsgcmV0dXJuIGkgfSB9XG4gIHJldHVybiAtMVxufVxuXG4vLyBOdW1iZXIgb2YgcGl4ZWxzIGFkZGVkIHRvIHNjcm9sbGVyIGFuZCBzaXplciB0byBoaWRlIHNjcm9sbGJhclxudmFyIHNjcm9sbGVyR2FwID0gMzA7XG5cbi8vIFJldHVybmVkIG9yIHRocm93biBieSB2YXJpb3VzIHByb3RvY29scyB0byBzaWduYWwgJ0knbSBub3Rcbi8vIGhhbmRsaW5nIHRoaXMnLlxudmFyIFBhc3MgPSB7dG9TdHJpbmc6IGZ1bmN0aW9uKCl7cmV0dXJuIFwiQ29kZU1pcnJvci5QYXNzXCJ9fTtcblxuLy8gUmV1c2VkIG9wdGlvbiBvYmplY3RzIGZvciBzZXRTZWxlY3Rpb24gJiBmcmllbmRzXG52YXIgc2VsX2RvbnRTY3JvbGwgPSB7c2Nyb2xsOiBmYWxzZX07XG52YXIgc2VsX21vdXNlID0ge29yaWdpbjogXCIqbW91c2VcIn07XG52YXIgc2VsX21vdmUgPSB7b3JpZ2luOiBcIittb3ZlXCJ9O1xuXG4vLyBUaGUgaW52ZXJzZSBvZiBjb3VudENvbHVtbiAtLSBmaW5kIHRoZSBvZmZzZXQgdGhhdCBjb3JyZXNwb25kcyB0b1xuLy8gYSBwYXJ0aWN1bGFyIGNvbHVtbi5cbmZ1bmN0aW9uIGZpbmRDb2x1bW4oc3RyaW5nLCBnb2FsLCB0YWJTaXplKSB7XG4gIGZvciAodmFyIHBvcyA9IDAsIGNvbCA9IDA7Oykge1xuICAgIHZhciBuZXh0VGFiID0gc3RyaW5nLmluZGV4T2YoXCJcXHRcIiwgcG9zKTtcbiAgICBpZiAobmV4dFRhYiA9PSAtMSkgeyBuZXh0VGFiID0gc3RyaW5nLmxlbmd0aDsgfVxuICAgIHZhciBza2lwcGVkID0gbmV4dFRhYiAtIHBvcztcbiAgICBpZiAobmV4dFRhYiA9PSBzdHJpbmcubGVuZ3RoIHx8IGNvbCArIHNraXBwZWQgPj0gZ29hbClcbiAgICAgIHsgcmV0dXJuIHBvcyArIE1hdGgubWluKHNraXBwZWQsIGdvYWwgLSBjb2wpIH1cbiAgICBjb2wgKz0gbmV4dFRhYiAtIHBvcztcbiAgICBjb2wgKz0gdGFiU2l6ZSAtIChjb2wgJSB0YWJTaXplKTtcbiAgICBwb3MgPSBuZXh0VGFiICsgMTtcbiAgICBpZiAoY29sID49IGdvYWwpIHsgcmV0dXJuIHBvcyB9XG4gIH1cbn1cblxudmFyIHNwYWNlU3RycyA9IFtcIlwiXTtcbmZ1bmN0aW9uIHNwYWNlU3RyKG4pIHtcbiAgd2hpbGUgKHNwYWNlU3Rycy5sZW5ndGggPD0gbilcbiAgICB7IHNwYWNlU3Rycy5wdXNoKGxzdChzcGFjZVN0cnMpICsgXCIgXCIpOyB9XG4gIHJldHVybiBzcGFjZVN0cnNbbl1cbn1cblxuZnVuY3Rpb24gbHN0KGFycikgeyByZXR1cm4gYXJyW2Fyci5sZW5ndGgtMV0gfVxuXG5mdW5jdGlvbiBtYXAoYXJyYXksIGYpIHtcbiAgdmFyIG91dCA9IFtdO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGFycmF5Lmxlbmd0aDsgaSsrKSB7IG91dFtpXSA9IGYoYXJyYXlbaV0sIGkpOyB9XG4gIHJldHVybiBvdXRcbn1cblxuZnVuY3Rpb24gaW5zZXJ0U29ydGVkKGFycmF5LCB2YWx1ZSwgc2NvcmUpIHtcbiAgdmFyIHBvcyA9IDAsIHByaW9yaXR5ID0gc2NvcmUodmFsdWUpO1xuICB3aGlsZSAocG9zIDwgYXJyYXkubGVuZ3RoICYmIHNjb3JlKGFycmF5W3Bvc10pIDw9IHByaW9yaXR5KSB7IHBvcysrOyB9XG4gIGFycmF5LnNwbGljZShwb3MsIDAsIHZhbHVlKTtcbn1cblxuZnVuY3Rpb24gbm90aGluZygpIHt9XG5cbmZ1bmN0aW9uIGNyZWF0ZU9iaihiYXNlLCBwcm9wcykge1xuICB2YXIgaW5zdDtcbiAgaWYgKE9iamVjdC5jcmVhdGUpIHtcbiAgICBpbnN0ID0gT2JqZWN0LmNyZWF0ZShiYXNlKTtcbiAgfSBlbHNlIHtcbiAgICBub3RoaW5nLnByb3RvdHlwZSA9IGJhc2U7XG4gICAgaW5zdCA9IG5ldyBub3RoaW5nKCk7XG4gIH1cbiAgaWYgKHByb3BzKSB7IGNvcHlPYmoocHJvcHMsIGluc3QpOyB9XG4gIHJldHVybiBpbnN0XG59XG5cbnZhciBub25BU0NJSVNpbmdsZUNhc2VXb3JkQ2hhciA9IC9bXFx1MDBkZlxcdTA1ODdcXHUwNTkwLVxcdTA1ZjRcXHUwNjAwLVxcdTA2ZmZcXHUzMDQwLVxcdTMwOWZcXHUzMGEwLVxcdTMwZmZcXHUzNDAwLVxcdTRkYjVcXHU0ZTAwLVxcdTlmY2NcXHVhYzAwLVxcdWQ3YWZdLztcbmZ1bmN0aW9uIGlzV29yZENoYXJCYXNpYyhjaCkge1xuICByZXR1cm4gL1xcdy8udGVzdChjaCkgfHwgY2ggPiBcIlxceDgwXCIgJiZcbiAgICAoY2gudG9VcHBlckNhc2UoKSAhPSBjaC50b0xvd2VyQ2FzZSgpIHx8IG5vbkFTQ0lJU2luZ2xlQ2FzZVdvcmRDaGFyLnRlc3QoY2gpKVxufVxuZnVuY3Rpb24gaXNXb3JkQ2hhcihjaCwgaGVscGVyKSB7XG4gIGlmICghaGVscGVyKSB7IHJldHVybiBpc1dvcmRDaGFyQmFzaWMoY2gpIH1cbiAgaWYgKGhlbHBlci5zb3VyY2UuaW5kZXhPZihcIlxcXFx3XCIpID4gLTEgJiYgaXNXb3JkQ2hhckJhc2ljKGNoKSkgeyByZXR1cm4gdHJ1ZSB9XG4gIHJldHVybiBoZWxwZXIudGVzdChjaClcbn1cblxuZnVuY3Rpb24gaXNFbXB0eShvYmopIHtcbiAgZm9yICh2YXIgbiBpbiBvYmopIHsgaWYgKG9iai5oYXNPd25Qcm9wZXJ0eShuKSAmJiBvYmpbbl0pIHsgcmV0dXJuIGZhbHNlIH0gfVxuICByZXR1cm4gdHJ1ZVxufVxuXG4vLyBFeHRlbmRpbmcgdW5pY29kZSBjaGFyYWN0ZXJzLiBBIHNlcmllcyBvZiBhIG5vbi1leHRlbmRpbmcgY2hhciArXG4vLyBhbnkgbnVtYmVyIG9mIGV4dGVuZGluZyBjaGFycyBpcyB0cmVhdGVkIGFzIGEgc2luZ2xlIHVuaXQgYXMgZmFyXG4vLyBhcyBlZGl0aW5nIGFuZCBtZWFzdXJpbmcgaXMgY29uY2VybmVkLiBUaGlzIGlzIG5vdCBmdWxseSBjb3JyZWN0LFxuLy8gc2luY2Ugc29tZSBzY3JpcHRzL2ZvbnRzL2Jyb3dzZXJzIGFsc28gdHJlYXQgb3RoZXIgY29uZmlndXJhdGlvbnNcbi8vIG9mIGNvZGUgcG9pbnRzIGFzIGEgZ3JvdXAuXG52YXIgZXh0ZW5kaW5nQ2hhcnMgPSAvW1xcdTAzMDAtXFx1MDM2ZlxcdTA0ODMtXFx1MDQ4OVxcdTA1OTEtXFx1MDViZFxcdTA1YmZcXHUwNWMxXFx1MDVjMlxcdTA1YzRcXHUwNWM1XFx1MDVjN1xcdTA2MTAtXFx1MDYxYVxcdTA2NGItXFx1MDY1ZVxcdTA2NzBcXHUwNmQ2LVxcdTA2ZGNcXHUwNmRlLVxcdTA2ZTRcXHUwNmU3XFx1MDZlOFxcdTA2ZWEtXFx1MDZlZFxcdTA3MTFcXHUwNzMwLVxcdTA3NGFcXHUwN2E2LVxcdTA3YjBcXHUwN2ViLVxcdTA3ZjNcXHUwODE2LVxcdTA4MTlcXHUwODFiLVxcdTA4MjNcXHUwODI1LVxcdTA4MjdcXHUwODI5LVxcdTA4MmRcXHUwOTAwLVxcdTA5MDJcXHUwOTNjXFx1MDk0MS1cXHUwOTQ4XFx1MDk0ZFxcdTA5NTEtXFx1MDk1NVxcdTA5NjJcXHUwOTYzXFx1MDk4MVxcdTA5YmNcXHUwOWJlXFx1MDljMS1cXHUwOWM0XFx1MDljZFxcdTA5ZDdcXHUwOWUyXFx1MDllM1xcdTBhMDFcXHUwYTAyXFx1MGEzY1xcdTBhNDFcXHUwYTQyXFx1MGE0N1xcdTBhNDhcXHUwYTRiLVxcdTBhNGRcXHUwYTUxXFx1MGE3MFxcdTBhNzFcXHUwYTc1XFx1MGE4MVxcdTBhODJcXHUwYWJjXFx1MGFjMS1cXHUwYWM1XFx1MGFjN1xcdTBhYzhcXHUwYWNkXFx1MGFlMlxcdTBhZTNcXHUwYjAxXFx1MGIzY1xcdTBiM2VcXHUwYjNmXFx1MGI0MS1cXHUwYjQ0XFx1MGI0ZFxcdTBiNTZcXHUwYjU3XFx1MGI2MlxcdTBiNjNcXHUwYjgyXFx1MGJiZVxcdTBiYzBcXHUwYmNkXFx1MGJkN1xcdTBjM2UtXFx1MGM0MFxcdTBjNDYtXFx1MGM0OFxcdTBjNGEtXFx1MGM0ZFxcdTBjNTVcXHUwYzU2XFx1MGM2MlxcdTBjNjNcXHUwY2JjXFx1MGNiZlxcdTBjYzJcXHUwY2M2XFx1MGNjY1xcdTBjY2RcXHUwY2Q1XFx1MGNkNlxcdTBjZTJcXHUwY2UzXFx1MGQzZVxcdTBkNDEtXFx1MGQ0NFxcdTBkNGRcXHUwZDU3XFx1MGQ2MlxcdTBkNjNcXHUwZGNhXFx1MGRjZlxcdTBkZDItXFx1MGRkNFxcdTBkZDZcXHUwZGRmXFx1MGUzMVxcdTBlMzQtXFx1MGUzYVxcdTBlNDctXFx1MGU0ZVxcdTBlYjFcXHUwZWI0LVxcdTBlYjlcXHUwZWJiXFx1MGViY1xcdTBlYzgtXFx1MGVjZFxcdTBmMThcXHUwZjE5XFx1MGYzNVxcdTBmMzdcXHUwZjM5XFx1MGY3MS1cXHUwZjdlXFx1MGY4MC1cXHUwZjg0XFx1MGY4NlxcdTBmODdcXHUwZjkwLVxcdTBmOTdcXHUwZjk5LVxcdTBmYmNcXHUwZmM2XFx1MTAyZC1cXHUxMDMwXFx1MTAzMi1cXHUxMDM3XFx1MTAzOVxcdTEwM2FcXHUxMDNkXFx1MTAzZVxcdTEwNThcXHUxMDU5XFx1MTA1ZS1cXHUxMDYwXFx1MTA3MS1cXHUxMDc0XFx1MTA4MlxcdTEwODVcXHUxMDg2XFx1MTA4ZFxcdTEwOWRcXHUxMzVmXFx1MTcxMi1cXHUxNzE0XFx1MTczMi1cXHUxNzM0XFx1MTc1MlxcdTE3NTNcXHUxNzcyXFx1MTc3M1xcdTE3YjctXFx1MTdiZFxcdTE3YzZcXHUxN2M5LVxcdTE3ZDNcXHUxN2RkXFx1MTgwYi1cXHUxODBkXFx1MThhOVxcdTE5MjAtXFx1MTkyMlxcdTE5MjdcXHUxOTI4XFx1MTkzMlxcdTE5MzktXFx1MTkzYlxcdTFhMTdcXHUxYTE4XFx1MWE1NlxcdTFhNTgtXFx1MWE1ZVxcdTFhNjBcXHUxYTYyXFx1MWE2NS1cXHUxYTZjXFx1MWE3My1cXHUxYTdjXFx1MWE3ZlxcdTFiMDAtXFx1MWIwM1xcdTFiMzRcXHUxYjM2LVxcdTFiM2FcXHUxYjNjXFx1MWI0MlxcdTFiNmItXFx1MWI3M1xcdTFiODBcXHUxYjgxXFx1MWJhMi1cXHUxYmE1XFx1MWJhOFxcdTFiYTlcXHUxYzJjLVxcdTFjMzNcXHUxYzM2XFx1MWMzN1xcdTFjZDAtXFx1MWNkMlxcdTFjZDQtXFx1MWNlMFxcdTFjZTItXFx1MWNlOFxcdTFjZWRcXHUxZGMwLVxcdTFkZTZcXHUxZGZkLVxcdTFkZmZcXHUyMDBjXFx1MjAwZFxcdTIwZDAtXFx1MjBmMFxcdTJjZWYtXFx1MmNmMVxcdTJkZTAtXFx1MmRmZlxcdTMwMmEtXFx1MzAyZlxcdTMwOTlcXHUzMDlhXFx1YTY2Zi1cXHVhNjcyXFx1YTY3Y1xcdWE2N2RcXHVhNmYwXFx1YTZmMVxcdWE4MDJcXHVhODA2XFx1YTgwYlxcdWE4MjVcXHVhODI2XFx1YThjNFxcdWE4ZTAtXFx1YThmMVxcdWE5MjYtXFx1YTkyZFxcdWE5NDctXFx1YTk1MVxcdWE5ODAtXFx1YTk4MlxcdWE5YjNcXHVhOWI2LVxcdWE5YjlcXHVhOWJjXFx1YWEyOS1cXHVhYTJlXFx1YWEzMVxcdWFhMzJcXHVhYTM1XFx1YWEzNlxcdWFhNDNcXHVhYTRjXFx1YWFiMFxcdWFhYjItXFx1YWFiNFxcdWFhYjdcXHVhYWI4XFx1YWFiZVxcdWFhYmZcXHVhYWMxXFx1YWJlNVxcdWFiZThcXHVhYmVkXFx1ZGMwMC1cXHVkZmZmXFx1ZmIxZVxcdWZlMDAtXFx1ZmUwZlxcdWZlMjAtXFx1ZmUyNlxcdWZmOWVcXHVmZjlmXS87XG5mdW5jdGlvbiBpc0V4dGVuZGluZ0NoYXIoY2gpIHsgcmV0dXJuIGNoLmNoYXJDb2RlQXQoMCkgPj0gNzY4ICYmIGV4dGVuZGluZ0NoYXJzLnRlc3QoY2gpIH1cblxuLy8gUmV0dXJucyBhIG51bWJlciBmcm9tIHRoZSByYW5nZSBbYDBgOyBgc3RyLmxlbmd0aGBdIHVubGVzcyBgcG9zYCBpcyBvdXRzaWRlIHRoYXQgcmFuZ2UuXG5mdW5jdGlvbiBza2lwRXh0ZW5kaW5nQ2hhcnMoc3RyLCBwb3MsIGRpcikge1xuICB3aGlsZSAoKGRpciA8IDAgPyBwb3MgPiAwIDogcG9zIDwgc3RyLmxlbmd0aCkgJiYgaXNFeHRlbmRpbmdDaGFyKHN0ci5jaGFyQXQocG9zKSkpIHsgcG9zICs9IGRpcjsgfVxuICByZXR1cm4gcG9zXG59XG5cbi8vIFJldHVybnMgdGhlIHZhbHVlIGZyb20gdGhlIHJhbmdlIFtgZnJvbWA7IGB0b2BdIHRoYXQgc2F0aXNmaWVzXG4vLyBgcHJlZGAgYW5kIGlzIGNsb3Nlc3QgdG8gYGZyb21gLiBBc3N1bWVzIHRoYXQgYXQgbGVhc3QgYHRvYFxuLy8gc2F0aXNmaWVzIGBwcmVkYC4gU3VwcG9ydHMgYGZyb21gIGJlaW5nIGdyZWF0ZXIgdGhhbiBgdG9gLlxuZnVuY3Rpb24gZmluZEZpcnN0KHByZWQsIGZyb20sIHRvKSB7XG4gIC8vIEF0IGFueSBwb2ludCB3ZSBhcmUgY2VydGFpbiBgdG9gIHNhdGlzZmllcyBgcHJlZGAsIGRvbid0IGtub3dcbiAgLy8gd2hldGhlciBgZnJvbWAgZG9lcy5cbiAgdmFyIGRpciA9IGZyb20gPiB0byA/IC0xIDogMTtcbiAgZm9yICg7Oykge1xuICAgIGlmIChmcm9tID09IHRvKSB7IHJldHVybiBmcm9tIH1cbiAgICB2YXIgbWlkRiA9IChmcm9tICsgdG8pIC8gMiwgbWlkID0gZGlyIDwgMCA/IE1hdGguY2VpbChtaWRGKSA6IE1hdGguZmxvb3IobWlkRik7XG4gICAgaWYgKG1pZCA9PSBmcm9tKSB7IHJldHVybiBwcmVkKG1pZCkgPyBmcm9tIDogdG8gfVxuICAgIGlmIChwcmVkKG1pZCkpIHsgdG8gPSBtaWQ7IH1cbiAgICBlbHNlIHsgZnJvbSA9IG1pZCArIGRpcjsgfVxuICB9XG59XG5cbi8vIFRoZSBkaXNwbGF5IGhhbmRsZXMgdGhlIERPTSBpbnRlZ3JhdGlvbiwgYm90aCBmb3IgaW5wdXQgcmVhZGluZ1xuLy8gYW5kIGNvbnRlbnQgZHJhd2luZy4gSXQgaG9sZHMgcmVmZXJlbmNlcyB0byBET00gbm9kZXMgYW5kXG4vLyBkaXNwbGF5LXJlbGF0ZWQgc3RhdGUuXG5cbmZ1bmN0aW9uIERpc3BsYXkocGxhY2UsIGRvYywgaW5wdXQpIHtcbiAgdmFyIGQgPSB0aGlzO1xuICB0aGlzLmlucHV0ID0gaW5wdXQ7XG5cbiAgLy8gQ292ZXJzIGJvdHRvbS1yaWdodCBzcXVhcmUgd2hlbiBib3RoIHNjcm9sbGJhcnMgYXJlIHByZXNlbnQuXG4gIGQuc2Nyb2xsYmFyRmlsbGVyID0gZWx0KFwiZGl2XCIsIG51bGwsIFwiQ29kZU1pcnJvci1zY3JvbGxiYXItZmlsbGVyXCIpO1xuICBkLnNjcm9sbGJhckZpbGxlci5zZXRBdHRyaWJ1dGUoXCJjbS1ub3QtY29udGVudFwiLCBcInRydWVcIik7XG4gIC8vIENvdmVycyBib3R0b20gb2YgZ3V0dGVyIHdoZW4gY292ZXJHdXR0ZXJOZXh0VG9TY3JvbGxiYXIgaXMgb25cbiAgLy8gYW5kIGggc2Nyb2xsYmFyIGlzIHByZXNlbnQuXG4gIGQuZ3V0dGVyRmlsbGVyID0gZWx0KFwiZGl2XCIsIG51bGwsIFwiQ29kZU1pcnJvci1ndXR0ZXItZmlsbGVyXCIpO1xuICBkLmd1dHRlckZpbGxlci5zZXRBdHRyaWJ1dGUoXCJjbS1ub3QtY29udGVudFwiLCBcInRydWVcIik7XG4gIC8vIFdpbGwgY29udGFpbiB0aGUgYWN0dWFsIGNvZGUsIHBvc2l0aW9uZWQgdG8gY292ZXIgdGhlIHZpZXdwb3J0LlxuICBkLmxpbmVEaXYgPSBlbHRQKFwiZGl2XCIsIG51bGwsIFwiQ29kZU1pcnJvci1jb2RlXCIpO1xuICAvLyBFbGVtZW50cyBhcmUgYWRkZWQgdG8gdGhlc2UgdG8gcmVwcmVzZW50IHNlbGVjdGlvbiBhbmQgY3Vyc29ycy5cbiAgZC5zZWxlY3Rpb25EaXYgPSBlbHQoXCJkaXZcIiwgbnVsbCwgbnVsbCwgXCJwb3NpdGlvbjogcmVsYXRpdmU7IHotaW5kZXg6IDFcIik7XG4gIGQuY3Vyc29yRGl2ID0gZWx0KFwiZGl2XCIsIG51bGwsIFwiQ29kZU1pcnJvci1jdXJzb3JzXCIpO1xuICAvLyBBIHZpc2liaWxpdHk6IGhpZGRlbiBlbGVtZW50IHVzZWQgdG8gZmluZCB0aGUgc2l6ZSBvZiB0aGluZ3MuXG4gIGQubWVhc3VyZSA9IGVsdChcImRpdlwiLCBudWxsLCBcIkNvZGVNaXJyb3ItbWVhc3VyZVwiKTtcbiAgLy8gV2hlbiBsaW5lcyBvdXRzaWRlIG9mIHRoZSB2aWV3cG9ydCBhcmUgbWVhc3VyZWQsIHRoZXkgYXJlIGRyYXduIGluIHRoaXMuXG4gIGQubGluZU1lYXN1cmUgPSBlbHQoXCJkaXZcIiwgbnVsbCwgXCJDb2RlTWlycm9yLW1lYXN1cmVcIik7XG4gIC8vIFdyYXBzIGV2ZXJ5dGhpbmcgdGhhdCBuZWVkcyB0byBleGlzdCBpbnNpZGUgdGhlIHZlcnRpY2FsbHktcGFkZGVkIGNvb3JkaW5hdGUgc3lzdGVtXG4gIGQubGluZVNwYWNlID0gZWx0UChcImRpdlwiLCBbZC5tZWFzdXJlLCBkLmxpbmVNZWFzdXJlLCBkLnNlbGVjdGlvbkRpdiwgZC5jdXJzb3JEaXYsIGQubGluZURpdl0sXG4gICAgICAgICAgICAgICAgICAgIG51bGwsIFwicG9zaXRpb246IHJlbGF0aXZlOyBvdXRsaW5lOiBub25lXCIpO1xuICB2YXIgbGluZXMgPSBlbHRQKFwiZGl2XCIsIFtkLmxpbmVTcGFjZV0sIFwiQ29kZU1pcnJvci1saW5lc1wiKTtcbiAgLy8gTW92ZWQgYXJvdW5kIGl0cyBwYXJlbnQgdG8gY292ZXIgdmlzaWJsZSB2aWV3LlxuICBkLm1vdmVyID0gZWx0KFwiZGl2XCIsIFtsaW5lc10sIG51bGwsIFwicG9zaXRpb246IHJlbGF0aXZlXCIpO1xuICAvLyBTZXQgdG8gdGhlIGhlaWdodCBvZiB0aGUgZG9jdW1lbnQsIGFsbG93aW5nIHNjcm9sbGluZy5cbiAgZC5zaXplciA9IGVsdChcImRpdlwiLCBbZC5tb3Zlcl0sIFwiQ29kZU1pcnJvci1zaXplclwiKTtcbiAgZC5zaXplcldpZHRoID0gbnVsbDtcbiAgLy8gQmVoYXZpb3Igb2YgZWx0cyB3aXRoIG92ZXJmbG93OiBhdXRvIGFuZCBwYWRkaW5nIGlzXG4gIC8vIGluY29uc2lzdGVudCBhY3Jvc3MgYnJvd3NlcnMuIFRoaXMgaXMgdXNlZCB0byBlbnN1cmUgdGhlXG4gIC8vIHNjcm9sbGFibGUgYXJlYSBpcyBiaWcgZW5vdWdoLlxuICBkLmhlaWdodEZvcmNlciA9IGVsdChcImRpdlwiLCBudWxsLCBudWxsLCBcInBvc2l0aW9uOiBhYnNvbHV0ZTsgaGVpZ2h0OiBcIiArIHNjcm9sbGVyR2FwICsgXCJweDsgd2lkdGg6IDFweDtcIik7XG4gIC8vIFdpbGwgY29udGFpbiB0aGUgZ3V0dGVycywgaWYgYW55LlxuICBkLmd1dHRlcnMgPSBlbHQoXCJkaXZcIiwgbnVsbCwgXCJDb2RlTWlycm9yLWd1dHRlcnNcIik7XG4gIGQubGluZUd1dHRlciA9IG51bGw7XG4gIC8vIEFjdHVhbCBzY3JvbGxhYmxlIGVsZW1lbnQuXG4gIGQuc2Nyb2xsZXIgPSBlbHQoXCJkaXZcIiwgW2Quc2l6ZXIsIGQuaGVpZ2h0Rm9yY2VyLCBkLmd1dHRlcnNdLCBcIkNvZGVNaXJyb3Itc2Nyb2xsXCIpO1xuICBkLnNjcm9sbGVyLnNldEF0dHJpYnV0ZShcInRhYkluZGV4XCIsIFwiLTFcIik7XG4gIC8vIFRoZSBlbGVtZW50IGluIHdoaWNoIHRoZSBlZGl0b3IgbGl2ZXMuXG4gIGQud3JhcHBlciA9IGVsdChcImRpdlwiLCBbZC5zY3JvbGxiYXJGaWxsZXIsIGQuZ3V0dGVyRmlsbGVyLCBkLnNjcm9sbGVyXSwgXCJDb2RlTWlycm9yXCIpO1xuXG4gIC8vIFdvcmsgYXJvdW5kIElFNyB6LWluZGV4IGJ1ZyAobm90IHBlcmZlY3QsIGhlbmNlIElFNyBub3QgcmVhbGx5IGJlaW5nIHN1cHBvcnRlZClcbiAgaWYgKGllICYmIGllX3ZlcnNpb24gPCA4KSB7IGQuZ3V0dGVycy5zdHlsZS56SW5kZXggPSAtMTsgZC5zY3JvbGxlci5zdHlsZS5wYWRkaW5nUmlnaHQgPSAwOyB9XG4gIGlmICghd2Via2l0ICYmICEoZ2Vja28gJiYgbW9iaWxlKSkgeyBkLnNjcm9sbGVyLmRyYWdnYWJsZSA9IHRydWU7IH1cblxuICBpZiAocGxhY2UpIHtcbiAgICBpZiAocGxhY2UuYXBwZW5kQ2hpbGQpIHsgcGxhY2UuYXBwZW5kQ2hpbGQoZC53cmFwcGVyKTsgfVxuICAgIGVsc2UgeyBwbGFjZShkLndyYXBwZXIpOyB9XG4gIH1cblxuICAvLyBDdXJyZW50IHJlbmRlcmVkIHJhbmdlIChtYXkgYmUgYmlnZ2VyIHRoYW4gdGhlIHZpZXcgd2luZG93KS5cbiAgZC52aWV3RnJvbSA9IGQudmlld1RvID0gZG9jLmZpcnN0O1xuICBkLnJlcG9ydGVkVmlld0Zyb20gPSBkLnJlcG9ydGVkVmlld1RvID0gZG9jLmZpcnN0O1xuICAvLyBJbmZvcm1hdGlvbiBhYm91dCB0aGUgcmVuZGVyZWQgbGluZXMuXG4gIGQudmlldyA9IFtdO1xuICBkLnJlbmRlcmVkVmlldyA9IG51bGw7XG4gIC8vIEhvbGRzIGluZm8gYWJvdXQgYSBzaW5nbGUgcmVuZGVyZWQgbGluZSB3aGVuIGl0IHdhcyByZW5kZXJlZFxuICAvLyBmb3IgbWVhc3VyZW1lbnQsIHdoaWxlIG5vdCBpbiB2aWV3LlxuICBkLmV4dGVybmFsTWVhc3VyZWQgPSBudWxsO1xuICAvLyBFbXB0eSBzcGFjZSAoaW4gcGl4ZWxzKSBhYm92ZSB0aGUgdmlld1xuICBkLnZpZXdPZmZzZXQgPSAwO1xuICBkLmxhc3RXcmFwSGVpZ2h0ID0gZC5sYXN0V3JhcFdpZHRoID0gMDtcbiAgZC51cGRhdGVMaW5lTnVtYmVycyA9IG51bGw7XG5cbiAgZC5uYXRpdmVCYXJXaWR0aCA9IGQuYmFySGVpZ2h0ID0gZC5iYXJXaWR0aCA9IDA7XG4gIGQuc2Nyb2xsYmFyc0NsaXBwZWQgPSBmYWxzZTtcblxuICAvLyBVc2VkIHRvIG9ubHkgcmVzaXplIHRoZSBsaW5lIG51bWJlciBndXR0ZXIgd2hlbiBuZWNlc3NhcnkgKHdoZW5cbiAgLy8gdGhlIGFtb3VudCBvZiBsaW5lcyBjcm9zc2VzIGEgYm91bmRhcnkgdGhhdCBtYWtlcyBpdHMgd2lkdGggY2hhbmdlKVxuICBkLmxpbmVOdW1XaWR0aCA9IGQubGluZU51bUlubmVyV2lkdGggPSBkLmxpbmVOdW1DaGFycyA9IG51bGw7XG4gIC8vIFNldCB0byB0cnVlIHdoZW4gYSBub24taG9yaXpvbnRhbC1zY3JvbGxpbmcgbGluZSB3aWRnZXQgaXNcbiAgLy8gYWRkZWQuIEFzIGFuIG9wdGltaXphdGlvbiwgbGluZSB3aWRnZXQgYWxpZ25pbmcgaXMgc2tpcHBlZCB3aGVuXG4gIC8vIHRoaXMgaXMgZmFsc2UuXG4gIGQuYWxpZ25XaWRnZXRzID0gZmFsc2U7XG5cbiAgZC5jYWNoZWRDaGFyV2lkdGggPSBkLmNhY2hlZFRleHRIZWlnaHQgPSBkLmNhY2hlZFBhZGRpbmdIID0gbnVsbDtcblxuICAvLyBUcmFja3MgdGhlIG1heGltdW0gbGluZSBsZW5ndGggc28gdGhhdCB0aGUgaG9yaXpvbnRhbCBzY3JvbGxiYXJcbiAgLy8gY2FuIGJlIGtlcHQgc3RhdGljIHdoZW4gc2Nyb2xsaW5nLlxuICBkLm1heExpbmUgPSBudWxsO1xuICBkLm1heExpbmVMZW5ndGggPSAwO1xuICBkLm1heExpbmVDaGFuZ2VkID0gZmFsc2U7XG5cbiAgLy8gVXNlZCBmb3IgbWVhc3VyaW5nIHdoZWVsIHNjcm9sbGluZyBncmFudWxhcml0eVxuICBkLndoZWVsRFggPSBkLndoZWVsRFkgPSBkLndoZWVsU3RhcnRYID0gZC53aGVlbFN0YXJ0WSA9IG51bGw7XG5cbiAgLy8gVHJ1ZSB3aGVuIHNoaWZ0IGlzIGhlbGQgZG93bi5cbiAgZC5zaGlmdCA9IGZhbHNlO1xuXG4gIC8vIFVzZWQgdG8gdHJhY2sgd2hldGhlciBhbnl0aGluZyBoYXBwZW5lZCBzaW5jZSB0aGUgY29udGV4dCBtZW51XG4gIC8vIHdhcyBvcGVuZWQuXG4gIGQuc2VsRm9yQ29udGV4dE1lbnUgPSBudWxsO1xuXG4gIGQuYWN0aXZlVG91Y2ggPSBudWxsO1xuXG4gIGlucHV0LmluaXQoZCk7XG59XG5cbi8vIEZpbmQgdGhlIGxpbmUgb2JqZWN0IGNvcnJlc3BvbmRpbmcgdG8gdGhlIGdpdmVuIGxpbmUgbnVtYmVyLlxuZnVuY3Rpb24gZ2V0TGluZShkb2MsIG4pIHtcbiAgbiAtPSBkb2MuZmlyc3Q7XG4gIGlmIChuIDwgMCB8fCBuID49IGRvYy5zaXplKSB7IHRocm93IG5ldyBFcnJvcihcIlRoZXJlIGlzIG5vIGxpbmUgXCIgKyAobiArIGRvYy5maXJzdCkgKyBcIiBpbiB0aGUgZG9jdW1lbnQuXCIpIH1cbiAgdmFyIGNodW5rID0gZG9jO1xuICB3aGlsZSAoIWNodW5rLmxpbmVzKSB7XG4gICAgZm9yICh2YXIgaSA9IDA7OyArK2kpIHtcbiAgICAgIHZhciBjaGlsZCA9IGNodW5rLmNoaWxkcmVuW2ldLCBzeiA9IGNoaWxkLmNodW5rU2l6ZSgpO1xuICAgICAgaWYgKG4gPCBzeikgeyBjaHVuayA9IGNoaWxkOyBicmVhayB9XG4gICAgICBuIC09IHN6O1xuICAgIH1cbiAgfVxuICByZXR1cm4gY2h1bmsubGluZXNbbl1cbn1cblxuLy8gR2V0IHRoZSBwYXJ0IG9mIGEgZG9jdW1lbnQgYmV0d2VlbiB0d28gcG9zaXRpb25zLCBhcyBhbiBhcnJheSBvZlxuLy8gc3RyaW5ncy5cbmZ1bmN0aW9uIGdldEJldHdlZW4oZG9jLCBzdGFydCwgZW5kKSB7XG4gIHZhciBvdXQgPSBbXSwgbiA9IHN0YXJ0LmxpbmU7XG4gIGRvYy5pdGVyKHN0YXJ0LmxpbmUsIGVuZC5saW5lICsgMSwgZnVuY3Rpb24gKGxpbmUpIHtcbiAgICB2YXIgdGV4dCA9IGxpbmUudGV4dDtcbiAgICBpZiAobiA9PSBlbmQubGluZSkgeyB0ZXh0ID0gdGV4dC5zbGljZSgwLCBlbmQuY2gpOyB9XG4gICAgaWYgKG4gPT0gc3RhcnQubGluZSkgeyB0ZXh0ID0gdGV4dC5zbGljZShzdGFydC5jaCk7IH1cbiAgICBvdXQucHVzaCh0ZXh0KTtcbiAgICArK247XG4gIH0pO1xuICByZXR1cm4gb3V0XG59XG4vLyBHZXQgdGhlIGxpbmVzIGJldHdlZW4gZnJvbSBhbmQgdG8sIGFzIGFycmF5IG9mIHN0cmluZ3MuXG5mdW5jdGlvbiBnZXRMaW5lcyhkb2MsIGZyb20sIHRvKSB7XG4gIHZhciBvdXQgPSBbXTtcbiAgZG9jLml0ZXIoZnJvbSwgdG8sIGZ1bmN0aW9uIChsaW5lKSB7IG91dC5wdXNoKGxpbmUudGV4dCk7IH0pOyAvLyBpdGVyIGFib3J0cyB3aGVuIGNhbGxiYWNrIHJldHVybnMgdHJ1dGh5IHZhbHVlXG4gIHJldHVybiBvdXRcbn1cblxuLy8gVXBkYXRlIHRoZSBoZWlnaHQgb2YgYSBsaW5lLCBwcm9wYWdhdGluZyB0aGUgaGVpZ2h0IGNoYW5nZVxuLy8gdXB3YXJkcyB0byBwYXJlbnQgbm9kZXMuXG5mdW5jdGlvbiB1cGRhdGVMaW5lSGVpZ2h0KGxpbmUsIGhlaWdodCkge1xuICB2YXIgZGlmZiA9IGhlaWdodCAtIGxpbmUuaGVpZ2h0O1xuICBpZiAoZGlmZikgeyBmb3IgKHZhciBuID0gbGluZTsgbjsgbiA9IG4ucGFyZW50KSB7IG4uaGVpZ2h0ICs9IGRpZmY7IH0gfVxufVxuXG4vLyBHaXZlbiBhIGxpbmUgb2JqZWN0LCBmaW5kIGl0cyBsaW5lIG51bWJlciBieSB3YWxraW5nIHVwIHRocm91Z2hcbi8vIGl0cyBwYXJlbnQgbGlua3MuXG5mdW5jdGlvbiBsaW5lTm8obGluZSkge1xuICBpZiAobGluZS5wYXJlbnQgPT0gbnVsbCkgeyByZXR1cm4gbnVsbCB9XG4gIHZhciBjdXIgPSBsaW5lLnBhcmVudCwgbm8gPSBpbmRleE9mKGN1ci5saW5lcywgbGluZSk7XG4gIGZvciAodmFyIGNodW5rID0gY3VyLnBhcmVudDsgY2h1bms7IGN1ciA9IGNodW5rLCBjaHVuayA9IGNodW5rLnBhcmVudCkge1xuICAgIGZvciAodmFyIGkgPSAwOzsgKytpKSB7XG4gICAgICBpZiAoY2h1bmsuY2hpbGRyZW5baV0gPT0gY3VyKSB7IGJyZWFrIH1cbiAgICAgIG5vICs9IGNodW5rLmNoaWxkcmVuW2ldLmNodW5rU2l6ZSgpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gbm8gKyBjdXIuZmlyc3Rcbn1cblxuLy8gRmluZCB0aGUgbGluZSBhdCB0aGUgZ2l2ZW4gdmVydGljYWwgcG9zaXRpb24sIHVzaW5nIHRoZSBoZWlnaHRcbi8vIGluZm9ybWF0aW9uIGluIHRoZSBkb2N1bWVudCB0cmVlLlxuZnVuY3Rpb24gbGluZUF0SGVpZ2h0KGNodW5rLCBoKSB7XG4gIHZhciBuID0gY2h1bmsuZmlyc3Q7XG4gIG91dGVyOiBkbyB7XG4gICAgZm9yICh2YXIgaSQxID0gMDsgaSQxIDwgY2h1bmsuY2hpbGRyZW4ubGVuZ3RoOyArK2kkMSkge1xuICAgICAgdmFyIGNoaWxkID0gY2h1bmsuY2hpbGRyZW5baSQxXSwgY2ggPSBjaGlsZC5oZWlnaHQ7XG4gICAgICBpZiAoaCA8IGNoKSB7IGNodW5rID0gY2hpbGQ7IGNvbnRpbnVlIG91dGVyIH1cbiAgICAgIGggLT0gY2g7XG4gICAgICBuICs9IGNoaWxkLmNodW5rU2l6ZSgpO1xuICAgIH1cbiAgICByZXR1cm4gblxuICB9IHdoaWxlICghY2h1bmsubGluZXMpXG4gIHZhciBpID0gMDtcbiAgZm9yICg7IGkgPCBjaHVuay5saW5lcy5sZW5ndGg7ICsraSkge1xuICAgIHZhciBsaW5lID0gY2h1bmsubGluZXNbaV0sIGxoID0gbGluZS5oZWlnaHQ7XG4gICAgaWYgKGggPCBsaCkgeyBicmVhayB9XG4gICAgaCAtPSBsaDtcbiAgfVxuICByZXR1cm4gbiArIGlcbn1cblxuZnVuY3Rpb24gaXNMaW5lKGRvYywgbCkge3JldHVybiBsID49IGRvYy5maXJzdCAmJiBsIDwgZG9jLmZpcnN0ICsgZG9jLnNpemV9XG5cbmZ1bmN0aW9uIGxpbmVOdW1iZXJGb3Iob3B0aW9ucywgaSkge1xuICByZXR1cm4gU3RyaW5nKG9wdGlvbnMubGluZU51bWJlckZvcm1hdHRlcihpICsgb3B0aW9ucy5maXJzdExpbmVOdW1iZXIpKVxufVxuXG4vLyBBIFBvcyBpbnN0YW5jZSByZXByZXNlbnRzIGEgcG9zaXRpb24gd2l0aGluIHRoZSB0ZXh0LlxuZnVuY3Rpb24gUG9zKGxpbmUsIGNoLCBzdGlja3kpIHtcbiAgaWYgKCBzdGlja3kgPT09IHZvaWQgMCApIHN0aWNreSA9IG51bGw7XG5cbiAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIFBvcykpIHsgcmV0dXJuIG5ldyBQb3MobGluZSwgY2gsIHN0aWNreSkgfVxuICB0aGlzLmxpbmUgPSBsaW5lO1xuICB0aGlzLmNoID0gY2g7XG4gIHRoaXMuc3RpY2t5ID0gc3RpY2t5O1xufVxuXG4vLyBDb21wYXJlIHR3byBwb3NpdGlvbnMsIHJldHVybiAwIGlmIHRoZXkgYXJlIHRoZSBzYW1lLCBhIG5lZ2F0aXZlXG4vLyBudW1iZXIgd2hlbiBhIGlzIGxlc3MsIGFuZCBhIHBvc2l0aXZlIG51bWJlciBvdGhlcndpc2UuXG5mdW5jdGlvbiBjbXAoYSwgYikgeyByZXR1cm4gYS5saW5lIC0gYi5saW5lIHx8IGEuY2ggLSBiLmNoIH1cblxuZnVuY3Rpb24gZXF1YWxDdXJzb3JQb3MoYSwgYikgeyByZXR1cm4gYS5zdGlja3kgPT0gYi5zdGlja3kgJiYgY21wKGEsIGIpID09IDAgfVxuXG5mdW5jdGlvbiBjb3B5UG9zKHgpIHtyZXR1cm4gUG9zKHgubGluZSwgeC5jaCl9XG5mdW5jdGlvbiBtYXhQb3MoYSwgYikgeyByZXR1cm4gY21wKGEsIGIpIDwgMCA/IGIgOiBhIH1cbmZ1bmN0aW9uIG1pblBvcyhhLCBiKSB7IHJldHVybiBjbXAoYSwgYikgPCAwID8gYSA6IGIgfVxuXG4vLyBNb3N0IG9mIHRoZSBleHRlcm5hbCBBUEkgY2xpcHMgZ2l2ZW4gcG9zaXRpb25zIHRvIG1ha2Ugc3VyZSB0aGV5XG4vLyBhY3R1YWxseSBleGlzdCB3aXRoaW4gdGhlIGRvY3VtZW50LlxuZnVuY3Rpb24gY2xpcExpbmUoZG9jLCBuKSB7cmV0dXJuIE1hdGgubWF4KGRvYy5maXJzdCwgTWF0aC5taW4obiwgZG9jLmZpcnN0ICsgZG9jLnNpemUgLSAxKSl9XG5mdW5jdGlvbiBjbGlwUG9zKGRvYywgcG9zKSB7XG4gIGlmIChwb3MubGluZSA8IGRvYy5maXJzdCkgeyByZXR1cm4gUG9zKGRvYy5maXJzdCwgMCkgfVxuICB2YXIgbGFzdCA9IGRvYy5maXJzdCArIGRvYy5zaXplIC0gMTtcbiAgaWYgKHBvcy5saW5lID4gbGFzdCkgeyByZXR1cm4gUG9zKGxhc3QsIGdldExpbmUoZG9jLCBsYXN0KS50ZXh0Lmxlbmd0aCkgfVxuICByZXR1cm4gY2xpcFRvTGVuKHBvcywgZ2V0TGluZShkb2MsIHBvcy5saW5lKS50ZXh0Lmxlbmd0aClcbn1cbmZ1bmN0aW9uIGNsaXBUb0xlbihwb3MsIGxpbmVsZW4pIHtcbiAgdmFyIGNoID0gcG9zLmNoO1xuICBpZiAoY2ggPT0gbnVsbCB8fCBjaCA+IGxpbmVsZW4pIHsgcmV0dXJuIFBvcyhwb3MubGluZSwgbGluZWxlbikgfVxuICBlbHNlIGlmIChjaCA8IDApIHsgcmV0dXJuIFBvcyhwb3MubGluZSwgMCkgfVxuICBlbHNlIHsgcmV0dXJuIHBvcyB9XG59XG5mdW5jdGlvbiBjbGlwUG9zQXJyYXkoZG9jLCBhcnJheSkge1xuICB2YXIgb3V0ID0gW107XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgYXJyYXkubGVuZ3RoOyBpKyspIHsgb3V0W2ldID0gY2xpcFBvcyhkb2MsIGFycmF5W2ldKTsgfVxuICByZXR1cm4gb3V0XG59XG5cbi8vIE9wdGltaXplIHNvbWUgY29kZSB3aGVuIHRoZXNlIGZlYXR1cmVzIGFyZSBub3QgdXNlZC5cbnZhciBzYXdSZWFkT25seVNwYW5zID0gZmFsc2U7XG52YXIgc2F3Q29sbGFwc2VkU3BhbnMgPSBmYWxzZTtcblxuZnVuY3Rpb24gc2VlUmVhZE9ubHlTcGFucygpIHtcbiAgc2F3UmVhZE9ubHlTcGFucyA9IHRydWU7XG59XG5cbmZ1bmN0aW9uIHNlZUNvbGxhcHNlZFNwYW5zKCkge1xuICBzYXdDb2xsYXBzZWRTcGFucyA9IHRydWU7XG59XG5cbi8vIFRFWFRNQVJLRVIgU1BBTlNcblxuZnVuY3Rpb24gTWFya2VkU3BhbihtYXJrZXIsIGZyb20sIHRvKSB7XG4gIHRoaXMubWFya2VyID0gbWFya2VyO1xuICB0aGlzLmZyb20gPSBmcm9tOyB0aGlzLnRvID0gdG87XG59XG5cbi8vIFNlYXJjaCBhbiBhcnJheSBvZiBzcGFucyBmb3IgYSBzcGFuIG1hdGNoaW5nIHRoZSBnaXZlbiBtYXJrZXIuXG5mdW5jdGlvbiBnZXRNYXJrZWRTcGFuRm9yKHNwYW5zLCBtYXJrZXIpIHtcbiAgaWYgKHNwYW5zKSB7IGZvciAodmFyIGkgPSAwOyBpIDwgc3BhbnMubGVuZ3RoOyArK2kpIHtcbiAgICB2YXIgc3BhbiA9IHNwYW5zW2ldO1xuICAgIGlmIChzcGFuLm1hcmtlciA9PSBtYXJrZXIpIHsgcmV0dXJuIHNwYW4gfVxuICB9IH1cbn1cbi8vIFJlbW92ZSBhIHNwYW4gZnJvbSBhbiBhcnJheSwgcmV0dXJuaW5nIHVuZGVmaW5lZCBpZiBubyBzcGFucyBhcmVcbi8vIGxlZnQgKHdlIGRvbid0IHN0b3JlIGFycmF5cyBmb3IgbGluZXMgd2l0aG91dCBzcGFucykuXG5mdW5jdGlvbiByZW1vdmVNYXJrZWRTcGFuKHNwYW5zLCBzcGFuKSB7XG4gIHZhciByO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IHNwYW5zLmxlbmd0aDsgKytpKVxuICAgIHsgaWYgKHNwYW5zW2ldICE9IHNwYW4pIHsgKHIgfHwgKHIgPSBbXSkpLnB1c2goc3BhbnNbaV0pOyB9IH1cbiAgcmV0dXJuIHJcbn1cbi8vIEFkZCBhIHNwYW4gdG8gYSBsaW5lLlxuZnVuY3Rpb24gYWRkTWFya2VkU3BhbihsaW5lLCBzcGFuKSB7XG4gIGxpbmUubWFya2VkU3BhbnMgPSBsaW5lLm1hcmtlZFNwYW5zID8gbGluZS5tYXJrZWRTcGFucy5jb25jYXQoW3NwYW5dKSA6IFtzcGFuXTtcbiAgc3Bhbi5tYXJrZXIuYXR0YWNoTGluZShsaW5lKTtcbn1cblxuLy8gVXNlZCBmb3IgdGhlIGFsZ29yaXRobSB0aGF0IGFkanVzdHMgbWFya2VycyBmb3IgYSBjaGFuZ2UgaW4gdGhlXG4vLyBkb2N1bWVudC4gVGhlc2UgZnVuY3Rpb25zIGN1dCBhbiBhcnJheSBvZiBzcGFucyBhdCBhIGdpdmVuXG4vLyBjaGFyYWN0ZXIgcG9zaXRpb24sIHJldHVybmluZyBhbiBhcnJheSBvZiByZW1haW5pbmcgY2h1bmtzIChvclxuLy8gdW5kZWZpbmVkIGlmIG5vdGhpbmcgcmVtYWlucykuXG5mdW5jdGlvbiBtYXJrZWRTcGFuc0JlZm9yZShvbGQsIHN0YXJ0Q2gsIGlzSW5zZXJ0KSB7XG4gIHZhciBudztcbiAgaWYgKG9sZCkgeyBmb3IgKHZhciBpID0gMDsgaSA8IG9sZC5sZW5ndGg7ICsraSkge1xuICAgIHZhciBzcGFuID0gb2xkW2ldLCBtYXJrZXIgPSBzcGFuLm1hcmtlcjtcbiAgICB2YXIgc3RhcnRzQmVmb3JlID0gc3Bhbi5mcm9tID09IG51bGwgfHwgKG1hcmtlci5pbmNsdXNpdmVMZWZ0ID8gc3Bhbi5mcm9tIDw9IHN0YXJ0Q2ggOiBzcGFuLmZyb20gPCBzdGFydENoKTtcbiAgICBpZiAoc3RhcnRzQmVmb3JlIHx8IHNwYW4uZnJvbSA9PSBzdGFydENoICYmIG1hcmtlci50eXBlID09IFwiYm9va21hcmtcIiAmJiAoIWlzSW5zZXJ0IHx8ICFzcGFuLm1hcmtlci5pbnNlcnRMZWZ0KSkge1xuICAgICAgdmFyIGVuZHNBZnRlciA9IHNwYW4udG8gPT0gbnVsbCB8fCAobWFya2VyLmluY2x1c2l2ZVJpZ2h0ID8gc3Bhbi50byA+PSBzdGFydENoIDogc3Bhbi50byA+IHN0YXJ0Q2gpOyhudyB8fCAobncgPSBbXSkpLnB1c2gobmV3IE1hcmtlZFNwYW4obWFya2VyLCBzcGFuLmZyb20sIGVuZHNBZnRlciA/IG51bGwgOiBzcGFuLnRvKSk7XG4gICAgfVxuICB9IH1cbiAgcmV0dXJuIG53XG59XG5mdW5jdGlvbiBtYXJrZWRTcGFuc0FmdGVyKG9sZCwgZW5kQ2gsIGlzSW5zZXJ0KSB7XG4gIHZhciBudztcbiAgaWYgKG9sZCkgeyBmb3IgKHZhciBpID0gMDsgaSA8IG9sZC5sZW5ndGg7ICsraSkge1xuICAgIHZhciBzcGFuID0gb2xkW2ldLCBtYXJrZXIgPSBzcGFuLm1hcmtlcjtcbiAgICB2YXIgZW5kc0FmdGVyID0gc3Bhbi50byA9PSBudWxsIHx8IChtYXJrZXIuaW5jbHVzaXZlUmlnaHQgPyBzcGFuLnRvID49IGVuZENoIDogc3Bhbi50byA+IGVuZENoKTtcbiAgICBpZiAoZW5kc0FmdGVyIHx8IHNwYW4uZnJvbSA9PSBlbmRDaCAmJiBtYXJrZXIudHlwZSA9PSBcImJvb2ttYXJrXCIgJiYgKCFpc0luc2VydCB8fCBzcGFuLm1hcmtlci5pbnNlcnRMZWZ0KSkge1xuICAgICAgdmFyIHN0YXJ0c0JlZm9yZSA9IHNwYW4uZnJvbSA9PSBudWxsIHx8IChtYXJrZXIuaW5jbHVzaXZlTGVmdCA/IHNwYW4uZnJvbSA8PSBlbmRDaCA6IHNwYW4uZnJvbSA8IGVuZENoKTsobncgfHwgKG53ID0gW10pKS5wdXNoKG5ldyBNYXJrZWRTcGFuKG1hcmtlciwgc3RhcnRzQmVmb3JlID8gbnVsbCA6IHNwYW4uZnJvbSAtIGVuZENoLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzcGFuLnRvID09IG51bGwgPyBudWxsIDogc3Bhbi50byAtIGVuZENoKSk7XG4gICAgfVxuICB9IH1cbiAgcmV0dXJuIG53XG59XG5cbi8vIEdpdmVuIGEgY2hhbmdlIG9iamVjdCwgY29tcHV0ZSB0aGUgbmV3IHNldCBvZiBtYXJrZXIgc3BhbnMgdGhhdFxuLy8gY292ZXIgdGhlIGxpbmUgaW4gd2hpY2ggdGhlIGNoYW5nZSB0b29rIHBsYWNlLiBSZW1vdmVzIHNwYW5zXG4vLyBlbnRpcmVseSB3aXRoaW4gdGhlIGNoYW5nZSwgcmVjb25uZWN0cyBzcGFucyBiZWxvbmdpbmcgdG8gdGhlXG4vLyBzYW1lIG1hcmtlciB0aGF0IGFwcGVhciBvbiBib3RoIHNpZGVzIG9mIHRoZSBjaGFuZ2UsIGFuZCBjdXRzIG9mZlxuLy8gc3BhbnMgcGFydGlhbGx5IHdpdGhpbiB0aGUgY2hhbmdlLiBSZXR1cm5zIGFuIGFycmF5IG9mIHNwYW5cbi8vIGFycmF5cyB3aXRoIG9uZSBlbGVtZW50IGZvciBlYWNoIGxpbmUgaW4gKGFmdGVyKSB0aGUgY2hhbmdlLlxuZnVuY3Rpb24gc3RyZXRjaFNwYW5zT3ZlckNoYW5nZShkb2MsIGNoYW5nZSkge1xuICBpZiAoY2hhbmdlLmZ1bGwpIHsgcmV0dXJuIG51bGwgfVxuICB2YXIgb2xkRmlyc3QgPSBpc0xpbmUoZG9jLCBjaGFuZ2UuZnJvbS5saW5lKSAmJiBnZXRMaW5lKGRvYywgY2hhbmdlLmZyb20ubGluZSkubWFya2VkU3BhbnM7XG4gIHZhciBvbGRMYXN0ID0gaXNMaW5lKGRvYywgY2hhbmdlLnRvLmxpbmUpICYmIGdldExpbmUoZG9jLCBjaGFuZ2UudG8ubGluZSkubWFya2VkU3BhbnM7XG4gIGlmICghb2xkRmlyc3QgJiYgIW9sZExhc3QpIHsgcmV0dXJuIG51bGwgfVxuXG4gIHZhciBzdGFydENoID0gY2hhbmdlLmZyb20uY2gsIGVuZENoID0gY2hhbmdlLnRvLmNoLCBpc0luc2VydCA9IGNtcChjaGFuZ2UuZnJvbSwgY2hhbmdlLnRvKSA9PSAwO1xuICAvLyBHZXQgdGhlIHNwYW5zIHRoYXQgJ3N0aWNrIG91dCcgb24gYm90aCBzaWRlc1xuICB2YXIgZmlyc3QgPSBtYXJrZWRTcGFuc0JlZm9yZShvbGRGaXJzdCwgc3RhcnRDaCwgaXNJbnNlcnQpO1xuICB2YXIgbGFzdCA9IG1hcmtlZFNwYW5zQWZ0ZXIob2xkTGFzdCwgZW5kQ2gsIGlzSW5zZXJ0KTtcblxuICAvLyBOZXh0LCBtZXJnZSB0aG9zZSB0d28gZW5kc1xuICB2YXIgc2FtZUxpbmUgPSBjaGFuZ2UudGV4dC5sZW5ndGggPT0gMSwgb2Zmc2V0ID0gbHN0KGNoYW5nZS50ZXh0KS5sZW5ndGggKyAoc2FtZUxpbmUgPyBzdGFydENoIDogMCk7XG4gIGlmIChmaXJzdCkge1xuICAgIC8vIEZpeCB1cCAudG8gcHJvcGVydGllcyBvZiBmaXJzdFxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZmlyc3QubGVuZ3RoOyArK2kpIHtcbiAgICAgIHZhciBzcGFuID0gZmlyc3RbaV07XG4gICAgICBpZiAoc3Bhbi50byA9PSBudWxsKSB7XG4gICAgICAgIHZhciBmb3VuZCA9IGdldE1hcmtlZFNwYW5Gb3IobGFzdCwgc3Bhbi5tYXJrZXIpO1xuICAgICAgICBpZiAoIWZvdW5kKSB7IHNwYW4udG8gPSBzdGFydENoOyB9XG4gICAgICAgIGVsc2UgaWYgKHNhbWVMaW5lKSB7IHNwYW4udG8gPSBmb3VuZC50byA9PSBudWxsID8gbnVsbCA6IGZvdW5kLnRvICsgb2Zmc2V0OyB9XG4gICAgICB9XG4gICAgfVxuICB9XG4gIGlmIChsYXN0KSB7XG4gICAgLy8gRml4IHVwIC5mcm9tIGluIGxhc3QgKG9yIG1vdmUgdGhlbSBpbnRvIGZpcnN0IGluIGNhc2Ugb2Ygc2FtZUxpbmUpXG4gICAgZm9yICh2YXIgaSQxID0gMDsgaSQxIDwgbGFzdC5sZW5ndGg7ICsraSQxKSB7XG4gICAgICB2YXIgc3BhbiQxID0gbGFzdFtpJDFdO1xuICAgICAgaWYgKHNwYW4kMS50byAhPSBudWxsKSB7IHNwYW4kMS50byArPSBvZmZzZXQ7IH1cbiAgICAgIGlmIChzcGFuJDEuZnJvbSA9PSBudWxsKSB7XG4gICAgICAgIHZhciBmb3VuZCQxID0gZ2V0TWFya2VkU3BhbkZvcihmaXJzdCwgc3BhbiQxLm1hcmtlcik7XG4gICAgICAgIGlmICghZm91bmQkMSkge1xuICAgICAgICAgIHNwYW4kMS5mcm9tID0gb2Zmc2V0O1xuICAgICAgICAgIGlmIChzYW1lTGluZSkgeyAoZmlyc3QgfHwgKGZpcnN0ID0gW10pKS5wdXNoKHNwYW4kMSk7IH1cbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc3BhbiQxLmZyb20gKz0gb2Zmc2V0O1xuICAgICAgICBpZiAoc2FtZUxpbmUpIHsgKGZpcnN0IHx8IChmaXJzdCA9IFtdKSkucHVzaChzcGFuJDEpOyB9XG4gICAgICB9XG4gICAgfVxuICB9XG4gIC8vIE1ha2Ugc3VyZSB3ZSBkaWRuJ3QgY3JlYXRlIGFueSB6ZXJvLWxlbmd0aCBzcGFuc1xuICBpZiAoZmlyc3QpIHsgZmlyc3QgPSBjbGVhckVtcHR5U3BhbnMoZmlyc3QpOyB9XG4gIGlmIChsYXN0ICYmIGxhc3QgIT0gZmlyc3QpIHsgbGFzdCA9IGNsZWFyRW1wdHlTcGFucyhsYXN0KTsgfVxuXG4gIHZhciBuZXdNYXJrZXJzID0gW2ZpcnN0XTtcbiAgaWYgKCFzYW1lTGluZSkge1xuICAgIC8vIEZpbGwgZ2FwIHdpdGggd2hvbGUtbGluZS1zcGFuc1xuICAgIHZhciBnYXAgPSBjaGFuZ2UudGV4dC5sZW5ndGggLSAyLCBnYXBNYXJrZXJzO1xuICAgIGlmIChnYXAgPiAwICYmIGZpcnN0KVxuICAgICAgeyBmb3IgKHZhciBpJDIgPSAwOyBpJDIgPCBmaXJzdC5sZW5ndGg7ICsraSQyKVxuICAgICAgICB7IGlmIChmaXJzdFtpJDJdLnRvID09IG51bGwpXG4gICAgICAgICAgeyAoZ2FwTWFya2VycyB8fCAoZ2FwTWFya2VycyA9IFtdKSkucHVzaChuZXcgTWFya2VkU3BhbihmaXJzdFtpJDJdLm1hcmtlciwgbnVsbCwgbnVsbCkpOyB9IH0gfVxuICAgIGZvciAodmFyIGkkMyA9IDA7IGkkMyA8IGdhcDsgKytpJDMpXG4gICAgICB7IG5ld01hcmtlcnMucHVzaChnYXBNYXJrZXJzKTsgfVxuICAgIG5ld01hcmtlcnMucHVzaChsYXN0KTtcbiAgfVxuICByZXR1cm4gbmV3TWFya2Vyc1xufVxuXG4vLyBSZW1vdmUgc3BhbnMgdGhhdCBhcmUgZW1wdHkgYW5kIGRvbid0IGhhdmUgYSBjbGVhcldoZW5FbXB0eVxuLy8gb3B0aW9uIG9mIGZhbHNlLlxuZnVuY3Rpb24gY2xlYXJFbXB0eVNwYW5zKHNwYW5zKSB7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc3BhbnMubGVuZ3RoOyArK2kpIHtcbiAgICB2YXIgc3BhbiA9IHNwYW5zW2ldO1xuICAgIGlmIChzcGFuLmZyb20gIT0gbnVsbCAmJiBzcGFuLmZyb20gPT0gc3Bhbi50byAmJiBzcGFuLm1hcmtlci5jbGVhcldoZW5FbXB0eSAhPT0gZmFsc2UpXG4gICAgICB7IHNwYW5zLnNwbGljZShpLS0sIDEpOyB9XG4gIH1cbiAgaWYgKCFzcGFucy5sZW5ndGgpIHsgcmV0dXJuIG51bGwgfVxuICByZXR1cm4gc3BhbnNcbn1cblxuLy8gVXNlZCB0byAnY2xpcCcgb3V0IHJlYWRPbmx5IHJhbmdlcyB3aGVuIG1ha2luZyBhIGNoYW5nZS5cbmZ1bmN0aW9uIHJlbW92ZVJlYWRPbmx5UmFuZ2VzKGRvYywgZnJvbSwgdG8pIHtcbiAgdmFyIG1hcmtlcnMgPSBudWxsO1xuICBkb2MuaXRlcihmcm9tLmxpbmUsIHRvLmxpbmUgKyAxLCBmdW5jdGlvbiAobGluZSkge1xuICAgIGlmIChsaW5lLm1hcmtlZFNwYW5zKSB7IGZvciAodmFyIGkgPSAwOyBpIDwgbGluZS5tYXJrZWRTcGFucy5sZW5ndGg7ICsraSkge1xuICAgICAgdmFyIG1hcmsgPSBsaW5lLm1hcmtlZFNwYW5zW2ldLm1hcmtlcjtcbiAgICAgIGlmIChtYXJrLnJlYWRPbmx5ICYmICghbWFya2VycyB8fCBpbmRleE9mKG1hcmtlcnMsIG1hcmspID09IC0xKSlcbiAgICAgICAgeyAobWFya2VycyB8fCAobWFya2VycyA9IFtdKSkucHVzaChtYXJrKTsgfVxuICAgIH0gfVxuICB9KTtcbiAgaWYgKCFtYXJrZXJzKSB7IHJldHVybiBudWxsIH1cbiAgdmFyIHBhcnRzID0gW3tmcm9tOiBmcm9tLCB0bzogdG99XTtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBtYXJrZXJzLmxlbmd0aDsgKytpKSB7XG4gICAgdmFyIG1rID0gbWFya2Vyc1tpXSwgbSA9IG1rLmZpbmQoMCk7XG4gICAgZm9yICh2YXIgaiA9IDA7IGogPCBwYXJ0cy5sZW5ndGg7ICsraikge1xuICAgICAgdmFyIHAgPSBwYXJ0c1tqXTtcbiAgICAgIGlmIChjbXAocC50bywgbS5mcm9tKSA8IDAgfHwgY21wKHAuZnJvbSwgbS50bykgPiAwKSB7IGNvbnRpbnVlIH1cbiAgICAgIHZhciBuZXdQYXJ0cyA9IFtqLCAxXSwgZGZyb20gPSBjbXAocC5mcm9tLCBtLmZyb20pLCBkdG8gPSBjbXAocC50bywgbS50byk7XG4gICAgICBpZiAoZGZyb20gPCAwIHx8ICFtay5pbmNsdXNpdmVMZWZ0ICYmICFkZnJvbSlcbiAgICAgICAgeyBuZXdQYXJ0cy5wdXNoKHtmcm9tOiBwLmZyb20sIHRvOiBtLmZyb219KTsgfVxuICAgICAgaWYgKGR0byA+IDAgfHwgIW1rLmluY2x1c2l2ZVJpZ2h0ICYmICFkdG8pXG4gICAgICAgIHsgbmV3UGFydHMucHVzaCh7ZnJvbTogbS50bywgdG86IHAudG99KTsgfVxuICAgICAgcGFydHMuc3BsaWNlLmFwcGx5KHBhcnRzLCBuZXdQYXJ0cyk7XG4gICAgICBqICs9IG5ld1BhcnRzLmxlbmd0aCAtIDM7XG4gICAgfVxuICB9XG4gIHJldHVybiBwYXJ0c1xufVxuXG4vLyBDb25uZWN0IG9yIGRpc2Nvbm5lY3Qgc3BhbnMgZnJvbSBhIGxpbmUuXG5mdW5jdGlvbiBkZXRhY2hNYXJrZWRTcGFucyhsaW5lKSB7XG4gIHZhciBzcGFucyA9IGxpbmUubWFya2VkU3BhbnM7XG4gIGlmICghc3BhbnMpIHsgcmV0dXJuIH1cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBzcGFucy5sZW5ndGg7ICsraSlcbiAgICB7IHNwYW5zW2ldLm1hcmtlci5kZXRhY2hMaW5lKGxpbmUpOyB9XG4gIGxpbmUubWFya2VkU3BhbnMgPSBudWxsO1xufVxuZnVuY3Rpb24gYXR0YWNoTWFya2VkU3BhbnMobGluZSwgc3BhbnMpIHtcbiAgaWYgKCFzcGFucykgeyByZXR1cm4gfVxuICBmb3IgKHZhciBpID0gMDsgaSA8IHNwYW5zLmxlbmd0aDsgKytpKVxuICAgIHsgc3BhbnNbaV0ubWFya2VyLmF0dGFjaExpbmUobGluZSk7IH1cbiAgbGluZS5tYXJrZWRTcGFucyA9IHNwYW5zO1xufVxuXG4vLyBIZWxwZXJzIHVzZWQgd2hlbiBjb21wdXRpbmcgd2hpY2ggb3ZlcmxhcHBpbmcgY29sbGFwc2VkIHNwYW5cbi8vIGNvdW50cyBhcyB0aGUgbGFyZ2VyIG9uZS5cbmZ1bmN0aW9uIGV4dHJhTGVmdChtYXJrZXIpIHsgcmV0dXJuIG1hcmtlci5pbmNsdXNpdmVMZWZ0ID8gLTEgOiAwIH1cbmZ1bmN0aW9uIGV4dHJhUmlnaHQobWFya2VyKSB7IHJldHVybiBtYXJrZXIuaW5jbHVzaXZlUmlnaHQgPyAxIDogMCB9XG5cbi8vIFJldHVybnMgYSBudW1iZXIgaW5kaWNhdGluZyB3aGljaCBvZiB0d28gb3ZlcmxhcHBpbmcgY29sbGFwc2VkXG4vLyBzcGFucyBpcyBsYXJnZXIgKGFuZCB0aHVzIGluY2x1ZGVzIHRoZSBvdGhlcikuIEZhbGxzIGJhY2sgdG9cbi8vIGNvbXBhcmluZyBpZHMgd2hlbiB0aGUgc3BhbnMgY292ZXIgZXhhY3RseSB0aGUgc2FtZSByYW5nZS5cbmZ1bmN0aW9uIGNvbXBhcmVDb2xsYXBzZWRNYXJrZXJzKGEsIGIpIHtcbiAgdmFyIGxlbkRpZmYgPSBhLmxpbmVzLmxlbmd0aCAtIGIubGluZXMubGVuZ3RoO1xuICBpZiAobGVuRGlmZiAhPSAwKSB7IHJldHVybiBsZW5EaWZmIH1cbiAgdmFyIGFQb3MgPSBhLmZpbmQoKSwgYlBvcyA9IGIuZmluZCgpO1xuICB2YXIgZnJvbUNtcCA9IGNtcChhUG9zLmZyb20sIGJQb3MuZnJvbSkgfHwgZXh0cmFMZWZ0KGEpIC0gZXh0cmFMZWZ0KGIpO1xuICBpZiAoZnJvbUNtcCkgeyByZXR1cm4gLWZyb21DbXAgfVxuICB2YXIgdG9DbXAgPSBjbXAoYVBvcy50bywgYlBvcy50bykgfHwgZXh0cmFSaWdodChhKSAtIGV4dHJhUmlnaHQoYik7XG4gIGlmICh0b0NtcCkgeyByZXR1cm4gdG9DbXAgfVxuICByZXR1cm4gYi5pZCAtIGEuaWRcbn1cblxuLy8gRmluZCBvdXQgd2hldGhlciBhIGxpbmUgZW5kcyBvciBzdGFydHMgaW4gYSBjb2xsYXBzZWQgc3Bhbi4gSWZcbi8vIHNvLCByZXR1cm4gdGhlIG1hcmtlciBmb3IgdGhhdCBzcGFuLlxuZnVuY3Rpb24gY29sbGFwc2VkU3BhbkF0U2lkZShsaW5lLCBzdGFydCkge1xuICB2YXIgc3BzID0gc2F3Q29sbGFwc2VkU3BhbnMgJiYgbGluZS5tYXJrZWRTcGFucywgZm91bmQ7XG4gIGlmIChzcHMpIHsgZm9yICh2YXIgc3AgPSAodm9pZCAwKSwgaSA9IDA7IGkgPCBzcHMubGVuZ3RoOyArK2kpIHtcbiAgICBzcCA9IHNwc1tpXTtcbiAgICBpZiAoc3AubWFya2VyLmNvbGxhcHNlZCAmJiAoc3RhcnQgPyBzcC5mcm9tIDogc3AudG8pID09IG51bGwgJiZcbiAgICAgICAgKCFmb3VuZCB8fCBjb21wYXJlQ29sbGFwc2VkTWFya2Vycyhmb3VuZCwgc3AubWFya2VyKSA8IDApKVxuICAgICAgeyBmb3VuZCA9IHNwLm1hcmtlcjsgfVxuICB9IH1cbiAgcmV0dXJuIGZvdW5kXG59XG5mdW5jdGlvbiBjb2xsYXBzZWRTcGFuQXRTdGFydChsaW5lKSB7IHJldHVybiBjb2xsYXBzZWRTcGFuQXRTaWRlKGxpbmUsIHRydWUpIH1cbmZ1bmN0aW9uIGNvbGxhcHNlZFNwYW5BdEVuZChsaW5lKSB7IHJldHVybiBjb2xsYXBzZWRTcGFuQXRTaWRlKGxpbmUsIGZhbHNlKSB9XG5cbmZ1bmN0aW9uIGNvbGxhcHNlZFNwYW5Bcm91bmQobGluZSwgY2gpIHtcbiAgdmFyIHNwcyA9IHNhd0NvbGxhcHNlZFNwYW5zICYmIGxpbmUubWFya2VkU3BhbnMsIGZvdW5kO1xuICBpZiAoc3BzKSB7IGZvciAodmFyIGkgPSAwOyBpIDwgc3BzLmxlbmd0aDsgKytpKSB7XG4gICAgdmFyIHNwID0gc3BzW2ldO1xuICAgIGlmIChzcC5tYXJrZXIuY29sbGFwc2VkICYmIChzcC5mcm9tID09IG51bGwgfHwgc3AuZnJvbSA8IGNoKSAmJiAoc3AudG8gPT0gbnVsbCB8fCBzcC50byA+IGNoKSAmJlxuICAgICAgICAoIWZvdW5kIHx8IGNvbXBhcmVDb2xsYXBzZWRNYXJrZXJzKGZvdW5kLCBzcC5tYXJrZXIpIDwgMCkpIHsgZm91bmQgPSBzcC5tYXJrZXI7IH1cbiAgfSB9XG4gIHJldHVybiBmb3VuZFxufVxuXG4vLyBUZXN0IHdoZXRoZXIgdGhlcmUgZXhpc3RzIGEgY29sbGFwc2VkIHNwYW4gdGhhdCBwYXJ0aWFsbHlcbi8vIG92ZXJsYXBzIChjb3ZlcnMgdGhlIHN0YXJ0IG9yIGVuZCwgYnV0IG5vdCBib3RoKSBvZiBhIG5ldyBzcGFuLlxuLy8gU3VjaCBvdmVybGFwIGlzIG5vdCBhbGxvd2VkLlxuZnVuY3Rpb24gY29uZmxpY3RpbmdDb2xsYXBzZWRSYW5nZShkb2MsIGxpbmVObyQkMSwgZnJvbSwgdG8sIG1hcmtlcikge1xuICB2YXIgbGluZSA9IGdldExpbmUoZG9jLCBsaW5lTm8kJDEpO1xuICB2YXIgc3BzID0gc2F3Q29sbGFwc2VkU3BhbnMgJiYgbGluZS5tYXJrZWRTcGFucztcbiAgaWYgKHNwcykgeyBmb3IgKHZhciBpID0gMDsgaSA8IHNwcy5sZW5ndGg7ICsraSkge1xuICAgIHZhciBzcCA9IHNwc1tpXTtcbiAgICBpZiAoIXNwLm1hcmtlci5jb2xsYXBzZWQpIHsgY29udGludWUgfVxuICAgIHZhciBmb3VuZCA9IHNwLm1hcmtlci5maW5kKDApO1xuICAgIHZhciBmcm9tQ21wID0gY21wKGZvdW5kLmZyb20sIGZyb20pIHx8IGV4dHJhTGVmdChzcC5tYXJrZXIpIC0gZXh0cmFMZWZ0KG1hcmtlcik7XG4gICAgdmFyIHRvQ21wID0gY21wKGZvdW5kLnRvLCB0bykgfHwgZXh0cmFSaWdodChzcC5tYXJrZXIpIC0gZXh0cmFSaWdodChtYXJrZXIpO1xuICAgIGlmIChmcm9tQ21wID49IDAgJiYgdG9DbXAgPD0gMCB8fCBmcm9tQ21wIDw9IDAgJiYgdG9DbXAgPj0gMCkgeyBjb250aW51ZSB9XG4gICAgaWYgKGZyb21DbXAgPD0gMCAmJiAoc3AubWFya2VyLmluY2x1c2l2ZVJpZ2h0ICYmIG1hcmtlci5pbmNsdXNpdmVMZWZ0ID8gY21wKGZvdW5kLnRvLCBmcm9tKSA+PSAwIDogY21wKGZvdW5kLnRvLCBmcm9tKSA+IDApIHx8XG4gICAgICAgIGZyb21DbXAgPj0gMCAmJiAoc3AubWFya2VyLmluY2x1c2l2ZVJpZ2h0ICYmIG1hcmtlci5pbmNsdXNpdmVMZWZ0ID8gY21wKGZvdW5kLmZyb20sIHRvKSA8PSAwIDogY21wKGZvdW5kLmZyb20sIHRvKSA8IDApKVxuICAgICAgeyByZXR1cm4gdHJ1ZSB9XG4gIH0gfVxufVxuXG4vLyBBIHZpc3VhbCBsaW5lIGlzIGEgbGluZSBhcyBkcmF3biBvbiB0aGUgc2NyZWVuLiBGb2xkaW5nLCBmb3Jcbi8vIGV4YW1wbGUsIGNhbiBjYXVzZSBtdWx0aXBsZSBsb2dpY2FsIGxpbmVzIHRvIGFwcGVhciBvbiB0aGUgc2FtZVxuLy8gdmlzdWFsIGxpbmUuIFRoaXMgZmluZHMgdGhlIHN0YXJ0IG9mIHRoZSB2aXN1YWwgbGluZSB0aGF0IHRoZVxuLy8gZ2l2ZW4gbGluZSBpcyBwYXJ0IG9mICh1c3VhbGx5IHRoYXQgaXMgdGhlIGxpbmUgaXRzZWxmKS5cbmZ1bmN0aW9uIHZpc3VhbExpbmUobGluZSkge1xuICB2YXIgbWVyZ2VkO1xuICB3aGlsZSAobWVyZ2VkID0gY29sbGFwc2VkU3BhbkF0U3RhcnQobGluZSkpXG4gICAgeyBsaW5lID0gbWVyZ2VkLmZpbmQoLTEsIHRydWUpLmxpbmU7IH1cbiAgcmV0dXJuIGxpbmVcbn1cblxuZnVuY3Rpb24gdmlzdWFsTGluZUVuZChsaW5lKSB7XG4gIHZhciBtZXJnZWQ7XG4gIHdoaWxlIChtZXJnZWQgPSBjb2xsYXBzZWRTcGFuQXRFbmQobGluZSkpXG4gICAgeyBsaW5lID0gbWVyZ2VkLmZpbmQoMSwgdHJ1ZSkubGluZTsgfVxuICByZXR1cm4gbGluZVxufVxuXG4vLyBSZXR1cm5zIGFuIGFycmF5IG9mIGxvZ2ljYWwgbGluZXMgdGhhdCBjb250aW51ZSB0aGUgdmlzdWFsIGxpbmVcbi8vIHN0YXJ0ZWQgYnkgdGhlIGFyZ3VtZW50LCBvciB1bmRlZmluZWQgaWYgdGhlcmUgYXJlIG5vIHN1Y2ggbGluZXMuXG5mdW5jdGlvbiB2aXN1YWxMaW5lQ29udGludWVkKGxpbmUpIHtcbiAgdmFyIG1lcmdlZCwgbGluZXM7XG4gIHdoaWxlIChtZXJnZWQgPSBjb2xsYXBzZWRTcGFuQXRFbmQobGluZSkpIHtcbiAgICBsaW5lID0gbWVyZ2VkLmZpbmQoMSwgdHJ1ZSkubGluZVxuICAgIDsobGluZXMgfHwgKGxpbmVzID0gW10pKS5wdXNoKGxpbmUpO1xuICB9XG4gIHJldHVybiBsaW5lc1xufVxuXG4vLyBHZXQgdGhlIGxpbmUgbnVtYmVyIG9mIHRoZSBzdGFydCBvZiB0aGUgdmlzdWFsIGxpbmUgdGhhdCB0aGVcbi8vIGdpdmVuIGxpbmUgbnVtYmVyIGlzIHBhcnQgb2YuXG5mdW5jdGlvbiB2aXN1YWxMaW5lTm8oZG9jLCBsaW5lTikge1xuICB2YXIgbGluZSA9IGdldExpbmUoZG9jLCBsaW5lTiksIHZpcyA9IHZpc3VhbExpbmUobGluZSk7XG4gIGlmIChsaW5lID09IHZpcykgeyByZXR1cm4gbGluZU4gfVxuICByZXR1cm4gbGluZU5vKHZpcylcbn1cblxuLy8gR2V0IHRoZSBsaW5lIG51bWJlciBvZiB0aGUgc3RhcnQgb2YgdGhlIG5leHQgdmlzdWFsIGxpbmUgYWZ0ZXJcbi8vIHRoZSBnaXZlbiBsaW5lLlxuZnVuY3Rpb24gdmlzdWFsTGluZUVuZE5vKGRvYywgbGluZU4pIHtcbiAgaWYgKGxpbmVOID4gZG9jLmxhc3RMaW5lKCkpIHsgcmV0dXJuIGxpbmVOIH1cbiAgdmFyIGxpbmUgPSBnZXRMaW5lKGRvYywgbGluZU4pLCBtZXJnZWQ7XG4gIGlmICghbGluZUlzSGlkZGVuKGRvYywgbGluZSkpIHsgcmV0dXJuIGxpbmVOIH1cbiAgd2hpbGUgKG1lcmdlZCA9IGNvbGxhcHNlZFNwYW5BdEVuZChsaW5lKSlcbiAgICB7IGxpbmUgPSBtZXJnZWQuZmluZCgxLCB0cnVlKS5saW5lOyB9XG4gIHJldHVybiBsaW5lTm8obGluZSkgKyAxXG59XG5cbi8vIENvbXB1dGUgd2hldGhlciBhIGxpbmUgaXMgaGlkZGVuLiBMaW5lcyBjb3VudCBhcyBoaWRkZW4gd2hlbiB0aGV5XG4vLyBhcmUgcGFydCBvZiBhIHZpc3VhbCBsaW5lIHRoYXQgc3RhcnRzIHdpdGggYW5vdGhlciBsaW5lLCBvciB3aGVuXG4vLyB0aGV5IGFyZSBlbnRpcmVseSBjb3ZlcmVkIGJ5IGNvbGxhcHNlZCwgbm9uLXdpZGdldCBzcGFuLlxuZnVuY3Rpb24gbGluZUlzSGlkZGVuKGRvYywgbGluZSkge1xuICB2YXIgc3BzID0gc2F3Q29sbGFwc2VkU3BhbnMgJiYgbGluZS5tYXJrZWRTcGFucztcbiAgaWYgKHNwcykgeyBmb3IgKHZhciBzcCA9ICh2b2lkIDApLCBpID0gMDsgaSA8IHNwcy5sZW5ndGg7ICsraSkge1xuICAgIHNwID0gc3BzW2ldO1xuICAgIGlmICghc3AubWFya2VyLmNvbGxhcHNlZCkgeyBjb250aW51ZSB9XG4gICAgaWYgKHNwLmZyb20gPT0gbnVsbCkgeyByZXR1cm4gdHJ1ZSB9XG4gICAgaWYgKHNwLm1hcmtlci53aWRnZXROb2RlKSB7IGNvbnRpbnVlIH1cbiAgICBpZiAoc3AuZnJvbSA9PSAwICYmIHNwLm1hcmtlci5pbmNsdXNpdmVMZWZ0ICYmIGxpbmVJc0hpZGRlbklubmVyKGRvYywgbGluZSwgc3ApKVxuICAgICAgeyByZXR1cm4gdHJ1ZSB9XG4gIH0gfVxufVxuZnVuY3Rpb24gbGluZUlzSGlkZGVuSW5uZXIoZG9jLCBsaW5lLCBzcGFuKSB7XG4gIGlmIChzcGFuLnRvID09IG51bGwpIHtcbiAgICB2YXIgZW5kID0gc3Bhbi5tYXJrZXIuZmluZCgxLCB0cnVlKTtcbiAgICByZXR1cm4gbGluZUlzSGlkZGVuSW5uZXIoZG9jLCBlbmQubGluZSwgZ2V0TWFya2VkU3BhbkZvcihlbmQubGluZS5tYXJrZWRTcGFucywgc3Bhbi5tYXJrZXIpKVxuICB9XG4gIGlmIChzcGFuLm1hcmtlci5pbmNsdXNpdmVSaWdodCAmJiBzcGFuLnRvID09IGxpbmUudGV4dC5sZW5ndGgpXG4gICAgeyByZXR1cm4gdHJ1ZSB9XG4gIGZvciAodmFyIHNwID0gKHZvaWQgMCksIGkgPSAwOyBpIDwgbGluZS5tYXJrZWRTcGFucy5sZW5ndGg7ICsraSkge1xuICAgIHNwID0gbGluZS5tYXJrZWRTcGFuc1tpXTtcbiAgICBpZiAoc3AubWFya2VyLmNvbGxhcHNlZCAmJiAhc3AubWFya2VyLndpZGdldE5vZGUgJiYgc3AuZnJvbSA9PSBzcGFuLnRvICYmXG4gICAgICAgIChzcC50byA9PSBudWxsIHx8IHNwLnRvICE9IHNwYW4uZnJvbSkgJiZcbiAgICAgICAgKHNwLm1hcmtlci5pbmNsdXNpdmVMZWZ0IHx8IHNwYW4ubWFya2VyLmluY2x1c2l2ZVJpZ2h0KSAmJlxuICAgICAgICBsaW5lSXNIaWRkZW5Jbm5lcihkb2MsIGxpbmUsIHNwKSkgeyByZXR1cm4gdHJ1ZSB9XG4gIH1cbn1cblxuLy8gRmluZCB0aGUgaGVpZ2h0IGFib3ZlIHRoZSBnaXZlbiBsaW5lLlxuZnVuY3Rpb24gaGVpZ2h0QXRMaW5lKGxpbmVPYmopIHtcbiAgbGluZU9iaiA9IHZpc3VhbExpbmUobGluZU9iaik7XG5cbiAgdmFyIGggPSAwLCBjaHVuayA9IGxpbmVPYmoucGFyZW50O1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGNodW5rLmxpbmVzLmxlbmd0aDsgKytpKSB7XG4gICAgdmFyIGxpbmUgPSBjaHVuay5saW5lc1tpXTtcbiAgICBpZiAobGluZSA9PSBsaW5lT2JqKSB7IGJyZWFrIH1cbiAgICBlbHNlIHsgaCArPSBsaW5lLmhlaWdodDsgfVxuICB9XG4gIGZvciAodmFyIHAgPSBjaHVuay5wYXJlbnQ7IHA7IGNodW5rID0gcCwgcCA9IGNodW5rLnBhcmVudCkge1xuICAgIGZvciAodmFyIGkkMSA9IDA7IGkkMSA8IHAuY2hpbGRyZW4ubGVuZ3RoOyArK2kkMSkge1xuICAgICAgdmFyIGN1ciA9IHAuY2hpbGRyZW5baSQxXTtcbiAgICAgIGlmIChjdXIgPT0gY2h1bmspIHsgYnJlYWsgfVxuICAgICAgZWxzZSB7IGggKz0gY3VyLmhlaWdodDsgfVxuICAgIH1cbiAgfVxuICByZXR1cm4gaFxufVxuXG4vLyBDb21wdXRlIHRoZSBjaGFyYWN0ZXIgbGVuZ3RoIG9mIGEgbGluZSwgdGFraW5nIGludG8gYWNjb3VudFxuLy8gY29sbGFwc2VkIHJhbmdlcyAoc2VlIG1hcmtUZXh0KSB0aGF0IG1pZ2h0IGhpZGUgcGFydHMsIGFuZCBqb2luXG4vLyBvdGhlciBsaW5lcyBvbnRvIGl0LlxuZnVuY3Rpb24gbGluZUxlbmd0aChsaW5lKSB7XG4gIGlmIChsaW5lLmhlaWdodCA9PSAwKSB7IHJldHVybiAwIH1cbiAgdmFyIGxlbiA9IGxpbmUudGV4dC5sZW5ndGgsIG1lcmdlZCwgY3VyID0gbGluZTtcbiAgd2hpbGUgKG1lcmdlZCA9IGNvbGxhcHNlZFNwYW5BdFN0YXJ0KGN1cikpIHtcbiAgICB2YXIgZm91bmQgPSBtZXJnZWQuZmluZCgwLCB0cnVlKTtcbiAgICBjdXIgPSBmb3VuZC5mcm9tLmxpbmU7XG4gICAgbGVuICs9IGZvdW5kLmZyb20uY2ggLSBmb3VuZC50by5jaDtcbiAgfVxuICBjdXIgPSBsaW5lO1xuICB3aGlsZSAobWVyZ2VkID0gY29sbGFwc2VkU3BhbkF0RW5kKGN1cikpIHtcbiAgICB2YXIgZm91bmQkMSA9IG1lcmdlZC5maW5kKDAsIHRydWUpO1xuICAgIGxlbiAtPSBjdXIudGV4dC5sZW5ndGggLSBmb3VuZCQxLmZyb20uY2g7XG4gICAgY3VyID0gZm91bmQkMS50by5saW5lO1xuICAgIGxlbiArPSBjdXIudGV4dC5sZW5ndGggLSBmb3VuZCQxLnRvLmNoO1xuICB9XG4gIHJldHVybiBsZW5cbn1cblxuLy8gRmluZCB0aGUgbG9uZ2VzdCBsaW5lIGluIHRoZSBkb2N1bWVudC5cbmZ1bmN0aW9uIGZpbmRNYXhMaW5lKGNtKSB7XG4gIHZhciBkID0gY20uZGlzcGxheSwgZG9jID0gY20uZG9jO1xuICBkLm1heExpbmUgPSBnZXRMaW5lKGRvYywgZG9jLmZpcnN0KTtcbiAgZC5tYXhMaW5lTGVuZ3RoID0gbGluZUxlbmd0aChkLm1heExpbmUpO1xuICBkLm1heExpbmVDaGFuZ2VkID0gdHJ1ZTtcbiAgZG9jLml0ZXIoZnVuY3Rpb24gKGxpbmUpIHtcbiAgICB2YXIgbGVuID0gbGluZUxlbmd0aChsaW5lKTtcbiAgICBpZiAobGVuID4gZC5tYXhMaW5lTGVuZ3RoKSB7XG4gICAgICBkLm1heExpbmVMZW5ndGggPSBsZW47XG4gICAgICBkLm1heExpbmUgPSBsaW5lO1xuICAgIH1cbiAgfSk7XG59XG5cbi8vIEJJREkgSEVMUEVSU1xuXG5mdW5jdGlvbiBpdGVyYXRlQmlkaVNlY3Rpb25zKG9yZGVyLCBmcm9tLCB0bywgZikge1xuICBpZiAoIW9yZGVyKSB7IHJldHVybiBmKGZyb20sIHRvLCBcImx0clwiLCAwKSB9XG4gIHZhciBmb3VuZCA9IGZhbHNlO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IG9yZGVyLmxlbmd0aDsgKytpKSB7XG4gICAgdmFyIHBhcnQgPSBvcmRlcltpXTtcbiAgICBpZiAocGFydC5mcm9tIDwgdG8gJiYgcGFydC50byA+IGZyb20gfHwgZnJvbSA9PSB0byAmJiBwYXJ0LnRvID09IGZyb20pIHtcbiAgICAgIGYoTWF0aC5tYXgocGFydC5mcm9tLCBmcm9tKSwgTWF0aC5taW4ocGFydC50bywgdG8pLCBwYXJ0LmxldmVsID09IDEgPyBcInJ0bFwiIDogXCJsdHJcIiwgaSk7XG4gICAgICBmb3VuZCA9IHRydWU7XG4gICAgfVxuICB9XG4gIGlmICghZm91bmQpIHsgZihmcm9tLCB0bywgXCJsdHJcIik7IH1cbn1cblxudmFyIGJpZGlPdGhlciA9IG51bGw7XG5mdW5jdGlvbiBnZXRCaWRpUGFydEF0KG9yZGVyLCBjaCwgc3RpY2t5KSB7XG4gIHZhciBmb3VuZDtcbiAgYmlkaU90aGVyID0gbnVsbDtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBvcmRlci5sZW5ndGg7ICsraSkge1xuICAgIHZhciBjdXIgPSBvcmRlcltpXTtcbiAgICBpZiAoY3VyLmZyb20gPCBjaCAmJiBjdXIudG8gPiBjaCkgeyByZXR1cm4gaSB9XG4gICAgaWYgKGN1ci50byA9PSBjaCkge1xuICAgICAgaWYgKGN1ci5mcm9tICE9IGN1ci50byAmJiBzdGlja3kgPT0gXCJiZWZvcmVcIikgeyBmb3VuZCA9IGk7IH1cbiAgICAgIGVsc2UgeyBiaWRpT3RoZXIgPSBpOyB9XG4gICAgfVxuICAgIGlmIChjdXIuZnJvbSA9PSBjaCkge1xuICAgICAgaWYgKGN1ci5mcm9tICE9IGN1ci50byAmJiBzdGlja3kgIT0gXCJiZWZvcmVcIikgeyBmb3VuZCA9IGk7IH1cbiAgICAgIGVsc2UgeyBiaWRpT3RoZXIgPSBpOyB9XG4gICAgfVxuICB9XG4gIHJldHVybiBmb3VuZCAhPSBudWxsID8gZm91bmQgOiBiaWRpT3RoZXJcbn1cblxuLy8gQmlkaXJlY3Rpb25hbCBvcmRlcmluZyBhbGdvcml0aG1cbi8vIFNlZSBodHRwOi8vdW5pY29kZS5vcmcvcmVwb3J0cy90cjkvdHI5LTEzLmh0bWwgZm9yIHRoZSBhbGdvcml0aG1cbi8vIHRoYXQgdGhpcyAocGFydGlhbGx5KSBpbXBsZW1lbnRzLlxuXG4vLyBPbmUtY2hhciBjb2RlcyB1c2VkIGZvciBjaGFyYWN0ZXIgdHlwZXM6XG4vLyBMIChMKTogICBMZWZ0LXRvLVJpZ2h0XG4vLyBSIChSKTogICBSaWdodC10by1MZWZ0XG4vLyByIChBTCk6ICBSaWdodC10by1MZWZ0IEFyYWJpY1xuLy8gMSAoRU4pOiAgRXVyb3BlYW4gTnVtYmVyXG4vLyArIChFUyk6ICBFdXJvcGVhbiBOdW1iZXIgU2VwYXJhdG9yXG4vLyAlIChFVCk6ICBFdXJvcGVhbiBOdW1iZXIgVGVybWluYXRvclxuLy8gbiAoQU4pOiAgQXJhYmljIE51bWJlclxuLy8gLCAoQ1MpOiAgQ29tbW9uIE51bWJlciBTZXBhcmF0b3Jcbi8vIG0gKE5TTSk6IE5vbi1TcGFjaW5nIE1hcmtcbi8vIGIgKEJOKTogIEJvdW5kYXJ5IE5ldXRyYWxcbi8vIHMgKEIpOiAgIFBhcmFncmFwaCBTZXBhcmF0b3Jcbi8vIHQgKFMpOiAgIFNlZ21lbnQgU2VwYXJhdG9yXG4vLyB3IChXUyk6ICBXaGl0ZXNwYWNlXG4vLyBOIChPTik6ICBPdGhlciBOZXV0cmFsc1xuXG4vLyBSZXR1cm5zIG51bGwgaWYgY2hhcmFjdGVycyBhcmUgb3JkZXJlZCBhcyB0aGV5IGFwcGVhclxuLy8gKGxlZnQtdG8tcmlnaHQpLCBvciBhbiBhcnJheSBvZiBzZWN0aW9ucyAoe2Zyb20sIHRvLCBsZXZlbH1cbi8vIG9iamVjdHMpIGluIHRoZSBvcmRlciBpbiB3aGljaCB0aGV5IG9jY3VyIHZpc3VhbGx5LlxudmFyIGJpZGlPcmRlcmluZyA9IChmdW5jdGlvbigpIHtcbiAgLy8gQ2hhcmFjdGVyIHR5cGVzIGZvciBjb2RlcG9pbnRzIDAgdG8gMHhmZlxuICB2YXIgbG93VHlwZXMgPSBcImJiYmJiYmJiYnRzdHdzYmJiYmJiYmJiYmJiYmJzc3N0d05OJSUlTk5OTk5OLE4sTjExMTExMTExMTFOTk5OTk5OTExMTExMTExMTExMTExMTExMTExMTExMTExOTk5OTk5MTExMTExMTExMTExMTExMTExMTExMTExMTE5OTk5iYmJiYmJzYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmIsTiUlJSVOTk5OTE5OTk5OJSUxMU5MTk5OMUxOTk5OTkxMTExMTExMTExMTExMTExMTExMTExMTkxMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExOXCI7XG4gIC8vIENoYXJhY3RlciB0eXBlcyBmb3IgY29kZXBvaW50cyAweDYwMCB0byAweDZmOVxuICB2YXIgYXJhYmljVHlwZXMgPSBcIm5ubm5ubk5OciUlcixyTk5tbW1tbW1tbW1tbXJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycm1tbW1tbW1tbW1tbW1tbW1tbW1tbW5ubm5ubm5ubm4lbm5ycnJtcnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJycnJtbW1tbW1tbk5tbW1tbW1ycm1tTm1tbW1ycjExMTExMTExMTFcIjtcbiAgZnVuY3Rpb24gY2hhclR5cGUoY29kZSkge1xuICAgIGlmIChjb2RlIDw9IDB4ZjcpIHsgcmV0dXJuIGxvd1R5cGVzLmNoYXJBdChjb2RlKSB9XG4gICAgZWxzZSBpZiAoMHg1OTAgPD0gY29kZSAmJiBjb2RlIDw9IDB4NWY0KSB7IHJldHVybiBcIlJcIiB9XG4gICAgZWxzZSBpZiAoMHg2MDAgPD0gY29kZSAmJiBjb2RlIDw9IDB4NmY5KSB7IHJldHVybiBhcmFiaWNUeXBlcy5jaGFyQXQoY29kZSAtIDB4NjAwKSB9XG4gICAgZWxzZSBpZiAoMHg2ZWUgPD0gY29kZSAmJiBjb2RlIDw9IDB4OGFjKSB7IHJldHVybiBcInJcIiB9XG4gICAgZWxzZSBpZiAoMHgyMDAwIDw9IGNvZGUgJiYgY29kZSA8PSAweDIwMGIpIHsgcmV0dXJuIFwid1wiIH1cbiAgICBlbHNlIGlmIChjb2RlID09IDB4MjAwYykgeyByZXR1cm4gXCJiXCIgfVxuICAgIGVsc2UgeyByZXR1cm4gXCJMXCIgfVxuICB9XG5cbiAgdmFyIGJpZGlSRSA9IC9bXFx1MDU5MC1cXHUwNWY0XFx1MDYwMC1cXHUwNmZmXFx1MDcwMC1cXHUwOGFjXS87XG4gIHZhciBpc05ldXRyYWwgPSAvW3N0d05dLywgaXNTdHJvbmcgPSAvW0xScl0vLCBjb3VudHNBc0xlZnQgPSAvW0xiMW5dLywgY291bnRzQXNOdW0gPSAvWzFuXS87XG5cbiAgZnVuY3Rpb24gQmlkaVNwYW4obGV2ZWwsIGZyb20sIHRvKSB7XG4gICAgdGhpcy5sZXZlbCA9IGxldmVsO1xuICAgIHRoaXMuZnJvbSA9IGZyb207IHRoaXMudG8gPSB0bztcbiAgfVxuXG4gIHJldHVybiBmdW5jdGlvbihzdHIsIGRpcmVjdGlvbikge1xuICAgIHZhciBvdXRlclR5cGUgPSBkaXJlY3Rpb24gPT0gXCJsdHJcIiA/IFwiTFwiIDogXCJSXCI7XG5cbiAgICBpZiAoc3RyLmxlbmd0aCA9PSAwIHx8IGRpcmVjdGlvbiA9PSBcImx0clwiICYmICFiaWRpUkUudGVzdChzdHIpKSB7IHJldHVybiBmYWxzZSB9XG4gICAgdmFyIGxlbiA9IHN0ci5sZW5ndGgsIHR5cGVzID0gW107XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW47ICsraSlcbiAgICAgIHsgdHlwZXMucHVzaChjaGFyVHlwZShzdHIuY2hhckNvZGVBdChpKSkpOyB9XG5cbiAgICAvLyBXMS4gRXhhbWluZSBlYWNoIG5vbi1zcGFjaW5nIG1hcmsgKE5TTSkgaW4gdGhlIGxldmVsIHJ1biwgYW5kXG4gICAgLy8gY2hhbmdlIHRoZSB0eXBlIG9mIHRoZSBOU00gdG8gdGhlIHR5cGUgb2YgdGhlIHByZXZpb3VzXG4gICAgLy8gY2hhcmFjdGVyLiBJZiB0aGUgTlNNIGlzIGF0IHRoZSBzdGFydCBvZiB0aGUgbGV2ZWwgcnVuLCBpdCB3aWxsXG4gICAgLy8gZ2V0IHRoZSB0eXBlIG9mIHNvci5cbiAgICBmb3IgKHZhciBpJDEgPSAwLCBwcmV2ID0gb3V0ZXJUeXBlOyBpJDEgPCBsZW47ICsraSQxKSB7XG4gICAgICB2YXIgdHlwZSA9IHR5cGVzW2kkMV07XG4gICAgICBpZiAodHlwZSA9PSBcIm1cIikgeyB0eXBlc1tpJDFdID0gcHJldjsgfVxuICAgICAgZWxzZSB7IHByZXYgPSB0eXBlOyB9XG4gICAgfVxuXG4gICAgLy8gVzIuIFNlYXJjaCBiYWNrd2FyZHMgZnJvbSBlYWNoIGluc3RhbmNlIG9mIGEgRXVyb3BlYW4gbnVtYmVyXG4gICAgLy8gdW50aWwgdGhlIGZpcnN0IHN0cm9uZyB0eXBlIChSLCBMLCBBTCwgb3Igc29yKSBpcyBmb3VuZC4gSWYgYW5cbiAgICAvLyBBTCBpcyBmb3VuZCwgY2hhbmdlIHRoZSB0eXBlIG9mIHRoZSBFdXJvcGVhbiBudW1iZXIgdG8gQXJhYmljXG4gICAgLy8gbnVtYmVyLlxuICAgIC8vIFczLiBDaGFuZ2UgYWxsIEFMcyB0byBSLlxuICAgIGZvciAodmFyIGkkMiA9IDAsIGN1ciA9IG91dGVyVHlwZTsgaSQyIDwgbGVuOyArK2kkMikge1xuICAgICAgdmFyIHR5cGUkMSA9IHR5cGVzW2kkMl07XG4gICAgICBpZiAodHlwZSQxID09IFwiMVwiICYmIGN1ciA9PSBcInJcIikgeyB0eXBlc1tpJDJdID0gXCJuXCI7IH1cbiAgICAgIGVsc2UgaWYgKGlzU3Ryb25nLnRlc3QodHlwZSQxKSkgeyBjdXIgPSB0eXBlJDE7IGlmICh0eXBlJDEgPT0gXCJyXCIpIHsgdHlwZXNbaSQyXSA9IFwiUlwiOyB9IH1cbiAgICB9XG5cbiAgICAvLyBXNC4gQSBzaW5nbGUgRXVyb3BlYW4gc2VwYXJhdG9yIGJldHdlZW4gdHdvIEV1cm9wZWFuIG51bWJlcnNcbiAgICAvLyBjaGFuZ2VzIHRvIGEgRXVyb3BlYW4gbnVtYmVyLiBBIHNpbmdsZSBjb21tb24gc2VwYXJhdG9yIGJldHdlZW5cbiAgICAvLyB0d28gbnVtYmVycyBvZiB0aGUgc2FtZSB0eXBlIGNoYW5nZXMgdG8gdGhhdCB0eXBlLlxuICAgIGZvciAodmFyIGkkMyA9IDEsIHByZXYkMSA9IHR5cGVzWzBdOyBpJDMgPCBsZW4gLSAxOyArK2kkMykge1xuICAgICAgdmFyIHR5cGUkMiA9IHR5cGVzW2kkM107XG4gICAgICBpZiAodHlwZSQyID09IFwiK1wiICYmIHByZXYkMSA9PSBcIjFcIiAmJiB0eXBlc1tpJDMrMV0gPT0gXCIxXCIpIHsgdHlwZXNbaSQzXSA9IFwiMVwiOyB9XG4gICAgICBlbHNlIGlmICh0eXBlJDIgPT0gXCIsXCIgJiYgcHJldiQxID09IHR5cGVzW2kkMysxXSAmJlxuICAgICAgICAgICAgICAgKHByZXYkMSA9PSBcIjFcIiB8fCBwcmV2JDEgPT0gXCJuXCIpKSB7IHR5cGVzW2kkM10gPSBwcmV2JDE7IH1cbiAgICAgIHByZXYkMSA9IHR5cGUkMjtcbiAgICB9XG5cbiAgICAvLyBXNS4gQSBzZXF1ZW5jZSBvZiBFdXJvcGVhbiB0ZXJtaW5hdG9ycyBhZGphY2VudCB0byBFdXJvcGVhblxuICAgIC8vIG51bWJlcnMgY2hhbmdlcyB0byBhbGwgRXVyb3BlYW4gbnVtYmVycy5cbiAgICAvLyBXNi4gT3RoZXJ3aXNlLCBzZXBhcmF0b3JzIGFuZCB0ZXJtaW5hdG9ycyBjaGFuZ2UgdG8gT3RoZXJcbiAgICAvLyBOZXV0cmFsLlxuICAgIGZvciAodmFyIGkkNCA9IDA7IGkkNCA8IGxlbjsgKytpJDQpIHtcbiAgICAgIHZhciB0eXBlJDMgPSB0eXBlc1tpJDRdO1xuICAgICAgaWYgKHR5cGUkMyA9PSBcIixcIikgeyB0eXBlc1tpJDRdID0gXCJOXCI7IH1cbiAgICAgIGVsc2UgaWYgKHR5cGUkMyA9PSBcIiVcIikge1xuICAgICAgICB2YXIgZW5kID0gKHZvaWQgMCk7XG4gICAgICAgIGZvciAoZW5kID0gaSQ0ICsgMTsgZW5kIDwgbGVuICYmIHR5cGVzW2VuZF0gPT0gXCIlXCI7ICsrZW5kKSB7fVxuICAgICAgICB2YXIgcmVwbGFjZSA9IChpJDQgJiYgdHlwZXNbaSQ0LTFdID09IFwiIVwiKSB8fCAoZW5kIDwgbGVuICYmIHR5cGVzW2VuZF0gPT0gXCIxXCIpID8gXCIxXCIgOiBcIk5cIjtcbiAgICAgICAgZm9yICh2YXIgaiA9IGkkNDsgaiA8IGVuZDsgKytqKSB7IHR5cGVzW2pdID0gcmVwbGFjZTsgfVxuICAgICAgICBpJDQgPSBlbmQgLSAxO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIFc3LiBTZWFyY2ggYmFja3dhcmRzIGZyb20gZWFjaCBpbnN0YW5jZSBvZiBhIEV1cm9wZWFuIG51bWJlclxuICAgIC8vIHVudGlsIHRoZSBmaXJzdCBzdHJvbmcgdHlwZSAoUiwgTCwgb3Igc29yKSBpcyBmb3VuZC4gSWYgYW4gTCBpc1xuICAgIC8vIGZvdW5kLCB0aGVuIGNoYW5nZSB0aGUgdHlwZSBvZiB0aGUgRXVyb3BlYW4gbnVtYmVyIHRvIEwuXG4gICAgZm9yICh2YXIgaSQ1ID0gMCwgY3VyJDEgPSBvdXRlclR5cGU7IGkkNSA8IGxlbjsgKytpJDUpIHtcbiAgICAgIHZhciB0eXBlJDQgPSB0eXBlc1tpJDVdO1xuICAgICAgaWYgKGN1ciQxID09IFwiTFwiICYmIHR5cGUkNCA9PSBcIjFcIikgeyB0eXBlc1tpJDVdID0gXCJMXCI7IH1cbiAgICAgIGVsc2UgaWYgKGlzU3Ryb25nLnRlc3QodHlwZSQ0KSkgeyBjdXIkMSA9IHR5cGUkNDsgfVxuICAgIH1cblxuICAgIC8vIE4xLiBBIHNlcXVlbmNlIG9mIG5ldXRyYWxzIHRha2VzIHRoZSBkaXJlY3Rpb24gb2YgdGhlXG4gICAgLy8gc3Vycm91bmRpbmcgc3Ryb25nIHRleHQgaWYgdGhlIHRleHQgb24gYm90aCBzaWRlcyBoYXMgdGhlIHNhbWVcbiAgICAvLyBkaXJlY3Rpb24uIEV1cm9wZWFuIGFuZCBBcmFiaWMgbnVtYmVycyBhY3QgYXMgaWYgdGhleSB3ZXJlIFIgaW5cbiAgICAvLyB0ZXJtcyBvZiB0aGVpciBpbmZsdWVuY2Ugb24gbmV1dHJhbHMuIFN0YXJ0LW9mLWxldmVsLXJ1biAoc29yKVxuICAgIC8vIGFuZCBlbmQtb2YtbGV2ZWwtcnVuIChlb3IpIGFyZSB1c2VkIGF0IGxldmVsIHJ1biBib3VuZGFyaWVzLlxuICAgIC8vIE4yLiBBbnkgcmVtYWluaW5nIG5ldXRyYWxzIHRha2UgdGhlIGVtYmVkZGluZyBkaXJlY3Rpb24uXG4gICAgZm9yICh2YXIgaSQ2ID0gMDsgaSQ2IDwgbGVuOyArK2kkNikge1xuICAgICAgaWYgKGlzTmV1dHJhbC50ZXN0KHR5cGVzW2kkNl0pKSB7XG4gICAgICAgIHZhciBlbmQkMSA9ICh2b2lkIDApO1xuICAgICAgICBmb3IgKGVuZCQxID0gaSQ2ICsgMTsgZW5kJDEgPCBsZW4gJiYgaXNOZXV0cmFsLnRlc3QodHlwZXNbZW5kJDFdKTsgKytlbmQkMSkge31cbiAgICAgICAgdmFyIGJlZm9yZSA9IChpJDYgPyB0eXBlc1tpJDYtMV0gOiBvdXRlclR5cGUpID09IFwiTFwiO1xuICAgICAgICB2YXIgYWZ0ZXIgPSAoZW5kJDEgPCBsZW4gPyB0eXBlc1tlbmQkMV0gOiBvdXRlclR5cGUpID09IFwiTFwiO1xuICAgICAgICB2YXIgcmVwbGFjZSQxID0gYmVmb3JlID09IGFmdGVyID8gKGJlZm9yZSA/IFwiTFwiIDogXCJSXCIpIDogb3V0ZXJUeXBlO1xuICAgICAgICBmb3IgKHZhciBqJDEgPSBpJDY7IGokMSA8IGVuZCQxOyArK2okMSkgeyB0eXBlc1tqJDFdID0gcmVwbGFjZSQxOyB9XG4gICAgICAgIGkkNiA9IGVuZCQxIC0gMTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBIZXJlIHdlIGRlcGFydCBmcm9tIHRoZSBkb2N1bWVudGVkIGFsZ29yaXRobSwgaW4gb3JkZXIgdG8gYXZvaWRcbiAgICAvLyBidWlsZGluZyB1cCBhbiBhY3R1YWwgbGV2ZWxzIGFycmF5LiBTaW5jZSB0aGVyZSBhcmUgb25seSB0aHJlZVxuICAgIC8vIGxldmVscyAoMCwgMSwgMikgaW4gYW4gaW1wbGVtZW50YXRpb24gdGhhdCBkb2Vzbid0IHRha2VcbiAgICAvLyBleHBsaWNpdCBlbWJlZGRpbmcgaW50byBhY2NvdW50LCB3ZSBjYW4gYnVpbGQgdXAgdGhlIG9yZGVyIG9uXG4gICAgLy8gdGhlIGZseSwgd2l0aG91dCBmb2xsb3dpbmcgdGhlIGxldmVsLWJhc2VkIGFsZ29yaXRobS5cbiAgICB2YXIgb3JkZXIgPSBbXSwgbTtcbiAgICBmb3IgKHZhciBpJDcgPSAwOyBpJDcgPCBsZW47KSB7XG4gICAgICBpZiAoY291bnRzQXNMZWZ0LnRlc3QodHlwZXNbaSQ3XSkpIHtcbiAgICAgICAgdmFyIHN0YXJ0ID0gaSQ3O1xuICAgICAgICBmb3IgKCsraSQ3OyBpJDcgPCBsZW4gJiYgY291bnRzQXNMZWZ0LnRlc3QodHlwZXNbaSQ3XSk7ICsraSQ3KSB7fVxuICAgICAgICBvcmRlci5wdXNoKG5ldyBCaWRpU3BhbigwLCBzdGFydCwgaSQ3KSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB2YXIgcG9zID0gaSQ3LCBhdCA9IG9yZGVyLmxlbmd0aDtcbiAgICAgICAgZm9yICgrK2kkNzsgaSQ3IDwgbGVuICYmIHR5cGVzW2kkN10gIT0gXCJMXCI7ICsraSQ3KSB7fVxuICAgICAgICBmb3IgKHZhciBqJDIgPSBwb3M7IGokMiA8IGkkNzspIHtcbiAgICAgICAgICBpZiAoY291bnRzQXNOdW0udGVzdCh0eXBlc1tqJDJdKSkge1xuICAgICAgICAgICAgaWYgKHBvcyA8IGokMikgeyBvcmRlci5zcGxpY2UoYXQsIDAsIG5ldyBCaWRpU3BhbigxLCBwb3MsIGokMikpOyB9XG4gICAgICAgICAgICB2YXIgbnN0YXJ0ID0gaiQyO1xuICAgICAgICAgICAgZm9yICgrK2okMjsgaiQyIDwgaSQ3ICYmIGNvdW50c0FzTnVtLnRlc3QodHlwZXNbaiQyXSk7ICsraiQyKSB7fVxuICAgICAgICAgICAgb3JkZXIuc3BsaWNlKGF0LCAwLCBuZXcgQmlkaVNwYW4oMiwgbnN0YXJ0LCBqJDIpKTtcbiAgICAgICAgICAgIHBvcyA9IGokMjtcbiAgICAgICAgICB9IGVsc2UgeyArK2okMjsgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChwb3MgPCBpJDcpIHsgb3JkZXIuc3BsaWNlKGF0LCAwLCBuZXcgQmlkaVNwYW4oMSwgcG9zLCBpJDcpKTsgfVxuICAgICAgfVxuICAgIH1cbiAgICBpZiAoZGlyZWN0aW9uID09IFwibHRyXCIpIHtcbiAgICAgIGlmIChvcmRlclswXS5sZXZlbCA9PSAxICYmIChtID0gc3RyLm1hdGNoKC9eXFxzKy8pKSkge1xuICAgICAgICBvcmRlclswXS5mcm9tID0gbVswXS5sZW5ndGg7XG4gICAgICAgIG9yZGVyLnVuc2hpZnQobmV3IEJpZGlTcGFuKDAsIDAsIG1bMF0ubGVuZ3RoKSk7XG4gICAgICB9XG4gICAgICBpZiAobHN0KG9yZGVyKS5sZXZlbCA9PSAxICYmIChtID0gc3RyLm1hdGNoKC9cXHMrJC8pKSkge1xuICAgICAgICBsc3Qob3JkZXIpLnRvIC09IG1bMF0ubGVuZ3RoO1xuICAgICAgICBvcmRlci5wdXNoKG5ldyBCaWRpU3BhbigwLCBsZW4gLSBtWzBdLmxlbmd0aCwgbGVuKSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGRpcmVjdGlvbiA9PSBcInJ0bFwiID8gb3JkZXIucmV2ZXJzZSgpIDogb3JkZXJcbiAgfVxufSkoKTtcblxuLy8gR2V0IHRoZSBiaWRpIG9yZGVyaW5nIGZvciB0aGUgZ2l2ZW4gbGluZSAoYW5kIGNhY2hlIGl0KS4gUmV0dXJuc1xuLy8gZmFsc2UgZm9yIGxpbmVzIHRoYXQgYXJlIGZ1bGx5IGxlZnQtdG8tcmlnaHQsIGFuZCBhbiBhcnJheSBvZlxuLy8gQmlkaVNwYW4gb2JqZWN0cyBvdGhlcndpc2UuXG5mdW5jdGlvbiBnZXRPcmRlcihsaW5lLCBkaXJlY3Rpb24pIHtcbiAgdmFyIG9yZGVyID0gbGluZS5vcmRlcjtcbiAgaWYgKG9yZGVyID09IG51bGwpIHsgb3JkZXIgPSBsaW5lLm9yZGVyID0gYmlkaU9yZGVyaW5nKGxpbmUudGV4dCwgZGlyZWN0aW9uKTsgfVxuICByZXR1cm4gb3JkZXJcbn1cblxuLy8gRVZFTlQgSEFORExJTkdcblxuLy8gTGlnaHR3ZWlnaHQgZXZlbnQgZnJhbWV3b3JrLiBvbi9vZmYgYWxzbyB3b3JrIG9uIERPTSBub2Rlcyxcbi8vIHJlZ2lzdGVyaW5nIG5hdGl2ZSBET00gaGFuZGxlcnMuXG5cbnZhciBub0hhbmRsZXJzID0gW107XG5cbnZhciBvbiA9IGZ1bmN0aW9uKGVtaXR0ZXIsIHR5cGUsIGYpIHtcbiAgaWYgKGVtaXR0ZXIuYWRkRXZlbnRMaXN0ZW5lcikge1xuICAgIGVtaXR0ZXIuYWRkRXZlbnRMaXN0ZW5lcih0eXBlLCBmLCBmYWxzZSk7XG4gIH0gZWxzZSBpZiAoZW1pdHRlci5hdHRhY2hFdmVudCkge1xuICAgIGVtaXR0ZXIuYXR0YWNoRXZlbnQoXCJvblwiICsgdHlwZSwgZik7XG4gIH0gZWxzZSB7XG4gICAgdmFyIG1hcCQkMSA9IGVtaXR0ZXIuX2hhbmRsZXJzIHx8IChlbWl0dGVyLl9oYW5kbGVycyA9IHt9KTtcbiAgICBtYXAkJDFbdHlwZV0gPSAobWFwJCQxW3R5cGVdIHx8IG5vSGFuZGxlcnMpLmNvbmNhdChmKTtcbiAgfVxufTtcblxuZnVuY3Rpb24gZ2V0SGFuZGxlcnMoZW1pdHRlciwgdHlwZSkge1xuICByZXR1cm4gZW1pdHRlci5faGFuZGxlcnMgJiYgZW1pdHRlci5faGFuZGxlcnNbdHlwZV0gfHwgbm9IYW5kbGVyc1xufVxuXG5mdW5jdGlvbiBvZmYoZW1pdHRlciwgdHlwZSwgZikge1xuICBpZiAoZW1pdHRlci5yZW1vdmVFdmVudExpc3RlbmVyKSB7XG4gICAgZW1pdHRlci5yZW1vdmVFdmVudExpc3RlbmVyKHR5cGUsIGYsIGZhbHNlKTtcbiAgfSBlbHNlIGlmIChlbWl0dGVyLmRldGFjaEV2ZW50KSB7XG4gICAgZW1pdHRlci5kZXRhY2hFdmVudChcIm9uXCIgKyB0eXBlLCBmKTtcbiAgfSBlbHNlIHtcbiAgICB2YXIgbWFwJCQxID0gZW1pdHRlci5faGFuZGxlcnMsIGFyciA9IG1hcCQkMSAmJiBtYXAkJDFbdHlwZV07XG4gICAgaWYgKGFycikge1xuICAgICAgdmFyIGluZGV4ID0gaW5kZXhPZihhcnIsIGYpO1xuICAgICAgaWYgKGluZGV4ID4gLTEpXG4gICAgICAgIHsgbWFwJCQxW3R5cGVdID0gYXJyLnNsaWNlKDAsIGluZGV4KS5jb25jYXQoYXJyLnNsaWNlKGluZGV4ICsgMSkpOyB9XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIHNpZ25hbChlbWl0dGVyLCB0eXBlIC8qLCB2YWx1ZXMuLi4qLykge1xuICB2YXIgaGFuZGxlcnMgPSBnZXRIYW5kbGVycyhlbWl0dGVyLCB0eXBlKTtcbiAgaWYgKCFoYW5kbGVycy5sZW5ndGgpIHsgcmV0dXJuIH1cbiAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDIpO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGhhbmRsZXJzLmxlbmd0aDsgKytpKSB7IGhhbmRsZXJzW2ldLmFwcGx5KG51bGwsIGFyZ3MpOyB9XG59XG5cbi8vIFRoZSBET00gZXZlbnRzIHRoYXQgQ29kZU1pcnJvciBoYW5kbGVzIGNhbiBiZSBvdmVycmlkZGVuIGJ5XG4vLyByZWdpc3RlcmluZyBhIChub24tRE9NKSBoYW5kbGVyIG9uIHRoZSBlZGl0b3IgZm9yIHRoZSBldmVudCBuYW1lLFxuLy8gYW5kIHByZXZlbnREZWZhdWx0LWluZyB0aGUgZXZlbnQgaW4gdGhhdCBoYW5kbGVyLlxuZnVuY3Rpb24gc2lnbmFsRE9NRXZlbnQoY20sIGUsIG92ZXJyaWRlKSB7XG4gIGlmICh0eXBlb2YgZSA9PSBcInN0cmluZ1wiKVxuICAgIHsgZSA9IHt0eXBlOiBlLCBwcmV2ZW50RGVmYXVsdDogZnVuY3Rpb24oKSB7IHRoaXMuZGVmYXVsdFByZXZlbnRlZCA9IHRydWU7IH19OyB9XG4gIHNpZ25hbChjbSwgb3ZlcnJpZGUgfHwgZS50eXBlLCBjbSwgZSk7XG4gIHJldHVybiBlX2RlZmF1bHRQcmV2ZW50ZWQoZSkgfHwgZS5jb2RlbWlycm9ySWdub3JlXG59XG5cbmZ1bmN0aW9uIHNpZ25hbEN1cnNvckFjdGl2aXR5KGNtKSB7XG4gIHZhciBhcnIgPSBjbS5faGFuZGxlcnMgJiYgY20uX2hhbmRsZXJzLmN1cnNvckFjdGl2aXR5O1xuICBpZiAoIWFycikgeyByZXR1cm4gfVxuICB2YXIgc2V0ID0gY20uY3VyT3AuY3Vyc29yQWN0aXZpdHlIYW5kbGVycyB8fCAoY20uY3VyT3AuY3Vyc29yQWN0aXZpdHlIYW5kbGVycyA9IFtdKTtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcnIubGVuZ3RoOyArK2kpIHsgaWYgKGluZGV4T2Yoc2V0LCBhcnJbaV0pID09IC0xKVxuICAgIHsgc2V0LnB1c2goYXJyW2ldKTsgfSB9XG59XG5cbmZ1bmN0aW9uIGhhc0hhbmRsZXIoZW1pdHRlciwgdHlwZSkge1xuICByZXR1cm4gZ2V0SGFuZGxlcnMoZW1pdHRlciwgdHlwZSkubGVuZ3RoID4gMFxufVxuXG4vLyBBZGQgb24gYW5kIG9mZiBtZXRob2RzIHRvIGEgY29uc3RydWN0b3IncyBwcm90b3R5cGUsIHRvIG1ha2Vcbi8vIHJlZ2lzdGVyaW5nIGV2ZW50cyBvbiBzdWNoIG9iamVjdHMgbW9yZSBjb252ZW5pZW50LlxuZnVuY3Rpb24gZXZlbnRNaXhpbihjdG9yKSB7XG4gIGN0b3IucHJvdG90eXBlLm9uID0gZnVuY3Rpb24odHlwZSwgZikge29uKHRoaXMsIHR5cGUsIGYpO307XG4gIGN0b3IucHJvdG90eXBlLm9mZiA9IGZ1bmN0aW9uKHR5cGUsIGYpIHtvZmYodGhpcywgdHlwZSwgZik7fTtcbn1cblxuLy8gRHVlIHRvIHRoZSBmYWN0IHRoYXQgd2Ugc3RpbGwgc3VwcG9ydCBqdXJhc3NpYyBJRSB2ZXJzaW9ucywgc29tZVxuLy8gY29tcGF0aWJpbGl0eSB3cmFwcGVycyBhcmUgbmVlZGVkLlxuXG5mdW5jdGlvbiBlX3ByZXZlbnREZWZhdWx0KGUpIHtcbiAgaWYgKGUucHJldmVudERlZmF1bHQpIHsgZS5wcmV2ZW50RGVmYXVsdCgpOyB9XG4gIGVsc2UgeyBlLnJldHVyblZhbHVlID0gZmFsc2U7IH1cbn1cbmZ1bmN0aW9uIGVfc3RvcFByb3BhZ2F0aW9uKGUpIHtcbiAgaWYgKGUuc3RvcFByb3BhZ2F0aW9uKSB7IGUuc3RvcFByb3BhZ2F0aW9uKCk7IH1cbiAgZWxzZSB7IGUuY2FuY2VsQnViYmxlID0gdHJ1ZTsgfVxufVxuZnVuY3Rpb24gZV9kZWZhdWx0UHJldmVudGVkKGUpIHtcbiAgcmV0dXJuIGUuZGVmYXVsdFByZXZlbnRlZCAhPSBudWxsID8gZS5kZWZhdWx0UHJldmVudGVkIDogZS5yZXR1cm5WYWx1ZSA9PSBmYWxzZVxufVxuZnVuY3Rpb24gZV9zdG9wKGUpIHtlX3ByZXZlbnREZWZhdWx0KGUpOyBlX3N0b3BQcm9wYWdhdGlvbihlKTt9XG5cbmZ1bmN0aW9uIGVfdGFyZ2V0KGUpIHtyZXR1cm4gZS50YXJnZXQgfHwgZS5zcmNFbGVtZW50fVxuZnVuY3Rpb24gZV9idXR0b24oZSkge1xuICB2YXIgYiA9IGUud2hpY2g7XG4gIGlmIChiID09IG51bGwpIHtcbiAgICBpZiAoZS5idXR0b24gJiAxKSB7IGIgPSAxOyB9XG4gICAgZWxzZSBpZiAoZS5idXR0b24gJiAyKSB7IGIgPSAzOyB9XG4gICAgZWxzZSBpZiAoZS5idXR0b24gJiA0KSB7IGIgPSAyOyB9XG4gIH1cbiAgaWYgKG1hYyAmJiBlLmN0cmxLZXkgJiYgYiA9PSAxKSB7IGIgPSAzOyB9XG4gIHJldHVybiBiXG59XG5cbi8vIERldGVjdCBkcmFnLWFuZC1kcm9wXG52YXIgZHJhZ0FuZERyb3AgPSBmdW5jdGlvbigpIHtcbiAgLy8gVGhlcmUgaXMgKnNvbWUqIGtpbmQgb2YgZHJhZy1hbmQtZHJvcCBzdXBwb3J0IGluIElFNi04LCBidXQgSVxuICAvLyBjb3VsZG4ndCBnZXQgaXQgdG8gd29yayB5ZXQuXG4gIGlmIChpZSAmJiBpZV92ZXJzaW9uIDwgOSkgeyByZXR1cm4gZmFsc2UgfVxuICB2YXIgZGl2ID0gZWx0KCdkaXYnKTtcbiAgcmV0dXJuIFwiZHJhZ2dhYmxlXCIgaW4gZGl2IHx8IFwiZHJhZ0Ryb3BcIiBpbiBkaXZcbn0oKTtcblxudmFyIHp3c3BTdXBwb3J0ZWQ7XG5mdW5jdGlvbiB6ZXJvV2lkdGhFbGVtZW50KG1lYXN1cmUpIHtcbiAgaWYgKHp3c3BTdXBwb3J0ZWQgPT0gbnVsbCkge1xuICAgIHZhciB0ZXN0ID0gZWx0KFwic3BhblwiLCBcIlxcdTIwMGJcIik7XG4gICAgcmVtb3ZlQ2hpbGRyZW5BbmRBZGQobWVhc3VyZSwgZWx0KFwic3BhblwiLCBbdGVzdCwgZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoXCJ4XCIpXSkpO1xuICAgIGlmIChtZWFzdXJlLmZpcnN0Q2hpbGQub2Zmc2V0SGVpZ2h0ICE9IDApXG4gICAgICB7IHp3c3BTdXBwb3J0ZWQgPSB0ZXN0Lm9mZnNldFdpZHRoIDw9IDEgJiYgdGVzdC5vZmZzZXRIZWlnaHQgPiAyICYmICEoaWUgJiYgaWVfdmVyc2lvbiA8IDgpOyB9XG4gIH1cbiAgdmFyIG5vZGUgPSB6d3NwU3VwcG9ydGVkID8gZWx0KFwic3BhblwiLCBcIlxcdTIwMGJcIikgOlxuICAgIGVsdChcInNwYW5cIiwgXCJcXHUwMGEwXCIsIG51bGwsIFwiZGlzcGxheTogaW5saW5lLWJsb2NrOyB3aWR0aDogMXB4OyBtYXJnaW4tcmlnaHQ6IC0xcHhcIik7XG4gIG5vZGUuc2V0QXR0cmlidXRlKFwiY20tdGV4dFwiLCBcIlwiKTtcbiAgcmV0dXJuIG5vZGVcbn1cblxuLy8gRmVhdHVyZS1kZXRlY3QgSUUncyBjcnVtbXkgY2xpZW50IHJlY3QgcmVwb3J0aW5nIGZvciBiaWRpIHRleHRcbnZhciBiYWRCaWRpUmVjdHM7XG5mdW5jdGlvbiBoYXNCYWRCaWRpUmVjdHMobWVhc3VyZSkge1xuICBpZiAoYmFkQmlkaVJlY3RzICE9IG51bGwpIHsgcmV0dXJuIGJhZEJpZGlSZWN0cyB9XG4gIHZhciB0eHQgPSByZW1vdmVDaGlsZHJlbkFuZEFkZChtZWFzdXJlLCBkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShcIkFcXHUwNjJlQVwiKSk7XG4gIHZhciByMCA9IHJhbmdlKHR4dCwgMCwgMSkuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gIHZhciByMSA9IHJhbmdlKHR4dCwgMSwgMikuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gIHJlbW92ZUNoaWxkcmVuKG1lYXN1cmUpO1xuICBpZiAoIXIwIHx8IHIwLmxlZnQgPT0gcjAucmlnaHQpIHsgcmV0dXJuIGZhbHNlIH0gLy8gU2FmYXJpIHJldHVybnMgbnVsbCBpbiBzb21lIGNhc2VzICgjMjc4MClcbiAgcmV0dXJuIGJhZEJpZGlSZWN0cyA9IChyMS5yaWdodCAtIHIwLnJpZ2h0IDwgMylcbn1cblxuLy8gU2VlIGlmIFwiXCIuc3BsaXQgaXMgdGhlIGJyb2tlbiBJRSB2ZXJzaW9uLCBpZiBzbywgcHJvdmlkZSBhblxuLy8gYWx0ZXJuYXRpdmUgd2F5IHRvIHNwbGl0IGxpbmVzLlxudmFyIHNwbGl0TGluZXNBdXRvID0gXCJcXG5cXG5iXCIuc3BsaXQoL1xcbi8pLmxlbmd0aCAhPSAzID8gZnVuY3Rpb24gKHN0cmluZykge1xuICB2YXIgcG9zID0gMCwgcmVzdWx0ID0gW10sIGwgPSBzdHJpbmcubGVuZ3RoO1xuICB3aGlsZSAocG9zIDw9IGwpIHtcbiAgICB2YXIgbmwgPSBzdHJpbmcuaW5kZXhPZihcIlxcblwiLCBwb3MpO1xuICAgIGlmIChubCA9PSAtMSkgeyBubCA9IHN0cmluZy5sZW5ndGg7IH1cbiAgICB2YXIgbGluZSA9IHN0cmluZy5zbGljZShwb3MsIHN0cmluZy5jaGFyQXQobmwgLSAxKSA9PSBcIlxcclwiID8gbmwgLSAxIDogbmwpO1xuICAgIHZhciBydCA9IGxpbmUuaW5kZXhPZihcIlxcclwiKTtcbiAgICBpZiAocnQgIT0gLTEpIHtcbiAgICAgIHJlc3VsdC5wdXNoKGxpbmUuc2xpY2UoMCwgcnQpKTtcbiAgICAgIHBvcyArPSBydCArIDE7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJlc3VsdC5wdXNoKGxpbmUpO1xuICAgICAgcG9zID0gbmwgKyAxO1xuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzdWx0XG59IDogZnVuY3Rpb24gKHN0cmluZykgeyByZXR1cm4gc3RyaW5nLnNwbGl0KC9cXHJcXG4/fFxcbi8pOyB9O1xuXG52YXIgaGFzU2VsZWN0aW9uID0gd2luZG93LmdldFNlbGVjdGlvbiA/IGZ1bmN0aW9uICh0ZSkge1xuICB0cnkgeyByZXR1cm4gdGUuc2VsZWN0aW9uU3RhcnQgIT0gdGUuc2VsZWN0aW9uRW5kIH1cbiAgY2F0Y2goZSkgeyByZXR1cm4gZmFsc2UgfVxufSA6IGZ1bmN0aW9uICh0ZSkge1xuICB2YXIgcmFuZ2UkJDE7XG4gIHRyeSB7cmFuZ2UkJDEgPSB0ZS5vd25lckRvY3VtZW50LnNlbGVjdGlvbi5jcmVhdGVSYW5nZSgpO31cbiAgY2F0Y2goZSkge31cbiAgaWYgKCFyYW5nZSQkMSB8fCByYW5nZSQkMS5wYXJlbnRFbGVtZW50KCkgIT0gdGUpIHsgcmV0dXJuIGZhbHNlIH1cbiAgcmV0dXJuIHJhbmdlJCQxLmNvbXBhcmVFbmRQb2ludHMoXCJTdGFydFRvRW5kXCIsIHJhbmdlJCQxKSAhPSAwXG59O1xuXG52YXIgaGFzQ29weUV2ZW50ID0gKGZ1bmN0aW9uICgpIHtcbiAgdmFyIGUgPSBlbHQoXCJkaXZcIik7XG4gIGlmIChcIm9uY29weVwiIGluIGUpIHsgcmV0dXJuIHRydWUgfVxuICBlLnNldEF0dHJpYnV0ZShcIm9uY29weVwiLCBcInJldHVybjtcIik7XG4gIHJldHVybiB0eXBlb2YgZS5vbmNvcHkgPT0gXCJmdW5jdGlvblwiXG59KSgpO1xuXG52YXIgYmFkWm9vbWVkUmVjdHMgPSBudWxsO1xuZnVuY3Rpb24gaGFzQmFkWm9vbWVkUmVjdHMobWVhc3VyZSkge1xuICBpZiAoYmFkWm9vbWVkUmVjdHMgIT0gbnVsbCkgeyByZXR1cm4gYmFkWm9vbWVkUmVjdHMgfVxuICB2YXIgbm9kZSA9IHJlbW92ZUNoaWxkcmVuQW5kQWRkKG1lYXN1cmUsIGVsdChcInNwYW5cIiwgXCJ4XCIpKTtcbiAgdmFyIG5vcm1hbCA9IG5vZGUuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gIHZhciBmcm9tUmFuZ2UgPSByYW5nZShub2RlLCAwLCAxKS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgcmV0dXJuIGJhZFpvb21lZFJlY3RzID0gTWF0aC5hYnMobm9ybWFsLmxlZnQgLSBmcm9tUmFuZ2UubGVmdCkgPiAxXG59XG5cbi8vIEtub3duIG1vZGVzLCBieSBuYW1lIGFuZCBieSBNSU1FXG52YXIgbW9kZXMgPSB7fTtcbnZhciBtaW1lTW9kZXMgPSB7fTtcblxuLy8gRXh0cmEgYXJndW1lbnRzIGFyZSBzdG9yZWQgYXMgdGhlIG1vZGUncyBkZXBlbmRlbmNpZXMsIHdoaWNoIGlzXG4vLyB1c2VkIGJ5IChsZWdhY3kpIG1lY2hhbmlzbXMgbGlrZSBsb2FkbW9kZS5qcyB0byBhdXRvbWF0aWNhbGx5XG4vLyBsb2FkIGEgbW9kZS4gKFByZWZlcnJlZCBtZWNoYW5pc20gaXMgdGhlIHJlcXVpcmUvZGVmaW5lIGNhbGxzLilcbmZ1bmN0aW9uIGRlZmluZU1vZGUobmFtZSwgbW9kZSkge1xuICBpZiAoYXJndW1lbnRzLmxlbmd0aCA+IDIpXG4gICAgeyBtb2RlLmRlcGVuZGVuY2llcyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMik7IH1cbiAgbW9kZXNbbmFtZV0gPSBtb2RlO1xufVxuXG5mdW5jdGlvbiBkZWZpbmVNSU1FKG1pbWUsIHNwZWMpIHtcbiAgbWltZU1vZGVzW21pbWVdID0gc3BlYztcbn1cblxuLy8gR2l2ZW4gYSBNSU1FIHR5cGUsIGEge25hbWUsIC4uLm9wdGlvbnN9IGNvbmZpZyBvYmplY3QsIG9yIGEgbmFtZVxuLy8gc3RyaW5nLCByZXR1cm4gYSBtb2RlIGNvbmZpZyBvYmplY3QuXG5mdW5jdGlvbiByZXNvbHZlTW9kZShzcGVjKSB7XG4gIGlmICh0eXBlb2Ygc3BlYyA9PSBcInN0cmluZ1wiICYmIG1pbWVNb2Rlcy5oYXNPd25Qcm9wZXJ0eShzcGVjKSkge1xuICAgIHNwZWMgPSBtaW1lTW9kZXNbc3BlY107XG4gIH0gZWxzZSBpZiAoc3BlYyAmJiB0eXBlb2Ygc3BlYy5uYW1lID09IFwic3RyaW5nXCIgJiYgbWltZU1vZGVzLmhhc093blByb3BlcnR5KHNwZWMubmFtZSkpIHtcbiAgICB2YXIgZm91bmQgPSBtaW1lTW9kZXNbc3BlYy5uYW1lXTtcbiAgICBpZiAodHlwZW9mIGZvdW5kID09IFwic3RyaW5nXCIpIHsgZm91bmQgPSB7bmFtZTogZm91bmR9OyB9XG4gICAgc3BlYyA9IGNyZWF0ZU9iaihmb3VuZCwgc3BlYyk7XG4gICAgc3BlYy5uYW1lID0gZm91bmQubmFtZTtcbiAgfSBlbHNlIGlmICh0eXBlb2Ygc3BlYyA9PSBcInN0cmluZ1wiICYmIC9eW1xcd1xcLV0rXFwvW1xcd1xcLV0rXFwreG1sJC8udGVzdChzcGVjKSkge1xuICAgIHJldHVybiByZXNvbHZlTW9kZShcImFwcGxpY2F0aW9uL3htbFwiKVxuICB9IGVsc2UgaWYgKHR5cGVvZiBzcGVjID09IFwic3RyaW5nXCIgJiYgL15bXFx3XFwtXStcXC9bXFx3XFwtXStcXCtqc29uJC8udGVzdChzcGVjKSkge1xuICAgIHJldHVybiByZXNvbHZlTW9kZShcImFwcGxpY2F0aW9uL2pzb25cIilcbiAgfVxuICBpZiAodHlwZW9mIHNwZWMgPT0gXCJzdHJpbmdcIikgeyByZXR1cm4ge25hbWU6IHNwZWN9IH1cbiAgZWxzZSB7IHJldHVybiBzcGVjIHx8IHtuYW1lOiBcIm51bGxcIn0gfVxufVxuXG4vLyBHaXZlbiBhIG1vZGUgc3BlYyAoYW55dGhpbmcgdGhhdCByZXNvbHZlTW9kZSBhY2NlcHRzKSwgZmluZCBhbmRcbi8vIGluaXRpYWxpemUgYW4gYWN0dWFsIG1vZGUgb2JqZWN0LlxuZnVuY3Rpb24gZ2V0TW9kZShvcHRpb25zLCBzcGVjKSB7XG4gIHNwZWMgPSByZXNvbHZlTW9kZShzcGVjKTtcbiAgdmFyIG1mYWN0b3J5ID0gbW9kZXNbc3BlYy5uYW1lXTtcbiAgaWYgKCFtZmFjdG9yeSkgeyByZXR1cm4gZ2V0TW9kZShvcHRpb25zLCBcInRleHQvcGxhaW5cIikgfVxuICB2YXIgbW9kZU9iaiA9IG1mYWN0b3J5KG9wdGlvbnMsIHNwZWMpO1xuICBpZiAobW9kZUV4dGVuc2lvbnMuaGFzT3duUHJvcGVydHkoc3BlYy5uYW1lKSkge1xuICAgIHZhciBleHRzID0gbW9kZUV4dGVuc2lvbnNbc3BlYy5uYW1lXTtcbiAgICBmb3IgKHZhciBwcm9wIGluIGV4dHMpIHtcbiAgICAgIGlmICghZXh0cy5oYXNPd25Qcm9wZXJ0eShwcm9wKSkgeyBjb250aW51ZSB9XG4gICAgICBpZiAobW9kZU9iai5oYXNPd25Qcm9wZXJ0eShwcm9wKSkgeyBtb2RlT2JqW1wiX1wiICsgcHJvcF0gPSBtb2RlT2JqW3Byb3BdOyB9XG4gICAgICBtb2RlT2JqW3Byb3BdID0gZXh0c1twcm9wXTtcbiAgICB9XG4gIH1cbiAgbW9kZU9iai5uYW1lID0gc3BlYy5uYW1lO1xuICBpZiAoc3BlYy5oZWxwZXJUeXBlKSB7IG1vZGVPYmouaGVscGVyVHlwZSA9IHNwZWMuaGVscGVyVHlwZTsgfVxuICBpZiAoc3BlYy5tb2RlUHJvcHMpIHsgZm9yICh2YXIgcHJvcCQxIGluIHNwZWMubW9kZVByb3BzKVxuICAgIHsgbW9kZU9ialtwcm9wJDFdID0gc3BlYy5tb2RlUHJvcHNbcHJvcCQxXTsgfSB9XG5cbiAgcmV0dXJuIG1vZGVPYmpcbn1cblxuLy8gVGhpcyBjYW4gYmUgdXNlZCB0byBhdHRhY2ggcHJvcGVydGllcyB0byBtb2RlIG9iamVjdHMgZnJvbVxuLy8gb3V0c2lkZSB0aGUgYWN0dWFsIG1vZGUgZGVmaW5pdGlvbi5cbnZhciBtb2RlRXh0ZW5zaW9ucyA9IHt9O1xuZnVuY3Rpb24gZXh0ZW5kTW9kZShtb2RlLCBwcm9wZXJ0aWVzKSB7XG4gIHZhciBleHRzID0gbW9kZUV4dGVuc2lvbnMuaGFzT3duUHJvcGVydHkobW9kZSkgPyBtb2RlRXh0ZW5zaW9uc1ttb2RlXSA6IChtb2RlRXh0ZW5zaW9uc1ttb2RlXSA9IHt9KTtcbiAgY29weU9iaihwcm9wZXJ0aWVzLCBleHRzKTtcbn1cblxuZnVuY3Rpb24gY29weVN0YXRlKG1vZGUsIHN0YXRlKSB7XG4gIGlmIChzdGF0ZSA9PT0gdHJ1ZSkgeyByZXR1cm4gc3RhdGUgfVxuICBpZiAobW9kZS5jb3B5U3RhdGUpIHsgcmV0dXJuIG1vZGUuY29weVN0YXRlKHN0YXRlKSB9XG4gIHZhciBuc3RhdGUgPSB7fTtcbiAgZm9yICh2YXIgbiBpbiBzdGF0ZSkge1xuICAgIHZhciB2YWwgPSBzdGF0ZVtuXTtcbiAgICBpZiAodmFsIGluc3RhbmNlb2YgQXJyYXkpIHsgdmFsID0gdmFsLmNvbmNhdChbXSk7IH1cbiAgICBuc3RhdGVbbl0gPSB2YWw7XG4gIH1cbiAgcmV0dXJuIG5zdGF0ZVxufVxuXG4vLyBHaXZlbiBhIG1vZGUgYW5kIGEgc3RhdGUgKGZvciB0aGF0IG1vZGUpLCBmaW5kIHRoZSBpbm5lciBtb2RlIGFuZFxuLy8gc3RhdGUgYXQgdGhlIHBvc2l0aW9uIHRoYXQgdGhlIHN0YXRlIHJlZmVycyB0by5cbmZ1bmN0aW9uIGlubmVyTW9kZShtb2RlLCBzdGF0ZSkge1xuICB2YXIgaW5mbztcbiAgd2hpbGUgKG1vZGUuaW5uZXJNb2RlKSB7XG4gICAgaW5mbyA9IG1vZGUuaW5uZXJNb2RlKHN0YXRlKTtcbiAgICBpZiAoIWluZm8gfHwgaW5mby5tb2RlID09IG1vZGUpIHsgYnJlYWsgfVxuICAgIHN0YXRlID0gaW5mby5zdGF0ZTtcbiAgICBtb2RlID0gaW5mby5tb2RlO1xuICB9XG4gIHJldHVybiBpbmZvIHx8IHttb2RlOiBtb2RlLCBzdGF0ZTogc3RhdGV9XG59XG5cbmZ1bmN0aW9uIHN0YXJ0U3RhdGUobW9kZSwgYTEsIGEyKSB7XG4gIHJldHVybiBtb2RlLnN0YXJ0U3RhdGUgPyBtb2RlLnN0YXJ0U3RhdGUoYTEsIGEyKSA6IHRydWVcbn1cblxuLy8gU1RSSU5HIFNUUkVBTVxuXG4vLyBGZWQgdG8gdGhlIG1vZGUgcGFyc2VycywgcHJvdmlkZXMgaGVscGVyIGZ1bmN0aW9ucyB0byBtYWtlXG4vLyBwYXJzZXJzIG1vcmUgc3VjY2luY3QuXG5cbnZhciBTdHJpbmdTdHJlYW0gPSBmdW5jdGlvbihzdHJpbmcsIHRhYlNpemUsIGxpbmVPcmFjbGUpIHtcbiAgdGhpcy5wb3MgPSB0aGlzLnN0YXJ0ID0gMDtcbiAgdGhpcy5zdHJpbmcgPSBzdHJpbmc7XG4gIHRoaXMudGFiU2l6ZSA9IHRhYlNpemUgfHwgODtcbiAgdGhpcy5sYXN0Q29sdW1uUG9zID0gdGhpcy5sYXN0Q29sdW1uVmFsdWUgPSAwO1xuICB0aGlzLmxpbmVTdGFydCA9IDA7XG4gIHRoaXMubGluZU9yYWNsZSA9IGxpbmVPcmFjbGU7XG59O1xuXG5TdHJpbmdTdHJlYW0ucHJvdG90eXBlLmVvbCA9IGZ1bmN0aW9uICgpIHtyZXR1cm4gdGhpcy5wb3MgPj0gdGhpcy5zdHJpbmcubGVuZ3RofTtcblN0cmluZ1N0cmVhbS5wcm90b3R5cGUuc29sID0gZnVuY3Rpb24gKCkge3JldHVybiB0aGlzLnBvcyA9PSB0aGlzLmxpbmVTdGFydH07XG5TdHJpbmdTdHJlYW0ucHJvdG90eXBlLnBlZWsgPSBmdW5jdGlvbiAoKSB7cmV0dXJuIHRoaXMuc3RyaW5nLmNoYXJBdCh0aGlzLnBvcykgfHwgdW5kZWZpbmVkfTtcblN0cmluZ1N0cmVhbS5wcm90b3R5cGUubmV4dCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMucG9zIDwgdGhpcy5zdHJpbmcubGVuZ3RoKVxuICAgIHsgcmV0dXJuIHRoaXMuc3RyaW5nLmNoYXJBdCh0aGlzLnBvcysrKSB9XG59O1xuU3RyaW5nU3RyZWFtLnByb3RvdHlwZS5lYXQgPSBmdW5jdGlvbiAobWF0Y2gpIHtcbiAgdmFyIGNoID0gdGhpcy5zdHJpbmcuY2hhckF0KHRoaXMucG9zKTtcbiAgdmFyIG9rO1xuICBpZiAodHlwZW9mIG1hdGNoID09IFwic3RyaW5nXCIpIHsgb2sgPSBjaCA9PSBtYXRjaDsgfVxuICBlbHNlIHsgb2sgPSBjaCAmJiAobWF0Y2gudGVzdCA/IG1hdGNoLnRlc3QoY2gpIDogbWF0Y2goY2gpKTsgfVxuICBpZiAob2spIHsrK3RoaXMucG9zOyByZXR1cm4gY2h9XG59O1xuU3RyaW5nU3RyZWFtLnByb3RvdHlwZS5lYXRXaGlsZSA9IGZ1bmN0aW9uIChtYXRjaCkge1xuICB2YXIgc3RhcnQgPSB0aGlzLnBvcztcbiAgd2hpbGUgKHRoaXMuZWF0KG1hdGNoKSl7fVxuICByZXR1cm4gdGhpcy5wb3MgPiBzdGFydFxufTtcblN0cmluZ1N0cmVhbS5wcm90b3R5cGUuZWF0U3BhY2UgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHRoaXMkMSA9IHRoaXM7XG5cbiAgdmFyIHN0YXJ0ID0gdGhpcy5wb3M7XG4gIHdoaWxlICgvW1xcc1xcdTAwYTBdLy50ZXN0KHRoaXMuc3RyaW5nLmNoYXJBdCh0aGlzLnBvcykpKSB7ICsrdGhpcyQxLnBvczsgfVxuICByZXR1cm4gdGhpcy5wb3MgPiBzdGFydFxufTtcblN0cmluZ1N0cmVhbS5wcm90b3R5cGUuc2tpcFRvRW5kID0gZnVuY3Rpb24gKCkge3RoaXMucG9zID0gdGhpcy5zdHJpbmcubGVuZ3RoO307XG5TdHJpbmdTdHJlYW0ucHJvdG90eXBlLnNraXBUbyA9IGZ1bmN0aW9uIChjaCkge1xuICB2YXIgZm91bmQgPSB0aGlzLnN0cmluZy5pbmRleE9mKGNoLCB0aGlzLnBvcyk7XG4gIGlmIChmb3VuZCA+IC0xKSB7dGhpcy5wb3MgPSBmb3VuZDsgcmV0dXJuIHRydWV9XG59O1xuU3RyaW5nU3RyZWFtLnByb3RvdHlwZS5iYWNrVXAgPSBmdW5jdGlvbiAobikge3RoaXMucG9zIC09IG47fTtcblN0cmluZ1N0cmVhbS5wcm90b3R5cGUuY29sdW1uID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5sYXN0Q29sdW1uUG9zIDwgdGhpcy5zdGFydCkge1xuICAgIHRoaXMubGFzdENvbHVtblZhbHVlID0gY291bnRDb2x1bW4odGhpcy5zdHJpbmcsIHRoaXMuc3RhcnQsIHRoaXMudGFiU2l6ZSwgdGhpcy5sYXN0Q29sdW1uUG9zLCB0aGlzLmxhc3RDb2x1bW5WYWx1ZSk7XG4gICAgdGhpcy5sYXN0Q29sdW1uUG9zID0gdGhpcy5zdGFydDtcbiAgfVxuICByZXR1cm4gdGhpcy5sYXN0Q29sdW1uVmFsdWUgLSAodGhpcy5saW5lU3RhcnQgPyBjb3VudENvbHVtbih0aGlzLnN0cmluZywgdGhpcy5saW5lU3RhcnQsIHRoaXMudGFiU2l6ZSkgOiAwKVxufTtcblN0cmluZ1N0cmVhbS5wcm90b3R5cGUuaW5kZW50YXRpb24gPSBmdW5jdGlvbiAoKSB7XG4gIHJldHVybiBjb3VudENvbHVtbih0aGlzLnN0cmluZywgbnVsbCwgdGhpcy50YWJTaXplKSAtXG4gICAgKHRoaXMubGluZVN0YXJ0ID8gY291bnRDb2x1bW4odGhpcy5zdHJpbmcsIHRoaXMubGluZVN0YXJ0LCB0aGlzLnRhYlNpemUpIDogMClcbn07XG5TdHJpbmdTdHJlYW0ucHJvdG90eXBlLm1hdGNoID0gZnVuY3Rpb24gKHBhdHRlcm4sIGNvbnN1bWUsIGNhc2VJbnNlbnNpdGl2ZSkge1xuICBpZiAodHlwZW9mIHBhdHRlcm4gPT0gXCJzdHJpbmdcIikge1xuICAgIHZhciBjYXNlZCA9IGZ1bmN0aW9uIChzdHIpIHsgcmV0dXJuIGNhc2VJbnNlbnNpdGl2ZSA/IHN0ci50b0xvd2VyQ2FzZSgpIDogc3RyOyB9O1xuICAgIHZhciBzdWJzdHIgPSB0aGlzLnN0cmluZy5zdWJzdHIodGhpcy5wb3MsIHBhdHRlcm4ubGVuZ3RoKTtcbiAgICBpZiAoY2FzZWQoc3Vic3RyKSA9PSBjYXNlZChwYXR0ZXJuKSkge1xuICAgICAgaWYgKGNvbnN1bWUgIT09IGZhbHNlKSB7IHRoaXMucG9zICs9IHBhdHRlcm4ubGVuZ3RoOyB9XG4gICAgICByZXR1cm4gdHJ1ZVxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICB2YXIgbWF0Y2ggPSB0aGlzLnN0cmluZy5zbGljZSh0aGlzLnBvcykubWF0Y2gocGF0dGVybik7XG4gICAgaWYgKG1hdGNoICYmIG1hdGNoLmluZGV4ID4gMCkgeyByZXR1cm4gbnVsbCB9XG4gICAgaWYgKG1hdGNoICYmIGNvbnN1bWUgIT09IGZhbHNlKSB7IHRoaXMucG9zICs9IG1hdGNoWzBdLmxlbmd0aDsgfVxuICAgIHJldHVybiBtYXRjaFxuICB9XG59O1xuU3RyaW5nU3RyZWFtLnByb3RvdHlwZS5jdXJyZW50ID0gZnVuY3Rpb24gKCl7cmV0dXJuIHRoaXMuc3RyaW5nLnNsaWNlKHRoaXMuc3RhcnQsIHRoaXMucG9zKX07XG5TdHJpbmdTdHJlYW0ucHJvdG90eXBlLmhpZGVGaXJzdENoYXJzID0gZnVuY3Rpb24gKG4sIGlubmVyKSB7XG4gIHRoaXMubGluZVN0YXJ0ICs9IG47XG4gIHRyeSB7IHJldHVybiBpbm5lcigpIH1cbiAgZmluYWxseSB7IHRoaXMubGluZVN0YXJ0IC09IG47IH1cbn07XG5TdHJpbmdTdHJlYW0ucHJvdG90eXBlLmxvb2tBaGVhZCA9IGZ1bmN0aW9uIChuKSB7XG4gIHZhciBvcmFjbGUgPSB0aGlzLmxpbmVPcmFjbGU7XG4gIHJldHVybiBvcmFjbGUgJiYgb3JhY2xlLmxvb2tBaGVhZChuKVxufTtcblN0cmluZ1N0cmVhbS5wcm90b3R5cGUuYmFzZVRva2VuID0gZnVuY3Rpb24gKCkge1xuICB2YXIgb3JhY2xlID0gdGhpcy5saW5lT3JhY2xlO1xuICByZXR1cm4gb3JhY2xlICYmIG9yYWNsZS5iYXNlVG9rZW4odGhpcy5wb3MpXG59O1xuXG52YXIgU2F2ZWRDb250ZXh0ID0gZnVuY3Rpb24oc3RhdGUsIGxvb2tBaGVhZCkge1xuICB0aGlzLnN0YXRlID0gc3RhdGU7XG4gIHRoaXMubG9va0FoZWFkID0gbG9va0FoZWFkO1xufTtcblxudmFyIENvbnRleHQgPSBmdW5jdGlvbihkb2MsIHN0YXRlLCBsaW5lLCBsb29rQWhlYWQpIHtcbiAgdGhpcy5zdGF0ZSA9IHN0YXRlO1xuICB0aGlzLmRvYyA9IGRvYztcbiAgdGhpcy5saW5lID0gbGluZTtcbiAgdGhpcy5tYXhMb29rQWhlYWQgPSBsb29rQWhlYWQgfHwgMDtcbiAgdGhpcy5iYXNlVG9rZW5zID0gbnVsbDtcbiAgdGhpcy5iYXNlVG9rZW5Qb3MgPSAxO1xufTtcblxuQ29udGV4dC5wcm90b3R5cGUubG9va0FoZWFkID0gZnVuY3Rpb24gKG4pIHtcbiAgdmFyIGxpbmUgPSB0aGlzLmRvYy5nZXRMaW5lKHRoaXMubGluZSArIG4pO1xuICBpZiAobGluZSAhPSBudWxsICYmIG4gPiB0aGlzLm1heExvb2tBaGVhZCkgeyB0aGlzLm1heExvb2tBaGVhZCA9IG47IH1cbiAgcmV0dXJuIGxpbmVcbn07XG5cbkNvbnRleHQucHJvdG90eXBlLmJhc2VUb2tlbiA9IGZ1bmN0aW9uIChuKSB7XG4gICAgdmFyIHRoaXMkMSA9IHRoaXM7XG5cbiAgaWYgKCF0aGlzLmJhc2VUb2tlbnMpIHsgcmV0dXJuIG51bGwgfVxuICB3aGlsZSAodGhpcy5iYXNlVG9rZW5zW3RoaXMuYmFzZVRva2VuUG9zXSA8PSBuKVxuICAgIHsgdGhpcyQxLmJhc2VUb2tlblBvcyArPSAyOyB9XG4gIHZhciB0eXBlID0gdGhpcy5iYXNlVG9rZW5zW3RoaXMuYmFzZVRva2VuUG9zICsgMV07XG4gIHJldHVybiB7dHlwZTogdHlwZSAmJiB0eXBlLnJlcGxhY2UoLyggfF4pb3ZlcmxheSAuKi8sIFwiXCIpLFxuICAgICAgICAgIHNpemU6IHRoaXMuYmFzZVRva2Vuc1t0aGlzLmJhc2VUb2tlblBvc10gLSBufVxufTtcblxuQ29udGV4dC5wcm90b3R5cGUubmV4dExpbmUgPSBmdW5jdGlvbiAoKSB7XG4gIHRoaXMubGluZSsrO1xuICBpZiAodGhpcy5tYXhMb29rQWhlYWQgPiAwKSB7IHRoaXMubWF4TG9va0FoZWFkLS07IH1cbn07XG5cbkNvbnRleHQuZnJvbVNhdmVkID0gZnVuY3Rpb24gKGRvYywgc2F2ZWQsIGxpbmUpIHtcbiAgaWYgKHNhdmVkIGluc3RhbmNlb2YgU2F2ZWRDb250ZXh0KVxuICAgIHsgcmV0dXJuIG5ldyBDb250ZXh0KGRvYywgY29weVN0YXRlKGRvYy5tb2RlLCBzYXZlZC5zdGF0ZSksIGxpbmUsIHNhdmVkLmxvb2tBaGVhZCkgfVxuICBlbHNlXG4gICAgeyByZXR1cm4gbmV3IENvbnRleHQoZG9jLCBjb3B5U3RhdGUoZG9jLm1vZGUsIHNhdmVkKSwgbGluZSkgfVxufTtcblxuQ29udGV4dC5wcm90b3R5cGUuc2F2ZSA9IGZ1bmN0aW9uIChjb3B5KSB7XG4gIHZhciBzdGF0ZSA9IGNvcHkgIT09IGZhbHNlID8gY29weVN0YXRlKHRoaXMuZG9jLm1vZGUsIHRoaXMuc3RhdGUpIDogdGhpcy5zdGF0ZTtcbiAgcmV0dXJuIHRoaXMubWF4TG9va0FoZWFkID4gMCA/IG5ldyBTYXZlZENvbnRleHQoc3RhdGUsIHRoaXMubWF4TG9va0FoZWFkKSA6IHN0YXRlXG59O1xuXG5cbi8vIENvbXB1dGUgYSBzdHlsZSBhcnJheSAoYW4gYXJyYXkgc3RhcnRpbmcgd2l0aCBhIG1vZGUgZ2VuZXJhdGlvblxuLy8gLS0gZm9yIGludmFsaWRhdGlvbiAtLSBmb2xsb3dlZCBieSBwYWlycyBvZiBlbmQgcG9zaXRpb25zIGFuZFxuLy8gc3R5bGUgc3RyaW5ncyksIHdoaWNoIGlzIHVzZWQgdG8gaGlnaGxpZ2h0IHRoZSB0b2tlbnMgb24gdGhlXG4vLyBsaW5lLlxuZnVuY3Rpb24gaGlnaGxpZ2h0TGluZShjbSwgbGluZSwgY29udGV4dCwgZm9yY2VUb0VuZCkge1xuICAvLyBBIHN0eWxlcyBhcnJheSBhbHdheXMgc3RhcnRzIHdpdGggYSBudW1iZXIgaWRlbnRpZnlpbmcgdGhlXG4gIC8vIG1vZGUvb3ZlcmxheXMgdGhhdCBpdCBpcyBiYXNlZCBvbiAoZm9yIGVhc3kgaW52YWxpZGF0aW9uKS5cbiAgdmFyIHN0ID0gW2NtLnN0YXRlLm1vZGVHZW5dLCBsaW5lQ2xhc3NlcyA9IHt9O1xuICAvLyBDb21wdXRlIHRoZSBiYXNlIGFycmF5IG9mIHN0eWxlc1xuICBydW5Nb2RlKGNtLCBsaW5lLnRleHQsIGNtLmRvYy5tb2RlLCBjb250ZXh0LCBmdW5jdGlvbiAoZW5kLCBzdHlsZSkgeyByZXR1cm4gc3QucHVzaChlbmQsIHN0eWxlKTsgfSxcbiAgICAgICAgICBsaW5lQ2xhc3NlcywgZm9yY2VUb0VuZCk7XG4gIHZhciBzdGF0ZSA9IGNvbnRleHQuc3RhdGU7XG5cbiAgLy8gUnVuIG92ZXJsYXlzLCBhZGp1c3Qgc3R5bGUgYXJyYXkuXG4gIHZhciBsb29wID0gZnVuY3Rpb24gKCBvICkge1xuICAgIGNvbnRleHQuYmFzZVRva2VucyA9IHN0O1xuICAgIHZhciBvdmVybGF5ID0gY20uc3RhdGUub3ZlcmxheXNbb10sIGkgPSAxLCBhdCA9IDA7XG4gICAgY29udGV4dC5zdGF0ZSA9IHRydWU7XG4gICAgcnVuTW9kZShjbSwgbGluZS50ZXh0LCBvdmVybGF5Lm1vZGUsIGNvbnRleHQsIGZ1bmN0aW9uIChlbmQsIHN0eWxlKSB7XG4gICAgICB2YXIgc3RhcnQgPSBpO1xuICAgICAgLy8gRW5zdXJlIHRoZXJlJ3MgYSB0b2tlbiBlbmQgYXQgdGhlIGN1cnJlbnQgcG9zaXRpb24sIGFuZCB0aGF0IGkgcG9pbnRzIGF0IGl0XG4gICAgICB3aGlsZSAoYXQgPCBlbmQpIHtcbiAgICAgICAgdmFyIGlfZW5kID0gc3RbaV07XG4gICAgICAgIGlmIChpX2VuZCA+IGVuZClcbiAgICAgICAgICB7IHN0LnNwbGljZShpLCAxLCBlbmQsIHN0W2krMV0sIGlfZW5kKTsgfVxuICAgICAgICBpICs9IDI7XG4gICAgICAgIGF0ID0gTWF0aC5taW4oZW5kLCBpX2VuZCk7XG4gICAgICB9XG4gICAgICBpZiAoIXN0eWxlKSB7IHJldHVybiB9XG4gICAgICBpZiAob3ZlcmxheS5vcGFxdWUpIHtcbiAgICAgICAgc3Quc3BsaWNlKHN0YXJ0LCBpIC0gc3RhcnQsIGVuZCwgXCJvdmVybGF5IFwiICsgc3R5bGUpO1xuICAgICAgICBpID0gc3RhcnQgKyAyO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZm9yICg7IHN0YXJ0IDwgaTsgc3RhcnQgKz0gMikge1xuICAgICAgICAgIHZhciBjdXIgPSBzdFtzdGFydCsxXTtcbiAgICAgICAgICBzdFtzdGFydCsxXSA9IChjdXIgPyBjdXIgKyBcIiBcIiA6IFwiXCIpICsgXCJvdmVybGF5IFwiICsgc3R5bGU7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LCBsaW5lQ2xhc3Nlcyk7XG4gICAgY29udGV4dC5zdGF0ZSA9IHN0YXRlO1xuICAgIGNvbnRleHQuYmFzZVRva2VucyA9IG51bGw7XG4gICAgY29udGV4dC5iYXNlVG9rZW5Qb3MgPSAxO1xuICB9O1xuXG4gIGZvciAodmFyIG8gPSAwOyBvIDwgY20uc3RhdGUub3ZlcmxheXMubGVuZ3RoOyArK28pIGxvb3AoIG8gKTtcblxuICByZXR1cm4ge3N0eWxlczogc3QsIGNsYXNzZXM6IGxpbmVDbGFzc2VzLmJnQ2xhc3MgfHwgbGluZUNsYXNzZXMudGV4dENsYXNzID8gbGluZUNsYXNzZXMgOiBudWxsfVxufVxuXG5mdW5jdGlvbiBnZXRMaW5lU3R5bGVzKGNtLCBsaW5lLCB1cGRhdGVGcm9udGllcikge1xuICBpZiAoIWxpbmUuc3R5bGVzIHx8IGxpbmUuc3R5bGVzWzBdICE9IGNtLnN0YXRlLm1vZGVHZW4pIHtcbiAgICB2YXIgY29udGV4dCA9IGdldENvbnRleHRCZWZvcmUoY20sIGxpbmVObyhsaW5lKSk7XG4gICAgdmFyIHJlc2V0U3RhdGUgPSBsaW5lLnRleHQubGVuZ3RoID4gY20ub3B0aW9ucy5tYXhIaWdobGlnaHRMZW5ndGggJiYgY29weVN0YXRlKGNtLmRvYy5tb2RlLCBjb250ZXh0LnN0YXRlKTtcbiAgICB2YXIgcmVzdWx0ID0gaGlnaGxpZ2h0TGluZShjbSwgbGluZSwgY29udGV4dCk7XG4gICAgaWYgKHJlc2V0U3RhdGUpIHsgY29udGV4dC5zdGF0ZSA9IHJlc2V0U3RhdGU7IH1cbiAgICBsaW5lLnN0YXRlQWZ0ZXIgPSBjb250ZXh0LnNhdmUoIXJlc2V0U3RhdGUpO1xuICAgIGxpbmUuc3R5bGVzID0gcmVzdWx0LnN0eWxlcztcbiAgICBpZiAocmVzdWx0LmNsYXNzZXMpIHsgbGluZS5zdHlsZUNsYXNzZXMgPSByZXN1bHQuY2xhc3NlczsgfVxuICAgIGVsc2UgaWYgKGxpbmUuc3R5bGVDbGFzc2VzKSB7IGxpbmUuc3R5bGVDbGFzc2VzID0gbnVsbDsgfVxuICAgIGlmICh1cGRhdGVGcm9udGllciA9PT0gY20uZG9jLmhpZ2hsaWdodEZyb250aWVyKVxuICAgICAgeyBjbS5kb2MubW9kZUZyb250aWVyID0gTWF0aC5tYXgoY20uZG9jLm1vZGVGcm9udGllciwgKytjbS5kb2MuaGlnaGxpZ2h0RnJvbnRpZXIpOyB9XG4gIH1cbiAgcmV0dXJuIGxpbmUuc3R5bGVzXG59XG5cbmZ1bmN0aW9uIGdldENvbnRleHRCZWZvcmUoY20sIG4sIHByZWNpc2UpIHtcbiAgdmFyIGRvYyA9IGNtLmRvYywgZGlzcGxheSA9IGNtLmRpc3BsYXk7XG4gIGlmICghZG9jLm1vZGUuc3RhcnRTdGF0ZSkgeyByZXR1cm4gbmV3IENvbnRleHQoZG9jLCB0cnVlLCBuKSB9XG4gIHZhciBzdGFydCA9IGZpbmRTdGFydExpbmUoY20sIG4sIHByZWNpc2UpO1xuICB2YXIgc2F2ZWQgPSBzdGFydCA+IGRvYy5maXJzdCAmJiBnZXRMaW5lKGRvYywgc3RhcnQgLSAxKS5zdGF0ZUFmdGVyO1xuICB2YXIgY29udGV4dCA9IHNhdmVkID8gQ29udGV4dC5mcm9tU2F2ZWQoZG9jLCBzYXZlZCwgc3RhcnQpIDogbmV3IENvbnRleHQoZG9jLCBzdGFydFN0YXRlKGRvYy5tb2RlKSwgc3RhcnQpO1xuXG4gIGRvYy5pdGVyKHN0YXJ0LCBuLCBmdW5jdGlvbiAobGluZSkge1xuICAgIHByb2Nlc3NMaW5lKGNtLCBsaW5lLnRleHQsIGNvbnRleHQpO1xuICAgIHZhciBwb3MgPSBjb250ZXh0LmxpbmU7XG4gICAgbGluZS5zdGF0ZUFmdGVyID0gcG9zID09IG4gLSAxIHx8IHBvcyAlIDUgPT0gMCB8fCBwb3MgPj0gZGlzcGxheS52aWV3RnJvbSAmJiBwb3MgPCBkaXNwbGF5LnZpZXdUbyA/IGNvbnRleHQuc2F2ZSgpIDogbnVsbDtcbiAgICBjb250ZXh0Lm5leHRMaW5lKCk7XG4gIH0pO1xuICBpZiAocHJlY2lzZSkgeyBkb2MubW9kZUZyb250aWVyID0gY29udGV4dC5saW5lOyB9XG4gIHJldHVybiBjb250ZXh0XG59XG5cbi8vIExpZ2h0d2VpZ2h0IGZvcm0gb2YgaGlnaGxpZ2h0IC0tIHByb2NlZWQgb3ZlciB0aGlzIGxpbmUgYW5kXG4vLyB1cGRhdGUgc3RhdGUsIGJ1dCBkb24ndCBzYXZlIGEgc3R5bGUgYXJyYXkuIFVzZWQgZm9yIGxpbmVzIHRoYXRcbi8vIGFyZW4ndCBjdXJyZW50bHkgdmlzaWJsZS5cbmZ1bmN0aW9uIHByb2Nlc3NMaW5lKGNtLCB0ZXh0LCBjb250ZXh0LCBzdGFydEF0KSB7XG4gIHZhciBtb2RlID0gY20uZG9jLm1vZGU7XG4gIHZhciBzdHJlYW0gPSBuZXcgU3RyaW5nU3RyZWFtKHRleHQsIGNtLm9wdGlvbnMudGFiU2l6ZSwgY29udGV4dCk7XG4gIHN0cmVhbS5zdGFydCA9IHN0cmVhbS5wb3MgPSBzdGFydEF0IHx8IDA7XG4gIGlmICh0ZXh0ID09IFwiXCIpIHsgY2FsbEJsYW5rTGluZShtb2RlLCBjb250ZXh0LnN0YXRlKTsgfVxuICB3aGlsZSAoIXN0cmVhbS5lb2woKSkge1xuICAgIHJlYWRUb2tlbihtb2RlLCBzdHJlYW0sIGNvbnRleHQuc3RhdGUpO1xuICAgIHN0cmVhbS5zdGFydCA9IHN0cmVhbS5wb3M7XG4gIH1cbn1cblxuZnVuY3Rpb24gY2FsbEJsYW5rTGluZShtb2RlLCBzdGF0ZSkge1xuICBpZiAobW9kZS5ibGFua0xpbmUpIHsgcmV0dXJuIG1vZGUuYmxhbmtMaW5lKHN0YXRlKSB9XG4gIGlmICghbW9kZS5pbm5lck1vZGUpIHsgcmV0dXJuIH1cbiAgdmFyIGlubmVyID0gaW5uZXJNb2RlKG1vZGUsIHN0YXRlKTtcbiAgaWYgKGlubmVyLm1vZGUuYmxhbmtMaW5lKSB7IHJldHVybiBpbm5lci5tb2RlLmJsYW5rTGluZShpbm5lci5zdGF0ZSkgfVxufVxuXG5mdW5jdGlvbiByZWFkVG9rZW4obW9kZSwgc3RyZWFtLCBzdGF0ZSwgaW5uZXIpIHtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCAxMDsgaSsrKSB7XG4gICAgaWYgKGlubmVyKSB7IGlubmVyWzBdID0gaW5uZXJNb2RlKG1vZGUsIHN0YXRlKS5tb2RlOyB9XG4gICAgdmFyIHN0eWxlID0gbW9kZS50b2tlbihzdHJlYW0sIHN0YXRlKTtcbiAgICBpZiAoc3RyZWFtLnBvcyA+IHN0cmVhbS5zdGFydCkgeyByZXR1cm4gc3R5bGUgfVxuICB9XG4gIHRocm93IG5ldyBFcnJvcihcIk1vZGUgXCIgKyBtb2RlLm5hbWUgKyBcIiBmYWlsZWQgdG8gYWR2YW5jZSBzdHJlYW0uXCIpXG59XG5cbnZhciBUb2tlbiA9IGZ1bmN0aW9uKHN0cmVhbSwgdHlwZSwgc3RhdGUpIHtcbiAgdGhpcy5zdGFydCA9IHN0cmVhbS5zdGFydDsgdGhpcy5lbmQgPSBzdHJlYW0ucG9zO1xuICB0aGlzLnN0cmluZyA9IHN0cmVhbS5jdXJyZW50KCk7XG4gIHRoaXMudHlwZSA9IHR5cGUgfHwgbnVsbDtcbiAgdGhpcy5zdGF0ZSA9IHN0YXRlO1xufTtcblxuLy8gVXRpbGl0eSBmb3IgZ2V0VG9rZW5BdCBhbmQgZ2V0TGluZVRva2Vuc1xuZnVuY3Rpb24gdGFrZVRva2VuKGNtLCBwb3MsIHByZWNpc2UsIGFzQXJyYXkpIHtcbiAgdmFyIGRvYyA9IGNtLmRvYywgbW9kZSA9IGRvYy5tb2RlLCBzdHlsZTtcbiAgcG9zID0gY2xpcFBvcyhkb2MsIHBvcyk7XG4gIHZhciBsaW5lID0gZ2V0TGluZShkb2MsIHBvcy5saW5lKSwgY29udGV4dCA9IGdldENvbnRleHRCZWZvcmUoY20sIHBvcy5saW5lLCBwcmVjaXNlKTtcbiAgdmFyIHN0cmVhbSA9IG5ldyBTdHJpbmdTdHJlYW0obGluZS50ZXh0LCBjbS5vcHRpb25zLnRhYlNpemUsIGNvbnRleHQpLCB0b2tlbnM7XG4gIGlmIChhc0FycmF5KSB7IHRva2VucyA9IFtdOyB9XG4gIHdoaWxlICgoYXNBcnJheSB8fCBzdHJlYW0ucG9zIDwgcG9zLmNoKSAmJiAhc3RyZWFtLmVvbCgpKSB7XG4gICAgc3RyZWFtLnN0YXJ0ID0gc3RyZWFtLnBvcztcbiAgICBzdHlsZSA9IHJlYWRUb2tlbihtb2RlLCBzdHJlYW0sIGNvbnRleHQuc3RhdGUpO1xuICAgIGlmIChhc0FycmF5KSB7IHRva2Vucy5wdXNoKG5ldyBUb2tlbihzdHJlYW0sIHN0eWxlLCBjb3B5U3RhdGUoZG9jLm1vZGUsIGNvbnRleHQuc3RhdGUpKSk7IH1cbiAgfVxuICByZXR1cm4gYXNBcnJheSA/IHRva2VucyA6IG5ldyBUb2tlbihzdHJlYW0sIHN0eWxlLCBjb250ZXh0LnN0YXRlKVxufVxuXG5mdW5jdGlvbiBleHRyYWN0TGluZUNsYXNzZXModHlwZSwgb3V0cHV0KSB7XG4gIGlmICh0eXBlKSB7IGZvciAoOzspIHtcbiAgICB2YXIgbGluZUNsYXNzID0gdHlwZS5tYXRjaCgvKD86XnxcXHMrKWxpbmUtKGJhY2tncm91bmQtKT8oXFxTKykvKTtcbiAgICBpZiAoIWxpbmVDbGFzcykgeyBicmVhayB9XG4gICAgdHlwZSA9IHR5cGUuc2xpY2UoMCwgbGluZUNsYXNzLmluZGV4KSArIHR5cGUuc2xpY2UobGluZUNsYXNzLmluZGV4ICsgbGluZUNsYXNzWzBdLmxlbmd0aCk7XG4gICAgdmFyIHByb3AgPSBsaW5lQ2xhc3NbMV0gPyBcImJnQ2xhc3NcIiA6IFwidGV4dENsYXNzXCI7XG4gICAgaWYgKG91dHB1dFtwcm9wXSA9PSBudWxsKVxuICAgICAgeyBvdXRwdXRbcHJvcF0gPSBsaW5lQ2xhc3NbMl07IH1cbiAgICBlbHNlIGlmICghKG5ldyBSZWdFeHAoXCIoPzpefFxccylcIiArIGxpbmVDbGFzc1syXSArIFwiKD86JHxcXHMpXCIpKS50ZXN0KG91dHB1dFtwcm9wXSkpXG4gICAgICB7IG91dHB1dFtwcm9wXSArPSBcIiBcIiArIGxpbmVDbGFzc1syXTsgfVxuICB9IH1cbiAgcmV0dXJuIHR5cGVcbn1cblxuLy8gUnVuIHRoZSBnaXZlbiBtb2RlJ3MgcGFyc2VyIG92ZXIgYSBsaW5lLCBjYWxsaW5nIGYgZm9yIGVhY2ggdG9rZW4uXG5mdW5jdGlvbiBydW5Nb2RlKGNtLCB0ZXh0LCBtb2RlLCBjb250ZXh0LCBmLCBsaW5lQ2xhc3NlcywgZm9yY2VUb0VuZCkge1xuICB2YXIgZmxhdHRlblNwYW5zID0gbW9kZS5mbGF0dGVuU3BhbnM7XG4gIGlmIChmbGF0dGVuU3BhbnMgPT0gbnVsbCkgeyBmbGF0dGVuU3BhbnMgPSBjbS5vcHRpb25zLmZsYXR0ZW5TcGFuczsgfVxuICB2YXIgY3VyU3RhcnQgPSAwLCBjdXJTdHlsZSA9IG51bGw7XG4gIHZhciBzdHJlYW0gPSBuZXcgU3RyaW5nU3RyZWFtKHRleHQsIGNtLm9wdGlvbnMudGFiU2l6ZSwgY29udGV4dCksIHN0eWxlO1xuICB2YXIgaW5uZXIgPSBjbS5vcHRpb25zLmFkZE1vZGVDbGFzcyAmJiBbbnVsbF07XG4gIGlmICh0ZXh0ID09IFwiXCIpIHsgZXh0cmFjdExpbmVDbGFzc2VzKGNhbGxCbGFua0xpbmUobW9kZSwgY29udGV4dC5zdGF0ZSksIGxpbmVDbGFzc2VzKTsgfVxuICB3aGlsZSAoIXN0cmVhbS5lb2woKSkge1xuICAgIGlmIChzdHJlYW0ucG9zID4gY20ub3B0aW9ucy5tYXhIaWdobGlnaHRMZW5ndGgpIHtcbiAgICAgIGZsYXR0ZW5TcGFucyA9IGZhbHNlO1xuICAgICAgaWYgKGZvcmNlVG9FbmQpIHsgcHJvY2Vzc0xpbmUoY20sIHRleHQsIGNvbnRleHQsIHN0cmVhbS5wb3MpOyB9XG4gICAgICBzdHJlYW0ucG9zID0gdGV4dC5sZW5ndGg7XG4gICAgICBzdHlsZSA9IG51bGw7XG4gICAgfSBlbHNlIHtcbiAgICAgIHN0eWxlID0gZXh0cmFjdExpbmVDbGFzc2VzKHJlYWRUb2tlbihtb2RlLCBzdHJlYW0sIGNvbnRleHQuc3RhdGUsIGlubmVyKSwgbGluZUNsYXNzZXMpO1xuICAgIH1cbiAgICBpZiAoaW5uZXIpIHtcbiAgICAgIHZhciBtTmFtZSA9IGlubmVyWzBdLm5hbWU7XG4gICAgICBpZiAobU5hbWUpIHsgc3R5bGUgPSBcIm0tXCIgKyAoc3R5bGUgPyBtTmFtZSArIFwiIFwiICsgc3R5bGUgOiBtTmFtZSk7IH1cbiAgICB9XG4gICAgaWYgKCFmbGF0dGVuU3BhbnMgfHwgY3VyU3R5bGUgIT0gc3R5bGUpIHtcbiAgICAgIHdoaWxlIChjdXJTdGFydCA8IHN0cmVhbS5zdGFydCkge1xuICAgICAgICBjdXJTdGFydCA9IE1hdGgubWluKHN0cmVhbS5zdGFydCwgY3VyU3RhcnQgKyA1MDAwKTtcbiAgICAgICAgZihjdXJTdGFydCwgY3VyU3R5bGUpO1xuICAgICAgfVxuICAgICAgY3VyU3R5bGUgPSBzdHlsZTtcbiAgICB9XG4gICAgc3RyZWFtLnN0YXJ0ID0gc3RyZWFtLnBvcztcbiAgfVxuICB3aGlsZSAoY3VyU3RhcnQgPCBzdHJlYW0ucG9zKSB7XG4gICAgLy8gV2Via2l0IHNlZW1zIHRvIHJlZnVzZSB0byByZW5kZXIgdGV4dCBub2RlcyBsb25nZXIgdGhhbiA1NzQ0NFxuICAgIC8vIGNoYXJhY3RlcnMsIGFuZCByZXR1cm5zIGluYWNjdXJhdGUgbWVhc3VyZW1lbnRzIGluIG5vZGVzXG4gICAgLy8gc3RhcnRpbmcgYXJvdW5kIDUwMDAgY2hhcnMuXG4gICAgdmFyIHBvcyA9IE1hdGgubWluKHN0cmVhbS5wb3MsIGN1clN0YXJ0ICsgNTAwMCk7XG4gICAgZihwb3MsIGN1clN0eWxlKTtcbiAgICBjdXJTdGFydCA9IHBvcztcbiAgfVxufVxuXG4vLyBGaW5kcyB0aGUgbGluZSB0byBzdGFydCB3aXRoIHdoZW4gc3RhcnRpbmcgYSBwYXJzZS4gVHJpZXMgdG9cbi8vIGZpbmQgYSBsaW5lIHdpdGggYSBzdGF0ZUFmdGVyLCBzbyB0aGF0IGl0IGNhbiBzdGFydCB3aXRoIGFcbi8vIHZhbGlkIHN0YXRlLiBJZiB0aGF0IGZhaWxzLCBpdCByZXR1cm5zIHRoZSBsaW5lIHdpdGggdGhlXG4vLyBzbWFsbGVzdCBpbmRlbnRhdGlvbiwgd2hpY2ggdGVuZHMgdG8gbmVlZCB0aGUgbGVhc3QgY29udGV4dCB0b1xuLy8gcGFyc2UgY29ycmVjdGx5LlxuZnVuY3Rpb24gZmluZFN0YXJ0TGluZShjbSwgbiwgcHJlY2lzZSkge1xuICB2YXIgbWluaW5kZW50LCBtaW5saW5lLCBkb2MgPSBjbS5kb2M7XG4gIHZhciBsaW0gPSBwcmVjaXNlID8gLTEgOiBuIC0gKGNtLmRvYy5tb2RlLmlubmVyTW9kZSA/IDEwMDAgOiAxMDApO1xuICBmb3IgKHZhciBzZWFyY2ggPSBuOyBzZWFyY2ggPiBsaW07IC0tc2VhcmNoKSB7XG4gICAgaWYgKHNlYXJjaCA8PSBkb2MuZmlyc3QpIHsgcmV0dXJuIGRvYy5maXJzdCB9XG4gICAgdmFyIGxpbmUgPSBnZXRMaW5lKGRvYywgc2VhcmNoIC0gMSksIGFmdGVyID0gbGluZS5zdGF0ZUFmdGVyO1xuICAgIGlmIChhZnRlciAmJiAoIXByZWNpc2UgfHwgc2VhcmNoICsgKGFmdGVyIGluc3RhbmNlb2YgU2F2ZWRDb250ZXh0ID8gYWZ0ZXIubG9va0FoZWFkIDogMCkgPD0gZG9jLm1vZGVGcm9udGllcikpXG4gICAgICB7IHJldHVybiBzZWFyY2ggfVxuICAgIHZhciBpbmRlbnRlZCA9IGNvdW50Q29sdW1uKGxpbmUudGV4dCwgbnVsbCwgY20ub3B0aW9ucy50YWJTaXplKTtcbiAgICBpZiAobWlubGluZSA9PSBudWxsIHx8IG1pbmluZGVudCA+IGluZGVudGVkKSB7XG4gICAgICBtaW5saW5lID0gc2VhcmNoIC0gMTtcbiAgICAgIG1pbmluZGVudCA9IGluZGVudGVkO1xuICAgIH1cbiAgfVxuICByZXR1cm4gbWlubGluZVxufVxuXG5mdW5jdGlvbiByZXRyZWF0RnJvbnRpZXIoZG9jLCBuKSB7XG4gIGRvYy5tb2RlRnJvbnRpZXIgPSBNYXRoLm1pbihkb2MubW9kZUZyb250aWVyLCBuKTtcbiAgaWYgKGRvYy5oaWdobGlnaHRGcm9udGllciA8IG4gLSAxMCkgeyByZXR1cm4gfVxuICB2YXIgc3RhcnQgPSBkb2MuZmlyc3Q7XG4gIGZvciAodmFyIGxpbmUgPSBuIC0gMTsgbGluZSA+IHN0YXJ0OyBsaW5lLS0pIHtcbiAgICB2YXIgc2F2ZWQgPSBnZXRMaW5lKGRvYywgbGluZSkuc3RhdGVBZnRlcjtcbiAgICAvLyBjaGFuZ2UgaXMgb24gM1xuICAgIC8vIHN0YXRlIG9uIGxpbmUgMSBsb29rZWQgYWhlYWQgMiAtLSBzbyBzYXcgM1xuICAgIC8vIHRlc3QgMSArIDIgPCAzIHNob3VsZCBjb3ZlciB0aGlzXG4gICAgaWYgKHNhdmVkICYmICghKHNhdmVkIGluc3RhbmNlb2YgU2F2ZWRDb250ZXh0KSB8fCBsaW5lICsgc2F2ZWQubG9va0FoZWFkIDwgbikpIHtcbiAgICAgIHN0YXJ0ID0gbGluZSArIDE7XG4gICAgICBicmVha1xuICAgIH1cbiAgfVxuICBkb2MuaGlnaGxpZ2h0RnJvbnRpZXIgPSBNYXRoLm1pbihkb2MuaGlnaGxpZ2h0RnJvbnRpZXIsIHN0YXJ0KTtcbn1cblxuLy8gTElORSBEQVRBIFNUUlVDVFVSRVxuXG4vLyBMaW5lIG9iamVjdHMuIFRoZXNlIGhvbGQgc3RhdGUgcmVsYXRlZCB0byBhIGxpbmUsIGluY2x1ZGluZ1xuLy8gaGlnaGxpZ2h0aW5nIGluZm8gKHRoZSBzdHlsZXMgYXJyYXkpLlxudmFyIExpbmUgPSBmdW5jdGlvbih0ZXh0LCBtYXJrZWRTcGFucywgZXN0aW1hdGVIZWlnaHQpIHtcbiAgdGhpcy50ZXh0ID0gdGV4dDtcbiAgYXR0YWNoTWFya2VkU3BhbnModGhpcywgbWFya2VkU3BhbnMpO1xuICB0aGlzLmhlaWdodCA9IGVzdGltYXRlSGVpZ2h0ID8gZXN0aW1hdGVIZWlnaHQodGhpcykgOiAxO1xufTtcblxuTGluZS5wcm90b3R5cGUubGluZU5vID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gbGluZU5vKHRoaXMpIH07XG5ldmVudE1peGluKExpbmUpO1xuXG4vLyBDaGFuZ2UgdGhlIGNvbnRlbnQgKHRleHQsIG1hcmtlcnMpIG9mIGEgbGluZS4gQXV0b21hdGljYWxseVxuLy8gaW52YWxpZGF0ZXMgY2FjaGVkIGluZm9ybWF0aW9uIGFuZCB0cmllcyB0byByZS1lc3RpbWF0ZSB0aGVcbi8vIGxpbmUncyBoZWlnaHQuXG5mdW5jdGlvbiB1cGRhdGVMaW5lKGxpbmUsIHRleHQsIG1hcmtlZFNwYW5zLCBlc3RpbWF0ZUhlaWdodCkge1xuICBsaW5lLnRleHQgPSB0ZXh0O1xuICBpZiAobGluZS5zdGF0ZUFmdGVyKSB7IGxpbmUuc3RhdGVBZnRlciA9IG51bGw7IH1cbiAgaWYgKGxpbmUuc3R5bGVzKSB7IGxpbmUuc3R5bGVzID0gbnVsbDsgfVxuICBpZiAobGluZS5vcmRlciAhPSBudWxsKSB7IGxpbmUub3JkZXIgPSBudWxsOyB9XG4gIGRldGFjaE1hcmtlZFNwYW5zKGxpbmUpO1xuICBhdHRhY2hNYXJrZWRTcGFucyhsaW5lLCBtYXJrZWRTcGFucyk7XG4gIHZhciBlc3RIZWlnaHQgPSBlc3RpbWF0ZUhlaWdodCA/IGVzdGltYXRlSGVpZ2h0KGxpbmUpIDogMTtcbiAgaWYgKGVzdEhlaWdodCAhPSBsaW5lLmhlaWdodCkgeyB1cGRhdGVMaW5lSGVpZ2h0KGxpbmUsIGVzdEhlaWdodCk7IH1cbn1cblxuLy8gRGV0YWNoIGEgbGluZSBmcm9tIHRoZSBkb2N1bWVudCB0cmVlIGFuZCBpdHMgbWFya2Vycy5cbmZ1bmN0aW9uIGNsZWFuVXBMaW5lKGxpbmUpIHtcbiAgbGluZS5wYXJlbnQgPSBudWxsO1xuICBkZXRhY2hNYXJrZWRTcGFucyhsaW5lKTtcbn1cblxuLy8gQ29udmVydCBhIHN0eWxlIGFzIHJldHVybmVkIGJ5IGEgbW9kZSAoZWl0aGVyIG51bGwsIG9yIGEgc3RyaW5nXG4vLyBjb250YWluaW5nIG9uZSBvciBtb3JlIHN0eWxlcykgdG8gYSBDU1Mgc3R5bGUuIFRoaXMgaXMgY2FjaGVkLFxuLy8gYW5kIGFsc28gbG9va3MgZm9yIGxpbmUtd2lkZSBzdHlsZXMuXG52YXIgc3R5bGVUb0NsYXNzQ2FjaGUgPSB7fTtcbnZhciBzdHlsZVRvQ2xhc3NDYWNoZVdpdGhNb2RlID0ge307XG5mdW5jdGlvbiBpbnRlcnByZXRUb2tlblN0eWxlKHN0eWxlLCBvcHRpb25zKSB7XG4gIGlmICghc3R5bGUgfHwgL15cXHMqJC8udGVzdChzdHlsZSkpIHsgcmV0dXJuIG51bGwgfVxuICB2YXIgY2FjaGUgPSBvcHRpb25zLmFkZE1vZGVDbGFzcyA/IHN0eWxlVG9DbGFzc0NhY2hlV2l0aE1vZGUgOiBzdHlsZVRvQ2xhc3NDYWNoZTtcbiAgcmV0dXJuIGNhY2hlW3N0eWxlXSB8fFxuICAgIChjYWNoZVtzdHlsZV0gPSBzdHlsZS5yZXBsYWNlKC9cXFMrL2csIFwiY20tJCZcIikpXG59XG5cbi8vIFJlbmRlciB0aGUgRE9NIHJlcHJlc2VudGF0aW9uIG9mIHRoZSB0ZXh0IG9mIGEgbGluZS4gQWxzbyBidWlsZHNcbi8vIHVwIGEgJ2xpbmUgbWFwJywgd2hpY2ggcG9pbnRzIGF0IHRoZSBET00gbm9kZXMgdGhhdCByZXByZXNlbnRcbi8vIHNwZWNpZmljIHN0cmV0Y2hlcyBvZiB0ZXh0LCBhbmQgaXMgdXNlZCBieSB0aGUgbWVhc3VyaW5nIGNvZGUuXG4vLyBUaGUgcmV0dXJuZWQgb2JqZWN0IGNvbnRhaW5zIHRoZSBET00gbm9kZSwgdGhpcyBtYXAsIGFuZFxuLy8gaW5mb3JtYXRpb24gYWJvdXQgbGluZS13aWRlIHN0eWxlcyB0aGF0IHdlcmUgc2V0IGJ5IHRoZSBtb2RlLlxuZnVuY3Rpb24gYnVpbGRMaW5lQ29udGVudChjbSwgbGluZVZpZXcpIHtcbiAgLy8gVGhlIHBhZGRpbmctcmlnaHQgZm9yY2VzIHRoZSBlbGVtZW50IHRvIGhhdmUgYSAnYm9yZGVyJywgd2hpY2hcbiAgLy8gaXMgbmVlZGVkIG9uIFdlYmtpdCB0byBiZSBhYmxlIHRvIGdldCBsaW5lLWxldmVsIGJvdW5kaW5nXG4gIC8vIHJlY3RhbmdsZXMgZm9yIGl0IChpbiBtZWFzdXJlQ2hhcikuXG4gIHZhciBjb250ZW50ID0gZWx0UChcInNwYW5cIiwgbnVsbCwgbnVsbCwgd2Via2l0ID8gXCJwYWRkaW5nLXJpZ2h0OiAuMXB4XCIgOiBudWxsKTtcbiAgdmFyIGJ1aWxkZXIgPSB7cHJlOiBlbHRQKFwicHJlXCIsIFtjb250ZW50XSwgXCJDb2RlTWlycm9yLWxpbmVcIiksIGNvbnRlbnQ6IGNvbnRlbnQsXG4gICAgICAgICAgICAgICAgIGNvbDogMCwgcG9zOiAwLCBjbTogY20sXG4gICAgICAgICAgICAgICAgIHRyYWlsaW5nU3BhY2U6IGZhbHNlLFxuICAgICAgICAgICAgICAgICBzcGxpdFNwYWNlczogKGllIHx8IHdlYmtpdCkgJiYgY20uZ2V0T3B0aW9uKFwibGluZVdyYXBwaW5nXCIpfTtcbiAgbGluZVZpZXcubWVhc3VyZSA9IHt9O1xuXG4gIC8vIEl0ZXJhdGUgb3ZlciB0aGUgbG9naWNhbCBsaW5lcyB0aGF0IG1ha2UgdXAgdGhpcyB2aXN1YWwgbGluZS5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPD0gKGxpbmVWaWV3LnJlc3QgPyBsaW5lVmlldy5yZXN0Lmxlbmd0aCA6IDApOyBpKyspIHtcbiAgICB2YXIgbGluZSA9IGkgPyBsaW5lVmlldy5yZXN0W2kgLSAxXSA6IGxpbmVWaWV3LmxpbmUsIG9yZGVyID0gKHZvaWQgMCk7XG4gICAgYnVpbGRlci5wb3MgPSAwO1xuICAgIGJ1aWxkZXIuYWRkVG9rZW4gPSBidWlsZFRva2VuO1xuICAgIC8vIE9wdGlvbmFsbHkgd2lyZSBpbiBzb21lIGhhY2tzIGludG8gdGhlIHRva2VuLXJlbmRlcmluZ1xuICAgIC8vIGFsZ29yaXRobSwgdG8gZGVhbCB3aXRoIGJyb3dzZXIgcXVpcmtzLlxuICAgIGlmIChoYXNCYWRCaWRpUmVjdHMoY20uZGlzcGxheS5tZWFzdXJlKSAmJiAob3JkZXIgPSBnZXRPcmRlcihsaW5lLCBjbS5kb2MuZGlyZWN0aW9uKSkpXG4gICAgICB7IGJ1aWxkZXIuYWRkVG9rZW4gPSBidWlsZFRva2VuQmFkQmlkaShidWlsZGVyLmFkZFRva2VuLCBvcmRlcik7IH1cbiAgICBidWlsZGVyLm1hcCA9IFtdO1xuICAgIHZhciBhbGxvd0Zyb250aWVyVXBkYXRlID0gbGluZVZpZXcgIT0gY20uZGlzcGxheS5leHRlcm5hbE1lYXN1cmVkICYmIGxpbmVObyhsaW5lKTtcbiAgICBpbnNlcnRMaW5lQ29udGVudChsaW5lLCBidWlsZGVyLCBnZXRMaW5lU3R5bGVzKGNtLCBsaW5lLCBhbGxvd0Zyb250aWVyVXBkYXRlKSk7XG4gICAgaWYgKGxpbmUuc3R5bGVDbGFzc2VzKSB7XG4gICAgICBpZiAobGluZS5zdHlsZUNsYXNzZXMuYmdDbGFzcylcbiAgICAgICAgeyBidWlsZGVyLmJnQ2xhc3MgPSBqb2luQ2xhc3NlcyhsaW5lLnN0eWxlQ2xhc3Nlcy5iZ0NsYXNzLCBidWlsZGVyLmJnQ2xhc3MgfHwgXCJcIik7IH1cbiAgICAgIGlmIChsaW5lLnN0eWxlQ2xhc3Nlcy50ZXh0Q2xhc3MpXG4gICAgICAgIHsgYnVpbGRlci50ZXh0Q2xhc3MgPSBqb2luQ2xhc3NlcyhsaW5lLnN0eWxlQ2xhc3Nlcy50ZXh0Q2xhc3MsIGJ1aWxkZXIudGV4dENsYXNzIHx8IFwiXCIpOyB9XG4gICAgfVxuXG4gICAgLy8gRW5zdXJlIGF0IGxlYXN0IGEgc2luZ2xlIG5vZGUgaXMgcHJlc2VudCwgZm9yIG1lYXN1cmluZy5cbiAgICBpZiAoYnVpbGRlci5tYXAubGVuZ3RoID09IDApXG4gICAgICB7IGJ1aWxkZXIubWFwLnB1c2goMCwgMCwgYnVpbGRlci5jb250ZW50LmFwcGVuZENoaWxkKHplcm9XaWR0aEVsZW1lbnQoY20uZGlzcGxheS5tZWFzdXJlKSkpOyB9XG5cbiAgICAvLyBTdG9yZSB0aGUgbWFwIGFuZCBhIGNhY2hlIG9iamVjdCBmb3IgdGhlIGN1cnJlbnQgbG9naWNhbCBsaW5lXG4gICAgaWYgKGkgPT0gMCkge1xuICAgICAgbGluZVZpZXcubWVhc3VyZS5tYXAgPSBidWlsZGVyLm1hcDtcbiAgICAgIGxpbmVWaWV3Lm1lYXN1cmUuY2FjaGUgPSB7fTtcbiAgICB9IGVsc2Uge1xuICAgICAgKGxpbmVWaWV3Lm1lYXN1cmUubWFwcyB8fCAobGluZVZpZXcubWVhc3VyZS5tYXBzID0gW10pKS5wdXNoKGJ1aWxkZXIubWFwKVxuICAgICAgOyhsaW5lVmlldy5tZWFzdXJlLmNhY2hlcyB8fCAobGluZVZpZXcubWVhc3VyZS5jYWNoZXMgPSBbXSkpLnB1c2goe30pO1xuICAgIH1cbiAgfVxuXG4gIC8vIFNlZSBpc3N1ZSAjMjkwMVxuICBpZiAod2Via2l0KSB7XG4gICAgdmFyIGxhc3QgPSBidWlsZGVyLmNvbnRlbnQubGFzdENoaWxkO1xuICAgIGlmICgvXFxiY20tdGFiXFxiLy50ZXN0KGxhc3QuY2xhc3NOYW1lKSB8fCAobGFzdC5xdWVyeVNlbGVjdG9yICYmIGxhc3QucXVlcnlTZWxlY3RvcihcIi5jbS10YWJcIikpKVxuICAgICAgeyBidWlsZGVyLmNvbnRlbnQuY2xhc3NOYW1lID0gXCJjbS10YWItd3JhcC1oYWNrXCI7IH1cbiAgfVxuXG4gIHNpZ25hbChjbSwgXCJyZW5kZXJMaW5lXCIsIGNtLCBsaW5lVmlldy5saW5lLCBidWlsZGVyLnByZSk7XG4gIGlmIChidWlsZGVyLnByZS5jbGFzc05hbWUpXG4gICAgeyBidWlsZGVyLnRleHRDbGFzcyA9IGpvaW5DbGFzc2VzKGJ1aWxkZXIucHJlLmNsYXNzTmFtZSwgYnVpbGRlci50ZXh0Q2xhc3MgfHwgXCJcIik7IH1cblxuICByZXR1cm4gYnVpbGRlclxufVxuXG5mdW5jdGlvbiBkZWZhdWx0U3BlY2lhbENoYXJQbGFjZWhvbGRlcihjaCkge1xuICB2YXIgdG9rZW4gPSBlbHQoXCJzcGFuXCIsIFwiXFx1MjAyMlwiLCBcImNtLWludmFsaWRjaGFyXCIpO1xuICB0b2tlbi50aXRsZSA9IFwiXFxcXHVcIiArIGNoLmNoYXJDb2RlQXQoMCkudG9TdHJpbmcoMTYpO1xuICB0b2tlbi5zZXRBdHRyaWJ1dGUoXCJhcmlhLWxhYmVsXCIsIHRva2VuLnRpdGxlKTtcbiAgcmV0dXJuIHRva2VuXG59XG5cbi8vIEJ1aWxkIHVwIHRoZSBET00gcmVwcmVzZW50YXRpb24gZm9yIGEgc2luZ2xlIHRva2VuLCBhbmQgYWRkIGl0IHRvXG4vLyB0aGUgbGluZSBtYXAuIFRha2VzIGNhcmUgdG8gcmVuZGVyIHNwZWNpYWwgY2hhcmFjdGVycyBzZXBhcmF0ZWx5LlxuZnVuY3Rpb24gYnVpbGRUb2tlbihidWlsZGVyLCB0ZXh0LCBzdHlsZSwgc3RhcnRTdHlsZSwgZW5kU3R5bGUsIHRpdGxlLCBjc3MpIHtcbiAgaWYgKCF0ZXh0KSB7IHJldHVybiB9XG4gIHZhciBkaXNwbGF5VGV4dCA9IGJ1aWxkZXIuc3BsaXRTcGFjZXMgPyBzcGxpdFNwYWNlcyh0ZXh0LCBidWlsZGVyLnRyYWlsaW5nU3BhY2UpIDogdGV4dDtcbiAgdmFyIHNwZWNpYWwgPSBidWlsZGVyLmNtLnN0YXRlLnNwZWNpYWxDaGFycywgbXVzdFdyYXAgPSBmYWxzZTtcbiAgdmFyIGNvbnRlbnQ7XG4gIGlmICghc3BlY2lhbC50ZXN0KHRleHQpKSB7XG4gICAgYnVpbGRlci5jb2wgKz0gdGV4dC5sZW5ndGg7XG4gICAgY29udGVudCA9IGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKGRpc3BsYXlUZXh0KTtcbiAgICBidWlsZGVyLm1hcC5wdXNoKGJ1aWxkZXIucG9zLCBidWlsZGVyLnBvcyArIHRleHQubGVuZ3RoLCBjb250ZW50KTtcbiAgICBpZiAoaWUgJiYgaWVfdmVyc2lvbiA8IDkpIHsgbXVzdFdyYXAgPSB0cnVlOyB9XG4gICAgYnVpbGRlci5wb3MgKz0gdGV4dC5sZW5ndGg7XG4gIH0gZWxzZSB7XG4gICAgY29udGVudCA9IGRvY3VtZW50LmNyZWF0ZURvY3VtZW50RnJhZ21lbnQoKTtcbiAgICB2YXIgcG9zID0gMDtcbiAgICB3aGlsZSAodHJ1ZSkge1xuICAgICAgc3BlY2lhbC5sYXN0SW5kZXggPSBwb3M7XG4gICAgICB2YXIgbSA9IHNwZWNpYWwuZXhlYyh0ZXh0KTtcbiAgICAgIHZhciBza2lwcGVkID0gbSA/IG0uaW5kZXggLSBwb3MgOiB0ZXh0Lmxlbmd0aCAtIHBvcztcbiAgICAgIGlmIChza2lwcGVkKSB7XG4gICAgICAgIHZhciB0eHQgPSBkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShkaXNwbGF5VGV4dC5zbGljZShwb3MsIHBvcyArIHNraXBwZWQpKTtcbiAgICAgICAgaWYgKGllICYmIGllX3ZlcnNpb24gPCA5KSB7IGNvbnRlbnQuYXBwZW5kQ2hpbGQoZWx0KFwic3BhblwiLCBbdHh0XSkpOyB9XG4gICAgICAgIGVsc2UgeyBjb250ZW50LmFwcGVuZENoaWxkKHR4dCk7IH1cbiAgICAgICAgYnVpbGRlci5tYXAucHVzaChidWlsZGVyLnBvcywgYnVpbGRlci5wb3MgKyBza2lwcGVkLCB0eHQpO1xuICAgICAgICBidWlsZGVyLmNvbCArPSBza2lwcGVkO1xuICAgICAgICBidWlsZGVyLnBvcyArPSBza2lwcGVkO1xuICAgICAgfVxuICAgICAgaWYgKCFtKSB7IGJyZWFrIH1cbiAgICAgIHBvcyArPSBza2lwcGVkICsgMTtcbiAgICAgIHZhciB0eHQkMSA9ICh2b2lkIDApO1xuICAgICAgaWYgKG1bMF0gPT0gXCJcXHRcIikge1xuICAgICAgICB2YXIgdGFiU2l6ZSA9IGJ1aWxkZXIuY20ub3B0aW9ucy50YWJTaXplLCB0YWJXaWR0aCA9IHRhYlNpemUgLSBidWlsZGVyLmNvbCAlIHRhYlNpemU7XG4gICAgICAgIHR4dCQxID0gY29udGVudC5hcHBlbmRDaGlsZChlbHQoXCJzcGFuXCIsIHNwYWNlU3RyKHRhYldpZHRoKSwgXCJjbS10YWJcIikpO1xuICAgICAgICB0eHQkMS5zZXRBdHRyaWJ1dGUoXCJyb2xlXCIsIFwicHJlc2VudGF0aW9uXCIpO1xuICAgICAgICB0eHQkMS5zZXRBdHRyaWJ1dGUoXCJjbS10ZXh0XCIsIFwiXFx0XCIpO1xuICAgICAgICBidWlsZGVyLmNvbCArPSB0YWJXaWR0aDtcbiAgICAgIH0gZWxzZSBpZiAobVswXSA9PSBcIlxcclwiIHx8IG1bMF0gPT0gXCJcXG5cIikge1xuICAgICAgICB0eHQkMSA9IGNvbnRlbnQuYXBwZW5kQ2hpbGQoZWx0KFwic3BhblwiLCBtWzBdID09IFwiXFxyXCIgPyBcIlxcdTI0MGRcIiA6IFwiXFx1MjQyNFwiLCBcImNtLWludmFsaWRjaGFyXCIpKTtcbiAgICAgICAgdHh0JDEuc2V0QXR0cmlidXRlKFwiY20tdGV4dFwiLCBtWzBdKTtcbiAgICAgICAgYnVpbGRlci5jb2wgKz0gMTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHR4dCQxID0gYnVpbGRlci5jbS5vcHRpb25zLnNwZWNpYWxDaGFyUGxhY2Vob2xkZXIobVswXSk7XG4gICAgICAgIHR4dCQxLnNldEF0dHJpYnV0ZShcImNtLXRleHRcIiwgbVswXSk7XG4gICAgICAgIGlmIChpZSAmJiBpZV92ZXJzaW9uIDwgOSkgeyBjb250ZW50LmFwcGVuZENoaWxkKGVsdChcInNwYW5cIiwgW3R4dCQxXSkpOyB9XG4gICAgICAgIGVsc2UgeyBjb250ZW50LmFwcGVuZENoaWxkKHR4dCQxKTsgfVxuICAgICAgICBidWlsZGVyLmNvbCArPSAxO1xuICAgICAgfVxuICAgICAgYnVpbGRlci5tYXAucHVzaChidWlsZGVyLnBvcywgYnVpbGRlci5wb3MgKyAxLCB0eHQkMSk7XG4gICAgICBidWlsZGVyLnBvcysrO1xuICAgIH1cbiAgfVxuICBidWlsZGVyLnRyYWlsaW5nU3BhY2UgPSBkaXNwbGF5VGV4dC5jaGFyQ29kZUF0KHRleHQubGVuZ3RoIC0gMSkgPT0gMzI7XG4gIGlmIChzdHlsZSB8fCBzdGFydFN0eWxlIHx8IGVuZFN0eWxlIHx8IG11c3RXcmFwIHx8IGNzcykge1xuICAgIHZhciBmdWxsU3R5bGUgPSBzdHlsZSB8fCBcIlwiO1xuICAgIGlmIChzdGFydFN0eWxlKSB7IGZ1bGxTdHlsZSArPSBzdGFydFN0eWxlOyB9XG4gICAgaWYgKGVuZFN0eWxlKSB7IGZ1bGxTdHlsZSArPSBlbmRTdHlsZTsgfVxuICAgIHZhciB0b2tlbiA9IGVsdChcInNwYW5cIiwgW2NvbnRlbnRdLCBmdWxsU3R5bGUsIGNzcyk7XG4gICAgaWYgKHRpdGxlKSB7IHRva2VuLnRpdGxlID0gdGl0bGU7IH1cbiAgICByZXR1cm4gYnVpbGRlci5jb250ZW50LmFwcGVuZENoaWxkKHRva2VuKVxuICB9XG4gIGJ1aWxkZXIuY29udGVudC5hcHBlbmRDaGlsZChjb250ZW50KTtcbn1cblxuZnVuY3Rpb24gc3BsaXRTcGFjZXModGV4dCwgdHJhaWxpbmdCZWZvcmUpIHtcbiAgaWYgKHRleHQubGVuZ3RoID4gMSAmJiAhLyAgLy50ZXN0KHRleHQpKSB7IHJldHVybiB0ZXh0IH1cbiAgdmFyIHNwYWNlQmVmb3JlID0gdHJhaWxpbmdCZWZvcmUsIHJlc3VsdCA9IFwiXCI7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgdGV4dC5sZW5ndGg7IGkrKykge1xuICAgIHZhciBjaCA9IHRleHQuY2hhckF0KGkpO1xuICAgIGlmIChjaCA9PSBcIiBcIiAmJiBzcGFjZUJlZm9yZSAmJiAoaSA9PSB0ZXh0Lmxlbmd0aCAtIDEgfHwgdGV4dC5jaGFyQ29kZUF0KGkgKyAxKSA9PSAzMikpXG4gICAgICB7IGNoID0gXCJcXHUwMGEwXCI7IH1cbiAgICByZXN1bHQgKz0gY2g7XG4gICAgc3BhY2VCZWZvcmUgPSBjaCA9PSBcIiBcIjtcbiAgfVxuICByZXR1cm4gcmVzdWx0XG59XG5cbi8vIFdvcmsgYXJvdW5kIG5vbnNlbnNlIGRpbWVuc2lvbnMgYmVpbmcgcmVwb3J0ZWQgZm9yIHN0cmV0Y2hlcyBvZlxuLy8gcmlnaHQtdG8tbGVmdCB0ZXh0LlxuZnVuY3Rpb24gYnVpbGRUb2tlbkJhZEJpZGkoaW5uZXIsIG9yZGVyKSB7XG4gIHJldHVybiBmdW5jdGlvbiAoYnVpbGRlciwgdGV4dCwgc3R5bGUsIHN0YXJ0U3R5bGUsIGVuZFN0eWxlLCB0aXRsZSwgY3NzKSB7XG4gICAgc3R5bGUgPSBzdHlsZSA/IHN0eWxlICsgXCIgY20tZm9yY2UtYm9yZGVyXCIgOiBcImNtLWZvcmNlLWJvcmRlclwiO1xuICAgIHZhciBzdGFydCA9IGJ1aWxkZXIucG9zLCBlbmQgPSBzdGFydCArIHRleHQubGVuZ3RoO1xuICAgIGZvciAoOzspIHtcbiAgICAgIC8vIEZpbmQgdGhlIHBhcnQgdGhhdCBvdmVybGFwcyB3aXRoIHRoZSBzdGFydCBvZiB0aGlzIHRleHRcbiAgICAgIHZhciBwYXJ0ID0gKHZvaWQgMCk7XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG9yZGVyLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHBhcnQgPSBvcmRlcltpXTtcbiAgICAgICAgaWYgKHBhcnQudG8gPiBzdGFydCAmJiBwYXJ0LmZyb20gPD0gc3RhcnQpIHsgYnJlYWsgfVxuICAgICAgfVxuICAgICAgaWYgKHBhcnQudG8gPj0gZW5kKSB7IHJldHVybiBpbm5lcihidWlsZGVyLCB0ZXh0LCBzdHlsZSwgc3RhcnRTdHlsZSwgZW5kU3R5bGUsIHRpdGxlLCBjc3MpIH1cbiAgICAgIGlubmVyKGJ1aWxkZXIsIHRleHQuc2xpY2UoMCwgcGFydC50byAtIHN0YXJ0KSwgc3R5bGUsIHN0YXJ0U3R5bGUsIG51bGwsIHRpdGxlLCBjc3MpO1xuICAgICAgc3RhcnRTdHlsZSA9IG51bGw7XG4gICAgICB0ZXh0ID0gdGV4dC5zbGljZShwYXJ0LnRvIC0gc3RhcnQpO1xuICAgICAgc3RhcnQgPSBwYXJ0LnRvO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBidWlsZENvbGxhcHNlZFNwYW4oYnVpbGRlciwgc2l6ZSwgbWFya2VyLCBpZ25vcmVXaWRnZXQpIHtcbiAgdmFyIHdpZGdldCA9ICFpZ25vcmVXaWRnZXQgJiYgbWFya2VyLndpZGdldE5vZGU7XG4gIGlmICh3aWRnZXQpIHsgYnVpbGRlci5tYXAucHVzaChidWlsZGVyLnBvcywgYnVpbGRlci5wb3MgKyBzaXplLCB3aWRnZXQpOyB9XG4gIGlmICghaWdub3JlV2lkZ2V0ICYmIGJ1aWxkZXIuY20uZGlzcGxheS5pbnB1dC5uZWVkc0NvbnRlbnRBdHRyaWJ1dGUpIHtcbiAgICBpZiAoIXdpZGdldClcbiAgICAgIHsgd2lkZ2V0ID0gYnVpbGRlci5jb250ZW50LmFwcGVuZENoaWxkKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJzcGFuXCIpKTsgfVxuICAgIHdpZGdldC5zZXRBdHRyaWJ1dGUoXCJjbS1tYXJrZXJcIiwgbWFya2VyLmlkKTtcbiAgfVxuICBpZiAod2lkZ2V0KSB7XG4gICAgYnVpbGRlci5jbS5kaXNwbGF5LmlucHV0LnNldFVuZWRpdGFibGUod2lkZ2V0KTtcbiAgICBidWlsZGVyLmNvbnRlbnQuYXBwZW5kQ2hpbGQod2lkZ2V0KTtcbiAgfVxuICBidWlsZGVyLnBvcyArPSBzaXplO1xuICBidWlsZGVyLnRyYWlsaW5nU3BhY2UgPSBmYWxzZTtcbn1cblxuLy8gT3V0cHV0cyBhIG51bWJlciBvZiBzcGFucyB0byBtYWtlIHVwIGEgbGluZSwgdGFraW5nIGhpZ2hsaWdodGluZ1xuLy8gYW5kIG1hcmtlZCB0ZXh0IGludG8gYWNjb3VudC5cbmZ1bmN0aW9uIGluc2VydExpbmVDb250ZW50KGxpbmUsIGJ1aWxkZXIsIHN0eWxlcykge1xuICB2YXIgc3BhbnMgPSBsaW5lLm1hcmtlZFNwYW5zLCBhbGxUZXh0ID0gbGluZS50ZXh0LCBhdCA9IDA7XG4gIGlmICghc3BhbnMpIHtcbiAgICBmb3IgKHZhciBpJDEgPSAxOyBpJDEgPCBzdHlsZXMubGVuZ3RoOyBpJDErPTIpXG4gICAgICB7IGJ1aWxkZXIuYWRkVG9rZW4oYnVpbGRlciwgYWxsVGV4dC5zbGljZShhdCwgYXQgPSBzdHlsZXNbaSQxXSksIGludGVycHJldFRva2VuU3R5bGUoc3R5bGVzW2kkMSsxXSwgYnVpbGRlci5jbS5vcHRpb25zKSk7IH1cbiAgICByZXR1cm5cbiAgfVxuXG4gIHZhciBsZW4gPSBhbGxUZXh0Lmxlbmd0aCwgcG9zID0gMCwgaSA9IDEsIHRleHQgPSBcIlwiLCBzdHlsZSwgY3NzO1xuICB2YXIgbmV4dENoYW5nZSA9IDAsIHNwYW5TdHlsZSwgc3BhbkVuZFN0eWxlLCBzcGFuU3RhcnRTdHlsZSwgdGl0bGUsIGNvbGxhcHNlZDtcbiAgZm9yICg7Oykge1xuICAgIGlmIChuZXh0Q2hhbmdlID09IHBvcykgeyAvLyBVcGRhdGUgY3VycmVudCBtYXJrZXIgc2V0XG4gICAgICBzcGFuU3R5bGUgPSBzcGFuRW5kU3R5bGUgPSBzcGFuU3RhcnRTdHlsZSA9IHRpdGxlID0gY3NzID0gXCJcIjtcbiAgICAgIGNvbGxhcHNlZCA9IG51bGw7IG5leHRDaGFuZ2UgPSBJbmZpbml0eTtcbiAgICAgIHZhciBmb3VuZEJvb2ttYXJrcyA9IFtdLCBlbmRTdHlsZXMgPSAodm9pZCAwKTtcbiAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgc3BhbnMubGVuZ3RoOyArK2opIHtcbiAgICAgICAgdmFyIHNwID0gc3BhbnNbal0sIG0gPSBzcC5tYXJrZXI7XG4gICAgICAgIGlmIChtLnR5cGUgPT0gXCJib29rbWFya1wiICYmIHNwLmZyb20gPT0gcG9zICYmIG0ud2lkZ2V0Tm9kZSkge1xuICAgICAgICAgIGZvdW5kQm9va21hcmtzLnB1c2gobSk7XG4gICAgICAgIH0gZWxzZSBpZiAoc3AuZnJvbSA8PSBwb3MgJiYgKHNwLnRvID09IG51bGwgfHwgc3AudG8gPiBwb3MgfHwgbS5jb2xsYXBzZWQgJiYgc3AudG8gPT0gcG9zICYmIHNwLmZyb20gPT0gcG9zKSkge1xuICAgICAgICAgIGlmIChzcC50byAhPSBudWxsICYmIHNwLnRvICE9IHBvcyAmJiBuZXh0Q2hhbmdlID4gc3AudG8pIHtcbiAgICAgICAgICAgIG5leHRDaGFuZ2UgPSBzcC50bztcbiAgICAgICAgICAgIHNwYW5FbmRTdHlsZSA9IFwiXCI7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChtLmNsYXNzTmFtZSkgeyBzcGFuU3R5bGUgKz0gXCIgXCIgKyBtLmNsYXNzTmFtZTsgfVxuICAgICAgICAgIGlmIChtLmNzcykgeyBjc3MgPSAoY3NzID8gY3NzICsgXCI7XCIgOiBcIlwiKSArIG0uY3NzOyB9XG4gICAgICAgICAgaWYgKG0uc3RhcnRTdHlsZSAmJiBzcC5mcm9tID09IHBvcykgeyBzcGFuU3RhcnRTdHlsZSArPSBcIiBcIiArIG0uc3RhcnRTdHlsZTsgfVxuICAgICAgICAgIGlmIChtLmVuZFN0eWxlICYmIHNwLnRvID09IG5leHRDaGFuZ2UpIHsgKGVuZFN0eWxlcyB8fCAoZW5kU3R5bGVzID0gW10pKS5wdXNoKG0uZW5kU3R5bGUsIHNwLnRvKTsgfVxuICAgICAgICAgIGlmIChtLnRpdGxlICYmICF0aXRsZSkgeyB0aXRsZSA9IG0udGl0bGU7IH1cbiAgICAgICAgICBpZiAobS5jb2xsYXBzZWQgJiYgKCFjb2xsYXBzZWQgfHwgY29tcGFyZUNvbGxhcHNlZE1hcmtlcnMoY29sbGFwc2VkLm1hcmtlciwgbSkgPCAwKSlcbiAgICAgICAgICAgIHsgY29sbGFwc2VkID0gc3A7IH1cbiAgICAgICAgfSBlbHNlIGlmIChzcC5mcm9tID4gcG9zICYmIG5leHRDaGFuZ2UgPiBzcC5mcm9tKSB7XG4gICAgICAgICAgbmV4dENoYW5nZSA9IHNwLmZyb207XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChlbmRTdHlsZXMpIHsgZm9yICh2YXIgaiQxID0gMDsgaiQxIDwgZW5kU3R5bGVzLmxlbmd0aDsgaiQxICs9IDIpXG4gICAgICAgIHsgaWYgKGVuZFN0eWxlc1tqJDEgKyAxXSA9PSBuZXh0Q2hhbmdlKSB7IHNwYW5FbmRTdHlsZSArPSBcIiBcIiArIGVuZFN0eWxlc1tqJDFdOyB9IH0gfVxuXG4gICAgICBpZiAoIWNvbGxhcHNlZCB8fCBjb2xsYXBzZWQuZnJvbSA9PSBwb3MpIHsgZm9yICh2YXIgaiQyID0gMDsgaiQyIDwgZm91bmRCb29rbWFya3MubGVuZ3RoOyArK2okMilcbiAgICAgICAgeyBidWlsZENvbGxhcHNlZFNwYW4oYnVpbGRlciwgMCwgZm91bmRCb29rbWFya3NbaiQyXSk7IH0gfVxuICAgICAgaWYgKGNvbGxhcHNlZCAmJiAoY29sbGFwc2VkLmZyb20gfHwgMCkgPT0gcG9zKSB7XG4gICAgICAgIGJ1aWxkQ29sbGFwc2VkU3BhbihidWlsZGVyLCAoY29sbGFwc2VkLnRvID09IG51bGwgPyBsZW4gKyAxIDogY29sbGFwc2VkLnRvKSAtIHBvcyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbGxhcHNlZC5tYXJrZXIsIGNvbGxhcHNlZC5mcm9tID09IG51bGwpO1xuICAgICAgICBpZiAoY29sbGFwc2VkLnRvID09IG51bGwpIHsgcmV0dXJuIH1cbiAgICAgICAgaWYgKGNvbGxhcHNlZC50byA9PSBwb3MpIHsgY29sbGFwc2VkID0gZmFsc2U7IH1cbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKHBvcyA+PSBsZW4pIHsgYnJlYWsgfVxuXG4gICAgdmFyIHVwdG8gPSBNYXRoLm1pbihsZW4sIG5leHRDaGFuZ2UpO1xuICAgIHdoaWxlICh0cnVlKSB7XG4gICAgICBpZiAodGV4dCkge1xuICAgICAgICB2YXIgZW5kID0gcG9zICsgdGV4dC5sZW5ndGg7XG4gICAgICAgIGlmICghY29sbGFwc2VkKSB7XG4gICAgICAgICAgdmFyIHRva2VuVGV4dCA9IGVuZCA+IHVwdG8gPyB0ZXh0LnNsaWNlKDAsIHVwdG8gLSBwb3MpIDogdGV4dDtcbiAgICAgICAgICBidWlsZGVyLmFkZFRva2VuKGJ1aWxkZXIsIHRva2VuVGV4dCwgc3R5bGUgPyBzdHlsZSArIHNwYW5TdHlsZSA6IHNwYW5TdHlsZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIHNwYW5TdGFydFN0eWxlLCBwb3MgKyB0b2tlblRleHQubGVuZ3RoID09IG5leHRDaGFuZ2UgPyBzcGFuRW5kU3R5bGUgOiBcIlwiLCB0aXRsZSwgY3NzKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoZW5kID49IHVwdG8pIHt0ZXh0ID0gdGV4dC5zbGljZSh1cHRvIC0gcG9zKTsgcG9zID0gdXB0bzsgYnJlYWt9XG4gICAgICAgIHBvcyA9IGVuZDtcbiAgICAgICAgc3BhblN0YXJ0U3R5bGUgPSBcIlwiO1xuICAgICAgfVxuICAgICAgdGV4dCA9IGFsbFRleHQuc2xpY2UoYXQsIGF0ID0gc3R5bGVzW2krK10pO1xuICAgICAgc3R5bGUgPSBpbnRlcnByZXRUb2tlblN0eWxlKHN0eWxlc1tpKytdLCBidWlsZGVyLmNtLm9wdGlvbnMpO1xuICAgIH1cbiAgfVxufVxuXG5cbi8vIFRoZXNlIG9iamVjdHMgYXJlIHVzZWQgdG8gcmVwcmVzZW50IHRoZSB2aXNpYmxlIChjdXJyZW50bHkgZHJhd24pXG4vLyBwYXJ0IG9mIHRoZSBkb2N1bWVudC4gQSBMaW5lVmlldyBtYXkgY29ycmVzcG9uZCB0byBtdWx0aXBsZVxuLy8gbG9naWNhbCBsaW5lcywgaWYgdGhvc2UgYXJlIGNvbm5lY3RlZCBieSBjb2xsYXBzZWQgcmFuZ2VzLlxuZnVuY3Rpb24gTGluZVZpZXcoZG9jLCBsaW5lLCBsaW5lTikge1xuICAvLyBUaGUgc3RhcnRpbmcgbGluZVxuICB0aGlzLmxpbmUgPSBsaW5lO1xuICAvLyBDb250aW51aW5nIGxpbmVzLCBpZiBhbnlcbiAgdGhpcy5yZXN0ID0gdmlzdWFsTGluZUNvbnRpbnVlZChsaW5lKTtcbiAgLy8gTnVtYmVyIG9mIGxvZ2ljYWwgbGluZXMgaW4gdGhpcyB2aXN1YWwgbGluZVxuICB0aGlzLnNpemUgPSB0aGlzLnJlc3QgPyBsaW5lTm8obHN0KHRoaXMucmVzdCkpIC0gbGluZU4gKyAxIDogMTtcbiAgdGhpcy5ub2RlID0gdGhpcy50ZXh0ID0gbnVsbDtcbiAgdGhpcy5oaWRkZW4gPSBsaW5lSXNIaWRkZW4oZG9jLCBsaW5lKTtcbn1cblxuLy8gQ3JlYXRlIGEgcmFuZ2Ugb2YgTGluZVZpZXcgb2JqZWN0cyBmb3IgdGhlIGdpdmVuIGxpbmVzLlxuZnVuY3Rpb24gYnVpbGRWaWV3QXJyYXkoY20sIGZyb20sIHRvKSB7XG4gIHZhciBhcnJheSA9IFtdLCBuZXh0UG9zO1xuICBmb3IgKHZhciBwb3MgPSBmcm9tOyBwb3MgPCB0bzsgcG9zID0gbmV4dFBvcykge1xuICAgIHZhciB2aWV3ID0gbmV3IExpbmVWaWV3KGNtLmRvYywgZ2V0TGluZShjbS5kb2MsIHBvcyksIHBvcyk7XG4gICAgbmV4dFBvcyA9IHBvcyArIHZpZXcuc2l6ZTtcbiAgICBhcnJheS5wdXNoKHZpZXcpO1xuICB9XG4gIHJldHVybiBhcnJheVxufVxuXG52YXIgb3BlcmF0aW9uR3JvdXAgPSBudWxsO1xuXG5mdW5jdGlvbiBwdXNoT3BlcmF0aW9uKG9wKSB7XG4gIGlmIChvcGVyYXRpb25Hcm91cCkge1xuICAgIG9wZXJhdGlvbkdyb3VwLm9wcy5wdXNoKG9wKTtcbiAgfSBlbHNlIHtcbiAgICBvcC5vd25zR3JvdXAgPSBvcGVyYXRpb25Hcm91cCA9IHtcbiAgICAgIG9wczogW29wXSxcbiAgICAgIGRlbGF5ZWRDYWxsYmFja3M6IFtdXG4gICAgfTtcbiAgfVxufVxuXG5mdW5jdGlvbiBmaXJlQ2FsbGJhY2tzRm9yT3BzKGdyb3VwKSB7XG4gIC8vIENhbGxzIGRlbGF5ZWQgY2FsbGJhY2tzIGFuZCBjdXJzb3JBY3Rpdml0eSBoYW5kbGVycyB1bnRpbCBub1xuICAvLyBuZXcgb25lcyBhcHBlYXJcbiAgdmFyIGNhbGxiYWNrcyA9IGdyb3VwLmRlbGF5ZWRDYWxsYmFja3MsIGkgPSAwO1xuICBkbyB7XG4gICAgZm9yICg7IGkgPCBjYWxsYmFja3MubGVuZ3RoOyBpKyspXG4gICAgICB7IGNhbGxiYWNrc1tpXS5jYWxsKG51bGwpOyB9XG4gICAgZm9yICh2YXIgaiA9IDA7IGogPCBncm91cC5vcHMubGVuZ3RoOyBqKyspIHtcbiAgICAgIHZhciBvcCA9IGdyb3VwLm9wc1tqXTtcbiAgICAgIGlmIChvcC5jdXJzb3JBY3Rpdml0eUhhbmRsZXJzKVxuICAgICAgICB7IHdoaWxlIChvcC5jdXJzb3JBY3Rpdml0eUNhbGxlZCA8IG9wLmN1cnNvckFjdGl2aXR5SGFuZGxlcnMubGVuZ3RoKVxuICAgICAgICAgIHsgb3AuY3Vyc29yQWN0aXZpdHlIYW5kbGVyc1tvcC5jdXJzb3JBY3Rpdml0eUNhbGxlZCsrXS5jYWxsKG51bGwsIG9wLmNtKTsgfSB9XG4gICAgfVxuICB9IHdoaWxlIChpIDwgY2FsbGJhY2tzLmxlbmd0aClcbn1cblxuZnVuY3Rpb24gZmluaXNoT3BlcmF0aW9uKG9wLCBlbmRDYikge1xuICB2YXIgZ3JvdXAgPSBvcC5vd25zR3JvdXA7XG4gIGlmICghZ3JvdXApIHsgcmV0dXJuIH1cblxuICB0cnkgeyBmaXJlQ2FsbGJhY2tzRm9yT3BzKGdyb3VwKTsgfVxuICBmaW5hbGx5IHtcbiAgICBvcGVyYXRpb25Hcm91cCA9IG51bGw7XG4gICAgZW5kQ2IoZ3JvdXApO1xuICB9XG59XG5cbnZhciBvcnBoYW5EZWxheWVkQ2FsbGJhY2tzID0gbnVsbDtcblxuLy8gT2Z0ZW4sIHdlIHdhbnQgdG8gc2lnbmFsIGV2ZW50cyBhdCBhIHBvaW50IHdoZXJlIHdlIGFyZSBpbiB0aGVcbi8vIG1pZGRsZSBvZiBzb21lIHdvcmssIGJ1dCBkb24ndCB3YW50IHRoZSBoYW5kbGVyIHRvIHN0YXJ0IGNhbGxpbmdcbi8vIG90aGVyIG1ldGhvZHMgb24gdGhlIGVkaXRvciwgd2hpY2ggbWlnaHQgYmUgaW4gYW4gaW5jb25zaXN0ZW50XG4vLyBzdGF0ZSBvciBzaW1wbHkgbm90IGV4cGVjdCBhbnkgb3RoZXIgZXZlbnRzIHRvIGhhcHBlbi5cbi8vIHNpZ25hbExhdGVyIGxvb2tzIHdoZXRoZXIgdGhlcmUgYXJlIGFueSBoYW5kbGVycywgYW5kIHNjaGVkdWxlc1xuLy8gdGhlbSB0byBiZSBleGVjdXRlZCB3aGVuIHRoZSBsYXN0IG9wZXJhdGlvbiBlbmRzLCBvciwgaWYgbm9cbi8vIG9wZXJhdGlvbiBpcyBhY3RpdmUsIHdoZW4gYSB0aW1lb3V0IGZpcmVzLlxuZnVuY3Rpb24gc2lnbmFsTGF0ZXIoZW1pdHRlciwgdHlwZSAvKiwgdmFsdWVzLi4uKi8pIHtcbiAgdmFyIGFyciA9IGdldEhhbmRsZXJzKGVtaXR0ZXIsIHR5cGUpO1xuICBpZiAoIWFyci5sZW5ndGgpIHsgcmV0dXJuIH1cbiAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDIpLCBsaXN0O1xuICBpZiAob3BlcmF0aW9uR3JvdXApIHtcbiAgICBsaXN0ID0gb3BlcmF0aW9uR3JvdXAuZGVsYXllZENhbGxiYWNrcztcbiAgfSBlbHNlIGlmIChvcnBoYW5EZWxheWVkQ2FsbGJhY2tzKSB7XG4gICAgbGlzdCA9IG9ycGhhbkRlbGF5ZWRDYWxsYmFja3M7XG4gIH0gZWxzZSB7XG4gICAgbGlzdCA9IG9ycGhhbkRlbGF5ZWRDYWxsYmFja3MgPSBbXTtcbiAgICBzZXRUaW1lb3V0KGZpcmVPcnBoYW5EZWxheWVkLCAwKTtcbiAgfVxuICB2YXIgbG9vcCA9IGZ1bmN0aW9uICggaSApIHtcbiAgICBsaXN0LnB1c2goZnVuY3Rpb24gKCkgeyByZXR1cm4gYXJyW2ldLmFwcGx5KG51bGwsIGFyZ3MpOyB9KTtcbiAgfTtcblxuICBmb3IgKHZhciBpID0gMDsgaSA8IGFyci5sZW5ndGg7ICsraSlcbiAgICBsb29wKCBpICk7XG59XG5cbmZ1bmN0aW9uIGZpcmVPcnBoYW5EZWxheWVkKCkge1xuICB2YXIgZGVsYXllZCA9IG9ycGhhbkRlbGF5ZWRDYWxsYmFja3M7XG4gIG9ycGhhbkRlbGF5ZWRDYWxsYmFja3MgPSBudWxsO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGRlbGF5ZWQubGVuZ3RoOyArK2kpIHsgZGVsYXllZFtpXSgpOyB9XG59XG5cbi8vIFdoZW4gYW4gYXNwZWN0IG9mIGEgbGluZSBjaGFuZ2VzLCBhIHN0cmluZyBpcyBhZGRlZCB0b1xuLy8gbGluZVZpZXcuY2hhbmdlcy4gVGhpcyB1cGRhdGVzIHRoZSByZWxldmFudCBwYXJ0IG9mIHRoZSBsaW5lJ3Ncbi8vIERPTSBzdHJ1Y3R1cmUuXG5mdW5jdGlvbiB1cGRhdGVMaW5lRm9yQ2hhbmdlcyhjbSwgbGluZVZpZXcsIGxpbmVOLCBkaW1zKSB7XG4gIGZvciAodmFyIGogPSAwOyBqIDwgbGluZVZpZXcuY2hhbmdlcy5sZW5ndGg7IGorKykge1xuICAgIHZhciB0eXBlID0gbGluZVZpZXcuY2hhbmdlc1tqXTtcbiAgICBpZiAodHlwZSA9PSBcInRleHRcIikgeyB1cGRhdGVMaW5lVGV4dChjbSwgbGluZVZpZXcpOyB9XG4gICAgZWxzZSBpZiAodHlwZSA9PSBcImd1dHRlclwiKSB7IHVwZGF0ZUxpbmVHdXR0ZXIoY20sIGxpbmVWaWV3LCBsaW5lTiwgZGltcyk7IH1cbiAgICBlbHNlIGlmICh0eXBlID09IFwiY2xhc3NcIikgeyB1cGRhdGVMaW5lQ2xhc3NlcyhjbSwgbGluZVZpZXcpOyB9XG4gICAgZWxzZSBpZiAodHlwZSA9PSBcIndpZGdldFwiKSB7IHVwZGF0ZUxpbmVXaWRnZXRzKGNtLCBsaW5lVmlldywgZGltcyk7IH1cbiAgfVxuICBsaW5lVmlldy5jaGFuZ2VzID0gbnVsbDtcbn1cblxuLy8gTGluZXMgd2l0aCBndXR0ZXIgZWxlbWVudHMsIHdpZGdldHMgb3IgYSBiYWNrZ3JvdW5kIGNsYXNzIG5lZWQgdG9cbi8vIGJlIHdyYXBwZWQsIGFuZCBoYXZlIHRoZSBleHRyYSBlbGVtZW50cyBhZGRlZCB0byB0aGUgd3JhcHBlciBkaXZcbmZ1bmN0aW9uIGVuc3VyZUxpbmVXcmFwcGVkKGxpbmVWaWV3KSB7XG4gIGlmIChsaW5lVmlldy5ub2RlID09IGxpbmVWaWV3LnRleHQpIHtcbiAgICBsaW5lVmlldy5ub2RlID0gZWx0KFwiZGl2XCIsIG51bGwsIG51bGwsIFwicG9zaXRpb246IHJlbGF0aXZlXCIpO1xuICAgIGlmIChsaW5lVmlldy50ZXh0LnBhcmVudE5vZGUpXG4gICAgICB7IGxpbmVWaWV3LnRleHQucGFyZW50Tm9kZS5yZXBsYWNlQ2hpbGQobGluZVZpZXcubm9kZSwgbGluZVZpZXcudGV4dCk7IH1cbiAgICBsaW5lVmlldy5ub2RlLmFwcGVuZENoaWxkKGxpbmVWaWV3LnRleHQpO1xuICAgIGlmIChpZSAmJiBpZV92ZXJzaW9uIDwgOCkgeyBsaW5lVmlldy5ub2RlLnN0eWxlLnpJbmRleCA9IDI7IH1cbiAgfVxuICByZXR1cm4gbGluZVZpZXcubm9kZVxufVxuXG5mdW5jdGlvbiB1cGRhdGVMaW5lQmFja2dyb3VuZChjbSwgbGluZVZpZXcpIHtcbiAgdmFyIGNscyA9IGxpbmVWaWV3LmJnQ2xhc3MgPyBsaW5lVmlldy5iZ0NsYXNzICsgXCIgXCIgKyAobGluZVZpZXcubGluZS5iZ0NsYXNzIHx8IFwiXCIpIDogbGluZVZpZXcubGluZS5iZ0NsYXNzO1xuICBpZiAoY2xzKSB7IGNscyArPSBcIiBDb2RlTWlycm9yLWxpbmViYWNrZ3JvdW5kXCI7IH1cbiAgaWYgKGxpbmVWaWV3LmJhY2tncm91bmQpIHtcbiAgICBpZiAoY2xzKSB7IGxpbmVWaWV3LmJhY2tncm91bmQuY2xhc3NOYW1lID0gY2xzOyB9XG4gICAgZWxzZSB7IGxpbmVWaWV3LmJhY2tncm91bmQucGFyZW50Tm9kZS5yZW1vdmVDaGlsZChsaW5lVmlldy5iYWNrZ3JvdW5kKTsgbGluZVZpZXcuYmFja2dyb3VuZCA9IG51bGw7IH1cbiAgfSBlbHNlIGlmIChjbHMpIHtcbiAgICB2YXIgd3JhcCA9IGVuc3VyZUxpbmVXcmFwcGVkKGxpbmVWaWV3KTtcbiAgICBsaW5lVmlldy5iYWNrZ3JvdW5kID0gd3JhcC5pbnNlcnRCZWZvcmUoZWx0KFwiZGl2XCIsIG51bGwsIGNscyksIHdyYXAuZmlyc3RDaGlsZCk7XG4gICAgY20uZGlzcGxheS5pbnB1dC5zZXRVbmVkaXRhYmxlKGxpbmVWaWV3LmJhY2tncm91bmQpO1xuICB9XG59XG5cbi8vIFdyYXBwZXIgYXJvdW5kIGJ1aWxkTGluZUNvbnRlbnQgd2hpY2ggd2lsbCByZXVzZSB0aGUgc3RydWN0dXJlXG4vLyBpbiBkaXNwbGF5LmV4dGVybmFsTWVhc3VyZWQgd2hlbiBwb3NzaWJsZS5cbmZ1bmN0aW9uIGdldExpbmVDb250ZW50KGNtLCBsaW5lVmlldykge1xuICB2YXIgZXh0ID0gY20uZGlzcGxheS5leHRlcm5hbE1lYXN1cmVkO1xuICBpZiAoZXh0ICYmIGV4dC5saW5lID09IGxpbmVWaWV3LmxpbmUpIHtcbiAgICBjbS5kaXNwbGF5LmV4dGVybmFsTWVhc3VyZWQgPSBudWxsO1xuICAgIGxpbmVWaWV3Lm1lYXN1cmUgPSBleHQubWVhc3VyZTtcbiAgICByZXR1cm4gZXh0LmJ1aWx0XG4gIH1cbiAgcmV0dXJuIGJ1aWxkTGluZUNvbnRlbnQoY20sIGxpbmVWaWV3KVxufVxuXG4vLyBSZWRyYXcgdGhlIGxpbmUncyB0ZXh0LiBJbnRlcmFjdHMgd2l0aCB0aGUgYmFja2dyb3VuZCBhbmQgdGV4dFxuLy8gY2xhc3NlcyBiZWNhdXNlIHRoZSBtb2RlIG1heSBvdXRwdXQgdG9rZW5zIHRoYXQgaW5mbHVlbmNlIHRoZXNlXG4vLyBjbGFzc2VzLlxuZnVuY3Rpb24gdXBkYXRlTGluZVRleHQoY20sIGxpbmVWaWV3KSB7XG4gIHZhciBjbHMgPSBsaW5lVmlldy50ZXh0LmNsYXNzTmFtZTtcbiAgdmFyIGJ1aWx0ID0gZ2V0TGluZUNvbnRlbnQoY20sIGxpbmVWaWV3KTtcbiAgaWYgKGxpbmVWaWV3LnRleHQgPT0gbGluZVZpZXcubm9kZSkgeyBsaW5lVmlldy5ub2RlID0gYnVpbHQucHJlOyB9XG4gIGxpbmVWaWV3LnRleHQucGFyZW50Tm9kZS5yZXBsYWNlQ2hpbGQoYnVpbHQucHJlLCBsaW5lVmlldy50ZXh0KTtcbiAgbGluZVZpZXcudGV4dCA9IGJ1aWx0LnByZTtcbiAgaWYgKGJ1aWx0LmJnQ2xhc3MgIT0gbGluZVZpZXcuYmdDbGFzcyB8fCBidWlsdC50ZXh0Q2xhc3MgIT0gbGluZVZpZXcudGV4dENsYXNzKSB7XG4gICAgbGluZVZpZXcuYmdDbGFzcyA9IGJ1aWx0LmJnQ2xhc3M7XG4gICAgbGluZVZpZXcudGV4dENsYXNzID0gYnVpbHQudGV4dENsYXNzO1xuICAgIHVwZGF0ZUxpbmVDbGFzc2VzKGNtLCBsaW5lVmlldyk7XG4gIH0gZWxzZSBpZiAoY2xzKSB7XG4gICAgbGluZVZpZXcudGV4dC5jbGFzc05hbWUgPSBjbHM7XG4gIH1cbn1cblxuZnVuY3Rpb24gdXBkYXRlTGluZUNsYXNzZXMoY20sIGxpbmVWaWV3KSB7XG4gIHVwZGF0ZUxpbmVCYWNrZ3JvdW5kKGNtLCBsaW5lVmlldyk7XG4gIGlmIChsaW5lVmlldy5saW5lLndyYXBDbGFzcylcbiAgICB7IGVuc3VyZUxpbmVXcmFwcGVkKGxpbmVWaWV3KS5jbGFzc05hbWUgPSBsaW5lVmlldy5saW5lLndyYXBDbGFzczsgfVxuICBlbHNlIGlmIChsaW5lVmlldy5ub2RlICE9IGxpbmVWaWV3LnRleHQpXG4gICAgeyBsaW5lVmlldy5ub2RlLmNsYXNzTmFtZSA9IFwiXCI7IH1cbiAgdmFyIHRleHRDbGFzcyA9IGxpbmVWaWV3LnRleHRDbGFzcyA/IGxpbmVWaWV3LnRleHRDbGFzcyArIFwiIFwiICsgKGxpbmVWaWV3LmxpbmUudGV4dENsYXNzIHx8IFwiXCIpIDogbGluZVZpZXcubGluZS50ZXh0Q2xhc3M7XG4gIGxpbmVWaWV3LnRleHQuY2xhc3NOYW1lID0gdGV4dENsYXNzIHx8IFwiXCI7XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZUxpbmVHdXR0ZXIoY20sIGxpbmVWaWV3LCBsaW5lTiwgZGltcykge1xuICBpZiAobGluZVZpZXcuZ3V0dGVyKSB7XG4gICAgbGluZVZpZXcubm9kZS5yZW1vdmVDaGlsZChsaW5lVmlldy5ndXR0ZXIpO1xuICAgIGxpbmVWaWV3Lmd1dHRlciA9IG51bGw7XG4gIH1cbiAgaWYgKGxpbmVWaWV3Lmd1dHRlckJhY2tncm91bmQpIHtcbiAgICBsaW5lVmlldy5ub2RlLnJlbW92ZUNoaWxkKGxpbmVWaWV3Lmd1dHRlckJhY2tncm91bmQpO1xuICAgIGxpbmVWaWV3Lmd1dHRlckJhY2tncm91bmQgPSBudWxsO1xuICB9XG4gIGlmIChsaW5lVmlldy5saW5lLmd1dHRlckNsYXNzKSB7XG4gICAgdmFyIHdyYXAgPSBlbnN1cmVMaW5lV3JhcHBlZChsaW5lVmlldyk7XG4gICAgbGluZVZpZXcuZ3V0dGVyQmFja2dyb3VuZCA9IGVsdChcImRpdlwiLCBudWxsLCBcIkNvZGVNaXJyb3ItZ3V0dGVyLWJhY2tncm91bmQgXCIgKyBsaW5lVmlldy5saW5lLmd1dHRlckNsYXNzLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKFwibGVmdDogXCIgKyAoY20ub3B0aW9ucy5maXhlZEd1dHRlciA/IGRpbXMuZml4ZWRQb3MgOiAtZGltcy5ndXR0ZXJUb3RhbFdpZHRoKSArIFwicHg7IHdpZHRoOiBcIiArIChkaW1zLmd1dHRlclRvdGFsV2lkdGgpICsgXCJweFwiKSk7XG4gICAgY20uZGlzcGxheS5pbnB1dC5zZXRVbmVkaXRhYmxlKGxpbmVWaWV3Lmd1dHRlckJhY2tncm91bmQpO1xuICAgIHdyYXAuaW5zZXJ0QmVmb3JlKGxpbmVWaWV3Lmd1dHRlckJhY2tncm91bmQsIGxpbmVWaWV3LnRleHQpO1xuICB9XG4gIHZhciBtYXJrZXJzID0gbGluZVZpZXcubGluZS5ndXR0ZXJNYXJrZXJzO1xuICBpZiAoY20ub3B0aW9ucy5saW5lTnVtYmVycyB8fCBtYXJrZXJzKSB7XG4gICAgdmFyIHdyYXAkMSA9IGVuc3VyZUxpbmVXcmFwcGVkKGxpbmVWaWV3KTtcbiAgICB2YXIgZ3V0dGVyV3JhcCA9IGxpbmVWaWV3Lmd1dHRlciA9IGVsdChcImRpdlwiLCBudWxsLCBcIkNvZGVNaXJyb3ItZ3V0dGVyLXdyYXBwZXJcIiwgKFwibGVmdDogXCIgKyAoY20ub3B0aW9ucy5maXhlZEd1dHRlciA/IGRpbXMuZml4ZWRQb3MgOiAtZGltcy5ndXR0ZXJUb3RhbFdpZHRoKSArIFwicHhcIikpO1xuICAgIGNtLmRpc3BsYXkuaW5wdXQuc2V0VW5lZGl0YWJsZShndXR0ZXJXcmFwKTtcbiAgICB3cmFwJDEuaW5zZXJ0QmVmb3JlKGd1dHRlcldyYXAsIGxpbmVWaWV3LnRleHQpO1xuICAgIGlmIChsaW5lVmlldy5saW5lLmd1dHRlckNsYXNzKVxuICAgICAgeyBndXR0ZXJXcmFwLmNsYXNzTmFtZSArPSBcIiBcIiArIGxpbmVWaWV3LmxpbmUuZ3V0dGVyQ2xhc3M7IH1cbiAgICBpZiAoY20ub3B0aW9ucy5saW5lTnVtYmVycyAmJiAoIW1hcmtlcnMgfHwgIW1hcmtlcnNbXCJDb2RlTWlycm9yLWxpbmVudW1iZXJzXCJdKSlcbiAgICAgIHsgbGluZVZpZXcubGluZU51bWJlciA9IGd1dHRlcldyYXAuYXBwZW5kQ2hpbGQoXG4gICAgICAgIGVsdChcImRpdlwiLCBsaW5lTnVtYmVyRm9yKGNtLm9wdGlvbnMsIGxpbmVOKSxcbiAgICAgICAgICAgIFwiQ29kZU1pcnJvci1saW5lbnVtYmVyIENvZGVNaXJyb3ItZ3V0dGVyLWVsdFwiLFxuICAgICAgICAgICAgKFwibGVmdDogXCIgKyAoZGltcy5ndXR0ZXJMZWZ0W1wiQ29kZU1pcnJvci1saW5lbnVtYmVyc1wiXSkgKyBcInB4OyB3aWR0aDogXCIgKyAoY20uZGlzcGxheS5saW5lTnVtSW5uZXJXaWR0aCkgKyBcInB4XCIpKSk7IH1cbiAgICBpZiAobWFya2VycykgeyBmb3IgKHZhciBrID0gMDsgayA8IGNtLm9wdGlvbnMuZ3V0dGVycy5sZW5ndGg7ICsraykge1xuICAgICAgdmFyIGlkID0gY20ub3B0aW9ucy5ndXR0ZXJzW2tdLCBmb3VuZCA9IG1hcmtlcnMuaGFzT3duUHJvcGVydHkoaWQpICYmIG1hcmtlcnNbaWRdO1xuICAgICAgaWYgKGZvdW5kKVxuICAgICAgICB7IGd1dHRlcldyYXAuYXBwZW5kQ2hpbGQoZWx0KFwiZGl2XCIsIFtmb3VuZF0sIFwiQ29kZU1pcnJvci1ndXR0ZXItZWx0XCIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIChcImxlZnQ6IFwiICsgKGRpbXMuZ3V0dGVyTGVmdFtpZF0pICsgXCJweDsgd2lkdGg6IFwiICsgKGRpbXMuZ3V0dGVyV2lkdGhbaWRdKSArIFwicHhcIikpKTsgfVxuICAgIH0gfVxuICB9XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZUxpbmVXaWRnZXRzKGNtLCBsaW5lVmlldywgZGltcykge1xuICBpZiAobGluZVZpZXcuYWxpZ25hYmxlKSB7IGxpbmVWaWV3LmFsaWduYWJsZSA9IG51bGw7IH1cbiAgZm9yICh2YXIgbm9kZSA9IGxpbmVWaWV3Lm5vZGUuZmlyc3RDaGlsZCwgbmV4dCA9ICh2b2lkIDApOyBub2RlOyBub2RlID0gbmV4dCkge1xuICAgIG5leHQgPSBub2RlLm5leHRTaWJsaW5nO1xuICAgIGlmIChub2RlLmNsYXNzTmFtZSA9PSBcIkNvZGVNaXJyb3ItbGluZXdpZGdldFwiKVxuICAgICAgeyBsaW5lVmlldy5ub2RlLnJlbW92ZUNoaWxkKG5vZGUpOyB9XG4gIH1cbiAgaW5zZXJ0TGluZVdpZGdldHMoY20sIGxpbmVWaWV3LCBkaW1zKTtcbn1cblxuLy8gQnVpbGQgYSBsaW5lJ3MgRE9NIHJlcHJlc2VudGF0aW9uIGZyb20gc2NyYXRjaFxuZnVuY3Rpb24gYnVpbGRMaW5lRWxlbWVudChjbSwgbGluZVZpZXcsIGxpbmVOLCBkaW1zKSB7XG4gIHZhciBidWlsdCA9IGdldExpbmVDb250ZW50KGNtLCBsaW5lVmlldyk7XG4gIGxpbmVWaWV3LnRleHQgPSBsaW5lVmlldy5ub2RlID0gYnVpbHQucHJlO1xuICBpZiAoYnVpbHQuYmdDbGFzcykgeyBsaW5lVmlldy5iZ0NsYXNzID0gYnVpbHQuYmdDbGFzczsgfVxuICBpZiAoYnVpbHQudGV4dENsYXNzKSB7IGxpbmVWaWV3LnRleHRDbGFzcyA9IGJ1aWx0LnRleHRDbGFzczsgfVxuXG4gIHVwZGF0ZUxpbmVDbGFzc2VzKGNtLCBsaW5lVmlldyk7XG4gIHVwZGF0ZUxpbmVHdXR0ZXIoY20sIGxpbmVWaWV3LCBsaW5lTiwgZGltcyk7XG4gIGluc2VydExpbmVXaWRnZXRzKGNtLCBsaW5lVmlldywgZGltcyk7XG4gIHJldHVybiBsaW5lVmlldy5ub2RlXG59XG5cbi8vIEEgbGluZVZpZXcgbWF5IGNvbnRhaW4gbXVsdGlwbGUgbG9naWNhbCBsaW5lcyAod2hlbiBtZXJnZWQgYnlcbi8vIGNvbGxhcHNlZCBzcGFucykuIFRoZSB3aWRnZXRzIGZvciBhbGwgb2YgdGhlbSBuZWVkIHRvIGJlIGRyYXduLlxuZnVuY3Rpb24gaW5zZXJ0TGluZVdpZGdldHMoY20sIGxpbmVWaWV3LCBkaW1zKSB7XG4gIGluc2VydExpbmVXaWRnZXRzRm9yKGNtLCBsaW5lVmlldy5saW5lLCBsaW5lVmlldywgZGltcywgdHJ1ZSk7XG4gIGlmIChsaW5lVmlldy5yZXN0KSB7IGZvciAodmFyIGkgPSAwOyBpIDwgbGluZVZpZXcucmVzdC5sZW5ndGg7IGkrKylcbiAgICB7IGluc2VydExpbmVXaWRnZXRzRm9yKGNtLCBsaW5lVmlldy5yZXN0W2ldLCBsaW5lVmlldywgZGltcywgZmFsc2UpOyB9IH1cbn1cblxuZnVuY3Rpb24gaW5zZXJ0TGluZVdpZGdldHNGb3IoY20sIGxpbmUsIGxpbmVWaWV3LCBkaW1zLCBhbGxvd0Fib3ZlKSB7XG4gIGlmICghbGluZS53aWRnZXRzKSB7IHJldHVybiB9XG4gIHZhciB3cmFwID0gZW5zdXJlTGluZVdyYXBwZWQobGluZVZpZXcpO1xuICBmb3IgKHZhciBpID0gMCwgd3MgPSBsaW5lLndpZGdldHM7IGkgPCB3cy5sZW5ndGg7ICsraSkge1xuICAgIHZhciB3aWRnZXQgPSB3c1tpXSwgbm9kZSA9IGVsdChcImRpdlwiLCBbd2lkZ2V0Lm5vZGVdLCBcIkNvZGVNaXJyb3ItbGluZXdpZGdldFwiKTtcbiAgICBpZiAoIXdpZGdldC5oYW5kbGVNb3VzZUV2ZW50cykgeyBub2RlLnNldEF0dHJpYnV0ZShcImNtLWlnbm9yZS1ldmVudHNcIiwgXCJ0cnVlXCIpOyB9XG4gICAgcG9zaXRpb25MaW5lV2lkZ2V0KHdpZGdldCwgbm9kZSwgbGluZVZpZXcsIGRpbXMpO1xuICAgIGNtLmRpc3BsYXkuaW5wdXQuc2V0VW5lZGl0YWJsZShub2RlKTtcbiAgICBpZiAoYWxsb3dBYm92ZSAmJiB3aWRnZXQuYWJvdmUpXG4gICAgICB7IHdyYXAuaW5zZXJ0QmVmb3JlKG5vZGUsIGxpbmVWaWV3Lmd1dHRlciB8fCBsaW5lVmlldy50ZXh0KTsgfVxuICAgIGVsc2VcbiAgICAgIHsgd3JhcC5hcHBlbmRDaGlsZChub2RlKTsgfVxuICAgIHNpZ25hbExhdGVyKHdpZGdldCwgXCJyZWRyYXdcIik7XG4gIH1cbn1cblxuZnVuY3Rpb24gcG9zaXRpb25MaW5lV2lkZ2V0KHdpZGdldCwgbm9kZSwgbGluZVZpZXcsIGRpbXMpIHtcbiAgaWYgKHdpZGdldC5ub0hTY3JvbGwpIHtcbiAgICAobGluZVZpZXcuYWxpZ25hYmxlIHx8IChsaW5lVmlldy5hbGlnbmFibGUgPSBbXSkpLnB1c2gobm9kZSk7XG4gICAgdmFyIHdpZHRoID0gZGltcy53cmFwcGVyV2lkdGg7XG4gICAgbm9kZS5zdHlsZS5sZWZ0ID0gZGltcy5maXhlZFBvcyArIFwicHhcIjtcbiAgICBpZiAoIXdpZGdldC5jb3Zlckd1dHRlcikge1xuICAgICAgd2lkdGggLT0gZGltcy5ndXR0ZXJUb3RhbFdpZHRoO1xuICAgICAgbm9kZS5zdHlsZS5wYWRkaW5nTGVmdCA9IGRpbXMuZ3V0dGVyVG90YWxXaWR0aCArIFwicHhcIjtcbiAgICB9XG4gICAgbm9kZS5zdHlsZS53aWR0aCA9IHdpZHRoICsgXCJweFwiO1xuICB9XG4gIGlmICh3aWRnZXQuY292ZXJHdXR0ZXIpIHtcbiAgICBub2RlLnN0eWxlLnpJbmRleCA9IDU7XG4gICAgbm9kZS5zdHlsZS5wb3NpdGlvbiA9IFwicmVsYXRpdmVcIjtcbiAgICBpZiAoIXdpZGdldC5ub0hTY3JvbGwpIHsgbm9kZS5zdHlsZS5tYXJnaW5MZWZ0ID0gLWRpbXMuZ3V0dGVyVG90YWxXaWR0aCArIFwicHhcIjsgfVxuICB9XG59XG5cbmZ1bmN0aW9uIHdpZGdldEhlaWdodCh3aWRnZXQpIHtcbiAgaWYgKHdpZGdldC5oZWlnaHQgIT0gbnVsbCkgeyByZXR1cm4gd2lkZ2V0LmhlaWdodCB9XG4gIHZhciBjbSA9IHdpZGdldC5kb2MuY207XG4gIGlmICghY20pIHsgcmV0dXJuIDAgfVxuICBpZiAoIWNvbnRhaW5zKGRvY3VtZW50LmJvZHksIHdpZGdldC5ub2RlKSkge1xuICAgIHZhciBwYXJlbnRTdHlsZSA9IFwicG9zaXRpb246IHJlbGF0aXZlO1wiO1xuICAgIGlmICh3aWRnZXQuY292ZXJHdXR0ZXIpXG4gICAgICB7IHBhcmVudFN0eWxlICs9IFwibWFyZ2luLWxlZnQ6IC1cIiArIGNtLmRpc3BsYXkuZ3V0dGVycy5vZmZzZXRXaWR0aCArIFwicHg7XCI7IH1cbiAgICBpZiAod2lkZ2V0Lm5vSFNjcm9sbClcbiAgICAgIHsgcGFyZW50U3R5bGUgKz0gXCJ3aWR0aDogXCIgKyBjbS5kaXNwbGF5LndyYXBwZXIuY2xpZW50V2lkdGggKyBcInB4O1wiOyB9XG4gICAgcmVtb3ZlQ2hpbGRyZW5BbmRBZGQoY20uZGlzcGxheS5tZWFzdXJlLCBlbHQoXCJkaXZcIiwgW3dpZGdldC5ub2RlXSwgbnVsbCwgcGFyZW50U3R5bGUpKTtcbiAgfVxuICByZXR1cm4gd2lkZ2V0LmhlaWdodCA9IHdpZGdldC5ub2RlLnBhcmVudE5vZGUub2Zmc2V0SGVpZ2h0XG59XG5cbi8vIFJldHVybiB0cnVlIHdoZW4gdGhlIGdpdmVuIG1vdXNlIGV2ZW50IGhhcHBlbmVkIGluIGEgd2lkZ2V0XG5mdW5jdGlvbiBldmVudEluV2lkZ2V0KGRpc3BsYXksIGUpIHtcbiAgZm9yICh2YXIgbiA9IGVfdGFyZ2V0KGUpOyBuICE9IGRpc3BsYXkud3JhcHBlcjsgbiA9IG4ucGFyZW50Tm9kZSkge1xuICAgIGlmICghbiB8fCAobi5ub2RlVHlwZSA9PSAxICYmIG4uZ2V0QXR0cmlidXRlKFwiY20taWdub3JlLWV2ZW50c1wiKSA9PSBcInRydWVcIikgfHxcbiAgICAgICAgKG4ucGFyZW50Tm9kZSA9PSBkaXNwbGF5LnNpemVyICYmIG4gIT0gZGlzcGxheS5tb3ZlcikpXG4gICAgICB7IHJldHVybiB0cnVlIH1cbiAgfVxufVxuXG4vLyBQT1NJVElPTiBNRUFTVVJFTUVOVFxuXG5mdW5jdGlvbiBwYWRkaW5nVG9wKGRpc3BsYXkpIHtyZXR1cm4gZGlzcGxheS5saW5lU3BhY2Uub2Zmc2V0VG9wfVxuZnVuY3Rpb24gcGFkZGluZ1ZlcnQoZGlzcGxheSkge3JldHVybiBkaXNwbGF5Lm1vdmVyLm9mZnNldEhlaWdodCAtIGRpc3BsYXkubGluZVNwYWNlLm9mZnNldEhlaWdodH1cbmZ1bmN0aW9uIHBhZGRpbmdIKGRpc3BsYXkpIHtcbiAgaWYgKGRpc3BsYXkuY2FjaGVkUGFkZGluZ0gpIHsgcmV0dXJuIGRpc3BsYXkuY2FjaGVkUGFkZGluZ0ggfVxuICB2YXIgZSA9IHJlbW92ZUNoaWxkcmVuQW5kQWRkKGRpc3BsYXkubWVhc3VyZSwgZWx0KFwicHJlXCIsIFwieFwiKSk7XG4gIHZhciBzdHlsZSA9IHdpbmRvdy5nZXRDb21wdXRlZFN0eWxlID8gd2luZG93LmdldENvbXB1dGVkU3R5bGUoZSkgOiBlLmN1cnJlbnRTdHlsZTtcbiAgdmFyIGRhdGEgPSB7bGVmdDogcGFyc2VJbnQoc3R5bGUucGFkZGluZ0xlZnQpLCByaWdodDogcGFyc2VJbnQoc3R5bGUucGFkZGluZ1JpZ2h0KX07XG4gIGlmICghaXNOYU4oZGF0YS5sZWZ0KSAmJiAhaXNOYU4oZGF0YS5yaWdodCkpIHsgZGlzcGxheS5jYWNoZWRQYWRkaW5nSCA9IGRhdGE7IH1cbiAgcmV0dXJuIGRhdGFcbn1cblxuZnVuY3Rpb24gc2Nyb2xsR2FwKGNtKSB7IHJldHVybiBzY3JvbGxlckdhcCAtIGNtLmRpc3BsYXkubmF0aXZlQmFyV2lkdGggfVxuZnVuY3Rpb24gZGlzcGxheVdpZHRoKGNtKSB7XG4gIHJldHVybiBjbS5kaXNwbGF5LnNjcm9sbGVyLmNsaWVudFdpZHRoIC0gc2Nyb2xsR2FwKGNtKSAtIGNtLmRpc3BsYXkuYmFyV2lkdGhcbn1cbmZ1bmN0aW9uIGRpc3BsYXlIZWlnaHQoY20pIHtcbiAgcmV0dXJuIGNtLmRpc3BsYXkuc2Nyb2xsZXIuY2xpZW50SGVpZ2h0IC0gc2Nyb2xsR2FwKGNtKSAtIGNtLmRpc3BsYXkuYmFySGVpZ2h0XG59XG5cbi8vIEVuc3VyZSB0aGUgbGluZVZpZXcud3JhcHBpbmcuaGVpZ2h0cyBhcnJheSBpcyBwb3B1bGF0ZWQuIFRoaXMgaXNcbi8vIGFuIGFycmF5IG9mIGJvdHRvbSBvZmZzZXRzIGZvciB0aGUgbGluZXMgdGhhdCBtYWtlIHVwIGEgZHJhd25cbi8vIGxpbmUuIFdoZW4gbGluZVdyYXBwaW5nIGlzIG9uLCB0aGVyZSBtaWdodCBiZSBtb3JlIHRoYW4gb25lXG4vLyBoZWlnaHQuXG5mdW5jdGlvbiBlbnN1cmVMaW5lSGVpZ2h0cyhjbSwgbGluZVZpZXcsIHJlY3QpIHtcbiAgdmFyIHdyYXBwaW5nID0gY20ub3B0aW9ucy5saW5lV3JhcHBpbmc7XG4gIHZhciBjdXJXaWR0aCA9IHdyYXBwaW5nICYmIGRpc3BsYXlXaWR0aChjbSk7XG4gIGlmICghbGluZVZpZXcubWVhc3VyZS5oZWlnaHRzIHx8IHdyYXBwaW5nICYmIGxpbmVWaWV3Lm1lYXN1cmUud2lkdGggIT0gY3VyV2lkdGgpIHtcbiAgICB2YXIgaGVpZ2h0cyA9IGxpbmVWaWV3Lm1lYXN1cmUuaGVpZ2h0cyA9IFtdO1xuICAgIGlmICh3cmFwcGluZykge1xuICAgICAgbGluZVZpZXcubWVhc3VyZS53aWR0aCA9IGN1cldpZHRoO1xuICAgICAgdmFyIHJlY3RzID0gbGluZVZpZXcudGV4dC5maXJzdENoaWxkLmdldENsaWVudFJlY3RzKCk7XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHJlY3RzLmxlbmd0aCAtIDE7IGkrKykge1xuICAgICAgICB2YXIgY3VyID0gcmVjdHNbaV0sIG5leHQgPSByZWN0c1tpICsgMV07XG4gICAgICAgIGlmIChNYXRoLmFicyhjdXIuYm90dG9tIC0gbmV4dC5ib3R0b20pID4gMilcbiAgICAgICAgICB7IGhlaWdodHMucHVzaCgoY3VyLmJvdHRvbSArIG5leHQudG9wKSAvIDIgLSByZWN0LnRvcCk7IH1cbiAgICAgIH1cbiAgICB9XG4gICAgaGVpZ2h0cy5wdXNoKHJlY3QuYm90dG9tIC0gcmVjdC50b3ApO1xuICB9XG59XG5cbi8vIEZpbmQgYSBsaW5lIG1hcCAobWFwcGluZyBjaGFyYWN0ZXIgb2Zmc2V0cyB0byB0ZXh0IG5vZGVzKSBhbmQgYVxuLy8gbWVhc3VyZW1lbnQgY2FjaGUgZm9yIHRoZSBnaXZlbiBsaW5lIG51bWJlci4gKEEgbGluZSB2aWV3IG1pZ2h0XG4vLyBjb250YWluIG11bHRpcGxlIGxpbmVzIHdoZW4gY29sbGFwc2VkIHJhbmdlcyBhcmUgcHJlc2VudC4pXG5mdW5jdGlvbiBtYXBGcm9tTGluZVZpZXcobGluZVZpZXcsIGxpbmUsIGxpbmVOKSB7XG4gIGlmIChsaW5lVmlldy5saW5lID09IGxpbmUpXG4gICAgeyByZXR1cm4ge21hcDogbGluZVZpZXcubWVhc3VyZS5tYXAsIGNhY2hlOiBsaW5lVmlldy5tZWFzdXJlLmNhY2hlfSB9XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGluZVZpZXcucmVzdC5sZW5ndGg7IGkrKylcbiAgICB7IGlmIChsaW5lVmlldy5yZXN0W2ldID09IGxpbmUpXG4gICAgICB7IHJldHVybiB7bWFwOiBsaW5lVmlldy5tZWFzdXJlLm1hcHNbaV0sIGNhY2hlOiBsaW5lVmlldy5tZWFzdXJlLmNhY2hlc1tpXX0gfSB9XG4gIGZvciAodmFyIGkkMSA9IDA7IGkkMSA8IGxpbmVWaWV3LnJlc3QubGVuZ3RoOyBpJDErKylcbiAgICB7IGlmIChsaW5lTm8obGluZVZpZXcucmVzdFtpJDFdKSA+IGxpbmVOKVxuICAgICAgeyByZXR1cm4ge21hcDogbGluZVZpZXcubWVhc3VyZS5tYXBzW2kkMV0sIGNhY2hlOiBsaW5lVmlldy5tZWFzdXJlLmNhY2hlc1tpJDFdLCBiZWZvcmU6IHRydWV9IH0gfVxufVxuXG4vLyBSZW5kZXIgYSBsaW5lIGludG8gdGhlIGhpZGRlbiBub2RlIGRpc3BsYXkuZXh0ZXJuYWxNZWFzdXJlZC4gVXNlZFxuLy8gd2hlbiBtZWFzdXJlbWVudCBpcyBuZWVkZWQgZm9yIGEgbGluZSB0aGF0J3Mgbm90IGluIHRoZSB2aWV3cG9ydC5cbmZ1bmN0aW9uIHVwZGF0ZUV4dGVybmFsTWVhc3VyZW1lbnQoY20sIGxpbmUpIHtcbiAgbGluZSA9IHZpc3VhbExpbmUobGluZSk7XG4gIHZhciBsaW5lTiA9IGxpbmVObyhsaW5lKTtcbiAgdmFyIHZpZXcgPSBjbS5kaXNwbGF5LmV4dGVybmFsTWVhc3VyZWQgPSBuZXcgTGluZVZpZXcoY20uZG9jLCBsaW5lLCBsaW5lTik7XG4gIHZpZXcubGluZU4gPSBsaW5lTjtcbiAgdmFyIGJ1aWx0ID0gdmlldy5idWlsdCA9IGJ1aWxkTGluZUNvbnRlbnQoY20sIHZpZXcpO1xuICB2aWV3LnRleHQgPSBidWlsdC5wcmU7XG4gIHJlbW92ZUNoaWxkcmVuQW5kQWRkKGNtLmRpc3BsYXkubGluZU1lYXN1cmUsIGJ1aWx0LnByZSk7XG4gIHJldHVybiB2aWV3XG59XG5cbi8vIEdldCBhIHt0b3AsIGJvdHRvbSwgbGVmdCwgcmlnaHR9IGJveCAoaW4gbGluZS1sb2NhbCBjb29yZGluYXRlcylcbi8vIGZvciBhIGdpdmVuIGNoYXJhY3Rlci5cbmZ1bmN0aW9uIG1lYXN1cmVDaGFyKGNtLCBsaW5lLCBjaCwgYmlhcykge1xuICByZXR1cm4gbWVhc3VyZUNoYXJQcmVwYXJlZChjbSwgcHJlcGFyZU1lYXN1cmVGb3JMaW5lKGNtLCBsaW5lKSwgY2gsIGJpYXMpXG59XG5cbi8vIEZpbmQgYSBsaW5lIHZpZXcgdGhhdCBjb3JyZXNwb25kcyB0byB0aGUgZ2l2ZW4gbGluZSBudW1iZXIuXG5mdW5jdGlvbiBmaW5kVmlld0ZvckxpbmUoY20sIGxpbmVOKSB7XG4gIGlmIChsaW5lTiA+PSBjbS5kaXNwbGF5LnZpZXdGcm9tICYmIGxpbmVOIDwgY20uZGlzcGxheS52aWV3VG8pXG4gICAgeyByZXR1cm4gY20uZGlzcGxheS52aWV3W2ZpbmRWaWV3SW5kZXgoY20sIGxpbmVOKV0gfVxuICB2YXIgZXh0ID0gY20uZGlzcGxheS5leHRlcm5hbE1lYXN1cmVkO1xuICBpZiAoZXh0ICYmIGxpbmVOID49IGV4dC5saW5lTiAmJiBsaW5lTiA8IGV4dC5saW5lTiArIGV4dC5zaXplKVxuICAgIHsgcmV0dXJuIGV4dCB9XG59XG5cbi8vIE1lYXN1cmVtZW50IGNhbiBiZSBzcGxpdCBpbiB0d28gc3RlcHMsIHRoZSBzZXQtdXAgd29yayB0aGF0XG4vLyBhcHBsaWVzIHRvIHRoZSB3aG9sZSBsaW5lLCBhbmQgdGhlIG1lYXN1cmVtZW50IG9mIHRoZSBhY3R1YWxcbi8vIGNoYXJhY3Rlci4gRnVuY3Rpb25zIGxpa2UgY29vcmRzQ2hhciwgdGhhdCBuZWVkIHRvIGRvIGEgbG90IG9mXG4vLyBtZWFzdXJlbWVudHMgaW4gYSByb3csIGNhbiB0aHVzIGVuc3VyZSB0aGF0IHRoZSBzZXQtdXAgd29yayBpc1xuLy8gb25seSBkb25lIG9uY2UuXG5mdW5jdGlvbiBwcmVwYXJlTWVhc3VyZUZvckxpbmUoY20sIGxpbmUpIHtcbiAgdmFyIGxpbmVOID0gbGluZU5vKGxpbmUpO1xuICB2YXIgdmlldyA9IGZpbmRWaWV3Rm9yTGluZShjbSwgbGluZU4pO1xuICBpZiAodmlldyAmJiAhdmlldy50ZXh0KSB7XG4gICAgdmlldyA9IG51bGw7XG4gIH0gZWxzZSBpZiAodmlldyAmJiB2aWV3LmNoYW5nZXMpIHtcbiAgICB1cGRhdGVMaW5lRm9yQ2hhbmdlcyhjbSwgdmlldywgbGluZU4sIGdldERpbWVuc2lvbnMoY20pKTtcbiAgICBjbS5jdXJPcC5mb3JjZVVwZGF0ZSA9IHRydWU7XG4gIH1cbiAgaWYgKCF2aWV3KVxuICAgIHsgdmlldyA9IHVwZGF0ZUV4dGVybmFsTWVhc3VyZW1lbnQoY20sIGxpbmUpOyB9XG5cbiAgdmFyIGluZm8gPSBtYXBGcm9tTGluZVZpZXcodmlldywgbGluZSwgbGluZU4pO1xuICByZXR1cm4ge1xuICAgIGxpbmU6IGxpbmUsIHZpZXc6IHZpZXcsIHJlY3Q6IG51bGwsXG4gICAgbWFwOiBpbmZvLm1hcCwgY2FjaGU6IGluZm8uY2FjaGUsIGJlZm9yZTogaW5mby5iZWZvcmUsXG4gICAgaGFzSGVpZ2h0czogZmFsc2VcbiAgfVxufVxuXG4vLyBHaXZlbiBhIHByZXBhcmVkIG1lYXN1cmVtZW50IG9iamVjdCwgbWVhc3VyZXMgdGhlIHBvc2l0aW9uIG9mIGFuXG4vLyBhY3R1YWwgY2hhcmFjdGVyIChvciBmZXRjaGVzIGl0IGZyb20gdGhlIGNhY2hlKS5cbmZ1bmN0aW9uIG1lYXN1cmVDaGFyUHJlcGFyZWQoY20sIHByZXBhcmVkLCBjaCwgYmlhcywgdmFySGVpZ2h0KSB7XG4gIGlmIChwcmVwYXJlZC5iZWZvcmUpIHsgY2ggPSAtMTsgfVxuICB2YXIga2V5ID0gY2ggKyAoYmlhcyB8fCBcIlwiKSwgZm91bmQ7XG4gIGlmIChwcmVwYXJlZC5jYWNoZS5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG4gICAgZm91bmQgPSBwcmVwYXJlZC5jYWNoZVtrZXldO1xuICB9IGVsc2Uge1xuICAgIGlmICghcHJlcGFyZWQucmVjdClcbiAgICAgIHsgcHJlcGFyZWQucmVjdCA9IHByZXBhcmVkLnZpZXcudGV4dC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTsgfVxuICAgIGlmICghcHJlcGFyZWQuaGFzSGVpZ2h0cykge1xuICAgICAgZW5zdXJlTGluZUhlaWdodHMoY20sIHByZXBhcmVkLnZpZXcsIHByZXBhcmVkLnJlY3QpO1xuICAgICAgcHJlcGFyZWQuaGFzSGVpZ2h0cyA9IHRydWU7XG4gICAgfVxuICAgIGZvdW5kID0gbWVhc3VyZUNoYXJJbm5lcihjbSwgcHJlcGFyZWQsIGNoLCBiaWFzKTtcbiAgICBpZiAoIWZvdW5kLmJvZ3VzKSB7IHByZXBhcmVkLmNhY2hlW2tleV0gPSBmb3VuZDsgfVxuICB9XG4gIHJldHVybiB7bGVmdDogZm91bmQubGVmdCwgcmlnaHQ6IGZvdW5kLnJpZ2h0LFxuICAgICAgICAgIHRvcDogdmFySGVpZ2h0ID8gZm91bmQucnRvcCA6IGZvdW5kLnRvcCxcbiAgICAgICAgICBib3R0b206IHZhckhlaWdodCA/IGZvdW5kLnJib3R0b20gOiBmb3VuZC5ib3R0b219XG59XG5cbnZhciBudWxsUmVjdCA9IHtsZWZ0OiAwLCByaWdodDogMCwgdG9wOiAwLCBib3R0b206IDB9O1xuXG5mdW5jdGlvbiBub2RlQW5kT2Zmc2V0SW5MaW5lTWFwKG1hcCQkMSwgY2gsIGJpYXMpIHtcbiAgdmFyIG5vZGUsIHN0YXJ0LCBlbmQsIGNvbGxhcHNlLCBtU3RhcnQsIG1FbmQ7XG4gIC8vIEZpcnN0LCBzZWFyY2ggdGhlIGxpbmUgbWFwIGZvciB0aGUgdGV4dCBub2RlIGNvcnJlc3BvbmRpbmcgdG8sXG4gIC8vIG9yIGNsb3Nlc3QgdG8sIHRoZSB0YXJnZXQgY2hhcmFjdGVyLlxuICBmb3IgKHZhciBpID0gMDsgaSA8IG1hcCQkMS5sZW5ndGg7IGkgKz0gMykge1xuICAgIG1TdGFydCA9IG1hcCQkMVtpXTtcbiAgICBtRW5kID0gbWFwJCQxW2kgKyAxXTtcbiAgICBpZiAoY2ggPCBtU3RhcnQpIHtcbiAgICAgIHN0YXJ0ID0gMDsgZW5kID0gMTtcbiAgICAgIGNvbGxhcHNlID0gXCJsZWZ0XCI7XG4gICAgfSBlbHNlIGlmIChjaCA8IG1FbmQpIHtcbiAgICAgIHN0YXJ0ID0gY2ggLSBtU3RhcnQ7XG4gICAgICBlbmQgPSBzdGFydCArIDE7XG4gICAgfSBlbHNlIGlmIChpID09IG1hcCQkMS5sZW5ndGggLSAzIHx8IGNoID09IG1FbmQgJiYgbWFwJCQxW2kgKyAzXSA+IGNoKSB7XG4gICAgICBlbmQgPSBtRW5kIC0gbVN0YXJ0O1xuICAgICAgc3RhcnQgPSBlbmQgLSAxO1xuICAgICAgaWYgKGNoID49IG1FbmQpIHsgY29sbGFwc2UgPSBcInJpZ2h0XCI7IH1cbiAgICB9XG4gICAgaWYgKHN0YXJ0ICE9IG51bGwpIHtcbiAgICAgIG5vZGUgPSBtYXAkJDFbaSArIDJdO1xuICAgICAgaWYgKG1TdGFydCA9PSBtRW5kICYmIGJpYXMgPT0gKG5vZGUuaW5zZXJ0TGVmdCA/IFwibGVmdFwiIDogXCJyaWdodFwiKSlcbiAgICAgICAgeyBjb2xsYXBzZSA9IGJpYXM7IH1cbiAgICAgIGlmIChiaWFzID09IFwibGVmdFwiICYmIHN0YXJ0ID09IDApXG4gICAgICAgIHsgd2hpbGUgKGkgJiYgbWFwJCQxW2kgLSAyXSA9PSBtYXAkJDFbaSAtIDNdICYmIG1hcCQkMVtpIC0gMV0uaW5zZXJ0TGVmdCkge1xuICAgICAgICAgIG5vZGUgPSBtYXAkJDFbKGkgLT0gMykgKyAyXTtcbiAgICAgICAgICBjb2xsYXBzZSA9IFwibGVmdFwiO1xuICAgICAgICB9IH1cbiAgICAgIGlmIChiaWFzID09IFwicmlnaHRcIiAmJiBzdGFydCA9PSBtRW5kIC0gbVN0YXJ0KVxuICAgICAgICB7IHdoaWxlIChpIDwgbWFwJCQxLmxlbmd0aCAtIDMgJiYgbWFwJCQxW2kgKyAzXSA9PSBtYXAkJDFbaSArIDRdICYmICFtYXAkJDFbaSArIDVdLmluc2VydExlZnQpIHtcbiAgICAgICAgICBub2RlID0gbWFwJCQxWyhpICs9IDMpICsgMl07XG4gICAgICAgICAgY29sbGFwc2UgPSBcInJpZ2h0XCI7XG4gICAgICAgIH0gfVxuICAgICAgYnJlYWtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHtub2RlOiBub2RlLCBzdGFydDogc3RhcnQsIGVuZDogZW5kLCBjb2xsYXBzZTogY29sbGFwc2UsIGNvdmVyU3RhcnQ6IG1TdGFydCwgY292ZXJFbmQ6IG1FbmR9XG59XG5cbmZ1bmN0aW9uIGdldFVzZWZ1bFJlY3QocmVjdHMsIGJpYXMpIHtcbiAgdmFyIHJlY3QgPSBudWxsUmVjdDtcbiAgaWYgKGJpYXMgPT0gXCJsZWZ0XCIpIHsgZm9yICh2YXIgaSA9IDA7IGkgPCByZWN0cy5sZW5ndGg7IGkrKykge1xuICAgIGlmICgocmVjdCA9IHJlY3RzW2ldKS5sZWZ0ICE9IHJlY3QucmlnaHQpIHsgYnJlYWsgfVxuICB9IH0gZWxzZSB7IGZvciAodmFyIGkkMSA9IHJlY3RzLmxlbmd0aCAtIDE7IGkkMSA+PSAwOyBpJDEtLSkge1xuICAgIGlmICgocmVjdCA9IHJlY3RzW2kkMV0pLmxlZnQgIT0gcmVjdC5yaWdodCkgeyBicmVhayB9XG4gIH0gfVxuICByZXR1cm4gcmVjdFxufVxuXG5mdW5jdGlvbiBtZWFzdXJlQ2hhcklubmVyKGNtLCBwcmVwYXJlZCwgY2gsIGJpYXMpIHtcbiAgdmFyIHBsYWNlID0gbm9kZUFuZE9mZnNldEluTGluZU1hcChwcmVwYXJlZC5tYXAsIGNoLCBiaWFzKTtcbiAgdmFyIG5vZGUgPSBwbGFjZS5ub2RlLCBzdGFydCA9IHBsYWNlLnN0YXJ0LCBlbmQgPSBwbGFjZS5lbmQsIGNvbGxhcHNlID0gcGxhY2UuY29sbGFwc2U7XG5cbiAgdmFyIHJlY3Q7XG4gIGlmIChub2RlLm5vZGVUeXBlID09IDMpIHsgLy8gSWYgaXQgaXMgYSB0ZXh0IG5vZGUsIHVzZSBhIHJhbmdlIHRvIHJldHJpZXZlIHRoZSBjb29yZGluYXRlcy5cbiAgICBmb3IgKHZhciBpJDEgPSAwOyBpJDEgPCA0OyBpJDErKykgeyAvLyBSZXRyeSBhIG1heGltdW0gb2YgNCB0aW1lcyB3aGVuIG5vbnNlbnNlIHJlY3RhbmdsZXMgYXJlIHJldHVybmVkXG4gICAgICB3aGlsZSAoc3RhcnQgJiYgaXNFeHRlbmRpbmdDaGFyKHByZXBhcmVkLmxpbmUudGV4dC5jaGFyQXQocGxhY2UuY292ZXJTdGFydCArIHN0YXJ0KSkpIHsgLS1zdGFydDsgfVxuICAgICAgd2hpbGUgKHBsYWNlLmNvdmVyU3RhcnQgKyBlbmQgPCBwbGFjZS5jb3ZlckVuZCAmJiBpc0V4dGVuZGluZ0NoYXIocHJlcGFyZWQubGluZS50ZXh0LmNoYXJBdChwbGFjZS5jb3ZlclN0YXJ0ICsgZW5kKSkpIHsgKytlbmQ7IH1cbiAgICAgIGlmIChpZSAmJiBpZV92ZXJzaW9uIDwgOSAmJiBzdGFydCA9PSAwICYmIGVuZCA9PSBwbGFjZS5jb3ZlckVuZCAtIHBsYWNlLmNvdmVyU3RhcnQpXG4gICAgICAgIHsgcmVjdCA9IG5vZGUucGFyZW50Tm9kZS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTsgfVxuICAgICAgZWxzZVxuICAgICAgICB7IHJlY3QgPSBnZXRVc2VmdWxSZWN0KHJhbmdlKG5vZGUsIHN0YXJ0LCBlbmQpLmdldENsaWVudFJlY3RzKCksIGJpYXMpOyB9XG4gICAgICBpZiAocmVjdC5sZWZ0IHx8IHJlY3QucmlnaHQgfHwgc3RhcnQgPT0gMCkgeyBicmVhayB9XG4gICAgICBlbmQgPSBzdGFydDtcbiAgICAgIHN0YXJ0ID0gc3RhcnQgLSAxO1xuICAgICAgY29sbGFwc2UgPSBcInJpZ2h0XCI7XG4gICAgfVxuICAgIGlmIChpZSAmJiBpZV92ZXJzaW9uIDwgMTEpIHsgcmVjdCA9IG1heWJlVXBkYXRlUmVjdEZvclpvb21pbmcoY20uZGlzcGxheS5tZWFzdXJlLCByZWN0KTsgfVxuICB9IGVsc2UgeyAvLyBJZiBpdCBpcyBhIHdpZGdldCwgc2ltcGx5IGdldCB0aGUgYm94IGZvciB0aGUgd2hvbGUgd2lkZ2V0LlxuICAgIGlmIChzdGFydCA+IDApIHsgY29sbGFwc2UgPSBiaWFzID0gXCJyaWdodFwiOyB9XG4gICAgdmFyIHJlY3RzO1xuICAgIGlmIChjbS5vcHRpb25zLmxpbmVXcmFwcGluZyAmJiAocmVjdHMgPSBub2RlLmdldENsaWVudFJlY3RzKCkpLmxlbmd0aCA+IDEpXG4gICAgICB7IHJlY3QgPSByZWN0c1tiaWFzID09IFwicmlnaHRcIiA/IHJlY3RzLmxlbmd0aCAtIDEgOiAwXTsgfVxuICAgIGVsc2VcbiAgICAgIHsgcmVjdCA9IG5vZGUuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7IH1cbiAgfVxuICBpZiAoaWUgJiYgaWVfdmVyc2lvbiA8IDkgJiYgIXN0YXJ0ICYmICghcmVjdCB8fCAhcmVjdC5sZWZ0ICYmICFyZWN0LnJpZ2h0KSkge1xuICAgIHZhciByU3BhbiA9IG5vZGUucGFyZW50Tm9kZS5nZXRDbGllbnRSZWN0cygpWzBdO1xuICAgIGlmIChyU3BhbilcbiAgICAgIHsgcmVjdCA9IHtsZWZ0OiByU3Bhbi5sZWZ0LCByaWdodDogclNwYW4ubGVmdCArIGNoYXJXaWR0aChjbS5kaXNwbGF5KSwgdG9wOiByU3Bhbi50b3AsIGJvdHRvbTogclNwYW4uYm90dG9tfTsgfVxuICAgIGVsc2VcbiAgICAgIHsgcmVjdCA9IG51bGxSZWN0OyB9XG4gIH1cblxuICB2YXIgcnRvcCA9IHJlY3QudG9wIC0gcHJlcGFyZWQucmVjdC50b3AsIHJib3QgPSByZWN0LmJvdHRvbSAtIHByZXBhcmVkLnJlY3QudG9wO1xuICB2YXIgbWlkID0gKHJ0b3AgKyByYm90KSAvIDI7XG4gIHZhciBoZWlnaHRzID0gcHJlcGFyZWQudmlldy5tZWFzdXJlLmhlaWdodHM7XG4gIHZhciBpID0gMDtcbiAgZm9yICg7IGkgPCBoZWlnaHRzLmxlbmd0aCAtIDE7IGkrKylcbiAgICB7IGlmIChtaWQgPCBoZWlnaHRzW2ldKSB7IGJyZWFrIH0gfVxuICB2YXIgdG9wID0gaSA/IGhlaWdodHNbaSAtIDFdIDogMCwgYm90ID0gaGVpZ2h0c1tpXTtcbiAgdmFyIHJlc3VsdCA9IHtsZWZ0OiAoY29sbGFwc2UgPT0gXCJyaWdodFwiID8gcmVjdC5yaWdodCA6IHJlY3QubGVmdCkgLSBwcmVwYXJlZC5yZWN0LmxlZnQsXG4gICAgICAgICAgICAgICAgcmlnaHQ6IChjb2xsYXBzZSA9PSBcImxlZnRcIiA/IHJlY3QubGVmdCA6IHJlY3QucmlnaHQpIC0gcHJlcGFyZWQucmVjdC5sZWZ0LFxuICAgICAgICAgICAgICAgIHRvcDogdG9wLCBib3R0b206IGJvdH07XG4gIGlmICghcmVjdC5sZWZ0ICYmICFyZWN0LnJpZ2h0KSB7IHJlc3VsdC5ib2d1cyA9IHRydWU7IH1cbiAgaWYgKCFjbS5vcHRpb25zLnNpbmdsZUN1cnNvckhlaWdodFBlckxpbmUpIHsgcmVzdWx0LnJ0b3AgPSBydG9wOyByZXN1bHQucmJvdHRvbSA9IHJib3Q7IH1cblxuICByZXR1cm4gcmVzdWx0XG59XG5cbi8vIFdvcmsgYXJvdW5kIHByb2JsZW0gd2l0aCBib3VuZGluZyBjbGllbnQgcmVjdHMgb24gcmFuZ2VzIGJlaW5nXG4vLyByZXR1cm5lZCBpbmNvcnJlY3RseSB3aGVuIHpvb21lZCBvbiBJRTEwIGFuZCBiZWxvdy5cbmZ1bmN0aW9uIG1heWJlVXBkYXRlUmVjdEZvclpvb21pbmcobWVhc3VyZSwgcmVjdCkge1xuICBpZiAoIXdpbmRvdy5zY3JlZW4gfHwgc2NyZWVuLmxvZ2ljYWxYRFBJID09IG51bGwgfHxcbiAgICAgIHNjcmVlbi5sb2dpY2FsWERQSSA9PSBzY3JlZW4uZGV2aWNlWERQSSB8fCAhaGFzQmFkWm9vbWVkUmVjdHMobWVhc3VyZSkpXG4gICAgeyByZXR1cm4gcmVjdCB9XG4gIHZhciBzY2FsZVggPSBzY3JlZW4ubG9naWNhbFhEUEkgLyBzY3JlZW4uZGV2aWNlWERQSTtcbiAgdmFyIHNjYWxlWSA9IHNjcmVlbi5sb2dpY2FsWURQSSAvIHNjcmVlbi5kZXZpY2VZRFBJO1xuICByZXR1cm4ge2xlZnQ6IHJlY3QubGVmdCAqIHNjYWxlWCwgcmlnaHQ6IHJlY3QucmlnaHQgKiBzY2FsZVgsXG4gICAgICAgICAgdG9wOiByZWN0LnRvcCAqIHNjYWxlWSwgYm90dG9tOiByZWN0LmJvdHRvbSAqIHNjYWxlWX1cbn1cblxuZnVuY3Rpb24gY2xlYXJMaW5lTWVhc3VyZW1lbnRDYWNoZUZvcihsaW5lVmlldykge1xuICBpZiAobGluZVZpZXcubWVhc3VyZSkge1xuICAgIGxpbmVWaWV3Lm1lYXN1cmUuY2FjaGUgPSB7fTtcbiAgICBsaW5lVmlldy5tZWFzdXJlLmhlaWdodHMgPSBudWxsO1xuICAgIGlmIChsaW5lVmlldy5yZXN0KSB7IGZvciAodmFyIGkgPSAwOyBpIDwgbGluZVZpZXcucmVzdC5sZW5ndGg7IGkrKylcbiAgICAgIHsgbGluZVZpZXcubWVhc3VyZS5jYWNoZXNbaV0gPSB7fTsgfSB9XG4gIH1cbn1cblxuZnVuY3Rpb24gY2xlYXJMaW5lTWVhc3VyZW1lbnRDYWNoZShjbSkge1xuICBjbS5kaXNwbGF5LmV4dGVybmFsTWVhc3VyZSA9IG51bGw7XG4gIHJlbW92ZUNoaWxkcmVuKGNtLmRpc3BsYXkubGluZU1lYXN1cmUpO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGNtLmRpc3BsYXkudmlldy5sZW5ndGg7IGkrKylcbiAgICB7IGNsZWFyTGluZU1lYXN1cmVtZW50Q2FjaGVGb3IoY20uZGlzcGxheS52aWV3W2ldKTsgfVxufVxuXG5mdW5jdGlvbiBjbGVhckNhY2hlcyhjbSkge1xuICBjbGVhckxpbmVNZWFzdXJlbWVudENhY2hlKGNtKTtcbiAgY20uZGlzcGxheS5jYWNoZWRDaGFyV2lkdGggPSBjbS5kaXNwbGF5LmNhY2hlZFRleHRIZWlnaHQgPSBjbS5kaXNwbGF5LmNhY2hlZFBhZGRpbmdIID0gbnVsbDtcbiAgaWYgKCFjbS5vcHRpb25zLmxpbmVXcmFwcGluZykgeyBjbS5kaXNwbGF5Lm1heExpbmVDaGFuZ2VkID0gdHJ1ZTsgfVxuICBjbS5kaXNwbGF5LmxpbmVOdW1DaGFycyA9IG51bGw7XG59XG5cbmZ1bmN0aW9uIHBhZ2VTY3JvbGxYKCkge1xuICAvLyBXb3JrIGFyb3VuZCBodHRwczovL2J1Z3MuY2hyb21pdW0ub3JnL3AvY2hyb21pdW0vaXNzdWVzL2RldGFpbD9pZD00ODkyMDZcbiAgLy8gd2hpY2ggY2F1c2VzIHBhZ2VfT2Zmc2V0IGFuZCBib3VuZGluZyBjbGllbnQgcmVjdHMgdG8gdXNlXG4gIC8vIGRpZmZlcmVudCByZWZlcmVuY2Ugdmlld3BvcnRzIGFuZCBpbnZhbGlkYXRlIG91ciBjYWxjdWxhdGlvbnMuXG4gIGlmIChjaHJvbWUgJiYgYW5kcm9pZCkgeyByZXR1cm4gLShkb2N1bWVudC5ib2R5LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpLmxlZnQgLSBwYXJzZUludChnZXRDb21wdXRlZFN0eWxlKGRvY3VtZW50LmJvZHkpLm1hcmdpbkxlZnQpKSB9XG4gIHJldHVybiB3aW5kb3cucGFnZVhPZmZzZXQgfHwgKGRvY3VtZW50LmRvY3VtZW50RWxlbWVudCB8fCBkb2N1bWVudC5ib2R5KS5zY3JvbGxMZWZ0XG59XG5mdW5jdGlvbiBwYWdlU2Nyb2xsWSgpIHtcbiAgaWYgKGNocm9tZSAmJiBhbmRyb2lkKSB7IHJldHVybiAtKGRvY3VtZW50LmJvZHkuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCkudG9wIC0gcGFyc2VJbnQoZ2V0Q29tcHV0ZWRTdHlsZShkb2N1bWVudC5ib2R5KS5tYXJnaW5Ub3ApKSB9XG4gIHJldHVybiB3aW5kb3cucGFnZVlPZmZzZXQgfHwgKGRvY3VtZW50LmRvY3VtZW50RWxlbWVudCB8fCBkb2N1bWVudC5ib2R5KS5zY3JvbGxUb3Bcbn1cblxuZnVuY3Rpb24gd2lkZ2V0VG9wSGVpZ2h0KGxpbmVPYmopIHtcbiAgdmFyIGhlaWdodCA9IDA7XG4gIGlmIChsaW5lT2JqLndpZGdldHMpIHsgZm9yICh2YXIgaSA9IDA7IGkgPCBsaW5lT2JqLndpZGdldHMubGVuZ3RoOyArK2kpIHsgaWYgKGxpbmVPYmoud2lkZ2V0c1tpXS5hYm92ZSlcbiAgICB7IGhlaWdodCArPSB3aWRnZXRIZWlnaHQobGluZU9iai53aWRnZXRzW2ldKTsgfSB9IH1cbiAgcmV0dXJuIGhlaWdodFxufVxuXG4vLyBDb252ZXJ0cyBhIHt0b3AsIGJvdHRvbSwgbGVmdCwgcmlnaHR9IGJveCBmcm9tIGxpbmUtbG9jYWxcbi8vIGNvb3JkaW5hdGVzIGludG8gYW5vdGhlciBjb29yZGluYXRlIHN5c3RlbS4gQ29udGV4dCBtYXkgYmUgb25lIG9mXG4vLyBcImxpbmVcIiwgXCJkaXZcIiAoZGlzcGxheS5saW5lRGl2KSwgXCJsb2NhbFwiLi9udWxsIChlZGl0b3IpLCBcIndpbmRvd1wiLFxuLy8gb3IgXCJwYWdlXCIuXG5mdW5jdGlvbiBpbnRvQ29vcmRTeXN0ZW0oY20sIGxpbmVPYmosIHJlY3QsIGNvbnRleHQsIGluY2x1ZGVXaWRnZXRzKSB7XG4gIGlmICghaW5jbHVkZVdpZGdldHMpIHtcbiAgICB2YXIgaGVpZ2h0ID0gd2lkZ2V0VG9wSGVpZ2h0KGxpbmVPYmopO1xuICAgIHJlY3QudG9wICs9IGhlaWdodDsgcmVjdC5ib3R0b20gKz0gaGVpZ2h0O1xuICB9XG4gIGlmIChjb250ZXh0ID09IFwibGluZVwiKSB7IHJldHVybiByZWN0IH1cbiAgaWYgKCFjb250ZXh0KSB7IGNvbnRleHQgPSBcImxvY2FsXCI7IH1cbiAgdmFyIHlPZmYgPSBoZWlnaHRBdExpbmUobGluZU9iaik7XG4gIGlmIChjb250ZXh0ID09IFwibG9jYWxcIikgeyB5T2ZmICs9IHBhZGRpbmdUb3AoY20uZGlzcGxheSk7IH1cbiAgZWxzZSB7IHlPZmYgLT0gY20uZGlzcGxheS52aWV3T2Zmc2V0OyB9XG4gIGlmIChjb250ZXh0ID09IFwicGFnZVwiIHx8IGNvbnRleHQgPT0gXCJ3aW5kb3dcIikge1xuICAgIHZhciBsT2ZmID0gY20uZGlzcGxheS5saW5lU3BhY2UuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgeU9mZiArPSBsT2ZmLnRvcCArIChjb250ZXh0ID09IFwid2luZG93XCIgPyAwIDogcGFnZVNjcm9sbFkoKSk7XG4gICAgdmFyIHhPZmYgPSBsT2ZmLmxlZnQgKyAoY29udGV4dCA9PSBcIndpbmRvd1wiID8gMCA6IHBhZ2VTY3JvbGxYKCkpO1xuICAgIHJlY3QubGVmdCArPSB4T2ZmOyByZWN0LnJpZ2h0ICs9IHhPZmY7XG4gIH1cbiAgcmVjdC50b3AgKz0geU9mZjsgcmVjdC5ib3R0b20gKz0geU9mZjtcbiAgcmV0dXJuIHJlY3Rcbn1cblxuLy8gQ292ZXJ0cyBhIGJveCBmcm9tIFwiZGl2XCIgY29vcmRzIHRvIGFub3RoZXIgY29vcmRpbmF0ZSBzeXN0ZW0uXG4vLyBDb250ZXh0IG1heSBiZSBcIndpbmRvd1wiLCBcInBhZ2VcIiwgXCJkaXZcIiwgb3IgXCJsb2NhbFwiLi9udWxsLlxuZnVuY3Rpb24gZnJvbUNvb3JkU3lzdGVtKGNtLCBjb29yZHMsIGNvbnRleHQpIHtcbiAgaWYgKGNvbnRleHQgPT0gXCJkaXZcIikgeyByZXR1cm4gY29vcmRzIH1cbiAgdmFyIGxlZnQgPSBjb29yZHMubGVmdCwgdG9wID0gY29vcmRzLnRvcDtcbiAgLy8gRmlyc3QgbW92ZSBpbnRvIFwicGFnZVwiIGNvb3JkaW5hdGUgc3lzdGVtXG4gIGlmIChjb250ZXh0ID09IFwicGFnZVwiKSB7XG4gICAgbGVmdCAtPSBwYWdlU2Nyb2xsWCgpO1xuICAgIHRvcCAtPSBwYWdlU2Nyb2xsWSgpO1xuICB9IGVsc2UgaWYgKGNvbnRleHQgPT0gXCJsb2NhbFwiIHx8ICFjb250ZXh0KSB7XG4gICAgdmFyIGxvY2FsQm94ID0gY20uZGlzcGxheS5zaXplci5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICBsZWZ0ICs9IGxvY2FsQm94LmxlZnQ7XG4gICAgdG9wICs9IGxvY2FsQm94LnRvcDtcbiAgfVxuXG4gIHZhciBsaW5lU3BhY2VCb3ggPSBjbS5kaXNwbGF5LmxpbmVTcGFjZS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgcmV0dXJuIHtsZWZ0OiBsZWZ0IC0gbGluZVNwYWNlQm94LmxlZnQsIHRvcDogdG9wIC0gbGluZVNwYWNlQm94LnRvcH1cbn1cblxuZnVuY3Rpb24gY2hhckNvb3JkcyhjbSwgcG9zLCBjb250ZXh0LCBsaW5lT2JqLCBiaWFzKSB7XG4gIGlmICghbGluZU9iaikgeyBsaW5lT2JqID0gZ2V0TGluZShjbS5kb2MsIHBvcy5saW5lKTsgfVxuICByZXR1cm4gaW50b0Nvb3JkU3lzdGVtKGNtLCBsaW5lT2JqLCBtZWFzdXJlQ2hhcihjbSwgbGluZU9iaiwgcG9zLmNoLCBiaWFzKSwgY29udGV4dClcbn1cblxuLy8gUmV0dXJucyBhIGJveCBmb3IgYSBnaXZlbiBjdXJzb3IgcG9zaXRpb24sIHdoaWNoIG1heSBoYXZlIGFuXG4vLyAnb3RoZXInIHByb3BlcnR5IGNvbnRhaW5pbmcgdGhlIHBvc2l0aW9uIG9mIHRoZSBzZWNvbmRhcnkgY3Vyc29yXG4vLyBvbiBhIGJpZGkgYm91bmRhcnkuXG4vLyBBIGN1cnNvciBQb3MobGluZSwgY2hhciwgXCJiZWZvcmVcIikgaXMgb24gdGhlIHNhbWUgdmlzdWFsIGxpbmUgYXMgYGNoYXIgLSAxYFxuLy8gYW5kIGFmdGVyIGBjaGFyIC0gMWAgaW4gd3JpdGluZyBvcmRlciBvZiBgY2hhciAtIDFgXG4vLyBBIGN1cnNvciBQb3MobGluZSwgY2hhciwgXCJhZnRlclwiKSBpcyBvbiB0aGUgc2FtZSB2aXN1YWwgbGluZSBhcyBgY2hhcmBcbi8vIGFuZCBiZWZvcmUgYGNoYXJgIGluIHdyaXRpbmcgb3JkZXIgb2YgYGNoYXJgXG4vLyBFeGFtcGxlcyAodXBwZXItY2FzZSBsZXR0ZXJzIGFyZSBSVEwsIGxvd2VyLWNhc2UgYXJlIExUUik6XG4vLyAgICAgUG9zKDAsIDEsIC4uLilcbi8vICAgICBiZWZvcmUgICBhZnRlclxuLy8gYWIgICAgIGF8YiAgICAgYXxiXG4vLyBhQiAgICAgYXxCICAgICBhQnxcbi8vIEFiICAgICB8QWIgICAgIEF8YlxuLy8gQUIgICAgIEJ8QSAgICAgQnxBXG4vLyBFdmVyeSBwb3NpdGlvbiBhZnRlciB0aGUgbGFzdCBjaGFyYWN0ZXIgb24gYSBsaW5lIGlzIGNvbnNpZGVyZWQgdG8gc3RpY2tcbi8vIHRvIHRoZSBsYXN0IGNoYXJhY3RlciBvbiB0aGUgbGluZS5cbmZ1bmN0aW9uIGN1cnNvckNvb3JkcyhjbSwgcG9zLCBjb250ZXh0LCBsaW5lT2JqLCBwcmVwYXJlZE1lYXN1cmUsIHZhckhlaWdodCkge1xuICBsaW5lT2JqID0gbGluZU9iaiB8fCBnZXRMaW5lKGNtLmRvYywgcG9zLmxpbmUpO1xuICBpZiAoIXByZXBhcmVkTWVhc3VyZSkgeyBwcmVwYXJlZE1lYXN1cmUgPSBwcmVwYXJlTWVhc3VyZUZvckxpbmUoY20sIGxpbmVPYmopOyB9XG4gIGZ1bmN0aW9uIGdldChjaCwgcmlnaHQpIHtcbiAgICB2YXIgbSA9IG1lYXN1cmVDaGFyUHJlcGFyZWQoY20sIHByZXBhcmVkTWVhc3VyZSwgY2gsIHJpZ2h0ID8gXCJyaWdodFwiIDogXCJsZWZ0XCIsIHZhckhlaWdodCk7XG4gICAgaWYgKHJpZ2h0KSB7IG0ubGVmdCA9IG0ucmlnaHQ7IH0gZWxzZSB7IG0ucmlnaHQgPSBtLmxlZnQ7IH1cbiAgICByZXR1cm4gaW50b0Nvb3JkU3lzdGVtKGNtLCBsaW5lT2JqLCBtLCBjb250ZXh0KVxuICB9XG4gIHZhciBvcmRlciA9IGdldE9yZGVyKGxpbmVPYmosIGNtLmRvYy5kaXJlY3Rpb24pLCBjaCA9IHBvcy5jaCwgc3RpY2t5ID0gcG9zLnN0aWNreTtcbiAgaWYgKGNoID49IGxpbmVPYmoudGV4dC5sZW5ndGgpIHtcbiAgICBjaCA9IGxpbmVPYmoudGV4dC5sZW5ndGg7XG4gICAgc3RpY2t5ID0gXCJiZWZvcmVcIjtcbiAgfSBlbHNlIGlmIChjaCA8PSAwKSB7XG4gICAgY2ggPSAwO1xuICAgIHN0aWNreSA9IFwiYWZ0ZXJcIjtcbiAgfVxuICBpZiAoIW9yZGVyKSB7IHJldHVybiBnZXQoc3RpY2t5ID09IFwiYmVmb3JlXCIgPyBjaCAtIDEgOiBjaCwgc3RpY2t5ID09IFwiYmVmb3JlXCIpIH1cblxuICBmdW5jdGlvbiBnZXRCaWRpKGNoLCBwYXJ0UG9zLCBpbnZlcnQpIHtcbiAgICB2YXIgcGFydCA9IG9yZGVyW3BhcnRQb3NdLCByaWdodCA9IHBhcnQubGV2ZWwgPT0gMTtcbiAgICByZXR1cm4gZ2V0KGludmVydCA/IGNoIC0gMSA6IGNoLCByaWdodCAhPSBpbnZlcnQpXG4gIH1cbiAgdmFyIHBhcnRQb3MgPSBnZXRCaWRpUGFydEF0KG9yZGVyLCBjaCwgc3RpY2t5KTtcbiAgdmFyIG90aGVyID0gYmlkaU90aGVyO1xuICB2YXIgdmFsID0gZ2V0QmlkaShjaCwgcGFydFBvcywgc3RpY2t5ID09IFwiYmVmb3JlXCIpO1xuICBpZiAob3RoZXIgIT0gbnVsbCkgeyB2YWwub3RoZXIgPSBnZXRCaWRpKGNoLCBvdGhlciwgc3RpY2t5ICE9IFwiYmVmb3JlXCIpOyB9XG4gIHJldHVybiB2YWxcbn1cblxuLy8gVXNlZCB0byBjaGVhcGx5IGVzdGltYXRlIHRoZSBjb29yZGluYXRlcyBmb3IgYSBwb3NpdGlvbi4gVXNlZCBmb3Jcbi8vIGludGVybWVkaWF0ZSBzY3JvbGwgdXBkYXRlcy5cbmZ1bmN0aW9uIGVzdGltYXRlQ29vcmRzKGNtLCBwb3MpIHtcbiAgdmFyIGxlZnQgPSAwO1xuICBwb3MgPSBjbGlwUG9zKGNtLmRvYywgcG9zKTtcbiAgaWYgKCFjbS5vcHRpb25zLmxpbmVXcmFwcGluZykgeyBsZWZ0ID0gY2hhcldpZHRoKGNtLmRpc3BsYXkpICogcG9zLmNoOyB9XG4gIHZhciBsaW5lT2JqID0gZ2V0TGluZShjbS5kb2MsIHBvcy5saW5lKTtcbiAgdmFyIHRvcCA9IGhlaWdodEF0TGluZShsaW5lT2JqKSArIHBhZGRpbmdUb3AoY20uZGlzcGxheSk7XG4gIHJldHVybiB7bGVmdDogbGVmdCwgcmlnaHQ6IGxlZnQsIHRvcDogdG9wLCBib3R0b206IHRvcCArIGxpbmVPYmouaGVpZ2h0fVxufVxuXG4vLyBQb3NpdGlvbnMgcmV0dXJuZWQgYnkgY29vcmRzQ2hhciBjb250YWluIHNvbWUgZXh0cmEgaW5mb3JtYXRpb24uXG4vLyB4UmVsIGlzIHRoZSByZWxhdGl2ZSB4IHBvc2l0aW9uIG9mIHRoZSBpbnB1dCBjb29yZGluYXRlcyBjb21wYXJlZFxuLy8gdG8gdGhlIGZvdW5kIHBvc2l0aW9uIChzbyB4UmVsID4gMCBtZWFucyB0aGUgY29vcmRpbmF0ZXMgYXJlIHRvXG4vLyB0aGUgcmlnaHQgb2YgdGhlIGNoYXJhY3RlciBwb3NpdGlvbiwgZm9yIGV4YW1wbGUpLiBXaGVuIG91dHNpZGVcbi8vIGlzIHRydWUsIHRoYXQgbWVhbnMgdGhlIGNvb3JkaW5hdGVzIGxpZSBvdXRzaWRlIHRoZSBsaW5lJ3Ncbi8vIHZlcnRpY2FsIHJhbmdlLlxuZnVuY3Rpb24gUG9zV2l0aEluZm8obGluZSwgY2gsIHN0aWNreSwgb3V0c2lkZSwgeFJlbCkge1xuICB2YXIgcG9zID0gUG9zKGxpbmUsIGNoLCBzdGlja3kpO1xuICBwb3MueFJlbCA9IHhSZWw7XG4gIGlmIChvdXRzaWRlKSB7IHBvcy5vdXRzaWRlID0gdHJ1ZTsgfVxuICByZXR1cm4gcG9zXG59XG5cbi8vIENvbXB1dGUgdGhlIGNoYXJhY3RlciBwb3NpdGlvbiBjbG9zZXN0IHRvIHRoZSBnaXZlbiBjb29yZGluYXRlcy5cbi8vIElucHV0IG11c3QgYmUgbGluZVNwYWNlLWxvY2FsIChcImRpdlwiIGNvb3JkaW5hdGUgc3lzdGVtKS5cbmZ1bmN0aW9uIGNvb3Jkc0NoYXIoY20sIHgsIHkpIHtcbiAgdmFyIGRvYyA9IGNtLmRvYztcbiAgeSArPSBjbS5kaXNwbGF5LnZpZXdPZmZzZXQ7XG4gIGlmICh5IDwgMCkgeyByZXR1cm4gUG9zV2l0aEluZm8oZG9jLmZpcnN0LCAwLCBudWxsLCB0cnVlLCAtMSkgfVxuICB2YXIgbGluZU4gPSBsaW5lQXRIZWlnaHQoZG9jLCB5KSwgbGFzdCA9IGRvYy5maXJzdCArIGRvYy5zaXplIC0gMTtcbiAgaWYgKGxpbmVOID4gbGFzdClcbiAgICB7IHJldHVybiBQb3NXaXRoSW5mbyhkb2MuZmlyc3QgKyBkb2Muc2l6ZSAtIDEsIGdldExpbmUoZG9jLCBsYXN0KS50ZXh0Lmxlbmd0aCwgbnVsbCwgdHJ1ZSwgMSkgfVxuICBpZiAoeCA8IDApIHsgeCA9IDA7IH1cblxuICB2YXIgbGluZU9iaiA9IGdldExpbmUoZG9jLCBsaW5lTik7XG4gIGZvciAoOzspIHtcbiAgICB2YXIgZm91bmQgPSBjb29yZHNDaGFySW5uZXIoY20sIGxpbmVPYmosIGxpbmVOLCB4LCB5KTtcbiAgICB2YXIgY29sbGFwc2VkID0gY29sbGFwc2VkU3BhbkFyb3VuZChsaW5lT2JqLCBmb3VuZC5jaCArIChmb3VuZC54UmVsID4gMCA/IDEgOiAwKSk7XG4gICAgaWYgKCFjb2xsYXBzZWQpIHsgcmV0dXJuIGZvdW5kIH1cbiAgICB2YXIgcmFuZ2VFbmQgPSBjb2xsYXBzZWQuZmluZCgxKTtcbiAgICBpZiAocmFuZ2VFbmQubGluZSA9PSBsaW5lTikgeyByZXR1cm4gcmFuZ2VFbmQgfVxuICAgIGxpbmVPYmogPSBnZXRMaW5lKGRvYywgbGluZU4gPSByYW5nZUVuZC5saW5lKTtcbiAgfVxufVxuXG5mdW5jdGlvbiB3cmFwcGVkTGluZUV4dGVudChjbSwgbGluZU9iaiwgcHJlcGFyZWRNZWFzdXJlLCB5KSB7XG4gIHkgLT0gd2lkZ2V0VG9wSGVpZ2h0KGxpbmVPYmopO1xuICB2YXIgZW5kID0gbGluZU9iai50ZXh0Lmxlbmd0aDtcbiAgdmFyIGJlZ2luID0gZmluZEZpcnN0KGZ1bmN0aW9uIChjaCkgeyByZXR1cm4gbWVhc3VyZUNoYXJQcmVwYXJlZChjbSwgcHJlcGFyZWRNZWFzdXJlLCBjaCAtIDEpLmJvdHRvbSA8PSB5OyB9LCBlbmQsIDApO1xuICBlbmQgPSBmaW5kRmlyc3QoZnVuY3Rpb24gKGNoKSB7IHJldHVybiBtZWFzdXJlQ2hhclByZXBhcmVkKGNtLCBwcmVwYXJlZE1lYXN1cmUsIGNoKS50b3AgPiB5OyB9LCBiZWdpbiwgZW5kKTtcbiAgcmV0dXJuIHtiZWdpbjogYmVnaW4sIGVuZDogZW5kfVxufVxuXG5mdW5jdGlvbiB3cmFwcGVkTGluZUV4dGVudENoYXIoY20sIGxpbmVPYmosIHByZXBhcmVkTWVhc3VyZSwgdGFyZ2V0KSB7XG4gIGlmICghcHJlcGFyZWRNZWFzdXJlKSB7IHByZXBhcmVkTWVhc3VyZSA9IHByZXBhcmVNZWFzdXJlRm9yTGluZShjbSwgbGluZU9iaik7IH1cbiAgdmFyIHRhcmdldFRvcCA9IGludG9Db29yZFN5c3RlbShjbSwgbGluZU9iaiwgbWVhc3VyZUNoYXJQcmVwYXJlZChjbSwgcHJlcGFyZWRNZWFzdXJlLCB0YXJnZXQpLCBcImxpbmVcIikudG9wO1xuICByZXR1cm4gd3JhcHBlZExpbmVFeHRlbnQoY20sIGxpbmVPYmosIHByZXBhcmVkTWVhc3VyZSwgdGFyZ2V0VG9wKVxufVxuXG4vLyBSZXR1cm5zIHRydWUgaWYgdGhlIGdpdmVuIHNpZGUgb2YgYSBib3ggaXMgYWZ0ZXIgdGhlIGdpdmVuXG4vLyBjb29yZGluYXRlcywgaW4gdG9wLXRvLWJvdHRvbSwgbGVmdC10by1yaWdodCBvcmRlci5cbmZ1bmN0aW9uIGJveElzQWZ0ZXIoYm94LCB4LCB5LCBsZWZ0KSB7XG4gIHJldHVybiBib3guYm90dG9tIDw9IHkgPyBmYWxzZSA6IGJveC50b3AgPiB5ID8gdHJ1ZSA6IChsZWZ0ID8gYm94LmxlZnQgOiBib3gucmlnaHQpID4geFxufVxuXG5mdW5jdGlvbiBjb29yZHNDaGFySW5uZXIoY20sIGxpbmVPYmosIGxpbmVObyQkMSwgeCwgeSkge1xuICAvLyBNb3ZlIHkgaW50byBsaW5lLWxvY2FsIGNvb3JkaW5hdGUgc3BhY2VcbiAgeSAtPSBoZWlnaHRBdExpbmUobGluZU9iaik7XG4gIHZhciBwcmVwYXJlZE1lYXN1cmUgPSBwcmVwYXJlTWVhc3VyZUZvckxpbmUoY20sIGxpbmVPYmopO1xuICAvLyBXaGVuIGRpcmVjdGx5IGNhbGxpbmcgYG1lYXN1cmVDaGFyUHJlcGFyZWRgLCB3ZSBoYXZlIHRvIGFkanVzdFxuICAvLyBmb3IgdGhlIHdpZGdldHMgYXQgdGhpcyBsaW5lLlxuICB2YXIgd2lkZ2V0SGVpZ2h0JCQxID0gd2lkZ2V0VG9wSGVpZ2h0KGxpbmVPYmopO1xuICB2YXIgYmVnaW4gPSAwLCBlbmQgPSBsaW5lT2JqLnRleHQubGVuZ3RoLCBsdHIgPSB0cnVlO1xuXG4gIHZhciBvcmRlciA9IGdldE9yZGVyKGxpbmVPYmosIGNtLmRvYy5kaXJlY3Rpb24pO1xuICAvLyBJZiB0aGUgbGluZSBpc24ndCBwbGFpbiBsZWZ0LXRvLXJpZ2h0IHRleHQsIGZpcnN0IGZpZ3VyZSBvdXRcbiAgLy8gd2hpY2ggYmlkaSBzZWN0aW9uIHRoZSBjb29yZGluYXRlcyBmYWxsIGludG8uXG4gIGlmIChvcmRlcikge1xuICAgIHZhciBwYXJ0ID0gKGNtLm9wdGlvbnMubGluZVdyYXBwaW5nID8gY29vcmRzQmlkaVBhcnRXcmFwcGVkIDogY29vcmRzQmlkaVBhcnQpXG4gICAgICAgICAgICAgICAgIChjbSwgbGluZU9iaiwgbGluZU5vJCQxLCBwcmVwYXJlZE1lYXN1cmUsIG9yZGVyLCB4LCB5KTtcbiAgICBsdHIgPSBwYXJ0LmxldmVsICE9IDE7XG4gICAgLy8gVGhlIGF3a3dhcmQgLTEgb2Zmc2V0cyBhcmUgbmVlZGVkIGJlY2F1c2UgZmluZEZpcnN0IChjYWxsZWRcbiAgICAvLyBvbiB0aGVzZSBiZWxvdykgd2lsbCB0cmVhdCBpdHMgZmlyc3QgYm91bmQgYXMgaW5jbHVzaXZlLFxuICAgIC8vIHNlY29uZCBhcyBleGNsdXNpdmUsIGJ1dCB3ZSB3YW50IHRvIGFjdHVhbGx5IGFkZHJlc3MgdGhlXG4gICAgLy8gY2hhcmFjdGVycyBpbiB0aGUgcGFydCdzIHJhbmdlXG4gICAgYmVnaW4gPSBsdHIgPyBwYXJ0LmZyb20gOiBwYXJ0LnRvIC0gMTtcbiAgICBlbmQgPSBsdHIgPyBwYXJ0LnRvIDogcGFydC5mcm9tIC0gMTtcbiAgfVxuXG4gIC8vIEEgYmluYXJ5IHNlYXJjaCB0byBmaW5kIHRoZSBmaXJzdCBjaGFyYWN0ZXIgd2hvc2UgYm91bmRpbmcgYm94XG4gIC8vIHN0YXJ0cyBhZnRlciB0aGUgY29vcmRpbmF0ZXMuIElmIHdlIHJ1biBhY3Jvc3MgYW55IHdob3NlIGJveCB3cmFwXG4gIC8vIHRoZSBjb29yZGluYXRlcywgc3RvcmUgdGhhdC5cbiAgdmFyIGNoQXJvdW5kID0gbnVsbCwgYm94QXJvdW5kID0gbnVsbDtcbiAgdmFyIGNoID0gZmluZEZpcnN0KGZ1bmN0aW9uIChjaCkge1xuICAgIHZhciBib3ggPSBtZWFzdXJlQ2hhclByZXBhcmVkKGNtLCBwcmVwYXJlZE1lYXN1cmUsIGNoKTtcbiAgICBib3gudG9wICs9IHdpZGdldEhlaWdodCQkMTsgYm94LmJvdHRvbSArPSB3aWRnZXRIZWlnaHQkJDE7XG4gICAgaWYgKCFib3hJc0FmdGVyKGJveCwgeCwgeSwgZmFsc2UpKSB7IHJldHVybiBmYWxzZSB9XG4gICAgaWYgKGJveC50b3AgPD0geSAmJiBib3gubGVmdCA8PSB4KSB7XG4gICAgICBjaEFyb3VuZCA9IGNoO1xuICAgICAgYm94QXJvdW5kID0gYm94O1xuICAgIH1cbiAgICByZXR1cm4gdHJ1ZVxuICB9LCBiZWdpbiwgZW5kKTtcblxuICB2YXIgYmFzZVgsIHN0aWNreSwgb3V0c2lkZSA9IGZhbHNlO1xuICAvLyBJZiBhIGJveCBhcm91bmQgdGhlIGNvb3JkaW5hdGVzIHdhcyBmb3VuZCwgdXNlIHRoYXRcbiAgaWYgKGJveEFyb3VuZCkge1xuICAgIC8vIERpc3Rpbmd1aXNoIGNvb3JkaW5hdGVzIG5lYXJlciB0byB0aGUgbGVmdCBvciByaWdodCBzaWRlIG9mIHRoZSBib3hcbiAgICB2YXIgYXRMZWZ0ID0geCAtIGJveEFyb3VuZC5sZWZ0IDwgYm94QXJvdW5kLnJpZ2h0IC0geCwgYXRTdGFydCA9IGF0TGVmdCA9PSBsdHI7XG4gICAgY2ggPSBjaEFyb3VuZCArIChhdFN0YXJ0ID8gMCA6IDEpO1xuICAgIHN0aWNreSA9IGF0U3RhcnQgPyBcImFmdGVyXCIgOiBcImJlZm9yZVwiO1xuICAgIGJhc2VYID0gYXRMZWZ0ID8gYm94QXJvdW5kLmxlZnQgOiBib3hBcm91bmQucmlnaHQ7XG4gIH0gZWxzZSB7XG4gICAgLy8gKEFkanVzdCBmb3IgZXh0ZW5kZWQgYm91bmQsIGlmIG5lY2Vzc2FyeS4pXG4gICAgaWYgKCFsdHIgJiYgKGNoID09IGVuZCB8fCBjaCA9PSBiZWdpbikpIHsgY2grKzsgfVxuICAgIC8vIFRvIGRldGVybWluZSB3aGljaCBzaWRlIHRvIGFzc29jaWF0ZSB3aXRoLCBnZXQgdGhlIGJveCB0byB0aGVcbiAgICAvLyBsZWZ0IG9mIHRoZSBjaGFyYWN0ZXIgYW5kIGNvbXBhcmUgaXQncyB2ZXJ0aWNhbCBwb3NpdGlvbiB0byB0aGVcbiAgICAvLyBjb29yZGluYXRlc1xuICAgIHN0aWNreSA9IGNoID09IDAgPyBcImFmdGVyXCIgOiBjaCA9PSBsaW5lT2JqLnRleHQubGVuZ3RoID8gXCJiZWZvcmVcIiA6XG4gICAgICAobWVhc3VyZUNoYXJQcmVwYXJlZChjbSwgcHJlcGFyZWRNZWFzdXJlLCBjaCAtIChsdHIgPyAxIDogMCkpLmJvdHRvbSArIHdpZGdldEhlaWdodCQkMSA8PSB5KSA9PSBsdHIgP1xuICAgICAgXCJhZnRlclwiIDogXCJiZWZvcmVcIjtcbiAgICAvLyBOb3cgZ2V0IGFjY3VyYXRlIGNvb3JkaW5hdGVzIGZvciB0aGlzIHBsYWNlLCBpbiBvcmRlciB0byBnZXQgYVxuICAgIC8vIGJhc2UgWCBwb3NpdGlvblxuICAgIHZhciBjb29yZHMgPSBjdXJzb3JDb29yZHMoY20sIFBvcyhsaW5lTm8kJDEsIGNoLCBzdGlja3kpLCBcImxpbmVcIiwgbGluZU9iaiwgcHJlcGFyZWRNZWFzdXJlKTtcbiAgICBiYXNlWCA9IGNvb3Jkcy5sZWZ0O1xuICAgIG91dHNpZGUgPSB5IDwgY29vcmRzLnRvcCB8fCB5ID49IGNvb3Jkcy5ib3R0b207XG4gIH1cblxuICBjaCA9IHNraXBFeHRlbmRpbmdDaGFycyhsaW5lT2JqLnRleHQsIGNoLCAxKTtcbiAgcmV0dXJuIFBvc1dpdGhJbmZvKGxpbmVObyQkMSwgY2gsIHN0aWNreSwgb3V0c2lkZSwgeCAtIGJhc2VYKVxufVxuXG5mdW5jdGlvbiBjb29yZHNCaWRpUGFydChjbSwgbGluZU9iaiwgbGluZU5vJCQxLCBwcmVwYXJlZE1lYXN1cmUsIG9yZGVyLCB4LCB5KSB7XG4gIC8vIEJpZGkgcGFydHMgYXJlIHNvcnRlZCBsZWZ0LXRvLXJpZ2h0LCBhbmQgaW4gYSBub24tbGluZS13cmFwcGluZ1xuICAvLyBzaXR1YXRpb24sIHdlIGNhbiB0YWtlIHRoaXMgb3JkZXJpbmcgdG8gY29ycmVzcG9uZCB0byB0aGUgdmlzdWFsXG4gIC8vIG9yZGVyaW5nLiBUaGlzIGZpbmRzIHRoZSBmaXJzdCBwYXJ0IHdob3NlIGVuZCBpcyBhZnRlciB0aGUgZ2l2ZW5cbiAgLy8gY29vcmRpbmF0ZXMuXG4gIHZhciBpbmRleCA9IGZpbmRGaXJzdChmdW5jdGlvbiAoaSkge1xuICAgIHZhciBwYXJ0ID0gb3JkZXJbaV0sIGx0ciA9IHBhcnQubGV2ZWwgIT0gMTtcbiAgICByZXR1cm4gYm94SXNBZnRlcihjdXJzb3JDb29yZHMoY20sIFBvcyhsaW5lTm8kJDEsIGx0ciA/IHBhcnQudG8gOiBwYXJ0LmZyb20sIGx0ciA/IFwiYmVmb3JlXCIgOiBcImFmdGVyXCIpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcImxpbmVcIiwgbGluZU9iaiwgcHJlcGFyZWRNZWFzdXJlKSwgeCwgeSwgdHJ1ZSlcbiAgfSwgMCwgb3JkZXIubGVuZ3RoIC0gMSk7XG4gIHZhciBwYXJ0ID0gb3JkZXJbaW5kZXhdO1xuICAvLyBJZiB0aGlzIGlzbid0IHRoZSBmaXJzdCBwYXJ0LCB0aGUgcGFydCdzIHN0YXJ0IGlzIGFsc28gYWZ0ZXJcbiAgLy8gdGhlIGNvb3JkaW5hdGVzLCBhbmQgdGhlIGNvb3JkaW5hdGVzIGFyZW4ndCBvbiB0aGUgc2FtZSBsaW5lIGFzXG4gIC8vIHRoYXQgc3RhcnQsIG1vdmUgb25lIHBhcnQgYmFjay5cbiAgaWYgKGluZGV4ID4gMCkge1xuICAgIHZhciBsdHIgPSBwYXJ0LmxldmVsICE9IDE7XG4gICAgdmFyIHN0YXJ0ID0gY3Vyc29yQ29vcmRzKGNtLCBQb3MobGluZU5vJCQxLCBsdHIgPyBwYXJ0LmZyb20gOiBwYXJ0LnRvLCBsdHIgPyBcImFmdGVyXCIgOiBcImJlZm9yZVwiKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJsaW5lXCIsIGxpbmVPYmosIHByZXBhcmVkTWVhc3VyZSk7XG4gICAgaWYgKGJveElzQWZ0ZXIoc3RhcnQsIHgsIHksIHRydWUpICYmIHN0YXJ0LnRvcCA+IHkpXG4gICAgICB7IHBhcnQgPSBvcmRlcltpbmRleCAtIDFdOyB9XG4gIH1cbiAgcmV0dXJuIHBhcnRcbn1cblxuZnVuY3Rpb24gY29vcmRzQmlkaVBhcnRXcmFwcGVkKGNtLCBsaW5lT2JqLCBfbGluZU5vLCBwcmVwYXJlZE1lYXN1cmUsIG9yZGVyLCB4LCB5KSB7XG4gIC8vIEluIGEgd3JhcHBlZCBsaW5lLCBydGwgdGV4dCBvbiB3cmFwcGluZyBib3VuZGFyaWVzIGNhbiBkbyB0aGluZ3NcbiAgLy8gdGhhdCBkb24ndCBjb3JyZXNwb25kIHRvIHRoZSBvcmRlcmluZyBpbiBvdXIgYG9yZGVyYCBhcnJheSBhdFxuICAvLyBhbGwsIHNvIGEgYmluYXJ5IHNlYXJjaCBkb2Vzbid0IHdvcmssIGFuZCB3ZSB3YW50IHRvIHJldHVybiBhXG4gIC8vIHBhcnQgdGhhdCBvbmx5IHNwYW5zIG9uZSBsaW5lIHNvIHRoYXQgdGhlIGJpbmFyeSBzZWFyY2ggaW5cbiAgLy8gY29vcmRzQ2hhcklubmVyIGlzIHNhZmUuIEFzIHN1Y2gsIHdlIGZpcnN0IGZpbmQgdGhlIGV4dGVudCBvZiB0aGVcbiAgLy8gd3JhcHBlZCBsaW5lLCBhbmQgdGhlbiBkbyBhIGZsYXQgc2VhcmNoIGluIHdoaWNoIHdlIGRpc2NhcmQgYW55XG4gIC8vIHNwYW5zIHRoYXQgYXJlbid0IG9uIHRoZSBsaW5lLlxuICB2YXIgcmVmID0gd3JhcHBlZExpbmVFeHRlbnQoY20sIGxpbmVPYmosIHByZXBhcmVkTWVhc3VyZSwgeSk7XG4gIHZhciBiZWdpbiA9IHJlZi5iZWdpbjtcbiAgdmFyIGVuZCA9IHJlZi5lbmQ7XG4gIGlmICgvXFxzLy50ZXN0KGxpbmVPYmoudGV4dC5jaGFyQXQoZW5kIC0gMSkpKSB7IGVuZC0tOyB9XG4gIHZhciBwYXJ0ID0gbnVsbCwgY2xvc2VzdERpc3QgPSBudWxsO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IG9yZGVyLmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIHAgPSBvcmRlcltpXTtcbiAgICBpZiAocC5mcm9tID49IGVuZCB8fCBwLnRvIDw9IGJlZ2luKSB7IGNvbnRpbnVlIH1cbiAgICB2YXIgbHRyID0gcC5sZXZlbCAhPSAxO1xuICAgIHZhciBlbmRYID0gbWVhc3VyZUNoYXJQcmVwYXJlZChjbSwgcHJlcGFyZWRNZWFzdXJlLCBsdHIgPyBNYXRoLm1pbihlbmQsIHAudG8pIC0gMSA6IE1hdGgubWF4KGJlZ2luLCBwLmZyb20pKS5yaWdodDtcbiAgICAvLyBXZWlnaCBhZ2FpbnN0IHNwYW5zIGVuZGluZyBiZWZvcmUgdGhpcywgc28gdGhhdCB0aGV5IGFyZSBvbmx5XG4gICAgLy8gcGlja2VkIGlmIG5vdGhpbmcgZW5kcyBhZnRlclxuICAgIHZhciBkaXN0ID0gZW5kWCA8IHggPyB4IC0gZW5kWCArIDFlOSA6IGVuZFggLSB4O1xuICAgIGlmICghcGFydCB8fCBjbG9zZXN0RGlzdCA+IGRpc3QpIHtcbiAgICAgIHBhcnQgPSBwO1xuICAgICAgY2xvc2VzdERpc3QgPSBkaXN0O1xuICAgIH1cbiAgfVxuICBpZiAoIXBhcnQpIHsgcGFydCA9IG9yZGVyW29yZGVyLmxlbmd0aCAtIDFdOyB9XG4gIC8vIENsaXAgdGhlIHBhcnQgdG8gdGhlIHdyYXBwZWQgbGluZS5cbiAgaWYgKHBhcnQuZnJvbSA8IGJlZ2luKSB7IHBhcnQgPSB7ZnJvbTogYmVnaW4sIHRvOiBwYXJ0LnRvLCBsZXZlbDogcGFydC5sZXZlbH07IH1cbiAgaWYgKHBhcnQudG8gPiBlbmQpIHsgcGFydCA9IHtmcm9tOiBwYXJ0LmZyb20sIHRvOiBlbmQsIGxldmVsOiBwYXJ0LmxldmVsfTsgfVxuICByZXR1cm4gcGFydFxufVxuXG52YXIgbWVhc3VyZVRleHQ7XG4vLyBDb21wdXRlIHRoZSBkZWZhdWx0IHRleHQgaGVpZ2h0LlxuZnVuY3Rpb24gdGV4dEhlaWdodChkaXNwbGF5KSB7XG4gIGlmIChkaXNwbGF5LmNhY2hlZFRleHRIZWlnaHQgIT0gbnVsbCkgeyByZXR1cm4gZGlzcGxheS5jYWNoZWRUZXh0SGVpZ2h0IH1cbiAgaWYgKG1lYXN1cmVUZXh0ID09IG51bGwpIHtcbiAgICBtZWFzdXJlVGV4dCA9IGVsdChcInByZVwiKTtcbiAgICAvLyBNZWFzdXJlIGEgYnVuY2ggb2YgbGluZXMsIGZvciBicm93c2VycyB0aGF0IGNvbXB1dGVcbiAgICAvLyBmcmFjdGlvbmFsIGhlaWdodHMuXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCA0OTsgKytpKSB7XG4gICAgICBtZWFzdXJlVGV4dC5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShcInhcIikpO1xuICAgICAgbWVhc3VyZVRleHQuYXBwZW5kQ2hpbGQoZWx0KFwiYnJcIikpO1xuICAgIH1cbiAgICBtZWFzdXJlVGV4dC5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShcInhcIikpO1xuICB9XG4gIHJlbW92ZUNoaWxkcmVuQW5kQWRkKGRpc3BsYXkubWVhc3VyZSwgbWVhc3VyZVRleHQpO1xuICB2YXIgaGVpZ2h0ID0gbWVhc3VyZVRleHQub2Zmc2V0SGVpZ2h0IC8gNTA7XG4gIGlmIChoZWlnaHQgPiAzKSB7IGRpc3BsYXkuY2FjaGVkVGV4dEhlaWdodCA9IGhlaWdodDsgfVxuICByZW1vdmVDaGlsZHJlbihkaXNwbGF5Lm1lYXN1cmUpO1xuICByZXR1cm4gaGVpZ2h0IHx8IDFcbn1cblxuLy8gQ29tcHV0ZSB0aGUgZGVmYXVsdCBjaGFyYWN0ZXIgd2lkdGguXG5mdW5jdGlvbiBjaGFyV2lkdGgoZGlzcGxheSkge1xuICBpZiAoZGlzcGxheS5jYWNoZWRDaGFyV2lkdGggIT0gbnVsbCkgeyByZXR1cm4gZGlzcGxheS5jYWNoZWRDaGFyV2lkdGggfVxuICB2YXIgYW5jaG9yID0gZWx0KFwic3BhblwiLCBcInh4eHh4eHh4eHhcIik7XG4gIHZhciBwcmUgPSBlbHQoXCJwcmVcIiwgW2FuY2hvcl0pO1xuICByZW1vdmVDaGlsZHJlbkFuZEFkZChkaXNwbGF5Lm1lYXN1cmUsIHByZSk7XG4gIHZhciByZWN0ID0gYW5jaG9yLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpLCB3aWR0aCA9IChyZWN0LnJpZ2h0IC0gcmVjdC5sZWZ0KSAvIDEwO1xuICBpZiAod2lkdGggPiAyKSB7IGRpc3BsYXkuY2FjaGVkQ2hhcldpZHRoID0gd2lkdGg7IH1cbiAgcmV0dXJuIHdpZHRoIHx8IDEwXG59XG5cbi8vIERvIGEgYnVsay1yZWFkIG9mIHRoZSBET00gcG9zaXRpb25zIGFuZCBzaXplcyBuZWVkZWQgdG8gZHJhdyB0aGVcbi8vIHZpZXcsIHNvIHRoYXQgd2UgZG9uJ3QgaW50ZXJsZWF2ZSByZWFkaW5nIGFuZCB3cml0aW5nIHRvIHRoZSBET00uXG5mdW5jdGlvbiBnZXREaW1lbnNpb25zKGNtKSB7XG4gIHZhciBkID0gY20uZGlzcGxheSwgbGVmdCA9IHt9LCB3aWR0aCA9IHt9O1xuICB2YXIgZ3V0dGVyTGVmdCA9IGQuZ3V0dGVycy5jbGllbnRMZWZ0O1xuICBmb3IgKHZhciBuID0gZC5ndXR0ZXJzLmZpcnN0Q2hpbGQsIGkgPSAwOyBuOyBuID0gbi5uZXh0U2libGluZywgKytpKSB7XG4gICAgbGVmdFtjbS5vcHRpb25zLmd1dHRlcnNbaV1dID0gbi5vZmZzZXRMZWZ0ICsgbi5jbGllbnRMZWZ0ICsgZ3V0dGVyTGVmdDtcbiAgICB3aWR0aFtjbS5vcHRpb25zLmd1dHRlcnNbaV1dID0gbi5jbGllbnRXaWR0aDtcbiAgfVxuICByZXR1cm4ge2ZpeGVkUG9zOiBjb21wZW5zYXRlRm9ySFNjcm9sbChkKSxcbiAgICAgICAgICBndXR0ZXJUb3RhbFdpZHRoOiBkLmd1dHRlcnMub2Zmc2V0V2lkdGgsXG4gICAgICAgICAgZ3V0dGVyTGVmdDogbGVmdCxcbiAgICAgICAgICBndXR0ZXJXaWR0aDogd2lkdGgsXG4gICAgICAgICAgd3JhcHBlcldpZHRoOiBkLndyYXBwZXIuY2xpZW50V2lkdGh9XG59XG5cbi8vIENvbXB1dGVzIGRpc3BsYXkuc2Nyb2xsZXIuc2Nyb2xsTGVmdCArIGRpc3BsYXkuZ3V0dGVycy5vZmZzZXRXaWR0aCxcbi8vIGJ1dCB1c2luZyBnZXRCb3VuZGluZ0NsaWVudFJlY3QgdG8gZ2V0IGEgc3ViLXBpeGVsLWFjY3VyYXRlXG4vLyByZXN1bHQuXG5mdW5jdGlvbiBjb21wZW5zYXRlRm9ySFNjcm9sbChkaXNwbGF5KSB7XG4gIHJldHVybiBkaXNwbGF5LnNjcm9sbGVyLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpLmxlZnQgLSBkaXNwbGF5LnNpemVyLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpLmxlZnRcbn1cblxuLy8gUmV0dXJucyBhIGZ1bmN0aW9uIHRoYXQgZXN0aW1hdGVzIHRoZSBoZWlnaHQgb2YgYSBsaW5lLCB0byB1c2UgYXNcbi8vIGZpcnN0IGFwcHJveGltYXRpb24gdW50aWwgdGhlIGxpbmUgYmVjb21lcyB2aXNpYmxlIChhbmQgaXMgdGh1c1xuLy8gcHJvcGVybHkgbWVhc3VyYWJsZSkuXG5mdW5jdGlvbiBlc3RpbWF0ZUhlaWdodChjbSkge1xuICB2YXIgdGggPSB0ZXh0SGVpZ2h0KGNtLmRpc3BsYXkpLCB3cmFwcGluZyA9IGNtLm9wdGlvbnMubGluZVdyYXBwaW5nO1xuICB2YXIgcGVyTGluZSA9IHdyYXBwaW5nICYmIE1hdGgubWF4KDUsIGNtLmRpc3BsYXkuc2Nyb2xsZXIuY2xpZW50V2lkdGggLyBjaGFyV2lkdGgoY20uZGlzcGxheSkgLSAzKTtcbiAgcmV0dXJuIGZ1bmN0aW9uIChsaW5lKSB7XG4gICAgaWYgKGxpbmVJc0hpZGRlbihjbS5kb2MsIGxpbmUpKSB7IHJldHVybiAwIH1cblxuICAgIHZhciB3aWRnZXRzSGVpZ2h0ID0gMDtcbiAgICBpZiAobGluZS53aWRnZXRzKSB7IGZvciAodmFyIGkgPSAwOyBpIDwgbGluZS53aWRnZXRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBpZiAobGluZS53aWRnZXRzW2ldLmhlaWdodCkgeyB3aWRnZXRzSGVpZ2h0ICs9IGxpbmUud2lkZ2V0c1tpXS5oZWlnaHQ7IH1cbiAgICB9IH1cblxuICAgIGlmICh3cmFwcGluZylcbiAgICAgIHsgcmV0dXJuIHdpZGdldHNIZWlnaHQgKyAoTWF0aC5jZWlsKGxpbmUudGV4dC5sZW5ndGggLyBwZXJMaW5lKSB8fCAxKSAqIHRoIH1cbiAgICBlbHNlXG4gICAgICB7IHJldHVybiB3aWRnZXRzSGVpZ2h0ICsgdGggfVxuICB9XG59XG5cbmZ1bmN0aW9uIGVzdGltYXRlTGluZUhlaWdodHMoY20pIHtcbiAgdmFyIGRvYyA9IGNtLmRvYywgZXN0ID0gZXN0aW1hdGVIZWlnaHQoY20pO1xuICBkb2MuaXRlcihmdW5jdGlvbiAobGluZSkge1xuICAgIHZhciBlc3RIZWlnaHQgPSBlc3QobGluZSk7XG4gICAgaWYgKGVzdEhlaWdodCAhPSBsaW5lLmhlaWdodCkgeyB1cGRhdGVMaW5lSGVpZ2h0KGxpbmUsIGVzdEhlaWdodCk7IH1cbiAgfSk7XG59XG5cbi8vIEdpdmVuIGEgbW91c2UgZXZlbnQsIGZpbmQgdGhlIGNvcnJlc3BvbmRpbmcgcG9zaXRpb24uIElmIGxpYmVyYWxcbi8vIGlzIGZhbHNlLCBpdCBjaGVja3Mgd2hldGhlciBhIGd1dHRlciBvciBzY3JvbGxiYXIgd2FzIGNsaWNrZWQsXG4vLyBhbmQgcmV0dXJucyBudWxsIGlmIGl0IHdhcy4gZm9yUmVjdCBpcyB1c2VkIGJ5IHJlY3Rhbmd1bGFyXG4vLyBzZWxlY3Rpb25zLCBhbmQgdHJpZXMgdG8gZXN0aW1hdGUgYSBjaGFyYWN0ZXIgcG9zaXRpb24gZXZlbiBmb3Jcbi8vIGNvb3JkaW5hdGVzIGJleW9uZCB0aGUgcmlnaHQgb2YgdGhlIHRleHQuXG5mdW5jdGlvbiBwb3NGcm9tTW91c2UoY20sIGUsIGxpYmVyYWwsIGZvclJlY3QpIHtcbiAgdmFyIGRpc3BsYXkgPSBjbS5kaXNwbGF5O1xuICBpZiAoIWxpYmVyYWwgJiYgZV90YXJnZXQoZSkuZ2V0QXR0cmlidXRlKFwiY20tbm90LWNvbnRlbnRcIikgPT0gXCJ0cnVlXCIpIHsgcmV0dXJuIG51bGwgfVxuXG4gIHZhciB4LCB5LCBzcGFjZSA9IGRpc3BsYXkubGluZVNwYWNlLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAvLyBGYWlscyB1bnByZWRpY3RhYmx5IG9uIElFWzY3XSB3aGVuIG1vdXNlIGlzIGRyYWdnZWQgYXJvdW5kIHF1aWNrbHkuXG4gIHRyeSB7IHggPSBlLmNsaWVudFggLSBzcGFjZS5sZWZ0OyB5ID0gZS5jbGllbnRZIC0gc3BhY2UudG9wOyB9XG4gIGNhdGNoIChlKSB7IHJldHVybiBudWxsIH1cbiAgdmFyIGNvb3JkcyA9IGNvb3Jkc0NoYXIoY20sIHgsIHkpLCBsaW5lO1xuICBpZiAoZm9yUmVjdCAmJiBjb29yZHMueFJlbCA9PSAxICYmIChsaW5lID0gZ2V0TGluZShjbS5kb2MsIGNvb3Jkcy5saW5lKS50ZXh0KS5sZW5ndGggPT0gY29vcmRzLmNoKSB7XG4gICAgdmFyIGNvbERpZmYgPSBjb3VudENvbHVtbihsaW5lLCBsaW5lLmxlbmd0aCwgY20ub3B0aW9ucy50YWJTaXplKSAtIGxpbmUubGVuZ3RoO1xuICAgIGNvb3JkcyA9IFBvcyhjb29yZHMubGluZSwgTWF0aC5tYXgoMCwgTWF0aC5yb3VuZCgoeCAtIHBhZGRpbmdIKGNtLmRpc3BsYXkpLmxlZnQpIC8gY2hhcldpZHRoKGNtLmRpc3BsYXkpKSAtIGNvbERpZmYpKTtcbiAgfVxuICByZXR1cm4gY29vcmRzXG59XG5cbi8vIEZpbmQgdGhlIHZpZXcgZWxlbWVudCBjb3JyZXNwb25kaW5nIHRvIGEgZ2l2ZW4gbGluZS4gUmV0dXJuIG51bGxcbi8vIHdoZW4gdGhlIGxpbmUgaXNuJ3QgdmlzaWJsZS5cbmZ1bmN0aW9uIGZpbmRWaWV3SW5kZXgoY20sIG4pIHtcbiAgaWYgKG4gPj0gY20uZGlzcGxheS52aWV3VG8pIHsgcmV0dXJuIG51bGwgfVxuICBuIC09IGNtLmRpc3BsYXkudmlld0Zyb207XG4gIGlmIChuIDwgMCkgeyByZXR1cm4gbnVsbCB9XG4gIHZhciB2aWV3ID0gY20uZGlzcGxheS52aWV3O1xuICBmb3IgKHZhciBpID0gMDsgaSA8IHZpZXcubGVuZ3RoOyBpKyspIHtcbiAgICBuIC09IHZpZXdbaV0uc2l6ZTtcbiAgICBpZiAobiA8IDApIHsgcmV0dXJuIGkgfVxuICB9XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZVNlbGVjdGlvbihjbSkge1xuICBjbS5kaXNwbGF5LmlucHV0LnNob3dTZWxlY3Rpb24oY20uZGlzcGxheS5pbnB1dC5wcmVwYXJlU2VsZWN0aW9uKCkpO1xufVxuXG5mdW5jdGlvbiBwcmVwYXJlU2VsZWN0aW9uKGNtLCBwcmltYXJ5KSB7XG4gIGlmICggcHJpbWFyeSA9PT0gdm9pZCAwICkgcHJpbWFyeSA9IHRydWU7XG5cbiAgdmFyIGRvYyA9IGNtLmRvYywgcmVzdWx0ID0ge307XG4gIHZhciBjdXJGcmFnbWVudCA9IHJlc3VsdC5jdXJzb3JzID0gZG9jdW1lbnQuY3JlYXRlRG9jdW1lbnRGcmFnbWVudCgpO1xuICB2YXIgc2VsRnJhZ21lbnQgPSByZXN1bHQuc2VsZWN0aW9uID0gZG9jdW1lbnQuY3JlYXRlRG9jdW1lbnRGcmFnbWVudCgpO1xuXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgZG9jLnNlbC5yYW5nZXMubGVuZ3RoOyBpKyspIHtcbiAgICBpZiAoIXByaW1hcnkgJiYgaSA9PSBkb2Muc2VsLnByaW1JbmRleCkgeyBjb250aW51ZSB9XG4gICAgdmFyIHJhbmdlJCQxID0gZG9jLnNlbC5yYW5nZXNbaV07XG4gICAgaWYgKHJhbmdlJCQxLmZyb20oKS5saW5lID49IGNtLmRpc3BsYXkudmlld1RvIHx8IHJhbmdlJCQxLnRvKCkubGluZSA8IGNtLmRpc3BsYXkudmlld0Zyb20pIHsgY29udGludWUgfVxuICAgIHZhciBjb2xsYXBzZWQgPSByYW5nZSQkMS5lbXB0eSgpO1xuICAgIGlmIChjb2xsYXBzZWQgfHwgY20ub3B0aW9ucy5zaG93Q3Vyc29yV2hlblNlbGVjdGluZylcbiAgICAgIHsgZHJhd1NlbGVjdGlvbkN1cnNvcihjbSwgcmFuZ2UkJDEuaGVhZCwgY3VyRnJhZ21lbnQpOyB9XG4gICAgaWYgKCFjb2xsYXBzZWQpXG4gICAgICB7IGRyYXdTZWxlY3Rpb25SYW5nZShjbSwgcmFuZ2UkJDEsIHNlbEZyYWdtZW50KTsgfVxuICB9XG4gIHJldHVybiByZXN1bHRcbn1cblxuLy8gRHJhd3MgYSBjdXJzb3IgZm9yIHRoZSBnaXZlbiByYW5nZVxuZnVuY3Rpb24gZHJhd1NlbGVjdGlvbkN1cnNvcihjbSwgaGVhZCwgb3V0cHV0KSB7XG4gIHZhciBwb3MgPSBjdXJzb3JDb29yZHMoY20sIGhlYWQsIFwiZGl2XCIsIG51bGwsIG51bGwsICFjbS5vcHRpb25zLnNpbmdsZUN1cnNvckhlaWdodFBlckxpbmUpO1xuXG4gIHZhciBjdXJzb3IgPSBvdXRwdXQuYXBwZW5kQ2hpbGQoZWx0KFwiZGl2XCIsIFwiXFx1MDBhMFwiLCBcIkNvZGVNaXJyb3ItY3Vyc29yXCIpKTtcbiAgY3Vyc29yLnN0eWxlLmxlZnQgPSBwb3MubGVmdCArIFwicHhcIjtcbiAgY3Vyc29yLnN0eWxlLnRvcCA9IHBvcy50b3AgKyBcInB4XCI7XG4gIGN1cnNvci5zdHlsZS5oZWlnaHQgPSBNYXRoLm1heCgwLCBwb3MuYm90dG9tIC0gcG9zLnRvcCkgKiBjbS5vcHRpb25zLmN1cnNvckhlaWdodCArIFwicHhcIjtcblxuICBpZiAocG9zLm90aGVyKSB7XG4gICAgLy8gU2Vjb25kYXJ5IGN1cnNvciwgc2hvd24gd2hlbiBvbiBhICdqdW1wJyBpbiBiaS1kaXJlY3Rpb25hbCB0ZXh0XG4gICAgdmFyIG90aGVyQ3Vyc29yID0gb3V0cHV0LmFwcGVuZENoaWxkKGVsdChcImRpdlwiLCBcIlxcdTAwYTBcIiwgXCJDb2RlTWlycm9yLWN1cnNvciBDb2RlTWlycm9yLXNlY29uZGFyeWN1cnNvclwiKSk7XG4gICAgb3RoZXJDdXJzb3Iuc3R5bGUuZGlzcGxheSA9IFwiXCI7XG4gICAgb3RoZXJDdXJzb3Iuc3R5bGUubGVmdCA9IHBvcy5vdGhlci5sZWZ0ICsgXCJweFwiO1xuICAgIG90aGVyQ3Vyc29yLnN0eWxlLnRvcCA9IHBvcy5vdGhlci50b3AgKyBcInB4XCI7XG4gICAgb3RoZXJDdXJzb3Iuc3R5bGUuaGVpZ2h0ID0gKHBvcy5vdGhlci5ib3R0b20gLSBwb3Mub3RoZXIudG9wKSAqIC44NSArIFwicHhcIjtcbiAgfVxufVxuXG5mdW5jdGlvbiBjbXBDb29yZHMoYSwgYikgeyByZXR1cm4gYS50b3AgLSBiLnRvcCB8fCBhLmxlZnQgLSBiLmxlZnQgfVxuXG4vLyBEcmF3cyB0aGUgZ2l2ZW4gcmFuZ2UgYXMgYSBoaWdobGlnaHRlZCBzZWxlY3Rpb25cbmZ1bmN0aW9uIGRyYXdTZWxlY3Rpb25SYW5nZShjbSwgcmFuZ2UkJDEsIG91dHB1dCkge1xuICB2YXIgZGlzcGxheSA9IGNtLmRpc3BsYXksIGRvYyA9IGNtLmRvYztcbiAgdmFyIGZyYWdtZW50ID0gZG9jdW1lbnQuY3JlYXRlRG9jdW1lbnRGcmFnbWVudCgpO1xuICB2YXIgcGFkZGluZyA9IHBhZGRpbmdIKGNtLmRpc3BsYXkpLCBsZWZ0U2lkZSA9IHBhZGRpbmcubGVmdDtcbiAgdmFyIHJpZ2h0U2lkZSA9IE1hdGgubWF4KGRpc3BsYXkuc2l6ZXJXaWR0aCwgZGlzcGxheVdpZHRoKGNtKSAtIGRpc3BsYXkuc2l6ZXIub2Zmc2V0TGVmdCkgLSBwYWRkaW5nLnJpZ2h0O1xuICB2YXIgZG9jTFRSID0gZG9jLmRpcmVjdGlvbiA9PSBcImx0clwiO1xuXG4gIGZ1bmN0aW9uIGFkZChsZWZ0LCB0b3AsIHdpZHRoLCBib3R0b20pIHtcbiAgICBpZiAodG9wIDwgMCkgeyB0b3AgPSAwOyB9XG4gICAgdG9wID0gTWF0aC5yb3VuZCh0b3ApO1xuICAgIGJvdHRvbSA9IE1hdGgucm91bmQoYm90dG9tKTtcbiAgICBmcmFnbWVudC5hcHBlbmRDaGlsZChlbHQoXCJkaXZcIiwgbnVsbCwgXCJDb2RlTWlycm9yLXNlbGVjdGVkXCIsIChcInBvc2l0aW9uOiBhYnNvbHV0ZTsgbGVmdDogXCIgKyBsZWZ0ICsgXCJweDtcXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRvcDogXCIgKyB0b3AgKyBcInB4OyB3aWR0aDogXCIgKyAod2lkdGggPT0gbnVsbCA/IHJpZ2h0U2lkZSAtIGxlZnQgOiB3aWR0aCkgKyBcInB4O1xcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaGVpZ2h0OiBcIiArIChib3R0b20gLSB0b3ApICsgXCJweFwiKSkpO1xuICB9XG5cbiAgZnVuY3Rpb24gZHJhd0ZvckxpbmUobGluZSwgZnJvbUFyZywgdG9BcmcpIHtcbiAgICB2YXIgbGluZU9iaiA9IGdldExpbmUoZG9jLCBsaW5lKTtcbiAgICB2YXIgbGluZUxlbiA9IGxpbmVPYmoudGV4dC5sZW5ndGg7XG4gICAgdmFyIHN0YXJ0LCBlbmQ7XG4gICAgZnVuY3Rpb24gY29vcmRzKGNoLCBiaWFzKSB7XG4gICAgICByZXR1cm4gY2hhckNvb3JkcyhjbSwgUG9zKGxpbmUsIGNoKSwgXCJkaXZcIiwgbGluZU9iaiwgYmlhcylcbiAgICB9XG5cbiAgICBmdW5jdGlvbiB3cmFwWChwb3MsIGRpciwgc2lkZSkge1xuICAgICAgdmFyIGV4dGVudCA9IHdyYXBwZWRMaW5lRXh0ZW50Q2hhcihjbSwgbGluZU9iaiwgbnVsbCwgcG9zKTtcbiAgICAgIHZhciBwcm9wID0gKGRpciA9PSBcImx0clwiKSA9PSAoc2lkZSA9PSBcImFmdGVyXCIpID8gXCJsZWZ0XCIgOiBcInJpZ2h0XCI7XG4gICAgICB2YXIgY2ggPSBzaWRlID09IFwiYWZ0ZXJcIiA/IGV4dGVudC5iZWdpbiA6IGV4dGVudC5lbmQgLSAoL1xccy8udGVzdChsaW5lT2JqLnRleHQuY2hhckF0KGV4dGVudC5lbmQgLSAxKSkgPyAyIDogMSk7XG4gICAgICByZXR1cm4gY29vcmRzKGNoLCBwcm9wKVtwcm9wXVxuICAgIH1cblxuICAgIHZhciBvcmRlciA9IGdldE9yZGVyKGxpbmVPYmosIGRvYy5kaXJlY3Rpb24pO1xuICAgIGl0ZXJhdGVCaWRpU2VjdGlvbnMob3JkZXIsIGZyb21BcmcgfHwgMCwgdG9BcmcgPT0gbnVsbCA/IGxpbmVMZW4gOiB0b0FyZywgZnVuY3Rpb24gKGZyb20sIHRvLCBkaXIsIGkpIHtcbiAgICAgIHZhciBsdHIgPSBkaXIgPT0gXCJsdHJcIjtcbiAgICAgIHZhciBmcm9tUG9zID0gY29vcmRzKGZyb20sIGx0ciA/IFwibGVmdFwiIDogXCJyaWdodFwiKTtcbiAgICAgIHZhciB0b1BvcyA9IGNvb3Jkcyh0byAtIDEsIGx0ciA/IFwicmlnaHRcIiA6IFwibGVmdFwiKTtcblxuICAgICAgdmFyIG9wZW5TdGFydCA9IGZyb21BcmcgPT0gbnVsbCAmJiBmcm9tID09IDAsIG9wZW5FbmQgPSB0b0FyZyA9PSBudWxsICYmIHRvID09IGxpbmVMZW47XG4gICAgICB2YXIgZmlyc3QgPSBpID09IDAsIGxhc3QgPSAhb3JkZXIgfHwgaSA9PSBvcmRlci5sZW5ndGggLSAxO1xuICAgICAgaWYgKHRvUG9zLnRvcCAtIGZyb21Qb3MudG9wIDw9IDMpIHsgLy8gU2luZ2xlIGxpbmVcbiAgICAgICAgdmFyIG9wZW5MZWZ0ID0gKGRvY0xUUiA/IG9wZW5TdGFydCA6IG9wZW5FbmQpICYmIGZpcnN0O1xuICAgICAgICB2YXIgb3BlblJpZ2h0ID0gKGRvY0xUUiA/IG9wZW5FbmQgOiBvcGVuU3RhcnQpICYmIGxhc3Q7XG4gICAgICAgIHZhciBsZWZ0ID0gb3BlbkxlZnQgPyBsZWZ0U2lkZSA6IChsdHIgPyBmcm9tUG9zIDogdG9Qb3MpLmxlZnQ7XG4gICAgICAgIHZhciByaWdodCA9IG9wZW5SaWdodCA/IHJpZ2h0U2lkZSA6IChsdHIgPyB0b1BvcyA6IGZyb21Qb3MpLnJpZ2h0O1xuICAgICAgICBhZGQobGVmdCwgZnJvbVBvcy50b3AsIHJpZ2h0IC0gbGVmdCwgZnJvbVBvcy5ib3R0b20pO1xuICAgICAgfSBlbHNlIHsgLy8gTXVsdGlwbGUgbGluZXNcbiAgICAgICAgdmFyIHRvcExlZnQsIHRvcFJpZ2h0LCBib3RMZWZ0LCBib3RSaWdodDtcbiAgICAgICAgaWYgKGx0cikge1xuICAgICAgICAgIHRvcExlZnQgPSBkb2NMVFIgJiYgb3BlblN0YXJ0ICYmIGZpcnN0ID8gbGVmdFNpZGUgOiBmcm9tUG9zLmxlZnQ7XG4gICAgICAgICAgdG9wUmlnaHQgPSBkb2NMVFIgPyByaWdodFNpZGUgOiB3cmFwWChmcm9tLCBkaXIsIFwiYmVmb3JlXCIpO1xuICAgICAgICAgIGJvdExlZnQgPSBkb2NMVFIgPyBsZWZ0U2lkZSA6IHdyYXBYKHRvLCBkaXIsIFwiYWZ0ZXJcIik7XG4gICAgICAgICAgYm90UmlnaHQgPSBkb2NMVFIgJiYgb3BlbkVuZCAmJiBsYXN0ID8gcmlnaHRTaWRlIDogdG9Qb3MucmlnaHQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdG9wTGVmdCA9ICFkb2NMVFIgPyBsZWZ0U2lkZSA6IHdyYXBYKGZyb20sIGRpciwgXCJiZWZvcmVcIik7XG4gICAgICAgICAgdG9wUmlnaHQgPSAhZG9jTFRSICYmIG9wZW5TdGFydCAmJiBmaXJzdCA/IHJpZ2h0U2lkZSA6IGZyb21Qb3MucmlnaHQ7XG4gICAgICAgICAgYm90TGVmdCA9ICFkb2NMVFIgJiYgb3BlbkVuZCAmJiBsYXN0ID8gbGVmdFNpZGUgOiB0b1Bvcy5sZWZ0O1xuICAgICAgICAgIGJvdFJpZ2h0ID0gIWRvY0xUUiA/IHJpZ2h0U2lkZSA6IHdyYXBYKHRvLCBkaXIsIFwiYWZ0ZXJcIik7XG4gICAgICAgIH1cbiAgICAgICAgYWRkKHRvcExlZnQsIGZyb21Qb3MudG9wLCB0b3BSaWdodCAtIHRvcExlZnQsIGZyb21Qb3MuYm90dG9tKTtcbiAgICAgICAgaWYgKGZyb21Qb3MuYm90dG9tIDwgdG9Qb3MudG9wKSB7IGFkZChsZWZ0U2lkZSwgZnJvbVBvcy5ib3R0b20sIG51bGwsIHRvUG9zLnRvcCk7IH1cbiAgICAgICAgYWRkKGJvdExlZnQsIHRvUG9zLnRvcCwgYm90UmlnaHQgLSBib3RMZWZ0LCB0b1Bvcy5ib3R0b20pO1xuICAgICAgfVxuXG4gICAgICBpZiAoIXN0YXJ0IHx8IGNtcENvb3Jkcyhmcm9tUG9zLCBzdGFydCkgPCAwKSB7IHN0YXJ0ID0gZnJvbVBvczsgfVxuICAgICAgaWYgKGNtcENvb3Jkcyh0b1Bvcywgc3RhcnQpIDwgMCkgeyBzdGFydCA9IHRvUG9zOyB9XG4gICAgICBpZiAoIWVuZCB8fCBjbXBDb29yZHMoZnJvbVBvcywgZW5kKSA8IDApIHsgZW5kID0gZnJvbVBvczsgfVxuICAgICAgaWYgKGNtcENvb3Jkcyh0b1BvcywgZW5kKSA8IDApIHsgZW5kID0gdG9Qb3M7IH1cbiAgICB9KTtcbiAgICByZXR1cm4ge3N0YXJ0OiBzdGFydCwgZW5kOiBlbmR9XG4gIH1cblxuICB2YXIgc0Zyb20gPSByYW5nZSQkMS5mcm9tKCksIHNUbyA9IHJhbmdlJCQxLnRvKCk7XG4gIGlmIChzRnJvbS5saW5lID09IHNUby5saW5lKSB7XG4gICAgZHJhd0ZvckxpbmUoc0Zyb20ubGluZSwgc0Zyb20uY2gsIHNUby5jaCk7XG4gIH0gZWxzZSB7XG4gICAgdmFyIGZyb21MaW5lID0gZ2V0TGluZShkb2MsIHNGcm9tLmxpbmUpLCB0b0xpbmUgPSBnZXRMaW5lKGRvYywgc1RvLmxpbmUpO1xuICAgIHZhciBzaW5nbGVWTGluZSA9IHZpc3VhbExpbmUoZnJvbUxpbmUpID09IHZpc3VhbExpbmUodG9MaW5lKTtcbiAgICB2YXIgbGVmdEVuZCA9IGRyYXdGb3JMaW5lKHNGcm9tLmxpbmUsIHNGcm9tLmNoLCBzaW5nbGVWTGluZSA/IGZyb21MaW5lLnRleHQubGVuZ3RoICsgMSA6IG51bGwpLmVuZDtcbiAgICB2YXIgcmlnaHRTdGFydCA9IGRyYXdGb3JMaW5lKHNUby5saW5lLCBzaW5nbGVWTGluZSA/IDAgOiBudWxsLCBzVG8uY2gpLnN0YXJ0O1xuICAgIGlmIChzaW5nbGVWTGluZSkge1xuICAgICAgaWYgKGxlZnRFbmQudG9wIDwgcmlnaHRTdGFydC50b3AgLSAyKSB7XG4gICAgICAgIGFkZChsZWZ0RW5kLnJpZ2h0LCBsZWZ0RW5kLnRvcCwgbnVsbCwgbGVmdEVuZC5ib3R0b20pO1xuICAgICAgICBhZGQobGVmdFNpZGUsIHJpZ2h0U3RhcnQudG9wLCByaWdodFN0YXJ0LmxlZnQsIHJpZ2h0U3RhcnQuYm90dG9tKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGFkZChsZWZ0RW5kLnJpZ2h0LCBsZWZ0RW5kLnRvcCwgcmlnaHRTdGFydC5sZWZ0IC0gbGVmdEVuZC5yaWdodCwgbGVmdEVuZC5ib3R0b20pO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAobGVmdEVuZC5ib3R0b20gPCByaWdodFN0YXJ0LnRvcClcbiAgICAgIHsgYWRkKGxlZnRTaWRlLCBsZWZ0RW5kLmJvdHRvbSwgbnVsbCwgcmlnaHRTdGFydC50b3ApOyB9XG4gIH1cblxuICBvdXRwdXQuYXBwZW5kQ2hpbGQoZnJhZ21lbnQpO1xufVxuXG4vLyBDdXJzb3ItYmxpbmtpbmdcbmZ1bmN0aW9uIHJlc3RhcnRCbGluayhjbSkge1xuICBpZiAoIWNtLnN0YXRlLmZvY3VzZWQpIHsgcmV0dXJuIH1cbiAgdmFyIGRpc3BsYXkgPSBjbS5kaXNwbGF5O1xuICBjbGVhckludGVydmFsKGRpc3BsYXkuYmxpbmtlcik7XG4gIHZhciBvbiA9IHRydWU7XG4gIGRpc3BsYXkuY3Vyc29yRGl2LnN0eWxlLnZpc2liaWxpdHkgPSBcIlwiO1xuICBpZiAoY20ub3B0aW9ucy5jdXJzb3JCbGlua1JhdGUgPiAwKVxuICAgIHsgZGlzcGxheS5ibGlua2VyID0gc2V0SW50ZXJ2YWwoZnVuY3Rpb24gKCkgeyByZXR1cm4gZGlzcGxheS5jdXJzb3JEaXYuc3R5bGUudmlzaWJpbGl0eSA9IChvbiA9ICFvbikgPyBcIlwiIDogXCJoaWRkZW5cIjsgfSxcbiAgICAgIGNtLm9wdGlvbnMuY3Vyc29yQmxpbmtSYXRlKTsgfVxuICBlbHNlIGlmIChjbS5vcHRpb25zLmN1cnNvckJsaW5rUmF0ZSA8IDApXG4gICAgeyBkaXNwbGF5LmN1cnNvckRpdi5zdHlsZS52aXNpYmlsaXR5ID0gXCJoaWRkZW5cIjsgfVxufVxuXG5mdW5jdGlvbiBlbnN1cmVGb2N1cyhjbSkge1xuICBpZiAoIWNtLnN0YXRlLmZvY3VzZWQpIHsgY20uZGlzcGxheS5pbnB1dC5mb2N1cygpOyBvbkZvY3VzKGNtKTsgfVxufVxuXG5mdW5jdGlvbiBkZWxheUJsdXJFdmVudChjbSkge1xuICBjbS5zdGF0ZS5kZWxheWluZ0JsdXJFdmVudCA9IHRydWU7XG4gIHNldFRpbWVvdXQoZnVuY3Rpb24gKCkgeyBpZiAoY20uc3RhdGUuZGVsYXlpbmdCbHVyRXZlbnQpIHtcbiAgICBjbS5zdGF0ZS5kZWxheWluZ0JsdXJFdmVudCA9IGZhbHNlO1xuICAgIG9uQmx1cihjbSk7XG4gIH0gfSwgMTAwKTtcbn1cblxuZnVuY3Rpb24gb25Gb2N1cyhjbSwgZSkge1xuICBpZiAoY20uc3RhdGUuZGVsYXlpbmdCbHVyRXZlbnQpIHsgY20uc3RhdGUuZGVsYXlpbmdCbHVyRXZlbnQgPSBmYWxzZTsgfVxuXG4gIGlmIChjbS5vcHRpb25zLnJlYWRPbmx5ID09IFwibm9jdXJzb3JcIikgeyByZXR1cm4gfVxuICBpZiAoIWNtLnN0YXRlLmZvY3VzZWQpIHtcbiAgICBzaWduYWwoY20sIFwiZm9jdXNcIiwgY20sIGUpO1xuICAgIGNtLnN0YXRlLmZvY3VzZWQgPSB0cnVlO1xuICAgIGFkZENsYXNzKGNtLmRpc3BsYXkud3JhcHBlciwgXCJDb2RlTWlycm9yLWZvY3VzZWRcIik7XG4gICAgLy8gVGhpcyB0ZXN0IHByZXZlbnRzIHRoaXMgZnJvbSBmaXJpbmcgd2hlbiBhIGNvbnRleHRcbiAgICAvLyBtZW51IGlzIGNsb3NlZCAoc2luY2UgdGhlIGlucHV0IHJlc2V0IHdvdWxkIGtpbGwgdGhlXG4gICAgLy8gc2VsZWN0LWFsbCBkZXRlY3Rpb24gaGFjaylcbiAgICBpZiAoIWNtLmN1ck9wICYmIGNtLmRpc3BsYXkuc2VsRm9yQ29udGV4dE1lbnUgIT0gY20uZG9jLnNlbCkge1xuICAgICAgY20uZGlzcGxheS5pbnB1dC5yZXNldCgpO1xuICAgICAgaWYgKHdlYmtpdCkgeyBzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHsgcmV0dXJuIGNtLmRpc3BsYXkuaW5wdXQucmVzZXQodHJ1ZSk7IH0sIDIwKTsgfSAvLyBJc3N1ZSAjMTczMFxuICAgIH1cbiAgICBjbS5kaXNwbGF5LmlucHV0LnJlY2VpdmVkRm9jdXMoKTtcbiAgfVxuICByZXN0YXJ0QmxpbmsoY20pO1xufVxuZnVuY3Rpb24gb25CbHVyKGNtLCBlKSB7XG4gIGlmIChjbS5zdGF0ZS5kZWxheWluZ0JsdXJFdmVudCkgeyByZXR1cm4gfVxuXG4gIGlmIChjbS5zdGF0ZS5mb2N1c2VkKSB7XG4gICAgc2lnbmFsKGNtLCBcImJsdXJcIiwgY20sIGUpO1xuICAgIGNtLnN0YXRlLmZvY3VzZWQgPSBmYWxzZTtcbiAgICBybUNsYXNzKGNtLmRpc3BsYXkud3JhcHBlciwgXCJDb2RlTWlycm9yLWZvY3VzZWRcIik7XG4gIH1cbiAgY2xlYXJJbnRlcnZhbChjbS5kaXNwbGF5LmJsaW5rZXIpO1xuICBzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHsgaWYgKCFjbS5zdGF0ZS5mb2N1c2VkKSB7IGNtLmRpc3BsYXkuc2hpZnQgPSBmYWxzZTsgfSB9LCAxNTApO1xufVxuXG4vLyBSZWFkIHRoZSBhY3R1YWwgaGVpZ2h0cyBvZiB0aGUgcmVuZGVyZWQgbGluZXMsIGFuZCB1cGRhdGUgdGhlaXJcbi8vIHN0b3JlZCBoZWlnaHRzIHRvIG1hdGNoLlxuZnVuY3Rpb24gdXBkYXRlSGVpZ2h0c0luVmlld3BvcnQoY20pIHtcbiAgdmFyIGRpc3BsYXkgPSBjbS5kaXNwbGF5O1xuICB2YXIgcHJldkJvdHRvbSA9IGRpc3BsYXkubGluZURpdi5vZmZzZXRUb3A7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgZGlzcGxheS52aWV3Lmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIGN1ciA9IGRpc3BsYXkudmlld1tpXSwgaGVpZ2h0ID0gKHZvaWQgMCk7XG4gICAgaWYgKGN1ci5oaWRkZW4pIHsgY29udGludWUgfVxuICAgIGlmIChpZSAmJiBpZV92ZXJzaW9uIDwgOCkge1xuICAgICAgdmFyIGJvdCA9IGN1ci5ub2RlLm9mZnNldFRvcCArIGN1ci5ub2RlLm9mZnNldEhlaWdodDtcbiAgICAgIGhlaWdodCA9IGJvdCAtIHByZXZCb3R0b207XG4gICAgICBwcmV2Qm90dG9tID0gYm90O1xuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgYm94ID0gY3VyLm5vZGUuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gICAgICBoZWlnaHQgPSBib3guYm90dG9tIC0gYm94LnRvcDtcbiAgICB9XG4gICAgdmFyIGRpZmYgPSBjdXIubGluZS5oZWlnaHQgLSBoZWlnaHQ7XG4gICAgaWYgKGhlaWdodCA8IDIpIHsgaGVpZ2h0ID0gdGV4dEhlaWdodChkaXNwbGF5KTsgfVxuICAgIGlmIChkaWZmID4gLjAwNSB8fCBkaWZmIDwgLS4wMDUpIHtcbiAgICAgIHVwZGF0ZUxpbmVIZWlnaHQoY3VyLmxpbmUsIGhlaWdodCk7XG4gICAgICB1cGRhdGVXaWRnZXRIZWlnaHQoY3VyLmxpbmUpO1xuICAgICAgaWYgKGN1ci5yZXN0KSB7IGZvciAodmFyIGogPSAwOyBqIDwgY3VyLnJlc3QubGVuZ3RoOyBqKyspXG4gICAgICAgIHsgdXBkYXRlV2lkZ2V0SGVpZ2h0KGN1ci5yZXN0W2pdKTsgfSB9XG4gICAgfVxuICB9XG59XG5cbi8vIFJlYWQgYW5kIHN0b3JlIHRoZSBoZWlnaHQgb2YgbGluZSB3aWRnZXRzIGFzc29jaWF0ZWQgd2l0aCB0aGVcbi8vIGdpdmVuIGxpbmUuXG5mdW5jdGlvbiB1cGRhdGVXaWRnZXRIZWlnaHQobGluZSkge1xuICBpZiAobGluZS53aWRnZXRzKSB7IGZvciAodmFyIGkgPSAwOyBpIDwgbGluZS53aWRnZXRzLmxlbmd0aDsgKytpKSB7XG4gICAgdmFyIHcgPSBsaW5lLndpZGdldHNbaV0sIHBhcmVudCA9IHcubm9kZS5wYXJlbnROb2RlO1xuICAgIGlmIChwYXJlbnQpIHsgdy5oZWlnaHQgPSBwYXJlbnQub2Zmc2V0SGVpZ2h0OyB9XG4gIH0gfVxufVxuXG4vLyBDb21wdXRlIHRoZSBsaW5lcyB0aGF0IGFyZSB2aXNpYmxlIGluIGEgZ2l2ZW4gdmlld3BvcnQgKGRlZmF1bHRzXG4vLyB0aGUgdGhlIGN1cnJlbnQgc2Nyb2xsIHBvc2l0aW9uKS4gdmlld3BvcnQgbWF5IGNvbnRhaW4gdG9wLFxuLy8gaGVpZ2h0LCBhbmQgZW5zdXJlIChzZWUgb3Auc2Nyb2xsVG9Qb3MpIHByb3BlcnRpZXMuXG5mdW5jdGlvbiB2aXNpYmxlTGluZXMoZGlzcGxheSwgZG9jLCB2aWV3cG9ydCkge1xuICB2YXIgdG9wID0gdmlld3BvcnQgJiYgdmlld3BvcnQudG9wICE9IG51bGwgPyBNYXRoLm1heCgwLCB2aWV3cG9ydC50b3ApIDogZGlzcGxheS5zY3JvbGxlci5zY3JvbGxUb3A7XG4gIHRvcCA9IE1hdGguZmxvb3IodG9wIC0gcGFkZGluZ1RvcChkaXNwbGF5KSk7XG4gIHZhciBib3R0b20gPSB2aWV3cG9ydCAmJiB2aWV3cG9ydC5ib3R0b20gIT0gbnVsbCA/IHZpZXdwb3J0LmJvdHRvbSA6IHRvcCArIGRpc3BsYXkud3JhcHBlci5jbGllbnRIZWlnaHQ7XG5cbiAgdmFyIGZyb20gPSBsaW5lQXRIZWlnaHQoZG9jLCB0b3ApLCB0byA9IGxpbmVBdEhlaWdodChkb2MsIGJvdHRvbSk7XG4gIC8vIEVuc3VyZSBpcyBhIHtmcm9tOiB7bGluZSwgY2h9LCB0bzoge2xpbmUsIGNofX0gb2JqZWN0LCBhbmRcbiAgLy8gZm9yY2VzIHRob3NlIGxpbmVzIGludG8gdGhlIHZpZXdwb3J0IChpZiBwb3NzaWJsZSkuXG4gIGlmICh2aWV3cG9ydCAmJiB2aWV3cG9ydC5lbnN1cmUpIHtcbiAgICB2YXIgZW5zdXJlRnJvbSA9IHZpZXdwb3J0LmVuc3VyZS5mcm9tLmxpbmUsIGVuc3VyZVRvID0gdmlld3BvcnQuZW5zdXJlLnRvLmxpbmU7XG4gICAgaWYgKGVuc3VyZUZyb20gPCBmcm9tKSB7XG4gICAgICBmcm9tID0gZW5zdXJlRnJvbTtcbiAgICAgIHRvID0gbGluZUF0SGVpZ2h0KGRvYywgaGVpZ2h0QXRMaW5lKGdldExpbmUoZG9jLCBlbnN1cmVGcm9tKSkgKyBkaXNwbGF5LndyYXBwZXIuY2xpZW50SGVpZ2h0KTtcbiAgICB9IGVsc2UgaWYgKE1hdGgubWluKGVuc3VyZVRvLCBkb2MubGFzdExpbmUoKSkgPj0gdG8pIHtcbiAgICAgIGZyb20gPSBsaW5lQXRIZWlnaHQoZG9jLCBoZWlnaHRBdExpbmUoZ2V0TGluZShkb2MsIGVuc3VyZVRvKSkgLSBkaXNwbGF5LndyYXBwZXIuY2xpZW50SGVpZ2h0KTtcbiAgICAgIHRvID0gZW5zdXJlVG87XG4gICAgfVxuICB9XG4gIHJldHVybiB7ZnJvbTogZnJvbSwgdG86IE1hdGgubWF4KHRvLCBmcm9tICsgMSl9XG59XG5cbi8vIFJlLWFsaWduIGxpbmUgbnVtYmVycyBhbmQgZ3V0dGVyIG1hcmtzIHRvIGNvbXBlbnNhdGUgZm9yXG4vLyBob3Jpem9udGFsIHNjcm9sbGluZy5cbmZ1bmN0aW9uIGFsaWduSG9yaXpvbnRhbGx5KGNtKSB7XG4gIHZhciBkaXNwbGF5ID0gY20uZGlzcGxheSwgdmlldyA9IGRpc3BsYXkudmlldztcbiAgaWYgKCFkaXNwbGF5LmFsaWduV2lkZ2V0cyAmJiAoIWRpc3BsYXkuZ3V0dGVycy5maXJzdENoaWxkIHx8ICFjbS5vcHRpb25zLmZpeGVkR3V0dGVyKSkgeyByZXR1cm4gfVxuICB2YXIgY29tcCA9IGNvbXBlbnNhdGVGb3JIU2Nyb2xsKGRpc3BsYXkpIC0gZGlzcGxheS5zY3JvbGxlci5zY3JvbGxMZWZ0ICsgY20uZG9jLnNjcm9sbExlZnQ7XG4gIHZhciBndXR0ZXJXID0gZGlzcGxheS5ndXR0ZXJzLm9mZnNldFdpZHRoLCBsZWZ0ID0gY29tcCArIFwicHhcIjtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCB2aWV3Lmxlbmd0aDsgaSsrKSB7IGlmICghdmlld1tpXS5oaWRkZW4pIHtcbiAgICBpZiAoY20ub3B0aW9ucy5maXhlZEd1dHRlcikge1xuICAgICAgaWYgKHZpZXdbaV0uZ3V0dGVyKVxuICAgICAgICB7IHZpZXdbaV0uZ3V0dGVyLnN0eWxlLmxlZnQgPSBsZWZ0OyB9XG4gICAgICBpZiAodmlld1tpXS5ndXR0ZXJCYWNrZ3JvdW5kKVxuICAgICAgICB7IHZpZXdbaV0uZ3V0dGVyQmFja2dyb3VuZC5zdHlsZS5sZWZ0ID0gbGVmdDsgfVxuICAgIH1cbiAgICB2YXIgYWxpZ24gPSB2aWV3W2ldLmFsaWduYWJsZTtcbiAgICBpZiAoYWxpZ24pIHsgZm9yICh2YXIgaiA9IDA7IGogPCBhbGlnbi5sZW5ndGg7IGorKylcbiAgICAgIHsgYWxpZ25bal0uc3R5bGUubGVmdCA9IGxlZnQ7IH0gfVxuICB9IH1cbiAgaWYgKGNtLm9wdGlvbnMuZml4ZWRHdXR0ZXIpXG4gICAgeyBkaXNwbGF5Lmd1dHRlcnMuc3R5bGUubGVmdCA9IChjb21wICsgZ3V0dGVyVykgKyBcInB4XCI7IH1cbn1cblxuLy8gVXNlZCB0byBlbnN1cmUgdGhhdCB0aGUgbGluZSBudW1iZXIgZ3V0dGVyIGlzIHN0aWxsIHRoZSByaWdodFxuLy8gc2l6ZSBmb3IgdGhlIGN1cnJlbnQgZG9jdW1lbnQgc2l6ZS4gUmV0dXJucyB0cnVlIHdoZW4gYW4gdXBkYXRlXG4vLyBpcyBuZWVkZWQuXG5mdW5jdGlvbiBtYXliZVVwZGF0ZUxpbmVOdW1iZXJXaWR0aChjbSkge1xuICBpZiAoIWNtLm9wdGlvbnMubGluZU51bWJlcnMpIHsgcmV0dXJuIGZhbHNlIH1cbiAgdmFyIGRvYyA9IGNtLmRvYywgbGFzdCA9IGxpbmVOdW1iZXJGb3IoY20ub3B0aW9ucywgZG9jLmZpcnN0ICsgZG9jLnNpemUgLSAxKSwgZGlzcGxheSA9IGNtLmRpc3BsYXk7XG4gIGlmIChsYXN0Lmxlbmd0aCAhPSBkaXNwbGF5LmxpbmVOdW1DaGFycykge1xuICAgIHZhciB0ZXN0ID0gZGlzcGxheS5tZWFzdXJlLmFwcGVuZENoaWxkKGVsdChcImRpdlwiLCBbZWx0KFwiZGl2XCIsIGxhc3QpXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJDb2RlTWlycm9yLWxpbmVudW1iZXIgQ29kZU1pcnJvci1ndXR0ZXItZWx0XCIpKTtcbiAgICB2YXIgaW5uZXJXID0gdGVzdC5maXJzdENoaWxkLm9mZnNldFdpZHRoLCBwYWRkaW5nID0gdGVzdC5vZmZzZXRXaWR0aCAtIGlubmVyVztcbiAgICBkaXNwbGF5LmxpbmVHdXR0ZXIuc3R5bGUud2lkdGggPSBcIlwiO1xuICAgIGRpc3BsYXkubGluZU51bUlubmVyV2lkdGggPSBNYXRoLm1heChpbm5lclcsIGRpc3BsYXkubGluZUd1dHRlci5vZmZzZXRXaWR0aCAtIHBhZGRpbmcpICsgMTtcbiAgICBkaXNwbGF5LmxpbmVOdW1XaWR0aCA9IGRpc3BsYXkubGluZU51bUlubmVyV2lkdGggKyBwYWRkaW5nO1xuICAgIGRpc3BsYXkubGluZU51bUNoYXJzID0gZGlzcGxheS5saW5lTnVtSW5uZXJXaWR0aCA/IGxhc3QubGVuZ3RoIDogLTE7XG4gICAgZGlzcGxheS5saW5lR3V0dGVyLnN0eWxlLndpZHRoID0gZGlzcGxheS5saW5lTnVtV2lkdGggKyBcInB4XCI7XG4gICAgdXBkYXRlR3V0dGVyU3BhY2UoY20pO1xuICAgIHJldHVybiB0cnVlXG4gIH1cbiAgcmV0dXJuIGZhbHNlXG59XG5cbi8vIFNDUk9MTElORyBUSElOR1MgSU5UTyBWSUVXXG5cbi8vIElmIGFuIGVkaXRvciBzaXRzIG9uIHRoZSB0b3Agb3IgYm90dG9tIG9mIHRoZSB3aW5kb3csIHBhcnRpYWxseVxuLy8gc2Nyb2xsZWQgb3V0IG9mIHZpZXcsIHRoaXMgZW5zdXJlcyB0aGF0IHRoZSBjdXJzb3IgaXMgdmlzaWJsZS5cbmZ1bmN0aW9uIG1heWJlU2Nyb2xsV2luZG93KGNtLCByZWN0KSB7XG4gIGlmIChzaWduYWxET01FdmVudChjbSwgXCJzY3JvbGxDdXJzb3JJbnRvVmlld1wiKSkgeyByZXR1cm4gfVxuXG4gIHZhciBkaXNwbGF5ID0gY20uZGlzcGxheSwgYm94ID0gZGlzcGxheS5zaXplci5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKSwgZG9TY3JvbGwgPSBudWxsO1xuICBpZiAocmVjdC50b3AgKyBib3gudG9wIDwgMCkgeyBkb1Njcm9sbCA9IHRydWU7IH1cbiAgZWxzZSBpZiAocmVjdC5ib3R0b20gKyBib3gudG9wID4gKHdpbmRvdy5pbm5lckhlaWdodCB8fCBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuY2xpZW50SGVpZ2h0KSkgeyBkb1Njcm9sbCA9IGZhbHNlOyB9XG4gIGlmIChkb1Njcm9sbCAhPSBudWxsICYmICFwaGFudG9tKSB7XG4gICAgdmFyIHNjcm9sbE5vZGUgPSBlbHQoXCJkaXZcIiwgXCJcXHUyMDBiXCIsIG51bGwsIChcInBvc2l0aW9uOiBhYnNvbHV0ZTtcXG4gICAgICAgICAgICAgICAgICAgICAgICAgdG9wOiBcIiArIChyZWN0LnRvcCAtIGRpc3BsYXkudmlld09mZnNldCAtIHBhZGRpbmdUb3AoY20uZGlzcGxheSkpICsgXCJweDtcXG4gICAgICAgICAgICAgICAgICAgICAgICAgaGVpZ2h0OiBcIiArIChyZWN0LmJvdHRvbSAtIHJlY3QudG9wICsgc2Nyb2xsR2FwKGNtKSArIGRpc3BsYXkuYmFySGVpZ2h0KSArIFwicHg7XFxuICAgICAgICAgICAgICAgICAgICAgICAgIGxlZnQ6IFwiICsgKHJlY3QubGVmdCkgKyBcInB4OyB3aWR0aDogXCIgKyAoTWF0aC5tYXgoMiwgcmVjdC5yaWdodCAtIHJlY3QubGVmdCkpICsgXCJweDtcIikpO1xuICAgIGNtLmRpc3BsYXkubGluZVNwYWNlLmFwcGVuZENoaWxkKHNjcm9sbE5vZGUpO1xuICAgIHNjcm9sbE5vZGUuc2Nyb2xsSW50b1ZpZXcoZG9TY3JvbGwpO1xuICAgIGNtLmRpc3BsYXkubGluZVNwYWNlLnJlbW92ZUNoaWxkKHNjcm9sbE5vZGUpO1xuICB9XG59XG5cbi8vIFNjcm9sbCBhIGdpdmVuIHBvc2l0aW9uIGludG8gdmlldyAoaW1tZWRpYXRlbHkpLCB2ZXJpZnlpbmcgdGhhdFxuLy8gaXQgYWN0dWFsbHkgYmVjYW1lIHZpc2libGUgKGFzIGxpbmUgaGVpZ2h0cyBhcmUgYWNjdXJhdGVseVxuLy8gbWVhc3VyZWQsIHRoZSBwb3NpdGlvbiBvZiBzb21ldGhpbmcgbWF5ICdkcmlmdCcgZHVyaW5nIGRyYXdpbmcpLlxuZnVuY3Rpb24gc2Nyb2xsUG9zSW50b1ZpZXcoY20sIHBvcywgZW5kLCBtYXJnaW4pIHtcbiAgaWYgKG1hcmdpbiA9PSBudWxsKSB7IG1hcmdpbiA9IDA7IH1cbiAgdmFyIHJlY3Q7XG4gIGlmICghY20ub3B0aW9ucy5saW5lV3JhcHBpbmcgJiYgcG9zID09IGVuZCkge1xuICAgIC8vIFNldCBwb3MgYW5kIGVuZCB0byB0aGUgY3Vyc29yIHBvc2l0aW9ucyBhcm91bmQgdGhlIGNoYXJhY3RlciBwb3Mgc3RpY2tzIHRvXG4gICAgLy8gSWYgcG9zLnN0aWNreSA9PSBcImJlZm9yZVwiLCB0aGF0IGlzIGFyb3VuZCBwb3MuY2ggLSAxLCBvdGhlcndpc2UgYXJvdW5kIHBvcy5jaFxuICAgIC8vIElmIHBvcyA9PSBQb3MoXywgMCwgXCJiZWZvcmVcIiksIHBvcyBhbmQgZW5kIGFyZSB1bmNoYW5nZWRcbiAgICBwb3MgPSBwb3MuY2ggPyBQb3MocG9zLmxpbmUsIHBvcy5zdGlja3kgPT0gXCJiZWZvcmVcIiA/IHBvcy5jaCAtIDEgOiBwb3MuY2gsIFwiYWZ0ZXJcIikgOiBwb3M7XG4gICAgZW5kID0gcG9zLnN0aWNreSA9PSBcImJlZm9yZVwiID8gUG9zKHBvcy5saW5lLCBwb3MuY2ggKyAxLCBcImJlZm9yZVwiKSA6IHBvcztcbiAgfVxuICBmb3IgKHZhciBsaW1pdCA9IDA7IGxpbWl0IDwgNTsgbGltaXQrKykge1xuICAgIHZhciBjaGFuZ2VkID0gZmFsc2U7XG4gICAgdmFyIGNvb3JkcyA9IGN1cnNvckNvb3JkcyhjbSwgcG9zKTtcbiAgICB2YXIgZW5kQ29vcmRzID0gIWVuZCB8fCBlbmQgPT0gcG9zID8gY29vcmRzIDogY3Vyc29yQ29vcmRzKGNtLCBlbmQpO1xuICAgIHJlY3QgPSB7bGVmdDogTWF0aC5taW4oY29vcmRzLmxlZnQsIGVuZENvb3Jkcy5sZWZ0KSxcbiAgICAgICAgICAgIHRvcDogTWF0aC5taW4oY29vcmRzLnRvcCwgZW5kQ29vcmRzLnRvcCkgLSBtYXJnaW4sXG4gICAgICAgICAgICByaWdodDogTWF0aC5tYXgoY29vcmRzLmxlZnQsIGVuZENvb3Jkcy5sZWZ0KSxcbiAgICAgICAgICAgIGJvdHRvbTogTWF0aC5tYXgoY29vcmRzLmJvdHRvbSwgZW5kQ29vcmRzLmJvdHRvbSkgKyBtYXJnaW59O1xuICAgIHZhciBzY3JvbGxQb3MgPSBjYWxjdWxhdGVTY3JvbGxQb3MoY20sIHJlY3QpO1xuICAgIHZhciBzdGFydFRvcCA9IGNtLmRvYy5zY3JvbGxUb3AsIHN0YXJ0TGVmdCA9IGNtLmRvYy5zY3JvbGxMZWZ0O1xuICAgIGlmIChzY3JvbGxQb3Muc2Nyb2xsVG9wICE9IG51bGwpIHtcbiAgICAgIHVwZGF0ZVNjcm9sbFRvcChjbSwgc2Nyb2xsUG9zLnNjcm9sbFRvcCk7XG4gICAgICBpZiAoTWF0aC5hYnMoY20uZG9jLnNjcm9sbFRvcCAtIHN0YXJ0VG9wKSA+IDEpIHsgY2hhbmdlZCA9IHRydWU7IH1cbiAgICB9XG4gICAgaWYgKHNjcm9sbFBvcy5zY3JvbGxMZWZ0ICE9IG51bGwpIHtcbiAgICAgIHNldFNjcm9sbExlZnQoY20sIHNjcm9sbFBvcy5zY3JvbGxMZWZ0KTtcbiAgICAgIGlmIChNYXRoLmFicyhjbS5kb2Muc2Nyb2xsTGVmdCAtIHN0YXJ0TGVmdCkgPiAxKSB7IGNoYW5nZWQgPSB0cnVlOyB9XG4gICAgfVxuICAgIGlmICghY2hhbmdlZCkgeyBicmVhayB9XG4gIH1cbiAgcmV0dXJuIHJlY3Rcbn1cblxuLy8gU2Nyb2xsIGEgZ2l2ZW4gc2V0IG9mIGNvb3JkaW5hdGVzIGludG8gdmlldyAoaW1tZWRpYXRlbHkpLlxuZnVuY3Rpb24gc2Nyb2xsSW50b1ZpZXcoY20sIHJlY3QpIHtcbiAgdmFyIHNjcm9sbFBvcyA9IGNhbGN1bGF0ZVNjcm9sbFBvcyhjbSwgcmVjdCk7XG4gIGlmIChzY3JvbGxQb3Muc2Nyb2xsVG9wICE9IG51bGwpIHsgdXBkYXRlU2Nyb2xsVG9wKGNtLCBzY3JvbGxQb3Muc2Nyb2xsVG9wKTsgfVxuICBpZiAoc2Nyb2xsUG9zLnNjcm9sbExlZnQgIT0gbnVsbCkgeyBzZXRTY3JvbGxMZWZ0KGNtLCBzY3JvbGxQb3Muc2Nyb2xsTGVmdCk7IH1cbn1cblxuLy8gQ2FsY3VsYXRlIGEgbmV3IHNjcm9sbCBwb3NpdGlvbiBuZWVkZWQgdG8gc2Nyb2xsIHRoZSBnaXZlblxuLy8gcmVjdGFuZ2xlIGludG8gdmlldy4gUmV0dXJucyBhbiBvYmplY3Qgd2l0aCBzY3JvbGxUb3AgYW5kXG4vLyBzY3JvbGxMZWZ0IHByb3BlcnRpZXMuIFdoZW4gdGhlc2UgYXJlIHVuZGVmaW5lZCwgdGhlXG4vLyB2ZXJ0aWNhbC9ob3Jpem9udGFsIHBvc2l0aW9uIGRvZXMgbm90IG5lZWQgdG8gYmUgYWRqdXN0ZWQuXG5mdW5jdGlvbiBjYWxjdWxhdGVTY3JvbGxQb3MoY20sIHJlY3QpIHtcbiAgdmFyIGRpc3BsYXkgPSBjbS5kaXNwbGF5LCBzbmFwTWFyZ2luID0gdGV4dEhlaWdodChjbS5kaXNwbGF5KTtcbiAgaWYgKHJlY3QudG9wIDwgMCkgeyByZWN0LnRvcCA9IDA7IH1cbiAgdmFyIHNjcmVlbnRvcCA9IGNtLmN1ck9wICYmIGNtLmN1ck9wLnNjcm9sbFRvcCAhPSBudWxsID8gY20uY3VyT3Auc2Nyb2xsVG9wIDogZGlzcGxheS5zY3JvbGxlci5zY3JvbGxUb3A7XG4gIHZhciBzY3JlZW4gPSBkaXNwbGF5SGVpZ2h0KGNtKSwgcmVzdWx0ID0ge307XG4gIGlmIChyZWN0LmJvdHRvbSAtIHJlY3QudG9wID4gc2NyZWVuKSB7IHJlY3QuYm90dG9tID0gcmVjdC50b3AgKyBzY3JlZW47IH1cbiAgdmFyIGRvY0JvdHRvbSA9IGNtLmRvYy5oZWlnaHQgKyBwYWRkaW5nVmVydChkaXNwbGF5KTtcbiAgdmFyIGF0VG9wID0gcmVjdC50b3AgPCBzbmFwTWFyZ2luLCBhdEJvdHRvbSA9IHJlY3QuYm90dG9tID4gZG9jQm90dG9tIC0gc25hcE1hcmdpbjtcbiAgaWYgKHJlY3QudG9wIDwgc2NyZWVudG9wKSB7XG4gICAgcmVzdWx0LnNjcm9sbFRvcCA9IGF0VG9wID8gMCA6IHJlY3QudG9wO1xuICB9IGVsc2UgaWYgKHJlY3QuYm90dG9tID4gc2NyZWVudG9wICsgc2NyZWVuKSB7XG4gICAgdmFyIG5ld1RvcCA9IE1hdGgubWluKHJlY3QudG9wLCAoYXRCb3R0b20gPyBkb2NCb3R0b20gOiByZWN0LmJvdHRvbSkgLSBzY3JlZW4pO1xuICAgIGlmIChuZXdUb3AgIT0gc2NyZWVudG9wKSB7IHJlc3VsdC5zY3JvbGxUb3AgPSBuZXdUb3A7IH1cbiAgfVxuXG4gIHZhciBzY3JlZW5sZWZ0ID0gY20uY3VyT3AgJiYgY20uY3VyT3Auc2Nyb2xsTGVmdCAhPSBudWxsID8gY20uY3VyT3Auc2Nyb2xsTGVmdCA6IGRpc3BsYXkuc2Nyb2xsZXIuc2Nyb2xsTGVmdDtcbiAgdmFyIHNjcmVlbncgPSBkaXNwbGF5V2lkdGgoY20pIC0gKGNtLm9wdGlvbnMuZml4ZWRHdXR0ZXIgPyBkaXNwbGF5Lmd1dHRlcnMub2Zmc2V0V2lkdGggOiAwKTtcbiAgdmFyIHRvb1dpZGUgPSByZWN0LnJpZ2h0IC0gcmVjdC5sZWZ0ID4gc2NyZWVudztcbiAgaWYgKHRvb1dpZGUpIHsgcmVjdC5yaWdodCA9IHJlY3QubGVmdCArIHNjcmVlbnc7IH1cbiAgaWYgKHJlY3QubGVmdCA8IDEwKVxuICAgIHsgcmVzdWx0LnNjcm9sbExlZnQgPSAwOyB9XG4gIGVsc2UgaWYgKHJlY3QubGVmdCA8IHNjcmVlbmxlZnQpXG4gICAgeyByZXN1bHQuc2Nyb2xsTGVmdCA9IE1hdGgubWF4KDAsIHJlY3QubGVmdCAtICh0b29XaWRlID8gMCA6IDEwKSk7IH1cbiAgZWxzZSBpZiAocmVjdC5yaWdodCA+IHNjcmVlbncgKyBzY3JlZW5sZWZ0IC0gMylcbiAgICB7IHJlc3VsdC5zY3JvbGxMZWZ0ID0gcmVjdC5yaWdodCArICh0b29XaWRlID8gMCA6IDEwKSAtIHNjcmVlbnc7IH1cbiAgcmV0dXJuIHJlc3VsdFxufVxuXG4vLyBTdG9yZSBhIHJlbGF0aXZlIGFkanVzdG1lbnQgdG8gdGhlIHNjcm9sbCBwb3NpdGlvbiBpbiB0aGUgY3VycmVudFxuLy8gb3BlcmF0aW9uICh0byBiZSBhcHBsaWVkIHdoZW4gdGhlIG9wZXJhdGlvbiBmaW5pc2hlcykuXG5mdW5jdGlvbiBhZGRUb1Njcm9sbFRvcChjbSwgdG9wKSB7XG4gIGlmICh0b3AgPT0gbnVsbCkgeyByZXR1cm4gfVxuICByZXNvbHZlU2Nyb2xsVG9Qb3MoY20pO1xuICBjbS5jdXJPcC5zY3JvbGxUb3AgPSAoY20uY3VyT3Auc2Nyb2xsVG9wID09IG51bGwgPyBjbS5kb2Muc2Nyb2xsVG9wIDogY20uY3VyT3Auc2Nyb2xsVG9wKSArIHRvcDtcbn1cblxuLy8gTWFrZSBzdXJlIHRoYXQgYXQgdGhlIGVuZCBvZiB0aGUgb3BlcmF0aW9uIHRoZSBjdXJyZW50IGN1cnNvciBpc1xuLy8gc2hvd24uXG5mdW5jdGlvbiBlbnN1cmVDdXJzb3JWaXNpYmxlKGNtKSB7XG4gIHJlc29sdmVTY3JvbGxUb1BvcyhjbSk7XG4gIHZhciBjdXIgPSBjbS5nZXRDdXJzb3IoKTtcbiAgY20uY3VyT3Auc2Nyb2xsVG9Qb3MgPSB7ZnJvbTogY3VyLCB0bzogY3VyLCBtYXJnaW46IGNtLm9wdGlvbnMuY3Vyc29yU2Nyb2xsTWFyZ2lufTtcbn1cblxuZnVuY3Rpb24gc2Nyb2xsVG9Db29yZHMoY20sIHgsIHkpIHtcbiAgaWYgKHggIT0gbnVsbCB8fCB5ICE9IG51bGwpIHsgcmVzb2x2ZVNjcm9sbFRvUG9zKGNtKTsgfVxuICBpZiAoeCAhPSBudWxsKSB7IGNtLmN1ck9wLnNjcm9sbExlZnQgPSB4OyB9XG4gIGlmICh5ICE9IG51bGwpIHsgY20uY3VyT3Auc2Nyb2xsVG9wID0geTsgfVxufVxuXG5mdW5jdGlvbiBzY3JvbGxUb1JhbmdlKGNtLCByYW5nZSQkMSkge1xuICByZXNvbHZlU2Nyb2xsVG9Qb3MoY20pO1xuICBjbS5jdXJPcC5zY3JvbGxUb1BvcyA9IHJhbmdlJCQxO1xufVxuXG4vLyBXaGVuIGFuIG9wZXJhdGlvbiBoYXMgaXRzIHNjcm9sbFRvUG9zIHByb3BlcnR5IHNldCwgYW5kIGFub3RoZXJcbi8vIHNjcm9sbCBhY3Rpb24gaXMgYXBwbGllZCBiZWZvcmUgdGhlIGVuZCBvZiB0aGUgb3BlcmF0aW9uLCB0aGlzXG4vLyAnc2ltdWxhdGVzJyBzY3JvbGxpbmcgdGhhdCBwb3NpdGlvbiBpbnRvIHZpZXcgaW4gYSBjaGVhcCB3YXksIHNvXG4vLyB0aGF0IHRoZSBlZmZlY3Qgb2YgaW50ZXJtZWRpYXRlIHNjcm9sbCBjb21tYW5kcyBpcyBub3QgaWdub3JlZC5cbmZ1bmN0aW9uIHJlc29sdmVTY3JvbGxUb1BvcyhjbSkge1xuICB2YXIgcmFuZ2UkJDEgPSBjbS5jdXJPcC5zY3JvbGxUb1BvcztcbiAgaWYgKHJhbmdlJCQxKSB7XG4gICAgY20uY3VyT3Auc2Nyb2xsVG9Qb3MgPSBudWxsO1xuICAgIHZhciBmcm9tID0gZXN0aW1hdGVDb29yZHMoY20sIHJhbmdlJCQxLmZyb20pLCB0byA9IGVzdGltYXRlQ29vcmRzKGNtLCByYW5nZSQkMS50byk7XG4gICAgc2Nyb2xsVG9Db29yZHNSYW5nZShjbSwgZnJvbSwgdG8sIHJhbmdlJCQxLm1hcmdpbik7XG4gIH1cbn1cblxuZnVuY3Rpb24gc2Nyb2xsVG9Db29yZHNSYW5nZShjbSwgZnJvbSwgdG8sIG1hcmdpbikge1xuICB2YXIgc1BvcyA9IGNhbGN1bGF0ZVNjcm9sbFBvcyhjbSwge1xuICAgIGxlZnQ6IE1hdGgubWluKGZyb20ubGVmdCwgdG8ubGVmdCksXG4gICAgdG9wOiBNYXRoLm1pbihmcm9tLnRvcCwgdG8udG9wKSAtIG1hcmdpbixcbiAgICByaWdodDogTWF0aC5tYXgoZnJvbS5yaWdodCwgdG8ucmlnaHQpLFxuICAgIGJvdHRvbTogTWF0aC5tYXgoZnJvbS5ib3R0b20sIHRvLmJvdHRvbSkgKyBtYXJnaW5cbiAgfSk7XG4gIHNjcm9sbFRvQ29vcmRzKGNtLCBzUG9zLnNjcm9sbExlZnQsIHNQb3Muc2Nyb2xsVG9wKTtcbn1cblxuLy8gU3luYyB0aGUgc2Nyb2xsYWJsZSBhcmVhIGFuZCBzY3JvbGxiYXJzLCBlbnN1cmUgdGhlIHZpZXdwb3J0XG4vLyBjb3ZlcnMgdGhlIHZpc2libGUgYXJlYS5cbmZ1bmN0aW9uIHVwZGF0ZVNjcm9sbFRvcChjbSwgdmFsKSB7XG4gIGlmIChNYXRoLmFicyhjbS5kb2Muc2Nyb2xsVG9wIC0gdmFsKSA8IDIpIHsgcmV0dXJuIH1cbiAgaWYgKCFnZWNrbykgeyB1cGRhdGVEaXNwbGF5U2ltcGxlKGNtLCB7dG9wOiB2YWx9KTsgfVxuICBzZXRTY3JvbGxUb3AoY20sIHZhbCwgdHJ1ZSk7XG4gIGlmIChnZWNrbykgeyB1cGRhdGVEaXNwbGF5U2ltcGxlKGNtKTsgfVxuICBzdGFydFdvcmtlcihjbSwgMTAwKTtcbn1cblxuZnVuY3Rpb24gc2V0U2Nyb2xsVG9wKGNtLCB2YWwsIGZvcmNlU2Nyb2xsKSB7XG4gIHZhbCA9IE1hdGgubWluKGNtLmRpc3BsYXkuc2Nyb2xsZXIuc2Nyb2xsSGVpZ2h0IC0gY20uZGlzcGxheS5zY3JvbGxlci5jbGllbnRIZWlnaHQsIHZhbCk7XG4gIGlmIChjbS5kaXNwbGF5LnNjcm9sbGVyLnNjcm9sbFRvcCA9PSB2YWwgJiYgIWZvcmNlU2Nyb2xsKSB7IHJldHVybiB9XG4gIGNtLmRvYy5zY3JvbGxUb3AgPSB2YWw7XG4gIGNtLmRpc3BsYXkuc2Nyb2xsYmFycy5zZXRTY3JvbGxUb3AodmFsKTtcbiAgaWYgKGNtLmRpc3BsYXkuc2Nyb2xsZXIuc2Nyb2xsVG9wICE9IHZhbCkgeyBjbS5kaXNwbGF5LnNjcm9sbGVyLnNjcm9sbFRvcCA9IHZhbDsgfVxufVxuXG4vLyBTeW5jIHNjcm9sbGVyIGFuZCBzY3JvbGxiYXIsIGVuc3VyZSB0aGUgZ3V0dGVyIGVsZW1lbnRzIGFyZVxuLy8gYWxpZ25lZC5cbmZ1bmN0aW9uIHNldFNjcm9sbExlZnQoY20sIHZhbCwgaXNTY3JvbGxlciwgZm9yY2VTY3JvbGwpIHtcbiAgdmFsID0gTWF0aC5taW4odmFsLCBjbS5kaXNwbGF5LnNjcm9sbGVyLnNjcm9sbFdpZHRoIC0gY20uZGlzcGxheS5zY3JvbGxlci5jbGllbnRXaWR0aCk7XG4gIGlmICgoaXNTY3JvbGxlciA/IHZhbCA9PSBjbS5kb2Muc2Nyb2xsTGVmdCA6IE1hdGguYWJzKGNtLmRvYy5zY3JvbGxMZWZ0IC0gdmFsKSA8IDIpICYmICFmb3JjZVNjcm9sbCkgeyByZXR1cm4gfVxuICBjbS5kb2Muc2Nyb2xsTGVmdCA9IHZhbDtcbiAgYWxpZ25Ib3Jpem9udGFsbHkoY20pO1xuICBpZiAoY20uZGlzcGxheS5zY3JvbGxlci5zY3JvbGxMZWZ0ICE9IHZhbCkgeyBjbS5kaXNwbGF5LnNjcm9sbGVyLnNjcm9sbExlZnQgPSB2YWw7IH1cbiAgY20uZGlzcGxheS5zY3JvbGxiYXJzLnNldFNjcm9sbExlZnQodmFsKTtcbn1cblxuLy8gU0NST0xMQkFSU1xuXG4vLyBQcmVwYXJlIERPTSByZWFkcyBuZWVkZWQgdG8gdXBkYXRlIHRoZSBzY3JvbGxiYXJzLiBEb25lIGluIG9uZVxuLy8gc2hvdCB0byBtaW5pbWl6ZSB1cGRhdGUvbWVhc3VyZSByb3VuZHRyaXBzLlxuZnVuY3Rpb24gbWVhc3VyZUZvclNjcm9sbGJhcnMoY20pIHtcbiAgdmFyIGQgPSBjbS5kaXNwbGF5LCBndXR0ZXJXID0gZC5ndXR0ZXJzLm9mZnNldFdpZHRoO1xuICB2YXIgZG9jSCA9IE1hdGgucm91bmQoY20uZG9jLmhlaWdodCArIHBhZGRpbmdWZXJ0KGNtLmRpc3BsYXkpKTtcbiAgcmV0dXJuIHtcbiAgICBjbGllbnRIZWlnaHQ6IGQuc2Nyb2xsZXIuY2xpZW50SGVpZ2h0LFxuICAgIHZpZXdIZWlnaHQ6IGQud3JhcHBlci5jbGllbnRIZWlnaHQsXG4gICAgc2Nyb2xsV2lkdGg6IGQuc2Nyb2xsZXIuc2Nyb2xsV2lkdGgsIGNsaWVudFdpZHRoOiBkLnNjcm9sbGVyLmNsaWVudFdpZHRoLFxuICAgIHZpZXdXaWR0aDogZC53cmFwcGVyLmNsaWVudFdpZHRoLFxuICAgIGJhckxlZnQ6IGNtLm9wdGlvbnMuZml4ZWRHdXR0ZXIgPyBndXR0ZXJXIDogMCxcbiAgICBkb2NIZWlnaHQ6IGRvY0gsXG4gICAgc2Nyb2xsSGVpZ2h0OiBkb2NIICsgc2Nyb2xsR2FwKGNtKSArIGQuYmFySGVpZ2h0LFxuICAgIG5hdGl2ZUJhcldpZHRoOiBkLm5hdGl2ZUJhcldpZHRoLFxuICAgIGd1dHRlcldpZHRoOiBndXR0ZXJXXG4gIH1cbn1cblxudmFyIE5hdGl2ZVNjcm9sbGJhcnMgPSBmdW5jdGlvbihwbGFjZSwgc2Nyb2xsLCBjbSkge1xuICB0aGlzLmNtID0gY207XG4gIHZhciB2ZXJ0ID0gdGhpcy52ZXJ0ID0gZWx0KFwiZGl2XCIsIFtlbHQoXCJkaXZcIiwgbnVsbCwgbnVsbCwgXCJtaW4td2lkdGg6IDFweFwiKV0sIFwiQ29kZU1pcnJvci12c2Nyb2xsYmFyXCIpO1xuICB2YXIgaG9yaXogPSB0aGlzLmhvcml6ID0gZWx0KFwiZGl2XCIsIFtlbHQoXCJkaXZcIiwgbnVsbCwgbnVsbCwgXCJoZWlnaHQ6IDEwMCU7IG1pbi1oZWlnaHQ6IDFweFwiKV0sIFwiQ29kZU1pcnJvci1oc2Nyb2xsYmFyXCIpO1xuICB2ZXJ0LnRhYkluZGV4ID0gaG9yaXoudGFiSW5kZXggPSAtMTtcbiAgcGxhY2UodmVydCk7IHBsYWNlKGhvcml6KTtcblxuICBvbih2ZXJ0LCBcInNjcm9sbFwiLCBmdW5jdGlvbiAoKSB7XG4gICAgaWYgKHZlcnQuY2xpZW50SGVpZ2h0KSB7IHNjcm9sbCh2ZXJ0LnNjcm9sbFRvcCwgXCJ2ZXJ0aWNhbFwiKTsgfVxuICB9KTtcbiAgb24oaG9yaXosIFwic2Nyb2xsXCIsIGZ1bmN0aW9uICgpIHtcbiAgICBpZiAoaG9yaXouY2xpZW50V2lkdGgpIHsgc2Nyb2xsKGhvcml6LnNjcm9sbExlZnQsIFwiaG9yaXpvbnRhbFwiKTsgfVxuICB9KTtcblxuICB0aGlzLmNoZWNrZWRaZXJvV2lkdGggPSBmYWxzZTtcbiAgLy8gTmVlZCB0byBzZXQgYSBtaW5pbXVtIHdpZHRoIHRvIHNlZSB0aGUgc2Nyb2xsYmFyIG9uIElFNyAoYnV0IG11c3Qgbm90IHNldCBpdCBvbiBJRTgpLlxuICBpZiAoaWUgJiYgaWVfdmVyc2lvbiA8IDgpIHsgdGhpcy5ob3Jpei5zdHlsZS5taW5IZWlnaHQgPSB0aGlzLnZlcnQuc3R5bGUubWluV2lkdGggPSBcIjE4cHhcIjsgfVxufTtcblxuTmF0aXZlU2Nyb2xsYmFycy5wcm90b3R5cGUudXBkYXRlID0gZnVuY3Rpb24gKG1lYXN1cmUpIHtcbiAgdmFyIG5lZWRzSCA9IG1lYXN1cmUuc2Nyb2xsV2lkdGggPiBtZWFzdXJlLmNsaWVudFdpZHRoICsgMTtcbiAgdmFyIG5lZWRzViA9IG1lYXN1cmUuc2Nyb2xsSGVpZ2h0ID4gbWVhc3VyZS5jbGllbnRIZWlnaHQgKyAxO1xuICB2YXIgc1dpZHRoID0gbWVhc3VyZS5uYXRpdmVCYXJXaWR0aDtcblxuICBpZiAobmVlZHNWKSB7XG4gICAgdGhpcy52ZXJ0LnN0eWxlLmRpc3BsYXkgPSBcImJsb2NrXCI7XG4gICAgdGhpcy52ZXJ0LnN0eWxlLmJvdHRvbSA9IG5lZWRzSCA/IHNXaWR0aCArIFwicHhcIiA6IFwiMFwiO1xuICAgIHZhciB0b3RhbEhlaWdodCA9IG1lYXN1cmUudmlld0hlaWdodCAtIChuZWVkc0ggPyBzV2lkdGggOiAwKTtcbiAgICAvLyBBIGJ1ZyBpbiBJRTggY2FuIGNhdXNlIHRoaXMgdmFsdWUgdG8gYmUgbmVnYXRpdmUsIHNvIGd1YXJkIGl0LlxuICAgIHRoaXMudmVydC5maXJzdENoaWxkLnN0eWxlLmhlaWdodCA9XG4gICAgICBNYXRoLm1heCgwLCBtZWFzdXJlLnNjcm9sbEhlaWdodCAtIG1lYXN1cmUuY2xpZW50SGVpZ2h0ICsgdG90YWxIZWlnaHQpICsgXCJweFwiO1xuICB9IGVsc2Uge1xuICAgIHRoaXMudmVydC5zdHlsZS5kaXNwbGF5ID0gXCJcIjtcbiAgICB0aGlzLnZlcnQuZmlyc3RDaGlsZC5zdHlsZS5oZWlnaHQgPSBcIjBcIjtcbiAgfVxuXG4gIGlmIChuZWVkc0gpIHtcbiAgICB0aGlzLmhvcml6LnN0eWxlLmRpc3BsYXkgPSBcImJsb2NrXCI7XG4gICAgdGhpcy5ob3Jpei5zdHlsZS5yaWdodCA9IG5lZWRzViA/IHNXaWR0aCArIFwicHhcIiA6IFwiMFwiO1xuICAgIHRoaXMuaG9yaXouc3R5bGUubGVmdCA9IG1lYXN1cmUuYmFyTGVmdCArIFwicHhcIjtcbiAgICB2YXIgdG90YWxXaWR0aCA9IG1lYXN1cmUudmlld1dpZHRoIC0gbWVhc3VyZS5iYXJMZWZ0IC0gKG5lZWRzViA/IHNXaWR0aCA6IDApO1xuICAgIHRoaXMuaG9yaXouZmlyc3RDaGlsZC5zdHlsZS53aWR0aCA9XG4gICAgICBNYXRoLm1heCgwLCBtZWFzdXJlLnNjcm9sbFdpZHRoIC0gbWVhc3VyZS5jbGllbnRXaWR0aCArIHRvdGFsV2lkdGgpICsgXCJweFwiO1xuICB9IGVsc2Uge1xuICAgIHRoaXMuaG9yaXouc3R5bGUuZGlzcGxheSA9IFwiXCI7XG4gICAgdGhpcy5ob3Jpei5maXJzdENoaWxkLnN0eWxlLndpZHRoID0gXCIwXCI7XG4gIH1cblxuICBpZiAoIXRoaXMuY2hlY2tlZFplcm9XaWR0aCAmJiBtZWFzdXJlLmNsaWVudEhlaWdodCA+IDApIHtcbiAgICBpZiAoc1dpZHRoID09IDApIHsgdGhpcy56ZXJvV2lkdGhIYWNrKCk7IH1cbiAgICB0aGlzLmNoZWNrZWRaZXJvV2lkdGggPSB0cnVlO1xuICB9XG5cbiAgcmV0dXJuIHtyaWdodDogbmVlZHNWID8gc1dpZHRoIDogMCwgYm90dG9tOiBuZWVkc0ggPyBzV2lkdGggOiAwfVxufTtcblxuTmF0aXZlU2Nyb2xsYmFycy5wcm90b3R5cGUuc2V0U2Nyb2xsTGVmdCA9IGZ1bmN0aW9uIChwb3MpIHtcbiAgaWYgKHRoaXMuaG9yaXouc2Nyb2xsTGVmdCAhPSBwb3MpIHsgdGhpcy5ob3Jpei5zY3JvbGxMZWZ0ID0gcG9zOyB9XG4gIGlmICh0aGlzLmRpc2FibGVIb3JpeikgeyB0aGlzLmVuYWJsZVplcm9XaWR0aEJhcih0aGlzLmhvcml6LCB0aGlzLmRpc2FibGVIb3JpeiwgXCJob3JpelwiKTsgfVxufTtcblxuTmF0aXZlU2Nyb2xsYmFycy5wcm90b3R5cGUuc2V0U2Nyb2xsVG9wID0gZnVuY3Rpb24gKHBvcykge1xuICBpZiAodGhpcy52ZXJ0LnNjcm9sbFRvcCAhPSBwb3MpIHsgdGhpcy52ZXJ0LnNjcm9sbFRvcCA9IHBvczsgfVxuICBpZiAodGhpcy5kaXNhYmxlVmVydCkgeyB0aGlzLmVuYWJsZVplcm9XaWR0aEJhcih0aGlzLnZlcnQsIHRoaXMuZGlzYWJsZVZlcnQsIFwidmVydFwiKTsgfVxufTtcblxuTmF0aXZlU2Nyb2xsYmFycy5wcm90b3R5cGUuemVyb1dpZHRoSGFjayA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIHcgPSBtYWMgJiYgIW1hY19nZU1vdW50YWluTGlvbiA/IFwiMTJweFwiIDogXCIxOHB4XCI7XG4gIHRoaXMuaG9yaXouc3R5bGUuaGVpZ2h0ID0gdGhpcy52ZXJ0LnN0eWxlLndpZHRoID0gdztcbiAgdGhpcy5ob3Jpei5zdHlsZS5wb2ludGVyRXZlbnRzID0gdGhpcy52ZXJ0LnN0eWxlLnBvaW50ZXJFdmVudHMgPSBcIm5vbmVcIjtcbiAgdGhpcy5kaXNhYmxlSG9yaXogPSBuZXcgRGVsYXllZDtcbiAgdGhpcy5kaXNhYmxlVmVydCA9IG5ldyBEZWxheWVkO1xufTtcblxuTmF0aXZlU2Nyb2xsYmFycy5wcm90b3R5cGUuZW5hYmxlWmVyb1dpZHRoQmFyID0gZnVuY3Rpb24gKGJhciwgZGVsYXksIHR5cGUpIHtcbiAgYmFyLnN0eWxlLnBvaW50ZXJFdmVudHMgPSBcImF1dG9cIjtcbiAgZnVuY3Rpb24gbWF5YmVEaXNhYmxlKCkge1xuICAgIC8vIFRvIGZpbmQgb3V0IHdoZXRoZXIgdGhlIHNjcm9sbGJhciBpcyBzdGlsbCB2aXNpYmxlLCB3ZVxuICAgIC8vIGNoZWNrIHdoZXRoZXIgdGhlIGVsZW1lbnQgdW5kZXIgdGhlIHBpeGVsIGluIHRoZSBib3R0b21cbiAgICAvLyByaWdodCBjb3JuZXIgb2YgdGhlIHNjcm9sbGJhciBib3ggaXMgdGhlIHNjcm9sbGJhciBib3hcbiAgICAvLyBpdHNlbGYgKHdoZW4gdGhlIGJhciBpcyBzdGlsbCB2aXNpYmxlKSBvciBpdHMgZmlsbGVyIGNoaWxkXG4gICAgLy8gKHdoZW4gdGhlIGJhciBpcyBoaWRkZW4pLiBJZiBpdCBpcyBzdGlsbCB2aXNpYmxlLCB3ZSBrZWVwXG4gICAgLy8gaXQgZW5hYmxlZCwgaWYgaXQncyBoaWRkZW4sIHdlIGRpc2FibGUgcG9pbnRlciBldmVudHMuXG4gICAgdmFyIGJveCA9IGJhci5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcbiAgICB2YXIgZWx0JCQxID0gdHlwZSA9PSBcInZlcnRcIiA/IGRvY3VtZW50LmVsZW1lbnRGcm9tUG9pbnQoYm94LnJpZ2h0IC0gMSwgKGJveC50b3AgKyBib3guYm90dG9tKSAvIDIpXG4gICAgICAgIDogZG9jdW1lbnQuZWxlbWVudEZyb21Qb2ludCgoYm94LnJpZ2h0ICsgYm94LmxlZnQpIC8gMiwgYm94LmJvdHRvbSAtIDEpO1xuICAgIGlmIChlbHQkJDEgIT0gYmFyKSB7IGJhci5zdHlsZS5wb2ludGVyRXZlbnRzID0gXCJub25lXCI7IH1cbiAgICBlbHNlIHsgZGVsYXkuc2V0KDEwMDAsIG1heWJlRGlzYWJsZSk7IH1cbiAgfVxuICBkZWxheS5zZXQoMTAwMCwgbWF5YmVEaXNhYmxlKTtcbn07XG5cbk5hdGl2ZVNjcm9sbGJhcnMucHJvdG90eXBlLmNsZWFyID0gZnVuY3Rpb24gKCkge1xuICB2YXIgcGFyZW50ID0gdGhpcy5ob3Jpei5wYXJlbnROb2RlO1xuICBwYXJlbnQucmVtb3ZlQ2hpbGQodGhpcy5ob3Jpeik7XG4gIHBhcmVudC5yZW1vdmVDaGlsZCh0aGlzLnZlcnQpO1xufTtcblxudmFyIE51bGxTY3JvbGxiYXJzID0gZnVuY3Rpb24gKCkge307XG5cbk51bGxTY3JvbGxiYXJzLnByb3RvdHlwZS51cGRhdGUgPSBmdW5jdGlvbiAoKSB7IHJldHVybiB7Ym90dG9tOiAwLCByaWdodDogMH0gfTtcbk51bGxTY3JvbGxiYXJzLnByb3RvdHlwZS5zZXRTY3JvbGxMZWZ0ID0gZnVuY3Rpb24gKCkge307XG5OdWxsU2Nyb2xsYmFycy5wcm90b3R5cGUuc2V0U2Nyb2xsVG9wID0gZnVuY3Rpb24gKCkge307XG5OdWxsU2Nyb2xsYmFycy5wcm90b3R5cGUuY2xlYXIgPSBmdW5jdGlvbiAoKSB7fTtcblxuZnVuY3Rpb24gdXBkYXRlU2Nyb2xsYmFycyhjbSwgbWVhc3VyZSkge1xuICBpZiAoIW1lYXN1cmUpIHsgbWVhc3VyZSA9IG1lYXN1cmVGb3JTY3JvbGxiYXJzKGNtKTsgfVxuICB2YXIgc3RhcnRXaWR0aCA9IGNtLmRpc3BsYXkuYmFyV2lkdGgsIHN0YXJ0SGVpZ2h0ID0gY20uZGlzcGxheS5iYXJIZWlnaHQ7XG4gIHVwZGF0ZVNjcm9sbGJhcnNJbm5lcihjbSwgbWVhc3VyZSk7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgNCAmJiBzdGFydFdpZHRoICE9IGNtLmRpc3BsYXkuYmFyV2lkdGggfHwgc3RhcnRIZWlnaHQgIT0gY20uZGlzcGxheS5iYXJIZWlnaHQ7IGkrKykge1xuICAgIGlmIChzdGFydFdpZHRoICE9IGNtLmRpc3BsYXkuYmFyV2lkdGggJiYgY20ub3B0aW9ucy5saW5lV3JhcHBpbmcpXG4gICAgICB7IHVwZGF0ZUhlaWdodHNJblZpZXdwb3J0KGNtKTsgfVxuICAgIHVwZGF0ZVNjcm9sbGJhcnNJbm5lcihjbSwgbWVhc3VyZUZvclNjcm9sbGJhcnMoY20pKTtcbiAgICBzdGFydFdpZHRoID0gY20uZGlzcGxheS5iYXJXaWR0aDsgc3RhcnRIZWlnaHQgPSBjbS5kaXNwbGF5LmJhckhlaWdodDtcbiAgfVxufVxuXG4vLyBSZS1zeW5jaHJvbml6ZSB0aGUgZmFrZSBzY3JvbGxiYXJzIHdpdGggdGhlIGFjdHVhbCBzaXplIG9mIHRoZVxuLy8gY29udGVudC5cbmZ1bmN0aW9uIHVwZGF0ZVNjcm9sbGJhcnNJbm5lcihjbSwgbWVhc3VyZSkge1xuICB2YXIgZCA9IGNtLmRpc3BsYXk7XG4gIHZhciBzaXplcyA9IGQuc2Nyb2xsYmFycy51cGRhdGUobWVhc3VyZSk7XG5cbiAgZC5zaXplci5zdHlsZS5wYWRkaW5nUmlnaHQgPSAoZC5iYXJXaWR0aCA9IHNpemVzLnJpZ2h0KSArIFwicHhcIjtcbiAgZC5zaXplci5zdHlsZS5wYWRkaW5nQm90dG9tID0gKGQuYmFySGVpZ2h0ID0gc2l6ZXMuYm90dG9tKSArIFwicHhcIjtcbiAgZC5oZWlnaHRGb3JjZXIuc3R5bGUuYm9yZGVyQm90dG9tID0gc2l6ZXMuYm90dG9tICsgXCJweCBzb2xpZCB0cmFuc3BhcmVudFwiO1xuXG4gIGlmIChzaXplcy5yaWdodCAmJiBzaXplcy5ib3R0b20pIHtcbiAgICBkLnNjcm9sbGJhckZpbGxlci5zdHlsZS5kaXNwbGF5ID0gXCJibG9ja1wiO1xuICAgIGQuc2Nyb2xsYmFyRmlsbGVyLnN0eWxlLmhlaWdodCA9IHNpemVzLmJvdHRvbSArIFwicHhcIjtcbiAgICBkLnNjcm9sbGJhckZpbGxlci5zdHlsZS53aWR0aCA9IHNpemVzLnJpZ2h0ICsgXCJweFwiO1xuICB9IGVsc2UgeyBkLnNjcm9sbGJhckZpbGxlci5zdHlsZS5kaXNwbGF5ID0gXCJcIjsgfVxuICBpZiAoc2l6ZXMuYm90dG9tICYmIGNtLm9wdGlvbnMuY292ZXJHdXR0ZXJOZXh0VG9TY3JvbGxiYXIgJiYgY20ub3B0aW9ucy5maXhlZEd1dHRlcikge1xuICAgIGQuZ3V0dGVyRmlsbGVyLnN0eWxlLmRpc3BsYXkgPSBcImJsb2NrXCI7XG4gICAgZC5ndXR0ZXJGaWxsZXIuc3R5bGUuaGVpZ2h0ID0gc2l6ZXMuYm90dG9tICsgXCJweFwiO1xuICAgIGQuZ3V0dGVyRmlsbGVyLnN0eWxlLndpZHRoID0gbWVhc3VyZS5ndXR0ZXJXaWR0aCArIFwicHhcIjtcbiAgfSBlbHNlIHsgZC5ndXR0ZXJGaWxsZXIuc3R5bGUuZGlzcGxheSA9IFwiXCI7IH1cbn1cblxudmFyIHNjcm9sbGJhck1vZGVsID0ge1wibmF0aXZlXCI6IE5hdGl2ZVNjcm9sbGJhcnMsIFwibnVsbFwiOiBOdWxsU2Nyb2xsYmFyc307XG5cbmZ1bmN0aW9uIGluaXRTY3JvbGxiYXJzKGNtKSB7XG4gIGlmIChjbS5kaXNwbGF5LnNjcm9sbGJhcnMpIHtcbiAgICBjbS5kaXNwbGF5LnNjcm9sbGJhcnMuY2xlYXIoKTtcbiAgICBpZiAoY20uZGlzcGxheS5zY3JvbGxiYXJzLmFkZENsYXNzKVxuICAgICAgeyBybUNsYXNzKGNtLmRpc3BsYXkud3JhcHBlciwgY20uZGlzcGxheS5zY3JvbGxiYXJzLmFkZENsYXNzKTsgfVxuICB9XG5cbiAgY20uZGlzcGxheS5zY3JvbGxiYXJzID0gbmV3IHNjcm9sbGJhck1vZGVsW2NtLm9wdGlvbnMuc2Nyb2xsYmFyU3R5bGVdKGZ1bmN0aW9uIChub2RlKSB7XG4gICAgY20uZGlzcGxheS53cmFwcGVyLmluc2VydEJlZm9yZShub2RlLCBjbS5kaXNwbGF5LnNjcm9sbGJhckZpbGxlcik7XG4gICAgLy8gUHJldmVudCBjbGlja3MgaW4gdGhlIHNjcm9sbGJhcnMgZnJvbSBraWxsaW5nIGZvY3VzXG4gICAgb24obm9kZSwgXCJtb3VzZWRvd25cIiwgZnVuY3Rpb24gKCkge1xuICAgICAgaWYgKGNtLnN0YXRlLmZvY3VzZWQpIHsgc2V0VGltZW91dChmdW5jdGlvbiAoKSB7IHJldHVybiBjbS5kaXNwbGF5LmlucHV0LmZvY3VzKCk7IH0sIDApOyB9XG4gICAgfSk7XG4gICAgbm9kZS5zZXRBdHRyaWJ1dGUoXCJjbS1ub3QtY29udGVudFwiLCBcInRydWVcIik7XG4gIH0sIGZ1bmN0aW9uIChwb3MsIGF4aXMpIHtcbiAgICBpZiAoYXhpcyA9PSBcImhvcml6b250YWxcIikgeyBzZXRTY3JvbGxMZWZ0KGNtLCBwb3MpOyB9XG4gICAgZWxzZSB7IHVwZGF0ZVNjcm9sbFRvcChjbSwgcG9zKTsgfVxuICB9LCBjbSk7XG4gIGlmIChjbS5kaXNwbGF5LnNjcm9sbGJhcnMuYWRkQ2xhc3MpXG4gICAgeyBhZGRDbGFzcyhjbS5kaXNwbGF5LndyYXBwZXIsIGNtLmRpc3BsYXkuc2Nyb2xsYmFycy5hZGRDbGFzcyk7IH1cbn1cblxuLy8gT3BlcmF0aW9ucyBhcmUgdXNlZCB0byB3cmFwIGEgc2VyaWVzIG9mIGNoYW5nZXMgdG8gdGhlIGVkaXRvclxuLy8gc3RhdGUgaW4gc3VjaCBhIHdheSB0aGF0IGVhY2ggY2hhbmdlIHdvbid0IGhhdmUgdG8gdXBkYXRlIHRoZVxuLy8gY3Vyc29yIGFuZCBkaXNwbGF5ICh3aGljaCB3b3VsZCBiZSBhd2t3YXJkLCBzbG93LCBhbmRcbi8vIGVycm9yLXByb25lKS4gSW5zdGVhZCwgZGlzcGxheSB1cGRhdGVzIGFyZSBiYXRjaGVkIGFuZCB0aGVuIGFsbFxuLy8gY29tYmluZWQgYW5kIGV4ZWN1dGVkIGF0IG9uY2UuXG5cbnZhciBuZXh0T3BJZCA9IDA7XG4vLyBTdGFydCBhIG5ldyBvcGVyYXRpb24uXG5mdW5jdGlvbiBzdGFydE9wZXJhdGlvbihjbSkge1xuICBjbS5jdXJPcCA9IHtcbiAgICBjbTogY20sXG4gICAgdmlld0NoYW5nZWQ6IGZhbHNlLCAgICAgIC8vIEZsYWcgdGhhdCBpbmRpY2F0ZXMgdGhhdCBsaW5lcyBtaWdodCBuZWVkIHRvIGJlIHJlZHJhd25cbiAgICBzdGFydEhlaWdodDogY20uZG9jLmhlaWdodCwgLy8gVXNlZCB0byBkZXRlY3QgbmVlZCB0byB1cGRhdGUgc2Nyb2xsYmFyXG4gICAgZm9yY2VVcGRhdGU6IGZhbHNlLCAgICAgIC8vIFVzZWQgdG8gZm9yY2UgYSByZWRyYXdcbiAgICB1cGRhdGVJbnB1dDogbnVsbCwgICAgICAgLy8gV2hldGhlciB0byByZXNldCB0aGUgaW5wdXQgdGV4dGFyZWFcbiAgICB0eXBpbmc6IGZhbHNlLCAgICAgICAgICAgLy8gV2hldGhlciB0aGlzIHJlc2V0IHNob3VsZCBiZSBjYXJlZnVsIHRvIGxlYXZlIGV4aXN0aW5nIHRleHQgKGZvciBjb21wb3NpdGluZylcbiAgICBjaGFuZ2VPYmpzOiBudWxsLCAgICAgICAgLy8gQWNjdW11bGF0ZWQgY2hhbmdlcywgZm9yIGZpcmluZyBjaGFuZ2UgZXZlbnRzXG4gICAgY3Vyc29yQWN0aXZpdHlIYW5kbGVyczogbnVsbCwgLy8gU2V0IG9mIGhhbmRsZXJzIHRvIGZpcmUgY3Vyc29yQWN0aXZpdHkgb25cbiAgICBjdXJzb3JBY3Rpdml0eUNhbGxlZDogMCwgLy8gVHJhY2tzIHdoaWNoIGN1cnNvckFjdGl2aXR5IGhhbmRsZXJzIGhhdmUgYmVlbiBjYWxsZWQgYWxyZWFkeVxuICAgIHNlbGVjdGlvbkNoYW5nZWQ6IGZhbHNlLCAvLyBXaGV0aGVyIHRoZSBzZWxlY3Rpb24gbmVlZHMgdG8gYmUgcmVkcmF3blxuICAgIHVwZGF0ZU1heExpbmU6IGZhbHNlLCAgICAvLyBTZXQgd2hlbiB0aGUgd2lkZXN0IGxpbmUgbmVlZHMgdG8gYmUgZGV0ZXJtaW5lZCBhbmV3XG4gICAgc2Nyb2xsTGVmdDogbnVsbCwgc2Nyb2xsVG9wOiBudWxsLCAvLyBJbnRlcm1lZGlhdGUgc2Nyb2xsIHBvc2l0aW9uLCBub3QgcHVzaGVkIHRvIERPTSB5ZXRcbiAgICBzY3JvbGxUb1BvczogbnVsbCwgICAgICAgLy8gVXNlZCB0byBzY3JvbGwgdG8gYSBzcGVjaWZpYyBwb3NpdGlvblxuICAgIGZvY3VzOiBmYWxzZSxcbiAgICBpZDogKytuZXh0T3BJZCAgICAgICAgICAgLy8gVW5pcXVlIElEXG4gIH07XG4gIHB1c2hPcGVyYXRpb24oY20uY3VyT3ApO1xufVxuXG4vLyBGaW5pc2ggYW4gb3BlcmF0aW9uLCB1cGRhdGluZyB0aGUgZGlzcGxheSBhbmQgc2lnbmFsbGluZyBkZWxheWVkIGV2ZW50c1xuZnVuY3Rpb24gZW5kT3BlcmF0aW9uKGNtKSB7XG4gIHZhciBvcCA9IGNtLmN1ck9wO1xuICBmaW5pc2hPcGVyYXRpb24ob3AsIGZ1bmN0aW9uIChncm91cCkge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZ3JvdXAub3BzLmxlbmd0aDsgaSsrKVxuICAgICAgeyBncm91cC5vcHNbaV0uY20uY3VyT3AgPSBudWxsOyB9XG4gICAgZW5kT3BlcmF0aW9ucyhncm91cCk7XG4gIH0pO1xufVxuXG4vLyBUaGUgRE9NIHVwZGF0ZXMgZG9uZSB3aGVuIGFuIG9wZXJhdGlvbiBmaW5pc2hlcyBhcmUgYmF0Y2hlZCBzb1xuLy8gdGhhdCB0aGUgbWluaW11bSBudW1iZXIgb2YgcmVsYXlvdXRzIGFyZSByZXF1aXJlZC5cbmZ1bmN0aW9uIGVuZE9wZXJhdGlvbnMoZ3JvdXApIHtcbiAgdmFyIG9wcyA9IGdyb3VwLm9wcztcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBvcHMubGVuZ3RoOyBpKyspIC8vIFJlYWQgRE9NXG4gICAgeyBlbmRPcGVyYXRpb25fUjEob3BzW2ldKTsgfVxuICBmb3IgKHZhciBpJDEgPSAwOyBpJDEgPCBvcHMubGVuZ3RoOyBpJDErKykgLy8gV3JpdGUgRE9NIChtYXliZSlcbiAgICB7IGVuZE9wZXJhdGlvbl9XMShvcHNbaSQxXSk7IH1cbiAgZm9yICh2YXIgaSQyID0gMDsgaSQyIDwgb3BzLmxlbmd0aDsgaSQyKyspIC8vIFJlYWQgRE9NXG4gICAgeyBlbmRPcGVyYXRpb25fUjIob3BzW2kkMl0pOyB9XG4gIGZvciAodmFyIGkkMyA9IDA7IGkkMyA8IG9wcy5sZW5ndGg7IGkkMysrKSAvLyBXcml0ZSBET00gKG1heWJlKVxuICAgIHsgZW5kT3BlcmF0aW9uX1cyKG9wc1tpJDNdKTsgfVxuICBmb3IgKHZhciBpJDQgPSAwOyBpJDQgPCBvcHMubGVuZ3RoOyBpJDQrKykgLy8gUmVhZCBET01cbiAgICB7IGVuZE9wZXJhdGlvbl9maW5pc2gob3BzW2kkNF0pOyB9XG59XG5cbmZ1bmN0aW9uIGVuZE9wZXJhdGlvbl9SMShvcCkge1xuICB2YXIgY20gPSBvcC5jbSwgZGlzcGxheSA9IGNtLmRpc3BsYXk7XG4gIG1heWJlQ2xpcFNjcm9sbGJhcnMoY20pO1xuICBpZiAob3AudXBkYXRlTWF4TGluZSkgeyBmaW5kTWF4TGluZShjbSk7IH1cblxuICBvcC5tdXN0VXBkYXRlID0gb3Audmlld0NoYW5nZWQgfHwgb3AuZm9yY2VVcGRhdGUgfHwgb3Auc2Nyb2xsVG9wICE9IG51bGwgfHxcbiAgICBvcC5zY3JvbGxUb1BvcyAmJiAob3Auc2Nyb2xsVG9Qb3MuZnJvbS5saW5lIDwgZGlzcGxheS52aWV3RnJvbSB8fFxuICAgICAgICAgICAgICAgICAgICAgICBvcC5zY3JvbGxUb1Bvcy50by5saW5lID49IGRpc3BsYXkudmlld1RvKSB8fFxuICAgIGRpc3BsYXkubWF4TGluZUNoYW5nZWQgJiYgY20ub3B0aW9ucy5saW5lV3JhcHBpbmc7XG4gIG9wLnVwZGF0ZSA9IG9wLm11c3RVcGRhdGUgJiZcbiAgICBuZXcgRGlzcGxheVVwZGF0ZShjbSwgb3AubXVzdFVwZGF0ZSAmJiB7dG9wOiBvcC5zY3JvbGxUb3AsIGVuc3VyZTogb3Auc2Nyb2xsVG9Qb3N9LCBvcC5mb3JjZVVwZGF0ZSk7XG59XG5cbmZ1bmN0aW9uIGVuZE9wZXJhdGlvbl9XMShvcCkge1xuICBvcC51cGRhdGVkRGlzcGxheSA9IG9wLm11c3RVcGRhdGUgJiYgdXBkYXRlRGlzcGxheUlmTmVlZGVkKG9wLmNtLCBvcC51cGRhdGUpO1xufVxuXG5mdW5jdGlvbiBlbmRPcGVyYXRpb25fUjIob3ApIHtcbiAgdmFyIGNtID0gb3AuY20sIGRpc3BsYXkgPSBjbS5kaXNwbGF5O1xuICBpZiAob3AudXBkYXRlZERpc3BsYXkpIHsgdXBkYXRlSGVpZ2h0c0luVmlld3BvcnQoY20pOyB9XG5cbiAgb3AuYmFyTWVhc3VyZSA9IG1lYXN1cmVGb3JTY3JvbGxiYXJzKGNtKTtcblxuICAvLyBJZiB0aGUgbWF4IGxpbmUgY2hhbmdlZCBzaW5jZSBpdCB3YXMgbGFzdCBtZWFzdXJlZCwgbWVhc3VyZSBpdCxcbiAgLy8gYW5kIGVuc3VyZSB0aGUgZG9jdW1lbnQncyB3aWR0aCBtYXRjaGVzIGl0LlxuICAvLyB1cGRhdGVEaXNwbGF5X1cyIHdpbGwgdXNlIHRoZXNlIHByb3BlcnRpZXMgdG8gZG8gdGhlIGFjdHVhbCByZXNpemluZ1xuICBpZiAoZGlzcGxheS5tYXhMaW5lQ2hhbmdlZCAmJiAhY20ub3B0aW9ucy5saW5lV3JhcHBpbmcpIHtcbiAgICBvcC5hZGp1c3RXaWR0aFRvID0gbWVhc3VyZUNoYXIoY20sIGRpc3BsYXkubWF4TGluZSwgZGlzcGxheS5tYXhMaW5lLnRleHQubGVuZ3RoKS5sZWZ0ICsgMztcbiAgICBjbS5kaXNwbGF5LnNpemVyV2lkdGggPSBvcC5hZGp1c3RXaWR0aFRvO1xuICAgIG9wLmJhck1lYXN1cmUuc2Nyb2xsV2lkdGggPVxuICAgICAgTWF0aC5tYXgoZGlzcGxheS5zY3JvbGxlci5jbGllbnRXaWR0aCwgZGlzcGxheS5zaXplci5vZmZzZXRMZWZ0ICsgb3AuYWRqdXN0V2lkdGhUbyArIHNjcm9sbEdhcChjbSkgKyBjbS5kaXNwbGF5LmJhcldpZHRoKTtcbiAgICBvcC5tYXhTY3JvbGxMZWZ0ID0gTWF0aC5tYXgoMCwgZGlzcGxheS5zaXplci5vZmZzZXRMZWZ0ICsgb3AuYWRqdXN0V2lkdGhUbyAtIGRpc3BsYXlXaWR0aChjbSkpO1xuICB9XG5cbiAgaWYgKG9wLnVwZGF0ZWREaXNwbGF5IHx8IG9wLnNlbGVjdGlvbkNoYW5nZWQpXG4gICAgeyBvcC5wcmVwYXJlZFNlbGVjdGlvbiA9IGRpc3BsYXkuaW5wdXQucHJlcGFyZVNlbGVjdGlvbigpOyB9XG59XG5cbmZ1bmN0aW9uIGVuZE9wZXJhdGlvbl9XMihvcCkge1xuICB2YXIgY20gPSBvcC5jbTtcblxuICBpZiAob3AuYWRqdXN0V2lkdGhUbyAhPSBudWxsKSB7XG4gICAgY20uZGlzcGxheS5zaXplci5zdHlsZS5taW5XaWR0aCA9IG9wLmFkanVzdFdpZHRoVG8gKyBcInB4XCI7XG4gICAgaWYgKG9wLm1heFNjcm9sbExlZnQgPCBjbS5kb2Muc2Nyb2xsTGVmdClcbiAgICAgIHsgc2V0U2Nyb2xsTGVmdChjbSwgTWF0aC5taW4oY20uZGlzcGxheS5zY3JvbGxlci5zY3JvbGxMZWZ0LCBvcC5tYXhTY3JvbGxMZWZ0KSwgdHJ1ZSk7IH1cbiAgICBjbS5kaXNwbGF5Lm1heExpbmVDaGFuZ2VkID0gZmFsc2U7XG4gIH1cblxuICB2YXIgdGFrZUZvY3VzID0gb3AuZm9jdXMgJiYgb3AuZm9jdXMgPT0gYWN0aXZlRWx0KCk7XG4gIGlmIChvcC5wcmVwYXJlZFNlbGVjdGlvbilcbiAgICB7IGNtLmRpc3BsYXkuaW5wdXQuc2hvd1NlbGVjdGlvbihvcC5wcmVwYXJlZFNlbGVjdGlvbiwgdGFrZUZvY3VzKTsgfVxuICBpZiAob3AudXBkYXRlZERpc3BsYXkgfHwgb3Auc3RhcnRIZWlnaHQgIT0gY20uZG9jLmhlaWdodClcbiAgICB7IHVwZGF0ZVNjcm9sbGJhcnMoY20sIG9wLmJhck1lYXN1cmUpOyB9XG4gIGlmIChvcC51cGRhdGVkRGlzcGxheSlcbiAgICB7IHNldERvY3VtZW50SGVpZ2h0KGNtLCBvcC5iYXJNZWFzdXJlKTsgfVxuXG4gIGlmIChvcC5zZWxlY3Rpb25DaGFuZ2VkKSB7IHJlc3RhcnRCbGluayhjbSk7IH1cblxuICBpZiAoY20uc3RhdGUuZm9jdXNlZCAmJiBvcC51cGRhdGVJbnB1dClcbiAgICB7IGNtLmRpc3BsYXkuaW5wdXQucmVzZXQob3AudHlwaW5nKTsgfVxuICBpZiAodGFrZUZvY3VzKSB7IGVuc3VyZUZvY3VzKG9wLmNtKTsgfVxufVxuXG5mdW5jdGlvbiBlbmRPcGVyYXRpb25fZmluaXNoKG9wKSB7XG4gIHZhciBjbSA9IG9wLmNtLCBkaXNwbGF5ID0gY20uZGlzcGxheSwgZG9jID0gY20uZG9jO1xuXG4gIGlmIChvcC51cGRhdGVkRGlzcGxheSkgeyBwb3N0VXBkYXRlRGlzcGxheShjbSwgb3AudXBkYXRlKTsgfVxuXG4gIC8vIEFib3J0IG1vdXNlIHdoZWVsIGRlbHRhIG1lYXN1cmVtZW50LCB3aGVuIHNjcm9sbGluZyBleHBsaWNpdGx5XG4gIGlmIChkaXNwbGF5LndoZWVsU3RhcnRYICE9IG51bGwgJiYgKG9wLnNjcm9sbFRvcCAhPSBudWxsIHx8IG9wLnNjcm9sbExlZnQgIT0gbnVsbCB8fCBvcC5zY3JvbGxUb1BvcykpXG4gICAgeyBkaXNwbGF5LndoZWVsU3RhcnRYID0gZGlzcGxheS53aGVlbFN0YXJ0WSA9IG51bGw7IH1cblxuICAvLyBQcm9wYWdhdGUgdGhlIHNjcm9sbCBwb3NpdGlvbiB0byB0aGUgYWN0dWFsIERPTSBzY3JvbGxlclxuICBpZiAob3Auc2Nyb2xsVG9wICE9IG51bGwpIHsgc2V0U2Nyb2xsVG9wKGNtLCBvcC5zY3JvbGxUb3AsIG9wLmZvcmNlU2Nyb2xsKTsgfVxuXG4gIGlmIChvcC5zY3JvbGxMZWZ0ICE9IG51bGwpIHsgc2V0U2Nyb2xsTGVmdChjbSwgb3Auc2Nyb2xsTGVmdCwgdHJ1ZSwgdHJ1ZSk7IH1cbiAgLy8gSWYgd2UgbmVlZCB0byBzY3JvbGwgYSBzcGVjaWZpYyBwb3NpdGlvbiBpbnRvIHZpZXcsIGRvIHNvLlxuICBpZiAob3Auc2Nyb2xsVG9Qb3MpIHtcbiAgICB2YXIgcmVjdCA9IHNjcm9sbFBvc0ludG9WaWV3KGNtLCBjbGlwUG9zKGRvYywgb3Auc2Nyb2xsVG9Qb3MuZnJvbSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjbGlwUG9zKGRvYywgb3Auc2Nyb2xsVG9Qb3MudG8pLCBvcC5zY3JvbGxUb1Bvcy5tYXJnaW4pO1xuICAgIG1heWJlU2Nyb2xsV2luZG93KGNtLCByZWN0KTtcbiAgfVxuXG4gIC8vIEZpcmUgZXZlbnRzIGZvciBtYXJrZXJzIHRoYXQgYXJlIGhpZGRlbi91bmlkZGVuIGJ5IGVkaXRpbmcgb3JcbiAgLy8gdW5kb2luZ1xuICB2YXIgaGlkZGVuID0gb3AubWF5YmVIaWRkZW5NYXJrZXJzLCB1bmhpZGRlbiA9IG9wLm1heWJlVW5oaWRkZW5NYXJrZXJzO1xuICBpZiAoaGlkZGVuKSB7IGZvciAodmFyIGkgPSAwOyBpIDwgaGlkZGVuLmxlbmd0aDsgKytpKVxuICAgIHsgaWYgKCFoaWRkZW5baV0ubGluZXMubGVuZ3RoKSB7IHNpZ25hbChoaWRkZW5baV0sIFwiaGlkZVwiKTsgfSB9IH1cbiAgaWYgKHVuaGlkZGVuKSB7IGZvciAodmFyIGkkMSA9IDA7IGkkMSA8IHVuaGlkZGVuLmxlbmd0aDsgKytpJDEpXG4gICAgeyBpZiAodW5oaWRkZW5baSQxXS5saW5lcy5sZW5ndGgpIHsgc2lnbmFsKHVuaGlkZGVuW2kkMV0sIFwidW5oaWRlXCIpOyB9IH0gfVxuXG4gIGlmIChkaXNwbGF5LndyYXBwZXIub2Zmc2V0SGVpZ2h0KVxuICAgIHsgZG9jLnNjcm9sbFRvcCA9IGNtLmRpc3BsYXkuc2Nyb2xsZXIuc2Nyb2xsVG9wOyB9XG5cbiAgLy8gRmlyZSBjaGFuZ2UgZXZlbnRzLCBhbmQgZGVsYXllZCBldmVudCBoYW5kbGVyc1xuICBpZiAob3AuY2hhbmdlT2JqcylcbiAgICB7IHNpZ25hbChjbSwgXCJjaGFuZ2VzXCIsIGNtLCBvcC5jaGFuZ2VPYmpzKTsgfVxuICBpZiAob3AudXBkYXRlKVxuICAgIHsgb3AudXBkYXRlLmZpbmlzaCgpOyB9XG59XG5cbi8vIFJ1biB0aGUgZ2l2ZW4gZnVuY3Rpb24gaW4gYW4gb3BlcmF0aW9uXG5mdW5jdGlvbiBydW5Jbk9wKGNtLCBmKSB7XG4gIGlmIChjbS5jdXJPcCkgeyByZXR1cm4gZigpIH1cbiAgc3RhcnRPcGVyYXRpb24oY20pO1xuICB0cnkgeyByZXR1cm4gZigpIH1cbiAgZmluYWxseSB7IGVuZE9wZXJhdGlvbihjbSk7IH1cbn1cbi8vIFdyYXBzIGEgZnVuY3Rpb24gaW4gYW4gb3BlcmF0aW9uLiBSZXR1cm5zIHRoZSB3cmFwcGVkIGZ1bmN0aW9uLlxuZnVuY3Rpb24gb3BlcmF0aW9uKGNtLCBmKSB7XG4gIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICBpZiAoY20uY3VyT3ApIHsgcmV0dXJuIGYuYXBwbHkoY20sIGFyZ3VtZW50cykgfVxuICAgIHN0YXJ0T3BlcmF0aW9uKGNtKTtcbiAgICB0cnkgeyByZXR1cm4gZi5hcHBseShjbSwgYXJndW1lbnRzKSB9XG4gICAgZmluYWxseSB7IGVuZE9wZXJhdGlvbihjbSk7IH1cbiAgfVxufVxuLy8gVXNlZCB0byBhZGQgbWV0aG9kcyB0byBlZGl0b3IgYW5kIGRvYyBpbnN0YW5jZXMsIHdyYXBwaW5nIHRoZW0gaW5cbi8vIG9wZXJhdGlvbnMuXG5mdW5jdGlvbiBtZXRob2RPcChmKSB7XG4gIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICBpZiAodGhpcy5jdXJPcCkgeyByZXR1cm4gZi5hcHBseSh0aGlzLCBhcmd1bWVudHMpIH1cbiAgICBzdGFydE9wZXJhdGlvbih0aGlzKTtcbiAgICB0cnkgeyByZXR1cm4gZi5hcHBseSh0aGlzLCBhcmd1bWVudHMpIH1cbiAgICBmaW5hbGx5IHsgZW5kT3BlcmF0aW9uKHRoaXMpOyB9XG4gIH1cbn1cbmZ1bmN0aW9uIGRvY01ldGhvZE9wKGYpIHtcbiAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgIHZhciBjbSA9IHRoaXMuY207XG4gICAgaWYgKCFjbSB8fCBjbS5jdXJPcCkgeyByZXR1cm4gZi5hcHBseSh0aGlzLCBhcmd1bWVudHMpIH1cbiAgICBzdGFydE9wZXJhdGlvbihjbSk7XG4gICAgdHJ5IHsgcmV0dXJuIGYuYXBwbHkodGhpcywgYXJndW1lbnRzKSB9XG4gICAgZmluYWxseSB7IGVuZE9wZXJhdGlvbihjbSk7IH1cbiAgfVxufVxuXG4vLyBVcGRhdGVzIHRoZSBkaXNwbGF5LnZpZXcgZGF0YSBzdHJ1Y3R1cmUgZm9yIGEgZ2l2ZW4gY2hhbmdlIHRvIHRoZVxuLy8gZG9jdW1lbnQuIEZyb20gYW5kIHRvIGFyZSBpbiBwcmUtY2hhbmdlIGNvb3JkaW5hdGVzLiBMZW5kaWZmIGlzXG4vLyB0aGUgYW1vdW50IG9mIGxpbmVzIGFkZGVkIG9yIHN1YnRyYWN0ZWQgYnkgdGhlIGNoYW5nZS4gVGhpcyBpc1xuLy8gdXNlZCBmb3IgY2hhbmdlcyB0aGF0IHNwYW4gbXVsdGlwbGUgbGluZXMsIG9yIGNoYW5nZSB0aGUgd2F5XG4vLyBsaW5lcyBhcmUgZGl2aWRlZCBpbnRvIHZpc3VhbCBsaW5lcy4gcmVnTGluZUNoYW5nZSAoYmVsb3cpXG4vLyByZWdpc3RlcnMgc2luZ2xlLWxpbmUgY2hhbmdlcy5cbmZ1bmN0aW9uIHJlZ0NoYW5nZShjbSwgZnJvbSwgdG8sIGxlbmRpZmYpIHtcbiAgaWYgKGZyb20gPT0gbnVsbCkgeyBmcm9tID0gY20uZG9jLmZpcnN0OyB9XG4gIGlmICh0byA9PSBudWxsKSB7IHRvID0gY20uZG9jLmZpcnN0ICsgY20uZG9jLnNpemU7IH1cbiAgaWYgKCFsZW5kaWZmKSB7IGxlbmRpZmYgPSAwOyB9XG5cbiAgdmFyIGRpc3BsYXkgPSBjbS5kaXNwbGF5O1xuICBpZiAobGVuZGlmZiAmJiB0byA8IGRpc3BsYXkudmlld1RvICYmXG4gICAgICAoZGlzcGxheS51cGRhdGVMaW5lTnVtYmVycyA9PSBudWxsIHx8IGRpc3BsYXkudXBkYXRlTGluZU51bWJlcnMgPiBmcm9tKSlcbiAgICB7IGRpc3BsYXkudXBkYXRlTGluZU51bWJlcnMgPSBmcm9tOyB9XG5cbiAgY20uY3VyT3Audmlld0NoYW5nZWQgPSB0cnVlO1xuXG4gIGlmIChmcm9tID49IGRpc3BsYXkudmlld1RvKSB7IC8vIENoYW5nZSBhZnRlclxuICAgIGlmIChzYXdDb2xsYXBzZWRTcGFucyAmJiB2aXN1YWxMaW5lTm8oY20uZG9jLCBmcm9tKSA8IGRpc3BsYXkudmlld1RvKVxuICAgICAgeyByZXNldFZpZXcoY20pOyB9XG4gIH0gZWxzZSBpZiAodG8gPD0gZGlzcGxheS52aWV3RnJvbSkgeyAvLyBDaGFuZ2UgYmVmb3JlXG4gICAgaWYgKHNhd0NvbGxhcHNlZFNwYW5zICYmIHZpc3VhbExpbmVFbmRObyhjbS5kb2MsIHRvICsgbGVuZGlmZikgPiBkaXNwbGF5LnZpZXdGcm9tKSB7XG4gICAgICByZXNldFZpZXcoY20pO1xuICAgIH0gZWxzZSB7XG4gICAgICBkaXNwbGF5LnZpZXdGcm9tICs9IGxlbmRpZmY7XG4gICAgICBkaXNwbGF5LnZpZXdUbyArPSBsZW5kaWZmO1xuICAgIH1cbiAgfSBlbHNlIGlmIChmcm9tIDw9IGRpc3BsYXkudmlld0Zyb20gJiYgdG8gPj0gZGlzcGxheS52aWV3VG8pIHsgLy8gRnVsbCBvdmVybGFwXG4gICAgcmVzZXRWaWV3KGNtKTtcbiAgfSBlbHNlIGlmIChmcm9tIDw9IGRpc3BsYXkudmlld0Zyb20pIHsgLy8gVG9wIG92ZXJsYXBcbiAgICB2YXIgY3V0ID0gdmlld0N1dHRpbmdQb2ludChjbSwgdG8sIHRvICsgbGVuZGlmZiwgMSk7XG4gICAgaWYgKGN1dCkge1xuICAgICAgZGlzcGxheS52aWV3ID0gZGlzcGxheS52aWV3LnNsaWNlKGN1dC5pbmRleCk7XG4gICAgICBkaXNwbGF5LnZpZXdGcm9tID0gY3V0LmxpbmVOO1xuICAgICAgZGlzcGxheS52aWV3VG8gKz0gbGVuZGlmZjtcbiAgICB9IGVsc2Uge1xuICAgICAgcmVzZXRWaWV3KGNtKTtcbiAgICB9XG4gIH0gZWxzZSBpZiAodG8gPj0gZGlzcGxheS52aWV3VG8pIHsgLy8gQm90dG9tIG92ZXJsYXBcbiAgICB2YXIgY3V0JDEgPSB2aWV3Q3V0dGluZ1BvaW50KGNtLCBmcm9tLCBmcm9tLCAtMSk7XG4gICAgaWYgKGN1dCQxKSB7XG4gICAgICBkaXNwbGF5LnZpZXcgPSBkaXNwbGF5LnZpZXcuc2xpY2UoMCwgY3V0JDEuaW5kZXgpO1xuICAgICAgZGlzcGxheS52aWV3VG8gPSBjdXQkMS5saW5lTjtcbiAgICB9IGVsc2Uge1xuICAgICAgcmVzZXRWaWV3KGNtKTtcbiAgICB9XG4gIH0gZWxzZSB7IC8vIEdhcCBpbiB0aGUgbWlkZGxlXG4gICAgdmFyIGN1dFRvcCA9IHZpZXdDdXR0aW5nUG9pbnQoY20sIGZyb20sIGZyb20sIC0xKTtcbiAgICB2YXIgY3V0Qm90ID0gdmlld0N1dHRpbmdQb2ludChjbSwgdG8sIHRvICsgbGVuZGlmZiwgMSk7XG4gICAgaWYgKGN1dFRvcCAmJiBjdXRCb3QpIHtcbiAgICAgIGRpc3BsYXkudmlldyA9IGRpc3BsYXkudmlldy5zbGljZSgwLCBjdXRUb3AuaW5kZXgpXG4gICAgICAgIC5jb25jYXQoYnVpbGRWaWV3QXJyYXkoY20sIGN1dFRvcC5saW5lTiwgY3V0Qm90LmxpbmVOKSlcbiAgICAgICAgLmNvbmNhdChkaXNwbGF5LnZpZXcuc2xpY2UoY3V0Qm90LmluZGV4KSk7XG4gICAgICBkaXNwbGF5LnZpZXdUbyArPSBsZW5kaWZmO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXNldFZpZXcoY20pO1xuICAgIH1cbiAgfVxuXG4gIHZhciBleHQgPSBkaXNwbGF5LmV4dGVybmFsTWVhc3VyZWQ7XG4gIGlmIChleHQpIHtcbiAgICBpZiAodG8gPCBleHQubGluZU4pXG4gICAgICB7IGV4dC5saW5lTiArPSBsZW5kaWZmOyB9XG4gICAgZWxzZSBpZiAoZnJvbSA8IGV4dC5saW5lTiArIGV4dC5zaXplKVxuICAgICAgeyBkaXNwbGF5LmV4dGVybmFsTWVhc3VyZWQgPSBudWxsOyB9XG4gIH1cbn1cblxuLy8gUmVnaXN0ZXIgYSBjaGFuZ2UgdG8gYSBzaW5nbGUgbGluZS4gVHlwZSBtdXN0IGJlIG9uZSBvZiBcInRleHRcIixcbi8vIFwiZ3V0dGVyXCIsIFwiY2xhc3NcIiwgXCJ3aWRnZXRcIlxuZnVuY3Rpb24gcmVnTGluZUNoYW5nZShjbSwgbGluZSwgdHlwZSkge1xuICBjbS5jdXJPcC52aWV3Q2hhbmdlZCA9IHRydWU7XG4gIHZhciBkaXNwbGF5ID0gY20uZGlzcGxheSwgZXh0ID0gY20uZGlzcGxheS5leHRlcm5hbE1lYXN1cmVkO1xuICBpZiAoZXh0ICYmIGxpbmUgPj0gZXh0LmxpbmVOICYmIGxpbmUgPCBleHQubGluZU4gKyBleHQuc2l6ZSlcbiAgICB7IGRpc3BsYXkuZXh0ZXJuYWxNZWFzdXJlZCA9IG51bGw7IH1cblxuICBpZiAobGluZSA8IGRpc3BsYXkudmlld0Zyb20gfHwgbGluZSA+PSBkaXNwbGF5LnZpZXdUbykgeyByZXR1cm4gfVxuICB2YXIgbGluZVZpZXcgPSBkaXNwbGF5LnZpZXdbZmluZFZpZXdJbmRleChjbSwgbGluZSldO1xuICBpZiAobGluZVZpZXcubm9kZSA9PSBudWxsKSB7IHJldHVybiB9XG4gIHZhciBhcnIgPSBsaW5lVmlldy5jaGFuZ2VzIHx8IChsaW5lVmlldy5jaGFuZ2VzID0gW10pO1xuICBpZiAoaW5kZXhPZihhcnIsIHR5cGUpID09IC0xKSB7IGFyci5wdXNoKHR5cGUpOyB9XG59XG5cbi8vIENsZWFyIHRoZSB2aWV3LlxuZnVuY3Rpb24gcmVzZXRWaWV3KGNtKSB7XG4gIGNtLmRpc3BsYXkudmlld0Zyb20gPSBjbS5kaXNwbGF5LnZpZXdUbyA9IGNtLmRvYy5maXJzdDtcbiAgY20uZGlzcGxheS52aWV3ID0gW107XG4gIGNtLmRpc3BsYXkudmlld09mZnNldCA9IDA7XG59XG5cbmZ1bmN0aW9uIHZpZXdDdXR0aW5nUG9pbnQoY20sIG9sZE4sIG5ld04sIGRpcikge1xuICB2YXIgaW5kZXggPSBmaW5kVmlld0luZGV4KGNtLCBvbGROKSwgZGlmZiwgdmlldyA9IGNtLmRpc3BsYXkudmlldztcbiAgaWYgKCFzYXdDb2xsYXBzZWRTcGFucyB8fCBuZXdOID09IGNtLmRvYy5maXJzdCArIGNtLmRvYy5zaXplKVxuICAgIHsgcmV0dXJuIHtpbmRleDogaW5kZXgsIGxpbmVOOiBuZXdOfSB9XG4gIHZhciBuID0gY20uZGlzcGxheS52aWV3RnJvbTtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBpbmRleDsgaSsrKVxuICAgIHsgbiArPSB2aWV3W2ldLnNpemU7IH1cbiAgaWYgKG4gIT0gb2xkTikge1xuICAgIGlmIChkaXIgPiAwKSB7XG4gICAgICBpZiAoaW5kZXggPT0gdmlldy5sZW5ndGggLSAxKSB7IHJldHVybiBudWxsIH1cbiAgICAgIGRpZmYgPSAobiArIHZpZXdbaW5kZXhdLnNpemUpIC0gb2xkTjtcbiAgICAgIGluZGV4Kys7XG4gICAgfSBlbHNlIHtcbiAgICAgIGRpZmYgPSBuIC0gb2xkTjtcbiAgICB9XG4gICAgb2xkTiArPSBkaWZmOyBuZXdOICs9IGRpZmY7XG4gIH1cbiAgd2hpbGUgKHZpc3VhbExpbmVObyhjbS5kb2MsIG5ld04pICE9IG5ld04pIHtcbiAgICBpZiAoaW5kZXggPT0gKGRpciA8IDAgPyAwIDogdmlldy5sZW5ndGggLSAxKSkgeyByZXR1cm4gbnVsbCB9XG4gICAgbmV3TiArPSBkaXIgKiB2aWV3W2luZGV4IC0gKGRpciA8IDAgPyAxIDogMCldLnNpemU7XG4gICAgaW5kZXggKz0gZGlyO1xuICB9XG4gIHJldHVybiB7aW5kZXg6IGluZGV4LCBsaW5lTjogbmV3Tn1cbn1cblxuLy8gRm9yY2UgdGhlIHZpZXcgdG8gY292ZXIgYSBnaXZlbiByYW5nZSwgYWRkaW5nIGVtcHR5IHZpZXcgZWxlbWVudFxuLy8gb3IgY2xpcHBpbmcgb2ZmIGV4aXN0aW5nIG9uZXMgYXMgbmVlZGVkLlxuZnVuY3Rpb24gYWRqdXN0VmlldyhjbSwgZnJvbSwgdG8pIHtcbiAgdmFyIGRpc3BsYXkgPSBjbS5kaXNwbGF5LCB2aWV3ID0gZGlzcGxheS52aWV3O1xuICBpZiAodmlldy5sZW5ndGggPT0gMCB8fCBmcm9tID49IGRpc3BsYXkudmlld1RvIHx8IHRvIDw9IGRpc3BsYXkudmlld0Zyb20pIHtcbiAgICBkaXNwbGF5LnZpZXcgPSBidWlsZFZpZXdBcnJheShjbSwgZnJvbSwgdG8pO1xuICAgIGRpc3BsYXkudmlld0Zyb20gPSBmcm9tO1xuICB9IGVsc2Uge1xuICAgIGlmIChkaXNwbGF5LnZpZXdGcm9tID4gZnJvbSlcbiAgICAgIHsgZGlzcGxheS52aWV3ID0gYnVpbGRWaWV3QXJyYXkoY20sIGZyb20sIGRpc3BsYXkudmlld0Zyb20pLmNvbmNhdChkaXNwbGF5LnZpZXcpOyB9XG4gICAgZWxzZSBpZiAoZGlzcGxheS52aWV3RnJvbSA8IGZyb20pXG4gICAgICB7IGRpc3BsYXkudmlldyA9IGRpc3BsYXkudmlldy5zbGljZShmaW5kVmlld0luZGV4KGNtLCBmcm9tKSk7IH1cbiAgICBkaXNwbGF5LnZpZXdGcm9tID0gZnJvbTtcbiAgICBpZiAoZGlzcGxheS52aWV3VG8gPCB0bylcbiAgICAgIHsgZGlzcGxheS52aWV3ID0gZGlzcGxheS52aWV3LmNvbmNhdChidWlsZFZpZXdBcnJheShjbSwgZGlzcGxheS52aWV3VG8sIHRvKSk7IH1cbiAgICBlbHNlIGlmIChkaXNwbGF5LnZpZXdUbyA+IHRvKVxuICAgICAgeyBkaXNwbGF5LnZpZXcgPSBkaXNwbGF5LnZpZXcuc2xpY2UoMCwgZmluZFZpZXdJbmRleChjbSwgdG8pKTsgfVxuICB9XG4gIGRpc3BsYXkudmlld1RvID0gdG87XG59XG5cbi8vIENvdW50IHRoZSBudW1iZXIgb2YgbGluZXMgaW4gdGhlIHZpZXcgd2hvc2UgRE9NIHJlcHJlc2VudGF0aW9uIGlzXG4vLyBvdXQgb2YgZGF0ZSAob3Igbm9uZXhpc3RlbnQpLlxuZnVuY3Rpb24gY291bnREaXJ0eVZpZXcoY20pIHtcbiAgdmFyIHZpZXcgPSBjbS5kaXNwbGF5LnZpZXcsIGRpcnR5ID0gMDtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCB2aWV3Lmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIGxpbmVWaWV3ID0gdmlld1tpXTtcbiAgICBpZiAoIWxpbmVWaWV3LmhpZGRlbiAmJiAoIWxpbmVWaWV3Lm5vZGUgfHwgbGluZVZpZXcuY2hhbmdlcykpIHsgKytkaXJ0eTsgfVxuICB9XG4gIHJldHVybiBkaXJ0eVxufVxuXG4vLyBISUdITElHSFQgV09SS0VSXG5cbmZ1bmN0aW9uIHN0YXJ0V29ya2VyKGNtLCB0aW1lKSB7XG4gIGlmIChjbS5kb2MuaGlnaGxpZ2h0RnJvbnRpZXIgPCBjbS5kaXNwbGF5LnZpZXdUbylcbiAgICB7IGNtLnN0YXRlLmhpZ2hsaWdodC5zZXQodGltZSwgYmluZChoaWdobGlnaHRXb3JrZXIsIGNtKSk7IH1cbn1cblxuZnVuY3Rpb24gaGlnaGxpZ2h0V29ya2VyKGNtKSB7XG4gIHZhciBkb2MgPSBjbS5kb2M7XG4gIGlmIChkb2MuaGlnaGxpZ2h0RnJvbnRpZXIgPj0gY20uZGlzcGxheS52aWV3VG8pIHsgcmV0dXJuIH1cbiAgdmFyIGVuZCA9ICtuZXcgRGF0ZSArIGNtLm9wdGlvbnMud29ya1RpbWU7XG4gIHZhciBjb250ZXh0ID0gZ2V0Q29udGV4dEJlZm9yZShjbSwgZG9jLmhpZ2hsaWdodEZyb250aWVyKTtcbiAgdmFyIGNoYW5nZWRMaW5lcyA9IFtdO1xuXG4gIGRvYy5pdGVyKGNvbnRleHQubGluZSwgTWF0aC5taW4oZG9jLmZpcnN0ICsgZG9jLnNpemUsIGNtLmRpc3BsYXkudmlld1RvICsgNTAwKSwgZnVuY3Rpb24gKGxpbmUpIHtcbiAgICBpZiAoY29udGV4dC5saW5lID49IGNtLmRpc3BsYXkudmlld0Zyb20pIHsgLy8gVmlzaWJsZVxuICAgICAgdmFyIG9sZFN0eWxlcyA9IGxpbmUuc3R5bGVzO1xuICAgICAgdmFyIHJlc2V0U3RhdGUgPSBsaW5lLnRleHQubGVuZ3RoID4gY20ub3B0aW9ucy5tYXhIaWdobGlnaHRMZW5ndGggPyBjb3B5U3RhdGUoZG9jLm1vZGUsIGNvbnRleHQuc3RhdGUpIDogbnVsbDtcbiAgICAgIHZhciBoaWdobGlnaHRlZCA9IGhpZ2hsaWdodExpbmUoY20sIGxpbmUsIGNvbnRleHQsIHRydWUpO1xuICAgICAgaWYgKHJlc2V0U3RhdGUpIHsgY29udGV4dC5zdGF0ZSA9IHJlc2V0U3RhdGU7IH1cbiAgICAgIGxpbmUuc3R5bGVzID0gaGlnaGxpZ2h0ZWQuc3R5bGVzO1xuICAgICAgdmFyIG9sZENscyA9IGxpbmUuc3R5bGVDbGFzc2VzLCBuZXdDbHMgPSBoaWdobGlnaHRlZC5jbGFzc2VzO1xuICAgICAgaWYgKG5ld0NscykgeyBsaW5lLnN0eWxlQ2xhc3NlcyA9IG5ld0NsczsgfVxuICAgICAgZWxzZSBpZiAob2xkQ2xzKSB7IGxpbmUuc3R5bGVDbGFzc2VzID0gbnVsbDsgfVxuICAgICAgdmFyIGlzY2hhbmdlID0gIW9sZFN0eWxlcyB8fCBvbGRTdHlsZXMubGVuZ3RoICE9IGxpbmUuc3R5bGVzLmxlbmd0aCB8fFxuICAgICAgICBvbGRDbHMgIT0gbmV3Q2xzICYmICghb2xkQ2xzIHx8ICFuZXdDbHMgfHwgb2xkQ2xzLmJnQ2xhc3MgIT0gbmV3Q2xzLmJnQ2xhc3MgfHwgb2xkQ2xzLnRleHRDbGFzcyAhPSBuZXdDbHMudGV4dENsYXNzKTtcbiAgICAgIGZvciAodmFyIGkgPSAwOyAhaXNjaGFuZ2UgJiYgaSA8IG9sZFN0eWxlcy5sZW5ndGg7ICsraSkgeyBpc2NoYW5nZSA9IG9sZFN0eWxlc1tpXSAhPSBsaW5lLnN0eWxlc1tpXTsgfVxuICAgICAgaWYgKGlzY2hhbmdlKSB7IGNoYW5nZWRMaW5lcy5wdXNoKGNvbnRleHQubGluZSk7IH1cbiAgICAgIGxpbmUuc3RhdGVBZnRlciA9IGNvbnRleHQuc2F2ZSgpO1xuICAgICAgY29udGV4dC5uZXh0TGluZSgpO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZiAobGluZS50ZXh0Lmxlbmd0aCA8PSBjbS5vcHRpb25zLm1heEhpZ2hsaWdodExlbmd0aClcbiAgICAgICAgeyBwcm9jZXNzTGluZShjbSwgbGluZS50ZXh0LCBjb250ZXh0KTsgfVxuICAgICAgbGluZS5zdGF0ZUFmdGVyID0gY29udGV4dC5saW5lICUgNSA9PSAwID8gY29udGV4dC5zYXZlKCkgOiBudWxsO1xuICAgICAgY29udGV4dC5uZXh0TGluZSgpO1xuICAgIH1cbiAgICBpZiAoK25ldyBEYXRlID4gZW5kKSB7XG4gICAgICBzdGFydFdvcmtlcihjbSwgY20ub3B0aW9ucy53b3JrRGVsYXkpO1xuICAgICAgcmV0dXJuIHRydWVcbiAgICB9XG4gIH0pO1xuICBkb2MuaGlnaGxpZ2h0RnJvbnRpZXIgPSBjb250ZXh0LmxpbmU7XG4gIGRvYy5tb2RlRnJvbnRpZXIgPSBNYXRoLm1heChkb2MubW9kZUZyb250aWVyLCBjb250ZXh0LmxpbmUpO1xuICBpZiAoY2hhbmdlZExpbmVzLmxlbmd0aCkgeyBydW5Jbk9wKGNtLCBmdW5jdGlvbiAoKSB7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjaGFuZ2VkTGluZXMubGVuZ3RoOyBpKyspXG4gICAgICB7IHJlZ0xpbmVDaGFuZ2UoY20sIGNoYW5nZWRMaW5lc1tpXSwgXCJ0ZXh0XCIpOyB9XG4gIH0pOyB9XG59XG5cbi8vIERJU1BMQVkgRFJBV0lOR1xuXG52YXIgRGlzcGxheVVwZGF0ZSA9IGZ1bmN0aW9uKGNtLCB2aWV3cG9ydCwgZm9yY2UpIHtcbiAgdmFyIGRpc3BsYXkgPSBjbS5kaXNwbGF5O1xuXG4gIHRoaXMudmlld3BvcnQgPSB2aWV3cG9ydDtcbiAgLy8gU3RvcmUgc29tZSB2YWx1ZXMgdGhhdCB3ZSdsbCBuZWVkIGxhdGVyIChidXQgZG9uJ3Qgd2FudCB0byBmb3JjZSBhIHJlbGF5b3V0IGZvcilcbiAgdGhpcy52aXNpYmxlID0gdmlzaWJsZUxpbmVzKGRpc3BsYXksIGNtLmRvYywgdmlld3BvcnQpO1xuICB0aGlzLmVkaXRvcklzSGlkZGVuID0gIWRpc3BsYXkud3JhcHBlci5vZmZzZXRXaWR0aDtcbiAgdGhpcy53cmFwcGVySGVpZ2h0ID0gZGlzcGxheS53cmFwcGVyLmNsaWVudEhlaWdodDtcbiAgdGhpcy53cmFwcGVyV2lkdGggPSBkaXNwbGF5LndyYXBwZXIuY2xpZW50V2lkdGg7XG4gIHRoaXMub2xkRGlzcGxheVdpZHRoID0gZGlzcGxheVdpZHRoKGNtKTtcbiAgdGhpcy5mb3JjZSA9IGZvcmNlO1xuICB0aGlzLmRpbXMgPSBnZXREaW1lbnNpb25zKGNtKTtcbiAgdGhpcy5ldmVudHMgPSBbXTtcbn07XG5cbkRpc3BsYXlVcGRhdGUucHJvdG90eXBlLnNpZ25hbCA9IGZ1bmN0aW9uIChlbWl0dGVyLCB0eXBlKSB7XG4gIGlmIChoYXNIYW5kbGVyKGVtaXR0ZXIsIHR5cGUpKVxuICAgIHsgdGhpcy5ldmVudHMucHVzaChhcmd1bWVudHMpOyB9XG59O1xuRGlzcGxheVVwZGF0ZS5wcm90b3R5cGUuZmluaXNoID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciB0aGlzJDEgPSB0aGlzO1xuXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5ldmVudHMubGVuZ3RoOyBpKyspXG4gICAgeyBzaWduYWwuYXBwbHkobnVsbCwgdGhpcyQxLmV2ZW50c1tpXSk7IH1cbn07XG5cbmZ1bmN0aW9uIG1heWJlQ2xpcFNjcm9sbGJhcnMoY20pIHtcbiAgdmFyIGRpc3BsYXkgPSBjbS5kaXNwbGF5O1xuICBpZiAoIWRpc3BsYXkuc2Nyb2xsYmFyc0NsaXBwZWQgJiYgZGlzcGxheS5zY3JvbGxlci5vZmZzZXRXaWR0aCkge1xuICAgIGRpc3BsYXkubmF0aXZlQmFyV2lkdGggPSBkaXNwbGF5LnNjcm9sbGVyLm9mZnNldFdpZHRoIC0gZGlzcGxheS5zY3JvbGxlci5jbGllbnRXaWR0aDtcbiAgICBkaXNwbGF5LmhlaWdodEZvcmNlci5zdHlsZS5oZWlnaHQgPSBzY3JvbGxHYXAoY20pICsgXCJweFwiO1xuICAgIGRpc3BsYXkuc2l6ZXIuc3R5bGUubWFyZ2luQm90dG9tID0gLWRpc3BsYXkubmF0aXZlQmFyV2lkdGggKyBcInB4XCI7XG4gICAgZGlzcGxheS5zaXplci5zdHlsZS5ib3JkZXJSaWdodFdpZHRoID0gc2Nyb2xsR2FwKGNtKSArIFwicHhcIjtcbiAgICBkaXNwbGF5LnNjcm9sbGJhcnNDbGlwcGVkID0gdHJ1ZTtcbiAgfVxufVxuXG5mdW5jdGlvbiBzZWxlY3Rpb25TbmFwc2hvdChjbSkge1xuICBpZiAoY20uaGFzRm9jdXMoKSkgeyByZXR1cm4gbnVsbCB9XG4gIHZhciBhY3RpdmUgPSBhY3RpdmVFbHQoKTtcbiAgaWYgKCFhY3RpdmUgfHwgIWNvbnRhaW5zKGNtLmRpc3BsYXkubGluZURpdiwgYWN0aXZlKSkgeyByZXR1cm4gbnVsbCB9XG4gIHZhciByZXN1bHQgPSB7YWN0aXZlRWx0OiBhY3RpdmV9O1xuICBpZiAod2luZG93LmdldFNlbGVjdGlvbikge1xuICAgIHZhciBzZWwgPSB3aW5kb3cuZ2V0U2VsZWN0aW9uKCk7XG4gICAgaWYgKHNlbC5hbmNob3JOb2RlICYmIHNlbC5leHRlbmQgJiYgY29udGFpbnMoY20uZGlzcGxheS5saW5lRGl2LCBzZWwuYW5jaG9yTm9kZSkpIHtcbiAgICAgIHJlc3VsdC5hbmNob3JOb2RlID0gc2VsLmFuY2hvck5vZGU7XG4gICAgICByZXN1bHQuYW5jaG9yT2Zmc2V0ID0gc2VsLmFuY2hvck9mZnNldDtcbiAgICAgIHJlc3VsdC5mb2N1c05vZGUgPSBzZWwuZm9jdXNOb2RlO1xuICAgICAgcmVzdWx0LmZvY3VzT2Zmc2V0ID0gc2VsLmZvY3VzT2Zmc2V0O1xuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzdWx0XG59XG5cbmZ1bmN0aW9uIHJlc3RvcmVTZWxlY3Rpb24oc25hcHNob3QpIHtcbiAgaWYgKCFzbmFwc2hvdCB8fCAhc25hcHNob3QuYWN0aXZlRWx0IHx8IHNuYXBzaG90LmFjdGl2ZUVsdCA9PSBhY3RpdmVFbHQoKSkgeyByZXR1cm4gfVxuICBzbmFwc2hvdC5hY3RpdmVFbHQuZm9jdXMoKTtcbiAgaWYgKHNuYXBzaG90LmFuY2hvck5vZGUgJiYgY29udGFpbnMoZG9jdW1lbnQuYm9keSwgc25hcHNob3QuYW5jaG9yTm9kZSkgJiYgY29udGFpbnMoZG9jdW1lbnQuYm9keSwgc25hcHNob3QuZm9jdXNOb2RlKSkge1xuICAgIHZhciBzZWwgPSB3aW5kb3cuZ2V0U2VsZWN0aW9uKCksIHJhbmdlJCQxID0gZG9jdW1lbnQuY3JlYXRlUmFuZ2UoKTtcbiAgICByYW5nZSQkMS5zZXRFbmQoc25hcHNob3QuYW5jaG9yTm9kZSwgc25hcHNob3QuYW5jaG9yT2Zmc2V0KTtcbiAgICByYW5nZSQkMS5jb2xsYXBzZShmYWxzZSk7XG4gICAgc2VsLnJlbW92ZUFsbFJhbmdlcygpO1xuICAgIHNlbC5hZGRSYW5nZShyYW5nZSQkMSk7XG4gICAgc2VsLmV4dGVuZChzbmFwc2hvdC5mb2N1c05vZGUsIHNuYXBzaG90LmZvY3VzT2Zmc2V0KTtcbiAgfVxufVxuXG4vLyBEb2VzIHRoZSBhY3R1YWwgdXBkYXRpbmcgb2YgdGhlIGxpbmUgZGlzcGxheS4gQmFpbHMgb3V0XG4vLyAocmV0dXJuaW5nIGZhbHNlKSB3aGVuIHRoZXJlIGlzIG5vdGhpbmcgdG8gYmUgZG9uZSBhbmQgZm9yY2VkIGlzXG4vLyBmYWxzZS5cbmZ1bmN0aW9uIHVwZGF0ZURpc3BsYXlJZk5lZWRlZChjbSwgdXBkYXRlKSB7XG4gIHZhciBkaXNwbGF5ID0gY20uZGlzcGxheSwgZG9jID0gY20uZG9jO1xuXG4gIGlmICh1cGRhdGUuZWRpdG9ySXNIaWRkZW4pIHtcbiAgICByZXNldFZpZXcoY20pO1xuICAgIHJldHVybiBmYWxzZVxuICB9XG5cbiAgLy8gQmFpbCBvdXQgaWYgdGhlIHZpc2libGUgYXJlYSBpcyBhbHJlYWR5IHJlbmRlcmVkIGFuZCBub3RoaW5nIGNoYW5nZWQuXG4gIGlmICghdXBkYXRlLmZvcmNlICYmXG4gICAgICB1cGRhdGUudmlzaWJsZS5mcm9tID49IGRpc3BsYXkudmlld0Zyb20gJiYgdXBkYXRlLnZpc2libGUudG8gPD0gZGlzcGxheS52aWV3VG8gJiZcbiAgICAgIChkaXNwbGF5LnVwZGF0ZUxpbmVOdW1iZXJzID09IG51bGwgfHwgZGlzcGxheS51cGRhdGVMaW5lTnVtYmVycyA+PSBkaXNwbGF5LnZpZXdUbykgJiZcbiAgICAgIGRpc3BsYXkucmVuZGVyZWRWaWV3ID09IGRpc3BsYXkudmlldyAmJiBjb3VudERpcnR5VmlldyhjbSkgPT0gMClcbiAgICB7IHJldHVybiBmYWxzZSB9XG5cbiAgaWYgKG1heWJlVXBkYXRlTGluZU51bWJlcldpZHRoKGNtKSkge1xuICAgIHJlc2V0VmlldyhjbSk7XG4gICAgdXBkYXRlLmRpbXMgPSBnZXREaW1lbnNpb25zKGNtKTtcbiAgfVxuXG4gIC8vIENvbXB1dGUgYSBzdWl0YWJsZSBuZXcgdmlld3BvcnQgKGZyb20gJiB0bylcbiAgdmFyIGVuZCA9IGRvYy5maXJzdCArIGRvYy5zaXplO1xuICB2YXIgZnJvbSA9IE1hdGgubWF4KHVwZGF0ZS52aXNpYmxlLmZyb20gLSBjbS5vcHRpb25zLnZpZXdwb3J0TWFyZ2luLCBkb2MuZmlyc3QpO1xuICB2YXIgdG8gPSBNYXRoLm1pbihlbmQsIHVwZGF0ZS52aXNpYmxlLnRvICsgY20ub3B0aW9ucy52aWV3cG9ydE1hcmdpbik7XG4gIGlmIChkaXNwbGF5LnZpZXdGcm9tIDwgZnJvbSAmJiBmcm9tIC0gZGlzcGxheS52aWV3RnJvbSA8IDIwKSB7IGZyb20gPSBNYXRoLm1heChkb2MuZmlyc3QsIGRpc3BsYXkudmlld0Zyb20pOyB9XG4gIGlmIChkaXNwbGF5LnZpZXdUbyA+IHRvICYmIGRpc3BsYXkudmlld1RvIC0gdG8gPCAyMCkgeyB0byA9IE1hdGgubWluKGVuZCwgZGlzcGxheS52aWV3VG8pOyB9XG4gIGlmIChzYXdDb2xsYXBzZWRTcGFucykge1xuICAgIGZyb20gPSB2aXN1YWxMaW5lTm8oY20uZG9jLCBmcm9tKTtcbiAgICB0byA9IHZpc3VhbExpbmVFbmRObyhjbS5kb2MsIHRvKTtcbiAgfVxuXG4gIHZhciBkaWZmZXJlbnQgPSBmcm9tICE9IGRpc3BsYXkudmlld0Zyb20gfHwgdG8gIT0gZGlzcGxheS52aWV3VG8gfHxcbiAgICBkaXNwbGF5Lmxhc3RXcmFwSGVpZ2h0ICE9IHVwZGF0ZS53cmFwcGVySGVpZ2h0IHx8IGRpc3BsYXkubGFzdFdyYXBXaWR0aCAhPSB1cGRhdGUud3JhcHBlcldpZHRoO1xuICBhZGp1c3RWaWV3KGNtLCBmcm9tLCB0byk7XG5cbiAgZGlzcGxheS52aWV3T2Zmc2V0ID0gaGVpZ2h0QXRMaW5lKGdldExpbmUoY20uZG9jLCBkaXNwbGF5LnZpZXdGcm9tKSk7XG4gIC8vIFBvc2l0aW9uIHRoZSBtb3ZlciBkaXYgdG8gYWxpZ24gd2l0aCB0aGUgY3VycmVudCBzY3JvbGwgcG9zaXRpb25cbiAgY20uZGlzcGxheS5tb3Zlci5zdHlsZS50b3AgPSBkaXNwbGF5LnZpZXdPZmZzZXQgKyBcInB4XCI7XG5cbiAgdmFyIHRvVXBkYXRlID0gY291bnREaXJ0eVZpZXcoY20pO1xuICBpZiAoIWRpZmZlcmVudCAmJiB0b1VwZGF0ZSA9PSAwICYmICF1cGRhdGUuZm9yY2UgJiYgZGlzcGxheS5yZW5kZXJlZFZpZXcgPT0gZGlzcGxheS52aWV3ICYmXG4gICAgICAoZGlzcGxheS51cGRhdGVMaW5lTnVtYmVycyA9PSBudWxsIHx8IGRpc3BsYXkudXBkYXRlTGluZU51bWJlcnMgPj0gZGlzcGxheS52aWV3VG8pKVxuICAgIHsgcmV0dXJuIGZhbHNlIH1cblxuICAvLyBGb3IgYmlnIGNoYW5nZXMsIHdlIGhpZGUgdGhlIGVuY2xvc2luZyBlbGVtZW50IGR1cmluZyB0aGVcbiAgLy8gdXBkYXRlLCBzaW5jZSB0aGF0IHNwZWVkcyB1cCB0aGUgb3BlcmF0aW9ucyBvbiBtb3N0IGJyb3dzZXJzLlxuICB2YXIgc2VsU25hcHNob3QgPSBzZWxlY3Rpb25TbmFwc2hvdChjbSk7XG4gIGlmICh0b1VwZGF0ZSA+IDQpIHsgZGlzcGxheS5saW5lRGl2LnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjsgfVxuICBwYXRjaERpc3BsYXkoY20sIGRpc3BsYXkudXBkYXRlTGluZU51bWJlcnMsIHVwZGF0ZS5kaW1zKTtcbiAgaWYgKHRvVXBkYXRlID4gNCkgeyBkaXNwbGF5LmxpbmVEaXYuc3R5bGUuZGlzcGxheSA9IFwiXCI7IH1cbiAgZGlzcGxheS5yZW5kZXJlZFZpZXcgPSBkaXNwbGF5LnZpZXc7XG4gIC8vIFRoZXJlIG1pZ2h0IGhhdmUgYmVlbiBhIHdpZGdldCB3aXRoIGEgZm9jdXNlZCBlbGVtZW50IHRoYXQgZ290XG4gIC8vIGhpZGRlbiBvciB1cGRhdGVkLCBpZiBzbyByZS1mb2N1cyBpdC5cbiAgcmVzdG9yZVNlbGVjdGlvbihzZWxTbmFwc2hvdCk7XG5cbiAgLy8gUHJldmVudCBzZWxlY3Rpb24gYW5kIGN1cnNvcnMgZnJvbSBpbnRlcmZlcmluZyB3aXRoIHRoZSBzY3JvbGxcbiAgLy8gd2lkdGggYW5kIGhlaWdodC5cbiAgcmVtb3ZlQ2hpbGRyZW4oZGlzcGxheS5jdXJzb3JEaXYpO1xuICByZW1vdmVDaGlsZHJlbihkaXNwbGF5LnNlbGVjdGlvbkRpdik7XG4gIGRpc3BsYXkuZ3V0dGVycy5zdHlsZS5oZWlnaHQgPSBkaXNwbGF5LnNpemVyLnN0eWxlLm1pbkhlaWdodCA9IDA7XG5cbiAgaWYgKGRpZmZlcmVudCkge1xuICAgIGRpc3BsYXkubGFzdFdyYXBIZWlnaHQgPSB1cGRhdGUud3JhcHBlckhlaWdodDtcbiAgICBkaXNwbGF5Lmxhc3RXcmFwV2lkdGggPSB1cGRhdGUud3JhcHBlcldpZHRoO1xuICAgIHN0YXJ0V29ya2VyKGNtLCA0MDApO1xuICB9XG5cbiAgZGlzcGxheS51cGRhdGVMaW5lTnVtYmVycyA9IG51bGw7XG5cbiAgcmV0dXJuIHRydWVcbn1cblxuZnVuY3Rpb24gcG9zdFVwZGF0ZURpc3BsYXkoY20sIHVwZGF0ZSkge1xuICB2YXIgdmlld3BvcnQgPSB1cGRhdGUudmlld3BvcnQ7XG5cbiAgZm9yICh2YXIgZmlyc3QgPSB0cnVlOzsgZmlyc3QgPSBmYWxzZSkge1xuICAgIGlmICghZmlyc3QgfHwgIWNtLm9wdGlvbnMubGluZVdyYXBwaW5nIHx8IHVwZGF0ZS5vbGREaXNwbGF5V2lkdGggPT0gZGlzcGxheVdpZHRoKGNtKSkge1xuICAgICAgLy8gQ2xpcCBmb3JjZWQgdmlld3BvcnQgdG8gYWN0dWFsIHNjcm9sbGFibGUgYXJlYS5cbiAgICAgIGlmICh2aWV3cG9ydCAmJiB2aWV3cG9ydC50b3AgIT0gbnVsbClcbiAgICAgICAgeyB2aWV3cG9ydCA9IHt0b3A6IE1hdGgubWluKGNtLmRvYy5oZWlnaHQgKyBwYWRkaW5nVmVydChjbS5kaXNwbGF5KSAtIGRpc3BsYXlIZWlnaHQoY20pLCB2aWV3cG9ydC50b3ApfTsgfVxuICAgICAgLy8gVXBkYXRlZCBsaW5lIGhlaWdodHMgbWlnaHQgcmVzdWx0IGluIHRoZSBkcmF3biBhcmVhIG5vdFxuICAgICAgLy8gYWN0dWFsbHkgY292ZXJpbmcgdGhlIHZpZXdwb3J0LiBLZWVwIGxvb3BpbmcgdW50aWwgaXQgZG9lcy5cbiAgICAgIHVwZGF0ZS52aXNpYmxlID0gdmlzaWJsZUxpbmVzKGNtLmRpc3BsYXksIGNtLmRvYywgdmlld3BvcnQpO1xuICAgICAgaWYgKHVwZGF0ZS52aXNpYmxlLmZyb20gPj0gY20uZGlzcGxheS52aWV3RnJvbSAmJiB1cGRhdGUudmlzaWJsZS50byA8PSBjbS5kaXNwbGF5LnZpZXdUbylcbiAgICAgICAgeyBicmVhayB9XG4gICAgfVxuICAgIGlmICghdXBkYXRlRGlzcGxheUlmTmVlZGVkKGNtLCB1cGRhdGUpKSB7IGJyZWFrIH1cbiAgICB1cGRhdGVIZWlnaHRzSW5WaWV3cG9ydChjbSk7XG4gICAgdmFyIGJhck1lYXN1cmUgPSBtZWFzdXJlRm9yU2Nyb2xsYmFycyhjbSk7XG4gICAgdXBkYXRlU2VsZWN0aW9uKGNtKTtcbiAgICB1cGRhdGVTY3JvbGxiYXJzKGNtLCBiYXJNZWFzdXJlKTtcbiAgICBzZXREb2N1bWVudEhlaWdodChjbSwgYmFyTWVhc3VyZSk7XG4gICAgdXBkYXRlLmZvcmNlID0gZmFsc2U7XG4gIH1cblxuICB1cGRhdGUuc2lnbmFsKGNtLCBcInVwZGF0ZVwiLCBjbSk7XG4gIGlmIChjbS5kaXNwbGF5LnZpZXdGcm9tICE9IGNtLmRpc3BsYXkucmVwb3J0ZWRWaWV3RnJvbSB8fCBjbS5kaXNwbGF5LnZpZXdUbyAhPSBjbS5kaXNwbGF5LnJlcG9ydGVkVmlld1RvKSB7XG4gICAgdXBkYXRlLnNpZ25hbChjbSwgXCJ2aWV3cG9ydENoYW5nZVwiLCBjbSwgY20uZGlzcGxheS52aWV3RnJvbSwgY20uZGlzcGxheS52aWV3VG8pO1xuICAgIGNtLmRpc3BsYXkucmVwb3J0ZWRWaWV3RnJvbSA9IGNtLmRpc3BsYXkudmlld0Zyb207IGNtLmRpc3BsYXkucmVwb3J0ZWRWaWV3VG8gPSBjbS5kaXNwbGF5LnZpZXdUbztcbiAgfVxufVxuXG5mdW5jdGlvbiB1cGRhdGVEaXNwbGF5U2ltcGxlKGNtLCB2aWV3cG9ydCkge1xuICB2YXIgdXBkYXRlID0gbmV3IERpc3BsYXlVcGRhdGUoY20sIHZpZXdwb3J0KTtcbiAgaWYgKHVwZGF0ZURpc3BsYXlJZk5lZWRlZChjbSwgdXBkYXRlKSkge1xuICAgIHVwZGF0ZUhlaWdodHNJblZpZXdwb3J0KGNtKTtcbiAgICBwb3N0VXBkYXRlRGlzcGxheShjbSwgdXBkYXRlKTtcbiAgICB2YXIgYmFyTWVhc3VyZSA9IG1lYXN1cmVGb3JTY3JvbGxiYXJzKGNtKTtcbiAgICB1cGRhdGVTZWxlY3Rpb24oY20pO1xuICAgIHVwZGF0ZVNjcm9sbGJhcnMoY20sIGJhck1lYXN1cmUpO1xuICAgIHNldERvY3VtZW50SGVpZ2h0KGNtLCBiYXJNZWFzdXJlKTtcbiAgICB1cGRhdGUuZmluaXNoKCk7XG4gIH1cbn1cblxuLy8gU3luYyB0aGUgYWN0dWFsIGRpc3BsYXkgRE9NIHN0cnVjdHVyZSB3aXRoIGRpc3BsYXkudmlldywgcmVtb3Zpbmdcbi8vIG5vZGVzIGZvciBsaW5lcyB0aGF0IGFyZSBubyBsb25nZXIgaW4gdmlldywgYW5kIGNyZWF0aW5nIHRoZSBvbmVzXG4vLyB0aGF0IGFyZSBub3QgdGhlcmUgeWV0LCBhbmQgdXBkYXRpbmcgdGhlIG9uZXMgdGhhdCBhcmUgb3V0IG9mXG4vLyBkYXRlLlxuZnVuY3Rpb24gcGF0Y2hEaXNwbGF5KGNtLCB1cGRhdGVOdW1iZXJzRnJvbSwgZGltcykge1xuICB2YXIgZGlzcGxheSA9IGNtLmRpc3BsYXksIGxpbmVOdW1iZXJzID0gY20ub3B0aW9ucy5saW5lTnVtYmVycztcbiAgdmFyIGNvbnRhaW5lciA9IGRpc3BsYXkubGluZURpdiwgY3VyID0gY29udGFpbmVyLmZpcnN0Q2hpbGQ7XG5cbiAgZnVuY3Rpb24gcm0obm9kZSkge1xuICAgIHZhciBuZXh0ID0gbm9kZS5uZXh0U2libGluZztcbiAgICAvLyBXb3JrcyBhcm91bmQgYSB0aHJvdy1zY3JvbGwgYnVnIGluIE9TIFggV2Via2l0XG4gICAgaWYgKHdlYmtpdCAmJiBtYWMgJiYgY20uZGlzcGxheS5jdXJyZW50V2hlZWxUYXJnZXQgPT0gbm9kZSlcbiAgICAgIHsgbm9kZS5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7IH1cbiAgICBlbHNlXG4gICAgICB7IG5vZGUucGFyZW50Tm9kZS5yZW1vdmVDaGlsZChub2RlKTsgfVxuICAgIHJldHVybiBuZXh0XG4gIH1cblxuICB2YXIgdmlldyA9IGRpc3BsYXkudmlldywgbGluZU4gPSBkaXNwbGF5LnZpZXdGcm9tO1xuICAvLyBMb29wIG92ZXIgdGhlIGVsZW1lbnRzIGluIHRoZSB2aWV3LCBzeW5jaW5nIGN1ciAodGhlIERPTSBub2Rlc1xuICAvLyBpbiBkaXNwbGF5LmxpbmVEaXYpIHdpdGggdGhlIHZpZXcgYXMgd2UgZ28uXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgdmlldy5sZW5ndGg7IGkrKykge1xuICAgIHZhciBsaW5lVmlldyA9IHZpZXdbaV07XG4gICAgaWYgKGxpbmVWaWV3LmhpZGRlbikge1xuICAgIH0gZWxzZSBpZiAoIWxpbmVWaWV3Lm5vZGUgfHwgbGluZVZpZXcubm9kZS5wYXJlbnROb2RlICE9IGNvbnRhaW5lcikgeyAvLyBOb3QgZHJhd24geWV0XG4gICAgICB2YXIgbm9kZSA9IGJ1aWxkTGluZUVsZW1lbnQoY20sIGxpbmVWaWV3LCBsaW5lTiwgZGltcyk7XG4gICAgICBjb250YWluZXIuaW5zZXJ0QmVmb3JlKG5vZGUsIGN1cik7XG4gICAgfSBlbHNlIHsgLy8gQWxyZWFkeSBkcmF3blxuICAgICAgd2hpbGUgKGN1ciAhPSBsaW5lVmlldy5ub2RlKSB7IGN1ciA9IHJtKGN1cik7IH1cbiAgICAgIHZhciB1cGRhdGVOdW1iZXIgPSBsaW5lTnVtYmVycyAmJiB1cGRhdGVOdW1iZXJzRnJvbSAhPSBudWxsICYmXG4gICAgICAgIHVwZGF0ZU51bWJlcnNGcm9tIDw9IGxpbmVOICYmIGxpbmVWaWV3LmxpbmVOdW1iZXI7XG4gICAgICBpZiAobGluZVZpZXcuY2hhbmdlcykge1xuICAgICAgICBpZiAoaW5kZXhPZihsaW5lVmlldy5jaGFuZ2VzLCBcImd1dHRlclwiKSA+IC0xKSB7IHVwZGF0ZU51bWJlciA9IGZhbHNlOyB9XG4gICAgICAgIHVwZGF0ZUxpbmVGb3JDaGFuZ2VzKGNtLCBsaW5lVmlldywgbGluZU4sIGRpbXMpO1xuICAgICAgfVxuICAgICAgaWYgKHVwZGF0ZU51bWJlcikge1xuICAgICAgICByZW1vdmVDaGlsZHJlbihsaW5lVmlldy5saW5lTnVtYmVyKTtcbiAgICAgICAgbGluZVZpZXcubGluZU51bWJlci5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShsaW5lTnVtYmVyRm9yKGNtLm9wdGlvbnMsIGxpbmVOKSkpO1xuICAgICAgfVxuICAgICAgY3VyID0gbGluZVZpZXcubm9kZS5uZXh0U2libGluZztcbiAgICB9XG4gICAgbGluZU4gKz0gbGluZVZpZXcuc2l6ZTtcbiAgfVxuICB3aGlsZSAoY3VyKSB7IGN1ciA9IHJtKGN1cik7IH1cbn1cblxuZnVuY3Rpb24gdXBkYXRlR3V0dGVyU3BhY2UoY20pIHtcbiAgdmFyIHdpZHRoID0gY20uZGlzcGxheS5ndXR0ZXJzLm9mZnNldFdpZHRoO1xuICBjbS5kaXNwbGF5LnNpemVyLnN0eWxlLm1hcmdpbkxlZnQgPSB3aWR0aCArIFwicHhcIjtcbn1cblxuZnVuY3Rpb24gc2V0RG9jdW1lbnRIZWlnaHQoY20sIG1lYXN1cmUpIHtcbiAgY20uZGlzcGxheS5zaXplci5zdHlsZS5taW5IZWlnaHQgPSBtZWFzdXJlLmRvY0hlaWdodCArIFwicHhcIjtcbiAgY20uZGlzcGxheS5oZWlnaHRGb3JjZXIuc3R5bGUudG9wID0gbWVhc3VyZS5kb2NIZWlnaHQgKyBcInB4XCI7XG4gIGNtLmRpc3BsYXkuZ3V0dGVycy5zdHlsZS5oZWlnaHQgPSAobWVhc3VyZS5kb2NIZWlnaHQgKyBjbS5kaXNwbGF5LmJhckhlaWdodCArIHNjcm9sbEdhcChjbSkpICsgXCJweFwiO1xufVxuXG4vLyBSZWJ1aWxkIHRoZSBndXR0ZXIgZWxlbWVudHMsIGVuc3VyZSB0aGUgbWFyZ2luIHRvIHRoZSBsZWZ0IG9mIHRoZVxuLy8gY29kZSBtYXRjaGVzIHRoZWlyIHdpZHRoLlxuZnVuY3Rpb24gdXBkYXRlR3V0dGVycyhjbSkge1xuICB2YXIgZ3V0dGVycyA9IGNtLmRpc3BsYXkuZ3V0dGVycywgc3BlY3MgPSBjbS5vcHRpb25zLmd1dHRlcnM7XG4gIHJlbW92ZUNoaWxkcmVuKGd1dHRlcnMpO1xuICB2YXIgaSA9IDA7XG4gIGZvciAoOyBpIDwgc3BlY3MubGVuZ3RoOyArK2kpIHtcbiAgICB2YXIgZ3V0dGVyQ2xhc3MgPSBzcGVjc1tpXTtcbiAgICB2YXIgZ0VsdCA9IGd1dHRlcnMuYXBwZW5kQ2hpbGQoZWx0KFwiZGl2XCIsIG51bGwsIFwiQ29kZU1pcnJvci1ndXR0ZXIgXCIgKyBndXR0ZXJDbGFzcykpO1xuICAgIGlmIChndXR0ZXJDbGFzcyA9PSBcIkNvZGVNaXJyb3ItbGluZW51bWJlcnNcIikge1xuICAgICAgY20uZGlzcGxheS5saW5lR3V0dGVyID0gZ0VsdDtcbiAgICAgIGdFbHQuc3R5bGUud2lkdGggPSAoY20uZGlzcGxheS5saW5lTnVtV2lkdGggfHwgMSkgKyBcInB4XCI7XG4gICAgfVxuICB9XG4gIGd1dHRlcnMuc3R5bGUuZGlzcGxheSA9IGkgPyBcIlwiIDogXCJub25lXCI7XG4gIHVwZGF0ZUd1dHRlclNwYWNlKGNtKTtcbn1cblxuLy8gTWFrZSBzdXJlIHRoZSBndXR0ZXJzIG9wdGlvbnMgY29udGFpbnMgdGhlIGVsZW1lbnRcbi8vIFwiQ29kZU1pcnJvci1saW5lbnVtYmVyc1wiIHdoZW4gdGhlIGxpbmVOdW1iZXJzIG9wdGlvbiBpcyB0cnVlLlxuZnVuY3Rpb24gc2V0R3V0dGVyc0ZvckxpbmVOdW1iZXJzKG9wdGlvbnMpIHtcbiAgdmFyIGZvdW5kID0gaW5kZXhPZihvcHRpb25zLmd1dHRlcnMsIFwiQ29kZU1pcnJvci1saW5lbnVtYmVyc1wiKTtcbiAgaWYgKGZvdW5kID09IC0xICYmIG9wdGlvbnMubGluZU51bWJlcnMpIHtcbiAgICBvcHRpb25zLmd1dHRlcnMgPSBvcHRpb25zLmd1dHRlcnMuY29uY2F0KFtcIkNvZGVNaXJyb3ItbGluZW51bWJlcnNcIl0pO1xuICB9IGVsc2UgaWYgKGZvdW5kID4gLTEgJiYgIW9wdGlvbnMubGluZU51bWJlcnMpIHtcbiAgICBvcHRpb25zLmd1dHRlcnMgPSBvcHRpb25zLmd1dHRlcnMuc2xpY2UoMCk7XG4gICAgb3B0aW9ucy5ndXR0ZXJzLnNwbGljZShmb3VuZCwgMSk7XG4gIH1cbn1cblxuLy8gU2luY2UgdGhlIGRlbHRhIHZhbHVlcyByZXBvcnRlZCBvbiBtb3VzZSB3aGVlbCBldmVudHMgYXJlXG4vLyB1bnN0YW5kYXJkaXplZCBiZXR3ZWVuIGJyb3dzZXJzIGFuZCBldmVuIGJyb3dzZXIgdmVyc2lvbnMsIGFuZFxuLy8gZ2VuZXJhbGx5IGhvcnJpYmx5IHVucHJlZGljdGFibGUsIHRoaXMgY29kZSBzdGFydHMgYnkgbWVhc3VyaW5nXG4vLyB0aGUgc2Nyb2xsIGVmZmVjdCB0aGF0IHRoZSBmaXJzdCBmZXcgbW91c2Ugd2hlZWwgZXZlbnRzIGhhdmUsXG4vLyBhbmQsIGZyb20gdGhhdCwgZGV0ZWN0cyB0aGUgd2F5IGl0IGNhbiBjb252ZXJ0IGRlbHRhcyB0byBwaXhlbFxuLy8gb2Zmc2V0cyBhZnRlcndhcmRzLlxuLy9cbi8vIFRoZSByZWFzb24gd2Ugd2FudCB0byBrbm93IHRoZSBhbW91bnQgYSB3aGVlbCBldmVudCB3aWxsIHNjcm9sbFxuLy8gaXMgdGhhdCBpdCBnaXZlcyB1cyBhIGNoYW5jZSB0byB1cGRhdGUgdGhlIGRpc3BsYXkgYmVmb3JlIHRoZVxuLy8gYWN0dWFsIHNjcm9sbGluZyBoYXBwZW5zLCByZWR1Y2luZyBmbGlja2VyaW5nLlxuXG52YXIgd2hlZWxTYW1wbGVzID0gMDtcbnZhciB3aGVlbFBpeGVsc1BlclVuaXQgPSBudWxsO1xuLy8gRmlsbCBpbiBhIGJyb3dzZXItZGV0ZWN0ZWQgc3RhcnRpbmcgdmFsdWUgb24gYnJvd3NlcnMgd2hlcmUgd2Vcbi8vIGtub3cgb25lLiBUaGVzZSBkb24ndCBoYXZlIHRvIGJlIGFjY3VyYXRlIC0tIHRoZSByZXN1bHQgb2YgdGhlbVxuLy8gYmVpbmcgd3Jvbmcgd291bGQganVzdCBiZSBhIHNsaWdodCBmbGlja2VyIG9uIHRoZSBmaXJzdCB3aGVlbFxuLy8gc2Nyb2xsIChpZiBpdCBpcyBsYXJnZSBlbm91Z2gpLlxuaWYgKGllKSB7IHdoZWVsUGl4ZWxzUGVyVW5pdCA9IC0uNTM7IH1cbmVsc2UgaWYgKGdlY2tvKSB7IHdoZWVsUGl4ZWxzUGVyVW5pdCA9IDE1OyB9XG5lbHNlIGlmIChjaHJvbWUpIHsgd2hlZWxQaXhlbHNQZXJVbml0ID0gLS43OyB9XG5lbHNlIGlmIChzYWZhcmkpIHsgd2hlZWxQaXhlbHNQZXJVbml0ID0gLTEvMzsgfVxuXG5mdW5jdGlvbiB3aGVlbEV2ZW50RGVsdGEoZSkge1xuICB2YXIgZHggPSBlLndoZWVsRGVsdGFYLCBkeSA9IGUud2hlZWxEZWx0YVk7XG4gIGlmIChkeCA9PSBudWxsICYmIGUuZGV0YWlsICYmIGUuYXhpcyA9PSBlLkhPUklaT05UQUxfQVhJUykgeyBkeCA9IGUuZGV0YWlsOyB9XG4gIGlmIChkeSA9PSBudWxsICYmIGUuZGV0YWlsICYmIGUuYXhpcyA9PSBlLlZFUlRJQ0FMX0FYSVMpIHsgZHkgPSBlLmRldGFpbDsgfVxuICBlbHNlIGlmIChkeSA9PSBudWxsKSB7IGR5ID0gZS53aGVlbERlbHRhOyB9XG4gIHJldHVybiB7eDogZHgsIHk6IGR5fVxufVxuZnVuY3Rpb24gd2hlZWxFdmVudFBpeGVscyhlKSB7XG4gIHZhciBkZWx0YSA9IHdoZWVsRXZlbnREZWx0YShlKTtcbiAgZGVsdGEueCAqPSB3aGVlbFBpeGVsc1BlclVuaXQ7XG4gIGRlbHRhLnkgKj0gd2hlZWxQaXhlbHNQZXJVbml0O1xuICByZXR1cm4gZGVsdGFcbn1cblxuZnVuY3Rpb24gb25TY3JvbGxXaGVlbChjbSwgZSkge1xuICB2YXIgZGVsdGEgPSB3aGVlbEV2ZW50RGVsdGEoZSksIGR4ID0gZGVsdGEueCwgZHkgPSBkZWx0YS55O1xuXG4gIHZhciBkaXNwbGF5ID0gY20uZGlzcGxheSwgc2Nyb2xsID0gZGlzcGxheS5zY3JvbGxlcjtcbiAgLy8gUXVpdCBpZiB0aGVyZSdzIG5vdGhpbmcgdG8gc2Nyb2xsIGhlcmVcbiAgdmFyIGNhblNjcm9sbFggPSBzY3JvbGwuc2Nyb2xsV2lkdGggPiBzY3JvbGwuY2xpZW50V2lkdGg7XG4gIHZhciBjYW5TY3JvbGxZID0gc2Nyb2xsLnNjcm9sbEhlaWdodCA+IHNjcm9sbC5jbGllbnRIZWlnaHQ7XG4gIGlmICghKGR4ICYmIGNhblNjcm9sbFggfHwgZHkgJiYgY2FuU2Nyb2xsWSkpIHsgcmV0dXJuIH1cblxuICAvLyBXZWJraXQgYnJvd3NlcnMgb24gT1MgWCBhYm9ydCBtb21lbnR1bSBzY3JvbGxzIHdoZW4gdGhlIHRhcmdldFxuICAvLyBvZiB0aGUgc2Nyb2xsIGV2ZW50IGlzIHJlbW92ZWQgZnJvbSB0aGUgc2Nyb2xsYWJsZSBlbGVtZW50LlxuICAvLyBUaGlzIGhhY2sgKHNlZSByZWxhdGVkIGNvZGUgaW4gcGF0Y2hEaXNwbGF5KSBtYWtlcyBzdXJlIHRoZVxuICAvLyBlbGVtZW50IGlzIGtlcHQgYXJvdW5kLlxuICBpZiAoZHkgJiYgbWFjICYmIHdlYmtpdCkge1xuICAgIG91dGVyOiBmb3IgKHZhciBjdXIgPSBlLnRhcmdldCwgdmlldyA9IGRpc3BsYXkudmlldzsgY3VyICE9IHNjcm9sbDsgY3VyID0gY3VyLnBhcmVudE5vZGUpIHtcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdmlldy5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAodmlld1tpXS5ub2RlID09IGN1cikge1xuICAgICAgICAgIGNtLmRpc3BsYXkuY3VycmVudFdoZWVsVGFyZ2V0ID0gY3VyO1xuICAgICAgICAgIGJyZWFrIG91dGVyXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBPbiBzb21lIGJyb3dzZXJzLCBob3Jpem9udGFsIHNjcm9sbGluZyB3aWxsIGNhdXNlIHJlZHJhd3MgdG9cbiAgLy8gaGFwcGVuIGJlZm9yZSB0aGUgZ3V0dGVyIGhhcyBiZWVuIHJlYWxpZ25lZCwgY2F1c2luZyBpdCB0b1xuICAvLyB3cmlnZ2xlIGFyb3VuZCBpbiBhIG1vc3QgdW5zZWVtbHkgd2F5LiBXaGVuIHdlIGhhdmUgYW5cbiAgLy8gZXN0aW1hdGVkIHBpeGVscy9kZWx0YSB2YWx1ZSwgd2UganVzdCBoYW5kbGUgaG9yaXpvbnRhbFxuICAvLyBzY3JvbGxpbmcgZW50aXJlbHkgaGVyZS4gSXQnbGwgYmUgc2xpZ2h0bHkgb2ZmIGZyb20gbmF0aXZlLCBidXRcbiAgLy8gYmV0dGVyIHRoYW4gZ2xpdGNoaW5nIG91dC5cbiAgaWYgKGR4ICYmICFnZWNrbyAmJiAhcHJlc3RvICYmIHdoZWVsUGl4ZWxzUGVyVW5pdCAhPSBudWxsKSB7XG4gICAgaWYgKGR5ICYmIGNhblNjcm9sbFkpXG4gICAgICB7IHVwZGF0ZVNjcm9sbFRvcChjbSwgTWF0aC5tYXgoMCwgc2Nyb2xsLnNjcm9sbFRvcCArIGR5ICogd2hlZWxQaXhlbHNQZXJVbml0KSk7IH1cbiAgICBzZXRTY3JvbGxMZWZ0KGNtLCBNYXRoLm1heCgwLCBzY3JvbGwuc2Nyb2xsTGVmdCArIGR4ICogd2hlZWxQaXhlbHNQZXJVbml0KSk7XG4gICAgLy8gT25seSBwcmV2ZW50IGRlZmF1bHQgc2Nyb2xsaW5nIGlmIHZlcnRpY2FsIHNjcm9sbGluZyBpc1xuICAgIC8vIGFjdHVhbGx5IHBvc3NpYmxlLiBPdGhlcndpc2UsIGl0IGNhdXNlcyB2ZXJ0aWNhbCBzY3JvbGxcbiAgICAvLyBqaXR0ZXIgb24gT1NYIHRyYWNrcGFkcyB3aGVuIGRlbHRhWCBpcyBzbWFsbCBhbmQgZGVsdGFZXG4gICAgLy8gaXMgbGFyZ2UgKGlzc3VlICMzNTc5KVxuICAgIGlmICghZHkgfHwgKGR5ICYmIGNhblNjcm9sbFkpKVxuICAgICAgeyBlX3ByZXZlbnREZWZhdWx0KGUpOyB9XG4gICAgZGlzcGxheS53aGVlbFN0YXJ0WCA9IG51bGw7IC8vIEFib3J0IG1lYXN1cmVtZW50LCBpZiBpbiBwcm9ncmVzc1xuICAgIHJldHVyblxuICB9XG5cbiAgLy8gJ1Byb2plY3QnIHRoZSB2aXNpYmxlIHZpZXdwb3J0IHRvIGNvdmVyIHRoZSBhcmVhIHRoYXQgaXMgYmVpbmdcbiAgLy8gc2Nyb2xsZWQgaW50byB2aWV3IChpZiB3ZSBrbm93IGVub3VnaCB0byBlc3RpbWF0ZSBpdCkuXG4gIGlmIChkeSAmJiB3aGVlbFBpeGVsc1BlclVuaXQgIT0gbnVsbCkge1xuICAgIHZhciBwaXhlbHMgPSBkeSAqIHdoZWVsUGl4ZWxzUGVyVW5pdDtcbiAgICB2YXIgdG9wID0gY20uZG9jLnNjcm9sbFRvcCwgYm90ID0gdG9wICsgZGlzcGxheS53cmFwcGVyLmNsaWVudEhlaWdodDtcbiAgICBpZiAocGl4ZWxzIDwgMCkgeyB0b3AgPSBNYXRoLm1heCgwLCB0b3AgKyBwaXhlbHMgLSA1MCk7IH1cbiAgICBlbHNlIHsgYm90ID0gTWF0aC5taW4oY20uZG9jLmhlaWdodCwgYm90ICsgcGl4ZWxzICsgNTApOyB9XG4gICAgdXBkYXRlRGlzcGxheVNpbXBsZShjbSwge3RvcDogdG9wLCBib3R0b206IGJvdH0pO1xuICB9XG5cbiAgaWYgKHdoZWVsU2FtcGxlcyA8IDIwKSB7XG4gICAgaWYgKGRpc3BsYXkud2hlZWxTdGFydFggPT0gbnVsbCkge1xuICAgICAgZGlzcGxheS53aGVlbFN0YXJ0WCA9IHNjcm9sbC5zY3JvbGxMZWZ0OyBkaXNwbGF5LndoZWVsU3RhcnRZID0gc2Nyb2xsLnNjcm9sbFRvcDtcbiAgICAgIGRpc3BsYXkud2hlZWxEWCA9IGR4OyBkaXNwbGF5LndoZWVsRFkgPSBkeTtcbiAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAoZGlzcGxheS53aGVlbFN0YXJ0WCA9PSBudWxsKSB7IHJldHVybiB9XG4gICAgICAgIHZhciBtb3ZlZFggPSBzY3JvbGwuc2Nyb2xsTGVmdCAtIGRpc3BsYXkud2hlZWxTdGFydFg7XG4gICAgICAgIHZhciBtb3ZlZFkgPSBzY3JvbGwuc2Nyb2xsVG9wIC0gZGlzcGxheS53aGVlbFN0YXJ0WTtcbiAgICAgICAgdmFyIHNhbXBsZSA9IChtb3ZlZFkgJiYgZGlzcGxheS53aGVlbERZICYmIG1vdmVkWSAvIGRpc3BsYXkud2hlZWxEWSkgfHxcbiAgICAgICAgICAobW92ZWRYICYmIGRpc3BsYXkud2hlZWxEWCAmJiBtb3ZlZFggLyBkaXNwbGF5LndoZWVsRFgpO1xuICAgICAgICBkaXNwbGF5LndoZWVsU3RhcnRYID0gZGlzcGxheS53aGVlbFN0YXJ0WSA9IG51bGw7XG4gICAgICAgIGlmICghc2FtcGxlKSB7IHJldHVybiB9XG4gICAgICAgIHdoZWVsUGl4ZWxzUGVyVW5pdCA9ICh3aGVlbFBpeGVsc1BlclVuaXQgKiB3aGVlbFNhbXBsZXMgKyBzYW1wbGUpIC8gKHdoZWVsU2FtcGxlcyArIDEpO1xuICAgICAgICArK3doZWVsU2FtcGxlcztcbiAgICAgIH0sIDIwMCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGRpc3BsYXkud2hlZWxEWCArPSBkeDsgZGlzcGxheS53aGVlbERZICs9IGR5O1xuICAgIH1cbiAgfVxufVxuXG4vLyBTZWxlY3Rpb24gb2JqZWN0cyBhcmUgaW1tdXRhYmxlLiBBIG5ldyBvbmUgaXMgY3JlYXRlZCBldmVyeSB0aW1lXG4vLyB0aGUgc2VsZWN0aW9uIGNoYW5nZXMuIEEgc2VsZWN0aW9uIGlzIG9uZSBvciBtb3JlIG5vbi1vdmVybGFwcGluZ1xuLy8gKGFuZCBub24tdG91Y2hpbmcpIHJhbmdlcywgc29ydGVkLCBhbmQgYW4gaW50ZWdlciB0aGF0IGluZGljYXRlc1xuLy8gd2hpY2ggb25lIGlzIHRoZSBwcmltYXJ5IHNlbGVjdGlvbiAodGhlIG9uZSB0aGF0J3Mgc2Nyb2xsZWQgaW50b1xuLy8gdmlldywgdGhhdCBnZXRDdXJzb3IgcmV0dXJucywgZXRjKS5cbnZhciBTZWxlY3Rpb24gPSBmdW5jdGlvbihyYW5nZXMsIHByaW1JbmRleCkge1xuICB0aGlzLnJhbmdlcyA9IHJhbmdlcztcbiAgdGhpcy5wcmltSW5kZXggPSBwcmltSW5kZXg7XG59O1xuXG5TZWxlY3Rpb24ucHJvdG90eXBlLnByaW1hcnkgPSBmdW5jdGlvbiAoKSB7IHJldHVybiB0aGlzLnJhbmdlc1t0aGlzLnByaW1JbmRleF0gfTtcblxuU2VsZWN0aW9uLnByb3RvdHlwZS5lcXVhbHMgPSBmdW5jdGlvbiAob3RoZXIpIHtcbiAgICB2YXIgdGhpcyQxID0gdGhpcztcblxuICBpZiAob3RoZXIgPT0gdGhpcykgeyByZXR1cm4gdHJ1ZSB9XG4gIGlmIChvdGhlci5wcmltSW5kZXggIT0gdGhpcy5wcmltSW5kZXggfHwgb3RoZXIucmFuZ2VzLmxlbmd0aCAhPSB0aGlzLnJhbmdlcy5sZW5ndGgpIHsgcmV0dXJuIGZhbHNlIH1cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLnJhbmdlcy5sZW5ndGg7IGkrKykge1xuICAgIHZhciBoZXJlID0gdGhpcyQxLnJhbmdlc1tpXSwgdGhlcmUgPSBvdGhlci5yYW5nZXNbaV07XG4gICAgaWYgKCFlcXVhbEN1cnNvclBvcyhoZXJlLmFuY2hvciwgdGhlcmUuYW5jaG9yKSB8fCAhZXF1YWxDdXJzb3JQb3MoaGVyZS5oZWFkLCB0aGVyZS5oZWFkKSkgeyByZXR1cm4gZmFsc2UgfVxuICB9XG4gIHJldHVybiB0cnVlXG59O1xuXG5TZWxlY3Rpb24ucHJvdG90eXBlLmRlZXBDb3B5ID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciB0aGlzJDEgPSB0aGlzO1xuXG4gIHZhciBvdXQgPSBbXTtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLnJhbmdlcy5sZW5ndGg7IGkrKylcbiAgICB7IG91dFtpXSA9IG5ldyBSYW5nZShjb3B5UG9zKHRoaXMkMS5yYW5nZXNbaV0uYW5jaG9yKSwgY29weVBvcyh0aGlzJDEucmFuZ2VzW2ldLmhlYWQpKTsgfVxuICByZXR1cm4gbmV3IFNlbGVjdGlvbihvdXQsIHRoaXMucHJpbUluZGV4KVxufTtcblxuU2VsZWN0aW9uLnByb3RvdHlwZS5zb21ldGhpbmdTZWxlY3RlZCA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgdGhpcyQxID0gdGhpcztcblxuICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMucmFuZ2VzLmxlbmd0aDsgaSsrKVxuICAgIHsgaWYgKCF0aGlzJDEucmFuZ2VzW2ldLmVtcHR5KCkpIHsgcmV0dXJuIHRydWUgfSB9XG4gIHJldHVybiBmYWxzZVxufTtcblxuU2VsZWN0aW9uLnByb3RvdHlwZS5jb250YWlucyA9IGZ1bmN0aW9uIChwb3MsIGVuZCkge1xuICAgIHZhciB0aGlzJDEgPSB0aGlzO1xuXG4gIGlmICghZW5kKSB7IGVuZCA9IHBvczsgfVxuICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMucmFuZ2VzLmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIHJhbmdlID0gdGhpcyQxLnJhbmdlc1tpXTtcbiAgICBpZiAoY21wKGVuZCwgcmFuZ2UuZnJvbSgpKSA+PSAwICYmIGNtcChwb3MsIHJhbmdlLnRvKCkpIDw9IDApXG4gICAgICB7IHJldHVybiBpIH1cbiAgfVxuICByZXR1cm4gLTFcbn07XG5cbnZhciBSYW5nZSA9IGZ1bmN0aW9uKGFuY2hvciwgaGVhZCkge1xuICB0aGlzLmFuY2hvciA9IGFuY2hvcjsgdGhpcy5oZWFkID0gaGVhZDtcbn07XG5cblJhbmdlLnByb3RvdHlwZS5mcm9tID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gbWluUG9zKHRoaXMuYW5jaG9yLCB0aGlzLmhlYWQpIH07XG5SYW5nZS5wcm90b3R5cGUudG8gPSBmdW5jdGlvbiAoKSB7IHJldHVybiBtYXhQb3ModGhpcy5hbmNob3IsIHRoaXMuaGVhZCkgfTtcblJhbmdlLnByb3RvdHlwZS5lbXB0eSA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuIHRoaXMuaGVhZC5saW5lID09IHRoaXMuYW5jaG9yLmxpbmUgJiYgdGhpcy5oZWFkLmNoID09IHRoaXMuYW5jaG9yLmNoIH07XG5cbi8vIFRha2UgYW4gdW5zb3J0ZWQsIHBvdGVudGlhbGx5IG92ZXJsYXBwaW5nIHNldCBvZiByYW5nZXMsIGFuZFxuLy8gYnVpbGQgYSBzZWxlY3Rpb24gb3V0IG9mIGl0LiAnQ29uc3VtZXMnIHJhbmdlcyBhcnJheSAobW9kaWZ5aW5nXG4vLyBpdCkuXG5mdW5jdGlvbiBub3JtYWxpemVTZWxlY3Rpb24ocmFuZ2VzLCBwcmltSW5kZXgpIHtcbiAgdmFyIHByaW0gPSByYW5nZXNbcHJpbUluZGV4XTtcbiAgcmFuZ2VzLnNvcnQoZnVuY3Rpb24gKGEsIGIpIHsgcmV0dXJuIGNtcChhLmZyb20oKSwgYi5mcm9tKCkpOyB9KTtcbiAgcHJpbUluZGV4ID0gaW5kZXhPZihyYW5nZXMsIHByaW0pO1xuICBmb3IgKHZhciBpID0gMTsgaSA8IHJhbmdlcy5sZW5ndGg7IGkrKykge1xuICAgIHZhciBjdXIgPSByYW5nZXNbaV0sIHByZXYgPSByYW5nZXNbaSAtIDFdO1xuICAgIGlmIChjbXAocHJldi50bygpLCBjdXIuZnJvbSgpKSA+PSAwKSB7XG4gICAgICB2YXIgZnJvbSA9IG1pblBvcyhwcmV2LmZyb20oKSwgY3VyLmZyb20oKSksIHRvID0gbWF4UG9zKHByZXYudG8oKSwgY3VyLnRvKCkpO1xuICAgICAgdmFyIGludiA9IHByZXYuZW1wdHkoKSA/IGN1ci5mcm9tKCkgPT0gY3VyLmhlYWQgOiBwcmV2LmZyb20oKSA9PSBwcmV2LmhlYWQ7XG4gICAgICBpZiAoaSA8PSBwcmltSW5kZXgpIHsgLS1wcmltSW5kZXg7IH1cbiAgICAgIHJhbmdlcy5zcGxpY2UoLS1pLCAyLCBuZXcgUmFuZ2UoaW52ID8gdG8gOiBmcm9tLCBpbnYgPyBmcm9tIDogdG8pKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIG5ldyBTZWxlY3Rpb24ocmFuZ2VzLCBwcmltSW5kZXgpXG59XG5cbmZ1bmN0aW9uIHNpbXBsZVNlbGVjdGlvbihhbmNob3IsIGhlYWQpIHtcbiAgcmV0dXJuIG5ldyBTZWxlY3Rpb24oW25ldyBSYW5nZShhbmNob3IsIGhlYWQgfHwgYW5jaG9yKV0sIDApXG59XG5cbi8vIENvbXB1dGUgdGhlIHBvc2l0aW9uIG9mIHRoZSBlbmQgb2YgYSBjaGFuZ2UgKGl0cyAndG8nIHByb3BlcnR5XG4vLyByZWZlcnMgdG8gdGhlIHByZS1jaGFuZ2UgZW5kKS5cbmZ1bmN0aW9uIGNoYW5nZUVuZChjaGFuZ2UpIHtcbiAgaWYgKCFjaGFuZ2UudGV4dCkgeyByZXR1cm4gY2hhbmdlLnRvIH1cbiAgcmV0dXJuIFBvcyhjaGFuZ2UuZnJvbS5saW5lICsgY2hhbmdlLnRleHQubGVuZ3RoIC0gMSxcbiAgICAgICAgICAgICBsc3QoY2hhbmdlLnRleHQpLmxlbmd0aCArIChjaGFuZ2UudGV4dC5sZW5ndGggPT0gMSA/IGNoYW5nZS5mcm9tLmNoIDogMCkpXG59XG5cbi8vIEFkanVzdCBhIHBvc2l0aW9uIHRvIHJlZmVyIHRvIHRoZSBwb3N0LWNoYW5nZSBwb3NpdGlvbiBvZiB0aGVcbi8vIHNhbWUgdGV4dCwgb3IgdGhlIGVuZCBvZiB0aGUgY2hhbmdlIGlmIHRoZSBjaGFuZ2UgY292ZXJzIGl0LlxuZnVuY3Rpb24gYWRqdXN0Rm9yQ2hhbmdlKHBvcywgY2hhbmdlKSB7XG4gIGlmIChjbXAocG9zLCBjaGFuZ2UuZnJvbSkgPCAwKSB7IHJldHVybiBwb3MgfVxuICBpZiAoY21wKHBvcywgY2hhbmdlLnRvKSA8PSAwKSB7IHJldHVybiBjaGFuZ2VFbmQoY2hhbmdlKSB9XG5cbiAgdmFyIGxpbmUgPSBwb3MubGluZSArIGNoYW5nZS50ZXh0Lmxlbmd0aCAtIChjaGFuZ2UudG8ubGluZSAtIGNoYW5nZS5mcm9tLmxpbmUpIC0gMSwgY2ggPSBwb3MuY2g7XG4gIGlmIChwb3MubGluZSA9PSBjaGFuZ2UudG8ubGluZSkgeyBjaCArPSBjaGFuZ2VFbmQoY2hhbmdlKS5jaCAtIGNoYW5nZS50by5jaDsgfVxuICByZXR1cm4gUG9zKGxpbmUsIGNoKVxufVxuXG5mdW5jdGlvbiBjb21wdXRlU2VsQWZ0ZXJDaGFuZ2UoZG9jLCBjaGFuZ2UpIHtcbiAgdmFyIG91dCA9IFtdO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGRvYy5zZWwucmFuZ2VzLmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIHJhbmdlID0gZG9jLnNlbC5yYW5nZXNbaV07XG4gICAgb3V0LnB1c2gobmV3IFJhbmdlKGFkanVzdEZvckNoYW5nZShyYW5nZS5hbmNob3IsIGNoYW5nZSksXG4gICAgICAgICAgICAgICAgICAgICAgIGFkanVzdEZvckNoYW5nZShyYW5nZS5oZWFkLCBjaGFuZ2UpKSk7XG4gIH1cbiAgcmV0dXJuIG5vcm1hbGl6ZVNlbGVjdGlvbihvdXQsIGRvYy5zZWwucHJpbUluZGV4KVxufVxuXG5mdW5jdGlvbiBvZmZzZXRQb3MocG9zLCBvbGQsIG53KSB7XG4gIGlmIChwb3MubGluZSA9PSBvbGQubGluZSlcbiAgICB7IHJldHVybiBQb3MobncubGluZSwgcG9zLmNoIC0gb2xkLmNoICsgbncuY2gpIH1cbiAgZWxzZVxuICAgIHsgcmV0dXJuIFBvcyhudy5saW5lICsgKHBvcy5saW5lIC0gb2xkLmxpbmUpLCBwb3MuY2gpIH1cbn1cblxuLy8gVXNlZCBieSByZXBsYWNlU2VsZWN0aW9ucyB0byBhbGxvdyBtb3ZpbmcgdGhlIHNlbGVjdGlvbiB0byB0aGVcbi8vIHN0YXJ0IG9yIGFyb3VuZCB0aGUgcmVwbGFjZWQgdGVzdC4gSGludCBtYXkgYmUgXCJzdGFydFwiIG9yIFwiYXJvdW5kXCIuXG5mdW5jdGlvbiBjb21wdXRlUmVwbGFjZWRTZWwoZG9jLCBjaGFuZ2VzLCBoaW50KSB7XG4gIHZhciBvdXQgPSBbXTtcbiAgdmFyIG9sZFByZXYgPSBQb3MoZG9jLmZpcnN0LCAwKSwgbmV3UHJldiA9IG9sZFByZXY7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgY2hhbmdlcy5sZW5ndGg7IGkrKykge1xuICAgIHZhciBjaGFuZ2UgPSBjaGFuZ2VzW2ldO1xuICAgIHZhciBmcm9tID0gb2Zmc2V0UG9zKGNoYW5nZS5mcm9tLCBvbGRQcmV2LCBuZXdQcmV2KTtcbiAgICB2YXIgdG8gPSBvZmZzZXRQb3MoY2hhbmdlRW5kKGNoYW5nZSksIG9sZFByZXYsIG5ld1ByZXYpO1xuICAgIG9sZFByZXYgPSBjaGFuZ2UudG87XG4gICAgbmV3UHJldiA9IHRvO1xuICAgIGlmIChoaW50ID09IFwiYXJvdW5kXCIpIHtcbiAgICAgIHZhciByYW5nZSA9IGRvYy5zZWwucmFuZ2VzW2ldLCBpbnYgPSBjbXAocmFuZ2UuaGVhZCwgcmFuZ2UuYW5jaG9yKSA8IDA7XG4gICAgICBvdXRbaV0gPSBuZXcgUmFuZ2UoaW52ID8gdG8gOiBmcm9tLCBpbnYgPyBmcm9tIDogdG8pO1xuICAgIH0gZWxzZSB7XG4gICAgICBvdXRbaV0gPSBuZXcgUmFuZ2UoZnJvbSwgZnJvbSk7XG4gICAgfVxuICB9XG4gIHJldHVybiBuZXcgU2VsZWN0aW9uKG91dCwgZG9jLnNlbC5wcmltSW5kZXgpXG59XG5cbi8vIFVzZWQgdG8gZ2V0IHRoZSBlZGl0b3IgaW50byBhIGNvbnNpc3RlbnQgc3RhdGUgYWdhaW4gd2hlbiBvcHRpb25zIGNoYW5nZS5cblxuZnVuY3Rpb24gbG9hZE1vZGUoY20pIHtcbiAgY20uZG9jLm1vZGUgPSBnZXRNb2RlKGNtLm9wdGlvbnMsIGNtLmRvYy5tb2RlT3B0aW9uKTtcbiAgcmVzZXRNb2RlU3RhdGUoY20pO1xufVxuXG5mdW5jdGlvbiByZXNldE1vZGVTdGF0ZShjbSkge1xuICBjbS5kb2MuaXRlcihmdW5jdGlvbiAobGluZSkge1xuICAgIGlmIChsaW5lLnN0YXRlQWZ0ZXIpIHsgbGluZS5zdGF0ZUFmdGVyID0gbnVsbDsgfVxuICAgIGlmIChsaW5lLnN0eWxlcykgeyBsaW5lLnN0eWxlcyA9IG51bGw7IH1cbiAgfSk7XG4gIGNtLmRvYy5tb2RlRnJvbnRpZXIgPSBjbS5kb2MuaGlnaGxpZ2h0RnJvbnRpZXIgPSBjbS5kb2MuZmlyc3Q7XG4gIHN0YXJ0V29ya2VyKGNtLCAxMDApO1xuICBjbS5zdGF0ZS5tb2RlR2VuKys7XG4gIGlmIChjbS5jdXJPcCkgeyByZWdDaGFuZ2UoY20pOyB9XG59XG5cbi8vIERPQ1VNRU5UIERBVEEgU1RSVUNUVVJFXG5cbi8vIEJ5IGRlZmF1bHQsIHVwZGF0ZXMgdGhhdCBzdGFydCBhbmQgZW5kIGF0IHRoZSBiZWdpbm5pbmcgb2YgYSBsaW5lXG4vLyBhcmUgdHJlYXRlZCBzcGVjaWFsbHksIGluIG9yZGVyIHRvIG1ha2UgdGhlIGFzc29jaWF0aW9uIG9mIGxpbmVcbi8vIHdpZGdldHMgYW5kIG1hcmtlciBlbGVtZW50cyB3aXRoIHRoZSB0ZXh0IGJlaGF2ZSBtb3JlIGludHVpdGl2ZS5cbmZ1bmN0aW9uIGlzV2hvbGVMaW5lVXBkYXRlKGRvYywgY2hhbmdlKSB7XG4gIHJldHVybiBjaGFuZ2UuZnJvbS5jaCA9PSAwICYmIGNoYW5nZS50by5jaCA9PSAwICYmIGxzdChjaGFuZ2UudGV4dCkgPT0gXCJcIiAmJlxuICAgICghZG9jLmNtIHx8IGRvYy5jbS5vcHRpb25zLndob2xlTGluZVVwZGF0ZUJlZm9yZSlcbn1cblxuLy8gUGVyZm9ybSBhIGNoYW5nZSBvbiB0aGUgZG9jdW1lbnQgZGF0YSBzdHJ1Y3R1cmUuXG5mdW5jdGlvbiB1cGRhdGVEb2MoZG9jLCBjaGFuZ2UsIG1hcmtlZFNwYW5zLCBlc3RpbWF0ZUhlaWdodCQkMSkge1xuICBmdW5jdGlvbiBzcGFuc0ZvcihuKSB7cmV0dXJuIG1hcmtlZFNwYW5zID8gbWFya2VkU3BhbnNbbl0gOiBudWxsfVxuICBmdW5jdGlvbiB1cGRhdGUobGluZSwgdGV4dCwgc3BhbnMpIHtcbiAgICB1cGRhdGVMaW5lKGxpbmUsIHRleHQsIHNwYW5zLCBlc3RpbWF0ZUhlaWdodCQkMSk7XG4gICAgc2lnbmFsTGF0ZXIobGluZSwgXCJjaGFuZ2VcIiwgbGluZSwgY2hhbmdlKTtcbiAgfVxuICBmdW5jdGlvbiBsaW5lc0ZvcihzdGFydCwgZW5kKSB7XG4gICAgdmFyIHJlc3VsdCA9IFtdO1xuICAgIGZvciAodmFyIGkgPSBzdGFydDsgaSA8IGVuZDsgKytpKVxuICAgICAgeyByZXN1bHQucHVzaChuZXcgTGluZSh0ZXh0W2ldLCBzcGFuc0ZvcihpKSwgZXN0aW1hdGVIZWlnaHQkJDEpKTsgfVxuICAgIHJldHVybiByZXN1bHRcbiAgfVxuXG4gIHZhciBmcm9tID0gY2hhbmdlLmZyb20sIHRvID0gY2hhbmdlLnRvLCB0ZXh0ID0gY2hhbmdlLnRleHQ7XG4gIHZhciBmaXJzdExpbmUgPSBnZXRMaW5lKGRvYywgZnJvbS5saW5lKSwgbGFzdExpbmUgPSBnZXRMaW5lKGRvYywgdG8ubGluZSk7XG4gIHZhciBsYXN0VGV4dCA9IGxzdCh0ZXh0KSwgbGFzdFNwYW5zID0gc3BhbnNGb3IodGV4dC5sZW5ndGggLSAxKSwgbmxpbmVzID0gdG8ubGluZSAtIGZyb20ubGluZTtcblxuICAvLyBBZGp1c3QgdGhlIGxpbmUgc3RydWN0dXJlXG4gIGlmIChjaGFuZ2UuZnVsbCkge1xuICAgIGRvYy5pbnNlcnQoMCwgbGluZXNGb3IoMCwgdGV4dC5sZW5ndGgpKTtcbiAgICBkb2MucmVtb3ZlKHRleHQubGVuZ3RoLCBkb2Muc2l6ZSAtIHRleHQubGVuZ3RoKTtcbiAgfSBlbHNlIGlmIChpc1dob2xlTGluZVVwZGF0ZShkb2MsIGNoYW5nZSkpIHtcbiAgICAvLyBUaGlzIGlzIGEgd2hvbGUtbGluZSByZXBsYWNlLiBUcmVhdGVkIHNwZWNpYWxseSB0byBtYWtlXG4gICAgLy8gc3VyZSBsaW5lIG9iamVjdHMgbW92ZSB0aGUgd2F5IHRoZXkgYXJlIHN1cHBvc2VkIHRvLlxuICAgIHZhciBhZGRlZCA9IGxpbmVzRm9yKDAsIHRleHQubGVuZ3RoIC0gMSk7XG4gICAgdXBkYXRlKGxhc3RMaW5lLCBsYXN0TGluZS50ZXh0LCBsYXN0U3BhbnMpO1xuICAgIGlmIChubGluZXMpIHsgZG9jLnJlbW92ZShmcm9tLmxpbmUsIG5saW5lcyk7IH1cbiAgICBpZiAoYWRkZWQubGVuZ3RoKSB7IGRvYy5pbnNlcnQoZnJvbS5saW5lLCBhZGRlZCk7IH1cbiAgfSBlbHNlIGlmIChmaXJzdExpbmUgPT0gbGFzdExpbmUpIHtcbiAgICBpZiAodGV4dC5sZW5ndGggPT0gMSkge1xuICAgICAgdXBkYXRlKGZpcnN0TGluZSwgZmlyc3RMaW5lLnRleHQuc2xpY2UoMCwgZnJvbS5jaCkgKyBsYXN0VGV4dCArIGZpcnN0TGluZS50ZXh0LnNsaWNlKHRvLmNoKSwgbGFzdFNwYW5zKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIGFkZGVkJDEgPSBsaW5lc0ZvcigxLCB0ZXh0Lmxlbmd0aCAtIDEpO1xuICAgICAgYWRkZWQkMS5wdXNoKG5ldyBMaW5lKGxhc3RUZXh0ICsgZmlyc3RMaW5lLnRleHQuc2xpY2UodG8uY2gpLCBsYXN0U3BhbnMsIGVzdGltYXRlSGVpZ2h0JCQxKSk7XG4gICAgICB1cGRhdGUoZmlyc3RMaW5lLCBmaXJzdExpbmUudGV4dC5zbGljZSgwLCBmcm9tLmNoKSArIHRleHRbMF0sIHNwYW5zRm9yKDApKTtcbiAgICAgIGRvYy5pbnNlcnQoZnJvbS5saW5lICsgMSwgYWRkZWQkMSk7XG4gICAgfVxuICB9IGVsc2UgaWYgKHRleHQubGVuZ3RoID09IDEpIHtcbiAgICB1cGRhdGUoZmlyc3RMaW5lLCBmaXJzdExpbmUudGV4dC5zbGljZSgwLCBmcm9tLmNoKSArIHRleHRbMF0gKyBsYXN0TGluZS50ZXh0LnNsaWNlKHRvLmNoKSwgc3BhbnNGb3IoMCkpO1xuICAgIGRvYy5yZW1vdmUoZnJvbS5saW5lICsgMSwgbmxpbmVzKTtcbiAgfSBlbHNlIHtcbiAgICB1cGRhdGUoZmlyc3RMaW5lLCBmaXJzdExpbmUudGV4dC5zbGljZSgwLCBmcm9tLmNoKSArIHRleHRbMF0sIHNwYW5zRm9yKDApKTtcbiAgICB1cGRhdGUobGFzdExpbmUsIGxhc3RUZXh0ICsgbGFzdExpbmUudGV4dC5zbGljZSh0by5jaCksIGxhc3RTcGFucyk7XG4gICAgdmFyIGFkZGVkJDIgPSBsaW5lc0ZvcigxLCB0ZXh0Lmxlbmd0aCAtIDEpO1xuICAgIGlmIChubGluZXMgPiAxKSB7IGRvYy5yZW1vdmUoZnJvbS5saW5lICsgMSwgbmxpbmVzIC0gMSk7IH1cbiAgICBkb2MuaW5zZXJ0KGZyb20ubGluZSArIDEsIGFkZGVkJDIpO1xuICB9XG5cbiAgc2lnbmFsTGF0ZXIoZG9jLCBcImNoYW5nZVwiLCBkb2MsIGNoYW5nZSk7XG59XG5cbi8vIENhbGwgZiBmb3IgYWxsIGxpbmtlZCBkb2N1bWVudHMuXG5mdW5jdGlvbiBsaW5rZWREb2NzKGRvYywgZiwgc2hhcmVkSGlzdE9ubHkpIHtcbiAgZnVuY3Rpb24gcHJvcGFnYXRlKGRvYywgc2tpcCwgc2hhcmVkSGlzdCkge1xuICAgIGlmIChkb2MubGlua2VkKSB7IGZvciAodmFyIGkgPSAwOyBpIDwgZG9jLmxpbmtlZC5sZW5ndGg7ICsraSkge1xuICAgICAgdmFyIHJlbCA9IGRvYy5saW5rZWRbaV07XG4gICAgICBpZiAocmVsLmRvYyA9PSBza2lwKSB7IGNvbnRpbnVlIH1cbiAgICAgIHZhciBzaGFyZWQgPSBzaGFyZWRIaXN0ICYmIHJlbC5zaGFyZWRIaXN0O1xuICAgICAgaWYgKHNoYXJlZEhpc3RPbmx5ICYmICFzaGFyZWQpIHsgY29udGludWUgfVxuICAgICAgZihyZWwuZG9jLCBzaGFyZWQpO1xuICAgICAgcHJvcGFnYXRlKHJlbC5kb2MsIGRvYywgc2hhcmVkKTtcbiAgICB9IH1cbiAgfVxuICBwcm9wYWdhdGUoZG9jLCBudWxsLCB0cnVlKTtcbn1cblxuLy8gQXR0YWNoIGEgZG9jdW1lbnQgdG8gYW4gZWRpdG9yLlxuZnVuY3Rpb24gYXR0YWNoRG9jKGNtLCBkb2MpIHtcbiAgaWYgKGRvYy5jbSkgeyB0aHJvdyBuZXcgRXJyb3IoXCJUaGlzIGRvY3VtZW50IGlzIGFscmVhZHkgaW4gdXNlLlwiKSB9XG4gIGNtLmRvYyA9IGRvYztcbiAgZG9jLmNtID0gY207XG4gIGVzdGltYXRlTGluZUhlaWdodHMoY20pO1xuICBsb2FkTW9kZShjbSk7XG4gIHNldERpcmVjdGlvbkNsYXNzKGNtKTtcbiAgaWYgKCFjbS5vcHRpb25zLmxpbmVXcmFwcGluZykgeyBmaW5kTWF4TGluZShjbSk7IH1cbiAgY20ub3B0aW9ucy5tb2RlID0gZG9jLm1vZGVPcHRpb247XG4gIHJlZ0NoYW5nZShjbSk7XG59XG5cbmZ1bmN0aW9uIHNldERpcmVjdGlvbkNsYXNzKGNtKSB7XG4gIChjbS5kb2MuZGlyZWN0aW9uID09IFwicnRsXCIgPyBhZGRDbGFzcyA6IHJtQ2xhc3MpKGNtLmRpc3BsYXkubGluZURpdiwgXCJDb2RlTWlycm9yLXJ0bFwiKTtcbn1cblxuZnVuY3Rpb24gZGlyZWN0aW9uQ2hhbmdlZChjbSkge1xuICBydW5Jbk9wKGNtLCBmdW5jdGlvbiAoKSB7XG4gICAgc2V0RGlyZWN0aW9uQ2xhc3MoY20pO1xuICAgIHJlZ0NoYW5nZShjbSk7XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBIaXN0b3J5KHN0YXJ0R2VuKSB7XG4gIC8vIEFycmF5cyBvZiBjaGFuZ2UgZXZlbnRzIGFuZCBzZWxlY3Rpb25zLiBEb2luZyBzb21ldGhpbmcgYWRkcyBhblxuICAvLyBldmVudCB0byBkb25lIGFuZCBjbGVhcnMgdW5kby4gVW5kb2luZyBtb3ZlcyBldmVudHMgZnJvbSBkb25lXG4gIC8vIHRvIHVuZG9uZSwgcmVkb2luZyBtb3ZlcyB0aGVtIGluIHRoZSBvdGhlciBkaXJlY3Rpb24uXG4gIHRoaXMuZG9uZSA9IFtdOyB0aGlzLnVuZG9uZSA9IFtdO1xuICB0aGlzLnVuZG9EZXB0aCA9IEluZmluaXR5O1xuICAvLyBVc2VkIHRvIHRyYWNrIHdoZW4gY2hhbmdlcyBjYW4gYmUgbWVyZ2VkIGludG8gYSBzaW5nbGUgdW5kb1xuICAvLyBldmVudFxuICB0aGlzLmxhc3RNb2RUaW1lID0gdGhpcy5sYXN0U2VsVGltZSA9IDA7XG4gIHRoaXMubGFzdE9wID0gdGhpcy5sYXN0U2VsT3AgPSBudWxsO1xuICB0aGlzLmxhc3RPcmlnaW4gPSB0aGlzLmxhc3RTZWxPcmlnaW4gPSBudWxsO1xuICAvLyBVc2VkIGJ5IHRoZSBpc0NsZWFuKCkgbWV0aG9kXG4gIHRoaXMuZ2VuZXJhdGlvbiA9IHRoaXMubWF4R2VuZXJhdGlvbiA9IHN0YXJ0R2VuIHx8IDE7XG59XG5cbi8vIENyZWF0ZSBhIGhpc3RvcnkgY2hhbmdlIGV2ZW50IGZyb20gYW4gdXBkYXRlRG9jLXN0eWxlIGNoYW5nZVxuLy8gb2JqZWN0LlxuZnVuY3Rpb24gaGlzdG9yeUNoYW5nZUZyb21DaGFuZ2UoZG9jLCBjaGFuZ2UpIHtcbiAgdmFyIGhpc3RDaGFuZ2UgPSB7ZnJvbTogY29weVBvcyhjaGFuZ2UuZnJvbSksIHRvOiBjaGFuZ2VFbmQoY2hhbmdlKSwgdGV4dDogZ2V0QmV0d2Vlbihkb2MsIGNoYW5nZS5mcm9tLCBjaGFuZ2UudG8pfTtcbiAgYXR0YWNoTG9jYWxTcGFucyhkb2MsIGhpc3RDaGFuZ2UsIGNoYW5nZS5mcm9tLmxpbmUsIGNoYW5nZS50by5saW5lICsgMSk7XG4gIGxpbmtlZERvY3MoZG9jLCBmdW5jdGlvbiAoZG9jKSB7IHJldHVybiBhdHRhY2hMb2NhbFNwYW5zKGRvYywgaGlzdENoYW5nZSwgY2hhbmdlLmZyb20ubGluZSwgY2hhbmdlLnRvLmxpbmUgKyAxKTsgfSwgdHJ1ZSk7XG4gIHJldHVybiBoaXN0Q2hhbmdlXG59XG5cbi8vIFBvcCBhbGwgc2VsZWN0aW9uIGV2ZW50cyBvZmYgdGhlIGVuZCBvZiBhIGhpc3RvcnkgYXJyYXkuIFN0b3AgYXRcbi8vIGEgY2hhbmdlIGV2ZW50LlxuZnVuY3Rpb24gY2xlYXJTZWxlY3Rpb25FdmVudHMoYXJyYXkpIHtcbiAgd2hpbGUgKGFycmF5Lmxlbmd0aCkge1xuICAgIHZhciBsYXN0ID0gbHN0KGFycmF5KTtcbiAgICBpZiAobGFzdC5yYW5nZXMpIHsgYXJyYXkucG9wKCk7IH1cbiAgICBlbHNlIHsgYnJlYWsgfVxuICB9XG59XG5cbi8vIEZpbmQgdGhlIHRvcCBjaGFuZ2UgZXZlbnQgaW4gdGhlIGhpc3RvcnkuIFBvcCBvZmYgc2VsZWN0aW9uXG4vLyBldmVudHMgdGhhdCBhcmUgaW4gdGhlIHdheS5cbmZ1bmN0aW9uIGxhc3RDaGFuZ2VFdmVudChoaXN0LCBmb3JjZSkge1xuICBpZiAoZm9yY2UpIHtcbiAgICBjbGVhclNlbGVjdGlvbkV2ZW50cyhoaXN0LmRvbmUpO1xuICAgIHJldHVybiBsc3QoaGlzdC5kb25lKVxuICB9IGVsc2UgaWYgKGhpc3QuZG9uZS5sZW5ndGggJiYgIWxzdChoaXN0LmRvbmUpLnJhbmdlcykge1xuICAgIHJldHVybiBsc3QoaGlzdC5kb25lKVxuICB9IGVsc2UgaWYgKGhpc3QuZG9uZS5sZW5ndGggPiAxICYmICFoaXN0LmRvbmVbaGlzdC5kb25lLmxlbmd0aCAtIDJdLnJhbmdlcykge1xuICAgIGhpc3QuZG9uZS5wb3AoKTtcbiAgICByZXR1cm4gbHN0KGhpc3QuZG9uZSlcbiAgfVxufVxuXG4vLyBSZWdpc3RlciBhIGNoYW5nZSBpbiB0aGUgaGlzdG9yeS4gTWVyZ2VzIGNoYW5nZXMgdGhhdCBhcmUgd2l0aGluXG4vLyBhIHNpbmdsZSBvcGVyYXRpb24sIG9yIGFyZSBjbG9zZSB0b2dldGhlciB3aXRoIGFuIG9yaWdpbiB0aGF0XG4vLyBhbGxvd3MgbWVyZ2luZyAoc3RhcnRpbmcgd2l0aCBcIitcIikgaW50byBhIHNpbmdsZSBldmVudC5cbmZ1bmN0aW9uIGFkZENoYW5nZVRvSGlzdG9yeShkb2MsIGNoYW5nZSwgc2VsQWZ0ZXIsIG9wSWQpIHtcbiAgdmFyIGhpc3QgPSBkb2MuaGlzdG9yeTtcbiAgaGlzdC51bmRvbmUubGVuZ3RoID0gMDtcbiAgdmFyIHRpbWUgPSArbmV3IERhdGUsIGN1cjtcbiAgdmFyIGxhc3Q7XG5cbiAgaWYgKChoaXN0Lmxhc3RPcCA9PSBvcElkIHx8XG4gICAgICAgaGlzdC5sYXN0T3JpZ2luID09IGNoYW5nZS5vcmlnaW4gJiYgY2hhbmdlLm9yaWdpbiAmJlxuICAgICAgICgoY2hhbmdlLm9yaWdpbi5jaGFyQXQoMCkgPT0gXCIrXCIgJiYgaGlzdC5sYXN0TW9kVGltZSA+IHRpbWUgLSAoZG9jLmNtID8gZG9jLmNtLm9wdGlvbnMuaGlzdG9yeUV2ZW50RGVsYXkgOiA1MDApKSB8fFxuICAgICAgICBjaGFuZ2Uub3JpZ2luLmNoYXJBdCgwKSA9PSBcIipcIikpICYmXG4gICAgICAoY3VyID0gbGFzdENoYW5nZUV2ZW50KGhpc3QsIGhpc3QubGFzdE9wID09IG9wSWQpKSkge1xuICAgIC8vIE1lcmdlIHRoaXMgY2hhbmdlIGludG8gdGhlIGxhc3QgZXZlbnRcbiAgICBsYXN0ID0gbHN0KGN1ci5jaGFuZ2VzKTtcbiAgICBpZiAoY21wKGNoYW5nZS5mcm9tLCBjaGFuZ2UudG8pID09IDAgJiYgY21wKGNoYW5nZS5mcm9tLCBsYXN0LnRvKSA9PSAwKSB7XG4gICAgICAvLyBPcHRpbWl6ZWQgY2FzZSBmb3Igc2ltcGxlIGluc2VydGlvbiAtLSBkb24ndCB3YW50IHRvIGFkZFxuICAgICAgLy8gbmV3IGNoYW5nZXNldHMgZm9yIGV2ZXJ5IGNoYXJhY3RlciB0eXBlZFxuICAgICAgbGFzdC50byA9IGNoYW5nZUVuZChjaGFuZ2UpO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBBZGQgbmV3IHN1Yi1ldmVudFxuICAgICAgY3VyLmNoYW5nZXMucHVzaChoaXN0b3J5Q2hhbmdlRnJvbUNoYW5nZShkb2MsIGNoYW5nZSkpO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICAvLyBDYW4gbm90IGJlIG1lcmdlZCwgc3RhcnQgYSBuZXcgZXZlbnQuXG4gICAgdmFyIGJlZm9yZSA9IGxzdChoaXN0LmRvbmUpO1xuICAgIGlmICghYmVmb3JlIHx8ICFiZWZvcmUucmFuZ2VzKVxuICAgICAgeyBwdXNoU2VsZWN0aW9uVG9IaXN0b3J5KGRvYy5zZWwsIGhpc3QuZG9uZSk7IH1cbiAgICBjdXIgPSB7Y2hhbmdlczogW2hpc3RvcnlDaGFuZ2VGcm9tQ2hhbmdlKGRvYywgY2hhbmdlKV0sXG4gICAgICAgICAgIGdlbmVyYXRpb246IGhpc3QuZ2VuZXJhdGlvbn07XG4gICAgaGlzdC5kb25lLnB1c2goY3VyKTtcbiAgICB3aGlsZSAoaGlzdC5kb25lLmxlbmd0aCA+IGhpc3QudW5kb0RlcHRoKSB7XG4gICAgICBoaXN0LmRvbmUuc2hpZnQoKTtcbiAgICAgIGlmICghaGlzdC5kb25lWzBdLnJhbmdlcykgeyBoaXN0LmRvbmUuc2hpZnQoKTsgfVxuICAgIH1cbiAgfVxuICBoaXN0LmRvbmUucHVzaChzZWxBZnRlcik7XG4gIGhpc3QuZ2VuZXJhdGlvbiA9ICsraGlzdC5tYXhHZW5lcmF0aW9uO1xuICBoaXN0Lmxhc3RNb2RUaW1lID0gaGlzdC5sYXN0U2VsVGltZSA9IHRpbWU7XG4gIGhpc3QubGFzdE9wID0gaGlzdC5sYXN0U2VsT3AgPSBvcElkO1xuICBoaXN0Lmxhc3RPcmlnaW4gPSBoaXN0Lmxhc3RTZWxPcmlnaW4gPSBjaGFuZ2Uub3JpZ2luO1xuXG4gIGlmICghbGFzdCkgeyBzaWduYWwoZG9jLCBcImhpc3RvcnlBZGRlZFwiKTsgfVxufVxuXG5mdW5jdGlvbiBzZWxlY3Rpb25FdmVudENhbkJlTWVyZ2VkKGRvYywgb3JpZ2luLCBwcmV2LCBzZWwpIHtcbiAgdmFyIGNoID0gb3JpZ2luLmNoYXJBdCgwKTtcbiAgcmV0dXJuIGNoID09IFwiKlwiIHx8XG4gICAgY2ggPT0gXCIrXCIgJiZcbiAgICBwcmV2LnJhbmdlcy5sZW5ndGggPT0gc2VsLnJhbmdlcy5sZW5ndGggJiZcbiAgICBwcmV2LnNvbWV0aGluZ1NlbGVjdGVkKCkgPT0gc2VsLnNvbWV0aGluZ1NlbGVjdGVkKCkgJiZcbiAgICBuZXcgRGF0ZSAtIGRvYy5oaXN0b3J5Lmxhc3RTZWxUaW1lIDw9IChkb2MuY20gPyBkb2MuY20ub3B0aW9ucy5oaXN0b3J5RXZlbnREZWxheSA6IDUwMClcbn1cblxuLy8gQ2FsbGVkIHdoZW5ldmVyIHRoZSBzZWxlY3Rpb24gY2hhbmdlcywgc2V0cyB0aGUgbmV3IHNlbGVjdGlvbiBhc1xuLy8gdGhlIHBlbmRpbmcgc2VsZWN0aW9uIGluIHRoZSBoaXN0b3J5LCBhbmQgcHVzaGVzIHRoZSBvbGQgcGVuZGluZ1xuLy8gc2VsZWN0aW9uIGludG8gdGhlICdkb25lJyBhcnJheSB3aGVuIGl0IHdhcyBzaWduaWZpY2FudGx5XG4vLyBkaWZmZXJlbnQgKGluIG51bWJlciBvZiBzZWxlY3RlZCByYW5nZXMsIGVtcHRpbmVzcywgb3IgdGltZSkuXG5mdW5jdGlvbiBhZGRTZWxlY3Rpb25Ub0hpc3RvcnkoZG9jLCBzZWwsIG9wSWQsIG9wdGlvbnMpIHtcbiAgdmFyIGhpc3QgPSBkb2MuaGlzdG9yeSwgb3JpZ2luID0gb3B0aW9ucyAmJiBvcHRpb25zLm9yaWdpbjtcblxuICAvLyBBIG5ldyBldmVudCBpcyBzdGFydGVkIHdoZW4gdGhlIHByZXZpb3VzIG9yaWdpbiBkb2VzIG5vdCBtYXRjaFxuICAvLyB0aGUgY3VycmVudCwgb3IgdGhlIG9yaWdpbnMgZG9uJ3QgYWxsb3cgbWF0Y2hpbmcuIE9yaWdpbnNcbiAgLy8gc3RhcnRpbmcgd2l0aCAqIGFyZSBhbHdheXMgbWVyZ2VkLCB0aG9zZSBzdGFydGluZyB3aXRoICsgYXJlXG4gIC8vIG1lcmdlZCB3aGVuIHNpbWlsYXIgYW5kIGNsb3NlIHRvZ2V0aGVyIGluIHRpbWUuXG4gIGlmIChvcElkID09IGhpc3QubGFzdFNlbE9wIHx8XG4gICAgICAob3JpZ2luICYmIGhpc3QubGFzdFNlbE9yaWdpbiA9PSBvcmlnaW4gJiZcbiAgICAgICAoaGlzdC5sYXN0TW9kVGltZSA9PSBoaXN0Lmxhc3RTZWxUaW1lICYmIGhpc3QubGFzdE9yaWdpbiA9PSBvcmlnaW4gfHxcbiAgICAgICAgc2VsZWN0aW9uRXZlbnRDYW5CZU1lcmdlZChkb2MsIG9yaWdpbiwgbHN0KGhpc3QuZG9uZSksIHNlbCkpKSlcbiAgICB7IGhpc3QuZG9uZVtoaXN0LmRvbmUubGVuZ3RoIC0gMV0gPSBzZWw7IH1cbiAgZWxzZVxuICAgIHsgcHVzaFNlbGVjdGlvblRvSGlzdG9yeShzZWwsIGhpc3QuZG9uZSk7IH1cblxuICBoaXN0Lmxhc3RTZWxUaW1lID0gK25ldyBEYXRlO1xuICBoaXN0Lmxhc3RTZWxPcmlnaW4gPSBvcmlnaW47XG4gIGhpc3QubGFzdFNlbE9wID0gb3BJZDtcbiAgaWYgKG9wdGlvbnMgJiYgb3B0aW9ucy5jbGVhclJlZG8gIT09IGZhbHNlKVxuICAgIHsgY2xlYXJTZWxlY3Rpb25FdmVudHMoaGlzdC51bmRvbmUpOyB9XG59XG5cbmZ1bmN0aW9uIHB1c2hTZWxlY3Rpb25Ub0hpc3Rvcnkoc2VsLCBkZXN0KSB7XG4gIHZhciB0b3AgPSBsc3QoZGVzdCk7XG4gIGlmICghKHRvcCAmJiB0b3AucmFuZ2VzICYmIHRvcC5lcXVhbHMoc2VsKSkpXG4gICAgeyBkZXN0LnB1c2goc2VsKTsgfVxufVxuXG4vLyBVc2VkIHRvIHN0b3JlIG1hcmtlZCBzcGFuIGluZm9ybWF0aW9uIGluIHRoZSBoaXN0b3J5LlxuZnVuY3Rpb24gYXR0YWNoTG9jYWxTcGFucyhkb2MsIGNoYW5nZSwgZnJvbSwgdG8pIHtcbiAgdmFyIGV4aXN0aW5nID0gY2hhbmdlW1wic3BhbnNfXCIgKyBkb2MuaWRdLCBuID0gMDtcbiAgZG9jLml0ZXIoTWF0aC5tYXgoZG9jLmZpcnN0LCBmcm9tKSwgTWF0aC5taW4oZG9jLmZpcnN0ICsgZG9jLnNpemUsIHRvKSwgZnVuY3Rpb24gKGxpbmUpIHtcbiAgICBpZiAobGluZS5tYXJrZWRTcGFucylcbiAgICAgIHsgKGV4aXN0aW5nIHx8IChleGlzdGluZyA9IGNoYW5nZVtcInNwYW5zX1wiICsgZG9jLmlkXSA9IHt9KSlbbl0gPSBsaW5lLm1hcmtlZFNwYW5zOyB9XG4gICAgKytuO1xuICB9KTtcbn1cblxuLy8gV2hlbiB1bi9yZS1kb2luZyByZXN0b3JlcyB0ZXh0IGNvbnRhaW5pbmcgbWFya2VkIHNwYW5zLCB0aG9zZVxuLy8gdGhhdCBoYXZlIGJlZW4gZXhwbGljaXRseSBjbGVhcmVkIHNob3VsZCBub3QgYmUgcmVzdG9yZWQuXG5mdW5jdGlvbiByZW1vdmVDbGVhcmVkU3BhbnMoc3BhbnMpIHtcbiAgaWYgKCFzcGFucykgeyByZXR1cm4gbnVsbCB9XG4gIHZhciBvdXQ7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc3BhbnMubGVuZ3RoOyArK2kpIHtcbiAgICBpZiAoc3BhbnNbaV0ubWFya2VyLmV4cGxpY2l0bHlDbGVhcmVkKSB7IGlmICghb3V0KSB7IG91dCA9IHNwYW5zLnNsaWNlKDAsIGkpOyB9IH1cbiAgICBlbHNlIGlmIChvdXQpIHsgb3V0LnB1c2goc3BhbnNbaV0pOyB9XG4gIH1cbiAgcmV0dXJuICFvdXQgPyBzcGFucyA6IG91dC5sZW5ndGggPyBvdXQgOiBudWxsXG59XG5cbi8vIFJldHJpZXZlIGFuZCBmaWx0ZXIgdGhlIG9sZCBtYXJrZWQgc3BhbnMgc3RvcmVkIGluIGEgY2hhbmdlIGV2ZW50LlxuZnVuY3Rpb24gZ2V0T2xkU3BhbnMoZG9jLCBjaGFuZ2UpIHtcbiAgdmFyIGZvdW5kID0gY2hhbmdlW1wic3BhbnNfXCIgKyBkb2MuaWRdO1xuICBpZiAoIWZvdW5kKSB7IHJldHVybiBudWxsIH1cbiAgdmFyIG53ID0gW107XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgY2hhbmdlLnRleHQubGVuZ3RoOyArK2kpXG4gICAgeyBudy5wdXNoKHJlbW92ZUNsZWFyZWRTcGFucyhmb3VuZFtpXSkpOyB9XG4gIHJldHVybiBud1xufVxuXG4vLyBVc2VkIGZvciB1bi9yZS1kb2luZyBjaGFuZ2VzIGZyb20gdGhlIGhpc3RvcnkuIENvbWJpbmVzIHRoZVxuLy8gcmVzdWx0IG9mIGNvbXB1dGluZyB0aGUgZXhpc3Rpbmcgc3BhbnMgd2l0aCB0aGUgc2V0IG9mIHNwYW5zIHRoYXRcbi8vIGV4aXN0ZWQgaW4gdGhlIGhpc3RvcnkgKHNvIHRoYXQgZGVsZXRpbmcgYXJvdW5kIGEgc3BhbiBhbmQgdGhlblxuLy8gdW5kb2luZyBicmluZ3MgYmFjayB0aGUgc3BhbikuXG5mdW5jdGlvbiBtZXJnZU9sZFNwYW5zKGRvYywgY2hhbmdlKSB7XG4gIHZhciBvbGQgPSBnZXRPbGRTcGFucyhkb2MsIGNoYW5nZSk7XG4gIHZhciBzdHJldGNoZWQgPSBzdHJldGNoU3BhbnNPdmVyQ2hhbmdlKGRvYywgY2hhbmdlKTtcbiAgaWYgKCFvbGQpIHsgcmV0dXJuIHN0cmV0Y2hlZCB9XG4gIGlmICghc3RyZXRjaGVkKSB7IHJldHVybiBvbGQgfVxuXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgb2xkLmxlbmd0aDsgKytpKSB7XG4gICAgdmFyIG9sZEN1ciA9IG9sZFtpXSwgc3RyZXRjaEN1ciA9IHN0cmV0Y2hlZFtpXTtcbiAgICBpZiAob2xkQ3VyICYmIHN0cmV0Y2hDdXIpIHtcbiAgICAgIHNwYW5zOiBmb3IgKHZhciBqID0gMDsgaiA8IHN0cmV0Y2hDdXIubGVuZ3RoOyArK2opIHtcbiAgICAgICAgdmFyIHNwYW4gPSBzdHJldGNoQ3VyW2pdO1xuICAgICAgICBmb3IgKHZhciBrID0gMDsgayA8IG9sZEN1ci5sZW5ndGg7ICsraylcbiAgICAgICAgICB7IGlmIChvbGRDdXJba10ubWFya2VyID09IHNwYW4ubWFya2VyKSB7IGNvbnRpbnVlIHNwYW5zIH0gfVxuICAgICAgICBvbGRDdXIucHVzaChzcGFuKTtcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKHN0cmV0Y2hDdXIpIHtcbiAgICAgIG9sZFtpXSA9IHN0cmV0Y2hDdXI7XG4gICAgfVxuICB9XG4gIHJldHVybiBvbGRcbn1cblxuLy8gVXNlZCBib3RoIHRvIHByb3ZpZGUgYSBKU09OLXNhZmUgb2JqZWN0IGluIC5nZXRIaXN0b3J5LCBhbmQsIHdoZW5cbi8vIGRldGFjaGluZyBhIGRvY3VtZW50LCB0byBzcGxpdCB0aGUgaGlzdG9yeSBpbiB0d29cbmZ1bmN0aW9uIGNvcHlIaXN0b3J5QXJyYXkoZXZlbnRzLCBuZXdHcm91cCwgaW5zdGFudGlhdGVTZWwpIHtcbiAgdmFyIGNvcHkgPSBbXTtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBldmVudHMubGVuZ3RoOyArK2kpIHtcbiAgICB2YXIgZXZlbnQgPSBldmVudHNbaV07XG4gICAgaWYgKGV2ZW50LnJhbmdlcykge1xuICAgICAgY29weS5wdXNoKGluc3RhbnRpYXRlU2VsID8gU2VsZWN0aW9uLnByb3RvdHlwZS5kZWVwQ29weS5jYWxsKGV2ZW50KSA6IGV2ZW50KTtcbiAgICAgIGNvbnRpbnVlXG4gICAgfVxuICAgIHZhciBjaGFuZ2VzID0gZXZlbnQuY2hhbmdlcywgbmV3Q2hhbmdlcyA9IFtdO1xuICAgIGNvcHkucHVzaCh7Y2hhbmdlczogbmV3Q2hhbmdlc30pO1xuICAgIGZvciAodmFyIGogPSAwOyBqIDwgY2hhbmdlcy5sZW5ndGg7ICsraikge1xuICAgICAgdmFyIGNoYW5nZSA9IGNoYW5nZXNbal0sIG0gPSAodm9pZCAwKTtcbiAgICAgIG5ld0NoYW5nZXMucHVzaCh7ZnJvbTogY2hhbmdlLmZyb20sIHRvOiBjaGFuZ2UudG8sIHRleHQ6IGNoYW5nZS50ZXh0fSk7XG4gICAgICBpZiAobmV3R3JvdXApIHsgZm9yICh2YXIgcHJvcCBpbiBjaGFuZ2UpIHsgaWYgKG0gPSBwcm9wLm1hdGNoKC9ec3BhbnNfKFxcZCspJC8pKSB7XG4gICAgICAgIGlmIChpbmRleE9mKG5ld0dyb3VwLCBOdW1iZXIobVsxXSkpID4gLTEpIHtcbiAgICAgICAgICBsc3QobmV3Q2hhbmdlcylbcHJvcF0gPSBjaGFuZ2VbcHJvcF07XG4gICAgICAgICAgZGVsZXRlIGNoYW5nZVtwcm9wXTtcbiAgICAgICAgfVxuICAgICAgfSB9IH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIGNvcHlcbn1cblxuLy8gVGhlICdzY3JvbGwnIHBhcmFtZXRlciBnaXZlbiB0byBtYW55IG9mIHRoZXNlIGluZGljYXRlZCB3aGV0aGVyXG4vLyB0aGUgbmV3IGN1cnNvciBwb3NpdGlvbiBzaG91bGQgYmUgc2Nyb2xsZWQgaW50byB2aWV3IGFmdGVyXG4vLyBtb2RpZnlpbmcgdGhlIHNlbGVjdGlvbi5cblxuLy8gSWYgc2hpZnQgaXMgaGVsZCBvciB0aGUgZXh0ZW5kIGZsYWcgaXMgc2V0LCBleHRlbmRzIGEgcmFuZ2UgdG9cbi8vIGluY2x1ZGUgYSBnaXZlbiBwb3NpdGlvbiAoYW5kIG9wdGlvbmFsbHkgYSBzZWNvbmQgcG9zaXRpb24pLlxuLy8gT3RoZXJ3aXNlLCBzaW1wbHkgcmV0dXJucyB0aGUgcmFuZ2UgYmV0d2VlbiB0aGUgZ2l2ZW4gcG9zaXRpb25zLlxuLy8gVXNlZCBmb3IgY3Vyc29yIG1vdGlvbiBhbmQgc3VjaC5cbmZ1bmN0aW9uIGV4dGVuZFJhbmdlKHJhbmdlLCBoZWFkLCBvdGhlciwgZXh0ZW5kKSB7XG4gIGlmIChleHRlbmQpIHtcbiAgICB2YXIgYW5jaG9yID0gcmFuZ2UuYW5jaG9yO1xuICAgIGlmIChvdGhlcikge1xuICAgICAgdmFyIHBvc0JlZm9yZSA9IGNtcChoZWFkLCBhbmNob3IpIDwgMDtcbiAgICAgIGlmIChwb3NCZWZvcmUgIT0gKGNtcChvdGhlciwgYW5jaG9yKSA8IDApKSB7XG4gICAgICAgIGFuY2hvciA9IGhlYWQ7XG4gICAgICAgIGhlYWQgPSBvdGhlcjtcbiAgICAgIH0gZWxzZSBpZiAocG9zQmVmb3JlICE9IChjbXAoaGVhZCwgb3RoZXIpIDwgMCkpIHtcbiAgICAgICAgaGVhZCA9IG90aGVyO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gbmV3IFJhbmdlKGFuY2hvciwgaGVhZClcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gbmV3IFJhbmdlKG90aGVyIHx8IGhlYWQsIGhlYWQpXG4gIH1cbn1cblxuLy8gRXh0ZW5kIHRoZSBwcmltYXJ5IHNlbGVjdGlvbiByYW5nZSwgZGlzY2FyZCB0aGUgcmVzdC5cbmZ1bmN0aW9uIGV4dGVuZFNlbGVjdGlvbihkb2MsIGhlYWQsIG90aGVyLCBvcHRpb25zLCBleHRlbmQpIHtcbiAgaWYgKGV4dGVuZCA9PSBudWxsKSB7IGV4dGVuZCA9IGRvYy5jbSAmJiAoZG9jLmNtLmRpc3BsYXkuc2hpZnQgfHwgZG9jLmV4dGVuZCk7IH1cbiAgc2V0U2VsZWN0aW9uKGRvYywgbmV3IFNlbGVjdGlvbihbZXh0ZW5kUmFuZ2UoZG9jLnNlbC5wcmltYXJ5KCksIGhlYWQsIG90aGVyLCBleHRlbmQpXSwgMCksIG9wdGlvbnMpO1xufVxuXG4vLyBFeHRlbmQgYWxsIHNlbGVjdGlvbnMgKHBvcyBpcyBhbiBhcnJheSBvZiBzZWxlY3Rpb25zIHdpdGggbGVuZ3RoXG4vLyBlcXVhbCB0aGUgbnVtYmVyIG9mIHNlbGVjdGlvbnMpXG5mdW5jdGlvbiBleHRlbmRTZWxlY3Rpb25zKGRvYywgaGVhZHMsIG9wdGlvbnMpIHtcbiAgdmFyIG91dCA9IFtdO1xuICB2YXIgZXh0ZW5kID0gZG9jLmNtICYmIChkb2MuY20uZGlzcGxheS5zaGlmdCB8fCBkb2MuZXh0ZW5kKTtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBkb2Muc2VsLnJhbmdlcy5sZW5ndGg7IGkrKylcbiAgICB7IG91dFtpXSA9IGV4dGVuZFJhbmdlKGRvYy5zZWwucmFuZ2VzW2ldLCBoZWFkc1tpXSwgbnVsbCwgZXh0ZW5kKTsgfVxuICB2YXIgbmV3U2VsID0gbm9ybWFsaXplU2VsZWN0aW9uKG91dCwgZG9jLnNlbC5wcmltSW5kZXgpO1xuICBzZXRTZWxlY3Rpb24oZG9jLCBuZXdTZWwsIG9wdGlvbnMpO1xufVxuXG4vLyBVcGRhdGVzIGEgc2luZ2xlIHJhbmdlIGluIHRoZSBzZWxlY3Rpb24uXG5mdW5jdGlvbiByZXBsYWNlT25lU2VsZWN0aW9uKGRvYywgaSwgcmFuZ2UsIG9wdGlvbnMpIHtcbiAgdmFyIHJhbmdlcyA9IGRvYy5zZWwucmFuZ2VzLnNsaWNlKDApO1xuICByYW5nZXNbaV0gPSByYW5nZTtcbiAgc2V0U2VsZWN0aW9uKGRvYywgbm9ybWFsaXplU2VsZWN0aW9uKHJhbmdlcywgZG9jLnNlbC5wcmltSW5kZXgpLCBvcHRpb25zKTtcbn1cblxuLy8gUmVzZXQgdGhlIHNlbGVjdGlvbiB0byBhIHNpbmdsZSByYW5nZS5cbmZ1bmN0aW9uIHNldFNpbXBsZVNlbGVjdGlvbihkb2MsIGFuY2hvciwgaGVhZCwgb3B0aW9ucykge1xuICBzZXRTZWxlY3Rpb24oZG9jLCBzaW1wbGVTZWxlY3Rpb24oYW5jaG9yLCBoZWFkKSwgb3B0aW9ucyk7XG59XG5cbi8vIEdpdmUgYmVmb3JlU2VsZWN0aW9uQ2hhbmdlIGhhbmRsZXJzIGEgY2hhbmdlIHRvIGluZmx1ZW5jZSBhXG4vLyBzZWxlY3Rpb24gdXBkYXRlLlxuZnVuY3Rpb24gZmlsdGVyU2VsZWN0aW9uQ2hhbmdlKGRvYywgc2VsLCBvcHRpb25zKSB7XG4gIHZhciBvYmogPSB7XG4gICAgcmFuZ2VzOiBzZWwucmFuZ2VzLFxuICAgIHVwZGF0ZTogZnVuY3Rpb24ocmFuZ2VzKSB7XG4gICAgICB2YXIgdGhpcyQxID0gdGhpcztcblxuICAgICAgdGhpcy5yYW5nZXMgPSBbXTtcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcmFuZ2VzLmxlbmd0aDsgaSsrKVxuICAgICAgICB7IHRoaXMkMS5yYW5nZXNbaV0gPSBuZXcgUmFuZ2UoY2xpcFBvcyhkb2MsIHJhbmdlc1tpXS5hbmNob3IpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjbGlwUG9zKGRvYywgcmFuZ2VzW2ldLmhlYWQpKTsgfVxuICAgIH0sXG4gICAgb3JpZ2luOiBvcHRpb25zICYmIG9wdGlvbnMub3JpZ2luXG4gIH07XG4gIHNpZ25hbChkb2MsIFwiYmVmb3JlU2VsZWN0aW9uQ2hhbmdlXCIsIGRvYywgb2JqKTtcbiAgaWYgKGRvYy5jbSkgeyBzaWduYWwoZG9jLmNtLCBcImJlZm9yZVNlbGVjdGlvbkNoYW5nZVwiLCBkb2MuY20sIG9iaik7IH1cbiAgaWYgKG9iai5yYW5nZXMgIT0gc2VsLnJhbmdlcykgeyByZXR1cm4gbm9ybWFsaXplU2VsZWN0aW9uKG9iai5yYW5nZXMsIG9iai5yYW5nZXMubGVuZ3RoIC0gMSkgfVxuICBlbHNlIHsgcmV0dXJuIHNlbCB9XG59XG5cbmZ1bmN0aW9uIHNldFNlbGVjdGlvblJlcGxhY2VIaXN0b3J5KGRvYywgc2VsLCBvcHRpb25zKSB7XG4gIHZhciBkb25lID0gZG9jLmhpc3RvcnkuZG9uZSwgbGFzdCA9IGxzdChkb25lKTtcbiAgaWYgKGxhc3QgJiYgbGFzdC5yYW5nZXMpIHtcbiAgICBkb25lW2RvbmUubGVuZ3RoIC0gMV0gPSBzZWw7XG4gICAgc2V0U2VsZWN0aW9uTm9VbmRvKGRvYywgc2VsLCBvcHRpb25zKTtcbiAgfSBlbHNlIHtcbiAgICBzZXRTZWxlY3Rpb24oZG9jLCBzZWwsIG9wdGlvbnMpO1xuICB9XG59XG5cbi8vIFNldCBhIG5ldyBzZWxlY3Rpb24uXG5mdW5jdGlvbiBzZXRTZWxlY3Rpb24oZG9jLCBzZWwsIG9wdGlvbnMpIHtcbiAgc2V0U2VsZWN0aW9uTm9VbmRvKGRvYywgc2VsLCBvcHRpb25zKTtcbiAgYWRkU2VsZWN0aW9uVG9IaXN0b3J5KGRvYywgZG9jLnNlbCwgZG9jLmNtID8gZG9jLmNtLmN1ck9wLmlkIDogTmFOLCBvcHRpb25zKTtcbn1cblxuZnVuY3Rpb24gc2V0U2VsZWN0aW9uTm9VbmRvKGRvYywgc2VsLCBvcHRpb25zKSB7XG4gIGlmIChoYXNIYW5kbGVyKGRvYywgXCJiZWZvcmVTZWxlY3Rpb25DaGFuZ2VcIikgfHwgZG9jLmNtICYmIGhhc0hhbmRsZXIoZG9jLmNtLCBcImJlZm9yZVNlbGVjdGlvbkNoYW5nZVwiKSlcbiAgICB7IHNlbCA9IGZpbHRlclNlbGVjdGlvbkNoYW5nZShkb2MsIHNlbCwgb3B0aW9ucyk7IH1cblxuICB2YXIgYmlhcyA9IG9wdGlvbnMgJiYgb3B0aW9ucy5iaWFzIHx8XG4gICAgKGNtcChzZWwucHJpbWFyeSgpLmhlYWQsIGRvYy5zZWwucHJpbWFyeSgpLmhlYWQpIDwgMCA/IC0xIDogMSk7XG4gIHNldFNlbGVjdGlvbklubmVyKGRvYywgc2tpcEF0b21pY0luU2VsZWN0aW9uKGRvYywgc2VsLCBiaWFzLCB0cnVlKSk7XG5cbiAgaWYgKCEob3B0aW9ucyAmJiBvcHRpb25zLnNjcm9sbCA9PT0gZmFsc2UpICYmIGRvYy5jbSlcbiAgICB7IGVuc3VyZUN1cnNvclZpc2libGUoZG9jLmNtKTsgfVxufVxuXG5mdW5jdGlvbiBzZXRTZWxlY3Rpb25Jbm5lcihkb2MsIHNlbCkge1xuICBpZiAoc2VsLmVxdWFscyhkb2Muc2VsKSkgeyByZXR1cm4gfVxuXG4gIGRvYy5zZWwgPSBzZWw7XG5cbiAgaWYgKGRvYy5jbSkge1xuICAgIGRvYy5jbS5jdXJPcC51cGRhdGVJbnB1dCA9IGRvYy5jbS5jdXJPcC5zZWxlY3Rpb25DaGFuZ2VkID0gdHJ1ZTtcbiAgICBzaWduYWxDdXJzb3JBY3Rpdml0eShkb2MuY20pO1xuICB9XG4gIHNpZ25hbExhdGVyKGRvYywgXCJjdXJzb3JBY3Rpdml0eVwiLCBkb2MpO1xufVxuXG4vLyBWZXJpZnkgdGhhdCB0aGUgc2VsZWN0aW9uIGRvZXMgbm90IHBhcnRpYWxseSBzZWxlY3QgYW55IGF0b21pY1xuLy8gbWFya2VkIHJhbmdlcy5cbmZ1bmN0aW9uIHJlQ2hlY2tTZWxlY3Rpb24oZG9jKSB7XG4gIHNldFNlbGVjdGlvbklubmVyKGRvYywgc2tpcEF0b21pY0luU2VsZWN0aW9uKGRvYywgZG9jLnNlbCwgbnVsbCwgZmFsc2UpKTtcbn1cblxuLy8gUmV0dXJuIGEgc2VsZWN0aW9uIHRoYXQgZG9lcyBub3QgcGFydGlhbGx5IHNlbGVjdCBhbnkgYXRvbWljXG4vLyByYW5nZXMuXG5mdW5jdGlvbiBza2lwQXRvbWljSW5TZWxlY3Rpb24oZG9jLCBzZWwsIGJpYXMsIG1heUNsZWFyKSB7XG4gIHZhciBvdXQ7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc2VsLnJhbmdlcy5sZW5ndGg7IGkrKykge1xuICAgIHZhciByYW5nZSA9IHNlbC5yYW5nZXNbaV07XG4gICAgdmFyIG9sZCA9IHNlbC5yYW5nZXMubGVuZ3RoID09IGRvYy5zZWwucmFuZ2VzLmxlbmd0aCAmJiBkb2Muc2VsLnJhbmdlc1tpXTtcbiAgICB2YXIgbmV3QW5jaG9yID0gc2tpcEF0b21pYyhkb2MsIHJhbmdlLmFuY2hvciwgb2xkICYmIG9sZC5hbmNob3IsIGJpYXMsIG1heUNsZWFyKTtcbiAgICB2YXIgbmV3SGVhZCA9IHNraXBBdG9taWMoZG9jLCByYW5nZS5oZWFkLCBvbGQgJiYgb2xkLmhlYWQsIGJpYXMsIG1heUNsZWFyKTtcbiAgICBpZiAob3V0IHx8IG5ld0FuY2hvciAhPSByYW5nZS5hbmNob3IgfHwgbmV3SGVhZCAhPSByYW5nZS5oZWFkKSB7XG4gICAgICBpZiAoIW91dCkgeyBvdXQgPSBzZWwucmFuZ2VzLnNsaWNlKDAsIGkpOyB9XG4gICAgICBvdXRbaV0gPSBuZXcgUmFuZ2UobmV3QW5jaG9yLCBuZXdIZWFkKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIG91dCA/IG5vcm1hbGl6ZVNlbGVjdGlvbihvdXQsIHNlbC5wcmltSW5kZXgpIDogc2VsXG59XG5cbmZ1bmN0aW9uIHNraXBBdG9taWNJbm5lcihkb2MsIHBvcywgb2xkUG9zLCBkaXIsIG1heUNsZWFyKSB7XG4gIHZhciBsaW5lID0gZ2V0TGluZShkb2MsIHBvcy5saW5lKTtcbiAgaWYgKGxpbmUubWFya2VkU3BhbnMpIHsgZm9yICh2YXIgaSA9IDA7IGkgPCBsaW5lLm1hcmtlZFNwYW5zLmxlbmd0aDsgKytpKSB7XG4gICAgdmFyIHNwID0gbGluZS5tYXJrZWRTcGFuc1tpXSwgbSA9IHNwLm1hcmtlcjtcbiAgICBpZiAoKHNwLmZyb20gPT0gbnVsbCB8fCAobS5pbmNsdXNpdmVMZWZ0ID8gc3AuZnJvbSA8PSBwb3MuY2ggOiBzcC5mcm9tIDwgcG9zLmNoKSkgJiZcbiAgICAgICAgKHNwLnRvID09IG51bGwgfHwgKG0uaW5jbHVzaXZlUmlnaHQgPyBzcC50byA+PSBwb3MuY2ggOiBzcC50byA+IHBvcy5jaCkpKSB7XG4gICAgICBpZiAobWF5Q2xlYXIpIHtcbiAgICAgICAgc2lnbmFsKG0sIFwiYmVmb3JlQ3Vyc29yRW50ZXJcIik7XG4gICAgICAgIGlmIChtLmV4cGxpY2l0bHlDbGVhcmVkKSB7XG4gICAgICAgICAgaWYgKCFsaW5lLm1hcmtlZFNwYW5zKSB7IGJyZWFrIH1cbiAgICAgICAgICBlbHNlIHstLWk7IGNvbnRpbnVlfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoIW0uYXRvbWljKSB7IGNvbnRpbnVlIH1cblxuICAgICAgaWYgKG9sZFBvcykge1xuICAgICAgICB2YXIgbmVhciA9IG0uZmluZChkaXIgPCAwID8gMSA6IC0xKSwgZGlmZiA9ICh2b2lkIDApO1xuICAgICAgICBpZiAoZGlyIDwgMCA/IG0uaW5jbHVzaXZlUmlnaHQgOiBtLmluY2x1c2l2ZUxlZnQpXG4gICAgICAgICAgeyBuZWFyID0gbW92ZVBvcyhkb2MsIG5lYXIsIC1kaXIsIG5lYXIgJiYgbmVhci5saW5lID09IHBvcy5saW5lID8gbGluZSA6IG51bGwpOyB9XG4gICAgICAgIGlmIChuZWFyICYmIG5lYXIubGluZSA9PSBwb3MubGluZSAmJiAoZGlmZiA9IGNtcChuZWFyLCBvbGRQb3MpKSAmJiAoZGlyIDwgMCA/IGRpZmYgPCAwIDogZGlmZiA+IDApKVxuICAgICAgICAgIHsgcmV0dXJuIHNraXBBdG9taWNJbm5lcihkb2MsIG5lYXIsIHBvcywgZGlyLCBtYXlDbGVhcikgfVxuICAgICAgfVxuXG4gICAgICB2YXIgZmFyID0gbS5maW5kKGRpciA8IDAgPyAtMSA6IDEpO1xuICAgICAgaWYgKGRpciA8IDAgPyBtLmluY2x1c2l2ZUxlZnQgOiBtLmluY2x1c2l2ZVJpZ2h0KVxuICAgICAgICB7IGZhciA9IG1vdmVQb3MoZG9jLCBmYXIsIGRpciwgZmFyLmxpbmUgPT0gcG9zLmxpbmUgPyBsaW5lIDogbnVsbCk7IH1cbiAgICAgIHJldHVybiBmYXIgPyBza2lwQXRvbWljSW5uZXIoZG9jLCBmYXIsIHBvcywgZGlyLCBtYXlDbGVhcikgOiBudWxsXG4gICAgfVxuICB9IH1cbiAgcmV0dXJuIHBvc1xufVxuXG4vLyBFbnN1cmUgYSBnaXZlbiBwb3NpdGlvbiBpcyBub3QgaW5zaWRlIGFuIGF0b21pYyByYW5nZS5cbmZ1bmN0aW9uIHNraXBBdG9taWMoZG9jLCBwb3MsIG9sZFBvcywgYmlhcywgbWF5Q2xlYXIpIHtcbiAgdmFyIGRpciA9IGJpYXMgfHwgMTtcbiAgdmFyIGZvdW5kID0gc2tpcEF0b21pY0lubmVyKGRvYywgcG9zLCBvbGRQb3MsIGRpciwgbWF5Q2xlYXIpIHx8XG4gICAgICAoIW1heUNsZWFyICYmIHNraXBBdG9taWNJbm5lcihkb2MsIHBvcywgb2xkUG9zLCBkaXIsIHRydWUpKSB8fFxuICAgICAgc2tpcEF0b21pY0lubmVyKGRvYywgcG9zLCBvbGRQb3MsIC1kaXIsIG1heUNsZWFyKSB8fFxuICAgICAgKCFtYXlDbGVhciAmJiBza2lwQXRvbWljSW5uZXIoZG9jLCBwb3MsIG9sZFBvcywgLWRpciwgdHJ1ZSkpO1xuICBpZiAoIWZvdW5kKSB7XG4gICAgZG9jLmNhbnRFZGl0ID0gdHJ1ZTtcbiAgICByZXR1cm4gUG9zKGRvYy5maXJzdCwgMClcbiAgfVxuICByZXR1cm4gZm91bmRcbn1cblxuZnVuY3Rpb24gbW92ZVBvcyhkb2MsIHBvcywgZGlyLCBsaW5lKSB7XG4gIGlmIChkaXIgPCAwICYmIHBvcy5jaCA9PSAwKSB7XG4gICAgaWYgKHBvcy5saW5lID4gZG9jLmZpcnN0KSB7IHJldHVybiBjbGlwUG9zKGRvYywgUG9zKHBvcy5saW5lIC0gMSkpIH1cbiAgICBlbHNlIHsgcmV0dXJuIG51bGwgfVxuICB9IGVsc2UgaWYgKGRpciA+IDAgJiYgcG9zLmNoID09IChsaW5lIHx8IGdldExpbmUoZG9jLCBwb3MubGluZSkpLnRleHQubGVuZ3RoKSB7XG4gICAgaWYgKHBvcy5saW5lIDwgZG9jLmZpcnN0ICsgZG9jLnNpemUgLSAxKSB7IHJldHVybiBQb3MocG9zLmxpbmUgKyAxLCAwKSB9XG4gICAgZWxzZSB7IHJldHVybiBudWxsIH1cbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gbmV3IFBvcyhwb3MubGluZSwgcG9zLmNoICsgZGlyKVxuICB9XG59XG5cbmZ1bmN0aW9uIHNlbGVjdEFsbChjbSkge1xuICBjbS5zZXRTZWxlY3Rpb24oUG9zKGNtLmZpcnN0TGluZSgpLCAwKSwgUG9zKGNtLmxhc3RMaW5lKCkpLCBzZWxfZG9udFNjcm9sbCk7XG59XG5cbi8vIFVQREFUSU5HXG5cbi8vIEFsbG93IFwiYmVmb3JlQ2hhbmdlXCIgZXZlbnQgaGFuZGxlcnMgdG8gaW5mbHVlbmNlIGEgY2hhbmdlXG5mdW5jdGlvbiBmaWx0ZXJDaGFuZ2UoZG9jLCBjaGFuZ2UsIHVwZGF0ZSkge1xuICB2YXIgb2JqID0ge1xuICAgIGNhbmNlbGVkOiBmYWxzZSxcbiAgICBmcm9tOiBjaGFuZ2UuZnJvbSxcbiAgICB0bzogY2hhbmdlLnRvLFxuICAgIHRleHQ6IGNoYW5nZS50ZXh0LFxuICAgIG9yaWdpbjogY2hhbmdlLm9yaWdpbixcbiAgICBjYW5jZWw6IGZ1bmN0aW9uICgpIHsgcmV0dXJuIG9iai5jYW5jZWxlZCA9IHRydWU7IH1cbiAgfTtcbiAgaWYgKHVwZGF0ZSkgeyBvYmoudXBkYXRlID0gZnVuY3Rpb24gKGZyb20sIHRvLCB0ZXh0LCBvcmlnaW4pIHtcbiAgICBpZiAoZnJvbSkgeyBvYmouZnJvbSA9IGNsaXBQb3MoZG9jLCBmcm9tKTsgfVxuICAgIGlmICh0bykgeyBvYmoudG8gPSBjbGlwUG9zKGRvYywgdG8pOyB9XG4gICAgaWYgKHRleHQpIHsgb2JqLnRleHQgPSB0ZXh0OyB9XG4gICAgaWYgKG9yaWdpbiAhPT0gdW5kZWZpbmVkKSB7IG9iai5vcmlnaW4gPSBvcmlnaW47IH1cbiAgfTsgfVxuICBzaWduYWwoZG9jLCBcImJlZm9yZUNoYW5nZVwiLCBkb2MsIG9iaik7XG4gIGlmIChkb2MuY20pIHsgc2lnbmFsKGRvYy5jbSwgXCJiZWZvcmVDaGFuZ2VcIiwgZG9jLmNtLCBvYmopOyB9XG5cbiAgaWYgKG9iai5jYW5jZWxlZCkgeyByZXR1cm4gbnVsbCB9XG4gIHJldHVybiB7ZnJvbTogb2JqLmZyb20sIHRvOiBvYmoudG8sIHRleHQ6IG9iai50ZXh0LCBvcmlnaW46IG9iai5vcmlnaW59XG59XG5cbi8vIEFwcGx5IGEgY2hhbmdlIHRvIGEgZG9jdW1lbnQsIGFuZCBhZGQgaXQgdG8gdGhlIGRvY3VtZW50J3Ncbi8vIGhpc3RvcnksIGFuZCBwcm9wYWdhdGluZyBpdCB0byBhbGwgbGlua2VkIGRvY3VtZW50cy5cbmZ1bmN0aW9uIG1ha2VDaGFuZ2UoZG9jLCBjaGFuZ2UsIGlnbm9yZVJlYWRPbmx5KSB7XG4gIGlmIChkb2MuY20pIHtcbiAgICBpZiAoIWRvYy5jbS5jdXJPcCkgeyByZXR1cm4gb3BlcmF0aW9uKGRvYy5jbSwgbWFrZUNoYW5nZSkoZG9jLCBjaGFuZ2UsIGlnbm9yZVJlYWRPbmx5KSB9XG4gICAgaWYgKGRvYy5jbS5zdGF0ZS5zdXBwcmVzc0VkaXRzKSB7IHJldHVybiB9XG4gIH1cblxuICBpZiAoaGFzSGFuZGxlcihkb2MsIFwiYmVmb3JlQ2hhbmdlXCIpIHx8IGRvYy5jbSAmJiBoYXNIYW5kbGVyKGRvYy5jbSwgXCJiZWZvcmVDaGFuZ2VcIikpIHtcbiAgICBjaGFuZ2UgPSBmaWx0ZXJDaGFuZ2UoZG9jLCBjaGFuZ2UsIHRydWUpO1xuICAgIGlmICghY2hhbmdlKSB7IHJldHVybiB9XG4gIH1cblxuICAvLyBQb3NzaWJseSBzcGxpdCBvciBzdXBwcmVzcyB0aGUgdXBkYXRlIGJhc2VkIG9uIHRoZSBwcmVzZW5jZVxuICAvLyBvZiByZWFkLW9ubHkgc3BhbnMgaW4gaXRzIHJhbmdlLlxuICB2YXIgc3BsaXQgPSBzYXdSZWFkT25seVNwYW5zICYmICFpZ25vcmVSZWFkT25seSAmJiByZW1vdmVSZWFkT25seVJhbmdlcyhkb2MsIGNoYW5nZS5mcm9tLCBjaGFuZ2UudG8pO1xuICBpZiAoc3BsaXQpIHtcbiAgICBmb3IgKHZhciBpID0gc3BsaXQubGVuZ3RoIC0gMTsgaSA+PSAwOyAtLWkpXG4gICAgICB7IG1ha2VDaGFuZ2VJbm5lcihkb2MsIHtmcm9tOiBzcGxpdFtpXS5mcm9tLCB0bzogc3BsaXRbaV0udG8sIHRleHQ6IGkgPyBbXCJcIl0gOiBjaGFuZ2UudGV4dCwgb3JpZ2luOiBjaGFuZ2Uub3JpZ2lufSk7IH1cbiAgfSBlbHNlIHtcbiAgICBtYWtlQ2hhbmdlSW5uZXIoZG9jLCBjaGFuZ2UpO1xuICB9XG59XG5cbmZ1bmN0aW9uIG1ha2VDaGFuZ2VJbm5lcihkb2MsIGNoYW5nZSkge1xuICBpZiAoY2hhbmdlLnRleHQubGVuZ3RoID09IDEgJiYgY2hhbmdlLnRleHRbMF0gPT0gXCJcIiAmJiBjbXAoY2hhbmdlLmZyb20sIGNoYW5nZS50bykgPT0gMCkgeyByZXR1cm4gfVxuICB2YXIgc2VsQWZ0ZXIgPSBjb21wdXRlU2VsQWZ0ZXJDaGFuZ2UoZG9jLCBjaGFuZ2UpO1xuICBhZGRDaGFuZ2VUb0hpc3RvcnkoZG9jLCBjaGFuZ2UsIHNlbEFmdGVyLCBkb2MuY20gPyBkb2MuY20uY3VyT3AuaWQgOiBOYU4pO1xuXG4gIG1ha2VDaGFuZ2VTaW5nbGVEb2MoZG9jLCBjaGFuZ2UsIHNlbEFmdGVyLCBzdHJldGNoU3BhbnNPdmVyQ2hhbmdlKGRvYywgY2hhbmdlKSk7XG4gIHZhciByZWJhc2VkID0gW107XG5cbiAgbGlua2VkRG9jcyhkb2MsIGZ1bmN0aW9uIChkb2MsIHNoYXJlZEhpc3QpIHtcbiAgICBpZiAoIXNoYXJlZEhpc3QgJiYgaW5kZXhPZihyZWJhc2VkLCBkb2MuaGlzdG9yeSkgPT0gLTEpIHtcbiAgICAgIHJlYmFzZUhpc3QoZG9jLmhpc3RvcnksIGNoYW5nZSk7XG4gICAgICByZWJhc2VkLnB1c2goZG9jLmhpc3RvcnkpO1xuICAgIH1cbiAgICBtYWtlQ2hhbmdlU2luZ2xlRG9jKGRvYywgY2hhbmdlLCBudWxsLCBzdHJldGNoU3BhbnNPdmVyQ2hhbmdlKGRvYywgY2hhbmdlKSk7XG4gIH0pO1xufVxuXG4vLyBSZXZlcnQgYSBjaGFuZ2Ugc3RvcmVkIGluIGEgZG9jdW1lbnQncyBoaXN0b3J5LlxuZnVuY3Rpb24gbWFrZUNoYW5nZUZyb21IaXN0b3J5KGRvYywgdHlwZSwgYWxsb3dTZWxlY3Rpb25Pbmx5KSB7XG4gIHZhciBzdXBwcmVzcyA9IGRvYy5jbSAmJiBkb2MuY20uc3RhdGUuc3VwcHJlc3NFZGl0cztcbiAgaWYgKHN1cHByZXNzICYmICFhbGxvd1NlbGVjdGlvbk9ubHkpIHsgcmV0dXJuIH1cblxuICB2YXIgaGlzdCA9IGRvYy5oaXN0b3J5LCBldmVudCwgc2VsQWZ0ZXIgPSBkb2Muc2VsO1xuICB2YXIgc291cmNlID0gdHlwZSA9PSBcInVuZG9cIiA/IGhpc3QuZG9uZSA6IGhpc3QudW5kb25lLCBkZXN0ID0gdHlwZSA9PSBcInVuZG9cIiA/IGhpc3QudW5kb25lIDogaGlzdC5kb25lO1xuXG4gIC8vIFZlcmlmeSB0aGF0IHRoZXJlIGlzIGEgdXNlYWJsZSBldmVudCAoc28gdGhhdCBjdHJsLXogd29uJ3RcbiAgLy8gbmVlZGxlc3NseSBjbGVhciBzZWxlY3Rpb24gZXZlbnRzKVxuICB2YXIgaSA9IDA7XG4gIGZvciAoOyBpIDwgc291cmNlLmxlbmd0aDsgaSsrKSB7XG4gICAgZXZlbnQgPSBzb3VyY2VbaV07XG4gICAgaWYgKGFsbG93U2VsZWN0aW9uT25seSA/IGV2ZW50LnJhbmdlcyAmJiAhZXZlbnQuZXF1YWxzKGRvYy5zZWwpIDogIWV2ZW50LnJhbmdlcylcbiAgICAgIHsgYnJlYWsgfVxuICB9XG4gIGlmIChpID09IHNvdXJjZS5sZW5ndGgpIHsgcmV0dXJuIH1cbiAgaGlzdC5sYXN0T3JpZ2luID0gaGlzdC5sYXN0U2VsT3JpZ2luID0gbnVsbDtcblxuICBmb3IgKDs7KSB7XG4gICAgZXZlbnQgPSBzb3VyY2UucG9wKCk7XG4gICAgaWYgKGV2ZW50LnJhbmdlcykge1xuICAgICAgcHVzaFNlbGVjdGlvblRvSGlzdG9yeShldmVudCwgZGVzdCk7XG4gICAgICBpZiAoYWxsb3dTZWxlY3Rpb25Pbmx5ICYmICFldmVudC5lcXVhbHMoZG9jLnNlbCkpIHtcbiAgICAgICAgc2V0U2VsZWN0aW9uKGRvYywgZXZlbnQsIHtjbGVhclJlZG86IGZhbHNlfSk7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgICAgc2VsQWZ0ZXIgPSBldmVudDtcbiAgICB9IGVsc2UgaWYgKHN1cHByZXNzKSB7XG4gICAgICBzb3VyY2UucHVzaChldmVudCk7XG4gICAgICByZXR1cm5cbiAgICB9IGVsc2UgeyBicmVhayB9XG4gIH1cblxuICAvLyBCdWlsZCB1cCBhIHJldmVyc2UgY2hhbmdlIG9iamVjdCB0byBhZGQgdG8gdGhlIG9wcG9zaXRlIGhpc3RvcnlcbiAgLy8gc3RhY2sgKHJlZG8gd2hlbiB1bmRvaW5nLCBhbmQgdmljZSB2ZXJzYSkuXG4gIHZhciBhbnRpQ2hhbmdlcyA9IFtdO1xuICBwdXNoU2VsZWN0aW9uVG9IaXN0b3J5KHNlbEFmdGVyLCBkZXN0KTtcbiAgZGVzdC5wdXNoKHtjaGFuZ2VzOiBhbnRpQ2hhbmdlcywgZ2VuZXJhdGlvbjogaGlzdC5nZW5lcmF0aW9ufSk7XG4gIGhpc3QuZ2VuZXJhdGlvbiA9IGV2ZW50LmdlbmVyYXRpb24gfHwgKytoaXN0Lm1heEdlbmVyYXRpb247XG5cbiAgdmFyIGZpbHRlciA9IGhhc0hhbmRsZXIoZG9jLCBcImJlZm9yZUNoYW5nZVwiKSB8fCBkb2MuY20gJiYgaGFzSGFuZGxlcihkb2MuY20sIFwiYmVmb3JlQ2hhbmdlXCIpO1xuXG4gIHZhciBsb29wID0gZnVuY3Rpb24gKCBpICkge1xuICAgIHZhciBjaGFuZ2UgPSBldmVudC5jaGFuZ2VzW2ldO1xuICAgIGNoYW5nZS5vcmlnaW4gPSB0eXBlO1xuICAgIGlmIChmaWx0ZXIgJiYgIWZpbHRlckNoYW5nZShkb2MsIGNoYW5nZSwgZmFsc2UpKSB7XG4gICAgICBzb3VyY2UubGVuZ3RoID0gMDtcbiAgICAgIHJldHVybiB7fVxuICAgIH1cblxuICAgIGFudGlDaGFuZ2VzLnB1c2goaGlzdG9yeUNoYW5nZUZyb21DaGFuZ2UoZG9jLCBjaGFuZ2UpKTtcblxuICAgIHZhciBhZnRlciA9IGkgPyBjb21wdXRlU2VsQWZ0ZXJDaGFuZ2UoZG9jLCBjaGFuZ2UpIDogbHN0KHNvdXJjZSk7XG4gICAgbWFrZUNoYW5nZVNpbmdsZURvYyhkb2MsIGNoYW5nZSwgYWZ0ZXIsIG1lcmdlT2xkU3BhbnMoZG9jLCBjaGFuZ2UpKTtcbiAgICBpZiAoIWkgJiYgZG9jLmNtKSB7IGRvYy5jbS5zY3JvbGxJbnRvVmlldyh7ZnJvbTogY2hhbmdlLmZyb20sIHRvOiBjaGFuZ2VFbmQoY2hhbmdlKX0pOyB9XG4gICAgdmFyIHJlYmFzZWQgPSBbXTtcblxuICAgIC8vIFByb3BhZ2F0ZSB0byB0aGUgbGlua2VkIGRvY3VtZW50c1xuICAgIGxpbmtlZERvY3MoZG9jLCBmdW5jdGlvbiAoZG9jLCBzaGFyZWRIaXN0KSB7XG4gICAgICBpZiAoIXNoYXJlZEhpc3QgJiYgaW5kZXhPZihyZWJhc2VkLCBkb2MuaGlzdG9yeSkgPT0gLTEpIHtcbiAgICAgICAgcmViYXNlSGlzdChkb2MuaGlzdG9yeSwgY2hhbmdlKTtcbiAgICAgICAgcmViYXNlZC5wdXNoKGRvYy5oaXN0b3J5KTtcbiAgICAgIH1cbiAgICAgIG1ha2VDaGFuZ2VTaW5nbGVEb2MoZG9jLCBjaGFuZ2UsIG51bGwsIG1lcmdlT2xkU3BhbnMoZG9jLCBjaGFuZ2UpKTtcbiAgICB9KTtcbiAgfTtcblxuICBmb3IgKHZhciBpJDEgPSBldmVudC5jaGFuZ2VzLmxlbmd0aCAtIDE7IGkkMSA+PSAwOyAtLWkkMSkge1xuICAgIHZhciByZXR1cm5lZCA9IGxvb3AoIGkkMSApO1xuXG4gICAgaWYgKCByZXR1cm5lZCApIHJldHVybiByZXR1cm5lZC52O1xuICB9XG59XG5cbi8vIFN1Yi12aWV3cyBuZWVkIHRoZWlyIGxpbmUgbnVtYmVycyBzaGlmdGVkIHdoZW4gdGV4dCBpcyBhZGRlZFxuLy8gYWJvdmUgb3IgYmVsb3cgdGhlbSBpbiB0aGUgcGFyZW50IGRvY3VtZW50LlxuZnVuY3Rpb24gc2hpZnREb2MoZG9jLCBkaXN0YW5jZSkge1xuICBpZiAoZGlzdGFuY2UgPT0gMCkgeyByZXR1cm4gfVxuICBkb2MuZmlyc3QgKz0gZGlzdGFuY2U7XG4gIGRvYy5zZWwgPSBuZXcgU2VsZWN0aW9uKG1hcChkb2Muc2VsLnJhbmdlcywgZnVuY3Rpb24gKHJhbmdlKSB7IHJldHVybiBuZXcgUmFuZ2UoXG4gICAgUG9zKHJhbmdlLmFuY2hvci5saW5lICsgZGlzdGFuY2UsIHJhbmdlLmFuY2hvci5jaCksXG4gICAgUG9zKHJhbmdlLmhlYWQubGluZSArIGRpc3RhbmNlLCByYW5nZS5oZWFkLmNoKVxuICApOyB9KSwgZG9jLnNlbC5wcmltSW5kZXgpO1xuICBpZiAoZG9jLmNtKSB7XG4gICAgcmVnQ2hhbmdlKGRvYy5jbSwgZG9jLmZpcnN0LCBkb2MuZmlyc3QgLSBkaXN0YW5jZSwgZGlzdGFuY2UpO1xuICAgIGZvciAodmFyIGQgPSBkb2MuY20uZGlzcGxheSwgbCA9IGQudmlld0Zyb207IGwgPCBkLnZpZXdUbzsgbCsrKVxuICAgICAgeyByZWdMaW5lQ2hhbmdlKGRvYy5jbSwgbCwgXCJndXR0ZXJcIik7IH1cbiAgfVxufVxuXG4vLyBNb3JlIGxvd2VyLWxldmVsIGNoYW5nZSBmdW5jdGlvbiwgaGFuZGxpbmcgb25seSBhIHNpbmdsZSBkb2N1bWVudFxuLy8gKG5vdCBsaW5rZWQgb25lcykuXG5mdW5jdGlvbiBtYWtlQ2hhbmdlU2luZ2xlRG9jKGRvYywgY2hhbmdlLCBzZWxBZnRlciwgc3BhbnMpIHtcbiAgaWYgKGRvYy5jbSAmJiAhZG9jLmNtLmN1ck9wKVxuICAgIHsgcmV0dXJuIG9wZXJhdGlvbihkb2MuY20sIG1ha2VDaGFuZ2VTaW5nbGVEb2MpKGRvYywgY2hhbmdlLCBzZWxBZnRlciwgc3BhbnMpIH1cblxuICBpZiAoY2hhbmdlLnRvLmxpbmUgPCBkb2MuZmlyc3QpIHtcbiAgICBzaGlmdERvYyhkb2MsIGNoYW5nZS50ZXh0Lmxlbmd0aCAtIDEgLSAoY2hhbmdlLnRvLmxpbmUgLSBjaGFuZ2UuZnJvbS5saW5lKSk7XG4gICAgcmV0dXJuXG4gIH1cbiAgaWYgKGNoYW5nZS5mcm9tLmxpbmUgPiBkb2MubGFzdExpbmUoKSkgeyByZXR1cm4gfVxuXG4gIC8vIENsaXAgdGhlIGNoYW5nZSB0byB0aGUgc2l6ZSBvZiB0aGlzIGRvY1xuICBpZiAoY2hhbmdlLmZyb20ubGluZSA8IGRvYy5maXJzdCkge1xuICAgIHZhciBzaGlmdCA9IGNoYW5nZS50ZXh0Lmxlbmd0aCAtIDEgLSAoZG9jLmZpcnN0IC0gY2hhbmdlLmZyb20ubGluZSk7XG4gICAgc2hpZnREb2MoZG9jLCBzaGlmdCk7XG4gICAgY2hhbmdlID0ge2Zyb206IFBvcyhkb2MuZmlyc3QsIDApLCB0bzogUG9zKGNoYW5nZS50by5saW5lICsgc2hpZnQsIGNoYW5nZS50by5jaCksXG4gICAgICAgICAgICAgIHRleHQ6IFtsc3QoY2hhbmdlLnRleHQpXSwgb3JpZ2luOiBjaGFuZ2Uub3JpZ2lufTtcbiAgfVxuICB2YXIgbGFzdCA9IGRvYy5sYXN0TGluZSgpO1xuICBpZiAoY2hhbmdlLnRvLmxpbmUgPiBsYXN0KSB7XG4gICAgY2hhbmdlID0ge2Zyb206IGNoYW5nZS5mcm9tLCB0bzogUG9zKGxhc3QsIGdldExpbmUoZG9jLCBsYXN0KS50ZXh0Lmxlbmd0aCksXG4gICAgICAgICAgICAgIHRleHQ6IFtjaGFuZ2UudGV4dFswXV0sIG9yaWdpbjogY2hhbmdlLm9yaWdpbn07XG4gIH1cblxuICBjaGFuZ2UucmVtb3ZlZCA9IGdldEJldHdlZW4oZG9jLCBjaGFuZ2UuZnJvbSwgY2hhbmdlLnRvKTtcblxuICBpZiAoIXNlbEFmdGVyKSB7IHNlbEFmdGVyID0gY29tcHV0ZVNlbEFmdGVyQ2hhbmdlKGRvYywgY2hhbmdlKTsgfVxuICBpZiAoZG9jLmNtKSB7IG1ha2VDaGFuZ2VTaW5nbGVEb2NJbkVkaXRvcihkb2MuY20sIGNoYW5nZSwgc3BhbnMpOyB9XG4gIGVsc2UgeyB1cGRhdGVEb2MoZG9jLCBjaGFuZ2UsIHNwYW5zKTsgfVxuICBzZXRTZWxlY3Rpb25Ob1VuZG8oZG9jLCBzZWxBZnRlciwgc2VsX2RvbnRTY3JvbGwpO1xufVxuXG4vLyBIYW5kbGUgdGhlIGludGVyYWN0aW9uIG9mIGEgY2hhbmdlIHRvIGEgZG9jdW1lbnQgd2l0aCB0aGUgZWRpdG9yXG4vLyB0aGF0IHRoaXMgZG9jdW1lbnQgaXMgcGFydCBvZi5cbmZ1bmN0aW9uIG1ha2VDaGFuZ2VTaW5nbGVEb2NJbkVkaXRvcihjbSwgY2hhbmdlLCBzcGFucykge1xuICB2YXIgZG9jID0gY20uZG9jLCBkaXNwbGF5ID0gY20uZGlzcGxheSwgZnJvbSA9IGNoYW5nZS5mcm9tLCB0byA9IGNoYW5nZS50bztcblxuICB2YXIgcmVjb21wdXRlTWF4TGVuZ3RoID0gZmFsc2UsIGNoZWNrV2lkdGhTdGFydCA9IGZyb20ubGluZTtcbiAgaWYgKCFjbS5vcHRpb25zLmxpbmVXcmFwcGluZykge1xuICAgIGNoZWNrV2lkdGhTdGFydCA9IGxpbmVObyh2aXN1YWxMaW5lKGdldExpbmUoZG9jLCBmcm9tLmxpbmUpKSk7XG4gICAgZG9jLml0ZXIoY2hlY2tXaWR0aFN0YXJ0LCB0by5saW5lICsgMSwgZnVuY3Rpb24gKGxpbmUpIHtcbiAgICAgIGlmIChsaW5lID09IGRpc3BsYXkubWF4TGluZSkge1xuICAgICAgICByZWNvbXB1dGVNYXhMZW5ndGggPSB0cnVlO1xuICAgICAgICByZXR1cm4gdHJ1ZVxuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgaWYgKGRvYy5zZWwuY29udGFpbnMoY2hhbmdlLmZyb20sIGNoYW5nZS50bykgPiAtMSlcbiAgICB7IHNpZ25hbEN1cnNvckFjdGl2aXR5KGNtKTsgfVxuXG4gIHVwZGF0ZURvYyhkb2MsIGNoYW5nZSwgc3BhbnMsIGVzdGltYXRlSGVpZ2h0KGNtKSk7XG5cbiAgaWYgKCFjbS5vcHRpb25zLmxpbmVXcmFwcGluZykge1xuICAgIGRvYy5pdGVyKGNoZWNrV2lkdGhTdGFydCwgZnJvbS5saW5lICsgY2hhbmdlLnRleHQubGVuZ3RoLCBmdW5jdGlvbiAobGluZSkge1xuICAgICAgdmFyIGxlbiA9IGxpbmVMZW5ndGgobGluZSk7XG4gICAgICBpZiAobGVuID4gZGlzcGxheS5tYXhMaW5lTGVuZ3RoKSB7XG4gICAgICAgIGRpc3BsYXkubWF4TGluZSA9IGxpbmU7XG4gICAgICAgIGRpc3BsYXkubWF4TGluZUxlbmd0aCA9IGxlbjtcbiAgICAgICAgZGlzcGxheS5tYXhMaW5lQ2hhbmdlZCA9IHRydWU7XG4gICAgICAgIHJlY29tcHV0ZU1heExlbmd0aCA9IGZhbHNlO1xuICAgICAgfVxuICAgIH0pO1xuICAgIGlmIChyZWNvbXB1dGVNYXhMZW5ndGgpIHsgY20uY3VyT3AudXBkYXRlTWF4TGluZSA9IHRydWU7IH1cbiAgfVxuXG4gIHJldHJlYXRGcm9udGllcihkb2MsIGZyb20ubGluZSk7XG4gIHN0YXJ0V29ya2VyKGNtLCA0MDApO1xuXG4gIHZhciBsZW5kaWZmID0gY2hhbmdlLnRleHQubGVuZ3RoIC0gKHRvLmxpbmUgLSBmcm9tLmxpbmUpIC0gMTtcbiAgLy8gUmVtZW1iZXIgdGhhdCB0aGVzZSBsaW5lcyBjaGFuZ2VkLCBmb3IgdXBkYXRpbmcgdGhlIGRpc3BsYXlcbiAgaWYgKGNoYW5nZS5mdWxsKVxuICAgIHsgcmVnQ2hhbmdlKGNtKTsgfVxuICBlbHNlIGlmIChmcm9tLmxpbmUgPT0gdG8ubGluZSAmJiBjaGFuZ2UudGV4dC5sZW5ndGggPT0gMSAmJiAhaXNXaG9sZUxpbmVVcGRhdGUoY20uZG9jLCBjaGFuZ2UpKVxuICAgIHsgcmVnTGluZUNoYW5nZShjbSwgZnJvbS5saW5lLCBcInRleHRcIik7IH1cbiAgZWxzZVxuICAgIHsgcmVnQ2hhbmdlKGNtLCBmcm9tLmxpbmUsIHRvLmxpbmUgKyAxLCBsZW5kaWZmKTsgfVxuXG4gIHZhciBjaGFuZ2VzSGFuZGxlciA9IGhhc0hhbmRsZXIoY20sIFwiY2hhbmdlc1wiKSwgY2hhbmdlSGFuZGxlciA9IGhhc0hhbmRsZXIoY20sIFwiY2hhbmdlXCIpO1xuICBpZiAoY2hhbmdlSGFuZGxlciB8fCBjaGFuZ2VzSGFuZGxlcikge1xuICAgIHZhciBvYmogPSB7XG4gICAgICBmcm9tOiBmcm9tLCB0bzogdG8sXG4gICAgICB0ZXh0OiBjaGFuZ2UudGV4dCxcbiAgICAgIHJlbW92ZWQ6IGNoYW5nZS5yZW1vdmVkLFxuICAgICAgb3JpZ2luOiBjaGFuZ2Uub3JpZ2luXG4gICAgfTtcbiAgICBpZiAoY2hhbmdlSGFuZGxlcikgeyBzaWduYWxMYXRlcihjbSwgXCJjaGFuZ2VcIiwgY20sIG9iaik7IH1cbiAgICBpZiAoY2hhbmdlc0hhbmRsZXIpIHsgKGNtLmN1ck9wLmNoYW5nZU9ianMgfHwgKGNtLmN1ck9wLmNoYW5nZU9ianMgPSBbXSkpLnB1c2gob2JqKTsgfVxuICB9XG4gIGNtLmRpc3BsYXkuc2VsRm9yQ29udGV4dE1lbnUgPSBudWxsO1xufVxuXG5mdW5jdGlvbiByZXBsYWNlUmFuZ2UoZG9jLCBjb2RlLCBmcm9tLCB0bywgb3JpZ2luKSB7XG4gIGlmICghdG8pIHsgdG8gPSBmcm9tOyB9XG4gIGlmIChjbXAodG8sIGZyb20pIDwgMCkgeyB2YXIgYXNzaWduO1xuICAgIChhc3NpZ24gPSBbdG8sIGZyb21dLCBmcm9tID0gYXNzaWduWzBdLCB0byA9IGFzc2lnblsxXSk7IH1cbiAgaWYgKHR5cGVvZiBjb2RlID09IFwic3RyaW5nXCIpIHsgY29kZSA9IGRvYy5zcGxpdExpbmVzKGNvZGUpOyB9XG4gIG1ha2VDaGFuZ2UoZG9jLCB7ZnJvbTogZnJvbSwgdG86IHRvLCB0ZXh0OiBjb2RlLCBvcmlnaW46IG9yaWdpbn0pO1xufVxuXG4vLyBSZWJhc2luZy9yZXNldHRpbmcgaGlzdG9yeSB0byBkZWFsIHdpdGggZXh0ZXJuYWxseS1zb3VyY2VkIGNoYW5nZXNcblxuZnVuY3Rpb24gcmViYXNlSGlzdFNlbFNpbmdsZShwb3MsIGZyb20sIHRvLCBkaWZmKSB7XG4gIGlmICh0byA8IHBvcy5saW5lKSB7XG4gICAgcG9zLmxpbmUgKz0gZGlmZjtcbiAgfSBlbHNlIGlmIChmcm9tIDwgcG9zLmxpbmUpIHtcbiAgICBwb3MubGluZSA9IGZyb207XG4gICAgcG9zLmNoID0gMDtcbiAgfVxufVxuXG4vLyBUcmllcyB0byByZWJhc2UgYW4gYXJyYXkgb2YgaGlzdG9yeSBldmVudHMgZ2l2ZW4gYSBjaGFuZ2UgaW4gdGhlXG4vLyBkb2N1bWVudC4gSWYgdGhlIGNoYW5nZSB0b3VjaGVzIHRoZSBzYW1lIGxpbmVzIGFzIHRoZSBldmVudCwgdGhlXG4vLyBldmVudCwgYW5kIGV2ZXJ5dGhpbmcgJ2JlaGluZCcgaXQsIGlzIGRpc2NhcmRlZC4gSWYgdGhlIGNoYW5nZSBpc1xuLy8gYmVmb3JlIHRoZSBldmVudCwgdGhlIGV2ZW50J3MgcG9zaXRpb25zIGFyZSB1cGRhdGVkLiBVc2VzIGFcbi8vIGNvcHktb24td3JpdGUgc2NoZW1lIGZvciB0aGUgcG9zaXRpb25zLCB0byBhdm9pZCBoYXZpbmcgdG9cbi8vIHJlYWxsb2NhdGUgdGhlbSBhbGwgb24gZXZlcnkgcmViYXNlLCBidXQgYWxzbyBhdm9pZCBwcm9ibGVtcyB3aXRoXG4vLyBzaGFyZWQgcG9zaXRpb24gb2JqZWN0cyBiZWluZyB1bnNhZmVseSB1cGRhdGVkLlxuZnVuY3Rpb24gcmViYXNlSGlzdEFycmF5KGFycmF5LCBmcm9tLCB0bywgZGlmZikge1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGFycmF5Lmxlbmd0aDsgKytpKSB7XG4gICAgdmFyIHN1YiA9IGFycmF5W2ldLCBvayA9IHRydWU7XG4gICAgaWYgKHN1Yi5yYW5nZXMpIHtcbiAgICAgIGlmICghc3ViLmNvcGllZCkgeyBzdWIgPSBhcnJheVtpXSA9IHN1Yi5kZWVwQ29weSgpOyBzdWIuY29waWVkID0gdHJ1ZTsgfVxuICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBzdWIucmFuZ2VzLmxlbmd0aDsgaisrKSB7XG4gICAgICAgIHJlYmFzZUhpc3RTZWxTaW5nbGUoc3ViLnJhbmdlc1tqXS5hbmNob3IsIGZyb20sIHRvLCBkaWZmKTtcbiAgICAgICAgcmViYXNlSGlzdFNlbFNpbmdsZShzdWIucmFuZ2VzW2pdLmhlYWQsIGZyb20sIHRvLCBkaWZmKTtcbiAgICAgIH1cbiAgICAgIGNvbnRpbnVlXG4gICAgfVxuICAgIGZvciAodmFyIGokMSA9IDA7IGokMSA8IHN1Yi5jaGFuZ2VzLmxlbmd0aDsgKytqJDEpIHtcbiAgICAgIHZhciBjdXIgPSBzdWIuY2hhbmdlc1tqJDFdO1xuICAgICAgaWYgKHRvIDwgY3VyLmZyb20ubGluZSkge1xuICAgICAgICBjdXIuZnJvbSA9IFBvcyhjdXIuZnJvbS5saW5lICsgZGlmZiwgY3VyLmZyb20uY2gpO1xuICAgICAgICBjdXIudG8gPSBQb3MoY3VyLnRvLmxpbmUgKyBkaWZmLCBjdXIudG8uY2gpO1xuICAgICAgfSBlbHNlIGlmIChmcm9tIDw9IGN1ci50by5saW5lKSB7XG4gICAgICAgIG9rID0gZmFsc2U7XG4gICAgICAgIGJyZWFrXG4gICAgICB9XG4gICAgfVxuICAgIGlmICghb2spIHtcbiAgICAgIGFycmF5LnNwbGljZSgwLCBpICsgMSk7XG4gICAgICBpID0gMDtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gcmViYXNlSGlzdChoaXN0LCBjaGFuZ2UpIHtcbiAgdmFyIGZyb20gPSBjaGFuZ2UuZnJvbS5saW5lLCB0byA9IGNoYW5nZS50by5saW5lLCBkaWZmID0gY2hhbmdlLnRleHQubGVuZ3RoIC0gKHRvIC0gZnJvbSkgLSAxO1xuICByZWJhc2VIaXN0QXJyYXkoaGlzdC5kb25lLCBmcm9tLCB0bywgZGlmZik7XG4gIHJlYmFzZUhpc3RBcnJheShoaXN0LnVuZG9uZSwgZnJvbSwgdG8sIGRpZmYpO1xufVxuXG4vLyBVdGlsaXR5IGZvciBhcHBseWluZyBhIGNoYW5nZSB0byBhIGxpbmUgYnkgaGFuZGxlIG9yIG51bWJlcixcbi8vIHJldHVybmluZyB0aGUgbnVtYmVyIGFuZCBvcHRpb25hbGx5IHJlZ2lzdGVyaW5nIHRoZSBsaW5lIGFzXG4vLyBjaGFuZ2VkLlxuZnVuY3Rpb24gY2hhbmdlTGluZShkb2MsIGhhbmRsZSwgY2hhbmdlVHlwZSwgb3ApIHtcbiAgdmFyIG5vID0gaGFuZGxlLCBsaW5lID0gaGFuZGxlO1xuICBpZiAodHlwZW9mIGhhbmRsZSA9PSBcIm51bWJlclwiKSB7IGxpbmUgPSBnZXRMaW5lKGRvYywgY2xpcExpbmUoZG9jLCBoYW5kbGUpKTsgfVxuICBlbHNlIHsgbm8gPSBsaW5lTm8oaGFuZGxlKTsgfVxuICBpZiAobm8gPT0gbnVsbCkgeyByZXR1cm4gbnVsbCB9XG4gIGlmIChvcChsaW5lLCBubykgJiYgZG9jLmNtKSB7IHJlZ0xpbmVDaGFuZ2UoZG9jLmNtLCBubywgY2hhbmdlVHlwZSk7IH1cbiAgcmV0dXJuIGxpbmVcbn1cblxuLy8gVGhlIGRvY3VtZW50IGlzIHJlcHJlc2VudGVkIGFzIGEgQlRyZWUgY29uc2lzdGluZyBvZiBsZWF2ZXMsIHdpdGhcbi8vIGNodW5rIG9mIGxpbmVzIGluIHRoZW0sIGFuZCBicmFuY2hlcywgd2l0aCB1cCB0byB0ZW4gbGVhdmVzIG9yXG4vLyBvdGhlciBicmFuY2ggbm9kZXMgYmVsb3cgdGhlbS4gVGhlIHRvcCBub2RlIGlzIGFsd2F5cyBhIGJyYW5jaFxuLy8gbm9kZSwgYW5kIGlzIHRoZSBkb2N1bWVudCBvYmplY3QgaXRzZWxmIChtZWFuaW5nIGl0IGhhc1xuLy8gYWRkaXRpb25hbCBtZXRob2RzIGFuZCBwcm9wZXJ0aWVzKS5cbi8vXG4vLyBBbGwgbm9kZXMgaGF2ZSBwYXJlbnQgbGlua3MuIFRoZSB0cmVlIGlzIHVzZWQgYm90aCB0byBnbyBmcm9tXG4vLyBsaW5lIG51bWJlcnMgdG8gbGluZSBvYmplY3RzLCBhbmQgdG8gZ28gZnJvbSBvYmplY3RzIHRvIG51bWJlcnMuXG4vLyBJdCBhbHNvIGluZGV4ZXMgYnkgaGVpZ2h0LCBhbmQgaXMgdXNlZCB0byBjb252ZXJ0IGJldHdlZW4gaGVpZ2h0XG4vLyBhbmQgbGluZSBvYmplY3QsIGFuZCB0byBmaW5kIHRoZSB0b3RhbCBoZWlnaHQgb2YgdGhlIGRvY3VtZW50LlxuLy9cbi8vIFNlZSBhbHNvIGh0dHA6Ly9tYXJpam5oYXZlcmJla2UubmwvYmxvZy9jb2RlbWlycm9yLWxpbmUtdHJlZS5odG1sXG5cbmZ1bmN0aW9uIExlYWZDaHVuayhsaW5lcykge1xuICB2YXIgdGhpcyQxID0gdGhpcztcblxuICB0aGlzLmxpbmVzID0gbGluZXM7XG4gIHRoaXMucGFyZW50ID0gbnVsbDtcbiAgdmFyIGhlaWdodCA9IDA7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGluZXMubGVuZ3RoOyArK2kpIHtcbiAgICBsaW5lc1tpXS5wYXJlbnQgPSB0aGlzJDE7XG4gICAgaGVpZ2h0ICs9IGxpbmVzW2ldLmhlaWdodDtcbiAgfVxuICB0aGlzLmhlaWdodCA9IGhlaWdodDtcbn1cblxuTGVhZkNodW5rLnByb3RvdHlwZSA9IHtcbiAgY2h1bmtTaXplOiBmdW5jdGlvbigpIHsgcmV0dXJuIHRoaXMubGluZXMubGVuZ3RoIH0sXG5cbiAgLy8gUmVtb3ZlIHRoZSBuIGxpbmVzIGF0IG9mZnNldCAnYXQnLlxuICByZW1vdmVJbm5lcjogZnVuY3Rpb24oYXQsIG4pIHtcbiAgICB2YXIgdGhpcyQxID0gdGhpcztcblxuICAgIGZvciAodmFyIGkgPSBhdCwgZSA9IGF0ICsgbjsgaSA8IGU7ICsraSkge1xuICAgICAgdmFyIGxpbmUgPSB0aGlzJDEubGluZXNbaV07XG4gICAgICB0aGlzJDEuaGVpZ2h0IC09IGxpbmUuaGVpZ2h0O1xuICAgICAgY2xlYW5VcExpbmUobGluZSk7XG4gICAgICBzaWduYWxMYXRlcihsaW5lLCBcImRlbGV0ZVwiKTtcbiAgICB9XG4gICAgdGhpcy5saW5lcy5zcGxpY2UoYXQsIG4pO1xuICB9LFxuXG4gIC8vIEhlbHBlciB1c2VkIHRvIGNvbGxhcHNlIGEgc21hbGwgYnJhbmNoIGludG8gYSBzaW5nbGUgbGVhZi5cbiAgY29sbGFwc2U6IGZ1bmN0aW9uKGxpbmVzKSB7XG4gICAgbGluZXMucHVzaC5hcHBseShsaW5lcywgdGhpcy5saW5lcyk7XG4gIH0sXG5cbiAgLy8gSW5zZXJ0IHRoZSBnaXZlbiBhcnJheSBvZiBsaW5lcyBhdCBvZmZzZXQgJ2F0JywgY291bnQgdGhlbSBhc1xuICAvLyBoYXZpbmcgdGhlIGdpdmVuIGhlaWdodC5cbiAgaW5zZXJ0SW5uZXI6IGZ1bmN0aW9uKGF0LCBsaW5lcywgaGVpZ2h0KSB7XG4gICAgdmFyIHRoaXMkMSA9IHRoaXM7XG5cbiAgICB0aGlzLmhlaWdodCArPSBoZWlnaHQ7XG4gICAgdGhpcy5saW5lcyA9IHRoaXMubGluZXMuc2xpY2UoMCwgYXQpLmNvbmNhdChsaW5lcykuY29uY2F0KHRoaXMubGluZXMuc2xpY2UoYXQpKTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxpbmVzLmxlbmd0aDsgKytpKSB7IGxpbmVzW2ldLnBhcmVudCA9IHRoaXMkMTsgfVxuICB9LFxuXG4gIC8vIFVzZWQgdG8gaXRlcmF0ZSBvdmVyIGEgcGFydCBvZiB0aGUgdHJlZS5cbiAgaXRlck46IGZ1bmN0aW9uKGF0LCBuLCBvcCkge1xuICAgIHZhciB0aGlzJDEgPSB0aGlzO1xuXG4gICAgZm9yICh2YXIgZSA9IGF0ICsgbjsgYXQgPCBlOyArK2F0KVxuICAgICAgeyBpZiAob3AodGhpcyQxLmxpbmVzW2F0XSkpIHsgcmV0dXJuIHRydWUgfSB9XG4gIH1cbn07XG5cbmZ1bmN0aW9uIEJyYW5jaENodW5rKGNoaWxkcmVuKSB7XG4gIHZhciB0aGlzJDEgPSB0aGlzO1xuXG4gIHRoaXMuY2hpbGRyZW4gPSBjaGlsZHJlbjtcbiAgdmFyIHNpemUgPSAwLCBoZWlnaHQgPSAwO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGNoaWxkcmVuLmxlbmd0aDsgKytpKSB7XG4gICAgdmFyIGNoID0gY2hpbGRyZW5baV07XG4gICAgc2l6ZSArPSBjaC5jaHVua1NpemUoKTsgaGVpZ2h0ICs9IGNoLmhlaWdodDtcbiAgICBjaC5wYXJlbnQgPSB0aGlzJDE7XG4gIH1cbiAgdGhpcy5zaXplID0gc2l6ZTtcbiAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG4gIHRoaXMucGFyZW50ID0gbnVsbDtcbn1cblxuQnJhbmNoQ2h1bmsucHJvdG90eXBlID0ge1xuICBjaHVua1NpemU6IGZ1bmN0aW9uKCkgeyByZXR1cm4gdGhpcy5zaXplIH0sXG5cbiAgcmVtb3ZlSW5uZXI6IGZ1bmN0aW9uKGF0LCBuKSB7XG4gICAgdmFyIHRoaXMkMSA9IHRoaXM7XG5cbiAgICB0aGlzLnNpemUgLT0gbjtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMuY2hpbGRyZW4ubGVuZ3RoOyArK2kpIHtcbiAgICAgIHZhciBjaGlsZCA9IHRoaXMkMS5jaGlsZHJlbltpXSwgc3ogPSBjaGlsZC5jaHVua1NpemUoKTtcbiAgICAgIGlmIChhdCA8IHN6KSB7XG4gICAgICAgIHZhciBybSA9IE1hdGgubWluKG4sIHN6IC0gYXQpLCBvbGRIZWlnaHQgPSBjaGlsZC5oZWlnaHQ7XG4gICAgICAgIGNoaWxkLnJlbW92ZUlubmVyKGF0LCBybSk7XG4gICAgICAgIHRoaXMkMS5oZWlnaHQgLT0gb2xkSGVpZ2h0IC0gY2hpbGQuaGVpZ2h0O1xuICAgICAgICBpZiAoc3ogPT0gcm0pIHsgdGhpcyQxLmNoaWxkcmVuLnNwbGljZShpLS0sIDEpOyBjaGlsZC5wYXJlbnQgPSBudWxsOyB9XG4gICAgICAgIGlmICgobiAtPSBybSkgPT0gMCkgeyBicmVhayB9XG4gICAgICAgIGF0ID0gMDtcbiAgICAgIH0gZWxzZSB7IGF0IC09IHN6OyB9XG4gICAgfVxuICAgIC8vIElmIHRoZSByZXN1bHQgaXMgc21hbGxlciB0aGFuIDI1IGxpbmVzLCBlbnN1cmUgdGhhdCBpdCBpcyBhXG4gICAgLy8gc2luZ2xlIGxlYWYgbm9kZS5cbiAgICBpZiAodGhpcy5zaXplIC0gbiA8IDI1ICYmXG4gICAgICAgICh0aGlzLmNoaWxkcmVuLmxlbmd0aCA+IDEgfHwgISh0aGlzLmNoaWxkcmVuWzBdIGluc3RhbmNlb2YgTGVhZkNodW5rKSkpIHtcbiAgICAgIHZhciBsaW5lcyA9IFtdO1xuICAgICAgdGhpcy5jb2xsYXBzZShsaW5lcyk7XG4gICAgICB0aGlzLmNoaWxkcmVuID0gW25ldyBMZWFmQ2h1bmsobGluZXMpXTtcbiAgICAgIHRoaXMuY2hpbGRyZW5bMF0ucGFyZW50ID0gdGhpcztcbiAgICB9XG4gIH0sXG5cbiAgY29sbGFwc2U6IGZ1bmN0aW9uKGxpbmVzKSB7XG4gICAgdmFyIHRoaXMkMSA9IHRoaXM7XG5cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMuY2hpbGRyZW4ubGVuZ3RoOyArK2kpIHsgdGhpcyQxLmNoaWxkcmVuW2ldLmNvbGxhcHNlKGxpbmVzKTsgfVxuICB9LFxuXG4gIGluc2VydElubmVyOiBmdW5jdGlvbihhdCwgbGluZXMsIGhlaWdodCkge1xuICAgIHZhciB0aGlzJDEgPSB0aGlzO1xuXG4gICAgdGhpcy5zaXplICs9IGxpbmVzLmxlbmd0aDtcbiAgICB0aGlzLmhlaWdodCArPSBoZWlnaHQ7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLmNoaWxkcmVuLmxlbmd0aDsgKytpKSB7XG4gICAgICB2YXIgY2hpbGQgPSB0aGlzJDEuY2hpbGRyZW5baV0sIHN6ID0gY2hpbGQuY2h1bmtTaXplKCk7XG4gICAgICBpZiAoYXQgPD0gc3opIHtcbiAgICAgICAgY2hpbGQuaW5zZXJ0SW5uZXIoYXQsIGxpbmVzLCBoZWlnaHQpO1xuICAgICAgICBpZiAoY2hpbGQubGluZXMgJiYgY2hpbGQubGluZXMubGVuZ3RoID4gNTApIHtcbiAgICAgICAgICAvLyBUbyBhdm9pZCBtZW1vcnkgdGhyYXNoaW5nIHdoZW4gY2hpbGQubGluZXMgaXMgaHVnZSAoZS5nLiBmaXJzdCB2aWV3IG9mIGEgbGFyZ2UgZmlsZSksIGl0J3MgbmV2ZXIgc3BsaWNlZC5cbiAgICAgICAgICAvLyBJbnN0ZWFkLCBzbWFsbCBzbGljZXMgYXJlIHRha2VuLiBUaGV5J3JlIHRha2VuIGluIG9yZGVyIGJlY2F1c2Ugc2VxdWVudGlhbCBtZW1vcnkgYWNjZXNzZXMgYXJlIGZhc3Rlc3QuXG4gICAgICAgICAgdmFyIHJlbWFpbmluZyA9IGNoaWxkLmxpbmVzLmxlbmd0aCAlIDI1ICsgMjU7XG4gICAgICAgICAgZm9yICh2YXIgcG9zID0gcmVtYWluaW5nOyBwb3MgPCBjaGlsZC5saW5lcy5sZW5ndGg7KSB7XG4gICAgICAgICAgICB2YXIgbGVhZiA9IG5ldyBMZWFmQ2h1bmsoY2hpbGQubGluZXMuc2xpY2UocG9zLCBwb3MgKz0gMjUpKTtcbiAgICAgICAgICAgIGNoaWxkLmhlaWdodCAtPSBsZWFmLmhlaWdodDtcbiAgICAgICAgICAgIHRoaXMkMS5jaGlsZHJlbi5zcGxpY2UoKytpLCAwLCBsZWFmKTtcbiAgICAgICAgICAgIGxlYWYucGFyZW50ID0gdGhpcyQxO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjaGlsZC5saW5lcyA9IGNoaWxkLmxpbmVzLnNsaWNlKDAsIHJlbWFpbmluZyk7XG4gICAgICAgICAgdGhpcyQxLm1heWJlU3BpbGwoKTtcbiAgICAgICAgfVxuICAgICAgICBicmVha1xuICAgICAgfVxuICAgICAgYXQgLT0gc3o7XG4gICAgfVxuICB9LFxuXG4gIC8vIFdoZW4gYSBub2RlIGhhcyBncm93biwgY2hlY2sgd2hldGhlciBpdCBzaG91bGQgYmUgc3BsaXQuXG4gIG1heWJlU3BpbGw6IGZ1bmN0aW9uKCkge1xuICAgIGlmICh0aGlzLmNoaWxkcmVuLmxlbmd0aCA8PSAxMCkgeyByZXR1cm4gfVxuICAgIHZhciBtZSA9IHRoaXM7XG4gICAgZG8ge1xuICAgICAgdmFyIHNwaWxsZWQgPSBtZS5jaGlsZHJlbi5zcGxpY2UobWUuY2hpbGRyZW4ubGVuZ3RoIC0gNSwgNSk7XG4gICAgICB2YXIgc2libGluZyA9IG5ldyBCcmFuY2hDaHVuayhzcGlsbGVkKTtcbiAgICAgIGlmICghbWUucGFyZW50KSB7IC8vIEJlY29tZSB0aGUgcGFyZW50IG5vZGVcbiAgICAgICAgdmFyIGNvcHkgPSBuZXcgQnJhbmNoQ2h1bmsobWUuY2hpbGRyZW4pO1xuICAgICAgICBjb3B5LnBhcmVudCA9IG1lO1xuICAgICAgICBtZS5jaGlsZHJlbiA9IFtjb3B5LCBzaWJsaW5nXTtcbiAgICAgICAgbWUgPSBjb3B5O1xuICAgICB9IGVsc2Uge1xuICAgICAgICBtZS5zaXplIC09IHNpYmxpbmcuc2l6ZTtcbiAgICAgICAgbWUuaGVpZ2h0IC09IHNpYmxpbmcuaGVpZ2h0O1xuICAgICAgICB2YXIgbXlJbmRleCA9IGluZGV4T2YobWUucGFyZW50LmNoaWxkcmVuLCBtZSk7XG4gICAgICAgIG1lLnBhcmVudC5jaGlsZHJlbi5zcGxpY2UobXlJbmRleCArIDEsIDAsIHNpYmxpbmcpO1xuICAgICAgfVxuICAgICAgc2libGluZy5wYXJlbnQgPSBtZS5wYXJlbnQ7XG4gICAgfSB3aGlsZSAobWUuY2hpbGRyZW4ubGVuZ3RoID4gMTApXG4gICAgbWUucGFyZW50Lm1heWJlU3BpbGwoKTtcbiAgfSxcblxuICBpdGVyTjogZnVuY3Rpb24oYXQsIG4sIG9wKSB7XG4gICAgdmFyIHRoaXMkMSA9IHRoaXM7XG5cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMuY2hpbGRyZW4ubGVuZ3RoOyArK2kpIHtcbiAgICAgIHZhciBjaGlsZCA9IHRoaXMkMS5jaGlsZHJlbltpXSwgc3ogPSBjaGlsZC5jaHVua1NpemUoKTtcbiAgICAgIGlmIChhdCA8IHN6KSB7XG4gICAgICAgIHZhciB1c2VkID0gTWF0aC5taW4obiwgc3ogLSBhdCk7XG4gICAgICAgIGlmIChjaGlsZC5pdGVyTihhdCwgdXNlZCwgb3ApKSB7IHJldHVybiB0cnVlIH1cbiAgICAgICAgaWYgKChuIC09IHVzZWQpID09IDApIHsgYnJlYWsgfVxuICAgICAgICBhdCA9IDA7XG4gICAgICB9IGVsc2UgeyBhdCAtPSBzejsgfVxuICAgIH1cbiAgfVxufTtcblxuLy8gTGluZSB3aWRnZXRzIGFyZSBibG9jayBlbGVtZW50cyBkaXNwbGF5ZWQgYWJvdmUgb3IgYmVsb3cgYSBsaW5lLlxuXG52YXIgTGluZVdpZGdldCA9IGZ1bmN0aW9uKGRvYywgbm9kZSwgb3B0aW9ucykge1xuICB2YXIgdGhpcyQxID0gdGhpcztcblxuICBpZiAob3B0aW9ucykgeyBmb3IgKHZhciBvcHQgaW4gb3B0aW9ucykgeyBpZiAob3B0aW9ucy5oYXNPd25Qcm9wZXJ0eShvcHQpKVxuICAgIHsgdGhpcyQxW29wdF0gPSBvcHRpb25zW29wdF07IH0gfSB9XG4gIHRoaXMuZG9jID0gZG9jO1xuICB0aGlzLm5vZGUgPSBub2RlO1xufTtcblxuTGluZVdpZGdldC5wcm90b3R5cGUuY2xlYXIgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHRoaXMkMSA9IHRoaXM7XG5cbiAgdmFyIGNtID0gdGhpcy5kb2MuY20sIHdzID0gdGhpcy5saW5lLndpZGdldHMsIGxpbmUgPSB0aGlzLmxpbmUsIG5vID0gbGluZU5vKGxpbmUpO1xuICBpZiAobm8gPT0gbnVsbCB8fCAhd3MpIHsgcmV0dXJuIH1cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCB3cy5sZW5ndGg7ICsraSkgeyBpZiAod3NbaV0gPT0gdGhpcyQxKSB7IHdzLnNwbGljZShpLS0sIDEpOyB9IH1cbiAgaWYgKCF3cy5sZW5ndGgpIHsgbGluZS53aWRnZXRzID0gbnVsbDsgfVxuICB2YXIgaGVpZ2h0ID0gd2lkZ2V0SGVpZ2h0KHRoaXMpO1xuICB1cGRhdGVMaW5lSGVpZ2h0KGxpbmUsIE1hdGgubWF4KDAsIGxpbmUuaGVpZ2h0IC0gaGVpZ2h0KSk7XG4gIGlmIChjbSkge1xuICAgIHJ1bkluT3AoY20sIGZ1bmN0aW9uICgpIHtcbiAgICAgIGFkanVzdFNjcm9sbFdoZW5BYm92ZVZpc2libGUoY20sIGxpbmUsIC1oZWlnaHQpO1xuICAgICAgcmVnTGluZUNoYW5nZShjbSwgbm8sIFwid2lkZ2V0XCIpO1xuICAgIH0pO1xuICAgIHNpZ25hbExhdGVyKGNtLCBcImxpbmVXaWRnZXRDbGVhcmVkXCIsIGNtLCB0aGlzLCBubyk7XG4gIH1cbn07XG5cbkxpbmVXaWRnZXQucHJvdG90eXBlLmNoYW5nZWQgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHRoaXMkMSA9IHRoaXM7XG5cbiAgdmFyIG9sZEggPSB0aGlzLmhlaWdodCwgY20gPSB0aGlzLmRvYy5jbSwgbGluZSA9IHRoaXMubGluZTtcbiAgdGhpcy5oZWlnaHQgPSBudWxsO1xuICB2YXIgZGlmZiA9IHdpZGdldEhlaWdodCh0aGlzKSAtIG9sZEg7XG4gIGlmICghZGlmZikgeyByZXR1cm4gfVxuICB1cGRhdGVMaW5lSGVpZ2h0KGxpbmUsIGxpbmUuaGVpZ2h0ICsgZGlmZik7XG4gIGlmIChjbSkge1xuICAgIHJ1bkluT3AoY20sIGZ1bmN0aW9uICgpIHtcbiAgICAgIGNtLmN1ck9wLmZvcmNlVXBkYXRlID0gdHJ1ZTtcbiAgICAgIGFkanVzdFNjcm9sbFdoZW5BYm92ZVZpc2libGUoY20sIGxpbmUsIGRpZmYpO1xuICAgICAgc2lnbmFsTGF0ZXIoY20sIFwibGluZVdpZGdldENoYW5nZWRcIiwgY20sIHRoaXMkMSwgbGluZU5vKGxpbmUpKTtcbiAgICB9KTtcbiAgfVxufTtcbmV2ZW50TWl4aW4oTGluZVdpZGdldCk7XG5cbmZ1bmN0aW9uIGFkanVzdFNjcm9sbFdoZW5BYm92ZVZpc2libGUoY20sIGxpbmUsIGRpZmYpIHtcbiAgaWYgKGhlaWdodEF0TGluZShsaW5lKSA8ICgoY20uY3VyT3AgJiYgY20uY3VyT3Auc2Nyb2xsVG9wKSB8fCBjbS5kb2Muc2Nyb2xsVG9wKSlcbiAgICB7IGFkZFRvU2Nyb2xsVG9wKGNtLCBkaWZmKTsgfVxufVxuXG5mdW5jdGlvbiBhZGRMaW5lV2lkZ2V0KGRvYywgaGFuZGxlLCBub2RlLCBvcHRpb25zKSB7XG4gIHZhciB3aWRnZXQgPSBuZXcgTGluZVdpZGdldChkb2MsIG5vZGUsIG9wdGlvbnMpO1xuICB2YXIgY20gPSBkb2MuY207XG4gIGlmIChjbSAmJiB3aWRnZXQubm9IU2Nyb2xsKSB7IGNtLmRpc3BsYXkuYWxpZ25XaWRnZXRzID0gdHJ1ZTsgfVxuICBjaGFuZ2VMaW5lKGRvYywgaGFuZGxlLCBcIndpZGdldFwiLCBmdW5jdGlvbiAobGluZSkge1xuICAgIHZhciB3aWRnZXRzID0gbGluZS53aWRnZXRzIHx8IChsaW5lLndpZGdldHMgPSBbXSk7XG4gICAgaWYgKHdpZGdldC5pbnNlcnRBdCA9PSBudWxsKSB7IHdpZGdldHMucHVzaCh3aWRnZXQpOyB9XG4gICAgZWxzZSB7IHdpZGdldHMuc3BsaWNlKE1hdGgubWluKHdpZGdldHMubGVuZ3RoIC0gMSwgTWF0aC5tYXgoMCwgd2lkZ2V0Lmluc2VydEF0KSksIDAsIHdpZGdldCk7IH1cbiAgICB3aWRnZXQubGluZSA9IGxpbmU7XG4gICAgaWYgKGNtICYmICFsaW5lSXNIaWRkZW4oZG9jLCBsaW5lKSkge1xuICAgICAgdmFyIGFib3ZlVmlzaWJsZSA9IGhlaWdodEF0TGluZShsaW5lKSA8IGRvYy5zY3JvbGxUb3A7XG4gICAgICB1cGRhdGVMaW5lSGVpZ2h0KGxpbmUsIGxpbmUuaGVpZ2h0ICsgd2lkZ2V0SGVpZ2h0KHdpZGdldCkpO1xuICAgICAgaWYgKGFib3ZlVmlzaWJsZSkgeyBhZGRUb1Njcm9sbFRvcChjbSwgd2lkZ2V0LmhlaWdodCk7IH1cbiAgICAgIGNtLmN1ck9wLmZvcmNlVXBkYXRlID0gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIHRydWVcbiAgfSk7XG4gIGlmIChjbSkgeyBzaWduYWxMYXRlcihjbSwgXCJsaW5lV2lkZ2V0QWRkZWRcIiwgY20sIHdpZGdldCwgdHlwZW9mIGhhbmRsZSA9PSBcIm51bWJlclwiID8gaGFuZGxlIDogbGluZU5vKGhhbmRsZSkpOyB9XG4gIHJldHVybiB3aWRnZXRcbn1cblxuLy8gVEVYVE1BUktFUlNcblxuLy8gQ3JlYXRlZCB3aXRoIG1hcmtUZXh0IGFuZCBzZXRCb29rbWFyayBtZXRob2RzLiBBIFRleHRNYXJrZXIgaXMgYVxuLy8gaGFuZGxlIHRoYXQgY2FuIGJlIHVzZWQgdG8gY2xlYXIgb3IgZmluZCBhIG1hcmtlZCBwb3NpdGlvbiBpbiB0aGVcbi8vIGRvY3VtZW50LiBMaW5lIG9iamVjdHMgaG9sZCBhcnJheXMgKG1hcmtlZFNwYW5zKSBjb250YWluaW5nXG4vLyB7ZnJvbSwgdG8sIG1hcmtlcn0gb2JqZWN0IHBvaW50aW5nIHRvIHN1Y2ggbWFya2VyIG9iamVjdHMsIGFuZFxuLy8gaW5kaWNhdGluZyB0aGF0IHN1Y2ggYSBtYXJrZXIgaXMgcHJlc2VudCBvbiB0aGF0IGxpbmUuIE11bHRpcGxlXG4vLyBsaW5lcyBtYXkgcG9pbnQgdG8gdGhlIHNhbWUgbWFya2VyIHdoZW4gaXQgc3BhbnMgYWNyb3NzIGxpbmVzLlxuLy8gVGhlIHNwYW5zIHdpbGwgaGF2ZSBudWxsIGZvciB0aGVpciBmcm9tL3RvIHByb3BlcnRpZXMgd2hlbiB0aGVcbi8vIG1hcmtlciBjb250aW51ZXMgYmV5b25kIHRoZSBzdGFydC9lbmQgb2YgdGhlIGxpbmUuIE1hcmtlcnMgaGF2ZVxuLy8gbGlua3MgYmFjayB0byB0aGUgbGluZXMgdGhleSBjdXJyZW50bHkgdG91Y2guXG5cbi8vIENvbGxhcHNlZCBtYXJrZXJzIGhhdmUgdW5pcXVlIGlkcywgaW4gb3JkZXIgdG8gYmUgYWJsZSB0byBvcmRlclxuLy8gdGhlbSwgd2hpY2ggaXMgbmVlZGVkIGZvciB1bmlxdWVseSBkZXRlcm1pbmluZyBhbiBvdXRlciBtYXJrZXJcbi8vIHdoZW4gdGhleSBvdmVybGFwICh0aGV5IG1heSBuZXN0LCBidXQgbm90IHBhcnRpYWxseSBvdmVybGFwKS5cbnZhciBuZXh0TWFya2VySWQgPSAwO1xuXG52YXIgVGV4dE1hcmtlciA9IGZ1bmN0aW9uKGRvYywgdHlwZSkge1xuICB0aGlzLmxpbmVzID0gW107XG4gIHRoaXMudHlwZSA9IHR5cGU7XG4gIHRoaXMuZG9jID0gZG9jO1xuICB0aGlzLmlkID0gKytuZXh0TWFya2VySWQ7XG59O1xuXG4vLyBDbGVhciB0aGUgbWFya2VyLlxuVGV4dE1hcmtlci5wcm90b3R5cGUuY2xlYXIgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHRoaXMkMSA9IHRoaXM7XG5cbiAgaWYgKHRoaXMuZXhwbGljaXRseUNsZWFyZWQpIHsgcmV0dXJuIH1cbiAgdmFyIGNtID0gdGhpcy5kb2MuY20sIHdpdGhPcCA9IGNtICYmICFjbS5jdXJPcDtcbiAgaWYgKHdpdGhPcCkgeyBzdGFydE9wZXJhdGlvbihjbSk7IH1cbiAgaWYgKGhhc0hhbmRsZXIodGhpcywgXCJjbGVhclwiKSkge1xuICAgIHZhciBmb3VuZCA9IHRoaXMuZmluZCgpO1xuICAgIGlmIChmb3VuZCkgeyBzaWduYWxMYXRlcih0aGlzLCBcImNsZWFyXCIsIGZvdW5kLmZyb20sIGZvdW5kLnRvKTsgfVxuICB9XG4gIHZhciBtaW4gPSBudWxsLCBtYXggPSBudWxsO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMubGluZXMubGVuZ3RoOyArK2kpIHtcbiAgICB2YXIgbGluZSA9IHRoaXMkMS5saW5lc1tpXTtcbiAgICB2YXIgc3BhbiA9IGdldE1hcmtlZFNwYW5Gb3IobGluZS5tYXJrZWRTcGFucywgdGhpcyQxKTtcbiAgICBpZiAoY20gJiYgIXRoaXMkMS5jb2xsYXBzZWQpIHsgcmVnTGluZUNoYW5nZShjbSwgbGluZU5vKGxpbmUpLCBcInRleHRcIik7IH1cbiAgICBlbHNlIGlmIChjbSkge1xuICAgICAgaWYgKHNwYW4udG8gIT0gbnVsbCkgeyBtYXggPSBsaW5lTm8obGluZSk7IH1cbiAgICAgIGlmIChzcGFuLmZyb20gIT0gbnVsbCkgeyBtaW4gPSBsaW5lTm8obGluZSk7IH1cbiAgICB9XG4gICAgbGluZS5tYXJrZWRTcGFucyA9IHJlbW92ZU1hcmtlZFNwYW4obGluZS5tYXJrZWRTcGFucywgc3Bhbik7XG4gICAgaWYgKHNwYW4uZnJvbSA9PSBudWxsICYmIHRoaXMkMS5jb2xsYXBzZWQgJiYgIWxpbmVJc0hpZGRlbih0aGlzJDEuZG9jLCBsaW5lKSAmJiBjbSlcbiAgICAgIHsgdXBkYXRlTGluZUhlaWdodChsaW5lLCB0ZXh0SGVpZ2h0KGNtLmRpc3BsYXkpKTsgfVxuICB9XG4gIGlmIChjbSAmJiB0aGlzLmNvbGxhcHNlZCAmJiAhY20ub3B0aW9ucy5saW5lV3JhcHBpbmcpIHsgZm9yICh2YXIgaSQxID0gMDsgaSQxIDwgdGhpcy5saW5lcy5sZW5ndGg7ICsraSQxKSB7XG4gICAgdmFyIHZpc3VhbCA9IHZpc3VhbExpbmUodGhpcyQxLmxpbmVzW2kkMV0pLCBsZW4gPSBsaW5lTGVuZ3RoKHZpc3VhbCk7XG4gICAgaWYgKGxlbiA+IGNtLmRpc3BsYXkubWF4TGluZUxlbmd0aCkge1xuICAgICAgY20uZGlzcGxheS5tYXhMaW5lID0gdmlzdWFsO1xuICAgICAgY20uZGlzcGxheS5tYXhMaW5lTGVuZ3RoID0gbGVuO1xuICAgICAgY20uZGlzcGxheS5tYXhMaW5lQ2hhbmdlZCA9IHRydWU7XG4gICAgfVxuICB9IH1cblxuICBpZiAobWluICE9IG51bGwgJiYgY20gJiYgdGhpcy5jb2xsYXBzZWQpIHsgcmVnQ2hhbmdlKGNtLCBtaW4sIG1heCArIDEpOyB9XG4gIHRoaXMubGluZXMubGVuZ3RoID0gMDtcbiAgdGhpcy5leHBsaWNpdGx5Q2xlYXJlZCA9IHRydWU7XG4gIGlmICh0aGlzLmF0b21pYyAmJiB0aGlzLmRvYy5jYW50RWRpdCkge1xuICAgIHRoaXMuZG9jLmNhbnRFZGl0ID0gZmFsc2U7XG4gICAgaWYgKGNtKSB7IHJlQ2hlY2tTZWxlY3Rpb24oY20uZG9jKTsgfVxuICB9XG4gIGlmIChjbSkgeyBzaWduYWxMYXRlcihjbSwgXCJtYXJrZXJDbGVhcmVkXCIsIGNtLCB0aGlzLCBtaW4sIG1heCk7IH1cbiAgaWYgKHdpdGhPcCkgeyBlbmRPcGVyYXRpb24oY20pOyB9XG4gIGlmICh0aGlzLnBhcmVudCkgeyB0aGlzLnBhcmVudC5jbGVhcigpOyB9XG59O1xuXG4vLyBGaW5kIHRoZSBwb3NpdGlvbiBvZiB0aGUgbWFya2VyIGluIHRoZSBkb2N1bWVudC4gUmV0dXJucyBhIHtmcm9tLFxuLy8gdG99IG9iamVjdCBieSBkZWZhdWx0LiBTaWRlIGNhbiBiZSBwYXNzZWQgdG8gZ2V0IGEgc3BlY2lmaWMgc2lkZVxuLy8gLS0gMCAoYm90aCksIC0xIChsZWZ0KSwgb3IgMSAocmlnaHQpLiBXaGVuIGxpbmVPYmogaXMgdHJ1ZSwgdGhlXG4vLyBQb3Mgb2JqZWN0cyByZXR1cm5lZCBjb250YWluIGEgbGluZSBvYmplY3QsIHJhdGhlciB0aGFuIGEgbGluZVxuLy8gbnVtYmVyICh1c2VkIHRvIHByZXZlbnQgbG9va2luZyB1cCB0aGUgc2FtZSBsaW5lIHR3aWNlKS5cblRleHRNYXJrZXIucHJvdG90eXBlLmZpbmQgPSBmdW5jdGlvbiAoc2lkZSwgbGluZU9iaikge1xuICAgIHZhciB0aGlzJDEgPSB0aGlzO1xuXG4gIGlmIChzaWRlID09IG51bGwgJiYgdGhpcy50eXBlID09IFwiYm9va21hcmtcIikgeyBzaWRlID0gMTsgfVxuICB2YXIgZnJvbSwgdG87XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5saW5lcy5sZW5ndGg7ICsraSkge1xuICAgIHZhciBsaW5lID0gdGhpcyQxLmxpbmVzW2ldO1xuICAgIHZhciBzcGFuID0gZ2V0TWFya2VkU3BhbkZvcihsaW5lLm1hcmtlZFNwYW5zLCB0aGlzJDEpO1xuICAgIGlmIChzcGFuLmZyb20gIT0gbnVsbCkge1xuICAgICAgZnJvbSA9IFBvcyhsaW5lT2JqID8gbGluZSA6IGxpbmVObyhsaW5lKSwgc3Bhbi5mcm9tKTtcbiAgICAgIGlmIChzaWRlID09IC0xKSB7IHJldHVybiBmcm9tIH1cbiAgICB9XG4gICAgaWYgKHNwYW4udG8gIT0gbnVsbCkge1xuICAgICAgdG8gPSBQb3MobGluZU9iaiA/IGxpbmUgOiBsaW5lTm8obGluZSksIHNwYW4udG8pO1xuICAgICAgaWYgKHNpZGUgPT0gMSkgeyByZXR1cm4gdG8gfVxuICAgIH1cbiAgfVxuICByZXR1cm4gZnJvbSAmJiB7ZnJvbTogZnJvbSwgdG86IHRvfVxufTtcblxuLy8gU2lnbmFscyB0aGF0IHRoZSBtYXJrZXIncyB3aWRnZXQgY2hhbmdlZCwgYW5kIHN1cnJvdW5kaW5nIGxheW91dFxuLy8gc2hvdWxkIGJlIHJlY29tcHV0ZWQuXG5UZXh0TWFya2VyLnByb3RvdHlwZS5jaGFuZ2VkID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciB0aGlzJDEgPSB0aGlzO1xuXG4gIHZhciBwb3MgPSB0aGlzLmZpbmQoLTEsIHRydWUpLCB3aWRnZXQgPSB0aGlzLCBjbSA9IHRoaXMuZG9jLmNtO1xuICBpZiAoIXBvcyB8fCAhY20pIHsgcmV0dXJuIH1cbiAgcnVuSW5PcChjbSwgZnVuY3Rpb24gKCkge1xuICAgIHZhciBsaW5lID0gcG9zLmxpbmUsIGxpbmVOID0gbGluZU5vKHBvcy5saW5lKTtcbiAgICB2YXIgdmlldyA9IGZpbmRWaWV3Rm9yTGluZShjbSwgbGluZU4pO1xuICAgIGlmICh2aWV3KSB7XG4gICAgICBjbGVhckxpbmVNZWFzdXJlbWVudENhY2hlRm9yKHZpZXcpO1xuICAgICAgY20uY3VyT3Auc2VsZWN0aW9uQ2hhbmdlZCA9IGNtLmN1ck9wLmZvcmNlVXBkYXRlID0gdHJ1ZTtcbiAgICB9XG4gICAgY20uY3VyT3AudXBkYXRlTWF4TGluZSA9IHRydWU7XG4gICAgaWYgKCFsaW5lSXNIaWRkZW4od2lkZ2V0LmRvYywgbGluZSkgJiYgd2lkZ2V0LmhlaWdodCAhPSBudWxsKSB7XG4gICAgICB2YXIgb2xkSGVpZ2h0ID0gd2lkZ2V0LmhlaWdodDtcbiAgICAgIHdpZGdldC5oZWlnaHQgPSBudWxsO1xuICAgICAgdmFyIGRIZWlnaHQgPSB3aWRnZXRIZWlnaHQod2lkZ2V0KSAtIG9sZEhlaWdodDtcbiAgICAgIGlmIChkSGVpZ2h0KVxuICAgICAgICB7IHVwZGF0ZUxpbmVIZWlnaHQobGluZSwgbGluZS5oZWlnaHQgKyBkSGVpZ2h0KTsgfVxuICAgIH1cbiAgICBzaWduYWxMYXRlcihjbSwgXCJtYXJrZXJDaGFuZ2VkXCIsIGNtLCB0aGlzJDEpO1xuICB9KTtcbn07XG5cblRleHRNYXJrZXIucHJvdG90eXBlLmF0dGFjaExpbmUgPSBmdW5jdGlvbiAobGluZSkge1xuICBpZiAoIXRoaXMubGluZXMubGVuZ3RoICYmIHRoaXMuZG9jLmNtKSB7XG4gICAgdmFyIG9wID0gdGhpcy5kb2MuY20uY3VyT3A7XG4gICAgaWYgKCFvcC5tYXliZUhpZGRlbk1hcmtlcnMgfHwgaW5kZXhPZihvcC5tYXliZUhpZGRlbk1hcmtlcnMsIHRoaXMpID09IC0xKVxuICAgICAgeyAob3AubWF5YmVVbmhpZGRlbk1hcmtlcnMgfHwgKG9wLm1heWJlVW5oaWRkZW5NYXJrZXJzID0gW10pKS5wdXNoKHRoaXMpOyB9XG4gIH1cbiAgdGhpcy5saW5lcy5wdXNoKGxpbmUpO1xufTtcblxuVGV4dE1hcmtlci5wcm90b3R5cGUuZGV0YWNoTGluZSA9IGZ1bmN0aW9uIChsaW5lKSB7XG4gIHRoaXMubGluZXMuc3BsaWNlKGluZGV4T2YodGhpcy5saW5lcywgbGluZSksIDEpO1xuICBpZiAoIXRoaXMubGluZXMubGVuZ3RoICYmIHRoaXMuZG9jLmNtKSB7XG4gICAgdmFyIG9wID0gdGhpcy5kb2MuY20uY3VyT3A7KG9wLm1heWJlSGlkZGVuTWFya2VycyB8fCAob3AubWF5YmVIaWRkZW5NYXJrZXJzID0gW10pKS5wdXNoKHRoaXMpO1xuICB9XG59O1xuZXZlbnRNaXhpbihUZXh0TWFya2VyKTtcblxuLy8gQ3JlYXRlIGEgbWFya2VyLCB3aXJlIGl0IHVwIHRvIHRoZSByaWdodCBsaW5lcywgYW5kXG5mdW5jdGlvbiBtYXJrVGV4dChkb2MsIGZyb20sIHRvLCBvcHRpb25zLCB0eXBlKSB7XG4gIC8vIFNoYXJlZCBtYXJrZXJzIChhY3Jvc3MgbGlua2VkIGRvY3VtZW50cykgYXJlIGhhbmRsZWQgc2VwYXJhdGVseVxuICAvLyAobWFya1RleHRTaGFyZWQgd2lsbCBjYWxsIG91dCB0byB0aGlzIGFnYWluLCBvbmNlIHBlclxuICAvLyBkb2N1bWVudCkuXG4gIGlmIChvcHRpb25zICYmIG9wdGlvbnMuc2hhcmVkKSB7IHJldHVybiBtYXJrVGV4dFNoYXJlZChkb2MsIGZyb20sIHRvLCBvcHRpb25zLCB0eXBlKSB9XG4gIC8vIEVuc3VyZSB3ZSBhcmUgaW4gYW4gb3BlcmF0aW9uLlxuICBpZiAoZG9jLmNtICYmICFkb2MuY20uY3VyT3ApIHsgcmV0dXJuIG9wZXJhdGlvbihkb2MuY20sIG1hcmtUZXh0KShkb2MsIGZyb20sIHRvLCBvcHRpb25zLCB0eXBlKSB9XG5cbiAgdmFyIG1hcmtlciA9IG5ldyBUZXh0TWFya2VyKGRvYywgdHlwZSksIGRpZmYgPSBjbXAoZnJvbSwgdG8pO1xuICBpZiAob3B0aW9ucykgeyBjb3B5T2JqKG9wdGlvbnMsIG1hcmtlciwgZmFsc2UpOyB9XG4gIC8vIERvbid0IGNvbm5lY3QgZW1wdHkgbWFya2VycyB1bmxlc3MgY2xlYXJXaGVuRW1wdHkgaXMgZmFsc2VcbiAgaWYgKGRpZmYgPiAwIHx8IGRpZmYgPT0gMCAmJiBtYXJrZXIuY2xlYXJXaGVuRW1wdHkgIT09IGZhbHNlKVxuICAgIHsgcmV0dXJuIG1hcmtlciB9XG4gIGlmIChtYXJrZXIucmVwbGFjZWRXaXRoKSB7XG4gICAgLy8gU2hvd2luZyB1cCBhcyBhIHdpZGdldCBpbXBsaWVzIGNvbGxhcHNlZCAod2lkZ2V0IHJlcGxhY2VzIHRleHQpXG4gICAgbWFya2VyLmNvbGxhcHNlZCA9IHRydWU7XG4gICAgbWFya2VyLndpZGdldE5vZGUgPSBlbHRQKFwic3BhblwiLCBbbWFya2VyLnJlcGxhY2VkV2l0aF0sIFwiQ29kZU1pcnJvci13aWRnZXRcIik7XG4gICAgaWYgKCFvcHRpb25zLmhhbmRsZU1vdXNlRXZlbnRzKSB7IG1hcmtlci53aWRnZXROb2RlLnNldEF0dHJpYnV0ZShcImNtLWlnbm9yZS1ldmVudHNcIiwgXCJ0cnVlXCIpOyB9XG4gICAgaWYgKG9wdGlvbnMuaW5zZXJ0TGVmdCkgeyBtYXJrZXIud2lkZ2V0Tm9kZS5pbnNlcnRMZWZ0ID0gdHJ1ZTsgfVxuICB9XG4gIGlmIChtYXJrZXIuY29sbGFwc2VkKSB7XG4gICAgaWYgKGNvbmZsaWN0aW5nQ29sbGFwc2VkUmFuZ2UoZG9jLCBmcm9tLmxpbmUsIGZyb20sIHRvLCBtYXJrZXIpIHx8XG4gICAgICAgIGZyb20ubGluZSAhPSB0by5saW5lICYmIGNvbmZsaWN0aW5nQ29sbGFwc2VkUmFuZ2UoZG9jLCB0by5saW5lLCBmcm9tLCB0bywgbWFya2VyKSlcbiAgICAgIHsgdGhyb3cgbmV3IEVycm9yKFwiSW5zZXJ0aW5nIGNvbGxhcHNlZCBtYXJrZXIgcGFydGlhbGx5IG92ZXJsYXBwaW5nIGFuIGV4aXN0aW5nIG9uZVwiKSB9XG4gICAgc2VlQ29sbGFwc2VkU3BhbnMoKTtcbiAgfVxuXG4gIGlmIChtYXJrZXIuYWRkVG9IaXN0b3J5KVxuICAgIHsgYWRkQ2hhbmdlVG9IaXN0b3J5KGRvYywge2Zyb206IGZyb20sIHRvOiB0bywgb3JpZ2luOiBcIm1hcmtUZXh0XCJ9LCBkb2Muc2VsLCBOYU4pOyB9XG5cbiAgdmFyIGN1ckxpbmUgPSBmcm9tLmxpbmUsIGNtID0gZG9jLmNtLCB1cGRhdGVNYXhMaW5lO1xuICBkb2MuaXRlcihjdXJMaW5lLCB0by5saW5lICsgMSwgZnVuY3Rpb24gKGxpbmUpIHtcbiAgICBpZiAoY20gJiYgbWFya2VyLmNvbGxhcHNlZCAmJiAhY20ub3B0aW9ucy5saW5lV3JhcHBpbmcgJiYgdmlzdWFsTGluZShsaW5lKSA9PSBjbS5kaXNwbGF5Lm1heExpbmUpXG4gICAgICB7IHVwZGF0ZU1heExpbmUgPSB0cnVlOyB9XG4gICAgaWYgKG1hcmtlci5jb2xsYXBzZWQgJiYgY3VyTGluZSAhPSBmcm9tLmxpbmUpIHsgdXBkYXRlTGluZUhlaWdodChsaW5lLCAwKTsgfVxuICAgIGFkZE1hcmtlZFNwYW4obGluZSwgbmV3IE1hcmtlZFNwYW4obWFya2VyLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY3VyTGluZSA9PSBmcm9tLmxpbmUgPyBmcm9tLmNoIDogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGN1ckxpbmUgPT0gdG8ubGluZSA/IHRvLmNoIDogbnVsbCkpO1xuICAgICsrY3VyTGluZTtcbiAgfSk7XG4gIC8vIGxpbmVJc0hpZGRlbiBkZXBlbmRzIG9uIHRoZSBwcmVzZW5jZSBvZiB0aGUgc3BhbnMsIHNvIG5lZWRzIGEgc2Vjb25kIHBhc3NcbiAgaWYgKG1hcmtlci5jb2xsYXBzZWQpIHsgZG9jLml0ZXIoZnJvbS5saW5lLCB0by5saW5lICsgMSwgZnVuY3Rpb24gKGxpbmUpIHtcbiAgICBpZiAobGluZUlzSGlkZGVuKGRvYywgbGluZSkpIHsgdXBkYXRlTGluZUhlaWdodChsaW5lLCAwKTsgfVxuICB9KTsgfVxuXG4gIGlmIChtYXJrZXIuY2xlYXJPbkVudGVyKSB7IG9uKG1hcmtlciwgXCJiZWZvcmVDdXJzb3JFbnRlclwiLCBmdW5jdGlvbiAoKSB7IHJldHVybiBtYXJrZXIuY2xlYXIoKTsgfSk7IH1cblxuICBpZiAobWFya2VyLnJlYWRPbmx5KSB7XG4gICAgc2VlUmVhZE9ubHlTcGFucygpO1xuICAgIGlmIChkb2MuaGlzdG9yeS5kb25lLmxlbmd0aCB8fCBkb2MuaGlzdG9yeS51bmRvbmUubGVuZ3RoKVxuICAgICAgeyBkb2MuY2xlYXJIaXN0b3J5KCk7IH1cbiAgfVxuICBpZiAobWFya2VyLmNvbGxhcHNlZCkge1xuICAgIG1hcmtlci5pZCA9ICsrbmV4dE1hcmtlcklkO1xuICAgIG1hcmtlci5hdG9taWMgPSB0cnVlO1xuICB9XG4gIGlmIChjbSkge1xuICAgIC8vIFN5bmMgZWRpdG9yIHN0YXRlXG4gICAgaWYgKHVwZGF0ZU1heExpbmUpIHsgY20uY3VyT3AudXBkYXRlTWF4TGluZSA9IHRydWU7IH1cbiAgICBpZiAobWFya2VyLmNvbGxhcHNlZClcbiAgICAgIHsgcmVnQ2hhbmdlKGNtLCBmcm9tLmxpbmUsIHRvLmxpbmUgKyAxKTsgfVxuICAgIGVsc2UgaWYgKG1hcmtlci5jbGFzc05hbWUgfHwgbWFya2VyLnRpdGxlIHx8IG1hcmtlci5zdGFydFN0eWxlIHx8IG1hcmtlci5lbmRTdHlsZSB8fCBtYXJrZXIuY3NzKVxuICAgICAgeyBmb3IgKHZhciBpID0gZnJvbS5saW5lOyBpIDw9IHRvLmxpbmU7IGkrKykgeyByZWdMaW5lQ2hhbmdlKGNtLCBpLCBcInRleHRcIik7IH0gfVxuICAgIGlmIChtYXJrZXIuYXRvbWljKSB7IHJlQ2hlY2tTZWxlY3Rpb24oY20uZG9jKTsgfVxuICAgIHNpZ25hbExhdGVyKGNtLCBcIm1hcmtlckFkZGVkXCIsIGNtLCBtYXJrZXIpO1xuICB9XG4gIHJldHVybiBtYXJrZXJcbn1cblxuLy8gU0hBUkVEIFRFWFRNQVJLRVJTXG5cbi8vIEEgc2hhcmVkIG1hcmtlciBzcGFucyBtdWx0aXBsZSBsaW5rZWQgZG9jdW1lbnRzLiBJdCBpc1xuLy8gaW1wbGVtZW50ZWQgYXMgYSBtZXRhLW1hcmtlci1vYmplY3QgY29udHJvbGxpbmcgbXVsdGlwbGUgbm9ybWFsXG4vLyBtYXJrZXJzLlxudmFyIFNoYXJlZFRleHRNYXJrZXIgPSBmdW5jdGlvbihtYXJrZXJzLCBwcmltYXJ5KSB7XG4gIHZhciB0aGlzJDEgPSB0aGlzO1xuXG4gIHRoaXMubWFya2VycyA9IG1hcmtlcnM7XG4gIHRoaXMucHJpbWFyeSA9IHByaW1hcnk7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbWFya2Vycy5sZW5ndGg7ICsraSlcbiAgICB7IG1hcmtlcnNbaV0ucGFyZW50ID0gdGhpcyQxOyB9XG59O1xuXG5TaGFyZWRUZXh0TWFya2VyLnByb3RvdHlwZS5jbGVhciA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgdGhpcyQxID0gdGhpcztcblxuICBpZiAodGhpcy5leHBsaWNpdGx5Q2xlYXJlZCkgeyByZXR1cm4gfVxuICB0aGlzLmV4cGxpY2l0bHlDbGVhcmVkID0gdHJ1ZTtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLm1hcmtlcnMubGVuZ3RoOyArK2kpXG4gICAgeyB0aGlzJDEubWFya2Vyc1tpXS5jbGVhcigpOyB9XG4gIHNpZ25hbExhdGVyKHRoaXMsIFwiY2xlYXJcIik7XG59O1xuXG5TaGFyZWRUZXh0TWFya2VyLnByb3RvdHlwZS5maW5kID0gZnVuY3Rpb24gKHNpZGUsIGxpbmVPYmopIHtcbiAgcmV0dXJuIHRoaXMucHJpbWFyeS5maW5kKHNpZGUsIGxpbmVPYmopXG59O1xuZXZlbnRNaXhpbihTaGFyZWRUZXh0TWFya2VyKTtcblxuZnVuY3Rpb24gbWFya1RleHRTaGFyZWQoZG9jLCBmcm9tLCB0bywgb3B0aW9ucywgdHlwZSkge1xuICBvcHRpb25zID0gY29weU9iaihvcHRpb25zKTtcbiAgb3B0aW9ucy5zaGFyZWQgPSBmYWxzZTtcbiAgdmFyIG1hcmtlcnMgPSBbbWFya1RleHQoZG9jLCBmcm9tLCB0bywgb3B0aW9ucywgdHlwZSldLCBwcmltYXJ5ID0gbWFya2Vyc1swXTtcbiAgdmFyIHdpZGdldCA9IG9wdGlvbnMud2lkZ2V0Tm9kZTtcbiAgbGlua2VkRG9jcyhkb2MsIGZ1bmN0aW9uIChkb2MpIHtcbiAgICBpZiAod2lkZ2V0KSB7IG9wdGlvbnMud2lkZ2V0Tm9kZSA9IHdpZGdldC5jbG9uZU5vZGUodHJ1ZSk7IH1cbiAgICBtYXJrZXJzLnB1c2gobWFya1RleHQoZG9jLCBjbGlwUG9zKGRvYywgZnJvbSksIGNsaXBQb3MoZG9jLCB0byksIG9wdGlvbnMsIHR5cGUpKTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGRvYy5saW5rZWQubGVuZ3RoOyArK2kpXG4gICAgICB7IGlmIChkb2MubGlua2VkW2ldLmlzUGFyZW50KSB7IHJldHVybiB9IH1cbiAgICBwcmltYXJ5ID0gbHN0KG1hcmtlcnMpO1xuICB9KTtcbiAgcmV0dXJuIG5ldyBTaGFyZWRUZXh0TWFya2VyKG1hcmtlcnMsIHByaW1hcnkpXG59XG5cbmZ1bmN0aW9uIGZpbmRTaGFyZWRNYXJrZXJzKGRvYykge1xuICByZXR1cm4gZG9jLmZpbmRNYXJrcyhQb3MoZG9jLmZpcnN0LCAwKSwgZG9jLmNsaXBQb3MoUG9zKGRvYy5sYXN0TGluZSgpKSksIGZ1bmN0aW9uIChtKSB7IHJldHVybiBtLnBhcmVudDsgfSlcbn1cblxuZnVuY3Rpb24gY29weVNoYXJlZE1hcmtlcnMoZG9jLCBtYXJrZXJzKSB7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbWFya2Vycy5sZW5ndGg7IGkrKykge1xuICAgIHZhciBtYXJrZXIgPSBtYXJrZXJzW2ldLCBwb3MgPSBtYXJrZXIuZmluZCgpO1xuICAgIHZhciBtRnJvbSA9IGRvYy5jbGlwUG9zKHBvcy5mcm9tKSwgbVRvID0gZG9jLmNsaXBQb3MocG9zLnRvKTtcbiAgICBpZiAoY21wKG1Gcm9tLCBtVG8pKSB7XG4gICAgICB2YXIgc3ViTWFyayA9IG1hcmtUZXh0KGRvYywgbUZyb20sIG1UbywgbWFya2VyLnByaW1hcnksIG1hcmtlci5wcmltYXJ5LnR5cGUpO1xuICAgICAgbWFya2VyLm1hcmtlcnMucHVzaChzdWJNYXJrKTtcbiAgICAgIHN1Yk1hcmsucGFyZW50ID0gbWFya2VyO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBkZXRhY2hTaGFyZWRNYXJrZXJzKG1hcmtlcnMpIHtcbiAgdmFyIGxvb3AgPSBmdW5jdGlvbiAoIGkgKSB7XG4gICAgdmFyIG1hcmtlciA9IG1hcmtlcnNbaV0sIGxpbmtlZCA9IFttYXJrZXIucHJpbWFyeS5kb2NdO1xuICAgIGxpbmtlZERvY3MobWFya2VyLnByaW1hcnkuZG9jLCBmdW5jdGlvbiAoZCkgeyByZXR1cm4gbGlua2VkLnB1c2goZCk7IH0pO1xuICAgIGZvciAodmFyIGogPSAwOyBqIDwgbWFya2VyLm1hcmtlcnMubGVuZ3RoOyBqKyspIHtcbiAgICAgIHZhciBzdWJNYXJrZXIgPSBtYXJrZXIubWFya2Vyc1tqXTtcbiAgICAgIGlmIChpbmRleE9mKGxpbmtlZCwgc3ViTWFya2VyLmRvYykgPT0gLTEpIHtcbiAgICAgICAgc3ViTWFya2VyLnBhcmVudCA9IG51bGw7XG4gICAgICAgIG1hcmtlci5tYXJrZXJzLnNwbGljZShqLS0sIDEpO1xuICAgICAgfVxuICAgIH1cbiAgfTtcblxuICBmb3IgKHZhciBpID0gMDsgaSA8IG1hcmtlcnMubGVuZ3RoOyBpKyspIGxvb3AoIGkgKTtcbn1cblxudmFyIG5leHREb2NJZCA9IDA7XG52YXIgRG9jID0gZnVuY3Rpb24odGV4dCwgbW9kZSwgZmlyc3RMaW5lLCBsaW5lU2VwLCBkaXJlY3Rpb24pIHtcbiAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIERvYykpIHsgcmV0dXJuIG5ldyBEb2ModGV4dCwgbW9kZSwgZmlyc3RMaW5lLCBsaW5lU2VwLCBkaXJlY3Rpb24pIH1cbiAgaWYgKGZpcnN0TGluZSA9PSBudWxsKSB7IGZpcnN0TGluZSA9IDA7IH1cblxuICBCcmFuY2hDaHVuay5jYWxsKHRoaXMsIFtuZXcgTGVhZkNodW5rKFtuZXcgTGluZShcIlwiLCBudWxsKV0pXSk7XG4gIHRoaXMuZmlyc3QgPSBmaXJzdExpbmU7XG4gIHRoaXMuc2Nyb2xsVG9wID0gdGhpcy5zY3JvbGxMZWZ0ID0gMDtcbiAgdGhpcy5jYW50RWRpdCA9IGZhbHNlO1xuICB0aGlzLmNsZWFuR2VuZXJhdGlvbiA9IDE7XG4gIHRoaXMubW9kZUZyb250aWVyID0gdGhpcy5oaWdobGlnaHRGcm9udGllciA9IGZpcnN0TGluZTtcbiAgdmFyIHN0YXJ0ID0gUG9zKGZpcnN0TGluZSwgMCk7XG4gIHRoaXMuc2VsID0gc2ltcGxlU2VsZWN0aW9uKHN0YXJ0KTtcbiAgdGhpcy5oaXN0b3J5ID0gbmV3IEhpc3RvcnkobnVsbCk7XG4gIHRoaXMuaWQgPSArK25leHREb2NJZDtcbiAgdGhpcy5tb2RlT3B0aW9uID0gbW9kZTtcbiAgdGhpcy5saW5lU2VwID0gbGluZVNlcDtcbiAgdGhpcy5kaXJlY3Rpb24gPSAoZGlyZWN0aW9uID09IFwicnRsXCIpID8gXCJydGxcIiA6IFwibHRyXCI7XG4gIHRoaXMuZXh0ZW5kID0gZmFsc2U7XG5cbiAgaWYgKHR5cGVvZiB0ZXh0ID09IFwic3RyaW5nXCIpIHsgdGV4dCA9IHRoaXMuc3BsaXRMaW5lcyh0ZXh0KTsgfVxuICB1cGRhdGVEb2ModGhpcywge2Zyb206IHN0YXJ0LCB0bzogc3RhcnQsIHRleHQ6IHRleHR9KTtcbiAgc2V0U2VsZWN0aW9uKHRoaXMsIHNpbXBsZVNlbGVjdGlvbihzdGFydCksIHNlbF9kb250U2Nyb2xsKTtcbn07XG5cbkRvYy5wcm90b3R5cGUgPSBjcmVhdGVPYmooQnJhbmNoQ2h1bmsucHJvdG90eXBlLCB7XG4gIGNvbnN0cnVjdG9yOiBEb2MsXG4gIC8vIEl0ZXJhdGUgb3ZlciB0aGUgZG9jdW1lbnQuIFN1cHBvcnRzIHR3byBmb3JtcyAtLSB3aXRoIG9ubHkgb25lXG4gIC8vIGFyZ3VtZW50LCBpdCBjYWxscyB0aGF0IGZvciBlYWNoIGxpbmUgaW4gdGhlIGRvY3VtZW50LiBXaXRoXG4gIC8vIHRocmVlLCBpdCBpdGVyYXRlcyBvdmVyIHRoZSByYW5nZSBnaXZlbiBieSB0aGUgZmlyc3QgdHdvICh3aXRoXG4gIC8vIHRoZSBzZWNvbmQgYmVpbmcgbm9uLWluY2x1c2l2ZSkuXG4gIGl0ZXI6IGZ1bmN0aW9uKGZyb20sIHRvLCBvcCkge1xuICAgIGlmIChvcCkgeyB0aGlzLml0ZXJOKGZyb20gLSB0aGlzLmZpcnN0LCB0byAtIGZyb20sIG9wKTsgfVxuICAgIGVsc2UgeyB0aGlzLml0ZXJOKHRoaXMuZmlyc3QsIHRoaXMuZmlyc3QgKyB0aGlzLnNpemUsIGZyb20pOyB9XG4gIH0sXG5cbiAgLy8gTm9uLXB1YmxpYyBpbnRlcmZhY2UgZm9yIGFkZGluZyBhbmQgcmVtb3ZpbmcgbGluZXMuXG4gIGluc2VydDogZnVuY3Rpb24oYXQsIGxpbmVzKSB7XG4gICAgdmFyIGhlaWdodCA9IDA7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsaW5lcy5sZW5ndGg7ICsraSkgeyBoZWlnaHQgKz0gbGluZXNbaV0uaGVpZ2h0OyB9XG4gICAgdGhpcy5pbnNlcnRJbm5lcihhdCAtIHRoaXMuZmlyc3QsIGxpbmVzLCBoZWlnaHQpO1xuICB9LFxuICByZW1vdmU6IGZ1bmN0aW9uKGF0LCBuKSB7IHRoaXMucmVtb3ZlSW5uZXIoYXQgLSB0aGlzLmZpcnN0LCBuKTsgfSxcblxuICAvLyBGcm9tIGhlcmUsIHRoZSBtZXRob2RzIGFyZSBwYXJ0IG9mIHRoZSBwdWJsaWMgaW50ZXJmYWNlLiBNb3N0XG4gIC8vIGFyZSBhbHNvIGF2YWlsYWJsZSBmcm9tIENvZGVNaXJyb3IgKGVkaXRvcikgaW5zdGFuY2VzLlxuXG4gIGdldFZhbHVlOiBmdW5jdGlvbihsaW5lU2VwKSB7XG4gICAgdmFyIGxpbmVzID0gZ2V0TGluZXModGhpcywgdGhpcy5maXJzdCwgdGhpcy5maXJzdCArIHRoaXMuc2l6ZSk7XG4gICAgaWYgKGxpbmVTZXAgPT09IGZhbHNlKSB7IHJldHVybiBsaW5lcyB9XG4gICAgcmV0dXJuIGxpbmVzLmpvaW4obGluZVNlcCB8fCB0aGlzLmxpbmVTZXBhcmF0b3IoKSlcbiAgfSxcbiAgc2V0VmFsdWU6IGRvY01ldGhvZE9wKGZ1bmN0aW9uKGNvZGUpIHtcbiAgICB2YXIgdG9wID0gUG9zKHRoaXMuZmlyc3QsIDApLCBsYXN0ID0gdGhpcy5maXJzdCArIHRoaXMuc2l6ZSAtIDE7XG4gICAgbWFrZUNoYW5nZSh0aGlzLCB7ZnJvbTogdG9wLCB0bzogUG9zKGxhc3QsIGdldExpbmUodGhpcywgbGFzdCkudGV4dC5sZW5ndGgpLFxuICAgICAgICAgICAgICAgICAgICAgIHRleHQ6IHRoaXMuc3BsaXRMaW5lcyhjb2RlKSwgb3JpZ2luOiBcInNldFZhbHVlXCIsIGZ1bGw6IHRydWV9LCB0cnVlKTtcbiAgICBpZiAodGhpcy5jbSkgeyBzY3JvbGxUb0Nvb3Jkcyh0aGlzLmNtLCAwLCAwKTsgfVxuICAgIHNldFNlbGVjdGlvbih0aGlzLCBzaW1wbGVTZWxlY3Rpb24odG9wKSwgc2VsX2RvbnRTY3JvbGwpO1xuICB9KSxcbiAgcmVwbGFjZVJhbmdlOiBmdW5jdGlvbihjb2RlLCBmcm9tLCB0bywgb3JpZ2luKSB7XG4gICAgZnJvbSA9IGNsaXBQb3ModGhpcywgZnJvbSk7XG4gICAgdG8gPSB0byA/IGNsaXBQb3ModGhpcywgdG8pIDogZnJvbTtcbiAgICByZXBsYWNlUmFuZ2UodGhpcywgY29kZSwgZnJvbSwgdG8sIG9yaWdpbik7XG4gIH0sXG4gIGdldFJhbmdlOiBmdW5jdGlvbihmcm9tLCB0bywgbGluZVNlcCkge1xuICAgIHZhciBsaW5lcyA9IGdldEJldHdlZW4odGhpcywgY2xpcFBvcyh0aGlzLCBmcm9tKSwgY2xpcFBvcyh0aGlzLCB0bykpO1xuICAgIGlmIChsaW5lU2VwID09PSBmYWxzZSkgeyByZXR1cm4gbGluZXMgfVxuICAgIHJldHVybiBsaW5lcy5qb2luKGxpbmVTZXAgfHwgdGhpcy5saW5lU2VwYXJhdG9yKCkpXG4gIH0sXG5cbiAgZ2V0TGluZTogZnVuY3Rpb24obGluZSkge3ZhciBsID0gdGhpcy5nZXRMaW5lSGFuZGxlKGxpbmUpOyByZXR1cm4gbCAmJiBsLnRleHR9LFxuXG4gIGdldExpbmVIYW5kbGU6IGZ1bmN0aW9uKGxpbmUpIHtpZiAoaXNMaW5lKHRoaXMsIGxpbmUpKSB7IHJldHVybiBnZXRMaW5lKHRoaXMsIGxpbmUpIH19LFxuICBnZXRMaW5lTnVtYmVyOiBmdW5jdGlvbihsaW5lKSB7cmV0dXJuIGxpbmVObyhsaW5lKX0sXG5cbiAgZ2V0TGluZUhhbmRsZVZpc3VhbFN0YXJ0OiBmdW5jdGlvbihsaW5lKSB7XG4gICAgaWYgKHR5cGVvZiBsaW5lID09IFwibnVtYmVyXCIpIHsgbGluZSA9IGdldExpbmUodGhpcywgbGluZSk7IH1cbiAgICByZXR1cm4gdmlzdWFsTGluZShsaW5lKVxuICB9LFxuXG4gIGxpbmVDb3VudDogZnVuY3Rpb24oKSB7cmV0dXJuIHRoaXMuc2l6ZX0sXG4gIGZpcnN0TGluZTogZnVuY3Rpb24oKSB7cmV0dXJuIHRoaXMuZmlyc3R9LFxuICBsYXN0TGluZTogZnVuY3Rpb24oKSB7cmV0dXJuIHRoaXMuZmlyc3QgKyB0aGlzLnNpemUgLSAxfSxcblxuICBjbGlwUG9zOiBmdW5jdGlvbihwb3MpIHtyZXR1cm4gY2xpcFBvcyh0aGlzLCBwb3MpfSxcblxuICBnZXRDdXJzb3I6IGZ1bmN0aW9uKHN0YXJ0KSB7XG4gICAgdmFyIHJhbmdlJCQxID0gdGhpcy5zZWwucHJpbWFyeSgpLCBwb3M7XG4gICAgaWYgKHN0YXJ0ID09IG51bGwgfHwgc3RhcnQgPT0gXCJoZWFkXCIpIHsgcG9zID0gcmFuZ2UkJDEuaGVhZDsgfVxuICAgIGVsc2UgaWYgKHN0YXJ0ID09IFwiYW5jaG9yXCIpIHsgcG9zID0gcmFuZ2UkJDEuYW5jaG9yOyB9XG4gICAgZWxzZSBpZiAoc3RhcnQgPT0gXCJlbmRcIiB8fCBzdGFydCA9PSBcInRvXCIgfHwgc3RhcnQgPT09IGZhbHNlKSB7IHBvcyA9IHJhbmdlJCQxLnRvKCk7IH1cbiAgICBlbHNlIHsgcG9zID0gcmFuZ2UkJDEuZnJvbSgpOyB9XG4gICAgcmV0dXJuIHBvc1xuICB9LFxuICBsaXN0U2VsZWN0aW9uczogZnVuY3Rpb24oKSB7IHJldHVybiB0aGlzLnNlbC5yYW5nZXMgfSxcbiAgc29tZXRoaW5nU2VsZWN0ZWQ6IGZ1bmN0aW9uKCkge3JldHVybiB0aGlzLnNlbC5zb21ldGhpbmdTZWxlY3RlZCgpfSxcblxuICBzZXRDdXJzb3I6IGRvY01ldGhvZE9wKGZ1bmN0aW9uKGxpbmUsIGNoLCBvcHRpb25zKSB7XG4gICAgc2V0U2ltcGxlU2VsZWN0aW9uKHRoaXMsIGNsaXBQb3ModGhpcywgdHlwZW9mIGxpbmUgPT0gXCJudW1iZXJcIiA/IFBvcyhsaW5lLCBjaCB8fCAwKSA6IGxpbmUpLCBudWxsLCBvcHRpb25zKTtcbiAgfSksXG4gIHNldFNlbGVjdGlvbjogZG9jTWV0aG9kT3AoZnVuY3Rpb24oYW5jaG9yLCBoZWFkLCBvcHRpb25zKSB7XG4gICAgc2V0U2ltcGxlU2VsZWN0aW9uKHRoaXMsIGNsaXBQb3ModGhpcywgYW5jaG9yKSwgY2xpcFBvcyh0aGlzLCBoZWFkIHx8IGFuY2hvciksIG9wdGlvbnMpO1xuICB9KSxcbiAgZXh0ZW5kU2VsZWN0aW9uOiBkb2NNZXRob2RPcChmdW5jdGlvbihoZWFkLCBvdGhlciwgb3B0aW9ucykge1xuICAgIGV4dGVuZFNlbGVjdGlvbih0aGlzLCBjbGlwUG9zKHRoaXMsIGhlYWQpLCBvdGhlciAmJiBjbGlwUG9zKHRoaXMsIG90aGVyKSwgb3B0aW9ucyk7XG4gIH0pLFxuICBleHRlbmRTZWxlY3Rpb25zOiBkb2NNZXRob2RPcChmdW5jdGlvbihoZWFkcywgb3B0aW9ucykge1xuICAgIGV4dGVuZFNlbGVjdGlvbnModGhpcywgY2xpcFBvc0FycmF5KHRoaXMsIGhlYWRzKSwgb3B0aW9ucyk7XG4gIH0pLFxuICBleHRlbmRTZWxlY3Rpb25zQnk6IGRvY01ldGhvZE9wKGZ1bmN0aW9uKGYsIG9wdGlvbnMpIHtcbiAgICB2YXIgaGVhZHMgPSBtYXAodGhpcy5zZWwucmFuZ2VzLCBmKTtcbiAgICBleHRlbmRTZWxlY3Rpb25zKHRoaXMsIGNsaXBQb3NBcnJheSh0aGlzLCBoZWFkcyksIG9wdGlvbnMpO1xuICB9KSxcbiAgc2V0U2VsZWN0aW9uczogZG9jTWV0aG9kT3AoZnVuY3Rpb24ocmFuZ2VzLCBwcmltYXJ5LCBvcHRpb25zKSB7XG4gICAgdmFyIHRoaXMkMSA9IHRoaXM7XG5cbiAgICBpZiAoIXJhbmdlcy5sZW5ndGgpIHsgcmV0dXJuIH1cbiAgICB2YXIgb3V0ID0gW107XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCByYW5nZXMubGVuZ3RoOyBpKyspXG4gICAgICB7IG91dFtpXSA9IG5ldyBSYW5nZShjbGlwUG9zKHRoaXMkMSwgcmFuZ2VzW2ldLmFuY2hvciksXG4gICAgICAgICAgICAgICAgICAgICAgICAgY2xpcFBvcyh0aGlzJDEsIHJhbmdlc1tpXS5oZWFkKSk7IH1cbiAgICBpZiAocHJpbWFyeSA9PSBudWxsKSB7IHByaW1hcnkgPSBNYXRoLm1pbihyYW5nZXMubGVuZ3RoIC0gMSwgdGhpcy5zZWwucHJpbUluZGV4KTsgfVxuICAgIHNldFNlbGVjdGlvbih0aGlzLCBub3JtYWxpemVTZWxlY3Rpb24ob3V0LCBwcmltYXJ5KSwgb3B0aW9ucyk7XG4gIH0pLFxuICBhZGRTZWxlY3Rpb246IGRvY01ldGhvZE9wKGZ1bmN0aW9uKGFuY2hvciwgaGVhZCwgb3B0aW9ucykge1xuICAgIHZhciByYW5nZXMgPSB0aGlzLnNlbC5yYW5nZXMuc2xpY2UoMCk7XG4gICAgcmFuZ2VzLnB1c2gobmV3IFJhbmdlKGNsaXBQb3ModGhpcywgYW5jaG9yKSwgY2xpcFBvcyh0aGlzLCBoZWFkIHx8IGFuY2hvcikpKTtcbiAgICBzZXRTZWxlY3Rpb24odGhpcywgbm9ybWFsaXplU2VsZWN0aW9uKHJhbmdlcywgcmFuZ2VzLmxlbmd0aCAtIDEpLCBvcHRpb25zKTtcbiAgfSksXG5cbiAgZ2V0U2VsZWN0aW9uOiBmdW5jdGlvbihsaW5lU2VwKSB7XG4gICAgdmFyIHRoaXMkMSA9IHRoaXM7XG5cbiAgICB2YXIgcmFuZ2VzID0gdGhpcy5zZWwucmFuZ2VzLCBsaW5lcztcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHJhbmdlcy5sZW5ndGg7IGkrKykge1xuICAgICAgdmFyIHNlbCA9IGdldEJldHdlZW4odGhpcyQxLCByYW5nZXNbaV0uZnJvbSgpLCByYW5nZXNbaV0udG8oKSk7XG4gICAgICBsaW5lcyA9IGxpbmVzID8gbGluZXMuY29uY2F0KHNlbCkgOiBzZWw7XG4gICAgfVxuICAgIGlmIChsaW5lU2VwID09PSBmYWxzZSkgeyByZXR1cm4gbGluZXMgfVxuICAgIGVsc2UgeyByZXR1cm4gbGluZXMuam9pbihsaW5lU2VwIHx8IHRoaXMubGluZVNlcGFyYXRvcigpKSB9XG4gIH0sXG4gIGdldFNlbGVjdGlvbnM6IGZ1bmN0aW9uKGxpbmVTZXApIHtcbiAgICB2YXIgdGhpcyQxID0gdGhpcztcblxuICAgIHZhciBwYXJ0cyA9IFtdLCByYW5nZXMgPSB0aGlzLnNlbC5yYW5nZXM7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCByYW5nZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciBzZWwgPSBnZXRCZXR3ZWVuKHRoaXMkMSwgcmFuZ2VzW2ldLmZyb20oKSwgcmFuZ2VzW2ldLnRvKCkpO1xuICAgICAgaWYgKGxpbmVTZXAgIT09IGZhbHNlKSB7IHNlbCA9IHNlbC5qb2luKGxpbmVTZXAgfHwgdGhpcyQxLmxpbmVTZXBhcmF0b3IoKSk7IH1cbiAgICAgIHBhcnRzW2ldID0gc2VsO1xuICAgIH1cbiAgICByZXR1cm4gcGFydHNcbiAgfSxcbiAgcmVwbGFjZVNlbGVjdGlvbjogZnVuY3Rpb24oY29kZSwgY29sbGFwc2UsIG9yaWdpbikge1xuICAgIHZhciBkdXAgPSBbXTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMuc2VsLnJhbmdlcy5sZW5ndGg7IGkrKylcbiAgICAgIHsgZHVwW2ldID0gY29kZTsgfVxuICAgIHRoaXMucmVwbGFjZVNlbGVjdGlvbnMoZHVwLCBjb2xsYXBzZSwgb3JpZ2luIHx8IFwiK2lucHV0XCIpO1xuICB9LFxuICByZXBsYWNlU2VsZWN0aW9uczogZG9jTWV0aG9kT3AoZnVuY3Rpb24oY29kZSwgY29sbGFwc2UsIG9yaWdpbikge1xuICAgIHZhciB0aGlzJDEgPSB0aGlzO1xuXG4gICAgdmFyIGNoYW5nZXMgPSBbXSwgc2VsID0gdGhpcy5zZWw7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBzZWwucmFuZ2VzLmxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIgcmFuZ2UkJDEgPSBzZWwucmFuZ2VzW2ldO1xuICAgICAgY2hhbmdlc1tpXSA9IHtmcm9tOiByYW5nZSQkMS5mcm9tKCksIHRvOiByYW5nZSQkMS50bygpLCB0ZXh0OiB0aGlzJDEuc3BsaXRMaW5lcyhjb2RlW2ldKSwgb3JpZ2luOiBvcmlnaW59O1xuICAgIH1cbiAgICB2YXIgbmV3U2VsID0gY29sbGFwc2UgJiYgY29sbGFwc2UgIT0gXCJlbmRcIiAmJiBjb21wdXRlUmVwbGFjZWRTZWwodGhpcywgY2hhbmdlcywgY29sbGFwc2UpO1xuICAgIGZvciAodmFyIGkkMSA9IGNoYW5nZXMubGVuZ3RoIC0gMTsgaSQxID49IDA7IGkkMS0tKVxuICAgICAgeyBtYWtlQ2hhbmdlKHRoaXMkMSwgY2hhbmdlc1tpJDFdKTsgfVxuICAgIGlmIChuZXdTZWwpIHsgc2V0U2VsZWN0aW9uUmVwbGFjZUhpc3RvcnkodGhpcywgbmV3U2VsKTsgfVxuICAgIGVsc2UgaWYgKHRoaXMuY20pIHsgZW5zdXJlQ3Vyc29yVmlzaWJsZSh0aGlzLmNtKTsgfVxuICB9KSxcbiAgdW5kbzogZG9jTWV0aG9kT3AoZnVuY3Rpb24oKSB7bWFrZUNoYW5nZUZyb21IaXN0b3J5KHRoaXMsIFwidW5kb1wiKTt9KSxcbiAgcmVkbzogZG9jTWV0aG9kT3AoZnVuY3Rpb24oKSB7bWFrZUNoYW5nZUZyb21IaXN0b3J5KHRoaXMsIFwicmVkb1wiKTt9KSxcbiAgdW5kb1NlbGVjdGlvbjogZG9jTWV0aG9kT3AoZnVuY3Rpb24oKSB7bWFrZUNoYW5nZUZyb21IaXN0b3J5KHRoaXMsIFwidW5kb1wiLCB0cnVlKTt9KSxcbiAgcmVkb1NlbGVjdGlvbjogZG9jTWV0aG9kT3AoZnVuY3Rpb24oKSB7bWFrZUNoYW5nZUZyb21IaXN0b3J5KHRoaXMsIFwicmVkb1wiLCB0cnVlKTt9KSxcblxuICBzZXRFeHRlbmRpbmc6IGZ1bmN0aW9uKHZhbCkge3RoaXMuZXh0ZW5kID0gdmFsO30sXG4gIGdldEV4dGVuZGluZzogZnVuY3Rpb24oKSB7cmV0dXJuIHRoaXMuZXh0ZW5kfSxcblxuICBoaXN0b3J5U2l6ZTogZnVuY3Rpb24oKSB7XG4gICAgdmFyIGhpc3QgPSB0aGlzLmhpc3RvcnksIGRvbmUgPSAwLCB1bmRvbmUgPSAwO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgaGlzdC5kb25lLmxlbmd0aDsgaSsrKSB7IGlmICghaGlzdC5kb25lW2ldLnJhbmdlcykgeyArK2RvbmU7IH0gfVxuICAgIGZvciAodmFyIGkkMSA9IDA7IGkkMSA8IGhpc3QudW5kb25lLmxlbmd0aDsgaSQxKyspIHsgaWYgKCFoaXN0LnVuZG9uZVtpJDFdLnJhbmdlcykgeyArK3VuZG9uZTsgfSB9XG4gICAgcmV0dXJuIHt1bmRvOiBkb25lLCByZWRvOiB1bmRvbmV9XG4gIH0sXG4gIGNsZWFySGlzdG9yeTogZnVuY3Rpb24oKSB7dGhpcy5oaXN0b3J5ID0gbmV3IEhpc3RvcnkodGhpcy5oaXN0b3J5Lm1heEdlbmVyYXRpb24pO30sXG5cbiAgbWFya0NsZWFuOiBmdW5jdGlvbigpIHtcbiAgICB0aGlzLmNsZWFuR2VuZXJhdGlvbiA9IHRoaXMuY2hhbmdlR2VuZXJhdGlvbih0cnVlKTtcbiAgfSxcbiAgY2hhbmdlR2VuZXJhdGlvbjogZnVuY3Rpb24oZm9yY2VTcGxpdCkge1xuICAgIGlmIChmb3JjZVNwbGl0KVxuICAgICAgeyB0aGlzLmhpc3RvcnkubGFzdE9wID0gdGhpcy5oaXN0b3J5Lmxhc3RTZWxPcCA9IHRoaXMuaGlzdG9yeS5sYXN0T3JpZ2luID0gbnVsbDsgfVxuICAgIHJldHVybiB0aGlzLmhpc3RvcnkuZ2VuZXJhdGlvblxuICB9LFxuICBpc0NsZWFuOiBmdW5jdGlvbiAoZ2VuKSB7XG4gICAgcmV0dXJuIHRoaXMuaGlzdG9yeS5nZW5lcmF0aW9uID09IChnZW4gfHwgdGhpcy5jbGVhbkdlbmVyYXRpb24pXG4gIH0sXG5cbiAgZ2V0SGlzdG9yeTogZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHtkb25lOiBjb3B5SGlzdG9yeUFycmF5KHRoaXMuaGlzdG9yeS5kb25lKSxcbiAgICAgICAgICAgIHVuZG9uZTogY29weUhpc3RvcnlBcnJheSh0aGlzLmhpc3RvcnkudW5kb25lKX1cbiAgfSxcbiAgc2V0SGlzdG9yeTogZnVuY3Rpb24oaGlzdERhdGEpIHtcbiAgICB2YXIgaGlzdCA9IHRoaXMuaGlzdG9yeSA9IG5ldyBIaXN0b3J5KHRoaXMuaGlzdG9yeS5tYXhHZW5lcmF0aW9uKTtcbiAgICBoaXN0LmRvbmUgPSBjb3B5SGlzdG9yeUFycmF5KGhpc3REYXRhLmRvbmUuc2xpY2UoMCksIG51bGwsIHRydWUpO1xuICAgIGhpc3QudW5kb25lID0gY29weUhpc3RvcnlBcnJheShoaXN0RGF0YS51bmRvbmUuc2xpY2UoMCksIG51bGwsIHRydWUpO1xuICB9LFxuXG4gIHNldEd1dHRlck1hcmtlcjogZG9jTWV0aG9kT3AoZnVuY3Rpb24obGluZSwgZ3V0dGVySUQsIHZhbHVlKSB7XG4gICAgcmV0dXJuIGNoYW5nZUxpbmUodGhpcywgbGluZSwgXCJndXR0ZXJcIiwgZnVuY3Rpb24gKGxpbmUpIHtcbiAgICAgIHZhciBtYXJrZXJzID0gbGluZS5ndXR0ZXJNYXJrZXJzIHx8IChsaW5lLmd1dHRlck1hcmtlcnMgPSB7fSk7XG4gICAgICBtYXJrZXJzW2d1dHRlcklEXSA9IHZhbHVlO1xuICAgICAgaWYgKCF2YWx1ZSAmJiBpc0VtcHR5KG1hcmtlcnMpKSB7IGxpbmUuZ3V0dGVyTWFya2VycyA9IG51bGw7IH1cbiAgICAgIHJldHVybiB0cnVlXG4gICAgfSlcbiAgfSksXG5cbiAgY2xlYXJHdXR0ZXI6IGRvY01ldGhvZE9wKGZ1bmN0aW9uKGd1dHRlcklEKSB7XG4gICAgdmFyIHRoaXMkMSA9IHRoaXM7XG5cbiAgICB0aGlzLml0ZXIoZnVuY3Rpb24gKGxpbmUpIHtcbiAgICAgIGlmIChsaW5lLmd1dHRlck1hcmtlcnMgJiYgbGluZS5ndXR0ZXJNYXJrZXJzW2d1dHRlcklEXSkge1xuICAgICAgICBjaGFuZ2VMaW5lKHRoaXMkMSwgbGluZSwgXCJndXR0ZXJcIiwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGxpbmUuZ3V0dGVyTWFya2Vyc1tndXR0ZXJJRF0gPSBudWxsO1xuICAgICAgICAgIGlmIChpc0VtcHR5KGxpbmUuZ3V0dGVyTWFya2VycykpIHsgbGluZS5ndXR0ZXJNYXJrZXJzID0gbnVsbDsgfVxuICAgICAgICAgIHJldHVybiB0cnVlXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH0pO1xuICB9KSxcblxuICBsaW5lSW5mbzogZnVuY3Rpb24obGluZSkge1xuICAgIHZhciBuO1xuICAgIGlmICh0eXBlb2YgbGluZSA9PSBcIm51bWJlclwiKSB7XG4gICAgICBpZiAoIWlzTGluZSh0aGlzLCBsaW5lKSkgeyByZXR1cm4gbnVsbCB9XG4gICAgICBuID0gbGluZTtcbiAgICAgIGxpbmUgPSBnZXRMaW5lKHRoaXMsIGxpbmUpO1xuICAgICAgaWYgKCFsaW5lKSB7IHJldHVybiBudWxsIH1cbiAgICB9IGVsc2Uge1xuICAgICAgbiA9IGxpbmVObyhsaW5lKTtcbiAgICAgIGlmIChuID09IG51bGwpIHsgcmV0dXJuIG51bGwgfVxuICAgIH1cbiAgICByZXR1cm4ge2xpbmU6IG4sIGhhbmRsZTogbGluZSwgdGV4dDogbGluZS50ZXh0LCBndXR0ZXJNYXJrZXJzOiBsaW5lLmd1dHRlck1hcmtlcnMsXG4gICAgICAgICAgICB0ZXh0Q2xhc3M6IGxpbmUudGV4dENsYXNzLCBiZ0NsYXNzOiBsaW5lLmJnQ2xhc3MsIHdyYXBDbGFzczogbGluZS53cmFwQ2xhc3MsXG4gICAgICAgICAgICB3aWRnZXRzOiBsaW5lLndpZGdldHN9XG4gIH0sXG5cbiAgYWRkTGluZUNsYXNzOiBkb2NNZXRob2RPcChmdW5jdGlvbihoYW5kbGUsIHdoZXJlLCBjbHMpIHtcbiAgICByZXR1cm4gY2hhbmdlTGluZSh0aGlzLCBoYW5kbGUsIHdoZXJlID09IFwiZ3V0dGVyXCIgPyBcImd1dHRlclwiIDogXCJjbGFzc1wiLCBmdW5jdGlvbiAobGluZSkge1xuICAgICAgdmFyIHByb3AgPSB3aGVyZSA9PSBcInRleHRcIiA/IFwidGV4dENsYXNzXCJcbiAgICAgICAgICAgICAgIDogd2hlcmUgPT0gXCJiYWNrZ3JvdW5kXCIgPyBcImJnQ2xhc3NcIlxuICAgICAgICAgICAgICAgOiB3aGVyZSA9PSBcImd1dHRlclwiID8gXCJndXR0ZXJDbGFzc1wiIDogXCJ3cmFwQ2xhc3NcIjtcbiAgICAgIGlmICghbGluZVtwcm9wXSkgeyBsaW5lW3Byb3BdID0gY2xzOyB9XG4gICAgICBlbHNlIGlmIChjbGFzc1Rlc3QoY2xzKS50ZXN0KGxpbmVbcHJvcF0pKSB7IHJldHVybiBmYWxzZSB9XG4gICAgICBlbHNlIHsgbGluZVtwcm9wXSArPSBcIiBcIiArIGNsczsgfVxuICAgICAgcmV0dXJuIHRydWVcbiAgICB9KVxuICB9KSxcbiAgcmVtb3ZlTGluZUNsYXNzOiBkb2NNZXRob2RPcChmdW5jdGlvbihoYW5kbGUsIHdoZXJlLCBjbHMpIHtcbiAgICByZXR1cm4gY2hhbmdlTGluZSh0aGlzLCBoYW5kbGUsIHdoZXJlID09IFwiZ3V0dGVyXCIgPyBcImd1dHRlclwiIDogXCJjbGFzc1wiLCBmdW5jdGlvbiAobGluZSkge1xuICAgICAgdmFyIHByb3AgPSB3aGVyZSA9PSBcInRleHRcIiA/IFwidGV4dENsYXNzXCJcbiAgICAgICAgICAgICAgIDogd2hlcmUgPT0gXCJiYWNrZ3JvdW5kXCIgPyBcImJnQ2xhc3NcIlxuICAgICAgICAgICAgICAgOiB3aGVyZSA9PSBcImd1dHRlclwiID8gXCJndXR0ZXJDbGFzc1wiIDogXCJ3cmFwQ2xhc3NcIjtcbiAgICAgIHZhciBjdXIgPSBsaW5lW3Byb3BdO1xuICAgICAgaWYgKCFjdXIpIHsgcmV0dXJuIGZhbHNlIH1cbiAgICAgIGVsc2UgaWYgKGNscyA9PSBudWxsKSB7IGxpbmVbcHJvcF0gPSBudWxsOyB9XG4gICAgICBlbHNlIHtcbiAgICAgICAgdmFyIGZvdW5kID0gY3VyLm1hdGNoKGNsYXNzVGVzdChjbHMpKTtcbiAgICAgICAgaWYgKCFmb3VuZCkgeyByZXR1cm4gZmFsc2UgfVxuICAgICAgICB2YXIgZW5kID0gZm91bmQuaW5kZXggKyBmb3VuZFswXS5sZW5ndGg7XG4gICAgICAgIGxpbmVbcHJvcF0gPSBjdXIuc2xpY2UoMCwgZm91bmQuaW5kZXgpICsgKCFmb3VuZC5pbmRleCB8fCBlbmQgPT0gY3VyLmxlbmd0aCA/IFwiXCIgOiBcIiBcIikgKyBjdXIuc2xpY2UoZW5kKSB8fCBudWxsO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRydWVcbiAgICB9KVxuICB9KSxcblxuICBhZGRMaW5lV2lkZ2V0OiBkb2NNZXRob2RPcChmdW5jdGlvbihoYW5kbGUsIG5vZGUsIG9wdGlvbnMpIHtcbiAgICByZXR1cm4gYWRkTGluZVdpZGdldCh0aGlzLCBoYW5kbGUsIG5vZGUsIG9wdGlvbnMpXG4gIH0pLFxuICByZW1vdmVMaW5lV2lkZ2V0OiBmdW5jdGlvbih3aWRnZXQpIHsgd2lkZ2V0LmNsZWFyKCk7IH0sXG5cbiAgbWFya1RleHQ6IGZ1bmN0aW9uKGZyb20sIHRvLCBvcHRpb25zKSB7XG4gICAgcmV0dXJuIG1hcmtUZXh0KHRoaXMsIGNsaXBQb3ModGhpcywgZnJvbSksIGNsaXBQb3ModGhpcywgdG8pLCBvcHRpb25zLCBvcHRpb25zICYmIG9wdGlvbnMudHlwZSB8fCBcInJhbmdlXCIpXG4gIH0sXG4gIHNldEJvb2ttYXJrOiBmdW5jdGlvbihwb3MsIG9wdGlvbnMpIHtcbiAgICB2YXIgcmVhbE9wdHMgPSB7cmVwbGFjZWRXaXRoOiBvcHRpb25zICYmIChvcHRpb25zLm5vZGVUeXBlID09IG51bGwgPyBvcHRpb25zLndpZGdldCA6IG9wdGlvbnMpLFxuICAgICAgICAgICAgICAgICAgICBpbnNlcnRMZWZ0OiBvcHRpb25zICYmIG9wdGlvbnMuaW5zZXJ0TGVmdCxcbiAgICAgICAgICAgICAgICAgICAgY2xlYXJXaGVuRW1wdHk6IGZhbHNlLCBzaGFyZWQ6IG9wdGlvbnMgJiYgb3B0aW9ucy5zaGFyZWQsXG4gICAgICAgICAgICAgICAgICAgIGhhbmRsZU1vdXNlRXZlbnRzOiBvcHRpb25zICYmIG9wdGlvbnMuaGFuZGxlTW91c2VFdmVudHN9O1xuICAgIHBvcyA9IGNsaXBQb3ModGhpcywgcG9zKTtcbiAgICByZXR1cm4gbWFya1RleHQodGhpcywgcG9zLCBwb3MsIHJlYWxPcHRzLCBcImJvb2ttYXJrXCIpXG4gIH0sXG4gIGZpbmRNYXJrc0F0OiBmdW5jdGlvbihwb3MpIHtcbiAgICBwb3MgPSBjbGlwUG9zKHRoaXMsIHBvcyk7XG4gICAgdmFyIG1hcmtlcnMgPSBbXSwgc3BhbnMgPSBnZXRMaW5lKHRoaXMsIHBvcy5saW5lKS5tYXJrZWRTcGFucztcbiAgICBpZiAoc3BhbnMpIHsgZm9yICh2YXIgaSA9IDA7IGkgPCBzcGFucy5sZW5ndGg7ICsraSkge1xuICAgICAgdmFyIHNwYW4gPSBzcGFuc1tpXTtcbiAgICAgIGlmICgoc3Bhbi5mcm9tID09IG51bGwgfHwgc3Bhbi5mcm9tIDw9IHBvcy5jaCkgJiZcbiAgICAgICAgICAoc3Bhbi50byA9PSBudWxsIHx8IHNwYW4udG8gPj0gcG9zLmNoKSlcbiAgICAgICAgeyBtYXJrZXJzLnB1c2goc3Bhbi5tYXJrZXIucGFyZW50IHx8IHNwYW4ubWFya2VyKTsgfVxuICAgIH0gfVxuICAgIHJldHVybiBtYXJrZXJzXG4gIH0sXG4gIGZpbmRNYXJrczogZnVuY3Rpb24oZnJvbSwgdG8sIGZpbHRlcikge1xuICAgIGZyb20gPSBjbGlwUG9zKHRoaXMsIGZyb20pOyB0byA9IGNsaXBQb3ModGhpcywgdG8pO1xuICAgIHZhciBmb3VuZCA9IFtdLCBsaW5lTm8kJDEgPSBmcm9tLmxpbmU7XG4gICAgdGhpcy5pdGVyKGZyb20ubGluZSwgdG8ubGluZSArIDEsIGZ1bmN0aW9uIChsaW5lKSB7XG4gICAgICB2YXIgc3BhbnMgPSBsaW5lLm1hcmtlZFNwYW5zO1xuICAgICAgaWYgKHNwYW5zKSB7IGZvciAodmFyIGkgPSAwOyBpIDwgc3BhbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFyIHNwYW4gPSBzcGFuc1tpXTtcbiAgICAgICAgaWYgKCEoc3Bhbi50byAhPSBudWxsICYmIGxpbmVObyQkMSA9PSBmcm9tLmxpbmUgJiYgZnJvbS5jaCA+PSBzcGFuLnRvIHx8XG4gICAgICAgICAgICAgIHNwYW4uZnJvbSA9PSBudWxsICYmIGxpbmVObyQkMSAhPSBmcm9tLmxpbmUgfHxcbiAgICAgICAgICAgICAgc3Bhbi5mcm9tICE9IG51bGwgJiYgbGluZU5vJCQxID09IHRvLmxpbmUgJiYgc3Bhbi5mcm9tID49IHRvLmNoKSAmJlxuICAgICAgICAgICAgKCFmaWx0ZXIgfHwgZmlsdGVyKHNwYW4ubWFya2VyKSkpXG4gICAgICAgICAgeyBmb3VuZC5wdXNoKHNwYW4ubWFya2VyLnBhcmVudCB8fCBzcGFuLm1hcmtlcik7IH1cbiAgICAgIH0gfVxuICAgICAgKytsaW5lTm8kJDE7XG4gICAgfSk7XG4gICAgcmV0dXJuIGZvdW5kXG4gIH0sXG4gIGdldEFsbE1hcmtzOiBmdW5jdGlvbigpIHtcbiAgICB2YXIgbWFya2VycyA9IFtdO1xuICAgIHRoaXMuaXRlcihmdW5jdGlvbiAobGluZSkge1xuICAgICAgdmFyIHNwcyA9IGxpbmUubWFya2VkU3BhbnM7XG4gICAgICBpZiAoc3BzKSB7IGZvciAodmFyIGkgPSAwOyBpIDwgc3BzLmxlbmd0aDsgKytpKVxuICAgICAgICB7IGlmIChzcHNbaV0uZnJvbSAhPSBudWxsKSB7IG1hcmtlcnMucHVzaChzcHNbaV0ubWFya2VyKTsgfSB9IH1cbiAgICB9KTtcbiAgICByZXR1cm4gbWFya2Vyc1xuICB9LFxuXG4gIHBvc0Zyb21JbmRleDogZnVuY3Rpb24ob2ZmKSB7XG4gICAgdmFyIGNoLCBsaW5lTm8kJDEgPSB0aGlzLmZpcnN0LCBzZXBTaXplID0gdGhpcy5saW5lU2VwYXJhdG9yKCkubGVuZ3RoO1xuICAgIHRoaXMuaXRlcihmdW5jdGlvbiAobGluZSkge1xuICAgICAgdmFyIHN6ID0gbGluZS50ZXh0Lmxlbmd0aCArIHNlcFNpemU7XG4gICAgICBpZiAoc3ogPiBvZmYpIHsgY2ggPSBvZmY7IHJldHVybiB0cnVlIH1cbiAgICAgIG9mZiAtPSBzejtcbiAgICAgICsrbGluZU5vJCQxO1xuICAgIH0pO1xuICAgIHJldHVybiBjbGlwUG9zKHRoaXMsIFBvcyhsaW5lTm8kJDEsIGNoKSlcbiAgfSxcbiAgaW5kZXhGcm9tUG9zOiBmdW5jdGlvbiAoY29vcmRzKSB7XG4gICAgY29vcmRzID0gY2xpcFBvcyh0aGlzLCBjb29yZHMpO1xuICAgIHZhciBpbmRleCA9IGNvb3Jkcy5jaDtcbiAgICBpZiAoY29vcmRzLmxpbmUgPCB0aGlzLmZpcnN0IHx8IGNvb3Jkcy5jaCA8IDApIHsgcmV0dXJuIDAgfVxuICAgIHZhciBzZXBTaXplID0gdGhpcy5saW5lU2VwYXJhdG9yKCkubGVuZ3RoO1xuICAgIHRoaXMuaXRlcih0aGlzLmZpcnN0LCBjb29yZHMubGluZSwgZnVuY3Rpb24gKGxpbmUpIHsgLy8gaXRlciBhYm9ydHMgd2hlbiBjYWxsYmFjayByZXR1cm5zIGEgdHJ1dGh5IHZhbHVlXG4gICAgICBpbmRleCArPSBsaW5lLnRleHQubGVuZ3RoICsgc2VwU2l6ZTtcbiAgICB9KTtcbiAgICByZXR1cm4gaW5kZXhcbiAgfSxcblxuICBjb3B5OiBmdW5jdGlvbihjb3B5SGlzdG9yeSkge1xuICAgIHZhciBkb2MgPSBuZXcgRG9jKGdldExpbmVzKHRoaXMsIHRoaXMuZmlyc3QsIHRoaXMuZmlyc3QgKyB0aGlzLnNpemUpLFxuICAgICAgICAgICAgICAgICAgICAgIHRoaXMubW9kZU9wdGlvbiwgdGhpcy5maXJzdCwgdGhpcy5saW5lU2VwLCB0aGlzLmRpcmVjdGlvbik7XG4gICAgZG9jLnNjcm9sbFRvcCA9IHRoaXMuc2Nyb2xsVG9wOyBkb2Muc2Nyb2xsTGVmdCA9IHRoaXMuc2Nyb2xsTGVmdDtcbiAgICBkb2Muc2VsID0gdGhpcy5zZWw7XG4gICAgZG9jLmV4dGVuZCA9IGZhbHNlO1xuICAgIGlmIChjb3B5SGlzdG9yeSkge1xuICAgICAgZG9jLmhpc3RvcnkudW5kb0RlcHRoID0gdGhpcy5oaXN0b3J5LnVuZG9EZXB0aDtcbiAgICAgIGRvYy5zZXRIaXN0b3J5KHRoaXMuZ2V0SGlzdG9yeSgpKTtcbiAgICB9XG4gICAgcmV0dXJuIGRvY1xuICB9LFxuXG4gIGxpbmtlZERvYzogZnVuY3Rpb24ob3B0aW9ucykge1xuICAgIGlmICghb3B0aW9ucykgeyBvcHRpb25zID0ge307IH1cbiAgICB2YXIgZnJvbSA9IHRoaXMuZmlyc3QsIHRvID0gdGhpcy5maXJzdCArIHRoaXMuc2l6ZTtcbiAgICBpZiAob3B0aW9ucy5mcm9tICE9IG51bGwgJiYgb3B0aW9ucy5mcm9tID4gZnJvbSkgeyBmcm9tID0gb3B0aW9ucy5mcm9tOyB9XG4gICAgaWYgKG9wdGlvbnMudG8gIT0gbnVsbCAmJiBvcHRpb25zLnRvIDwgdG8pIHsgdG8gPSBvcHRpb25zLnRvOyB9XG4gICAgdmFyIGNvcHkgPSBuZXcgRG9jKGdldExpbmVzKHRoaXMsIGZyb20sIHRvKSwgb3B0aW9ucy5tb2RlIHx8IHRoaXMubW9kZU9wdGlvbiwgZnJvbSwgdGhpcy5saW5lU2VwLCB0aGlzLmRpcmVjdGlvbik7XG4gICAgaWYgKG9wdGlvbnMuc2hhcmVkSGlzdCkgeyBjb3B5Lmhpc3RvcnkgPSB0aGlzLmhpc3RvcnlcbiAgICA7IH0odGhpcy5saW5rZWQgfHwgKHRoaXMubGlua2VkID0gW10pKS5wdXNoKHtkb2M6IGNvcHksIHNoYXJlZEhpc3Q6IG9wdGlvbnMuc2hhcmVkSGlzdH0pO1xuICAgIGNvcHkubGlua2VkID0gW3tkb2M6IHRoaXMsIGlzUGFyZW50OiB0cnVlLCBzaGFyZWRIaXN0OiBvcHRpb25zLnNoYXJlZEhpc3R9XTtcbiAgICBjb3B5U2hhcmVkTWFya2Vycyhjb3B5LCBmaW5kU2hhcmVkTWFya2Vycyh0aGlzKSk7XG4gICAgcmV0dXJuIGNvcHlcbiAgfSxcbiAgdW5saW5rRG9jOiBmdW5jdGlvbihvdGhlcikge1xuICAgIHZhciB0aGlzJDEgPSB0aGlzO1xuXG4gICAgaWYgKG90aGVyIGluc3RhbmNlb2YgQ29kZU1pcnJvciQxKSB7IG90aGVyID0gb3RoZXIuZG9jOyB9XG4gICAgaWYgKHRoaXMubGlua2VkKSB7IGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5saW5rZWQubGVuZ3RoOyArK2kpIHtcbiAgICAgIHZhciBsaW5rID0gdGhpcyQxLmxpbmtlZFtpXTtcbiAgICAgIGlmIChsaW5rLmRvYyAhPSBvdGhlcikgeyBjb250aW51ZSB9XG4gICAgICB0aGlzJDEubGlua2VkLnNwbGljZShpLCAxKTtcbiAgICAgIG90aGVyLnVubGlua0RvYyh0aGlzJDEpO1xuICAgICAgZGV0YWNoU2hhcmVkTWFya2VycyhmaW5kU2hhcmVkTWFya2Vycyh0aGlzJDEpKTtcbiAgICAgIGJyZWFrXG4gICAgfSB9XG4gICAgLy8gSWYgdGhlIGhpc3RvcmllcyB3ZXJlIHNoYXJlZCwgc3BsaXQgdGhlbSBhZ2FpblxuICAgIGlmIChvdGhlci5oaXN0b3J5ID09IHRoaXMuaGlzdG9yeSkge1xuICAgICAgdmFyIHNwbGl0SWRzID0gW290aGVyLmlkXTtcbiAgICAgIGxpbmtlZERvY3Mob3RoZXIsIGZ1bmN0aW9uIChkb2MpIHsgcmV0dXJuIHNwbGl0SWRzLnB1c2goZG9jLmlkKTsgfSwgdHJ1ZSk7XG4gICAgICBvdGhlci5oaXN0b3J5ID0gbmV3IEhpc3RvcnkobnVsbCk7XG4gICAgICBvdGhlci5oaXN0b3J5LmRvbmUgPSBjb3B5SGlzdG9yeUFycmF5KHRoaXMuaGlzdG9yeS5kb25lLCBzcGxpdElkcyk7XG4gICAgICBvdGhlci5oaXN0b3J5LnVuZG9uZSA9IGNvcHlIaXN0b3J5QXJyYXkodGhpcy5oaXN0b3J5LnVuZG9uZSwgc3BsaXRJZHMpO1xuICAgIH1cbiAgfSxcbiAgaXRlckxpbmtlZERvY3M6IGZ1bmN0aW9uKGYpIHtsaW5rZWREb2NzKHRoaXMsIGYpO30sXG5cbiAgZ2V0TW9kZTogZnVuY3Rpb24oKSB7cmV0dXJuIHRoaXMubW9kZX0sXG4gIGdldEVkaXRvcjogZnVuY3Rpb24oKSB7cmV0dXJuIHRoaXMuY219LFxuXG4gIHNwbGl0TGluZXM6IGZ1bmN0aW9uKHN0cikge1xuICAgIGlmICh0aGlzLmxpbmVTZXApIHsgcmV0dXJuIHN0ci5zcGxpdCh0aGlzLmxpbmVTZXApIH1cbiAgICByZXR1cm4gc3BsaXRMaW5lc0F1dG8oc3RyKVxuICB9LFxuICBsaW5lU2VwYXJhdG9yOiBmdW5jdGlvbigpIHsgcmV0dXJuIHRoaXMubGluZVNlcCB8fCBcIlxcblwiIH0sXG5cbiAgc2V0RGlyZWN0aW9uOiBkb2NNZXRob2RPcChmdW5jdGlvbiAoZGlyKSB7XG4gICAgaWYgKGRpciAhPSBcInJ0bFwiKSB7IGRpciA9IFwibHRyXCI7IH1cbiAgICBpZiAoZGlyID09IHRoaXMuZGlyZWN0aW9uKSB7IHJldHVybiB9XG4gICAgdGhpcy5kaXJlY3Rpb24gPSBkaXI7XG4gICAgdGhpcy5pdGVyKGZ1bmN0aW9uIChsaW5lKSB7IHJldHVybiBsaW5lLm9yZGVyID0gbnVsbDsgfSk7XG4gICAgaWYgKHRoaXMuY20pIHsgZGlyZWN0aW9uQ2hhbmdlZCh0aGlzLmNtKTsgfVxuICB9KVxufSk7XG5cbi8vIFB1YmxpYyBhbGlhcy5cbkRvYy5wcm90b3R5cGUuZWFjaExpbmUgPSBEb2MucHJvdG90eXBlLml0ZXI7XG5cbi8vIEtsdWRnZSB0byB3b3JrIGFyb3VuZCBzdHJhbmdlIElFIGJlaGF2aW9yIHdoZXJlIGl0J2xsIHNvbWV0aW1lc1xuLy8gcmUtZmlyZSBhIHNlcmllcyBvZiBkcmFnLXJlbGF0ZWQgZXZlbnRzIHJpZ2h0IGFmdGVyIHRoZSBkcm9wICgjMTU1MSlcbnZhciBsYXN0RHJvcCA9IDA7XG5cbmZ1bmN0aW9uIG9uRHJvcChlKSB7XG4gIHZhciBjbSA9IHRoaXM7XG4gIGNsZWFyRHJhZ0N1cnNvcihjbSk7XG4gIGlmIChzaWduYWxET01FdmVudChjbSwgZSkgfHwgZXZlbnRJbldpZGdldChjbS5kaXNwbGF5LCBlKSlcbiAgICB7IHJldHVybiB9XG4gIGVfcHJldmVudERlZmF1bHQoZSk7XG4gIGlmIChpZSkgeyBsYXN0RHJvcCA9ICtuZXcgRGF0ZTsgfVxuICB2YXIgcG9zID0gcG9zRnJvbU1vdXNlKGNtLCBlLCB0cnVlKSwgZmlsZXMgPSBlLmRhdGFUcmFuc2Zlci5maWxlcztcbiAgaWYgKCFwb3MgfHwgY20uaXNSZWFkT25seSgpKSB7IHJldHVybiB9XG4gIC8vIE1pZ2h0IGJlIGEgZmlsZSBkcm9wLCBpbiB3aGljaCBjYXNlIHdlIHNpbXBseSBleHRyYWN0IHRoZSB0ZXh0XG4gIC8vIGFuZCBpbnNlcnQgaXQuXG4gIGlmIChmaWxlcyAmJiBmaWxlcy5sZW5ndGggJiYgd2luZG93LkZpbGVSZWFkZXIgJiYgd2luZG93LkZpbGUpIHtcbiAgICB2YXIgbiA9IGZpbGVzLmxlbmd0aCwgdGV4dCA9IEFycmF5KG4pLCByZWFkID0gMDtcbiAgICB2YXIgbG9hZEZpbGUgPSBmdW5jdGlvbiAoZmlsZSwgaSkge1xuICAgICAgaWYgKGNtLm9wdGlvbnMuYWxsb3dEcm9wRmlsZVR5cGVzICYmXG4gICAgICAgICAgaW5kZXhPZihjbS5vcHRpb25zLmFsbG93RHJvcEZpbGVUeXBlcywgZmlsZS50eXBlKSA9PSAtMSlcbiAgICAgICAgeyByZXR1cm4gfVxuXG4gICAgICB2YXIgcmVhZGVyID0gbmV3IEZpbGVSZWFkZXI7XG4gICAgICByZWFkZXIub25sb2FkID0gb3BlcmF0aW9uKGNtLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBjb250ZW50ID0gcmVhZGVyLnJlc3VsdDtcbiAgICAgICAgaWYgKC9bXFx4MDAtXFx4MDhcXHgwZS1cXHgxZl17Mn0vLnRlc3QoY29udGVudCkpIHsgY29udGVudCA9IFwiXCI7IH1cbiAgICAgICAgdGV4dFtpXSA9IGNvbnRlbnQ7XG4gICAgICAgIGlmICgrK3JlYWQgPT0gbikge1xuICAgICAgICAgIHBvcyA9IGNsaXBQb3MoY20uZG9jLCBwb3MpO1xuICAgICAgICAgIHZhciBjaGFuZ2UgPSB7ZnJvbTogcG9zLCB0bzogcG9zLFxuICAgICAgICAgICAgICAgICAgICAgICAgdGV4dDogY20uZG9jLnNwbGl0TGluZXModGV4dC5qb2luKGNtLmRvYy5saW5lU2VwYXJhdG9yKCkpKSxcbiAgICAgICAgICAgICAgICAgICAgICAgIG9yaWdpbjogXCJwYXN0ZVwifTtcbiAgICAgICAgICBtYWtlQ2hhbmdlKGNtLmRvYywgY2hhbmdlKTtcbiAgICAgICAgICBzZXRTZWxlY3Rpb25SZXBsYWNlSGlzdG9yeShjbS5kb2MsIHNpbXBsZVNlbGVjdGlvbihwb3MsIGNoYW5nZUVuZChjaGFuZ2UpKSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgcmVhZGVyLnJlYWRBc1RleHQoZmlsZSk7XG4gICAgfTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IG47ICsraSkgeyBsb2FkRmlsZShmaWxlc1tpXSwgaSk7IH1cbiAgfSBlbHNlIHsgLy8gTm9ybWFsIGRyb3BcbiAgICAvLyBEb24ndCBkbyBhIHJlcGxhY2UgaWYgdGhlIGRyb3AgaGFwcGVuZWQgaW5zaWRlIG9mIHRoZSBzZWxlY3RlZCB0ZXh0LlxuICAgIGlmIChjbS5zdGF0ZS5kcmFnZ2luZ1RleHQgJiYgY20uZG9jLnNlbC5jb250YWlucyhwb3MpID4gLTEpIHtcbiAgICAgIGNtLnN0YXRlLmRyYWdnaW5nVGV4dChlKTtcbiAgICAgIC8vIEVuc3VyZSB0aGUgZWRpdG9yIGlzIHJlLWZvY3VzZWRcbiAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24gKCkgeyByZXR1cm4gY20uZGlzcGxheS5pbnB1dC5mb2N1cygpOyB9LCAyMCk7XG4gICAgICByZXR1cm5cbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgIHZhciB0ZXh0JDEgPSBlLmRhdGFUcmFuc2Zlci5nZXREYXRhKFwiVGV4dFwiKTtcbiAgICAgIGlmICh0ZXh0JDEpIHtcbiAgICAgICAgdmFyIHNlbGVjdGVkO1xuICAgICAgICBpZiAoY20uc3RhdGUuZHJhZ2dpbmdUZXh0ICYmICFjbS5zdGF0ZS5kcmFnZ2luZ1RleHQuY29weSlcbiAgICAgICAgICB7IHNlbGVjdGVkID0gY20ubGlzdFNlbGVjdGlvbnMoKTsgfVxuICAgICAgICBzZXRTZWxlY3Rpb25Ob1VuZG8oY20uZG9jLCBzaW1wbGVTZWxlY3Rpb24ocG9zLCBwb3MpKTtcbiAgICAgICAgaWYgKHNlbGVjdGVkKSB7IGZvciAodmFyIGkkMSA9IDA7IGkkMSA8IHNlbGVjdGVkLmxlbmd0aDsgKytpJDEpXG4gICAgICAgICAgeyByZXBsYWNlUmFuZ2UoY20uZG9jLCBcIlwiLCBzZWxlY3RlZFtpJDFdLmFuY2hvciwgc2VsZWN0ZWRbaSQxXS5oZWFkLCBcImRyYWdcIik7IH0gfVxuICAgICAgICBjbS5yZXBsYWNlU2VsZWN0aW9uKHRleHQkMSwgXCJhcm91bmRcIiwgXCJwYXN0ZVwiKTtcbiAgICAgICAgY20uZGlzcGxheS5pbnB1dC5mb2N1cygpO1xuICAgICAgfVxuICAgIH1cbiAgICBjYXRjaChlKXt9XG4gIH1cbn1cblxuZnVuY3Rpb24gb25EcmFnU3RhcnQoY20sIGUpIHtcbiAgaWYgKGllICYmICghY20uc3RhdGUuZHJhZ2dpbmdUZXh0IHx8ICtuZXcgRGF0ZSAtIGxhc3REcm9wIDwgMTAwKSkgeyBlX3N0b3AoZSk7IHJldHVybiB9XG4gIGlmIChzaWduYWxET01FdmVudChjbSwgZSkgfHwgZXZlbnRJbldpZGdldChjbS5kaXNwbGF5LCBlKSkgeyByZXR1cm4gfVxuXG4gIGUuZGF0YVRyYW5zZmVyLnNldERhdGEoXCJUZXh0XCIsIGNtLmdldFNlbGVjdGlvbigpKTtcbiAgZS5kYXRhVHJhbnNmZXIuZWZmZWN0QWxsb3dlZCA9IFwiY29weU1vdmVcIjtcblxuICAvLyBVc2UgZHVtbXkgaW1hZ2UgaW5zdGVhZCBvZiBkZWZhdWx0IGJyb3dzZXJzIGltYWdlLlxuICAvLyBSZWNlbnQgU2FmYXJpICh+Ni4wLjIpIGhhdmUgYSB0ZW5kZW5jeSB0byBzZWdmYXVsdCB3aGVuIHRoaXMgaGFwcGVucywgc28gd2UgZG9uJ3QgZG8gaXQgdGhlcmUuXG4gIGlmIChlLmRhdGFUcmFuc2Zlci5zZXREcmFnSW1hZ2UgJiYgIXNhZmFyaSkge1xuICAgIHZhciBpbWcgPSBlbHQoXCJpbWdcIiwgbnVsbCwgbnVsbCwgXCJwb3NpdGlvbjogZml4ZWQ7IGxlZnQ6IDA7IHRvcDogMDtcIik7XG4gICAgaW1nLnNyYyA9IFwiZGF0YTppbWFnZS9naWY7YmFzZTY0LFIwbEdPRGxoQVFBQkFBQUFBQ0g1QkFFS0FBRUFMQUFBQUFBQkFBRUFBQUlDVEFFQU93PT1cIjtcbiAgICBpZiAocHJlc3RvKSB7XG4gICAgICBpbWcud2lkdGggPSBpbWcuaGVpZ2h0ID0gMTtcbiAgICAgIGNtLmRpc3BsYXkud3JhcHBlci5hcHBlbmRDaGlsZChpbWcpO1xuICAgICAgLy8gRm9yY2UgYSByZWxheW91dCwgb3IgT3BlcmEgd29uJ3QgdXNlIG91ciBpbWFnZSBmb3Igc29tZSBvYnNjdXJlIHJlYXNvblxuICAgICAgaW1nLl90b3AgPSBpbWcub2Zmc2V0VG9wO1xuICAgIH1cbiAgICBlLmRhdGFUcmFuc2Zlci5zZXREcmFnSW1hZ2UoaW1nLCAwLCAwKTtcbiAgICBpZiAocHJlc3RvKSB7IGltZy5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKGltZyk7IH1cbiAgfVxufVxuXG5mdW5jdGlvbiBvbkRyYWdPdmVyKGNtLCBlKSB7XG4gIHZhciBwb3MgPSBwb3NGcm9tTW91c2UoY20sIGUpO1xuICBpZiAoIXBvcykgeyByZXR1cm4gfVxuICB2YXIgZnJhZyA9IGRvY3VtZW50LmNyZWF0ZURvY3VtZW50RnJhZ21lbnQoKTtcbiAgZHJhd1NlbGVjdGlvbkN1cnNvcihjbSwgcG9zLCBmcmFnKTtcbiAgaWYgKCFjbS5kaXNwbGF5LmRyYWdDdXJzb3IpIHtcbiAgICBjbS5kaXNwbGF5LmRyYWdDdXJzb3IgPSBlbHQoXCJkaXZcIiwgbnVsbCwgXCJDb2RlTWlycm9yLWN1cnNvcnMgQ29kZU1pcnJvci1kcmFnY3Vyc29yc1wiKTtcbiAgICBjbS5kaXNwbGF5LmxpbmVTcGFjZS5pbnNlcnRCZWZvcmUoY20uZGlzcGxheS5kcmFnQ3Vyc29yLCBjbS5kaXNwbGF5LmN1cnNvckRpdik7XG4gIH1cbiAgcmVtb3ZlQ2hpbGRyZW5BbmRBZGQoY20uZGlzcGxheS5kcmFnQ3Vyc29yLCBmcmFnKTtcbn1cblxuZnVuY3Rpb24gY2xlYXJEcmFnQ3Vyc29yKGNtKSB7XG4gIGlmIChjbS5kaXNwbGF5LmRyYWdDdXJzb3IpIHtcbiAgICBjbS5kaXNwbGF5LmxpbmVTcGFjZS5yZW1vdmVDaGlsZChjbS5kaXNwbGF5LmRyYWdDdXJzb3IpO1xuICAgIGNtLmRpc3BsYXkuZHJhZ0N1cnNvciA9IG51bGw7XG4gIH1cbn1cblxuLy8gVGhlc2UgbXVzdCBiZSBoYW5kbGVkIGNhcmVmdWxseSwgYmVjYXVzZSBuYWl2ZWx5IHJlZ2lzdGVyaW5nIGFcbi8vIGhhbmRsZXIgZm9yIGVhY2ggZWRpdG9yIHdpbGwgY2F1c2UgdGhlIGVkaXRvcnMgdG8gbmV2ZXIgYmVcbi8vIGdhcmJhZ2UgY29sbGVjdGVkLlxuXG5mdW5jdGlvbiBmb3JFYWNoQ29kZU1pcnJvcihmKSB7XG4gIGlmICghZG9jdW1lbnQuZ2V0RWxlbWVudHNCeUNsYXNzTmFtZSkgeyByZXR1cm4gfVxuICB2YXIgYnlDbGFzcyA9IGRvY3VtZW50LmdldEVsZW1lbnRzQnlDbGFzc05hbWUoXCJDb2RlTWlycm9yXCIpO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGJ5Q2xhc3MubGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgY20gPSBieUNsYXNzW2ldLkNvZGVNaXJyb3I7XG4gICAgaWYgKGNtKSB7IGYoY20pOyB9XG4gIH1cbn1cblxudmFyIGdsb2JhbHNSZWdpc3RlcmVkID0gZmFsc2U7XG5mdW5jdGlvbiBlbnN1cmVHbG9iYWxIYW5kbGVycygpIHtcbiAgaWYgKGdsb2JhbHNSZWdpc3RlcmVkKSB7IHJldHVybiB9XG4gIHJlZ2lzdGVyR2xvYmFsSGFuZGxlcnMoKTtcbiAgZ2xvYmFsc1JlZ2lzdGVyZWQgPSB0cnVlO1xufVxuZnVuY3Rpb24gcmVnaXN0ZXJHbG9iYWxIYW5kbGVycygpIHtcbiAgLy8gV2hlbiB0aGUgd2luZG93IHJlc2l6ZXMsIHdlIG5lZWQgdG8gcmVmcmVzaCBhY3RpdmUgZWRpdG9ycy5cbiAgdmFyIHJlc2l6ZVRpbWVyO1xuICBvbih3aW5kb3csIFwicmVzaXplXCIsIGZ1bmN0aW9uICgpIHtcbiAgICBpZiAocmVzaXplVGltZXIgPT0gbnVsbCkgeyByZXNpemVUaW1lciA9IHNldFRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgcmVzaXplVGltZXIgPSBudWxsO1xuICAgICAgZm9yRWFjaENvZGVNaXJyb3Iob25SZXNpemUpO1xuICAgIH0sIDEwMCk7IH1cbiAgfSk7XG4gIC8vIFdoZW4gdGhlIHdpbmRvdyBsb3NlcyBmb2N1cywgd2Ugd2FudCB0byBzaG93IHRoZSBlZGl0b3IgYXMgYmx1cnJlZFxuICBvbih3aW5kb3csIFwiYmx1clwiLCBmdW5jdGlvbiAoKSB7IHJldHVybiBmb3JFYWNoQ29kZU1pcnJvcihvbkJsdXIpOyB9KTtcbn1cbi8vIENhbGxlZCB3aGVuIHRoZSB3aW5kb3cgcmVzaXplc1xuZnVuY3Rpb24gb25SZXNpemUoY20pIHtcbiAgdmFyIGQgPSBjbS5kaXNwbGF5O1xuICBpZiAoZC5sYXN0V3JhcEhlaWdodCA9PSBkLndyYXBwZXIuY2xpZW50SGVpZ2h0ICYmIGQubGFzdFdyYXBXaWR0aCA9PSBkLndyYXBwZXIuY2xpZW50V2lkdGgpXG4gICAgeyByZXR1cm4gfVxuICAvLyBNaWdodCBiZSBhIHRleHQgc2NhbGluZyBvcGVyYXRpb24sIGNsZWFyIHNpemUgY2FjaGVzLlxuICBkLmNhY2hlZENoYXJXaWR0aCA9IGQuY2FjaGVkVGV4dEhlaWdodCA9IGQuY2FjaGVkUGFkZGluZ0ggPSBudWxsO1xuICBkLnNjcm9sbGJhcnNDbGlwcGVkID0gZmFsc2U7XG4gIGNtLnNldFNpemUoKTtcbn1cblxudmFyIGtleU5hbWVzID0ge1xuICAzOiBcIlBhdXNlXCIsIDg6IFwiQmFja3NwYWNlXCIsIDk6IFwiVGFiXCIsIDEzOiBcIkVudGVyXCIsIDE2OiBcIlNoaWZ0XCIsIDE3OiBcIkN0cmxcIiwgMTg6IFwiQWx0XCIsXG4gIDE5OiBcIlBhdXNlXCIsIDIwOiBcIkNhcHNMb2NrXCIsIDI3OiBcIkVzY1wiLCAzMjogXCJTcGFjZVwiLCAzMzogXCJQYWdlVXBcIiwgMzQ6IFwiUGFnZURvd25cIiwgMzU6IFwiRW5kXCIsXG4gIDM2OiBcIkhvbWVcIiwgMzc6IFwiTGVmdFwiLCAzODogXCJVcFwiLCAzOTogXCJSaWdodFwiLCA0MDogXCJEb3duXCIsIDQ0OiBcIlByaW50U2NyblwiLCA0NTogXCJJbnNlcnRcIixcbiAgNDY6IFwiRGVsZXRlXCIsIDU5OiBcIjtcIiwgNjE6IFwiPVwiLCA5MTogXCJNb2RcIiwgOTI6IFwiTW9kXCIsIDkzOiBcIk1vZFwiLFxuICAxMDY6IFwiKlwiLCAxMDc6IFwiPVwiLCAxMDk6IFwiLVwiLCAxMTA6IFwiLlwiLCAxMTE6IFwiL1wiLCAxMjc6IFwiRGVsZXRlXCIsIDE0NTogXCJTY3JvbGxMb2NrXCIsXG4gIDE3MzogXCItXCIsIDE4NjogXCI7XCIsIDE4NzogXCI9XCIsIDE4ODogXCIsXCIsIDE4OTogXCItXCIsIDE5MDogXCIuXCIsIDE5MTogXCIvXCIsIDE5MjogXCJgXCIsIDIxOTogXCJbXCIsIDIyMDogXCJcXFxcXCIsXG4gIDIyMTogXCJdXCIsIDIyMjogXCInXCIsIDYzMjMyOiBcIlVwXCIsIDYzMjMzOiBcIkRvd25cIiwgNjMyMzQ6IFwiTGVmdFwiLCA2MzIzNTogXCJSaWdodFwiLCA2MzI3MjogXCJEZWxldGVcIixcbiAgNjMyNzM6IFwiSG9tZVwiLCA2MzI3NTogXCJFbmRcIiwgNjMyNzY6IFwiUGFnZVVwXCIsIDYzMjc3OiBcIlBhZ2VEb3duXCIsIDYzMzAyOiBcIkluc2VydFwiXG59O1xuXG4vLyBOdW1iZXIga2V5c1xuZm9yICh2YXIgaSA9IDA7IGkgPCAxMDsgaSsrKSB7IGtleU5hbWVzW2kgKyA0OF0gPSBrZXlOYW1lc1tpICsgOTZdID0gU3RyaW5nKGkpOyB9XG4vLyBBbHBoYWJldGljIGtleXNcbmZvciAodmFyIGkkMSA9IDY1OyBpJDEgPD0gOTA7IGkkMSsrKSB7IGtleU5hbWVzW2kkMV0gPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGkkMSk7IH1cbi8vIEZ1bmN0aW9uIGtleXNcbmZvciAodmFyIGkkMiA9IDE7IGkkMiA8PSAxMjsgaSQyKyspIHsga2V5TmFtZXNbaSQyICsgMTExXSA9IGtleU5hbWVzW2kkMiArIDYzMjM1XSA9IFwiRlwiICsgaSQyOyB9XG5cbnZhciBrZXlNYXAgPSB7fTtcblxua2V5TWFwLmJhc2ljID0ge1xuICBcIkxlZnRcIjogXCJnb0NoYXJMZWZ0XCIsIFwiUmlnaHRcIjogXCJnb0NoYXJSaWdodFwiLCBcIlVwXCI6IFwiZ29MaW5lVXBcIiwgXCJEb3duXCI6IFwiZ29MaW5lRG93blwiLFxuICBcIkVuZFwiOiBcImdvTGluZUVuZFwiLCBcIkhvbWVcIjogXCJnb0xpbmVTdGFydFNtYXJ0XCIsIFwiUGFnZVVwXCI6IFwiZ29QYWdlVXBcIiwgXCJQYWdlRG93blwiOiBcImdvUGFnZURvd25cIixcbiAgXCJEZWxldGVcIjogXCJkZWxDaGFyQWZ0ZXJcIiwgXCJCYWNrc3BhY2VcIjogXCJkZWxDaGFyQmVmb3JlXCIsIFwiU2hpZnQtQmFja3NwYWNlXCI6IFwiZGVsQ2hhckJlZm9yZVwiLFxuICBcIlRhYlwiOiBcImRlZmF1bHRUYWJcIiwgXCJTaGlmdC1UYWJcIjogXCJpbmRlbnRBdXRvXCIsXG4gIFwiRW50ZXJcIjogXCJuZXdsaW5lQW5kSW5kZW50XCIsIFwiSW5zZXJ0XCI6IFwidG9nZ2xlT3ZlcndyaXRlXCIsXG4gIFwiRXNjXCI6IFwic2luZ2xlU2VsZWN0aW9uXCJcbn07XG4vLyBOb3RlIHRoYXQgdGhlIHNhdmUgYW5kIGZpbmQtcmVsYXRlZCBjb21tYW5kcyBhcmVuJ3QgZGVmaW5lZCBieVxuLy8gZGVmYXVsdC4gVXNlciBjb2RlIG9yIGFkZG9ucyBjYW4gZGVmaW5lIHRoZW0uIFVua25vd24gY29tbWFuZHNcbi8vIGFyZSBzaW1wbHkgaWdub3JlZC5cbmtleU1hcC5wY0RlZmF1bHQgPSB7XG4gIFwiQ3RybC1BXCI6IFwic2VsZWN0QWxsXCIsIFwiQ3RybC1EXCI6IFwiZGVsZXRlTGluZVwiLCBcIkN0cmwtWlwiOiBcInVuZG9cIiwgXCJTaGlmdC1DdHJsLVpcIjogXCJyZWRvXCIsIFwiQ3RybC1ZXCI6IFwicmVkb1wiLFxuICBcIkN0cmwtSG9tZVwiOiBcImdvRG9jU3RhcnRcIiwgXCJDdHJsLUVuZFwiOiBcImdvRG9jRW5kXCIsIFwiQ3RybC1VcFwiOiBcImdvTGluZVVwXCIsIFwiQ3RybC1Eb3duXCI6IFwiZ29MaW5lRG93blwiLFxuICBcIkN0cmwtTGVmdFwiOiBcImdvR3JvdXBMZWZ0XCIsIFwiQ3RybC1SaWdodFwiOiBcImdvR3JvdXBSaWdodFwiLCBcIkFsdC1MZWZ0XCI6IFwiZ29MaW5lU3RhcnRcIiwgXCJBbHQtUmlnaHRcIjogXCJnb0xpbmVFbmRcIixcbiAgXCJDdHJsLUJhY2tzcGFjZVwiOiBcImRlbEdyb3VwQmVmb3JlXCIsIFwiQ3RybC1EZWxldGVcIjogXCJkZWxHcm91cEFmdGVyXCIsIFwiQ3RybC1TXCI6IFwic2F2ZVwiLCBcIkN0cmwtRlwiOiBcImZpbmRcIixcbiAgXCJDdHJsLUdcIjogXCJmaW5kTmV4dFwiLCBcIlNoaWZ0LUN0cmwtR1wiOiBcImZpbmRQcmV2XCIsIFwiU2hpZnQtQ3RybC1GXCI6IFwicmVwbGFjZVwiLCBcIlNoaWZ0LUN0cmwtUlwiOiBcInJlcGxhY2VBbGxcIixcbiAgXCJDdHJsLVtcIjogXCJpbmRlbnRMZXNzXCIsIFwiQ3RybC1dXCI6IFwiaW5kZW50TW9yZVwiLFxuICBcIkN0cmwtVVwiOiBcInVuZG9TZWxlY3Rpb25cIiwgXCJTaGlmdC1DdHJsLVVcIjogXCJyZWRvU2VsZWN0aW9uXCIsIFwiQWx0LVVcIjogXCJyZWRvU2VsZWN0aW9uXCIsXG4gIGZhbGx0aHJvdWdoOiBcImJhc2ljXCJcbn07XG4vLyBWZXJ5IGJhc2ljIHJlYWRsaW5lL2VtYWNzLXN0eWxlIGJpbmRpbmdzLCB3aGljaCBhcmUgc3RhbmRhcmQgb24gTWFjLlxua2V5TWFwLmVtYWNzeSA9IHtcbiAgXCJDdHJsLUZcIjogXCJnb0NoYXJSaWdodFwiLCBcIkN0cmwtQlwiOiBcImdvQ2hhckxlZnRcIiwgXCJDdHJsLVBcIjogXCJnb0xpbmVVcFwiLCBcIkN0cmwtTlwiOiBcImdvTGluZURvd25cIixcbiAgXCJBbHQtRlwiOiBcImdvV29yZFJpZ2h0XCIsIFwiQWx0LUJcIjogXCJnb1dvcmRMZWZ0XCIsIFwiQ3RybC1BXCI6IFwiZ29MaW5lU3RhcnRcIiwgXCJDdHJsLUVcIjogXCJnb0xpbmVFbmRcIixcbiAgXCJDdHJsLVZcIjogXCJnb1BhZ2VEb3duXCIsIFwiU2hpZnQtQ3RybC1WXCI6IFwiZ29QYWdlVXBcIiwgXCJDdHJsLURcIjogXCJkZWxDaGFyQWZ0ZXJcIiwgXCJDdHJsLUhcIjogXCJkZWxDaGFyQmVmb3JlXCIsXG4gIFwiQWx0LURcIjogXCJkZWxXb3JkQWZ0ZXJcIiwgXCJBbHQtQmFja3NwYWNlXCI6IFwiZGVsV29yZEJlZm9yZVwiLCBcIkN0cmwtS1wiOiBcImtpbGxMaW5lXCIsIFwiQ3RybC1UXCI6IFwidHJhbnNwb3NlQ2hhcnNcIixcbiAgXCJDdHJsLU9cIjogXCJvcGVuTGluZVwiXG59O1xua2V5TWFwLm1hY0RlZmF1bHQgPSB7XG4gIFwiQ21kLUFcIjogXCJzZWxlY3RBbGxcIiwgXCJDbWQtRFwiOiBcImRlbGV0ZUxpbmVcIiwgXCJDbWQtWlwiOiBcInVuZG9cIiwgXCJTaGlmdC1DbWQtWlwiOiBcInJlZG9cIiwgXCJDbWQtWVwiOiBcInJlZG9cIixcbiAgXCJDbWQtSG9tZVwiOiBcImdvRG9jU3RhcnRcIiwgXCJDbWQtVXBcIjogXCJnb0RvY1N0YXJ0XCIsIFwiQ21kLUVuZFwiOiBcImdvRG9jRW5kXCIsIFwiQ21kLURvd25cIjogXCJnb0RvY0VuZFwiLCBcIkFsdC1MZWZ0XCI6IFwiZ29Hcm91cExlZnRcIixcbiAgXCJBbHQtUmlnaHRcIjogXCJnb0dyb3VwUmlnaHRcIiwgXCJDbWQtTGVmdFwiOiBcImdvTGluZUxlZnRcIiwgXCJDbWQtUmlnaHRcIjogXCJnb0xpbmVSaWdodFwiLCBcIkFsdC1CYWNrc3BhY2VcIjogXCJkZWxHcm91cEJlZm9yZVwiLFxuICBcIkN0cmwtQWx0LUJhY2tzcGFjZVwiOiBcImRlbEdyb3VwQWZ0ZXJcIiwgXCJBbHQtRGVsZXRlXCI6IFwiZGVsR3JvdXBBZnRlclwiLCBcIkNtZC1TXCI6IFwic2F2ZVwiLCBcIkNtZC1GXCI6IFwiZmluZFwiLFxuICBcIkNtZC1HXCI6IFwiZmluZE5leHRcIiwgXCJTaGlmdC1DbWQtR1wiOiBcImZpbmRQcmV2XCIsIFwiQ21kLUFsdC1GXCI6IFwicmVwbGFjZVwiLCBcIlNoaWZ0LUNtZC1BbHQtRlwiOiBcInJlcGxhY2VBbGxcIixcbiAgXCJDbWQtW1wiOiBcImluZGVudExlc3NcIiwgXCJDbWQtXVwiOiBcImluZGVudE1vcmVcIiwgXCJDbWQtQmFja3NwYWNlXCI6IFwiZGVsV3JhcHBlZExpbmVMZWZ0XCIsIFwiQ21kLURlbGV0ZVwiOiBcImRlbFdyYXBwZWRMaW5lUmlnaHRcIixcbiAgXCJDbWQtVVwiOiBcInVuZG9TZWxlY3Rpb25cIiwgXCJTaGlmdC1DbWQtVVwiOiBcInJlZG9TZWxlY3Rpb25cIiwgXCJDdHJsLVVwXCI6IFwiZ29Eb2NTdGFydFwiLCBcIkN0cmwtRG93blwiOiBcImdvRG9jRW5kXCIsXG4gIGZhbGx0aHJvdWdoOiBbXCJiYXNpY1wiLCBcImVtYWNzeVwiXVxufTtcbmtleU1hcFtcImRlZmF1bHRcIl0gPSBtYWMgPyBrZXlNYXAubWFjRGVmYXVsdCA6IGtleU1hcC5wY0RlZmF1bHQ7XG5cbi8vIEtFWU1BUCBESVNQQVRDSFxuXG5mdW5jdGlvbiBub3JtYWxpemVLZXlOYW1lKG5hbWUpIHtcbiAgdmFyIHBhcnRzID0gbmFtZS5zcGxpdCgvLSg/ISQpLyk7XG4gIG5hbWUgPSBwYXJ0c1twYXJ0cy5sZW5ndGggLSAxXTtcbiAgdmFyIGFsdCwgY3RybCwgc2hpZnQsIGNtZDtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBwYXJ0cy5sZW5ndGggLSAxOyBpKyspIHtcbiAgICB2YXIgbW9kID0gcGFydHNbaV07XG4gICAgaWYgKC9eKGNtZHxtZXRhfG0pJC9pLnRlc3QobW9kKSkgeyBjbWQgPSB0cnVlOyB9XG4gICAgZWxzZSBpZiAoL15hKGx0KT8kL2kudGVzdChtb2QpKSB7IGFsdCA9IHRydWU7IH1cbiAgICBlbHNlIGlmICgvXihjfGN0cmx8Y29udHJvbCkkL2kudGVzdChtb2QpKSB7IGN0cmwgPSB0cnVlOyB9XG4gICAgZWxzZSBpZiAoL15zKGhpZnQpPyQvaS50ZXN0KG1vZCkpIHsgc2hpZnQgPSB0cnVlOyB9XG4gICAgZWxzZSB7IHRocm93IG5ldyBFcnJvcihcIlVucmVjb2duaXplZCBtb2RpZmllciBuYW1lOiBcIiArIG1vZCkgfVxuICB9XG4gIGlmIChhbHQpIHsgbmFtZSA9IFwiQWx0LVwiICsgbmFtZTsgfVxuICBpZiAoY3RybCkgeyBuYW1lID0gXCJDdHJsLVwiICsgbmFtZTsgfVxuICBpZiAoY21kKSB7IG5hbWUgPSBcIkNtZC1cIiArIG5hbWU7IH1cbiAgaWYgKHNoaWZ0KSB7IG5hbWUgPSBcIlNoaWZ0LVwiICsgbmFtZTsgfVxuICByZXR1cm4gbmFtZVxufVxuXG4vLyBUaGlzIGlzIGEga2x1ZGdlIHRvIGtlZXAga2V5bWFwcyBtb3N0bHkgd29ya2luZyBhcyByYXcgb2JqZWN0c1xuLy8gKGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5KSB3aGlsZSBhdCB0aGUgc2FtZSB0aW1lIHN1cHBvcnQgZmVhdHVyZXNcbi8vIGxpa2Ugbm9ybWFsaXphdGlvbiBhbmQgbXVsdGktc3Ryb2tlIGtleSBiaW5kaW5ncy4gSXQgY29tcGlsZXMgYVxuLy8gbmV3IG5vcm1hbGl6ZWQga2V5bWFwLCBhbmQgdGhlbiB1cGRhdGVzIHRoZSBvbGQgb2JqZWN0IHRvIHJlZmxlY3Rcbi8vIHRoaXMuXG5mdW5jdGlvbiBub3JtYWxpemVLZXlNYXAoa2V5bWFwKSB7XG4gIHZhciBjb3B5ID0ge307XG4gIGZvciAodmFyIGtleW5hbWUgaW4ga2V5bWFwKSB7IGlmIChrZXltYXAuaGFzT3duUHJvcGVydHkoa2V5bmFtZSkpIHtcbiAgICB2YXIgdmFsdWUgPSBrZXltYXBba2V5bmFtZV07XG4gICAgaWYgKC9eKG5hbWV8ZmFsbHRocm91Z2h8KGRlfGF0KXRhY2gpJC8udGVzdChrZXluYW1lKSkgeyBjb250aW51ZSB9XG4gICAgaWYgKHZhbHVlID09IFwiLi4uXCIpIHsgZGVsZXRlIGtleW1hcFtrZXluYW1lXTsgY29udGludWUgfVxuXG4gICAgdmFyIGtleXMgPSBtYXAoa2V5bmFtZS5zcGxpdChcIiBcIiksIG5vcm1hbGl6ZUtleU5hbWUpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwga2V5cy5sZW5ndGg7IGkrKykge1xuICAgICAgdmFyIHZhbCA9ICh2b2lkIDApLCBuYW1lID0gKHZvaWQgMCk7XG4gICAgICBpZiAoaSA9PSBrZXlzLmxlbmd0aCAtIDEpIHtcbiAgICAgICAgbmFtZSA9IGtleXMuam9pbihcIiBcIik7XG4gICAgICAgIHZhbCA9IHZhbHVlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbmFtZSA9IGtleXMuc2xpY2UoMCwgaSArIDEpLmpvaW4oXCIgXCIpO1xuICAgICAgICB2YWwgPSBcIi4uLlwiO1xuICAgICAgfVxuICAgICAgdmFyIHByZXYgPSBjb3B5W25hbWVdO1xuICAgICAgaWYgKCFwcmV2KSB7IGNvcHlbbmFtZV0gPSB2YWw7IH1cbiAgICAgIGVsc2UgaWYgKHByZXYgIT0gdmFsKSB7IHRocm93IG5ldyBFcnJvcihcIkluY29uc2lzdGVudCBiaW5kaW5ncyBmb3IgXCIgKyBuYW1lKSB9XG4gICAgfVxuICAgIGRlbGV0ZSBrZXltYXBba2V5bmFtZV07XG4gIH0gfVxuICBmb3IgKHZhciBwcm9wIGluIGNvcHkpIHsga2V5bWFwW3Byb3BdID0gY29weVtwcm9wXTsgfVxuICByZXR1cm4ga2V5bWFwXG59XG5cbmZ1bmN0aW9uIGxvb2t1cEtleShrZXksIG1hcCQkMSwgaGFuZGxlLCBjb250ZXh0KSB7XG4gIG1hcCQkMSA9IGdldEtleU1hcChtYXAkJDEpO1xuICB2YXIgZm91bmQgPSBtYXAkJDEuY2FsbCA/IG1hcCQkMS5jYWxsKGtleSwgY29udGV4dCkgOiBtYXAkJDFba2V5XTtcbiAgaWYgKGZvdW5kID09PSBmYWxzZSkgeyByZXR1cm4gXCJub3RoaW5nXCIgfVxuICBpZiAoZm91bmQgPT09IFwiLi4uXCIpIHsgcmV0dXJuIFwibXVsdGlcIiB9XG4gIGlmIChmb3VuZCAhPSBudWxsICYmIGhhbmRsZShmb3VuZCkpIHsgcmV0dXJuIFwiaGFuZGxlZFwiIH1cblxuICBpZiAobWFwJCQxLmZhbGx0aHJvdWdoKSB7XG4gICAgaWYgKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChtYXAkJDEuZmFsbHRocm91Z2gpICE9IFwiW29iamVjdCBBcnJheV1cIilcbiAgICAgIHsgcmV0dXJuIGxvb2t1cEtleShrZXksIG1hcCQkMS5mYWxsdGhyb3VnaCwgaGFuZGxlLCBjb250ZXh0KSB9XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBtYXAkJDEuZmFsbHRocm91Z2gubGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciByZXN1bHQgPSBsb29rdXBLZXkoa2V5LCBtYXAkJDEuZmFsbHRocm91Z2hbaV0sIGhhbmRsZSwgY29udGV4dCk7XG4gICAgICBpZiAocmVzdWx0KSB7IHJldHVybiByZXN1bHQgfVxuICAgIH1cbiAgfVxufVxuXG4vLyBNb2RpZmllciBrZXkgcHJlc3NlcyBkb24ndCBjb3VudCBhcyAncmVhbCcga2V5IHByZXNzZXMgZm9yIHRoZVxuLy8gcHVycG9zZSBvZiBrZXltYXAgZmFsbHRocm91Z2guXG5mdW5jdGlvbiBpc01vZGlmaWVyS2V5KHZhbHVlKSB7XG4gIHZhciBuYW1lID0gdHlwZW9mIHZhbHVlID09IFwic3RyaW5nXCIgPyB2YWx1ZSA6IGtleU5hbWVzW3ZhbHVlLmtleUNvZGVdO1xuICByZXR1cm4gbmFtZSA9PSBcIkN0cmxcIiB8fCBuYW1lID09IFwiQWx0XCIgfHwgbmFtZSA9PSBcIlNoaWZ0XCIgfHwgbmFtZSA9PSBcIk1vZFwiXG59XG5cbmZ1bmN0aW9uIGFkZE1vZGlmaWVyTmFtZXMobmFtZSwgZXZlbnQsIG5vU2hpZnQpIHtcbiAgdmFyIGJhc2UgPSBuYW1lO1xuICBpZiAoZXZlbnQuYWx0S2V5ICYmIGJhc2UgIT0gXCJBbHRcIikgeyBuYW1lID0gXCJBbHQtXCIgKyBuYW1lOyB9XG4gIGlmICgoZmxpcEN0cmxDbWQgPyBldmVudC5tZXRhS2V5IDogZXZlbnQuY3RybEtleSkgJiYgYmFzZSAhPSBcIkN0cmxcIikgeyBuYW1lID0gXCJDdHJsLVwiICsgbmFtZTsgfVxuICBpZiAoKGZsaXBDdHJsQ21kID8gZXZlbnQuY3RybEtleSA6IGV2ZW50Lm1ldGFLZXkpICYmIGJhc2UgIT0gXCJDbWRcIikgeyBuYW1lID0gXCJDbWQtXCIgKyBuYW1lOyB9XG4gIGlmICghbm9TaGlmdCAmJiBldmVudC5zaGlmdEtleSAmJiBiYXNlICE9IFwiU2hpZnRcIikgeyBuYW1lID0gXCJTaGlmdC1cIiArIG5hbWU7IH1cbiAgcmV0dXJuIG5hbWVcbn1cblxuLy8gTG9vayB1cCB0aGUgbmFtZSBvZiBhIGtleSBhcyBpbmRpY2F0ZWQgYnkgYW4gZXZlbnQgb2JqZWN0LlxuZnVuY3Rpb24ga2V5TmFtZShldmVudCwgbm9TaGlmdCkge1xuICBpZiAocHJlc3RvICYmIGV2ZW50LmtleUNvZGUgPT0gMzQgJiYgZXZlbnRbXCJjaGFyXCJdKSB7IHJldHVybiBmYWxzZSB9XG4gIHZhciBuYW1lID0ga2V5TmFtZXNbZXZlbnQua2V5Q29kZV07XG4gIGlmIChuYW1lID09IG51bGwgfHwgZXZlbnQuYWx0R3JhcGhLZXkpIHsgcmV0dXJuIGZhbHNlIH1cbiAgLy8gQ3RybC1TY3JvbGxMb2NrIGhhcyBrZXlDb2RlIDMsIHNhbWUgYXMgQ3RybC1QYXVzZSxcbiAgLy8gc28gd2UnbGwgdXNlIGV2ZW50LmNvZGUgd2hlbiBhdmFpbGFibGUgKENocm9tZSA0OCssIEZGIDM4KywgU2FmYXJpIDEwLjErKVxuICBpZiAoZXZlbnQua2V5Q29kZSA9PSAzICYmIGV2ZW50LmNvZGUpIHsgbmFtZSA9IGV2ZW50LmNvZGU7IH1cbiAgcmV0dXJuIGFkZE1vZGlmaWVyTmFtZXMobmFtZSwgZXZlbnQsIG5vU2hpZnQpXG59XG5cbmZ1bmN0aW9uIGdldEtleU1hcCh2YWwpIHtcbiAgcmV0dXJuIHR5cGVvZiB2YWwgPT0gXCJzdHJpbmdcIiA/IGtleU1hcFt2YWxdIDogdmFsXG59XG5cbi8vIEhlbHBlciBmb3IgZGVsZXRpbmcgdGV4dCBuZWFyIHRoZSBzZWxlY3Rpb24ocyksIHVzZWQgdG8gaW1wbGVtZW50XG4vLyBiYWNrc3BhY2UsIGRlbGV0ZSwgYW5kIHNpbWlsYXIgZnVuY3Rpb25hbGl0eS5cbmZ1bmN0aW9uIGRlbGV0ZU5lYXJTZWxlY3Rpb24oY20sIGNvbXB1dGUpIHtcbiAgdmFyIHJhbmdlcyA9IGNtLmRvYy5zZWwucmFuZ2VzLCBraWxsID0gW107XG4gIC8vIEJ1aWxkIHVwIGEgc2V0IG9mIHJhbmdlcyB0byBraWxsIGZpcnN0LCBtZXJnaW5nIG92ZXJsYXBwaW5nXG4gIC8vIHJhbmdlcy5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCByYW5nZXMubGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgdG9LaWxsID0gY29tcHV0ZShyYW5nZXNbaV0pO1xuICAgIHdoaWxlIChraWxsLmxlbmd0aCAmJiBjbXAodG9LaWxsLmZyb20sIGxzdChraWxsKS50bykgPD0gMCkge1xuICAgICAgdmFyIHJlcGxhY2VkID0ga2lsbC5wb3AoKTtcbiAgICAgIGlmIChjbXAocmVwbGFjZWQuZnJvbSwgdG9LaWxsLmZyb20pIDwgMCkge1xuICAgICAgICB0b0tpbGwuZnJvbSA9IHJlcGxhY2VkLmZyb207XG4gICAgICAgIGJyZWFrXG4gICAgICB9XG4gICAgfVxuICAgIGtpbGwucHVzaCh0b0tpbGwpO1xuICB9XG4gIC8vIE5leHQsIHJlbW92ZSB0aG9zZSBhY3R1YWwgcmFuZ2VzLlxuICBydW5Jbk9wKGNtLCBmdW5jdGlvbiAoKSB7XG4gICAgZm9yICh2YXIgaSA9IGtpbGwubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pXG4gICAgICB7IHJlcGxhY2VSYW5nZShjbS5kb2MsIFwiXCIsIGtpbGxbaV0uZnJvbSwga2lsbFtpXS50bywgXCIrZGVsZXRlXCIpOyB9XG4gICAgZW5zdXJlQ3Vyc29yVmlzaWJsZShjbSk7XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBtb3ZlQ2hhckxvZ2ljYWxseShsaW5lLCBjaCwgZGlyKSB7XG4gIHZhciB0YXJnZXQgPSBza2lwRXh0ZW5kaW5nQ2hhcnMobGluZS50ZXh0LCBjaCArIGRpciwgZGlyKTtcbiAgcmV0dXJuIHRhcmdldCA8IDAgfHwgdGFyZ2V0ID4gbGluZS50ZXh0Lmxlbmd0aCA/IG51bGwgOiB0YXJnZXRcbn1cblxuZnVuY3Rpb24gbW92ZUxvZ2ljYWxseShsaW5lLCBzdGFydCwgZGlyKSB7XG4gIHZhciBjaCA9IG1vdmVDaGFyTG9naWNhbGx5KGxpbmUsIHN0YXJ0LmNoLCBkaXIpO1xuICByZXR1cm4gY2ggPT0gbnVsbCA/IG51bGwgOiBuZXcgUG9zKHN0YXJ0LmxpbmUsIGNoLCBkaXIgPCAwID8gXCJhZnRlclwiIDogXCJiZWZvcmVcIilcbn1cblxuZnVuY3Rpb24gZW5kT2ZMaW5lKHZpc3VhbGx5LCBjbSwgbGluZU9iaiwgbGluZU5vLCBkaXIpIHtcbiAgaWYgKHZpc3VhbGx5KSB7XG4gICAgdmFyIG9yZGVyID0gZ2V0T3JkZXIobGluZU9iaiwgY20uZG9jLmRpcmVjdGlvbik7XG4gICAgaWYgKG9yZGVyKSB7XG4gICAgICB2YXIgcGFydCA9IGRpciA8IDAgPyBsc3Qob3JkZXIpIDogb3JkZXJbMF07XG4gICAgICB2YXIgbW92ZUluU3RvcmFnZU9yZGVyID0gKGRpciA8IDApID09IChwYXJ0LmxldmVsID09IDEpO1xuICAgICAgdmFyIHN0aWNreSA9IG1vdmVJblN0b3JhZ2VPcmRlciA/IFwiYWZ0ZXJcIiA6IFwiYmVmb3JlXCI7XG4gICAgICB2YXIgY2g7XG4gICAgICAvLyBXaXRoIGEgd3JhcHBlZCBydGwgY2h1bmsgKHBvc3NpYmx5IHNwYW5uaW5nIG11bHRpcGxlIGJpZGkgcGFydHMpLFxuICAgICAgLy8gaXQgY291bGQgYmUgdGhhdCB0aGUgbGFzdCBiaWRpIHBhcnQgaXMgbm90IG9uIHRoZSBsYXN0IHZpc3VhbCBsaW5lLFxuICAgICAgLy8gc2luY2UgdmlzdWFsIGxpbmVzIGNvbnRhaW4gY29udGVudCBvcmRlci1jb25zZWN1dGl2ZSBjaHVua3MuXG4gICAgICAvLyBUaHVzLCBpbiBydGwsIHdlIGFyZSBsb29raW5nIGZvciB0aGUgZmlyc3QgKGNvbnRlbnQtb3JkZXIpIGNoYXJhY3RlclxuICAgICAgLy8gaW4gdGhlIHJ0bCBjaHVuayB0aGF0IGlzIG9uIHRoZSBsYXN0IGxpbmUgKHRoYXQgaXMsIHRoZSBzYW1lIGxpbmVcbiAgICAgIC8vIGFzIHRoZSBsYXN0IChjb250ZW50LW9yZGVyKSBjaGFyYWN0ZXIpLlxuICAgICAgaWYgKHBhcnQubGV2ZWwgPiAwIHx8IGNtLmRvYy5kaXJlY3Rpb24gPT0gXCJydGxcIikge1xuICAgICAgICB2YXIgcHJlcCA9IHByZXBhcmVNZWFzdXJlRm9yTGluZShjbSwgbGluZU9iaik7XG4gICAgICAgIGNoID0gZGlyIDwgMCA/IGxpbmVPYmoudGV4dC5sZW5ndGggLSAxIDogMDtcbiAgICAgICAgdmFyIHRhcmdldFRvcCA9IG1lYXN1cmVDaGFyUHJlcGFyZWQoY20sIHByZXAsIGNoKS50b3A7XG4gICAgICAgIGNoID0gZmluZEZpcnN0KGZ1bmN0aW9uIChjaCkgeyByZXR1cm4gbWVhc3VyZUNoYXJQcmVwYXJlZChjbSwgcHJlcCwgY2gpLnRvcCA9PSB0YXJnZXRUb3A7IH0sIChkaXIgPCAwKSA9PSAocGFydC5sZXZlbCA9PSAxKSA/IHBhcnQuZnJvbSA6IHBhcnQudG8gLSAxLCBjaCk7XG4gICAgICAgIGlmIChzdGlja3kgPT0gXCJiZWZvcmVcIikgeyBjaCA9IG1vdmVDaGFyTG9naWNhbGx5KGxpbmVPYmosIGNoLCAxKTsgfVxuICAgICAgfSBlbHNlIHsgY2ggPSBkaXIgPCAwID8gcGFydC50byA6IHBhcnQuZnJvbTsgfVxuICAgICAgcmV0dXJuIG5ldyBQb3MobGluZU5vLCBjaCwgc3RpY2t5KVxuICAgIH1cbiAgfVxuICByZXR1cm4gbmV3IFBvcyhsaW5lTm8sIGRpciA8IDAgPyBsaW5lT2JqLnRleHQubGVuZ3RoIDogMCwgZGlyIDwgMCA/IFwiYmVmb3JlXCIgOiBcImFmdGVyXCIpXG59XG5cbmZ1bmN0aW9uIG1vdmVWaXN1YWxseShjbSwgbGluZSwgc3RhcnQsIGRpcikge1xuICB2YXIgYmlkaSA9IGdldE9yZGVyKGxpbmUsIGNtLmRvYy5kaXJlY3Rpb24pO1xuICBpZiAoIWJpZGkpIHsgcmV0dXJuIG1vdmVMb2dpY2FsbHkobGluZSwgc3RhcnQsIGRpcikgfVxuICBpZiAoc3RhcnQuY2ggPj0gbGluZS50ZXh0Lmxlbmd0aCkge1xuICAgIHN0YXJ0LmNoID0gbGluZS50ZXh0Lmxlbmd0aDtcbiAgICBzdGFydC5zdGlja3kgPSBcImJlZm9yZVwiO1xuICB9IGVsc2UgaWYgKHN0YXJ0LmNoIDw9IDApIHtcbiAgICBzdGFydC5jaCA9IDA7XG4gICAgc3RhcnQuc3RpY2t5ID0gXCJhZnRlclwiO1xuICB9XG4gIHZhciBwYXJ0UG9zID0gZ2V0QmlkaVBhcnRBdChiaWRpLCBzdGFydC5jaCwgc3RhcnQuc3RpY2t5KSwgcGFydCA9IGJpZGlbcGFydFBvc107XG4gIGlmIChjbS5kb2MuZGlyZWN0aW9uID09IFwibHRyXCIgJiYgcGFydC5sZXZlbCAlIDIgPT0gMCAmJiAoZGlyID4gMCA/IHBhcnQudG8gPiBzdGFydC5jaCA6IHBhcnQuZnJvbSA8IHN0YXJ0LmNoKSkge1xuICAgIC8vIENhc2UgMTogV2UgbW92ZSB3aXRoaW4gYW4gbHRyIHBhcnQgaW4gYW4gbHRyIGVkaXRvci4gRXZlbiB3aXRoIHdyYXBwZWQgbGluZXMsXG4gICAgLy8gbm90aGluZyBpbnRlcmVzdGluZyBoYXBwZW5zLlxuICAgIHJldHVybiBtb3ZlTG9naWNhbGx5KGxpbmUsIHN0YXJ0LCBkaXIpXG4gIH1cblxuICB2YXIgbXYgPSBmdW5jdGlvbiAocG9zLCBkaXIpIHsgcmV0dXJuIG1vdmVDaGFyTG9naWNhbGx5KGxpbmUsIHBvcyBpbnN0YW5jZW9mIFBvcyA/IHBvcy5jaCA6IHBvcywgZGlyKTsgfTtcbiAgdmFyIHByZXA7XG4gIHZhciBnZXRXcmFwcGVkTGluZUV4dGVudCA9IGZ1bmN0aW9uIChjaCkge1xuICAgIGlmICghY20ub3B0aW9ucy5saW5lV3JhcHBpbmcpIHsgcmV0dXJuIHtiZWdpbjogMCwgZW5kOiBsaW5lLnRleHQubGVuZ3RofSB9XG4gICAgcHJlcCA9IHByZXAgfHwgcHJlcGFyZU1lYXN1cmVGb3JMaW5lKGNtLCBsaW5lKTtcbiAgICByZXR1cm4gd3JhcHBlZExpbmVFeHRlbnRDaGFyKGNtLCBsaW5lLCBwcmVwLCBjaClcbiAgfTtcbiAgdmFyIHdyYXBwZWRMaW5lRXh0ZW50ID0gZ2V0V3JhcHBlZExpbmVFeHRlbnQoc3RhcnQuc3RpY2t5ID09IFwiYmVmb3JlXCIgPyBtdihzdGFydCwgLTEpIDogc3RhcnQuY2gpO1xuXG4gIGlmIChjbS5kb2MuZGlyZWN0aW9uID09IFwicnRsXCIgfHwgcGFydC5sZXZlbCA9PSAxKSB7XG4gICAgdmFyIG1vdmVJblN0b3JhZ2VPcmRlciA9IChwYXJ0LmxldmVsID09IDEpID09IChkaXIgPCAwKTtcbiAgICB2YXIgY2ggPSBtdihzdGFydCwgbW92ZUluU3RvcmFnZU9yZGVyID8gMSA6IC0xKTtcbiAgICBpZiAoY2ggIT0gbnVsbCAmJiAoIW1vdmVJblN0b3JhZ2VPcmRlciA/IGNoID49IHBhcnQuZnJvbSAmJiBjaCA+PSB3cmFwcGVkTGluZUV4dGVudC5iZWdpbiA6IGNoIDw9IHBhcnQudG8gJiYgY2ggPD0gd3JhcHBlZExpbmVFeHRlbnQuZW5kKSkge1xuICAgICAgLy8gQ2FzZSAyOiBXZSBtb3ZlIHdpdGhpbiBhbiBydGwgcGFydCBvciBpbiBhbiBydGwgZWRpdG9yIG9uIHRoZSBzYW1lIHZpc3VhbCBsaW5lXG4gICAgICB2YXIgc3RpY2t5ID0gbW92ZUluU3RvcmFnZU9yZGVyID8gXCJiZWZvcmVcIiA6IFwiYWZ0ZXJcIjtcbiAgICAgIHJldHVybiBuZXcgUG9zKHN0YXJ0LmxpbmUsIGNoLCBzdGlja3kpXG4gICAgfVxuICB9XG5cbiAgLy8gQ2FzZSAzOiBDb3VsZCBub3QgbW92ZSB3aXRoaW4gdGhpcyBiaWRpIHBhcnQgaW4gdGhpcyB2aXN1YWwgbGluZSwgc28gbGVhdmVcbiAgLy8gdGhlIGN1cnJlbnQgYmlkaSBwYXJ0XG5cbiAgdmFyIHNlYXJjaEluVmlzdWFsTGluZSA9IGZ1bmN0aW9uIChwYXJ0UG9zLCBkaXIsIHdyYXBwZWRMaW5lRXh0ZW50KSB7XG4gICAgdmFyIGdldFJlcyA9IGZ1bmN0aW9uIChjaCwgbW92ZUluU3RvcmFnZU9yZGVyKSB7IHJldHVybiBtb3ZlSW5TdG9yYWdlT3JkZXJcbiAgICAgID8gbmV3IFBvcyhzdGFydC5saW5lLCBtdihjaCwgMSksIFwiYmVmb3JlXCIpXG4gICAgICA6IG5ldyBQb3Moc3RhcnQubGluZSwgY2gsIFwiYWZ0ZXJcIik7IH07XG5cbiAgICBmb3IgKDsgcGFydFBvcyA+PSAwICYmIHBhcnRQb3MgPCBiaWRpLmxlbmd0aDsgcGFydFBvcyArPSBkaXIpIHtcbiAgICAgIHZhciBwYXJ0ID0gYmlkaVtwYXJ0UG9zXTtcbiAgICAgIHZhciBtb3ZlSW5TdG9yYWdlT3JkZXIgPSAoZGlyID4gMCkgPT0gKHBhcnQubGV2ZWwgIT0gMSk7XG4gICAgICB2YXIgY2ggPSBtb3ZlSW5TdG9yYWdlT3JkZXIgPyB3cmFwcGVkTGluZUV4dGVudC5iZWdpbiA6IG12KHdyYXBwZWRMaW5lRXh0ZW50LmVuZCwgLTEpO1xuICAgICAgaWYgKHBhcnQuZnJvbSA8PSBjaCAmJiBjaCA8IHBhcnQudG8pIHsgcmV0dXJuIGdldFJlcyhjaCwgbW92ZUluU3RvcmFnZU9yZGVyKSB9XG4gICAgICBjaCA9IG1vdmVJblN0b3JhZ2VPcmRlciA/IHBhcnQuZnJvbSA6IG12KHBhcnQudG8sIC0xKTtcbiAgICAgIGlmICh3cmFwcGVkTGluZUV4dGVudC5iZWdpbiA8PSBjaCAmJiBjaCA8IHdyYXBwZWRMaW5lRXh0ZW50LmVuZCkgeyByZXR1cm4gZ2V0UmVzKGNoLCBtb3ZlSW5TdG9yYWdlT3JkZXIpIH1cbiAgICB9XG4gIH07XG5cbiAgLy8gQ2FzZSAzYTogTG9vayBmb3Igb3RoZXIgYmlkaSBwYXJ0cyBvbiB0aGUgc2FtZSB2aXN1YWwgbGluZVxuICB2YXIgcmVzID0gc2VhcmNoSW5WaXN1YWxMaW5lKHBhcnRQb3MgKyBkaXIsIGRpciwgd3JhcHBlZExpbmVFeHRlbnQpO1xuICBpZiAocmVzKSB7IHJldHVybiByZXMgfVxuXG4gIC8vIENhc2UgM2I6IExvb2sgZm9yIG90aGVyIGJpZGkgcGFydHMgb24gdGhlIG5leHQgdmlzdWFsIGxpbmVcbiAgdmFyIG5leHRDaCA9IGRpciA+IDAgPyB3cmFwcGVkTGluZUV4dGVudC5lbmQgOiBtdih3cmFwcGVkTGluZUV4dGVudC5iZWdpbiwgLTEpO1xuICBpZiAobmV4dENoICE9IG51bGwgJiYgIShkaXIgPiAwICYmIG5leHRDaCA9PSBsaW5lLnRleHQubGVuZ3RoKSkge1xuICAgIHJlcyA9IHNlYXJjaEluVmlzdWFsTGluZShkaXIgPiAwID8gMCA6IGJpZGkubGVuZ3RoIC0gMSwgZGlyLCBnZXRXcmFwcGVkTGluZUV4dGVudChuZXh0Q2gpKTtcbiAgICBpZiAocmVzKSB7IHJldHVybiByZXMgfVxuICB9XG5cbiAgLy8gQ2FzZSA0OiBOb3doZXJlIHRvIG1vdmVcbiAgcmV0dXJuIG51bGxcbn1cblxuLy8gQ29tbWFuZHMgYXJlIHBhcmFtZXRlci1sZXNzIGFjdGlvbnMgdGhhdCBjYW4gYmUgcGVyZm9ybWVkIG9uIGFuXG4vLyBlZGl0b3IsIG1vc3RseSB1c2VkIGZvciBrZXliaW5kaW5ncy5cbnZhciBjb21tYW5kcyA9IHtcbiAgc2VsZWN0QWxsOiBzZWxlY3RBbGwsXG4gIHNpbmdsZVNlbGVjdGlvbjogZnVuY3Rpb24gKGNtKSB7IHJldHVybiBjbS5zZXRTZWxlY3Rpb24oY20uZ2V0Q3Vyc29yKFwiYW5jaG9yXCIpLCBjbS5nZXRDdXJzb3IoXCJoZWFkXCIpLCBzZWxfZG9udFNjcm9sbCk7IH0sXG4gIGtpbGxMaW5lOiBmdW5jdGlvbiAoY20pIHsgcmV0dXJuIGRlbGV0ZU5lYXJTZWxlY3Rpb24oY20sIGZ1bmN0aW9uIChyYW5nZSkge1xuICAgIGlmIChyYW5nZS5lbXB0eSgpKSB7XG4gICAgICB2YXIgbGVuID0gZ2V0TGluZShjbS5kb2MsIHJhbmdlLmhlYWQubGluZSkudGV4dC5sZW5ndGg7XG4gICAgICBpZiAocmFuZ2UuaGVhZC5jaCA9PSBsZW4gJiYgcmFuZ2UuaGVhZC5saW5lIDwgY20ubGFzdExpbmUoKSlcbiAgICAgICAgeyByZXR1cm4ge2Zyb206IHJhbmdlLmhlYWQsIHRvOiBQb3MocmFuZ2UuaGVhZC5saW5lICsgMSwgMCl9IH1cbiAgICAgIGVsc2VcbiAgICAgICAgeyByZXR1cm4ge2Zyb206IHJhbmdlLmhlYWQsIHRvOiBQb3MocmFuZ2UuaGVhZC5saW5lLCBsZW4pfSB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiB7ZnJvbTogcmFuZ2UuZnJvbSgpLCB0bzogcmFuZ2UudG8oKX1cbiAgICB9XG4gIH0pOyB9LFxuICBkZWxldGVMaW5lOiBmdW5jdGlvbiAoY20pIHsgcmV0dXJuIGRlbGV0ZU5lYXJTZWxlY3Rpb24oY20sIGZ1bmN0aW9uIChyYW5nZSkgeyByZXR1cm4gKHtcbiAgICBmcm9tOiBQb3MocmFuZ2UuZnJvbSgpLmxpbmUsIDApLFxuICAgIHRvOiBjbGlwUG9zKGNtLmRvYywgUG9zKHJhbmdlLnRvKCkubGluZSArIDEsIDApKVxuICB9KTsgfSk7IH0sXG4gIGRlbExpbmVMZWZ0OiBmdW5jdGlvbiAoY20pIHsgcmV0dXJuIGRlbGV0ZU5lYXJTZWxlY3Rpb24oY20sIGZ1bmN0aW9uIChyYW5nZSkgeyByZXR1cm4gKHtcbiAgICBmcm9tOiBQb3MocmFuZ2UuZnJvbSgpLmxpbmUsIDApLCB0bzogcmFuZ2UuZnJvbSgpXG4gIH0pOyB9KTsgfSxcbiAgZGVsV3JhcHBlZExpbmVMZWZ0OiBmdW5jdGlvbiAoY20pIHsgcmV0dXJuIGRlbGV0ZU5lYXJTZWxlY3Rpb24oY20sIGZ1bmN0aW9uIChyYW5nZSkge1xuICAgIHZhciB0b3AgPSBjbS5jaGFyQ29vcmRzKHJhbmdlLmhlYWQsIFwiZGl2XCIpLnRvcCArIDU7XG4gICAgdmFyIGxlZnRQb3MgPSBjbS5jb29yZHNDaGFyKHtsZWZ0OiAwLCB0b3A6IHRvcH0sIFwiZGl2XCIpO1xuICAgIHJldHVybiB7ZnJvbTogbGVmdFBvcywgdG86IHJhbmdlLmZyb20oKX1cbiAgfSk7IH0sXG4gIGRlbFdyYXBwZWRMaW5lUmlnaHQ6IGZ1bmN0aW9uIChjbSkgeyByZXR1cm4gZGVsZXRlTmVhclNlbGVjdGlvbihjbSwgZnVuY3Rpb24gKHJhbmdlKSB7XG4gICAgdmFyIHRvcCA9IGNtLmNoYXJDb29yZHMocmFuZ2UuaGVhZCwgXCJkaXZcIikudG9wICsgNTtcbiAgICB2YXIgcmlnaHRQb3MgPSBjbS5jb29yZHNDaGFyKHtsZWZ0OiBjbS5kaXNwbGF5LmxpbmVEaXYub2Zmc2V0V2lkdGggKyAxMDAsIHRvcDogdG9wfSwgXCJkaXZcIik7XG4gICAgcmV0dXJuIHtmcm9tOiByYW5nZS5mcm9tKCksIHRvOiByaWdodFBvcyB9XG4gIH0pOyB9LFxuICB1bmRvOiBmdW5jdGlvbiAoY20pIHsgcmV0dXJuIGNtLnVuZG8oKTsgfSxcbiAgcmVkbzogZnVuY3Rpb24gKGNtKSB7IHJldHVybiBjbS5yZWRvKCk7IH0sXG4gIHVuZG9TZWxlY3Rpb246IGZ1bmN0aW9uIChjbSkgeyByZXR1cm4gY20udW5kb1NlbGVjdGlvbigpOyB9LFxuICByZWRvU2VsZWN0aW9uOiBmdW5jdGlvbiAoY20pIHsgcmV0dXJuIGNtLnJlZG9TZWxlY3Rpb24oKTsgfSxcbiAgZ29Eb2NTdGFydDogZnVuY3Rpb24gKGNtKSB7IHJldHVybiBjbS5leHRlbmRTZWxlY3Rpb24oUG9zKGNtLmZpcnN0TGluZSgpLCAwKSk7IH0sXG4gIGdvRG9jRW5kOiBmdW5jdGlvbiAoY20pIHsgcmV0dXJuIGNtLmV4dGVuZFNlbGVjdGlvbihQb3MoY20ubGFzdExpbmUoKSkpOyB9LFxuICBnb0xpbmVTdGFydDogZnVuY3Rpb24gKGNtKSB7IHJldHVybiBjbS5leHRlbmRTZWxlY3Rpb25zQnkoZnVuY3Rpb24gKHJhbmdlKSB7IHJldHVybiBsaW5lU3RhcnQoY20sIHJhbmdlLmhlYWQubGluZSk7IH0sXG4gICAge29yaWdpbjogXCIrbW92ZVwiLCBiaWFzOiAxfVxuICApOyB9LFxuICBnb0xpbmVTdGFydFNtYXJ0OiBmdW5jdGlvbiAoY20pIHsgcmV0dXJuIGNtLmV4dGVuZFNlbGVjdGlvbnNCeShmdW5jdGlvbiAocmFuZ2UpIHsgcmV0dXJuIGxpbmVTdGFydFNtYXJ0KGNtLCByYW5nZS5oZWFkKTsgfSxcbiAgICB7b3JpZ2luOiBcIittb3ZlXCIsIGJpYXM6IDF9XG4gICk7IH0sXG4gIGdvTGluZUVuZDogZnVuY3Rpb24gKGNtKSB7IHJldHVybiBjbS5leHRlbmRTZWxlY3Rpb25zQnkoZnVuY3Rpb24gKHJhbmdlKSB7IHJldHVybiBsaW5lRW5kKGNtLCByYW5nZS5oZWFkLmxpbmUpOyB9LFxuICAgIHtvcmlnaW46IFwiK21vdmVcIiwgYmlhczogLTF9XG4gICk7IH0sXG4gIGdvTGluZVJpZ2h0OiBmdW5jdGlvbiAoY20pIHsgcmV0dXJuIGNtLmV4dGVuZFNlbGVjdGlvbnNCeShmdW5jdGlvbiAocmFuZ2UpIHtcbiAgICB2YXIgdG9wID0gY20uY3Vyc29yQ29vcmRzKHJhbmdlLmhlYWQsIFwiZGl2XCIpLnRvcCArIDU7XG4gICAgcmV0dXJuIGNtLmNvb3Jkc0NoYXIoe2xlZnQ6IGNtLmRpc3BsYXkubGluZURpdi5vZmZzZXRXaWR0aCArIDEwMCwgdG9wOiB0b3B9LCBcImRpdlwiKVxuICB9LCBzZWxfbW92ZSk7IH0sXG4gIGdvTGluZUxlZnQ6IGZ1bmN0aW9uIChjbSkgeyByZXR1cm4gY20uZXh0ZW5kU2VsZWN0aW9uc0J5KGZ1bmN0aW9uIChyYW5nZSkge1xuICAgIHZhciB0b3AgPSBjbS5jdXJzb3JDb29yZHMocmFuZ2UuaGVhZCwgXCJkaXZcIikudG9wICsgNTtcbiAgICByZXR1cm4gY20uY29vcmRzQ2hhcih7bGVmdDogMCwgdG9wOiB0b3B9LCBcImRpdlwiKVxuICB9LCBzZWxfbW92ZSk7IH0sXG4gIGdvTGluZUxlZnRTbWFydDogZnVuY3Rpb24gKGNtKSB7IHJldHVybiBjbS5leHRlbmRTZWxlY3Rpb25zQnkoZnVuY3Rpb24gKHJhbmdlKSB7XG4gICAgdmFyIHRvcCA9IGNtLmN1cnNvckNvb3JkcyhyYW5nZS5oZWFkLCBcImRpdlwiKS50b3AgKyA1O1xuICAgIHZhciBwb3MgPSBjbS5jb29yZHNDaGFyKHtsZWZ0OiAwLCB0b3A6IHRvcH0sIFwiZGl2XCIpO1xuICAgIGlmIChwb3MuY2ggPCBjbS5nZXRMaW5lKHBvcy5saW5lKS5zZWFyY2goL1xcUy8pKSB7IHJldHVybiBsaW5lU3RhcnRTbWFydChjbSwgcmFuZ2UuaGVhZCkgfVxuICAgIHJldHVybiBwb3NcbiAgfSwgc2VsX21vdmUpOyB9LFxuICBnb0xpbmVVcDogZnVuY3Rpb24gKGNtKSB7IHJldHVybiBjbS5tb3ZlVigtMSwgXCJsaW5lXCIpOyB9LFxuICBnb0xpbmVEb3duOiBmdW5jdGlvbiAoY20pIHsgcmV0dXJuIGNtLm1vdmVWKDEsIFwibGluZVwiKTsgfSxcbiAgZ29QYWdlVXA6IGZ1bmN0aW9uIChjbSkgeyByZXR1cm4gY20ubW92ZVYoLTEsIFwicGFnZVwiKTsgfSxcbiAgZ29QYWdlRG93bjogZnVuY3Rpb24gKGNtKSB7IHJldHVybiBjbS5tb3ZlVigxLCBcInBhZ2VcIik7IH0sXG4gIGdvQ2hhckxlZnQ6IGZ1bmN0aW9uIChjbSkgeyByZXR1cm4gY20ubW92ZUgoLTEsIFwiY2hhclwiKTsgfSxcbiAgZ29DaGFyUmlnaHQ6IGZ1bmN0aW9uIChjbSkgeyByZXR1cm4gY20ubW92ZUgoMSwgXCJjaGFyXCIpOyB9LFxuICBnb0NvbHVtbkxlZnQ6IGZ1bmN0aW9uIChjbSkgeyByZXR1cm4gY20ubW92ZUgoLTEsIFwiY29sdW1uXCIpOyB9LFxuICBnb0NvbHVtblJpZ2h0OiBmdW5jdGlvbiAoY20pIHsgcmV0dXJuIGNtLm1vdmVIKDEsIFwiY29sdW1uXCIpOyB9LFxuICBnb1dvcmRMZWZ0OiBmdW5jdGlvbiAoY20pIHsgcmV0dXJuIGNtLm1vdmVIKC0xLCBcIndvcmRcIik7IH0sXG4gIGdvR3JvdXBSaWdodDogZnVuY3Rpb24gKGNtKSB7IHJldHVybiBjbS5tb3ZlSCgxLCBcImdyb3VwXCIpOyB9LFxuICBnb0dyb3VwTGVmdDogZnVuY3Rpb24gKGNtKSB7IHJldHVybiBjbS5tb3ZlSCgtMSwgXCJncm91cFwiKTsgfSxcbiAgZ29Xb3JkUmlnaHQ6IGZ1bmN0aW9uIChjbSkgeyByZXR1cm4gY20ubW92ZUgoMSwgXCJ3b3JkXCIpOyB9LFxuICBkZWxDaGFyQmVmb3JlOiBmdW5jdGlvbiAoY20pIHsgcmV0dXJuIGNtLmRlbGV0ZUgoLTEsIFwiY2hhclwiKTsgfSxcbiAgZGVsQ2hhckFmdGVyOiBmdW5jdGlvbiAoY20pIHsgcmV0dXJuIGNtLmRlbGV0ZUgoMSwgXCJjaGFyXCIpOyB9LFxuICBkZWxXb3JkQmVmb3JlOiBmdW5jdGlvbiAoY20pIHsgcmV0dXJuIGNtLmRlbGV0ZUgoLTEsIFwid29yZFwiKTsgfSxcbiAgZGVsV29yZEFmdGVyOiBmdW5jdGlvbiAoY20pIHsgcmV0dXJuIGNtLmRlbGV0ZUgoMSwgXCJ3b3JkXCIpOyB9LFxuICBkZWxHcm91cEJlZm9yZTogZnVuY3Rpb24gKGNtKSB7IHJldHVybiBjbS5kZWxldGVIKC0xLCBcImdyb3VwXCIpOyB9LFxuICBkZWxHcm91cEFmdGVyOiBmdW5jdGlvbiAoY20pIHsgcmV0dXJuIGNtLmRlbGV0ZUgoMSwgXCJncm91cFwiKTsgfSxcbiAgaW5kZW50QXV0bzogZnVuY3Rpb24gKGNtKSB7IHJldHVybiBjbS5pbmRlbnRTZWxlY3Rpb24oXCJzbWFydFwiKTsgfSxcbiAgaW5kZW50TW9yZTogZnVuY3Rpb24gKGNtKSB7IHJldHVybiBjbS5pbmRlbnRTZWxlY3Rpb24oXCJhZGRcIik7IH0sXG4gIGluZGVudExlc3M6IGZ1bmN0aW9uIChjbSkgeyByZXR1cm4gY20uaW5kZW50U2VsZWN0aW9uKFwic3VidHJhY3RcIik7IH0sXG4gIGluc2VydFRhYjogZnVuY3Rpb24gKGNtKSB7IHJldHVybiBjbS5yZXBsYWNlU2VsZWN0aW9uKFwiXFx0XCIpOyB9LFxuICBpbnNlcnRTb2Z0VGFiOiBmdW5jdGlvbiAoY20pIHtcbiAgICB2YXIgc3BhY2VzID0gW10sIHJhbmdlcyA9IGNtLmxpc3RTZWxlY3Rpb25zKCksIHRhYlNpemUgPSBjbS5vcHRpb25zLnRhYlNpemU7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCByYW5nZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciBwb3MgPSByYW5nZXNbaV0uZnJvbSgpO1xuICAgICAgdmFyIGNvbCA9IGNvdW50Q29sdW1uKGNtLmdldExpbmUocG9zLmxpbmUpLCBwb3MuY2gsIHRhYlNpemUpO1xuICAgICAgc3BhY2VzLnB1c2goc3BhY2VTdHIodGFiU2l6ZSAtIGNvbCAlIHRhYlNpemUpKTtcbiAgICB9XG4gICAgY20ucmVwbGFjZVNlbGVjdGlvbnMoc3BhY2VzKTtcbiAgfSxcbiAgZGVmYXVsdFRhYjogZnVuY3Rpb24gKGNtKSB7XG4gICAgaWYgKGNtLnNvbWV0aGluZ1NlbGVjdGVkKCkpIHsgY20uaW5kZW50U2VsZWN0aW9uKFwiYWRkXCIpOyB9XG4gICAgZWxzZSB7IGNtLmV4ZWNDb21tYW5kKFwiaW5zZXJ0VGFiXCIpOyB9XG4gIH0sXG4gIC8vIFN3YXAgdGhlIHR3byBjaGFycyBsZWZ0IGFuZCByaWdodCBvZiBlYWNoIHNlbGVjdGlvbidzIGhlYWQuXG4gIC8vIE1vdmUgY3Vyc29yIGJlaGluZCB0aGUgdHdvIHN3YXBwZWQgY2hhcmFjdGVycyBhZnRlcndhcmRzLlxuICAvL1xuICAvLyBEb2Vzbid0IGNvbnNpZGVyIGxpbmUgZmVlZHMgYSBjaGFyYWN0ZXIuXG4gIC8vIERvZXNuJ3Qgc2NhbiBtb3JlIHRoYW4gb25lIGxpbmUgYWJvdmUgdG8gZmluZCBhIGNoYXJhY3Rlci5cbiAgLy8gRG9lc24ndCBkbyBhbnl0aGluZyBvbiBhbiBlbXB0eSBsaW5lLlxuICAvLyBEb2Vzbid0IGRvIGFueXRoaW5nIHdpdGggbm9uLWVtcHR5IHNlbGVjdGlvbnMuXG4gIHRyYW5zcG9zZUNoYXJzOiBmdW5jdGlvbiAoY20pIHsgcmV0dXJuIHJ1bkluT3AoY20sIGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgcmFuZ2VzID0gY20ubGlzdFNlbGVjdGlvbnMoKSwgbmV3U2VsID0gW107XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCByYW5nZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGlmICghcmFuZ2VzW2ldLmVtcHR5KCkpIHsgY29udGludWUgfVxuICAgICAgdmFyIGN1ciA9IHJhbmdlc1tpXS5oZWFkLCBsaW5lID0gZ2V0TGluZShjbS5kb2MsIGN1ci5saW5lKS50ZXh0O1xuICAgICAgaWYgKGxpbmUpIHtcbiAgICAgICAgaWYgKGN1ci5jaCA9PSBsaW5lLmxlbmd0aCkgeyBjdXIgPSBuZXcgUG9zKGN1ci5saW5lLCBjdXIuY2ggLSAxKTsgfVxuICAgICAgICBpZiAoY3VyLmNoID4gMCkge1xuICAgICAgICAgIGN1ciA9IG5ldyBQb3MoY3VyLmxpbmUsIGN1ci5jaCArIDEpO1xuICAgICAgICAgIGNtLnJlcGxhY2VSYW5nZShsaW5lLmNoYXJBdChjdXIuY2ggLSAxKSArIGxpbmUuY2hhckF0KGN1ci5jaCAtIDIpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICBQb3MoY3VyLmxpbmUsIGN1ci5jaCAtIDIpLCBjdXIsIFwiK3RyYW5zcG9zZVwiKTtcbiAgICAgICAgfSBlbHNlIGlmIChjdXIubGluZSA+IGNtLmRvYy5maXJzdCkge1xuICAgICAgICAgIHZhciBwcmV2ID0gZ2V0TGluZShjbS5kb2MsIGN1ci5saW5lIC0gMSkudGV4dDtcbiAgICAgICAgICBpZiAocHJldikge1xuICAgICAgICAgICAgY3VyID0gbmV3IFBvcyhjdXIubGluZSwgMSk7XG4gICAgICAgICAgICBjbS5yZXBsYWNlUmFuZ2UobGluZS5jaGFyQXQoMCkgKyBjbS5kb2MubGluZVNlcGFyYXRvcigpICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcmV2LmNoYXJBdChwcmV2Lmxlbmd0aCAtIDEpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFBvcyhjdXIubGluZSAtIDEsIHByZXYubGVuZ3RoIC0gMSksIGN1ciwgXCIrdHJhbnNwb3NlXCIpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgbmV3U2VsLnB1c2gobmV3IFJhbmdlKGN1ciwgY3VyKSk7XG4gICAgfVxuICAgIGNtLnNldFNlbGVjdGlvbnMobmV3U2VsKTtcbiAgfSk7IH0sXG4gIG5ld2xpbmVBbmRJbmRlbnQ6IGZ1bmN0aW9uIChjbSkgeyByZXR1cm4gcnVuSW5PcChjbSwgZnVuY3Rpb24gKCkge1xuICAgIHZhciBzZWxzID0gY20ubGlzdFNlbGVjdGlvbnMoKTtcbiAgICBmb3IgKHZhciBpID0gc2Vscy5sZW5ndGggLSAxOyBpID49IDA7IGktLSlcbiAgICAgIHsgY20ucmVwbGFjZVJhbmdlKGNtLmRvYy5saW5lU2VwYXJhdG9yKCksIHNlbHNbaV0uYW5jaG9yLCBzZWxzW2ldLmhlYWQsIFwiK2lucHV0XCIpOyB9XG4gICAgc2VscyA9IGNtLmxpc3RTZWxlY3Rpb25zKCk7XG4gICAgZm9yICh2YXIgaSQxID0gMDsgaSQxIDwgc2Vscy5sZW5ndGg7IGkkMSsrKVxuICAgICAgeyBjbS5pbmRlbnRMaW5lKHNlbHNbaSQxXS5mcm9tKCkubGluZSwgbnVsbCwgdHJ1ZSk7IH1cbiAgICBlbnN1cmVDdXJzb3JWaXNpYmxlKGNtKTtcbiAgfSk7IH0sXG4gIG9wZW5MaW5lOiBmdW5jdGlvbiAoY20pIHsgcmV0dXJuIGNtLnJlcGxhY2VTZWxlY3Rpb24oXCJcXG5cIiwgXCJzdGFydFwiKTsgfSxcbiAgdG9nZ2xlT3ZlcndyaXRlOiBmdW5jdGlvbiAoY20pIHsgcmV0dXJuIGNtLnRvZ2dsZU92ZXJ3cml0ZSgpOyB9XG59O1xuXG5cbmZ1bmN0aW9uIGxpbmVTdGFydChjbSwgbGluZU4pIHtcbiAgdmFyIGxpbmUgPSBnZXRMaW5lKGNtLmRvYywgbGluZU4pO1xuICB2YXIgdmlzdWFsID0gdmlzdWFsTGluZShsaW5lKTtcbiAgaWYgKHZpc3VhbCAhPSBsaW5lKSB7IGxpbmVOID0gbGluZU5vKHZpc3VhbCk7IH1cbiAgcmV0dXJuIGVuZE9mTGluZSh0cnVlLCBjbSwgdmlzdWFsLCBsaW5lTiwgMSlcbn1cbmZ1bmN0aW9uIGxpbmVFbmQoY20sIGxpbmVOKSB7XG4gIHZhciBsaW5lID0gZ2V0TGluZShjbS5kb2MsIGxpbmVOKTtcbiAgdmFyIHZpc3VhbCA9IHZpc3VhbExpbmVFbmQobGluZSk7XG4gIGlmICh2aXN1YWwgIT0gbGluZSkgeyBsaW5lTiA9IGxpbmVObyh2aXN1YWwpOyB9XG4gIHJldHVybiBlbmRPZkxpbmUodHJ1ZSwgY20sIGxpbmUsIGxpbmVOLCAtMSlcbn1cbmZ1bmN0aW9uIGxpbmVTdGFydFNtYXJ0KGNtLCBwb3MpIHtcbiAgdmFyIHN0YXJ0ID0gbGluZVN0YXJ0KGNtLCBwb3MubGluZSk7XG4gIHZhciBsaW5lID0gZ2V0TGluZShjbS5kb2MsIHN0YXJ0LmxpbmUpO1xuICB2YXIgb3JkZXIgPSBnZXRPcmRlcihsaW5lLCBjbS5kb2MuZGlyZWN0aW9uKTtcbiAgaWYgKCFvcmRlciB8fCBvcmRlclswXS5sZXZlbCA9PSAwKSB7XG4gICAgdmFyIGZpcnN0Tm9uV1MgPSBNYXRoLm1heCgwLCBsaW5lLnRleHQuc2VhcmNoKC9cXFMvKSk7XG4gICAgdmFyIGluV1MgPSBwb3MubGluZSA9PSBzdGFydC5saW5lICYmIHBvcy5jaCA8PSBmaXJzdE5vbldTICYmIHBvcy5jaDtcbiAgICByZXR1cm4gUG9zKHN0YXJ0LmxpbmUsIGluV1MgPyAwIDogZmlyc3ROb25XUywgc3RhcnQuc3RpY2t5KVxuICB9XG4gIHJldHVybiBzdGFydFxufVxuXG4vLyBSdW4gYSBoYW5kbGVyIHRoYXQgd2FzIGJvdW5kIHRvIGEga2V5LlxuZnVuY3Rpb24gZG9IYW5kbGVCaW5kaW5nKGNtLCBib3VuZCwgZHJvcFNoaWZ0KSB7XG4gIGlmICh0eXBlb2YgYm91bmQgPT0gXCJzdHJpbmdcIikge1xuICAgIGJvdW5kID0gY29tbWFuZHNbYm91bmRdO1xuICAgIGlmICghYm91bmQpIHsgcmV0dXJuIGZhbHNlIH1cbiAgfVxuICAvLyBFbnN1cmUgcHJldmlvdXMgaW5wdXQgaGFzIGJlZW4gcmVhZCwgc28gdGhhdCB0aGUgaGFuZGxlciBzZWVzIGFcbiAgLy8gY29uc2lzdGVudCB2aWV3IG9mIHRoZSBkb2N1bWVudFxuICBjbS5kaXNwbGF5LmlucHV0LmVuc3VyZVBvbGxlZCgpO1xuICB2YXIgcHJldlNoaWZ0ID0gY20uZGlzcGxheS5zaGlmdCwgZG9uZSA9IGZhbHNlO1xuICB0cnkge1xuICAgIGlmIChjbS5pc1JlYWRPbmx5KCkpIHsgY20uc3RhdGUuc3VwcHJlc3NFZGl0cyA9IHRydWU7IH1cbiAgICBpZiAoZHJvcFNoaWZ0KSB7IGNtLmRpc3BsYXkuc2hpZnQgPSBmYWxzZTsgfVxuICAgIGRvbmUgPSBib3VuZChjbSkgIT0gUGFzcztcbiAgfSBmaW5hbGx5IHtcbiAgICBjbS5kaXNwbGF5LnNoaWZ0ID0gcHJldlNoaWZ0O1xuICAgIGNtLnN0YXRlLnN1cHByZXNzRWRpdHMgPSBmYWxzZTtcbiAgfVxuICByZXR1cm4gZG9uZVxufVxuXG5mdW5jdGlvbiBsb29rdXBLZXlGb3JFZGl0b3IoY20sIG5hbWUsIGhhbmRsZSkge1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGNtLnN0YXRlLmtleU1hcHMubGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgcmVzdWx0ID0gbG9va3VwS2V5KG5hbWUsIGNtLnN0YXRlLmtleU1hcHNbaV0sIGhhbmRsZSwgY20pO1xuICAgIGlmIChyZXN1bHQpIHsgcmV0dXJuIHJlc3VsdCB9XG4gIH1cbiAgcmV0dXJuIChjbS5vcHRpb25zLmV4dHJhS2V5cyAmJiBsb29rdXBLZXkobmFtZSwgY20ub3B0aW9ucy5leHRyYUtleXMsIGhhbmRsZSwgY20pKVxuICAgIHx8IGxvb2t1cEtleShuYW1lLCBjbS5vcHRpb25zLmtleU1hcCwgaGFuZGxlLCBjbSlcbn1cblxuLy8gTm90ZSB0aGF0LCBkZXNwaXRlIHRoZSBuYW1lLCB0aGlzIGZ1bmN0aW9uIGlzIGFsc28gdXNlZCB0byBjaGVja1xuLy8gZm9yIGJvdW5kIG1vdXNlIGNsaWNrcy5cblxudmFyIHN0b3BTZXEgPSBuZXcgRGVsYXllZDtcblxuZnVuY3Rpb24gZGlzcGF0Y2hLZXkoY20sIG5hbWUsIGUsIGhhbmRsZSkge1xuICB2YXIgc2VxID0gY20uc3RhdGUua2V5U2VxO1xuICBpZiAoc2VxKSB7XG4gICAgaWYgKGlzTW9kaWZpZXJLZXkobmFtZSkpIHsgcmV0dXJuIFwiaGFuZGxlZFwiIH1cbiAgICBpZiAoL1xcJyQvLnRlc3QobmFtZSkpXG4gICAgICB7IGNtLnN0YXRlLmtleVNlcSA9IG51bGw7IH1cbiAgICBlbHNlXG4gICAgICB7IHN0b3BTZXEuc2V0KDUwLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmIChjbS5zdGF0ZS5rZXlTZXEgPT0gc2VxKSB7XG4gICAgICAgICAgY20uc3RhdGUua2V5U2VxID0gbnVsbDtcbiAgICAgICAgICBjbS5kaXNwbGF5LmlucHV0LnJlc2V0KCk7XG4gICAgICAgIH1cbiAgICAgIH0pOyB9XG4gICAgaWYgKGRpc3BhdGNoS2V5SW5uZXIoY20sIHNlcSArIFwiIFwiICsgbmFtZSwgZSwgaGFuZGxlKSkgeyByZXR1cm4gdHJ1ZSB9XG4gIH1cbiAgcmV0dXJuIGRpc3BhdGNoS2V5SW5uZXIoY20sIG5hbWUsIGUsIGhhbmRsZSlcbn1cblxuZnVuY3Rpb24gZGlzcGF0Y2hLZXlJbm5lcihjbSwgbmFtZSwgZSwgaGFuZGxlKSB7XG4gIHZhciByZXN1bHQgPSBsb29rdXBLZXlGb3JFZGl0b3IoY20sIG5hbWUsIGhhbmRsZSk7XG5cbiAgaWYgKHJlc3VsdCA9PSBcIm11bHRpXCIpXG4gICAgeyBjbS5zdGF0ZS5rZXlTZXEgPSBuYW1lOyB9XG4gIGlmIChyZXN1bHQgPT0gXCJoYW5kbGVkXCIpXG4gICAgeyBzaWduYWxMYXRlcihjbSwgXCJrZXlIYW5kbGVkXCIsIGNtLCBuYW1lLCBlKTsgfVxuXG4gIGlmIChyZXN1bHQgPT0gXCJoYW5kbGVkXCIgfHwgcmVzdWx0ID09IFwibXVsdGlcIikge1xuICAgIGVfcHJldmVudERlZmF1bHQoZSk7XG4gICAgcmVzdGFydEJsaW5rKGNtKTtcbiAgfVxuXG4gIHJldHVybiAhIXJlc3VsdFxufVxuXG4vLyBIYW5kbGUgYSBrZXkgZnJvbSB0aGUga2V5ZG93biBldmVudC5cbmZ1bmN0aW9uIGhhbmRsZUtleUJpbmRpbmcoY20sIGUpIHtcbiAgdmFyIG5hbWUgPSBrZXlOYW1lKGUsIHRydWUpO1xuICBpZiAoIW5hbWUpIHsgcmV0dXJuIGZhbHNlIH1cblxuICBpZiAoZS5zaGlmdEtleSAmJiAhY20uc3RhdGUua2V5U2VxKSB7XG4gICAgLy8gRmlyc3QgdHJ5IHRvIHJlc29sdmUgZnVsbCBuYW1lIChpbmNsdWRpbmcgJ1NoaWZ0LScpLiBGYWlsaW5nXG4gICAgLy8gdGhhdCwgc2VlIGlmIHRoZXJlIGlzIGEgY3Vyc29yLW1vdGlvbiBjb21tYW5kIChzdGFydGluZyB3aXRoXG4gICAgLy8gJ2dvJykgYm91bmQgdG8gdGhlIGtleW5hbWUgd2l0aG91dCAnU2hpZnQtJy5cbiAgICByZXR1cm4gZGlzcGF0Y2hLZXkoY20sIFwiU2hpZnQtXCIgKyBuYW1lLCBlLCBmdW5jdGlvbiAoYikgeyByZXR1cm4gZG9IYW5kbGVCaW5kaW5nKGNtLCBiLCB0cnVlKTsgfSlcbiAgICAgICAgfHwgZGlzcGF0Y2hLZXkoY20sIG5hbWUsIGUsIGZ1bmN0aW9uIChiKSB7XG4gICAgICAgICAgICAgaWYgKHR5cGVvZiBiID09IFwic3RyaW5nXCIgPyAvXmdvW0EtWl0vLnRlc3QoYikgOiBiLm1vdGlvbilcbiAgICAgICAgICAgICAgIHsgcmV0dXJuIGRvSGFuZGxlQmluZGluZyhjbSwgYikgfVxuICAgICAgICAgICB9KVxuICB9IGVsc2Uge1xuICAgIHJldHVybiBkaXNwYXRjaEtleShjbSwgbmFtZSwgZSwgZnVuY3Rpb24gKGIpIHsgcmV0dXJuIGRvSGFuZGxlQmluZGluZyhjbSwgYik7IH0pXG4gIH1cbn1cblxuLy8gSGFuZGxlIGEga2V5IGZyb20gdGhlIGtleXByZXNzIGV2ZW50XG5mdW5jdGlvbiBoYW5kbGVDaGFyQmluZGluZyhjbSwgZSwgY2gpIHtcbiAgcmV0dXJuIGRpc3BhdGNoS2V5KGNtLCBcIidcIiArIGNoICsgXCInXCIsIGUsIGZ1bmN0aW9uIChiKSB7IHJldHVybiBkb0hhbmRsZUJpbmRpbmcoY20sIGIsIHRydWUpOyB9KVxufVxuXG52YXIgbGFzdFN0b3BwZWRLZXkgPSBudWxsO1xuZnVuY3Rpb24gb25LZXlEb3duKGUpIHtcbiAgdmFyIGNtID0gdGhpcztcbiAgY20uY3VyT3AuZm9jdXMgPSBhY3RpdmVFbHQoKTtcbiAgaWYgKHNpZ25hbERPTUV2ZW50KGNtLCBlKSkgeyByZXR1cm4gfVxuICAvLyBJRSBkb2VzIHN0cmFuZ2UgdGhpbmdzIHdpdGggZXNjYXBlLlxuICBpZiAoaWUgJiYgaWVfdmVyc2lvbiA8IDExICYmIGUua2V5Q29kZSA9PSAyNykgeyBlLnJldHVyblZhbHVlID0gZmFsc2U7IH1cbiAgdmFyIGNvZGUgPSBlLmtleUNvZGU7XG4gIGNtLmRpc3BsYXkuc2hpZnQgPSBjb2RlID09IDE2IHx8IGUuc2hpZnRLZXk7XG4gIHZhciBoYW5kbGVkID0gaGFuZGxlS2V5QmluZGluZyhjbSwgZSk7XG4gIGlmIChwcmVzdG8pIHtcbiAgICBsYXN0U3RvcHBlZEtleSA9IGhhbmRsZWQgPyBjb2RlIDogbnVsbDtcbiAgICAvLyBPcGVyYSBoYXMgbm8gY3V0IGV2ZW50Li4uIHdlIHRyeSB0byBhdCBsZWFzdCBjYXRjaCB0aGUga2V5IGNvbWJvXG4gICAgaWYgKCFoYW5kbGVkICYmIGNvZGUgPT0gODggJiYgIWhhc0NvcHlFdmVudCAmJiAobWFjID8gZS5tZXRhS2V5IDogZS5jdHJsS2V5KSlcbiAgICAgIHsgY20ucmVwbGFjZVNlbGVjdGlvbihcIlwiLCBudWxsLCBcImN1dFwiKTsgfVxuICB9XG5cbiAgLy8gVHVybiBtb3VzZSBpbnRvIGNyb3NzaGFpciB3aGVuIEFsdCBpcyBoZWxkIG9uIE1hYy5cbiAgaWYgKGNvZGUgPT0gMTggJiYgIS9cXGJDb2RlTWlycm9yLWNyb3NzaGFpclxcYi8udGVzdChjbS5kaXNwbGF5LmxpbmVEaXYuY2xhc3NOYW1lKSlcbiAgICB7IHNob3dDcm9zc0hhaXIoY20pOyB9XG59XG5cbmZ1bmN0aW9uIHNob3dDcm9zc0hhaXIoY20pIHtcbiAgdmFyIGxpbmVEaXYgPSBjbS5kaXNwbGF5LmxpbmVEaXY7XG4gIGFkZENsYXNzKGxpbmVEaXYsIFwiQ29kZU1pcnJvci1jcm9zc2hhaXJcIik7XG5cbiAgZnVuY3Rpb24gdXAoZSkge1xuICAgIGlmIChlLmtleUNvZGUgPT0gMTggfHwgIWUuYWx0S2V5KSB7XG4gICAgICBybUNsYXNzKGxpbmVEaXYsIFwiQ29kZU1pcnJvci1jcm9zc2hhaXJcIik7XG4gICAgICBvZmYoZG9jdW1lbnQsIFwia2V5dXBcIiwgdXApO1xuICAgICAgb2ZmKGRvY3VtZW50LCBcIm1vdXNlb3ZlclwiLCB1cCk7XG4gICAgfVxuICB9XG4gIG9uKGRvY3VtZW50LCBcImtleXVwXCIsIHVwKTtcbiAgb24oZG9jdW1lbnQsIFwibW91c2VvdmVyXCIsIHVwKTtcbn1cblxuZnVuY3Rpb24gb25LZXlVcChlKSB7XG4gIGlmIChlLmtleUNvZGUgPT0gMTYpIHsgdGhpcy5kb2Muc2VsLnNoaWZ0ID0gZmFsc2U7IH1cbiAgc2lnbmFsRE9NRXZlbnQodGhpcywgZSk7XG59XG5cbmZ1bmN0aW9uIG9uS2V5UHJlc3MoZSkge1xuICB2YXIgY20gPSB0aGlzO1xuICBpZiAoZXZlbnRJbldpZGdldChjbS5kaXNwbGF5LCBlKSB8fCBzaWduYWxET01FdmVudChjbSwgZSkgfHwgZS5jdHJsS2V5ICYmICFlLmFsdEtleSB8fCBtYWMgJiYgZS5tZXRhS2V5KSB7IHJldHVybiB9XG4gIHZhciBrZXlDb2RlID0gZS5rZXlDb2RlLCBjaGFyQ29kZSA9IGUuY2hhckNvZGU7XG4gIGlmIChwcmVzdG8gJiYga2V5Q29kZSA9PSBsYXN0U3RvcHBlZEtleSkge2xhc3RTdG9wcGVkS2V5ID0gbnVsbDsgZV9wcmV2ZW50RGVmYXVsdChlKTsgcmV0dXJufVxuICBpZiAoKHByZXN0byAmJiAoIWUud2hpY2ggfHwgZS53aGljaCA8IDEwKSkgJiYgaGFuZGxlS2V5QmluZGluZyhjbSwgZSkpIHsgcmV0dXJuIH1cbiAgdmFyIGNoID0gU3RyaW5nLmZyb21DaGFyQ29kZShjaGFyQ29kZSA9PSBudWxsID8ga2V5Q29kZSA6IGNoYXJDb2RlKTtcbiAgLy8gU29tZSBicm93c2VycyBmaXJlIGtleXByZXNzIGV2ZW50cyBmb3IgYmFja3NwYWNlXG4gIGlmIChjaCA9PSBcIlxceDA4XCIpIHsgcmV0dXJuIH1cbiAgaWYgKGhhbmRsZUNoYXJCaW5kaW5nKGNtLCBlLCBjaCkpIHsgcmV0dXJuIH1cbiAgY20uZGlzcGxheS5pbnB1dC5vbktleVByZXNzKGUpO1xufVxuXG52YXIgRE9VQkxFQ0xJQ0tfREVMQVkgPSA0MDA7XG5cbnZhciBQYXN0Q2xpY2sgPSBmdW5jdGlvbih0aW1lLCBwb3MsIGJ1dHRvbikge1xuICB0aGlzLnRpbWUgPSB0aW1lO1xuICB0aGlzLnBvcyA9IHBvcztcbiAgdGhpcy5idXR0b24gPSBidXR0b247XG59O1xuXG5QYXN0Q2xpY2sucHJvdG90eXBlLmNvbXBhcmUgPSBmdW5jdGlvbiAodGltZSwgcG9zLCBidXR0b24pIHtcbiAgcmV0dXJuIHRoaXMudGltZSArIERPVUJMRUNMSUNLX0RFTEFZID4gdGltZSAmJlxuICAgIGNtcChwb3MsIHRoaXMucG9zKSA9PSAwICYmIGJ1dHRvbiA9PSB0aGlzLmJ1dHRvblxufTtcblxudmFyIGxhc3RDbGljaztcbnZhciBsYXN0RG91YmxlQ2xpY2s7XG5mdW5jdGlvbiBjbGlja1JlcGVhdChwb3MsIGJ1dHRvbikge1xuICB2YXIgbm93ID0gK25ldyBEYXRlO1xuICBpZiAobGFzdERvdWJsZUNsaWNrICYmIGxhc3REb3VibGVDbGljay5jb21wYXJlKG5vdywgcG9zLCBidXR0b24pKSB7XG4gICAgbGFzdENsaWNrID0gbGFzdERvdWJsZUNsaWNrID0gbnVsbDtcbiAgICByZXR1cm4gXCJ0cmlwbGVcIlxuICB9IGVsc2UgaWYgKGxhc3RDbGljayAmJiBsYXN0Q2xpY2suY29tcGFyZShub3csIHBvcywgYnV0dG9uKSkge1xuICAgIGxhc3REb3VibGVDbGljayA9IG5ldyBQYXN0Q2xpY2sobm93LCBwb3MsIGJ1dHRvbik7XG4gICAgbGFzdENsaWNrID0gbnVsbDtcbiAgICByZXR1cm4gXCJkb3VibGVcIlxuICB9IGVsc2Uge1xuICAgIGxhc3RDbGljayA9IG5ldyBQYXN0Q2xpY2sobm93LCBwb3MsIGJ1dHRvbik7XG4gICAgbGFzdERvdWJsZUNsaWNrID0gbnVsbDtcbiAgICByZXR1cm4gXCJzaW5nbGVcIlxuICB9XG59XG5cbi8vIEEgbW91c2UgZG93biBjYW4gYmUgYSBzaW5nbGUgY2xpY2ssIGRvdWJsZSBjbGljaywgdHJpcGxlIGNsaWNrLFxuLy8gc3RhcnQgb2Ygc2VsZWN0aW9uIGRyYWcsIHN0YXJ0IG9mIHRleHQgZHJhZywgbmV3IGN1cnNvclxuLy8gKGN0cmwtY2xpY2spLCByZWN0YW5nbGUgZHJhZyAoYWx0LWRyYWcpLCBvciB4d2luXG4vLyBtaWRkbGUtY2xpY2stcGFzdGUuIE9yIGl0IG1pZ2h0IGJlIGEgY2xpY2sgb24gc29tZXRoaW5nIHdlIHNob3VsZFxuLy8gbm90IGludGVyZmVyZSB3aXRoLCBzdWNoIGFzIGEgc2Nyb2xsYmFyIG9yIHdpZGdldC5cbmZ1bmN0aW9uIG9uTW91c2VEb3duKGUpIHtcbiAgdmFyIGNtID0gdGhpcywgZGlzcGxheSA9IGNtLmRpc3BsYXk7XG4gIGlmIChzaWduYWxET01FdmVudChjbSwgZSkgfHwgZGlzcGxheS5hY3RpdmVUb3VjaCAmJiBkaXNwbGF5LmlucHV0LnN1cHBvcnRzVG91Y2goKSkgeyByZXR1cm4gfVxuICBkaXNwbGF5LmlucHV0LmVuc3VyZVBvbGxlZCgpO1xuICBkaXNwbGF5LnNoaWZ0ID0gZS5zaGlmdEtleTtcblxuICBpZiAoZXZlbnRJbldpZGdldChkaXNwbGF5LCBlKSkge1xuICAgIGlmICghd2Via2l0KSB7XG4gICAgICAvLyBCcmllZmx5IHR1cm4gb2ZmIGRyYWdnYWJpbGl0eSwgdG8gYWxsb3cgd2lkZ2V0cyB0byBkb1xuICAgICAgLy8gbm9ybWFsIGRyYWdnaW5nIHRoaW5ncy5cbiAgICAgIGRpc3BsYXkuc2Nyb2xsZXIuZHJhZ2dhYmxlID0gZmFsc2U7XG4gICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHsgcmV0dXJuIGRpc3BsYXkuc2Nyb2xsZXIuZHJhZ2dhYmxlID0gdHJ1ZTsgfSwgMTAwKTtcbiAgICB9XG4gICAgcmV0dXJuXG4gIH1cbiAgaWYgKGNsaWNrSW5HdXR0ZXIoY20sIGUpKSB7IHJldHVybiB9XG4gIHZhciBwb3MgPSBwb3NGcm9tTW91c2UoY20sIGUpLCBidXR0b24gPSBlX2J1dHRvbihlKSwgcmVwZWF0ID0gcG9zID8gY2xpY2tSZXBlYXQocG9zLCBidXR0b24pIDogXCJzaW5nbGVcIjtcbiAgd2luZG93LmZvY3VzKCk7XG5cbiAgLy8gIzMyNjE6IG1ha2Ugc3VyZSwgdGhhdCB3ZSdyZSBub3Qgc3RhcnRpbmcgYSBzZWNvbmQgc2VsZWN0aW9uXG4gIGlmIChidXR0b24gPT0gMSAmJiBjbS5zdGF0ZS5zZWxlY3RpbmdUZXh0KVxuICAgIHsgY20uc3RhdGUuc2VsZWN0aW5nVGV4dChlKTsgfVxuXG4gIGlmIChwb3MgJiYgaGFuZGxlTWFwcGVkQnV0dG9uKGNtLCBidXR0b24sIHBvcywgcmVwZWF0LCBlKSkgeyByZXR1cm4gfVxuXG4gIGlmIChidXR0b24gPT0gMSkge1xuICAgIGlmIChwb3MpIHsgbGVmdEJ1dHRvbkRvd24oY20sIHBvcywgcmVwZWF0LCBlKTsgfVxuICAgIGVsc2UgaWYgKGVfdGFyZ2V0KGUpID09IGRpc3BsYXkuc2Nyb2xsZXIpIHsgZV9wcmV2ZW50RGVmYXVsdChlKTsgfVxuICB9IGVsc2UgaWYgKGJ1dHRvbiA9PSAyKSB7XG4gICAgaWYgKHBvcykgeyBleHRlbmRTZWxlY3Rpb24oY20uZG9jLCBwb3MpOyB9XG4gICAgc2V0VGltZW91dChmdW5jdGlvbiAoKSB7IHJldHVybiBkaXNwbGF5LmlucHV0LmZvY3VzKCk7IH0sIDIwKTtcbiAgfSBlbHNlIGlmIChidXR0b24gPT0gMykge1xuICAgIGlmIChjYXB0dXJlUmlnaHRDbGljaykgeyBvbkNvbnRleHRNZW51KGNtLCBlKTsgfVxuICAgIGVsc2UgeyBkZWxheUJsdXJFdmVudChjbSk7IH1cbiAgfVxufVxuXG5mdW5jdGlvbiBoYW5kbGVNYXBwZWRCdXR0b24oY20sIGJ1dHRvbiwgcG9zLCByZXBlYXQsIGV2ZW50KSB7XG4gIHZhciBuYW1lID0gXCJDbGlja1wiO1xuICBpZiAocmVwZWF0ID09IFwiZG91YmxlXCIpIHsgbmFtZSA9IFwiRG91YmxlXCIgKyBuYW1lOyB9XG4gIGVsc2UgaWYgKHJlcGVhdCA9PSBcInRyaXBsZVwiKSB7IG5hbWUgPSBcIlRyaXBsZVwiICsgbmFtZTsgfVxuICBuYW1lID0gKGJ1dHRvbiA9PSAxID8gXCJMZWZ0XCIgOiBidXR0b24gPT0gMiA/IFwiTWlkZGxlXCIgOiBcIlJpZ2h0XCIpICsgbmFtZTtcblxuICByZXR1cm4gZGlzcGF0Y2hLZXkoY20sICBhZGRNb2RpZmllck5hbWVzKG5hbWUsIGV2ZW50KSwgZXZlbnQsIGZ1bmN0aW9uIChib3VuZCkge1xuICAgIGlmICh0eXBlb2YgYm91bmQgPT0gXCJzdHJpbmdcIikgeyBib3VuZCA9IGNvbW1hbmRzW2JvdW5kXTsgfVxuICAgIGlmICghYm91bmQpIHsgcmV0dXJuIGZhbHNlIH1cbiAgICB2YXIgZG9uZSA9IGZhbHNlO1xuICAgIHRyeSB7XG4gICAgICBpZiAoY20uaXNSZWFkT25seSgpKSB7IGNtLnN0YXRlLnN1cHByZXNzRWRpdHMgPSB0cnVlOyB9XG4gICAgICBkb25lID0gYm91bmQoY20sIHBvcykgIT0gUGFzcztcbiAgICB9IGZpbmFsbHkge1xuICAgICAgY20uc3RhdGUuc3VwcHJlc3NFZGl0cyA9IGZhbHNlO1xuICAgIH1cbiAgICByZXR1cm4gZG9uZVxuICB9KVxufVxuXG5mdW5jdGlvbiBjb25maWd1cmVNb3VzZShjbSwgcmVwZWF0LCBldmVudCkge1xuICB2YXIgb3B0aW9uID0gY20uZ2V0T3B0aW9uKFwiY29uZmlndXJlTW91c2VcIik7XG4gIHZhciB2YWx1ZSA9IG9wdGlvbiA/IG9wdGlvbihjbSwgcmVwZWF0LCBldmVudCkgOiB7fTtcbiAgaWYgKHZhbHVlLnVuaXQgPT0gbnVsbCkge1xuICAgIHZhciByZWN0ID0gY2hyb21lT1MgPyBldmVudC5zaGlmdEtleSAmJiBldmVudC5tZXRhS2V5IDogZXZlbnQuYWx0S2V5O1xuICAgIHZhbHVlLnVuaXQgPSByZWN0ID8gXCJyZWN0YW5nbGVcIiA6IHJlcGVhdCA9PSBcInNpbmdsZVwiID8gXCJjaGFyXCIgOiByZXBlYXQgPT0gXCJkb3VibGVcIiA/IFwid29yZFwiIDogXCJsaW5lXCI7XG4gIH1cbiAgaWYgKHZhbHVlLmV4dGVuZCA9PSBudWxsIHx8IGNtLmRvYy5leHRlbmQpIHsgdmFsdWUuZXh0ZW5kID0gY20uZG9jLmV4dGVuZCB8fCBldmVudC5zaGlmdEtleTsgfVxuICBpZiAodmFsdWUuYWRkTmV3ID09IG51bGwpIHsgdmFsdWUuYWRkTmV3ID0gbWFjID8gZXZlbnQubWV0YUtleSA6IGV2ZW50LmN0cmxLZXk7IH1cbiAgaWYgKHZhbHVlLm1vdmVPbkRyYWcgPT0gbnVsbCkgeyB2YWx1ZS5tb3ZlT25EcmFnID0gIShtYWMgPyBldmVudC5hbHRLZXkgOiBldmVudC5jdHJsS2V5KTsgfVxuICByZXR1cm4gdmFsdWVcbn1cblxuZnVuY3Rpb24gbGVmdEJ1dHRvbkRvd24oY20sIHBvcywgcmVwZWF0LCBldmVudCkge1xuICBpZiAoaWUpIHsgc2V0VGltZW91dChiaW5kKGVuc3VyZUZvY3VzLCBjbSksIDApOyB9XG4gIGVsc2UgeyBjbS5jdXJPcC5mb2N1cyA9IGFjdGl2ZUVsdCgpOyB9XG5cbiAgdmFyIGJlaGF2aW9yID0gY29uZmlndXJlTW91c2UoY20sIHJlcGVhdCwgZXZlbnQpO1xuXG4gIHZhciBzZWwgPSBjbS5kb2Muc2VsLCBjb250YWluZWQ7XG4gIGlmIChjbS5vcHRpb25zLmRyYWdEcm9wICYmIGRyYWdBbmREcm9wICYmICFjbS5pc1JlYWRPbmx5KCkgJiZcbiAgICAgIHJlcGVhdCA9PSBcInNpbmdsZVwiICYmIChjb250YWluZWQgPSBzZWwuY29udGFpbnMocG9zKSkgPiAtMSAmJlxuICAgICAgKGNtcCgoY29udGFpbmVkID0gc2VsLnJhbmdlc1tjb250YWluZWRdKS5mcm9tKCksIHBvcykgPCAwIHx8IHBvcy54UmVsID4gMCkgJiZcbiAgICAgIChjbXAoY29udGFpbmVkLnRvKCksIHBvcykgPiAwIHx8IHBvcy54UmVsIDwgMCkpXG4gICAgeyBsZWZ0QnV0dG9uU3RhcnREcmFnKGNtLCBldmVudCwgcG9zLCBiZWhhdmlvcik7IH1cbiAgZWxzZVxuICAgIHsgbGVmdEJ1dHRvblNlbGVjdChjbSwgZXZlbnQsIHBvcywgYmVoYXZpb3IpOyB9XG59XG5cbi8vIFN0YXJ0IGEgdGV4dCBkcmFnLiBXaGVuIGl0IGVuZHMsIHNlZSBpZiBhbnkgZHJhZ2dpbmcgYWN0dWFsbHlcbi8vIGhhcHBlbiwgYW5kIHRyZWF0IGFzIGEgY2xpY2sgaWYgaXQgZGlkbid0LlxuZnVuY3Rpb24gbGVmdEJ1dHRvblN0YXJ0RHJhZyhjbSwgZXZlbnQsIHBvcywgYmVoYXZpb3IpIHtcbiAgdmFyIGRpc3BsYXkgPSBjbS5kaXNwbGF5LCBtb3ZlZCA9IGZhbHNlO1xuICB2YXIgZHJhZ0VuZCA9IG9wZXJhdGlvbihjbSwgZnVuY3Rpb24gKGUpIHtcbiAgICBpZiAod2Via2l0KSB7IGRpc3BsYXkuc2Nyb2xsZXIuZHJhZ2dhYmxlID0gZmFsc2U7IH1cbiAgICBjbS5zdGF0ZS5kcmFnZ2luZ1RleHQgPSBmYWxzZTtcbiAgICBvZmYoZGlzcGxheS53cmFwcGVyLm93bmVyRG9jdW1lbnQsIFwibW91c2V1cFwiLCBkcmFnRW5kKTtcbiAgICBvZmYoZGlzcGxheS53cmFwcGVyLm93bmVyRG9jdW1lbnQsIFwibW91c2Vtb3ZlXCIsIG1vdXNlTW92ZSk7XG4gICAgb2ZmKGRpc3BsYXkuc2Nyb2xsZXIsIFwiZHJhZ3N0YXJ0XCIsIGRyYWdTdGFydCk7XG4gICAgb2ZmKGRpc3BsYXkuc2Nyb2xsZXIsIFwiZHJvcFwiLCBkcmFnRW5kKTtcbiAgICBpZiAoIW1vdmVkKSB7XG4gICAgICBlX3ByZXZlbnREZWZhdWx0KGUpO1xuICAgICAgaWYgKCFiZWhhdmlvci5hZGROZXcpXG4gICAgICAgIHsgZXh0ZW5kU2VsZWN0aW9uKGNtLmRvYywgcG9zLCBudWxsLCBudWxsLCBiZWhhdmlvci5leHRlbmQpOyB9XG4gICAgICAvLyBXb3JrIGFyb3VuZCB1bmV4cGxhaW5hYmxlIGZvY3VzIHByb2JsZW0gaW4gSUU5ICgjMjEyNykgYW5kIENocm9tZSAoIzMwODEpXG4gICAgICBpZiAod2Via2l0IHx8IGllICYmIGllX3ZlcnNpb24gPT0gOSlcbiAgICAgICAgeyBzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHtkaXNwbGF5LndyYXBwZXIub3duZXJEb2N1bWVudC5ib2R5LmZvY3VzKCk7IGRpc3BsYXkuaW5wdXQuZm9jdXMoKTt9LCAyMCk7IH1cbiAgICAgIGVsc2VcbiAgICAgICAgeyBkaXNwbGF5LmlucHV0LmZvY3VzKCk7IH1cbiAgICB9XG4gIH0pO1xuICB2YXIgbW91c2VNb3ZlID0gZnVuY3Rpb24oZTIpIHtcbiAgICBtb3ZlZCA9IG1vdmVkIHx8IE1hdGguYWJzKGV2ZW50LmNsaWVudFggLSBlMi5jbGllbnRYKSArIE1hdGguYWJzKGV2ZW50LmNsaWVudFkgLSBlMi5jbGllbnRZKSA+PSAxMDtcbiAgfTtcbiAgdmFyIGRyYWdTdGFydCA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuIG1vdmVkID0gdHJ1ZTsgfTtcbiAgLy8gTGV0IHRoZSBkcmFnIGhhbmRsZXIgaGFuZGxlIHRoaXMuXG4gIGlmICh3ZWJraXQpIHsgZGlzcGxheS5zY3JvbGxlci5kcmFnZ2FibGUgPSB0cnVlOyB9XG4gIGNtLnN0YXRlLmRyYWdnaW5nVGV4dCA9IGRyYWdFbmQ7XG4gIGRyYWdFbmQuY29weSA9ICFiZWhhdmlvci5tb3ZlT25EcmFnO1xuICAvLyBJRSdzIGFwcHJvYWNoIHRvIGRyYWdnYWJsZVxuICBpZiAoZGlzcGxheS5zY3JvbGxlci5kcmFnRHJvcCkgeyBkaXNwbGF5LnNjcm9sbGVyLmRyYWdEcm9wKCk7IH1cbiAgb24oZGlzcGxheS53cmFwcGVyLm93bmVyRG9jdW1lbnQsIFwibW91c2V1cFwiLCBkcmFnRW5kKTtcbiAgb24oZGlzcGxheS53cmFwcGVyLm93bmVyRG9jdW1lbnQsIFwibW91c2Vtb3ZlXCIsIG1vdXNlTW92ZSk7XG4gIG9uKGRpc3BsYXkuc2Nyb2xsZXIsIFwiZHJhZ3N0YXJ0XCIsIGRyYWdTdGFydCk7XG4gIG9uKGRpc3BsYXkuc2Nyb2xsZXIsIFwiZHJvcFwiLCBkcmFnRW5kKTtcblxuICBkZWxheUJsdXJFdmVudChjbSk7XG4gIHNldFRpbWVvdXQoZnVuY3Rpb24gKCkgeyByZXR1cm4gZGlzcGxheS5pbnB1dC5mb2N1cygpOyB9LCAyMCk7XG59XG5cbmZ1bmN0aW9uIHJhbmdlRm9yVW5pdChjbSwgcG9zLCB1bml0KSB7XG4gIGlmICh1bml0ID09IFwiY2hhclwiKSB7IHJldHVybiBuZXcgUmFuZ2UocG9zLCBwb3MpIH1cbiAgaWYgKHVuaXQgPT0gXCJ3b3JkXCIpIHsgcmV0dXJuIGNtLmZpbmRXb3JkQXQocG9zKSB9XG4gIGlmICh1bml0ID09IFwibGluZVwiKSB7IHJldHVybiBuZXcgUmFuZ2UoUG9zKHBvcy5saW5lLCAwKSwgY2xpcFBvcyhjbS5kb2MsIFBvcyhwb3MubGluZSArIDEsIDApKSkgfVxuICB2YXIgcmVzdWx0ID0gdW5pdChjbSwgcG9zKTtcbiAgcmV0dXJuIG5ldyBSYW5nZShyZXN1bHQuZnJvbSwgcmVzdWx0LnRvKVxufVxuXG4vLyBOb3JtYWwgc2VsZWN0aW9uLCBhcyBvcHBvc2VkIHRvIHRleHQgZHJhZ2dpbmcuXG5mdW5jdGlvbiBsZWZ0QnV0dG9uU2VsZWN0KGNtLCBldmVudCwgc3RhcnQsIGJlaGF2aW9yKSB7XG4gIHZhciBkaXNwbGF5ID0gY20uZGlzcGxheSwgZG9jID0gY20uZG9jO1xuICBlX3ByZXZlbnREZWZhdWx0KGV2ZW50KTtcblxuICB2YXIgb3VyUmFuZ2UsIG91ckluZGV4LCBzdGFydFNlbCA9IGRvYy5zZWwsIHJhbmdlcyA9IHN0YXJ0U2VsLnJhbmdlcztcbiAgaWYgKGJlaGF2aW9yLmFkZE5ldyAmJiAhYmVoYXZpb3IuZXh0ZW5kKSB7XG4gICAgb3VySW5kZXggPSBkb2Muc2VsLmNvbnRhaW5zKHN0YXJ0KTtcbiAgICBpZiAob3VySW5kZXggPiAtMSlcbiAgICAgIHsgb3VyUmFuZ2UgPSByYW5nZXNbb3VySW5kZXhdOyB9XG4gICAgZWxzZVxuICAgICAgeyBvdXJSYW5nZSA9IG5ldyBSYW5nZShzdGFydCwgc3RhcnQpOyB9XG4gIH0gZWxzZSB7XG4gICAgb3VyUmFuZ2UgPSBkb2Muc2VsLnByaW1hcnkoKTtcbiAgICBvdXJJbmRleCA9IGRvYy5zZWwucHJpbUluZGV4O1xuICB9XG5cbiAgaWYgKGJlaGF2aW9yLnVuaXQgPT0gXCJyZWN0YW5nbGVcIikge1xuICAgIGlmICghYmVoYXZpb3IuYWRkTmV3KSB7IG91clJhbmdlID0gbmV3IFJhbmdlKHN0YXJ0LCBzdGFydCk7IH1cbiAgICBzdGFydCA9IHBvc0Zyb21Nb3VzZShjbSwgZXZlbnQsIHRydWUsIHRydWUpO1xuICAgIG91ckluZGV4ID0gLTE7XG4gIH0gZWxzZSB7XG4gICAgdmFyIHJhbmdlJCQxID0gcmFuZ2VGb3JVbml0KGNtLCBzdGFydCwgYmVoYXZpb3IudW5pdCk7XG4gICAgaWYgKGJlaGF2aW9yLmV4dGVuZClcbiAgICAgIHsgb3VyUmFuZ2UgPSBleHRlbmRSYW5nZShvdXJSYW5nZSwgcmFuZ2UkJDEuYW5jaG9yLCByYW5nZSQkMS5oZWFkLCBiZWhhdmlvci5leHRlbmQpOyB9XG4gICAgZWxzZVxuICAgICAgeyBvdXJSYW5nZSA9IHJhbmdlJCQxOyB9XG4gIH1cblxuICBpZiAoIWJlaGF2aW9yLmFkZE5ldykge1xuICAgIG91ckluZGV4ID0gMDtcbiAgICBzZXRTZWxlY3Rpb24oZG9jLCBuZXcgU2VsZWN0aW9uKFtvdXJSYW5nZV0sIDApLCBzZWxfbW91c2UpO1xuICAgIHN0YXJ0U2VsID0gZG9jLnNlbDtcbiAgfSBlbHNlIGlmIChvdXJJbmRleCA9PSAtMSkge1xuICAgIG91ckluZGV4ID0gcmFuZ2VzLmxlbmd0aDtcbiAgICBzZXRTZWxlY3Rpb24oZG9jLCBub3JtYWxpemVTZWxlY3Rpb24ocmFuZ2VzLmNvbmNhdChbb3VyUmFuZ2VdKSwgb3VySW5kZXgpLFxuICAgICAgICAgICAgICAgICB7c2Nyb2xsOiBmYWxzZSwgb3JpZ2luOiBcIiptb3VzZVwifSk7XG4gIH0gZWxzZSBpZiAocmFuZ2VzLmxlbmd0aCA+IDEgJiYgcmFuZ2VzW291ckluZGV4XS5lbXB0eSgpICYmIGJlaGF2aW9yLnVuaXQgPT0gXCJjaGFyXCIgJiYgIWJlaGF2aW9yLmV4dGVuZCkge1xuICAgIHNldFNlbGVjdGlvbihkb2MsIG5vcm1hbGl6ZVNlbGVjdGlvbihyYW5nZXMuc2xpY2UoMCwgb3VySW5kZXgpLmNvbmNhdChyYW5nZXMuc2xpY2Uob3VySW5kZXggKyAxKSksIDApLFxuICAgICAgICAgICAgICAgICB7c2Nyb2xsOiBmYWxzZSwgb3JpZ2luOiBcIiptb3VzZVwifSk7XG4gICAgc3RhcnRTZWwgPSBkb2Muc2VsO1xuICB9IGVsc2Uge1xuICAgIHJlcGxhY2VPbmVTZWxlY3Rpb24oZG9jLCBvdXJJbmRleCwgb3VyUmFuZ2UsIHNlbF9tb3VzZSk7XG4gIH1cblxuICB2YXIgbGFzdFBvcyA9IHN0YXJ0O1xuICBmdW5jdGlvbiBleHRlbmRUbyhwb3MpIHtcbiAgICBpZiAoY21wKGxhc3RQb3MsIHBvcykgPT0gMCkgeyByZXR1cm4gfVxuICAgIGxhc3RQb3MgPSBwb3M7XG5cbiAgICBpZiAoYmVoYXZpb3IudW5pdCA9PSBcInJlY3RhbmdsZVwiKSB7XG4gICAgICB2YXIgcmFuZ2VzID0gW10sIHRhYlNpemUgPSBjbS5vcHRpb25zLnRhYlNpemU7XG4gICAgICB2YXIgc3RhcnRDb2wgPSBjb3VudENvbHVtbihnZXRMaW5lKGRvYywgc3RhcnQubGluZSkudGV4dCwgc3RhcnQuY2gsIHRhYlNpemUpO1xuICAgICAgdmFyIHBvc0NvbCA9IGNvdW50Q29sdW1uKGdldExpbmUoZG9jLCBwb3MubGluZSkudGV4dCwgcG9zLmNoLCB0YWJTaXplKTtcbiAgICAgIHZhciBsZWZ0ID0gTWF0aC5taW4oc3RhcnRDb2wsIHBvc0NvbCksIHJpZ2h0ID0gTWF0aC5tYXgoc3RhcnRDb2wsIHBvc0NvbCk7XG4gICAgICBmb3IgKHZhciBsaW5lID0gTWF0aC5taW4oc3RhcnQubGluZSwgcG9zLmxpbmUpLCBlbmQgPSBNYXRoLm1pbihjbS5sYXN0TGluZSgpLCBNYXRoLm1heChzdGFydC5saW5lLCBwb3MubGluZSkpO1xuICAgICAgICAgICBsaW5lIDw9IGVuZDsgbGluZSsrKSB7XG4gICAgICAgIHZhciB0ZXh0ID0gZ2V0TGluZShkb2MsIGxpbmUpLnRleHQsIGxlZnRQb3MgPSBmaW5kQ29sdW1uKHRleHQsIGxlZnQsIHRhYlNpemUpO1xuICAgICAgICBpZiAobGVmdCA9PSByaWdodClcbiAgICAgICAgICB7IHJhbmdlcy5wdXNoKG5ldyBSYW5nZShQb3MobGluZSwgbGVmdFBvcyksIFBvcyhsaW5lLCBsZWZ0UG9zKSkpOyB9XG4gICAgICAgIGVsc2UgaWYgKHRleHQubGVuZ3RoID4gbGVmdFBvcylcbiAgICAgICAgICB7IHJhbmdlcy5wdXNoKG5ldyBSYW5nZShQb3MobGluZSwgbGVmdFBvcyksIFBvcyhsaW5lLCBmaW5kQ29sdW1uKHRleHQsIHJpZ2h0LCB0YWJTaXplKSkpKTsgfVxuICAgICAgfVxuICAgICAgaWYgKCFyYW5nZXMubGVuZ3RoKSB7IHJhbmdlcy5wdXNoKG5ldyBSYW5nZShzdGFydCwgc3RhcnQpKTsgfVxuICAgICAgc2V0U2VsZWN0aW9uKGRvYywgbm9ybWFsaXplU2VsZWN0aW9uKHN0YXJ0U2VsLnJhbmdlcy5zbGljZSgwLCBvdXJJbmRleCkuY29uY2F0KHJhbmdlcyksIG91ckluZGV4KSxcbiAgICAgICAgICAgICAgICAgICB7b3JpZ2luOiBcIiptb3VzZVwiLCBzY3JvbGw6IGZhbHNlfSk7XG4gICAgICBjbS5zY3JvbGxJbnRvVmlldyhwb3MpO1xuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgb2xkUmFuZ2UgPSBvdXJSYW5nZTtcbiAgICAgIHZhciByYW5nZSQkMSA9IHJhbmdlRm9yVW5pdChjbSwgcG9zLCBiZWhhdmlvci51bml0KTtcbiAgICAgIHZhciBhbmNob3IgPSBvbGRSYW5nZS5hbmNob3IsIGhlYWQ7XG4gICAgICBpZiAoY21wKHJhbmdlJCQxLmFuY2hvciwgYW5jaG9yKSA+IDApIHtcbiAgICAgICAgaGVhZCA9IHJhbmdlJCQxLmhlYWQ7XG4gICAgICAgIGFuY2hvciA9IG1pblBvcyhvbGRSYW5nZS5mcm9tKCksIHJhbmdlJCQxLmFuY2hvcik7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBoZWFkID0gcmFuZ2UkJDEuYW5jaG9yO1xuICAgICAgICBhbmNob3IgPSBtYXhQb3Mob2xkUmFuZ2UudG8oKSwgcmFuZ2UkJDEuaGVhZCk7XG4gICAgICB9XG4gICAgICB2YXIgcmFuZ2VzJDEgPSBzdGFydFNlbC5yYW5nZXMuc2xpY2UoMCk7XG4gICAgICByYW5nZXMkMVtvdXJJbmRleF0gPSBiaWRpU2ltcGxpZnkoY20sIG5ldyBSYW5nZShjbGlwUG9zKGRvYywgYW5jaG9yKSwgaGVhZCkpO1xuICAgICAgc2V0U2VsZWN0aW9uKGRvYywgbm9ybWFsaXplU2VsZWN0aW9uKHJhbmdlcyQxLCBvdXJJbmRleCksIHNlbF9tb3VzZSk7XG4gICAgfVxuICB9XG5cbiAgdmFyIGVkaXRvclNpemUgPSBkaXNwbGF5LndyYXBwZXIuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gIC8vIFVzZWQgdG8gZW5zdXJlIHRpbWVvdXQgcmUtdHJpZXMgZG9uJ3QgZmlyZSB3aGVuIGFub3RoZXIgZXh0ZW5kXG4gIC8vIGhhcHBlbmVkIGluIHRoZSBtZWFudGltZSAoY2xlYXJUaW1lb3V0IGlzbid0IHJlbGlhYmxlIC0tIGF0XG4gIC8vIGxlYXN0IG9uIENocm9tZSwgdGhlIHRpbWVvdXRzIHN0aWxsIGhhcHBlbiBldmVuIHdoZW4gY2xlYXJlZCxcbiAgLy8gaWYgdGhlIGNsZWFyIGhhcHBlbnMgYWZ0ZXIgdGhlaXIgc2NoZWR1bGVkIGZpcmluZyB0aW1lKS5cbiAgdmFyIGNvdW50ZXIgPSAwO1xuXG4gIGZ1bmN0aW9uIGV4dGVuZChlKSB7XG4gICAgdmFyIGN1ckNvdW50ID0gKytjb3VudGVyO1xuICAgIHZhciBjdXIgPSBwb3NGcm9tTW91c2UoY20sIGUsIHRydWUsIGJlaGF2aW9yLnVuaXQgPT0gXCJyZWN0YW5nbGVcIik7XG4gICAgaWYgKCFjdXIpIHsgcmV0dXJuIH1cbiAgICBpZiAoY21wKGN1ciwgbGFzdFBvcykgIT0gMCkge1xuICAgICAgY20uY3VyT3AuZm9jdXMgPSBhY3RpdmVFbHQoKTtcbiAgICAgIGV4dGVuZFRvKGN1cik7XG4gICAgICB2YXIgdmlzaWJsZSA9IHZpc2libGVMaW5lcyhkaXNwbGF5LCBkb2MpO1xuICAgICAgaWYgKGN1ci5saW5lID49IHZpc2libGUudG8gfHwgY3VyLmxpbmUgPCB2aXNpYmxlLmZyb20pXG4gICAgICAgIHsgc2V0VGltZW91dChvcGVyYXRpb24oY20sIGZ1bmN0aW9uICgpIHtpZiAoY291bnRlciA9PSBjdXJDb3VudCkgeyBleHRlbmQoZSk7IH19KSwgMTUwKTsgfVxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgb3V0c2lkZSA9IGUuY2xpZW50WSA8IGVkaXRvclNpemUudG9wID8gLTIwIDogZS5jbGllbnRZID4gZWRpdG9yU2l6ZS5ib3R0b20gPyAyMCA6IDA7XG4gICAgICBpZiAob3V0c2lkZSkgeyBzZXRUaW1lb3V0KG9wZXJhdGlvbihjbSwgZnVuY3Rpb24gKCkge1xuICAgICAgICBpZiAoY291bnRlciAhPSBjdXJDb3VudCkgeyByZXR1cm4gfVxuICAgICAgICBkaXNwbGF5LnNjcm9sbGVyLnNjcm9sbFRvcCArPSBvdXRzaWRlO1xuICAgICAgICBleHRlbmQoZSk7XG4gICAgICB9KSwgNTApOyB9XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gZG9uZShlKSB7XG4gICAgY20uc3RhdGUuc2VsZWN0aW5nVGV4dCA9IGZhbHNlO1xuICAgIGNvdW50ZXIgPSBJbmZpbml0eTtcbiAgICBlX3ByZXZlbnREZWZhdWx0KGUpO1xuICAgIGRpc3BsYXkuaW5wdXQuZm9jdXMoKTtcbiAgICBvZmYoZGlzcGxheS53cmFwcGVyLm93bmVyRG9jdW1lbnQsIFwibW91c2Vtb3ZlXCIsIG1vdmUpO1xuICAgIG9mZihkaXNwbGF5LndyYXBwZXIub3duZXJEb2N1bWVudCwgXCJtb3VzZXVwXCIsIHVwKTtcbiAgICBkb2MuaGlzdG9yeS5sYXN0U2VsT3JpZ2luID0gbnVsbDtcbiAgfVxuXG4gIHZhciBtb3ZlID0gb3BlcmF0aW9uKGNtLCBmdW5jdGlvbiAoZSkge1xuICAgIGlmIChlLmJ1dHRvbnMgPT09IDAgfHwgIWVfYnV0dG9uKGUpKSB7IGRvbmUoZSk7IH1cbiAgICBlbHNlIHsgZXh0ZW5kKGUpOyB9XG4gIH0pO1xuICB2YXIgdXAgPSBvcGVyYXRpb24oY20sIGRvbmUpO1xuICBjbS5zdGF0ZS5zZWxlY3RpbmdUZXh0ID0gdXA7XG4gIG9uKGRpc3BsYXkud3JhcHBlci5vd25lckRvY3VtZW50LCBcIm1vdXNlbW92ZVwiLCBtb3ZlKTtcbiAgb24oZGlzcGxheS53cmFwcGVyLm93bmVyRG9jdW1lbnQsIFwibW91c2V1cFwiLCB1cCk7XG59XG5cbi8vIFVzZWQgd2hlbiBtb3VzZS1zZWxlY3RpbmcgdG8gYWRqdXN0IHRoZSBhbmNob3IgdG8gdGhlIHByb3BlciBzaWRlXG4vLyBvZiBhIGJpZGkganVtcCBkZXBlbmRpbmcgb24gdGhlIHZpc3VhbCBwb3NpdGlvbiBvZiB0aGUgaGVhZC5cbmZ1bmN0aW9uIGJpZGlTaW1wbGlmeShjbSwgcmFuZ2UkJDEpIHtcbiAgdmFyIGFuY2hvciA9IHJhbmdlJCQxLmFuY2hvcjtcbiAgdmFyIGhlYWQgPSByYW5nZSQkMS5oZWFkO1xuICB2YXIgYW5jaG9yTGluZSA9IGdldExpbmUoY20uZG9jLCBhbmNob3IubGluZSk7XG4gIGlmIChjbXAoYW5jaG9yLCBoZWFkKSA9PSAwICYmIGFuY2hvci5zdGlja3kgPT0gaGVhZC5zdGlja3kpIHsgcmV0dXJuIHJhbmdlJCQxIH1cbiAgdmFyIG9yZGVyID0gZ2V0T3JkZXIoYW5jaG9yTGluZSk7XG4gIGlmICghb3JkZXIpIHsgcmV0dXJuIHJhbmdlJCQxIH1cbiAgdmFyIGluZGV4ID0gZ2V0QmlkaVBhcnRBdChvcmRlciwgYW5jaG9yLmNoLCBhbmNob3Iuc3RpY2t5KSwgcGFydCA9IG9yZGVyW2luZGV4XTtcbiAgaWYgKHBhcnQuZnJvbSAhPSBhbmNob3IuY2ggJiYgcGFydC50byAhPSBhbmNob3IuY2gpIHsgcmV0dXJuIHJhbmdlJCQxIH1cbiAgdmFyIGJvdW5kYXJ5ID0gaW5kZXggKyAoKHBhcnQuZnJvbSA9PSBhbmNob3IuY2gpID09IChwYXJ0LmxldmVsICE9IDEpID8gMCA6IDEpO1xuICBpZiAoYm91bmRhcnkgPT0gMCB8fCBib3VuZGFyeSA9PSBvcmRlci5sZW5ndGgpIHsgcmV0dXJuIHJhbmdlJCQxIH1cblxuICAvLyBDb21wdXRlIHRoZSByZWxhdGl2ZSB2aXN1YWwgcG9zaXRpb24gb2YgdGhlIGhlYWQgY29tcGFyZWQgdG8gdGhlXG4gIC8vIGFuY2hvciAoPDAgaXMgdG8gdGhlIGxlZnQsID4wIHRvIHRoZSByaWdodClcbiAgdmFyIGxlZnRTaWRlO1xuICBpZiAoaGVhZC5saW5lICE9IGFuY2hvci5saW5lKSB7XG4gICAgbGVmdFNpZGUgPSAoaGVhZC5saW5lIC0gYW5jaG9yLmxpbmUpICogKGNtLmRvYy5kaXJlY3Rpb24gPT0gXCJsdHJcIiA/IDEgOiAtMSkgPiAwO1xuICB9IGVsc2Uge1xuICAgIHZhciBoZWFkSW5kZXggPSBnZXRCaWRpUGFydEF0KG9yZGVyLCBoZWFkLmNoLCBoZWFkLnN0aWNreSk7XG4gICAgdmFyIGRpciA9IGhlYWRJbmRleCAtIGluZGV4IHx8IChoZWFkLmNoIC0gYW5jaG9yLmNoKSAqIChwYXJ0LmxldmVsID09IDEgPyAtMSA6IDEpO1xuICAgIGlmIChoZWFkSW5kZXggPT0gYm91bmRhcnkgLSAxIHx8IGhlYWRJbmRleCA9PSBib3VuZGFyeSlcbiAgICAgIHsgbGVmdFNpZGUgPSBkaXIgPCAwOyB9XG4gICAgZWxzZVxuICAgICAgeyBsZWZ0U2lkZSA9IGRpciA+IDA7IH1cbiAgfVxuXG4gIHZhciB1c2VQYXJ0ID0gb3JkZXJbYm91bmRhcnkgKyAobGVmdFNpZGUgPyAtMSA6IDApXTtcbiAgdmFyIGZyb20gPSBsZWZ0U2lkZSA9PSAodXNlUGFydC5sZXZlbCA9PSAxKTtcbiAgdmFyIGNoID0gZnJvbSA/IHVzZVBhcnQuZnJvbSA6IHVzZVBhcnQudG8sIHN0aWNreSA9IGZyb20gPyBcImFmdGVyXCIgOiBcImJlZm9yZVwiO1xuICByZXR1cm4gYW5jaG9yLmNoID09IGNoICYmIGFuY2hvci5zdGlja3kgPT0gc3RpY2t5ID8gcmFuZ2UkJDEgOiBuZXcgUmFuZ2UobmV3IFBvcyhhbmNob3IubGluZSwgY2gsIHN0aWNreSksIGhlYWQpXG59XG5cblxuLy8gRGV0ZXJtaW5lcyB3aGV0aGVyIGFuIGV2ZW50IGhhcHBlbmVkIGluIHRoZSBndXR0ZXIsIGFuZCBmaXJlcyB0aGVcbi8vIGhhbmRsZXJzIGZvciB0aGUgY29ycmVzcG9uZGluZyBldmVudC5cbmZ1bmN0aW9uIGd1dHRlckV2ZW50KGNtLCBlLCB0eXBlLCBwcmV2ZW50KSB7XG4gIHZhciBtWCwgbVk7XG4gIGlmIChlLnRvdWNoZXMpIHtcbiAgICBtWCA9IGUudG91Y2hlc1swXS5jbGllbnRYO1xuICAgIG1ZID0gZS50b3VjaGVzWzBdLmNsaWVudFk7XG4gIH0gZWxzZSB7XG4gICAgdHJ5IHsgbVggPSBlLmNsaWVudFg7IG1ZID0gZS5jbGllbnRZOyB9XG4gICAgY2F0Y2goZSkgeyByZXR1cm4gZmFsc2UgfVxuICB9XG4gIGlmIChtWCA+PSBNYXRoLmZsb29yKGNtLmRpc3BsYXkuZ3V0dGVycy5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKS5yaWdodCkpIHsgcmV0dXJuIGZhbHNlIH1cbiAgaWYgKHByZXZlbnQpIHsgZV9wcmV2ZW50RGVmYXVsdChlKTsgfVxuXG4gIHZhciBkaXNwbGF5ID0gY20uZGlzcGxheTtcbiAgdmFyIGxpbmVCb3ggPSBkaXNwbGF5LmxpbmVEaXYuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cbiAgaWYgKG1ZID4gbGluZUJveC5ib3R0b20gfHwgIWhhc0hhbmRsZXIoY20sIHR5cGUpKSB7IHJldHVybiBlX2RlZmF1bHRQcmV2ZW50ZWQoZSkgfVxuICBtWSAtPSBsaW5lQm94LnRvcCAtIGRpc3BsYXkudmlld09mZnNldDtcblxuICBmb3IgKHZhciBpID0gMDsgaSA8IGNtLm9wdGlvbnMuZ3V0dGVycy5sZW5ndGg7ICsraSkge1xuICAgIHZhciBnID0gZGlzcGxheS5ndXR0ZXJzLmNoaWxkTm9kZXNbaV07XG4gICAgaWYgKGcgJiYgZy5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKS5yaWdodCA+PSBtWCkge1xuICAgICAgdmFyIGxpbmUgPSBsaW5lQXRIZWlnaHQoY20uZG9jLCBtWSk7XG4gICAgICB2YXIgZ3V0dGVyID0gY20ub3B0aW9ucy5ndXR0ZXJzW2ldO1xuICAgICAgc2lnbmFsKGNtLCB0eXBlLCBjbSwgbGluZSwgZ3V0dGVyLCBlKTtcbiAgICAgIHJldHVybiBlX2RlZmF1bHRQcmV2ZW50ZWQoZSlcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gY2xpY2tJbkd1dHRlcihjbSwgZSkge1xuICByZXR1cm4gZ3V0dGVyRXZlbnQoY20sIGUsIFwiZ3V0dGVyQ2xpY2tcIiwgdHJ1ZSlcbn1cblxuLy8gQ09OVEVYVCBNRU5VIEhBTkRMSU5HXG5cbi8vIFRvIG1ha2UgdGhlIGNvbnRleHQgbWVudSB3b3JrLCB3ZSBuZWVkIHRvIGJyaWVmbHkgdW5oaWRlIHRoZVxuLy8gdGV4dGFyZWEgKG1ha2luZyBpdCBhcyB1bm9idHJ1c2l2ZSBhcyBwb3NzaWJsZSkgdG8gbGV0IHRoZVxuLy8gcmlnaHQtY2xpY2sgdGFrZSBlZmZlY3Qgb24gaXQuXG5mdW5jdGlvbiBvbkNvbnRleHRNZW51KGNtLCBlKSB7XG4gIGlmIChldmVudEluV2lkZ2V0KGNtLmRpc3BsYXksIGUpIHx8IGNvbnRleHRNZW51SW5HdXR0ZXIoY20sIGUpKSB7IHJldHVybiB9XG4gIGlmIChzaWduYWxET01FdmVudChjbSwgZSwgXCJjb250ZXh0bWVudVwiKSkgeyByZXR1cm4gfVxuICBjbS5kaXNwbGF5LmlucHV0Lm9uQ29udGV4dE1lbnUoZSk7XG59XG5cbmZ1bmN0aW9uIGNvbnRleHRNZW51SW5HdXR0ZXIoY20sIGUpIHtcbiAgaWYgKCFoYXNIYW5kbGVyKGNtLCBcImd1dHRlckNvbnRleHRNZW51XCIpKSB7IHJldHVybiBmYWxzZSB9XG4gIHJldHVybiBndXR0ZXJFdmVudChjbSwgZSwgXCJndXR0ZXJDb250ZXh0TWVudVwiLCBmYWxzZSlcbn1cblxuZnVuY3Rpb24gdGhlbWVDaGFuZ2VkKGNtKSB7XG4gIGNtLmRpc3BsYXkud3JhcHBlci5jbGFzc05hbWUgPSBjbS5kaXNwbGF5LndyYXBwZXIuY2xhc3NOYW1lLnJlcGxhY2UoL1xccypjbS1zLVxcUysvZywgXCJcIikgK1xuICAgIGNtLm9wdGlvbnMudGhlbWUucmVwbGFjZSgvKF58XFxzKVxccyovZywgXCIgY20tcy1cIik7XG4gIGNsZWFyQ2FjaGVzKGNtKTtcbn1cblxudmFyIEluaXQgPSB7dG9TdHJpbmc6IGZ1bmN0aW9uKCl7cmV0dXJuIFwiQ29kZU1pcnJvci5Jbml0XCJ9fTtcblxudmFyIGRlZmF1bHRzID0ge307XG52YXIgb3B0aW9uSGFuZGxlcnMgPSB7fTtcblxuZnVuY3Rpb24gZGVmaW5lT3B0aW9ucyhDb2RlTWlycm9yKSB7XG4gIHZhciBvcHRpb25IYW5kbGVycyA9IENvZGVNaXJyb3Iub3B0aW9uSGFuZGxlcnM7XG5cbiAgZnVuY3Rpb24gb3B0aW9uKG5hbWUsIGRlZmx0LCBoYW5kbGUsIG5vdE9uSW5pdCkge1xuICAgIENvZGVNaXJyb3IuZGVmYXVsdHNbbmFtZV0gPSBkZWZsdDtcbiAgICBpZiAoaGFuZGxlKSB7IG9wdGlvbkhhbmRsZXJzW25hbWVdID1cbiAgICAgIG5vdE9uSW5pdCA/IGZ1bmN0aW9uIChjbSwgdmFsLCBvbGQpIHtpZiAob2xkICE9IEluaXQpIHsgaGFuZGxlKGNtLCB2YWwsIG9sZCk7IH19IDogaGFuZGxlOyB9XG4gIH1cblxuICBDb2RlTWlycm9yLmRlZmluZU9wdGlvbiA9IG9wdGlvbjtcblxuICAvLyBQYXNzZWQgdG8gb3B0aW9uIGhhbmRsZXJzIHdoZW4gdGhlcmUgaXMgbm8gb2xkIHZhbHVlLlxuICBDb2RlTWlycm9yLkluaXQgPSBJbml0O1xuXG4gIC8vIFRoZXNlIHR3byBhcmUsIG9uIGluaXQsIGNhbGxlZCBmcm9tIHRoZSBjb25zdHJ1Y3RvciBiZWNhdXNlIHRoZXlcbiAgLy8gaGF2ZSB0byBiZSBpbml0aWFsaXplZCBiZWZvcmUgdGhlIGVkaXRvciBjYW4gc3RhcnQgYXQgYWxsLlxuICBvcHRpb24oXCJ2YWx1ZVwiLCBcIlwiLCBmdW5jdGlvbiAoY20sIHZhbCkgeyByZXR1cm4gY20uc2V0VmFsdWUodmFsKTsgfSwgdHJ1ZSk7XG4gIG9wdGlvbihcIm1vZGVcIiwgbnVsbCwgZnVuY3Rpb24gKGNtLCB2YWwpIHtcbiAgICBjbS5kb2MubW9kZU9wdGlvbiA9IHZhbDtcbiAgICBsb2FkTW9kZShjbSk7XG4gIH0sIHRydWUpO1xuXG4gIG9wdGlvbihcImluZGVudFVuaXRcIiwgMiwgbG9hZE1vZGUsIHRydWUpO1xuICBvcHRpb24oXCJpbmRlbnRXaXRoVGFic1wiLCBmYWxzZSk7XG4gIG9wdGlvbihcInNtYXJ0SW5kZW50XCIsIHRydWUpO1xuICBvcHRpb24oXCJ0YWJTaXplXCIsIDQsIGZ1bmN0aW9uIChjbSkge1xuICAgIHJlc2V0TW9kZVN0YXRlKGNtKTtcbiAgICBjbGVhckNhY2hlcyhjbSk7XG4gICAgcmVnQ2hhbmdlKGNtKTtcbiAgfSwgdHJ1ZSk7XG5cbiAgb3B0aW9uKFwibGluZVNlcGFyYXRvclwiLCBudWxsLCBmdW5jdGlvbiAoY20sIHZhbCkge1xuICAgIGNtLmRvYy5saW5lU2VwID0gdmFsO1xuICAgIGlmICghdmFsKSB7IHJldHVybiB9XG4gICAgdmFyIG5ld0JyZWFrcyA9IFtdLCBsaW5lTm8gPSBjbS5kb2MuZmlyc3Q7XG4gICAgY20uZG9jLml0ZXIoZnVuY3Rpb24gKGxpbmUpIHtcbiAgICAgIGZvciAodmFyIHBvcyA9IDA7Oykge1xuICAgICAgICB2YXIgZm91bmQgPSBsaW5lLnRleHQuaW5kZXhPZih2YWwsIHBvcyk7XG4gICAgICAgIGlmIChmb3VuZCA9PSAtMSkgeyBicmVhayB9XG4gICAgICAgIHBvcyA9IGZvdW5kICsgdmFsLmxlbmd0aDtcbiAgICAgICAgbmV3QnJlYWtzLnB1c2goUG9zKGxpbmVObywgZm91bmQpKTtcbiAgICAgIH1cbiAgICAgIGxpbmVObysrO1xuICAgIH0pO1xuICAgIGZvciAodmFyIGkgPSBuZXdCcmVha3MubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pXG4gICAgICB7IHJlcGxhY2VSYW5nZShjbS5kb2MsIHZhbCwgbmV3QnJlYWtzW2ldLCBQb3MobmV3QnJlYWtzW2ldLmxpbmUsIG5ld0JyZWFrc1tpXS5jaCArIHZhbC5sZW5ndGgpKTsgfVxuICB9KTtcbiAgb3B0aW9uKFwic3BlY2lhbENoYXJzXCIsIC9bXFx1MDAwMC1cXHUwMDFmXFx1MDA3Zi1cXHUwMDlmXFx1MDBhZFxcdTA2MWNcXHUyMDBiLVxcdTIwMGZcXHUyMDI4XFx1MjAyOVxcdWZlZmZdL2csIGZ1bmN0aW9uIChjbSwgdmFsLCBvbGQpIHtcbiAgICBjbS5zdGF0ZS5zcGVjaWFsQ2hhcnMgPSBuZXcgUmVnRXhwKHZhbC5zb3VyY2UgKyAodmFsLnRlc3QoXCJcXHRcIikgPyBcIlwiIDogXCJ8XFx0XCIpLCBcImdcIik7XG4gICAgaWYgKG9sZCAhPSBJbml0KSB7IGNtLnJlZnJlc2goKTsgfVxuICB9KTtcbiAgb3B0aW9uKFwic3BlY2lhbENoYXJQbGFjZWhvbGRlclwiLCBkZWZhdWx0U3BlY2lhbENoYXJQbGFjZWhvbGRlciwgZnVuY3Rpb24gKGNtKSB7IHJldHVybiBjbS5yZWZyZXNoKCk7IH0sIHRydWUpO1xuICBvcHRpb24oXCJlbGVjdHJpY0NoYXJzXCIsIHRydWUpO1xuICBvcHRpb24oXCJpbnB1dFN0eWxlXCIsIG1vYmlsZSA/IFwiY29udGVudGVkaXRhYmxlXCIgOiBcInRleHRhcmVhXCIsIGZ1bmN0aW9uICgpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJpbnB1dFN0eWxlIGNhbiBub3QgKHlldCkgYmUgY2hhbmdlZCBpbiBhIHJ1bm5pbmcgZWRpdG9yXCIpIC8vIEZJWE1FXG4gIH0sIHRydWUpO1xuICBvcHRpb24oXCJzcGVsbGNoZWNrXCIsIGZhbHNlLCBmdW5jdGlvbiAoY20sIHZhbCkgeyByZXR1cm4gY20uZ2V0SW5wdXRGaWVsZCgpLnNwZWxsY2hlY2sgPSB2YWw7IH0sIHRydWUpO1xuICBvcHRpb24oXCJydGxNb3ZlVmlzdWFsbHlcIiwgIXdpbmRvd3MpO1xuICBvcHRpb24oXCJ3aG9sZUxpbmVVcGRhdGVCZWZvcmVcIiwgdHJ1ZSk7XG5cbiAgb3B0aW9uKFwidGhlbWVcIiwgXCJkZWZhdWx0XCIsIGZ1bmN0aW9uIChjbSkge1xuICAgIHRoZW1lQ2hhbmdlZChjbSk7XG4gICAgZ3V0dGVyc0NoYW5nZWQoY20pO1xuICB9LCB0cnVlKTtcbiAgb3B0aW9uKFwia2V5TWFwXCIsIFwiZGVmYXVsdFwiLCBmdW5jdGlvbiAoY20sIHZhbCwgb2xkKSB7XG4gICAgdmFyIG5leHQgPSBnZXRLZXlNYXAodmFsKTtcbiAgICB2YXIgcHJldiA9IG9sZCAhPSBJbml0ICYmIGdldEtleU1hcChvbGQpO1xuICAgIGlmIChwcmV2ICYmIHByZXYuZGV0YWNoKSB7IHByZXYuZGV0YWNoKGNtLCBuZXh0KTsgfVxuICAgIGlmIChuZXh0LmF0dGFjaCkgeyBuZXh0LmF0dGFjaChjbSwgcHJldiB8fCBudWxsKTsgfVxuICB9KTtcbiAgb3B0aW9uKFwiZXh0cmFLZXlzXCIsIG51bGwpO1xuICBvcHRpb24oXCJjb25maWd1cmVNb3VzZVwiLCBudWxsKTtcblxuICBvcHRpb24oXCJsaW5lV3JhcHBpbmdcIiwgZmFsc2UsIHdyYXBwaW5nQ2hhbmdlZCwgdHJ1ZSk7XG4gIG9wdGlvbihcImd1dHRlcnNcIiwgW10sIGZ1bmN0aW9uIChjbSkge1xuICAgIHNldEd1dHRlcnNGb3JMaW5lTnVtYmVycyhjbS5vcHRpb25zKTtcbiAgICBndXR0ZXJzQ2hhbmdlZChjbSk7XG4gIH0sIHRydWUpO1xuICBvcHRpb24oXCJmaXhlZEd1dHRlclwiLCB0cnVlLCBmdW5jdGlvbiAoY20sIHZhbCkge1xuICAgIGNtLmRpc3BsYXkuZ3V0dGVycy5zdHlsZS5sZWZ0ID0gdmFsID8gY29tcGVuc2F0ZUZvckhTY3JvbGwoY20uZGlzcGxheSkgKyBcInB4XCIgOiBcIjBcIjtcbiAgICBjbS5yZWZyZXNoKCk7XG4gIH0sIHRydWUpO1xuICBvcHRpb24oXCJjb3Zlckd1dHRlck5leHRUb1Njcm9sbGJhclwiLCBmYWxzZSwgZnVuY3Rpb24gKGNtKSB7IHJldHVybiB1cGRhdGVTY3JvbGxiYXJzKGNtKTsgfSwgdHJ1ZSk7XG4gIG9wdGlvbihcInNjcm9sbGJhclN0eWxlXCIsIFwibmF0aXZlXCIsIGZ1bmN0aW9uIChjbSkge1xuICAgIGluaXRTY3JvbGxiYXJzKGNtKTtcbiAgICB1cGRhdGVTY3JvbGxiYXJzKGNtKTtcbiAgICBjbS5kaXNwbGF5LnNjcm9sbGJhcnMuc2V0U2Nyb2xsVG9wKGNtLmRvYy5zY3JvbGxUb3ApO1xuICAgIGNtLmRpc3BsYXkuc2Nyb2xsYmFycy5zZXRTY3JvbGxMZWZ0KGNtLmRvYy5zY3JvbGxMZWZ0KTtcbiAgfSwgdHJ1ZSk7XG4gIG9wdGlvbihcImxpbmVOdW1iZXJzXCIsIGZhbHNlLCBmdW5jdGlvbiAoY20pIHtcbiAgICBzZXRHdXR0ZXJzRm9yTGluZU51bWJlcnMoY20ub3B0aW9ucyk7XG4gICAgZ3V0dGVyc0NoYW5nZWQoY20pO1xuICB9LCB0cnVlKTtcbiAgb3B0aW9uKFwiZmlyc3RMaW5lTnVtYmVyXCIsIDEsIGd1dHRlcnNDaGFuZ2VkLCB0cnVlKTtcbiAgb3B0aW9uKFwibGluZU51bWJlckZvcm1hdHRlclwiLCBmdW5jdGlvbiAoaW50ZWdlcikgeyByZXR1cm4gaW50ZWdlcjsgfSwgZ3V0dGVyc0NoYW5nZWQsIHRydWUpO1xuICBvcHRpb24oXCJzaG93Q3Vyc29yV2hlblNlbGVjdGluZ1wiLCBmYWxzZSwgdXBkYXRlU2VsZWN0aW9uLCB0cnVlKTtcblxuICBvcHRpb24oXCJyZXNldFNlbGVjdGlvbk9uQ29udGV4dE1lbnVcIiwgdHJ1ZSk7XG4gIG9wdGlvbihcImxpbmVXaXNlQ29weUN1dFwiLCB0cnVlKTtcbiAgb3B0aW9uKFwicGFzdGVMaW5lc1BlclNlbGVjdGlvblwiLCB0cnVlKTtcblxuICBvcHRpb24oXCJyZWFkT25seVwiLCBmYWxzZSwgZnVuY3Rpb24gKGNtLCB2YWwpIHtcbiAgICBpZiAodmFsID09IFwibm9jdXJzb3JcIikge1xuICAgICAgb25CbHVyKGNtKTtcbiAgICAgIGNtLmRpc3BsYXkuaW5wdXQuYmx1cigpO1xuICAgIH1cbiAgICBjbS5kaXNwbGF5LmlucHV0LnJlYWRPbmx5Q2hhbmdlZCh2YWwpO1xuICB9KTtcbiAgb3B0aW9uKFwiZGlzYWJsZUlucHV0XCIsIGZhbHNlLCBmdW5jdGlvbiAoY20sIHZhbCkge2lmICghdmFsKSB7IGNtLmRpc3BsYXkuaW5wdXQucmVzZXQoKTsgfX0sIHRydWUpO1xuICBvcHRpb24oXCJkcmFnRHJvcFwiLCB0cnVlLCBkcmFnRHJvcENoYW5nZWQpO1xuICBvcHRpb24oXCJhbGxvd0Ryb3BGaWxlVHlwZXNcIiwgbnVsbCk7XG5cbiAgb3B0aW9uKFwiY3Vyc29yQmxpbmtSYXRlXCIsIDUzMCk7XG4gIG9wdGlvbihcImN1cnNvclNjcm9sbE1hcmdpblwiLCAwKTtcbiAgb3B0aW9uKFwiY3Vyc29ySGVpZ2h0XCIsIDEsIHVwZGF0ZVNlbGVjdGlvbiwgdHJ1ZSk7XG4gIG9wdGlvbihcInNpbmdsZUN1cnNvckhlaWdodFBlckxpbmVcIiwgdHJ1ZSwgdXBkYXRlU2VsZWN0aW9uLCB0cnVlKTtcbiAgb3B0aW9uKFwid29ya1RpbWVcIiwgMTAwKTtcbiAgb3B0aW9uKFwid29ya0RlbGF5XCIsIDEwMCk7XG4gIG9wdGlvbihcImZsYXR0ZW5TcGFuc1wiLCB0cnVlLCByZXNldE1vZGVTdGF0ZSwgdHJ1ZSk7XG4gIG9wdGlvbihcImFkZE1vZGVDbGFzc1wiLCBmYWxzZSwgcmVzZXRNb2RlU3RhdGUsIHRydWUpO1xuICBvcHRpb24oXCJwb2xsSW50ZXJ2YWxcIiwgMTAwKTtcbiAgb3B0aW9uKFwidW5kb0RlcHRoXCIsIDIwMCwgZnVuY3Rpb24gKGNtLCB2YWwpIHsgcmV0dXJuIGNtLmRvYy5oaXN0b3J5LnVuZG9EZXB0aCA9IHZhbDsgfSk7XG4gIG9wdGlvbihcImhpc3RvcnlFdmVudERlbGF5XCIsIDEyNTApO1xuICBvcHRpb24oXCJ2aWV3cG9ydE1hcmdpblwiLCAxMCwgZnVuY3Rpb24gKGNtKSB7IHJldHVybiBjbS5yZWZyZXNoKCk7IH0sIHRydWUpO1xuICBvcHRpb24oXCJtYXhIaWdobGlnaHRMZW5ndGhcIiwgMTAwMDAsIHJlc2V0TW9kZVN0YXRlLCB0cnVlKTtcbiAgb3B0aW9uKFwibW92ZUlucHV0V2l0aEN1cnNvclwiLCB0cnVlLCBmdW5jdGlvbiAoY20sIHZhbCkge1xuICAgIGlmICghdmFsKSB7IGNtLmRpc3BsYXkuaW5wdXQucmVzZXRQb3NpdGlvbigpOyB9XG4gIH0pO1xuXG4gIG9wdGlvbihcInRhYmluZGV4XCIsIG51bGwsIGZ1bmN0aW9uIChjbSwgdmFsKSB7IHJldHVybiBjbS5kaXNwbGF5LmlucHV0LmdldEZpZWxkKCkudGFiSW5kZXggPSB2YWwgfHwgXCJcIjsgfSk7XG4gIG9wdGlvbihcImF1dG9mb2N1c1wiLCBudWxsKTtcbiAgb3B0aW9uKFwiZGlyZWN0aW9uXCIsIFwibHRyXCIsIGZ1bmN0aW9uIChjbSwgdmFsKSB7IHJldHVybiBjbS5kb2Muc2V0RGlyZWN0aW9uKHZhbCk7IH0sIHRydWUpO1xufVxuXG5mdW5jdGlvbiBndXR0ZXJzQ2hhbmdlZChjbSkge1xuICB1cGRhdGVHdXR0ZXJzKGNtKTtcbiAgcmVnQ2hhbmdlKGNtKTtcbiAgYWxpZ25Ib3Jpem9udGFsbHkoY20pO1xufVxuXG5mdW5jdGlvbiBkcmFnRHJvcENoYW5nZWQoY20sIHZhbHVlLCBvbGQpIHtcbiAgdmFyIHdhc09uID0gb2xkICYmIG9sZCAhPSBJbml0O1xuICBpZiAoIXZhbHVlICE9ICF3YXNPbikge1xuICAgIHZhciBmdW5jcyA9IGNtLmRpc3BsYXkuZHJhZ0Z1bmN0aW9ucztcbiAgICB2YXIgdG9nZ2xlID0gdmFsdWUgPyBvbiA6IG9mZjtcbiAgICB0b2dnbGUoY20uZGlzcGxheS5zY3JvbGxlciwgXCJkcmFnc3RhcnRcIiwgZnVuY3Muc3RhcnQpO1xuICAgIHRvZ2dsZShjbS5kaXNwbGF5LnNjcm9sbGVyLCBcImRyYWdlbnRlclwiLCBmdW5jcy5lbnRlcik7XG4gICAgdG9nZ2xlKGNtLmRpc3BsYXkuc2Nyb2xsZXIsIFwiZHJhZ292ZXJcIiwgZnVuY3Mub3Zlcik7XG4gICAgdG9nZ2xlKGNtLmRpc3BsYXkuc2Nyb2xsZXIsIFwiZHJhZ2xlYXZlXCIsIGZ1bmNzLmxlYXZlKTtcbiAgICB0b2dnbGUoY20uZGlzcGxheS5zY3JvbGxlciwgXCJkcm9wXCIsIGZ1bmNzLmRyb3ApO1xuICB9XG59XG5cbmZ1bmN0aW9uIHdyYXBwaW5nQ2hhbmdlZChjbSkge1xuICBpZiAoY20ub3B0aW9ucy5saW5lV3JhcHBpbmcpIHtcbiAgICBhZGRDbGFzcyhjbS5kaXNwbGF5LndyYXBwZXIsIFwiQ29kZU1pcnJvci13cmFwXCIpO1xuICAgIGNtLmRpc3BsYXkuc2l6ZXIuc3R5bGUubWluV2lkdGggPSBcIlwiO1xuICAgIGNtLmRpc3BsYXkuc2l6ZXJXaWR0aCA9IG51bGw7XG4gIH0gZWxzZSB7XG4gICAgcm1DbGFzcyhjbS5kaXNwbGF5LndyYXBwZXIsIFwiQ29kZU1pcnJvci13cmFwXCIpO1xuICAgIGZpbmRNYXhMaW5lKGNtKTtcbiAgfVxuICBlc3RpbWF0ZUxpbmVIZWlnaHRzKGNtKTtcbiAgcmVnQ2hhbmdlKGNtKTtcbiAgY2xlYXJDYWNoZXMoY20pO1xuICBzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHsgcmV0dXJuIHVwZGF0ZVNjcm9sbGJhcnMoY20pOyB9LCAxMDApO1xufVxuXG4vLyBBIENvZGVNaXJyb3IgaW5zdGFuY2UgcmVwcmVzZW50cyBhbiBlZGl0b3IuIFRoaXMgaXMgdGhlIG9iamVjdFxuLy8gdGhhdCB1c2VyIGNvZGUgaXMgdXN1YWxseSBkZWFsaW5nIHdpdGguXG5cbmZ1bmN0aW9uIENvZGVNaXJyb3IkMShwbGFjZSwgb3B0aW9ucykge1xuICB2YXIgdGhpcyQxID0gdGhpcztcblxuICBpZiAoISh0aGlzIGluc3RhbmNlb2YgQ29kZU1pcnJvciQxKSkgeyByZXR1cm4gbmV3IENvZGVNaXJyb3IkMShwbGFjZSwgb3B0aW9ucykgfVxuXG4gIHRoaXMub3B0aW9ucyA9IG9wdGlvbnMgPSBvcHRpb25zID8gY29weU9iaihvcHRpb25zKSA6IHt9O1xuICAvLyBEZXRlcm1pbmUgZWZmZWN0aXZlIG9wdGlvbnMgYmFzZWQgb24gZ2l2ZW4gdmFsdWVzIGFuZCBkZWZhdWx0cy5cbiAgY29weU9iaihkZWZhdWx0cywgb3B0aW9ucywgZmFsc2UpO1xuICBzZXRHdXR0ZXJzRm9yTGluZU51bWJlcnMob3B0aW9ucyk7XG5cbiAgdmFyIGRvYyA9IG9wdGlvbnMudmFsdWU7XG4gIGlmICh0eXBlb2YgZG9jID09IFwic3RyaW5nXCIpIHsgZG9jID0gbmV3IERvYyhkb2MsIG9wdGlvbnMubW9kZSwgbnVsbCwgb3B0aW9ucy5saW5lU2VwYXJhdG9yLCBvcHRpb25zLmRpcmVjdGlvbik7IH1cbiAgdGhpcy5kb2MgPSBkb2M7XG5cbiAgdmFyIGlucHV0ID0gbmV3IENvZGVNaXJyb3IkMS5pbnB1dFN0eWxlc1tvcHRpb25zLmlucHV0U3R5bGVdKHRoaXMpO1xuICB2YXIgZGlzcGxheSA9IHRoaXMuZGlzcGxheSA9IG5ldyBEaXNwbGF5KHBsYWNlLCBkb2MsIGlucHV0KTtcbiAgZGlzcGxheS53cmFwcGVyLkNvZGVNaXJyb3IgPSB0aGlzO1xuICB1cGRhdGVHdXR0ZXJzKHRoaXMpO1xuICB0aGVtZUNoYW5nZWQodGhpcyk7XG4gIGlmIChvcHRpb25zLmxpbmVXcmFwcGluZylcbiAgICB7IHRoaXMuZGlzcGxheS53cmFwcGVyLmNsYXNzTmFtZSArPSBcIiBDb2RlTWlycm9yLXdyYXBcIjsgfVxuICBpbml0U2Nyb2xsYmFycyh0aGlzKTtcblxuICB0aGlzLnN0YXRlID0ge1xuICAgIGtleU1hcHM6IFtdLCAgLy8gc3RvcmVzIG1hcHMgYWRkZWQgYnkgYWRkS2V5TWFwXG4gICAgb3ZlcmxheXM6IFtdLCAvLyBoaWdobGlnaHRpbmcgb3ZlcmxheXMsIGFzIGFkZGVkIGJ5IGFkZE92ZXJsYXlcbiAgICBtb2RlR2VuOiAwLCAgIC8vIGJ1bXBlZCB3aGVuIG1vZGUvb3ZlcmxheSBjaGFuZ2VzLCB1c2VkIHRvIGludmFsaWRhdGUgaGlnaGxpZ2h0aW5nIGluZm9cbiAgICBvdmVyd3JpdGU6IGZhbHNlLFxuICAgIGRlbGF5aW5nQmx1ckV2ZW50OiBmYWxzZSxcbiAgICBmb2N1c2VkOiBmYWxzZSxcbiAgICBzdXBwcmVzc0VkaXRzOiBmYWxzZSwgLy8gdXNlZCB0byBkaXNhYmxlIGVkaXRpbmcgZHVyaW5nIGtleSBoYW5kbGVycyB3aGVuIGluIHJlYWRPbmx5IG1vZGVcbiAgICBwYXN0ZUluY29taW5nOiBmYWxzZSwgY3V0SW5jb21pbmc6IGZhbHNlLCAvLyBoZWxwIHJlY29nbml6ZSBwYXN0ZS9jdXQgZWRpdHMgaW4gaW5wdXQucG9sbFxuICAgIHNlbGVjdGluZ1RleHQ6IGZhbHNlLFxuICAgIGRyYWdnaW5nVGV4dDogZmFsc2UsXG4gICAgaGlnaGxpZ2h0OiBuZXcgRGVsYXllZCgpLCAvLyBzdG9yZXMgaGlnaGxpZ2h0IHdvcmtlciB0aW1lb3V0XG4gICAga2V5U2VxOiBudWxsLCAgLy8gVW5maW5pc2hlZCBrZXkgc2VxdWVuY2VcbiAgICBzcGVjaWFsQ2hhcnM6IG51bGxcbiAgfTtcblxuICBpZiAob3B0aW9ucy5hdXRvZm9jdXMgJiYgIW1vYmlsZSkgeyBkaXNwbGF5LmlucHV0LmZvY3VzKCk7IH1cblxuICAvLyBPdmVycmlkZSBtYWdpYyB0ZXh0YXJlYSBjb250ZW50IHJlc3RvcmUgdGhhdCBJRSBzb21ldGltZXMgZG9lc1xuICAvLyBvbiBvdXIgaGlkZGVuIHRleHRhcmVhIG9uIHJlbG9hZFxuICBpZiAoaWUgJiYgaWVfdmVyc2lvbiA8IDExKSB7IHNldFRpbWVvdXQoZnVuY3Rpb24gKCkgeyByZXR1cm4gdGhpcyQxLmRpc3BsYXkuaW5wdXQucmVzZXQodHJ1ZSk7IH0sIDIwKTsgfVxuXG4gIHJlZ2lzdGVyRXZlbnRIYW5kbGVycyh0aGlzKTtcbiAgZW5zdXJlR2xvYmFsSGFuZGxlcnMoKTtcblxuICBzdGFydE9wZXJhdGlvbih0aGlzKTtcbiAgdGhpcy5jdXJPcC5mb3JjZVVwZGF0ZSA9IHRydWU7XG4gIGF0dGFjaERvYyh0aGlzLCBkb2MpO1xuXG4gIGlmICgob3B0aW9ucy5hdXRvZm9jdXMgJiYgIW1vYmlsZSkgfHwgdGhpcy5oYXNGb2N1cygpKVxuICAgIHsgc2V0VGltZW91dChiaW5kKG9uRm9jdXMsIHRoaXMpLCAyMCk7IH1cbiAgZWxzZVxuICAgIHsgb25CbHVyKHRoaXMpOyB9XG5cbiAgZm9yICh2YXIgb3B0IGluIG9wdGlvbkhhbmRsZXJzKSB7IGlmIChvcHRpb25IYW5kbGVycy5oYXNPd25Qcm9wZXJ0eShvcHQpKVxuICAgIHsgb3B0aW9uSGFuZGxlcnNbb3B0XSh0aGlzJDEsIG9wdGlvbnNbb3B0XSwgSW5pdCk7IH0gfVxuICBtYXliZVVwZGF0ZUxpbmVOdW1iZXJXaWR0aCh0aGlzKTtcbiAgaWYgKG9wdGlvbnMuZmluaXNoSW5pdCkgeyBvcHRpb25zLmZpbmlzaEluaXQodGhpcyk7IH1cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBpbml0SG9va3MubGVuZ3RoOyArK2kpIHsgaW5pdEhvb2tzW2ldKHRoaXMkMSk7IH1cbiAgZW5kT3BlcmF0aW9uKHRoaXMpO1xuICAvLyBTdXBwcmVzcyBvcHRpbWl6ZWxlZ2liaWxpdHkgaW4gV2Via2l0LCBzaW5jZSBpdCBicmVha3MgdGV4dFxuICAvLyBtZWFzdXJpbmcgb24gbGluZSB3cmFwcGluZyBib3VuZGFyaWVzLlxuICBpZiAod2Via2l0ICYmIG9wdGlvbnMubGluZVdyYXBwaW5nICYmXG4gICAgICBnZXRDb21wdXRlZFN0eWxlKGRpc3BsYXkubGluZURpdikudGV4dFJlbmRlcmluZyA9PSBcIm9wdGltaXplbGVnaWJpbGl0eVwiKVxuICAgIHsgZGlzcGxheS5saW5lRGl2LnN0eWxlLnRleHRSZW5kZXJpbmcgPSBcImF1dG9cIjsgfVxufVxuXG4vLyBUaGUgZGVmYXVsdCBjb25maWd1cmF0aW9uIG9wdGlvbnMuXG5Db2RlTWlycm9yJDEuZGVmYXVsdHMgPSBkZWZhdWx0cztcbi8vIEZ1bmN0aW9ucyB0byBydW4gd2hlbiBvcHRpb25zIGFyZSBjaGFuZ2VkLlxuQ29kZU1pcnJvciQxLm9wdGlvbkhhbmRsZXJzID0gb3B0aW9uSGFuZGxlcnM7XG5cbi8vIEF0dGFjaCB0aGUgbmVjZXNzYXJ5IGV2ZW50IGhhbmRsZXJzIHdoZW4gaW5pdGlhbGl6aW5nIHRoZSBlZGl0b3JcbmZ1bmN0aW9uIHJlZ2lzdGVyRXZlbnRIYW5kbGVycyhjbSkge1xuICB2YXIgZCA9IGNtLmRpc3BsYXk7XG4gIG9uKGQuc2Nyb2xsZXIsIFwibW91c2Vkb3duXCIsIG9wZXJhdGlvbihjbSwgb25Nb3VzZURvd24pKTtcbiAgLy8gT2xkZXIgSUUncyB3aWxsIG5vdCBmaXJlIGEgc2Vjb25kIG1vdXNlZG93biBmb3IgYSBkb3VibGUgY2xpY2tcbiAgaWYgKGllICYmIGllX3ZlcnNpb24gPCAxMSlcbiAgICB7IG9uKGQuc2Nyb2xsZXIsIFwiZGJsY2xpY2tcIiwgb3BlcmF0aW9uKGNtLCBmdW5jdGlvbiAoZSkge1xuICAgICAgaWYgKHNpZ25hbERPTUV2ZW50KGNtLCBlKSkgeyByZXR1cm4gfVxuICAgICAgdmFyIHBvcyA9IHBvc0Zyb21Nb3VzZShjbSwgZSk7XG4gICAgICBpZiAoIXBvcyB8fCBjbGlja0luR3V0dGVyKGNtLCBlKSB8fCBldmVudEluV2lkZ2V0KGNtLmRpc3BsYXksIGUpKSB7IHJldHVybiB9XG4gICAgICBlX3ByZXZlbnREZWZhdWx0KGUpO1xuICAgICAgdmFyIHdvcmQgPSBjbS5maW5kV29yZEF0KHBvcyk7XG4gICAgICBleHRlbmRTZWxlY3Rpb24oY20uZG9jLCB3b3JkLmFuY2hvciwgd29yZC5oZWFkKTtcbiAgICB9KSk7IH1cbiAgZWxzZVxuICAgIHsgb24oZC5zY3JvbGxlciwgXCJkYmxjbGlja1wiLCBmdW5jdGlvbiAoZSkgeyByZXR1cm4gc2lnbmFsRE9NRXZlbnQoY20sIGUpIHx8IGVfcHJldmVudERlZmF1bHQoZSk7IH0pOyB9XG4gIC8vIFNvbWUgYnJvd3NlcnMgZmlyZSBjb250ZXh0bWVudSAqYWZ0ZXIqIG9wZW5pbmcgdGhlIG1lbnUsIGF0XG4gIC8vIHdoaWNoIHBvaW50IHdlIGNhbid0IG1lc3Mgd2l0aCBpdCBhbnltb3JlLiBDb250ZXh0IG1lbnUgaXNcbiAgLy8gaGFuZGxlZCBpbiBvbk1vdXNlRG93biBmb3IgdGhlc2UgYnJvd3NlcnMuXG4gIGlmICghY2FwdHVyZVJpZ2h0Q2xpY2spIHsgb24oZC5zY3JvbGxlciwgXCJjb250ZXh0bWVudVwiLCBmdW5jdGlvbiAoZSkgeyByZXR1cm4gb25Db250ZXh0TWVudShjbSwgZSk7IH0pOyB9XG5cbiAgLy8gVXNlZCB0byBzdXBwcmVzcyBtb3VzZSBldmVudCBoYW5kbGluZyB3aGVuIGEgdG91Y2ggaGFwcGVuc1xuICB2YXIgdG91Y2hGaW5pc2hlZCwgcHJldlRvdWNoID0ge2VuZDogMH07XG4gIGZ1bmN0aW9uIGZpbmlzaFRvdWNoKCkge1xuICAgIGlmIChkLmFjdGl2ZVRvdWNoKSB7XG4gICAgICB0b3VjaEZpbmlzaGVkID0gc2V0VGltZW91dChmdW5jdGlvbiAoKSB7IHJldHVybiBkLmFjdGl2ZVRvdWNoID0gbnVsbDsgfSwgMTAwMCk7XG4gICAgICBwcmV2VG91Y2ggPSBkLmFjdGl2ZVRvdWNoO1xuICAgICAgcHJldlRvdWNoLmVuZCA9ICtuZXcgRGF0ZTtcbiAgICB9XG4gIH1cbiAgZnVuY3Rpb24gaXNNb3VzZUxpa2VUb3VjaEV2ZW50KGUpIHtcbiAgICBpZiAoZS50b3VjaGVzLmxlbmd0aCAhPSAxKSB7IHJldHVybiBmYWxzZSB9XG4gICAgdmFyIHRvdWNoID0gZS50b3VjaGVzWzBdO1xuICAgIHJldHVybiB0b3VjaC5yYWRpdXNYIDw9IDEgJiYgdG91Y2gucmFkaXVzWSA8PSAxXG4gIH1cbiAgZnVuY3Rpb24gZmFyQXdheSh0b3VjaCwgb3RoZXIpIHtcbiAgICBpZiAob3RoZXIubGVmdCA9PSBudWxsKSB7IHJldHVybiB0cnVlIH1cbiAgICB2YXIgZHggPSBvdGhlci5sZWZ0IC0gdG91Y2gubGVmdCwgZHkgPSBvdGhlci50b3AgLSB0b3VjaC50b3A7XG4gICAgcmV0dXJuIGR4ICogZHggKyBkeSAqIGR5ID4gMjAgKiAyMFxuICB9XG4gIG9uKGQuc2Nyb2xsZXIsIFwidG91Y2hzdGFydFwiLCBmdW5jdGlvbiAoZSkge1xuICAgIGlmICghc2lnbmFsRE9NRXZlbnQoY20sIGUpICYmICFpc01vdXNlTGlrZVRvdWNoRXZlbnQoZSkgJiYgIWNsaWNrSW5HdXR0ZXIoY20sIGUpKSB7XG4gICAgICBkLmlucHV0LmVuc3VyZVBvbGxlZCgpO1xuICAgICAgY2xlYXJUaW1lb3V0KHRvdWNoRmluaXNoZWQpO1xuICAgICAgdmFyIG5vdyA9ICtuZXcgRGF0ZTtcbiAgICAgIGQuYWN0aXZlVG91Y2ggPSB7c3RhcnQ6IG5vdywgbW92ZWQ6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICAgICBwcmV2OiBub3cgLSBwcmV2VG91Y2guZW5kIDw9IDMwMCA/IHByZXZUb3VjaCA6IG51bGx9O1xuICAgICAgaWYgKGUudG91Y2hlcy5sZW5ndGggPT0gMSkge1xuICAgICAgICBkLmFjdGl2ZVRvdWNoLmxlZnQgPSBlLnRvdWNoZXNbMF0ucGFnZVg7XG4gICAgICAgIGQuYWN0aXZlVG91Y2gudG9wID0gZS50b3VjaGVzWzBdLnBhZ2VZO1xuICAgICAgfVxuICAgIH1cbiAgfSk7XG4gIG9uKGQuc2Nyb2xsZXIsIFwidG91Y2htb3ZlXCIsIGZ1bmN0aW9uICgpIHtcbiAgICBpZiAoZC5hY3RpdmVUb3VjaCkgeyBkLmFjdGl2ZVRvdWNoLm1vdmVkID0gdHJ1ZTsgfVxuICB9KTtcbiAgb24oZC5zY3JvbGxlciwgXCJ0b3VjaGVuZFwiLCBmdW5jdGlvbiAoZSkge1xuICAgIHZhciB0b3VjaCA9IGQuYWN0aXZlVG91Y2g7XG4gICAgaWYgKHRvdWNoICYmICFldmVudEluV2lkZ2V0KGQsIGUpICYmIHRvdWNoLmxlZnQgIT0gbnVsbCAmJlxuICAgICAgICAhdG91Y2gubW92ZWQgJiYgbmV3IERhdGUgLSB0b3VjaC5zdGFydCA8IDMwMCkge1xuICAgICAgdmFyIHBvcyA9IGNtLmNvb3Jkc0NoYXIoZC5hY3RpdmVUb3VjaCwgXCJwYWdlXCIpLCByYW5nZTtcbiAgICAgIGlmICghdG91Y2gucHJldiB8fCBmYXJBd2F5KHRvdWNoLCB0b3VjaC5wcmV2KSkgLy8gU2luZ2xlIHRhcFxuICAgICAgICB7IHJhbmdlID0gbmV3IFJhbmdlKHBvcywgcG9zKTsgfVxuICAgICAgZWxzZSBpZiAoIXRvdWNoLnByZXYucHJldiB8fCBmYXJBd2F5KHRvdWNoLCB0b3VjaC5wcmV2LnByZXYpKSAvLyBEb3VibGUgdGFwXG4gICAgICAgIHsgcmFuZ2UgPSBjbS5maW5kV29yZEF0KHBvcyk7IH1cbiAgICAgIGVsc2UgLy8gVHJpcGxlIHRhcFxuICAgICAgICB7IHJhbmdlID0gbmV3IFJhbmdlKFBvcyhwb3MubGluZSwgMCksIGNsaXBQb3MoY20uZG9jLCBQb3MocG9zLmxpbmUgKyAxLCAwKSkpOyB9XG4gICAgICBjbS5zZXRTZWxlY3Rpb24ocmFuZ2UuYW5jaG9yLCByYW5nZS5oZWFkKTtcbiAgICAgIGNtLmZvY3VzKCk7XG4gICAgICBlX3ByZXZlbnREZWZhdWx0KGUpO1xuICAgIH1cbiAgICBmaW5pc2hUb3VjaCgpO1xuICB9KTtcbiAgb24oZC5zY3JvbGxlciwgXCJ0b3VjaGNhbmNlbFwiLCBmaW5pc2hUb3VjaCk7XG5cbiAgLy8gU3luYyBzY3JvbGxpbmcgYmV0d2VlbiBmYWtlIHNjcm9sbGJhcnMgYW5kIHJlYWwgc2Nyb2xsYWJsZVxuICAvLyBhcmVhLCBlbnN1cmUgdmlld3BvcnQgaXMgdXBkYXRlZCB3aGVuIHNjcm9sbGluZy5cbiAgb24oZC5zY3JvbGxlciwgXCJzY3JvbGxcIiwgZnVuY3Rpb24gKCkge1xuICAgIGlmIChkLnNjcm9sbGVyLmNsaWVudEhlaWdodCkge1xuICAgICAgdXBkYXRlU2Nyb2xsVG9wKGNtLCBkLnNjcm9sbGVyLnNjcm9sbFRvcCk7XG4gICAgICBzZXRTY3JvbGxMZWZ0KGNtLCBkLnNjcm9sbGVyLnNjcm9sbExlZnQsIHRydWUpO1xuICAgICAgc2lnbmFsKGNtLCBcInNjcm9sbFwiLCBjbSk7XG4gICAgfVxuICB9KTtcblxuICAvLyBMaXN0ZW4gdG8gd2hlZWwgZXZlbnRzIGluIG9yZGVyIHRvIHRyeSBhbmQgdXBkYXRlIHRoZSB2aWV3cG9ydCBvbiB0aW1lLlxuICBvbihkLnNjcm9sbGVyLCBcIm1vdXNld2hlZWxcIiwgZnVuY3Rpb24gKGUpIHsgcmV0dXJuIG9uU2Nyb2xsV2hlZWwoY20sIGUpOyB9KTtcbiAgb24oZC5zY3JvbGxlciwgXCJET01Nb3VzZVNjcm9sbFwiLCBmdW5jdGlvbiAoZSkgeyByZXR1cm4gb25TY3JvbGxXaGVlbChjbSwgZSk7IH0pO1xuXG4gIC8vIFByZXZlbnQgd3JhcHBlciBmcm9tIGV2ZXIgc2Nyb2xsaW5nXG4gIG9uKGQud3JhcHBlciwgXCJzY3JvbGxcIiwgZnVuY3Rpb24gKCkgeyByZXR1cm4gZC53cmFwcGVyLnNjcm9sbFRvcCA9IGQud3JhcHBlci5zY3JvbGxMZWZ0ID0gMDsgfSk7XG5cbiAgZC5kcmFnRnVuY3Rpb25zID0ge1xuICAgIGVudGVyOiBmdW5jdGlvbiAoZSkge2lmICghc2lnbmFsRE9NRXZlbnQoY20sIGUpKSB7IGVfc3RvcChlKTsgfX0sXG4gICAgb3ZlcjogZnVuY3Rpb24gKGUpIHtpZiAoIXNpZ25hbERPTUV2ZW50KGNtLCBlKSkgeyBvbkRyYWdPdmVyKGNtLCBlKTsgZV9zdG9wKGUpOyB9fSxcbiAgICBzdGFydDogZnVuY3Rpb24gKGUpIHsgcmV0dXJuIG9uRHJhZ1N0YXJ0KGNtLCBlKTsgfSxcbiAgICBkcm9wOiBvcGVyYXRpb24oY20sIG9uRHJvcCksXG4gICAgbGVhdmU6IGZ1bmN0aW9uIChlKSB7aWYgKCFzaWduYWxET01FdmVudChjbSwgZSkpIHsgY2xlYXJEcmFnQ3Vyc29yKGNtKTsgfX1cbiAgfTtcblxuICB2YXIgaW5wID0gZC5pbnB1dC5nZXRGaWVsZCgpO1xuICBvbihpbnAsIFwia2V5dXBcIiwgZnVuY3Rpb24gKGUpIHsgcmV0dXJuIG9uS2V5VXAuY2FsbChjbSwgZSk7IH0pO1xuICBvbihpbnAsIFwia2V5ZG93blwiLCBvcGVyYXRpb24oY20sIG9uS2V5RG93bikpO1xuICBvbihpbnAsIFwia2V5cHJlc3NcIiwgb3BlcmF0aW9uKGNtLCBvbktleVByZXNzKSk7XG4gIG9uKGlucCwgXCJmb2N1c1wiLCBmdW5jdGlvbiAoZSkgeyByZXR1cm4gb25Gb2N1cyhjbSwgZSk7IH0pO1xuICBvbihpbnAsIFwiYmx1clwiLCBmdW5jdGlvbiAoZSkgeyByZXR1cm4gb25CbHVyKGNtLCBlKTsgfSk7XG59XG5cbnZhciBpbml0SG9va3MgPSBbXTtcbkNvZGVNaXJyb3IkMS5kZWZpbmVJbml0SG9vayA9IGZ1bmN0aW9uIChmKSB7IHJldHVybiBpbml0SG9va3MucHVzaChmKTsgfTtcblxuLy8gSW5kZW50IHRoZSBnaXZlbiBsaW5lLiBUaGUgaG93IHBhcmFtZXRlciBjYW4gYmUgXCJzbWFydFwiLFxuLy8gXCJhZGRcIi9udWxsLCBcInN1YnRyYWN0XCIsIG9yIFwicHJldlwiLiBXaGVuIGFnZ3Jlc3NpdmUgaXMgZmFsc2Vcbi8vICh0eXBpY2FsbHkgc2V0IHRvIHRydWUgZm9yIGZvcmNlZCBzaW5nbGUtbGluZSBpbmRlbnRzKSwgZW1wdHlcbi8vIGxpbmVzIGFyZSBub3QgaW5kZW50ZWQsIGFuZCBwbGFjZXMgd2hlcmUgdGhlIG1vZGUgcmV0dXJucyBQYXNzXG4vLyBhcmUgbGVmdCBhbG9uZS5cbmZ1bmN0aW9uIGluZGVudExpbmUoY20sIG4sIGhvdywgYWdncmVzc2l2ZSkge1xuICB2YXIgZG9jID0gY20uZG9jLCBzdGF0ZTtcbiAgaWYgKGhvdyA9PSBudWxsKSB7IGhvdyA9IFwiYWRkXCI7IH1cbiAgaWYgKGhvdyA9PSBcInNtYXJ0XCIpIHtcbiAgICAvLyBGYWxsIGJhY2sgdG8gXCJwcmV2XCIgd2hlbiB0aGUgbW9kZSBkb2Vzbid0IGhhdmUgYW4gaW5kZW50YXRpb25cbiAgICAvLyBtZXRob2QuXG4gICAgaWYgKCFkb2MubW9kZS5pbmRlbnQpIHsgaG93ID0gXCJwcmV2XCI7IH1cbiAgICBlbHNlIHsgc3RhdGUgPSBnZXRDb250ZXh0QmVmb3JlKGNtLCBuKS5zdGF0ZTsgfVxuICB9XG5cbiAgdmFyIHRhYlNpemUgPSBjbS5vcHRpb25zLnRhYlNpemU7XG4gIHZhciBsaW5lID0gZ2V0TGluZShkb2MsIG4pLCBjdXJTcGFjZSA9IGNvdW50Q29sdW1uKGxpbmUudGV4dCwgbnVsbCwgdGFiU2l6ZSk7XG4gIGlmIChsaW5lLnN0YXRlQWZ0ZXIpIHsgbGluZS5zdGF0ZUFmdGVyID0gbnVsbDsgfVxuICB2YXIgY3VyU3BhY2VTdHJpbmcgPSBsaW5lLnRleHQubWF0Y2goL15cXHMqLylbMF0sIGluZGVudGF0aW9uO1xuICBpZiAoIWFnZ3Jlc3NpdmUgJiYgIS9cXFMvLnRlc3QobGluZS50ZXh0KSkge1xuICAgIGluZGVudGF0aW9uID0gMDtcbiAgICBob3cgPSBcIm5vdFwiO1xuICB9IGVsc2UgaWYgKGhvdyA9PSBcInNtYXJ0XCIpIHtcbiAgICBpbmRlbnRhdGlvbiA9IGRvYy5tb2RlLmluZGVudChzdGF0ZSwgbGluZS50ZXh0LnNsaWNlKGN1clNwYWNlU3RyaW5nLmxlbmd0aCksIGxpbmUudGV4dCk7XG4gICAgaWYgKGluZGVudGF0aW9uID09IFBhc3MgfHwgaW5kZW50YXRpb24gPiAxNTApIHtcbiAgICAgIGlmICghYWdncmVzc2l2ZSkgeyByZXR1cm4gfVxuICAgICAgaG93ID0gXCJwcmV2XCI7XG4gICAgfVxuICB9XG4gIGlmIChob3cgPT0gXCJwcmV2XCIpIHtcbiAgICBpZiAobiA+IGRvYy5maXJzdCkgeyBpbmRlbnRhdGlvbiA9IGNvdW50Q29sdW1uKGdldExpbmUoZG9jLCBuLTEpLnRleHQsIG51bGwsIHRhYlNpemUpOyB9XG4gICAgZWxzZSB7IGluZGVudGF0aW9uID0gMDsgfVxuICB9IGVsc2UgaWYgKGhvdyA9PSBcImFkZFwiKSB7XG4gICAgaW5kZW50YXRpb24gPSBjdXJTcGFjZSArIGNtLm9wdGlvbnMuaW5kZW50VW5pdDtcbiAgfSBlbHNlIGlmIChob3cgPT0gXCJzdWJ0cmFjdFwiKSB7XG4gICAgaW5kZW50YXRpb24gPSBjdXJTcGFjZSAtIGNtLm9wdGlvbnMuaW5kZW50VW5pdDtcbiAgfSBlbHNlIGlmICh0eXBlb2YgaG93ID09IFwibnVtYmVyXCIpIHtcbiAgICBpbmRlbnRhdGlvbiA9IGN1clNwYWNlICsgaG93O1xuICB9XG4gIGluZGVudGF0aW9uID0gTWF0aC5tYXgoMCwgaW5kZW50YXRpb24pO1xuXG4gIHZhciBpbmRlbnRTdHJpbmcgPSBcIlwiLCBwb3MgPSAwO1xuICBpZiAoY20ub3B0aW9ucy5pbmRlbnRXaXRoVGFicylcbiAgICB7IGZvciAodmFyIGkgPSBNYXRoLmZsb29yKGluZGVudGF0aW9uIC8gdGFiU2l6ZSk7IGk7IC0taSkge3BvcyArPSB0YWJTaXplOyBpbmRlbnRTdHJpbmcgKz0gXCJcXHRcIjt9IH1cbiAgaWYgKHBvcyA8IGluZGVudGF0aW9uKSB7IGluZGVudFN0cmluZyArPSBzcGFjZVN0cihpbmRlbnRhdGlvbiAtIHBvcyk7IH1cblxuICBpZiAoaW5kZW50U3RyaW5nICE9IGN1clNwYWNlU3RyaW5nKSB7XG4gICAgcmVwbGFjZVJhbmdlKGRvYywgaW5kZW50U3RyaW5nLCBQb3MobiwgMCksIFBvcyhuLCBjdXJTcGFjZVN0cmluZy5sZW5ndGgpLCBcIitpbnB1dFwiKTtcbiAgICBsaW5lLnN0YXRlQWZ0ZXIgPSBudWxsO1xuICAgIHJldHVybiB0cnVlXG4gIH0gZWxzZSB7XG4gICAgLy8gRW5zdXJlIHRoYXQsIGlmIHRoZSBjdXJzb3Igd2FzIGluIHRoZSB3aGl0ZXNwYWNlIGF0IHRoZSBzdGFydFxuICAgIC8vIG9mIHRoZSBsaW5lLCBpdCBpcyBtb3ZlZCB0byB0aGUgZW5kIG9mIHRoYXQgc3BhY2UuXG4gICAgZm9yICh2YXIgaSQxID0gMDsgaSQxIDwgZG9jLnNlbC5yYW5nZXMubGVuZ3RoOyBpJDErKykge1xuICAgICAgdmFyIHJhbmdlID0gZG9jLnNlbC5yYW5nZXNbaSQxXTtcbiAgICAgIGlmIChyYW5nZS5oZWFkLmxpbmUgPT0gbiAmJiByYW5nZS5oZWFkLmNoIDwgY3VyU3BhY2VTdHJpbmcubGVuZ3RoKSB7XG4gICAgICAgIHZhciBwb3MkMSA9IFBvcyhuLCBjdXJTcGFjZVN0cmluZy5sZW5ndGgpO1xuICAgICAgICByZXBsYWNlT25lU2VsZWN0aW9uKGRvYywgaSQxLCBuZXcgUmFuZ2UocG9zJDEsIHBvcyQxKSk7XG4gICAgICAgIGJyZWFrXG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbi8vIFRoaXMgd2lsbCBiZSBzZXQgdG8gYSB7bGluZVdpc2U6IGJvb2wsIHRleHQ6IFtzdHJpbmddfSBvYmplY3QsIHNvXG4vLyB0aGF0LCB3aGVuIHBhc3RpbmcsIHdlIGtub3cgd2hhdCBraW5kIG9mIHNlbGVjdGlvbnMgdGhlIGNvcGllZFxuLy8gdGV4dCB3YXMgbWFkZSBvdXQgb2YuXG52YXIgbGFzdENvcGllZCA9IG51bGw7XG5cbmZ1bmN0aW9uIHNldExhc3RDb3BpZWQobmV3TGFzdENvcGllZCkge1xuICBsYXN0Q29waWVkID0gbmV3TGFzdENvcGllZDtcbn1cblxuZnVuY3Rpb24gYXBwbHlUZXh0SW5wdXQoY20sIGluc2VydGVkLCBkZWxldGVkLCBzZWwsIG9yaWdpbikge1xuICB2YXIgZG9jID0gY20uZG9jO1xuICBjbS5kaXNwbGF5LnNoaWZ0ID0gZmFsc2U7XG4gIGlmICghc2VsKSB7IHNlbCA9IGRvYy5zZWw7IH1cblxuICB2YXIgcGFzdGUgPSBjbS5zdGF0ZS5wYXN0ZUluY29taW5nIHx8IG9yaWdpbiA9PSBcInBhc3RlXCI7XG4gIHZhciB0ZXh0TGluZXMgPSBzcGxpdExpbmVzQXV0byhpbnNlcnRlZCksIG11bHRpUGFzdGUgPSBudWxsO1xuICAvLyBXaGVuIHBhc3RpbmcgTiBsaW5lcyBpbnRvIE4gc2VsZWN0aW9ucywgaW5zZXJ0IG9uZSBsaW5lIHBlciBzZWxlY3Rpb25cbiAgaWYgKHBhc3RlICYmIHNlbC5yYW5nZXMubGVuZ3RoID4gMSkge1xuICAgIGlmIChsYXN0Q29waWVkICYmIGxhc3RDb3BpZWQudGV4dC5qb2luKFwiXFxuXCIpID09IGluc2VydGVkKSB7XG4gICAgICBpZiAoc2VsLnJhbmdlcy5sZW5ndGggJSBsYXN0Q29waWVkLnRleHQubGVuZ3RoID09IDApIHtcbiAgICAgICAgbXVsdGlQYXN0ZSA9IFtdO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxhc3RDb3BpZWQudGV4dC5sZW5ndGg7IGkrKylcbiAgICAgICAgICB7IG11bHRpUGFzdGUucHVzaChkb2Muc3BsaXRMaW5lcyhsYXN0Q29waWVkLnRleHRbaV0pKTsgfVxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAodGV4dExpbmVzLmxlbmd0aCA9PSBzZWwucmFuZ2VzLmxlbmd0aCAmJiBjbS5vcHRpb25zLnBhc3RlTGluZXNQZXJTZWxlY3Rpb24pIHtcbiAgICAgIG11bHRpUGFzdGUgPSBtYXAodGV4dExpbmVzLCBmdW5jdGlvbiAobCkgeyByZXR1cm4gW2xdOyB9KTtcbiAgICB9XG4gIH1cblxuICB2YXIgdXBkYXRlSW5wdXQ7XG4gIC8vIE5vcm1hbCBiZWhhdmlvciBpcyB0byBpbnNlcnQgdGhlIG5ldyB0ZXh0IGludG8gZXZlcnkgc2VsZWN0aW9uXG4gIGZvciAodmFyIGkkMSA9IHNlbC5yYW5nZXMubGVuZ3RoIC0gMTsgaSQxID49IDA7IGkkMS0tKSB7XG4gICAgdmFyIHJhbmdlJCQxID0gc2VsLnJhbmdlc1tpJDFdO1xuICAgIHZhciBmcm9tID0gcmFuZ2UkJDEuZnJvbSgpLCB0byA9IHJhbmdlJCQxLnRvKCk7XG4gICAgaWYgKHJhbmdlJCQxLmVtcHR5KCkpIHtcbiAgICAgIGlmIChkZWxldGVkICYmIGRlbGV0ZWQgPiAwKSAvLyBIYW5kbGUgZGVsZXRpb25cbiAgICAgICAgeyBmcm9tID0gUG9zKGZyb20ubGluZSwgZnJvbS5jaCAtIGRlbGV0ZWQpOyB9XG4gICAgICBlbHNlIGlmIChjbS5zdGF0ZS5vdmVyd3JpdGUgJiYgIXBhc3RlKSAvLyBIYW5kbGUgb3ZlcndyaXRlXG4gICAgICAgIHsgdG8gPSBQb3ModG8ubGluZSwgTWF0aC5taW4oZ2V0TGluZShkb2MsIHRvLmxpbmUpLnRleHQubGVuZ3RoLCB0by5jaCArIGxzdCh0ZXh0TGluZXMpLmxlbmd0aCkpOyB9XG4gICAgICBlbHNlIGlmIChsYXN0Q29waWVkICYmIGxhc3RDb3BpZWQubGluZVdpc2UgJiYgbGFzdENvcGllZC50ZXh0LmpvaW4oXCJcXG5cIikgPT0gaW5zZXJ0ZWQpXG4gICAgICAgIHsgZnJvbSA9IHRvID0gUG9zKGZyb20ubGluZSwgMCk7IH1cbiAgICB9XG4gICAgdXBkYXRlSW5wdXQgPSBjbS5jdXJPcC51cGRhdGVJbnB1dDtcbiAgICB2YXIgY2hhbmdlRXZlbnQgPSB7ZnJvbTogZnJvbSwgdG86IHRvLCB0ZXh0OiBtdWx0aVBhc3RlID8gbXVsdGlQYXN0ZVtpJDEgJSBtdWx0aVBhc3RlLmxlbmd0aF0gOiB0ZXh0TGluZXMsXG4gICAgICAgICAgICAgICAgICAgICAgIG9yaWdpbjogb3JpZ2luIHx8IChwYXN0ZSA/IFwicGFzdGVcIiA6IGNtLnN0YXRlLmN1dEluY29taW5nID8gXCJjdXRcIiA6IFwiK2lucHV0XCIpfTtcbiAgICBtYWtlQ2hhbmdlKGNtLmRvYywgY2hhbmdlRXZlbnQpO1xuICAgIHNpZ25hbExhdGVyKGNtLCBcImlucHV0UmVhZFwiLCBjbSwgY2hhbmdlRXZlbnQpO1xuICB9XG4gIGlmIChpbnNlcnRlZCAmJiAhcGFzdGUpXG4gICAgeyB0cmlnZ2VyRWxlY3RyaWMoY20sIGluc2VydGVkKTsgfVxuXG4gIGVuc3VyZUN1cnNvclZpc2libGUoY20pO1xuICBjbS5jdXJPcC51cGRhdGVJbnB1dCA9IHVwZGF0ZUlucHV0O1xuICBjbS5jdXJPcC50eXBpbmcgPSB0cnVlO1xuICBjbS5zdGF0ZS5wYXN0ZUluY29taW5nID0gY20uc3RhdGUuY3V0SW5jb21pbmcgPSBmYWxzZTtcbn1cblxuZnVuY3Rpb24gaGFuZGxlUGFzdGUoZSwgY20pIHtcbiAgdmFyIHBhc3RlZCA9IGUuY2xpcGJvYXJkRGF0YSAmJiBlLmNsaXBib2FyZERhdGEuZ2V0RGF0YShcIlRleHRcIik7XG4gIGlmIChwYXN0ZWQpIHtcbiAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgaWYgKCFjbS5pc1JlYWRPbmx5KCkgJiYgIWNtLm9wdGlvbnMuZGlzYWJsZUlucHV0KVxuICAgICAgeyBydW5Jbk9wKGNtLCBmdW5jdGlvbiAoKSB7IHJldHVybiBhcHBseVRleHRJbnB1dChjbSwgcGFzdGVkLCAwLCBudWxsLCBcInBhc3RlXCIpOyB9KTsgfVxuICAgIHJldHVybiB0cnVlXG4gIH1cbn1cblxuZnVuY3Rpb24gdHJpZ2dlckVsZWN0cmljKGNtLCBpbnNlcnRlZCkge1xuICAvLyBXaGVuIGFuICdlbGVjdHJpYycgY2hhcmFjdGVyIGlzIGluc2VydGVkLCBpbW1lZGlhdGVseSB0cmlnZ2VyIGEgcmVpbmRlbnRcbiAgaWYgKCFjbS5vcHRpb25zLmVsZWN0cmljQ2hhcnMgfHwgIWNtLm9wdGlvbnMuc21hcnRJbmRlbnQpIHsgcmV0dXJuIH1cbiAgdmFyIHNlbCA9IGNtLmRvYy5zZWw7XG5cbiAgZm9yICh2YXIgaSA9IHNlbC5yYW5nZXMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICB2YXIgcmFuZ2UkJDEgPSBzZWwucmFuZ2VzW2ldO1xuICAgIGlmIChyYW5nZSQkMS5oZWFkLmNoID4gMTAwIHx8IChpICYmIHNlbC5yYW5nZXNbaSAtIDFdLmhlYWQubGluZSA9PSByYW5nZSQkMS5oZWFkLmxpbmUpKSB7IGNvbnRpbnVlIH1cbiAgICB2YXIgbW9kZSA9IGNtLmdldE1vZGVBdChyYW5nZSQkMS5oZWFkKTtcbiAgICB2YXIgaW5kZW50ZWQgPSBmYWxzZTtcbiAgICBpZiAobW9kZS5lbGVjdHJpY0NoYXJzKSB7XG4gICAgICBmb3IgKHZhciBqID0gMDsgaiA8IG1vZGUuZWxlY3RyaWNDaGFycy5sZW5ndGg7IGorKylcbiAgICAgICAgeyBpZiAoaW5zZXJ0ZWQuaW5kZXhPZihtb2RlLmVsZWN0cmljQ2hhcnMuY2hhckF0KGopKSA+IC0xKSB7XG4gICAgICAgICAgaW5kZW50ZWQgPSBpbmRlbnRMaW5lKGNtLCByYW5nZSQkMS5oZWFkLmxpbmUsIFwic21hcnRcIik7XG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgfSB9XG4gICAgfSBlbHNlIGlmIChtb2RlLmVsZWN0cmljSW5wdXQpIHtcbiAgICAgIGlmIChtb2RlLmVsZWN0cmljSW5wdXQudGVzdChnZXRMaW5lKGNtLmRvYywgcmFuZ2UkJDEuaGVhZC5saW5lKS50ZXh0LnNsaWNlKDAsIHJhbmdlJCQxLmhlYWQuY2gpKSlcbiAgICAgICAgeyBpbmRlbnRlZCA9IGluZGVudExpbmUoY20sIHJhbmdlJCQxLmhlYWQubGluZSwgXCJzbWFydFwiKTsgfVxuICAgIH1cbiAgICBpZiAoaW5kZW50ZWQpIHsgc2lnbmFsTGF0ZXIoY20sIFwiZWxlY3RyaWNJbnB1dFwiLCBjbSwgcmFuZ2UkJDEuaGVhZC5saW5lKTsgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGNvcHlhYmxlUmFuZ2VzKGNtKSB7XG4gIHZhciB0ZXh0ID0gW10sIHJhbmdlcyA9IFtdO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGNtLmRvYy5zZWwucmFuZ2VzLmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIGxpbmUgPSBjbS5kb2Muc2VsLnJhbmdlc1tpXS5oZWFkLmxpbmU7XG4gICAgdmFyIGxpbmVSYW5nZSA9IHthbmNob3I6IFBvcyhsaW5lLCAwKSwgaGVhZDogUG9zKGxpbmUgKyAxLCAwKX07XG4gICAgcmFuZ2VzLnB1c2gobGluZVJhbmdlKTtcbiAgICB0ZXh0LnB1c2goY20uZ2V0UmFuZ2UobGluZVJhbmdlLmFuY2hvciwgbGluZVJhbmdlLmhlYWQpKTtcbiAgfVxuICByZXR1cm4ge3RleHQ6IHRleHQsIHJhbmdlczogcmFuZ2VzfVxufVxuXG5mdW5jdGlvbiBkaXNhYmxlQnJvd3Nlck1hZ2ljKGZpZWxkLCBzcGVsbGNoZWNrKSB7XG4gIGZpZWxkLnNldEF0dHJpYnV0ZShcImF1dG9jb3JyZWN0XCIsIFwib2ZmXCIpO1xuICBmaWVsZC5zZXRBdHRyaWJ1dGUoXCJhdXRvY2FwaXRhbGl6ZVwiLCBcIm9mZlwiKTtcbiAgZmllbGQuc2V0QXR0cmlidXRlKFwic3BlbGxjaGVja1wiLCAhIXNwZWxsY2hlY2spO1xufVxuXG5mdW5jdGlvbiBoaWRkZW5UZXh0YXJlYSgpIHtcbiAgdmFyIHRlID0gZWx0KFwidGV4dGFyZWFcIiwgbnVsbCwgbnVsbCwgXCJwb3NpdGlvbjogYWJzb2x1dGU7IGJvdHRvbTogLTFlbTsgcGFkZGluZzogMDsgd2lkdGg6IDFweDsgaGVpZ2h0OiAxZW07IG91dGxpbmU6IG5vbmVcIik7XG4gIHZhciBkaXYgPSBlbHQoXCJkaXZcIiwgW3RlXSwgbnVsbCwgXCJvdmVyZmxvdzogaGlkZGVuOyBwb3NpdGlvbjogcmVsYXRpdmU7IHdpZHRoOiAzcHg7IGhlaWdodDogMHB4O1wiKTtcbiAgLy8gVGhlIHRleHRhcmVhIGlzIGtlcHQgcG9zaXRpb25lZCBuZWFyIHRoZSBjdXJzb3IgdG8gcHJldmVudCB0aGVcbiAgLy8gZmFjdCB0aGF0IGl0J2xsIGJlIHNjcm9sbGVkIGludG8gdmlldyBvbiBpbnB1dCBmcm9tIHNjcm9sbGluZ1xuICAvLyBvdXIgZmFrZSBjdXJzb3Igb3V0IG9mIHZpZXcuIE9uIHdlYmtpdCwgd2hlbiB3cmFwPW9mZiwgcGFzdGUgaXNcbiAgLy8gdmVyeSBzbG93LiBTbyBtYWtlIHRoZSBhcmVhIHdpZGUgaW5zdGVhZC5cbiAgaWYgKHdlYmtpdCkgeyB0ZS5zdHlsZS53aWR0aCA9IFwiMTAwMHB4XCI7IH1cbiAgZWxzZSB7IHRlLnNldEF0dHJpYnV0ZShcIndyYXBcIiwgXCJvZmZcIik7IH1cbiAgLy8gSWYgYm9yZGVyOiAwOyAtLSBpT1MgZmFpbHMgdG8gb3BlbiBrZXlib2FyZCAoaXNzdWUgIzEyODcpXG4gIGlmIChpb3MpIHsgdGUuc3R5bGUuYm9yZGVyID0gXCIxcHggc29saWQgYmxhY2tcIjsgfVxuICBkaXNhYmxlQnJvd3Nlck1hZ2ljKHRlKTtcbiAgcmV0dXJuIGRpdlxufVxuXG4vLyBUaGUgcHVibGljbHkgdmlzaWJsZSBBUEkuIE5vdGUgdGhhdCBtZXRob2RPcChmKSBtZWFuc1xuLy8gJ3dyYXAgZiBpbiBhbiBvcGVyYXRpb24sIHBlcmZvcm1lZCBvbiBpdHMgYHRoaXNgIHBhcmFtZXRlcicuXG5cbi8vIFRoaXMgaXMgbm90IHRoZSBjb21wbGV0ZSBzZXQgb2YgZWRpdG9yIG1ldGhvZHMuIE1vc3Qgb2YgdGhlXG4vLyBtZXRob2RzIGRlZmluZWQgb24gdGhlIERvYyB0eXBlIGFyZSBhbHNvIGluamVjdGVkIGludG9cbi8vIENvZGVNaXJyb3IucHJvdG90eXBlLCBmb3IgYmFja3dhcmRzIGNvbXBhdGliaWxpdHkgYW5kXG4vLyBjb252ZW5pZW5jZS5cblxudmFyIGFkZEVkaXRvck1ldGhvZHMgPSBmdW5jdGlvbihDb2RlTWlycm9yKSB7XG4gIHZhciBvcHRpb25IYW5kbGVycyA9IENvZGVNaXJyb3Iub3B0aW9uSGFuZGxlcnM7XG5cbiAgdmFyIGhlbHBlcnMgPSBDb2RlTWlycm9yLmhlbHBlcnMgPSB7fTtcblxuICBDb2RlTWlycm9yLnByb3RvdHlwZSA9IHtcbiAgICBjb25zdHJ1Y3RvcjogQ29kZU1pcnJvcixcbiAgICBmb2N1czogZnVuY3Rpb24oKXt3aW5kb3cuZm9jdXMoKTsgdGhpcy5kaXNwbGF5LmlucHV0LmZvY3VzKCk7fSxcblxuICAgIHNldE9wdGlvbjogZnVuY3Rpb24ob3B0aW9uLCB2YWx1ZSkge1xuICAgICAgdmFyIG9wdGlvbnMgPSB0aGlzLm9wdGlvbnMsIG9sZCA9IG9wdGlvbnNbb3B0aW9uXTtcbiAgICAgIGlmIChvcHRpb25zW29wdGlvbl0gPT0gdmFsdWUgJiYgb3B0aW9uICE9IFwibW9kZVwiKSB7IHJldHVybiB9XG4gICAgICBvcHRpb25zW29wdGlvbl0gPSB2YWx1ZTtcbiAgICAgIGlmIChvcHRpb25IYW5kbGVycy5oYXNPd25Qcm9wZXJ0eShvcHRpb24pKVxuICAgICAgICB7IG9wZXJhdGlvbih0aGlzLCBvcHRpb25IYW5kbGVyc1tvcHRpb25dKSh0aGlzLCB2YWx1ZSwgb2xkKTsgfVxuICAgICAgc2lnbmFsKHRoaXMsIFwib3B0aW9uQ2hhbmdlXCIsIHRoaXMsIG9wdGlvbik7XG4gICAgfSxcblxuICAgIGdldE9wdGlvbjogZnVuY3Rpb24ob3B0aW9uKSB7cmV0dXJuIHRoaXMub3B0aW9uc1tvcHRpb25dfSxcbiAgICBnZXREb2M6IGZ1bmN0aW9uKCkge3JldHVybiB0aGlzLmRvY30sXG5cbiAgICBhZGRLZXlNYXA6IGZ1bmN0aW9uKG1hcCQkMSwgYm90dG9tKSB7XG4gICAgICB0aGlzLnN0YXRlLmtleU1hcHNbYm90dG9tID8gXCJwdXNoXCIgOiBcInVuc2hpZnRcIl0oZ2V0S2V5TWFwKG1hcCQkMSkpO1xuICAgIH0sXG4gICAgcmVtb3ZlS2V5TWFwOiBmdW5jdGlvbihtYXAkJDEpIHtcbiAgICAgIHZhciBtYXBzID0gdGhpcy5zdGF0ZS5rZXlNYXBzO1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBtYXBzLmxlbmd0aDsgKytpKVxuICAgICAgICB7IGlmIChtYXBzW2ldID09IG1hcCQkMSB8fCBtYXBzW2ldLm5hbWUgPT0gbWFwJCQxKSB7XG4gICAgICAgICAgbWFwcy5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgICAgfSB9XG4gICAgfSxcblxuICAgIGFkZE92ZXJsYXk6IG1ldGhvZE9wKGZ1bmN0aW9uKHNwZWMsIG9wdGlvbnMpIHtcbiAgICAgIHZhciBtb2RlID0gc3BlYy50b2tlbiA/IHNwZWMgOiBDb2RlTWlycm9yLmdldE1vZGUodGhpcy5vcHRpb25zLCBzcGVjKTtcbiAgICAgIGlmIChtb2RlLnN0YXJ0U3RhdGUpIHsgdGhyb3cgbmV3IEVycm9yKFwiT3ZlcmxheXMgbWF5IG5vdCBiZSBzdGF0ZWZ1bC5cIikgfVxuICAgICAgaW5zZXJ0U29ydGVkKHRoaXMuc3RhdGUub3ZlcmxheXMsXG4gICAgICAgICAgICAgICAgICAge21vZGU6IG1vZGUsIG1vZGVTcGVjOiBzcGVjLCBvcGFxdWU6IG9wdGlvbnMgJiYgb3B0aW9ucy5vcGFxdWUsXG4gICAgICAgICAgICAgICAgICAgIHByaW9yaXR5OiAob3B0aW9ucyAmJiBvcHRpb25zLnByaW9yaXR5KSB8fCAwfSxcbiAgICAgICAgICAgICAgICAgICBmdW5jdGlvbiAob3ZlcmxheSkgeyByZXR1cm4gb3ZlcmxheS5wcmlvcml0eTsgfSk7XG4gICAgICB0aGlzLnN0YXRlLm1vZGVHZW4rKztcbiAgICAgIHJlZ0NoYW5nZSh0aGlzKTtcbiAgICB9KSxcbiAgICByZW1vdmVPdmVybGF5OiBtZXRob2RPcChmdW5jdGlvbihzcGVjKSB7XG4gICAgICB2YXIgdGhpcyQxID0gdGhpcztcblxuICAgICAgdmFyIG92ZXJsYXlzID0gdGhpcy5zdGF0ZS5vdmVybGF5cztcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgb3ZlcmxheXMubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgdmFyIGN1ciA9IG92ZXJsYXlzW2ldLm1vZGVTcGVjO1xuICAgICAgICBpZiAoY3VyID09IHNwZWMgfHwgdHlwZW9mIHNwZWMgPT0gXCJzdHJpbmdcIiAmJiBjdXIubmFtZSA9PSBzcGVjKSB7XG4gICAgICAgICAgb3ZlcmxheXMuc3BsaWNlKGksIDEpO1xuICAgICAgICAgIHRoaXMkMS5zdGF0ZS5tb2RlR2VuKys7XG4gICAgICAgICAgcmVnQ2hhbmdlKHRoaXMkMSk7XG4gICAgICAgICAgcmV0dXJuXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KSxcblxuICAgIGluZGVudExpbmU6IG1ldGhvZE9wKGZ1bmN0aW9uKG4sIGRpciwgYWdncmVzc2l2ZSkge1xuICAgICAgaWYgKHR5cGVvZiBkaXIgIT0gXCJzdHJpbmdcIiAmJiB0eXBlb2YgZGlyICE9IFwibnVtYmVyXCIpIHtcbiAgICAgICAgaWYgKGRpciA9PSBudWxsKSB7IGRpciA9IHRoaXMub3B0aW9ucy5zbWFydEluZGVudCA/IFwic21hcnRcIiA6IFwicHJldlwiOyB9XG4gICAgICAgIGVsc2UgeyBkaXIgPSBkaXIgPyBcImFkZFwiIDogXCJzdWJ0cmFjdFwiOyB9XG4gICAgICB9XG4gICAgICBpZiAoaXNMaW5lKHRoaXMuZG9jLCBuKSkgeyBpbmRlbnRMaW5lKHRoaXMsIG4sIGRpciwgYWdncmVzc2l2ZSk7IH1cbiAgICB9KSxcbiAgICBpbmRlbnRTZWxlY3Rpb246IG1ldGhvZE9wKGZ1bmN0aW9uKGhvdykge1xuICAgICAgdmFyIHRoaXMkMSA9IHRoaXM7XG5cbiAgICAgIHZhciByYW5nZXMgPSB0aGlzLmRvYy5zZWwucmFuZ2VzLCBlbmQgPSAtMTtcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgcmFuZ2VzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhciByYW5nZSQkMSA9IHJhbmdlc1tpXTtcbiAgICAgICAgaWYgKCFyYW5nZSQkMS5lbXB0eSgpKSB7XG4gICAgICAgICAgdmFyIGZyb20gPSByYW5nZSQkMS5mcm9tKCksIHRvID0gcmFuZ2UkJDEudG8oKTtcbiAgICAgICAgICB2YXIgc3RhcnQgPSBNYXRoLm1heChlbmQsIGZyb20ubGluZSk7XG4gICAgICAgICAgZW5kID0gTWF0aC5taW4odGhpcyQxLmxhc3RMaW5lKCksIHRvLmxpbmUgLSAodG8uY2ggPyAwIDogMSkpICsgMTtcbiAgICAgICAgICBmb3IgKHZhciBqID0gc3RhcnQ7IGogPCBlbmQ7ICsrailcbiAgICAgICAgICAgIHsgaW5kZW50TGluZSh0aGlzJDEsIGosIGhvdyk7IH1cbiAgICAgICAgICB2YXIgbmV3UmFuZ2VzID0gdGhpcyQxLmRvYy5zZWwucmFuZ2VzO1xuICAgICAgICAgIGlmIChmcm9tLmNoID09IDAgJiYgcmFuZ2VzLmxlbmd0aCA9PSBuZXdSYW5nZXMubGVuZ3RoICYmIG5ld1Jhbmdlc1tpXS5mcm9tKCkuY2ggPiAwKVxuICAgICAgICAgICAgeyByZXBsYWNlT25lU2VsZWN0aW9uKHRoaXMkMS5kb2MsIGksIG5ldyBSYW5nZShmcm9tLCBuZXdSYW5nZXNbaV0udG8oKSksIHNlbF9kb250U2Nyb2xsKTsgfVxuICAgICAgICB9IGVsc2UgaWYgKHJhbmdlJCQxLmhlYWQubGluZSA+IGVuZCkge1xuICAgICAgICAgIGluZGVudExpbmUodGhpcyQxLCByYW5nZSQkMS5oZWFkLmxpbmUsIGhvdywgdHJ1ZSk7XG4gICAgICAgICAgZW5kID0gcmFuZ2UkJDEuaGVhZC5saW5lO1xuICAgICAgICAgIGlmIChpID09IHRoaXMkMS5kb2Muc2VsLnByaW1JbmRleCkgeyBlbnN1cmVDdXJzb3JWaXNpYmxlKHRoaXMkMSk7IH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pLFxuXG4gICAgLy8gRmV0Y2ggdGhlIHBhcnNlciB0b2tlbiBmb3IgYSBnaXZlbiBjaGFyYWN0ZXIuIFVzZWZ1bCBmb3IgaGFja3NcbiAgICAvLyB0aGF0IHdhbnQgdG8gaW5zcGVjdCB0aGUgbW9kZSBzdGF0ZSAoc2F5LCBmb3IgY29tcGxldGlvbikuXG4gICAgZ2V0VG9rZW5BdDogZnVuY3Rpb24ocG9zLCBwcmVjaXNlKSB7XG4gICAgICByZXR1cm4gdGFrZVRva2VuKHRoaXMsIHBvcywgcHJlY2lzZSlcbiAgICB9LFxuXG4gICAgZ2V0TGluZVRva2VuczogZnVuY3Rpb24obGluZSwgcHJlY2lzZSkge1xuICAgICAgcmV0dXJuIHRha2VUb2tlbih0aGlzLCBQb3MobGluZSksIHByZWNpc2UsIHRydWUpXG4gICAgfSxcblxuICAgIGdldFRva2VuVHlwZUF0OiBmdW5jdGlvbihwb3MpIHtcbiAgICAgIHBvcyA9IGNsaXBQb3ModGhpcy5kb2MsIHBvcyk7XG4gICAgICB2YXIgc3R5bGVzID0gZ2V0TGluZVN0eWxlcyh0aGlzLCBnZXRMaW5lKHRoaXMuZG9jLCBwb3MubGluZSkpO1xuICAgICAgdmFyIGJlZm9yZSA9IDAsIGFmdGVyID0gKHN0eWxlcy5sZW5ndGggLSAxKSAvIDIsIGNoID0gcG9zLmNoO1xuICAgICAgdmFyIHR5cGU7XG4gICAgICBpZiAoY2ggPT0gMCkgeyB0eXBlID0gc3R5bGVzWzJdOyB9XG4gICAgICBlbHNlIHsgZm9yICg7Oykge1xuICAgICAgICB2YXIgbWlkID0gKGJlZm9yZSArIGFmdGVyKSA+PiAxO1xuICAgICAgICBpZiAoKG1pZCA/IHN0eWxlc1ttaWQgKiAyIC0gMV0gOiAwKSA+PSBjaCkgeyBhZnRlciA9IG1pZDsgfVxuICAgICAgICBlbHNlIGlmIChzdHlsZXNbbWlkICogMiArIDFdIDwgY2gpIHsgYmVmb3JlID0gbWlkICsgMTsgfVxuICAgICAgICBlbHNlIHsgdHlwZSA9IHN0eWxlc1ttaWQgKiAyICsgMl07IGJyZWFrIH1cbiAgICAgIH0gfVxuICAgICAgdmFyIGN1dCA9IHR5cGUgPyB0eXBlLmluZGV4T2YoXCJvdmVybGF5IFwiKSA6IC0xO1xuICAgICAgcmV0dXJuIGN1dCA8IDAgPyB0eXBlIDogY3V0ID09IDAgPyBudWxsIDogdHlwZS5zbGljZSgwLCBjdXQgLSAxKVxuICAgIH0sXG5cbiAgICBnZXRNb2RlQXQ6IGZ1bmN0aW9uKHBvcykge1xuICAgICAgdmFyIG1vZGUgPSB0aGlzLmRvYy5tb2RlO1xuICAgICAgaWYgKCFtb2RlLmlubmVyTW9kZSkgeyByZXR1cm4gbW9kZSB9XG4gICAgICByZXR1cm4gQ29kZU1pcnJvci5pbm5lck1vZGUobW9kZSwgdGhpcy5nZXRUb2tlbkF0KHBvcykuc3RhdGUpLm1vZGVcbiAgICB9LFxuXG4gICAgZ2V0SGVscGVyOiBmdW5jdGlvbihwb3MsIHR5cGUpIHtcbiAgICAgIHJldHVybiB0aGlzLmdldEhlbHBlcnMocG9zLCB0eXBlKVswXVxuICAgIH0sXG5cbiAgICBnZXRIZWxwZXJzOiBmdW5jdGlvbihwb3MsIHR5cGUpIHtcbiAgICAgIHZhciB0aGlzJDEgPSB0aGlzO1xuXG4gICAgICB2YXIgZm91bmQgPSBbXTtcbiAgICAgIGlmICghaGVscGVycy5oYXNPd25Qcm9wZXJ0eSh0eXBlKSkgeyByZXR1cm4gZm91bmQgfVxuICAgICAgdmFyIGhlbHAgPSBoZWxwZXJzW3R5cGVdLCBtb2RlID0gdGhpcy5nZXRNb2RlQXQocG9zKTtcbiAgICAgIGlmICh0eXBlb2YgbW9kZVt0eXBlXSA9PSBcInN0cmluZ1wiKSB7XG4gICAgICAgIGlmIChoZWxwW21vZGVbdHlwZV1dKSB7IGZvdW5kLnB1c2goaGVscFttb2RlW3R5cGVdXSk7IH1cbiAgICAgIH0gZWxzZSBpZiAobW9kZVt0eXBlXSkge1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG1vZGVbdHlwZV0ubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICB2YXIgdmFsID0gaGVscFttb2RlW3R5cGVdW2ldXTtcbiAgICAgICAgICBpZiAodmFsKSB7IGZvdW5kLnB1c2godmFsKTsgfVxuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKG1vZGUuaGVscGVyVHlwZSAmJiBoZWxwW21vZGUuaGVscGVyVHlwZV0pIHtcbiAgICAgICAgZm91bmQucHVzaChoZWxwW21vZGUuaGVscGVyVHlwZV0pO1xuICAgICAgfSBlbHNlIGlmIChoZWxwW21vZGUubmFtZV0pIHtcbiAgICAgICAgZm91bmQucHVzaChoZWxwW21vZGUubmFtZV0pO1xuICAgICAgfVxuICAgICAgZm9yICh2YXIgaSQxID0gMDsgaSQxIDwgaGVscC5fZ2xvYmFsLmxlbmd0aDsgaSQxKyspIHtcbiAgICAgICAgdmFyIGN1ciA9IGhlbHAuX2dsb2JhbFtpJDFdO1xuICAgICAgICBpZiAoY3VyLnByZWQobW9kZSwgdGhpcyQxKSAmJiBpbmRleE9mKGZvdW5kLCBjdXIudmFsKSA9PSAtMSlcbiAgICAgICAgICB7IGZvdW5kLnB1c2goY3VyLnZhbCk7IH1cbiAgICAgIH1cbiAgICAgIHJldHVybiBmb3VuZFxuICAgIH0sXG5cbiAgICBnZXRTdGF0ZUFmdGVyOiBmdW5jdGlvbihsaW5lLCBwcmVjaXNlKSB7XG4gICAgICB2YXIgZG9jID0gdGhpcy5kb2M7XG4gICAgICBsaW5lID0gY2xpcExpbmUoZG9jLCBsaW5lID09IG51bGwgPyBkb2MuZmlyc3QgKyBkb2Muc2l6ZSAtIDE6IGxpbmUpO1xuICAgICAgcmV0dXJuIGdldENvbnRleHRCZWZvcmUodGhpcywgbGluZSArIDEsIHByZWNpc2UpLnN0YXRlXG4gICAgfSxcblxuICAgIGN1cnNvckNvb3JkczogZnVuY3Rpb24oc3RhcnQsIG1vZGUpIHtcbiAgICAgIHZhciBwb3MsIHJhbmdlJCQxID0gdGhpcy5kb2Muc2VsLnByaW1hcnkoKTtcbiAgICAgIGlmIChzdGFydCA9PSBudWxsKSB7IHBvcyA9IHJhbmdlJCQxLmhlYWQ7IH1cbiAgICAgIGVsc2UgaWYgKHR5cGVvZiBzdGFydCA9PSBcIm9iamVjdFwiKSB7IHBvcyA9IGNsaXBQb3ModGhpcy5kb2MsIHN0YXJ0KTsgfVxuICAgICAgZWxzZSB7IHBvcyA9IHN0YXJ0ID8gcmFuZ2UkJDEuZnJvbSgpIDogcmFuZ2UkJDEudG8oKTsgfVxuICAgICAgcmV0dXJuIGN1cnNvckNvb3Jkcyh0aGlzLCBwb3MsIG1vZGUgfHwgXCJwYWdlXCIpXG4gICAgfSxcblxuICAgIGNoYXJDb29yZHM6IGZ1bmN0aW9uKHBvcywgbW9kZSkge1xuICAgICAgcmV0dXJuIGNoYXJDb29yZHModGhpcywgY2xpcFBvcyh0aGlzLmRvYywgcG9zKSwgbW9kZSB8fCBcInBhZ2VcIilcbiAgICB9LFxuXG4gICAgY29vcmRzQ2hhcjogZnVuY3Rpb24oY29vcmRzLCBtb2RlKSB7XG4gICAgICBjb29yZHMgPSBmcm9tQ29vcmRTeXN0ZW0odGhpcywgY29vcmRzLCBtb2RlIHx8IFwicGFnZVwiKTtcbiAgICAgIHJldHVybiBjb29yZHNDaGFyKHRoaXMsIGNvb3Jkcy5sZWZ0LCBjb29yZHMudG9wKVxuICAgIH0sXG5cbiAgICBsaW5lQXRIZWlnaHQ6IGZ1bmN0aW9uKGhlaWdodCwgbW9kZSkge1xuICAgICAgaGVpZ2h0ID0gZnJvbUNvb3JkU3lzdGVtKHRoaXMsIHt0b3A6IGhlaWdodCwgbGVmdDogMH0sIG1vZGUgfHwgXCJwYWdlXCIpLnRvcDtcbiAgICAgIHJldHVybiBsaW5lQXRIZWlnaHQodGhpcy5kb2MsIGhlaWdodCArIHRoaXMuZGlzcGxheS52aWV3T2Zmc2V0KVxuICAgIH0sXG4gICAgaGVpZ2h0QXRMaW5lOiBmdW5jdGlvbihsaW5lLCBtb2RlLCBpbmNsdWRlV2lkZ2V0cykge1xuICAgICAgdmFyIGVuZCA9IGZhbHNlLCBsaW5lT2JqO1xuICAgICAgaWYgKHR5cGVvZiBsaW5lID09IFwibnVtYmVyXCIpIHtcbiAgICAgICAgdmFyIGxhc3QgPSB0aGlzLmRvYy5maXJzdCArIHRoaXMuZG9jLnNpemUgLSAxO1xuICAgICAgICBpZiAobGluZSA8IHRoaXMuZG9jLmZpcnN0KSB7IGxpbmUgPSB0aGlzLmRvYy5maXJzdDsgfVxuICAgICAgICBlbHNlIGlmIChsaW5lID4gbGFzdCkgeyBsaW5lID0gbGFzdDsgZW5kID0gdHJ1ZTsgfVxuICAgICAgICBsaW5lT2JqID0gZ2V0TGluZSh0aGlzLmRvYywgbGluZSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBsaW5lT2JqID0gbGluZTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBpbnRvQ29vcmRTeXN0ZW0odGhpcywgbGluZU9iaiwge3RvcDogMCwgbGVmdDogMH0sIG1vZGUgfHwgXCJwYWdlXCIsIGluY2x1ZGVXaWRnZXRzIHx8IGVuZCkudG9wICtcbiAgICAgICAgKGVuZCA/IHRoaXMuZG9jLmhlaWdodCAtIGhlaWdodEF0TGluZShsaW5lT2JqKSA6IDApXG4gICAgfSxcblxuICAgIGRlZmF1bHRUZXh0SGVpZ2h0OiBmdW5jdGlvbigpIHsgcmV0dXJuIHRleHRIZWlnaHQodGhpcy5kaXNwbGF5KSB9LFxuICAgIGRlZmF1bHRDaGFyV2lkdGg6IGZ1bmN0aW9uKCkgeyByZXR1cm4gY2hhcldpZHRoKHRoaXMuZGlzcGxheSkgfSxcblxuICAgIGdldFZpZXdwb3J0OiBmdW5jdGlvbigpIHsgcmV0dXJuIHtmcm9tOiB0aGlzLmRpc3BsYXkudmlld0Zyb20sIHRvOiB0aGlzLmRpc3BsYXkudmlld1RvfX0sXG5cbiAgICBhZGRXaWRnZXQ6IGZ1bmN0aW9uKHBvcywgbm9kZSwgc2Nyb2xsLCB2ZXJ0LCBob3Jpeikge1xuICAgICAgdmFyIGRpc3BsYXkgPSB0aGlzLmRpc3BsYXk7XG4gICAgICBwb3MgPSBjdXJzb3JDb29yZHModGhpcywgY2xpcFBvcyh0aGlzLmRvYywgcG9zKSk7XG4gICAgICB2YXIgdG9wID0gcG9zLmJvdHRvbSwgbGVmdCA9IHBvcy5sZWZ0O1xuICAgICAgbm9kZS5zdHlsZS5wb3NpdGlvbiA9IFwiYWJzb2x1dGVcIjtcbiAgICAgIG5vZGUuc2V0QXR0cmlidXRlKFwiY20taWdub3JlLWV2ZW50c1wiLCBcInRydWVcIik7XG4gICAgICB0aGlzLmRpc3BsYXkuaW5wdXQuc2V0VW5lZGl0YWJsZShub2RlKTtcbiAgICAgIGRpc3BsYXkuc2l6ZXIuYXBwZW5kQ2hpbGQobm9kZSk7XG4gICAgICBpZiAodmVydCA9PSBcIm92ZXJcIikge1xuICAgICAgICB0b3AgPSBwb3MudG9wO1xuICAgICAgfSBlbHNlIGlmICh2ZXJ0ID09IFwiYWJvdmVcIiB8fCB2ZXJ0ID09IFwibmVhclwiKSB7XG4gICAgICAgIHZhciB2c3BhY2UgPSBNYXRoLm1heChkaXNwbGF5LndyYXBwZXIuY2xpZW50SGVpZ2h0LCB0aGlzLmRvYy5oZWlnaHQpLFxuICAgICAgICBoc3BhY2UgPSBNYXRoLm1heChkaXNwbGF5LnNpemVyLmNsaWVudFdpZHRoLCBkaXNwbGF5LmxpbmVTcGFjZS5jbGllbnRXaWR0aCk7XG4gICAgICAgIC8vIERlZmF1bHQgdG8gcG9zaXRpb25pbmcgYWJvdmUgKGlmIHNwZWNpZmllZCBhbmQgcG9zc2libGUpOyBvdGhlcndpc2UgZGVmYXVsdCB0byBwb3NpdGlvbmluZyBiZWxvd1xuICAgICAgICBpZiAoKHZlcnQgPT0gJ2Fib3ZlJyB8fCBwb3MuYm90dG9tICsgbm9kZS5vZmZzZXRIZWlnaHQgPiB2c3BhY2UpICYmIHBvcy50b3AgPiBub2RlLm9mZnNldEhlaWdodClcbiAgICAgICAgICB7IHRvcCA9IHBvcy50b3AgLSBub2RlLm9mZnNldEhlaWdodDsgfVxuICAgICAgICBlbHNlIGlmIChwb3MuYm90dG9tICsgbm9kZS5vZmZzZXRIZWlnaHQgPD0gdnNwYWNlKVxuICAgICAgICAgIHsgdG9wID0gcG9zLmJvdHRvbTsgfVxuICAgICAgICBpZiAobGVmdCArIG5vZGUub2Zmc2V0V2lkdGggPiBoc3BhY2UpXG4gICAgICAgICAgeyBsZWZ0ID0gaHNwYWNlIC0gbm9kZS5vZmZzZXRXaWR0aDsgfVxuICAgICAgfVxuICAgICAgbm9kZS5zdHlsZS50b3AgPSB0b3AgKyBcInB4XCI7XG4gICAgICBub2RlLnN0eWxlLmxlZnQgPSBub2RlLnN0eWxlLnJpZ2h0ID0gXCJcIjtcbiAgICAgIGlmIChob3JpeiA9PSBcInJpZ2h0XCIpIHtcbiAgICAgICAgbGVmdCA9IGRpc3BsYXkuc2l6ZXIuY2xpZW50V2lkdGggLSBub2RlLm9mZnNldFdpZHRoO1xuICAgICAgICBub2RlLnN0eWxlLnJpZ2h0ID0gXCIwcHhcIjtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmIChob3JpeiA9PSBcImxlZnRcIikgeyBsZWZ0ID0gMDsgfVxuICAgICAgICBlbHNlIGlmIChob3JpeiA9PSBcIm1pZGRsZVwiKSB7IGxlZnQgPSAoZGlzcGxheS5zaXplci5jbGllbnRXaWR0aCAtIG5vZGUub2Zmc2V0V2lkdGgpIC8gMjsgfVxuICAgICAgICBub2RlLnN0eWxlLmxlZnQgPSBsZWZ0ICsgXCJweFwiO1xuICAgICAgfVxuICAgICAgaWYgKHNjcm9sbClcbiAgICAgICAgeyBzY3JvbGxJbnRvVmlldyh0aGlzLCB7bGVmdDogbGVmdCwgdG9wOiB0b3AsIHJpZ2h0OiBsZWZ0ICsgbm9kZS5vZmZzZXRXaWR0aCwgYm90dG9tOiB0b3AgKyBub2RlLm9mZnNldEhlaWdodH0pOyB9XG4gICAgfSxcblxuICAgIHRyaWdnZXJPbktleURvd246IG1ldGhvZE9wKG9uS2V5RG93biksXG4gICAgdHJpZ2dlck9uS2V5UHJlc3M6IG1ldGhvZE9wKG9uS2V5UHJlc3MpLFxuICAgIHRyaWdnZXJPbktleVVwOiBvbktleVVwLFxuICAgIHRyaWdnZXJPbk1vdXNlRG93bjogbWV0aG9kT3Aob25Nb3VzZURvd24pLFxuXG4gICAgZXhlY0NvbW1hbmQ6IGZ1bmN0aW9uKGNtZCkge1xuICAgICAgaWYgKGNvbW1hbmRzLmhhc093blByb3BlcnR5KGNtZCkpXG4gICAgICAgIHsgcmV0dXJuIGNvbW1hbmRzW2NtZF0uY2FsbChudWxsLCB0aGlzKSB9XG4gICAgfSxcblxuICAgIHRyaWdnZXJFbGVjdHJpYzogbWV0aG9kT3AoZnVuY3Rpb24odGV4dCkgeyB0cmlnZ2VyRWxlY3RyaWModGhpcywgdGV4dCk7IH0pLFxuXG4gICAgZmluZFBvc0g6IGZ1bmN0aW9uKGZyb20sIGFtb3VudCwgdW5pdCwgdmlzdWFsbHkpIHtcbiAgICAgIHZhciB0aGlzJDEgPSB0aGlzO1xuXG4gICAgICB2YXIgZGlyID0gMTtcbiAgICAgIGlmIChhbW91bnQgPCAwKSB7IGRpciA9IC0xOyBhbW91bnQgPSAtYW1vdW50OyB9XG4gICAgICB2YXIgY3VyID0gY2xpcFBvcyh0aGlzLmRvYywgZnJvbSk7XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGFtb3VudDsgKytpKSB7XG4gICAgICAgIGN1ciA9IGZpbmRQb3NIKHRoaXMkMS5kb2MsIGN1ciwgZGlyLCB1bml0LCB2aXN1YWxseSk7XG4gICAgICAgIGlmIChjdXIuaGl0U2lkZSkgeyBicmVhayB9XG4gICAgICB9XG4gICAgICByZXR1cm4gY3VyXG4gICAgfSxcblxuICAgIG1vdmVIOiBtZXRob2RPcChmdW5jdGlvbihkaXIsIHVuaXQpIHtcbiAgICAgIHZhciB0aGlzJDEgPSB0aGlzO1xuXG4gICAgICB0aGlzLmV4dGVuZFNlbGVjdGlvbnNCeShmdW5jdGlvbiAocmFuZ2UkJDEpIHtcbiAgICAgICAgaWYgKHRoaXMkMS5kaXNwbGF5LnNoaWZ0IHx8IHRoaXMkMS5kb2MuZXh0ZW5kIHx8IHJhbmdlJCQxLmVtcHR5KCkpXG4gICAgICAgICAgeyByZXR1cm4gZmluZFBvc0godGhpcyQxLmRvYywgcmFuZ2UkJDEuaGVhZCwgZGlyLCB1bml0LCB0aGlzJDEub3B0aW9ucy5ydGxNb3ZlVmlzdWFsbHkpIH1cbiAgICAgICAgZWxzZVxuICAgICAgICAgIHsgcmV0dXJuIGRpciA8IDAgPyByYW5nZSQkMS5mcm9tKCkgOiByYW5nZSQkMS50bygpIH1cbiAgICAgIH0sIHNlbF9tb3ZlKTtcbiAgICB9KSxcblxuICAgIGRlbGV0ZUg6IG1ldGhvZE9wKGZ1bmN0aW9uKGRpciwgdW5pdCkge1xuICAgICAgdmFyIHNlbCA9IHRoaXMuZG9jLnNlbCwgZG9jID0gdGhpcy5kb2M7XG4gICAgICBpZiAoc2VsLnNvbWV0aGluZ1NlbGVjdGVkKCkpXG4gICAgICAgIHsgZG9jLnJlcGxhY2VTZWxlY3Rpb24oXCJcIiwgbnVsbCwgXCIrZGVsZXRlXCIpOyB9XG4gICAgICBlbHNlXG4gICAgICAgIHsgZGVsZXRlTmVhclNlbGVjdGlvbih0aGlzLCBmdW5jdGlvbiAocmFuZ2UkJDEpIHtcbiAgICAgICAgICB2YXIgb3RoZXIgPSBmaW5kUG9zSChkb2MsIHJhbmdlJCQxLmhlYWQsIGRpciwgdW5pdCwgZmFsc2UpO1xuICAgICAgICAgIHJldHVybiBkaXIgPCAwID8ge2Zyb206IG90aGVyLCB0bzogcmFuZ2UkJDEuaGVhZH0gOiB7ZnJvbTogcmFuZ2UkJDEuaGVhZCwgdG86IG90aGVyfVxuICAgICAgICB9KTsgfVxuICAgIH0pLFxuXG4gICAgZmluZFBvc1Y6IGZ1bmN0aW9uKGZyb20sIGFtb3VudCwgdW5pdCwgZ29hbENvbHVtbikge1xuICAgICAgdmFyIHRoaXMkMSA9IHRoaXM7XG5cbiAgICAgIHZhciBkaXIgPSAxLCB4ID0gZ29hbENvbHVtbjtcbiAgICAgIGlmIChhbW91bnQgPCAwKSB7IGRpciA9IC0xOyBhbW91bnQgPSAtYW1vdW50OyB9XG4gICAgICB2YXIgY3VyID0gY2xpcFBvcyh0aGlzLmRvYywgZnJvbSk7XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGFtb3VudDsgKytpKSB7XG4gICAgICAgIHZhciBjb29yZHMgPSBjdXJzb3JDb29yZHModGhpcyQxLCBjdXIsIFwiZGl2XCIpO1xuICAgICAgICBpZiAoeCA9PSBudWxsKSB7IHggPSBjb29yZHMubGVmdDsgfVxuICAgICAgICBlbHNlIHsgY29vcmRzLmxlZnQgPSB4OyB9XG4gICAgICAgIGN1ciA9IGZpbmRQb3NWKHRoaXMkMSwgY29vcmRzLCBkaXIsIHVuaXQpO1xuICAgICAgICBpZiAoY3VyLmhpdFNpZGUpIHsgYnJlYWsgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIGN1clxuICAgIH0sXG5cbiAgICBtb3ZlVjogbWV0aG9kT3AoZnVuY3Rpb24oZGlyLCB1bml0KSB7XG4gICAgICB2YXIgdGhpcyQxID0gdGhpcztcblxuICAgICAgdmFyIGRvYyA9IHRoaXMuZG9jLCBnb2FscyA9IFtdO1xuICAgICAgdmFyIGNvbGxhcHNlID0gIXRoaXMuZGlzcGxheS5zaGlmdCAmJiAhZG9jLmV4dGVuZCAmJiBkb2Muc2VsLnNvbWV0aGluZ1NlbGVjdGVkKCk7XG4gICAgICBkb2MuZXh0ZW5kU2VsZWN0aW9uc0J5KGZ1bmN0aW9uIChyYW5nZSQkMSkge1xuICAgICAgICBpZiAoY29sbGFwc2UpXG4gICAgICAgICAgeyByZXR1cm4gZGlyIDwgMCA/IHJhbmdlJCQxLmZyb20oKSA6IHJhbmdlJCQxLnRvKCkgfVxuICAgICAgICB2YXIgaGVhZFBvcyA9IGN1cnNvckNvb3Jkcyh0aGlzJDEsIHJhbmdlJCQxLmhlYWQsIFwiZGl2XCIpO1xuICAgICAgICBpZiAocmFuZ2UkJDEuZ29hbENvbHVtbiAhPSBudWxsKSB7IGhlYWRQb3MubGVmdCA9IHJhbmdlJCQxLmdvYWxDb2x1bW47IH1cbiAgICAgICAgZ29hbHMucHVzaChoZWFkUG9zLmxlZnQpO1xuICAgICAgICB2YXIgcG9zID0gZmluZFBvc1YodGhpcyQxLCBoZWFkUG9zLCBkaXIsIHVuaXQpO1xuICAgICAgICBpZiAodW5pdCA9PSBcInBhZ2VcIiAmJiByYW5nZSQkMSA9PSBkb2Muc2VsLnByaW1hcnkoKSlcbiAgICAgICAgICB7IGFkZFRvU2Nyb2xsVG9wKHRoaXMkMSwgY2hhckNvb3Jkcyh0aGlzJDEsIHBvcywgXCJkaXZcIikudG9wIC0gaGVhZFBvcy50b3ApOyB9XG4gICAgICAgIHJldHVybiBwb3NcbiAgICAgIH0sIHNlbF9tb3ZlKTtcbiAgICAgIGlmIChnb2Fscy5sZW5ndGgpIHsgZm9yICh2YXIgaSA9IDA7IGkgPCBkb2Muc2VsLnJhbmdlcy5sZW5ndGg7IGkrKylcbiAgICAgICAgeyBkb2Muc2VsLnJhbmdlc1tpXS5nb2FsQ29sdW1uID0gZ29hbHNbaV07IH0gfVxuICAgIH0pLFxuXG4gICAgLy8gRmluZCB0aGUgd29yZCBhdCB0aGUgZ2l2ZW4gcG9zaXRpb24gKGFzIHJldHVybmVkIGJ5IGNvb3Jkc0NoYXIpLlxuICAgIGZpbmRXb3JkQXQ6IGZ1bmN0aW9uKHBvcykge1xuICAgICAgdmFyIGRvYyA9IHRoaXMuZG9jLCBsaW5lID0gZ2V0TGluZShkb2MsIHBvcy5saW5lKS50ZXh0O1xuICAgICAgdmFyIHN0YXJ0ID0gcG9zLmNoLCBlbmQgPSBwb3MuY2g7XG4gICAgICBpZiAobGluZSkge1xuICAgICAgICB2YXIgaGVscGVyID0gdGhpcy5nZXRIZWxwZXIocG9zLCBcIndvcmRDaGFyc1wiKTtcbiAgICAgICAgaWYgKChwb3Muc3RpY2t5ID09IFwiYmVmb3JlXCIgfHwgZW5kID09IGxpbmUubGVuZ3RoKSAmJiBzdGFydCkgeyAtLXN0YXJ0OyB9IGVsc2UgeyArK2VuZDsgfVxuICAgICAgICB2YXIgc3RhcnRDaGFyID0gbGluZS5jaGFyQXQoc3RhcnQpO1xuICAgICAgICB2YXIgY2hlY2sgPSBpc1dvcmRDaGFyKHN0YXJ0Q2hhciwgaGVscGVyKVxuICAgICAgICAgID8gZnVuY3Rpb24gKGNoKSB7IHJldHVybiBpc1dvcmRDaGFyKGNoLCBoZWxwZXIpOyB9XG4gICAgICAgICAgOiAvXFxzLy50ZXN0KHN0YXJ0Q2hhcikgPyBmdW5jdGlvbiAoY2gpIHsgcmV0dXJuIC9cXHMvLnRlc3QoY2gpOyB9XG4gICAgICAgICAgOiBmdW5jdGlvbiAoY2gpIHsgcmV0dXJuICghL1xccy8udGVzdChjaCkgJiYgIWlzV29yZENoYXIoY2gpKTsgfTtcbiAgICAgICAgd2hpbGUgKHN0YXJ0ID4gMCAmJiBjaGVjayhsaW5lLmNoYXJBdChzdGFydCAtIDEpKSkgeyAtLXN0YXJ0OyB9XG4gICAgICAgIHdoaWxlIChlbmQgPCBsaW5lLmxlbmd0aCAmJiBjaGVjayhsaW5lLmNoYXJBdChlbmQpKSkgeyArK2VuZDsgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIG5ldyBSYW5nZShQb3MocG9zLmxpbmUsIHN0YXJ0KSwgUG9zKHBvcy5saW5lLCBlbmQpKVxuICAgIH0sXG5cbiAgICB0b2dnbGVPdmVyd3JpdGU6IGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICBpZiAodmFsdWUgIT0gbnVsbCAmJiB2YWx1ZSA9PSB0aGlzLnN0YXRlLm92ZXJ3cml0ZSkgeyByZXR1cm4gfVxuICAgICAgaWYgKHRoaXMuc3RhdGUub3ZlcndyaXRlID0gIXRoaXMuc3RhdGUub3ZlcndyaXRlKVxuICAgICAgICB7IGFkZENsYXNzKHRoaXMuZGlzcGxheS5jdXJzb3JEaXYsIFwiQ29kZU1pcnJvci1vdmVyd3JpdGVcIik7IH1cbiAgICAgIGVsc2VcbiAgICAgICAgeyBybUNsYXNzKHRoaXMuZGlzcGxheS5jdXJzb3JEaXYsIFwiQ29kZU1pcnJvci1vdmVyd3JpdGVcIik7IH1cblxuICAgICAgc2lnbmFsKHRoaXMsIFwib3ZlcndyaXRlVG9nZ2xlXCIsIHRoaXMsIHRoaXMuc3RhdGUub3ZlcndyaXRlKTtcbiAgICB9LFxuICAgIGhhc0ZvY3VzOiBmdW5jdGlvbigpIHsgcmV0dXJuIHRoaXMuZGlzcGxheS5pbnB1dC5nZXRGaWVsZCgpID09IGFjdGl2ZUVsdCgpIH0sXG4gICAgaXNSZWFkT25seTogZnVuY3Rpb24oKSB7IHJldHVybiAhISh0aGlzLm9wdGlvbnMucmVhZE9ubHkgfHwgdGhpcy5kb2MuY2FudEVkaXQpIH0sXG5cbiAgICBzY3JvbGxUbzogbWV0aG9kT3AoZnVuY3Rpb24gKHgsIHkpIHsgc2Nyb2xsVG9Db29yZHModGhpcywgeCwgeSk7IH0pLFxuICAgIGdldFNjcm9sbEluZm86IGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIHNjcm9sbGVyID0gdGhpcy5kaXNwbGF5LnNjcm9sbGVyO1xuICAgICAgcmV0dXJuIHtsZWZ0OiBzY3JvbGxlci5zY3JvbGxMZWZ0LCB0b3A6IHNjcm9sbGVyLnNjcm9sbFRvcCxcbiAgICAgICAgICAgICAgaGVpZ2h0OiBzY3JvbGxlci5zY3JvbGxIZWlnaHQgLSBzY3JvbGxHYXAodGhpcykgLSB0aGlzLmRpc3BsYXkuYmFySGVpZ2h0LFxuICAgICAgICAgICAgICB3aWR0aDogc2Nyb2xsZXIuc2Nyb2xsV2lkdGggLSBzY3JvbGxHYXAodGhpcykgLSB0aGlzLmRpc3BsYXkuYmFyV2lkdGgsXG4gICAgICAgICAgICAgIGNsaWVudEhlaWdodDogZGlzcGxheUhlaWdodCh0aGlzKSwgY2xpZW50V2lkdGg6IGRpc3BsYXlXaWR0aCh0aGlzKX1cbiAgICB9LFxuXG4gICAgc2Nyb2xsSW50b1ZpZXc6IG1ldGhvZE9wKGZ1bmN0aW9uKHJhbmdlJCQxLCBtYXJnaW4pIHtcbiAgICAgIGlmIChyYW5nZSQkMSA9PSBudWxsKSB7XG4gICAgICAgIHJhbmdlJCQxID0ge2Zyb206IHRoaXMuZG9jLnNlbC5wcmltYXJ5KCkuaGVhZCwgdG86IG51bGx9O1xuICAgICAgICBpZiAobWFyZ2luID09IG51bGwpIHsgbWFyZ2luID0gdGhpcy5vcHRpb25zLmN1cnNvclNjcm9sbE1hcmdpbjsgfVxuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgcmFuZ2UkJDEgPT0gXCJudW1iZXJcIikge1xuICAgICAgICByYW5nZSQkMSA9IHtmcm9tOiBQb3MocmFuZ2UkJDEsIDApLCB0bzogbnVsbH07XG4gICAgICB9IGVsc2UgaWYgKHJhbmdlJCQxLmZyb20gPT0gbnVsbCkge1xuICAgICAgICByYW5nZSQkMSA9IHtmcm9tOiByYW5nZSQkMSwgdG86IG51bGx9O1xuICAgICAgfVxuICAgICAgaWYgKCFyYW5nZSQkMS50bykgeyByYW5nZSQkMS50byA9IHJhbmdlJCQxLmZyb207IH1cbiAgICAgIHJhbmdlJCQxLm1hcmdpbiA9IG1hcmdpbiB8fCAwO1xuXG4gICAgICBpZiAocmFuZ2UkJDEuZnJvbS5saW5lICE9IG51bGwpIHtcbiAgICAgICAgc2Nyb2xsVG9SYW5nZSh0aGlzLCByYW5nZSQkMSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzY3JvbGxUb0Nvb3Jkc1JhbmdlKHRoaXMsIHJhbmdlJCQxLmZyb20sIHJhbmdlJCQxLnRvLCByYW5nZSQkMS5tYXJnaW4pO1xuICAgICAgfVxuICAgIH0pLFxuXG4gICAgc2V0U2l6ZTogbWV0aG9kT3AoZnVuY3Rpb24od2lkdGgsIGhlaWdodCkge1xuICAgICAgdmFyIHRoaXMkMSA9IHRoaXM7XG5cbiAgICAgIHZhciBpbnRlcnByZXQgPSBmdW5jdGlvbiAodmFsKSB7IHJldHVybiB0eXBlb2YgdmFsID09IFwibnVtYmVyXCIgfHwgL15cXGQrJC8udGVzdChTdHJpbmcodmFsKSkgPyB2YWwgKyBcInB4XCIgOiB2YWw7IH07XG4gICAgICBpZiAod2lkdGggIT0gbnVsbCkgeyB0aGlzLmRpc3BsYXkud3JhcHBlci5zdHlsZS53aWR0aCA9IGludGVycHJldCh3aWR0aCk7IH1cbiAgICAgIGlmIChoZWlnaHQgIT0gbnVsbCkgeyB0aGlzLmRpc3BsYXkud3JhcHBlci5zdHlsZS5oZWlnaHQgPSBpbnRlcnByZXQoaGVpZ2h0KTsgfVxuICAgICAgaWYgKHRoaXMub3B0aW9ucy5saW5lV3JhcHBpbmcpIHsgY2xlYXJMaW5lTWVhc3VyZW1lbnRDYWNoZSh0aGlzKTsgfVxuICAgICAgdmFyIGxpbmVObyQkMSA9IHRoaXMuZGlzcGxheS52aWV3RnJvbTtcbiAgICAgIHRoaXMuZG9jLml0ZXIobGluZU5vJCQxLCB0aGlzLmRpc3BsYXkudmlld1RvLCBmdW5jdGlvbiAobGluZSkge1xuICAgICAgICBpZiAobGluZS53aWRnZXRzKSB7IGZvciAodmFyIGkgPSAwOyBpIDwgbGluZS53aWRnZXRzLmxlbmd0aDsgaSsrKVxuICAgICAgICAgIHsgaWYgKGxpbmUud2lkZ2V0c1tpXS5ub0hTY3JvbGwpIHsgcmVnTGluZUNoYW5nZSh0aGlzJDEsIGxpbmVObyQkMSwgXCJ3aWRnZXRcIik7IGJyZWFrIH0gfSB9XG4gICAgICAgICsrbGluZU5vJCQxO1xuICAgICAgfSk7XG4gICAgICB0aGlzLmN1ck9wLmZvcmNlVXBkYXRlID0gdHJ1ZTtcbiAgICAgIHNpZ25hbCh0aGlzLCBcInJlZnJlc2hcIiwgdGhpcyk7XG4gICAgfSksXG5cbiAgICBvcGVyYXRpb246IGZ1bmN0aW9uKGYpe3JldHVybiBydW5Jbk9wKHRoaXMsIGYpfSxcbiAgICBzdGFydE9wZXJhdGlvbjogZnVuY3Rpb24oKXtyZXR1cm4gc3RhcnRPcGVyYXRpb24odGhpcyl9LFxuICAgIGVuZE9wZXJhdGlvbjogZnVuY3Rpb24oKXtyZXR1cm4gZW5kT3BlcmF0aW9uKHRoaXMpfSxcblxuICAgIHJlZnJlc2g6IG1ldGhvZE9wKGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIG9sZEhlaWdodCA9IHRoaXMuZGlzcGxheS5jYWNoZWRUZXh0SGVpZ2h0O1xuICAgICAgcmVnQ2hhbmdlKHRoaXMpO1xuICAgICAgdGhpcy5jdXJPcC5mb3JjZVVwZGF0ZSA9IHRydWU7XG4gICAgICBjbGVhckNhY2hlcyh0aGlzKTtcbiAgICAgIHNjcm9sbFRvQ29vcmRzKHRoaXMsIHRoaXMuZG9jLnNjcm9sbExlZnQsIHRoaXMuZG9jLnNjcm9sbFRvcCk7XG4gICAgICB1cGRhdGVHdXR0ZXJTcGFjZSh0aGlzKTtcbiAgICAgIGlmIChvbGRIZWlnaHQgPT0gbnVsbCB8fCBNYXRoLmFicyhvbGRIZWlnaHQgLSB0ZXh0SGVpZ2h0KHRoaXMuZGlzcGxheSkpID4gLjUpXG4gICAgICAgIHsgZXN0aW1hdGVMaW5lSGVpZ2h0cyh0aGlzKTsgfVxuICAgICAgc2lnbmFsKHRoaXMsIFwicmVmcmVzaFwiLCB0aGlzKTtcbiAgICB9KSxcblxuICAgIHN3YXBEb2M6IG1ldGhvZE9wKGZ1bmN0aW9uKGRvYykge1xuICAgICAgdmFyIG9sZCA9IHRoaXMuZG9jO1xuICAgICAgb2xkLmNtID0gbnVsbDtcbiAgICAgIGF0dGFjaERvYyh0aGlzLCBkb2MpO1xuICAgICAgY2xlYXJDYWNoZXModGhpcyk7XG4gICAgICB0aGlzLmRpc3BsYXkuaW5wdXQucmVzZXQoKTtcbiAgICAgIHNjcm9sbFRvQ29vcmRzKHRoaXMsIGRvYy5zY3JvbGxMZWZ0LCBkb2Muc2Nyb2xsVG9wKTtcbiAgICAgIHRoaXMuY3VyT3AuZm9yY2VTY3JvbGwgPSB0cnVlO1xuICAgICAgc2lnbmFsTGF0ZXIodGhpcywgXCJzd2FwRG9jXCIsIHRoaXMsIG9sZCk7XG4gICAgICByZXR1cm4gb2xkXG4gICAgfSksXG5cbiAgICBnZXRJbnB1dEZpZWxkOiBmdW5jdGlvbigpe3JldHVybiB0aGlzLmRpc3BsYXkuaW5wdXQuZ2V0RmllbGQoKX0sXG4gICAgZ2V0V3JhcHBlckVsZW1lbnQ6IGZ1bmN0aW9uKCl7cmV0dXJuIHRoaXMuZGlzcGxheS53cmFwcGVyfSxcbiAgICBnZXRTY3JvbGxlckVsZW1lbnQ6IGZ1bmN0aW9uKCl7cmV0dXJuIHRoaXMuZGlzcGxheS5zY3JvbGxlcn0sXG4gICAgZ2V0R3V0dGVyRWxlbWVudDogZnVuY3Rpb24oKXtyZXR1cm4gdGhpcy5kaXNwbGF5Lmd1dHRlcnN9XG4gIH07XG4gIGV2ZW50TWl4aW4oQ29kZU1pcnJvcik7XG5cbiAgQ29kZU1pcnJvci5yZWdpc3RlckhlbHBlciA9IGZ1bmN0aW9uKHR5cGUsIG5hbWUsIHZhbHVlKSB7XG4gICAgaWYgKCFoZWxwZXJzLmhhc093blByb3BlcnR5KHR5cGUpKSB7IGhlbHBlcnNbdHlwZV0gPSBDb2RlTWlycm9yW3R5cGVdID0ge19nbG9iYWw6IFtdfTsgfVxuICAgIGhlbHBlcnNbdHlwZV1bbmFtZV0gPSB2YWx1ZTtcbiAgfTtcbiAgQ29kZU1pcnJvci5yZWdpc3Rlckdsb2JhbEhlbHBlciA9IGZ1bmN0aW9uKHR5cGUsIG5hbWUsIHByZWRpY2F0ZSwgdmFsdWUpIHtcbiAgICBDb2RlTWlycm9yLnJlZ2lzdGVySGVscGVyKHR5cGUsIG5hbWUsIHZhbHVlKTtcbiAgICBoZWxwZXJzW3R5cGVdLl9nbG9iYWwucHVzaCh7cHJlZDogcHJlZGljYXRlLCB2YWw6IHZhbHVlfSk7XG4gIH07XG59O1xuXG4vLyBVc2VkIGZvciBob3Jpem9udGFsIHJlbGF0aXZlIG1vdGlvbi4gRGlyIGlzIC0xIG9yIDEgKGxlZnQgb3Jcbi8vIHJpZ2h0KSwgdW5pdCBjYW4gYmUgXCJjaGFyXCIsIFwiY29sdW1uXCIgKGxpa2UgY2hhciwgYnV0IGRvZXNuJ3Rcbi8vIGNyb3NzIGxpbmUgYm91bmRhcmllcyksIFwid29yZFwiIChhY3Jvc3MgbmV4dCB3b3JkKSwgb3IgXCJncm91cFwiICh0b1xuLy8gdGhlIHN0YXJ0IG9mIG5leHQgZ3JvdXAgb2Ygd29yZCBvciBub24td29yZC1ub24td2hpdGVzcGFjZVxuLy8gY2hhcnMpLiBUaGUgdmlzdWFsbHkgcGFyYW0gY29udHJvbHMgd2hldGhlciwgaW4gcmlnaHQtdG8tbGVmdFxuLy8gdGV4dCwgZGlyZWN0aW9uIDEgbWVhbnMgdG8gbW92ZSB0b3dhcmRzIHRoZSBuZXh0IGluZGV4IGluIHRoZVxuLy8gc3RyaW5nLCBvciB0b3dhcmRzIHRoZSBjaGFyYWN0ZXIgdG8gdGhlIHJpZ2h0IG9mIHRoZSBjdXJyZW50XG4vLyBwb3NpdGlvbi4gVGhlIHJlc3VsdGluZyBwb3NpdGlvbiB3aWxsIGhhdmUgYSBoaXRTaWRlPXRydWVcbi8vIHByb3BlcnR5IGlmIGl0IHJlYWNoZWQgdGhlIGVuZCBvZiB0aGUgZG9jdW1lbnQuXG5mdW5jdGlvbiBmaW5kUG9zSChkb2MsIHBvcywgZGlyLCB1bml0LCB2aXN1YWxseSkge1xuICB2YXIgb2xkUG9zID0gcG9zO1xuICB2YXIgb3JpZ0RpciA9IGRpcjtcbiAgdmFyIGxpbmVPYmogPSBnZXRMaW5lKGRvYywgcG9zLmxpbmUpO1xuICBmdW5jdGlvbiBmaW5kTmV4dExpbmUoKSB7XG4gICAgdmFyIGwgPSBwb3MubGluZSArIGRpcjtcbiAgICBpZiAobCA8IGRvYy5maXJzdCB8fCBsID49IGRvYy5maXJzdCArIGRvYy5zaXplKSB7IHJldHVybiBmYWxzZSB9XG4gICAgcG9zID0gbmV3IFBvcyhsLCBwb3MuY2gsIHBvcy5zdGlja3kpO1xuICAgIHJldHVybiBsaW5lT2JqID0gZ2V0TGluZShkb2MsIGwpXG4gIH1cbiAgZnVuY3Rpb24gbW92ZU9uY2UoYm91bmRUb0xpbmUpIHtcbiAgICB2YXIgbmV4dDtcbiAgICBpZiAodmlzdWFsbHkpIHtcbiAgICAgIG5leHQgPSBtb3ZlVmlzdWFsbHkoZG9jLmNtLCBsaW5lT2JqLCBwb3MsIGRpcik7XG4gICAgfSBlbHNlIHtcbiAgICAgIG5leHQgPSBtb3ZlTG9naWNhbGx5KGxpbmVPYmosIHBvcywgZGlyKTtcbiAgICB9XG4gICAgaWYgKG5leHQgPT0gbnVsbCkge1xuICAgICAgaWYgKCFib3VuZFRvTGluZSAmJiBmaW5kTmV4dExpbmUoKSlcbiAgICAgICAgeyBwb3MgPSBlbmRPZkxpbmUodmlzdWFsbHksIGRvYy5jbSwgbGluZU9iaiwgcG9zLmxpbmUsIGRpcik7IH1cbiAgICAgIGVsc2VcbiAgICAgICAgeyByZXR1cm4gZmFsc2UgfVxuICAgIH0gZWxzZSB7XG4gICAgICBwb3MgPSBuZXh0O1xuICAgIH1cbiAgICByZXR1cm4gdHJ1ZVxuICB9XG5cbiAgaWYgKHVuaXQgPT0gXCJjaGFyXCIpIHtcbiAgICBtb3ZlT25jZSgpO1xuICB9IGVsc2UgaWYgKHVuaXQgPT0gXCJjb2x1bW5cIikge1xuICAgIG1vdmVPbmNlKHRydWUpO1xuICB9IGVsc2UgaWYgKHVuaXQgPT0gXCJ3b3JkXCIgfHwgdW5pdCA9PSBcImdyb3VwXCIpIHtcbiAgICB2YXIgc2F3VHlwZSA9IG51bGwsIGdyb3VwID0gdW5pdCA9PSBcImdyb3VwXCI7XG4gICAgdmFyIGhlbHBlciA9IGRvYy5jbSAmJiBkb2MuY20uZ2V0SGVscGVyKHBvcywgXCJ3b3JkQ2hhcnNcIik7XG4gICAgZm9yICh2YXIgZmlyc3QgPSB0cnVlOzsgZmlyc3QgPSBmYWxzZSkge1xuICAgICAgaWYgKGRpciA8IDAgJiYgIW1vdmVPbmNlKCFmaXJzdCkpIHsgYnJlYWsgfVxuICAgICAgdmFyIGN1ciA9IGxpbmVPYmoudGV4dC5jaGFyQXQocG9zLmNoKSB8fCBcIlxcblwiO1xuICAgICAgdmFyIHR5cGUgPSBpc1dvcmRDaGFyKGN1ciwgaGVscGVyKSA/IFwid1wiXG4gICAgICAgIDogZ3JvdXAgJiYgY3VyID09IFwiXFxuXCIgPyBcIm5cIlxuICAgICAgICA6ICFncm91cCB8fCAvXFxzLy50ZXN0KGN1cikgPyBudWxsXG4gICAgICAgIDogXCJwXCI7XG4gICAgICBpZiAoZ3JvdXAgJiYgIWZpcnN0ICYmICF0eXBlKSB7IHR5cGUgPSBcInNcIjsgfVxuICAgICAgaWYgKHNhd1R5cGUgJiYgc2F3VHlwZSAhPSB0eXBlKSB7XG4gICAgICAgIGlmIChkaXIgPCAwKSB7ZGlyID0gMTsgbW92ZU9uY2UoKTsgcG9zLnN0aWNreSA9IFwiYWZ0ZXJcIjt9XG4gICAgICAgIGJyZWFrXG4gICAgICB9XG5cbiAgICAgIGlmICh0eXBlKSB7IHNhd1R5cGUgPSB0eXBlOyB9XG4gICAgICBpZiAoZGlyID4gMCAmJiAhbW92ZU9uY2UoIWZpcnN0KSkgeyBicmVhayB9XG4gICAgfVxuICB9XG4gIHZhciByZXN1bHQgPSBza2lwQXRvbWljKGRvYywgcG9zLCBvbGRQb3MsIG9yaWdEaXIsIHRydWUpO1xuICBpZiAoZXF1YWxDdXJzb3JQb3Mob2xkUG9zLCByZXN1bHQpKSB7IHJlc3VsdC5oaXRTaWRlID0gdHJ1ZTsgfVxuICByZXR1cm4gcmVzdWx0XG59XG5cbi8vIEZvciByZWxhdGl2ZSB2ZXJ0aWNhbCBtb3ZlbWVudC4gRGlyIG1heSBiZSAtMSBvciAxLiBVbml0IGNhbiBiZVxuLy8gXCJwYWdlXCIgb3IgXCJsaW5lXCIuIFRoZSByZXN1bHRpbmcgcG9zaXRpb24gd2lsbCBoYXZlIGEgaGl0U2lkZT10cnVlXG4vLyBwcm9wZXJ0eSBpZiBpdCByZWFjaGVkIHRoZSBlbmQgb2YgdGhlIGRvY3VtZW50LlxuZnVuY3Rpb24gZmluZFBvc1YoY20sIHBvcywgZGlyLCB1bml0KSB7XG4gIHZhciBkb2MgPSBjbS5kb2MsIHggPSBwb3MubGVmdCwgeTtcbiAgaWYgKHVuaXQgPT0gXCJwYWdlXCIpIHtcbiAgICB2YXIgcGFnZVNpemUgPSBNYXRoLm1pbihjbS5kaXNwbGF5LndyYXBwZXIuY2xpZW50SGVpZ2h0LCB3aW5kb3cuaW5uZXJIZWlnaHQgfHwgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LmNsaWVudEhlaWdodCk7XG4gICAgdmFyIG1vdmVBbW91bnQgPSBNYXRoLm1heChwYWdlU2l6ZSAtIC41ICogdGV4dEhlaWdodChjbS5kaXNwbGF5KSwgMyk7XG4gICAgeSA9IChkaXIgPiAwID8gcG9zLmJvdHRvbSA6IHBvcy50b3ApICsgZGlyICogbW92ZUFtb3VudDtcblxuICB9IGVsc2UgaWYgKHVuaXQgPT0gXCJsaW5lXCIpIHtcbiAgICB5ID0gZGlyID4gMCA/IHBvcy5ib3R0b20gKyAzIDogcG9zLnRvcCAtIDM7XG4gIH1cbiAgdmFyIHRhcmdldDtcbiAgZm9yICg7Oykge1xuICAgIHRhcmdldCA9IGNvb3Jkc0NoYXIoY20sIHgsIHkpO1xuICAgIGlmICghdGFyZ2V0Lm91dHNpZGUpIHsgYnJlYWsgfVxuICAgIGlmIChkaXIgPCAwID8geSA8PSAwIDogeSA+PSBkb2MuaGVpZ2h0KSB7IHRhcmdldC5oaXRTaWRlID0gdHJ1ZTsgYnJlYWsgfVxuICAgIHkgKz0gZGlyICogNTtcbiAgfVxuICByZXR1cm4gdGFyZ2V0XG59XG5cbi8vIENPTlRFTlRFRElUQUJMRSBJTlBVVCBTVFlMRVxuXG52YXIgQ29udGVudEVkaXRhYmxlSW5wdXQgPSBmdW5jdGlvbihjbSkge1xuICB0aGlzLmNtID0gY207XG4gIHRoaXMubGFzdEFuY2hvck5vZGUgPSB0aGlzLmxhc3RBbmNob3JPZmZzZXQgPSB0aGlzLmxhc3RGb2N1c05vZGUgPSB0aGlzLmxhc3RGb2N1c09mZnNldCA9IG51bGw7XG4gIHRoaXMucG9sbGluZyA9IG5ldyBEZWxheWVkKCk7XG4gIHRoaXMuY29tcG9zaW5nID0gbnVsbDtcbiAgdGhpcy5ncmFjZVBlcmlvZCA9IGZhbHNlO1xuICB0aGlzLnJlYWRET01UaW1lb3V0ID0gbnVsbDtcbn07XG5cbkNvbnRlbnRFZGl0YWJsZUlucHV0LnByb3RvdHlwZS5pbml0ID0gZnVuY3Rpb24gKGRpc3BsYXkpIHtcbiAgICB2YXIgdGhpcyQxID0gdGhpcztcblxuICB2YXIgaW5wdXQgPSB0aGlzLCBjbSA9IGlucHV0LmNtO1xuICB2YXIgZGl2ID0gaW5wdXQuZGl2ID0gZGlzcGxheS5saW5lRGl2O1xuICBkaXNhYmxlQnJvd3Nlck1hZ2ljKGRpdiwgY20ub3B0aW9ucy5zcGVsbGNoZWNrKTtcblxuICBvbihkaXYsIFwicGFzdGVcIiwgZnVuY3Rpb24gKGUpIHtcbiAgICBpZiAoc2lnbmFsRE9NRXZlbnQoY20sIGUpIHx8IGhhbmRsZVBhc3RlKGUsIGNtKSkgeyByZXR1cm4gfVxuICAgIC8vIElFIGRvZXNuJ3QgZmlyZSBpbnB1dCBldmVudHMsIHNvIHdlIHNjaGVkdWxlIGEgcmVhZCBmb3IgdGhlIHBhc3RlZCBjb250ZW50IGluIHRoaXMgd2F5XG4gICAgaWYgKGllX3ZlcnNpb24gPD0gMTEpIHsgc2V0VGltZW91dChvcGVyYXRpb24oY20sIGZ1bmN0aW9uICgpIHsgcmV0dXJuIHRoaXMkMS51cGRhdGVGcm9tRE9NKCk7IH0pLCAyMCk7IH1cbiAgfSk7XG5cbiAgb24oZGl2LCBcImNvbXBvc2l0aW9uc3RhcnRcIiwgZnVuY3Rpb24gKGUpIHtcbiAgICB0aGlzJDEuY29tcG9zaW5nID0ge2RhdGE6IGUuZGF0YSwgZG9uZTogZmFsc2V9O1xuICB9KTtcbiAgb24oZGl2LCBcImNvbXBvc2l0aW9udXBkYXRlXCIsIGZ1bmN0aW9uIChlKSB7XG4gICAgaWYgKCF0aGlzJDEuY29tcG9zaW5nKSB7IHRoaXMkMS5jb21wb3NpbmcgPSB7ZGF0YTogZS5kYXRhLCBkb25lOiBmYWxzZX07IH1cbiAgfSk7XG4gIG9uKGRpdiwgXCJjb21wb3NpdGlvbmVuZFwiLCBmdW5jdGlvbiAoZSkge1xuICAgIGlmICh0aGlzJDEuY29tcG9zaW5nKSB7XG4gICAgICBpZiAoZS5kYXRhICE9IHRoaXMkMS5jb21wb3NpbmcuZGF0YSkgeyB0aGlzJDEucmVhZEZyb21ET01Tb29uKCk7IH1cbiAgICAgIHRoaXMkMS5jb21wb3NpbmcuZG9uZSA9IHRydWU7XG4gICAgfVxuICB9KTtcblxuICBvbihkaXYsIFwidG91Y2hzdGFydFwiLCBmdW5jdGlvbiAoKSB7IHJldHVybiBpbnB1dC5mb3JjZUNvbXBvc2l0aW9uRW5kKCk7IH0pO1xuXG4gIG9uKGRpdiwgXCJpbnB1dFwiLCBmdW5jdGlvbiAoKSB7XG4gICAgaWYgKCF0aGlzJDEuY29tcG9zaW5nKSB7IHRoaXMkMS5yZWFkRnJvbURPTVNvb24oKTsgfVxuICB9KTtcblxuICBmdW5jdGlvbiBvbkNvcHlDdXQoZSkge1xuICAgIGlmIChzaWduYWxET01FdmVudChjbSwgZSkpIHsgcmV0dXJuIH1cbiAgICBpZiAoY20uc29tZXRoaW5nU2VsZWN0ZWQoKSkge1xuICAgICAgc2V0TGFzdENvcGllZCh7bGluZVdpc2U6IGZhbHNlLCB0ZXh0OiBjbS5nZXRTZWxlY3Rpb25zKCl9KTtcbiAgICAgIGlmIChlLnR5cGUgPT0gXCJjdXRcIikgeyBjbS5yZXBsYWNlU2VsZWN0aW9uKFwiXCIsIG51bGwsIFwiY3V0XCIpOyB9XG4gICAgfSBlbHNlIGlmICghY20ub3B0aW9ucy5saW5lV2lzZUNvcHlDdXQpIHtcbiAgICAgIHJldHVyblxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgcmFuZ2VzID0gY29weWFibGVSYW5nZXMoY20pO1xuICAgICAgc2V0TGFzdENvcGllZCh7bGluZVdpc2U6IHRydWUsIHRleHQ6IHJhbmdlcy50ZXh0fSk7XG4gICAgICBpZiAoZS50eXBlID09IFwiY3V0XCIpIHtcbiAgICAgICAgY20ub3BlcmF0aW9uKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBjbS5zZXRTZWxlY3Rpb25zKHJhbmdlcy5yYW5nZXMsIDAsIHNlbF9kb250U2Nyb2xsKTtcbiAgICAgICAgICBjbS5yZXBsYWNlU2VsZWN0aW9uKFwiXCIsIG51bGwsIFwiY3V0XCIpO1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKGUuY2xpcGJvYXJkRGF0YSkge1xuICAgICAgZS5jbGlwYm9hcmREYXRhLmNsZWFyRGF0YSgpO1xuICAgICAgdmFyIGNvbnRlbnQgPSBsYXN0Q29waWVkLnRleHQuam9pbihcIlxcblwiKTtcbiAgICAgIC8vIGlPUyBleHBvc2VzIHRoZSBjbGlwYm9hcmQgQVBJLCBidXQgc2VlbXMgdG8gZGlzY2FyZCBjb250ZW50IGluc2VydGVkIGludG8gaXRcbiAgICAgIGUuY2xpcGJvYXJkRGF0YS5zZXREYXRhKFwiVGV4dFwiLCBjb250ZW50KTtcbiAgICAgIGlmIChlLmNsaXBib2FyZERhdGEuZ2V0RGF0YShcIlRleHRcIikgPT0gY29udGVudCkge1xuICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuICAgIH1cbiAgICAvLyBPbGQtZmFzaGlvbmVkIGJyaWVmbHktZm9jdXMtYS10ZXh0YXJlYSBoYWNrXG4gICAgdmFyIGtsdWRnZSA9IGhpZGRlblRleHRhcmVhKCksIHRlID0ga2x1ZGdlLmZpcnN0Q2hpbGQ7XG4gICAgY20uZGlzcGxheS5saW5lU3BhY2UuaW5zZXJ0QmVmb3JlKGtsdWRnZSwgY20uZGlzcGxheS5saW5lU3BhY2UuZmlyc3RDaGlsZCk7XG4gICAgdGUudmFsdWUgPSBsYXN0Q29waWVkLnRleHQuam9pbihcIlxcblwiKTtcbiAgICB2YXIgaGFkRm9jdXMgPSBkb2N1bWVudC5hY3RpdmVFbGVtZW50O1xuICAgIHNlbGVjdElucHV0KHRlKTtcbiAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgIGNtLmRpc3BsYXkubGluZVNwYWNlLnJlbW92ZUNoaWxkKGtsdWRnZSk7XG4gICAgICBoYWRGb2N1cy5mb2N1cygpO1xuICAgICAgaWYgKGhhZEZvY3VzID09IGRpdikgeyBpbnB1dC5zaG93UHJpbWFyeVNlbGVjdGlvbigpOyB9XG4gICAgfSwgNTApO1xuICB9XG4gIG9uKGRpdiwgXCJjb3B5XCIsIG9uQ29weUN1dCk7XG4gIG9uKGRpdiwgXCJjdXRcIiwgb25Db3B5Q3V0KTtcbn07XG5cbkNvbnRlbnRFZGl0YWJsZUlucHV0LnByb3RvdHlwZS5wcmVwYXJlU2VsZWN0aW9uID0gZnVuY3Rpb24gKCkge1xuICB2YXIgcmVzdWx0ID0gcHJlcGFyZVNlbGVjdGlvbih0aGlzLmNtLCBmYWxzZSk7XG4gIHJlc3VsdC5mb2N1cyA9IHRoaXMuY20uc3RhdGUuZm9jdXNlZDtcbiAgcmV0dXJuIHJlc3VsdFxufTtcblxuQ29udGVudEVkaXRhYmxlSW5wdXQucHJvdG90eXBlLnNob3dTZWxlY3Rpb24gPSBmdW5jdGlvbiAoaW5mbywgdGFrZUZvY3VzKSB7XG4gIGlmICghaW5mbyB8fCAhdGhpcy5jbS5kaXNwbGF5LnZpZXcubGVuZ3RoKSB7IHJldHVybiB9XG4gIGlmIChpbmZvLmZvY3VzIHx8IHRha2VGb2N1cykgeyB0aGlzLnNob3dQcmltYXJ5U2VsZWN0aW9uKCk7IH1cbiAgdGhpcy5zaG93TXVsdGlwbGVTZWxlY3Rpb25zKGluZm8pO1xufTtcblxuQ29udGVudEVkaXRhYmxlSW5wdXQucHJvdG90eXBlLmdldFNlbGVjdGlvbiA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIHRoaXMuY20uZGlzcGxheS53cmFwcGVyLm93bmVyRG9jdW1lbnQuZ2V0U2VsZWN0aW9uKClcbn07XG5cbkNvbnRlbnRFZGl0YWJsZUlucHV0LnByb3RvdHlwZS5zaG93UHJpbWFyeVNlbGVjdGlvbiA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIHNlbCA9IHRoaXMuZ2V0U2VsZWN0aW9uKCksIGNtID0gdGhpcy5jbSwgcHJpbSA9IGNtLmRvYy5zZWwucHJpbWFyeSgpO1xuICB2YXIgZnJvbSA9IHByaW0uZnJvbSgpLCB0byA9IHByaW0udG8oKTtcblxuICBpZiAoY20uZGlzcGxheS52aWV3VG8gPT0gY20uZGlzcGxheS52aWV3RnJvbSB8fCBmcm9tLmxpbmUgPj0gY20uZGlzcGxheS52aWV3VG8gfHwgdG8ubGluZSA8IGNtLmRpc3BsYXkudmlld0Zyb20pIHtcbiAgICBzZWwucmVtb3ZlQWxsUmFuZ2VzKCk7XG4gICAgcmV0dXJuXG4gIH1cblxuICB2YXIgY3VyQW5jaG9yID0gZG9tVG9Qb3MoY20sIHNlbC5hbmNob3JOb2RlLCBzZWwuYW5jaG9yT2Zmc2V0KTtcbiAgdmFyIGN1ckZvY3VzID0gZG9tVG9Qb3MoY20sIHNlbC5mb2N1c05vZGUsIHNlbC5mb2N1c09mZnNldCk7XG4gIGlmIChjdXJBbmNob3IgJiYgIWN1ckFuY2hvci5iYWQgJiYgY3VyRm9jdXMgJiYgIWN1ckZvY3VzLmJhZCAmJlxuICAgICAgY21wKG1pblBvcyhjdXJBbmNob3IsIGN1ckZvY3VzKSwgZnJvbSkgPT0gMCAmJlxuICAgICAgY21wKG1heFBvcyhjdXJBbmNob3IsIGN1ckZvY3VzKSwgdG8pID09IDApXG4gICAgeyByZXR1cm4gfVxuXG4gIHZhciB2aWV3ID0gY20uZGlzcGxheS52aWV3O1xuICB2YXIgc3RhcnQgPSAoZnJvbS5saW5lID49IGNtLmRpc3BsYXkudmlld0Zyb20gJiYgcG9zVG9ET00oY20sIGZyb20pKSB8fFxuICAgICAge25vZGU6IHZpZXdbMF0ubWVhc3VyZS5tYXBbMl0sIG9mZnNldDogMH07XG4gIHZhciBlbmQgPSB0by5saW5lIDwgY20uZGlzcGxheS52aWV3VG8gJiYgcG9zVG9ET00oY20sIHRvKTtcbiAgaWYgKCFlbmQpIHtcbiAgICB2YXIgbWVhc3VyZSA9IHZpZXdbdmlldy5sZW5ndGggLSAxXS5tZWFzdXJlO1xuICAgIHZhciBtYXAkJDEgPSBtZWFzdXJlLm1hcHMgPyBtZWFzdXJlLm1hcHNbbWVhc3VyZS5tYXBzLmxlbmd0aCAtIDFdIDogbWVhc3VyZS5tYXA7XG4gICAgZW5kID0ge25vZGU6IG1hcCQkMVttYXAkJDEubGVuZ3RoIC0gMV0sIG9mZnNldDogbWFwJCQxW21hcCQkMS5sZW5ndGggLSAyXSAtIG1hcCQkMVttYXAkJDEubGVuZ3RoIC0gM119O1xuICB9XG5cbiAgaWYgKCFzdGFydCB8fCAhZW5kKSB7XG4gICAgc2VsLnJlbW92ZUFsbFJhbmdlcygpO1xuICAgIHJldHVyblxuICB9XG5cbiAgdmFyIG9sZCA9IHNlbC5yYW5nZUNvdW50ICYmIHNlbC5nZXRSYW5nZUF0KDApLCBybmc7XG4gIHRyeSB7IHJuZyA9IHJhbmdlKHN0YXJ0Lm5vZGUsIHN0YXJ0Lm9mZnNldCwgZW5kLm9mZnNldCwgZW5kLm5vZGUpOyB9XG4gIGNhdGNoKGUpIHt9IC8vIE91ciBtb2RlbCBvZiB0aGUgRE9NIG1pZ2h0IGJlIG91dGRhdGVkLCBpbiB3aGljaCBjYXNlIHRoZSByYW5nZSB3ZSB0cnkgdG8gc2V0IGNhbiBiZSBpbXBvc3NpYmxlXG4gIGlmIChybmcpIHtcbiAgICBpZiAoIWdlY2tvICYmIGNtLnN0YXRlLmZvY3VzZWQpIHtcbiAgICAgIHNlbC5jb2xsYXBzZShzdGFydC5ub2RlLCBzdGFydC5vZmZzZXQpO1xuICAgICAgaWYgKCFybmcuY29sbGFwc2VkKSB7XG4gICAgICAgIHNlbC5yZW1vdmVBbGxSYW5nZXMoKTtcbiAgICAgICAgc2VsLmFkZFJhbmdlKHJuZyk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHNlbC5yZW1vdmVBbGxSYW5nZXMoKTtcbiAgICAgIHNlbC5hZGRSYW5nZShybmcpO1xuICAgIH1cbiAgICBpZiAob2xkICYmIHNlbC5hbmNob3JOb2RlID09IG51bGwpIHsgc2VsLmFkZFJhbmdlKG9sZCk7IH1cbiAgICBlbHNlIGlmIChnZWNrbykgeyB0aGlzLnN0YXJ0R3JhY2VQZXJpb2QoKTsgfVxuICB9XG4gIHRoaXMucmVtZW1iZXJTZWxlY3Rpb24oKTtcbn07XG5cbkNvbnRlbnRFZGl0YWJsZUlucHV0LnByb3RvdHlwZS5zdGFydEdyYWNlUGVyaW9kID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciB0aGlzJDEgPSB0aGlzO1xuXG4gIGNsZWFyVGltZW91dCh0aGlzLmdyYWNlUGVyaW9kKTtcbiAgdGhpcy5ncmFjZVBlcmlvZCA9IHNldFRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgIHRoaXMkMS5ncmFjZVBlcmlvZCA9IGZhbHNlO1xuICAgIGlmICh0aGlzJDEuc2VsZWN0aW9uQ2hhbmdlZCgpKVxuICAgICAgeyB0aGlzJDEuY20ub3BlcmF0aW9uKGZ1bmN0aW9uICgpIHsgcmV0dXJuIHRoaXMkMS5jbS5jdXJPcC5zZWxlY3Rpb25DaGFuZ2VkID0gdHJ1ZTsgfSk7IH1cbiAgfSwgMjApO1xufTtcblxuQ29udGVudEVkaXRhYmxlSW5wdXQucHJvdG90eXBlLnNob3dNdWx0aXBsZVNlbGVjdGlvbnMgPSBmdW5jdGlvbiAoaW5mbykge1xuICByZW1vdmVDaGlsZHJlbkFuZEFkZCh0aGlzLmNtLmRpc3BsYXkuY3Vyc29yRGl2LCBpbmZvLmN1cnNvcnMpO1xuICByZW1vdmVDaGlsZHJlbkFuZEFkZCh0aGlzLmNtLmRpc3BsYXkuc2VsZWN0aW9uRGl2LCBpbmZvLnNlbGVjdGlvbik7XG59O1xuXG5Db250ZW50RWRpdGFibGVJbnB1dC5wcm90b3R5cGUucmVtZW1iZXJTZWxlY3Rpb24gPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBzZWwgPSB0aGlzLmdldFNlbGVjdGlvbigpO1xuICB0aGlzLmxhc3RBbmNob3JOb2RlID0gc2VsLmFuY2hvck5vZGU7IHRoaXMubGFzdEFuY2hvck9mZnNldCA9IHNlbC5hbmNob3JPZmZzZXQ7XG4gIHRoaXMubGFzdEZvY3VzTm9kZSA9IHNlbC5mb2N1c05vZGU7IHRoaXMubGFzdEZvY3VzT2Zmc2V0ID0gc2VsLmZvY3VzT2Zmc2V0O1xufTtcblxuQ29udGVudEVkaXRhYmxlSW5wdXQucHJvdG90eXBlLnNlbGVjdGlvbkluRWRpdG9yID0gZnVuY3Rpb24gKCkge1xuICB2YXIgc2VsID0gdGhpcy5nZXRTZWxlY3Rpb24oKTtcbiAgaWYgKCFzZWwucmFuZ2VDb3VudCkgeyByZXR1cm4gZmFsc2UgfVxuICB2YXIgbm9kZSA9IHNlbC5nZXRSYW5nZUF0KDApLmNvbW1vbkFuY2VzdG9yQ29udGFpbmVyO1xuICByZXR1cm4gY29udGFpbnModGhpcy5kaXYsIG5vZGUpXG59O1xuXG5Db250ZW50RWRpdGFibGVJbnB1dC5wcm90b3R5cGUuZm9jdXMgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmNtLm9wdGlvbnMucmVhZE9ubHkgIT0gXCJub2N1cnNvclwiKSB7XG4gICAgaWYgKCF0aGlzLnNlbGVjdGlvbkluRWRpdG9yKCkpXG4gICAgICB7IHRoaXMuc2hvd1NlbGVjdGlvbih0aGlzLnByZXBhcmVTZWxlY3Rpb24oKSwgdHJ1ZSk7IH1cbiAgICB0aGlzLmRpdi5mb2N1cygpO1xuICB9XG59O1xuQ29udGVudEVkaXRhYmxlSW5wdXQucHJvdG90eXBlLmJsdXIgPSBmdW5jdGlvbiAoKSB7IHRoaXMuZGl2LmJsdXIoKTsgfTtcbkNvbnRlbnRFZGl0YWJsZUlucHV0LnByb3RvdHlwZS5nZXRGaWVsZCA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuIHRoaXMuZGl2IH07XG5cbkNvbnRlbnRFZGl0YWJsZUlucHV0LnByb3RvdHlwZS5zdXBwb3J0c1RvdWNoID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gdHJ1ZSB9O1xuXG5Db250ZW50RWRpdGFibGVJbnB1dC5wcm90b3R5cGUucmVjZWl2ZWRGb2N1cyA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIGlucHV0ID0gdGhpcztcbiAgaWYgKHRoaXMuc2VsZWN0aW9uSW5FZGl0b3IoKSlcbiAgICB7IHRoaXMucG9sbFNlbGVjdGlvbigpOyB9XG4gIGVsc2VcbiAgICB7IHJ1bkluT3AodGhpcy5jbSwgZnVuY3Rpb24gKCkgeyByZXR1cm4gaW5wdXQuY20uY3VyT3Auc2VsZWN0aW9uQ2hhbmdlZCA9IHRydWU7IH0pOyB9XG5cbiAgZnVuY3Rpb24gcG9sbCgpIHtcbiAgICBpZiAoaW5wdXQuY20uc3RhdGUuZm9jdXNlZCkge1xuICAgICAgaW5wdXQucG9sbFNlbGVjdGlvbigpO1xuICAgICAgaW5wdXQucG9sbGluZy5zZXQoaW5wdXQuY20ub3B0aW9ucy5wb2xsSW50ZXJ2YWwsIHBvbGwpO1xuICAgIH1cbiAgfVxuICB0aGlzLnBvbGxpbmcuc2V0KHRoaXMuY20ub3B0aW9ucy5wb2xsSW50ZXJ2YWwsIHBvbGwpO1xufTtcblxuQ29udGVudEVkaXRhYmxlSW5wdXQucHJvdG90eXBlLnNlbGVjdGlvbkNoYW5nZWQgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBzZWwgPSB0aGlzLmdldFNlbGVjdGlvbigpO1xuICByZXR1cm4gc2VsLmFuY2hvck5vZGUgIT0gdGhpcy5sYXN0QW5jaG9yTm9kZSB8fCBzZWwuYW5jaG9yT2Zmc2V0ICE9IHRoaXMubGFzdEFuY2hvck9mZnNldCB8fFxuICAgIHNlbC5mb2N1c05vZGUgIT0gdGhpcy5sYXN0Rm9jdXNOb2RlIHx8IHNlbC5mb2N1c09mZnNldCAhPSB0aGlzLmxhc3RGb2N1c09mZnNldFxufTtcblxuQ29udGVudEVkaXRhYmxlSW5wdXQucHJvdG90eXBlLnBvbGxTZWxlY3Rpb24gPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLnJlYWRET01UaW1lb3V0ICE9IG51bGwgfHwgdGhpcy5ncmFjZVBlcmlvZCB8fCAhdGhpcy5zZWxlY3Rpb25DaGFuZ2VkKCkpIHsgcmV0dXJuIH1cbiAgdmFyIHNlbCA9IHRoaXMuZ2V0U2VsZWN0aW9uKCksIGNtID0gdGhpcy5jbTtcbiAgLy8gT24gQW5kcm9pZCBDaHJvbWUgKHZlcnNpb24gNTYsIGF0IGxlYXN0KSwgYmFja3NwYWNpbmcgaW50byBhblxuICAvLyB1bmVkaXRhYmxlIGJsb2NrIGVsZW1lbnQgd2lsbCBwdXQgdGhlIGN1cnNvciBpbiB0aGF0IGVsZW1lbnQsXG4gIC8vIGFuZCB0aGVuLCBiZWNhdXNlIGl0J3Mgbm90IGVkaXRhYmxlLCBoaWRlIHRoZSB2aXJ0dWFsIGtleWJvYXJkLlxuICAvLyBCZWNhdXNlIEFuZHJvaWQgZG9lc24ndCBhbGxvdyB1cyB0byBhY3R1YWxseSBkZXRlY3QgYmFja3NwYWNlXG4gIC8vIHByZXNzZXMgaW4gYSBzYW5lIHdheSwgdGhpcyBjb2RlIGNoZWNrcyBmb3Igd2hlbiB0aGF0IGhhcHBlbnNcbiAgLy8gYW5kIHNpbXVsYXRlcyBhIGJhY2tzcGFjZSBwcmVzcyBpbiB0aGlzIGNhc2UuXG4gIGlmIChhbmRyb2lkICYmIGNocm9tZSAmJiB0aGlzLmNtLm9wdGlvbnMuZ3V0dGVycy5sZW5ndGggJiYgaXNJbkd1dHRlcihzZWwuYW5jaG9yTm9kZSkpIHtcbiAgICB0aGlzLmNtLnRyaWdnZXJPbktleURvd24oe3R5cGU6IFwia2V5ZG93blwiLCBrZXlDb2RlOiA4LCBwcmV2ZW50RGVmYXVsdDogTWF0aC5hYnN9KTtcbiAgICB0aGlzLmJsdXIoKTtcbiAgICB0aGlzLmZvY3VzKCk7XG4gICAgcmV0dXJuXG4gIH1cbiAgaWYgKHRoaXMuY29tcG9zaW5nKSB7IHJldHVybiB9XG4gIHRoaXMucmVtZW1iZXJTZWxlY3Rpb24oKTtcbiAgdmFyIGFuY2hvciA9IGRvbVRvUG9zKGNtLCBzZWwuYW5jaG9yTm9kZSwgc2VsLmFuY2hvck9mZnNldCk7XG4gIHZhciBoZWFkID0gZG9tVG9Qb3MoY20sIHNlbC5mb2N1c05vZGUsIHNlbC5mb2N1c09mZnNldCk7XG4gIGlmIChhbmNob3IgJiYgaGVhZCkgeyBydW5Jbk9wKGNtLCBmdW5jdGlvbiAoKSB7XG4gICAgc2V0U2VsZWN0aW9uKGNtLmRvYywgc2ltcGxlU2VsZWN0aW9uKGFuY2hvciwgaGVhZCksIHNlbF9kb250U2Nyb2xsKTtcbiAgICBpZiAoYW5jaG9yLmJhZCB8fCBoZWFkLmJhZCkgeyBjbS5jdXJPcC5zZWxlY3Rpb25DaGFuZ2VkID0gdHJ1ZTsgfVxuICB9KTsgfVxufTtcblxuQ29udGVudEVkaXRhYmxlSW5wdXQucHJvdG90eXBlLnBvbGxDb250ZW50ID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5yZWFkRE9NVGltZW91dCAhPSBudWxsKSB7XG4gICAgY2xlYXJUaW1lb3V0KHRoaXMucmVhZERPTVRpbWVvdXQpO1xuICAgIHRoaXMucmVhZERPTVRpbWVvdXQgPSBudWxsO1xuICB9XG5cbiAgdmFyIGNtID0gdGhpcy5jbSwgZGlzcGxheSA9IGNtLmRpc3BsYXksIHNlbCA9IGNtLmRvYy5zZWwucHJpbWFyeSgpO1xuICB2YXIgZnJvbSA9IHNlbC5mcm9tKCksIHRvID0gc2VsLnRvKCk7XG4gIGlmIChmcm9tLmNoID09IDAgJiYgZnJvbS5saW5lID4gY20uZmlyc3RMaW5lKCkpXG4gICAgeyBmcm9tID0gUG9zKGZyb20ubGluZSAtIDEsIGdldExpbmUoY20uZG9jLCBmcm9tLmxpbmUgLSAxKS5sZW5ndGgpOyB9XG4gIGlmICh0by5jaCA9PSBnZXRMaW5lKGNtLmRvYywgdG8ubGluZSkudGV4dC5sZW5ndGggJiYgdG8ubGluZSA8IGNtLmxhc3RMaW5lKCkpXG4gICAgeyB0byA9IFBvcyh0by5saW5lICsgMSwgMCk7IH1cbiAgaWYgKGZyb20ubGluZSA8IGRpc3BsYXkudmlld0Zyb20gfHwgdG8ubGluZSA+IGRpc3BsYXkudmlld1RvIC0gMSkgeyByZXR1cm4gZmFsc2UgfVxuXG4gIHZhciBmcm9tSW5kZXgsIGZyb21MaW5lLCBmcm9tTm9kZTtcbiAgaWYgKGZyb20ubGluZSA9PSBkaXNwbGF5LnZpZXdGcm9tIHx8IChmcm9tSW5kZXggPSBmaW5kVmlld0luZGV4KGNtLCBmcm9tLmxpbmUpKSA9PSAwKSB7XG4gICAgZnJvbUxpbmUgPSBsaW5lTm8oZGlzcGxheS52aWV3WzBdLmxpbmUpO1xuICAgIGZyb21Ob2RlID0gZGlzcGxheS52aWV3WzBdLm5vZGU7XG4gIH0gZWxzZSB7XG4gICAgZnJvbUxpbmUgPSBsaW5lTm8oZGlzcGxheS52aWV3W2Zyb21JbmRleF0ubGluZSk7XG4gICAgZnJvbU5vZGUgPSBkaXNwbGF5LnZpZXdbZnJvbUluZGV4IC0gMV0ubm9kZS5uZXh0U2libGluZztcbiAgfVxuICB2YXIgdG9JbmRleCA9IGZpbmRWaWV3SW5kZXgoY20sIHRvLmxpbmUpO1xuICB2YXIgdG9MaW5lLCB0b05vZGU7XG4gIGlmICh0b0luZGV4ID09IGRpc3BsYXkudmlldy5sZW5ndGggLSAxKSB7XG4gICAgdG9MaW5lID0gZGlzcGxheS52aWV3VG8gLSAxO1xuICAgIHRvTm9kZSA9IGRpc3BsYXkubGluZURpdi5sYXN0Q2hpbGQ7XG4gIH0gZWxzZSB7XG4gICAgdG9MaW5lID0gbGluZU5vKGRpc3BsYXkudmlld1t0b0luZGV4ICsgMV0ubGluZSkgLSAxO1xuICAgIHRvTm9kZSA9IGRpc3BsYXkudmlld1t0b0luZGV4ICsgMV0ubm9kZS5wcmV2aW91c1NpYmxpbmc7XG4gIH1cblxuICBpZiAoIWZyb21Ob2RlKSB7IHJldHVybiBmYWxzZSB9XG4gIHZhciBuZXdUZXh0ID0gY20uZG9jLnNwbGl0TGluZXMoZG9tVGV4dEJldHdlZW4oY20sIGZyb21Ob2RlLCB0b05vZGUsIGZyb21MaW5lLCB0b0xpbmUpKTtcbiAgdmFyIG9sZFRleHQgPSBnZXRCZXR3ZWVuKGNtLmRvYywgUG9zKGZyb21MaW5lLCAwKSwgUG9zKHRvTGluZSwgZ2V0TGluZShjbS5kb2MsIHRvTGluZSkudGV4dC5sZW5ndGgpKTtcbiAgd2hpbGUgKG5ld1RleHQubGVuZ3RoID4gMSAmJiBvbGRUZXh0Lmxlbmd0aCA+IDEpIHtcbiAgICBpZiAobHN0KG5ld1RleHQpID09IGxzdChvbGRUZXh0KSkgeyBuZXdUZXh0LnBvcCgpOyBvbGRUZXh0LnBvcCgpOyB0b0xpbmUtLTsgfVxuICAgIGVsc2UgaWYgKG5ld1RleHRbMF0gPT0gb2xkVGV4dFswXSkgeyBuZXdUZXh0LnNoaWZ0KCk7IG9sZFRleHQuc2hpZnQoKTsgZnJvbUxpbmUrKzsgfVxuICAgIGVsc2UgeyBicmVhayB9XG4gIH1cblxuICB2YXIgY3V0RnJvbnQgPSAwLCBjdXRFbmQgPSAwO1xuICB2YXIgbmV3VG9wID0gbmV3VGV4dFswXSwgb2xkVG9wID0gb2xkVGV4dFswXSwgbWF4Q3V0RnJvbnQgPSBNYXRoLm1pbihuZXdUb3AubGVuZ3RoLCBvbGRUb3AubGVuZ3RoKTtcbiAgd2hpbGUgKGN1dEZyb250IDwgbWF4Q3V0RnJvbnQgJiYgbmV3VG9wLmNoYXJDb2RlQXQoY3V0RnJvbnQpID09IG9sZFRvcC5jaGFyQ29kZUF0KGN1dEZyb250KSlcbiAgICB7ICsrY3V0RnJvbnQ7IH1cbiAgdmFyIG5ld0JvdCA9IGxzdChuZXdUZXh0KSwgb2xkQm90ID0gbHN0KG9sZFRleHQpO1xuICB2YXIgbWF4Q3V0RW5kID0gTWF0aC5taW4obmV3Qm90Lmxlbmd0aCAtIChuZXdUZXh0Lmxlbmd0aCA9PSAxID8gY3V0RnJvbnQgOiAwKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIG9sZEJvdC5sZW5ndGggLSAob2xkVGV4dC5sZW5ndGggPT0gMSA/IGN1dEZyb250IDogMCkpO1xuICB3aGlsZSAoY3V0RW5kIDwgbWF4Q3V0RW5kICYmXG4gICAgICAgICBuZXdCb3QuY2hhckNvZGVBdChuZXdCb3QubGVuZ3RoIC0gY3V0RW5kIC0gMSkgPT0gb2xkQm90LmNoYXJDb2RlQXQob2xkQm90Lmxlbmd0aCAtIGN1dEVuZCAtIDEpKVxuICAgIHsgKytjdXRFbmQ7IH1cbiAgLy8gVHJ5IHRvIG1vdmUgc3RhcnQgb2YgY2hhbmdlIHRvIHN0YXJ0IG9mIHNlbGVjdGlvbiBpZiBhbWJpZ3VvdXNcbiAgaWYgKG5ld1RleHQubGVuZ3RoID09IDEgJiYgb2xkVGV4dC5sZW5ndGggPT0gMSAmJiBmcm9tTGluZSA9PSBmcm9tLmxpbmUpIHtcbiAgICB3aGlsZSAoY3V0RnJvbnQgJiYgY3V0RnJvbnQgPiBmcm9tLmNoICYmXG4gICAgICAgICAgIG5ld0JvdC5jaGFyQ29kZUF0KG5ld0JvdC5sZW5ndGggLSBjdXRFbmQgLSAxKSA9PSBvbGRCb3QuY2hhckNvZGVBdChvbGRCb3QubGVuZ3RoIC0gY3V0RW5kIC0gMSkpIHtcbiAgICAgIGN1dEZyb250LS07XG4gICAgICBjdXRFbmQrKztcbiAgICB9XG4gIH1cblxuICBuZXdUZXh0W25ld1RleHQubGVuZ3RoIC0gMV0gPSBuZXdCb3Quc2xpY2UoMCwgbmV3Qm90Lmxlbmd0aCAtIGN1dEVuZCkucmVwbGFjZSgvXlxcdTIwMGIrLywgXCJcIik7XG4gIG5ld1RleHRbMF0gPSBuZXdUZXh0WzBdLnNsaWNlKGN1dEZyb250KS5yZXBsYWNlKC9cXHUyMDBiKyQvLCBcIlwiKTtcblxuICB2YXIgY2hGcm9tID0gUG9zKGZyb21MaW5lLCBjdXRGcm9udCk7XG4gIHZhciBjaFRvID0gUG9zKHRvTGluZSwgb2xkVGV4dC5sZW5ndGggPyBsc3Qob2xkVGV4dCkubGVuZ3RoIC0gY3V0RW5kIDogMCk7XG4gIGlmIChuZXdUZXh0Lmxlbmd0aCA+IDEgfHwgbmV3VGV4dFswXSB8fCBjbXAoY2hGcm9tLCBjaFRvKSkge1xuICAgIHJlcGxhY2VSYW5nZShjbS5kb2MsIG5ld1RleHQsIGNoRnJvbSwgY2hUbywgXCIraW5wdXRcIik7XG4gICAgcmV0dXJuIHRydWVcbiAgfVxufTtcblxuQ29udGVudEVkaXRhYmxlSW5wdXQucHJvdG90eXBlLmVuc3VyZVBvbGxlZCA9IGZ1bmN0aW9uICgpIHtcbiAgdGhpcy5mb3JjZUNvbXBvc2l0aW9uRW5kKCk7XG59O1xuQ29udGVudEVkaXRhYmxlSW5wdXQucHJvdG90eXBlLnJlc2V0ID0gZnVuY3Rpb24gKCkge1xuICB0aGlzLmZvcmNlQ29tcG9zaXRpb25FbmQoKTtcbn07XG5Db250ZW50RWRpdGFibGVJbnB1dC5wcm90b3R5cGUuZm9yY2VDb21wb3NpdGlvbkVuZCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKCF0aGlzLmNvbXBvc2luZykgeyByZXR1cm4gfVxuICBjbGVhclRpbWVvdXQodGhpcy5yZWFkRE9NVGltZW91dCk7XG4gIHRoaXMuY29tcG9zaW5nID0gbnVsbDtcbiAgdGhpcy51cGRhdGVGcm9tRE9NKCk7XG4gIHRoaXMuZGl2LmJsdXIoKTtcbiAgdGhpcy5kaXYuZm9jdXMoKTtcbn07XG5Db250ZW50RWRpdGFibGVJbnB1dC5wcm90b3R5cGUucmVhZEZyb21ET01Tb29uID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciB0aGlzJDEgPSB0aGlzO1xuXG4gIGlmICh0aGlzLnJlYWRET01UaW1lb3V0ICE9IG51bGwpIHsgcmV0dXJuIH1cbiAgdGhpcy5yZWFkRE9NVGltZW91dCA9IHNldFRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgIHRoaXMkMS5yZWFkRE9NVGltZW91dCA9IG51bGw7XG4gICAgaWYgKHRoaXMkMS5jb21wb3NpbmcpIHtcbiAgICAgIGlmICh0aGlzJDEuY29tcG9zaW5nLmRvbmUpIHsgdGhpcyQxLmNvbXBvc2luZyA9IG51bGw7IH1cbiAgICAgIGVsc2UgeyByZXR1cm4gfVxuICAgIH1cbiAgICB0aGlzJDEudXBkYXRlRnJvbURPTSgpO1xuICB9LCA4MCk7XG59O1xuXG5Db250ZW50RWRpdGFibGVJbnB1dC5wcm90b3R5cGUudXBkYXRlRnJvbURPTSA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgdGhpcyQxID0gdGhpcztcblxuICBpZiAodGhpcy5jbS5pc1JlYWRPbmx5KCkgfHwgIXRoaXMucG9sbENvbnRlbnQoKSlcbiAgICB7IHJ1bkluT3AodGhpcy5jbSwgZnVuY3Rpb24gKCkgeyByZXR1cm4gcmVnQ2hhbmdlKHRoaXMkMS5jbSk7IH0pOyB9XG59O1xuXG5Db250ZW50RWRpdGFibGVJbnB1dC5wcm90b3R5cGUuc2V0VW5lZGl0YWJsZSA9IGZ1bmN0aW9uIChub2RlKSB7XG4gIG5vZGUuY29udGVudEVkaXRhYmxlID0gXCJmYWxzZVwiO1xufTtcblxuQ29udGVudEVkaXRhYmxlSW5wdXQucHJvdG90eXBlLm9uS2V5UHJlc3MgPSBmdW5jdGlvbiAoZSkge1xuICBpZiAoZS5jaGFyQ29kZSA9PSAwIHx8IHRoaXMuY29tcG9zaW5nKSB7IHJldHVybiB9XG4gIGUucHJldmVudERlZmF1bHQoKTtcbiAgaWYgKCF0aGlzLmNtLmlzUmVhZE9ubHkoKSlcbiAgICB7IG9wZXJhdGlvbih0aGlzLmNtLCBhcHBseVRleHRJbnB1dCkodGhpcy5jbSwgU3RyaW5nLmZyb21DaGFyQ29kZShlLmNoYXJDb2RlID09IG51bGwgPyBlLmtleUNvZGUgOiBlLmNoYXJDb2RlKSwgMCk7IH1cbn07XG5cbkNvbnRlbnRFZGl0YWJsZUlucHV0LnByb3RvdHlwZS5yZWFkT25seUNoYW5nZWQgPSBmdW5jdGlvbiAodmFsKSB7XG4gIHRoaXMuZGl2LmNvbnRlbnRFZGl0YWJsZSA9IFN0cmluZyh2YWwgIT0gXCJub2N1cnNvclwiKTtcbn07XG5cbkNvbnRlbnRFZGl0YWJsZUlucHV0LnByb3RvdHlwZS5vbkNvbnRleHRNZW51ID0gZnVuY3Rpb24gKCkge307XG5Db250ZW50RWRpdGFibGVJbnB1dC5wcm90b3R5cGUucmVzZXRQb3NpdGlvbiA9IGZ1bmN0aW9uICgpIHt9O1xuXG5Db250ZW50RWRpdGFibGVJbnB1dC5wcm90b3R5cGUubmVlZHNDb250ZW50QXR0cmlidXRlID0gdHJ1ZTtcblxuZnVuY3Rpb24gcG9zVG9ET00oY20sIHBvcykge1xuICB2YXIgdmlldyA9IGZpbmRWaWV3Rm9yTGluZShjbSwgcG9zLmxpbmUpO1xuICBpZiAoIXZpZXcgfHwgdmlldy5oaWRkZW4pIHsgcmV0dXJuIG51bGwgfVxuICB2YXIgbGluZSA9IGdldExpbmUoY20uZG9jLCBwb3MubGluZSk7XG4gIHZhciBpbmZvID0gbWFwRnJvbUxpbmVWaWV3KHZpZXcsIGxpbmUsIHBvcy5saW5lKTtcblxuICB2YXIgb3JkZXIgPSBnZXRPcmRlcihsaW5lLCBjbS5kb2MuZGlyZWN0aW9uKSwgc2lkZSA9IFwibGVmdFwiO1xuICBpZiAob3JkZXIpIHtcbiAgICB2YXIgcGFydFBvcyA9IGdldEJpZGlQYXJ0QXQob3JkZXIsIHBvcy5jaCk7XG4gICAgc2lkZSA9IHBhcnRQb3MgJSAyID8gXCJyaWdodFwiIDogXCJsZWZ0XCI7XG4gIH1cbiAgdmFyIHJlc3VsdCA9IG5vZGVBbmRPZmZzZXRJbkxpbmVNYXAoaW5mby5tYXAsIHBvcy5jaCwgc2lkZSk7XG4gIHJlc3VsdC5vZmZzZXQgPSByZXN1bHQuY29sbGFwc2UgPT0gXCJyaWdodFwiID8gcmVzdWx0LmVuZCA6IHJlc3VsdC5zdGFydDtcbiAgcmV0dXJuIHJlc3VsdFxufVxuXG5mdW5jdGlvbiBpc0luR3V0dGVyKG5vZGUpIHtcbiAgZm9yICh2YXIgc2NhbiA9IG5vZGU7IHNjYW47IHNjYW4gPSBzY2FuLnBhcmVudE5vZGUpXG4gICAgeyBpZiAoL0NvZGVNaXJyb3ItZ3V0dGVyLXdyYXBwZXIvLnRlc3Qoc2Nhbi5jbGFzc05hbWUpKSB7IHJldHVybiB0cnVlIH0gfVxuICByZXR1cm4gZmFsc2Vcbn1cblxuZnVuY3Rpb24gYmFkUG9zKHBvcywgYmFkKSB7IGlmIChiYWQpIHsgcG9zLmJhZCA9IHRydWU7IH0gcmV0dXJuIHBvcyB9XG5cbmZ1bmN0aW9uIGRvbVRleHRCZXR3ZWVuKGNtLCBmcm9tLCB0bywgZnJvbUxpbmUsIHRvTGluZSkge1xuICB2YXIgdGV4dCA9IFwiXCIsIGNsb3NpbmcgPSBmYWxzZSwgbGluZVNlcCA9IGNtLmRvYy5saW5lU2VwYXJhdG9yKCksIGV4dHJhTGluZWJyZWFrID0gZmFsc2U7XG4gIGZ1bmN0aW9uIHJlY29nbml6ZU1hcmtlcihpZCkgeyByZXR1cm4gZnVuY3Rpb24gKG1hcmtlcikgeyByZXR1cm4gbWFya2VyLmlkID09IGlkOyB9IH1cbiAgZnVuY3Rpb24gY2xvc2UoKSB7XG4gICAgaWYgKGNsb3NpbmcpIHtcbiAgICAgIHRleHQgKz0gbGluZVNlcDtcbiAgICAgIGlmIChleHRyYUxpbmVicmVhaykgeyB0ZXh0ICs9IGxpbmVTZXA7IH1cbiAgICAgIGNsb3NpbmcgPSBleHRyYUxpbmVicmVhayA9IGZhbHNlO1xuICAgIH1cbiAgfVxuICBmdW5jdGlvbiBhZGRUZXh0KHN0cikge1xuICAgIGlmIChzdHIpIHtcbiAgICAgIGNsb3NlKCk7XG4gICAgICB0ZXh0ICs9IHN0cjtcbiAgICB9XG4gIH1cbiAgZnVuY3Rpb24gd2Fsayhub2RlKSB7XG4gICAgaWYgKG5vZGUubm9kZVR5cGUgPT0gMSkge1xuICAgICAgdmFyIGNtVGV4dCA9IG5vZGUuZ2V0QXR0cmlidXRlKFwiY20tdGV4dFwiKTtcbiAgICAgIGlmIChjbVRleHQpIHtcbiAgICAgICAgYWRkVGV4dChjbVRleHQpO1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICAgIHZhciBtYXJrZXJJRCA9IG5vZGUuZ2V0QXR0cmlidXRlKFwiY20tbWFya2VyXCIpLCByYW5nZSQkMTtcbiAgICAgIGlmIChtYXJrZXJJRCkge1xuICAgICAgICB2YXIgZm91bmQgPSBjbS5maW5kTWFya3MoUG9zKGZyb21MaW5lLCAwKSwgUG9zKHRvTGluZSArIDEsIDApLCByZWNvZ25pemVNYXJrZXIoK21hcmtlcklEKSk7XG4gICAgICAgIGlmIChmb3VuZC5sZW5ndGggJiYgKHJhbmdlJCQxID0gZm91bmRbMF0uZmluZCgwKSkpXG4gICAgICAgICAgeyBhZGRUZXh0KGdldEJldHdlZW4oY20uZG9jLCByYW5nZSQkMS5mcm9tLCByYW5nZSQkMS50bykuam9pbihsaW5lU2VwKSk7IH1cbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG4gICAgICBpZiAobm9kZS5nZXRBdHRyaWJ1dGUoXCJjb250ZW50ZWRpdGFibGVcIikgPT0gXCJmYWxzZVwiKSB7IHJldHVybiB9XG4gICAgICB2YXIgaXNCbG9jayA9IC9eKHByZXxkaXZ8cHxsaXx0YWJsZXxicikkL2kudGVzdChub2RlLm5vZGVOYW1lKTtcbiAgICAgIGlmICghL15iciQvaS50ZXN0KG5vZGUubm9kZU5hbWUpICYmIG5vZGUudGV4dENvbnRlbnQubGVuZ3RoID09IDApIHsgcmV0dXJuIH1cblxuICAgICAgaWYgKGlzQmxvY2spIHsgY2xvc2UoKTsgfVxuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBub2RlLmNoaWxkTm9kZXMubGVuZ3RoOyBpKyspXG4gICAgICAgIHsgd2Fsayhub2RlLmNoaWxkTm9kZXNbaV0pOyB9XG5cbiAgICAgIGlmICgvXihwcmV8cCkkL2kudGVzdChub2RlLm5vZGVOYW1lKSkgeyBleHRyYUxpbmVicmVhayA9IHRydWU7IH1cbiAgICAgIGlmIChpc0Jsb2NrKSB7IGNsb3NpbmcgPSB0cnVlOyB9XG4gICAgfSBlbHNlIGlmIChub2RlLm5vZGVUeXBlID09IDMpIHtcbiAgICAgIGFkZFRleHQobm9kZS5ub2RlVmFsdWUucmVwbGFjZSgvXFx1MjAwYi9nLCBcIlwiKS5yZXBsYWNlKC9cXHUwMGEwL2csIFwiIFwiKSk7XG4gICAgfVxuICB9XG4gIGZvciAoOzspIHtcbiAgICB3YWxrKGZyb20pO1xuICAgIGlmIChmcm9tID09IHRvKSB7IGJyZWFrIH1cbiAgICBmcm9tID0gZnJvbS5uZXh0U2libGluZztcbiAgICBleHRyYUxpbmVicmVhayA9IGZhbHNlO1xuICB9XG4gIHJldHVybiB0ZXh0XG59XG5cbmZ1bmN0aW9uIGRvbVRvUG9zKGNtLCBub2RlLCBvZmZzZXQpIHtcbiAgdmFyIGxpbmVOb2RlO1xuICBpZiAobm9kZSA9PSBjbS5kaXNwbGF5LmxpbmVEaXYpIHtcbiAgICBsaW5lTm9kZSA9IGNtLmRpc3BsYXkubGluZURpdi5jaGlsZE5vZGVzW29mZnNldF07XG4gICAgaWYgKCFsaW5lTm9kZSkgeyByZXR1cm4gYmFkUG9zKGNtLmNsaXBQb3MoUG9zKGNtLmRpc3BsYXkudmlld1RvIC0gMSkpLCB0cnVlKSB9XG4gICAgbm9kZSA9IG51bGw7IG9mZnNldCA9IDA7XG4gIH0gZWxzZSB7XG4gICAgZm9yIChsaW5lTm9kZSA9IG5vZGU7OyBsaW5lTm9kZSA9IGxpbmVOb2RlLnBhcmVudE5vZGUpIHtcbiAgICAgIGlmICghbGluZU5vZGUgfHwgbGluZU5vZGUgPT0gY20uZGlzcGxheS5saW5lRGl2KSB7IHJldHVybiBudWxsIH1cbiAgICAgIGlmIChsaW5lTm9kZS5wYXJlbnROb2RlICYmIGxpbmVOb2RlLnBhcmVudE5vZGUgPT0gY20uZGlzcGxheS5saW5lRGl2KSB7IGJyZWFrIH1cbiAgICB9XG4gIH1cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBjbS5kaXNwbGF5LnZpZXcubGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgbGluZVZpZXcgPSBjbS5kaXNwbGF5LnZpZXdbaV07XG4gICAgaWYgKGxpbmVWaWV3Lm5vZGUgPT0gbGluZU5vZGUpXG4gICAgICB7IHJldHVybiBsb2NhdGVOb2RlSW5MaW5lVmlldyhsaW5lVmlldywgbm9kZSwgb2Zmc2V0KSB9XG4gIH1cbn1cblxuZnVuY3Rpb24gbG9jYXRlTm9kZUluTGluZVZpZXcobGluZVZpZXcsIG5vZGUsIG9mZnNldCkge1xuICB2YXIgd3JhcHBlciA9IGxpbmVWaWV3LnRleHQuZmlyc3RDaGlsZCwgYmFkID0gZmFsc2U7XG4gIGlmICghbm9kZSB8fCAhY29udGFpbnMod3JhcHBlciwgbm9kZSkpIHsgcmV0dXJuIGJhZFBvcyhQb3MobGluZU5vKGxpbmVWaWV3LmxpbmUpLCAwKSwgdHJ1ZSkgfVxuICBpZiAobm9kZSA9PSB3cmFwcGVyKSB7XG4gICAgYmFkID0gdHJ1ZTtcbiAgICBub2RlID0gd3JhcHBlci5jaGlsZE5vZGVzW29mZnNldF07XG4gICAgb2Zmc2V0ID0gMDtcbiAgICBpZiAoIW5vZGUpIHtcbiAgICAgIHZhciBsaW5lID0gbGluZVZpZXcucmVzdCA/IGxzdChsaW5lVmlldy5yZXN0KSA6IGxpbmVWaWV3LmxpbmU7XG4gICAgICByZXR1cm4gYmFkUG9zKFBvcyhsaW5lTm8obGluZSksIGxpbmUudGV4dC5sZW5ndGgpLCBiYWQpXG4gICAgfVxuICB9XG5cbiAgdmFyIHRleHROb2RlID0gbm9kZS5ub2RlVHlwZSA9PSAzID8gbm9kZSA6IG51bGwsIHRvcE5vZGUgPSBub2RlO1xuICBpZiAoIXRleHROb2RlICYmIG5vZGUuY2hpbGROb2Rlcy5sZW5ndGggPT0gMSAmJiBub2RlLmZpcnN0Q2hpbGQubm9kZVR5cGUgPT0gMykge1xuICAgIHRleHROb2RlID0gbm9kZS5maXJzdENoaWxkO1xuICAgIGlmIChvZmZzZXQpIHsgb2Zmc2V0ID0gdGV4dE5vZGUubm9kZVZhbHVlLmxlbmd0aDsgfVxuICB9XG4gIHdoaWxlICh0b3BOb2RlLnBhcmVudE5vZGUgIT0gd3JhcHBlcikgeyB0b3BOb2RlID0gdG9wTm9kZS5wYXJlbnROb2RlOyB9XG4gIHZhciBtZWFzdXJlID0gbGluZVZpZXcubWVhc3VyZSwgbWFwcyA9IG1lYXN1cmUubWFwcztcblxuICBmdW5jdGlvbiBmaW5kKHRleHROb2RlLCB0b3BOb2RlLCBvZmZzZXQpIHtcbiAgICBmb3IgKHZhciBpID0gLTE7IGkgPCAobWFwcyA/IG1hcHMubGVuZ3RoIDogMCk7IGkrKykge1xuICAgICAgdmFyIG1hcCQkMSA9IGkgPCAwID8gbWVhc3VyZS5tYXAgOiBtYXBzW2ldO1xuICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBtYXAkJDEubGVuZ3RoOyBqICs9IDMpIHtcbiAgICAgICAgdmFyIGN1ck5vZGUgPSBtYXAkJDFbaiArIDJdO1xuICAgICAgICBpZiAoY3VyTm9kZSA9PSB0ZXh0Tm9kZSB8fCBjdXJOb2RlID09IHRvcE5vZGUpIHtcbiAgICAgICAgICB2YXIgbGluZSA9IGxpbmVObyhpIDwgMCA/IGxpbmVWaWV3LmxpbmUgOiBsaW5lVmlldy5yZXN0W2ldKTtcbiAgICAgICAgICB2YXIgY2ggPSBtYXAkJDFbal0gKyBvZmZzZXQ7XG4gICAgICAgICAgaWYgKG9mZnNldCA8IDAgfHwgY3VyTm9kZSAhPSB0ZXh0Tm9kZSkgeyBjaCA9IG1hcCQkMVtqICsgKG9mZnNldCA/IDEgOiAwKV07IH1cbiAgICAgICAgICByZXR1cm4gUG9zKGxpbmUsIGNoKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHZhciBmb3VuZCA9IGZpbmQodGV4dE5vZGUsIHRvcE5vZGUsIG9mZnNldCk7XG4gIGlmIChmb3VuZCkgeyByZXR1cm4gYmFkUG9zKGZvdW5kLCBiYWQpIH1cblxuICAvLyBGSVhNRSB0aGlzIGlzIGFsbCByZWFsbHkgc2hha3kuIG1pZ2h0IGhhbmRsZSB0aGUgZmV3IGNhc2VzIGl0IG5lZWRzIHRvIGhhbmRsZSwgYnV0IGxpa2VseSB0byBjYXVzZSBwcm9ibGVtc1xuICBmb3IgKHZhciBhZnRlciA9IHRvcE5vZGUubmV4dFNpYmxpbmcsIGRpc3QgPSB0ZXh0Tm9kZSA/IHRleHROb2RlLm5vZGVWYWx1ZS5sZW5ndGggLSBvZmZzZXQgOiAwOyBhZnRlcjsgYWZ0ZXIgPSBhZnRlci5uZXh0U2libGluZykge1xuICAgIGZvdW5kID0gZmluZChhZnRlciwgYWZ0ZXIuZmlyc3RDaGlsZCwgMCk7XG4gICAgaWYgKGZvdW5kKVxuICAgICAgeyByZXR1cm4gYmFkUG9zKFBvcyhmb3VuZC5saW5lLCBmb3VuZC5jaCAtIGRpc3QpLCBiYWQpIH1cbiAgICBlbHNlXG4gICAgICB7IGRpc3QgKz0gYWZ0ZXIudGV4dENvbnRlbnQubGVuZ3RoOyB9XG4gIH1cbiAgZm9yICh2YXIgYmVmb3JlID0gdG9wTm9kZS5wcmV2aW91c1NpYmxpbmcsIGRpc3QkMSA9IG9mZnNldDsgYmVmb3JlOyBiZWZvcmUgPSBiZWZvcmUucHJldmlvdXNTaWJsaW5nKSB7XG4gICAgZm91bmQgPSBmaW5kKGJlZm9yZSwgYmVmb3JlLmZpcnN0Q2hpbGQsIC0xKTtcbiAgICBpZiAoZm91bmQpXG4gICAgICB7IHJldHVybiBiYWRQb3MoUG9zKGZvdW5kLmxpbmUsIGZvdW5kLmNoICsgZGlzdCQxKSwgYmFkKSB9XG4gICAgZWxzZVxuICAgICAgeyBkaXN0JDEgKz0gYmVmb3JlLnRleHRDb250ZW50Lmxlbmd0aDsgfVxuICB9XG59XG5cbi8vIFRFWFRBUkVBIElOUFVUIFNUWUxFXG5cbnZhciBUZXh0YXJlYUlucHV0ID0gZnVuY3Rpb24oY20pIHtcbiAgdGhpcy5jbSA9IGNtO1xuICAvLyBTZWUgaW5wdXQucG9sbCBhbmQgaW5wdXQucmVzZXRcbiAgdGhpcy5wcmV2SW5wdXQgPSBcIlwiO1xuXG4gIC8vIEZsYWcgdGhhdCBpbmRpY2F0ZXMgd2hldGhlciB3ZSBleHBlY3QgaW5wdXQgdG8gYXBwZWFyIHJlYWwgc29vblxuICAvLyBub3cgKGFmdGVyIHNvbWUgZXZlbnQgbGlrZSAna2V5cHJlc3MnIG9yICdpbnB1dCcpIGFuZCBhcmVcbiAgLy8gcG9sbGluZyBpbnRlbnNpdmVseS5cbiAgdGhpcy5wb2xsaW5nRmFzdCA9IGZhbHNlO1xuICAvLyBTZWxmLXJlc2V0dGluZyB0aW1lb3V0IGZvciB0aGUgcG9sbGVyXG4gIHRoaXMucG9sbGluZyA9IG5ldyBEZWxheWVkKCk7XG4gIC8vIFVzZWQgdG8gd29yayBhcm91bmQgSUUgaXNzdWUgd2l0aCBzZWxlY3Rpb24gYmVpbmcgZm9yZ290dGVuIHdoZW4gZm9jdXMgbW92ZXMgYXdheSBmcm9tIHRleHRhcmVhXG4gIHRoaXMuaGFzU2VsZWN0aW9uID0gZmFsc2U7XG4gIHRoaXMuY29tcG9zaW5nID0gbnVsbDtcbn07XG5cblRleHRhcmVhSW5wdXQucHJvdG90eXBlLmluaXQgPSBmdW5jdGlvbiAoZGlzcGxheSkge1xuICAgIHZhciB0aGlzJDEgPSB0aGlzO1xuXG4gIHZhciBpbnB1dCA9IHRoaXMsIGNtID0gdGhpcy5jbTtcbiAgdGhpcy5jcmVhdGVGaWVsZChkaXNwbGF5KTtcbiAgdmFyIHRlID0gdGhpcy50ZXh0YXJlYTtcblxuICBkaXNwbGF5LndyYXBwZXIuaW5zZXJ0QmVmb3JlKHRoaXMud3JhcHBlciwgZGlzcGxheS53cmFwcGVyLmZpcnN0Q2hpbGQpO1xuXG4gIC8vIE5lZWRlZCB0byBoaWRlIGJpZyBibHVlIGJsaW5raW5nIGN1cnNvciBvbiBNb2JpbGUgU2FmYXJpIChkb2Vzbid0IHNlZW0gdG8gd29yayBpbiBpT1MgOCBhbnltb3JlKVxuICBpZiAoaW9zKSB7IHRlLnN0eWxlLndpZHRoID0gXCIwcHhcIjsgfVxuXG4gIG9uKHRlLCBcImlucHV0XCIsIGZ1bmN0aW9uICgpIHtcbiAgICBpZiAoaWUgJiYgaWVfdmVyc2lvbiA+PSA5ICYmIHRoaXMkMS5oYXNTZWxlY3Rpb24pIHsgdGhpcyQxLmhhc1NlbGVjdGlvbiA9IG51bGw7IH1cbiAgICBpbnB1dC5wb2xsKCk7XG4gIH0pO1xuXG4gIG9uKHRlLCBcInBhc3RlXCIsIGZ1bmN0aW9uIChlKSB7XG4gICAgaWYgKHNpZ25hbERPTUV2ZW50KGNtLCBlKSB8fCBoYW5kbGVQYXN0ZShlLCBjbSkpIHsgcmV0dXJuIH1cblxuICAgIGNtLnN0YXRlLnBhc3RlSW5jb21pbmcgPSB0cnVlO1xuICAgIGlucHV0LmZhc3RQb2xsKCk7XG4gIH0pO1xuXG4gIGZ1bmN0aW9uIHByZXBhcmVDb3B5Q3V0KGUpIHtcbiAgICBpZiAoc2lnbmFsRE9NRXZlbnQoY20sIGUpKSB7IHJldHVybiB9XG4gICAgaWYgKGNtLnNvbWV0aGluZ1NlbGVjdGVkKCkpIHtcbiAgICAgIHNldExhc3RDb3BpZWQoe2xpbmVXaXNlOiBmYWxzZSwgdGV4dDogY20uZ2V0U2VsZWN0aW9ucygpfSk7XG4gICAgfSBlbHNlIGlmICghY20ub3B0aW9ucy5saW5lV2lzZUNvcHlDdXQpIHtcbiAgICAgIHJldHVyblxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgcmFuZ2VzID0gY29weWFibGVSYW5nZXMoY20pO1xuICAgICAgc2V0TGFzdENvcGllZCh7bGluZVdpc2U6IHRydWUsIHRleHQ6IHJhbmdlcy50ZXh0fSk7XG4gICAgICBpZiAoZS50eXBlID09IFwiY3V0XCIpIHtcbiAgICAgICAgY20uc2V0U2VsZWN0aW9ucyhyYW5nZXMucmFuZ2VzLCBudWxsLCBzZWxfZG9udFNjcm9sbCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpbnB1dC5wcmV2SW5wdXQgPSBcIlwiO1xuICAgICAgICB0ZS52YWx1ZSA9IHJhbmdlcy50ZXh0LmpvaW4oXCJcXG5cIik7XG4gICAgICAgIHNlbGVjdElucHV0KHRlKTtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKGUudHlwZSA9PSBcImN1dFwiKSB7IGNtLnN0YXRlLmN1dEluY29taW5nID0gdHJ1ZTsgfVxuICB9XG4gIG9uKHRlLCBcImN1dFwiLCBwcmVwYXJlQ29weUN1dCk7XG4gIG9uKHRlLCBcImNvcHlcIiwgcHJlcGFyZUNvcHlDdXQpO1xuXG4gIG9uKGRpc3BsYXkuc2Nyb2xsZXIsIFwicGFzdGVcIiwgZnVuY3Rpb24gKGUpIHtcbiAgICBpZiAoZXZlbnRJbldpZGdldChkaXNwbGF5LCBlKSB8fCBzaWduYWxET01FdmVudChjbSwgZSkpIHsgcmV0dXJuIH1cbiAgICBjbS5zdGF0ZS5wYXN0ZUluY29taW5nID0gdHJ1ZTtcbiAgICBpbnB1dC5mb2N1cygpO1xuICB9KTtcblxuICAvLyBQcmV2ZW50IG5vcm1hbCBzZWxlY3Rpb24gaW4gdGhlIGVkaXRvciAod2UgaGFuZGxlIG91ciBvd24pXG4gIG9uKGRpc3BsYXkubGluZVNwYWNlLCBcInNlbGVjdHN0YXJ0XCIsIGZ1bmN0aW9uIChlKSB7XG4gICAgaWYgKCFldmVudEluV2lkZ2V0KGRpc3BsYXksIGUpKSB7IGVfcHJldmVudERlZmF1bHQoZSk7IH1cbiAgfSk7XG5cbiAgb24odGUsIFwiY29tcG9zaXRpb25zdGFydFwiLCBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHN0YXJ0ID0gY20uZ2V0Q3Vyc29yKFwiZnJvbVwiKTtcbiAgICBpZiAoaW5wdXQuY29tcG9zaW5nKSB7IGlucHV0LmNvbXBvc2luZy5yYW5nZS5jbGVhcigpOyB9XG4gICAgaW5wdXQuY29tcG9zaW5nID0ge1xuICAgICAgc3RhcnQ6IHN0YXJ0LFxuICAgICAgcmFuZ2U6IGNtLm1hcmtUZXh0KHN0YXJ0LCBjbS5nZXRDdXJzb3IoXCJ0b1wiKSwge2NsYXNzTmFtZTogXCJDb2RlTWlycm9yLWNvbXBvc2luZ1wifSlcbiAgICB9O1xuICB9KTtcbiAgb24odGUsIFwiY29tcG9zaXRpb25lbmRcIiwgZnVuY3Rpb24gKCkge1xuICAgIGlmIChpbnB1dC5jb21wb3NpbmcpIHtcbiAgICAgIGlucHV0LnBvbGwoKTtcbiAgICAgIGlucHV0LmNvbXBvc2luZy5yYW5nZS5jbGVhcigpO1xuICAgICAgaW5wdXQuY29tcG9zaW5nID0gbnVsbDtcbiAgICB9XG4gIH0pO1xufTtcblxuVGV4dGFyZWFJbnB1dC5wcm90b3R5cGUuY3JlYXRlRmllbGQgPSBmdW5jdGlvbiAoX2Rpc3BsYXkpIHtcbiAgLy8gV3JhcHMgYW5kIGhpZGVzIGlucHV0IHRleHRhcmVhXG4gIHRoaXMud3JhcHBlciA9IGhpZGRlblRleHRhcmVhKCk7XG4gIC8vIFRoZSBzZW1paGlkZGVuIHRleHRhcmVhIHRoYXQgaXMgZm9jdXNlZCB3aGVuIHRoZSBlZGl0b3IgaXNcbiAgLy8gZm9jdXNlZCwgYW5kIHJlY2VpdmVzIGlucHV0LlxuICB0aGlzLnRleHRhcmVhID0gdGhpcy53cmFwcGVyLmZpcnN0Q2hpbGQ7XG59O1xuXG5UZXh0YXJlYUlucHV0LnByb3RvdHlwZS5wcmVwYXJlU2VsZWN0aW9uID0gZnVuY3Rpb24gKCkge1xuICAvLyBSZWRyYXcgdGhlIHNlbGVjdGlvbiBhbmQvb3IgY3Vyc29yXG4gIHZhciBjbSA9IHRoaXMuY20sIGRpc3BsYXkgPSBjbS5kaXNwbGF5LCBkb2MgPSBjbS5kb2M7XG4gIHZhciByZXN1bHQgPSBwcmVwYXJlU2VsZWN0aW9uKGNtKTtcblxuICAvLyBNb3ZlIHRoZSBoaWRkZW4gdGV4dGFyZWEgbmVhciB0aGUgY3Vyc29yIHRvIHByZXZlbnQgc2Nyb2xsaW5nIGFydGlmYWN0c1xuICBpZiAoY20ub3B0aW9ucy5tb3ZlSW5wdXRXaXRoQ3Vyc29yKSB7XG4gICAgdmFyIGhlYWRQb3MgPSBjdXJzb3JDb29yZHMoY20sIGRvYy5zZWwucHJpbWFyeSgpLmhlYWQsIFwiZGl2XCIpO1xuICAgIHZhciB3cmFwT2ZmID0gZGlzcGxheS53cmFwcGVyLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpLCBsaW5lT2ZmID0gZGlzcGxheS5saW5lRGl2LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICAgIHJlc3VsdC50ZVRvcCA9IE1hdGgubWF4KDAsIE1hdGgubWluKGRpc3BsYXkud3JhcHBlci5jbGllbnRIZWlnaHQgLSAxMCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBoZWFkUG9zLnRvcCArIGxpbmVPZmYudG9wIC0gd3JhcE9mZi50b3ApKTtcbiAgICByZXN1bHQudGVMZWZ0ID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oZGlzcGxheS53cmFwcGVyLmNsaWVudFdpZHRoIC0gMTAsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGhlYWRQb3MubGVmdCArIGxpbmVPZmYubGVmdCAtIHdyYXBPZmYubGVmdCkpO1xuICB9XG5cbiAgcmV0dXJuIHJlc3VsdFxufTtcblxuVGV4dGFyZWFJbnB1dC5wcm90b3R5cGUuc2hvd1NlbGVjdGlvbiA9IGZ1bmN0aW9uIChkcmF3bikge1xuICB2YXIgY20gPSB0aGlzLmNtLCBkaXNwbGF5ID0gY20uZGlzcGxheTtcbiAgcmVtb3ZlQ2hpbGRyZW5BbmRBZGQoZGlzcGxheS5jdXJzb3JEaXYsIGRyYXduLmN1cnNvcnMpO1xuICByZW1vdmVDaGlsZHJlbkFuZEFkZChkaXNwbGF5LnNlbGVjdGlvbkRpdiwgZHJhd24uc2VsZWN0aW9uKTtcbiAgaWYgKGRyYXduLnRlVG9wICE9IG51bGwpIHtcbiAgICB0aGlzLndyYXBwZXIuc3R5bGUudG9wID0gZHJhd24udGVUb3AgKyBcInB4XCI7XG4gICAgdGhpcy53cmFwcGVyLnN0eWxlLmxlZnQgPSBkcmF3bi50ZUxlZnQgKyBcInB4XCI7XG4gIH1cbn07XG5cbi8vIFJlc2V0IHRoZSBpbnB1dCB0byBjb3JyZXNwb25kIHRvIHRoZSBzZWxlY3Rpb24gKG9yIHRvIGJlIGVtcHR5LFxuLy8gd2hlbiBub3QgdHlwaW5nIGFuZCBub3RoaW5nIGlzIHNlbGVjdGVkKVxuVGV4dGFyZWFJbnB1dC5wcm90b3R5cGUucmVzZXQgPSBmdW5jdGlvbiAodHlwaW5nKSB7XG4gIGlmICh0aGlzLmNvbnRleHRNZW51UGVuZGluZyB8fCB0aGlzLmNvbXBvc2luZykgeyByZXR1cm4gfVxuICB2YXIgY20gPSB0aGlzLmNtO1xuICBpZiAoY20uc29tZXRoaW5nU2VsZWN0ZWQoKSkge1xuICAgIHRoaXMucHJldklucHV0ID0gXCJcIjtcbiAgICB2YXIgY29udGVudCA9IGNtLmdldFNlbGVjdGlvbigpO1xuICAgIHRoaXMudGV4dGFyZWEudmFsdWUgPSBjb250ZW50O1xuICAgIGlmIChjbS5zdGF0ZS5mb2N1c2VkKSB7IHNlbGVjdElucHV0KHRoaXMudGV4dGFyZWEpOyB9XG4gICAgaWYgKGllICYmIGllX3ZlcnNpb24gPj0gOSkgeyB0aGlzLmhhc1NlbGVjdGlvbiA9IGNvbnRlbnQ7IH1cbiAgfSBlbHNlIGlmICghdHlwaW5nKSB7XG4gICAgdGhpcy5wcmV2SW5wdXQgPSB0aGlzLnRleHRhcmVhLnZhbHVlID0gXCJcIjtcbiAgICBpZiAoaWUgJiYgaWVfdmVyc2lvbiA+PSA5KSB7IHRoaXMuaGFzU2VsZWN0aW9uID0gbnVsbDsgfVxuICB9XG59O1xuXG5UZXh0YXJlYUlucHV0LnByb3RvdHlwZS5nZXRGaWVsZCA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuIHRoaXMudGV4dGFyZWEgfTtcblxuVGV4dGFyZWFJbnB1dC5wcm90b3R5cGUuc3VwcG9ydHNUb3VjaCA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuIGZhbHNlIH07XG5cblRleHRhcmVhSW5wdXQucHJvdG90eXBlLmZvY3VzID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5jbS5vcHRpb25zLnJlYWRPbmx5ICE9IFwibm9jdXJzb3JcIiAmJiAoIW1vYmlsZSB8fCBhY3RpdmVFbHQoKSAhPSB0aGlzLnRleHRhcmVhKSkge1xuICAgIHRyeSB7IHRoaXMudGV4dGFyZWEuZm9jdXMoKTsgfVxuICAgIGNhdGNoIChlKSB7fSAvLyBJRTggd2lsbCB0aHJvdyBpZiB0aGUgdGV4dGFyZWEgaXMgZGlzcGxheTogbm9uZSBvciBub3QgaW4gRE9NXG4gIH1cbn07XG5cblRleHRhcmVhSW5wdXQucHJvdG90eXBlLmJsdXIgPSBmdW5jdGlvbiAoKSB7IHRoaXMudGV4dGFyZWEuYmx1cigpOyB9O1xuXG5UZXh0YXJlYUlucHV0LnByb3RvdHlwZS5yZXNldFBvc2l0aW9uID0gZnVuY3Rpb24gKCkge1xuICB0aGlzLndyYXBwZXIuc3R5bGUudG9wID0gdGhpcy53cmFwcGVyLnN0eWxlLmxlZnQgPSAwO1xufTtcblxuVGV4dGFyZWFJbnB1dC5wcm90b3R5cGUucmVjZWl2ZWRGb2N1cyA9IGZ1bmN0aW9uICgpIHsgdGhpcy5zbG93UG9sbCgpOyB9O1xuXG4vLyBQb2xsIGZvciBpbnB1dCBjaGFuZ2VzLCB1c2luZyB0aGUgbm9ybWFsIHJhdGUgb2YgcG9sbGluZy4gVGhpc1xuLy8gcnVucyBhcyBsb25nIGFzIHRoZSBlZGl0b3IgaXMgZm9jdXNlZC5cblRleHRhcmVhSW5wdXQucHJvdG90eXBlLnNsb3dQb2xsID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciB0aGlzJDEgPSB0aGlzO1xuXG4gIGlmICh0aGlzLnBvbGxpbmdGYXN0KSB7IHJldHVybiB9XG4gIHRoaXMucG9sbGluZy5zZXQodGhpcy5jbS5vcHRpb25zLnBvbGxJbnRlcnZhbCwgZnVuY3Rpb24gKCkge1xuICAgIHRoaXMkMS5wb2xsKCk7XG4gICAgaWYgKHRoaXMkMS5jbS5zdGF0ZS5mb2N1c2VkKSB7IHRoaXMkMS5zbG93UG9sbCgpOyB9XG4gIH0pO1xufTtcblxuLy8gV2hlbiBhbiBldmVudCBoYXMganVzdCBjb21lIGluIHRoYXQgaXMgbGlrZWx5IHRvIGFkZCBvciBjaGFuZ2Vcbi8vIHNvbWV0aGluZyBpbiB0aGUgaW5wdXQgdGV4dGFyZWEsIHdlIHBvbGwgZmFzdGVyLCB0byBlbnN1cmUgdGhhdFxuLy8gdGhlIGNoYW5nZSBhcHBlYXJzIG9uIHRoZSBzY3JlZW4gcXVpY2tseS5cblRleHRhcmVhSW5wdXQucHJvdG90eXBlLmZhc3RQb2xsID0gZnVuY3Rpb24gKCkge1xuICB2YXIgbWlzc2VkID0gZmFsc2UsIGlucHV0ID0gdGhpcztcbiAgaW5wdXQucG9sbGluZ0Zhc3QgPSB0cnVlO1xuICBmdW5jdGlvbiBwKCkge1xuICAgIHZhciBjaGFuZ2VkID0gaW5wdXQucG9sbCgpO1xuICAgIGlmICghY2hhbmdlZCAmJiAhbWlzc2VkKSB7bWlzc2VkID0gdHJ1ZTsgaW5wdXQucG9sbGluZy5zZXQoNjAsIHApO31cbiAgICBlbHNlIHtpbnB1dC5wb2xsaW5nRmFzdCA9IGZhbHNlOyBpbnB1dC5zbG93UG9sbCgpO31cbiAgfVxuICBpbnB1dC5wb2xsaW5nLnNldCgyMCwgcCk7XG59O1xuXG4vLyBSZWFkIGlucHV0IGZyb20gdGhlIHRleHRhcmVhLCBhbmQgdXBkYXRlIHRoZSBkb2N1bWVudCB0byBtYXRjaC5cbi8vIFdoZW4gc29tZXRoaW5nIGlzIHNlbGVjdGVkLCBpdCBpcyBwcmVzZW50IGluIHRoZSB0ZXh0YXJlYSwgYW5kXG4vLyBzZWxlY3RlZCAodW5sZXNzIGl0IGlzIGh1Z2UsIGluIHdoaWNoIGNhc2UgYSBwbGFjZWhvbGRlciBpc1xuLy8gdXNlZCkuIFdoZW4gbm90aGluZyBpcyBzZWxlY3RlZCwgdGhlIGN1cnNvciBzaXRzIGFmdGVyIHByZXZpb3VzbHlcbi8vIHNlZW4gdGV4dCAoY2FuIGJlIGVtcHR5KSwgd2hpY2ggaXMgc3RvcmVkIGluIHByZXZJbnB1dCAod2UgbXVzdFxuLy8gbm90IHJlc2V0IHRoZSB0ZXh0YXJlYSB3aGVuIHR5cGluZywgYmVjYXVzZSB0aGF0IGJyZWFrcyBJTUUpLlxuVGV4dGFyZWFJbnB1dC5wcm90b3R5cGUucG9sbCA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgdGhpcyQxID0gdGhpcztcblxuICB2YXIgY20gPSB0aGlzLmNtLCBpbnB1dCA9IHRoaXMudGV4dGFyZWEsIHByZXZJbnB1dCA9IHRoaXMucHJldklucHV0O1xuICAvLyBTaW5jZSB0aGlzIGlzIGNhbGxlZCBhICpsb3QqLCB0cnkgdG8gYmFpbCBvdXQgYXMgY2hlYXBseSBhc1xuICAvLyBwb3NzaWJsZSB3aGVuIGl0IGlzIGNsZWFyIHRoYXQgbm90aGluZyBoYXBwZW5lZC4gaGFzU2VsZWN0aW9uXG4gIC8vIHdpbGwgYmUgdGhlIGNhc2Ugd2hlbiB0aGVyZSBpcyBhIGxvdCBvZiB0ZXh0IGluIHRoZSB0ZXh0YXJlYSxcbiAgLy8gaW4gd2hpY2ggY2FzZSByZWFkaW5nIGl0cyB2YWx1ZSB3b3VsZCBiZSBleHBlbnNpdmUuXG4gIGlmICh0aGlzLmNvbnRleHRNZW51UGVuZGluZyB8fCAhY20uc3RhdGUuZm9jdXNlZCB8fFxuICAgICAgKGhhc1NlbGVjdGlvbihpbnB1dCkgJiYgIXByZXZJbnB1dCAmJiAhdGhpcy5jb21wb3NpbmcpIHx8XG4gICAgICBjbS5pc1JlYWRPbmx5KCkgfHwgY20ub3B0aW9ucy5kaXNhYmxlSW5wdXQgfHwgY20uc3RhdGUua2V5U2VxKVxuICAgIHsgcmV0dXJuIGZhbHNlIH1cblxuICB2YXIgdGV4dCA9IGlucHV0LnZhbHVlO1xuICAvLyBJZiBub3RoaW5nIGNoYW5nZWQsIGJhaWwuXG4gIGlmICh0ZXh0ID09IHByZXZJbnB1dCAmJiAhY20uc29tZXRoaW5nU2VsZWN0ZWQoKSkgeyByZXR1cm4gZmFsc2UgfVxuICAvLyBXb3JrIGFyb3VuZCBub25zZW5zaWNhbCBzZWxlY3Rpb24gcmVzZXR0aW5nIGluIElFOS8xMCwgYW5kXG4gIC8vIGluZXhwbGljYWJsZSBhcHBlYXJhbmNlIG9mIHByaXZhdGUgYXJlYSB1bmljb2RlIGNoYXJhY3RlcnMgb25cbiAgLy8gc29tZSBrZXkgY29tYm9zIGluIE1hYyAoIzI2ODkpLlxuICBpZiAoaWUgJiYgaWVfdmVyc2lvbiA+PSA5ICYmIHRoaXMuaGFzU2VsZWN0aW9uID09PSB0ZXh0IHx8XG4gICAgICBtYWMgJiYgL1tcXHVmNzAwLVxcdWY3ZmZdLy50ZXN0KHRleHQpKSB7XG4gICAgY20uZGlzcGxheS5pbnB1dC5yZXNldCgpO1xuICAgIHJldHVybiBmYWxzZVxuICB9XG5cbiAgaWYgKGNtLmRvYy5zZWwgPT0gY20uZGlzcGxheS5zZWxGb3JDb250ZXh0TWVudSkge1xuICAgIHZhciBmaXJzdCA9IHRleHQuY2hhckNvZGVBdCgwKTtcbiAgICBpZiAoZmlyc3QgPT0gMHgyMDBiICYmICFwcmV2SW5wdXQpIHsgcHJldklucHV0ID0gXCJcXHUyMDBiXCI7IH1cbiAgICBpZiAoZmlyc3QgPT0gMHgyMWRhKSB7IHRoaXMucmVzZXQoKTsgcmV0dXJuIHRoaXMuY20uZXhlY0NvbW1hbmQoXCJ1bmRvXCIpIH1cbiAgfVxuICAvLyBGaW5kIHRoZSBwYXJ0IG9mIHRoZSBpbnB1dCB0aGF0IGlzIGFjdHVhbGx5IG5ld1xuICB2YXIgc2FtZSA9IDAsIGwgPSBNYXRoLm1pbihwcmV2SW5wdXQubGVuZ3RoLCB0ZXh0Lmxlbmd0aCk7XG4gIHdoaWxlIChzYW1lIDwgbCAmJiBwcmV2SW5wdXQuY2hhckNvZGVBdChzYW1lKSA9PSB0ZXh0LmNoYXJDb2RlQXQoc2FtZSkpIHsgKytzYW1lOyB9XG5cbiAgcnVuSW5PcChjbSwgZnVuY3Rpb24gKCkge1xuICAgIGFwcGx5VGV4dElucHV0KGNtLCB0ZXh0LnNsaWNlKHNhbWUpLCBwcmV2SW5wdXQubGVuZ3RoIC0gc2FtZSxcbiAgICAgICAgICAgICAgICAgICBudWxsLCB0aGlzJDEuY29tcG9zaW5nID8gXCIqY29tcG9zZVwiIDogbnVsbCk7XG5cbiAgICAvLyBEb24ndCBsZWF2ZSBsb25nIHRleHQgaW4gdGhlIHRleHRhcmVhLCBzaW5jZSBpdCBtYWtlcyBmdXJ0aGVyIHBvbGxpbmcgc2xvd1xuICAgIGlmICh0ZXh0Lmxlbmd0aCA+IDEwMDAgfHwgdGV4dC5pbmRleE9mKFwiXFxuXCIpID4gLTEpIHsgaW5wdXQudmFsdWUgPSB0aGlzJDEucHJldklucHV0ID0gXCJcIjsgfVxuICAgIGVsc2UgeyB0aGlzJDEucHJldklucHV0ID0gdGV4dDsgfVxuXG4gICAgaWYgKHRoaXMkMS5jb21wb3NpbmcpIHtcbiAgICAgIHRoaXMkMS5jb21wb3NpbmcucmFuZ2UuY2xlYXIoKTtcbiAgICAgIHRoaXMkMS5jb21wb3NpbmcucmFuZ2UgPSBjbS5tYXJrVGV4dCh0aGlzJDEuY29tcG9zaW5nLnN0YXJ0LCBjbS5nZXRDdXJzb3IoXCJ0b1wiKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAge2NsYXNzTmFtZTogXCJDb2RlTWlycm9yLWNvbXBvc2luZ1wifSk7XG4gICAgfVxuICB9KTtcbiAgcmV0dXJuIHRydWVcbn07XG5cblRleHRhcmVhSW5wdXQucHJvdG90eXBlLmVuc3VyZVBvbGxlZCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMucG9sbGluZ0Zhc3QgJiYgdGhpcy5wb2xsKCkpIHsgdGhpcy5wb2xsaW5nRmFzdCA9IGZhbHNlOyB9XG59O1xuXG5UZXh0YXJlYUlucHV0LnByb3RvdHlwZS5vbktleVByZXNzID0gZnVuY3Rpb24gKCkge1xuICBpZiAoaWUgJiYgaWVfdmVyc2lvbiA+PSA5KSB7IHRoaXMuaGFzU2VsZWN0aW9uID0gbnVsbDsgfVxuICB0aGlzLmZhc3RQb2xsKCk7XG59O1xuXG5UZXh0YXJlYUlucHV0LnByb3RvdHlwZS5vbkNvbnRleHRNZW51ID0gZnVuY3Rpb24gKGUpIHtcbiAgdmFyIGlucHV0ID0gdGhpcywgY20gPSBpbnB1dC5jbSwgZGlzcGxheSA9IGNtLmRpc3BsYXksIHRlID0gaW5wdXQudGV4dGFyZWE7XG4gIHZhciBwb3MgPSBwb3NGcm9tTW91c2UoY20sIGUpLCBzY3JvbGxQb3MgPSBkaXNwbGF5LnNjcm9sbGVyLnNjcm9sbFRvcDtcbiAgaWYgKCFwb3MgfHwgcHJlc3RvKSB7IHJldHVybiB9IC8vIE9wZXJhIGlzIGRpZmZpY3VsdC5cblxuICAvLyBSZXNldCB0aGUgY3VycmVudCB0ZXh0IHNlbGVjdGlvbiBvbmx5IGlmIHRoZSBjbGljayBpcyBkb25lIG91dHNpZGUgb2YgdGhlIHNlbGVjdGlvblxuICAvLyBhbmQgJ3Jlc2V0U2VsZWN0aW9uT25Db250ZXh0TWVudScgb3B0aW9uIGlzIHRydWUuXG4gIHZhciByZXNldCA9IGNtLm9wdGlvbnMucmVzZXRTZWxlY3Rpb25PbkNvbnRleHRNZW51O1xuICBpZiAocmVzZXQgJiYgY20uZG9jLnNlbC5jb250YWlucyhwb3MpID09IC0xKVxuICAgIHsgb3BlcmF0aW9uKGNtLCBzZXRTZWxlY3Rpb24pKGNtLmRvYywgc2ltcGxlU2VsZWN0aW9uKHBvcyksIHNlbF9kb250U2Nyb2xsKTsgfVxuXG4gIHZhciBvbGRDU1MgPSB0ZS5zdHlsZS5jc3NUZXh0LCBvbGRXcmFwcGVyQ1NTID0gaW5wdXQud3JhcHBlci5zdHlsZS5jc3NUZXh0O1xuICBpbnB1dC53cmFwcGVyLnN0eWxlLmNzc1RleHQgPSBcInBvc2l0aW9uOiBhYnNvbHV0ZVwiO1xuICB2YXIgd3JhcHBlckJveCA9IGlucHV0LndyYXBwZXIuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG4gIHRlLnN0eWxlLmNzc1RleHQgPSBcInBvc2l0aW9uOiBhYnNvbHV0ZTsgd2lkdGg6IDMwcHg7IGhlaWdodDogMzBweDtcXG4gICAgICB0b3A6IFwiICsgKGUuY2xpZW50WSAtIHdyYXBwZXJCb3gudG9wIC0gNSkgKyBcInB4OyBsZWZ0OiBcIiArIChlLmNsaWVudFggLSB3cmFwcGVyQm94LmxlZnQgLSA1KSArIFwicHg7XFxuICAgICAgei1pbmRleDogMTAwMDsgYmFja2dyb3VuZDogXCIgKyAoaWUgPyBcInJnYmEoMjU1LCAyNTUsIDI1NSwgLjA1KVwiIDogXCJ0cmFuc3BhcmVudFwiKSArIFwiO1xcbiAgICAgIG91dGxpbmU6IG5vbmU7IGJvcmRlci13aWR0aDogMDsgb3V0bGluZTogbm9uZTsgb3ZlcmZsb3c6IGhpZGRlbjsgb3BhY2l0eTogLjA1OyBmaWx0ZXI6IGFscGhhKG9wYWNpdHk9NSk7XCI7XG4gIHZhciBvbGRTY3JvbGxZO1xuICBpZiAod2Via2l0KSB7IG9sZFNjcm9sbFkgPSB3aW5kb3cuc2Nyb2xsWTsgfSAvLyBXb3JrIGFyb3VuZCBDaHJvbWUgaXNzdWUgKCMyNzEyKVxuICBkaXNwbGF5LmlucHV0LmZvY3VzKCk7XG4gIGlmICh3ZWJraXQpIHsgd2luZG93LnNjcm9sbFRvKG51bGwsIG9sZFNjcm9sbFkpOyB9XG4gIGRpc3BsYXkuaW5wdXQucmVzZXQoKTtcbiAgLy8gQWRkcyBcIlNlbGVjdCBhbGxcIiB0byBjb250ZXh0IG1lbnUgaW4gRkZcbiAgaWYgKCFjbS5zb21ldGhpbmdTZWxlY3RlZCgpKSB7IHRlLnZhbHVlID0gaW5wdXQucHJldklucHV0ID0gXCIgXCI7IH1cbiAgaW5wdXQuY29udGV4dE1lbnVQZW5kaW5nID0gdHJ1ZTtcbiAgZGlzcGxheS5zZWxGb3JDb250ZXh0TWVudSA9IGNtLmRvYy5zZWw7XG4gIGNsZWFyVGltZW91dChkaXNwbGF5LmRldGVjdGluZ1NlbGVjdEFsbCk7XG5cbiAgLy8gU2VsZWN0LWFsbCB3aWxsIGJlIGdyZXllZCBvdXQgaWYgdGhlcmUncyBub3RoaW5nIHRvIHNlbGVjdCwgc29cbiAgLy8gdGhpcyBhZGRzIGEgemVyby13aWR0aCBzcGFjZSBzbyB0aGF0IHdlIGNhbiBsYXRlciBjaGVjayB3aGV0aGVyXG4gIC8vIGl0IGdvdCBzZWxlY3RlZC5cbiAgZnVuY3Rpb24gcHJlcGFyZVNlbGVjdEFsbEhhY2soKSB7XG4gICAgaWYgKHRlLnNlbGVjdGlvblN0YXJ0ICE9IG51bGwpIHtcbiAgICAgIHZhciBzZWxlY3RlZCA9IGNtLnNvbWV0aGluZ1NlbGVjdGVkKCk7XG4gICAgICB2YXIgZXh0dmFsID0gXCJcXHUyMDBiXCIgKyAoc2VsZWN0ZWQgPyB0ZS52YWx1ZSA6IFwiXCIpO1xuICAgICAgdGUudmFsdWUgPSBcIlxcdTIxZGFcIjsgLy8gVXNlZCB0byBjYXRjaCBjb250ZXh0LW1lbnUgdW5kb1xuICAgICAgdGUudmFsdWUgPSBleHR2YWw7XG4gICAgICBpbnB1dC5wcmV2SW5wdXQgPSBzZWxlY3RlZCA/IFwiXCIgOiBcIlxcdTIwMGJcIjtcbiAgICAgIHRlLnNlbGVjdGlvblN0YXJ0ID0gMTsgdGUuc2VsZWN0aW9uRW5kID0gZXh0dmFsLmxlbmd0aDtcbiAgICAgIC8vIFJlLXNldCB0aGlzLCBpbiBjYXNlIHNvbWUgb3RoZXIgaGFuZGxlciB0b3VjaGVkIHRoZVxuICAgICAgLy8gc2VsZWN0aW9uIGluIHRoZSBtZWFudGltZS5cbiAgICAgIGRpc3BsYXkuc2VsRm9yQ29udGV4dE1lbnUgPSBjbS5kb2Muc2VsO1xuICAgIH1cbiAgfVxuICBmdW5jdGlvbiByZWhpZGUoKSB7XG4gICAgaW5wdXQuY29udGV4dE1lbnVQZW5kaW5nID0gZmFsc2U7XG4gICAgaW5wdXQud3JhcHBlci5zdHlsZS5jc3NUZXh0ID0gb2xkV3JhcHBlckNTUztcbiAgICB0ZS5zdHlsZS5jc3NUZXh0ID0gb2xkQ1NTO1xuICAgIGlmIChpZSAmJiBpZV92ZXJzaW9uIDwgOSkgeyBkaXNwbGF5LnNjcm9sbGJhcnMuc2V0U2Nyb2xsVG9wKGRpc3BsYXkuc2Nyb2xsZXIuc2Nyb2xsVG9wID0gc2Nyb2xsUG9zKTsgfVxuXG4gICAgLy8gVHJ5IHRvIGRldGVjdCB0aGUgdXNlciBjaG9vc2luZyBzZWxlY3QtYWxsXG4gICAgaWYgKHRlLnNlbGVjdGlvblN0YXJ0ICE9IG51bGwpIHtcbiAgICAgIGlmICghaWUgfHwgKGllICYmIGllX3ZlcnNpb24gPCA5KSkgeyBwcmVwYXJlU2VsZWN0QWxsSGFjaygpOyB9XG4gICAgICB2YXIgaSA9IDAsIHBvbGwgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmIChkaXNwbGF5LnNlbEZvckNvbnRleHRNZW51ID09IGNtLmRvYy5zZWwgJiYgdGUuc2VsZWN0aW9uU3RhcnQgPT0gMCAmJlxuICAgICAgICAgICAgdGUuc2VsZWN0aW9uRW5kID4gMCAmJiBpbnB1dC5wcmV2SW5wdXQgPT0gXCJcXHUyMDBiXCIpIHtcbiAgICAgICAgICBvcGVyYXRpb24oY20sIHNlbGVjdEFsbCkoY20pO1xuICAgICAgICB9IGVsc2UgaWYgKGkrKyA8IDEwKSB7XG4gICAgICAgICAgZGlzcGxheS5kZXRlY3RpbmdTZWxlY3RBbGwgPSBzZXRUaW1lb3V0KHBvbGwsIDUwMCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgZGlzcGxheS5zZWxGb3JDb250ZXh0TWVudSA9IG51bGw7XG4gICAgICAgICAgZGlzcGxheS5pbnB1dC5yZXNldCgpO1xuICAgICAgICB9XG4gICAgICB9O1xuICAgICAgZGlzcGxheS5kZXRlY3RpbmdTZWxlY3RBbGwgPSBzZXRUaW1lb3V0KHBvbGwsIDIwMCk7XG4gICAgfVxuICB9XG5cbiAgaWYgKGllICYmIGllX3ZlcnNpb24gPj0gOSkgeyBwcmVwYXJlU2VsZWN0QWxsSGFjaygpOyB9XG4gIGlmIChjYXB0dXJlUmlnaHRDbGljaykge1xuICAgIGVfc3RvcChlKTtcbiAgICB2YXIgbW91c2V1cCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIG9mZih3aW5kb3csIFwibW91c2V1cFwiLCBtb3VzZXVwKTtcbiAgICAgIHNldFRpbWVvdXQocmVoaWRlLCAyMCk7XG4gICAgfTtcbiAgICBvbih3aW5kb3csIFwibW91c2V1cFwiLCBtb3VzZXVwKTtcbiAgfSBlbHNlIHtcbiAgICBzZXRUaW1lb3V0KHJlaGlkZSwgNTApO1xuICB9XG59O1xuXG5UZXh0YXJlYUlucHV0LnByb3RvdHlwZS5yZWFkT25seUNoYW5nZWQgPSBmdW5jdGlvbiAodmFsKSB7XG4gIGlmICghdmFsKSB7IHRoaXMucmVzZXQoKTsgfVxuICB0aGlzLnRleHRhcmVhLmRpc2FibGVkID0gdmFsID09IFwibm9jdXJzb3JcIjtcbn07XG5cblRleHRhcmVhSW5wdXQucHJvdG90eXBlLnNldFVuZWRpdGFibGUgPSBmdW5jdGlvbiAoKSB7fTtcblxuVGV4dGFyZWFJbnB1dC5wcm90b3R5cGUubmVlZHNDb250ZW50QXR0cmlidXRlID0gZmFsc2U7XG5cbmZ1bmN0aW9uIGZyb21UZXh0QXJlYSh0ZXh0YXJlYSwgb3B0aW9ucykge1xuICBvcHRpb25zID0gb3B0aW9ucyA/IGNvcHlPYmoob3B0aW9ucykgOiB7fTtcbiAgb3B0aW9ucy52YWx1ZSA9IHRleHRhcmVhLnZhbHVlO1xuICBpZiAoIW9wdGlvbnMudGFiaW5kZXggJiYgdGV4dGFyZWEudGFiSW5kZXgpXG4gICAgeyBvcHRpb25zLnRhYmluZGV4ID0gdGV4dGFyZWEudGFiSW5kZXg7IH1cbiAgaWYgKCFvcHRpb25zLnBsYWNlaG9sZGVyICYmIHRleHRhcmVhLnBsYWNlaG9sZGVyKVxuICAgIHsgb3B0aW9ucy5wbGFjZWhvbGRlciA9IHRleHRhcmVhLnBsYWNlaG9sZGVyOyB9XG4gIC8vIFNldCBhdXRvZm9jdXMgdG8gdHJ1ZSBpZiB0aGlzIHRleHRhcmVhIGlzIGZvY3VzZWQsIG9yIGlmIGl0IGhhc1xuICAvLyBhdXRvZm9jdXMgYW5kIG5vIG90aGVyIGVsZW1lbnQgaXMgZm9jdXNlZC5cbiAgaWYgKG9wdGlvbnMuYXV0b2ZvY3VzID09IG51bGwpIHtcbiAgICB2YXIgaGFzRm9jdXMgPSBhY3RpdmVFbHQoKTtcbiAgICBvcHRpb25zLmF1dG9mb2N1cyA9IGhhc0ZvY3VzID09IHRleHRhcmVhIHx8XG4gICAgICB0ZXh0YXJlYS5nZXRBdHRyaWJ1dGUoXCJhdXRvZm9jdXNcIikgIT0gbnVsbCAmJiBoYXNGb2N1cyA9PSBkb2N1bWVudC5ib2R5O1xuICB9XG5cbiAgZnVuY3Rpb24gc2F2ZSgpIHt0ZXh0YXJlYS52YWx1ZSA9IGNtLmdldFZhbHVlKCk7fVxuXG4gIHZhciByZWFsU3VibWl0O1xuICBpZiAodGV4dGFyZWEuZm9ybSkge1xuICAgIG9uKHRleHRhcmVhLmZvcm0sIFwic3VibWl0XCIsIHNhdmUpO1xuICAgIC8vIERlcGxvcmFibGUgaGFjayB0byBtYWtlIHRoZSBzdWJtaXQgbWV0aG9kIGRvIHRoZSByaWdodCB0aGluZy5cbiAgICBpZiAoIW9wdGlvbnMubGVhdmVTdWJtaXRNZXRob2RBbG9uZSkge1xuICAgICAgdmFyIGZvcm0gPSB0ZXh0YXJlYS5mb3JtO1xuICAgICAgcmVhbFN1Ym1pdCA9IGZvcm0uc3VibWl0O1xuICAgICAgdHJ5IHtcbiAgICAgICAgdmFyIHdyYXBwZWRTdWJtaXQgPSBmb3JtLnN1Ym1pdCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBzYXZlKCk7XG4gICAgICAgICAgZm9ybS5zdWJtaXQgPSByZWFsU3VibWl0O1xuICAgICAgICAgIGZvcm0uc3VibWl0KCk7XG4gICAgICAgICAgZm9ybS5zdWJtaXQgPSB3cmFwcGVkU3VibWl0O1xuICAgICAgICB9O1xuICAgICAgfSBjYXRjaChlKSB7fVxuICAgIH1cbiAgfVxuXG4gIG9wdGlvbnMuZmluaXNoSW5pdCA9IGZ1bmN0aW9uIChjbSkge1xuICAgIGNtLnNhdmUgPSBzYXZlO1xuICAgIGNtLmdldFRleHRBcmVhID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gdGV4dGFyZWE7IH07XG4gICAgY20udG9UZXh0QXJlYSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIGNtLnRvVGV4dEFyZWEgPSBpc05hTjsgLy8gUHJldmVudCB0aGlzIGZyb20gYmVpbmcgcmFuIHR3aWNlXG4gICAgICBzYXZlKCk7XG4gICAgICB0ZXh0YXJlYS5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKGNtLmdldFdyYXBwZXJFbGVtZW50KCkpO1xuICAgICAgdGV4dGFyZWEuc3R5bGUuZGlzcGxheSA9IFwiXCI7XG4gICAgICBpZiAodGV4dGFyZWEuZm9ybSkge1xuICAgICAgICBvZmYodGV4dGFyZWEuZm9ybSwgXCJzdWJtaXRcIiwgc2F2ZSk7XG4gICAgICAgIGlmICh0eXBlb2YgdGV4dGFyZWEuZm9ybS5zdWJtaXQgPT0gXCJmdW5jdGlvblwiKVxuICAgICAgICAgIHsgdGV4dGFyZWEuZm9ybS5zdWJtaXQgPSByZWFsU3VibWl0OyB9XG4gICAgICB9XG4gICAgfTtcbiAgfTtcblxuICB0ZXh0YXJlYS5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gIHZhciBjbSA9IENvZGVNaXJyb3IkMShmdW5jdGlvbiAobm9kZSkgeyByZXR1cm4gdGV4dGFyZWEucGFyZW50Tm9kZS5pbnNlcnRCZWZvcmUobm9kZSwgdGV4dGFyZWEubmV4dFNpYmxpbmcpOyB9LFxuICAgIG9wdGlvbnMpO1xuICByZXR1cm4gY21cbn1cblxuZnVuY3Rpb24gYWRkTGVnYWN5UHJvcHMoQ29kZU1pcnJvcikge1xuICBDb2RlTWlycm9yLm9mZiA9IG9mZjtcbiAgQ29kZU1pcnJvci5vbiA9IG9uO1xuICBDb2RlTWlycm9yLndoZWVsRXZlbnRQaXhlbHMgPSB3aGVlbEV2ZW50UGl4ZWxzO1xuICBDb2RlTWlycm9yLkRvYyA9IERvYztcbiAgQ29kZU1pcnJvci5zcGxpdExpbmVzID0gc3BsaXRMaW5lc0F1dG87XG4gIENvZGVNaXJyb3IuY291bnRDb2x1bW4gPSBjb3VudENvbHVtbjtcbiAgQ29kZU1pcnJvci5maW5kQ29sdW1uID0gZmluZENvbHVtbjtcbiAgQ29kZU1pcnJvci5pc1dvcmRDaGFyID0gaXNXb3JkQ2hhckJhc2ljO1xuICBDb2RlTWlycm9yLlBhc3MgPSBQYXNzO1xuICBDb2RlTWlycm9yLnNpZ25hbCA9IHNpZ25hbDtcbiAgQ29kZU1pcnJvci5MaW5lID0gTGluZTtcbiAgQ29kZU1pcnJvci5jaGFuZ2VFbmQgPSBjaGFuZ2VFbmQ7XG4gIENvZGVNaXJyb3Iuc2Nyb2xsYmFyTW9kZWwgPSBzY3JvbGxiYXJNb2RlbDtcbiAgQ29kZU1pcnJvci5Qb3MgPSBQb3M7XG4gIENvZGVNaXJyb3IuY21wUG9zID0gY21wO1xuICBDb2RlTWlycm9yLm1vZGVzID0gbW9kZXM7XG4gIENvZGVNaXJyb3IubWltZU1vZGVzID0gbWltZU1vZGVzO1xuICBDb2RlTWlycm9yLnJlc29sdmVNb2RlID0gcmVzb2x2ZU1vZGU7XG4gIENvZGVNaXJyb3IuZ2V0TW9kZSA9IGdldE1vZGU7XG4gIENvZGVNaXJyb3IubW9kZUV4dGVuc2lvbnMgPSBtb2RlRXh0ZW5zaW9ucztcbiAgQ29kZU1pcnJvci5leHRlbmRNb2RlID0gZXh0ZW5kTW9kZTtcbiAgQ29kZU1pcnJvci5jb3B5U3RhdGUgPSBjb3B5U3RhdGU7XG4gIENvZGVNaXJyb3Iuc3RhcnRTdGF0ZSA9IHN0YXJ0U3RhdGU7XG4gIENvZGVNaXJyb3IuaW5uZXJNb2RlID0gaW5uZXJNb2RlO1xuICBDb2RlTWlycm9yLmNvbW1hbmRzID0gY29tbWFuZHM7XG4gIENvZGVNaXJyb3Iua2V5TWFwID0ga2V5TWFwO1xuICBDb2RlTWlycm9yLmtleU5hbWUgPSBrZXlOYW1lO1xuICBDb2RlTWlycm9yLmlzTW9kaWZpZXJLZXkgPSBpc01vZGlmaWVyS2V5O1xuICBDb2RlTWlycm9yLmxvb2t1cEtleSA9IGxvb2t1cEtleTtcbiAgQ29kZU1pcnJvci5ub3JtYWxpemVLZXlNYXAgPSBub3JtYWxpemVLZXlNYXA7XG4gIENvZGVNaXJyb3IuU3RyaW5nU3RyZWFtID0gU3RyaW5nU3RyZWFtO1xuICBDb2RlTWlycm9yLlNoYXJlZFRleHRNYXJrZXIgPSBTaGFyZWRUZXh0TWFya2VyO1xuICBDb2RlTWlycm9yLlRleHRNYXJrZXIgPSBUZXh0TWFya2VyO1xuICBDb2RlTWlycm9yLkxpbmVXaWRnZXQgPSBMaW5lV2lkZ2V0O1xuICBDb2RlTWlycm9yLmVfcHJldmVudERlZmF1bHQgPSBlX3ByZXZlbnREZWZhdWx0O1xuICBDb2RlTWlycm9yLmVfc3RvcFByb3BhZ2F0aW9uID0gZV9zdG9wUHJvcGFnYXRpb247XG4gIENvZGVNaXJyb3IuZV9zdG9wID0gZV9zdG9wO1xuICBDb2RlTWlycm9yLmFkZENsYXNzID0gYWRkQ2xhc3M7XG4gIENvZGVNaXJyb3IuY29udGFpbnMgPSBjb250YWlucztcbiAgQ29kZU1pcnJvci5ybUNsYXNzID0gcm1DbGFzcztcbiAgQ29kZU1pcnJvci5rZXlOYW1lcyA9IGtleU5hbWVzO1xufVxuXG4vLyBFRElUT1IgQ09OU1RSVUNUT1JcblxuZGVmaW5lT3B0aW9ucyhDb2RlTWlycm9yJDEpO1xuXG5hZGRFZGl0b3JNZXRob2RzKENvZGVNaXJyb3IkMSk7XG5cbi8vIFNldCB1cCBtZXRob2RzIG9uIENvZGVNaXJyb3IncyBwcm90b3R5cGUgdG8gcmVkaXJlY3QgdG8gdGhlIGVkaXRvcidzIGRvY3VtZW50LlxudmFyIGRvbnREZWxlZ2F0ZSA9IFwiaXRlciBpbnNlcnQgcmVtb3ZlIGNvcHkgZ2V0RWRpdG9yIGNvbnN0cnVjdG9yXCIuc3BsaXQoXCIgXCIpO1xuZm9yICh2YXIgcHJvcCBpbiBEb2MucHJvdG90eXBlKSB7IGlmIChEb2MucHJvdG90eXBlLmhhc093blByb3BlcnR5KHByb3ApICYmIGluZGV4T2YoZG9udERlbGVnYXRlLCBwcm9wKSA8IDApXG4gIHsgQ29kZU1pcnJvciQxLnByb3RvdHlwZVtwcm9wXSA9IChmdW5jdGlvbihtZXRob2QpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7cmV0dXJuIG1ldGhvZC5hcHBseSh0aGlzLmRvYywgYXJndW1lbnRzKX1cbiAgfSkoRG9jLnByb3RvdHlwZVtwcm9wXSk7IH0gfVxuXG5ldmVudE1peGluKERvYyk7XG5cbi8vIElOUFVUIEhBTkRMSU5HXG5cbkNvZGVNaXJyb3IkMS5pbnB1dFN0eWxlcyA9IHtcInRleHRhcmVhXCI6IFRleHRhcmVhSW5wdXQsIFwiY29udGVudGVkaXRhYmxlXCI6IENvbnRlbnRFZGl0YWJsZUlucHV0fTtcblxuLy8gTU9ERSBERUZJTklUSU9OIEFORCBRVUVSWUlOR1xuXG4vLyBFeHRyYSBhcmd1bWVudHMgYXJlIHN0b3JlZCBhcyB0aGUgbW9kZSdzIGRlcGVuZGVuY2llcywgd2hpY2ggaXNcbi8vIHVzZWQgYnkgKGxlZ2FjeSkgbWVjaGFuaXNtcyBsaWtlIGxvYWRtb2RlLmpzIHRvIGF1dG9tYXRpY2FsbHlcbi8vIGxvYWQgYSBtb2RlLiAoUHJlZmVycmVkIG1lY2hhbmlzbSBpcyB0aGUgcmVxdWlyZS9kZWZpbmUgY2FsbHMuKVxuQ29kZU1pcnJvciQxLmRlZmluZU1vZGUgPSBmdW5jdGlvbihuYW1lLyosIG1vZGUsIOKApiovKSB7XG4gIGlmICghQ29kZU1pcnJvciQxLmRlZmF1bHRzLm1vZGUgJiYgbmFtZSAhPSBcIm51bGxcIikgeyBDb2RlTWlycm9yJDEuZGVmYXVsdHMubW9kZSA9IG5hbWU7IH1cbiAgZGVmaW5lTW9kZS5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xufTtcblxuQ29kZU1pcnJvciQxLmRlZmluZU1JTUUgPSBkZWZpbmVNSU1FO1xuXG4vLyBNaW5pbWFsIGRlZmF1bHQgbW9kZS5cbkNvZGVNaXJyb3IkMS5kZWZpbmVNb2RlKFwibnVsbFwiLCBmdW5jdGlvbiAoKSB7IHJldHVybiAoe3Rva2VuOiBmdW5jdGlvbiAoc3RyZWFtKSB7IHJldHVybiBzdHJlYW0uc2tpcFRvRW5kKCk7IH19KTsgfSk7XG5Db2RlTWlycm9yJDEuZGVmaW5lTUlNRShcInRleHQvcGxhaW5cIiwgXCJudWxsXCIpO1xuXG4vLyBFWFRFTlNJT05TXG5cbkNvZGVNaXJyb3IkMS5kZWZpbmVFeHRlbnNpb24gPSBmdW5jdGlvbiAobmFtZSwgZnVuYykge1xuICBDb2RlTWlycm9yJDEucHJvdG90eXBlW25hbWVdID0gZnVuYztcbn07XG5Db2RlTWlycm9yJDEuZGVmaW5lRG9jRXh0ZW5zaW9uID0gZnVuY3Rpb24gKG5hbWUsIGZ1bmMpIHtcbiAgRG9jLnByb3RvdHlwZVtuYW1lXSA9IGZ1bmM7XG59O1xuXG5Db2RlTWlycm9yJDEuZnJvbVRleHRBcmVhID0gZnJvbVRleHRBcmVhO1xuXG5hZGRMZWdhY3lQcm9wcyhDb2RlTWlycm9yJDEpO1xuXG5Db2RlTWlycm9yJDEudmVyc2lvbiA9IFwiNS4zOC4wXCI7XG5cbnJldHVybiBDb2RlTWlycm9yJDE7XG5cbn0pKSk7XG4iLCJDb2RlTWlycm9yID0gcmVxdWlyZSgnY29kZW1pcnJvcicpO1xuXG52YXIgdG90YWxfY2VsbHMgPSAxMDA7XG4vL3ZhciB0b3RhbF9jb2RlX2NlbGxzID0gMTAwO1xuLy92YXIgdG90YWxfbWFya2Rvd25fY2VsbHMgPSAxMDA7XG52YXIgY21fY29uZmlnID0ge1xuICAgIFwiaW5kZW50VW5pdFwiOjQsXG4gICAgXCJyZWFkT25seVwiOmZhbHNlLFxuICAgIFwidGhlbWVcIjpcImlweXRob25cIixcbiAgICBcImV4dHJhS2V5c1wiOntcbiAgICAgICAgXCJDbWQtUmlnaHRcIjpcImdvTGluZVJpZ2h0XCIsXG4gICAgICAgIFwiRW5kXCI6XCJnb0xpbmVSaWdodFwiLFxuICAgICAgICBcIkNtZC1MZWZ0XCI6XCJnb0xpbmVMZWZ0XCIsXG4gICAgICAgIFwiVGFiXCI6XCJpbmRlbnRNb3JlXCIsXG4gICAgICAgIFwiU2hpZnQtVGFiXCI6XCJpbmRlbnRMZXNzXCIsXG4gICAgICAgIFwiQ21kLS9cIjpcInRvZ2dsZUNvbW1lbnRcIixcbiAgICAgICAgXCJDdHJsLS9cIjpcInRvZ2dsZUNvbW1lbnRcIixcbiAgICAgICAgXCJCYWNrc3BhY2VcIjpcImRlbFNwYWNlVG9QcmV2VGFiU3RvcFwiXG4gICAgfSxcbiAgICBcIm1vZGVcIjp7XG4gICAgICAgIFwibmFtZVwiOlwiaXB5dGhvblwiLFxuICAgICAgICBcInZlcnNpb25cIjozXG4gICAgfSxcbiAgICBcIm1hdGNoQnJhY2tldHNcIjp0cnVlLFxuICAgIFwiYXV0b0Nsb3NlQnJhY2tldHNcIjp0cnVlXG59O1xuXG52YXIgY21fY29uZmlnMiA9IHtcbiAgICBcImluZGVudFVuaXRcIjogNCxcbiAgICBcInJlYWRPbmx5XCI6IGZhbHNlLFxuICAgIFwidGhlbWVcIjogXCJkZWZhdWx0XCIsXG4gICAgXCJleHRyYUtleXNcIjoge1xuICAgICAgICBcIkNtZC1SaWdodFwiOiBcImdvTGluZVJpZ2h0XCIsXG4gICAgICAgIFwiRW5kXCI6IFwiZ29MaW5lUmlnaHRcIixcbiAgICAgICAgXCJDbWQtTGVmdFwiOiBcImdvTGluZUxlZnRcIixcbiAgICAgICAgXCJUYWJcIjogXCJpbmRlbnRNb3JlXCIsXG4gICAgICAgIFwiU2hpZnQtVGFiXCI6IFwiaW5kZW50TGVzc1wiLFxuICAgICAgICBcIkNtZC0vXCI6IFwidG9nZ2xlQ29tbWVudFwiLFxuICAgICAgICBcIkN0cmwtL1wiOiBcInRvZ2dsZUNvbW1lbnRcIlxuICAgIH0sXG4gICAgXCJtb2RlXCI6IFwiaXB5dGhvbmdmbVwiLFxuICAgIFwibGluZVdyYXBwaW5nXCI6IHRydWVcbn07XG5cblxud2luZG93LnNoYXJlZF9lbGVtZW50cyA9IHt9O1xuZm9yICh2YXIgaT0wOyBpPHRvdGFsX2NlbGxzOyBpKyspIHtcbiAgICB2YXIgb3V0cHV0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG4gICAgdmFyIGlucHV0X2FyZWEgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBpbnB1dF9hcmVhLmNsYXNzTmFtZSA9ICdpbnB1dF9hcmVhJztcbiAgICAvL3ZhciBjb2RlbWlycm9yID0gQ29kZU1pcnJvcihpbnB1dF9hcmVhLCBjbV9jb25maWcpOyBcbiAgICB2YXIgY29kZW1pcnJvciA9IENvZGVNaXJyb3IoaW5wdXRfYXJlYSk7IFxuICAgIHdpbmRvdy5zaGFyZWRfZWxlbWVudHNbaV0gPSB7XG4gICAgICAgICdvdXRwdXQnOiBvdXRwdXQsXG4gICAgICAgICdpbnB1dF9hcmVhJzogaW5wdXRfYXJlYSxcbiAgICAgICAgJ2NvZGVtaXJyb3InOiBjb2RlbWlycm9yLFxuICAgIH07XG59XG5cbndpbmRvdy5zaGFyZWRfZWxlbWVudHNfYXZhaWxhYmxlID0gdHJ1ZTtcblxuLy9mb3IgKHZhciBpPXRvdGFsX2NvZGVfY2VsbHM7IGk8dG90YWxfY29kZV9jZWxscyt0b3RhbF9tYXJrZG93bl9jZWxsczsgaSsrKSB7XG4vLyAgICB2YXIgaW5wdXRfYXJlYSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuLy8gICAgaW5wdXRfYXJlYS5jbGFzc05hbWUgPSAnaW5wdXRfYXJlYSc7XG4vLyAgICB2YXIgY29kZW1pcnJvciA9IENvZGVNaXJyb3IoaW5wdXRfYXJlYSwgY21fY29uZmlnMik7IFxuLy8gICAgd2luZG93LnNoYXJlZF9lbGVtZW50c1tpXSA9IHtcbi8vICAgICAgICAnaW5wdXRfYXJlYSc6IGlucHV0X2FyZWEsXG4vLyAgICAgICAgJ2NvZGVtaXJyb3InOiBjb2RlbWlycm9yXG4vLyAgICB9O1xuLy99XG4iXX0=
