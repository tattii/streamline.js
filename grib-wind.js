/**
 *	GribWind - wind data.grib2
 *
 */
function GribWind(data, projection) {
	var u_data = data.u_data;
	var v_data = data.v_data;
	var nlng = data.nlng;  // number of grids
	var nlat = data.nlat;
	var p0 = data.p0;      // grid start point [lat, lng]
	var p1 = data.p1;      // grid end point
	var dlng = data.dlng;
	var dlat = data.dlat;

	function v(x, y){
		var n = nlng * y + x;
		return [ u_data[n], v_data[n] ];
	}

	function isDefined(latlng) {
		var lat = latlng[0], lng = latlng[1];
		return (p0[0] >= lat && lat >= p1[0] )
			&& (p0[1] <= lng && lng <= p1[1] );
	}

	function getGridVector(latlng) {
		var lat = latlng[0], lng = latlng[1];
		if ( isDefined(latlng) ){
			var x = Math.floor((lng - (p0[1] - dlng/2)) / dlng);
			var y = Math.floor(((p0[0] + dlat/2) - lat) / dlat);
			return v(x, y);

		}else{
			return [ null, null ];
		}
	}

	function getVector(latlng) {
		var lat = latlng[0], lng = latlng[1];
		if ( isDefined(latlng) ){
			var x = Math.floor((lng - p0[1]) / dlng);
			var y = Math.floor((p0[0] - lat) / dlat);
			var dx = (lng - (p0[1] + dlng * x)) / dlng;
			var dy = ((p0[0] - dlat * y) - lat) / dlat;
			return bilinearInterpolateVector(dx, dy, v(x, y), v(x+1, y), v(x, y+1), v(x+1, y+1));

		}else{
			return [ null, null ];
		}
	}

	function bilinearInterpolateVector(x, y, p00, p10, p01, p11) {
		var rx = (1 - x);
		var ry = (1 - y);
		var a = rx * ry,  b = x * ry,  c = rx * y,  d = x * y;
		var u = p00[0] * a + p10[0] * b + p01[0] * c + p11[0] * d;
		var v = p00[1] * a + p10[1] * b + p01[1] * c + p11[1] * d;
		return [ u, v ];
	}

	return {
		getGridVector: getGridVector,
		getVector: getVector
	};
}

