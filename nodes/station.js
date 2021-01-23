module.exports = function(RED) {
    function AliceLocalStationNode(config) {
        RED.nodes.createNode(this,config);
        let node = this;
        node.controller = RED.nodes.getNode(config.token);
        node.station = config.station_id;
        node.sheduler = config.sheduler;
        node.network = config.network;
        node.fixedAddress = config.fixedAddress;
        node.fixedPort = config.fixedPort;
        node.networkMode = node.network.mode || "auto";
        node.debugFlag = true;
        node.status({});

        function debugMessage(text){
            if (node.debugFlag) {
                node.log(text);
            }
        }
        //debugMessage(JSON.stringify(node.network));
        //debugMessage(JSON.stringify(node.fixedAddress));
        //debugMessage(JSON.stringify(node.fixedPort));
        if (node.sheduler) {
            node.sheduler.forEach( day => { 
                debugMessage(JSON.stringify(day))
            });
        }
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
            let params = {"connection": true,  "sheduler": node.sheduler, "network":{"mode": node.networkMode, "fixedAddress": node.fixedAddress, "fixedPort": node.fixedPort} }
            let status = node.controller.registerDevice(node.station, node.id, params);
            debugMessage(`Result is ${status}  ${typeof(status)}`);
            node.registration = (status != 2 && status != undefined)?true:false;
            debugMessage(`Result is ${status}  ${typeof(status)} regstrationFlag: ${node.registration}`);
           
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