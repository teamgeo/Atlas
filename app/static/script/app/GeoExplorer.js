/**
 * Copyright (c) 2009-2011 The Open Planning Project
 */

Ext.USE_NATIVE_JSON = true;

// Fixes problem with OpenLayers.Projection.defaults and RD EPSG
OpenLayers.Projection.defaults = {
	"EPSG:28992": {
		units: "m",
		maxExtent: [102009, 480557, 129270, 506221],
		yx: false
	},
	"EPSG:4326": {
		units: "degrees",
		maxExtent: [-180, -90, 180, 90],
		yx: true
	},
	"CRS:84": {
		units: "degrees",
		maxExtent: [-180, -90, 180, 90]
	},
	"EPSG:900913": {
		units: "m",
		maxExtent: [-20037508.34, -20037508.34, 20037508.34, 20037508.34]
	}
};

// http://www.sencha.com/forum/showthread.php?141254-Ext.Slider-not-working-properly-in-IE9
// TODO re-evaluate once we move to Ext 4
Ext.override(Ext.dd.DragTracker, {
    onMouseMove: function (e, target) {
        if (this.active && Ext.isIE && !Ext.isIE9 && !e.browserEvent.button) {
            e.preventDefault();
            this.onMouseUp(e);
            return;
        }
        e.preventDefault();
        var xy = e.getXY(), s = this.startXY;
        this.lastXY = xy;
        if (!this.active) {
            if (Math.abs(s[0] - xy[0]) > this.tolerance || Math.abs(s[1] - xy[1]) > this.tolerance) {
                this.triggerStart(e);
            } else {
                return;
            }
        }
        this.fireEvent('mousemove', this, e);
        this.onDrag(e);
        this.fireEvent('drag', this, e);
    }
});

/**
 * api: (define)
 * module = GeoExplorer
 * extends = gxp.Viewer
 */

/** api: constructor
 *  .. class:: GeoExplorer(config)
 *     Create a new GeoExplorer application.
 *
 *     Parameters:
 *     config - {Object} Optional application configuration properties.
 *
 *     Valid config properties:
 *     map - {Object} Map configuration object.
 *     sources - {Object} An object with properties whose values are WMS endpoint URLs
 *
 *     Valid map config properties:
 *         projection - {String} EPSG:xxxx
 *         units - {String} map units according to the projection
 *         maxResolution - {Number}
 *         layers - {Array} A list of layer configuration objects.
 *         center - {Array} A two item array with center coordinates.
 *         zoom - {Number} An initial zoom level.
 *
 *     Valid layer config properties (WMS):
 *     name - {String} Required WMS layer name.
 *     title - {String} Optional title to display for layer.
 */
var GeoExplorer = Ext.extend(gxp.Viewer, {

    // Begin i18n.
    zoomSliderText: "<div>Zoom Level: {zoom}</div><div>Scale: 1:{scale}</div>",
    loadConfigErrorText: "Trouble reading saved configuration: <br />",
    loadConfigErrorDefaultText: "Server Error.",
    xhrTroubleText: "Communication Trouble: Status ",
    layersText: "Layers",
    titleText: "Title",
    bookmarkText: "Bookmark URL",
    permakinkText: 'Permalink',
    appInfoText: "GeoExplorer",
    aboutText: "About GeoExplorer",
    mapInfoText: "Map Info",
    descriptionText: "Description",
    contactText: "Contact",
    aboutThisMapText: "About this Map",
    // End i18n.
    
    /**
     * private: property[mapPanel]
     * the :class:`GeoExt.MapPanel` instance for the main viewport
     */
    mapPanel: null,
    
    toggleGroup: "toolGroup",

    constructor: function(config) {
        // both the Composer and the Viewer need to know about the viewerTools
        // First row in each object is needed to correctly render a tool in the treeview
        // of the embed map dialog. TODO: make this more flexible so this is not needed.
        config.viewerTools = new this.getViewerTools();

        GeoExplorer.superclass.constructor.apply(this, arguments);
    }, 

    getViewerTools: function() {
        var tools = [
            {
                leaf: true, 
                text: gxp.plugins.Navigation.prototype.tooltip, 
                checked: false, 
                iconCls: "gxp-icon-pan",
                ptype: "gxp_navigation",
                toggleGroup: "navigation"
            }, {
                leaf: true, 
                text: gxp.plugins.WMSGetFeatureInfo.prototype.infoActionTip, 
                checked: true, 
                iconCls: "gxp-icon-getfeatureinfo",
                ptype: "gxp_wmsgetfeatureinfo",
                layerParams: ["CQL_FILTER"],
                format: 'html',
                defaultAction: 0,
                toggleGroup: this.toggleGroup
            }, {
                leaf: true, 
                text: gxp.plugins.Measure.prototype.measureTooltip, 
                checked: false, 
                iconCls: "gxp-icon-measure-length",
                ptype: "gxp_measure",
                controlOptions: {immediate: true},
                toggleGroup: this.toggleGroup
            }, {
                leaf: true, 
                text: gxp.plugins.Zoom.prototype.zoomInTooltip + " / " + gxp.plugins.Zoom.prototype.zoomOutTooltip, 
                checked: false, 
                iconCls: "gxp-icon-zoom-in",
                numberOfButtons: 2,
                ptype: "gxp_zoom"
            }, {
                leaf: true, 
                text: gxp.plugins.ZoomToExtent.prototype.tooltip, 
                checked: false, 
                iconCls: gxp.plugins.ZoomToExtent.prototype.iconCls,
                ptype: "gxp_zoomtoextent"
            }, {
                leaf: true, 
                text: gxp.plugins.LegendControl.prototype.tooltip, 
                checked: true,
                iconCls: gxp.plugins.LegendControl.prototype.iconCls,
                ptype: "app_legendcontrol"
            }, {
                hidden: true,
                leaf: false,
                ptype: "app_zoomcontrol",
                actionTarget: "map",
                checked: true
        }];

        return tools;
    },

    loadConfig: function(config) {
       
        var mapUrl = window.location.hash.substr(1);
        var match = mapUrl.match(/^maps\/(\d+)$/);
        var bookm = mapUrl.match(/q=/);
        var filter = mapUrl.match(/filter=/);
        if (match) {
            this.id = Number(match[1]);
            Ext.Ajax.request({
                url: "../" + mapUrl,
                success: function(request) {
                    var addConfig = Ext.util.JSON.decode(request.responseText);
                    // Don't use persisted tool configurations from old maps
                    delete addConfig.tools;
                    addConfig.map.controls = config.map.controls;
                    this.applyConfig(Ext.applyIf(addConfig, config));
                },
                failure: function(request) {
                    var obj;
                    try {
                        obj = Ext.util.JSON.decode(request.responseText);
                    } catch (err) {
                        // pass
                    }
                    var msg = this.loadConfigErrorText;
                    if (obj && obj.error) {
                        msg += obj.error;
                    } else {
                        msg += this.loadConfigErrorDefaultText;
                    }
                    this.on({
                        ready: function() {
                            this.displayXHRTrouble(msg, request.status);
                        },
                        scope: this
                    });
                    delete this.id;
                    //window.location.hash = "";
                    this.applyConfig(config);
                },
                scope: this
            });
		} else if (bookm) {
			var urlConf = unescape(mapUrl.split('q=')[1]);
			var queryConfig = Ext.util.JSON.decode(urlConf);
            // Use some settings, not all
            config.map.layers = queryConfig.map.layers;
            config.map.zoom = queryConfig.map.zoom;
            config.map.center = queryConfig.map.center;
			this.applyConfig(config);
        } else if (filter) {
            //http://localhost:8080/composer/#filter={"source": "intranet","name": "geo:lki_perceel","cql_filter": "aanduiding = 'ZDM01E01354'"}
            var urlConf = unescape(mapUrl.split('filter=')[1]);
            var queryConfig = Ext.util.JSON.decode(urlConf);

            config.map.layers.push({
                source: queryConfig.source,
                name: queryConfig.name,
                cql_filter: queryConfig.cql_filter,
                selected: true
            });
            this.applyConfig(config);

            this.on('layerselectionchange', function(rec) {
                this.zoomToFilter(rec)
            }, this, {single: true}); 
        } else {
            var query = Ext.urlDecode(document.location.search.substr(1));
            if (query) {
                if (query.q) {
                    var queryConfig = Ext.util.JSON.decode(query.q);
                    Ext.apply(config, queryConfig);
                }
                /**
                 * Special handling for links from local GeoServer.
                 *
                 * The layers query string value indicates layers to add as 
                 * overlays from the local source.
                 *
                 * The bbox query string value indicates the initial extent in
                 * the current map projection.
                 */
                 if (query.layers) {
                     var layers = query.layers.split(/\s*,\s*/);
                     for (var i=0,ii=layers.length; i<ii; ++i) {
                         config.map.layers.push({
                             source: "local",
                             name: layers[i],
                             visibility: true,
                             bbox: query.lazy && query.bbox ? query.bbox.split(",") : undefined
                         });
                     }
                 }
                 if (query.bbox) {
                     delete config.map.zoom;
                     delete config.map.center;
                     config.map.extent = query.bbox.split(/\s*,\s*/);
                 }
                 if (query.lazy && config.sources.local) {
                     config.sources.local.requiredProperties = [];
                 }
            }
            
            this.applyConfig(config);
        }
        // Turn off animated zooming
        //this.mapPanel.map.zoomDuration = 2;
        //this.mapPanel.map.zoomTween = null;
    },

    /** private: method[zoomToFilter]
     *  Zoom to the extend of a filter
     */
    zoomToFilter: function(rec) {
        var cqlFormat = new OpenLayers.Format.CQL();
        var cqlString = rec.getLayer().params.CQL_FILTER;

        if (cqlString) {
            var source = this.layerSources[rec.data.source];
            source.getWFSProtocol(rec, function(protocol, schema, record) {

                if (!protocol) {
                    // TODO: add logging to viewer
                    throw new Error("Failed to get protocol for record: " + record.get("name"));
                }
                var wfsLayer = new OpenLayers.Layer.Vector("CQLRESULT", {
                    strategies: [new OpenLayers.Strategy.Fixed()],
                    displayInLayerSwitcher: false,
                    eventListeners: {
                        'loadend': function (evt) {
                            var extend = wfsLayer.getDataExtent();
                            if (extend !== null) {
                                map.zoomToExtent(extend);
                            }
                            map.removeLayer(wfsLayer);
                        }
                    },
                    protocol: new OpenLayers.Protocol.WFS(Ext.apply({
                        filter: cqlFormat.read(cqlString),
                        featurePrefix: "",
                        outputFormat: "JSON",
                        maxFeatures: 100,
                        propertyNames: [protocol.geometryName]
                    }, protocol))
                });
                var map = this.mapPanel.map;
                map.addLayer(wfsLayer);
            }, this);
        }
    },
    
    displayXHRTrouble: function(msg, status) {
        
        Ext.Msg.show({
            title: this.xhrTroubleText + status,
            msg: msg,
            icon: Ext.MessageBox.WARNING
        });
        
    },
    
    /** private: method[initPortal]
     * Create the various parts that compose the layout.
     */
    initPortal: function() {
   
		var header = new Ext.Container({
        	height: 50,
        	html: "<div id='top'>" +
        	      "<a href='javascript:history.go(0)'>" + 
                  "<div id='atlasLogo'></div>" +
        		  "<div id='headnav'>" +
        		  "<a href='#' onclick='app.displayAppInfo(); return false;'>Info</a>" + 
        		  "<a href='mailto:geo-informatie@zaanstad.nl?subject=Atlas'>Contact</a>" + 
        		  "<a href='#' id='login-link' onclick='app.authenticate(); return false;'>Login</a>" + 
        		  "</div>" +
        		  "</div>"
        	});
        
        var westPanel = new Ext.Panel({
        	id: "tree",
        	title: "Lagen",
        	layout: "fit",
            collapsible: true,
            header: true
        });
        
        var bigPanel = new Ext.Panel({
        	id: "bigpanel",
            region: "west",
            layout: "fit",
            width: 250,
            split: true,
            collapsible: true,
            defaults: {
                border: false
            },
            items: [
                westPanel
            ],
            activeItem: 0,
            header: false
        });
        
        this.toolbar = new Ext.Toolbar({
            disabled: true,
            id: 'paneltbar',
            items: this.createTools()
        });
        this.on("ready", function() {
            // enable only those items that were not specifically disabled
            var disabled = this.toolbar.items.filterBy(function(item) {
                return item.initialConfig && item.initialConfig.disabled;
            });
            this.toolbar.enable();
            disabled.each(function(item) {
                item.disable();
            });
            if (this.isAuthorized()) Ext.getCmp('adminbar').show();
        });

        this.mapPanelContainer = new Ext.Panel({
            layout: "card",
            region: "center",
            tbar: this.toolbar,
            defaults: {
                border: false
            },
            items: [
                this.mapPanel
            ],
            activeItem: 0
        });
        
        this.portalItems = [{
            region: "center",
            layout: "border",
            tbar: header,
            items: [
                this.mapPanelContainer,
                bigPanel
            ]
        }];
        
        GeoExplorer.superclass.initPortal.apply(this, arguments);        
    },
    
    /** private: method[createTools]
     * Create the toolbar configuration for the main panel.  This method can be 
     * overridden in derived explorer classes such as :class:`GeoExplorer.Composer`
     * or :class:`GeoExplorer.Viewer` to provide specialized controls.
     */
    createTools: function() {
        var tools = [
            "-"
        ];
        return tools;
    },

    /** api: method[getBookmark]
     *  :return: ``String``
     *
     *  Generate a bookmark for an unsaved map.
     */
    getBookmark: function() {
        var params = Ext.apply(
            OpenLayers.Util.getParameters(),
            {q: Ext.util.JSON.encode(this.getState())}
        );
        
        // disregard any hash in the url, but maintain all other components
        var url = 
            document.location.href.split("?").shift() +
            "?" + Ext.urlEncode(params);
        
        return url;
    },

    /** private: method[displayAppInfo]
     * Display an informational dialog about the application.
     */
    displayAppInfo: function() {
        var appInfo = new Ext.Panel({
            title: this.appInfoText,
            html: "<iframe style='border: none; height: 100%; width: 100%' src='../about.html' frameborder='0' border='0'><a target='_blank' href='about.html'>" + this.aboutText + "</a></iframe>"
        });
        
        var appHelp = new Ext.Panel({
            title: "Algemeen",
            html: "<iframe style='border: none; height: 100%; width: 100%' src='../help.html' frameborder='0' border='0'></iframe>"        
        });

        var about = Ext.applyIf(this.about, {
            title: '', 
            "abstract": '', 
            contact: ''
        });

        var mapInfo = new Ext.Panel({
            title: this.mapInfoText,
            html: '<div class="gx-info-panel">' +
                  '<h2>'+ this.titleText+'</h2><p>' + about.title +
                  '</p><h2>'+ this.descriptionText+'</h2><p>' + app.about['abstract'] +
                  '</p> <h2>'+ this.contactText+'</h2><p>' + about.contact +'</p></div>',
            height: 'auto',
            width: 'auto'
        });

        var tabs = new Ext.TabPanel({
            activeTab: 0,
            items: [appHelp, mapInfo, appInfo]
        });

        var win = new Ext.Window({
            title: this.aboutText,
            modal: true,
            layout: "fit",
            width: 500,
            height: 600,
            items: [tabs]
        });
        win.show();
    },
    
    /** private: method[getState]
     *  :returns: ``Òbject`` the state of the viewer
     */
    getState: function() {
        var state = GeoExplorer.superclass.getState.apply(this, arguments);
        // Don't persist tools
        delete state.tools;
        //delete state.map.controls;
        return state;
    }
});

