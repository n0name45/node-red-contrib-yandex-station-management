var rp = require('request-promise');
var WebSocket = require("ws");

let token = "AgAAAAAMYkA_AAG8Xms4bcfZ20XJtWnzU34RZsU"

let deviceId = "74005034440c0809084e"
let address = "yandex-station-74005034440c0809084e.local"
let cToken;

async function gettoken() {
    let data;
    let options = { 
                method: 'GET',
                url: 'https://quasar.yandex.net/glagol/token',
                qs: { device_id: deviceId },
                headers: 
                    { 
                        'Authorization': 'Oauth ' + token,
                        'Content-Type': 'application/json' 
                    } 
                };
            await rp(options)
            .then(function(response)
            {
                data = JSON.parse(response);
                cToken = data.token
                console.log(cToken);
            })
            .catch(function (err) {
                let errMsg = {};
                node.log(err);
                errMsg.payload = err;
                node.send(errMsg);
            });

}

async function makeConn() {
    let options = 
        {
            "key": "-----BEGIN RSA PRIVATE KEY-----\nMIIEpQIBAAKCAQEAzlSmDyflUcBMJc8JhBvqStk8J3HkdhLk300fj5hFLa7eadMC\nOVbdd6e/Ns59UvtWHalw3OCoDDrmQ//DmedH15R1Z7hojtTKU8jm35fR/1muMeKv\n3YClLPC8nG7GRS1zTyAxXcABQgAuCcVif7c2KGdiNp/8FqWK/VVQ9vt7l58AquYD\npp8Nz6ZIV5sj5O+SVb7IFyqNiFtyCRsXK+FZDzGk3XC5KRN8KSqvRxHb3jpGoqeF\n6RgsGFj1j7LZ4TFyQ78DjoEc5OI0hGGpYeXVLYuShwy1LSJyj1xVqUwwqym11oA9\nEcArtM4nM4QDr838JyDd1F0M3HjRKxMFoYvndQIDAQABAoIBADTioYW09iRUI7B1\nNr0z4oO41qBNov9YrG1H+VT29JRXBA8f1KwZxb5Lssk7eAfzAAmuSo1yz+ACoM7B\nGcOy8kkhdk5ViAdEJ2/+SJ767QqEVA/ZSLZ/qNayBcYa5psIoUugtsaO1kOyhBph\nC3Qs46bLiPLzYsvzNoLkgVIs92rPEqCTXkgxB0EJyCqwza8b55GlAIApkJKXc8bk\nPxuDuu1Qx5+LnZpu4yCGLJJNv/jbxuV6EJECIs70szRwdV/y+Qp1+yaG1aKxhRr7\neYSZDeANOG6z9iHnbTphVWgxjv4GVGvHDfxbQn1vAU4Mrv/Z6jMzHVMVHIt4H7lc\nzNpByUECgYEA7KW00zUTdDZTpHeK2bs7Bmd17VPuO+DL8z/tEOhvYqOFVkZvh09Q\n2SULrtZ2gdprrJfEtGnyRo4QxovcmiJ91RqfeeXk9LaZFgH5oOzgAboBgbcxS3xJ\nKiiQgluro3g6RGAyVyvSsrZlDfmxclvMwNzd79FWoP71Js4E3UPh180CgYEA3zRA\nyCX3Q17Yw3H0q1V7BVa68DPjVlDIuxHX43WKjZWl8/Ab2NlLrkWp0hKh9idZr1Qs\n4ja3n5pSZFZZ1U2dvqqlmAmRB4N9VYxdS+hpHzzfT3L6pFYGjv7pk7L1NNglclgq\n8PinWyyIwX0nEn5TzPd1Tgz8PyxLYa1M+SrA1kkCgYEApiqM2ClSqa1j+f4+rzg6\n7/pB4g2nIMBuNTXT/qVXYQm1HKmEspxNBsxucawBtphqNtyysIQcLNKgkOmwU0KY\n3MQ+6tc0d2ioAb4NTKRHfq7fU/gQUxLIRSQKpJ493SEUuOJbNr58yiQsvS1xHf27\nvkjYRgbWL2IXPdI3tC5wLJkCgYEAh5/qlTNskYU6VVgTAWDJha7znC0LQFGKBxGK\niu3LKMj7s8P8R8GRmO0/iSRFQZsbhcuyEiqJXPOaiNlncJLe/RIX2NBHTbd6GtdV\ngWBRL+f/EPmejuiux4jhSRv+nwOPjXFBdnbAyke/OULg0P3t0aezoZ+GTqSNkWaK\nVQTDc/ECgYEAkNL07cK4irODlFD5gAmEc2pBY6+sZpYJstj+jM4kwDnoB4FaAXjR\ndbJcS/N0Ni594Vi2xIbA14K5gUhfyBmA1OwhR6Qkks1bR9NJOLe3Lh/IOYFhk+5F\n7YMQyR9XVCtC+rd96UedPkVNbe0Oj0OqtzUOX0avNPnGS5EBs7bVhW4=\n-----END RSA PRIVATE KEY-----\n",
            "cert": "-----BEGIN CERTIFICATE-----\nMIIC3TCCAcWgAwIBAgIBATANBgkqhkiG9w0BAQsFADAyMQswCQYDVQQGEwJSVTES\nMBAGA1UEAwwJbG9jYWxob3N0MQ8wDQYDVQQKDAZZYW5kZXgwHhcNMjAwMjA0MTYy\nNTI2WhcNMjMwMjAzMTYyNTI2WjAyMQswCQYDVQQGEwJSVTESMBAGA1UEAwwJbG9j\nYWxob3N0MQ8wDQYDVQQKDAZZYW5kZXgwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAw\nggEKAoIBAQDOVKYPJ+VRwEwlzwmEG+pK2TwnceR2EuTfTR+PmEUtrt5p0wI5Vt13\np782zn1S+1YdqXDc4KgMOuZD/8OZ50fXlHVnuGiO1MpTyObfl9H/Wa4x4q/dgKUs\n8LycbsZFLXNPIDFdwAFCAC4JxWJ/tzYoZ2I2n/wWpYr9VVD2+3uXnwCq5gOmnw3P\npkhXmyPk75JVvsgXKo2IW3IJGxcr4VkPMaTdcLkpE3wpKq9HEdveOkaip4XpGCwY\nWPWPstnhMXJDvwOOgRzk4jSEYalh5dUti5KHDLUtInKPXFWpTDCrKbXWgD0RwCu0\nziczhAOvzfwnIN3UXQzceNErEwWhi+d1AgMBAAEwDQYJKoZIhvcNAQELBQADggEB\nAHVxNpkdBVi3in200eWN+ky2bs2RpYuZRbc+vgVAu0IYC5ZaiogoQaoxwm/N+TGR\nkaYx4+dfxRbcBhXtnBXsjPVz5clD6sSjPUShGLLVyI39PPx+mO40uNjuaaALM1Yp\nWxc02gMGfJEDymIn2Nji+H2p6yU11pKzcM1Oq/sGHtepJfx28Eigv5sH+YuEs8yb\nnmB30k/ffTvNVEj86UnN2gc/JtTJ9dG4r0Ecg40LBxHzNeZLpn1D0AXjby0nFwem\ndORvKDgRoJtGL475mDgky2yhf+4EP8gi+2wUu4pEJpXHxGVKXET4C4ABHXLP73IF\nlR52w3daEd5BZT2NWvc1qsQ=\n-----END CERTIFICATE-----\n",
            "rejectUnauthorized": false
        }

    //debugMessage(`Connecting to wss://${address}:1961`);
    ws = new WebSocket(`wss://${address}:1961`, options);
    ws.on('open', function open(){
        console.log('connected!')
        let data = {"conversationToken": cToken,
                    "id": deviceId, 
                    "payload": {"command": "ping" },
                    "sentTime": 1}
        ws.send(JSON.stringify(data));
    });
    ws.on('message', function onMessage(data) {
        console.log(`${Date.now()}: input message` + JSON.parse(data).id + ' ' + JSON.parse(data).sentTime )
    })
}

gettoken().then(makeConn());