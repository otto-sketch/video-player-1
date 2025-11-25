const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const COS = require('cos-nodejs-sdk-v5');

const app = express();
const PORT = process.env.PORT || 3000;

// 启动日志
console.log('=== 服务器启动（仅MP4支持） ===');
console.log('时间:', new Date().toISOString());
console.log('支持格式: .mp4 only');

// CORS 配置
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

// 内存存储配置
const storage = multer.memoryStorage();

// 仅支持 MP4 的 multer 配置
const upload = multer({
    storage: storage,
    fileFilter: function (req, file, cb) {
        console.log('🔍 文件检查:', {
            filename: file.originalname,
            mimetype: file.mimetype,
            extension: path.extname(file.originalname).toLowerCase()
        });
        
        // 严格的 MP4 验证
        const allowedMimeTypes = ['video/mp4', 'video/mp4v-es', 'application/mp4'];
        const isMP4MimeType = allowedMimeTypes.includes(file.mimetype);
        const isMP4Extension = path.extname(file.originalname).toLowerCase() === '.mp4';
        
        if (isMP4MimeType && isMP4Extension) {
            console.log('✅ MP4 文件验证通过');
            cb(null, true);
        } else {
            console.log('❌ 文件类型拒绝 - 只支持 .mp4 格式');
            console.log('收到:', {
                mimetype: file.mimetype,
                extension: path.extname(file.originalname),
                expected: '.mp4'
            });
            cb(new Error('只支持 .mp4 格式的视频文件。请检查文件格式。'), false);
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
            console.log('❌ COS 客户端未初始化');
            return reject(new Error('云存储服务未配置'));
        }

        console.log('🚀 开始上传到 COS:', {
            filename: filename,
            size: fileBuffer.length,
            bucket: COS_BUCKET,
            region: COS_REGION
        });

        cos.putObject({
            Bucket: COS_BUCKET,
            Region: COS_REGION,
            Key: `videos/${filename}`,
            Body: fileBuffer,
            ContentType: contentType,
            ContentLength: fileBuffer.length
        }, (err, data) => {
            if (err) {
                console.error('❌ COS 上传失败:', err.message);
                reject(new Error(`文件上传失败: ${err.message}`));
            } else {
                console.log('✅ COS 上传成功');
                const videoUrl = `https://${COS_BUCKET}.cos.${COS_REGION}.myqcloud.com/videos/${filename}`;
                resolve(videoUrl);
            }
        });
    });
}

// 生成安全的文件名
function generateSafeFilename(originalName) {
    const baseName = path.basename(originalName, '.mp4');
    const safeBaseName = baseName.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_');
    const uniqueId = uuidv4();
    return `${safeBaseName}_${uniqueId}.mp4`;
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

// 健康检查
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        service: '视频服务器 API',
        version: '1.0.0-mp4-only',
        supported_formats: ['.mp4'],
        max_file_size: '100MB'
    });
});

// 获取视频列表
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
        console.error('获取视频列表错误:', error);
        res.status(500).json({
            success: false,
            message: '获取视频列表失败'
        });
    }
});

// 上传视频（仅 MP4）
app.post('/api/upload', upload.single('video'), async (req, res) => {
    console.log('=== MP4 上传开始 ===');
    
    try {
        // 检查文件是否收到
        if (!req.file) {
            console.log('❌ Multer 未处理文件');
            return res.status(400).json({
                success: false,
                message: '没有收到文件或文件格式不支持',
                supported_formats: ['.mp4'],
                max_size: '100MB'
            });
        }

        console.log('✅ 文件已接收:', {
            originalName: req.file.originalname,
            size: req.file.size,
            mimetype: req.file.mimetype,
            bufferLength: req.file.buffer?.length
        });

        // 检查 COS 配置
        if (!cos) {
            console.log('❌ COS 客户端未就绪');
            throw new Error('云存储服务未配置');
        }

        // 生成文件名
        const safeFilename = generateSafeFilename(req.file.originalname);
        console.log('📁 生成文件名:', safeFilename);

        // 上传到 COS
        console.log('🚀 开始上传到 COS...');
        const videoUrl = await uploadToCOS(
            req.file.buffer,
            safeFilename,
            'video/mp4'
        );

        console.log('✅ COS 上传成功，URL:', videoUrl);

        // 创建视频记录
        const newVideo = {
            id: uuidv4(),
            filename: safeFilename,
            originalName: req.file.originalname,
            title: req.body.title || req.file.originalname.replace('.mp4', ''),
            size: req.file.size,
            mimeType: 'video/mp4',
            uploadDate: new Date().toISOString(),
            duration: '0:00',
            url: videoUrl
        };

        // 添加到列表
        videos.push(newVideo);

        console.log('🎉 MP4 上传流程完成');

        res.json({
            success: true,
            message: 'MP4 视频上传成功',
            video: newVideo
        });

    } catch (error) {
        console.error('💥 上传过程中出错:', error);
        res.status(500).json({
            success: false,
            message: error.message || '上传失败',
            supported_formats: ['.mp4']
        });
    }
});

// 文件格式测试接口
app.post('/api/test-format', upload.single('video'), (req, res) => {
    if (!req.file) {
        return res.json({
            success: false,
            message: '文件验证失败',
            reason: '未收到文件或格式不支持',
            supported: '.mp4 only'
        });
    }

    res.json({
        success: true,
        message: '文件格式验证通过',
        fileInfo: {
            name: req.file.originalname,
            type: req.file.mimetype,
            size: req.file.size,
            supported: true
        }
    });
});

// 删除视频
app.delete('/api/videos/:id', async (req, res) => {
    try {
        const videoId = req.params.id;
        console.log('🗑️ 删除视频:', videoId);
        
        const videoIndex = videos.findIndex(v => v.id === videoId);

        if (videoIndex === -1) {
            return res.status(404).json({
                success: false,
                message: '视频未找到'
            });
        }

        const video = videos[videoIndex];

        // 从 COS 删除文件
        if (cos && video.filename) {
            try {
                await new Promise((resolve, reject) => {
                    cos.deleteObject({
                        Bucket: COS_BUCKET,
                        Region: COS_REGION,
                        Key: `videos/${video.filename}`
                    }, (err, data) => {
                        if (err) {
                            console.error('COS 删除失败:', err);
                        } else {
                            console.log('✅ COS 文件删除成功');
                        }
                        resolve();
                    });
                });
            } catch (deleteError) {
                console.error('文件删除失败:', deleteError);
            }
        }

        // 从内存中删除
        videos.splice(videoIndex, 1);

        res.json({
            success: true,
            message: '视频删除成功'
        });

    } catch (error) {
        console.error('删除视频错误:', error);
        res.status(500).json({
            success: false,
            message: '删除失败: ' + error.message
        });
    }
});

// 根路径
app.get('/', (req, res) => {
    res.json({
        message: '视频服务器 API - MP4专用版',
        timestamp: new Date().toISOString(),
        status: '运行中',
        supported_formats: ['.mp4'],
        max_file_size: '100MB',
        endpoints: {
            'GET /api/health': '健康检查',
            'GET /api/videos': '获取视频列表',
            'POST /api/upload': '上传MP4视频',
            'POST /api/test-format': '测试文件格式',
            'DELETE /api/videos/:id': '删除视频'
        }
    });
});

// 错误处理中间件
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        console.error('Multer 错误:', error);
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: '文件太大，请选择小于100MB的MP4文件'
            });
        }
    }

    console.error('服务器错误:', error);
    res.status(500).json({
        success: false,
        message: error.message || '服务器内部错误'
    });
});

// 启动服务器
app.listen(PORT, '0.0.0.0', () => {
    console.log('🚀 视频服务器启动成功 - MP4专用版');
    console.log('📍 端口:', PORT);
    console.log('🎯 支持格式: .mp4 only');
    console.log('💾 存储: 腾讯云 COS');
    console.log('✅ 状态: 就绪');
});

module.exports = app;
