//  debug
var DEBUG_RESOURSE_LIST = false,
    DEBUG_STEP = true,
    DEBUG_RENDER = true;
//  private
var fs = require("fs"),
    har = {};
    MAX_ATTAMPT = 10,
    ATTAMPT_TIMEOUT = 50;

har.log = {
    version: '1.2', 
    creator: {
        name: "PhantomJS",
        version: phantom.version.major + '.' + phantom.version.minor +
            '.' + phantom.version.patch
    },
    browser: {
        name: "QtWetkit",
        version: "4.8"
    },
    pages: [],
    entries: []
};

function createHar(page) {
    har.log.pages.push({
        startedDateTime: (page.timings.start ? page.timings.start.toISOString() : -1),
        id: page.currentStep + ":" + page.url,
        title: page.title,
        pageTimings: {
            onContentLoad: (page.timings.DOMContentLoaded ? page.timings.DOMContentLoaded : -1),
            onLoad: page.timings.onLoad,
            _endToEnd: page.timings.end,
            _firstByte: page.timings.firstByte
        }
    });
    page.resources.forEach(function (resource) {
        var request = resource.request,
            startReply = resource.startReply,
            endReply = resource.endReply,
            size = 0;

        size += (startReply ? startReply.bodySize : 0 );
        size += (endReply ? endReply.bodySize : 0 );

        if (!request || request.url.match(/(^data:image\/.*)/i)) return;
        else if (!startReply && !endReply) return;
        else if (!startReply || !endReply){
            //_log.info(JSON.stringify(resource, undefined, 2));
        }
        var entry = {
            pageref: page.currentStep + ":" + page.url,
            startedDateTime: request.time.toISOString(),
            time: (endReply ? endReply.time - request.time : -1 ),
            request: {
                method: request.method,
                url: request.url,
                httpVersion: "HTTP/1.1",
                cookies: [],//cookies [array] - List of cookie objects.
                headers: request.headers,
                queryString: [],//queryString [array] - List of query parameter objects.
                headersSize: request.headerSize,
                bodySize: -1//bodySize [number] - Size of the request body (POST data payload) in bytes. Set to -1 if the info is not available.
            },
            response: {
                status: (endReply ? endReply.status : startReply.status),
                statusText: (endReply ? endReply.statusText : startReply.statusText),
                httpVersion: "HTTP/1.1",
                cookies: [],//cookies [array] - List of cookie objects.
                headers: (endReply ? endReply.headers : startReply.headers),
                content: {
                    size: size,
                    mimeType: (endReply ? endReply.contentType : startReply.contentType)
                },
                redirectURL: "",//Redirection target URL from the Location response header.
                headersSize: (startReply ? startReply.headerSize : -1),
                bodySize: size//bodySize [number] - Size of the received response body in bytes. Set to zero in case of responses coming from the cache (304).
            },
            cache: {},
            timings: {
                blocked: 0,
                dns: -1,
                connect: -1,
                send: 0,
                wait: (startReply ? startReply.time - request.time : -1),
                receive: (startReply&&endReply ? endReply.time - startReply.time : -1),
                ssl: -1
            }
        };
        har.log.entries.push( entry );
    });
}

/**
 *  Reset page
 *
 *  @param page
 */
function resetPage(page) {
    page.onFinishedRender = null;
    page.timings = [];
    page.timings.start = null;
    page.timings.firstByte = null;
    page.inAjax = false;
    page.resources = [];
}

//  public

/**
 *	Setting the callback listeners.
 *
 *  @param page
 *	onResourceRequested
 *	onResourceReceived
 *  onInitialized
 *  onCallback
 */
exports.setCallbackListeners = function(page) {
	page.resources = [];
    page.timings = [];
    page.viewportSize = { width: 1280, height: 960 };
	page.onResourceRequested = function (requestData, networkRequest) {
		if ( requestData ) {
            DEBUG_RESOURSE_LIST && console.log("Request:  " + requestData.id);
            if (page.timings.start == null) {
                page.timings.start = new Date();//TODO start time here?
                DEBUG_STEP && console.log("Step " + page.currentStep + " start");
                DEBUG_STEP && console.log("URL: " + page.url);
                DEBUG_RENDER && page.render("c:\\" + page.currentStep + "start.png");
            }
			page.resources[requestData.id] = {
				request: requestData,
				startReply: null,
				endReply: null
			};
		}
	};
	page.onResourceReceived = function (response) {
		if ( response ) {
            DEBUG_RESOURSE_LIST && console.log("Response: " + response.id);
            if ( page.timings.firstByte == null ) page.timings.firstByte = new Date() - page.timings.start;
			if (response.stage === 'start') {
				page.resources[response.id].startReply = response;
			}
			if (response.stage === 'end') {
				page.resources[response.id].endReply = response;
			}
			
		}
	};
    page.onInitialized = function() {
        page.evaluate( function() {
            document.addEventListener('DOMContentLoaded', function() {
                window.callPhantom('DOMContentLoaded');
            }, false);
            document.addEventListener('load', function(event) {
                window.callPhantom('load');
            }, false);
        });
    };
    page.onCallback = function(data) {
        if (data == 'DOMContentLoaded') {
            page.timings.DOMContentLoaded = new Date() - page.timings.start;
        }
        else if (data == 'Load') {
            page.timings.onLoad = new Date() - page.timings.start;
        }
    };
	return page;
};

/**
 *  Screenshot comparison
 *  @param page
 *   
 */
exports.ajaxLoading = function(page) {
    //_log.info("[MIN]ATTAMPT: " + page.attampt);
    DEBUG_STEP && !page.inAjax && console.log("Ajax checking");
    page.inAjax = true;
    if ( page.onFinishedRender != undefined && page.attampt > 0 && page.attamptTimeout > 0 ) {
        var render = page.renderBase64("gif");
        if ( page.onFinishedRender.length != render.length ) {//TODO compare conteng instead of length
            _log.info("before: " + page.onFinishedRender.length + "| after: " + render.length);
            page.timings.end = new Date() - page.timings.start - 50;//interval = 100
            page.onFinishedRender = render;
            page.attampt = MAX_ATTAMPT;
        }
        else {
            page.attampt--;
            page.attamptTimeout--;
        }
        return true;
    }
}

/*
*   Reset ATTAMPT and ATTAMPT_TIMEOUT
*   @param page
*   
*/
exports.resetAttampts = function(page) {
    page.attampt = MAX_ATTAMPT;
    page.attamptTimeout = ATTAMPT_TIMEOUT;
}

/*
*   Saving the har to the file system.
*   @param page
*   @param location: location must end with '\'
*
*/
exports.saveHar = function(page) {
    fs.write("AllInOne.har", JSON.stringify(har, undefined, 2), "w");
    //sendHar(har);
    //har.log.pages = [];
    //har.log.entries = [];
};

exports.stepEnds = function ( page ) {
    DEBUG_STEP && console.log("Step " + page.currentStep + " ended");
    DEBUG_RENDER && page.render("c:\\" + page.currentStep + ".png");
    createHar(page);
    resetPage(page);
    page.currentStep++;
}