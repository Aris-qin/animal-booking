// ==================== 基础配置 ====================

// 字母表，用于生成行号
const rowLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// 区域配置：固定笼位ID，不再动态迁移
const areaConfigs = [
    {
        containerId: 'mice-area-a',
        areaName: '小鼠区域A',
        prefix: '1',
        rows: 8,
        cols: 3,
        type: 'mouse'
    },
    {
        containerId: 'mice-area-b',
        areaName: '小鼠区域B',
        prefix: '2',
        rows: 8,
        cols: 4,
        type: 'mouse'
    },
    {
        containerId: 'mice-area-c',
        areaName: '小鼠区域C',
        prefix: '3',
        rows: 8,
        cols: 4,
        type: 'mouse'
    },
    {
        containerId: 'rats-area',
        areaName: '大鼠区域',
        prefix: '4',
        rows: 5,
        cols: 3,
        type: 'rat'
    }
];

// GitHub配置
let GITHUB_USER = 'Aris-qin';
let GITHUB_REPO = 'animal-booking';
let GITHUB_TOKEN = localStorage.getItem('github_token') || null;

if (!GITHUB_TOKEN) {
    GITHUB_TOKEN = prompt(
        '请输入你的 GitHub Personal Access Token:\n' +
        '(从 https://github.com/settings/tokens 获取)\n\n' +
        '如果取消，将只使用本地存储。'
    );

    if (GITHUB_TOKEN) {
        localStorage.setItem('github_token', GITHUB_TOKEN);
    } else {
        alert('未提供 Token，系统将使用本地存储模式');
        GITHUB_TOKEN = null;
    }
}

const DATA_FILE = 'cageData.json';
const API_URL = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${DATA_FILE}`;
const SYNC_INTERVAL = 5000;

// ==================== 全局变量 ====================

let cageData = {};
let currentEditingCage = null;
let batchMode = false;
let selectedCages = new Set();
let lastSync = 0;
let isSaving = false;

// ==================== 工具函数 ====================

// UTF-8 转 Base64，支持中文
function utf8ToBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    bytes.forEach(byte => {
        binary += String.fromCharCode(byte);
    });
    return btoa(binary);
}

// Base64 转 UTF-8，支持中文
function base64ToUtf8(b64) {
    const cleanBase64 = b64.replace(/\n/g, '').replace(/\r/g, '');
    const binary = atob(cleanBase64);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
}

// 生成所有合法笼位ID集合
function getValidCageIdSet() {
    const validIds = new Set();

    areaConfigs.forEach(config => {
        for (let row = 0; row < config.rows; row++) {
            const rowLetter = rowLetters[row];

            for (let col = 1; col <= config.cols; col++) {
                validIds.add(`${config.prefix}-${rowLetter}${col}`);
            }
        }
    });

    return validIds;
}

// 获取笼位所在区域配置
function getAreaConfigByCageId(cageId) {
    const prefix = String(cageId).split('-')[0];
    return areaConfigs.find(config => config.prefix === prefix) || null;
}

// 校验笼位ID是否存在
function isValidCageId(cageId) {
    return getValidCageIdSet().has(cageId);
}

// 清理JSON中不存在的笼位数据
function sanitizeCageData(rawData) {
    const validIds = getValidCageIdSet();
    const cleaned = {};

    Object.keys(rawData || {}).forEach(cageId => {
        if (validIds.has(cageId)) {
            cleaned[cageId] = rawData[cageId];
        } else {
            console.warn(`[数据清理] 忽略不存在的笼位ID: ${cageId}`);
        }
    });

    return cleaned;
}

// 排序笼位ID
function sortCageIds(cageIds) {
    return cageIds.sort((a, b) => {
        const parseCageId = id => {
            const parts = String(id).split('-');
            if (parts.length !== 2) return null;

            const prefix = parseInt(parts[0], 10);
            const match = parts[1].match(/^([A-Z]+)(\d+)$/);
            if (!match) return null;

            return {
                prefix,
                rowChar: match[1],
                col: parseInt(match[2], 10)
            };
        };

        const pa = parseCageId(a);
        const pb = parseCageId(b);

        if (!pa || !pb) return String(a).localeCompare(String(b));

        if (pa.prefix !== pb.prefix) {
            return pa.prefix - pb.prefix;
        }

        if (pa.rowChar !== pb.rowChar) {
            return pa.rowChar.localeCompare(pb.rowChar);
        }

        return pa.col - pb.col;
    });
}

// ==================== GitHub 数据操作 ====================

async function loadData() {
    console.log('[加载] 开始加载数据...');

    try {
        if (!GITHUB_TOKEN) {
            const cached = localStorage.getItem('cageData');
            cageData = cached ? JSON.parse(cached) : {};
            cageData = sanitizeCageData(cageData);
            console.log('✓ 从本地缓存加载数据');
            return;
        }

        const response = await fetch(API_URL, {
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (response.status === 404) {
            console.log('[加载] GitHub数据文件不存在，初始化为空');
            cageData = {};
            localStorage.setItem('cageData', JSON.stringify(cageData));
            return;
        }

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`GitHub API错误: ${response.status} - ${errorText}`);
        }

        const fileData = await response.json();

        if (!fileData || !fileData.content) {
            cageData = {};
            return;
        }

        const decodedContent = base64ToUtf8(fileData.content);
        const parsedData = JSON.parse(decodedContent || '{}');

        // 关键：这里只清理非法ID，不再迁移行号
        cageData = sanitizeCageData(parsedData);

        localStorage.setItem('cageData', JSON.stringify(cageData));

        console.log('✓ 从GitHub加载数据成功');

    } catch (e) {
        console.error('✗ GitHub加载失败:', e);

        try {
            const cached = localStorage.getItem('cageData');
            cageData = cached ? JSON.parse(cached) : {};
            cageData = sanitizeCageData(cageData);
            console.log('✓ 使用本地缓存数据');
        } catch (cacheError) {
            console.error('✗ 本地缓存也无法读取:', cacheError);
            cageData = {};
        }
    }
}

async function saveData(force = false) {
    cageData = sanitizeCageData(cageData);
    localStorage.setItem('cageData', JSON.stringify(cageData));

    if (!GITHUB_TOKEN) {
        console.log('[保存] 无GitHub Token，仅保存到本地');
        return;
    }

    if (!force && Date.now() - lastSync < SYNC_INTERVAL) {
        console.log('[保存] 本地已保存，GitHub上传防抖中');
        return;
    }

    if (isSaving) {
        console.log('[保存] 当前已有保存任务，跳过本次');
        return;
    }

    isSaving = true;

    try {
        console.log('[保存] 开始上传到GitHub...');

        const getResponse = await fetch(API_URL, {
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        let sha = null;

        if (getResponse.ok) {
            const fileData = await getResponse.json();
            sha = fileData.sha || null;
        } else if (getResponse.status !== 404) {
            const errorText = await getResponse.text();
            throw new Error(`获取GitHub文件SHA失败: ${getResponse.status} - ${errorText}`);
        }

        const rawJsonContent = JSON.stringify(cageData, null, 2);
        const base64Content = utf8ToBase64(rawJsonContent);

        const requestBody = {
            message: `更新笼位数据 ${new Date().toLocaleString('zh-CN')}`,
            content: base64Content
        };

        if (sha) {
            requestBody.sha = sha;
        }

        const updateResponse = await fetch(API_URL, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Content-Type': 'application/json',
                'Accept': 'application/vnd.github.v3+json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!updateResponse.ok) {
            const errorData = await updateResponse.json();
            throw new Error(errorData.message || 'GitHub上传失败');
        }

        lastSync = Date.now();
        console.log('✓ 数据已上传到GitHub');

    } catch (e) {
        console.error('✗ GitHub保存失败:', e);
    } finally {
        isSaving = false;
    }
}

// ==================== 笼位生成 ====================

function generateAllCages() {
    areaConfigs.forEach(config => generateCagesForArea(config));
}

function generateCagesForArea(config) {
    const container = document.getElementById(config.containerId);

    if (!container) {
        console.error(`找不到容器: ${config.containerId}`);
        return;
    }

    container.innerHTML = '';

    for (let row = 0; row < config.rows; row++) {
        const rowLetter = rowLetters[row];

        for (let col = 1; col <= config.cols; col++) {
            const cageId = `${config.prefix}-${rowLetter}${col}`;
            const cage = createCageElement(cageId, config.type, config.containerId);
            container.appendChild(cage);
        }
    }
}

function createCageElement(id, type, area) {
    const cage = document.createElement('div');

    cage.className = 'cage';
    cage.dataset.cageId = id;
    cage.dataset.type = type;
    cage.dataset.area = area;

    cage.innerHTML = `
        <div class="cage-label">${id}</div>
        <div class="cage-status status-empty">空闲</div>
        <div class="user-info">暂无使用者</div>
        <div class="date-info">-</div>
        <div class="duration-bar">
            <div class="duration-fill" style="width: 0%"></div>
        </div>
    `;

    cage.addEventListener('click', function(e) {
        e.stopPropagation();

        if (batchMode) {
            toggleCageSelection(id);
        } else {
            openSingleModal(id);
        }
    });

    return cage;
}

// ==================== 批量模式 ====================

function toggleBatchMode() {
    batchMode = !batchMode;

    const controls = document.getElementById('batchControls');
    const button = document.getElementById('batchModeBtn');
    const btnText = document.getElementById('batchModeText');

    if (batchMode) {
        controls.classList.add('active');
        button.style.background = 'linear-gradient(135deg, #ff6b6b 0%, #ee5a52 100%)';
        btnText.textContent = '退出批量模式';

        document.querySelectorAll('.cage').forEach(cage => {
            cage.style.cursor = 'crosshair';
        });
    } else {
        controls.classList.remove('active');
        button.style.background = '';
        btnText.textContent = '进入批量选择模式';

        document.querySelectorAll('.cage').forEach(cage => {
            cage.style.cursor = 'pointer';
            cage.classList.remove('selected');
        });

        clearSelection();
    }
}

function toggleCageSelection(cageId) {
    if (!isValidCageId(cageId)) {
        alert(`无效笼位: ${cageId}`);
        return;
    }

    const cageElement = document.querySelector(`[data-cage-id="${cageId}"]`);
    const data = cageData[cageId];

    if (data && data.userName) {
        alert(`笼位 ${cageId} 已被 ${data.userName} 占用，不能选择！`);
        return;
    }

    if (selectedCages.has(cageId)) {
        selectedCages.delete(cageId);
        cageElement.classList.remove('selected');
    } else {
        selectedCages.add(cageId);
        cageElement.classList.add('selected');
    }

    updateSelectionInfo();
}

function updateSelectionInfo() {
    const info = document.getElementById('selectionInfo');
    const count = document.getElementById('selectedCount');
    const listContainer = document.getElementById('selectedCagesList');

    info.textContent = `已选择 ${selectedCages.size} 个笼位`;
    count.textContent = selectedCages.size;

    if (selectedCages.size > 0) {
        const sortedCages = sortCageIds(Array.from(selectedCages));
        listContainer.innerHTML = sortedCages
            .map(cageId => `<span class="selected-cage-tag">${cageId}</span>`)
            .join('');
    } else {
        listContainer.innerHTML = '<span style="color: #999;">暂未选择任何笼位</span>';
    }
}

function clearSelection() {
    selectedCages.forEach(cageId => {
        const cageElement = document.querySelector(`[data-cage-id="${cageId}"]`);
        if (cageElement) {
            cageElement.classList.remove('selected');
        }
    });

    selectedCages.clear();
    updateSelectionInfo();
}

function batchBookCages() {
    if (selectedCages.size === 0) {
        alert('请先选择要预约的笼位！');
        return;
    }

    document.getElementById('batchModal').style.display = 'block';
    updateSelectionInfo();
}

// ==================== 模态框 ====================

function openSingleModal(cageId) {
    if (batchMode) return;

    if (!isValidCageId(cageId)) {
        alert(`无效笼位: ${cageId}`);
        return;
    }

    currentEditingCage = cageId;

    const data = cageData[cageId];
    const modal = document.getElementById('singleCageModal');
    const title = document.getElementById('singleModalTitle');

    title.textContent = `笼位 ${cageId} 信息`;

    if (data) {
        document.getElementById('singleUserName').value = data.userName || '';
        document.getElementById('singleStartDate').value = data.startDate || '';
        document.getElementById('singleEndDate').value = data.endDate || '';
        document.getElementById('singleAnimalType').value = data.animalType || '';
        document.getElementById('singleExperimentDesc').value = data.experimentDesc || '';
    } else {
        document.getElementById('singleCageForm').reset();
        document.getElementById('singleStartDate').value = new Date().toISOString().split('T')[0];

        const areaConfig = getAreaConfigByCageId(cageId);
        document.getElementById('singleAnimalType').value = areaConfig ? areaConfig.type : '';
    }

    modal.style.display = 'block';
}

function closeSingleModal() {
    document.getElementById('singleCageModal').style.display = 'none';
    currentEditingCage = null;
}

function closeBatchModal() {
    document.getElementById('batchModal').style.display = 'none';
}

// ==================== 显示更新 ====================

function updateCageDisplay(cageId) {
    const cageElement = document.querySelector(`[data-cage-id="${cageId}"]`);

    if (!cageElement) {
        return;
    }

    const data = cageData[cageId];

    const statusElement = cageElement.querySelector('.cage-status');
    const userInfoElement = cageElement.querySelector('.user-info');
    const dateInfoElement = cageElement.querySelector('.date-info');
    const durationFillElement = cageElement.querySelector('.duration-fill');

    if (!data || !data.userName) {
        statusElement.textContent = '空闲';
        statusElement.className = 'cage-status status-empty';
        userInfoElement.textContent = '暂无使用者';
        dateInfoElement.textContent = '-';
        durationFillElement.style.width = '0%';
        durationFillElement.className = 'duration-fill';
        cageElement.style.background = 'white';
        return;
    }

    const startDate = new Date(data.startDate);
    const today = new Date();

    today.setHours(0, 0, 0, 0);
    startDate.setHours(0, 0, 0, 0);

    const daysUsed = Math.max(
        0,
        Math.floor((today - startDate) / (1000 * 60 * 60 * 24))
    );

    let statusText;
    let statusClass;
    let durationClass;

    if (daysUsed <= 7) {
        statusText = `占用${daysUsed}天`;
        statusClass = 'status-occupied';
        durationClass = 'short-term';
    } else {
        statusText = `长期占用${daysUsed}天`;
        statusClass = 'status-long-term';
        durationClass = 'long-term';
    }

    statusElement.textContent = statusText;
    statusElement.className = `cage-status ${statusClass}`;
    userInfoElement.textContent = `使用者: ${data.userName}`;

    let dateText = `开始: ${data.startDate || '-'}`;

    if (data.endDate) {
        dateText += ` | 结束: ${data.endDate}`;
    }

    if (data.experimentDesc) {
        dateText += ` | ${data.experimentDesc}`;
    }

    dateInfoElement.textContent = dateText;

    const maxDays = 30;
    const percentage = Math.min((daysUsed / maxDays) * 100, 100);

    durationFillElement.style.width = `${percentage}%`;
    durationFillElement.className = `duration-fill ${durationClass}`;
}

function updateAllCages() {
    document.querySelectorAll('.cage').forEach(cageElement => {
        updateCageDisplay(cageElement.dataset.cageId);
    });
}

function updateStats() {
    const validIds = getValidCageIdSet();

    let occupiedCount = 0;
    let longTermCount = 0;

    Object.keys(cageData).forEach(cageId => {
        if (!validIds.has(cageId)) return;

        const data = cageData[cageId];

        if (data && data.userName) {
            occupiedCount++;

            const startDate = new Date(data.startDate);
            const today = new Date();

            today.setHours(0, 0, 0, 0);
            startDate.setHours(0, 0, 0, 0);

            const daysUsed = Math.max(
                0,
                Math.floor((today - startDate) / (1000 * 60 * 60 * 24))
            );

            if (daysUsed > 7) {
                longTermCount++;
            }
        }
    });

    const totalCages = validIds.size;
    const emptyCount = totalCages - occupiedCount;

    document.getElementById('statEmpty').textContent = emptyCount;
    document.getElementById('statOccupied').textContent = occupiedCount;
    document.getElementById('statLong').textContent = longTermCount;
}

// ==================== 表单提交 ====================

document.getElementById('singleCageForm').addEventListener('submit', function(e) {
    e.preventDefault();

    if (!currentEditingCage) return;

    const userName = document.getElementById('singleUserName').value.trim();
    const startDate = document.getElementById('singleStartDate').value;
    const endDate = document.getElementById('singleEndDate').value;
    const animalType = document.getElementById('singleAnimalType').value;
    const experimentDesc = document.getElementById('singleExperimentDesc').value.trim();

    if (!userName) {
        alert('请输入使用者姓名！');
        return;
    }

    if (!startDate) {
        alert('请选择开始使用日期！');
        return;
    }

    if (!animalType) {
        alert('请选择动物类型！');
        return;
    }

    cageData[currentEditingCage] = {
        userName,
        startDate,
        endDate,
        animalType,
        experimentDesc,
        lastUpdated: new Date().toISOString()
    };

    saveData(true);
    updateCageDisplay(currentEditingCage);
    updateStats();
    closeSingleModal();

    alert('笼位信息保存成功！');
});

document.getElementById('batchCageForm').addEventListener('submit', function(e) {
    e.preventDefault();

    if (selectedCages.size === 0) {
        alert('没有选中的笼位！');
        return;
    }

    const userName = document.getElementById('batchUserName').value.trim();
    const startDate = document.getElementById('batchStartDate').value;
    const endDate = document.getElementById('batchEndDate').value;
    const animalType = document.getElementById('batchAnimalType').value;
    const experimentDesc = document.getElementById('batchExperimentDesc').value.trim();

    if (!userName) {
        alert('请输入使用者姓名！');
        return;
    }

    if (!startDate) {
        alert('请选择开始使用日期！');
        return;
    }

    if (!animalType) {
        alert('请选择动物类型！');
        return;
    }

    const formData = {
        userName,
        startDate,
        endDate,
        animalType,
        experimentDesc,
        lastUpdated: new Date().toISOString()
    };

    selectedCages.forEach(cageId => {
        if (isValidCageId(cageId)) {
            cageData[cageId] = { ...formData };
        }
    });

    const count = selectedCages.size;

    saveData(true);
    selectedCages.forEach(updateCageDisplay);
    updateStats();
    clearSelection();
    closeBatchModal();

    alert(`成功预约 ${count} 个笼位！`);
});

// ==================== 终止和清空 ====================

function terminateSingleCage() {
    if (!currentEditingCage) return;

    if (confirm(`确定要终止笼位 ${currentEditingCage} 的占用吗？`)) {
        delete cageData[currentEditingCage];

        saveData(true);
        updateCageDisplay(currentEditingCage);
        updateStats();
        closeSingleModal();

        alert('笼位占用已终止！');
    }
}

function clearAllData() {
    if (confirm('确定要清空所有笼位数据吗？此操作不可恢复！')) {
        cageData = {};

        saveData(true);
        updateAllCages();
        updateStats();
        clearSelection();

        alert('所有数据已清空！');
    }
}

// ==================== 数据导出 ====================

function exportData() {
    const dataStr = JSON.stringify(cageData, null, 2);
    const dataBlob = new Blob([dataStr], {
        type: 'application/json; charset=utf-8'
    });

    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `动物房笼位数据_${new Date().toISOString().split('T')[0]}.json`;
    link.click();

    URL.revokeObjectURL(url);
}

// ==================== 模态框事件 ====================

window.addEventListener('click', function(e) {
    const singleModal = document.getElementById('singleCageModal');
    const batchModal = document.getElementById('batchModal');

    if (e.target === singleModal) {
        closeSingleModal();
    }

    if (e.target === batchModal) {
        closeBatchModal();
    }
});

// ==================== 初始化 ====================

async function init() {
    console.log('页面初始化中...');

    generateAllCages();
    await loadData();
    updateAllCages();
    updateStats();

    const today = new Date().toISOString().split('T')[0];

    const singleStartDate = document.getElementById('singleStartDate');
    const batchStartDate = document.getElementById('batchStartDate');

    if (singleStartDate) {
        singleStartDate.value = today;
    }

    if (batchStartDate) {
        batchStartDate.value = today;
    }

    console.log('页面初始化完成');

    setInterval(async () => {
        if (isSaving) return;

        await loadData();
        updateAllCages();
        updateStats();
    }, SYNC_INTERVAL);
}

document.addEventListener('DOMContentLoaded', init);
