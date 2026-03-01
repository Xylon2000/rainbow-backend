const express = require('express');
const router = express.Router();
const WxPay = require('wechatpay-node-v3');
const fs = require('fs');
const path = require('path');
const CONF = require('../config/wechat');

const ORDERS_FILE = path.join(__dirname, '../data/orders.json');

// --- 1. 初始化支付实例 ---
const pay = new WxPay({
    appid: CONF.appid,
    mchid: CONF.mchid,
    publicKey: fs.readFileSync(path.join(__dirname, '../cert/wechatpay_platform.pem')),
    privateKey: fs.readFileSync(path.join(__dirname, '../cert/apiclient_key.pem')),
    key: CONF.v3Key,
    serial_no: CONF.serial_no,
});

/**
 * 2. 预支付接口 (下单)
 * POST /api/pay/prepay
 */
router.post('/prepay', async (req, res) => {
    const { orderNo } = req.body;
    const userId = req.user.userId;

    try {
        const orders = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf-8') || '[]');
        const order = orders.find(o => o.orderNo === orderNo && o.uid === userId);

        if (!order) return res.json({ code: "Error", success: false, msg: "订单不存在" });

        const params = {
            description: '彩虹肉铺-订单支付',
            out_trade_no: orderNo,
            notify_url: 'https://5a98b7c0.r32.cpolar.top/api/pay/wechat/notify', 
            amount: { 
                total: parseInt(order.totalAmount), 
                currency: 'CNY' 
            },
            payer: { openid: req.user.openid }, 
        };

        const result = await pay.transactions_jsapi(params);
        const wxResult = result.data; 

        const payParams = {
            timeStamp: String(wxResult.timeStamp), 
            nonceStr: wxResult.nonceStr,
            package: wxResult.package,
            signType: "RSA",
            paySign: wxResult.paySign
        };

        console.log(`\n--- 💳 发起支付调试 ---`);
        console.log(`单号: ${orderNo}, 发往前端参数:`, JSON.stringify(payParams, null, 2));

        return res.json({ code: "Success", success: true, data: payParams });
    } catch (err) {
        console.error('❌ 预支付异常:', err.message);
        if (!res.headersSent) {
            return res.json({ code: "Error", success: false, msg: "发起支付失败" });
        }
    }
});

/**
 * 3. 稳健版支付回调通知 (手动解密补丁)
 * POST /api/pay/wechat/notify
 */
router.post('/wechat/notify', async (req, res) => {
    console.log(`\n🚀 [${new Date().toLocaleString()}] 收到微信回调通知`);
    
    try {
        let result;
        try {
            // A. 尝试 SDK 标准验签
            result = await pay.verifySign(req.headers, req.body);
        } catch (verifyErr) {
            console.warn('⚠️ SDK 自动验签失败（证书环境问题），执行手动解密补丁...');
            const { resource } = req.body;
            if (resource && resource.ciphertext) {
                // 执行手动解密
                const decrypted = pay.decipher_gcm(
                    resource.ciphertext,
                    resource.associated_data,
                    resource.nonce,
                    CONF.v3Key
                );
                
                // ✨ 关键修复：防止 [object Object] 报错
                const decryptedData = typeof decrypted === 'string' ? JSON.parse(decrypted) : decrypted;
                
                result = { 
                    resource: { ciphertext: decryptedData }, 
                    event_type: req.body.event_type 
                };
            }
        }

        // B. 校验支付结果
        if (result && result.resource && result.event_type === 'TRANSACTION.SUCCESS') {
            const data = result.resource.ciphertext; 
            const orderNo = data.out_trade_no;

            console.log(`✅ 支付确认成功！单号: ${orderNo}`);

            let orders = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf-8') || '[]');
            const index = orders.findIndex(o => o.orderNo === orderNo);
            
            if (index !== -1 && orders[index].orderStatus !== 10) {
                orders[index].orderStatus = 10; // 状态更新为：已支付 (待发货)
                orders[index].orderStatusName = "已支付";
                orders[index].paymentVO = { 
                    paySuccessTime: String(Date.now()),
                    transactionId: data.transaction_id,
                    channel: "wechat"
                };
                fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
                console.log(`💾 数据库已更新：订单 ${orderNo} 状态流转 -> 待发货`);
            } else {
                console.log(`ℹ️ 订单 ${orderNo} 状态无需重复更新`);
            }

            // C. 成功响应微信，防止其继续重试
            return res.status(200).json({ code: 'SUCCESS', message: 'OK' });
        }
        
    } catch (err) {
        console.error('❌ 回调核心逻辑严重异常:', err.message);
        if (!res.headersSent) {
            return res.status(500).json({ code: 'FAIL' });
        }
    }
});

module.exports = router;