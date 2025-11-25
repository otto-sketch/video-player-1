const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const COS = require('cos-nodejs-sdk-v5');

const app = express();
const PORT = process.env.PORT || 3000;

// 环境变量检查
console.log('=== 环境变量检查 ===');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT:', process.env.PORT);
console.log('COS_BUCKET_NAME:', process.env.COS_BUCKET_NAME);
console.log('COS_REGION:', process.env.COS_REGION);
console.log('COS_SECRET_ID exists:', !!process.env.COS_SECRET_ID);
console.log('COS_SECRET_KEY exists:', !!process.env.COS_SECRET_KEY);

// CORS 配置 - 允许您的前端域名
app.use(cors({
  origin: [
    'https://taupe-conkies-57971e.netlify.app', // 您的前端地址
    'https://video-player-shke.vercel.app',     // 后端地址
    'http://localhost:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'x-requested-with'],
  credentials: true,
  maxAge: 3600
}));

// 显式处理 OPTIONS 请求
app.options('*', cors());

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// 腾讯云 COS 配置
let cos;
try {
  cos = new COS({
    SecretId: process.env.COS_SECRET_ID || '',
    SecretKey: process.env.COS_SECRET_KEY || ''
  });
  console.log('✅ COS 客户端初始化成功');
} catch (error) {
  console.error('❌ COS 客户端初始化失败:', error);
  cos = null;
}

const COS_BUCKET = process.env.COS_BUCKET_NAME || 'video-bucket-wzh-1388319070';
const COS_REGION = process.env.COS_REGION || 'ap-beijing';

// 内存存储
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  fileFilter: function (req, file, cb) {
    const allowedTypes = [
      'video/mp4', 
      'video/webm', 
      'video/ogg', 
      'video/quicktime', 
      'video/x-msvideo',
      'video/avi',
      'video/mov',
      'video/mkv',
      'video/x-matroska'
    ];
    
    if (file.mimetype.startsWith('video/') || allowedTypes.includes(file.mimetype)) {
      console.log(`✅ 文件类型验证通过: ${file.mimetype}`);
      cb(null, true);
    } else {
      console.log(`❌ 文件类型不支持: ${file.mimetype}`);
      cb(new Error(`不支持的文件类型: ${file.mimetype}`), false);
    }
  },
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
    files: 1
  }
});

// 视频数据存储
let videos = [];

// COS 上传函数
async function uploadToCOS(fileBuffer, filename, contentType) {
  return new Promise((resolve, reject) => {
    if (!cos) {
      return reject(new Error('COS 客户端未初始化'));
    }

    console.log(`📤 开始上传到 COS: ${filename}, 大小: ${formatFileSize(fileBuffer.length)}`);

    cos.putObject({
      Bucket: COS_BUCKET,
      Region: COS_REGION,
      Key: `videos/${filename}`,
      Body: fileBuffer,
      ContentType: contentType,
      ContentLength: fileBuffer.length
    }, (err, data) => {
      if (err) {
        console.error('❌ COS 上传失败:', err);
        reject(new Error(`文件上传失败: ${err.message} (代码: ${err.code})`));
      } else {
        console.log('✅ COS 上传成功:', filename);
        const videoUrl = `https://${COS_BUCKET}.cos.${COS_REGION}.myqcloud.com/videos/${filename}`;
        resolve(videoUrl);
      }
    });
  });
}

// COS 删除函数
async function deleteFromCOS(filename) {
  return new Promise((resolve, reject) => {
    if (!cos) {
      return reject(new Error('COS 客户端未初始化'));
    }

    cos.deleteObject({
      Bucket: COS_BUCKET,
      Region: COS_REGION,
      Key: `videos/${filename}`
    }, (err, data) => {
      if (err) {
        console.error('❌ COS 删除失败:', err);
        reject(new Error(`文件删除失败: ${err.message}`));
      } else {
        console.log('✅ COS 删除成功:', filename);
        resolve(true);
      }
    });
  });
}

// 生成安全的文件名
function generateSafeFilename(originalName) {
  const extension = path.extname(originalName);
  const baseName = path.basename(originalName, extension);
  const safeBaseName = baseName.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_');
  const uniqueId = uuidv4();
  return `${safeBaseName}_${uniqueId}${extension}`;
}

// 工具函数：格式化文件大小
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ==================== API 路由 ====================

// 诊断接口
app.get('/api/debug', (req, res) => {
  console.log('🔧 诊断接口被调用');
  res.json({
    status: 'ALIVE',
    message: '服务器正常运行',
    timestamp: new Date().toISOString(),
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      PORT: process.env.PORT,
      COS_BUCKET: COS_BUCKET,
      COS_REGION: COS_REGION,
      COS_CONFIGURED: !!(process.env.COS_SECRET_ID && process.env.COS_SECRET_KEY),
      NODE_VERSION: process.version
    },
    cors: {
      allowed_origins: [
        'https://taupe-conkies-57971e.netlify.app',
        'https://video-player-shke.vercel.app'
      ]
    }
  });
});

// 存储桶测试接口
app.get('/api/test-bucket', (req, res) => {
  if (!cos) {
    return res.json({
      status: 'COS_NOT_INITIALIZED',
      message: 'COS 客户端未初始化，请检查环境变量'
    });
  }

  console.log(`🔍 测试存储桶: ${COS_BUCKET}, 地域: ${COS_REGION}`);

  // 测试存储桶访问
  cos.headBucket({
    Bucket: COS_BUCKET,
    Region: COS_REGION
  }, (err, data) => {
    if (err) {
      console.error('❌ 存储桶访问失败:', err);
      return res.json({
        status: 'BUCKET_ERROR',
        bucket: COS_BUCKET,
        region: COS_REGION,
        error: err.message,
        error_code: err.code,
        suggestion: '请检查存储桶名称、地域和权限设置'
      });
    }

    // 测试上传权限
    const testKey = `test-${Date.now()}.txt`;
    cos.putObject({
      Bucket: COS_BUCKET,
      Region: COS_REGION,
      Key: testKey,
      Body: '测试文件内容 - ' + new Date().toISOString()
    }, (uploadErr, uploadData) => {
      if (uploadErr) {
        console.error('❌ 存储桶写入失败:', uploadErr);
        return res.json({
          status: 'UPLOAD_PERMISSION_ERROR',
          error: uploadErr.message,
          suggestion: '请检查存储桶权限（需要公有读私有写）和CORS设置'
        });
      }

      console.log('✅ 存储桶测试完全通过');
      res.json({
        status: 'SUCCESS',
        bucket: COS_BUCKET,
        region: COS_REGION,
        message: '存储桶配置正确，可以正常读写'
      });
    });
  });
});

// CORS 测试接口
app.get('/api/test-cors', (req, res) => {
  console.log('🌐 CORS 测试接口被调用');
  res.json({
    status: 'CORS_TEST_PASS',
    message: 'CORS 配置正常',
    timestamp: new Date().toISOString(),
    your_origin: req.headers.origin,
    allowed_origins: [
      'https://taupe-conkies-57971e.netlify.app',
      'https://video-player-shke.vercel.app'
    ]
  });
});

// 健康检查
app.get('/api/health', (req, res) => {
  console.log('🏥 健康检查被调用');
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: '视频服务器 API',
    version: '1.0.0',
    storage: '腾讯云 COS',
    frontend: 'https://taupe-conkies-57971e.netlify.app'
  });
});

// 获取所有视频
app.get('/api/videos', (req, res) => {
  try {
    console.log('📋 获取视频列表，总数:', videos.length);
    
    const videoList = videos.map(video => ({
      id: video.id,
      title: video.title,
      originalName: video.originalName,
      size: video.size,
      mimeType: video.mimeType,
      uploadDate: video.uploadDate,
      duration: video.duration || '0:00',
      url: video.url,
      formattedSize: formatFileSize(video.size),
      resolution: video.resolution,
      format: video.format
    }));

    res.json({
      success: true,
      count: videos.length,
      videos: videoList
    });
  } catch (error) {
    console.error('❌ 获取视频列表错误:', error);
    res.status(500).json({
      success: false,
      message: '获取视频列表失败'
    });
  }
});

// 上传视频
app.post('/api/upload', upload.single('video'), async (req, res) => {
  console.log('📤 上传接口被调用');
  
  try {
    if (!req.file) {
      console.log('❌ 没有收到文件');
      return res.status(400).json({
        success: false,
        message: '没有选择文件或文件上传失败'
      });
    }

    console.log(`📄 收到文件: ${req.file.originalname}, 大小: ${formatFileSize(req.file.size)}`);

    // 验证 COS 配置
    if (!cos) {
      console.log('❌ COS 客户端未初始化');
      return res.status(500).json({
        success: false,
        message: '云存储服务未配置，请检查环境变量'
      });
    }

    // 生成安全文件名
    const safeFilename = generateSafeFilename(req.file.originalname);
    console.log(`🔐 生成安全文件名: ${safeFilename}`);

    // 上传到腾讯云 COS
    const videoUrl = await uploadToCOS(
      req.file.buffer,
      safeFilename,
      req.file.mimetype
    );

    // 创建视频对象
    const newVideo = {
      id: uuidv4(),
      filename: safeFilename,
      originalName: req.file.originalname,
      title: req.body.title || req.file.originalname.replace(/\.[^/.]+$/, ""),
      size: req.file.size,
      mimeType: req.file.mimetype,
      uploadDate: new Date().toISOString(),
      duration: '0:00',
      resolution: '未知',
      format: req.file.mimetype.split('/')[1] || '未知',
      url: videoUrl
    };

    // 添加到视频列表
    videos.push(newVideo);

    console.log(`✅ 视频上传完成: ${newVideo.originalName}`);

    res.json({
      success: true,
      message: '视频上传成功',
      video: {
        id: newVideo.id,
        title: newVideo.title,
        originalName: newVideo.originalName,
        size: newVideo.size,
        formattedSize: formatFileSize(newVideo.size),
        mimeType: newVideo.mimeType,
        uploadDate: newVideo.uploadDate,
        duration: newVideo.duration,
        resolution: newVideo.resolution,
        format: newVideo.format,
        url: newVideo.url
      }
    });

  } catch (error) {
    console.error('❌ 上传处理失败:', error);
    res.status(500).json({
      success: false,
      message: error.message || '上传失败，请稍后重试'
    });
  }
});

// 获取单个视频信息
app.get('/api/videos/:id', (req, res) => {
  try {
    const videoId = req.params.id;
    console.log(`🔍 获取视频信息: ${videoId}`);
    
    const video = videos.find(v => v.id === videoId);

    if (!video) {
      return res.status(404).json({
        success: false,
        message: '视频未找到'
      });
    }

    res.json({
      success: true,
      video: {
        id: video.id,
        title: video.title,
        originalName: video.originalName,
        size: video.size,
        formattedSize: formatFileSize(video.size),
        mimeType: video.mimeType,
        uploadDate: video.uploadDate,
        duration: video.duration,
        resolution: video.resolution,
        format: video.format,
        url: video.url
      }
    });
  } catch (error) {
    console.error('❌ 获取视频信息错误:', error);
    res.status(500).json({
      success: false,
      message: '获取视频信息失败'
    });
  }
});

// 删除视频
app.delete('/api/videos/:id', async (req, res) => {
  try {
    const videoId = req.params.id;
    console.log(`🗑️ 删除视频: ${videoId}`);
    
    const videoIndex = videos.findIndex(v => v.id === videoId);

    if (videoIndex === -1) {
      return res.status(404).json({
        success: false,
        message: '视频未找到'
      });
    }

    const video = videos[videoIndex];

    // 从 COS 删除文件
    await deleteFromCOS(video.filename);

    // 从内存中删除
    videos.splice(videoIndex, 1);

    console.log(`✅ 视频删除成功: ${video.originalName}`);

    res.json({
      success: true,
      message: '视频删除成功',
      deletedVideo: {
        id: video.id,
        title: video.title
      }
    });
  } catch (error) {
    console.error('❌ 删除视频错误:', error);
    res.status(500).json({
      success: false,
      message: error.message || '删除视频失败'
    });
  }
});

// 根路径
app.get('/', (req, res) => {
  res.json({
    message: '视频服务器 API 正在运行 (腾讯云 COS)',
    timestamp: new Date().toISOString(),
    frontend: 'https://taupe-conkies-57971e.netlify.app',
    storage: {
      provider: '腾讯云 COS',
      bucket: COS_BUCKET,
      region: COS_REGION
    },
    endpoints: {
      'GET /api/health': '健康检查',
      'GET /api/debug': '系统诊断',
      'GET /api/test-bucket': '存储桶测试',
      'GET /api/test-cors': 'CORS测试',
      'GET /api/videos': '获取视频列表',
      'GET /api/videos/:id': '获取单个视频信息',
      'POST /api/upload': '上传视频',
      'DELETE /api/videos/:id': '删除视频'
    },
    statistics: {
      totalVideos: videos.length,
      totalSize: formatFileSize(videos.reduce((sum, video) => sum + video.size, 0))
    }
  });
});

// 错误处理中间件
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: '文件太大，请选择小于100MB的文件'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: '一次只能上传一个文件'
      });
    }
  }

  console.error('❌ 服务器错误:', error);
  res.status(500).json({
    success: false,
    message: '服务器内部错误: ' + error.message
  });
});

// 404 处理
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: '接口不存在',
    path: req.originalUrl,
    available_endpoints: [
      '/api/health',
      '/api/debug', 
      '/api/videos',
      '/api/upload'
    ]
  });
});

// 启动服务器
app.listen(PORT, () => {
  console.log('🚀 视频服务器启动成功 (腾讯云 COS)');
  console.log(`📍 端口: ${PORT}`);
  console.log(`☁️  存储: 腾讯云 COS`);
  console.log(`📦 存储桶: ${COS_BUCKET}`);
  console.log(`🌍 区域: ${COS_REGION}`);
  console.log(`🎯 前端: https://taupe-conkies-57971e.netlify.app`);
  console.log(`⏰ 启动时间: ${new Date().toISOString()}`);
  console.log('=================================');
});

module.exports = app;
