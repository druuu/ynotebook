function set_heartbeat2(url) {    
    if (typeof Jupyter !== 'undefined' && typeof Jupyter.notebook !== 'undefined') {
        function set_heartbeat(url) {
            $.get(url,  function(url){});
            setInterval(function(url) {
                $.get(url,  function(url){});
            }, 10*1000, url);
        }
        set_heartbeat(url);
    } else {
        setTimeout(set_heartbeat2, 0, url);
    }
}

var url = new URL(window.location.href);
var id = url.searchParams.get("id");
var url = '/heartbeat/?id=' + id;
//set_heartbeat2(url);
