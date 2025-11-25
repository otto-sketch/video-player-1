const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// 启动日志
console.log('=== 视频服务器启动 ===');
console.log('时间:', new Date().toISOString());
console.log('模式: 内存存储 + 模拟上传');

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

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 视频数据存储
let videos = [];

// 预置一些测试视频
const presetVideos = [
    {
        id: 'preset-1',
        title: '示例视频 1 - 美丽风景',
        originalName: 'sample-1.mp4',
        size: 15728640,
        mimeType: 'video/mp4',
        uploadDate: new Date().toISOString(),
        duration: '0:15',
        url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
        isPreset: true
    },
    {
        id: 'preset-2', 
        title: '示例视频 2 - 城市夜景',
        originalName: 'sample-2.mp4',
        size: 20971520,
        mimeType: 'video/mp4',
        uploadDate: new Date().toISOString(),
        duration: '0:10',
        url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
        isPreset: true
    },
    {
        id: 'preset-3',
        title: '示例视频 3 - 野生动物',
        originalName: 'sample-3.mp4',
        size: 12582912,
        mimeType: 'video/mp4', 
        uploadDate: new Date().toISOString(),
        duration: '0:12',
        url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
        isPreset: true
    }
];

// 初始化时添加预置视频
presetVideos.forEach(video => {
    if (!videos.find(v => v.id === video.id)) {
        videos.push(video);
    }
});

// 工具函数
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ==================== API 路由 ====================

// 健康检查
app.get('/api/health', (req, res) => {
    console.log('✅ 健康检查通过');
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        service: '视频服务器 API',
        version: '1.0.0-stable',
        storage: '内存存储',
        videos_count: videos.length,
        preset_videos: presetVideos.length
    });
});

// 获取所有视频
app.get('/api/videos', (req, res) => {
    try {
        console.log('📋 获取视频列表');
        
        const videoList = videos.map(video => ({
            id: video.id,
            title: video.title,
            originalName: video.originalName,
            size: video.size,
            formattedSize: formatFileSize(video.size),
            mimeType: video.mimeType,
            uploadDate: video.uploadDate,
            duration: video.duration,
            url: video.url,
            isPreset: video.isPreset || false
        }));

        res.json({
            success: true,
            count: videos.length,
            preset_count: presetVideos.length,
            user_count: videos.length - presetVideos.length,
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

// 上传视频（模拟版）
app.post('/api/upload', (req, res) => {
    console.log('📤 上传请求收到');
    console.log('请求体类型:', req.headers['content-type']);
    console.log('请求体大小:', req.headers['content-length']);
    
    try {
        const { title, filename = 'uploaded-video.mp4' } = req.body;
        
        // 创建模拟视频数据
        const newVideo = {
            id: uuidv4(),
            title: title || `用户上传视频_${new Date().toLocaleString()}`,
            originalName: filename,
            size: Math.floor(Math.random() * 5000000) + 1000000, // 1-6MB 随机大小
            mimeType: 'video/mp4',
            uploadDate: new Date().toISOString(),
            duration: formatDuration(Math.floor(Math.random() * 120) + 30), // 30-150秒随机时长
            url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
            isPreset: false
        };

        // 添加到内存存储（放在预置视频前面）
        videos.unshift(newVideo);

        console.log('✅ 模拟上传成功:', newVideo.title);

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
                url: newVideo.url,
                isPreset: false
            }
        });

    } catch (error) {
        console.error('上传错误:', error);
        res.status(500).json({
            success: false,
            message: '上传失败: ' + error.message
        });
    }
});

// 获取单个视频信息
app.get('/api/videos/:id', (req, res) => {
    try {
        const videoId = req.params.id;
        console.log('🔍 获取视频信息:', videoId);
        
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
                url: video.url,
                isPreset: video.isPreset || false
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

// 删除视频（只能删除用户上传的）
app.delete('/api/videos/:id', (req, res) => {
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

        // 检查是否是预置视频
        if (video.isPreset) {
            return res.status(400).json({
                success: false,
                message: '不能删除预置示例视频'
            });
        }

        // 从内存中删除
        const deletedVideo = videos.splice(videoIndex, 1)[0];

        console.log('✅ 视频删除成功:', deletedVideo.title);

        res.json({
            success: true,
            message: '视频删除成功',
            deletedVideo: {
                id: deletedVideo.id,
                title: deletedVideo.title
            }
        });

    } catch (error) {
        console.error('删除视频错误:', error);
        res.status(500).json({
            success: false,
            message: '删除失败: ' + error.message
        });
    }
});

// 清空用户上传的视频
app.delete('/api/videos', (req, res) => {
    try {
        // 只删除非预置视频
        const userVideosCount = videos.filter(v => !v.isPreset).length;
        videos = videos.filter(v => v.isPreset);
        
        console.log('🧹 清空用户视频:', userVideosCount, '个');

        res.json({
            success: true,
            message: `已清空所有用户上传视频 (${userVideosCount} 个)`,
            remaining_preset_videos: presetVideos.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: '清空失败: ' + error.message
        });
    }
});

// 诊断接口
app.get('/api/debug', (req, res) => {
    res.json({
        status: 'debug',
        server: '运行正常',
        timestamp: new Date().toISOString(),
        memory_usage: process.memoryUsage(),
        videos: {
            total: videos.length,
            preset: presetVideos.length,
            user: videos.length - presetVideos.length
        }
    });
});

// 根路径
app.get('/', (req, res) => {
    res.json({
        message: '视频服务器 API - 稳定运行版',
        timestamp: new Date().toISOString(),
        status: '稳定运行',
        mode: '内存存储 + 模拟上传',
        features: {
            preset_videos: '3个示例视频',
            upload_simulation: '模拟上传功能',
            video_playback: '支持视频播放',
            video_management: '支持删除用户视频'
        },
        endpoints: {
            'GET /api/health': '健康检查',
            'GET /api/videos': '获取视频列表',
            'GET /api/videos/:id': '获取单个视频',
            'POST /api/upload': '上传视频（模拟）',
            'DELETE /api/videos/:id': '删除用户视频',
            'DELETE /api/videos': '清空用户视频',
            'GET /api/debug': '系统诊断'
        }
    });
});

// 错误处理中间件
app.use((error, req, res, next) => {
    console.error('服务器错误:', error);
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
            '/api/videos', 
            '/api/upload',
            '/api/debug'
        ]
    });
});

// 启动服务器
app.listen(PORT, '0.0.0.0', () => {
    console.log('🚀 视频服务器启动成功 - 稳定版');
    console.log('📍 端口:', PORT);
    console.log('💾 存储: 内存模式');
    console.log('🎬 预置视频:', presetVideos.length, '个');
    console.log('✅ 状态: 稳定运行');
    console.log('=================================');
});

module.exports = app;
