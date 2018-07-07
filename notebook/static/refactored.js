function set_heartbeat2() {    
    function set_heartbeat(xhr, url) {
        xhr.open("GET", url);
        xhr.send();
        setInterval(function(xhr, url) {
            xhr.open("GET", url);
            xhr.send();
        }, 10*1000, xhr, url);
    }
    
    url = '/' + window.location.pathname.split('/')[1] + '/notebooks/heartbeat' 
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
