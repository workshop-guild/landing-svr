$ ( main );

function main ()
{
    window.onload = function() {
        navigator.geolocation.getCurrentPosition(
            function( pos ) {
                var geocoder = new google.maps.Geocoder();
                var lat = pos.coords.latitude;
                var lon = pos.coords.longitude;
                console.log(lat);
                console.log(lon);
                
                var myloc = "Latitude: " + lat + "<br>" + "Longitude: " + lon + "<br>";
                
                var geopos = new google.maps.LatLng(lat, lon);
                
                $('#loc').append(myloc);
                $('#loc').append("Near Me<br>");
                
                geocoder.geocode({'latLng': geopos}, function(results, status) {
                   
                    for ( var i in results ) {
                        console.log(results[i].types);
                        var addr = results[i].formatted_address;
                        $('#loc').append(addr + "<br>");
                    }
                    
                });
                


            },                                
            function() {


            }
        );

    };
        
    
}