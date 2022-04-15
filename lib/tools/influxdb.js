var {InfluxDB, Point, HttpError}    = require('@influxdata/influxdb-client');
var debug                           = require('debug')('ylt:influxdb');

async function write(data, options){
    debug("Starting to push to influxdb")
    const url = `http://${options.influxdb.hostname}:${options.influxdb.port}`
    const client = new InfluxDB({url, token: options.influxdb.token})
    const writeApi = client.getWriteApi(options.influxdb.org, options.influxdb.bucket)
    const point = new Point("YellowLabtools")
        .tag("url", data.params.url)
        .tag("device", data.params.options.device)
    const allMetrics = Object.assign({}, ...Object.values(data.toolsResults).map(tool => tool.metrics))
    Object.keys(allMetrics).forEach((metricName) => {
        const metricType = typeof(allMetrics[metricName])
        switch (metricType) {
            case "object": 
                // null should go here
                debug(`${metricName} is null`)
                break;
            case "number":
                if(Number.isNaN(allMetrics[metricName])){
                    debug(`${metricName} is NaN`)
                }
                else {
                    point.floatField(metricName, allMetrics[metricName])
                }
                break;
            case "string":
                point.stringField(metricName, allMetrics[metricName])
                break;
            case "boolean":
                point.booleanField(metricName, allMetrics[metricName]);
                break;
            default:
                debug(`Unexpected type for ${metricName}: ${allMetrics[metricName]} ${metricType}`)
        }
    })

    writeApi.writePoint(point)
    writeApi.close()
        .catch((e) => {
            debug('Writing to influx failed\n')
            debug(e)
            if (e instanceof HttpError && e.statusCode === 401) {
                debug(`The InfluxDB database: ${options.influxdb.bucket} doesn't exist.`)
            }
        })

}
module.exports = write