const express = require('express');
const router = express.Router();
const axios = require('axios');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const CONF = require('../config/wechat');

const USERS_FILE = path.join(__dirname, '../data/users.json');
const ORDERS_FILE = path.join(__dirname, '../data/orders.json');

// --- 辅助函数 ---
const readUsers = () => {
    if (!fs.existsSync(USERS_FILE)) return [];
    try {
        const content = fs.readFileSync(USERS_FILE, 'utf8');
        return JSON.parse(content || '[]');
    } catch (e) {
        return [];
    }
};

const writeUsers = (data) => {
    const dataDir = path.dirname(USERS_FILE);
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
};

// --- 路由接口 ---

/**
 * A. 微信登录
 * 最终路径：POST /api/auth/wx/login
 */
router.post('/wx/login', async (req, res) => {
    const { code } = req.body;
    if (!code) {
        return res.json({ code: "Error", success: false, msg: "缺少 code" });
    }

    try {
        const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${CONF.appid}&secret=${CONF.secret}&js_code=${code}&grant_type=authorization_code`;
        const wxRes = await axios.get(url);
        const { openid, errmsg } = wxRes.data;

        if (!openid) throw new Error(errmsg || '微信登录授权失败');

        let users = readUsers();
        let user = users.find(u => u.openid === openid);
        
        if (!user) {
            user = {
                userId: `u_${Date.now()}`,
                openid: openid,
                nickName: "微信用户",
                avatarUrl: "",
                phoneNumber: ""
            };
            users.push(user);
            writeUsers(users);
        }

        const token = jwt.sign(
            { userId: user.userId, openid: openid }, 
            CONF.jwtSecret || 'rainbow-meat-shop-secret-2026', 
            { expiresIn: '7d' }
        );

        res.json({
            code: "Success",
            success: true,
            data: {
                token: token,
                userInfo: user
            }
        });
    } catch (err) {
        res.json({ code: "Error", success: false, msg: err.message });
    }
});

/**
 * B. 获取当前用户信息
 * 最终路径：GET /api/user/me
 * 注意：由于 app.js 挂载了 /api/user，这里路径只需写 /me
 */
router.get('/me', (req, res) => {
    try {
        const users = readUsers();
        const user = users.find(u => u.userId === req.user.userId);

        if (!user) {
            return res.json({ code: "Error", success: false, msg: "用户不存在", data: null });
        }

        res.json({
            code: "Success",
            success: true,
            data: {
                userInfo: {
                    userId: user.userId,
                    openid: user.openid || "",
                    nickName: user.nickName || "",
                    avatarUrl: user.avatarUrl || "",
                    phoneNumber: user.phoneNumber || ""
                }
            }
        });
    } catch (err) {
        res.json({ code: "Error", success: false, msg: "获取失败" });
    }
});

/**
 * C. 更新用户资料
 * 最终路径：POST /api/user/profile
 */
router.post('/profile', (req, res) => {
    try {
        const { nickName, avatarUrl } = req.body;
        let users = readUsers();
        const index = users.findIndex(u => u.userId === req.user.userId);

        if (index !== -1) {
            if (nickName) users[index].nickName = nickName;
            if (avatarUrl) users[index].avatarUrl = avatarUrl;
            writeUsers(users);
            res.json({ code: "Success", success: true, data: { ok: true } });
        } else {
            res.json({ code: "Error", success: false, msg: "用户不存在" });
        }
    } catch (err) {
        res.json({ code: "Error", success: false, msg: "更新失败" });
    }
});

/**
 * D. 个人中心聚合数据查询
 * 最终路径：GET /api/auth/center 或 GET /api/user/center
 */
router.get('/center', (req, res) => {
    try {
        const { userId } = req.user; 
        const ordersContent = fs.existsSync(ORDERS_FILE) ? fs.readFileSync(ORDERS_FILE, 'utf8') : '[]';
        const orders = JSON.parse(ordersContent || '[]');
        
        // 数据隔离过滤
        const userOrders = orders.filter(o => o.uid === userId);

        const users = readUsers();
        const user = users.find(u => u.userId === userId);

        res.json({
            code: "Success",
            success: true,
            data: {
                userInfo: {
                    userId: user?.userId,
                    avatarUrl: user?.avatarUrl || '',
                    nickName: user?.nickName || '彩虹肉铺用户',
                    phoneNumber: user?.phoneNumber || ''
                },
                countsData: [
                    { type: 'address', num: 1 } 
                ],
                orderTagInfos: [
                    { tabType: 5,  orderNum: userOrders.filter(o => o.orderStatus === 5).length },
                    { tabType: 10, orderNum: userOrders.filter(o => o.orderStatus === 10).length },
                    { tabType: 40, orderNum: userOrders.filter(o => o.orderStatus === 40).length },
                    { tabType: 0,  orderNum: 0 }
                ],
                customerServiceInfo: {
                    servicePhone: "400-123-4567"
                }
            }
        });
    } catch (err) {
        console.error('Center Error:', err);
        res.json({ code: "Error", success: false, msg: "获取失败" });
    }
});

module.exports = router;