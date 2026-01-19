/**
 * Base64 图像转换器 - 核心逻辑 (高性能版)
 * 支持 Web Worker 后台处理、双向互转、性能监控
 */

// ========================================
// 全局状态
// ========================================
const state = {
    currentImageData: null, // Data URL or Base64 string
    currentMimeType: null,
    currentFileName: null,
    isProcessing: false,
    mode: 'b2i', // 'b2i' (Base64 to Image) or 'i2b' (Image to Base64)
    worker: null
};

// ========================================
// DOM 元素
// ========================================
const elements = {
    perfBanner: document.getElementById('perfBanner'),
    perfSize: document.getElementById('perfSize'),
    perfTime: document.getElementById('perfTime'),
    perfSpeed: document.getElementById('perfSpeed'),
    modeTabs: document.querySelectorAll('.mode-tab'),
    dropZone: document.getElementById('dropZone'),
    dropTitle: document.getElementById('dropTitle'),
    dropDesc: document.getElementById('dropDesc'),
    fileInput: document.getElementById('fileInput'),
    base64Input: document.getElementById('base64Input'),
    copyBtn: document.getElementById('copyBtn'),
    charCount: document.getElementById('charCount'),
    exampleBtn: document.getElementById('exampleBtn'),
    exampleDropdown: document.getElementById('exampleDropdown'),
    exampleSizeBtns: document.querySelectorAll('#exampleDropdown button'),
    clearBtn: document.getElementById('clearBtn'),
    convertBtn: document.getElementById('convertBtn'),
    convertBtnText: document.getElementById('convertBtnText'),
    progressContainer: document.getElementById('progressContainer'),
    progressLabel: document.getElementById('progressLabel'),
    progressPercent: document.getElementById('progressPercent'),
    progressFill: document.getElementById('progressFill'),
    emptyState: document.getElementById('emptyState'),
    previewWrapper: document.getElementById('previewWrapper'),
    previewImage: document.getElementById('previewImage'),
    infoPanel: document.getElementById('infoPanel'),
    infoSize: document.getElementById('infoSize'),
    infoRatio: document.getElementById('infoRatio'),
    infoFormat: document.getElementById('infoFormat'),
    infoFileSize: document.getElementById('infoFileSize'),
    formatSelect: document.getElementById('formatSelect'),
    formatInfo: document.getElementById('formatInfo'),
    formatInfoText: document.getElementById('formatInfoText'),
    downloadBtn: document.getElementById('downloadBtn'),
    toast: document.getElementById('toast'),
    toastMessage: document.getElementById('toastMessage'),
    zoomBtn: document.getElementById('zoomBtn'),
    zoomModal: document.getElementById('zoomModal'),
    modalBackdrop: document.getElementById('modalBackdrop'),
    modalClose: document.getElementById('modalClose'),
    zoomImage: document.getElementById('zoomImage')
};

// ========================================
// Worker 管理器
// ========================================
const WorkerManager = {
    init() {
        // 检查协议
        if (window.location.protocol === 'file:') {
            console.warn('检测到本地文件协议，某些浏览器可能会禁用 Web Worker');
            UIController.showToast('本地模式运行：大文件处理可能受阻', 'warning');
        }

        if (window.Worker) {
            try {
                state.worker = new Worker('worker.js');
                state.worker.onmessage = this.handleMessage.bind(this);
                state.worker.onerror = (err) => {
                    console.error('Worker 初始化失败:', err);
                    UIController.showToast('Web Worker 启动失败 (可能是协议限制)', 'error');
                };
            } catch (e) {
                UIController.showToast('Web Worker 初始化异常', 'error');
            }
        } else {
            UIController.showToast('浏览器不支持 Web Worker', 'warning');
        }
    },

    handleMessage(e) {
        const { action, results, base64, size, performance: perf, error, percent, label } = e.data;

        if (error) {
            UIController.showToast('处理出错: ' + error, 'error');
            UIController.setProcessing(false);
            UIController.showProgress(false);
            return;
        }

        switch (action) {
            case 'progress':
                UIController.updateProgress(percent, label);
                break;
            case 'extractBase64Result':
                handleConverterResult(results, perf);
                break;
            case 'generateLargeSampleResult':
                handleSampleResult(base64, perf);
                break;
            case 'convertToBase64Result':
                handleImageToB64Result(base64, perf);
                break;
        }
    },

    post(action, data, options) {
        if (state.worker) {
            state.worker.postMessage({ action, data, options });
        } else {
            UIController.showToast('后台线程未就绪', 'error');
        }
    }
};

// ========================================
// UI 控制器
// ========================================
const UIController = {
    showProgress(show) {
        elements.progressContainer.classList.toggle('show', show);
    },

    updateProgress(percent, label) {
        elements.progressFill.style.width = percent + '%';
        elements.progressPercent.textContent = Math.round(percent) + '%';
        if (label) elements.progressLabel.textContent = label;
    },

    showPerf(perf) {
        if (!perf) {
            elements.perfBanner.style.display = 'none';
            return;
        }
        elements.perfBanner.style.display = 'flex';
        elements.perfSize.textContent = `计算大小: ${ImageProcessor.formatFileSize(perf.size || 0)}`;
        elements.perfTime.textContent = `总耗时: ${(perf.time / 1000).toFixed(3)}s`;

        const speed = (perf.size / (1024 * 1024)) / (perf.time / 1000);
        elements.perfSpeed.textContent = `速率: ${speed.toFixed(1)} MB/s`;
    },

    switchMode(mode) {
        state.mode = mode;
        elements.modeTabs.forEach(tab => tab.classList.toggle('active', tab.dataset.mode === mode));

        const isB2I = mode === 'b2i';
        elements.dropTitle.textContent = isB2I ? '拖拽文件到此处' : '拖拽图像到此处';
        elements.dropDesc.textContent = isB2I ? '支持文本、代码等包含 Base64 的文件' : '支持各种常见图像格式';
        elements.base64Input.placeholder = isB2I ? '在此粘贴 Base64 代码...' : '这里将显示生成的 Base64 代码...';
        elements.convertBtnText.textContent = isB2I ? '开始转换' : '生成 Base64';

        this.hidePreview();
        this.showPerf(null);
        elements.base64Input.value = '';
        elements.charCount.textContent = '0 字符';
    },

    showPreview(dataUrl, info, mimeType, fileSize) {
        elements.emptyState.style.display = 'none';
        elements.previewWrapper.style.display = 'flex';
        elements.infoPanel.style.display = 'block';
        elements.previewImage.src = dataUrl;
        elements.zoomImage.src = dataUrl;

        elements.infoSize.textContent = `${info.width} × ${info.height} px`;
        elements.infoRatio.textContent = info.ratioText;
        elements.infoFormat.textContent = ImageProcessor.getFormatName(mimeType);
        elements.infoFileSize.textContent = ImageProcessor.formatFileSize(fileSize);
    },

    hidePreview() {
        elements.emptyState.style.display = 'flex';
        elements.previewWrapper.style.display = 'none';
        elements.infoPanel.style.display = 'none';
    },

    showToast(message, type = 'info') {
        elements.toastMessage.textContent = message;
        elements.toast.className = 'toast show ' + type;
        setTimeout(() => elements.toast.classList.remove('show'), 3000);
    },

    setProcessing(processing) {
        state.isProcessing = processing;
        elements.convertBtn.disabled = processing;
        elements.convertBtn.classList.toggle('spinning', processing);
    }
};

// ========================================
// 业务逻辑处理
// ========================================

// 处理提取结果
async function handleConverterResult(results, perf) {
    if (!results || results.length === 0) {
        UIController.showToast('未检测到有效的 Base64 数据', 'error');
        UIController.setProcessing(false);
        UIController.showProgress(false);
        return;
    }

    const res = results[0];
    const dataUrl = `data:${res.mimeType};base64,${res.base64}`;

    try {
        const info = await ImageProcessor.getImageInfo(dataUrl);
        state.currentImageData = dataUrl;
        state.currentMimeType = res.mimeType;
        state.currentFileName = `export_${Date.now()}.${ImageProcessor.getExtension(res.mimeType)}`;

        UIController.showPreview(dataUrl, info, res.mimeType, res.base64.length * 0.75);
        UIController.showPerf({ ...perf, size: res.base64.length });
        UIController.showToast(`识别成功 (${res.source})`, 'success');
    } catch (e) {
        UIController.showToast('图像渲染失败', 'error');
    }

    UIController.setProcessing(false);
    UIController.showProgress(false);
}

// 处理示例结果
function handleSampleResult(base64, perf) {
    elements.base64Input.value = base64;
    elements.charCount.textContent = formatNumber(base64.length) + ' 字符';
    UIController.setProcessing(false);
    UIController.showProgress(false);
    UIController.showToast(`示例数据已生成 (${ImageProcessor.formatFileSize(base64.length)})`, 'success');
}

// 处理图像转 Base64 结果
function handleImageToB64Result(base64, perf) {
    elements.base64Input.value = `data:${state.currentMimeType};base64,${base64}`;
    elements.charCount.textContent = formatNumber(elements.base64Input.value.length) + ' 字符';
    UIController.showPerf(perf);
    UIController.setProcessing(false);
    UIController.showProgress(false);
    UIController.showToast('Base64 生成完毕', 'success');
}

// ========================================
// 核心逻辑集成
// ========================================

const ImageProcessor = {
    getImageInfo(dataUrl) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const w = img.naturalWidth, h = img.naturalHeight;
                const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
                const d = gcd(w, h);
                resolve({ width: w, height: h, ratioText: `${w / d}:${h / d}` });
            };
            img.onerror = () => reject();
            img.src = dataUrl;
        });
    },
    formatFileSize(b) {
        if (b < 1024) return b + ' B';
        if (b < 1048576) return (b / 1024).toFixed(2) + ' KB';
        return (b / 1048576).toFixed(2) + ' MB';
    },
    getFormatName(m) {
        const names = {
            'image/jpeg': 'JPEG',
            'image/png': 'PNG',
            'image/gif': 'GIF',
            'image/webp': 'WebP',
            'image/svg+xml': 'SVG 矢量',
            'image/bmp': 'BMP',
            'image/x-icon': 'ICO 图标'
        };
        return names[m] || m.split('/')[1]?.toUpperCase() || 'IMG';
    },
    getExtension(m) {
        const exts = {
            'image/jpeg': 'jpg',
            'image/png': 'png',
            'image/gif': 'gif',
            'image/webp': 'webp',
            'image/svg+xml': 'svg',
            'image/bmp': 'bmp',
            'image/x-icon': 'ico'
        };
        return exts[m] || 'png';
    }
};

// ========================================
// 事件绑定
// ========================================
function init() {
    WorkerManager.init();

    // 模式切换
    elements.modeTabs.forEach(tab => {
        tab.addEventListener('click', () => UIController.switchMode(tab.dataset.mode));
    });

    // 示例按钮
    elements.exampleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        elements.exampleDropdown.classList.toggle('show');
    });

    document.addEventListener('click', () => elements.exampleDropdown.classList.remove('show'));

    elements.exampleSizeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const size = btn.dataset.size;
            UIController.setProcessing(true);
            UIController.showProgress(true);
            UIController.updateProgress(50, '正在生成模拟数据...');

            if (size === 'small') {
                handleSampleResult(`data:image/webp;base64,UklGRmYBAABXRUJQVlA4IFoBAABwCwCdASoQABAAAwA6JQBOuAD7I97AAAD+/v38jD8p6O6O6O6O6O6O6O6O6O6O6O6O6O6O6O6O6O6O6O6O6O6O6O6O6O6O6O6O6O6O6O6O6O6O6O6O6O6O6O6O6O6O6O57f79ff73/f3++/33xe98XvfF73xe98XvfF73xe98XvfF73xe98XvfF73xe98XvfF73xe98XvfF73xe98XvfF73xe98XvfF73xe98XvfF73xe98XvfF73xe98XvfF73xe98XvfF73xe98XvfF7/A9f/mYAAAGS/qNfv9f7+p/qX6S/qS/qNfv9f7+YAAA`, { time: 10, size: 200 });
            } else {
                const mb = size === 'medium' ? 10 : 100;
                WorkerManager.post('generateLargeSample', mb);
            }
        });
    });

    // 文件处理
    const handleFile = async (file) => {
        if (state.mode === 'b2i') {
            const reader = new FileReader();
            reader.onload = (e) => {
                if (file.size < 2 * 1024 * 1024) { // < 2MB 则显示在框里
                    elements.base64Input.value = e.target.result;
                    elements.charCount.textContent = formatNumber(e.target.result.length) + ' 字符';
                }
                WorkerManager.post('extractBase64', e.target.result);
            };
            reader.readAsText(file);
        } else {
            const reader = new FileReader();
            reader.onload = (e) => {
                state.currentMimeType = file.type;
                WorkerManager.post('convertToBase64', e.target.result);
            };
            reader.readAsArrayBuffer(file);
        }
        UIController.setProcessing(true);
        UIController.showProgress(true);
        UIController.updateProgress(50, '后台处理中...');
    };

    elements.dropZone.addEventListener('click', () => elements.fileInput.click());
    elements.fileInput.addEventListener('change', (e) => e.target.files[0] && handleFile(e.target.files[0]));
    elements.dropZone.addEventListener('dragover', (e) => { e.preventDefault(); elements.dropZone.classList.add('drag-over'); });
    elements.dropZone.addEventListener('dragleave', () => elements.dropZone.classList.remove('drag-over'));
    elements.dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        elements.dropZone.classList.remove('drag-over');
        if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });

    // 转换按钮
    elements.convertBtn.addEventListener('click', () => {
        const val = elements.base64Input.value.trim();
        if (!val) return UIController.showToast('请输入内容', 'error');

        UIController.setProcessing(true);
        UIController.showProgress(true);
        UIController.updateProgress(50, '处理中...');

        if (state.mode === 'b2i') {
            WorkerManager.post('extractBase64', val);
        } else {
            // 图片转 Base64 逻辑已在 handleFile 中处理 ArrayBuffer
            // 如果是手动粘贴 URL (较少见)，此处暂不处理复杂解析
            UIController.showToast('请直接上传图像文件', 'info');
            UIController.setProcessing(false);
            UIController.showProgress(false);
        }
    });

    // 清空
    elements.clearBtn.addEventListener('click', () => {
        elements.base64Input.value = '';
        elements.charCount.textContent = '0 字符';
        UIController.hidePreview();
        UIController.showPerf(null);
    });

    // 字数统计
    elements.base64Input.addEventListener('input', () => {
        elements.charCount.textContent = formatNumber(elements.base64Input.value.length) + ' 字符';
    });

    // 弹窗
    elements.zoomBtn.addEventListener('click', () => {
        elements.zoomImage.src = state.currentImageData;
        elements.zoomModal.classList.add('show');
    });
    elements.modalClose.addEventListener('click', () => elements.zoomModal.classList.remove('show'));
    elements.modalBackdrop.addEventListener('click', () => elements.zoomModal.classList.remove('show'));

    // 复制按钮
    elements.copyBtn.addEventListener('click', async () => {
        const text = elements.base64Input.value;
        if (!text) return UIController.showToast('没有可复制的内容', 'info');

        try {
            await navigator.clipboard.writeText(text);
            UIController.showToast('内容已复制到剪贴板！', 'success');
        } catch (err) {
            // Fallback for older browsers
            elements.base64Input.select();
            document.execCommand('copy');
            UIController.showToast('已选中并复制', 'success');
        }
    });

    // 下载功能
    elements.downloadBtn.addEventListener('click', async () => {
        if (!state.currentImageData) return;

        const targetFormat = elements.formatSelect.value;
        let downloadUrl = state.currentImageData;
        let fileName = state.currentFileName;

        if (targetFormat !== 'original' && targetFormat !== state.currentMimeType) {
            UIController.showToast('正在转换格式...', 'info');
            try {
                const result = await convertImageFormat(state.currentImageData, targetFormat);
                downloadUrl = result.dataUrl;
                fileName = `export_${Date.now()}.${ImageProcessor.getExtension(targetFormat)}`;
            } catch (e) {
                UIController.showToast('格式转换失败，将按原图下载', 'warning');
            }
        }

        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = fileName;
        link.click();
    });
}

// 格式转换逻辑 (主线程 Canvas)
function convertImageFormat(dataUrl, targetFormat) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            // 对于 ICO，强制 32x32，否则按原图
            if (targetFormat === 'image/x-icon') {
                canvas.width = 32;
                canvas.height = 32;
            } else {
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
            }

            const ctx = canvas.getContext('2d');
            if (targetFormat === 'image/jpeg') {
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve({ dataUrl: canvas.toDataURL(targetFormat === 'image/x-icon' ? 'image/png' : targetFormat) });
        };
        img.onerror = reject;
        img.src = dataUrl;
    });
}

function formatNumber(n) { return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

document.addEventListener('DOMContentLoaded', init);
