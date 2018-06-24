function set_heartbeat2() {    
    if (typeof Jupyter !== 'undefined' && typeof Jupyter.notebook !== 'undefined') {
        function set_heartbeat(url) {
            $.get(url,  function(){});
            setInterval(function(url) {
                $.get(url,  function(){});
            }, 10*1000, url);
        }
        var url = 'https://finplane.com/heartbeat?base_url=' 
            + Jupyter.notebook.base_url.replace(/\//g, '')
            + '&port=' + window.location.port;
        set_heartbeat(url);
    } else {
        setTimeout(set_heartbeat2, 0);
    }
}

set_heartbeat2();
