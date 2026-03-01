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
// 待收货状态值（与你前端 OrderStatus.PENDING_RECEIPT 对齐）
const STATUS_PENDING_RECEIPT = 40;

// 规范化物流信息：只在待收货时强制返回 companyName + trackingNo
function pickLogistics(order) {
  const isPendingReceipt = Number(order?.orderStatus) === STATUS_PENDING_RECEIPT;

  // 其他状态：logistics 可不返回/可 null（推荐 null，干净）
  if (!isPendingReceipt) return null;

  const lg = order?.logistics || {};
  const companyName = String(lg.companyName || '').trim();
  const trackingNo = String(lg.trackingNo || '').trim();

  // 强制规则：待收货必须有物流信息
  if (!companyName || !trackingNo) {
    // 这里我建议直接抛错，让接口返回 Error，逼自己把 orders.json 数据补齐
    throw new Error('订单处于待收货状态但缺少物流信息');
  }

  return { companyName, trackingNo };
}
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
        const pageList = userOrders.slice(start, start + parseInt(pageSize));

        // 在列表输出时补 logistics 字段（不改原对象也行，这里用浅拷贝）
        const orders = pageList.map((o) => {
        const logistics = pickLogistics(o); // 可能是 null，可能抛错
        return { ...o, logistics };
        });

        res.json({
        code: "Success",
        success: true,
        msg: "",
        data: {
            pageNum: Number(pageNum),
            pageSize: Number(pageSize),
            totalCount: userOrders.length,
            orders,
        },
        });
    } catch (err) {
        res.json({ code: "Error", success: false, msg: "获取失败", data: null });
    }
});

module.exports = router;