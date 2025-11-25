const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const COS = require('cos-nodejs-sdk-v5');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件配置
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 腾讯云 COS 配置
const cos = new COS({
  SecretId: process.env.COS_SECRET_ID,
  SecretKey: process.env.COS_SECRET_KEY
});

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
      'video/mkv'
    ];
    
    if (file.mimetype.startsWith('video/') || allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
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
    cos.putObject({
      Bucket: COS_BUCKET,
      Region: COS_REGION,
      Key: `videos/${filename}`,
      Body: fileBuffer,
      ContentType: contentType,
      ContentLength: fileBuffer.length
    }, (err, data) => {
      if (err) {
        console.error('COS 上传错误:', err);
        reject(new Error(`文件上传失败: ${err.message}`));
      } else {
        console.log('COS 上传成功:', filename);
        // 返回公共访问 URL
        const videoUrl = `https://${COS_BUCKET}.cos.${COS_REGION}.myqcloud.com/videos/${filename}`;
        resolve(videoUrl);
      }
    });
  });
}

// COS 删除函数
async function deleteFromCOS(filename) {
  return new Promise((resolve, reject) => {
    cos.deleteObject({
      Bucket: COS_BUCKET,
      Region: COS_REGION,
      Key: `videos/${filename}`
    }, (err, data) => {
      if (err) {
        console.error('COS 删除错误:', err);
        reject(new Error(`文件删除失败: ${err.message}`));
      } else {
        console.log('COS 删除成功:', filename);
        resolve(true);
      }
    });
  });
}

// 生成安全的文件名
function generateSafeFilename(originalName) {
  const extension = path.extname(originalName);
  const baseName = path.basename(originalName, extension);
  const safeBaseName = baseName.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');
  const uniqueId = uuidv4();
  return `${safeBaseName}_${uniqueId}${extension}`;
}

// 获取视频信息（模拟，实际应该解析视频文件）
function getVideoInfo(buffer, mimetype) {
  // 这里可以集成 FFmpeg 等工具来获取视频时长等信息
  return {
    duration: '0:00',
    width: 1920,
    height: 1080,
    format: mimetype.split('/')[1] || 'mp4'
  };
}

// API路由

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: '视频服务器 API',
    storage: '腾讯云 COS',
    bucket: COS_BUCKET,
    region: COS_REGION,
    environment: process.env.NODE_ENV || 'development'
  });
});

// 获取所有视频
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
    console.error('获取视频列表错误:', error);
    res.status(500).json({
      success: false,
      message: '获取视频列表失败'
    });
  }
});

// 上传视频
app.post('/api/upload', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: '没有选择文件'
      });
    }

    // 生成安全文件名
    const safeFilename = generateSafeFilename(req.file.originalname);

    // 上传到腾讯云 COS
    const videoUrl = await uploadToCOS(
      req.file.buffer,
      safeFilename,
      req.file.mimetype
    );

    // 获取视频信息
    const videoInfo = getVideoInfo(req.file.buffer, req.file.mimetype);

    // 创建视频对象
    const newVideo = {
      id: uuidv4(),
      filename: safeFilename,
      originalName: req.file.originalname,
      title: req.body.title || req.file.originalname.replace(/\.[^/.]+$/, ""),
      size: req.file.size,
      mimeType: req.file.mimetype,
      uploadDate: new Date().toISOString(),
      duration: videoInfo.duration,
      resolution: `${videoInfo.width}x${videoInfo.height}`,
      format: videoInfo.format,
      url: videoUrl
    };

    // 添加到视频列表
    videos.push(newVideo);

    console.log(`视频上传成功: ${newVideo.originalName} (${formatFileSize(newVideo.size)})`);

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
    console.error('上传错误:', error);
    res.status(500).json({
      success: false,
      message: error.message || '上传失败'
    });
  }
});

// 获取单个视频信息
app.get('/api/videos/:id', (req, res) => {
  try {
    const videoId = req.params.id;
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
    console.error('获取视频信息错误:', error);
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

    console.log(`视频删除成功: ${video.originalName}`);

    res.json({
      success: true,
      message: '视频删除成功',
      deletedVideo: {
        id: video.id,
        title: video.title
      }
    });
  } catch (error) {
    console.error('删除视频错误:', error);
    res.status(500).json({
      success: false,
      message: error.message || '删除视频失败'
    });
  }
});

// 清空所有视频（开发用）
app.delete('/api/videos', async (req, res) => {
  try {
    // 从 COS 删除所有文件
    const deletePromises = videos.map(video => 
      deleteFromCOS(video.filename).catch(err => {
        console.error(`删除文件 ${video.filename} 失败:`, err);
      })
    );

    await Promise.all(deletePromises);

    const count = videos.length;
    videos = [];

    res.json({
      success: true,
      message: `已清空所有视频 (${count} 个)`
    });
  } catch (error) {
    console.error('清空视频错误:', error);
    res.status(500).json({
      success: false,
      message: '清空视频失败'
    });
  }
});

// 工具函数：格式化文件大小
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 根路径
app.get('/', (req, res) => {
  res.json({
    message: '视频服务器 API 正在运行 (腾讯云 COS)',
    timestamp: new Date().toISOString(),
    storage: {
      provider: '腾讯云 COS',
      bucket: COS_BUCKET,
      region: COS_REGION
    },
    endpoints: {
      'GET /api/health': '健康检查',
      'GET /api/videos': '获取视频列表',
      'GET /api/videos/:id': '获取单个视频信息',
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

  console.error('服务器错误:', error);
  res.status(500).json({
    success: false,
    message: '服务器内部错误'
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
app.listen(PORT, () => {
  console.log('🚀 视频服务器启动成功 (腾讯云 COS)');
  console.log(`📍 端口: ${PORT}`);
  console.log(`☁️  存储: 腾讯云 COS`);
  console.log(`📦 存储桶: ${COS_BUCKET}`);
  console.log(`🌍 区域: ${COS_REGION}`);
  console.log(`⏰ 启动时间: ${new Date().toISOString()}`);
});