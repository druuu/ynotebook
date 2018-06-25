function set_heartbeat2() {    
    function set_heartbeat(xhr, url) {
        xhr.open("GET", url);
        xhr.send();
        setInterval(function(xhr, url) {
            xhr.open("GET", url);
            xhr.send();
        }, 10*1000, xhr, url);
    }
    var base_url = document.head.getAttribute('data-base_url');
    var url = 'https://finplane.com/heartbeat?base_url=' 
        + base_url.replace(/\//g, '')
        + '&port=' + window.location.port
        + '&share_url=' + encodeURIComponent(window.location.href);
    var xhr = new XMLHttpRequest();
    xhr.withCredentials = true;
    xhr.onreadystatechange = function() {
        if (this.readyState == 4 && this.status == 401) {
            console.log(xhr.responseText);
            window.location.href = xhr.responseText;
        }
    }
    set_heartbeat(xhr, url);
}
set_heartbeat2();
