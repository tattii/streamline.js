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

		// set events
		map.on('viewreset', this._update, this);
		map.on('moveend',   this._update, this);
		map.on('movestart', this._startUpdate, this);
		map.on('zoomstart', this._startZoom, this);
		map.on('zoomend',   this._endZoom, this);
		map.on('zoomanim', this._animateZoom, this);
		map.on('zoom', this._reset, this);

		// first draw
		this._update();
	},

	onRemove: function () {
		this._map.getPanes().overlayPane.removeChild(this._layer);
		this._map.off('viewreset');
		this._map.off('moveend');
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

	_endZoom: function (){
		console.log('zoom end');
		//this._scaleLayer();
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

			var unproject = (self._retina) ?
				function (x, y) { return self._map.unproject(originPoint.add([x/2, y/2]))} :
				function (x, y) { return self._map.unproject(originPoint.add([x, y]))}

			console.time("interpolate field");
			self.streamline.setField(windField, unproject, scale, true);
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
