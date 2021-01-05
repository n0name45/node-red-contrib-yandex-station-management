module.exports = function(RED) {
    function AliceLocalStationNode(config) {
        RED.nodes.createNode(this,config);
        let node = this;
        node.controller = RED.nodes.getNode(config.token);
        node.station = config.station_id;
        node.sheduler = config.sheduler;
        node.debugFlag = true;
        node.status({});

        function debugMessage(text){
            if (node.debugFlag) {
                node.log(text);
            }
        }
        //debugMessage(node.station);
        //debugMessage(`sheduler: ${if (node.sheduler) {node.sheduler.forEach( day => { debugMessage(JSON.stringify(day))} )}}`)
        node.onStatus = function(data) {
            (node.registration)?node.status({fill: data.color,shape:"dot",text: data.text}):node.status({fill: "red",shape:"dot",text: `not registered`})
        }
       
        node.onDeviceReady = function(device) {
            if (device.id == node.station) {
                node.registerDevice();
            }
        }
        node.registerDevice = function() {
            debugMessage(`Send registration for ${node.station}`);
            let status = node.controller.registerDevice(node.station, node.id);
            debugMessage(`Result is ${status}  ${typeof(status)}`);

            node.registration = (status != 2 && status != undefined)?true:false;
        }

        node.on('close', () => {
            node.controller.removeListener(`statusUpdate_${node.station}`, node.onStatus)
            node.controller.removeListener('deviceReady', node.onDeviceReady);
            node.controller.unregisterDevice(node.station, node.id)
        });

        if (node.controller) {
            node.onStatus(node.controller.getStatus(node.station));
            node.controller.on(`statusUpdate_${node.station}`, node.onStatus);
            node.controller.on('deviceReady', node.onDeviceReady);
            node.registerDevice();
        }
    }
    RED.nodes.registerType("alice-local-station",AliceLocalStationNode);
}