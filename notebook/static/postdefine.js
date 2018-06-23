(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
function load_ynotebook() {
    if (typeof window.sockets !== 'undefined' && typeof window.shared_elements_available !== 'undefined') {
        load_ynotebook2();
    } else {
        setTimeout(load_ynotebook, 0);
    }

    function load_ynotebook2() {
        if (typeof window.ymap !== 'undefined' && typeof window.Jupyter !== 'undefined' && typeof window.Jupyter.notebook !== 'undefined') {
            load_ynotebook3();
        } else {
            setTimeout(load_ynotebook2, 0);
        }
    }

    function load_ynotebook3() {
        function load_ynotebook4(data) {
            var new_cells = data.content.cells;
            var ncells = new_cells.length;
            for (var i=0; i<ncells; i++) {
                var cell = Jupyter.notebook.get_cell(i);
                cell.fromJSON(new_cells[i]);
                if (cell.metadata.active) {
                    cell.element.removeClass('hidden');
                    cell.focus_cell();
                }
            }
        }
        function load_ynotebook5(data) {
            var new_cells = data.content.cells;
            var ncells = new_cells.length;
            for (var i=0; i<ncells; i++) {
                var cell = Jupyter.notebook.get_cell(i);
                cell.metadata = new_cells[i].metadata;
                if (new_cells[i].metadata.active) {
                    cell.element.removeClass('hidden');
                    cell.focus_cell();
                }
            }
        }
        if (window.sockets === 0) {
            Jupyter.notebook.contents.get(Jupyter.notebook.notebook_path, {type: 'notebook'}).then(
                $.proxy(load_ynotebook4, this)
            );
        } else if (window.sockets > 0) {
            Jupyter.notebook.contents.get(Jupyter.notebook.notebook_path, {type: 'notebook'}).then(
                $.proxy(load_ynotebook5, this)
            );
        }
    }
}

load_ynotebook();

},{}]},{},[1])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvcG9zdGRlZmluZS5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uKCl7ZnVuY3Rpb24gcihlLG4sdCl7ZnVuY3Rpb24gbyhpLGYpe2lmKCFuW2ldKXtpZighZVtpXSl7dmFyIGM9XCJmdW5jdGlvblwiPT10eXBlb2YgcmVxdWlyZSYmcmVxdWlyZTtpZighZiYmYylyZXR1cm4gYyhpLCEwKTtpZih1KXJldHVybiB1KGksITApO3ZhciBhPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIraStcIidcIik7dGhyb3cgYS5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGF9dmFyIHA9bltpXT17ZXhwb3J0czp7fX07ZVtpXVswXS5jYWxsKHAuZXhwb3J0cyxmdW5jdGlvbihyKXt2YXIgbj1lW2ldWzFdW3JdO3JldHVybiBvKG58fHIpfSxwLHAuZXhwb3J0cyxyLGUsbix0KX1yZXR1cm4gbltpXS5leHBvcnRzfWZvcih2YXIgdT1cImZ1bmN0aW9uXCI9PXR5cGVvZiByZXF1aXJlJiZyZXF1aXJlLGk9MDtpPHQubGVuZ3RoO2krKylvKHRbaV0pO3JldHVybiBvfXJldHVybiByfSkoKSIsImZ1bmN0aW9uIGxvYWRfeW5vdGVib29rKCkge1xuICAgIGlmICh0eXBlb2Ygd2luZG93LnNvY2tldHMgIT09ICd1bmRlZmluZWQnICYmIHR5cGVvZiB3aW5kb3cuc2hhcmVkX2VsZW1lbnRzX2F2YWlsYWJsZSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgbG9hZF95bm90ZWJvb2syKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgc2V0VGltZW91dChsb2FkX3lub3RlYm9vaywgMCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbG9hZF95bm90ZWJvb2syKCkge1xuICAgICAgICBpZiAodHlwZW9mIHdpbmRvdy55bWFwICE9PSAndW5kZWZpbmVkJyAmJiB0eXBlb2Ygd2luZG93Lkp1cHl0ZXIgIT09ICd1bmRlZmluZWQnICYmIHR5cGVvZiB3aW5kb3cuSnVweXRlci5ub3RlYm9vayAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgIGxvYWRfeW5vdGVib29rMygpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc2V0VGltZW91dChsb2FkX3lub3RlYm9vazIsIDApO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbG9hZF95bm90ZWJvb2szKCkge1xuICAgICAgICBmdW5jdGlvbiBsb2FkX3lub3RlYm9vazQoZGF0YSkge1xuICAgICAgICAgICAgdmFyIG5ld19jZWxscyA9IGRhdGEuY29udGVudC5jZWxscztcbiAgICAgICAgICAgIHZhciBuY2VsbHMgPSBuZXdfY2VsbHMubGVuZ3RoO1xuICAgICAgICAgICAgZm9yICh2YXIgaT0wOyBpPG5jZWxsczsgaSsrKSB7XG4gICAgICAgICAgICAgICAgdmFyIGNlbGwgPSBKdXB5dGVyLm5vdGVib29rLmdldF9jZWxsKGkpO1xuICAgICAgICAgICAgICAgIGNlbGwuZnJvbUpTT04obmV3X2NlbGxzW2ldKTtcbiAgICAgICAgICAgICAgICBpZiAoY2VsbC5tZXRhZGF0YS5hY3RpdmUpIHtcbiAgICAgICAgICAgICAgICAgICAgY2VsbC5lbGVtZW50LnJlbW92ZUNsYXNzKCdoaWRkZW4nKTtcbiAgICAgICAgICAgICAgICAgICAgY2VsbC5mb2N1c19jZWxsKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGZ1bmN0aW9uIGxvYWRfeW5vdGVib29rNShkYXRhKSB7XG4gICAgICAgICAgICB2YXIgbmV3X2NlbGxzID0gZGF0YS5jb250ZW50LmNlbGxzO1xuICAgICAgICAgICAgdmFyIG5jZWxscyA9IG5ld19jZWxscy5sZW5ndGg7XG4gICAgICAgICAgICBmb3IgKHZhciBpPTA7IGk8bmNlbGxzOyBpKyspIHtcbiAgICAgICAgICAgICAgICB2YXIgY2VsbCA9IEp1cHl0ZXIubm90ZWJvb2suZ2V0X2NlbGwoaSk7XG4gICAgICAgICAgICAgICAgY2VsbC5tZXRhZGF0YSA9IG5ld19jZWxsc1tpXS5tZXRhZGF0YTtcbiAgICAgICAgICAgICAgICBpZiAobmV3X2NlbGxzW2ldLm1ldGFkYXRhLmFjdGl2ZSkge1xuICAgICAgICAgICAgICAgICAgICBjZWxsLmVsZW1lbnQucmVtb3ZlQ2xhc3MoJ2hpZGRlbicpO1xuICAgICAgICAgICAgICAgICAgICBjZWxsLmZvY3VzX2NlbGwoKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHdpbmRvdy5zb2NrZXRzID09PSAwKSB7XG4gICAgICAgICAgICBKdXB5dGVyLm5vdGVib29rLmNvbnRlbnRzLmdldChKdXB5dGVyLm5vdGVib29rLm5vdGVib29rX3BhdGgsIHt0eXBlOiAnbm90ZWJvb2snfSkudGhlbihcbiAgICAgICAgICAgICAgICAkLnByb3h5KGxvYWRfeW5vdGVib29rNCwgdGhpcylcbiAgICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSBpZiAod2luZG93LnNvY2tldHMgPiAwKSB7XG4gICAgICAgICAgICBKdXB5dGVyLm5vdGVib29rLmNvbnRlbnRzLmdldChKdXB5dGVyLm5vdGVib29rLm5vdGVib29rX3BhdGgsIHt0eXBlOiAnbm90ZWJvb2snfSkudGhlbihcbiAgICAgICAgICAgICAgICAkLnByb3h5KGxvYWRfeW5vdGVib29rNSwgdGhpcylcbiAgICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICB9XG59XG5cbmxvYWRfeW5vdGVib29rKCk7XG4iXX0=
