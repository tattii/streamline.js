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
	initialize: function () {

	},

	onAdd: function (map) {
		this._map = map;
		this._width  = map.getSize().x;	
		this._height = map.getSize().y;	

		this._initLayer();

		// set events
		map.on('viewreset', this._update, this);
		map.on('moveend', this._update, this);

		// first draw
		this._update();
	},

	onRemove: function () {
		this._map.getPanes().overlayPane.removeChild(this._layer);
		this._map.off('viewreset');
		this._map.off('moveend');
	},

	_initLayer: function (){
		this._layer = L.DomUtil.create('div', 'stream-layer leaflet-zoom-hide');
		this._map.getPanes().overlayPane.appendChild(this._layer);

		this._maskCtx = this._initCanvas("mask-streamline");	
		this._streamCtx = this._initCanvas("streamline");	
		this._streamCtx.globalAlpha = 0.9;

		this.streamline = new Streamline(
			{ x:[0, this._width], y:[0, this._height] },
			this._streamCtx
		);
		this.streamline.setMask(this._maskCtx, 100);
	},

	_initCanvas: function (id) {
		var canvas = document.createElement("canvas");
		canvas.id = id;
		canvas.width = this._width;
		canvas.height = this._height;
		this._layer.appendChild(canvas);

		return canvas.getContext("2d");
	},

	_update: function (){
		L.DomUtil.setOpacity(this._layer, 0);
		var _this = this;

		this._getWindData(function(wind_field) {
			_this.streamline.setField(wind_field, _this._map, scale[t._map.getZoom()-5]);
			_this.streamline.animate();
			
			// move canvas position
			var point = _this._map.getPixelBounds().min;
			L.DomUtil.setPosition(t._layer, point);
			L.DomUtil.setOpacity(t._layer, 1.0);
		});
	},
	

});

L.streamline = function() {
	return new L.Streamline();
};
