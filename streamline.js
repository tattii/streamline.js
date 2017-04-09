/**
 * Streamline.js - vector field visualization using canvas
 *
 * @author Yuta Tachibana
 *
 * inspired from https://github.com/cambecc/earth
 *
 */


// settings
Streamline.prototype.PARTICLE_MULTIPLIER = 4;
Streamline.prototype.PARTICLE_LINE_WIDTH = 1;
Streamline.prototype.MAX_PARTICLE_AGE = 100;
Streamline.prototype.MASK_ALPHA = Math.floor(0.3 * 255);
Streamline.prototype.FRAME_RATE = 1000 / 30;
Streamline.prototype.NULL_VECTOR = [NaN, NaN, null];
Streamline.prototype.TRANSPARENT_BLACK = [0, 0, 0, 0];


function Streamline (width, height, streamCtx, option) {
	this.width = width;
	this.height = height;
	this.streamCtx = streamCtx;

	if (option.retina){
		this.retina = true;
		Streamline.prototype.PARTICLE_MULTIPLIER /= 2;
		Streamline.prototype.PARTICLE_LINE_WIDTH = 2;
	}
	
	if (option.maskCtx){
		this.maskCtx = option.maskCtx;
		this.mask = new StreamlineMask(this.maskCtx, this.width, this.height);
	}

	this.animation = new StreamlineAnimate(this.streamCtx, this.width, this.height);
	console.log("field:" + this.width + "x" + this.height + " retina:" + this.retina);
}

Streamline.prototype.setField = function (field, unproject, scale, inverseV) {
	this.field = new StreamlineField({
		width: this.width,
		height: this.height,
		field: field,
		unproject: unproject,
		mask: this.mask,
		scale: scale,
		inverseV: inverseV
	});
	this.field.interpolate();
};

Streamline.prototype.setCustomField = function (customField) {
	this.field = customField;
	this.field.init(this.width, this.height, this.mask);
	this.field.interpolate();
};

Streamline.prototype.setMaskField = function (field) {
	this.mask_field = field;
	this.mask_field.init(this.width, this.height, this.mask);
	this.mask_field.interpolate();
	this.mask.draw();
};


Streamline.prototype.animate = function () {
	if (this.mask) this.mask.draw();
	this.animation.start(this.field);
};

Streamline.prototype.cancel = function () {
	if (this.animatino) this.animation.cancel();
};


/*
 * StreamlineField - set of vectors, same size of canvas
 *   vector: [ wind_u, wind_v, wind_speed ]
 */
function StreamlineField (args) {
	this.width = args.width;
	this.height = args.height;
	this.mask = args.mask; // wind speed mask

	this.field = args.field
	this.unproject = args.unproject

	// set scales
	this.scale_u = (args.scale) ? args.scale : 1;
	this.scale_v = (args.scale) ? args.scale : 1;
	if (args.inverseV) this.scale_v *= -1;

	// color
	this.maxv = 100;
	this.color = new ExtendedSinebowColor(Streamline.prototype.MASK_ALPHA);
};

StreamlineField.prototype.interpolate = function () {
	this.rows = [];
	for (var y = 0; y < this.height; y += 2){
		this._interpolateRow(y);
	}
};

// interpolate vectors each 2x2 pixels
StreamlineField.prototype._interpolateRow = function (y) {
	var row = [];
	for (var x = 0; x < this.width; x += 2){
		var latlng = this.unproject(x, y);
		var v = this.field.getVector(latlng);

		// set vector
		var wind = (v[0] == null) ?
			Streamline.prototype.NULL_VECTOR : 
			[
				v[0] * this.scale_u,
				v[1] * this.scale_v,
				Math.sqrt(v[0]*v[0] + v[1]*v[1])
			];
		row[x / 2] = wind;

		// set color mask from wind speed
		if (this.mask){
			var color = (v[0] == null) ?
				Streamline.prototype.TRANSPARENT_BLACK :
				this.getColor(wind[2]);

			this.mask.set(x,   y,   color)
			this.mask.set(x+1, y,   color)
			this.mask.set(x,   y+1, color)
			this.mask.set(x+1, y+1, color);
		}
	}

	this.rows[y / 2] = row;
};

StreamlineField.prototype.get = function (x, y) {
	var row = this.rows[Math.round(y / 2)];
	return row && row[Math.round(x / 2)] || Streamline.prototype.NULL_VECTOR;
};

StreamlineField.prototype.isDefined = function (x, y) {
	return this.get(x, y)[2] !== null;
};

StreamlineField.prototype.randomize = function (particle) {
	var x, y;
	var safetyNet = 0;
	do {
		x = Math.round(Math.random() * this.width);
		y = Math.round(Math.random() * this.height);
	} while (!this.isDefined(x, y) && safetyNet++ < 30);

	particle.x = x;
	particle.y = y;
	return particle;
};

StreamlineField.prototype.getColor = function (x) {
	return this.color.color(Math.min(x, this.maxv) / this.maxv);
};


/*
 * StreamlineMask - color mask
 */
function StreamlineMask (maskCtx, width, height){
	this.maskCtx = maskCtx;
	this.width = width;
	this.height = height;

	// init
	this.maskCtx.fillStyle = "rgba(0,0,0,1)";
	this.maskCtx.fill();
	this.imageData = this.maskCtx.getImageData(0, 0, this.width, this.height);
	this.data = this.imageData.data;
}

StreamlineMask.prototype.isVisible = function (x, y) {
	return this.data[(y * this.width + x) * 4 + 3] > 0;
};

StreamlineMask.prototype.set = function (x, y, rgba) {
	var i = (y * this.width + x) * 4;
	this.data[ i ] = rgba[0];
	this.data[i+1] = rgba[1];
	this.data[i+2] = rgba[2];
	this.data[i+3] = rgba[3];
};

StreamlineMask.prototype.draw = function () {
	this.maskCtx.putImageData(this.imageData, 0, 0);
};


/*
 * Streamline animate
 */
function StreamlineAnimate(streamCtx, width, height, density){
	this.streamCtx = streamCtx;
	this.width = width;
	this.height = height;
		
	this.streamCtx.lineWidth = Streamline.prototype.PARTICLE_LINE_WIDTH;
	
	this.color = this.colorScale(10, 17);

	// decide particle count
	if (!density) density = 1;
	var area = width * height / 1200;
	var count = Math.round(area * density * Streamline.prototype.PARTICLE_MULTIPLIER);
	this.particleCount = (count > 5000) ? Math.round(count * 0.7) : count; 
	console.log("particles:" + this.particleCount);
}


StreamlineAnimate.prototype.init = function () {
	this.buckets = this.color.map(function(){ return []; });
	this.particles = [];

	for (var i = 0; i < this.particleCount; i++) {
		this.particles.push(
			this.field.randomize({
				age: Math.floor(Math.random() * Streamline.prototype.MAX_PARTICLE_AGE)
			})
		);
	}
};

StreamlineAnimate.prototype.evolve = function () {
	var self = this;
	this.buckets.forEach(function(bucket){ bucket.length = 0; });
	this.particles.forEach(function(particle){
		if ( particle.age > Streamline.prototype.MAX_PARTICLE_AGE ){
			self.field.randomize(particle).age = 0;
		}

		var v = self.field.get(particle.x, particle.y);
		var m = v[2];
		if ( m === null ){
			particle.age = Streamline.prototype.MAX_PARTICLE_AGE;

		}else{
			var xt = particle.x + v[0];
			var yt = particle.y + v[1];
			if ( self.field.isDefined(xt, yt) ){
				particle.xt = xt;
				particle.yt = yt;
				self.buckets[self.color.indexFor(m)].push(particle);

			}else{
				particle.x = xt;
				particle.y = yt;
			}
		}
		particle.age++;
	});
};

StreamlineAnimate.prototype.fade = function () {
	var prev = this.streamCtx.globalCompositeOperation;
	this.streamCtx.globalCompositeOperation = "destination-in";
	this.streamCtx.fillStyle = "rgba(0, 0, 0, 0.97)";
	this.streamCtx.fillRect(0, 0, this.width, this.height);
	this.streamCtx.globalCompositeOperation = prev;
};

StreamlineAnimate.prototype.draw = function () {
	this.fade();

	var self = this;
	this.buckets.forEach(function(bucket, i) {
		if ( bucket.length > 0 ){
			self.streamCtx.beginPath();
			self.streamCtx.strokeStyle = self.color[i];

			bucket.forEach(function(particle) {
				self.streamCtx.moveTo(particle.x, particle.y);
				self.streamCtx.lineTo(particle.xt, particle.yt);

				particle.x = particle.xt;
				particle.y = particle.yt;
			});

			self.streamCtx.stroke();
		}
	});
};

StreamlineAnimate.prototype.start = function (field) {
	if (this.timer) clearTimeout(this.timer);
	this.streamCtx.clearRect(0, 0, this.width, this.height);

	// fill light grey for fading trace 
	// 0.97^n -> 0 but 0.97^150 = 0.0103...
	this.streamCtx.fillStyle = "rgba(255, 255, 255, 0.02)";
	this.streamCtx.fillRect(0, 0, this.width, this.height);

	this.field = field;
	this.init();

	var self = this;
	(function frame() {
		try {
			self.evolve();
			self.draw();
			self.timer = setTimeout(frame, Streamline.prototype.FRAME_RATE);

		} catch (e) {
			console.error(e);
		}
	})();
};

StreamlineAnimate.prototype.cancel = function () {
	if (this.timer) clearTimeout(this.timer);
};

StreamlineAnimate.prototype.colorScale = function (step, max) {
	function asColorStyle(r, g, b, a) {
		return "rgba(" + r + ", " + g + ", " + b + ", " + a + ")";
	}

	// create gray color scale
	var res = [];
	for (var j = 85; j <= 255; j += step) {
		res.push(asColorStyle(j, j, j, 1.0));
	}

	res.indexFor = function (m) {
		return Math.floor(Math.min(m, max) / max * (res.length - 1));
	};
	return res;
};



/*
 * colors
 */

function ExtendedSinebowColor (alpha) {
	this.boundary = 0.45;
	this.alpha = alpha;
	this.fadeToWhite = this.colorInterpolator(
		this.sinebowColor(1.0, 0),
		[255, 255, 255]
	);
}

ExtendedSinebowColor.prototype.color = function (x) {
	return x <= this.boundary ?
		this.sinebowColor(x / this.boundary, this.alpha) :
		this.fadeToWhite((x - this.boundary) / (1 - this.boundary), this.alpha);
}

ExtendedSinebowColor.prototype.colorInterpolator = function (start, end) {
	var r = start[0], g = start[1], b = start[2];
	var dr = end[0] - r, dg = end[1] - g, db = end[2] - b;

	return function(i, a) {
		return [
			Math.floor(r + i * dr),
			Math.floor(g + i * dg),
			Math.floor(b + i * db),
			a
		];
	};
};

ExtendedSinebowColor.prototype.sinebowColor = function (hue, a) {
	// Map hue [0, 1] to radians [0, 5/6τ].
	var rad = hue * 2 * Math.PI * 5/6;
	rad *= 0.75;  // increase frequency to 2/3 cycle per rad

	var s = Math.sin(rad);
	var c = Math.cos(rad);
	var r = Math.floor(Math.max(0, -c) * 255);
	var g = Math.floor(Math.max(s, 0) * 255);
	var b = Math.floor(Math.max(c, 0, -s) * 255);
	return [r, g, b, a];
};



function SegmentedColorScale(segments) {
	var points = [], interpolators = [], ranges = [];
	for (var i = 0; i < segments.length - 1; i++) {
		points.push(segments[i+1][0]);
		interpolators.push(colorInterpolator(segments[i][1], segments[i+1][1]));
		ranges.push([segments[i][0], segments[i+1][0]]);
	}

	function colorInterpolator(start, end) {
		var r = start[0], g = start[1], b = start[2];
		var Δr = end[0] - r, Δg = end[1] - g, Δb = end[2] - b;
		return function(i, a) {
			return [Math.floor(r + i * Δr), Math.floor(g + i * Δg), Math.floor(b + i * Δb), a];
		};
	}

	return function(point, alpha) {
		var i;
		for (i = 0; i < points.length - 1; i++) {
			if (point <= points[i]) {
				break;
			}
		}
		var low = ranges[i][0], high = ranges[i][1];
		var dt = (Math.max(low, Math.min(point, high)) - low) / (high - low);
		return interpolators[i](dt, alpha);
	};
}



