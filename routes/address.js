const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const ADDRESS_FILE = path.join(__dirname, '../data/addresses.json');

const readAddresses = () => {
    if (!fs.existsSync(ADDRESS_FILE)) return [];
    return JSON.parse(fs.readFileSync(ADDRESS_FILE, 'utf-8'));
};

// A. 获取地址列表 [cite: 393-418]
router.get('/list', (req, res) => {
    const all = readAddresses();
    const userList = all.filter(a => a.uid === req.user.userId); // UID 隔离 [cite: 516]
    res.json({ code: "Success", success: true, data: userList });
});

// B. 获取地址详情 [cite: 425-447]
router.get('/detail', (req, res) => {
    const { addressId } = req.query;
    const address = readAddresses().find(a => a.addressId === addressId && a.uid === req.user.userId);
    if (!address) return res.json({ code: "Error", success: false, msg: "地址不存在", data: null });
    res.json({ code: "Success", success: true, data: address });
});

// C. 新增 / 更新地址 [cite: 456-484]
router.post('/save', (req, res) => {
    const data = req.body;
    const userId = req.user.userId;
    let all = readAddresses();

    // 默认地址唯一性规则 [cite: 482-483]
    if (data.isDefault === 1) {
        all = all.map(a => a.uid === userId ? { ...a, isDefault: 0 } : a);
    }

    let addressId = data.addressId;
    if (addressId) {
        const idx = all.findIndex(a => a.addressId === addressId && a.uid === userId);
        if (idx !== -1) all[idx] = { ...all[idx], ...data, uid: userId };
    } else {
        addressId = `a_${Date.now()}`; // 后端生成 ID [cite: 484]
        all.push({ ...data, addressId, uid: userId });
    }

    fs.writeFileSync(ADDRESS_FILE, JSON.stringify(all, null, 2));
    res.json({ code: "Success", success: true, data: { addressId } });
});

// D. 删除地址 [cite: 485-497]
router.post('/delete', (req, res) => {
    const { addressId } = req.body;
    let all = readAddresses();
    all = all.filter(a => !(a.addressId === addressId && a.uid === req.user.userId));
    fs.writeFileSync(ADDRESS_FILE, JSON.stringify(all, null, 2));
    res.json({ code: "Success", success: true, data: { ok: true } });
});

module.exports = router;