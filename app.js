const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const COS = require('cos-nodejs-sdk-v5');

const app = express();
const PORT = process.env.PORT || 3000;

// 启动日志
console.log('=== 服务器启动 ===');
console.log('时间:', new Date().toISOString());
console.log('环境变量检查:', {
    COS_BUCKET_NAME: process.env.COS_BUCKET_NAME,
    COS_REGION: process.env.COS_REGION,
    COS_SECRET_ID: process.env.COS_SECRET_ID ? '已设置' : '未设置',
    COS_SECRET_KEY: process.env.COS_SECRET_KEY ? '已设置' : '未设置'
});

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

const upload = multer({
    storage: storage,
    fileFilter: function (req, file, cb) {
        console.log('🔍 文件类型检查:', file.mimetype, file.originalname);
        
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
            console.log('✅ 文件类型验证通过');
            cb(null, true);
        } else {
            console.log('❌ 文件类型不支持');
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

// COS 上传函数（增强版）
async function uploadToCOS(fileBuffer, filename, contentType) {
    return new Promise((resolve, reject) => {
        if (!cos) {
            console.log('❌ COS 客户端未初始化');
            return reject(new Error('云存储服务未配置'));
        }

        console.log('🚀 开始上传到 COS:', {
            filename: filename,
            size: fileBuffer.length,
            contentType: contentType,
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
                console.error('❌ COS 上传失败:', {
                    error: err.message,
                    code: err.code,
                    stack: err.stack
                });
                reject(new Error(`文件上传失败: ${err.message}`));
            } else {
                console.log('✅ COS 上传成功:', {
                    filename: filename,
                    etag: data.ETag,
                    requestId: data.RequestId
                });
                const videoUrl = `https://${COS_BUCKET}.cos.${COS_REGION}.myqcloud.com/videos/${filename}`;
                resolve(videoUrl);
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

// 存储桶测试接口
app.get('/api/test-cos', (req, res) => {
    console.log('🔧 存储桶测试被调用');
    
    if (!cos) {
        return res.json({
            success: false,
            message: 'COS 客户端未初始化'
        });
    }

    // 测试存储桶访问
    cos.headBucket({
        Bucket: COS_BUCKET,
        Region: COS_REGION
    }, (err, data) => {
        if (err) {
            console.error('❌ 存储桶访问失败:', err);
            return res.json({
                success: false,
                test: 'bucket_access',
                error: err.message,
                errorCode: err.code,
                suggestion: '请检查存储桶配置'
            });
        }

        // 测试上传小文件
        const testContent = Buffer.from('COS connection test - ' + new Date().toISOString());
        const testKey = `test-${Date.now()}.txt`;
        
        cos.putObject({
            Bucket: COS_BUCKET,
            Region: COS_REGION,
            Key: testKey,
            Body: testContent,
            ContentLength: testContent.length
        }, (uploadErr, uploadData) => {
            if (uploadErr) {
                console.error('❌ 存储桶写入失败:', uploadErr);
                return res.json({
                    success: false,
                    test: 'bucket_write', 
                    error: uploadErr.message,
                    errorCode: uploadErr.code,
                    suggestion: '请检查存储桶权限'
                });
            }

            console.log('✅ 存储桶测试完全通过');
            res.json({
                success: true,
                message: '存储桶配置正确',
                bucket: COS_BUCKET,
                region: COS_REGION,
                testFile: testKey
            });
        });
    });
});

// 健康检查
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        service: '视频服务器 API',
        version: '1.0.0-fixed',
        storage: '腾讯云 COS'
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

// 上传视频（修复版）
app.post('/api/upload', upload.single('video'), async (req, res) => {
    console.log('=== 上传请求开始 ===');
    console.log('请求头:', req.headers);
    console.log('请求体类型:', req.headers['content-type']);
    
    try {
        // 检查 multer 是否处理了文件
        if (!req.file) {
            console.log('❌ Multer 未处理文件，可能原因:');
            console.log('- 文件大小超限');
            console.log('- 文件类型不支持'); 
            console.log('- Content-Type 不正确');
            console.log('- 请求体格式错误');
            
            return res.status(400).json({
                success: false,
                message: '没有收到文件，请检查文件格式和大小',
                details: {
                    maxSize: '100MB',
                    allowedTypes: ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv']
                }
            });
        }

        console.log('✅ 文件已接收:', {
            originalName: req.file.originalname,
            size: req.file.size,
            mimetype: req.file.mimetype,
            bufferLength: req.file.buffer?.length,
            fieldname: req.file.fieldname
        });

        // 生成安全文件名
        const safeFilename = generateSafeFilename(req.file.originalname);
        console.log('📁 生成文件名:', safeFilename);

        // 上传到 COS
        console.log('🚀 开始上传到 COS...');
        const videoUrl = await uploadToCOS(
            req.file.buffer,
            safeFilename,
            req.file.mimetype
        );

        console.log('✅ COS 上传成功，URL:', videoUrl);

        // 创建视频记录
        const newVideo = {
            id: uuidv4(),
            filename: safeFilename,
            originalName: req.file.originalname,
            title: req.body.title || req.file.originalname.replace(/\.[^/.]+$/, ""),
            size: req.file.size,
            mimeType: req.file.mimetype,
            uploadDate: new Date().toISOString(),
            duration: '0:00',
            url: videoUrl
        };

        // 添加到内存存储
        videos.push(newVideo);

        console.log('🎉 上传流程完成，视频已保存');

        res.json({
            success: true,
            message: '视频上传成功',
            video: newVideo
        });

    } catch (error) {
        console.error('💥 上传过程中出错:', error);
        res.status(500).json({
            success: false,
            message: error.message || '上传失败',
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// 模拟上传接口（备用方案）
app.post('/api/upload-mock', (req, res) => {
    console.log('🔄 使用模拟上传');
    
    try {
        const mockVideo = {
            id: uuidv4(),
            title: '模拟视频 ' + new Date().toLocaleString(),
            originalName: 'mock-video.mp4',
            size: 15728640,
            mimeType: 'video/mp4',
            uploadDate: new Date().toISOString(),
            duration: '2:30',
            url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
            message: '模拟上传 - COS 可能有问题'
        };

        videos.push(mockVideo);

        res.json({
            success: true,
            message: '模拟上传成功',
            video: mockVideo
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: '模拟上传失败: ' + error.message
        });
    }
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
                            reject(err);
                        } else {
                            console.log('✅ COS 文件删除成功');
                            resolve(data);
                        }
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
        message: '视频服务器 API - 修复版',
        timestamp: new Date().toISOString(),
        status: '运行中',
        endpoints: {
            'GET /api/health': '健康检查',
            'GET /api/test-cos': 'COS 连接测试',
            'GET /api/videos': '获取视频列表',
            'POST /api/upload': '上传视频',
            'POST /api/upload-mock': '模拟上传',
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
                message: '文件太大，请选择小于100MB的文件'
            });
        }
    }

    console.error('服务器错误:', error);
    res.status(500).json({
        success: false,
        message: '服务器内部错误'
    });
});

// 启动服务器
app.listen(PORT, '0.0.0.0', () => {
    console.log('🚀 视频服务器启动成功 - 修复版');
    console.log('📍 端口:', PORT);
    console.log('☁️  存储: 腾讯云 COS');
    console.log('📦 存储桶:', COS_BUCKET);
    console.log('🌍 区域:', COS_REGION);
    console.log('✅ 状态: 就绪');
});

module.exports = app;
