var {InfluxDB, Point, HttpError}    = require('@influxdata/influxdb-client');
var debug                           = require('debug')('ylt:influxdb');
const fs                            = require('fs')
const JsonStreamStringify           = require('json-stream-stringify');

const METRIC_FORCED_TYPE_STRING = ["mainDomainTlsProtocol"];

async function write(results, options){
    debug("Starting to push to influxdb");
    const url = `http://${options.influxdb.hostname}:${options.influxdb.port}`;
    const client = new InfluxDB({url, token: options.influxdb.token});
    const writeApi = client.getWriteApi(options.influxdb.org, options.influxdb.bucket);

    const points = results.map(data => createPoint(data))

    writeApi.writePoints(points);
    
    writeApi.close()
        .then(() => {
            if(!options.influxdb.offendersReport){
                return;
            }
            if(!fs.existsSync("./results")){
                fs.mkdirSync("./results");
            }
            const writeStream = fs.createWriteStream('./results/result.json', { flags: 'w' });
            const jsonStream = new JsonStreamStringify(results.map(data => extractOffenders(data)));
            jsonStream.pipe(writeStream);
        })
        .catch((e) => {
            debug('Writing to influx failed\n');
            debug(e);
            if (e instanceof HttpError && e.statusCode === 401) {
                debug(`The InfluxDB database: ${options.influxdb.bucket} doesn't exist.`);
            }
        })
}

function extractOffenders(data){
    // removing buffer with the bytes of every requests (~5/6 of the weight of the result file)
    data.toolsResults.phantomas.offenders.requests?.forEach(request => {
        if(request.weightCheck)
            delete request.weightCheck.bodyBuffer
    });

    // making one object with all the offenders
    return {
        url: data.params.url,
        name: data.params.options.name,
        offenders: Object.assign({}, ...Object.values(data.toolsResults).map(tool => tool.offenders))
    }
}

function createPoint(data){
    const point = new Point("YellowLabTools")
        .tag("url", data.params.url)
        .tag("name", data.params.options.name)
        .tag("device", data.params.options.device);
    const allMetrics = Object.assign({}, ...Object.values(data.toolsResults).map(tool => tool.metrics));
    Object.keys(allMetrics).forEach((metricName) => {
        if(METRIC_FORCED_TYPE_STRING.includes(metricName)){
            point.stringField(metricName, allMetrics[metricName]);
            return;
        }
        const metricType = typeof(allMetrics[metricName]);
        switch (metricType) {
            case "object": 
                // null should go here
                debug(`${metricName} is null`);
                break;
            case "number":
                if(Number.isNaN(allMetrics[metricName])){
                    debug(`${metricName} is NaN`);
                }
                else {
                    point.floatField(metricName, allMetrics[metricName]);
                }
                break;
            case "string":
                point.stringField(metricName, allMetrics[metricName]);
                break;
            case "boolean":
                point.booleanField(metricName, allMetrics[metricName]);
                break;
            default:
                debug(`Unexpected type for ${metricName}: ${allMetrics[metricName]} ${metricType}`);
        }
    })

    return point;
}

module.exports = write