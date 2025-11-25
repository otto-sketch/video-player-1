const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors({
  origin: [
    'https://taupe-conkies-57971e.netlify.app',
    'https://video-player-shke.vercel.app',
    'http://localhost:3000',
    'http://127.0.0.1:5500'
  ],
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 内存存储视频数据
let videos = [];

// 工具函数
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ==================== API 路由 ====================

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: '视频服务器 API',
    version: '1.0.0-stable',
    storage: '内存存储（稳定版）'
  });
});

// 获取视频列表
app.get('/api/videos', (req, res) => {
  try {
    const videoList = videos.map(video => ({
      id: video.id,
      title: video.title,
      originalName: video.originalName,
      size: video.size,
      mimeType: video.mimeType,
      uploadDate: video.uploadDate,
      duration: video.duration,
      url: video.url,
      formattedSize: formatFileSize(video.size)
    }));

    res.json({
      success: true,
      count: videos.length,
      videos: videoList
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '获取视频列表失败'
    });
  }
});

// 上传视频（模拟版 - 使用假数据）
app.post('/api/upload', (req, res) => {
  try {
    // 创建模拟视频数据
    const newVideo = {
      id: uuidv4(),
      title: req.body.title || `视频_${Date.now()}`,
      originalName: 'uploaded-video.mp4',
      size: 15728640, // 15MB
      mimeType: 'video/mp4',
      uploadDate: new Date().toISOString(),
      duration: '2:30',
      url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4', // 公共测试视频
      formattedSize: formatFileSize(15728640)
    };

    videos.push(newVideo);

    res.json({
      success: true,
      message: '视频上传成功（模拟模式）',
      video: newVideo
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: '上传失败: ' + error.message
    });
  }
});

// 删除视频
app.delete('/api/videos/:id', (req, res) => {
  try {
    const videoId = req.params.id;
    const videoIndex = videos.findIndex(v => v.id === videoId);

    if (videoIndex === -1) {
      return res.status(404).json({
        success: false,
        message: '视频未找到'
      });
    }

    const deletedVideo = videos.splice(videoIndex, 1)[0];

    res.json({
      success: true,
      message: '视频删除成功',
      deletedVideo: {
        id: deletedVideo.id,
        title: deletedVideo.title
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '删除失败: ' + error.message
    });
  }
});

// 清空所有视频
app.delete('/api/videos', (req, res) => {
  try {
    const count = videos.length;
    videos = [];
    
    res.json({
      success: true,
      message: `已清空所有视频 (${count} 个)`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '清空失败: ' + error.message
    });
  }
});

// 根路径
app.get('/', (req, res) => {
  res.json({
    message: '视频服务器 API - 稳定运行版',
    timestamp: new Date().toISOString(),
    status: '稳定运行',
    mode: '内存存储模式',
    endpoints: {
      'GET /api/health': '健康检查',
      'GET /api/videos': '获取视频列表',
      'POST /api/upload': '上传视频',
      'DELETE /api/videos/:id': '删除视频',
      'DELETE /api/videos': '清空所有视频'
    },
    statistics: {
      totalVideos: videos.length,
      totalSize: formatFileSize(videos.reduce((sum, video) => sum + video.size, 0))
    }
  });
});

// 错误处理
app.use((error, req, res, next) => {
  res.status(500).json({
    success: false,
    message: '服务器错误: ' + error.message
  });
});

// 404 处理
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: '接口不存在',
    path: req.originalUrl
  });
});

// 启动服务器
app.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 视频服务器稳定启动');
  console.log('📍 端口:', PORT);
  console.log('💾 存储: 内存模式');
  console.log('🎯 前端: https://taupe-conkies-57971e.netlify.app');
  console.log('✅ 状态: 稳定运行');
});

module.exports = app;
