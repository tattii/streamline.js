/**
 * Streamline - vector field visualization using canvas
 *
 * @author Yuta Tachibana
 *
 * inspired from https://github.com/cambecc/earth
 *
 */

function Streamline(bound, streamCtx) {

	var PARTICLE_MULTIPLIER = 7;
	var PARTICLE_LINE_WIDTH = 1.0;
	var MAX_PARTICLE_AGE = 100;
	var MASK_ALPHA = Math.floor(0.3*255);
	var FRAME_RATE = 40;
	var NULL_VECTOR = [NaN, NaN, null];
	var TRANSPARENT_BLACK = [0,0,0,0];

	bound.width  = bound.x[1] - bound.x[0];
	bound.height = bound.y[1] - bound.y[0];

	console.log(bound);

	var timer;  // frame rate timer
	var mask;   // mask canvas
	var maxv = 100; // mask relative max value
	var _cancel = false;
	
	// Grid - set of vectors, same size of canvas
	// vector: [wind_u, wind_v, wind_speed]
	var Grid = function(){
		var rows = [];

		// set vectors
		// field: require getVector(latlon) method
		function set(field, unproject, scale, inverseV) {
			var scale_u = 1, scale_v = 1;
			if (scale) {
				scale_u = scale_v = scale;
			}	
			if (inverseV){
				scale_v *= -1;
			}

			rows = [];
			for (var y = bound.y[0]; y < bound.y[1]; y+=2){
				interpolateRow(y);
			}

			// interpolate vectors each 2x2 pixels
			function interpolateRow(y) {
				var row = [];
				for (var x = bound.x[0]; x < bound.x[1]; x += 2){
					var latlng = unproject(x, y);
					var v = field.getVector(latlng);

					// set vector
					var wind = (v[0] == null) ?
						NULL_VECTOR : 
						[ v[0] * scale_u, v[1] * scale_v, Math.sqrt(v[0]*v[0] + v[1]*v[1]) ];
					row[x] = row[x+1] = wind;

					// set color mask from wind speed
					if (mask){
						var color = (v[0] == null) ?
							TRANSPARENT_BLACK :
							extendedSinebowColor(Math.min(wind[2], maxv) / maxv, MASK_ALPHA);
						mask.set(x,   y,   color)
							.set(x+1, y,   color)
							.set(x,   y+1, color)
							.set(x+1, y+1, color);
					}
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

	function setField(field, unproject, scale, inverseV){
		if (timer) clearTimeout(timer);
		streamCtx.clearRect(0, 0, bound.width, bound.height);
		Grid.release();
		if (_cancel) return canceled();
		Grid.set(field, unproject, scale, inverseV);
	}


	// color mask
	function Mask (maskCtx){
		maskCtx.fillStyle = "rgba(0,0,0,1)";
		maskCtx.fill();

		var imageData = maskCtx.getImageData(0, 0, bound.width, bound.height);
		var data = imageData.data;

		return {
			imageData: imageData,
			isVisible: function(x, y) {
				return data[(y*bound.width + x)*4 + 3] > 0;
			},
			set: function(x, y, rgba) {
				var i = (y * bound.width + x) * 4;
				data[ i ] = rgba[0];
				data[i+1] = rgba[1];
				data[i+2] = rgba[2];
				data[i+3] = rgba[3];
				return this;
			},
			draw: function() {
				maskCtx.putImageData(imageData, 0, 0);
			}
		};
	}

	function setMask(ctx, max_value) {
		mask = Mask(ctx);
		maxv = max_value;
	}

	
	// colors
	function colorInterpolator(start, end) {
		var r = start[0], g = start[1], b = start[2];
		var dr = end[0] - r, dg = end[1] - g, db = end[2] - b;
		return function(i, a) {
			return [Math.floor(r + i * dr), Math.floor(g + i * dg), Math.floor(b + i * db), a];
		};
	}

	function sinebowColor(hue, a) {
		// Map hue [0, 1] to radians [0, 5/6τ]. Don't allow a full rotation because that keeps hue == 0 and
		// hue == 1 from mapping to the same color.
		var rad = hue * 2 * Math.PI * 5/6;
		rad *= 0.75;  // increase frequency to 2/3 cycle per rad

		var s = Math.sin(rad);
		var c = Math.cos(rad);
		var r = Math.floor(Math.max(0, -c) * 255);
		var g = Math.floor(Math.max(s, 0) * 255);
		var b = Math.floor(Math.max(c, 0, -s) * 255);
		return [r, g, b, a];
	}

	var BOUNDARY = 0.45;
	var fadeToWhite = colorInterpolator(sinebowColor(1.0, 0), [255, 255, 255]);
	function extendedSinebowColor(i, a) {
		return i <= BOUNDARY ?
			sinebowColor(i / BOUNDARY, a) :
			fadeToWhite((i - BOUNDARY) / (1 - BOUNDARY), a);
	}

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


	// animate streamline
	function animate(density){
		if (_cancel) return canceled();
		var color = colorScale(10, 17);
		var fadeFillStyle = "rgba(0, 0, 0, 0.97)";
		var buckets = color.map(function(){ return []; });
		if (!density) density = 1;

		var particleCount = Math.round(bound.width * PARTICLE_MULTIPLIER * density);
		console.log("particles:" + particleCount)
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

		streamCtx.lineWidth = PARTICLE_LINE_WIDTH;
		streamCtx.fillStyle = fadeFillStyle;

		function draw() {
			function fade(){
            	var prev = streamCtx.globalCompositeOperation;
            	streamCtx.globalCompositeOperation = "destination-in";
            	streamCtx.fillRect(bound.x[0], bound.y[0], bound.width, bound.height);
            	streamCtx.globalCompositeOperation = prev;
			}

			fade();
			buckets.forEach(function(bucket, i) {
				if ( bucket.length > 0 ){
					streamCtx.beginPath();
					streamCtx.strokeStyle = color[i];
					bucket.forEach(function(particle) {
						streamCtx.moveTo(particle.x, particle.y);
						streamCtx.lineTo(particle.xt, particle.yt);
						particle.x = particle.xt;
						particle.y = particle.yt;
					});
					streamCtx.stroke();
				}
			});
		}

		if (mask) mask.draw();
		(function frame() {
			if (_cancel) return canceled();
			try {
				evolve();
				draw();
				timer = setTimeout(frame, FRAME_RATE);

			} catch(e) {
				console.log(e);
			}
		})();
	}

	function cancel () {
		_cancel = true;
	}

	function cenceled () {
		_cancel = false;
	}

	return {
		setField: setField,
		setMask: setMask,
		animate: animate,
		cancel: cancel
	};
}

