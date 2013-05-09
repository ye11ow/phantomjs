/*jslint browser: true, eqeq: true, nomen: true, plusplus: true, sloppy: true, todo: true */

//  debug
var DEBUG_RESOURSE_LIST = false,
    DEBUG_STEP = true,
    DEBUG_AJAX = false,
    DEBUG_RENDER = false;

//  private
var fs = require("fs"),
    har = {},
    config = {};

// init har
function initHar() {
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
}

function init() {
    // init config
    config = {
        harfiles : "seperated",
        MAX_ATTAMPT : 8,
        ATTAMPT_TIMEOUT : 24
    };
    if (fs.exists("harhelper.js")) {
        cfg = JSON.parse(fs.read("harhelper.js"));
        if (cfg["DEBUG_RESOURSE_LIST"]) {
            DEBUG_RESOURSE_LIST = cfg["DEBUG_RESOURSE_LIST"];
        }
        if (cfg["DEBUG_STEP"]) {
            DEBUG_STEP = cfg["DEBUG_STEP"];
        }
        if (cfg["DEBUG_AJAX"]) {
            DEBUG_AJAX = cfg["DEBUG_AJAX"];
        }
        if (cfg["DEBUG_RENDER"]) {
            DEBUG_RENDER = cfg["DEBUG_RENDER"];
        }
    }
    
    // init har file
    initHar();
}



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
            size = 0,
            entry = {};

        size += (startReply ? startReply.bodySize : 0);
        size += (endReply ? endReply.bodySize : 0);

        if (!request || request.url.match(/(^data:image\/.*)/i)) {
            return;
        }
        if (!startReply && !endReply) {
            return;
        }
        if (!startReply || !endReply) {
            //_log.info(JSON.stringify(resource, undefined, 2));
        }
        entry = {
            pageref: page.currentStep + ":" + page.url,
            startedDateTime: request.time.toISOString(),
            time: (endReply ? endReply.time - request.time : -1),
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
                    mimeType: ((endReply && endReply.contentType != null) ? endReply.contentType : "")
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
                receive: (startReply && endReply ? endReply.time - startReply.time : -1),
                ssl: -1
            }
        };
        har.log.entries.push(entry);
    });
}

function getTimeOffset(page) {
    var time_offset = new Date() - page.timings.start,
        str = "[";
    if (time_offset < 10) {
        str += "0000";
    } else if (time_offset < 100) {
        str += "000";
    } else if (time_offset < 1000) {
        str += "00";
    } else if (time_offset < 10000) {
        str += "0";
    }
    return str + time_offset + "]";
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
    page.hasAjax = false;
    page.resources = [];
}

//  public

/**
 *  Setting the callback listeners.
 *
 *  @param page
 *  onResourceRequested
 *  onResourceReceived
 *  onInitialized
 *  onCallback
 */
exports.setCallbackListeners = function(page) {
    page.resources = [];
    page.timings = [];
    page.viewportSize = { width: 1280, height: 960 };
    page.attampt = config["MAX_ATTAMPT"];
    page.attamptTimeout = config["ATTAMPT_TIMEOUT"];
    page.onResourceRequested = function (requestData, networkRequest) {
        if (requestData) {
            DEBUG_RESOURSE_LIST && console.log(getTimeOffset(page) + "Step " + page.currentStep + ": Request:  " + requestData.id);
            if (page.timings.start == null) {
                page.timings.start = new Date();//TODO start time here?
                DEBUG_STEP && console.log(getTimeOffset(page) + "Step " + page.currentStep + ": start");
                DEBUG_RENDER && page.render(page.currentStep + "start.png");
            }
            page.resources[requestData.id] = {
                request: requestData,
                startReply: null,
                endReply: null
            };
        }
    };
    page.onResourceReceived = function (response) {
        if (response) {
            DEBUG_RESOURSE_LIST && console.log("Response: " + response.id);
            if (page.timings.firstByte == null) {
                page.timings.firstByte = new Date() - page.timings.start;
            }
            if (response.stage === 'start') {
                page.resources[response.id].startReply = response;
            }
            if (response.stage === 'end') {
                page.resources[response.id].endReply = response;
            }
        }
    };
    page.onInitialized = function() {
        page.evaluate(function() {
            document.addEventListener('DOMContentLoaded', function() {
                window.callPhantom('DOMContentLoaded');
            }, false);
            document.addEventListener('load', function(event) {
                window.callPhantom('load');
            }, false);
        });
    };
    page.onCallback = function(data) {
        if (data === 'DOMContentLoaded') {
            page.timings.DOMContentLoaded = new Date() - page.timings.start;
        } else if (data === 'Load') {
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
    if (page.timings.start == null) {
        return false;
    }
    DEBUG_STEP && !page.inAjax && console.log(getTimeOffset(page) + "Step " + page.currentStep + ": Waiting for Ajax requests/responses");
    page.inAjax = true;
    if (!page.onFinishedRender) {
        page.onFinishedRender = page.renderBase64("png");
        if (!page.onFinishedRender) {
            return false;
        }
        return true;
    }
    DEBUG_AJAX && console.log("Attampt: " + page.attampt + "; Glocal Attampt:" + page.attamptTimeout + "; Render: " + page.onFinishedRender.length);
    if (page.onFinishedRender && page.attampt > 0 && page.attamptTimeout > 0) {
        var render = page.renderBase64("png"),
            diff;
        if (page.onFinishedRender.length !== render.length) {//TODO compare content instead of length
            diff = page.onFinishedRender.length - render.length;
            if (diff < 0) {
                diff = -diff;
            }
            //diff is greater than 2% 
            if (render.length != 0 && (diff * 100 / render.length) >= 1) {
                DEBUG_AJAX && console.log("Length Changed: " + diff);
                page.timings.end = new Date() - page.timings.start - 50;//interval = 100
                page.onFinishedRender = render;
                page.attampt = config["MAX_ATTAMPT"];
                page.attamptTimeout--;
                page.hasAjax = true;
                DEBUG_STEP && console.log(getTimeOffset(page) + "Step " + page.currentStep + ": Rendering...");
            } else {
                page.attampt--;
                page.attamptTimeout--;
            }
        } else {
            page.attampt--;
            page.attamptTimeout--;
        }
        return true;
    }
    DEBUG_STEP && !page.hasAjax && console.log(getTimeOffset(page) + "Step " + page.currentStep + ": No Ajax requests/responses");
    return false;
};

/*
*   Reach page.onload
*   @param page
*   
*/
exports.loadEnds = function(page) {
    DEBUG_STEP && console.log(getTimeOffset(page) + "Step " + page.currentStep + ": Loading ends");
    page.timings.onLoad = new Date() - page.timings.start;
    page.timings.end = page.timings.onLoad;
    page.onFinishedRender = page.renderBase64("png");
    page.attampt = config["MAX_ATTAMPT"];
    page.attamptTimeout = config["ATTAMPT_TIMEOUT"];
};
    
/*
*   Reset ATTAMPT and ATTAMPT_TIMEOUT
*   @param page
*   
*/
exports.resetAttampts = function(page) {
    page.attampt = config["MAX_ATTAMPT"];
    page.attamptTimeout = config["ATTAMPT_TIMEOUT"];
};

/*
*   Saving the har to the file system.
*   @param page
*   @param location: location must end with '\'
*
*/
exports.saveHar = function(page) {
    fs.write("AllInOne.har", JSON.stringify(har, undefined, 0), "w");
};

exports.stepEnds = function (page) {
    DEBUG_STEP && console.log(getTimeOffset(page) + "Step " + page.currentStep + ": " + page.url +" ends");
    DEBUG_RENDER && page.render(page.currentStep + ".png");
    createHar(page);
    resetPage(page);
    page.currentStep++;
};

init();