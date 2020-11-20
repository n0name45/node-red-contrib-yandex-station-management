var rp = require('request-promise');
var mDnsSd = require('node-dns-sd');
module.exports = function(RED) {
    function AliceLocalBridgeNode(config) {
        RED.nodes.createNode(this,config);
        let node = this;
        let token = config.token;
        let deviceList;
       
        
        async function getDevices()
        {
            let data;
            let temp;
            let options = 
                { 
                    method: 'GET',
                    url: 'https://quasar.yandex.net/glagol/device_list',
                    headers: 
                    { 
                        Connection: 'keep-alive',
                        Host: 'quasar.yandex.net',
                        'Content-Type': 'application/json',
                        Authorization: 'Oauth ' + token 
                    } 
                };
        await rp(options)
        .then(function(response)
        {
            data = JSON.parse(response);
            deviceList = data.devices;
        })
        .catch(function (err) {
        });
        
        await discoverDevices()
        .then(function(result){
            deviceList[0].disc = result;
        })
        .catch(function (err) {
        }); 

        for (const device of deviceList) {
            await getLocalToken(device.id).then(result => {
                device.token = result
            })
        .catch(function (err) {
        }); 
        }


        return deviceList;    
        }
        
        async function getLocalToken(stId) {
            let data;
            let options = { 
                method: 'GET',
                url: 'https://quasar.yandex.net/glagol/token',
                qs: { device_id: stId },
                headers: 
                    { 
                        Authorization: 'Oauth ' + token,
                        'Content-Type': 'application/json' 
                    } 
                };
            await rp(options)
            .then(function(response)
            {
                data = JSON.parse(response);
                return data.token
    
            })
            .catch(function (err) {
            });
            return data.token    
        };

        async function discoverDevices() {
            let discoverResult = await mDnsSd.discover({
                name: '_yandexio._tcp.local'
            })
            return discoverResult;
        }
        
        node.on('input', function(msg) {
           getDevices().then(result => {
            msg.payload = result;
            node.send(msg);
           });

        });
    }
    RED.nodes.registerType("alice-local-bridge",AliceLocalBridgeNode);
}