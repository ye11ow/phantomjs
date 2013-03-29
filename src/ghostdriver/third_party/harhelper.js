//  private
var fs = require("fs");
const   MAX_ATTAMPT = 10,
        ATTAMPT_TIMEOUT = 50;


function createHAR (page) {
    var entries = [];
	if ( !page.startTime ) page.startTime = page.endTime;
    page.resources.forEach(function (resource) {
        var request = resource.request,
            startReply = resource.startReply,
            endReply = resource.endReply;

        if (!request || !startReply || !endReply) {
            if (!startReply && !endReply) {
                return true;
            }
        }

        // Exclude Data URI from HAR file because
        // they aren't included in specification
        if (request.url.match(/(^data:image\/.*)/i)) {
            return;
		}

        entries.push({
            startedDateTime: request.time.toISOString(),
            time: endReply.time - request.time,
            request: {
                method: request.method,
                url: request.url,
                httpVersion: "HTTP/1.1",
                cookies: [],
                headers: request.headers,
                queryString: [],
                headersSize: -1,
                bodySize: -1
            },
            response: {
                status: endReply.status,
                statusText: endReply.statusText,
                httpVersion: "HTTP/1.1",
                cookies: [],
                headers: endReply.headers,
                redirectURL: "",
                headersSize: -1,
                bodySize: startReply.bodySize,
                content: {
                    size: startReply.bodySize,
                    mimeType: endReply.contentType
                }
            },
            cache: {},
            timings: {
                blocked: 0,
                dns: -1,
                connect: -1,
                send: 0,
                wait: (startReply ? startReply.time - request.time : -1),
                receive: (startReply ? endReply.time - startReply.time : -1),
                ssl: -1
            },
            pageref: page.url
        });
    });

    return {
        log: {
            version: '1.2',
            creator: {
                name: "PhantomJS",
                version: phantom.version.major + '.' + phantom.version.minor +
                    '.' + phantom.version.patch
            },
            pages: [{
                startedDateTime: page.startTime.toISOString(),
                id: page.url,
                title: page.title,
                pageTimings: {
                    onLoad: page.endTime - page.startTime
                }
            }],
            entries: entries
        }
    };
}

//  public

/*
*	Setting the callback listeners
*   @param page
*	onResourceRequested
*	onResourceReceived
*/
exports.setCallbackListeners = function(page) {
	page.resources = [];
	page.onResourceRequested = function (requestData, networkRequest) {
		if ( requestData ) {
			page.resources[requestData.id] = {
				request: requestData,
				startReply: null,
				endReply: null
			};
			//_log.info("[MIN]" + requestData.id);
		}
	};
	page.onResourceReceived = function (response) {
		if ( response ) {
			if (response.stage === 'start') {
				page.resources[response.id].startReply = response;
			}
			if (response.stage === 'end') {
				page.resources[response.id].endReply = response;
                //_log.info("[MIN]-" + response.id);
			}
			
		}
	};
	return page;
};

/*
*   Screenshot comparison
*   @param page
*   
*/
exports.ajaxLoading = function(page) {
    //_log.info("[MIN]ATTAMPT: " + _windows[wHandle].attampt);
    //_log.info("[MIN]wHandle: " + wHandle);
    if ( page.onFinishedRender != undefined && page.attampt > 0 && page.attamptTimeout > 0 ) {
        var render = page.renderBase64("png");
        if ( page.onFinishedRender.length != render.length ) {
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
exports.saveHar = function( page, location ) {
    har = createHAR(page);
    fs.write( location + page.currentStep + ".har", JSON.stringify(har, undefined, 4), "w");
};