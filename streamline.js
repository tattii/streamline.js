/**
 *   Streamline.js - vector field visualization using canvas
 *
 *   NOTE: stream.setField(field, projection);
 *		field: require getVector method
 *			get vector at any point(x,y) on canvas
 *		projection: require unproject method
 *			project canvas point(x,y) to field point(cf. latlng)
 */
function Streamline(bound) {

	var PARTICLE_MULTIPLIER = 7;
	var PARTICLE_LINE_WIDTH = 1.0;
	var MAX_PARTICLE_AGE = 100;
	var FRAME_RATE = 40;
	var NULL_VECTOR = [NaN, NaN, null];

	bound.width  = bound.x[1] - bound.x[0];
	bound.height = bound.y[1] - bound.y[0];

	
	/**
	 *	Grid - canvasと同じ大きさのベクトル集合
	 *		fieldから生成
	 *   	xy
	 *   	vector: [u, v, m]
	 */
	var Grid = function(){
		var rows = [];

		function set(field, projection) {
			rows = [];
			for (var y = bound.y[0]; y < bound.y[1]; y+=2){
				interpolateRow(y);
			}

			function interpolateRow(y) {
				var row = [];
				for (var x = bound.x[0]; x < bound.x[1]; x+=2){
					var latlng = projection.unproject(x, y);
					var v = field.getVector(latlng);
					var wind = [ v[0], v[1], Math.sqrt(v[0]*v[0] + v[1]*v[1]) ];
					row[x] = row[x+1] = wind;
				}
				rows[y] = rows[y+1] = row;
			}
		}

		function get(x, y) {
			var row = rows[Math.round(y)];
			return row && row[Math.round(x)] || NULL_VECTOR;
		}

		function isDefined(x, y){
			return get(x, y)[2] !== null;
		}

		function release() {
			rows = [];
		}

		function randomize(o) {
			var x, y;
			var safetyNet = 0;
			do {
				x = Math.round(_.random(bound.x[0], bound.x[1]));
				y = Math.round(_.random(bound.y[0], bound.y[1]));
			} while (!isDefined(x, y) && safetyNet++ < 30);
			o.x = x;
			o.y = y;
			return o;
		};

		return {
			set: set,
			get: get,
			isDefined: isDefined,
			release: release,
			randomize: randomize
		};
	}();


	
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


	/**
	 *   animate stream
	 *		require canvas context
	 */
	function animate(ctx){
		var color = colorScale(10, 17);
		var fadeFillStyle = "rgba(0, 0, 0, 0.97)";
		var buckets = color.map(function(){ return []; });i
		var particleCount = Math.round(bound.width * PARTICLE_MULTIPLIER);
		var particles = [];
		for (var i = 0; i < particleCount; i++) {
			particles.push(Grid.randomize({age: _.random(0, MAX_PARTICLE_AGE)}));
		}

		function evolve() {
			buckets.forEach(function(bucket){ bucket.length = 0; });
			particles.forEach(function(particle){
				if ( particle.age > MAX_PARTICLE_AGE ){
					Grid.randomize(particle).age = 0;
				}

				var x = particle.x;
				var y = particle.y;
				var v = Grid.get(x, y);
				var m = v[2];
				if ( m === null ){
					particle.age = MAX_PARTICLE_AGE;

				}else{
					var xt = x + v[0];
					var yt = y + v[1];
					if ( Grid.isDefined(xt, yt) ){
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
            	ctx.fillRect(bound.x[0], bound.y[0], bound.width, bound.height);
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
		setField: function(f,p){ Grid.set(f,p); },
		animate: animate
	};
}

