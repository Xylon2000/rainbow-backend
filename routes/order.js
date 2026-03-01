const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const ORDERS_FILE = path.join(__dirname, '../data/orders.json');

// 辅助函数：安全读取订单
const readOrders = () => {
    try {
        if (!fs.existsSync(ORDERS_FILE)) return [];
        const content = fs.readFileSync(ORDERS_FILE, 'utf-8');
        return content ? JSON.parse(content) : [];
    } catch (e) {
        return [];
    }
};

/**
 * 1）创建订单接口
 * POST /api/order/commit
 */
router.post('/commit', (req, res) => {
    try {
        const { goodsRequestList, userAddressReq, totalAmount, storeInfoList } = req.body;
        const userId = req.user.userId;

        // 生成契约要求的 tradeNo
        const tradeNo = `CH${Date.now()}${Math.floor(Math.random() * 900 + 100)}`;

        const newOrder = {
            uid: userId, 
            orderId: `o_${Date.now()}`,
            orderNo: tradeNo, 
            parentOrderNo: tradeNo,
            orderStatus: 5, 
            orderStatusName: "待付款",
            createTime: String(Date.now()), 
            totalAmount: String(totalAmount), 
            paymentAmount: String(totalAmount),
            // 补齐 items 必需字段
            items: (goodsRequestList || []).map(item => ({
                spuId: item.spuId,
                skuId: item.skuId || "", 
                storeId: item.storeId || "1000",
                buyQuantity: item.quantity,
                priceAtOrder: String(item.price || totalAmount)
            })),
            logisticsVO: {
                receiverName: userAddressReq?.name || "",
                receiverPhone: userAddressReq?.phone || "",
                receiverAddress: userAddressReq?.detailAddress || "",
                receiverCity: userAddressReq?.province || ""
            },
            paymentVO: { paySuccessTime: null }
        };

        const orders = readOrders();
        orders.push(newOrder);
        fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));

        // 控制台实时监控日志
        console.log('\n---------------- 📦 写入新订单 ----------------');
        console.log(`🆔 交易单号: ${tradeNo}`);
        console.log(`👤 用户: ${userId}`);
        console.log(`💰 金额: ${totalAmount} 分`);
        console.log('✅ 订单已入库并符合 Update4 契约');
        console.log('----------------------------------------------\n');

        res.json({
            code: "Success",
            success: true,
            data: {
                orderNo: tradeNo,
                tradeNo: tradeNo,
                channel: "wechat",
                payInfo: "{}",
                transactionId: null,
                interactId: null
            }
        });
    } catch (err) {
        console.error('❌ 下单崩溃:', err.message);
        res.json({ code: "Error", success: false, msg: "下单失败", data: null });
    }
});

/**
 * 2）获取订单详情
 * GET /api/order/detail
 */
router.get('/detail', (req, res) => {
    try {
        const { orderNo } = req.query;
        const all = readOrders();
        const order = all.find(o => o.orderNo === orderNo && o.uid === req.user.userId);

        if (order) {
            res.json({ code: "Success", success: true, data: order });
        } else {
            res.json({ code: "Error", success: false, msg: "订单不存在", data: null });
        }
    } catch (err) {
        res.json({ code: "Error", success: false, msg: "查询异常", data: null });
    }
});

/**
 * 3）获取订单列表
 */
router.get('/list', (req, res) => {
    try {
        const { pageNum = 1, pageSize = 10, orderStatus } = req.query;
        const all = readOrders();
        let userOrders = all.filter(o => o.uid === req.user.userId);
        
        if (orderStatus && orderStatus != -1) {
            userOrders = userOrders.filter(o => o.orderStatus == orderStatus);
        }

        const start = (parseInt(pageNum) - 1) * parseInt(pageSize);
        const list = userOrders.slice(start, start + parseInt(pageSize));

        res.json({
            code: "Success",
            success: true,
            data: {
                pageNum: Number(pageNum),
                pageSize: Number(pageSize),
                totalCount: userOrders.length,
                orders: list
            }
        });
    } catch (err) {
        res.json({ code: "Error", success: false, msg: "获取失败", data: null });
    }
});

module.exports = router;