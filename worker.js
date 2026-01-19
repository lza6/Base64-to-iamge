/**
 * Base64 图像转换器 - Web Worker (增强版)
 * 支持分块进度汇报、全格式处理
 */

self.onmessage = async function (e) {
    const { action, data, options } = e.data;

    try {
        switch (action) {
            case 'extractBase64':
                handleExtractBase64(data);
                break;
            case 'generateLargeSample':
                handleGenerateLargeSample(data);
                break;
            case 'convertToBase64':
                handleConvertToBase64(data);
                break;
            default:
                self.postMessage({ error: '未知操作: ' + action });
        }
    } catch (error) {
        self.postMessage({ error: error.message });
    }
};

/**
 * 提取 Base64 数据 (带进度)
 */
function handleExtractBase64(text) {
    const startTime = performance.now();
    const totalLen = text.length;

    // 进度汇报函数
    const report = (p, label) => self.postMessage({ action: 'progress', percent: p, label });

    report(5, '正在清理白名单字符...');
    // 由于正则匹配大文件比较耗时且难以切分进度，我们采用分段匹配思路
    // 这里简化处理：针对极大型文件，先做一次正则

    const mimeTypes = {
        '/9j/': 'image/jpeg',
        'iVBORw': 'image/png',
        'R0lGOD': 'image/gif',
        'UklGR': 'image/webp',
        'PHN2Zz': 'image/svg+xml',
        'Qk02': 'image/bmp',
        'AAABAA': 'image/x-icon'
    };

    const patterns = [
        { name: 'Data URI', regex: /data:image\/([a-zA-Z0-9+.-]+);base64,([A-Za-z0-9+/=]{20,})/g },
        { name: 'HTML img', regex: /<img[^>]+src\s*=\s*["']data:image\/([a-zA-Z0-9+.-]+);base64,([A-Za-z0-9+/=]{20,})["'][^>]*>/gi },
        { name: 'CSS url', regex: /url\s*\(\s*["']?data:image\/([a-zA-Z0-9+.-]+);base64,([A-Za-z0-9+/=]{20,})["']?\s*\)/gi }
    ];

    let results = [];

    // 模拟进度 (因为正则 exec 无法直接获取中间进度，我们分模式汇报)
    for (let i = 0; i < patterns.length; i++) {
        const pattern = patterns[i];
        report(10 + (i * 20), `正在匹配 ${pattern.name} 模式...`);

        const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
        let match;
        while ((match = regex.exec(text)) !== null) {
            results.push({
                base64: match[2].replace(/[\s\r\n]/g, ''),
                mimeType: `image/${match[1]}`,
                source: pattern.name
            });
        }
    }

    if (results.length === 0) {
        report(80, '尝试纯内容解析...');
        const cleaned = text.replace(/[\s\r\n]/g, '');
        if (/^[A-Za-z0-9+/=]+$/.test(cleaned) && cleaned.length > 20) {
            let mime = 'image/png';
            for (const [prefix, m] of Object.entries(mimeTypes)) {
                if (cleaned.startsWith(prefix)) { mime = m; break; }
            }
            results.push({ base64: cleaned, mimeType: mime, source: '纯内容' });
        }
    }

    report(100, '提取完成');
    const endTime = performance.now();
    self.postMessage({
        action: 'extractBase64Result',
        results,
        performance: { time: endTime - startTime, size: text.length }
    });
}

/**
 * 分块生成大数据 (带精准百分比)
 */
function handleGenerateLargeSample(sizeMB) {
    const startTime = performance.now();
    const targetLength = sizeMB * 1024 * 1024;
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

    let result = 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA';
    const chunkSize = 512 * 1024; // 每次生成 0.5MB
    const totalChunks = Math.ceil(targetLength / chunkSize);

    // 预生成一个 chunk 模板
    let chunkTemplate = '';
    for (let i = 0; i < chunkSize; i++) {
        chunkTemplate += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    for (let i = 0; i < totalChunks; i++) {
        result += chunkTemplate;
        // 每 4 个 chunk 汇报一次进度
        if (i % 4 === 0 || i === totalChunks - 1) {
            self.postMessage({
                action: 'progress',
                percent: Math.round((i / totalChunks) * 100),
                label: `正在生成数据: ${((i * chunkSize) / (1024 * 1024)).toFixed(1)}MB / ${sizeMB}MB`
            });
        }
    }

    const endTime = performance.now();
    self.postMessage({
        action: 'generateLargeSampleResult',
        base64: result.substring(0, targetLength + 40),
        performance: { time: endTime - startTime, size: result.length }
    });
}

/**
 * 图像转 Base64 (带百分比)
 */
function handleConvertToBase64(arrayBuffer) {
    const startTime = performance.now();
    const bytes = new Uint8Array(arrayBuffer);
    const len = bytes.byteLength;
    let binary = '';

    const chunkSize = 65536; // 64KB chunks
    const totalChunks = Math.ceil(len / chunkSize);

    for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, len);
        const sub = bytes.subarray(start, end);

        // 转换二进制
        let chunkBinary = '';
        for (let j = 0; j < sub.length; j++) {
            chunkBinary += String.fromCharCode(sub[j]);
        }
        binary += chunkBinary;

        if (i % 20 === 0 || i === totalChunks - 1) {
            self.postMessage({
                action: 'progress',
                percent: Math.round((i / totalChunks) * 100),
                label: `正在编码: ${((end) / (1024 * 1024)).toFixed(1)}MB / ${(len / (1024 * 1024)).toFixed(1)}MB`
            });
        }
    }

    const base64 = btoa(binary);
    const endTime = performance.now();

    self.postMessage({
        action: 'convertToBase64Result',
        base64: base64,
        performance: { time: endTime - startTime, size: len }
    });
}
