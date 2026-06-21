const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const CleanupTask = require('./modules/cleanupTask');

const uploadRoutes = require('./routes/upload');
const downloadRoutes = require('./routes/download');
const adminRoutes = require('./routes/admin');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/upload', uploadRoutes);
app.use('/api/download', downloadRoutes);
app.use('/api/admin', adminRoutes);

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: '服务运行正常',
    timestamp: new Date().toISOString()
  });
});

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({
      success: false,
      message: '接口不存在'
    });
  } else {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json({
    success: false,
    message: '服务器内部错误'
  });
});

app.listen(config.PORT, () => {
  console.log(`\n========================================`);
  console.log(`  文件快递柜服务已启动`);
  console.log(`  访问地址: http://localhost:${config.PORT}`);
  console.log(`  上传页面: http://localhost:${config.PORT}/`);
  console.log(`  下载页面: http://localhost:${config.PORT}/download.html`);
  console.log(`  后台管理: http://localhost:${config.PORT}/admin.html`);
  console.log(`========================================\n`);

  CleanupTask.start();
});
