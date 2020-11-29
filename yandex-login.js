var rp = require('request-promise');
var mDnsSd = require('node-dns-sd');

module.exports = function(RED) {
    let deviceList = {};
    let readyList = [];
    function YandexLoginNode(n) {
        RED.nodes.createNode(this,n);
        let node = this
        this.token = n.token;
        this.devices = n.devices;
        this.sender = sendero;
        let debugFlag = true;
    
        
        function debugMessage(text){
            if (debugFlag) {
                node.log(text);
            }
        }
        function sendero(data) {
            node.log(`fire ${data}`);
        }
        async function getDevices(token)
        {
            let temp;
            let stageCompleted = 0;
            let options = 
                { 
                    method: 'GET',
                    url: 'https://quasar.yandex.net/glagol/device_list',
                    headers: 
                    { 
                        'Content-Type': 'application/json',
                        'Authorization': 'Oauth ' + token 
                    } 
                };
        
      
            await rp(options)
            .then(function(response)
            {
                let data = JSON.parse(response);
                deviceList = data.devices;
                debugMessage(`Recieved device list of ${deviceList.length} devices`);
                discoverDevices(deviceList)
                .then(() => {
                    readyList = [];
                    node.emit('devicesListReady', deviceList)
                    deviceList.forEach(device => {
                        node.emit(`deviceReady${device.id}`, device);
                        readyList.push({ 'name': device.name,  'id': device.id, 'address': device.address, 'port': device.port, 'host': device.host});
                    });
                    RED.httpAdmin.get("/yandexdevices_"+node.id, RED.auth.needsPermission('yandex-login.read'), function(req,res) {
                        res.json({"devices": readyList});
                    });
                });
                debugMessage(node.id);
                return deviceList;
            })
            .catch(function (err) {
                readyList = [];
                RED.httpAdmin.get("/yandexdevices", RED.auth.needsPermission('yandex-login.read'), function(req,res) {
                    res.json({"devices": readyList});
                });
                debugMessage(err);
                debugMessage(JSON.stringify(options));
                return;
            });
        }
        async function discoverDevices(deviceList) {
            let discoverResult = [];
            //node.status({fill:"yellow",shape:"dot",text:`Discovering devices...`});
            await mDnsSd.discover({
                name: '_yandexio._tcp.local'
            }).then((result) => {
                //discoverResult = result;
                debugMessage(`Found ${result.length} devices`);
                if (result.length != 0){
                    for (const device of deviceList) {
                        result.forEach(element => {
                            let srvEls = element.packet.answers.find(el => el.type == "SRV");
                            let txtEls = element.packet.answers.find(el => el.type == "TXT");
                            if (txtEls.rdata.deviceId == device.id) {
                                device.address =  element.address;
                                device.port = element.service.port;
                                device.host = srvEls.rdata.target;
                            }    
                        })
                    }
                }
                
            }).catch(function (err) {
                let errMsg = {};
                node.log(err);
                errMsg.payload = err;
                node.send(errMsg);
            });
            //return discoverResult;
        }
    getDevices(this.token).then();
    
    }
    RED.nodes.registerType('yandex-login', YandexLoginNode, {
        credentials: {
            otoken: {type:"text"}
        }
    });

}