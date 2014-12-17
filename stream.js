var Stream = function(){
	var PARTICLE_MULTIPLIER = 7;
	var PARTICLE_LINE_WIDTH = 1.0;
	var MAX_PARTICLE_AGE = 100;
	var FRAME_RATE = 40;
	var NULL_VECTOR = [NaN, NaN, null];


	/**
	 * GPVデータクラス
	 *　latlng
	 */
	var mesh = function(){
		//var u_data = [1,1,1,-1,10,1,1,1,1,1,1,-1];
		var u_data = [1,1,1,0,0,0,0,0,0,-1,-1,-1];
		//var v_data = [1,1,1,1,1,1,1,1,1,1,1,-1];
		var v_data = [0,0,0,1,-1,0,0,1,-1,0,0,0];

		// 格子
		var grid_x = 4;
		var grid_y = 3;
		var start_point = [35, 130];
		var end_point   = [33, 133];
		var space_lat = 1.0;
		var space_lng = 1.0;

		function data(x, y){
			var n = grid_x * y + x;
			return [ u_data[n], v_data[n] ];
		}

		function create() {

		}

		function isDefined(latlng) {
			var lat = latlng[0], lng = latlng[1];
			return (start_point[0] >= lat && lat >= end_point[0] )
				&& (start_point[1] <= lng && lng <= end_point[1] );
		}

		// latlngを含む格子の値を返す
		function get(latlng) {
			var lat = latlng[0], lng = latlng[1];
			if ( isDefined(latlng) ){
				var x = Math.floor((lng - (start_point[1] - space_lng/2)) / space_lng);
				var y = Math.floor(((start_point[0] + space_lat/2) - lat) / space_lat);
				return data(x, y);

			}else{
				return [ null, null ];
			}
		}

		// latlngでの風ベクトルを補間する
		function getInterpolatedVector(latlng) {
			var lat = latlng[0], lng = latlng[1];
			if ( isDefined(latlng) ){
				var x = Math.floor((lng - start_point[1]) / space_lng);
				var y = Math.floor((start_point[0] - lat) / space_lat);
				var dx = (lng - (start_point[1] + space_lng * x)) / space_lng;
				var dy = ((start_point[0] - space_lat * y) - lat) / space_lat;
				return bilinearInterpolateVector(dx, dy, data(x, y), data(x+1, y), data(x, y+1), data(x+1, y+1));

			}else{
				return [ null, null ]; //TODO
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
			create: create,
			isDefined: isDefined,
			get: get,
			getInterpolatedVector: getInterpolatedVector
		};
	}();

	// test
//	console.log(mesh.get([34, 132]));
//	console.log(mesh.get([35, 133]));
//	console.log(mesh.getInterpolatedVector([34.1, 130.1]));

	/**
	 * 描画面クラス
	 *   xy
	 */
	var field = function(){
		var grid = [];  // [u, v, m]
		var bounds;

		function create(mesh, projection) {
			function interpolateRow(y) {
				var row = [];
				for (var x = 0; x < 400; x+=2){
					var latlng = projection.unproject(x, y);
					var v = mesh.getInterpolatedVector(latlng);
					var wind = [ v[0], v[1], Math.sqrt(v[0]*v[0] + v[1]*v[1]) ];
					row[x] = row[x+1] = wind;
				}
				grid[y] = grid[y+1] = row;
			}

			for (var y = 0; y < 300; y+=2){
				interpolateRow(y);
			}
			console.log(grid);
		}

		function get(x, y) {
			var row = grid[Math.round(y)];
			return row && row[Math.round(x)] || NULL_VECTOR;
		}

		function isDefined(x, y){
			return get(x, y)[2] !== null;
		}

		function release() {
			grid = [];
		}

		function randomize(o) {
			var x, y;
			var safetyNet = 0;
			do {
				x = Math.round(_.random(0, 400));
				y = Math.round(_.random(0, 300));
			} while (!isDefined(x, y) && safetyNet++ < 30);
			o.x = x;
			o.y = y;
			return o;
		};

		return {
			create: create,
			get: get,
			isDefined: isDefined,
			release: release,
			randomize: randomize
		};
	}();


	/**
	 *   投射法
	 *  	mesh <-> field 
	 */
	var projection = function(){
		function project(latlng) {
			var x = 400/3 * (latlng[1] - 130);
			var y = 300/2 * (35 - latlng[0]);
			return [x, y];
		}

		function unproject(x, y) {
			var lat =  35 - 2/300 * y;
			var lng = 130 + 3/400 * x;
			return [lat, lng];
		}

		return {
			project: project,
			unproject: unproject
		};
	}();

	//console.log(projection.project([33,130]));
	//console.log(projection.unproject(0,300));


	function colorScale(step, maxWind){
		function asColorStyle(r, g, b, a) {
			return "rgba(" + r + ", " + g + ", " + b + ", " + a + ")";
		}

		var result = [];
		for (var j = 85; j <= 255; j += step) {
			result.push(asColorStyle(j, j, j, 1.0));
		}
		result.indexFor = function(m) {
			return Math.floor(Math.min(m, maxWind) / maxWind * (result.length - 1));
		};
		return result;
	}



	function animate(ctx){
		field.create(mesh, projection);

		var color = colorScale(10, 17);
		var fadeFillStyle = "rgba(0, 0, 0, 0.97)";
		var buckets = color.map(function(){ return []; });i
		var particleCount = Math.round(400 * PARTICLE_MULTIPLIER);
		var particles = [];
		for (var i = 0; i < particleCount; i++) {
			particles.push(field.randomize({age: _.random(0, MAX_PARTICLE_AGE)}));
		}

		function evolve() {
			buckets.forEach(function(bucket){ bucket.length = 0; });
			particles.forEach(function(particle){
				if ( particle.age > MAX_PARTICLE_AGE ){
					field.randomize(particle).age = 0;
				}

				var x = particle.x;
				var y = particle.y;
				var v = field.get(x, y);
				var m = v[2];
				if ( m === null ){
					particle.age = MAX_PARTICLE_AGE;

				}else{
					var xt = x + v[0];
					var yt = y + v[1];
					if ( field.isDefined(xt, yt) ){
						particle.xt = xt;
						particle.yt = yt;
						buckets[color.indexFor(m)].push(particle);

					}else{
						particle.x = xt;
						particle.y = yt;
					}
				}
				particle.age++;
			});
		}

		ctx.lineWidth = PARTICLE_LINE_WIDTH;
		ctx.fillStyle = fadeFillStyle;

		function draw() {
			function fade(){
            	var prev = ctx.globalCompositeOperation;
            	ctx.globalCompositeOperation = "destination-in";
            	ctx.fillRect(0, 0, 400, 300);
            	ctx.globalCompositeOperation = prev;
			}

			fade();
			buckets.forEach(function(bucket, i) {
				if ( bucket.length > 0 ){
					ctx.beginPath();
					ctx.strokeStyle = color[i];
					bucket.forEach(function(particle) {
						ctx.moveTo(particle.x, particle.y);
						ctx.lineTo(particle.xt, particle.yt);
						particle.x = particle.xt;
						particle.y = particle.yt;
					});
					ctx.stroke();
				}
			});
		}

		(function frame() {
			try {
				evolve();
				draw();
				setTimeout(frame, FRAME_RATE);

			} catch(e) {
				console.log(e);
			}
		})();
	}

	return {
		animate: animate
	};
}();
