const WxPay = require('wechatpay-node-v3');
const fs = require('fs');
const path = require('path');
const CONF = require('../config/wechat');

const pay = new WxPay({
    appid: CONF.appid,
    mchid: CONF.mchid,
    publicKey: fs.readFileSync(path.join(__dirname, '../cert/wechatpay_platform.pem')),
    privateKey: fs.readFileSync(path.join(__dirname, '../cert/apiclient_key.pem')),
    key: CONF.v3Key,
    serial_no: CONF.serial_no,
});

module.exports = pay;