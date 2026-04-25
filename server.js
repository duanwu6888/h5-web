const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const PASSWORD_FILE = path.join(DATA_DIR, 'password.txt');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 密码持久化
let ADMIN_PASSWORD = 'admin123';
function loadPassword() {
    if (fs.existsSync(PASSWORD_FILE)) {
        return fs.readFileSync(PASSWORD_FILE, 'utf8').trim();
    }
    fs.writeFileSync(PASSWORD_FILE, ADMIN_PASSWORD);
    return ADMIN_PASSWORD;
}
ADMIN_PASSWORD = loadPassword();

const defaultConfig = {
    title: '我的应用',
    subtitle: '欢迎使用',
    iconAreaSubtitle: '',
    items: [
        { id: 1, type: 'icon', name: '首页', image: 'https://via.placeholder.com/80/667eea/fff?text=首', link: '' },
        { id: 2, type: 'icon', name: '产品', image: 'https://via.placeholder.com/80/764ba2/fff?text=产', link: '' },
        { id: 3, type: 'icon', name: '服务', image: 'https://via.placeholder.com/80/f093fb/fff?text=服', link: '' },
        { id: 4, type: 'icon', name: '关于', image: 'https://via.placeholder.com/80/4facfe/fff?text=关', link: '' }
    ],
    footer: '© 2024 All Rights Reserved',
    users: []
};

function loadConfig() {
    if (fs.existsSync(CONFIG_FILE)) {
        const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        // 兼容旧数据，初始化 users
        if (!config.users) config.users = [];
        return config;
    }
    return defaultConfig;
}

function saveConfig(config) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

if (!fs.existsSync(CONFIG_FILE)) {
    saveConfig(defaultConfig);
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('.'));

// ========== 中间件：管理员验证 ==========
function requireAdmin(req, res, next) {
    const password = req.headers['x-admin-password'];
    if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ success: false, message: '未授权' });
    }
    next();
}

// ========== 公开接口 ==========

// 读取完整配置（后台用）
app.get('/api/config', (req, res) => {
    res.json(loadConfig());
});

// 用户登录（展示页用）
app.post('/api/user-login', (req, res) => {
    const { username, password } = req.body;
    const config = loadConfig();
    const users = config.users || [];
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) {
        return res.status(401).json({ success: false, message: '用户名或密码错误' });
    }
    res.json({
        success: true,
        user: {
            id: user.id,
            username: user.username,
            allowedIconIds: user.allowedIconIds || []
        }
    });
});

// ========== 管理员接口（需要密码） ==========

// 管理员登录验证
app.post('/api/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        res.json({ success: true, token: 'ok' });
    } else {
        res.status(401).json({ success: false, message: '密码错误' });
    }
});

// 修改管理员密码
app.post('/api/change-password', requireAdmin, (req, res) => {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 4) {
        return res.status(400).json({ success: false, message: '新密码至少4位' });
    }
    try {
        fs.writeFileSync(PASSWORD_FILE, newPassword);
        ADMIN_PASSWORD = newPassword;
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 保存配置
app.post('/api/save', requireAdmin, (req, res) => {
    try {
        const current = loadConfig();
        // 合并配置：保留 users 和密码，更新页面内容
        const newConfig = { ...current, ...req.body, users: current.users || [] };
        saveConfig(newConfig);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ===== 用户管理接口 =====

// 获取所有用户
app.get('/api/users', requireAdmin, (req, res) => {
    const config = loadConfig();
    const users = (config.users || []).map(u => ({
        id: u.id,
        username: u.username,
        allowedIconIds: u.allowedIconIds || []
    }));
    res.json({ success: true, users });
});

// 创建用户
app.post('/api/users', requireAdmin, (req, res) => {
    const { username, password, allowedIconIds } = req.body;
    if (!username || !password) {
        return res.status(400).json({ success: false, message: '用户名和密码必填' });
    }
    const config = loadConfig();
    if (!config.users) config.users = [];
    if (config.users.find(u => u.username === username)) {
        return res.status(400).json({ success: false, message: '用户名已存在' });
    }
    const newUser = {
        id: Date.now(),
        username,
        password,
        allowedIconIds: allowedIconIds || []
    };
    config.users.push(newUser);
    saveConfig(config);
    res.json({ success: true, user: { id: newUser.id, username, allowedIconIds: newUser.allowedIconIds } });
});

// 更新用户
app.put('/api/users/:id', requireAdmin, (req, res) => {
    const { username, password, allowedIconIds } = req.body;
    const id = parseInt(req.params.id);
    const config = loadConfig();
    if (!config.users) config.users = [];
    const user = config.users.find(u => u.id === id);
    if (!user) {
        return res.status(404).json({ success: false, message: '用户不存在' });
    }
    // 检查用户名冲突（排除自己）
    if (username && username !== user.username) {
        if (config.users.find(u => u.username === username && u.id !== id)) {
            return res.status(400).json({ success: false, message: '用户名已存在' });
        }
        user.username = username;
    }
    if (password) user.password = password;
    if (allowedIconIds !== undefined) user.allowedIconIds = allowedIconIds;
    saveConfig(config);
    res.json({ success: true, user: { id: user.id, username: user.username, allowedIconIds: user.allowedIconIds } });
});

// 删除用户
app.delete('/api/users/:id', requireAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    const config = loadConfig();
    if (!config.users) config.users = [];
    const idx = config.users.findIndex(u => u.id === id);
    if (idx === -1) {
        return res.status(404).json({ success: false, message: '用户不存在' });
    }
    config.users.splice(idx, 1);
    saveConfig(config);
    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`🚀 H5 Desktop Web Server running on port ${PORT}`);
    console.log(`📱 展示页: http://localhost:${PORT}/index.html`);
    console.log(`⚙️  后台: http://localhost:${PORT}/admin.html`);
    console.log(`🔐 当前密码: ${ADMIN_PASSWORD}`);
});
