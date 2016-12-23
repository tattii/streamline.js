/*
 * @class L.Streamline
 * @inherits L.Layer
 * @author Yuta Tachibana
 *
 * for leaflet v1.0
 *
 * requirements:
 *	streamline.js
 */

L.Streamline = L.Layer.extend({
	options: {
		onUpdate: function (){},
		onUpdated: function (){}
	},

	initialize: function (windData, options) {
		this._windData = windData;
		L.setOptions(this, options);
	},
	
	setWindData: function (windData) {
		this._windData = windData;
		this._update();
	},

	onAdd: function (map) {
		this._map = map;
		this._width  = map.getSize().x;	
		this._height = map.getSize().y;

		this._retina = window.devicePixelRatio >= 2;
		this._canvasWidth = (this._retina) ? this._width * 2 : this._width;
		this._canvasHeight = (this._retina) ? this._height * 2 : this._height;

		this._initLayer();

		// first draw
		this._update();
	},

	onRemove: function () {
		this._map.getPanes().overlayPane.removeChild(this._layer);
		this._map.off('viewreset');
		this._map.off('moveend');
	},

	getEvents: function (){
		return {
			viewreset: this._update,
			moveend:   this._update,
			movestart: this._startUpdate,
			zoomStart: this._startZoom,
			zoom:      this._reset,
			zoomanim:  this._animateZoom
		};
	},

	_initLayer: function (){
		this._layer = L.DomUtil.create('div', 'streamline-layer');
		this._map.getPanes().overlayPane.appendChild(this._layer);
		this._layerCanvases = [];

		this._maskCtx = this._initCanvas("streamline-layer-mask", 3);	
		this._streamCtx = this._initCanvas("streamline-layer-stream", 2);	
		this._streamCtx.globalAlpha = 0.9;

		this.streamline = new Streamline(
			this._canvasWidth,
			this._canvasHeight,
			this._streamCtx,
			{ retina: this._retina, maskCtx: this._maskCtx }
		);
	},

	_initCanvas: function (id, zindex) {
		var canvas = document.createElement("canvas");
		canvas.id = id;
		canvas.width = this._canvasWidth;
		canvas.height = this._canvasHeight;
		canvas.style.position = 'absolute';
		canvas.style.top = 0;
		canvas.style.left = 0;
		canvas.style.zIndex = zindex;
		canvas.style.willChange = 'transform';
		canvas.style.width = this._width + 'px';
		canvas.style.height = this._height + 'px';

		this._layer.appendChild(canvas);
		this._layerCanvases.push(canvas);

		return canvas.getContext("2d");
	},

	_startUpdate: function (){
		if (!this._updating){
			this._updating = true;
			this.options.onUpdate();
		}
	},

	_startZoom: function (){
		this._startUpdate();
		this.streamline.cancel();
	},

	_animateZoom: function (e) {
		var scale = this._map.getZoomScale(e.zoom, this.zoom),
			offset = this._map._latLngBoundsToNewLayerBounds(this.bounds, e.zoom, e.center).min;

		this._setLayerCanvasScale(scale);
		L.DomUtil.setPosition(this._layer, offset);
	},

	_reset: function (){
		var zoom = this._map.getZoom();
		var scale = Math.pow(2, zoom - this.zoom);
		var pos = this._map.latLngToLayerPoint(this.origin);
		
		this._setLayerCanvasScale(scale);	
		L.DomUtil.setPosition(this._layer, pos);
	},

	_setLayerCanvasScale: function (scale){
		var self = this;
		this._layerCanvases.forEach(function (canvas){
			canvas.style.width = (self._width * scale) + 'px';
			canvas.style.height = (self._height * scale) + 'px';
		});
	},

	_update: function (){
		console.log('update');
		this._startUpdate();
		if (this._loading){
			// interrupt
			this._windData.abort();
			//this.streamline.cancel();
		}
		this._loading = true;

		var bounds = this._map.getBounds(),
			zoom = this._map.getZoom(),
			scale = this._getScale(zoom);
		var self = this;

		this._windData.getWindField(bounds, zoom, function (windField) {
			var origin = self._map.getBounds().getNorthWest();
			var originPoint = self._map.project(origin);

			console.time("interpolate field");
			var mercatorField = new StreamlineFieldMercator({
				field: windField,
				scale: scale,
				inverseV: true,
				retina: self._retina,
				originPoint: originPoint,
				zoom: self._map.getZoom()
			});
			self.streamline.setCustomField(mercatorField);
			console.timeEnd("interpolate field");
			
			console.time("start animating");
			self.streamline.animate();
			console.timeEnd("start animating");

			// show streamline
			self.zoom = zoom;
			self.origin = origin;
			self.bounds = bounds;
			self._reset();
			
			// done
			self._updating = false;
			self._loading = false;
			self.options.onUpdated();
		});
	},
	
	_getScale: function (zoom) {
		var scale = [0.3, 0.4, 0.6, 0.8, 1.0];
		return scale[zoom - 5];
	}
});

L.streamline = function() {
	return new L.Streamline();
};


/*
 * StreamlineFieldMercator - specified for Spherical Mercator
 *
 */

function StreamlineFieldMercator (args) {
	this.field = args.field;
	
	// set scales
	if (!args.retina) args.scale /= 2;
	this.scale_u = args.scale || 1;
	this.scale_v = args.scale || 1;
	if (args.inverseV) this.scale_v *= -1;

	// color
	this.maxv = 100;
	this.color = new ExtendedSinebowColor(Streamline.prototype.MASK_ALPHA);

	// mercator
	this.originPoint = args.originPoint;
	this._scale = 256 * Math.pow(2, args.zoom);
	this._retinaScale = (args.retina) ? 2 : 1;

	// sherical mercator const
	this._R = L.Projection.SphericalMercator.R;
	this._mercatorScale = 0.5 / (Math.PI * this._R);
}

StreamlineFieldMercator.prototype.init = function (width, height, mask) {
	this.width = width;
	this.height = height;
	this.mask = mask;
};

StreamlineFieldMercator.prototype.interpolate = function () {
	this._X = [];
	for (var x = 0; x < this.width; x += 2){
		var lng = this.unprojectLng(x);
		this._X.push(this.field.getDx(lng));
	}

	this.rows = [];
	for (var y = 0; y < this.height; y += 2){
		this._interpolateRow(y);
	}
};

// interpolate vectors each 2x2 pixels
StreamlineFieldMercator.prototype._interpolateRow = function (y) {
	var lat = this.unprojectLat(y);
	var Y = this.field.getDy(lat);

	var row = [];

	for (var x = 0; x < this.width; x += 2){
		var v = this.field.getVectorXY(this._X[x/2], Y);

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


StreamlineFieldMercator.prototype.unprojectLat = function (y) {
	var Y = this.originPoint.y + y / this._retinaScale;
	var my = (0.5 - Y / this._scale) / this._mercatorScale;
	var lat = (2 * Math.atan(Math.exp(my / this._R)) - (Math.PI / 2)) * 180 / Math.PI;
	return lat;
};

StreamlineFieldMercator.prototype.unprojectLng = function (x) {
	var X = this.originPoint.x + x / this._retinaScale;
	var mx = (X / this._scale - 0.5) / this._mercatorScale;
	var lng = mx * 180 / Math.PI / this._R;
	return lng;
};


StreamlineFieldMercator.prototype.get = function (x, y) {
	var row = this.rows[Math.round(y / 2)];
	return row && row[Math.round(x / 2)] || Streamline.prototype.NULL_VECTOR;
};

StreamlineFieldMercator.prototype.isDefined = function (x, y) {
	return this.get(x, y)[2] !== null;
};

StreamlineFieldMercator.prototype.randomize = function (particle) {
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

StreamlineFieldMercator.prototype.getColor = function (x) {
	return this.color.color(Math.min(x, this.maxv) / this.maxv);
};

