module.exports = function(RED) {
    function AliceLocalSend(config) {
        RED.nodes.createNode(this,config);
        var node = this;
        node.on('input', function(msg) {
           // msg.payload = msg.payload.toLowerCase();
            node.send(msg);
        });
    }
    RED.nodes.registerType("alice-local-send",AliceLocalSendNode);
}