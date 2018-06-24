function set_heartbeat2() {    
    if (typeof Jupyter !== 'undefined' && typeof Jupyter.notebook !== 'undefined') {
        function set_heartbeat(url) {
            $.get(url,  function(){});
            setInterval(function(url) {
                $.get(url,  function(){});
            }, 10*1000, url);
        }
        var url = 'https://finplane.com/heartbeat?id=' + Jupyter.notebook.base_url;
        set_heartbeat(url);
    } else {
        setTimeout(set_heartbeat2, 0);
    }
}

set_heartbeat2();
