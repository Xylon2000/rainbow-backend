const express = require('express');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const CONF = require('./config/wechat');

// 导入路由模块
const authRoutes = require('./routes/auth');
const orderRoutes = require('./routes/order');
const payRoutes = require('./routes/pay');
const addressRouter = require('./routes/address');

const app = express();

// 1. 全局基础中间件
app.use(express.json());

// 2. 日志监控中间件
app.use((req, res, next) => {
    const now = new Date().toLocaleString();
    console.log(`\n🚀 [${now}] 收到请求: ${req.method} ${req.url}`);
    
    const authHeader = req.headers['authorization'];
    if (authHeader) console.log(`🔑 鉴权头: ${authHeader}`);

    if (req.method === 'POST' || req.method === 'PUT') {
        console.log('📦 请求体 (Body):', JSON.stringify(req.body, null, 2));
    }
    console.log('------------------------------------------');
    next();
});

// 3. 鉴权中间件 (修复 401 关键点)
const authenticateToken = (req, res, next) => {
    // 修复逻辑：只要路径中包含 login 或 notify 关键词就放行
    // 这样无论 req.path 是否包含 /api 都能准确识别
    const isPublic = req.path.includes('login') || req.path.includes('notify');

    if (isPublic) {
        return next();
    }

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({
            code: "Error",
            success: false,
            msg: "未提供登录凭证"
        });
    }

    jwt.verify(token, CONF.jwtSecret || 'rainbow-meat-shop-secret-2026', (err, decoded) => {
        if (err) {
            console.error('[Auth Error]:', err.message); 
            return res.status(403).json({
                code: "Error",
                success: false,
                msg: "登录已过期或凭证错误"
            });
        }
        req.user = decoded;
        next();
    });
};

// 4. 路由挂载 (严格遵守 API 前缀)
// 全局应用鉴权中间件到所有 /api 开头的请求
app.use('/api', authenticateToken);

// 挂载各模块路由
app.use('/api/auth', authRoutes);    // 登录接口
app.use('/api/user', authRoutes);    // 获取个人信息接口
app.use('/api/order', orderRoutes);  // 订单接口
app.use('/api/address', addressRouter); // 地址接口
app.use('/api/pay', payRoutes);      // 支付及回调接口

// 5. 统一 JSON 响应（含 404/500）
// 处理 404 - 路由不存在
app.use((req, res) => {
    res.status(404).json({
        code: "Error",
        success: false,
        msg: `接口 [${req.method}] ${req.path} 不存在`,
        data: null
    });
});

// 处理 500 - 服务端崩溃
app.use((err, req, res, next) => {
    console.error('🔥 服务器内部错误:', err.stack);
    res.status(500).json({
        code: "Error",
        success: false,
        msg: "服务器内部异常",
        data: null
    });
});

// 6. 初始化检查
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
}

// 7. 启动服务器
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`
    🌈 彩虹肉铺后端启动成功！
    ----------------------------------
    🚀 运行地址: http://localhost:${PORT}
    📂 数据目录: ${dataDir}
    ----------------------------------
    `);
});