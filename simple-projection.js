function SimpleProjection(p0, p1){
	var dx = p1.x - p0.x;
	var dy = p1.y - p0.y;
	var dlat = p1.lat - p0.lat;
	var dlng = p1.lng - p0.lng;

	function project(latlng) {
		var x = dx/dlng * (latlng[1] - p0.lng) + p0.x;
		var y = dy/dlat * (p0.lat - latlng[0]) + p0.y;
		return [x, y];
	}

	function unproject(x, y) {
		var lat = dlat/dy * (y - p0.y) + p0.lat;
		var lng = dlng/dx * (x - p0.x) + p0.lng;
		return [lat, lng];
	}

	return {
		project: project,
		unproject: unproject
	};
}
